import { useState } from 'react';
import { CITY_LIST, standing } from '../../engine/cities';
import { displayName } from '../../engine/characters';
import { departBlock, departFor, departQuote, guardPool, MAX_GUARDS, visitModes, type DepartPlan } from '../../engine/visit';
import { FEATURED_CITIES, sceneOf } from '../../engine/visitData';
import { DESTS, MODES } from '../../engine/travelDests';
import { transportBlock, type TransportId } from '../../engine/transport';
import { TransportPicker } from './TransportPicker';

/** The ways the boss can just leave today, by mode (no planes or boats: that is a planned trip). */
const VISIT_WAYS: Record<VisitMode, TransportId[]> = { cars: ['caddy', 'chauffeur', 'crewcar'], train: ['prr_club', 'prr_coach', 'cnj'], bus: ['greyhound', 'shortline'] };
import type { VisitMode } from '../../engine/travelState';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { Modal } from '../components/Modal';
import { ModeIcon } from './icons';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * "Go there yourself": pick a city, how to get there and who comes along;
 * the boss leaves today. (A planned trip with guests and an itinerary is
 * the trip planner; this is the boss getting in the car.)
 */
export function GoThere({ s, cityId, update, onClose, onArrive }: { s: GameState; cityId?: string; update: (f: (s: GameState) => GameState, what?: string) => void; onClose: () => void; onArrive: () => void }) {
  const [plan, setPlan] = useState<DepartPlan>(() => ({ cityId: cityId && sceneOf(cityId) ? cityId : 'philadelphia', mode: 'cars', guards: [], transport: 'caddy' }));
  const modes = visitModes(plan.cityId);
  const mode: VisitMode = modes.includes(plan.mode) ? plan.mode : modes[0] ?? 'cars';
  const dest = DESTS[plan.cityId];
  // The way chosen, if it goes there; else the first that does.
  const way = dest ? [plan.transport, ...VISIT_WAYS[mode]].find((id): id is TransportId => !!id && VISIT_WAYS[mode].includes(id) && !transportBlock(id, dest, s.date)) : undefined;
  const p: DepartPlan = { ...plan, mode, transport: way };
  const q = departQuote(s, p);
  const sc = sceneOf(p.cityId);
  const pool = guardPool(s);
  const others = CITY_LIST.filter((c) => c.id !== 'wildwood' && !FEATURED_CITIES.includes(c.id) && visitModes(c.id).length);
  const toggle = (id: string) => setPlan((x) => ({ ...x, guards: x.guards.includes(id) ? x.guards.filter((g) => g !== id) : x.guards.length >= MAX_GUARDS ? x.guards : [...x.guards, id] }));
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5 space-y-4" data-testid="go-there">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Go there yourself</div>
            <h2 className="font-display text-2xl text-gold-400 leading-tight">{sc?.name ?? 'Somewhere'}</h2>
            {sc && <p className="text-xs text-stone-400 italic max-w-prose">{sc.blurb}</p>}
          </div>
          <button className="text-xs text-stone-500 hover:text-gold-300" onClick={onClose}>Close ✕</button>
        </div>

        <section className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Where</div>
          <div className="flex flex-wrap gap-1.5">
            {FEATURED_CITIES.map((id) => (
              <button key={id} type="button" data-testid={`go-city-${id}`} onClick={() => setPlan((x) => ({ ...x, cityId: id }))}
                className={`rounded border px-2 py-1 text-xs ${p.cityId === id ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-300 hover:border-gold-600'}`}>
                {sceneOf(id)?.name}
              </button>
            ))}
            <select className="rounded border border-noir-600 bg-noir-800 px-1.5 py-1 text-xs text-stone-300" value={FEATURED_CITIES.includes(p.cityId) ? '' : p.cityId} onChange={(e) => e.target.value && setPlan((x) => ({ ...x, cityId: e.target.value }))} aria-label="Another city">
              <option value="">Another city…</option>
              {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="text-[11px] text-stone-500">Standing there: {standing(s, p.cityId)}</div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">How</div>
            <div className="flex flex-wrap gap-1.5">
              {(['cars', 'train', 'bus'] as VisitMode[]).map((m) => (
                <button key={m} type="button" disabled={!modes.includes(m)} onClick={() => setPlan((x) => ({ ...x, mode: m, transport: VISIT_WAYS[m][0] }))}
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-xs disabled:opacity-40 ${mode === m ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-300'}`}>
                  <ModeIcon mode={m} size={12} /> {m === 'cars' ? 'Your car' : MODES[m].name}
                </button>
              ))}
            </div>
            {dest ? <TransportPicker dest={dest} mode={mode} tier="modest" date={s.date} value={way} only={VISIT_WAYS[mode]} onPick={(id) => setPlan((x) => ({ ...x, transport: id }))} /> : <p className="text-[11px] text-stone-500">{MODES[mode].blurb}</p>}
          </div>
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Bodyguards (up to {MAX_GUARDS})</div>
            {pool.length === 0 && <p className="text-[11px] text-stone-500">Nobody free to come.</p>}
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {pool.slice(0, 12).map((c) => (
                <label key={c.id} className="flex items-center gap-1 rounded border border-noir-700 px-1.5 py-0.5 text-[11px] text-stone-300">
                  <input type="checkbox" checked={p.guards.includes(c.id)} onChange={() => toggle(c.id)} /> {displayName(c)}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-stone-500">Each one makes an ambush less likely; a car full of men gets pulled over more.</p>
          </div>
        </section>

        <section className="rounded border border-noir-700 bg-noir-800/60 p-3 text-xs text-stone-300 space-y-1">
          <div>{q.legDays} day{q.legDays > 1 ? 's' : ''} on the road each way · you arrive <b className="text-stone-100">{q.arrive}</b> · the road {fmt$(q.fare)} · {sc?.hotel ?? 'a hotel'} {fmt$(q.nightly)}/night</div>
          <div className="text-amber-300/90">Each way: {pct(q.risks.tail)} tailed{q.risks.stop ? ` · ${pct(q.risks.stop)} pulled over` : ''} · in town: {pct(q.risks.ambush)} a week someone jumps you</div>
          <div className="text-stone-400">While you are gone the underboss runs things; what needs you in Wildwood waits until you are back, and the other outfits notice the empty chair.</div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {q.block && <span className="text-xs text-red-300">{q.block}</span>}
          <button className="btn-ghost" onClick={onClose}>Not now</button>
          <button className="btn-gold" data-testid="go-leave" disabled={!!departBlock(s, p)} onClick={() => { update((x) => departFor(x, p), 'You left town'); onArrive(); }}>Leave today</button>
        </div>
      </div>
    </Modal>
  );
}
