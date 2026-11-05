import { TableButton } from '../advice/CounselTable';
import { openPlanner } from '../planner/ink';
import { bossDesk, deskHeaderCount, readyReview, type DeskGroup, type DeskItem, type DeskKind, type DeskUi } from '../../engine/desk';
import type { Character, GameState } from '../../engine/types';
import { DAY_NAMES } from '../../engine/days';
import { ltView } from '../../engine/lieutenants';
import { fmt$ } from '../format';
import { Modal } from '../components/Modal';
import { Fragment, useState, type ReactNode } from 'react';
import { DoneMark, PlayCard } from '../components/Layout';
import { Face } from '../components/People';
import { displayName } from '../../engine/characters';
import { consiglierePick, counselor, notRoutine } from '../../engine/delegation';
import { DeskClock } from '../components/DeskClock';
import { AssetImg } from '../hood/AssetImg';
import { domainOf, domainOfText, domClass, type Domain } from '../domain';

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
  /** A woman who came to him, or Ma's match (single.ts): Relationships & Dating. */
  onSingle?: () => void;
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
  { id: 'people', label: '☏ At the door', kinds: ['decision', 'petition', 'morning', 'sitdown', 'lawyer', 'urgent', 'request'] },
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
  else if (it.ref.single && api.onSingle) api.onSingle();
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
    case 'request': return it.ref.single ? 'See her' : 'Open';
    case 'order': return undefined;
    default: return 'Open';
  }
}

