import { appeal } from './looks';
import { attractionMods } from './aging';
import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { FEMALE_FIRST, SURNAMES } from './names';
import { applyEffects } from './effects';
import { famMut } from './familyState';
import { performMarriage } from './familyMarriage';
import type { Acceptance, InteractionPreview, Reason } from './interactions';
import type { Ctx } from './ledger';
import { addOpinion, changeMeter, opinion } from './relations';
import { addSecret } from './secrets';
import { hashSeed, rand } from './rng';
import { ensureRomance, orientationFor, type Orientation, type Romance, type RomanceState } from './storyState';
import type { Character, Effect, EventInstance, FactionId, GameState, InteractionId, RivalId } from './types';

/**
 * Romance (non-explicit, consenting adults only). Orientation is fixed at
 * birth (straight / gay / bi, rarely ace) and is independent of traits.
 * Attraction comes from orientation fit, looks, age, traits and opinion;
 * nobody begins anything without the other adult's own acceptance roll.
 *
 * NPCs court, take lovers, have affairs and end them on their own, monthly.
 * Secret relationships build exposure and may be discovered: the betrayed
 * spouse turns on both of them, crews and rivals take it personally, and a
 * secret is left behind that someone can use. Affairs can produce a child
 * who is passed off as the husband's (the portrait follows the real father);
 * the boss decides what to do about children of his own blood, and the truth
 * can come out years later.
 *
 * 1960 attitudes: a same-sex couple is always a secret, and a dangerous one.
 * That danger is told through story only (the papers or a rival threaten
 * exposure; the boss can only protect them). It is never a lever the player
 * can use: no Secret record is ever created for it, so neither blackmail nor
 * "expose" can see it.
 */

export const ROMANCE_INTERACTIONS: InteractionId[] = ['court', 'affair', 'proposeMarriage', 'endRomance', 'separate'];
const ADULT = 18;

/* ---------------------------------------------------------------- */
/* Who is drawn to whom                                               */
/* ---------------------------------------------------------------- */

export function orientationOf(s: GameState, c: Character): Orientation {
  return c.orientation ?? orientationFor(s.seed, c.id);
}

/** Is `a` drawn to `b`'s sex at all? (orientation fit) */
export function drawnTo(s: GameState, a: Character, b: Character): boolean {
  switch (orientationOf(s, a)) {
    case 'straight': return a.gender !== b.gender;
    case 'gay': return a.gender === b.gender;
    case 'bi': return true;
    case 'ace': return false;
  }
}

function age(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}

/** Blood relatives (and step-parents) never court. */
export function kin(a: Character, b: Character): boolean {
  const pa = [a.fatherId, a.motherId, a.bioFatherId].filter(Boolean);
  const pb = [b.fatherId, b.motherId, b.bioFatherId].filter(Boolean);
  if (pa.includes(b.id) || pb.includes(a.id)) return true;
  if (pa.some((x) => pb.includes(x))) return true;
  if (a.childrenIds.includes(b.id) || b.childrenIds.includes(a.id)) return true;
  return false;
}

function spouseOf(s: GameState, c: Character): Character | undefined {
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  return sp?.alive ? sp : undefined;
}

export function isMarried(s: GameState, c: Character): boolean {
  return !!spouseOf(s, c);
}


/** How much `a` is attracted to `b`, with reasons (−100 if `a` is not drawn to `b` at all). */
export function attraction(s: GameState, a: Character, b: Character): { value: number; reasons: Reason[] } {
  if (!drawnTo(s, a, b)) return { value: -100, reasons: [{ label: 'Not drawn to them', value: -100 }] };
  const reasons: Reason[] = [];
  const chem = chemistry(s, a, b);
  if (chem) reasons.push({ label: chem > 0 ? 'Chemistry' : 'No spark', value: chem });
  const gap = Math.abs(age(s, a) - age(s, b));
  if (gap > 8) reasons.push({ label: `${gap} years apart`, value: -Math.min(40, (gap - 8) * 3) });
  // Looks, as `a` sees them (appearance traits: his or her own type, how much looks matter to them).
  for (const r of appeal(s, a, b).reasons) reasons.push(r);
  if (hasTrait(b, 'Charming')) reasons.push({ label: 'Charming', value: 10 });
  reasons.push(...attractionMods(s, b));
  if (hasTrait(a, 'Womanizer')) reasons.push({ label: 'Has a roving eye', value: 10 });
  if (hasTrait(a, 'Pious')) reasons.push({ label: 'Pious', value: -10 });
  const op = opinion(s, a.id, b.id);
  if (op) reasons.push({ label: op >= 0 ? 'Likes them' : 'Dislikes them', value: Math.round(op * 0.3) });
  return { value: reasons.reduce((x, r) => x + r.value, 0), reasons };
}

/** Some pairs simply have it (fixed per pair, from the seed). */
export function chemistry(s: GameState, a: Character, b: Character): number {
  const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
  return (hashSeed(`${s.seed}:chem:${key}`) % 41) - 15;
}

/** Both ways (for NPC matchmaking). */
export function compatibility(s: GameState, a: Character, b: Character): number {
  if (!drawnTo(s, a, b) || !drawnTo(s, b, a)) return -100;
  return (attraction(s, a, b).value + attraction(s, b, a).value) / 2;
}

/* ---------------------------------------------------------------- */
/* Relationships                                                      */
/* ---------------------------------------------------------------- */

export function activeRomances(s: GameState, charId?: string): Romance[] {
  const rels = s.romance?.rels ?? [];
  return rels.filter((r) => r.ended === undefined && (!charId || r.a === charId || r.b === charId));
}

export function romanceBetween(s: GameState, a: string, b: string): Romance | undefined {
  return activeRomances(s, a).find((r) => r.a === b || r.b === b);
}

export function partnerOf(r: Romance, id: string): string {
  return r.a === id ? r.b : r.a;
}

function sameSex(s: GameState, r: Romance): boolean {
  const a = s.characters[r.a];
  const b = s.characters[r.b];
  return !!a && !!b && a.gender === b.gender;
}

/** Is the player allowed to see this relationship? */
export function romanceKnown(s: GameState, r: Romance): boolean {
  return !r.secret || r.discovered !== undefined || r.a === s.playerId || r.b === s.playerId;
}

function kindFor(s: GameState, a: Character, b: Character): Romance['kind'] {
  if (isMarried(s, a) || isMarried(s, b)) return 'affair';
  return a.gender === b.gender ? 'lovers' : 'courtship';
}

function canRomance(s: GameState, a: Character, b: Character): boolean {
  return a.alive && b.alive && a.id !== b.id && age(s, a) >= ADULT && age(s, b) >= ADULT && !kin(a, b) && a.spouseId !== b.id && !romanceBetween(s, a.id, b.id);
}

/**
 * Start a romance. Consent backstop: both must be adults, drawn to each
 * other, unrelated, and not already together. Callers only get here after
 * the other person's acceptance roll succeeded.
 */
