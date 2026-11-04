import { TableButton } from '../advice/CounselTable';
import { bossDesk, deskHeaderCount, readyReview, type DeskGroup, type DeskItem, type DeskKind, type DeskUi } from '../../engine/desk';
import type { GameState } from '../../engine/types';
import { DAY_NAMES } from '../../engine/days';
import { ltView } from '../../engine/lieutenants';
import { fmt$ } from '../format';
import { Modal } from '../components/Modal';
import { Fragment, useState, type ReactNode } from 'react';
import { DoneMark } from '../components/Layout';
import { DeskClock } from '../components/DeskClock';
import { domainOf, domainOfText, domClass, DOMAINS, type Domain } from '../domain';

/** The Desk is scannable by colour: each row takes the domain of its kind, else of its words (ui/domain.ts). */
function deskDomain(s: GameState, it: DeskItem): Domain | undefined {
  return domainOfText(s, `${it.title} ${it.detail ?? ''}`) ?? domainOf(it.kind);
}

/**
 * THE DESK: the one daily hub. One list, one count (engine/attention.ts on
 * engine/inbox.ts): what NEEDS YOU (at most five a week, reds always), what is
 * HANDLED FOR YOU (who, what, which day; Take it back to decide it yourself),
 * then your orders, the bills and what is coming. The old "Waiting on you"
 * menu lines are the filter chips. Each row opens the same screen as before.
 */

export interface DeskApi {
  onEvent: (iid: string) => void;
  onDay: (day: number) => void;
  /** The Sit-Down, opened on one item when a row brings it (its brief id). */
  onSitDown: (brief?: string) => void;
  onCancelOrder: (i: number) => void;
  onMoney: () => void;
  onChar: (id: string) => void;
  /** A lieutenant's proposal: the chain of command. */
  onLt?: () => void;
  /** An urgent meeting (threats.ts). */
  onUrgent?: (tip: string) => void;
  /** The envelope meeting. */
  onEnvelope?: () => void;
  /** Take a handled item back: it moves to Needs you (and opens). */
  onTake?: (key: string) => void;
  /** A result's entry in Your File. */
  onFile?: (entry?: string) => void;
  /** Everything in motion (the plans panel). */
  onMotion?: () => void;
  /** An old save's one-time offer: let the underboss handle the routine (true) or keep it as it was. */
  onOffer?: (take: boolean) => void;
}

export type DeskFilter = 'all' | 'decisions' | 'capos' | 'lieutenants' | 'money' | 'people';
const FILTERS: { id: DeskFilter; label: string; kinds: DeskKind[] }[] = [
  { id: 'all', label: 'All', kinds: [] },
  { id: 'decisions', label: '✉ Decisions', kinds: ['decision', 'urgent', 'petition'] },
  { id: 'capos', label: '☕ Capos & sit-down', kinds: ['morning', 'sitdown'] },
  { id: 'lieutenants', label: '♜ Lieutenants', kinds: ['lieutenant'] },
  { id: 'money', label: '$ Money', kinds: ['envelope', 'request', 'bill'] },
  { id: 'people', label: '☏ At the door', kinds: ['decision', 'petition', 'morning', 'sitdown', 'lawyer', 'urgent'] },
];
const inFilter = (f: DeskFilter, it: DeskItem) => f === 'all' || FILTERS.find((x) => x.id === f)!.kinds.includes(it.kind);

const ICON: Record<DeskKind, string> = { decision: '✉', petition: '☏', urgent: '⚠', morning: '☕', sitdown: '♜', lieutenant: '♜', request: '♣', envelope: '$', lawyer: '§', order: '☰', bill: '$', upcoming: '◷', result: '✓' };

