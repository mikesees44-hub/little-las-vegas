import { dateOfWeek, formatDate } from './calendar';
import type { Ctx } from './ledger';
import type { ChronicleEntry, GameState, PlayerAction, ReportLine, WeeklyReport } from './types';

/**
 * THE BOOK: the one place the boss keeps track of everything. Every order he
 * gave and what came of it, the week's report, the chronicle, the papers, the
 * night, the talk, what his people will remember, the money: one entry per
 * fact, with who it was about, where, what it cost, and what it followed from.
 *
 * Any system can write to it with ONE call, `journal(s, entry)`. Systems that
 * only write to the usual places (ctx.log, the chronicle, the news, their own
 * logs) are picked up anyway at the end of the week (`bookWeek`), and a system
 * with its own log can be read in with `registerBookSource` — so a new system
 * shows up in the Book without anybody editing it.
 *
 * Storage is bounded: the last BOOK_WEEKS weeks are kept entry by entry, older
 * weeks fold into one line each (counts, money, the headline, who). Optional
 * state: an old save has none until its first week turns (the screen backfills
 * from the chronicle meanwhile). Deterministic: ids come from a counter.
 */

export type JCat =
  | 'money' | 'crew' | 'family' | 'romance' | 'rivals' | 'law' | 'property'
  | 'rackets' | 'politics' | 'travel' | 'paper' | 'intrigue' | 'town';

export const JCATS: JCat[] = ['money', 'crew', 'family', 'romance', 'rivals', 'law', 'property', 'rackets', 'politics', 'travel', 'paper', 'intrigue', 'town'];

export const JCAT_INFO: Record<JCat, { label: string; glyph: string; route: string }> = {
  money: { label: 'Money', glyph: '$', route: 'money' },
  crew: { label: 'Crew', glyph: '⚑', route: 'council' },
  family: { label: 'Family', glyph: '♔', route: 'family' },
  romance: { label: 'Romance & night', glyph: '☾', route: 'nightlife' },
  rivals: { label: 'Rivals', glyph: '♞', route: 'rivals' },
  law: { label: 'Law & heat', glyph: '§', route: 'law' },
  property: { label: 'Property', glyph: '▣', route: 'realestate' },
  rackets: { label: 'Rackets', glyph: '♣', route: 'rackethub' },
  politics: { label: 'Politics', glyph: '⌸', route: 'cityhall' },
  travel: { label: 'Travel', glyph: '✈', route: 'travel' },
  paper: { label: 'The papers', glyph: '✎', route: 'papers' },
  intrigue: { label: 'Intrigue', glyph: '◐', route: 'schemes' },
  town: { label: 'The town', glyph: '⌂', route: 'happening' },
};

/** One fact in the Book. Short keys: the save keeps a few hundred of these. */
export interface JEntry {
  id: string;
  /** Absolute week. */
  w: number;
  /** Day of the week, 0 Monday … 6 Sunday, when known (undefined: when the week turned). */
  d?: number;
  /** A time of day in words ("late"), when a system knows it. */
  tm?: string;
  c: JCat;
  /** The headline. */
  t: string;
  /** More words. */
  x?: string;
  /** People (character ids). */
  p?: string[];
  /** Places: 'b:<business>' · 'l:<lot>' · 'd:<district>' · 'v:<venue name>' · 'w:<worked place>'. */
  pl?: string[];
  /** Money that moved (Family money and the pocket together). */
  m?: number;
  /** Respect and heat that moved. */
  st?: Partial<Record<'respect' | 'local' | 'family' | 'federal', number>>;
  /** The system that wrote it ('order', 'decision', 'report', 'chronicle', 'nightlife', …). */
  src: string;
  /** A route to open (a tab id or 'panel.section'); else one is picked from the category. */
  ln?: string;
  /** The order this is the outcome of ('o<week>.<n>'). */
  o?: string;
  /** An order's result lines: what happened when it was carried out. */
  r?: string[];
  /** The boss did this himself (an order or a decision of his). */
  mine?: 1;
  /** By one of his people on his behalf (a trusted advisor, a lieutenant). */
  by?: string;
  /** What the boss knows: absent = saw it himself; 'heard' = talk, the Ears; 'later' = learned after the fact. */
  k?: 'heard' | 'later';
  /** The earlier entry this follows from (fallout linked back). */
  re?: string;
}

/** An old week, folded to one line. */
export interface JWeek {
  w: number;
  n: number;
  m: number;
  c: Partial<Record<JCat, number>>;
  /** The few things worth remembering (his own orders first). */
  top: string[];
  /** Who came up. */
  p: string[];
  pl?: string[];
}

export interface JournalState {
  v: 1;
  seq: number;
  /** The week the Book was started (the screen backfills earlier weeks from the chronicle). */
  since: number;
  e: JEntry[];
  old: JWeek[];
}

