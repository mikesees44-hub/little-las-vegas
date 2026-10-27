import { useMemo, useState } from 'react';
import { AdviceButton } from '../advice/AdviceButton';
import { ActionCard } from '../components/Orders';
import { useSheet } from '../components/People';
import { fmt$ } from '../format';
import { capos } from '../../engine/characters';
import {
  gearOffers, legitIncome, opportunityText, pathViews, recommendTier, repairCost, shortage, weeklyUpkeep,
  type DevAction, type PathView, type TierView,
} from '../../engine/develop';
import { viewDev } from '../../engine/devState';
import { GEAR, GEAR_BY_ID, MANDATES, PATHS, type GearCat, type PathId } from '../../engine/devData';
import { crewStrength, gearHolders, holderName, rivalEstimate, type CrewAssessment } from '../../engine/strength';
import type { GameState, PlayerAction } from '../../engine/types';

/**
 * FAMILY DEVELOPMENT, in Rackets & Businesses. Two views:
 *  - Technology & connections: the six paths as tabs (or all at once), every
 *    step shown — held, available (with why, and a Recommended tag when it
 *    pays), or locked with "Unlocks when …" — cost, upkeep, who pays, what it
 *    does for you first and "More…" for the rest, and an adviser to ask.
 *  - Crew equipment: the crew strength assessment (every reason), your crews
 *    against the other families (estimates, labeled), each crew's equipment,
 *    shortages and mandate, and the shop by category.
 */

const dev = (op: DevAction): PlayerAction => ({ kind: 'dev', op });
const STATUS: Record<TierView['status'], { word: string; cls: string }> = {
  held: { word: 'Yours', cls: 'chip-good' },
  available: { word: 'Available', cls: 'chip bg-gold-500/15 text-gold-300 border border-gold-600/50' },
  locked: { word: 'Locked', cls: 'chip-neutral' },
  future: { word: 'Later', cls: 'chip-neutral' },
};

/* ------------------------------------------------------------------ */
/* Technology & connections                                            */
/* ------------------------------------------------------------------ */

