import { crew, displayName, hasTrait, isFree } from './characters';
import { finOf, seenWealth, FIN_GOAL_WORDS } from './crewFinance';
import { applyEffects, fmtMoney } from './effects';
import { GOAL_INFO } from './hierarchy';
import { isMyMan, isSurrender, actionSurrenders } from './handover';
import type { Ctx } from './ledger';
import { getRelation, opinion, setModifier } from './relations';
import { hashSeed, rand } from './rng';
import { fugitiveOf } from './travelState';
import type { ActionPreview } from './actions';
import type { Character, Choice, Effect, EventInstance, GameState, PlayerAction, Rank, RivalId } from './types';
import { FACTION_NAMES } from './world';

/**
 * MY MEN: taking care of your crew, and the whole crew watching how you do it.
 *
 * One place for every man: his money (cash, debts, what his family needs), his
 * loyalty, stress, heat, legal trouble, health and what he wants, and what the
 * boss can do for him (or to him):
 *
 *  - for his money: a bonus, a bigger end, cover his debt (even to a rival
 *    shylock), his family's bills, a job for his brother, a no-show job, his
 *    kid's tuition, the hospital bill; the envelope for everybody at Christmas;
 *  - for his safety: a guy on him, his family moved somewhere safe, a lawyer and
 *    bail, his family taken care of while he is inside, a visit, hiding him;
 *  - his back: when a rival, a cop or an outsider disrespects, robs, beats,
 *    arrests or shakes down one of the men, the boss hears of it ("Sal got
 *    slapped around by Kessler's guys") and answers: a sit-down demanding
 *    satisfaction, payback, war for him, or letting it go (they all notice);
 *  - discipline: a warning, a fine, a demotion, the shelf. Killing one of his
 *    own is only an explicit, confirmed order, and it costs the most of all.
 *
 * THE METER: "Does the boss have our back?" (0-100). Every man watches how
 * each man is treated. It moves with what the boss does (and does not do), and
 * it drives the men's loyalty (an opinion modifier on every man), informant
 * risk and poaching (both read that opinion), desertion and recruiting.
 *
 * State lives in `s.mymen` (optional: old saves have none and load unchanged).
 * Dice are hashes of (seed, week, purpose): the main stream is never touched.
 */

export type WrongBy = 'rival' | 'cop' | 'outsider';
export type WrongKind = 'slapped' | 'robbed' | 'beaten' | 'arrested' | 'shaken';
export type WrongAnswer = 'sitdown' | 'payback' | 'war' | 'drop';

export interface Wrong {
  id: string;
  charId: string;
  by: WrongBy;
  rival?: RivalId;
  kind: WrongKind;
  week: number;
  /** Week it lapses if the boss never answers (the underboss handles it, poorly). */
  due: number;
  /** Money taken from him, if any. */
  amt?: number;
  text: string;
  status: 'open' | WrongAnswer | 'lapsed';
  outcome?: string;
}

export interface MenState {
  /** "Does the boss have our back?" 0-100. */
  back: number;
  /** What moved it lately: [week, change, text]. */
  log: [number, number, string][];
  wrongs: Wrong[];
  /** Until week: a guy on him / his family moved / hidden / on the shelf / his family taken care of while he is inside. */
  guard: Record<string, number>;
  safe: Record<string, number>;
  hidden: Record<string, number>;
  shelf: Record<string, number>;
  inside: Record<string, number>;
  /** One-time things he has (no-show job, his brother's job). */
  perks: Record<string, string[]>;
  /** Last week each favor was done for each man (`id:op`), for the cooldowns. */
  last: Record<string, number>;
  /** Calendar year of the last envelope for everybody. */
  xmas?: number;
  month?: string;
  next: number;
}

export const BACK_START = 50;
/** The opinion modifier every man carries from the meter. */
export const BACK_MOD = 'Does the boss have our back?';

export function ensureMyMen(s: GameState): MenState {
  return (s.mymen ??= { back: BACK_START, log: [], wrongs: [], guard: {}, safe: {}, hidden: {}, shelf: {}, inside: {}, perks: {}, last: {}, next: 1 });
}

export function backMeter(s: GameState): number {
  return Math.round(s.mymen?.back ?? BACK_START);
}

/** -1 (they think he would sell them out) .. +1 (he would go to war for any of them). */
export function backFactor(s: GameState): number {
  return Math.max(-1, Math.min(1, (backMeter(s) - 50) / 50));
}

export function backWord(v: number): string {
  return v >= 80 ? 'He would go to war for any of us' : v >= 65 ? 'The boss takes care of his people' : v >= 45 ? 'They are waiting to see' : v >= 30 ? 'They wonder if he has their back' : 'They think he would sell them out';
}

/** Move the meter (a ledger of why is kept). */
export function moveBack(s: GameState, amount: number, text: string): void {
  if (!amount) return;
  const m = ensureMyMen(s);
  m.back = Math.max(0, Math.min(100, Math.round((m.back + amount) * 10) / 10));
  m.log.push([s.week, Math.round(amount * 10) / 10, text]);
  if (m.log.length > 24) m.log.splice(0, m.log.length - 24);
}

/** The meter's word on recruiting: men want to work for a boss who takes care of his people. */
export function backReasons(s: GameState): { label: string; value: number }[] {
  const v = Math.round(backFactor(s) * 15);
  return v ? [{ label: v > 0 ? 'Word is the boss takes care of his men' : 'Word is the boss does not stand by his men', value: v }] : [];
}

/** Desertion odds multiplier (monthly walk-outs): a crew that feels covered stays. */
export function desertMult(s: GameState): number {
  return 1 - 0.5 * backFactor(s);
}

