import { displayName } from './characters';
import { adultOn } from './datingState';
import { activeGoomars } from './goomar';
import { houseOfBirth } from './houses';
import type { GameState } from './types';
import { sideOf } from './sides';

/**
 * CLOSE PEOPLE (the ★ on a person): the boss's favorites, a quick link to the people he keeps close:
 * his wife and kids, the goomar, a politician he owns, a singer from the clubs, a cop on the pad.
 *
 * Auto-pins are DERIVED, never written: the wife, the boss's children and an active goomar are close
 * people unless the boss unpinned them. So a fresh game has no state at all (its final form), and the
 * goomar is pinned the week the arrangement begins. The boss's own choices live in `s.pins`
 * (optional; made by the first ★ click; upgradeSave tops up only a save that has it).
 */

export interface PinsState {
  v: 1;
  /** Pinned by hand (order of pinning). */
  on: string[];
  /** Auto-pins the boss took off. */
  off: string[];
}

/** A soft cap: past it the strip scrolls and the ★ says the book is full-ish (never refuses). */
export const PIN_SOFT_CAP = 24;
/** Weeks a dead close person stays in the strip (with a ✝). */
export const DEAD_WEEKS = 8;

export function ensurePins(s: GameState): PinsState {
  const P = (s.pins ??= { v: 1, on: [], off: [] });
  P.on ??= [];
  P.off ??= [];
  return P;
}

/** Who is close by default: the wife, the boss's children, an active goomar. */
export function autoPins(s: GameState): string[] {
  const b = s.characters[s.playerId];
  if (!b) return [];
  const out: string[] = [];
  if (b.spouseId && s.characters[b.spouseId]) out.push(b.spouseId);
  for (const k of b.childrenIds ?? []) if (s.characters[k]) out.push(k);
  for (const g of activeGoomars(s)) if (s.characters[g.id]) out.push(g.id);
  return out;
}

function recent(s: GameState, id: string): boolean {
  const c = s.characters[id];
  if (!c) return false;
  return c.alive || (c.death !== undefined && s.week - c.death.week <= DEAD_WEEKS);
}

/** The close people, in order: auto-pins first, then the boss's own (living, or lately dead). */
export function pinnedIds(s: GameState): string[] {
  const off = new Set(s.pins?.off ?? []);
  const ids = [...autoPins(s).filter((id) => !off.has(id)), ...(s.pins?.on ?? [])];
  return [...new Set(ids)].filter((id) => id !== s.playerId && recent(s, id));
}

export function isPinned(s: GameState, id: string): boolean {
  return pinnedIds(s).includes(id);
}

/** ★ on / off. Pure: a new state (the old one is left as it was). */
export function togglePin(s0: GameState, id: string, on = !isPinned(s0, id)): GameState {
  if (!s0.characters[id] || id === s0.playerId) return s0;
  const P0 = s0.pins ?? { v: 1 as const, on: [], off: [] };
  const P: PinsState = { v: 1, on: P0.on.filter((x) => x !== id), off: P0.off.filter((x) => x !== id) };
  const auto = autoPins(s0).includes(id);
  if (on && !auto) P.on.push(id);
  if (!on && auto) P.off.push(id);
  return { ...s0, pins: P };
}

/** The tag a close person is grouped under. */
export type PinTag = 'Wife' | 'Kid' | 'Family' | 'Goomar' | 'Politician' | 'Cop' | 'Celebrity' | 'Working girl' | 'Nightlife' | 'Crew' | 'Other families' | 'Friend';
export const PIN_TAG_ORDER: PinTag[] = ['Wife', 'Kid', 'Family', 'Goomar', 'Crew', 'Politician', 'Cop', 'Celebrity', 'Working girl', 'Nightlife', 'Other families', 'Friend'];
const WORKING = new Set(['escort', 'callgirl', 'street', 'madam', 'adultfilm']);
const STAGE = new Set(['singer', 'dancer', 'recording', 'actress']);

/** What he is to the boss, from relation, role, office or his house's type (showbiz = celebrity). */
export function pinTag(s: GameState, id: string): PinTag {
  const b = s.characters[s.playerId];
  const c = s.characters[id];
  if (!c || !b) return 'Friend';
  if (b.spouseId === id || c.spouseId === b.id) return 'Wife';
  if (b.childrenIds.includes(id)) return 'Kid';
  if (s.nightlife?.goomars?.[id] && !s.nightlife.goomars[id].ended) return 'Goomar';
  const np = s.nightlife?.people[id];
  if (np && WORKING.has(np.role)) return adultOn(s) ? 'Working girl' : 'Nightlife';
  const pol = s.pol ? Object.values(s.pol.people).find((p) => p.charId === id) : undefined;
  const hid = houseOfBirth(s, id);
  if (pol?.inst === 'showbiz' || (hid && s.lineage?.houses[hid]?.type === 'showbiz') || (np && STAGE.has(np.role))) return 'Celebrity';
  const side = sideOf(s, id);
  if (side.kind === 'law') return 'Cop';
  if (side.kind === 'official' || c.outside === 'politician') return 'Politician';
  if (c.dynasty) return 'Family';
  if (np) return 'Nightlife';
  if (side.kind === 'yours') return 'Crew';
  if (side.kind === 'rival' || side.kind === 'philly') return 'Other families';
  return 'Friend';
}

/** A small badge for news: he is in trouble, wants to see you, or has died. */
export interface PinNews { kind: 'dead' | 'trouble' | 'see'; text: string }

export function pinNews(s: GameState, id: string): PinNews | undefined {
  const c = s.characters[id];
  if (!c) return undefined;
  if (!c.alive) return { kind: 'dead', text: `Died${c.death ? ` (week ${c.death.week}): ${c.death.cause}` : ''}` };
  if ((c.imprisonedUntil ?? 0) > s.week) return { kind: 'trouble', text: 'Inside' };
  const pinch = s.feds?.pinches.find((p) => p.charId === id && p.stage !== 'done');
  if (pinch) return { kind: 'trouble', text: `Picked up: ${pinch.crime}` };
  const threat = s.threats?.tips.find((t) => t.targetId === id && t.status !== 'done' && t.status !== 'missed' && t.deadline >= s.week);
  if (threat) return { kind: 'trouble', text: 'Word of a threat against him' };
  if (c.health < 35) return { kind: 'trouble', text: 'In poor health' };
  const ev = [...s.pendingEvents, ...s.eventQueue].find((e) => e.actors?.includes(id));
  if (ev) return { kind: 'see', text: `Wants to see you: ${ev.title}` };
  return undefined;
}

export interface CloseGroup { tag: PinTag; people: { id: string; name: string; tag: PinTag; news?: PinNews }[] }

/** The strip: the close people grouped by tag. */
export function closePeople(s: GameState): CloseGroup[] {
  const by = new Map<PinTag, CloseGroup['people']>();
  for (const id of pinnedIds(s)) {
    const tag = pinTag(s, id);
    const news = pinNews(s, id);
    (by.get(tag) ?? by.set(tag, []).get(tag)!).push({ id, name: displayName(s.characters[id]), tag, ...(news ? { news } : {}) });
  }
  return PIN_TAG_ORDER.filter((t) => by.has(t)).map((t) => ({ tag: t, people: by.get(t)! }));
}
