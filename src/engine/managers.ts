import { CLUB_KINDS } from './catalog';
import { age, displayName, hasTrait, isFree, player } from './characters';
import { ensureEcon, eid, type Manager, type ManagerSource, type Oversight, type StaffMember, type StaffRole } from './econState';
import { MALE_FIRST, SURNAMES } from './names';
import { opinion } from './relations';
import { chance, hashSeed, pick, randInt } from './rng';
import type { Business, BusinessKind, Character, GameState } from './types';

/**
 * Managers. Any business or building can be put in someone's hands: a family
 * member, a man from the crew, or a hired professional. Each has skill (the
 * take), loyalty, honesty (hidden for strangers), a weekly salary, a share of
 * the take, and the oversight the boss keeps on him. A dishonest manager
 * skims; the money simply never reaches the treasury, so the ledger still
 * reconciles, and an audit or a sharp bookkeeper turns it up.
 *
 * Unmanaged places run the old way (the crew and the counter staff): no
 * salary, no bonus, no skim.
 */

export const OVERSIGHT: Record<Oversight, { name: string; skim: number; detect: number; cost: number; text: string }> = {
  weekly: { name: 'Weekly', skim: 0.25, detect: 0.2, cost: 8, text: 'You go over the books every Monday. Costs your bookkeeper\'s hours.' },
  monthly: { name: 'Monthly', skim: 0.6, detect: 0.07, cost: 3, text: 'A look at the books at the end of the month.' },
  quarterly: { name: 'Quarterly', skim: 1, detect: 0.025, cost: 1, text: 'Four times a year. Plenty of room for a careful man.' },
  hands_off: { name: 'Hands-off', skim: 1.5, detect: 0, cost: 0, text: 'You trust him. Nobody ever checks.' },
};

export const SOURCE_LABEL: Record<ManagerSource, string> = { family: 'Family', crew: 'Crew', pro: 'Hired professional' };

export function managerOf(s: GameState, key: string): Manager | undefined {
  return s.econ?.managers[key];
}

/** Income multiplier from the manager's skill (0.90 .. 1.30); 1 when nobody's in charge. */
export function managerMult(m: Manager | undefined): number {
  if (!m) return 1;
  return 0.9 + Math.max(0, Math.min(100, m.skill)) * 0.004;
}

/** Share of the take a manager skims each week (hidden). */
export function managerSkimRate(s: GameState, m: Manager | undefined): number {
  if (!m || m.honesty >= 60) return 0;
  let r = ((60 - m.honesty) / 60) * 0.18 * OVERSIGHT[m.oversight].skim;
  if (m.loyalty < 40) r *= 1.3;
  if (m.assistantId && s.characters[m.assistantId]?.alive) r *= 0.7;
  return Math.min(0.3, r);
}

/** Honesty of a person you know (deterministic from traits and discipline). */
export function honestyOf(c: Character): number {
  if (hasTrait(c, 'Honest')) return 90;
  if (hasTrait(c, 'Loyal-to-a-fault')) return 80;
  let h = 35 + c.attributes.discipline * 0.4;
  if (hasTrait(c, 'Greedy')) h -= 25;
  if (hasTrait(c, 'Gambler')) h -= 15;
  if (hasTrait(c, 'Ambitious')) h -= 5;
  if (hasTrait(c, 'Pious')) h += 10;
  return Math.round(Math.max(5, Math.min(95, h)));
}

export function loyaltyOf(s: GameState, c: Character): number {
  const base = c.dynasty ? 60 : 45;
  return Math.round(Math.max(0, Math.min(100, base + opinion(s, c.id, s.playerId) / 2)));
}

/** Builds a manager record for a family member or a crew man. */
export function managerFromChar(s: GameState, c: Character, source: 'family' | 'crew'): Manager {
  const skill = c.attributes.business;
  return {
    source, charId: c.id, name: displayName(c), skill, loyalty: loyaltyOf(s, c), honesty: honestyOf(c),
    salary: Math.round(source === 'family' ? 10 + skill * 0.2 : 15 + skill * 0.25),
    share: source === 'family' ? 0.1 : 0.05,
    oversight: 'monthly', since: s.week, skimmed: 0,
  };
}

export interface ProCandidate {
  name: string;
  skill: number;
  honesty: number;
  loyalty: number;
  salary: number;
  /** What his references say (a hint, not the truth). */
  hint: string;
}

/** Three professionals answering the ad this month (deterministic per place and month). */
export function proCandidates(s: GameState, key: string): ProCandidate[] {
  const h = { rng: hashSeed(`${s.seed}:${key}:${s.date.y}-${s.date.m}`) };
  const out: ProCandidate[] = [];
  for (let i = 0; i < 3; i++) {
    const eth = pick(h, ['Italian', 'Irish', 'Jewish'] as const);
    const skill = randInt(h, 35, 90);
    const honesty = randInt(h, 15, 95);
    const salary = Math.round(15 + skill * 0.35);
    // References are right more often than not.
    const looks = chance(h, 0.7) ? honesty : randInt(h, 15, 95);
    const hint = looks >= 70 ? 'References glowing; went to Mass with the last owner' : looks >= 45 ? 'References fine; a little vague about why he left' : 'Left his last job in a hurry; his references don\'t call back';
    out.push({ name: `${pick(h, MALE_FIRST[eth])} ${pick(h, SURNAMES[eth])}`, skill, honesty, loyalty: randInt(h, 30, 75), salary, hint });
  }
  return out;
}

