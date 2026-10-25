import { CHAINS as PACK1_CHAINS, EVENTS as PACK1_EVENTS, type ChainInfo, type Fx, type PackEvent } from './storyData';

/**
 * The registry of content packs. Every pack uses the same neutral schema
 * (storyDataSchema.ts). To add a pack: copy its sources into flat
 * src/engine/storyData<Name>*.ts files and add ONE entry below.
 *
 * Packs are merged into one event table. If a later pack reuses an event or
 * chain id, its ids are namespaced (`<pack>:<id>`) and its own followups are
 * rewritten to match, so packs never step on each other.
 *
 * Each pack carries a share of the random pool (`weight`) and a budget: at
 * most `budget` random-pool events from that pack in any 52 weeks. Chain parts
 * and dated history beats are never budgeted (they outrank the pool).
 */

export interface StoryPackDef {
  id: string;
  title: string;
  events: PackEvent[];
  chains: ChainInfo[];
  /** Multiplier on its events' weights in the random pool. */
  weight: number;
  /** Max random-pool events shown from this pack per 52 weeks. */
  budget: number;
}

export const STORY_PACKS: StoryPackDef[] = [
  { id: 'pack1', title: 'Little Las Vegas: Event Content Pack', events: PACK1_EVENTS, chains: PACK1_CHAINS, weight: 1, budget: 14 },
];

function rewriteFx(fx: Fx, rename: Map<string, string>): Fx {
  return fx.k === 'followup' && rename.has(fx.event) ? { ...fx, event: rename.get(fx.event)! } : fx;
}

/** Merge every registered pack (namespacing ids that collide). */
export function mergePacks(packs: readonly StoryPackDef[]): { events: PackEvent[]; chains: ChainInfo[]; packOf: Record<string, string> } {
  const events: PackEvent[] = [];
  const chains: ChainInfo[] = [];
  const packOf: Record<string, string> = {};
  const taken = new Set<string>();
  const takenChains = new Set<string>();
  for (const p of packs) {
    const clash = p.events.some((e) => taken.has(e.id)) || p.chains.some((c) => takenChains.has(c.id));
    const rename = new Map<string, string>();
    const chainRename = new Map<string, string>();
    if (clash) {
      for (const e of p.events) rename.set(e.id, `${p.id}:${e.id}`);
      for (const c of p.chains) chainRename.set(c.id, `${p.id}:${c.id}`);
    }
    for (const e of p.events) {
      const id = rename.get(e.id) ?? e.id;
      const ev: PackEvent = clash
        ? {
            ...e,
            id,
            chain: e.chain ? { ...e.chain, id: chainRename.get(e.chain.id) ?? e.chain.id } : undefined,
            immediate: e.immediate?.map((fx) => rewriteFx(fx, rename)),
            options: e.options.map((o) => ({ ...o, effects: o.effects.map((fx) => rewriteFx(fx, rename)) })),
          }
        : e;
      events.push(ev);
      taken.add(id);
      packOf[id] = p.id;
    }
    for (const c of p.chains) {
      const id = chainRename.get(c.id) ?? c.id;
      chains.push(clash ? { ...c, id, events: c.events.map((x) => rename.get(x) ?? x) } : c);
      takenChains.add(id);
    }
  }
  return { events, chains, packOf };
}

const MERGED = mergePacks(STORY_PACKS);
export const ALL_EVENTS: PackEvent[] = MERGED.events;
export const ALL_CHAINS: ChainInfo[] = MERGED.chains;
export const ALL_BY_ID: Record<string, PackEvent> = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));
/** Event id -> the pack it came from. */
export const PACK_OF: Record<string, string> = MERGED.packOf;
export const PACK_DEFS: Record<string, StoryPackDef> = Object.fromEntries(STORY_PACKS.map((p) => [p.id, p]));
