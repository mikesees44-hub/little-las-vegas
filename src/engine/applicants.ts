import { age, displayName, hasTrait, isFree, relationLabel } from './characters';
import { SEAT_INFO, seatOf } from './council';
import { fam } from './familyState';
import { crewCandidates, familyCandidates, honestyOf, loyaltyOf, managing } from './managers';
import { hashSeed, rand } from './rng';
import type { Character, GameState } from './types';

/**
 * Who could run a place, and who ASKS to. Family (the wife, grown children,
 * brothers and sisters, the in-laws), the crew, and — through the managers
 * module — hired locals. Every person carries a workload: TIME (what else he
 * or she already does for the house) and ENERGY (age, health, stress). A busy
 * or worn-out manager runs a place worse (`effort` scales his skill).
 *
 * Minors never run a business. A teenager of the house can at most help out
 * in the summers, which is flavor and nothing else.
 */

export interface Workload {
  /** 0..100: free time. */
  time: number;
  /** 0..100. */
  energy: number;
  /** What already takes his time. */
  jobs: string[];
  /** Why energy is low. */
  tired: string[];
  /** 0.55..1: multiplies his skill as a manager. */
  effort: number;
}

export function workload(s: GameState, c: Character, except?: string): Workload {
  const jobs: string[] = [];
  let time = 100;
  const seat = seatOf(s, c.id);
  if (seat) { jobs.push(SEAT_INFO[seat].name); time -= 35; }
  if (c.rank === 'capo' && s.districts.some((d) => d.capoId === c.id)) { jobs.push('Runs a crew as capo'); time -= 40; }
  const m = managing(s, c.id);
  if (m && m !== except) { jobs.push('Already runs another place'); time -= 45; }
  if (s.schemes.some((x) => x.owner === 'player' && x.agents.includes(c.id))) { jobs.push('Out on a job for you'); time -= 20; }
  if (s.businesses.some((b) => b.owner === 'player' && (b.staffIds ?? []).includes(c.id))) { jobs.push('Works one of your places'); time -= 15; }
  if (s.econ?.jobs[c.id]) { jobs.push('Has a no-show job (it really is no-show)'); time -= 5; }
  if (c.office) { jobs.push(c.office); time -= 30; }
  const little = c.childrenIds.map((id) => s.characters[id]).filter((k) => k?.alive && age(s, k) < 6);
  if (little.length && c.gender === 'F') { jobs.push(little.length > 1 ? 'Little ones at home' : 'A baby at home'); time -= 30; }
  const tired: string[] = [];
  let energy = 100;
  const a = age(s, c);
  if (a > 55) { energy -= (a - 55) * 1.5; tired.push(`Age ${a}`); }
  if (c.health < 70) { energy -= (100 - c.health) * 0.6; tired.push(`Health ${Math.round(c.health)}`); }
  const st = fam(s, c.id).stress ?? 0;
  if (st >= 30) { energy -= st * 0.4; tired.push(`Stress ${st}`); }
  if (hasTrait(c, 'Drinker')) { energy -= 8; tired.push('Drinks'); }
  time = Math.max(0, Math.min(100, Math.round(time)));
  energy = Math.max(0, Math.min(100, Math.round(energy)));
  const effort = Math.round((0.55 + 0.45 * Math.min(time, energy) / 100) * 100) / 100;
  return { time, energy, jobs, tired, effort };
}

/** The family who could run a place: the house plus in-laws (adults only). */
export function kinCandidates(s: GameState): Character[] {
  const boss = s.characters[s.playerId];
  const out = new Map(familyCandidates(s).map((c) => [c.id, c]));
  const spouse = boss?.spouseId ? s.characters[boss.spouseId] : undefined;
  const inLaws: Character[] = [];
  if (spouse) {
    for (const id of [spouse.fatherId, spouse.motherId]) if (id && s.characters[id]) inLaws.push(s.characters[id]);
    for (const o of Object.values(s.characters)) if (o.id !== spouse.id && spouse.fatherId && o.fatherId === spouse.fatherId) inLaws.push(o);
    inLaws.push(spouse);
  }
  for (const c of inLaws) {
    if (!c.alive || c.id === s.playerId || out.has(c.id) || !isFree(s, c) || managing(s, c.id)) continue;
    const a = age(s, c);
    if (a >= 18 && a < 75) out.set(c.id, c);
  }
  return [...out.values()];
}

/** Teenagers of the house (12–17): they may help out summers; they never run anything. */
export function summerHelpers(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== s.playerId && age(s, c) >= 12 && age(s, c) < 18);
}

