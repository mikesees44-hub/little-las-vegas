import { HOUSE_TYPE_LABEL } from '../../engine/houses';
import { deathLine, fullName, lifespan, node } from '../../engine/housesView';
import type { GameState } from '../../engine/types';
import { Modal } from '../components/Modal';
import { HouseCrest } from './Crest';
import { FamilySection } from './FamilySection';
import { useHousesNav } from './nav';
import { PersonFace } from './PersonFace';

/** The sheet for someone the engine doesn't play: the dead of the house histories and off-screen kin. */
export function LineageSheet({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  const n = node(s, id);
  const { openHouse } = useHousesNav();
  if (!n) return null;
  const h = n.house ? s.lineage?.houses[n.house] : undefined;
  const dl = deathLine(s, n);
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5" data-testid="character-sheet">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <PersonFace n={n} seed={s.seed} date={s.date} size={96} />
            <div className="min-w-0">
              <h2 className="font-display text-2xl leading-tight text-gold-400">{fullName(n)}</h2>
              {n.maiden && <div className="text-xs text-stone-500">née {n.maiden}</div>}
              {h && (
                <button className="mt-0.5 flex items-center gap-1.5 text-sm text-stone-200 hover:text-gold-300" onClick={() => openHouse(h.id)} data-testid="house-link">
                  <HouseCrest h={h} size={20} /> {h.title} <span className="text-xs text-stone-500">· {HOUSE_TYPE_LABEL[h.type]}</span>
                </button>
              )}
              <div className="mt-0.5 text-xs text-stone-400">{lifespan(s, n)}{n.born ? ` · born in ${n.born}` : ''}</div>
              {dl && <div className="text-xs text-stone-300">{dl}</div>}
              {n.note && <div className="text-xs text-stone-400">{n.note}.</div>}
              {n.alive && <div className="mt-1 text-[11px] text-stone-500">Lives off the island's stage: you will hear of {n.g === 'M' ? 'him' : 'her'} through the family.</div>}
            </div>
          </div>
          <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
        {n.titles.length > 0 && (
          <section className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Titles & deeds</div>
            <ul className="mt-1 space-y-0.5 text-xs text-stone-200">{n.titles.map((t) => <li key={t}>♔ {t}</li>)}</ul>
          </section>
        )}
        <FamilySection s={s} id={id} />
      </div>
    </Modal>
  );
}
