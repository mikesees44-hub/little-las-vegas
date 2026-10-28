/**
 * Historical status for the target year, from the evidence at hand.
 *
 * With no Sanborn sheet or directory checked yet, every modern feature starts
 * `unverified`. The assessor's year built (MOD-IV YR_CONSTR) is the only
 * period evidence in the parcels, and it is weak (a renovation can reset it,
 * a parcel's year belongs to its main building only), so it is medium
 * confidence at best:
 *
 *   YR_CONSTR ≤ target year  → likely existed  (confidence medium)
 *   YR_CONSTR > target year  → built after: remove for the target year (confidence medium)
 *   missing or 0             → unknown
 */
import type { HistEvidence, HistOverride, HistStatus } from '../../../src/engine/importedCity';

export const ASSESSOR_SOURCE = 'NJ MOD-IV tax list via NJOGIS parcels: YR_CONSTR (assessor\'s year built)';

export interface YearRuling { status: HistStatus; yr?: number; evidence: HistEvidence[]; note: string; conflict?: string }

export function yrConstrRule(yr: number | null | undefined, targetYear: number): YearRuling {
  if (yr === null || yr === undefined || yr === 0 || !Number.isFinite(yr)) {
    return { status: 'unknown', evidence: [], note: 'no assessor year built: unknown for the target year' };
  }
  if (yr <= targetYear) {
    return { status: 'likely-existed', yr, note: `likely existed (assessor year built ${yr}, confidence medium)`, evidence: [{ year: yr, source: ASSESSOR_SOURCE, confidence: 'medium', note: `assessor year built ${yr} ≤ ${targetYear}: likely existed` }] };
  }
  return { status: 'absent', yr, note: `built after ${targetYear}: remove for ${targetYear} (assessor year built ${yr}, confidence medium)`, evidence: [{ year: yr, source: ASSESSOR_SOURCE, confidence: 'medium', note: `assessor year built ${yr} > ${targetYear}: built after ${targetYear}` }] };
}

/**
 * The ruling for a building from the parcels under it: the primary parcel's
 * year; a conflict (another parcel under 25%+ of it with a different side of
 * the target year) is noted for review.
 */
export function buildingYearRuling(links: { parcelId: string; ofBuilding: number }[], yrOf: (parcelId: string) => number | null, targetYear: number): YearRuling {
  if (!links.length) return { status: 'unknown', evidence: [], note: 'on no parcel: unknown for the target year' };
  const r = yrConstrRule(yrOf(links[0].parcelId), targetYear);
  const others = links.slice(1).filter((l) => l.ofBuilding >= 0.25).map((l) => ({ l, r: yrConstrRule(yrOf(l.parcelId), targetYear) }));
  const clash = others.find((o) => o.r.status !== 'unknown' && r.status !== 'unknown' && o.r.status !== r.status);
  if (clash) r.conflict = `parcel ${clash.l.parcelId} (${Math.round(clash.l.ofBuilding * 100)}% of the building) says ${clash.r.note}`;
  if (r.status === 'unknown') {
    const alt = others.find((o) => o.r.status !== 'unknown');
    if (alt) r.conflict = `primary parcel has no year; ${alt.l.parcelId} says ${alt.r.note}`;
  }
  return r;
}

/** The pipeline's proposal record for a ruling (historical-overrides.json). */
export function rulingOverride(buildingId: string, r: YearRuling, createdAt: string): HistOverride | undefined {
  if (r.status === 'unknown' || !r.evidence.length) return undefined;
  return {
    id: `yr-${buildingId.replace(/[^a-z0-9]+/gi, '-')}`,
    target: { layer: 'buildings', id: buildingId },
    action: r.status === 'absent' ? 'remove' : 'keep',
    years: r.status === 'absent' ? { to: (r.yr ?? 0) - 1 } : undefined,
    evidence: r.evidence[0],
    origin: 'pipeline',
    status: 'proposed',
    createdAt,
  };
}
