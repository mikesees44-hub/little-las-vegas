import { opinion } from '../../engine/relations';
import { createContext, useContext, type ReactNode } from 'react';
import { displayName, TRAIT_INFO } from '../../engine/characters';
import type { Character, FactionId, GameState, Trait } from '../../engine/types';
import { Portrait } from '../portrait/Portrait';
import { sideOf } from '../../engine/sides';
import { SideBadge } from './Side';

/** Opening a character sheet from anywhere. */
export const SheetContext = createContext<{ open: (id: string) => void; menu?: (id: string, category?: string, at?: { x: number; y: number }) => void }>({ open: () => {} });
export function useSheet() {
  return useContext(SheetContext);
}

export const FACTION_TINT: Record<FactionId, string> = {
  player: '#5a4620', manno: '#5a1f1a', feldstein: '#262f5a', kessler: '#1f4a32', philly: '#3f2350', law: '#1f3a52', none: '#2e2a26',
};

/** A name you can click to open the person's sheet. */
export function CharLink({ s, id, children, className }: { s: GameState; id?: string; children?: ReactNode; className?: string }) {
  const { open, menu } = useSheet();
  const c = id ? s.characters[id] : undefined;
  const lp = !c && id ? s.lineage?.people[id] : undefined;
  if (lp) {
    // Someone from the house trees (the dead, off-screen kin): their own sheet.
    return (
      <button type="button" className={`underline decoration-dotted decoration-stone-600 underline-offset-2 hover:text-gold-300 text-left ${className ?? ''}`} onClick={(e) => { e.stopPropagation(); open(lp.id); }}>
        {children ?? `${lp.first} ${lp.last}`}
      </button>
    );
  }
  if (!c) return <span className={className}>{children ?? '—'}</span>;
  return (
    <button type="button" className={`underline decoration-dotted decoration-stone-600 underline-offset-2 hover:text-gold-300 text-left ${className ?? ''}`} onClick={(e) => { e.stopPropagation(); open(c.id); }} onContextMenu={menu ? (e) => { e.preventDefault(); e.stopPropagation(); menu(c.id, undefined, { x: e.clientX, y: e.clientY }); } : undefined}>
      {children ?? displayName(c)}
    </button>
  );
}

/** The visible "Actions" handle on a portrait: everything you can do to him (right-click does the same). */
export function ActionsHandle({ c, size = 48 }: { c: Character; size?: number }) {
  const { menu } = useSheet();
  if (!menu || !c.alive) return null;
  return (
    <button type="button" aria-label={`Actions for ${displayName(c)}`} title="Actions" data-testid="portrait-actions"
      onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect?.(); menu(c.id, undefined, r ? { x: r.left, y: r.bottom + 4 } : undefined); }}
      className={`pointer-events-auto absolute -bottom-1 -right-1 z-[1] flex items-center justify-center rounded-full border border-gold-600/80 bg-noir-950/95 text-gold-300 shadow hover:bg-gold-500 hover:text-noir-950 ${size >= 40 ? 'h-5 min-w-5 px-1 text-[11px]' : 'h-4 min-w-4 px-0.5 text-[9px]'}`}>
      ⋯
    </button>
  );
}

/** A clickable portrait, with its Actions handle. */
export function Face({ s, c, size = 48, className, noSide }: { s: GameState; c: Character; size?: number; className?: string; noSide?: boolean }) {
  const { open, menu } = useSheet();
  const side = noSide ? undefined : sideOf(s, c.id);
  return (
    <span className={`relative inline-block shrink-0 ${className ?? ''}`} data-side={side?.kind}>
      <button type="button" className="shrink-0 rounded-md hover:ring-2 hover:ring-gold-400" style={side ? { outline: `2px solid ${side.color}`, outlineOffset: '-1px' } : undefined} onClick={(e) => { e.stopPropagation(); open(c.id); }} onContextMenu={menu ? (e) => { e.preventDefault(); e.stopPropagation(); menu(c.id, undefined, { x: e.clientX, y: e.clientY }); } : undefined} title={`${displayName(c)}${side ? ` (${side.full})` : ""} — ⋯ or right-click for everything you can do`}>
        <Portrait c={c} seed={s.seed} date={s.date} size={size} tint={FACTION_TINT[c.faction]} opinion={c.alive && c.faction === 'player' && c.id !== s.playerId ? opinion(s, c.id, s.playerId) : undefined} />
      </button>
      {side && size >= 28 && <SideBadge side={side} size={size} />}
      <ActionsHandle c={c} size={size} />
    </span>
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
