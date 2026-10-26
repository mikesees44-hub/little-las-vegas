import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDate, seasonInfo } from '../../engine/calendar';
import { displayName, player } from '../../engine/characters';
import { heatBand } from '../../engine/heat';
import { statHelp } from '../../engine/glossary';
import { HEAT_BARS, type GameState, type HeatBar, type Stat } from '../../engine/types';
import { fmt$ } from '../format';
import { ClockControls, type Speed } from '../clock';
import { MusicToggle } from '../audio';
import { Num, type Reason } from './Num';
import { moneyTop } from '../../engine/money';
import { useShell } from './context';
import { OrdersButton } from './OrdersPopover';
import { BigPots, MoveMoney, usePots, WeekPotsLine } from '../money/MoneyPots';

/**
 * The two pots in the top bar ("Family money", "Your pocket"), each with last week's change.
 * A tap opens the money popover: the two big numbers, last week in one line, Move money, and the Money screen.
 */
function MoneyChips({ s }: { s: GameState }) {
  const { go } = useShell();
  const m = moneyTop(s);
  const p = usePots(s);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="flex items-center gap-1" data-testid="topbar-money">
      <button type="button" data-tour="treasury" className="flex items-center gap-1" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Family money ${fmt$(m.family)}, your pocket ${fmt$(m.pocket)}: open the money`} title={statHelp('money')} data-testid="topbar-family">
        <Chip label="Family money" value={fmt$(m.family)} d={m.familyDelta} good={(m.familyDelta ?? 0) >= 0} tone={m.family < 0 ? 'text-red-400' : 'text-gold-300'} cash after={p.familyAfter} />
        <span data-testid="topbar-pocket"><Chip label="Your pocket" value={fmt$(m.pocket)} d={m.pocketDelta} good={(m.pocketDelta ?? 0) >= 0} tone="text-amber-200" cash after={p.pocketAfter} /></span>
      </button>
      {open && (
        <div className="fixed left-2 right-2 top-[7.5rem] sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-1 z-[1200] sm:w-[440px] max-h-[75vh] overflow-y-auto panel p-2 space-y-2" data-testid="money-popover">
          <BigPots s={s} compact />
          <div className="text-[12px] text-stone-300"><WeekPotsLine s={s} /></div>
          <MoveMoney s={s} />
          <button type="button" className="btn-gold w-full text-xs" onClick={() => { setOpen(false); go('holdings.money'); }} data-testid="money-popover-open">Open the Money screen: where every dollar came from and went ▸</button>
        </div>
      )}
    </div>
  );
}

const BAND_COLOR = { cold: 'bg-sky-700', warm: 'bg-amber-600', hot: 'bg-orange-600', boiling: 'bg-blood-400' } as const;

/** Last week's ledger lines for one stat, as reasons. */
export function reasonsFor(s: GameState, stat: Stat): Reason[] {
  const lines = s.lastReport?.lines.filter((l) => l.stat === stat) ?? [];
  const by = new Map<string, number>();
  for (const l of lines) by.set(l.label, (by.get(l.label) ?? 0) + l.amount);
  return [...by.entries()].map(([label, value]) => ({ label, value: Math.round(value) }));
}

function delta(s: GameState, k: 'money' | 'respect' | HeatBar): number | undefined {
  const r = s.lastReport;
  if (!r) return undefined;
  if (k === 'money') return Math.round(r.end.money - r.start.money);
  if (k === 'respect') return r.end.respect - r.start.respect;
  return r.end.heat[k] - r.start.heat[k];
}

function Chip({ label, value, d, good, bar, barColor, tone, cash, after }: { label: string; value: string; d?: number; good?: boolean; bar?: number; barColor?: string; tone?: string; cash?: boolean; /** Where it lands after this week's orders. */ after?: number }) {
  return (
    <span className="inline-flex flex-col rounded bg-noir-800 border border-noir-700 px-1.5 sm:px-2 py-0.5 min-w-[52px] cursor-help">
      <span className="text-[9px] uppercase tracking-widest text-stone-500 leading-tight whitespace-nowrap">{label}</span>
      <span className={`text-sm font-semibold tabular-nums leading-tight whitespace-nowrap ${tone ?? 'text-stone-100'}`}>
        {value}
        {d !== undefined && d !== 0 && <span className={`ml-1 text-[10px] font-normal ${good ? 'text-emerald-400' : 'text-red-400'}`}>{d > 0 ? '+' : ''}{cash ? fmt$(d) : d}</span>}
      </span>
      {after !== undefined && <span className="text-[9px] leading-tight text-sky-300 tabular-nums whitespace-nowrap">→ {fmt$(after)} after orders</span>}
      {bar !== undefined && <span className="mt-0.5 block h-0.5 rounded bg-noir-700 overflow-hidden"><span className={`block h-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} /></span>}
    </span>
  );
}

