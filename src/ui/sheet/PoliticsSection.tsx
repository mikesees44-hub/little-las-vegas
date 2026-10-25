import type { Character, GameState } from '../../engine/types';
import { PolSheet } from '../cityhall/CityHall';
import { useSheet } from '../components/People';

/** The sheet's Politics section: for a man who is also a person of the political world. */
export function PoliticsSection({ s, c }: { s: GameState; c: Character }) {
  const { open } = useSheet();
  const p = Object.values(s.pol?.people ?? {}).find((x) => x.charId === c.id);
  if (!p) return null;
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/40" data-testid="sheet-politics">
      <div className="px-3 pt-2 text-[10px] uppercase tracking-[0.25em] text-stone-500">Politics</div>
      <PolSheet s={s} id={p.id} embedded onClose={() => {}} onOpen={open} />
    </section>
  );
}
