import { ageOn } from './calendar';
import { displayName, player } from './characters';
import { chooseHeir } from './dynasty';
import { addAlliance, alliedHouse, houseMembers, marriageable } from './familyHouses';
import { hasPerk } from './familyLegacy';
import { ensureDynState, fam, famMut, houseById, houseOf, type House } from './familyState';
import type { Acceptance, Reason } from './interactions';
import { addOpinion, opinion } from './relations';
import type { Character, Effect, GameState } from './types';

/**
 * Arranged marriages (CK): our unmarried sons and daughters, matched to the
 * children of other houses. The other house's head decides — with odds
 * broken into reasons — and dowries change hands. A marriage seals an
 * alliance for as long as it stands.
 */

export const MIN_MARRY_AGE = 18;

/** Members of our house who can be matched (blood, unmarried, 18-45, not a priest). */
export function ourMarriageable(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => {
    if (!c.alive || !c.dynasty || c.spouseId) return false;
    const a = ageOn(c.birth, s.date);
    if (a < MIN_MARRY_AGE || a > 45) return false;
    const p = fam(s, c.id);
    if (p.path === 'priest') return false;
    // Married-in spouses (widows) are not ours to give.
    return !c.maidenName || c.maidenName === s.houseName;
  });
}

/** Candidates for one of ours from every house, opposite sex. */
export function matchCandidates(s: GameState, member: Character): { house: House; c: Character }[] {
  const out: { house: House; c: Character }[] = [];
  for (const h of s.dyn?.houses ?? []) for (const c of marriageable(s, h)) if (c.gender !== member.gender) out.push({ house: h, c });
  return out;
}

/** Dowry: the bride's family pays. Positive = we receive. */
export function dowryFor(s: GameState, member: Character, house: House, matrilineal: boolean): number {
  let base = house.dowry;
  if (member.id === s.playerId || chooseHeir(s, player(s)).heir?.id === member.id) base = Math.round(base * 1.5);
  let amt = member.gender === 'M' ? base : -base;
  if (matrilineal) amt = -Math.round(base * 1.5);
  if (hasPerk(s, 'money', 2)) amt = amt > 0 ? Math.round(amt * 1.5) : Math.round(amt / 2);
  return Math.round(amt / 100) * 100;
}