/** A small menu anchored to a button; closes on outside click and Esc. */
export function Popover({ button, children, align = 'right', testid }: { button: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; testid?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {button(open, () => setOpen((o) => !o))}
      {open && <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-[1200] min-w-[220px] panel p-1.5`} data-testid={testid}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export const menuItem = 'block w-full text-left rounded px-2 py-1.5 text-sm text-stone-300 hover:bg-noir-700 hover:text-gold-300 disabled:opacity-40';

/**
 * The slim CK top bar: house, resources with week deltas and their ledger
 * reasons on hover, date and season, the clock, Advance (week, or month in
 * the split menu), the decisions and orders counters, and the game menu.
 */
export function TopBar({ s, speed, setSpeed, note, onAdvance, pending, answered, onReview, ticker, onNewGame, onMainMenu, seedInput, setSeedInput, slot, pulse, onSitDown, sitCount }: {
  s: GameState;
  speed: Speed;
  setSpeed: (v: Speed) => void;
  note?: string;
  onAdvance: (m: 'week' | 'month') => void;
  pending: number;
  answered: number;
  onReview: () => void;
  ticker?: string;
  onNewGame: () => void;
  onMainMenu: () => void;
  seedInput: string;
  setSeedInput: (v: string) => void;
  slot: number;
  pulse?: boolean;
  /** The Sit-Down (sitdown/SitDown.tsx): opens the week's council and rounds. */
  onSitDown?: () => void;
  sitCount?: number;
}) {
  const info = seasonInfo(s.date);
  const boss = player(s);
  const dr = delta(s, 'respect');
  return (
    <header className="relative z-[1150] border-b border-noir-700 bg-noir-900/95 px-2 sm:px-3 py-1.5 shadow-lg shadow-black/50" data-testid="topbar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2 min-w-0 order-1">
          <span className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-gold-600/70 bg-noir-800 font-display text-gold-300" aria-hidden>♛</span>
          <div className="min-w-0">
            <h1 className="font-display text-base sm:text-lg text-gold-400 leading-none whitespace-nowrap">Little Las Vegas</h1>
            <p className="text-[10px] sm:text-[11px] text-stone-400 truncate max-w-[42vw] sm:max-w-[16rem]">House of {s.houseName} · {displayName(boss)}</p>
          </div>
        </div>
        <div className="order-3 sm:order-2 flex w-full sm:w-auto items-center gap-1 overflow-x-auto sm:overflow-visible pb-0.5 sm:pb-0" data-testid="resources">
          <MoneyChips s={s} />
          <Num v={dr ?? 0} reasons={reasonsFor(s, 'respect')} term="respect"><Chip label="Respect" value={`${s.respect}`} d={dr} good={(dr ?? 0) >= 0} bar={s.respect} barColor="bg-gold-500" /></Num>
          {HEAT_BARS.map((b) => {
            const d = delta(s, b);
            return (
              <Num key={b} v={d ?? 0} reasons={reasonsFor(s, `heat.${b}` as Stat)} term={`heat.${b}`}>
                <Chip label={`${b[0].toUpperCase()}${b.slice(1)} heat`} value={`${s.heat[b]}`} d={d} good={(d ?? 0) <= 0} bar={s.heat[b]} barColor={BAND_COLOR[heatBand(s.heat[b])]} tone={s.heat[b] >= 80 ? 'text-red-400' : undefined} />
              </Num>
            );
          })}
          <Num v={s.favors} reasons={[]} term="favors"><Chip label="Favors" value={`${s.favors}`} /></Num>
        </div>
        <div className="order-2 sm:order-3 ml-auto text-right leading-tight">
          <div className="text-[11px] sm:text-xs text-stone-300 whitespace-nowrap">{formatDate(s.date)} · Wk {s.week}</div>
          <div className={`text-[10px] sm:text-[11px] font-semibold whitespace-nowrap ${info.inSeason ? 'text-gold-300' : 'text-sky-300'}`}>{info.label} ×{info.multiplier}<span className="hidden sm:inline"> · {info.countdownLabel}</span></div>
        </div>
        {!s.gameOver && (
          <div className="order-4 flex w-full lg:w-auto items-center gap-1 sm:gap-1.5 flex-wrap">
            <div className="llv-clock-compact"><ClockControls speed={speed} setSpeed={setSpeed} /></div>
            <div className="flex">
              <button className={`btn-gold h-8 py-0 px-2 sm:px-3 text-xs sm:text-sm rounded-r-none ${pulse ? 'llv-pulse' : ''}`} onClick={() => onAdvance('week')} data-testid="advance-week">Advance Week ▸</button>
              <Popover testid="advance-menu" button={(o, t) => <button className="btn-gold h-8 py-0 px-1.5 rounded-l-none border-l border-noir-900/40" aria-expanded={o} aria-label="More ways to advance" onClick={t}>▾</button>}>
                {(close) => <button className={menuItem} onClick={() => { close(); onAdvance('month'); }} data-testid="advance-month">Advance Month (4 weeks)</button>}
              </Popover>
            </div>
            <button type="button" onClick={onReview} disabled={!pending} data-testid="decisions-button" title={pending ? 'Review this week\'s decisions' : 'Nothing on the table this week'}
              className={`h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap ${pending > answered ? 'border-gold-500 text-gold-300 bg-gold-500/10' : 'border-noir-600 text-stone-400'}`}>
              ✉ {answered}/{pending}<span className="hidden sm:inline"> decisions</span>
            </button>
            {onSitDown && (
              <button type="button" onClick={onSitDown} data-testid="sitdown-button" title="Your people, and your rounds this week"
                className={`h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap ${sitCount ? 'border-gold-500 text-gold-300 bg-gold-500/10' : 'border-noir-600 text-stone-400'}`}>
                ♜ <span className="hidden sm:inline">Sit-down </span>{sitCount ? `(${sitCount})` : ''}
              </button>
            )}
            <OrdersButton s={s} />
            <span className="hidden sm:inline-flex"><MusicToggle /></span>
            {note && <span className="text-[11px] text-amber-300 truncate max-w-[40vw]">{note}</span>}
            {ticker && speed > 0 && <span className="hidden xl:inline text-[11px] text-stone-500 truncate max-w-[24rem]">{ticker}</span>}
            <div className="ml-auto">
              <Popover testid="game-menu" button={(o, t) => <button className="h-8 w-8 rounded border border-noir-600 text-stone-300 hover:border-gold-500" aria-label="Game menu" aria-expanded={o} onClick={t} data-testid="game-menu-button">≡</button>}>
                {() => (
                  <div className="space-y-1 text-xs">
                    <div className="px-2 pt-1 text-stone-500">Seed <span className="text-stone-300">{s.seed}</span> · slot {slot}{s.flags.ironman ? ' · ironman' : ''}</div>
                    <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} placeholder="seed for a new game (optional)" className="inp text-xs" />
                    <button className={menuItem} data-testid="footer-new" onClick={onNewGame}>New Game…</button>
                    <button className={menuItem} data-testid="footer-menu" onClick={onMainMenu}>Main Menu</button>
                    <div className="px-2 pb-1 text-[10px] text-stone-600">Saved automatically.</div>
                  </div>
                )}
              </Popover>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
