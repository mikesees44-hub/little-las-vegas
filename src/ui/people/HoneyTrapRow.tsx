import { crew, isFree } from '../../engine/characters';
import { oddsWord } from '../../engine/decide';
import { FLORIDA_COST, HONEY_PAY, HONEY_PAYS, honeyCandidates, honeyOdds, type HoneyPay } from '../../engine/hitHoney';
import { HONEY_ASK_HOURS } from '../../engine/timeCost';
import type { GameState, SchemeOptions } from '../../engine/types';

/**
 * The honey trap's one row in a hit's setup (engine/hitHoney.ts): a working woman paid to get him alone,
 * who asks her, and what she is offered; her odds broken down before the boss commits. Hidden entirely
 * when Mature content is Off or nobody could do it. Non-explicit: a room for the night, and that is all.
 */
export function HoneyTrapRow({ s, targetId, opts, set }: { s: GameState; targetId?: string; opts: SchemeOptions; set: (o: Partial<SchemeOptions>) => void }) {
  const women = targetId ? honeyCandidates(s, targetId) : [];
  if (!targetId || !women.length) return null;
  const askers = [
    { id: '', label: `You, in person (${HONEY_ASK_HOURS} hours)` },
    ...crew(s).filter((c) => isFree(s, c) && ['underboss', 'consigliere', 'capo', 'soldier'].includes(c.rank)).sort((a, b) => ['underboss', 'consigliere', 'capo', 'soldier'].indexOf(a.rank) - ['underboss', 'consigliere', 'capo', 'soldier'].indexOf(b.rank)).slice(0, 8)
      .map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName} (${c.rank})` })),
  ];
  const o = opts.honey ? honeyOdds(s, opts.honey, targetId, { by: opts.honeyAsk, pay: opts.honeyPay }) : undefined;
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const sel = 'rounded bg-noir-900 border border-noir-600 p-1 text-xs';
  return (
    <div data-testid="honey-row">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 mb-1">A room for the night (honey trap)</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <select className={sel} value={opts.honey ?? ''} onChange={(e) => set({ honey: e.target.value || undefined })} aria-label="The woman who gets him alone" data-testid="honey-woman">
          <option value="">Nobody: the team does it alone</option>
          {women.map((w) => <option key={w.id} value={w.id}>{w.firstName} {w.lastName}{s.nightlife?.people[w.id]?.role === 'madam' ? ' (madam)' : ''}</option>)}
        </select>
        {opts.honey && (
          <>
            <select className={sel} value={opts.honeyAsk ?? ''} onChange={(e) => set({ honeyAsk: e.target.value || undefined })} aria-label="Who asks her" data-testid="honey-asker">
              {askers.map((a) => <option key={a.id} value={a.id}>Asked by {a.label}</option>)}
            </select>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="What she is offered">
              {HONEY_PAYS.map((p: HoneyPay) => (
                <button key={p} type="button" role="radio" aria-checked={(opts.honeyPay ?? 'fair') === p} onClick={() => set({ honeyPay: p })} data-testid={`honey-pay-${p}`}
                  className={`rounded border px-1.5 py-0.5 text-[11px] ${(opts.honeyPay ?? 'fair') === p ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-300'}`}>
                  {HONEY_PAY[p].label} ${HONEY_PAY[p].fee.toLocaleString('en-US')}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {o && (
        <div className="mt-1 rounded border border-noir-700 bg-noir-900/60 p-1.5 text-[11.5px] text-stone-300" data-testid="honey-odds">
          <div>She goes through with it: <b className="text-stone-100">{pct(o.yes)}</b> ({oddsWord(o.yes)}) · says no {pct(o.no)} · takes the money and warns him {pct(o.warn)} · loses her nerve {pct(o.nerve)}</div>
          <div className="mt-0.5 text-stone-400" data-testid="honey-reasons">{o.reasons.map((r) => `${r.label} ${r.value > 0 ? '+' : r.value < 0 ? '−' : '±'}${Math.abs(r.value)}`).join(' · ')}</div>
          <div className="mt-0.5" data-testid="honey-bait">He takes the bait: <b className="text-stone-100">{pct(o.bait)}</b> ({oddsWord(o.bait)}) <span className="text-stone-400">· {o.baitReasons.map((r) => `${r.label} ${r.value > 0 ? '+' : r.value < 0 ? '−' : '±'}${Math.abs(r.value)}`).join(' · ')}</span></div>
          <div className="mt-0.5 text-stone-400">If she does, and he comes: +{o.bonus} to the hit (already weighed by the bait) and fewer witnesses. But she is a witness herself (more on the team's file, and she can talk later; more money, less likely), and his people may come looking for her. Afterwards you decide: Florida (${FLORIDA_COST.toLocaleString('en-US')}), your payroll, or leave her be. If she warns him, the hit is off.</div>
        </div>
      )}
    </div>
  );
}
