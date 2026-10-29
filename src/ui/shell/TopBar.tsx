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
import { SPEED_NAME, type Speed } from '../clock';
import { DEFAULT_SPEED } from '../clockPolicy';
import { MusicToggle } from '../audio';
import { Num, type Reason } from './Num';
import { moneyTop } from '../../engine/money';
import { useShell } from './context';
import { OrdersTray, useOrders } from '../components/Orders';
import { queuedMoney } from '../../engine/actions';
import { PlansPanel, usePlansCount } from '../plans/PlansPanel';
import { BigPots, MoveMoney, usePots, WeekPotsLine } from '../money/MoneyPots';
import { eraHeadline } from '../../engine/intrigue';
import { ERA_TONE } from '../intrigue/IntrigueBoard';
import { armyMeter } from '../../engine/army';

/** The army meter in tension or war (army.ts): Raised / Available / Allies / Enemy (a guess without spies). A tap opens the Army. */
function ArmyChip({ s }: { s: GameState }) {
  const { go } = useShell();
  const m = armyMeter(s);
  if (!m.show) return null;
  const enemy = m.enemy ? `${m.enemy.lo === m.enemy.hi ? m.enemy.lo : `${m.enemy.lo}–${m.enemy.hi}`}${m.enemy.fogged ? '?' : ''}` : '—';
  const title = `Men under arms ${m.raised} of ${m.available} free · hired ${m.hired} · allies ${m.allies} · ${m.enemy ? `${m.enemy.name} about ${enemy}${m.enemy.fogged ? ' (a guess: nobody inside)' : ''}` : 'no enemy in the field'} · morale ${m.morale} · ${m.bill ? `$${m.bill.toLocaleString('en-US')} a week` : 'nothing a week'}`;
  return (
    <button type="button" onClick={() => go('diplomacy.army')} className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] sm:text-[11px] tabular-nums ${s.wars.length ? 'text-red-200 border-red-500/60' : 'text-amber-200 border-amber-500/40'}`} title={title} data-testid="topbar-army">
      ⚔ {m.raised}/{m.available}{m.hired ? `+${m.hired}` : ''}{m.allies ? ` · allies ${m.allies}` : ''} · vs {enemy}
    </button>
  );
}


/**
 * Respect, the three heats and favors as ONE strip (they were six chips): the numbers at a glance,
 * a tap for each one's chip with last week's reasons, and the era with the families.
 */
function StandingStrip({ s }: { s: GameState }) {
  const dr = delta(s, 'respect');
  const heatTone = (v: number) => (v >= 80 ? 'text-red-400' : v >= 50 ? 'text-orange-300' : v >= 25 ? 'text-amber-200' : 'text-sky-200');
  const era = eraHeadline(s);
  return (
    <Popover align="left" testid="standing-popover" button={(o, t) => (
      <button type="button" onClick={t} aria-expanded={o} data-testid="topbar-standing" title={`Respect ${s.respect} · heat: local ${s.heat.local}, family ${s.heat.family}, federal ${s.heat.federal} · favors ${s.favors} · ${era.text}. Tap for the reasons.`}
        className="flex h-[38px] items-center gap-2 whitespace-nowrap rounded border border-noir-700 bg-noir-800 px-2 text-[11px] tabular-nums text-stone-400 hover:border-gold-600">
        <span>Respect <b className="text-stone-100">{s.respect}</b>{dr ? <span className={dr > 0 ? 'text-emerald-400' : 'text-red-400'}> {dr > 0 ? '+' : ''}{dr}</span> : null}</span>
        <span>Heat {HEAT_BARS.map((b, i) => <b key={b} className={heatTone(s.heat[b])}>{i ? '·' : ''}{s.heat[b]}</b>)}</span>
        <span className="hidden sm:inline">Favors <b className="text-stone-100">{s.favors}</b></span>
        <span className={`hidden lg:inline h-2 w-2 rounded-full ${era.era === 'war' ? 'bg-red-500' : era.era === 'peace' ? 'bg-emerald-500' : 'bg-amber-400'}`} aria-hidden />
        <span className="text-stone-500">▾</span>
      </button>
    )}>
      {() => (
        <div className="flex max-w-[92vw] flex-wrap items-start gap-1 sm:max-w-[560px]" data-testid="resources-detail">
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
          <div className="basis-full" />
          <EraChip s={s} />
        </div>
      )}
    </Popover>
  );
}

/** The clock in two buttons: play/pause, and the speed (1–5 in a small menu; the keys 1–5 still work). */
function ClockCompact({ speed, setSpeed }: { speed: Speed; setSpeed: (v: Speed) => void }) {
  const paused = speed === 0;
  return (
    <div className="flex items-center gap-0.5" data-testid="clock">
      <button type="button" onClick={() => setSpeed(paused ? DEFAULT_SPEED : 0)} title={paused ? 'Play (space)' : 'Pause (space)'} aria-label={paused ? 'Play' : 'Pause'} data-testid="clock-pause" data-paused={paused}
        className={`h-8 min-w-[2.25rem] rounded border px-2 text-sm font-bold ${paused ? 'bg-gold-500 text-noir-950 border-gold-400' : 'bg-noir-800 text-gold-300 border-gold-600'}`}>{paused ? '▶' : '❚❚'}</button>
      <Popover align="left" testid="clock-speeds" button={(o, t) => (
        <button type="button" onClick={t} aria-expanded={o} aria-label="Clock speed" title="How fast the days go (keys 1–5)" data-testid="clock-speed"
          className="h-8 rounded border border-noir-600 bg-noir-800 px-1.5 text-[11px] font-bold tabular-nums text-stone-300 hover:border-gold-500">{paused ? 'speed' : `×${speed}`}<span className="ml-0.5 text-stone-500">▾</span></button>
      )}>
        {(close) => (
          <div className="flex gap-1">
            {([1, 2, 3, 4, 5] as const).map((v) => (
              <button key={v} type="button" onClick={() => { setSpeed(v); close(); }} aria-pressed={speed === v} aria-label={`Play ${SPEED_NAME[v].toLowerCase()}`} title={`Speed ${v}: ${SPEED_NAME[v].toLowerCase()} (key ${v})`} data-testid={`clock-speed-${v}`}
                className={`h-8 min-w-[2rem] rounded border px-1 text-[11px] font-bold tabular-nums ${speed === v ? 'bg-gold-500 text-noir-950 border-gold-400' : 'bg-noir-800 text-stone-300 border-noir-600 hover:border-gold-500'}`}>{v}</button>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}

/** This week's orders, opened from the menu (the tray that used to hang off its own button). */
function OrdersPane({ s, onClose }: { s: GameState; onClose: () => void }) {
  const { orders } = useOrders();
  useEscape(true, onClose);
  return (
    <div className="fixed inset-0 z-[1170]" onClick={onClose}>
      <div className="absolute left-2 right-2 top-[7.5rem] sm:left-auto sm:right-2 sm:top-14 sm:w-[min(440px,94vw)] max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="orders-popover">
        <div className="flex justify-end"><button type="button" className="btn-quiet text-xs" onClick={onClose} aria-label="Close">close ×</button></div>
        {orders.length ? <OrdersTray s={s} /> : (
          <div className="panel p-3 text-xs text-stone-400">No orders this week. Every "Order" button on a sheet, a card or a drawer adds one here; they are carried out when you advance.</div>
        )}
      </div>
    </div>
  );
}

/** The era with the families, worst first ("Era: Cold war with the Kessler family"): a tap opens the Intrigue board. */
function EraChip({ s }: { s: GameState }) {
  const { go } = useShell();
  const h = eraHeadline(s);
  return (
    <button type="button" onClick={() => go('diplomacy.intrigue')} className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] sm:text-[11px] ${ERA_TONE[h.era]}`} title={h.cause ? `${h.text}: ${h.cause}` : h.text} data-testid="topbar-era">
      Era: {h.text}
    </button>
  );
}

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
          <button type="button" className="btn-primary w-full text-xs" onClick={() => { setOpen(false); go('holdings.money'); }} data-testid="money-popover-open">Open the Money screen: where every dollar came from and went ▸</button>
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
export function Popover({ button, children, align = 'right', testid, initialOpen }: { button: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; testid?: string; /** Tests and tours: start open. */ initialOpen?: boolean }) {
  const [open, setOpen] = useState(!!initialOpen);
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
      {open && <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-[1200] min-w-[220px] panel bg-noir-900 p-1.5 shadow-xl shadow-black/70`} data-testid={testid}>{children(() => setOpen(false))}</div>}
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
/**
 * DESK (n): the one loop button. One count (engine/attention.ts: what needs
 * the boss, reds always) and one place it opens: the Desk. The old menu's
 * lines (decisions, the sit-down, rounds, the envelope, urgent, all of it)
 * are the Desk's filter chips and doors now. The test ids stay the same.
 */
function WaitingButton({ count, tone, onDesk, onReview }: {
  count?: number; tone?: 'red' | 'amber' | 'gold';
  onReview: () => void; onDesk?: () => void;
}) {
  const n = count ?? 0;
  const red = tone === 'red';
  return (
    <button type="button" onClick={onDesk ?? onReview} data-testid="waiting-button" title="The Desk: what needs you this week, and what your people are handling for you"
      className={`h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap ${red ? 'border-red-500 text-red-300 bg-red-500/10' : n ? 'border-gold-500 text-gold-300 bg-gold-500/10' : 'border-noir-600 text-stone-400'}`}>
      ▤<span className="hidden sm:inline"> Desk</span>{n ? <span className={`ml-1 rounded-full px-1.5 text-[10px] ${red ? 'bg-red-500 text-white' : 'bg-gold-500 text-noir-950'}`} data-testid="waiting-count">{n}</span> : <span className="ml-1 text-stone-500">✓</span>}
    </button>
  );
}

/**
 * The slim CK top bar: house, resources with week deltas and their ledger
 * reasons on hover, date and season, the clock, Advance (week, or month in
 * the split menu), the decisions and orders counters, and the game menu.
 */
export function TopBar({ s, inboxN, inboxTone, clockMode = false, speed, setSpeed, note, onAdvance, onReview, ticker, onNewGame, onMainMenu, seedInput, setSeedInput, slot, pulse, onDesk, onOffice, officeOpen, onFind, onEndDay, paperUnread = 0, onPaper, fileNew = 0, onFile, onHelp, menuOpen }: {
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
  onAdvance: (m: 'week' | 'month' | 'season') => void;
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
  /** Your File (the Book, engine/journal.ts): new entries since the boss last looked, and the opener. */
  fileNew?: number;
  onFile?: () => void;
  /** "What should I do" (the help menu; it used to sit at the foot of the rail). */
  onHelp?: () => void;
  /** Start with the ☰ menu open (tests). */
  menuOpen?: boolean;
}) {
  const info = seasonInfo(s.date);
  const boss = player(s);
  const { orders } = useOrders();
  const orderCost = queuedMoney(s, orders).family;
  const plans = usePlansCount(s);
  const [pane, setPane] = useState<'orders' | 'plans' | undefined>();
  // The Desk's "In motion ▸" and others open the plans from anywhere.
  useEffect(() => {
    const on = () => setPane('plans');
    window.addEventListener('llv-open-plans', on);
    return () => window.removeEventListener('llv-open-plans', on);
  }, []);
  // The one menu carries what left the bar: its badge is this week's orders; a dot for something new or against you.
  const menuBadge = orders.length;
  const menuDot = fileNew > 0 || paperUnread > 0 || plans.danger;
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
          <StandingStrip s={s} />
          <ArmyChip s={s} />
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
            {clockMode && <ClockCompact speed={speed} setSpeed={setSpeed} />}
            <div className="flex">
              <button className={`btn-primary h-8 py-0 px-1.5 sm:px-3 text-xs sm:text-sm rounded-r-none ${pulse ? 'llv-pulse' : ''}`} onClick={() => onAdvance('week')} data-testid="advance-week" title={clockMode ? 'Play out the rest of the week now' : undefined}>{clockMode ? <><span className="sm:hidden">Week ▸▸</span><span className="hidden sm:inline">Advance Week ▸</span></> : 'Advance Week ▸'}</button>
              <Popover testid="advance-menu" button={(o, t) => <button className="btn-primary h-8 py-0 px-1.5 rounded-l-none border-l border-noir-900/40" aria-expanded={o} aria-label="More ways to advance" onClick={t}>▾</button>}>
                {(close) => <>
                  {onEndDay && <button className={menuItem} onClick={() => { close(); onEndDay(); }} data-testid="skip-morning">Skip to the next morning</button>}
                  <button className={menuItem} onClick={() => { close(); onAdvance('week'); }} data-testid="skip-week">Skip to next week</button>
                  <button className={menuItem} onClick={() => { close(); onAdvance('month'); }} data-testid="advance-month">Advance Month (4 weeks)</button>
                  <button className={menuItem} onClick={() => { close(); onAdvance('season'); }} data-testid="advance-season" title="Thirteen weeks; your men handle what you leave unanswered. Stops if the chair changes hands.">Advance a Season (13 weeks)</button>
                </>}
              </Popover>
            </div>
            <WaitingButton count={inboxN} tone={inboxTone} onReview={onReview} onDesk={onDesk} />
            {onFind && (
              <button type="button" onClick={onFind} data-testid="find-button" title="Find a person, a place, a screen or something to do (Ctrl+K or /)"
                className="h-8 rounded border border-noir-600 px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap text-stone-300 hover:border-gold-500">⌕<span className="hidden sm:inline"> Find</span></button>
            )}
            {note && <span className="text-[11px] text-amber-300 truncate max-w-[40vw]">{note}</span>}
            {ticker && speed > 0 && <span className="hidden xl:inline text-[11px] text-stone-500 truncate max-w-[24rem]">{ticker}</span>}
            <div className="ml-auto">
              <Popover testid="game-menu" initialOpen={menuOpen} button={(o, t) => (
                <button className="btn-secondary relative h-8 w-8 px-0 py-0" aria-label="Menu: the office, your file, the paper, orders, plans, help, settings" aria-expanded={o} onClick={t} data-testid="game-menu-button">
                  ☰
                  {menuBadge > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full bg-gold-500 px-1 text-center text-[10px] font-bold leading-4 text-noir-950 ring-2 ring-noir-900" data-testid="menu-badge">{menuBadge}</span>}
                  {menuBadge === 0 && menuDot && <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-noir-900 ${plans.danger ? 'bg-red-500' : 'bg-blood-500'}`} data-testid="menu-dot" />}
                </button>
              )}>
                {(close) => (
                  <div className="space-y-0.5 text-xs" data-testid="topbar-more">
                    {onOffice && <button type="button" className={menuItem} onClick={() => { close(); onOffice(); }} data-testid="office-button" aria-pressed={!!officeOpen}>⌂ The Office <span className="text-stone-500">· upstairs at the club</span></button>}
                    <button type="button" className={menuItem} onClick={() => { close(); setPane('orders'); }} data-testid="orders-button">☰ This week's orders <span className={orders.length ? 'text-gold-300' : 'text-stone-500'}>({orders.length}{orders.length && orderCost > 0 ? ` · ${fmt$(orderCost)}` : ''})</span></button>
                    <button type="button" className={menuItem} onClick={() => { close(); setPane('plans'); }} data-testid="plans-button">◐ Plans in motion <span className={`rounded-full px-1.5 text-[10px] ${plans.danger ? 'bg-red-500 text-white' : 'bg-noir-700 text-stone-200'}`} data-testid="plans-count">{plans.motion}</span></button>
                    {onFile && <button type="button" className={menuItem} onClick={() => { close(); onFile(); }} data-testid="file-button">❡ Your File{fileNew > 0 && <span className="ml-1 rounded-full bg-blood-500 px-1.5 text-[10px] text-white" data-testid="file-badge">{fileNew > 99 ? '99+' : fileNew} new</span>}</button>}
                    {onPaper && <button type="button" className={menuItem} onClick={() => { close(); onPaper(); }} data-testid="paper-button">▤ The paper{paperUnread > 0 && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-blood-500" data-testid="paper-dot" aria-label={`${paperUnread} unread`} />}</button>}
                    <button type="button" className={`${menuItem} md:hidden`} onClick={() => { close(); window.dispatchEvent(new Event('llv-open-alerts')); }} data-testid="menu-alerts">⚑ Alerts</button>
                    {onHelp && <button type="button" className={menuItem} onClick={() => { close(); onHelp(); }} data-testid="rail-help">? What should I do</button>}
                    <div className="my-1 h-px bg-noir-700" />
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
            {pane === 'orders' && <OrdersPane s={s} onClose={() => setPane(undefined)} />}
            {pane === 'plans' && <PlansPanel s={s} onClose={() => setPane(undefined)} />}
          </div>
        )}
      </div>
    </header>
  );
}
