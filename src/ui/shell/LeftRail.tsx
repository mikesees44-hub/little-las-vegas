import { useState } from 'react';
import { PANELS, type PanelDef } from './panels';
import type { PanelId } from './routes';

const glyph = (g: string) => <span aria-hidden style={{ fontVariantEmoji: 'text' } as never}>{g}&#xFE0E;</span>;

function RailButton({ p, active, badge, dot, onClick, compact }: { p: PanelDef; active: boolean; badge?: number; dot?: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} data-tab={p.id} data-testid={`rail-${p.id}`} aria-pressed={active}
      title={`${p.label} (${p.key.toUpperCase()}) — ${p.blurb}`}
      className={`group relative flex flex-col items-center justify-center rounded-md ${compact ? 'h-12 flex-1 min-w-0' : 'h-14 w-14'} border text-[10px] leading-tight transition-colors ${active ? 'border-gold-500 bg-gold-500/15 text-gold-300' : 'border-transparent text-stone-400 hover:border-noir-600 hover:text-gold-300'}`}>
      <span className="text-lg leading-none">{glyph(p.icon)}</span>
      <span className="mt-0.5 truncate max-w-full px-0.5">{p.short}</span>
      {!!badge && <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-blood-500 px-1 text-[9px] font-bold text-white">{badge}</span>}
      {dot && !badge && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold-400 animate-pulse" aria-label="new" />}
      {!compact && (
        <span className="pointer-events-none absolute left-full top-1/2 z-[1200] ml-2 hidden w-56 -translate-y-1/2 rounded border border-gold-600/50 bg-noir-950/95 px-2 py-1.5 text-left text-[11px] text-stone-300 shadow-lg group-hover:block">
          <span className="block font-semibold text-gold-300">{p.label} <span className="text-stone-500 font-normal">· {p.key.toUpperCase()}</span></span>{p.blurb}
        </span>
      )}
    </button>
  );
}

/**
 * The left rail: the seven panels and the feed, with badge counts and a
 * gold dot when something new opened up. On phones it is a bottom tab bar
 * of five plus "More".
 */
export function LeftRail({ visible, active, badges, dots, onOpen, onHelp }: {
  visible: PanelId[];
  active?: PanelId;
  badges: Partial<Record<PanelId, number>>;
  dots: Set<PanelId>;
  onOpen: (p: PanelId) => void;
  onHelp: () => void;
}) {
  const [more, setMore] = useState(false);
  const shown = PANELS.filter((p) => visible.includes(p.id));
  const main = shown.filter((p) => p.id !== 'chronicle');
  const feed = shown.find((p) => p.id === 'chronicle');
  const PHONE: PanelId[] = ['you', 'house', 'borgata', 'holdings', 'ops'];
  const phoneMain = shown.filter((p) => PHONE.includes(p.id)).slice(0, 5);
  const phoneMore = shown.filter((p) => !phoneMain.includes(p));
  const moreBadge = phoneMore.reduce((a, p) => a + (badges[p.id] ?? 0), 0);
  return (
    <>
      <nav className="hidden md:flex w-16 shrink-0 flex-col items-center gap-1 border-r border-noir-700 bg-noir-900/90 py-2" data-testid="rail" aria-label="Panels">
        {main.map((p) => <RailButton key={p.id} p={p} active={active === p.id} badge={badges[p.id]} dot={dots.has(p.id)} onClick={() => onOpen(p.id)} />)}
        <div className="my-1 h-px w-10 bg-noir-700" />
        {feed && <RailButton p={feed} active={active === 'chronicle'} badge={badges.chronicle} dot={dots.has('chronicle')} onClick={() => onOpen('chronicle')} />}
        <button type="button" onClick={onHelp} data-testid="rail-help" title="Help: what should I do, and the glossary" className="mt-auto flex h-12 w-14 flex-col items-center justify-center rounded-md text-[10px] text-stone-400 hover:text-gold-300">
          <span className="text-lg leading-none">?</span>Help
        </button>
      </nav>
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-[1160] flex gap-0.5 border-t border-noir-700 bg-noir-900/95 px-1 pb-[env(safe-area-inset-bottom)] pt-0.5" data-testid="rail-phone" aria-label="Panels">
        {phoneMain.map((p) => <RailButton key={p.id} compact p={p} active={active === p.id} badge={badges[p.id]} dot={dots.has(p.id)} onClick={() => onOpen(p.id)} />)}
        <button type="button" onClick={() => setMore((m) => !m)} data-testid="rail-more" aria-expanded={more}
          className={`relative flex h-12 flex-1 min-w-0 flex-col items-center justify-center rounded-md border text-[10px] ${more ? 'border-gold-500 text-gold-300' : 'border-transparent text-stone-400'}`}>
          <span className="text-lg leading-none">⋯</span>More
          {moreBadge > 0 && <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-blood-500 px-1 text-[9px] font-bold text-white">{moreBadge}</span>}
        </button>
      </nav>
      {more && (
        <div className="md:hidden fixed inset-0 z-[1170] bg-black/50" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-14 panel rounded-b-none p-2 grid grid-cols-3 gap-1.5" onClick={(e) => e.stopPropagation()} data-testid="rail-more-sheet">
            {phoneMore.map((p) => <RailButton key={p.id} compact p={p} active={active === p.id} badge={badges[p.id]} dot={dots.has(p.id)} onClick={() => { setMore(false); onOpen(p.id); }} />)}
            <button type="button" onClick={() => { setMore(false); onHelp(); }} className="flex h-12 flex-col items-center justify-center rounded-md text-[10px] text-stone-400"><span className="text-lg leading-none">?</span>Help</button>
          </div>
        </div>
      )}
    </>
  );
}
