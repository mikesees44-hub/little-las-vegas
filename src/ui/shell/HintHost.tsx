import { useEffect, useState } from 'react';
import type { GameState } from '../../engine/types';
import { HINT_GAP_MS, HINTS } from './hints';
import type { Route } from './routes';

const done = (id: string) => { try { return localStorage.getItem(`llv-hint-${id}`) === '1'; } catch { return true; } };
const markDone = (id: string) => { try { localStorage.setItem(`llv-hint-${id}`, '1'); } catch { /* not remembered */ } };

/**
 * Where each bubble sits. None of them sits on a panel's content (playtest #11: the drawer hint covered
 * the panel's first lines, the alerts hint stacked on the door list): the corner ones keep to the map
 * strip above the In Motion bar, right of any open drawer and left of the right rail.
 */
export const HINT_POS = {
  drawer: 'right-4 xl:right-[320px] bottom-[150px] md:bottom-14',
  right: 'right-4 xl:right-[320px] bottom-[150px] md:bottom-14',
  bottom: 'left-1/2 -translate-x-1/2 bottom-[150px] md:bottom-14',
  top: 'right-4 xl:right-[320px] bottom-[150px] md:bottom-14',
  center: 'right-4 xl:right-[320px] bottom-[150px] md:bottom-14',
};
/** A hint stays this long, then retires for good (it was seen; "Got it" is optional). */
export const HINT_MS = 12000;

/** One contextual hint at a time, the first whose moment has come; each only once, ever. */
let lastShown = -Infinity;

export function HintHost({ s, route, overlayOpen, motion, alerts, speed }: { s: GameState; route: Route; overlayOpen: boolean; motion: number; alerts: number; speed: number }) {
  const [, bump] = useState(0);
  // The one on screen: chosen once, then remembered as seen at once (a reload or the next place never
  // brings it back), and it leaves when its place does, on "Got it", or after a few seconds.
  const [showing, setShowing] = useState<{ id: string; home?: string } | undefined>();
  // Never over a decision (overlayOpen), and at most one bubble a minute.
  const candidate = overlayOpen || showing || Date.now() - lastShown < HINT_GAP_MS ? undefined : HINTS.find((x) => !done(x.id) && x.when(s, { route, motion, alerts, speed }));
  useEffect(() => {
    if (!candidate) return;
    lastShown = Date.now();
    markDone(candidate.id);
    setShowing({ id: candidate.id, home: route.home });
  }, [candidate?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showing) return;
    const t = setTimeout(() => setShowing(undefined), HINT_MS);
    return () => clearTimeout(t);
  }, [showing]);
  useEffect(() => { if (showing && showing.home !== route.home) setShowing(undefined); }, [route.home]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = showing && !overlayOpen ? HINTS.find((x) => x.id === showing.id) : undefined;
  if (!h) return null;
  return (
    <div className={`fixed z-[1130] max-w-[300px] rounded-md border border-gold-500 bg-noir-950/95 px-3 py-2 text-xs text-stone-200 shadow-xl shadow-black/70 llv-slide-left pointer-events-none ${HINT_POS[h.anchor]}`} data-testid="hint" role="status">
      <div className="flex gap-2">
        <span className="text-gold-400">✦</span>
        <span className="flex-1">{h.text}</span>
      </div>
      <div className="mt-1 text-right"><button type="button" className="pointer-events-auto text-[11px] font-semibold text-gold-300 hover:underline" onClick={() => { markDone(h.id); setShowing(undefined); bump((n) => n + 1); }} data-testid="hint-ok">Got it</button></div>
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
    <div className="fixed left-1/2 top-[190px] md:top-28 z-[1160] max-w-[90vw] -translate-x-1/2 rounded-md border border-gold-500 bg-noir-900/95 px-3 py-1.5 text-sm text-gold-300 shadow-xl shadow-black/70" data-testid="toast" role="status">
      {text}
    </div>
  );
}
