import { useMemo, useState } from 'react';
import { ACTIVITIES, ACTIVITY_KINDS, activityBlock, activityCost, eligibleGuests, GROUP_NAME, guestGroup, honoreeOptions, suggestGuests, type GuestGroup } from '../../engine/activities';
import { ageOn } from '../../engine/calendar';
import { displayName } from '../../engine/characters';
import { houseLabel } from '../../engine/familyHouses';
import type { ActivityKind } from '../../engine/familyState';
import { opinion } from '../../engine/relations';
import type { GameState } from '../../engine/types';
import { OpinionBadge } from '../components/CrewList';
import { ActionCard } from '../components/Orders';
import { Face } from '../components/People';
import { fmt$ } from '../format';
import { ACTIVITY_ART, Backdrop } from '../hood/art/sceneArt';
import { Label } from './bits';

/** Hosted activities (CK feasts): choose one, pick guests, order it. */
export function ActivitiesPanel({ s }: { s: GameState }) {
  const [kind, setKind] = useState<ActivityKind | undefined>();
  const active = s.dyn?.activity;
  return (
    <div className="space-y-3" data-testid="activities-panel">
      {active && (
        <div className="rounded-md border border-gold-600/60 bg-gold-500/10 p-3 text-sm">
          <span className="text-gold-300 font-semibold">Now hosting: {ACTIVITIES[active.kind].name}</span>
          <span className="text-stone-400"> at {ACTIVITIES[active.kind].place} · {active.guests.length} guests · {active.endWeek > s.week ? `${active.endWeek - s.week} week${active.endWeek - s.week > 1 ? 's' : ''} to go` : 'ends this week'}</span>
        </div>
      )}
      <p className="text-xs text-stone-400">Pick the guests, pay for it, and a week or two later it plays out: guests think better of you, you unwind, the house earns renown — and something always happens. Weddings and funerals are where business gets done.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIVITY_KINDS.map((k) => {
          const def = ACTIVITIES[k];
          const why = activityBlock(s, k, ['x'], undefined);
          const blocked = why && why !== 'Someone on the list can\'t come' ? why : undefined;
          return (
            <button key={k} onClick={() => setKind(k)} data-testid={`activity-${k}`}
              className={`text-left rounded-md border p-2.5 transition-colors ${kind === k ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/60 hover:border-gold-500'}`}>
              <div className="font-semibold text-stone-100 text-sm">{def.name}</div>
              <div className="text-[11px] text-stone-500">{def.place}</div>
              <div className="text-[11px] text-stone-400 mt-0.5">{fmt$(def.baseCost)} + {fmt$(def.perGuest)}/guest · {def.weeks} wk · up to {def.maxGuests}</div>
              {blocked && <div className="text-[11px] text-amber-400 mt-0.5">{blocked}</div>}
            </button>
          );
        })}
      </div>
      {kind && <Planner key={kind} s={s} kind={kind} />}
      {s.dyn && s.dyn.activityLog.length > 0 && (
        <section>
          <Label>Past gatherings</Label>
          <ul className="mt-1 space-y-0.5 text-xs text-stone-400">
            {[...s.dyn.activityLog].reverse().slice(0, 8).map((r, i) => (
              <li key={i}><span className="text-stone-200">{ACTIVITIES[r.kind].name}</span> (wk {r.week}, {r.guests.length} guests){r.outcomes.length ? ` — ${r.outcomes.join('; ')}` : ''}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Planner({ s, kind }: { s: GameState; kind: ActivityKind }) {
  const def = ACTIVITIES[kind];
  const honorees = honoreeOptions(s, kind);
  const [honoree, setHonoree] = useState<string | undefined>(honorees[0]?.id);
  const [guests, setGuests] = useState<string[]>(() => suggestGuests(s, kind));
  const pool = useMemo(() => eligibleGuests(s, kind), [s, kind]);
  const groups = useMemo(() => {
    const g: Partial<Record<GuestGroup, typeof pool>> = {};
    for (const c of pool) {
      const k = guestGroup(s, c)!;
      (g[k] ??= []).push(c);
    }
    for (const k of Object.keys(g) as GuestGroup[]) g[k]!.sort((a, b) => opinion(s, b.id, s.playerId) - opinion(s, a.id, s.playerId));
    return g;
  }, [pool, s]);
  const toggle = (id: string) => setGuests((g) => (g.includes(id) ? g.filter((x) => x !== id) : g.length >= def.maxGuests ? g : [...g, id]));
  const needs = kind === 'wedding' || kind === 'christening' || kind === 'funeral';
  return (
    <section className="relative isolate overflow-hidden rounded-md border border-noir-700 bg-noir-800/40 p-3" data-testid="activity-planner">
      <Backdrop k={ACTIVITY_ART[kind]} opacity={0.18} className="-z-10" contain={kind === 'sunday'} />
      <div className="panel-title text-base">{def.name}</div>
      <p className="text-xs text-stone-400">{def.text}</p>
      {needs && (
        <div className="mt-2">
          <Label>{kind === 'wedding' ? 'Whose wedding' : kind === 'christening' ? 'Which baby' : 'Whose wake'}</Label>
          {honorees.length === 0 ? <div className="text-xs text-amber-400">{activityBlock(s, kind, ['x'])}</div> : (
            <select className="mt-1 block w-full min-w-0 max-w-sm truncate rounded bg-noir-900 border border-noir-600 p-1.5 text-sm" value={honoree} onChange={(e) => setHonoree(e.target.value)}>
              {honorees.map((c) => <option key={c.id} value={c.id}>{displayName(c)}{c.spouseId && kind === 'wedding' ? ` & ${s.characters[c.spouseId]?.firstName}` : ''}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <Label>Guests ({guests.length}/{def.maxGuests})</Label>
        <span className="text-xs text-stone-400">Cost {fmt$(activityCost(kind, guests.length))}</span>
      </div>
      <div className="mt-1 grid gap-2 md:grid-cols-2 max-h-[340px] overflow-y-auto pr-1">
        {(Object.keys(groups) as GuestGroup[]).map((g) => (
          <div key={g}>
            <div className="text-[11px] text-gold-500 font-semibold">{GROUP_NAME[g]}</div>
            <ul className="space-y-1 mt-0.5">
              {groups[g]!.slice(0, 14).map((c) => {
                const on = guests.includes(c.id);
                return (
                  <li key={c.id}>
                    <label className={`flex items-center gap-2 rounded border px-1.5 py-1 cursor-pointer ${on ? 'border-gold-500 bg-gold-500/10' : 'border-noir-700 hover:border-noir-600'}`}>
                      <input type="checkbox" className="accent-amber-500" checked={on} onChange={() => toggle(c.id)} data-testid="guest-toggle" />
                      <Face s={s} c={c} size={26} />
                      <span className="min-w-0 flex-1 text-xs">
                        <span className="block truncate text-stone-200">{displayName(c)}</span>
                        <span className="block truncate text-[10px] text-stone-500">{c.office ?? houseLabel(s, c) ?? (c.rank !== 'civilian' ? c.rank : '')}{c.dynasty ? ` · ${ageOn(c.birth, s.date)}` : ''}</span>
                      </span>
                      <OpinionBadge v={opinion(s, c.id, s.playerId)} />
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {!s.gameOver && <div className="mt-2"><ActionCard s={s} action={{ kind: 'dynasty', op: { type: 'host', activity: kind, guests, honoreeId: needs ? honoree : undefined } }} /></div>}
    </section>
  );
}
