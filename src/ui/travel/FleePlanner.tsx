import { useState } from 'react';
import { ageOn } from '../../engine/calendar';
import { displayName, isFree } from '../../engine/characters';
import { defaultFleePlans, fleeQuote, wantedFor } from '../../engine/fugitive';
import { opinion } from '../../engine/relations';
import { FLEE_DESTS, FLEE_IDS, MODE_IDS, MODES } from '../../engine/travelDests';
import { tripOf, type FleePlan } from '../../engine/travelState';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { Modal } from '../components/Modal';
import { useOrders } from '../components/Orders';
import { Face } from '../components/People';
import { ModeIcon } from './icons';

/** Going on the lam: where, how, and who helps. */
export function FleePlanner({ s, personId, onClose }: { s: GameState; personId: string; onClose: () => void }) {
  const { queue } = useOrders();
  const [plan, setPlan] = useState<FleePlan>(() => defaultFleePlans(s, personId)[0]);
  const set = (p: Partial<FleePlan>) => setPlan((x) => ({ ...x, ...p }));
  const c = s.characters[personId];
  const d = FLEE_DESTS[plan.dest];
  const q = fleeQuote(s, plan);
  const helpers = Object.values(s.characters).filter((x) => x.alive && x.id !== personId && isFree(s, x) && (x.dynasty || x.faction === 'player') && ageOn(x.birth, s.date) >= 21)
    .sort((a, b) => opinion(s, b.id, personId) - opinion(s, a.id, personId)).slice(0, 12);
  const drivers = Object.values(s.characters).filter((x) => x.alive && x.id !== personId && isFree(s, x) && x.faction === 'player' && x.rank !== 'civilian' && !tripOf(s, x.id))
    .sort((a, b) => Number(b.craft === 'driver' || b.specialty === 'wheelman') - Number(a.craft === 'driver' || a.specialty === 'wheelman')).slice(0, 8);
  if (!c) return null;
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5 space-y-4" data-testid="flee-planner">
        <div className="flex items-start gap-3">
          <Face s={s} c={c} size={64} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] text-red-400">On the lam</div>
            <h2 className="font-display text-2xl text-gold-400 leading-tight">{displayName(c)} runs</h2>
            <p className="text-xs text-stone-400">{wantedFor(s, personId) ?? 'Nobody is looking for him.'} A fugitive lives under a manhunt; abroad, capture means extradition — and Italy does not send its own back.</p>
          </div>
          <button className="ml-auto text-xs text-stone-500 hover:text-gold-300" onClick={onClose}>Close ✕</button>
        </div>
        <section>
          <div className="uppercase tracking-widest text-[10px] text-stone-500 mb-1">Where</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {FLEE_IDS.map((id) => {
              const x = FLEE_DESTS[id];
              return (
                <button key={id} data-dest={id} onClick={() => set({ dest: id, mode: x.modes.includes(plan.mode) ? plan.mode : x.modes[0] })} className={`rounded border px-2 py-1.5 text-left ${plan.dest === id ? 'border-gold-400 bg-gold-500/10' : 'border-noir-600 hover:border-gold-600'}`}>
                  <div className="text-sm text-stone-100 font-semibold">{x.name}</div>
                  <div className="text-[11px] text-stone-400">{x.blurb}</div>
                  <div className="text-[10px] text-stone-500 mt-0.5">{x.extradition >= 1 ? 'Home soil: capture means jail' : `Extradition ${Math.round(x.extradition * 100)}%`} · {fmt$(x.drain)}/wk · messages take {x.delay ? `${x.delay} extra week${x.delay > 1 ? 's' : ''}` : 'no time'}</div>
                </button>
              );
            })}
          </div>
        </section>
        <section>
          <div className="uppercase tracking-widest text-[10px] text-stone-500 mb-1">How</div>
          <div className="flex flex-wrap gap-1.5">
            {MODE_IDS.map((m) => (
              <button key={m} disabled={!d.modes.includes(m)} onClick={() => set({ mode: m, driverId: m === 'cars' ? plan.driverId : undefined })} className={`rounded border px-2 py-1 text-xs flex items-center gap-1.5 disabled:opacity-30 ${plan.mode === m ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-300'}`}>
                <ModeIcon mode={m} size={14} />{MODES[m].name}<span className="text-stone-500">· seen {Math.round(MODES[m].conspicuous * 10)}/10</span>
              </button>
            ))}
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-3 text-xs">
          <label className="space-y-1 block">
            <span className="block uppercase tracking-widest text-[10px] text-stone-500">Safehouse</span>
            <select className="w-full rounded bg-noir-800 border border-noir-600 px-2 py-1.5 text-stone-200" value={plan.safehouseId ?? ''} onChange={(e) => set({ safehouseId: e.target.value || undefined })}>
              <option value="">None</option>
              {helpers.map((h) => <option key={h.id} value={h.id}>{displayName(h)} (opinion {opinion(s, h.id, personId)})</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-stone-300 mt-4"><input type="checkbox" checked={!!plan.papers} onChange={(e) => set({ papers: e.target.checked })} />New papers</label>
          <label className="space-y-1 block">
            <span className="block uppercase tracking-widest text-[10px] text-stone-500">Driver</span>
            <select disabled={plan.mode !== 'cars'} className="w-full rounded bg-noir-800 border border-noir-600 px-2 py-1.5 text-stone-200 disabled:opacity-40" value={plan.driverId ?? ''} onChange={(e) => set({ driverId: e.target.value || undefined })}>
              <option value="">None</option>
              {drivers.map((h) => <option key={h.id} value={h.id}>{displayName(h)}{h.craft === 'driver' || h.specialty === 'wheelman' ? ' (a real wheelman)' : ''}</option>)}
            </select>
          </label>
        </section>
        <section className="rounded border border-red-900/60 bg-noir-900/60 p-3 space-y-2" data-testid="flee-quote">
          <div className="flex flex-wrap gap-3 text-sm">
            <span>Manhunt starts at <b className="text-red-300">{q.manhunt}</b></span>
            <span>Cover <b className="text-emerald-300">{Math.round(q.cover * 100)}%</b></span>
            <span>{q.days} day{q.days > 1 ? 's' : ''} to get there</span>
            <span className="ml-auto text-gold-300 font-semibold">{fmt$(q.cost)}</span>
          </div>
          <div className="flex flex-wrap gap-1 text-[11px]">
            {q.coverReasons.map((r, i) => <span key={i} className={r.value >= 0 ? 'chip-good' : 'chip-bad'}>{r.value >= 0 ? '+' : '−'}{Math.round(Math.abs(r.value) * 100)}% {r.label}</span>)}
          </div>
          <ul className="text-[11px] text-stone-400">{q.lines.map((l, i) => <li key={i} className="flex justify-between"><span>{l.label}</span><span>{fmt$(l.amount)}</span></li>)}</ul>
          {personId === s.playerId && s.legal?.bail && <div className="text-[11px] text-amber-300">Jumping bail: the bond is forfeit, and if he comes back the trial is harder.</div>}
          {q.block && <div className="text-xs text-red-400">{q.block}</div>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost text-sm" onClick={onClose}>Stay and face it</button>
            <button className="btn-gold text-sm" data-testid="flee-order" disabled={!!q.block} onClick={() => { queue({ kind: 'travel', op: { type: 'flee', plan } }); onClose(); }}>Run</button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