/** Weeks kept entry by entry. */
export const BOOK_WEEKS = 10;
/** At most this many entries a week (the boss's own and money first). */
export const BOOK_PER_WEEK = 70;
/** Old weeks folded to one line each (about ten years). */
export const BOOK_OLD = 520;
const XMAX = 360;
const RMAX = 8;

/** What a caller passes to `journal`. */
export type JInput = Omit<JEntry, 'id' | 'w' | 'c'> & { w?: number; c?: JCat };

function ensure(s: GameState): JournalState {
  if (!s.journal) s.journal = { v: 1, seq: 0, since: s.week, e: [], old: [] };
  return s.journal;
}

const clip = (t: string, n = XMAX) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
export const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9$ ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
const uniq = <T,>(a: readonly T[]) => [...new Set(a)];

function textsOf(e: JEntry): string[] {
  return [e.t, e.x ?? '', ...(e.r ?? [])].filter(Boolean);
}

/**
 * Write one fact into the Book. Returns its id (or the id of the entry it was
 * folded into: the same fact from two places is written once, and gains the
 * other's people and places). Safe to call from any system, any time.
 */
export function journal(s: GameState, input: JInput): string {
  const J = ensure(s);
  const w = input.w ?? s.week;
  const t = clip(input.t.trim(), 200);
  if (!t) return '';
  const e = { ...input, w, c: input.c ?? classify(s, `${t} ${input.x ?? ''}`, 'town'), t } as JEntry;
  if (e.x !== undefined) { e.x = clip(e.x.trim()); if (!e.x || norm(e.x) === norm(t)) delete e.x; }
  if (e.r) { e.r = e.r.filter(Boolean).slice(0, RMAX).map((x) => clip(x, 300)); if (!e.r.length) delete e.r; }
  if (e.p) { e.p = uniq(e.p).slice(0, 8); if (!e.p.length) delete e.p; }
  if (e.pl) { e.pl = uniq(e.pl).slice(0, 6); if (!e.pl.length) delete e.pl; }
  if (e.m !== undefined) { e.m = Math.round(e.m); if (!e.m) delete e.m; }
  if (e.st) { for (const k of Object.keys(e.st) as (keyof NonNullable<JEntry['st']>)[]) if (!e.st[k]) delete e.st[k]; if (!Object.keys(e.st).length) delete e.st; }
  // The same fact, already written this week: fold this one into it.
  const keys = textsOf(e).map(norm);
  // An order is its own fact: two orders alike are two entries (each with its own outcome).
  for (let i = J.e.length - 1; i >= 0 && !e.o; i--) {
    const o = J.e[i];
    if (o.w < w) break;
    if (o.w !== w) continue;
    const ok = textsOf(o).map(norm);
    if (keys.some((k) => k.length > 12 && ok.includes(k)) || (!e.mine && !o.mine && ok.some((k) => k.length > 24 && (keys[0].includes(k) || k.includes(keys[0]))))) {
      const merged: JEntry = { ...o };
      if (e.p) merged.p = uniq([...(o.p ?? []), ...e.p]).slice(0, 8);
      if (e.pl) merged.pl = uniq([...(o.pl ?? []), ...e.pl]).slice(0, 6);
      if (e.mine && !o.mine) merged.mine = 1;
      J.e[i] = merged;
      return o.id;
    }
  }
  // Fallout: a later entry about someone the boss dealt with lately links back to that order.
  if (!e.re && !e.mine && e.p?.length) {
    for (let i = J.e.length - 1, n = 0; i >= 0 && n < 400; i--, n++) {
      const o = J.e[i];
      if (o.w < w - 12) break;
      if (o.mine && o.w <= w && o.p?.some((x) => e.p!.includes(x) && x !== s.playerId)) { e.re = o.id; break; }
    }
  }
  J.seq += 1;
  const out: JEntry = { ...e, id: `${w}.${J.seq}` };
  J.e.push(out);
  if (J.e.length > BOOK_PER_WEEK * (BOOK_WEEKS + 4)) compactBook(s);
  return out.id;
}

/* ---------------- Reading text: categories, people, places ---------------- */

