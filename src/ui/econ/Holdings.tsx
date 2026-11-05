import { useState } from 'react';
import { expectedTake, isOpen, owned } from '../../engine/business';
import { CATALOG } from '../../engine/catalog';
import { placeName } from '../../engine/econ';
import type { Lot, Manager, Oversight } from '../../engine/econState';
import {
  OVERSIGHT, ROLE_LABEL, SOURCE_LABEL, assistantCandidates, crewCandidates, familyCandidates, isClub, managerSkimRate, proCandidates, staffAmbition,
} from '../../engine/managers';
import {
  BUILD_STAGES, SUPPLY, STAGE_LABEL, USES, USES_BY_ID, supplyChain, USE_CAT_LABEL, ZONES_BY_ID, buildCost, buildWeeks, lotName, ownedLots, propertyNet, stageWeeks, underConstruction,
} from '../../engine/property';
import { collectPreview, nextStep, racketSummary, stepsOf, tree } from '../../engine/rackets';
import { permitAuthority } from '../../engine/construction';
import { groupOfBiz, groupOfLot, grouped } from '../../engine/propertyGroups';
import type { Business, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { SellButton } from '../components/Businesses';
import { CandidatePicker } from '../clarity/CandidatePicker';
import { CharLink } from '../components/People';
import { PutMoneyToWork } from './PutMoneyToWork';

/**
 * Holdings: every business and building the house owns, who runs it, what it
 * makes, what it is building toward, and (for clubs) the people who work there.
 */
export function Holdings({ s }: { s: GameState }) {
  const biz = owned(s);
  const lots = ownedLots(s);
  const ms = s.econ?.managers ?? {};
  const weekly = biz.reduce((a, b) => a + expectedTake(s, b), 0);
  const propNet = lots.reduce((a, l) => {
    if (l.bizId || l.stage !== 'open') return a;
    if (l.tenant && !l.operating) return a + l.rent;
    const n = propertyNet(s, l);
    return a + n.rev - n.exp;
  }, 0);
  const salaries = Object.values(ms).reduce((a, m) => a + m.salary, 0);
  const building = lots.filter(underConstruction);
  return (
    <div className="space-y-5" data-testid="holdings">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Businesses" value={`${biz.length}`} sub={`~${fmt$(weekly)}/wk take`} />
        <Stat label="Buildings" value={`${lots.length}`} sub={`~${fmt$(propNet)}/wk rents & receipts`} />
        <Stat label="Managers" value={`${Object.keys(ms).length}`} sub={`${fmt$(salaries)}/wk in salaries`} />
        <Stat label="Under construction" value={`${building.length}`} sub={building.length ? building.map((l) => STAGE_LABEL[l.stage!]).join(', ') : 'nothing breaking ground'} />
      </section>

      <PutMoneyToWork s={s} />

      <OwnedGroups s={s} biz={biz} lots={lots} ms={ms} />

      <SupplyChain s={s} />
    </div>
  );
}

/** Everything you own in one list, grouped by type (or by neighborhood), each group folding open. */
function OwnedGroups({ s, biz, lots, ms }: { s: GameState; biz: Business[]; lots: Lot[]; ms: Record<string, Manager> }) {
  const [by, setBy] = useState<'type' | 'place'>('type');
  const [shut, setShut] = useState<Record<string, boolean>>({});
  type Item = { key: string; biz?: Business; lot?: Lot; take: number };
  // A building that houses one of your businesses shows once, as the business.
  const items: Item[] = [
    ...biz.map((b) => ({ key: b.id, biz: b, take: expectedTake(s, b) })),
    ...lots.filter((l) => !l.bizId || !biz.some((b) => b.id === l.bizId)).map((l) => {
      let take = 0;
      if (l.stage === 'open' && !l.bizId) {
        if (l.tenant && !l.operating) take = l.rent;
        else { const n = propertyNet(s, l); take = n.rev - n.exp; }
      }
      return { key: `lot:${l.id}`, lot: l, take };
    }),
  ];
  const groups = by === 'type'
    ? grouped(items, (x) => (x.biz ? groupOfBiz(x.biz.kind) : groupOfLot(s, x.lot!))).map((g) => ({ id: g.group.id as string, title: `${g.group.icon} ${g.group.label}`, items: g.items }))
    : (() => {
        const zone = (x: Item) => (x.biz ? s.districts.find((d) => d.id === x.biz!.districtId)?.name : ZONES_BY_ID[x.lot!.zone as keyof typeof ZONES_BY_ID]?.name) ?? 'Elsewhere';
        const names = [...new Set(items.map(zone))].sort();
        return names.map((n) => ({ id: n, title: `📍 ${n}`, items: items.filter((x) => zone(x) === n) }));
      })();
  return (
    <section data-testid="owned-groups">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">What you own</div>
        <div className="flex gap-1 text-[11px]" role="radiogroup" aria-label="Group by">
          {(['type', 'place'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={by === k} onClick={() => setBy(k)}
              className={`rounded border px-2 py-0.5 ${by === k ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>
              {k === 'type' ? 'By type' : 'By neighborhood'}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 && <p className="text-xs text-stone-500 mt-1">You own nothing yet. Open a place below, or buy a building from the map.</p>}
      <div className="mt-2 space-y-2">
        {groups.map((g) => {
          const open = !shut[g.id];
          const take = g.items.reduce((a, x) => a + x.take, 0);
          return (
            <div key={g.id} className="rounded-md border border-noir-700 bg-noir-900/40" data-testid="owned-group">
              <button type="button" className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left" onClick={() => setShut((x) => ({ ...x, [g.id]: open }))} aria-expanded={open}>
                <span className="font-semibold text-stone-100">{g.title} <span className="text-stone-500 font-normal">· {g.items.length}</span></span>
                <span className="text-xs tabular-nums text-gold-300">~{fmt$(take)}/wk <span className="text-stone-500">{open ? '▾' : '▸'}</span></span>
              </button>
              {open && (
                <ul className="space-y-2 px-2 pb-2">
                  {g.items.map((x) => (x.biz ? <BizRow key={x.key} s={s} b={x.biz} m={ms[x.biz.id]} /> : <LotRow key={x.key} s={s} l={x.lot!} m={ms[`lot:${x.lot!.id}`]} />))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The construction supply chain, the city's bids, your contracts, and rival builds you could slow. */
function SupplyChain({ s }: { s: GameState }) {
  const sc = supplyChain(s);
  const e = s.econ;
  const rivalSites = (e?.lots ?? []).filter((l) => underConstruction(l) && l.status === 'rival').slice(0, 4);
  return (
    <section data-testid="supply-chain">
      <div className="panel-title">Construction supply chain</div>
      <div className="mt-1 grid gap-1 sm:grid-cols-4 text-xs">
        {SUPPLY.map((x) => (
          <div key={x.kind} className={`rounded border px-2 py-1 ${sc.owned.includes(x.kind) ? 'border-gold-500 text-gold-200' : 'border-noir-700 text-stone-500'}`}>
            <div className="font-semibold">{CATALOG[x.kind].name}</div>
            <div>{sc.owned.includes(x.kind) ? 'yours' : 'not yours'} · −{Math.round(x.cost * 100)}% cost{x.time ? `, −${Math.round(x.time * 100)}% time` : ''}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-stone-500 mt-1">Your own builds: −{Math.round(sc.cost * 100)}% cost, −{Math.round(sc.time * 100)}% time, fewer failed inspections. Others' builds pay your companies when you hold the contract or supply them. {e?.stats.contractsWon ? `${e.stats.contractsWon} contracts won so far.` : ''}</p>
      {(e?.contracts?.length ?? 0) > 0 && (
        <ul className="text-xs mt-1">
          {e!.contracts.map((c) => <li key={c.id} className="text-stone-300">{c.name} — {fmt$(c.weekly)}/wk, {c.weeksLeft} wk left</li>)}
        </ul>
      )}
      {(e?.tenders?.length ?? 0) > 0 && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {e!.tenders.map((t) => <ActionCard key={t.id} s={s} action={{ kind: 'econ', op: { type: 'bid', contractId: t.id } }} />)}
        </div>
      )}
      {rivalSites.length > 0 && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {rivalSites.map((l) => <ActionCard key={l.id} s={s} action={{ kind: 'econ', op: { type: 'slowRival', lotId: l.id } }} compact />)}
        </div>
      )}
    </section>
  );
}

function BizRow({ s, b, m }: { s: GameState; b: Business; m?: Manager }) {
  const def = CATALOG[b.kind];
  const steps = stepsOf(s, b);
  const nxt = nextStep(s, b);
  const sum = racketSummary(s, b);
  const staff = isClub(b) ? s.econ?.staff[b.id] ?? [] : [];
  const lastNet = s.econ?.rackets[b.id]?.lastNet;
  return (
    <li className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="holding-biz">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="text-stone-100 font-semibold">{b.name}</div>
          <div className="text-[11px] text-stone-500">
            {def.name} · {s.districts.find((d) => d.id === b.districtId)?.name ?? ZONES_BY_ID[b.districtId.replace('zone:', '') as 'ac']?.name ?? '—'}
            {tree(b.kind).length > 0 && <> · tier {steps.length}/{tree(b.kind).length}</>}
            {sum && <> · {sum}</>}
          </div>
        </div>
        <div className="text-right text-xs tabular-nums">
          <div className={isOpen(s, b) ? 'text-gold-300' : 'text-red-400'}>{isOpen(s, b) ? `~${fmt$(expectedTake(s, b))}/wk expected` : `padlocked to wk ${b.closedUntil}`}</div>
          {lastNet !== undefined && <div className={lastNet < 0 ? 'text-red-400' : 'text-stone-400'}>last week {fmt$(lastNet)}</div>}
          {b.kind !== 'casino' && <SellButton s={s} id={b.id} />}
          <div className="text-stone-500">upkeep {fmt$(b.upkeep)}</div>
        </div>
      </div>
      <ManagerLine s={s} k={b.id} m={m} />
      {staff.length > 0 && (
        <details className="mt-1">
          <summary className="text-[11px] text-stone-400 cursor-pointer">Staff ({staff.filter((x) => !x.fate).length})</summary>
          <ul className="mt-1 text-[11px] grid sm:grid-cols-2 gap-x-3">
            {staff.map((x) => {
              const amb = staffAmbition(x);
              return (
                <li key={x.id} className={x.fate ? 'text-stone-600' : 'text-stone-300'}>
                  {x.name} — {ROLE_LABEL[x.role].toLowerCase()} · skill {x.skill}{x.fate ? ` · ${x.fate}` : amb ? <span className="text-amber-400"> · {amb.text}</span> : ''}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        {nxt && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'upgrade', bizId: b.id } }} compact />}
        {/* The book's markers come in on their own every week (money.ts markerPayRate); no chasing them by hand. */}
        {['vending', 'numbers', 'cargo'].includes(b.kind) && !collectPreview(s, b).why && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'collect', bizId: b.id } }} compact />}
      </div>
    </li>
  );
}

function LotRow({ s, l, m }: { s: GameState; l: Lot; m?: Manager }) {
  const u = l.use ? USES_BY_ID[l.use] : undefined;
  const [use, setUse] = useState<string>('');
  const z = ZONES_BY_ID[l.zone];
  const net = l.stage === 'open' && !l.bizId ? (l.tenant && !l.operating ? { rev: l.rent, exp: 0 } : propertyNet(s, l)) : undefined;
  const fits = USES.filter((x) => !x.npcOnly && (x.zones ? x.zones.includes(l.zone) : z.cats.includes(x.cat)) && (x.minYear ?? 0) <= s.date.y);
  return (
    <li className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="holding-lot">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="text-stone-100 font-semibold">{lotName(l)}</div>
          <div className="text-[11px] text-stone-500">
            {z.name} · {l.status === 'leased' ? `leased ${fmt$(l.rent)}/wk` : 'owned'}
            {l.stage === 'open' && <> · built {l.builtYear} · condition {Math.round(l.condition)}%{l.renovated ? ` · renovated ${l.renovated}` : ''}</>}
            {l.tenant && !l.operating && <> · tenant: {l.tenant}</>}
            {l.bizId && <> · runs as {s.businesses.find((b) => b.id === l.bizId)?.name}</>}
          </div>
        </div>
        {net && <div className="text-right text-xs tabular-nums"><div className={net.rev - net.exp >= 0 ? 'text-gold-300' : 'text-red-400'}>{fmt$(net.rev - net.exp)}/wk</div><div className="text-stone-500">takes {fmt$(net.rev)} · costs {fmt$(net.exp)}</div></div>}
      </div>
      {underConstruction(l) && <StageBar s={s} l={l} />}
      {l.stalled && <div className="text-[11px] text-red-400 mt-1">Stalled: {l.stalled}</div>}
      {l.stage === 'open' && !l.bizId && (!l.tenant || l.operating) && <ManagerLine s={s} k={`lot:${l.id}`} m={m} />}
      {l.stage === 'permits' && l.permit && (
        <div className="text-[11px] text-stone-400 mt-1">Permits: building inspector {l.permit.inspector ? `${l.permit.inspector} wk` : 'signed'} · {permitAuthority(s).zoning} {l.permit.zoning ? `${l.permit.zoning} wk` : 'approved'}</div>
      )}
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        {l.stage === 'permits' && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'permits', lotId: l.id } }} compact />}
        {(l.stage === 'permits' || l.stopWork) && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'bribeInspector', lotId: l.id } }} compact />}
        {l.stage === 'permits' && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'puppetPermit', lotId: l.id } }} compact />}
        {l.stopWork && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'fixCode', lotId: l.id } }} compact />}
        {l.stage === 'open' && u && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'renovate', lotId: l.id } }} compact />}
        {l.status === 'owned' && !underConstruction(l) && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'sellLot', lotId: l.id } }} compact />}
      </div>
      {l.stage === 'purchase' && (
        <div className="mt-1.5">
          <select className="rounded bg-noir-900 border border-noir-600 p-1 text-xs w-full" value={use} onChange={(e) => setUse(e.target.value)} aria-label="What to build">
            <option value="">Build what? ({fits.length} uses fit {z.name})</option>
            {(Object.keys(USE_CAT_LABEL) as (keyof typeof USE_CAT_LABEL)[]).map((c) => (
              <optgroup key={c} label={USE_CAT_LABEL[c]}>
                {fits.filter((x) => x.cat === c).map((x) => <option key={x.id} value={x.id}>{x.name} — {fmt$(buildCost(l, x, s))}, {buildWeeks(l, x, s)} wk</option>)}
              </optgroup>
            ))}
          </select>
          {use && <div className="mt-1"><ActionCard s={s} action={{ kind: 'econ', op: { type: 'build', lotId: l.id, use } }} /></div>}
        </div>
      )}
    </li>
  );
}

/** The construction stages as a bar: done, current (with weeks), to come. */
export function StageBar({ s, l }: { s: GameState; l: Lot }) {
  const u = USES_BY_ID[l.use!];
  const w = stageWeeks(buildWeeks(l, u, s));
  const cur = BUILD_STAGES.indexOf(l.stage as (typeof BUILD_STAGES)[number]);
  return (
    <div className="mt-1.5" data-testid="stage-bar">
      <div className="flex gap-0.5">
        {BUILD_STAGES.map((st, i) => (
          <div key={st} className="flex-1" title={`${STAGE_LABEL[st]}: ${w[st]} wk`}>
            <div className={`h-1.5 rounded-sm ${i < cur ? 'bg-gold-400' : i === cur ? 'bg-amber-600' : 'bg-noir-700'}`} />
            <div className={`text-[9px] mt-0.5 truncate ${i === cur ? 'text-amber-300' : 'text-stone-500'}`}>{STAGE_LABEL[st]}</div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-stone-400">{STAGE_LABEL[l.stage!]}: week {(l.stageWeek ?? 0) + 1} of {w[l.stage!]} — then {cur + 1 < BUILD_STAGES.length ? STAGE_LABEL[BUILD_STAGES[cur + 1]].toLowerCase() : 'the doors open'}</div>
    </div>
  );
}

function ManagerLine({ s, k, m }: { s: GameState; k: string; m?: Manager }) {
  const [open, setOpen] = useState(false);
  const audited = s.econ?.cooldowns[`audited:${k}`] !== undefined || (m?.found ?? 0) > 0;
  const honestKnown = m && (m.source !== 'pro' || audited);
  return (
    <div className="mt-1 text-[11px]">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="text-stone-500">Manager:</span>
        {m ? (
          <>
            {m.charId ? <CharLink s={s} id={m.charId} /> : <span className="text-stone-200">{m.name}</span>}
            <span className="text-stone-500">{SOURCE_LABEL[m.source].toLowerCase()} · skill {m.skill} · loyalty {m.loyalty} · honesty {honestKnown ? m.honesty : '?'} · {fmt$(m.salary)}/wk{m.share ? ` + ${Math.round(m.share * 100)}%` : ''} · {OVERSIGHT[m.oversight].name.toLowerCase()} oversight</span>
            {(m.found ?? 0) > 0 && <span className="text-red-400">· caught taking {fmt$(m.found!)}</span>}
            {honestKnown && managerSkimRate(s, m) > 0 && <span className="text-amber-400">· light-fingered</span>}
            {m.assistantId && <span className="text-stone-400">· assistant <CharLink s={s} id={m.assistantId} /></span>}
          </>
        ) : <span className="text-stone-400">nobody — the crew and the counter staff run it (no salary, no bonus)</span>}
        <button className="text-gold-300 hover:underline ml-auto" onClick={() => setOpen(!open)}>{open ? 'close' : m ? 'manage…' : 'put someone in charge…'}</button>
      </div>
      {open && <ManagerPicker s={s} k={k} m={m} />}
    </div>
  );
}

function ManagerPicker({ s, k, m }: { s: GameState; k: string; m?: Manager }) {
  const fam = familyCandidates(s).slice(0, 4);
  const crewC = crewCandidates(s).sort((a, b) => b.attributes.business - a.attributes.business).slice(0, 4);
  const pros = proCandidates(s, k);
  const kids = assistantCandidates(s);
  return (
    <div className="mt-1.5 space-y-2 rounded border border-noir-700 p-2 bg-noir-900/50" data-testid="manager-picker">
      {m && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Oversight</div>
          <div className="grid gap-1.5 sm:grid-cols-2 mt-1">
            {(Object.keys(OVERSIGHT) as Oversight[]).filter((o) => o !== m.oversight).map((o) => <ActionCard key={o} s={s} action={{ kind: 'econ', op: { type: 'oversight', key: k, level: o } }} compact />)}
            <ActionCard s={s} action={{ kind: 'econ', op: { type: 'audit', key: k } }} compact />
            {kids.slice(0, 2).map((c) => <ActionCard key={c.id} s={s} action={{ kind: 'econ', op: { type: 'assistant', key: k, charId: c.id } }} compact />)}
          </div>
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">Family ({fam.length}), crew ({crewC.length}) and {pros.length} answering the ad at {placeName(s, k)}</div>
        <div className="mt-1">
          <CandidatePicker s={s} role={{ kind: 'manager', key: k }} pool={[...fam, ...crewC.filter((c) => !c.dynasty)].map((c) => c.id)} limit={6} />
        </div>
        {pros.length > 0 && <p className="mt-1 text-[10px] text-stone-500 italic">What the references say: {pros.map((p) => `${p.name} — ${p.hint.toLowerCase()}`).join('; ')}.</p>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-md bg-noir-800 border border-noir-700 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${warn ? 'text-red-400' : 'text-gold-300'}`}>{value}</div>
      {sub && <div className="text-[11px] text-stone-500">{sub}</div>}
    </div>
  );
}
