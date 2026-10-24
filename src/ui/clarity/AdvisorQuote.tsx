import { advisorAdvice } from '../../engine/advisors';
import type { Ranking } from '../../engine/candidates';
import type { GameState } from '../../engine/types';
import { signed } from '../format';
import { Face } from '../components/People';
import { Tip } from './Tip';

/**
 * The consigliere's and the underboss's one-line advice on a pick, in
 * character. Their opinion of the man they back is shown, and a partial
 * advisor is flagged — advice is not automatically trustworthy.
 */
export function AdvisorQuotes({ s, ranking }: { s: GameState; ranking: Ranking }) {
  const list = advisorAdvice(s, ranking);
  if (!list.length) return null;
  return (
    <div className="space-y-1.5" data-testid="advisor-quotes">
      {list.map((a) => {
        const adv = s.characters[a.advisorId];
        return (
          <div key={a.seat} className={`flex items-start gap-2 rounded border px-2 py-1.5 ${a.biased ? 'border-amber-700/60 bg-amber-900/10' : 'border-noir-700 bg-noir-800/50'}`} data-testid="advisor-quote">
            {adv && <Face s={s} c={adv} size={32} />}
            <div className="min-w-0 text-[12px] leading-snug">
              <div className="font-display italic text-stone-100">{a.quote}</div>
              <div className="text-[11px] text-stone-500">
                — {a.advisorName}, {a.seat}
                {a.pickId !== s.playerId && a.tie !== 'himself' && (
                  <> · <Tip term="opinion"><span>thinks <span className={a.opinionOfPick >= 25 ? 'text-emerald-300' : a.opinionOfPick <= -25 ? 'text-red-300' : 'text-stone-300'}>{signed(a.opinionOfPick)}</span> of {a.pickName.split(' (')[0]}</span></Tip></>
                )}
                {a.tie && <span className="text-amber-300"> · {a.tie === 'himself' ? 'he backs himself' : a.tie}</span>}
              </div>
              {a.biased && <div className="text-[11px] text-amber-300">Not the pick the numbers favour — he may have his own reasons.</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
