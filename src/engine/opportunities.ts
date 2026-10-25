import { previewAction } from './actions';
import { whichRacket } from './racketHub';
import { CATALOG } from './catalog';
import { idleMen, owned, playerSlots, staffFactor } from './business';
import { isInSeason } from './calendar';
import { capos, crew, displayName, isFree, player } from './characters';
import { holder, SEAT_INFO, SEATS } from './council';
import { leaderlessTake, rankCandidates, type Role } from './candidates';
import { districtTake, UNWASHED_SAFE } from './economy';
import { fmtMoney } from './effects';
import { chooseHeir } from './dynasty';
import { HEAT_THRESHOLD } from './heat';
import { bookCapacity } from './loans';
import { OPEN_FILE } from './longgame';
import { opinion } from './relations';
import { currentRiseGoal, RISE_GOALS, riseGoalsDone } from './riseGoals';
import { preSeason } from './advice';
import { needsBones } from './bones';
import { fam } from './familyState';
import { challengePressure, successionCandidates } from './heir';
import { pwView } from './powerState';
import { myOfficials } from './polPuppets';
import type { GameState, PlayerAction } from './types';

/**
 * "What should I do?" — the three to five best opportunities and worst
 * threats right now, each ranked and tied to the action that answers it,
 * plus a short "This week" checklist for new players that walks up the
 * early-goals ladder. Pure, derived from the state.
 */

export interface Opportunity {
  id: string;
  kind: 'opportunity' | 'threat';
  /** Higher first. Roughly dollars at stake per week, or the equivalent. */
  score: number;
  title: string;
  text: string;
  /** Button text: "Appoint one →". */
  cta: string;
  /** Where the button goes. */
  /** Where the button goes; `trip` opens the trip planner for that leader. */
  link: { tab?: string; charId?: string; action?: PlayerAction; role?: Role; trip?: string };
}

function usable(s: GameState, a: PlayerAction): PlayerAction | undefined {
  return previewAction(s, a).disabledReason ? undefined : a;
}

