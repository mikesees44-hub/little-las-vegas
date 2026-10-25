import { useState } from 'react';
import { expectedTake, isOpen, owned } from '../../engine/business';
import { CATALOG } from '../../engine/catalog';
import { placeName } from '../../engine/econ';
import type { Lot, Manager, Oversight } from '../../engine/econState';
import {
  OVERSIGHT, ROLE_LABEL, SOURCE_LABEL, assistantCandidates, crewCandidates, familyCandidates, isClub, managerSkimRate, proCandidates, staffAmbition,
} from '../../engine/managers';
import {
  BUILD_STAGES, STAGE_LABEL, USES, USES_BY_ID, USE_CAT_LABEL, ZONES_BY_ID, buildCost, buildWeeks, lotName, ownedLots, propertyNet, stageWeeks, underConstruction,
} from '../../engine/property';
import { nextStep, racketSummary, stepsOf, tree } from '../../engine/rackets';
import type { Business, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { CandidatePicker } from '../clarity/CandidatePicker';
import { CharLink } from '../components/People';

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

      <section>
        <div className="panel-title">Businesses</div>
        {biz.length === 0 && <p className="text-xs text-stone-500">You own nothing yet.</p>}
        <ul className="mt-2 space-y-2">
          {biz.map((b) => <BizRow key={b.id} s={s} b={b} m={ms[b.id]} />)}
        </ul>
      </section>

      <section>
        <div className="panel-title">Buildings & land</div>
        {lots.length === 0 && <p className="text-xs text-stone-500">No property yet. The real-estate market is on the map and under Real Estate.</p>}
        <ul className="mt-2 space-y-2">
          {lots.map((l) => <LotRow key={l.id} s={s} l={l} m={ms[`lot:${l.id}`]} />)}
        </ul>
      </section>
    </div>
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
        {['bookmaking', 'vending', 'numbers', 'cargo'].includes(b.kind) && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'collect', bizId: b.id } }} compact />}
      </div>
    </li>
  );
}

function LotRow({ s, l, m }: { s: GameState; l: Lot; m?: Manager }) {
  const u = l.use ? USES_BY_ID[l.use] : undefined;
  const [use, setUse] = useState<string>('');
  const z = ZONES_BY_ID[l.zone];
  const net = l.stage === 'open' && !l.bizId ? (l.tenant && !l.operating ? { rev: l.rent, exp: 0 } : propertyNet(s, l)) : undefined;
  const fits = USES.filter((x) => (x.zones ? x.zones.includes(l.zone) : z.cats.includes(x.cat)) && (x.minYear ?? 0) <= s.date.y);
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
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        {l.stage === 'permits' && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'permits', lotId: l.id } }} compact />}
        {l.stage === 'open' && u && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'renovate', lotId: l.id } }} compact />}
        {l.status === 'owned' && !underConstruction(l) && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'sellLot', lotId: l.id } }} compact />}
      </div>
      {l.stage === 'purchase' && (
        <div className="mt-1.5">
          <select className="rounded bg-noir-900 border border-noir-600 p-1 text-xs w-full" value={use} onChange={(e) => setUse(e.target.value)} aria-label="What to build">
            <option value="">Build what? ({fits.length} uses fit {z.name})</option>
            {(Object.keys(USE_CAT_LABEL) as (keyof typeof USE_CAT_LABEL)[]).map((c) => (
              <optgroup key={c} label={USE_CAT_LABEL[c]}>
                {fits.filter((x) => x.cat === c).map((x) => <option key={x.id} value={x.id}>{x.name} — {fmt$(buildCost(l, x))}, {buildWeeks(l, x)} wk</option>)}
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
  const w = stageWeeks(buildWeeks(l, u));
  const cur = BUILD_STAGES.indexOf(l.stage as (typeof BUILD_STAGES)[number]);
  void s;
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
