import { useState } from 'react';
import type { ZoneId } from '../../engine/econState';
import { PROJECTS, PROJECTS_BY_KIND, TEAMS, houseTickets, teamPlaying, zoneRep } from '../../engine/gifts';
import { ZONES, ZONES_BY_ID } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';
import { Stat } from '../econ/Holdings';

/**
 * Town & Law › Patronage: what the family gives the town: community
 * projects by neighbourhood, the house's season tickets, no-show jobs.
 * Gifts to one person live on that person's sheet (Diplomacy).
 */
export function PatronagePanel({ s }: { s: GameState }) {
  const [zone, setZone] = useState<ZoneId>('pacific');
  const e = s.econ;
  const active = (e?.projects ?? []).filter((p) => !p.done);
  const tickets = houseTickets(s);
  const jobs = Object.entries(e?.jobs ?? {});
  return (
    <div className="space-y-6" data-testid="patronage">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Gifts given" value={`${e?.stats.gifts ?? 0}`} sub="from people's sheets" />
        <Stat label="Season tickets" value={`${tickets.length}`} sub={tickets.map((x) => TEAMS[x.team].name).join(', ') || 'none in the house'} />
        <Stat label="Projects under way" value={`${active.length}`} sub={`${e?.stats.projects ?? 0} finished`} />
        <Stat label="No-show jobs" value={`${jobs.length}`} sub={`${fmt$(jobs.reduce((a, [, b]) => a + b, 0))}/wk`} />
      </section>

      <section>
        <div className="panel-title">The community</div>
        <p className="text-xs text-stone-400">A playground, a church roof, a Little League team. Residents can appreciate it and still not trust the man who paid for it: trust grows a third as fast, and heat wears it down. Where they trust you, they look the other way.</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {ZONES.map((z) => {
            const r = zoneRep(s, z.id);
            return (
              <button key={z.id} className={`text-xs px-2 py-1 rounded border ${zone === z.id ? 'border-gold-400 text-gold-300' : 'border-noir-700 text-stone-400'}`} onClick={() => setZone(z.id)}>
                {z.name} <span className="text-stone-500">♥{r.rep} · trust {r.trust}</span>
              </button>
            );
          })}
        </div>
        {active.length > 0 && (
          <ul className="mt-2 text-xs space-y-1">
            {active.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="text-stone-300 w-56 truncate">{PROJECTS_BY_KIND[p.kind].name} — {ZONES_BY_ID[p.zone].name}</span>
                <div className="flex-1 h-1.5 bg-noir-700 rounded"><div className="h-1.5 bg-gold-400 rounded" style={{ width: `${(100 * p.progress) / p.weeks}%` }} /></div>
                <span className="text-stone-500 tabular-nums">{p.progress}/{p.weeks} wk</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {PROJECTS.map((p) => <ActionCard key={p.kind} s={s} action={{ kind: 'econ', op: { type: 'project', kind: p.kind, zone } }} compact />)}
        </div>
      </section>

      <section>
        <div className="panel-title text-base">Season tickets</div>
        {tickets.length === 0 ? <p className="text-xs text-stone-500">The house holds none. Buy a pair as a gift from someone's sheet; they pass to the holder's eldest child.</p> : (
          <ul className="mt-1 text-xs space-y-1">
            {tickets.map((tk) => <li key={`${tk.team}-${tk.holderId}`} className="text-stone-300">{TEAMS[tk.team].name} {tk.box ? 'box' : 'seats'} — held by <CharLink s={s} id={tk.holderId} />{teamPlaying(tk.team, s) ? '' : ' (off-season)'}. Invite someone from his sheet.</li>)}
          </ul>
        )}
      </section>

      {jobs.length > 0 && (
        <section>
          <div className="panel-title text-base">No-show jobs</div>
          <ul className="mt-1 text-xs space-y-0.5">{jobs.map(([id, pay]) => <li key={id} className="text-stone-300"><CharLink s={s} id={id} /> · {fmt$(pay)}/wk</li>)}</ul>
        </section>
      )}
    </div>
  );
}
