import { useEffect, useMemo, useState } from 'react';
import { alerts as computeAlerts, type Alert } from '../engine/alerts';
import { advanceMonth, advanceWeek } from '../engine/engine';
import { STARTS, newGameWith, type StartId } from '../engine/starts';
import type { CutsceneCue, GameState, PlayerAction, PlayerChoices, SchemeKind, SchemeOptions, SuccessionLaw, WeeklyReport } from '../engine/types';
import { MapView } from './map/MapView';
import { cutscenesBetween } from '../engine/cutscenes';
import { CutscenePlayer } from './cutscene/Cutscene';
import { MusicToggle } from './audio';
import { ClockControls, newWarnings, tickerLine, useClock, type Speed } from './clock';
import { PlannerContext, SchemePlanner, SchemesPanel } from './components/Schemes';
import { TablePanel } from './components/TablePanel';
import { LifestylePanel } from './components/Lifestyle';
import { Newspapers } from './components/Newspaper';
import { LawPanel } from './components/LawPanel';
import { UnderbellyPanel } from './components/UnderbellyPanel';
import { OfficePanel } from './components/OfficePanel';
import { PowerTab, type PowerSub } from './power/PowerTab';
import { AudiencePanel } from './power/AudiencePanel';
import { CrisisBanner } from './power/CrisisBanner';
import { Businesses } from './components/Businesses';
import { Holdings } from './econ/Holdings';
import { RealEstate } from './econ/RealEstate';
import { HQPanel } from './econ/HQPanel';
import { TheBooks } from './books/TheBooks';
import { GiftsPanel } from './econ/Gifts';
import { CharacterSheet } from './components/CharacterSheet';
import { Chronicle } from './components/Chronicle';
import { CrewList } from './components/CrewList';
import { CrewTree } from './components/CrewTree';
import { EventModal } from './components/EventModal';
import { FamilyTab } from './family/FamilyTab';
import { Header } from './components/Header';
import { OrdersContext, OrdersTray } from './components/Orders';
import { SheetContext } from './components/People';
import { ReportModal } from './components/ReportModal';
import { ClarityContext, type ClarityApi } from './clarity/context';
import { PickerModal } from './clarity/CandidatePicker';
import { GlossaryOverlay, HelpButton } from './clarity/Glossary';
import { WhatToDoModal } from './clarity/WhatToDo';
import type { Candidate, Role } from '../engine/candidates';
import { currentSlot, loadSlot, saveSlot, setCurrentSlot } from './save';
import { StartMenu, type MenuScreen } from './menu/StartMenu';
import { registerAppearances } from './portrait/genes';
import { applySettings, getSettings } from './settings';
import { TravelContext } from './travel/context';
import { TripPlanner } from './travel/TripPlanner';
import { FleePlanner } from './travel/FleePlanner';
import { FugitiveBanner } from './travel/Panels';
import { minigameOf, opensScene } from '../engine/minigames';
import { MinigameScreen } from './minigames/MinigameScreen';
import { NewspaperReel, type Reel } from './minigames/NewspaperReel';

import { CityHall } from './cityhall/CityHall';
import { ElectionNight } from './cityhall/ElectionNight';
import type { ElectionResult } from '../engine/polState';

