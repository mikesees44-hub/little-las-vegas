import { pocketCash } from '../../engine/tributeState';
import { forfeitureLaw, LUX_BY_ID, LUX_CAT_LABEL, owned, resaleValue, weeklyUpkeep } from '../../engine/goodlife';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { fmt$ } from '../format';

/** The Good Life: what the house bought from the older catalog (the showroom itself is folded into The Store). */
export function GoodLifePanel({ s }: { s: GameState }) {
  const mine = owned(s);
  const worth = mine.reduce((a, o) => a + resaleValue(s, o), 0);
  return (
    <div className="space-y-5" data-testid="good-life">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Your pocket" value={fmt$(pocketCash(s))} sub="Pays for all of this. If it runs short, you are asked first before any Family money is used" />
        <Stat label="Things you own" value={`${mine.length}`} />
        <Stat label="Worth today" value={fmt$(worth)} />
        <Stat label="Upkeep" value={`${fmt$(weeklyUpkeep(s))}/wk`} sub="From your pocket" />
        <Stat label="Federal heat" value={`${s.heat.federal}`} warn={s.heat.federal >= 50} sub={forfeitureLaw(s) ? 'RICO: assets can be seized' : 'Unexplained wealth draws the IRS'} />
      </section>
      <section>
        <div className="panel-title">What the house owns</div>
        {mine.length === 0 ? <p className="text-sm text-stone-500">Nothing yet. The money sits in a coffee can.</p> : (
          <ul className="divide-y divide-noir-800 text-sm">
            {mine.map((o) => {
              const it = LUX_BY_ID[o.id];
              return (
                <li key={o.uid} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <div className="text-stone-200">{it?.name}</div>
                    <div className="text-[11px] text-stone-500">{LUX_CAT_LABEL[it.cat]} · bought {o.year} for {fmt$(o.paid)} · worth {fmt$(resaleValue(s, o))}{it.pin ? ` · ${it.pin.place}` : ''} · passes to the heir</div>
                  </div>
                  <div className="w-full sm:w-64"><ActionCard s={s} action={{ kind: 'econ', op: { type: 'luxSell', uid: o.uid } }} compact /></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section data-testid="good-life-moved">
        <div className="panel-title">The showroom moved</div>
        <p className="text-sm text-stone-400">Homes, cars, the boat and the toys are sold in <b>The Store</b> now (You → The Store), with everything else money buys. What you bought here is still yours: it counts in the Store, passes to the heir, and can be sold above.</p>
        <p className="mt-2 text-[11px] text-stone-500">A man with no business to explain it and a new Cadillac is exactly what the IRS looks for; after RICO (October 1970), the government can seize what it ties to the rackets.</p>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-800/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`text-lg tabular-nums ${warn ? 'text-red-300' : 'text-gold-300'}`}>{value}</div>
      {sub && <div className="text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}
