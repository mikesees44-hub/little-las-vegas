import { xpFlipReasons } from './crewXp';
import { ageOn } from './calendar';
import { displayName, hasTrait, isFree } from './characters';
import { FEMALE_FIRST, MALE_FIRST, SURNAMES } from './names';
import { opinion } from './relations';
import { getRelation } from './relations';
import { capoOf } from './hierarchy';
import { between, choose, clamp, hit, mgView, roll, type MgSession } from './minigame';
import type { Character, Ethnicity, GameState, Trait } from './types';

/**
 * The case file for TRIAL MODE: lawyers, the jury pool, judges, the
 * prosecution's evidence (built from the game's real evidence sources) and
 * the conviction odds. Everything is plain data on the session, rolled on
 * the session's own dice, and the odds come from visible numbers.
 */

/* ---------------------------------------------------------------- */
/* Lawyers                                                           */
/* ---------------------------------------------------------------- */

export interface Lawyer {
  id: string;
  name: string;
  firm: string;
  blurb: string;
  /** 0-100: objections, cross-examination, reading a jury. */
  skill: number;
  /** Fee for the boss's case (crew cases cost half). */
  cost: number;
  /** Juries can smell a mob lawyer: + lean per juror. */
  taint: number;
  /** Will he arrange for a juror to be reached? */
  tamper: boolean;
  /** Keeps a client from talking to the government (− flip odds). */
  flipGuard: number;
  /** Judges' respect: shaves the sentence. */
  bench: number;
  /** Bonus with Cape May County juries. */
  local: number;
  connections: string;
}

export const LAWYERS: Lawyer[] = [
  { id: 'carbone', name: 'Jules "the Mouthpiece" Carbone', firm: 'Atlantic Avenue, Atlantic City', blurb: 'Has represented every made man between Camden and the Inlet. Juries know his face.', skill: 62, cost: 3000, taint: 1, tamper: true, flipGuard: 0.1, bench: 0, local: 0, connections: 'Knows a court officer. Keeps clients from getting ideas.' },
  { id: 'hale', name: 'Thaddeus Hale', firm: 'Whitcomb, Hale & Pryor, Broad Street, Philadelphia', blurb: 'White-shoe. Princeton, the Main Line, a partner in a firm that represents banks.', skill: 86, cost: 9000, taint: 0, tamper: false, flipGuard: 0, bench: 0.15, local: 0, connections: 'Judges listen to him. He will not be in the room for anything irregular.' },
  { id: 'lindner', name: 'Abe Lindner, Esq.', firm: 'Chestnut Street, Philadelphia', blurb: 'The best criminal lawyer in the Delaware Valley, and he knows it.', skill: 76, cost: 6000, taint: 0, tamper: false, flipGuard: 0.05, bench: 0.1, local: 0, connections: 'Knows every judge in Camden by first name.' },
  { id: 'kaminsky', name: 'Ruth Kaminsky', firm: 'Office of the Public Defender, Cape May Court House', blurb: 'Twenty-nine, second in her class at Rutgers–Camden, two hundred cases a year.', skill: 46, cost: 0, taint: 0, tamper: false, flipGuard: -0.05, bench: 0, local: 2, connections: 'Grew up in Rio Grande. Local juries like her. Pushes clients to take deals.' },
];
export const LAWYER_BY_ID: Record<string, Lawyer> = Object.fromEntries(LAWYERS.map((l) => [l.id, l]));

/* ---------------------------------------------------------------- */
/* Judges                                                            */
/* ---------------------------------------------------------------- */

export interface Judge {
  name: string;
  blurb: string;
  /** 0-100: how hard he is to reach. */
  integrity: number;
  /** Sentence multiplier from his temperament. */
  temper: number;
  /** − to objection odds. */
  strict: number;
}

