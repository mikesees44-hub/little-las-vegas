import { useEffect, useState } from 'react';
import type { GameState } from '../../engine/types';
import { HINTS } from './hints';
import type { Route } from './routes';

const done = (id: string) => { try { return localStorage.getItem(`llv-hint-${id}`) === '1'; } catch { return true; } };
const markDone = (id: string) => { try { localStorage.setItem(`llv-hint-${id}`, '1'); } catch { /* not remembered */ } };

const POS = {
  drawer: 'left-4 md:left-24 top-40',
  right: 'right-4 xl:right-[320px] top-28',
  bottom: 'left-1/2 -translate-x-1/2 bottom-[150px] md:bottom-16',
  top: 'right-4 top-28',
  center: 'left-1/2 -translate-x-1/2 top-1/3',
};

/** One contextual hint at a time, the first whose moment has come. */
export function HintHost({ s, route, overlayOpen, motion, alerts, speed }: { s: GameState; route: Route; overlayOpen: boolean; motion: number; alerts: number; speed: number }) {
  const [, bump] = useState(0);
  const [shownAt, setShownAt] = useState<string | undefined>();
  const h = overlayOpen ? undefined : HINTS.find((x) => !done(x.id) && x.when(s, { route, motion, alerts, speed }));
  useEffect(() => { if (h && h.id !== shownAt) setShownAt(h.id); }, [h?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!h) return null;
  return (
    <div className={`fixed z-[1130] max-w-[300px] rounded-md border border-gold-500 bg-noir-950/95 px-3 py-2 text-xs text-stone-200 shadow-xl shadow-black/70 llv-slide-left ${POS[h.anchor]}`} data-testid="hint" role="status">
      <div className="flex gap-2">
        <span className="text-gold-400">✦</span>
        <span className="flex-1">{h.text}</span>
      </div>
      <div className="mt-1 text-right"><button type="button" className="text-[11px] font-semibold text-gold-300 hover:underline" onClick={() => { markDone(h.id); bump((n) => n + 1); }} data-testid="hint-ok">Got it</button></div>
    </div>
  );
}

/** "New: The Books — ..." when a section opens up. */
export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4500);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed left-1/2 top-28 z-[1140] -translate-x-1/2 rounded-md border border-gold-500 bg-noir-900/95 px-3 py-1.5 text-sm text-gold-300 shadow-xl shadow-black/70" data-testid="toast" role="status">
      {text}
    </div>
  );
}
