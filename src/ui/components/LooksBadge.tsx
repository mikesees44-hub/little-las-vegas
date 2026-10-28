import { looksRating, type RatingTone } from '../../engine/rating';
import type { GameState } from '../../engine/types';

/**
 * HOT OR NOT at a glance (engine/rating.ts): a 1-10 rating, the plain word
 * and stars, color-coded; with "to you" when the boss's own eye differs.
 * Adults only: renders nothing for a minor.
 */

const TONE: Record<RatingTone, string> = {
  low: 'border-stone-600 text-stone-400',
  mid: 'border-stone-500 text-stone-200',
  good: 'border-sky-400/60 text-sky-200',
  hot: 'border-rose-400/70 text-rose-200',
  top: 'border-gold-400 text-gold-200 bg-gold-500/10',
};

export function LooksBadge({ s, id, compact }: { s: GameState; id: string; compact?: boolean }) {
  const c = s.characters[id];
  const r = c ? looksRating(s, c) : undefined;
  if (!r) return null;
  const stars = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
  const differs = r.toYou !== undefined && r.toYou !== r.score;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid="looks-badge" data-score={r.score} data-word={r.word}>
      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${TONE[r.tone]}`} title={`Looks: ${r.score} of 10, as people generally see ${c!.gender === 'F' ? 'her' : 'him'}`}>
        {r.word} {r.score}/10{!compact && <span className="ml-1 tracking-tighter opacity-80">{stars}</span>}
      </span>
      {differs && <span className="rounded border border-noir-600 px-1 py-0.5 text-[10px] text-stone-300" data-testid="looks-to-you" title="How attractive you find them (your own eye)">To you: {r.toYouWord} {r.toYou}/10</span>}
    </span>
  );
}
