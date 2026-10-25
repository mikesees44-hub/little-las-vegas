import { useState } from 'react';
import { relationTo, kinCandidates } from '../../engine/applicants';
import { STYLES, SIGN_HEX, type BuildStyle, type SignColor } from '../../engine/design';
import { venueProblems, venueSummary, type EmpireCmd } from '../../engine/empire';
import { presetsOf } from '../../engine/empireAI';
import { roomCount, seatsOf, venueBuilding } from '../../engine/empireBuild';
import { CONCEPTS, DEPTS, HOUSEKEEPING, MAINTENANCE, STAFFING, WINTER } from '../../engine/empireData';
import { revenueOf, opexOf, seasonCurve } from '../../engine/empireOps';
import { PROJECTS_BY_ID, projectOptions } from '../../engine/empireProjects';
import type { ConceptId, Mode, Venue } from '../../engine/empireState';
import { crewCandidates } from '../../engine/managers';
import type { GameState } from '../../engine/types';
import { Modal } from '../components/Modal';
import { ActionCard } from '../components/Orders';
import { fmt$ } from '../format';
import { useEmpire } from './context';
import { Facade, STYLE_PALETTE } from './Facade';
import { ConstructionTab, FinancesTab, FloorsTab, HistoryTab, PricingTab, StaffTab, StyleTab, SuppliesTab } from './DesignerTabs';

/**
 * The Empire Designer hub (Module 15). Opens when a Deal is signed for a
 * motel or a hotel, from a building on the map, or from Holdings. A new
 * owner can be done in under a minute: pick a look, pick how hands-on you
 * want to be, done — the manager runs the rest. Every tab below goes as
 * deep as you like, down to the toilet paper.
 */

export type DesignerRef =
  | { venueId: string }
  | { pending: { key: string; name: string; develop?: { lotId: string } } };

const TABS = [
  ['overview', 'Overview'], ['ops', 'Operations'], ['floors', 'Floors & Rooms'], ['style', 'Style & Furnishings'], ['staff', 'Staff & Departments'],
  ['supplies', 'Supplies'], ['pricing', 'Pricing'], ['build', 'Construction & Upgrades'], ['money', 'Finances'], ['history', 'History'],
] as const;
type TabId = (typeof TABS)[number][0];

export const MODE_INFO: Record<Mode, { name: string; blurb: string }> = {
  owner: { name: 'Owner', blurb: 'You make the big calls: the look, the money, the big projects. The manager runs the rest by the preset and brings you his proposals.' },
  manager: { name: 'Manager', blurb: 'You set prices, budgets, policies and the staff. He handles the buying and the reorders.' },
  micro: { name: 'Micromanage', blurb: 'You choose every item, every reorder line, every standard. He just follows your rules.' },
};

export function Kpi({ label, value, tone, sub }: { label: string; value: string; tone?: 'good' | 'bad'; sub?: string }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-900/60 px-2 py-1.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 truncate">{label}</div>
      <div className={`tabular-nums text-sm font-semibold ${tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-stone-100'}`}>{value}</div>
      {sub && <div className="text-[10px] text-stone-500 truncate">{sub}</div>}
    </div>
  );
}

export function Bar({ v, label, invert }: { v: number; label?: string; invert?: boolean }) {
  const good = invert ? v <= 35 : v >= 65;
  const bad = invert ? v >= 75 : v < 40;
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-stone-500" title={`${label ?? ''} ${Math.round(v)}/100`}>
      {label && <span className="w-16 shrink-0 truncate">{label}</span>}
      <div className="h-1.5 flex-1 min-w-[40px] overflow-hidden rounded bg-noir-700"><div className={`h-full ${good ? 'bg-emerald-500' : bad ? 'bg-blood-400' : 'bg-gold-500'}`} style={{ width: `${Math.max(2, Math.min(100, v))}%` }} /></div>
      <span className="w-6 text-right tabular-nums text-stone-300">{Math.round(v)}</span>
    </div>
  );
}

