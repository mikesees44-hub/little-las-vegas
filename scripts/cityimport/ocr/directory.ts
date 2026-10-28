/**
 * City-directory pages → candidate business records.
 *
 *   pages:   citydata/<city>/raw/directories/<directory-id>/page-*.{png,jpg} with a
 *            manifest.json { id, title, year, source, license, pages: [...] } (added by hand
 *            from public-domain scans; nothing is downloaded here)
 *   OCR:     ocr.ts (the system tesseract; "not run" when no engine is available)
 *   parse:   one listing per line: "<name> <address>" in the classified (business)
 *            section, or "<surname> <given> ... <occupation> [h|r] <address>" in the
 *            residents' section (residents are not businesses and are skipped)
 *   match:   the address against the parcels' assessor addresses
 *
 * A candidate is only placed when its address matches exactly one parcel, and
 * then at that parcel's middle (said so in its record) — never at an invented
 * point. Low OCR confidence, no match or several matches → review queue.
 * Every candidate stays unverified until a person accepts it.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAddress, sameAddress, type Address } from '../lib/address';
import type { OcrEngine, OcrLine } from './ocr';

export interface DirectoryManifest { id: string; title: string; year: number; source: string; license: string; pages: string[] }

export interface DirCandidate {
  id: string;
  directory: string;
  year: number;
  page: string;
  line: number;
  raw: string;
  ocrConf: number;
  heading?: string;
  name: string;
  address?: Address;
  /** The parcel the address matched (only when exactly one did). */
  parcelId?: string;
  matches: number;
  decision: 'candidate' | 'review';
  why: string;
}

const ADDR_RE = /\b(\d{1,5}(?:-\d{1,5})?)\s+((?:[NEWS]\.?\s+)?[A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)?\s+(?:av|ave|avenue|blvd|boul|rd|road|st|street|pl|dr|ter|boardwalk|bdwk)\b\.?)/i;
const HEADING_RE = /^[A-Z][A-Z &,.'-]{3,}$/;

/** Parses OCR lines of a classified-business section into name + address listings. */
export function parseListings(lines: OcrLine[]): { line: number; raw: string; conf: number; heading?: string; name: string; address?: Address }[] {
  const out: { line: number; raw: string; conf: number; heading?: string; name: string; address?: Address }[] = [];
  let heading: string | undefined;
  lines.forEach((l, i) => {
    const t = l.text.replace(/\s+/g, ' ').trim();
    if (!t) return;
    if (HEADING_RE.test(t) && !/\d/.test(t)) { heading = t; return; }
    // Residents' listings carry h (home) or r (resides) before the address: not businesses.
    if (/\b[hr]\s?\d{1,5}\b/.test(t) && !heading) return;
    const m = ADDR_RE.exec(t);
    const name = (m ? t.slice(0, m.index) : t).replace(/[.,;:\s]+$/, '').trim();
    if (!name) return;
    const address = m ? parseAddress(`${m[1]} ${m[2].replace(/\.$/, '')}`) : undefined;
    out.push({ line: i, raw: t, conf: l.conf, heading, name, address });
  });
  return out;
}

export function matchCandidates(dir: DirectoryManifest, page: string, listings: ReturnType<typeof parseListings>, parcels: { id: string; address: string | null }[], minConf = 80): DirCandidate[] {
  const parsedParcels = parcels.map((p) => ({ id: p.id, a: p.address ? parseAddress(p.address) : undefined }));
  return listings.map((l, k) => {
    const hits = l.address ? parsedParcels.filter((p) => p.a && sameAddress(l.address!, p.a)) : [];
    const base = { id: `dir:${dir.id}:${page}:${l.line}`, directory: dir.id, year: dir.year, page, line: l.line, raw: l.raw, ocrConf: l.conf, heading: l.heading, name: l.name, address: l.address, matches: hits.length };
    void k;
    if (!l.address) return { ...base, decision: 'review', why: 'no address read' } as DirCandidate;
    if (l.conf < minConf) return { ...base, decision: 'review', why: `OCR confidence ${l.conf} < ${minConf}` } as DirCandidate;
    if (hits.length === 0) return { ...base, decision: 'review', why: 'address matches no parcel (renumbered, demolished, or misread)' } as DirCandidate;
    if (hits.length > 1) return { ...base, decision: 'review', why: `address matches ${hits.length} parcels` } as DirCandidate;
    return { ...base, parcelId: hits[0].id, decision: 'candidate', why: 'address matches one parcel (still unverified)' } as DirCandidate;
  });
}

export interface DirectoryRun { status: 'not-run' | 'run'; detail: string; candidates: DirCandidate[] }

/** OCR every listed directory for a city. "not-run" when there are no pages or no engine. */
export function runDirectories(rawDir: string, engine: OcrEngine, parcels: { id: string; address: string | null }[]): DirectoryRun {
  const root = join(rawDir, 'directories');
  if (!existsSync(root)) return { status: 'not-run', detail: `no directory pages cached (expected under ${root}/<directory>/manifest.json)`, candidates: [] };
  const dirs = readdirSync(root).filter((d) => existsSync(join(root, d, 'manifest.json')));
  if (!dirs.length) return { status: 'not-run', detail: 'no directory manifests found', candidates: [] };
  if (!engine.available()) return { status: 'not-run', detail: `OCR engine ${engine.id} not available`, candidates: [] };
  const out: DirCandidate[] = [];
  for (const d of dirs) {
    const m = JSON.parse(readFileSync(join(root, d, 'manifest.json'), 'utf8')) as DirectoryManifest;
    for (const p of m.pages) {
      const r = engine.recognize(join(root, d, p));
      out.push(...matchCandidates(m, p, parseListings(r.lines), parcels));
    }
  }
  return { status: 'run', detail: `${dirs.length} directory(ies), ${out.length} listings`, candidates: out };
}
