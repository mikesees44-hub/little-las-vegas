import { useMemo, useState } from 'react';
import {
  declaredWeekly, effectSummary, heads, lavishness, seenWeekly, spendBlock, spendOwned, spendPrice, spendResale, spendUpkeep, spendUpkeepByPot, stockLeft, whoNotices,
} from '../../engine/spend';
import { GROUP_LABEL, SPEND, SPEND_BY_ID, SPEND_CAT_LABEL, SPEND_CATS, type SpendCat, type SpendGroup, type SpendItem } from '../../engine/spendData';
import { pocketCash } from '../../engine/tributeState';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { fmt$ } from '../format';

type PotFilter = 'all' | 'pocket' | 'family';
type Sort = 'cat' | 'low' | 'high';

const KIND_WORD: Record<SpendItem['kind'], string> = { own: 'Yours to keep', svc: 'On retainer', once: 'An occasion' };

/** Does an item match the search words (name, blurb, category, who notices, what it does)? */
export function spendMatches(it: SpendItem, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${it.name} ${it.blurb} ${SPEND_CAT_LABEL[it.cat]} ${whoNotices(it).join(' ')} ${effectSummary(it).join(' ')} ${it.gift ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * SPEND: the whole catalog (spendData.ts), what the boss's own Pocket pays for
 * and what the Family's money pays for, side by side and never confused. Filter
 * by pot and category, search by anything, open a line to see what it does and
 * who notices, and queue it like any other order.
 */
export function SpendPanel({ s }: { s: GameState }) {
  const [pot, setPot] = useState<PotFilter>('all');
  const [cat, setCat] = useState<SpendCat | 'all'>('all');
  const [q, setQ] = useState('');
  const [now, setNow] = useState(false);
  const [sort, setSort] = useState<Sort>('cat');
  const [open, setOpen] = useState<string | undefined>();

  const blocks = useMemo(() => Object.fromEntries(SPEND.map((it) => [it.id, spendBlock(s, it)])), [s]);
  const base = SPEND.filter((it) => (pot === 'all' || it.pot === pot) && spendMatches(it, q) && (!now || !blocks[it.id]) && !/^Gone after/.test(blocks[it.id] ?? ''));
  const counts = Object.fromEntries(SPEND_CATS.map((c) => [c, base.filter((it) => it.cat === c).length])) as Record<SpendCat, number>;
  const list = base.filter((it) => cat === 'all' || it.cat === cat);
  if (sort !== 'cat') list.sort((a, b) => (spendPrice(s, a) - spendPrice(s, b)) * (sort === 'low' ? 1 : -1));
  else list.sort((a, b) => SPEND_CATS.indexOf(a.cat) - SPEND_CATS.indexOf(b.cat));

  const up = spendUpkeepByPot(s);
  const mine = spendOwned(s);
  const sp = s.spend;
  const declared = declaredWeekly(s);
  const seen = seenWeekly(s);
  const lav = lavishness(s);
  const irs = Math.round(sp?.irs ?? 0);
  const standing = Object.entries(sp?.standing ?? {}).filter(([, v]) => v) as [SpendGroup, number][];

  return (
    <div className="space-y-5" data-testid="spend-panel">
      <section className="grid gap-2 sm:grid-cols-2" data-testid="spend-pots">
        <Pot testid="spend-pot-pocket" label="Your pocket" value={pocketCash(s)} upkeep={up.pocket} tone="gold"
          text="Your own money: the cars, the clothes, the house, your family's parties, your vices. If it runs short you are asked before any Family money is used, and the capos notice a boss who dips." />
        <Pot testid="spend-pot-family" label="Family money" value={s.money} upkeep={up.family} tone="sky"
          text="The Family's treasury: the pad, the lawyers, the fronts, and what the crew is owed. Spend it on the Family, not on yourself." />
      </section>

      <section className="rounded border border-noir-700 bg-noir-800/60 px-3 py-2" data-testid="spend-irs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">What the IRS sees</div>
          <div className="text-[11px] text-stone-500">{sp?.audits ? `${sp.audits} audit${sp.audits === 1 ? '' : 's'} so far` : 'Never audited'}</div>
        </div>
        <div className="mt-1 text-sm text-stone-300">
          You live like <span className={lav > 1.2 ? 'text-red-300' : 'text-gold-300'}>{fmt$(seen)}/wk</span> and can explain <span className="text-gold-300">{fmt$(declared)}/wk</span>
          {lav > 1.2 ? <span className="text-red-300"> — beyond your means on paper.</span> : <span className="text-stone-500"> — nothing to see.</span>}
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded bg-noir-900" title={`Audit pressure ${irs}/100`}>
          <div className={`h-full ${irs >= 60 ? 'bg-red-500' : irs >= 30 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${Math.min(100, irs)}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-stone-500">Audit pressure {irs}/100. At 100 the IRS does a net-worth audit: back taxes, penalties, and a file for the FBI. Fronts, an accountant and a respectable return keep it down.</div>
        {standing.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1" data-testid="spend-standing">
            {standing.map(([g, v]) => <span key={g} className="rounded bg-noir-900 px-1.5 py-0.5 text-[11px] text-stone-300">{GROUP_LABEL[g]} {v > 0 ? '+' : ''}{v}</span>)}
          </div>
        )}
      </section>

      {mine.length > 0 && (
        <section data-testid="spend-owned">
          <div className="panel-title">What you have and who you keep</div>
          <ul className="divide-y divide-noir-800 text-sm">
            {mine.map((o) => {
              const it = SPEND_BY_ID[o.id];
              if (!it) return null;
              return (
                <li key={o.uid} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <div className="min-w-0">
                    <div className="text-stone-200">{it.name} <PotBadge pot={o.pot} /></div>
                    <div className="text-[11px] text-stone-500">
                      {it.kind === 'svc' ? `On retainer since ${o.year} · ${fmt$(spendUpkeep(s, it))}/wk` : `Bought ${o.year} for ${fmt$(o.paid)} · worth ${fmt$(spendResale(s, o))}${it.up ? ` · upkeep ${fmt$(spendUpkeep(s, it))}/wk` : ''}`}
                    </div>
                  </div>
                  <div className="w-full sm:w-64"><ActionCard s={s} action={{ kind: 'spend', op: { op: 'sell', uid: o.uid } }} compact /></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="panel-title">The catalog, {s.date.y}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input data-testid="spend-search" className="min-w-0 flex-1 rounded border border-noir-700 bg-noir-900 px-2 py-1 text-sm text-stone-200 placeholder:text-stone-600" placeholder="Search: mink, wedding, cops, boat, wife…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Sort" className="rounded border border-noir-700 bg-noir-900 px-2 py-1 text-sm text-stone-300" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="cat">By kind</option><option value="low">Cheapest first</option><option value="high">Dearest first</option>
          </select>
          <label className="flex items-center gap-1 text-[12px] text-stone-400"><input type="checkbox" checked={now} onChange={(e) => setNow(e.target.checked)} /> Can have now</label>
        </div>
        <div className="mt-2 flex flex-wrap gap-1" role="tablist" data-testid="spend-pot-filter">
          {(['all', 'pocket', 'family'] as PotFilter[]).map((p) => (
            <button key={p} className={`tab ${pot === p ? 'tab-active' : ''}`} onClick={() => setPot(p)}>{p === 'all' ? 'Both pots' : p === 'pocket' ? 'Your pocket' : 'Family money'}</button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1" role="tablist" data-testid="spend-cats">
          <button className={`tab ${cat === 'all' ? 'tab-active' : ''}`} onClick={() => setCat('all')}>Everything ({base.length})</button>
          {SPEND_CATS.filter((c) => counts[c] > 0).map((c) => (
            <button key={c} data-testid={`spend-cat-${c}`} className={`tab ${cat === c ? 'tab-active' : ''}`} onClick={() => setCat(c)}>{SPEND_CAT_LABEL[c]} ({counts[c]})</button>
          ))}
        </div>
        {list.length === 0 ? <p className="mt-3 text-sm text-stone-500">Nothing like that for sale.</p> : (
          <ul className="mt-2 divide-y divide-noir-800" data-testid="spend-list">
            {list.map((it) => <Row key={it.id} s={s} it={it} block={blocks[it.id]} open={open === it.id} onToggle={() => setOpen(open === it.id ? undefined : it.id)} />)}
          </ul>
        )}
      </section>

      {sp && sp.log.length > 0 && (
        <section>
          <div className="panel-title">Lately</div>
          <ul className="text-[12px] text-stone-400">{[...sp.log].reverse().slice(0, 8).map(([w, t], i) => <li key={i}>Week {w}: {t}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

function Row({ s, it, block, open, onToggle }: { s: GameState; it: SpendItem; block?: string; open: boolean; onToggle: () => void }) {
  const price = spendPrice(s, it);
  const up = spendUpkeep(s, it);
  const n = heads(s, it);
  const left = stockLeft(s, it);
  return (
    <li data-testid="spend-row" data-item={it.id} className="py-1.5">
      <button className="flex w-full flex-wrap items-baseline justify-between gap-x-3 text-left" onClick={onToggle} aria-expanded={open}>
        <span className={`min-w-0 ${block ? 'text-stone-500' : 'text-stone-200'}`}>
          {it.name} <PotBadge pot={it.pot} />
          {left !== undefined && left > 0 && <span className="ml-1 text-[10px] uppercase text-amber-400">{left === 1 ? 'one of a kind' : `${left} left`}</span>}
        </span>
        <span className="text-sm tabular-nums text-gold-300">
          {fmt$(price)}{n > 1 ? <span className="text-[11px] text-stone-500"> ({n} × {fmt$(Math.round(price / n))})</span> : null}
          {up ? <span className="text-[11px] text-stone-500"> + {fmt$(up)}/wk</span> : null}
        </span>
      </button>
      <div className="text-[11px] text-stone-500">
        {SPEND_CAT_LABEL[it.cat]} · {KIND_WORD[it.kind]} · {effectSummary(it).slice(0, 4).join(' · ') || 'No effect but the pleasure'}
        {block ? <span className="text-stone-600"> · {block}</span> : null}
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded border border-noir-700 bg-noir-900/60 p-2" data-testid="spend-detail">
          <p className="text-sm text-stone-300">{it.blurb}</p>
          <div className="text-[12px] text-stone-400"><span className="text-stone-500">What it does:</span> {effectSummary(it).join(' · ') || 'Nothing you can measure'}</div>
          <div className="text-[12px] text-stone-400"><span className="text-stone-500">Who notices:</span> {whoNotices(it).join(', ') || 'Nobody'}</div>
          <ActionCard s={s} action={{ kind: 'spend', op: { op: 'buy', item: it.id } }} />
        </div>
      )}
    </li>
  );
}

function PotBadge({ pot }: { pot: 'pocket' | 'family' }) {
  return pot === 'pocket'
    ? <span className="ml-1 rounded bg-gold-500/15 px-1 text-[10px] uppercase tracking-wider text-gold-300">Pocket</span>
    : <span className="ml-1 rounded bg-sky-500/15 px-1 text-[10px] uppercase tracking-wider text-sky-300">Family</span>;
}

function Pot({ label, value, upkeep, text, tone, testid }: { label: string; value: number; upkeep: number; text: string; tone: 'gold' | 'sky'; testid: string }) {
  return (
    <div data-testid={testid} className={`rounded border px-3 py-2 ${tone === 'gold' ? 'border-gold-500/40 bg-noir-800/60' : 'border-sky-500/40 bg-noir-800/60'}`}>
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`text-lg tabular-nums ${tone === 'gold' ? 'text-gold-300' : 'text-sky-300'}`}>{fmt$(Math.round(value))}</div>
      <div className="text-[11px] text-stone-400">Upkeep from it: {fmt$(upkeep)}/wk</div>
      <div className="text-[11px] text-stone-500">{text}</div>
    </div>
  );
}
