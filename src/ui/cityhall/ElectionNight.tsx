import { OFFICE_BY_ID } from '../../engine/polData';
import { Overlay } from '../components/Modal';
import { mName, type ElectionResult } from '../../engine/polState';
import type { GameState } from '../../engine/types';

/** Election night: the front page, then every race's count. */
export function ElectionNight({ s, results, onClose }: { s: GameState; results: ElectionResult[]; onClose: () => void }) {
  if (!results.length) return null;
  const lead = results.find((r) => r.backed) ?? results[0];
  return (
    <Overlay z={1300} className="flex items-start justify-center overflow-y-auto bg-black/80 p-2 sm:p-6" onClick={onClose} data-testid="election-night">
      <div className="w-full max-w-2xl rounded-md bg-[#efe6d2] p-3 sm:p-5 text-[#1d1a16] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b-4 border-double border-[#1d1a16] pb-1 text-center">
          <div className="font-display text-2xl sm:text-3xl tracking-wide">{lead.paper}</div>
          <div className="text-[11px] uppercase tracking-[0.3em]">Election Extra · {mName(lead.when)}</div>
        </div>
        <h2 className="mt-3 text-center font-display text-2xl sm:text-4xl font-bold leading-tight" data-testid="election-headline">{lead.headline}</h2>
        <div className="mt-3 space-y-3">
          {results.map((r) => {
            const def = OFFICE_BY_ID[r.office];
            const rows = Object.entries(r.shares).sort((a, b) => b[1] - a[1]);
            return (
              <div key={r.id} className="border-t border-[#1d1a16]/40 pt-2">
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <div className="font-semibold">{def?.title}{r.special ? ' (special election)' : ''}</div>
                  <div className="text-xs">Turnout {r.turnout}%</div>
                </div>
                <table className="mt-1 w-full text-sm">
                  <tbody>
                    {rows.map(([id, v]) => (
                      <tr key={id} className={r.winners.includes(id) ? 'font-bold' : ''}>
                        <td className="py-0.5 pr-2">{r.winners.includes(id) ? '✓ ' : ''}{r.names[id]}{r.backed === id ? ' — your man' : ''}</td>
                        <td className="w-1/2 py-0.5"><div className="h-2 bg-[#1d1a16]/15"><div className="h-2 bg-[#7a1c14]" style={{ width: `${v}%` }} /></div></td>
                        <td className="py-0.5 pl-2 text-right tabular-nums">{v.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.fallout.length > 0 && <div className="mt-1 text-xs italic">Trouble: {r.fallout.join('; ')}.</div>}
              </div>
            );
          })}
        </div>
        <div className="mt-4 text-center"><button className="rounded bg-[#1d1a16] px-4 py-2 text-sm text-[#efe6d2]" onClick={onClose}>Fold the paper</button></div>
        <div className="sr-only">{s.week}</div>
      </div>
    </Overlay>
  );
}