/** Whom a row is about: the person it names, else the first face of the decision. Undefined when it is nobody's. */
function deskPeople(s: GameState, it: DeskItem): Character[] {
  const ids: string[] = [];
  if (it.ref.charId) ids.push(it.ref.charId);
  if (it.ref.event) {
    const ev = s.pendingEvents.find((e) => e.iid === it.ref.event);
    for (const id of ev?.actors ?? (ev?.meta?.charId ? [String(ev.meta.charId)] : [])) if (!ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => s.characters[id]).filter((c): c is Character => !!c).slice(0, 2);
}

/** One paper that needs him, as a playing card: the person on top (else the kind of paper, lit), the title, two lines, the one verb. */
function NeedCard({ s, it, api, next }: { s: GameState; it: DeskItem; api: DeskApi; /** The one recommended move: its button glows. */ next?: boolean }) {
  const verb = verbOf(it);
  const d = deskDomain(s, it);
  const people = deskPeople(s, it);
  const named = people[0] && it.title.includes(people[0].lastName);
  const why = !it.done && it.why?.length ? it.why.slice(0, 2) : [];
  return (
    <PlayCard as="li" d={d} testid={`desk-item-${it.kind}`} dataAttrs={{ 'data-done': it.done ? 'true' : undefined }}
      tone={it.done ? 'done' : it.urgent ? 'urgent' : undefined}
      cardTitle={[it.title, it.detail, it.ifNothing && !it.done ? `If you leave it: ${it.ifNothing}` : ''].filter(Boolean).join('\n')}
      art={people.length ? <span className="mb-[-1px] flex items-end gap-1">{people.map((c) => <Face key={c.id} s={s} c={c} size={people.length > 1 ? 50 : 62} noSide />)}</span>
        : <span className="llv-pc-glyph" aria-hidden>{ICON[it.kind]}</span>}
      pip={d ? undefined : ICON[it.kind]}
      corner={it.done ? <DoneMark className="!px-1.5 !py-0 !text-[10px]">Answered</DoneMark> : it.urgent ? <span className="llv-pc-tag llv-pc-tag-red">urgent</span> : undefined}
      caption={people[0] && !named ? displayName(people[0]) : undefined}
      title={it.title}
      lines={[it.detail, it.ifNothing && !it.done ? <>If you leave it: {it.ifNothing}</> : undefined]}>
      {why.length > 0 && <div className="mt-0.5 flex gap-1 overflow-hidden whitespace-nowrap">{why.map((w) => <span key={w} className="rounded bg-noir-700/80 px-1 text-[10px] text-amber-200/90">{w}</span>)}</div>}
      {verb && <div className="mt-auto pt-1.5"><button type="button" className={`${it.done ? 'btn-secondary' : 'btn-primary'} btn-sm w-full justify-center ${next ? 'llv-next' : ''}`} onClick={() => openItem(it, api)} data-next={next ? 'true' : undefined}>{verb} ▸</button></div>}
    </PlayCard>
  );
}

/** The papers that need him, as a hand of cards: one row to slide through, or all of them laid out. */
function Hand({ g, title, render }: { g: DeskGroup; title: ReactNode; render: (it: DeskItem) => ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        {title}
        {g.items.length > 3 && (
          <button type="button" className="btn-quiet ml-auto rounded bg-noir-950/75 px-1.5 text-[11px]" onClick={() => setAll((x) => !x)} data-testid={`desk-more-${g.kind}`}>
            {all ? 'one row ▴' : `lay out all ${g.items.length} ▾`}
          </button>
        )}
      </div>
      <ul className={`llv-hand ${all ? 'llv-hand-all' : ''}`} aria-label="The papers that need you">{g.items.map((it) => <Fragment key={it.key}>{render(it)}</Fragment>)}</ul>
    </>
  );
}

function HandledRow({ s, it, api }: { s: GameState; it: DeskItem; api: DeskApi }) {
  const h = it.handled!;
  const d = deskDomain(s, it);
  // The person it is about anchors the row; else the man handling it.
  const who = deskPeople(s, it)[0] ?? (h.byId ? s.characters[h.byId] : undefined);
  return (
    <li className={`llv-paper flex items-center gap-2 rounded border border-noir-800 px-2 py-1 ${d ? `${domClass(d)} llv-dom-edge` : ''}`} data-testid={`desk-handled-${it.kind}`} data-domain={d}>
      {who ? <Face s={s} c={who} size={38} noSide /> : <span className="mt-0.5 w-4 shrink-0 text-center text-stone-600" aria-hidden>{ICON[it.kind]}</span>}
      <div className="min-w-0 flex-1 text-[11px]">
        <div className="truncate text-[12px] font-semibold text-stone-200">{it.title}</div>
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
  const who = deskPeople(s, it)[0];
  return (
    <li className={`llv-paper flex items-center gap-2 rounded border border-noir-800 px-2 py-1 text-[11px] ${d ? `${domClass(d)} llv-dom-edge` : ''}`} data-testid={`desk-item-${it.kind}`} data-domain={d}>
      {who && <Face s={s} c={who} size={32} noSide />}
      <div className="min-w-0 flex-1"><div className={it.tone === 'bad' ? 'text-amber-200' : it.tone === 'good' ? 'text-emerald-200' : 'text-stone-200'}>{it.title}</div><div className="text-stone-500">{it.detail}</div></div>
      {it.kind === 'order' && it.ref.order !== undefined
        ? <button type="button" className="btn-secondary shrink-0 py-0.5 text-[10px]" onClick={() => api.onCancelOrder(it.ref.order!)} data-testid="desk-cancel-order">Cancel</button>
        : <button type="button" className="btn-quiet shrink-0 text-[10px]" onClick={() => openItem(it, api)}>{verbOf(it) ?? 'Open'} ▸</button>}
    </li>
  );
}

/** The objects on the painting (desk_topdown_1960, 1672 × 941), in percent: what each opens. */
const DESK_SPOTS: { id: 'ashtray' | 'ledger' | 'phone' | 'envelopes'; label: string; hint: string; icon: string; d: Domain; at: string; rect: { x: number; y: number; w: number; h: number } }[] = [
  { id: 'ashtray', label: 'Your File', hint: 'What happened, and what it led to', icon: '✎', d: 'politics', at: 'left-1 top-1', rect: { x: 3, y: 9, w: 16, h: 22 } },
  { id: 'ledger', label: 'The ledger', hint: 'This week\'s money: where it came from and went', icon: '▤', d: 'money', at: 'left-1 top-1', rect: { x: 0.5, y: 33, w: 18.5, h: 46 } },
  { id: 'phone', label: 'The phone', hint: 'Make a call, the calls you missed', icon: '☏', d: 'law', at: 'right-1 bottom-1', rect: { x: 78, y: 0.5, w: 21.5, h: 40 } },
  { id: 'envelopes', label: 'The envelopes', hint: 'The weekly envelope: hear the count, take your cut', icon: '✉', d: 'money', at: 'right-1 top-1', rect: { x: 78, y: 42, w: 22, h: 57.5 } },
];

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
  // The one recommended move: the first open paper that needs him (the red one first; the list is already in that order).
  const nextKey = needs?.items.find((x) => !x.done)?.key;
  const needsTitle = <div className="llv-blotter-title">Needs you ({needs?.items.filter((x) => !x.done).length ?? 0})</div>;
  const rest = (['result', 'order', 'upcoming', 'bill'] as const).map(get).filter((g): g is DeskGroup => !!g && (filter === 'all' || (filter === 'money' && g.kind === 'bill')));
  return (
    <section className="llv-desktop" data-testid="boss-desk">
      <div className="llv-desktop-grid">
      {/* The owner's painting: his desk from above, the lamp, the ledger, the ashtray, the phone, the envelopes. The corners are
          objects you can pick up; the papers of the week lie in the dark middle. */}
      <div className="llv-desktop-art" data-testid="desk-art">
        <AssetImg k="desk_topdown_1960" alt="" className="absolute inset-0 h-full w-full object-cover" fallback={<span className="llv-desktop-fallback" aria-hidden />} />
        {DESK_SPOTS.map((h) => (
          <button key={h.id} type="button" className="llv-spot group absolute rounded-md border border-transparent focus-visible:outline-none" data-testid={`desk-spot-${h.id}`}
            style={{ left: `${h.rect.x}%`, top: `${h.rect.y}%`, width: `${h.rect.w}%`, height: `${h.rect.h}%` }} aria-label={`${h.label}: ${h.hint}`} title={`${h.label}: ${h.hint}`}
            onClick={() => (h.id === 'ledger' ? api.onMoney() : h.id === 'envelopes' ? (api.onEnvelope ?? api.onMoney)() : h.id === 'ashtray' ? api.onFile?.() : window.dispatchEvent(new Event('llv-open-phone')))}>
            <span className={`absolute ${h.at} inline-flex items-center gap-1 rounded border bg-noir-950/85 px-1.5 py-0.5 text-[10px] leading-none shadow shadow-black/60 ${domClass(h.d)} llv-dom-border`}>
              <span aria-hidden className="llv-dom-ink">{h.icon}</span><span className="hidden text-stone-100 md:inline">{h.label}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="llv-desktop-center">
      <div className="llv-blotter flex flex-wrap items-start justify-between gap-2">
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
      <div className="llv-blotter mt-1.5 flex flex-wrap gap-1" role="tablist" aria-label="Filter the desk">
        {counts.filter((f) => f.id === 'all' || f.n > 0 || f.id === filter).map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} data-testid={`desk-filter-${f.id}`}
            className={`rounded-full border px-2 py-0.5 text-[10px] ${filter === f.id ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-400 hover:text-stone-200'}`}>{f.label}{f.id !== 'all' ? ` ${f.n}` : ''}</button>
        ))}
        <button type="button" className="btn-quiet ml-auto text-[10px]" onClick={() => openPlanner('brief')} data-testid="desk-planner" title="The morning brief, who wants an audience, the datebook, the black book, your standing orders">▥ The book ▸</button>
        {api.onMotion && <button type="button" className="btn-quiet text-[10px]" onClick={api.onMotion} data-testid="desk-in-motion">◐ In motion ▸</button>}
      </div>
          <div data-testid="desk-group-needs" className="llv-desk-hand mt-2">
            {needs && needs.items.length > 0 && needs.items.every((x) => x.done) && (
              <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1.5 text-[12px] text-emerald-200" data-testid="desk-all-answered">
                <DoneMark>All answered</DoneMark> Everything that needed you this week has your answer. Advance the week when you are ready.
              </div>
            )}
            {!needs?.items.length && needsTitle}
            {needs?.items.length ? <Hand g={needs} title={needsTitle} render={(it) => <NeedCard s={s} it={it} api={api} next={it.key === nextKey} />} /> : <p className="llv-paper mt-1 rounded-md px-2.5 py-2 text-[12px] text-stone-300">Nothing needs you{filter !== 'all' ? ' here' : ''}. Your people have the rest; plan an evening, grow the family, or advance the week.</p>}
          </div>
      </div>
      </div>
      <div className="llv-desktop-rest">
      <div className={`grid gap-2 ${side ? 'lg:grid-cols-[1fr_minmax(220px,300px)]' : ''}`}>
        <div className="min-w-0 space-y-2">
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
      </div>
    </section>
  );
}

/** "Ready to advance?": what is unanswered and what it becomes, the orders that run, what is known to cost. */
export function ReadyToAdvance({ s, ui, onReview, onAdvance, onClose, month, onAnswer }: { s: GameState; ui: DeskUi; onReview: () => void; onAdvance: () => void; onClose: () => void; month?: boolean; onAnswer?: (iid: string, choiceId: string) => void }) {
  const r = readyReview(s, ui);
  // Who settles what's left: the consigliere (or the underboss), on the small things; the big ones stay the boss's.
  const man = counselor(s);
  const handOff = r.unanswered.map((u) => {
    const ev = s.pendingEvents.find((e) => e.iid === u.iid);
    const why = ev ? notRoutine(s, ev) : 'it is gone';
    const pick = ev && !why ? consiglierePick(s, ev) : undefined;
    return { iid: u.iid, why, pick };
  });
  const settleable = handOff.filter((h) => h.pick);
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
            {onAnswer && settleable.length > 0 && (
              <button type="button" className="btn-gold mt-1 w-full text-sm" data-testid="ready-settle-all"
                onClick={() => { for (const h of settleable) onAnswer(h.iid, h.pick!.choiceId); }}>
                Let {man ? man.firstName : 'your people'} settle the {settleable.length} small {settleable.length === 1 ? 'one' : 'ones'} ▸
              </button>
            )}
            <ul className="mt-1 space-y-1 text-[12px]">{r.unanswered.map((u) => {
              const h = handOff.find((x) => x.iid === u.iid);
              return (
                <li key={u.iid}>
                  <span className="text-stone-200">{u.title}</span> <span className="text-stone-500">→</span> <span className="text-amber-200">{u.becomes}</span> <TableButton s={s} subject={{ kind: 'event', iid: u.iid }} onChoose={onAnswer ? (c) => onAnswer(u.iid, c) : undefined} testid="ready-table" />
                  <div className="text-[11px]">
                    {h?.pick && onAnswer
                      ? <button type="button" className="text-gold-300 underline decoration-dotted" onClick={() => onAnswer(u.iid, h.pick!.choiceId)} data-testid="ready-settle">Let {h.pick.by} settle it: "{h.pick.label}"</button>
                      : <span className="text-stone-500">Yours to decide{h?.why ? `: ${h.why}` : ''}.</span>}
                  </div>
                </li>
              );
            })}</ul>
          </div>
        )}
        {r.mornings.length > 0 && (
          <div data-testid="ready-mornings">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Capos' requests you haven't answered: if you advance, each capo settles it his own way</div>
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
