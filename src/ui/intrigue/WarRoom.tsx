import { warRoom } from '../../engine/intrigue';
import { raidOdds } from '../../engine/war';
import { ADJ, allyMen, attackable, battlePlan, frontsOf, GOAL_LABEL, rivalLabel, type FrontView } from '../../engine/army';
import { SIDE_STYLE } from '../../engine/sides';
import { fmt$ } from '../format';
import type { GameState, War } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { ArmyMeterLine } from '../army/ArmyPanel';

/** The island, schematically: where each district sits on the war map. */
const SPOT: Record<string, [number, number]> = {
  causeway: [38, 78], docks: [112, 44], north: [236, 18], downtown: [118, 92], pacific: [186, 82], piers: [222, 50], boardwalk: [262, 104], crest: [176, 128],
};

function colorOf(f: string | undefined): string {
  return f ? SIDE_STYLE[f as keyof typeof SIDE_STYLE]?.color ?? '#8f877c' : '#3b3530';
}

/** The fronts on the map: each district in its holder's colour, the occupied ones striped, a battle massing marked. */
function FrontMap({ s, w, fronts }: { s: GameState; w: War; fronts: FrontView[] }) {
  const by = new Map(fronts.map((f) => [f.district, f]));
  const edges: [string, string][] = [];
  for (const [a, bs] of Object.entries(ADJ)) for (const b of bs) if (a < b && SPOT[a] && SPOT[b] && by.has(a) && by.has(b)) edges.push([a, b]);
  return (
    <svg viewBox="0 0 300 150" className="mt-1 w-full max-w-md" role="img" aria-label={`War map: the fronts with ${rivalLabel(s, w.rival)}`} data-testid="front-map">
      <defs>
        <pattern id={`occ-${w.id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={colorOf(w.rival)} /><rect width="3" height="6" fill={colorOf('player')} />
        </pattern>
      </defs>
      {edges.map(([a, b]) => <line key={`${a}-${b}`} x1={SPOT[a][0]} y1={SPOT[a][1]} x2={SPOT[b][0]} y2={SPOT[b][1]} stroke="#5c5248" strokeWidth={1.5} strokeDasharray={by.get(a)?.onRoad && by.get(b)?.onRoad ? undefined : '3 3'} />)}
      {fronts.filter((f) => SPOT[f.district]).map((f) => {
        const [x, y] = SPOT[f.district];
        const fill = f.occupied ? `url(#occ-${w.id})` : colorOf(f.holder);
        return (
          <g key={f.district}>
            <circle cx={x} cy={y} r={f.massing ? 15 : 12} fill={fill} stroke={f.massing ? '#ef4444' : f.onRoad ? '#f4cf5a' : '#1a1206'} strokeWidth={f.massing ? 2.5 : 1.5} opacity={0.92} />
            <text x={x} y={y + 3} textAnchor="middle" fontSize="8" fill="#140f0a" fontWeight={700}>{f.massing ? '⚔' : f.occupied ? (f.occupied === 'player' ? '★' : SIDE_STYLE[w.rival as keyof typeof SIDE_STYLE]?.emblem ?? '!') : ''}</text>
            <text x={x} y={y + (y > 120 ? -16 : 24)} textAnchor="middle" fontSize="7" fill="#d6cfc4">{f.name.replace('Rio Grande ', '').replace(' Clubs', '').replace('Amusement ', '').replace('Wildwood ', '')}</text>
            <text x={x} y={y + (y > 120 ? -8 : 32)} textAnchor="middle" fontSize="6" fill="#a8a29e">{f.mine}/{f.theirs}</text>
          </g>
        );
      })}
    </svg>
  );
}

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
            <WarCampaign s={s} w={w} />

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

/** The campaign (army.ts): the war goal, the score bar, the map of the fronts, the battle massing, the men on each side, the battles fought. */
function WarCampaign({ s, w }: { s: GameState; w: War }) {
  const c = s.army?.camps[w.id];
  const fronts = frontsOf(s, w);
  const pending = s.army?.pending.filter((b) => b.warId === w.id) ?? [];
  const history = (s.army?.history ?? []).filter((h) => h.warId === w.id).slice(-5).reverse();
  const targets = fronts.filter((f) => attackable(s, w, f.district));
  const pctScore = (w.score + 100) / 2;
  return (
    <div className="mt-2" data-testid="war-campaign">
      {c && <div className="text-[11px] text-stone-300">{c.by === 'player' ? 'Your war' : `${rivalLabel(s, w.rival)} came at you`}: {GOAL_LABEL[c.goal].toLowerCase()}{c.why ? ` (${c.why})` : ''}. Battles won {c.won}, lost {c.lost}.</div>}
      <div className="mt-1" data-testid="war-score-bar" aria-label={`War score ${w.score}`}>
        <div className="flex justify-between text-[10px] text-stone-500"><span>They dictate terms (−100)</span><span>Terms at ±60</span><span>Total victory (+100)</span></div>
        <div className="relative h-2 rounded bg-noir-800 overflow-hidden">
          <div className="absolute inset-y-0 left-1/2 w-px bg-stone-500" />
          <div className={`absolute inset-y-0 ${w.score >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={w.score >= 0 ? { left: '50%', width: `${pctScore - 50}%` } : { left: `${pctScore}%`, width: `${50 - pctScore}%` }} />
        </div>
      </div>
      <div className="mt-2"><ArmyMeterLine s={s} /></div>
      {c && <div className="text-[11px] text-stone-400">{rivalLabel(s, w.rival)}: {c.enemyMen} of {c.enemyStart} men left as far as you know{c.enemyAllies.length ? ` (with ${c.enemyAllies.map((a) => `${a.men} of ${rivalLabel(s, a.from as never)}'s`).join(', ')})` : ''} · their weariness {Math.round(c.enemyTired)} · your allies in the field {allyMen(s, w.id)}</div>}
      <FrontMap s={s} w={w} fronts={fronts} />
      <div className="text-[10px] text-stone-500">Gold ring: their road in. Striped: held by force. ⚔: a battle massing. Numbers: your influence / theirs.</div>
      {pending.map((b) => {
        const p = battlePlan(s, b, 'meet');
        return (
          <div key={b.id} className="mt-2 rounded border border-red-500/50 bg-red-500/10 p-2 text-[11px] text-red-100" data-testid="pending-battle">
            {rivalLabel(s, w.rival)} is massing about {p.est.lo === p.est.hi ? p.est.lo : `${p.est.lo}–${p.est.hi}`} men at {fronts.find((f) => f.district === b.district)?.name}: the battle is next week (your decision is on the desk). If you meet them: {Math.round(p.odds * 100)}% to win, the man leading {Math.round(p.commanderRisk * 100)}%, your life {Math.round(p.bossRisk * 100)}%{p.allies ? '' : ' — and no allies beside you'}.
          </div>
        );
      })}
      {targets.length > 0 && (
        <>
          <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-stone-500">Take the fight to them</div>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">{targets.slice(0, 4).map((f) => <ActionCard key={f.district} s={s} action={{ kind: 'army', op: { op: 'attack', warId: w.id, district: f.district } }} compact />)}</div>
        </>
      )}
      {history.length > 0 && <ul className="mt-2 text-[11px] text-stone-400" data-testid="battle-history">{history.map((h, i) => <li key={i}><span className={h.won ? 'text-emerald-300' : 'text-red-300'}>Wk {h.week}</span>: {h.text}</li>)}</ul>}
    </div>
  );
}
