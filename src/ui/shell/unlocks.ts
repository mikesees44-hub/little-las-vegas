import { ageOn } from '../../engine/calendar';
import { crew, player } from '../../engine/characters';
import { getRelation } from '../../engine/relations';
import { knownSecrets } from '../../engine/secrets';
import { holder } from '../../engine/council';
import type { GameState } from '../../engine/types';

/**
 * Progressive disclosure, CK style: which drawer sections a new boss sees.
 * Pure and read-only. It never gates an engine action, only what the rail
 * and the drawers show; alerts can always reveal their target, and the shell
 * keeps what was once revealed (see `useUnlocks`).
 */

/** After the first Labor Day everything is open. */
export function seasoned(s: GameState): boolean {
  return s.date.y > 1960 || s.date.m >= 9 || s.week >= 16;
}

export function intrigueOpen(s: GameState): boolean {
  if (seasoned(s)) return true;
  const seated = !!holder(s, 'consigliere');
  const knows = Object.values(s.characters).some((c) => c.alive && c.faction !== 'player' && knownSecrets(s, c.id).length > 0);
  return seated && knows;
}

export function heistOpen(s: GameState): boolean {
  return seasoned(s) || s.week >= 10 || s.schemes.some((x) => x.kind === 'heist') || s.pendingEvents.some((e) => /heist|score/i.test(e.title));
}

const lotsOwned = (s: GameState) => (s.econ?.lots ?? []).some((l) => l.owner === 'player');
const maxGrievance = (s: GameState) => Math.max(0, ...crew(s).map((c) => getRelation(s, c.id, s.playerId)?.grievance ?? 0));

/** Section key ("panel.section") → when it shows. Missing keys are always visible. */
const RULES: Record<string, (s: GameState) => boolean> = {
  'you.court': (s) => s.week >= 2,
  'you.possessions': (s) => s.money >= 20000,
  'house.tree': (s) => s.week >= 2 || s.pendingEvents.some((e) => /family|wife|son|daughter|wedding/i.test(e.title)),
  'house.marriages': (s) => s.week >= 2,
  'house.activities': (s) => s.week >= 3,
  'house.succession': (s) => {
    const b = player(s);
    return ageOn(b.birth, s.date) >= 50 || b.health < 60 || !!s.power?.crisis || s.week >= 6;
  },
  'house.legacy': (s) => (s.dyn?.renownTotal ?? 0) > 0 || s.week >= 8,
  'house.decisions': (s) => (s.dyn?.renownTotal ?? 0) > 0 || s.week >= 8,
  'house.houses': (s) => (s.dyn?.renownTotal ?? 0) > 0 || s.week >= 8,
  'borgata.membership': (s) => !!s.books?.open || (s.crewStats?.makings ?? 0) > 0 || s.week >= 4,
  'borgata.grievances': (s) => maxGrievance(s) >= 40 || s.factions.length > 0,
  'borgata.orders': (s) => s.week >= 3,
  'holdings.property': (s) => s.week >= 3 || s.money >= 15000 || lotsOwned(s),
  'holdings.designer': (s) => s.week >= 3 || Object.values(s.empire?.venues ?? {}).some((v) => v.owner === 'player'),
  'holdings.books': (s) => s.week >= 6 || Object.keys(s.econ?.cases ?? {}).length > 0,
  'holdings.hq': (s) => s.heat.federal >= 20 || (s.econ?.hq.found ?? 0) > 0 || s.week >= 8,
  'ops.travel': (s) => s.week >= 3 || s.outposts.length > 0 || (s.travel?.trips?.length ?? 0) > 0,
  'diplomacy.board': (s) => s.week >= 4 || s.rivals.some((r) => r.lastMove?.target === 'player'),
  'diplomacy.table': (s) => s.week >= 4 || s.disputes.length > 0 || s.wars.length > 0,
  'diplomacy.balance': (s) => !!s.power?.crisis || (s.power?.blitzes.length ?? 0) > 0 || s.wars.length > 0,
  'diplomacy.front': (s) => !!s.power?.front,
  'town.case': (s) => (player(s).evidence ?? 0) >= 10 || s.heat.federal >= 30 || (!!s.legal && s.legal.stage !== 'quiet'),
  'town.cityhall': (s) => s.favors > 0 || s.week >= 8,
  'town.underbelly': (s) => !!s.underbelly && s.underbelly.stage !== 'waiting',
  'town.patronage': (s) => s.money >= 30000 || s.respect >= 50,
};

export function sectionVisible(s: GameState, key: string): boolean {
  const r = RULES[key];
  if (!r || seasoned(s)) return true;
  try { return r(s); } catch { return true; }
}

/** Every section key visible now (pure). */
export function visibleSections(s: GameState, keys: string[]): Set<string> {
  return new Set(keys.filter((k) => sectionVisible(s, k)));
}
