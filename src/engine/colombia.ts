import type { ActionPreview } from './actions';
import {
  alive, ensureFamilies, famEvent, famName, note, pendingFam, setView, stanceTo, stanceWord, tieBetween,
  type ColState, type FamAction, type FamOp, type FamState,
} from './familyWeb';
import type { FamKey } from './familyWebData';
import { heat, money, respect, rivalMoneyHit, type Ctx } from './ledger';
import { journal } from './journal';
import { noteBroken } from './minds/familyWord';
import { rand } from './rng';
import type { Effect, GameState } from './types';

/**
 * THE COLOMBIA CONNECTION, period-honest and abstract. In 1960 it is a
 * trickle from the Caribbean coast through a Miami warehouse that no serious
 * family will touch; it grows through the decade into the trade of the
 * 1970s (the game's numbers only: a market that grows by the year). The boss
 * may choose to touch it: it pays, and it costs: heavy heat (federal most of
 * all), the old families' disapproval (Philadelphia forbids narcotics; New
 * York, Chicago, New Orleans and Atlantic City think less of a man in it),
 * Philadelphia finding out, and rivals who want a piece. Nothing here says
 * how: no methods, no routes, no quantities; only money, heat and the word.
 */

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** The families that forbid it or look down on it (view lost each month a boss is in it). */
export const OLD_SCHOOL: FamKey[] = ['philly', 'marchetti', 'corvino', 'nola', 'chicago', 'manno', 'newark'];
/** Who wants a piece when they hear (rivals over the racket). */
const RIVALS_FOR_IT: FamKey[] = ['manno', 'kessler', 'tampa', 'biscayne', 'nephilly'];
export const LEVEL_WORD = ['out', 'a trickle', 'a steady line', 'a big line'];

/** The trade's size by year (a game number): a trickle in 1960, growing through the decade, the big money after 1970. */
export function market(y: number): number {
  if (y <= 1960) return 1;
  if (y < 1965) return 1 + (y - 1960) * 0.1;
  if (y < 1970) return 1.5 + (y - 1965) * 0.3;
  return Math.min(10, 3 + (y - 1970) * 0.7);
}

/** The most the boss can run, by year: a trickle until 1963, a steady line until 1968. */
export function maxLevel(y: number): number {
  return y < 1963 ? 1 : y < 1968 ? 2 : 3;
}

export function colOf(s: GameState): ColState | undefined {
  return s.families?.col;
}

/** What the racket pays a week now (before a rival's cut). */
export function weeklyTake(s: GameState, lvl: number): number {
  return Math.round((250 * lvl * market(s.date.y)) / 10) * 10;
}

/* ------------------------------------------------------------------ */
/* The orders                                                           */
/* ------------------------------------------------------------------ */

