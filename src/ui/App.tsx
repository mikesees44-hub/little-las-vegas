import { useEffect, useMemo, useState } from 'react';
import { alerts as computeAlerts, type Alert } from '../engine/alerts';
import { advanceMonth, advanceWeek } from '../engine/engine';
import { newGame } from '../engine/newGame';
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
import { Businesses } from './components/Businesses';
import { Holdings } from './econ/Holdings';
import { RealEstate } from './econ/RealEstate';
import { HQPanel } from './econ/HQPanel';
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
import { clearSave, loadGame, saveGame } from './save';
import { CityHall } from './cityhall/CityHall';
import { ElectionNight } from './cityhall/ElectionNight';
import type { ElectionResult } from '../engine/polState';

export type Tab = 'map' | 'tree' | 'business' | 'crew' | 'schemes' | 'table' | 'lifestyle' | 'family' | 'law' | 'town' | 'cityhall' | 'papers' | 'chronicle' | 'holdings' | 'realestate' | 'hq' | 'gifts';
/** The bar: ten groups. Family and Town hold sub-screens, so every screen stays reachable. */
const TABS: { id: Tab; label: string; subs?: { id: Tab; label: string }[] }[] = [
  { id: 'map', label: 'The Island' },
  { id: 'business', label: 'Rackets & Fronts', subs: [{ id: 'business', label: 'Buy & sell' }, { id: 'holdings', label: 'Holdings' }, { id: 'realestate', label: 'Real Estate' }, { id: 'hq', label: 'Headquarters' }] },
  { id: 'tree', label: 'Crew' },
  { id: 'crew', label: 'Administration' },
  { id: 'schemes', label: 'Schemes' },
  { id: 'table', label: 'The Table' },
  { id: 'family', label: 'Family', subs: [{ id: 'family', label: 'The House' }, { id: 'lifestyle', label: 'Lifestyle' }, { id: 'gifts', label: 'Gifts & Giving' }] },
  { id: 'town', label: 'Town', subs: [{ id: 'town', label: 'Underbelly & Office' }, { id: 'cityhall', label: 'City Hall' }, { id: 'papers', label: 'The Papers' }] },
  { id: 'law', label: 'The Law' },
  { id: 'chronicle', label: 'Chronicle' },
];
function tabGroup(t: Tab): Tab {
  return TABS.find((g) => g.id === t || g.subs?.some((x) => x.id === t))?.id ?? t;
}
type Mode = 'week' | 'month';

function freshSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function App() {
  const [s, setS] = useState<GameState>(() => loadGame() ?? newGame(freshSeed()));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [eventIdx, setEventIdx] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('week');
  const [advancing, setAdvancing] = useState(false);
  const [reports, setReports] = useState<WeeklyReport[] | null>(null);
  const [tab, setTab] = useState<Tab>('map');
  const [sheet, setSheet] = useState<string | undefined>();
  const [pendingLaw, setPendingLaw] = useState<SuccessionLaw | undefined>();
  const [pendingHeir, setPendingHeir] = useState<string | undefined>();
  const [seedInput, setSeedInput] = useState('');
  const [startPick, setStartPick] = useState<StartId>('classic');
  const [orders, setOrders] = useState<PlayerAction[]>([]);
  const ordersApi = useMemo(() => ({
    orders,
    queue: (a: PlayerAction) => setOrders((o) => [...o, a]),
    remove: (i: number) => setOrders((o) => o.filter((_, j) => j !== i)),
  }), [orders]);
  const sheetApi = useMemo(() => ({ open: (id: string) => setSheet(id) }), []);
  const [planner, setPlanner] = useState<{ kind: SchemeKind; targetId?: string; opts?: Partial<SchemeOptions> } | undefined>();
  const plannerApi = useMemo(() => ({ plan: (kind: SchemeKind, targetId?: string, opts?: Partial<SchemeOptions>) => { setSheet(undefined); setPlanner({ kind, targetId, opts }); } }), []);

  useEffect(() => saveGame(s), [s]);
  const [speed, setSpeed] = useState<Speed>(0);
  const [clockNote, setClockNote] = useState<string | undefined>();
  const [ticker, setTicker] = useState<string | undefined>();
  const [cues, setCues] = useState<CutsceneCue[]>([]);
  const [night, setNight] = useState<ElectionResult[]>([]);

  const unanswered = useMemo(() => s.pendingEvents.filter((e) => !answers[e.iid]), [s.pendingEvents, answers]);
  const alertList = useMemo(() => computeAlerts(s), [s]);

  function run(m: Mode, a: Record<string, string>, quiet = false) {
    const choices: PlayerChoices = { choices: a, successionLaw: pendingLaw, designatedHeirId: pendingHeir, actions: orders };
    if (m === 'week') {
      const r = advanceWeek(s, choices);
      setS(r.state);
      setNight(r.state.pol?.results.filter((x) => x.week >= s.week) ?? []);
      setCues(cutscenesBetween(s, r.state));
      if (quiet) {
        setTicker(tickerLine(r.report));
        const warn = newWarnings(s, r.state);
        if (warn.length || r.state.cutscenes?.length) {
          setSpeed(0);
          setClockNote(warn.length ? `Paused: ${warn[0]}` : 'Paused');
        }
      } else setReports([r.report]);
    } else {
      const r = advanceMonth(s, choices);
      setS(r.state);
      setNight(r.state.pol?.results.filter((x) => x.week >= s.week) ?? []);
      setCues(cutscenesBetween(s, r.state));
      setReports(r.reports);
    }
    setAnswers({});
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
    const next = { ...answers, [ev.iid]: choiceId };
    setAnswers(next);
    if (!advancing) {
      setEventIdx(eventIdx + 1 < s.pendingEvents.length ? eventIdx + 1 : null);
      return;
    }
    const nextIdx = s.pendingEvents.findIndex((e) => !next[e.iid]);
    if (nextIdx >= 0) setEventIdx(nextIdx);
    else run(mode, next);
  }

  function restart(seed?: string, start: StartId = 'classic') {
    clearSave();
    setS(newGameWith(seed || freshSeed(), start));
    setAnswers({});
    setOrders([]);
    setReports(null);
    setEventIdx(null);
    setSheet(undefined);
    setTab('map');
  }

  function onAlert(a: Alert) {
    if (a.charId) setSheet(a.charId);
    else if (a.tab) setTab(a.tab as Tab);
    else if (a.kind === 'decision') { setAdvancing(false); setEventIdx(0); }
  }

  const current = eventIdx !== null ? s.pendingEvents[eventIdx] : undefined;
  const busy = !!current || !!sheet || !!planner || !!reports || cues.length > 0;
  useClock({
    speed, s, busy, unanswered: unanswered.length,
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

  return (
    <SheetContext.Provider value={sheetApi}>
    <PlannerContext.Provider value={plannerApi}>
    <OrdersContext.Provider value={ordersApi}>
    <div className="mx-auto w-full max-w-[2400px] px-3 sm:px-4 xl:px-6 py-3 sm:py-4 space-y-3">
      <Header s={s}>
        {!s.gameOver && (
          <>
            <ClockControls speed={speed} setSpeed={(v) => { setSpeed(v); setClockNote(undefined); }} note={clockNote} />
            <MusicToggle />
            <button className="btn-gold py-1.5" onClick={() => startAdvance('week')}>Advance Week</button>
            <button className="btn-ghost py-1.5" onClick={() => startAdvance('month')}>Advance Month</button>
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
            {(Object.keys(STARTS) as StartId[]).map((k) => (
              <button key={k} className={k === 'classic' ? 'btn-gold' : 'btn-ghost'} title={STARTS[k].text} onClick={() => restart(undefined, k)}>{STARTS[k].name}</button>
            ))}
          </div>
        </div>
      )}

      {!s.gameOver && <OrdersTray s={s} />}

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

      {tab === 'map' ? (
        <MapView s={s} alerts={alertList} onAlert={onAlert} onOpenBusiness={() => setTab('business')} onEnvoy={(city) => plannerApi.plan('envoy', undefined, { city })} />
      ) : (
        <main className="panel p-3 sm:p-4">
          {tab === 'business' && <Businesses s={s} />}
          {tab === 'holdings' && <Holdings s={s} />}
          {tab === 'realestate' && <RealEstate s={s} />}
          {tab === 'hq' && <HQPanel s={s} />}
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
              <UnderbellyPanel s={s} />
            </div>
          )}
          {tab === 'cityhall' && <CityHall s={s} />}
          {tab === 'papers' && <Newspapers s={s} />}
          {tab === 'chronicle' && <Chronicle s={s} />}
        </main>
      )}

      <footer className="panel p-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span>Seed: <span className="text-stone-300">{s.seed}</span></span>
        <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} placeholder="seed (optional)" className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200 w-36" />
        <select value={startPick} onChange={(e) => setStartPick(e.target.value as StartId)} title={STARTS[startPick].text} data-testid="start-pick" className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200">
          {(Object.keys(STARTS) as StartId[]).map((k) => <option key={k} value={k}>{STARTS[k].name}</option>)}
        </select>
        <button className="btn-ghost text-xs py-1" onClick={() => window.confirm(`Abandon this game and start over? ${STARTS[startPick].text}`) && restart(seedInput.trim(), startPick)}>New game</button>
        <span className="ml-auto">Saved automatically in this browser.</span>
      </footer>

      {current && (
        <EventModal s={s} ev={current} index={eventIdx!} total={s.pendingEvents.length} selected={answers[current.iid]} onChoose={choose} onClose={() => { setEventIdx(null); setAdvancing(false); }} />
      )}
      {cues.length > 0 && <CutscenePlayer key={`${s.week}:${cues.map((c) => c.key).join()}`} cues={cues} onDone={() => setCues([])} />}
      {night.length > 0 && !current && !cues.length && <ElectionNight s={s} results={night} onClose={() => setNight([])} />}
      {reports && !current && !sheet && !planner && !cues.length && !night.length && <ReportModal reports={reports} onClose={() => setReports(null)} />}
      {sheet && !current && <CharacterSheet s={s} id={sheet} onClose={() => setSheet(undefined)} />}
      {planner && !current && !sheet && <SchemePlanner s={s} kind={planner.kind} targetId={planner.targetId} initial={planner.opts} onClose={() => setPlanner(undefined)} />}
    </div>
    </OrdersContext.Provider>
    </PlannerContext.Provider>
    </SheetContext.Provider>
  );
}
