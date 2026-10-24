import { houseOfBirth, HOUSE_TYPE_LABEL } from '../../engine/houses';
import type { GameState } from '../../engine/types';
import { HouseCrest } from './Crest';
import { useHousesNav } from './nav';

/** "House Manno · Crime family" under a name: opens the house's page. */
export function HouseLine({ s, id }: { s: GameState; id: string }) {
  const { openHouse } = useHousesNav();
  const hid = s.lineage ? houseOfBirth(s, id) : undefined;
  const h = hid ? s.lineage!.houses[hid] : undefined;
  if (!h) return null;
  return (
    <button type="button" className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-200 hover:text-gold-300" onClick={() => openHouse(h.id)} data-testid="house-link">
      <HouseCrest h={h} size={18} /> <span className="underline decoration-dotted underline-offset-2">{h.title}</span>
      <span className="text-stone-500">· {HOUSE_TYPE_LABEL[h.type]}{h.extinct ? ` · extinct ${h.extinct}` : ''}</span>
    </button>
  );
}