export function startRomance(s: GameState, aId: string, bId: string, revenge = false): Romance | undefined {
  const a = s.characters[aId];
  const b = s.characters[bId];
  if (!a || !b || !canRomance(s, a, b) || !drawnTo(s, a, b) || !drawnTo(s, b, a)) return undefined;
  const R = ensureRomance(s);
  const kind = kindFor(s, a, b);
  const r: Romance = { id: `ro${s.nextId++}`, a: aId, b: bId, kind, secret: kind !== 'courtship', since: s.week, exposure: 0 };
  if (revenge) r.revenge = true;
  R.rels.push(r);
  if (R.rels.length > 400) R.rels = R.rels.filter((x) => x.ended === undefined || s.week - x.ended < 260);
  R.stats[kind === 'courtship' ? 'courtships' : kind === 'affair' ? 'affairs' : 'lovers']++;
  addOpinion(s, aId, bId, kind === 'courtship' ? 'Courting' : 'Lovers', 20, 1);
  addOpinion(s, bId, aId, kind === 'courtship' ? 'Courting' : 'Lovers', 20, 1);
  return r;
}

export function endRomance(s: GameState, r: Romance, reason: string): void {
  if (r.ended !== undefined) return;
  r.ended = s.week;
  r.endReason = reason;
  ensureRomance(s).stats.ended++;
}

/** Marry two people (the dynasty's own marriage when one of them is of the house). */
export function marry(s: GameState, aId: string, bId: string, log: string[]): boolean {
  const a = s.characters[aId];
  const b = s.characters[bId];
  if (!a?.alive || !b?.alive || a.gender === b.gender || isMarried(s, a) || isMarried(s, b)) return false;
  // A widow(er)'s old spouse id points at the dead: free it.
  if (a.spouseId && !spouseOf(s, a)) a.spouseId = undefined;
  if (b.spouseId && !spouseOf(s, b)) b.spouseId = undefined;
  const r = romanceBetween(s, aId, bId);
  const member = a.dynasty ? a : b.dynasty ? b : undefined;
  if (member) {
    const other = member === a ? b : a;
    if (!performMarriage(s, member.id, other.id, false, log)) return false;
  } else {
    a.spouseId = b.id;
    b.spouseId = a.id;
    const w = a.gender === 'F' ? a : b;
    const h = w === a ? b : a;
    w.maidenName = w.maidenName ?? w.lastName;
    w.lastName = h.lastName;
    addOpinion(s, a.id, b.id, a.gender === 'M' ? 'My wife' : 'My husband', 20, 0);
    addOpinion(s, b.id, a.id, b.gender === 'M' ? 'My wife' : 'My husband', 20, 0);
  }
  if (r) endRomance(s, r, 'married');
  ensureRomance(s).stats.marriages++;
  return true;
}

/* ---------------------------------------------------------------- */
/* Consent: the other adult decides                                   */
/* ---------------------------------------------------------------- */

