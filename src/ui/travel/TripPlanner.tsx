import { useMemo, useState } from 'react';
import { ageOn, monthName } from '../../engine/calendar';
import { displayName } from '../../engine/characters';
import { guestGroup } from '../../engine/activities';
import {
  companionPool, dayDate, driverPool, guestOdds, guestPool, isOurs, leaderBlock, newCompanionOdds, quoteTrip, suggestPlan,
} from '../../engine/travel';
import { DESTS, ENTERTAINERS, havanaOpen, MODE_IDS, MODES, RESORT_IDS, TIER_INFO } from '../../engine/travelDests';
import type { BudgetTier, Entertainer, TripPlan } from '../../engine/travelState';
import type { Character, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { Modal } from '../components/Modal';
import { AcceptanceLine, useOrders } from '../components/Orders';
import { Face } from '../components/People';
import { ModeIcon } from './icons';
import { TripWhy } from '../clarity/Pickers';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function groupOf(s: GameState, leader: Character, c: Character): string {
  if (c.id === leader.spouseId) return 'Spouse';
  if (c.dynasty) return ageOn(c.birth, s.date) < 16 ? 'Children' : 'Family';
  if (c.faction === 'player') return c.rank === 'capo' || c.rank === 'underboss' ? 'Capos' : 'Crew';
  const g = guestGroup(s, c);
  return g === 'rivals' ? 'Rivals (business on vacation)' : g === 'officials' ? 'Officials' : 'Other houses';
}
const GROUP_ORDER = ['Spouse', 'Children', 'Family', 'Capos', 'Crew', 'Rivals (business on vacation)', 'Officials', 'Other houses'];

/**
 * The trip planner: who goes, where, how, how lavishly, when, and what they
 * do each day — with the cost, the time away and the risks shown before you
 * order it.
 */
export function TripPlanner({ s, leaderId, destId, onClose }: { s: GameState; leaderId: string; destId?: string; onClose: () => void }) {
  const { queue } = useOrders();
  const ours = useMemo(() => Object.values(s.characters).filter((c) => c.alive && isOurs(s, c) && ageOn(c.birth, s.date) >= 16), [s]);
  const [plan, setPlan] = useState<TripPlan>(() => suggestPlan(s, leaderId, destId, destId && DESTS[destId] && !DESTS[destId].resort ? 'business' : 'vacation'));
  const set = (p: Partial<TripPlan>) => setPlan((x) => ({ ...x, ...p }));
  const leader = s.characters[plan.leaderId];
  const d = DESTS[plan.destId];
  const q = quoteTrip(s, plan);
  const month = dayDate(q.departWeek * 7 + q.out).m;
  const pool = guestPool(s, plan.leaderId);
  const lovers = companionPool(s, plan.leaderId);
  const drivers = driverPool(s, plan.leaderId).filter((c) => !plan.guests.includes(c.id));

  function reset(p: Partial<TripPlan>) {
    const next = { ...plan, ...p };
    const fresh = suggestPlan(s, next.leaderId, next.destId, next.purpose);
    setPlan({ ...fresh, tier: next.tier, departIn: next.departIn, guests: p.leaderId ? fresh.guests : next.guests.filter((g) => g !== next.leaderId), mode: DESTS[next.destId].modes.includes(next.mode) ? next.mode : fresh.mode, companionId: undefined, newCompanion: false });
  }

  const dests = Object.values(DESTS).filter((x) => (plan.purpose === 'vacation' ? x.resort : !!x.cityId) && (x.id !== 'havana' || havanaOpen(dayDate(q.departWeek * 7))));
  dests.sort((a, b) => (RESORT_IDS.indexOf(a.id) + 1 || 99) - (RESORT_IDS.indexOf(b.id) + 1 || 99) || a.name.localeCompare(b.name));
  const nDays = plan.purpose === 'vacation' ? [3, 4, 5] : [1, 2, 3];
  const grouped = GROUP_ORDER.map((g) => ({ g, people: pool.filter((c) => leader && groupOf(s, leader, c) === g) })).filter((x) => x.people.length);

  function toggleGuest(id: string) {
    set({ guests: plan.guests.includes(id) ? plan.guests.filter((x) => x !== id) : [...plan.guests, id], driverIds: plan.driverIds?.filter((x) => x !== id) });
  }
  function setCars(n: number) {
    set({ cars: n, driverIds: drivers.slice(0, n).map((c) => c.id) });
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5 space-y-4" data-testid="trip-planner">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Plan a trip</div>
            <h2 className="font-display text-2xl text-gold-400 leading-tight">{d?.name ?? 'Somewhere'}</h2>
            {d && <p className="text-xs text-stone-400 italic max-w-prose">{d.blurb}</p>}
          </div>
          <button className="text-xs text-stone-500 hover:text-gold-300" onClick={onClose}>Close ✕</button>
        </div>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-stone-400 space-y-1 block">
            <span className="block uppercase tracking-widest text-[10px] text-stone-500">Who leads it</span>
            <select className="w-full rounded bg-noir-800 border border-noir-600 px-2 py-1.5 text-sm text-stone-200" value={plan.leaderId} onChange={(e) => reset({ leaderId: e.target.value })} data-testid="trip-leader">
              {ours.map((c) => <option key={c.id} value={c.id} disabled={!!leaderBlock(s, c.id)}>{displayName(c)}{c.id === s.playerId ? ' (the boss)' : ''}{leaderBlock(s, c.id) ? ` — ${leaderBlock(s, c.id)}` : ''}</option>)}
            </select>
          </label>
          <div className="text-xs space-y-1">
            <span className="block uppercase tracking-widest text-[10px] text-stone-500">What for</span>
            <div className="flex gap-1">
              {(['vacation', 'business'] as const).map((p) => (
                <button key={p} className={`flex-1 rounded border px-2 py-1.5 text-sm ${plan.purpose === p ? 'border-gold-400 bg-gold-500/10 text-gold-300' : 'border-noir-600 text-stone-300'}`} onClick={() => reset({ purpose: p, destId: p === 'vacation' ? 'catskills' : 'philadelphia' })}>{p === 'vacation' ? 'A vacation' : 'Business'}</button>
              ))}
            </div>
          </div>
          <label className="text-xs text-stone-400 space-y-1 block">
            <span className="block uppercase tracking-widest text-[10px] text-stone-500">Destination</span>
            <select className="w-full rounded bg-noir-800 border border-noir-600 px-2 py-1.5 text-sm text-stone-200" value={plan.destId} onChange={(e) => reset({ destId: e.target.value })} data-testid="trip-dest">
              {dests.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.region}{x.peak.includes(month) ? ' (high season)' : ''}</option>)}
            </select>
          </label>
          <label className="text-xs text-stone-400 space-y-1 block">
            <span className="block uppercase tracking-widest text-[10px] text-stone-500">When</span>
            <select className="w-full rounded bg-noir-800 border border-noir-600 px-2 py-1.5 text-sm text-stone-200" value={plan.departIn ?? 0} onChange={(e) => set({ departIn: Number(e.target.value) })}>
              {[0, 1, 2, 4, 8, 13, 26].map((w) => { const dd = dayDate((s.week + w) * 7); return <option key={w} value={w}>{w === 0 ? 'This week' : `In ${w} weeks`} — {monthName(dd.m)} {dd.y}</option>; })}
            </select>
          </label>
        </section>

        <section>
          <div className="uppercase tracking-widest text-[10px] text-stone-500 mb-1">How</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {MODE_IDS.map((m) => {
              const ok = d?.modes.includes(m);
              return (
                <button key={m} disabled={!ok} title={MODES[m].blurb} data-mode={m} onClick={() => set({ mode: m, ...(m === 'cars' ? { cars: plan.cars ?? 1, driverIds: plan.driverIds?.length ? plan.driverIds : drivers.slice(0, plan.cars ?? 1).map((c) => c.id) } : {}) })}
                  className={`rounded border px-2 py-1.5 text-left text-xs disabled:opacity-30 ${plan.mode === m ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'border-noir-600 text-stone-300 hover:border-gold-600'}`}>
                  <span className="flex items-center gap-1.5 font-semibold"><ModeIcon mode={m} size={14} />{MODES[m].name}</span>
                  <span className="block text-[10px] text-stone-500">comfort {Math.round(MODES[m].comfort * 10)}/10 · seen {Math.round(MODES[m].conspicuous * 10)}/10</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-stone-500 mt-1">{MODES[plan.mode].blurb}</p>
          {plan.mode === 'cars' && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-stone-400">Convoy:</span>
              {[1, 2, 3, 4].map((n) => <button key={n} className={`rounded border px-2 py-0.5 ${plan.cars === n ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-400'}`} onClick={() => setCars(n)}>{n} car{n > 1 ? 's' : ''}</button>)}
              <span className="text-stone-500">Drivers: {(plan.driverIds ?? []).map((id) => s.characters[id]?.firstName).join(', ') || 'none free'}{(plan.cars ?? 1) > 1 ? ' — the extra cars are bodyguards' : ''}</span>
            </div>
          )}
        </section>

        <section>
          <div className="uppercase tracking-widest text-[10px] text-stone-500 mb-1">Budget</div>
          <div className="flex gap-1.5">
            {(['modest', 'first', 'lavish'] as BudgetTier[]).map((t) => (
              <button key={t} onClick={() => set({ tier: t })} className={`flex-1 rounded border px-2 py-1.5 text-sm ${plan.tier === t ? 'border-gold-400 bg-gold-500/10 text-gold-300' : 'border-noir-600 text-stone-300'}`}>{TIER_INFO[t].name}</button>
            ))}
          </div>
        </section>

        <section>
          <div className="uppercase tracking-widest text-[10px] text-stone-500 mb-1">Guests</div>
          {grouped.length === 0 && <div className="text-xs text-stone-500">Nobody free to come.</div>}
          <div className="grid gap-2 sm:grid-cols-2">
            {grouped.map(({ g, people }) => (
              <div key={g}>
                <div className="text-[11px] text-stone-400 mb-0.5">{g}</div>
                <ul className="space-y-1">
                  {people.slice(0, 8).map((c) => {
                    const on = plan.guests.includes(c.id);
                    const odds = guestOdds(s, plan, c.id);
                    return (
                      <li key={c.id}>
                        <label className={`flex items-center gap-2 rounded border px-2 py-1 cursor-pointer ${on ? 'border-gold-500/70 bg-gold-500/5' : 'border-noir-700'}`}>
                          <input type="checkbox" checked={on} onChange={() => toggleGuest(c.id)} />
                          <Face s={s} c={c} size={28} />
                          <span className="text-sm text-stone-200 truncate">{displayName(c)}</span>
                          <span className={`ml-auto text-[11px] ${odds.chance >= 0.6 ? 'text-emerald-300' : odds.chance >= 0.35 ? 'text-amber-300' : 'text-red-300'}`} title={odds.reasons.map((r) => `${r.value > 0 ? '+' : ''}${r.value} ${r.label}`).join(', ')}>{pct(odds.chance)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {plan.purpose === 'vacation' && leader && (
          <section className="rounded border border-noir-700 p-2">
            <div className="uppercase tracking-widest text-[10px] text-stone-500 mb-1">Companion</div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button className={`rounded border px-2 py-1 ${!plan.companionId && !plan.newCompanion ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-400'}`} onClick={() => set({ companionId: undefined, newCompanion: false })}>Nobody</button>
              {lovers.map((c) => <button key={c.id} className={`rounded border px-2 py-1 ${plan.companionId === c.id ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-300'}`} onClick={() => set({ companionId: c.id, newCompanion: false })}>{displayName(c)}</button>)}
              <button className={`rounded border px-2 py-1 ${plan.newCompanion ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-300'}`} onClick={() => set({ newCompanion: true, companionId: undefined })} data-testid="new-companion">Ask a {leader.gender === 'M' ? 'lady' : 'gentleman'} friend from the 500 Club</button>
            </div>
            {plan.newCompanion && <AcceptanceLine a={newCompanionOdds(s, plan)} prefix="She says yes" />}
            {(plan.companionId || plan.newCompanion) && (
              <label className="mt-1.5 flex items-center gap-2 text-xs text-stone-300"><input type="checkbox" checked={!!plan.discreet} onChange={(e) => set({ discreet: e.target.checked })} />A room at another hotel (discreet: halves the risk, costs a room)</label>
            )}
            {(plan.companionId || plan.newCompanion) && leader.spouseId && plan.guests.includes(leader.spouseId) && <div className="text-[11px] text-red-300 mt-1">The wife and the other woman on the same trip. {pct(q.risks.discovery)} she finds out.</div>}
          </section>
        )}

        {plan.purpose === 'vacation' && (
          <section className="text-xs flex flex-wrap items-center gap-1.5">
            <span className="uppercase tracking-widest text-[10px] text-stone-500 mr-1">Hire an act</span>
            <button className={`rounded border px-2 py-0.5 ${!plan.entertainer ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-400'}`} onClick={() => set({ entertainer: undefined })}>None</button>
            {(Object.keys(ENTERTAINERS) as Entertainer[]).map((e) => <button key={e} title={ENTERTAINERS[e].text} className={`rounded border px-2 py-0.5 ${plan.entertainer === e ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-300'}`} onClick={() => set({ entertainer: e })}>{ENTERTAINERS[e].name}</button>)}
          </section>
        )}

        {d && (
          <section>
            <div className="flex items-center gap-2 mb-1">
              <span className="uppercase tracking-widest text-[10px] text-stone-500">Itinerary</span>
              {nDays.map((n) => <button key={n} className={`text-[11px] rounded border px-1.5 ${plan.days.length === n ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-400'}`} onClick={() => { const acts = d.activities.filter((a) => !a.months || a.months.includes(month)); set({ days: Array.from({ length: n }, (_, i) => plan.days[i] ?? acts[i % acts.length].id) }); }}>{n} day{n > 1 ? 's' : ''}</button>)}
            </div>
            <ol className="space-y-1.5" data-testid="itinerary">
              {plan.days.map((id, i) => {
                const a = d.activities.find((x) => x.id === id);
                return (
                  <li key={i} className="rounded border border-noir-700 bg-noir-800/60 px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-stone-500 w-10 shrink-0">Day {i + 1}</span>
                      <select className="flex-1 min-w-0 rounded bg-noir-900 border border-noir-600 px-1.5 py-1 text-sm text-stone-200" value={id} onChange={(e) => set({ days: plan.days.map((x, j) => (j === i ? e.target.value : x)) })}>
                        {d.activities.map((x) => <option key={x.id} value={x.id} disabled={!!x.months && !x.months.includes(month)}>{x.name}{x.months && !x.months.includes(month) ? ' (not this month)' : ''}</option>)}
                      </select>
                    </div>
                    {a && <div className="text-[11px] text-stone-400 mt-0.5 pl-12">{a.text} <span className="text-stone-500">({a.tags.join(', ')})</span></div>}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section className="rounded border border-gold-600/40 bg-noir-900/60 p-3 space-y-2" data-testid="trip-quote">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-stone-300">{q.out} day{q.out > 1 ? 's' : ''} there, {q.stay} at {d?.name}, {q.back} back · arrives {q.arriveDate} · <b>{q.weeks} week{q.weeks > 1 ? 's' : ''}</b> away</span>
            <span className="text-gold-300 font-semibold tabular-nums">{fmt$(q.cost)}</span>
          </div>
          <ul className="text-[11px] text-stone-400 space-y-0.5">
            {q.lines.map((l, i) => <li key={i} className="flex justify-between gap-2"><span>{l.label}</span><span className="tabular-nums">{fmt$(l.amount)}</span></li>)}
          </ul>
          <div className="flex flex-wrap gap-1 text-[11px]">
            <span className="chip-good">−{q.relief} stress for {leader?.firstName}</span>
            {q.season !== 'none' && <span className={q.season === 'peak' ? 'chip-bad' : 'chip-good'}>{q.season === 'peak' ? 'High season: prices up' : 'Off season: cheaper'}</span>}
            {q.risks.sighting >= 0.005 && <span className="chip-bad">{pct(q.risks.sighting)} seen by the Feds</span>}
            {q.risks.tail >= 0.005 && <span className="chip-bad">{pct(q.risks.tail)} tailed</span>}
            {q.risks.accident >= 0.005 && <span className="chip-bad">{pct(q.risks.accident)} accident</span>}
            {q.risks.discovery >= 0.005 && <span className="chip-bad">{pct(q.risks.discovery)} the wife finds out</span>}
            {plan.leaderId === s.playerId && <span className="chip-bad">The boss away: capos get ideas, orders go through the chain</span>}
          </div>
          {q.block && <div className="text-xs text-red-400">{q.block}</div>}
          <TripWhy s={s} action={{ kind: 'travel', op: { type: 'trip', plan } }} />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost text-sm" onClick={onClose}>Cancel</button>
            <button className="btn-gold text-sm" data-testid="trip-order" disabled={!!q.block} onClick={() => { queue({ kind: 'travel', op: { type: 'trip', plan } }); onClose(); }}>Order the trip</button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
