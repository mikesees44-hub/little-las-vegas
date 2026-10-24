import { useState } from 'react';
import { displayName } from '../../engine/characters';
import { opinion } from '../../engine/relations';
import { needsSanction } from '../../engine/schemes';
import { chair, forecast, tableMembers } from '../../engine/table';
import { casusBelli, CB_LABEL, raidOdds, warName } from '../../engine/war';
import { FACTION_NAMES } from '../../engine/world';
import type { DisputeKind, GameState, RivalId } from '../../engine/types';
import { OpinionBadge } from './CrewList';
import { ActionCard } from './Orders';
import { CharLink, Face } from './People';

export function TablePanel({ s }: { s: GameState }) {
  const members = tableMembers(s);
  const open = s.disputes.filter((d) => !d.ruling);
  const ruled = s.disputes.filter((d) => d.ruling).slice(-5).reverse();
  const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  const [rival, setRival] = useState<RivalId>(mobs[0]?.id ?? 'manno');
  const [kind, setKind] = useState<DisputeKind>('district');
  const contested = s.districts.filter((d) => (d.influence[rival] ?? 0) > 0);
  const [district, setDistrict] = useState(contested[0]?.id ?? 'causeway');
  const theirMen = Object.values(s.characters).filter((c) => c.alive && c.faction === rival && needsSanction(s, c));
  const [target, setTarget] = useState(theirMen[0]?.id ?? '');
  const dist = contested.some((d) => d.id === district) ? district : contested[0]?.id;

  return (
    <div className="space-y-6">
      <section>
        <div className="panel-title">The Table</div>
        <p className="text-xs text-stone-500">Philadelphia's South Jersey sit-down, above a restaurant on Ninth Street. Disputes are heard here; members who are not a party vote; the chair breaks ties. A hit on a made man needs its sanction, and so does a war.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-md border border-noir-700 bg-noir-800/60 p-2">
              <Face s={s} c={m} size={44} />
              <div className="text-sm">
                <CharLink s={s} id={m.id} />
                <div className="text-[11px] text-stone-400">{m.id === chair(s)?.id ? 'Chair · Philadelphia' : m.office ?? FACTION_NAMES[m.faction]}</div>
                <div className="text-[11px]">Of you: <OpinionBadge v={opinion(s, m.id, s.playerId)} /></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="panel-title">Before the Table</div>
        {open.length === 0 && <p className="text-xs text-stone-500">No disputes pending.</p>}
        {open.map((d) => {
          const leans = forecast(s, d);
          return (
            <div key={d.id} className="mt-2 rounded-md border border-gold-600/40 bg-noir-800/60 p-3" data-testid="dispute">
              <div className="text-xs text-stone-500">Hearing in week {d.hearingWeek} · {FACTION_NAMES[d.plaintiff]} v. {d.defendant === 'player' ? 'your house' : FACTION_NAMES[d.defendant]}</div>
              <p className="text-sm text-stone-200 mt-1"><span className="text-gold-300">The claim: </span>{d.claim}</p>
              <p className="text-sm text-stone-300"><span className="text-gold-300">The answer: </span>{d.defense}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {leans.map((l) => (
                  <div key={l.member.id} className="rounded border border-noir-700 p-2">
                    <div className="flex items-center gap-2">
                      <Face s={s} c={l.member} size={32} />
                      <div className="text-sm flex-1"><CharLink s={s} id={l.member.id} /></div>
                      <span className={`text-xs font-semibold ${l.value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{l.value > 0 ? 'leans your way' : 'leans against'} ({l.value > 0 ? '+' : ''}{l.value})</span>
                    </div>
                    <div className="text-[11px] text-stone-500 mt-1">{l.reasons.filter((r) => r.value).map((r) => `${r.value > 0 ? '+' : ''}${r.value} ${r.label}`).join(' · ')}</div>
                    <div className="mt-1 grid gap-1">
                      <ActionCard s={s} action={{ kind: 'lobby', disputeId: d.id, memberId: l.member.id, mode: 'money' }} compact />
                      {s.favors > 0 && <ActionCard s={s} action={{ kind: 'lobby', disputeId: d.id, memberId: l.member.id, mode: 'favor' }} compact />}
                      {s.hooks.some((h) => h.holder === 'player' && h.targetId === l.member.id) && <ActionCard s={s} action={{ kind: 'lobby', disputeId: d.id, memberId: l.member.id, mode: 'hook' }} compact />}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-stone-500 mt-1">At the hearing you will make your plea; then they vote.</p>
            </div>
          );
        })}
      </section>

      <section>
        <div className="panel-title">Bring a matter before the Table</div>
        <div className="mt-2 flex flex-wrap gap-2 items-center text-xs">
          <select className="rounded bg-noir-900 border border-noir-600 p-1" value={rival} onChange={(e) => setRival(e.target.value as RivalId)} aria-label="Against">
            {mobs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select className="rounded bg-noir-900 border border-noir-600 p-1" value={kind} onChange={(e) => setKind(e.target.value as DisputeKind)} aria-label="Matter">
            <option value="district">A district is ours</option>
            <option value="sanction">Sanction a hit</option>
            <option value="war">Bless a war</option>
            <option value="reparations">Reparations</option>
            <option value="peace">End a war</option>
          </select>
          {(kind === 'district' || kind === 'war') && (
            <select className="rounded bg-noir-900 border border-noir-600 p-1" value={dist} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
              {contested.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          {kind === 'sanction' && (
            <select className="rounded bg-noir-900 border border-noir-600 p-1" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target">
              {theirMen.map((c) => <option key={c.id} value={c.id}>{displayName(c)}</option>)}
            </select>
          )}
        </div>
        <div className="mt-2 max-w-xl">
          <ActionCard s={s} action={{ kind: 'raiseDispute', dispute: kind, rival, district: kind === 'district' || kind === 'war' ? dist : undefined, targetId: kind === 'sanction' ? (theirMen.some((c) => c.id === target) ? target : theirMen[0]?.id) : undefined, warId: kind === 'peace' ? s.wars.find((w) => w.rival === rival)?.id : undefined }} />
        </div>
      </section>

      <section>
        <div className="panel-title">Wars</div>
        {s.wars.length === 0 && <p className="text-xs text-stone-500">At peace. A war needs a casus belli: a claim (fabricate one through a scheme), a grievance the Table heard, a blood feud, or the Table's blessing.</p>}
        {s.wars.map((w) => (
          <div key={w.id} className="mt-2 rounded-md border border-blood-500/50 bg-blood-500/10 p-3" data-testid="war">
            <div className="flex justify-between text-sm"><span className="text-stone-100 font-semibold">War with {warName(s, w)}</span><span className="text-xs text-stone-400">{w.sanctioned ? 'sanctioned' : 'unsanctioned'} · since week {w.startWeek}</span></div>
            <div className="mt-1 relative h-3 rounded bg-noir-800 overflow-hidden">
              <div className="absolute inset-y-0 left-1/2 w-px bg-stone-500" />
              <div className={`absolute inset-y-0 ${w.score >= 0 ? 'left-1/2 bg-gold-500' : 'right-1/2 bg-blood-400'}`} style={{ width: `${Math.abs(w.score) / 2}%` }} />
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">War score {w.score > 0 ? '+' : ''}{w.score} · raids succeed {Math.round(raidOdds(s, w) * 100)}% · hits on their people count, their strikes count against you</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <ActionCard s={s} action={{ kind: 'raid', warId: w.id }} compact />
              <ActionCard s={s} action={{ kind: 'terms', warId: w.id, terms: 'district' }} compact />
              <ActionCard s={s} action={{ kind: 'terms', warId: w.id, terms: 'tribute' }} compact />
              <ActionCard s={s} action={{ kind: 'terms', warId: w.id, terms: 'white' }} compact />
            </div>
          </div>
        ))}
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Declare war</div>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {mobs.flatMap((r) => s.districts.filter((d) => (d.influence[r.id] ?? 0) > 0 && casusBelli(s, r.id, d.id)).map((d) => (
              <div key={`${r.id}${d.id}`}>
                <ActionCard s={s} action={{ kind: 'declareWar', rival: r.id, district: d.id }} compact />
                <div className="text-[11px] text-stone-500 px-1">{CB_LABEL[casusBelli(s, r.id, d.id)!]}</div>
              </div>
            )))}
          </div>
          {!mobs.some((r) => s.districts.some((d) => (d.influence[r.id] ?? 0) > 0 && casusBelli(s, r.id, d.id))) && <p className="text-xs text-stone-500">No casus belli against anyone yet.</p>}
        </div>
      </section>

      {ruled.length > 0 && (
        <section>
          <div className="panel-title text-base">Past rulings</div>
          <ul className="text-xs text-stone-400 space-y-1 mt-1">{ruled.map((d) => <li key={d.id}>Week {d.ruling!.week}: {d.ruling!.forPlayer ? 'for you' : 'against you'} — {d.claim}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
