import { useMemo, useState } from 'react';
import { dateOfWeek, formatDate } from '../../engine/calendar';
import type { Seen } from '../../engine/livingKnow';
import type { StoryView } from '../../engine/livingStory';
import { districtView, peopleRows, personView, type KnownFact } from '../../engine/livingView';
import type { GameState } from '../../engine/types';
import { getSettings } from '../settings';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';
import { EmptyState } from '../components/EmptyState';
import { Stat } from '../econ/Holdings';

/**
 * The Town › What's happening: the Boardwalk's people living their own lives,
 * as far as the boss knows. Ongoing stories (cause to consequence, with the
 * gaps he does not know), the talk of the street labeled by how sure it is
 * and who said it, and the people themselves. Nothing here reads the truth
 * directly: everything comes through engine/livingView.ts.
 */

type Tab = 'stories' | 'talk' | 'people';

const when = (w: number) => formatDate(dateOfWeek(Math.max(1, w)));

/** A short list first; everything else one tap away (nothing is hidden for good). */
function More<T>({ items, first, render, label }: { items: T[]; first: number; render: (x: T, i: number) => JSX.Element; label: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, first);
  return (
    <>
      {shown.map(render)}
      {items.length > first && (
        <li className="list-none">
          <button type="button" className="text-[11px] text-gold-400 underline decoration-dotted underline-offset-2" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="living-more">
            {open ? 'Show less' : `More… (${items.length - first} more ${label})`}
          </button>
        </li>
      )}
    </>
  );
}

export function SeenChip({ seen }: { seen: Seen }) {
  const cls = seen.lvl === 'public' ? 'border-stone-600 text-stone-400' : seen.lvl === 'confirmed' ? 'border-emerald-700 text-emerald-300' : 'border-amber-700 text-amber-300';
  const word = seen.lvl === 'public' ? 'Public' : seen.lvl === 'confirmed' ? 'Confirmed' : 'Rumor';
  return (
    <span className={`inline-block rounded border px-1 text-[10px] uppercase tracking-wide ${cls}`} title={`${word}: ${seen.via}`}>
      {word}{seen.lvl !== 'public' && <span className="normal-case tracking-normal text-stone-500"> · {seen.via}</span>}
    </span>
  );
}

function FactRow({ s, f, onPerson }: { s: GameState; f: KnownFact; onPerson: (id: string) => void }) {
  const L = s.living!;
  return (
    <li className="py-1.5 border-b border-noir-800 last:border-0" data-testid="living-fact">
      <div className="text-[11px] text-stone-500 tabular-nums">{when(f.w)}</div>
      <div className="text-sm text-stone-200">{f.seen.lvl === 'rumor' ? <span className="italic">“{f.text}”</span> : f.text}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <SeenChip seen={f.seen} />
        {f.who.filter((id) => L.people[id]).slice(0, 3).map((id) => (
          <button key={id} type="button" className="text-[11px] text-gold-400 underline decoration-dotted underline-offset-2" onClick={() => onPerson(id)} data-testid="living-person-link">{L.people[id].f} {L.people[id].l}</button>
        ))}
      </div>
    </li>
  );
}

function StoryCard({ s, v, onPerson }: { s: GameState; v: StoryView; onPerson: (id: string) => void }) {
  const L = s.living!;
  const ans: Record<string, string> = { pay: 'you paid it off', take: 'you took the debt over', lean: 'you had him get more time', decline: 'you stayed out of it', lend: 'you lent the money', find: 'you had the thief found', make_good: 'you made it good', give: 'you helped', job: 'you gave a job', capo: 'nobody answered; the capo handled it', moot: 'it sorted itself out before you answered' };
  return (
    <article className={`rounded-md border px-3 py-2 ${v.open ? 'border-noir-600 bg-noir-800/70' : 'border-noir-800 bg-noir-900/50'}`} data-testid="living-story">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-100">{v.title}</h3>
        <span className={`text-[10px] uppercase tracking-widest ${v.open ? 'text-gold-400' : 'text-stone-500'}`}>{v.open ? 'Going on' : 'Over'}</span>
      </header>
      <ol className="mt-1 space-y-1">
        <More items={v.beats} first={3} label={v.beats.length - 3 === 1 ? 'step' : 'steps'} render={(b, i) => (
          <li key={b.id} className="text-[13px] text-stone-300 flex gap-2">
            <span className="text-stone-600 tabular-nums shrink-0">{i === 0 ? '•' : '→'}</span>
            <span className="min-w-0">
              {b.seen.lvl === 'rumor' ? <span className="italic">“{b.text}”</span> : b.text}{' '}
              <span className="text-[11px] text-stone-500 whitespace-nowrap">{when(b.w)}</span> <SeenChip seen={b.seen} />
            </span>
          </li>
        )} />
      </ol>
      {v.gaps > 0 && <div className="mt-1 text-[11px] text-stone-500">…and {v.gaps === 1 ? 'one thing' : `${v.gaps} things`} in this you have not heard about.</div>}
      {v.asked && <div className="mt-1 text-[11px] text-stone-400">Brought to you by {s.characters[v.asked.via] ? <CharLink s={s} id={v.asked.via} /> : 'your capo'} ({when(v.asked.w)}){v.asked.ans ? `: ${ans[v.asked.ans] ?? v.asked.ans}.` : ': waiting on your answer.'}</div>}
      {v.end && <div className="mt-1 text-[12px] text-stone-400">How it came out: {v.end}</div>}
      <div className="mt-1 flex flex-wrap gap-2">
        {v.cast.filter((id) => L.people[id]).slice(0, 4).map((id) => (
          <button key={id} type="button" className="text-[11px] text-gold-400 underline decoration-dotted underline-offset-2" onClick={() => onPerson(id)}>{L.people[id].f} {L.people[id].l}</button>
        ))}
      </div>
    </article>
  );
}

