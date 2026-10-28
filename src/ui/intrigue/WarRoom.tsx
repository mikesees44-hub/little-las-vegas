import { warRoom } from '../../engine/intrigue';
import { raidOdds } from '../../engine/war';
import { fmt$ } from '../format';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';

/**
 * THE WAR ROOM: during a war, the fronts by district, the men you have, the
 * war ledger (what the violence cost and what it bought), and peace terms.
 * After the shooting, the ledgers of past wars and the settlements in force.
 */
export function WarRoom({ s }: { s: GameState }) {
  const rooms = warRoom(s);
  const past = (s.intrigue?.ledgers ?? []).filter((l) => l.endWeek !== undefined).slice().reverse();
  const settlements = Object.values(s.intrigue?.eras ?? {}).filter((t) => t.a === 'player' && t.settlement && t.settlement.until > s.week);
  return (
    <div className="space-y-6" data-testid="war-room">
      {rooms.length === 0 && (
        <section>
          <div className="panel-title">The war room</div>
          <p className="text-xs text-stone-500">No war. The war room opens when the mattresses come out: yours (a casus belli and the Table, under The Table & Wars) or theirs (a cold war that boils over).</p>
        </section>
      )}
      {rooms.map(({ war: w, rival: r, fronts, menAvailable, ours, theirs, ledger: l }) => {
        const net = l ? l.gained - l.spent : 0;
        return (
          <section key={w.id} className="rounded-md border border-blood-500/50 bg-blood-500/10 p-3" data-testid="war-room-war">
            <div className="flex justify-between text-sm"><span className="text-stone-100 font-semibold">War with {r.name}</span><span className="text-xs text-stone-400">since week {w.startWeek} · score {w.score > 0 ? '+' : ''}{w.score}</span></div>
            <div className="mt-1 text-[11px] text-stone-400">Your men in the field: {menAvailable} · your strength {Math.round(ours)} against their {Math.round(theirs)} · raids succeed {Math.round(raidOdds(s, w) * 100)}%</div>

            <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-stone-500">The fronts</div>
            <table className="mt-1 w-full text-xs" data-testid="fronts">
              <thead><tr className="text-stone-500"><th className="text-left">District</th><th>You</th><th>Them</th><th /></tr></thead>
              <tbody>
                {fronts.map((f) => (
                  <tr key={f.district} className={f.main ? 'text-gold-300' : 'text-stone-300'}>
                    <td>{f.name}{f.main ? ' — the prize' : ''}</td>
                    <td className="text-center tabular-nums">{f.mine}%</td>
                    <td className="text-center tabular-nums">{f.theirs}%</td>
                    <td className="text-right">{!f.main && <ActionCard s={s} action={{ kind: 'intrigue', op: { op: 'front', warId: w.id, district: f.district } }} compact />}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-stone-500">The war ledger</div>
            {l ? (
              <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-1 text-xs" data-testid="war-ledger">
                <div>Spent <span className="text-red-300 tabular-nums">{fmt$(l.spent)}</span></div>
                <div>Taken <span className="text-emerald-300 tabular-nums">{fmt$(l.gained)}</span></div>
                <div>Net <span className={`tabular-nums ${net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fmt$(net)}</span></div>
                <div>Men lost {l.menLost} · theirs {l.theirsLost}</div>
              </div>
            ) : <p className="text-[11px] text-stone-500">The ledger opens next week.</p>}
            {l && l.notes.length > 0 && <ul className="mt-1 text-[11px] text-stone-400">{l.notes.slice(-4).map(([wk, t], i) => <li key={i}>Wk {wk}: {t}</li>)}</ul>}

            <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-stone-500">Hit them, or offer terms</div>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              <ActionCard s={s} action={{ kind: 'raid', warId: w.id }} compact />
              <ActionCard s={s} action={{ kind: 'terms', warId: w.id, terms: 'district' }} compact />
              <ActionCard s={s} action={{ kind: 'terms', warId: w.id, terms: 'tribute' }} compact />
              <ActionCard s={s} action={{ kind: 'terms', warId: w.id, terms: 'white' }} compact />
            </div>
            <p className="mt-1 text-[11px] text-stone-500">A war you win takes their book in the prize district: a weekly tribute for a season, on top of the ground. While you are ahead, their rackets there already pay you.</p>
          </section>
        );
      })}

      {settlements.length > 0 && (
        <section>
          <div className="panel-title">Settlements in force</div>
          <ul className="text-xs space-y-1">
            {settlements.map((t) => <li key={t.key}><span className="text-sky-300">{s.rivals.find((r) => r.id === t.b)?.name}</span>: {t.settlement!.text} (until week {t.settlement!.until}; so far {fmt$(t.settlement!.paid)})</li>)}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <div className="panel-title">Past wars: what the violence bought</div>
          <ul className="text-xs space-y-1" data-testid="past-wars">
            {past.map((l) => (
              <li key={l.warId}>{s.rivals.find((r) => r.id === l.rival)?.name}, weeks {l.startWeek}–{l.endWeek}: <span className={l.outcome === 'won' ? 'text-emerald-300' : l.outcome === 'lost' ? 'text-red-300' : 'text-stone-300'}>{l.outcome}</span> · spent {fmt$(l.spent)} · taken {fmt$(l.gained)} · ground {l.influence >= 0 ? '+' : ''}{l.influence}% · men lost {l.menLost}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
