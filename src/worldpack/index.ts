/**
 * World Pack entry point: assembles every roster, adds inverse relationships,
 * validates the whole population, and maps a WorldPerson onto the shape of
 * the engine's Character.
 *
 * Nothing here imports the engine; `toEngineCharacter` returns a plain object
 * whose fields match little-las-vegas/src/engine/types.ts Character (plus the
 * llv-crew optional fields craft/vices/specialty/record/evidence/office).
 */
import { CIVILIANS } from './civilians';
import { ENTERTAINMENT } from './entertainment';
import { FIRE } from './fire';
import { DYNASTIES, GAME_REFS, INSTITUTIONS, LADDERS, OFFICES } from './institutions';
import { LEGAL } from './legal';
import { POLICE } from './police';
import { POLITICIANS } from './politicians';
import {
  GAME_TRAITS, OPPOSED_TRAITS, SECRET_TO_GAME, SPECIALTY_TO_GAME, TRAIT_FALLBACK, VICE_TO_GAME,
  type ExtraTrait, type GameCraft, type GameEthnicity, type GameFaction, type GameRank, type GameSpecialty, type GameTrait, type GameVice,
  type RelKind, type WorldPerson,
} from './schema';
import { TOUGHS } from './toughs';

export * from './schema';
export { generatePerson, makeRng, hashString, FIRST_NAMES, SURNAMES, NICKNAMES, ARCHETYPES, DEMOGRAPHICS, YEARLY_INFLOW } from './generators';
export { POLITICIANS, POLICE, FIRE, LEGAL, TOUGHS, ENTERTAINMENT, CIVILIANS };

export const ROSTERS = {
  politicians: POLITICIANS,
  police: POLICE,
  fire: FIRE,
  legal: LEGAL,
  toughs: TOUGHS,
  entertainment: ENTERTAINMENT,
  civilians: CIVILIANS,
} as const;

/** The inverse of each relationship kind ("X is my parent" <-> "I am X's child"). */
export const INVERSE_REL: Record<RelKind, RelKind> = {
  spouse: 'spouse', parent: 'child', child: 'parent', sibling: 'sibling', cousin: 'cousin', 'in-law': 'in-law', relative: 'relative',
  grandparent: 'grandchild', grandchild: 'grandparent', patron: 'protege', protege: 'patron', mentor: 'protege', rival: 'rival',
  enemy: 'enemy', ally: 'ally', friend: 'friend', lover: 'lover', 'ex-spouse': 'ex-spouse', employer: 'employee', employee: 'employer',
  handler: 'informant', informant: 'handler', partner: 'partner',
};

function linkInverses(people: WorldPerson[]): void {
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const p of people) {
    for (const r of p.relationships) {
      const other = byId.get(r.id);
      if (!other) continue;
      const inv = INVERSE_REL[r.kind];
      // A mentor's inverse is protege, but a protege's inverse is patron; accept either as "already linked".
      const already = other.relationships.some((x) => x.id === p.id && (x.kind === inv || (inv === 'protege' && x.kind === 'protege') || (r.kind === 'protege' && (x.kind === 'mentor' || x.kind === 'patron'))));
      if (!already) other.relationships.push({ kind: inv, id: p.id, ...(r.note ? { note: r.note } : {}) });
    }
  }
}

/** Every hand-written person, with inverse relationships filled in. */
export const ALL_PEOPLE: WorldPerson[] = [...POLITICIANS, ...POLICE, ...FIRE, ...LEGAL, ...TOUGHS, ...ENTERTAINMENT, ...CIVILIANS];
linkInverses(ALL_PEOPLE);

export const PEOPLE_BY_ID: Record<string, WorldPerson> = Object.fromEntries(ALL_PEOPLE.map((p) => [p.id, p]));

