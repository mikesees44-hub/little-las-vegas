import { displayName } from '../characters';
import { clean } from '../minds/talk';
import type { GameState } from '../types';
import { DEEDS } from './catalog';
import { TIER_LABEL, type DeedLog } from './types';

/**
 * THE VOICE (optional): when the page can ask Claude (the `sample`
 * capability), a deed's result line can be retold in the period voice. The
 * engine decided what happened; the voice only says it. Strict: one or two
 * sentences, no numbers (money and odds stay the engine's), only the names of
 * the people in it, nothing explicit, nothing that turns a failure into a
 * success. Anything else and the engine's own line stands.
 */

export const VOICE_MAX = 240;

const RULES = `You retell one moment in a 1960 Wildwood, New Jersey crime drama (fiction, all characters invented), in the clipped period voice of a crime novel.
Rules: answer with ONLY a JSON object {"line": "..."}. One or two sentences, at most 240 characters. Keep the outcome exactly as given (if it failed, it failed). No numbers or dollar amounts. Use only the names given. Violence only implied; nothing sexual or explicit. No modern words.`;

export function voicePrompt(s: GameState, l: DeedLog): { role: 'user'; content: string }[] {
  const a = s.characters[l.a];
  const t = s.characters[l.t];
  const def = DEEDS[l.id];
  const facts = [
    `Who: ${a ? displayName(a) : 'someone'} (${a?.traits.join(', ') || 'no notable traits'}) toward ${t ? (t.id === s.playerId ? `the boss, ${displayName(t)}` : displayName(t)) : 'someone'} (${t?.traits.join(', ') || 'no notable traits'}).`,
    `What: ${def?.text ?? l.id}`,
    `Outcome: ${TIER_LABEL[l.r]}.`,
    `The engine's line: "${l.x}"`,
  ].join('\n');
  return [{ role: 'user', content: `${RULES}\n\n${facts}` }];
}

const BAD = /\b(sex|naked|nude|rape|kill(ed)? him|blood everywhere|fuck|shit)\b/i;
const WIN = /\b(agreed|accepted|said yes|shook on it|took the envelope|paid)\b/i;

/** The voiced line, if it passes; else undefined (the engine's line stands). */
export function checkVoice(s: GameState, l: DeedLog, raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const line = clean(String((raw as Record<string, unknown>).line ?? ''), VOICE_MAX + 20);
  if (!line || line.length > VOICE_MAX) return undefined;
  if (/\d|\$/.test(line)) return undefined;
  if (BAD.test(line)) return undefined;
  if ((l.r === 'fail' || l.r === 'critFail') && WIN.test(line) && !WIN.test(l.x)) return undefined;
  // Only the names of the people in it (any other character's full name is out).
  const ok = new Set([l.a, l.t]);
  for (const c of Object.values(s.characters)) {
    if (ok.has(c.id) || !c.lastName || c.lastName.length < 4) continue;
    if (line.includes(`${c.firstName} ${c.lastName}`)) return undefined;
  }
  return line;
}