export function previewCoke(s: GameState, a: Extract<FamAction, { op: 'coke' }>): ActionPreview {
  const col = colOf(s);
  const lvl = col?.lvl ?? 0;
  const base = { effects: [] as Effect[], cost: 0, category: 'cost' as const };
  const max = maxLevel(s.date.y);
  const warn = `Old-school families forbid it: Philadelphia, New York, Chicago, New Orleans and Atlantic City think less of you every month you are in it; federal heat every week; and Philadelphia will find out.`;
  if (a.step === 'in') {
    const cost = 3000;
    const hv = stanceTo(s, 'havana').value;
    const cv = stanceTo(s, 'colombians').value;
    const parts = [
      { label: 'Base', value: 55 },
      { label: `The Havana men vouch for you (${stanceWord(hv)})`, value: Math.round(hv * 0.2) },
      { label: `The Colombians' view (${stanceWord(cv)})`, value: Math.round(cv * 0.3) },
    ];
    const chance = clamp(parts.reduce((x, p) => x + p.value, 0), 10, 90) / 100;
    return {
      ...base, title: 'Touch the Colombian connection', cost, because: 'went into the import racket',
      detail: `A trickle through a Miami warehouse that no serious family will touch in ${s.date.y}. ${fmt(cost)} buys a place in it: about ${fmt(weeklyTake(s, 1))} a week now, more as the years go on.`,
      warning: warn,
      effects: [
        { type: 'money', amount: -cost, category: 'cost', label: 'A place in the import racket' },
        { type: 'fam', op: { op: 'coke', set: 1 } },
        { type: 'fam', op: { op: 'tie', a: 'colombians', b: 'player', kind: 'partners', strength: 35, story: `Your house has been in the Colombians' trickle since ${s.date.y}.` } },
      ],
      refuseEffects: [{ type: 'fam', op: { op: 'cd', key: 'coke:in', weeks: 8 } }],
      acceptance: { chance, reasons: parts }, oddsLabel: 'They take you on',
      ...(lvl > 0 ? { disabledReason: 'You are in it already' } : (s.families?.cd['coke:in'] ?? 0) > s.week ? { disabledReason: 'They said no lately' } : !alive(s, 'colombians') ? { disabledReason: 'Nobody to deal with' } : {}),
    };
  }
  if (a.step === 'more') {
    const cost = 4000 * Math.max(1, lvl);
    return {
      ...base, title: `Grow the import racket to ${LEVEL_WORD[Math.min(3, lvl + 1)]}`, cost, because: 'grew the import racket',
      detail: `${fmt(cost)} more in. About ${fmt(weeklyTake(s, lvl + 1))} a week instead of ${fmt(weeklyTake(s, lvl))}; the heat and the disapproval grow with it.`,
      warning: warn,
      effects: [{ type: 'money', amount: -cost, category: 'cost', label: 'More into the import racket' }, { type: 'fam', op: { op: 'coke', set: lvl + 1 } }],
      ...(lvl <= 0 ? { disabledReason: 'You are not in it' } : lvl >= max ? { disabledReason: lvl >= 3 ? 'As big as it gets' : `The trade is not that big yet (${s.date.y})` } : {}),
    };
  }
  return {
    ...base, title: 'Get out of the import racket', because: 'got out of the import racket',
    detail: `Certain: the money stops, the weekly federal heat stops, and the old families stop counting it against you.${col?.known ? ' Philadelphia thinks a little better of you (+4).' : ''} The Colombians think less of you.`,
    effects: [{ type: 'fam', op: { op: 'coke', set: 0 } }, ...(col?.known ? [{ type: 'fam' as const, op: { op: 'view' as const, fam: 'philly' as FamKey, amount: 4, reason: 'Got out of narcotics' } }] : []), { type: 'fam', op: { op: 'view', fam: 'colombians', amount: -5, reason: 'Walked away' } }],
    ...(lvl <= 0 ? { disabledReason: 'You are not in it' } : {}),
  };
}

/** The orders the boss can give about it (the UI's list). */
export function cokeActions(): FamAction[] {
  return [{ op: 'coke', step: 'in' }, { op: 'coke', step: 'more' }, { op: 'coke', step: 'out' }];
}

/* ------------------------------------------------------------------ */
/* Applying                                                             */
/* ------------------------------------------------------------------ */

function ensureCol(s: GameState, st: FamState): ColState {
  if (!st.col) st.col = { lvl: 0, since: s.week, tot: 0 };
  return st.col;
}

