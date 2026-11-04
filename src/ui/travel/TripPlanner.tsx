import { useMemo, useState } from 'react';
import { tripArt } from '../hood/art/sceneArt';
import { Card, CardHead, PlaceBanner, Section } from '../components/Layout';
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
import { defaultTransport, transportBlock, type TransportId } from '../../engine/transport';
import { lostDest } from '../../engine/vacation';
import { doorToDoor, TransportPicker } from './TransportPicker';

/** A plan names its way to go (the mode's usual one) so the planner and the quote agree. */
function withWay(s: GameState, p: TripPlan): TripPlan {
  const d = DESTS[p.destId];
  if (!d) return p;
  const ok = p.transport && !transportBlock(p.transport as TransportId, d, dayDate((s.week + (p.departIn ?? 0)) * 7)) ? p.transport : undefined;
  return { ...p, transport: ok ?? defaultTransport(p.mode, p.tier, d) };
}

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
  const [plan, setPlan] = useState<TripPlan>(() => withWay(s, suggestPlan(s, leaderId, destId, destId && DESTS[destId] && !DESTS[destId].resort ? 'business' : 'vacation')));
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
    const mode = DESTS[next.destId].modes.includes(next.mode) ? next.mode : fresh.mode;
    const way = mode === next.mode && next.transport && !transportBlock(next.transport as TransportId, DESTS[next.destId], dayDate((s.week + (next.departIn ?? 0)) * 7)) ? next.transport : defaultTransport(mode, next.tier, DESTS[next.destId]);
    setPlan({ ...fresh, tier: next.tier, departIn: next.departIn, guests: p.leaderId ? fresh.guests : next.guests.filter((g) => g !== next.leaderId), mode, transport: way, companionId: undefined, newCompanion: false, ...(mode === 'cars' && way !== 'crewcar' ? { cars: 1, driverIds: [] } : {}) });
  }

  // Havana stays on the list once it is gone — as what was lost.
  const dests = Object.values(DESTS).filter((x) => (plan.purpose === 'vacation' ? x.resort : !!x.cityId));
  const departDate = dayDate(q.departWeek * 7);
  dests.sort((a, b) => (RESORT_IDS.indexOf(a.id) + 1 || 99) - (RESORT_IDS.indexOf(b.id) + 1 || 99) || a.name.localeCompare(b.name));
  const nDays = plan.purpose === 'vacation' ? [3, 4, 5] : [1, 2, 3];
  const grouped = GROUP_ORDER.map((g) => ({ g, people: pool.filter((c) => leader && groupOf(s, leader, c) === g) })).filter((x) => x.people.length);

  function toggleGuest(id: string) {
    set({ guests: plan.guests.includes(id) ? plan.guests.filter((x) => x !== id) : [...plan.guests, id], driverIds: plan.driverIds?.filter((x) => x !== id) });
  }
  function setCars(n: number) {
    set({ cars: n, driverIds: drivers.slice(0, n).map((c) => c.id) });
  }

  const kick = 'mb-1 block llv-kicker';
  return (
    <Modal onClose={onClose} wide>
      <div className="llv-d-shore llv-dom-scope p-4 sm:p-5 space-y-4" data-testid="trip-planner">
        <PlaceBanner art={tripArt(plan.destId, s.date.y)} d="shore" title={<>{d?.name ?? 'Somewhere'}</>}
          sub={<><span className="llv-kicker !text-[10px] llv-dom-ink">Plan a trip · {plan.purpose === 'vacation' ? 'a vacation' : 'business'}</span>{d && <span className="block italic">{d.blurb}</span>}</>}
          aside={<button type="button" className="llv-iconbtn bg-noir-950/70" onClick={onClose} aria-label="Close">✕</button>} />

        <Section domain="shore" title="Who, where and when" className="!mb-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-stone-400 block">
            <span className={kick}>Who leads it</span>
            <select className="w-full rounded bg-noir-800 border border-noir-600 px-2 py-1.5 text-sm text-stone-200" value={plan.leaderId} onChange={(e) => reset({ leaderId: e.target.value })} data-testid="trip-leader">
              {ours.map((c) => <option key={c.id} value={c.id} disabled={!!leaderBlock(s, c.id)}>{displayName(c)}{c.id === s.playerId ? ' (the boss)' : ''}{leaderBlock(s, c.id) ? ` — ${leaderBlock(s, c.id)}` : ''}</option>)}
            </select>
          </label>
          <div className="text-xs">
            <span className={kick}>What for</span>
            <div className="flex gap-1.5">
              {(['vacation', 'business'] as const).map((p) => (
                <button key={p} type="button" aria-pressed={plan.purpose === p} className="llv-pick flex-1 text-center text-sm" onClick={() => reset({ purpose: p, destId: p === 'vacation' ? 'catskills' : 'philadelphia' })}>{p === 'vacation' ? '☀ A vacation' : '✈ Business'}</button>
              ))}
            </div>
          </div>
          <label className="text-xs text-stone-400 block">
            <span className={kick}>Destination</span>
            <select className="w-full rounded bg-noir-800 border border-noir-600 px-2 py-1.5 text-sm text-stone-200" value={plan.destId} onChange={(e) => reset({ destId: e.target.value })} data-testid="trip-dest">
              {dests.map((x) => { const gone = x.id === 'havana' && !havanaOpen(departDate); return <option key={x.id} value={x.id} disabled={gone}>{x.name} — {gone ? lostDest(x.id, departDate) : x.region}{!gone && x.peak.includes(month) ? ' (high season)' : ''}</option>; })}
            </select>
          </label>
          <label className="text-xs text-stone-400 block">
            <span className={kick}>When</span>
            <select className="w-full rounded bg-noir-800 border border-noir-600 px-2 py-1.5 text-sm text-stone-200" value={plan.departIn ?? 0} onChange={(e) => set({ departIn: Number(e.target.value) })}>
              {[0, 1, 2, 4, 8, 13, 26].map((w) => { const dd = dayDate((s.week + w) * 7); return <option key={w} value={w}>{w === 0 ? 'This week' : `In ${w} weeks`} — {monthName(dd.m)} {dd.y}</option>; })}
            </select>
          </label>
        </div>
        </Section>

        <Section domain="shore" title="How you travel" className="!mb-0">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {MODE_IDS.map((m) => {
              const ok = d?.modes.includes(m);
              return (
                <button key={m} type="button" disabled={!ok} title={MODES[m].blurb} data-mode={m} aria-pressed={plan.mode === m} onClick={() => set({ mode: m, transport: d ? defaultTransport(m, plan.tier, d) : undefined, ...(m === 'cars' ? { cars: plan.cars ?? 1, driverIds: plan.driverIds?.length ? plan.driverIds : drivers.slice(0, plan.cars ?? 1).map((c) => c.id) } : {}) })}
                  className="llv-pick text-xs">
                  <span className="flex items-center gap-1.5 font-semibold"><ModeIcon mode={m} size={16} />{MODES[m].name}</span>
                  <span className="block text-[10px] text-stone-400">comfort {Math.round(MODES[m].comfort * 10)}/10 · seen {Math.round(MODES[m].conspicuous * 10)}/10</span>
                </button>
              );
            })}
          </div>
          {d && <TransportPicker dest={d} mode={plan.mode} tier={plan.tier} date={departDate} value={plan.transport as TransportId | undefined}
            onPick={(id) => set({ transport: id, ...(plan.mode === 'cars' ? (id === 'crewcar' ? { cars: plan.cars ?? 1, driverIds: plan.driverIds?.length ? plan.driverIds : drivers.slice(0, plan.cars ?? 1).map((c) => c.id) } : { cars: 1, driverIds: [] }) : {}) })} />}
          {plan.mode === 'cars' && (plan.transport ?? 'crewcar') === 'crewcar' && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-stone-400">Convoy:</span>
              {[1, 2, 3, 4].map((n) => <button key={n} type="button" aria-pressed={plan.cars === n} className="llv-pick llv-pick-sm" onClick={() => setCars(n)}>{n} car{n > 1 ? 's' : ''}</button>)}
              <span className="text-stone-500">Drivers: {(plan.driverIds ?? []).map((id) => s.characters[id]?.firstName).join(', ') || 'none free'}{(plan.cars ?? 1) > 1 ? ' — the extra cars are bodyguards' : ''}</span>
            </div>
          )}
          <div className="mt-3">
            <span className={kick}>Budget</span>
            <div className="flex gap-1.5">
              {(['modest', 'first', 'lavish'] as BudgetTier[]).map((t) => (
                <button key={t} type="button" aria-pressed={plan.tier === t} onClick={() => set({ tier: t })} className="llv-pick flex-1 text-center text-sm">{t === 'lavish' ? '★ ' : ''}{TIER_INFO[t].name}</button>
              ))}
            </div>
          </div>
        </Section>

        <Section domain="shore" title="Who comes along" aside={plan.guests.length ? `${plan.guests.length} invited` : undefined} className="!mb-0">
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
                        <label className="llv-pick flex cursor-pointer items-center gap-2 !py-1" data-on={on ? 'true' : undefined}>
                          <input type="checkbox" checked={on} onChange={() => toggleGuest(c.id)} />
                          <Face s={s} c={c} size={36} noSide />
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
        </Section>

        {plan.purpose === 'vacation' && leader && (
          <Card domain="romance" className="!p-2.5">
            <CardHead d="romance" title="A companion" sub="Who keeps him company, if anyone" />
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button type="button" aria-pressed={!plan.companionId && !plan.newCompanion} className="llv-pick llv-pick-sm" onClick={() => set({ companionId: undefined, newCompanion: false })}>Nobody</button>
              {lovers.map((c) => <button key={c.id} type="button" aria-pressed={plan.companionId === c.id} className="llv-pick llv-pick-sm" onClick={() => set({ companionId: c.id, newCompanion: false })}>{displayName(c)}</button>)}
              <button type="button" aria-pressed={!!plan.newCompanion} className="llv-pick llv-pick-sm" onClick={() => set({ newCompanion: true, companionId: undefined })} data-testid="new-companion">Ask a {leader.gender === 'M' ? 'lady' : 'gentleman'} friend from the 500 Club</button>
            </div>
            {plan.newCompanion && <AcceptanceLine a={newCompanionOdds(s, plan)} prefix="She says yes" />}
            {(plan.companionId || plan.newCompanion) && (
              <label className="mt-1.5 flex items-center gap-2 text-xs text-stone-300"><input type="checkbox" checked={!!plan.discreet} onChange={(e) => set({ discreet: e.target.checked })} />A room at another hotel (discreet: halves the risk, costs a room)</label>
            )}
            {(plan.companionId || plan.newCompanion) && leader.spouseId && plan.guests.includes(leader.spouseId) && <div className="text-[11px] text-red-300 mt-1">The wife and the other woman on the same trip. {pct(q.risks.discovery)} she finds out.</div>}
          </Card>
        )}

        {plan.purpose === 'vacation' && (
          <section className="text-xs flex flex-wrap items-center gap-1.5">
            <span className="llv-kicker mr-1">♫ Hire an act</span>
            <button type="button" aria-pressed={!plan.entertainer} className="llv-pick llv-pick-sm" onClick={() => set({ entertainer: undefined })}>None</button>
            {(Object.keys(ENTERTAINERS) as Entertainer[]).map((e) => <button key={e} type="button" title={ENTERTAINERS[e].text} aria-pressed={plan.entertainer === e} className="llv-pick llv-pick-sm" onClick={() => set({ entertainer: e })}>{ENTERTAINERS[e].name}</button>)}
          </section>
        )}

        {d && (
          <Section domain="shore" title="Day by day" className="!mb-0" aside={<span className="flex gap-1">{nDays.map((n) => <button key={n} type="button" aria-pressed={plan.days.length === n} className="llv-pick llv-pick-sm" onClick={() => { const acts = d.activities.filter((a) => !a.months || a.months.includes(month)); set({ days: Array.from({ length: n }, (_, i) => plan.days[i] ?? acts[i % acts.length].id) }); }}>{n} day{n > 1 ? 's' : ''}</button>)}</span>}>
            <ol className="space-y-1.5" data-testid="itinerary">
              {plan.days.map((id, i) => {
                const a = d.activities.find((x) => x.id === id);
                return (
                  <li key={i} className="llv-dom-row rounded px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-10 shrink-0 font-display text-[13px] font-bold llv-dom-ink">Day {i + 1}</span>
                      <select className="flex-1 min-w-0 rounded bg-noir-900 border border-noir-600 px-1.5 py-1 text-sm text-stone-200" value={id} onChange={(e) => set({ days: plan.days.map((x, j) => (j === i ? e.target.value : x)) })}>
                        {d.activities.map((x) => <option key={x.id} value={x.id} disabled={!!x.months && !x.months.includes(month)}>{x.name}{x.months && !x.months.includes(month) ? ' (not this month)' : ''}</option>)}
                      </select>
                    </div>
                    {a && <div className="text-[11px] text-stone-400 mt-0.5 pl-12">{a.text} <span className="text-stone-500">({a.tags.join(', ')})</span></div>}
                  </li>
                );
              })}
            </ol>
          </Section>
        )}

        <Card domain="shore" tone="attention" className="space-y-2" testid="trip-quote">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="text-stone-300">{q.out} day{q.out > 1 ? 's' : ''} there ({doorToDoor(q.hours)} door to door{q.transport ? `, ${q.transport.name.toLowerCase()}` : ''}), {q.stay} at {d?.name}, {q.back} back · arrives {q.arriveDate} · <b>{q.weeks} week{q.weeks > 1 ? 's' : ''}</b> away</span>
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
            {q.risks.stop >= 0.005 && <span className="chip-bad">{pct(q.risks.stop)} a trooper pulls you over</span>}
            {q.risks.weather >= 0.005 && <span className="chip-bad">{pct(q.risks.weather)} the weather costs a day</span>}
            {q.risks.manifest >= 0.005 && <span className="chip-bad">{pct(q.risks.manifest)} the passenger list reaches the Bureau</span>}
            {plan.leaderId === s.playerId && <span className="chip-bad">The boss away: capos get ideas, orders go through the chain</span>}
          </div>
          {q.block && <div className="text-xs text-red-400">{q.block}</div>}
          <TripWhy s={s} action={{ kind: 'travel', op: { type: 'trip', plan } }} />
        </Card>
        {/* The order stays in sight at the foot of the planner (it sat under the guest list, below the fold). */}
        <div className="sticky bottom-0 z-10 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 flex items-center gap-2 border-t llv-dom-border bg-noir-900/95 px-4 sm:px-5 py-2.5 backdrop-blur-sm" data-testid="trip-footer">
          <span className="min-w-0 flex-1 truncate text-[12px] text-stone-300"><b className="tabular-nums text-gold-300">{fmt$(q.cost)}</b> · {q.weeks} week{q.weeks > 1 ? 's' : ''} away{q.block ? <span className="text-red-300"> · {q.block}</span> : ''}</span>
          <button type="button" className="btn-secondary text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary text-sm" data-testid="trip-order" disabled={!!q.block} onClick={() => { queue({ kind: 'travel', op: { type: 'trip', plan } }); onClose(); }}>Order the trip</button>
        </div>
      </div>
    </Modal>
  );
}
