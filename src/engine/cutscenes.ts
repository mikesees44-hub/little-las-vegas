import { displayName } from './characters';
import type { CutsceneCue, GameState } from './types';

/**
 * Cutscenes: the moments that get a full-screen card. The engine raises some
 * cues directly (s.cutscenes: hits, sit-downs, betrayals, war); the rest are
 * read off what changed between two states (deaths, successions, weddings,
 * a man being made, the boss in cuffs), so no system has to know about them.
 */
export const CUTSCENE_KEYS = [
  'hit_success', 'hit_botched', 'hit_witness', 'funeral', 'wedding', 'sitdown', 'succession',
  'boss_death', 'heir_rises', 'arrest_interrogation', 'betrayal_confrontation', 'made_man',
  /** EXTRA! the week's violence on the front page (paper.ts extraToday); a seasonal set-piece (setPieces.ts). */
  'extra', 'set_piece',
] as const;
export type CutsceneKey = (typeof CUTSCENE_KEYS)[number];

export const MAX_CUTSCENES = 3;

export function cutscenesBetween(prev: GameState, next: GameState): CutsceneCue[] {
  const out: CutsceneCue[] = [];
  const add = (key: CutsceneKey, title: string, text: string) => {
    if (!out.some((c) => c.key === key)) out.push({ key, title, text, week: next.week - 1 });
  };
  const oldBoss = prev.characters[prev.playerId];
  const newBoss = next.characters[next.playerId];

  // The chair changes hands.
  if (prev.playerId !== next.playerId && newBoss) {
    const dead = oldBoss && !next.characters[oldBoss.id]?.alive;
    if (dead) add('boss_death', `${oldBoss.firstName} ${oldBoss.lastName}`, `${displayName(oldBoss)} is gone. The house of ${next.houseName} holds its breath.`);
    const child = oldBoss?.childrenIds.includes(newBoss.id);
    add(child ? 'heir_rises' : 'succession', child ? 'The heir' : 'The new boss', `${displayName(newBoss)} sits in the chair now. Everybody kisses the ring and watches his hands.`);
  }

  // Funerals for the family, and for the boss's men.
  for (const id of Object.keys(next.characters)) {
    const a = prev.characters[id];
    const b = next.characters[id];
    if (!a || !b) continue;
    if (a.alive && !b.alive && (b.dynasty || b.faction === 'player') && id !== oldBoss?.id) {
      add('funeral', 'The funeral', `They buried ${displayName(b)} at Cold Spring. The flowers came from people who never knew him.`);
    }
    if (a.alive && b.alive && b.faction === 'player' && a.rank === 'associate' && b.rank === 'soldier') {
      add('made_man', 'Made', `A pricked finger, a burning saint. ${displayName(b)} is a made man now.`);
    }
    // The crew: a man turns state's witness, or walks over to a rival family.
    if (a.alive && b.alive && a.faction === 'player' && id !== next.playerId && a.rank !== 'civilian') {
      if (b.faction === 'law') add('betrayal_confrontation', 'A rat', `${displayName(b)} is in a motel in Trenton with two FBI men and a tape recorder. Everything he knows, they know.`);
      else if (b.faction !== 'player' && b.faction !== 'none' && (a.rank === 'capo' || a.rank === 'underboss')) add('betrayal_confrontation', 'Gone over', `${displayName(b)} took his crew and walked over to ${next.rivals.find((r) => r.id === b.faction)?.name ?? 'the other side'}. Nobody saw it coming except everybody.`);
    }
    // One of your made men in cuffs.
    if (a.alive && b.alive && b.faction === 'player' && id !== next.playerId && b.rank !== 'associate' && b.rank !== 'civilian' && (b.imprisonedUntil ?? 0) > next.week && (a.imprisonedUntil ?? 0) <= prev.week) {
      add('arrest_interrogation', 'Pinched', `A bare bulb at the Wildwood station house. They ask ${b.firstName} about you. ${b.firstName} asks for a lawyer.`);
    }
    // A wedding in the crew that the boss sat at the head table for.
    if (a.alive && b.alive && b.faction === 'player' && !a.household?.wife && b.household?.wife && (b.story?.length ?? 0) > (a.story?.length ?? 0) && b.story?.[b.story.length - 1]?.text.startsWith('Married') && b.story[b.story.length - 1].text.includes('head table')) {
      add('wedding', 'A wedding in the crew', `${b.firstName} married ${b.household.wife} at Notre Dame de la Mer. Envelopes on the head table, and the boss danced with the bride.`);
    }
    if (a.alive && b.alive && !a.spouseId && b.spouseId && b.dynasty) {
      const sp = next.characters[b.spouseId];
      add('wedding', 'The wedding', `${b.firstName} married ${sp ? `${sp.firstName} ${sp.lastName}` : 'into a good family'}. Envelopes, a band from Philly, and nobody talked business — out loud.`);
    }
  }

  // The boss in cuffs.
  if (newBoss && oldBoss?.id === newBoss.id && (newBoss.imprisonedUntil ?? 0) > next.week && (oldBoss.imprisonedUntil ?? 0) <= prev.week) {
    add('arrest_interrogation', 'Downtown', `A bare bulb and a tin ashtray. ${newBoss.firstName} says nothing, twice.`);
  }

  // Cues the engine raised this week come first.
  const fromEngine = next.cutscenes.filter((c) => !out.some((o) => o.key === c.key));
  return [...fromEngine, ...out].slice(0, MAX_CUTSCENES);
}
