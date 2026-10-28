import { useState } from 'react';
import { DESTS, MODES, TIER_INFO } from '../../engine/travelDests';
import type { BudgetTier, TravelMode } from '../../engine/travelState';
import type { GameState } from '../../engine/types';
import { easyDests, easyQuote, ENTOURAGE_GROUPS, entourageGroups, GROUP_TEXT, groupIds, whoMindsTheStore, WHOLE_FAMILY, wildOn, type EntourageGroup } from '../../engine/vacPlanner';
import { ActionCard } from '../components/Orders';
import { TransportPicker } from '../travel/TransportPicker';
import { fmt$ } from '../format';
import type { TransportId } from '../../engine/transport';

/**
 * THE EASY VACATION PLANNER: one screen. Where, when, how, how fancy; who
 * comes (tick a whole group, or one by one, or "Bring the whole family");
 * what each person costs; who stays home to mind the store and the risk
 * while everybody is away. Then one button books it (the trip is played day
 * by day on the vacation screen like any other).
 */
export function EasyVacation({ s }: { s: GameState }) {
  const dests = easyDests(s);
  const [destId, setDest] = useState(dests.includes('miamibeach') ? 'miamibeach' : dests[0]);
  const [departIn, setDepart] = useState(1);
  const [nights, setNights] = useState(4);
  const [tier, setTier] = useState<BudgetTier>('first');
  const [mode, setMode] = useState<TravelMode | undefined>();
  const [transport, setTransport] = useState<TransportId | undefined>();
  const [picks, setPicks] = useState<string[]>(() => groupIds(s, ['wife', 'kids']));
  const [discreet, setDiscreet] = useState(false);
  const groups = entourageGroups(s);
  const d = DESTS[destId];
  const { plan, quote, perHead } = easyQuote(s, { destId, departIn, nights, tier, mode, transport, picks, discreet });
  const watch = whoMindsTheStore(s, picks);
  const wild = wildOn(s, picks);
  const toggle = (id: string) => setPicks(picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id]);
  const toggleGroup = (g: EntourageGroup) => {
    const ids = groups[g].map((m) => m.id);
    const all = ids.every((id) => picks.includes(id));
    setPicks(all ? picks.filter((x) => !ids.includes(x)) : [...new Set([...picks, ...ids])]);
  };
  const whole = () => setPicks(groupIds(s, WHOLE_FAMILY));
  return (
    <section className="space-y-3 rounded border border-sky-500/40 bg-noir-800/60 p-3" data-testid="easy-vacation">
      <div className="panel-title">Plan a vacation</div>
      <div className="grid gap-2 text-[12px] sm:grid-cols-5">
        <label className="space-y-0.5 sm:col-span-2"><span className="text-stone-400">Where</span>
          <select aria-label="Destination" className="inp text-sm" value={destId} onChange={(e) => { setDest(e.target.value); setMode(undefined); setTransport(undefined); }}>
            {dests.map((id) => <option key={id} value={id}>{DESTS[id].name}</option>)}
          </select>
        </label>
        <label className="space-y-0.5"><span className="text-stone-400">When</span>
          <select aria-label="When" className="inp text-sm" value={departIn} onChange={(e) => setDepart(Number(e.target.value))}>
            {[0, 1, 2, 4, 8, 13, 26].map((w) => <option key={w} value={w}>{w === 0 ? 'This week' : w === 1 ? 'Next week' : `In ${w} weeks`}</option>)}
          </select>
        </label>
        <label className="space-y-0.5"><span className="text-stone-400">Nights</span>
          <select aria-label="Nights" className="inp text-sm" value={nights} onChange={(e) => setNights(Number(e.target.value))}>
            {[3, 4, 5].map((n) => <option key={n} value={n}>{n} nights</option>)}
          </select>
        </label>
        <label className="space-y-0.5"><span className="text-stone-400">Style</span>
          <select aria-label="Style" className="inp text-sm" value={tier} onChange={(e) => setTier(e.target.value as BudgetTier)}>
            {(Object.keys(TIER_INFO) as BudgetTier[]).map((t) => <option key={t} value={t}>{TIER_INFO[t].name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-1" data-testid="easy-modes">
        {d.modes.map((m) => <button key={m} className={`${plan.mode === m ? 'btn-gold' : 'btn-ghost'} px-2 py-1 text-xs`} onClick={() => { setMode(m); setTransport(undefined); }}>{MODES[m].name}</button>)}
      </div>
      <TransportPicker dest={d} mode={plan.mode} tier={tier} date={s.date} value={transport} onPick={setTransport} />

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-gold px-2 py-1 text-xs" data-testid="easy-whole-family" onClick={whole}>Bring the whole family</button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setPicks(groupIds(s, ['wife', 'kids']))}>Just the wife and kids</button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setPicks([])}>Go alone</button>
        <span className="text-[11px] text-stone-500">About {fmt$(perHead)} a person.</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" data-testid="easy-groups">
        {ENTOURAGE_GROUPS.filter((g) => groups[g].length).map((g) => (
          <div key={g} className="rounded border border-noir-700 p-2">
            <label className="flex items-center gap-1 text-[12px] font-semibold text-stone-200">
              <input type="checkbox" checked={groups[g].every((m) => picks.includes(m.id))} onChange={() => toggleGroup(g)} data-testid={`easy-group-${g}`} /> {GROUP_TEXT[g]} ({groups[g].length})
            </label>
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {groups[g].map((m) => (
                <li key={m.id}><label className="flex items-center justify-between gap-1 text-stone-300">
                  <span><input type="checkbox" checked={picks.includes(m.id)} onChange={() => toggle(m.id)} /> {m.name}</span>
                  <span className="tabular-nums text-stone-500">{fmt$(perHead)}</span>
                </label></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {wild && (
        <div className="rounded border border-amber-600/50 bg-amber-900/20 p-2 text-[12px] text-amber-200" data-testid="easy-wild">
          Your wife <b>and</b> your goomar on the same vacation. It can get wild: the pool, the room next door, the same dress, who sees whom, the wives at breakfast.
          <label className="ml-2 text-stone-300"><input type="checkbox" checked={discreet} onChange={(e) => setDiscreet(e.target.checked)} /> Put her in another hotel (calmer)</label>
        </div>
      )}

      <div className="rounded border border-noir-700 p-2 text-[12px]" data-testid="easy-home">
        <div className="text-stone-400">Minding the store while you're gone</div>
        {watch.lines.map((l, i) => <div key={i} className={i === watch.lines.length - 1 && watch.risk >= 0.25 ? 'text-red-300' : 'text-stone-300'}>{l}</div>)}
      </div>

      <div className="text-[12px] text-stone-300" data-testid="easy-quote">
        {quote.lines.map((l, i) => <div key={i} className="flex justify-between gap-2"><span className="text-stone-400">{l.label}</span><span className="tabular-nums">{fmt$(l.amount)}</span></div>)}
        <div className="flex justify-between gap-2 border-t border-noir-700 pt-1 font-semibold"><span>{quote.people} people, {quote.out} day{quote.out === 1 ? '' : 's'} each way, {quote.stay} nights</span><span className="tabular-nums text-gold-300">{fmt$(quote.cost)}</span></div>
      </div>
      <ActionCard s={s} action={{ kind: 'travel', op: { type: 'trip', plan } }} label={`Book it — ${fmt$(quote.cost)}`} />
    </section>
  );
}