export function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2"><h3 className="text-[11px] uppercase tracking-[0.2em] text-gold-400">{title}</h3>{note && <span className="text-[10px] text-stone-500">{note}</span>}</div>
      {children}
    </section>
  );
}

/** The style picker: Doo Wop featured, swatches in each style's palette, the neon colors. */
export function StylePicker({ s, style, sign, onStyle, onSign }: { s: GameState; style?: BuildStyle; sign?: SignColor; onStyle: (x: BuildStyle) => void; onSign: (x: SignColor) => void }) {
  const list = (Object.keys(STYLES) as BuildStyle[]).filter((k) => (STYLES[k].from ?? 0) <= s.date.y);
  return (
    <div className="space-y-2" data-testid="style-picker">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {list.map((k) => {
          const p = STYLE_PALETTE[k];
          const on = (style ?? 'doowop') === k;
          return (
            <button key={k} type="button" onClick={() => onStyle(k)} data-testid={`style-${k}`}
              className={`relative rounded-md border p-2 text-left ${on ? 'border-gold-400 ring-1 ring-gold-400' : 'border-noir-700 hover:border-gold-600'} ${k === 'doowop' ? 'sm:col-span-1' : ''}`}
              style={{ background: `linear-gradient(135deg, ${p.wall}26, ${p.trim}22)` }}>
              {k === 'doowop' && <span className="absolute right-1 top-1 rounded-full bg-[#ff5fa2] px-1.5 text-[9px] font-bold uppercase text-noir-950">Wildwood's own</span>}
              <div className="flex gap-1">{[p.wall, p.trim, p.accent, p.roof].map((c) => <span key={c} className="h-3 w-3 rounded-full border border-black/40" style={{ background: c }} />)}</div>
              <div className="mt-1 text-sm text-stone-100">{STYLES[k].name}</div>
              <div className="text-[10px] text-emerald-300">{STYLES[k].draw ? `Draw +${Math.round(STYLES[k].draw * 100)}%` : 'No extra draw'}{STYLES[k].prestige ? ` · prestige +${STYLES[k].prestige}` : ''}</div>
              <div className="text-[10px] text-stone-500">Build +{Math.round(STYLES[k].cost * 100)}% · upkeep +{Math.round(STYLES[k].upkeep * 100)}%</div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" data-testid="neon-picker">
        <span className="text-[10px] uppercase tracking-wider text-stone-500">Neon</span>
        {(Object.keys(SIGN_HEX) as SignColor[]).map((c) => (
          <button key={c} type="button" onClick={() => onSign(c)} aria-label={`${c} neon`} title={c}
            className={`h-6 w-6 rounded-full border-2 ${sign === c ? 'border-white' : 'border-noir-600'}`}
            style={{ background: SIGN_HEX[c], boxShadow: sign === c ? `0 0 10px ${SIGN_HEX[c]}` : undefined }} />
        ))}
      </div>
    </div>
  );
}

function Pending({ s, r, onClose }: { s: GameState; r: Extract<DesignerRef, { pending: unknown }>; onClose: () => void }) {
  const { apply } = useEmpire();
  const plan = s.empire?.plans[r.pending.key];
  const [concept, setConcept] = useState<ConceptId>(plan?.concept ?? 'budget_motel');
  const presets = presetsOf(s.empire ?? ({ presets: {} } as never));
  const set = (p: Partial<{ concept: ConceptId; presetId: string; mode: Mode }>) => apply({ cmd: 'plan', key: r.pending.key, plan: { ...plan, ...p } });
  const lot = r.pending.develop ? s.econ?.lots.find((l) => l.id === r.pending.develop!.lotId) : undefined;
  return (
    <div className="space-y-4 p-4" data-testid="designer-pending">
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Empire Designer</div>
        <div className="font-display text-2xl text-gold-300">{r.pending.name}</div>
        <p className="text-xs text-stone-400">{r.pending.develop ? 'Empty ground. Choose what goes up; the crews start when the week turns.' : 'The papers are signed when the week turns. Set your plan now: the place opens your way and the manager takes it from there.'}</p>
      </div>
      {r.pending.develop && (
        <Section title="What goes up">
          <div className="grid gap-1.5 sm:grid-cols-3">
            {(['budget_motel', 'rooming', 'hourly_motel'] as ConceptId[]).map((c) => (
              <button key={c} type="button" onClick={() => { setConcept(c); set({ concept: c }); }} className={`rounded border p-2 text-left ${concept === c ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700'}`}>
                <div className="text-sm text-stone-100">{CONCEPTS[c].name}</div>
                <div className="text-[11px] text-stone-500">{CONCEPTS[c].ops}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-stone-500">Boutique hotels and resorts grow out of a motel: add floors, a dining room, then convert (Construction & Upgrades).</p>
          {lot && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'build', lotId: lot.id, use: concept === 'rooming' ? 'rooming' : 'motel' } }} />}
        </Section>
      )}
      <Section title="How hands-on are you?">
        <div className="grid gap-1.5 sm:grid-cols-3">
          {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
            <button key={m} type="button" data-testid={`plan-mode-${m}`} onClick={() => set({ mode: m })} className={`rounded border p-2 text-left ${(plan?.mode ?? 'owner') === m ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700'}`}>
              <div className="text-sm text-stone-100">{MODE_INFO[m].name}{m === 'owner' ? ' (recommended)' : ''}</div>
              <div className="text-[11px] text-stone-500">{MODE_INFO[m].blurb}</div>
            </button>
          ))}
        </div>
      </Section>
      <Section title="The manager's playbook">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {presets.map((p) => (
            <button key={p.id} type="button" onClick={() => set({ presetId: p.id })} className={`rounded border p-2 text-left ${(plan?.presetId ?? 'balanced') === p.id ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700'}`}>
              <div className="text-sm text-stone-100">{p.name}</div>
              <div className="text-[11px] text-stone-500">{p.blurb}</div>
            </button>
          ))}
        </div>
      </Section>
      <div className="flex justify-end"><button type="button" className="btn-gold" onClick={onClose} data-testid="designer-done">Done</button></div>
    </div>
  );
}

/** The Overview: the look, the numbers, the manager's proposals, and the one-minute setup for a new place. */
function Overview({ s, v, go }: { s: GameState; v: Venue; go: (t: TabId) => void }) {
  const { apply } = useEmpire();
  const e = s.empire!;
  const b = venueBuilding(e, v)!;
  const sum = venueSummary(s, v);
  const st = v.last;
  const [style, setStyle] = useState<BuildStyle | undefined>(b.style ?? 'doowop');
  const [sign, setSign] = useState<SignColor | undefined>(b.sign ?? 'pink');
  const [name, setName] = useState(v.name);
  const opts = projectOptions(s, e, v);
  const props = v.proposals.map((id) => opts.find((o) => o.def.id === id)).filter((o): o is NonNullable<typeof o> => !!o && !o.why);
  const probs = venueProblems(s, v);
  const active = Object.values(e.projects).filter((p) => p.venueId === v.id && p.status !== 'done');
  const m = v.opKey ? s.econ?.managers[v.opKey] : undefined;
  const cmd = (c: EmpireCmd) => apply(c);
  return (
    <div className="space-y-4" data-testid="designer-overview">
      {!v.setup && (
        <div className="rounded-md border border-[#ff5fa2]/60 bg-[#ff5fa2]/5 p-3 space-y-3" data-testid="quick-setup">
          <div className="font-display text-lg text-[#ffb3d1]">Set it up in a minute</div>
          <p className="text-xs text-stone-400">Pick the name and the look, choose how hands-on you are, done. {m ? `${m.name} runs the rest.` : 'The manager runs the rest.'} Everything else is here when you want it.</p>
          <input className="inp text-sm" maxLength={40} value={name} onChange={(x) => setName(x.target.value)} aria-label="Name" />
          <StylePicker s={s} style={style} sign={sign} onStyle={setStyle} onSign={setSign} />
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(MODE_INFO) as Mode[]).map((md) => (
              <button key={md} type="button" onClick={() => cmd({ cmd: 'mode', venueId: v.id, mode: md })} className={`rounded border px-2 py-1 text-xs ${v.policy.mode === md ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-400'}`}>{MODE_INFO[md].name}</button>
            ))}
          </div>
          <button type="button" className="btn-gold w-full" data-testid="setup-done" onClick={() => cmd({ cmd: 'setup', venueId: v.id, style, sign, name, presetId: v.policy.presetId ?? 'balanced' })}>Open for business</button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1">
          <Facade style={v.setup ? b.style : style} sign={v.setup ? b.sign : sign} stories={b.stories} rooms={sum.rooms} name={v.setup ? v.name : name} />
          <div className="text-[11px] text-stone-500">{b.style ? STYLES[b.style].name : 'Plain'} · {b.stories} {b.stories === 1 ? 'story' : 'stories'} · built {b.builtYear} · {e.properties[v.propertyId]?.address}</div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 content-start">
          <Kpi label="Last week" value={st ? fmt$(st.noi) : '—'} tone={st && st.noi < 0 ? 'bad' : 'good'} sub={st ? `${fmt$(revenueOf(st))} in, ${fmt$(opexOf(st))} out` : 'opens when the week turns'} />
          <Kpi label="Occupancy" value={st && st.capacity ? `${Math.round(st.occ * 100)}%` : st && !st.open ? 'Closed' : '—'} sub={st && st.adr ? `avg ${fmt$(st.adr)} a night` : undefined} />
          <Kpi label="Guests say" value={`${'★'.repeat(sum.stars)}${'☆'.repeat(5 - sum.stars)}`} sub={`reputation ${sum.rep} · satisfaction ${st?.sat ?? '—'}`} />
          <Kpi label="This year" value={sum.ytd ? fmt$(sum.ytd.noi) : '—'} tone={sum.ytd && sum.ytd.noi < 0 ? 'bad' : undefined} sub={sum.lastYear ? `last year ${fmt$(sum.lastYear.noi)}` : `${sum.rooms} rooms · ${sum.staff} staff`} />
          <Kpi label="Condition" value={`${Math.round(b.condition)}`} tone={b.condition < 50 ? 'bad' : undefined} sub={b.condition < 60 ? 'needs work' : 'sound'} />
          <Kpi label="Season" value={seasonCurve(s.date) >= 0.7 ? 'The Season' : st && !st.open ? 'Closed' : 'Shoulder / winter'} sub={`${MODE_INFO[v.policy.mode].name} mode`} />
        </div>
      </div>
      <Section title="Who runs it">
        <div className="text-sm text-stone-300">
          {m ? <>{m.name} <span className="text-xs text-stone-500">· general manager · skill {m.skill}{m.effort && m.effort < 0.95 ? ` (at ${Math.round(m.effort * 100)}%)` : ''} · {fmt$(m.salary)}/wk</span></> : <span className="text-stone-400">No general manager: the night clerk keeps it going. Pick one on the map panel or the Holdings drawer.</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {v.deptIds.map((id) => e.depts[id]).filter(Boolean).map((d) => {
            const h = d.headId ? e.staff[d.headId] : undefined;
            return <span key={d.id} className={h ? 'chip-neutral' : 'chip-bad'} title={DEPTS[d.kind].blurb}>{DEPTS[d.kind].name}: {h ? `${h.name}${h.charId ? ' (family/crew)' : ''}` : 'no head'}</span>;
          })}
        </div>
      </Section>
      {props.length > 0 && (
        <Section title="Your manager proposes" note="Owner mode: he brings you the projects that need your money">
          {props.map((o) => (
            <div key={o.def.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-noir-700 bg-noir-800/60 p-2" data-testid="proposal">
              <div className="min-w-0"><div className="text-sm text-stone-100">{o.def.name}</div><div className="text-[11px] text-stone-500">{o.def.effect} · {fmt$(o.cost)} over {o.weeks} wk{o.closes ? ` · ${o.closes} rooms closed meanwhile` : ''}</div></div>
              <div className="flex gap-1">
                <button type="button" className="btn-gold text-xs py-1" onClick={() => cmd({ cmd: 'project', venueId: v.id, defId: o.def.id })}>Approve</button>
                <button type="button" className="btn-ghost text-xs py-1" onClick={() => cmd({ cmd: 'dismiss', venueId: v.id, defId: o.def.id })}>Not now</button>
              </div>
            </div>
          ))}
        </Section>
      )}
      {active.length > 0 && (
        <Section title="Under way">
          {active.map((p) => <div key={p.id} className="text-xs text-stone-300">{PROJECTS_BY_ID[p.defId]?.name}: {p.weeks - p.weeksLeft}/{p.weeks} weeks, {fmt$(p.paid)} of {fmt$(p.cost)} paid{p.status === 'waiting' ? <span className="text-amber-300"> · waiting for money</span> : ''}</div>)}
          <button type="button" className="btn-ghost text-xs" onClick={() => go('build')}>All projects →</button>
        </Section>
      )}
      {probs.length > 0 && (
        <Section title="Problems">
          <ul className="list-disc pl-5 text-xs text-amber-300">{probs.map((x) => <li key={x}>{x}</li>)}</ul>
        </Section>
      )}
      {st?.shortages.length ? <div className="text-xs text-red-300">Ran out last week: {st.shortages.join(', ').replace(/_/g, ' ')}. <button type="button" className="underline" onClick={() => go('supplies')}>Supplies →</button></div> : null}
      {st?.notes.map((n) => <div key={n} className="text-xs text-amber-300">{n}</div>)}
    </div>
  );
}

/** Operations: delegation mode, presets, standards and budgets. */
function Operations({ s, v }: { s: GameState; v: Venue }) {
  const { apply } = useEmpire();
  const e = s.empire!;
  const [pname, setPname] = useState('');
  const pol = v.policy;
  const set = (patch: Parameters<typeof apply>[0] extends infer C ? C extends { cmd: 'policy'; patch: infer P } ? P : never : never) => apply({ cmd: 'policy', venueId: v.id, patch });
  const owner = pol.mode === 'owner';
  return (
    <div className="space-y-4" data-testid="designer-ops">
      <Section title="Delegation">
        <div className="grid gap-1.5 sm:grid-cols-3">
          {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
            <button key={m} type="button" data-testid={`mode-${m}`} onClick={() => apply({ cmd: 'mode', venueId: v.id, mode: m })} className={`rounded border p-2 text-left ${pol.mode === m ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700'}`}>
              <div className="text-sm text-stone-100">{MODE_INFO[m].name}</div>
              <div className="text-[11px] text-stone-500">{MODE_INFO[m].blurb}</div>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Presets" note="Reusable across every place you own">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {presetsOf(e).map((p) => (
            <button key={p.id} type="button" onClick={() => apply({ cmd: 'preset', venueId: v.id, presetId: p.id })} className={`rounded border p-2 text-left ${pol.presetId === p.id ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700'}`}>
              <div className="text-sm text-stone-100">{p.name}</div><div className="text-[11px] text-stone-500">{p.blurb}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input className="inp text-sm" placeholder="Save this place's way as a preset…" value={pname} onChange={(x) => setPname(x.target.value)} maxLength={30} />
          <button type="button" className="btn-ghost text-xs shrink-0" disabled={!pname.trim()} onClick={() => { apply({ cmd: 'savePreset', venueId: v.id, name: pname }); setPname(''); }}>Save preset</button>
        </div>
      </Section>
      <Section title="Standards & budgets" note={owner ? 'Owner mode: set by the preset; changing one makes it your own policy' : undefined}>
        <Choice label="Housekeeping" value={pol.housekeeping} options={Object.entries(HOUSEKEEPING).map(([k, x]) => [k, x.name, x.blurb])} onPick={(x) => set({ housekeeping: x as never })} />
        <Choice label="Staffing" value={pol.staffing} options={Object.entries(STAFFING).map(([k, x]) => [k, x.name, x.blurb])} onPick={(x) => set({ staffing: x as never })} />
        <Choice label="Maintenance" value={pol.maintenance} options={Object.entries(MAINTENANCE).map(([k, x]) => [k, x.name, x.blurb])} onPick={(x) => set({ maintenance: x as never })} />
        <Choice label="Winter" value={pol.winter} options={Object.entries(WINTER).map(([k, x]) => [k, x.name, x.blurb])} onPick={(x) => set({ winter: x as never })} />
        <Choice label="Supplies" value={String(pol.supplyTier)} options={[['0', 'Economy', 'Cheapest that will do'], ['1', 'Standard', 'What most motels buy'], ['2', 'Premium', 'Guests notice'], ['3', 'Luxury', 'Society notices']]} onPick={(x) => set({ supplyTier: Number(x) })} />
        <Stepper label="Advertising" value={pol.marketing} step={2} fmt={(x) => `${fmt$(x)}/wk`} onSet={(x) => set({ marketing: Math.max(0, x) })} />
        <Stepper label="Training per head" value={pol.training} step={1} fmt={(x) => `${fmt$(x)}/wk`} onSet={(x) => set({ training: Math.max(0, x) })} />
        <Stepper label="Manager may spend alone" value={pol.autoCapex} step={250} fmt={(x) => fmt$(x)} onSet={(x) => set({ autoCapex: Math.max(0, x) })} />
        <Stepper label="Weeks of supplies on hand" value={pol.coverWeeks} step={1} fmt={(x) => `${x} wk`} onSet={(x) => set({ coverWeeks: Math.max(1, Math.min(8, x)) })} />
        <Stepper label="Replace furnishings at wear" value={pol.replaceAt} step={5} fmt={(x) => `${x}%`} onSet={(x) => set({ replaceAt: Math.max(50, Math.min(100, x)) })} />
      </Section>
      <Section title="The nightlife network" note="Later">
        <p className="text-[11px] text-stone-500">An arrangement with the Madam's people, if she ever offers one, will show here: her network operates at your place under her terms (an abstract line in the books and vice heat). The house never runs the women.</p>
      </Section>
    </div>
  );
}

export function Choice({ label, value, options, onPick, disabled }: { label: string; value: string; options: (string | undefined)[][]; onPick: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-40 shrink-0 text-xs text-stone-400">{label}</span>
      {options.map(([k, name, blurb]) => (
        <button key={k} type="button" disabled={disabled} title={blurb} onClick={() => onPick(k!)} className={`rounded border px-2 py-0.5 text-xs disabled:opacity-40 ${value === k ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'border-noir-600 text-stone-400 hover:border-gold-600'}`}>{name}</button>
      ))}
    </div>
  );
}

export function Stepper({ label, value, step, fmt, onSet, disabled }: { label: string; value: number; step: number; fmt: (n: number) => string; onSet: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-40 shrink-0 text-xs text-stone-400">{label}</span>
      <button type="button" className="btn-ghost h-6 w-6 p-0 text-xs" disabled={disabled} onClick={() => onSet(Math.round((value - step) * 100) / 100)} aria-label={`Less ${label}`}>−</button>
      <span className="w-20 text-center text-xs tabular-nums text-stone-100">{fmt(value)}</span>
      <button type="button" className="btn-ghost h-6 w-6 p-0 text-xs" disabled={disabled} onClick={() => onSet(Math.round((value + step) * 100) / 100)} aria-label={`More ${label}`}>+</button>
    </div>
  );
}

/** A department head from the family or the crew (the wife, a grown son, a capo's man), a promoted staffer, or a pro. */
export function headCandidates(s: GameState): { id: string; name: string; rel: string; skill: number; source: 'family' | 'crew' }[] {
  const fam = kinCandidates(s).map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, rel: relationTo(s, c), skill: c.attributes.business, source: 'family' as const }));
  const crew = crewCandidates(s).slice(0, 6).map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, rel: c.rank, skill: c.attributes.business, source: 'crew' as const }));
  const taken = new Set(Object.values(s.empire?.staff ?? {}).map((w) => w.charId).filter(Boolean));
  return [...fam, ...crew].filter((x) => !taken.has(x.id));
}

