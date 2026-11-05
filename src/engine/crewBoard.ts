import { isFree } from './characters';
import { purseOf } from './crewPurse';
import { earnerOf, earnerWeekly } from './earners';
import { eaters, hungerOf, loadOf, openJobs, ownScoreOdds, ownScoresOn } from './eat';
import { fmtMoney } from './effects';
import { earnIdeas } from './invest';
import type { Character, GameState, PlayerAction } from './types';

/**
 * WHO IS EARNING (the crew board): every man of the family on one line —
 * earning, working his own scores, needs a job, starving, overworked, away —
 * what he is on, what he has kicked up a week lately, and the one job to give
 * him (the consigliere's match, a place of his own, or "go find a score").
 * Pure: it reads, and every assignment is an existing order.
 */

export type BoardStatus = 'starving' | 'needs' | 'own' | 'earning' | 'over' | 'away';

export const STATUS_WORD: Record<BoardStatus, string> = {
  starving: 'Needs a job: starving', needs: 'Needs a job', own: 'Working his own scores', earning: 'Earning', over: 'Overworked', away: 'Away',
};

export interface BoardRow {
  c: Character;
  status: BoardStatus;
  on: string[];
  /** What he kicked up a week, on average, over his last four weeks. */
  upWeek: number;
  /** His last score of his own, if lately. */
  own?: { w: number; what: string; up: number };
  assign?: { label: string; action: PlayerAction; why: string };
}

const ORDER: BoardStatus[] = ['starving', 'needs', 'own', 'over', 'earning', 'away'];

export function crewBoard(s: GameState): { rows: BoardRow[]; count: Record<BoardStatus, number>; upWeek: number } {
  const men = eaters(s);
  const jobs = openJobs(s);
  const earn = new Map(earnIdeas(s).map((x) => [x.c.id, x]));
  const used = new Set<string>();
  const rows: BoardRow[] = men.map((c) => {
    const load = loadOf(s, c);
    const h = hungerOf(s, c, men);
    const purse = purseOf(s, c.id).slice(-4);
    const upWeek = purse.length ? Math.round(purse.reduce((a, p) => a + p.up, 0) / purse.length) : 0;
    const own = s.eat?.own?.[c.id];
    const recentOwn = own && s.week - own.w <= 4 ? own : undefined;
    const status: BoardStatus = !isFree(s, c) || (c.busyUntil ?? 0) > s.week && !load.length ? 'away'
      : h.word === 'overworked' ? 'over'
        : load.length ? 'earning'
          : recentOwn && recentOwn.up > 0 ? 'own'
            : h.word === 'starving' ? 'starving' : 'needs';
    return { c, status, on: load, upWeek, own: recentOwn, assign: undefined };
  });
  // One job per man, the neediest first: the consigliere's best match, a place of his own, or his own score.
  rows.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.upWeek - b.upWeek || (a.c.id < b.c.id ? -1 : 1));
  for (const r of rows) {
    if (r.status === 'away' || r.status === 'over') continue;
    const c = r.c;
    const job = jobs.map((j) => ({ j, p: j.picks.find((p) => p.id === c.id) })).filter((x) => x.p && !used.has(x.j.key)).sort((a, b) => b.p!.fit.score - a.p!.fit.score)[0];
    const e = earn.get(c.id);
    if (e && !earnerOf(s, c.id) && (r.status !== 'earning' || c.rank !== 'associate')) {
      r.assign = { label: `Give him ${e.b.name}`, action: e.action, why: `His own place: about ${fmtMoney(earnerWeekly(s, e.b))} a week, every week; he kicks up the rest.` };
    } else if (job && r.status !== 'earning') {
      used.add(job.j.key);
      r.assign = { label: job.j.title, action: job.p!.action, why: job.p!.fit.why };
    } else if (r.status !== 'earning' && c.rank !== 'capo') {
      const o = ownScoreOdds(s, c);
      r.assign = { label: 'Send him out for a score', action: { kind: 'mymen', op: { op: 'score', id: c.id } } as PlayerAction, why: `Something of his own this week, worth around ${fmtMoney(o.value)} (${Math.round(o.chance * 100)}%); half kicked up.` };
    }
  }
  const count = Object.fromEntries(ORDER.map((k) => [k, rows.filter((r) => r.status === k).length])) as Record<BoardStatus, number>;
  return { rows, count, upWeek: rows.reduce((a, r) => a + r.upWeek, 0) };
}

export { ownScoresOn };
