import { useState } from 'react';
import { crew } from '../../engine/characters';
import {
  backFactor, backMeter, backWord, BONUS_AMOUNTS, desertMult, FINE_AMOUNTS, menActionsFor, myMen, openWrongs,
  type ManRow, type MenAction, type WrongAnswer,
} from '../../engine/myMen';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { useOrders } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { SideChip } from '../components/Side';
import { sameOrder } from '../verbs';
import { hungerOf } from '../../engine/eat';
import { moneyNeedOf, moneyWord } from '../../engine/moneyNeed';
import { HungerBar } from './LetThemEat';

const eats = (c: { id: string; rank: string; specialty?: string }) => !c.specialty && (c.rank === 'soldier' || c.rank === 'associate' || c.rank === 'capo');

/**
 * MY MEN (engine/myMen.ts): one place to take care of the crew. The meter
 * ("Does the boss have our back?") on top, what was done to one of the men and
 * how to answer it, then every man: his money, loyalty, stress, heat, legal
 * trouble, health and wants, with the orders for him (money, his back,
 * discipline) as ordinary order rows (hours, cost, why not). Pick several
 * men to do the same for all of them at once.
 */

const A = (op: MenAction): PlayerAction => ({ kind: 'mymen', op });

function Meter({ s }: { s: GameState }) {
  const v = backMeter(s);
  const f = backFactor(s);
  const log = [...(s.mymen?.log ?? [])].reverse().slice(0, 5);
  const tone = v >= 65 ? 'bg-emerald-400' : v >= 45 ? 'bg-gold-400' : 'bg-red-500';
  return (
    <section className="space-y-1.5 rounded-md border border-noir-700 bg-noir-800/60 p-2.5" data-testid="mymen-meter">
      <div className="flex items-baseline justify-between gap-2">
        <span className="panel-title">Does the boss have our back?</span>
        <span className="text-lg font-semibold tabular-nums text-stone-100">{v}</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-noir-700" role="meter" aria-label="Does the boss have our back?" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
      <p className="text-xs text-stone-300">{backWord(v)}.</p>
      <p className="text-[11px] text-stone-500">
        Every man: {f >= 0 ? '+' : ''}{Math.round(f * 10)} loyalty · rivals and the FBI find them {f > 0.1 ? 'harder' : f < -0.1 ? 'easier' : 'no easier'} to turn · walk-outs ×{desertMult(s).toFixed(2)} · recruits {f >= 0 ? '+' : ''}{Math.round(f * 15)}% to say yes
      </p>
      {log.length > 0 && (
        <ul className="space-y-0.5 text-[11px]" data-testid="mymen-log">
          {log.map(([w, d, t], i) => <li key={i} className="flex gap-2"><span className="w-10 shrink-0 text-stone-500">wk {w}</span><span className={d >= 0 ? 'text-emerald-300' : 'text-red-300'}>{d > 0 ? '+' : ''}{d}</span><span className="truncate text-stone-400">{t}</span></li>)}
        </ul>
      )}
    </section>
  );
}

const HOWS: WrongAnswer[] = ['sitdown', 'payback', 'war', 'drop'];

