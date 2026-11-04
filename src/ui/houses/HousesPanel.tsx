import { useMemo, useState } from 'react';
import { HOUSE_TYPE_LABEL, PLAYER_HOUSE, type HouseType, type LEventKind } from '../../engine/houses';
import { crewOfHouse, fullName, houseSummaries, houseSummary, houseTimeline, node, relationsWithYou, type HouseSummary, type RelTone } from '../../engine/housesView';
import { opinionBreakdown } from '../../engine/relations';
import type { GameState } from '../../engine/types';
import { signed } from '../format';
import { useSheet } from '../components/People';
import { Badge } from '../family/bits';
import { HouseCrest } from './Crest';
import { HouseTree } from './HouseTree';
import { useHousesNav } from './nav';
import { PersonFace } from './PersonFace';

/**
 * The Houses screen: every family in the game, CK3 style. The list shows each
 * house's crest, head, living and dead, founding year, seat, kind and what it
 * is to you; a house page has its tree, its history and its dealings with
 * your house.
 */

type Filter = 'all' | HouseType | 'extinct';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'crime', label: 'Crime' }, { id: 'political', label: 'Political' }, { id: 'police', label: 'Police' }, { id: 'fire', label: 'Fire' },
  { id: 'legit', label: 'Legitimate' }, { id: 'showbiz', label: 'Show business' }, { id: 'extinct', label: 'Extinct' },
];

const TONE_BADGE: Record<RelTone, 'gold' | 'good' | 'bad' | 'warn' | 'neutral'> = { gold: 'gold', good: 'good', bad: 'bad', warn: 'warn', neutral: 'neutral' };

export function HousesPanel({ s, selected, onSelect }: { s: GameState; selected?: string; onSelect: (id?: string) => void }) {
  if (!s.lineage) return <div className="text-sm text-stone-500">The houses' records are not kept in this save.</div>;
  const h = selected ? s.lineage.houses[selected] : undefined;
  return h ? <HousePage s={s} id={h.id} onBack={() => onSelect(undefined)} /> : <HouseList s={s} onSelect={onSelect} />;
}

function HouseList({ s, onSelect }: { s: GameState; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const all = useMemo(() => houseSummaries(s), [s]);
  const list = all.filter((x) => (filter === 'all' ? true : filter === 'extinct' ? x.h.extinct !== undefined : x.h.type === filter))
    .filter((x) => !q || `${x.h.title} ${x.h.seat} ${x.head ? fullName(x.head) : ''}`.toLowerCase().includes(q.toLowerCase()));
  const living = all.reduce((a, x) => a + x.living, 0);
  const dead = all.reduce((a, x) => a + x.dead, 0);
  return (
    <div className="space-y-3" data-testid="houses-list">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl text-gold-400">The Houses</h2>
          <p className="text-xs text-stone-400">{all.length} houses · {living.toLocaleString()} living and {dead.toLocaleString()} dead of the blood, back to the 1870s.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a house or a name" className="w-full rounded border border-noir-600 bg-noir-800 px-2 py-1 text-sm text-stone-200 sm:w-56" />
      </div>
      <nav className="flex flex-wrap gap-1" aria-label="Kinds of house">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`rounded px-2.5 py-1 text-xs font-semibold ${filter === f.id ? 'bg-gold-500 text-noir-950' : 'text-stone-400 hover:text-gold-300'}`}>{f.label}</button>
        ))}
      </nav>
      <div className="hidden grid-cols-[44px_minmax(0,1.5fr)_minmax(0,1.3fr)_72px_64px_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-b border-noir-700 pb-1 text-[10px] uppercase tracking-[0.2em] text-stone-500 md:grid">
        <span /><span>House</span><span>Head</span><span>Living / dead</span><span>Founded</span><span>Seat</span><span>To you</span>
      </div>
      <ul className="divide-y divide-noir-800">
        {list.map((x) => <HouseRow key={x.h.id} s={s} x={x} onSelect={onSelect} />)}
        {!list.length && <li className="py-3 text-sm text-stone-500">No house matches.</li>}
      </ul>
    </div>
  );
}

function HouseRow({ s, x, onSelect }: { s: GameState; x: HouseSummary; onSelect: (id: string) => void }) {
  const { h, head } = x;
  return (
    <li>
      <button type="button" onClick={() => onSelect(h.id)} data-testid="house-row"
        className="grid w-full grid-cols-[44px_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 py-2 text-left hover:bg-noir-800/60 md:grid-cols-[44px_minmax(0,1.5fr)_minmax(0,1.3fr)_72px_64px_minmax(0,1fr)_minmax(0,1fr)]">
        <span className="row-span-3 md:row-span-1"><HouseCrest h={h} size={40} /></span>
        <span className="min-w-0">
          <span className={`block truncate font-display text-base ${h.extinct ? 'text-stone-500' : 'text-stone-100'}`}>{h.title}</span>
          <span className="block text-[11px] text-stone-500">{HOUSE_TYPE_LABEL[h.type]}{h.extinct ? ` · extinct ${h.extinct}` : ''}</span>
          {crewOfHouse(s, h) && <span className="block truncate text-[11px] text-blood-300" data-testid="house-crew">{crewOfHouse(s, h)}</span>}
        </span>
        <span className="min-w-0 truncate text-xs text-stone-300">{head ? <>{fullName(head)}{!head.alive && <span className="text-stone-500"> †</span>}</> : <span className="text-stone-600">—</span>}</span>
        <span className="text-xs tabular-nums text-stone-300"><span className="md:hidden text-stone-500">Living </span>{x.living} <span className="text-stone-600">/</span> <span className="text-stone-500">{x.dead} †</span></span>
        <span className="text-xs tabular-nums text-stone-400"><span className="md:hidden text-stone-500">Founded </span>{h.founded}</span>
        <span className="truncate text-xs text-stone-400">{h.seat}</span>
        <span><Badge tone={TONE_BADGE[x.relation.tone]}>{x.relation.label}</Badge></span>
      </button>
    </li>
  );
}

