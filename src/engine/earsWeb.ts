import { ageOn } from './calendar';
import { displayName } from './characters';
import type { EarsState, Link, LinkType } from './earsState';
import { LINK_LABEL } from './earsState';
import { activeRomances, drawnTo, kin } from './romance';
import { chance, rand, randInt, type RngHolder } from './rng';
import type { Character, GameState, RivalId } from './types';

/**
 * THE CONNECTION WEB: who is attached to whom. "This soldier is sweet on a
 * dancer; that councilman is a regular of one hostess; the rival's underboss
 * has a favorite at your club; the star has fallen for a waitress."
 *
 * Every link has a type (likes, a regular, girlfriend, mistress, in love, an
 * ex, owes) and a strength, and some start hidden until an Ear reveals them.
 * Links grow from visits, dates, romances and her reports, and the people of
 * the world make them on their own. Only between a man and a woman who are
 * drawn to each other: the web never touches anybody's orientation (same-sex
 * romances stay in the romance system, private, and are never leverage).
 *
 * Leverage comes from affairs and graft only.
 */

const RANK: Record<LinkType, number> = { ex: 0, owes: 0, likes: 1, regular: 2, girlfriend: 3, mistress: 3, in_love: 4 };
export const ROMANTIC: LinkType[] = ['girlfriend', 'mistress', 'in_love'];

export function activeLinks(E: EarsState): Link[] {
  return E.links.filter((l) => l.ended === undefined);
}

export function findLink(E: EarsState, a: string, b: string): Link | undefined {
  return E.links.find((l) => l.ended === undefined && l.a === a && l.b === b);
}

export function married(s: GameState, c: Character): boolean {
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  return !!sp?.alive || !!c.household?.wife;
}

/** May these two be attached at all? Adults, not kin, drawn to each other. */
export function canAttach(s: GameState, man: Character, woman: Character): boolean {
  if (!man.alive || !woman.alive || man.id === woman.id) return false;
  if (ageOn(man.birth, s.date) < 21 || ageOn(woman.birth, s.date) < 21) return false;
  if (man.gender === woman.gender) return false;
  if (kin(man, woman)) return false;
  return drawnTo(s, man, woman) && drawnTo(s, woman, man);
}

/** Adds a link or strengthens/upgrades the one there is. */
export function addLink(s: GameState, E: EarsState, a: string, b: string, type: LinkType, strength: number, via: string, hidden = false): Link | undefined {
  const man = s.characters[a];
  const woman = s.characters[b];
  if (!man || !woman) return undefined;
  if (type !== 'owes' && !canAttach(s, man, woman)) return undefined;
  const ex = findLink(E, a, b);
  if (ex) {
    ex.strength = Math.min(100, Math.max(ex.strength, strength));
    if (RANK[type] > RANK[ex.type]) ex.type = type;
    if (!hidden) ex.hidden = false;
    return ex;
  }
  const l: Link = { id: `lk${E.links.length + 1}_${s.week}`, a, b, type, strength: Math.max(1, Math.min(100, strength)), hidden, since: s.week, via };
  E.links.push(l);
  E.stats.links++;
  return l;
}

/** Ends a link; romantic ones leave an "ex" behind. */
export function endLink(s: GameState, l: Link): void {
  l.ended = s.week;
  if (ROMANTIC.includes(l.type) || l.type === 'regular') {
    l.type = 'ex';
    l.strength = 20;
  }
}

/** Removes ended links older than two years, and any link whose people are gone. */
export function pruneLinks(s: GameState, E: EarsState): void {
  E.links = E.links.filter((l) => s.characters[l.a] && s.characters[l.b] && (l.ended === undefined || s.week - l.ended < 104));
  if (E.links.length > 160) E.links = E.links.slice(-160);
}

/** A connection as the boss sees it (hidden ones are left out until revealed). */
export interface Connection {
  otherId: string;
  type: LinkType;
  /** "He is a regular of her" / "She is his girlfriend". */
  text: string;
  strength: number;
  since: number;
  ended?: number;
  source: 'web' | 'romance';
}

function rLink(s: GameState, r: ReturnType<typeof activeRomances>[number]): { a: string; b: string; type: LinkType; hidden: boolean } | undefined {
  const x = s.characters[r.a];
  const y = s.characters[r.b];
  if (!x || !y || x.gender === y.gender) return undefined;
  const man = x.gender === 'M' ? x : y;
  const woman = man === x ? y : x;
  const type: LinkType = r.kind === 'affair' ? 'mistress' : r.kind === 'lovers' ? 'girlfriend' : 'likes';
  return { a: man.id, b: woman.id, type, hidden: r.secret && r.discovered === undefined };
}

