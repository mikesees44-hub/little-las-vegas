import { EXPOSE_AT, UB_BOSS, UB_NAME } from '../../engine/underbelly';
import type { GameState } from '../../engine/types';
import { ActionCard } from './Orders';

/** The Underbelly: what the boss knows about the Harbor Crew, and what he can do. */
export function UnderbellyPanel({ s }: { s: GameState }) {
  const u = s.underbelly;
  if (!u || u.stage === 'waiting') {
    return (
      <div className="space-y-2" data-testid="underbelly">
        <h2 className="font-display text-2xl text-gold-400">The Underbelly</h2>
        <p className="text-sm text-stone-400">Nothing on the island yet that preys on people. Every outfit has lines it won't cross; some come from out of town without any.</p>
      </div>
    );
  }
  const name = UB_NAME[0].toUpperCase() + UB_NAME.slice(1);
  const live = u.stage === 'active' || u.stage === 'entrenched';
  const ally = u.ally ? s.rivals.find((r) => r.id === u.ally) : undefined;
  return (
    <div className="space-y-4" data-testid="underbelly">
      <div>
        <h2 className="font-display text-2xl text-gold-400">The Underbelly</h2>
        <p className="text-sm text-stone-400">
          {name}, run by {UB_BOSS} out of rooms over a Bay Docks bar. They move people — runaways, workers with no papers, anyone who owes them — and hold them with debt and fear. It is not your racket and never will be. You can find out about it, expose it, run it off, or make common cause with a rival against it.
        </p>
      </div>
      {live ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Meter label="How dug-in they are" value={u.strength} tone="bg-blood-400" />
            <Meter label={`What you can prove (expose at ${EXPOSE_AT})`} value={u.exposure} tone="bg-sky-500" />
            <div className="rounded border border-noir-700 bg-noir-800/70 p-2 text-sm">
              <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Where</div>
              <div className="text-stone-200">{u.districts.map((id) => s.districts.find((d) => d.id === id)?.name ?? id).join(', ')}</div>
              {ally && <div className="text-xs text-emerald-300 mt-1">{ally.shortName} stands with you against them.</div>}
              {u.stage === 'entrenched' && <div className="text-xs text-red-300 mt-1">Entrenched: Philadelphia and the feds have noticed.</div>}
            </div>
          </div>
          <p className="text-xs text-stone-500">While they are here: lost trade in every district they hold, cops cracking down on everybody, and people asking why you allow it. Each shows in your weekly report by name.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionCard s={s} action={{ kind: 'underbelly', op: 'investigate' }} />
            <ActionCard s={s} action={{ kind: 'underbelly', op: 'expose' }} />
            <ActionCard s={s} action={{ kind: 'underbelly', op: 'runout' }} />
            {s.rivals.filter((r) => r.kind === 'mob' && r.id !== 'philly').map((r) => (
              <ActionCard key={r.id} s={s} action={{ kind: 'underbelly', op: 'ally', rival: r.id }} compact />
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-emerald-300">They are gone: {u.outcome}.</p>
      )}
    </div>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-800/70 p-2">
      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{label}</div>
      <div className="text-xl font-semibold text-stone-100 tabular-nums">{Math.round(value)}</div>
      <div className="h-1.5 rounded bg-noir-700 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} /></div>
    </div>
  );
}