const RX: [JCat, RegExp][] = [
  ['law', /\b(cops?|police|fbi|feds?|federal|indict\w*|arrest\w*|jail|prison|trial|grand jury|subpoena\w*|vice cop|detective|irs|lawyer|judge|raid\w*|heat)\b/i],
  ['intrigue', /\b(scheme|plot\w*|secret|blackmail\w*|informant|rat|frame\w*|ambush\w*|murder\w*|hit on|whack\w*|spy|spies)\b/i],
  ['romance', /\b(goomar|girlfriend|date|dates|evening with|the club|dancer|madam|escort|call girl|bold offer|mistress|courting|her purse|her drink|showgirl|bouncer)\b/i],
  ['family', /\b(wife|son|daughter|baby|wedding|funeral|heir|mother|father|brother|sister|christening|grandson|granddaughter|newborn|the kids)\b/i],
  ['rivals', /\b(rivals?|war|the table|truce|feud|manno|feldstein|kessler|other famil\w+|new york)\b/i],
  ['crew', /\b(capos?|soldiers?|crew|made man|associates?|underboss|consigliere|kick ?ups?|envelope|bagman|your men|your man)\b/i],
  ['politics', /\b(mayor|council\w*|commissioner|election|city hall|freeholder|senator|permit|license|alderman)\b/i],
  ['rackets', /\b(rackets?|numbers|bookmaking|policy bank|shylock\w*|loan ?shark\w*|juice|vig|protection|slots?|card game|shakedown)\b/i],
  ['property', /\b(lots?|property|building|construction|motel|hotel|rent|tenant|renovat\w*|lease\w*|bought|sold|broke ground|shore house|bungalow|cottage|burned)\b/i],
  ['travel', /\b(trip|travel\w*|flight|flew|vacation|envoy|havana|miami|las vegas|atlantic city)\b/i],
  ['paper', /\b(daily tide|weekly leader|the paper|headline|editor|reporter)\b/i],
  ['money', /\$[\d,]+|\b(paid|pays|owed|owes|debt|loan|bank|cash|money)\b/i],
];

/** Which shelf a line of text belongs on. */
export function classify(_s: GameState, text: string, fallback: JCat = 'town'): JCat {
  for (const [c, rx] of RX) if (rx.test(text)) return c;
  return fallback;
}

const ACTION_CAT: [RegExp, JCat][] = [
  [/nightlife|dating|romance|ears|evening|goomar|court/i, 'romance'],
  [/scheme|murder|heist|blackmail|frame|flip|informant|intrigue|secret|hit\b/i, 'intrigue'],
  [/rival|table|war|talk|nyc|pact|envoy|dispute|truce/i, 'rivals'],
  [/travel|trip|vacation|flee/i, 'travel'],
  [/pol|bribe|campaign|elect|office|permit|patron/i, 'politics'],
  [/racket|work|dirty|shake/i, 'rackets'],
  [/buyBusiness|sellBusiness|econ|empire|property|lot|build|lease|renovat|house|home/i, 'property'],
  [/lend|loan|money|ledger|spend|wash|bank|pocket|tribute|envelope/i, 'money'],
  [/hire|policy|contract|appoint|promot|crew|bones|make|capo|seat|edict|men/i, 'crew'],
  [/family|dyn|marr|heir|wife|child|kid|bond|activity|feast/i, 'family'],
  [/law|lawyer|legal|trial|case|heat/i, 'law'],
  [/paper|press|ad\b/i, 'paper'],
];

export function actionCat(a: PlayerAction): JCat | undefined {
  const op = (a as { op?: unknown }).op;
  const key = `${a.kind} ${op && typeof op === 'object' ? String((op as Record<string, unknown>).op ?? (op as Record<string, unknown>).type ?? '') : ''}`;
  for (const [rx, c] of ACTION_CAT) if (rx.test(key)) return c;
  return undefined;
}

/** The people and places an order names (any field holding a character, business, lot or district id). */
export function actionRefs(s: GameState, a: PlayerAction): { p: string[]; pl: string[] } {
  const p: string[] = [];
  const pl: string[] = [];
  const lots = new Set((s.econ?.lots ?? []).map((l) => l.id));
  const walk = (o: unknown, depth: number, field: string) => {
    if (depth > 3 || o == null) return;
    if (typeof o === 'string') {
      if (s.characters[o]) p.push(o);
      else if (/lot/i.test(field) && lots.has(o)) pl.push(`l:${o}`);
      else if (/biz|business/i.test(field) && s.businesses.some((b) => b.id === o)) pl.push(`b:${o}`);
      else if (/district/i.test(field) && s.districts.some((d) => d.id === o)) pl.push(`d:${o}`);
      else if (/place/i.test(field) && s.work) pl.push(`w:${o}`);
      return;
    }
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1, field); return; }
    if (typeof o === 'object') for (const [k, v] of Object.entries(o as Record<string, unknown>)) walk(v, depth + 1, k);
  };
  walk(a, 0, '');
  // A woman of the night: where she works is the place.
  for (const id of p) { const v = s.nightlife?.people[id]?.venue; if (v) pl.push(`v:${v}`); }
  return { p: uniq(p).filter((x) => x !== s.playerId), pl: uniq(pl) };
}

interface NameIndex { people: Map<string, string>; places: Map<string, string> }

