/**
 * The raw-data manifest: one record per original file kept under
 * citydata/<city>/raw/, saying where it came from, under what licence, when it
 * was downloaded, by whom, and what it covers. Originals are never edited;
 * the build reads them and writes the city pack elsewhere.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { BBox4 } from '../config/cities';

export interface RawFile {
  /** Path relative to citydata/<city>/raw/. */
  file: string;
  sourceId: string;
  areaId: string;
  title: string;
  url: string;
  request?: Record<string, unknown>;
  license: string;
  attribution: string;
  /** ISO timestamp of the download. */
  downloadedAt: string;
  /** 'pipeline' = fetched by these scripts; 'browser-handoff' = downloaded by a person in a browser and copied in. */
  retrievedBy: 'pipeline' | 'browser-handoff';
  bytes: number;
  sha256: string;
  coverage: { bbox?: BBox4; note?: string };
  notes?: string[];
}

export interface RawManifest { city: string; updatedAt: string; files: RawFile[] }

export const repoRoot = (): string => join(dirname(new URL(import.meta.url).pathname), '..', '..', '..');
export const cityDir = (city: string, root = repoRoot()): string => join(root, 'citydata', city);
export const rawDir = (city: string, root = repoRoot()): string => join(cityDir(city, root), 'raw');

export function readManifest(city: string, root = repoRoot()): RawManifest {
  const f = join(rawDir(city, root), 'manifest.json');
  if (!existsSync(f)) return { city, updatedAt: new Date(0).toISOString(), files: [] };
  return JSON.parse(readFileSync(f, 'utf8')) as RawManifest;
}

export function writeManifest(m: RawManifest, root = repoRoot()): void {
  const f = join(rawDir(m.city, root), 'manifest.json');
  mkdirSync(dirname(f), { recursive: true });
  m.files.sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(f, `${JSON.stringify(m, null, 2)}\n`);
}

/** Adds or replaces a file's record (by path). */
export function upsertRaw(m: RawManifest, rec: RawFile): RawManifest {
  const files = m.files.filter((x) => x.file !== rec.file);
  files.push(rec);
  return { ...m, updatedAt: new Date().toISOString(), files };
}

export const relRaw = (city: string, abs: string, root = repoRoot()): string => relative(rawDir(city, root), abs);

export function findRaw(m: RawManifest, sourceId: string, areaId: string): RawFile[] {
  return m.files.filter((x) => x.sourceId === sourceId && x.areaId === areaId);
}
