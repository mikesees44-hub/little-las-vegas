import { formatDate, seasonInfo } from '../../engine/calendar';
import { displayName, player } from '../../engine/characters';
import { heatBand } from '../../engine/heat';
import { HEAT_BARS, type GameState } from '../../engine/types';
import { fmt$ } from '../format';

const BAND_COLOR = { cold: 'bg-sky-700', warm: 'bg-amber-600', hot: 'bg-orange-600', boiling: 'bg-blood-400' } as const;

export function Header({ s }: { s: GameState }) {
  const info = seasonInfo(s.date);
  const boss = player(s);
  return (
    <header className="panel p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl text-gold-400 leading-tight">Little Las Vegas</h1>
          <p className="text-xs text-stone-400 truncate">
            House of {s.houseName} · {displayName(boss)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-stone-300">{formatDate(s.date)} · Week {s.week}</div>
          <div className={`text-xs font-semibold ${info.inSeason ? 'text-gold-300' : 'text-sky-300'}`}>
            {info.label} ×{info.multiplier} · {info.countdownLabel}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="Treasury" value={fmt$(s.money)} tone={s.money < 0 ? 'text-red-400' : 'text-gold-300'} />
        <Stat label="Respect" value={`${s.respect}`} tone="text-stone-100" bar={s.respect} barColor="bg-gold-500" />
        {HEAT_BARS.map((b) => (
          <Stat key={b} label={`${b[0].toUpperCase()}${b.slice(1)} heat`} value={`${s.heat[b]}`} tone={s.heat[b] >= 80 ? 'text-red-400' : 'text-stone-100'} bar={s.heat[b]} barColor={BAND_COLOR[heatBand(s.heat[b])]} />
        ))}
      </div>
    </header>
  );
}

function Stat({ label, value, tone, bar, barColor }: { label: string; value: string; tone: string; bar?: number; barColor?: string }) {
  return (
    <div className="rounded-md bg-noir-800 border border-noir-700 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
      {bar !== undefined && (
        <div className="mt-1 h-1 rounded bg-noir-700 overflow-hidden">
          <div className={`h-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
    </div>
  );
}
