import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { acceptSettlement, mayCommit, type SettledMark } from '../engine/settle';
import { sameOrder } from './verbs';
import { nextConfirms } from './confirmQueue';
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
import { autoPauses, budgetPause, dayKey, DEFAULT_SPEED, firstPause, IMMEDIATE, redKeys, speedKey, type PauseLedger } from './clockPolicy';
import { advanceDay, answerMoment, eventOut, eventsOut, liveMoments, releaseAll } from '../engine/daily';
import { callBack, callBackView, markMissedSeen, momentKicker, phoneBadge, ringing, tipOfMoment } from '../engine/phone';
import { dial } from '../engine/phoneMeet';
import { PhoneButton, PhoneWindow } from './phone/PhoneWindow';
import { PlannerButton, PlannerHost } from './planner/PlannerHost';
import { openPlanner } from './planner/ink';
import { StrikeCard } from './components/StrikeCard';
import { SchemePlanner } from './components/Schemes';
import { CharacterSheet } from './components/CharacterSheet';
import { EventModal } from './components/EventModal';
import { DeskTop } from './desk/DeskTop';
import { delegatedAnswers } from '../engine/delegation';
import { NowResultHost, postNow, ResultQueue } from './deeds/NowResult';
import { DateTalkHost } from './dating/DateTalk';
import { LoyaltyFloaters } from './components/Loyalty';
import { weekResultCards } from './deeds/weekResults';
import type { NowResult } from '../engine/deeds/now';
import { actNow, instant } from '../engine/actNow';
import { isHeavy } from '../engine/heavy';
import { ReactionsHost } from './reactions/Reactions';
import { nextReactions } from '../engine/reactions';
import { ArgueHost } from './argue/ArgueWindow';
import { ReportModal } from './components/ReportModal';
import type { ClarityApi } from './clarity/context';
import { PickerModal } from './clarity/CandidatePicker';
import { GlossaryOverlay } from './clarity/Glossary';
import { WhatToDoModal } from './clarity/WhatToDo';
import type { Candidate, Role } from '../engine/candidates';
import { currentSlot, loadDesk, loadSlot, saveDesk, saveSlot, setCurrentSlot, type DeskState } from './save';
import { StartMenu, type MenuScreen } from './menu/StartMenu';
import { registerAppearances } from './portrait/genes';
import { type Settings, applySettings, getSettings, newGameTimeMode, setSettings, helpLevel, OFFICE_HOME_FLAG, OPENING_SEEN_FLAG, SIMPLE_VIEW_FLAG, pausesOn, timeMode, weekStart } from './settings';
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
import { homeForKey, HOMES_BY_ID, itemOf, KEYS_CHANGED, CHANGED_LETTERS, resolveRoute, type NavRoute } from './shell/nav';
import { homeLock } from './shell/unlocks';
import { can, inTheRanks } from '../engine/rankView';
import { PlaceStrip } from './borgata/YourPlace';

/** Scenes that open by themselves, once: the opening, and the low starts' making and sit-down (valente.ts). */
const AUTO_SCENES = ['made_boss', 'low_made', 'low_callin'];
import { HOME_IDS } from './shell/routes';
import { alertHome, doNow as buildDoNow, type DoNowItem } from './shell/doNow';
import { racketGaps } from '../engine/racketMenu';
import { HelpBody } from './shell/ShellHelp';
import { SettingsPanel } from './menu/StartMenu';
import { difficultyOf, knobs, setDifficulty } from '../engine/difficulty';
import { defaultSpan, turnLine, turnSteps, type TurnSpan } from '../engine/turn';
import { crisisAt, type TurnStop } from '../engine/turnCrisis';
import { spanDiff, type DiffLine } from '../engine/weekDiff';
import { SpanReport } from './components/SpanReport';
import { whatShouldIDo } from '../engine/opportunities';
import { Providers } from './shell/Providers';
import type { MapFocus, ShellApi } from './shell/context';
import { Shell } from './shell/Shell';
import { TopBar } from './shell/TopBar';
import { LeftRail } from './shell/LeftRail';
import { Drawer, type FrontApi } from './shell/Drawer';
import { roundOf } from './shell/round';
import { RoundStrip } from './shell/FrontBands';
import { FindPalette } from './shell/Find';
import type { FindResult } from './shell/find';
import { AlertsPanel, GoalsCard, StreetFeedCard, ThisWeekCard } from './shell/RightRail';
import { InMotionStrip } from './shell/InMotionStrip';
import { inMotion, type MotionChip } from './shell/inMotion';
import { shellAlerts, type ShellAlert } from './shell/alertRoutes';
import { guidedGoals, type GuidedGoal } from './shell/goals';
import { useShellState } from './shell/useShellState';
import { HintHost, Toast } from './shell/HintHost';
import { Modal, Overlay } from './components/Modal';
import { SheetFrame } from './shell/SheetFrame';
import { PolSheet } from './cityhall/CityHall';
import { ContextMenu } from './sheet/InteractionMenu';
import { AudienceScene } from './tribute/AudienceScene';
import { TributeUiContext, type TributeUiApi } from './tribute/context';
import type { EnvelopeChoice } from '../engine/tributeOps';
import { EmpireHost } from './empire/context';
import { briefing as buildBriefing, setTrust, type BriefLink } from '../engine/briefing';
import { dayCheckIns } from '../engine/checkins';
import { daysOf, plannedRounds, setWeekRounds, weekChoices, weekPlan } from '../engine/days';
import { bookLater, refundTime, spendTime, timeBlock, unbook } from '../engine/timeCost';
import { extraToday, markExtraShown, unreadCount } from '../engine/paper';
import { WeekPlanner } from './rounds/WeekPlanner';
import { EveningScene, PersonalActions, TodayStrip, type EveningCue } from './rounds/RoundsBits';
import { SitDown } from './sitdown/SitDown';
import { BossDesk, openItem, ReadyToAdvance, type DeskFilter } from './desk/BossDesk';
import type { SettledRow, WeekDone } from './desk/Bundles';
import { handleWeekPlan, type WeekPlanRow } from '../engine/bundles';
import { WeekTurning } from './components/WeekTurning';
import { RiseColumn } from './borgata/TheRise';
import { ChairCard, useChairView } from './power/ChairCard';
import { readyReview } from '../engine/desk';
import { ignoreTip, markTipsSeen, meetTip, respondTip, unseenUrgent, urgentCount, urgentMeetings } from '../engine/threats';
import { UrgentMeeting } from './components/UrgentMeeting';
import { OfficeContext, type OfficeApi } from './desk/officeApi';
import { coveredBy, SitDownCard } from './sitdown/SitDownCard';
import { BossOffice } from './office/BossOffice';
import { Celebration } from './components/Celebration';
import { requestStoreMode } from './store/StorePanel';
import { AssetImg } from './hood/AssetImg';
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
/** The span picker remembers the boss's own choice per save (a per-browser convenience; the default is engine/turn.ts defaultSpan). */
function loadTurnSpan(seed: string): TurnSpan | undefined {
  try { const v = Number(localStorage.getItem(`llv.turnSpan.${seed}`)); return v === 1 || v === 2 || v === 4 ? v : undefined; } catch { return undefined; }
}
function saveTurnSpan(seed: string, n: TurnSpan): void {
  try { localStorage.setItem(`llv.turnSpan.${seed}`, String(n)); } catch { /* not remembered */ }
}
/** One painted frame, then the rest of the task queue (a turn yields between its weeks). */
function nextFrame(): Promise<void> {
  if (import.meta.env.MODE === 'test' || typeof requestAnimationFrame === 'undefined') return Promise.resolve();
  return new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
}

