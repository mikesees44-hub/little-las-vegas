import { ageOn } from './calendar';
import { displayName } from './characters';
import { applyEffects } from './effects';
import { practiceDeed } from './bossSkills';
import { cloneState } from './engine';
import { journal } from './journal';
import { newCtx, type Ctx } from './ledger';
import { FEMALE_FIRST, MALE_FIRST } from './names';
import { inTheRanks } from './rankView';
import { addOpinion, changeMeter, opinion } from './relations';
import type { Character, Choice, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * PAY FOR THE WEDDING, STAND AS GODFATHER (GODFATHER_LOYALTY_SKILLS.md §A).
 *
 * When someone in the boss's circle has a daughter getting married (his men,
 * a civilian on his payroll, another family's people) or a baby to christen,
 * the offer comes to him: a Saturday in the datebook, an event card, a line on
 * the person's sheet (answerable there too). Paying for the whole wedding costs
 * real money and buys gratitude, a favor owed, respect and the father's
 * loyalty. Another family may take it as an olive branch or as an insult (the
 * odds are on the button; the dice are rolled when it lands, and the result is
 * written to Your File). Standing godfather is for life: the parents owe him,
 * the child is his godchild (kept here; a godson who grows up and wants in is
 * remembered by crewEvents' "the boy wants in").
 *
 * Built on what exists: the crew's own weddings and christenings
 * (crewEvents.ts: a "pay for all of it" answer, and "stand for the baby" now
 * makes a godchild), the capo's "stand godfather to his child"
 * (capos.ts), the house's godchildren (housesKin.ts KinRole 'godchild'), the
 * petitioner whose daughter is marrying (petitionData.ts).
 *
 * Deterministic: no dice from the main stream (rolls are hashes of the seed).
 * `GameState.gf` is optional, made by the first answer.
 */

/** A godchild: [father's id, the child's name, the week, 1 for a boy]. */
export type GodChild = [string, string, number, 0 | 1];

export interface GfState {
  v: 1;
  g: GodChild[];
  /** Week of the last offer answered (the gap between offers). */
  cd?: number;
  st: { paid: number; god: number; branch: number; insult: number };
}

export const GOD_CAP = 40;
/** Weeks between offers of this module's own (the crew's own events have theirs). */
export const GF_GAP = 6;

export type GfOp =
  /** He paid for a wedding (all of it, or the reception): the father remembers; another family rolls. */
  | { op: 'pay'; who: string; nm: string; scope: 'all' | 'rec'; fr?: RivalId; p?: number }
  /** He stood godfather. */
  | { op: 'god'; who: string; nm: string; male: 0 | 1; fr?: RivalId }
  /** An offer answered (the gap starts). */
  | { op: 'seen' };

export function ensureGf(s: GameState): GfState {
  if (!s.gf) s.gf = { v: 1, g: [], st: { paid: 0, god: 0, branch: 0, insult: 0 } };
  const G = s.gf;
  G.g ??= [];
  G.st ??= { paid: 0, god: 0, branch: 0, insult: 0 };
  return G;
}

/** For upgradeSave: fills in a save that has the key, never makes one. */
export function ensureGfSave(s: GameState): GfState | undefined {
  return s.gf ? ensureGf(s) : undefined;
}

function hroll(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const pickBy = <T,>(xs: readonly T[], key: string): T => xs[Math.floor(hroll(key) * xs.length) % xs.length];
const $ = (n: number) => `$${n.toLocaleString('en-US')}`;
const RIVAL_NAMES: Partial<Record<RivalId, string>> = { manno: 'Manno', feldstein: 'Feldstein', kessler: 'Kessler', philly: 'Philadelphia' };

/** Godchildren of the boss through this person (the father). */
export function godchildrenOf(s: GameState, fatherId: string): GodChild[] {
  return (s.gf?.g ?? []).filter((g) => g[0] === fatherId);
}

/** Is this child (by name) the boss's godchild? */
export function isGodchild(s: GameState, fatherId: string, name: string): boolean {
  return (s.gf?.g ?? []).some((g) => g[0] === fatherId && g[1] === name);
}

/** The odds another family takes a paid reception as respect, not an insult. */
export function branchOdds(s: GameState, fr: RivalId, who: string): number {
  const r = s.rivals.find((x) => x.id === fr);
  let p = 0.55 + opinion(s, who, s.playerId) / 200 + ((s.characters[s.playerId]?.attributes.diplomacy ?? 50) - 50) / 250;
  if (r?.war) p -= 0.3;
  else if (r?.feud) p -= 0.2;
  return Math.max(0.1, Math.min(0.9, Math.round(p * 20) / 20));
}

export function describeGfOp(s: GameState, o: GfOp): string | undefined {
  switch (o.op) {
    case 'pay':
      return o.fr ? `${Math.round((o.p ?? 0.5) * 100)}% the ${RIVAL_NAMES[o.fr] ?? 'other'} family takes it as respect; else as an insult` : `${s.characters[o.who]?.firstName ?? 'He'} will remember who paid`;
    case 'god':
      return `${o.nm} is your godchild, for life`;
    default:
      return undefined;
  }
}

export function applyGfOp(ctx: Ctx, o: GfOp): void {
  const s = ctx.s;
  const G = ensureGf(s);
  const B = s.playerId;
  G.cd = s.week;
  if (o.op === 'seen') return;
  const c = s.characters[o.who];
  if (!c) return;
  if (o.op === 'pay') {
    G.st.paid++;
    if (!o.fr) return;
    const r = s.rivals.find((x) => x.id === o.fr);
    const won = hroll(`${s.seed}|gf|${o.who}|${s.week}`) < (o.p ?? 0.5);
    const fam = RIVAL_NAMES[o.fr] ?? 'other';
    if (won) {
      G.st.branch++;
      addOpinion(s, o.who, B, `Paid for my daughter's ${o.scope === 'all' ? 'wedding' : 'reception'}`, 14, 1);
      changeMeter(s, o.who, B, 'trust', 8);
      if (r && s.characters[r.leaderId]?.alive && r.leaderId !== o.who) addOpinion(s, r.leaderId, B, 'Showed our family respect', 6, 1);
      ctx.log.push(`The ${fam} family took the reception as respect.`);
      journal(s, { t: `The ${fam} family took it as respect`, x: `You paid for ${c.firstName}'s daughter ${o.nm}'s ${o.scope === 'all' ? 'wedding' : 'reception'}. An olive branch, and they took it.`, p: [o.who], c: 'rivals', src: 'gf', m: 0 });
    } else {
      G.st.insult++;
      addOpinion(s, o.who, B, 'Thinks he can buy my family', -10, 1);
      changeMeter(s, o.who, B, 'grievance', 6);
      if (r && s.characters[r.leaderId]?.alive && r.leaderId !== o.who) addOpinion(s, r.leaderId, B, 'Insulted one of ours at a wedding', -5, 1);
      ctx.log.push(`The ${fam} family took the reception as an insult.`);
      journal(s, { t: `The ${fam} family took it as an insult`, x: `You offered to pay for ${c.firstName}'s daughter ${o.nm}'s reception. ${c.firstName} sent the money back with a note.`, p: [o.who], c: 'rivals', src: 'gf', m: 0 });
    }
    return;
  }
  // Godfather: for life.
  G.st.god++;
  if (!G.g.some((g) => g[0] === o.who && g[1] === o.nm)) G.g.push([o.who, o.nm, s.week, o.male]);
  if (G.g.length > GOD_CAP) G.g = G.g.filter((g) => s.characters[g[0]]?.alive).slice(-GOD_CAP);
  if (o.fr) {
    const r = s.rivals.find((x) => x.id === o.fr);
    if (r && s.characters[r.leaderId]?.alive && r.leaderId !== o.who) addOpinion(s, r.leaderId, B, 'Stood for one of our babies', 5, 1);
  }
}

/* ------------------------------------------------------------------ */
/* Who is in the circle                                                */
/* ------------------------------------------------------------------ */

type Circle = 'crew' | 'payroll' | 'rival' | 'pad';

function circleOf(s: GameState, c: Character): Circle | undefined {
  if (!c.alive || c.id === s.playerId || c.dynasty) return undefined;
  if (c.faction === 'player' && c.rank !== 'civilian' && !c.outside) return 'crew';
  if (s.payroll?.hires[c.id]) return 'payroll';
  if (c.outside === 'cop' || c.outside === 'politician') return 'pad';
  if ((c.faction === 'manno' || c.faction === 'feldstein' || c.faction === 'kessler') && (c.rank === 'capo' || s.rivals.some((r) => r.leaderId === c.id))) return 'rival';
  return undefined;
}

interface Offer { k: 'w' | 'b'; who: Character; nm: string; male: 0 | 1; circle: Circle; real: boolean }

/** A daughter of marrying age: from his household if he has one, else one of the right age. */
function bride(s: GameState, c: Character, key: string): { nm: string; real: boolean } | undefined {
  const d = (c.household?.kids ?? []).find((k) => !k.male && s.date.y - k.born >= 19 && s.date.y - k.born <= 30);
  if (d) return { nm: d.name, real: true };
  const age = ageOn(c.birth, s.date);
  if (age < 44 || age > 66) return undefined;
  return { nm: pickBy(FEMALE_FIRST[c.ethnicity] ?? FEMALE_FIRST.Italian, key), real: false };
}

function offers(s: GameState): Offer[] {
  const out: Offer[] = [];
  const key = `${s.seed}|gf|${s.week}`;
  for (const c of Object.values(s.characters)) {
    const circle = circleOf(s, c);
    if (!circle) continue;
    const age = ageOn(c.birth, s.date);
    const b = bride(s, c, `${key}|${c.id}`);
    if (b && circle !== 'pad') out.push({ k: 'w', who: c, nm: b.nm, male: 0, circle, real: b.real });
    // A baby: a young father on the payroll or the pad, another family's young capo, or a grandchild for one of your older capos.
    const young = age >= 23 && age <= 40 && c.gender === 'M';
    const grand = circle === 'crew' && c.rank === 'capo' && age >= 48;
    if ((young && circle !== 'crew') || grand) {
      const male = hroll(`${key}|${c.id}|sex`) < 0.52 ? 1 : 0;
      out.push({ k: 'b', who: c, nm: pickBy((male ? MALE_FIRST : FEMALE_FIRST)[c.ethnicity] ?? MALE_FIRST.Italian, `${key}|${c.id}|n`), male, circle, real: false });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The event                                                           */
/* ------------------------------------------------------------------ */

const DAY = 5; // Saturday

function fx(label: string, ...xs: Effect[]): Effect[] {
  return xs.map((e) => ({ ...e, label }));
}

/** The choices of a wedding offer (also the sheet's buttons). */
export function weddingChoices(s: GameState, c: Character, nm: string, fr?: RivalId): Choice[] {
  const B = s.playerId;
  const label = `${nm}'s wedding`;
  const first = c.firstName;
  const seen: Effect = { type: 'gf', op: { op: 'seen' } };
  if (fr) {
    const p = branchOdds(s, fr, c.id);
    return [
      { id: 'payall', label: `Offer to pay for the reception (${$(2500)}) — ${Math.round(p * 100)}% they take it as respect`, detail: `An olive branch to the ${RIVAL_NAMES[fr]} family, in front of everybody. Or an insult: some men will not be bought a cake.`, because: `offered to pay for ${first}'s daughter's reception`, effects: fx(label, { type: 'money', amount: -2500 }, { type: 'respect', amount: 1 }, { type: 'gf', op: { op: 'pay', who: c.id, nm, scope: 'rec', fr, p } }) },
      { id: 'envelope', label: `Send a gift (${$(200)})`, detail: 'A silver tray, a card, no fuss.', because: `sent ${first}'s daughter a wedding gift`, effects: fx(label, { type: 'money', amount: -200 }, { type: 'opinion', from: c.id, to: B, amount: 3, reason: 'Sent a gift for my daughter', decay: 2 }, seen) },
      { id: 'attend', label: 'Go, and sit where they put you', detail: 'Your face in their hall. The feds photograph the parking lot.', because: `went to ${first}'s daughter's wedding`, effects: fx(label, { type: 'opinion', from: c.id, to: B, amount: 4, reason: 'Came to my daughter\'s wedding', decay: 2 }, { type: 'heat', bar: 'federal', amount: 1 }, seen) },
      { id: 'stay', label: 'Stay away', because: `stayed away from ${first}'s daughter's wedding`, effects: fx(label, seen) },
    ];
  }
  const all = 1500;
  return [
    { id: 'payall', label: `Pay for the whole wedding (${$(all)})`, detail: `The hall, the band, the cake. ${first} owes you, and everybody at the Dorset knows who paid.`, because: `paid for ${first}'s daughter ${nm}'s wedding`, effects: fx(label, { type: 'money', amount: -all }, { type: 'opinion', from: c.id, to: B, amount: 20, reason: 'Paid for my daughter\'s wedding', decay: 1 }, { type: 'meter', from: c.id, to: B, meter: 'trust', amount: 10 }, { type: 'deed', op: { op: 'owe', by: c.id, to: B, y: `You paid for ${nm}'s wedding` } }, { type: 'respect', amount: 2 }, { type: 'gf', op: { op: 'pay', who: c.id, nm, scope: 'all' } }) },
    { id: 'reception', label: `Pay for the reception (${$(600)})`, detail: 'The dinner and the band. He pays for the church.', because: `paid for ${first}'s daughter's reception`, effects: fx(label, { type: 'money', amount: -600 }, { type: 'opinion', from: c.id, to: B, amount: 10, reason: 'Paid for the reception', decay: 1 }, { type: 'respect', amount: 1 }, { type: 'gf', op: { op: 'pay', who: c.id, nm, scope: 'rec' } }) },
    { id: 'envelope', label: `Send an envelope (${$(150)})`, because: `sent ${first}'s daughter a wedding envelope`, effects: fx(label, { type: 'money', amount: -150 }, { type: 'opinion', from: c.id, to: B, amount: 4, reason: 'Remembered my daughter\'s wedding', decay: 2 }, seen) },
    { id: 'stay', label: 'Too busy', because: `missed ${first}'s daughter's wedding`, effects: fx(label, { type: 'opinion', from: c.id, to: B, amount: -4, reason: 'Missed my daughter\'s wedding', decay: 2 }, seen) },
  ];
}

/** The choices of a christening offer (also the sheet's buttons). */
export function baptismChoices(s: GameState, c: Character, nm: string, male: 0 | 1, fr?: RivalId): Choice[] {
  const B = s.playerId;
  const label = `${nm}'s christening`;
  const first = c.firstName;
  const kid = male ? 'son' : 'daughter';
  const grand = c.faction === 'player' && ageOn(c.birth, s.date) >= 48;
  const rel = grand ? `grand${kid}` : kid;
  const seen: Effect = { type: 'gf', op: { op: 'seen' } };
  return [
    { id: 'god', label: `Stand godfather (${$(300)} and a gold cross)`, detail: `You hold ${nm} at the font. ${first} owes you for life, and ${nm} is your godchild.${fr ? ` The ${RIVAL_NAMES[fr]} family will remember who stood.` : ''}`, because: `stood godfather to ${first}'s ${rel} ${nm}`, effects: fx(label, { type: 'money', amount: -300 }, { type: 'opinion', from: c.id, to: B, amount: 20, reason: `You stood for my ${rel} ${nm}`, decay: 0 }, { type: 'meter', from: c.id, to: B, meter: 'trust', amount: 12 }, { type: 'deed', op: { op: 'owe', by: c.id, to: B, y: `You stood godfather to ${nm}` } }, { type: 'respect', amount: 1 }, { type: 'gf', op: { op: 'god', who: c.id, nm, male, ...(fr ? { fr } : {}) } }) },
    { id: 'gift', label: `Send a gift (${$(100)})`, because: `sent ${first} a christening gift`, effects: fx(label, { type: 'money', amount: -100 }, { type: 'opinion', from: c.id, to: B, amount: 5, reason: 'Remembered my baby', decay: 2 }, seen) },
    { id: 'decline', label: 'Thank him, and say no', because: `declined to stand for ${first}'s baby`, effects: fx(label, { type: 'opinion', from: c.id, to: B, amount: -6, reason: 'Would not stand for my baby', decay: 1 }, seen) },
  ];
}

function rivalOf(c: Character): RivalId | undefined {
  return c.faction === 'manno' || c.faction === 'feldstein' || c.faction === 'kessler' ? c.faction : undefined;
}

export function buildOffer(s: GameState, o: Offer): EventInstance {
  const c = o.who;
  const fr = o.circle === 'rival' ? rivalOf(c) : undefined;
  const who = displayName(c);
  const where = c.ethnicity === 'Jewish' ? 'Beth Judah' : 'St. Ann\'s';
  const iid = `ev${s.nextId++}`;
  const meta = { charId: c.id, gf: o.k, nm: o.nm, sex: o.male, sat: DAY, ...(fr ? { fr } : {}) };
  if (o.k === 'w') {
    const text = fr
      ? `${who}'s daughter ${o.nm} marries Saturday at ${where}, reception at the Hotel Dorset. Half the island is invited, and so are you. Paying for the reception would be noticed in every family in South Jersey.`
      : `${who}'s daughter ${o.nm} marries Saturday at ${where}. ${o.circle === 'payroll' ? `${c.gender === 'F' ? 'She' : 'He'} is on your payroll and doesn't have that kind of money.` : `${c.firstName} has been putting money aside for years, and it isn't enough.`} The hall, the band, the cake: somebody has to pay.`;
    return { iid, defId: 'gf_wedding', week: s.week, mandatory: false, priority: 44, title: `${o.nm}'s wedding`, text, choices: weddingChoices(s, c, o.nm, fr), defaultChoiceId: fr ? 'stay' : 'envelope', meta, actors: [c.id] };
  }
  const grand = o.circle === 'crew';
  const text = `${grand ? `${who} is a grandfather: his daughter had a ${o.male ? 'boy' : 'girl'}, ${o.nm}.` : `${who} has a new ${o.male ? 'son' : 'daughter'}, ${o.nm}.`} The christening is Saturday at ${where}, and ${c.firstName} asks you to stand at the font.${fr ? ` From another family's man, that is a hand held out.` : ''} In this life a godfather is for life.`;
  return { iid, defId: 'gf_baptism', week: s.week, mandatory: false, priority: 44, title: `A christening: ${o.nm}`, text, choices: baptismChoices(s, c, o.nm, o.male, fr), defaultChoiceId: 'gift', meta, actors: [c.id] };
}

/** The weekly offer (a candidate among the week's events; no dice from the main stream). */
export function gfEventSource(s: GameState): EventInstance | undefined {
  if (s.gameOver || s.week < 6 || inTheRanks(s)) return undefined;
  if (s.gf?.cd !== undefined && s.week - s.gf.cd < GF_GAP) return undefined;
  if (s.pendingEvents.some((e) => e.defId === 'gf_wedding' || e.defId === 'gf_baptism')) return undefined;
  if (hroll(`${s.seed}|gfwk|${s.week}`) > 0.3) return undefined;
  const os = offers(s);
  if (!os.length) return undefined;
  // Your own people first, then the payroll and the pad, then the other families.
  const order: Circle[] = hroll(`${s.seed}|gfc|${s.week}`) < 0.25 ? ['rival', 'crew', 'payroll', 'pad'] : ['crew', 'payroll', 'pad', 'rival'];
  for (const circle of order) {
    const xs = os.filter((o) => o.circle === circle);
    if (xs.length) return buildOffer(s, pickBy(xs, `${s.seed}|gfp|${s.week}`));
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* The sheet and the datebook                                          */
/* ------------------------------------------------------------------ */

/** This week's wedding or christening offer about this person, still open. */
export function openOffer(s: GameState, id: string): EventInstance | undefined {
  return s.pendingEvents.find((e) => (e.defId === 'gf_wedding' || e.defId === 'gf_baptism' || e.defId === 'crew_wedding' || e.defId === 'crew_christening') && e.meta?.charId === id);
}

/** Every open offer (the datebook). */
export function openOffers(s: GameState): EventInstance[] {
  return s.pendingEvents.filter((e) => e.defId === 'gf_wedding' || e.defId === 'gf_baptism' || e.defId === 'crew_wedding' || e.defId === 'crew_christening');
}

/** Answer an offer now, from his sheet (pure): its effects land, it leaves the week's cards, and Your File has it. */
export function answerOffer(input: GameState, iid: string, choiceId: string): GameState {
  const ev = input.pendingEvents.find((e) => e.iid === iid);
  const ch = ev?.choices.find((c) => c.id === choiceId && !c.disabledReason);
  if (!ev || !ch) return input;
  const s = cloneState(input);
  s.pendingEvents = s.pendingEvents.filter((e) => e.iid !== iid);
  const ctx = newCtx(s);
  applyEffects(ctx, ch.effects, { label: `${ev.title}: ${ch.label}`, because: ch.because, category: 'event' });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You ${ch.because}.`, kind: 'decision' });
  practiceDeed(s, `${ev.title} ${ch.label} ${ch.because}`, 2);
  journal(s, { t: `${ev.title}: ${ch.label}`, x: `You ${ch.because}.`, p: ev.actors, c: 'family', src: 'gf', mine: 1, ...(s.days && s.days.week === s.week ? { d: s.days.day } : {}) });
  return s;
}
