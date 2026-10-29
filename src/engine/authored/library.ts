import type { Scene } from './format';
import { validateScenes } from './validate';

/**
 * THE SCENE LIBRARY: every /scenes/*.json file, read at build time (Vite's
 * import.meta.glob bundles them into the game), checked by the validator.
 * Outside Vite (a plain Node script) there are no files: the library is empty.
 */
let files: Record<string, unknown> = {};
try {
  files = import.meta.glob('../../../scenes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
} catch {
  files = {};
}

const named: Record<string, unknown> = {};
for (const [k, v] of Object.entries(files)) named[k.replace(/^(\.\.\/)+/, '')] = v;

const checked = validateScenes(named);

/** The scenes that passed the validator. */
export const SCENES: Scene[] = checked.scenes;
export const SCENES_BY_ID: Record<string, Scene> = Object.fromEntries(SCENES.map((s) => [s.id, s]));
/** What the validator found wrong (empty when every scene is good). */
export const SCENE_ERRORS: string[] = checked.errors;
/** The files read, for tests. */
export const SCENE_FILES: string[] = Object.keys(named).sort();
