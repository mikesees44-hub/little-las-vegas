/**
 * The artifact's `sample` capability (asks Claude from the page, on the
 * viewer's own account). Design for absence: outside claude.ai, in tests, or
 * when the viewer said no, there is no function and the talk falls back to
 * the scripted lines. Calls happen only on the player's "Say it" (never in a
 * loop or at load); consent is asked by the platform on the first call.
 */

export interface SampleFn {
  (input: unknown, options?: unknown): Promise<{ text: string }>;
  json: <T = unknown>(input: unknown, options?: unknown) => Promise<T>;
}

type ClaudeHost = { use?: (name: string) => Promise<unknown> };

let pending: Promise<SampleFn | null> | undefined;
let off = false;

/** Codes that mean "not in this view": hide the feature for the rest of it. */
const OFF = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

/** The sample function, or null (resolved once per page). Never throws. */
export function loadSample(): Promise<SampleFn | null> {
  if (off) return Promise.resolve(null);
  if (!pending) {
    const host = typeof window !== 'undefined' ? (window as unknown as { claude?: ClaudeHost }).claude : undefined;
    pending = host?.use
      ? Promise.resolve()
        .then(() => host.use!('sample'))
        .then((f) => (typeof f === 'function' && typeof (f as SampleFn).json === 'function' ? (f as SampleFn) : null))
        .catch(() => null)
      : Promise.resolve(null);
  }
  return pending;
}

/** The sample function if it has resolved within `ms` (else null: use the scripted lines this time). */
export function sampleWithin(ms: number): Promise<SampleFn | null> {
  return Promise.race([loadSample(), new Promise<null>((res) => setTimeout(() => res(null), ms))]);
}

export function sampleOff(): boolean {
  return off;
}

/** For tests: forget the resolved function. */
export function resetSample(): void {
  pending = undefined;
  off = false;
}

export type AskResult = { kind: 'ok'; data: unknown } | { kind: 'busy' } | { kind: 'off' } | { kind: 'fail'; code: string };

/** One JSON exchange on the quick tier, never cached (every turn is new). Classifies failures, never throws. */
export async function askJson(sample: SampleFn, messages: unknown, signal?: AbortSignal): Promise<AskResult> {
  try {
    const data = await sample.json(messages, { modelTier: 'quick', cache: false, ...(signal ? { signal } : {}) });
    return { kind: 'ok', data };
  } catch (e) {
    const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'upstream_error';
    if (code === 'rate_limited') return { kind: 'busy' };
    if (OFF.has(code)) { off = true; return { kind: 'off' }; }
    return { kind: 'fail', code };
  }
}
