import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { acceptSettlement, mayCommit, type SettledMark } from '../engine/settle';
import { sameOrder } from './verbs';
import { clockSpaceAllowed, shortcutBlocked } from './keys';
import { openingCard } from '../engine/scenes';
import { OrderToast, type ToastItem } from './components/OrderToast';
import { ConfirmOrder } from './components/ConfirmOrder';
import { HousesNavContext } from './houses/nav';
import { alerts as computeAlerts } from '../engine/alerts';
import { advanceMonth, advanceSpan, advanceWeek, SEASON_WEEKS } from '../engine/engine';
import { previewAction, queuedMoney } from '../engine/actions';
import { STARTS, newGameWith, type StartId } from '../engine/starts';
import type { CutsceneCue, GameState, PlayerAction, PlayerChoices, SchemeKind, SchemeOptions, SuccessionLaw, WeeklyReport } from '../engine/types';
import { MapView } from './map/MapView';
import { cutscenesBetween } from '../engine/cutscenes';
import { CutscenePlayer } from './cutscene/Cutscene';
import { morningStop, newWarnings, tickerLine, useClock, weekHeadlines, type Speed } from './clock';
import { autoPauses, DEFAULT_SPEED, firstPause, redKeys, speedKey } from './clockPolicy';
import { SchemePlanner } from './components/Schemes';
import { CharacterSheet } from './components/CharacterSheet';
import { EventModal } from './components/EventModal';
import { SettledToast } from './minds/settled';
import { NowResultHost } from './deeds/NowResult';
import { ReactionsHost } from './reactions/Reactions';
import { ReportModal } from './components/ReportModal';
import type { ClarityApi } from './clarity/context';
import { PickerModal } from './clarity/CandidatePicker';
import { GlossaryOverlay } from './clarity/Glossary';
import { WhatToDoModal } from './clarity/WhatToDo';
import type { Candidate, Role } from '../engine/candidates';
import { currentSlot, loadDesk, loadSlot, saveDesk, saveSlot, setCurrentSlot, type DeskState } from './save';
import { StartMenu, type MenuScreen } from './menu/StartMenu';
import { registerAppearances } from './portrait/genes';
import { applySettings, getSettings, setSettings, helpLevel, OFFICE_HOME_FLAG, OPENING_SEEN_FLAG, pausesOn, timeMode, weekStart } from './settings';
import { GoThere } from './travel/GoThere';
import { CityScreen, VisitPill } from './travel/CityScreen';
import { VacationPill, VacationScreen } from './travel/VacationScreen';
import { ReturnHome } from './travel/ReturnHome';
import { TripPlanner } from './travel/TripPlanner';
import { FleePlanner } from './travel/FleePlanner';
import { minigameOf, opensScene } from '../engine/minigames';
import { MinigameScreen } from './minigames/MinigameScreen';
import { NewspaperReel, type Reel } from './minigames/NewspaperReel';

import { ElectionNight } from './cityhall/ElectionNight';
import type { ElectionResult } from '../engine/polState';
import type { SectionCtx } from './shell/panels';
import type { HomeId, Route } from './shell/routes';
import { homeForKey, itemOf, KEYS_CHANGED, resolveRoute, type NavRoute } from './shell/nav';
import { homeLock } from './shell/unlocks';
import { HOME_IDS } from './shell/routes';
import { alertHome, doNow as buildDoNow, type DoNowItem } from './shell/doNow';
import { racketGaps } from '../engine/racketMenu';
import { HelpBody } from './shell/ShellHelp';
import { SettingsPanel } from './menu/StartMenu';
import { whatShouldIDo } from '../engine/opportunities';
import { Providers } from './shell/Providers';
import type { MapFocus, ShellApi } from './shell/context';
import { Shell } from './shell/Shell';
import { TopBar } from './shell/TopBar';
import { LeftRail } from './shell/LeftRail';
import { Drawer } from './shell/Drawer';
import { FindPalette } from './shell/Find';
import type { FindResult } from './shell/find';
import { AlertsPanel, GoalsCard, StreetFeedCard, ThisWeekCard } from './shell/RightRail';
import { InMotionStrip } from './shell/InMotionStrip';
import { inMotion, type MotionChip } from './shell/inMotion';
import { shellAlerts, type ShellAlert } from './shell/alertRoutes';
import { guidedGoals, type GuidedGoal } from './shell/goals';
import { useShellState } from './shell/useShellState';
import { HintHost, Toast } from './shell/HintHost';
import { Modal } from './components/Modal';
import { SheetFrame } from './shell/SheetFrame';
import { PolSheet } from './cityhall/CityHall';
import { ContextMenu } from './sheet/InteractionMenu';
import type { MenuCategoryId } from './sheet/menuCatalog';
import { AudienceScene } from './tribute/AudienceScene';
import { TributeUiContext, type TributeUiApi } from './tribute/context';
import type { EnvelopeChoice } from '../engine/tributeOps';
import { EmpireHost } from './empire/context';
import { briefing as buildBriefing, setTrust, type BriefLink } from '../engine/briefing';
import { dayCheckIns } from '../engine/checkins';
import { daysOf, plannedRounds, setWeekRounds, tickDay, weekChoices, weekPlan } from '../engine/days';
import { bookLater, refundTime, spendTime, timeBlock, unbook } from '../engine/timeCost';
import { unreadCount } from '../engine/paper';
import { WeekPlanner } from './rounds/WeekPlanner';
import { EveningScene, PersonalActions, TodayStrip, type EveningCue } from './rounds/RoundsBits';
import { SitDown } from './sitdown/SitDown';
import { BossDesk, ReadyToAdvance, type DeskFilter } from './desk/BossDesk';
import { RiseColumn } from './borgata/TheRise';
import { readyReview } from '../engine/desk';
import { ignoreTip, markTipsSeen, meetTip, respondTip, unseenUrgent, urgentCount, urgentMeetings } from '../engine/threats';
import { UrgentMeeting } from './components/UrgentMeeting';
import { OfficeContext, type OfficeApi } from './desk/officeApi';
import { coveredBy, SitDownCard } from './sitdown/SitDownCard';
import { BossOffice } from './office/BossOffice';
import { ClubOnMap, SocialClub } from './office/SocialClub';
import type { DelegateOp, OfficeVisitor } from '../engine/bossOffice';
import { answerCheckIn } from '../engine/days';
import { deskBadge } from '../engine/attention';
import { answerOffer } from '../engine/lieutenants';
import { MorningReports, WhoHandlesWhat } from './lieutenants/Lieutenants';
import { markOrder, setRecentSeed } from './plans/orderMarks';
import { PlansContext, type PlansApi } from './plans/context';
import { LiveAlerts } from './plans/LiveAlerts';
import { UnderbossSuggests } from './plans/Suggests';
import { absDay } from '../engine/timeCost';
import { FeedbackContext, FeedbackToast, type Feedback } from './components/Feedback';
import { journalNow, seqOf } from '../engine/journal';

/** Old tab ids still work everywhere (`goTab`, alerts): they resolve through LEGACY_TAB_ROUTE. */
export type Tab = string;
type Mode = 'week' | 'month' | 'season';

/** The opening title card: the scenario's own premise and the real date (engine/scenes.ts openingCard). */
function openingCue(s: GameState): CutsceneCue {
  return { ...openingCard(s), week: s.week };
}

function freshSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** `startOn: 'game'` skips the title screen (tests, embedding). */
export interface AppProps { startOn?: 'title' | 'game' }
export function App({ startOn = 'title' }: AppProps) {
  const [slot, setSlot] = useState(() => currentSlot());
  // The saved game and the week in progress on its desk (orders, answers, scenes already opened: save.ts).
  const [boot] = useState(() => { const st = loadSlot(currentSlot()) ?? newGameWith(freshSeed()); return { st, desk: loadDesk(currentSlot(), st) }; });
  const [s, setS] = useState<GameState>(() => boot.st);
  /** The title screen / new-game flow (shown on first load). */
  const [menu, setMenu] = useState<MenuScreen | undefined>(startOn === 'title' ? 'title' : undefined);
  useEffect(() => applySettings(), []);
  registerAppearances(s.seed, s.characters);
  const [answers, setAnswers] = useState<Record<string, string>>(() => boot.desk?.answers ?? {});
  const [mgMoves, setMgMoves] = useState<Record<string, string[]>>(() => boot.desk?.moves ?? {});
  /** A scene left half-way (a reload, Back to the decision): its moves so far, so it resumes there. */
  const [mgPartial, setMgPartial] = useState<Record<string, string[]>>(() => boot.desk?.partial ?? {});
  const [scene, setScene] = useState<{ iid: string; choiceId: string; m: NonNullable<ReturnType<typeof minigameOf>> } | null>(null);
  const [eventIdx, setEventIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('week');
  const [advancing, setAdvancing] = useState(false);
  const [reports, setReports] = useState<WeeklyReport[] | null>(null);
  const [reportLog, setReportLog] = useState<WeeklyReport[]>([]);
  const [route, setRoute] = useState<NavRoute>({});
  const goRef = useRef<(r: Route | string) => void>(() => {});
  const [sheet, setSheet] = useState<string | undefined>();
  const [pendingLaw, setPendingLaw] = useState<SuccessionLaw | undefined>();
  const [pendingHeir, setPendingHeir] = useState<string | undefined>();
  const [seedInput, setSeedInput] = useState('');
  const [orders, setOrders] = useState<PlayerAction[]>(() => boot.desk?.orders ?? []);
  // The weekly take: the split chosen in the office (a ref so an answer in the same click reaches the week), and the office opened for review.
  const envelopeRef = useRef<EnvelopeChoice | undefined>(undefined);
  const [envelope, setEnvelopeState] = useState<EnvelopeChoice | undefined>();
  const setEnvelope = (e: EnvelopeChoice | undefined) => { envelopeRef.current = e; setEnvelopeState(e); };
  const [office, setOffice] = useState<string | undefined>();
  // The Sit-Down and Your Rounds: the items put off, the screen. The week's evenings and the
  // morning check-ins live in the state's days plan (engine/days.ts), so a reload keeps them.
  const [briefSkip, setBriefSkip] = useState<string[]>([]);
  const [sitdown, setSitdown] = useState<'council' | 'rounds' | undefined>();
  const [sitSeen, setSitSeen] = useState<string | undefined>();
  // The Boss's Office (ui/office): the room upstairs or the club from the street; Monday's arrival card;
  // visitors the boss said to see later this week (UI only: they stay on the desk).
  const [officeView, setOfficeView] = useState<'office' | 'club' | undefined>();
  const [mondayCard, setMondayCard] = useState(false);
  const [later, setLater] = useState<{ week: number; keys: string[] }>({ week: 0, keys: [] });
  // The Desk: items the boss took back from "Handled for you" this week, and the filter a door opened it on.
  const [taken, setTaken] = useState<{ week: number; keys: string[] }>({ week: 0, keys: [] });
  const [deskFilter, setDeskFilter] = useState<DeskFilter>('all');
  const lastQueued = useRef<{ a: PlayerAction; at: number } | undefined>(undefined);
  const ordersApi = useMemo(() => ({
    orders,
    queue: (a: PlayerAction, confirmed?: boolean) => {
      // Not enough hours left today (engine/timeCost.ts): the window says why and offers "Do it tomorrow"
      // (tests, which never see the window, book it for tomorrow).
      if (!confirmed && timeBlock(s, a)) {
        if (import.meta.env.MODE === 'test') { queueLater(a); return; }
        setConfirm(a); return;
      }
      // "Are you sure?" first (Settings › Confirm orders); tests and the double-click guard skip it.
      if (!confirmed && getSettings().confirmOrders !== false && import.meta.env.MODE !== 'test') { setConfirm(a); return; }
      // A double click is one order: the same order again within a moment is ignored.
      const now = Date.now();
      if (lastQueued.current && now - lastQueued.current.at < 600 && sameOrder(lastQueued.current.a, a)) return;
      lastQueued.current = { a, at: now };
      // A pocket order the pocket can't cover (after this week's orders) needs the player's word for Family money:
      // the toast asks, and the order tray keeps asking, before the week turns.
      const p = previewAction(s, a);
      const left = queuedMoney(s, orders).pocketLeft;
      const short = p.pot === 'pocket' && a.fund !== 'family' ? Math.max(0, p.cost - Math.max(0, left)) : 0;
      // The boss does it today: the hours come off the day (when they run out, the day ends: see below).
      const spent = spendTime(s, a);
      setS((cur) => spendTime(cur, a).state);
      markOrder(a, { abs: absDay(s), hours: spent.hours, late: spent.late, missedDinner: spent.missedDinner });
      if (spent.dayOver) setEndDayDue(true);
      setToast({ action: a, index: orders.length, at: now, short, time: { hours: spent.hours, to: spent.to, late: spent.late, missedDinner: spent.missedDinner } });
      setOrders((o) => [...o, a]);
    },
    /** "Do it tomorrow": the order is given, its hours are booked for the next day with room. */
    later: (a: PlayerAction) => queueLater(a),
    remove: (i: number) => setOrders((o) => o.filter((_, j) => j !== i)),
    replace: (i: number, a: PlayerAction) => setOrders((o) => o.map((x, j) => (j === i ? a : x))),
  }), [orders, s]);
  function queueLater(a: PlayerAction) {
    const b = bookLater(s, a);
    setS((cur) => bookLater(cur, a).state);
    markOrder(a, { booked: b.day, hours: b.hours });
    setToast({ action: a, index: orders.length, at: Date.now(), time: { hours: b.hours, to: 0, late: 0, missedDinner: false, bookedDay: b.day } });
    setOrders((o) => [...o, a]);
  }
  // The day's hours are used up: the day ends and the world marches on (the clock's own day step;
  // on Sunday night the week turns through the "Ready to advance?" review).
  const [endDayDue, setEndDayDue] = useState(false);
  // "Who handles what" (the lieutenants' settings, ui/lieutenants).
  const [ltOpen, setLtOpen] = useState(false);
  const [houseSel, setHouseSel] = useState<string | undefined>();
  const [toast, setToast] = useState<ToastItem | undefined>();
  const [confirm, setConfirm] = useState<PlayerAction | undefined>();
  const closeToast = useCallback(() => setToast(undefined), []);
  // Click feedback (components/Feedback.tsx): every decision, every change made at once, the week settling.
  const [feedback, setFeedback] = useState<Feedback | undefined>();
  const closeFeedback = useCallback(() => setFeedback(undefined), []);
  const feedbackApi = useMemo(() => ({ notify: (f: Omit<Feedback, 'at'>) => { setToast(undefined); setFeedback({ ...f, at: Date.now() }); } }), []);
  /** A change the boss makes that takes effect at once (an evening booked, a check-in answered, a trip): the click says so, and Your File keeps it. */
  const act = useCallback((f: (x: GameState) => GameState, what?: string) => {
    setS((cur) => { const n = f(cur); return what && n !== cur ? journalNow(n, { t: what }) : n; });
    feedbackApi.notify({ kind: 'done', title: what ?? 'Done: it takes effect now.' });
  }, [feedbackApi]);
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number; category?: string } | undefined>();
  const sheetApi = useMemo(() => ({
    open: (id: string) => { setCtxMenu(undefined); setSheet(id); },
    menu: (id: string, category?: string, at?: { x: number; y: number }) => setCtxMenu({ id, category, x: at?.x ?? 80, y: at?.y ?? 120 }),
  }), []);
  const [planner, setPlanner] = useState<{ kind: SchemeKind; targetId?: string; opts?: Partial<SchemeOptions> } | undefined>();
  const plannerApi = useMemo(() => ({ plan: (kind: SchemeKind, targetId?: string, opts?: Partial<SchemeOptions>) => { setSheet(undefined); setPlanner({ kind, targetId, opts }); } }), []);

  const [picker, setPicker] = useState<{ role: Role; pool?: string[]; onPick?: (c: Candidate) => void } | undefined>();
  const [help, setHelp] = useState<{ focus?: string } | undefined>();
  const [advice, setAdvice] = useState(false);
  const clarityApi = useMemo<ClarityApi>(() => ({
    openPicker: (role, opts) => { setSheet(undefined); setPicker({ role, pool: opts?.pool, onPick: opts?.onPick }); },
    openHelp: (focus) => setHelp({ focus }),
    openAdvice: () => setAdvice(true),
    goTab: (t) => goRef.current(t),
  }), []);

  const [tripPlan, setTripPlan] = useState<{ leaderId: string; destId?: string } | undefined>();
  const [fleeFor, setFleeFor] = useState<string | undefined>();
  // Going somewhere himself (engine/visit.ts): the departure card (a city id, '' to pick) and the city screen.
  const [goTo, setGoTo] = useState<string | undefined>();
  const [cityOpen, setCityOpen] = useState(false);
  const [vacOpen, setVacOpen] = useState(false);
  const travelApi = useMemo(() => ({
    plan: (leaderId: string, destId?: string) => { setSheet(undefined); setTripPlan({ leaderId, destId }); },
    flee: (personId: string) => { setSheet(undefined); setFleeFor(personId); },
    go: (cityId?: string) => { setSheet(undefined); setGoTo(cityId ?? ''); },
    city: () => { setSheet(undefined); setCityOpen(true); },
    vacation: () => { setSheet(undefined); setVacOpen(true); },
  }), []);
  useEffect(() => {
    if (!menu) saveSlot(slot, s);
  }, [s, menu, slot]);
  // The clock runs by default (CK style; clockPolicy.ts): a new or loaded game starts moving.
  const [speed, setSpeed] = useState<Speed>(() => (timeMode() === 'clock' ? DEFAULT_SPEED : 0));
  // Red Desk items the clock already stopped for (it stops once per item).
  const ackedRef = useRef<Set<string>>(new Set());
  const turningRef = useRef(false);
  const cardOpenRef = useRef(false);
  const ackNowRef = useRef<() => void>(() => {});
  // The running clock's day: the evening scenes that just happened, the day window.
  const [evenings, setEvenings] = useState<{ cue: EveningCue; s: GameState }[]>([]);
  const [dayWin, setDayWin] = useState<number | undefined>();
  const clockMode = timeMode() === 'clock';
  // An evening's scene stays a few seconds while the clock runs (it waits for you while paused).
  useEffect(() => {
    if (!evenings.length || speed === 0) return;
    const t = setTimeout(() => setEvenings((x) => x.slice(1)), 4200 + 1400 * (4 - speed));
    return () => clearTimeout(t);
  }, [evenings, speed]);
  const [clockNote, setClockNote] = useState<string | undefined>();
  const [ticker, setTicker] = useState<string | undefined>();
  const [cues, setCues] = useState<CutsceneCue[]>([]);
  const [night, setNight] = useState<ElectionResult[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);

  // The scripted scenes (Made the boss) open by themselves, once.
  const [autoOpened, setAutoOpened] = useState<Record<string, boolean>>(() => Object.fromEntries((boot.desk?.auto ?? []).map((k) => [k, true])));
  // The desk is saved as it changes, so a reload or Continue keeps this week's orders and answers.
  useEffect(() => {
    if (menu) return;
    saveDesk(slot, { seed: s.seed, week: s.week, orders, answers, moves: mgMoves, partial: mgPartial, auto: Object.keys(autoOpened).filter((k) => autoOpened[k]) });
  }, [menu, slot, s.seed, s.week, orders, answers, mgMoves, mgPartial, autoOpened]);
  function restoreDesk(d: DeskState | undefined) {
    if (!d) return;
    setOrders(d.orders);
    setAnswers(d.answers);
    setMgMoves(d.moves);
    setMgPartial(d.partial ?? {});
    setAutoOpened(Object.fromEntries(d.auto.map((k) => [k, true])));
  }
  useEffect(() => {
    if (menu || scene || cues.length || reports) return;
    const i = s.pendingEvents.findIndex((e) => e.defId === 'made_boss' && !answers[e.iid] && !autoOpened[e.iid]);
    if (i < 0) return;
    const ev = s.pendingEvents[i];
    const ch = ev.choices.find((c) => c.id === 'play');
    const m = ch ? minigameOf(ch) : undefined;
    setAutoOpened((x) => ({ ...x, [ev.iid]: true }));
    if (!m) return;
    setAdvancing(false);
    setEventIdx(i);
    setScene({ iid: ev.iid, choiceId: 'play', m });
  }, [s, menu, scene, cues.length, reports, answers, autoOpened]);

  const unanswered = useMemo(() => s.pendingEvents.filter((e) => !answers[e.iid]), [s.pendingEvents, answers]);
  // Urgent meetings (threats.ts): a popup when one arrives; the Waiting-on-you menu lists them first.
  const [urgent, setUrgent] = useState<string | undefined>();
  const urgentN = useMemo(() => urgentCount(s), [s]);
  useEffect(() => {
    if (menu || urgent) return;
    const fresh = unseenUrgent(s);
    if (!fresh.length) return;
    if (pausesOn('pauseOnUrgent')) setSpeed(0);
    setUrgent(fresh[0]);
    setS((x) => markTipsSeen(x, fresh));
  }, [s, menu, urgent]);
  const alertList = useMemo(() => computeAlerts(s), [s]);

  const settledRef = useRef<SettledMark | undefined>(undefined);
  function run(m: Mode, a: Record<string, string>, quiet = false, moves: Record<string, string[]> = mgMoves) {
    // The one place a week's choices are built (the clock and Advance Week alike): the days plan supplies the evenings and the mornings.
    const choices: PlayerChoices = weekChoices(s, { choices: a, successionLaw: pendingLaw, designatedHeirId: pendingHeir, actions: orders, minigames: moves, ...(envelopeRef.current ? { envelope: envelopeRef.current } : {}), ...(briefSkip.length ? { briefingSkip: briefSkip } : {}) });
    // A ceremony the player sat through replaces the old single card.
    const sawCeremony = Object.keys(moves).some((iid) => s.pendingEvents.find((e) => e.iid === iid)?.defId === 'making');
    const cueFilter = (c: CutsceneCue) => !(sawCeremony && c.key === 'made_man');
    // Exactly once (engine/settle.ts): a week already committed is never settled again (a double
    // click, or the clock's Sunday night meeting a click on Advance Week), and a result only lands
    // on the state it was computed from.
    if (!mayCommit(settledRef.current, s)) return;
    const settled = (next: GameState) => {
      const mine = (next.journal?.e ?? []).filter((e) => e.w >= s.week && e.mine && e.src !== 'now');
      const orders = mine.filter((e) => e.src === 'order').length;
      const dec = mine.filter((e) => e.src === 'decision').length;
      if (!quiet || orders + dec) feedbackApi.notify({ kind: 'settled', title: `${orders} order${orders === 1 ? '' : 's'} and ${dec} decision${dec === 1 ? '' : 's'} came out.`, detail: 'What came of each one is in Your File, with everything else that happened.' });
    };
    if (m === 'week') {
      const r = advanceWeek(s, choices);
      settled(r.state);
      settledRef.current = { seed: s.seed, week: s.week };
      setS((cur) => acceptSettlement(cur, s, r.state));
      setReportLog((l) => [...l, r.report].slice(-26));
      setNight(r.state.pol?.results.filter((x) => x.week >= s.week) ?? []);
      setCues(cutscenesBetween(s, r.state).filter(cueFilter));
      setReels(r.state.mg?.reels ?? []);
      if (quiet) {
        clockAutoPause(s, r.state);
        setTicker(tickerLine(r.report));
        const warn = newWarnings(s, r.state);
        const heads = weekHeadlines(s, r.state).filter((h) => pausesOn(h.kind === 'hit' ? 'pauseOnViolence' : h.kind === 'arrest' ? 'pauseOnArrest' : 'pauseOnLife'));
        const urgent = pausesOn('pauseOnCapo') ? morningStop(r.state) : undefined;
        if (heads.length) { setSpeed(0); setClockNote(`Paused: ${heads[0].text}`); }
        else if ((warn.length || r.state.cutscenes?.length) && getSettings().pauseOnWarning) {
          setSpeed(0);
          setClockNote(warn.length ? `Paused: ${warn[0]}` : 'Paused');
        } else if (urgent) { setSpeed(0); setClockNote(`Paused: ${urgent}`); }
      }
    } else {
      const r = m === 'season' ? advanceSpan(s, SEASON_WEEKS, choices) : advanceMonth(s, choices);
      settled(r.state);
      settledRef.current = { seed: s.seed, week: s.week };
      setS((cur) => acceptSettlement(cur, s, r.state));
      setReportLog((l) => [...l, ...r.reports].slice(-26));
      setNight(r.state.pol?.results.filter((x) => x.week >= s.week) ?? []);
      setCues(cutscenesBetween(s, r.state).filter(cueFilter));
      setReels(r.state.mg?.reels ?? []);
      setReports(r.reports);
    }
    setAnswers({});
    setMgMoves({});
    setMgPartial({});
    setOrders([]);
    setBriefSkip([]);
    setSitdown(undefined);
    setEnvelope(undefined);
    setPendingLaw(undefined);
    setPendingHeir(undefined);
    setEventIdx(null);
    setAdvancing(false);
  }

  /** Advance: the "Ready to advance?" review first, unless nothing is waiting and nothing is queued. */
  const [ready, setReady] = useState<Mode | undefined>();
  function startAdvance(m: Mode) {
    if (!readyReview(s, { answers, orders, briefSkip }).clear) { setReady(m); return; }
    setMode(m);
    setAdvancing(true);
    run(m, answers);
  }
  /** "Review first": the decisions one by one (the week turns after the last), else the first unanswered morning. */
  function reviewFirst(m: Mode) {
    setReady(undefined);
    if (unanswered.length) { setMode(m); setAdvancing(true); setEventIdx(s.pendingEvents.findIndex((e) => !answers[e.iid])); return; }
    const r = readyReview(s, { answers, orders, briefSkip });
    const day = r.mornings[0] ? Number(r.mornings[0].key.split(':')[0]) : undefined;
    setSpeed(0);
    setDayWin(Number.isFinite(day) ? day : daysOf(s).day);
  }
  function advanceAnyway(m: Mode) {
    setReady(undefined);
    setMode(m);
    setAdvancing(true);
    run(m, answers);
  }

  function choose(choiceId: string) {
    if (eventIdx === null) return;
    const ev = s.pendingEvents[eventIdx];
    const ch = ev.choices.find((c) => c.id === choiceId);
    const m = ch ? minigameOf(ch) : undefined;
    // A mini-game choice opens the scene; the answer is recorded when it ends.
    if (ch && m && opensScene(ch)) {
      setScene({ iid: ev.iid, choiceId, m });
      return;
    }
    commit(choiceId);
  }

  /** A decision answered (the decision window, the office, the review): the click says so; the outcome lands in Your File when the week turns. */
  function noteAnswer(iid: string, choiceId: string) {
    const ev = s.pendingEvents.find((e) => e.iid === iid);
    const ch = ev?.choices.find((c) => c.id === choiceId);
    if (ev && ch) feedbackApi.notify({ kind: 'decided', title: `${ev.title}: ${ch.label}`, when: 'when the week turns; the outcome lands in Your File' });
  }

  function commit(choiceId: string, moves?: string[]) {
    if (eventIdx === null) return;
    const ev = s.pendingEvents[eventIdx];
    noteAnswer(ev.iid, choiceId);
    const mv = moves ? { ...mgMoves, [ev.iid]: moves } : mgMoves;
    if (moves) setMgMoves(mv);
    const next = { ...answers, [ev.iid]: choiceId };
    setAnswers(next);
    if (!advancing) {
      setEventIdx(eventIdx + 1 < s.pendingEvents.length ? eventIdx + 1 : null);
      return;
    }
    const nextIdx = s.pendingEvents.findIndex((e) => !next[e.iid]);
    if (nextIdx >= 0) setEventIdx(nextIdx);
    else run(mode, next, false, mv);
  }

  function resetUi() {
    setAnswers({});
    setMgMoves({});
    setMgPartial({});
    setScene(null);
    setOrders([]);
    setBriefSkip([]);
    setSitdown(undefined);
    setReports(null);
    setEvenings([]);
    setDayWin(undefined);
    setEventIdx(null);
    setSheet(undefined);
    setPlanner(undefined);
    setTripPlan(undefined);
    setFleeFor(undefined);
    setNight([]);
    setReels([]);
    setAutoOpened({});
    // A new or loaded game starts with the clock moving (the opening's cards hold it until they close).
    setSpeed(timeMode() === 'clock' ? DEFAULT_SPEED : 0);
    ackedRef.current = new Set();
    setRoute({});
    setReportLog([]);
    setCtxMenu(undefined);
    setOfficeView(undefined);
    setMondayCard(false);
    try { window.scrollTo(0, 0); } catch { /* no window */ }
  }

  /** A new game from the creator (or a quick restart): always opens on the funeral. */
  function beginGame(next: GameState, n: number) {
    settledRef.current = undefined;
    // New games start each week in the Boss's Office (the setting can change it; older saves keep the desk).
    next.flags[OFFICE_HOME_FLAG] = 1;
    setCurrentSlot(n);
    setSlot(n);
    setS(next);
    resetUi();
    setMenu(undefined);
    setCues([openingCue(next)]);
    // Seen: the opening is marked in the save itself, so Continue never plays it again (playtest #7).
    next.flags[OPENING_SEEN_FLAG] = 1;
  }

  function restart(seed?: string, start: StartId = 'classic') {
    beginGame(newGameWith(seed || freshSeed(), start), slot);
  }

  function continueSlot(n: number) {
    const loaded = loadSlot(n);
    if (!loaded) return;
    settledRef.current = undefined;
    setCurrentSlot(n);
    setSlot(n);
    const opening = loaded.week <= 1 && !loaded.flags[OPENING_SEEN_FLAG];
    if (opening) loaded.flags[OPENING_SEEN_FLAG] = 1;
    setS(loaded);
    resetUi();
    restoreDesk(loadDesk(n, loaded));
    setMenu(undefined);
    if (opening) setCues([openingCue(loaded)]);
  }

  const shellUi = useShellState(s, orders, sheet);
  const [mapFocus, setMapFocus] = useState<MapFocus | undefined>();
  // Showing something on the map (a walk, a district, an alert's place) leaves the Office for the map.
  const focusMap = (f: Omit<MapFocus, 'nonce'>) => { setOfficeView(undefined); setMapFocus((x) => ({ ...f, nonce: (x?.nonce ?? 0) + 1 })); };
  const [helpMenu, setHelpMenu] = useState(false);
  /** Find… (Ctrl+K, /, the top bar): people, places, screens, things to do. */
  const [finding, setFinding] = useState(false);
  function onFind(r: FindResult) {
    setFinding(false);
    const g = r.go;
    if (g.to === 'route') { const it = itemOf(g.key); openRoute(it ? { home: it.home, key: g.key } : g.key); }
    else if (g.to === 'sheet') setSheet(g.id);
    else if (g.to === 'map') { setRoute({}); focusMap({ level: 'wildwood', ...(g.district ? { district: g.district } : {}) }); }
    else if (g.to === 'office') { setRoute({}); setOfficeView('office'); }
    // Done to a person: the family's chart, where every face opens "Deal with…".
    else openRoute({ panel: 'borgata', section: 'chart' });
  }
  /** Open a home or one of its sections, from any route the game uses (an alert can reveal one that is still hidden). */
  function openRoute(r: Route | string) {
    const n = resolveRoute(r);
    if (n.key) { shellUi.reveal(n.key); shellUi.seenSection(n.key); }
    setRoute(n);
  }
  function go(r: Route | string) {
    openRoute(r);
  }
  const briefForRail = useMemo(() => buildBriefing(s), [s]);
  const oppsForNav = useMemo(() => (route.home ? whatShouldIDo(s, 12) : []), [s, route.home]);
  const shellAlertList = useMemo(() => { const folded = coveredBy(briefForRail, briefSkip); return shellAlerts(s, alertList).filter((a) => !(shellUi.snoozed[a.key] > s.week) && !folded(a)); }, [s, alertList, shellUi.snoozed, briefForRail, briefSkip]);
  function onAlert(a: ShellAlert) {
    if (a.mapFocus) focusMap(a.mapFocus);
    if (a.kind === 'decision') { setAdvancing(false); setEventIdx(Math.max(0, s.pendingEvents.findIndex((e) => !answers[e.iid]))); }
    else if (a.charId) setSheet(a.charId);
    else if (a.route?.panel || a.route?.home) openRoute(a.route);
  }
  function onChip(c: MotionChip) {
    if (c.focus) focusMap(c.focus);
    if (c.orders) { (document.querySelector('[data-testid=orders-button]') as HTMLButtonElement | null)?.click(); return; }
    if (c.charId) setSheet(c.charId);
    else if (c.route) openRoute(c.route);
  }
  const goals = useMemo(() => guidedGoals(s, shellUi.flags), [s, shellUi.flags]);
  function showGoal(g: GuidedGoal) {
    if (g.show?.focus) focusMap({ level: g.show.focus });
    if (g.show?.route) openRoute(g.show.route);
    if (g.show?.tour) tour(g.show.tour);
  }

  const sectionCtx: SectionCtx = { pendingLaw, pendingHeir, onLaw: setPendingLaw, onHeir: setPendingHeir, go, reports: reportLog, openReports: setReports, houseSel, onHouseSel: setHouseSel };
  const housesApi = { openHouse: (id: string) => { setSheet(undefined); setHouseSel(id); openRoute({ panel: 'house', section: 'houses' }); } };
  // Your File's badge: entries written since the boss last opened it (per browser; never part of the save).
  const fileKey = `llv.fileSeen.${s.seed}`;
  const fileTop = s.journal?.seq ?? 0;
  const [fileSeen, setFileSeen] = useState<number>(() => { try { return Number(localStorage.getItem(fileKey) ?? 0) || 0; } catch { return 0; } });
  const markFileSeen = () => { setFileSeen(fileTop); try { localStorage.setItem(fileKey, String(fileTop)); } catch { /* private window */ } };
  const fileNew = Math.max(0, (s.journal?.e ?? []).filter((e) => e.mine || e.src !== 'ledger').filter((e) => seqOf(e.id) > fileSeen).length);
  const shellApi: ShellApi = { go, focus: focusMap, update: setS, act };
  const tributeApi: TributeUiApi = {
    envelope, setEnvelope,
    openAudience: (id) => {
      const pend = s.pendingEvents.findIndex((e) => e.defId === 'tribute_audience' && (!id || e.meta?.report === id));
      if (pend >= 0) { setAdvancing(false); setEventIdx(pend); return; }
      setOffice(id ?? s.tribute?.reports[s.tribute.reports.length - 1]?.id);
    },
  };
  goRef.current = go;

  const current = eventIdx !== null ? s.pendingEvents[eventIdx] : undefined;
  const brief = briefForRail;
  /** Leave the sit-down for whatever an option or a card points at. */
  function followLink(l: BriefLink) {
    setSitdown(undefined);
    if (l.event) { const i = s.pendingEvents.findIndex((e) => e.iid === l.event); if (i >= 0) { setAdvancing(false); setEventIdx(i); } }
    else if (l.office) tributeApi.openAudience();
    else if (l.trip) travelApi.plan(l.trip);
    else if (l.charId) setSheet(l.charId);
    else if (l.tab === 'map') setRoute({});
    else if (l.tab) go(l.tab);
  }
  const overlayOpen = cityOpen || vacOpen || goTo !== undefined || finding || !!ready || dayWin !== undefined || !!sitdown || ltOpen || !!office || !!ctxMenu || !!current || !!scene || !!sheet || !!planner || !!tripPlan || !!fleeFor || !!reports || !!picker || advice || !!help || helpMenu || cues.length > 0 || reels.length > 0 || night.length > 0;
  // Only a decision card holds the clock (clockPolicy.ts): the menus, sheets, drawers and the office do not.
  const busy = !!menu || !!current || !!ready || !!sitdown || !!scene || !!urgent || !!confirm || dayWin !== undefined || cues.length > 0 || reels.length > 0 || night.length > 0;
  /** One day on the clock: tonight's evening becomes a scene, then the next morning (or, after Sunday, the week turns through run()). */
  function stepDay() {
    const d = daysOf(s).day;
    const id = weekPlan(s)[d];
    if (id) {
      setEvenings((x) => [...x.slice(-1), { cue: { week: s.week, day: d, roundId: id }, s }]);
      if (pausesOn('pauseOnEvening')) { setSpeed(0); setClockNote('Paused: your evening'); }
    }
    if (d >= 6) {
      // The week turns without freezing the clock's controls: say so, let the screen paint, then turn it.
      if (turningRef.current) return;
      turningRef.current = true;
      setClockNote('The week turns…');
      setTimeout(() => { try { run('week', answers, true); } finally { turningRef.current = false; } }, 16);
      return;
    }
    const next = tickDay(s);
    setS(next);
    clockAutoPause(s, next);
    const urgent = pausesOn('pauseOnCapo') ? morningStop(next) : undefined;
    if (urgent) { setSpeed(0); setClockNote(`Paused: ${urgent}`); }
  }
  /** The clock's auto-pause (clockPolicy.ts): red on the Desk, an urgent meeting, war, a death in the house, a plot. */
  function clockAutoPause(prev: GameState, next: GameState) {
    const ui = { answers, briefSkip };
    const w = firstPause(autoPauses(prev, next, ackedRef.current, ui), (k) => pausesOn(k));
    ackedRef.current = new Set([...ackedRef.current, ...redKeys(next, ui)]);
    if (w) { setSpeed(0); setClockNote(`Paused: ${w.text}`); }
  }
  /** Play / a speed: what is red on the Desk now has been seen. */
  function playAt(v: Speed) {
    if (v > 0) ackedRef.current = new Set([...ackedRef.current, ...redKeys(s, { answers, briefSkip })]);
    setSpeed(v);
    setClockNote(undefined);
  }
  function endDay() {
    setEndDayDue(false);
    if (daysOf(s).day >= 6) { startAdvance('week'); return; }
    stepDay();
  }
  useEffect(() => {
    if (!endDayDue || confirm || s.gameOver) return;
    endDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endDayDue, s, confirm]);
  cardOpenRef.current = busy;
  ackNowRef.current = () => { ackedRef.current = new Set([...ackedRef.current, ...redKeys(s, { answers, briefSkip })]); };
  useClock({
    speed, s, busy, unanswered: getSettings().pauseOnDecision ? unanswered.length : 0,
    step: stepDay,
    onPause: (why) => {
      setSpeed(0);
      setClockNote(`Paused: ${why.toLowerCase()}`);
      if (why === 'A decision is waiting' && !busy) { setAdvancing(false); setEventIdx(s.pendingEvents.findIndex((e) => !answers[e.iid])); }
    },
  });
  const sitKey = `${s.seed}:${s.week}`;
  useEffect(() => {
    if (menu || s.gameOver || speed !== 0 || sitSeen === sitKey || daysOf(s).day > 0) return;
    if (current || scene || cues.length || reels.length || night.length || reports || sheet || planner || tripPlan || fleeFor || picker || office || ctxMenu) return;
    let seen: string | null = null;
    try { seen = sessionStorage.getItem('llv-sitdown'); } catch { /* storage unavailable */ }
    setSitSeen(sitKey);
    if (seen === sitKey) return;
    try { sessionStorage.setItem('llv-sitdown', sitKey); } catch { /* storage unavailable */ }
    // Where the week starts (Settings): the office, with the man across the desk and his briefing
    // (the sit-down is one step away, at the door); the desk's list; or the map.
    const start = weekStart(s);
    if (start === 'office') { setRoute({}); setOfficeView('office'); setMondayCard(true); return; }
    if (start === 'desk') setRoute({ home: 'desk' });
    if (getSettings().sitdownEachWeek !== false) setSitdown('council');
  }, [menu, s.gameOver, speed, sitSeen, sitKey, current, scene, cues.length, reels.length, night.length, reports, sheet, planner, tripPlan, fleeFor, picker, office, ctxMenu]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The keyboard rules (keys.ts): typing wins, a focused control keeps Space/Enter, a held key is one press.
      if (e.code === 'Space') {
        if (timeMode() !== 'clock' || !clockSpaceAllowed(e)) return;
        e.preventDefault();
        setSpeed((v) => {
          if (v === 0) ackNowRef.current();
          return v === 0 ? DEFAULT_SPEED : 0;
        });
        setClockNote(undefined);
        return;
      }
      // 1-5: the clock's speed, only while no decision card is open (inside one they pick a choice).
      if (timeMode() === 'clock' && !shortcutBlocked(e)) {
        const sp = speedKey(e.key, cardOpenRef.current);
        if (sp) { e.preventDefault(); setSpeed(sp); setClockNote(undefined); return; }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !menu) { e.preventDefault(); setFinding(true); return; }
      if (shortcutBlocked(e)) return;
      if (menu || overlayOpen) return;
      if (e.key === '?') { e.preventDefault(); setHelpMenu(true); return; }
      if (e.key === '/') { e.preventDefault(); setFinding(true); return; }
      const h = homeForKey(e.key);
      if (h) {
        e.preventDefault();
        // The letters that changed meaning with the six homes: say so once.
        if ('mrbld'.includes(e.key.toLowerCase())) {
          let seen = false;
          try { seen = localStorage.getItem('llv.keysChanged') === '1'; localStorage.setItem('llv.keysChanged', '1'); } catch { seen = true; }
          if (!seen) setClockNote(KEYS_CHANGED);
        }
        setRoute((r) => (r.home === h ? {} : { home: h }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, overlayOpen]);

  if (menu) {
    return (
      <StartMenu key={menu} initial={menu} inGame={!s.gameOver && !!loadSlot(slot)} seedHint={seedInput.trim() || undefined}
        onBack={() => setMenu(undefined)} onContinue={continueSlot} onStart={beginGame} />
    );
  }

  const motion = inMotion(s, { orders: orders.length });
  const home = route.home;
  const homeGroups = home ? shellUi.groupsOf(home) : [];
  const goalIdx = goals.findIndex((g) => !g.done);
  const badges: Partial<Record<HomeId, number>> = {};
  for (const a of shellAlertList) {
    const h = a.severity !== 'info' ? alertHome(a) : undefined;
    if (h) badges[h] = (badges[h] ?? 0) + 1;
  }
  // The Desk's badge is the one count (attention.ts): what needs you.
  { const n = deskBadge(s, { answers, briefSkip, taken: taken.week === s.week ? taken.keys : [] }).n; if (n) badges.desk = n; else delete badges.desk; }
  const morningOpen = dayCheckIns(s, daysOf(s).day).filter((c) => c.problem && !daysOf(s).answers[c.key] && !daysOf(s).skipped.includes(c.day));
  const homeDoNowAll = home ? buildDoNow(s, home, { alerts: shellAlertList, opps: oppsForNav, unanswered: unanswered.length, brief: brief.items.length, morning: { open: morningOpen.length, name: morningOpen[0]?.name, urgent: morningOpen.some((c) => c.problem!.urgent) } }) : [];
  // This Week's front page is the Boss's Desk, which lists the decisions, the morning and the sit-down: said once.
  const homeDoNow = home === 'desk' ? homeDoNowAll.filter((d) => d.act.kind !== 'decisions' && d.act.kind !== 'day' && d.act.kind !== 'sitdown') : homeDoNowAll;
  const openDecisions = () => { setAdvancing(false); setEventIdx(Math.max(0, s.pendingEvents.findIndex((e) => !answers[e.iid]))); };
  function onDoNow(d: DoNowItem) {
    const a = d.act;
    if (a.kind === 'decisions') openDecisions();
    else if (a.kind === 'sitdown') setSitdown(a.tab);
    else if (a.kind === 'day') { setSpeed(0); setDayWin(daysOf(s).day); }
    else if (a.kind === 'office') tributeApi.openAudience(a.reportId);
    else if (a.kind === 'route') openRoute(a.route);
    else if (a.kind === 'alert') onAlert(a.alert);
  }
  const navExtras = {
    'nav.settings': <SettingsPanel />,
    'nav.help': <HelpBody onAdvice={() => setAdvice(true)} onGlossary={() => setHelp({})} />,
  };
  const deskApi = {
    onEvent: (iid: string) => { setAdvancing(false); setEventIdx(Math.max(0, s.pendingEvents.findIndex((e) => e.iid === iid))); },
    onDay: (day: number) => { setSpeed(0); setDayWin(day); },
    onSitDown: () => setSitdown('council'),
    onCancelOrder: (i: number) => ordersApi.remove(i),
    onMoney: () => openRoute({ panel: 'holdings', section: 'money' }),
    onChar: (id: string) => setSheet(id),
    onLt: () => setLtOpen(true),
    onUrgent: (tip: string) => setUrgent(tip),
    onEnvelope: () => tributeApi.openAudience(),
    onTake: (key: string) => setTaken((t) => ({ week: s.week, keys: [...(t.week === s.week ? t.keys : []).filter((k) => k !== key), key] })),
    onMotion: () => (document.querySelector('[data-testid=plans-button]') as HTMLButtonElement | null)?.click(),
    onOffer: (take: boolean) => act((x) => answerOffer(x, take), take ? 'Your underboss handles the routine' : 'Kept the chain of command as it was'),
  };
  const takenKeys = taken.week === s.week ? taken.keys : [];
  const openDesk = (f: DeskFilter = 'all') => { setOfficeView(undefined); setDeskFilter(f); setRoute({ home: 'desk' }); };
  const officeApi: OfficeApi = {
    openDesk: (f?: DeskFilter) => openDesk(f),
    openEnvelope: () => tributeApi.openAudience(),
    openVisitors: () => setSitdown('council'),
    openLedger: () => openRoute({ panel: 'holdings', section: 'take' }),
    openCalendar: (day) => { setSpeed(0); setDayWin(day ?? daysOf(s).day); },
    openDecisions: openDecisions,
    openMap: () => { setRoute({}); setOfficeView(undefined); },
    openFamily: () => openRoute({ panel: 'house', section: 'tree' }),
    openNews: () => openRoute({ panel: 'chronicle', section: 'papers' }),
    openAdvance: () => startAdvance('week'),
  };
  // Plans in motion, the live alerts, the underboss's picks (ui/plans): the windows only the App opens.
  setRecentSeed(s.seed);
  const plansApi: PlansApi = {
    answers, briefSkip,
    urgent: (id) => setUrgent(id), event: deskApi.onEvent, decisions: openDecisions, day: deskApi.onDay,
    sitdown: () => setSitdown('council'), envelope: () => tributeApi.openAudience(),
    pause: (why) => { setSpeed(0); setClockNote(`Paused: ${why}`); },
    lieutenants: () => setLtOpen(true),
  };
  // The one count (engine/inbox.ts): Waiting on you, the desk and the door all say this number.
  const box = deskBadge(s, { answers, briefSkip, taken: takenKeys });
  const laterKeys = later.week === s.week ? later.keys : [];
  const officeUi = { answers, briefSkip, later: laterKeys, taken: takenKeys };
  function officeDelegate(op: DelegateOp) {
    if (op.kind === 'answer') { setAnswers((a) => ({ ...a, [op.iid]: op.choiceId })); noteAnswer(op.iid, op.choiceId); }
    else if (op.kind === 'checkin') act((x) => answerCheckIn(x, op.key, op.answer), 'Answered a capo\'s check-in');
    else ordersApi.queue(op.action);
  }
  function officeInvite(v: OfficeVisitor) {
    if (v.ref.event) deskApi.onEvent(v.ref.event);
    else if (v.ref.day !== undefined) deskApi.onDay(v.ref.day);
    else if (v.ref.brief) setSitdown('council');
    else officeApi.openCalendar();
  }
  function officeLater(v: OfficeVisitor) {
    setLater({ week: s.week, keys: [...laterKeys, v.key] });
    if (v.ref.brief && !briefSkip.includes(v.ref.brief)) setBriefSkip([...briefSkip, v.ref.brief]);
  }
  const officeScreen = s.gameOver ? undefined
    : officeView === 'office' ? <BossOffice key={s.week} s={s} ui={officeUi} monday={mondayCard} onMondayDone={() => setMondayCard(false)} onInvite={officeInvite} onDelegate={officeDelegate} onLater={officeLater} onClub={() => setOfficeView('club')} />
    : officeView === 'club' ? <SocialClub s={s} onUpstairs={() => setOfficeView('office')} onHq={() => openRoute({ panel: 'holdings', section: 'hq' })} onMap={() => setOfficeView(undefined)} />
    : undefined;
  const weekTop = home === 'desk' && !s.gameOver ? (
    <section className="mb-4" data-testid="week-routine">
      <div className="mb-3"><BossDesk key={`${s.week}:${deskFilter}`} s={s} ui={{ answers, orders, briefSkip, taken: takenKeys }} api={deskApi} filter={deskFilter} side={<RiseColumn s={s} goals={goals} onShow={showGoal} onRise={() => openRoute({ panel: 'borgata', section: 'rise' })} />} /></div>
      <div className="mb-3"><MorningReports s={s} update={act} onChar={(id) => setSheet(id)} onSettings={() => setLtOpen(true)} /></div>
      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" className="btn-ghost text-xs" onClick={() => setSitdown('council')} data-testid="week-sitdown">♜ The sit-down{brief.items.length ? ` (${brief.items.length})` : ''}</button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setSitdown('rounds')} data-testid="week-rounds">☕ Your rounds</button>
        <button type="button" className="btn-gold text-xs" onClick={() => { setRoute({}); startAdvance('week'); }} data-testid="week-advance">Advance Week ▸</button>
      </div>
      <details className="mt-3 group" data-testid="your-rounds">
        <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.25em] text-stone-500 hover:text-gold-300">Your rounds · day by day <span className="normal-case tracking-normal text-gold-400 group-open:hidden">▸ open the week</span></summary>
        <div className="mt-1.5"><WeekPlanner key={s.week} s={s} update={act} onSitDown={() => setSitdown('rounds')} /></div>
      </details>
    </section>
  ) : undefined;
  // Rackets & Businesses: "Start a racket" first, big, and who still lacks a steady earner.
  const gaps = home === 'money' && !s.gameOver ? racketGaps(s) : undefined;
  const bizTop = gaps ? (
    <section className="mb-4" data-testid="biz-start">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-gold w-full py-3 text-base" onClick={() => openRoute({ panel: 'holdings', section: 'hub' })} data-testid="biz-start-racket">♣ Start a racket</button>
        <button type="button" className="btn-gold w-full py-3 text-base bg-red-800 border-red-500 text-red-50" onClick={() => openRoute({ panel: 'holdings', section: 'dirty' })} data-testid="biz-dirty-work">✂ Dirty work</button>
      </div>
      <div className="mt-1 text-[11px] text-stone-400">{gaps.rackets} racket{gaps.rackets === 1 ? '' : 's'} running{gaps.noEarner.length ? ` · ${gaps.noEarner.length} m${gaps.noEarner.length === 1 ? 'an' : 'en'} without a steady earner` : ' · every man has his steady earner'}. Rackets pay every week; dirty work is one job, one score: hijack a truck, shake down a shop, fix a fight, move a load.</div>
    </section>
  ) : undefined;
  const youTop = home === 'life' && !s.gameOver ? <PersonalActions s={s} update={act} onWeek={() => setRoute({ home: 'desk' })} /> : undefined;
  const right = (
    <>
      <AlertsPanel alerts={shellAlertList} onAlert={onAlert} onSnooze={(a) => shellUi.snooze(a.key, s.week + 4)} />
      {!s.gameOver && <UnderbossSuggests s={s} compact />}
      {!s.gameOver && <SitDownCard s={s} b={briefForRail} onOpen={() => setSitdown('council')} onRounds={() => setSitdown('rounds')} />}
      <ThisWeekCard s={s} onReport={() => s.lastReport && setReports([s.lastReport])} hideAdvice />
      {!s.gameOver && home !== 'desk' && <GoalsCard goals={goals} onShow={showGoal} />}
      <div className="2xl:hidden"><StreetFeedCard s={s} /></div>
    </>
  );

  return (
    <OfficeContext.Provider value={officeApi}>
    <PlansContext.Provider value={plansApi}>
    <HousesNavContext.Provider value={housesApi}>
    <TributeUiContext.Provider value={tributeApi}>
    <Providers sheet={sheetApi} clarity={clarityApi} planner={plannerApi} orders={ordersApi} travel={travelApi} shell={shellApi}>
      <FeedbackContext.Provider value={feedbackApi}>
      <EmpireHost s={s} setS={setS}>
      <Shell
        top={(<>
          <TopBar s={s} inboxN={box.n} inboxTone={box.tone} clockMode={clockMode} onEndDay={() => { setSpeed(0); endDay(); }} speed={speed} setSpeed={playAt} note={clockNote}
            onAdvance={startAdvance} pending={s.pendingEvents.length} answered={s.pendingEvents.length - unanswered.length}
            urgent={urgentN} onUrgent={() => setUrgent(urgentMeetings(s)[0]?.id)}
            onReview={openDecisions}
            ticker={ticker} onNewGame={() => { setSpeed(0); setMenu('start'); }} onMainMenu={() => { setSpeed(0); setMenu('title'); }}
            seedInput={seedInput} setSeedInput={setSeedInput} slot={slot} pulse={s.week <= 4 && goalIdx >= 1 && unanswered.length === 0}
            onSitDown={() => setSitdown('council')} sitCount={brief.items.filter((it) => !briefSkip.includes(it.id)).length} onDesk={() => openDesk()}
            mornings={morningOpen.length} envelope={s.tribute?.reports[s.tribute.reports.length - 1]?.status === 'presented'}
            onRounds={() => setSitdown('rounds')} onEnvelope={() => tributeApi.openAudience()} onFind={() => setFinding(true)}
            onOffice={() => { setRoute({}); setOfficeView((v) => (v === 'office' ? undefined : 'office')); }} officeOpen={officeView === 'office'}
            fileNew={fileNew} onFile={() => { setOfficeView(undefined); markFileSeen(); go('book'); }} paperUnread={unreadCount(s)} onPaper={() => { setOfficeView(undefined); openRoute({ panel: 'chronicle', section: 'papers' }); }} />
          {!s.gameOver && <LiveAlerts s={s} running={speed > 0} />}
        </>)}
        rail={<LeftRail active={home} badges={badges} dots={shellUi.dots} locks={Object.fromEntries(HOME_IDS.map((h) => [h, homeLock(s, h)]).filter(([, r]) => r))} onOpen={(h) => setRoute((r) => (r.home === h && !r.key ? {} : { home: h }))} onHelp={() => setHelpMenu(true)} />}
        map={<MapView s={s} alerts={alertList} onAlert={() => {}} onOpenBusiness={() => go('business')} onEnvoy={(city) => plannerApi.plan('envoy', undefined, { city })} shell focus={mapFocus} />}
        overlay={(
          <>
            <div className="hidden 2xl:block absolute bottom-6 left-[340px] z-[1000] w-[320px]"><StreetFeedCard s={s} overlay /></div>
            {officeScreen}
            {!s.gameOver && !home && !officeView && (
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-16 md:top-3 z-[1005] flex justify-center" data-testid="return-home-dock">
                <ReturnHome s={s} update={setS} />
              </div>
            )}
            {/* The map's one dock: today (the clock), the club, and on phones the next goal — one stack, beside the Alerts button, never under a card. */}
            {!s.gameOver && !home && !officeView && (
              <div className="llv-dock pointer-events-none absolute left-2 right-[112px] bottom-2 md:right-auto md:bottom-3 md:left-[310px] 2xl:left-[680px] z-[1001] flex flex-col items-start gap-1.5 md:max-w-[calc(100%-330px)]" data-testid="map-dock">
                {goalIdx >= 0 && helpLevel() !== 'experienced' && (
                  <button type="button" onClick={() => showGoal(goals[goalIdx])} data-testid="goal-pill"
                    className="md:hidden pointer-events-auto max-w-full truncate rounded-full border border-gold-600/70 bg-noir-900/95 px-3 py-1.5 text-left text-[11px] text-gold-300 shadow-lg shadow-black/70">
                    ➚ {goals[goalIdx].title}
                  </button>
                )}
                <VisitPill s={s} onOpen={() => setCityOpen(true)} />
                <VacationPill s={s} onOpen={() => setVacOpen(true)} />
                <div className="flex max-w-full items-center gap-1.5">
                  {clockMode && <div className="flex min-w-0"><TodayStrip s={s} onOpen={() => { setSpeed(0); setDayWin(daysOf(s).day); }} /></div>}
                  <ClubOnMap s={s} compact onOpen={() => setOfficeView('club')} />
                </div>
              </div>
            )}
            {evenings.length > 0 && (
              <div className="pointer-events-none absolute bottom-24 md:bottom-14 right-2 z-[1130] flex flex-col items-end gap-2">
                {evenings.map((e, i) => (
                  <EveningScene key={`${e.cue.week}:${e.cue.day}`} s={e.s} cue={e.cue} older={i < evenings.length - 1} onClose={() => setEvenings((x) => x.filter((y) => y !== e))}
                    onMore={() => { setEvenings([]); setRoute({ home: 'desk' }); }} />
                ))}
              </div>
            )}
            {s.gameOver && (
              <div className="absolute inset-0 z-[1090] flex items-center justify-center bg-black/60 p-4">
                <div className="panel p-6 text-center max-w-xl" data-testid="game-over">
                  <h2 className="font-display text-3xl text-gold-400">The End of the House of {s.houseName}</h2>
                  <p className="mt-2 text-stone-300">{s.gameOver.text}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button className="btn-gold" onClick={() => setMenu('start')}>New Game…</button>
                    {(Object.keys(STARTS) as StartId[]).map((k) => (
                      <button key={k} className="btn-ghost" title={STARTS[k].text} onClick={() => restart(undefined, k)}>{STARTS[k].name}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        drawer={home && (
          <Drawer s={s} home={home} sel={route.key} groups={homeGroups} ctx={sectionCtx} fresh={shellUi.fresh} escEnabled={!overlayOpen}
            onOpen={(key) => openRoute({ home, key })} onClose={() => setRoute({})}
            doNow={homeDoNow} onDo={onDoNow} extras={navExtras} top={weekTop ?? bizTop ?? youTop} />
        )}
        right={right}
        rightIcons={<AlertsPanel alerts={shellAlertList} onAlert={onAlert} onSnooze={(a) => shellUi.snooze(a.key, s.week + 4)} iconsOnly />}
        bottom={<InMotionStrip chips={motion} onChip={onChip} />}
        alertCount={shellAlertList.length}
        danger={shellAlertList.some((a) => a.severity === 'danger')}
      />
      {shellUi.toast && <Toast text={shellUi.toast} onDone={shellUi.clearToast} />}
      {!menu && helpLevel() !== 'experienced' && <HintHost s={s} route={route} overlayOpen={overlayOpen || mondayCard} motion={motion.length} alerts={shellAlertList.length} speed={speed} />}

      {ltOpen && !s.gameOver && <WhoHandlesWhat s={s} update={act} onClose={() => setLtOpen(false)} />}
      {sitdown && !current && !scene && (
        <SitDown key={`${s.week}:${sitdown}`} s={s} initialTab={sitdown} rounds={s.days?.week === s.week && s.days.plan ? plannedRounds(s) : undefined} setRounds={(ids) => act((x) => setWeekRounds(x, ids), 'Your evenings for the week are set')} skip={briefSkip} setSkip={setBriefSkip}
          onTrust={(k, on) => act((x) => setTrust(x, k, on), on ? 'Trusted him with it' : 'Took it back into your own hands')} onLink={followLink} onClose={() => setSitdown(undefined)}
          onDecisions={() => { setSitdown(undefined); setAdvancing(false); setEventIdx(Math.max(0, s.pendingEvents.findIndex((e) => !answers[e.iid]))); }}
          lesson={helpLevel() === 'guided' && s.week <= 10 && goalIdx >= 0 && goalIdx < 7 ? { title: goals[goalIdx].title, hint: goals[goalIdx].hint, onShow: goals[goalIdx].show ? () => { setSitdown(undefined); showGoal(goals[goalIdx]); } : undefined } : undefined} />
      )}
      {current && scene && (
        <MinigameScreen
          key={scene.iid}
          s={s}
          game={scene.m.game}
          iid={scene.m.iid}
          params={scene.m.params}
          parts={scene.m.parts}
          onCancel={() => setScene(null)}
          resume={mgPartial[scene.iid]}
          onProgress={(mv) => setMgPartial((x) => ({ ...x, [scene.iid]: mv }))}
          onDone={(moves) => { const c = scene.choiceId; const iid = scene.iid; setScene(null); setMgPartial((x) => { const { [iid]: _, ...rest } = x; void _; return rest; }); commit(c, moves); }}
        />
      )}
      {current && !scene && current.defId === 'tribute_audience' && s.tribute?.reports.find((r) => r.id === current.meta?.report) && (
        <AudienceScene s={s} rep={s.tribute.reports.find((r) => r.id === current.meta?.report)!} ev={current}
          onDecide={(cid, env) => { setEnvelope(env); choose(cid); }} onClose={() => { setEventIdx(null); setAdvancing(false); }} />
      )}
      {office && !current && s.tribute?.reports.find((r) => r.id === office) && (
        <AudienceScene s={s} rep={s.tribute.reports.find((r) => r.id === office)!} onClose={() => setOffice(undefined)}
          onPolicy={(split, auto) => { ordersApi.queue({ kind: 'tribute', op: { op: 'policy', split, ...(auto !== undefined ? { auto } : {}) } }); setOffice(undefined); }} />
      )}
      {current && !scene && current.defId !== 'tribute_audience' && (
        <EventModal s={s} ev={current} index={eventIdx!} total={s.pendingEvents.length} selected={answers[current.iid]} onChoose={choose} onClose={() => { setEventIdx(null); setAdvancing(false); }} />
      )}
      <SettledToast />
      <NowResultHost />
      <ReactionsHost s={s} blocked={!!current || !!scene || !!reports || cues.length > 0} />
      {urgent && !current && !scene && (
        <UrgentMeeting s={s} id={urgent} onClose={() => setUrgent(undefined)} onPick={setUrgent}
          onMeet={(id, via) => act((x) => meetTip(x, id, via), 'You agreed to the meeting')} onIgnore={(id) => { act((x) => ignoreTip(x, id), 'You let the warning go'); setUrgent(undefined); }}
          onRespond={(id, r) => act((x) => respondTip(x, id, r), 'You gave your answer to the warning')} />
      )}
      {ready && !current && <ReadyToAdvance s={s} ui={{ answers, orders, briefSkip }} month={ready !== 'week'} onClose={() => setReady(undefined)} onReview={() => reviewFirst(ready)} onAdvance={() => advanceAnyway(ready)} onAnswer={(iid, c) => { setAnswers((x) => ({ ...x, [iid]: c })); noteAnswer(iid, c); }} />}
      {cues.length > 0 && <CutscenePlayer key={`${s.week}:${cues.map((c) => c.key).join()}`} cues={cues} onDone={() => setCues([])} />}
      {night.length > 0 && !current && !cues.length && <ElectionNight s={s} results={night} onClose={() => setNight([])} />}
      {reels.length > 0 && !cues.length && !current && <NewspaperReel key={`${reels.length}:${reels[0].headline}`} reel={reels[0]} onDone={() => setReels((x) => x.slice(1))} />}
      {reports && !current && !sheet && !planner && !cues.length && !night.length && !reels.length && <ReportModal s={s} reports={reports} onClose={() => setReports(null)} />}
      {sheet && !current && (s.characters[sheet] || !s.pol?.people[sheet]
        ? <CharacterSheet key={sheet} s={s} id={sheet} onClose={() => setSheet(undefined)} />
        : <SheetFrame onClose={() => setSheet(undefined)}><div className="flex justify-end px-3 pt-3"><button className="btn-ghost text-xs" onClick={() => setSheet(undefined)}>Close</button></div><PolSheet s={s} id={sheet} embedded onClose={() => setSheet(undefined)} onOpen={(id) => setSheet(id)} /></SheetFrame>)}
      {ctxMenu && !current && <ContextMenu s={s} id={ctxMenu.id} x={ctxMenu.x} y={ctxMenu.y} category={ctxMenu.category as MenuCategoryId | undefined} onClose={() => setCtxMenu(undefined)} />}
      {picker && !current && !sheet && <PickerModal s={s} role={picker.role} pool={picker.pool} onPick={picker.onPick} onClose={() => setPicker(undefined)} />}
      {advice && !current && !sheet && !picker && !tripPlan && <WhatToDoModal s={s} answered={s.pendingEvents.length - unanswered.length} onTab={(t) => go(t)} onClose={() => setAdvice(false)} />}
      {helpMenu && (
        <Modal onClose={() => setHelpMenu(false)}>
          <div className="p-4 space-y-2" data-testid="help-menu">
            <div className="panel-title">Help</div>
            <HelpBody onAdvice={() => { setHelpMenu(false); setAdvice(true); }} onGlossary={() => { setHelpMenu(false); setHelp({}); }} />
          </div>
        </Modal>
      )}
      {dayWin !== undefined && !current && (
        <div className="fixed inset-0 z-[1180] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={() => setDayWin(undefined)}>
          <div className="panel w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-lg p-3" onClick={(e) => e.stopPropagation()} data-testid="day-window">
            <div className="mb-2 flex items-center justify-between">
              <div className="panel-title">Your day</div>
              <button type="button" className="btn-gold px-3 py-1 text-xs" onClick={() => setDayWin(undefined)} data-testid="day-window-close">Done</button>
            </div>
            <WeekPlanner s={s} update={act} initialDay={dayWin} onSitDown={() => { setDayWin(undefined); setSitdown('rounds'); }} />
          </div>
        </div>
      )}
      {finding && <FindPalette s={s} open={shellUi.open} onPick={onFind} onClose={() => setFinding(false)} />}
      {help && <GlossaryOverlay focus={help.focus} onClose={() => setHelp(undefined)} />}
      {tripPlan && !current && !sheet && <TripPlanner key={`${tripPlan.leaderId}:${tripPlan.destId ?? ''}`} s={s} leaderId={tripPlan.leaderId} destId={tripPlan.destId} onClose={() => setTripPlan(undefined)} />}
      {fleeFor && !current && !sheet && <FleePlanner s={s} personId={fleeFor} onClose={() => setFleeFor(undefined)} />}
      {goTo !== undefined && !current && !sheet && <GoThere s={s} cityId={goTo || undefined} update={act} onClose={() => setGoTo(undefined)} onArrive={() => { setGoTo(undefined); setCityOpen(true); }} />}
      {cityOpen && !current && !sheet && goTo === undefined && <CityScreen s={s} update={act} onClose={() => setCityOpen(false)} />}
      {vacOpen && !current && !sheet && !cityOpen && <VacationScreen s={s} update={act} onClose={() => setVacOpen(false)} />}
      {planner && !current && !sheet && <SchemePlanner s={s} kind={planner.kind} targetId={planner.targetId} initial={planner.opts} onClose={() => setPlanner(undefined)} />}
      {confirm && <ConfirmOrder s={s} action={confirm} onNo={() => setConfirm(undefined)} onYes={() => { const a = confirm; setConfirm(undefined); ordersApi.queue(a, true); }} onTomorrow={() => { const a = confirm; setConfirm(undefined); queueLater(a); }} onNeverAsk={() => { setSettings({ confirmOrders: false }); const a = confirm; setConfirm(undefined); ordersApi.queue(a, true); }} />}
      {toast && <OrderToast s={s} item={toast} onClose={closeToast} onUndo={() => {
        setOrders((o) => o.filter((_, j) => j !== toast.index));
        const tm = toast.time;
        if (tm) setS((cur) => (tm.bookedDay !== undefined ? unbook(cur, tm.bookedDay, tm.hours) : refundTime(cur, tm.hours, tm.late, tm.missedDinner)));
        setEndDayDue(false);
        setToast(undefined);
      }}
        onApprove={() => { setOrders((o) => o.map((x, j) => (j === toast.index ? { ...x, fund: 'family' } : x))); setToast({ ...toast, action: { ...toast.action, fund: 'family' }, short: 0, at: Date.now() }); }} />}
      {feedback && !toast && <FeedbackToast item={feedback} onClose={closeFeedback} />}
      </EmpireHost>
      </FeedbackContext.Provider>
    </Providers>
    </TributeUiContext.Provider>
    </HousesNavContext.Provider>
    </PlansContext.Provider>
    </OfficeContext.Provider>
  );
}

/** Pulse a tour target ("Show me"): by data-tour, then by data-testid. */
function tour(id: string) {
  let n = 0;
  const tick = () => {
    const el = id.startsWith('text:')
      ? [...document.querySelectorAll('.panel-title, h2, h3')].find((x) => x.textContent?.trim() === id.slice(5))
      : document.querySelector(`[data-tour="${id}"]`) ?? document.querySelector(`[data-testid="${id}"]`);
    if (!el) { if (n++ < 10) setTimeout(tick, 120); return; }
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    el.classList.add('llv-tour');
    setTimeout(() => el.classList.remove('llv-tour'), 4200);
  };
  setTimeout(tick, 60);
}