export function TechPanel({ s: s0 }: { s: GameState }) {
  const s = useMemo(() => viewDev(s0), [s0]);
  const paths = useMemo(() => pathViews(s), [s]);
  const [tab, setTab] = useState<PathId | 'all'>('all');
  const up = weeklyUpkeep(s);
  const inc = legitIncome(s);
  const shown = tab === 'all' ? paths : paths.filter((p) => p.def.id === tab);
  const ready = paths.filter((p) => p.next?.status === 'available').length;
  return (
    <section className="space-y-3" data-testid="dev-tech">
      <div className="rounded-md border border-noir-600 bg-noir-900/60 p-3">
        <div className="panel-title">Technology & connections</div>
        <p className="mt-1 text-xs text-stone-400">New ways of doing business open with the years and with what you have: the right hire, a business, a contact. Each step costs Family money once and every week after. The other families move ahead on their own.</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="chip-neutral">Upkeep {fmt$(up.tiers)}/wk</span>
          {inc > 0 && <span className="chip-good">Brings in {fmt$(inc)}/wk</span>}
          <span className={ready ? 'chip bg-gold-500/15 text-gold-300 border border-gold-600/50' : 'chip-neutral'}>{ready} ready to take</span>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Paths">
        {[{ id: 'all' as const, icon: '☰', label: 'All paths' }, ...PATHS].map((p) => {
          const pv = paths.find((x) => x.def.id === p.id);
          return (
            <button key={p.id} type="button" role="tab" aria-selected={tab === p.id} onClick={() => setTab(p.id)} data-testid={`dev-tab-${p.id}`}
              className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs ${tab === p.id ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'border-noir-600 bg-noir-800/70 text-stone-300 hover:border-gold-500'}`}>
              {p.icon} {p.label}{pv ? <span className="ml-1 text-stone-500">{pv.tier}/{pv.tiers.length}</span> : null}{pv?.next?.status === 'available' ? <span className="ml-1 text-gold-300">●</span> : null}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((p) => <PathCard key={p.def.id} s={s} p={p} />)}
      </div>
    </section>
  );
}

function PathCard({ s, p }: { s: GameState; p: PathView }) {
  const sheet = useSheet();
  return (
    <div className="rounded-md border border-noir-600 bg-noir-900/60 p-3" data-testid="dev-path" data-path={p.def.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-stone-100">{p.def.icon} {p.def.label}</div>
          <div className="text-[11px] text-stone-400">{p.def.blurb}</div>
        </div>
        <span className="chip-neutral shrink-0">Step {p.tier} of {p.tiers.length}</span>
      </div>
      <div className="mt-1 text-[11px] text-stone-400">
        In charge: {p.resp ? <button type="button" className="text-gold-300 underline-offset-2 hover:underline" onClick={() => sheet.open(p.resp!.id)}>{p.resp.firstName} {p.resp.lastName}</button> : <span className="text-amber-300">nobody (it would run at 60%)</span>}
        {p.resp && <span className="text-stone-500"> · works at {Math.round(p.eff * 100)}%</span>}
      </div>
      <ol className="mt-2 space-y-2">
        {p.tiers.map((t) => <TierRow key={t.def.id} s={s} t={t} next={p.next?.def.id === t.def.id} top={t.def.tier === p.tier} />)}
      </ol>
    </div>
  );
}

function TierRow({ s, t, next, top }: { s: GameState; t: TierView; next: boolean; top: boolean }) {
  const [more, setMore] = useState(false);
  const rec = recommendTier(s, t);
  const st = STATUS[t.status];
  const a = dev({ t: 'adopt', path: t.def.path });
  return (
    <li className={`rounded border px-2.5 py-2 ${t.status === 'held' ? 'border-emerald-800/60 bg-emerald-900/10' : next ? 'border-gold-700/60 bg-noir-800/70' : 'border-noir-700 bg-noir-800/40'}`} data-testid="dev-tier" data-tier={t.def.id} data-status={t.status}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={st.cls}>{st.word}</span>
        {rec && <span className="chip bg-emerald-800/40 text-emerald-200 border border-emerald-600/60" data-testid="dev-rec">★ Recommended</span>}
        <span className="text-sm font-semibold text-stone-100">{t.def.name}</span>
      </div>
      <div className="mt-1 text-xs text-stone-200"><span className="text-stone-500">For you: </span>{t.def.effect}</div>
      <div className="mt-0.5 text-[11px] tabular-nums text-stone-400">{fmt$(t.cost)} once · {fmt$(t.upkeep)}/wk · Family money pays</div>
      {rec && <div className="mt-0.5 text-[11px] text-emerald-300">Why now: {rec}.</div>}
      {t.status === 'available' && <div className="mt-0.5 text-[11px] text-gold-300">{opportunityText(t)}</div>}
      {t.status === 'locked' && <div className="mt-0.5 text-[11px] text-stone-400">Unlocks when {t.needs.join('; ')}.</div>}
      {t.status === 'future' && <div className="mt-0.5 text-[11px] text-stone-400">Unlocks around {t.def.from}{t.needs.length ? `, once ${t.needs.join('; ')}` : ''}.</div>}
      <button type="button" className="mt-1 text-[11px] text-stone-500 hover:text-stone-300" onClick={() => setMore(!more)} aria-expanded={more}>{more ? 'Less' : 'More…'}</button>
      {more && (
        <div className="mt-1 space-y-0.5 text-[11px] text-stone-400">
          <div>{t.def.line}</div>
          {t.def.catch && <div className="text-amber-300">The catch: {t.def.catch}</div>}
          <div>Available from {t.def.from}. {t.resp ? `${t.resp.firstName} ${t.resp.lastName} would answer for it (${Math.round(t.eff * 100)}%).` : 'Nobody to answer for it: 60%.'}</div>
        </div>
      )}
      {next && t.status !== 'held' && (
        <div className="mt-2 space-y-1.5">
          <ActionCard s={s} action={a} compact />
          <AdviceButton s={s} subject={{ kind: 'action', action: a }} auto={false} label={t.def.path === 'books' || t.def.path === 'legit' ? 'Ask the bagman' : 'Ask for advice'} />
        </div>
      )}
      {top && t.status === 'held' && <div className="mt-1.5"><ActionCard s={s} action={dev({ t: 'drop', path: t.def.path })} compact label={`Give it up (saves ${fmt$(t.upkeep)}/wk)`} /></div>}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Crew equipment                                                      */
/* ------------------------------------------------------------------ */

export function GearPanel({ s: s0 }: { s: GameState }) {
  const s = useMemo(() => viewDev(s0), [s0]);
  const a = useMemo(() => crewStrength(s), [s]);
  const up = weeklyUpkeep(s);
  return (
    <section className="space-y-3" data-testid="dev-gear">
      <StrengthCard s={s} />
      <Compare s={s} total={a.total} />
      <div className="rounded-md border border-noir-600 bg-noir-900/60 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="panel-title">Your crews</div>
          <span className="text-[11px] text-stone-400 tabular-nums">Equipment upkeep {fmt$(up.gear)}/wk</span>
        </div>
        <p className="mt-1 text-[11px] text-stone-500">Each piece belongs to one crew. It only counts where there are men to use it.</p>
        <ul className="mt-2 space-y-2">{a.crews.map((c) => <CrewRow key={c.holder} s={s} c={c} />)}</ul>
      </div>
      <Shop s={s} />
    </section>
  );
}

function StrengthCard({ s }: { s: GameState }) {
  const a = crewStrength(s);
  const [more, setMore] = useState(false);
  return (
    <div className="rounded-md border border-noir-600 bg-noir-900/60 p-3" data-testid="dev-strength">
      <div className="flex items-baseline justify-between gap-2">
        <div className="panel-title">Crew strength</div>
        <div className="text-2xl font-semibold tabular-nums text-gold-300" data-testid="dev-strength-total">{Math.round(a.total)}<span className="text-xs text-stone-500"> / 100</span></div>
      </div>
      <p className="text-[11px] text-stone-500">What your crews would bring to a fight this week. Wars, raids and the other families read this number.</p>
      <ul className="mt-2 space-y-1 text-xs">
        {a.parts.map((p) => (
          <li key={p.key} className="grid grid-cols-[1fr_auto] gap-x-2">
            <span className="text-stone-200">{p.label}<span className="block text-[11px] text-stone-500">{p.why}</span></span>
            <span className={`tabular-nums ${p.value < 0 ? 'text-red-300' : p.key === 'men' ? 'text-stone-100' : 'text-emerald-300'}`}>{p.value > 0 && p.key !== 'men' ? '+' : ''}{p.value}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="mt-1 text-[11px] text-stone-500 hover:text-stone-300" onClick={() => setMore(!more)} aria-expanded={more}>{more ? 'Less' : 'Strengths and weaknesses…'}</button>
      {more && (
        <div className="mt-1 grid gap-2 sm:grid-cols-2 text-[11px]">
          <ul className="space-y-0.5 text-emerald-300">{a.strengths.length ? a.strengths.map((x, i) => <li key={i}>+ {x}</li>) : <li className="text-stone-500">Nothing stands out yet.</li>}</ul>
          <ul className="space-y-0.5 text-amber-300">{a.weaknesses.length ? a.weaknesses.map((x, i) => <li key={i}>− {x}</li>) : <li className="text-stone-500">No glaring weakness.</li>}</ul>
        </div>
      )}
    </div>
  );
}

function Compare({ s, total }: { s: GameState; total: number }) {
  const rivals = s.rivals.filter((r) => r.kind === 'mob');
  const bar = (lo: number, hi: number, cls: string) => <div className="relative h-2 rounded bg-noir-700"><div className={`absolute h-2 rounded ${cls}`} style={{ left: `${lo}%`, width: `${Math.max(1.5, hi - lo)}%` }} /></div>;
  return (
    <div className="rounded-md border border-noir-600 bg-noir-900/60 p-3" data-testid="dev-compare">
      <div className="panel-title">Against the other families</div>
      <p className="text-[11px] text-stone-500">Theirs are estimates: how close depends on your Information path. What you have heard is below each.</p>
      <ul className="mt-2 space-y-2 text-xs">
        <li><div className="flex justify-between"><span className="text-stone-100">Your crews</span><span className="tabular-nums text-gold-300">{Math.round(total)} (known)</span></div>{bar(0, total, 'bg-gold-500')}</li>
        {rivals.map((r) => {
          const e = rivalEstimate(s, r);
          return (
            <li key={r.id} data-testid="dev-rival">
              <div className="flex flex-wrap justify-between gap-x-2"><span className="text-stone-100">{r.name}</span><span className="tabular-nums text-amber-300">{e.label} · {e.gearWord}</span></div>
              {bar(e.lo, e.hi, 'bg-amber-600/80')}
              {e.known.length > 0 && <div className="mt-0.5 text-[11px] text-stone-500">Heard: {e.known.join(' ')}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CrewRow({ s, c }: { s: GameState; c: CrewAssessment }) {
  const stacks = (s.dev?.gear ?? []).filter((g) => g.holder === c.holder);
  const level = c.capoId ? s.dev?.mandates[c.capoId] ?? 0 : 0;
  const [open, setOpen] = useState(false);
  const short = Math.max(0, c.men - c.gear.armed);
  return (
    <li className="rounded border border-noir-700 bg-noir-800/60 px-2.5 py-2" data-testid="dev-crew" data-holder={c.holder}>
      <button type="button" className="w-full text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="font-semibold text-sm text-stone-100">{c.name}</span>
          <span className="text-xs tabular-nums text-gold-300">{c.total} strength</span>
        </div>
        <div className="text-[11px] text-stone-400">
          {c.men} of {c.members} men free{c.out.length ? ` (${c.out.join(', ')})` : ''} · {c.gear.armed}/{c.men} equipped · {c.gear.cars} car{c.gear.cars === 1 ? '' : 's'}{c.gear.armed ? ` · condition ${Math.round(c.gear.cond * 100)}%` : ''}
        </div>
        {c.shortages.length > 0 && <div className="text-[11px] text-amber-300">{c.shortages.join(' · ')}</div>}
        {c.strengths.length > 0 && <div className="text-[11px] text-emerald-300">{c.strengths.join(' · ')}</div>}
        <span className="text-[11px] text-stone-500">{open ? 'Less' : 'Equipment, mandate…'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {!stacks.length && <div className="text-[11px] text-stone-500">No equipment.{short ? ' Buy some below, or move some from another crew.' : ''}</div>}
          {stacks.map((g) => (
            <div key={g.id} className="rounded border border-noir-700 bg-noir-900/50 px-2 py-1.5" data-testid="dev-stack">
              <div className="text-xs text-stone-200">{GEAR_BY_ID[g.cat].icon} {g.n} {GEAR_BY_ID[g.cat].label.toLowerCase()} · condition {Math.round(g.cond * 100)}% · {fmt$(Math.round(g.n * GEAR_BY_ID[g.cat].upkeep))}/wk</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <MoveStack s={s} stack={g.id} from={c.holder} />
                {g.cond < 0.95 && <ActionCard s={s} compact action={dev({ t: 'repair', stack: g.id })} label={`Repair (${fmt$(repairCost(s, g))})`} />}
                <ActionCard s={s} compact action={dev({ t: 'scrap', stack: g.id })} label="Get rid of it" />
              </div>
            </div>
          ))}
          {c.capoId && (
            <div data-testid="dev-mandate">
              <div className="text-[10px] uppercase tracking-widest text-stone-500">His mandate on equipment (now: {MANDATES[level].label})</div>
              <div className="mt-1 grid gap-1.5 sm:grid-cols-3">
                {MANDATES.filter((m) => m.level !== level).map((m) => <ActionCard key={m.level} s={s} compact action={dev({ t: 'mandate', capo: c.capoId!, level: m.level })} label={`${m.label}${m.budget ? ` (up to ${fmt$(m.budget)}/month)` : ''}`} />)}
              </div>
            </div>
          )}
          {c.capoId && <AdviceButton s={s} subject={{ kind: 'action', action: dev({ t: 'buy', cat: 'handguns', n: Math.max(1, short), holder: c.holder }) }} auto={false} label={`Ask ${s.characters[c.capoId]?.firstName ?? 'him'} about his crew's gear`} />}
        </div>
      )}
    </li>
  );
}

function Shop({ s }: { s: GameState }) {
  const offers = gearOffers(s);
  const [cat, setCat] = useState<GearCat>('handguns');
  const holders = gearHolders(s);
  const neediest = [...holders].sort((a, b) => shortage(s, b) - shortage(s, a))[0] ?? 'family';
  const [holder, setHolder] = useState<string>(neediest);
  const h = holders.includes(holder) ? holder : 'family';
  const def = GEAR_BY_ID[cat];
  const off = offers.find((o) => o.def.id === cat)!;
  const need = def.role === 'car' ? Math.max(0, Math.ceil(Math.max(1, shortageMen(s, h)) / 3) - carsOf(s, h)) : shortage(s, h);
  const [qty, setQty] = useState<number | undefined>();
  const n = Math.max(1, qty ?? (need || 2));
  const action = dev({ t: 'buy', cat, n, holder: h });
  const capoNames = useMemo(() => new Set(capos(s).map((c) => c.id)), [s]);
  return (
    <div className="rounded-md border border-noir-600 bg-noir-900/60 p-3" data-testid="dev-shop">
      <div className="panel-title">Buy equipment</div>
      <p className="text-[11px] text-stone-500">Broad kinds only. Family money pays; prices rise with the years. Heavier equipment raises fear on the street, and heat and resentment with it.</p>
      <div className="mt-2 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Kinds of equipment">
        {GEAR.map((g) => {
          const o = offers.find((x) => x.def.id === g.id)!;
          return (
            <button key={g.id} type="button" role="tab" aria-selected={cat === g.id} onClick={() => { setCat(g.id); setQty(undefined); }} data-testid={`dev-cat-${g.id}`}
              className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs ${cat === g.id ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'border-noir-600 bg-noir-800/70 text-stone-300'} ${o.open ? '' : 'opacity-70'}`}>
              {g.icon} {g.label}{o.open ? '' : ' 🔒'}
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-stone-200">{def.blurb}</div>
      <div className="mt-0.5 text-[11px] tabular-nums text-stone-400">{fmt$(off.price)} a {def.unit} · {fmt$(def.upkeep)}/wk each · Family money pays</div>
      {!off.open && <div className="mt-1 text-[11px] text-stone-400">Unlocks when: {off.why?.replace(/^Needs /, 'you have ')}.</div>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] text-stone-400">For
          <select className="mt-0.5 block w-full rounded border border-noir-600 bg-noir-800 px-2 py-1.5 text-sm text-stone-100" value={h} onChange={(e) => { setHolder(e.target.value); setQty(undefined); }} data-testid="dev-shop-holder">
            {holders.map((x) => <option key={x} value={x}>{holderName(s, x)}{capoNames.has(x) || x === 'family' ? ` — ${shortage(s, x)} short` : ''}</option>)}
          </select>
        </label>
        <div className="text-[11px] text-stone-400">How many
          <div className="mt-0.5 flex items-center gap-1.5">
            <button type="button" className="btn-ghost px-3 py-1" onClick={() => setQty(Math.max(1, n - 1))} aria-label="One fewer">−</button>
            <span className="w-8 text-center text-sm tabular-nums text-stone-100" data-testid="dev-shop-n">{n}</span>
            <button type="button" className="btn-ghost px-3 py-1" onClick={() => setQty(Math.min(20, n + 1))} aria-label="One more">+</button>
            {need > 0 && n !== need && <button type="button" className="btn-ghost text-[11px] py-1" onClick={() => setQty(need)}>Just the shortage ({need})</button>}
          </div>
        </div>
      </div>
      {need === 0 && def.role === 'weapon' && <div className="mt-1 text-[11px] text-amber-300">This crew already has a piece for every free man: more only helps if it is heavier or the old is worn.</div>}
      <div className="mt-2"><ActionCard s={s} action={action} /></div>
      <div className="mt-1.5"><AdviceButton s={s} subject={{ kind: 'action', action }} auto={false} label={h !== 'family' ? `Ask ${s.characters[h]?.firstName ?? 'the capo'} about it` : 'Ask for advice'} /></div>
    </div>
  );
}

function shortageMen(s: GameState, holder: string): number {
  return crewStrength(s).crews.find((x) => x.holder === holder)?.men ?? 0;
}
function carsOf(s: GameState, holder: string): number {
  return (s.dev?.gear ?? []).filter((g) => g.holder === holder && g.cat === 'cars').reduce((a, g) => a + g.n, 0);
}

function MoveStack({ s, stack, from }: { s: GameState; stack: string; from: string }) {
  const others = gearHolders(s).filter((h) => h !== from);
  const [to, setTo] = useState(others[0] ?? 'family');
  if (!others.length) return null;
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <select className="rounded border border-noir-600 bg-noir-800 px-2 py-1 text-xs text-stone-100" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Move to">
        {others.map((h) => <option key={h} value={h}>{holderName(s, h)}</option>)}
      </select>
      <div className="min-w-[12rem] flex-1"><ActionCard s={s} compact action={dev({ t: 'assign', stack, holder: to })} label={`Move to ${holderName(s, to).toLowerCase()}`} /></div>
    </div>
  );
}
