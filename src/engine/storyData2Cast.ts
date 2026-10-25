import type { RoleSpec, Spawn } from './storyDataSchema';

/**
 * Casting helpers for content pack 2 (copied from content-pack-2/content/cast.ts).
 * The pack tags `desc` with `[world:<id>]`, `[kin:<rel>]` or `[bond:lover]`.
 * In the engine copy the world tag becomes the adapter's `worldId` (the
 * population layer casts that person when present, else the `spawn` is
 * created), and the tags are kept out of the prose.
 */

/** A world-pack person. Officials go through the `official` pool, everyone else `town`. */
export function world(id: string, desc: string, spawn: Spawn, office?: string): RoleSpec {
  return office
    ? { desc, pool: 'official', office, worldId: id, spawn: { office, ...spawn } }
    : { desc, pool: 'town', worldId: id, spawn };
}

/** A relative outside the engine's Relation union (uncle, aunt, cousin, in-law ...): a townie of the family. */
export function kin(_rel: string, desc: string, spawn: Spawn): RoleSpec {
  return { desc, pool: 'town', spawn: { faction: 'none', ...spawn } };
}

/** A consenting adult romantic interest. */
export function lover(desc: string, spawn: Spawn): RoleSpec {
  return { desc, pool: 'town', spawn };
}
