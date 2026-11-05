import { formatDate } from '../calendar';
import { DAILY } from '../paper';
import { hashSeed } from '../rng';
import type { GameDate, GameState } from '../types';
import { badCharNames, clean, inventedNames, strangeMoney, unfit, vocab } from './guard';

/**
 * THE LIVING NEWSPAPER. Each week's real events, read in the paper's voice:
 * the engine gathers the FACTS (the stories the Daily Tide and the Weekly
 * Leader actually printed that week, never the spiked ones, and the notable
 * lines of the week's report: arrests, wars, openings, deaths, storms, big
 * scores, scandals, marked as unconfirmed talk), and Claude may set them as
 * one front page: a headline, three to five short stories, a gossip item, a
 * sports/boardwalk item and, now and then, a reader's letter that spins the
 * week the way some family would like it read. Strictly from the facts:
 * `validatePage` throws out any name, figure or story that was not supplied,
 * anything explicit, real people, film lines. Without Claude (or when the
 * page fails) the engine's own text is set in the same page (`enginePage`).
 * Pure: nothing here touches the save; the UI caches the page per week.
 */

export type FactKind = 'front' | 'blotter' | 'wire' | 'business' | 'society' | 'editorial' | 'sports' | 'spout' | 'week';

export interface Fact {
  /** "f3": what a story cites. */
  id: string;
  kind: FactKind;
  h?: string;
  b: string;
  /** 'paper': printed, public. 'talk': from the week's report, unconfirmed (gossip only, no last names). */
  src: 'paper' | 'talk';
}

export interface PaperBrief {
  week: number;
  date: GameDate;
  facts: Fact[];
  /** All the facts as text (what the prompt carries). */
  text: string;
  /** The printed facts only (names may come from here). */
  printed: string;
}

export interface PageStory { h: string; b: string; facts: string[] }
export interface FrontPage {
  headline: string;
  deck?: string;
  stories: PageStory[];
  gossip: { h?: string; b: string };
  sports: { h: string; b: string };
  letter?: { from: string; b: string };
  by: 'claude' | 'paper';
}

export const CAP = { headline: 80, deck: 260, h: 80, b: 480, gossip: 380, sports: 320, letter: 380, from: 60 } as const;
export const STORIES = { min: 3, max: 5 } as const;
const MAX_FACTS = 26;

const NOTABLE = /\b(arrest\w*|jail\w*|custody|pinch\w*|indict\w*|war|wars|shot|shooting|kill\w*|died|dies|dead|death|funeral|body|buried|open(ed|s)?|storm|hurricane|nor'?easter|flood\w*|raid\w*|scandal\w*|wedding|married|christen\w*|fire|burn\w*|elect\w*|score|robbed|robbery|fined|trial|verdict|seen dining|muscles|pushes into)\b/i;

/** The weeks the papers have something for (newest first). */
export function paperWeeks(s: GameState): number[] {
  return [...new Set((s.paper?.eds ?? []).map((e) => e.week))].sort((a, b) => b - a);
}

/** What the papers printed in a week, and the week's notable talk. Undefined when nothing was printed. */
export function paperBrief(s: GameState, week = paperWeeks(s)[0]): PaperBrief | undefined {
  const eds = (s.paper?.eds ?? []).filter((e) => e.week === week);
  if (week === undefined || !eds.length) return undefined;
  const seen = new Set<string>();
  const pool: { kind: FactKind; h?: string; b: string; p: number }[] = [];
  const RANK: Partial<Record<string, number>> = { front: 100, feature: 90, blotter: 80, wire: 70, business: 60, society: 55, editorial: 40, review: 35, sports: 30, spout: 20 };
  for (const e of eds) {
    for (const it of e.items) {
      if (it.sp || it.ad || it.src) continue;
      const kind: FactKind | undefined = it.s === 'feature' ? 'front' : it.s === 'review' ? 'editorial' : (['front', 'blotter', 'wire', 'business', 'society', 'editorial', 'sports', 'spout'] as const).find((k) => k === it.s);
      if (!kind) continue;
      const b = clean(it.b, 400);
      // The same race result or the same call printed twice is one fact.
      const key = (it.s === 'sports' && it.h ? `sports|${it.h}` : `${it.h ?? ''}|${b}`).toLowerCase();
      if (!b || seen.has(key)) continue;
      seen.add(key);
      pool.push({ kind, h: it.h ? clean(it.h, 100) : undefined, b, p: (RANK[it.s] ?? 10) + (it.p ?? 0) / 10 });
    }
  }
  // Keep the variety: at most 3 sports results and 3 call-ins; the rest by weight.
  pool.sort((a, b) => b.p - a.p);
  const n: Partial<Record<FactKind, number>> = {};
  const facts: Fact[] = [];
  for (const x of pool) {
    const lim = x.kind === 'sports' || x.kind === 'spout' ? 3 : 8;
    if ((n[x.kind] ?? 0) >= lim || facts.length >= MAX_FACTS - 6) continue;
    n[x.kind] = (n[x.kind] ?? 0) + 1;
    facts.push({ id: `f${facts.length + 1}`, kind: x.kind, h: x.h, b: x.b, src: 'paper' });
  }
  // The week's report (what happened that week; the papers print the week before).
  const rep = s.lastReport && s.lastReport.week === week - 1 ? s.lastReport : undefined;
  // Only what the town could have seen: no lines in the boss's own words ("you", "your"), no tallies.
  const townSaw = (x: string) => NOTABLE.test(x) && !/\b(you|your|yours)\b/i.test(x) && !/^(Era|Goal|Skill)\b/i.test(x) && !/[+−-]\d/.test(x);
  for (const l of (rep?.log ?? []).filter(townSaw).slice(0, 6)) {
    facts.push({ id: `f${facts.length + 1}`, kind: 'week', b: clean(l.replace(/^\[[^\]]*\]\s*/, ''), 240), src: 'talk' });
  }
  const line = (f: Fact) => `${f.id} [${f.kind === 'week' ? 'talk around town, unconfirmed' : f.kind}] ${f.h ? `${f.h}: ` : ''}${f.b}`;
  const date = eds[0].date;
  return {
    week, date, facts,
    text: facts.map(line).join('\n'),
    printed: facts.filter((f) => f.src === 'paper').map(line).join('\n'),
  };
}

