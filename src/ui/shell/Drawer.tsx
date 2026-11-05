import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEscape } from '../keys';
import type { GameState } from '../../engine/types';
import type { SectionCtx } from './panels';
import { Guard } from '../components/Guard';
import { HOMES_BY_ID, itemOf, sectionDef, type NavGroup, type NavItem } from './nav';
import type { HomeId } from './routes';
import type { DoNowItem } from './doNow';
import { useOpportunity } from './RightRail';
import { sectionLock } from '../../engine/rankView';
import { DoneMark } from '../components/Layout';
import { domainOf, domClass } from '../domain';
import type { DeskItem, DeskUi } from '../../engine/desk';
import type { FindResult } from './find';
import { needsFor } from './placeFront';
import { ActionsBand, NeedRows, PeopleBand, RecBand } from './FrontBands';

const glyph = (g: string) => <span aria-hidden style={{ fontVariantEmoji: 'text' } as never}>{g}&#xFE0E;</span>;

const TONE = {
  danger: 'border-red-400/80 bg-blood-500/15',
  warn: 'border-amber-500/70 bg-amber-900/15',
  good: 'border-emerald-600/60 bg-emerald-900/10',
  info: 'border-gold-600/50 bg-noir-800/70',
} as const;
const DOT = { danger: 'bg-red-400', warn: 'bg-amber-400', good: 'bg-emerald-400', info: 'bg-gold-400' } as const;

/**
 * Band 2, "Needs you here": the Desk's papers that belong to this home (placeFront.needsFor), then the
 * home's own "Do this now" (doNow.ts), up to three, each one click from its answer.
 */