type Sub = 'tree' | 'history' | 'you';

function HousePage({ s, id, onBack }: { s: GameState; id: string; onBack: () => void }) {
  const [sub, setSub] = useState<Sub>('tree');
  const L = s.lineage!;
  const h = L.houses[id];
  const x = houseSummary(s, h);
  const founder = node(s, h.founderId);
  const { open } = useSheet();
  return (
    <div className="space-y-3" data-testid="house-page">
      <button className="text-xs text-gold-300 underline" onClick={onBack}>← All houses</button>
      <header className="flex items-start gap-3">
        <span className="shrink-0"><HouseCrest h={h} size={60} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="font-display text-2xl leading-tight text-gold-400">{h.title}</h2>
            <Badge>{HOUSE_TYPE_LABEL[h.type]}</Badge>
            {crewOfHouse(s, h) && <Badge tone="warn">{crewOfHouse(s, h)}</Badge>}
            <Badge tone={TONE_BADGE[x.relation.tone]}>{x.relation.label}</Badge>
            {h.extinct !== undefined && <Badge tone="bad">Extinct {h.extinct}</Badge>}
          </div>
          {h.blurb && h.id !== PLAYER_HOUSE && <p className="mt-0.5 text-sm text-stone-300">{h.blurb}</p>}
          <p className="mt-1 text-xs text-stone-400">
            Founded {h.founded}
            {founder && <> by <button className="underline decoration-dotted hover:text-gold-300" onClick={() => open(founder.id)}>{fullName(founder)}</button></>}
            {h.origin && <>, {/^(old|Cape May|Philadelphia|Cumberland|the Great)/.test(h.origin) ? 'of' : 'from'} {h.origin}</>}. Seat: {h.seat}.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-300">
            {x.head && (
              <span className="flex items-center gap-1.5">
                <PersonFace n={x.head} seed={s.seed} date={s.date} size={28} />
                <span>Head: <button className="underline decoration-dotted hover:text-gold-300" onClick={() => open(x.head!.id)}>{fullName(x.head)}</button></span>
              </span>
            )}
            <span><span className="tabular-nums text-stone-100">{x.living}</span> living · <span className="tabular-nums">{x.dead}</span> dead</span>
            <span>{h.heads.length} heads of the house</span>
          </div>
        </div>
      </header>
      <nav className="flex flex-wrap gap-1 border-b border-noir-700 pb-1" aria-label="House sections">
        {([['tree', 'Family tree'], ['history', 'House history'], ['you', h.player ? 'Feuds & marriages' : `${h.name} & you`]] as [Sub, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setSub(k)} data-testid={`house-sub-${k}`} className={`rounded px-2.5 py-1 text-xs font-semibold ${sub === k ? 'bg-gold-500 text-noir-950' : 'text-stone-400 hover:text-gold-300'}`}>{label}</button>
        ))}
      </nav>
      {sub === 'tree' && <HouseTree s={s} houseId={id} />}
      {sub === 'history' && <History s={s} id={id} />}
      {sub === 'you' && <WithYou s={s} id={id} />}
    </div>
  );
}

const KIND_ICON: Record<LEventKind, string> = { founding: '⚓', marriage: '⚭', feud: '⚔', title: '♔', succession: '♚', extinct: '✠', deed: '★', birth: '✶', death: '†' };