function phrase(_s: GameState, man: Character, woman: Character, type: LinkType, view: 'man' | 'woman', ended?: number): string {
  const her = woman.firstName;
  const him = man.firstName;
  if (ended !== undefined || type === 'ex') return view === 'man' ? `Used to see ${her}` : `Used to see ${him}`;
  switch (type) {
    case 'likes': return view === 'man' ? `Sweet on ${her}` : `${him} is sweet on her`;
    case 'regular': return view === 'man' ? `A regular of ${her}'s` : `${him} is one of her regulars`;
    case 'girlfriend': return view === 'man' ? `${her} is his girlfriend` : `${him}'s girlfriend`;
    case 'mistress': return view === 'man' ? `Keeps ${her} on the side` : `${him}'s mistress`;
    case 'in_love': return view === 'man' ? `In love with ${her}` : `${him} is in love with her`;
    case 'owes': return view === 'man' ? `Owes ${her}` : `${him} owes her`;
  }
}

/** Everything the boss knows about whom this person is attached to. */
export function connectionsOf(s: GameState, id: string, includeEnded = true): Connection[] {
  const out: Connection[] = [];
  const E = s.ears;
  const me = s.characters[id];
  if (!me) return out;
  const seen = new Set<string>();
  for (const l of E?.links ?? []) {
    if (l.hidden || (l.a !== id && l.b !== id)) continue;
    if (!includeEnded && l.ended !== undefined) continue;
    const otherId = l.a === id ? l.b : l.a;
    const other = s.characters[otherId];
    if (!other) continue;
    const man = l.a === id ? me : other;
    const woman = l.a === id ? other : me;
    seen.add(otherId);
    out.push({ otherId, type: l.type, text: phrase(s, man, woman, l.type, l.a === id ? 'man' : 'woman', l.ended), strength: l.strength, since: l.since, ended: l.ended, source: 'web' });
  }
  for (const r of activeRomances(s, id)) {
    const k = rLink(s, r);
    if (!k || k.hidden) continue;
    const otherId = k.a === id ? k.b : k.a;
    if (seen.has(otherId) || !s.characters[otherId]) continue;
    const man = s.characters[k.a];
    const woman = s.characters[k.b];
    out.push({ otherId, type: k.type, text: phrase(s, man, woman, k.type, k.a === id ? 'man' : 'woman'), strength: 60, since: r.since, source: 'romance' });
  }
  return out.sort((x, y) => Number(x.ended !== undefined) - Number(y.ended !== undefined) || RANK[y.type] - RANK[x.type] || y.strength - x.strength);
}

/** How many of a person's links are still hidden (for the Ears' hints; never shown to the boss). */
export function hiddenLinksOf(E: EarsState, id: string): Link[] {
  return E.links.filter((l) => l.ended === undefined && l.hidden && (l.a === id || l.b === id));
}

/** Who's attached to whom: the board (known links only). */
export interface BoardRow {
  manId: string;
  womanId: string;
  type: LinkType;
  label: string;
  strength: number;
  since: number;
  /** His side: 'yours', a rival id, 'law', 'town'. */
  side: string;
  danger?: string;
}

export function attachmentBoard(s: GameState): BoardRow[] {
  const E = s.ears;
  const rows: BoardRow[] = [];
  const add = (a: string, b: string, type: LinkType, strength: number, since: number) => {
    const man = s.characters[a];
    const woman = s.characters[b];
    if (!man || !woman || !man.alive || !woman.alive) return;
    if (rows.some((r) => r.manId === a && r.womanId === b)) return;
    const side = man.faction === 'player' ? 'yours' : man.faction === 'law' || man.office ? 'law' : man.faction !== 'none' ? man.faction : 'town';
    const ear = E?.ears[b];
    let danger: string | undefined;
    if (side === 'yours' && ear?.sellsTo && ROMANTIC.includes(type)) danger = 'She also talks to another crew';
    else if (side === 'yours' && ROMANTIC.includes(type) && married(s, man)) danger = 'He is married';
    else if (side !== 'yours' && side !== 'town' && ear && ear.loyalty >= 50) danger = 'A way in';
    rows.push({ manId: a, womanId: b, type, label: LINK_LABEL[type], strength, since, side, danger });
  };
  for (const l of E?.links ?? []) if (!l.hidden && l.ended === undefined) add(l.a, l.b, l.type, l.strength, l.since);
  for (const r of s.romance?.rels ?? []) {
    if (r.ended !== undefined) continue;
    const k = rLink(s, r);
    if (!k || k.hidden) continue;
    const man = s.characters[k.a];
    // The board is about the night: the crew, rivals, officials, and the Ears.
    if (!man || (man.faction === 'none' && !man.office && !E?.ears[k.b])) continue;
    if (man.dynasty && man.faction === 'player' && !E?.ears[k.b]) continue;
    add(k.a, k.b, k.type, 60, r.since);
  }
  const order = (x: BoardRow) => (x.side === 'yours' ? 0 : x.side === 'law' ? 2 : x.side === 'town' ? 3 : 1);
  return rows.sort((x, y) => order(x) - order(y) || RANK[y.type] - RANK[x.type] || y.strength - x.strength);
}

/* ------------------------------------------------------------------ */
/* The people of the world make links on their own                     */
/* ------------------------------------------------------------------ */

/** The men of the night: the crew, the rivals' men, officials and the law. */
export function nightMen(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && c.gender === 'M' && c.id !== s.playerId && !c.imprisonedUntil
    && ((c.faction !== 'none' && c.rank !== 'civilian') || !!c.office));
}

