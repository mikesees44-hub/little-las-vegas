import { useMemo, useState } from 'react';
import { BOOK_LABEL, BOOK_SECTIONS, littleBlackBook, bookRows, type BadgeTone, type BookRow, type BookSection, type BookSort } from '../../engine/blackBook';
import { canDateTalk, dateStepFor } from '../../engine/dateTalk';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink, Face, useSheet } from '../components/People';
import { StandingButton } from '../appts/Standing';
import { useShell } from '../shell/context';
import { DateTalkButton } from './DateTalk';

/**
 * THE LITTLE BLACK BOOK (engine/blackBook.ts): every woman in the boss's life
 * on one page. A section rail (each with its count), search by name, three
 * sorts; each row her face, age, role, one line, three meters, the badges,
 * the last time he saw her, and her best next step as the normal order card
 * (with her odds), the date talk, a standing date, an ear's meet, her sheet.
 * Mature content Off: no One night, no Releases, no adult badges.
 */

const TONE: Record<BadgeTone, string> = {
  rose: 'border-rose-500/60 text-rose-200', gold: 'border-gold-500/70 text-gold-300', amber: 'border-amber-500/60 text-amber-200',
  red: 'border-red-500/60 text-red-200', stone: 'border-noir-500 text-stone-300', emerald: 'border-emerald-600/60 text-emerald-200', sky: 'border-sky-600/60 text-sky-200',
};

const SORT_LABEL: Record<BookSort, string> = { recent: 'Most recent', into: 'Most into you', useful: 'Most useful' };
const PAGE = 15;

function Meter({ label, v, lo = 0, color, testid }: { label: string; v: number; lo?: number; color: string; testid: string }) {
  const pct = Math.max(0, Math.min(100, lo < 0 ? (v + 100) / 2 : v));
  return (
    <span className="flex items-center gap-1 text-[10px] text-stone-400" title={`${label}: ${v}`} data-testid={testid} data-v={v}>
      <span className="w-14 shrink-0">{label}</span>
      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded bg-noir-700"><span className={`block h-full ${color}`} style={{ width: `${pct}%` }} /></span>
      <span className="tabular-nums w-7 text-right">{v}</span>
    </span>
  );
}

function BookTalk({ s, r }: { s: GameState; r: BookRow }) {
  const st = dateStepFor(s, r.id, r.actions);
  if (st) return <DateTalkButton s={s} id={r.id} step={st.step} date={st.date} label="Talk on the date" />;
  if (!r.sections.includes('dating') && !r.sections.includes('interested') && !r.sections.includes('want')) return null;
  if (canDateTalk(s, r.id, 'after').ok) return <DateTalkButton s={s} id={r.id} step="after" label="Talk on the date" />;
  return null;
}

