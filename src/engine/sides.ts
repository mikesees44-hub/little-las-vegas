import { pactWith } from './talks';
import type { NycFamilyId } from './nycData';
import type { Character, FactionId, GameState, RivalId } from './types';

/**
 * WHOSE SIDE IS HE ON: one answer for every person in the game, used
 * everywhere a face or a name appears (portrait frames, chips on rows and
 * cards, the sheet header, Find, the scheme planner).
 *
 * Each family has a fixed colour AND a fixed emblem shape and initial, so
 * nothing is told by colour alone. Your own people are gold with a star.
 *
 * The double-agent nuance (a Manno man on your payroll, your own man who
 * talks to the Kesslers) shows only when the boss knows it: an informant
 * secret about him that your house holds, or a payroll you pay yourself.
 */

export type SideKind = 'yours' | 'rival' | 'philly' | 'law' | 'official' | 'nightlife' | 'civilian';

/** Where his family stands with yours (other families only). */
export type SideRelation = 'war' | 'feud' | 'truce' | 'allied' | 'partners' | 'peace' | 'table';

export interface Side {
  kind: SideKind;
  /** The organisation he belongs to ('none' for civilians, officials and the nightlife). */
  factionId: FactionId;
  /** "Your family", "The Manno family", "Philadelphia", "Police", "City Hall", "Nightlife", "Civilian". */
  label: string;
  /** Chip text, short: "YOURS", "MANNO", "PHILLY", "POLICE" ... */
  short: string;
  /** Fixed colour of the side (hex). */
  color: string;
  /** Fixed emblem shape (never colour alone). */
  emblem: string;
  /** One-letter crest. */
  initial: string;
  /** The family's standing with you (other families only). */
  relation?: SideRelation;
  /** Known double dealing: on your payroll / talks to another family. */
  double?: { factionId: FactionId; text: string; label: string; color: string; emblem: string };
  /** The full line: "The Manno family — on your payroll". */
  full: string;
}

export interface SideStyle { label: string; short: string; color: string; emblem: string; initial: string }

/** Fixed colour + emblem per organisation. Distinct hues AND distinct shapes. */
export const SIDE_STYLE: Record<'player' | RivalId | 'official' | 'nightlife' | 'none', SideStyle> = {
  player: { label: 'Your family', short: 'YOURS', color: '#d4a62a', emblem: '★', initial: 'Y' },
  manno: { label: 'The Manno family', short: 'MANNO', color: '#c0392b', emblem: '◆', initial: 'M' },
  kessler: { label: 'The Kessler family', short: 'KESSLER', color: '#5b8bc4', emblem: '▲', initial: 'K' },
  feldstein: { label: 'The Feldstein family', short: 'FELDSTEIN', color: '#3a9a5b', emblem: '■', initial: 'F' },
  philly: { label: 'Philadelphia', short: 'PHILLY', color: '#9b6bc9', emblem: '♛', initial: 'P' },
  law: { label: 'The Law', short: 'LAW', color: '#a7b4c2', emblem: '✪', initial: 'L' },
  official: { label: 'City Hall', short: 'CITY HALL', color: '#c98a3e', emblem: '▣', initial: 'H' },
  nightlife: { label: 'Nightlife', short: 'NIGHTLIFE', color: '#d0679f', emblem: '✦', initial: 'N' },
  none: { label: 'Civilian', short: 'CIVILIAN', color: '#8f877c', emblem: '○', initial: 'C' },
};

/**
 * The five New York families (nycData.ts, fictional): colours and emblems
 * distinct from the home families' and from each other, for the New York
 * map and its chips. Never colour alone: each has its own shape.
 */
export const NYC_SIDE_STYLE: Record<NycFamilyId, SideStyle> = {
  marchetti: { label: 'The Genovese family', short: 'GENOVESE', color: '#1fa39b', emblem: '♣', initial: 'M' },
  corvino: { label: 'The Gambino family', short: 'GAMBINO', color: '#e0703a', emblem: '⬟', initial: 'C' },
  saladino: { label: 'The Profaci family', short: 'PROFACI', color: '#a9c443', emblem: '✚', initial: 'S' },
  lobianco: { label: 'The Lucchese family', short: 'LUCCHESE', color: '#b07a52', emblem: '♠', initial: 'L' },
  abbadessa: { label: 'The Bonanno family', short: 'BONANNO', color: '#4cc3e6', emblem: '●', initial: 'A' },
};

