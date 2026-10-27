import { addOpinion } from './relations';
import { crew, isFree } from './characters';
import { hashSeed, rand } from './rng';
import { director } from './storyDirector';
import type { GameState, RivalId } from './types';

/**
 * FRESH OPENINGS: a new game should not replay the last one's first season.
 *
 * At the first week of a game the director deals an OPENING: which rival
 * leans on you first (a small push to his opinion of you), which crew drama
 * is already simmering (two named men with bad blood between them), and three
 * opening beats, procedural storylets that arrive in weeks 2-4, 5-8 and
 * 9-12. With the opening scene's own variants (sceneFamilies2.ts), the first
 * dozen weeks differ from game to game even before the dice of the
 * simulation diverge.
 */

export interface OpeningPlan {
  id: string;
  /** [week, storylet situation id]: due once, at or after that week. */
  beats: [number, string][];
  /** The rival who moves first (storylets prefer him in the opening weeks). */
  rival?: RivalId;
  /** Two of your men with bad blood from before the game began. */
  feud?: [string, string];
}

interface OpeningDef {
  id: string;
  rival?: RivalId;
  /** Rival opinion of the boss at the start (negative: he leans on you first). */
  push?: number;
  feud?: boolean;
  beats: string[];
}

const OPENINGS: OpeningDef[] = [
  { id: 'manno_pressure', rival: 'manno', push: -12, beats: ['rival_biz', 'dinner', 'hijack'] },
  { id: 'kessler_line', rival: 'kessler', push: -12, beats: ['drunk', 'rival_biz', 'weather'] },
  { id: 'bad_blood', feud: true, beats: ['feud', 'associate', 'old_young'] },
  { id: 'new_law', beats: ['new_cop', 'reelect', 'union'] },
  { id: 'philly_watching', rival: 'philly', push: -6, beats: ['vacationer', 'books', 'hijack'] },
  { id: 'new_york_money', rival: 'feldstein', push: 10, beats: ['tourist', 'rival_biz', 'union'] },
  { id: 'old_ways', feud: true, beats: ['old_timer', 'old_young', 'feud'] },
  { id: 'summer_storm', rival: 'manno', push: -6, beats: ['weather', 'tourist', 'drunk'] },
  { id: 'young_turks', rival: 'kessler', push: -6, feud: true, beats: ['old_young', 'drunk', 'books'] },
  { id: 'town_hall', rival: 'feldstein', push: 6, beats: ['reelect', 'new_cop', 'rival_biz'] },
];

/** Deal this game's opening (once, at the first week). */
export function ensureOpening(s: GameState): OpeningPlan {
  const d = director(s);
  if (d.opening) return d.opening;
  const h = { rng: hashSeed(`${s.seed}:opening`) };
  const def = OPENINGS[Math.floor(rand(h) * OPENINGS.length)];
  const w1 = 2 + Math.floor(rand(h) * 3);
  const w2 = 5 + Math.floor(rand(h) * 3);
  const w3 = 9 + Math.floor(rand(h) * 3);
  const plan: OpeningPlan = { id: def.id, beats: [[w1, def.beats[0]], [w2, def.beats[1]], [w3, def.beats[2]]], rival: def.rival };
  if (def.rival && def.push) {
    const r = s.rivals.find((x) => x.id === def.rival);
    if (r && s.characters[r.leaderId]) addOpinion(s, r.leaderId, s.playerId, def.push < 0 ? 'Wants to see what the new man is made of' : 'Sees an opportunity in the new man', def.push, 1);
  }
  if (def.feud) {
    const men = crew(s).filter((c) => isFree(s, c) && c.id !== s.playerId && (c.rank === 'capo' || c.rank === 'soldier'));
    if (men.length >= 2) {
      const a = men[Math.floor(rand(h) * men.length)];
      const rest = men.filter((x) => x.id !== a.id);
      const b = rest[Math.floor(rand(h) * rest.length)];
      addOpinion(s, a.id, b.id, 'An old quarrel over a corner', -25, 0);
      addOpinion(s, b.id, a.id, 'An old quarrel over a corner', -20, 0);
      plan.feud = [a.id, b.id];
    }
  }
  d.opening = plan;
  return plan;
}

/** The opening beat due this week, if any (marked as used). */
export function dueBeat(s: GameState): string | undefined {
  const p = s.director?.opening;
  if (!p) return undefined;
  // A beat crowded out of a busy week waits (it is let go when it reaches the boss,
  // via markLetShown); one that cannot reach him for BEAT_GRACE weeks is let go.
  if (p.beats.some(([w]) => s.week - w > BEAT_GRACE)) p.beats = p.beats.filter(([w]) => s.week - w <= BEAT_GRACE);
  return p.beats.find(([w]) => s.week >= w)?.[1];
}

/** Let an opening beat go (it reached the boss, or it cannot be told). */
export function dropBeat(s: GameState, id: string): void {
  const p = s.director?.opening;
  const i = p ? p.beats.findIndex(([, b]) => b === id) : -1;
  if (i >= 0) p!.beats.splice(i, 1);
}

/** How many weeks an opening beat may wait for room on the boss's desk. */
export const BEAT_GRACE = 4;

/** The rival who moves first, while the opening lasts. */
export function openingRival(s: GameState): RivalId | undefined {
  return s.week <= 14 ? s.director?.opening?.rival : undefined;
}

/** The opening's bad blood (two men), while it lasts. */
export function openingFeud(s: GameState): [string, string] | undefined {
  const f = s.week <= 14 ? s.director?.opening?.feud : undefined;
  return f && f.every((id) => s.characters[id]?.alive && s.characters[id].faction === 'player') ? f : undefined;
}

export const OPENING_IDS = OPENINGS.map((o) => o.id);