export function countsByFile(): Record<keyof typeof ROSTERS, number> {
  return Object.fromEntries(Object.entries(ROSTERS).map(([k, v]) => [k, v.length])) as Record<keyof typeof ROSTERS, number>;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/** Godfather-derived surnames and character names that must never appear. */
export const FORBIDDEN_NAMES = [
  'corleone', 'barzini', 'tattaglia', 'tessio', 'stracci', 'clemenza', 'cuneo', 'brasi', 'sollozzo', 'mccluskey', 'woltz', 'fontane',
  'pentangeli', 'lampone', 'bonasera', 'andolini', 'fanucci', 'abbandando', 'zasa', 'altobello', 'lucchesi', 'geraci', 'neri', 'gatto',
  'rizzi', 'hagen', 'roth', 'ola', 'greene',
];
/** Surnames of the engine's houses: allowed only for kin explicitly linked to the engine character or for the dynasties built on them. */
export const ENGINE_HOUSE_SURNAMES: Record<string, { refs: string[]; dynasties: string[] }> = {
  Manno: { refs: ['game:carmine_manno'], dynasties: [] },
  Feldstein: { refs: ['game:ira_feldstein'], dynasties: [] },
  Kessler: { refs: ['game:danny_kessler'], dynasties: ['kessler'] },
  Moretti: { refs: ['game:sal_moretti'], dynasties: [] },
  Carbone: { refs: ['game:leo_carbone'], dynasties: [] },
  Nardella: { refs: ['game:tommy_nardella'], dynasties: [] },
  Keane: { refs: ['game:martin_keane'], dynasties: ['keane'] },
  Donnelly: { refs: ['game:francis_donnelly'], dynasties: ['donnelly'] },
  Dougherty: { refs: ['game:frank_dougherty'], dynasties: [] },
  Pruitt: { refs: ['game:roy_pruitt'], dynasties: [] },
  Albanese: { refs: ['game:rocco_albanese'], dynasties: [] },
  Weiss: { refs: ['game:herman_weiss'], dynasties: [] },
  Keough: { refs: ['game:walter_keough'], dynasties: [] },
  Gorman: { refs: ['game:edward_gorman'], dynasties: [] },
  Healy: { refs: ['game:thomas_healy'], dynasties: [] },
  Voss: { refs: ['game:harold_voss'], dynasties: [] },
  Kerns: { refs: ['game:walter_kerns'], dynasties: [] },
  Sees: { refs: [], dynasties: [] },
};

export function validateWorld(people: WorldPerson[] = ALL_PEOPLE): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  const gameKeys = new Set(GAME_REFS.map((g) => `game:${g.key}`));
  const dyn = new Set(DYNASTIES.map((d) => d.id));
  const inst = new Set(INSTITUTIONS.map((i) => i.id));
  const seats = new Set(OFFICES.map((o) => o.id));
  const names = new Map<string, string>();
  for (const p of people) {
    if (ids.has(p.id)) errs.push(`duplicate id ${p.id}`);
    ids.add(p.id);
    const full = `${p.name.first} ${p.name.last}${p.name.suffix ? ` ${p.name.suffix}` : ""}`;
    const prev = names.get(full);
    // Dynasties reuse names across generations (Patrick Callahan, 1876 and 1946); other duplicates are errors.
    if (prev && !(p.dynastyId && people.find((x) => x.id === prev)?.dynastyId === p.dynastyId)) errs.push(`duplicate name ${full} (${p.id}, ${prev})`);
    names.set(full, p.id);
  }
  for (const p of people) {
    const where = p.id;
    if (!inst.has(p.institution)) errs.push(`${where}: unknown institution ${p.institution}`);
    if (p.dynastyId && !dyn.has(p.dynastyId)) errs.push(`${where}: unknown dynasty ${p.dynastyId}`);
    if (p.seat && !seats.has(p.seat)) errs.push(`${where}: unknown seat ${p.seat}`);
    if (p.ladder) {
      const l = LADDERS[p.ladder.id];
      if (!l) errs.push(`${where}: unknown ladder ${p.ladder.id}`);
      else if (p.ladder.rung < 0 || p.ladder.rung >= l.rungs.length) errs.push(`${where}: rung ${p.ladder.rung} out of range for ${p.ladder.id}`);
    }
    for (const r of p.relationships) {
      if (r.id.startsWith('game:')) { if (!gameKeys.has(r.id)) errs.push(`${where}: unknown engine ref ${r.id}`); }
      else if (!ids.has(r.id)) errs.push(`${where}: relationship to missing ${r.id}`);
      if (r.id === p.id) errs.push(`${where}: relationship to self`);
    }
    for (const d of p.debts) if (d.to.startsWith('game:') && !gameKeys.has(d.to)) errs.push(`${where}: debt to unknown ${d.to}`);
    for (const s of p.secrets) for (const k of s.knownTo ?? []) {
      if (k.startsWith('game:') ? !gameKeys.has(k) : (k.includes('_') && !ids.has(k))) errs.push(`${where}: secret known to missing ${k}`);
    }
    for (const [a, b] of OPPOSED_TRAITS) if (p.traits.includes(a) && p.traits.includes(b)) errs.push(`${where}: opposed traits ${a}/${b}`);
    if (new Set(p.traits).size !== p.traits.length) errs.push(`${where}: duplicate trait`);
    const low = `${p.name.first} ${p.name.last} ${p.nickname ?? ''}`.toLowerCase();
    for (const f of FORBIDDEN_NAMES) if (new RegExp(`\\b${f}\\b`).test(low)) errs.push(`${where}: forbidden name "${f}"`);
    const house = ENGINE_HOUSE_SURNAMES[p.name.last];
    if (house) {
      const linked = p.relationships.some((r) => house.refs.includes(r.id)) || (p.dynastyId !== undefined && house.dynasties.includes(p.dynastyId));
      if (!linked) errs.push(`${where}: surname ${p.name.last} belongs to an engine house but is not linked to it`);
    }
    if (p.domain === 'street' && (p.birthYear < 1930 || p.birthYear > 1948)) errs.push(`${where}: street tough born ${p.birthYear}, outside 1930-1948`);
    if (p.deathYear && p.deathYear < p.birthYear) errs.push(`${where}: dies before birth`);
    if (p.police?.faction === 'pad' && p.police.padWeekly === 0 && !p.deathYear && p.activeFrom === undefined) errs.push(`${where}: on the pad with no envelope`);
    for (const k of Object.keys(p.attributes) as (keyof typeof p.attributes)[]) {
      const v = p.attributes[k];
      if (!(v >= 0 && v <= 100)) errs.push(`${where}: attribute ${k}=${v}`);
    }
    if (!p.hook || p.hook.length < 10) errs.push(`${where}: missing hook`);
    if (!p.name.first || !p.name.last || /^(Jr\.|Sr\.|II|III|IV)$/.test(p.name.last)) errs.push(`${where}: badly parsed name ${JSON.stringify(p.name)}`);
    if (p.name.first.split(' ').some((w) => p.name.last.startsWith(w) && w.length > 2 && w !== p.name.last)) errs.push(`${where}: first name contains a surname fragment ${JSON.stringify(p.name)}`);
  }
  return errs;
}

