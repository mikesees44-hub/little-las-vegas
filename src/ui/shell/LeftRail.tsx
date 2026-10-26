import { HOMES, type HomeDef } from './nav';
import type { HomeId } from './routes';

const glyph = (g: string) => <span aria-hidden style={{ fontVariantEmoji: 'text' } as never}>{g}&#xFE0E;</span>;

function RailButton({ h, active, badge, dot, onClick, compact }: { h: HomeDef; active: boolean; badge?: number; dot?: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} data-tab={h.id} data-testid={`rail-${h.id}`} aria-pressed={active}
      title={`${h.label} (${h.key.toUpperCase()}) — ${h.blurb}`} aria-label={h.label}
      className={`group relative flex flex-col items-center justify-center rounded-md ${compact ? 'h-12 flex-1 min-w-0' : 'h-14 w-[60px]'} border text-[10px] leading-tight transition-colors ${active ? 'border-gold-500 bg-gold-500/15 text-gold-300' : 'border-transparent text-stone-400 hover:border-noir-600 hover:text-gold-300'}`}>
      <span className="text-lg leading-none">{glyph(h.icon)}</span>
      <span className="mt-0.5 truncate max-w-full px-0.5">{h.short}</span>
      {!!badge && <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-blood-500 px-1 text-[9px] font-bold text-white">{badge}</span>}
      {dot && !badge && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold-400 animate-pulse" aria-label="new" />}
      {!compact && (
        <span className="pointer-events-none absolute left-full top-1/2 z-[1200] ml-2 hidden w-56 -translate-y-1/2 rounded border border-gold-600/50 bg-noir-950/95 px-2 py-1.5 text-left text-[11px] text-stone-300 shadow-lg group-hover:block">
          <span className="block font-semibold text-gold-300">{h.label} <span className="text-stone-500 font-normal">· {h.key.toUpperCase()}</span></span>{h.blurb}
        </span>
      )}
    </button>
  );
}

/**
 * The six homes (nav.ts): a left rail on desktop, a bottom tab bar on
 * phones. Red badges count what needs the boss there; a gold dot means
 * something new opened up.
 */
export function LeftRail({ active, badges, dots, onOpen, onHelp }: {
  active?: HomeId;
  badges: Partial<Record<HomeId, number>>;
  dots: Set<HomeId>;
  onOpen: (h: HomeId) => void;
  onHelp: () => void;
}) {
  return (
    <>
      <nav className="hidden md:flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-noir-700 bg-noir-900/90 py-2" data-testid="rail" aria-label="The game's places">
        {HOMES.map((h) => <RailButton key={h.id} h={h} active={active === h.id} badge={badges[h.id]} dot={dots.has(h.id)} onClick={() => onOpen(h.id)} />)}
        <button type="button" onClick={onHelp} data-testid="rail-help" title="Help: what should I do, the glossary, the keyboard (?)" className="mt-auto flex h-12 w-14 flex-col items-center justify-center rounded-md text-[10px] text-stone-400 hover:text-gold-300">
          <span className="text-lg leading-none">?</span>Help
        </button>
      </nav>
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-[1160] flex gap-0.5 border-t border-noir-700 bg-noir-900/95 px-1 pb-[env(safe-area-inset-bottom)] pt-0.5" data-testid="rail-phone" aria-label="The game's places">
        {HOMES.map((h) => <RailButton key={h.id} compact h={h} active={active === h.id} badge={badges[h.id]} dot={dots.has(h.id)} onClick={() => onOpen(h.id)} />)}
      </nav>
    </>
  );
}
