import type { GameState } from '../../engine/types';
import { useState } from 'react';
import { deathLine, extendedFamily, familyView, fullName, node, type PNode } from '../../engine/housesView';
import { kinWord } from '../../engine/houses';
import { useSheet } from '../components/People';
import { useHousesNav } from './nav';

function Kin({ s, n, home, of }: { s: GameState; n: PNode; home?: string; of?: string }) {
  const { open } = useSheet();
  const { openHouse } = useHousesNav();
  const h = n.house && n.house !== home ? s.lineage?.houses[n.house] : undefined;
  const age = s.date.y - n.by - (s.date.m < n.bm ? 1 : 0);
  return (
    <li className={`flex flex-wrap items-baseline gap-x-1.5 text-xs ${n.alive ? 'text-stone-200' : 'text-stone-500'}`} data-testid="kin">
      <button type="button" className="underline decoration-dotted decoration-stone-600 underline-offset-2 hover:text-gold-300 text-left" onClick={(e) => { e.stopPropagation(); open(n.id); }}>
        {fullName(n)}
      </button>
      {n.alive ? <span className="text-stone-500">{age}</span> : <span className="text-stone-500">{deathLine(s, n)}</span>}
      {n.maiden && <span className="text-stone-600">née {n.maiden}</span>}
      {of && <KinWord s={s} of={of} to={n.id} />}
      {h && (
        <button type="button" className="rounded border border-noir-600 px-1 text-[10px] text-stone-400 hover:text-gold-300" onClick={(e) => { e.stopPropagation(); openHouse(h.id); }}>
          {h.title}
        </button>
      )}
    </li>
  );
}

function KinWord({ s, of, to }: { s: GameState; of: string; to: string }) {
  const w = kinWord(s, of, to);
  return w ? <span className="text-[10px] italic text-stone-500">{w}</span> : null;
}

function Group({ s, label, list, home, of }: { s: GameState; label: string; list: PNode[]; home?: string; of?: string }) {
  if (!list.length) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{label}</div>
      <ul className="mt-0.5 space-y-0.5">{list.slice(0, 16).map((n) => <Kin key={n.id} s={s} n={n} home={home} of={of} />)}</ul>
      {list.length > 16 && <div className="text-[10px] text-stone-500">and {list.length - 16} more</div>}
    </div>
  );
}

/** Parents, brothers and sisters, spouses and children, living and dead, with the cause of each death; the wider family on demand. */
export function FamilySection({ s, id }: { s: GameState; id: string }) {
  const f = familyView(s, id);
  const n = node(s, id);
  const home = n?.house;
  const [wide, setWide] = useState(false);
  const x = wide ? extendedFamily(s, id) : undefined;
  const empty = !f.parents.length && !f.siblings.length && !f.spouses.length && !f.children.length;
  const spLabel = f.spouses.length > 1 ? 'Spouses' : 'Spouse';
  return (
    <section className="mt-3" data-testid="family-section">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Family</div>
        <button type="button" className="text-[11px] text-gold-300 underline decoration-dotted" onClick={() => setWide((v) => !v)} data-testid="extended-toggle">
          {wide ? 'Close family only' : 'Grandparents, uncles, cousins, in-laws…'}
        </button>
      </div>
      {n?.char && n.titles.length > 0 && (
        <div className="mt-1" data-testid="titles-held">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Titles held</div>
          <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-300">{n.titles.map((t) => <li key={t}>♔ {t}</li>)}</ul>
        </div>
      )}
      {empty ? <div className="text-xs text-stone-500 mt-1">No family to speak of.</div> : (
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <Group s={s} label="Parents" list={f.parents} home={home} />
          <Group s={s} label={spLabel} list={f.spouses} home={home} />
          <Group s={s} label="Brothers & sisters" list={f.siblings} home={home} />
          <Group s={s} label="Children" list={f.children} home={home} />
        </div>
      )}
      {x && (
        <div className="mt-2 grid gap-2 border-t border-noir-700 pt-2 sm:grid-cols-2" data-testid="extended-family">
          <Group s={s} label="Grandparents" list={x.grandparents} home={home} of={id} />
          <Group s={s} label="Uncles & aunts" list={x.unclesAunts} home={home} of={id} />
          <Group s={s} label="Cousins" list={x.cousins} home={home} of={id} />
          <Group s={s} label="Nephews & nieces" list={x.nephewsNieces} home={home} of={id} />
          <Group s={s} label="Grandchildren" list={x.grandchildren} home={home} of={id} />
          <Group s={s} label="In-laws" list={x.inLaws} home={home} of={id} />
          {!Object.values(x).some((l) => l.length) && <div className="text-xs text-stone-500">No wider family recorded.</div>}
        </div>
      )}
    </section>
  );
}
