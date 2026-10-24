import { LEGACIES, LEGACY_COST, LEGACY_TRACKS, renownTier } from '../../engine/familyLegacy';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { Label } from './bits';

const TRACK_GLYPH: Record<string, string> = { blood: '♥', name: '♔', money: '$', church: '✝' };

/** Dynasty renown and the four legacy tracks (CK3 Dynasty Legacies). */
export function LegacyPanel({ s }: { s: GameState }) {
  const d = s.dyn;
  const renown = Math.round(d?.renown ?? 0);
  const total = Math.round(d?.renownTotal ?? 0);
  return (
    <div className="space-y-4" data-testid="legacy-panel">
      <section className="flex flex-wrap items-end gap-4">
        <div>
          <Label>Renown to spend</Label>
          <div className="font-display text-3xl text-gold-300 tabular-nums">{renown}</div>
        </div>
        <div>
          <Label>Standing of the house</Label>
          <div className="text-stone-100">{renownTier(total)} <span className="text-xs text-stone-500">({total} renown earned in all)</span></div>
        </div>
        <p className="text-xs text-stone-400 max-w-md">
          Renown comes from deeds: holding districts, big scores, making men, winning at the Table, strong marriages, heirs who come of age, hosting the island. Legacies belong to the house — they pass to every head after you.
        </p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {LEGACY_TRACKS.map((t) => {
          const info = LEGACIES[t];
          const have = d?.legacy[t] ?? 0;
          return (
            <section key={t} className="rounded-md border border-noir-700 bg-noir-800/60 p-3" data-testid={`legacy-${t}`}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="panel-title text-base"><span className="mr-1 text-gold-500">{TRACK_GLYPH[t]}</span>{info.name}</div>
                <div className="text-[11px] text-stone-500">{have}/4</div>
              </div>
              <div className="text-[11px] text-stone-400 italic">{info.motto}</div>
              <ol className="mt-2 space-y-1.5">
                {info.perks.map((p, i) => {
                  const done = i < have;
                  const next = i === have;
                  return (
                    <li key={p.name} className={`rounded border px-2 py-1.5 text-xs ${done ? 'border-gold-600/60 bg-gold-500/10' : next ? 'border-noir-600' : 'border-noir-800 opacity-50'}`}>
                      <div className="flex justify-between gap-2">
                        <span className={`font-semibold ${done ? 'text-gold-300' : 'text-stone-200'}`}>{done ? '✓ ' : ''}{p.name}</span>
                        {!done && <span className="text-stone-500 tabular-nums whitespace-nowrap">{LEGACY_COST[i]} renown</span>}
                      </div>
                      <div className="text-stone-400">{p.text}</div>
                    </li>
                  );
                })}
              </ol>
              {have < 4 && !s.gameOver && <div className="mt-2"><ActionCard s={s} action={{ kind: 'dynasty', op: { type: 'legacy', track: t } }} compact label={`Take up: ${info.perks[have].name}`} /></div>}
            </section>
          );
        })}
      </div>
      {d && d.renownLog.length > 0 && (
        <section>
          <Label>Where the renown came from</Label>
          <ul className="mt-1 grid gap-x-4 text-xs text-stone-400 sm:grid-cols-2">
            {[...d.renownLog].reverse().slice(0, 16).map((r, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-noir-800 py-0.5">
                <span className="truncate">{r.reason}</span>
                <span className={`tabular-nums ${r.amount >= 0 ? 'text-gold-300' : 'text-red-400'}`}>{r.amount >= 0 ? '+' : ''}{r.amount} <span className="text-stone-600">wk {r.week}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
