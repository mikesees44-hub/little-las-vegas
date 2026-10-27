import { ageOn } from './calendar';
import { AMBITIONS } from './characters';
import { ensureDynState, type GoalId } from './familyState';
import { GOAL_INFO as FAM_GOAL_INFO, goalFor, seedGoal } from './familyTraits';
import { isMade } from './hierarchy';
import type { Character, GameState, PersonalGoal } from './types';

/**
 * GOAL PREREQUISITES (A03). A goal is a wish about the future, so it must
 * still be open to the man who holds it: a made man has no bones left to
 * make, a capo is already running a crew, the boss already has the chair, a
 * grown man is past "grow up". The rules below say which goals are open;
 * `repairGoals` replaces the ones that a rank change, a start or an old save
 * left behind. It uses no dice: the same state always repairs the same way.
 */

/** Why a dynasty goal no longer fits this person (undefined: it fits). */
export function famGoalBlock(s: GameState, c: Character, g: GoalId): string | undefined {
  const age = ageOn(c.birth, s.date);
  switch (g) {
    case 'make_bones': return isMade(c) ? 'He is already made' : c.gender === 'F' ? 'Women are not made' : undefined;
    case 'the_chair': return c.id === s.playerId ? 'He already holds the chair' : undefined;
    case 'grow_up': return age >= 16 ? 'Already grown' : undefined;
    default: return undefined;
  }
}

/** Why a crew goal no longer fits this man (undefined: it fits). */
export function personalGoalBlock(s: GameState, c: Character, g: PersonalGoal): string | undefined {
  if (g === 'get_made') return isMade(c) ? 'He is already made' : undefined;
  if (g === 'become_capo') return c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' || c.rank === 'boss' ? 'He already runs men' : undefined;
  if (g === 'take_chair') return c.id === s.playerId ? 'He already holds the chair' : undefined;
  return undefined;
}

/** Ambition lines (free text) that a rank makes impossible. */
function ambitionBlocked(s: GameState, c: Character, text: string): boolean {
  if (/make his bones/i.test(text)) return isMade(c);
  if (/^become a capo$/i.test(text)) return c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' || c.rank === 'boss';
  if (/^take the chair$/i.test(text) || /sit in the chair/i.test(text)) return c.id === s.playerId;
  return false;
}

function stableIndex(id: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % n;
}

/**
 * Replace every goal or ambition that no longer fits. Returns how many changed.
 * Called by the weekly dynasty update (rank changes), after a start shapes the
 * family, and when a save is loaded.
 */
export function repairGoals(s: GameState): number {
  let n = 0;
  const d = s.dyn ? ensureDynState(s) : undefined;
  const heirId = s.designatedHeirId;
  for (const c of Object.values(s.characters)) {
    if (!c.alive) continue;
    const p = d?.people[c.id];
    if (p?.goal && famGoalBlock(s, c, p.goal)) {
      const isHeir = c.id === heirId;
      let g = p.path ? goalFor(s, c, p.path, isHeir) : seedGoal(s, c, isHeir);
      if (famGoalBlock(s, c, g)) g = 'protect_family';
      const old = FAM_GOAL_INFO[p.goal];
      p.goal = g;
      if (c.ambition === old) c.ambition = FAM_GOAL_INFO[g];
      n++;
    }
    if (c.goal && personalGoalBlock(s, c, c.goal)) {
      c.goal = c.goal === 'take_chair' ? undefined : c.goal === 'get_made' ? (c.attributes.leadership >= 55 ? 'become_capo' : 'get_rich') : 'get_rich';
      n++;
    }
    if (c.ambition && ambitionBlocked(s, c, c.ambition)) {
      const open = AMBITIONS.filter((a) => !ambitionBlocked(s, c, a));
      c.ambition = p?.goal ? FAM_GOAL_INFO[p.goal] : open[stableIndex(c.id, open.length)];
      n++;
    }
  }
  return n;
}
