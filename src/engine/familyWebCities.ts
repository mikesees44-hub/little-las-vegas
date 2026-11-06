import { displayName } from './characters';
import {
  alive, bond, ensureFamilies, famEvent, mintMan, note, pendingFam, sizeLine, slotOf, stanceTo, stanceWord,
  type FamLog, type FamState,
} from './familyWeb';
import type { FamKey } from './familyWebData';
import { FAMILY_BY_ID } from './familyWebData';
import { journal } from './journal';
import type { Ctx } from './ledger';
import { rand } from './rng';
import { logTalk } from './talks';
import type { Effect, EventInstance, GameState } from './types';

/**
 * THE CITIES (familyWebCitiesData.ts holds the people and the 1960 ties):
 * the Chicago Outfit, New Orleans, Florida and the Havana men. They are in
 * the families' web like everyone else (stance, ties, jockeying, asking each
 * other and the boss for help: familyWeb.ts); here each city also comes to
 * the boss now and then with its own business, by its stance and its ties.
 * Every choice says what it costs and its odds; results land in Your File.
 * Nobody of the boss's is harmed or handed over: the asks are money, a word,
 * a favor or a deal.
 */

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const free = (st: FamState, key: string, w: number) => (st.cd[key] ?? 0) <= w;
const pickOf = <T,>(st: FamState, xs: readonly T[]): T => xs[Math.floor(rand(st) * xs.length)];

/** A named man of the outfit (by role), made a full character as he walks in; his name either way. */
function envoyOf(s: GameState, f: FamKey, roles: ('underboss' | 'consigliere' | 'capo' | 'soldier')[], st: FamState, noteHas?: string): { name: string; actors: string[] } {
  const d = FAMILY_BY_ID[f];
  let slot = noteHas ? d.roster.findIndex((m) => !m.offstage && m.note?.includes(noteHas)) : -1;
  if (slot < 0) slot = slotOf(f, roles, Math.floor(rand(st) * 3));
  const c = slot >= 0 ? mintMan(s, f, slot) : undefined;
  return { name: c ? displayName(c) : d.boss ?? d.short, actors: c ? [c.id] : [] };
}

const view = (fam: FamKey, amount: number, reason: string): Effect => ({ type: 'fam', op: { op: 'view', fam, amount, reason } });
const tie = (a: FamKey, b: FamKey, kind: 'partners' | 'racket' | 'debt' | 'friends', strength: number, story: string, by?: 'a' | 'b'): Effect => ({ type: 'fam', op: { op: 'tie', a, b, kind, strength, story, ...(by ? { by } : {}) } });
const deal = (fam: FamKey, weekly: number, weeks: number, what: string): Effect => ({ type: 'fam', op: { op: 'deal', fam, weekly, weeks, what } });

/** A rumor that goes round (the families' news, the talk, and Your File as something heard). */
export function rumor(ctx: Ctx, st: FamState, t: string, tone: FamLog['tone'] = 'neutral'): void {
  const s = ctx.s;
  note(st, s.week, t, tone);
  logTalk(s, t, 'rivals');
  ctx.log.push(t);
  journal(s, { t, c: 'rivals', src: 'families', ln: 'diplomacy.board', k: 'heard' });
}

/* ------------------------------------------------------------------ */
/* Chicago                                                              */
/* ------------------------------------------------------------------ */

