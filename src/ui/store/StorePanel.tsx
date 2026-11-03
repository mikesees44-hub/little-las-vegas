import { useMemo, useState } from 'react';
import { effectSummary, spendOwned, spendResale, spendUpkeep, whoNotices } from '../../engine/spend';
import { SPEND_BY_ID, type SpendItem } from '../../engine/spendData';
import {
  bizCard, counterOffer, LINKED_BIZ, loanFor, luxuryItems, offerSteps, RACES, raceBlock, raceOdds, recentFlexes, runners, storeCard, storeItems, storeSize, storeTab,
  type StoreView,
} from '../../engine/store';
import { STORE_TAB_BLURB, STORE_TAB_LABEL, STORE_TABS } from '../../engine/storeData';
import { pocketCash } from '../../engine/tributeState';
import type { BusinessKind, GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { ActionMenu } from '../components/Layout';
import { fmt$ } from '../format';
import { EasyVacation } from './EasyVacation';
import { ShareWealth } from './ShareWealth';

type Mode = 'shop' | 'share' | 'vacation';

const VIEW_LABEL = (v: StoreView) => (v === 'luxury' ? 'Luxury' : STORE_TAB_LABEL[v]);

/** Search: name, blurb, what it does, who notices. */
function matches(it: SpendItem, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${it.name} ${it.blurb} ${effectSummary(it).join(' ')} ${whoNotices(it).join(' ')} ${it.biz?.loc ?? ''} ${it.inv?.partner ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * THE STORE (You → The Store): everything money buys, in eight tabs and the
 * Luxury highlights, every line a purchase card (price, down payment, weekly
 * expenses, revenue, profit range, manager, condition, location, the
 * adviser) with Inspect · Ask adviser · Negotiate · Buy · Finance. Two big
 * buttons on top: Share the wealth, and the easy vacation planner.
 */
export function StorePanel({ s, initial }: { s: GameState; initial?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial ?? 'shop');
  const [view, setView] = useState<StoreView>('luxury');
  const [q, setQ] = useState('');
  const lists = useMemo(() => {
    const out = {} as Record<StoreView, SpendItem[]>;
    out.luxury = luxuryItems();
    for (const t of STORE_TABS) out[t] = storeItems(t);
    return out;
  }, []);
  const gone = (it: SpendItem) => (it.maxYear ?? 9999) < s.date.y;
  const list = lists[view].filter((it) => !gone(it) && matches(it, q)).sort((a, b) => a.price - b.price);
  const mine = spendOwned(s).filter((o) => { const it = SPEND_BY_ID[o.id]; return it && (view === 'luxury' ? lists.luxury.includes(it) : storeTab(it) === view); });
  const flexes = recentFlexes(s);
  const horses = runners(s);

  return (
    <div className="space-y-4" data-testid="store-panel">
      <section className="flex flex-wrap items-stretch gap-2">
        <div className="min-w-[10rem] flex-1 rounded border border-gold-500/40 bg-noir-800/60 px-3 py-2" data-testid="store-pocket">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Your pocket</div>
          <div className="text-lg tabular-nums text-gold-300">{fmt$(Math.round(pocketCash(s)))}</div>
        </div>
        <div className="min-w-[10rem] flex-1 rounded border border-sky-500/40 bg-noir-800/60 px-3 py-2" data-testid="store-family">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Family money</div>
          <div className="text-lg tabular-nums text-sky-300">{fmt$(Math.round(s.money))}</div>
        </div>
        <button data-testid="store-share-btn" className={mode === 'share' ? 'btn-gold' : 'btn-ghost'} onClick={() => setMode(mode === 'share' ? 'shop' : 'share')}>♥ Share the wealth</button>
        <button data-testid="store-vacation-btn" className={mode === 'vacation' ? 'btn-gold' : 'btn-ghost'} onClick={() => setMode(mode === 'vacation' ? 'shop' : 'vacation')}>✈ Plan a vacation</button>
      </section>

      {mode === 'share' && <ShareWealth s={s} />}
      {mode === 'vacation' && <EasyVacation s={s} />}

      {mode === 'shop' && (
        <>
          <div className="llv-seg tabbar" role="tablist" data-testid="store-tabs">
            {(['luxury', ...STORE_TABS] as StoreView[]).map((v) => (
              <button key={v} role="tab" data-testid={`store-tab-${v}`} aria-selected={view === v} className={`tab ${view === v ? 'tab-active' : ''}`} onClick={() => setView(v)}>
                {VIEW_LABEL(v)} <span className="text-stone-500">({lists[v].filter((it) => !gone(it)).length + (v === 'property' ? LINKED_BIZ.length : 0)})</span>
              </button>
            ))}
          </div>
          <p className="text-[12px] text-stone-400">
            {view === 'luxury' ? 'The showpieces: the penthouse over the water, the mansion, the yacht, the race cars, the racehorses, the stones. Everything here is seen.' : STORE_TAB_BLURB[view]}
            <span className="text-stone-600"> · {storeSize()} things in the store.</span>
          </p>
          <input data-testid="store-search" className="w-full rounded border border-noir-700 bg-noir-900 px-2 py-1 text-sm text-stone-200 placeholder:text-stone-600" placeholder="Search: penthouse, diner, Ferrari, Rolex, bonds, tutor…" value={q} onChange={(e) => setQ(e.target.value)} />

          {mine.length > 0 && (
            <section data-testid="store-owned">
              <div className="panel-title">Yours</div>
              <ul className="divide-y divide-noir-800 text-sm">
                {mine.map((o) => {
                  const it = SPEND_BY_ID[o.id];
                  const loan = loanFor(s, o.uid);
                  const run = horses.find((h) => h.uid === o.uid);
                  const rec = s.spend?.races?.[o.uid];
                  return (
                    <li key={o.uid} className="space-y-1 py-1.5" data-testid="store-owned-row">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-stone-200">{it.name}</span>
                        <span className="text-[11px] text-stone-500">
                          {it.kind === 'svc' ? `On retainer · ${fmt$(spendUpkeep(s, it))}/wk` : `Paid ${fmt$(o.paid)} (${o.year}) · worth ${fmt$(spendResale(s, o))}`}
                          {loan ? ` · owes ${fmt$(loan.left)} to ${loan.lender} (${fmt$(loan.pay)}/wk${loan.missed ? `, ${loan.missed} missed` : ''})` : ''}
                          {rec ? ` · ${rec.starts} starts, ${rec.wins} wins, ${fmt$(rec.earned)}` : ''}
                        </span>
                      </div>
                      {run && <RaceRow s={s} uid={o.uid} kind={run.kind} />}
                      <div className="w-full sm:w-72"><ActionCard s={s} action={{ kind: 'spend', op: { op: 'sell', uid: o.uid } }} compact /></div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <ul className="space-y-2" data-testid="store-list">
            {list.map((it) => <Card key={it.id} s={s} it={it} />)}
          </ul>

          {view === 'property' && (
            <section data-testid="store-linked-biz">
              <div className="panel-title">Open a place in a district (Rackets & Businesses)</div>
              <p className="text-[11px] text-stone-500">These are bought the usual way, a storefront in a district you hold, and sit with your other places. The price can come down at the table.</p>
              <ul className="mt-1 space-y-2">{LINKED_BIZ.map((k) => <BizCardRow key={k} s={s} kind={k} />)}</ul>
            </section>
          )}

          {flexes.length > 0 && (
            <section data-testid="store-flexes">
              <div className="panel-title">Around town: who bought what</div>
              <ul className="text-[12px] text-stone-400">{flexes.map((f, i) => <li key={i}>Week {f.week}: {f.who} bought {f.item.replace(/^An? /, 'a ').toLowerCase()} ({fmt$(f.price)}).</li>)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** One purchase card, in the store's format. */
function Card({ s, it }: { s: GameState; it: SpendItem }) {
  const [open, setOpen] = useState<'' | 'inspect' | 'adviser' | 'negotiate' | 'buy' | 'finance'>('');
  const [offer, setOffer] = useState<number | undefined>();
  const c = storeCard(s, it);
  const toggle = (k: typeof open) => setOpen(open === k ? '' : k);
  const reply = offer !== undefined ? counterOffer(s, it, offer) : undefined;
  const agreed = reply?.ok ? reply.price : undefined;
  const Field = ({ k, v }: { k: string; v?: string }) => (v ? <div><span className="text-stone-500">{k}</span> <span className="text-stone-200">{v}</span></div> : null);
  return (
    <li className="rounded-lg border border-noir-700 bg-noir-800/50 p-3" data-testid="store-card" data-item={it.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={`font-semibold ${c.block ? 'text-stone-500' : 'text-stone-100'}`}>{it.name}</span>
        <span className="text-sm tabular-nums text-gold-300">{fmt$(agreed ?? c.price)}{agreed !== undefined && agreed < c.price ? <span className="ml-1 text-[11px] text-emerald-400">(was {fmt$(c.price)})</span> : null}</span>
      </div>
      <div className="mt-1 grid gap-x-4 gap-y-0.5 text-[12px] sm:grid-cols-3" data-testid="store-card-fields">
        <Field k="Purchase price" v={fmt$(agreed ?? c.price)} />
        <Field k="Down payment" v={c.finance ? fmt$(c.finance.down) : 'Cash only'} />
        <Field k="Weekly expenses" v={`${fmt$(c.weekly)}/wk${c.finance ? ` (+${fmt$(c.finance.pay)}/wk financed)` : ''}`} />
        {c.revenue !== undefined && <Field k="Current revenue" v={`${fmt$(c.revenue)}/wk`} />}
        {c.profit && <Field k="Estimated profit" v={`${fmt$(c.profit[0])} to ${fmt$(c.profit[1])}/wk`} />}
        {c.manager && <Field k="Manager" v={c.manager} />}
        {c.condition && <Field k="Condition" v={c.condition} />}
        {c.location && <Field k="Location" v={c.location} />}
        {c.stake && <Field k="You own" v={c.stake} />}
        {c.inv && <><Field k="Risk" v={c.inv.risk} /><Field k="Expected return" v={c.inv.ret} /><Field k="Liquidity" v={c.inv.liq} /><Field k="Management" v={c.inv.mgmt} /><Field k="Partner" v={c.inv.partner} /></>}
        {c.hire && <><Field k="Skill" v={`${c.hire.skill}/100`} /><Field k="Reputation" v={c.hire.rep} /><Field k="Available" v={c.hire.avail} />{c.hire.conflict && <Field k="Conflict of interest" v={c.hire.conflict} />}</>}
        {c.note && <Field k="Note" v={c.note} />}
        <Field k="How" v={c.model === 'buy' ? 'Buy' : c.model === 'hire' ? 'Hire (a contract)' : c.model === 'share' ? 'A share' : c.model === 'lease' ? 'Lease' : c.model === 'rent' ? 'Rent' : 'Subscribe'} />
        <Field k="Belongs to" v={c.ownership} />
        {c.style && <Field k="Style" v={c.style} />}
        {c.requirements.length > 0 && <Field k="Requires" v={c.requirements.join(' · ')} />}
      </div>
      {c.block && <div className="mt-1 text-[11px] text-stone-500">{c.block}</div>}
      {/* One primary (Buy), its alternative (Finance), and the looking-and-asking folded into More. */}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5" data-testid="store-card-actions">
        <ActionMenu label={open === 'inspect' || open === 'adviser' || open === 'negotiate' ? (open === 'inspect' ? 'Inspecting' : open === 'adviser' ? 'Adviser' : 'Negotiating') : 'More'}>
          <button type="button" onClick={() => toggle('inspect')}>Inspect</button>
          <button type="button" onClick={() => toggle('adviser')}>Ask adviser</button>
          <button type="button" disabled={!c.negotiable} title={c.negotiable ? undefined : 'Not something you haggle over'} onClick={() => toggle('negotiate')}>Negotiate</button>
        </ActionMenu>
        <button type="button" className={`btn-secondary h-8 px-2.5 py-0 text-xs ${open === 'finance' ? 'border-gold-500 text-gold-300' : ''}`} disabled={!c.finance} title={c.finance ? undefined : 'Cash only'} onClick={() => toggle('finance')}>Finance</button>
        <button type="button" className="btn-primary h-8 px-3 py-0 text-xs" onClick={() => toggle('buy')}>Buy</button>
      </div>
      {open === 'inspect' && (
        <div className="mt-2 space-y-1 text-[12px] text-stone-300" data-testid="store-inspect">
          <p>{it.blurb}</p>
          <div><span className="text-stone-500">What it does:</span> {effectSummary(it).join(' · ') || 'Nothing you can measure'}</div>
          <div><span className="text-stone-500">Who notices:</span> {whoNotices(it).join(', ') || 'Nobody'}</div>
          {it.fut && <div><span className="text-stone-500">What it may lead to:</span> {it.fut}</div>}
          {c.adult && (
            <ul className="list-disc pl-4 text-stone-400" data-testid="store-adult">
              <li>Eligibility: {c.adult.eligibility}</li><li>Voluntary: {c.adult.voluntary}</li><li>Pay: {c.adult.pay}</li>
              <li>Conditions: {c.adult.conditions}</li><li>Leaving: {c.adult.leave}</li><li>Legality: {c.adult.legal}</li>
            </ul>
          )}
        </div>
      )}
      {open === 'adviser' && <p className="mt-2 text-[12px] italic text-stone-300" data-testid="store-adviser">Adviser&apos;s assessment: &ldquo;{c.adviser}&rdquo;</p>}
      {open === 'negotiate' && (
        <div className="mt-2 space-y-1 text-[12px]" data-testid="store-negotiate">
          <div className="flex flex-wrap gap-1">{offerSteps(s, it).map((o) => <button key={o} className={`${offer === o ? 'btn-gold' : 'btn-ghost'} px-2 py-1 text-xs`} onClick={() => setOffer(o)}>Offer {fmt$(o)}</button>)}</div>
          {reply && <p className={reply.ok ? 'text-emerald-300' : 'text-amber-300'}>{reply.text}</p>}
          {reply && !reply.ok && reply.price < c.price && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOffer(reply.price)}>Take {fmt$(reply.price)}</button>}
        </div>
      )}
      {open === 'buy' && <div className="mt-2"><ActionCard s={s} action={{ kind: 'spend', op: { op: 'buy', item: it.id, ...(agreed !== undefined && agreed < c.price ? { offer: agreed } : {}) } }} /></div>}
      {open === 'finance' && c.finance && <div className="mt-2"><ActionCard s={s} action={{ kind: 'spend', op: { op: 'buy', item: it.id, finance: true, ...(agreed !== undefined && agreed < c.price ? { offer: agreed } : {}) } }} /></div>}
    </li>
  );
}

/** A business bought through the districts, shown as a store card. */
function BizCardRow({ s, kind }: { s: GameState; kind: BusinessKind }) {
  const [open, setOpen] = useState('');
  const c = bizCard(s, kind);
  return (
    <li className="rounded border border-noir-700 bg-noir-800/50 p-2" data-testid="store-biz-card" data-kind={kind}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-stone-100">{c.name}</span>
        <span className="text-sm tabular-nums text-gold-300">{fmt$(c.price)}</span>
      </div>
      <div className="mt-1 grid gap-x-4 text-[12px] sm:grid-cols-3">
        <div><span className="text-stone-500">Weekly expenses</span> {fmt$(c.weekly)}/wk</div>
        <div><span className="text-stone-500">Current revenue</span> {fmt$(c.revenue)}/wk</div>
        <div><span className="text-stone-500">Estimated profit</span> {fmt$(c.profit[0])} to {fmt$(c.profit[1])}/wk</div>
        <div><span className="text-stone-500">Manager</span> {c.manager}</div>
        <div><span className="text-stone-500">Location</span> {c.districtName ?? 'A district you hold'}</div>
        {c.launder > 0 && <div><span className="text-stone-500">Washes</span> {fmt$(c.launder)}/wk</div>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(open === 'a' ? '' : 'a')}>Ask adviser</button>
        <button className="btn-gold px-2 py-1 text-xs" onClick={() => setOpen(open === 'b' ? '' : 'b')}>Buy · Negotiate</button>
      </div>
      {open === 'a' && <p className="mt-1 text-[12px] italic text-stone-300">Adviser&apos;s assessment: &ldquo;{c.adviser}&rdquo;</p>}
      {open === 'b' && (c.district ? <div className="mt-2"><ActionCard s={s} action={{ kind: 'buyBusiness', biz: kind, district: c.district }} /></div> : <p className="mt-1 text-[12px] text-stone-500">{c.block}</p>)}
    </li>
  );
}

/** Enter a horse or a race car in a race this month. */
function RaceRow({ s, uid, kind }: { s: GameState; uid: string; kind: 'horse' | 'car' }) {
  const open = RACES.filter((r) => r.kind === kind && r.months.includes(s.date.m));
  if (!open.length) return <div className="text-[11px] text-stone-500">No {kind === 'horse' ? 'races at Atlantic City, Garden State or Monmouth' : 'races'} this month.</div>;
  return (
    <div className="space-y-1" data-testid="store-races">
      {open.map((r) => {
        const odds = raceOdds(s, uid, r.id);
        const why = raceBlock(s, uid, r.id);
        return (
          <div key={r.id} className="text-[12px]">
            <span className="text-stone-300">{r.name}</span> <span className="text-stone-500">· {Math.round(odds.win * 100)}% to win{why ? ` · ${why}` : ''}</span>
            {!why && <div className="w-full sm:w-72"><ActionCard s={s} action={{ kind: 'spend', op: { op: 'race', uid, race: r.id } }} compact /></div>}
          </div>
        );
      })}
    </div>
  );
}
