import { assignFaces } from './faces';
import { desertMult, myMenWeek, noteChoice } from './myMen';
import { ocWeek } from './oceanCity';
import { econEventSource, econWeek } from './econ';
import { hoodWeek } from './hood';
import { livingWeek } from './livingWorld';
import { livingEventSource } from './livingAsk';
import { housingWeek } from './housing';
import { marketWeek } from './market';
import { fbankEventSource, fbankWeek } from './familyBank';
import { talksWeek } from './talks';
import { missionsWeek } from './missions';
import { markCostlyChoices } from './costHints';
import { travelWeek } from './travel';
import { nycWeek } from './nyc';
import { townsWeek } from './towns';
import { officeWeek } from './office';
import { powerWeek } from './power';
import { underbellyWeek } from './underbelly';
import { legalWeek } from './longgame';
import { attachMinigames, minigameFirst, minigamesWeek } from './minigames';
import { trialWeek } from './trial';
import { reelsWeek } from './reels';
import { newsWeek } from './newspaper';
import { paperWeek } from './paper';
import { politicsWeek } from './politics';
import { clonePol } from './polState';
import { lifestyleMonth, lifestyleWeek } from './lifestyle';
import { resolveActions } from './actions';
import { autoStaff } from './business';
import { dateOfWeek, monthKey, seasonInfo } from './calendar';
import { runGoals } from './goals';
import { riseGoalsWeek } from './riseGoals';
import { ambitionsWeek } from './ambitions';
import { runCouncil } from './council';
import { crewMonth, crewWeek, defect, factionsWeek, revealIntel } from './crewlife';
import { tidyRegimes } from './hierarchy';
import { regimesMonth, regimesWeek } from './regimes';
import { rivalCrewWeek } from './rivalcrew';
import { rivalSchemes, runSchemes } from './schemes';
import { secretsMonth } from './secrets';
import { rivalDisputes, tableWeek } from './table';
import { warWeek } from './war';
import { devWeek } from './develop';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { fireConsequences } from './consequences';
import { killCharacter, monthlyLife, validatePlayer } from './dynasty';
import { applyEffects } from './effects';
import { dynastyChoices, dynastyMonth, dynastyWeek } from './family';
import { housesMonth } from './housesLife';
import { buildHealthEvent, generateWeekEvents, MAX_POPUPS, registerEventSource } from './events';
import { oldDonWeek } from './oldDon';
import { storyEventSource, storyPoolSource, storyResolve } from './storyPack';
import { arcEventSource, arcsResolve, arcsWeek } from './livingStories';
import './livingStoryData';
import './storylets';
import { noteAnswers, takeQuiet } from './storyPace';
import { romanceMonth } from './romance';
import { operationalHeat, recordEarnings, runEconomy } from './economy';
import { attended, neglectWeek } from './neglect';
import { heatConsequences, heatDecay, setHeatRaidPlanner } from './heat';
import { planHeatRaid } from './threats';
import { scheduleWeek } from './daily';
import { phoneWeek } from './phone';
import { bailoutSource, pressureWeek, summonsSource } from './pressure';
import { setPieceSource, setPiecesWeek } from './setPieces';
import { heat, newCtx, reconcile, respect, type Ctx } from './ledger';
import { addOpinion, decayAllRelations, opinion } from './relations';
import { chance } from './rng';
import { rivalSuccession, rivalWeek } from './rivals';
import type { AdvanceResult, GameState, PlayerChoices, WeeklyReport } from './types';
import { bonesEventSource, bonesWeek } from './bones';
import { kinEventSource } from './housesEvents';
import { archiveWeek, ledgerWeek } from './ledgerbook';
import { tidyState } from './tidy';
import { cloneLedgerBook } from './ledgerbookState';
import { archiveAccounts, reconcileAccounts, tributeOpen } from './tribute';
import { recordMoneyWeek, twoPots } from './money';
import { tributeBegin, tributeEnd, tributeWeek } from './tributeFlow';
import './tributeEvents';
// Delegation level and "always do this" (the Desk's Handled for you rules).
import './delegation';
import { earsWeek } from './ears';
import { datingWeek } from './dating';
import { nightlifeWeek } from './nightlife';
import { payrollWeek, withFavorJobs } from './payroll';
import { herwayWeek } from './herway';
import { bondsWeek } from './bonds';
import { spendWeek } from './spend';
import { storeWeek } from './store';
import { workWeek } from './bizRacket';
import { protectWeek } from './protect';
import { womenWeek } from './women';
import { honeyWeek } from './honey';
import { racketEventSource } from './racketLife';
import { delegatedActions, recordDelegation } from './briefing';
import { chosenRounds, roundOptions, roundsWeek } from './rounds';
import { hoursWeek } from './timeCost';
import { bookMark, bookOrder, bookWeek, classify } from './journal';
import { checkinPlan, checkinsWeek } from './checkins';
import { threatsAnswer, threatsWeek } from './threats';
import { fedsWeek } from './feds';
import { intrigueResolve, intrigueWeek } from './intrigue';
import { armyResolve, armyWeek } from './army';
import { docketOf, lieutenantsWeek, ltView, planNextWeek } from './lieutenants';
import { guardDefaults, safeDefault } from './handover';
import { xpEventSource, xpWeek } from './crewXp';
import { mindsWeek } from './minds';
import { readsWeek } from './peopleRead';
import { argueWeek } from './argue/offer';
import { deedsEventSource, deedsWeek } from './deeds';
import { sceneEventSource } from './authored/run';
import { capoEventSource, caposWeek } from './capos';
import { rxChoiceBegin, rxEnd } from './reactions/apply';
import { proposalsEventSource } from './reactions/proposals';
import { knobs } from './difficulty';
import { pruneSave } from './prune';
import { heirSeatSource, matchOfferSource } from './generations';
import { matchmakersWeek, momKnowsBestSource } from './matchmakers';
import { CAPO_SEAT_MIN } from './regimes';

