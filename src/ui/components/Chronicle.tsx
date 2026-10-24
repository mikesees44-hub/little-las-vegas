import { formatDate } from '../../engine/calendar';
import type { GameState } from '../../engine/types';

const KIND_COLOR: Record<string, string> = {
  decision: 'border-gold-500/60', consequence: 'border-amber-500', death: 'border-red-600', succession: 'border-gold-300',
  rival: 'border-blood-500/60', family: 'border-emerald-700', heat: 'border-sky-600', misc: 'border-noir-600',
};

export function Chronicle({ s }: { s: GameState }) {
  const entries = [...s.chronicle].reverse().slice(0, 150);
  return (
    <ul className="space-y-1.5">
      {entries.map((e, i) => (
        <li key={i} className={`border-l-2 pl-2 text-sm ${KIND_COLOR[e.kind] ?? 'border-noir-600'}`}>
          <div className="text-[10px] uppercase tracking-widest text-stone-600">{formatDate(e.date)} · wk {e.week}</div>
          <div className="text-stone-300">{e.text}</div>
          {e.because && <div className="text-xs text-amber-400/90 italic">because you {e.because} (week {e.becauseWeek})</div>}
        </li>
      ))}
    </ul>
  );
}