/** How the boss would call him: "your wife", "your son", "your brother-in-law", or his rank. */
export function relationTo(s: GameState, c: Character): string {
  const boss = s.characters[s.playerId];
  if (!boss) return c.rank;
  const r = relationLabel(s, boss, c);
  if (r !== 'kin') return `your ${r}`;
  const spouse = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (spouse) {
    if (spouse.fatherId === c.id) return 'your father-in-law';
    if (spouse.motherId === c.id) return 'your mother-in-law';
    if (spouse.fatherId && c.fatherId === spouse.fatherId) return c.gender === 'F' ? 'your sister-in-law' : 'your brother-in-law';
  }
  if (c.dynasty) return 'family';
  return c.rank === 'civilian' ? 'a friend of the house' : c.rank;
}

export interface Applicant {
  charId: string;
  name: string;
  relation: string;
  family: boolean;
  /** What he says when he asks. */
  pitch: string;
  /** Why he wants it (motive). */
  motive: 'ambition' | 'greed' | 'loyalty' | 'idle' | 'pride';
  skill: number;
  loyalty: number;
  honesty: number;
  skim: 'low' | 'some' | 'high';
  work: Workload;
}

const PITCH: Record<Applicant['motive'], string[]> = {
  ambition: ['Give me a place of my own. I\'ll show you what I can do with it.', 'I\'ve been waiting for a chance like this. Let me run it.', 'Put my name on the door and watch the numbers.'],
  greed: ['I know where the money leaks in a place like that. I\'d plug it.', 'A place like that pays the man who watches it. Let me watch it.', 'I\'ll make it earn. Trust me on the details.'],
  loyalty: ['Let me look after it for you. Family should.', 'You need somebody you can trust in there. That\'s me.', 'Whatever you need. I\'ll keep it clean and keep it quiet.'],
  idle: ['I\'m going crazy sitting around. Put me to work.', 'I\'ve got the time. Nobody else does.', 'Give me something to do besides wait by the phone.'],
  pride: ['I\'ve kept this house\'s books for years. Let me run something with my name on it.', 'I can run a front desk better than any man on the island.', 'I know the people in that neighborhood. They\'d come because it\'s me.'],
};

/**
 * The people who ask to run the place (best first): family and crew whose
 * ambition, greed, loyalty or idleness make them want it. Deterministic for
 * the place and the month.
 */
export function applicants(s: GameState, key: string, max = 4): Applicant[] {
  const pool = [...kinCandidates(s), ...crewCandidates(s).filter((c) => !c.dynasty)];
  const out: (Applicant & { want: number })[] = [];
  const spouse = s.characters[s.playerId]?.spouseId;
  for (const c of pool) {
    const h = { rng: hashSeed(`${s.seed}:ask:${key}:${s.date.y}-${s.date.m}:${c.id}`) };
    const w = workload(s, c, key);
    const loyalty = loyaltyOf(s, c);
    const honesty = honestyOf(c);
    const scores: [Applicant['motive'], number][] = [
      ['ambition', (hasTrait(c, 'Ambitious') ? 35 : 0) + (c.rank === 'associate' ? 10 : 0)],
      ['greed', hasTrait(c, 'Greedy') ? 30 : hasTrait(c, 'Gambler') ? 15 : 0],
      ['loyalty', loyalty >= 65 ? 20 + (loyalty - 65) / 2 : 0],
      ['idle', w.time >= 90 ? 15 : 0],
      ['pride', c.id === spouse ? 25 : c.dynasty && c.attributes.business >= 55 ? 15 : 0],
    ];
    scores.sort((a, b) => b[1] - a[1]);
    const [motive, m] = scores[0];
    const want = m + c.attributes.business / 5 + w.time / 10 + rand(h) * 15 - (w.energy < 40 ? 15 : 0);
    if (want < 30 || m === 0) continue;
    const lines = PITCH[motive];
    out.push({
      charId: c.id, name: displayName(c), relation: relationTo(s, c), family: c.dynasty || kinCandidates(s).some((k) => k.id === c.id),
      pitch: lines[Math.floor(rand(h) * lines.length)], motive,
      skill: c.attributes.business, loyalty, honesty, skim: honesty >= 60 ? 'low' : honesty >= 40 ? 'some' : 'high', work: w, want,
    });
  }
  return out.sort((a, b) => b.want - a.want || a.charId.localeCompare(b.charId)).slice(0, max).map(({ want: _w, ...a }) => a);
}
