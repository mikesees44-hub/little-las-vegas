import { displayName } from './characters';
import type { Ctx } from './ledger';
import { beat, between, clamp, hit, mgEffect, registerMinigame, usd, type MgOption, type MgSession, type MinigameDef } from './minigame';
import { HEISTS } from './schemes';
import type { Character, Effect, GameState, HeistKind, Scheme } from './types';

/**
 * THE HEIST: the plan, then a branching run-through with the crew you sent.
 * Three moments decide it (getting in, the take, getting away); each choice
 * is made with the men's real skills and shows its odds. Letting it play out
 * gives the same overall odds the scheme planner promised.
 */

export interface HeistData {
  kind: HeistKind;
  name: string;
  odds: number;
  /** Per-stage base odds (odds^(1/3)). */
  stage: number;
  agents: { id: string; name: string; first: string; specialty?: string; force: number; intrigue: number }[];
  plan?: 'quiet' | 'fast' | 'inside';
  /** Modifier from the plan for every stage. */
  planMod: number;
  step: number;
  greed: number;
  alarm: boolean;
  failed?: string;
  take?: number;
  busted?: string;
}

type HS = MgSession<HeistData>;

const STAGES = ['Getting in', 'The take', 'Getting away'];

function has(d: HeistData, sp: string) {
  return d.agents.find((a) => a.specialty === sp);
}

function stageOpts(d: HeistData): { id: string; label: string; detail: string; p: number; greed?: number }[] {
  const b = d.stage + d.planMod;
  const safe = has(d, 'safecracker');
  const wheel = has(d, 'wheelman');
  const muscle = [...d.agents].sort((a, b2) => b2.force - a.force)[0];
  const sly = [...d.agents].sort((a, b2) => b2.intrigue - a.intrigue)[0];
  switch (d.step) {
    case 0:
      return [
        { id: 'in_quiet', label: `${sly?.first ?? 'Somebody'} works the back door`, detail: 'Slow and quiet.', p: b + 0.06 + ((sly?.intrigue ?? 50) - 50) / 400 },
        { id: 'in_bold', label: `${muscle?.first ?? 'Somebody'} goes through the front`, detail: 'Fast. Loud if it goes wrong.', p: b - 0.04 + ((muscle?.force ?? 50) - 50) / 300 },
      ];
    case 1:
      return [
        { id: 'take_safe', label: safe ? `${safe.first} opens the safe` : 'Crack the safe yourselves', detail: 'The real money is in the safe.', p: b + (safe ? 0.12 : -0.12), greed: 1.25 },
        { id: 'take_drawers', label: 'Grab what is in the cases and go', detail: 'Less money, less time.', p: b + 0.1, greed: 0.7 },
        { id: 'take_all', label: 'Take everything', detail: 'All of it. Every minute inside is a minute the cops get closer.', p: b - 0.12, greed: 1.6 },
      ];
    default:
      return [
        { id: 'out_drive', label: wheel ? `${wheel.first} drives` : 'Whoever can drive, drives', detail: 'The Black Horse Pike, then the back roads.', p: b + (wheel ? 0.15 : -0.05) - (d.alarm ? 0.1 : 0) },
        { id: 'out_split', label: 'Split up, meet in Rio Grande', detail: 'Harder to follow. Harder to keep everyone quiet.', p: b + 0.04 - (d.alarm ? 0.05 : 0) },
      ];
  }
}

function opts(_s: GameState, ses: HS): MgOption[] {
  const d = ses.d;
  if (ses.phase === 'plan') {
    return [
      { id: 'plan_quiet', label: 'Plan it quiet: a weekend, no guns out', detail: '+5% every step; a smaller take.' },
      { id: 'plan_fast', label: 'In and out in four minutes', detail: 'Standard odds.' },
      { id: 'plan_inside', label: `An inside man (${usd(1500)})`, detail: '+10% every step.', cost: 1500 },
    ];
  }
  if (ses.phase === 'alarm') {
    return [
      { id: 'push', label: 'Push on', detail: 'Finish it. The alarm makes everything harder.', tone: 'risky' },
      { id: 'abort', label: 'Abort: everybody out, now', detail: 'No money. Probably nobody pinched.', tone: 'safe' },
    ];
  }
  return stageOpts(d).map((o) => ({ id: o.id, label: o.label, detail: o.detail, odds: clamp(o.p, 0.05, 0.97) }));
}

