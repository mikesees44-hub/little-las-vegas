import { capos, displayName, isFree } from '../characters';
import { applyEffects } from '../effects';
import { journal } from '../journal';
import type { Ctx } from '../ledger';
import { addSuspicion, readOf } from '../peopleRead';
import { inTheRanks } from '../rankView';
import { opinion } from '../relations';
import { scheduleInto } from '../schedule';
import { isFedKind, type Threat } from '../threats';
import type { Character, GameState } from '../types';
import { allRequests } from './audience';
import { FEED_BURN, compareOdds } from './gate';
import { armedTurn, bossWife, discoverGate, gateHolder, gateOdds, h01, hurtsHisSide, noteTell, seeOdds, slantOf, turnOf, type Turn } from './gateCore';
import { bookHours, freeOn } from './hours';
import { ensurePlanner } from './state';

/**
 * THE GATEKEEPER'S WEEK (CONSIGLIERE_GATEKEEPER.md), at the week's turn after the threats are planned and
 * the warnings are heard (engine.ts, beside readsWeek). A loyal gatekeeper does nothing here.
 *
 * A turned one, each move with his odds (gateCore.ts gateOdds: his wits, the boss's wits and nerves):
 *  - holds back the warnings that hurt his side (Tip.held: the meeting never reaches the boss);
 *  - books the boss at a planned hit's place and hour (Threat.gk: the threat's odds go up and it can kill);
 *    for the Bureau, a sit-down where they are listening;
 *  - fills next week's book with men nobody needed to see (hours gone);
 *  - holds back or stalls loyal men and pushes the plotters (audience.ts, read live; held ones are tracked here);
 *  - slants the brief (gateCore.ts slantOf, read live; tracked here to hold against the street).
 * Then the tells, each with the boss's odds of noticing (seeOdds): the man who was never seen complains, the
 * meeting at a strange place and hour, the brief and the street disagree, his wife or a loyal capo says
 * something. Each is a line in the brief and the Audience page, a line in Your File, and suspicion on the
 * gatekeeper in the people ledger (addSuspicion). Enough of it and the boss knows.
 * And the boss's own moves that take a week: feeding him lies, the month with somebody else at the door.
 */

const WASTERS = [
  'Mr. Pellegrino, about the Knights of Columbus raffle',
  'a cousin of a cousin with a liquor license problem',
  'the Holy Name Society, about the bus to Atlantic City',
  'a fellow selling insurance he says you need',
  'the boardwalk merchants, about the benches',
  'a widow from Rio Grande who wants her nephew in the union',
];

function tell(s: GameState, gk: Character, line: string, amount: number): void {
  noteTell(s, line);
  addSuspicion(s, gk.id, 'flip', amount, line, 'gate');
  journal(s, { c: 'intrigue', t: line, x: `What you noticed about ${displayName(gk)}, who keeps your door.`, p: [gk.id], src: 'gate' });
}

/** A threat the turned gatekeeper can book the boss into. */
function setupFits(s: GameState, turn: Turn, t: Threat): boolean {
  if (t.gk || t.schemeId || t.live || t.lure || t.dueDay === undefined || t.hour === undefined || t.due <= s.week) return false;
  if (turn.why === 'feds') return t.by === 'fbi' && (t.kind === 'fed_wire' || t.kind === 'fed_post' || t.kind === 'fed_under' || isFedKind(t.kind) && t.kind !== 'fed_gj' && t.kind !== 'fed_flip');
  if (t.kind !== 'hit' || t.targetId !== s.playerId) return false;
  return turn.why === 'plot' || t.by === turn.rival;
}

function bookSetup(s: GameState, gk: Character, turn: Turn, t: Threat): boolean {
  const abs = t.due * 7 + t.dueDay!;
  const hh = t.hour! === 0 ? 23 : t.hour! - 1;
  if (freeOn(s, abs) < 2) return false;
  const r = s.rivals.find((x) => x.id === t.by);
  const L = r ? s.characters[r.leaderId] : undefined;
  const fed = turn.why === 'feds';
  const place = fed ? 'the back booth at a diner on Pacific Avenue' : 'a room at a motel on Ocean Avenue';
  const name = fed ? 'a man about the liquor license' : L ? `${r!.shortName}'s people` : 'some people from out of town';
  s.hours = bookHours(s, abs, 2).hours;
  scheduleInto(s, {
    kind: 'plan', day: t.dueDay!, hour: hh, w: t.due,
    payload: { pk: 'meet', who: fed ? '' : L?.alive ? L.id : '', name, title: `Sit down with ${name}`, why: `At ${place}. ${gk.firstName} set it up: "they want to talk, and it has to be quiet."`, hours: 2, by: gk.id, su: t.id },
  });
  t.gk = gk.id;
  return true;
}

export function gateWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver || inTheRanks(s)) return;
  const P0 = s.planner;
  if (P0?.gx?.how === 'feed') feedWeek(ctx);
  if (P0?.cmp && s.week - P0.cmp.w >= 4) settleCompare(s);
  const a = armedTurn(s);
  if (a) armedWeek(s, a.c, a.turn);
  if (s.planner) tellsWeek(s);
}