function nameIndex(s: GameState): NameIndex {
  const people = new Map<string, string>();
  const nick = new Map<string, string | null>();
  for (const c of Object.values(s.characters)) {
    if (c.id === s.playerId) continue;
    const k = `${c.firstName} ${c.lastName}`;
    if (!people.has(k)) people.set(k, c.id);
    // "Kid Gloves": a nickname of two capitalized words names one man (if only one has it).
    if (c.nickname && /^[A-Z]\S+ [A-Z]\S+$/.test(c.nickname)) nick.set(c.nickname, nick.has(c.nickname) ? null : c.id);
  }
  for (const [k, id] of nick) if (id && !people.has(k)) people.set(k, id);
  const places = new Map<string, string>();
  for (const b of s.businesses) if (b.name && b.name.length > 4) places.set(b.name, `b:${b.id}`);
  for (const l of s.econ?.lots ?? []) if (l.name && l.name.length > 4) places.set(l.name, `l:${l.id}`);
  for (const p of Object.values(s.nightlife?.people ?? {})) if (p.venue && p.venue.length > 4 && !places.has(p.venue)) places.set(p.venue, `v:${p.venue}`);
  return { people, places };
}

/** The people and places a line of text names (full names; place names as written). */
function refsIn(ix: NameIndex, text: string): { p: string[]; pl: string[] } {
  const p: string[] = [];
  // Carmine "The Fist" Manno reads as Carmine Manno; the nickname on its own is looked up too.
  const plain = text.replace(/\s"([^"]+)"\s/g, (_m, n: string) => { const id = ix.people.get(n); if (id) p.push(id); return ' '; });
  const words = plain.split(/[^A-Za-z'’-]+/).filter(Boolean);
  for (let i = 0; i + 1 < words.length; i++) {
    if (!/^[A-Z]/.test(words[i]) || !/^[A-Z]/.test(words[i + 1])) continue;
    const id = ix.people.get(`${words[i]} ${words[i + 1]}`);
    if (id) p.push(id);
  }
  const pl: string[] = [];
  if (ix.places.size && /[A-Z]/.test(text)) for (const [n, k] of ix.places) if (text.includes(n)) { pl.push(k); if (pl.length >= 3) break; }
  return { p: uniq(p), pl: uniq(pl) };
}

/* ---------------- Orders: what you ordered, and what came of it ---------------- */

interface Mark { lines: number; log: number; chron: number; money: number; respect: number; heat: GameState['heat'] }
interface OrderRun { n: number; dn: number; consumedLog: Set<number>; consumedChron: Set<ChronicleEntry>; consumedLines: Set<ReportLine> }
const runs = new WeakMap<Ctx, OrderRun>();

function runOf(ctx: Ctx): OrderRun {
  let r = runs.get(ctx);
  if (!r) { r = { n: 0, dn: 0, consumedLog: new Set(), consumedChron: new Set(), consumedLines: new Set() }; runs.set(ctx, r); }
  return r;
}

const purse = (s: GameState) => s.money + Math.round(s.tribute?.acct.personal ?? 0);

/** Before an order (or a decision) is carried out: where the logs stand. */
export function bookMark(ctx: Ctx): Mark {
  const s = ctx.s;
  return { lines: ctx.lines.length, log: ctx.log.length, chron: s.chronicle.length, money: purse(s), respect: s.respect, heat: { ...s.heat } };
}

export interface OrderNote {
  title: string;
  /** done · refused · blocked (not carried out). */
  outcome: 'done' | 'refused' | 'blocked';
  why?: string;
  /** Who gave it: the boss (undefined), or one of his people. */
  by?: string;
  cat?: JCat;
  p?: string[];
  pl?: string[];
  /** A decision on an event rather than an order. */
  decision?: boolean;
}

/**
 * After an order (or a decision): everything it wrote — the report's log
 * lines, the chronicle, the money and the respect it moved — becomes ONE
 * entry, the order with its result lines. Those lines are then not written
 * again on their own at the end of the week.
 */
export function bookOrder(ctx: Ctx, mark: Mark, a: PlayerAction | undefined, note: OrderNote): string {
  const s = ctx.s;
  const run = runOf(ctx);
  const logs: string[] = [];
  for (let i = mark.log; i < ctx.log.length; i++) { run.consumedLog.add(i); logs.push(ctx.log[i]); }
  const chron = s.chronicle.slice(mark.chron);
  for (const c of chron) run.consumedChron.add(c);
  const lines = ctx.lines.slice(mark.lines);
  for (const l of lines) run.consumedLines.add(l);
  const st: NonNullable<JEntry['st']> = { respect: s.respect - mark.respect, local: s.heat.local - mark.heat.local, family: s.heat.family - mark.heat.family, federal: s.heat.federal - mark.heat.federal };
  const refs = a ? actionRefs(s, a) : { p: [], pl: [] };
  const ix = nameIndex(s);
  const more = refsIn(ix, logs.join(' '));
  const r = [
    ...(note.outcome === 'blocked' ? [`Not carried out: ${note.why ?? 'it could not be done'}.`] : note.outcome === 'refused' ? ['The answer was no.'] : []),
    ...logs.filter((l) => !/^Order not carried out/.test(l) && !/ — (refused|accepted)\.$/.test(l)),
    ...chron.map((c) => c.text).filter((t) => !/^You (tried: )?/.test(t)),
  ];
  if (note.decision) run.dn += 1; else run.n += 1;
  return journal(s, {
    c: note.cat ?? (a ? actionCat(a) : undefined) ?? classify(s, `${note.title} ${r.join(' ')}`, 'town'),
    t: note.title,
    r,
    p: [...(note.p ?? []), ...refs.p, ...more.p.filter((x) => !refs.p.includes(x))],
    pl: [...(note.pl ?? []), ...refs.pl, ...more.pl],
    m: purse(s) - mark.money,
    st,
    src: note.decision ? 'decision' : 'order',
    o: note.decision ? `d${s.week}.${run.dn}` : `o${s.week}.${run.n}`,
    ...(note.by ? { by: note.by } : { mine: 1 as const }),
  });
}

/* ---------------- Sources: other systems' logs, read in at the end of the week ---------------- */

export interface BookRaw { k: string; w: number; t: string; x?: string; c?: JCat; p?: string[]; pl?: string[]; m?: number; h?: 1; src: string; ln?: string }
export interface BookSource { id: string; read: (s: GameState, since: number) => BookRaw[] }
const SOURCES: BookSource[] = [];

/** A system with a log of its own: the Book reads it every week (new items only). */
export function registerBookSource(src: BookSource): void {
  const i = SOURCES.findIndex((x) => x.id === src.id);
  if (i >= 0) SOURCES[i] = src;
  else SOURCES.push(src);
}

const nameOf = (s: GameState, id: string) => { const c = s.characters[id]; return c ? `${c.firstName} ${c.lastName}` : 'Someone'; };

registerBookSource({ id: 'nightlife', read: (s, since) => {
  const N = s.nightlife;
  if (!N) return [];
  const out: BookRaw[] = (N.log ?? []).filter(([w]) => w >= since).map(([w, t]) => ({ k: `${w}|${t}`, w, t, c: 'romance' as JCat, src: 'nightlife', ln: 'nightlife' }));
  for (const p of Object.values(N.people)) for (const [w, t] of p.hist ?? []) if (w >= since) out.push({ k: `${p.id}|${w}|${t}`, w, t, c: 'romance', p: [p.id], pl: p.venue ? [`v:${p.venue}`] : undefined, src: 'nightlife', ln: 'nightlife' });
  return out;
} });

registerBookSource({ id: 'dating', read: (s, since) => {
  const D = s.dating;
  if (!D) return [];
  const out: BookRaw[] = (D.log ?? []).filter((e) => e.week >= since).map((e) => ({ k: `${e.week}|${e.charId ?? ''}|${e.text}`, w: e.week, t: e.text, c: (e.kind === 'family' ? 'family' : 'romance') as JCat, p: e.charId ? [e.charId] : undefined, src: 'dating', ln: 'dating' }));
  for (const r of D.rumors ?? []) if (r.week >= since) out.push({ k: `rumor|${r.week}|${r.text}`, w: r.week, t: r.text, h: 1, src: 'talk', p: r.about && r.about !== s.playerId ? [r.about] : undefined });
  return out;
} });

registerBookSource({ id: 'bonds', read: (s, since) => {
  const B = s.bonds;
  if (!B) return [];
  const out: BookRaw[] = (B.log ?? []).filter(([w]) => w >= since).map(([w, t]) => ({ k: `${w}|${t}`, w, t, c: 'family' as JCat, src: 'bonds', ln: 'you.people' }));
  for (const tie of Object.values(B.ties)) for (const m of tie.mem) {
    if (m.w < since) continue;
    const c: JCat = tie.role === 'goomar' || tie.role === 'lover' ? 'romance' : tie.role === 'crew' ? 'crew' : tie.role === 'rival' ? 'rivals' : 'family';
    out.push({ k: `${tie.id}|${m.w}|${m.k}|${m.t}`, w: m.w, t: `${nameOf(s, tie.id)} will remember ${m.t}${m.v >= 8 ? ', fondly' : m.v <= -8 ? ', and not kindly' : ''}.`, c, p: [tie.id], src: 'bonds', ln: 'you.people' });
  }
  return out;
} });

registerBookSource({ id: 'finance', read: (s, since) => {
  const out: BookRaw[] = [];
  for (const [id, L] of Object.entries(s.tribute?.life ?? {})) {
    const fin = (L as { fin?: { hist: { w: number; text: string; amt: number; seen: number }[] } }).fin;
    for (const h of fin?.hist ?? []) if (h.w >= since && h.seen >= 2) out.push({ k: `${id}|${h.w}|${h.text}|${h.amt}`, w: h.w, t: `${nameOf(s, id)}: ${h.text}`, c: 'money', p: [id], src: 'finance', h: h.seen < 3 ? 1 : undefined });
  }
  return out;
} });

registerBookSource({ id: 'news', read: (s, since) => (s.news ?? []).filter((n) => n.week >= since).map((n) => ({ k: `${n.week}|${n.headline}`, w: n.week, t: n.headline, x: n.body, c: classify(s, `${n.headline} ${n.body}`, 'paper'), src: 'news', ln: 'papers' })) });

registerBookSource({ id: 'paper', read: (s, since) => {
  const out: BookRaw[] = [];
  for (const ed of s.paper?.eds ?? []) {
    if (ed.week < since) continue;
    for (const it of ed.items) if (it.h && (it.a === 'boss' || it.a === 'family' || it.a === 'rival')) out.push({ k: `${ed.id}|${it.id}`, w: ed.week, t: it.h, x: it.b, c: 'paper', src: 'paper', ln: 'papers' });
  }
  return out;
} });

const CHRON_CAT: Record<ChronicleEntry['kind'], JCat> = { decision: 'town', consequence: 'town', death: 'family', succession: 'family', rival: 'rivals', family: 'family', heat: 'law', misc: 'town' };

/**
 * The end of the week: everything the week wrote that no order claimed — the
 * report's log, the lieutenants' and the rounds' lines, the chronicle, the
 * money that moved, and every registered source — goes into the Book, once.
 * Then the Book is folded down to its bounds.
 */
export function bookWeek(input: GameState, s: GameState, ctx: Ctx, report: WeeklyReport): void {
  const w = report.week;
  const run = runOf(ctx);
  ensure(s);
  const ix = nameIndex(s);
  const add = (raw: Omit<BookRaw, 'k'>, extra: Partial<JEntry> = {}) => {
    const refs = refsIn(ix, `${raw.t} ${raw.x ?? ''}`);
    journal(s, {
      w: raw.w, t: raw.t, x: raw.x, c: raw.c ?? classify(s, `${raw.t} ${raw.x ?? ''}`, 'town'), src: raw.src,
      p: [...(raw.p ?? []), ...refs.p], pl: [...(raw.pl ?? []), ...refs.pl], m: raw.m, ln: raw.ln,
      ...(raw.h ? { k: 'heard' as const } : {}), ...extra,
    });
  };
  // The report's log: what no order claimed.
  ctx.log.forEach((t, i) => { if (!run.consumedLog.has(i) && t.trim()) add({ w, t, src: 'report' }); });
  for (const t of report.lieutenants ?? []) add({ w, t, src: 'lieutenants', c: classify(s, t, 'crew') }, { by: 'lieutenants' });
  for (const t of report.rounds ?? []) add({ w, t, src: 'rounds' });
  for (const t of report.motion ?? []) add({ w, t, src: 'motion' });
  // The chronicle: new entries no order claimed (consequences link back to the order they came from).
  const before = new Set(input.chronicle);
  for (const c of s.chronicle) {
    if (before.has(c) || run.consumedChron.has(c)) continue;
    let re: string | undefined;
    if (c.because && c.becauseWeek !== undefined) re = s.journal!.e.find((e) => e.w === c.becauseWeek && e.mine && e.src === 'order' && norm(e.t).length && (c.because ?? '').length > 3 && orderBecause(e, c.because!))?.id;
    add({ w, t: c.text, c: classify(s, c.text, CHRON_CAT[c.kind] ?? 'town'), src: 'chronicle' }, { ...(re ? { re, k: 'later' as const } : {}), ...(c.kind === 'decision' && /^You /.test(c.text) ? { mine: 1 as const } : {}) });
  }
  // Money: the one-off sums no order claimed, and the week in one line.
  const free = ctx.lines.filter((l) => !run.consumedLines.has(l));
  for (const l of free) {
    if (l.stat !== 'money' || Math.abs(l.amount) < 500) continue;
    if (!['event', 'consequence', 'rival', 'debt', 'heat'].includes(l.category)) continue;
    // Already told in words this week ("…haul off $1,252"): the sum goes on that entry.
    const sum = `$${Math.abs(l.amount).toLocaleString('en-US')}`;
    const J = s.journal!;
    const told = J.e.findIndex((e) => e.w === w && !e.m && textsOf(e).some((t) => t.includes(sum)));
    if (told >= 0) { J.e[told] = { ...J.e[told], m: l.amount }; continue; }
    add({ w, t: l.label, c: classify(s, l.label, 'money'), src: 'ledger', m: l.amount, p: l.who && s.characters[l.who] ? [l.who] : undefined, pl: l.src ? placeOfSrc(s, l.src) : undefined });
  }
  const moneyLines = free.filter((l) => l.stat === 'money' && l.category !== 'transfer');
  if (moneyLines.length) {
    const inn = moneyLines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
    const out = moneyLines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
    const top = [...moneyLines].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5).map((l) => `${l.amount >= 0 ? '+' : '−'}$${Math.abs(l.amount).toLocaleString('en-US')} ${l.label}`);
    const resp = free.filter((l) => l.stat === 'respect').reduce((a, l) => a + l.amount, 0);
    journal(s, { w, c: 'money', t: `The week's money: $${Math.round(inn).toLocaleString('en-US')} in, $${Math.round(-out).toLocaleString('en-US')} out`, x: top.join(' · '), m: inn + out, st: { respect: resp }, src: 'ledger', ln: 'money' });
  }
  // Every registered source: what is new since the week began.
  const since = Math.max(0, w - 1);
  for (const src of SOURCES) {
    let was: BookRaw[] = [];
    let now: BookRaw[] = [];
    try { was = src.read(input, since); now = src.read(s, since); } catch { continue; }
    if (!now.length) continue;
    const seen = new Set(was.map((r) => r.k));
    for (const r of now) if (!seen.has(r.k)) add({ ...r, w: Math.min(r.w, w) });
  }
  compactBook(s);
}