export const RELATION_LABEL: Record<SideRelation, string> = {
  war: 'At war', feud: 'Blood feud', truce: 'Truce', allied: 'Allied', partners: 'Partners', peace: 'At peace', table: 'Your bosses at the Table',
};
export const RELATION_TONE: Record<SideRelation, 'bad' | 'warn' | 'good' | 'neutral'> = {
  war: 'bad', feud: 'bad', truce: 'warn', allied: 'good', partners: 'good', peace: 'neutral', table: 'warn',
};

const POLICE = /police|patrolman|sergeant|detective|trooper|sheriff|constable|captain/i;
const LAW = /fbi|agent|prosecutor|attorney general|judge|justice|marshal|investigator|irs/i;
const OFFICIAL = /mayor|council|commission|senator|assembl|freeholder|clerk|governor|chairman|director|politic|ward|treasurer|board/i;

/** How the player's house stands with another organisation. */
export function relationWith(s: GameState, f: FactionId): SideRelation | undefined {
  if (f === 'player' || f === 'none' || f === 'law') return undefined;
  const r = s.rivals.find((x) => x.id === f);
  if (r?.war) return 'war';
  if (r?.feud) return 'feud';
  if (pactWith(s, f, 'alliance')) return 'allied';
  if (pactWith(s, f, 'partnership')) return 'partners';
  if (pactWith(s, f, 'truce') || pactWith(s, f, 'tribute')) return 'truce';
  return f === 'philly' ? 'table' : 'peace';
}

function familyStyle(s: GameState, f: FactionId): SideStyle {
  if (f in SIDE_STYLE) return SIDE_STYLE[f as keyof typeof SIDE_STYLE];
  const r = s.rivals.find((x) => x.id === f);
  return { ...SIDE_STYLE.none, label: r ? `The ${r.shortName} family` : 'Independent' };
}

/** The boss knows he is an informant (a secret your house holds). */
function knownInformant(s: GameState, c: Character): boolean {
  return s.secrets.some((x) => x.ownerId === c.id && x.kind === 'informant' && x.knownBy.includes('player'));
}

function polCtlOf(s: GameState, charId: string) {
  const pol = s.pol;
  if (!pol) return undefined;
  for (const id in pol.people) if (pol.people[id].charId === charId) return pol.ctl[id];
  return undefined;
}

/** The family a civilian belongs to by blood or marriage (spouse, parent, child in a family). */
function kinFaction(s: GameState, c: Character): Exclude<FactionId, 'none' | 'law'> | undefined {
  for (const id of [c.spouseId, c.fatherId, c.motherId, ...c.childrenIds]) {
    const k = id ? s.characters[id] : undefined;
    if (k && isFamily(k.faction)) return k.faction;
  }
  return undefined;
}

/** Is this an organisation member (rather than a civilian, official or nightlife person)? */
function isFamily(f: FactionId): f is Exclude<FactionId, 'none' | 'law'> {
  return f !== 'none' && f !== 'law';
}