/** How far Advance goes: a week, a month, a season (no stops), or a turn of 1/2/4 weeks that stops for a crisis (STREAMLINE_2 §5). */
type Mode = 'week' | 'month' | 'season' | 'turn';

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
  /** What "Handle the week for me" settled this week (UI-only; gone when the week turns). */
  const [weekDone, setWeekDone] = useState<WeekDone | undefined>();
  /** A scene left half-way (a reload, Back to the decision): its moves so far, so it resumes there. */
  const [mgPartial, setMgPartial] = useState<Record<string, string[]>>(() => boot.desk?.partial ?? {});
  const [scene, setScene] = useState<{ iid: string; choiceId: string; m: NonNullable<ReturnType<typeof minigameOf>> } | null>(null);
  const [eventIdx, setEventIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('week');
  const [advancing, setAdvancing] = useState(false);
  const [reports, setReports] = useState<WeeklyReport[] | null>(null);
  const [reportLog, setReportLog] = useState<WeeklyReport[]>([]);
  const [route, setRoute] = useState<NavRoute>({});
  // The Round (shell/round.ts): which homes' front pages he looked at this turn (kept with the desk, per week).
  const [visited, setVisited] = useState<{ week: number; homes: string[] }>(() => ({ week: boot.st.week, homes: boot.desk?.visited ?? [] }));
  const visitedNow = visited.week === s.week ? visited.homes : [];
  useEffect(() => {
    const h = route.home;
    if (!h || h === 'desk' || route.key || visitedNow.includes(h)) return;
    setVisited({ week: s.week, homes: [...visitedNow, h] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.home, route.key, s.week]);
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
  // The Sit-Down item a Desk row asked to hear ("Hear him out" on Paolo's future).
  const [sitFocus, setSitFocus] = useState<string | undefined>();
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
      // "Are you sure?" only for a heavy order (engine/heavy.ts: a death, a war, disinheriting, selling a place,
      // a big share of the Family's money); everything else is given on the card. Tests skip it.
      if (!confirmed && getSettings().confirmOrders !== false && import.meta.env.MODE !== 'test' && isHeavy(s, a)) { setConfirm(a); return; }
      // A double click is one order: the same order again within a moment is ignored.
      const now = Date.now();
      if (lastQueued.current && now - lastQueued.current.at < 600 && sameOrder(lastQueued.current.a, a)) return;
      lastQueued.current = { a, at: now };
      // Someone who is there (a deed, a talk, an ask, a gift): settled now, on the deeds' own dice; the result card shows the roll.
      if (instant(s, a)) {
        const r = actNow(s, a);
        if (r.result.ok) setS(r.state);
        postNow(r.result);
        return;
      }
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
  // "Are you sure?" waits in line (confirmQueue.ts): two orders given at once each get their own window.
  const [confirms, setConfirms] = useState<PlayerAction[]>([]);
  const confirm = confirms[0];
  const setConfirm = useCallback((a: PlayerAction | undefined) => setConfirms((q) => nextConfirms(q, a)), []);
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
  const [speed, setSpeed] = useState<Speed>(() => (timeMode() === 'clock' && boot.st.week > 1 ? DEFAULT_SPEED : 0));
  // Red Desk items the clock already stopped for (it stops once per item).
  const ackedRef = useRef<Set<string>>(new Set());
  const turningRef = useRef(false);
  // The day's pause budget (clockPolicy.ts budgetPause: DAILY_LOGIC B2).
  const pauseLedgerRef = useRef<PauseLedger | undefined>(undefined);
  // A threat striking now (threats.ts): the clock waits on the boss's answer.
  const [strike, setStrike] = useState<string | undefined>();
  // The first week's Sunday stop has been made (once per game).
  const firstWeekNoted = useRef(false);
  // The phone (phone.ts): its window, and a call being returned from the missed list.
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [backId, setBackId] = useState<string | undefined>();
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
  // The week's result cards (deeds/weekResults.ts), shown after its scenes.
  const [weekResults, setWeekResults] = useState<NowResult[]>([]);

  // The scripted scenes (Made the boss) open by themselves, once.
  const [autoOpened, setAutoOpened] = useState<Record<string, boolean>>(() => Object.fromEntries((boot.desk?.auto ?? []).map((k) => [k, true])));
  // The desk is saved as it changes, so a reload or Continue keeps this week's orders and answers.
  useEffect(() => {
    if (menu) return;
    saveDesk(slot, { seed: s.seed, week: s.week, orders, answers, moves: mgMoves, partial: mgPartial, visited: visitedNow, auto: Object.keys(autoOpened).filter((k) => autoOpened[k]) });
  }, [menu, slot, s.seed, s.week, orders, answers, mgMoves, mgPartial, autoOpened, visited]);
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
    const i = s.pendingEvents.findIndex((e) => AUTO_SCENES.includes(e.defId) && !answers[e.iid] && !autoOpened[e.iid]);
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

  // A decision comes out on its day (daily.ts): the counts and the "next decision" only see what is out.
  const outEvents = useMemo(() => eventsOut(s), [s]);
  const unanswered = useMemo(() => outEvents.filter((e) => !answers[e.iid]), [outEvents, answers]);
  const firstOpen = (ans: Record<string, string>) => s.pendingEvents.findIndex((e) => !ans[e.iid] && eventOut(s, e));
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
  // "How they took it" or an argument waiting: an urgent meeting waits behind it (never under it).
  const rxWaiting = !!nextReactions(s) || !!s.argue?.live || weekResults.length > 0;
  /** Answered: the meeting closes, and the next one still waiting on the boss (if any) takes its place. */
  const nextUrgent = (done: string) => urgentMeetings(s).find((u) => u.id !== done && (u.status === 'waiting' || !u.response))?.id;

  const settledRef = useRef<SettledMark | undefined>(undefined);
  function run(m: Mode, a: Record<string, string>, quiet = false, moves: Record<string, string[]> = mgMoves) {
    // The one place a week's choices are built (the clock and Advance Week alike): the days plan supplies the evenings and the mornings.
    // What the boss's standing orders settle for him (delegation.ts: small asks by the consigliere's pick, the envelope by the underboss's advice).
    const choices: PlayerChoices = weekChoices(s, { choices: { ...delegatedAnswers(s, a, takenKeys), ...a }, successionLaw: pendingLaw, designatedHeirId: pendingHeir, actions: orders, minigames: moves, ...(envelopeRef.current ? { envelope: envelopeRef.current } : {}), ...(briefSkip.length ? { briefingSkip: briefSkip } : {}) });
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
      // The jobs and the pushes come back as result cards: the dice and what happened, not one Results line.
      setWeekResults(weekResultCards(s, r.state, orders));
      // The first week's "waits for you" note goes with the first week.
      setClockNote((n) => (n && /^Paused: (your first week|Sunday of your first week)/.test(n) ? undefined : n));
      setNight(r.state.pol?.results.filter((x) => x.week >= s.week) ?? []);
      setCues(cutscenesBetween(s, r.state).filter(cueFilter));
      setReels(r.state.mg?.reels ?? []);
      if (quiet) {
        setTicker(tickerLine(r.report));
        // Monday stops once (DAILY_LOGIC #7): the week's warnings, headlines and an urgent morning are folded
        // into the one pause that opens the Sit-Down; red, war and death still stop it on their own.
        const ui = { answers: {}, briefSkip: [] as string[] };
        const w = firstPause(autoPauses(s, r.state, ackedRef.current, ui), (k) => pausesOn(k));
        ackedRef.current = new Set([...ackedRef.current, ...redKeys(r.state, ui)]);
        const warn = newWarnings(s, r.state);
        const heads = weekHeadlines(s, r.state).filter((h) => pausesOn(h.kind === 'hit' ? 'pauseOnViolence' : h.kind === 'arrest' ? 'pauseOnArrest' : 'pauseOnLife'));
        const urgent = pausesOn('pauseOnCapo') ? morningStop(r.state) : undefined;
        const why = w?.text ?? heads[0]?.text ?? ((warn.length || r.state.cutscenes?.length) && getSettings().pauseOnWarning ? (warn[0] ?? 'the week turned') : undefined) ?? urgent;
        if (why) pauseFor(r.state, w?.cat ?? 'warning', `the Sit-Down: ${why}`);
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

  /** The week's turn takes a moment on a slow machine: "The week is turning…" is on screen before the work starts, and goes when it is done. */
  const [turning, setTurning] = useState(false);
  function turnWeek(f: () => void) {
    if (import.meta.env.MODE === 'test' || typeof requestAnimationFrame === 'undefined') { f(); return; }
    setTurning(true);
    // Two frames: the indicator is painted before the (synchronous) week runs.
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { try { f(); } finally { setTurning(false); } }, 0)));
  }
  /**
   * A TURN (STREAMLINE_2 §5; engine/turn.ts): 1, 2 or 4 weeks as one, built on a local state and committed
   * ONCE (one setS, so one save) at the end or at the crisis that stopped it. Between weeks it yields a frame,
   * so "Week 2 of 4" paints and "Stop after this week" can be pressed. The settled mark is set BEFORE the
   * first yield, so a second click (or the clock) can never commit the same span twice (engine/settle.ts).
   */
  const [turnSpan, setTurnSpanState] = useState<TurnSpan | undefined>(() => loadTurnSpan(boot.st.seed));
  const spanNow: TurnSpan = turnSpan ?? defaultSpan(s);
  useEffect(() => { setTurnSpanState(loadTurnSpan(s.seed)); }, [s.seed]);
  const pickSpan = (n: TurnSpan) => { setTurnSpanState(n); saveTurnSpan(s.seed, n); };
  const [turnProg, setTurnProg] = useState<{ done: number; of: number; line: string } | undefined>();
  const stopAfterRef = useRef(false);
  const [spanDone, setSpanDone] = useState<{ from: number; to: number; line: string; lines: DiffLine[]; reports: WeeklyReport[]; stop?: TurnStop } | undefined>();
  async function runSpan(weeks: number, a: Record<string, string>, moves: Record<string, string[]> = mgMoves) {
    const start = s;
    if (!mayCommit(settledRef.current, start)) return;
    const choices: PlayerChoices = weekChoices(start, { choices: { ...delegatedAnswers(start, a, takenKeys), ...a }, successionLaw: pendingLaw, designatedHeirId: pendingHeir, actions: orders, minigames: moves, ...(envelopeRef.current ? { envelope: envelopeRef.current } : {}), ...(briefSkip.length ? { briefingSkip: briefSkip } : {}) });
    settledRef.current = { seed: start.seed, week: start.week };
    stopAfterRef.current = false;
    setSpeed(0);
    const ui = { answers: {}, briefSkip: [] as string[] };
    let acked = new Set(ackedRef.current);
    let ledger = pauseLedgerRef.current;
    // What stops it: the same switches and the same day's budget as the running clock.
    const stop = (prev: GameState, next: GameState): TurnStop | undefined => {
      let why: TurnStop | undefined = crisisAt(prev, next, { on: (k) => pausesOn(k as keyof Settings), acked, ui });
      if (!why) {
        const h = weekHeadlines(prev, next).find((x) => pausesOn(x.kind === 'hit' ? 'pauseOnViolence' : x.kind === 'arrest' ? 'pauseOnArrest' : 'pauseOnLife'));
        if (h) why = { cat: h.kind === 'hit' ? 'war' : h.kind === 'arrest' ? 'feds' : 'death', text: h.text };
      }
      if (!why || why.cat === 'chair') return why;
      const b = budgetPause(ledger, dayKey(next), why.cat, knobs(next).dayPauses);
      if (!b.ok) return undefined;
      ledger = b.ledger;
      return why;
    };
    // Weeks 2+: what he left is settled by his standing orders and the delegation level (delegation.ts), else each event's default.
    const later = (x: GameState): PlayerChoices => weekChoices(x, { choices: delegatedAnswers(x, {}, []) });
    const reports: WeeklyReport[] = [];
    let first: GameState | undefined;
    let end = start;
    let why: TurnStop | undefined;
    let of = weeks;
    for (const step of turnSteps(start, weeks, choices, { stop, later })) {
      reports.push(step.report);
      end = step.state;
      of = step.of;
      first ??= step.state;
      acked = new Set([...acked, ...redKeys(step.state, ui)]);
      if (step.stop) { why = step.stop; break; }
      if (step.done >= step.of) break;
      if (stopAfterRef.current) { why = { cat: 'red', text: 'you stopped the turn' }; break; }
      setTurnProg({ done: step.done, of: step.of, line: step.report.lines.find((l) => l.stat === 'money')?.label ?? 'the envelope is counted' });
      await nextFrame();
    }
    ackedRef.current = acked;
    pauseLedgerRef.current = ledger;
    setTurnProg(undefined);
    // One commit, one save.
    setS((cur) => acceptSettlement(cur, start, end));
    setReportLog((l) => [...l, ...reports].slice(-26));
    if (first) setWeekResults(weekResultCards(start, first, orders));
    setNight(end.pol?.results.filter((x) => x.week >= start.week) ?? []);
    setCues(cutscenesBetween(start, end));
    setReels(end.mg?.reels ?? []);
    const res = { weeks: reports.length, of, stop: why };
    if (reports.length > 1 || why) setSpanDone({ from: start.week, to: start.week + reports.length - 1, line: turnLine(res), lines: spanDiff(start, end, reports), reports, stop: why });
    if (why && why.cat !== 'chair') setClockNote(`Stopped: ${why.text}`);
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
  /** Run what Advance asked for: a turn goes week by week (it yields); the rest as before. */
  function go2(m: Mode, a: Record<string, string>, moves: Record<string, string[]> = mgMoves) {
    if (m === 'turn') {
      setTurning(true);
      void runSpan(spanNow, a, moves).finally(() => setTurning(false));
      return;
    }
    turnWeek(() => run(m, a, false, moves));
  }

  /** Advance: the "Ready to advance?" review first, unless nothing is waiting and nothing is queued. */
  const [ready, setReady] = useState<Mode | undefined>();
  function startAdvance(m: Mode) {
    // Skipping the rest of the week brings out what it still held (daily.ts): the review lists it.
    const out = releaseAll(s);
    if (out !== s) { setS(out); setReady(m); return; }
    if (!readyReview(s, { answers, orders, briefSkip, taken: takenKeys }).clear) { setReady(m); return; }
    setMode(m);
    setAdvancing(true);
    go2(m, answers);
  }
  /** "Review first": the decisions one by one (the week turns after the last), else the first unanswered morning. */
  function reviewFirst(m: Mode) {
    setReady(undefined);
    if (unanswered.length) { setMode(m); setAdvancing(true); setEventIdx(firstOpen(answers)); return; }
    const r = readyReview(s, { answers, orders, briefSkip, taken: takenKeys });
    const day = r.mornings[0] ? Number(r.mornings[0].key.split(':')[0]) : undefined;
    setSpeed(0);
    setDayWin(Number.isFinite(day) ? day : daysOf(s).day);
  }
  function advanceAnyway(m: Mode) {
    setReady(undefined);
    setMode(m);
    setAdvancing(true);
    go2(m, answers);
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
      // On to the next decision that is out and still open (answered cards don't come back), else close.
      const after = s.pendingEvents.findIndex((e, j) => j > eventIdx && eventOut(s, e) && !next[e.iid]);
      const any = after >= 0 ? after : s.pendingEvents.findIndex((e) => eventOut(s, e) && !next[e.iid]);
      setEventIdx(any >= 0 ? any : null);
      return;
    }
    const nextIdx = firstOpen(next);
    if (nextIdx >= 0) setEventIdx(nextIdx);
    else { setEventIdx(null); go2(mode, next, mv); }
  }

  function resetUi(st?: GameState) {
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
    setWeekResults([]);
    setAutoOpened({});
    // Nothing carries over from the last game: its ticker line, its clock note, its open windows.
    setTicker(undefined);
    setClockNote(undefined);
    setUrgent(undefined);
    setReady(undefined);
    setOffice(undefined);
    setToast(undefined);
    setFeedback(undefined);
    // A loaded game starts with the clock moving (the opening's cards hold it until they close). The first week
    // starts paused: it never runs out under a player who has not read his first card (the playthrough lost week 1
    // three times in five starts). Space or ▶ starts it.
    const first = !st || st.week <= 1;
    setSpeed(timeMode() === 'clock' && !first ? DEFAULT_SPEED : 0);
    firstWeekNoted.current = false;
    if (first && timeMode() === 'clock') setClockNote('Paused: your first week waits for you. Press ▶ or Space when you are ready');
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
    // New games open in Simple view (the setting, or a screen's own switch, still wins).
    next.flags[SIMPLE_VIEW_FLAG] = 1;
    // Story plays in turns for a player who never picked a time mode (settings.ts newGameTimeMode); Don and Grand keep the clock.
    if (newGameTimeMode(difficultyOf(next)) === 'turns') setSpeed(0);
    setCurrentSlot(n);
    setSlot(n);
    setS(next);
    resetUi(next);
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
    resetUi(loaded);
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
    else if (g.to === 'planner') window.dispatchEvent(new CustomEvent('llv-open-planner', { detail: { tab: g.page } }));
    else if (g.to === 'menu') setCtxMenu({ id: g.id, category: g.category, x: 80, y: 120 });
    else if (g.to === 'hit') plannerApi.plan('murder', g.id);
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
    if (a.kind === 'decision') { setAdvancing(false); setEventIdx(Math.max(0, firstOpen(answers))); }
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
  // Per game: a new or loaded game reads its own mark; a game this browser never opened starts with its back history read
  // (the playthrough's "99+ new" right after a start was the opening's history, not news).
  useEffect(() => {
    let v: number | undefined;
    try { const r = localStorage.getItem(fileKey); v = r === null ? undefined : Number(r) || 0; } catch { v = undefined; }
    if (v === undefined) { v = s.journal?.seq ?? 0; try { localStorage.setItem(fileKey, String(v)); } catch { /* private window */ } }
    setFileSeen(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);
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
  const busy = !!menu || !!current || !!ready || !!sitdown || !!scene || !!urgent || !!strike || !!backId || !!confirm || dayWin !== undefined || cues.length > 0 || reels.length > 0 || night.length > 0;
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
      turnWeek(() => { try { run('week', answers, true); setClockNote('A new week: what came of your orders is on the Desk, under Results'); } finally { turningRef.current = false; } });
      return;
    }
    // The day turns (daily.ts): the day's held decisions come out, today's threats strike.
    const day = advanceDay(s);
    let next = day.state;
    // The quiet ones landed on their own: a line on the ticker (the full story is in Your File).
    if (day.landed.length) setTicker(`${day.landed[day.landed.length - 1].title}: ${day.landed[day.landed.length - 1].line}`);
    // Everything that wants the clock stopped this morning: one stop (the most pressing reason), within the day's budget.
    const whys: { cat: string; text: string }[] = [];
    if (day.strikes.length) {
      setStrike(day.strikes[0]);
      const k = momentKicker(next, day.strikes[0]);
      whys.push({ cat: 'strike', text: k ? (k === 'The meet' ? 'your meet' : 'the phone is ringing') : 'it is happening now' });
    }
    const w = autoWhy(s, next);
    if (w) whys.push(w);
    const urgent = pausesOn('pauseOnCapo') ? morningStop(next) : undefined;
    if (urgent) whys.push({ cat: 'capo', text: urgent });
    // EXTRA! A front page about the violence comes out this morning: a headline card when the clock stops for it (or stops anyway).
    const ex = extraToday(next);
    if (ex) {
      next = markExtraShown(next, ex.id);
      if (pausesOn('pauseOnViolence')) whys.push({ cat: 'extra', text: ex.h ?? 'EXTRA!' });
    }
    setS(next);
    // The week's turn is never a surprise: Sunday says it is coming.
    if (daysOf(next).day >= 6) setClockNote('Sunday: the week turns tonight at midnight (Space pauses)');
    // The first week never turns by itself: the clock stops on its Sunday and waits for the player's word.
    if (daysOf(next).day >= 6 && next.week <= 1 && !firstWeekNoted.current) {
      firstWeekNoted.current = true;
      setSpeed(0);
      setClockNote('Paused: Sunday of your first week. The week turns tonight; press ▶ (or Advance Week) when you are ready');
    }
    const stopped = pauseOnce(next, whys);
    if (ex && stopped && pausesOn('pauseOnViolence')) setCues((c) => [...c, { key: 'extra', title: 'EXTRA!', text: `${ex.h ?? ''}. ${ex.b}`, week: next.week }]);
  }
  /** One stop for a morning's reasons: an immediate one (clockPolicy.ts IMMEDIATE) first, else the first; within the day's budget. */
  function pauseOnce(at: GameState, whys: { cat: string; text: string }[]): boolean {
    if (!whys.length) return false;
    const top = whys.find((x) => IMMEDIATE.has(x.cat)) ?? whys[0];
    const b = budgetPause(pauseLedgerRef.current, dayKey(at), top.cat, knobs(at).dayPauses);
    if (!b.ok) return false;
    pauseLedgerRef.current = b.ledger;
    setSpeed(0);
    setClockNote(`Paused: ${top.text}`);
    return true;
  }
  /** Stop the clock, within the day's pause budget (clockPolicy.ts budgetPause): red, urgent, war, death and a strike always stop it. */
  function pauseFor(at: GameState, cat: string, text: string) {
    const b = budgetPause(pauseLedgerRef.current, dayKey(at), cat, knobs(at).dayPauses);
    if (!b.ok) return;
    pauseLedgerRef.current = b.ledger;
    setSpeed(0);
    setClockNote(`Paused: ${text}`);
  }
  /** The clock's auto-pause reason (clockPolicy.ts): red on the Desk, an urgent meeting, war, a death in the house, a plot. */
  function autoWhy(prev: GameState, next: GameState): { cat: string; text: string } | undefined {
    const ui = { answers, briefSkip };
    const w = firstPause(autoPauses(prev, next, ackedRef.current, ui), (k) => pausesOn(k));
    ackedRef.current = new Set([...ackedRef.current, ...redKeys(next, ui)]);
    return w ? { cat: w.cat, text: w.text } : undefined;
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
      if (why === 'A decision is waiting' && !busy) { setAdvancing(false); setEventIdx(firstOpen(answers)); }
    },
  });
  const sitKey = `${s.seed}:${s.week}`;
  useEffect(() => {
    if (menu || s.gameOver || speed !== 0 || sitSeen === sitKey || daysOf(s).day > 0) return;
    if (current || scene || cues.length || reels.length || night.length || reports || sheet || planner || tripPlan || fleeFor || picker || office || ctxMenu || rxWaiting) return;
    let seen: string | null = null;
    try { seen = sessionStorage.getItem('llv-sitdown'); } catch { /* storage unavailable */ }
    setSitSeen(sitKey);
    if (seen === sitKey) return;
    try { sessionStorage.setItem('llv-sitdown', sitKey); } catch { /* storage unavailable */ }
    // Where the week starts (Settings): the office, with the man across the desk and his briefing
    // (the sit-down is one step away, at the door); the desk's list; or the map.
    const start = weekStart(s);
    // Below the chair (rankView.ts) there is no Office upstairs and no council sit-down: the week starts at the Desk.
    if (start === 'office' && can(s, 'office')) { setRoute({ home: 'desk' }); setOfficeView('office'); setMondayCard(true); return; }
    if (start === 'desk' || (start === 'office' && !can(s, 'office'))) setRoute({ home: 'desk' });
    if (getSettings().sitdownEachWeek !== false && can(s, 'sitdown')) setSitdown('council');
  }, [menu, s.gameOver, speed, sitSeen, sitKey, current, scene, cues.length, reels.length, night.length, reports, sheet, planner, tripPlan, fleeFor, picker, office, ctxMenu, rxWaiting]);
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
        // The letters that changed meaning with the seven homes: say so once.
        if (CHANGED_LETTERS.includes(e.key.toLowerCase())) {
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

  // The result card's "In Your File ▸".
  useEffect(() => {
    const on = () => { setOfficeView(undefined); markFileSeen(); go('book'); };
    window.addEventListener('llv-open-file', on);
    return () => window.removeEventListener('llv-open-file', on);
  });
  // The phone on the Desk's painting (and anywhere else that wants it): the phone window.
  useEffect(() => {
    const on = () => setPhoneOpen(true);
    window.addEventListener('llv-open-phone', on);
    return () => window.removeEventListener('llv-open-phone', on);
  });

  const chair = useChairView(s);
  if (menu) {
    return (
      <StartMenu key={menu} initial={menu} inGame={!s.gameOver && !!loadSlot(slot)} seedHint={seedInput.trim() || undefined}
        onBack={() => setMenu(undefined)} onContinue={continueSlot} onStart={beginGame} />
    );
  }

  const motion = inMotion(s, { orders: orders.length });
  // The Old Don and the Shark: the succession is the game, so it is one click from the Desk and the top bar.
  const openSuccession = () => { setOfficeView(undefined); openRoute({ panel: 'house', section: 'court' }); };
  const home = route.home;
  const homeGroups = home ? shellUi.groupsOf(home) : [];
  const goalIdx = goals.findIndex((g) => !g.done);
  const badges: Partial<Record<HomeId, number>> = {};
  for (const a of shellAlertList) {
    const h = a.severity !== 'info' ? alertHome(a) : undefined;
    if (h) badges[h] = (badges[h] ?? 0) + 1;
  }
  // The Desk's badge is the one count (attention.ts): what needs you.
  { const n = deskBadge(s, { answers, briefSkip, orders, taken: taken.week === s.week ? taken.keys : [] }).n; if (n) badges.desk = n; else delete badges.desk; }
  const morningOpen = dayCheckIns(s, daysOf(s).day).filter((c) => c.problem && !daysOf(s).answers[c.key] && !daysOf(s).skipped.includes(c.day));
  const homeDoNowAll = home ? buildDoNow(s, home, { alerts: shellAlertList, opps: oppsForNav, unanswered: unanswered.length, brief: brief.items.length, morning: { open: morningOpen.length, name: morningOpen[0]?.name, urgent: morningOpen.some((c) => c.problem!.urgent) } }) : [];
  // This Week's front page is the Boss's Desk, which lists the decisions, the morning and the sit-down: said once.
  const homeDoNow = home === 'desk' ? homeDoNowAll.filter((d) => d.act.kind !== 'decisions' && d.act.kind !== 'day' && d.act.kind !== 'sitdown') : homeDoNowAll;
  const openDecisions = () => { setAdvancing(false); setEventIdx(Math.max(0, firstOpen(answers))); };
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
    'nav.settings': <SettingsPanel game={{ s, update: (f, what) => act(f, what) }} difficulty={s.difficulty} onDifficulty={(d) => setS(setDifficulty(s, d))} />,
    'nav.help': <HelpBody onAdvice={() => setAdvice(true)} onGlossary={() => setHelp({})} />,
  };
  const deskApi = {
    onEvent: (iid: string) => { setAdvancing(false); setEventIdx(Math.max(0, s.pendingEvents.findIndex((e) => e.iid === iid))); },
    onDay: (day: number) => { setSpeed(0); setDayWin(day); },
    onSitDown: (brief?: string) => { setSitFocus(brief); setSitdown('council'); },
    onCancelOrder: (i: number) => ordersApi.remove(i),
    onMoney: () => openRoute({ panel: 'holdings', section: 'money' }),
    onSingle: () => openRoute({ panel: 'you', section: 'dating' }),
    onFamily: () => openRoute({ panel: 'diplomacy', section: 'board' }),
    onChar: (id: string) => setSheet(id),
    onLt: () => setLtOpen(true),
    onUrgent: (tip: string) => setUrgent(tip),
    onEnvelope: () => tributeApi.openAudience(),
    onTake: (key: string) => setTaken((t) => ({ week: s.week, keys: [...(t.week === s.week ? t.keys : []).filter((k) => k !== key), key] })),
    onMotion: () => window.dispatchEvent(new Event('llv-open-plans')),
    onFile: () => window.dispatchEvent(new Event('llv-open-file')),
    onOffer: (take: boolean) => act((x) => answerOffer(x, take), take ? 'Your underboss handles the routine' : 'Kept the chain of command as it was'),
  };
  const takenKeys = taken.week === s.week ? taken.keys : [];
  const roundRows = !clockMode && !s.gameOver ? roundOf(s, { answers, orders, briefSkip, taken: takenKeys }, new Set(visitedNow)) : [];
  /** Bundled answers (engine/bundles.ts), each through its own path: the decision's answer, the capo's check-in, the order. */
  function giveAnswers(rows: readonly Pick<SettledRow, 'title' | 'label' | 'answer'>[]) {
    if (!rows.length) return;
    const ev: Record<string, string> = {};
    const am: [string, string][] = [];
    for (const r of rows) {
      if (r.answer.kind === 'event') ev[r.answer.iid] = r.answer.choiceId;
      else if (r.answer.kind === 'checkin') am.push([r.answer.key, r.answer.answer]);
      else ordersApi.queue(r.answer.action, true);
    }
    if (Object.keys(ev).length) setAnswers((a) => ({ ...a, ...ev }));
    if (am.length) setS((cur) => am.reduce((x, [k, v]) => answerCheckIn(x, k, v), cur));
    feedbackApi.notify({ kind: 'decided', title: rows.length === 1 ? `${rows[0].title}: ${rows[0].label}` : `${rows.length} settled the consigliere's way`, when: 'when the week turns; each outcome lands in Your File' });
  }
  function handleWeek() {
    const p = handleWeekPlan(s, { answers, orders, taken: takenKeys });
    giveAnswers(p.settle);
    setWeekDone({ week: s.week, rows: p.settle, yours: p.yours, cost: p.cost, odds: p.odds });
  }
  function undoSettled(r: WeekPlanRow) {
    const a = r.answer;
    if (a.kind === 'event') setAnswers((x) => { const n = { ...x }; delete n[a.iid]; return n; });
    else if (a.kind === 'checkin') setS((cur) => answerCheckIn(cur, a.key, undefined));
    else { const i = orders.findIndex((o) => sameOrder(o, a.action)); if (i >= 0) ordersApi.remove(i); }
    setWeekDone((w) => w && { ...w, rows: w.rows.filter((x) => x.key !== r.key), cost: w.cost - r.cost, yours: [...w.yours, { key: r.key, title: r.title, why: 'you took it back' }] });
  }
  const weekDoneNow = weekDone?.week === s.week ? weekDone : undefined;
  const deskApi2 = { ...deskApi, onSettle: giveAnswers, onHandleWeek: handleWeek, weekDone: weekDoneNow, onUndo: undoSettled, onWeekDoneClose: () => setWeekDone(undefined), onEat: () => openRoute({ panel: 'borgata', section: 'eat' }) };
  // A home's front page (Drawer's five bands): the Desk's papers for that home open as on the Desk; picks go as in Find.
  const frontUi = { answers, orders, briefSkip, taken: takenKeys };
  const frontApi: FrontApi = { ui: frontUi, onNeed: (it) => openItem(it, deskApi2), onPick: onFind, open: shellUi.open, onEveryone: () => openPlanner('book') };
  const openDesk = (f: DeskFilter = 'all') => { setOfficeView(undefined); setDeskFilter(f); setRoute({ home: 'desk' }); };
  const officeApi: OfficeApi = {
    openDesk: (f?: DeskFilter) => openDesk(f),
    openEnvelope: () => tributeApi.openAudience(),
    openVisitors: () => setSitdown('council'),
    openLedger: () => openRoute({ panel: 'holdings', section: 'take' }),
    openCalendar: (day) => { setSpeed(0); setDayWin(day ?? daysOf(s).day); },
    openDatebook: () => openPlanner('datebook'),
    openDecisions: openDecisions,
    openMap: () => { setRoute({}); setOfficeView(undefined); },
    openFamily: () => openRoute({ panel: 'house', section: 'tree' }),
    openNews: () => openRoute({ panel: 'chronicle', section: 'papers' }),
    openPlace: (key: string) => { const [k, mode] = key.split('#'); if (mode === 'share' || mode === 'vacation') requestStoreMode(mode); setOfficeView(undefined); openRoute(k); },
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
  const box = deskBadge(s, { answers, briefSkip, orders, taken: takenKeys });
  const laterKeys = later.week === s.week ? later.keys : [];
  const officeUi = { answers, briefSkip, orders, later: laterKeys, taken: takenKeys };
  function officeDelegate(op: DelegateOp) {
    if (op.kind === 'answer') { setAnswers((a) => ({ ...a, [op.iid]: op.choiceId })); noteAnswer(op.iid, op.choiceId); }
    else if (op.kind === 'checkin') act((x) => answerCheckIn(x, op.key, op.answer), 'Answered a capo\'s check-in');
    else ordersApi.queue(op.action);
  }
  function officeInvite(v: OfficeVisitor) {
    if (v.ref.event) deskApi.onEvent(v.ref.event);
    else if (v.ref.day !== undefined) deskApi.onDay(v.ref.day);
    else if (v.ref.brief) { setSitFocus(v.ref.brief); setSitdown('council'); }
    else officeApi.openCalendar();
  }
  function officeLater(v: OfficeVisitor) {
    setLater({ week: s.week, keys: [...laterKeys, v.key] });
    if (v.ref.brief && !briefSkip.includes(v.ref.brief)) setBriefSkip([...briefSkip, v.ref.brief]);
  }
  const officeScreen = s.gameOver || home ? undefined
    : officeView === 'office' ? <BossOffice key={s.week} s={s} ui={officeUi} monday={mondayCard} onMondayDone={() => setMondayCard(false)} onInvite={officeInvite} onDelegate={officeDelegate} onLater={officeLater} onClub={() => setOfficeView('club')} />
    : officeView === 'club' ? <SocialClub s={s} onUpstairs={() => setOfficeView('office')} onHq={() => openRoute({ panel: 'holdings', section: 'hq' })} onMap={() => setOfficeView(undefined)} />
    : undefined;
  const weekTop = home === 'desk' && !s.gameOver ? (
    <section className="mb-4" data-testid="week-routine">
      <PlaceStrip s={s} onOpen={() => openRoute({ panel: 'borgata', section: 'place' })} />
      <DeskTop s={s} onGo={(g) => openRoute(g as Route)} onFile={() => deskApi.onFile?.()} />
      <div className="mb-3"><BossDesk key={`${s.week}:${deskFilter}`} inDrawer s={s} ui={{ answers, orders, briefSkip, taken: takenKeys }} api={deskApi2} filter={deskFilter} side={inTheRanks(s) ? undefined : <><ChairCard s={s} onOpen={openSuccession} /><RiseColumn s={s} goals={goals} onShow={showGoal} onRise={() => openRoute({ panel: 'borgata', section: 'rise' })} /></>} /></div>
      <section className="mb-3" data-testid="desk-motion" aria-label="In motion">
        <div className="mb-1 text-[10px] uppercase tracking-[0.25em] text-stone-500">In motion</div>
        <InMotionStrip chips={motion} onChip={onChip} inDesk />
      </section>
      <div className="mb-3"><MorningReports s={s} update={act} onChar={(id) => setSheet(id)} onSettings={() => setLtOpen(true)} /></div>
      <div className="grid grid-cols-3 gap-1.5">
        {can(s, 'sitdown') ? <button type="button" className="btn-ghost text-xs" onClick={() => setSitdown('council')} data-testid="week-sitdown">♜ The sit-down{brief.items.length ? ` (${brief.items.length})` : ''}</button>
          : <button type="button" className="btn-ghost text-xs" onClick={() => openRoute({ panel: 'borgata', section: 'place' })} data-testid="week-place">▲ Your place</button>}
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
        {can(s, 'rackets') ? <button type="button" className="btn-gold w-full py-3 text-base" onClick={() => openRoute({ panel: 'holdings', section: 'hub' })} data-testid="biz-start-racket">♣ Start a racket</button>
          : <button type="button" className="btn-ghost w-full py-3 text-base opacity-60" title="Rackets of your own open when you're a capo" onClick={() => openRoute({ panel: 'borgata', section: 'place' })} data-testid="biz-start-racket-locked">🔒 Rackets: when you're a capo</button>}
        <button type="button" className="btn-gold w-full py-3 text-base bg-red-800 border-red-500 text-red-50" onClick={() => openRoute({ panel: 'holdings', section: 'dirty' })} data-testid="biz-dirty-work">✂ Dirty work</button>
      </div>
      <div className="mt-1 text-[11px] text-stone-400">{gaps.rackets} racket{gaps.rackets === 1 ? '' : 's'} running{gaps.noEarner.length ? ` · ${gaps.noEarner.length} m${gaps.noEarner.length === 1 ? 'an' : 'en'} without a steady earner` : ' · every man has his steady earner'}. Rackets pay every week; dirty work is one job, one score: hijack a truck, shake down a shop, fix a fight, move a load.</div>
    </section>
  ) : undefined;
  const youTop = home === 'house' && !s.gameOver ? <PersonalActions s={s} update={act} onWeek={() => setRoute({ home: 'desk' })} /> : undefined;
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
          <TopBar s={s} inboxN={box.n} inboxTone={box.tone} clockMode={clockMode} turn={{ span: spanNow, onSpan: pickSpan }} onEndDay={() => { setSpeed(0); endDay(); }} speed={speed} setSpeed={playAt} note={clockNote}
            onAdvance={startAdvance} pending={outEvents.length} answered={outEvents.length - unanswered.length}
            urgent={urgentN} onUrgent={() => setUrgent(urgentMeetings(s)[0]?.id)}
            onReview={openDecisions}
            ticker={ticker} onNewGame={() => { setSpeed(0); setMenu('start'); }} onMainMenu={() => { setSpeed(0); setMenu('title'); }}
            seedInput={seedInput} setSeedInput={setSeedInput} slot={slot} pulse={s.week <= 4 && goalIdx >= 1 && unanswered.length === 0}
            onSitDown={() => setSitdown('council')} sitCount={brief.items.filter((it) => !briefSkip.includes(it.id)).length} onDesk={() => openDesk()}
            mornings={morningOpen.length} envelope={s.tribute?.reports[s.tribute.reports.length - 1]?.status === 'presented'}
            onRounds={() => setSitdown('rounds')} onEnvelope={() => tributeApi.openAudience()} onFind={() => setFinding(true)}
            onOffice={can(s, 'office') ? () => { setRoute({}); setOfficeView((v) => (v === 'office' ? undefined : 'office')); } : undefined} officeOpen={officeView === 'office'}
            chair={chair?.pressure} onChair={() => openSuccession()}
            phone={<><PlannerButton s={s} onOpen={() => openPlanner()} /><PhoneButton missed={phoneBadge(s)} ringing={ringing(s).length > 0} onOpen={() => { setPhoneOpen(true); setS((x) => markMissedSeen(x)); }} /></>}
            onHelp={() => setHelpMenu(true)} fileNew={fileNew} onFile={() => { setOfficeView(undefined); markFileSeen(); go('book'); }} paperUnread={unreadCount(s)} onPaper={() => { setOfficeView(undefined); openRoute({ panel: 'chronicle', section: 'papers' }); }} />
          {!s.gameOver && <LiveAlerts s={s} running={speed > 0} />}
        </>)}
        rail={<LeftRail active={home} badges={badges} dots={shellUi.dots} locks={Object.fromEntries(HOME_IDS.map((h) => [h, homeLock(s, h)]).filter(([, r]) => r))} onOpen={(h) => setRoute((r) => (r.home === h && !r.key ? {} : { home: h }))} onHelp={() => setHelpMenu(true)} />}
        map={<MapView s={s} alerts={alertList} onAlert={() => {}} onOpenBusiness={() => go('business')} onEnvoy={(city) => plannerApi.plan('envoy', undefined, { city })} shell focus={mapFocus} />}
        overlay={(
          <>
            <div className="hidden 2xl:block absolute bottom-6 left-[340px] z-[1000] w-[320px]"><StreetFeedCard s={s} overlay /></div>
            {officeScreen}
            {home === 'desk' && !s.gameOver && (
              // The office as ambience behind the Desk: the painting, dimmed, no hotspots (they are the Desk's rows now).
              <div className="pointer-events-none absolute inset-0 z-[1090] overflow-hidden bg-noir-950" data-testid="desk-ambience" aria-hidden>
                <AssetImg k="office_interior" alt="" className="h-full w-full object-cover opacity-25 blur-[1px]" />
              </div>
            )}
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
                  {!clockMode && <div className="flex min-w-0"><RoundStrip rows={roundRows} onStop={(st) => (st === 'needs' ? openDesk() : setRoute({ home: st as HomeId }))} /></div>}
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
            doNow={homeDoNow} onDo={onDoNow} extras={navExtras} top={weekTop ?? bizTop ?? youTop} front={frontApi} />
        )}
        right={right}
        rightIcons={<AlertsPanel alerts={shellAlertList} onAlert={onAlert} onSnooze={(a) => shellUi.snooze(a.key, s.week + 4)} iconsOnly />}
        alertCount={shellAlertList.length}
        danger={shellAlertList.some((a) => a.severity === 'danger')}
      />
      {shellUi.toast && <Toast text={shellUi.toast} onDone={shellUi.clearToast} />}
      {turning && <WeekTurning week={s.week} mode={mode} progress={turnProg} onStop={mode === 'turn' ? () => { stopAfterRef.current = true; } : undefined} />}
      {spanDone && !current && !sheet && !cues.length && !night.length && !reels.length && !turning && (
        <SpanReport from={spanDone.from} to={spanDone.to} line={spanDone.line} lines={spanDone.lines} stop={spanDone.stop}
          onReports={() => { setReports(spanDone.reports); setSpanDone(undefined); }}
          onFile={() => { setSpanDone(undefined); window.dispatchEvent(new Event('llv-open-file')); }}
          onClose={() => setSpanDone(undefined)} />
      )}
      {!menu && helpLevel() !== 'experienced' && <HintHost s={s} route={route} overlayOpen={overlayOpen || mondayCard} motion={motion.length} alerts={shellAlertList.length} speed={speed} />}

      {ltOpen && !s.gameOver && <WhoHandlesWhat s={s} update={act} onClose={() => setLtOpen(false)} />}
      {sitdown && !current && !scene && (
        <SitDown key={`${s.week}:${sitdown}:${sitFocus ?? ''}`} s={s} initialTab={sitdown} focus={sitFocus} rounds={s.days?.week === s.week && s.days.plan ? plannedRounds(s) : undefined} setRounds={(ids) => act((x) => setWeekRounds(x, ids), 'Your evenings for the week are set')} skip={briefSkip} setSkip={setBriefSkip}
          onTrust={(k, on) => act((x) => setTrust(x, k, on), on ? 'Trusted him with it' : 'Took it back into your own hands')} onLink={followLink} onClose={() => { setSitdown(undefined); setSitFocus(undefined); }}
          onDecisions={() => { setSitdown(undefined); setAdvancing(false); setEventIdx(Math.max(0, firstOpen(answers))); }}
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
        <EventModal key={current.iid} s={s} ev={current} index={Math.max(0, outEvents.indexOf(current))} total={outEvents.length} selected={answers[current.iid]} onChoose={choose} onClose={() => { setEventIdx(null); setAdvancing(false); }} />
      )}
      <NowResultHost />
      <DateTalkHost s={s} />
      <LoyaltyFloaters s={s} />
      {/* One queue, never stacked: a decision or a scene first, then "How they took it", then the argument it opens, then an urgent meeting. */}
      <ResultQueue items={weekResults} blocked={!!current || !!scene || !!reports || cues.length > 0 || night.length > 0 || reels.length > 0} onNext={() => setWeekResults((x) => x.slice(1))} onAll={() => setWeekResults([])} />
      <ReactionsHost s={s} blocked={!!current || !!scene || !!reports || cues.length > 0 || !!s.argue?.live || weekResults.length > 0} />
      <ArgueHost s={s} blocked={!!current || !!scene || !!reports || cues.length > 0} />
      {urgent && !current && !scene && !reports && !cues.length && !rxWaiting && (
        <UrgentMeeting s={s} id={urgent} onClose={() => setUrgent(undefined)} onPick={setUrgent}
          onMeet={(id, via) => act((x) => meetTip(x, id, via), 'You agreed to the meeting')} onIgnore={(id) => { act((x) => ignoreTip(x, id), 'You let the warning go'); setUrgent(nextUrgent(id)); }}
          onRespond={(id, r) => { act((x) => respondTip(x, id, r), 'You gave your answer to the warning'); setUrgent(nextUrgent(id)); }} />
      )}
      {strike && !current && !scene && (
        <StrikeCard s={s} id={strike} kicker={momentKicker(s, strike)} onChoose={(o) => {
          const tip = tipOfMoment(s, strike);
          const r = answerMoment(s, strike, o);
          if (r.result.ok) setS(r.state);
          // Two at once on the same night: the next one (a strike, a call, a meet), then the clock goes on.
          setStrike(r.result.ok ? liveMoments(r.state)[0] : undefined);
          postNow(r.result);
          // He heard the warning on the phone: the meeting card opens for his answer.
          const t2 = tip ? r.state.threats?.tips.find((x) => x.id === tip) : undefined;
          if (t2 && (t2.status === 'met' || t2.status === 'sent') && !t2.response) setUrgent(tip);
        }} />
      )}
      {backId && !strike && !current && !scene && callBackView(s, backId) && (
        <StrikeCard s={s} id={`back:${backId}`} view={callBackView(s, backId)} kicker="You call back" onChoose={(o) => {
          const r = callBack(s, backId, o);
          if (r.result.ok) setS(r.state);
          setBackId(undefined);
          postNow(r.result);
        }} />
      )}
      {phoneOpen && !strike && !current && !backId && (
        <PhoneWindow s={s} onClose={() => setPhoneOpen(false)}
          onCallBack={(id) => { setPhoneOpen(false); setBackId(id); }}
          onDial={(spec) => {
            const r = dial(s, spec);
            if (r.result.ok) setS(r.state);
            setPhoneOpen(false);
            postNow(r.result);
          }} />
      )}
      {/* The Don's book (ui/planner): the brief, the audience, the datebook, the black book, the standing orders. */}
      {!s.gameOver && <PlannerHost s={s} ui={{ answers, briefSkip, orders }} speed={speed} note={clockNote} blocked={overlayOpen || busy || mondayCard || rxWaiting || phoneOpen}
        api={{ onEvent: deskApi.onEvent, onUrgent: (id) => setUrgent(id), onDay: deskApi.onDay, onSitDown: deskApi.onSitDown, onEnvelope: () => tributeApi.openAudience() }} />}
      {ready && !current && <ReadyToAdvance s={s} ui={{ answers, orders, briefSkip, taken: takenKeys }} month={ready === 'month' || ready === 'season'} turn={ready === 'turn' ? { weeks: spanNow, unvisited: roundRows.filter((r) => !r.ticked && r.stop !== 'needs').map((r) => ({ stop: r.stop, label: HOMES_BY_ID[r.stop as HomeId]?.label ?? r.stop, open: r.open })) } : undefined} onClose={() => setReady(undefined)} onReview={() => reviewFirst(ready)} onAdvance={() => advanceAnyway(ready)} onAnswer={(iid, c) => { setAnswers((x) => ({ ...x, [iid]: c })); noteAnswer(iid, c); }} onHandleWeek={handleWeek} weekDone={weekDoneNow} onUndo={undoSettled} />}
      {cues.length > 0 && <CutscenePlayer key={`${s.week}:${cues.map((c) => c.key).join()}`} cues={cues} onDone={() => setCues([])} />}
      {night.length > 0 && !current && !cues.length && <ElectionNight s={s} results={night} onClose={() => setNight([])} />}
      {reels.length > 0 && !cues.length && !current && <NewspaperReel key={`${reels.length}:${reels[0].headline}`} reel={reels[0]} onDone={() => setReels((x) => x.slice(1))} />}
      {reports && !current && !sheet && !planner && !cues.length && !night.length && !reels.length && <ReportModal s={s} reports={reports} onClose={() => setReports(null)} />}
      {sheet && !current && (s.characters[sheet] || !s.pol?.people[sheet]
        ? <CharacterSheet key={sheet} s={s} id={sheet} onClose={() => setSheet(undefined)} />
        : <SheetFrame onClose={() => setSheet(undefined)}><div className="flex justify-end px-3 pt-3"><button className="btn-ghost text-xs" onClick={() => setSheet(undefined)}>Close</button></div><PolSheet s={s} id={sheet} embedded onClose={() => setSheet(undefined)} onOpen={(id) => setSheet(id)} /></SheetFrame>)}
      {ctxMenu && !current && <ContextMenu s={s} id={ctxMenu.id} x={ctxMenu.x} y={ctxMenu.y} category={ctxMenu.category} onClose={() => setCtxMenu(undefined)} />}
      {picker && !current && !sheet && <PickerModal s={s} role={picker.role} pool={picker.pool} onPick={picker.onPick} onClose={() => setPicker(undefined)} />}
      {advice && !current && !sheet && !picker && !tripPlan && <WhatToDoModal s={s} answered={outEvents.length - unanswered.length} onTab={(t) => go(t)} onClose={() => setAdvice(false)} />}
      {helpMenu && (
        <Modal onClose={() => setHelpMenu(false)}>
          <div className="p-4 space-y-2" data-testid="help-menu">
            <div className="panel-title">Help</div>
            <HelpBody onAdvice={() => { setHelpMenu(false); setAdvice(true); }} onGlossary={() => { setHelpMenu(false); setHelp({}); }} />
          </div>
        </Modal>
      )}
      {dayWin !== undefined && !current && (
        <Overlay z={1180} className="flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={() => setDayWin(undefined)}>
          <div className="panel w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-lg p-3" onClick={(e) => e.stopPropagation()} data-testid="day-window">
            <div className="mb-2 flex items-center justify-between">
              <div className="panel-title">Your day</div>
              <button type="button" className="btn-gold px-3 py-1 text-xs" onClick={() => setDayWin(undefined)} data-testid="day-window-close">Done</button>
            </div>
            <WeekPlanner s={s} update={act} initialDay={dayWin} onSitDown={() => { setDayWin(undefined); setSitdown('rounds'); }} />
          </div>
        </Overlay>
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
      {!s.gameOver && <Celebration s={s} />}
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
