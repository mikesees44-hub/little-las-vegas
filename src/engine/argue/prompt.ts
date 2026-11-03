import { displayName } from '../characters';
import { clean } from '../minds/talk';
import type { GameState } from '../types';
import type { Argument } from './types';

/**
 * OPTIONAL FLAVOR: Claude may reword the man's last line in the window
 * (through the page's `sample` capability, ui/minds/sampleClient.ts). Only
 * the words: the outcome, the odds and every effect are already decided in
 * code, and the reworded line is never saved into the game.
 */
export function flavorPrompt(s: GameState, A: Argument): { role: 'user'; content: string }[] | undefined {
  const last = [...A.log].reverse().find((l) => l.by === A.t);
  const c = s.characters[A.t];
  if (!last || !c) return undefined;
  const hist = A.log.slice(-5).map((l) => `${l.by === 'boss' ? 'Boss' : l.by ? s.characters[l.by]?.firstName ?? '?' : 'Narrator'}: ${l.t}`).join('\n');
  return [{
    role: 'user',
    content: `You polish one line of dialogue in "Little Las Vegas", a 1960 Wildwood, New Jersey mob-family game. Everyone is fictional; never quote films or real people; period Jersey Shore talk; adults only, nothing explicit; violence only implied. Keep the SAME meaning and the same decision (if he backs down, he backs down; if he walks out, he walks out). One or two sentences.
Character: ${displayName(c)}, ${c.traits.join(', ') || 'no strong traits'}; ${A.pos} right now.
So far:
${hist}
Rewrite only his last line: "${last.t}"
Reply with ONLY JSON: {"line": string}`,
  }];
}

export function validateFlavor(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = (raw as Record<string, unknown>).line;
  if (typeof v !== 'string') return undefined;
  const t = clean(v, 240);
  return t || undefined;
}
