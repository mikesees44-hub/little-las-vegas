import { useState } from 'react';
import { knownOld, LIFE_INFO, lifeTraits, skillLines, undiagnosed, isIncapable, agingOf, OLD_INFO } from '../../engine/aging';
import type { Character, GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';

const SKILL_LABEL: Record<string, string> = { leadership: 'Leadership', business: 'Business', diplomacy: 'Diplomacy', intrigue: 'Intrigue', force: 'Muscle', discipline: 'Discipline' };

/**
 * Age and family standing on the character sheet (Skills tab): a short
 * summary first, the details behind "More…". Only what the player knows is
 * named: his own conditions once the doctor names them, other people's from
 * what he has seen or heard.
 */
export function AgingSection({ s, c }: { s: GameState; c: Character }) {
  const [more, setMore] = useState(false);
  const mine = c.id === s.playerId;
  const known = knownOld(s, c);
  const symptoms = mine ? undiagnosed(s) : [];
  const life = lifeTraits(s, c);
  const lines = skillLines(s, c).filter((l) => l.learned !== l.effective);
  const regent = mine && isIncapable(s, c.id) ? s.aging?.regent : undefined;
  const ofHouse = c.dynasty && !mine && c.alive;
  if (!known.length && !symptoms.length && !life.length && !lines.length && !ofHouse) return null;
  const summary = [
    ...known.map((k) => (k.sure ? k.label : `${k.label} (people say)`)),
    ...(symptoms.length ? ['Something the doctor should look at'] : []),
    ...life.map((t) => LIFE_INFO[t].name),
  ];
  return (
    <section className="mt-3 rounded border border-noir-700 bg-noir-900/60 p-2 text-xs" data-testid="sheet-aging">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-stone-200">Age &amp; standing</h3>
        <button type="button" className="text-gold-400 hover:underline" onClick={() => setMore(!more)} data-testid="aging-more">{more ? 'Less' : 'More…'}</button>
      </div>
      {summary.length > 0 ? <p className="mt-1 text-stone-300">{summary.join(' · ')}</p> : <p className="mt-1 text-stone-500">Nothing you know of.</p>}
      {lines.length > 0 && (
        <ul className="mt-1 text-stone-400" data-testid="aging-skills">
          {lines.map((l) => <li key={l.skill}><span className="text-stone-200">{SKILL_LABEL[l.skill]} {l.learned} learned → {l.effective} effective</span>{l.why.length ? `: ${l.why.join(', ')}` : ''}</li>)}
        </ul>
      )}
      {regent && <p className="mt-1 text-amber-300">{regent.mode === 'none' ? 'Nobody acts for you. Petitions pile up.' : `${regent.id && s.characters[regent.id] ? s.characters[regent.id].firstName : 'Someone'} acts for you while you cannot.`}</p>}
      {more && (
        <div className="mt-2 space-y-1.5 text-stone-400">
          {known.map((k) => <p key={k.trait}><span className="text-stone-200">{k.label}{k.sure ? '' : ' (a rumor)'}:</span> {k.text}</p>)}
          {symptoms.map((x) => <p key={x.trait}><span className="text-stone-200">A symptom:</span> {x.symptom} See the doctor (Your Rounds) to find out what it is; regular visits slow it down.</p>)}
          {mine && agingOf(s, c.id).care !== undefined && <p>Under a doctor's care since week {agingOf(s, c.id).care}: it comes on slower for half a year after each visit.</p>}
          {life.map((t) => <p key={t}><span className="text-stone-200">{LIFE_INFO[t].name}:</span> {LIFE_INFO[t].text}</p>)}
          {!known.length && !mine && <p>Old age shows on people slowly. You learn about it from what you see and what people say. Drinking and worry bring it on faster; {OLD_INFO.mind.name.toLowerCase()} can end in a man who cannot run his own affairs.</p>}
          {ofHouse && (
            <div className="space-y-1">
              <div className="text-stone-500">As head of the family:</div>
              <ActionCard s={s} compact action={{ kind: 'dynasty', op: { type: 'standing', charId: c.id, tag: 'disinherited', remove: life.includes('disinherited') } }} />
              <ActionCard s={s} compact action={{ kind: 'dynasty', op: { type: 'standing', charId: c.id, tag: 'shamed', remove: life.includes('shamed') } }} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
