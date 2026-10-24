import { ageOn, formatDate } from '../../engine/calendar';
import { displayName, player, relationLabel } from '../../engine/characters';
import { bloodLine, chooseHeir, SUCCESSION_LAWS } from '../../engine/dynasty';
import { opinion } from '../../engine/relations';
import type { Character, GameState, SuccessionLaw } from '../../engine/types';
import { OpinionBadge } from './CrewList';
import { CharLink, Face } from './People';
import { CandidatePicker } from '../clarity/CandidatePicker';
import { rankCandidates } from '../../engine/candidates';

export function FamilyTree({ s, pendingLaw, pendingHeir, onLaw, onHeir }: {
  s: GameState;
  pendingLaw?: SuccessionLaw;
  pendingHeir?: string;
  onLaw: (l: SuccessionLaw) => void;
  onHeir: (id: string) => void;
}) {
  const boss = player(s);
  const law = pendingLaw ?? s.successionLaw;
  const preview = chooseHeir({ ...s, successionLaw: law, designatedHeirId: pendingHeir ?? s.designatedHeirId }, boss);
  const father = boss.fatherId ? s.characters[boss.fatherId] : undefined;
  const mother = boss.motherId ? s.characters[boss.motherId] : undefined;
  const spouse = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  const siblings = Object.values(s.characters).filter((c) => c.id !== boss.id && boss.fatherId && c.fatherId === boss.fatherId);
  const children = boss.childrenIds.map((id) => s.characters[id]).filter(Boolean);
  const candidates = bloodLine(s, boss).filter((c) => ageOn(c.birth, s.date) >= 16);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-noir-700 bg-noir-800/60 p-3">
        <div className="panel-title text-base">Succession</div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {(Object.keys(SUCCESSION_LAWS) as SuccessionLaw[]).map((l) => (
            <button key={l} onClick={() => onLaw(l)} className={`btn text-xs ${law === l ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`}>
              {SUCCESSION_LAWS[l].name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-400">{SUCCESSION_LAWS[law].text}</p>
        {law === 'appointed' && (
          <select
            className="mt-2 w-full rounded bg-noir-900 border border-noir-600 p-2 text-sm"
            value={pendingHeir ?? s.designatedHeirId ?? ''}
            onChange={(e) => onHeir(e.target.value)}
          >
            <option value="">— name an heir —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{displayName(c)} ({relationLabel(s, boss, c)}, {ageOn(c.birth, s.date)})</option>
            ))}
          </select>
        )}
        {law === 'appointed' && candidates.length > 0 && (
          <div className="mt-2" data-testid="heir-picker">
            <CandidatePicker s={s} role={{ kind: 'heir' }} selected={[pendingHeir ?? s.designatedHeirId ?? '']} onPick={(c) => onHeir(c.id)} limit={3} />
          </div>
        )}
        {law !== 'appointed' && candidates.length > 1 && (() => {
          const r = rankCandidates(s, { kind: 'heir' });
          const best = r.candidates.find((c) => c.id === r.recommendedId);
          return best && best.id !== preview.heir?.id ? (
            <p className="mt-2 text-xs text-amber-200">By the numbers the best heir is {best.name} ({best.pros[0]?.text ?? best.outcome}). Under {SUCCESSION_LAWS[law].name} law he does not inherit; switch to Appointed to name him.</p>
          ) : null;
        })()}
        <p className="mt-2 text-sm">
          If {boss.firstName} died today:{' '}
          {preview.heir ? (
            <span className="text-gold-300">{displayName(preview.heir)} ({preview.method})</span>
          ) : (
            <span className="text-red-400">no heir — the house would fall</span>
          )}
        </p>
        {(pendingLaw || pendingHeir !== undefined) && <p className="text-xs text-amber-400 mt-1">Takes effect when you advance.</p>}
      </section>

      <Group title="Parents" s={s} boss={boss} people={[father, mother].filter((x): x is Character => !!x)} />
      <Group title="The boss" s={s} boss={boss} people={[boss, ...(spouse ? [spouse] : [])]} />
      <Group title="Brothers & sisters" s={s} boss={boss} people={siblings} />
      <Group title="Children" s={s} boss={boss} people={children} showKids />

      {s.dynastyHistory.length > 0 && (
        <section>
          <div className="panel-title text-base">House history</div>
          <ul className="mt-1 space-y-1 text-xs text-stone-400">
            {[...s.dynastyHistory].reverse().slice(0, 30).map((h, i) => (
              <li key={i} className="border-l-2 border-gold-600/30 pl-2">{h.text}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Person({ s, boss, c }: { s: GameState; boss: Character; c: Character }) {
  const rel = c.id === boss.id ? 'head of the house' : relationLabel(s, boss, c);
  return (
    <div className={`rounded border px-2.5 py-1.5 flex gap-2 ${c.alive ? 'border-noir-700 bg-noir-800/70' : 'border-noir-800 bg-noir-900/40 opacity-60'}`}>
      <Face s={s} c={c} size={36} />
      <div className="flex justify-between gap-2 flex-1 min-w-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-stone-100 truncate">
            <CharLink s={s} id={c.id} />
            {c.maidenName && <span className="text-stone-500 font-normal"> (née {c.maidenName})</span>}
          </div>
          <div className="text-xs text-stone-400">
            {rel} · {c.alive ? `${ageOn(c.birth, s.date)} yrs · health ${c.health}` : `d. ${c.death ? formatDate(c.death.date) : '?'} — ${c.death?.cause ?? ''}`}
            {c.rank !== 'civilian' && c.id !== boss.id && <span className="capitalize"> · {c.rank}</span>}
          </div>
          <div className="text-[11px] text-stone-500">{c.traits.join(', ')}</div>
        </div>
        {c.alive && c.id !== boss.id && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">Opinion</div>
            <OpinionBadge v={opinion(s, c.id, boss.id)} />
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ title, s, boss, people, showKids }: { title: string; s: GameState; boss: Character; people: Character[]; showKids?: boolean }) {
  if (!people.length) return null;
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 mb-1">{title}</div>
      <div className="space-y-1.5">
        {people.map((c) => (
          <div key={c.id}>
            <Person s={s} boss={boss} c={c} />
            {showKids && (c.spouseId || c.childrenIds.length > 0) && (
              <div className="ml-4 mt-1 space-y-1 border-l border-noir-700 pl-2">
                {c.spouseId && s.characters[c.spouseId] && <Person s={s} boss={boss} c={s.characters[c.spouseId]} />}
                {c.childrenIds.map((id) => s.characters[id]).filter(Boolean).map((g) => <Person key={g.id} s={s} boss={boss} c={g} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
