import { SIGN_HEX, STYLES } from '../../engine/design';
import { playerVenues, rivalVenues, venueSummary } from '../../engine/empire';
import { roomCount, venueBuilding } from '../../engine/empireBuild';
import { CONCEPTS } from '../../engine/empireData';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { useEmpire } from './context';
import { MODE_INFO, sizeLabel } from './DesignerHub';
import { Facade } from './Facade';

/** Holdings → Empire Designer: your places, and the competition on the island. */
export function EmpireSection({ s }: { s: GameState }) {
  const { open } = useEmpire();
  const mine = playerVenues(s);
  const rivals = rivalVenues(s);
  const e = s.empire;
  return (
    <div className="space-y-4" data-testid="empire-section">
      {mine.length === 0 && <p className="text-sm text-stone-400">You own no motels or hotels yet. Buy one through a Deal (Property, or a building on the map) and the Designer opens for it.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {mine.map((v) => {
          const b = venueBuilding(e!, v)!;
          const sum = venueSummary(s, v);
          const neon = SIGN_HEX[b.sign ?? 'pink'];
          return (
            <button key={v.id} type="button" onClick={() => open({ venueId: v.id })} className="rounded-md border border-noir-700 bg-noir-800/60 p-2 text-left hover:border-gold-500" data-testid="venue-card">
              <Facade style={b.style} sign={b.sign} stories={b.stories} rooms={sum.rooms} name={v.name} w={300} h={120} />
              <div className="mt-1 font-display text-lg" style={{ color: neon, textShadow: `0 0 8px ${neon}66` }}>{v.name}</div>
              <div className="text-[11px] text-stone-400">{CONCEPTS[v.concept].name} · {sizeLabel(s, v)} · {'★'.repeat(sum.stars)} · {MODE_INFO[v.policy.mode].name} mode{!v.setup ? ' · ' : ''}{!v.setup && <span className="text-[#ffb3d1]">needs setting up</span>}</div>
              <div className="text-[11px] text-stone-300">Last week {fmt$(v.last?.noi ?? 0)}{v.last?.capacity ? ` · ${Math.round(v.last.occ * 100)}% full` : v.last && !v.last.open ? ' · closed for the winter' : ''}{v.proposals.length ? ` · ${v.proposals.length} proposal${v.proposals.length > 1 ? 's' : ''}` : ''}</div>
            </button>
          );
        })}
      </div>
      {rivals.length > 0 && (
        <section>
          <h3 className="text-[11px] uppercase tracking-[0.2em] text-gold-400">The competition</h3>
          <p className="text-[11px] text-stone-500">Every motel below runs on the same system as yours and bids for the same guests.</p>
          <table className="mt-1 w-full text-xs">
            <tbody>
              {rivals.sort((a, b) => b.reputation - a.reputation).map((v) => {
                const b = venueBuilding(e!, v);
                return (
                  <tr key={v.id} className="border-t border-noir-800">
                    <td className="py-0.5" style={{ color: SIGN_HEX[b?.sign ?? 'white'] }}>{v.name}</td>
                    <td className="text-stone-400">{v.ownerName}</td>
                    <td className="text-stone-500">{CONCEPTS[v.concept].name}, {roomCount(e!, v)} rooms{b?.style ? `, ${STYLES[b.style].name}` : ''}</td>
                    <td className="text-right tabular-nums">{v.last?.capacity ? `${Math.round(v.last.occ * 100)}%` : '—'}</td>
                    <td className="text-right tabular-nums">{v.last?.adr ? `$${v.last.adr.toFixed(2)}` : ''}</td>
                    <td className="text-right">{'★'.repeat(Math.max(1, Math.round(v.reputation / 20)))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
