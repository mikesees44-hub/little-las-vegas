import { useState } from 'react';
import { hoodView, islandChange } from '../../engine/hood';
import { HOODS, type HoodId } from '../../engine/hoodData';
import { STAGE_LABEL, USE_CAT_LABEL } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { OWNER_COLOR } from '../map/lotIcons';

function Meter({ label, value, max = 100, color, hint }: { label: string; value: number; max?: number; color: string; hint?: string }) {
  return (
    <div title={hint}>
      <div className="flex justify-between text-[11px]"><span className="text-stone-400">{label}</span><span className="tabular-nums text-stone-200">{Math.round(value)}</span></div>
      <div className="h-1.5 rounded bg-noir-700 overflow-hidden"><div className="h-full rounded" style={{ width: `${Math.max(2, Math.min(100, (value / max) * 100))}%`, background: color }} /></div>
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string | number; sub?: string }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-800/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{k}</div>
      <div className="text-stone-100 font-semibold tabular-nums">{v}</div>
      {sub && <div className="text-[10px] text-stone-500">{sub}</div>}
    </div>
  );
}

const ORG_COLOR = (id: string) => OWNER_COLOR[id] ?? '#9a8f7a';

/**
 * The neighborhood dashboard: everything is counted from the records — the
 * lots in the neighborhood's zones, the district's influence, the layer's
 * conditions and its log — and the town then and now.
 */
