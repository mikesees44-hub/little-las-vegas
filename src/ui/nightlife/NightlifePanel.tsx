import { useState } from 'react';
import { activeGoomars, goomarTerms } from '../../engine/goomar';
import {
  FILTER_LABEL, filterCounts, houseRows, nightActionsFor, nightLog, nightRoster, nightSummary, promiseRows,
  type HouseRow, type RosterFilter, type RosterRow,
} from '../../engine/nightlife';
import { adultOn } from '../../engine/datingState';
import { displayName } from '../../engine/characters';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { Modal } from '../components/Modal';
import { CharLink, Face } from '../components/People';
import { fmt$ } from '../format';
import { useShell } from '../shell/context';
import { CallingCard } from './CallingCard';
import { LooksBadge } from '../components/LooksBadge';
import { WomenSection } from './WomenSection';

/**
 * NIGHTLIFE: the hub for the island's night (engine/nightlife.ts). Summary
 * first; then the people (filters for each list: the young and mature
 * high-end lists, call girls, the street, dancers, singers, bar regulars,
 * women out at the clubs, madams, the other families'), the madams' houses
 * (protection, partnerships, squeezes), promises and goomars, and what
 * happened lately. Every person opens her calling card; every order is an
 * ordinary order row (cost, who pays, her odds and why). She decides.
 */

type Tab = 'people' | 'houses' | 'promises' | 'women' | 'lately';
const TABS: [Tab, string][] = [['people', 'People'], ['houses', 'Madams & houses'], ['promises', 'Promises & goomars'], ['women', 'Her side'], ['lately', 'Lately']];
const FILTERS: RosterFilter[] = ['all', 'young', 'mature', 'callgirl', 'street', 'dancer', 'singer', 'barfly', 'date', 'madam', 'payroll', 'rivals', 'careers', 'hot'];
const ADULT_FILTERS: RosterFilter[] = ['young', 'mature', 'callgirl', 'street'];

/** Her calling card in a window (from the roster, the houses, anywhere). */
export function CardModal({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose} wide>
      <div className="p-3 pb-24 sm:p-4" data-testid="calling-card-modal">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Calling card</div>
          <button type="button" className="btn-ghost text-xs px-2 py-0.5" onClick={onClose} data-testid="calling-card-close">Close</button>
        </div>
        <CallingCard s={s} id={id} />
      </div>
    </Modal>
  );
}

function Badge({ children, tone }: { children: string; tone?: 'gold' | 'rose' | 'green' | 'red' }) {
  const cls = tone === 'gold' ? 'border-gold-500/70 text-gold-200' : tone === 'rose' ? 'border-rose-400/70 text-rose-200' : tone === 'green' ? 'border-emerald-500/60 text-emerald-200' : tone === 'red' ? 'border-red-400/60 text-red-200' : 'border-noir-600 text-stone-300';
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>{children}</span>;
}

