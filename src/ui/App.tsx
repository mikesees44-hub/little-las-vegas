import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrderToast, type ToastItem } from './components/OrderToast';
import { alerts as computeAlerts } from '../engine/alerts';
import { advanceMonth, advanceWeek } from '../engine/engine';
import { STARTS, newGameWith, type StartId } from '../engine/starts';
import type { CutsceneCue, GameState, PlayerAction, PlayerChoices, SchemeKind, SchemeOptions, SuccessionLaw, WeeklyReport } from '../engine/types';
import { MapView } from './map/MapView';
import { cutscenesBetween } from '../engine/cutscenes';
import { CutscenePlayer } from './cutscene/Cutscene';
import { newWarnings, tickerLine, useClock, type Speed } from './clock';
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
import { applySettings, getSettings } from './settings';
import { TripPlanner } from './travel/TripPlanner';
import { FleePlanner } from './travel/FleePlanner';
import { minigameOf, opensScene } from '../engine/minigames';
import { MinigameScreen } from './minigames/MinigameScreen';
import { NewspaperReel, type Reel } from './minigames/NewspaperReel';

import { ElectionNight } from './cityhall/ElectionNight';
import type { ElectionResult } from '../engine/polState';
import { PANELS, type SectionCtx } from './shell/panels';
import { routeFor, type PanelId, type Route } from './shell/routes';
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
  const [route, setRoute] = useState<Route>({});
  const goRef = useRef<(r: Route | string) => void>(() => {});
  const [sheet, setSheet] = useState<string | undefined>();
  const [pendingLaw, setPendingLaw] = useState<SuccessionLaw | undefined>();
  const [pendingHeir, setPendingHeir] = useState<string | undefined>();
  const [seedInput, setSeedInput] = useState('');
  const [orders, setOrders] = useState<PlayerAction[]>([]);
  const ordersApi = useMemo(() => ({
    orders,
    queue: (a: PlayerAction) => { setToast({ action: a, index: orders.length, at: Date.now() }); setOrders((o) => [...o, a]); },
    remove: (i: number) => setOrders((o) => o.filter((_, j) => j !== i)),
  }), [orders]);
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
    const choices: PlayerChoices = { choices: a, successionLaw: pendingLaw, designatedHeirId: pendingHeir, actions: orders, minigames: moves };
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
        if ((warn.length || r.state.cutscenes?.length) && getSettings().pauseOnWarning) {
          setSpeed(0);
          setClockNote(warn.length ? `Paused: ${warn[0]}` : 'Paused');
        }
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
    setReports(null);
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
  const [lastRoute, setLastRoute] = useState<Route>({ panel: 'borgata' });
  /** Open a drawer section (an alert can reveal one that is still hidden). */
  function openRoute(r: Route) {
    if (r.panel && r.section) shellUi.reveal(`${r.panel}.${r.section}`);
    if (r.panel) setLastRoute(r);
    setRoute(r);
  }
  function go(r: Route | string) {
    openRoute(typeof r === 'string' ? routeFor(r) : r);
  }
  const shellAlertList = useMemo(() => shellAlerts(s, alertList).filter((a) => !(shellUi.snoozed[a.key] > s.week)), [s, alertList, shellUi.snoozed]);
  function onAlert(a: ShellAlert) {
    if (a.mapFocus) focusMap(a.mapFocus);
    if (a.kind === 'decision') { setAdvancing(false); setEventIdx(Math.max(0, s.pendingEvents.findIndex((e) => !answers[e.iid]))); }
    else if (a.charId) setSheet(a.charId);
    else if (a.route?.panel) openRoute(a.route);
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

  const sectionCtx: SectionCtx = { pendingLaw, pendingHeir, onLaw: setPendingLaw, onHeir: setPendingHeir, go, reports: reportLog, openReports: setReports };
  const shellApi: ShellApi = { go, focus: focusMap };
  goRef.current = go;

  const current = eventIdx !== null ? s.pendingEvents[eventIdx] : undefined;
  const overlayOpen = !!ctxMenu || !!current || !!scene || !!sheet || !!planner || !!tripPlan || !!fleeFor || !!reports || !!picker || advice || !!help || helpMenu || cues.length > 0 || reels.length > 0 || night.length > 0;
  const busy = !!menu || !!current || !!scene || !!sheet || !!planner || !!tripPlan || !!fleeFor || !!reports || !!picker || advice || !!help || cues.length > 0 || reels.length > 0;
  useClock({
    speed, s, busy, unanswered: getSettings().pauseOnDecision ? unanswered.length : 0,
    step: () => run('week', answers, true),
    onPause: (why) => {
      setSpeed(0);
      setClockNote(`Paused: ${why.toLowerCase()}`);
      if (why === 'A decision is waiting' && !busy) { setAdvancing(false); setEventIdx(s.pendingEvents.findIndex((e) => !answers[e.iid])); }
    },
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpeed((v) => (v === 0 ? 2 : 0));
        setClockNote(undefined);
        return;
      }
      if (menu || overlayOpen) return;
      const fk = /^F([1-8])$/.exec(e.key);
      const p = fk ? PANELS[Number(fk[1]) - 1] : PANELS.find((x) => x.key === e.key.toLowerCase());
      if (p && shellUi.visiblePanels.includes(p.id)) {
        e.preventDefault();
        setRoute((r) => (r.panel === p.id ? {} : { panel: p.id }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, overlayOpen, shellUi.visiblePanels]);

  if (menu) {
    return (
      <StartMenu key={menu} initial={menu} inGame={!s.gameOver && !!loadSlot(slot)} seedHint={seedInput.trim() || undefined}
        onBack={() => setMenu(undefined)} onContinue={continueSlot} onStart={beginGame} />
    );
  }

  const motion = inMotion(s, { orders: orders.length });
  const panel = route.panel && shellUi.visiblePanels.includes(route.panel) ? route.panel : undefined;
  const sections = panel ? shellUi.sectionsOf(panel) : [];
  const section = panel ? (sections.includes(route.section ?? '') ? route.section : sections[0]) : undefined;
  const goalIdx = goals.findIndex((g) => !g.done);
  const badges: Partial<Record<PanelId, number>> = {};
  for (const a of shellAlertList) if (a.route?.panel && a.severity !== 'info') badges[a.route.panel] = (badges[a.route.panel] ?? 0) + 1;
  const right = (
    <>
      <AlertsPanel alerts={shellAlertList} onAlert={onAlert} onSnooze={(a) => shellUi.snooze(a.key, s.week + 4)} />
      <ThisWeekCard s={s} onReport={() => s.lastReport && setReports([s.lastReport])} />
      {!s.gameOver && <GoalsCard goals={goals} onShow={showGoal} />}
      <div className="2xl:hidden"><StreetFeedCard s={s} /></div>
    </>
  );

  return (
    <Providers sheet={sheetApi} clarity={clarityApi} planner={plannerApi} orders={ordersApi} travel={travelApi} shell={shellApi}>
      <Shell
        top={(
          <TopBar s={s} speed={speed} setSpeed={(v) => { setSpeed(v); setClockNote(undefined); }} note={clockNote}
            onAdvance={startAdvance} pending={s.pendingEvents.length} answered={s.pendingEvents.length - unanswered.length}
            onReview={() => { setAdvancing(false); setEventIdx(Math.max(0, s.pendingEvents.findIndex((e) => !answers[e.iid]))); }}
            ticker={ticker} onNewGame={() => { setSpeed(0); setMenu('start'); }} onMainMenu={() => { setSpeed(0); setMenu('title'); }}
            seedInput={seedInput} setSeedInput={setSeedInput} slot={slot} pulse={s.week <= 4 && goalIdx >= 1 && unanswered.length === 0} />
        )}
        rail={<LeftRail visible={shellUi.visiblePanels} active={panel} badges={badges} dots={shellUi.dots} onOpen={(p) => { shellUi.seenPanel(p); if (panel === p) setRoute({}); else openRoute(p === lastRoute.panel ? lastRoute : { panel: p }); }} onHelp={() => setHelpMenu(true)} />}
        map={<MapView s={s} alerts={alertList} onAlert={() => {}} onOpenBusiness={() => go('business')} onEnvoy={(city) => plannerApi.plan('envoy', undefined, { city })} shell focus={mapFocus} />}
        overlay={(
          <>
            <div className="hidden 2xl:block absolute bottom-6 left-[340px] z-[1000] w-[320px]"><StreetFeedCard s={s} overlay /></div>
            {!s.gameOver && goalIdx >= 0 && !panel && (
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
        drawer={panel && (
          <Drawer s={s} panel={panel} section={section} sections={sections} ctx={sectionCtx} fresh={shellUi.fresh} escEnabled={!overlayOpen}
            onSection={(id) => { shellUi.seenSection(`${panel}.${id}`); openRoute({ panel, section: id }); }} onClose={() => setRoute({})} />
        )}
        right={right}
        rightIcons={<AlertsPanel alerts={shellAlertList} onAlert={onAlert} onSnooze={(a) => shellUi.snooze(a.key, s.week + 4)} iconsOnly />}
        bottom={<InMotionStrip chips={motion} onChip={onChip} />}
        alertCount={shellAlertList.length}
        danger={shellAlertList.some((a) => a.severity === 'danger')}
      />
      {shellUi.toast && <Toast text={shellUi.toast} onDone={shellUi.clearToast} />}
      {!menu && <HintHost s={s} route={route} overlayOpen={overlayOpen} motion={motion.length} alerts={shellAlertList.length} speed={speed} />}

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
      {current && !scene && (
        <EventModal s={s} ev={current} index={eventIdx!} total={s.pendingEvents.length} selected={answers[current.iid]} onChoose={choose} onClose={() => { setEventIdx(null); setAdvancing(false); }} />
      )}
      {cues.length > 0 && <CutscenePlayer key={`${s.week}:${cues.map((c) => c.key).join()}`} cues={cues} onDone={() => setCues([])} />}
      {night.length > 0 && !current && !cues.length && <ElectionNight s={s} results={night} onClose={() => setNight([])} />}
      {reels.length > 0 && !cues.length && !current && <NewspaperReel key={`${reels.length}:${reels[0].headline}`} reel={reels[0]} onDone={() => setReels((x) => x.slice(1))} />}
      {reports && !current && !sheet && !planner && !cues.length && !night.length && !reels.length && <ReportModal reports={reports} onClose={() => setReports(null)} />}
      {sheet && !current && (s.characters[sheet] || !s.pol?.people[sheet]
        ? <CharacterSheet s={s} id={sheet} onClose={() => setSheet(undefined)} />
        : <SheetFrame onClose={() => setSheet(undefined)}><div className="flex justify-end px-3 pt-3"><button className="btn-ghost text-xs" onClick={() => setSheet(undefined)}>Close</button></div><PolSheet s={s} id={sheet} embedded onClose={() => setSheet(undefined)} onOpen={(id) => setSheet(id)} /></SheetFrame>)}
      {ctxMenu && !current && <ContextMenu s={s} id={ctxMenu.id} x={ctxMenu.x} y={ctxMenu.y} category={ctxMenu.category as MenuCategoryId | undefined} onClose={() => setCtxMenu(undefined)} />}
      {picker && !current && !sheet && <PickerModal s={s} role={picker.role} pool={picker.pool} onPick={picker.onPick} onClose={() => setPicker(undefined)} />}
      {advice && !current && !sheet && !picker && !tripPlan && <WhatToDoModal s={s} answered={s.pendingEvents.length - unanswered.length} onTab={(t) => go(t)} onClose={() => setAdvice(false)} />}
      {helpMenu && (
        <Modal onClose={() => setHelpMenu(false)}>
          <div className="p-4 space-y-2" data-testid="help-menu">
            <div className="panel-title">Help</div>
            <button className="btn-ghost w-full border-gold-600 text-gold-300" data-testid="wsid-button" onClick={() => { setHelpMenu(false); setAdvice(true); }}>What should I do?</button>
            <button className="btn-ghost w-full" onClick={() => { setHelpMenu(false); setHelp({}); }}>The glossary: every term in the game</button>
            <p className="text-[11px] text-stone-500">Keys: Y H B L O D T C (or F1–F8) open the panels · Esc closes · Space pauses · right-click any face for everything you can do to him.</p>
          </div>
        </Modal>
      )}
      {help && <GlossaryOverlay focus={help.focus} onClose={() => setHelp(undefined)} />}
      {tripPlan && !current && !sheet && <TripPlanner key={`${tripPlan.leaderId}:${tripPlan.destId ?? ''}`} s={s} leaderId={tripPlan.leaderId} destId={tripPlan.destId} onClose={() => setTripPlan(undefined)} />}
      {fleeFor && !current && !sheet && <FleePlanner s={s} personId={fleeFor} onClose={() => setFleeFor(undefined)} />}
      {planner && !current && !sheet && <SchemePlanner s={s} kind={planner.kind} targetId={planner.targetId} initial={planner.opts} onClose={() => setPlanner(undefined)} />}
      {toast && <OrderToast s={s} item={toast} onClose={closeToast} onUndo={() => { setOrders((o) => o.filter((_, j) => j !== toast.index)); setToast(undefined); }} />}
    </Providers>
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
