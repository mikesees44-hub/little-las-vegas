import type { ActionPreview } from './actions';
import {
  addTie, alive, ensureFamilies, famEvent, famName, note, pendingFam, setView, sizeLine, stanceTo, stanceWord,
  type FamAction, type FamOp, type FamState,
} from './familyWeb';
import type { FamKey } from './familyWebData';
import type { Reason } from './interactions';
import { journal } from './journal';
import { heat, money, type Ctx } from './ledger';
import { hashSeed } from './rng';
import type { Effect, EventInstance, GameState } from './types';

/**
 * LAS VEGAS, AN OPEN CITY. Nobody owns the Strip: the Chicago Outfit, the
 * Cleveland Syndicate and the New York families each hold points in its
 * casinos, and the Silver Strip Partners (the Adler house's count room) keep
 * the skim honest between them. In every union hall they say the Teamsters'
 * pension fund lends to whatever gets built here; nobody has ever proved it
 * (rumor only). Every casino and every person is fictional; the city is
 * backdrop.
 *
 * The boss's part is light: he can buy a point in a casino (the holders let
 * him in or not, odds shown), it pays every week out of the count, the skim
 * draws a little federal attention, and now and then the desert comes to him
 * (a short count, a junket, an audit). Men he sends to start something out
 * here are outposts.ts. Lives on `s.families.lv` (absent until he holds a
 * point). Its dice come from the seed and the week, so the web's own dice
 * never move.
 */

export interface LvPoint { c: string; n: number; since: number; tot: number }
export interface LvState { pts: LvPoint[]; tot: number }

export interface Casino {
  id: string;
  name: string;
  /** Downtown (Fremont Street) rather than the Strip. */
  downtown?: boolean;
  /** The families that hold its points (who lets a new man in). */
  holders: FamKey[];
  note: string;
}

/** The casinos (fictional names, 1960). */
export const CASINOS: Casino[] = [
  { id: 'crown', name: 'the Desert Crown', holders: ['chicago', 'vegas'], note: 'the Outfit\'s house; Desert Nick counts it' },
  { id: 'mesa', name: 'the Silver Mesa', holders: ['cleveland', 'vegas'], note: 'Cleveland built it, with money from a fund nobody names' },
  { id: 'starhaven', name: 'the Starhaven', holders: ['marchetti', 'saladino', 'vegas'], note: 'New York\'s points; a crooner in the lounge every night' },
  { id: 'palms', name: 'the Coronado Palms', holders: ['vegas'], note: 'the Silver Strip Partners\' own; the Adler count room' },
  { id: 'caravel', name: 'the Caravel', holders: ['biscayne', 'feldstein', 'vegas'], note: 'Miami Beach money; the winter junkets land here' },
  { id: 'deuce', name: 'the Lucky Deuce', downtown: true, holders: ['vegas', 'havana'], note: 'downtown on Fremont; the Havana men deal its tables since 1959' },
];
export const CASINO_BY_ID: Record<string, Casino> = Object.fromEntries(CASINOS.map((c) => [c.id, c]));