/** Odds that `target` says yes to `from` (romance or an affair), with every reason shown. */
export function romanceAcceptance(s: GameState, from: Character, target: Character, kind: 'court' | 'affair' | 'marry'): Acceptance {
  // Consent is never a dice roll against someone who is not drawn to you, or not an adult.
  if (!drawnTo(s, target, from) || age(s, target) < ADULT || age(s, from) < ADULT) return { chance: 0, reasons: [{ label: 'Not interested', value: -100 }] };
  const reasons: Reason[] = [];
  const att = attraction(s, target, from);
  reasons.push(...att.reasons.map((r) => ({ label: `${r.label}`, value: Math.round(r.value * 0.6) })));
  if (kind === 'affair' || (kind === 'court' && (isMarried(s, from) || isMarried(s, target)))) {
    const sp = spouseOf(s, target);
    if (sp) {
      reasons.push({ label: 'Married', value: -25 });
      const op = opinion(s, target.id, sp.id);
      if (op < 0) reasons.push({ label: 'An unhappy marriage', value: Math.min(30, Math.round(-op / 2)) });
      if (spouseCheats(s, target)) reasons.push({ label: 'Wants to get even', value: 25 });
      if (hasTrait(target, 'Loyal-to-a-fault')) reasons.push({ label: 'Loyal-to-a-fault', value: -20 });
    }
    if (hasTrait(target, 'Pious')) reasons.push({ label: 'Pious', value: -30 });
    if (hasTrait(target, 'Honest')) reasons.push({ label: 'Honest', value: -15 });
    if (hasTrait(target, 'Cowardly')) reasons.push({ label: 'Afraid of being found out', value: -10 });
  }
  if (kind === 'marry') {
    const r = romanceBetween(s, from.id, target.id);
    if (r) reasons.push({ label: `Courting for ${s.week - r.since} weeks`, value: Math.min(30, s.week - r.since) });
    if (hasTrait(target, 'Pious')) reasons.push({ label: 'Wants a church wedding', value: 5 });
  }
  if (hasTrait(target, 'Womanizer')) reasons.push({ label: 'Has a roving eye', value: 15 });
  if (from.gender === target.gender) reasons.push({ label: 'It would have to stay hidden (1960)', value: -10 });
  if (hasTrait(from, 'Charming')) reasons.push({ label: 'You are Charming', value: 10 });
  const base = kind === 'marry' ? 30 : 20;
  const sum = reasons.reduce((a, r) => a + r.value, base);
  return { chance: Math.max(0.05, Math.min(0.9, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

function spouseCheats(s: GameState, c: Character): boolean {
  const sp = spouseOf(s, c);
  return !!sp && activeRomances(s, sp.id).some((r) => r.kind === 'affair' && r.discovered !== undefined);
}

/* ---------------------------------------------------------------- */
/* The boss's interactions                                            */
/* ---------------------------------------------------------------- */

function withRomanceOp(label: string, op: Extract<Effect, { type: 'storyOp' }>['op']): Effect {
  return { type: 'storyOp', op, label };
}

/** Interaction previews for the romance menu (undefined when it makes no sense for this person). */
export function previewRomance(s: GameState, id: InteractionId, c: Character): InteractionPreview | undefined {
  const boss = player(s);
  if (!c.alive || c.id === boss.id) return undefined;
  const first = c.firstName;
  const nm = displayName(c);
  const adult = age(s, c) >= ADULT;
  const together = romanceBetween(s, boss.id, c.id);
  const notInto = !drawnTo(s, c, boss) || !drawnTo(s, boss, c) ? `${first} is not interested in you that way` : undefined;
  const jailed = isFree(s, c) ? undefined : 'In jail';
  switch (id) {
    case 'court': {
      if (!adult || together || kin(boss, c) || boss.spouseId === c.id || isMarried(s, boss) || isMarried(s, c)) return undefined;
      const label = `Courting ${first}`;
      const acc = romanceAcceptance(s, boss, c, 'court');
      return {
        id, title: `Court ${first}`, detail: c.gender === boss.gender ? 'Dinner at the Admiral, a drive down to the Point. In 1960 this would have to stay between the two of you.' : 'Dinner at the Admiral, a walk on the boardwalk after the crowds go home. Flowers on Sunday.', cost: 100, pot: 'pocket',
        effects: [{ type: 'money', pot: 'pocket', amount: -100, label }, withRomanceOp(label, { op: 'romance', a: boss.id, b: c.id })],
        refuseEffects: [withRomanceOp(`${first} said no`, { op: 'rebuff', by: c.id, of: boss.id })],
        acceptance: notInto ? undefined : acc, because: `courted ${nm}`, disabledReason: notInto ?? jailed,
      };
    }
    case 'affair': {
      if (!adult || together || kin(boss, c) || boss.spouseId === c.id) return undefined;
      if (!isMarried(s, boss) && !isMarried(s, c)) return undefined;
      const label = `An affair with ${first}`;
      const sp = spouseOf(s, c);
      const acc = romanceAcceptance(s, boss, c, 'affair');
      return {
        id, title: `Start an affair with ${first}`, detail: `${sp ? `${first} is married to ${displayName(sp)}. ` : ''}A room at the Admiral, a back booth in Cape May. Secrets get out.`, cost: 200, pot: 'pocket',
        effects: [{ type: 'money', pot: 'pocket', amount: -200, label }, withRomanceOp(label, { op: 'romance', a: boss.id, b: c.id })],
        refuseEffects: [withRomanceOp(`${first} turned you down`, { op: 'rebuff', by: c.id, of: boss.id })],
        acceptance: notInto ? undefined : acc, because: `started an affair with ${nm}`, disabledReason: notInto ?? jailed,
      };
    }
    case 'proposeMarriage': {
      if (!together || together.kind !== 'courtship' || isMarried(s, boss) || isMarried(s, c) || c.gender === boss.gender) return undefined;
      const label = `Proposed to ${first}`;
      const weeks = s.week - together.since;
      return {
        id, title: `Propose to ${first}`, detail: 'A ring from Bailey Banks & Biddle, and a word with the monsignor.', cost: 500, pot: 'pocket',
        effects: [{ type: 'money', pot: 'pocket', amount: -500, label }, withRomanceOp(label, { op: 'marry', a: boss.id, b: c.id })],
        refuseEffects: [{ type: 'opinion', from: c.id, to: boss.id, amount: -5, reason: 'Asked too soon', decay: 1, label: `${first} said not yet` }],
        acceptance: romanceAcceptance(s, boss, c, 'marry'), because: `proposed to ${nm}`,
        disabledReason: weeks < 8 ? `You have courted ${first} only ${weeks} weeks` : undefined,
      };
    }
    case 'endRomance': {
      if (!together) return undefined;
      const label = `Ended it with ${first}`;
      return {
        id, title: `End it with ${first}`, detail: together.kind === 'affair' ? 'One last lunch in Cape May. It is safer for everyone.' : 'Better now than later.', cost: 0,
        effects: [withRomanceOp(label, { op: 'endRomance', romanceId: together.id, reason: 'you ended it' }), { type: 'opinion', from: c.id, to: boss.id, amount: -15, reason: 'Ended it', decay: 1, label }],
        because: `ended it with ${nm}`,
      };
    }
    case 'separate': {
      if (boss.spouseId !== c.id || !spouseOf(s, boss)) return undefined;
      if (ensureRomanceRO(s).separations.some((x) => (x.a === boss.id && x.b === c.id) || (x.b === boss.id && x.a === c.id))) return undefined;
      const label = `Separated from ${first}`;
      return {
        id, title: `Separate from ${first}`, detail: 'Divorce is a scandal in a Catholic town. She moves to her sister\'s; the parish talks; the monsignor stops coming to dinner.', cost: 0,
        effects: [
          withRomanceOp(label, { op: 'separate', a: boss.id }),
          { type: 'respect', amount: -3, label },
          { type: 'familyOpinion', amount: -8, reason: 'Broke up the marriage', label },
          { type: 'opinion', from: c.id, to: boss.id, amount: -30, reason: 'Left me', decay: 0, label },
          { type: 'dyn', op: { op: 'stress', charId: boss.id, amount: 10, source: 'domestic' }, label },
        ],
        because: `separated from ${nm}`,
      };
    }
    default:
      return undefined;
  }
}

/** Read-only view (never creates the romance state). */
function ensureRomanceRO(s: GameState): Pick<RomanceState, 'separations' | 'truth' | 'hushed' | 'rels'> {
  return s.romance ?? { separations: [], truth: [], hushed: {}, rels: [] };
}

/** Romance orders the sim's random player can try this week. */
export function romanceActions(s: GameState): { kind: 'interact'; id: InteractionId; target: string }[] {
  const boss = player(s);
  const out: { kind: 'interact'; id: InteractionId; target: string }[] = [];
  const adults = Object.values(s.characters).filter((c) => c.alive && c.id !== boss.id && age(s, c) >= ADULT && age(s, c) <= 60);
  // People who could feel the same way first (asking the rest is a wasted evening).
  const mutual = adults.filter((c) => drawnTo(s, c, boss) && drawnTo(s, boss, c));
  const people = mutual.length >= 3 ? mutual : adults;
  if (!people.length) return out;
  for (let i = 0; i < 3; i++) {
    const c = people[(s.week * 13 + i * 37) % people.length];
    for (const id of ROMANCE_INTERACTIONS) if (previewRomance(s, id, c)) out.push({ kind: 'interact', id, target: c.id });
  }
  for (const r of activeRomances(s, boss.id)) out.push({ kind: 'interact', id: 'endRomance', target: partnerOf(r, boss.id) });
  return out;
}

/* ---------------------------------------------------------------- */
/* Effect ops                                                         */
/* ---------------------------------------------------------------- */

export function applyRomanceOp(ctx: Ctx, op: Extract<Effect, { type: 'storyOp' }>['op']): void {
  const s = ctx.s;
  const R = ensureRomance(s);
  switch (op.op) {
    case 'romance': {
      const r = startRomance(s, op.a, op.b, op.revenge);
      if (r) ctx.log.push(`${nameOf(s, op.a)} and ${nameOf(s, op.b)}: ${r.kind === 'courtship' ? 'a courtship' : 'a secret'}.`);
      break;
    }
    case 'endRomance': {
      const r = R.rels.find((x) => x.id === op.romanceId);
      if (r) endRomance(s, r, op.reason);
      break;
    }
    case 'marry':
      if (marry(s, op.a, op.b, ctx.log)) {
        const text = `${nameOf(s, op.a)} married ${nameOf(s, op.b)}.`;
        s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
      }
      break;
    case 'separate': {
      const a = s.characters[op.a];
      const b = a ? spouseOf(s, a) : undefined;
      if (!a || !b) break;
      R.separations.push({ a: a.id, b: b.id, week: s.week, divorce: op.divorce });
      R.stats.separations++;
      if (op.divorce) {
        a.spouseId = undefined;
        b.spouseId = undefined;
      }
      const text = `${displayName(a)} and ${displayName(b)} ${op.divorce ? 'were divorced' : 'separated'}. The parish talks of nothing else.`;
      s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
      break;
    }
    case 'rebuff': {
      const by = s.characters[op.by];
      const of = s.characters[op.of];
      if (!by || !of) break;
      R.stats.rejected++;
      addOpinion(s, by.id, of.id, 'Made a pass at me', -10, 1);
      const sp = spouseOf(s, by);
      if (sp && sp.id !== of.id && rand(R) < 0.3) {
        addOpinion(s, sp.id, of.id, 'Made a pass at my wife', -20, 1);
        changeMeter(s, sp.id, of.id, 'grievance', 15);
        ctx.log.push(`${by.firstName} told ${sp.firstName} about it.`);
      }
      break;
    }
    case 'hush': {
      const r = R.rels.find((x) => x.id === op.romanceId);
      if (r) {
        r.exposure = 0;
        R.hushed[r.id] = s.week + 52;
      }
      break;
    }
    case 'child':
      childDecision(ctx, op.childId, op.mode);
      break;
    default:
      break;
  }
}

function nameOf(s: GameState, id: string): string {
  const c = s.characters[id];
  return c ? displayName(c) : '?';
}

export function describeRomanceOp(s: GameState, op: Extract<Effect, { type: 'storyOp' }>['op']): string | undefined {
  switch (op.op) {
    case 'romance': {
      const a = s.characters[op.a];
      const b = s.characters[op.b];
      if (!a || !b) return undefined;
      return `${kindFor(s, a, b) === 'courtship' ? 'Courting' : 'A secret affair with'} ${b.firstName} ${b.lastName}`;
    }
    case 'endRomance': return 'It ends';
    case 'marry': return `Marries ${nameOf(s, op.b)}`;
    case 'separate': return op.divorce ? 'Divorce (a scandal)' : 'Separation (a scandal)';
    case 'rebuff': return undefined;
    case 'hush': return 'Kept out of the papers for a year';
    case 'child': {
      const c = s.characters[op.childId];
      const nm = c?.firstName ?? 'the child';
      return op.mode === 'acknowledge' ? `${nm} is yours (privately)` : op.mode === 'legitimize' ? `${nm} takes your name and joins the line of succession` : op.mode === 'pay' ? `${nm} is raised as another man's son` : `You deny ${nm}`;
    }
    default: return undefined;
  }
}

/* ---------------------------------------------------------------- */
/* Children of affairs                                                */
/* ---------------------------------------------------------------- */

function childDecision(ctx: Ctx, childId: string, mode: 'acknowledge' | 'legitimize' | 'pay' | 'deny'): void {
  const s = ctx.s;
  const child = s.characters[childId];
  const boss = player(s);
  if (!child?.alive) return;
  const mother = child.motherId ? s.characters[child.motherId] : undefined;
  const label = `${child.firstName}: ${mode}`;
  const p = famMut(s, child.id);
  p.bastardOf = boss.id;
  switch (mode) {
    case 'acknowledge':
      addSecret(s, boss, 'bastard', ['player']);
      if (mother?.alive) addOpinion(s, mother.id, boss.id, 'Owned up to our child', 15, 1);
      break;
    case 'legitimize': {
      const legal = child.fatherId && child.fatherId !== boss.id ? s.characters[child.fatherId] : undefined;
      if (legal) {
        legal.childrenIds = legal.childrenIds.filter((x) => x !== child.id);
        if (legal.alive) {
          addOpinion(s, legal.id, boss.id, 'Took my son and gave him his name', -50, 0);
          changeMeter(s, legal.id, boss.id, 'grievance', 50);
        }
      }
      child.fatherId = undefined;
      child.bioFatherId = undefined;
      applyEffects(ctx, [{ type: 'dyn', op: { op: 'legitimize', charId: child.id } }], { label, because: `gave ${child.firstName} your name`, category: 'event' });
      const R = ensureRomance(s);
      if (!R.truth.includes(child.id)) R.truth.push(child.id);
      break;
    }
    case 'pay':
      addSecret(s, boss, 'bastard', ['player']);
      if (mother?.alive) addOpinion(s, mother.id, boss.id, 'Paid for our silence', 5, 1);
      break;
    case 'deny':
      if (mother?.alive) addOpinion(s, mother.id, boss.id, 'Denied our child', -30, 0);
      // Denied blood can come back: once grown, he may press a claim after a succession (dynasty claimant mechanic).
      p.claimant = child.gender === 'M';
      break;
  }
}

/** Is the child's real father (not the father of record) known to the player? */
export function paternityRumored(s: GameState, child: Character): boolean {
  if (!child.bioFatherId || child.bioFatherId === child.fatherId) return false;
  if (child.bioFatherId === s.playerId || ensureRomanceRO(s).truth.includes(child.id)) return true;
  return s.secrets.some((x) => x.ownerId === child.bioFatherId && x.kind === 'bastard' && x.knownBy.includes('player'));
}

/** Children by blood who carry another man's name (shown "rumored"). */
export function bloodChildren(s: GameState, c: Character): Character[] {
  return Object.values(s.characters).filter((k) => k.bioFatherId === c.id && k.fatherId !== c.id);
}

/* ---------------------------------------------------------------- */
/* Events                                                             */
/* ---------------------------------------------------------------- */

function ev(s: GameState, defId: string, title: string, text: string, choices: EventInstance['choices'], actors: string[], priority: number, mandatory = false, meta: Record<string, string | number> = {}): EventInstance {
  return { iid: `ev${s.nextId++}`, defId, title, text, week: s.week, mandatory, priority, defaultChoiceId: choices[0].id, choices, actors: actors.slice(0, 3), meta: { family: 1, ...meta } };
}

/** Someone's wife (or husband) comes on to the boss. He decides; so did she. */
export function buildAdvance(s: GameState, from: Character): EventInstance {
  const boss = player(s);
  const sp = spouseOf(s, from);
  const label = `${from.firstName}'s advance`;
  const whose = sp ? `${displayName(sp)}'s ${from.gender === 'F' ? 'wife' : 'husband'}` : 'a regular at the Admiral';
  return ev(s, 'rom_advance', `${from.firstName} lingers at the door`, `${displayName(from)}, ${whose}, has found reasons to be wherever you are this month: the bakery on Pacific, the eleven o'clock Mass, the coat check at the Bolero. Tonight there is a note in your coat pocket with a room number at the Admiral. Nothing has happened. Something could.`, [
    { id: 'no', label: 'Leave the note on the hall table', detail: 'Kindly, and for good.', because: `turned down ${from.firstName}`, effects: [{ type: 'opinion', from: from.id, to: boss.id, amount: -5, reason: 'Turned me down', decay: 1, label }] },
    { id: 'yes', label: 'Go to the Admiral', detail: sp ? `An affair. If ${sp.firstName} ever finds out, he will not forgive it.` : 'An affair. Secrets get out.', because: `started an affair with ${from.firstName}`, effects: [withRomanceOp(label, { op: 'romance', a: from.id, b: boss.id })] },
  ], [from.id], 44, false, { charId: from.id });
}

/** The boss is the real father of a newborn. */
export function buildChildEvent(s: GameState, child: Character): EventInstance {
  const boss = player(s);
  const mother = child.motherId ? s.characters[child.motherId] : undefined;
  const legal = child.fatherId ? s.characters[child.fatherId] : undefined;
  const label = `${child.firstName}`;
  const text = `${mother ? displayName(mother) : 'She'} had a ${child.gender === 'M' ? 'boy' : 'girl'} at Burdette Tomlin. ${child.firstName}. ${legal ? `${legal.firstName} ${legal.lastName} handed out cigars on the boardwalk; he thinks the baby is his. ` : 'There is no husband to hand out cigars. '}She sent you one photograph, no note. You know whose jaw that is.`;
  return ev(s, 'rom_child', `A ${child.gender === 'M' ? 'son' : 'daughter'} at Burdette Tomlin`, text, [
    { id: 'pay', label: 'Pay quietly', detail: legal ? `$3,000 in an envelope. ${child.firstName} grows up as ${legal.firstName}'s.` : '$3,000 in an envelope, and a promise to stay away.', because: `paid quietly for ${child.firstName}`, effects: [{ type: 'money', pot: 'pocket', amount: -3000, label }, withRomanceOp(label, { op: 'child', childId: child.id, mode: 'pay' })] },
    { id: 'ack', label: 'Acknowledge the child, privately', detail: 'You will be there. The secret stays between the three of you.', because: `acknowledged ${child.firstName} privately`, effects: [{ type: 'money', pot: 'pocket', amount: -1000, label }, withRomanceOp(label, { op: 'child', childId: child.id, mode: 'acknowledge' }), { type: 'dyn', op: { op: 'stress', charId: boss.id, amount: -4, source: 'honor' }, label }] },
    { id: 'legit', label: 'Give the child your name', detail: `${child.firstName} joins the house and the line of succession.${legal ? ` ${legal.firstName} will never forgive it.` : ''} The parish will talk.`, because: `gave ${child.firstName} your name`, effects: [withRomanceOp(label, { op: 'child', childId: child.id, mode: 'legitimize' }), { type: 'respect', amount: -3, label }, { type: 'familyOpinion', amount: -8, reason: 'Brought his bastard into the house', label }] },
    { id: 'deny', label: 'Deny everything', detail: 'Children grow up. They ask questions.', because: `denied ${child.firstName}`, effects: [withRomanceOp(label, { op: 'child', childId: child.id, mode: 'deny' }), { type: 'dyn', op: { op: 'stress', charId: boss.id, amount: 6, source: 'honor' }, label }] },
  ], [child.id, ...(mother ? [mother.id] : [])], 58, true, { subject: child.id });
}

/** A discovery the boss has to answer for (his affair, or one in his house or crew). */
function buildDiscovery(s: GameState, r: Romance, betrayed: Character, cheater: Character, lover: Character): EventInstance {
  const boss = player(s);
  const label = `Found out: ${cheater.firstName} and ${lover.firstName}`;
  const bossIsLover = lover.id === boss.id;
  const bossCheats = cheater.id === boss.id;
  const choices: EventInstance['choices'] = [];
  let text: string;
  if (bossCheats) {
    text = `${betrayed.firstName} found the matchbook from the Admiral in your good suit, and then she found the rest. She is not crying. She has packed a bag and put it by the door, and she wants to hear what you have to say first.`;
    choices.push(
      { id: 'beg', label: 'Swear it is over', detail: 'End it and mean it.', because: `swore to ${betrayed.firstName} it was over`, effects: [withRomanceOp(label, { op: 'endRomance', romanceId: r.id, reason: 'found out' }), { type: 'opinion', from: betrayed.id, to: boss.id, amount: 15, reason: 'He ended it', decay: 1, label }] },
      { id: 'gift', label: 'A mink and a week in Miami Beach', detail: '$2,500. It buys time, not forgiveness.', because: `bought ${betrayed.firstName} off with a mink`, effects: [{ type: 'money', pot: 'pocket', amount: -2500, label }, { type: 'opinion', from: betrayed.id, to: boss.id, amount: 10, reason: 'A mink and an apology', decay: 1, label }] },
      { id: 'cold', label: 'It is none of her business', because: `told ${betrayed.firstName} it was none of her business`, effects: [{ type: 'opinion', from: betrayed.id, to: boss.id, amount: -15, reason: 'Does not even pretend', decay: 1, label }, { type: 'familyOpinion', amount: -4, reason: 'Shamed his wife', label }] },
    );
  } else if (betrayed.id === boss.id) {
    text = `Everybody on Pacific Avenue knew before you did: ${displayName(cheater)} and ${displayName(lover)}. The matchbooks, the Tuesday afternoons, the car parked two streets over. Now you know too, and the whole island is waiting to see what you do.`;
    choices.push(
      { id: 'forgive', label: `Forgive ${cheater.firstName}`, detail: 'For the children. It ends today.', because: `forgave ${cheater.firstName}`, effects: [withRomanceOp(label, { op: 'endRomance', romanceId: r.id, reason: 'found out' }), { type: 'opinion', from: cheater.id, to: boss.id, amount: 20, reason: 'Forgave me', decay: 1, label }, { type: 'dyn', op: { op: 'stress', charId: boss.id, amount: -4, source: 'domestic' }, label }] },
      { id: 'warn', label: `Have a word with ${lover.firstName}`, detail: 'Quietly. He will understand.', because: `had a word with ${lover.firstName}`, effects: [withRomanceOp(label, { op: 'endRomance', romanceId: r.id, reason: 'warned off' }), { type: 'meter', from: lover.id, to: boss.id, meter: 'fear', amount: 25, label }, { type: 'respect', amount: 1, label }] },
      { id: 'separate', label: `Separate from ${cheater.firstName}`, detail: 'A scandal in a Catholic town.', because: `separated from ${cheater.firstName}`, effects: [withRomanceOp(label, { op: 'separate', a: boss.id }), { type: 'respect', amount: -2, label }, { type: 'familyOpinion', amount: -5, reason: 'Broke up the marriage', label }] },
    );
  } else if (bossIsLover) {
    text = `${displayName(betrayed)} knows about you and ${cheater.firstName}. ${betrayed.faction === 'player' ? 'He has not said a word to you. He has said plenty at the Anchor Bar, and the men are listening.' : `${betrayed.firstName} has told everyone in ${betrayed.faction !== 'none' ? 'his outfit' : 'town'} who will listen.`}`;
    choices.push(
      { id: 'end', label: `End it with ${cheater.firstName}`, because: `ended it with ${cheater.firstName} when ${betrayed.firstName} found out`, effects: [withRomanceOp(label, { op: 'endRomance', romanceId: r.id, reason: 'found out' }), { type: 'opinion', from: betrayed.id, to: boss.id, amount: 10, reason: 'At least he ended it', decay: 1, label }] },
      { id: 'pay', label: `Make it right with ${betrayed.firstName}`, detail: '$3,000 and an apology in the back room.', because: `paid ${betrayed.firstName} for the insult`, effects: [{ type: 'money', pot: 'pocket', amount: -3000, label }, { type: 'opinion', from: betrayed.id, to: boss.id, amount: 20, reason: 'Made it right', decay: 1, label }, { type: 'meter', from: betrayed.id, to: boss.id, meter: 'grievance', amount: -25, label }] },
      { id: 'nothing', label: 'Carry on as if nothing happened', detail: 'He will not forget it. Nor will the men.', because: `carried on with ${cheater.firstName}`, effects: [{ type: 'respect', amount: -1, label }] },
    );
  } else {
    text = `${displayName(betrayed)} has found out about ${displayName(cheater)} and ${displayName(lover)}. In a town this size, it is the only thing anyone talks about at the bakery, and it has reached your table.`;
    choices.push(
      { id: 'peace', label: 'Keep the peace', detail: 'A word with everyone involved.', because: `kept the peace between ${betrayed.firstName} and ${lover.firstName}`, effects: [{ type: 'money', pot: 'pocket', amount: -500, label }, { type: 'meter', from: betrayed.id, to: lover.id, meter: 'grievance', amount: -20, label }, { type: 'opinion', from: betrayed.id, to: boss.id, amount: 5, reason: 'Kept the peace', decay: 1, label }] },
      { id: 'stay', label: 'Stay out of it', because: `stayed out of ${betrayed.firstName}'s business`, effects: [] },
    );
  }
  return ev(s, 'rom_found', bossCheats ? `${betrayed.firstName} knows` : betrayed.id === boss.id ? `${cheater.firstName} and ${lover.firstName}` : `${betrayed.firstName} found out`, text, choices, [betrayed.id, cheater.id, lover.id].filter((x) => x !== boss.id), 54, false, { romance: r.id });
}

/** The papers or a rival threaten to expose a secret couple in the boss's house or crew. The boss can only protect them. */
function buildThreat(s: GameState, r: Romance, member: Character, partner: Character, by: string): EventInstance {
  const label = `Protect ${member.firstName}`;
  const rival = s.rivals.find((x) => x.id === by);
  const who = rival ? `A man from ${rival.name}` : 'A reporter from the Wildwood Leader';
  const choices: EventInstance['choices'] = [
    { id: 'hush', label: rival ? `Tell ${rival.shortName} this is off limits` : 'Buy the story and burn it', detail: rival ? 'Some things are not done. They will remember you said so.' : '$2,500 to the editor. The negatives go in the furnace.', because: `protected ${member.firstName}`, effects: [
      ...(rival ? [{ type: 'rivalOpinion', rival: rival.id as RivalId, amount: -10, reason: 'Told us to keep our mouths shut', label } as Effect, { type: 'respect', amount: 1, label } as Effect] : [{ type: 'money', pot: 'pocket', amount: -2500, label } as Effect]),
      withRomanceOp(label, { op: 'hush', romanceId: r.id }),
      { type: 'opinion', from: member.id, to: s.playerId, amount: 25, reason: 'Protected me', decay: 0, label },
    ] },
    { id: 'away', label: `Help ${member.firstName} leave quietly`, detail: 'A job in Philadelphia, a fresh start where nobody knows the family. Nobody has to know why.', because: `helped ${member.firstName} start over somewhere else`, effects: [
      ...(member.faction === 'player' && member.rank !== 'civilian' ? [{ type: 'retire', charId: member.id, label } as Effect] : []),
      withRomanceOp(label, { op: 'endRomance', romanceId: r.id, reason: 'moved away' }),
      { type: 'opinion', from: member.id, to: s.playerId, amount: 10, reason: 'Helped me get out', decay: 1, label },
    ] },
    { id: 'nothing', label: 'Do nothing', detail: 'It may run. It may not.', because: `did nothing for ${member.firstName}`, effects: [{ type: 'opinion', from: member.id, to: s.playerId, amount: -20, reason: 'Left me to the wolves', decay: 1, label }] },
  ];
  return ev(s, 'rom_threat', `${who} asks about ${member.firstName}`, `${who} has been asking around about ${displayName(member)} and ${displayName(partner)}: where they go on Sunday afternoons, why the light is on so late. In 1960 that kind of story ruins a life. He wants you to know he knows.`, choices, [member.id], 52, false, { romance: r.id, charId: member.id });
}

/* ---------------------------------------------------------------- */
/* The monthly tick                                                   */
/* ---------------------------------------------------------------- */

function withRng<T>(s: GameState, R: RomanceState, fn: () => T): T {
  const main = s.rng;
  s.rng = R.rng;
  try {
    return fn();
  } finally {
    R.rng = s.rng;
    s.rng = main;
  }
}

/** Give a few important men a real wife (crew capos with a household, rival bosses) so she can be part of the story. */
function materializeSpouses(s: GameState, R: RomanceState): void {
  const men = Object.values(s.characters).filter((c) => c.alive && c.gender === 'M' && !c.spouseId && !c.dynasty && age(s, c) >= 25 && (
    (c.faction === 'player' && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere') && !!c.household?.wife)
    || s.rivals.some((r) => r.leaderId === c.id && r.kind !== 'law')));
  for (const m of men) {
    const key = `wife:${m.id}`;
    if (R.cooldowns[key] !== undefined) continue;
    R.cooldowns[key] = s.week;
    if (!m.household?.wife && rand(R) < 0.3) continue;
    const w = withRng(s, R, () => makeCharacter(s, {
      gender: 'F', ethnicity: m.ethnicity, firstName: m.household?.wife ?? FEMALE_FIRST[m.ethnicity][Math.floor(rand(s) * FEMALE_FIRST[m.ethnicity].length)],
      age: Math.max(ADULT + 2, age(s, m) - Math.floor(rand(s) * 7)), rank: 'civilian', faction: 'none', nickname: false,
    }));
    w.maidenName = SURNAMES[w.ethnicity][Math.floor(rand(R) * SURNAMES[w.ethnicity].length)];
    w.lastName = m.lastName;
    w.spouseId = m.id;
    m.spouseId = w.id;
    if (m.household) m.household.wife = w.firstName;
    addOpinion(s, w.id, m.id, 'My husband', Math.round(rand(R) * 40) - 10, 0);
    addOpinion(s, m.id, w.id, 'My wife', Math.round(rand(R) * 40) - 5, 0);
  }
}

/** Adults who can be part of a love story this month. */
function romancePool(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && c.id !== s.playerId && isFree(s, c) && age(s, c) >= ADULT && age(s, c) <= 62 && orientationOf(s, c) !== 'ace');
}

function inPlayersWorld(s: GameState, c: Character): boolean {
  return c.dynasty || c.faction === 'player' || c.id === s.playerId;
}

function affairPull(s: GameState, c: Character): number {
  let p = 0.04;
  if (hasTrait(c, 'Womanizer')) p += 0.2;
  if (hasTrait(c, 'Pious') || hasTrait(c, 'Honest')) p -= 0.03;
  const sp = spouseOf(s, c);
  if (sp && opinion(s, c.id, sp.id) < 0) p += 0.08;
  if (spouseCheats(s, c)) p += 0.3;
  return Math.max(0, p);
}

/** Engine hook (monthly, after the dynasty's month). */
export function romanceMonth(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const R = ensureRomance(s);
  materializeSpouses(s, R);
  const pool = romancePool(s);
  const boss = player(s);

  // 1. NPCs make the first move (and some get turned down).
  for (let i = 0; i < 6 && pool.length > 1; i++) {
    const a = pool[Math.floor(rand(R) * pool.length)];
    const married = isMarried(s, a);
    if (romanceBetweenAny(s, a.id) && rand(R) < 0.85) continue;
    if (married && rand(R) > affairPull(s, a)) continue;
    const drawn = pool.filter((b) => b.id !== a.id && drawnTo(s, a, b));
    if (drawnTo(s, a, boss) && boss.id !== a.id) drawn.push(boss);
    if (!drawn.length) continue;
    let best: Character | undefined;
    let bestScore = 10;
    for (let k = 0; k < 6; k++) {
      const b = drawn[Math.floor(rand(R) * drawn.length)];
      if (!canRomance(s, a, b)) continue;
      if (!married && isMarried(s, b) && rand(R) > affairPull(s, b)) continue;
      const sc = compatibility(s, a, b);
      if (sc > bestScore) {
        best = b;
        bestScore = sc;
      }
    }
    if (!best) continue;
    if (best.id === boss.id) {
      if (!R.cooldowns.advance || s.week - R.cooldowns.advance >= 26) {
        R.cooldowns.advance = s.week;
        s.eventQueue.push(buildAdvance(s, a));
      }
      continue;
    }
    const acc = romanceAcceptance(s, a, best, isMarried(s, a) || isMarried(s, best) ? 'affair' : 'court');
    if (rand(R) < acc.chance) startRomance(s, a.id, best.id, spouseCheats(s, a));
    else R.stats.rejected++;
  }

  // 2. Courtships ripen into marriages; secret couples stay secret; some things end.
  for (const r of activeRomances(s)) {
    const a = s.characters[r.a];
    const b = s.characters[r.b];
    if (!a?.alive || !b?.alive) {
      endRomance(s, r, !a?.alive ? `${a?.firstName ?? 'one of them'} died` : `${b?.firstName ?? 'one of them'} died`);
      continue;
    }
    if (r.a === boss.id || r.b === boss.id) {
      // The boss ends his own romances; the other person may still walk away.
      const other = r.a === boss.id ? b : a;
      if (opinion(s, other.id, boss.id) < -30 && rand(R) < 0.3) endRomance(s, r, `${other.firstName} walked away`);
    } else {
      if (r.kind === 'courtship' && s.week - r.since >= 26 && rand(R) < 0.2 && compatibility(s, a, b) > 0) {
        if (marry(s, a.id, b.id, ctx.log) && inPlayersWorld(s, a)) ctx.log.push(`${displayName(a)} married ${displayName(b)}.`);
        continue;
      }
      const sour = Math.min(opinion(s, a.id, b.id), opinion(s, b.id, a.id));
      const endP = 0.03 + (sour < 0 ? 0.1 : 0) + (r.discovered !== undefined ? 0.25 : 0);
      if (rand(R) < endP) {
        endRomance(s, r, r.discovered !== undefined ? 'it came out' : 'it ran its course');
        continue;
      }
    }
    if (r.secret) exposeTick(ctx, R, r, a, b);
    if (r.kind !== 'courtship') pregnancyTick(s, R, r, a, b);
  }

  // 3. Births, and old truths coming out.
  births(ctx, R);
  truthTick(ctx, R);
  if (R.alerts.length > 20) R.alerts = R.alerts.slice(-20);
}

function romanceBetweenAny(s: GameState, id: string): boolean {
  return activeRomances(s, id).length > 0;
}

/** Secret relationships leak: gossip, carelessness, a matchbook in a suit. */
function exposeTick(ctx: Ctx, R: RomanceState, r: Romance, a: Character, b: Character): void {
  const s = ctx.s;
  if (r.discovered !== undefined) return;
  if ((R.hushed[r.id] ?? 0) > s.week) return;
  let gain = 3;
  for (const c of [a, b]) {
    if (hasTrait(c, 'Drinker')) gain += 2;
    if (hasTrait(c, 'Womanizer')) gain += 2;
    if (hasTrait(c, 'Paranoid') || hasTrait(c, 'Patient')) gain -= 1;
  }
  r.exposure = Math.min(100, r.exposure + Math.max(1, gain));
  if (rand(R) >= (r.exposure / 100) * 0.25) return;
  if (sameSex(s, r)) dangerousSecretOut(ctx, R, r, a, b);
  else affairDiscovered(ctx, R, r, a, b);
}

/** A same-sex couple: no spouse to discover, but the papers or a rival may threaten to talk. The player is never the one holding it. */
function dangerousSecretOut(ctx: Ctx, R: RomanceState, r: Romance, a: Character, b: Character): void {
  const s = ctx.s;
  r.discovered = s.week;
  R.stats.discovered++;
  const member = [a, b].find((c) => c.id !== s.playerId && inPlayersWorld(s, c));
  const partner = member === a ? b : a;
  const rival = s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
  const by = rand(R) < 0.5 && rival.length ? rival[Math.floor(rand(R) * rival.length)].id : 'press';
  r.discoveredBy = by;
  if (member) {
    s.eventQueue.push(buildThreat(s, r, member, partner, by));
    R.alerts.push({ week: s.week, romanceId: r.id, text: `Someone is asking questions about ${displayName(member)}.` });
  }
  if (a.id === s.playerId || b.id === s.playerId) {
    const other = a.id === s.playerId ? b : a;
    s.eventQueue.push(buildThreat(s, r, other, s.characters[s.playerId], by));
  }
}

/** The betrayed spouse finds out. Consequences land on everyone involved. */
function affairDiscovered(ctx: Ctx, R: RomanceState, r: Romance, a: Character, b: Character): void {
  const s = ctx.s;
  const boss = player(s);
  r.discovered = s.week;
  R.stats.discovered++;
  const pairs: [Character, Character, Character][] = [];
  for (const [cheater, lover] of [[a, b], [b, a]] as const) {
    const sp = spouseOf(s, cheater);
    if (sp && sp.id !== lover.id) pairs.push([sp, cheater, lover]);
  }
  if (!pairs.length) return;
  const [betrayed, cheater, lover] = pairs[0];
  r.discoveredBy = betrayed.id;
  const label = `${betrayed.firstName} found out about ${cheater.firstName} and ${lover.firstName}`;
  const effects: Effect[] = [];
  for (const [bt, ch, lv] of pairs) {
    addOpinion(s, bt.id, ch.id, 'Cheated on me', -40, 1);
    addOpinion(s, bt.id, lv.id, `Carried on with my ${ch.gender === 'F' ? 'wife' : 'husband'}`, -50, 0);
    changeMeter(s, bt.id, lv.id, 'grievance', 40);
    addOpinion(s, ch.id, bt.id, 'Found me out', -10, 1);
    // The secret someone can use: the betrayed spouse's people know it now.
    const knownBy: FactionId[] = bt.faction === 'player' || bt.dynasty ? ['player'] : bt.faction !== 'none' ? [bt.faction] : [];
    if (knownBy.length) addSecret(s, ch, 'affair', knownBy).text = `${displayName(ch)} carried on with ${displayName(lv)} behind ${displayName(bt)}'s back`;
    // The boss was the lover: a made man's wife, or a rival boss's.
    if (lv.id === boss.id) {
      if (bt.faction === 'player') {
        effects.push({ type: 'crewOpinion', amount: -2, reason: 'The boss and a made man\'s wife', traitMods: { 'Loyal-to-a-fault': -3, Womanizer: 2 } });
        effects.push({ type: 'respect', amount: -2 });
        changeMeter(s, bt.id, boss.id, 'grievance', 30);
      }
      const rv = s.rivals.find((x) => x.leaderId === bt.id || x.id === bt.faction);
      if (rv && rv.kind !== 'law') {
        effects.push({ type: 'rivalOpinion', rival: rv.id, amount: -30, reason: `You and ${bt.firstName}'s ${ch.gender === 'F' ? 'wife' : 'husband'}` });
        if (rv.leaderId === bt.id && rand(R) < 0.35) effects.push({ type: 'feud', rival: rv.id });
      }
    }
    if (bt.id === boss.id) effects.push({ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: 8, source: 'domestic' } });
    // The boss was the cheater: his own wife and the house.
    if (ch.id === boss.id) {
      effects.push({ type: 'familyOpinion', amount: -5, reason: 'Shamed his wife' });
      effects.push({ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: 10, source: 'domestic' } });
    }
    // Wronged spouses sometimes leave (separation; divorce is rare and scandalous).
    if (rand(R) < 0.1) {
      const divorce = rand(R) < 0.15;
      R.separations.push({ a: bt.id, b: ch.id, week: s.week, divorce });
      R.stats.separations++;
      if (divorce) {
        bt.spouseId = undefined;
        ch.spouseId = undefined;
      }
    }
  }
  if (effects.length) applyEffects(ctx, effects, { label, because: `were found out with ${cheater.id === boss.id ? lover.firstName : cheater.firstName}`, category: 'event' });
  const involved = [betrayed, cheater, lover].some((c) => inPlayersWorld(s, c) && (c.dynasty || c.rank === 'capo' || c.rank === 'underboss' || c.id === boss.id));
  if (involved) {
    R.alerts.push({ week: s.week, romanceId: r.id, text: `${displayName(betrayed)} found out about ${displayName(cheater)} and ${displayName(lover)}.` });
    s.eventQueue.push(buildDiscovery(s, r, betrayed, cheater, lover));
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(betrayed)} found out about ${displayName(cheater)} and ${displayName(lover)}.`, kind: 'family' });
  }
}

function pregnancyTick(s: GameState, R: RomanceState, r: Romance, a: Character, b: Character): void {
  const woman = a.gender === 'F' ? a : b.gender === 'F' ? b : undefined;
  const man = a.gender === 'M' ? a : b.gender === 'M' ? b : undefined;
  if (!woman || !man) return;
  // The boss's own relationships: only an evening together, at the player's setting (dating.ts PREGNANCY_RULES).
  if (s.dating && (woman.id === s.playerId || man.id === s.playerId)) return;
  const wa = age(s, woman);
  if (wa < ADULT || wa > 42) return;
  if (R.pregnancies.some((p) => p.motherId === woman.id)) return;
  if (rand(R) >= 0.025) return;
  R.pregnancies.push({ id: `pg${s.nextId++}`, motherId: woman.id, fatherId: man.id, romanceId: r.id, dueWeek: s.week + 36 + Math.floor(rand(R) * 4) });
  R.stats.pregnancies++;
}

function births(ctx: Ctx, R: RomanceState): void {
  const s = ctx.s;
  const due = R.pregnancies.filter((p) => p.dueWeek <= s.week);
  R.pregnancies = R.pregnancies.filter((p) => p.dueWeek > s.week);
  for (const p of due) {
    const mother = s.characters[p.motherId];
    const bio = s.characters[p.fatherId];
    if (!mother?.alive || !bio) continue;
    const husband = spouseOf(s, mother);
    const legal = husband && husband.id !== bio.id ? husband : undefined;
    const father = legal ?? (husband?.id === bio.id ? bio : undefined);
    const child = withRng(s, R, () => makeCharacter(s, {
      gender: rand(s) < 0.51 ? 'M' : 'F', ethnicity: (father ?? mother).ethnicity, lastName: (father ?? mother).lastName,
      age: 0, rank: 'civilian', faction: father?.faction === 'player' ? 'player' : 'none', dynasty: !!father?.dynasty || (!father && mother.dynasty), nickname: false, wealth: 0,
    }));
    child.birth = { ...s.date };
    child.health = 95;
    child.conditions = [];
    child.ambition = 'Grow up';
    child.motherId = mother.id;
    mother.childrenIds.push(child.id);
    if (father) {
      child.fatherId = father.id;
      father.childrenIds.push(child.id);
      addOpinion(s, child.id, father.id, 'My father', 30, 0);
    }
    // The real father, when he is not the father of record: hidden paternity.
    if (!father || father.id !== bio.id) {
      child.bioFatherId = bio.id;
      R.stats.hiddenPaternity++;
      famMut(s, child.id).bastardOf = bio.id;
    }
    R.stats.births++;
    if (inPlayersWorld(s, mother) || inPlayersWorld(s, bio)) {
      s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text: `${child.firstName} ${child.lastName} was born to ${mother.firstName} ${mother.lastName}${father ? ` and ${father.firstName}` : ''}.` });
    }
    if (bio.id === s.playerId && child.bioFatherId) s.eventQueue.push(buildChildEvent(s, child));
  }
}

/** Years later, the truth about a child can come out (the jaw, a letter, a deathbed). */
function truthTick(ctx: Ctx, R: RomanceState): void {
  const s = ctx.s;
  for (const child of Object.values(s.characters)) {
    if (!child.alive || !child.bioFatherId || child.bioFatherId === child.fatherId || R.truth.includes(child.id)) continue;
    const a = age(s, child);
    if (rand(R) >= (a >= 3 ? 0.006 : 0.002)) continue;
    R.truth.push(child.id);
    R.stats.truthOut++;
    const bio = s.characters[child.bioFatherId];
    const legal = child.fatherId ? s.characters[child.fatherId] : undefined;
    const mother = child.motherId ? s.characters[child.motherId] : undefined;
    if (bio) addSecret(s, bio, 'bastard', ['player', ...(bio.faction !== 'player' && bio.faction !== 'none' ? [bio.faction] : [])]);
    if (legal?.alive && bio) {
      addOpinion(s, legal.id, bio.id, `${child.firstName} is his`, -60, 0);
      changeMeter(s, legal.id, bio.id, 'grievance', 50);
      if (mother?.alive) addOpinion(s, legal.id, mother.id, 'Lied to me for years', -40, 1);
    }
    const text = `It came out: ${child.firstName} ${child.lastName} is ${bio ? displayName(bio) : 'another man'}'s child${legal ? `, not ${legal.firstName}'s` : ''}.`;
    if (bio && (inPlayersWorld(s, bio) || (legal && inPlayersWorld(s, legal)))) {
      R.alerts.push({ week: s.week, romanceId: '', text });
      s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'family' });
      s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
      // A grown son of the boss's blood may now press a claim (the dynasty's bastard-claimant mechanic).
      if (bio.id === s.playerId && child.gender === 'M') famMut(s, child.id).claimant = true;
      if (bio.id === s.playerId) applyEffects(ctx, [{ type: 'respect', amount: -2 }, { type: 'familyOpinion', amount: -4, reason: 'His bastard is the talk of the parish' }], { label: text, because: 'fathered a child in secret', category: 'event' });
    }
  }
}

/** Alert-rail items: recent discoveries and revelations (pure). */
export function romanceAlerts(s: GameState): { kind: 'family'; severity: 'warn' | 'danger'; title: string; text: string; charId?: string }[] {
  const R = s.romance;
  if (!R) return [];
  return R.alerts.filter((x) => s.week - x.week <= 8).slice(-3).map((x) => ({ kind: 'family' as const, severity: 'warn' as const, title: 'Found out', text: x.text }));
}
