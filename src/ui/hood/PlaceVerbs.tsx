import { useState, type ReactNode } from 'react';
import { placeActions, type PlaceAct, type PlaceActionId } from '../../engine/placeEligibility';
import { lotName } from '../../engine/property';
import type { Lot } from '../../engine/econState';
import type { Business, GameState, PlayerAction } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { DirtyHere } from '../econ/DirtyWork';
import { useEmpire } from '../empire/context';
import { useShell } from '../shell/context';

/**
 * THIS PLACE: every verb a place offers (engine/placeEligibility.ts), drawn
 * the same way on every card that shows a place — the walk card outside, the
 * lot panel inside and on the map. What fits now comes first: the ways in as
 * buttons, the orders as folded rows (the same "Are you sure?" → "Yes, boss."),
 * the dirty work with the best man picked; what doesn't fit is listed last,
 * each with its reason. A verb that needs the card it sits on (go in, call a
 * meeting, a new look) is handed in by that card; one it does not hand in is
 * offered by the card that has it.
 */
export interface PlaceHandlers {
  goIn?: () => void;
  inside?: () => void;
  meeting?: () => void;
  restyle?: () => void;
}

const DIRTY: PlaceActionId[] = ['shakedown', 'runoff', 'cardgame', 'torch'];

/** The order a verb gives, when it is one. */
export function placeOrder(l: Lot | undefined, id: PlaceActionId): PlayerAction | undefined {
  if (!l) return undefined;
  if (id === 'offer') return { kind: 'econ', op: { type: 'buyLot', lotId: l.id } };
  if (id === 'buyBusiness') return { kind: 'econ', op: { type: 'buyLot', lotId: l.id, going: true } };
  if (id === 'lease') return { kind: 'econ', op: { type: 'leaseLot', lotId: l.id } };
  if (id === 'renovate') return { kind: 'econ', op: { type: 'renovate', lotId: l.id } };
  return undefined;
}

export function PlaceVerbs({ s, lot, biz, on = {}, extra, title = 'This place', hide = [] }: {
  s: GameState;
  lot?: Lot;
  /** A business of yours here (manage it, an insurance fire). */
  biz?: Business;
  on?: PlaceHandlers;
  /** More buttons that belong to this spot (the tram, a trip from the pier). */
  extra?: ReactNode;
  title?: string;
  /** Verbs the host card already shows its own way (the lot panel's designer and manager). */
  hide?: PlaceActionId[];
}) {
  const shell = useShell();
  const empire = useEmpire();
  const [whyNot, setWhyNot] = useState(false);
  if (s.gameOver) return null;
  const acts = placeActions(s, lot, biz).filter((a) => !hide.includes(a.id));
  // A spot with no lot of its own (a landmark, the beach) can still host a meeting.
  if (on.meeting && !acts.some((a) => a.id === 'meeting')) acts.push({ id: 'meeting', label: 'Call a meeting here' });
  const opener = (a: PlaceAct): (() => void) | undefined => {
    switch (a.id) {
      case 'goIn': return on.goIn;
      case 'inside': return on.inside;
      case 'meeting': return on.meeting;
      case 'restyle': return on.restyle;
      case 'manage': return () => shell.go('holdings.rackets');
      case 'develop': return lot ? () => empire.open({ pending: { key: `lot:${lot.id}`, name: lotName(lot), develop: { lotId: lot.id } } }) : undefined;
      default: return undefined;
    }
  };
  const fits = acts.filter((a) => !a.why && !DIRTY.includes(a.id));
  const buttons = fits.filter((a) => opener(a));
  const orders = fits.filter((a) => !opener(a) && placeOrder(lot, a.id));
  // Reasons for the verbs this card can show; the dirty jobs say their own (DirtyHere).
  const notNow = acts.filter((a) => a.why && !DIRTY.includes(a.id) && (opener(a) || placeOrder(lot, a.id)));
  const hasDirty = acts.some((a) => DIRTY.includes(a.id));
  return (
    <section className="space-y-1.5" data-testid="place-verbs">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{title}</div>
      {(buttons.length > 0 || extra) && (
        <div className="flex flex-wrap gap-1.5" data-testid="walk-verbs">
          {buttons.map((a, i) => (
            <button key={a.id} type="button" className={`${i === 0 && a.id === 'goIn' ? 'btn-gold' : 'btn-ghost'} text-xs py-1`} onClick={opener(a)} data-testid={a.id === 'goIn' ? 'walk-go-in' : a.id === 'meeting' ? 'walk-call-meeting' : `place-verb-${a.id}`}>{a.label}</button>
          ))}
          {extra}
        </div>
      )}
      {orders.map((a) => <ActionRow key={a.id} s={s} action={placeOrder(lot, a.id)!} label={a.label} />)}
      {hasDirty && <DirtyHere s={s} lot={lot} biz={biz} onGo={() => shell.go('holdings.dirty')} />}
      {notNow.length > 0 && (
        <div className="text-[11px] text-stone-500" data-testid="place-not-now">
          <button type="button" className="hover:text-gold-300" onClick={() => setWhyNot((x) => !x)} aria-expanded={whyNot}>Not here, not now: {notNow.length} {whyNot ? '▴' : '▾'}</button>
          {whyNot && <ul className="mt-0.5 space-y-0.5">{notNow.map((a) => <li key={a.id}><span className="text-stone-400">{a.label}</span> — {a.why}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
