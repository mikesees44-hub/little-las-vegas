import { lotName, STAGE_LABEL, ZONES_BY_ID } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { LOT_GLYPH } from '../map/lotPins';

interface ShapeLike { id: string; pins: [number, number][] }

/**
 * The house's buildings on the island map: a small square per lot, its glyph
 * the construction stage (★ once open). Sits beside the business pins.
 */
export function IslandLots({ s, shapes }: { s: GameState; shapes: ShapeLike[] }) {
  const lots = (s.econ?.lots ?? []).filter((l) => (l.status === 'owned' || l.status === 'leased') && !l.bizId);
  return (
    <g pointerEvents="none" data-testid="island-lots">
      {shapes.map((sh) => {
        const here = lots.filter((l) => ZONES_BY_ID[l.zone].district === sh.id);
        return here.map((l, i) => {
          const p = sh.pins[(sh.pins.length - 1 - i + sh.pins.length * 4) % sh.pins.length];
          const x = p[0] + 6 + Math.floor(i / sh.pins.length) * 6;
          const y = p[1] - 6;
          const building = l.stage && l.stage !== 'open' && l.stage !== 'purchase';
          return (
            <g key={l.id}>
              <rect x={x - 5} y={y - 5} width="10" height="10" rx="1.5" fill={building ? '#d08a3a' : '#e7c25a'} stroke="#0b0a09" strokeWidth="1" />
              <text x={x} y={y + 3} fontSize="7.5" textAnchor="middle" fill="#0b0a09" fontWeight="bold">{l.stage ? LOT_GLYPH[l.stage] : '·'}</text>
              <title>{`${lotName(l)} — ${l.stage ? STAGE_LABEL[l.stage] : ''}`}</title>
            </g>
          );
        });
      })}
    </g>
  );
}
