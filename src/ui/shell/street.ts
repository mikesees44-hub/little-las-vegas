import type { GameState } from '../../engine/types';
import type { MapFocus } from './context';

/** Word on the Street: the last few changes in the world (not your own doings). Pure. */
export interface StreetLine {
  key: string;
  week: number;
  glyph: string;
  text: string;
  charId?: string;
  focus?: Omit<MapFocus, 'nonce'>;
}

export function streetFeed(s: GameState, n = 6): StreetLine[] {
  const out: StreetLine[] = [];
  for (const r of s.rivals) {
    if (r.lastMove) out.push({ key: `r:${r.id}:${r.lastMove.week}`, week: r.lastMove.week, glyph: '♜', text: `${r.shortName}: ${r.lastMove.text}`, charId: r.leaderId, focus: { mode: 'rival', level: 'wildwood' } });
  }
  for (const res of s.pol?.results ?? []) {
    out.push({ key: `e:${res.id}`, week: res.week, glyph: '🗳', text: `${res.office}: ${res.headline}` });
  }
  s.chronicle.forEach((e, i) => {
    if (e.kind === 'rival' || e.kind === 'death' || e.kind === 'heat' || (e.kind === 'misc' && !e.because)) {
      out.push({ key: `c:${i}`, week: e.week, glyph: e.kind === 'death' ? '†' : e.kind === 'heat' ? '♨' : e.kind === 'rival' ? '♜' : '·', text: e.text, focus: e.kind === 'heat' ? { mode: 'heat', level: 'wildwood' } : undefined });
    }
  });
  const seen = new Set<string>();
  return out
    .filter((l) => (seen.has(l.text) ? false : (seen.add(l.text), true)))
    .sort((a, b) => b.week - a.week)
    .slice(0, n);
}
