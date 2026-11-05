import { useMemo, useState } from 'react';
import { crewBoard, ownScoresOn, STATUS_WORD, type BoardStatus } from '../../engine/crewBoard';
import type { GameState, PlayerAction } from '../../engine/types';
import { Card, CardHead } from '../components/Layout';
import { useOrders } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { sameOrder } from '../verbs';
import { fmt$ } from '../format';

const INK: Record<BoardStatus, string> = {
  starving: 'border-red-500/60 text-red-300', needs: 'border-amber-500/60 text-amber-300', own: 'border-sky-500/50 text-sky-300',
  earning: 'border-emerald-500/50 text-emerald-300', over: 'border-violet-500/50 text-violet-300', away: 'border-noir-600 text-stone-500',
};

/**
 * Who is earning (engine/crewBoard.ts): every man on one line, the ones who
 * need a job first, what he is on, what he kicks up, and the one job to give
 * him. "Give them all" asks once with the list; nothing goes without a yes.
 */
export function CrewBoard({ s }: { s: GameState }) {
  const { orders, queue } = useOrders();
  const board = useMemo(() => crewBoard(s), [s]);
  const [all, setAll] = useState(false);
  const [ask, setAsk] = useState(false);
  const isQ = (a: PlayerAction) => orders.some((o) => sameOrder(o, a));
  const todo = board.rows.filter((r) => r.assign && !isQ(r.assign.action) && r.status !== 'earning');
  const need = board.count.starving + board.count.needs;
  const shown = all ? board.rows : board.rows.filter((r) => r.status !== 'earning' && r.status !== 'away');
  const on = ownScoresOn(s);
  const toggle: PlayerAction = { kind: 'mymen', op: { op: 'selfscore', on: !on } } as PlayerAction;
  const pending = orders.find((o) => o.kind === 'mymen' && (o as { op: { op: string } }).op.op === 'selfscore');
  return (
    <Card domain="crew" testid="crew-board">
      <CardHead d="crew" title="Who is earning" sub="Every man on one line: who needs a job, who is working his own scores, who is earning, and the one thing to give him." />
      <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]" data-testid="crew-board-sum">
        <span className={`rounded border px-2 py-0.5 ${need ? INK.needs : 'border-noir-600 text-stone-400'}`}>{need} need a job</span>
        <span className={`rounded border px-2 py-0.5 ${INK.own}`}>{board.count.own} on their own scores</span>
        <span className={`rounded border px-2 py-0.5 ${INK.earning}`}>{board.count.earning} earning</span>
        {board.count.over > 0 && <span className={`rounded border px-2 py-0.5 ${INK.over}`}>{board.count.over} overworked</span>}
        <span className="rounded border border-noir-600 px-2 py-0.5 text-stone-300">~{fmt$(board.upWeek)}/wk kicked up</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {todo.length > 0 && <button type="button" className="btn-primary text-xs" onClick={() => setAsk(true)} data-testid="crew-board-all">Give all {todo.length} a job the consigliere's way</button>}
        <button type="button" className="btn-secondary text-xs" disabled={!!pending} onClick={() => queue(toggle, true)} data-testid="crew-board-own" title="A standing order: idle men go out on their own now and then; half of what they find is kicked up.">
          Idle men find their own scores: {pending ? 'changing at the week' : on ? 'On' : 'Off'} {pending ? '' : on ? '· turn off' : '· turn on'}
        </button>
        <button type="button" className="btn-secondary text-xs" onClick={() => setAll((v) => !v)} data-testid="crew-board-show">{all ? 'Only who needs something' : `Everyone (${board.rows.length})`}</button>
      </div>
      {ask && (
        <div className="mb-2 rounded-md border border-gold-500/50 bg-noir-900/90 p-2 text-xs" role="dialog" aria-label="Confirm" data-testid="crew-board-confirm">
          <ul className="mb-2 space-y-0.5 text-stone-300">{todo.map((r) => <li key={r.c.id}>• {r.c.firstName} {r.c.lastName}: {r.assign!.label}</li>)}</ul>
          <div className="flex gap-1.5">
            <button type="button" className="btn-primary text-xs" onClick={() => { for (const r of todo) queue(r.assign!.action, true); setAsk(false); }} data-testid="crew-board-yes">Give the orders</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setAsk(false)}>Not now</button>
          </div>
        </div>
      )}
      {shown.length === 0 ? <p className="text-[11px] text-stone-400">Every man is earning. Nobody needs a job right now.</p> : (
        <ul className="space-y-1.5">
          {shown.map((r) => {
            const q = r.assign ? isQ(r.assign.action) : false;
            return (
              <li key={r.c.id} className="flex items-start gap-2" data-testid="crew-board-row" data-status={r.status}>
                <Face s={s} c={r.c} size={30} />
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <CharLink s={s} id={r.c.id} /><span className="text-stone-500">{r.c.rank}</span>
                    <span className={`rounded border px-1.5 text-[10px] ${INK[r.status]}`}>{STATUS_WORD[r.status]}</span>
                    <span className="tabular-nums text-stone-400">{r.upWeek ? `~${fmt$(r.upWeek)}/wk up` : 'nothing kicked up lately'}</span>
                  </div>
                  <p className="text-[11px] text-stone-400">
                    {r.on.length ? `On: ${r.on.join(', ')}` : r.own ? `His own: ${r.own.what}${r.own.up ? `, ${fmt$(r.own.up)} up` : ', went wrong'}` : 'Nothing to do.'}
                    {r.assign && !q ? <span className="text-stone-500"> · {r.assign.why}</span> : null}
                  </p>
                </div>
                {r.assign && <button type="button" className={`${r.status === 'earning' ? 'btn-secondary' : 'btn-primary'} shrink-0 text-xs`} disabled={q} onClick={() => queue(r.assign!.action, true)} data-testid="crew-board-assign">{q ? 'Ordered' : r.assign.label}</button>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