function openItem(it: DeskItem, api: DeskApi) {
  if (it.kind === 'result' && api.onFile) api.onFile(it.ref.entry);
  else if (it.ref.tip && api.onUrgent) api.onUrgent(it.ref.tip);
  else if (it.ref.event) api.onEvent(it.ref.event);
  else if (it.kind === 'morning' || (it.kind === 'upcoming' && it.ref.day !== undefined)) api.onDay(it.ref.day ?? 0);
  else if (it.kind === 'sitdown') api.onSitDown(it.ref.brief);
  else if (it.kind === 'lieutenant' && api.onLt) api.onLt();
  else if (it.kind === 'envelope' && api.onEnvelope) api.onEnvelope();
  else if (it.kind === 'bill' || it.kind === 'envelope') api.onMoney();
  else if (it.ref.charId) api.onChar(it.ref.charId);
  else api.onSitDown();
}

function verbOf(it: DeskItem): string | undefined {
  switch (it.kind) {
    case 'decision': case 'petition': return it.done ? 'Change' : 'Decide';
    case 'urgent': return 'See him';
    case 'morning': return it.done ? 'Change' : 'Answer';
    case 'sitdown': return 'Hear him out';
    case 'lieutenant': return 'Your word';
    case 'envelope': return 'Split it';
    case 'bill': return 'Money';
    case 'order': return undefined;
    default: return 'Open';
  }
}

function WhyChips({ why }: { why?: string[] }) {
  if (!why?.length) return null;
  return <div className="mt-0.5 flex flex-wrap gap-1">{why.slice(0, 3).map((w) => <span key={w} className="rounded bg-noir-700/80 px-1 text-[10px] text-amber-200/90">{w}</span>)}</div>;
}

function NeedRow({ s, it, api }: { s: GameState; it: DeskItem; api: DeskApi }) {
  const verb = verbOf(it);
  const d = deskDomain(s, it);
  return (
    <li className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${it.urgent && !it.done ? 'border-red-400/70 bg-blood-500/10' : it.done ? 'border-emerald-800/50 bg-emerald-950/20' : 'border-noir-700 bg-noir-900/60'} ${d && !it.done ? `${domClass(d)} llv-dom-edge${it.urgent ? '' : ' llv-dom-tint'}` : ''}`} data-testid={`desk-item-${it.kind}`} data-done={it.done ? 'true' : undefined} data-domain={d}>
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-center text-[12px] ${it.done ? 'text-emerald-400' : d ? 'llv-dom-chip' : 'text-stone-500'}`} aria-hidden title={d ? DOMAINS[d].label : undefined}>{it.done ? '✓' : ICON[it.kind]}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-stone-100">{it.title}{it.urgent && !it.done && <span className="ml-1 rounded bg-red-500/80 px-1 text-[10px] font-bold uppercase text-white">urgent</span>}{it.done && <DoneMark className="ml-1.5 align-middle">Answered</DoneMark>}</div>
        <div className={`text-[12px] leading-snug ${it.done ? 'text-stone-400' : 'text-stone-300'}`}>{it.detail}</div>
        {!it.done && <WhyChips why={it.why} />}
        {it.ifNothing && !it.done && <div className="mt-0.5 text-[11px] text-stone-500">If you leave it: {it.ifNothing}</div>}
      </div>
      {verb && <button type="button" className={`${it.done ? 'btn-secondary' : 'btn-primary'} btn-sm shrink-0`} onClick={() => openItem(it, api)}>{verb} ▸</button>}
    </li>
  );
}

function HandledRow({ s, it, api }: { s: GameState; it: DeskItem; api: DeskApi }) {
  const h = it.handled!;
  const d = deskDomain(s, it);
  return (
    <li className={`flex items-start gap-2 rounded border border-noir-800 bg-noir-900/40 px-2 py-1 ${d ? `${domClass(d)} llv-dom-edge` : ''}`} data-testid={`desk-handled-${it.kind}`} data-domain={d}>
      <span className="mt-0.5 w-4 shrink-0 text-center text-stone-600" aria-hidden>{ICON[it.kind]}</span>
      <div className="min-w-0 flex-1 text-[11px]">
        <div className="truncate text-stone-300">{it.title}</div>
        <div className="text-stone-500"><span className="text-stone-300">{h.by}</span>: {h.does}{h.day !== undefined ? ` · ${DAY_NAMES[h.day]}` : ''}{h.delegated ? ' · standing order' : ''}</div>
      </div>
      <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => { api.onTake?.(it.key); openItem(it, api); }} data-testid="desk-take-back">Take it back</button>
    </li>
  );
}

