import { beat, between, clamp, hit, mgEffect, registerMinigame, usd, type MgOption, type MgSession, type MinigameDef } from './minigame';
import type { Effect, EventInstance, GameState } from './types';

/**
 * ELECTION NIGHT: the wards come in, a batch at a time, on a chalkboard in
 * the back of the club. Between batches you can wait, put more cars on the
 * street to get out the vote, or lean on the count (abstract, and dangerous
 * if anyone looks). The politics branch provides the race; this module
 * provides the scene. Win and lose effects travel in `parts.win` / `parts.lose`.
 */

export interface Ward {
  name: string;
  /** Our candidate's true share in this ward (0..100). */
  share: number;
  votes: number;
  in: boolean;
}

export interface ElectionData {
  race: string;
  ours: string;
  theirs: string;
  wards: Ward[];
  batch: number;
  boost: number;
  leaned: boolean;
  caught?: boolean;
  spent: number;
}

type ES = MgSession<ElectionData>;

const WARDS = ['First Ward (the Boardwalk)', 'Second Ward (Pacific Ave)', 'Third Ward (the Crest)', 'Fourth Ward (West Wildwood)', 'North Wildwood', 'Rio Grande', 'Cape May Court House', 'Diamond Beach'];

function tally(d: ElectionData): { ours: number; theirs: number; inCount: number } {
  let ours = 0;
  let theirs = 0;
  for (const w of d.wards.filter((x) => x.in)) {
    ours += Math.round((w.votes * w.share) / 100);
    theirs += w.votes - Math.round((w.votes * w.share) / 100);
  }
  return { ours, theirs, inCount: d.wards.filter((x) => x.in).length };
}

function reveal(ses: ES): void {
  const d = ses.d;
  const next = d.wards.filter((w) => !w.in).slice(0, 2);
  for (const w of next) {
    w.share = clamp(w.share + d.boost, 5, 95);
    w.in = true;
    beat(ses, `${w.name}: ${d.ours} ${Math.round(w.share)}%, ${d.theirs} ${100 - Math.round(w.share)}%.`, w.share >= 50 ? 'good' : 'bad');
  }
  d.batch += 1;
}

function opts(s: GameState, ses: ES): MgOption[] {
  const d = ses.d;
  return [
    { id: 'wait', label: 'Wait for the next wards', detail: 'Coffee, cigarettes, the radio.' },
    { id: 'gotv', label: `More cars on the street (${usd(1000)})`, detail: 'Drive the old ladies to the polls: +2 in the wards still out.', cost: 1000, disabled: s.money - d.spent < 1000 ? 'Needs $1,000' : undefined },
    { id: 'lean', label: 'Lean on the count', detail: '+4 in the wards still out. If anyone looks closely: a scandal, heat, and the result may not stand (25%).', tone: 'dirty', disabled: d.leaned ? 'Once is already too much' : undefined },
  ];
}

function step(s: GameState, ses: ES, move: string): void {
  const d = ses.d;
  if (move === 'gotv') {
    d.spent += 1000;
    d.boost += 2;
    beat(ses, 'Twelve more Buicks go out with drivers who know every widow in the ward.', 'info');
  } else if (move === 'lean') {
    d.leaned = true;
    d.boost += 4;
    d.caught = hit(ses, 0.25);
    beat(ses, 'Some ballot boxes take the long way to the courthouse.', 'bad');
  }
  reveal(ses);
  if (d.wards.every((w) => w.in)) end(s, ses);
}

function end(_s: GameState, ses: ES): void {
  const d = ses.d;
  const t = tally(d);
  const won = t.ours > t.theirs && !d.caught;
  const fx: Effect[] = [];
  if (d.spent) fx.push({ type: 'money', amount: -d.spent, label: `${d.race}: cars on the street` });
  if (d.caught) fx.push({ type: 'heat', bar: 'local', amount: 10, label: `${d.race}: questions about the count` }, { type: 'heat', bar: 'federal', amount: 5, label: `${d.race}: questions about the count` });
  fx.push(...((won ? ses.parts.win : ses.parts.lose) ?? []));
  beat(ses, `Final: ${d.ours} ${t.ours.toLocaleString('en-US')}, ${d.theirs} ${t.theirs.toLocaleString('en-US')}.${d.caught ? ' The Leader has a photographer at the courthouse.' : ''}`, won ? 'good' : 'bad');
  ses.done = true;
  ses.phase = 'end';
  ses.outcome = { title: d.race, text: won ? `${d.ours} wins.` : d.caught && t.ours > t.theirs ? `${d.ours} won the count, but the result is challenged.` : `${d.theirs} wins.`, tone: won ? 'good' : 'bad', effects: fx, headline: { paper: 'Wildwood Leader', headline: won ? `${d.ours.toUpperCase()} WINS ${d.race.toUpperCase()}` : `${d.theirs.toUpperCase()} WINS ${d.race.toUpperCase()}`, body: d.caught ? 'Questions are being asked about ballot boxes in two wards.' : `The final count: ${t.ours.toLocaleString('en-US')} to ${t.theirs.toLocaleString('en-US')}.` } };
}

export const ELECTION: MinigameDef<ElectionData> = {
  id: 'election',
  init: (_s, ses) => {
    const n = clamp(Number(ses.params.wards ?? 6), 4, WARDS.length);
    const share = Number(ses.params.share ?? 50);
    const wards: Ward[] = WARDS.slice(0, n).map((name) => ({ name, share: clamp(share + between(ses, -9, 9), 10, 90), votes: between(ses, 600, 2400), in: false }));
    const d: ElectionData = { race: String(ses.params.race ?? 'the election'), ours: String(ses.params.ours ?? 'our man'), theirs: String(ses.params.theirs ?? 'the other man'), wards, batch: 0, boost: 0, leaned: false, spent: 0 };
    return { d, phase: 'count', intro: { title: 'Election night', kicker: d.race, text: `A chalkboard in the back of the club, a radio, a phone that will not stop ringing. ${d.ours} against ${d.theirs}. The polls have closed.`, scene: 'ward' } };
  },
  options: opts,
  step,
  auto: () => 'wait',
  odds: (_s, ses) => {
    const t = tally(ses.d);
    return [{ label: ses.d.ours, value: t.ours.toLocaleString('en-US'), tone: t.ours >= t.theirs ? 'good' : 'bad' }, { label: ses.d.theirs, value: t.theirs.toLocaleString('en-US') }, { label: 'Wards in', value: `${t.inCount} / ${ses.d.wards.length}` }];
  },
};
registerMinigame(ELECTION);

/** For the politics branch: an election-night popup. */
export function buildElectionNight(s: GameState, o: { race: string; ours: string; theirs: string; share: number; wards?: number; win?: Effect[]; lose?: Effect[] }): EventInstance {
  const iid = `ev${s.nextId++}`;
  const params = { race: o.race, ours: o.ours, theirs: o.theirs, share: o.share, wards: o.wards ?? 6, play: 1 };
  const parts = { win: o.win ?? [], lose: o.lose ?? [] };
  return {
    iid, defId: 'election_night', week: s.week, mandatory: true, priority: 85,
    title: `Election night: ${o.race}`,
    text: `${o.ours} against ${o.theirs}. The polls close at eight.`,
    defaultChoiceId: 'quiet',
    choices: [
      { id: 'watch', label: 'Watch the returns come in', because: `watched the returns: ${o.race}`, effects: [mgEffect('election', iid, params, parts)] },
      { id: 'quiet', label: 'Read it in the morning paper', because: `read about ${o.race} in the paper`, effects: [mgEffect('election', iid, { ...params, play: 0 }, parts)] },
    ],
  };
}
