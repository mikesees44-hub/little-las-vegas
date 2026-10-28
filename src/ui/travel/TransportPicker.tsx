import { aircraft, carryLine, legHours, optFare, TRANSPORT, transportBlock, type TransportId } from '../../engine/transport';
import type { Dest } from '../../engine/travelDests';
import type { BudgetTier, TravelMode } from '../../engine/travelState';
import type { GameDate } from '../../engine/types';
import { fmt$ } from '../format';

/**
 * Which way exactly, inside a mode: your Caddy or a hired driver, the club
 * car or coach, Philadelphia or Idlewild or Bader Field, a charter boat or
 * (from July 1964) the Cape May–Lewes Ferry. Each shows its door-to-door
 * hours, fare, privacy and what can come along. Ways that don't go there are
 * shown with the reason.
 */
export function TransportPicker({ dest, mode, tier, date, value, onPick, only }: {
  dest: Dest; mode: TravelMode; tier: BudgetTier; date: GameDate; value?: TransportId; onPick: (id: TransportId) => void; only?: TransportId[];
}) {
  const ids = (Object.keys(TRANSPORT) as TransportId[]).filter((id) => TRANSPORT[id].mode === mode && (!only || only.includes(id)));
  // Ways that don't go there are left out — except the ferry to Delaware before it sails (shown, with the date).
  const visible = ids.filter((id) => !transportBlock(id, dest, date) || (id === 'ferry' && !!dest.waterMi));
  if (visible.length <= 1 && !visible.some((id) => transportBlock(id, dest, date))) {
    const o = visible[0] ? TRANSPORT[visible[0]] : undefined;
    return o ? <Detail id={o.id} dest={dest} /> : null;
  }
  const cur = value && visible.includes(value) && !transportBlock(value, dest, date) ? value : visible.find((id) => !transportBlock(id, dest, date));
  return (
    <div className="mt-2 space-y-1" data-testid="transport-picker">
      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Which way</div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {visible.map((id) => {
          const o = TRANSPORT[id];
          const why = transportBlock(id, dest, date);
          return (
            <button key={id} type="button" disabled={!!why} title={why ?? o.blurb} data-transport={id} onClick={() => onPick(id)}
              className={`rounded border px-2 py-1.5 text-left text-xs disabled:opacity-40 ${cur === id ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'border-noir-600 text-stone-300 hover:border-gold-600'}`}>
              <span className="block font-semibold">{o.name}</span>
              <span className="block text-[10px] text-stone-500">{why ?? `${doorToDoor(legHours(o, dest))} door to door · ${fmt$(optFare(o, dest, tier))} one way · private ${Math.round(o.privacy * 10)}/10`}</span>
            </button>
          );
        })}
      </div>
      {cur && <Detail id={cur} dest={dest} />}
    </div>
  );
}

function Detail({ id, dest }: { id: TransportId; dest: Dest }) {
  const o = TRANSPORT[id];
  const plane = aircraft(o, dest);
  return (
    <div className="text-[11px] text-stone-400 space-y-0.5" data-testid="transport-detail">
      <div><span className="text-stone-300">{o.carrier}.</span> {o.blurb}{plane ? ` You fly ${plane}.` : ''}</div>
      <div className="text-stone-500">Along: {carryLine(o)}{o.manifest ? ' · your name on a list' : ''}</div>
    </div>
  );
}

/** "2½ hours", "27 hours". */
export function doorToDoor(h: number): string {
  if (h >= 10) return `${Math.round(h)} hours`;
  const whole = Math.floor(h);
  const f = h - whole >= 0.74 ? '¾' : h - whole >= 0.49 ? '½' : h - whole >= 0.24 ? '¼' : '';
  return `${whole}${f} hour${whole === 1 && !f ? '' : 's'}`;
}