export function managerFromPro(s: GameState, p: ProCandidate): Manager {
  return { source: 'pro', name: p.name, skill: p.skill, loyalty: p.loyalty, honesty: p.honesty, salary: p.salary, share: 0, oversight: 'monthly', since: s.week, skimmed: 0 };
}

/** Family members who could run a place (adults of the house, not the boss, not inside). */
export function familyCandidates(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== s.playerId && isFree(s, c) && age(s, c) >= 18 && age(s, c) < 75 && !managing(s, c.id));
}

/** Crew who could run a place (not the boss, not already managing). */
export function crewCandidates(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && !c.dynasty && c.rank !== 'civilian' && c.id !== s.playerId && isFree(s, c) && !managing(s, c.id));
}

/** Adult children (16–25) who could start out as an assistant. */
export function assistantCandidates(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== s.playerId && isFree(s, c) && age(s, c) >= 16 && age(s, c) <= 25 && !managing(s, c.id));
}

export function managing(s: GameState, charId: string): string | undefined {
  const ms = s.econ?.managers ?? {};
  for (const k in ms) if (ms[k].charId === charId || ms[k].assistantId === charId) return k;
  return undefined;
}

/* ---------------- club staff ---------------- */

const ROLES_BY_KIND: Partial<Record<BusinessKind, StaffRole[]>> = {
  club: ['bandleader', 'bartender', 'bartender', 'host', 'server', 'security'],
  burlesque: ['performer', 'performer', 'dancer', 'bandleader', 'bartender', 'security'],
  gentsclub: ['dancer', 'dancer', 'dancer', 'bartender', 'host', 'security', 'chef'],
  hoodclub: ['dancer', 'dancer', 'bartender', 'dj', 'security'],
  supperclub: ['bandleader', 'performer', 'chef', 'bartender', 'host', 'server'],
};

export const ROLE_LABEL: Record<StaffRole, string> = {
  dancer: 'Dancer', bartender: 'Bartender', dj: 'Disc jockey', bandleader: 'Bandleader', host: 'Host', server: 'Cocktail server', security: 'Doorman', chef: 'Chef', performer: 'Headliner',
};

const WOMEN = ['Dolores', 'Rita', 'Connie', 'Peggy', 'Marlene', 'Gloria', 'Joan', 'Lorraine', 'Bettina', 'Shirley', 'Vera', 'Darlene', 'Frances', 'Lucille'];
const STAGE = ['Starr', 'LaRue', 'Divine', 'Monroe', 'Blaze', 'Carroll', 'Dumont', 'Valentine'];
const FEMALE_ROLES: StaffRole[] = ['dancer', 'server'];

export function isClub(b: Business): boolean {
  return CLUB_KINDS.includes(b.kind);
}

/** Creates a club's roster the first time it is needed. */
export function ensureStaff(s: GameState, b: Business): StaffMember[] {
  const e = ensureEcon(s);
  if (!isClub(b)) return [];
  let list = e.staff[b.id];
  if (!list) {
    list = (ROLES_BY_KIND[b.kind] ?? []).map((role) => newStaff(s, role));
    e.staff[b.id] = list;
  }
  return list;
}

export function newStaff(s: GameState, role: StaffRole): StaffMember {
  const e = ensureEcon(s);
  const female = FEMALE_ROLES.includes(role) || (role === 'performer' && chance(e, 0.6)) || (role === 'bartender' && chance(e, 0.25));
  const first = female ? pick(e, WOMEN) : pick(e, MALE_FIRST[pick(e, ['Italian', 'Irish', 'Jewish'] as const)]);
  const last = role === 'dancer' || role === 'performer' ? pick(e, STAGE) : pick(e, SURNAMES[pick(e, ['Italian', 'Irish', 'Jewish'] as const)]);
  return { id: eid(e, 'st'), name: `${first} ${last}`, role, skill: randInt(e, 30, 85), ambition: randInt(e, 10, 95), since: s.week };
}

/** What an ambitious staffer wants to do next (abstract, adults choosing their own careers). */
export function staffAmbition(m: StaffMember): { fate: 'manager' | 'own_club' | 'rival_bar' | 'producer'; text: string } | undefined {
  if (m.ambition < 70) return undefined;
  if (m.role === 'dancer' || m.role === 'performer') return m.skill >= 65 ? { fate: 'manager', text: 'wants to run the floor' } : { fate: 'own_club', text: 'wants to open a place of her own' };
  if (m.role === 'bartender') return { fate: 'rival_bar', text: 'has his eye on a bar of his own down the street' };
  if (m.role === 'dj' || m.role === 'bandleader') return { fate: 'producer', text: 'wants to produce records' };
  if (m.role === 'host') return { fate: 'manager', text: 'wants to manage the room' };
  return undefined;
}

export function bossName(s: GameState): string {
  return player(s).firstName;
}
