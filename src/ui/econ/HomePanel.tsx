import type { Lot } from '../../engine/econState';
import { famName, houseWord, homeHousehold, housingCounts, HOME_USES, homeRent, isHomeUse, ZONE_TOWN } from '../../engine/housing';
import { ageOf, present } from '../../engine/livingState';
import { buildCost, USES_BY_ID } from '../../engine/property';
import { scheduleWeeks } from '../../engine/construction';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { fmt$ } from '../format';

/**
 * A house lot on the card: who lives there and how (owns or rents, and from
 * whom), a build under way and who pays for it, and the boss's own orders for
 * a house of his: rent it to a family, sell it to one, or build on his empty
 * lot. Summary first; the rest under More… (never removed, only folded).
 */
export function HomePanel({ s, l }: { s: GameState; l: Lot }) {
  const mine = l.status === 'owned';
  const hh = homeHousehold(s, l);
  const L = s.living;
  const members = hh && L ? hh.members.map((id) => L.people[id]).filter((p) => present(p, s.week)) : [];
  const adults = members.filter((p) => ageOf(p, s.date.y, s.date.m) >= 18).length;
  const build = s.housing?.builds[l.id];
  const isHouse = isHomeUse(l.use) && l.stage === 'open';
  return (
    <div className="space-y-2 rounded border border-noir-700 bg-noir-900/60 p-2" data-testid="home-panel">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{ZONE_TOWN[l.zone] ?? 'The island'} · a house lot</div>
      {!l.use && (
        <div className="text-sm" data-testid="home-vacant">
          {l.status === 'sale' ? <><span className="text-emerald-300 font-semibold">For sale: empty lot, {fmt$(l.price)}</span><div className="text-xs text-stone-400">Families in town buy lots like this to build their own houses. Buy it and the Family pays the seller; build on it yourself, or sell it on.</div></>
            : mine ? <span className="text-stone-300">Your empty lot. Build a house on it (you pay the builder), then rent it or sell it to a family.</span>
              : <span className="text-stone-300">Empty ground, not for sale.</span>}
        </div>
      )}
      {build && hh && (
        <div className="text-xs text-amber-300" data-testid="home-build">
          Going up: {famName(hh)}' {houseWord(build.use)}, built by {build.bname}{build.acct === 'family' ? ' (your company: the Family earns from the job)' : ''}. They have paid {fmt$(build.paid)} of {fmt$(build.cost)}, out of their own money{build.short ? ` — stopped, they are short (${build.short} wk)` : ''}.
        </div>
      )}
      {isHouse && (
        <div className="text-sm" data-testid="home-who">
          {hh ? <>
            <div className="text-stone-200">{hh.name.charAt(0).toUpperCase() + hh.name.slice(1)} live here: {adults} grown{members.length - adults ? `, ${members.length - adults} children` : ''}.</div>
            <div className="text-xs text-stone-400">{l.hhOwns ? 'They own it.' : mine ? `They rent it from you: ${fmt$(homeRent(s, l))}/wk, out of their own wages.` : 'They rent it from a landlord.'}</div>
          </> : <div className="text-stone-400">Nobody lives here{l.status === 'sale' ? ` — for sale, ${fmt$(l.price)}` : mine ? '' : ' — for rent'}.</div>}
        </div>
      )}
      {mine && isHouse && (
        <div className="space-y-1.5" data-testid="home-orders">
          {!l.hh && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'home', cmd: { k: 'rent', lotId: l.id } } }} compact />}
          <ActionCard s={s} action={{ kind: 'econ', op: { type: 'home', cmd: { k: 'sell', lotId: l.id, price: 'market' } } }} compact />
          <details className="text-xs">
            <summary className="cursor-pointer text-stone-400">More… (a quick sale, top dollar)</summary>
            <div className="mt-1.5 space-y-1.5">
              <ActionCard s={s} action={{ kind: 'econ', op: { type: 'home', cmd: { k: 'sell', lotId: l.id, price: 'quick' } } }} compact />
              <ActionCard s={s} action={{ kind: 'econ', op: { type: 'home', cmd: { k: 'sell', lotId: l.id, price: 'high' } } }} compact />
            </div>
          </details>
        </div>
      )}
      {mine && !l.use && (
        <div className="space-y-1.5" data-testid="home-build-orders">
          <div className="text-[11px] text-stone-400">Build a house (you pay the builder, stage by stage, out of Family money; about {scheduleWeeks(s, l, USES_BY_ID.bungalow)} weeks for a bungalow, {fmt$(buildCost(l, USES_BY_ID.bungalow, s))}).</div>
          <ActionCard s={s} action={{ kind: 'econ', op: { type: 'build', lotId: l.id, use: 'bungalow' } }} compact />
          <details className="text-xs">
            <summary className="cursor-pointer text-stone-400">More… (a cottage, a house, a duplex, a shore house)</summary>
            <div className="mt-1.5 space-y-1.5">
              {HOME_USES.filter((u) => u !== 'bungalow').map((u) => <ActionCard key={u} s={s} action={{ kind: 'econ', op: { type: 'build', lotId: l.id, use: u } }} compact />)}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

/** The town's houses at a glance (the Neighborhoods screen and the Loan desk). */
export function HousesSummary({ s }: { s: GameState }) {
  const c = housingCounts(s);
  const st = s.housing?.stats;
  const L = s.living;
  const builds = Object.values(s.housing?.builds ?? {});
  const lots = new Map((s.econ?.lots ?? []).map((l) => [l.id, l]));
  return (
    <div className="space-y-2 text-sm" data-testid="houses-summary">
      <div className="text-stone-200">{c.houses} houses ({c.lived} lived in) · {c.forSale} empty lots for sale · {c.building} going up</div>
      {st && <div className="text-xs text-stone-400">Since you have been watching: {st.started} families broke ground, {st.built} moved into houses they built, {st.sold} houses changed hands, {st.foreclosed} foreclosed; Chemical Bank said yes {st.bankYes} times and no {st.bankNo}.</div>}
      {builds.length > 0 && L && (
        <details className="text-xs">
          <summary className="cursor-pointer text-stone-400">More… the houses going up ({builds.length})</summary>
          <ul className="mt-1 space-y-0.5 text-stone-300">
            {builds.map((b) => { const l = lots.get(b.lot); const hh = L.hh[b.hh]; return <li key={b.lot}>{hh ? famName(hh) : 'A family'}: {houseWord(b.use)} at {l?.address} — {b.bname}{b.acct === 'family' ? ' (yours)' : ''}, {fmt$(b.paid)} of {fmt$(b.cost)} paid{b.short ? ', stalled' : ''}</li>; })}
          </ul>
        </details>
      )}
    </div>
  );
}
