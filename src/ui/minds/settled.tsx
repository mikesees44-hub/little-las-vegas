import { useEffect, useState } from 'react';

/**
 * "Done": the result of a decision settled in the two-way window, shown at
 * once over whatever screen comes next (the window itself closes with the
 * decision it settled). A tiny store: the window posts, the toast shows.
 */
type Listener = (t: { title: string; text: string; at: number } | undefined) => void;
let last: { title: string; text: string; at: number } | undefined;
const subs = new Set<Listener>();

export function postSettled(title: string, text: string): void {
  last = { title, text, at: Date.now() };
  for (const f of subs) f(last);
}

export function SettledToast() {
  const [t, setT] = useState(last);
  useEffect(() => { const f: Listener = (x) => setT(x); subs.add(f); return () => { subs.delete(f); }; }, []);
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(undefined), 9000); return () => clearTimeout(h); }, [t]);
  if (!t) return null;
  return (
    <div className="fixed inset-x-2 bottom-3 z-[1190] mx-auto max-w-md rounded-md border border-gold-600/60 bg-noir-900/95 px-3 py-2 text-[12px] text-stone-100 shadow-lg" role="status" data-testid="settled-toast">
      <div className="flex justify-between gap-2"><b className="text-gold-300">{t.title}</b><button type="button" className="text-stone-500" onClick={() => setT(undefined)} aria-label="Dismiss">✕</button></div>
      <div>{t.text}</div>
    </div>
  );
}
