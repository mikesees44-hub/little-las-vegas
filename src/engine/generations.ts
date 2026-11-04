import { ageOn } from './calendar';
import { crew, displayName, player } from './characters';
import { chooseHeir } from './dynasty';
import { fam } from './familyState';
import { marriageAcceptance, marriageEffects, matchCandidates, ourMarriageable } from './familyMarriage';
import { matronOf } from './matchmakers';
import { CAPO_SEAT_MIN } from './regimes';
import type { Effect, EventInstance, GameState } from './types';

/**
 * THE NEXT GENERATION (DECADE_BALANCE Top 10 #6, #7): an heir in training and a line that renews.
 *  - HEIR SEAT: the heir, grown (21–45) and never ranked, is offered a crew of his own (or a soldier's
 *    button first). 31 of 32 heirs in the decade test had never held a rank.
 *  - A MATCH: an unmarried son of the house (20–35) is offered a match by another house, about 15% a
 *    year each, when no woman of the house is there to arrange it (matchmakers.ts does, otherwise);
 *    originally:
 *    year each, so the old-don houses stop thinning.
 * Both are offers: "not now" is always there, and nothing is taken from the boss.
 * Every roll is hashed off the seed and the week (never the game's dice).
 */

export const HEIR_SEAT_AGE = 21;
export const HEIR_SEAT_GAP = 52;
export const MATCH_AGE: [number, number] = [20, 35];
export const MATCH_YEARLY = 0.15;

function roll(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function stationBoss(s: GameState): boolean {
  return (s.power?.station ?? 'boss') === 'boss';
}

/** The heir is grown, unranked and in the life: he is offered a seat (once a year at most). */
export function heirSeatSource(s: GameState): EventInstance | undefined {
  if (s.gameOver || !stationBoss(s) || s.week < 6) return undefined;
  const boss = player(s);
  if (!boss?.alive) return undefined;
  let heir;
  try { heir = chooseHeir(s, boss).heir; } catch { return undefined; }
  if (!heir || heir.faction !== 'player' || heir.gender !== 'M') return undefined;
  if (heir.rank !== 'civilian' && heir.rank !== 'associate') return undefined;
  if ((heir.imprisonedUntil ?? 0) > s.week) return undefined;
  const a = ageOn(heir.birth, s.date);
  if (a < HEIR_SEAT_AGE || a > 45) return undefined;
  const path = s.dyn?.people[heir.id] ? fam(s, heir.id).path : undefined;
  if (path === 'priest' || path === 'straight' || path === 'politics') return undefined;
  const key = `heirSeat_${heir.id}`;
  if (s.flags[key] !== undefined && s.week - s.flags[key] < HEIR_SEAT_GAP) return undefined;
  if (roll(`${s.seed}|${s.week}|heirseat`) > 0.12) return undefined;
  s.flags[key] = s.week;
  const d = s.districts.find((x) => (!x.capoId || !s.characters[x.capoId]?.alive) && (x.influence.player ?? 0) >= CAPO_SEAT_MIN);
  const label = `${heir.firstName}: a place in the family`;
  const men = crew(s).filter((c) => c.rank === 'soldier' && !c.capoId).length;
  return {
    iid: `ev${s.nextId++}`, defId: 'heir_seat', week: s.week, mandatory: false, priority: 64,
    title: `${heir.firstName} is ready`,
    text: `${displayName(heir)} is ${a}. The men already call him "the kid" with something like respect. If he is to sit in your chair one day, he should learn to run a crew while you are here to watch him do it.`,
    defaultChoiceId: 'capo', actors: [heir.id], meta: { who: heir.id, theme: 'family' },
    choices: [
      {
        id: 'capo', label: `Give him a crew${d ? ` in ${d.name}` : ''}`, detail: `He becomes a capo${men ? `; ${Math.min(men, 3)} of the loose soldiers go to him` : ''}. The heir the men know.`, because: `gave ${heir.firstName} a crew`,
        effects: [{ type: 'rank', charId: heir.id, rank: 'capo', ...(d ? { district: d.id } : {}), label }, { type: 'opinion', from: heir.id, to: boss.id, amount: 15, reason: 'Gave me a crew', decay: 1, label }] as Effect[],
      },
      {
        id: 'soldier', label: 'Make him a soldier first', detail: 'He earns his way up like everybody else. Slower; nobody can say he was handed it.', because: `made ${heir.firstName} start as a soldier`,
        effects: [{ type: 'rank', charId: heir.id, rank: 'soldier', label }, { type: 'opinion', from: heir.id, to: boss.id, amount: 5, reason: 'Brought me into the family', decay: 1, label }] as Effect[],
      },
      { id: 'later', label: 'Not yet', detail: 'Keep him out of it a while longer. You will be asked again next year.', because: `kept ${heir.firstName} out of it`, effects: [] },
    ],
  };
}

/** A house offers a match for one of the unmarried young men of ours. */
export function matchOfferSource(s: GameState): EventInstance | undefined {
  if (s.gameOver || s.week < 8 || !s.dyn?.houses?.length) return undefined;
  // The women of the house arrange the matches (matchmakers.ts): the houses' offers go to her.
  // Without a wife, a mother or a woman of the house, they still come to the boss.
  if (matronOf(s)) return undefined;
  if (s.flags.matchOffer !== undefined && s.week - s.flags.matchOffer < 13) return undefined;
  const young = ourMarriageable(s).filter((c) => { const a = ageOn(c.birth, s.date); return c.gender === 'M' && a >= MATCH_AGE[0] && a <= MATCH_AGE[1]; });
  if (!young.length) return undefined;
  const p = 1 - Math.pow(1 - MATCH_YEARLY, young.length / 52);
  if (roll(`${s.seed}|${s.week}|match`) > p) return undefined;
  const who = young[Math.floor(roll(`${s.seed}|${s.week}|matchwho`) * young.length) % young.length];
  const cands = matchCandidates(s, who)
    .map((x) => ({ ...x, ok: marriageAcceptance(s, who, x.c).chance }))
    .sort((a, b) => b.ok - a.ok || a.c.id.localeCompare(b.c.id))
    .slice(0, 3);
  if (!cands.length) return undefined;
  s.flags.matchOffer = s.week;
  return {
    iid: `ev${s.nextId++}`, defId: 'match_offer', week: s.week, mandatory: false, priority: 52,
    title: `A match for ${who.firstName}`,
    text: `${displayName(who)} is ${ageOn(who.birth, s.date)} and not married. Word has gone around the parish halls and the back rooms, and the houses have answered: ${cands.map((x) => x.house.name).join(', ')}. A wedding is an alliance, and grandchildren.`,
    defaultChoiceId: `m0`, actors: [who.id], meta: { who: who.id, theme: 'family' },
    choices: [
      ...cands.map((x, i) => ({
        id: `m${i}`, label: `${x.c.firstName} ${x.c.lastName} (${x.house.name})`, detail: `${ageOn(x.c.birth, s.date)}. Her family has said yes.`, because: `married ${who.firstName} to ${x.c.firstName} ${x.c.lastName}`,
        effects: marriageEffects(s, who, x.c, false),
      })),
      { id: 'none', label: 'Not now', detail: 'He can wait. The houses will ask again.', because: `kept ${who.firstName} single for now`, effects: [] },
    ],
  };
}
