import { useState } from 'react';
import { expectedTake, owned, playerSlots, washCapacity } from '../../engine/business';
import { CATALOG, SHOP_KINDS } from '../../engine/catalog';
import { displayName } from '../../engine/characters';
import { UNWASHED_SAFE } from '../../engine/economy';
import { bankChecklist, casinoStatus, frontMan, hasBank } from '../../engine/goals';
import { reached } from '../../engine/history';
import { bookCapacity, LEND_AMOUNTS } from '../../engine/loans';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { PROP_GROUPS, groupOfBiz, type PropGroup } from '../../engine/propertyGroups';
import { ActionCard } from './Orders';

export function Businesses({ s }: { s: GameState }) {
  const mine = owned(s);
  const cap = washCapacity(s);
  const ours = s.districts.filter((d) => (d.influence.player ?? 0) >= 20);
  const [district, setDistrict] = useState(ours[0]?.id ?? 'boardwalk');
  const shopGroups = PROP_GROUPS.filter((g) => SHOP_KINDS.some((k) => groupOfBiz(k) === g.id));
  const [cat, setCat] = useState<PropGroup>(shopGroups[0]?.id ?? 'food');
  const slots = playerSlots(s, district);
  const weekly = mine.reduce((a, b) => a + expectedTake(s, b), 0);
  const upkeep = mine.reduce((a, b) => a + b.upkeep, 0);
  const fm = frontMan(s);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Businesses" value={`${mine.length}`} sub={`~${fmt$(weekly)}/wk take · ${fmt$(upkeep)} upkeep`} />
        <Stat label="Wash capacity" value={`${fmt$(cap)}/wk`} sub="dirty money the fronts can clean" />
        <Stat label="Unwashed cash" value={fmt$(s.unwashed)} sub={s.unwashed > UNWASHED_SAFE ? 'The IRS is noticing' : `safe under ${fmt$(UNWASHED_SAFE)}`} warn={s.unwashed > UNWASHED_SAFE} />
        <Stat label="Political favors" value={`${s.favors}`} sub="from bribes, blackmail, favors done" />
      </section>

      <section>
        <div className="panel-title">Open a business</div>
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          {shopGroups.map((g) => (
            <button key={g.id} className={`tab ${cat === g.id ? 'tab-active' : ''}`} onClick={() => setCat(g.id)} title={g.blurb}>{g.icon} {g.label}</button>
          ))}
          <select className="rounded bg-noir-900 border border-noir-600 p-1.5 text-sm ml-auto" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
            {s.districts.map((d) => {
              const sl = playerSlots(s, d.id);
              return <option key={d.id} value={d.id}>{d.name} — {sl.used}/{sl.max} storefronts</option>;
            })}
          </select>
        </div>
        <p className="text-xs text-stone-500 mt-1">
          You can run {slots.max} places in {s.districts.find((d) => d.id === district)?.name} ({slots.used} used) — your share of its storefronts. Push into a district to open more.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SHOP_KINDS.filter((k) => groupOfBiz(k) === cat).map((k) => (
            <div key={k}>
              <ActionCard s={s} action={{ kind: 'buyBusiness', biz: k, district }} label={`${CATALOG[k].name} — ${fmt$(CATALOG[k].cost)}`} />
              <p className="text-[11px] text-stone-500 px-1 mt-0.5 italic">{CATALOG[k].blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="panel-title">The shylock book</div>
        <p className="text-xs text-stone-500">Five points a week on money put on the street. {bookCapacity(s) ? `Room for ${bookCapacity(s)} loans.` : 'Open a shylock book (a racket) to lend.'}</p>
        {s.loans.length > 0 && (
          <ul className="mt-1 divide-y divide-noir-800 text-sm">
            {s.loans.map((l) => (
              <li key={l.id} className="py-1 flex justify-between gap-2">
                <span className="text-stone-300">{l.borrower}{l.collateralName ? <span className="text-stone-500"> · put up {l.collateralName}</span> : null}</span>
                <span className={`text-xs tabular-nums ${l.weeksLate ? 'text-red-400' : 'text-stone-400'}`}>
                  {fmt$(l.principal)} · {fmt$(l.vig)}/wk {l.weeksLate ? `· ${l.weeksLate} wk late` : `· due wk ${l.dueWeek}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {LEND_AMOUNTS.map((a) => <ActionCard key={a} s={s} action={{ kind: 'lend', amount: a }} compact />)}
        </div>
      </section>

      <section>
        <div className="panel-title">The long game</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-noir-700 bg-noir-800/50 p-3">
            <div className="font-semibold text-stone-100">A front man</div>
            <p className="text-xs text-stone-400">{fm ? `${displayName(fm)} signs for the family. Record: ${fm.record ?? 0}. File: ${fm.evidence ?? 0}/100.` : 'Charters and licenses need a clean name that is not yours.'}</p>
            {!fm && <div className="mt-2"><ActionCard s={s} action={{ kind: 'findFrontMan' }} compact /></div>}
          </div>
          <div className="rounded-md border border-noir-700 bg-noir-800/50 p-3">
            <div className="font-semibold text-stone-100">Open a bank</div>
            {hasBank(s) ? <p className="text-xs text-emerald-300">Shore Federal Savings & Loan is yours.</p> : (
              <>
                <ul className="text-xs mt-1 space-y-0.5">
                  {bankChecklist(s).map((c) => <li key={c.label} className={c.ok ? 'text-emerald-300' : 'text-stone-400'}>{c.ok ? '✓' : '○'} {c.label}</li>)}
                </ul>
                <div className="mt-2"><ActionCard s={s} action={{ kind: 'charterBank' }} compact /></div>
              </>
            )}
          </div>
          <div className="rounded-md border border-noir-700 bg-noir-800/50 p-3 sm:col-span-2">
            <div className="font-semibold text-stone-100">The casino dream</div>
            <p className="text-xs text-stone-400">{casinoStatus(s)}</p>
            <p className="text-[11px] text-stone-500 mt-1">New Jersey voters decide on casinos in 1974 and 1976. The first Atlantic City casino can open in 1978. Until then, land is cheap.</p>
            {s.goals.casinoStage < 2 && !s.goals.landSold && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <ActionCard s={s} action={{ kind: 'casino' }} compact />
                {s.goals.casinoStage === 1 && reached(s, 'referendum1976') && <ActionCard s={s} action={{ kind: 'casino', sell: true }} compact />}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function SellButton({ s, id }: { s: GameState; id: string }) {
  return (
    <details className="text-right">
      <summary className="text-[11px] text-stone-500 cursor-pointer hover:text-gold-300 list-none">sell…</summary>
      <div className="mt-1 text-left w-72 max-w-[80vw] ml-auto">
        <ActionCard s={s} action={{ kind: 'sellBusiness', businessId: id }} compact />
      </div>
    </details>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-md bg-noir-800 border border-noir-700 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${warn ? 'text-red-400' : 'text-gold-300'}`}>{value}</div>
      {sub && <div className="text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}
