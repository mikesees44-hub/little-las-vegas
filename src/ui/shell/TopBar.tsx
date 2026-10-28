import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEscape } from '../keys';
import { seasonInfo } from '../../engine/calendar';
import { hoursLabel, hoursLeft, nowLabel } from '../../engine/timeCost';
import { FlipClock } from '../components/FlipClock';
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
import { PlansButton } from '../plans/PlansPanel';
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
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  useEscape(open, () => setOpen(false));
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
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  useEscape(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      {button(open, () => setOpen((o) => !o))}
      {open && <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-[1200] min-w-[220px] panel p-1.5`} data-testid={testid}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

/** Settings and help from the game menu (they live in You). */
function GameMenuLinks({ close }: { close: () => void }) {
  const { go } = useShell();
  return (
    <>
      <button type="button" className={menuItem} data-testid="menu-settings-ingame" onClick={() => { close(); go('settings'); }}>Settings</button>
      <button type="button" className={menuItem} data-testid="menu-help-ingame" onClick={() => { close(); go('help'); }}>Help & keyboard</button>
      <div className="my-1 h-px bg-noir-700" />
    </>
  );
}

export const menuItem ='block w-full text-left rounded px-2 py-1.5 text-sm text-stone-300 hover:bg-noir-700 hover:text-gold-300 disabled:opacity-40';

/**
 * "Waiting on you": the week's loop in one button instead of four. The count is
 * what still wants the boss (decisions unanswered, the sit-down's items, the
 * morning's problems, the envelope); the list opens each one, or the whole desk.
 */
function WaitingButton({ count, tone, pending, answered, sitCount, mornings, envelope, urgent = 0, onReview, onSitDown, onRounds, onEnvelope, onDesk, onUrgent }: {
  /** The one count (engine/inbox.ts), the same as the desk and the door. */
  count?: number; tone?: 'red' | 'amber' | 'gold';
  pending: number; answered: number; sitCount: number; mornings: number; envelope: boolean; urgent?: number;
  onReview: () => void; onSitDown?: () => void; onRounds?: () => void; onEnvelope?: () => void; onDesk?: () => void; onUrgent?: () => void;
}) {
  const open = pending - answered;
  const n = count ?? open + sitCount + mornings + (envelope ? 1 : 0) + urgent;
  const red = tone ? tone === 'red' : urgent > 0;
  return (
    <Popover align="left" testid="waiting-menu" button={(o, t) => (
      <button type="button" onClick={t} aria-expanded={o} data-testid="waiting-button" title="Everything waiting on you this week: decisions, the sit-down, the morning, the envelope"
        className={`h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap ${red ? 'border-red-500 text-red-300 bg-red-500/10' : n ? 'border-gold-500 text-gold-300 bg-gold-500/10' : 'border-noir-600 text-stone-400'}`}>
        ▤<span className="hidden sm:inline"> Waiting on you</span>{n ? <span className={`ml-1 rounded-full px-1.5 text-[10px] ${red ? 'bg-red-500 text-white' : 'bg-gold-500 text-noir-950'}`} data-testid="waiting-count">{n}</span> : <span className="ml-1 text-stone-500">✓</span>} ▾
      </button>
    )}>
      {(close) => (
        <div className="w-64 space-y-0.5 text-xs">
          {urgent > 0 && onUrgent && <button type="button" className={`${menuItem} border border-red-500/60 bg-red-500/10 text-red-200`} onClick={() => { close(); onUrgent(); }} data-testid="urgent-button">
            ⚠ Urgent: {urgent === 1 ? 'someone wants' : `${urgent} people want`} a meeting <span className="float-right tabular-nums">{urgent}</span>
          </button>}
          <button type="button" className={menuItem} disabled={!pending} onClick={() => { close(); onReview(); }} data-testid="decisions-button">
            ✉ Decisions <span className="float-right tabular-nums text-stone-400">{answered}/{pending}</span>
          </button>
          {onSitDown && <button type="button" className={menuItem} onClick={() => { close(); onSitDown(); }} data-testid="sitdown-button">♜ The sit-down <span className="float-right tabular-nums text-stone-400">{sitCount || '—'}</span></button>}
          {onRounds && <button type="button" className={menuItem} onClick={() => { close(); onRounds(); }} data-testid="rounds-button">☕ Your rounds: mornings & evenings <span className="float-right tabular-nums text-stone-400">{mornings ? `${mornings} waiting` : ''}</span></button>}
          {onEnvelope && envelope && <button type="button" className={menuItem} onClick={() => { close(); onEnvelope(); }} data-testid="envelope-button">✉ The envelope is on your desk</button>}
          {onDesk && <><div className="my-1 h-px bg-noir-700" /><button type="button" className={`${menuItem} text-gold-300`} onClick={() => { close(); onDesk(); }} data-testid="desk-button">▤ The whole desk ▸</button></>}
          <button type="button" className={`${menuItem} text-gold-300`} onClick={() => { close(); (document.querySelector('[data-testid=plans-button]') as HTMLButtonElement | null)?.click(); }} data-testid="waiting-all">◐ All of it, and everything in motion ▸</button>
        </div>
      )}
    </Popover>
  );
}

/**
 * The slim CK top bar: house, resources with week deltas and their ledger
 * reasons on hover, date and season, the clock, Advance (week, or month in
 * the split menu), the decisions and orders counters, and the game menu.
 */
export function TopBar({ s, inboxN, inboxTone, clockMode = false, speed, setSpeed, note, onAdvance, pending, answered, onReview, urgent = 0, onUrgent, ticker, onNewGame, onMainMenu, seedInput, setSeedInput, slot, pulse, onSitDown, sitCount, onDesk, onOffice, officeOpen, mornings = 0, envelope = false, onRounds, onEnvelope, onFind, onEndDay, paperUnread = 0, onPaper }: {
  s: GameState;
  /** The one count of what wants the boss (engine/inbox.ts) and its worst tone. */
  inboxN?: number;
  inboxTone?: 'red' | 'amber' | 'gold';
  /** End the boss's day now (the hours left go unused): the day ticks, or on Sunday the week turns. */
  onEndDay?: () => void;
  /** Running clock (days tick by) rather than turn-based (settings). */
  clockMode?: boolean;
  speed: Speed;
  setSpeed: (v: Speed) => void;
  note?: string;
  onAdvance: (m: 'week' | 'month') => void;
  pending: number;
  answered: number;
  onReview: () => void;
  /** Urgent meetings still waiting on the boss (threats.ts) and the opener. */
  urgent?: number;
  onUrgent?: () => void;
  ticker?: string;
  onNewGame: () => void;
  onMainMenu: () => void;
  seedInput: string;
  setSeedInput: (v: string) => void;
  slot: number;
  pulse?: boolean;
  /** The Sit-Down (sitdown/SitDown.tsx): opens the week's council and rounds. */
  onSitDown?: () => void;
  /** The Boss's Desk (This Week). */
  onDesk?: () => void;
  /** The Boss's Office (upstairs at the club). */
  onOffice?: () => void;
  officeOpen?: boolean;
  sitCount?: number;
  /** Morning problems still waiting on an answer today. */
  mornings?: number;
  /** The envelope is on the desk, waiting for the boss's split. */
  envelope?: boolean;
  onRounds?: () => void;
  onEnvelope?: () => void;
  /** Find… (people, places, screens, things to do). */
  onFind?: () => void;
  /** The morning paper on the desk (engine/paper.ts): editions not read yet, and the opener. */
  paperUnread?: number;
  onPaper?: () => void;
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
          <div className="flex items-center justify-end gap-1 whitespace-nowrap" data-testid="topbar-date">
            <FlipClock s={s} testid="topbar-clock" />
            <span className="text-[10px] sm:text-[11px] text-stone-400">Wk {s.week}</span>
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-sky-300 whitespace-nowrap" data-testid="topbar-hour" title={`The boss's day runs 8 AM to 2 AM. It is ${nowLabel(s)}; ${hoursLabel(hoursLeft(s))} left today.`}>
            {hoursLabel(hoursLeft(s))} left
            {onEndDay && !s.gameOver && <button type="button" className="ml-1 underline text-stone-400 hover:text-gold-300" onClick={onEndDay} data-testid="end-day" title="Call it a day: the world moves on to tomorrow">end day ▸</button>}
          </div>
          <div className={`text-[10px] sm:text-[11px] font-semibold whitespace-nowrap ${info.inSeason ? 'text-gold-300' : 'text-sky-300'}`}>{info.label} ×{info.multiplier}<span className="hidden sm:inline"> · {info.countdownLabel}</span></div>
        </div>
        {!s.gameOver && (
          <div className="order-4 flex w-full lg:w-auto items-center gap-0.5 sm:gap-1.5 flex-wrap">
            {clockMode && <div className="llv-clock-compact"><ClockControls speed={speed} setSpeed={setSpeed} /></div>}
            <div className="flex">
              <button className={`btn-gold h-8 py-0 px-1.5 sm:px-3 text-xs sm:text-sm rounded-r-none ${pulse ? 'llv-pulse' : ''}`} onClick={() => onAdvance('week')} data-testid="advance-week" title={clockMode ? 'Play out the rest of the week now' : undefined}>{clockMode ? <><span className="sm:hidden">Week ▸▸</span><span className="hidden sm:inline">Advance Week ▸</span></> : 'Advance Week ▸'}</button>
              <Popover testid="advance-menu" button={(o, t) => <button className="btn-gold h-8 py-0 px-1.5 rounded-l-none border-l border-noir-900/40" aria-expanded={o} aria-label="More ways to advance" onClick={t}>▾</button>}>
                {(close) => <button className={menuItem} onClick={() => { close(); onAdvance('month'); }} data-testid="advance-month">Advance Month (4 weeks)</button>}
              </Popover>
            </div>
            <WaitingButton count={inboxN} tone={inboxTone} pending={pending} answered={answered} sitCount={sitCount ?? 0} mornings={mornings} envelope={envelope} urgent={urgent} onUrgent={onUrgent}
              onReview={onReview} onSitDown={onSitDown} onRounds={onRounds} onEnvelope={onEnvelope} onDesk={onDesk} />
            {onOffice && (
              <button type="button" onClick={onOffice} data-testid="office-button" aria-pressed={!!officeOpen} title="The Boss's Office: where the week's business starts"
                className={`h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap ${officeOpen ? 'border-gold-500 text-gold-300 bg-gold-500/10' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>⌂<span className="hidden sm:inline"> Office</span></button>
            )}
            {onPaper && (
              <button type="button" onClick={onPaper} data-testid="paper-button" title={paperUnread ? `The paper is on the desk (${paperUnread} unread)` : 'The Daily Tide and the Weekly Leader'}
                className="relative h-8 rounded border border-noir-600 px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap text-stone-300 hover:border-gold-500">▤<span className="hidden sm:inline"> Paper</span>
                {paperUnread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blood-500 ring-2 ring-noir-900" data-testid="paper-dot" aria-label={`${paperUnread} unread`} />}
              </button>
            )}
            <OrdersButton s={s} />
            <PlansButton s={s} />
            {onFind && (
              <button type="button" onClick={onFind} data-testid="find-button" title="Find a person, a place, a screen or something to do (Ctrl+K or /)"
                className="h-8 rounded border border-noir-600 px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap text-stone-300 hover:border-gold-500">⌕<span className="hidden sm:inline"> Find</span></button>
            )}
            {note && <span className="text-[11px] text-amber-300 truncate max-w-[40vw]">{note}</span>}
            {ticker && speed > 0 && <span className="hidden xl:inline text-[11px] text-stone-500 truncate max-w-[24rem]">{ticker}</span>}
            <div className="ml-auto">
              <Popover testid="game-menu" button={(o, t) => <button className="h-8 w-7 sm:w-8 rounded border border-noir-600 text-stone-300 hover:border-gold-500" aria-label="Game menu" aria-expanded={o} onClick={t} data-testid="game-menu-button">≡</button>}>
                {(close) => (
                  <div className="space-y-1 text-xs">
                    <GameMenuLinks close={close} />
                    <div className="flex items-center justify-between px-2 py-1 text-sm text-stone-300">Music <MusicToggle /></div>
                    <div className="my-1 h-px bg-noir-700" />
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
