import { useState } from 'react';
import { moneyView, racketNetMult, heldDistricts, territoryMult, squeezeWhy, type FlowRow, type FlowStage, type MoneyView as MV } from '../../engine/money';
import { normSplit } from '../../engine/tributeState';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard, useOrders } from '../components/Orders';
import { useShell } from '../shell/context';
import { BigPots, MoveMoney } from './MoneyPots';
import { DoneMark } from '../components/Layout';

/**
 * THE MONEY SCREEN, one page, top to bottom:
 *  1. the two big numbers (Family money / Your pocket) with Move money;
 *  2. last week in plain words: came in → your cut → went out → what each pot gained;
 *  3. the last 8 weeks;
 *  4. who earned it;
 *  5. every line, folded.
 * Every number comes from the ledger (the Family) and the week's journal (your pocket).
 * Self-contained: `MoneySection` slots into any panel or a "Money" home.
 */
export function MoneyView({ s }: { s: GameState }) {
  const v = moneyView(s);
  const { go } = useShell();
  return (
    <div className="space-y-3 min-w-0" data-testid="money-view">
      <section className="space-y-2 min-w-0" data-testid="money-head">
        <BigPots s={s} />
        {v.waiting > 0 && <p className="text-[11px] text-amber-300">An envelope of {fmt$(v.waiting)} is on your desk: it is split at your cut when you advance.</p>}
        <MoveMoney s={s} />
      </section>
      {v.week === undefined ? (
        <>
          <p className="text-sm text-stone-400">The money starts moving when you advance the first week. Everything is collected on its own.</p>
          <Levers s={s} />
        </>
      ) : (
        <>
          <WeekFlow s={s} v={v} onGo={go} />
          <Chart v={v} />
          <TopEarners v={v} onGo={go} />
          <details className="rounded-md border border-noir-700 bg-noir-800/30 min-w-0" data-testid="money-lines">
            <summary className="cursor-pointer px-3 py-2 text-[12px] text-stone-300 hover:text-gold-300">Every line of week {v.week}</summary>
            <div className="px-3 pb-3"><Flow v={v} onGo={go} /></div>
          </details>
        </>
      )}
    </div>
  );
}

/** The Money screen as a section component (for a "Money" home). */
export const MoneySection = MoneyView;

const sgn = (n: number) => `${n >= 0 ? '+' : '−'}${fmt$(Math.abs(n))}`;

/** One horizontal bar row, scaled to the week's biggest row. */
function Bar({ r, max, tone, onGo, testid }: { r: FlowRow; max: number; tone: 'in' | 'out'; onGo: (to: string) => void; testid?: string }) {
  const [open, setOpen] = useState(false);
  const w = max > 0 ? Math.max(2, Math.round((r.amount / max) * 100)) : 0;
  return (
    <li className="min-w-0" data-testid={testid}>
      <button type="button" className="block w-full text-left group" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="truncate text-stone-300 group-hover:text-gold-300">{r.label}{r.pot === 'pocket' ? <span className="text-amber-300/80"> · your pocket</span> : r.pot === 'both' ? <span className="text-stone-500"> · both</span> : ''}</span>
          <span className={`tabular-nums font-semibold ${tone === 'in' ? 'text-emerald-300' : 'text-red-300'}`}>{tone === 'in' ? '+' : '−'}{fmt$(r.amount)}</span>
        </div>
        <div className="mt-0.5 h-2.5 rounded-sm bg-noir-900 border border-noir-700 overflow-hidden">
          <div className={`h-full ${tone === 'in' ? (r.pot === 'pocket' ? 'bg-amber-500/80' : 'bg-gold-500/80') : 'bg-blood-400/80'}`} style={{ width: `${w}%` }} />
        </div>
      </button>
      {open && (
        <ul className="mt-1 mb-1.5 ml-2 border-l border-noir-700 pl-2 space-y-0.5 text-[11px]">
          {r.items.slice(0, 10).map((it, i) => (
            <li key={i} className="flex justify-between gap-2"><span className="truncate text-stone-400">{it.label}</span><span className="tabular-nums text-stone-300">{fmt$(it.amount)}</span></li>
          ))}
          {r.items.length > 10 && <li className="text-stone-500">…and {r.items.length - 10} more</li>}
          {r.route && <li><button type="button" className="text-gold-300 hover:underline" onClick={() => onGo(r.route!)}>Where this is run ▸</button></li>}
        </ul>
      )}
    </li>
  );
}