// The story pillar feeds the one popup pipeline (one candidate a week each).
registerEventSource(storyEventSource);
// The deeds' asks at the boss's door and the authored scenes (deeds/, authored/): one candidate a week each.
registerEventSource(deedsEventSource);
// The NPCs' proposals with stakes (reactions/): one every few weeks at most.
registerEventSource((s) => proposalsEventSource(s));
registerEventSource(sceneEventSource);
// Success draws fire, and a way back from the bottom (pressure.ts): Philadelphia's summons, the bail-out.
registerEventSource(summonsSource);
// The season's set-pieces (setPieces.ts): opening weekend, the Fourth, Labor Day, the September storm.
registerEventSource(setPieceSource);
// The heat's raids are ticking clocks (threats.ts): set for a night next week.
setHeatRaidPlanner(planHeatRaid);
registerEventSource(bailoutSource);
registerEventSource(heirSeatSource);
registerEventSource(matchOfferSource);
registerEventSource(momKnowsBestSource);
registerEventSource(storyPoolSource);
registerEventSource(arcEventSource);
registerEventSource(econEventSource);
registerEventSource(bonesEventSource);
registerEventSource(kinEventSource);
registerEventSource(racketEventSource);
registerEventSource(livingEventSource);
registerEventSource(fbankEventSource);
registerEventSource(xpEventSource);
// The capos' requests, the word from their streets, a capo the boss has found out (capos.ts): one candidate a week.
registerEventSource(capoEventSource);

/**
 * The simulation entry points. Both are pure with respect to their input:
 * the state is deep-cloned first and only the clone is touched.
 */

/**
 * Deep copy for the pure week step. The chronicle, newspaper, dynasty history
 * and last report are append-only lists of immutable entries (nothing ever
 * edits an entry after pushing it), so they are copied shallowly; everything
 * else is deep-copied. This is most of the simulator's speed.
 */
