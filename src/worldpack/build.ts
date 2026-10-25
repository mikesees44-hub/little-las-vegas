/**
 * Compact authoring helper for the hand-written rosters.
 *
 * Each roster entry states who the person is (names, dates, office, texture)
 * and an archetype; the six game skills and the eight world attributes are
 * filled from the archetype, the traits, and a small deterministic jitter
 * seeded by the person's id, then any explicit overrides in `x` win.
 * Same input, same output, every build.
 */
import { INSTITUTIONS } from './institutions';
import { makeRng, rollAttributes, type Archetype } from './generators';
import type {
  CivilianInfo, Circuit, FireInfo, FireRole, GameFaction, GameRank, Ideology, InstitutionId, LadderId, LegalInfo, LegalRole, CourtLevel,
  MobIntersect, Origin, Party, PersonRef, PoliceBranch, PoliceFaction, RelKind, SecretKind, ShowbizCategory, StreetOrigin,
  StreetSpecialty, TieKind, Trajectory, WorldAttributes, WorldPerson, WorldTrait, WorldVice,
} from './schema';
import { ORIGIN_TO_GAME } from './schema';

export interface Spec {
  id: string;
  /** "First Last". The last space-separated token is the surname unless `last` is given. */
  n: string;
  last?: string;
  maiden?: string;
  nick?: string;
  /** Female. */
  f?: boolean;
  b: number;
  d?: number;
  dc?: string;
  o: Origin;
  home: string;
  inst: InstitutionId;
  off: string;
  lad?: [LadderId, number];
  seat?: string;
  /** "1946 Patrolman; 1952 Sergeant; 1958 Lieutenant" */
  hist?: string;
  party?: Party;
  ideo?: Ideology;
  es?: number;
  pub: string;
  hid: string;
  a: Archetype;
  x?: Partial<WorldAttributes>;
  t: WorldTrait[];
  v?: WorldVice[];
  /** [kind, severity, text, proof?, inheritable?, knownTo?] */
  s?: [SecretKind, 1 | 2 | 3, string, string?, boolean?, string[]?][];
  /** [to, kind, amount, note?] */
  debt?: [string, 'money' | 'favor' | 'loyalty', number, string?][];
  /** [kind, id, note?] */
  rel?: [RelKind, PersonRef, string?][];
  /** [kind, target, strength, note?] */
  ties?: [TieKind, string, number, string?][];
  dyn?: string;
  w: number;
  hook: string;
  from?: number;
  rank?: GameRank;
  /** Police: [branch, faction, weekly envelope, badge?] */
  cop?: [PoliceBranch, PoliceFaction, number, string?];
  /** Fire: [role, arson eye, signs for cash] */
  fd?: [FireRole, number, boolean];
  /** Legal: [role, court level or null, reachable, retainer?] */
  lg?: [LegalRole, CourtLevel | null, number, number?];
  /** Street: [origin, specialty, leadership potential, groomability, record, currently with, arc] */
  st?: [StreetOrigin, StreetSpecialty, number, number, number, GameFaction, string];
  /** Showbiz. */
  sh?: { cat: ShowbizCategory; act?: string; cir: Circuit[]; tr: Trajectory; fame: number; peak: number; risk: number; mob: MobIntersect[]; fee?: number };
  /** Civilian: [occupation, establishment, usefulness] */
  cv?: [string, string | null, number];
  tags?: string[];
}

function parseHistory(h: string | undefined): { year: number; title: string }[] {
  if (!h) return [];
  return h.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(\d{4})\s+(.*)$/.exec(s);
    if (!m) throw new Error(`Bad history step "${s}"`);
    return { year: Number(m[1]), title: m[2] };
  });
}

