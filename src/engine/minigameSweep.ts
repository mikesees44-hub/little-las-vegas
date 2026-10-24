import { player } from './characters';
import { registerEventSource } from './events';
import type { Ctx } from './ledger';
import { beat, between, hashOf, mgEffect, mgOf, registerMinigame, type MgOption, type MgSession, type MinigameDef } from './minigame';
import type { Effect, EventInstance, GameState } from './types';

/**
 * BUG SWEEP: somebody thinks the social club is wired. A quick search game:
 * twelve places in the back room, a handful of looks (more with a good
 * enforcer), and a hot-or-cold feel from an ex-phone-company man's box of
 * tubes. Find it and choose: rip it out, or leave it and feed them garbage.
 * Whether there is a bug at all is the economy branch's HQ state.
 */

export const SPOTS = ['The wall phone', 'The lamp over the card table', 'The radiator', 'The picture of the Pope', 'The espresso machine', 'The jukebox', 'The back booth', 'A ceiling tile', 'The bar mirror', 'The coat rack', 'The cigar box', 'The telephone pole outside'];

export interface SweepData {
  bugAt: number;
  hasBug: boolean;
  looks: number;
  searched: number[];
  found?: boolean;
  feed?: boolean;
}

type WS = MgSession<SweepData>;

const pos = (i: number) => ({ x: i % 4, y: Math.floor(i / 4) });
function warmth(d: SweepData, i: number): 'hot' | 'warm' | 'cold' {
  if (!d.hasBug) return 'cold';
  const a = pos(i);
  const b = pos(d.bugAt);
  const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  return dist <= 1 ? 'hot' : dist <= 2 ? 'warm' : 'cold';
}

function opts(_s: GameState, ses: WS): MgOption[] {
  const d = ses.d;
  if (ses.phase === 'found') {
    return [
      { id: 'rip', label: 'Rip it out', detail: 'They will know you know. Whatever it heard stops here.' },
      { id: 'feed', label: 'Leave it, and feed them garbage', detail: 'Talk about Atlantic City deals that do not exist. −6 federal heat, −5 evidence; if they catch on, it gets worse.', tone: 'risky' },
    ];
  }
  return [
    ...SPOTS.map((sp, i) => ({ id: `search_${i}`, label: sp, disabled: d.searched.includes(i) ? 'Already searched' : undefined })),
    { id: 'stop', label: 'Call it off', detail: `${d.looks} look${d.looks === 1 ? '' : 's'} left.` },
  ];
}

function step(s: GameState, ses: WS, move: string): void {
  const d = ses.d;
  if (ses.phase === 'found') {
    d.feed = move === 'feed';
    beat(ses, d.feed ? 'You put the cover back on. Tomorrow you start talking about a casino in Atlantic City that does not exist.' : 'The wires come out in a fistful. Somebody in a van on Pacific Avenue takes his headphones off.', 'good');
    return end(s, ses);
  }
  if (move === 'stop') {
    beat(ses, 'You call it off.', 'info');
    return end(s, ses);
  }
  const i = Number(move.slice(7));
  d.searched.push(i);
  d.looks -= 1;
  if (d.hasBug && i === d.bugAt) {
    d.found = true;
    beat(ses, `${SPOTS[i]}: a microphone the size of a sugar cube, and a wire running into the wall.`, 'good');
    ses.phase = 'found';
    return;
  }
  const w = warmth(d, i);
  beat(ses, `${SPOTS[i]}: nothing. The needle on the box ${w === 'hot' ? 'jumps — very close' : w === 'warm' ? 'twitches — somewhere near' : 'doesn\'t move'}.`, w === 'cold' ? 'info' : 'quote');
  if (d.looks <= 0) {
    beat(ses, d.hasBug ? 'Out of time. The man with the box shrugs and packs up.' : 'Nothing anywhere. Either the club is clean, or the FBI is better than the phone company.', 'info');
    end(s, ses);
  }
}

function end(_s: GameState, ses: WS): void {
  const d = ses.d;
  const label = 'The sweep';
  const fx: Effect[] = [];
  if (d.found && d.feed) fx.push({ type: 'heat', bar: 'federal', amount: -6, label }, { type: 'evidence', charId: String(ses.params.boss), amount: -5, label });
  ses.done = true;
  ses.phase = 'end';
  ses.outcome = { title: label, text: d.found ? (d.feed ? 'You found the bug and left it in, talking for the microphone now.' : 'You found the bug and pulled it out.') : 'The sweep found nothing.', tone: d.found ? 'good' : 'mixed', effects: fx };
}

