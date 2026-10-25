import type { BuildStyle, SignColor } from './design';
import type { Lot } from './econState';
import { HOOD_IDS, HOODS, SEED, type HoodId } from './hoodData';
import { inflation, tenantRent, USES_BY_ID, ZONES_BY_ID } from './property';
import { hashSeed } from './rng';
import type { GameState } from './types';

/**
 * The neighborhood layer's state (`GameState.hood`, optional so older saves
 * load): each neighborhood's economy, reputation, police attention,
 * infrastructure, population and municipal policy; the looks of the places
 * other people own; the log of what changed on the island; and one snapshot
 * a year so the dashboard can show the town then and now.
 *
 * The buildings themselves are lots in `econ.lots` (one record each). The
 * layer rolls its own dice (`hood.rng`) so it never reshuffles the rest.
 */

export type PolicyId = 'tourism' | 'bluelaws' | 'neon' | 'renewal' | 'casino' | 'cleanup';

export const POLICIES: Record<PolicyId, { name: string; blurb: string }> = {
  tourism: { name: 'Tourism push', blurb: 'The city prints postcards and paves for the summer trade. Easy permits for anything with a sign.' },
  bluelaws: { name: 'Blue laws enforced', blurb: 'Sunday closings and last call at two. The vice squad has a quota.' },
  neon: { name: 'Neon ordinance', blurb: 'Bigger signs allowed on the motel strip; the council wants Las Vegas, not Asbury Park.' },
  renewal: { name: 'Urban renewal', blurb: 'Federal money to tear down what is tired. Old owners sell cheap.' },
  casino: { name: 'Casino talk', blurb: 'Everyone waits to see what Atlantic City gets. Nobody invests until they know.' },
  cleanup: { name: 'Clean-up campaign', blurb: 'The papers want the strip cleaned up. Inspectors and cameras.' },
};

export interface HoodStat {
  /** Local economy (1 = a normal 1960 season). */
  econ: number;
  /** Reputation 0-100: how the town and the tourists see it (desirable, safe, fun). */
  rep: number;
  /** Police attention 0-100. */
  police: number;
  /** Streets, sewers, planks, lights 0-100. */
  infra: number;
  /** Year-round residents. */
  pop: number;
  policy: PolicyId;
}

export type HoodEventKind = 'owner' | 'open' | 'close' | 'build' | 'fire' | 'reno' | 'policy' | 'police' | 'style' | 'rival';

export interface HoodEvent {
  y: number;
  m: number;
  hood: HoodId;
  lotId?: string;
  kind: HoodEventKind;
  text: string;
}

export interface HoodSnapRow {
  buildings: number;
  businesses: number;
  vacant: number;
  forSale: number;
  /** Rough market value of everything in it. */
  value: number;
  /** Lots held, by owner (faction id, 'private', 'city'). */
  owners: Record<string, number>;
  econ: number;
  rep: number;
  police: number;
}

export interface HoodSnap { y: number; by: Record<HoodId, HoodSnapRow> }

export interface HoodState {
  rng: number;
  lastMonth?: string;
  stats: Record<HoodId, HoodStat>;
  /** What each lot looked like at the last look, to notice changes made by any system. */
  seen: Record<string, string>;
  log: HoodEvent[];
  snaps: HoodSnap[];
  /** The look of places other people own (yours live in `econ.designs`). */
  styles: Record<string, { style: BuildStyle; sign: SignColor; since: number }>;
  counts: { sales: number; rivalBuys: number; closures: number; openings: number; renos: number; restyles: number };
}

const BASE: Record<HoodId, [rep: number, police: number, infra: number]> = {
  boardwalk: [72, 30, 64], pacific: [55, 42, 58], downtown: [60, 35, 52], docks: [40, 28, 40], crest: [80, 18, 70], north: [62, 26, 55], causeway: [45, 22, 45], westww: [58, 12, 38],
};

function seedLot(s: GameState, i: number): Lot {
  const [id, zone, run, cross, , use, name, status, owner, who, , , built, cond] = SEED[i];
  const u = USES_BY_ID[use];
  const z = ZONES_BY_ID[zone];
  const land = Math.round(1500 * z.land * inflation(s) / 50) * 50;
  const bldg = u ? Math.round(u.cost * z.land * 0.85 * (0.6 + 0.4 * cond / 100) * inflation(s) / 50) * 50 : 0;
  const street = run === 'bw' ? `Boardwalk at ${cross}` : run === 'pier' ? `${cross.replace(/ Ave$/, '')} Ave pier` : `${cross}, ${run.startsWith('oc') ? 'Ocean Ave' : run.startsWith('pa') ? 'Pacific Ave' : run.startsWith('nj') ? 'New Jersey Ave' : run.startsWith('at') ? 'Atlantic Ave' : 'Park Blvd'}`;
  const lot: Lot = {
    id, zone, idx: 100 + i, address: street, status, owner, price: land + bldg, rent: 0, condition: cond,
    use: status === 'lease' ? undefined : use, stage: status === 'lease' ? undefined : 'open', builtYear: built,
    name: status === 'lease' ? undefined : name, tenant: who || undefined,
    history: [{ year: built, week: 0, owner, how: 'built', by: who || undefined }],
  };
  if (status === 'lease') { lot.price = 0; lot.rent = Math.max(15, Math.round(land * 0.006)); }
  else lot.rent = tenantRent(s, lot);
  return lot;
}

function blankStats(): Record<HoodId, HoodStat> {
  const out = {} as Record<HoodId, HoodStat>;
  for (const h of HOODS) out[h.id] = { econ: 1, rep: BASE[h.id][0], police: BASE[h.id][1], infra: BASE[h.id][2], pop: h.pop, policy: 'tourism' };
  return out;
}

/**
 * The layer's state, created if missing — and the migration for older saves:
 * the authored 1960 records are added to the property market once (by id).
 * Needs the property market (`econ.lots`) to exist; returns undefined before.
 */
export function ensureHood(s: GameState): HoodState | undefined {
  const e = s.econ;
  if (!e || !e.lots.length) return undefined;
  if (!s.hood) {
    s.hood = { rng: hashSeed(`${s.seed}:hood`), stats: blankStats(), seen: {}, log: [], snaps: [], styles: {}, counts: { sales: 0, rivalBuys: 0, closures: 0, openings: 0, renos: 0, restyles: 0 } };
  }
  const h = s.hood;
  for (const id of HOOD_IDS) h.stats[id] ??= blankStats()[id];
  h.counts.restyles ??= 0;
  const have = new Set(e.lots.map((l) => l.id));
  SEED.forEach((r, i) => {
    if (have.has(r[0])) return;
    e.lots.push(seedLot(s, i));
    if (r[7] !== 'lease') h.styles[r[0]] ??= { style: r[10], sign: r[11], since: r[12] };
  });
  return h;
}
