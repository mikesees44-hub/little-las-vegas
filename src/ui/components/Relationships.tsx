import { ageOn } from '../../engine/calendar';
import { activeRomances, bloodChildren, partnerOf, paternityRumored, romanceKnown } from '../../engine/romance';
import type { Character, GameState } from '../../engine/types';
import { CharLink } from './People';

const KIND_LABEL = { courtship: 'Courting', lovers: 'Lovers', affair: 'Affair' } as const;

/**
 * The Relationships section of a character sheet: the spouse (separated,
 * widowed), the romances the boss knows about, past loves, and children —
 * marked "(rumored)" where the father of record is not the real father.
 */
export function Relationships({ s, c }: { s: GameState; c: Character }) {
  const spouse = c.spouseId ? s.characters[c.spouseId] : undefined;
  const sep = s.romance?.separations.find((x) => (x.a === c.id || x.b === c.id) && (!spouse || x.a === spouse.id || x.b === spouse.id));
  const loves = activeRomances(s, c.id).filter((r) => romanceKnown(s, r));
  const past = (s.romance?.rels ?? []).filter((r) => r.ended !== undefined && (r.a === c.id || r.b === c.id) && romanceKnown(s, r) && r.endReason !== 'married').slice(-3);
  const kids = c.childrenIds.map((id) => s.characters[id]).filter((k): k is Character => !!k);
  const blood = bloodChildren(s, c).filter((k) => paternityRumored(s, k));
  const husbandWife = (x: Character) => (x.gender === 'M' ? 'Husband' : 'Wife');
  const empty = !spouse && !loves.length && !past.length && !kids.length && !blood.length && !sep;
  return (
    <section className="mt-3" data-testid="relationships">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Relationships</div>
      {empty && <div className="text-xs text-stone-500 mt-1">Nobody, as far as anyone knows.</div>}
      <ul className="mt-1 space-y-0.5 text-xs">
        {spouse && (
          <li className={spouse.alive ? 'text-stone-300' : 'text-stone-500'}>
            <span className="text-stone-500">{husbandWife(spouse)}:</span> <CharLink s={s} id={spouse.id} />
            {!spouse.alive && <span className="text-stone-500"> † ({c.gender === 'F' ? 'widowed' : 'widower'})</span>}
            {sep && spouse.alive && <span className="text-amber-300"> (separated{sep.divorce ? ', divorced' : ''})</span>}
          </li>
        )}
        {!spouse && sep?.divorce && <li className="text-amber-300">Divorced (week {sep.week}) — the parish has not forgotten.</li>}
        {loves.map((r) => {
          const other = s.characters[partnerOf(r, c.id)];
          return (
            <li key={r.id} className="text-rose-200">
              <span className="text-stone-500">{KIND_LABEL[r.kind]}{r.secret ? ' (secret)' : ''}:</span> <CharLink s={s} id={other?.id} />
              {r.discovered !== undefined && <span className="text-red-300"> — found out week {r.discovered}</span>}
              {r.secret && r.discovered === undefined && r.exposure >= 40 && <span className="text-amber-300"> — people are starting to talk</span>}
            </li>
          );
        })}
        {past.map((r) => (
          <li key={r.id} className="text-stone-500">
            Once: <CharLink s={s} id={partnerOf(r, c.id)} /> ({r.endReason})
          </li>
        ))}
        {kids.map((k) => (
          <li key={k.id} className={k.alive ? 'text-stone-300' : 'text-stone-600'}>
            <span className="text-stone-500">{k.gender === 'M' ? 'Son' : 'Daughter'}:</span> <CharLink s={s} id={k.id} />
            {k.alive && <span className="text-stone-500">, {ageOn(k.birth, s.date)}</span>}
            {!k.alive && ' †'}
            {k.fatherId === c.id && paternityRumored(s, k) && <span className="text-amber-300"> (rumored not his)</span>}
          </li>
        ))}
        {blood.map((k) => (
          <li key={k.id} className="text-amber-200">
            <span className="text-stone-500">{k.gender === 'M' ? 'Son' : 'Daughter'} by blood:</span> <CharLink s={s} id={k.id} /> <span className="text-amber-300">(rumored)</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
