import { ensureAction } from './actionState';
import { player } from './characters';
import { holder } from './council';
import { heat, money, type Ctx } from './ledger';
import { opinion } from './relations';
import { familyCash } from './tributeState';
import type { Effect, EventInstance, GameState } from './types';
import { knobs } from './difficulty';

/**
 * SUCCESS DRAWS FIRE, AND A WAY BACK FROM THE BOTTOM (DAILY_LOGIC_AND_ACTION #9, #10, B3, B4).
 *
 *  - Wealth is a target. `wealthPressure` (0-1) grows with the Family's money past $60k: the rivals
 *    plan more moves on a fat outfit (threats.ts aggression), the FBI starts sooner and comes back
 *    faster (planFeds), Philadelphia's envelope swells (events.ts envelopeSize) and its summons
 *    comes. A big operation also costs to keep (lawyers on retainer, payoffs up the line, the
 *    people who smell money): a soft brake on runaway cash, a ledger line every week.
 *  - Under water: after BAIL_WEEKS in a row with the treasury below −$10,000, a way back is
 *    offered: a loan shark's money at a ruinous vig, Philadelphia hat in hand (odds), or selling a
 *    place; or riding it out.
 *  - Philadelphia's summons: about once a year in an established game (family heat, wealth, a
 *    short envelope bring it sooner), a decision with odds.
 *
 * Every roll here is hashed off the seed and the week (never the game's dice).
 */

/** 0-1: how much the Family's money draws attention. */
export function wealthPressure(s: GameState): number {
  return Math.max(0, Math.min(1, ((familyCash(s) - 60000) / 340000) * knobs(s).fire));
}

/** Weeks in a row under water before the bail-out is offered. */
export const BAIL_WEEKS = 8;
export const UNDER_WATER = -10000;
/** The upkeep of a big operation: this share of the Family's money above BRAKE_FROM, every week. */
export const BRAKE_RATE = 0.005;
export const BRAKE_FROM = 150000;
/** The summons: earliest week, and the least weeks between two. */
export const SUMMONS_FROM = 20;
export const SUMMONS_GAP = 26;

function roll(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const r = (s: GameState, k: string) => roll(`${s.seed}|${s.week}|pr|${k}`);
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The week's pressure (advanceWeek, after the money is counted): the weeks under water, the upkeep, the IRS. */
export function pressureWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const A = ensureAction(s);
  A.under = s.money < UNDER_WATER ? A.under + 1 : 0;
  const cash = familyCash(s);
  if (cash > BRAKE_FROM && s.money > 0) {
    const cost = Math.min(s.money, Math.round(((cash - BRAKE_FROM) * BRAKE_RATE) / 10) * 10);
    if (cost > 0) money(ctx, -cost, 'The upkeep of a big operation: lawyers on retainer, payoffs up the line, the people who smell money', 'event');
  }
  // The federal government reads tax returns: a fat outfit warms the federal bar.
  if (cash > 200000 && s.week % 3 === 0) heat(ctx, 'federal', 1, 'Somebody at the IRS is reading your tax returns', 'heat');
}

/* ------------------------------------------------------------------ */
/* The bail-out                                                        */
/* ------------------------------------------------------------------ */