function orderBecause(e: JEntry, because: string): boolean {
  const b = norm(because);
  return textsOf(e).some((t) => norm(t).includes(b.slice(0, 30))) || b.split(' ').filter((x) => x.length > 3).every((x) => norm(e.t).includes(x));
}

function placeOfSrc(s: GameState, src: string): string[] | undefined {
  if (s.businesses.some((b) => b.id === src)) return [`b:${src}`];
  if (s.districts.some((d) => d.id === src)) return [`d:${src}`];
  if (s.econ?.lots.some((l) => l.id === src)) return [`l:${src}`];
  return undefined;
}

/* ---------------- Bounds ---------------- */

const rank = (e: JEntry) => (e.mine ? 4 : 0) + (e.src === 'order' || e.src === 'decision' ? 2 : 0) + (e.m ? 1 : 0) + (e.p?.length ? 1 : 0) + (e.k ? -1 : 0);

/** Keep the last BOOK_WEEKS weeks in full (at most BOOK_PER_WEEK a week); fold the rest to one line a week. */
export function compactBook(s: GameState): void {
  const J = s.journal;
  if (!J) return;
  const cut = s.week - BOOK_WEEKS;
  const keep: JEntry[] = [];
  const fold = new Map<number, JEntry[]>();
  for (const e of J.e) {
    if (e.w < cut) { const a = fold.get(e.w) ?? []; a.push(e); fold.set(e.w, a); } else keep.push(e);
  }
  // Too many in one week: the least of them go (never the boss's own).
  const byWeek = new Map<number, JEntry[]>();
  for (const e of keep) { const a = byWeek.get(e.w) ?? []; a.push(e); byWeek.set(e.w, a); }
  let trimmed = keep;
  if ([...byWeek.values()].some((a) => a.length > BOOK_PER_WEEK)) {
    const drop = new Set<JEntry>();
    for (const a of byWeek.values()) {
      if (a.length <= BOOK_PER_WEEK) continue;
      const order = a.map((e, i) => ({ e, i, r: rank(e) })).sort((x, y) => x.r - y.r || y.i - x.i);
      for (const x of order.slice(0, a.length - BOOK_PER_WEEK)) drop.add(x.e);
    }
    trimmed = keep.filter((e) => !drop.has(e));
  }
  if (fold.size) {
    const old = J.old.slice();
    for (const [w, es] of [...fold.entries()].sort((a, b) => a[0] - b[0])) {
      const ex = old.find((o) => o.w === w);
      const sum: JWeek = ex ? { ...ex, c: { ...ex.c }, top: ex.top.slice(), p: ex.p.slice(), pl: ex.pl?.slice() } : { w, n: 0, m: 0, c: {}, top: [], p: [] };
      for (const e of es) {
        sum.n += 1;
        if (e.src === 'order' || e.src === 'decision' || (e.src === 'ledger' && e.ln === 'money')) sum.m += e.m ?? 0;
        sum.c[e.c] = (sum.c[e.c] ?? 0) + 1;
        if (e.p) sum.p = uniq([...sum.p, ...e.p]).slice(0, 24);
        if (e.pl) sum.pl = uniq([...(sum.pl ?? []), ...e.pl]).slice(0, 12);
      }
      const best = [...es].sort((a, b) => rank(b) - rank(a) || Math.abs(b.m ?? 0) - Math.abs(a.m ?? 0)).slice(0, 4).map((e) => clip(e.t, 120));
      sum.top = uniq([...sum.top, ...best]).slice(0, 4);
      if (!sum.pl?.length) delete sum.pl;
      if (ex) old[old.indexOf(ex)] = sum; else old.push(sum);
    }
    old.sort((a, b) => a.w - b.w);
    J.old = old.slice(-BOOK_OLD);
  }
  J.e = trimmed;
}

