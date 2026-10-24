import { useState } from 'react';
import { expectedTake, owned } from '../../engine/business';
import { CATALOG } from '../../engine/catalog';
import { districtTake } from '../../engine/economy';
import { FACTION_NAMES } from '../../engine/world';
import type { FactionId, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { IslandLots } from '../econ/IslandLots';

/**
 * Stylized map of the island, north at the top: North Wildwood, then
 * Wildwood (bay docks on the west, downtown, Pacific Avenue, the boardwalk
 * on the ocean with the amusement piers), Wildwood Crest at the south end,
 * and the Rio Grande causeway over the marsh to the mainland.
 */

interface Shape { id: string; d: string; label: [number, number]; pins: [number, number][]; rot?: boolean; hq?: [number, number] }

export const SHAPES: Shape[] = [
  { id: 'north', d: 'M222,28 L300,40 L318,150 L232,158 L210,96 Z', label: [262, 100], hq: [262, 60], pins: [[245, 75], [270, 80], [292, 90], [250, 120], [278, 128], [300, 135]] },
  { id: 'docks', d: 'M232,158 L262,157 L268,390 L238,392 L222,280 Z', label: [247, 285], rot: true, hq: [247, 215], pins: [[244, 190], [248, 230], [252, 320], [255, 360]] },
  { id: 'downtown', d: 'M262,157 L290,155 L296,390 L268,390 Z', label: [279, 290], rot: true, hq: [279, 205], pins: [[276, 185], [280, 225], [283, 315], [286, 350], [278, 255]] },
  { id: 'pacific', d: 'M290,155 L312,153 L318,390 L296,390 Z', label: [305, 290], rot: true, hq: [305, 195], pins: [[301, 175], [303, 210], [305, 240], [307, 330], [309, 365], [304, 270]] },
  { id: 'boardwalk', d: 'M312,153 L330,152 L338,390 L318,390 Z', label: [327, 270], rot: true, hq: [327, 190], pins: [[322, 170], [324, 205], [326, 290], [328, 325], [330, 360], [325, 230]] },
  { id: 'piers', d: 'M330,175 L372,175 L372,192 L331,192 Z M332,262 L380,262 L380,280 L333,280 Z M335,340 L374,340 L374,356 L336,356 Z', label: [395, 300], hq: [392, 225], pins: [[352, 183], [365, 183], [356, 271], [370, 271], [354, 348], [366, 348]] },
  { id: 'crest', d: 'M238,392 L338,390 L346,520 L300,548 L250,520 Z', label: [292, 455], hq: [292, 425], pins: [[262, 420], [290, 420], [318, 425], [270, 470], [310, 480], [290, 505]] },
  { id: 'causeway', d: 'M40,236 L120,232 L226,262 L224,282 L120,268 L40,290 Z', label: [120, 300], hq: [120, 255], pins: [[70, 260], [95, 250], [150, 262], [185, 268]] },
];

const FACTION_FILL: Record<FactionId, string> = {
  player: '#c49a3a', manno: '#a3352b', feldstein: '#4f5fb0', kessler: '#2f8a57', philly: '#7a4a9a', law: '#2f6f9a', none: '#4a4540',
};

export type MapMode = 'control' | 'heat' | 'income' | 'rival';

function topFaction(s: GameState, id: string): [FactionId, number] {
  const d = s.districts.find((x) => x.id === id)!;
  return (Object.entries(d.influence) as [FactionId, number][]).filter(([f]) => f !== 'none').sort((a, b) => b[1] - a[1])[0] ?? ['none', 0];
}

export function districtHeat(s: GameState, id: string): number {
  const biz = owned(s).filter((b) => b.districtId === id).reduce((a, b) => a + CATALOG[b.kind].heat * 40, 0);
  const d = s.districts.find((x) => x.id === id)!;
  return Math.min(100, Math.round(biz + s.heat.local * ((d.influence.player ?? 0) / 100) * 0.8));
}

export function districtIncome(s: GameState, id: string): number {
  return Math.round(districtTake(s, id) + owned(s).filter((b) => b.districtId === id).reduce((a, b) => a + expectedTake(s, b), 0));
}

function scale(t: number, from: string, to: string): string {
  const a = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  const u = Math.max(0, Math.min(1, t));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * u).toString(16).padStart(2, '0')).join('');
}

