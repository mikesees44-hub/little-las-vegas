import { RELATION_LABEL, RELATION_TONE, SIDE_FILTER_LABEL, sideOf, type Side, type SideFilter, type SideRelation } from '../../engine/sides';
import type { GameState } from '../../engine/types';

/**
 * Whose side he is on, drawn the same way everywhere: a chip with the emblem
 * shape and the family's name in its colour (never colour alone), a gold
 * "★ YOURS" for your own people, and the known double dealing beside it.
 */

export function SideChip({ s, id, side, full, className }: { s?: GameState; id?: string; side?: Side; full?: boolean; className?: string }) {
  const sd = side ?? (s && id ? sideOf(s, id) : undefined);
  if (!sd) return null;
  const text = full ? sd.label : sd.short;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap ${className ?? ''}`} data-testid="side-chip" data-side={sd.kind} data-faction={sd.factionId} title={sd.full + (sd.relation ? ` · ${RELATION_LABEL[sd.relation]}` : '')}>
      <span className="inline-flex items-center gap-0.5 rounded border px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wider"
        style={{ color: sd.color, borderColor: `${sd.color}aa`, background: `${sd.color}1f` }}>
        <span aria-hidden>{sd.emblem}</span>{text}
      </span>
      {sd.double && (
        <span className="inline-flex items-center gap-0.5 rounded border border-dashed px-1 py-px text-[9px] font-semibold leading-none" data-testid="side-double"
          style={{ color: sd.double.color, borderColor: `${sd.double.color}aa` }}>
          <span aria-hidden>{sd.double.emblem}</span>{sd.double.text}
        </span>
      )}
    </span>
  );
}

const TONE: Record<string, string> = {
  bad: 'border-blood-500/60 bg-blood-500/20 text-red-200',
  warn: 'border-amber-600/60 bg-amber-900/30 text-amber-200',
  good: 'border-emerald-700/60 bg-emerald-900/40 text-emerald-200',
  neutral: 'border-noir-600 bg-noir-800 text-stone-300',
};

/** "At war" / "Truce" / "At peace" next to another family's man. */
export function RelationChip({ relation, className }: { relation?: SideRelation; className?: string }) {
  if (!relation) return null;
  return <span className={`inline-flex items-center rounded border px-1 py-px text-[9px] font-semibold leading-none ${TONE[RELATION_TONE[relation]]} ${className ?? ''}`} data-testid="side-relation">{RELATION_LABEL[relation]}</span>;
}

/** The small crest on a portrait's corner: emblem shape on the side's colour. */
export function SideBadge({ side, size = 48 }: { side: Side; size?: number }) {
  const px = size >= 56 ? 18 : size >= 36 ? 15 : 12;
  return (
    <span aria-label={side.full} title={side.full} data-testid="side-badge" data-side={side.kind}
      className="pointer-events-none absolute -left-1 -top-1 z-[1] flex items-center justify-center rounded-full border font-bold leading-none shadow"
      style={{ width: px, height: px, fontSize: px * 0.62, color: '#141210', background: side.color, borderColor: side.double ? side.double.color : '#141210', borderStyle: side.double ? 'dashed' : 'solid', borderWidth: side.double ? 2 : 1 }}>
      {side.emblem}
    </span>
  );
}

/** Mine / Theirs / Everyone. */
export function SideFilterBar({ value, onChange, counts }: { value: SideFilter; onChange: (f: SideFilter) => void; counts?: Partial<Record<SideFilter, number>> }) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-noir-600 text-[11px]" role="group" aria-label="Whose people" data-testid="side-filter">
      {(['mine', 'theirs', 'all'] as SideFilter[]).map((f) => (
        <button key={f} type="button" onClick={() => onChange(f)} aria-pressed={value === f} data-filter={f}
          className={`px-2 py-0.5 ${value === f ? 'bg-gold-500/20 text-gold-200' : 'text-stone-400 hover:text-stone-200'}`}>
          {f === 'mine' && <span aria-hidden className="mr-0.5 text-gold-400">★</span>}{SIDE_FILTER_LABEL[f]}{counts?.[f] !== undefined ? ` ${counts[f]}` : ''}
        </button>
      ))}
    </div>
  );
}