/* ---------------- Reading the Book ---------------- */

export interface BookFilter {
  cats?: readonly JCat[];
  person?: string;
  place?: string;
  mine?: boolean;
  money?: boolean;
  from?: number;
  to?: number;
  q?: string;
  /** One thread: this entry and everything that followed from it. */
  thread?: string;
}

/**
 * Everything in the Book, oldest first. Before the Book was started (an old
 * save), the chronicle stands in for the weeks it does not have.
 */
export function bookEntries(s: GameState): JEntry[] {
  const J = s.journal;
  const since = J?.since ?? s.week + 1;
  const back: JEntry[] = [];
  s.chronicle.forEach((c, i) => {
    if (c.week >= since) return;
    back.push({ id: `c${i}`, w: c.week, c: classify(s, c.text, CHRON_CAT[c.kind] ?? 'town'), t: c.text, src: 'chronicle', ...(c.kind === 'decision' && /^You /.test(c.text) ? { mine: 1 as const } : {}) });
  });
  return back.length ? [...back, ...(J?.e ?? [])] : J?.e ?? [];
}

export function matches(s: GameState, e: JEntry, f: BookFilter): boolean {
  if (f.cats?.length && !f.cats.includes(e.c)) return false;
  if (f.person && !e.p?.includes(f.person)) return false;
  if (f.place && !e.pl?.includes(f.place)) return false;
  if (f.mine && !e.mine) return false;
  if (f.money && !e.m) return false;
  if (f.from !== undefined && e.w < f.from) return false;
  if (f.to !== undefined && e.w > f.to) return false;
  if (f.thread && e.id !== f.thread && e.re !== f.thread) return false;
  if (f.q) {
    const q = f.q.toLowerCase().trim();
    if (q) {
      const hay = [...textsOf(e), ...(e.p ?? []).map((id) => nameOf(s, id)), ...(e.pl ?? []).map((k) => placeLabel(s, k)), JCAT_INFO[e.c].label].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
    }
  }
  return true;
}

