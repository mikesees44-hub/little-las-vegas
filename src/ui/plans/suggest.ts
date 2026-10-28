import { previewAction, queuedMoney } from '../../engine/actions';
import { ABOUT_WORD, counsel, type Voice } from '../../engine/counsel';
import { briefing } from '../../engine/briefing';
import { opportunities } from '../../engine/opportunities';
import { hoursShort, timeCost } from '../../engine/timeCost';
import type { GameState, PlayerAction } from '../../engine/types';
import { sameOrder } from '../verbs';
import { goalOfAction, mainRisk, type GoalId } from './actionGoals';

/**
 * "WHAT SAL WOULD DO": the underboss's own read on what is worth doing right
 * now. Not the answer: HIS opinion. He weighs each order on the table the way
 * the table does (engine/counsel.ts): through his stance, his traits, his
 * interests and what he can see, so he can be wrong, and he can lean his own
 * way. The card says why he likes it, what worries him, what he can't see,
 * his knowable bias, and who at the table disagrees. The boss decides; each
 * pick is one order, given (with its own confirm) only if he clicks it.
 * No badges, no "do them all".
 *
 * Pure and deterministic (counsel is memoized per state).
 */
export interface Pick {
  key: string;
  action: PlayerAction;
  /** The order, in plain words. */
  label: string;
  goal: GoalId;
  /** What he says about it, in his voice. */
  says: string;
  /** "Do it" / "Do it, but…" and how sure he is. */
  verdict: string;
  sure: Voice['confidenceWord'];
  but?: string;
  /** His biggest worry (the main risk as he sees it). */
  worry?: string;
  /** A bias the boss could know of. */
  bias?: string;
  /** What he can't see from where he sits. */
  blind?: string;
  /** Someone at the table who disagrees, and what he says. */
  dissent?: { who: string; verdict: string; says: string };
  /** Chips. */
  cost: number;
  pot: 'family' | 'pocket';
  hours: string;
  odds?: number;
  risk?: string;
  /** Where it came from (sit-down item, an opportunity). */
  source: string;
}

export interface Suggestions {
  /** Who is speaking: the underboss, else the consigliere, else whoever is at the table. */
  speaker?: { name: string; title: string; charId: string };
  picks: Pick[];
  /** Why there are none ("Nobody at the table", "He'd wait this week"). */
  empty?: string;
}

interface Cand { action: PlayerAction; source: string; weight: number }

/** The orders on the table this week: the sit-down's options and the opportunities that are one order. */
export function candidates(s: GameState, orders: readonly PlayerAction[] = []): Cand[] {
  const out: Cand[] = [];
  const push = (c: Cand) => {
    if (orders.some((o) => sameOrder(o, c.action)) || out.some((x) => sameOrder(x.action, c.action))) return;
    const p = previewAction(s, c.action);
    if (p.disabledReason) return;
    out.push(c);
  };
  try {
    for (const it of briefing(s).items) for (const o of it.options) if (o.action && o.id !== 'wait') push({ action: o.action, source: `${it.speaker}: ${it.topic}`, weight: it.priority + o.value / 100 });
  } catch { /* no briefing yet */ }
  try {
    for (const o of opportunities(s)) if (o.link.action) push({ action: o.link.action, source: o.title, weight: o.score });
  } catch { /* nothing */ }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 8);
}

const ORDER = ['underboss', 'consigliere'] as const;

function speakerOf(voices: Voice[]): Voice | undefined {
  for (const r of ORDER) { const v = voices.find((x) => x.adviser.role === r); if (v) return v; }
  return voices[0];
}

export function underbossSuggests(s: GameState, ui: { orders?: readonly PlayerAction[] } = {}, max = 3): Suggestions {
  if (s.gameOver) return { picks: [], empty: 'The game is over.' };
  const orders = ui.orders ?? [];
  const money = queuedMoney(s, orders);
  let speaker: Suggestions['speaker'];
  const scored: { pick: Pick; score: number }[] = [];
  for (const c of candidates(s, orders)) {
    const cs = counsel(s, { kind: 'action', action: c.action });
    if (!cs) continue;
    const v = speakerOf(cs.voices);
    if (!v) continue;
    if (!speaker) speaker = { name: v.adviser.name, title: v.adviser.title, charId: v.adviser.charId };
    // He speaks for himself: only his own voice decides what he puts forward.
    if (v.adviser.charId !== speaker.charId) continue;
    if (v.verdict !== 'do' && v.verdict !== 'doBut') continue;
    const p = previewAction(s, c.action);
    const pot = p.pot === 'pocket' ? 'pocket' : 'family';
    // Something the money left after this week's orders can't cover is not a pick this week.
    if (p.cost > 0 && p.cost > (pot === 'pocket' ? Math.max(0, money.pocketLeft) + Math.max(0, money.familyLeft) : money.familyLeft)) continue;
    const other = cs.voices.find((x) => x.adviser.charId !== v.adviser.charId && (x.verdict === 'wait' || x.verdict === 'dont'));
    const odds = p.odds ?? p.acceptance;
    scored.push({
      score: v.score + v.confidence / 50,
      pick: {
        key: JSON.stringify(c.action), action: c.action, label: p.title, goal: goalOfAction(c.action),
        says: v.says, verdict: v.label, sure: v.confidenceWord, but: v.but, worry: v.worry ? ABOUT_WORD[v.worry] : undefined,
        bias: v.bias, blind: v.blind,
        dissent: other ? { who: `${other.adviser.name} (${other.adviser.title.toLowerCase()})`, verdict: other.label, says: other.says } : undefined,
        cost: p.cost, pot, hours: hoursShort(timeCost(c.action, s)), odds: odds ? Math.round(odds.chance * 100) : undefined, risk: mainRisk(p), source: c.source,
      },
    });
  }
  const picks = scored.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.pick);
  if (!speaker) return { picks: [], empty: 'Nobody at the table to ask: seat an underboss or a consigliere.' };
  return { speaker, picks, empty: picks.length ? undefined : `${speaker.name} would sit tight this week: nothing on the table he likes.` };
}
