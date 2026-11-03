import { useMemo, useState, type ReactNode } from 'react';
import {
  DAY_NAMES, JCATS, JCAT_INFO, bookAbout, bookEntries, bookSearch, placeLabel, placeRoute, weekLabel,
  type BookFilter, type JCat, type JEntry, type JWeek,
} from '../../engine/journal';
import type { GameState, PlayerAction } from '../../engine/types';
import { plansInMotion, type PlanRow } from '../plans/plans';
import { usePlanDo, usePlansApi } from '../plans/context';
import { useOrders } from '../components/Orders';
import { useSheet } from '../components/People';
import { useShell } from '../shell/context';
import { fmt$ } from '../format';
import { sameOrder } from '../verbs';

/**
 * THE BOOK (engine/journal.ts): the one place the boss keeps track of
 * everything. Open threads first (what is still in motion, with the latest
 * word on each), then the weeks, newest first, each entry clickable to its
 * person, its place, its screen. Filters: shelves, a person, a place, "my
 * orders", "money", the weeks, and words.
 */

let pending: BookFilter | undefined;

/** Open the Book (optionally already filtered: a person, a place, a thread). */
export function useOpenBook(): (f?: BookFilter) => void {
  const shell = useShell();
  return (f) => { pending = f; shell.go('book'); };
}

const nameOf = (s: GameState, id: string) => { const c = s.characters[id]; return c ? `${c.firstName} ${c.lastName}` : 'Someone'; };
const sg$ = (n: number) => `${n >= 0 ? '+' : '−'}${fmt$(Math.abs(n))}`;
const ST_LABEL: Record<string, string> = { respect: 'respect', local: 'local heat', family: 'family heat', federal: 'federal heat' };

function Deltas({ e }: { e: JEntry }) {
  const st = Object.entries(e.st ?? {}).filter(([, v]) => v);
  if (!e.m && !st.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5 text-[11px] tabular-nums">
      {!!e.m && <span className={e.m >= 0 ? 'text-emerald-300' : 'text-red-300'} data-testid="book-money">{sg$(e.m)}</span>}
      {st.map(([k, v]) => {
        const good = k === 'respect' ? v! > 0 : v! < 0;
        return <span key={k} className={good ? 'text-emerald-300/90' : 'text-amber-300/90'}>{v! > 0 ? '+' : ''}{v} {ST_LABEL[k]}</span>;
      })}
    </span>
  );
}

