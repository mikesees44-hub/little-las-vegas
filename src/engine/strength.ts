import { crew, isFree } from './characters';
import { hashSeed } from './rng';
import { opinion } from './relations';
import { isAway } from './travelState';
import { ESTIMATE_BAND, GEAR_BY_ID, PATHS_BY_ID, type GearCat } from './devData';
import { devStrengthTech, tierOf, type GearStack } from './devState';
import type { Character, GameState, Rival } from './types';

/**
 * CREW STRENGTH: one transparent number for how tough the family is, and
 * every reason behind it. It replaces the old "sum of the men's muscle" as
 * the family's muscle in wars, raids, rival strikes and the underbelly: the
 * men still come first (the old number is the "men" line), and equipment,
 * leadership, cohesion, fear, reputation, local ties and the development
 * paths adjust it.
 *
 * Equipment only counts in a crew that has the men to use it: a crew of
 * three with ten pieces is equipped three times over and the seven do
 * nothing (they show as "spare"). Worn gear counts for less.
 */

export interface StrengthPart { key: string; label: string; value: number; why: string }

export interface CrewGear {
  /** Weapon units in use / owned by this crew. */
  armed: number;
  weapons: number;
  armor: number;
  cars: number;
  /** Units beyond what the men can use. */
  spare: number;
  /** Average condition of what is in use (0..1). */
  cond: number;
}

export interface CrewAssessment {
  /** 'family' (the boss's own men) or the capo's id. */
  holder: string;
  name: string;
  capoId?: string;
  /** Everyone on the books of this crew. */
  members: number;
  /** Free to fight this week. */
  men: number;
  /** Why the rest are out: "2 inside, 1 hurt". */
  out: string[];
  /** The men's own muscle (force/18 each). */
  muscle: number;
  gearValue: number;
  total: number;
  gear: CrewGear;
  shortages: string[];
  strengths: string[];
}

