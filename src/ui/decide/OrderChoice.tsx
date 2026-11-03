import { previewAction } from '../../engine/actions';
import { oddsOfPreview, stakesLine, worstOfPreview } from '../../engine/decide';
import type { GameState, PlayerAction } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { sameOrder } from '../verbs';
import { DecisionCard, type DecisionOption, type Voice } from './DecisionCard';

/**
 * A decision whose options are orders (a capo's request: yes, someone else,
 * no): the one decision card, each option with the order's odds (or
 * "certain"), its worst way and its cost; the primary gives the picked order.
 */
export function OrderChoice({ s, title, text, options, voices, testid, onHandOff, handOffLabel }: {
  s: GameState;
  title?: string;
  text?: string;
  options: { id: string; label?: string; action: PlayerAction; hostile?: boolean; rowTestId?: string }[];
  voices?: Voice[];
  testid?: string;
  onHandOff?: () => void;
  handOffLabel?: string;
}) {
  const { orders, queue } = useOrders();
  const pv = options.map((o) => previewAction(s, o.action));
  const given = options.find((o) => orders.some((x) => sameOrder(x, o.action)));
  const opts: DecisionOption[] = options.map((o, i) => ({
    id: o.id, label: o.label ?? pv[i].title, effects: pv[i].effects, odds: oddsOfPreview(pv[i]), worst: worstOfPreview(pv[i]),
    cost: pv[i].cost || undefined, pocket: pv[i].pot === 'pocket', disabled: pv[i].disabledReason, hostile: o.hostile, done: given?.id === o.id, rowTestId: o.rowTestId,
  }));
  return (
    <DecisionCard s={s} compact title={title} text={text} options={opts} voices={voices} selected={given?.id}
      stakes={stakesLine(s, pv.map((p) => p.effects))}
      onDecide={(id) => { const o = options.find((x) => x.id === id); if (o && !orders.some((x) => sameOrder(x, o.action))) queue(o.action); }}
      primaryLabel={(o) => (!o ? 'Pick one' : given?.id === o.id ? 'Given ✓' : 'Give the order ▸')}
      primaryDisabled={!!given}
      onHandOff={onHandOff} handOffLabel={handOffLabel}
      testid={testid} />
  );
}
