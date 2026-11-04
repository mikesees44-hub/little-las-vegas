import { useState } from 'react';
import type { ShareSplit } from '../../engine/spendState';
import { SHARE_AMOUNTS, SHARE_PRESETS, sharePlan } from '../../engine/storeShare';
import { inflation } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { fmt$ } from '../format';
import { CardHead } from '../components/Layout';
import { domCard } from '../domain';

/**
 * SHARE THE WEALTH: pick a sum, how to split it (the men, the widows, the
 * church, the neighborhood), by rank or by merit, and from which pot. The
 * preview lists every envelope and what it does; one click queues it and
 * the order's confirm window says it all again.
 */
export function ShareWealth({ s }: { s: GameState }) {
  const infl = inflation(s);
  const [total, setTotal] = useState(Math.round(5000 * infl / 100) * 100);
  const [preset, setPreset] = useState('oldway');
  const [split, setSplit] = useState<ShareSplit>(SHARE_PRESETS[1].split);
  const [by, setBy] = useState<'rank' | 'merit'>('rank');
  const [pot, setPot] = useState<'family' | 'pocket'>('family');
  const p = sharePlan(s, total, split, by);
  const set = (k: keyof ShareSplit, v: number) => { setPreset(''); setSplit({ ...split, [k]: Math.max(0, Math.min(100, v)) }); };
  const chip = (v: number, label: string, good = v > 0) => (v ? <span className={good ? 'chip-good' : 'chip-bad'}>{label} {v > 0 ? '+' : ''}{v}</span> : null);
  return (
    <section className={`llv-card-box llv-card-plain space-y-3 ${domCard('church')}`} data-testid="share-wealth" data-domain="church">
      <CardHead d="church" glyph="♥" title="Share the wealth" className="!mb-0" sub="A boss who shares is a boss men die for. Envelopes for the crew, the widows of the men who did die for you, the church, turkeys on every stoop." />
      <div className="llv-kicker">1 · How much</div>
      <div className="flex flex-wrap gap-1" data-testid="share-amounts">
        {SHARE_AMOUNTS.map((a) => { const v = Math.round(a * infl / 100) * 100; return <button key={a} className={`${total === v ? 'btn-gold' : 'btn-ghost'} px-2 py-1 text-xs`} onClick={() => setTotal(v)}>{fmt$(v)}</button>; })}
        <input aria-label="Amount" type="number" min={100} step={100} className="inp w-28 text-sm" value={total} onChange={(e) => setTotal(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
      </div>
      <div className="llv-kicker">2 · Who gets it</div>
      <div className="flex flex-wrap gap-1" data-testid="share-presets">
        {SHARE_PRESETS.map((x) => <button key={x.id} title={x.text} className={`${preset === x.id ? 'btn-gold' : 'btn-ghost'} px-2 py-1 text-xs`} onClick={() => { setPreset(x.id); setSplit(x.split); }}>{x.label}</button>)}
      </div>
      <div className="grid gap-2 text-[12px] sm:grid-cols-4">
        {([['crew', 'The men'], ['widows', 'The widows'], ['church', 'The church'], ['hood', 'The neighborhood']] as [keyof ShareSplit, string][]).map(([k, label]) => (
          <label key={k} className="space-y-0.5">
            <span className="text-stone-400">{label}: {split[k]}%</span>
            <input type="range" min={0} max={100} step={5} value={split[k]} onChange={(e) => set(k, Number(e.target.value))} className="w-full" />
          </label>
        ))}
      </div>
      <div className="llv-kicker">3 · How it is cut, and from which pot</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-stone-300">
        <label><input type="radio" checked={by === 'rank'} onChange={() => setBy('rank')} /> By rank</label>
        <label><input type="radio" checked={by === 'merit'} onChange={() => setBy('merit')} /> By merit (what each man brought in)</label>
        <span className="text-stone-600">|</span>
        <label><input type="radio" checked={pot === 'family'} onChange={() => setPot('family')} /> Family money</label>
        <label><input type="radio" checked={pot === 'pocket'} onChange={() => setPot('pocket')} /> Your pocket</label>
      </div>
      <div className="flex flex-wrap gap-1" data-testid="share-effects">
        {chip(p.loyalty, 'Loyalty (avg)')}
        {chip(p.respect, 'Respect')}
        {chip(p.influence, 'Neighborhood')}
        {chip(p.churchGoodwill, 'The Church')}
        {chip(p.localHeat, 'Local heat', true)}
        {chip(p.fedHeat, 'Federal heat', false)}
        {p.seen > 0 && <span className="chip-neutral">The IRS sees {fmt$(p.seen)}</span>}
        {p.turkeys > 0 && <span className="chip-neutral">{p.turkeys.toLocaleString('en-US')} turkeys</span>}
      </div>
      <ul className="max-h-56 divide-y divide-noir-800 overflow-y-auto rounded-md border border-noir-700 bg-noir-900/50 px-2 text-[12px]" data-testid="share-lines">
        {p.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-2 py-0.5">
            <span className="text-stone-300">{l.name}{l.note ? <span className="text-amber-400"> · {l.note}</span> : null}</span>
            <span className="tabular-nums text-stone-400">{fmt$(l.amount)}{l.opinion ? <span className={l.opinion > 0 ? 'text-emerald-400' : 'text-red-400'}> ({l.opinion > 0 ? '+' : ''}{l.opinion})</span> : null}</span>
          </li>
        ))}
      </ul>
      {p.notes.map((n, i) => <p key={i} className="text-[11px] text-stone-500">{n}</p>)}
      <ActionCard s={s} action={{ kind: 'spend', op: { op: 'share', total, split, by, pot } }} label={`Share it — ${fmt$(total)}`} />
    </section>
  );
}