function Flow({ v, onGo }: { v: MV; onGo: (to: string) => void }) {
  const max = Math.max(1, ...v.inRows.map((r) => r.amount), ...v.outRows.map((r) => r.amount));
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/50 p-3 min-w-0" data-testid="money-flow">
      <div className="flex items-baseline justify-between gap-2">
        <div className="panel-title">Every line, week {v.week}</div>
        <span className="text-[10px] text-stone-500">tap a bar for every line</span>
      </div>
      <div className="mt-2 grid gap-3 md:grid-cols-[1fr_1fr]">
        <div className="min-w-0">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-emerald-400/80"><span>In</span><span className="tabular-nums" data-testid="money-in-total">{fmt$(v.inTotal)}</span></div>
          <ul className="mt-1 space-y-1.5">{v.inRows.map((r) => <Bar key={r.group} r={r} max={max} tone="in" onGo={onGo} testid={`money-in-${r.group}`} />)}</ul>
          {!v.inRows.length && <p className="text-[11px] text-stone-500">Nothing came in.</p>}
        </div>
        <div className="min-w-0">
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-red-400/80"><span>Out</span><span className="tabular-nums" data-testid="money-out-total">{fmt$(v.outTotal)}</span></div>
          <ul className="mt-1 space-y-1.5">{v.outRows.map((r) => <Bar key={r.group} r={r} max={max} tone="out" onGo={onGo} testid={`money-out-${r.group}`} />)}</ul>
          {!v.outRows.length && <p className="text-[11px] text-stone-500">Nothing went out.</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-noir-700 pt-2">
        <span className="text-sm text-stone-300">Net</span>
        <span className={`font-display text-lg tabular-nums ${v.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`} data-testid="money-net">{v.net >= 0 ? '+' : '−'}{fmt$(Math.abs(v.net))}</span>
        <span className="w-full text-[10px] text-stone-500 tabular-nums">= the Family {v.familyDelta >= 0 ? '+' : '−'}{fmt$(Math.abs(v.familyDelta))} and your pocket {v.pocketDelta >= 0 ? '+' : '−'}{fmt$(Math.abs(v.pocketDelta))}. Money moved between the two is not counted twice.</span>
      </div>
    </section>
  );
}

/** Fixed colors for the stages (identity follows the source, never its rank). */
const SOURCE_TONE: Record<string, string> = { business: 'bg-gold-500', rackets: 'bg-emerald-600', crews: 'bg-sky-600', street: 'bg-violet-500', loans: 'bg-amber-700', other: 'bg-stone-500' };
const USE_TONE: Record<string, string> = { payroll: 'bg-blood-400', cops: 'bg-sky-700', upkeep: 'bg-stone-500', lifestyle: 'bg-amber-500', philly: 'bg-violet-600', debt: 'bg-orange-700', raids: 'bg-red-800', invest: 'bg-emerald-700', other: 'bg-stone-600' };