function BookRowCard({ s, r, section }: { s: GameState; r: BookRow; section: BookSection | 'all' }) {
  const [more, setMore] = useState(false);
  const { open } = useSheet();
  const c = s.characters[r.id];
  if (!c) return null;
  const [first, ...rest] = r.actions;
  const line = section !== 'all' ? r.lines[section] ?? r.status : r.status;
  return (
    <li className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="lbb-row" data-id={r.id} data-sections={r.sections.join(' ')}>
      <div className="flex gap-2.5">
        <Face s={s} c={c} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-stone-100"><CharLink s={s} id={r.id} /></span>
            <span className="text-[11px] text-stone-500">{r.age}</span>
            {r.badges.map((b) => (
              <span key={b.k} className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${TONE[b.tone]}`} data-testid="lbb-badge" data-k={b.k}>{b.text}</span>
            ))}
          </div>
          <div className="text-[11px] text-stone-400">{r.role}</div>
          <div className="text-[12px] text-stone-200" data-testid="lbb-status">{line}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <Meter label="Thinks of you" v={r.opinion} lo={-100} color="bg-gold-400" testid="lbb-opinion" />
            <Meter label="Attraction" v={r.attraction} color="bg-rose-400" testid="lbb-attraction" />
            <Meter label="Trust" v={r.trust} color="bg-emerald-400" testid="lbb-trust" />
          </div>
          <div className="mt-0.5 text-[10px] text-stone-500">
            Last seen: <span data-testid="lbb-last">{r.lastText}</span>
            {section === 'all' && <> · {r.sections.map((k) => BOOK_LABEL[k]).join(', ')}</>}
          </div>
        </div>
      </div>
      {first && <div className="mt-2" data-testid="lbb-best"><ActionCard s={s} action={first} compact /></div>}
      <BookTalk s={s} r={r} />
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {(r.sections.includes('dating') || r.sections.includes('interested') || r.sections.includes('releases') || r.ear) && (
          <StandingButton who={r.id} label={r.ear && !r.sections.includes('dating') ? 'Make it a standing meet…' : 'Make it a standing date…'} className="text-[11px] text-gold-400 hover:text-gold-300" testid="lbb-standing" />
        )}
        <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" onClick={() => open(r.id)} data-testid="lbb-sheet">Open her sheet ▸</button>
        {rest.length > 0 && <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" onClick={() => setMore((x) => !x)} aria-expanded={more} data-testid="lbb-more">{more ? 'Less' : `More… (${rest.length})`}</button>}
      </div>
      {more && <div className="mt-1 space-y-1.5">{rest.map((a, i) => <ActionCard key={i} s={s} action={a} compact />)}</div>}
    </li>
  );
}

/** The screen (also a tab of Relationships & Dating). */
export function BlackBookPanel({ s, initialSection }: { s: GameState; initialSection?: BookSection | 'all' }) {
  const book = useMemo(() => littleBlackBook(s), [s]);
  const shell = useShell();
  const [section, setSection] = useState<BookSection | 'all'>(initialSection && (initialSection === 'all' || book.sections.includes(initialSection)) ? initialSection : 'all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<BookSort>('recent');
  const [n, setN] = useState(PAGE);
  const sec = section !== 'all' && !book.sections.includes(section) ? 'all' : section;
  const rows = bookRows(book, { section: sec, q, sort });
  const info = sec !== 'all' ? BOOK_SECTIONS.find((x) => x.id === sec) : undefined;
  return (
    <div className="space-y-2.5" data-testid="little-black-book">
      <div className="rounded-md border border-rose-800/50 bg-noir-900/70 p-2.5">
        <div className="text-[10px] uppercase tracking-[0.25em] text-rose-300">The little black book</div>
        <p className="text-[11px] text-stone-400">Every woman in your life, adults all. A woman can be in more than one section. Every step is the ordinary order with her odds: she decides.{!book.adult && ' Mature content is Off: One night and Releases are not shown.'}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGE); }} placeholder="Search by name" aria-label="Search the black book"
            className="min-w-0 flex-1 rounded border border-noir-600 bg-noir-950 px-2 py-1 text-xs text-stone-200" data-testid="lbb-search" />
          <select value={sort} onChange={(e) => setSort(e.target.value as BookSort)} aria-label="Sort" className="rounded border border-noir-600 bg-noir-950 px-1.5 py-1 text-xs text-stone-200" data-testid="lbb-sort">
            {(Object.keys(SORT_LABEL) as BookSort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </div>
      </div>
      <nav className="flex flex-wrap gap-1" role="tablist" aria-label="Black book sections" data-testid="lbb-rail">
        {(['all', ...book.sections] as (BookSection | 'all')[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={sec === k} onClick={() => { setSection(k); setN(PAGE); }} data-testid={`lbb-sec-${k}`}
            className={`rounded px-2 py-1 text-[11px] font-semibold ${sec === k ? 'bg-rose-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-rose-400'}`}>
            {k === 'all' ? 'Everyone' : BOOK_LABEL[k]} <span className="tabular-nums opacity-75" data-testid={`lbb-count-${k}`}>{k === 'all' ? book.rows.length : book.counts[k]}</span>
          </button>
        ))}
      </nav>
      {info && <p className="text-[11px] text-stone-500">{info.blurb}</p>}
      {rows.length === 0 ? (
        <p className="text-xs text-stone-500" data-testid="lbb-empty">
          {book.rows.length === 0 ? <>Nobody yet. Meet someone: <button type="button" className="text-gold-400 underline" onClick={() => shell.go('you.dating')}>Relationships & Dating</button>, the boardwalk, the clubs.</> : 'Nobody here.'}
        </p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">{rows.slice(0, n).map((r) => <BookRowCard key={r.id} s={s} r={r} section={sec} />)}</ul>
      )}
      {rows.length > n && <button type="button" className="btn-ghost px-2 py-1 text-[11px]" onClick={() => setN((x) => x + PAGE)} data-testid="lbb-show-more">Show {Math.min(PAGE, rows.length - n)} more of {rows.length - n}</button>}
    </div>
  );
}
