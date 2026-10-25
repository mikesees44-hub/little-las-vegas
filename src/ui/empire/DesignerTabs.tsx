import { useState } from 'react';
import { STYLES, type BuildStyle, type SignColor } from '../../engine/design';
import { CATS, CAT_IDS, ITEMS_BY_ID, itemQ, itemsFor, type ItemCat } from '../../engine/empireCatalog';
import { areaReport, catApplies, deptOf, durableUnits, layoutProblems, roomsByType, venueBuilding } from '../../engine/empireBuild';
import { forecastWeek } from '../../engine/empireAI';
import { CONCEPTS, DEPTS, ROOM_LABEL, SPACES, SUPPLIERS, SUPPLY_GROUP_LABEL } from '../../engine/empireData';
import { actTier, opexOf, revenueOf, seasonRate } from '../../engine/empireOps';
import { DURABLE_SCALE, KIND_LABEL, projectOptions, PROJECTS_BY_ID, type ProjectKind } from '../../engine/empireProjects';
import { deptStaff, staffTarget } from '../../engine/empireStaff';
import { ROOM_TYPES, type SupplyGroup, type Venue } from '../../engine/empireState';
import { inflation } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { useEmpire } from './context';
import { Bar, Choice, headCandidates, Kpi, Section, Stepper, StylePicker } from './DesignerHub';
import { Facade } from './Facade';

const price$ = (n: number) => (n < 1 ? `${Math.round(n * 100)}¢` : fmt$(n));

/* ---------------- Floors & Rooms ---------------- */

