/**
 * Polite, cached HTTP for dev-time imports (never run when a player opens the game).
 *
 *  - Cache first: a response already on disk is never requested again (delete the
 *    file, or pass `refresh`, to re-download).
 *  - `offline`: cache only; a missing file is reported as unreachable, not fetched.
 *  - One request at a time per host, at least `minIntervalMs` apart.
 *  - Retries with exponential backoff (and `Retry-After`) on 429, 5xx and network
 *    errors, up to `maxRetries`; 4xx other than 429 is final.
 *  - A source that cannot be reached raises `SourceUnreachable` with what happened;
 *    callers turn it into a report line. Nothing is ever substituted for the data.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** OSM and NJGIN ask for an identifying User-Agent; set CITYIMPORT_CONTACT to add a contact (an email or URL). */
export const USER_AGENT = `LittleLasVegas-cityimport/0.1 (dev-time importer${process.env.CITYIMPORT_CONTACT ? `; ${process.env.CITYIMPORT_CONTACT}` : ''})`;

export class SourceUnreachable extends Error {
  constructor(public sourceId: string, public url: string, public detail: string, public status?: number) {
    super(`${sourceId}: source unreachable (${detail}) ${url}`);
  }
}

export interface FetchOpts {
  sourceId: string;
  url: string;
  /** Where the raw response is cached. */
  cacheFile: string;
  offline?: boolean;
  refresh?: boolean;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  minIntervalMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  /** For tests: the fetch implementation. */
  fetchImpl?: typeof fetch;
  /** For tests: the sleep implementation. */
  sleep?: (ms: number) => Promise<void>;
}

export interface FetchResult { body: Buffer; fromCache: boolean; file: string; sha256: string; attempts: number }

const lastByHost = new Map<string, number>();
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

export async function fetchCached(o: FetchOpts): Promise<FetchResult> {
  if (!o.refresh && existsSync(o.cacheFile)) {
    const body = readFileSync(o.cacheFile);
    return { body, fromCache: true, file: o.cacheFile, sha256: sha256(body), attempts: 0 };
  }
  if (o.offline) throw new SourceUnreachable(o.sourceId, o.url, 'offline mode and not in the cache');
  const f = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? realSleep;
  const host = new URL(o.url).host;
  const minGap = o.minIntervalMs ?? 1500;
  const maxRetries = o.maxRetries ?? 4;
  let lastErr = '';
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const since = Date.now() - (lastByHost.get(host) ?? 0);
    if (since < minGap) await sleep(minGap - since);
    lastByHost.set(host, Date.now());
    let retryAfter = 0;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), o.timeoutMs ?? 120_000);
      const res = await f(o.url, { method: o.method ?? 'GET', body: o.body, headers: { 'User-Agent': USER_AGENT, ...o.headers }, signal: ctl.signal });
      clearTimeout(t);
      if (res.ok) {
        const body = Buffer.from(await res.arrayBuffer());
        mkdirSync(dirname(o.cacheFile), { recursive: true });
        writeFileSync(o.cacheFile, body);
        return { body, fromCache: false, file: o.cacheFile, sha256: sha256(body), attempts: attempt };
      }
      lastStatus = res.status;
      lastErr = `HTTP ${res.status} ${res.statusText}`.trim();
      if (res.status !== 429 && res.status < 500) break; // final (403 from a proxy or the service, 404, 400)
      const ra = Number(res.headers.get('retry-after'));
      if (Number.isFinite(ra) && ra > 0) retryAfter = ra * 1000;
    } catch (e) {
      lastErr = e instanceof Error ? `${e.name}: ${e.message}${(e as { cause?: { code?: string } }).cause?.code ? ` (${(e as { cause?: { code?: string } }).cause!.code})` : ''}` : String(e);
    }
    if (attempt <= maxRetries) await sleep(Math.max(retryAfter, Math.min(60_000, 1000 * 2 ** attempt)));
  }
  throw new SourceUnreachable(o.sourceId, o.url, lastErr || 'unknown error', lastStatus);
}

/** A report line for one source, as printed and stored in sources-and-attribution.json. */
export interface SourceStatus {
  sourceId: string;
  status: 'downloaded' | 'cached' | 'unreachable' | 'not-implemented' | 'skipped';
  detail: string;
  url?: string;
  files?: string[];
}

export function printReport(lines: SourceStatus[]): void {
  for (const l of lines) {
    const tag = l.status === 'unreachable' ? 'SOURCE UNREACHABLE' : l.status.toUpperCase();
    console.log(`[${tag}] ${l.sourceId}: ${l.detail}${l.url ? `\n    ${l.url}` : ''}`);
  }
}
