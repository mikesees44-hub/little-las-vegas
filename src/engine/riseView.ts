import { capos, crew, displayName, isFree, player } from './characters';
import { focusOf, level, newestCrewPerk, progress, promotionCandidates, readyToBeMade, titleOf, tracked, xpWants } from './crewXp';
import { FOCI } from './lifestyle';
import { getRelation, opinion } from './relations';
import { RISE_GOALS } from './riseGoals';
import type { Character, GameState } from './types';

/**
 * THE RISE (pure): the family as an organization that grows. The org chart
 * with progression (capos front and center: their territory, its take and
 * trend, the threat, their mood, ambition and loyalty, the men they are
 * bringing up), the badges that matter (ready to be made, ready for a crew,
 * passed over), and the seven-rung ladder with what each rung opens.
 */

export type RiseBadgeKind = 'made' | 'crew' | 'passed';
export interface RiseBadge { kind: RiseBadgeKind; label: string; /** The verb it leads to (on his sheet: Crew). */ verb: string }

export interface RiseNode {
  id: string;
  name: string;
  rank: Character['rank'];
  lvl: number;
  title: string;
  frac: number;
  focus: { id: string; icon: string; name: string };
  perk?: string;
  /** A skill went up lately (the ▲). */
  ticked: boolean;
  badges: RiseBadge[];
  loyalty: number;
}

export interface CapoNode extends RiseNode {
  district?: { id: string; name: string };
  /** What his crew brought in last count, and the change on the one before. */
  take: number;
  trend: number;
  /** The biggest rival foothold in his district (influence ≥ 15). */
  threat?: { rival: string; influence: number };
  mood: string;
  ambition?: string;
  men: RiseNode[];
}

export interface RiseChart {
  boss: RiseNode;
  admin: RiseNode[];
  capos: CapoNode[];
  /** Men who report straight to the boss (no capo). */
  direct: RiseNode[];
}

const TICK_WEEKS = 5;

export function riseBadges(s: GameState, c: Character): RiseBadge[] {
  const out: RiseBadge[] = [];
  if (c.id === s.playerId) return out;
  if (readyToBeMade(s, c)) out.push({ kind: 'made', label: 'Ready to be made', verb: 'Propose him' });
  if (promotionCandidates(s).capo.some((x) => x.id === c.id)) out.push({ kind: 'crew', label: 'Ready for a crew', verb: 'Give him a crew' });
  if ((getRelation(s, c.id, s.playerId)?.grievance ?? 0) >= 40) out.push({ kind: 'passed', label: 'Passed over', verb: 'Hear him out' });
  return out;
}

export function riseNode(s: GameState, c: Character): RiseNode {
  const p = progress(s, c);
  const f = FOCI[focusOf(s, c)];
  return {
    id: c.id, name: displayName(c), rank: c.rank, lvl: p.lvl, title: titleOf(s, c, p.lvl), frac: p.frac,
    focus: { id: f.id, icon: f.icon, name: f.name }, perk: c.id === s.playerId ? undefined : newestCrewPerk(s, c.id)?.name,
    ticked: (s.xp?.grew ?? []).some((g) => g.id === c.id && g.k === 'skill' && s.week - g.w < TICK_WEEKS),
    badges: riseBadges(s, c), loyalty: c.id === s.playerId ? 100 : Math.round(opinion(s, c.id, s.playerId)),
  };
}

function mood(v: number): string {
  return v >= 40 ? 'devoted' : v >= 15 ? 'content' : v >= -10 ? 'cool' : v >= -30 ? 'sore' : 'hostile';
}

const byLevel = (s: GameState) => (a: Character, b: Character) => level(s, b.id) - level(s, a.id) || a.id.localeCompare(b.id);