const JUDGES: Judge[] = [
  { name: 'Judge Harold V. Brandt', blurb: 'Sentences like the time comes out of his own pocket.', integrity: 88, temper: 1.2, strict: 0.06 },
  { name: 'Judge Francis X. Mulcahy', blurb: 'Plays golf at Pine Valley with half the county.', integrity: 42, temper: 1.0, strict: 0 },
  { name: 'Judge Miriam Adler Stein', blurb: 'Reads every motion twice. Nobody has ever gotten to her.', integrity: 95, temper: 1.0, strict: 0.04 },
  { name: 'Judge Anthony Cerullo', blurb: 'A Wildwood boy who went to law school on a scholarship somebody paid for.', integrity: 30, temper: 0.85, strict: -0.03 },
];

/* ---------------------------------------------------------------- */
/* The jury pool                                                     */
/* ---------------------------------------------------------------- */

export type JurorTag = 'union' | 'family' | 'law' | 'faith' | 'local';

export interface Juror {
  id: string;
  name: string;
  gender: 'M' | 'F';
  ethnicity: Ethnicity;
  age: number;
  job: string;
  town: string;
  bio: string;
  /** −10 (acquit) .. +10 (convict): the truth. */
  lean: number;
  /** What your lawyer reads. */
  read: number;
  tags: JurorTag[];
  /** A government-friendly juror who hides it. */
  plant?: boolean;
  struck?: 'defense' | 'prosecution';
  seated?: boolean;
  /** Reached through the Fixer. */
  reached?: boolean;
  traits: Trait[];
}

interface JurorTpl {
  job: string;
  town: string;
  g: 'M' | 'F';
  lean: [number, number];
  bio: string;
  tags: JurorTag[];
  eth?: Ethnicity;
  traits?: Trait[];
  must?: boolean;
}

const JURORS: JurorTpl[] = [
  { job: 'Union pipefitter, Local 322', town: 'Rio Grande', g: 'M', lean: [-6, -2], bio: 'Thirty years in the Local. Thinks the FBI broke the strike of \'58.', tags: ['union', 'local'], eth: 'Irish', must: true },
  { job: 'Schoolteacher', town: 'Wildwood Crest', g: 'F', lean: [2, 6], bio: 'Teaches civics to eighth graders. Believes in the system, chapter and verse.', tags: ['local'], must: true, traits: ['Honest'] },
  { job: 'Retired police sergeant', town: 'North Wildwood', g: 'M', lean: [5, 9], bio: 'Twenty-six years on the job. Knows exactly how these things go.', tags: ['law', 'local'], eth: 'Irish', must: true },
  { job: 'Saltwater taffy stand', town: 'Wildwood boardwalk', g: 'M', lean: [-5, 1], bio: 'Pays somebody every summer, and you can see him wondering who.', tags: ['local'] },
  { job: 'Shipyard welder, Korea veteran', town: 'Cape May', g: 'M', lean: [-1, 4], bio: 'Respects the flag and the uniform. Not so sure about lawyers.', tags: [] },
  { job: 'Housewife, four kids', town: 'West Wildwood', g: 'F', lean: [-3, 2], bio: 'Wants everybody home by supper, including the defendant.', tags: ['family', 'local'] },
  { job: 'Grocer on Pacific Avenue', town: 'Wildwood', g: 'M', lean: [-7, -3], bio: 'Knew the defendant\'s mother from church. Did not mention it.', tags: ['family', 'local'], eth: 'Italian' },
  { job: 'Methodist minister\'s wife', town: 'Ocean City', g: 'F', lean: [3, 8], bio: 'Ocean City is a dry town. So is she.', tags: ['faith'], traits: ['Pious'] },
  { job: 'Cranberry farmer', town: 'Woodbine', g: 'M', lean: [-2, 3], bio: 'Distrusts Philadelphia lawyers and Washington about equally.', tags: [], eth: 'Jewish' },
  { job: 'Clammer', town: 'Stone Harbor', g: 'M', lean: [-4, 1], bio: 'Up at four every morning. Sleeps through the afternoon testimony.', tags: ['union', 'local'] },
  { job: 'Bank teller', town: 'Cape May Court House', g: 'F', lean: [1, 5], bio: 'Counts other people\'s money for a living. Notices numbers.', tags: [] },
  { job: 'Bartender', town: 'Diamond Beach', g: 'M', lean: [-5, 0], bio: 'Has poured drinks for half the men in this courtroom.', tags: ['union', 'local'] },
  { job: 'Motel owner', town: 'Wildwood Crest', g: 'F', lean: [-3, 3], bio: 'Her motel depends on a quiet summer and nobody asking questions.', tags: ['family', 'local'] },
  { job: 'Widow of a county detective', town: 'Villas', g: 'F', lean: [2, 7], bio: 'Her husband worked nights for twenty years. She remembers why.', tags: ['law'] },
  { job: 'Gas station attendant, 22', town: 'Erma', g: 'M', lean: [-3, 2], bio: 'Reports for induction in the fall. Mostly thinking about that.', tags: [] },
  { job: 'Retired Coast Guard chief', town: 'Cape May', g: 'M', lean: [2, 7], bio: 'Thirty years watching the inlet for rumrunners.', tags: ['law'] },
  { job: 'Nurse at Burdette Tomlin', town: 'Cape May Court House', g: 'F', lean: [0, 4], bio: 'Has stitched up the results of men like the defendant.', tags: [] },
  { job: 'Buick salesman', town: 'Rio Grande', g: 'M', lean: [-4, 2], bio: 'Everyone is a customer, including the defendant, maybe.', tags: ['local'], traits: ['Charming'] },
  { job: 'Tailor', town: 'Cape May', g: 'M', lean: [-2, 3], bio: 'Left one government behind in Europe. Watches this one closely.', tags: [], eth: 'Jewish' },
  { job: 'Church organist', town: 'Cape May Point', g: 'F', lean: [1, 5], bio: 'Plays the eight o\'clock Mass. Hears a great deal.', tags: ['faith'] },
  { job: 'Seasonal waitress', town: 'Wildwood', g: 'F', lean: [-4, 1], bio: 'Works the season at a place the defendant may or may not own.', tags: ['local'] },
  { job: 'Bus driver, Shore Fast Line', town: 'Wildwood', g: 'M', lean: [-2, 1], bio: 'Quiet. Polite. Keeps glancing at the prosecutor\'s table.', tags: ['local'], eth: 'Irish' },
];

