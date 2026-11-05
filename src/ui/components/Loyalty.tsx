import { useEffect, useRef, useState } from 'react';
import { crewStandings, crewWord, STANDING_LABEL, yourMenByCapo, type CrewStanding, type StandingLevel } from '../../engine/crewStanding';
import { floaterText, loyaltyTrend, type LoyalFeed } from '../../engine/loyalty';
import { opinion } from '../../engine/relations';
import { sideOf } from '../../engine/sides';
import type { Character, GameState } from '../../engine/types';
import { CharLink, Face, useSheet } from './People';

/**
 * LOYALTY YOU CAN SEE MOVE (GODFATHER_LOYALTY_SKILLS.md §B, §C): a man's meter
 * (what he thinks of you, -100..100) that slides when it changes, with its
 * trend arrow and why it moved; the crew strip (every crew and where you stand
 * with it); your guys by capo; and the floaters ("+5 Sal (honored my
 * wedding)") that rise when a decision lands. Colour is never the only
 * signal: every meter has its number, its word and its arrow.
 */

const LEVEL_TONE: Record<StandingLevel, string> = {
  tight: 'text-emerald-300', friendly: 'text-emerald-400/90', neutral: 'text-stone-300', cold: 'text-amber-300', war: 'text-red-400',
};
const barTone = (v: number) => (v >= 30 ? 'bg-emerald-500' : v >= 0 ? 'bg-gold-500' : v > -30 ? 'bg-amber-500' : 'bg-red-500');
const arrowTone = (a: string) => (a === '▲' ? 'text-emerald-300' : a === '▼' ? 'text-red-300' : 'text-stone-500');

/** A -100..100 bar that slides to its new value and bumps when it moves. */
export function MovingBar({ v, label, className = '', testid }: { v: number; label: string; className?: string; testid?: string }) {
  const prev = useRef(v);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (prev.current !== v) { prev.current = v; setBump((n) => n + 1); }
  }, [v]);
  const w = Math.max(2, Math.min(100, (v + 100) / 2));
  return (
    <div key={bump} className={`h-1.5 overflow-hidden rounded-full bg-noir-700 ${bump ? 'llv-bump' : ''} ${className}`} role="meter" aria-label={label} aria-valuemin={-100} aria-valuemax={100} aria-valuenow={v} data-testid={testid}>
      <div className={`h-full rounded-full ${barTone(v)} transition-[width] duration-700 ease-out`} style={{ width: `${w}%` }} />
    </div>
  );
}

/** A man's loyalty: the number, the meter, the arrow, and (open) the last three reasons. */
export function LoyaltyMeter({ s, id, why = false, className = '' }: { s: GameState; id: string; why?: boolean; className?: string }) {
  const v = opinion(s, id, s.playerId);
  const t = loyaltyTrend(s, id);
  const c = s.characters[id];
  return (
    <div className={`min-w-0 ${className}`} data-testid="loyalty-meter" data-trend={t.dir}>
      <div className="flex items-baseline justify-between gap-1 text-[10.5px] leading-tight">
        <span className="uppercase tracking-wider text-stone-500">Loyalty</span>
        <span className="tabular-nums text-stone-200">{v > 0 ? '+' : ''}{v} <span className={arrowTone(t.arrow)} title={t.dir ? `${t.d > 0 ? '+' : ''}${t.d} in the last weeks` : 'Steady'} data-testid="loyalty-arrow">{t.arrow}</span></span>
      </div>
      <MovingBar v={v} label={`${c?.firstName ?? 'His'} loyalty`} className="mt-0.5" />
      {why && (
        <ul className="mt-1 space-y-0.5 text-[10.5px] text-stone-400" data-testid="loyalty-why">
          {t.why.length ? t.why.map((x, i) => <li key={i}><span className={x.v > 0 ? 'text-emerald-300' : 'text-red-300'}>{x.v > 0 ? '+' : '−'}{Math.abs(x.v)}</span> {x.y} <span className="text-stone-600">· wk {x.w}</span></li>) : <li>Nothing has moved it lately.</li>}
        </ul>
      )}
    </div>
  );
}

