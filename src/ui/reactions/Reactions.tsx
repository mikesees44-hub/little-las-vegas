import { Portrait } from '../portrait/Portrait';
import { FACTION_TINT } from '../components/People';
import { SideChip } from '../components/Side';
import { useEscape } from '../keys';
import { Overlay } from '../components/Modal';
import { useShell } from '../shell/context';
import { predictChoice, rxName, smoothOptions, smoothOver, dismissReactions, nextReactions, ROLE_LABEL, type Reaction, type ReactionBatch, type SmoothHow } from '../../engine/reactions';
import type { Choice, EventInstance, GameState } from '../../engine/types';
import { opinion } from '../../engine/relations';
import { argueFromBatch, openArgument } from '../../engine/argue';

/**
 * "HOW THEY TOOK IT": the CK-style reaction window. One compact list per
 * decision (the 2-5 people who matter most): face, side chip, the opinion
 * change and the reason line, colour-coded (pleased / displeased / furious,
 * never by colour alone: the word is there too), and on the angry ones the
 * quick ways to smooth it over (a gift, a word, a favor).
 *
 * `<Reactions items=… />` is the list alone, for any card to embed (the
 * result card of a decision); `ReactionsHost` shows the waiting windows.
 */

const TONE: Record<Reaction['tone'], { text: string; border: string; word: string }> = {
  pleased: { text: 'text-emerald-300', border: 'border-emerald-700/60', word: 'Pleased' },
  displeased: { text: 'text-amber-300', border: 'border-amber-700/60', word: 'Displeased' },
  furious: { text: 'text-red-400', border: 'border-red-700/70', word: 'Furious' },
};

const sgn = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

export interface ReactionsProps {
  s: GameState;
  items: readonly Reaction[];
  /** Offer the smooth-it-over buttons (needs a batch id and a way to change the game). */
  onSmooth?: (who: string, how: SmoothHow) => void;
  compact?: boolean;
  /** The one man the boss can have it out with, face to face (the argument window), and how to open it. */
  argueWho?: string;
  onArgue?: () => void;
}

