/**
 * THE OWNER'S IMPORTED ART (artifact `assets` + `db` capabilities, runtime 0.2.90).
 *
 * Only the artifact's owner sees the Import button (`user.isOwner()`); the asset store itself only lets
 * Editors upload. Each import is an uploaded image plus one line in the shared `art/overrides`
 * document: `faces` (character id -> image url: his portrait) and `art` (a picture key -> url: that
 * picture everywhere it shows). Every viewer who can read the artifact's data gets the overrides at
 * load, so what the owner imports is what everyone sees. Outside claude.ai (dev, tests, offline) all of
 * this is absent and the game draws as before.
 */
type Snap = { exists: boolean; data(): Record<string, unknown> | undefined };
type DocRef = { get(): Promise<Snap>; set(d: Record<string, unknown>): Promise<void>; onSnapshot?: (next: (s: Snap) => void, err?: (e: unknown) => void) => () => void };
type Db = { collection(p: string): { doc(id: string): DocRef } };
type Assets = { upload(b: Blob, o?: { type?: string }): Promise<{ id: string; url: string }> };
type User = { isOwner(): Promise<boolean> };
type Host = { use?: (n: string) => Promise<unknown> };

export interface Overrides { faces: Record<string, string>; art: Record<string, string> }

let current: Overrides = { faces: {}, art: {} };
let version = 0;
const listeners = new Set<() => void>();

function host(): Host | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { claude?: Host }).claude : undefined;
}

function apply(o: Overrides): void {
  current = { faces: { ...(o.faces ?? {}) }, art: { ...(o.art ?? {}) } };
  // Picture keys go through the game's own override hook (assetUrls.ts assetUrl).
  if (typeof window !== 'undefined') window.__llvAssets = { ...(window.__llvAssets ?? {}), ...current.art };
  version++;
  for (const f of listeners) f();
}

export function faceOverride(charId: string): string | undefined { return current.faces[charId]; }
export function overrides(): Overrides { return current; }
export function subscribeArt(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }
export function artVersion(): number { return version; }

let dbP: Promise<Db | null> | undefined;
function db(): Promise<Db | null> {
  if (!dbP) {
    const h = host();
    dbP = h?.use ? (h.use('db').catch(() => null) as Promise<Db | null>) : Promise.resolve(null);
  }
  return dbP;
}
const ref = (d: Db) => d.collection('art').doc('overrides');

const read = (sn: Snap): Overrides => {
  const d = (sn.exists ? sn.data() : undefined) ?? {};
  return { faces: (d.faces as Record<string, string>) ?? {}, art: (d.art as Record<string, string>) ?? {} };
};

let started = false;
/** Load the overrides once and follow them (called at startup; never throws). */
export function startArt(): void {
  if (started) return;
  started = true;
  void db().then(async (d) => {
    if (!d) return;
    try {
      const r = ref(d);
      if (typeof r.onSnapshot === 'function') r.onSnapshot((sn) => apply(read(sn)), () => {});
      else apply(read(await r.get()));
    } catch { /* no art data: draw as before */ }
  });
}

/** Is this viewer the artifact's owner? (false anywhere else) */
export async function isOwnerHere(): Promise<boolean> {
  const h = host();
  if (!h?.use) return false;
  try { const u = (await h.use('user')) as User | null; return u ? await u.isOwner() : false; } catch { return false; }
}

/** Upload an image and point a person's portrait or a picture key at it. */
export async function importImage(file: Blob, target: { face: string } | { art: string }): Promise<{ ok: true } | { ok: false; why: string }> {
  const h = host();
  if (!h?.use) return { ok: false, why: 'Importing works only inside the published game on claude.ai.' };
  try {
    const [assets, d] = await Promise.all([h.use('assets').catch(() => null) as Promise<Assets | null>, db()]);
    if (!assets || !d) return { ok: false, why: 'Only the game\'s owner can import art.' };
    const up = await assets.upload(file, file.type ? { type: file.type } : undefined);
    const next: Overrides = { faces: { ...current.faces }, art: { ...current.art } };
    if ('face' in target) next.faces[target.face] = up.url; else next.art[target.art] = up.url;
    await ref(d).set(next as unknown as Record<string, unknown>);
    apply(next);
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return { ok: false, why: code === 'too_large' ? 'That file is too big (20 MB at most).' : code === 'unsupported_type' ? 'That kind of file can\'t be used: use a JPG, PNG or WebP picture.' : 'The import didn\'t go through. Try again.' };
  }
}

/** Remove one import (the picture goes back to the game's own). */
export async function removeImport(target: { face: string } | { art: string }): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  const next: Overrides = { faces: { ...current.faces }, art: { ...current.art } };
  if ('face' in target) delete next.faces[target.face]; else delete next.art[target.art];
  try { await ref(d).set(next as unknown as Record<string, unknown>); apply(next); if (typeof window !== 'undefined' && 'art' in target && window.__llvAssets) delete window.__llvAssets[target.art]; return true; } catch { return false; }
}
