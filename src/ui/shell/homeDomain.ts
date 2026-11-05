import type { DeskItem } from '../../engine/desk';
import type { GameState } from '../../engine/types';
import { domainOf, domainOfText, type Domain } from '../domain';
import type { HomeId } from './routes';

/**
 * WHICH HOME A THING BELONGS TO (STREAMLINE_2 §3.3): every domain (ui/domain.ts) lives in exactly
 * one of the six domain homes, so every Desk item, recommendation or person lands in exactly one
 * home's front page (and the Desk shows them all). Pure and free of nav.ts, so the Desk itself
 * (BossDesk's domain chips) can read it.
 */
export const DOMAIN_HOME: Record<Domain, Exclude<HomeId, 'desk'>> = {
  family: 'house', church: 'house', romance: 'house',
  crew: 'org',
  money: 'money',
  law: 'law',
  rivals: 'rivals',
  politics: 'town', shore: 'town',
};

/** The domain homes, in rail order (the Desk is all of them). */
export const DOMAIN_HOMES: Exclude<HomeId, 'desk'>[] = ['house', 'org', 'money', 'law', 'rivals', 'town'];

/** The domains a home is about (the Desk: all of them). */
export function homeDomains(home: HomeId): Domain[] {
  return (Object.keys(DOMAIN_HOME) as Domain[]).filter((d) => home === 'desk' || DOMAIN_HOME[d] === home);
}

/** A person's home: blood is Family, his own men Crew, the other families Rivals, the law Law; anyone else Town. */
export function homeOfPerson(s: GameState, id: string | undefined): Exclude<HomeId, 'desk'> | undefined {
  const c = id ? s.characters[id] : undefined;
  if (!c) return undefined;
  if (c.dynasty || c.id === s.characters[s.playerId]?.spouseId) return 'house';
  if (c.faction === 'player') return 'org';
  if (c.faction === 'law') return 'law';
  if (c.faction === 'none') return c.office && /police|judge|sergeant|detective|prosecutor|agent|chief/i.test(c.office) ? 'law' : 'town';
  return 'rivals';
}

/** Kinds of Desk paper that are a domain by themselves. */
const KIND_DOMAIN: Partial<Record<DeskItem['kind'], Domain>> = {
  envelope: 'money', bill: 'money', lawyer: 'law', lieutenant: 'crew', sitdown: 'crew', morning: 'crew',
};

/** The one domain home a Desk item belongs to (its kind, its words, who brought it; else Crew). */
export function homeOfDeskItem(s: GameState, it: Pick<DeskItem, 'kind' | 'title' | 'detail' | 'ref'>): Exclude<HomeId, 'desk'> {
  if (it.ref.single) return 'house';
  const k = KIND_DOMAIN[it.kind];
  if (k) return DOMAIN_HOME[k];
  let d: Domain | undefined;
  try { d = domainOfText(s, `${it.title}. ${it.detail}`); } catch { d = undefined; }
  if (d) return DOMAIN_HOME[d];
  return homeOfPerson(s, it.ref.charId) ?? 'org';
}

/** The one domain home for a line of text with an optional key ("holdings.money") and person. */
export function homeOfText(s: GameState, text: string, key?: string, charId?: string): Exclude<HomeId, 'desk'> {
  const byKey = key ? domainOf(key) : undefined;
  if (byKey) return DOMAIN_HOME[byKey];
  let d: Domain | undefined;
  try { d = domainOfText(s, text); } catch { d = undefined; }
  if (d) return DOMAIN_HOME[d];
  return homeOfPerson(s, charId) ?? 'org';
}
