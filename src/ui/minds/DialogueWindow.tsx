import { useEffect, useRef, useState, type ReactNode } from 'react';
import { displayName, player } from '../../engine/characters';
import { suggestedOffer, toneOptions, type Dialogue, type Tone } from '../../engine/minds/dialogue';
import type { GameState } from '../../engine/types';
import { Face } from '../components/People';
import { useNumberKeys } from '../keys';

/**
 * THE TWO-WAY WINDOW (a compact modal card over the current screen; phone
 * width first): the boss on the left, the other side on the right, the
 * transcript growing in speech bubbles, her (his) live meters, and the boss's
 * replies as tone buttons with a hint of their likely effect (number keys
 * 1-9). Controlled: the parent keeps the Dialogue (engine/minds/dialogue.ts)
 * and decides what a tone does. Optional: a figure field for Negotiate /
 * Raise, a free line in the boss's own words, extra beat options, a footer
 * (the order card, "just pick" buttons) and the result line.
 */

export interface BeatOption { key: string; label: string; hint?: string; onPick: () => void }

export function DialogueWindow({
  s, d, title, onTone, onSay, options, footer, result, busy, note, onClose, offerLabel,
}: {
  s: GameState;
  d: Dialogue;
  title: string;
  onTone?: (tone: Tone, offer?: number) => void;
  onSay?: (text: string) => void;
  options?: BeatOption[];
  footer?: ReactNode;
  result?: string;
  busy?: boolean;
  note?: string;
  onClose: () => void;
  offerLabel?: string;
}) {
  const c = s.characters[d.id];
  const boss = player(s);
  const tones = onTone ? toneOptions(s, d) : [];
  const picks: { label: string; hint: string; run: () => void; tone?: Tone }[] = [
    ...(options ?? []).map((o) => ({ label: o.label, hint: o.hint ?? '', run: o.onPick })),
    ...tones.map((t) => ({ label: t.label, hint: t.hint, tone: t.tone, run: () => onTone!(t.tone, t.tone === 'negotiate' || t.tone === 'raise' || t.tone === 'firm' ? offer : undefined) })),
  ];
  const [offer, setOffer] = useState<number | undefined>(() => suggestedOffer(d));
  const [say, setSay] = useState('');
  useEffect(() => { setOffer(suggestedOffer(d)); }, [d.round, d.stake?.pos]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [d.log.length]);
  useNumberKeys(!busy && !d.end, Math.min(9, picks.length), (i) => picks[i]?.run());
  if (!c) return null;
  const st = d.stake;
  const fmt = (n: number) => (st?.unit === '%' ? `${Math.round(n)}%` : `$${Math.round(n).toLocaleString('en-US')}`);
  return (
    <div className="fixed inset-0 z-[1180] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="panel w-full max-h-[94vh] overflow-y-auto rounded-b-none border-gold-600/40 sm:max-w-lg sm:rounded-lg" onClick={(e) => e.stopPropagation()} data-testid="dialogue-window">
        <div className="flex items-center justify-between gap-2 border-b border-noir-700 px-3 py-2">
          <h3 className="truncate font-display text-lg text-gold-300">{title}</h3>
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={onClose} data-testid="dialogue-close">Close</button>
        </div>
        {/* Face to face. */}
        <div className="flex items-start justify-between gap-2 px-3 pt-2">
          <div className="flex flex-col items-center text-[11px] text-stone-400"><Face s={s} c={boss} size={56} /><span className="mt-0.5 max-w-[6rem] truncate">You</span></div>
          <div className="min-w-0 flex-1 space-y-1 pt-1" data-testid="dialogue-meters">
            <Meter label="Warmth" v={d.interest} tone="bg-emerald-500/80" />
            <Meter label="Anger" v={d.anger} tone="bg-red-500/80" />
            {st && (
              <div className="text-center text-[11px] text-stone-300" data-testid="dialogue-stake">
                {st.label}: <b className="text-amber-300">{fmt(st.pos)}</b>{st.off !== undefined && <span className="text-stone-500"> · your offer {fmt(st.off)}</span>}
              </div>
            )}
            <div className="text-center text-[10px] text-stone-500">Round {d.round}/{d.max}</div>
          </div>
          <div className="flex flex-col items-center text-[11px] text-stone-400"><span style={{ transform: 'scaleX(-1)' }}><Face s={s} c={c} size={56} /></span><span className="mt-0.5 max-w-[6rem] truncate">{displayName(c)}</span></div>
        </div>
        <div className="mt-2 max-h-[34vh] space-y-1.5 overflow-y-auto px-3 text-[13px]" aria-live="polite" data-testid="dialogue-log">
          {d.log.length === 0 && <div className="text-center text-[11px] text-stone-500">She decides. Anger past the line and she walks; nothing is agreed until she says so.</div>}
          {d.log.map((l, i) => l.who === 'narrator'
            ? <div key={i} className="text-center text-[11px] italic text-stone-500">{l.text}</div>
            : (
              <div key={i} className={l.who === 'boss' ? 'text-left' : 'text-right'}>
                <span className={`inline-block max-w-[85%] rounded-lg px-2.5 py-1 ${l.who === 'boss' ? 'rounded-bl-none bg-noir-700 text-stone-200' : 'rounded-br-none border border-noir-600 bg-noir-800 text-stone-100'}`}>{l.text}</span>
              </div>
            ))}
          {busy && <div className="text-right text-[11px] italic text-stone-500">{c.firstName} thinks about it...</div>}
          <div ref={end} />
        </div>
        {note && <div className="px-3 pt-1 text-[11px] text-amber-300">{note}</div>}
        {result && <div className="mx-3 mt-2 rounded border border-gold-600/50 bg-gold-500/10 px-2 py-1 text-[12px] text-gold-200" data-testid="dialogue-result">{result}</div>}
        {!d.end && (
          <div className="px-3 pt-2">
            {st && onTone && (
              <label className="mb-1.5 flex items-center gap-2 text-[11px] text-stone-400">
                {offerLabel ?? 'Your figure'}
                <input type="number" inputMode="numeric" className="w-24 rounded border border-noir-600 bg-noir-900 px-1.5 py-0.5 text-stone-100" value={offer ?? ''} min={st.lo} max={st.hi}
                  onChange={(e) => setOffer(e.target.value === '' ? undefined : Math.max(st.lo, Math.min(st.hi, Number(e.target.value))))} aria-label="Your figure" />
              </label>
            )}
            <div className="grid grid-cols-2 gap-1.5" data-testid="dialogue-tones">
              {picks.slice(0, 12).map((p, i) => (
                <button key={`${p.label}${i}`} type="button" disabled={busy} onClick={p.run} title={p.hint}
                  className={`rounded-md border px-2 py-1 text-left ${p.tone === 'walk' || p.tone === 'angry' || p.tone === 'threaten' ? 'border-red-400/40' : 'border-noir-600'} bg-noir-800/70 hover:border-gold-500 disabled:opacity-50`}>
                  <div className="text-[12px] font-semibold text-stone-100">{i < 9 && <kbd className="mr-1 rounded border border-noir-500 px-1 text-[10px] font-normal text-stone-400">{i + 1}</kbd>}{p.label}</div>
                  {p.hint && <div className="text-[10px] text-stone-500">{p.hint}</div>}
                </button>
              ))}
            </div>
            {onSay && (
              <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); const t = say.trim(); if (t) { onSay(t); setSay(''); } }}>
                <input className="min-w-0 flex-1 rounded border border-noir-600 bg-noir-900 px-2 py-1 text-[13px] text-stone-100" value={say} maxLength={300} disabled={busy}
                  onChange={(e) => setSay(e.target.value)} placeholder="Or say it in your own words..." aria-label="Your own words" />
                <button type="submit" className="btn-gold px-2 py-1 text-xs" disabled={busy || !say.trim()}>Say it</button>
              </form>
            )}
          </div>
        )}
        <div className="px-3 pb-3 pt-2">{footer}</div>
      </div>
    </div>
  );
}

function Meter({ label, v, tone }: { label: string; v: number; tone: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-stone-400" title={`${label} ${v}/100`}>
      <span className="w-11 shrink-0 text-right">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded bg-noir-700"><span className={`block h-full ${tone}`} style={{ width: `${v}%` }} /></span>
      <span className="w-6 tabular-nums">{v}</span>
    </div>
  );
}
