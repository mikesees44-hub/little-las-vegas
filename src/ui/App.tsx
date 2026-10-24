import { useEffect, useMemo, useState } from 'react';
import { alerts as computeAlerts, type Alert } from '../engine/alerts';
import { advanceMonth, advanceWeek } from '../engine/engine';
import { newGame } from '../engine/newGame';
import type { GameState, PlayerAction, PlayerChoices, SuccessionLaw, WeeklyReport } from '../engine/types';
import { Businesses } from './components/Businesses';
import { CharacterSheet } from './components/CharacterSheet';
import { Chronicle } from './components/Chronicle';
import { CrewList } from './components/CrewList';
import { EventModal } from './components/EventModal';
import { FamilyTree } from './components/FamilyTree';
import { Header } from './components/Header';
import { IslandMap } from './components/IslandMap';
import { AlertRail, DistrictPanel, PlayerCard } from './components/MapSide';
import { OrdersContext, OrdersTray } from './components/Orders';
import { Overview } from './components/Overview';
import { SheetContext } from './components/People';
import { ReportModal } from './components/ReportModal';
import { clearSave, loadGame, saveGame } from './save';

export type Tab = 'map' | 'business' | 'crew' | 'family' | 'chronicle';
const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: 'The Island' },
  { id: 'business', label: 'Rackets & Fronts' },
  { id: 'crew', label: 'Crew' },
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
  const [district, setDistrict] = useState<string | undefined>();
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

  useEffect(() => saveGame(s), [s]);

  const unanswered = useMemo(() => s.pendingEvents.filter((e) => !answers[e.iid]), [s.pendingEvents, answers]);
  const alertList = useMemo(() => computeAlerts(s), [s]);

  function run(m: Mode, a: Record<string, string>) {
    const choices: PlayerChoices = { choices: a, successionLaw: pendingLaw, designatedHeirId: pendingHeir, actions: orders };
    if (m === 'week') {
      const r = advanceWeek(s, choices);
      setS(r.state);
      setReports([r.report]);
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
    setDistrict(undefined);
    setTab('map');
  }

  function onAlert(a: Alert) {
    if (a.charId) setSheet(a.charId);
    else if (a.tab) setTab(a.tab as Tab);
    else if (a.kind === 'decision') { setAdvancing(false); setEventIdx(0); }
  }

  const current = eventIdx !== null ? s.pendingEvents[eventIdx] : undefined;

  return (
    <SheetContext.Provider value={sheetApi}>
    <OrdersContext.Provider value={ordersApi}>
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-3 sm:py-5 space-y-3">
      <Header s={s}>
        {!s.gameOver && (
          <>
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
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="panel relative overflow-hidden">
            <IslandMap s={s} selected={district} onSelect={setDistrict} />
            <div className="absolute left-2 bottom-2 z-10"><PlayerCard s={s} /></div>
            <div className="absolute right-2 top-12 z-20"><AlertRail s={s} items={alertList} onAlert={onAlert} /></div>
          </div>
          <aside className="panel p-3 sm:p-4 lg:max-h-[82vh] lg:overflow-y-auto">
            {district ? (
              <>
                <button className="text-xs text-stone-500 hover:text-gold-300 mb-2" onClick={() => setDistrict(undefined)}>← the whole island</button>
                <DistrictPanel s={s} id={district} onOpenBusiness={() => setTab('business')} />
              </>
            ) : <Overview s={s} />}
          </aside>
        </div>
      ) : (
        <main className="panel p-3 sm:p-4">
          {tab === 'business' && <Businesses s={s} />}
          {tab === 'crew' && <CrewList s={s} />}
          {tab === 'family' && (
            <FamilyTree s={s} pendingLaw={pendingLaw} pendingHeir={pendingHeir} onLaw={setPendingLaw} onHeir={setPendingHeir} />
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
      {reports && !current && !sheet && <ReportModal reports={reports} onClose={() => setReports(null)} />}
      {sheet && !current && <CharacterSheet s={s} id={sheet} onClose={() => setSheet(undefined)} />}
    </div>
    </OrdersContext.Provider>
    </SheetContext.Provider>
  );
}
