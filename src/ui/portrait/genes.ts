import type { Character, Trait } from '../../engine/types';

/**
 * Portrait genetics. Every character has "founder" genes hashed from the game
 * seed and his id; a character with known parents expresses, locus by locus,
 * the founder genes of his father or his mother (with the odd mutation), so
 * children share their parents' jaws, noses and hair. Genes are plain 0..1
 * numbers, independent of ethnicity; the painter maps them to colours.
 */

export function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export const LOCI = [
  'skin', 'hair', 'faceLen', 'jaw', 'cheek', 'chin', 'nose', 'noseSize', 'eyes', 'eyeColor',
  'brow', 'ears', 'lips', 'wave', 'bald', 'grey', 'freckle', 'heavy',
] as const;
export type Locus = (typeof LOCI)[number];
export type Genes = Record<Locus, number>;

/** Loci that blend (average of both parents) instead of coming from one side. */
const BLEND: ReadonlySet<Locus> = new Set<Locus>(['skin', 'faceLen', 'cheek']);
/** Loci passed mostly down the father's side. */
const PATERNAL: ReadonlySet<Locus> = new Set<Locus>(['bald']);

const founderCache = new Map<string, Genes>();

/**
 * Chosen faces (the character creator): a character with an `appearance`
 * expresses these genes, and passes them to his children like founder genes.
 */
const overrides = new Map<string, Partial<Genes>>();

export function setGeneOverride(seed: string, id: string, genes: Partial<Genes> | undefined): void {
  const key = `${seed}\u0000${id}`;
  if (genes && Object.keys(genes).length) overrides.set(key, genes);
  else overrides.delete(key);
}

/** Register every chosen face in a game (call when a game is loaded or created). */
export function registerAppearances(seed: string, chars: Record<string, Pick<Character, 'id' | 'appearance'>>): void {
  for (const c of Object.values(chars)) if (c.appearance?.genes) setGeneOverride(seed, c.id, c.appearance.genes as Partial<Genes>);
}

function withOverride(seed: string, id: string, g: Genes): Genes {
  const o = overrides.get(`${seed}\u0000${id}`);
  return o ? { ...g, ...o } : g;
}

export function founderGenes(seed: string, id: string): Genes {
  const key = `${seed}\u0000${id}`;
  const hit = founderCache.get(key);
  if (hit) return withOverride(seed, id, hit);
  const r = rng(hash(`${seed}:genes:${id}`));
  const g = {} as Genes;
  for (const l of LOCI) g[l] = r();
  if (founderCache.size > 4000) founderCache.clear();
  founderCache.set(key, g);
  return withOverride(seed, id, g);
}

/**
 * A child's genes come from the REAL biological parents: when paternity is
 * hidden (`bioFatherId`), the child looks like the man who fathered him, not
 * the man whose name he carries.
 */
export function genesOf(seed: string, c: Pick<Character, 'id' | 'fatherId' | 'motherId' | 'bioFatherId' | 'appearance'>): Genes {
  const own = founderGenes(seed, c.id);
  if (c.appearance?.genes) return { ...own, ...(c.appearance.genes as Partial<Genes>) };
  const dad = c.bioFatherId ?? c.fatherId;
  if (!dad && !c.motherId) return own;
  const f = dad ? founderGenes(seed, dad) : own;
  const m = c.motherId ? founderGenes(seed, c.motherId) : own;
  const r = rng(hash(`${seed}:inherit:${c.id}`));
  const g = {} as Genes;
  for (const l of LOCI) {
    const roll = r();
    const mut = r();
    if (mut < 0.08) g[l] = own[l];
    else if (BLEND.has(l)) g[l] = (f[l] + m[l]) / 2 + (own[l] - 0.5) * 0.15;
    else if (PATERNAL.has(l)) g[l] = roll < 0.75 ? f[l] : m[l];
    else g[l] = roll < 0.5 ? f[l] : m[l];
    g[l] = Math.min(0.999, Math.max(0, g[l]));
  }
  return g;
}

export type Expression = 'neutral' | 'scowl' | 'smirk' | 'warm' | 'wary' | 'stern';

const MOOD: Partial<Record<Trait, Expression>> = {
  'Hot-headed': 'scowl',
  Cruel: 'stern',
  Vengeful: 'scowl',
  Paranoid: 'wary',
  Cowardly: 'wary',
  Charming: 'smirk',
  Womanizer: 'smirk',
  Gambler: 'smirk',
  Greedy: 'smirk',
  Honest: 'warm',
  'Loyal-to-a-fault': 'warm',
  Pious: 'neutral',
  Patient: 'neutral',
};

export function expressionOf(c: Pick<Character, 'traits'>, age: number): Expression {
  for (const t of c.traits ?? []) {
    const e = MOOD[t];
    if (e) return age < 12 && (e === 'stern' || e === 'scowl') ? 'neutral' : e;
  }
  return age < 12 ? 'warm' : 'neutral';
}
