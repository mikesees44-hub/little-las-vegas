import { genderize } from './pronouns';
import { actionSurrenders } from './handover';
import { previewAction } from './actions';
import { shadowDrafts } from './shadowBrief';
import { explainAction } from './advice';
import { selfInterest, tieTo } from './advisors';
import { mayPropose, needsBones } from './bones';
import { owned, staffFactor } from './business';
import { isInSeason } from './calendar';
import { CATALOG } from './catalog';
import { rankCandidates } from './candidates';
import { capos, crew, displayName, hasTrait, isFree, player } from './characters';
import { holder, SEAT_INFO } from './council';
import { chooseHeir } from './dynasty';
import { UNWASHED_SAFE } from './economy';
import { fmtMoney } from './effects';
import { fam } from './familyState';
import { challengePressure, successionCandidates } from './heir';
import { regime } from './hierarchy';
import { OPEN_FILE } from './longgame';
import { openGrievances } from './grievances';
import { PETITION_IDS } from './office';
import { whichRacket } from './racketHub';
import { earnerAction, hasEarner, kindWord, suggestFor } from './earners';
import { getRelation, opinion } from './relations';
import { honoreeOptions, suggestGuests } from './activities';
import { LIFESTYLE_IDS, LIFESTYLES } from './lifestyle';
import type { AlertKind } from './alerts';
import type { Character, GameState, PlayerAction, PlayerChoices, RivalId, Seat } from './types';

/**
 * The Sit-Down: the weekly council briefing.
 *
 * Each week the boss's people come in, one at a time — the underboss (the
 * money and the crews), the consigliere (the Table, Philadelphia, rivals,
 * the law), each capo (his crew and his district), the bagman or fixer when
 * the cops or the dirty money need a word, and the wife when the house does.
 * Each brings 0–2 items, ranked; each item is a sentence in his voice and
 * 2–3 ready-made options that are real `PlayerAction`s (or a link to the
 * screen that handles it), with his recommendation and his reason.
 *
 * Nothing here is a new mechanic: every item is read off the systems that
 * already exist (alerts, opportunities, the take, the Table, the case, the
 * books, grievances, the rackets) and every option is an order the player
 * could already give. A sharp, loyal advisor recommends the best option; a
 * weak one guesses, and a disloyal or greedy one leans toward what suits him
 * (subtle tells, never a label).
 *
 * Pure: reads the state, never writes it (rolls come from a hash of the week,
 * not the game's RNG). `setTrust` returns a new state; the delegation log is
 * written by `advanceWeek` through `recordDelegation`.
 */

export type SpeakerRole = 'underboss' | 'consigliere' | 'capo' | 'bagman' | 'wife';

