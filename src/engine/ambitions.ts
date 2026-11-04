import { ageOn, isInSeason, seasonInfo } from './calendar';
import { crew, displayName, player } from './characters';
import { holder } from './council';
import { applyEffects } from './effects';
import { ourMarriageable } from './familyMarriage';
import { HEAT_THRESHOLD } from './heat';
import type { Ctx } from './ledger';
import { inTheRanks, stationOf } from './rankView';
import { RISE_GOALS } from './riseGoals';
import { above, MADE_STANDING } from './valente';
import type { Effect, GameState, HeatBar } from './types';

/**
 * THREE GOALS (EASIER_NOT_SHALLOWER #10), the way Crusader Kings gives ambitions: at any time the boss has
 * three short, clear goals picked from where he stands, each with a progress bar and a reward. They never
 * take an option away; they say what is worth doing next. "Get made", "Pay off Philadelphia", "Marry your
 * daughter well", "Survive the summer", "Take a second district".
 *
 * Built on what exists: the Rise to Power ladder (riseGoals.ts: its goals pay through riseGoalsWeek, never
 * twice), the station and the family above (rankView.ts, valente.ts), the marriages, the season, the heat.
 *
 * Saved as `s.ambitions` (optional; made by the first week that runs, so loading never changes a save).
 * Before then the same three are worked out on the fly. No dice: the same state picks the same goals.
 */

export interface AmbPick {
  id: string;
  /** Week picked. */
  w: number;
  /** A number the goal is measured against (a money target, a heat level, a respect target). */
  target?: number;
  /** Where it started (heat, influence). */
  base?: number;
  /** The week it is judged (survive the season). */
  until?: number;
  /** Whom it is about (a daughter, a district). */
  who?: string;
}

export interface AmbitionsState {
  picks: AmbPick[];
  /** Goals met (the last few), for the record. */
  done: { id: string; w: number }[];
}

/** Where a "Show me" goes: a plain route the UI opens (ui/shell/routes.ts). */
export interface AmbGo { panel: string; section?: string }

export interface AmbView {
  id: string;
  title: string;
  hint: string;
  /** 0..1 */
  progress: number;
  /** "$12,400 of $20,000". */
  progressText: string;
  /** The reward, in words. */
  reward: string;
  go?: AmbGo;
  /** The part of the Don's life (ui/domain.ts key). */
  domain: 'family' | 'crew' | 'money' | 'law' | 'rivals' | 'politics';
}

type Status = 'open' | 'done' | 'failed';

