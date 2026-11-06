import { ImportArt } from '../importArt/ImportArt';
import { isOwnerHere } from '../importArt/artStore';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HudIcon, HudMeter, HudNumber } from '../components/Hud';
import { createPortal } from 'react-dom';
import { Overlay } from '../components/Modal';
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
import { FixChips } from './FixChips';
import { PinTray } from './PinTray';
import { SameAsLastWeekList, useHasLastWeek } from '../desk/SameAsLastWeek';
import { queuedMoney } from '../../engine/actions';
import { PlansPanel, usePlansCount } from '../plans/PlansPanel';
import { BigPots, MoveMoney, usePots, WeekPotsLine } from '../money/MoneyPots';
import { eraHeadline } from '../../engine/intrigue';
import { ERA_TONE } from '../intrigue/IntrigueBoard';
import { armyMeter } from '../../engine/army';
import { ReportBug } from '../feedback/ReportBug';
import { currentScreen } from '../feedback/reportClient';

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
        className="llv-hud h-[26px] sm:h-[42px] gap-2.5 whitespace-nowrap text-[11px] tabular-nums text-stone-400 hover:border-gold-500">
        {/* Respect: a gold star, the number (counting), a meter. Heat: three bars, local · family · federal, coloured by band. */}
        <span className="flex items-center gap-1.5">
          <span className="hidden sm:inline-flex"><HudIcon tone="gold">★</HudIcon></span>
          <span className="flex flex-col">
            <span className="flex items-baseline gap-1"><span className="sm:hidden">Respect</span><span className="hidden sm:inline llv-hud-label">Respect</span> <b className="llv-hud-val text-stone-100"><HudNumber value={s.respect} /></b>{dr ? <span className={dr > 0 ? 'text-emerald-400' : 'text-red-400'}> {dr > 0 ? '+' : ''}{dr}</span> : null}</span>
            <HudMeter v={s.respect} color="bg-gradient-to-r from-gold-600 to-gold-300" className="hidden w-16 sm:block" />
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="hidden sm:inline-flex"><HudIcon tone="red">♨</HudIcon></span>
          <span className="flex flex-col">
            <span className="flex items-baseline gap-1"><span className="sm:hidden">Heat</span><span className="hidden sm:inline llv-hud-label">Heat</span> {HEAT_BARS.map((b, i) => <b key={b} className={`${heatTone(s.heat[b])}`}>{i ? '·' : ''}<HudNumber value={s.heat[b]} good="down" /></b>)}</span>
            <span className="hidden gap-0.5 sm:flex">{HEAT_BARS.map((b) => <HudMeter key={b} v={s.heat[b]} color={BAND_COLOR[heatBand(s.heat[b])]} className="w-[1.3rem]" />)}</span>
          </span>
        </span>
        <span className="hidden sm:inline">Favors <b className="llv-hud-val text-stone-100">{s.favors}</b></span>
        <span className={`hidden lg:inline h-2 w-2 rounded-full ${era.era === 'war' ? 'bg-red-500' : era.era === 'peace' ? 'bg-emerald-500' : 'bg-amber-400'}`} aria-hidden />
        <span className="text-stone-500">▾</span>
      </button>
    )}>
      {() => (
        <div className="flex max-w-[92vw] flex-wrap items-start gap-1 sm:max-w-[560px]" data-testid="resources-detail">
          <Num v={dr ?? 0} reasons={reasonsFor(s, 'respect')} term="respect" now={s.respect} from={s.lastReport ? { label: `When week ${s.lastReport.week} began`, value: s.lastReport.start.respect } : undefined}><Chip label="Respect" value={`${s.respect}`} d={dr} good={(dr ?? 0) >= 0} bar={s.respect} barColor="bg-gold-500" /></Num>
          {HEAT_BARS.map((b) => {
            const d = delta(s, b);
            return (
              <Num key={b} v={d ?? 0} reasons={reasonsFor(s, `heat.${b}` as Stat)} term={`heat.${b}`} now={s.heat[b]} from={s.lastReport ? { label: `When week ${s.lastReport.week} began`, value: s.lastReport.start.heat[b] } : undefined}>
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
    <Overlay z={1170} onClick={onClose}>
      <div className="absolute left-2 right-2 top-[7.5rem] sm:left-auto sm:right-2 sm:top-14 sm:w-[min(440px,94vw)] max-h-[calc(100dvh-7.5rem-1rem-env(safe-area-inset-bottom))] sm:max-h-[70vh] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()} data-testid="orders-popover">
        <div className="flex justify-end"><button type="button" className="btn-quiet text-xs" onClick={onClose} aria-label="Close">close ×</button></div>
        {orders.length ? <OrdersTray s={s} /> : (
          <div className="panel p-3 text-xs text-stone-400">No orders this week. Every "Order" button on a sheet, a card or a drawer adds one here; they are carried out when you advance.</div>
        )}
      </div>
    </Overlay>
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
        <Chip label="Family money" short="Family" value={fmt$(m.family)} num={m.family} icon="$" iconTone="green" d={m.familyDelta} good={(m.familyDelta ?? 0) >= 0} tone={m.family < 0 ? 'text-red-400' : 'text-gold-300'} cash after={p.familyAfter} />
        <span data-testid="topbar-pocket"><Chip label="Your pocket" short="Pocket" value={fmt$(m.pocket)} num={m.pocket} icon="♠" iconTone="gold" d={m.pocketDelta} good={(m.pocketDelta ?? 0) >= 0} tone="text-amber-200" cash after={p.pocketAfter} /></span>
      </button>
      <button type="button" className="hidden md:inline-flex h-[42px] items-center rounded-md border border-amber-500/40 bg-noir-800/70 px-2 text-[11px] font-semibold text-amber-200 hover:border-gold-400 hover:text-gold-300" onClick={() => go('you.pocket')} title="Spend your pocket on yourself: homes, the Florida condo, cars, the watch, jewelry for her, nights out" data-testid="topbar-spend">Spend<span className="ml-0.5 text-stone-500">▸</span></button>
      {open && (
        <div className="fixed left-2 right-2 top-[7.5rem] sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-1 z-[1200] sm:w-[440px] max-h-[75vh] overflow-y-auto panel p-2 space-y-2" data-testid="money-popover">
          <BigPots s={s} compact />
          <div className="text-[12px] text-stone-300"><WeekPotsLine s={s} /></div>
          <MoneyWhy s={s} />
          <MoveMoney s={s} />
          <button type="button" className="btn-secondary llv-d-money llv-dom-btn w-full text-xs" onClick={() => { setOpen(false); go('you.pocket'); }} data-testid="money-popover-spend">Spend your pocket: homes, cars, the watch, something for her ▸</button>
          <button type="button" className="btn-primary w-full text-xs" onClick={() => { setOpen(false); go('holdings.money'); }} data-testid="money-popover-open">Open the Money screen: where every dollar came from and went ▸</button>
        </div>
      )}
    </div>
  );
}

/** "Why is it this?" for Family money: where the week began, the biggest lines that moved it, where it is now. */
function MoneyWhy({ s }: { s: GameState }) {
  const r = s.lastReport;
  if (!r) return null;
  const rs = reasonsFor(s, 'money').filter((x) => x.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const shown = rs.slice(0, 6);
  const other = Math.round(r.end.money - r.start.money - shown.reduce((a, x) => a + x.value, 0));
  return (
    <div className="rounded border border-noir-700 bg-noir-900/60 p-1.5 text-[11px]" data-testid="money-why">
      <div className="text-[10px] uppercase tracking-wider text-stone-500">Why is the Family at {fmt$(r.end.money)}? (week {r.week})</div>
      <div className="flex justify-between gap-2"><span className="text-stone-400">When the week began</span><span className="tabular-nums">{fmt$(r.start.money)}</span></div>
      {shown.map((x) => <div key={x.label} className="flex justify-between gap-2"><span className="truncate text-stone-300">{x.label}</span><span className={`tabular-nums ${x.value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{x.value > 0 ? '+' : '−'}{fmt$(Math.abs(x.value))}</span></div>)}
      {other !== 0 && <div className="flex justify-between gap-2"><span className="text-stone-500">Everything else</span><span className="tabular-nums text-stone-400">{other > 0 ? '+' : '−'}{fmt$(Math.abs(other))}</span></div>}
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

/**
 * A HUD badge: an icon coin, the label, the value in the display face (counting to a new figure, the change
 * floating up off it), last week's change, and a meter where the stat has one.
 */
function Chip({ label, short, value, d, good, bar, barColor, tone, cash, after, icon, iconTone, num, up = 'up' }: { label: string; /** Phones: one line, this word before the number. */ short?: string; value: string; d?: number; good?: boolean; bar?: number; barColor?: string; tone?: string; cash?: boolean; /** Where it lands after this week's orders. */ after?: number;
  icon?: ReactNode; iconTone?: 'gold' | 'green' | 'red' | 'steel' | 'wine'; /** The value as a number: it counts and floats its changes. */ num?: number; up?: 'up' | 'down' }) {
  return (
    <span className="llv-hud cursor-help">
      {icon && <span className="hidden sm:inline-flex"><HudIcon tone={iconTone}>{icon}</HudIcon></span>}
      <span className={`inline-flex min-w-0 ${short ? 'flex-row items-baseline gap-1 sm:flex-col sm:items-stretch sm:gap-0' : 'flex-col'}`}>
      {short && <span className="sm:hidden text-[10px] text-stone-400 leading-tight whitespace-nowrap">{short}</span>}
      <span className={`${short ? 'hidden sm:block' : ''} llv-hud-label`}>{label}</span>
      <span className={`llv-hud-val ${tone ?? 'text-stone-100'}`}>
        {num !== undefined ? <HudNumber value={num} format={cash ? fmt$ : undefined} good={up} /> : value}
        {d !== undefined && d !== 0 && <span className={`ml-1 text-[10px] font-normal ${good ? 'text-emerald-400' : 'text-red-400'}`}>{d > 0 ? '+' : ''}{cash ? fmt$(d) : d}</span>}
      </span>
      {after !== undefined && <span className="text-[9px] leading-tight text-sky-300 tabular-nums whitespace-nowrap">→ {fmt$(after)}<span className="hidden sm:inline"> after orders</span></span>}
      {bar !== undefined && <HudMeter v={bar} color={barColor ?? 'bg-gold-500'} className="mt-0.5" />}
      </span>
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
const spanWords = (n: 1 | 2 | 4) => (n === 1 ? '1 week' : n === 2 ? '2 weeks' : 'a month (4 weeks)');

export function TopBar({ s, inboxN, inboxTone, clockMode = false, turn, speed, setSpeed, note, onAdvance, onReview, ticker, onNewGame, onMainMenu, seedInput, setSeedInput, slot, pulse, onDesk, onOffice, officeOpen, onFind, onEndDay, paperUnread = 0, onPaper, fileNew = 0, onFile, onHelp, menuOpen, chair, onChair, phone }: {
  s: GameState;
  /** The succession pressure, for the starts where the chair is the game (power/ChairCard.tsx), and its opener. */
  chair?: number;
  onChair?: () => void;
  /** The one count of what wants the boss (engine/inbox.ts) and its worst tone. */
  inboxN?: number;
  inboxTone?: 'red' | 'amber' | 'gold';
  /** End the boss's day now (the hours left go unused): the day ticks, or on Sunday the week turns. */
  onEndDay?: () => void;
  /** Running clock (days tick by) rather than turn-based (settings). */
  clockMode?: boolean;
  /** A turn (STREAMLINE_2 §5): its span (1, 2 or 4 weeks) and the picker. In turn mode the big button is End turn. */
  turn?: { span: 1 | 2 | 4; onSpan: (n: 1 | 2 | 4) => void };
  speed: Speed;
  setSpeed: (v: Speed) => void;
  note?: string;
  onAdvance: (m: 'week' | 'month' | 'season' | 'turn') => void;
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
  /** The phone (ui/phone/PhoneWindow.tsx PhoneButton): one button with its missed-calls badge. */
  phone?: ReactNode;
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
  const [pane, setPane] = useState<'orders' | 'plans' | 'same' | undefined>();
  const hasLast = useHasLastWeek(s);
  // The playtesters' report form (feedback/ReportBug.tsx), with the screen it was opened from.
  const [report, setReport] = useState<string | undefined>();
  // The owner's Import art (artifact owner only; nothing anywhere else).
  const [owner, setOwner] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => { let live = true; void isOwnerHere().then((v) => { if (live) setOwner(v); }); return () => { live = false; }; }, []);
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
        <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-initial order-1">
          <span className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full border border-gold-600/70 bg-noir-800 font-display text-gold-300" aria-hidden>♛</span>
          <div className="min-w-0">
            {/* Phones: the house and the clock's word take the brand's line (the bar was four rows, 180 px of 844). */}
            <h1 className="sr-only sm:not-sr-only font-display text-base sm:text-lg text-gold-400 leading-none whitespace-nowrap">Little Las Vegas</h1>
            <p className="text-[11px] text-stone-300 sm:text-stone-400 truncate sm:max-w-[16rem]">House of {s.houseName} · {displayName(boss)}</p>
            {note && !s.gameOver && <p className="sm:hidden text-[11px] leading-tight text-amber-300 line-clamp-2" title={note}>{note}</p>}
          </div>
        </div>
        <div className="order-3 sm:order-2 flex w-full sm:w-auto items-center gap-1 overflow-x-auto sm:overflow-visible pb-0.5 sm:pb-0" data-testid="resources">
          <MoneyChips s={s} />
          <StandingStrip s={s} />
          <ArmyChip s={s} />
        </div>
        {/* The date sits with the money and standing chips as one more chip (it floated alone, three lines tall, in the top right). */}
        <div className="order-2 sm:order-3 ml-auto sm:ml-0 shrink-0 text-right sm:text-left leading-tight sm:rounded-md sm:border sm:border-noir-700 sm:bg-noir-800/60 sm:px-2.5 sm:py-1" data-testid="topbar-when">
          <div className="flex items-center justify-end sm:justify-start gap-1 whitespace-nowrap" data-testid="topbar-date">
            <FlipClock s={s} testid="topbar-clock" />
            <span className="text-[10px] sm:text-[11px] text-stone-400">Wk {s.week}</span>
          </div>
          <div className="sm:flex sm:items-baseline sm:gap-2">
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-sky-300 whitespace-nowrap" data-testid="topbar-hour" title={`The boss's day runs 8 AM to 2 AM. It is ${nowLabel(s)}; ${hoursLabel(hoursLeft(s))} left today.`}>
            {hoursLabel(hoursLeft(s))} left
            {onEndDay && !s.gameOver && <button type="button" className="ml-1 underline text-stone-400 hover:text-gold-300" onClick={onEndDay} data-testid="end-day" title="Call it a day: the world moves on to tomorrow">end day ▸</button>}
          </div>
          <div title={info.countdownLabel} className={`text-[10px] sm:text-[11px] font-semibold whitespace-nowrap ${info.inSeason ? 'text-gold-300' : 'text-sky-300'}`}>{info.label} ×{info.multiplier}<span className="hidden xl:inline"> · {info.countdownLabel}</span></div>
          </div>
        </div>
        {!s.gameOver && (
          <div className="order-4 flex w-full lg:w-auto items-center gap-0.5 sm:gap-1.5 flex-wrap">
            {clockMode && <ClockCompact speed={speed} setSpeed={setSpeed} />}
            <div className="flex">
              {/* Turn-based: the same button (advance-week) ends the turn, its span from the ▾ (1, 2 or 4 weeks; it stops for a crisis). */}
              <button className={`btn-primary h-8 py-0 px-1.5 sm:px-3 text-xs sm:text-sm rounded-r-none ${pulse ? 'llv-pulse' : ''}`} onClick={() => onAdvance(!clockMode && turn ? 'turn' : 'week')} data-testid="advance-week" data-span={!clockMode && turn ? turn.span : undefined}
                title={clockMode ? 'Play out the rest of the week now' : turn ? `End the turn: ${spanWords(turn.span)}. It stops early for a crisis (a strike, a war, a death, the Feds, a storm), and says why.` : undefined}>
                {clockMode ? <><span className="sm:hidden">Week ▸▸</span><span className="hidden sm:inline">Advance Week ▸</span></> : turn ? <>End turn<span className="hidden sm:inline"> · {turn.span === 4 ? 'a month' : `${turn.span} wk`}</span> ▸</> : 'Advance Week ▸'}
              </button>
              <Popover testid="advance-menu" button={(o, t) => <button className="btn-primary h-8 py-0 px-1.5 rounded-l-none border-l border-noir-900/40" aria-expanded={o} aria-label="More ways to advance" onClick={t}>▾</button>}>
                {(close) => <>
                  {onEndDay && <button className={menuItem} onClick={() => { close(); onEndDay(); }} data-testid="skip-morning">Skip to the next morning</button>}
                  {hasLast && <button className={menuItem} onClick={() => { close(); setPane('same'); }} data-testid="advance-same-last-week" title="Last week's orders again: see the list first, untick any">↻ Same orders as last week…</button>}
                  <button className={menuItem} onClick={() => { close(); onAdvance('week'); }} data-testid="skip-week">Skip to next week</button>
                  {turn && <>
                    <div className="px-3 pt-1.5 text-[10px] uppercase tracking-[0.2em] text-stone-500" data-testid="turn-span-picker">A turn: stops for a crisis{clockMode ? '' : ' (End turn)'}</div>
                    {([1, 2, 4] as const).map((n) => (
                      <button key={n} className={menuItem} role="menuitemradio" aria-checked={turn.span === n} onClick={() => { close(); turn.onSpan(n); if (clockMode) onAdvance('turn'); }} data-testid={`turn-span-${n}`}
                        title={clockMode ? `Play ${spanWords(n)} now, as one turn` : `End turn plays ${spanWords(n)} from now on`}>
                        {turn.span === n && !clockMode ? '● ' : ''}{clockMode ? `Play ${spanWords(n)} as one turn` : `End turn: ${spanWords(n)}`}
                      </button>
                    ))}
                  </>}
                  <button className={menuItem} onClick={() => { close(); onAdvance('month'); }} data-testid="advance-month">Advance Month (4 weeks)</button>
                  <button className={menuItem} onClick={() => { close(); onAdvance('season'); }} data-testid="advance-season" title="Thirteen weeks; your men handle what you leave unanswered. Stops if the chair changes hands.">Advance a Season (13 weeks)</button>
                </>}
              </Popover>
            </div>
            <WaitingButton count={inboxN} tone={inboxTone} onReview={onReview} onDesk={onDesk} />
            {phone}
            <FixChips s={s} />
            <PinTray s={s} />
            {onFind && (
              <button type="button" onClick={onFind} data-testid="find-button" title="Do something (talk, pay, order, plan, buy, travel, hurt, protect) or find a person, a place, a screen (Ctrl+K or /)"
                className="h-8 rounded border border-noir-600 px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap text-stone-300 hover:border-gold-500">⌕<span className="hidden sm:inline"> Do / Find</span></button>
            )}
            {chair !== undefined && onChair && (
              <button type="button" onClick={onChair} data-testid="chair-chip" title="The succession: who comes after you, who backs whom, and your moves"
                className={`h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap hover:border-gold-500 ${chair >= 60 ? 'border-red-600/70 text-red-200' : chair >= 40 ? 'border-amber-600/70 text-amber-200' : 'border-noir-600 text-stone-300'}`}>
                ♕<span className="hidden sm:inline"> The chair</span> <span className="tabular-nums">{chair}</span>
              </button>
            )}
            {note && <span className="hidden sm:inline text-[11px] text-amber-300 truncate max-w-[40vw]" title={note}>{note}</span>}
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
                    <button type="button" className={menuItem} onClick={() => { close(); setPane('orders'); }} data-testid="orders-button">☰ Orders this week <span className={orders.length ? 'text-gold-300' : 'text-stone-500'}>({orders.length}{orders.length && orderCost > 0 ? ` · ${fmt$(orderCost)}` : ''})</span></button>
                    <button type="button" className={menuItem} onClick={() => { close(); setPane('plans'); }} data-testid="plans-button">◐ Plans in motion <span className={`rounded-full px-1.5 text-[10px] ${plans.danger ? 'bg-red-500 text-white' : 'bg-noir-700 text-stone-200'}`} data-testid="plans-count">{plans.motion}</span></button>
                    {onFile && <button type="button" className={menuItem} onClick={() => { close(); onFile(); }} data-testid="file-button">❡ Your File{fileNew > 0 && <span className="ml-1 rounded-full bg-blood-500 px-1.5 text-[10px] text-white" data-testid="file-badge">{fileNew > 99 ? '99+' : fileNew} new</span>}</button>}
                    {onPaper && <button type="button" className={menuItem} onClick={() => { close(); onPaper(); }} data-testid="paper-button">▤ The paper{paperUnread > 0 && <span className="ml-1 inline-block h-2 w-2 rounded-full bg-blood-500" data-testid="paper-dot" aria-label={`${paperUnread} unread`} />}</button>}
                    <button type="button" className={`${menuItem} md:hidden`} onClick={() => { close(); window.dispatchEvent(new Event('llv-open-alerts')); }} data-testid="menu-alerts">⚑ Alerts</button>
                    {onHelp && <button type="button" className={menuItem} onClick={() => { close(); onHelp(); }} data-testid="rail-help">? What should I do</button>}
                    <button type="button" className={menuItem} onClick={() => { const at = currentScreen(); close(); setReport(at); }} data-testid="feedback-button">✎ Report a bug or idea</button>
                    {owner && <button type="button" className={menuItem} onClick={() => { close(); setImporting(true); }} data-testid="import-art-button">⇪ Import art <span className="text-stone-500">· only you</span></button>}
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
            {/* Out of the bar's stacking context too, so on a phone the tab bar never covers the orders or the plans. */}
            {pane === 'orders' && typeof document !== 'undefined' && createPortal(<OrdersPane s={s} onClose={() => setPane(undefined)} />, document.body)}
            {pane === 'same' && typeof document !== 'undefined' && createPortal(<SameAsLastWeekList s={s} onClose={() => setPane(undefined)} />, document.body)}
            {pane === 'plans' && typeof document !== 'undefined' && createPortal(<PlansPanel s={s} onClose={() => setPane(undefined)} />, document.body)}
            {/* Out of the bar's stacking context (z 1150), so the sheet sits over the phone's tab bar. */}
            {importing && typeof document !== 'undefined' && createPortal(<ImportArt s={s} onClose={() => setImporting(false)} />, document.body)}
            {report !== undefined && typeof document !== 'undefined' && createPortal(<ReportBug s={s} initialScreen={report} onClose={() => setReport(undefined)} />, document.body)}
          </div>
        )}
      </div>
    </header>
  );
}