export interface BriefChip {
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

/** Where an option (or the card's "Open …") takes the player instead of queuing an order. */
export interface BriefLink {
  /** Legacy tab id (resolved by the shell's route table). */
  tab?: string;
  charId?: string;
  trip?: string;
  /** Open the waiting decision with this event iid. */
  event?: string;
  /** Open the weekly take's office. */
  office?: boolean;
}

export interface BriefOption {
  id: string;
  /** The button verb ("Invite to dinner"). */
  label: string;
  action?: PlayerAction;
  link?: BriefLink;
  chips: BriefChip[];
  /** Odds it goes through, when not certain. */
  chance?: number;
  cost: number;
  /** One line: why an advisor would pick this. */
  why: string;
  /** Rough value used to rank (not shown). */
  value: number;
}

export interface BriefItem {
  /** Stable for the subject ("short:c12"): delegation, "not now" and tests key on it. */
  id: string;
  speaker: string;
  role: SpeakerRole;
  charId?: string;
  priority: number;
  /** Two or three words: "Vito's envelope". */
  topic: string;
  /** What he says, in his voice. */
  line: string;
  /** Includes 'wait' ("Not now") last. */
  options: BriefOption[];
  recommended: string;
  /** "Sal says: lean on him — he's been short three weeks." */
  reason: string;
  /** He steers away from the best option (hidden; the UI shows only `tell`). */
  biased: boolean;
  /** A subtle tell when the advice is off ("He doesn't look up when he says it."). */
  tell?: string;
  /** Small stuff a trusted advisor may handle himself. */
  routine: boolean;
  /** The drawer for a deep dive. */
  open?: { label: string; link: BriefLink };
  /** The alerts this item answers (folded out of the alert rail). */
  covers: { kind: AlertKind; charId?: string }[];
  /** A teaching line for new players. */
  lesson?: string;
}

export interface Speaker {
  /** 'underboss', 'consigliere', 'bagman', 'wife' or 'capo:<id>' (also the trust key). */
  key: string;
  role: SpeakerRole;
  charId?: string;
  name: string;
  /** "Underboss", "Capo · Pine Avenue". */
  title: string;
  /** 0..1: skill and loyalty in one (the UI shows a word, not the number). */
  quality: number;
  /** "Sharp", "Steady", "Out of his depth". */
  qualityWord: string;
  /** Nobody in the seat. */
  empty?: boolean;
  /** What to do about the empty seat. */
  nudge?: { text: string; link: BriefLink };
  /** One line before his items (the underboss's take, the capo's district). */
  summary?: string;
  items: BriefItem[];
}

export interface Briefing {
  week: number;
  speakers: Speaker[];
  /** Every seat, quiet ones too (the delegation list). */
  seats: Speaker[];
  /** Every item, best first. */
  items: BriefItem[];
  /** Decisions already on the desk (shown as a pointer, never repeated). */
  decisions: number;
  quiet: boolean;
}

/** Saved with the game (optional for old saves). */
export interface BriefingState {
  /** Speaker key -> he handles his routine items himself. */
  trust: Record<string, boolean>;
  log: BriefLogEntry[];
  /** The underboss and the consigliere at work: who handles what, this week's docket, their record (lieutenants.ts). */
  lt?: import('./lieutenants').LtState;
}

export interface BriefLogEntry {
  week: number;
  by: string;
  byId?: string;
  item: string;
  text: string;
}

/* ------------------------------------------------------------------ */
/* Deterministic dice (never the game's RNG: the UI calls this freely) */
/* ------------------------------------------------------------------ */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function pick<T>(s: GameState, salt: string, xs: readonly T[]): T {
  return xs[Math.floor(hash(`${s.seed}|${s.week}|${salt}`) * xs.length) % xs.length];
}

/* ------------------------------------------------------------------ */
/* Voices                                                              */
/* ------------------------------------------------------------------ */

type Register = 'hard' | 'smooth' | 'worried' | 'angle' | 'plain' | 'warm';

function register(c: Character | undefined, role: SpeakerRole): Register {
  if (!c) return 'plain';
  if (role === 'wife') return 'warm';
  if (hasTrait(c, 'Hot-headed') || hasTrait(c, 'Cruel')) return 'hard';
  if (hasTrait(c, 'Paranoid') || hasTrait(c, 'Cowardly')) return 'worried';
  if (hasTrait(c, 'Greedy') || hasTrait(c, 'Gambler')) return 'angle';
  if (hasTrait(c, 'Charming')) return 'smooth';
  return 'plain';
}

const OPENERS: Record<Register, string[]> = {
  hard: ['Listen.', 'I\'ll keep it short.', 'One thing, and it\'s not nice.', 'Here it is straight.', 'No point dressing it up.'],
  smooth: ['A word, if you have a minute.', 'You\'ll want to hear this one.', 'Before you ask — yes, I looked into it.', 'Something for your ear.', 'Let me tell you how I see it.'],
  worried: ['I don\'t like how this looks.', 'Maybe it\'s nothing. Maybe.', 'I keep turning this over.', 'Something\'s off.', 'Tell me I\'m wrong about this.'],
  angle: ['There\'s money in this, or there\'s a loss.', 'Let\'s talk numbers.', 'Here\'s the angle.', 'I did the arithmetic.', 'You want the short version.'],
  plain: ['', 'About this week.', 'Next thing.', 'You should know.', 'For what it\'s worth.'],
  warm: ['Before you go out again —', 'Sit down a minute.', 'I wasn\'t going to say anything, but —', 'Hear me out.', 'For the family\'s sake —'],
};

/** "Sal": the name his people use. */
export function shortName(c: Character | undefined): string {
  if (!c) return 'Somebody';
  return c.nickname && c.nickname.split(' ').length <= 2 ? c.nickname.replace(/^the /i, '') : c.firstName;
}

const she = (c?: Character) => (c?.gender === 'F' ? 'she' : 'he');
const him = (c?: Character) => (c?.gender === 'F' ? 'her' : 'him');
const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

interface OptSpec {
  id: string;
  label: string;
  action?: PlayerAction;
  link?: BriefLink;
  why: string;
  /** Extra weight for the advisor's own reasons (added to value only when he is self-interested). */
  self?: number;
  /** Extra plain value (the situation, e.g. a repeat offender). */
  bonus?: number;
}

const wait = (why = 'Let it ride a week.'): OptSpec => ({ id: 'wait', label: 'Not now', why });

function realize(s: GameState, specs: (OptSpec | undefined)[]): (BriefOption & { self: number })[] {
  const out: (BriefOption & { self: number })[] = [];
  for (const sp of specs) {
    if (!sp) continue;
    if (sp.action) {
      const p = previewAction(s, sp.action);
      if (p.disabledReason || p.cost > Math.max(0, s.money)) continue;
      const ex = explainAction(s, sp.action);
      const chips: BriefChip[] = [...ex.gains.slice(0, 2), ...ex.costs.slice(0, 2)].map((n) => ({ text: n.text, tone: n.tone }));
      out.push({ id: sp.id, label: sp.label, action: sp.action, chips, chance: ex.chance < 0.995 ? ex.chance : undefined, cost: p.cost, why: sp.why, value: ex.value + (sp.bonus ?? 0), self: sp.self ?? 0 });
    } else {
      out.push({ id: sp.id, label: sp.label, link: sp.link, chips: [], cost: 0, why: sp.why, value: sp.id === 'wait' ? (sp.bonus ?? 0) : 1 + (sp.bonus ?? 0), self: sp.self ?? 0 });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Who sits where                                                      */
/* ------------------------------------------------------------------ */

function qualityOf(s: GameState, c: Character | undefined, skill: keyof Character['attributes']): number {
  if (!c) return 0;
  const sk = Math.max(0, Math.min(1, (c.attributes[skill] - 30) / 50));
  const loyal = Math.max(0, Math.min(1, (opinion(s, c.id, s.playerId) + 60) / 120));
  return Math.round((sk * 0.65 + loyal * 0.35) * 100) / 100;
}

function qualityWord(q: number): string {
  return q >= 0.75 ? 'Sharp' : q >= 0.55 ? 'Steady' : q >= 0.35 ? 'Uneven' : 'Out of depth';
}

interface Seat0 {
  key: string;
  role: SpeakerRole;
  c?: Character;
  title: string;
  skill: keyof Character['attributes'];
  empty?: Speaker['nudge'];
}

function seats(s: GameState): Seat0[] {
  const out: Seat0[] = [];
  const ub = holder(s, 'underboss');
  out.push({ key: 'underboss', role: 'underboss', c: ub, title: 'Underboss', skill: 'leadership', empty: ub ? undefined : { text: 'Nobody is underboss: nobody counts the envelopes or tells you who came up short.', link: { tab: 'council' } } });
  const cons = holder(s, 'consigliere');
  out.push({ key: 'consigliere', role: 'consigliere', c: cons, title: 'Consigliere', skill: 'intrigue', empty: cons ? undefined : { text: 'Nobody is consigliere: nobody tells you what the Table, Philadelphia or the law are thinking.', link: { tab: 'council' } } });
  for (const k of capos(s)) {
    if (!isFree(s, k)) continue;
    const d = s.districts.find((x) => x.capoId === k.id);
    out.push({ key: `capo:${k.id}`, role: 'capo', c: k, title: d ? `Capo · ${d.name}` : 'Capo', skill: 'leadership' });
  }
  const bag = holder(s, 'bagman') ?? holder(s, 'fixer');
  out.push({ key: 'bagman', role: 'bagman', c: bag, title: bag && holder(s, 'bagman') === bag ? 'Bagman' : 'Fixer', skill: bag && holder(s, 'bagman') === bag ? 'business' : 'diplomacy' });
  const boss = player(s);
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife?.alive) out.push({ key: 'wife', role: 'wife', c: wife, title: wife.gender === 'F' ? 'Your wife' : 'Your husband', skill: 'diplomacy' });
  return out;
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

interface Draft {
  id: string;
  charId?: string;
  priority: number;
  topic: string;
  /** The fact, in his voice (variants). */
  says: string[];
  /** Said instead when his own read is to wait (a man never pitches a thing and advises against it in one breath). */
  saysIfWait?: string[];
  opts: (OptSpec | undefined)[];
  routine?: boolean;
  open?: BriefItem['open'];
  covers?: BriefItem['covers'];
  /** People the item is about (to avoid repeating a waiting decision). */
  about?: string[];
}

const via = (s: GameState): 'underboss' | 'direct' => (holder(s, 'underboss') ? 'underboss' : 'direct');
const nm = (c: Character) => shortName(c);

function shortStreak(s: GameState, capoId: string): number {
  const reps = s.tribute?.reports ?? [];
  let n = 0;
  for (let i = reps.length - 1; i >= 0; i--) {
    const cl = reps[i].crews?.find((x) => x.capoId === capoId);
    if (cl && cl.short > 0) n++;
    else break;
  }
  return n;
}

function latestReport(s: GameState) {
  const r = s.tribute?.reports;
  return r && r.length ? r[r.length - 1] : undefined;
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const num = (n: number) => NUM[n] ?? String(n);

function underbossItems(s: GameState, ub: Character | undefined): Draft[] {
  const out: Draft[] = [];
  const boss = player(s);
  const audience = s.pendingEvents.some((e) => e.defId === 'tribute_audience');
  // Who came up short (unless the audience is waiting: it covers the envelope itself).
  const rep = latestReport(s);
  if (rep && !audience) {
    for (const cl of (rep.crews ?? []).filter((x) => x.short >= Math.max(50, x.due * 0.05)).sort((a, b) => b.short - a.short).slice(0, 1)) {
      const k = s.characters[cl.capoId];
      if (!k?.alive || !isFree(s, k) || k.id === ub?.id) continue;
      const streak = shortStreak(s, k.id);
      const tied = ub ? tieTo(s, ub, k) : undefined;
      out.push({
        id: `short:${k.id}`, charId: k.id, priority: 600 + cl.short / 4 + streak * 150, topic: `${nm(k)}'s envelope`, about: [k.id],
        says: [
          `${displayName(k)} came up ${fmtMoney(cl.short)} short${streak >= 2 ? ` — that's ${num(streak)} weeks running` : ''}.`,
          `${nm(k)}'s crew paid ${fmtMoney(cl.paid)} of ${fmtMoney(cl.due)}.${streak >= 2 ? ` ${num(streak)[0].toUpperCase()}${num(streak).slice(1)} weeks in a row now.` : ' First time this season.'}`,
          `The envelope from ${nm(k)} was light by ${fmtMoney(cl.short)}.${streak >= 2 ? ' Again.' : ''}`,
        ],
        opts: [
          { id: 'lean', label: 'Lean on him', action: { kind: 'interact', id: 'threaten', target: k.id }, why: streak >= 2 ? `he's been short ${num(streak)} weeks` : 'so the others see it', bonus: streak >= 2 ? 900 + streak * 300 : -300, self: tied ? -1500 : 0 },
          { id: 'dinner', label: 'Have him to dinner', action: { kind: 'interact', id: 'dinner', target: k.id }, why: 'find out what\'s wrong before it gets worse', bonus: streak >= 2 ? 0 : 400, self: tied ? 600 : 0 },
          { id: 'office', label: 'Go over the count', link: { office: true }, why: 'see the whole envelope' },
          wait(streak >= 2 ? 'Let it go one more week.' : 'Everybody has a bad week.'),
        ],
        open: { label: 'Open the take', link: { tab: 'take' } },
      });
    }
  }
  // A capo with no steady earner of his own (earners.ts): give him one, one tap.
  for (const k of capos(s).filter((c) => c.faction === 'player' && isFree(s, c) && !hasEarner(s, c.id)).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const b = suggestFor(s, k);
    if (!b || out.some((d) => d.charId === k.id)) continue;
    const what = `${kindWord(b.kind)}${b.districtId ? ` in ${s.districts.find((d) => d.id === b.districtId)?.name ?? ''}` : ''}`;
    out.push({
      id: `earner:${k.id}`, charId: k.id, priority: 420 + (opinion(s, k.id, boss.id) < 0 ? 120 : 0), topic: `${nm(k)}'s earner`, about: [k.id],
      says: [
        `Give ${nm(k)} the ${what}. A capo needs one thing that's his.`,
        `${nm(k)} has nothing steady of his own. ${b.name} would do it.`,
        `Put ${b.name} under ${nm(k)}. He'll kick up every week and stop grumbling.`,
      ],
      opts: [
        { id: 'give', label: `Give him ${b.name}`, action: earnerAction(k.id, b.id), why: 'steady money every week, and a loyal capo', bonus: 900 },
        wait('He can wait for something better.'),
      ],
      routine: true,
      open: { label: 'Open the rackets', link: { tab: 'holdings' } },
    });
    break;
  }
  // Unhappy capos.
  for (const k of capos(s)) {
    const op = opinion(s, k.id, boss.id);
    if (op > -20 || !isFree(s, k) || k.id === ub?.id || out.some((d) => d.charId === k.id)) continue;
    out.push({
      id: `unhappy:${k.id}`, charId: k.id, priority: 700 - op * 15, topic: `${nm(k)} is sore`, about: [k.id], covers: [{ kind: 'unhappy', charId: k.id }],
      says: [
        `${displayName(k)} thinks ${op} of you. Sore capos skim and sit on orders.`,
        `${nm(k)}'s been talking. Nothing you can prove, but he's not happy (${op}).`,
        `Word is ${nm(k)} feels passed over. He thinks ${op} of you right now.`,
      ],
      opts: [
        { id: 'dinner', label: 'Invite to dinner', action: { kind: 'interact', id: 'dinner', target: k.id }, why: 'cheap, and it usually works' },
        { id: 'gift', label: 'Send a gift', action: { kind: 'interact', id: 'gift_small', target: k.id }, why: 'quicker, if he likes money' },
        wait('He\'ll come around.'),
      ],
      routine: true,
      open: { label: 'Open the capos', link: { tab: 'capos' } },
    });
  }
  // Men drifting toward a rival.
  for (const c of crew(s)) {
    if (!c.courtedBy && (c.defectStage ?? 0) < 1) continue;
    if (c.id === ub?.id) continue;
    const r = s.rivals.find((x) => x.id === c.courtedBy?.rival);
    out.push({
      id: `drift:${c.id}`, charId: c.id, priority: c.rank === 'capo' ? 1500 : 650, topic: `${nm(c)} and ${r?.shortName ?? 'a rival'}`, about: [c.id], covers: [{ kind: 'courted', charId: c.id }, { kind: 'defector', charId: c.id }],
      says: [
        `${displayName(c)} has been seen with ${r?.name ?? 'the other side'}.`,
        `${nm(c)} had coffee with ${r?.shortName ?? 'somebody'}'s people. Twice.`,
        `Somebody's making ${nm(c)} offers. ${cap(she(c))} hasn't said no.`,
      ],
      opts: [
        { id: 'dinner', label: 'Bring him to dinner', action: { kind: 'interact', id: 'dinner', target: c.id }, why: 'remind him who feeds him', bonus: 500 },
        { id: 'gift', label: 'Send a gift', action: { kind: 'interact', id: 'gift_small', target: c.id }, why: 'match the offer before he takes it' },
        { id: 'threaten', label: 'Warn him off', action: { kind: 'interact', id: 'threaten', target: c.id }, why: 'fear works where money doesn\'t', self: hasTrait(ub ?? c, 'Cruel') ? 500 : 0 },
        wait(),
      ],
      open: { label: 'Open his sheet', link: { charId: c.id } },
    });
  }
  // Short-handed places.
  const thin = owned(s).filter((b) => staffFactor(s, b) < 1);
  if (thin.length) {
    const hire = s.hirePool.filter((h) => h.kind === 'recruit').sort((a, b) => a.cost - b.cost)[0];
    out.push({
      id: 'staff', priority: 300 + thin.length * 120, topic: 'Short-handed', covers: [{ kind: 'staff' }],
      says: [
        `${thin.map((b) => b.name).slice(0, 2).join(' and ')} ${thin.length === 1 ? 'is' : 'are'} short of men. ${thin.length === 1 ? 'It earns' : 'They earn'} less every week like this.`,
        `We don't have the bodies for ${thin.map((b) => b.name).slice(0, 2).join(', ')}.`,
        `I'm moving men around and it's not enough: ${thin.length} place${thin.length > 1 ? 's' : ''} running thin.`,
      ],
      opts: [
        hire ? { id: 'hire', label: 'Hire a man', action: { kind: 'hire', specId: hire.id }, why: 'a body now beats a better one next month' } : undefined,
        { id: 'look', label: 'See who\'s available', link: { tab: 'crew' }, why: 'pick him yourself' },
        wait('We\'ll make do.'),
      ],
      routine: true,
    });
  }
  // Money: short, or idle.
  if (s.money < 2000) {
    out.push({
      id: 'broke', priority: 1200 + (2000 - s.money) / 2, topic: 'The treasury', covers: [{ kind: 'money' }],
      says: [`We're down to ${fmtMoney(s.money)}. Payroll doesn't care.`, `The family account is near empty: ${fmtMoney(s.money)}.`, `I can't stretch ${fmtMoney(s.money)} through the week.`],
      opts: [
        { id: 'shake', label: 'Shake down the bars', action: { kind: 'order', key: 'shakedown', via: via(s) }, why: 'fast money, some heat' },
        { id: 'collect', label: 'Collect the book', action: { kind: 'order', key: 'shylock', via: via(s) }, why: 'it\'s owed to us anyway' },
        wait('Ride it out.'),
      ],
      open: { label: 'Open the rackets', link: { tab: 'business' } },
    });
  } else if (s.money >= 9000 && owned(s).filter((b) => b.category === 'racket').length < 6) {
    const rk = whichRacket(s)[0];
    if (rk) {
      out.push({
        id: `racket:${rk.kind}`, priority: 260 + s.money / 80 + (isInSeason(s.date) ? 150 : 0), topic: `A new racket`,
        says: [
          `We're sitting on ${fmtMoney(s.money)}. ${cap(CATALOG[rk.kind].name.toLowerCase())} would pay.`,
          `Money in a drawer earns nothing. I'd start ${CATALOG[rk.kind].name.toLowerCase()}.`,
          `There's room for ${CATALOG[rk.kind].name.toLowerCase()}, and we have the cash.`,
        ],
        opts: [
          { id: 'start', label: 'Start it', action: { kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind: rk.kind } } }, why: rk.reasons.filter((r) => r.value > 0).slice(0, 1).map((r) => r.label.toLowerCase())[0] ?? 'it earns' },
          { id: 'lend', label: 'Put $2,500 on the street', action: { kind: 'lend', amount: 2500 }, why: 'five points a week, no new heat' },
          wait('Keep the cash.'),
        ],
        open: { label: 'Open the rackets', link: { tab: 'rackethub' } },
      });
    }
  }
  // Prospects with no bones.
  const raw = crew(s).filter((c) => c.rank === 'associate' && !c.specialty && isFree(s, c) && needsBones(s, c) && !s.bones?.jobs.some((j) => j.prospectId === c.id));
  if (raw.length >= 3) {
    const r = rankCandidates(s, { kind: 'bones', job: 'collection' });
    const best = r.candidates.find((c) => c.id === r.recommendedId && c.action && !c.disabledReason);
    const bc = best?.charId ? s.characters[best.charId] : undefined;
    if (best && bc) {
      out.push({
        id: 'bones', charId: bc.id, priority: s.books?.open ? 850 : 380, topic: 'Kids with no bones', about: [bc.id],
        says: [`${num(raw.length)[0].toUpperCase()}${num(raw.length).slice(1)} associates and not one has done anything for us yet. ${nm(bc)} is ready.`, `Nobody gets made without bones. Give ${nm(bc)} a collection.`, `${nm(bc)} keeps asking for work. Let's see what he's made of.`],
        opts: [{ id: 'job', label: 'Send him to collect', action: best.action, why: best.outcome }, wait()],
        routine: true,
      });
    }
  }
  return out;
}

function consigliereItems(s: GameState, cons: Character | undefined): Draft[] {
  const out: Draft[] = [];
  const boss = player(s);
  // A contract on the boss.
  const plot = s.schemes.find((x) => x.owner !== 'player' && x.discovered && x.kind === 'murder' && x.targetId === boss.id);
  if (plot) {
    const r = s.rivals.find((x) => x.id === plot.owner);
    out.push({
      id: 'plot', priority: 3000, topic: 'A contract on you', covers: [{ kind: 'scheme' }],
      says: [`${r?.name ?? 'Somebody'} has a contract out on you. ${plot.progress}% ready, from what I hear.`, `I'll say it once: they're coming for you. ${r?.shortName ?? 'Somebody'}'s people.`, `My ears say ${r?.shortName ?? 'a rival'} paid for a hit. On you.`],
      opts: [
        { id: 'guard', label: 'Underboss guards you', action: { kind: 'councilTask', seat: 'underboss', task: 'ub_guard' }, why: 'nobody gets close' },
        { id: 'bodyguards', label: 'Hire bodyguards', action: { kind: 'power', op: { op: 'bodyguards', on: true } }, why: 'pay for it and sleep' },
        wait('Maybe it\'s talk.'),
      ],
      open: { label: 'Jobs under way', link: { tab: 'schemes' } },
    });
  }
  // Disputes before the Table.
  for (const d of s.disputes.filter((x) => !x.ruling).slice(0, 2)) {
    const r = rankCandidates(s, { kind: 'lobby', disputeId: d.id });
    const ok = r.candidates.filter((c) => c.action && !c.disabledReason);
    const best = ok.find((c) => c.id === r.recommendedId) ?? ok[0];
    const alt = ok.find((c) => c.id === r.alternativeId && c !== best) ?? ok.find((c) => c !== best);
    const def = d.defendant === 'player';
    out.push({
      id: `dispute:${d.id}`, priority: 800 + (def ? 300 : 0) + (d.hearingWeek - s.week <= 1 ? 400 : 0), topic: 'The Table', covers: [{ kind: 'dispute' }],
      says: [`The Table hears it in week ${d.hearingWeek}: ${d.claim}`, `${d.claim} It goes before the Table in ${Math.max(0, d.hearingWeek - s.week)} week${d.hearingWeek - s.week === 1 ? '' : 's'}.`, `They sit on it in week ${d.hearingWeek}. ${def ? 'We\'re the ones answering.' : 'We brought it; we should win it.'}`],
      opts: [
        best ? { id: 'lobby', label: `Lobby ${best.name.replace(/ \(.*\)$/, '')}`, action: best.action, why: best.outcome } : undefined,
        alt ? { id: 'lobby2', label: `Lobby ${alt.name.replace(/ \(.*\)$/, '')}`, action: alt.action, why: alt.outcome } : undefined,
        wait('Let the facts speak.'),
      ],
      open: { label: 'Open the Table', link: { tab: 'table' } },
    });
  }
  // A rival's move on us.
  const mv = s.rivals.filter((x) => x.lastMove && x.lastMove.target === 'player' && s.week - x.lastMove.week <= 1 && x.kind === 'mob' && ['expand', 'strike', 'bribe', 'inform'].includes(x.lastMove.move)).sort((a, b) => b.lastMove!.week - a.lastMove!.week)[0];
  if (mv && mv.lastMove) {
    const d = s.districts.find((x) => (x.influence[mv.id] ?? 0) > 0 && (x.influence.player ?? 0) > 0);
    const hot = cons && (hasTrait(cons, 'Hot-headed') || hasTrait(cons, 'Vengeful'));
    out.push({
      id: `rival:${mv.id}`, priority: mv.lastMove.move === 'strike' ? 1100 : 550, topic: `${mv.shortName}`, covers: [{ kind: 'rival', charId: mv.leaderId }],
      says: [`${mv.lastMove.text}`, `You heard what ${mv.shortName} did. ${mv.lastMove.text}`, `${mv.shortName} moved on us this week. ${mv.lastMove.text}`],
      opts: [
        { id: 'hitback', label: 'Hit back', action: { kind: 'order', key: 'hitback', via: via(s) }, why: 'so the next one costs them', self: hot ? 900 : 0, bonus: mv.lastMove.move === 'strike' ? 600 : 0 },
        d ? { id: 'table', label: 'Take it to the Table', action: { kind: 'raiseDispute', dispute: 'reparations', rival: mv.id as RivalId, district: d.id }, why: 'Philadelphia makes them pay, and nobody bleeds', self: hot ? -600 : 300 } : undefined,
        cons ? { id: 'talk', label: 'Work on them quietly', action: { kind: 'councilTask', seat: 'consigliere', task: 'cons_relations', target: mv.id as RivalId }, why: 'peace is cheaper than war' } : undefined,
        wait('Don\'t give them the satisfaction.'),
      ],
      open: { label: 'Open Diplomacy', link: { tab: 'rivals' } },
    });
  }
  // Wars.
  for (const w of s.wars.slice(0, 1)) {
    const r = s.rivals.find((x) => x.id === w.rival);
    out.push({
      id: `war:${w.id}`, priority: 900 + Math.max(0, -w.score) * 10, topic: `The war with ${r?.shortName ?? 'them'}`, covers: [{ kind: 'war' }],
      says: [`The war with ${r?.name ?? 'them'} stands at ${w.score}.`, `War score ${w.score}. ${w.score < 0 ? 'We\'re losing men we can\'t replace.' : 'We have them on the back foot.'}`, `${r?.shortName ?? 'They'} won't quit on their own. Score's ${w.score}.`],
      opts: [
        { id: 'raid', label: 'Hit their spot', action: { kind: 'raid', warId: w.id }, why: 'press while we can', bonus: w.score >= 0 ? 400 : -200 },
        { id: 'terms', label: 'Offer peace', action: { kind: 'terms', warId: w.id, terms: 'white' }, why: 'everybody goes home', bonus: w.score < -20 ? 800 : 0 },
        wait(),
      ],
      open: { label: 'Open the wars', link: { tab: 'wars' } },
    });
  }
  // The boss's file and the case.
  const ev = boss.evidence ?? 0;
  const lg = s.legal && s.legal.personId === boss.id && s.legal.stage !== 'quiet' ? s.legal : undefined;
  if (ev >= OPEN_FILE - 8 || lg) {
    out.push({
      id: 'law', priority: 500 + ev * 20 + (lg ? 800 : 0), topic: lg ? 'Your case' : 'Your file', covers: [{ kind: 'evidence' }, { kind: 'law' }],
      says: lg
        ? [`The government's case is moving: ${lg.stage}. We need the lawyer now, not later.`, `${cap(lg.stage)}. I've seen men go away on less.`, `The case won't go away on its own. ${cap(lg.stage)}.`]
        : [`Your file is at ${Math.round(ev)}. At ${OPEN_FILE} the FBI opens a case.`, `You've been giving too many orders yourself. Your file's ${Math.round(ev)} thick.`, `The feds have ${Math.round(ev)} on you. Let the chain carry the orders.`],
      opts: [
        { id: 'lawyer', label: 'Retain the lawyer', action: { kind: 'legal', op: 'retainer' }, why: 'a good defense is bought early', bonus: lg ? 1500 : 200 },
        { id: 'lielow', label: 'Lie low', action: { kind: 'legal', op: 'lielow' }, why: 'nothing to write down if you do nothing' },
        wait(),
      ],
      open: { label: 'Open your case', link: { tab: 'law' } },
    });
  }
  // Family heat.
  if (s.heat.family >= 50) {
    out.push({
      id: 'heat:family', priority: (s.heat.family - 35) * 80, topic: 'Philadelphia', covers: [{ kind: 'heat' }],
      says: [`Philadelphia is unhappy with us (${s.heat.family}). At 80 they summon you.`, `Moretti's people are asking questions. Family heat ${s.heat.family}.`, `South Philly is watching. I'd send something before they send for you.`],
      opts: [
        { id: 'gift', label: 'Send Moretti a gift', action: { kind: 'order', key: 'gift', via: via(s) }, why: 'it cools fast, and Moretti remembers' },
        cons ? { id: 'table', label: 'Work the Table', action: { kind: 'councilTask', seat: 'consigliere', task: 'cons_table' }, why: 'slower, but it lasts', self: 300 } : undefined,
        wait(),
      ],
      routine: true,
    });
  }
  // Philadelphia's books (when no capo has a man to put up).
  // Someone pushing for the chair.
  const pushing = successionCandidates(s).map((c) => ({ c, p: challengePressure(s, c).score })).filter((x) => x.p >= 60 && x.c.id !== cons?.id).sort((a, b) => b.p - a.p)[0];
  if (pushing) {
    const c = pushing.c;
    out.push({
      id: `pressure:${c.id}`, charId: c.id, priority: 600 + pushing.p * 12, topic: `${nm(c)} wants more`, about: [c.id],
      says: [`${displayName(c)} is pushing for the chair. Not in words — yet.`, `${nm(c)} counts the days until you're gone. I'd give him something to do.`, `Ambition is fine in a young man. ${nm(c)}'s is getting loud.`],
      opts: [
        { id: 'dinner', label: 'Invite to dinner', action: { kind: 'interact', id: 'dinner', target: c.id }, why: 'keep him close' },
        { id: 'gift', label: 'Send a big gift', action: { kind: 'interact', id: 'gift_large', target: c.id }, why: 'buy a season of patience' },
        wait('Let him push. It tells us who follows him.'),
      ],
      open: { label: 'Open succession', link: { tab: 'succession' } },
    });
  }
  // Factions.
  for (const f of s.factions.slice(0, 1)) {
    const L = s.characters[f.leaderId];
    if (!L?.alive) continue;
    out.push({
      id: `faction:${f.leaderId}`, charId: L.id, priority: 700 + (f.stage ?? 0) * 300, topic: f.name ?? 'A faction', about: [L.id], covers: [{ kind: 'faction' }],
      says: [`${displayName(L)} has men behind him now. ${f.name ?? 'A faction'}.`, `There's a table inside our table. ${nm(L)} sits at the head of it.`, `${nm(L)}'s friends meet without you. That's a faction.`],
      opts: [
        { id: 'dinner', label: 'Sit down with him', action: { kind: 'interact', id: 'dinner', target: L.id }, why: 'hear what they want before they take it' },
        { id: 'threaten', label: 'Make an example', action: { kind: 'interact', id: 'threaten', target: L.id }, why: 'the rest go home', bonus: -200 },
        wait(),
      ],
      open: { label: 'Open grievances', link: { tab: 'grievances' } },
    });
  }
  // Our own plans, blown.
  const blown = s.schemes.find((x) => x.owner === 'player' && x.discovered);
  if (blown) {
    const tgt = blown.targetId ? s.characters[blown.targetId] : undefined;
    out.push({
      id: `blown:${blown.id}`, priority: 650 + (blown.kind === 'murder' ? 400 : 0), topic: 'A plan in the open', covers: [{ kind: 'scheme' }],
      says: [`They know about the ${blown.kind === 'murder' ? 'hit' : blown.kind}${tgt ? ` on ${displayName(tgt)}` : ''}. Every day it runs, it costs us.`, `Our ${blown.kind === 'murder' ? 'contract' : 'plan'}${tgt ? ` against ${shortName(tgt)}` : ''} is blown. Somebody talked.`, `I'd call it off. ${tgt ? `${shortName(tgt)} knows` : 'They know'} what we're doing.`],
      opts: [
        { id: 'cancel', label: 'Call it off', action: { kind: 'cancelScheme', schemeId: blown.id }, why: 'a blown plan only makes enemies', bonus: 900 },
        wait('Push through; it\'s too late to look weak.'),
      ],
      open: { label: 'Jobs under way', link: { tab: 'schemes' } },
    });
  }
  // Office hours: the town comes to ask (now and then, when the door can open).
  if (s.week % 4 === 2 && !s.pendingEvents.some((e) => PETITION_IDS.includes(e.defId) || e.defId.startsWith('audience')) && !previewAction(s, { kind: 'officeHours' }).disabledReason) {
    out.push({
      id: 'court', priority: 230, topic: 'Office hours', routine: true,
      says: ['There are people in town who need things. Let them ask you, not the priest.', 'Half the island wants a favor. Hold office hours; we\'ll know who owes us.', 'The barber, the widow, the man with the liquor license — they\'d like a word.'],
      opts: [{ id: 'hours', label: 'Hold office hours', action: { kind: 'officeHours' }, why: 'every favor granted is a favor owed', bonus: 400 }, wait()],
      open: { label: 'Hold court', link: { tab: 'office' } },
    });
  }
  // No heir.
  if (!chooseHeir(s, boss).heir) {
    out.push({
      id: 'heir', priority: 2500, topic: 'No heir', covers: [{ kind: 'heir' }],
      says: ['If something happens to you tomorrow, who sits in the chair? Nobody. That\'s how families end.', 'You need an heir. Today, if possible.', 'There\'s no one to follow you. The capos have noticed.'],
      opts: [{ id: 'house', label: 'See to the succession', link: { tab: 'succession' }, why: 'name someone, or marry' }, wait()],
    });
  }
  // How to rule.
  if (!boss.lifestyle) {
    const ids = LIFESTYLE_IDS.slice(0, 3);
    out.push({
      id: 'lifestyle', priority: 350, topic: 'What kind of boss', covers: [{ kind: 'lifestyle' }],
      says: ['Every boss is known for something. Decide what you\'ll be known for.', 'Muscle, money or friends in high places — pick one and get good at it.', 'The men want to know what kind of boss you are.'],
      opts: [...ids.map((id) => ({ id: `ls:${id}`, label: LIFESTYLES[id].name, action: { kind: 'lifestyle', focus: id } as PlayerAction, why: LIFESTYLES[id].text.toLowerCase().replace(/\.$/, '') })), wait()],
    });
  } else if (boss.lifestyle.points > 0) {
    const L = LIFESTYLES[boss.lifestyle.focus];
    const next = L.trees.map((t) => t.perks.find((p) => !boss.lifestyle!.perks.includes(p.id))).filter((p): p is NonNullable<typeof p> => !!p).slice(0, 2);
    if (next.length) out.push({
      id: 'perk', priority: 450, topic: 'Something learned', covers: [{ kind: 'lifestyle' }],
      says: ['You\'ve learned a thing or two this season. Use it.', 'Experience is worth nothing if you don\'t put it to work.', 'You\'re better at this than you were in the spring.'],
      opts: [...next.map((p) => ({ id: `perk:${p.id}`, label: p.name, action: { kind: 'perk', perk: p.id } as PlayerAction, why: p.text.toLowerCase().replace(/\.$/, '') })), wait()],
      routine: true,
    });
  }
  return out;
}

function bagmanItems(s: GameState, bag: Character | undefined): Draft[] {
  const out: Draft[] = [];
  const fixer = holder(s, 'fixer');
  const bagman = holder(s, 'bagman');
  if (s.heat.local >= 55) out.push({
    id: 'heat:local', priority: (s.heat.local - 40) * 70, topic: 'The cops', covers: [{ kind: 'heat' }],
    says: [`Local heat ${s.heat.local}. At 80 they raid.`, `The precinct is asking for more, or they start padlocking doors. Heat's ${s.heat.local}.`, `Sergeant on the boardwalk beat wants his envelope fatter. Local heat ${s.heat.local}.`],
    opts: [
      { id: 'cops', label: 'Pay the cops', action: { kind: 'order', key: 'cops', via: via(s) }, why: 'it cools for a while', self: bag && hasTrait(bag, 'Greedy') ? 600 : 0 },
      { id: 'laylow', label: 'Lay low', action: { kind: 'order', key: 'laylow', via: via(s) }, why: 'costs us a week of street money, costs nothing else' },
      fixer ? { id: 'fix', label: 'Fixer greases the cops', action: { kind: 'councilTask', seat: 'fixer', task: 'fix_cops' }, why: 'a little every week' } : undefined,
      wait(),
    ],
    routine: true,
  });
  if (s.heat.federal >= 50) out.push({
    id: 'heat:federal', priority: (s.heat.federal - 35) * 90, topic: 'The feds', covers: [{ kind: 'heat' }],
    says: [`Federal heat ${s.heat.federal}. At 80 they make arrests.`, `There's a car outside the club with Pennsylvania plates and two men who don't drink. The feds, ${s.heat.federal}.`, `Somebody in a gray suit is asking about our books.`],
    opts: [
      fixer ? { id: 'feds', label: 'Fixer cools the feds', action: { kind: 'councilTask', seat: 'fixer', task: 'fix_feds' }, why: 'friends at the federal building' } : undefined,
      { id: 'launder', label: 'Wash the money', action: { kind: 'order', key: 'launder', via: via(s) }, why: 'dirty money is what they follow' },
      { id: 'lowprofile', label: 'Lay down a low profile', action: { kind: 'edict', edict: 'lowprofile', on: true }, why: 'everybody keeps their heads down', self: -200 },
      wait(),
    ],
  });
  if (s.unwashed > UNWASHED_SAFE) out.push({
    id: 'unwashed', priority: 400 + (s.unwashed - UNWASHED_SAFE) / 30, topic: 'Dirty money', covers: [{ kind: 'money' }],
    says: [`${fmtMoney(s.unwashed)} in shoeboxes. Past ${fmtMoney(UNWASHED_SAFE)} the IRS notices.`, `I'm running out of places to put cash nobody can explain: ${fmtMoney(s.unwashed)}.`, `The dirty money's piling up. ${fmtMoney(s.unwashed)}.`],
    opts: [
      { id: 'launder', label: 'Wash it', action: { kind: 'order', key: 'launder', via: via(s) }, why: 'before somebody counts it for us' },
      bagman ? { id: 'task', label: 'Launder full time', action: { kind: 'councilTask', seat: 'bagman', task: 'bag_launder' }, why: 'the fronts wash more every week', self: 200 } : undefined,
      wait(),
    ],
    routine: true,
  });
  const late = s.loans.filter((l) => l.weeksLate >= 1).length;
  if (late >= 2) out.push({
    id: 'loans', priority: 300 + late * 60, topic: 'The book', covers: [{ kind: 'loan' }],
    says: [`${cap(num(late))} borrowers behind on the vig.`, `The book has ${num(late)} slow payers. They talk to each other.`, `${cap(num(late))} people think our money is a gift.`],
    opts: [{ id: 'collect', label: 'Collect the book', action: { kind: 'order', key: 'shylock', via: via(s) }, why: 'before the others stop paying too' }, wait()],
    routine: true,
    open: { label: 'Open the books', link: { tab: 'books' } },
  });
  return out;
}

function capoItems(s: GameState, k: Character): Draft[] {
  const out: Draft[] = [];
  const d = s.districts.find((x) => x.capoId === k.id);
  const men = regime(s, k.id).filter((c) => c.alive && c.id !== k.id && isFree(s, c));
  // A man ready to be made.
  if (s.books?.open) {
    const ready = men.filter((c) => c.rank === 'associate' && c.proposedWeek === undefined && mayPropose(s, c)).sort((a, b) => opinion(s, k.id, b.id) - opinion(s, k.id, a.id))[0];
    if (ready) out.push({
      id: `make:${ready.id}`, charId: ready.id, priority: 900, topic: `${nm(ready)} is ready`, about: [ready.id], covers: [{ kind: 'books' }],
      says: [`Philadelphia has the books open. ${displayName(ready)} has earned it.`, `I'll vouch for ${nm(ready)}. ${cap(she(ready))} did what we asked.`, `${nm(ready)} has been with me two summers. Put ${him(ready)} up.`],
      opts: [{ id: 'propose', label: 'Put him up', action: { kind: 'propose', charId: ready.id }, why: 'a made man earns more and stays' }, wait('Next time the books open.')],
      open: { label: 'Open membership', link: { tab: 'membership' } },
    });
  }
  // A grudge in his crew.
  const grudge = men.map((c) => ({ c, g: Math.max(getRelation(s, c.id, s.playerId)?.grievance ?? 0, ...openGrievances(s).filter((x) => x.charId === c.id).map((x) => x.severity)) })).filter((x) => x.g >= 50).sort((a, b) => b.g - a.g)[0];
  if (grudge) {
    const c = grudge.c;
    const friend = opinion(s, k.id, c.id) >= 30;
    out.push({
      id: `grudge:${c.id}`, charId: c.id, priority: 400 + grudge.g * 5, topic: `${nm(c)}'s grudge`, about: [c.id], covers: [{ kind: 'unhappy', charId: c.id }],
      says: [`${displayName(c)} is carrying something against you. I hear it in the car.`, `${nm(c)} won't say it to your face. ${cap(she(c))} says it to me.`, `One of mine, ${nm(c)}, feels you did ${him(c)} wrong.`],
      opts: [
        { id: 'dinner', label: 'Invite to dinner', action: { kind: 'interact', id: 'dinner', target: c.id }, why: 'a seat at your table settles most things' },
        { id: 'gift', label: 'Send a gift', action: { kind: 'interact', id: 'gift_small', target: c.id }, why: 'something to show you remember', self: friend ? 500 : 0 },
        wait('Grudges cool.'),
      ],
      routine: true,
    });
  }
  // His district: push, or the racket's standing decisions.
  if (d) {
    const rivalIn = Object.entries(d.influence).filter(([f, v]) => f !== 'player' && (v ?? 0) >= 15).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    if (rivalIn && (rivalIn[1] ?? 0) >= 25 && (d.influence.player ?? 0) < 90 && s.money >= 15000) {
      const r = s.rivals.find((x) => x.id === rivalIn[0]);
      out.push({
        id: `push:${d.id}`, priority: 280 + (rivalIn[1] ?? 0) * 4, topic: `${d.name}`,
        says: [`${r?.shortName ?? 'They'} still hold ${Math.round(rivalIn[1] ?? 0)}% of ${d.name}. Give me the money and I'll take it.`, `There's ground to take in ${d.name}. ${r?.shortName ?? 'They'} are soft right now.`, `My corners in ${d.name} could be twice what they are.`],
        saysIfWait: [`${r?.shortName ?? 'They'} still hold ${Math.round(rivalIn[1] ?? 0)}% of ${d.name}. I looked at pushing in. I don't think it's time.`, `There's ground in ${d.name} we could take. I'm not sure it's worth the fight yet.`],
        opts: [{ id: 'push', label: 'Push in', action: { kind: 'pushDistrict', district: d.id }, why: 'more corners, more take', self: 300 }, wait('Hold what we have.')],
        open: { label: 'Show on the map', link: { tab: 'map' } },
      });
    }
    const biz = owned(s).find((b) => b.districtId === d.id && b.category === 'racket' && !previewAction(s, { kind: 'econ', op: { type: 'racket', cmd: { c: 'advice', bizId: b.id } } }).disabledReason);
    if (biz) out.push({
      id: `run:${biz.id}`, priority: 240, topic: biz.name,
      says: [`${biz.name} runs the way the last man left it. Let me set it up right.`, `I know how ${biz.name} should run. Say the word.`, `Small things at ${biz.name} — who gets credit, how much we hold back. I'd change a couple.`],
      opts: [{ id: 'advice', label: 'Do it his way', action: { kind: 'econ', op: { type: 'racket', cmd: { c: 'advice', bizId: biz.id } } }, why: 'he runs it every day' }, wait()],
      routine: true,
      open: { label: 'Open the rackets', link: { tab: 'rackethub' } },
    });
  }
  return out;
}

/** Married or courting (as good as engaged): nobody looks for a match for him. */
function courting(s: GameState, id: string): boolean {
  return (s.romance?.rels ?? []).some((r) => r.ended === undefined && r.kind === 'courtship' && (r.a === id || r.b === id));
}

function wifeItems(s: GameState, w: Character): Draft[] {
  const out: Draft[] = [];
  if (!s.dyn) return out;
  const boss = player(s);
  const st = fam(s, boss.id).stress;
  if (st >= 50) {
    const host = { kind: 'dynasty', op: { type: 'host', activity: 'sunday', guests: suggestGuests(s, 'sunday') } } as PlayerAction;
    out.push({
      id: 'stress', priority: 300 + st * 8, topic: 'You', covers: [{ kind: 'family' }],
      says: [`You don't sleep. You think I don't notice? (stress ${st})`, `The children ask why you shout. You're wearing yourself down.`, `Come home for one Sunday. One. You need it.`],
      opts: [
        { id: 'sunday', label: 'Sunday dinner', action: host, why: 'the family at one table', bonus: 600 },
        { id: 'trip', label: 'Plan a trip', link: { trip: boss.id }, why: 'away from all of it' },
        wait('After the Season.'),
      ],
      open: { label: 'Open the house', link: { tab: 'activities' } },
    });
  }
  const wed = honoreeOptions(s, 'wedding')[0];
  if (wed && !s.dyn.activity) out.push({
    id: `wedding:${wed.id}`, charId: wed.id, about: [wed.id], priority: 260, topic: 'A wedding', covers: [{ kind: 'family' }],
    says: [`${wed.firstName} is married and nobody threw a party. People talk.`, `A wedding for ${wed.firstName} — it's how families like ours do business.`, `Let me plan ${wed.firstName}'s wedding. The whole shore would come.`],
    opts: [{ id: 'host', label: 'Throw the wedding', action: { kind: 'dynasty', op: { type: 'host', activity: 'wedding', guests: suggestGuests(s, 'wedding'), honoreeId: wed.id } } as PlayerAction, why: 'renown, and everybody in one room' }, wait()],
  });
  const heir = chooseHeir(s, boss).heir;
  if (heir && heir.id !== w.id && !heir.spouseId && !courting(s, heir.id) && heir.dynasty && fam(s, heir.id).path !== 'priest' && heir.birth && s.date.y - heir.birth.y >= 21) out.push({
    id: `match:${heir.id}`, charId: heir.id, about: [heir.id], priority: 220, topic: `${heir.firstName}'s future`, covers: [{ kind: 'family' }],
    says: [`${heir.firstName} should be married by now. A good house, a good name.`, `I've been talking to the mothers at St. Ann's about ${heir.firstName}.`, `A match for ${heir.firstName} would make an ally of somebody.`],
    opts: [{ id: 'match', label: 'Look for a match', link: { tab: 'marriages' }, why: 'an alliance for as long as it lasts' }, wait()],
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* The advisor's pick                                                  */
/* ------------------------------------------------------------------ */

const TELLS_SELF = ['He says it a little too quickly.', 'He doesn\'t look up from his coffee when he says it.', 'He has an answer ready before you finish asking.', 'He keeps one hand in his pocket.'];
const TELLS_WEAK = ['He hesitates, then shrugs.', 'He looks at his notes twice.', 'He isn\'t sure, and it shows.', 'He changes his mind once on the way.'];

function decide(s: GameState, sp: Seat0, d: Draft, opts: (BriefOption & { self: number })[], quality: number): { rec: BriefOption; biased: boolean; tell?: string } {
  const c = sp.c;
  const w = c ? selfInterest(s, c) : 0;
  const values = opts.map((o) => o.value);
  const spread = Math.max(300, Math.max(...values) - Math.min(...values));
  const best = opts.reduce((a, b) => (b.value > a.value ? b : a), opts[0]);
  let chosen = best;
  let top = -Infinity;
  for (const o of opts) {
    const noise = (hash(`${s.seed}|${s.week}|${d.id}|${o.id}|${sp.key}`) - 0.5) * spread * (1 - quality) * 1.6;
    const v = o.value + w * o.self + noise;
    if (v > top) { top = v; chosen = o; }
  }
  const biased = chosen.id !== best.id;
  const tell0 = biased ? (w >= 0.4 && opts.some((o) => o.self !== 0) ? pick(s, `tell:${d.id}`, TELLS_SELF) : pick(s, `tellw:${d.id}`, TELLS_WEAK)) : undefined;
  // The wife's tell is hers: "She isn't sure, and it shows."
  const tell = tell0 ? genderize(tell0, c) : undefined;
  return { rec: chosen, biased, tell };
}

/* ------------------------------------------------------------------ */
/* Building the briefing                                               */
/* ------------------------------------------------------------------ */

/** The man behind a speaker key ("capo:c21" → "Carlo Marino"): a seat key never reaches the screen. */
export function speakerLabel(b: Pick<Briefing, 'seats'>, key: string): string {
  const sp = b.seats.find((x) => x.key === key);
  if (sp && !sp.empty && sp.name) return sp.name;
  if (key.startsWith('capo:')) return 'your capo';
  return key ? `your ${key}` : 'somebody';
}

/** Per speaker and in all. */
export const MAX_PER_SPEAKER = 2;
export const MAX_ITEMS = 6;

function waitingAbout(s: GameState): Set<string> {
  const ids = new Set<string>();
  for (const e of s.pendingEvents) {
    for (const a of e.actors ?? []) ids.add(a);
    if (e.meta?.charId) ids.add(String(e.meta.charId));
  }
  ids.delete(s.playerId);
  return ids;
}

function underbossSummary(s: GameState): string | undefined {
  const rep = latestReport(s);
  if (!rep) return undefined;
  const short = (rep.crews ?? []).filter((c) => c.short > 0).length;
  const diff = rep.lastPresented !== undefined ? rep.presented - rep.lastPresented : undefined;
  const pending = s.pendingEvents.some((e) => e.defId === 'tribute_audience');
  return `The take: ${fmtMoney(rep.presented)}${diff !== undefined && diff !== 0 ? ` (${diff > 0 ? 'up' : 'down'} ${fmtMoney(Math.abs(diff))})` : ''}${short ? ` · ${num(short)} crew${short > 1 ? 's' : ''} short` : ' · everybody paid'}${pending ? ' · I\'m waiting in the office' : ''}.`;
}

export function capoSummary(s: GameState, k: Character): string | undefined {
  const d = s.districts.find((x) => x.capoId === k.id);
  if (!d) return undefined;
  const cl = latestReport(s)?.crews?.find((x) => x.capoId === k.id);
  return `${d.name}: ${Math.round(d.influence.player ?? 0)}% ours${cl ? ` · kicked up ${fmtMoney(cl.paid)}` : ''}.`;
}

/** This week's sit-down. Pure. */
export function briefing(s: GameState): Briefing {
  const speakers: Speaker[] = [];
  const decisions = s.pendingEvents.length;
  if (s.gameOver) return { week: s.week, speakers, seats: [], items: [], decisions, quiet: true };
  const busy = waitingAbout(s);
  const used = new Set<string>();
  const usedLines = new Set<string>();
  const all: BriefItem[] = [];
  for (const sp of seats(s)) {
    const c = sp.c;
    const quality = sp.empty ? 0 : qualityOf(s, c, sp.skill);
    const drafts = sp.empty ? [] : sp.role === 'underboss' ? underbossItems(s, c) : sp.role === 'consigliere' ? consigliereItems(s, c) : sp.role === 'bagman' ? bagmanItems(s, c) : sp.role === 'capo' ? capoItems(s, c!) : wifeItems(s, c!);
    // The shadow court: what the underboss raises, what the consigliere hears, a promise a loyal capo was made (shadowBrief.ts).
    if (!sp.empty && (sp.role === 'underboss' || sp.role === 'consigliere' || sp.role === 'capo')) drafts.push(...shadowDrafts(s, sp.role, c));
    const items: BriefItem[] = [];
    for (const d of drafts.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
      if (items.length >= MAX_PER_SPEAKER) break;
      if (used.has(d.id)) continue;
      if (d.about?.some((id) => busy.has(id))) continue;
      const opts = realize(s, d.opts);
      if (!opts.some((o) => o.id !== 'wait')) continue;
      // Nothing worth doing and nothing pressing: a quiet week stays quiet.
      const top = opts.reduce((a, b) => (b.value > a.value ? b : a), opts[0]);
      if (top.id === 'wait' && d.priority < 500) continue;
      used.add(d.id);
      const { rec, biased, tell } = decide(s, sp, d, opts, quality);
      const reg = register(c, sp.role);
      // Vary the words: an opener for his temper, one of the ways to say the fact; never the same line twice in one sitting.
      let line = '';
      for (let i = 0; i < 6; i++) {
        const op = pick(s, `${d.id}|o${i}`, OPENERS[reg]);
        const fact = pick(s, `${d.id}|f${i}`, rec.id === 'wait' && d.saysIfWait?.length ? d.saysIfWait : d.says);
        line = `${op ? `${op} ` : ''}${fact}`.trim();
        if (!usedLines.has(line)) break;
      }
      usedLines.add(line);
      const who = shortName(c);
      const reason = rec.id === 'wait' ? `${who} says: leave it — ${rec.why.replace(/\.$/, '').toLowerCase()}.` : `${who} says: ${rec.label.toLowerCase()} — ${rec.why.replace(/\.$/, '')}.`;
      items.push({
        id: d.id, speaker: sp.key, role: sp.role, charId: d.charId, priority: Math.round(d.priority), topic: d.topic, line,
        options: opts.map(({ self: _self, ...o }) => o), recommended: rec.id, reason, biased, tell,
        routine: !!d.routine, open: d.open, covers: d.covers ?? [],
      });
    }
    speakers.push({
      key: sp.key, role: sp.role, charId: c?.id, name: c ? displayName(c) : 'Nobody', title: sp.title, quality, qualityWord: qualityWord(quality),
      empty: sp.empty ? true : undefined, nudge: sp.empty,
      summary: sp.role === 'underboss' && c ? underbossSummary(s) : sp.role === 'capo' && c ? capoSummary(s, c) : undefined,
      items,
    });
    all.push(...items);
  }
  // Keep the sitting short: the most important items overall.
  const keep = new Set(all.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, MAX_ITEMS).map((i) => i.id));
  for (const sp of speakers) sp.items = sp.items.filter((i) => keep.has(i.id));
  const items = all.filter((i) => keep.has(i.id));
  // Who speaks: seats with something to say, the two council seats always (even to say "nothing"), and an empty seat's nudge.
  const shown = speakers.filter((sp) => sp.items.length || sp.empty && (sp.role === 'underboss' || sp.role === 'consigliere') || sp.role === 'underboss' || (sp.role === 'consigliere' && !!sp.charId));
  shown.sort((a, b) => order(a) - order(b) || (b.items[0]?.priority ?? 0) - (a.items[0]?.priority ?? 0));
  return { week: s.week, speakers: shown, seats: speakers, items, decisions, quiet: items.length === 0 };
}

function order(sp: Speaker): number {
  return sp.role === 'underboss' ? 0 : sp.role === 'consigliere' ? 1 : sp.role === 'capo' ? 2 : sp.role === 'bagman' ? 3 : 4;
}

/** The recommended orders of every item (what "Do what they recommend" queues), skipping ones already queued. */
export function recommendedActions(s: GameState, b: Briefing = briefing(s), queued: readonly PlayerAction[] = [], skip: readonly string[] = []): { item: BriefItem; option: BriefOption; action: PlayerAction }[] {
  const out: { item: BriefItem; option: BriefOption; action: PlayerAction }[] = [];
  const seen = new Set(queued.map((a) => JSON.stringify(a)));
  let money = s.money - queued.reduce((a, x) => a + previewAction(s, x).cost, 0);
  for (const it of b.items) {
    if (skip.includes(it.id)) continue;
    const o = it.options.find((x) => x.id === it.recommended);
    if (!o?.action) continue;
    // "Do what they recommend" never gives a man up: that is picked by hand or not at all (handover.ts).
    if (actionSurrenders(s, o.action)) continue;
    const k = JSON.stringify(o.action);
    if (seen.has(k) || o.cost > money) continue;
    seen.add(k);
    money -= o.cost;
    out.push({ item: it, option: o, action: o.action });
  }
  return out;
}

/** Small stuff: what a trusted advisor may do on his own (cheap, not violent, his own item). */
export function isRoutine(s: GameState, it: BriefItem, o: BriefOption | undefined): boolean {
  if (!it.routine || !o?.action) return false;
  const a = o.action;
  if (a.kind === 'interact' && ['threaten', 'whack', 'exile', 'demote', 'demand'].includes(a.id)) return false;
  if (actionSurrenders(s, a)) return false;
  return o.cost <= Math.max(500, Math.min(2500, s.money * 0.05));
}

/** What the trusted advisors will do this week on their own. Pure; `advanceWeek` applies and logs it. */
export function delegatedActions(s: GameState, choices: PlayerChoices = {}): { item: BriefItem; by: Speaker; action: PlayerAction; text: string }[] {
  const trust = s.briefing?.trust;
  if (!trust || !Object.values(trust).some(Boolean) || s.gameOver) return [];
  const b = briefing(s);
  const queued = choices.actions ?? [];
  const recs = recommendedActions(s, b, queued, choices.briefingSkip ?? []);
  const out: { item: BriefItem; by: Speaker; action: PlayerAction; text: string }[] = [];
  for (const r of recs) {
    const sp = b.speakers.find((x) => x.key === r.item.speaker);
    if (!sp || !trust[sp.key] || sp.empty || !isRoutine(s, r.item, r.option)) continue;
    const who = sp.charId ? shortName(s.characters[sp.charId]) : sp.name;
    out.push({ item: r.item, by: sp, action: r.action, text: `${who} took care of it: ${r.option.label.toLowerCase()} (${r.item.topic})` });
  }
  return out;
}

/** Writes this week's delegation into the save (called by `advanceWeek` on its clone). */
export function recordDelegation(s: GameState, week: number, done: ReturnType<typeof delegatedActions>): void {
  if (!done.length || !s.briefing) return;
  for (const d of done) {
    s.briefing.log.push({ week, by: d.by.key, byId: d.by.charId, item: d.item.id, text: d.text });
    s.chronicle.push({ week, date: { ...s.date }, text: d.text + '.', kind: 'decision' });
  }
  if (s.briefing.log.length > 40) s.briefing.log = s.briefing.log.slice(-40);
}

/** Trust an advisor with his small stuff (or take it back). Returns a new state. */
export function setTrust(s: GameState, key: string, on: boolean): GameState {
  const prev = s.briefing ?? { trust: {}, log: [] };
  const trust = { ...prev.trust };
  if (on) trust[key] = true;
  else delete trust[key];
  return { ...s, briefing: { ...prev, trust } };
}

/** What the trusted advisors did last week (for This Week). */
export function delegationLog(s: GameState, week = s.week - 1): BriefLogEntry[] {
  return (s.briefing?.log ?? []).filter((e) => e.week === week);
}

/** One subject a seat could raise, uncapped and unranked by any advisor (lieutenants.ts works from these). */
export interface SeatDraft {
  id: string;
  /** Whose items it came from ('capo' for a capo's district). */
  from: 'underboss' | 'consigliere' | 'bagman' | 'capo';
  charId?: string;
  priority: number;
  topic: string;
  says: string[];
  routine: boolean;
  /** Realized options (real orders that preview clean and are affordable), 'wait' left out. */
  opts: (BriefOption & { self: number })[];
}

/**
 * Every subject the underboss, the consigliere, the bagman and the capos could raise this week, with no
 * sitting's caps (two a man, six in all). The lieutenants' days are built from this one list, so what they
 * do is what the sit-down would have put in front of the boss. Pure.
 */
export function seatDrafts(s: GameState): SeatDraft[] {
  if (s.gameOver) return [];
  const out: SeatDraft[] = [];
  const add = (from: SeatDraft['from'], ds: Draft[]) => {
    for (const d of ds) {
      const opts = realize(s, d.opts).filter((o) => o.id !== 'wait' && !!o.action);
      if (!opts.length) continue;
      out.push({ id: d.id, from, charId: d.charId, priority: d.priority, topic: d.topic, says: d.says, routine: !!d.routine, opts });
    }
  };
  try { add('underboss', underbossItems(s, holder(s, 'underboss'))); } catch { /* a pillar not initialised yet */ }
  try { add('consigliere', consigliereItems(s, holder(s, 'consigliere'))); } catch { /* idem */ }
  try { add('bagman', bagmanItems(s, holder(s, 'bagman') ?? holder(s, 'fixer'))); } catch { /* idem */ }
  for (const k of capos(s)) if (isFree(s, k)) try { add('capo', capoItems(s, k)); } catch { /* idem */ }
  const seen = new Set<string>();
  return out.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}

/** "Sal — Sharp" for an empty-seat or a trust label. */
export function seatName(seat: Seat): string {
  return SEAT_INFO[seat].name;
}