/* ------------------------------------------------------------------ */
/* Mapping onto the engine's Character                                 */
/* ------------------------------------------------------------------ */

/** Plain object matching the engine's Character fields (types.ts) plus llv-crew optionals. */
export interface EngineCharacterSeed {
  id: string;
  firstName: string;
  lastName: string;
  maidenName?: string;
  nickname?: string;
  gender: 'M' | 'F';
  ethnicity: GameEthnicity;
  birth: { y: number; m: number; d: number };
  health: number;
  conditions: string[];
  attributes: { leadership: number; business: number; diplomacy: number; intrigue: number; force: number; discipline: number };
  traits: GameTrait[];
  ambition: string;
  rank: GameRank;
  faction: GameFaction;
  wealth: number;
  dynasty: boolean;
  spouseId?: string;
  fatherId?: string;
  motherId?: string;
  childrenIds: string[];
  alive: boolean;
  office?: string;
  record?: number;
  evidence?: number;
  specialty?: GameSpecialty;
  craft?: GameCraft;
  vices?: GameVice[];
  /** Back-reference so the integrator can look up the full WorldPerson. */
  worldId: string;
}

/** Engine traits only, with extras folded in where TRAIT_FALLBACK allows, max 3, no opposed pairs. */
export function engineTraits(p: WorldPerson): GameTrait[] {
  const out: GameTrait[] = [];
  const push = (t: GameTrait | null) => {
    if (!t || out.includes(t) || out.length >= 3) return;
    if (OPPOSED_TRAITS.some(([a, b]) => (a === t && out.includes(b as GameTrait)) || (b === t && out.includes(a as GameTrait)))) return;
    out.push(t);
  };
  for (const t of p.traits) if ((GAME_TRAITS as readonly string[]).includes(t)) push(t as GameTrait);
  for (const t of p.traits) if (!(GAME_TRAITS as readonly string[]).includes(t)) push(TRAIT_FALLBACK[t as ExtraTrait]);
  return out;
}