/* ------------------------------------------------------------------ */
/* The engine's own page (no Claude)                                    */
/* ------------------------------------------------------------------ */

export function enginePage(b: PaperBrief): FrontPage {
  const printed = b.facts.filter((f) => f.src === 'paper');
  const lead = printed.find((f) => f.kind === 'front' && f.h) ?? printed.find((f) => f.h && f.kind !== 'sports' && f.kind !== 'spout');
  const newsy = printed.filter((f) => f !== lead && ['front', 'blotter', 'wire', 'business', 'society', 'editorial'].includes(f.kind));
  const stories: PageStory[] = newsy.slice(0, STORIES.max).map((f) => ({ h: f.h ?? defaultHead(f.kind), b: f.b, facts: [f.id] }));
  for (const f of b.facts.filter((x) => x.src === 'talk')) {
    if (stories.length >= STORIES.min) break;
    stories.push({ h: 'Around Town', b: f.b, facts: [f.id] });
  }
  while (stories.length < STORIES.min) stories.push({ h: 'All Quiet', b: 'Nothing else of note reached the city desk this week.', facts: [] });
  const spout = printed.find((f) => f.kind === 'spout');
  const sport = printed.find((f) => f.kind === 'sports');
  return {
    headline: (lead?.h ?? 'ANOTHER WEEK ON THE ISLAND').toUpperCase(),
    deck: lead ? lead.b : undefined,
    stories,
    gossip: spout ? { h: 'Heard on the Boardwalk', b: `"${spout.b}"` } : { h: 'Heard on the Boardwalk', b: 'The switchboard was quiet this week.' },
    sports: sport ? { h: sport.h ?? 'Sports', b: sport.b } : { h: 'On the Boardwalk', b: 'No results came in to the sports desk this week.' },
    by: 'paper',
  };
}

function defaultHead(k: FactKind): string {
  return ({ blotter: 'Police Blotter', wire: 'From the Wire', business: 'Business', society: 'Society', editorial: 'The Editor Says', front: 'The News' } as Partial<Record<FactKind, string>>)[k] ?? 'The News';
}

/* ------------------------------------------------------------------ */
/* The prompt                                                          */
/* ------------------------------------------------------------------ */

const RULES = `You are the night editor of ${DAILY}, the small-town daily of Wildwood, New Jersey, in the summer resort era around 1960 (a fictional town paper in a fictional game). Set this week's front page from the FACTS below, in the paper's period voice: brisk, a little breathless, small-town proud, careful about the law (say "alleged", "police said", "a man known to police").

Rules:
- Use ONLY the facts given. Every story cites the fact ids it comes from. Invent no events, no people, no places, no businesses, no quotes, no numbers.
- Names: only names that appear in the facts marked as printed. Facts marked "talk around town, unconfirmed" may appear ONLY in the gossip column, and then without naming anyone ("a certain Pacific Avenue gentleman").
- Everyone is fictional: never name real people, real crime families, real companies or films; no movie lines.
- Violence only implied ("a man was found", "shots were reported"), never described; nothing sexual or explicit; never instructions for any crime.
- Lengths: headline at most 80 characters, in capitals; 3 to 5 stories, each a headline and 1 to 3 sentences (under 480 characters); gossip under 380 characters; sports under 320.
- "letter" is optional: one reader's letter to the editor, signed with a pen name only (e.g. "A Pacific Avenue Merchant"), spinning the week's facts the way some family would like them read, never naming a family.
Reply with ONLY one JSON object:
{"headline": string, "deck": string (optional, one line under the headline), "stories": [{"h": string, "b": string, "facts": ["f1", ...]}], "gossip": {"h": string, "b": string}, "sports": {"h": string, "b": string}, "letter": {"from": string, "b": string} (optional)}`;