export const POINT_COST = 8000;
export const MAX_POINTS = 2;
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Dice of the seed and the week (the web's own dice never move). */
function roll(s: GameState, key: string): number {
  return (hashSeed(`${s.seed}:lv:${key}:${s.week}`) % 100000) / 100000;
}

export function lvOf(s: GameState): LvState | undefined {
  return s.families?.lv;
}

export function pointsIn(s: GameState, casino: string): number {
  return lvOf(s)?.pts.find((p) => p.c === casino)?.n ?? 0;
}

/** The desert's season: summer is slow (115 in the shade), winter and spring the high rollers come. */
export function season(s: GameState): number {
  const m = s.date.m;
  return m === 7 || m === 8 ? 0.8 : m >= 11 || m <= 4 ? 1.15 : 1;
}

/** What one point pays a week (out of the count), before the week's luck. */
export function pointWeekly(s: GameState, c: Casino): number {
  return Math.round((POINT_COST * (c.downtown ? 0.017 : 0.02) * season(s)) / 5) * 5;
}

/** The Strip's holders, as one line. */
export function holdersLine(s: GameState, c: Casino): string {
  return c.holders.map((f) => famName(s, f)).join(', ');
}

/** The odds the holders let the boss buy a point (their stance, the Partners', his respect, the points he already holds). */
export function pointOdds(s: GameState, c: Casino): { chance: number; reasons: Reason[] } {
  const others = c.holders.filter((f) => f !== 'vegas');
  const avg = others.length ? others.reduce((a, f) => a + stanceTo(s, f).value, 0) / others.length : 0;
  const lv = stanceTo(s, 'vegas').value;
  const held = (lvOf(s)?.pts ?? []).reduce((a, p) => a + p.n, 0);
  const reasons: Reason[] = [
    { label: 'Base: an open city takes money from anybody', value: 40 },
    { label: `The Silver Strip Partners (${stanceWord(lv)})`, value: Math.round(lv * 0.3) },
    ...(others.length ? [{ label: `The holders, ${others.map((f) => famName(s, f)).join(' and ')} (${stanceWord(avg)})`, value: Math.round(avg * 0.3) }] : []),
    { label: 'Your respect', value: Math.round((s.respect - 50) * 0.2) },
    ...(held ? [{ label: `You already hold ${held} point${held === 1 ? '' : 's'} in the desert`, value: 5 }] : []),
  ].filter((r) => r.value !== 0 || r.label.startsWith('Base'));
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: clamp(sum, 10, 90) / 100, reasons };
}

/* ------------------------------------------------------------------ */
/* The orders: a point bought, a point sold                            */
/* ------------------------------------------------------------------ */

export function previewLv(s: GameState, a: Extract<FamAction, { op: 'lv' }>): ActionPreview {
  const c = CASINO_BY_ID[a.casino];
  const base = { effects: [] as Effect[], cost: 0, category: 'cost' as const };
  if (!c) return { ...base, title: 'A point on the Strip', because: '', disabledReason: 'No such casino' };
  const have = pointsIn(s, c.id);
  const weekly = pointWeekly(s, c);
  const war = c.holders.find((f) => s.wars.some((w) => w.rival === f));
  if (a.step === 'buy') {
    const o = pointOdds(s, c);
    const pct = Math.round(o.chance * 100);
    return {
      ...base, title: `Buy a point in ${c.name}`, cost: POINT_COST, because: `bought a point in ${c.name}`,
      detail: `${fmt(POINT_COST)} for a point (${c.note}). The holders (${holdersLine(s, c)}) let you in or not: ${pct}%. A point pays about ${fmt(weekly)} a week out of the count, for as long as you hold it; the skim draws a little federal attention. Turned down, the money stays home.`,
      effects: [
        { type: 'money', amount: -POINT_COST, category: 'cost', label: `A point in ${c.name}` },
        { type: 'fam', op: { op: 'lv', buy: c.id } },
        { type: 'fam', op: { op: 'view', fam: 'vegas', amount: 3, reason: 'A new point-holder', cd: `lv:buy:${c.id}`, weeks: 4 } },
      ],
      refuseEffects: [{ type: 'fam', op: { op: 'cd', key: `lv:buy:${c.id}`, weeks: 8 } }],
      acceptance: o, oddsLabel: 'The holders let you in',
      ...(war ? { disabledReason: `You are at war with ${famName(s, war)}` } : have >= MAX_POINTS ? { disabledReason: `You hold ${MAX_POINTS} points there: as many as they sell one family` } : (s.families?.cd[`lv:buy:${c.id}`] ?? 0) > s.week ? { disabledReason: 'They said no lately' } : !alive(s, 'vegas') ? { disabledReason: 'Nobody to deal with' } : {}),
    };
  }
  const back = Math.round(POINT_COST * 0.75);
  return {
    ...base, title: `Sell your point in ${c.name}`, because: `sold a point in ${c.name}`,
    detail: `Certain: the Partners buy it back for ${fmt(back)} (three quarters of what you paid). The weekly money stops; so does the skim's attention.`,
    effects: [{ type: 'money', amount: back, category: 'business', label: `Sold a point in ${c.name}` }, { type: 'fam', op: { op: 'lv', sell: c.id } }],
    ...(have <= 0 ? { disabledReason: 'You hold no point there' } : {}),
  };
}

