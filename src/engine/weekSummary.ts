import { displayName } from './characters';
import { grewSince } from './crewXp';
import type { Character, GameState, WeeklyReport } from './types';

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

export interface HandledLine {
  /** Who handled it ("Sal (underboss)", "Your capos", "The house"). */
  who: string;
  byId?: string;
  text: string;
  tone: 'good' | 'bad' | 'plain';
  /** Where it came from (each source appears once per item). */
  src: 'lt' | 'quiet' | 'morning' | 'reaction';
}

export interface WeekBrief {
  /** Three lines: money in, money out, what changed. */
  lines: string[];
  handled: HandledLine[];
  grew: { lines: GrowthLine[]; more: number };
}

const fmt = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

/**
 * The week in brief, read off the week's reports and the state after them (pure):
 * money in and out and what changed; everything handled for the boss (each
 * lieutenant log entry of these weeks, each quiet item, the capos' mornings)
 * exactly once; and how his people grew.
 */
export function weekBrief(s: GameState, reports: readonly WeeklyReport[]): WeekBrief {
  if (!reports.length) return { lines: [], handled: [], grew: { lines: [], more: 0 } };
  const first = reports[0];
  const last = reports[reports.length - 1];
  const weeks = new Set(reports.map((r) => r.week));
  const money = reports.flatMap((r) => r.lines.filter((l) => l.stat === 'money'));
  const inn = money.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const out = money.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
  const top = (xs: typeof money, sign: 1 | -1) => [...xs].filter((l) => l.amount * sign > 0).sort((a, b) => b.amount * sign - a.amount * sign)[0];
  const ti = top(money, 1);
  const to = top(money, -1);
  const lines = [
    `Money in: ${fmt(inn)}${ti ? ` (most from ${ti.label.toLowerCase()})` : ''}.`,
    `Money out: ${fmt(out)}${to ? ` (most to ${to.label.toLowerCase()})` : ''}.`,
  ];
  const changed: string[] = [];
  const dr = last.end.respect - first.start.respect;
  if (dr) changed.push(`respect ${dr > 0 ? '+' : ''}${dr}`);
  for (const h of ['local', 'family', 'federal'] as const) {
    const d = last.end.heat[h] - first.start.heat[h];
    if (Math.abs(d) >= 2) changed.push(`${h} heat ${d > 0 ? '+' : ''}${d}`);
  }
  lines.push(changed.length ? `What changed: ${changed.join(', ')}.` : 'What changed: nothing the town noticed.');
  const handled: HandledLine[] = [];
  for (const e of s.briefing?.lt?.log ?? []) {
    if (!weeks.has(e.week)) continue;
    const c = s.characters[e.byId];
    handled.push({ who: c ? `${displayName(c)} (${e.seat})` : e.seat, byId: e.byId, text: e.text, tone: e.result === 'done' ? (e.good === false ? 'plain' : 'good') : e.result === 'failed' ? 'bad' : 'plain', src: 'lt' });
  }
  for (const r of reports) for (const t of r.motion ?? []) handled.push({ who: 'Your people', text: t, tone: 'plain', src: 'quiet' });
  for (const r of reports) for (const t of r.rounds ?? []) if (/own way|settled at the table|your capos/i.test(t)) handled.push({ who: 'Your capos', text: t, tone: 'plain', src: 'morning' });
  // How people took the boss's decisions (reactions/): the minor ones, and those held back by the window cap.
  for (const x of s.reactions?.log ?? []) {
    if (!weeks.has(x.w) && !weeks.has(x.w + 1)) continue;
    const c = s.characters[x.who];
    handled.push({ who: c ? displayName(c) : '?', byId: x.who, text: `${x.v > 0 ? '+' : '−'}${Math.abs(x.v)} “${x.why}” (${x.title.charAt(0).toLowerCase()}${x.title.slice(1)})`, tone: x.v > 0 ? 'good' : x.tone === 'furious' ? 'bad' : 'plain', src: 'reaction' });
  }
  return { lines, handled, grew: growthLines(s, first.week) };
}