export function paperPrompt(s: GameState, b: PaperBrief): { role: 'user'; content: string }[] {
  return [{ role: 'user', content: `${RULES}\n\nThe edition: ${formatDate(b.date)}, week ${b.week}.\n\nFACTS:\n${b.text}` }];
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

type V = { ok: true; page: FrontPage } | { ok: false; why: string };

export function validatePage(s: GameState, raw: unknown, b: PaperBrief): V {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, why: 'not an object' };
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, max: number, need = true): string | undefined | false => {
    if (v === undefined || v === null || v === '') return need ? false : undefined;
    if (typeof v !== 'string') return false;
    const t = clean(v, max + 40);
    if ((need && !t) || t.length > max) return false;
    return t;
  };
  const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
  const headline = str(o.headline, CAP.headline);
  if (!headline) return { ok: false, why: 'headline' };
  const deck = str(o.deck, CAP.deck, false);
  if (deck === false) return { ok: false, why: 'deck' };
  if (!Array.isArray(o.stories) || o.stories.length < STORIES.min || o.stories.length > STORIES.max) return { ok: false, why: 'stories' };
  const ids = new Set(b.facts.map((f) => f.id));
  const printedIds = new Set(b.facts.filter((f) => f.src === 'paper').map((f) => f.id));
  const stories: PageStory[] = [];
  for (const x of o.stories) {
    const st = obj(x);
    const h = st && str(st.h, CAP.h);
    const body = st && str(st.b, CAP.b);
    if (!st || !h || !body) return { ok: false, why: 'story text' };
    const facts = Array.isArray(st.facts) ? st.facts.filter((f): f is string => typeof f === 'string') : [];
    if (!facts.length || facts.some((f) => !ids.has(f))) return { ok: false, why: 'story facts' };
    // A story stands on something printed; talk alone is for the gossip column.
    if (!facts.some((f) => printedIds.has(f))) return { ok: false, why: 'story from talk only' };
    stories.push({ h, b: body, facts: [...new Set(facts)] });
  }
  const g = obj(o.gossip);
  const gh = g && str(g.h, CAP.h, false);
  const gb = g && str(g.b, CAP.gossip);
  if (!g || gh === false || !gb) return { ok: false, why: 'gossip' };
  const sp = obj(o.sports);
  const sh = sp && str(sp.h, CAP.h);
  const sb = sp && str(sp.b, CAP.sports);
  if (!sp || !sh || !sb) return { ok: false, why: 'sports' };
  let letter: FrontPage['letter'];
  if (o.letter !== undefined && o.letter !== null) {
    const l = obj(o.letter);
    const lf = l && str(l.from, CAP.from);
    const lb = l && str(l.b, CAP.letter);
    if (!l || !lf || !lb) return { ok: false, why: 'letter' };
    letter = { from: lf, b: lb };
  }
  // The words: nothing explicit or real, no name or figure that was not printed.
  const printed = vocab(b.printed);
  const all = vocab(b.text);
  const texts = [headline, deck ?? '', ...stories.flatMap((x) => [x.h, x.b]), gh ?? '', gb, sh, sb, letter?.from ?? '', letter?.b ?? ''];
  for (const t of texts) {
    if (!t) continue;
    const bad = unfit(t, all);
    if (bad) return { ok: false, why: bad };
    const inv = inventedNames(t, printed);
    if (inv.length) return { ok: false, why: `names not printed: ${inv.join(', ')}` };
    const who = badCharNames(s, t, new Set(), printed);
    if (who.length) return { ok: false, why: `people not printed: ${who.join(', ')}` };
    const cash = strangeMoney(t, b.text);
    if (cash.length) return { ok: false, why: `figures not given: ${cash.join(', ')}` };
  }
  return { ok: true, page: { headline: headline.toUpperCase(), deck: deck || undefined, stories, gossip: { h: gh || undefined, b: gb }, sports: { h: sh, b: sb }, letter, by: 'claude' } };
}

/** The cache key for a week's page (UI storage; never the save). */
export function pageKey(s: GameState, week: number): string {
  return `llv.paperVoice.${hashSeed(s.seed).toString(36)}.${week}`;
}
