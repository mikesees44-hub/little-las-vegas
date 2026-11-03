import { useSheet } from '../components/People';

/** "⋯" on a list row: the person's interaction menu, opened at the category the list is about. */
export function MoreButton({ id, category, label = '⋯' }: { id: string; category?: string; label?: string }) {
  const { menu, open } = useSheet();
  return (
    <button type="button" data-testid="more-button" title="Everything you can do to him"
      className="shrink-0 rounded border border-noir-600 px-1.5 text-sm leading-5 text-stone-300 hover:border-gold-500 hover:text-gold-300"
      onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); if (menu) menu(id, category, { x: r.left, y: r.bottom + 4 }); else open(id); }}>
      {label}
    </button>
  );
}
