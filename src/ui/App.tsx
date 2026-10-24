import { useEffect, useMemo, useState } from 'react';
import { advanceMonth, advanceWeek } from '../engine/engine';
import { newGame } from '../engine/newGame';
import type { GameState, PlayerAction, PlayerChoices, SuccessionLaw, WeeklyReport } from '../engine/types';
import { Businesses } from './components/Businesses';
import { OrdersContext, OrdersTray } from './components/Orders';
import { Chronicle } from './components/Chronicle';
import { CrewList } from './components/CrewList';
import { EventModal } from './components/EventModal';
import { FamilyTree } from './components/FamilyTree';
import { Header } from './components/Header';
import { Overview } from './components/Overview';
import { ReportModal } from './components/ReportModal';
import { clearSave, loadGame, saveGame } from './save';

type Tab = 'island' | 'business' | 'crew' | 'family' | 'chronicle';
const TABS: { id: Tab; label: string }[] = [
  { id: 'island', label: 'The Island' },
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
  const [tab, setTab] = useState<Tab>('island');
  const [pendingLaw, setPendingLaw] = useState<SuccessionLaw | undefined>();
  const [pendingHeir, setPendingHeir] = useState<string | undefined>();
  const [seedInput, setSeedInput] = useState('');
  const [orders, setOrders] = useState<PlayerAction[]>([]);
  const ordersApi = useMemo(() => ({
    orders,
    queue: (a: PlayerAction) => setOrders((o) => [...o, a]),
    remove: (i: number) => setOrders((o) => o.filter((_, j) => j !== i)),
  }), [orders]);

  useEffect(() => saveGame(s), [s]);

  const unanswered = useMemo(() => s.pendingEvents.filter((e) => !answers[e.iid]), [s.pendingEvents, answers]);

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
      // Reviewing: walk through events in order, then close.
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
    setTab('island');
  }

  const current = eventIdx !== null ? s.pendingEvents[eventIdx] : undefined;

  return (
    <OrdersContext.Provider value={ordersApi}>
    <div className="mx-auto max-w-5xl px-4 py-4 sm:py-6 space-y-4">
      <Header s={s} />

      {s.gameOver ? (
        <div className="panel p-6 text-center">
          <h2 className="font-display text-3xl text-gold-400">The End of the House of {s.houseName}</h2>
          <p className="mt-2 text-stone-300">{s.gameOver.text}</p>
          <button className="btn-gold mt-4" onClick={() => restart()}>Start a new dynasty</button>
        </div>
      ) : (
        <div className="panel p-3 flex flex-wrap items-center gap-2 sticky top-0 z-20">
          <button className="btn-gold flex-1 sm:flex-none" onClick={() => startAdvance('week')}>
            Advance Week
          </button>
          <button className="btn-ghost flex-1 sm:flex-none" onClick={() => startAdvance('month')}>
            Advance Month
          </button>
          <div className="text-xs text-stone-400 w-full sm:w-auto sm:ml-2">
            {s.pendingEvents.length ? (
              <>
                {s.pendingEvents.length - unanswered.length}/{s.pendingEvents.length} decisions made ·{' '}
                <button className="underline text-gold-300" onClick={() => { setAdvancing(false); setEventIdx(0); }}>review</button>
              </>
            ) : (
              'Nothing on the table this week.'
            )}
            {s.lastReport && (
              <>
                {' · '}
                <button className="underline text-gold-300" onClick={() => setReports([s.lastReport!])}>last report</button>
              </>
            )}
          </div>
        </div>
      )}

      {!s.gameOver && <OrdersTray s={s} />}

      <nav className="flex overflow-x-auto border-b border-noir-700">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'tab-active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="panel p-3 sm:p-4">
        {tab === 'island' && <Overview s={s} />}
        {tab === 'business' && <Businesses s={s} />}
        {tab === 'crew' && <CrewList s={s} />}
        {tab === 'family' && (
          <FamilyTree s={s} pendingLaw={pendingLaw} pendingHeir={pendingHeir} onLaw={setPendingLaw} onHeir={setPendingHeir} />
        )}
        {tab === 'chronicle' && <Chronicle s={s} />}
      </main>

      <footer className="panel p-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span>Seed: <span className="text-stone-300">{s.seed}</span></span>
        <input
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          placeholder="seed (optional)"
          className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200 w-36"
        />
        <button className="btn-ghost text-xs py-1" onClick={() => window.confirm('Abandon this game and start over?') && restart(seedInput.trim())}>
          New game
        </button>
        <span className="ml-auto">Saved automatically in this browser.</span>
      </footer>

      {current && (
        <EventModal
          s={s}
          ev={current}
          index={eventIdx!}
          total={s.pendingEvents.length}
          selected={answers[current.iid]}
          onChoose={choose}
          onClose={() => { setEventIdx(null); setAdvancing(false); }}
        />
      )}
      {reports && !current && <ReportModal reports={reports} onClose={() => setReports(null)} />}
    </div>
    </OrdersContext.Provider>
  );
}