export function P(sp: Spec): WorldPerson {
  const inst = INSTITUTIONS.find((i) => i.id === sp.inst);
  if (!inst) throw new Error(`${sp.id}: unknown institution ${sp.inst}`);
  // "Henry P. Kessler Jr.": a generational suffix is split off before the surname is found.
  const sm = /^(.*?)[\s,]+(Jr\.|Sr\.|II|III|IV)$/.exec(sp.n);
  const base = sm ? sm[1] : sp.n;
  const suffix = sm ? sm[2] : undefined;
  const parts = base.split(' ');
  const last = sp.last ?? parts[parts.length - 1];
  const at = sp.last ? base.lastIndexOf(sp.last) : -1;
  if (sp.last && at < 0) throw new Error(`${sp.id}: surname "${sp.last}" not found in "${sp.n}"`);
  const first = sp.last ? base.slice(0, at).trim() : parts.slice(0, -1).join(' ');
  const rng = makeRng(`world-pack:${sp.id}`);
  const attributes = rollAttributes(rng, sp.a, sp.t, 6, sp.x);
  const p: WorldPerson = {
    id: sp.id,
    name: sp.maiden ? { first, last, maiden: sp.maiden } : { first, last },
    sex: sp.f ? 'F' : 'M',
    birthYear: sp.b,
    origin: sp.o,
    gameEthnicity: ORIGIN_TO_GAME[sp.o],
    hometown: sp.home,
    domain: inst.domain,
    institution: sp.inst,
    office: sp.off,
    careerHistory: parseHistory(sp.hist),
    publicReputation: sp.pub,
    hiddenPersonality: sp.hid,
    attributes,
    traits: sp.t,
    vices: sp.v ?? [],
    secrets: (sp.s ?? []).map(([kind, severity, text, proof, inheritable, knownTo]) => ({
      kind, severity, text, ...(proof ? { proof } : {}), ...(inheritable ? { inheritable } : {}), ...(knownTo ? { knownTo } : {}),
    })),
    debts: (sp.debt ?? []).map(([to, kind, amount, note]) => ({ to, kind, amount, ...(note ? { note } : {}) })),
    relationships: (sp.rel ?? []).map(([kind, id, note]) => ({ kind, id, ...(note ? { note } : {}) })),
    ties: (sp.ties ?? []).map(([kind, target, strength, note]) => ({ kind, target, strength, ...(note ? { note } : {}) })),
    wealth: sp.w,
    hook: sp.hook,
    gameRank: sp.rank ?? 'civilian',
  };
  if (suffix) p.name.suffix = suffix;
  if (sp.nick) p.nickname = sp.nick;
  if (sp.d) p.deathYear = sp.d;
  if (sp.dc) p.deathCause = sp.dc;
  if (sp.lad) p.ladder = { id: sp.lad[0], rung: sp.lad[1] };
  else if (inst.ladder && !sp.st) p.ladder = { id: inst.ladder, rung: 0 };
  if (sp.seat) p.seat = sp.seat;
  if (sp.party) p.party = sp.party;
  if (sp.ideo) p.ideology = sp.ideo;
  if (sp.es !== undefined) p.electoralStrength = sp.es;
  if (sp.dyn) p.dynastyId = sp.dyn;
  if (sp.from) p.activeFrom = sp.from;
  if (sp.tags) p.tags = sp.tags;
  if (sp.cop) p.police = { branch: sp.cop[0], faction: sp.cop[1], padWeekly: sp.cop[2], ...(sp.cop[3] ? { badge: sp.cop[3] } : {}) };
  if (sp.fd) p.fire = { role: sp.fd[0], arsonEye: sp.fd[1], signsForCash: sp.fd[2] } as FireInfo;
  if (sp.lg) p.legal = { role: sp.lg[0], ...(sp.lg[1] ? { court: sp.lg[1] } : {}), reachable: sp.lg[2], ...(sp.lg[3] ? { retainer: sp.lg[3] } : {}) } as LegalInfo;
  if (sp.st) {
    const [origin, specialty, leadershipPotential, groomability, record, currentlyWith, arc] = sp.st;
    p.street = { origin, specialty, leadershipPotential, groomability, record, currentlyWith, arc };
    if (!sp.lad) p.ladder = { id: 'street', rung: p.gameRank === 'soldier' ? 2 : p.gameRank === 'associate' ? 1 : 0 };
  }
  if (sp.sh) {
    const s = sp.sh;
    p.showbiz = { category: s.cat, ...(s.act ? { act: s.act } : {}), circuit: s.cir, trajectory: s.tr, fame: s.fame, peakYear: s.peak, scandalRisk: s.risk, mobIntersect: s.mob, ...(s.fee ? { weekFee: s.fee } : {}) };
  }
  if (sp.cv) p.civilian = { occupation: sp.cv[0], ...(sp.cv[1] ? { establishment: sp.cv[1] } : {}), usefulness: sp.cv[2] } as CivilianInfo;
  return p;
}
