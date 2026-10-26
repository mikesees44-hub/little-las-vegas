import { useState } from 'react';
import { forfeitureLaw, LUX, LUX_BY_ID, LUX_CAT_LABEL, luxPrice, owned, resaleValue, weeklyUpkeep, type LuxCat } from '../../engine/goodlife';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { fmt$ } from '../format';

const CATS: LuxCat[] = ['home', 'car', 'truck', 'boat', 'toy'];

/** The Good Life: what the house owns for itself, and the showroom (period prices). */
export function GoodLifePanel({ s }: { s: GameState }) {
  const [cat, setCat] = useState<LuxCat>('home');
  const mine = owned(s);
  const worth = mine.reduce((a, o) => a + resaleValue(s, o), 0);
  return (
    <div className="space-y-5" data-testid="good-life">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Your pocket" value={fmt$(s.tribute?.acct.personal ?? 0)} sub="Pays for all of this; short, the Family covers the rest" />
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
      <section>
        <div className="panel-title">The showroom, {s.date.y}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATS.map((c) => <button key={c} className={`tab ${cat === c ? 'tab-active' : ''}`} onClick={() => setCat(c)}>{LUX_CAT_LABEL[c]}</button>)}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {LUX.filter((x) => x.cat === cat && (x.maxYear ?? 9999) >= s.date.y).map((it) => (
            <ActionCard key={it.id} s={s} action={{ kind: 'econ', op: { type: 'luxBuy', item: it.id } }} label={`${it.name} — ${fmt$(luxPrice(s, it))}`} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-stone-500">Homes and the boat show on the map. A man with no business to explain it and a new Cadillac is exactly what the IRS looks for; after RICO (October 1970), the government can seize what it ties to the rackets.</p>
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