export function bailoutSource(s: GameState): EventInstance | undefined {
  const A = s.action;
  if (!A || s.gameOver || A.under < knobs(s).bailWeeks || (A.bail !== undefined && s.week - A.bail < 26)) return undefined;
  A.bail = s.week;
  A.stats.bail++;
  const need = Math.max(15000, Math.min(60000, Math.ceil((-s.money + 10000) / 1000) * 1000));
  const weekly = Math.round((need * 1.6) / 20 / 10) * 10;
  const philly = s.rivals.find((x) => x.id === 'philly');
  const pOp = philly ? opinion(s, philly.leaderId, s.playerId) : 0;
  const pOdds = Math.max(25, Math.min(85, 50 + Math.round(pOp / 2) + Math.round(s.respect / 10)));
  const mine = s.businesses.filter((b) => b.owner === 'player').sort((a, b) => a.weeklyBase - b.weeklyBase);
  const sell = mine.length > 1 ? mine[0] : undefined;
  const sellFor = sell ? Math.max(5000, Math.round((sell.weeklyBase * 14) / 500) * 500) : 0;
  const choices: EventInstance['choices'] = [
    {
      id: 'shark', label: `Take the shylock's money (${fmt(need)})`, detail: `Nicky Lentini on Rio Grande Avenue: ${fmt(weekly)} a week for 20 weeks (${fmt(weekly * 20)} back). Miss and he sends his nephews.`,
      because: 'took the shylock\'s money',
      effects: [{ type: 'debt', lender: 'Nicky Lentini, the shylock', principal: need, weeklyPayment: weekly, weeks: 20, label: 'The shylock\'s money' }, { type: 'flag', key: 'shylock', value: s.week, label: 'You owe a shylock' }],
    },
    {
      id: 'philly', label: 'Go to Philadelphia, hat in hand', detail: `${pOdds}% they front you ${fmt(need)} (family heat +8, respect −4 either way: the whole street hears you went begging). If they say no, you come home with nothing.`,
      because: 'went to Philadelphia for money',
      effects: [
        { type: 'heat', bar: 'family', amount: 8, label: 'Philadelphia knows you are broke' },
        { type: 'respect', amount: -4, label: 'Went begging to Philadelphia' },
        { type: 'deed', op: { op: 'gamble', p: pOdds, label: 'Philadelphia\'s money', ok: [{ type: 'money', amount: need, category: 'event', label: 'Philadelphia fronts you the money' }, { type: 'flag', key: 'philly_owes', value: s.week, label: 'Philadelphia will want it back, with interest, in the envelope' }], bad: [{ type: 'respect', amount: -2, label: 'Philadelphia said no' }], okText: `Philadelphia fronted you ${fmt(need)}. The envelope will be fatter for half a year.`, badText: 'Philadelphia listened, poured you a coffee and said no. You drove home over the bridge with nothing.' } },
      ],
    },
    ...(sell ? [{
      id: 'sell', label: `Sell ${sell.name} (${fmt(sellFor)})`, detail: 'Cash now, a place gone for good.',
      because: `sold ${sell.name} to stay afloat`,
      effects: [{ type: 'removeBusiness', businessId: sell.id, label: `Sold ${sell.name}` }, { type: 'money', amount: sellFor, category: 'event', label: `Sold ${sell.name} to stay afloat` }, { type: 'respect', amount: -2, label: 'Selling off to stay afloat' }] as Effect[],
    }] : []),
    { id: 'ride', label: 'Ride it out', detail: 'The men keep going unpaid. Some of them will not wait forever.', because: 'rode it out', effects: [{ type: 'crewOpinion', amount: -3, reason: 'Another week unpaid', label: 'Rode it out' }] },
  ];
  return {
    iid: `ev${s.nextId++}`, defId: 'bailout', title: 'Under water',
    text: `The Family has been in the red ${A.under} weeks running (${fmt(s.money)}). The men are paid late or not at all, and everybody on the island knows it. There are ways back. None of them are cheap.`,
    week: s.week, choices, defaultChoiceId: 'ride', mandatory: true, priority: 85, meta: { theme: 'business' },
  };
}

/* ------------------------------------------------------------------ */
/* Philadelphia's summons                                              */
/* ------------------------------------------------------------------ */

/** The weekly chance Philadelphia calls the boss across the bridge (with the reasons). */
export function summonsChance(s: GameState): number {
  const ramp = Math.max(0, Math.min(1, (s.heat.family - 30) / 40));
  const short = (s.flags.bag_short ?? 0) > 0 ? 0.04 : 0;
  const known = s.respect >= 60 ? 0.01 : 0;
  return Math.min(0.3, 0.025 + known + 0.03 * wealthPressure(s) + 0.35 * ramp + short);
}