function DoNowStrip({ s, items, onDo, needs = [], onNeed }: { s: GameState; items: DoNowItem[]; onDo: (d: DoNowItem) => void; needs?: DeskItem[]; onNeed?: (it: DeskItem) => void }) {
  const opp = useOpportunity();
  const shown = items.slice(0, 3);
  return (
    <section className="mb-4" data-testid="do-now" aria-label="Needs you here">
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.25em] text-stone-500">{needs.length ? 'Needs you here' : 'Do this now'}</div>
      <NeedRows needs={needs} onNeed={onNeed} />
      {!shown.length ? (needs.length ? null : (
        <p className="rounded border border-noir-700 px-3 py-2 text-xs text-stone-400" data-testid="do-now-empty">Nothing urgent here. Look around, or close this and advance the week.</p>
      )) : (
        <ul className="grid gap-1.5">
          {shown.map((d) => {
            const queued = d.act.kind === 'opp' && opp.queued(s, d.act.opp);
            return (
              <li key={d.id} className={`flex items-center gap-2 rounded border px-2.5 py-2 ${TONE[d.tone]}`} data-testid="do-now-item">
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[d.tone]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-snug text-stone-100">{d.title}</div>
                  {d.text && <div className="text-[11px] leading-snug text-stone-400 line-clamp-2">{d.text}</div>}
                </div>
                {queued ? <DoneMark>Ordered</DoneMark> : (
                  <button type="button" onClick={() => (d.act.kind === 'opp' ? opp.go(s, d.act.opp) : onDo(d))}
                    className="shrink-0 rounded border border-gold-500 px-2.5 py-1 text-xs font-semibold text-gold-300 hover:bg-gold-500/15">
                    {`${d.cta} ▸`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 3 && <p className="mt-1 text-[11px] text-stone-500">and {items.length - 3} more in the alerts.</p>}
    </section>
  );
}

/** The section's one-line description: two lines on a phone, the rest a tap away. */
function Blurb({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const long = text.length > 110;
  return (
    <div className="mb-3" data-testid="section-blurb">
      <p className={`llv-pagehead-sub text-stone-500 ${long && !all ? 'line-clamp-2 sm:line-clamp-none' : ''}`}>{text}</p>
      {long && !all && <button type="button" className="sm:hidden text-[11px] text-gold-400" onClick={() => setAll(true)}>Read more</button>}
    </div>
  );
}

function ItemCard({ it, fresh, onOpen }: { it: NavItem; fresh: boolean; onOpen: () => void }) {
  // Each place carries the colour of its part of the Don's life (ui/domain.ts): the icon chip and the edge.
  const d = domainOf(it.keys[0]) ?? domainOf(it.id);
  return (
    <button type="button" onClick={onOpen} data-testid={`nav-item-${it.id}`} data-locked={it.locked ? 'true' : undefined} data-domain={d} title={it.locked ? `${it.label}: ${it.locked}` : undefined}
      className={`group relative flex w-full items-start gap-2.5 rounded-md border border-noir-700 bg-noir-800/60 px-2.5 py-2 text-left hover:border-gold-500/70 hover:bg-noir-800 ${d ? `${domClass(d)} llv-dom-edge` : ''} ${it.locked ? 'opacity-50' : ''}`}>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${d ? 'llv-dom-chip !rounded-full' : 'border border-gold-600/50 text-gold-400'}`}>{glyph(it.icon)}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-stone-100 group-hover:text-gold-300">{it.label}</span>
        <span className="block text-[11px] leading-snug text-stone-400">{it.locked ? <span className="text-amber-200">🔒 {it.locked}. </span> : null}{it.sub}</span>
      </span>
      {fresh && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold-400" aria-label="new" />}
    </button>
  );
}

/**
 * A home's drawer over the map (the map never unmounts). With no section
 * open it is the home's front page: "Do this now", then every place in it
 * with an icon and a line on what it is for. With a section open: a way
 * back, the home's other places as tabs, the views (if any), the section.
 * Esc or × closes. 640px wide (1080 for the wide screens); on phones it
 * takes the whole map area.
 */
/** What the front page's bands need from the shell (all optional: without it the bands still render, inert). */
export interface FrontApi {
  /** The Desk's UI state (answers, orders…), so "Needs you here" matches the Desk. */
  ui?: DeskUi;
  /** Open a Desk paper the way the Desk does. */
  onNeed?: (it: DeskItem) => void;
  /** Carry out a pick (a recommendation, a thing to do), as Find does. */
  onPick?: (r: FindResult) => void;
  /** Which places are open to this boss (Find's `open`). */
  open?: (key: string) => boolean;
  /** "Everyone ▸": the black book. */
  onEveryone?: () => void;
}

export function Drawer({ s, home, sel, groups, ctx, onOpen, onClose, escEnabled, fresh, doNow, onDo, extras, top, front = {} }: {
  s: GameState;
  home: HomeId;
  /** The open section (a canonical key), or undefined for the front page. */
  sel?: string;
  /** The home's groups, already filtered to what is open to this boss. */
  groups: NavGroup[];
  ctx: SectionCtx;
  onOpen: (key?: string) => void;
  onClose: () => void;
  escEnabled: boolean;
  fresh?: Set<string>;
  doNow: DoNowItem[];
  onDo: (d: DoNowItem) => void;
  /** Sections the shell renders itself (nav.settings, nav.help). */
  extras: Record<string, ReactNode>;
  /** Extra front-page block under "Do this now" (This Week: the routine). */
  top?: ReactNode;
  front?: FrontApi;
}) {
  const def = HOMES_BY_ID[home];
  const items = groups.flatMap((g) => g.items);
  const item = sel ? itemOf(sel) : undefined;
  // The home's own copy of the place (its views filtered to what is open to this boss).
  const cur = item ? items.find((x) => x === item || x.id === item.id || x.keys.includes(sel!)) : undefined;
  const key = cur ? (cur.keys.includes(sel!) ? sel! : cur.keys[0]) : undefined;
  const body = useRef<HTMLDivElement>(null);
  // Escape closes the drawer only when nothing nearer (a popover, a sheet, a menu) is open.
  useEscape(!!escEnabled, onClose);
  useEffect(() => { body.current?.scrollTo?.({ top: 0 }); }, [home, key]);
  const isFresh = (it: NavItem) => it.keys.some((k) => fresh?.has(k));
  // The places to switch between: the whole home when it is short, else the open place's group.
  const tabs = !cur ? [] : items.length <= 6 ? items : groups.find((g) => g.items.includes(cur))?.items ?? items;
  const sec = key ? sectionDef(key) : undefined;
  const front0 = !cur && home !== 'desk';
  const needs = useMemo(() => (front0 ? needsFor(s, home, front.ui ?? {}) : []), [front0, s, home, front.ui]);
  return (
    <section className={`absolute inset-y-0 left-0 z-[1100] flex w-full ${cur?.wide || (home === 'desk' && !cur) ? 'md:w-[min(1080px,calc(100%-24px))]' : 'md:w-[min(680px,calc(100%-24px))]'} flex-col border-r border-gold-600/30 bg-noir-900 shadow-2xl shadow-black/70 llv-slide-left`} data-testid={`drawer-${home}`} aria-label={def.label}>
      <header className={`flex items-center gap-2 border-b px-3 py-2 ${cur && (domainOf(key) ?? domainOf(cur.id)) ? `${domClass(domainOf(key) ?? domainOf(cur.id))} llv-dom-strip` : 'border-noir-700'}`} data-domain={cur ? domainOf(key) ?? domainOf(cur.id) : undefined}>
        {cur ? (
          <button type="button" onClick={() => onOpen(undefined)} data-testid="drawer-back" aria-label={`Back to ${def.label}`}
            className="flex min-w-0 items-center gap-1.5 rounded px-1 text-gold-400 hover:text-gold-300">
            <span className="text-lg" aria-hidden>‹</span>
            <span className="text-lg" aria-hidden>{glyph(def.icon)}</span>
            <span className="hidden sm:inline font-display text-lg tracking-wide">{def.label}</span>
          </button>
        ) : (
          <span className="text-lg text-gold-400">{glyph(def.icon)}</span>
        )}
        <h2 className="min-w-0 truncate font-display text-xl tracking-wide text-gold-400">
          {cur ? <><span className="hidden sm:inline text-stone-600"> › </span>{cur.label}</> : def.label}
        </h2>
        <button type="button" className="ml-auto h-8 w-8 shrink-0 rounded border border-noir-600 text-stone-300 hover:border-gold-500 hover:text-gold-300" onClick={onClose} aria-label="Close" data-testid="drawer-close">×</button>
      </header>
      {cur && tabs.length > 1 && (
        <nav className="flex gap-0.5 overflow-x-auto border-b border-noir-700 px-2 tabbar" data-testid="subtabs" aria-label={`${def.label}: places`}>
          {tabs.map((x) => (
            <button key={x.id} type="button" data-tab={x.id} data-testid={`nav-tab-${x.id}`} onClick={() => onOpen(x.id)} aria-current={x === cur ? 'page' : undefined}
              className={`relative tab whitespace-nowrap text-xs px-2.5 py-2 ${x === cur ? 'tab-active' : ''}`}>
              <span className={`mr-1 ${domClass(domainOf(x.keys[0]) ?? domainOf(x.id))} llv-dom-ink`}>{glyph(x.icon)}</span>{x.label}
              {isFresh(x) && <span className="absolute right-0.5 top-1 h-1.5 w-1.5 rounded-full bg-gold-400" aria-label="new" />}
            </button>
          ))}
        </nav>
      )}
      {/* The open section sets its domain's colours for everything inside: section headers take them (index.css .llv-dom-scope). */}
      <div ref={body} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-6 sm:p-4 ${cur && (domainOf(key) ?? domainOf(cur.id)) ? `${domClass(domainOf(key) ?? domainOf(cur.id))} llv-dom-scope` : ''}`} data-testid={cur ? `section-${key}` : 'home-landing'}>
        {!cur ? (
          <>
            {/* The five bands (STREAMLINE_2 §3.3): Recommended, Needs you here, Your people, Do something, the places.
                The Desk speaks for itself (a calm home screen): no blurb, its papers are the Desk below, and "Do this now" only when there is something. */}
            {home !== 'desk' && <p className="llv-pagehead-sub mb-3">{def.blurb}</p>}
            <RecBand s={s} home={home} ui={front.ui} onPick={front.onPick} />
            {(home !== 'desk' || doNow.length > 0) && <DoNowStrip s={s} items={doNow} onDo={onDo} needs={needs} onNeed={front.onNeed} />}
            {top}
            <PeopleBand s={s} home={home} onEveryone={front.onEveryone} />
            <ActionsBand s={s} home={home} open={front.open} onPick={front.onPick} />
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.25em] text-stone-500" data-testid="front-records">Places</div>
            {groups.map((g, i) => (
              <section key={g.title ?? i} className="mb-4">
                {g.title && <div className="mb-1.5 text-[10px] uppercase tracking-[0.25em] text-stone-500">{g.title}</div>}
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {g.items.map((it) => <ItemCard key={it.id} it={it} fresh={isFresh(it)} onOpen={() => onOpen(it.id)} />)}
                </div>
              </section>
            ))}
          </>
        ) : (
          <>
            {cur.keys.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1" data-testid="views" role="tablist">
                {cur.keys.map((k, i) => (
                  <button key={k} type="button" role="tab" aria-selected={k === key} onClick={() => onOpen(k)} data-testid={`view-${k}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${k === key ? 'border-gold-500 bg-gold-500/15 text-gold-300' : 'border-noir-600 text-stone-400 hover:text-gold-300'}`}>
                    {domainOf(k) && <span className={`${domClass(domainOf(k))} llv-dom-dot`} aria-hidden />}
                    {cur.views?.[i] ?? sectionDef(k)?.label ?? k}
                  </button>
                ))}
              </div>
            )}
            <Blurb key={key} text={sec?.blurb && (cur.keys.length > 1 || sec.blurb.length > cur.sub.length) ? sec.blurb : cur.sub} />
            {key && sectionLock(s, key) ? (
              <div className="rounded border border-amber-600/50 bg-amber-900/10 p-3 text-sm text-amber-100" data-testid="rank-locked">
                🔒 {sectionLock(s, key)}. This is a boss's business, above your rank in the family for now. It opens as you climb: Crew › The Rise › Your place.
              </div>
            ) : <Guard label={cur.label} resetKey={`${home}:${key}`}>{extras[key!] ?? (sec ? sec.render(s, ctx) : null)}</Guard>}
          </>
        )}
      </div>
    </section>
  );
}