function PersonRow({ s, r, onCard }: { s: GameState; r: RosterRow; onCard: (id: string) => void }) {
  const [more, setMore] = useState(false);
  const c = s.characters[r.id];
  if (!c) return null;
  const acts: PlayerAction[] = nightActionsFor(s, r.id);
  return (
    <li className={`rounded-md border p-2.5 ${r.seeking ? 'border-gold-500/60 bg-gold-500/5' : 'border-noir-700 bg-noir-800/50'}`} data-testid="night-person" data-role={r.role}>
      <div className="flex gap-2.5">
        <Face s={s} c={c} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-stone-100 text-sm"><CharLink s={s} id={r.id} /></span>
            <span className="text-[11px] text-stone-400">{r.age}</span>
            <Badge>{r.roleLabel}</Badge>
            {r.list && <Badge tone="gold">{r.list === 'young' ? '18–25' : '26+'}</Badge>}
            {r.seeking && <Badge tone="gold">Looking for work</Badge>}
            {r.payroll && <Badge tone="green">Your payroll</Badge>}
            {r.goomar && <Badge tone="rose">Your goomar</Badge>}
            <LooksBadge s={s} id={r.id} compact />
          </div>
          <div className="text-[11px] text-stone-400 truncate">{[r.looks.join(', '), r.house ?? r.venue].filter(Boolean).join(' · ')}</div>
          <div className="text-[11px] text-stone-500 truncate">{r.family}</div>
          <div className="text-[11px] text-stone-500">
            {r.price > 0 && <span className="text-amber-300">{fmt$(r.price)} an evening · </span>}
            {r.earn > 0 && <span>made {fmt$(r.earn)} last week · </span>}
            <span>trusts you {r.loyalty}</span>
            {r.promise !== undefined && <span className="text-amber-200"> · your promise due week {r.promise}</span>}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className="btn-ghost px-2 py-1 text-[11px]" onClick={() => onCard(r.id)} data-testid="night-card">Calling card ▸</button>
        {acts.length > 0 && <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" onClick={() => setMore((x) => !x)} aria-expanded={more} data-testid="night-more">{more ? 'Less' : `More… (${acts.length} order${acts.length === 1 ? '' : 's'})`}</button>}
      </div>
      {more && <div className="mt-1.5 space-y-1.5">{acts.map((a, i) => <ActionRow key={i} s={s} action={a} />)}</div>}
    </li>
  );
}

function HouseCard({ s, h, onCard }: { s: GameState; h: HouseRow; onCard: (id: string) => void }) {
  const [more, setMore] = useState(!!h.squeeze && h.mine);
  const c = s.characters[h.id];
  if (!c) return null;
  const acts = nightActionsFor(s, h.id).filter((a) => a.kind === 'nightlife' && (a.op.op === 'deal' || a.op.op === 'back'));
  return (
    <li className={`rounded-md border p-2.5 ${h.squeeze && h.mine ? 'border-red-400/60' : h.mine ? 'border-gold-600/50' : 'border-noir-700'} bg-noir-800/50`} data-testid="night-house">
      <div className="flex gap-2.5">
        <Face s={s} c={c} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-stone-100 text-sm">{h.name}</span>
            <Badge tone={h.mine ? 'gold' : undefined}>{h.dealLabel}</Badge>
            {h.ears && <Badge>The Ears</Badge>}
          </div>
          <div className="text-[11px] text-stone-400"><CharLink s={s} id={h.id}>{h.madam}</CharLink>, {h.age} · {h.district} · {h.front}</div>
          <div className="text-[11px] text-stone-500">Protected by {h.with} · {h.girls} working through her · took {fmt$(h.take)} last week{h.protection ? <span className="text-gold-300"> · pays you {fmt$(h.protection)}/wk</span> : null} · vice heat {h.heat}</div>
          {h.squeeze && <div className="text-[11px] text-red-300">{h.squeeze}</div>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className="btn-ghost px-2 py-1 text-[11px]" onClick={() => onCard(h.id)}>Calling card ▸</button>
        {acts.length > 0 && <button type="button" className="text-[11px] text-gold-400" onClick={() => setMore((x) => !x)} aria-expanded={more}>{more ? 'Less' : `Deals (${acts.length})`}</button>}
      </div>
      {more && <div className="mt-1.5 space-y-1.5">{acts.map((a, i) => <ActionRow key={i} s={s} action={a} />)}</div>}
    </li>
  );
}

export function NightlifePanel({ s }: { s: GameState }) {
  const shell = useShell();
  const [tab, setTab] = useState<Tab>('people');
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [card, setCard] = useState<string | undefined>();
  const [byLooks, setByLooks] = useState(false);
  if (!s.nightlife) return <p className="text-xs text-stone-400" data-testid="nightlife-empty">The night fills in when the week turns.</p>;
  const sum = nightSummary(s);
  const counts = filterCounts(s);
  const on = adultOn(s);
  const roster = nightRoster(s, filter, byLooks ? 'looks' : 'default').slice(0, 40);
  const goomars = activeGoomars(s);
  return (
    <div className="space-y-3" data-testid="nightlife-panel">
      <div className="rounded-md border border-noir-700 bg-noir-900/60 p-2.5 text-sm text-stone-200" data-testid="nightlife-summary">
        <b>{sum.people}</b> people of the night you could know · <b>{sum.payroll}</b> on your payroll (~{fmt$(sum.kickback)}/wk kickback) · <b>{sum.yours}</b> of {sum.houses} houses under your protection (~{fmt$(sum.protection)}/wk)
        {sum.squeezed > 0 && <span className="text-red-300"> · {sum.squeezed} being squeezed</span>}
        {sum.seeking > 0 && <span className="text-gold-300"> · {sum.seeking} looking for work</span>}
        {sum.promises > 0 && <span className="text-amber-200"> · {sum.promises} promise{sum.promises === 1 ? '' : 's'} to keep</span>}
        {sum.goomars > 0 && <span className="text-rose-200"> · {sum.goomars} goomar{sum.goomars === 1 ? '' : 's'}</span>}
        <p className="mt-1 text-[11px] text-stone-500">Everyone here is an adult. She decides every time: work, deals, promises, the goomar. Nothing is shown; reports only.{!on && ' Mature content is Off: escorts, call girls, street workers and adult pictures are not shown anywhere.'}</p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-noir-700 pb-1.5" role="tablist" aria-label="Nightlife" data-testid="nightlife-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`nightlife-tab-${k}`}
            className={`rounded px-2 py-1 text-xs font-semibold ${tab === k ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`}>{label}</button>
        ))}
      </nav>

      {tab === 'people' && (
        <section className="space-y-2" data-testid="nightlife-people">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Who" data-testid="nightlife-filters">
            {FILTERS.filter((f) => on || !ADULT_FILTERS.includes(f)).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} data-testid={`nightlife-filter-${f}`}
                className={`rounded-full px-2 py-0.5 text-[11px] ${filter === f ? 'bg-gold-500 text-noir-950 font-semibold' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`}>
                {FILTER_LABEL[f]} <span className="opacity-70">{counts[f]}</span>
              </button>
            ))}
            <button type="button" aria-pressed={byLooks} onClick={() => setByLooks((x) => !x)} data-testid="nightlife-sort-looks"
              className={`rounded-full px-2 py-0.5 text-[11px] ${byLooks ? 'bg-rose-500/80 text-noir-950 font-semibold' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`}>Sort by looks</button>
          </div>
          {roster.length === 0 ? <p className="text-xs text-stone-500">Nobody on this list right now.</p> : <ul className="space-y-2">{roster.map((r) => <PersonRow key={r.id} s={s} r={r} onCard={setCard} />)}</ul>}
          {nightRoster(s, filter).length > 40 && <p className="text-[11px] text-stone-500">And {nightRoster(s, filter).length - 40} more; pick a list above.</p>}
        </section>
      )}

      {tab === 'houses' && (
        <section className="space-y-2" data-testid="nightlife-houses">
          <p className="text-[11px] text-stone-400">Each madam runs her own house: her territory, her money, her girls, her deal. Protection pays the Family 15% of her take (at least $100 a week); a partnership 30%, and her trouble is yours. When another family leans on a house you protect, back her or lose her.</p>
          <ul className="space-y-2">{houseRows(s).map((h) => <HouseCard key={h.id} s={s} h={h} onCard={setCard} />)}</ul>
          <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => shell.go('town.night')}>The Ears & the Madam ▸</button>
        </section>
      )}

      {tab === 'promises' && (
        <section className="space-y-3" data-testid="nightlife-promises">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Your goomars</div>
            {goomars.length === 0 ? <p className="mt-1 text-xs text-stone-500">None. Only someone you are already seeing can be asked, and she decides. Open her calling card: "Make her your goomar".</p> : (
              <ul className="mt-1 space-y-2">{goomars.map((g) => {
                const c = s.characters[g.id];
                if (!c) return null;
                return (
                  <li key={g.id} className="rounded-md border border-rose-400/40 bg-noir-800/50 p-2.5" data-testid="night-goomar">
                    <div className="flex gap-2.5 items-center">
                      <Face s={s} c={c} size={40} />
                      <div className="min-w-0 flex-1 text-[12px] text-stone-300">
                        <div className="font-semibold text-stone-100">{displayName(c)}</div>
                        <div>{g.where} · {fmt$(g.rent)} rent + {fmt$(g.allowance)} allowance a week, from your pocket{g.missed ? <span className="text-red-300"> · {g.missed} week{g.missed === 1 ? '' : 's'} unpaid</span> : null}</div>
                        <div className="text-[11px] text-stone-500">Since week {g.since}{g.wifeKnows ? ' · your wife knows' : ''}{g.public ? ' · it is talk on the island' : ''}</div>
                      </div>
                      <button type="button" className="btn-ghost px-2 py-1 text-[11px]" onClick={() => setCard(g.id)}>Card ▸</button>
                    </div>
                  </li>
                );
              })}</ul>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Promises</div>
            {promiseRows(s).length === 0 ? <p className="mt-1 text-xs text-stone-500">No promises made. A promise of an introduction is an obligation: 26 weeks to keep it.</p> : (
              <ul className="mt-1 space-y-1.5">{promiseRows(s).map((x) => (
                <li key={x.id} className="rounded-md border border-noir-700 bg-noir-800/40 p-2 text-[12px]" data-testid="night-promise">
                  <div className="text-stone-200"><CharLink s={s} id={x.who}>{x.name}</CharLink>: {x.text}</div>
                  <div className={`text-[11px] ${x.status === 'open' ? 'text-amber-200' : x.status === 'kept' ? 'text-emerald-300' : 'text-red-300'}`}>{x.status === 'open' ? `Open: due by week ${x.due}` : x.status === 'kept' ? `Kept. ${x.result ?? ''}` : 'Broken: you never made the call.'}</div>
                  {x.status === 'open' && <div className="mt-1"><ActionRow s={s} action={{ kind: 'nightlife', op: { op: 'keep', pid: x.id } }} /></div>}
                </li>
              ))}</ul>
            )}
          </div>
          {(s.nightlife.npc ?? []).some((g) => g.known && g.ended === undefined) && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Other men's goomars (what people say)</div>
              <ul className="mt-1 text-[12px] text-stone-300 space-y-0.5">
                {s.nightlife.npc.filter((g) => g.known && g.ended === undefined).slice(0, 8).map((g) => (
                  <li key={g.man + g.her}><span className="mr-1 rounded bg-amber-900/60 px-1 text-[9px] uppercase text-amber-200">Rumor</span><CharLink s={s} id={g.man} /> keeps <CharLink s={s} id={g.her} /></li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-stone-500">Goomar terms are hers: for example {(() => { const r = nightRoster(s, 'all')[0]; if (!r) return 'an apartment and an allowance'; const t = goomarTerms(s, r.id); return `${t.where}, ${fmt$(t.rent + t.allowance)} a week`; })()}. You can keep more than one; each is her own arrangement, and they may not like sharing you.</p>
        </section>
      )}

      {tab === 'women' && <WomenSection s={s} onCard={setCard} />}

      {tab === 'lately' && (
        <section data-testid="nightlife-lately">
          <ul className="space-y-0.5 text-[12px] text-stone-300">{nightLog(s, 20).map((l, i) => <li key={i}><span className="text-stone-500">Week {l.week}:</span> {l.text}</li>)}</ul>
        </section>
      )}

      {card && <CardModal s={s} id={card} onClose={() => setCard(undefined)} />}
    </div>
  );
}
