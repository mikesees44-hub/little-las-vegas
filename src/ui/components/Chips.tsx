import { describeEffect } from '../../engine/effects';
import { effectHelp } from '../../engine/glossary';
import type { Effect, GameState } from '../../engine/types';
import { effectTone } from '../format';

/** "−$2,000 Bribe: Sgt. Healy" — the effect, then the name of what caused it. */
export function chipText(s: GameState, e: Effect): string | undefined {
  const d = describeEffect(s, e);
  if (!d) return undefined;
  if (!e.label) return d;
  // Don't repeat the name if the description already says it.
  const tail = e.label.includes(': ') ? e.label.slice(e.label.indexOf(': ') + 2) : e.label;
  return d.includes(e.label) || d.includes(tail) ? d : `${d} ${e.label}`;
}

export function Chips({ s, effects, named = true }: { s: GameState; effects: readonly Effect[]; named?: boolean }) {
  const chips = effects
    .map((e) => ({ text: named ? chipText(s, e) : describeEffect(s, e), tone: effectTone(s, e), help: effectHelp(e) }))
    .filter((x): x is { text: string; tone: 'good' | 'bad' | 'neutral'; help: string | undefined } => !!x.text);
  if (!chips.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {chips.map((ch, i) => (
        <span key={i} className={ch.tone === 'good' ? 'chip-good' : ch.tone === 'bad' ? 'chip-bad' : 'chip-neutral'} title={ch.help}>
          {ch.text}
        </span>
      ))}
    </div>
  );
}