function Fold({ g, render, n = 3, testid }: { g: DeskGroup; render: (it: DeskItem) => ReactNode; n?: number; testid?: string }) {
  const [all, setAll] = useState(false);
  const rows = g.items;
  const shown = all ? rows : rows.slice(0, n);
  return (
    <>
      <ul className="mt-1 space-y-1">{shown.map((it) => <Fragment key={it.key}>{render(it)}</Fragment>)}</ul>
      {rows.length > n && (
        <button type="button" className="btn-quiet mt-1 text-[11px]" onClick={() => setAll((x) => !x)} data-testid={testid ?? `desk-more-${g.kind}`}>
          {all ? 'show fewer' : `show all ${rows.length} ▾`}
        </button>
      )}
    </>
  );
}

function SmallRow({ s, it, api }: { s: GameState; it: DeskItem; api: DeskApi }) {
  const d = deskDomain(s, it);
  return (
    <li className={`flex items-start gap-2 rounded border border-noir-800 px-2 py-1 text-[11px] ${d ? `${domClass(d)} llv-dom-edge` : ''}`} data-testid={`desk-item-${it.kind}`} data-domain={d}>
      <div className="min-w-0 flex-1"><div className={it.tone === 'bad' ? 'text-amber-200' : it.tone === 'good' ? 'text-emerald-200' : 'text-stone-200'}>{it.title}</div><div className="text-stone-500">{it.detail}</div></div>
      {it.kind === 'order' && it.ref.order !== undefined
        ? <button type="button" className="btn-secondary shrink-0 py-0.5 text-[10px]" onClick={() => api.onCancelOrder(it.ref.order!)} data-testid="desk-cancel-order">Cancel</button>
        : <button type="button" className="btn-quiet shrink-0 text-[10px]" onClick={() => openItem(it, api)}>{verbOf(it) ?? 'Open'} ▸</button>}
    </li>
  );
}