function Wrongs({ s }: { s: GameState }) {
  const list = openWrongs(s);
  if (!list.length) return null;
  return (
    <section className="space-y-2" data-testid="mymen-wrongs">
      <div className="panel-title">Somebody went after one of yours</div>
      {list.map((w) => {
        const c = s.characters[w.charId];
        return (
          <div key={w.id} className="space-y-1 rounded-md border border-blood-500/50 bg-blood-500/10 p-2" data-testid="mymen-wrong">
            <div className="flex items-center gap-2">
              {c && <Face s={s} c={c} size={32} />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-red-200">{w.text}</div>
                <div className="text-[11px] text-stone-400">Week {w.week}{w.amt ? ` · they took $${w.amt.toLocaleString('en-US')}` : ''} · answer by week {w.due}, or the underboss handles it his way and the men notice.</div>
              </div>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {HOWS.filter((h) => h !== 'war' || w.by === 'rival').map((how) => <ActionRow key={how} s={s} action={A({ op: 'answer', wrong: w.id, how })} hostile={how === 'war' || how === 'payback'} />)}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'good' | 'warn' | 'bad' }) {
  const t = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-red-300' : 'text-stone-200';
  return <span className="whitespace-nowrap"><span className="text-stone-500">{label} </span><span className={t}>{value}</span></span>;
}

const GROUPS: { id: 'money' | 'back' | 'discipline'; label: string }[] = [
  { id: 'money', label: 'His money' },
  { id: 'back', label: 'His safety' },
  { id: 'discipline', label: 'Discipline' },
];

function ManCard({ s, r, picked, onPick }: { s: GameState; r: ManRow; picked: boolean; onPick: () => void }) {
  const [open, setOpen] = useState(false);
  const [bonus, setBonus] = useState(250);
  const [fine, setFine] = useState(100);
  const [confirm, setConfirm] = useState(false);
  const c = s.characters[r.id];
  if (!c) return null;
  const acts = menActionsFor(s, r.id).map((x) => ({
    ...x,
    action: x.action.kind === 'mymen' && x.action.op.op === 'bonus' ? A({ op: 'bonus', id: r.id, amount: bonus })
      : x.action.kind === 'mymen' && x.action.op.op === 'fine' ? A({ op: 'fine', id: r.id, amount: fine })
        : x.action.kind === 'mymen' && x.action.op.op === 'kill' ? A({ op: 'kill', id: r.id, confirm }) : x.action,
  }));
  return (
    <div className={`rounded-md border p-2 ${r.open.length ? 'border-blood-500/50' : 'border-noir-700'} bg-noir-800/60`} data-testid="mymen-man">
      <div className="flex items-start gap-2">
        <input type="checkbox" className="mt-2" checked={picked} onChange={onPick} aria-label={`Pick ${r.name}`} data-testid="mymen-pick" />
        <Face s={s} c={c} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CharLink s={s} id={c.id} />
            <span className="rounded bg-noir-700 px-1 text-[10px] uppercase text-stone-300">{r.rank}</span>
            <SideChip s={s} id={c.id} />
            <span className="text-[11px] text-stone-500">{r.side}</span>
            {r.status.map((t) => <span key={t} className="rounded border border-sky-700/60 px-1 text-[10px] text-sky-200">{t}</span>)}
            {eats(c) && <HungerBar h={hungerOf(s, c)} />}
            {eats(c) && (() => { const n = moneyNeedOf(s, c); return n.level === 'broke' || n.level === 'tight' ? <span className={`text-[11px] ${n.level === 'broke' ? 'text-red-300' : 'text-amber-300'}`} title={n.why.join(' · ')} data-testid="money-badge">$ {moneyWord(n.level)}{n.fix ? ` · best help: ${n.fix.label.toLowerCase()}` : ''}</span> : null; })()}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            <Stat label="cash" value={r.cash} />
            <Stat label="owes" value={r.debtTotal ? `$${r.debtTotal.toLocaleString('en-US')}` : 'nobody'} tone={r.debtTotal > 500 ? 'bad' : r.debtTotal ? 'warn' : undefined} />
            <Stat label="family" value={r.family} />
            <Stat label="loyalty" value={r.loyalty} tone={r.loyalty >= 20 ? 'good' : r.loyalty <= -20 ? 'bad' : 'warn'} />
            <Stat label="stress" value={r.stress} tone={r.stress >= 60 ? 'bad' : r.stress >= 35 ? 'warn' : 'good'} />
            <Stat label="heat" value={r.heat} tone={r.heat >= 60 ? 'bad' : r.heat >= 30 ? 'warn' : undefined} />
            <Stat label="law" value={r.legal} tone={r.legal === 'clean' ? undefined : 'bad'} />
            <Stat label="health" value={r.health} tone={r.health < 50 ? 'bad' : r.health < 70 ? 'warn' : undefined} />
            {r.wants.length > 0 && <Stat label="wants" value={r.wants.join('; ')} />}
          </div>
          {r.debts.length > 0 && <div className="text-[11px] text-stone-500">Owes {r.debts.join(', ')}.</div>}
        </div>
        <button type="button" className="btn-ghost shrink-0 text-xs" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="mymen-open">{open ? 'Close ▴' : 'Take care of him ▸'}</button>
      </div>
      {open && (
        <div className="mt-2 space-y-2" data-testid="mymen-actions">
          {GROUPS.map((g) => (
            <div key={g.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-stone-500">
                {g.label}
                {g.id === 'money' && <select className="rounded bg-noir-700 px-1 text-[11px] normal-case text-stone-200" value={bonus} onChange={(e) => setBonus(Number(e.target.value))} aria-label="Bonus amount">{BONUS_AMOUNTS.map((b) => <option key={b} value={b}>bonus ${b}</option>)}</select>}
                {g.id === 'discipline' && <select className="rounded bg-noir-700 px-1 text-[11px] normal-case text-stone-200" value={fine} onChange={(e) => setFine(Number(e.target.value))} aria-label="Fine amount">{FINE_AMOUNTS.map((b) => <option key={b} value={b}>fine ${b}</option>)}</select>}
                {g.id === 'discipline' && <label className="flex items-center gap-1 normal-case text-red-300"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="mymen-confirm-kill" />I mean it: confirm an order on his life</label>}
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {acts.filter((x) => x.group === g.id).map((x, i) => <ActionRow key={i} s={s} action={x.action} hostile={g.id === 'discipline'} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Do the same thing for every man picked. */
function Bulk({ s, picked, clear }: { s: GameState; picked: string[]; clear: () => void }) {
  const { orders, queue } = useOrders();
  const run = (mk: (id: string) => MenAction) => {
    for (const id of picked) {
      const a = A(mk(id));
      if (!orders.some((o) => sameOrder(o, a))) queue(a, true);
    }
    clear();
  };
  return (
    <section className="space-y-1.5 rounded-md border border-noir-700 bg-noir-800/40 p-2" data-testid="mymen-bulk">
      <div className="panel-title">For all of them</div>
      <ActionRow s={s} action={A({ op: 'christmas' })} />
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-stone-400">{picked.length ? `${picked.length} picked:` : 'Pick men below to do the same for each:'}</span>
        <button type="button" disabled={!picked.length} className="btn-ghost text-xs" onClick={() => run((id) => ({ op: 'bonus', id, amount: 250 }))} data-testid="mymen-bulk-bonus">$250 bonus each</button>
        <button type="button" disabled={!picked.length} className="btn-ghost text-xs" onClick={() => run((id) => ({ op: 'bills', id }))}>Pay their families' bills</button>
        <button type="button" disabled={!picked.length} className="btn-ghost text-xs" onClick={() => run((id) => ({ op: 'guard', id }))}>A guy on each of them</button>
        <button type="button" disabled={!picked.length} className="btn-ghost text-xs" onClick={() => run((id) => ({ op: 'debt', id }))}>Cover their debts</button>
      </div>
      <p className="text-[11px] text-stone-500">Each is queued as its own order: it shows its cost and hours in your orders, and one that can't be done is skipped with the reason.</p>
    </section>
  );
}

export function MyMen({ s }: { s: GameState }) {
  const rows = myMen(s);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'trouble'>('all');
  const shown = filter === 'trouble' ? rows.filter((r) => r.open.length || r.stress >= 45 || r.debtTotal > 0 || r.legal !== 'clean' || r.health < 60) : rows;
  return (
    <div className="space-y-3" data-testid="mymen">
      <Meter s={s} />
      <Wrongs s={s} />
      <Bulk s={s} picked={picked} clear={() => setPicked([])} />
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="panel-title">Your men ({crew(s).length})</div>
          <div className="flex gap-1 text-[11px]">
            {(['all', 'trouble'] as const).map((f) => <button key={f} type="button" className={`rounded px-1.5 ${filter === f ? 'bg-gold-500 text-noir-950' : 'text-stone-400 hover:text-gold-300'}`} onClick={() => setFilter(f)}>{f === 'all' ? 'Everyone' : 'Needs something'}</button>)}
          </div>
        </div>
        {shown.map((r) => <ManCard key={r.id} s={s} r={r} picked={picked.includes(r.id)} onPick={() => setPicked(picked.includes(r.id) ? picked.filter((x) => x !== r.id) : [...picked, r.id])} />)}
      </section>
    </div>
  );
}
