import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrderToast, type ToastItem } from './components/OrderToast';
import { HousesNavContext } from './houses/nav';
import { alerts as computeAlerts } from '../engine/alerts';
import { advanceMonth, advanceWeek } from '../engine/engine';
import { STARTS, newGameWith, type StartId } from '../engine/starts';
import type { CutsceneCue, GameState, PlayerAction, PlayerChoices, SchemeKind, SchemeOptions, SuccessionLaw, WeeklyReport } from '../engine/types';
import { MapView } from './map/MapView';
import { cutscenesBetween } from '../engine/cutscenes';
import { CutscenePlayer } from './cutscene/Cutscene';
import { morningStop, newWarnings, tickerLine, useClock, weekHeadlines, type Speed } from './clock';
import { SchemePlanner } from './components/Schemes';
import { CharacterSheet } from './components/CharacterSheet';
import { EventModal } from './components/EventModal';
import { ReportModal } from './components/ReportModal';
import type { ClarityApi } from './clarity/context';
import { PickerModal } from './clarity/CandidatePicker';
import { GlossaryOverlay } from './clarity/Glossary';
import { WhatToDoModal } from './clarity/WhatToDo';
import type { Candidate, Role } from '../engine/candidates';
import { currentSlot, loadSlot, saveSlot, setCurrentSlot } from './save';
import { StartMenu, type MenuScreen } from './menu/StartMenu';
import { registerAppearances } from './portrait/genes';
import { applySettings, getSettings, pausesOn, timeMode } from './settings';
import { TripPlanner } from './travel/TripPlanner';
import { FleePlanner } from './travel/FleePlanner';
import { minigameOf, opensScene } from '../engine/minigames';
import { MinigameScreen } from './minigames/MinigameScreen';
import { NewspaperReel, type Reel } from './minigames/NewspaperReel';

import { ElectionNight } from './cityhall/ElectionNight';
import type { ElectionResult } from '../engine/polState';
import type { SectionCtx } from './shell/panels';
import type { HomeId, Route } from './shell/routes';
import { homeForKey, resolveRoute, type NavRoute } from './shell/nav';
import { alertHome, doNow as buildDoNow, type DoNowItem } from './shell/doNow';
import { racketGaps } from '../engine/racketMenu';
import { HelpBody } from './shell/ShellHelp';
import { SettingsPanel } from './menu/StartMenu';
import { OrdersTray } from './components/Orders';
import { whatShouldIDo } from '../engine/opportunities';
import { Providers } from './shell/Providers';
import type { MapFocus, ShellApi } from './shell/context';
import { Shell } from './shell/Shell';
import { TopBar } from './shell/TopBar';
import { LeftRail } from './shell/LeftRail';
import { Drawer } from './shell/Drawer';
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
import { WeekPlanner } from './rounds/WeekPlanner';
import { EveningScene, PersonalActions, TodayStrip, type EveningCue } from './rounds/RoundsBits';
import { SitDown } from './sitdown/SitDown';
import { coveredBy, SitDownCard } from './sitdown/SitDownCard';

/** Old tab ids still work everywhere (`goTab`, alerts): they resolve through LEGACY_TAB_ROUTE. */
export type Tab = string;
type Mode = 'week' | 'month';

/** The opening scene: the old boss's funeral at St. Ann's (plays for every new game). */
function openingCue(week: number): CutsceneCue {
  return { key: 'opening', title: "St. Ann's, Wildwood · May 1960", text: 'The church smells of lilies and floor wax. The old man lies in a bronze casket that cost more than most of the mourners make in a year. In nine days the boardwalk opens. By then somebody has to be running things. You stand in the front pew, and behind you the capos are counting.', week };
}

function freshSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** `startOn: 'game'` skips the title screen (tests, embedding). */
export interface AppProps { startOn?: 'title' | 'game' }
export function App({ startOn = 'title' }: AppProps) {
  const [slot, setSlot] = useState(() => currentSlot());
  const [s, setS] = useState<GameState>(() => loadSlot(currentSlot()) ?? newGameWith(freshSeed()));
  /** The title screen / new-game flow (shown on first load). */
  const [menu, setMenu] = useState<MenuScreen | undefined>(startOn === 'title' ? 'title' : undefined);
  useEffect(() => applySettings(), []);
  registerAppearances(s.seed, s.characters);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mgMoves, setMgMoves] = useState<Record<string, string[]>>({});
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
  const [orders, setOrders] = useState<PlayerAction[]>([]);
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
  const ordersApi = useMemo(() => ({
    orders,
    queue: (a: PlayerAction) => { setToast({ action: a, index: orders.length, at: Date.now() }); setOrders((o) => [...o, a]); },
    remove: (i: number) => setOrders((o) => o.filter((_, j) => j !== i)),
  }), [orders]);
  const [houseSel, setHouseSel] = useState<string | undefined>();
  const [toast, setToast] = useState<ToastItem | undefined>();
  const closeToast = useCallback(() => setToast(undefined), []);
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
  const travelApi = useMemo(() => ({
    plan: (leaderId: string, destId?: string) => { setSheet(undefined); setTripPlan({ leaderId, destId }); },
    flee: (personId: string) => { setSheet(undefined); setFleeFor(personId); },
  }), []);
  useEffect(() => {
    if (!menu) saveSlot(slot, s);
  }, [s, menu, slot]);
  const [speed, setSpeed] = useState<Speed>(0);
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
  const [autoOpened, setAutoOpened] = useState<Record<string, boolean>>({});
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
  const alertList = useMemo(() => computeAlerts(s), [s]);

  function run(m: Mode, a: Record<string, string>, quiet = false, moves: Record<string, string[]> = mgMoves) {
    // The one place a week's choices are built (the clock and Advance Week alike): the days plan supplies the evenings and the mornings.
    const choices: PlayerChoices = weekChoices(s, { choices: a, successionLaw: pendingLaw, designatedHeirId: pendingHeir, actions: orders, minigames: moves, ...(envelopeRef.current ? { envelope: envelopeRef.current } : {}), ...(briefSkip.length ? { briefingSkip: briefSkip } : {}) });
    // A ceremony the player sat through replaces the old single card.
    const sawCeremony = Object.keys(moves).some((iid) => s.pendingEvents.find((e) => e.iid === iid)?.defId === 'making');
    const cueFilter = (c: CutsceneCue) => !(sawCeremony && c.key === 'made_man');
    if (m === 'week') {
      const r = advanceWeek(s, choices);
      setS(r.state);
      setReportLog((l) => [...l, r.report].slice(-26));
      setNight(r.state.pol?.results.filter((x) => x.week >= s.week) ?? []);
      setCues(cutscenesBetween(s, r.state).filter(cueFilter));
      setReels(r.state.mg?.reels ?? []);
      if (quiet) {
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
      const r = advanceMonth(s, choices);
      setS(r.state);
      setReportLog((l) => [...l, ...r.reports].slice(-26));
      setNight(r.state.pol?.results.filter((x) => x.week >= s.week) ?? []);
      setCues(cutscenesBetween(s, r.state).filter(cueFilter));
      setReels(r.state.mg?.reels ?? []);
      setReports(r.reports);
    }
    setAnswers({});
    setMgMoves({});
    setOrders([]);
    setBriefSkip([]);
    setSitdown(undefined);
    setEnvelope(undefined);
    setPendingLaw(undefined);
    setPendingHeir(undefined);
    setEventIdx(null);
    setAdvancing(false);
  }

  function startAdvance(m: Mode) {
    setMode(m);
    setAdvancing(true);
    if (unanswered.length) setEventIdx(s.pendingEvents.findIndex((e) => !answers[e.iid]));
    else run(m, answers);
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

  function commit(choiceId: string, moves?: string[]) {
    if (eventIdx === null) return;
    const ev = s.pendingEvents[eventIdx];
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
    setSpeed(0);
    setRoute({});
    setReportLog([]);
    setCtxMenu(undefined);
    try { window.scrollTo(0, 0); } catch { /* no window */ }
  }

  /** A new game from the creator (or a quick restart): always opens on the funeral. */
  function beginGame(next: GameState, n: number) {
    setCurrentSlot(n);
    setSlot(n);
    setS(next);
    resetUi();
    setMenu(undefined);
    setCues([openingCue(next.week)]);
    try { sessionStorage.setItem('llv-opening-' + next.seed, '1'); } catch { /* storage unavailable */ }
  }

  function restart(seed?: string, start: StartId = 'classic') {
    beginGame(newGameWith(seed || freshSeed(), start), slot);
  }

  function continueSlot(n: number) {
    const loaded = loadSlot(n);
    if (!loaded) return;
    setCurrentSlot(n);
    setSlot(n);
    setS(loaded);
    resetUi();
    setMenu(undefined);
    try {
      if (loaded.week <= 1 && !sessionStorage.getItem('llv-opening-' + loaded.seed)) {
        sessionStorage.setItem('llv-opening-' + loaded.seed, '1');
        setCues([openingCue(loaded.week)]);
      }
    } catch { /* storage unavailable */ }
  }

  const shellUi = useShellState(s, orders, sheet);
  const [mapFocus, setMapFocus] = useState<MapFocus | undefined>();
  const focusMap = (f: Omit<MapFocus, 'nonce'>) => setMapFocus((x) => ({ ...f, nonce: (x?.nonce ?? 0) + 1 }));
  const [helpMenu, setHelpMenu] = useState(false);
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
  const shellApi: ShellApi = { go, focus: focusMap };
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
  const overlayOpen = dayWin !== undefined || !!sitdown || !!office || !!ctxMenu || !!current || !!scene || !!sheet || !!planner || !!tripPlan || !!fleeFor || !!reports || !!picker || advice || !!help || helpMenu || cues.length > 0 || reels.length > 0 || night.length > 0;
  const busy = dayWin !== undefined || !!sitdown || !!office || !!menu || !!current || !!scene || !!sheet || !!planner || !!tripPlan || !!fleeFor || !!reports || !!picker || advice || !!help || cues.length > 0 || reels.length > 0;
  /** One day on the clock: tonight's evening becomes a scene, then the next morning (or, after Sunday, the week turns through run()). */
  function stepDay() {
    const d = daysOf(s).day;
    const id = weekPlan(s)[d];
    if (id) {
      setEvenings((x) => [...x.slice(-1), { cue: { week: s.week, day: d, roundId: id }, s }]);
      if (pausesOn('pauseOnEvening')) { setSpeed(0); setClockNote('Paused: your evening'); }
    }
    if (d >= 6) { run('week', answers, true); return; }
    const next = tickDay(s);
    setS(next);
    const urgent = pausesOn('pauseOnCapo') ? morningStop(next) : undefined;
    if (urgent) { setSpeed(0); setClockNote(`Paused: ${urgent}`); }
  }
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
    if (getSettings().sitdownEachWeek !== false) setSitdown('council');
  }, [menu, s.gameOver, speed, sitSeen, sitKey, current, scene, cues.length, reels.length, night.length, reports, sheet, planner, tripPlan, fleeFor, picker, office, ctxMenu]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        if (timeMode() !== 'clock') return;
        e.preventDefault();
        // A focused button would click on the key's release and undo the toggle.
        (document.activeElement as HTMLElement | null)?.blur?.();
        setSpeed((v) => (v === 0 ? 2 : 0));
        setClockNote(undefined);
        return;
      }
      if (menu || overlayOpen) return;
      if (e.key === '?') { e.preventDefault(); setHelpMenu(true); return; }
      const h = homeForKey(e.key);
      if (h) {
        e.preventDefault();
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
  if (unanswered.length) badges.week = (badges.week ?? 0) + unanswered.length;
  const morningOpen = dayCheckIns(s, daysOf(s).day).filter((c) => c.problem && !daysOf(s).answers[c.key] && !daysOf(s).skipped.includes(c.day));
  const homeDoNow = home ? buildDoNow(s, home, { alerts: shellAlertList, opps: oppsForNav, unanswered: unanswered.length, brief: brief.items.length, morning: { open: morningOpen.length, name: morningOpen[0]?.name, urgent: morningOpen.some((c) => c.problem!.urgent) } }) : [];
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
  const weekTop = home === 'week' && !s.gameOver ? (
    <section className="mb-4" data-testid="week-routine">
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.25em] text-stone-500">Your week</div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <button type="button" className="btn-ghost text-xs" onClick={() => setSitdown('council')} data-testid="week-sitdown">♜ The sit-down{brief.items.length ? ` (${brief.items.length})` : ''}</button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setSitdown('rounds')} data-testid="week-rounds">☕ Your rounds</button>
        <button type="button" className="btn-ghost text-xs" disabled={!s.pendingEvents.length} onClick={openDecisions} data-testid="week-decisions">✉ Decisions {s.pendingEvents.length - unanswered.length}/{s.pendingEvents.length}</button>
        <button type="button" className="btn-gold text-xs" onClick={() => { setRoute({}); startAdvance('week'); }} data-testid="week-advance">Advance Week ▸</button>
      </div>
      {orders.length > 0 && <div className="mt-2" data-testid="week-orders"><div className="mb-1 text-[11px] text-stone-400">Orders for this week, carried out when you advance:</div><OrdersTray s={s} /></div>}
      <div className="mt-3" data-testid="your-rounds">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.25em] text-stone-500">Your rounds · day by day</div>
        <WeekPlanner key={s.week} s={s} update={setS} onSitDown={() => setSitdown('rounds')} />
      </div>
    </section>
  ) : undefined;
  // Rackets & Businesses: "Start a racket" first, big, and who still lacks a steady earner.
  const gaps = home === 'biz' && !s.gameOver ? racketGaps(s) : undefined;
  const bizTop = gaps ? (
    <section className="mb-4" data-testid="biz-start">
      <button type="button" className="btn-gold w-full py-3 text-base" onClick={() => openRoute({ panel: 'holdings', section: 'hub' })} data-testid="biz-start-racket">♣ Start a racket</button>
      <div className="mt-1 text-[11px] text-stone-400">{gaps.rackets} racket{gaps.rackets === 1 ? '' : 's'} running{gaps.noEarner.length ? ` · ${gaps.noEarner.length} m${gaps.noEarner.length === 1 ? 'an' : 'en'} without a steady earner` : ' · every man has his steady earner'}. Street money, vice, contraband, working the system, payoffs.</div>
    </section>
  ) : undefined;
  const youTop = home === 'you' && !s.gameOver ? <PersonalActions s={s} update={setS} onWeek={() => setRoute({ home: 'week' })} /> : undefined;
  const right = (
    <>
      <AlertsPanel alerts={shellAlertList} onAlert={onAlert} onSnooze={(a) => shellUi.snooze(a.key, s.week + 4)} />
      {!s.gameOver && <SitDownCard s={s} b={briefForRail} onOpen={() => setSitdown('council')} onRounds={() => setSitdown('rounds')} />}
      <ThisWeekCard s={s} onReport={() => s.lastReport && setReports([s.lastReport])} hideAdvice />
      {!s.gameOver && <GoalsCard goals={goals} onShow={showGoal} />}
      <div className="2xl:hidden"><StreetFeedCard s={s} /></div>
    </>
  );

  return (
    <HousesNavContext.Provider value={housesApi}>
    <TributeUiContext.Provider value={tributeApi}>
    <Providers sheet={sheetApi} clarity={clarityApi} planner={plannerApi} orders={ordersApi} travel={travelApi} shell={shellApi}>
      <EmpireHost s={s} setS={setS}>
      <Shell
        top={(
          <TopBar s={s} clockMode={clockMode} speed={speed} setSpeed={(v) => { setSpeed(v); setClockNote(undefined); }} note={clockNote}
            onAdvance={startAdvance} pending={s.pendingEvents.length} answered={s.pendingEvents.length - unanswered.length}
            onReview={openDecisions}
            ticker={ticker} onNewGame={() => { setSpeed(0); setMenu('start'); }} onMainMenu={() => { setSpeed(0); setMenu('title'); }}
            seedInput={seedInput} setSeedInput={setSeedInput} slot={slot} pulse={s.week <= 4 && goalIdx >= 1 && unanswered.length === 0}
            onSitDown={() => setSitdown('council')} sitCount={brief.items.length} />
        )}
        rail={<LeftRail active={home} badges={badges} dots={shellUi.dots} onOpen={(h) => setRoute((r) => (r.home === h && !r.key ? {} : { home: h }))} onHelp={() => setHelpMenu(true)} />}
        map={<MapView s={s} alerts={alertList} onAlert={() => {}} onOpenBusiness={() => go('business')} onEnvoy={(city) => plannerApi.plan('envoy', undefined, { city })} shell focus={mapFocus} />}
        overlay={(
          <>
            <div className="hidden 2xl:block absolute bottom-6 left-[340px] z-[1000] w-[320px]"><StreetFeedCard s={s} overlay /></div>
            {clockMode && !s.gameOver && !home && (
              <div className="pointer-events-none absolute left-2 right-[120px] bottom-12 md:right-auto md:bottom-3 md:left-[310px] 2xl:left-[680px] z-[1001] flex md:max-w-[calc(100%-330px)]">
                <TodayStrip s={s} onOpen={() => { setSpeed(0); setDayWin(daysOf(s).day); }} />
              </div>
            )}
            {evenings.length > 0 && (
              <div className="pointer-events-none absolute bottom-24 md:bottom-14 right-2 z-[1130] flex flex-col items-end gap-2">
                {evenings.map((e, i) => (
                  <EveningScene key={`${e.cue.week}:${e.cue.day}`} s={e.s} cue={e.cue} older={i < evenings.length - 1} onClose={() => setEvenings((x) => x.filter((y) => y !== e))}
                    onMore={() => { setEvenings([]); setRoute({ home: 'week' }); }} />
                ))}
              </div>
            )}
            {!s.gameOver && goalIdx >= 0 && !home && (
              <button type="button" onClick={() => showGoal(goals[goalIdx])} data-testid="goal-pill"
                className="md:hidden absolute bottom-2 left-2 right-[120px] z-[1000] truncate rounded-full border border-gold-600/70 bg-noir-900/95 px-3 py-1.5 text-left text-[11px] text-gold-300 shadow-lg shadow-black/70">
                ➚ {goals[goalIdx].title}
              </button>
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
      {!menu && <HintHost s={s} route={route} overlayOpen={overlayOpen} motion={motion.length} alerts={shellAlertList.length} speed={speed} />}

      {sitdown && !current && !scene && (
        <SitDown key={`${s.week}:${sitdown}`} s={s} initialTab={sitdown} rounds={s.days?.week === s.week && s.days.plan ? plannedRounds(s) : undefined} setRounds={(ids) => setS((x) => setWeekRounds(x, ids))} skip={briefSkip} setSkip={setBriefSkip}
          onTrust={(k, on) => setS((x) => setTrust(x, k, on))} onLink={followLink} onClose={() => setSitdown(undefined)}
          onDecisions={() => { setSitdown(undefined); setAdvancing(false); setEventIdx(Math.max(0, s.pendingEvents.findIndex((e) => !answers[e.iid]))); }}
          lesson={s.week <= 10 && goalIdx >= 0 && goalIdx < 7 ? { title: goals[goalIdx].title, hint: goals[goalIdx].hint, onShow: goals[goalIdx].show ? () => { setSitdown(undefined); showGoal(goals[goalIdx]); } : undefined } : undefined} />
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
          onDone={(moves) => { const c = scene.choiceId; setScene(null); commit(c, moves); }}
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
            <WeekPlanner s={s} update={setS} initialDay={dayWin} onSitDown={() => { setDayWin(undefined); setSitdown('rounds'); }} />
          </div>
        </div>
      )}
      {help && <GlossaryOverlay focus={help.focus} onClose={() => setHelp(undefined)} />}
      {tripPlan && !current && !sheet && <TripPlanner key={`${tripPlan.leaderId}:${tripPlan.destId ?? ''}`} s={s} leaderId={tripPlan.leaderId} destId={tripPlan.destId} onClose={() => setTripPlan(undefined)} />}
      {fleeFor && !current && !sheet && <FleePlanner s={s} personId={fleeFor} onClose={() => setFleeFor(undefined)} />}
      {planner && !current && !sheet && <SchemePlanner s={s} kind={planner.kind} targetId={planner.targetId} initial={planner.opts} onClose={() => setPlanner(undefined)} />}
      {toast && <OrderToast s={s} item={toast} onClose={closeToast} onUndo={() => { setOrders((o) => o.filter((_, j) => j !== toast.index)); setToast(undefined); }} />}
      </EmpireHost>
    </Providers>
    </TributeUiContext.Provider>
    </HousesNavContext.Provider>
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