interface AmbDef {
  id: string;
  /** Higher first. */
  priority: (s: GameState) => number;
  fits: (s: GameState) => boolean;
  /** A new pick's numbers. */
  make?: (s: GameState) => Omit<AmbPick, 'id' | 'w'>;
  view: (s: GameState, p: AmbPick) => Omit<AmbView, 'id' | 'reward' | 'domain'>;
  status: (s: GameState, p: AmbPick) => Status;
  reward: (s: GameState, p: AmbPick) => Effect[];
  rewardText: string;
  domain: AmbView['domain'];
  /** Goals of one group never sit side by side (two money goals at once read as one). */
  group: string;
  /** Paid by another system (the Rise ladder): this one only shows it. */
  paidElsewhere?: boolean;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;
const held = (s: GameState, pct: number) => s.districts.filter((d) => (d.influence.player ?? 0) >= pct).length;
const hottest = (s: GameState): HeatBar => (['local', 'federal', 'family'] as HeatBar[]).sort((a, b) => s.heat[b] - s.heat[a])[0];
const HEAT_WORD: Record<HeatBar, string> = { local: 'the county', federal: 'the FBI', family: 'Philadelphia' };

function daughterToMarry(s: GameState) {
  const me = player(s);
  return ourMarriageable(s).filter((c) => me.childrenIds.includes(c.id)).sort((a, b) => ageOn(b.birth, s.date) - ageOn(a.birth, s.date) || a.id.localeCompare(b.id))[0];
}
function phillyDebt(s: GameState) {
  return s.debts.find((d) => /philadelphia|philly/i.test(d.lender));
}

const DEFS: AmbDef[] = [
  {
    id: 'get_made', group: 'rank', domain: 'crew', rewardText: 'respect +5',
    priority: () => 100,
    fits: (s) => stationOf(s) === 'associate',
    view: (s) => { const st = Math.round(above(s)?.standing ?? 0); return { title: 'Get made', hint: 'Earn standing with the family above you: make the quota, do what your capo asks, find a made man to vouch for you. When the books open, your name goes up.', progress: clamp01(st / MADE_STANDING), progressText: `standing ${st} of ${MADE_STANDING}`, go: { panel: 'borgata', section: 'place' } }; },
    status: (s) => (stationOf(s) !== 'associate' ? 'done' : 'open'),
    reward: () => [{ type: 'respect', amount: 5, label: 'Goal: made' }],
  },
  {
    id: 'own_crew', group: 'rank', domain: 'crew', rewardText: 'respect +5',
    priority: () => 95,
    fits: (s) => stationOf(s) === 'soldier' || stationOf(s) === 'capo',
    view: (s) => { const st = Math.round(above(s)?.standing ?? 0); const capo = stationOf(s) === 'capo'; return { title: capo ? 'Earn the underboss\'s seat' : 'Get your own crew', hint: capo ? 'Run your district well and keep the boss\'s number; when the seat opens, the boss looks at the capo he counts on.' : 'Be your capo\'s top earner. When a crew opens, the boss looks at the soldier he counts on.', progress: clamp01(st / 55), progressText: `standing ${st} of 55`, go: { panel: 'borgata', section: 'place' } }; },
    status: (s, p) => (stationOf(s) !== (p.who ?? stationOf(s)) ? 'done' : 'open'),
    make: (s) => ({ who: stationOf(s) }),
    reward: () => [{ type: 'respect', amount: 5, label: 'Goal: moved up' }],
  },
  {
    id: 'quota', group: 'money', domain: 'money', rewardText: '+5 standing, respect +2',
    priority: (s) => ((above(s)?.owed ?? 0) > 0 ? 90 : 60),
    fits: (s) => inTheRanks(s) && (above(s)?.quota ?? 0) > 0,
    view: (s) => { const a = above(s); const n = Math.min(4, a?.streak ?? 0); return { title: 'Make the quota four Mondays running', hint: `Your chief expects ${usd(a?.quota ?? 0)} in the kick-up every Monday. Short weeks are remembered.`, progress: n / 4, progressText: `${n} of 4 Mondays`, go: { panel: 'borgata', section: 'place' } }; },
    status: (s) => ((above(s)?.streak ?? 0) >= 4 ? 'done' : 'open'),
    reward: () => [{ type: 'respect', amount: 2, label: 'Goal: the quota, four weeks running' }],
  },
  {
    id: 'philly', group: 'law', domain: 'politics', rewardText: 'Philadelphia +10, respect +3',
    priority: (s) => (phillyDebt(s) ? 85 : 40 + s.heat.family / 2),
    fits: (s) => !!phillyDebt(s) || (s.heat.family >= 35 && !inTheRanks(s)),
    make: (s) => { const d = phillyDebt(s); return d ? { who: d.id, base: d.weeksLeft } : { base: s.heat.family, target: 20 }; },
    view: (s, p) => {
      const d = p.who ? s.debts.find((x) => x.id === p.who) : undefined;
      if (p.who) return { title: 'Pay off Philadelphia', hint: `${d ? `${usd(d.weeklyPayment)} a week to ${d.lender}` : 'The loan'}. Paid off, Philadelphia stops asking about you.`, progress: d ? clamp01(1 - d.weeksLeft / Math.max(1, p.base ?? d.weeksLeft)) : 1, progressText: d ? `${d.weeksLeft} weeks left` : 'paid', go: { panel: 'holdings', section: 'money' } };
      const b = p.base ?? s.heat.family;
      return { title: 'Square things with Philadelphia', hint: 'Family heat is their patience with you. Pay the bagman in full and on time, keep the papers quiet, and it cools.', progress: clamp01((b - s.heat.family) / Math.max(1, b - 20)), progressText: `family heat ${s.heat.family}, under 20 wanted`, go: { panel: 'diplomacy', section: 'table' } };
    },
    status: (s, p) => (p.who ? (s.debts.some((x) => x.id === p.who) ? 'open' : 'done') : s.heat.family < 20 ? 'done' : 'open'),
    reward: () => [{ type: 'rivalOpinion', rival: 'philly', amount: 10, reason: 'Squared away with Philadelphia', label: 'Goal: square with Philadelphia' }, { type: 'respect', amount: 3, label: 'Goal: square with Philadelphia' }],
  },
  {
    id: 'cool', group: 'law', domain: 'law', rewardText: 'respect +2, a favor',
    priority: (s) => 70 + Math.max(...Object.values(s.heat)) / 4,
    fits: (s) => Math.max(s.heat.local, s.heat.federal) >= HEAT_THRESHOLD - 5,
    make: (s) => { const bar = hottest(s); return { who: bar, base: s.heat[bar], target: 30 }; },
    view: (s, p) => { const bar = (p.who ?? 'local') as HeatBar; const b = p.base ?? s.heat[bar]; return { title: `Cool ${HEAT_WORD[bar]} down`, hint: `${bar === 'federal' ? 'Federal' : 'Local'} heat ${s.heat[bar]}: from ${HEAT_THRESHOLD} they ${bar === 'federal' ? 'arrest your men' : 'raid your places'}. Quiet weeks, the pad and the lawyer bring it down.`, progress: clamp01((b - s.heat[bar]) / Math.max(1, b - 30)), progressText: `${s.heat[bar]} now, under 30 wanted`, go: { panel: 'town', section: bar === 'federal' ? 'case' : 'cityhall' } }; },
    status: (s, p) => (s.heat[(p.who ?? 'local') as HeatBar] < 30 ? 'done' : 'open'),
    reward: () => [{ type: 'respect', amount: 2, label: 'Goal: the heat is off' }, { type: 'favor', amount: 1, label: 'Goal: the heat is off' }],
  },
  {
    id: 'season', group: 'season', domain: 'money', rewardText: 'respect +3',
    priority: () => 65,
    fits: (s) => seasonInfo(s.date).weeksRemaining >= 3 && s.money > 0,
    make: (s) => ({ until: s.week + seasonInfo(s.date).weeksRemaining, base: isInSeason(s.date) ? 1 : 0 }),
    view: (s, p) => { const left = Math.max(0, (p.until ?? s.week) - s.week); const total = Math.max(1, (p.until ?? s.week) - p.w); const summer = p.base === 1; return { title: summer ? 'Survive the summer' : 'Get through the winter in the black', hint: summer ? 'Keep the Family in the black to Labor Day. The boardwalk pays now; the bills come all year.' : 'The boardwalk is boarded up. Keep a cushion and the Family in the black until Memorial Day.', progress: clamp01(1 - left / total), progressText: `${left} week${left === 1 ? '' : 's'} to go · Family ${usd(s.money)}`, go: { panel: 'holdings', section: 'money' } }; },
    status: (s, p) => (s.money < 0 ? 'failed' : s.week >= (p.until ?? 0) ? 'done' : 'open'),
    reward: (_s, p) => [{ type: 'respect', amount: 3, label: p.base === 1 ? 'Goal: survived the summer' : 'Goal: through the winter' }],
  },
  {
    id: 'second_district', group: 'ground', domain: 'crew', rewardText: 'respect +4',
    priority: () => 55,
    fits: (s) => !inTheRanks(s) && held(s, 40) === 1,
    view: (s) => { const second = s.districts.map((d) => d.influence.player ?? 0).sort((a, b) => b - a)[1] ?? 0; return { title: 'Take a second district', hint: 'Push into a district until you hold 40% of it; then a soldier of yours can run it as its capo.', progress: clamp01(second / 40), progressText: `${Math.round(second)}% of 40% in your next-best district`, go: { panel: 'borgata', section: 'capos' } }; },
    status: (s) => (held(s, 40) >= 2 ? 'done' : 'open'),
    reward: () => [{ type: 'respect', amount: 4, label: 'Goal: a second district' }],
  },
  {
    id: 'marry', group: 'family', domain: 'family', rewardText: 'respect +3, renown',
    priority: () => 50,
    fits: (s) => !!daughterToMarry(s),
    make: (s) => ({ who: daughterToMarry(s)?.id }),
    view: (s, p) => { const c = p.who ? s.characters[p.who] : undefined; const her = c?.gender === 'F'; return { title: `Marry your ${her ? 'daughter' : 'son'} well`, hint: `${c ? displayName(c) : 'Your child'} is of age. A good match is an alliance: the other house joins your wars and its Table votes lean your way.`, progress: c?.spouseId ? 1 : 0.1, progressText: c?.spouseId ? 'married' : 'no match yet', go: { panel: 'house', section: 'marriages' } }; },
    status: (s, p) => { const c = p.who ? s.characters[p.who] : undefined; return !c?.alive ? 'failed' : c.spouseId ? 'done' : 'open'; },
    reward: () => [{ type: 'respect', amount: 3, label: 'Goal: a good match' }],
  },
  {
    id: 'war_chest', group: 'money', domain: 'money', rewardText: 'respect +2, a favor',
    priority: () => 45,
    fits: (s) => !inTheRanks(s),
    make: (s) => ({ target: Math.max(10000, roundUp(Math.max(0, s.money) * 1.5 + 5000, 5000)) }),
    view: (s, p) => ({ title: `Build a war chest: ${usd(p.target ?? 10000)}`, hint: 'Family money is what pays the men, the cops and Philadelphia when a week goes bad. A place that pays, or a racket, gets you there.', progress: clamp01(s.money / (p.target ?? 10000)), progressText: `${usd(Math.max(0, s.money))} of ${usd(p.target ?? 10000)}`, go: { panel: 'holdings', section: 'hub' } }),
    status: (s, p) => (s.money >= (p.target ?? 10000) ? 'done' : 'open'),
    reward: () => [{ type: 'respect', amount: 2, label: 'Goal: a war chest' }, { type: 'favor', amount: 1, label: 'Goal: a war chest' }],
  },
  {
    id: 'consigliere', group: 'crew', domain: 'crew', rewardText: 'respect +2',
    priority: () => 58,
    fits: (s) => !inTheRanks(s) && !holder(s, 'consigliere') && crew(s).length >= 4,
    view: () => ({ title: 'Name a consigliere', hint: 'The consigliere advises on every decision and handles the lawyers, the pad and the other families for you.', progress: 0, progressText: 'the seat is empty', go: { panel: 'borgata', section: 'council' } }),
    status: (s) => (holder(s, 'consigliere') ? 'done' : 'open'),
    reward: () => [{ type: 'respect', amount: 2, label: 'Goal: a consigliere' }],
  },
  {
    id: 'capos', group: 'crew', domain: 'crew', rewardText: 'respect +2',
    priority: () => 62,
    fits: (s) => !inTheRanks(s) && s.districts.some((d) => (d.influence.player ?? 0) >= 40 && !(d.capoId && s.characters[d.capoId]?.alive)),
    view: (s) => { const own = s.districts.filter((d) => (d.influence.player ?? 0) >= 40); const run = own.filter((d) => d.capoId && s.characters[d.capoId]?.alive).length; return { title: 'A capo in every district you hold', hint: 'A district without a capo leaks its take. Compare the candidates and appoint one.', progress: clamp01(run / Math.max(1, own.length)), progressText: `${run} of ${own.length} districts`, go: { panel: 'borgata', section: 'capos' } }; },
    status: (s) => (s.districts.some((d) => (d.influence.player ?? 0) >= 40 && !(d.capoId && s.characters[d.capoId]?.alive)) ? 'open' : 'done'),
    reward: () => [{ type: 'respect', amount: 2, label: 'Goal: every district run' }],
  },
  {
    id: 'respect', group: 'standing', domain: 'crew', rewardText: 'a favor',
    priority: () => 30,
    fits: (s) => s.respect < 90,
    make: (s) => ({ target: Math.min(100, roundUp(s.respect + 8, 5)) }),
    view: (s, p) => ({ title: `Make your name: respect ${p.target ?? 50}`, hint: 'Win your fights, keep your word, pay on time. Respect raises the odds that people say yes to you.', progress: clamp01(s.respect / (p.target ?? 50)), progressText: `${s.respect} of ${p.target ?? 50}`, go: { panel: 'borgata', section: 'rise' } }),
    status: (s, p) => (s.respect >= (p.target ?? 50) ? 'done' : 'open'),
    reward: () => [{ type: 'favor', amount: 1, label: 'Goal: a name on the street' }],
  },
  {
    id: 'heir', group: 'family', domain: 'family', rewardText: 'respect +2',
    priority: (s) => (ageOn(player(s).birth, s.date) >= 60 ? 88 : 35),
    fits: (s) => !inTheRanks(s) && !s.designatedHeirId && s.successionLaw === 'appointed' && ageOn(player(s).birth, s.date) >= 45,
    view: () => ({ title: 'Name your heir', hint: 'With an heir named, the chair passes the way you want it to. Without one, the claimants decide.', progress: 0, progressText: 'nobody named', go: { panel: 'house', section: 'succession' } }),
    status: (s) => (s.designatedHeirId ? 'done' : 'open'),
    reward: () => [{ type: 'respect', amount: 2, label: 'Goal: an heir named' }],
  },
  // The Rise to Power ladder: its goals, shown here and paid by riseGoalsWeek (never twice).
  ...RISE_GOALS.map((g, i): AmbDef => ({
    id: `rise_${g.id}`, group: 'rise', domain: 'crew', rewardText: 'the Rise\'s reward', paidElsewhere: true,
    priority: () => 99 - i,
    fits: (s) => !!s.flags.start_rise && !s.flags[`rgoal_${g.id}`],
    view: (s) => ({ title: g.title, hint: g.hint, progress: g.done(s) ? 1 : 0, progressText: g.done(s) ? 'met: paid when the week turns' : 'not yet', go: { panel: 'borgata', section: 'rise' } }),
    status: (s) => (s.flags[`rgoal_${g.id}`] || g.done(s) ? 'done' : 'open'),
    reward: () => [],
  })),
];

const BY_ID: Record<string, AmbDef> = Object.fromEntries(DEFS.map((d) => [d.id, d]));
export const AMBITION_IDS = DEFS.map((d) => d.id);
/** How many goals at a time. */
export const AMB_SLOTS = 3;

/** Fill the empty slots: the highest-priority goals that fit, one per group, none just met. */
function fill(s: GameState, picks: AmbPick[], done: AmbitionsState['done']): AmbPick[] {
  const out = picks.filter((p) => BY_ID[p.id]);
  const recent = new Set(done.filter((d) => s.week - d.w < 4).map((d) => d.id));
  const groups = new Set(out.map((p) => BY_ID[p.id].group));
  const open = DEFS.filter((d) => !out.some((p) => p.id === d.id) && !recent.has(d.id) && !groups.has(d.group))
    .filter((d) => { try { return d.fits(s) && statusOf(s, d, { id: d.id, w: s.week, ...(d.make?.(s) ?? {}) }) === 'open'; } catch { return false; } })
    .sort((a, b) => b.priority(s) - a.priority(s) || a.id.localeCompare(b.id));
  for (const d of open) {
    if (out.length >= AMB_SLOTS) break;
    if (groups.has(d.group)) continue;
    groups.add(d.group);
    out.push({ id: d.id, w: s.week, ...(d.make?.(s) ?? {}) });
  }
  return out;
}

function statusOf(s: GameState, d: AmbDef, p: AmbPick): Status {
  try { return d.status(s, p); } catch { return 'failed'; }
}

/** The three goals now: the saved ones, or (before the first week) the ones the week would pick. Pure. */
export function ambitionPicks(s: GameState): AmbPick[] {
  if (s.gameOver) return [];
  const A = s.ambitions;
  return A ? A.picks.filter((p) => BY_ID[p.id]) : fill(s, [], []);
}

export function ambitionsView(s: GameState): AmbView[] {
  return ambitionPicks(s).map((p) => {
    const d = BY_ID[p.id];
    const v = d.view(s, p);
    const st = statusOf(s, d, p);
    return { id: p.id, ...v, progress: st === 'done' ? 1 : v.progress, progressText: st === 'done' && !d.paidElsewhere ? `${v.progressText} · met: paid when the week turns` : v.progressText, reward: d.rewardText, domain: d.domain };
  });
}

/** The Desk's top line: what he is working toward, in a few words. */
export function workingToward(s: GameState): string | undefined {
  const v = ambitionsView(s);
  if (!v.length) return undefined;
  return v.map((x) => x.title).join(' · ');
}

/** Upgrade step: a saved record is kept in shape (loading never adds one). */
export function ensureAmbitions(s: GameState): AmbitionsState {
  const A = (s.ambitions ??= { picks: [], done: [] });
  A.picks ??= [];
  A.done ??= [];
  return A;
}

/** Weekly (advanceWeek, after the Rise ladder): goals met pay once and are replaced; a failed or unfit one is replaced. */
export function ambitionsWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const A = ensureAmbitions(s);
  const keep: AmbPick[] = [];
  for (const p of A.picks) {
    const d = BY_ID[p.id];
    if (!d) continue;
    const st = statusOf(s, d, p);
    if (st === 'done') {
      A.done = [...A.done, { id: p.id, w: s.week }].slice(-12);
      if (!d.paidElsewhere) {
        const title = d.view(s, p).title;
        applyEffects(ctx, d.reward(s, p), { label: `Goal: ${title}`, because: `met a goal: ${title.toLowerCase()}` });
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A goal met: ${title.charAt(0).toLowerCase()}${title.slice(1)}.`, kind: 'misc' });
        ctx.log.push(`Goal met: ${title}.`);
      }
      continue;
    }
    let fits = true;
    try { fits = d.fits(s) || d.id === 'season' || d.id === 'marry' || d.id === 'philly' || d.id === 'cool' || d.id === 'own_crew'; } catch { fits = false; }
    if (st === 'failed' || !fits) continue;
    keep.push(p);
  }
  A.picks = fill(s, keep, A.done);
}