/** "20 rooms", or the seats of a restaurant, bar or club. */
export function sizeLabel(s: GameState, v: Venue): string {
  const e = s.empire!;
  const r = roomCount(e, v);
  if (r) return `${r} rooms`;
  const seats = seatsOf(e, v, 'dining') + seatsOf(e, v, 'lounge') + seatsOf(e, v, 'club');
  return `${seats} seats`;
}

export function DesignerHub({ s, target, onClose }: { s: GameState; target: DesignerRef; onClose: () => void }) {
  const [tab, setTab] = useState<TabId>('overview');
  if ('pending' in target) {
    const v = Object.values(s.empire?.venues ?? {}).find((x) => x.owner === 'player' && !x.closed && (x.opKey === target.pending.key || (s.empire?.properties[x.propertyId]?.lotId && `lot:${s.empire.properties[x.propertyId].lotId}` === target.pending.key)));
    if (!v) return <Modal onClose={onClose} wide><Pending s={s} r={target} onClose={onClose} /></Modal>;
    return <DesignerHub s={s} target={{ venueId: v.id }} onClose={onClose} />;
  }
  const v = s.empire?.venues[target.venueId];
  if (!v || v.closed) return <Modal onClose={onClose}><div className="p-4 text-sm text-stone-400">This place is no longer yours. <button className="btn-ghost text-xs" onClick={onClose}>Close</button></div></Modal>;
  const b = venueBuilding(s.empire!, v)!;
  const neon = SIGN_HEX[b.sign ?? 'pink'];
  return (
    <div className="fixed inset-0 z-[1200] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="panel flex w-full max-w-5xl flex-col overflow-hidden rounded-none sm:rounded-lg border-gold-600/40" onClick={(x) => x.stopPropagation()} data-testid="designer-hub">
        <header className="flex items-center gap-2 border-b border-noir-700 px-3 py-2" style={{ background: `linear-gradient(90deg, ${STYLE_PALETTE[b.style ?? 'doowop'].sky}aa, transparent)` }}>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-400">Empire Designer · {CONCEPTS[v.concept].name} · {sizeLabel(s, v)}</div>
            <h2 className="truncate font-display text-2xl" style={{ color: neon, textShadow: `0 0 10px ${neon}88` }}>{v.name}</h2>
          </div>
          <button type="button" className="ml-auto h-8 w-8 shrink-0 rounded border border-noir-600 text-stone-300 hover:border-gold-500" onClick={onClose} aria-label="Close" data-testid="designer-close">×</button>
        </header>
        <nav className="flex gap-0.5 overflow-x-auto border-b border-noir-700 px-2 tabbar" aria-label="Designer tabs">
          {TABS.map(([id, label]) => <button key={id} type="button" data-testid={`dtab-${id}`} onClick={() => setTab(id)} className={`tab text-xs px-2.5 ${tab === id ? 'tab-active' : ''}`}>{label}</button>)}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {tab === 'overview' && <Overview s={s} v={v} go={setTab} />}
          {tab === 'ops' && <Operations s={s} v={v} />}
          {tab === 'floors' && <FloorsTab s={s} v={v} />}
          {tab === 'style' && <StyleTab s={s} v={v} />}
          {tab === 'staff' && <StaffTab s={s} v={v} />}
          {tab === 'supplies' && <SuppliesTab s={s} v={v} />}
          {tab === 'pricing' && <PricingTab s={s} v={v} />}
          {tab === 'build' && <ConstructionTab s={s} v={v} />}
          {tab === 'money' && <FinancesTab s={s} v={v} />}
          {tab === 'history' && <HistoryTab s={s} v={v} />}
        </div>
      </div>
    </div>
  );
}
