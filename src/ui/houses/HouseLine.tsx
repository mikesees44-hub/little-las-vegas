import { houseOfBirth, HOUSE_TYPE_LABEL } from '../../engine/houses';
import type { GameState } from '../../engine/types';
import { KIN_ROLE_INFO } from '../../engine/housesKin';
import { HouseCrest } from './Crest';
import { useHousesNav } from './nav';

/** "House Manno · Crime family" under a name: opens the house's page. */
export function HouseLine({ s, id }: { s: GameState; id: string }) {
  const { openHouse } = useHousesNav();
  const hid = s.lineage ? houseOfBirth(s, id) : undefined;
  const h = hid ? s.lineage!.houses[hid] : undefined;
  const roles = s.characters[id]?.kinRoles ?? [];
  if (!h && !roles.length) return null;
  return (
    <>
    {h && (
    <button type="button" className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-200 hover:text-gold-300" onClick={() => openHouse(h.id)} data-testid="house-link">
      <HouseCrest h={h} size={18} /> <span className="underline decoration-dotted underline-offset-2">{h.title}</span>
      <span className="text-stone-500">· {HOUSE_TYPE_LABEL[h.type]}{h.extinct ? ` · extinct ${h.extinct}` : ''}</span>
    </button>
    )}
    {roles.length > 0 && (
      <div className="mt-0.5 flex flex-wrap gap-1" data-testid="kin-roles">
        {roles.map((r) => (
          <span key={r} title={KIN_ROLE_INFO[r].text} className="rounded border border-gold-600/50 bg-gold-500/10 px-1.5 text-[10px] font-semibold text-gold-300">{KIN_ROLE_INFO[r].label}</span>
        ))}
      </div>
    )}
    </>
  );
}
