import { useState } from 'react';
import { ageOn } from '../../engine/calendar';
import { capos, displayName, player, relationLabel } from '../../engine/characters';
import { alliedHouse, activeAlliances, HOUSE_KIND_LABEL, houseMembers, marriageable } from '../../engine/familyHouses';
import { dowryFor, marriageAcceptance, matchCandidates, ourMarriageable } from '../../engine/familyMarriage';
import { fam, houseById } from '../../engine/familyState';
import { EDUCATION, EDUCATION_KINDS, GOAL_INFO } from '../../engine/familyTraits';
import { opinion } from '../../engine/relations';
import type { Character, GameState } from '../../engine/types';
import { OpinionBadge } from '../components/CrewList';
import { ActionCard } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { fmt$ } from '../format';
import { Badge, BloodChips } from './bits';

/** Arranged marriages, the children's education, and the houses of the shore. */
export function MarriagePanel({ s }: { s: GameState }) {
  const singles = ourMarriageable(s);
  const kids = Object.values(s.characters).filter((c) => c.alive && c.dynasty && ageOn(c.birth, s.date) < 16).sort((a, b) => ageOn(b.birth, s.date) - ageOn(a.birth, s.date));
  return (
    <div className="space-y-5" data-testid="marriage-panel">
      <section>
        <div className="panel-title">Arranged marriages</div>
        <p className="text-xs text-stone-400">A marriage between houses makes an alliance for as long as it stands: they won't move against you, they send men to your wars, and their votes at the Table lean your way. The bride's family pays the dowry.</p>
        {singles.length === 0 && <div className="mt-2 text-xs text-stone-500">No one in the house is of marrying age and free.</div>}
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {singles.map((m) => <MatchCard key={m.id} s={s} m={m} />)}
        </div>
      </section>
      <section>
        <div className="panel-title">Children & wards</div>
        <p className="text-xs text-stone-400">Who raises a child decides what comes home at sixteen: an education, a temperament, and the path the child will want.</p>
        {kids.length === 0 && <div className="mt-2 text-xs text-stone-500">No children in the house.</div>}
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {kids.map((k) => <WardCard key={k.id} s={s} c={k} />)}
        </div>
      </section>
      <Houses s={s} />
    </div>
  );
}