export function HoodDashboard({ s, initial, compact, onClose }: { s: GameState; initial?: HoodId; compact?: boolean; onClose?: () => void }) {
  const [id, setId] = useState<HoodId>(initial ?? 'boardwalk');
  const v = hoodView(s, id);
  const ch = islandChange(s);
  const then = v.then;
  const d = (a: number, b: number) => (b > a ? `+${b - a}` : `${b - a}`);
  return (
    <div className="space-y-3" data-testid="hood-dashboard">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Neighborhood</div>
          <div className="font-display text-2xl text-gold-400 leading-tight">{v.name}</div>
          <div className="text-xs text-stone-400 italic">{v.blurb}</div>
        </div>
        {onClose && <button type="button" className="text-xs text-stone-400 hover:text-gold-300" onClick={onClose}>close ×</button>}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-1" role="tablist">
          {HOODS.map((h) => <button key={h.id} type="button" role="tab" aria-selected={id === h.id} onClick={() => setId(h.id)} className={`rounded px-2 py-0.5 text-[11px] border ${id === h.id ? 'border-gold-400 text-gold-300 bg-gold-500/10' : 'border-noir-600 text-stone-400 hover:text-gold-300'}`}>{h.name}</button>)}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat k="Residents" v={v.residents.toLocaleString('en-US')} sub={`${v.households.toLocaleString('en-US')} households`} />
        <Stat k="Summer crowd" v={`~${v.summer.toLocaleString('en-US')}`} sub="on a July weekend" />
        <Stat k="Jobs" v={v.jobs} sub={`${v.independents} independents`} />
        <Stat k="Businesses" v={v.businessCount} sub={v.businesses.slice(0, 2).map((b) => `${b.n} ${USE_CAT_LABEL[b.cat].toLowerCase()}`).join(', ') || '—'} />
        <Stat k="Demand" v={`${v.demand}%`} sub="this week, of a normal season" />
        <Stat k="Real estate" v={fmt$(v.realEstate.value)} sub={`${v.realEstate.forSale} for sale · ${v.realEstate.forLease} to lease · ${v.realEstate.vacant} empty`} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Meter label="Economy" value={v.econ * 100} max={130} color="#5fae7f" hint="1960 = 100" />
        <Meter label="Reputation" value={v.rep} color="#ff9ec7" hint="How the town and the tourists see it" />
        <Meter label="Police activity" value={v.police} color="#4ea8ff" hint={`${v.investigations} open investigation${v.investigations === 1 ? '' : 's'}`} />
        <Meter label="Infrastructure" value={v.infra} color="#e0b84a" hint="Streets, sewers, planks, lights" />
      </div>
      <div className="rounded border border-noir-700 bg-noir-800/50 px-2 py-1.5 text-xs">
        <span className="text-[10px] uppercase tracking-widest text-stone-500">Municipal policy · </span>
        <span className="text-gold-300 font-semibold">{v.policy.name}</span>
        <div className="text-stone-400">{v.policy.blurb}</div>
        <div className="text-stone-500 mt-0.5">{v.investigations > 0 ? `Police: ${v.investigations} open investigation${v.investigations === 1 ? '' : 's'} in the neighborhood.` : 'Police: nothing open.'}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">Competing organizations</div>
        <ul className="space-y-1 text-xs" data-testid="hood-orgs">
          {v.organizations.length === 0 && <li className="text-stone-500">Nobody organized. Independents only.</li>}
          {v.organizations.map((o) => (
            <li key={o.id} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ORG_COLOR(o.id) }} />
              <span className="text-stone-200 w-40 truncate">{o.name}</span>
              <div className="h-1.5 flex-1 rounded bg-noir-700 overflow-hidden"><div className="h-full" style={{ width: `${o.influence}%`, background: ORG_COLOR(o.id) }} /></div>
              <span className="text-stone-400 tabular-nums w-24 text-right">{o.influence}% · {o.lots} {o.lots === 1 ? 'property' : 'properties'}</span>
            </li>
          ))}
        </ul>
      </div>
      {v.construction.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Construction & redevelopment</div>
          <ul className="text-xs text-stone-300">{v.construction.map((c) => <li key={c.lotId}>{c.what} — {STAGE_LABEL[c.stage as keyof typeof STAGE_LABEL] ?? c.stage} · {c.by}</li>)}</ul>
        </div>
      )}
      {then && (
        <div className="rounded border border-gold-600/30 bg-gold-500/5 px-2 py-1.5 text-xs" data-testid="hood-then-now">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">{then.y} → {s.date.y}</div>
          <div className="text-stone-300">Businesses {then.row.businesses} → {v.now.businesses} ({d(then.row.businesses, v.now.businesses)}) · empty lots {then.row.vacant} → {v.now.vacant} · worth {fmt$(then.row.value)} → {fmt$(v.now.value)} · economy {Math.round(then.row.econ * 100)} → {Math.round(v.now.econ * 100)}</div>
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">What changed</div>
        <ul className="text-xs text-stone-300 space-y-0.5 max-h-56 overflow-y-auto" data-testid="hood-history">
          {v.history.length === 0 && <li className="text-stone-500">Nothing yet. Give it a season.</li>}
          {v.history.map((h, i) => <li key={i}><span className="text-stone-500 tabular-nums">{h.y}/{String(h.m).padStart(2, '0')}</span> {h.text}</li>)}
        </ul>
      </div>
      {!compact && ch && ch.to > ch.from && (
        <div data-testid="island-then-now">
          <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-1">The island, {ch.from} and {ch.to}</div>
          <table className="w-full text-[11px] text-stone-300">
            <thead><tr className="text-stone-500"><th className="text-left font-normal">Neighborhood</th><th className="font-normal">Businesses</th><th className="font-normal">Empty</th><th className="font-normal">Worth</th><th className="font-normal">Held by families</th></tr></thead>
            <tbody>
              {ch.rows.map((r) => {
                const fam = (o: Record<string, number>) => Object.entries(o).filter(([k]) => k !== 'private' && k !== 'city').reduce((a, [, n]) => a + n, 0);
                return <tr key={r.id} className="border-t border-noir-800"><td>{r.name}</td><td className="text-center tabular-nums">{r.then.businesses}→{r.now.businesses}</td><td className="text-center tabular-nums">{r.then.vacant}→{r.now.vacant}</td><td className="text-center tabular-nums">{fmt$(r.then.value)}→{fmt$(r.now.value)}</td><td className="text-center tabular-nums">{fam(r.then.owners)}→{fam(r.now.owners)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