export function bookSearch(s: GameState, f: BookFilter = {}): JEntry[] {
  return bookEntries(s).filter((e) => matches(s, e, f));
}

/** Old weeks (folded) that mention a person or a place. */
export function oldWeeksAbout(s: GameState, f: { person?: string; place?: string }): JWeek[] {
  return (s.journal?.old ?? []).filter((o) => (f.person ? o.p.includes(f.person) : true) && (f.place ? o.pl?.includes(f.place) : true));
}

/** Between you and them: every entry about one person, and the sums. */
export function bookAbout(s: GameState, f: { person?: string; place?: string }): { entries: JEntry[]; old: JWeek[]; orders: number; money: number; first?: number; last?: number } {
  const entries = bookSearch(s, f);
  const old = oldWeeksAbout(s, f);
  const orders = entries.filter((e) => e.mine).length;
  const money = entries.filter((e) => e.mine).reduce((a, e) => a + (e.m ?? 0), 0);
  const weeks = [...entries.map((e) => e.w), ...old.map((o) => o.w)];
  return { entries, old, orders, money, first: weeks.length ? Math.min(...weeks) : undefined, last: weeks.length ? Math.max(...weeks) : undefined };
}

/** What a place key reads as. */
export function placeLabel(s: GameState, key: string): string {
  const [k, ...rest] = key.split(':');
  const id = rest.join(':');
  if (k === 'v') return id;
  if (k === 'b') return s.businesses.find((b) => b.id === id)?.name ?? 'A place';
  if (k === 'd') return s.districts.find((d) => d.id === id)?.name ?? id;
  if (k === 'l') { const l = s.econ?.lots.find((x) => x.id === id); return l ? (l.name ? `${l.name}, ${l.address}` : l.address) : 'A lot'; }
  if (k === 'w') return 'A place you work';
  return id;
}

