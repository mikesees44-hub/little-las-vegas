import { useState } from 'react';
import { adultOn } from '../../engine/datingState';
import { previewAction } from '../../engine/actions';
import { goomarBlock } from '../../engine/goomar';
import {
  goomarPlaces, herTargets, matureItem, nightPlans, nightWomen, pocketBooks, pocketGiven, pocketGroups, pocketOwned, pocketShelves, pocketWeekly,
  type OwnedRow, type PocketGroup,
} from '../../engine/pocketShop';
import { effectSummary, giftTargets, GIFT_KIND_LABEL, spendBlock, spendPrice, spendUpkeep, type GiftTarget } from '../../engine/spend';
import type { SpendItem } from '../../engine/spendData';
import { pocketCash } from '../../engine/tributeState';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { DomainDot, Empty, PlayCard, Section, StatChip, SubTabs } from '../components/Layout';
import { CharLink, Face } from '../components/People';
import { domClass, type Domain } from '../domain';
import { fmt$ } from '../format';
import { useShell } from '../shell/context';

/**
 * YOUR POCKET, SPENT: the boss's own money on the boss's own life, one door from the Pocket badge in the
 * top bar. Homes (his house, a summer place, a place in Florida), cars, things for him (the watch, the
 * cufflinks, the suits, the rings), things for her (for his wife, a woman he is seeing or a daughter:
 * he picks who), nights out (dinners and shows; with a woman he is seeing, a room for the night or a
 * suite: she decides, the report fades), and a goomar's apartment.
 *
 * Every card is the Store's own item and the same order (engine/spend.ts): the preview shows the price
 * from the pocket, the upkeep, respect, who thinks better of him, the IRS's count, and the chance his wife
 * finds out, before he buys. "What you own" sells or gives away what is his.
 */

const GROUP_DOMAIN: Record<PocketGroup, Domain> = { homes: 'family', cars: 'shore', him: 'money', her: 'romance', nights: 'romance', goomar: 'romance' };
const GROUP_GLYPH: Record<PocketGroup, string> = { homes: '⌂', cars: '◆', him: '♠', her: '♦', nights: '☾', goomar: '♥' };

let pendingGroup: PocketGroup | undefined;
/** The next Pocket shop to open starts on this group. */
export function requestPocketGroup(g: PocketGroup): void { pendingGroup = g; }

export function PocketShop({ s }: { s: GameState }) {
  const groups = pocketGroups(s);
  const [group, setGroup] = useState<PocketGroup>(() => { const g = pendingGroup; pendingGroup = undefined; return g && groups.some((x) => x.id === g) ? g : 'homes'; });
  const cur = groups.find((g) => g.id === group) ?? groups[0];
  const books = pocketBooks(s);
  const weekly = pocketWeekly(s);
  const her = herTargets(s);
  const [to, setTo] = useState<string | undefined>(() => her[0]?.id);
  const target = her.find((t) => t.id === to) ?? her[0];
  const d = GROUP_DOMAIN[cur.id];
  return (
    <div className="space-y-4" data-testid="pocket-shop">
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="pocket-top">
        <StatChip domain="money" label="Your pocket" sub="what you spend on yourself" value={<span className="text-gold-300">{fmt$(Math.round(pocketCash(s)))}</span>} testid="pocket-cash" />
        <StatChip domain="money" label="Every week" sub={weekly.goomars ? `upkeep ${fmt$(weekly.upkeep)} · her place ${fmt$(weekly.goomars)}` : 'upkeep on what you own'} value={<span className="text-stone-100">{fmt$(weekly.total)}</span>} testid="pocket-weekly" />
        <StatChip domain="law" label="Your books explain" sub="a laborer's wage, plus your straight businesses" value={<span className="text-stone-100">{fmt$(books.declared)}/wk</span>} testid="pocket-declared" />
        <StatChip domain="law" label="The IRS" sub={books.lavish > 1.2 ? `you live ${books.lavish}× what you can explain` : 'nothing they can count yet'} tone={books.irs >= 60 ? 'bad' : books.irs >= 30 ? 'warn' : undefined}
          value={<span className={books.irs >= 60 ? 'text-red-300' : books.irs >= 30 ? 'text-amber-200' : 'text-stone-100'}>{books.irs}/100</span>} testid="pocket-irs" />
      </section>

      <SubTabs label="What to spend it on" testid="pocket-tabs" value={cur.id} onChange={setGroup}
        tabs={groups.map((g) => ({ id: g.id, testid: `pocket-tab-${g.id}`, label: <span className="inline-flex items-center gap-1.5"><DomainDot d={GROUP_DOMAIN[g.id]} />{g.label}</span> }))} />
      <p className="-mt-1 text-[12px] text-stone-400" style={{ maxWidth: '72ch' }}>{cur.blurb}</p>

      {cur.id === 'her' && <WhoFor s={s} her={her} value={target?.id} onChange={setTo} />}
      {cur.id === 'homes' && books.florida && <p className="text-[12px] text-teal-200/90" data-testid="pocket-florida">Your place in Florida: a trip down there needs no hotel, and lying low there costs half (Trips &amp; envoys).</p>}
      {cur.id === 'nights' && <NightsWithHer s={s} />}
      {cur.id === 'goomar' && <HerApartment s={s} />}

      {pocketShelves(s, cur.id).filter((sh) => sh.items.length).map((sh) => (
        <section key={sh.label} className={domClass(d)} data-testid="pocket-shelf">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{sh.label}</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {sh.items.map((it) => <ItemCard key={it.id} s={s} it={it} d={d} glyph={GROUP_GLYPH[cur.id]} to={cur.id === 'her' ? target : undefined} />)}
          </ul>
        </section>
      ))}

      <OwnedList s={s} />
    </div>
  );
}