export function BossDesk({ s, ui, api, filter: filter0 = 'all', side, inDrawer }: { s: GameState; ui: DeskUi; api: DeskApi; filter?: DeskFilter; /** The side column (The Rise). */ side?: ReactNode; /** In the Desk drawer (its header already says "The Desk"): no second title, no second clock. */ inDrawer?: boolean }) {
  const [filter, setFilter] = useState<DeskFilter>(filter0);
  const all = bossDesk(s, ui);
  // The one count: Needs you of the same queue the rows come from.
  const waiting = deskHeaderCount(s, ui);
  const get = (k: DeskGroup['kind']) => all.find((g) => g.kind === k);
  const pick = (g?: DeskGroup): DeskGroup | undefined => (g ? { ...g, items: g.items.filter((it) => inFilter(filter, it)) } : undefined);
  const needs = pick(get('needs'));
  const handled = pick(get('handled'));
  const counts = FILTERS.map((f) => ({ ...f, n: all.filter((g) => g.kind === 'needs' || g.kind === 'handled').flatMap((g) => g.items).filter((it) => !it.done && inFilter(f.id, it)).length }));
  const rest = (['result', 'order', 'upcoming', 'bill'] as const).map(get).filter((g): g is DeskGroup => !!g && (filter === 'all' || (filter === 'money' && g.kind === 'bill')));
  return (
    <section className="rounded-md border border-gold-600/50 bg-noir-800/50 p-2.5" data-testid="boss-desk">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {!inDrawer && <div className="panel-title text-base">The Desk</div>}
          <div className="text-[11px] text-stone-400" data-testid="desk-count">{waiting ? `${waiting} need${waiting === 1 ? 's' : ''} you` : 'Nothing needs you'}{handled?.items.length ? ` · ${get('handled')!.items.length} handled for you` : ''} · week {s.week}</div>
        </div>
        {!inDrawer && <div className="hidden sm:block"><DeskClock s={s} className="text-[11px] sm:text-[13px]" /></div>}
      </div>
      {ltView(s).offer && api.onOffer && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded border border-gold-600/60 bg-gold-500/10 px-2 py-1.5 text-[12px] text-stone-200" data-testid="desk-offer">
          <span className="min-w-0 flex-1">Your underboss offers to handle the routine: the crews, the rackets, the street, the papers and the quarrels, and each capo his own territory. Big steps still wait for you.</span>
          <button type="button" className="btn-secondary py-0.5 text-[11px]" onClick={() => api.onOffer!(false)} data-testid="desk-offer-keep">Keep it as it was</button>
          <button type="button" className="btn-primary py-0.5 text-[11px]" onClick={() => api.onOffer!(true)} data-testid="desk-offer-take">Let him</button>
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1" role="tablist" aria-label="Filter the desk">
        {counts.filter((f) => f.id === 'all' || f.n > 0 || f.id === filter).map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} data-testid={`desk-filter-${f.id}`}
            className={`rounded-full border px-2 py-0.5 text-[10px] ${filter === f.id ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-400 hover:text-stone-200'}`}>{f.label}{f.id !== 'all' ? ` ${f.n}` : ''}</button>
        ))}
        {api.onMotion && <button type="button" className="btn-quiet ml-auto text-[10px]" onClick={api.onMotion} data-testid="desk-in-motion">◐ In motion ▸</button>}
      </div>
      <div className={`mt-1.5 grid gap-2 ${side ? 'lg:grid-cols-[1fr_minmax(220px,300px)]' : ''}`}>
        <div className="min-w-0 space-y-2">
          <div data-testid="desk-group-needs">
            <div className="llv-section-title mb-1 text-[14px]">Needs you ({needs?.items.filter((x) => !x.done).length ?? 0})</div>
            {needs && needs.items.length > 0 && needs.items.every((x) => x.done) && (
              <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1.5 text-[12px] text-emerald-200" data-testid="desk-all-answered">
                <DoneMark>All answered</DoneMark> Everything that needed you this week has your answer. Advance the week when you are ready.
              </div>
            )}
            {needs?.items.length ? <Fold g={needs} n={6} render={(it) => <NeedRow s={s} it={it} api={api} />} /> : <p className="mt-1 text-[12px] text-stone-500">Nothing needs you{filter !== 'all' ? ' here' : ''}. Your people have the rest; plan an evening, grow the family, or advance the week.</p>}
          </div>
          {handled && handled.items.length > 0 && (
            <div data-testid="desk-group-handled">
              <div className="llv-section-title mb-1 text-[14px]">Handled for you ({handled.items.length})</div>
              <Fold g={handled} n={3} render={(it) => <HandledRow s={s} it={it} api={api} />} />
            </div>
          )}
          {rest.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {rest.map((g) => (
                <div key={g.kind} data-testid={`desk-group-${g.kind}`}>
                  <div className="llv-section-title mb-1 text-[14px]">{g.title} ({g.items.length}){g.kind === 'bill' ? ` · ${fmt$(g.items.reduce((a, x) => a + (x.cost ?? 0), 0))}` : ''}</div>
                  <Fold g={g} n={2} render={(it) => <SmallRow s={s} it={it} api={api} />} />
                </div>
              ))}
            </div>
          )}
        </div>
        {side && <aside className="min-w-0" data-testid="desk-side">{side}</aside>}
      </div>
    </section>
  );
}