/** Where a place key opens: a route, and a district to point the map at. */
export function placeRoute(s: GameState, key: string): { route: string; district?: string } {
  const [k, ...rest] = key.split(':');
  const id = rest.join(':');
  if (k === 'v') return { route: 'nightlife' };
  if (k === 'b') return { route: 'business', district: s.businesses.find((b) => b.id === id)?.districtId };
  if (k === 'd') return { route: 'neighborhoods', district: id };
  if (k === 'l') return { route: 'realestate' };
  if (k === 'w') return { route: 'rackethub' };
  return { route: 'map' };
}

export function weekLabel(w: number): string {
  return `Week ${w} · ${formatDate(dateOfWeek(Math.max(1, w)))}`;
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Pure: a copy of the state with one more entry in the Book (for things the
 * boss does that take effect at once, outside the week's turn). The state it
 * is given is left as it was.
 */
export function journalNow(s: GameState, input: Omit<JInput, 'src'> & { src?: string }): GameState {
  const J = s.journal ?? { v: 1 as const, seq: 0, since: s.week, e: [], old: [] };
  const n: GameState = { ...s, journal: { ...J, e: J.e.slice(), old: J.old.slice() } };
  journal(n, { ...(s.days && s.days.week === s.week ? { d: s.days.day } : {}), mine: 1, ...input, src: input.src ?? 'now' });
  return n;
}

/** The sequence number of an entry (for "new since you last looked"). */
export const seqOf = (id: string) => Number(id.split('.')[1] ?? 0) || 0;
