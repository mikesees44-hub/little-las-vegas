import { TIER_BANNER, type NowResult } from '../../engine/deeds/now';

/**
 * ONE RESULT PATTERN (STREAMLINE §4.3): what an order or a decision came to,
 * the moment it is settled.
 *   banner by tier   Better than hoped · Success · Failure · Disaster
 *   the roll         "Needed 62 or less. Rolled 48." (the odds were real)
 *   what changed     chips
 *   He'll remember   the memory written to his mind, and his opinion's move
 *   what follows     what it may lead to
 */
const TONE: Record<string, string> = { crit: 'text-emerald-300', success: 'text-emerald-400', fail: 'text-amber-300', critFail: 'text-red-400' };
const BORDER: Record<string, string> = { crit: 'border-emerald-500/70', success: 'border-emerald-600/60', fail: 'border-amber-600/60', critFail: 'border-red-600/70' };
const BANNER_BG: Record<string, string> = { crit: 'bg-emerald-700/30', success: 'bg-emerald-800/25', fail: 'bg-amber-800/25', critFail: 'bg-red-900/40' };

/** The roll in words, consistent with the outcome: a win shows a roll at or under the need, a miss over it. */
export function rollLine(chance: number, roll01: number, won: boolean): { need: number; roll: number; text: string } {
  const need = Math.max(0, Math.min(100, Math.round(chance * 100)));
  let roll = Math.max(1, Math.min(100, roll01 + 1));
  if (won && roll > need) roll = Math.max(1, need);
  if (!won && roll <= need) roll = Math.min(100, need + 1);
  return { need, roll, text: `Needed ${need} or less. Rolled ${roll}.` };
}

const won = (tier: string) => tier === 'crit' || tier === 'success';

export function ResultCard({ r, onClose, onFile }: { r: NowResult; onClose: () => void; onFile?: () => void }) {
  const pct = r.chance !== undefined ? Math.round(r.chance * 100) : undefined;
  const roll = pct !== undefined && r.roll !== undefined ? rollLine(r.chance!, r.roll, won(r.tier)) : undefined;
  return (
    <div className={`panel w-full max-w-md overflow-hidden border-2 bg-noir-900 ${BORDER[r.tier] ?? 'border-gold-600/60'} shadow-2xl shadow-black/80`} role="dialog" aria-label={r.title} data-testid="now-result" onClick={(e) => e.stopPropagation()}>
      <div className={`px-4 py-2 ${BANNER_BG[r.tier] ?? ''}`} data-testid="result-banner">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-400">{r.title}{r.who ? ` · ${r.who}` : ''} · done now</div>
        <div className={`font-display text-2xl ${TONE[r.tier] ?? 'text-gold-300'}`} data-testid="now-headline">{pct !== undefined ? TIER_BANNER[r.tier] : r.headline}</div>
        {pct !== undefined && <div className="text-[12px] text-stone-300">{r.headline}</div>}
      </div>
      <div className="p-4 pt-2">
        {roll && (
          <div className="mt-1" title={`The roll: ${roll.roll} against ${roll.need}`} data-testid="result-roll">
            <div className="text-[12px] font-semibold text-stone-200">{roll.text}</div>
            <div className="relative mt-1 h-2.5 overflow-hidden rounded bg-red-900/50">
              <div className="h-full bg-emerald-600/70" style={{ width: `${roll.need}%` }} />
              <div className="absolute top-[-2px] h-[14px] w-[3px] bg-stone-100" style={{ left: `calc(${Math.min(99, roll.roll)}% - 1px)` }} />
            </div>
          </div>
        )}
        {r.line && <p className="mt-2 text-sm text-stone-200">{r.line}</p>}
        {r.changes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1" data-testid="result-chips">
            {r.changes.map((c, i) => <span key={i} className={/[−-]\$?\d|grievance|Evidence|spent|took offense/i.test(c) && !/fear/i.test(c) ? 'chip-bad' : /\+/.test(c) || /owes you|A hook/.test(c) ? 'chip-good' : 'chip-neutral'}>{c}</span>)}
          </div>
        )}
        {(r.remember || r.opinionDelta) && (
          <div className="mt-2 rounded border border-noir-700 bg-noir-800/60 px-2 py-1.5 text-[12px]" data-testid="result-remember">
            <span className="font-semibold text-gold-300">He'll remember this.</span>
            {r.remember && <span className="italic text-stone-300"> "{r.remember}"</span>}
            {r.opinionDelta ? <span className={r.opinionDelta > 0 ? 'text-emerald-400' : 'text-red-400'}> · opinion {r.opinionDelta > 0 ? '+' : '−'}{Math.abs(r.opinionDelta)}</span> : null}
          </div>
        )}
        {r.leadsTo.length > 0 && (
          <div className="mt-2" data-testid="result-follow">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">What follows</div>
            <ul className="text-xs text-amber-200/90">{r.leadsTo.map((c, i) => <li key={i}>· {c}</li>)}</ul>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          {onFile && <button type="button" className="btn-secondary text-xs" onClick={onFile} data-testid="result-file">In Your File ▸</button>}
          <button type="button" className="btn-primary ml-auto text-sm" onClick={onClose} data-testid="now-close">Go on</button>
        </div>
      </div>
    </div>
  );
}