function clampChance(base: number, reasons: Reason[]): Acceptance {
  const sum = reasons.reduce((a, r) => a + r.value, base);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

/** Will the other house accept the match? */
export function marriageAcceptance(s: GameState, member: Character, spouse: Character, matrilineal = false): Acceptance {
  const house = houseOf(s, spouse.id);
  const head = house ? s.characters[house.headId] : undefined;
  const boss = player(s);
  const reasons: Reason[] = [];
  if (head?.alive) {
    const op = opinion(s, head.id, boss.id);
    reasons.push({ label: op >= 0 ? `${head.lastName} thinks well of you` : `${head.lastName} dislikes you`, value: Math.round(op * 0.5) });
  }
  reasons.push({ label: 'Your reputation', value: Math.round((s.respect - 40) / 3) });
  const renown = s.dyn?.renownTotal ?? 0;
  reasons.push({ label: 'The name of your house', value: Math.min(20, Math.round(renown / 60)) });
  const heir = chooseHeir(s, boss).heir;
  if (member.id === boss.id || member.id === heir?.id) reasons.push({ label: member.id === boss.id ? 'Marrying the head of the house' : 'Marrying your heir', value: 20 });
  const cong = fam(s, member.id).congenital;
  if (cong.includes('Handsome')) reasons.push({ label: 'Handsome', value: 10 });
  if (cong.includes('Sharp')) reasons.push({ label: 'Sharp', value: 5 });
  if (cong.includes('Sickly')) reasons.push({ label: 'Sickly', value: -15 });
  if (cong.includes('Homely')) reasons.push({ label: 'Homely', value: -8 });
  if (cong.includes('Slow')) reasons.push({ label: 'Slow', value: -5 });
  const gap = Math.abs(ageOn(member.birth, s.date) - ageOn(spouse.birth, s.date));
  if (gap > 12) reasons.push({ label: `${gap} years apart`, value: -15 });
  if (member.ethnicity !== spouse.ethnicity) reasons.push({ label: 'Different parish', value: -15 });
  if (house) {
    const ourStrength = Math.min(90, 30 + s.respect / 2 + renown / 100);
    if (house.strength > ourStrength) reasons.push({ label: 'Looks down on new money', value: -Math.round((house.strength - ourStrength) / 2) });
    if (alliedHouse(s, house.id)) reasons.push({ label: 'Already allied', value: 10 });
    if (house.kind === 'political' && s.heat.federal >= 40) reasons.push({ label: 'Federal heat', value: -Math.round(s.heat.federal / 4) });
    if (house.kind === 'legit' && s.heat.local >= 40) reasons.push({ label: 'The newspapers', value: -Math.round(s.heat.local / 5) });
    const r = house.faction ? s.rivals.find((x) => x.id === house.faction) : undefined;
    if (r?.war) reasons.push({ label: 'At war with you', value: -80 });
    if (r?.feud) reasons.push({ label: 'Blood feud', value: -60 });
  }
  if (matrilineal) reasons.push({ label: 'Gives up a son', value: -15 });
  if (fam(s, spouse.id).goal === 'marry_well') reasons.push({ label: 'Wants a good match', value: 5 });
  return clampChance(30, reasons);
}

export function marriageBlock(s: GameState, member: Character | undefined, spouse: Character | undefined): string | undefined {
  if (!member?.alive || !spouse?.alive) return 'No longer possible';
  if (member.spouseId || spouse.spouseId) return 'Already married';
  if (!member.dynasty) return 'Not of your house';
  if (member.gender === spouse.gender) return 'Not in 1960';
  const a = ageOn(member.birth, s.date);
  const b = ageOn(spouse.birth, s.date);
  if (a < MIN_MARRY_AGE || b < MIN_MARRY_AGE) return 'Too young to marry';
  if (fam(s, member.id).path === 'priest' || fam(s, spouse.id).path === 'priest') return 'Took holy orders';
  if (!houseOf(s, spouse.id)) return 'Not from a house you can deal with';
  return undefined;
}

/** Effects of the match, shown on the order card (the marriage itself and the dowry). */
export function marriageEffects(s: GameState, member: Character, spouse: Character, matrilineal: boolean): Effect[] {
  const house = houseOf(s, spouse.id);
  const label = `Marriage: ${member.firstName} and ${spouse.firstName} ${spouse.lastName}`;
  const dowry = house ? dowryFor(s, member, house, matrilineal) : 0;
  const effects: Effect[] = [{ type: 'dyn', op: { op: 'marry', memberId: member.id, spouseId: spouse.id, matrilineal }, label }];
  if (dowry) effects.push({ type: 'money', amount: dowry, label: `${label}: dowry ${dowry > 0 ? 'received' : 'paid'}` });
  return effects;
}

/**
 * Engine-side: marry one of ours to someone from another house. Handles
 * names, which house the spouse joins, opinions, the alliance and renown.
 */
export function performMarriage(s: GameState, memberId: string, spouseId: string, matrilineal: boolean, log: string[]): boolean {
  const member = s.characters[memberId];
  const spouse = s.characters[spouseId];
  if (!member?.alive || !spouse?.alive || member.spouseId || spouse.spouseId) return false;
  const d = ensureDynState(s);
  const house = houseOf(s, spouse.id);
  member.spouseId = spouse.id;
  spouse.spouseId = member.id;
  const mp = famMut(s, member.id);
  const sp = famMut(s, spouse.id);
  mp.marriedWeek = s.week;
  sp.marriedWeek = s.week;
  mp.wed = false;
  if (member.gender === 'M' || matrilineal) {
    // The spouse comes into our house.
    if (spouse.gender === 'F') {
      spouse.maidenName = spouse.lastName;
      spouse.lastName = member.lastName;
    }
    spouse.dynasty = true;
    spouse.faction = 'player';
    if (matrilineal) sp.matrilineal = true;
  } else {
    // Our daughter goes to her husband's house (she keeps her blood).
    member.maidenName = member.lastName;
    member.lastName = spouse.lastName;
  }
  addOpinion(s, member.id, spouse.id, member.gender === 'M' ? 'My wife' : 'My husband', 20, 0);
  addOpinion(s, spouse.id, member.id, spouse.gender === 'M' ? 'My wife' : 'My husband', 20, 0);
  const boss = player(s);
  if (house) {
    const head = s.characters[house.headId];
    if (head?.alive) {
      addOpinion(s, head.id, boss.id, 'Our families are joined', 25, 0);
      addOpinion(s, boss.id, head.id, 'Our families are joined', 15, 0);
    }
    for (const m of houseMembers(s, house)) if (m.id !== head?.id) addOpinion(s, m.id, boss.id, 'Family by marriage', 10, 0);
    addAlliance(s, { houseId: house.id, since: s.week, ourId: member.id, theirId: spouse.id });
  }
  d.stats.marriages++;
  const text = `${displayName(member)} married ${spouse.firstName} ${spouse.maidenName ?? spouse.lastName}${house ? ` of ${house.name}` : ''}${matrilineal ? ' (the children will carry our name)' : ''}.`;
  s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'family' });
  log.push(text);
  return true;
}

export { houseById };