function womenOf(s: GameState, E: EarsState): Character[] {
  return Object.values(E.ears).filter((e) => e.status !== 'gone').map((e) => s.characters[e.id]).filter((c): c is Character => !!c?.alive);
}

export interface WebHook {
  kind: 'jealousy' | 'breakup' | 'pregnant' | 'wife';
  a: string;
  b?: string;
  her: string;
  rival?: RivalId;
}

/**
 * Monthly: new attachments, links growing and fading, breakups, and leaks
 * (a man of yours tells his girl, and his girl talks to a rival). Returns
 * story hooks the event source may turn into a scene.
 */
export function webMonth(s: GameState, E: EarsState, h: RngHolder, onLeak: (man: Character, her: Character, rival: RivalId) => void): WebHook[] {
  const hooks: WebHook[] = [];
  const men = nightMen(s);
  const women = womenOf(s, E);
  // New attachments: a couple a month.
  for (let k = 0; k < 2 && men.length && women.length; k++) {
    const her = women[Math.floor(rand(h) * women.length)];
    const weights = men.map((m) => (m.traits.includes('Womanizer') ? 3 : 1) + ((m.vices ?? []).includes('women') ? 2 : 0) + (m.faction === 'player' ? 0.5 : 0));
    let r = rand(h) * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < men.length - 1 && r >= weights[i]) r -= weights[i++];
    const man = men[i];
    if (findLink(E, man.id, her.id) || !canAttach(s, man, her)) continue;
    const hide = married(s, man) || man.faction !== 'player' ? 0.7 : 0.35;
    addLink(s, E, man.id, her.id, 'likes', randInt(h, 15, 35), 'npc', chance(h, hide));
  }
  for (const l of activeLinks(E)) {
    if (l.type === 'owes' || l.type === 'ex') continue;
    const man = s.characters[l.a];
    const her = s.characters[l.b];
    if (!man?.alive || !her?.alive) {
      endLink(s, l);
      continue;
    }
    const ear = E.ears[l.b];
    l.strength = Math.max(0, Math.min(100, l.strength + randInt(h, -5, 8) + (man.traits.includes('Womanizer') ? -2 : 0)));
    if (l.type === 'likes' && l.strength >= 45) {
      if (ear && (ear.work === 'callgirl' || ear.work === 'hostess') && chance(h, 0.5)) l.type = 'regular';
      // She decides. A cruel man never gets a yes.
      else if (!man.traits.includes('Cruel') && chance(h, 0.45)) l.type = married(s, man) ? 'mistress' : 'girlfriend';
      else l.strength -= 15;
    } else if ((l.type === 'girlfriend' || l.type === 'mistress') && l.strength >= 85 && chance(h, 0.12)) l.type = 'in_love';
    if (l.strength <= 4) {
      endLink(s, l);
      continue;
    }
    // Breakups.
    if (ROMANTIC.includes(l.type) && chance(h, 0.025)) {
      endLink(s, l);
      if (man.faction === 'player' && ear) hooks.push({ kind: 'breakup', a: man.id, her: her.id, rival: ear.sellsTo });
      continue;
    }
    if (ROMANTIC.includes(l.type)) {
      // Pillow talk: a man of yours, a girl who sells what she hears to a rival.
      if (man.faction === 'player' && ear?.sellsTo && chance(h, 0.35)) onLeak(man, her, ear.sellsTo);
      if (l.strength >= 60 && chance(h, 0.012)) hooks.push({ kind: 'pregnant', a: man.id, her: her.id });
      if (married(s, man) && man.faction === 'player' && !l.hidden && chance(h, 0.03)) hooks.push({ kind: 'wife', a: man.id, her: her.id });
    }
  }
  // Jealousy: two men, one woman.
  const byHer = new Map<string, Link[]>();
  for (const l of activeLinks(E)) if (l.strength >= 40 && l.type !== 'owes' && l.type !== 'ex') (byHer.get(l.b) ?? byHer.set(l.b, []).get(l.b)!).push(l);
  for (const [herId, ls] of byHer) {
    if (ls.length < 2) continue;
    const ours = ls.filter((l) => s.characters[l.a]?.faction === 'player');
    if (!ours.length) continue;
    const other = ls.find((l) => l !== ours[0]);
    if (other && chance(h, 0.2)) hooks.push({ kind: 'jealousy', a: ours[0].a, b: other.a, her: herId });
  }
  return hooks;
}

/** One line about a man for the board's tooltip. */
export function sideName(s: GameState, side: string): string {
  if (side === 'yours') return 'Your crew';
  if (side === 'law') return 'Law & City Hall';
  if (side === 'town') return 'Town';
  return s.rivals.find((r) => r.id === side)?.shortName ?? side;
}

export function linkWho(s: GameState, l: Pick<Link, 'a' | 'b' | 'type'>): string {
  const a = s.characters[l.a];
  const b = s.characters[l.b];
  return `${a ? displayName(a) : '?'} — ${LINK_LABEL[l.type]} — ${b ? displayName(b) : '?'}`;
}