function auto(_s: GameState, ses: WS): string {
  const d = ses.d;
  if (ses.phase === 'found') return 'rip';
  // A methodical search: next to the warmest place so far, else the next unsearched spot.
  const hot = d.searched.filter((i) => warmth(d, i) !== 'cold').sort((a, b) => (warmth(d, a) === 'hot' ? -1 : 1) - (warmth(d, b) === 'hot' ? -1 : 1))[0];
  const free = SPOTS.map((_, i) => i).filter((i) => !d.searched.includes(i));
  if (hot !== undefined) {
    const near = free.filter((i) => Math.abs(pos(i).x - pos(hot).x) + Math.abs(pos(i).y - pos(hot).y) <= 1);
    if (near.length) return `search_${near[0]}`;
  }
  const order = [5, 2, 9, 0, 7, 11, 4, 10, 1, 6, 3, 8];
  return `search_${order.find((i) => free.includes(i)) ?? free[0]}`;
}

export const SWEEP: MinigameDef<SweepData> = {
  id: 'sweep',
  init: (s, ses) => {
    const hasBug = !!s.econ?.hq?.bug;
    const enforcer = s.council?.enforcer?.holderId ? s.characters[s.council.enforcer.holderId] : undefined;
    const looks = 4 + ((enforcer?.attributes.intrigue ?? 0) >= 60 ? 1 : 0) + (player(s).attributes.intrigue >= 70 ? 1 : 0);
    const bugAt = between(ses, 0, SPOTS.length - 1);
    return { d: { bugAt, hasBug, looks, searched: [] }, phase: 'search', intro: { title: 'The sweep', kicker: 'The back room, after closing', text: `An ex-phone-company man with a box of tubes stands in the middle of the room. Twelve places to look and time for ${looks}. The needle tells you warm or cold.`, scene: 'club' } };
  },
  options: opts,
  step,
  auto,
  apply: (ctx: Ctx, ses: WS) => {
    const e = ctx.s.econ;
    if (!ses.d.found || !e?.hq?.bug) return;
    e.hq.sweeps++;
    e.hq.lastSweep = ctx.s.week;
    e.hq.rumor = undefined;
    if (ses.d.feed) return; // left in place, talking for the microphone
    e.hq.bug = undefined;
    e.hq.found++;
    e.stats.bugsFound++;
    ctx.s.chronicle.push({ week: ctx.s.week, date: { ...ctx.s.date }, text: 'A federal bug was found in the headquarters and pulled out.', kind: 'heat' });
  },
};
registerMinigame(SWEEP);

export function buildSweepEvent(s: GameState): EventInstance {
  const iid = `ev${s.nextId++}`;
  const params = { boss: s.playerId, play: 1 };
  return {
    iid, defId: 'bug_sweep', week: s.week, mandatory: false, priority: 50,
    title: 'Somebody thinks the club is wired',
    text: s.econ?.hq?.rumor ?? 'A clicking on the back-room phone. A van on Pacific Avenue that never moves.',
    defaultChoiceId: 'ignore',
    choices: [
      { id: 'sweep', label: 'Sweep it yourself', detail: 'Twelve places, a few looks, a needle that says warm or cold.', because: 'swept the club for bugs', effects: [mgEffect('sweep', iid, params)] },
      { id: 'quick', label: 'Have the phone-company man do it', detail: 'Same odds, no say.', because: 'had the club swept', effects: [mgEffect('sweep', iid, { ...params, play: 0 })] },
      { id: 'ignore', label: 'Ignore it', because: 'ignored talk of a bug', effects: [] },
    ],
  };
}

let on = false;
export function ensureSweepSource(): void {
  if (on) return;
  on = true;
  registerEventSource((s) => {
    const mg = mgOf(s);
    if (s.week - (mg.offered.sweep ?? -999) < 12) return undefined;
    const rumor = !!s.econ?.hq?.rumor;
    if (!rumor && (s.heat.federal < 55 || hashOf(`${s.seed}:${s.week}:sweep`) % 100 >= 6)) return undefined;
    mg.offered.sweep = s.week;
    return buildSweepEvent(s);
  });
}