/** One stacked bar (2px gaps between segments) with its legend underneath; tap a legend entry to go where it is run. */
function Stack({ items, tones, total, onGo, testid }: { items: FlowStage[]; tones: Record<string, string>; total: number; onGo: (to: string) => void; testid: string }) {
  return (
    <div className="min-w-0" data-testid={testid}>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-sm bg-noir-900">
        {items.map((x) => (
          <div key={x.key} className={`${tones[x.key] ?? 'bg-stone-500'} h-full first:rounded-l-sm last:rounded-r-sm`} style={{ width: `${Math.max(1.5, (x.amount / Math.max(1, total)) * 100)}%` }} title={`${x.label}: ${fmt$(x.amount)} (${Math.round((x.amount / Math.max(1, total)) * 100)}%)`} />
        ))}
      </div>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        {items.map((x) => (
          <li key={x.key} className="min-w-0">
            <button type="button" disabled={!x.route} onClick={() => x.route && onGo(x.route)} className="flex w-full items-center justify-between gap-1.5 text-left enabled:hover:text-gold-300 text-stone-300">
              <span className="flex min-w-0 items-center gap-1.5"><span className={`inline-block h-2 w-2 shrink-0 rounded-sm ${tones[x.key] ?? 'bg-stone-500'}`} /><span className="truncate">{x.label}</span></span>
              <span className="tabular-nums text-stone-200">{fmt$(x.amount)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Last week in plain words: where it came from → your cut → where it went → what each pot gained. */
function WeekFlow({ s, v, onGo }: { s: GameState; v: MV; onGo: (to: string) => void }) {
  const potTotal = Math.max(1, v.famIn + v.pocketIn);
  const famPct = Math.round((v.famIn / potTotal) * 100);
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/50 p-3 min-w-0 space-y-2" data-testid="money-weekflow">
      <div className="flex items-baseline justify-between gap-2">
        <div className="panel-title">Last week (week {v.week})</div>
        <span className="text-[10px] text-stone-500">collected on its own</span>
      </div>
      <div>
        <div className="flex justify-between text-[11px] font-semibold text-emerald-300"><span>1. Came in</span><span className="tabular-nums" data-testid="money-flow-in">{fmt$(v.inTotal)}</span></div>
        {v.sources.length ? <Stack items={v.sources} tones={SOURCE_TONE} total={v.inTotal} onGo={onGo} testid="money-sources" /> : <p className="text-[11px] text-stone-500">Nothing came in.</p>}
      </div>
      <div>
        <div className="text-[11px] font-semibold text-amber-200">2. Split into the two pots (your cut is {v.cutPct}% of the envelope)</div>
        <div className="mt-1 flex gap-[2px] min-w-0" data-testid="money-split">
          <div className="min-w-0 rounded-l-sm border border-gold-600/50 bg-gold-500/15 px-2 py-1" style={{ flexGrow: Math.max(25, famPct), flexBasis: 0 }}>
            <div className="text-[10px] text-gold-400 truncate">Family money</div>
            <div className="tabular-nums text-sm font-semibold text-gold-300" data-testid="money-fam-in">+{fmt$(v.famIn)}</div>
          </div>
          <div className="min-w-0 rounded-r-sm border border-amber-600/40 bg-amber-500/10 px-2 py-1" style={{ flexGrow: Math.max(25, 100 - famPct), flexBasis: 0 }}>
            <div className="text-[10px] text-amber-300 truncate">Your pocket</div>
            <div className="tabular-nums text-sm font-semibold text-amber-200" data-testid="money-pocket-in">+{fmt$(v.pocketIn)}</div>
          </div>
        </div>
        <Levers s={s} />
      </div>
      <div>
        <div className="flex justify-between text-[11px] font-semibold text-red-300"><span>3. Went out</span><span className="tabular-nums" data-testid="money-flow-out">{fmt$(v.outTotal)}</span></div>
        {v.uses.length ? <Stack items={v.uses} tones={USE_TONE} total={v.outTotal} onGo={onGo} testid="money-uses" /> : <p className="text-[11px] text-stone-500">Nothing went out.</p>}
        <div className="mt-1 text-[11px] text-stone-400 tabular-nums">The Family paid {fmt$(v.famOut)}; your pocket paid {fmt$(v.pocketOut)}.</div>
      </div>
      <div className="border-t border-noir-700 pt-2" data-testid="money-flow-net">
        <div className="text-[11px] font-semibold text-stone-200">4. What each pot gained</div>
        <div className="mt-0.5 grid grid-cols-2 gap-2 tabular-nums">
          <span className={`font-display text-lg ${v.familyDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}`} data-testid="money-net-family">{sgn(v.familyDelta)} <span className="text-[11px] font-sans text-stone-400">Family</span></span>
          <span className={`font-display text-lg ${v.pocketDelta >= 0 ? 'text-emerald-300' : 'text-red-300'}`} data-testid="money-net-pocket">{sgn(v.pocketDelta)} <span className="text-[11px] font-sans text-stone-400">your pocket</span></span>
        </div>
      </div>
      {v.leak && <LeakCard s={s} v={v} />}
    </section>
  );
}

function LeakCard({ s, v }: { s: GameState; v: MV }) {
  const { go } = useShell();
  const l = v.leak!;
  return (
    <div className="rounded-md border border-blood-400/60 bg-blood-400/5 p-2 min-w-0" data-testid="money-leak">
      <div className="text-[10px] uppercase tracking-widest text-red-300/90">Where money leaks</div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-stone-200">{l.label}</span>
        <span className="tabular-nums text-red-300 font-semibold">−{fmt$(l.amount)}</span>
      </div>
      <p className="text-[11px] text-stone-400">{l.why}</p>
      <div className="mt-1.5">
        {l.action ? <ActionCard s={s} action={l.action} compact label={l.fix} /> : l.route ? <button type="button" className="btn-gold text-xs" onClick={() => go(l.route!)} data-testid="money-leak-fix">{l.fix} ▸</button> : <span className="text-[11px] text-gold-300">{l.fix}</span>}
      </div>
    </div>
  );
}

/** The last 8 weeks: money in and money out, one axis, with the two pots under it (inline SVG). */
function Chart({ v }: { v: MV }) {
  const h = v.hist.filter((x) => x.in !== undefined && x.out !== undefined);
  const W = 320, H = 120, P = 8;
  const [hover, setHover] = useState<number | undefined>(undefined);
  if (h.length < 2) return <section className="rounded-md border border-noir-700 bg-noir-800/50 p-3 text-[11px] text-stone-500" data-testid="money-chart">The trend fills in as the weeks go by.</section>;
  const hi = Math.max(1, ...h.flatMap((x) => [x.in!, x.out!]));
  const X = (i: number) => P + (i * (W - 2 * P)) / (h.length - 1);
  const Y = (y: number) => H - P - (y / hi) * (H - 2 * P);
  const path = (k: 'in' | 'out') => h.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x[k]!).toFixed(1)}`).join(' ');
  const last = h[h.length - 1];
  const at = hover !== undefined ? h[hover] : last;
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/50 p-3 min-w-0" data-testid="money-chart">
      <div className="flex items-baseline justify-between gap-2">
        <div className="panel-title">The last {h.length} weeks</div>
        <span className="text-[10px] text-stone-500 tabular-nums">wk {h[0].week}–{last.week}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full h-auto touch-none" role="img" aria-label={`Money in and out over ${h.length} weeks; last week in ${fmt$(last.in!)}, out ${fmt$(last.out!)}`}
        onMouseLeave={() => setHover(undefined)}>
        <line x1={P} x2={W - P} y1={Y(0)} y2={Y(0)} stroke="#44403c" strokeWidth={1} />
        <line x1={P} x2={W - P} y1={Y(hi)} y2={Y(hi)} stroke="#292524" strokeWidth={1} strokeDasharray="2 3" />
        {hover !== undefined && <line x1={X(hover)} x2={X(hover)} y1={P} y2={H - P} stroke="#57534e" strokeWidth={1} />}
        <path d={path('in')} fill="none" stroke="#34d399" strokeWidth={2} strokeLinejoin="round" />
        <path d={path('out')} fill="none" stroke="#f87171" strokeWidth={2} strokeDasharray="5 3" strokeLinejoin="round" />
        {h.map((x, i) => (
          <g key={x.week}>
            <circle cx={X(i)} cy={Y(x.in!)} r={hover === i || i === h.length - 1 ? 4 : 2.5} fill="#34d399" stroke="#1c1917" strokeWidth={2} />
            <circle cx={X(i)} cy={Y(x.out!)} r={hover === i || i === h.length - 1 ? 4 : 2.5} fill="#f87171" stroke="#1c1917" strokeWidth={2} />
            <rect x={X(i) - (W - 2 * P) / (h.length - 1) / 2} y={0} width={(W - 2 * P) / (h.length - 1)} height={H} fill="transparent"
              onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}><title>{`Week ${x.week}: in ${fmt$(x.in!)}, out ${fmt$(x.out!)}, net ${fmt$(x.in! - x.out!)}`}</title></rect>
          </g>
        ))}
        <text x={W - P} y={P + 2} textAnchor="end" fontSize={9} fill="#78716c">{fmt$(hi)}</text>
      </svg>
      <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[11px] tabular-nums" data-testid="money-chart-legend">
        <span className="text-stone-300"><span className="text-emerald-400">━</span> In {fmt$(at.in!)}</span>
        <span className="text-stone-300"><span className="text-red-400">┅</span> Out {fmt$(at.out!)}</span>
        <span className={at.in! - at.out! >= 0 ? 'text-emerald-300' : 'text-red-300'}>Net {at.in! - at.out! >= 0 ? '+' : '−'}{fmt$(Math.abs(at.in! - at.out!))}</span>
        <span className="w-full text-stone-500">Week {at.week}: Family money {fmt$(at.family)} · your pocket {fmt$(at.pocket)}</span>
      </div>
    </section>
  );
}

function TopEarners({ v, onGo }: { v: MV; onGo: (to: string) => void }) {
  const max = Math.max(1, ...v.top.map((x) => x.amount));
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/50 p-3 min-w-0" data-testid="money-top">
      <div className="flex items-baseline justify-between gap-2">
        <div className="panel-title">Who earned it</div>
        <button type="button" className="text-[11px] text-gold-300 hover:underline" onClick={() => onGo('borgata.earnings')} data-testid="money-earnings-link">The Family's Earnings ▸</button>
      </div>
      <ol className="mt-1.5 space-y-1">
        {v.top.map((x, i) => (
          <li key={x.id} className="text-[12px] min-w-0">
            <div className="flex justify-between gap-2"><span className="truncate text-stone-300">{i + 1}. {x.name} <span className="text-stone-500">· {x.kind === 'man' ? 'kicked up' : 'paid in'}</span></span><span className="tabular-nums text-gold-300">{fmt$(x.amount)}</span></div>
            <div className="h-1.5 rounded-sm bg-noir-900 overflow-hidden"><div className="h-full bg-gold-500/60" style={{ width: `${Math.round((x.amount / max) * 100)}%` }} /></div>
          </li>
        ))}
        {!v.top.length && <li className="text-[11px] text-stone-500">Nobody yet.</li>}
      </ol>
    </section>
  );
}

/** Your cut (the one split control), the optional lawyers & emergencies line, and the one lever. */
function Levers({ s }: { s: GameState }) {
  const { orders, queue } = useOrders();
  const pol = s.tribute?.policy ?? { personal: 4000, treasury: 6000, reserve: 0, auto: true };
  const queued = [...orders].reverse().find((o) => o.kind === 'tribute' && o.op.op === 'policy' && o.op.split);
  const cur = queued && queued.kind === 'tribute' && queued.op.op === 'policy' && queued.op.split ? queued.op.split : pol;
  const [cut, setCut] = useState(Math.round(cur.personal / 100));
  const [aside, setAside] = useState(Math.round(cur.reserve / 100));
  const [showAside, setShowAside] = useState(cur.reserve > 0);
  const changed = cut * 100 !== cur.personal || aside * 100 !== cur.reserve;
  const env = s.tribute?.reports[s.tribute.reports.length - 1]?.presented ?? 0;
  const sq = squeezeWhy(s);
  return (
    <div className="mt-2 rounded-md border border-noir-700 bg-noir-900/40 p-2 min-w-0 space-y-2" data-testid="money-levers">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] text-stone-200">Your cut of every envelope</span>
          <span className="font-display text-lg text-amber-200 tabular-nums" data-testid="money-cut">{cut}%</span>
        </div>
        <input type="range" min={0} max={60} step={5} value={cut} onChange={(e) => setCut(Number(e.target.value))} className="w-full accent-amber-400" aria-label="Your cut of the envelope, percent" data-testid="money-cut-slider" />
        <p className="text-[11px] text-stone-400">{cut}% goes to your pocket, the rest to the Family{env ? <> (last envelope {fmt$(env)}: <span className="tabular-nums">{fmt$(Math.floor((env * cut) / 100))} to you, {fmt$(env - Math.floor((env * cut) / 100))} to the Family</span>)</> : ''}. {cut > 50 ? <span className="text-red-300">Over 50% the capos start keeping a little more for themselves.</span> : 'Up to 50% the capos accept it.'}</p>
        {!showAside ? (
          <button type="button" className="mt-1 text-[11px] text-stone-400 hover:text-gold-300" onClick={() => setShowAside(true)} data-testid="money-aside-open">+ Keep some of the Family's share for lawyers & emergencies</button>
        ) : (
          <div className="mt-1.5">
            <div className="flex justify-between text-[11px] text-stone-400"><span>Kept for lawyers & emergencies (still Family money; it covers a dry week)</span><span className="tabular-nums text-stone-200">{aside}%</span></div>
            <input type="range" min={0} max={20} step={5} value={aside} onChange={(e) => setAside(Number(e.target.value))} className="w-full accent-emerald-500" aria-label="Kept for lawyers and emergencies, percent" data-testid="money-aside-slider" />
          </div>
        )}
        {/* A change is a button; no change is a status, not a greyed-out button. */}
        <div className="mt-2 flex justify-end">
          {changed ? (
            <button type="button" className="btn-primary text-xs" data-testid="money-cut-apply"
              onClick={() => queue({ kind: 'tribute', op: { op: 'policy', split: normSplit({ personal: cut * 100, reserve: aside * 100 }) } })}>
              {`Make it ${cut}%${aside ? ` (+${aside}% kept for emergencies)` : ''} from next week`}
            </button>
          ) : queued ? <DoneMark>Ordered: changes when you advance</DoneMark> : <span className="text-[11px] text-stone-500" data-testid="money-cut-apply">Your cut stands. Move the slider to change it.</span>}
        </div>
      </div>
      <div className="border-t border-noir-700 pt-2">
        <p className="text-[11px] text-stone-400">Need more this week? Rackets, places, kick-ups, rents and loan interest come in on their own. You hold {heldDistricts(s)} district{heldDistricts(s) === 1 ? '' : 's'} (corners pay ×{territoryMult(s).toFixed(2)}); your rackets feed each other (×{racketNetMult(s).toFixed(2)}).</p>
        <div className="mt-1.5"><ActionCard s={s} action={{ kind: 'tribute', op: { op: 'squeeze' } }} compact /></div>
        {sq && <p className="text-[11px] text-stone-500 mt-0.5">{sq}.</p>}
      </div>
    </div>
  );
}