/** THE source of truth: whose side is this person on, as far as the boss knows. */
export function sideOf(s: GameState, charId: string): Side {
  const c = s.characters[charId];
  if (!c) return mk(SIDE_STYLE.none, 'civilian', 'none');
  const make = (st: SideStyle, kind: SideKind, f: FactionId, double?: Side['double']) => mk(st, kind, f, kind === 'rival' || kind === 'philly' ? relationWith(s, f) : undefined, double);

  // Your own: made men, the house, and the outside guys of your regimes.
  const outsideOurs = c.faction === 'none' && !!c.outside && c.outside !== 'cop' && c.outside !== 'politician' && !!c.capoId && s.characters[c.capoId]?.faction === 'player';
  if (c.faction === 'player' || outsideOurs || (c.dynasty && c.faction === 'none')) {
    let double: Side['double'];
    if (c.informantFor && c.informantFor !== 'player' && knownInformant(s, c)) {
      const st = c.informantFor === 'law' ? SIDE_STYLE.law : familyStyle(s, c.informantFor);
      double = { factionId: c.informantFor, text: c.informantFor === 'law' ? 'talks to the law' : `talks to ${st.label.replace(/^The/, 'the')}`, label: st.label, color: st.color, emblem: st.emblem };
    }
    return make(SIDE_STYLE.player, 'yours', 'player', double);
  }

  // Another family (or Philadelphia).
  if (isFamily(c.faction)) {
    const st = familyStyle(s, c.faction);
    let double: Side['double'];
    if (c.informantFor === 'player' && knownInformant(s, c)) double = payroll('on your payroll');
    else if (c.informantFor && c.informantFor !== c.faction && knownInformant(s, c)) {
      const o = c.informantFor === 'law' ? SIDE_STYLE.law : familyStyle(s, c.informantFor);
      double = { factionId: c.informantFor, text: c.informantFor === 'law' ? 'talks to the law' : `talks to ${o.label.replace(/^The/, 'the')}`, label: o.label, color: o.color, emblem: o.emblem };
    }
    return make(st, c.faction === 'philly' ? 'philly' : 'rival', c.faction, double);
  }

  // The law, officials, the nightlife, civilians.
  const off = c.office ?? '';
  const ctl = polCtlOf(s, c.id);
  const onPad = c.outside === 'cop' || c.outside === 'politician' || !!ctl?.payroll;
  const padNote = onPad ? payroll('on your payroll') : undefined;
  if (c.faction === 'law' || c.outside === 'cop' || POLICE.test(off) || LAW.test(off)) {
    const police = c.outside === 'cop' || POLICE.test(off);
    return make({ ...SIDE_STYLE.law, label: police ? 'Police' : 'The Law', short: police ? 'POLICE' : 'LAW' }, 'law', 'law', padNote);
  }
  if (c.outside === 'politician' || OFFICIAL.test(off) || ctl) return make(SIDE_STYLE.official, 'official', 'none', padNote);
  const p = s.nightlife?.people[c.id];
  if (p) return make(SIDE_STYLE.nightlife, 'nightlife', 'none', p.payroll ? payroll('on your payroll') : undefined);
  // A civilian married or born into a family: still a civilian, but his family's colours.
  const kin = kinFaction(s, c);
  if (kin) {
    const st = kin === 'player' ? SIDE_STYLE.player : familyStyle(s, kin);
    const fam = st.label.replace(/^The | family$/g, '');
    return mk({ ...st, label: kin === 'player' ? 'Kin of your family' : `Kin of the ${fam} family`.replace('the Philadelphia family', 'Philadelphia'), short: kin === 'player' ? 'YOUR KIN' : `${st.short} KIN` }, 'civilian', 'none');
  }
  return make(SIDE_STYLE.none, 'civilian', 'none');
}

/** An official from the City Hall registry (who may not be a full character). */
export function sideOfPol(s: GameState, polId: string): Side {
  const p = s.pol?.people[polId];
  if (p?.charId && s.characters[p.charId]) return sideOf(s, p.charId);
  const ctl = s.pol?.ctl[polId];
  return mk(SIDE_STYLE.official, 'official', 'none', undefined, ctl?.payroll ? payroll('on your payroll') : undefined);
}

function payroll(text: string): NonNullable<Side['double']> {
  const st = SIDE_STYLE.player;
  return { factionId: 'player', text, label: st.label, color: st.color, emblem: st.emblem };
}

function mk(st: SideStyle, kind: SideKind, factionId: FactionId, relation?: SideRelation, double?: Side['double']): Side {
  const who = kind === 'yours' ? 'Your man' : kind === 'rival' || kind === 'philly' ? `${st.label.replace(/^The | family$/g, '')} man` : st.label;
  return {
    kind, factionId, label: st.label, short: st.short, color: st.color, emblem: st.emblem, initial: st.initial, relation, double,
    full: double ? `${who} — ${double.text}` : st.label,
  };
}