/** Recursive copy of plain JSON-like data (≈3.5× faster than a JSON round-trip). Drops undefined like JSON does. */
function deepCopy(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = deepCopy(v[i]);
    return out;
  }
  const out: Record<string, unknown> = {};
  const o = v as Record<string, unknown>;
  for (const k in o) {
    const x = o[k];
    // Personal chronicles are append-only lists of immutable entries: copy the list, share the entries.
    if (k === 'story' && Array.isArray(x)) out[k] = x.slice();
    else if (x !== undefined) out[k] = deepCopy(x);
  }
  return out;
}

export function cloneState(s: GameState): GameState {
  const { chronicle, dynastyHistory, lastReport, news, pol, ledgerBook, lineage, journal, ...rest } = s;
  const c = deepCopy(rest) as GameState;
  if (lineage) c.lineage = lineage; // copy-on-write (houses.ts linMut)
  // The books' archived weeks are immutable once written (see ledgerbookState.ts).
  if (ledgerBook) c.ledgerBook = cloneLedgerBook(ledgerBook);
  // Politics shares its immutable people records and reserve rows (copy-on-write, see polState.ts).
  if (pol) c.pol = clonePol(pol);
  c.chronicle = chronicle.slice();
  c.dynastyHistory = dynastyHistory.slice();
  c.news = news ? news.slice() : [];
  if (lastReport) c.lastReport = lastReport;
  // The Book's entries are never changed in place (journal.ts replaces one to change it).
  if (journal) c.journal = { ...journal, e: journal.e.slice(), old: journal.old.slice() };
  return c;
}

/** The months the bagman does not come in person, Philadelphia's envelope goes through the drop (storyDirector.ts). */
function payTheDrop(ctx: Ctx): void {
  const d = ctx.s.director;
  if (!d?.drop) return;
  const env = d.drop;
  d.drop = undefined;
  // Top 10 #8: an envelope that goes through the drop with nothing in the treasury behind it is unpaid tribute, and Philadelphia knows.
  if (ctx.s.money < env) applyEffects(ctx, [{ type: 'heat', bar: 'family', amount: 10, label: 'The envelope came up empty' }, { type: 'flag', key: 'bag_short', value: 1, label: 'Philadelphia will want to see you' }], { label: 'The envelope', because: 'the treasury could not cover the envelope', category: 'tribute' });
  applyEffects(ctx, [{ type: 'money', amount: -env, category: 'tribute', label: 'Tribute to Philadelphia (through the drop)' }], { label: 'The envelope', because: 'sent Philadelphia its envelope through the drop', category: 'tribute' });
}

/** Routine business settled quietly this week (storyPace.ts): on the books, and an "In motion" note in the report. */
function payQuiet(ctx: Ctx): string[] {
  const items = takeQuiet(ctx.s);
  for (const q of items) if (!ctx.s.gameOver) applyEffects(ctx, q.effects.map((e) => ({ ...e, label: `In motion: ${e.label ?? q.title}` })), { label: `In motion: ${q.title}`, because: q.because, category: q.category ?? 'event' });
  return items.map((q) => q.note);
}

function snapshot(s: GameState) {
  return { money: s.money, respect: s.respect, heat: { ...s.heat } };
}