/** The list of reactions (embeddable). */
export function Reactions({ s, items, onSmooth, compact, argueWho, onArgue }: ReactionsProps) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5" data-testid="reactions">
      {items.map((r) => {
        const c = s.characters[r.who];
        const t = TONE[r.tone];
        const opts = onSmooth ? smoothOptions(s, r) : [];
        return (
          <li key={r.who} className={`rounded-md border ${t.border} bg-noir-900/60 px-2 py-1.5`} data-testid="reaction" data-tone={r.tone}>
            <div className="flex items-center gap-2">
              {c && !compact && <Portrait c={c} seed={s.seed} date={s.date} size={40} tint={FACTION_TINT[c.faction]} opinion={r.v * 3} />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-stone-100">{rxName(s, r)}{r.role === 'family' || r.role === 'philly' ? '' : c ? ` ${c.lastName}` : ''}</span>
                  <SideChip s={s} id={r.who} />
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">{ROLE_LABEL[r.role]}</span>
                </div>
                <div className="text-xs text-stone-300">
                  <span className={`font-bold tabular-nums ${t.text}`} data-testid="reaction-value">{r.v ? sgn(r.v) : ''}</span>{' '}
                  <span className={`text-[10px] uppercase ${t.text}`}>{t.word}</span>{' '}
                  “{r.why || 'Watched, and took note'}”{r.trait ? <span className="text-stone-500"> ({r.trait})</span> : null}
                  {r.fear ? <span className="text-sky-300"> · fear +{r.fear}</span> : null}
                </div>
                {r.next && <div className="text-[11px] text-amber-200/90">→ {r.next}</div>}
                {r.smoothed && <div className="text-[11px] text-emerald-300">Smoothed over — {r.smoothed}</div>}
                {onArgue && argueWho === r.who && (
                  <button type="button" className="btn-quiet mt-0.5 text-[11px] text-red-200" onClick={onArgue} data-testid="argue-open">
                    Have it out with {c?.firstName ?? 'him'}, face to face ▸
                  </button>
                )}
              </div>
            </div>
            {opts.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1" data-testid="smooth-over">
                <span className="self-center text-[10px] uppercase tracking-wider text-stone-500">Smooth it over:</span>
                {opts.map((o) => (
                  <button key={o.how} type="button" className="btn-ghost px-1.5 py-0.5 text-[11px]" disabled={!!o.blocked} title={o.blocked ?? o.label}
                    onClick={() => onSmooth!(r.who, o.how)} data-testid={`smooth-${o.how}`}>
                    {o.how === 'gift' ? `Gift $${o.cost.toLocaleString('en-US')}` : o.how === 'word' ? 'A word' : 'A favor'} (+{o.back})
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One window. */
export function ReactionsWindow({ s, b, onSmooth, onClose, onArgue }: { s: GameState; b: ReactionBatch; onSmooth?: (who: string, how: SmoothHow) => void; onClose: () => void; onArgue?: (spec: NonNullable<ReturnType<typeof argueFromBatch>>) => void }) {
  const offer = onArgue ? argueFromBatch(s, b) : undefined;
  const worst = b.items.some((r) => r.tone === 'furious') ? 'border-red-700/70' : b.items.some((r) => r.v < 0) ? 'border-amber-700/60' : 'border-emerald-700/60';
  return (
    <div className={`panel w-full max-w-md border-2 ${worst} p-4 shadow-2xl shadow-black/80`} role="dialog" aria-label="How they took it" data-testid="reactions-window" onClick={(e) => e.stopPropagation()}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">How they took it</div>
      <div className="mt-0.5 font-display text-lg text-gold-300">{b.title}</div>
      <div className="mt-2 max-h-[60vh] overflow-y-auto pr-1">
        <Reactions s={s} items={b.items} onSmooth={onSmooth} argueWho={offer?.t} onArgue={offer ? () => onArgue!(offer) : undefined} />
      </div>
      {b.more > 0 && <div className="mt-1 text-[11px] text-stone-500">…and {b.more} more took note (in the week's summary).</div>}
      <button type="button" className="btn-gold mt-3 w-full text-sm" onClick={onClose} data-testid="reactions-close">Go on</button>
    </div>
  );
}

/** Shows the waiting windows, one at a time, over the game. */
export function ReactionsHost({ s, blocked }: { s: GameState; blocked?: boolean }) {
  const shell = useShell();
  const b = nextReactions(s);
  const close = () => b && shell.update?.((x) => dismissReactions(x, b.id));
  useEscape(!!b && !blocked, close);
  if (!b || blocked || !shell.update) return null;
  return (
    // On the one overlay stack (Modal.tsx): it opens above whatever is already up, never underneath it.
    <Overlay z={1150} className="flex items-center justify-center bg-black/60 p-3" onClick={close} data-testid="reactions-host">
      <ReactionsWindow s={s} b={b} onClose={close} onSmooth={(who, how) => shell.update!((x) => smoothOver(x, b.id, who, how))}
        onArgue={(spec) => shell.update!((x) => openArgument(dismissReactions(x, b.id), spec))} />
    </Overlay>
  );
}

/**
 * What an option would stir up, before the boss picks it ("Declining: Sal −15
 * furious (Hot-headed); Philadelphia +5"): for a decision card to put under
 * each choice.
 */
export function PredictedReactions({ s, ev, ch, max = 3 }: { s: GameState; ev: EventInstance; ch: Choice; max?: number }) {
  const list = predictChoice(s, ev, ch).slice(0, max);
  // Loyalty that moves (GODFATHER §C): the choice's own opinion changes toward you count too, with where his meter lands.
  const shown = new Set(list.map((r) => r.who));
  const direct: { who: string; v: number }[] = [];
  for (const e of ch.effects) {
    if (e.type !== 'opinion' || e.to !== s.playerId || shown.has(e.from) || !s.characters[e.from]) continue;
    const d = direct.find((x) => x.who === e.from);
    if (d) d.v += e.amount;
    else direct.push({ who: e.from, v: e.amount });
  }
  const extra = direct.filter((x) => x.v).slice(0, Math.max(0, max - list.length + 1));
  if (!list.length && !extra.length) return null;
  const lands = (who: string, v: number) => {
    const c = s.characters[who];
    if (!c || !v) return '';
    const cur = opinion(s, who, s.playerId);
    return ` (${cur > 0 ? '+' : ''}${cur} → ${Math.max(-100, Math.min(100, cur + v)) > 0 ? '+' : ''}${Math.max(-100, Math.min(100, cur + v))})`;
  };
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]" data-testid="predicted-reactions">
      {list.map((r) => (
        <span key={r.who} className={TONE[r.tone].text}>
          {rxName(s, r)} {r.v ? sgn(r.v) : `fear +${r.fear}`}{r.tone === 'furious' ? ', furious' : ''}{r.trait && r.v < 0 ? ` (${r.trait})` : ''}<span className="text-stone-500">{lands(r.who, r.v)}</span>
        </span>
      ))}
      {extra.map((x) => (
        <span key={x.who} className={x.v > 0 ? 'text-emerald-300' : 'text-red-300'} data-testid="predicted-loyalty">
          {s.characters[x.who]!.firstName} {sgn(x.v)}<span className="text-stone-500">{lands(x.who, x.v)}</span>
        </span>
      ))}
    </div>
  );
}