export function IslandMap({ s, selected, onSelect }: { s: GameState; selected?: string; onSelect: (id: string) => void }) {
  const [mode, setMode] = useState<MapMode>('control');
  const [hover, setHover] = useState<string | undefined>();
  const maxIncome = Math.max(1, ...s.districts.map((d) => districtIncome(s, d.id)));

  function fill(id: string): { color: string; opacity: number } {
    const d = s.districts.find((x) => x.id === id)!;
    switch (mode) {
      case 'control': {
        const [f, v] = topFaction(s, id);
        return { color: FACTION_FILL[f], opacity: 0.25 + 0.6 * (v / 100) };
      }
      case 'heat':
        return { color: scale(districtHeat(s, id) / 100, '#2a3a4a', '#d0452f'), opacity: 0.85 };
      case 'income':
        return { color: scale(districtIncome(s, id) / maxIncome, '#2a2620', '#e7c25a'), opacity: 0.85 };
      case 'rival': {
        const rv = (Object.entries(d.influence) as [FactionId, number][]).filter(([f]) => f !== 'player' && f !== 'none').reduce((a, [, v]) => Math.max(a, v), 0);
        return { color: scale(rv / 100, '#2a2a2a', '#b0302a'), opacity: 0.85 };
      }
    }
  }

  const hq: { id: FactionId; d: string; letter: string }[] = [
    { id: 'player', d: 'pacific', letter: s.houseName[0] ?? 'Y' },
    ...s.rivals.filter((r) => r.homeDistrict && s.characters[r.leaderId]?.alive).map((r) => ({ id: r.id as FactionId, d: r.homeDistrict!, letter: r.shortName[0] })),
  ];
  const tip = hover ? s.districts.find((d) => d.id === hover) : undefined;

  return (
    <div className="relative">
      <div className="absolute top-2 left-2 z-10 flex gap-1 flex-wrap" role="group" aria-label="Map mode">
        {(['control', 'heat', 'income', 'rival'] as MapMode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-1 text-[11px] font-semibold border ${mode === m ? 'bg-gold-500 text-noir-950 border-gold-400' : 'bg-noir-900/80 text-stone-300 border-noir-600 hover:border-gold-500'}`}>
            {m === 'rival' ? 'Rival influence' : m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 420 560" preserveAspectRatio="xMidYMid meet" className="w-full h-[calc(100vh-200px)] min-h-[520px] block" data-testid="island-map">
        <defs>
          <linearGradient id="ocean" x1="0" x2="1">
            <stop offset="0%" stopColor="#0d1c26" />
            <stop offset="100%" stopColor="#0a1a2a" />
          </linearGradient>
          <pattern id="waves" width="18" height="10" patternUnits="userSpaceOnUse">
            <path d="M0,6 q4.5,-4 9,0 t9,0" stroke="#17344a" strokeWidth="1" fill="none" />
          </pattern>
          <pattern id="marsh" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M2,8 l0,-4 M5,8 l0,-3" stroke="#2a3a24" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="420" height="560" fill="#0e1410" />
        <rect width="420" height="560" fill="url(#marsh)" opacity="0.6" />
        <path d="M335,0 L420,0 L420,560 L330,560 Q350,470 340,390 L332,150 Q320,60 335,0 Z" fill="url(#ocean)" />
        <path d="M335,0 L420,0 L420,560 L330,560 Q350,470 340,390 L332,150 Q320,60 335,0 Z" fill="url(#waves)" opacity="0.7" />
        {/* the bay */}
        <path d="M130,0 L225,0 L210,96 L222,280 L238,392 L250,520 L230,560 L150,560 Q190,420 180,300 Q170,180 130,0 Z" fill="#0f2230" opacity="0.85" />
        <text x="40" y="200" fill="#5a6a5a" fontSize="11" fontStyle="italic">mainland · Rio Grande</text>
        <text x="380" y="520" fill="#2a4a62" fontSize="12" fontStyle="italic" textAnchor="middle" transform="rotate(-90 380 520)">Atlantic Ocean</text>
        <text x="175" y="130" fill="#2f4f62" fontSize="10" fontStyle="italic">the bay</text>

        {SHAPES.map((sh) => {
          const f = fill(sh.id);
          const sel = selected === sh.id;
          return (
            <g key={sh.id} onClick={() => onSelect(sh.id)} onMouseEnter={() => setHover(sh.id)} onMouseLeave={() => setHover(undefined)} className="cursor-pointer" data-district={sh.id}>
              <path d={sh.d} fill={f.color} fillOpacity={f.opacity} stroke={sel ? '#ecd38f' : '#0b0a09'} strokeWidth={sel ? 2.5 : 1.2} />
            </g>
          );
        })}
        {/* business pins */}
        {SHAPES.map((sh) => {
          const biz = owned(s).filter((b) => b.districtId === sh.id).slice(0, sh.pins.length);
          return biz.map((b, i) => {
            const [x, y] = sh.pins[i];
            const cat = CATALOG[b.kind].category;
            return (
              <g key={b.id} pointerEvents="none">
                <circle cx={x} cy={y} r="3.6" fill={cat === 'racket' ? '#b0302a' : cat === 'front' ? '#e7c25a' : '#9aa'} stroke="#0b0a09" strokeWidth="1" />
                <title>{b.name}</title>
              </g>
            );
          });
        })}
        <IslandLots s={s} shapes={SHAPES} />
        {/* HQs */}
        {hq.map((h) => {
          const sh = SHAPES.find((x) => x.id === h.d);
          if (!sh) return null;
          const [x, y] = sh.hq ?? [sh.label[0], sh.label[1] - 18];
          return (
            <g key={h.id} pointerEvents="none">
              <rect x={x - 8} y={y - 8} width="16" height="16" rx="3" fill={FACTION_FILL[h.id]} stroke="#ecd38f" strokeWidth="1" />
              <text x={x} y={y + 4} fontSize="10" textAnchor="middle" fill="#0b0a09" fontWeight="bold">{h.letter}</text>
            </g>
          );
        })}
        {SHAPES.map((sh) => {
          const d = s.districts.find((x) => x.id === sh.id)!;
          return (
            <text key={`l${sh.id}`} x={sh.label[0]} y={sh.label[1]} fontSize="9.5" textAnchor="middle" fill="#f3ead6" pointerEvents="none" transform={sh.rot ? `rotate(-90 ${sh.label[0]} ${sh.label[1]})` : undefined} dominantBaseline="middle" style={{ paintOrder: 'stroke', stroke: '#0b0a09', strokeWidth: 3 }}>
              {d.name.replace(' Clubs', '').replace('Amusement ', '').replace('Rio Grande ', '')}
            </text>
          );
        })}
      </svg>
      {tip && (
        <div className="absolute top-10 left-2 z-10 rounded border border-noir-600 bg-noir-900/95 px-2 py-1 text-[11px] text-stone-300 pointer-events-none max-w-[60%]">
          <div className="text-gold-300 font-semibold">{tip.name}</div>
          {(Object.entries(tip.influence) as [FactionId, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([f, v]) => <div key={f}>{FACTION_NAMES[f]} {v}%</div>)}
          <div>Take ~{fmt$(districtIncome(s, tip.id))}/wk · heat {districtHeat(s, tip.id)}</div>
        </div>
      )}
      <div className="absolute bottom-2 right-2 z-10 rounded bg-noir-900/85 border border-noir-700 px-2 py-1 text-[10px] text-stone-400 flex flex-wrap gap-x-2 max-w-[55%]">
        {mode === 'control' ? (Object.keys(FACTION_FILL) as FactionId[]).filter((f) => f !== 'law').map((f) => (
          <span key={f}><span className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: FACTION_FILL[f] }} />{FACTION_NAMES[f]}</span>
        )) : <span>{mode === 'heat' ? 'Cool → hot' : mode === 'income' ? 'Your weekly take, low → high' : 'Rival share, low → high'}</span>}
        <span><span className="inline-block w-2 h-2 mr-1 rounded-full bg-[#e7c25a]" />front</span>
        <span><span className="inline-block w-2 h-2 mr-1 rounded-full bg-[#b0302a]" />racket</span>
        <span><span className="inline-block w-2 h-2 mr-1 rounded-sm bg-[#e7c25a]" />building (★ open, § permits … ◩ interior)</span>
      </div>
    </div>
  );
}

export { FACTION_FILL };
