import type { GameState, PlayerAction } from '../../engine/types';

/**
 * Who answers "Yes, boss." when an order is confirmed: the man who carries it out,
 * or, when the boss does it himself (or it has no named actor), his underboss.
 */
export function yesBossSpeaker(s: GameState, actor: string): string {
  const a = (actor ?? '').trim();
  if (a && !/^(you|yourself|the boss)\b/i.test(a)) return a;
  const ub = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'underboss' && c.id !== s.playerId);
  return ub ? (ub.nickname ? `${ub.firstName} "${ub.nickname}" ${ub.lastName}` : `${ub.firstName} ${ub.lastName}`) : 'Your people';
}

export function CharacterDisplayName({ s, actor }: { s: GameState; action: PlayerAction; actor: string }) {
  return <>{yesBossSpeaker(s, actor)}</>;
}