function History({ s, id }: { s: GameState; id: string }) {
  const items = useMemo(() => houseTimeline(s, id), [s, id]);
  const [deaths, setDeaths] = useState(true);
  const { open } = useSheet();
  const { openHouse } = useHousesNav();
  const L = s.lineage!;
  const shown = deaths ? items : items.filter((e) => e.kind !== 'death');
  let decade = 0;
  return (
    <div className="space-y-2" data-testid="house-history">
      <label className="flex items-center gap-1 text-xs text-stone-300"><input type="checkbox" checked={deaths} onChange={(e) => setDeaths(e.target.checked)} /> Every death</label>
      <ol className="space-y-0.5">
        {shown.map((e, i) => {
          const d = Math.floor(e.y / 10) * 10;
          const head = d !== decade;
          decade = d;
          const other = e.other ? L.houses[e.other] : undefined;
          return (
            <li key={i}>
              {head && <div className="mt-2 border-b border-noir-700 font-display text-sm text-gold-400">{d}s</div>}
              <div className={`flex gap-2 py-0.5 text-xs ${e.kind === 'feud' ? 'text-red-300' : e.kind === 'death' ? 'text-stone-400' : 'text-stone-200'}`}>
                <span className="w-9 shrink-0 tabular-nums text-stone-500">{e.y}</span>
                <span className="w-4 shrink-0 text-center text-gold-500" aria-hidden>{KIND_ICON[e.kind]}</span>
                <span className="min-w-0">
                  {e.who ? <button className="text-left hover:text-gold-300" onClick={() => open(e.who!)}>{e.text}</button> : e.text}
                  {other && other.id !== id && (
                    <button className="ml-1 rounded border border-noir-600 px-1 text-[10px] text-stone-400 hover:text-gold-300" onClick={() => openHouse(other.id)}>{other.title}</button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function WithYou({ s, id }: { s: GameState; id: string }) {
  const L = s.lineage!;
  const h = L.houses[id];
  const r = relationsWithYou(s, id);
  const { open } = useSheet();
  const { openHouse } = useHousesNav();
  const grudgeMods = r.head?.char && r.head.alive && r.head.id !== s.playerId ? opinionBreakdown(s, r.head.id, s.playerId).mods.filter((m) => /^You killed/.test(m.reason)) : [];
  const allFeuds = h.player ? L.grudges.filter((g) => g.h === id || g.vs === id) : r.feuds;
  const marriages = h.player ? L.events.filter((e) => e.k === 'marriage' && (e.h === id || e.o === id) && e.o) : [];
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="house-you">
      {!h.player && (
        <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Standing</div>
          {r.head && r.headOpinion !== undefined ? (
            <div className="mt-1 text-sm text-stone-200">{fullName(r.head)} thinks <span className={r.headOpinion >= 20 ? 'text-emerald-400' : r.headOpinion <= -20 ? 'text-red-400' : 'text-stone-100'}>{signed(r.headOpinion)}</span> of you.</div>
          ) : <div className="mt-1 text-xs text-stone-500">The head of the house is not someone you deal with directly.</div>}
          {grudgeMods.map((m) => <div key={m.id} className="text-xs text-red-300">“{m.reason}” ({signed(m.value)})</div>)}
          {r.alliances.length > 0 && <div className="mt-1 text-xs text-emerald-300">Allied to your house by marriage since week {r.alliances[0].since}.</div>}
        </section>
      )}
      <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Blood between the houses</div>
        {!allFeuds.length && <div className="mt-1 text-xs text-stone-500">No blood has been spilled{h.player ? ' that the houses remember' : ' between your houses'}.</div>}
        <ul className="mt-1 space-y-1">
          {allFeuds.map((g, i) => (
            <li key={i} className="text-xs text-red-200">
              <button className="text-left hover:text-gold-300" onClick={() => open(g.victim)}>{g.t}</button>
              {h.player && <button className="ml-1 rounded border border-noir-600 px-1 text-[10px] text-stone-400 hover:text-gold-300" onClick={() => openHouse(g.h === id ? g.vs : g.h)}>{L.houses[g.h === id ? g.vs : g.h]?.title}</button>}
              {g.y >= 1960 && <span className="ml-1 text-[10px] text-stone-500">({g.vs === PLAYER_HOUSE ? 'they remember' : 'you remember'})</span>}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5 md:col-span-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Marriages</div>
        {h.player ? (
          marriages.length ? (
            <ul className="mt-1 space-y-0.5">
              {marriages.map((e, i) => (
                <li key={i} className="text-xs text-stone-300"><span className="tabular-nums text-stone-500">{e.y}</span> {e.t} <button className="ml-1 rounded border border-noir-600 px-1 text-[10px] text-stone-400 hover:text-gold-300" onClick={() => openHouse(e.h === id ? e.o! : e.h)}>{L.houses[e.h === id ? e.o! : e.h]?.title}</button></li>
              ))}
            </ul>
          ) : <div className="mt-1 text-xs text-stone-500">Your house has not married into another house yet.</div>
        ) : r.marriages.length ? (
          <ul className="mt-1 space-y-0.5">
            {r.marriages.map(({ x, y }) => (
              <li key={x.id + y.id} className="text-xs text-stone-300">
                <button className="underline decoration-dotted hover:text-gold-300" onClick={() => open(x.id)}>{fullName(x)}</button> ⚭ <button className="underline decoration-dotted hover:text-gold-300" onClick={() => open(y.id)}>{fullName(y)}</button>
                {!x.alive || !y.alive ? <span className="text-stone-500"> (ended by death)</span> : null}
              </li>
            ))}
          </ul>
        ) : <div className="mt-1 text-xs text-stone-500">No marriages between your houses. (Arrange one from Family → Marriages & Children{h.dynId ? '' : ' with a house that will have you'}.)</div>}
      </section>
    </div>
  );
}