function armedWeek(s: GameState, gk: Character, turn: Turn): void {
  const p = gateOdds(s, gk);
  const T = s.threats;
  const P = ensurePlanner(s);
  const hb = (P.hb ??= {});
  // 1. The warnings that hurt his side never reach the boss.
  for (const t of T?.tips ?? []) {
    if (t.status !== 'waiting' || t.seen || t.held || t.sourceId === gk.id || t.deadline < s.week || !hurtsHisSide(s, turn, t)) continue;
    if (h01(s, `hold|${t.id}|${gk.id}`) >= p) continue;
    t.held = gk.id;
    hb[`tip:${t.id}`] = s.week;
  }
  // 2. A hit planned on the boss: he books the boss at its place and hour.
  const see = seeOdds(s);
  for (const t of T?.threats ?? []) {
    if (!setupFits(s, turn, t) || h01(s, `setup|${t.id}|${gk.id}`) >= p) continue;
    if (!bookSetup(s, gk, turn, t)) continue;
    if (h01(s, `setuptell|${t.id}`) < see * 0.6) tell(s, gk, `${gk.firstName} booked you a sit-down at a strange place and a strange hour, with people you would not have asked to see.`, 10);
  }
  // 3. Next week's book filled with men nobody needed to see.
  if (h01(s, `waste|${s.week}|${gk.id}`) < p * 0.7) {
    const n = 1 + (h01(s, `waste2|${s.week}|${gk.id}`) < p * 0.4 ? 1 : 0);
    let made = 0;
    for (let i = 0; i < 6 && made < n; i++) {
      const d = 1 + Math.floor(h01(s, `wd|${s.week}|${i}`) * 4);
      const abs = (s.week + 1) * 7 + d;
      if (freeOn(s, abs) < 6) continue;
      const name = WASTERS[Math.floor(h01(s, `wn|${s.week}|${i}`) * WASTERS.length) % WASTERS.length];
      const h = 10 + Math.floor(h01(s, `wh|${s.week}|${i}`) * 5);
      s.hours = bookHours(s, abs, 2).hours;
      scheduleInto(s, { kind: 'plan', day: d, hour: h, w: s.week + 1, payload: { pk: 'audience', key: `waste:${s.week}:${i}`, who: '', name, title: `Audience: ${name}`, why: `${gk.firstName} says it matters.`, hours: 2, by: gk.id, waste: 1 } });
      made++;
    }
    if (made && h01(s, `wastetell|${s.week}`) < see * 0.4) tell(s, gk, `Your book is full of people you never asked to see, and ${gk.firstName} put every one of them there.`, 8);
  }
  // 4. The loyal men he held back at the door (read live off the list): when each was first held.
  let held: string[] = [];
  try { held = allRequests(s).filter((r) => r.held && !r.ref.tip).map((r) => r.key); } catch { held = []; }
  for (const k of Object.keys(hb)) if (!k.startsWith('tip:') && !held.includes(k)) delete hb[k];
  for (const k of held) hb[k] ??= s.week;
  // 5. The brief lines he slanted, to hold against the street.
  const sl = (P.sl ??= []);
  for (const t of T?.tips ?? []) {
    if (t.status === 'done' || t.status === 'missed' || t.status === 'ignored' || t.held || t.deadline < s.week) continue;
    const v = slantOf(s, t);
    const k = `${t.id}:${v === 'up' ? 'u' : 'd'}`;
    if (v && !sl.includes(k)) sl.push(k);
  }
  if (sl.length > 12) sl.splice(0, sl.length - 12);
  if (!Object.keys(hb).length) delete P.hb;
  if (!sl.length) delete P.sl;
}