function PersonCard({ s, id, onClose, onPerson }: { s: GameState; id: string; onClose: () => void; onPerson: (id: string) => void }) {
  const dev = !!getSettings().devIds;
  const v = personView(s, id, dev);
  const L = s.living!;
  if (!v) return null;
  const p = L.people[id];
  const hh = p ? L.hh[p.hh] : undefined;
  const he = v.g === 'F' ? 'she' : 'he';
  const his = v.g === 'F' ? 'her' : 'his';
  const gift = Math.max(50, Math.round(((hh?.members.length ?? 2) * 10 + 15) * 4 / 10) * 10);
  return (
    <section className="rounded-md border border-gold-500/40 bg-noir-800 px-3 py-2 space-y-2" data-testid="living-person">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-stone-100">{v.name} <span className="text-stone-500 text-sm font-normal">{v.age}</span></h3>
          <div className="text-xs text-stone-400">{v.role}{v.home ? ` · lives in ${v.home}` : ''}</div>
          {v.toBoss && <div className="text-xs text-stone-400">Toward you: {v.toBoss}</div>}
        </div>
        <button type="button" className="text-xs text-stone-400 border border-noir-600 rounded px-2 py-1" onClick={onClose} aria-label="Close this person">Close</button>
      </header>
      {v.household.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Household</div>
          <ul className="text-xs text-stone-300">
            {v.household.map((h) => <li key={h.id}><button type="button" className="underline decoration-dotted underline-offset-2 hover:text-gold-300" onClick={() => onPerson(h.id)}>{h.name}</button> · {h.word}, {h.age} · {h.role}</li>)}
          </ul>
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">What {he} wants, as far as you know</div>
        <div className="text-xs text-stone-300">
          {v.goal ? <>Wants {v.goal}.</> : <span className="text-stone-500">{he === 'she' ? 'She keeps that to herself.' : 'He keeps that to himself.'}</span>}
          {v.plan && <div className="mt-0.5">{v.plan.seen.lvl === 'rumor' ? <span className="italic">“{v.plan.text}”</span> : v.plan.text} <SeenChip seen={v.plan.seen} /></div>}
        </div>
      </div>
      {v.ties.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">People in {his} life (that you know of)</div>
          <ul className="text-xs text-stone-300">
            <More items={v.ties} first={6} label="people" render={(t, i) => (
              <li key={`${t.id}:${i}`}>{t.what} {L.people[t.id] ? <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-gold-300" onClick={() => onPerson(t.id)}>{t.name}</button> : s.characters[t.id] ? <CharLink s={s} id={t.id} /> : t.name}{t.how !== 'public' && <span className="text-stone-500"> ({t.how === 'rumor' ? 'talk' : 'confirmed'})</span>}</li>
            )} />
          </ul>
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">What you have heard</div>
        {v.facts.length ? <ul><More items={v.facts} first={4} label="things" render={(f) => <li key={f.id} className="text-xs text-stone-300 py-0.5">{f.seen.lvl === 'rumor' ? <span className="italic">“{f.text}”</span> : f.text} <SeenChip seen={f.seen} /></li>} /></ul> : <div className="text-xs text-stone-500">Nothing beyond the public record.</div>}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">What you can do</div>
        <div className="text-[11px] text-stone-500 mb-1">Asking around is free (it takes your capo's time, one person a week). Help is a gift of Family money. A button you cannot use says why.</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionCard s={s} action={{ kind: 'living', op: { op: 'ask', pid: id } }} />
          {hh && hh.gone === undefined && <ActionCard s={s} action={{ kind: 'living', op: { op: 'give', hh: hh.id, amt: gift } }} />}
        </div>
      </div>
      {v.dev && (
        <div className="rounded border border-dashed border-stone-600 px-2 py-1 text-[11px] text-stone-400" data-testid="living-dev">
          Developer inspector ({id}): household cash ${v.dev.cash}, own money ${v.dev.stash}, goal {v.dev.goal ?? '—'}, plan {v.dev.plan ?? '—'}, traits {v.dev.traits.join('/')}
          <div>Remembers: {v.dev.mem.join(' | ') || '—'}</div>
        </div>
      )}
    </section>
  );
}

export function Happening({ s }: { s: GameState }) {
  const [tab, setTab] = useState<Tab>('stories');
  const [person, setPerson] = useState<string | undefined>();
  const [filter, setFilter] = useState<'all' | 'rumor' | 'confirmed' | 'public'>('all');
  const [q, setQ] = useState('');
  const v = useMemo(() => districtView(s), [s]);
  const people = useMemo(() => (tab === 'people' ? peopleRows(s) : []), [s, tab]);
  if (!v) {
    return <EmptyState kind="pending" title="The Boardwalk's people start living their own lives when the first week is played.">Owners, the people who work for them, their families: what they do, who they owe, who they marry. You hear about it the way a boss does.</EmptyState>;
  }
  const t = v.totals;
  const facts = v.facts.filter((f) => filter === 'all' || f.seen.lvl === filter);
  const open = (id: string) => { setPerson(id); };
  const shown = people.filter((r) => !q || `${r.name} ${r.role} ${r.hh}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4" data-testid="happening">
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label={`${v.name}: people`} value={`${t.people}`} sub={`${t.households} households · ${t.children} children`} />
        <Stat label="Businesses" value={`${t.businesses}`} sub={`${t.forSale} for sale · ${t.vacantLots} empty lots`} />
        <Stat label="Jobs" value={`${t.jobs}`} sub={`${t.employed} held by locals · ${t.seasonalHands} summer help`} />
        <Stat label="Out of work" value={`${t.unemployed}`} sub={`${t.workingOut} work off the island`} warn={t.unemployed > t.adults * 0.12} />
        <Stat label="Brought to you" value={`${v.asked}`} sub="requests this year" />
      </section>
      <p className="text-xs text-stone-500">The Boardwalk's people live without you: they work, borrow, marry, fall out, and get in trouble. You learn what the street, your capo and your Ears tell you. <span className="text-stone-400">Rumor</span> is talk, maybe wrong; <span className="text-stone-400">Confirmed</span> came from someone who knows.</p>
      {person && <PersonCard s={s} id={person} onClose={() => setPerson(undefined)} onPerson={open} />}
      <div className="flex gap-1" role="tablist" aria-label="What's happening views">
        {([['stories', 'Ongoing stories'], ['talk', 'The talk'], ['people', 'People']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`text-xs px-3 py-1.5 rounded border ${tab === id ? 'border-gold-400 text-gold-300 bg-gold-500/10' : 'border-noir-700 text-stone-400'}`} onClick={() => setTab(id)} data-testid={`happening-tab-${id}`}>{label}</button>
        ))}
      </div>
      {tab === 'stories' && (
        v.stories.length
          ? <div className="grid gap-2 lg:grid-cols-2">{v.stories.map((x) => <StoryCard key={x.id} s={s} v={x} onPerson={open} />)}</div>
          : <EmptyState kind="none" title="No stories you know of yet.">When the street's troubles reach you (through your capo, the Ears, or the papers), they show here, cause to consequence.</EmptyState>
      )}
      {tab === 'talk' && (
        <section>
          <div className="flex flex-wrap gap-1 mb-1">
            {(['all', 'rumor', 'confirmed', 'public'] as const).map((k) => (
              <button key={k} type="button" className={`text-[11px] px-2 py-0.5 rounded border ${filter === k ? 'border-gold-400 text-gold-300' : 'border-noir-700 text-stone-500'}`} onClick={() => setFilter(k)}>{k === 'all' ? 'Everything' : k === 'rumor' ? 'Rumors' : k === 'confirmed' ? 'Confirmed' : 'Public'}</button>
            ))}
          </div>
          {facts.length ? <ul><More items={facts} first={20} label="things you heard" render={(f) => <FactRow key={f.id} s={s} f={f} onPerson={open} />} /></ul> : <EmptyState kind="none" title="Nothing yet." />}
        </section>
      )}
      {tab === 'people' && (
        <section>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone…" aria-label="Find someone on the Boardwalk" className="w-full sm:w-72 mb-2 rounded border border-noir-700 bg-noir-900 px-2 py-1 text-sm text-stone-200" />
          <ul className="divide-y divide-noir-800">
            <More items={shown} first={25} label="people" render={(r) => (
              <li key={r.id} className="py-1.5">
                <button type="button" className="text-left w-full" onClick={() => open(r.id)} data-testid="living-person-row">
                  <span className="text-sm text-stone-200">{r.name}</span> <span className="text-xs text-stone-500">{r.age}</span>
                  <span className="block text-xs text-stone-400">{r.role}{r.known ? ` · you've heard ${r.known} thing${r.known === 1 ? '' : 's'}` : ''}{r.dealt ? ' · has dealt with you' : ''}</span>
                </button>
              </li>
            )} />
          </ul>
        </section>
      )}
    </div>
  );
}