/** "For her": who the present is for. */
function WhoFor({ s, her, value, onChange }: { s: GameState; her: GiftTarget[]; value?: string; onChange: (id: string) => void }) {
  if (!her.length) return <Empty title="Nobody to give it to">No wife, no woman you are seeing, no daughter. Relationships &amp; Dating is where that starts.</Empty>;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="pocket-for" role="radiogroup" aria-label="Who it is for">
      <span className="text-[11px] uppercase tracking-wider text-stone-500">For</span>
      {her.map((t) => (
        <button key={t.id} type="button" role="radio" aria-checked={value === t.id} data-testid={`pocket-for-${t.kind}`} onClick={() => onChange(t.id)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] ${value === t.id ? 'border-rose-400 bg-rose-500/20 text-rose-100' : 'border-noir-600 text-stone-300 hover:border-rose-400/60'}`}>
          {s.characters[t.id] && <Face s={s} c={s.characters[t.id]} size={18} />}
          {t.name}<span className="text-[10px] text-stone-500">{GIFT_KIND_LABEL[t.kind].replace(/^Your /, '').replace(/^A woman you are seeing$/, 'seeing')}</span>
        </button>
      ))}
    </div>
  );
}

/** One thing to buy, as a card: price, upkeep, what it does; Buy opens the order with every effect. */
function ItemCard({ s, it, d, glyph, to }: { s: GameState; it: SpendItem; d: Domain; glyph: string; to?: GiftTarget }) {
  const [open, setOpen] = useState(false);
  const action: PlayerAction = { kind: 'spend', op: { op: 'buy', item: it.id, ...(to ? { to: to.id } : {}) } };
  const block = to ? previewAction(s, action).disabledReason : spendBlock(s, it);
  const up = spendUpkeep(s, it);
  const fx = effectSummary(it).filter((x) => !/^(Wife|Goomar|Daughters|Your son|Your mother) /.test(x) || !to).slice(0, 3);
  const notFor = to && block && /^Not (for|something)|That is for/.test(block);
  if (notFor) return null;
  return (
    <PlayCard as="li" d={d} testid="pocket-item" dataAttrs={{ 'data-item': it.id }} className={open ? 'col-span-full' : ''} artClassName="!min-h-[54px] !pt-2"
      art={<span className="llv-pc-glyph !text-[30px] !mb-1" aria-hidden>{glyph}</span>}
      corner={matureItem(it) ? <span className="llv-pc-tag bg-rose-700/80 text-rose-50">her</span> : it.flash >= 6 ? <span className="llv-pc-tag bg-amber-600/80 text-noir-950" title="Everybody sees it, the IRS included">seen</span> : undefined}
      title={it.name}
      lines={[
        <span key="p" className="tabular-nums"><b className="text-gold-300">{fmt$(spendPrice(s, it))}</b>{up ? <span className="text-stone-400"> · {fmt$(up)}/wk</span> : null}{to ? <span className="text-rose-200"> · for {to.name}</span> : null}</span>,
        fx.join(' · ') || it.blurb,
      ]}>
      {block && !open && <div className="mt-1 text-[11px] text-amber-200/90">{block}</div>}
      <div className="mt-auto flex justify-end pt-1.5">
        <button type="button" className={`${open ? 'btn-ghost' : 'btn-primary'} h-7 px-2.5 py-0 text-xs`} onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="pocket-item-buy">{open ? 'Close' : 'Buy…'}</button>
      </div>
      {open && (
        <div className="mt-2 space-y-1.5" data-testid="pocket-item-order">
          <p className="text-[12px] text-stone-300">{it.blurb}</p>
          <ActionCard s={s} action={action} />
        </div>
      )}
    </PlayCard>
  );
}

/** Nights out with a woman he is seeing: the evening flow's own orders (she decides). */
function NightsWithHer({ s }: { s: GameState }) {
  const women = nightWomen(s);
  const { go } = useShell();
  if (!women.length) return (
    <p className="text-[12px] text-stone-400" data-testid="pocket-nights-none">The dinners and shows below are for anybody. A room for the night or a suite needs a woman who is already seeing you, and her yes. <button type="button" className="text-gold-400 hover:text-gold-300" onClick={() => go('you.dating')}>Relationships &amp; Dating ▸</button></p>
  );
  return (
    <Section title="With a woman you are seeing" sub={adultOn(s) ? 'She decides. A room for the night fades to morning; your wife may hear.' : 'Mature content is Off: dinners and nights out only.'} domain="romance" testid="pocket-nights">
      <ul className="grid gap-2 md:grid-cols-2">
        {women.map((c) => (
          <PlayCard key={c.id} as="li" d="romance" testid="pocket-night-her" art={<Face s={s} c={c} size={56} />} artClassName="!min-h-[70px]" title={<CharLink s={s} id={c.id} />}>
            <div className="mt-1 space-y-1.5">{nightPlans(s, c.id).map((p) => <ActionCard key={p.key} s={s} action={{ kind: 'nightlife', op: { op: 'invite', plan: p.plan } }} compact />)}</div>
          </PlayCard>
        ))}
      </ul>
    </Section>
  );
}

/** Her apartment: the goomars he keeps (the nightlife arrangement), and asking a woman he sees. */
function HerApartment({ s }: { s: GameState }) {
  const places = goomarPlaces(s);
  const { go } = useShell();
  const askable = giftTargets(s).filter((t) => t.kind === 'lover' && !goomarBlock(s, t.id, true));
  return (
    <Section title="Her apartment" sub="Her name on the lease, rent and an allowance from your pocket every week. She can leave; you can end it decently." domain="romance" testid="pocket-goomar">
      {places.length ? (
        <ul className="space-y-1.5">
          {places.map((p) => (
            <li key={p.id} className="rounded-md border border-noir-700 bg-noir-800/40 px-2.5 py-2 text-sm" data-testid="pocket-goomar-row">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-stone-200"><CharLink s={s} id={p.id} />: {p.where}</span>
                <span className="text-[11px] text-stone-400 tabular-nums">{fmt$(p.weekly)}/wk since week {p.since}{p.wifeKnows ? ' · your wife knows' : ''}</span>
              </div>
              <div className="mt-1 w-full sm:w-80"><ActionCard s={s} action={{ kind: 'nightlife', op: { op: 'endGoomar', id: p.id } }} compact /></div>
            </li>
          ))}
        </ul>
      ) : <p className="text-[12px] text-stone-400">You keep nobody. Only a woman already seeing you can say yes to it.</p>}
      {askable.length > 0 && (
        <div className="mt-2 space-y-1.5" data-testid="pocket-goomar-ask">
          {askable.map((t) => <div key={t.id} className="w-full sm:w-96"><ActionCard s={s} action={{ kind: 'nightlife', op: { op: 'goomar', id: t.id } }} compact /></div>)}
        </div>
      )}
      <button type="button" className="mt-2 text-[11px] text-gold-400 hover:text-gold-300" onClick={() => go('you.dating')}>Relationships &amp; Dating ▸</button>
    </Section>
  );
}

/** What he owns from the pocket: what it's worth, what it costs a week; sell it or give it away. */
function OwnedList({ s }: { s: GameState }) {
  const rows = pocketOwned(s);
  const given = pocketGiven(s);
  const { go } = useShell();
  return (
    <Section title="What you own" sub="Bought from your pocket: what it is worth, what it costs you a week. Sell it, or give it to somebody." aside={<span>{rows.length}</span>} domain="money" testid="pocket-owned">
      {rows.length ? <ul className="space-y-1.5">{rows.map((o) => <OwnedRowView key={o.uid} s={s} o={o} onGoodLife={() => go('you.possessions')} />)}</ul>
        : <p className="text-[12px] text-stone-400">Nothing yet. Everything you buy here is listed here, and on your sheet.</p>}
      {given.length > 0 && (
        <div className="mt-2 text-[11px] text-stone-500" data-testid="pocket-given">Given away: {given.slice(0, 6).map((g) => `${g.name.replace(/^An? /, 'a ').toLowerCase()} to ${g.to}`).join(' · ')}</div>
      )}
    </Section>
  );
}

function OwnedRowView({ s, o, onGoodLife }: { s: GameState; o: OwnedRow; onGoodLife: () => void }) {
  const [act, setAct] = useState<'' | 'sell' | 'give'>('');
  const targets = giftTargets(s).filter((t) => t.id !== o.holder);
  const [to, setTo] = useState<string>(targets[0]?.id ?? '');
  const holder = o.holder ? s.characters[o.holder] : undefined;
  const give: PlayerAction | undefined = to ? { kind: 'spend', op: { op: 'give', uid: o.uid, to } } : undefined;
  return (
    <li className="rounded-md border border-noir-700 bg-noir-800/40 px-2.5 py-2" data-testid="pocket-owned-row">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-stone-200">{o.name}{holder ? <span className="text-[11px] text-rose-200"> · {holder.firstName}'s</span> : null}</span>
        <span className="text-[11px] tabular-nums text-stone-400">worth {fmt$(o.worth)}{o.upkeep ? ` · ${fmt$(o.upkeep)}/wk` : ''}</span>
      </div>
      {o.legacy ? <button type="button" className="mt-1 text-[11px] text-gold-400 hover:text-gold-300" onClick={onGoodLife}>Sell it in The Good Life ▸</button>
        : !holder && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            <button type="button" className={`btn-secondary h-7 px-2 py-0 text-xs ${act === 'sell' ? 'border-gold-500 text-gold-300' : ''}`} onClick={() => setAct(act === 'sell' ? '' : 'sell')}>Sell</button>
            {targets.length > 0 && <button type="button" className={`btn-secondary h-7 px-2 py-0 text-xs ${act === 'give' ? 'border-rose-400 text-rose-200' : ''}`} onClick={() => setAct(act === 'give' ? '' : 'give')} data-testid="pocket-give-btn">Give to…</button>}
          </div>
        )}
      {act === 'sell' && <div className="mt-1.5 w-full sm:w-80"><ActionCard s={s} action={{ kind: 'spend', op: { op: 'sell', uid: o.uid } }} compact /></div>}
      {act === 'give' && (
        <div className="mt-1.5 space-y-1.5">
          <select aria-label="Give it to" className="rounded border border-noir-600 bg-noir-900 px-2 py-1 text-sm text-stone-200" value={to} onChange={(e) => setTo(e.target.value)} data-testid="pocket-give-to">
            {targets.map((t) => <option key={t.id} value={t.id}>{t.name} ({GIFT_KIND_LABEL[t.kind].toLowerCase()})</option>)}
          </select>
          {give && <div className="w-full sm:w-80"><ActionCard s={s} action={give} compact /></div>}
        </div>
      )}
    </li>
  );
}