function tellsWeek(s: GameState): void {
  const P = s.planner!;
  const see = seeOdds(s);
  const T = s.threats;
  const over = (id: string) => { const t = T?.tips.find((x) => x.id === id); return !t || t.status !== 'waiting' || t.deadline <= s.week; };
  // The man with the warning who was never seen.
  for (const [k, w] of Object.entries(P.hb ?? {})) {
    if (k.startsWith('tip:')) {
      const id = k.slice(4);
      if (!over(id)) continue;
      delete P.hb![k];
      const t = T?.tips.find((x) => x.id === id);
      const gk = t?.held ? s.characters[t.held] : undefined;
      if (!t || !gk?.alive) continue;
      if (h01(s, `complain|${id}`) < 0.6) tell(s, gk, `${t.sourceName} says he asked all week to see you about ${t.kind === 'hit' ? 'a hit' : 'what was coming'}. ${gk.firstName} told him you were busy.`, 16);
    } else if (s.week - w >= 2) {
      const g = gateHolder(s)?.c;
      if (!g || !turnOf(s, g.id)) { delete P.hb![k]; continue; }
      P.hb![k] = s.week;
      const r = allRequestsSafe(s).find((x) => x.key === k);
      if (r && h01(s, `complain|${k}|${s.week}`) < 0.45) tell(s, g, `${r.name} says he has asked to see you for weeks, and ${g.firstName} keeps telling him next week.`, 12);
    }
  }
  if (P.hb && !Object.keys(P.hb).length) delete P.hb;
  // The brief against the street.
  if (P.sl?.length) {
    P.sl = P.sl.filter((k) => {
      const [id, v] = k.split(':');
      if (!over(id)) return true;
      const t = T?.tips.find((x) => x.id === id);
      const g = gateHolder(s)?.c;
      if (t && g && h01(s, `street|${id}`) < see) tell(s, g, v === 'd' ? `The brief called ${t.sourceName}'s warning a rumor. The street says it was real.` : `The brief marked a story confirmed. Nothing came of it, and the street never believed it.`, 12);
      return false;
    });
    if (!P.sl.length) delete P.sl;
  }
  // His wife or a capo who loves the boss says something.
  const g = gateHolder(s)?.c;
  const turn = g ? turnOf(s, g.id) : undefined;
  if (g && turn && P.gx?.how !== 'feed' && h01(s, `mention|${s.week}|${g.id}`) < 0.04 + see * 0.08) {
    const w = bossWife(s);
    const speaker = w && w.id !== g.id && opinion(s, w.id, s.playerId) >= 10 ? w : capos(s).filter((c) => isFree(s, c) && c.id !== g.id && !turn.with.includes(c.id) && opinion(s, c.id, s.playerId) >= 40).sort((a, b) => opinion(s, b.id, s.playerId) - opinion(s, a.id, s.playerId))[0];
    if (speaker) tell(s, g, speaker.id === w?.id ? `${speaker.firstName}, over the dishes: "${g.firstName} never looks at me when he says you are busy."` : `${speaker.firstName}, on the way out: "Boss, I tried to get in to see you for two weeks. ${g.firstName} is a wall."`, 10);
  }
  // Enough of it, and the boss puts it together.
  if (g && turn && !(P.gx && P.gx.id === g.id) && (readOf(s, g.id)?.f ?? 0) >= 75) discoverGate(s, g.id, 'It all adds up');
}

function allRequestsSafe(s: GameState) {
  try { return allRequests(s); } catch { return []; }
}

/** Feeding him lies: the other side chases what the boss wrote, until they catch on. */
function feedWeek(ctx: Ctx): void {
  const s = ctx.s;
  const P = s.planner!;
  const gx = P.gx!;
  const c = s.characters[gx.id];
  const turn = c?.alive ? turnOf(s, c.id) : undefined;
  if (!c?.alive || !turn) return;
  if (h01(s, `burn|${s.week}|${c.id}`) < FEED_BURN) {
    delete gx.how;
    const line = `They caught on: what ${c.firstName} passes on is no good to them any more. The decision on him is yours again.`;
    noteTell(s, line);
    journal(s, { c: 'intrigue', t: `The lies through ${displayName(c)} stopped working`, x: line, p: [c.id], src: 'gate', mine: 1 });
    return;
  }
  if (turn.why === 'feds') applyEffects(ctx, [{ type: 'heat', bar: 'federal', amount: -2, label: `The Bureau chases what ${c.firstName} tells them` }], { label: 'Feeding the Bureau', because: 'feeding the Bureau lies', category: 'heat' });
  else if (turn.why === 'rival' && turn.rival) {
    const r = s.rivals.find((x) => x.id === turn.rival);
    if (r) { r.money = Math.max(0, r.money - 500); r.muscle = Math.max(0, r.muscle - 1); }
  } else for (const f of s.factions ?? []) if (f.leaderId === c.id || f.memberIds.includes(c.id)) f.stageWeek = s.week;
}

/** The month with somebody else at the door is out: the two books side by side. */
function settleCompare(s: GameState): void {
  const P = s.planner!;
  const cmp = P.cmp!;
  delete P.cmp;
  const old = s.characters[cmp.id];
  if (!old?.alive) return;
  const turn = turnOf(s, old.id);
  const now = gateHolder(s)?.c;
  const q = compareOdds(s) * (cmp.n > 0 ? 1 : 0.7);
  let line: string;
  if (turn && h01(s, `cmp|${s.week}|${old.id}`) < q) {
    line = `A month of ${now ? now.firstName : 'another man'}'s book against ${old.firstName}'s: the men, the hours, the grades on the brief. It is not the same book.`;
    if (!discoverGate(s, old.id, 'Two books side by side')) addSuspicion(s, old.id, 'flip', 15, line, 'gate');
  } else if (turn) {
    line = `A month of ${now ? now.firstName : 'another man'}'s book against ${old.firstName}'s. Close enough, maybe.`;
    addSuspicion(s, old.id, 'flip', 6, line, 'gate');
  } else {
    line = `A month of ${now ? now.firstName : 'another man'}'s book against ${old.firstName}'s: they read the same. ${old.firstName} is straight.`;
    addSuspicion(s, old.id, 'flip', -15, line, 'gate');
  }
  noteTell(s, line);
  journal(s, { c: 'intrigue', t: `The month is out: ${displayName(old)}'s book, side by side`, x: `${line} The door is on Standing Orders.`, p: [old.id], src: 'gate', mine: 1 });
}
