import { useEffect, useMemo, useState } from 'react';
import { alerts as computeAlerts, type Alert } from '../engine/alerts';
import { advanceMonth, advanceWeek } from '../engine/engine';
import { newGame } from '../engine/newGame';
import type { GameState, PlayerAction, PlayerChoices, SchemeKind, SchemeOptions, SuccessionLaw, WeeklyReport } from '../engine/types';
import { MapView } from './map/MapView';
import { ClockControls, newWarnings, tickerLine, useClock, type Speed } from './clock';
import { PlannerContext, SchemePlanner, SchemesPanel } from './components/Schemes';
import { TablePanel } from './components/TablePanel';
import { Businesses } from './components/Businesses';
import { CharacterSheet } from './components/CharacterSheet';
import { Chronicle } from './components/Chronicle';
import { CrewList } from './components/CrewList';
import { EventModal } from './components/EventModal';
import { FamilyTab } from './family/FamilyTab';
import { Header } from './components/Header';
import { OrdersContext, OrdersTray } from './components/Orders';
import { SheetContext } from './components/People';
import { ReportModal } from './components/ReportModal';
import { clearSave, loadGame, saveGame } from './save';

export type Tab = 'map' | 'business' | 'crew' | 'schemes' | 'table' | 'family' | 'chronicle';
const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: 'The Island' },
  { id: 'business', label: 'Rackets & Fronts' },
  { id: 'crew', label: 'Administration' },
  { id: 'schemes', label: 'Schemes' },
  { id: 'table', label: 'The Table' },
  { id: 'family', label: 'Family' },
  { id: 'chronicle', label: 'Chronicle' },
];
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

  const unanswered = useMemo(() => s.pendingEvents.filter((e) => !answers[e.iid]), [s.pendingEvents, answers]);
  const alertList = useMemo(() => computeAlerts(s), [s]);

  function run(m: Mode, a: Record<string, string>, quiet = false) {
    const choices: PlayerChoices = { choices: a, successionLaw: pendingLaw, designatedHeirId: pendingHeir, actions: orders };
    if (m === 'week') {
      const r = advanceWeek(s, choices);
      setS(r.state);
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

  function restart(seed?: string) {
    clearSave();
    setS(newGame(seed || freshSeed()));
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
  const busy = !!current || !!sheet || !!planner || !!reports;
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
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-3 sm:py-5 space-y-3">
      <Header s={s}>
        {!s.gameOver && (
          <>
            <ClockControls speed={speed} setSpeed={(v) => { setSpeed(v); setClockNote(undefined); }} note={clockNote} />
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
          <button className="btn-gold mt-4" onClick={() => restart()}>Start a new dynasty</button>
        </div>
      )}

      {!s.gameOver && <OrdersTray s={s} />}

      <nav className="flex overflow-x-auto border-b border-noir-700">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'tab-active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'map' ? (
        <MapView s={s} alerts={alertList} onAlert={onAlert} onOpenBusiness={() => setTab('business')} onEnvoy={(city) => plannerApi.plan('envoy', undefined, { city })} />
      ) : (
        <main className="panel p-3 sm:p-4">
          {tab === 'business' && <Businesses s={s} />}
          {tab === 'crew' && <CrewList s={s} />}
          {tab === 'schemes' && <SchemesPanel s={s} />}
          {tab === 'table' && <TablePanel s={s} />}
          {tab === 'family' && (
            <FamilyTab s={s} pendingLaw={pendingLaw} pendingHeir={pendingHeir} onLaw={setPendingLaw} onHeir={setPendingHeir} />
          )}
          {tab === 'chronicle' && <Chronicle s={s} />}
        </main>
      )}

      <footer className="panel p-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span>Seed: <span className="text-stone-300">{s.seed}</span></span>
        <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} placeholder="seed (optional)" className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200 w-36" />
        <button className="btn-ghost text-xs py-1" onClick={() => window.confirm('Abandon this game and start over?') && restart(seedInput.trim())}>New game</button>
        <span className="ml-auto">Saved automatically in this browser.</span>
      </footer>

      {current && (
        <EventModal s={s} ev={current} index={eventIdx!} total={s.pendingEvents.length} selected={answers[current.iid]} onChoose={choose} onClose={() => { setEventIdx(null); setAdvancing(false); }} />
      )}
      {reports && !current && !sheet && !planner && <ReportModal reports={reports} onClose={() => setReports(null)} />}
      {sheet && !current && <CharacterSheet s={s} id={sheet} onClose={() => setSheet(undefined)} />}
      {planner && !current && !sheet && <SchemePlanner s={s} kind={planner.kind} targetId={planner.targetId} initial={planner.opts} onClose={() => setPlanner(undefined)} />}
    </div>
    </OrdersContext.Provider>
    </PlannerContext.Provider>
    </SheetContext.Provider>
  );
}