export function riseChart(s: GameState): RiseChart {
  const reps = s.tribute?.reports ?? [];
  const last = reps[reps.length - 1];
  const prev = reps[reps.length - 2];
  const men = crew(s).filter((c) => tracked(s, c));
  const ks = capos(s).filter((k) => isFree(s, k)).sort((a, b) => {
    const da = s.districts.findIndex((d) => d.capoId === a.id);
    const db = s.districts.findIndex((d) => d.capoId === b.id);
    return (da < 0 ? 99 : da) - (db < 0 ? 99 : db) || a.id.localeCompare(b.id);
  });
  const capoNodes: CapoNode[] = ks.map((k) => {
    const d = s.districts.find((x) => x.capoId === k.id);
    const take = Math.round(last?.crews.find((x) => x.capoId === k.id)?.remitted ?? 0);
    const before = Math.round(prev?.crews.find((x) => x.capoId === k.id)?.remitted ?? take);
    const rivals = d ? Object.entries(d.influence).filter(([r, v]) => r !== 'player' && s.rivals.some((x) => x.id === r) && (v ?? 0) >= 15).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) : [];
    const top = rivals[0];
    const want = xpWants(s, k).find((w) => !w.met)?.text;
    const node = riseNode(s, k);
    return {
      ...node,
      ...(d ? { district: { id: d.id, name: d.name } } : {}),
      take, trend: take - before,
      ...(top ? { threat: { rival: s.rivals.find((r) => r.id === top[0])?.shortName ?? top[0], influence: Math.round(top[1] ?? 0) } } : {}),
      mood: mood(node.loyalty),
      ...(want ? { ambition: want } : k.goal ? { ambition: k.goal.replace(/_/g, ' ') } : {}),
      men: men.filter((m) => m.capoId === k.id && m.id !== k.id).sort(byLevel(s)).map((m) => riseNode(s, m)),
    };
  });
  const capoIds = new Set(ks.map((k) => k.id));
  const admin = men.filter((c) => c.rank === 'underboss' || c.rank === 'consigliere').map((c) => riseNode(s, c));
  const direct = men.filter((c) => c.rank !== 'underboss' && c.rank !== 'consigliere' && c.rank !== 'capo' && !(c.capoId && capoIds.has(c.capoId))).sort(byLevel(s)).map((c) => riseNode(s, c));
  return { boss: riseNode(s, player(s)), admin, capos: capoNodes, direct };
}

/* ------------------------------------------------------------------ */
/* The ladder                                                          */
/* ------------------------------------------------------------------ */

export interface Rung {
  n: number;
  id: string;
  title: string;
  /** What reaching it means, in a line. */
  milestone: string;
  done: (s: GameState) => boolean;
  /** 0..1 toward it. */
  progress: (s: GameState) => number;
  /** The next concrete steps toward it. */
  steps: (s: GameState) => string[];
  /** What opens at this rung: homes ("rivals") or sections ("borgata.council"). */
  unlocks: string[];
  /** The same, in words. */
  opens: string;
}

const held = (s: GameState, pct: number) => s.districts.filter((d) => (d.influence.player ?? 0) >= pct).length;
const goal = (id: string) => RISE_GOALS.find((g) => g.id === id)!;
const met = (s: GameState, id: string) => !!s.flags[`rgoal_${id}`] || goal(id).done(s);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export const LADDER: Rung[] = [
  {
    n: 1, id: 'crew', title: 'A crew', milestone: 'Your own crew, and a summer that pays: $15,000 in the Family.', opens: 'The Desk, the Family, Money & Business, the Map',
    done: (s) => capos(s).length >= 1 || crew(s).length >= 3,
    progress: (s) => clamp(s.money / 15000), steps: (s) => (met(s, 'first_summer') ? [] : [goal('first_summer').title]),
    unlocks: ['desk', 'org', 'money', 'map'],
  },
  {
    n: 2, id: 'two_capos', title: 'Two crews', milestone: goal('two_capos').title, opens: 'Council & the chain of command; delegation presets; setting a man\'s focus',
    done: (s) => met(s, 'two_capos'), progress: (s) => clamp((Math.min(2, capos(s).length) + Math.min(2, held(s, 40))) / 4),
    steps: (s) => [capos(s).length < 2 ? 'Push a district to 40% and a soldier steps up to run it' : '', held(s, 40) < 2 ? 'Hold a second district (40%)' : ''].filter(Boolean),
    unlocks: ['borgata.council', 'borgata.chain'],
  },
  {
    n: 3, id: 'made', title: 'Made men', milestone: goal('make_a_man').title, opens: 'Getting made, standing orders',
    done: (s) => met(s, 'make_a_man'), progress: (s) => (met(s, 'make_a_man') ? 1 : crew(s).some((c) => readyToBeMade(s, c)) ? 0.6 : 0.2),
    steps: (s) => [crew(s).some((c) => readyToBeMade(s, c)) ? 'A man is ready to be made: propose him' : 'Bring an associate up to level 3', 'Wait for Philadelphia to open the books'],
    unlocks: ['borgata.membership', 'borgata.orders'],
  },
  {
    n: 4, id: 'borgata', title: 'A borgata', milestone: 'A dozen men, and Philadelphia\'s notice (respect 40).', opens: 'Rivals & the Law: the Table, intrigue',
    done: (s) => met(s, 'a_dozen') && met(s, 'philly_notice'), progress: (s) => clamp((Math.min(12, crew(s).length) / 12 + Math.min(40, s.respect) / 40) / 2),
    steps: (s) => [crew(s).length < 12 ? `${12 - crew(s).length} more men` : '', s.respect < 40 ? `Respect ${s.respect} of 40` : ''].filter(Boolean),
    unlocks: ['rivals', 'diplomacy.table', 'diplomacy.intrigue'],
  },
  {
    n: 5, id: 'table', title: 'A seat at the Table', milestone: 'Win a vote before the Table.', opens: 'The war room and the army',
    done: (s) => s.disputes.some((d) => d.ruling?.forPlayer), progress: (s) => (s.disputes.length ? 0.5 : 0.1),
    steps: () => ['Bring a dispute to the Table, talk the members round, win the vote'],
    unlocks: ['diplomacy.warroom', 'diplomacy.army'],
  },
  {
    n: 6, id: 'town', title: 'The town', milestone: 'A man in City Hall on your payroll, and three districts held.', opens: 'City Hall in full, patronage',
    done: (s) => Object.values(s.pol?.ctl ?? {}).some((c) => !!(c as { payroll?: unknown }).payroll) && held(s, 40) >= 3,
    progress: (s) => clamp((Math.min(3, held(s, 40)) / 3 + (Object.values(s.pol?.ctl ?? {}).some((c) => !!(c as { payroll?: unknown }).payroll) ? 1 : 0)) / 2),
    steps: (s) => [held(s, 40) < 3 ? `Hold ${3 - held(s, 40)} more district${3 - held(s, 40) === 1 ? '' : 's'}` : '', 'Put a councilman on the payroll'].filter(Boolean),
    unlocks: ['town.cityhall', 'town.patronage'],
  },
  {
    n: 7, id: 'license', title: 'The license', milestone: 'A casino license: the dream on the boardwalk.', opens: 'The endgame: who is strongest',
    done: (s) => (s.goals?.casinoStage ?? 0) >= 2, progress: (s) => clamp((s.goals?.casinoStage ?? 0) / 2),
    steps: () => ['Hold land in Atlantic City and a clean front man; wait for the voters'],
    unlocks: ['diplomacy.balance'],
  },
];

