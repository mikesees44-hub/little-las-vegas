import { HOODS_BY_ID } from './hoodData';
import { factSeen, memText, seenFacts, seenText, type Seen } from './livingKnow';
import { knownStories, type StoryView } from './livingStory';
import { ageOf, pname, present, type LivingState, type Tf, type Tp } from './livingState';
import { districtTotals, GOAL_WORDS, lenderName, type DistrictTotals } from './livingWorld';
import { USES_BY_ID } from './property';
import type { GameState } from './types';

/**
 * WHAT THE BOSS SEES OF THE DISTRICT (projections for the screens). Every
 * function here reads the truth and returns only what is public or what the
 * boss has learned through a channel (livingKnow.ts). A man's plan, his debts,
 * his grudges, a skim, an affair: absent unless a fact about it reached the
 * boss, and labeled with how sure he is and who told him.
 */

export interface KnownFact { id: string; w: number; text: string; seen: Seen; who: string[] }

function kf(f: Tf, seen: Seen): KnownFact {
  return { id: f.id, w: f.w, text: seenText(f, seen), seen, who: f.a.filter((x) => x.startsWith('tp')) };
}

export interface DistrictView {
  hood: string;
  name: string;
  totals: DistrictTotals;
  stories: StoryView[];
  facts: KnownFact[];
  /** Requests the capo brought this year. */
  asked: number;
}