function EntryRow({ s, e, onThread, followers }: { s: GameState; e: JEntry; onThread?: (id: string) => void; followers?: number }) {
  const sheet = useSheet();
  const shell = useShell();
  const info = JCAT_INFO[e.c];
  const prior = e.re ? s.journal?.e.find((x) => x.id === e.re) : undefined;
  const openPlace = (k: string) => { const r = placeRoute(s, k); if (r.district) shell.focus({ district: r.district }); shell.go(r.route); };
  return (
    <li className={`rounded-md border px-2.5 py-1.5 ${e.mine ? 'border-gold-500/50 bg-gold-500/5' : 'border-noir-700 bg-noir-900/40'}`} data-testid="book-entry" data-cat={e.c}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="w-4 shrink-0 text-center text-gold-400/80" title={info.label} aria-hidden>{info.glyph}</span>
        <button type="button" className="min-w-0 flex-1 text-left text-[13px] font-semibold text-stone-100 hover:text-gold-300" onClick={() => shell.go(e.ln ?? info.route)} title={`Open: ${info.label}`}>{e.t}</button>
        <Deltas e={e} />
      </div>
      <div className="ml-6 mt-0.5 flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wider">
        {e.mine ? <span className="rounded bg-gold-500/20 px-1 text-gold-300">{e.src === 'decision' ? 'Your decision' : e.src === 'phone' ? 'On the phone' : 'Your order'}</span> : e.by ? <span className="rounded bg-noir-700 px-1 text-stone-300">By {e.by}</span> : null}
        {e.k === 'heard' && <span className="rounded bg-noir-700 px-1 text-sky-300" title="What people say; not seen with your own eyes">Heard</span>}
        {e.k === 'later' && <span className="rounded bg-noir-700 px-1 text-amber-300" title="Came out later">Came out later</span>}
        <span className="text-stone-600">{info.label}</span>
      </div>
      {e.r && e.r.length > 0 && (
        <ul className="ml-6 mt-1 space-y-0.5 border-l border-gold-500/30 pl-2 text-[12px] text-stone-200" data-testid="book-result">
          {e.r.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
      {e.x && <p className="ml-6 mt-0.5 text-[12px] text-stone-400">{e.x}</p>}
      {(e.p?.length || e.pl?.length || prior || followers) ? (
        <div className="ml-6 mt-1 flex flex-wrap gap-1">
          {(e.p ?? []).filter((id) => s.characters[id]).map((id) => (
            <button key={id} type="button" className="rounded-full border border-noir-600 px-2 py-0.5 text-[11px] text-stone-200 hover:border-gold-500" onClick={() => sheet.open(id)} data-testid="book-person">☺ {nameOf(s, id)}</button>
          ))}
          {(e.pl ?? []).map((k) => (
            <button key={k} type="button" className="rounded-full border border-noir-600 px-2 py-0.5 text-[11px] text-stone-300 hover:border-gold-500" onClick={() => openPlace(k)} data-testid="book-place">⌂ {placeLabel(s, k)}</button>
          ))}
          {prior && onThread && <button type="button" className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-200 hover:border-gold-500" onClick={() => onThread(prior.id)} data-testid="book-prior">↩ After: {prior.t.slice(0, 48)}{prior.t.length > 48 ? '…' : ''} (wk {prior.w})</button>}
          {!!followers && onThread && <button type="button" className="rounded-full border border-gold-500/40 px-2 py-0.5 text-[11px] text-gold-200 hover:border-gold-400" onClick={() => onThread(e.id)} data-testid="book-followers">What came of it later: {followers} ▸</button>}
        </div>
      ) : null}
    </li>
  );
}

/** Entries grouped by week (newest first), and inside a week by day. */
function Timeline({ s, entries, onThread, limitWeeks, onMore }: { s: GameState; entries: JEntry[]; onThread?: (id: string) => void; limitWeeks: number; onMore?: () => void }) {
  const followers = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of s.journal?.e ?? []) if (e.re) m.set(e.re, (m.get(e.re) ?? 0) + 1);
    return m;
  }, [s.journal]);
  const weeks = useMemo(() => {
    const m = new Map<number, JEntry[]>();
    for (const e of entries) { const a = m.get(e.w) ?? []; a.push(e); m.set(e.w, a); }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [entries]);
  if (!weeks.length) return <p className="text-sm text-stone-500" data-testid="book-empty">Nothing in Your File for that.</p>;
  return (
    <div className="space-y-3">
      {weeks.slice(0, limitWeeks).map(([w, es]) => {
        const days = new Map<string, JEntry[]>();
        for (const e of es) { const k = e.d !== undefined ? DAY_NAMES[e.d] : 'When the week turned'; const a = days.get(k) ?? []; a.push(e); days.set(k, a); }
        const net = es.filter((e) => e.mine).reduce((a, e) => a + (e.m ?? 0), 0);
        return (
          <section key={w} data-testid="book-week">
            <h4 className="sticky top-0 z-[1] flex items-baseline justify-between gap-2 border-b border-noir-700 bg-noir-950/95 py-1 text-[11px] uppercase tracking-[0.25em] text-gold-500/90">
              <span>{weekLabel(w)}</span>
              <span className="normal-case tracking-normal text-stone-500">{es.length} {es.length === 1 ? 'entry' : 'entries'}{net ? ` · your orders ${sg$(net)}` : ''}</span>
            </h4>
            {[...days.entries()].map(([d, de]) => (
              <div key={d} className="mt-1.5">
                {days.size > 1 && <div className="mb-1 text-[10px] uppercase tracking-widest text-stone-600">{d}</div>}
                <ul className="space-y-1">{de.map((e) => <EntryRow key={e.id} s={s} e={e} onThread={onThread} followers={followers.get(e.id)} />)}</ul>
              </div>
            ))}
          </section>
        );
      })}
      {weeks.length > limitWeeks && onMore && <button type="button" className="btn-ghost w-full text-xs" onClick={onMore} data-testid="book-more">Earlier weeks ({weeks.length - limitWeeks} more) ▾</button>}
    </div>
  );
}

function OldWeeks({ s, old }: { s: GameState; old: JWeek[] }) {
  const [open, setOpen] = useState(false);
  if (!old.length) return null;
  return (
    <section className="mt-3" data-testid="book-old">
      <button type="button" className="text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-gold-300" onClick={() => setOpen((x) => !x)} aria-expanded={open}>Older weeks, in short ({old.length}) {open ? '▴' : '▾'}</button>
      {open && (
        <ul className="mt-1 space-y-1">
          {[...old].reverse().slice(0, 80).map((o) => (
            <li key={o.w} className="rounded border border-noir-800 px-2 py-1 text-[12px]">
              <div className="flex justify-between gap-2 text-stone-400"><span>{weekLabel(o.w)}</span><span className="tabular-nums">{o.n} entries{o.m ? ` · ${sg$(o.m)}` : ''}</span></div>
              <div className="text-stone-300">{o.top.join(' · ')}</div>
              {o.p.length > 0 && <div className="text-[11px] text-stone-500">{o.p.slice(0, 6).map((id) => nameOf(s, id)).join(', ')}{o.p.length > 6 ? '…' : ''}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Things still in motion, each with the latest word on it from the Book. */
function OpenThreads({ s }: { s: GameState }) {
  const { orders } = useOrders();
  const api = usePlansApi();
  const doIt = usePlanDo(s);
  const sheet = useSheet();
  // The boss's answers this week (they reach the state when the week turns): an answered thread is not "Answer" any more.
  const rows: PlanRow[] = useMemo(() => {
    try { return plansInMotion(s, { orders, answers: api.answers, briefSkip: api.briefSkip }).flatMap((g) => g.rows); } catch { return []; }
  }, [s, orders, api.answers, api.briefSkip]);
  const all = useMemo(() => bookEntries(s), [s]);
  const [all3, setAll3] = useState(false);
  if (!rows.length) return null;
  const shown = all3 ? rows : rows.slice(0, 5);
  const latest = (id?: string) => { if (!id) return undefined; for (let i = all.length - 1; i >= 0; i--) if (all[i].p?.includes(id)) return all[i]; return undefined; };
  return (
    <section className="rounded-md border border-gold-500/40 bg-noir-900/70 p-2.5" data-testid="book-threads">
      <h4 className="text-[11px] uppercase tracking-[0.25em] text-gold-400">Open threads <span className="normal-case tracking-normal text-stone-500">· still in motion</span></h4>
      <ul className="mt-1.5 space-y-1">
        {shown.map((r) => {
          const last = latest(r.whoId);
          const act = r.acts.find((a) => a.id === 'open' || a.id === 'go') ?? r.acts[0];
          return (
            <li key={r.key} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-[12px]" data-testid="book-thread">
              <span className="w-4 text-center text-gold-400/80" aria-hidden>{r.glyph}</span>
              <div className="min-w-0 flex-1">
                <div className="text-stone-100">{r.what}{r.who && <> · <button type="button" className="text-gold-300 hover:underline" onClick={() => r.whoId && sheet.open(r.whoId)}>{r.who}</button></>} <span className="text-stone-500">· {r.when}</span></div>
                <div className="text-[11px] text-stone-400">{r.status}</div>
                {last && <div className="text-[11px] text-stone-500">Last in your File (wk {last.w}): {last.t}</div>}
              </div>
              {act && <button type="button" className="btn-ghost shrink-0 px-2 py-0.5 text-[11px]" onClick={() => doIt(act.do)} disabled={!!act.disabled}>{act.label}</button>}
            </li>
          );
        })}
      </ul>
      {rows.length > 5 && <button type="button" className="mt-1 text-[11px] text-gold-300 hover:underline" onClick={() => setAll3((x) => !x)} data-testid="book-threads-more">{all3 ? 'Fewer ▴' : `All ${rows.length} threads ▾`}</button>}
    </section>
  );
}

function Chip({ on, onClick, children, testid }: { on: boolean; onClick: () => void; children: ReactNode; testid?: string }) {
  return <button type="button" aria-pressed={on} onClick={onClick} data-testid={testid} className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? 'border-gold-400 bg-gold-500/20 text-gold-200' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>{children}</button>;
}

/** The Book, the whole of it (a section of This Week). */
export function TheBook({ s }: { s: GameState }) {
  const [f, setF] = useState<BookFilter>(() => { const p = pending ?? {}; pending = undefined; return p; });
  const [weeks, setWeeks] = useState(6);
  const all = useMemo(() => bookEntries(s), [s]);
  const entries = useMemo(() => bookSearch(s, f), [s, f]);
  const counts = useMemo(() => {
    const p = new Map<string, number>();
    const pl = new Map<string, number>();
    const c = new Map<JCat, number>();
    for (const e of all) {
      c.set(e.c, (c.get(e.c) ?? 0) + 1);
      for (const id of e.p ?? []) if (s.characters[id]) p.set(id, (p.get(id) ?? 0) + 1);
      for (const k of e.pl ?? []) pl.set(k, (pl.get(k) ?? 0) + 1);
    }
    return { p: [...p.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80), pl: [...pl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60), c };
  }, [all, s.characters]);
  const wks = useMemo(() => [...new Set(all.map((e) => e.w))].sort((a, b) => a - b), [all]);
  const set = (p: Partial<BookFilter>) => { setF((x) => ({ ...x, ...p })); setWeeks(6); };
  const toggleCat = (c: JCat) => set({ cats: f.cats?.includes(c) ? f.cats.filter((x) => x !== c) : [...(f.cats ?? []), c] });
  const any = !!(f.cats?.length || f.person || f.place || f.mine || f.money || f.from !== undefined || f.to !== undefined || f.q || f.thread);
  const old = (s.journal?.old ?? []).filter((o) => (!f.person || o.p.includes(f.person)) && (!f.place || o.pl?.includes(f.place)));
  const thread = f.thread ? all.find((e) => e.id === f.thread) : undefined;
  return (
    <div className="space-y-3" data-testid="the-book">
      <OpenThreads s={s} />
      <div className="space-y-1.5 rounded-md border border-noir-700 bg-noir-900/50 p-2" data-testid="book-filters">
        <input value={f.q ?? ''} onChange={(e) => set({ q: e.target.value || undefined })} placeholder="Search your File: a name, a place, a word…" className="w-full rounded border border-noir-600 bg-noir-800 px-2 py-1 text-sm text-stone-100" data-testid="book-search" aria-label="Search your File" />
        <div className="flex flex-wrap gap-1">
          <Chip on={!!f.mine} onClick={() => set({ mine: !f.mine || undefined })} testid="book-mine">☰ My orders only</Chip>
          <Chip on={!!f.money} onClick={() => set({ money: !f.money || undefined })} testid="book-moneyonly">$ Money only</Chip>
          {JCATS.filter((c) => counts.c.get(c)).map((c) => <Chip key={c} on={!!f.cats?.includes(c)} onClick={() => toggleCat(c)} testid={`book-cat-${c}`}>{JCAT_INFO[c].glyph} {JCAT_INFO[c].label} <span className="text-stone-500">{counts.c.get(c)}</span></Chip>)}
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <select value={f.person ?? ''} onChange={(e) => set({ person: e.target.value || undefined })} className="min-w-0 rounded border border-noir-600 bg-noir-800 px-1.5 py-1 text-xs text-stone-200" data-testid="book-person-filter" aria-label="A person">
            <option value="">Anyone</option>
            {counts.p.map(([id, n]) => <option key={id} value={id}>{nameOf(s, id)} ({n})</option>)}
          </select>
          <select value={f.place ?? ''} onChange={(e) => set({ place: e.target.value || undefined })} className="min-w-0 rounded border border-noir-600 bg-noir-800 px-1.5 py-1 text-xs text-stone-200" data-testid="book-place-filter" aria-label="A place">
            <option value="">Anywhere</option>
            {counts.pl.map(([k, n]) => <option key={k} value={k}>{placeLabel(s, k)} ({n})</option>)}
          </select>
          <select value={f.from ?? ''} onChange={(e) => set({ from: e.target.value ? +e.target.value : undefined })} className="min-w-0 rounded border border-noir-600 bg-noir-800 px-1.5 py-1 text-xs text-stone-200" aria-label="From week">
            <option value="">From the start</option>
            {wks.map((w) => <option key={w} value={w}>From wk {w}</option>)}
          </select>
          <select value={f.to ?? ''} onChange={(e) => set({ to: e.target.value ? +e.target.value : undefined })} className="min-w-0 rounded border border-noir-600 bg-noir-800 px-1.5 py-1 text-xs text-stone-200" aria-label="To week">
            <option value="">To now</option>
            {wks.map((w) => <option key={w} value={w}>To wk {w}</option>)}
          </select>
        </div>
        {(any || thread) && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
            {thread && <span className="text-amber-200">The thread from “{thread.t}” (wk {thread.w})</span>}
            <span>{entries.length} of {all.length}</span>
            <button type="button" className="text-gold-300 hover:underline" onClick={() => set({ cats: undefined, person: undefined, place: undefined, mine: undefined, money: undefined, from: undefined, to: undefined, q: undefined, thread: undefined })} data-testid="book-clear">Clear filters</button>
          </div>
        )}
      </div>
      {f.person && <AboutHeader s={s} person={f.person} />}
      <Timeline s={s} entries={entries} onThread={(id) => set({ thread: id, cats: undefined, person: undefined, place: undefined, mine: undefined, money: undefined, q: undefined })} limitWeeks={weeks} onMore={() => setWeeks((n) => n + 6)} />
      {!f.thread && <OldWeeks s={s} old={old} />}
      {!s.journal && <p className="text-[11px] text-stone-600">Your File was started with this save: earlier weeks come from the chronicle, the rest is written as the weeks turn.</p>}
    </div>
  );
}

function AboutHeader({ s, person, place }: { s: GameState; person?: string; place?: string }) {
  const a = bookAbout(s, { person, place });
  const who = person ? s.characters[person] : undefined;
  const her = who ? (who.gender === 'F' ? 'her' : 'him') : 'it';
  return (
    <div className="rounded border border-noir-700 bg-noir-900/60 px-2.5 py-1.5 text-[12px] text-stone-300" data-testid="book-about-head">
      <span className="font-semibold text-gold-300">{person ? `Between you and ${her}` : `At ${placeLabel(s, place!)}`}</span>
      {' · '}{a.entries.length} {a.entries.length === 1 ? 'entry' : 'entries'}{a.orders ? `, ${a.orders} of them yours` : ''}
      {a.money ? <> · your orders <span className={a.money >= 0 ? 'text-emerald-300' : 'text-red-300'}>{sg$(a.money)}</span></> : null}
      {a.first !== undefined && <> · since wk {a.first}{a.last !== undefined && a.last !== a.first ? `, last wk ${a.last}` : ''}</>}
    </div>
  );
}

/**
 * "Between you and her": every interaction, offer, date and outcome with one
 * person (or everything that happened at one place). On the character sheet,
 * the calling card and the place cards.
 */
export function BookAbout({ s, person, place, compact }: { s: GameState; person?: string; place?: string; compact?: boolean }) {
  const open = useOpenBook();
  const [thread, setThread] = useState<string | undefined>();
  const a = useMemo(() => bookAbout(s, { person, place }), [s, person, place]);
  if (!person && !place) return null;
  if (compact && !a.entries.length && !a.old.length) return null;
  const list = thread ? bookSearch(s, { thread }) : compact ? a.entries.slice(-4) : a.entries;
  return (
    <section className="space-y-2" data-testid="book-about">
      <AboutHeader s={s} person={person} place={place} />
      {thread && <button type="button" className="text-[11px] text-gold-300 hover:underline" onClick={() => setThread(undefined)}>◂ Back to everything</button>}
      {a.entries.length ? <Timeline s={s} entries={list} onThread={setThread} limitWeeks={compact ? 3 : 52} /> : <p className="text-[12px] text-stone-500">Nothing in Your File yet.</p>}
      {!compact && <OldWeeks s={s} old={a.old} />}
      <button type="button" className="text-[11px] text-gold-300 hover:underline" onClick={() => open({ person, place })} data-testid="book-about-open">All of it in Your File →</button>
    </section>
  );
}

/** One line under an order you just gave: where it went. */
export function BookNote() {
  const open = useOpenBook();
  return (
    <div className="mt-1 text-[11px] text-stone-400" data-testid="book-note">
      ✓ Logged in <button type="button" className="text-gold-300 hover:underline" onClick={() => open()}>Your File →</button> <span className="text-stone-500">(Open threads now; what comes of it is written in when the week turns)</span>
    </div>
  );
}

/**
 * The card at the end of an interactive flow (the bold offer, an evening):
 * what you did, what she said, and that it is all in the Book, with a link.
 */
export function LoggedCard({ s, action, title, lines, person }: { s: GameState; action: PlayerAction; title: string; lines: string[]; person?: string }) {
  const { orders } = useOrders();
  const open = useOpenBook();
  if (!orders.some((o) => sameOrder(o, action))) return null;
  return (
    <section className="rounded-md border border-gold-400/60 bg-gold-500/10 p-2.5" data-testid="logged-card">
      <div className="text-[10px] uppercase tracking-[0.3em] text-gold-400">Done · in Your File</div>
      <div className="mt-0.5 text-[13px] font-semibold text-stone-100">{title}</div>
      <ul className="mt-1 space-y-0.5 text-[12px] text-stone-300">{lines.filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p className="mt-1 text-[11px] text-stone-400">The money, who saw it, the talk and anything that comes of it later are written in when the week turns{person ? `, under ${nameOf(s, person)}` : ''}.</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" className="btn-gold px-2 py-1 text-xs" onClick={() => open(person ? { person } : undefined)} data-testid="logged-open">See it in Your File →</button>
      </div>
    </section>
  );
}
