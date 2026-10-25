import { useEffect, useRef } from 'react';
import type { GameState } from '../../engine/types';
import { PANELS_BY_ID, sectionOf, type SectionCtx } from './panels';
import type { PanelId } from './routes';

/**
 * A panel drawer over the map (the map never unmounts). Section tabs on
 * top, the section below, Esc or × closes. 640px wide at most; on phones it
 * takes the whole map area.
 */
export function Drawer({ s, panel, section, sections, ctx, onSection, onClose, escEnabled, fresh }: {
  s: GameState;
  panel: PanelId;
  section?: string;
  /** The section ids to show (progressive disclosure). */
  sections: string[];
  ctx: SectionCtx;
  onSection: (id: string) => void;
  onClose: () => void;
  escEnabled: boolean;
  fresh?: Set<string>;
}) {
  const def = PANELS_BY_ID[panel];
  const list = def.sections.filter((x) => sections.includes(x.id));
  const cur = list.find((x) => x.id === section) ?? list[0] ?? sectionOf(panel, section);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!escEnabled) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [escEnabled, onClose]);
  useEffect(() => { body.current?.scrollTo?.({ top: 0 }); }, [panel, cur?.id]);
  if (!cur) return null;
  return (
    <section className={`absolute inset-y-0 left-0 z-[1100] flex w-full ${cur.wide ? 'md:w-[min(1080px,calc(100%-24px))]' : 'md:w-[min(640px,calc(100%-24px))]'} flex-col border-r border-gold-600/30 bg-noir-900/[0.97] shadow-2xl shadow-black/70 llv-slide-left`} data-testid={`drawer-${panel}`} aria-label={def.label}>
      <header className="flex items-center gap-2 border-b border-noir-700 px-3 pt-2">
        <span className="text-lg text-gold-400" aria-hidden style={{ fontVariantEmoji: 'text' } as never}>{def.icon}&#xFE0E;</span>
        <h2 className="font-display text-xl text-gold-400 tracking-wide truncate">{panel === 'house' ? `The House of ${s.houseName}` : def.label}</h2>
        <button type="button" className="ml-auto h-8 w-8 rounded border border-noir-600 text-stone-300 hover:border-gold-500 hover:text-gold-300" onClick={onClose} aria-label="Close" data-testid="drawer-close">×</button>
      </header>
      <nav className="flex gap-0.5 overflow-x-auto border-b border-noir-700 px-2 tabbar" data-testid="subtabs" aria-label={`${def.label} sections`}>
        {list.map((x) => (
          <button key={x.id} type="button" data-tab={`${panel}.${x.id}`} data-testid={`section-tab-${x.id}`} onClick={() => onSection(x.id)}
            className={`relative tab text-xs px-2.5 py-2 ${cur.id === x.id ? 'tab-active' : ''}`}>
            {x.label}
            {fresh?.has(`${panel}.${x.id}`) && <span className="absolute right-0.5 top-1 h-1.5 w-1.5 rounded-full bg-gold-400" aria-label="new" />}
          </button>
        ))}
      </nav>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4" data-testid={`section-${cur.id}`}>
        {cur.blurb && <p className="mb-3 text-xs text-stone-500">{cur.blurb}</p>}
        {cur.render(s, ctx)}
      </div>
    </section>
  );
}