export const POOL_SIZE = 16;
export const SEATS = 12;
export const DEFENSE_STRIKES = 3;

export function makePool(_s: GameState, ses: MgSession, skill: number, local: number): Juror[] {
  const must = JURORS.filter((t) => t.must);
  const rest = JURORS.filter((t) => !t.must);
  const picks: JurorTpl[] = [...must];
  const bag = rest.slice();
  while (picks.length < POOL_SIZE && bag.length) picks.push(bag.splice(Math.floor(roll(ses) * bag.length), 1)[0]);
  // Shuffle the order they are called.
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(roll(ses) * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  const plantAt = hit(ses, 0.3) ? between(ses, 0, picks.length - 1) : -1;
  return picks.map((t, i) => {
    const eth: Ethnicity = t.eth ?? choose(ses, ['Italian', 'Irish', 'Irish', 'Jewish'] as Ethnicity[]);
    const first = t.g === 'M' ? choose(ses, MALE_FIRST[eth]) : choose(ses, FEMALE_FIRST[eth]);
    const last = choose(ses, SURNAMES[eth]);
    let lean = between(ses, t.lean[0], t.lean[1]);
    const plant = i === plantAt;
    if (plant) lean = between(ses, 7, 10);
    const noise = Math.max(1, Math.round((100 - skill) / 12) - (t.tags.includes('local') ? local : 0));
    const shown = plant ? between(ses, -2, 1) : lean;
    const read = clamp(shown + between(ses, -noise, noise), -10, 10);
    return { id: `j${i + 1}`, name: `${first} ${last}`, gender: t.g, ethnicity: eth, age: between(ses, 24, 68), job: t.job, town: t.town, bio: t.bio, lean, read, tags: t.tags, plant: plant || undefined, traits: t.traits ?? [] };
  });
}

/* ---------------------------------------------------------------- */
/* The prosecution's evidence                                        */
/* ---------------------------------------------------------------- */

export type ItemKind = 'tapes' | 'wiretap' | 'informant' | 'flipper' | 'surveillance' | 'money' | 'eyewitness' | 'words' | 'other';
export type Angle = 'deal' | 'vice' | 'grudge' | 'memory';

export interface TrialWitness {
  name: string;
  job: string;
  charId?: string;
  /** 0-100: how believable he is. */
  credibility: number;
  /** 0-100: how steady he is. */
  nerve: number;
  /** The line of cross-examination that hurts him most. */
  weak: Angle;
}

export interface EvidenceSeed {
  kind: ItemKind;
  title: string;
  text: string;
  weight: number;
  physical: boolean;
  witness?: TrialWitness;
}

export interface CaseItem extends EvidenceSeed {
  id: string;
  strength: number;
  base: number;
  status: 'pending' | 'in' | 'out' | 'shaken' | 'firm';
  note?: string;
}

/** Another branch can add evidence (the economy branch's bugged-HQ tapes, a politics scandal ...). */
type EvidenceSource = (s: GameState, defendant: Character) => EvidenceSeed[];
const SOURCES: EvidenceSource[] = [];
export function registerEvidenceSource(fn: EvidenceSource): void {
  SOURCES.push(fn);
}

const CIVILIANS = [
  { job: 'Waitress at the Hotel Davis coffee shop', weak: 'memory' as Angle },
  { job: 'Cab driver, Yellow Cab of Wildwood', weak: 'vice' as Angle },
  { job: 'Night clerk at a Pacific Avenue motel', weak: 'memory' as Angle },
  { job: 'Bartender at the Rainbow Room', weak: 'vice' as Angle },
];

function seeds(s: GameState, d: Character, ses: MgSession): EvidenceSeed[] {
  const out: EvidenceSeed[] = [];
  const isBoss = d.id === s.playerId || d.rank === 'boss';
  const year = s.date.y;
  // Bugged headquarters (the economy branch sets the flag; registered sources can add more).
  if ((s.econ?.hq?.leaked ?? 0) > 0 || !!s.econ?.hq?.bug || (s.flags.hqTapes ?? 0) > 0) {
    out.push({ kind: 'tapes', title: 'Tapes from the social club', text: 'Reels from a microphone the FBI planted in the back room. Voices, names, numbers.', weight: 1.7, physical: true });
  }
  if (year >= 1968 || (year === 1968 && s.date.m >= 6)) {
    out.push({ kind: 'wiretap', title: 'A court-ordered wiretap', text: 'Under the new crime bill: a tap on the phone behind the bar, and a warrant to go with it.', weight: 1.1, physical: true });
  }
  // Flippers and cooperating witnesses who can hurt this man.
  const mg = mgView(s);
  for (const w of mg.witnesses.filter((x) => x.against.includes(d.id) || (isBoss && !x.boss)).slice(-2)) {
    const c = s.characters[w.id];
    out.push({
      kind: 'flipper', title: `${w.name} takes the stand`, text: `${w.boss ? 'The old boss himself' : 'A man who used to stand next to him'}, now a government witness, under protection.`, weight: 1.6, physical: false,
      witness: { name: w.name, job: 'Cooperating witness', charId: w.id, credibility: w.credibility, nerve: c ? clamp(60 - (hasTrait(c, 'Cowardly') ? 25 : 0) + (hasTrait(c, 'Vengeful') ? 15 : 0), 10, 95) : 55, weak: 'deal' },
    });
  }
  const informant = (s.flags.informant ?? 0) > 0 || Object.values(s.characters).some((c) => c.alive && c.faction === 'player' && c.informantFor === 'law');
  if (informant) out.push({ kind: 'informant', title: 'An informant\'s reports', text: 'An FBI agent reads from the reports of a "confidential source" inside the crew.', weight: 1.0, physical: false, witness: { name: 'Special Agent Neil Corcoran', job: 'FBI, Philadelphia field office', credibility: 60, nerve: 85, weak: 'deal' } });
  out.push({ kind: 'surveillance', title: 'Surveillance photographs', text: 'Long-lens pictures: the parking lot of the Hotel Davis, a Tuesday meeting, the same faces every week.', weight: 0.9, physical: true });
  if (s.unwashed > 5000 || s.businesses.filter((b) => b.owner === 'player' && b.category === 'front').length >= 2) {
    out.push({ kind: 'money', title: 'The money trail', text: 'Bank records: deposits that do not match the receipts of a pizza stand and a laundromat.', weight: 0.9, physical: true });
  }
  if ((d.record ?? 0) > 0 || !isBoss) {
    const civ = choose(ses, CIVILIANS);
    const eth = choose(ses, ['Irish', 'Italian'] as Ethnicity[]);
    out.push({ kind: 'eyewitness', title: 'An eyewitness', text: 'Somebody who was there and says so.', weight: 0.8, physical: false, witness: { name: `${choose(ses, FEMALE_FIRST[eth])} ${choose(ses, SURNAMES[eth])}`, job: civ.job, credibility: between(ses, 40, 72), nerve: between(ses, 20, 60), weak: civ.weak } });
  }
  out.push({ kind: 'words', title: 'His own words', text: year >= 1966 ? 'What he said to two agents in the back of a sedan, and whether anybody read him his rights first.' : 'What he said to two agents who stopped him on Ocean Avenue.', weight: 0.7, physical: false, witness: { name: 'Special Agent Ray Lutz', job: 'FBI, Newark field office', credibility: 66, nerve: 88, weak: 'memory' } });
  for (const src of SOURCES) out.push(...src(s, d));
  return out;
}

/** The prosecution's case: 3-5 items whose strengths add up to the evidence file. */
export function buildCase(s: GameState, d: Character, evidence: number, rico: boolean, ses: MgSession): CaseItem[] {
  const all = seeds(s, d, ses).map((x) => ({ x, k: x.weight + roll(ses) * 0.6 + (x.kind === 'flipper' || x.kind === 'tapes' ? 2 : 0) }));
  all.sort((a, b) => b.k - a.k);
  const n = clamp(3 + (all.length > 5 ? 2 : all.length > 3 ? 1 : 0), 3, 5);
  const take = all.slice(0, Math.min(n, all.length)).map((a) => a.x);
  const total = evidence * (rico ? 1.1 : 1);
  const wsum = take.reduce((a, x) => a + x.weight, 0);
  return take.map((x, i) => {
    const st = Math.round(((total * x.weight) / wsum) * 10) / 10;
    return { ...x, id: `e${i + 1}`, strength: st, base: st, status: 'pending' as const };
  });
}

/* ---------------------------------------------------------------- */
/* The odds                                                          */
/* ---------------------------------------------------------------- */

/** The base of the conviction formula, tuned so that letting it play out matches the old passive trial. */
export const BASE = 0.5;
/** Weight of each point of evidence still standing. */
export const EVIDENCE_WEIGHT = 1.3;

export interface OddsInput {
  items: CaseItem[];
  baseDefense: number;
  lawyerSkill: number;
  defensePts: number;
  closingBonus: number;
  jurors: Juror[];
  taint: number;
}

export function caseStrength(items: CaseItem[]): number {
  return items.reduce((a, x) => a + (x.status === 'out' ? 0 : x.strength), 0);
}

/** Sum of the jury's lean: the seated twelve, or what twelve from the pool would look like. */
export function juryLean(jurors: Juror[], truth: boolean, taint: number): number {
  const lean = (j: Juror) => (truth ? j.lean : j.read) + taint;
  const seated = jurors.filter((j) => j.seated);
  if (seated.length) return seated.reduce((a, j) => a + lean(j) - (j.reached ? 6 : 0), 0);
  const avail = jurors.filter((j) => !j.struck);
  if (!avail.length) return 0;
  return (avail.reduce((a, j) => a + lean(j), 0) / avail.length) * SEATS;
}

export function convictionP(o: OddsInput, truth = true): { p: number; parts: { label: string; value: number }[] } {
  const ev = caseStrength(o.items);
  const lawyer = o.lawyerSkill / 4;
  const jury = juryLean(o.jurors, truth, o.taint);
  const parts = [
    { label: 'The case against him', value: (ev * EVIDENCE_WEIGHT) / 100 },
    { label: 'Defense work already done', value: -o.baseDefense / 100 },
    { label: 'His lawyer', value: -lawyer / 100 },
    { label: 'Defense witnesses', value: -o.defensePts / 100 },
    { label: 'Closing argument', value: -o.closingBonus / 100 },
    { label: truth ? 'The jury' : 'The jury (your lawyer\'s read)', value: jury / 80 },
  ];
  const p = clamp(BASE + parts.reduce((a, x) => a + x.value, 0), 0.05, 0.92);
  return { p, parts };
}

/** Chance a conviction becomes a hung jury: strong holdouts, a reached juror. */
export function hangChance(jurors: Juror[]): number {
  const seated = jurors.filter((j) => j.seated);
  const holdouts = seated.filter((j) => j.lean <= -6).length;
  const reached = seated.some((j) => j.reached);
  return clamp(holdouts * 0.06 + (reached ? 0.55 : 0), 0, 0.75);
}

/* ---------------------------------------------------------------- */
/* Will he flip?                                                     */
/* ---------------------------------------------------------------- */

/** Reasons a man in custody turns: traits, loyalty, family and what they have on him. */
export function npcFlipReasons(s: GameState, c: Character, evidence: number, rico: boolean): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [{ label: 'Base', value: 0.06 }];
  out.push({ label: `What they have on him (${Math.round(evidence)})`, value: evidence / 260 });
  if (rico) out.push({ label: 'RICO: twenty years on the table', value: 0.1 });
  if (hasTrait(c, 'Cowardly')) out.push({ label: 'Cowardly', value: 0.2 });
  if (hasTrait(c, 'Loyal-to-a-fault')) out.push({ label: 'Loyal to a fault', value: -0.28 });
  if (hasTrait(c, 'Honest')) out.push({ label: 'Honest (an old-fashioned man)', value: -0.04 });
  if (hasTrait(c, 'Paranoid')) out.push({ label: 'Paranoid', value: 0.05 });
  if (hasTrait(c, 'Greedy')) out.push({ label: 'Greedy', value: 0.04 });
  const kids = c.household?.kids.length ?? c.childrenIds.length;
  if (kids > 0) out.push({ label: `${kids} kid${kids > 1 ? 's' : ''} at home`, value: 0.08 });
  const op = opinion(s, c.id, s.playerId);
  out.push({ label: `What he thinks of the boss (${op})`, value: -op / 320 });
  const k = capoOf(s, c);
  if (k && k.id !== c.id) out.push({ label: `His capo ${k.firstName} (${opinion(s, c.id, k.id)})`, value: -opinion(s, c.id, k.id) / 480 });
  const fear = getRelation(s, c.id, s.playerId)?.fear ?? 0;
  if (fear) out.push({ label: 'Fear of the boss', value: -fear / 420 });
  if (c.informantFor === 'law') out.push({ label: 'Already talking to them', value: 0.4 });
  if (c.dynasty) out.push({ label: 'Blood', value: -0.15 });
  out.push(...xpFlipReasons(s, c));
  return out;
}

export function sumP(rs: { value: number }[], lo = 0.02, hi = 0.8): number {
  return clamp(rs.reduce((a, r) => a + r.value, 0), lo, hi);
}

/* ---------------------------------------------------------------- */
/* Small helpers                                                     */
/* ---------------------------------------------------------------- */

export function pickJudge(ses: MgSession): Judge {
  return { ...choose(ses, JUDGES) };
}

export function fixerOf(s: GameState): Character | undefined {
  const id = s.council?.fixer?.holderId;
  const c = id ? s.characters[id] : undefined;
  return c && c.alive && c.faction === 'player' && isFree(s, c) ? c : undefined;
}

export function credibilityOf(c: Character): number {
  let v = 58;
  if (hasTrait(c, 'Honest')) v += 14;
  if (hasTrait(c, 'Drinker')) v -= 14;
  if (hasTrait(c, 'Charming')) v += 6;
  if (hasTrait(c, 'Vengeful')) v -= 6;
  v -= Math.min(15, (c.record ?? 0) * 3);
  return clamp(v, 20, 90);
}

export function ageOf(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}

export function nm(c: Character): string {
  return displayName(c);
}
