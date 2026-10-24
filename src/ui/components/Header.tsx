import type { ReactNode } from 'react';
import { formatDate, seasonInfo } from '../../engine/calendar';
import { displayName, player } from '../../engine/characters';
import { heatBand } from '../../engine/heat';
import { HEAT_BARS, type GameState } from '../../engine/types';
import { fmt$ } from '../format';

const BAND_COLOR = { cold: 'bg-sky-700', warm: 'bg-amber-600', hot: 'bg-orange-600', boiling: 'bg-blood-400' } as const;

/** The CK-style top bar: house, resources, date and season, and the clock controls. */
export function Header({ s, children }: { s: GameState; children?: ReactNode }) {
  const info = seasonInfo(s.date);
  const boss = player(s);
  return (
    <header className="panel px-3 py-2 sticky top-0 z-30">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 mr-auto">
          <h1 className="font-display text-xl text-gold-400 leading-none">Little Las Vegas</h1>
          <p className="text-[11px] text-stone-400 truncate">House of {s.houseName} · {displayName(boss)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Res label="Treasury" value={fmt$(s.money)} tone={s.money < 0 ? 'text-red-400' : 'text-gold-300'} title={`Unwashed: ${fmt$(s.unwashed)}`} />
          <Res label="Respect" value={`${s.respect}`} bar={s.respect} barColor="bg-gold-500" />
          {HEAT_BARS.map((b) => (
            <Res key={b} label={`${b[0].toUpperCase()}${b.slice(1)} heat`} value={`${s.heat[b]}`} tone={s.heat[b] >= 80 ? 'text-red-400' : 'text-stone-100'} bar={s.heat[b]} barColor={BAND_COLOR[heatBand(s.heat[b])]} />
          ))}
          <Res label="Favors" value={`${s.favors}`} title="Political favors you can call in" />
        </div>
        <div className="text-right">
          <div className="text-xs text-stone-300 whitespace-nowrap">{formatDate(s.date)} · Wk {s.week}</div>
          <div className={`text-[11px] font-semibold whitespace-nowrap ${info.inSeason ? 'text-gold-300' : 'text-sky-300'}`}>{info.label} ×{info.multiplier} · {info.countdownLabel}</div>
        </div>
      </div>
      {children && <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-noir-700 pt-2">{children}</div>}
    </header>
  );
}

function Res({ label, value, tone, bar, barColor, title }: { label: string; value: string; tone?: string; bar?: number; barColor?: string; title?: string }) {
  return (
    <div className="rounded bg-noir-800 border border-noir-700 px-2 py-0.5 min-w-[64px]" title={title}>
      <div className="text-[9px] uppercase tracking-widest text-stone-500 leading-tight">{label}</div>
      <div className={`text-sm font-semibold tabular-nums leading-tight ${tone ?? 'text-stone-100'}`}>{value}</div>
      {bar !== undefined && (
        <div className="mt-0.5 h-0.5 rounded bg-noir-700 overflow-hidden">
          <div className={`h-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
    </div>
  );
}