export type Tab = 'map' | 'tree' | 'business' | 'crew' | 'schemes' | 'table' | 'lifestyle' | 'family' | 'law' | 'town' | 'cityhall' | 'papers' | 'chronicle' | 'holdings' | 'realestate' | 'hq' | 'books' | 'gifts' | PowerSub;
/** The bar: ten groups. Family and Town hold sub-screens, so every screen stays reachable. */
const TABS: { id: Tab; label: string; subs?: { id: Tab; label: string }[] }[] = [
  { id: 'map', label: 'The Island' },
  { id: 'business', label: 'Rackets & Fronts', subs: [{ id: 'business', label: 'Buy & sell' }, { id: 'holdings', label: 'Holdings' }, { id: 'realestate', label: 'Real Estate' }, { id: 'hq', label: 'Headquarters' }, { id: 'books', label: 'The Books' }] },
  { id: 'tree', label: 'Crew' },
  { id: 'crew', label: 'Administration' },
  { id: 'schemes', label: 'Schemes' },
  { id: 'table', label: 'The Table' },
  { id: 'family', label: 'Family', subs: [{ id: 'family', label: 'The House' }, { id: 'lifestyle', label: 'Lifestyle' }, { id: 'gifts', label: 'Gifts & Giving' }] },
  { id: 'power', label: 'Power', subs: [{ id: 'power', label: 'Heirs & Ambition' }, { id: 'grievances', label: 'Passed Over' }, { id: 'blitz', label: 'Balance & Blitz' }, { id: 'front', label: 'The Front' }] },
  { id: 'town', label: 'Town', subs: [{ id: 'town', label: 'Underbelly & Office' }, { id: 'cityhall', label: 'City Hall' }, { id: 'papers', label: 'The Papers' }] },
  { id: 'law', label: 'The Law' },
  { id: 'chronicle', label: 'Chronicle' },
];
function tabGroup(t: Tab): Tab {
  return TABS.find((g) => g.id === t || g.subs?.some((x) => x.id === t))?.id ?? t;
}
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
  const [tab, setTab] = useState<Tab>('map');
  const [sheet, setSheet] = useState<string | undefined>();
  const [pendingLaw, setPendingLaw] = useState<SuccessionLaw | undefined>();
  const [pendingHeir, setPendingHeir] = useState<string | undefined>();
  const [seedInput, setSeedInput] = useState('');
  const [orders, setOrders] = useState<PlayerAction[]>([]);
  const ordersApi = useMemo(() => ({
    orders,
    queue: (a: PlayerAction) => setOrders((o) => [...o, a]),
    remove: (i: number) => setOrders((o) => o.filter((_, j) => j !== i)),
  }), [orders]);
  const sheetApi = useMemo(() => ({ open: (id: string) => setSheet(id) }), []);
  const [planner, setPlanner] = useState<{ kind: SchemeKind; targetId?: string; opts?: Partial<SchemeOptions> } | undefined>();
  const plannerApi = useMemo(() => ({ plan: (kind: SchemeKind, targetId?: string, opts?: Partial<SchemeOptions>) => { setSheet(undefined); setPlanner({ kind, targetId, opts }); } }), []);

  const [picker, setPicker] = useState<{ role: Role; pool?: string[]; onPick?: (c: Candidate) => void } | undefined>();
  const [help, setHelp] = useState<{ focus?: string } | undefined>();
  const [advice, setAdvice] = useState(false);
  const clarityApi = useMemo<ClarityApi>(() => ({
    openPicker: (role, opts) => { setSheet(undefined); setPicker({ role, pool: opts?.pool, onPick: opts?.onPick }); },
    openHelp: (focus) => setHelp({ focus }),
    openAdvice: () => setAdvice(true),
    goTab: (t) => setTab(t as Tab),
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
      } else setReports([r.report]);
    } else {
      const r = advanceMonth(s, choices);
      setS(r.state);
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
    setTab('map');
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

  function onAlert(a: Alert) {
    if (a.charId) setSheet(a.charId);
    else if (a.tab) setTab(a.tab as Tab);
    else if (a.kind === 'decision') { setAdvancing(false); setEventIdx(0); }
  }

  const current = eventIdx !== null ? s.pendingEvents[eventIdx] : undefined;
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
      if (e.code !== 'Space' || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      e.preventDefault();
      setSpeed((v) => (v === 0 ? 2 : 0));
      setClockNote(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (menu) {
    return (
      <StartMenu key={menu} initial={menu} inGame={!s.gameOver && !!loadSlot(slot)} seedHint={seedInput.trim() || undefined}
        onBack={() => setMenu(undefined)} onContinue={continueSlot} onStart={beginGame} />
    );
  }

  return (
    <SheetContext.Provider value={sheetApi}>
    <ClarityContext.Provider value={clarityApi}>
    <PlannerContext.Provider value={plannerApi}>
    <OrdersContext.Provider value={ordersApi}>
    <TravelContext.Provider value={travelApi}>
    <div className="mx-auto w-full max-w-[2400px] px-3 sm:px-4 xl:px-6 py-3 sm:py-4 space-y-3">
      <Header s={s}>
        {!s.gameOver && (
          <>
            <ClockControls speed={speed} setSpeed={(v) => { setSpeed(v); setClockNote(undefined); }} note={clockNote} />
            <MusicToggle />
            <button className="btn-gold py-1.5" onClick={() => startAdvance('week')}>Advance Week</button>
            <button className="btn-ghost py-1.5" onClick={() => startAdvance('month')}>Advance Month</button>
            <button className="btn-ghost py-1.5 border-gold-600 text-gold-300" onClick={() => setAdvice(true)} data-testid="wsid-button">What should I do?</button>
            <HelpButton onClick={() => setHelp({})} />
            <div className="text-xs text-stone-400">
              {s.pendingEvents.length ? (
                <>
                  {s.pendingEvents.length - unanswered.length}/{s.pendingEvents.length} decisions made ·{' '}
                  <button className="underline text-gold-300" onClick={() => { setAdvancing(false); setEventIdx(0); }}>review</button>
                </>
              ) : 'Nothing on the table this week.'}
              {orders.length > 0 && <> · {orders.length} order{orders.length > 1 ? 's' : ''} queued</>}
              {s.lastReport && <> · <button className="underline text-gold-300" onClick={() => setReports([s.lastReport!])}>last report</button></>}
              {ticker && speed > 0 && <div className="text-[11px] text-stone-500 truncate max-w-[60vw]">{ticker}</div>}
            </div>
          </>
        )}
      </Header>

      {s.gameOver && (
        <div className="panel p-6 text-center">
          <h2 className="font-display text-3xl text-gold-400">The End of the House of {s.houseName}</h2>
          <p className="mt-2 text-stone-300">{s.gameOver.text}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className="btn-gold" onClick={() => setMenu('start')}>New Game…</button>
            {(Object.keys(STARTS) as StartId[]).map((k) => (
              <button key={k} className="btn-ghost" title={STARTS[k].text} onClick={() => restart(undefined, k)}>{STARTS[k].name}</button>
            ))}
          </div>
        </div>
      )}

      {!s.gameOver && <OrdersTray s={s} />}
      {!s.gameOver && <CrisisBanner s={s} onOpen={() => setTab('power')} />}

      <nav className="tabbar flex overflow-x-auto border-b border-noir-700" data-testid="tabbar">
        {TABS.map((t) => (
          <button key={t.id} data-tab={t.id} className={`tab ${tabGroup(tab) === t.id ? 'tab-active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      {(() => {
        const g = TABS.find((x) => x.id === tabGroup(tab));
        return g?.subs ? (
          <div className="flex flex-wrap gap-1 -mt-2" data-testid="subtabs">
            {g.subs.map((x) => (
              <button key={x.id} data-tab={x.id} className={`text-xs px-2 py-1 rounded ${tab === x.id ? 'bg-noir-700 text-gold-400' : 'text-stone-400 hover:text-stone-200'}`} onClick={() => setTab(x.id)}>{x.label}</button>
            ))}
          </div>
        ) : null;
      })()}

      {!s.gameOver && <FugitiveBanner s={s} onOpen={() => setTab('law')} />}
      {tab === 'map' ? (
        <MapView s={s} alerts={alertList} onAlert={onAlert} onOpenBusiness={() => setTab('business')} onEnvoy={(city) => plannerApi.plan('envoy', undefined, { city })} />
      ) : (
        <main className="panel p-3 sm:p-4">
          {tab === 'business' && <Businesses s={s} />}
          {tab === 'holdings' && <Holdings s={s} />}
          {tab === 'realestate' && <RealEstate s={s} />}
          {tab === 'hq' && <HQPanel s={s} />}
          {tab === 'books' && <TheBooks s={s} />}
          {tab === 'gifts' && <GiftsPanel s={s} />}
          {tab === 'tree' && <CrewTree s={s} />}
          {tab === 'crew' && <CrewList s={s} />}
          {tab === 'schemes' && <SchemesPanel s={s} />}
          {tab === 'table' && <TablePanel s={s} />}
          {tab === 'lifestyle' && <LifestylePanel s={s} />}
          {tab === 'family' && (
            <FamilyTab s={s} pendingLaw={pendingLaw} pendingHeir={pendingHeir} onLaw={setPendingLaw} onHeir={setPendingHeir} />
          )}
          {tab === 'law' && <LawPanel s={s} />}
          {tab === 'town' && (
            <div className="space-y-6">
              <OfficePanel s={s} />
              <AudiencePanel s={s} />
              <UnderbellyPanel s={s} />
            </div>
          )}
          {tab === 'cityhall' && <CityHall s={s} />}
          {tab === 'papers' && <Newspapers s={s} />}
          {(tab === 'power' || tab === 'grievances' || tab === 'blitz' || tab === 'front') && <PowerTab s={s} sub={tab} />}
          {tab === 'chronicle' && <Chronicle s={s} />}
        </main>
      )}

      <footer className="panel p-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span>Seed: <span className="text-stone-300">{s.seed}</span></span>
        <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} placeholder="seed (optional)" className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200 w-36" />
        <button className="btn-ghost text-xs py-1" data-testid="footer-new" onClick={() => { setSpeed(0); setMenu('start'); }}>New Game</button>
        <button className="btn-ghost text-xs py-1" data-testid="footer-menu" onClick={() => { setSpeed(0); setMenu('title'); }}>Main Menu</button>
        <span className="ml-auto">Saved automatically in slot {slot}{s.flags.ironman ? ' · ironman' : ''}.</span>
      </footer>

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
      {sheet && !current && <CharacterSheet s={s} id={sheet} onClose={() => setSheet(undefined)} />}
      {picker && !current && !sheet && <PickerModal s={s} role={picker.role} pool={picker.pool} onPick={picker.onPick} onClose={() => setPicker(undefined)} />}
      {advice && !current && !sheet && !picker && !tripPlan && <WhatToDoModal s={s} answered={s.pendingEvents.length - unanswered.length} onTab={(t) => setTab(t as Tab)} onClose={() => setAdvice(false)} />}
      {help && <GlossaryOverlay focus={help.focus} onClose={() => setHelp(undefined)} />}
      {tripPlan && !current && !sheet && <TripPlanner key={`${tripPlan.leaderId}:${tripPlan.destId ?? ''}`} s={s} leaderId={tripPlan.leaderId} destId={tripPlan.destId} onClose={() => setTripPlan(undefined)} />}
      {fleeFor && !current && !sheet && <FleePlanner s={s} personId={fleeFor} onClose={() => setFleeFor(undefined)} />}
      {planner && !current && !sheet && <SchemePlanner s={s} kind={planner.kind} targetId={planner.targetId} initial={planner.opts} onClose={() => setPlanner(undefined)} />}
    </div>
    </TravelContext.Provider>
    </OrdersContext.Provider>
    </PlannerContext.Provider>
    </ClarityContext.Provider>
    </SheetContext.Provider>
  );
}