/* ---------------- grouping and filtering ---------------- */

export type SideFilter = 'mine' | 'theirs' | 'all';
export const SIDE_FILTER_LABEL: Record<SideFilter, string> = { mine: 'Mine', theirs: 'Theirs', all: 'Everyone' };

/** Mine = your people; Theirs = everyone else; Everyone = no filter. */
export function sideMatches(side: Side, f: SideFilter): boolean {
  return f === 'all' ? true : f === 'mine' ? side.kind === 'yours' : side.kind !== 'yours';
}

export interface SideGroup { key: string; label: string; side: Side; ids: string[] }

const KIND_ORDER: Record<SideKind, number> = { yours: 0, rival: 1, philly: 2, law: 3, official: 4, nightlife: 5, civilian: 6 };

/** Ids grouped by side: your family first, then each rival family, Philadelphia, the law, officials, nightlife, civilians. */
export function groupBySide(s: GameState, ids: readonly string[]): SideGroup[] {
  const groups = new Map<string, SideGroup>();
  for (const id of ids) {
    const side = sideOf(s, id);
    const key = side.kind === 'rival' || side.kind === 'philly' ? `${side.kind}:${side.factionId}` : side.kind;
    const g = groups.get(key) ?? { key, label: side.kind === 'civilian' ? 'Civilians' : side.kind === 'law' ? 'The Law' : side.kind === 'yours' ? 'Your family' : side.label, side, ids: [] };
    g.ids.push(id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => KIND_ORDER[a.side.kind] - KIND_ORDER[b.side.kind] || a.label.localeCompare(b.label));
}

/* ---------------- grouping by family (the people ledger, the hit picker) ---------------- */

/** The family/faction group of a person, in the ledger's order (PEOPLE_LEDGER §1). */
export const GROUP_ORDER = ['yours', 'manno', 'feldstein', 'kessler', 'philly', 'law', 'town', 'other'] as const;
export type PeopleGroup = (typeof GROUP_ORDER)[number];
export const GROUP_NAME: Record<PeopleGroup, string> = {
  yours: 'Your family', manno: 'The Manno family', feldstein: 'The Feldstein family', kessler: 'The Kessler family', philly: 'Philadelphia',
  law: 'The law', town: 'The town: officials, the night, civilians', other: 'Others',
};

export function groupOf(s: GameState, id: string, side = sideOf(s, id)): PeopleGroup {
  if (side.kind === 'yours') return 'yours';
  if (side.kind === 'rival' || side.kind === 'philly') return (GROUP_ORDER as readonly string[]).includes(side.factionId) ? side.factionId as PeopleGroup : 'other';
  if (side.kind === 'law') return 'law';
  return 'town';
}

/* ---------------- plotting warnings ---------------- */

export interface PlotWarning { tone: 'bad' | 'warn'; text: string; who?: string }

/** What the boss should be told before plotting with these agents against this target. */
export function plotWarnings(s: GameState, hostile: boolean, targetId: string | undefined, agentIds: readonly string[]): PlotWarning[] {
  const out: PlotWarning[] = [];
  const t = targetId ? s.characters[targetId] : undefined;
  if (t && targetId !== s.playerId) {
    const ts = sideOf(s, t.id);
    const he = t.gender === 'F' ? 'she' : 'he';
    if (ts.kind === 'yours' && hostile) {
      out.push({ tone: 'bad', who: t.id, text: `${t.gender === 'F' ? 'This is one of your own' : 'This is your own man'} — plotting against ${t.gender === 'F' ? 'her' : 'him'} is a betrayal. If it gets out, your crew will wonder who is next.` });
    } else if (ts.double?.factionId === 'player' && hostile) {
      out.push({ tone: 'warn', who: t.id, text: `${ts.full}: ${he} is useful to you where ${he} is.` });
    }
  }
  for (const id of agentIds) {
    const a = s.characters[id];
    if (!a || id === s.playerId) continue;
    const as = sideOf(s, id);
    const fam = (lbl: string) => lbl.replace(/^The | family$/g, '');
    if (as.kind !== 'yours') {
      out.push({ tone: 'warn', who: id, text: `${a.firstName} ${a.lastName} is ${as.kind === 'rival' || as.kind === 'philly' ? `a ${fam(as.label)} man` : `not one of yours (${as.label})`} — ${a.gender === 'F' ? 'she' : 'he'} may sell you out.` });
    } else if (as.double && as.double.factionId !== 'player') {
      out.push({ tone: 'bad', who: id, text: `${a.firstName} ${a.lastName} ${as.double.text} — he may sell you out.` });
    }
  }
  return out;
}

/* ---------------- who you can plot against ---------------- */

/** Schemes aimed at one person, as the target picker offers them. */
export const TARGETED_SCHEMES = ['murder', 'blackmail', 'informant', 'befriend', 'sway'] as const;
export type TargetedScheme = (typeof TARGETED_SCHEMES)[number];

/**
 * The people the boss could plot against, grouped by side (your family, each
 * rival family, Philadelphia, the law, officials, nightlife, civilians).
 * Grown, living, in the world; turning an informant only makes sense inside
 * another family. Civilians appear only when they matter (an office, a
 * job for somebody, a known secret).
 */
export function plotTargets(s: GameState, kind: TargetedScheme, filter: SideFilter = 'all'): SideGroup[] {
  const known = new Set(s.secrets.filter((x) => x.knownBy.includes('player')).map((x) => x.ownerId));
  const ids: string[] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.alive || id === s.playerId || s.date.y - c.birth.y < 18) continue;
    const side = sideOf(s, id);
    if (!sideMatches(side, filter)) continue;
    if (kind === 'informant' && side.kind !== 'rival' && side.kind !== 'philly') continue;
    if (kind === 'blackmail' && !known.has(id)) continue;
    if (side.kind === 'civilian' && !c.office && !c.outside && !c.dynasty && !known.has(id)) continue;
    if (side.kind === 'nightlife' && kind === 'informant') continue;
    ids.push(id);
  }
  const RANK_ORDER: Record<string, number> = { boss: 0, underboss: 1, consigliere: 2, capo: 3, soldier: 4, associate: 5, civilian: 6 };
  ids.sort((a, b) => RANK_ORDER[s.characters[a].rank] - RANK_ORDER[s.characters[b].rank] || s.characters[a].lastName.localeCompare(s.characters[b].lastName));
  return groupBySide(s, ids);
}