export function districtView(s: GameState, limit = 80): DistrictView | undefined {
  const L = s.living;
  if (!L) return undefined;
  const hood = L.hoods[0];
  return {
    hood,
    name: HOODS_BY_ID[hood].name,
    totals: districtTotals(s, L, hood),
    stories: knownStories(s, 24),
    facts: seenFacts(s, limit).map(({ f, seen }) => kf(f, seen)),
    asked: L.stories.filter((st) => st.ask && s.week - st.ask.w < 52).length,
  };
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export interface PersonRow {
  id: string;
  name: string;
  age: number;
  /** What anyone could say: "owns the Seashell Souvenir Emporium", "works at Pete's", "keeps house". */
  role: string;
  hh: string;
  /** The boss knows something of him beyond the public record. */
  known: number;
  /** He has asked the boss for help, or the boss has helped him. */
  dealt: boolean;
}

function lotName(s: GameState, id: string): string {
  const l = s.econ?.lots.find((x) => x.id === id);
  return l?.name ?? (l?.use ? USES_BY_ID[l.use]?.name : undefined) ?? 'a place on the Boardwalk';
}

/** Public: what he does for a living (the ownership of a place is on the deed; employment is no secret). */
export function publicRole(s: GameState, L: LivingState, p: Tp): string {
  const a = ageOf(p, s.date.y, s.date.m);
  if (p.dead) return `died ${p.dead[0]}`;
  if (p.left !== undefined) return 'left the island';
  if (p.away && p.away.until > s.week) return `away (${p.away.why})`;
  const owns = Object.values(L.biz).filter((b) => b.owner === p.id).map((b) => lotName(s, b.lot));
  if (owns.length) return `owns ${owns.slice(0, 2).join(' and ')}${owns.length > 2 ? ` and ${owns.length - 2} more` : ''}`;
  if (a < 6) return 'a little one';
  if (p.job === 'school') return 'in school';
  if (p.job === 'home') return 'keeps the house';
  if (p.job === 'retired') return 'retired';
  if (p.job === 'out') return 'works off the island';
  if (p.job) return `works at ${lotName(s, p.job)}`;
  return a >= 66 ? 'retired' : 'out of work';
}

function knownCount(s: GameState, L: LivingState, pid: string): number {
  let n = 0;
  for (const f of L.facts) if (f.sec > 0 && f.a.includes(pid) && factSeen(s, f)) n++;
  return n;
}

export function peopleRows(s: GameState): PersonRow[] {
  const L = s.living;
  if (!L) return [];
  const out: PersonRow[] = [];
  const owners = new Set(Object.values(L.biz).map((b) => b.owner));
  const inStories = new Set(knownStories(s, 40).flatMap((v) => v.cast));
  for (const id in L.people) {
    const p = L.people[id];
    if (!present(p, s.week)) continue;
    const a = ageOf(p, s.date.y, s.date.m);
    if (a < 18) continue;
    const known = knownCount(s, L, id);
    const dealt = !!p.ties[s.playerId];
    if (!owners.has(id) && !inStories.has(id) && !known && !dealt) continue;
    out.push({ id, name: pname(p), age: a, role: publicRole(s, L, p), hh: L.hh[p.hh]?.name ?? '', known, dealt });
  }
  return out.sort((x, y) => Number(y.dealt) - Number(x.dealt) || y.known - x.known || x.name.localeCompare(y.name));
}

export interface PersonView {
  id: string;
  name: string;
  g: 'M' | 'F';
  age: number;
  role: string;
  home: string;
  household: { id: string; name: string; age: number; word: string; role: string }[];
  /** His goal, if the boss has reason to know it (he confided it, or a known fact shows it). */
  goal?: string;
  /** A plan the boss has heard of (with how sure he is). */
  plan?: { text: string; seen: Seen };
  /** Ties the boss knows of: family (public), money (from facts he knows), bad blood (from facts he knows). */
  ties: { id: string; name: string; what: string; how: 'public' | 'rumor' | 'confirmed' }[];
  facts: KnownFact[];
  /** What he thinks of the boss, in words (only if they have dealt with each other). */
  toBoss?: string;
  /** Hidden truth for the developer inspector (Settings → Show internal ids) only. */
  dev?: { cash: number; stash: number; goal?: string; plan?: string; traits: number[]; mem: string[] };
}

const KIN_ORDER = ['husband', 'wife', 'father', 'mother', 'son', 'daughter', 'brother', 'sister'];

export function personView(s: GameState, pid: string, dev = false): PersonView | undefined {
  const L = s.living;
  const p = L?.people[pid];
  if (!L || !p) return undefined;
  const hh = L.hh[p.hh];
  const household = (hh?.members ?? []).filter((id) => id !== pid).map((id) => L.people[id]).filter((q): q is Tp => !!q && !q.dead && q.left === undefined)
    .map((q) => ({ id: q.id, name: pname(q), age: ageOf(q, s.date.y, s.date.m), word: p.ties[q.id]?.k ?? 'lives with them', role: publicRole(s, L, q) }))
    .sort((a, b) => (KIN_ORDER.indexOf(a.word) + 99) % 99 - (KIN_ORDER.indexOf(b.word) + 99) % 99 || b.age - a.age);
  const facts: KnownFact[] = [];
  for (let i = L.facts.length - 1; i >= 0 && facts.length < 20; i--) {
    const f = L.facts[i];
    if (!f.a.includes(pid)) continue;
    const seen = factSeen(s, f);
    if (seen) facts.push(kf(f, seen));
  }
  // Ties: family is public; money and bad blood only from what the boss knows.
  const ties: PersonView['ties'] = [];
  for (const [id, t] of Object.entries(p.ties)) {
    if (!t.k || id === 'patron') continue;
    const q = L.people[id];
    if (!q || hh?.members.includes(id)) continue;
    ties.push({ id, name: pname(q), what: `${t.k}${q.dead ? ' (died)' : q.left !== undefined ? ' (left the island)' : ''}`, how: 'public' });
  }
  for (const d of L.debts) {
    if (d.by !== pid && d.lender !== pid) continue;
    const f = L.facts.find((x) => x.id === d.fid);
    const seen = f ? factSeen(s, f) : undefined;
    if (!seen) continue;
    const other = d.by === pid ? lenderName(s, L, d) : pname(L.people[d.by]);
    const otherId = d.by === pid ? d.lender : d.by;
    ties.push({ id: otherId, name: other, what: d.by === pid ? `borrowed $${d.amt} from` : `lent $${d.amt} to`, how: seen.lvl === 'public' ? 'public' : seen.lvl });
  }
  for (const f of facts) {
    const full = L.facts.find((x) => x.id === f.id);
    if (!full || (full.k !== 'grudge' && full.k !== 'skim_caught' && full.k !== 'affair_out' && full.k !== 'revenge')) continue;
    for (const id of full.a) if (id !== pid && L.people[id]) ties.push({ id, name: pname(L.people[id]), what: 'bad blood with', how: f.seen.lvl === 'public' ? 'public' : f.seen.lvl });
  }
  // A plan he is known to have: the fact that started it reached the boss.
  let plan: PersonView['plan'];
  if (p.plan?.fid) {
    const f = L.facts.find((x) => x.id === p.plan!.fid);
    const seen = f ? factSeen(s, f) : undefined;
    if (f && seen) plan = { text: seenText(f, seen), seen };
  }
  const tb = p.ties[s.playerId];
  // He told the boss what he wants when they dealt with each other; otherwise it shows in what the boss has heard.
  const goal = p.goal && (tb || plan) ? GOAL_WORDS[p.goal] : undefined;
  return {
    id: pid, name: pname(p), g: p.g, age: ageOf(p, s.date.y, s.date.m), role: publicRole(s, L, p), home: hh?.home ?? '', household, goal, plan, ties, facts,
    ...(tb ? { toBoss: tb.a >= 30 ? 'grateful to you' : tb.a <= -10 ? `bitter: you turned ${p.g === 'F' ? 'her' : 'him'} away` : 'knows you' } : {}),
    ...(dev ? { dev: { cash: hh?.cash ?? 0, stash: p.stash, goal: p.goal, plan: p.plan ? `${p.plan.k} (stage ${p.plan.stage}): ${p.plan.why}` : undefined, traits: [...p.t], mem: p.mem.map((m) => memText(L, m) ?? '').filter(Boolean) } } : {}),
  };
}

/** For a character's sheet: what the boss knows of his dealings with the district's people (loans at the vig, errands, settlements). */
export function characterDealings(s: GameState, charId: string, limit = 8): KnownFact[] {
  const L = s.living;
  if (!L) return [];
  const out: KnownFact[] = [];
  for (let i = L.facts.length - 1; i >= 0 && out.length < limit; i--) {
    const f = L.facts[i];
    if (!f.a.includes(charId)) continue;
    const seen = factSeen(s, f);
    if (seen) out.push(kf(f, seen));
  }
  return out;
}

/** The household of a person as the boss would describe it (for the request card and the sheet). */
export function householdLine(s: GameState, pid: string): string {
  const v = personView(s, pid);
  if (!v) return '';
  return v.household.map((h) => `${h.name} (${h.word}, ${h.age})`).join(', ');
}
