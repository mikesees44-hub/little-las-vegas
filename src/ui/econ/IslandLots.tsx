import { lotName, STAGE_LABEL, ZONES_BY_ID } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { lotSvg } from '../map/lotIcons';

interface ShapeLike { id: string; pins: [number, number][] }

const OFFSETS: [number, number][] = [[7, -7], [-7, 7], [8, 8], [-8, -8]];

/**
 * Every lot on the island map as a small building icon: empty ground, stakes,
 * a crew, a frame under a crane, then the finished hotel, motel, store or club,
 * coloured by who owns it. The island fills in as the years go by.
 */
export function IslandLots({ s, shapes }: { s: GameState; shapes: ShapeLike[] }) {
  const lots = s.econ?.lots ?? [];
  return (
    <g pointerEvents="none" data-testid="island-lots">
      {shapes.map((sh) => {
        const here = lots.filter((l) => ZONES_BY_ID[l.zone].district === sh.id && (l.use || l.status === 'owned' || l.status === 'leased'));
        return here.map((l, i) => {
          const p = sh.pins[i % sh.pins.length];
          const o = OFFSETS[Math.floor(i / sh.pins.length) % OFFSETS.length];
          const x = p[0] + o[0];
          const y = p[1] + o[1];
          return (
            <g key={l.id} transform={`translate(${x - 6} ${y - 6})`}>
              <g dangerouslySetInnerHTML={{ __html: lotSvg(l, { size: 12 }) }} />
              <title>{`${lotName(l)} — ${l.stage ? STAGE_LABEL[l.stage] : ''}`}</title>
            </g>
          );
        });
      })}
    </g>
  );
}