export function applyCokeOp(ctx: Ctx, o: Extract<FamOp, { op: 'coke' }>): void {
  const s = ctx.s;
  const st = ensureFamilies(s);
  if (o.set !== undefined) {
    const first = !st.col;
    const col = ensureCol(s, st);
    const was = col.lvl;
    col.lvl = clamp(o.set, 0, 3);
    if (col.lvl === 0) {
      delete col.cut;
      note(st, s.week, 'Your house got out of the import racket.', 'neutral');
      journal(s, { t: 'Out of the import racket', x: 'The money stops; so does the weekly federal heat and the old families\' counting.', c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    } else {
      if (first || was === 0) { col.since = s.week; noteBroken(s, 'philly', 'went into narcotics'); }
      note(st, s.week, `Your house is in the import racket: ${LEVEL_WORD[col.lvl]}.`, 'bad');
      journal(s, { t: `The import racket: ${LEVEL_WORD[col.lvl]}`, x: `About ${fmt(weeklyTake(s, col.lvl))} a week in ${s.date.y}. Federal heat every week; the old families think less of you every month.`, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    }
    return;
  }
  const col = ensureCol(s, st);
  if (o.deny !== undefined) {
    if (rand(st) < o.deny) {
      note(st, s.week, 'Philadelphia took your word that you are not in narcotics. For now.', 'neutral');
      journal(s, { t: 'Philadelphia took your word', x: `You denied the import racket and they believed you (it was ${Math.round(o.deny * 100)}%). For now.`, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    } else {
      setView(s, 'philly', -12, 'Lied to us about narcotics');
      heat(ctx, 'family', 8, 'Philadelphia caught you lying about narcotics', 'heat');
      note(st, s.week, 'Philadelphia did not believe you about the import racket.', 'bad');
      journal(s, { t: 'Philadelphia did not believe you', x: `They knew about the import racket (it was ${Math.round(o.deny * 100)}% they would believe you). Philadelphia −12, family heat +8.`, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    }
    return;
  }
  if (o.cut) {
    col.cut = { fam: o.cut.fam, share: clamp(o.cut.share, 0, 0.5) };
    note(st, s.week, `${famName(s, o.cut.fam as FamKey)} has ${Math.round(col.cut.share * 100)}% of your import racket.`, 'neutral');
    return;
  }
  if (o.refuse) {
    const f = o.refuse.fam as FamKey;
    const name = famName(s, f);
    if (rand(st) < o.refuse.chance) {
      respect(ctx, 1, `${name} backed off the import racket`, 'event');
      note(st, s.week, `${name} backed off your import racket.`, 'good');
      journal(s, { t: `${name} backed off`, x: `You told them no and they took it (it was ${Math.round(o.refuse.chance * 100)}%). Respect +1.`, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    } else {
      const lost = rivalMoneyHit(ctx, Math.round(weeklyTake(s, col.lvl) * 1.5), `${name} hit your import racket`, 0.3);
      heat(ctx, 'local', 3, `${name} tipped the police about the import racket`, 'heat');
      setView(s, f, -8, 'Kept the import racket from us');
      if (!tieBetween(s, f, 'player').some((t) => t.kind === 'feud')) ensureFeud(s, st, f);
      note(st, s.week, `${name} would not take no: they hit the import racket and tipped the police.`, 'bad');
      journal(s, { t: `${name} hit your import racket`, x: `They would not take no (it was ${Math.round(o.refuse.chance * 100)}% they would). ${lost ? `${fmt(lost)} lost, ` : ''}local heat +3, and bad blood.`, c: 'rivals', src: 'families', ln: 'diplomacy.board' });
    }
  }
}

function ensureFeud(s: GameState, st: FamState, f: FamKey): void {
  st.ties.push({ id: `t${st.next++}`, a: f, b: 'player', kind: 'feud', since: s.date.y, strength: 30, story: `${famName(s, f)} wanted a piece of your import racket in ${s.date.y} and were told no.` });
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

/**
 * The trade grows by the year (the Colombians' strength with it); if the
 * boss is in it: the take, the federal heat, the old families' disapproval,
 * Philadelphia finding out, and rivals wanting a piece.
 */
export function colombiaWeek(ctx: Ctx): void {
  const s = ctx.s;
  const st = s.families;
  if (!st || !s.rivals?.length || s.gameOver) return;
  // The trade grows by the year, whoever is in it.
  const want = Math.round(8 * market(s.date.y));
  if ((st.size.colombians ?? 8) < want) st.size.colombians = want;
  const col = st.col;
  if (!col || col.lvl <= 0) return;
  const take = Math.round(weeklyTake(s, col.lvl) * (1 - (col.cut?.share ?? 0)));
  const got = money(ctx, take, 'The import racket', 'street');
  col.tot += got;
  heat(ctx, 'federal', col.lvl, 'The import racket draws the federal narcotics men', 'heat');
  if (col.lvl >= 2) heat(ctx, 'local', 1, 'The import racket on the island', 'heat');
  // Once a month the old families count it against you.
  const mk = `colm:${s.date.y}-${s.date.m}`;
  if (!st.cd[mk]) {
    for (const k of Object.keys(st.cd)) if (k.startsWith('colm:') && k !== mk) delete st.cd[k];
    st.cd[mk] = 1;
    const known = !!col.known || col.lvl >= 2;
    for (const f of OLD_SCHOOL) if (f !== 'philly' || known) setView(s, f, -(f === 'philly' ? 2 : 1) * col.lvl, 'In narcotics');
    // Philadelphia finds out.
    if (!col.known && rand(st) < 0.12 * col.lvl + (s.week - col.since > 26 ? 0.1 : 0)) {
      col.known = s.week;
      st.cd['col:philly'] = 0;
    }
    // A rival wants a piece.
    if (!col.cut && rand(st) < 0.15 * col.lvl && !pendingFam(s, 'fam_col_rival')) {
      const who = RIVALS_FOR_IT.filter((f) => alive(s, f));
      if (who.length) s.eventQueue.push(rivalEvent(s, st, who[Math.floor(rand(st) * who.length)], col));
    }
  }
  if (col.known && (st.cd['col:philly'] ?? 0) <= s.week && !pendingFam(s, 'fam_col_philly')) {
    st.cd['col:philly'] = s.week + 13;
    s.eventQueue.push(phillyEvent(s, col));
  }
}

function phillyEvent(s: GameState, col: ColState) {
  const chance = clamp(0.55 - 0.15 * col.lvl + (s.respect - 50) / 200, 0.1, 0.7);
  const env = 1500 * col.lvl;
  return famEvent(s, 'fam_col_philly', 'Philadelphia asks about the powder',
    `Ottavio Massaro, the consigliere, comes down himself. The old man has heard your house is in narcotics: ${LEVEL_WORD[col.lvl]}. The rule in South Philadelphia is no narcotics, no noise; he wants to hear it from you.`,
    [
      { id: 'out', label: 'Get out of it', detail: 'Certain: out of the import racket; Philadelphia +6, family heat −4.', because: 'got out of narcotics at Philadelphia\'s word', effects: [{ type: 'fam', op: { op: 'coke', set: 0 } }, { type: 'fam', op: { op: 'view', fam: 'philly', amount: 6, reason: 'Got out of narcotics' } }, { type: 'heat', bar: 'family', amount: -4 }] },
      { id: 'deny', label: `Deny it (${Math.round(chance * 100)}%)`, detail: `${Math.round(chance * 100)}% they believe you and nothing changes; otherwise Philadelphia −12 and family heat +8. You stay in it either way.`, because: 'denied being in narcotics', effects: [{ type: 'fam', op: { op: 'coke', deny: chance } }] },
      { id: 'pay', label: `Stay in, and an envelope for the old man (${fmt(env)})`, detail: 'Certain: Philadelphia still thinks less of you (−3), but looks away for now; family heat +2.', because: 'paid Philadelphia to look away from narcotics', effects: [{ type: 'money', amount: -env, category: 'tribute' }, { type: 'fam', op: { op: 'view', fam: 'philly', amount: -3, reason: 'Paid us to look away' } }, { type: 'heat', bar: 'family', amount: 2 }] },
    ], { mandatory: true, priority: 58, fam: 'philly' });
}

function rivalEvent(s: GameState, st: FamState, f: FamKey, col: ColState) {
  const name = famName(s, f);
  const chance = clamp(0.5 + (s.respect - 50) / 150 - (st.size[f] ?? 30) / 1000, 0.15, 0.85);
  return famEvent(s, 'fam_col_rival', `${name} wants a piece of your import racket`,
    `${name} has heard about the trickle through Miami. They want 30% of it, or they will make it hard to run. The racket pays about ${fmt(weeklyTake(s, col.lvl))} a week now.`,
    [
      { id: 'cut', label: 'Cut them in for 30%', detail: `Certain: they take 30% of the import racket from now on; ${name} +6.`, because: `cut ${name} into the import racket`, effects: [{ type: 'fam', op: { op: 'coke', cut: { fam: f, share: 0.3 } } }, { type: 'fam', op: { op: 'view', fam: f, amount: 6, reason: 'Cut us in' } }] },
      { id: 'no', label: `Tell them no (${Math.round(chance * 100)}%)`, detail: `${Math.round(chance * 100)}% they back off (respect +1); otherwise they hit the racket (money lost), tip the police (local heat +3), ${name} −8 and bad blood.`, because: `told ${name} no about the import racket`, effects: [{ type: 'fam', op: { op: 'coke', refuse: { fam: f, chance } } }] },
      { id: 'out', label: 'Get out of it altogether', detail: 'Certain: out of the import racket.', because: 'got out of the import racket rather than fight over it', effects: [{ type: 'fam', op: { op: 'coke', set: 0 } }] },
    ], { priority: 54, fam: f });
}