/** The crew a person is with: emblem, colour, words ("★ Sal's crew", "◆ Manno"). */
export function CrewBadge({ s, c, className = '' }: { s: GameState; c: Character; className?: string }) {
  const side = sideOf(s, c.id);
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10.5px] font-semibold leading-tight ${className}`} style={{ borderColor: `${side.color}99`, color: side.color, background: `${side.color}1a` }} data-testid="crew-badge" title={side.full}>
      <span aria-hidden>{side.emblem}</span>{crewWord(s, c)}
    </span>
  );
}

function StandingCard({ s, x }: { s: GameState; x: CrewStanding }) {
  const [open, setOpen] = useState(false);
  const { open: openSheet } = useSheet();
  const head = x.head ? s.characters[x.head] : undefined;
  return (
    <li className="min-w-[9.5rem] flex-1 rounded-md border bg-noir-900/70 px-2 py-1.5" style={{ borderColor: `${x.color}66` }} data-testid="crew-standing" data-level={x.level} data-kind={x.kind}>
      <button type="button" className="block w-full text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-sm text-[11px] font-bold text-noir-950" style={{ background: x.color }} aria-hidden>{x.emblem}</span>
          <span className="truncate text-[12px] font-semibold text-stone-100">{x.label}</span>
          <span className={`ml-auto text-[11px] ${arrowTone(x.arrow)}`} aria-label={x.arrow === '▲' ? 'warming' : x.arrow === '▼' ? 'cooling' : 'steady'}>{x.arrow}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between text-[11px]">
          <span className={`font-semibold ${LEVEL_TONE[x.level]}`}>{STANDING_LABEL[x.level]}</span>
          <span className="tabular-nums text-stone-400">{x.v > 0 ? '+' : ''}{x.v}</span>
        </div>
        <MovingBar v={x.v} label={`${x.label}: ${STANDING_LABEL[x.level]}`} className="mt-0.5" />
      </button>
      {open && (
        <div className="mt-1">
          <ul className="space-y-0.5 text-[10.5px] text-stone-400">{x.why.map((w, i) => <li key={i}>· {w}</li>)}</ul>
          {head && <button type="button" className="mt-1 text-[10.5px] text-gold-300 hover:underline" onClick={() => openSheet(head.id)}>{head.firstName} {head.lastName} ▸</button>}
        </div>
      )}
    </li>
  );
}

/** Every crew and where you stand with it: yours by capo, then the other families. */
export function CrewStrip({ s, title = true }: { s: GameState; title?: boolean }) {
  const xs = crewStandings(s);
  if (!xs.length) return null;
  const yours = xs.filter((x) => x.kind === 'yours');
  const fams = xs.filter((x) => x.kind === 'family');
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/40 p-2" data-testid="crew-strip">
      {title && <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2"><span className="text-[10px] uppercase tracking-[0.25em] text-stone-500">The crews, and where you stand</span><span className="text-[10.5px] text-stone-500">Tap one for why</span></div>}
      {yours.length > 0 && <ul className="flex flex-wrap items-start gap-1.5" aria-label="Your crews">{yours.map((x) => <StandingCard key={x.key} s={s} x={x} />)}</ul>}
      {fams.length > 0 && <ul className="mt-1.5 flex flex-wrap items-start gap-1.5" aria-label="The other families">{fams.map((x) => <StandingCard key={x.key} s={s} x={x} />)}</ul>}
    </section>
  );
}

/** Your guys, grouped by capo, each with his meter. */
export function MenByCapo({ s }: { s: GameState }) {
  const groups = yourMenByCapo(s);
  if (!groups.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="men-by-capo">
      {groups.map((g) => (
        <section key={g.capo?.id ?? 'direct'} className="rounded-md border border-noir-700 bg-noir-800/50 p-2" data-testid="capo-group">
          <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-gold-400/80">{g.capo ? `${g.capo.firstName}'s crew · ${g.men.length + 1}` : `Answer to you · ${g.men.length}`}</div>
          <ul className="space-y-1">
            {[...(g.capo ? [g.capo] : []), ...g.men].map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Face s={s} c={c} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-stone-100"><CharLink s={s} id={c.id} className="hover:text-gold-300">{c.firstName} {c.lastName}</CharLink> <span className="text-[10.5px] text-stone-500">{c.rank}</span></div>
                  <LoyaltyMeter s={s} id={c.id} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The floaters: when a decision moves someone's loyalty (an order settled now, an answer, an offer
 * from a sheet), "+5 Sal (honored my wedding)" rises at the top of the screen. The week's turn moves
 * many at once: those are the week's report, not floaters.
 */
export function LoyaltyFloaters({ s }: { s: GameState }) {
  const seen = useRef<{ n: number; w: number } | undefined>(undefined);
  const [items, setItems] = useState<{ k: number; text: string; up: boolean }[]>([]);
  const alive = useRef(true);
  const n = s.loyal?.n ?? 0;
  useEffect(() => {
    const last = seen.current;
    seen.current = { n, w: s.week };
    if (!last || last.w !== s.week || n <= last.n) return;
    const fresh: LoyalFeed[] = (s.loyal?.f ?? []).filter((f) => f[0] > last.n).slice(-3);
    if (!fresh.length) return;
    setItems((cur) => [...cur, ...fresh.map((f) => ({ k: f[0], text: floaterText(s, f), up: f[2] > 0 }))].slice(-4));
    const ks = fresh.map((f) => f[0]);
    // Not cleared by the next render: a floater always gets its time on screen.
    setTimeout(() => { if (alive.current) setItems((cur) => cur.filter((x) => !ks.includes(x.k))); }, 2600);
  }, [n, s]);
  useEffect(() => () => { alive.current = false; }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed right-3 top-16 z-[1300] flex flex-col items-end gap-1" aria-live="polite" data-testid="loyalty-floaters">
      {items.map((x) => (
        <span key={x.k} className={`llv-loyal-float rounded border bg-noir-950/90 px-2 py-0.5 text-[12px] font-semibold shadow-lg ${x.up ? 'border-emerald-600/70 text-emerald-300' : 'border-red-700/70 text-red-300'}`}>{x.text}</span>
      ))}
    </div>
  );
}
