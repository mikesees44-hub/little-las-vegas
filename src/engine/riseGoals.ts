import { capos, crew } from './characters';
import { applyEffects } from './effects';
import type { Ctx } from './ledger';
import type { Effect, GameState } from './types';

/**
 * Rise to Power: the first rungs of the ladder, one at a time, so a young
 * boss always knows what to do next. Each goal pays a small reward when it
 * is met (named ledger lines) and goes in the chronicle.
 */
export interface RiseGoal {
  id: string;
  title: string;
  hint: string;
  done: (s: GameState) => boolean;
  reward: (s: GameState) => Effect[];
}

const held = (s: GameState, pct: number) => s.districts.filter((d) => (d.influence.player ?? 0) >= pct).length;

export const RISE_GOALS: RiseGoal[] = [
  {
    id: 'first_summer',
    title: 'Make the summer pay: $15,000 in the Family',
    hint: 'Everything comes in on its own every week; your cut goes to your Pocket. The numbers bank and the arcade do their best business before Labor Day: buy a front or two while the money is good.',
    done: (s) => s.money >= 15000,
    reward: () => [{ type: 'respect', amount: 4, label: 'Goal: a good first summer' }],
  },
  {
    id: 'second_racket',
    title: 'Open a third racket or front',
    hint: 'Rackets & Fronts: a bookmaking room or a luncheonette. More places, more envelopes.',
    done: (s) => s.businesses.filter((b) => b.owner === 'player').length >= 3,
    reward: () => [{ type: 'money', amount: 1500, label: 'Goal: a third racket (a loan you never have to pay back)' }],
  },
  {
    id: 'make_a_man',
    title: 'Get one of your guys made',
    hint: 'Propose an associate from his sheet; when Philadelphia opens the books, he takes the oath.',
    done: (s) => (s.crewStats?.makings ?? 0) >= 1,
    reward: () => [{ type: 'respect', amount: 5, label: 'Goal: your first made man' }],
  },
  {
    id: 'survive_winter',
    title: 'Get through the first winter in the black',
    hint: 'Sept–May the boardwalk is boarded up. Keep a cushion; watch the capos who pay late.',
    done: (s) => s.date.y >= 1961 && s.date.m >= 5 && s.date.m <= 9 && s.money > 0,
    reward: () => [{ type: 'respect', amount: 5, label: 'Goal: through the first winter' }, { type: 'favor', amount: 1, label: 'Goal: through the first winter' }],
  },
  {
    id: 'two_capos',
    title: 'Run two crews: a second capo in a district you hold',
    hint: 'Push into a district until you hold 40% of it; the best soldier steps up to run it.',
    done: (s) => capos(s).length >= 2 && held(s, 40) >= 2,
    reward: () => [{ type: 'respect', amount: 6, label: 'Goal: two crews' }],
  },
  {
    id: 'philly_notice',
    title: 'Get Philadelphia\'s notice: respect 40',
    hint: 'Pay the bagman on time, win your fights, keep your word.',
    done: (s) => s.respect >= 40,
    reward: () => [{ type: 'rivalOpinion', rival: 'philly', amount: 15, reason: 'The kid from Wildwood is somebody now', label: 'Goal: Philadelphia knows your name' }],
  },
  {
    id: 'a_dozen',
    title: 'A dozen men in the family',
    hint: 'Capos bring in associates; the crew events bring sons and cousins.',
    done: (s) => crew(s).length >= 12,
    reward: () => [{ type: 'respect', amount: 4, label: 'Goal: a dozen men' }],
  },
];

/** The goal you are working on now (Rise to Power only). */
export function currentRiseGoal(s: GameState): RiseGoal | undefined {
  if (!s.flags.start_rise) return undefined;
  return RISE_GOALS.find((g) => !s.flags[`rgoal_${g.id}`]);
}

export function riseGoalsDone(s: GameState): RiseGoal[] {
  return RISE_GOALS.filter((g) => !!s.flags[`rgoal_${g.id}`]);
}

/** Weekly: goals met (any order) pay out once. */
export function riseGoalsWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.flags.start_rise || s.gameOver) return;
  for (const g of RISE_GOALS) {
    if (s.flags[`rgoal_${g.id}`] || !g.done(s)) continue;
    s.flags[`rgoal_${g.id}`] = s.week;
    applyEffects(ctx, g.reward(s), { label: `Goal: ${g.title}`, because: `met a goal: ${g.title.toLowerCase()}` });
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A step up: ${g.title.charAt(0).toLowerCase()}${g.title.slice(1)}.`, kind: 'misc' });
    ctx.log.push(`Goal met: ${g.title}.`);
  }
}
