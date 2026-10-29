import { displayName } from './characters';
import { grewSince } from './crewXp';
import type { Character, GameState } from './types';

/**
 * THE WEEK IN BRIEF (pure): what the boss reads first when the week turns,
 * instead of deciding it. Growth: "Your people grew", at most a few lines,
 * ordered by rank, the rest folded as "+n more".
 */

const RANK_ORDER: Record<Character['rank'], number> = { boss: 0, underboss: 1, consigliere: 2, capo: 3, soldier: 4, associate: 5, civilian: 6 };

export interface GrowthLine { id: string; name: string; text: string }

/** "Your people grew" since a week: one line per man (his ticks and perks joined), by rank; at most `max`, plus how many more. */
export function growthLines(s: GameState, since: number, max = 5): { lines: GrowthLine[]; more: number } {
  const by = new Map<string, string[]>();
  for (const g of grewSince(s, since)) {
    const c = s.characters[g.id];
    if (!c?.alive) continue;
    const parts = by.get(g.id) ?? [];
    // Several ticks of one skill read as one ("+2 Force").
    const m = /^\+1 (\w+) \((\w+)\)$/.exec(g.t);
    const same = m ? parts.findIndex((p) => new RegExp(`^\\+\\d+ ${m[1]} `).test(p)) : -1;
    if (m && same >= 0) parts[same] = parts[same].replace(/^\+(\d+)/, (_x, n) => `+${Number(n) + 1}`);
    else parts.push(g.t);
    by.set(g.id, parts);
  }
  const rows = [...by.entries()].map(([id, parts]) => ({ c: s.characters[id], parts }))
    .sort((a, b) => RANK_ORDER[a.c.rank] - RANK_ORDER[b.c.rank] || a.c.id.localeCompare(b.c.id));
  const lines = rows.map((r) => ({ id: r.c.id, name: displayName(r.c), text: `${displayName(r.c)} ${r.parts.join('; ')}.` }));
  return { lines: lines.slice(0, max), more: Math.max(0, lines.length - max) };
}