function step(s: GameState, ses: HS, move: string): void {
  const d = ses.d;
  if (ses.phase === 'plan') {
    d.plan = move === 'plan_quiet' ? 'quiet' : move === 'plan_inside' ? 'inside' : 'fast';
    d.planMod = d.plan === 'quiet' ? 0.05 : d.plan === 'inside' ? 0.1 : 0;
    if (d.plan === 'quiet') d.greed *= 0.85;
    beat(ses, d.plan === 'inside' ? 'A night watchman with a sick wife takes an envelope.' : d.plan === 'quiet' ? 'You pick a long weekend and leave the guns in the trunk.' : 'Four minutes. Everybody knows his job.', 'info');
    ses.phase = 'run';
    beat(ses, `${STAGES[0]}.`, 'info');
    return;
  }
  if (ses.phase === 'alarm') {
    if (move === 'abort') {
      d.failed = 'aborted';
      beat(ses, 'Everybody out. The car is already moving when the first siren starts.', 'info');
      return finish(s, ses);
    }
    d.alarm = true;
    ses.phase = 'run';
    beat(ses, 'You push on, with the bell ringing.', 'bad');
    return;
  }
  const o = stageOpts(d).find((x) => x.id === move) ?? stageOpts(d)[0];
  if (o.greed) d.greed *= o.greed;
  if (hit(ses, clamp(o.p, 0.05, 0.97))) {
    beat(ses, `${STAGES[d.step]}: clean.`, 'good');
  } else if (d.step < 2 && !d.alarm) {
    beat(ses, `${STAGES[d.step]}: an alarm bell starts ringing somewhere in the building.`, 'bad');
    d.step += 1;
    ses.phase = 'alarm';
    return;
  } else {
    d.failed = STAGES[d.step].toLowerCase();
    beat(ses, `${STAGES[d.step]}: it goes wrong.`, 'bad');
    return finish(s, ses);
  }
  d.step += 1;
  if (d.step >= 3) return finish(s, ses);
  beat(ses, `${STAGES[d.step]}.`, 'info');
}

function finish(_s: GameState, ses: HS): void {
  const d = ses.d;
  const h = HEISTS[d.kind];
  const label = `Heist: ${h.name}`;
  const fx: Effect[] = [];
  if (d.plan === 'inside') fx.push({ type: 'money', amount: -1500, label: `${label}: the inside man` });
  if (!d.failed) {
    const take = Math.round((between(ses, h.payout[0] / 100, h.payout[1] / 100) * 100 * d.greed) / 100) * 100;
    d.take = take;
    fx.push({ type: 'money', amount: take, label }, { type: 'unwashed', amount: take, label }, { type: 'heat', bar: h.heat, amount: h.heatAmt + (d.alarm ? 3 : 0), label }, { type: 'respect', amount: 2, label });
    ses.outcome = { title: label, text: `The job came off: ${usd(take)}.`, tone: 'good', effects: fx, headline: { paper: h.heat === 'federal' ? 'Philadelphia Bulletin' : 'Wildwood Leader', headline: d.kind === 'bank' ? 'BANDITS LOOT DELAWARE BANK; FBI JOINS HUNT' : d.kind === 'armored' ? 'ARMORED CAR PAYROLL TAKEN ON BLACK HORSE PIKE' : 'JEWELRY EXCHANGE CLEANED OUT AFTER HOURS', body: 'Police have no suspects.' } };
  } else if (d.failed === 'aborted') {
    fx.push({ type: 'heat', bar: h.heat, amount: Math.ceil(h.heatAmt / 2), label });
    ses.outcome = { title: label, text: 'Aborted. Nobody pinched, nothing taken.', tone: 'mixed', effects: fx };
  } else {
    fx.push({ type: 'heat', bar: h.heat, amount: h.heatAmt + 4, label });
    const caught = d.agents.length && hit(ses, d.step >= 2 ? 0.6 : 0.4) ? d.agents[Math.floor(ses.rng % d.agents.length)] : undefined;
    if (caught) {
      d.busted = caught.id;
      fx.push({ type: 'imprison', charId: caught.id, weeks: between(ses, 40, 100), label }, { type: 'evidence', charId: caught.id, amount: 15, label });
    }
    ses.outcome = { title: label, text: `The job went wrong at ${d.failed}${caught ? `; ${caught.name} was caught with the bag` : ''}.`, tone: 'bad', effects: fx, headline: caught ? { paper: 'Wildwood Leader', headline: `${caught.name.toUpperCase()} HELD IN ${d.kind === 'jewelry' ? 'JEWEL' : d.kind === 'bank' ? 'BANK' : 'PAYROLL'} JOB`, body: 'Police say others got away.' } : undefined };
  }
  ses.done = true;
  ses.phase = 'end';
}