export function FloorsTab({ s, v }: { s: GameState; v: Venue }) {
  const { apply } = useEmpire();
  const e = s.empire!;
  const b = venueBuilding(e, v)!;
  const a = areaReport(e, v);
  const probs = layoutProblems(e, v, s.date.y);
  const mix = roomsByType(e, v);
  return (
    <div className="space-y-4" data-testid="designer-floors">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Kpi label="Built area" value={`${a.built.toLocaleString()} sq ft`} sub={`zoning allows ${a.allowed.toLocaleString()}`} />
        <Kpi label="Footprint" value={`${a.footprint.toLocaleString()} sq ft`} sub={`lot ${a.lot.toLocaleString()} sq ft`} />
        <Kpi label="Open lot" value={`${a.freeLot.toLocaleString()} sq ft`} sub={`pool, parking: ${a.outdoor.toLocaleString()}`} />
        <Kpi label="Stories" value={`${b.stories} of ${a.maxStories}`} sub={`${b.sprinklers ? 'sprinklers' : 'no sprinklers'}${b.elevator ? ' · elevator' : ''}${b.ramps ? ' · ramps' : ''}`} />
      </div>
      <div className="flex flex-wrap gap-1">{ROOM_TYPES.filter((t) => mix[t]).map((t) => <span key={t} className="chip-neutral">{mix[t]} {ROOM_LABEL[t].toLowerCase()}</span>)}</div>
      {probs.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-300">{probs.map((x) => <li key={x}>{x}</li>)}</ul>}
      {[...b.floorIds].reverse().map((fid) => {
        const f = e.floors[fid];
        return (
          <Section key={fid} title={f.level === 0 ? 'Ground floor' : `Floor ${f.level + 1}`} note={`${f.area.toLocaleString()} sq ft`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs">
                <thead><tr className="text-left text-[10px] uppercase tracking-wider text-stone-500"><th className="py-1">Space</th><th>Units</th><th>Sq ft</th><th>Capacity</th><th>Dept</th><th>Furnishing</th><th className="w-28">Condition</th><th>Status</th></tr></thead>
                <tbody>
                  {f.spaceIds.map((id) => e.spaces[id]).filter(Boolean).map((sp) => (
                    <tr key={sp.id} className="border-t border-noir-800" data-testid="space-row">
                      <td className="py-1 text-stone-200">{SPACES[sp.type].name} <span className="text-stone-600">#{sp.id}</span></td>
                      <td className="tabular-nums">{sp.units}</td>
                      <td className="tabular-nums">{sp.sqft * (SPACES[sp.type].capacity === 1 ? sp.capacity : sp.units)}</td>
                      <td className="tabular-nums">{SPACES[sp.type].capacity === 1 ? `${sp.capacity} seats` : sp.capacity ? `${sp.capacity * sp.units} guests` : '—'}</td>
                      <td className="text-stone-400">{sp.deptId ? DEPTS[e.depts[sp.deptId]?.kind ?? 'admin']?.name : '—'}</td>
                      <td>{['Economy', 'Standard', 'Premium', 'Luxury'][sp.furnishing] ?? '—'}</td>
                      <td><Bar v={sp.condition} /></td>
                      <td>
                        {SPACES[sp.type].capacity > 1 || sp.type.startsWith('room') ? (
                          <button type="button" className={`rounded border px-1.5 text-[11px] ${sp.status === 'open' ? 'border-emerald-700 text-emerald-300' : 'border-noir-600 text-stone-500'}`} onClick={() => apply({ cmd: 'spaceStatus', spaceId: sp.id, status: sp.status === 'open' ? 'closed' : 'open' })} title="Close a block off (cheaper in winter; fewer rooms to sell)">{sp.status === 'open' ? 'Open' : 'Closed off'}</button>
                        ) : <span className="text-stone-500">{sp.status}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })}
      <p className="text-[11px] text-stone-500">Rooms change category, wings and floors go up, departments get their space through Construction & Upgrades. The layout rules are the period's: lot coverage {Math.round(60)}%, sprinklers and an elevator above three stories, kitchens and laundries on the ground floor, ramps on new work after 1973.</p>
    </div>
  );
}

/* ---------------- Style & Furnishings ---------------- */

export function StyleTab({ s, v }: { s: GameState; v: Venue }) {
  const { apply } = useEmpire();
  const e = s.empire!;
  const b = venueBuilding(e, v)!;
  const [style, setStyle] = useState<BuildStyle>(b.style ?? 'doowop');
  const [sign, setSign] = useState<SignColor>(b.sign ?? 'pink');
  const changed = style !== b.style || sign !== b.sign;
  const param = `${style}:${sign}`;
  const restyle = projectOptions(s, e, v, param).find((o) => o.def.id === 'restyle')!;
  const refurnish = projectOptions(s, e, v).find((o) => o.def.id === 'refurnish');
  const durables = CAT_IDS.filter((c) => CATS[c].kind === 'durable' && catApplies(e, v, c));
  const sections = [...new Set(durables.map((c) => CATS[c].section))];
  const micro = v.policy.mode === 'micro';
  return (
    <div className="space-y-4" data-testid="designer-style">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500">{changed ? 'The new look' : 'Today'}</div>
          <Facade style={style} sign={sign} stories={b.stories} rooms={roomsByType(e, v).room_std + roomsByType(e, v).room_deluxe + roomsByType(e, v).suite + roomsByType(e, v).room_hourly} name={v.name} />
          <p className="mt-1 text-[11px] text-stone-400">{STYLES[style].blurb}</p>
        </div>
        <div className="space-y-2">
          <StylePicker s={s} style={style} sign={sign} onStyle={setStyle} onSign={setSign} />
          {changed && (
            <div className="rounded border border-noir-700 bg-noir-800/60 p-2 text-xs">
              <div className="text-stone-200">Restyle: {fmt$(restyle.cost)} over {restyle.weeks} weeks{restyle.closes ? `, ${restyle.closes} rooms closed while the scaffolding is up` : ''}.</div>
              {restyle.why ? <div className="text-red-300">{restyle.why}</div> : <button type="button" className="btn-gold mt-1 text-xs py-1" data-testid="restyle" onClick={() => apply({ cmd: 'project', venueId: v.id, defId: 'restyle', param })}>Restyle it</button>}
            </div>
          )}
        </div>
      </div>
      <Section title="Furnishings" note={micro ? 'Micromanage: you choose every item' : 'Your manager buys at the supply tier; switch to Micromanage to choose each item'}>
        {sections.map((sec) => (
          <div key={sec} className="space-y-1">
            <div className="text-[11px] font-semibold text-stone-300">{sec}</div>
            {durables.filter((c) => CATS[c].section === sec).map((c) => <ItemRow key={c} s={s} v={v} cat={c} />)}
          </div>
        ))}
        {refurnish && <div className="rounded border border-noir-700 bg-noir-800/60 p-2 text-xs">
          <span className="text-stone-200">Refurnish every room now at these choices: {fmt$(refurnish.cost)}, {refurnish.weeks} weeks.</span>{' '}
          {refurnish.why ? <span className="text-red-300">{refurnish.why}</span> : <button type="button" className="btn-ghost text-xs py-0.5" onClick={() => apply({ cmd: 'project', venueId: v.id, defId: 'refurnish' })}>Refurnish</button>}
        </div>}
      </Section>
    </div>
  );
}

function ItemRow({ s, v, cat }: { s: GameState; v: Venue; cat: ItemCat }) {
  const { apply } = useEmpire();
  const e = s.empire!;
  const cd = CATS[cat];
  const cur = cd.kind === 'durable' ? v.durables[cat] : undefined;
  const line = v.stock[cat];
  const chosen = v.policy.supplies[cat] ?? cur?.item ?? line?.item;
  const list = itemsFor(cat, s.date.y);
  const micro = v.policy.mode === 'micro';
  const infl = inflation(s);
  const scale = cd.kind === 'durable' ? DURABLE_SCALE : 1;
  const it = chosen ? ITEMS_BY_ID[chosen] : undefined;
  return (
    <div className="grid grid-cols-1 gap-1 rounded border border-noir-800 bg-noir-900/50 p-1.5 sm:grid-cols-[150px_minmax(0,1fr)_minmax(0,160px)] sm:items-center" data-testid={`item-${cat}`}>
      <div className="text-xs text-stone-300">{cd.name}</div>
      <div className="min-w-0">
        <select className="inp py-0.5 text-xs" value={chosen} disabled={!micro} onChange={(x) => apply({ cmd: 'supply', venueId: v.id, cat, item: x.target.value })} aria-label={cd.name}>
          {list.map((i) => <option key={i.id} value={i.id}>{['Economy', 'Standard', 'Premium', 'Luxury'][i.tier]}: {i.name} — {price$(i.price * scale * infl)}/{cd.unit} · quality {Math.round(itemQ(i, s.date.y))}{i.life ? ` · lasts ${i.life}${cd.laundered ? ' washes' : ' wk'}` : ''}{i.work ? ` · work ${i.work > 0 ? '+' : ''}${Math.round(i.work * 100)}%` : ''}</option>)}
        </select>
        {it?.note && <div className="text-[10px] italic text-stone-500">{it.note}</div>}
      </div>
      <div className="text-[11px] text-stone-400">
        {cur ? <><div>{ITEMS_BY_ID[cur.item]?.name} ×{durableUnits(e, v, cat)}</div><Bar v={cur.wear} label="Worn" invert /></>
          : line ? <div>{Math.round(line.onHand)} on hand{line.onOrder ? `, ${Math.round(line.onOrder)} coming` : ''} · used {Math.round(line.used).toLocaleString()} this year{line.short ? <span className="text-red-300"> · short {line.short} wk</span> : ''}</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Staff & Departments ---------------- */

export function StaffTab({ s, v }: { s: GameState; v: Venue }) {
  const { apply } = useEmpire();
  const e = s.empire!;
  const [open, setOpen] = useState<string | undefined>();
  const [picking, setPicking] = useState<string | undefined>();
  const f = forecastWeek(s, e, v);
  const cands = headCandidates(s);
  const payroll = v.staffIds.reduce((a, id) => a + (e.staff[id]?.wage ?? 0), 0);
  return (
    <div className="space-y-3" data-testid="designer-staff">
      <div className="flex flex-wrap items-center gap-2">
        <Kpi label="Staff" value={String(v.staffIds.length)} sub={`${fmt$(payroll)}/wk payroll`} />
        <Kpi label="Turnover" value={String(v.alumni.length)} sub="have left (all time)" />
        {v.policy.mode !== 'owner' && <button type="button" className="btn-gold text-xs" onClick={() => apply({ cmd: 'staffToTarget', venueId: v.id })}>Staff up for next week</button>}
        {v.policy.mode === 'owner' && <span className="text-[11px] text-stone-500">Owner mode: the manager hires for the season and lets the summer staff go after it. You choose the heads.</span>}
      </div>
      {v.deptIds.map((id) => e.depts[id]).filter(Boolean).map((d) => {
        const staff = deptStaff(e, d);
        const head = d.headId ? e.staff[d.headId] : undefined;
        const target = staffTarget(e, v, d.kind, f);
        const sat = staff.length ? staff.reduce((a, x) => a + x.satisfaction, 0) / staff.length : 0;
        const def = DEPTS[d.kind];
        return (
          <div key={d.id} className="rounded border border-noir-700 bg-noir-800/50 p-2 space-y-1" data-testid={`dept-${d.kind}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm text-stone-100">{def.name}</div>
              <div className="text-[11px] text-stone-500">{staff.length} staff · needs ~{target} next week · satisfaction {Math.round(sat)}</div>
            </div>
            <div className="text-[11px] text-stone-500">{def.blurb}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={d.kind === 'club' ? 'text-[#ffb3d1] font-semibold' : 'text-stone-400'}>{def.head}:</span>
              {head ? <span className="text-stone-200">{head.name} <span className="text-stone-500">· skill {Math.round(head.skill)} · {fmt$(head.wage)}/wk{head.charId ? ` · ${head.source}` : head.source === 'promoted' ? ' · came up from the floor' : ''}</span></span> : <span className="text-red-300">nobody</span>}
              {d.kind === 'club' && <span className="chip-neutral" title="Which acts he can land">Can book: {['local bands', 'regional acts', 'name acts', 'headliners'][actTier(e, v)]}</span>}
              <button type="button" className="btn-ghost text-[11px] py-0 px-1.5" onClick={() => setPicking(picking === d.id ? undefined : d.id)}>Choose…</button>
              <button type="button" className="btn-ghost text-[11px] py-0 px-1.5" onClick={() => apply({ cmd: 'hire', venueId: v.id, dept: d.kind, seasonal: f.inSeason })}>Hire one</button>
              <button type="button" className="btn-ghost text-[11px] py-0 px-1.5" onClick={() => setOpen(open === d.id ? undefined : d.id)}>{open === d.id ? 'Hide roster' : 'Roster'}</button>
            </div>
            {picking === d.id && (
              <div className="rounded border border-gold-700/40 bg-noir-900 p-2 space-y-1" data-testid="head-picker">
                <div className="text-[10px] uppercase tracking-wider text-stone-500">Put someone in charge</div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="chip-neutral" onClick={() => { apply({ cmd: 'head', venueId: v.id, dept: d.kind, pro: true }); setPicking(undefined); }}>Hire a professional</button>
                  {staff.filter((x) => x.role === 'staff' && !x.seasonal).slice(0, 3).map((x) => <button key={x.id} type="button" className="chip-neutral" onClick={() => { apply({ cmd: 'head', venueId: v.id, dept: d.kind, empId: x.id }); setPicking(undefined); }}>Promote {x.name} (skill {Math.round(x.skill)})</button>)}
                  {cands.slice(0, 8).map((c) => <button key={c.id} type="button" className={c.source === 'family' ? 'chip-good' : 'chip-neutral'} onClick={() => { apply({ cmd: 'head', venueId: v.id, dept: d.kind, charId: c.id, source: c.source }); setPicking(undefined); }}>{c.name} — {c.rel}, business {c.skill}</button>)}
                </div>
                <p className="text-[10px] text-stone-500">Family and crew at the head of a department is the family's business; the staff notice when the boss's nephew can't do the job.</p>
              </div>
            )}
            {open === d.id && (
              <table className="w-full text-[11px]">
                <tbody>
                  {staff.map((x) => (
                    <tr key={x.id} className="border-t border-noir-800">
                      <td className="py-0.5 text-stone-300">{x.name}{x.role === 'head' ? ' ★' : ''}{x.seasonal ? <span className="text-stone-600"> (summer)</span> : ''}</td>
                      <td className="tabular-nums">skill {Math.round(x.skill)}</td>
                      <td className="tabular-nums">{fmt$(x.wage)}/wk</td>
                      <td className="w-24"><Bar v={x.satisfaction} /></td>
                      <td className="text-right">
                        <button type="button" className="px-1 text-stone-400 hover:text-gold-300" onClick={() => apply({ cmd: 'wage', empId: x.id, wage: x.wage + 3 })} title="A raise">+$3</button>
                        {!x.charId && <button type="button" className="px-1 text-red-400 hover:text-red-300" onClick={() => apply({ cmd: 'fire', empId: x.id })}>Let go</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      {v.alumni.length > 0 && <div className="text-[11px] text-stone-500">Who left: {v.alumni.slice(-6).map((a) => `${a.name} (${a.why.toLowerCase()})`).join('; ')}</div>}
    </div>
  );
}

/* ---------------- Supplies ---------------- */

export function SuppliesTab({ s, v }: { s: GameState; v: Venue }) {
  const { apply } = useEmpire();
  const e = s.empire!;
  const cons = CAT_IDS.filter((c) => CATS[c].kind === 'consumable' && catApplies(e, v, c));
  const groups = [...new Set(CAT_IDS.filter((c) => catApplies(e, v, c)).map((c) => CATS[c].group))];
  const buys = (v as Venue & { lastBuys?: { bought: { cat: string; item: string; units: number; cost: number }[] } }).lastBuys?.bought ?? [];
  return (
    <div className="space-y-4" data-testid="designer-supplies">
      <Section title="What the guests use up" note={v.policy.mode === 'micro' ? 'Micromanage: you choose each item' : 'The manager reorders by the policy (Operations)'}>
        {cons.map((c) => <ItemRow key={c} s={s} v={v} cat={c} />)}
      </Section>
      {buys.length > 0 && (
        <Section title="Bought last week">
          <ul className="text-xs text-stone-300">{buys.map((b) => <li key={b.cat}>{Math.round(b.units).toLocaleString()} {CATS[b.cat as ItemCat]?.unit}s of {b.item.toLowerCase()} — {fmt$(b.cost)}</li>)}</ul>
        </Section>
      )}
      <Section title="Suppliers & contracts">
        {groups.map((g) => {
          const cur = Object.values(e.contracts).find((x) => x.venueId === v.id && x.group === g);
          const opts = SUPPLIERS.filter((x) => x.group === g);
          return (
            <div key={g} className="flex flex-wrap items-center gap-1">
              <span className="w-40 shrink-0 text-xs text-stone-400">{SUPPLY_GROUP_LABEL[g as SupplyGroup]}</span>
              {opts.map((o) => {
                const blocked = o.needsKind && !s.businesses.some((b) => b.owner === 'player' && b.kind === o.needsKind);
                return <button key={o.id} type="button" disabled={!!blocked} title={`${o.blurb} Price ×${o.price}, on time ${Math.round(o.reliable * 100)}%.${blocked ? ' You need to own one.' : ''}`} onClick={() => apply({ cmd: 'supplier', venueId: v.id, group: g as SupplyGroup, supplierId: o.id })} className={`rounded border px-2 py-0.5 text-xs disabled:opacity-40 ${cur?.supplierId === o.id ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'border-noir-600 text-stone-400'}`}>{o.name}</button>;
              })}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

/* ---------------- Pricing ---------------- */

export function PricingTab({ s, v }: { s: GameState; v: Venue }) {
  const { apply } = useEmpire();
  const e = s.empire!;
  const mix = roomsByType(e, v);
  const owner = v.policy.mode === 'owner';
  const st = v.last;
  const infl = inflation(s);
  const c = CONCEPTS[v.concept];
  return (
    <div className="space-y-4" data-testid="designer-pricing">
      {owner && <p className="text-xs text-stone-400">Owner mode: your manager steers the rates toward {Math.round(v.policy.occupancyTarget * 100)}% full in the season. Switch to Manager mode to set them yourself.</p>}
      <Section title="Room rates (peak season, a night)">
        {ROOM_TYPES.filter((t) => mix[t]).map((t) => (
          <div key={t} className="flex flex-wrap items-center gap-2">
            <Stepper label={`${ROOM_LABEL[t]} (${mix[t]})`} value={v.policy.rates[t] ?? 0} step={0.5} fmt={fmt$2} disabled={owner} onSet={(x) => apply({ cmd: 'rate', venueId: v.id, room: t, rate: x })} />
            <span className="text-[11px] text-stone-500">this week {fmt$2(seasonRate(v, t, s.date))} · the market pays ~{fmt$2((c.rates[t] ?? c.rates.room_std ?? 7) * infl)}</span>
          </div>
        ))}
        <Choice label="Off-season rates" value={String(v.policy.offPct)} disabled={owner} options={[['0.5', '50%'], ['0.6', '60%'], ['0.7', '70%'], ['0.8', '80%']]} onPick={(x) => apply({ cmd: 'policy', venueId: v.id, patch: { offPct: Number(x) } })} />
        <Choice label="Occupancy target" value={String(v.policy.occupancyTarget)} options={[['0.75', '75%'], ['0.8', '80%'], ['0.85', '85%'], ['0.9', '90%'], ['0.95', '95%']]} onPick={(x) => apply({ cmd: 'policy', venueId: v.id, patch: { occupancyTarget: Number(x) } })} />
      </Section>
      {(deptOf(e, v, 'dining') || deptOf(e, v, 'bar') || deptOf(e, v, 'club')) && (
        <Section title="Food, drink and the club">
          {deptOf(e, v, 'dining') && <Stepper label="Average dinner check" value={v.policy.menuPrice ?? 2.75} step={0.25} fmt={fmt$2} onSet={(x) => apply({ cmd: 'policy', venueId: v.id, patch: { menuPrice: Math.max(0.5, x) } })} />}
          {(deptOf(e, v, 'bar') || deptOf(e, v, 'club')) && <Stepper label="A drink" value={v.policy.drinkPrice ?? 0.6} step={0.05} fmt={fmt$2} onSet={(x) => apply({ cmd: 'policy', venueId: v.id, patch: { drinkPrice: Math.max(0.1, x) } })} />}
          {deptOf(e, v, 'club') && <Stepper label="Cover charge" value={v.policy.coverCharge ?? 1.5} step={0.25} fmt={fmt$2} onSet={(x) => apply({ cmd: 'policy', venueId: v.id, patch: { coverCharge: Math.max(0, x) } })} />}
          {deptOf(e, v, 'club') && <Stepper label="The act (weekly fee)" value={v.policy.entertainment ?? 250} step={50} fmt={(x) => fmt$(x)} onSet={(x) => apply({ cmd: 'policy', venueId: v.id, patch: { entertainment: Math.max(0, x) } })} />}
        </Section>
      )}
      {st && <div className="text-xs text-stone-400">Last week: {st.roomNights} room-nights of {st.capacity} ({Math.round(st.occ * 100)}%), average {fmt$2(st.adr)}; {Object.entries(st.guests).map(([k, n]) => `${n} ${k}`).join(', ')}.</div>}
    </div>
  );
}

const fmt$2 = (n: number) => `$${n.toFixed(2)}`;

/* ---------------- Construction & Upgrades ---------------- */

export function ConstructionTab({ s, v }: { s: GameState; v: Venue }) {
  const { apply } = useEmpire();
  const e = s.empire!;
  const opts = projectOptions(s, e, v).filter((o) => o.def.id !== 'restyle');
  const kinds = [...new Set(opts.map((o) => o.def.kind))] as ProjectKind[];
  const active = Object.values(e.projects).filter((p) => p.venueId === v.id);
  return (
    <div className="space-y-4" data-testid="designer-build">
      {active.length > 0 && (
        <Section title="Projects">
          {active.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-stone-200">{PROJECTS_BY_ID[p.defId]?.name}{p.by === 'manager' ? <span className="text-stone-500"> (the manager's call)</span> : ''}</span>
              <span className="text-stone-400">{p.status === 'done' ? 'Done' : `${p.weeks - p.weeksLeft}/${p.weeks} wk · ${fmt$(p.paid)} of ${fmt$(p.cost)}${p.status === 'waiting' ? ' · waiting for money' : ''}`}</span>
              {p.status !== 'done' && <button type="button" className="text-red-400 hover:text-red-300" onClick={() => apply({ cmd: 'cancelProject', projectId: p.id })}>Stop</button>}
            </div>
          ))}
        </Section>
      )}
      {kinds.map((k) => (
        <Section key={k} title={KIND_LABEL[k]}>
          {opts.filter((o) => o.def.kind === k).map((o) => (
            <div key={o.def.id} className={`flex flex-wrap items-start justify-between gap-2 rounded border p-2 ${o.why ? 'border-noir-800 opacity-70' : 'border-noir-700 bg-noir-800/50'}`} data-testid={`project-${o.def.id}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-stone-100">{o.def.name}{v.proposals.includes(o.def.id) ? <span className="ml-1 chip-good">manager proposes</span> : ''}</div>
                <div className="text-[11px] text-stone-400">{o.def.blurb}</div>
                <div className="text-[11px] text-emerald-300">{o.def.effect}</div>
                <div className="text-[11px] text-stone-500">{fmt$(o.cost)} · {o.weeks} weeks{o.closes ? ` · ${o.closes} rooms out of service` : ''}{o.def.from ? ` · since ${o.def.from}` : ''}</div>
              </div>
              {o.why ? <span className="text-[11px] text-amber-300 max-w-[180px]">{o.why}</span> : <button type="button" className="btn-gold text-xs py-1" onClick={() => apply({ cmd: 'project', venueId: v.id, defId: o.def.id })}>Start</button>}
            </div>
          ))}
        </Section>
      ))}
      <p className="text-[11px] text-stone-500">Projects are paid week by week as the crews work (shown in the weekly report as capital). A project waits if the treasury is under $3,000.</p>
    </div>
  );
}

/* ---------------- Finances ---------------- */

export function FinancesTab({ s, v }: { s: GameState; v: Venue }) {
  void s;
  const st = v.last;
  const rows = st ? [
    ['Rooms', st.rev.rooms], ['Dining', st.rev.dining], ['Bar', st.rev.bar], ['Club', st.rev.club], ['Spa, parking, other', st.rev.other],
  ].filter(([, n]) => n) as [string, number][] : [];
  const exp = st ? Object.entries(st.exp).filter(([k, n]) => !k.endsWith('Adequacy') && n) as [string, number][] : [];
  const LABEL: Record<string, string> = { payroll: 'Payroll (with taxes & benefits)', supplies: 'Guest & cleaning supplies', linen: 'Linen & laundry', utilities: 'Utilities', maintenance: 'Repairs & maintenance', taxes: 'Property taxes', insurance: 'Insurance', licenses: 'Licenses', marketing: 'Advertising', entertainment: 'Entertainment contracts', training: 'Training', admin: 'Office, bookkeeper & bank', commissions: 'Travel-agent & AAA commissions', reserve: 'Furnishings reserve & management fee' };
  return (
    <div className="space-y-4" data-testid="designer-money">
      {st ? (
        <Section title={`Operating statement, week ${st.week}`}>
          <table className="w-full max-w-md text-xs">
            <tbody>
              {rows.map(([k, n]) => <tr key={k}><td className="py-0.5 text-stone-300">{k}</td><td className="text-right tabular-nums text-emerald-300">{fmt$(n)}</td></tr>)}
              <tr className="border-t border-noir-700"><td className="py-0.5 font-semibold">Revenue</td><td className="text-right tabular-nums font-semibold">{fmt$(revenueOf(st))}</td></tr>
              {st.cogs > 0 && <tr><td className="text-stone-300">Food & liquor cost</td><td className="text-right tabular-nums text-red-300">{fmt$(-st.cogs)}</td></tr>}
              <tr><td className="text-stone-400">Gross profit</td><td className="text-right tabular-nums">{fmt$(revenueOf(st) - st.cogs)}</td></tr>
              {exp.map(([k, n]) => <tr key={k}><td className="py-0.5 text-stone-300">{LABEL[k] ?? k}</td><td className="text-right tabular-nums text-red-300">{fmt$(-n)}</td></tr>)}
              <tr className="border-t border-noir-700"><td className="py-0.5 font-semibold">Operating income</td><td className={`text-right tabular-nums font-semibold ${st.noi < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{fmt$(st.noi)}</td></tr>
              <tr><td className="text-stone-400">Capital (replacements)</td><td className="text-right tabular-nums">{fmt$(-st.capex)}</td></tr>
              <tr><td className="text-stone-400">Cash flow</td><td className="text-right tabular-nums">{fmt$(st.noi - st.capex)}</td></tr>
            </tbody>
          </table>
          <p className="text-[11px] text-stone-500">Every line above is posted to the treasury by name in the weekly report. Projects are capital, paid as they go.</p>
        </Section>
      ) : <p className="text-sm text-stone-400">The first statement comes when the week turns.</p>}
      <Section title="By month">
        <PeriodTable rows={v.months.slice(-12)} />
      </Section>
      <Section title="By year">
        <PeriodTable rows={v.years} />
      </Section>
      <div className="text-xs text-stone-400">Capital put in since you took it over: {fmt$(v.capexTotal)}. {opexOf.name ? '' : ''}</div>
    </div>
  );
}

function PeriodTable({ rows }: { rows: Venue['months'] }) {
  if (!rows.length) return <p className="text-xs text-stone-500">No history yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-xs">
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-stone-500"><th className="py-1">Period</th><th className="text-right">Revenue</th><th className="text-right">Costs</th><th className="text-right">Operating income</th><th className="text-right">Capital</th><th className="text-right">Occupancy</th><th className="text-right">Satisfaction</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-noir-800">
              <td className="py-0.5 text-stone-300">{r.key}</td>
              <td className="text-right tabular-nums">{fmt$(r.rev)}</td>
              <td className="text-right tabular-nums text-stone-400">{fmt$(r.opex + r.cogs)}</td>
              <td className={`text-right tabular-nums ${r.noi < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{fmt$(r.noi)}</td>
              <td className="text-right tabular-nums text-stone-400">{fmt$(r.capex)}</td>
              <td className="text-right tabular-nums">{r.capacity ? `${Math.round((r.roomNights / r.capacity) * 100)}%` : '—'}</td>
              <td className="text-right tabular-nums">{Math.round(r.sat)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- History & the gallery ---------------- */

export function HistoryTab({ s, v }: { s: GameState; v: Venue }) {
  const e = s.empire!;
  const p = e.properties[v.propertyId];
  const b = venueBuilding(e, v)!;
  const lot = p.lotId ? s.econ?.lots.find((l) => l.id === p.lotId) : undefined;
  return (
    <div className="space-y-4" data-testid="designer-history">
      <Section title="The property">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 text-xs">
          <Kpi label="Address" value={p.address} sub={`property ${p.id}${p.lotId ? ` · lot ${p.lotId}` : ''}`} />
          <Kpi label="Zoning" value={p.zoning} sub={p.permitted.slice(0, 2).join(', ')} />
          <Kpi label="Assessed value" value={fmt$(p.value)} sub={`taxes ~${fmt$(p.value * 0.016)}/yr`} />
          <Kpi label="Lot" value={`${p.lotSqft.toLocaleString()} sq ft`} sub={p.utilities.slice(0, 3).join(', ')} />
        </div>
      </Section>
      <Section title="Looks through the years" note="Every look the place has had">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="gallery">
          {b.visuals.map((x, i) => (
            <figure key={i} className="space-y-0.5">
              <Facade style={x.style} sign={x.sign} stories={x.stories} rooms={x.rooms} name={v.name} w={220} h={130} dim={i < b.visuals.length - 1} />
              <figcaption className="text-[10px] text-stone-500">{x.year}: {x.label}{x.style ? ` · ${STYLES[x.style].name}` : ''}</figcaption>
            </figure>
          ))}
        </div>
      </Section>
      <Section title="Ownership & history">
        <ul className="space-y-0.5 text-xs">
          {(lot?.history ?? []).map((h, i) => <li key={`l${i}`} className="text-stone-400">{h.year}: {h.how} {h.by ? `from ${h.by}` : ''}{h.price ? ` for ${fmt$(h.price)}` : ''}</li>)}
          {[...p.history].reverse().map((h, i) => <li key={i} className="text-stone-300"><span className="text-stone-500">{h.year}, wk {h.week}:</span> {h.text}</li>)}
        </ul>
      </Section>
    </div>
  );
}