export function lvActions(c: Casino): FamAction[] {
  return [{ op: 'lv', step: 'buy', casino: c.id }, { op: 'lv', step: 'sell', casino: c.id }];
}

function ensureLv(st: FamState): LvState {
  if (!st.lv) st.lv = { pts: [], tot: 0 };
  return st.lv;
}

export function applyLvOp(ctx: Ctx, o: Extract<FamOp, { op: 'lv' }>): void {
  const s = ctx.s;
  const st = ensureFamilies(s);
  if (o.buy) {
    const c = CASINO_BY_ID[o.buy];
    if (!c) return;
    const lv = ensureLv(st);
    const p = lv.pts.find((x) => x.c === c.id);
    if (p) p.n++;
    else lv.pts.push({ c: c.id, n: 1, since: s.week, tot: 0 });
    addTie(s, 'vegas', 'player', 'racket', 35, `Your house has held a point in ${c.name} since ${s.date.y}.`);
    note(st, s.week, `Your house bought a point in ${c.name}.`, 'good');
    journal(s, { t: `A point in ${c.name}`, x: `About ${fmt(pointWeekly(s, c))} a week out of the count. The holders: ${holdersLine(s, c)}.`, c: 'money', src: 'families', ln: 'diplomacy.board' });
    return;
  }
  if (o.sell) {
    const lv = st.lv;
    const p = lv?.pts.find((x) => x.c === o.sell);
    if (!lv || !p) return;
    p.n--;
    if (p.n <= 0) lv.pts = lv.pts.filter((x) => x !== p);
    const c = CASINO_BY_ID[o.sell];
    note(st, s.week, `Your house sold its point in ${c?.name ?? 'a casino'}.`, 'neutral');
    journal(s, { t: `Sold the point in ${c?.name ?? 'a casino'}`, c: 'money', src: 'families', ln: 'diplomacy.board' });
    return;
  }
  if (o.audit) {
    const c = CASINO_BY_ID[o.audit.casino];
    const name = c?.name ?? 'the casino';
    if (roll(s, `audit:${o.audit.casino}`) < o.audit.chance) {
      money(ctx, o.audit.amount, `The audit at ${name} found the short count`, 'business');
      setView(s, 'vegas', 2, 'Found the short count and said so politely');
      note(st, s.week, `Your accountant found the short count at ${name}; the Partners made it good.`, 'good');
      journal(s, { t: `The audit at ${name} found the short count`, x: `The Partners made it good: ${fmt(o.audit.amount)} (it was ${Math.round(o.audit.chance * 100)}%).`, c: 'money', src: 'families', ln: 'diplomacy.board', m: o.audit.amount });
    } else {
      setView(s, 'vegas', -6, 'Sent an accountant to count our money');
      note(st, s.week, `Your accountant found nothing at ${name}, and the Partners took it badly.`, 'bad');
      journal(s, { t: `The audit at ${name} found nothing`, x: `The Partners took it badly: Las Vegas −6 (it was ${Math.round(o.audit.chance * 100)}% to find it).`, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The desert comes to the boss now and then                            */
/* ------------------------------------------------------------------ */

const view = (fam: FamKey, amount: number, reason: string): Effect => ({ type: 'fam', op: { op: 'view', fam, amount, reason } });

function vegasVisit(s: GameState): EventInstance | undefined {
  if (!alive(s, 'vegas')) return undefined;
  const sv = stanceTo(s, 'vegas').value;
  const sw = `The Silver Strip Partners' stance toward you: ${stanceWord(sv)} (${sizeLine(s, 'vegas')}).`;
  const held = lvOf(s)?.pts ?? [];
  const kinds = ['short', 'junket', ...(held.length ? ['audit', 'audit'] : [])];
  const k = kinds[Math.floor(roll(s, 'kind') * kinds.length)];
  if (k === 'short') {
    return famEvent(s, 'fam_lv', 'A short count at the Silver Mesa',
      `The count at the Silver Mesa came up short three Fridays running. Chicago says Cleveland's men are skimming the skim; Cleveland says Chicago's count-room man cannot add. The Silver Strip Partners want the families with an interest in the desert to say whose side they are on, before somebody says it with something worse than words. ${sw}`,
      [
        { id: 'out', label: 'Stay out of it: it is not your casino', detail: 'Certain: nothing changes. An open city stays open.', because: 'stayed out of the Silver Mesa quarrel', effects: [] },
        { id: 'chi', label: 'Side with Chicago', detail: 'Certain: Chicago +6 and Las Vegas +2; Cleveland and its friends cool on you.', because: 'sided with Chicago over the short count', effects: [view('chicago', 6, 'Stood with us over the count'), view('vegas', 2, 'Helped settle the count'), { type: 'fam', op: { op: 'side', fam: 'chicago', against: 'cleveland' } }] },
        { id: 'cle', label: 'Side with Cleveland', detail: 'Certain: Cleveland +6 and Las Vegas +2; Chicago and its friends cool on you.', because: 'sided with Cleveland over the short count', effects: [view('cleveland', 6, 'Stood with us over the count'), view('vegas', 2, 'Helped settle the count'), { type: 'fam', op: { op: 'side', fam: 'cleveland', against: 'chicago' } }] },
      ], { priority: 43, fam: 'vegas' });
  }
  if (k === 'junket') {
    const cost = 1500, weekly = 120;
    return famEvent(s, 'fam_lv', 'The Partners want your high rollers',
      `Leo "Cards" Mandel runs the junkets for the Silver Strip Partners: a chartered plane, a suite, the shows, and credit at the tables for the men who spend. He wants the big spenders from your Wildwood clubs on his next flight. You put up ${fmt(cost)} for the plane; the house pays you a piece of what they lose. ${sw}`,
      [
        { id: 'no', label: 'Your gamblers lose their money at home', detail: 'Certain: Las Vegas thinks a little less of you (−2).', because: 'kept your high rollers home', effects: [view('vegas', -2, 'Kept the high rollers home')] },
        { id: 'send', label: `Fill a plane (${fmt(cost)})`, detail: `Certain: ${fmt(weekly)} a week for 26 weeks (a piece of the junket); Las Vegas +5. A planeload of gamblers from the Shore gets noticed: local heat +1.`, because: 'sent a junket of high rollers to the Strip', effects: [{ type: 'money', amount: -cost, category: 'cost' }, { type: 'fam', op: { op: 'deal', fam: 'vegas', weekly, weeks: 26, what: 'a junket from your clubs' } }, view('vegas', 5, 'Sent us high rollers'), { type: 'heat', bar: 'local', amount: 1 }] },
      ], { priority: 42, fam: 'vegas' });
  }
  const p = held[Math.floor(roll(s, 'which') * held.length)];
  const c = CASINO_BY_ID[p.c];
  const fee = 600;
  const amount = pointWeekly(s, c) * 4 * p.n;
  const chance = clamp(0.35 + (sv < 0 ? 0.1 : 0), 0.2, 0.6);
  return famEvent(s, 'fam_lv', `Your point in ${c.name} pays light`,
    `Your point in ${c.name} paid less this month than last, and the month before. Meyer Adler says the summer was slow and the drop was soft. Your accountant says he would like to see the count room's books. Asking is an insult in the desert; not asking is how men get skimmed. ${sw}`,
    [
      { id: 'trust', label: 'Take Adler\'s word', detail: 'Certain: Las Vegas +3. Nothing comes back.', because: 'took the count room\'s word', effects: [view('vegas', 3, 'Took our word on the count')] },
      { id: 'audit', label: `Send your accountant (${fmt(fee)}, ${Math.round(chance * 100)}%)`, detail: `${Math.round(chance * 100)}% he finds the short count and the Partners make it good (${fmt(amount)}, Las Vegas +2); otherwise he finds nothing and they take it badly (Las Vegas −6).`, because: `sent an accountant to ${c.name}'s count room`, effects: [{ type: 'money', amount: -fee, category: 'cost' }, { type: 'fam', op: { op: 'lv', audit: { casino: c.id, chance, amount } } }] },
    ], { priority: 42, fam: 'vegas' });
}

/** The talk about the desert (rumor only; never proved). */
const RUMORS: { key: string; t: string }[] = [
  { key: 'pension', t: 'They say a new hotel broke ground on the Strip with money from a union pension fund that lends to whatever Chicago and Cleveland point at. Nobody has proved it, and nobody in the desert asks.' },
  { key: 'cars', t: 'A man in a gray suit was seen writing down license plates in the Coronado Palms lot. The Partners say he was a tourist. Tourists do not write down license plates.' },
  { key: 'havana', t: 'The floor bosses at the Lucky Deuce have Havana accents now: the men Castro threw out found work dealing cards on Fremont Street.' },
  { key: 'open', t: 'In the desert they say Las Vegas is an open city: everybody holds a point, nobody holds the town. The day somebody tries is the day it stops being open.' },
  { key: 'count', t: 'Every Friday a man with a briefcase flies from the desert to Chicago, and another to Cleveland, and another to New York. The briefcases go back empty.' },
];

/**
 * The desert's week: the points pay out of the count (the week's luck,
 * the season), the skim draws a little federal attention, the Partners come
 * to the boss now and then, and the talk goes round. Light by design.
 */
export function vegasWeek(ctx: Ctx): void {
  const s = ctx.s;
  const st = s.families;
  if (!st || !s.rivals?.length || s.gameOver) return;
  const w = s.week;
  const lv = st.lv;
  if (lv?.pts.length) {
    for (const p of lv.pts) {
      const c = CASINO_BY_ID[p.c];
      if (!c || c.holders.some((f) => s.wars.some((x) => x.rival === f))) continue;
      const luck = 0.85 + roll(s, `luck:${p.c}`) * 0.3;
      const amt = Math.round(pointWeekly(s, c) * p.n * luck);
      const got = money(ctx, amt, `Your point${p.n > 1 ? 's' : ''} in ${c.name}`, 'business');
      p.tot += got;
      lv.tot += got;
    }
    if (w % 4 === 0) heat(ctx, 'federal', 1, 'The skim: somebody in Washington counts the desert\'s money too', 'heat');
  }
  if ((st.cd['lv:visit'] ?? 0) <= w && (st.cd['city:any'] ?? 0) <= w && !pendingFam(s, 'fam_lv') && roll(s, 'visit') < 0.25) {
    const ev = vegasVisit(s);
    st.cd['lv:visit'] = w + 14 + Math.floor(roll(s, 'gap') * 8);
    if (ev) { st.cd['city:any'] = w + 3; s.eventQueue.push(ev); }
  }
  if ((st.cd['lv:rumor'] ?? 0) <= w && roll(s, 'rumor') < 0.08) {
    const ready = RUMORS.filter((r) => (st.cd[`lv:r:${r.key}`] ?? 0) <= w);
    if (ready.length) {
      const r = ready[Math.floor(roll(s, 'rpick') * ready.length)];
      st.cd[`lv:r:${r.key}`] = w + 52;
      st.cd['lv:rumor'] = w + 10;
      note(st, w, r.t, 'neutral');
      ctx.log.push(r.t);
      journal(s, { t: r.t, c: 'rivals', src: 'families', ln: 'diplomacy.board', k: 'heard' });
    }
  }
}
