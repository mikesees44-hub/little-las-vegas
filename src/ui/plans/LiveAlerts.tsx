import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../engine/types';
import { useSheet } from '../components/People';
import { getSettings, pausesOn, setSettings } from '../settings';
import { useShell } from '../shell/context';
import { usePlansApi } from './context';
import { emptyFeed, happenings, ingest, nextToast, type FeedState, type Happening, type HapSeverity } from './happenings';

const SEV: Record<HapSeverity, { dot: string; text: string; box: string }> = {
  danger: { dot: 'bg-red-500', text: 'text-red-200', box: 'border-red-500 bg-blood-500/90 text-white' },
  warn: { dot: 'bg-amber-500', text: 'text-amber-200', box: 'border-amber-500 bg-noir-900/95 text-amber-100' },
  good: { dot: 'bg-emerald-500', text: 'text-emerald-200', box: 'border-emerald-600 bg-noir-900/95 text-emerald-100' },
  info: { dot: 'bg-stone-500', text: 'text-stone-300', box: 'border-noir-600 bg-noir-900/95 text-stone-200' },
};

/** Where a happening goes when clicked. */
function useGoTo() {
  const api = usePlansApi();
  const shell = useShell();
  const sheet = useSheet();
  return (h: Happening) => {
    const g = h.go;
    if (!g) return;
    if (g.focus) shell.focus(g.focus);
    if (g.urgent) api.urgent(g.urgent);
    else if (g.decisions) api.decisions();
    else if (g.charId) sheet.open(g.charId);
    else if (g.route) shell.go(g.route);
  };
}

/**
 * The live alerts: a slim strip under the top bar with the latest news as the
 * days tick (click for the list; each line opens what it is about), and a
 * toast for the important ones, one at a time. Danger stops the running
 * clock (Settings › "On an alarm": a rival strikes, a plot, an arrest…).
 * "Quiet" keeps the small news out of the strip and the good news out of the toasts.
 */
export function LiveAlerts({ s, running }: { s: GameState; running: boolean }) {
  const api = usePlansApi();
  const goTo = useGoTo();
  const prev = useRef<GameState>(s);
  const [feed, setFeed] = useState<FeedState>(emptyFeed);
  const [toast, setToast] = useState<Happening | undefined>();
  const [quiet, setQuiet] = useState(() => !!getSettings().quietLowAlerts);
  const [list, setList] = useState(false);
  const runRef = useRef(running);
  runRef.current = running;

  useEffect(() => {
    const p = prev.current;
    prev.current = s;
    const hs = happenings(p, s);
    if (!hs.length) return;
    setFeed((f) => ingest(f, hs, quiet));
    const stop = hs.find((h) => h.interrupt);
    if (stop && runRef.current && pausesOn('pauseOnAlarm')) api.pause(stop.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  // One toast at a time, a gap between them.
  useEffect(() => {
    if (toast || !feed.queue.length) return;
    const tick = () => {
      const r = nextToast(feed, Date.now());
      if (r.toast) { setFeed(r.f); setToast(r.toast); }
    };
    const wait = Math.max(0, feed.lastToastAt + 3500 - Date.now());
    const t = setTimeout(tick, wait);
    return () => clearTimeout(t);
  }, [feed, toast]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), toast.severity === 'danger' ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleQuiet = () => { const q = !quiet; setQuiet(q); setSettings({ quietLowAlerts: q }); };
  const latest = feed.feed[0];
  return (
    <>
      {latest && (
        <div className="relative z-[1140] flex items-center gap-2 border-b border-noir-800 bg-noir-950/90 px-2 py-0.5 text-[11px]" data-testid="alert-strip">
          <span className="shrink-0 text-[9px] uppercase tracking-[0.25em] text-stone-500">Just now</span>
          <button type="button" className={`min-w-0 flex-1 truncate text-left hover:underline ${SEV[latest.severity].text}`} onClick={() => goTo(latest)} data-testid="alert-latest">
            <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${SEV[latest.severity].dot}`} />{latest.text}
          </button>
          {feed.feed.length > 1 && <button type="button" className="shrink-0 text-gold-400 hover:text-gold-300" onClick={() => setList((x) => !x)} aria-expanded={list} data-testid="alert-more">{list ? 'hide' : `+${feed.feed.length - 1} ▾`}</button>}
          <button type="button" className={`shrink-0 rounded border px-1 text-[10px] ${quiet ? 'border-gold-600 text-gold-300' : 'border-noir-600 text-stone-500'}`} onClick={toggleQuiet} aria-pressed={quiet} title="Quiet: keep small news out of the strip and good news out of the pop-ups" data-testid="alert-quiet">{quiet ? '🔕 quiet' : 'quiet'}</button>
          {list && (
            <ul className="absolute left-2 right-2 sm:left-auto sm:w-[420px] top-full mt-0.5 max-h-[50vh] overflow-y-auto panel p-1 space-y-0.5" data-testid="alert-list">
              {feed.feed.map((h) => (
                <li key={h.key}>
                  <button type="button" className={`w-full truncate rounded px-1.5 py-1 text-left hover:bg-noir-800 ${SEV[h.severity].text}`} onClick={() => { setList(false); goTo(h); }}>
                    <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${SEV[h.severity].dot}`} /><span className="text-stone-500">wk {h.week} · </span>{h.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {toast && (
        <div className="fixed right-2 bottom-24 md:bottom-14 z-[1175] max-w-[min(92vw,380px)]" role="status" data-testid="alert-toast" data-severity={toast.severity}>
          <div className={`flex items-start gap-2 rounded-md border-2 px-3 py-2 text-[12px] shadow-xl shadow-black/70 ${SEV[toast.severity].box}`}>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setToast(undefined); goTo(toast); }}>
              <span className="block text-[9px] uppercase tracking-[0.2em] opacity-80">{toast.severity === 'danger' ? 'Needs you' : toast.severity === 'good' ? 'Good news' : 'Heads up'}</span>
              {toast.text} <span className="opacity-70">▸</span>
            </button>
            <button type="button" className="shrink-0 opacity-70 hover:opacity-100" onClick={() => setToast(undefined)} aria-label="Dismiss">×</button>
          </div>
        </div>
      )}
    </>
  );
}