/** Exact odds that the default play gets away clean (enumerating the one alarm). */
function autoOdds(d0: HeistData): number {
  const go = (stepN: number, alarm: boolean): number => {
    if (stepN >= 3) return 1;
    const d = { ...d0, step: stepN, alarm };
    const o = stageOpts(d);
    const pick = stepN === 1 ? o.find((x) => x.id === 'take_drawers')! : o[0];
    const p = clamp(pick.p, 0.05, 0.97);
    const fail = stepN < 2 && !alarm ? go(stepN + 1, true) : 0;
    return p * go(stepN + 1, alarm) + (1 - p) * fail;
  };
  return go(0, false);
}

function auto(_s: GameState, ses: HS): string {
  if (ses.phase === 'plan') return 'plan_fast';
  if (ses.phase === 'alarm') return 'push';
  const o = stageOpts(ses.d);
  // The default play is the middle road: the first option at the scheme's own odds.
  return ses.d.step === 1 ? 'take_drawers' : o[0].id;
}

export const HEIST: MinigameDef<HeistData> = {
  id: 'heist',
  init: (s, ses) => {
    const kind = String(ses.params.heist ?? 'jewelry') as HeistKind;
    const odds = clamp(Number(ses.params.odds ?? 0.5), 0.05, 0.95);
    const agents = String(ses.params.agents ?? '').split(',').map((id) => s.characters[id]).filter((c): c is Character => !!c).map((c) => ({ id: c.id, name: displayName(c), first: c.firstName, specialty: c.specialty, force: c.attributes.force, intrigue: c.attributes.intrigue }));
    const d: HeistData = { kind, name: HEISTS[kind].name, odds, stage: 0.5, agents, planMod: 0, step: 0, greed: 1, alarm: false };
    // Calibrated so the default play succeeds exactly as often as the scheme planner promised.
    let lo = -0.6;
    let hi = 1.2;
    for (let i = 0; i < 40; i++) {
      d.stage = (lo + hi) / 2;
      if (autoOdds(d) < odds) lo = d.stage;
      else hi = d.stage;
    }
    return { d, phase: 'plan', intro: { title: HEISTS[kind].name, kicker: 'The job', text: `${HEISTS[kind].text} ${agents.map((a) => a.first).join(', ').replace(/, ([^,]*)$/, ' and $1') || 'Your people'} are in the car. The planner gave it ${Math.round(odds * 100)}%. Now it's up to them, and to you.`, scene: 'vault' } };
  },
  options: opts,
  step,
  auto,
};
registerMinigame(HEIST);

/** Hook from schemes.ts: when a heist comes due, the job is played instead of rolled. */
export function queueHeist(ctx: Ctx, sc: Scheme, odds: number): boolean {
  const s = ctx.s;
  const iid = `ev${s.nextId++}`;
  const h = HEISTS[sc.opts.heist ?? 'jewelry'];
  const params = { heist: sc.opts.heist ?? 'jewelry', odds: Math.round(odds * 1000) / 1000, agents: sc.agents.join(','), play: 1 };
  s.eventQueue.push({
    iid, defId: 'heist_job', week: s.week, mandatory: true, priority: 83, actors: sc.agents.slice(0, 3),
    title: `The job: ${h.name}`,
    text: `Everything is in place for the ${h.name.toLowerCase()}. The planner says ${Math.round(odds * 100)}%.`,
    defaultChoiceId: 'quiet',
    choices: [
      { id: 'run', label: 'Run the job', detail: 'Play it: the plan, getting in, the take, getting away.', because: sc.because, effects: [mgEffect('heist', iid, params)] },
      { id: 'quiet', label: 'Let it play out', detail: `Same odds (${Math.round(odds * 100)}%).`, because: sc.because, effects: [mgEffect('heist', iid, { ...params, play: 0 })] },
    ],
  });
  return true;
}
