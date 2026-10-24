import { opinion } from '../../engine/relations';
import { createContext, useContext, type ReactNode } from 'react';
import { displayName, TRAIT_INFO } from '../../engine/characters';
import type { Character, FactionId, GameState, Trait } from '../../engine/types';
import { Portrait } from '../portrait/Portrait';

/** Opening a character sheet from anywhere. */
export const SheetContext = createContext<{ open: (id: string) => void }>({ open: () => {} });
export function useSheet() {
  return useContext(SheetContext);
}

export const FACTION_TINT: Record<FactionId, string> = {
  player: '#5a4620', manno: '#5a1f1a', feldstein: '#262f5a', kessler: '#1f4a32', philly: '#3f2350', law: '#1f3a52', none: '#2e2a26',
};

/** A name you can click to open the person's sheet. */
export function CharLink({ s, id, children, className }: { s: GameState; id?: string; children?: ReactNode; className?: string }) {
  const { open } = useSheet();
  const c = id ? s.characters[id] : undefined;
  if (!c) return <span className={className}>{children ?? '—'}</span>;
  return (
    <button type="button" className={`underline decoration-dotted decoration-stone-600 underline-offset-2 hover:text-gold-300 text-left ${className ?? ''}`} onClick={(e) => { e.stopPropagation(); open(c.id); }}>
      {children ?? displayName(c)}
    </button>
  );
}

/** A clickable portrait. */
export function Face({ s, c, size = 48, className }: { s: GameState; c: Character; size?: number; className?: string }) {
  const { open } = useSheet();
  return (
    <button type="button" className={`shrink-0 rounded-md hover:ring-2 hover:ring-gold-400 ${className ?? ''}`} onClick={(e) => { e.stopPropagation(); open(c.id); }} title={displayName(c)}>
      <Portrait c={c} seed={s.seed} date={s.date} size={size} tint={FACTION_TINT[c.faction]} opinion={c.alive && c.faction === 'player' && c.id !== s.playerId ? opinion(s, c.id, s.playerId) : undefined} />
    </button>
  );
}

/** Trait icons: a glyph on a coloured disc, the meaning on hover. */
export const TRAIT_ICON: Partial<Record<Trait, { g: string; tone: 'good' | 'bad' | 'mixed' }>> = {
  Greedy: { g: '$', tone: 'bad' },
  'Hot-headed': { g: '!', tone: 'bad' },
  Patient: { g: '∞', tone: 'good' },
  Ambitious: { g: '▲', tone: 'mixed' },
  'Loyal-to-a-fault': { g: '♥', tone: 'good' },
  Paranoid: { g: '◉', tone: 'mixed' },
  Pious: { g: '✝', tone: 'good' },
  Womanizer: { g: '♡', tone: 'bad' },
  Gambler: { g: '♠', tone: 'bad' },
  Honest: { g: '✓', tone: 'good' },
  Cruel: { g: '✖', tone: 'bad' },
  Cowardly: { g: '~', tone: 'bad' },
  Charming: { g: '✧', tone: 'good' },
  Vengeful: { g: '†', tone: 'mixed' },
  Drinker: { g: '¶', tone: 'bad' },
};

const TONE_CLASS = { good: 'bg-emerald-900/70 text-emerald-200 border-emerald-700/70', bad: 'bg-blood-500/30 text-red-200 border-blood-500/60', mixed: 'bg-amber-900/50 text-amber-200 border-amber-700/60' };

export function TraitIcons({ c, labels }: { c: Character; labels?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {c.traits.map((t) => {
        const ic = TRAIT_ICON[t] ?? { g: t[0], tone: 'mixed' as const };
        return (
          <span key={t} title={`${t}: ${TRAIT_INFO[t] ?? ''}`} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none ${TONE_CLASS[ic.tone]}`}>
            <span className="font-bold w-3 text-center">{ic.g}</span>
            {labels && <span>{t}</span>}
          </span>
        );
      })}
    </div>
  );
}