/**
 * Turn a WorldPerson into an engine Character seed for the given game year.
 * `idOf` maps world ids to engine ids (default: the same id). Family links
 * are only filled for people that `idOf` resolves (pass a map of everyone
 * you are instantiating).
 */
export function toEngineCharacter(p: WorldPerson, year = 1960, idOf: (worldId: string) => string | undefined = (x) => x): EngineCharacterSeed {
  const h = [...p.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const age = year - p.birthYear;
  const traits = engineTraits(p);
  let health = 100 - Math.max(0, age - 35) * 0.9 - (traits.includes('Drinker') ? 8 : 0);
  if (p.vices.includes('heroin') || p.vices.includes('pills')) health -= 10;
  const rel = (k: RelKind) => p.relationships.filter((r) => r.kind === k).map((r) => r.id);
  const parentOf = (sex: 'M' | 'F') => rel('parent').find((id) => (PEOPLE_BY_ID[id]?.sex ?? 'M') === sex);
  const spec = p.street ? SPECIALTY_TO_GAME[p.street.specialty] : undefined;
  const faction: GameFaction = p.street?.currentlyWith ?? (p.institution.startsWith('fbi') || p.institution === 'federal_other' ? 'law' : 'none');
  const vices = [...new Set(p.vices.map((v) => VICE_TO_GAME[v]).filter((v): v is GameVice => !!v))];
  const seed: EngineCharacterSeed = {
    id: idOf(p.id) ?? p.id,
    firstName: p.name.first,
    lastName: p.name.last,
    gender: p.sex,
    ethnicity: p.gameEthnicity,
    birth: { y: p.birthYear, m: 1 + (h % 12), d: 1 + ((h >> 4) % 28) },
    health: Math.max(5, Math.min(100, Math.round(health))),
    conditions: [],
    attributes: {
      leadership: p.attributes.leadership, business: p.attributes.business, diplomacy: p.attributes.diplomacy,
      intrigue: p.attributes.intrigue, force: p.attributes.force, discipline: p.attributes.discipline,
    },
    traits,
    ambition: p.street?.arc ?? p.hook,
    rank: p.gameRank,
    faction,
    wealth: p.wealth,
    dynasty: false,
    childrenIds: rel('child').map((id) => idOf(id)).filter((x): x is string => !!x),
    alive: !(p.deathYear !== undefined && p.deathYear <= year),
    office: p.office,
    worldId: p.id,
  };
  if (p.name.maiden) seed.maidenName = p.name.maiden;
  if (p.nickname) seed.nickname = p.nickname;
  const sp = rel('spouse')[0];
  if (sp && idOf(sp)) seed.spouseId = idOf(sp);
  const fa = parentOf('M');
  const mo = parentOf('F');
  if (fa && idOf(fa)) seed.fatherId = idOf(fa);
  if (mo && idOf(mo)) seed.motherId = idOf(mo);
  if (p.street) {
    seed.record = p.street.record;
    seed.craft = spec?.craft;
    if (spec?.specialty) seed.specialty = spec.specialty;
  }
  if (p.domain === 'legal' && p.legal?.role === 'mob-lawyer') seed.specialty = 'lawyer';
  if (p.civilian && p.id === 'civ_dr_pugliese') seed.specialty = 'doctor';
  seed.evidence = Math.min(100, p.secrets.reduce((a, s) => a + s.severity * 4, 0));
  if (vices.length) seed.vices = vices;
  return seed;
}

/** Engine secret kinds for a person's secrets (for seeding GameState.secrets). */
export function engineSecrets(p: WorldPerson): { kind: ReturnType<typeof secretKind>; text: string; inheritable: boolean }[] {
  return p.secrets.map((s) => ({ kind: secretKind(s.kind), text: s.text, inheritable: !!s.inheritable }));
}
function secretKind(k: WorldPerson['secrets'][number]['kind']) {
  return SECRET_TO_GAME[k];
}