/**
 * The rung the organization itself stands on, read off the family as it is (not the milestones won in
 * play): a crew, two crews holding ground, made men, a borgata of a dozen with Philadelphia's notice, a
 * full administration with a seat at the Table, the town. A start records it once (`flags.rise_floor`):
 * the Old Don, ten years in the chair, does not begin on "Two crews".
 */
export function orgRung(s: GameState): number {
  const cs = crew(s);
  const ks = capos(s).length;
  const has = (r: string) => cs.some((c) => c.rank === r);
  const steps = [
    ks >= 1 || cs.length >= 3,
    ks >= 2 && held(s, 40) >= 2,
    has('soldier') || has('underboss'),
    cs.length >= 12 && s.respect >= 40,
    has('underboss') && has('consigliere') && ks >= 3 && s.respect >= 60,
    Object.values(s.pol?.ctl ?? {}).some((c) => !!(c as { payroll?: unknown }).payroll) && held(s, 40) >= 3,
  ];
  let n = 0;
  while (n < steps.length && steps[n]) n++;
  return Math.max(1, n);
}

/** A rung is done when it was won in play, or the family began above it. */
export function rungDone(s: GameState, r: Rung): boolean {
  return r.n <= (s.flags.rise_floor ?? 0) || r.done(s);
}

/** The rung the family stands on (the highest done in order) and the next one. */
export function currentRung(s: GameState): { at: Rung; next?: Rung } {
  let i = 0;
  while (i + 1 < LADDER.length && rungDone(s, LADDER[i + 1]) && rungDone(s, LADDER[i])) i++;
  if (!rungDone(s, LADDER[0])) return { at: LADDER[0], next: LADDER[1] };
  return { at: LADDER[i], next: LADDER[i + 1] };
}

/** How high the family has climbed (1..7). */
export function rungOf(s: GameState): number {
  return currentRung(s).at.n;
}

/** For the Desk's side column: the rung, progress to the next, its next steps. */
export function riseSummary(s: GameState): { rung: Rung; next?: Rung; progress: number; steps: string[]; ready: RiseNode[] } {
  const { at, next } = currentRung(s);
  const chart = riseChart(s);
  const all = [...chart.admin, ...chart.capos, ...chart.capos.flatMap((k) => k.men), ...chart.direct];
  return { rung: at, next, progress: next ? next.progress(s) : 1, steps: next ? next.steps(s).slice(0, 2) : [], ready: all.filter((n) => n.badges.some((b) => b.kind !== 'passed')).slice(0, 3) };
}