export function summonsSource(s: GameState): EventInstance | undefined {
  if (s.gameOver || s.week < SUMMONS_FROM || !s.action) return undefined;
  const A = s.action;
  if (A.summons !== undefined && s.week - A.summons < SUMMONS_GAP) return undefined;
  const philly = s.rivals.find((x) => x.id === 'philly');
  const don = philly ? s.characters[philly.leaderId] : undefined;
  if (!philly || !don?.alive || (player(s).imprisonedUntil ?? 0) > s.week) return undefined;
  if (r(s, 'summons') >= summonsChance(s)) return undefined;
  A.summons = s.week;
  A.stats.summons++;
  const cash = familyCash(s);
  const fine = Math.max(2000, Math.min(40000, Math.round((Math.max(0, cash) * 0.08) / 500) * 500));
  const odds = Math.max(20, Math.min(80, 30 + Math.round(s.respect / 3) + Math.round(opinion(s, don.id, s.playerId) / 4)));
  const cons = holder(s, 'consigliere');
  const why = s.heat.family >= 30 ? 'The noise you make reaches Philadelphia.' : cash > 150000 ? 'Word is the Shore had a very good year, and Philadelphia wants to see the man who had it.' : 'Philadelphia likes to look its people in the eye once a year.';
  return {
    iid: `ev${s.nextId++}`, defId: 'philly_summons', title: 'Summoned to Philadelphia',
    text: `A car comes for you at seven in the morning: ${don.firstName} ${don.lastName} wants to see you, today, in the back of a restaurant on Passyunk Avenue. ${why} You know what it costs to be asked.`,
    week: s.week, mandatory: true, priority: 82, defaultChoiceId: 'go', actors: [don.id], meta: { theme: 'institution' },
    choices: [
      {
        id: 'go', label: 'Go, and kiss the ring', detail: `−${fmt(fine)} · family heat −15 · respect −1 (the island sees you sent for)`, because: 'went to Philadelphia and paid',
        effects: [{ type: 'money', amount: -fine, category: 'tribute', label: 'Summoned to Philadelphia: the price of being asked' }, { type: 'heat', bar: 'family', amount: -15, label: 'Philadelphia is satisfied, for now' }, { type: 'respect', amount: -1, label: 'Summoned to Philadelphia' }, { type: 'opinion', from: don.id, to: s.playerId, amount: 5, reason: 'Came when he was called', decay: 1 }],
      },
      {
        id: 'argue', label: 'Go, and argue your end', detail: `${odds}% he hears you: −${fmt(Math.round(fine / 3))}, respect +2. If not: −${fmt(Math.round(fine * 1.5))}, respect −3, family heat +5. Family heat −10 either way.`, because: 'argued his end in Philadelphia',
        effects: [
          { type: 'heat', bar: 'family', amount: -10, label: 'You went when you were called' },
          { type: 'deed', op: { op: 'gamble', p: odds, label: 'Summoned to Philadelphia', ok: [{ type: 'money', amount: -Math.round(fine / 3), category: 'tribute', label: 'Philadelphia: a reasonable number' }, { type: 'respect', amount: 2, label: 'Stood up for his end in Philadelphia' }], bad: [{ type: 'money', amount: -Math.round(fine * 1.5), category: 'tribute', label: 'Philadelphia: the price of arguing' }, { type: 'respect', amount: -3, label: 'Put in his place in Philadelphia' }, { type: 'heat', bar: 'family', amount: 5, label: 'Philadelphia did not like the tone' }], okText: `${don.firstName} heard you out, laughed once, and named a reasonable number.`, badText: `${don.firstName} let you talk, then named a number half again as big. Nobody at the table looked at you.` } },
        ],
      },
      {
        id: 'send', label: cons ? `Send ${cons.firstName} with an envelope` : 'Send a man with an envelope', detail: `−${fmt(Math.round(fine * 1.2))} · respect −2 (they asked for you) · family heat −8`, because: 'sent a man to Philadelphia instead of going',
        disabledReason: cons ? undefined : 'No consigliere to send',
        effects: [{ type: 'money', amount: -Math.round(fine * 1.2), category: 'tribute', label: 'An envelope to Philadelphia, by hand' }, { type: 'respect', amount: -2, label: 'Sent a man when they asked for the boss' }, { type: 'heat', bar: 'family', amount: -8, label: 'Philadelphia took the envelope' }, { type: 'opinion', from: don.id, to: s.playerId, amount: -6, reason: 'Sent a man when I asked for him', decay: 1 }],
      },
    ],
  };
}

/** Philadelphia's envelope, swollen by the Family's money and by a bail-out it gave (events.ts envelopeSize). */
export function envelopeMult(s: GameState): number {
  const owes = s.flags.philly_owes ? (s.week - s.flags.philly_owes < 26 ? 0.25 : 0) : 0;
  return 1 + 0.5 * wealthPressure(s) + owes;
}