function MatchCard({ s, m }: { s: GameState; m: Character }) {
  const boss = player(s);
  const cands = matchCandidates(s, m).map((x) => ({ ...x, a: marriageAcceptance(s, m, x.c).chance })).sort((a, b) => b.a - a.a);
  const [pick, setPick] = useState(cands[0]?.c.id);
  const [matri, setMatri] = useState(false);
  const chosen = cands.find((x) => x.c.id === pick);
  return (
    <div className="min-w-0 rounded-md border border-noir-700 bg-noir-800/60 p-2.5" data-testid="match-card">
      <div className="flex gap-2">
        <Face s={s} c={m} size={44} />
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-stone-100"><CharLink s={s} id={m.id} /></div>
          <div className="text-xs text-stone-400">{m.id === boss.id ? 'Head of the house' : relationLabel(s, boss, m)} · {ageOn(m.birth, s.date)} · {fam(s, m.id).goal ? GOAL_INFO[fam(s, m.id).goal!] : ''}</div>
          <BloodChips s={s} c={m} />
        </div>
      </div>
      {cands.length === 0 ? <div className="mt-2 text-xs text-stone-500">No suitable match in any house right now.</div> : (
        <>
          <select className="mt-2 block w-full min-w-0 max-w-full truncate rounded bg-noir-900 border border-noir-600 p-1.5 text-sm" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Match for ${m.firstName}`}>
            {cands.map((x) => <option key={x.c.id} value={x.c.id}>{x.c.firstName} {x.c.lastName}, {ageOn(x.c.birth, s.date)} — {x.house.name} ({Math.round(x.a * 100)}%)</option>)}
          </select>
          {m.gender === 'F' && (
            <label className="mt-1 flex items-center gap-1.5 text-[11px] text-stone-400">
              <input type="checkbox" className="accent-amber-500" checked={matri} onChange={(e) => setMatri(e.target.checked)} />
              Matrilineal: he joins our house and the children carry our name (harder to arrange, you pay the dowry)
            </label>
          )}
          {chosen && (
            <div className="mt-1 text-[11px] text-stone-500">
              {chosen.house.name} · {HOUSE_KIND_LABEL[chosen.house.kind]} · dowry {(() => { const d = dowryFor(s, m, chosen.house, matri); return d > 0 ? `they pay ${fmt$(d)}` : `you pay ${fmt$(-d)}`; })()}
            </div>
          )}
          {pick && !s.gameOver && <div className="mt-1.5"><ActionCard s={s} action={{ kind: 'dynasty', op: { type: 'marry', memberId: m.id, spouseId: pick, matrilineal: m.gender === 'F' && matri ? true : undefined } }} compact /></div>}
        </>
      )}
    </div>
  );
}

function WardCard({ s, c }: { s: GameState; c: Character }) {
  const p = fam(s, c.id);
  const age = ageOn(c.birth, s.date);
  const capoList = capos(s);
  const [capo, setCapo] = useState(capoList[0]?.id);
  const [kind, setKind] = useState(p.guardian?.kind ?? 'priest');
  const info = EDUCATION[kind];
  return (
    <div className="min-w-0 rounded-md border border-noir-700 bg-noir-800/60 p-2.5" data-testid="ward-card">
      <div className="flex gap-2">
        <Face s={s} c={c} size={40} />
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-stone-100"><CharLink s={s} id={c.id} /> <span className="text-xs text-stone-500">{age}</span></div>
          <div className="text-xs text-stone-400">Raised: {p.guardian ? (p.guardian.kind === 'capo' ? `with ${s.characters[p.guardian.guardianId ?? '']?.firstName ?? 'a capo'}` : EDUCATION[p.guardian.kind].name) : 'at home'}{c.traits.length ? ` · ${c.traits.join(', ')}` : ''}</div>
          <BloodChips s={s} c={c} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {EDUCATION_KINDS.filter((k) => k !== 'home').map((k) => (
          <button key={k} className={`btn text-[11px] py-0.5 px-2 ${kind === k ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`} onClick={() => setKind(k)}>{EDUCATION[k].name}</button>
        ))}
      </div>
      {kind === 'capo' && (
        <select className="mt-1 block w-full min-w-0 max-w-full truncate rounded bg-noir-900 border border-noir-600 p-1 text-xs" value={capo} onChange={(e) => setCapo(e.target.value)} aria-label="Capo">
          {capoList.map((x) => <option key={x.id} value={x.id}>{displayName(x)} (lead {x.attributes.leadership}, muscle {x.attributes.force})</option>)}
        </select>
      )}
      <div className="mt-1 text-[11px] text-stone-500">{info.text}{info.minAge > age ? ` (from age ${info.minAge})` : ''}</div>
      {!s.gameOver && <div className="mt-1.5"><ActionCard s={s} action={{ kind: 'dynasty', op: { type: 'guardian', childId: c.id, kind, guardianId: kind === 'capo' ? capo : undefined } }} compact /></div>}
    </div>
  );
}

function Houses({ s }: { s: GameState }) {
  const houses = s.dyn?.houses ?? [];
  const allies = activeAlliances(s);
  return (
    <section>
      <div className="panel-title">Houses of the shore</div>
      <p className="text-xs text-stone-400">Rival crews, the Philadelphia families, political families and the legitimate families of Wildwood.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {houses.map((h) => {
          const head = s.characters[h.headId];
          const al = allies.find((a) => a.houseId === h.id);
          const free = marriageable(s, h).length;
          return (
            <div key={h.id} className={`rounded-md border p-2 ${al ? 'border-emerald-700/70 bg-emerald-900/10' : 'border-noir-700 bg-noir-800/50'}`} data-testid="house-card">
              <div className="flex gap-2 items-start">
                {head && <Face s={s} c={head} size={36} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-stone-100">{h.name}</span>
                    {alliedHouse(s, h.id) && <Badge tone="good">{al?.until !== undefined ? `Pact to wk ${al.until}` : 'Allied by marriage'}</Badge>}
                  </div>
                  <div className="text-[11px] text-stone-500">{HOUSE_KIND_LABEL[h.kind]} · {houseMembers(s, h).length} living · {free} to marry</div>
                  {head && <div className="text-[11px] text-stone-400">Head: <CharLink s={s} id={head.id} /> <OpinionBadge v={opinion(s, head.id, s.playerId)} /></div>}
                </div>
              </div>
              <div className="mt-1 text-[11px] text-stone-500 italic">{h.blurb}</div>
            </div>
          );
        })}
      </div>
      {allies.length > 0 && <div className="mt-1 text-[11px] text-stone-500">Alliances: {allies.map((a) => houseById(s, a.houseId)?.name).join(', ')}</div>}
    </section>
  );
}