export interface FamilyGroup {
  key: PeopleGroup;
  label: string;
  /** The side of the group's first man (its colour and emblem). */
  side: Side;
  ids: string[];
  /** For a hit: officials and the law, off limits by Philadelphia's rule (shown, not offered). */
  protectedIds: string[];
}

/**
 * THE HIT PICKER's targets (STREAMLINE_2 §3.4): the same people as
 * plotTargets, grouped by family in a fixed order: Your Family, Manno,
 * Feldstein, Kessler, Philadelphia, the law, the town, others.
 */
export function plotTargetsByFamily(s: GameState, kind: TargetedScheme, filter: SideFilter = 'all'): FamilyGroup[] {
  const by = new Map<PeopleGroup, string[]>();
  for (const g of plotTargets(s, kind, filter)) {
    for (const id of g.ids) {
      const k = groupOf(s, id);
      (by.get(k) ?? by.set(k, []).get(k)!).push(id);
    }
  }
  const leaders = new Set(s.rivals.map((r) => r.leaderId));
  return GROUP_ORDER.filter((k) => by.has(k)).map((k) => {
    const ids = by.get(k)!.sort((a, b) => Number(leaders.has(b)) - Number(leaders.has(a)));
    return {
      key: k,
      label: s.rivals.find((r) => r.id === k)?.name ?? GROUP_NAME[k],
      side: sideOf(s, ids[0]),
      ids,
      protectedIds: kind === 'murder' ? ids.filter((id) => !!s.characters[id].office || s.characters[id].faction === 'law') : [],
    };
  });
}