function chicagoVisit(s: GameState, st: FamState): EventInstance | undefined {
  if (!alive(s, 'chicago') || s.wars.some((w) => w.rival === ('chicago' as never))) return undefined;
  const stance = stanceTo(s, 'chicago').value;
  const sw = `Chicago's stance toward you: ${stanceWord(stance)} (${sizeLine(s, 'chicago')}).`;
  const kinds = [...(stance >= 0 ? ['point'] : []), 'wire', 'pension'] as const;
  const k = pickOf(st, kinds as readonly string[]);
  if (k === 'point') {
    const m = envoyOf(s, 'chicago', ['capo'], st, 'Las Vegas');
    const stake = 6000, weekly = 300;
    return famEvent(s, 'fam_chi', 'Chicago offers a point in a Strip casino',
      `${m.name} flies in from the desert for the Outfit: a quarter point in a Strip casino, ${fmt(stake)} in, ${fmt(weekly)} a week back from the count room for half a year. Chicago counts the money and nobody asks how. ${sw}`,
      [
        { id: 'in', label: `Buy the point (${fmt(stake)})`, detail: `Certain: ${fmt(weekly)} a week for 26 weeks, partners with Chicago (+6). Las Vegas's partners notice (+3).`, because: 'bought a point in a Strip casino from Chicago', effects: [{ type: 'money', amount: -stake, category: 'cost' }, deal('chicago', weekly, 26, 'a point in a Strip casino'), view('chicago', 6, 'Came in on the desert'), view('vegas', 3, 'A new point-holder'), tie('chicago', 'player', 'partners', 40, `Your house has held a point in Chicago's desert since ${s.date.y}.`)] },
        { id: 'pass', label: 'Thank him and pass', detail: 'Certain: Chicago thinks a little less of you (−2).', because: 'passed on Chicago\'s casino point', effects: [view('chicago', -2, 'Passed on the desert')] },
      ], { priority: 45, fam: 'chicago', actors: m.actors });
  }
  if (k === 'wire') {
    const m = envoyOf(s, 'chicago', ['capo'], st, 'racing wire');
    const fee = 1200, weekly = 140;
    return famEvent(s, 'fam_chi', 'Chicago wants your bookmakers on its racing wire',
      `${m.name} runs the racing wire for the Outfit: the results from every track, faster than the newspapers. He wants your bookmakers on it, ${fmt(fee)} to hook them up; faster results mean fewer bad bets taken. ${sw}`,
      [
        { id: 'hook', label: `Hook up the books (${fmt(fee)})`, detail: `Certain: your books do ${fmt(weekly)} a week better for 26 weeks; a shared racket with Chicago (+5).`, because: 'put your bookmakers on Chicago\'s wire', effects: [{ type: 'money', amount: -fee, category: 'cost' }, deal('chicago', weekly, 26, 'the racing wire (your books)'), view('chicago', 5, 'Took our wire'), tie('chicago', 'player', 'racket', 35, `Your bookmakers have run on Chicago's racing wire since ${s.date.y}.`)] },
        { id: 'no', label: 'Your books do fine with the newspaper', detail: 'Certain: Chicago thinks less of you (−5).', because: 'turned down Chicago\'s racing wire', effects: [view('chicago', -5, 'Turned down our wire')] },
      ], { priority: 45, fam: 'chicago', actors: m.actors });
  }
  const m = envoyOf(s, 'chicago', ['capo'], st, 'pension');
  const loan = 15000, weekly = 700, weeks = 26;
  return famEvent(s, 'fam_chi', 'Chicago\'s man talks about a fund that likes hotels',
    `${m.name} comes to dinner and never says the word "pension." He says there is a fund that likes hotels and men who build them, and that a friend of Chicago could have ${fmt(loan)} by Friday, paid back at ${fmt(weekly)} a week for half a year. It is a rumor in every union hall; he makes it sound like a favor. ${sw}`,
    [
      { id: 'no', label: 'Keep out of it', detail: 'Certain: nothing changes. Chicago shrugs.', because: 'kept out of Chicago\'s fund', effects: [view('chicago', -1, 'Kept out of our fund')] },
      { id: 'take', label: `Take the money (${fmt(loan)} now)`, detail: `Certain: ${fmt(loan)} now; you pay ${fmt(weekly)} a week for ${weeks} weeks (${fmt(weekly * weeks)} in all). Your house owes Chicago (a debt tie); Chicago +6. A loan like that gets noticed: federal heat +4.`, because: 'took a loan from Chicago\'s fund', effects: [{ type: 'money', amount: loan, category: 'debt' }, deal('chicago', -weekly, weeks, 'paying back the fund'), view('chicago', 6, 'A friend of the fund'), tie('chicago', 'player', 'debt', 40, `Your house owes Chicago's fund ${fmt(loan)} from ${s.date.y}.`, 'b'), { type: 'heat', bar: 'federal', amount: 4 }] },
    ], { priority: 45, fam: 'chicago', actors: m.actors });
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

type Visit = { key: string; defId: string; every: [number, number]; make: (s: GameState, st: FamState) => EventInstance | undefined; when?: (s: GameState) => boolean };

const VISITS: Visit[] = [
  { key: 'chi:any', defId: 'fam_chi', every: [12, 18], make: chicagoVisit },
];

/** Talk that goes round about the cities (once a while, on the web's dice). */
const RUMORS: { key: string; t: (s: GameState) => string; when?: (s: GameState) => boolean }[] = [
  { key: 'r:chi:pension', t: () => 'In the union halls they say the Teamsters\' pension fund lends to whatever casino Chicago and Cleveland point at. Nobody has ever proved it, and nobody tries.' },
  { key: 'r:chi:seat', t: (s) => `Chicago's man sat in on the Commission in New York this month; ${bond(s, 'chicago', 'marchetti') > 0 ? 'Varrone and Marchetti voted together, as usual' : 'Varrone and Marchetti did not speak'}.` },
];

/**
 * The cities' week (engine.ts, after the families' web): each city comes to
 * the boss with its business now and then (one city at a time), and the talk
 * about them goes round.
 */
export function citiesWeek(ctx: Ctx): void {
  const s = ctx.s;
  const st = s.families;
  if (!st || !s.rivals?.length || s.gameOver) return;
  ensureFamilies(s);
  const w = s.week;
  if (free(st, 'city:any', w)) {
    const ready = VISITS.filter((v) => free(st, v.key, w) && !pendingFam(s, v.defId) && (!v.when || v.when(s)));
    if (ready.length && rand(st) < 0.35) {
      const v = pickOf(st, ready);
      const ev = v.make(s, st);
      st.cd[v.key] = w + v.every[0] + Math.floor(rand(st) * (v.every[1] - v.every[0] + 1));
      if (ev) { st.cd['city:any'] = w + 3; s.eventQueue.push(ev); }
    }
  }
  if (free(st, 'city:rumor', w) && rand(st) < 0.15) {
    const ready = RUMORS.filter((r) => free(st, r.key, w) && (!r.when || r.when(s)));
    if (ready.length) {
      const r = pickOf(st, ready);
      st.cd[r.key] = w + 40;
      st.cd['city:rumor'] = w + 6;
      rumor(ctx, st, r.t(s));
    }
  }
}