export function opportunities(s: GameState): Opportunity[] {
  const out: Opportunity[] = [];
  if (s.gameOver) return out;
  const boss = player(s);

  // Districts with no capo: the take leaks.
  for (const d of s.districts) {
    const infl = d.influence.player ?? 0;
    const k = d.capoId ? s.characters[d.capoId] : undefined;
    if (infl < 40 || (k && k.alive && isFree(s, k) && k.faction === 'player')) continue;
    const leak = Math.round(districtTake(s, d.id) - leaderlessTake(s, d.id));
    const r = rankCandidates(s, { kind: 'capo', district: d.id });
    const best = r.candidates.find((c) => c.id === r.recommendedId);
    out.push({
      id: `capo:${d.id}`, kind: 'opportunity', score: 600 + leak * 2,
      title: `${d.name} has no capo`,
      text: `Without one you collect ${Math.round(leaderlessTake(s, d.id) / Math.max(1, districtTake(s, d.id)) * 100)}% of the street: ~${fmtMoney(leak)}/wk leaks.${best ? ` Best man: ${best.name} (${best.outcome}).` : ' No soldier is free to step up — get a man made.'}`,
      cta: best ? 'Appoint one →' : 'See the books →',
      link: best ? { role: { kind: 'capo', district: d.id }, tab: 'crew' } : { tab: 'tree' },
    });
  }

  // Empty council seats.
  for (const st of SEATS) {
    if (holder(s, st)) continue;
    const r = rankCandidates(s, { kind: 'seat', seat: st });
    if (!r.recommendedId) continue;
    const w = st === 'underboss' ? 900 : st === 'bagman' ? 800 : st === 'consigliere' ? 700 : 500;
    out.push({
      id: `seat:${st}`, kind: 'opportunity', score: w,
      title: `Nobody is ${SEAT_INFO[st].name.toLowerCase()}`,
      text: `${SEAT_INFO[st].blurb} An empty seat does nothing. Best man: ${r.candidates[0].name} (${SEAT_INFO[st].skill} ${s.characters[r.candidates[0].charId ?? '']?.attributes[SEAT_INFO[st].skill] ?? '?'}).`,
      cta: 'Fill the seat →', link: { role: { kind: 'seat', seat: st }, tab: 'crew' },
    });
  }

  // Heat.
  const heatOrder = (key: string): PlayerAction | undefined => usable(s, { kind: 'order', key, via: holder(s, 'underboss') ? 'underboss' : 'direct' });
  if (s.heat.local >= 55) out.push({ id: 'heat:local', kind: 'threat', score: (s.heat.local - 40) * 70, title: `Local heat ${s.heat.local}`, text: `At ${HEAT_THRESHOLD} the police raid: a place padlocked, cash seized. Lay low or grease the cops.`, cta: 'Lay low →', link: { action: heatOrder('laylow') ?? heatOrder('cops'), tab: 'crew' } });
  if (s.heat.family >= 50) out.push({ id: 'heat:family', kind: 'threat', score: (s.heat.family - 35) * 80, title: `Family heat ${s.heat.family}`, text: `At ${HEAT_THRESHOLD} Philadelphia summons you and takes a cut of the treasury. An envelope to Moretti cools it.`, cta: 'Send a gift →', link: { action: heatOrder('gift'), tab: 'crew' } });
  if (s.heat.federal >= 50) out.push({ id: 'heat:federal', kind: 'threat', score: (s.heat.federal - 35) * 90, title: `Federal heat ${s.heat.federal}`, text: `At ${HEAT_THRESHOLD} the FBI arrests your men. Wash the dirty money; set the fixer to cool the feds.`, cta: 'Cool the feds →', link: { action: usable(s, { kind: 'councilTask', seat: 'fixer', task: 'fix_feds' }), tab: 'crew' } });

  // Dirty money.
  if (s.unwashed > UNWASHED_SAFE) out.push({ id: 'unwashed', kind: 'threat', score: 400 + (s.unwashed - UNWASHED_SAFE) / 30, title: `${fmtMoney(s.unwashed)} in shoeboxes`, text: `Above ${fmtMoney(UNWASHED_SAFE)} the IRS notices every week (federal heat). A front that launders, or the bagman on laundering, washes it.`, cta: 'Wash it →', link: { action: heatOrder('launder'), tab: 'business' } });

  // Unhappy capos and men drifting.
  for (const c of capos(s)) {
    const op = opinion(s, c.id, boss.id);
    if (op > -20 || !isFree(s, c)) continue;
    out.push({ id: `unhappy:${c.id}`, kind: 'threat', score: 700 + -op * 15, title: `${c.firstName} is unhappy (${op})`, text: `${displayName(c)} runs a crew and thinks ${op} of you. Unhappy capos skim, sit on orders and start factions.`, cta: 'Invite him to dinner →', link: { action: usable(s, { kind: 'interact', id: 'dinner', target: c.id }), charId: c.id } });
  }
  for (const c of crew(s)) {
    if (!c.courtedBy && (c.defectStage ?? 0) < 1) continue;
    out.push({ id: `drift:${c.id}`, kind: 'threat', score: c.rank === 'capo' ? 1500 : 650, title: `${c.firstName} may walk`, text: `${displayName(c)} has been seen with a rival. A dinner or a gift brings him back; if he goes, men may follow.`, cta: 'Talk to him →', link: { action: usable(s, { kind: 'interact', id: 'dinner', target: c.id }), charId: c.id } });
  }

  // A plot against the boss.
  const plot = s.schemes.find((x) => x.owner !== 'player' && x.discovered && x.kind === 'murder' && x.targetId === boss.id);
  if (plot) out.push({ id: 'plot', kind: 'threat', score: 3000, title: 'There is a contract on you', text: `${s.rivals.find((r) => r.id === plot.owner)?.name ?? 'Someone'} is ${plot.progress}% ready. Put the underboss on guarding you.`, cta: 'Guard the boss →', link: { action: usable(s, { kind: 'councilTask', seat: 'underboss', task: 'ub_guard' }), tab: 'crew' } });

  // No heir.
  if (!chooseHeir(s, boss).heir) out.push({ id: 'heir', kind: 'threat', score: 2500, title: 'No heir', text: 'If you die now, the house dies with you. Marry, or bring someone of the blood into the line.', cta: 'The house →', link: { tab: 'family' } });

  // The books.
  if (s.books?.open) {
    const r = rankCandidates(s, { kind: 'make' });
    const best = r.candidates.find((c) => c.id === r.recommendedId);
    if (best) out.push({ id: 'books', kind: 'opportunity', score: 900, title: 'Philadelphia has the books open', text: `${s.books.slots} place${s.books.slots === 1 ? '' : 's'} left. Best man to propose: ${best.name}.`, cta: 'Propose him →', link: { role: { kind: 'make' }, tab: 'tree' } });
  }

  // The boss's own file.
  const ev = boss.evidence ?? 0;
  if (ev >= OPEN_FILE - 8) out.push({ id: 'evidence', kind: 'threat', score: 500 + ev * 20, title: `Your file: ${Math.round(ev)}/100`, text: `The FBI opens a case at ${OPEN_FILE}. Give orders through the underboss or a capo instead of yourself.`, cta: 'The Law →', link: { tab: 'law' } });

  // Money: short, or idle.
  if (s.money < 2000) out.push({ id: 'broke', kind: 'threat', score: 1200 + (2000 - s.money) / 2, title: 'Short of cash', text: 'In the red, respect and loyalty bleed every week. Lean on the bars, collect the shylock book, or sell what you cannot run.', cta: 'Raise cash →', link: { action: usable(s, { kind: 'order', key: 'shakedown', via: 'direct' }), tab: 'business' } });
  else {
    const room = s.districts.some((d) => { const sl = playerSlots(s, d.id); return (d.influence.player ?? 0) >= 20 && sl.used < sl.max; });
    if (s.money >= 12000 && room) out.push({ id: 'idle', kind: 'opportunity', score: 300 + s.money / 40 + (preSeason(s) ? 400 : 0), title: `${fmtMoney(s.money)} sitting idle`, text: `${preSeason(s) ? 'The Season is coming: buy now and the place earns ×2.5 all summer. ' : isInSeason(s.date) ? 'It is the Season: every week a new place is open counts. ' : ''}You have storefronts free.`, cta: 'Buy a place →', link: { tab: 'business' } });
    // The next racket, as the Rackets hub would rank it.
    const rk = s.money >= 9000 && owned(s).filter((b) => b.category === 'racket').length < 6 ? whichRacket(s)[0] : undefined;
    if (rk) out.push({ id: 'racket', kind: 'opportunity', score: 260 + s.money / 80, title: `Start a racket: ${CATALOG[rk.kind].name.toLowerCase()}`, text: `${rk.reasons.filter((r) => r.value > 0).slice(0, 2).map((r) => r.label).join('; ')}. The Rackets page ranks every one for you.`, cta: 'The Rackets →', link: { action: usable(s, { kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind: rk.kind } } }), tab: 'rackethub' } });
    if (s.money >= 8000 && bookCapacity(s) > s.loans.length) out.push({ id: 'lend', kind: 'opportunity', score: 250, title: 'The shylock book has room', text: 'Five points a week on idle cash.', cta: 'Lend →', link: { action: usable(s, { kind: 'lend', amount: 2500 }), tab: 'business' } });
  }

  // Short-handed rackets.
  const thin = owned(s).filter((b) => staffFactor(s, b) < 1);
  if (thin.length) out.push({ id: 'staff', kind: 'threat', score: 300 + thin.length * 120, title: `${thin.length} place${thin.length > 1 ? 's' : ''} short-handed`, text: `${thin.map((b) => b.name).slice(0, 2).join(', ')} earn${thin.length === 1 ? 's' : ''} less without men. ${idleMen(s).length ? 'Idle men are picked up each week.' : 'Hire or recruit.'}`, cta: 'Hire →', link: { tab: 'crew' } });

  // Disputes before the Table.
  for (const d of s.disputes.filter((x) => !x.ruling)) {
    const r = rankCandidates(s, { kind: 'lobby', disputeId: d.id });
    const swing = r.candidates.find((c) => c.id === r.recommendedId && c.upside >= 60);
    out.push({ id: `dispute:${d.id}`, kind: d.defendant === 'player' ? 'threat' : 'opportunity', score: 800 + (swing ? 400 : 0), title: `The Table hears it in week ${d.hearingWeek}`, text: `${d.claim}${swing ? ` ${swing.name}'s vote can be won.` : ''}`, cta: 'Lobby →', link: { role: { kind: 'lobby', disputeId: d.id }, tab: 'table' } });
  }

  // Prospects with no bones: nobody can put their names up.
  const unbloodied = crew(s).filter((c) => c.rank === 'associate' && !c.specialty && isFree(s, c) && needsBones(s, c) && !s.bones?.jobs.some((j) => j.prospectId === c.id));
  if (unbloodied.length && (s.books?.open || unbloodied.length >= 3)) {
    const r = rankCandidates(s, { kind: 'bones', job: 'collection' });
    const best = r.candidates.find((c) => c.id === r.recommendedId);
    if (best) out.push({ id: 'bones', kind: 'opportunity', score: s.books?.open ? 850 : 380, title: `${unbloodied.length} associate${unbloodied.length > 1 ? 's' : ''} without bones`, text: `Nobody is made until he has done something for this thing of ours.${s.books?.open ? ' The books are open now.' : ''} Best man for a collection: ${best.name} (${best.outcome}).`, cta: 'Give him a job →', link: { role: { kind: 'bones', job: 'collection' }, tab: 'tree' } });
  }

  // Someone pushing for the chair.
  const pushing = successionCandidates(s).map((c) => ({ c, p: challengePressure(s, c).score })).filter((x) => x.p >= 60).sort((a, b) => b.p - a.p)[0];
  if (pushing) out.push({ id: `pressure:${pushing.c.id}`, kind: 'threat', score: 600 + pushing.p * 12, title: `${pushing.c.firstName} is pushing for the chair`, text: `${displayName(pushing.c)}: challenge pressure ${pushing.p}/100.${pwView(s).ambitions[pushing.c.id]?.revealed ? '' : ' Find out what he wants;'} a promise, amends or a post can buy time.`, cta: 'Heirs & ambition →', link: { tab: 'power' } });

  // City Hall: nobody of yours.
  if (s.pol && s.money >= 15000 && !myOfficials(s).some((x) => x.idx >= 40)) {
    const r = rankCandidates(s, { kind: 'official' });
    const best = r.candidates.find((c) => c.id === r.recommendedId);
    if (best) out.push({ id: 'official', kind: 'opportunity', score: 320, title: 'Nobody at City Hall is yours', text: `An official you own does favors: permits, licenses, a quiet word. Best place to start: ${best.name} (${best.outcome}).`, cta: 'Compare officials →', link: { role: { kind: 'official' }, tab: 'cityhall' } });
  }

  // The boss is worn out.
  const stress = fam(s, boss.id).stress;
  if (stress >= 50) out.push({ id: 'stress', kind: 'threat', score: 300 + stress * 8, title: `You are worn out (stress ${stress})`, text: 'Past a point stress breaks a man: a temper, a bottle, a mistake. A vacation, a day fishing or the family helps.', cta: 'Plan a trip →', link: { trip: boss.id, tab: 'map' } });

  // Lifestyle.
  if (!boss.lifestyle) out.push({ id: 'lifestyle', kind: 'opportunity', score: 350, title: 'Choose how to rule', text: 'A lifestyle earns perks as you go: muscle, money, politics, family or the shadows.', cta: 'Lifestyle →', link: { tab: 'lifestyle' } });
  else if (boss.lifestyle.points > 0) out.push({ id: 'perk', kind: 'opportunity', score: 450, title: `${boss.lifestyle.points} perk point${boss.lifestyle.points > 1 ? 's' : ''} to spend`, text: 'A perk is permanent. Spend it.', cta: 'Lifestyle →', link: { tab: 'lifestyle' } });

  // The ladder.
  const g = ladderGoal(s);
  if (g) out.push({ id: `goal:${g.id}`, kind: 'opportunity', score: 420, title: `Next step: ${g.title}`, text: g.hint, cta: 'Go →', link: { tab: 'business' } });

  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** The 3–5 things most worth doing now: the top of the list, with at least one threat if there is one. */
export function whatShouldIDo(s: GameState, max = 5): Opportunity[] {
  const all = opportunities(s);
  const top = all.slice(0, max);
  if (!top.some((o) => o.kind === 'threat')) {
    const t = all.find((o) => o.kind === 'threat');
    if (t) top[top.length - 1] = t;
  }
  return top.slice(0, Math.max(3, Math.min(max, top.length)));
}

/** The early-goals ladder: the Rise to Power goal in play, or the next rung for any start. */
export function ladderGoal(s: GameState) {
  return currentRiseGoal(s) ?? (s.flags.start_rise ? undefined : RISE_GOALS.find((g) => !g.done(s)));
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
  hint?: string;
}

/** A short "This week" checklist for new players. */
export function weekChecklist(s: GameState, ui: { answered: number; ordersQueued: number }): CheckItem[] {
  const boss = player(s);
  const leaking = s.districts.filter((d) => (d.influence.player ?? 0) >= 40 && !(d.capoId && s.characters[d.capoId]?.alive)).length;
  const empty = SEATS.filter((st) => !holder(s, st)).length;
  const g = ladderGoal(s);
  const done = s.flags.start_rise ? riseGoalsDone(s).length : RISE_GOALS.filter((x) => x.done(s)).length;
  const items: CheckItem[] = [
    { id: 'decisions', text: s.pendingEvents.length ? `Answer the ${s.pendingEvents.length} decision${s.pendingEvents.length > 1 ? 's' : ''} on your desk` : 'No decisions on your desk', done: ui.answered >= s.pendingEvents.length, hint: 'Each option shows why you might pick it.' },
    { id: 'order', text: 'Give at least one order', done: ui.ordersQueued > 0, hint: 'Every order card says why, what it costs, and a verdict.' },
    { id: 'capos', text: 'Every district you hold has a capo', done: leaking === 0, hint: leaking ? `${leaking} district${leaking > 1 ? 's' : ''} leaking money.` : undefined },
    { id: 'council', text: 'Fill the five council seats', done: empty === 0, hint: empty ? `${empty} empty — compare candidates on the Administration tab.` : undefined },
    { id: 'lifestyle', text: 'Choose a lifestyle', done: !!boss.lifestyle },
    { id: 'heat', text: 'Keep every heat bar under 60', done: s.heat.local < 60 && s.heat.family < 60 && s.heat.federal < 60 },
  ];
  if (g) items.push({ id: 'ladder', text: `Ladder (${done}/${RISE_GOALS.length}): ${g.title}`, done: false, hint: g.hint });
  return items;
}