function roll(s: GameState, k: string): number {
  return rand({ rng: hashSeed(`${s.seed}|men|${s.week}|${k}`) });
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export type MenAction =
  | { op: 'bonus'; id: string; amount: number }
  | { op: 'raise'; id: string }
  | { op: 'debt'; id: string }
  | { op: 'bills'; id: string }
  | { op: 'brother'; id: string }
  | { op: 'noshow'; id: string }
  | { op: 'tuition'; id: string }
  | { op: 'hospital'; id: string }
  | { op: 'christmas' }
  | { op: 'guard'; id: string }
  | { op: 'safety'; id: string }
  | { op: 'lawyer'; id: string }
  | { op: 'inside'; id: string }
  | { op: 'visit'; id: string }
  | { op: 'hide'; id: string }
  | { op: 'answer'; wrong: string; how: WrongAnswer }
  | { op: 'warn'; id: string }
  | { op: 'fine'; id: string; amount: number }
  | { op: 'demote'; id: string }
  | { op: 'shelf'; id: string }
  | { op: 'kill'; id: string; confirm: boolean };

export type MenOp =
  | MenAction
  /** The meter moves (from a decision elsewhere). */
  | { op: 'note'; text: string; amount: number }
  /** Protection a decision paid for already (Philadelphia comes for him). */
  | { op: 'protect'; id: string; how: 'guard' | 'hide' };

export const MEN_TITLE: Record<MenAction['op'], string> = {
  bonus: 'A bonus', raise: 'A bigger end', debt: 'Cover his debt', bills: 'Pay his family\'s bills', brother: 'A job for his brother', noshow: 'A no-show job',
  tuition: 'His kid\'s tuition', hospital: 'The hospital bill', christmas: 'An envelope for every man', guard: 'Put a guy on him', safety: 'Move his family somewhere safe',
  lawyer: 'A lawyer and bail', inside: 'Take care of his family while he is inside', visit: 'Visit him inside', hide: 'Hide him', answer: 'Answer for him',
  warn: 'A warning', fine: 'Fine him', demote: 'Demote him', shelf: 'Put him on the shelf', kill: 'Have him killed',
};

export const BONUS_AMOUNTS = [100, 250, 500, 1000];
export const FINE_AMOUNTS = [100, 500];

const ENVELOPE: Record<string, number> = { associate: 50, soldier: 100, capo: 300, underboss: 500, consigliere: 500 };
const BILLS: Record<string, number> = { associate: 250, soldier: 400, capo: 700, underboss: 900, consigliere: 900 };

/** Weeks before the same favor can be done again for the same man. */
const COOLDOWN: Partial<Record<MenAction['op'], number>> = { bonus: 4, raise: 12, bills: 8, tuition: 52, hospital: 12, visit: 4, warn: 2, fine: 4, shelf: 8 };

function since(s: GameState, id: string, op: string): number {
  const w = s.mymen?.last[`${id}:${op}`];
  return w === undefined ? 999 : s.week - w;
}

function inside(s: GameState, c: Character): boolean {
  return c.alive && (c.imprisonedUntil ?? 0) > s.week;
}

/** All he owes, and to whom. */
export function debtsOf(s: GameState, c: Character): { life: number; peers: { lender: string; out: number }[]; shylock: number; total: number } {
  const life = Math.round(s.tribute?.life?.[c.id]?.debt ?? 0);
  const peers = (finOf(s, c.id)?.loans ?? []).filter((d) => d.out > 0 && d.lender !== 'bank').map((d) => ({ lender: d.lender, out: Math.round(d.out) }));
  const shylock = c.debtTo?.amount ?? 0;
  return { life, peers, shylock, total: life + shylock + peers.reduce((a, p) => a + p.out, 0) };
}

const hasFamily = (c: Character) => !!(c.household?.wife || c.household?.kids?.length || c.spouseId);
const hasKids = (c: Character) => !!c.household?.kids?.length;

const opn = (s: GameState, c: Character, amount: number, reason: string, decay = 1): Effect => ({ type: 'opinion', from: c.id, to: s.playerId, amount, reason, decay });
const X = (op: MenOp, label?: string): Effect => ({ type: 'mymen', op, ...(label ? { label } : {}) }) as Effect;

function none(title: string, why: string): ActionPreview {
  return { title, effects: [], cost: 0, because: title.toLowerCase(), category: 'event', disabledReason: why };
}

function lowerRank(r: Rank): Rank | undefined {
  return r === 'capo' ? 'soldier' : r === 'soldier' ? 'associate' : undefined;
}

/** What the order costs and does, before he gives it. */
export function previewMen(s: GameState, a: MenAction): ActionPreview {
  if (a.op === 'christmas') {
    const men = crew(s).filter((c) => c.alive);
    const each = men.map((c) => ENVELOPE[c.rank] ?? 50);
    const cost = each.reduce((x, y) => x + y, 0);
    const dec = s.date.m === 12;
    const title = dec ? 'The Christmas envelope, for every man' : 'An envelope for every man';
    const yr = s.mymen?.xmas;
    return {
      title, detail: `${men.length} envelopes, by rank (an associate $50, a capo $300). ${dec ? 'At Christmas it means the most.' : 'Out of season it is a gesture; at Christmas it is a tradition.'}`,
      effects: [{ type: 'money', amount: -cost }, ...men.map((c) => opn(s, c, dec ? 8 : 5, dec ? 'The Christmas envelope' : 'An envelope from the boss')), X(a)],
      cost, because: dec ? 'gave every man his Christmas envelope' : 'sent every man an envelope', category: 'event',
      disabledReason: !men.length ? 'No men' : yr === s.date.y ? 'Already this year' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined,
    };
  }
  if (a.op === 'answer') return previewAnswer(s, a.wrong, a.how);
  const c = s.characters[a.id];
  const title0 = MEN_TITLE[a.op];
  if (!c || !isMyMan(s, c.id)) return none(title0, 'Not one of your men');
  const nm = `${c.firstName} ${c.lastName}`;
  const cd = COOLDOWN[a.op];
  const cool = cd && since(s, c.id, a.op) < cd ? `Done for him ${since(s, c.id, a.op)} week${since(s, c.id, a.op) === 1 ? '' : 's'} ago` : undefined;
  const m = s.mymen;
  const pay = (cost: number, title: string, detail: string, because: string, effects: Effect[], block?: string): ActionPreview => ({
    title, detail, effects: [...(cost ? [{ type: 'money', amount: -cost } as Effect] : []), ...effects, X(a)], cost, because, category: 'event',
    disabledReason: block ?? cool ?? (cost > 0 && s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined),
  });
  const jailed = inside(s, c);
  switch (a.op) {
    case 'bonus': {
      const amt = Math.max(50, Math.round(a.amount));
      return pay(amt, `A ${fmtMoney(amt)} bonus for ${nm}`, 'Cash in his hand, from you.', `gave ${c.firstName} a ${fmtMoney(amt)} bonus`, [{ type: 'wealth', charId: c.id, amount: amt }, opn(s, c, Math.min(15, 3 + Math.round(amt / 80)), 'A bonus from the boss')], jailed ? 'He is inside' : undefined);
    }
    case 'raise': {
      if (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere') {
        const keep = c.keep ?? 0.3;
        return pay(0, `A bigger end for ${nm}: keeps ${Math.round((keep + 0.05) * 100)}%`, 'He keeps 5% more of his district every week.', `gave ${c.firstName} a bigger end`, [{ type: 'contract', charId: c.id, keep: Math.round((keep + 0.05) * 100) / 100 }, opn(s, c, 12, 'Gave me a bigger end', 2)], keep >= 0.45 ? 'He already keeps the most a capo keeps' : undefined);
      }
      const next = c.policy === 'squeeze' ? 'tax' : c.policy === 'earn' ? undefined : 'earn';
      return pay(0, `A bigger end for ${nm}`, next === 'earn' ? 'You take less of his hustle: he keeps more.' : 'No more squeezing him.', `gave ${c.firstName} a bigger end`, next ? [{ type: 'policy', charId: c.id, policy: next }, opn(s, c, 10, 'Gave me a bigger end', 2)] : [], next ? undefined : 'He already keeps the most');
    }
    case 'debt': {
      const d = debtsOf(s, c);
      const parts = [d.life ? `the credit man ${fmtMoney(d.life)}` : '', ...d.peers.map((p) => `${s.characters[p.lender]?.firstName ?? 'a friend'} ${fmtMoney(p.out)}`), d.shylock && c.debtTo ? `${FACTION_NAMES[c.debtTo.rival]}'s shylock ${fmtMoney(d.shylock)}` : ''].filter(Boolean);
      return pay(d.total, `Cover ${nm}'s debts (${fmtMoney(d.total)})`, parts.length ? `He owes ${parts.join(', ')}. Paid off, all of it.` : 'He owes nobody.', `covered ${c.firstName}'s debts`, [...(c.debtTo ? [{ type: 'debtTo', charId: c.id, clear: true } as Effect] : []), ...d.peers.map((p) => ({ type: 'wealth', charId: p.lender, amount: p.out }) as Effect), opn(s, c, 18, 'Paid off my debts', 1)], d.total <= 0 ? 'He owes nobody' : undefined);
    }
    case 'bills': {
      const amt = BILLS[c.rank] ?? 300;
      return pay(amt, `Pay ${nm}'s family's bills (${fmtMoney(amt)})`, `The rent, the grocer, the coal man: two months of it. ${c.household?.wife ? `${c.household.wife} will know who paid.` : ''}`, `paid ${c.firstName}'s family's bills`, [{ type: 'wealth', charId: c.id, amount: amt }, opn(s, c, 10, 'Took care of my family\'s bills')], !hasFamily(c) ? 'He has no family to keep' : undefined);
    }
    case 'brother':
      return pay(800, `A job for ${nm}'s brother ($800)`, 'A word at the union hall: a card, a steady job on the docks or the Boardwalk.', `found ${c.firstName}'s brother a job`, [opn(s, c, 12, 'Got my brother a job', 0)], m?.perks[c.id]?.includes('brother') ? 'His brother already has one' : undefined);
    case 'noshow':
      return pay(1500, `A no-show job for ${nm} ($1,500)`, 'On the city payroll: about $40 a week he never shows up for. The ward leader takes his piece, and the papers sometimes look.', `put ${c.firstName} on a no-show job`, [opn(s, c, 10, 'Put me on a no-show job', 1), { type: 'heat', bar: 'local', amount: 1 }], m?.perks[c.id]?.includes('noshow') ? 'He already has one' : jailed ? 'He is inside' : undefined);
    case 'tuition':
      return pay(600, `${nm}'s kid's tuition ($600)`, 'A year at St. Ann\'s, the uniforms, the books.', `paid ${c.firstName}'s kid's tuition`, [opn(s, c, 12, 'Paid for my kid\'s school', 0)], !hasKids(c) ? 'He has no kids in school' : undefined);
    case 'hospital': {
      const amt = c.health < 40 ? 1200 : 600;
      return pay(amt, `${nm}'s hospital bill (${fmtMoney(amt)})`, 'Burdette Tomlin, the good doctors, the private room.', `paid ${c.firstName}'s hospital bill`, [{ type: 'health', charId: c.id, amount: 15 }, opn(s, c, 12, 'Paid my hospital bill')], c.health >= 70 ? 'He is healthy' : undefined);
    }
    case 'guard':
      return pay(800, `Put a guy on ${nm} ($800)`, 'Four weeks: one of your guys drives him, sits outside his house. Nobody touches him.', `put a guy on ${c.firstName}`, [opn(s, c, 6, 'Put a guy on me')], (m?.guard[c.id] ?? 0) > s.week ? 'He already has a guy on him' : jailed ? 'He is inside' : undefined);
    case 'safety':
      return pay(1000, `Move ${nm}'s family somewhere safe ($1,000)`, 'His wife and kids to her sister\'s in Vineland for three months, the rent paid.', `moved ${c.firstName}'s family somewhere safe`, [opn(s, c, 10, 'Kept my family safe', 0)], !hasFamily(c) ? 'He has no family' : (m?.safe[c.id] ?? 0) > s.week ? 'They are safe already' : undefined);
    case 'lawyer': {
      if (jailed) {
        const left = (c.imprisonedUntil ?? 0) - s.week;
        return pay(2000, `A lawyer and bail for ${nm} ($2,000)`, left <= 26 ? 'Bail tonight; the lawyer handles the rest. He comes home.' : `A long stretch (${left} weeks): the lawyer can only cut it in half.`, `got ${c.firstName} a lawyer and bail`, [opn(s, c, 14, 'Got me a lawyer and bail', 1)]);
      }
      const ev = c.evidence ?? 0;
      return pay(1500, `A lawyer for ${nm} ($1,500)`, 'Before they come for him: a lawyer who knows the county prosecutor.', `got ${c.firstName} a lawyer`, [{ type: 'evidence', charId: c.id, amount: -15 }, opn(s, c, 8, 'Got me a lawyer')], ev < 15 ? 'The law has nothing on him' : undefined);
    }
    case 'inside':
      return pay(600, `Take care of ${nm}'s family while he is inside ($600, then $100 a week)`, 'An envelope to his wife every week until he is home. A man inside who knows that does not talk.', `took care of ${c.firstName}'s family while he was inside`, [opn(s, c, 15, 'Took care of my family while I was inside', 0), { type: 'meter', from: c.id, to: s.playerId, meter: 'trust', amount: 12 }], !jailed ? 'He is not inside' : (m?.inside[c.id] ?? 0) > s.week ? 'His family is taken care of already' : undefined);
    case 'visit':
      return pay(0, `Visit ${nm} inside`, 'An afternoon at the county jail. The guards will tell somebody you came.', `visited ${c.firstName} inside`, [opn(s, c, 6, 'The boss came to see me inside'), { type: 'meter', from: c.id, to: s.playerId, meter: 'trust', amount: 5 }, { type: 'heat', bar: 'federal', amount: 1 }], !jailed ? 'He is not inside' : undefined);
    case 'hide': {
      const fug = fugitiveOf(s, c.id);
      return pay(1000, `Hide ${nm} ($1,000)`, 'A month out of sight: a farmhouse in Cumberland County, a cousin\'s back room. The witnesses cannot find him; neither can anybody else.', `hid ${c.firstName}`, [{ type: 'evidence', charId: c.id, amount: -5 }, opn(s, c, 8, 'Hid me when it was hot')], fug ? 'He is on the lam: see his trip (Trips & envoys)' : jailed ? 'He is inside' : (m?.hidden[c.id] ?? 0) > s.week ? 'He is hidden already' : undefined);
    }
    case 'warn':
      return pay(0, `A warning for ${nm}`, 'A quiet word: next time it is not a word.', `warned ${c.firstName}`, [opn(s, c, -2, 'The boss warned me'), { type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 6 }]);
    case 'fine': {
      const amt = Math.min(Math.max(0, Math.round(c.wealth)), Math.round(a.amount));
      return { title: `Fine ${nm} ${fmtMoney(a.amount)}`, detail: 'Out of his own pocket, into the Family\'s.', effects: [{ type: 'wealth', charId: c.id, amount: -amt }, { type: 'money', amount: amt }, opn(s, c, -8, 'The boss fined me', 1), X(a)], cost: 0, because: `fined ${c.firstName}`, category: 'event', disabledReason: cool ?? (amt < a.amount ? 'He does not have it' : undefined) };
    }
    case 'demote': {
      const r = lowerRank(c.rank);
      return pay(0, `Demote ${nm}${r ? ` to ${r}` : ''}`, 'Everybody sees it. He will remember it.', `demoted ${c.firstName}`, r ? [{ type: 'rank', charId: c.id, rank: r }, opn(s, c, -20, 'Demoted me', 0)] : [], !r ? (c.rank === 'associate' ? 'He is as low as it goes' : 'A seat on the council is changed in the council') : undefined);
    }
    case 'shelf':
      return pay(0, `Put ${nm} on the shelf`, 'Eight weeks of nothing: no work, no earning, no say. He sits and thinks about it.', `put ${c.firstName} on the shelf`, [opn(s, c, -12, 'Put me on the shelf', 1)], (m?.shelf[c.id] ?? 0) > s.week ? 'He is on the shelf already' : jailed ? 'He is inside' : undefined);
    case 'kill': {
      const rel = Object.values(s.characters).filter((x) => x.alive && x.id !== c.id && x.id !== s.playerId && (x.fatherId === c.id || c.fatherId === x.id || x.spouseId === c.id || (x.fatherId && x.fatherId === c.fatherId)));
      return {
        title: `Have ${nm} killed`, detail: 'One of your own. Every man in the family will know, and every one of them will wonder if he is next. Only on your explicit, confirmed order.',
        effects: [{ type: 'kill', charId: c.id, cause: 'killed on the boss\'s own order', killer: 'player' }, { type: 'crewOpinion', amount: -10, reason: `The boss had ${c.firstName} killed`, traitMods: { Cruel: 8, 'Loyal-to-a-fault': -6 } }, { type: 'heat', bar: 'local', amount: 6 }, ...rel.map((x) => ({ type: 'opinion', from: x.id, to: s.playerId, amount: -40, reason: `You had my ${x.spouseId === c.id ? 'husband' : 'family'} killed`, decay: 0 }) as Effect), X(a)],
        cost: 0, because: `had his own man ${c.firstName} killed`, category: 'event', warning: 'This kills one of your own men.',
        disabledReason: !a.confirm ? 'Confirm the order first' : undefined,
      };
    }
  }
  return none(title0, 'Unknown order');
}

/* ------------------------------------------------------------------ */
/* Have his back                                                       */
/* ------------------------------------------------------------------ */

export function wrongById(s: GameState, id: string): Wrong | undefined {
  return s.mymen?.wrongs.find((w) => w.id === id);
}

export function openWrongs(s: GameState): Wrong[] {
  return (s.mymen?.wrongs ?? []).filter((w) => w.status === 'open' && s.characters[w.charId]?.alive);
}

function byName(s: GameState, w: Wrong): string {
  if (w.by === 'rival' && w.rival) return `${s.rivals.find((r) => r.id === w.rival)?.shortName ?? FACTION_NAMES[w.rival]}'s guys`;
  return w.by === 'cop' ? 'a county detective' : 'some drunk from Philadelphia';
}

/** The war this answer would open (or the war already on). */
function warDistrict(s: GameState, w: Wrong): string | undefined {
  if (!w.rival) return undefined;
  const contested = s.districts.filter((d) => (d.influence.player ?? 0) > 0 && (d.influence[w.rival!] ?? 0) > 0).sort((a, b) => (b.influence[w.rival!] ?? 0) - (a.influence[w.rival!] ?? 0))[0];
  return (contested ?? s.districts.find((d) => d.capoId === w.charId || d.capoId === s.characters[w.charId]?.capoId) ?? s.districts.find((d) => (d.influence.player ?? 0) > 0) ?? s.districts[0])?.id;
}

export const ANSWER_LABEL: Record<WrongAnswer, string> = { sitdown: 'Sit-down: demand satisfaction', payback: 'Pay them back', war: 'Go to war for him', drop: 'Let it go' };

export function previewAnswer(s: GameState, wid: string, how: WrongAnswer): ActionPreview {
  const w = wrongById(s, wid);
  const title = ANSWER_LABEL[how];
  if (!w) return none(title, 'Nothing to answer');
  const c = s.characters[w.charId];
  if (!c) return none(title, 'He is gone');
  const r = w.rival ? s.rivals.find((x) => x.id === w.rival) : undefined;
  const closed = w.status !== 'open' ? 'Already answered' : !c.alive ? 'He is gone' : undefined;
  const nm = c.firstName;
  const act = (cost: number, label: string, detail: string, because: string, effects: Effect[], block?: string): ActionPreview => ({
    title: label, detail, effects: [...(cost ? [{ type: 'money', amount: -cost } as Effect] : []), ...effects, X({ op: 'answer', wrong: wid, how })], cost, because, category: 'event',
    disabledReason: closed ?? block ?? (cost > 0 && s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined),
  });
  switch (how) {
    case 'sitdown':
      return w.by === 'cop'
        ? act(300, `Talk to the captain about ${nm} ($300)`, 'An envelope at the precinct, a word about who he works for.', `talked to the captain about ${nm}`, [opn(s, c, 6, 'The boss went to the captain for me')])
        : act(0, `A sit-down over ${nm}: demand satisfaction`, `You demand an apology${w.amt ? ` and the ${fmtMoney(w.amt)} back` : ''}. They may give it; they may laugh.`, `demanded satisfaction for ${nm}`, [opn(s, c, 6, 'The boss stood up for me'), ...(r ? [{ type: 'rivalOpinion', rival: r.id, amount: -3, reason: `Called us to a sit-down over ${nm}` } as Effect] : [])]);
    case 'payback':
      return act(500, `Pay them back for ${nm} ($500)`, w.by === 'cop' ? 'The detective\'s car, a dark night. The precinct will know who.' : 'Some of your guys pay a visit. Nothing is said out loud.', `paid back ${byName(s, w)} for ${nm}`, [
        opn(s, c, 12, 'The boss paid them back for me'), { type: 'respect', amount: 2 }, { type: 'heat', bar: 'local', amount: w.by === 'cop' ? 8 : 4 },
        ...(r ? [{ type: 'rivalOpinion', rival: r.id, amount: -10, reason: `Hit our guys over ${nm}` } as Effect, { type: 'rivalResource', rival: r.id, muscle: -3 } as Effect] : []),
      ]);
    case 'war': {
      if (!r) return none(title, 'There is nobody to go to war with');
      if (!s.characters[r.leaderId]?.alive || r.kind !== 'mob') return none(title, 'They are not a family you can go to war with');
      const on = s.wars.find((x) => x.rival === r.id);
      if (on) return act(0, `Hit ${r.shortName} for ${nm} (the war is on)`, 'You are at war with them already: this one is for him.', `hit ${r.shortName} for ${nm}`, [{ type: 'warScore', warId: on.id, amount: 5 }, opn(s, c, 15, 'Went to war for me', 0), { type: 'respect', amount: 2 }]);
      const d = warDistrict(s, w);
      const sanctioned = (s.flags[`sanctionWar_${r.id}`] ?? 0) > s.week;
      return act(0, `Go to war with ${r.shortName} for ${nm}`, `For what they did to him. ${sanctioned ? 'The Table blessed it.' : 'Without the Table\'s blessing: Philadelphia will have something to say.'} The whole family will see what one of their own is worth to you.`, `went to war with ${r.shortName} for ${nm}`, [
        { type: 'flag', key: `grievance_${r.id}`, value: 1 }, ...(d ? [{ type: 'warStart', rival: r.id, district: d, cb: 'grievance', sanctioned } as Effect] : []), opn(s, c, 20, 'Went to war for me', 0), { type: 'respect', amount: 3 },
      ], d ? undefined : 'Nowhere to fight them');
    }
    case 'drop':
      return act(0, `Let it go (${nm})`, 'Nothing happens. Every man in the family notices nothing happened.', `let it go when ${byName(s, w)} went after ${nm}`, [opn(s, c, -10, 'The boss let it go when they went after me', 0), { type: 'crewOpinion', amount: -2, reason: `The boss let it go when they went after ${nm}` }]);
  }
}

/** The decision that brings it to the boss's desk. Answering it from the My Men panel works the same. */
export function buildWrongEvent(s: GameState, w: Wrong): EventInstance {
  const c = s.characters[w.charId];
  const hows: WrongAnswer[] = ['sitdown', 'payback', ...(w.by === 'rival' ? ['war' as const] : []), 'drop'];
  const choices: Choice[] = hows.map((how) => {
    const p = previewAnswer(s, w.id, how);
    return { id: how, label: p.title, detail: p.detail, effects: p.effects, because: p.because, disabledReason: p.disabledReason };
  });
  choices.push({ id: 'wait', label: 'Let me think on it', detail: `He waits for your word (until week ${w.due}). After that the underboss handles it his way, and the men notice you did not.`, effects: [], because: `thought about ${c?.firstName ?? 'him'}` });
  return {
    iid: `ev${s.nextId++}`, defId: 'mymen_wrong', week: s.week, mandatory: true, priority: 64,
    title: w.text, text: `${w.text}.${w.amt ? ` They took ${fmtMoney(w.amt)} off him.` : ''} The rest of the men are watching what you do about it.`,
    defaultChoiceId: 'wait', meta: { charId: w.charId, wrong: w.id }, actors: [w.charId], choices,
  };
}

/** Something happens to one of the men (a rival, a cop, an outsider). Exported for tests. */
export function raiseWrong(ctx: Ctx, c: Character, by: WrongBy, kind: WrongKind, rival?: RivalId): Wrong {
  const s = ctx.s;
  const m = ensureMyMen(s);
  const w: Wrong = { id: `wr${m.next++}`, charId: c.id, by, ...(rival ? { rival } : {}), kind, week: s.week, due: s.week + 3, text: '', status: 'open' };
  const who = byName(s, w);
  const nm = c.nickname ? `${c.firstName} "${c.nickname}"` : c.firstName;
  const fx: Effect[] = [];
  if (kind === 'robbed' || kind === 'shaken') {
    w.amt = Math.min(Math.max(0, Math.round(c.wealth)), 100 + Math.round(roll(s, `amt:${c.id}`) * 300));
    if (w.amt > 0) fx.push({ type: 'wealth', charId: c.id, amount: -w.amt });
  }
  if (kind === 'beaten') fx.push({ type: 'health', charId: c.id, amount: -15 });
  if (kind === 'arrested') fx.push({ type: 'imprison', charId: c.id, weeks: 3 });
  w.text = {
    slapped: `${nm} got slapped around by ${who}`, robbed: `${nm} got robbed by ${who}`, beaten: `${nm} got beaten up by ${who}`,
    arrested: `${nm} got picked up by ${who} on nothing`, shaken: `${nm} got shaken down by ${who}`,
  }[kind];
  if (fx.length) applyEffects(ctx, fx, { label: w.text, because: w.text, category: 'event' });
  m.wrongs.push(w);
  // Top 10 #10: at most one "your man was wronged" card a month; the rest wait in My Men (the underboss handles them when due).
  if (s.week - (s.flags.wrongCard ?? -99) >= 4) { s.flags.wrongCard = s.week; s.eventQueue.push(buildWrongEvent(s, w)); }
  ctx.log.push(`${w.text}.`);
  return w;
}

function weekWrongs(ctx: Ctx): void {
  const s = ctx.s;
  const m = ensureMyMen(s);
  // Old answered ones go; open ones past due are handled by the underboss, poorly, and the men notice.
  for (const w of m.wrongs) {
    if (w.status !== 'open' || s.week < w.due) continue;
    w.status = 'lapsed';
    const c = s.characters[w.charId];
    w.outcome = 'The underboss handled it his way. You never said a word.';
    if (c?.alive) applyEffects(ctx, [opn(s, c, -4, 'The boss never said a word about what they did to me', 1)], { label: w.text, because: 'never answered for one of his men', category: 'event' });
    moveBack(s, -3, `Never answered for ${c?.firstName ?? 'one of the men'}`);
  }
  m.wrongs = m.wrongs.filter((w) => w.status === 'open' || s.week - w.week < 26);
  // Something new happens to one of the men.
  const hostile = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  const angry = hostile.filter((r) => opinion(s, r.leaderId, s.playerId) <= -30).length;
  const p = Math.min(0.2, 0.06 + (s.wars.length ? 0.05 : 0) + angry * 0.02);
  if (openWrongs(s).length >= 2 || roll(s, 'wrong') >= p) return;
  const men = crew(s).filter((c) => isFree(s, c) && !(m.guard[c.id] > s.week) && !(m.hidden[c.id] > s.week) && !openWrongs(s).some((w) => w.charId === c.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (!men.length) return;
  const c = men[Math.floor(roll(s, 'who') * men.length)];
  const x = roll(s, 'by');
  if (hostile.length && x < 0.55) {
    const r = hostile[Math.floor(roll(s, 'rival') * hostile.length)];
    const kinds: WrongKind[] = ['slapped', 'robbed', 'beaten', 'shaken'];
    raiseWrong(ctx, c, 'rival', kinds[Math.floor(roll(s, 'kind') * kinds.length)], r.id as RivalId);
  } else if (x < 0.8) raiseWrong(ctx, c, 'cop', roll(s, 'kind') < 0.5 ? 'arrested' : 'shaken');
  else raiseWrong(ctx, c, 'outsider', roll(s, 'kind') < 0.5 ? 'robbed' : 'beaten');
}

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

const BACK_FOR: Partial<Record<MenAction['op'], number>> = {
  bonus: 1, raise: 2, debt: 3, bills: 2, brother: 2, noshow: 1, tuition: 2, hospital: 2, guard: 2, safety: 2, lawyer: 3, inside: 3, visit: 1, hide: 2,
  warn: 0, fine: -1, demote: -2, shelf: -1,
};

export function describeMenOp(_s: GameState, o: MenOp): string | undefined {
  if (o.op === 'note') return o.amount ? `"Does the boss have our back?" ${o.amount > 0 ? '+' : ''}${o.amount}` : undefined;
  if (o.op === 'protect') return o.how === 'guard' ? 'A guy on him' : 'Out of sight for a month';
  if (o.op === 'christmas') return '"Does the boss have our back?" +4';
  if (o.op === 'answer') return o.how === 'drop' ? 'The men notice (−8)' : `The men see it (+${o.how === 'war' ? 6 : o.how === 'payback' ? 4 : 2})`;
  if (o.op === 'kill') return 'The men will never forget it (−20)';
  const v = BACK_FOR[o.op];
  return v ? `"Does the boss have our back?" ${v > 0 ? '+' : ''}${v}` : undefined;
}

export function applyMenOp(ctx: Ctx, o: MenOp, label?: string): void {
  const s = ctx.s;
  const m = ensureMyMen(s);
  if (o.op === 'note') { moveBack(s, o.amount, o.text); return; }
  if (o.op === 'christmas') {
    m.xmas = s.date.y;
    moveBack(s, s.date.m === 12 ? 5 : 3, 'An envelope for every man');
    return;
  }
  if (o.op === 'protect') {
    const c = s.characters[o.id];
    if (!c?.alive) return;
    if (o.how === 'guard') m.guard[c.id] = Math.max(m.guard[c.id] ?? 0, s.week + 6);
    else { m.hidden[c.id] = Math.max(m.hidden[c.id] ?? 0, s.week + 4); c.busyUntil = Math.max(c.busyUntil ?? 0, s.week + 4); }
    moveBack(s, o.how === 'guard' ? 6 : 5, `Stood between ${c.firstName} and Philadelphia`);
    return;
  }
  if (o.op === 'answer') { answerWrong(ctx, o.wrong, o.how); return; }
  const c = s.characters[o.id];
  if (!c) return;
  m.last[`${c.id}:${o.op}`] = s.week;
  const add = (k: string) => { (m.perks[c.id] ??= []).includes(k) || m.perks[c.id].push(k); };
  switch (o.op) {
    case 'debt': {
      const life = s.tribute?.life?.[c.id];
      if (life) life.debt = 0;
      const fin = finOf(s, c.id);
      for (const d of fin?.loans ?? []) {
        if (d.lender === 'bank' || d.out <= 0) continue;
        const lf = finOf(s, d.lender);
        const n = lf?.assets.find((x) => x.k === 'note' && x.who === c.id && x.value > 0);
        if (n) n.value = 0;
        d.out = 0;
      }
      break;
    }
    case 'brother': add('brother'); break;
    case 'noshow': add('noshow'); break;
    case 'guard': m.guard[c.id] = s.week + 4; break;
    case 'safety': m.safe[c.id] = s.week + 12; break;
    case 'hide':
      m.hidden[c.id] = s.week + 4;
      c.busyUntil = Math.max(c.busyUntil ?? 0, s.week + 4);
      break;
    case 'lawyer':
      if (inside(s, c)) {
        const left = (c.imprisonedUntil ?? 0) - s.week;
        c.imprisonedUntil = left <= 26 ? s.week : s.week + Math.ceil(left / 2);
        ctx.log.push(left <= 26 ? `${displayName(c)} is out on bail.` : `${displayName(c)}'s lawyer cut his stretch to ${Math.ceil(left / 2)} weeks.`);
      }
      break;
    case 'inside': m.inside[c.id] = c.imprisonedUntil ?? s.week; break;
    case 'shelf':
      m.shelf[c.id] = s.week + 8;
      c.busyUntil = Math.max(c.busyUntil ?? 0, s.week + 8);
      break;
    case 'kill':
      moveBack(s, -20, `Had his own man ${c.firstName} killed`);
      return;
    default: break;
  }
  const v = BACK_FOR[o.op];
  if (v) moveBack(s, v, `${MEN_TITLE[o.op]}: ${c.firstName} ${c.lastName}`);
  void label;
}

function answerWrong(ctx: Ctx, wid: string, how: WrongAnswer): void {
  const s = ctx.s;
  const w = wrongById(s, wid);
  if (!w || w.status !== 'open') return;
  w.status = how;
  const c = s.characters[w.charId];
  const nm = c?.firstName ?? 'him';
  const r = w.rival ? s.rivals.find((x) => x.id === w.rival) : undefined;
  if (how === 'drop') { moveBack(s, -8, `Let it go when they went after ${nm}`); w.outcome = 'You let it go.'; return; }
  if (how === 'war') { moveBack(s, 6, `Went to war for ${nm}`); w.outcome = `War with ${r?.shortName ?? 'them'} for ${nm}.`; return; }
  if (how === 'payback') {
    moveBack(s, 4, `Paid them back for ${nm}`);
    w.outcome = 'Paid back.';
    if (w.amt && c?.alive) applyEffects(ctx, [{ type: 'wealth', charId: c.id, amount: w.amt }], { label: `${nm} gets his money back`, because: 'paid them back', category: 'event' });
    return;
  }
  // The sit-down: they give satisfaction, or they don't.
  moveBack(s, 2, `Demanded satisfaction for ${nm}`);
  if (w.by === 'cop') {
    if (c?.alive && inside(s, c)) c.imprisonedUntil = s.week;
    w.outcome = 'The captain let him go.';
    return;
  }
  const lean = r ? opinion(s, r.leaderId, s.playerId) : 0;
  const odds = Math.max(0.15, Math.min(0.9, (w.by === 'outsider' ? 0.7 : 0.4) + lean / 200 + (s.respect - 50) / 200));
  if (roll(s, `sit:${wid}`) < odds) {
    w.outcome = r ? `${r.shortName} apologized${w.amt ? ' and paid it back' : ''}.` : 'He came and apologized, hat in hand.';
    const fx: Effect[] = [{ type: 'respect', amount: 1 }];
    if (c?.alive && w.amt) fx.push({ type: 'wealth', charId: c.id, amount: w.amt });
    if (r && w.amt) fx.push({ type: 'rivalResource', rival: r.id, money: -w.amt });
    applyEffects(ctx, fx, { label: `Satisfaction for ${nm}`, because: 'demanded satisfaction', category: 'event' });
    moveBack(s, 1, `Got satisfaction for ${nm}`);
  } else {
    w.outcome = r ? `${r.shortName} laughed at the sit-down.` : 'Nobody came.';
    applyEffects(ctx, [{ type: 'respect', amount: -1 }], { label: `No satisfaction for ${nm}`, because: 'demanded satisfaction and got none', category: 'event' });
  }
}

/** A decision about one of the men was answered: the crew saw how he was treated. */
export function noteChoice(s: GameState, ev: EventInstance, ch: Choice): void {
  if (ev.defId === 'mymen_wrong' || ch.effects.some((e) => e.type === 'mymen')) return;
  if (isSurrender(s, ch)) {
    for (const e of ch.effects) {
      const id = (e as { charId?: string }).charId;
      if (id && isMyMan(s, id)) moveBack(s, -20, `Gave ${s.characters[id]?.firstName ?? 'one of the men'} up`);
    }
    return;
  }
  const helped = ch.effects.some((e) => e.type === 'opinion' && e.to === s.playerId && e.amount >= 10 && isMyMan(s, e.from));
  if (helped) moveBack(s, 1, ch.because);
}

/** An order was carried out: giving a man up by hand is the most noticed thing a boss does. */
export function noteOrder(s: GameState, a: PlayerAction): void {
  if (a.kind === 'mymen') return;
  if (actionSurrenders(s, a)) moveBack(s, -20, 'Had one of his own men killed or run off');
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

export function myMenWeek(ctx: Ctx): void {
  const s = ctx.s;
  // A save with nothing to keep stays as it was until the first thing happens (the meter starts at its default).
  const m = ensureMyMen(s);
  // Expired protection, the shelf, the hiding place.
  for (const k of ['guard', 'safe', 'hidden', 'shelf', 'inside'] as const) for (const id of Object.keys(m[k])) if (m[k][id] < s.week || !s.characters[id]?.alive) delete m[k][id];
  // The envelope to the families of the men inside; a man inside with no envelope is noticed.
  for (const id of Object.keys(m.inside)) {
    const c = s.characters[id];
    if (!c || !inside(s, c)) { delete m.inside[id]; continue; }
    if (s.money >= 100) applyEffects(ctx, [{ type: 'money', amount: -100, label: `${c.firstName}'s family while he is inside` }], { label: 'The envelope to the families inside', because: `kept ${c.firstName}'s family`, category: 'event' });
    else moveBack(s, -1, `${c.firstName}'s family's envelope did not come`);
  }
  // No-show jobs pay (the city's payroll).
  for (const [id, perks] of Object.entries(m.perks)) {
    const c = s.characters[id];
    if (perks.includes('noshow') && c?.alive && isFree(s, c)) applyEffects(ctx, [{ type: 'wealth', charId: c.id, amount: 40, label: 'No-show job (city payroll)' }], { label: 'No-show job', because: 'drew his no-show pay', category: 'event' });
  }
  weekWrongs(ctx);
  // The month: the meter drifts back toward waiting-to-see, men inside with nobody looking after their families are counted,
  // and every man's opinion carries what the crew thinks of how the boss treats them.
  const mk = `${s.date.y}-${s.date.m}`;
  if (m.month !== mk) {
    m.month = mk;
    if (m.back > 52) moveBack(s, -1, 'Time passes');
    else if (m.back < 48) moveBack(s, 1, 'Time passes');
    for (const c of crew(s)) if (inside(s, c) && !(m.inside[c.id] > s.week)) moveBack(s, -1, `${c.firstName} is inside and nobody looks after his family`);
    const v = Math.round(backFactor(s) * 10);
    for (const c of crew(s)) {
      const cur = getRelation(s, c.id, s.playerId)?.modifiers.find((x) => x.reason === BACK_MOD)?.value ?? 0;
      if (cur !== v) setModifier(s, c.id, s.playerId, BACK_MOD, v);
    }
  }
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

export interface ManRow {
  id: string;
  name: string;
  rank: Rank;
  side: string;
  cash: string;
  debts: string[];
  debtTotal: number;
  family: string;
  loyalty: number;
  stress: number;
  heat: number;
  legal: string;
  health: number;
  wants: string[];
  status: string[];
  open: Wrong[];
}

export function stressOf(s: GameState, c: Character): number {
  const d = debtsOf(s, c);
  const m = s.mymen;
  let v = 15;
  v += Math.min(30, d.total / 60);
  v += Math.min(25, (c.evidence ?? 0) / 3);
  if (c.health < 50) v += 15;
  if (inside(s, c)) v += 20;
  if (fugitiveOf(s, c.id)) v += 20;
  v += openWrongs(s).filter((w) => w.charId === c.id).length * 12;
  if (hasFamily(c) && since(s, c.id, 'bills') > 26 && c.wealth < 200) v += 10;
  if ((m?.guard[c.id] ?? 0) > s.week) v -= 10;
  if ((m?.safe[c.id] ?? 0) > s.week) v -= 8;
  if (hasTrait(c, 'Patient')) v -= 5;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function sideOf(s: GameState, c: Character): string {
  if (c.rank === 'underboss' || c.rank === 'consigliere') return 'The council';
  if (c.rank === 'capo') return s.districts.find((d) => d.capoId === c.id)?.name ?? 'No district';
  const k = c.capoId ? s.characters[c.capoId] : undefined;
  return k ? `${k.firstName}'s crew` : 'Unassigned';
}

export function manRow(s: GameState, c: Character, dev = false): ManRow {
  const d = debtsOf(s, c);
  const m = s.mymen;
  const debts = [
    ...(d.life ? [`the credit man ${fmtMoney(d.life)}`] : []),
    ...d.peers.map((p) => `${s.characters[p.lender]?.firstName ?? 'a friend'} ${fmtMoney(p.out)}`),
    ...(c.debtTo ? [`${FACTION_NAMES[c.debtTo.rival]}'s shylock ${fmtMoney(c.debtTo.amount)}`] : []),
  ];
  const kids = c.household?.kids?.length ?? 0;
  const family = hasFamily(c) ? `${c.household?.wife ? `wife ${c.household.wife}` : 'married'}${kids ? `, ${kids} kid${kids > 1 ? 's' : ''}` : ''}${(m?.safe[c.id] ?? 0) > s.week ? ' (moved somewhere safe)' : ''}${since(s, c.id, 'bills') < 9 ? ' (bills paid)' : c.wealth < 150 ? ' (short this month)' : ''}` : 'no family';
  const fug = fugitiveOf(s, c.id);
  const legal = inside(s, c) ? `inside until week ${c.imprisonedUntil}${(m?.inside[c.id] ?? 0) > s.week ? ' (family looked after)' : ''}` : fug ? 'on the lam' : (c.evidence ?? 0) >= 60 ? 'a grand jury is looking at him' : (c.evidence ?? 0) >= 30 ? 'the county has a file on him' : 'clean';
  const wants: string[] = [];
  if (c.goal) wants.push(GOAL_INFO[c.goal]);
  const fin = finOf(s, c.id);
  if (fin) wants.push(FIN_GOAL_WORDS[fin.goal]);
  const status: string[] = [];
  if ((m?.guard[c.id] ?? 0) > s.week) status.push('a guy on him');
  if ((m?.hidden[c.id] ?? 0) > s.week) status.push('hidden');
  if ((m?.shelf[c.id] ?? 0) > s.week) status.push('on the shelf');
  for (const p of m?.perks[c.id] ?? []) status.push(p === 'noshow' ? 'no-show job' : 'his brother works');
  return {
    id: c.id, name: displayName(c), rank: c.rank, side: sideOf(s, c), cash: seenWealth(s, c, dev), debts, debtTotal: d.total, family,
    loyalty: opinion(s, c.id, s.playerId), stress: stressOf(s, c), heat: Math.round(c.evidence ?? 0), legal, health: Math.round(c.health), wants, status,
    open: openWrongs(s).filter((w) => w.charId === c.id),
  };
}

/** Every man of the family, the ones who need something first. */
export function myMen(s: GameState, dev = false): ManRow[] {
  return crew(s).map((c) => manRow(s, c, dev)).sort((a, b) => b.open.length - a.open.length || b.stress - a.stress || a.name.localeCompare(b.name));
}

export const MONEY_OPS = ['bonus', 'raise', 'debt', 'bills', 'brother', 'noshow', 'tuition', 'hospital'] as const;
export const BACK_OPS = ['guard', 'safety', 'lawyer', 'inside', 'visit', 'hide'] as const;
export const DISCIPLINE_OPS = ['warn', 'fine', 'demote', 'shelf', 'kill'] as const;

/** The orders the panel offers for one man (each previewed with its cost and hours by the UI). */
export function menActionsFor(_s: GameState, id: string): { group: 'money' | 'back' | 'discipline'; action: PlayerAction }[] {
  const A = (op: MenAction): PlayerAction => ({ kind: 'mymen', op });
  return [
    ...MONEY_OPS.map((op) => ({ group: 'money' as const, action: A(op === 'bonus' ? { op, id, amount: 250 } : { op, id }) })),
    ...BACK_OPS.map((op) => ({ group: 'back' as const, action: A({ op, id }) })),
    ...DISCIPLINE_OPS.map((op) => ({ group: 'discipline' as const, action: A(op === 'fine' ? { op, id, amount: 100 } : op === 'kill' ? { op, id, confirm: false } : { op, id }) })),
  ];
}