/** "Ready to advance?": what is unanswered and what it becomes, the orders that run, what is known to cost. */
export function ReadyToAdvance({ s, ui, onReview, onAdvance, onClose, month, onAnswer }: { s: GameState; ui: DeskUi; onReview: () => void; onAdvance: () => void; onClose: () => void; month?: boolean; onAnswer?: (iid: string, choiceId: string) => void }) {
  const r = readyReview(s, ui);
  return (
    <Modal onClose={onClose}>
      <div className="p-4 sm:p-5 space-y-3" data-testid="ready-review">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl text-gold-400">Ready to advance{month ? ' the month' : ''}?</h2>
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>Cancel</button>
        </div>
        {r.unanswered.length > 0 && (
          <div data-testid="ready-unanswered">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Not decided — this is what happens</div>
            <ul className="mt-1 space-y-0.5 text-[12px]">{r.unanswered.map((u) => <li key={u.iid}><span className="text-stone-200">{u.title}</span> <span className="text-stone-500">→</span> <span className="text-amber-200">{u.becomes}</span> <TableButton s={s} subject={{ kind: 'event', iid: u.iid }} onChoose={onAnswer ? (c) => onAnswer(u.iid, c) : undefined} testid="ready-table" /></li>)}</ul>
          </div>
        )}
        {r.mornings.length > 0 && (
          <div data-testid="ready-mornings">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Capos' requests you haven't answered</div>
            <ul className="mt-1 space-y-0.5 text-[12px]">{r.mornings.map((m) => <li key={m.key}><span className="text-stone-200">{m.title}</span> <span className="text-stone-500">→ his way:</span> <span className="text-stone-300">{m.becomes}</span></li>)}</ul>
          </div>
        )}
        <div data-testid="ready-orders">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Orders that run ({r.orders.length})</div>
          {r.orders.length ? <ul className="mt-1 space-y-0.5 text-[12px]">{r.orders.map((o, i) => <li key={i} className="flex justify-between gap-2"><span className="text-stone-200">{o.title}</span><span className="tabular-nums text-stone-400">{o.cost ? `${fmt$(o.cost)} · ${o.pot === 'pocket' ? 'pocket' : 'Family'}` : 'free'}</span></li>)}</ul> : <p className="text-[12px] text-stone-500">None queued.</p>}
        </div>
        <div className="rounded border border-noir-700 bg-noir-900/60 p-2 text-[12px] tabular-nums" data-testid="ready-costs">
          <div className="flex justify-between"><span className="text-stone-400">Orders</span><span>{fmt$(r.costs.orders)}</span></div>
          <div className="flex justify-between"><span className="text-stone-400">Your evenings (pocket)</span><span>{fmt$(r.costs.evenings)}</span></div>
          <div className="flex justify-between"><span className="text-stone-400">Weekly bills (payroll, upkeep, loans)</span><span>{fmt$(r.costs.bills)}</span></div>
          <div className="mt-1 flex justify-between border-t border-noir-700 pt-1"><span className="text-stone-400">After the orders, evenings and bills</span><span>Family {fmt$(r.costs.familyAfter)} · pocket {fmt$(r.costs.pocketAfter)}</span></div>
          <div className="text-[10px] text-stone-500">Known costs only. The week's take, the envelope and anything that happens come on top.</div>
        </div>
        {r.warnings.map((w, i) => <div key={i} className="text-[12px] text-red-300">⚠ {w}</div>)}
        <div className="flex flex-wrap gap-2 border-t border-noir-700 pt-2">
          {(r.unanswered.length > 0 || r.mornings.length > 0) && <button type="button" className="btn-secondary text-sm" onClick={onReview} data-testid="ready-review-btn">Review first</button>}
          <button type="button" className="btn-primary text-sm" onClick={onAdvance} data-testid="ready-advance">{r.unanswered.length ? 'Advance anyway ▸' : 'Advance ▸'}</button>
        </div>
      </div>
    </Modal>
  );
}