/** `own`: how many of the orders are the boss's own (the rest are his trusted advisors'). */
function resolveChoices(ctx: Ctx, choices: PlayerChoices, own = choices.actions?.length ?? 0): void {
  const s = ctx.s;
  if (choices.successionLaw && choices.successionLaw !== s.successionLaw) {
    s.successionLaw = choices.successionLaw;
    ctx.log.push(`Succession law is now: ${choices.successionLaw}.`);
  }
  if (choices.designatedHeirId !== undefined) s.designatedHeirId = choices.designatedHeirId || undefined;
  const pending = minigameFirst(s.pendingEvents);
  s.pendingEvents = [];
  ctx.mgMoves = choices.minigames;
  for (const ev of pending) {
    const wanted = choices.choices?.[ev.iid];
    let ch = ev.choices.find((c) => c.id === wanted && !c.disabledReason);
    // Unanswered: the default, which never gives a man up when there is another way (handover.ts).
    if (!ch) ch = safeDefault(s, ev);
    if (!ch) continue;
    // Skip choices referencing characters that died since the event was raised.
    const charId = ev.meta?.charId ? String(ev.meta.charId) : undefined;
    if (charId && !s.characters[charId]?.alive && ev.defId !== 'funeral' && ev.defId !== 'recruit') continue;
    // An event about a crew member who has since become the boss (succession) is moot.
    if (charId === s.playerId && ev.defId !== 'health_warning') continue;
    if (s.gameOver) break;
    noteChoice(s, ev, ch);
    const mark = bookMark(ctx);
    const rx = rxChoiceBegin(s, ev, ch);
    applyEffects(ctx, ch.effects, { label: `${ev.title}: ${ch.label}`, because: ch.because, category: ev.defId === 'bagman' ? 'tribute' : 'event' });
    rxEnd(ctx, rx);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You ${ch.because}.`, kind: 'decision' });
    bookOrder(ctx, mark, undefined, { title: `${ev.title}: ${ch.label}`, outcome: 'done', decision: true, p: [...(ev.actors ?? []), ...(charId ? [charId] : [])], cat: classify(s, `${ev.title} ${ch.because}`, 'town') });
  }
  // The player's own orders: a pocket order is only paid by the Family when he said so (A13).
  if (!s.gameOver && choices.actions?.length) resolveActions(ctx, choices.actions, { strictFunding: true, own });
  if (!s.gameOver) ctx.log.push(...autoStaff(s));
}

/** Monthly bookkeeping: aging/health/death, opinion decay, crew loyalty, rival successions. */
function monthlyTick(ctx: Ctx): void {
  const s = ctx.s;
  const { warnings } = monthlyLife(ctx);
  for (const c of warnings) if (c.alive && (c.id === s.playerId || c.dynasty)) s.eventQueue.push(buildHealthEvent(s, c));
  decayAllRelations(s);
  rivalSuccession(ctx);
  crewMonth(ctx);
  secretsMonth(s);
  if (!s.gameOver) dynastyMonth(ctx);
  if (!s.gameOver) housesMonth(ctx);
  if (!s.gameOver) romanceMonth(ctx);
  lifestyleMonth(ctx);
  regimesMonth(ctx);
  // Disloyal men may walk out (a capo takes the men loyal to him).
  const boss = player(s);
  for (const m of crew(s)) {
    if (!m.alive || m.faction !== 'player' || !isFree(s, m) || m.dynasty || hasTrait(m, 'Loyal-to-a-fault')) continue;
    const op = opinion(s, m.id, boss.id);
    // A crew that knows the boss has its back walks out less (myMen.ts).
    if (op <= -45 && chance(s, 0.25 * desertMult(s))) {
      const wasCapo = m.rank === 'capo' || m.rank === 'underboss';
      defect(ctx, m, 'desert');
      if (wasCapo) {
        const replacement = crew(s).filter((c) => c.rank === 'soldier' && isFree(s, c)).sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0];
        const d = s.districts.find((x) => !x.capoId && (x.influence.player ?? 0) >= CAPO_SEAT_MIN);
        // B5: the deserter's crew is taken over with or without a district to seat him on.
        if (replacement) {
          replacement.rank = 'capo';
          if (d) d.capoId = replacement.id;
          addOpinion(s, replacement.id, boss.id, 'Made me a capo', 20, 1);
          ctx.log.push(`${displayName(replacement)} takes over ${d ? d.name : `${displayName(m)}'s crew`}.`);
          tidyRegimes(s);
        }
      }
    }
  }
}

function weeklyHousekeeping(ctx: Ctx): void {
  const s = ctx.s;
  // Releases from prison.
  for (const c of Object.values(s.characters)) {
    if (c.alive && c.imprisonedUntil !== undefined && c.imprisonedUntil <= s.week) {
      c.imprisonedUntil = undefined;
      if (c.faction === 'player') {
        ctx.log.push(`${displayName(c)} is out of jail.`);
        if (c.rank === 'capo' || c.rank === 'underboss') {
          const d = s.districts.find((x) => !x.capoId && (x.influence.player ?? 0) >= CAPO_SEAT_MIN);
          if (c.rank === 'capo' && d) d.capoId = c.id;
        }
      }
    }
  }
  // Fill empty capo seats in districts we control with a capo who has no district.
  for (const d of s.districts) {
    if (d.capoId || (d.influence.player ?? 0) < CAPO_SEAT_MIN) continue;
    const idle = crew(s).find((c) => c.rank === 'capo' && isFree(s, c) && !s.districts.some((x) => x.capoId === c.id));
    if (idle) d.capoId = idle.id;
  }
  // Reputation drifts every week toward what the crew's real standing on the island justifies,
  // faster the further off it is; and at the top it has to be kept: above RESPECT_KEEP it slips a
  // point a week unless the boss showed strength that week (a strike beaten off, a war won).
  {
    const target = respectTarget(s);
    const share = Math.round(islandShare(s));
    const gap = target - s.respect;
    const step = Math.ceil(Math.abs(gap) / 10);
    const shown = s.action?.strength === s.week;
    if (gap > 2) respect(ctx, step, `Word on the street: you run ${share}% of the island`, 'drift');
    else if (gap < -2) respect(ctx, -step, `Reputation settles: you run only ${share}% of the island`, 'drift');
    else if (s.respect > knobs(s).respectKeep && !shown) respect(ctx, -1, 'Respect at the top has to be kept: a quiet week, and people forget', 'drift');
  }
  // The informant (starting problem) leaks to the FBI.
  if (s.flags.informant) {
    const rat = s.characters[`c${s.flags.informant}`];
    if (rat?.alive && rat.faction === 'player' && isFree(s, rat)) {
      if (s.week % 3 === 0) heat(ctx, 'federal', 1, 'The FBI seems to know a lot lately (a leak in the crew?)', 'heat');
    } else s.flags.informant = 0;
  }
}

/** Weighted share of the island's street action the player controls (0-100). */
export function islandShare(s: GameState): number {
  const total = s.districts.reduce((a, d) => a + d.streetBase, 0);
  return s.districts.reduce((a, d) => a + d.streetBase * (d.influence.player ?? 0), 0) / total;
}

/** Above this, respect slips a point a week unless the boss shows strength (DAILY_LOGIC #6). */
export const RESPECT_KEEP = 90;

export function respectTarget(s: GameState): number {
  const men = crew(s).filter((c) => isFree(s, c)).length;
  return Math.round(Math.max(5, Math.min(90, 15 + islandShare(s) * 0.55 + Math.min(10, men - 6) + (s.money > 50000 ? 5 : 0))));
}

export function emptyReport(s: GameState): WeeklyReport {
  const info = seasonInfo(s.date);
  return {
    week: s.week, date: { ...s.date }, seasonLabel: info.label, multiplier: info.multiplier, grossIncome: 0,
    start: snapshot(s), end: snapshot(s), lines: [], log: [],
  };
}

/**
 * Advance one week. Order of operations:
 *  1. resolve the player's choices for this week's pending events
 *  2. delayed consequences that come due
 *  3. the economy ledger (income, kick-ups, costs, debts)
 *  4. rival AI moves
 *  5. heat from operations, heat consequences (80+), heat decay
 *  6. housekeeping; monthly tick if the month rolls over
 *  7. move the calendar and generate next week's events
 */
export function advanceWeek(input: GameState, choices: PlayerChoices = {}): AdvanceResult {
  if (input.gameOver) {
    const s = cloneState(input);
    const report = emptyReport(s);
    return { state: s, report, log: [] };
  }
  // The Sit-Down's trusted advisors and the boss's rounds are read off the week as the player saw it.
  const delegated = delegatedActions(input, choices);
  const picked = chosenRounds(input, choices);
  const roundOpts = picked ? roundOptions(input) : [];
  const mornings = checkinPlan(input, choices.checkins, choices.skipDays);
  // The lieutenants' week (lieutenants.ts): the docket and the boss's word on it, as he saw them.
  const ltDocket = docketOf(input);
  const ltCalls = ltView(input).calls;
  const s = cloneState(input);
  // The days plan is only the week's choices (sent in `choices`): the new week starts on a Monday with none.
  delete s.days;
  const ctx = newCtx(s);
  const start = snapshot(s);
  tributeOpen(s);
  twoPots(ctx);
  const info = seasonInfo(s.date);
  const weekOf = s.week;
  const dateOf = { ...s.date };
  let motion: string[] = [];

  s.cutscenes = [];
  const resolving = s.pendingEvents;
  noteAnswers(s, resolving, choices);
  // A trusted advisor acting on his own has the boss's standing permission to use Family money.
  resolveChoices(ctx, delegated.length ? { ...choices, actions: [...(choices.actions ?? []), ...delegated.map((d) => ({ ...d.action, fund: 'family' as const }))] } : choices, choices.actions?.length ?? 0);
  if (!s.gameOver) recordDelegation(s, weekOf, delegated);
  // The underboss and the consigliere do their side of the business (their own hours, the Family's money within budget).
  const ltLines = !s.gameOver ? lieutenantsWeek(ctx, ltDocket, ltCalls, [...(choices.actions ?? []), ...delegated.map((d) => d.action)]) : [];
  // The answers given at this week's urgent meetings are carried out before anything lands.
  if (!s.gameOver) threatsAnswer(ctx);
  const roundLines = !s.gameOver && picked ? roundsWeek(ctx, picked, roundOpts) : [];
  if (!s.gameOver && mornings) roundLines.push(...checkinsWeek(ctx, mornings.list, choices.checkins ?? {}, mornings.missed));
  // The boss's hours (timeCost.ts): the late nights and the missed dinners are felt.
  if (!s.gameOver) roundLines.push(...hoursWeek(s));
  if (!s.gameOver) tributeBegin(ctx, resolving, choices);
  if (!s.gameOver) dynastyChoices(ctx, resolving, choices);
  if (!s.gameOver) storyResolve(ctx, resolving);
  if (!s.gameOver) arcsResolve(ctx, resolving, choices);
  if (!s.gameOver) intrigueResolve(ctx, resolving, choices);
  // The battles the boss answered last week are fought (army.ts).
  if (!s.gameOver) armyResolve(ctx, resolving, choices);
  if (!s.gameOver) fireConsequences(ctx);
  if (!s.gameOver) arcsWeek(ctx);
  if (!s.gameOver) {
    runEconomy(ctx);
    // An absent boss (neglect.ts): a week nobody runs the family costs something.
    neglectWeek(ctx, attended(resolving, choices, delegated.length));
    econWeek(ctx);
    hoodWeek(ctx);
    livingWeek(ctx);
    housingWeek(ctx);
    marketWeek(ctx);
    fbankWeek(ctx);
    talksWeek(ctx);
    missionsWeek(ctx);
    runCouncil(ctx);
    crewWeek(ctx);
    lifestyleWeek(ctx);
    legalWeek(ctx);
    travelWeek(ctx);
    nycWeek(ctx);
    townsWeek(s);
    trialWeek(ctx);
    minigamesWeek(ctx);
    underbellyWeek(ctx);
    officeWeek(s);
    // The minds think before the capos and the rivals act (minds/): their choices read fresh minds.
    mindsWeek(ctx);
    // Arguments (argue/): a window left open is settled; the week's hearsay arrives; story seeds grow into the systems above and below.
    argueWeek(ctx);
    // People act on each other (deeds/): the NPCs' own interactions, the clashes, partnerships and loans.
    deedsWeek(ctx);
    regimesWeek(ctx);
    // The capos run the street: their ground, their men, their ears, their reading of the tide (capos.ts).
    caposWeek(ctx);
    bonesWeek(ctx);
    ledgerWeek(ctx);
    earsWeek(ctx);
    datingWeek(ctx);
    nightlifeWeek(ctx);
    payrollWeek(ctx);
    herwayWeek(ctx);
    womenWeek(ctx);
    honeyWeek(ctx);
    bondsWeek(ctx);
    // The women arrange the matches (matchmakers.ts): her proposal, her silence taken as a yes.
    matchmakersWeek(ctx);
    myMenWeek(ctx);
    spendWeek(ctx);
    storeWeek(ctx);
    ocWeek(ctx);
    workWeek(ctx);
    protectWeek(ctx);
    factionsWeek(ctx);
    const intel = revealIntel(ctx);
    if (intel) s.eventQueue.push(intel);
  }
  if (!s.gameOver) {
    devWeek(ctx);
    rivalWeek(ctx);
    rivalCrewWeek(ctx);
    rivalSchemes(ctx);
    runSchemes(ctx);
    warWeek(ctx);
    // The army: the bill for the men under arms, the campaigns, the battles massing, Philadelphia's lean (army.ts).
    armyWeek(ctx);
    rivalDisputes(ctx);
    tableWeek(ctx);
    threatsWeek(ctx);
    // Feds and flipping: pinches at an hour, the government's offer, the wire, the hollow crown, the tip-off, the undercover (feds.ts).
    fedsWeek(ctx);
    // The dynamics layer reads the week's real events: eras, spies, lies, plots (intrigue.ts).
    intrigueWeek(ctx);
    // The Old Don start: the hidden hands, the opening weeks, the first year's verdict (oldDon.ts).
    oldDonWeek(ctx);
  }
  if (!s.gameOver) {
    operationalHeat(ctx);
    heatConsequences(ctx);
    heatDecay(ctx);
    weeklyHousekeeping(ctx);
    // The save on a diet (prune.ts): twice a year, the long dead and the old archives.
    pruneSave(s);
    runGoals(ctx);
    riseGoalsWeek(ctx);
    // Three goals at a time: met ones pay and are replaced (ambitions.ts).
    ambitionsWeek(ctx);
    dynastyWeek(ctx);
    politicsWeek(ctx);
    newsWeek(ctx);
    paperWeek(ctx);
    reelsWeek(ctx, input);
    recordEarnings(ctx);
    tributeWeek(ctx);
    // A big operation costs to keep; the weeks under water are counted (pressure.ts).
    pressureWeek(ctx);
    // The Fourth's crowd; a storm the clock never reached (setPieces.ts).
    setPiecesWeek(ctx);
    // Your men come up (crewXp.ts): what each man did this week, seen against the week as it began.
    xpWeek(ctx, input);
    // The boss's private read on people: the week's evidence counted, old suspicion fading (peopleRead.ts).
    readsWeek(ctx);
  }
  s.unwashed = Math.max(0, Math.min(s.unwashed, Math.max(0, s.money)));

  // Calendar.
  const prevMonth = monthKey(s.date);
  s.week += 1;
  s.date = dateOfWeek(s.week);
  if (!s.gameOver && monthKey(s.date) !== prevMonth) monthlyTick(ctx);

  if (!s.gameOver) powerWeek(ctx);
  if (!s.gameOver) {
    tidyRegimes(s);
    const errs = validatePlayer(s);
    if (errs.length) throw new Error(`Invalid player after week ${weekOf}: ${errs.join('; ')}`);
    s.pendingEvents = generateWeekEvents(s);
    // A favor asked of the boss can carry a price: "and in return you work for me" (payroll.ts).
    s.pendingEvents = withFavorJobs(s, s.pendingEvents);
    payTheDrop(ctx);
    motion = payQuiet(ctx);
    tributeEnd(ctx);
    attachMinigames(s);
    markCostlyChoices(s);
    ctx.popups = s.pendingEvents.length;
    planNextWeek(s);
    // The week spread across the days: Monday's decisions stay on the desk, the rest come out Tuesday to Friday (daily.ts).
    scheduleWeek(s);
    // The phone's week: the line clicks, the county's tap comes out, old counters go (phone.ts).
    phoneWeek(s);
  } else {
    s.pendingEvents = [];
  }

  const report: WeeklyReport = {
    ...(motion.length ? { motion } : {}),
    ...(delegated.length || roundLines.length ? { rounds: [...delegated.map((d) => d.text + '.'), ...roundLines] } : {}),
    ...(ltLines.length ? { lieutenants: ltLines } : {}),
    week: weekOf,
    date: dateOf,
    seasonLabel: info.label,
    multiplier: info.multiplier,
    grossIncome: ctx.gross,
    start,
    end: snapshot(s),
    lines: ctx.lines,
    log: ctx.log,
  };
  const errs = reconcile(report);
  if (errs.length) throw new Error(`Ledger does not reconcile in week ${weekOf}: ${errs.join('; ')}`);
  const acctErrs = reconcileAccounts(s);
  if (acctErrs.length) throw new Error(`Accounts do not reconcile in week ${weekOf}: ${acctErrs.join('; ')}`);
  archiveAccounts(s);
  if (!s.gameOver) archiveWeek(s, report);
  // The Book: everything the week wrote that no order claimed, once (journal.ts).
  bookWeek(input, s, ctx, report);
  s.lastReport = report;
  if (!s.gameOver) recordMoneyWeek(s);
  if (s.chronicle.length > 400) s.chronicle = s.chronicle.slice(-400);
  try { assignFaces(s); } catch { /* cosmetic */ }
  tidyState(s);
  return { state: s, report, log: ctx.log };
}

/**
 * Debug/stress tool: kill a character immediately through the one death
 * function (funeral, history, succession all apply). Pure: returns a new state
 * plus the ledger lines it produced (e.g. the succession respect hit).
 */
export function forceDeath(input: GameState, charId: string, cause: string): { state: GameState; lines: WeeklyReport['lines']; log: string[] } {
  const s = cloneState(input);
  const ctx = newCtx(s);
  killCharacter(ctx, charId, cause);
  if (!s.gameOver) {
    // Surface the funeral right away.
    s.pendingEvents = [...s.pendingEvents, ...s.eventQueue.splice(0)].slice(0, MAX_POPUPS);
    guardDefaults(s, s.pendingEvents);
  }
  return { state: s, lines: ctx.lines, log: ctx.log };
}

/**
 * Advance until the calendar month changes. Only the first week uses the
 * supplied choices; later weeks take each event's default choice.
 */
export function advanceMonth(input: GameState, choices: PlayerChoices = {}): { state: GameState; reports: WeeklyReport[]; log: string[] } {
  let s = input;
  const reports: WeeklyReport[] = [];
  const log: string[] = [];
  const startMonth = monthKey(input.date);
  let first = true;
  for (let i = 0; i < 6; i++) {
    const r = advanceWeek(s, first ? choices : {});
    first = false;
    s = r.state;
    reports.push(r.report);
    log.push(...r.log);
    if (s.gameOver || monthKey(s.date) !== startMonth) break;
  }
  return { state: s, reports, log };
}

/** Weeks in a season (the "Advance a Season" button). */
export const SEASON_WEEKS = 13;

/**
 * Advance a span of weeks with delegation: only the first week uses the
 * supplied choices; later weeks take each event's default (silence never
 * gives a man up: handover.ts). Stops early when the game ends or the chair
 * changes hands, so the new boss sees his first week himself.
 */
export function advanceSpan(input: GameState, weeks: number, choices: PlayerChoices = {}): { state: GameState; reports: WeeklyReport[]; log: string[] } {
  let s = input;
  const reports: WeeklyReport[] = [];
  const log: string[] = [];
  const boss = input.playerId;
  for (let i = 0; i < Math.max(1, weeks); i++) {
    const r = advanceWeek(s, i === 0 ? choices : {});
    s = r.state;
    reports.push(r.report);
    log.push(...r.log);
    if (s.gameOver || s.playerId !== boss) break;
  }
  return { state: s, reports, log };
}

export { MAX_POPUPS };
