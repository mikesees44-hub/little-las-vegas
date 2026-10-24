import type { GameState } from '../../engine/types';
import { deathLine, familyView, fullName, node, type PNode } from '../../engine/housesView';
import { useSheet } from '../components/People';
import { useHousesNav } from './nav';

function Kin({ s, n, home }: { s: GameState; n: PNode; home?: string }) {
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
      {h && (
        <button type="button" className="rounded border border-noir-600 px-1 text-[10px] text-stone-400 hover:text-gold-300" onClick={(e) => { e.stopPropagation(); openHouse(h.id); }}>
          {h.title}
        </button>
      )}
    </li>
  );
}

function Group({ s, label, list, home }: { s: GameState; label: string; list: PNode[]; home?: string }) {
  if (!list.length) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{label}</div>
      <ul className="mt-0.5 space-y-0.5">{list.map((n) => <Kin key={n.id} s={s} n={n} home={home} />)}</ul>
    </div>
  );
}

/** Parents, brothers and sisters, spouses and children, living and dead, with the cause of each death. */
export function FamilySection({ s, id }: { s: GameState; id: string }) {
  const f = familyView(s, id);
  const home = node(s, id)?.house;
  const empty = !f.parents.length && !f.siblings.length && !f.spouses.length && !f.children.length;
  return (
    <section className="mt-3" data-testid="family-section">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Family</div>
      {empty ? <div className="text-xs text-stone-500 mt-1">No family to speak of.</div> : (
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <Group s={s} label="Parents" list={f.parents} home={home} />
          <Group s={s} label={f.spouses.length > 1 ? 'Spouses' : 'Spouse'} list={f.spouses} home={home} />
          <Group s={s} label="Brothers & sisters" list={f.siblings} home={home} />
          <Group s={s} label="Children" list={f.children} home={home} />
        </div>
      )}
    </section>
  );
}
