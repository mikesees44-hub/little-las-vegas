import { useState } from 'react';
import { comeHome, comeHomePlan, visitPhase } from '../../engine/visit';
import { travellers, dayDate } from '../../engine/travel';
import { currentVisit } from '../../engine/travelState';
import { bossVacation } from '../../engine/vacation';
import { formatDate } from '../../engine/calendar';
import type { GameState } from '../../engine/types';
import { useOrders } from '../components/Orders';

/**
 * The big, bold RETURN HOME button: shown whenever the boss himself is away
 * (a visit to another city or his own vacation). One press packs him up; it
 * then says when he will be back, so the player always knows it worked.
 */
export function ReturnHome({ s, update }: { s: GameState; update: (f: (s: GameState) => GameState) => void }) {
  const { orders, queue } = useOrders();
  const [done, setDone] = useState<string | undefined>();
  if (s.gameOver) return null;

  const v = currentVisit(s);
  if (v) {
    const phase = visitPhase(s, v);
    const plan = comeHomePlan(s);
    const leaving = v.leaveDay !== undefined || phase === 'back';
    const back = v.homeDay ?? plan?.homeDay;
    return (
      <Big
        testid="return-home"
        disabled={leaving}
        label={leaving ? 'HEADING HOME' : 'RETURN HOME'}
        sub={leaving ? `Back in Wildwood ${back !== undefined ? formatDate(dayDate(back)) : 'soon'}` : plan ? `Leave ${formatDate(dayDate(plan.leaveDay))} · home ${formatDate(dayDate(plan.homeDay))}` : 'Pack up and go home'}
        note={done}
        onClick={() => { update(comeHome); setDone('✓ Packed — you are going home'); }}
      />
    );
  }

  const t = bossVacation(s);
  if (t) {
    const pos = travellers(s).find((x) => x.trip.id === t.id);
    if (pos?.phase !== 'there' && pos?.phase !== 'out') return null;
    const ordered = orders.some((o) => o.kind === 'travel' && (o as { op: { type: string; tripId?: string } }).op.type === 'recall' && (o as { op: { tripId?: string } }).op.tripId === t.id);
    return (
      <Big
        testid="return-home"
        disabled={ordered}
        label={ordered ? 'HEADING HOME' : 'RETURN HOME'}
        sub={ordered ? 'Ordered: the vacation ends early' : 'Cut the vacation short (nothing refunded)'}
        note={done}
        onClick={() => { queue({ kind: 'travel', op: { type: 'recall', tripId: t.id } }); setDone('✓ Ordered — the trip ends early'); }}
      />
    );
  }
  return null;
}

function Big({ label, sub, note, disabled, onClick, testid }: { label: string; sub: string; note?: string; disabled?: boolean; onClick: () => void; testid: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className={`pointer-events-auto flex items-center gap-3 rounded-xl border-2 px-5 py-3 text-left shadow-2xl shadow-black/80 transition ${disabled ? 'border-stone-600 bg-noir-900/95 text-stone-300 cursor-default' : 'border-gold-400 bg-gold-500 text-noir-950 hover:bg-gold-400 active:scale-[0.98]'}`}
    >
      <span className="text-3xl leading-none" aria-hidden>⌂</span>
      <span className="flex flex-col">
        <span className="font-display text-xl font-bold tracking-[0.15em] leading-tight">{label}</span>
        <span className={`text-[11px] ${disabled ? 'text-stone-400' : 'text-noir-900/80'}`}>{note ?? sub}</span>
      </span>
    </button>
  );
}