export interface StrengthAssessment {
  total: number;
  parts: StrengthPart[];
  crews: CrewAssessment[];
  strengths: string[];
  weaknesses: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const condEff = (c: number) => (c < 0.25 ? 0.25 : c);

/** Why a man can't fight this week (undefined: he can). */
export function outReason(s: GameState, c: Character): string | undefined {
  if (!c.alive) return 'dead';
  if (!isFree(s, c)) return 'inside';
  if (isAway(s, c.id)) return 'away';
  if (c.health < 35) return 'hurt';
  if ((c.busyUntil ?? 0) > s.week) return 'busy';
  return undefined;
}

/** The crews: each capo's regime (capo included), and the boss's own men (everyone else). */
export function crewsOf(s: GameState): { holder: string; name: string; capoId?: string; members: Character[] }[] {
  type C = { holder: string; name: string; capoId?: string; members: Character[] };
  const all = crew(s);
  const capos = all.filter((c) => c.rank === 'capo').sort((a, b) => (a.id < b.id ? -1 : 1));
  const ids = new Set(capos.map((c) => c.id));
  const out: C[] = capos.map((k) => ({ holder: k.id, name: `${k.firstName} ${k.lastName}'s crew`, capoId: k.id, members: [k, ...all.filter((c) => c.capoId === k.id && c.id !== k.id)] }));
  const own = all.filter((c) => !ids.has(c.id) && !(c.capoId && ids.has(c.capoId)));
  out.unshift({ holder: 'family', name: 'Your own men', members: own });
  return out;
}

/** Valid holders for equipment right now. */
export function gearHolders(s: GameState): string[] {
  return crewsOf(s).map((c) => c.holder);
}

export function holderName(s: GameState, holder: string): string {
  if (holder === 'family') return 'Your own men';
  const c = s.characters[holder];
  return c ? `${c.firstName} ${c.lastName}'s crew` : 'A crew that is gone';
}

function crewGear(stacks: GearStack[], men: number): { value: (muscle: number) => number; gear: CrewGear } {
  const units: { power: number; cond: number; role: string }[] = [];
  for (const g of stacks) {
    const def = GEAR_BY_ID[g.cat];
    for (let i = 0; i < g.n; i++) units.push({ power: def.power, cond: condEff(g.cond), role: def.role });
  }
  const weapons = units.filter((u) => u.role === 'weapon').sort((a, b) => b.power * b.cond - a.power * a.cond);
  const armor = units.filter((u) => u.role === 'armor').sort((a, b) => b.cond - a.cond);
  const cars = units.filter((u) => u.role === 'car').sort((a, b) => b.cond - a.cond);
  const usedW = weapons.slice(0, men);
  const usedA = armor.slice(0, men);
  const carNeed = Math.ceil(men / 3);
  const usedC = cars.slice(0, carNeed);
  const q = usedW.reduce((a, u) => a + u.power * u.cond, 0);
  const aq = usedA.reduce((a, u) => a + u.cond, 0);
  const cq = usedC.reduce((a, u) => a + u.cond, 0);
  const used = [...usedW, ...usedA, ...usedC];
  return {
    value: (muscle) => (men ? muscle * (0.2 * q / men + 0.08 * aq / men + 0.06 * Math.min(1, cq / carNeed)) : 0),
    gear: {
      armed: usedW.length, weapons: weapons.length, armor: armor.length, cars: cars.length,
      spare: weapons.length - usedW.length + armor.length - usedA.length + cars.length - usedC.length,
      cond: used.length ? used.reduce((a, u) => a + u.cond, 0) / used.length : 0,
    },
  };
}

/** One crew's assessment. */
function assessCrew(s: GameState, c: { holder: string; name: string; capoId?: string; members: Character[] }): CrewAssessment {
  const men: Character[] = [];
  const outs: Record<string, number> = {};
  for (const m of c.members) {
    const why = outReason(s, m);
    if (why) outs[why] = (outs[why] ?? 0) + 1;
    else men.push(m);
  }
  const muscle = men.reduce((a, m) => a + m.attributes.force / 18, 0);
  const stacks = (s.dev?.gear ?? []).filter((g) => g.holder === c.holder);
  const { value, gear } = crewGear(stacks, men.length);
  const gearValue = value(muscle);
  const shortages: string[] = [];
  const strengths: string[] = [];
  if (men.length && gear.armed < men.length) shortages.push(`${men.length - gear.armed} of ${men.length} men without equipment`);
  if (men.length >= 3 && gear.cars < Math.ceil(men.length / 3)) shortages.push(gear.cars ? `${gear.cars} car${gear.cars > 1 ? 's' : ''} for ${men.length} men` : 'no crew car');
  const worn = stacks.filter((g) => g.cond < 0.35);
  if (worn.length) shortages.push(`${worn.reduce((a, g) => a + g.n, 0)} worn-out piece${worn.reduce((a, g) => a + g.n, 0) > 1 ? 's' : ''} (repair or replace)`);
  if (gear.spare > 0) shortages.push(`${gear.spare} spare: more than the men can use, it adds nothing here`);
  if (c.capoId && !men.some((m) => m.id === c.capoId)) shortages.push('the capo is not there to lead them');
  if (!men.length && c.members.length) shortages.push('nobody free to fight');
  if (men.length && gear.armed >= men.length) strengths.push('every man equipped');
  if (gear.cond >= 0.85 && gear.armed) strengths.push('gear in good shape');
  if (muscle / Math.max(1, men.length) >= 3.3) strengths.push('hard men');
  const out = Object.entries(outs).map(([k, n]) => `${n} ${k}`);
  return { holder: c.holder, name: c.name, capoId: c.capoId, members: c.members.length, men: men.length, out, muscle: r1(muscle), gearValue: r1(gearValue), total: r1(muscle + gearValue), gear, shortages, strengths };
}

/** The family's crew strength (0..100) with every reason. Pure. */
export function crewStrength(s: GameState): StrengthAssessment {
  const crews = crewsOf(s).map((c) => assessCrew(s, c));
  const men = crews.reduce((a, c) => a + c.muscle, 0);
  const gear = crews.reduce((a, c) => a + c.gearValue, 0);
  const avail = crews.reduce((a, c) => a + c.men, 0);
  const members = crews.reduce((a, c) => a + c.members, 0);
  const outAll: Record<string, number> = {};
  for (const c of crews) for (const o of c.out) { const [n, k] = o.split(' '); outAll[k] = (outAll[k] ?? 0) + Number(n); }
  const parts: StrengthPart[] = [];
  parts.push({ key: 'men', label: 'The men', value: r1(men), why: `${avail} of ${members} free to fight${Object.keys(outAll).length ? ` (${Object.entries(outAll).map(([k, n]) => `${n} ${k}`).join(', ')})` : ''}; each man counts for his muscle` });
  const armed = crews.reduce((a, c) => a + c.gear.armed, 0);
  const spare = crews.reduce((a, c) => a + c.gear.spare, 0);
  parts.push({ key: 'gear', label: 'Equipment in use', value: r1(gear), why: `${armed} of ${avail} men equipped${spare ? `; ${spare} spare piece${spare > 1 ? 's' : ''} add nothing until a crew with the men gets them` : ''}` });
  // Leadership: the capos who are there to lead.
  const leaders = crews.filter((c) => c.capoId).map((c) => ({ c, k: s.characters[c.capoId!] })).filter((x) => x.k && !outReason(s, x.k));
  const leadless = crews.filter((c) => c.capoId && c.men > 0 && !leaders.some((x) => x.c === c)).length;
  const lw = leaders.reduce((a, x) => a + Math.max(1, x.c.men), 0);
  const avgLead = lw ? leaders.reduce((a, x) => a + x.k.attributes.leadership * Math.max(1, x.c.men), 0) / lw : 40;
  parts.push({ key: 'lead', label: 'Leadership', value: r1(clamp((avgLead - 60) / 8, -5, 5) - leadless), why: `${leaders.length ? `your capos lead at ${Math.round(avgLead)} on average` : 'no capo is there to lead'}${leadless ? `; ${leadless} crew${leadless > 1 ? 's' : ''} without its capo` : ''}` });
  // Cohesion: what the men think of you.
  const free = crews.flatMap((c) => crewsOf(s).find((x) => x.holder === c.holder)!.members.filter((m) => !outReason(s, m)));
  const avgOp = free.length ? free.reduce((a, m) => a + opinion(s, m.id, s.playerId), 0) / free.length : 0;
  parts.push({ key: 'cohesion', label: 'Cohesion & loyalty', value: r1(clamp(avgOp / 8, -4, 4)), why: `the men think ${avgOp >= 0 ? '+' : ''}${Math.round(avgOp)} of you on average` });
  const fear = s.dev?.fear ?? 20;
  parts.push({ key: 'fear', label: 'Fear', value: r1(clamp((fear - 20) / 12, -2, 5)), why: `the street's fear of your crews: ${Math.round(fear)} (not the same as respect, or loyalty)` });
  parts.push({ key: 'rep', label: 'Reputation', value: r1(clamp((s.respect - 40) / 15, -3, 4)), why: `respect ${Math.round(s.respect)}` });
  const inf = s.districts.length ? s.districts.reduce((a, d) => a + (d.influence.player ?? 0), 0) / s.districts.length : 0;
  const resent = s.dev?.resent ?? 0;
  parts.push({ key: 'local', label: 'Local ties', value: r1(clamp((inf - 50) / 10, -3, 3) - resent / 20), why: `you hold ${Math.round(inf)}% of the island on average${resent >= 5 ? `; the neighborhoods resent the arming up (${Math.round(resent)})` : ''}` });
  const t = devStrengthTech(s);
  if (t.wheels || t.comm) parts.push({ key: 'tech', label: 'Cars & communications', value: t.wheels + t.comm, why: [t.wheels ? `${PATHS_BY_ID.wheels.label.toLowerCase()} +${t.wheels}` : '', t.comm ? `${PATHS_BY_ID.comm.label.toLowerCase()} +${t.comm}` : ''].filter(Boolean).join(', ') });
  const total = clamp(parts.reduce((a, p) => a + p.value, 0), 0, 100);
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  for (const p of parts) {
    if (p.key === 'men') continue;
    if (p.value >= 1.5) strengths.push(`${p.label}: ${p.why}`);
    else if (p.value <= -1) weaknesses.push(`${p.label}: ${p.why}`);
  }
  if (avail && armed < avail) weaknesses.push(`Short of equipment: ${avail - armed} men have none`);
  if (spare >= 3) weaknesses.push(`${spare} pieces sit where nobody can use them: assign them to a crew with the men`);
  for (const c of crews) if (c.men && c.gear.armed >= c.men && c.gear.cond >= 0.75) strengths.push(`${c.name}: every man equipped, gear in good shape`);
  if (avail < members * 0.7) weaknesses.push(`Only ${avail} of ${members} men can fight this week`);
  return { total: r1(total), parts, crews, strengths, weaknesses };
}

/** The number the wars, raids and rival strikes read. */
export function strengthTotal(s: GameState): number {
  return crewStrength(s).total;
}

/* ------------------------------------------------------------------ */
/* The other families                                                  */
/* ------------------------------------------------------------------ */

/** A rival's real strength: its muscle, adjusted for its equipment and development. */
export function rivalStrength(s: GameState, r: Rival): number {
  const d = s.dev?.rivals[r.id];
  if (!d) return r.muscle;
  const gear = 1 + 0.25 * (d.gear * d.cond - 0.5);
  const tech = [0, 2, 3, 4][d.tiers.wheels ?? 0] + [0, 0, 1, 2, 3][d.tiers.comm ?? 0];
  return clamp(r.muscle * gear + tech, 0, 100);
}

export interface RivalEstimate { lo: number; mid: number; hi: number; band: number; label: string; gearWord: string; known: string[] }

const GEAR_WORDS: [number, string][] = [[0.3, 'poorly equipped'], [0.55, 'some equipment'], [0.8, 'well equipped'], [9, 'armed to the teeth']];

/** What you think a rival's strength is: an estimate, as good as your Information path. */
export function rivalEstimate(s: GameState, r: Rival): RivalEstimate {
  const band = ESTIMATE_BAND[tierOf(s, 'info')] ?? 0.3;
  const real = rivalStrength(s, r);
  const h = hashSeed(`${s.seed}:est:${r.id}:${Math.floor(s.week / 4)}`) % 1000;
  const mid = clamp(real * (1 + (h / 1000 - 0.5) * band), 0, 100);
  const d = s.dev?.rivals[r.id];
  const g = d ? d.gear * d.cond : 0.5;
  const known = (s.dev?.heard ?? []).filter((x) => x.rival === r.id).slice(-3).map((x) => x.text);
  return {
    lo: Math.round(clamp(mid * (1 - band), 0, 100)), mid: Math.round(mid), hi: Math.round(clamp(mid * (1 + band), 0, 100)), band,
    label: `Estimate: ${Math.round(clamp(mid * (1 - band), 0, 100))}–${Math.round(clamp(mid * (1 + band), 0, 100))}`,
    gearWord: GEAR_WORDS.find(([v]) => g < v)![1], known,
  };
}

/** For tests and the UI: equipment units per holder and category. */
export function gearCount(s: GameState, holder?: string, cat?: GearCat): number {
  return (s.dev?.gear ?? []).filter((g) => (holder === undefined || g.holder === holder) && (cat === undefined || g.cat === cat)).reduce((a, g) => a + g.n, 0);
}

