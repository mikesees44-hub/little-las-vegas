import { useState } from 'react';
import { HOMES, type HomeDef } from './nav';
import type { HomeId } from './routes';
import { domClass, HOME_DOMAIN } from '../domain';

const glyph = (g: string) => <span aria-hidden style={{ fontVariantEmoji: 'text' } as never}>{g}&#xFE0E;</span>;

/**
 * When the rail's hover tip may show (playtest #11: it sat on top of the open panel's first lines and
 * stuck over the map after a click). Only with no panel open, after a short hover, and never right
 * after the button was clicked (until the pointer leaves it).
 */
export function railTipClass(panelOpen: boolean, clicked: boolean): string | undefined {
  if (panelOpen || clicked) return undefined;
  return 'invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity delay-500';
}

function RailButton({ h, active, badge, dot, onClick, compact, panelOpen, locked }: { h: HomeDef; active: boolean; badge?: number; dot?: boolean; onClick: () => void; compact?: boolean; panelOpen?: boolean; /** Why it is not open yet (greyed; it still opens). */ locked?: string }) {
  const [clicked, setClicked] = useState(false);
  const tip = compact ? undefined : railTipClass(!!panelOpen, clicked);
  return (
    <button type="button" onClick={() => { setClicked(true); onClick(); }} onMouseLeave={() => setClicked(false)} data-tab={h.id} data-testid={`rail-${h.id}`} aria-pressed={active}
      title={locked ? `${h.label}: ${locked}` : compact ? `${h.label} (${h.key.toUpperCase()}) — ${h.blurb}` : undefined} aria-label={h.label} data-locked={locked ? 'true' : undefined}
      className={`group relative flex flex-col items-center justify-center rounded-md ${compact ? 'h-12 flex-1 min-w-0' : 'h-14 w-[60px]'} border text-[10px] leading-tight transition-colors ${locked && !active ? 'opacity-45 ' : ''}${active ? 'border-gold-500 bg-gold-500/15 text-gold-300' : 'border-transparent text-stone-400 hover:border-noir-600 hover:text-gold-300'}`}>
      <span className={`text-lg leading-none ${HOME_DOMAIN[h.id] && !active ? `${domClass(HOME_DOMAIN[h.id])} llv-dom-ink` : ''}`}>{glyph(h.icon)}</span>
      {HOME_DOMAIN[h.id] && <span className={`${domClass(HOME_DOMAIN[h.id])} absolute bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-[rgb(var(--d))] ${active ? 'opacity-100' : 'opacity-60'}`} aria-hidden />}
      <span className="mt-0.5 truncate max-w-full px-0.5">{h.short}</span>
      {!!badge && <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-blood-500 px-1 text-[9px] font-bold text-white">{badge}</span>}
      {dot && !badge && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gold-400 animate-pulse" aria-label="new" />}
      {tip && (
        <span className={`pointer-events-none absolute left-full top-1/2 z-[1200] ml-2 w-56 -translate-y-1/2 rounded border border-gold-600/50 bg-noir-950/95 px-2 py-1.5 text-left text-[11px] text-stone-300 shadow-lg ${tip}`} data-testid="rail-tip">
          <span className="block font-semibold text-gold-300">{h.label} <span className="text-stone-500 font-normal">· {h.key.toUpperCase()}</span></span>{locked ? <span className="block text-amber-200">🔒 {locked}</span> : null}{h.blurb}
        </span>
      )}
    </button>
  );
}

/**
 * The seven homes (nav.ts): a left rail on desktop, a bottom tab bar on
 * phones (seven ~54px buttons at 390px; the short labels fit). Red badges count what needs the boss there; a gold dot means
 * something new opened up.
 */
export function LeftRail({ active, badges, dots, onOpen, locks = {} }: {
  active?: HomeId;
  /** Homes not open yet, and why (unlocks.ts homeLock). */
  locks?: Partial<Record<HomeId, string>>;
  badges: Partial<Record<HomeId, number>>;
  dots: Set<HomeId>;
  onOpen: (h: HomeId) => void;
  /** Help moved to the top bar's ☰ menu (the rail is the seven homes only); kept for callers. */
  onHelp?: () => void;
}) {
  return (
    <>
      <nav className="hidden md:flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-noir-700 bg-noir-900/90 py-2" data-testid="rail" aria-label="The game's places">
        {HOMES.map((h) => <RailButton key={h.id} h={h} active={active === h.id} badge={badges[h.id]} dot={dots.has(h.id)} onClick={() => onOpen(h.id)} panelOpen={!!active} locked={locks[h.id]} />)}
      </nav>
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-[1160] flex gap-0.5 border-t border-noir-700 bg-noir-900/95 px-1 pb-[env(safe-area-inset-bottom)] pt-0.5" data-testid="rail-phone" aria-label="The game's places">
        {HOMES.map((h) => <RailButton key={h.id} compact h={h} active={active === h.id} badge={badges[h.id]} dot={dots.has(h.id)} onClick={() => onOpen(h.id)} locked={locks[h.id]} />)}
      </nav>
    </>
  );
}
