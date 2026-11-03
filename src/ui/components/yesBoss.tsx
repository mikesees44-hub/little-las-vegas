import type { GameState, PlayerAction } from '../../engine/types';
import { addressOf, inTheRanks } from '../../engine/rankView';

/** The answer when an order is confirmed: "Yes, boss." in the chair; below it, the word your people use for you. */
export function yesWord(s: GameState): string {
  if (!inTheRanks(s)) return '“Yes, boss.”';
  const a = addressOf(s);
  return a === 'kid' ? '“Sure thing.”' : `“You got it, ${a}.”`;
}

/**
 * Who answers "Yes, boss." when an order is confirmed: the man who carries it out,
 * or, when the boss does it himself (or it has no named actor), his underboss.
 */
export function yesBossSpeaker(s: GameState, actor: string): string {
  const a = (actor ?? '').trim();
  // Below the chair nobody says "Yes, boss": it is your own guys, or nobody (rankView.ts).
  if (inTheRanks(s) && (!a || /^(you|yourself|the boss)\b/i.test(a))) return 'Your guys';
  if (a && !/^(you|yourself|the boss)\b/i.test(a)) return a;
  const ub = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'underboss' && c.id !== s.playerId);
  return ub ? (ub.nickname ? `${ub.firstName} "${ub.nickname}" ${ub.lastName}` : `${ub.firstName} ${ub.lastName}`) : 'Your people';
}

export function CharacterDisplayName({ s, actor }: { s: GameState; action: PlayerAction; actor: string }) {
  return <>{yesBossSpeaker(s, actor)}</>;
}
