import type { TravelMode } from '../../engine/travelState';

/** Small line icons per travel mode (SVG strings, so the map can use them too). */
export const MODE_SVG: Record<TravelMode, string> = {
  plane: '<path d="M2 13l8-2 4-8h2l-2 8 5 1 2-2h1.5l-1 3.5 1 3.5H21l-2-2-5 1 2 8h-2l-4-8-8-2z" />',
  train: '<path d="M6 3h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2zm1 3v5h10V6zm1 9a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2zM7 19l-2 3h2l2-3zm10 0l2 3h-2l-2-3z" />',
  bus: '<path d="M5 3h14a2 2 0 012 2v12a1 1 0 01-1 1h-1v2h-3v-2H8v2H5v-2H4a1 1 0 01-1-1V5a2 2 0 012-2zm0 3v5h14V6zm2 8a1 1 0 100 2 1 1 0 000-2zm10 0a1 1 0 100 2 1 1 0 000-2z" />',
  cars: '<path d="M5 11l2-5h10l2 5h1a1 1 0 011 1v5h-2v2h-3v-2H8v2H5v-2H3v-5a1 1 0 011-1zm3-3l-1 3h10l-1-3zm-1 6a1 1 0 100 2 1 1 0 000-2zm10 0a1 1 0 100 2 1 1 0 000-2z" />',
  ship: '<path d="M11 2h2v4h4v5l3 1-3 7H7l-3-7 3-1V6h4zm-2 6v2.3l3-1 3 1V8zM2 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1v2c-2 0-2 1-4 1s-2-1-4-1-2 1-4 1-2-1-4-1-2 1-4 1z" />',
};

export function ModeIcon({ mode, size = 16, className }: { mode: TravelMode; size?: number; className?: string }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor" aria-hidden dangerouslySetInnerHTML={{ __html: MODE_SVG[mode] }} />;
}
