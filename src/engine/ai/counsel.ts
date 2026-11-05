import { previewAction } from '../actions';
import { briefing, recommendedActions, speakerLabel } from '../briefing';
import { isInSeason } from '../calendar';
import { displayName, isFree, player } from '../characters';
import { holder } from '../council';
import { crewBoard } from '../crewBoard';
import { readyReview } from '../desk';
import { fmtMoney } from '../effects';
import { ensureFeds } from '../fedsState';
import { activeGoomars } from '../goomar';
import { buyIdeas } from '../invest';
import { mensMoney } from '../mensMoney';
import { moneyView } from '../money';
import { opinion } from '../relations';
import { hashSeed } from '../rng';
import { pocketCash } from '../tributeState';
import type { Character, GameState, PlayerAction } from '../types';
import { badCharNames, clean, inventedNames, strangeMoney, unfit, vocab, wordCount } from './guard';

/**
 * ASK THE CONSIGLIERE. The boss types a question in his own words; the
 * consigliere answers from the real state of things and points at up to three
 * orders the boss can give with one tap.
 *
 * The engine builds (1) a compact, truthful BRIEF of what is so (money and the
 * week's drains, the men and who needs work, threats and what lapses, wars,
 * rivals and pacts, heat and the law, the household, the open decisions, what
 * his people already recommend, what is for sale) and (2) a MENU of candidate
 * orders: existing PlayerActions with the engine's own preview (cost, odds,
 * why it can't be done). Claude may only reword the answer and choose from
 * the menu, by index: `validateCounsel` throws out anything else. When Claude
 * is not there, `scriptedCounsel` answers from the same brief and menu by
 * keyword. Pure: nothing here changes the state; the order flow (the normal
 * ActionCard) does the rest, journal and all.
 */

export type AskTopic = 'money' | 'men' | 'war' | 'law' | 'women' | 'next';
export const ASK_TOPICS: AskTopic[] = ['money', 'men', 'war', 'law', 'women', 'next'];
export const TOPIC_LABEL: Record<AskTopic, string> = { money: 'Money', men: 'The men', war: 'The other families', law: 'Cops & feds', women: 'Home & the women', next: 'What next' };

export const ANSWER_WORDS = 120;
export const MAX_PICKS = 3;
export const MAX_QUESTION = 300;
export const MENU_SIZE = 16;

export interface MenuItem {
  /** Index in the menu (what Claude picks by). */
  i: number;
  action: PlayerAction;
  title: string;
  why: string;
  topics: AskTopic[];
  cost: number;
  pot: 'family' | 'pocket';
  /** 0..1 when the engine rolls for it. */
  odds?: number;
  disabled?: string;
}

export interface CounselBrief {
  /** The man who answers (the consigliere, else the underboss), if any. */
  speakerId?: string;
  speaker: string;
  /** Lines by topic (each line is true of the state). */
  lines: Record<AskTopic, string[]>;
  /** Everyone named in the brief (their ids): the only people an answer may name. */
  people: string[];
  /** The whole brief as text (what the prompt carries; names and figures are checked against it). */
  text: string;
}

export interface CounselAnswer { answer: string; picks: number[]; warn?: string }

/* ------------------------------------------------------------------ */
/* Who answers                                                         */
/* ------------------------------------------------------------------ */

export function counselor(s: GameState): Character | undefined {
  return holder(s, 'consigliere') ?? holder(s, 'underboss');
}

/** "Ask Dominic…" (or "Ask your counsel…" with nobody in the seat). */
export function askLabel(s: GameState): string {
  const c = counselor(s);
  return c ? `Ask ${c.nickname ?? c.firstName}…` : 'Ask your counsel…';
}

/* ------------------------------------------------------------------ */
/* Keyword routing                                                     */
/* ------------------------------------------------------------------ */

const ROUTES: [AskTopic, RegExp][] = [
  ['law', /\b(cops?|police|feds?|fbi|g-?men|heat|law|lawyers?|prosecutor|indict\w*|trial|jail|prison|arrest\w*|case|pinch\w*|raid\w*|bribe|judge)\b/],
  ['war', /\b(wars?|rivals?|families|other family|enem(y|ies)|fight\w*|truce|peace|pacts?|threat\w*|philly|philadelphia|hit|whack|attack\w*|muscle|territory|turf)\b/],
  ['women', /\b(wife|women|woman|girls?|goomar\w*|girlfriend|mistress|marriage|married|romance|date|dating|kids|children|home|household|sweetheart)\b/],
  ['men', /\b(men|man|crew|crews|capos?|soldiers?|guys|boys|work|jobs?|idle|loyal\w*|payroll|earners?|associates?|recruit\w*|hire)\b/],
  ['money', /\b(money|cash|broke|rich|earn\w*|income|spend\w*|invest\w*|buy|bank|dollars?|bucks|pocket|envelope|profit\w*|net|bills?|drains?|leak\w*|afford|costs?|business\w*|rackets?)\b/],
  ['next', /\b(next|now|should i|what do i|priority|priorities|advice|first|today|this week|plan)\b/],
];

/** The topics a question is about, most specific first; "what next" when nothing matches. */
export function askTopics(s: GameState, q: string): AskTopic[] {
  const t = ` ${q.toLowerCase()} `;
  const out: AskTopic[] = [];
  for (const [k, re] of ROUTES) if (re.test(t)) out.push(k);
  // A rival family named by name is a question about the families.
  if (!out.includes('war') && s.rivals.some((r) => r.kind === 'mob' && t.includes(r.shortName.toLowerCase().replace(/^the /, '').split(' ')[0]))) out.unshift('war');
  return out.length ? out : ['next'];
}

/* ------------------------------------------------------------------ */
/* The brief                                                           */
/* ------------------------------------------------------------------ */

const memo = new WeakMap<GameState, CounselBrief>();

export function counselBrief(s: GameState): CounselBrief {
  const hit = memo.get(s);
  if (hit) return hit;
  const people = new Set<string>();
  const nm = (c: Character | undefined) => { if (!c) return 'someone'; people.add(c.id); return displayName(c); };
  const L: Record<AskTopic, string[]> = { money: [], men: [], war: [], law: [], women: [], next: [] };
  const boss = player(s);
  people.add(boss.id);
  const cons = counselor(s);
  if (cons) people.add(cons.id);

  // Money: the two pots, last week's flow, the biggest drains, what leaks, what is for sale.
  const mv = moneyView(s, true);
  L.money.push(`Family money ${fmtMoney(s.money)}; your pocket ${fmtMoney(pocketCash(s))}.`);
  if (mv.week !== undefined) {
    L.money.push(`Last week ${fmtMoney(mv.inTotal)} came in and ${fmtMoney(mv.outTotal)} went out: net ${fmtMoney(mv.net)}.`);
    const drains = mv.uses.filter((u) => u.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
    if (drains.length) L.money.push(`Biggest drains: ${drains.map((d) => `${d.label} ${fmtMoney(d.amount)}`).join(', ')}.`);
    const srcs = mv.sources.filter((u) => u.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
    if (srcs.length) L.money.push(`Biggest earners: ${srcs.map((d) => `${d.label} ${fmtMoney(d.amount)}`).join(', ')}.`);
  }
  if (mv.leak) L.money.push(`Where money leaks: ${mv.leak.label} (${fmtMoney(mv.leak.amount)}): ${mv.leak.why}`);
  const rv = readyReview(s);
  if (rv.costs.bills) L.money.push(`Weekly bills ${fmtMoney(rv.costs.bills)}; Family money after them ${fmtMoney(rv.costs.familyAfter)}.`);
  for (const b of buyIdeas(s, 2)) L.money.push(`For sale: ${b.name} (${b.where}) for ${fmtMoney(b.cost)}, about ${fmtMoney(b.weekly)} a week.`);

  // The men: who earns, who needs work, who is broke.
  const cb = crewBoard(s);
  const cnt = cb.count;
  L.men.push(`${cb.rows.length} men: ${cnt.earning} earning, ${cnt.own} on their own scores, ${cnt.needs + cnt.starving} need work${cnt.starving ? ` (${cnt.starving} starving)` : ''}, ${cnt.over} overworked, ${cnt.away} away. They kick up about ${fmtMoney(cb.upWeek)} a week together.`);
  const needy = cb.rows.filter((r) => r.status === 'starving' || r.status === 'needs').slice(0, 3);
  if (needy.length) L.men.push(`Need work: ${needy.map((r) => `${nm(r.c)} (${r.status === 'starving' ? 'starving' : 'idle'})`).join(', ')}.`);
  const mm = mensMoney(s);
  const broke = mm.rows.filter((r) => r.level === 'broke').slice(0, 3);
  if (broke.length) L.men.push(`Broke: ${broke.map((r) => `${nm(r.c)} (has ${fmtMoney(r.has)}${r.owes ? `, owes ${fmtMoney(r.owes)}` : ''})`).join(', ')}.`);
  else if (mm.total.tight) L.men.push(`${mm.total.tight} of the men are running low on money.`);
  if (rv.idle) L.men.push(`${rv.idle} men have nothing to do this week.`);

  // The other families: wars, feuds, pacts, what they did lately.
  const fam = s.rivals.filter((r) => r.kind === 'mob' || r.kind === 'philly');
  for (const w of s.wars) {
    const r = s.rivals.find((x) => x.id === w.rival);
    const d = s.districts.find((x) => x.id === w.district);
    L.war.push(`At war with ${r?.name ?? w.rival} over ${d?.name ?? w.district} since week ${w.startWeek}: ${w.score > 10 ? 'you are winning' : w.score < -10 ? 'they are winning' : 'even'} (${w.score > 0 ? '+' : ''}${w.score}).`);
  }
  if (!s.wars.length) L.war.push('No war on right now.');
  for (const r of fam) {
    const bits = [`muscle ${r.muscle}/100`];
    if (r.feud) bits.push('a blood feud with you');
    if (r.lastMove && s.week - r.lastMove.week <= 3) bits.push(`lately: ${r.lastMove.text.replace(/[.\s]+$/, '')}`);
    L.war.push(`${r.name}: ${bits.join('; ')}.`);
  }
  for (const p of (s.talks?.pacts ?? []).filter((p) => p.until >= s.week && (p.a === 'player' || p.b === 'player'))) {
    const other = p.a === 'player' ? p.b : p.a;
    L.war.push(`Pact with ${s.rivals.find((r) => r.id === other)?.name ?? other}: ${p.terms} (until week ${p.until}).`);
  }

  // The law.
  L.law.push(`Heat: local ${s.heat.local}/100, federal ${s.heat.federal}/100, inside the family ${s.heat.family}/100.`);
  const held = (s.feds ? ensureFeds(s).pinches : []).filter((p) => p.stage === 'held');
  for (const p of held.slice(0, 3)) L.law.push(`${nm(s.characters[p.charId])} is held on ${p.crime}${p.serious ? ` (facing ${p.years} years)` : ''}.`);
  const jailed = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && !isFree(s, c)).length;
  if (jailed) L.law.push(`${jailed} of your people are inside.`);
  if (!isFree(s, boss)) L.law.push('You are inside yourself.');

  // Home.
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife?.alive) { const op = opinion(s, wife.id, s.playerId); L.women.push(`Your wife ${nm(wife)} thinks ${op >= 40 ? 'the world of you' : op >= 10 ? 'well of you' : op > -10 ? 'little either way of you lately' : 'badly of you'} (${op >= 0 ? '+' : ''}${op}).`); }
  else L.women.push('You are not married.');
  const g = activeGoomars(s);
  if (g.length) L.women.push(`You keep ${g.length === 1 ? `a girlfriend, ${nm(s.characters[g[0].id])}` : `${g.length} girlfriends`} on the side.`);
  const kids = boss.childrenIds.map((id) => s.characters[id]).filter((c) => c?.alive);
  if (kids.length) L.women.push(`${kids.length} children: ${kids.slice(0, 4).map((c) => c.firstName).join(', ')}.`);

  // What is open, what lapses, what his people recommend.
  if (rv.unanswered.length) L.next.push(`${rv.unanswered.length} decisions wait for you: ${rv.unanswered.slice(0, 3).map((u) => u.title).join('; ')}.`);
  if (rv.mornings.length) L.next.push(`${rv.mornings.length} people still want a word with you this week.`);
  for (const l of rv.lapses.slice(0, 3)) L.next.push(`Runs out when the week turns: ${l.title}.`);
  for (const w of rv.warnings.slice(0, 2)) L.next.push(`Warning: ${w}`);
  const bf = briefing(s);
  for (const r of recommendedActions(s, bf).slice(0, 4)) {
    if (r.item.charId && s.characters[r.item.charId]) people.add(r.item.charId);
    const sp = speakerLabel(bf, r.item.speaker);
    L.next.push(`${/^your /.test(sp) ? sp.replace(/^your/, 'Your') : `${sp} (your ${r.item.role})`} on ${r.item.topic}: "${clean(r.item.line, 160)}" Recommends: ${r.option.label}.`);
  }
  if (!L.next.length) L.next.push('Nothing is pressing this week.');

  const head = `It is week ${s.week}, ${s.date.m}/${s.date.y}, ${isInSeason(s.date) ? 'the summer season' : 'the off-season'}. The boss is ${displayName(boss)}.${cons ? ` His ${holder(s, 'consigliere') ? 'consigliere' : 'underboss'} is ${displayName(cons)}.` : ''}`;
  const text = [head, ...ASK_TOPICS.map((k) => `${TOPIC_LABEL[k].toUpperCase()}:\n${L[k].map((x) => `- ${x}`).join('\n')}`)].join('\n');
  const out: CounselBrief = { speakerId: cons?.id, speaker: cons ? displayName(cons) : 'your counsel', lines: L, people: [...people], text };
  memo.set(s, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* The menu                                                            */
/* ------------------------------------------------------------------ */

const TOPIC_WORDS: [AskTopic, RegExp][] = [
  ['law', /\b(cops?|heat|law|lawyer|feds?|lay low|lie low|police|judge|pinch|bail)\b/i],
  ['war', /\b(war|rival|truce|peace|raid|pact|feud|family's|offers|muscle)\b/i],
  ['women', /\b(wife|wedding|woman|girl|kids|christening|her|marriage|date)\b/i],
  ['men', /\b(capo|soldier|crew|man|men|loyal|envelope|short|score|job|earner|dinner)\b/i],
  ['money', /\b(money|racket|buy|sell|business|cash|\$|earn|take|invest|bank)\b/i],
];

const topicsOf = (text: string, base: AskTopic[] = []): AskTopic[] => {
  const t = new Set<AskTopic>(base);
  for (const [k, re] of TOPIC_WORDS) if (re.test(text)) t.add(k);
  t.add('next');
  return [...t];
};

const memoMenu = new WeakMap<GameState, MenuItem[]>();

/** The orders the consigliere may point at: real PlayerActions with the engine's own preview. */
export function counselMenu(s: GameState): MenuItem[] {
  const hit = memoMenu.get(s);
  if (hit) return hit;
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  const add = (action: PlayerAction, why: string, topics: AskTopic[], title?: string) => {
    if (out.length >= MENU_SIZE) return;
    const k = JSON.stringify(action);
    if (seen.has(k)) return;
    let p;
    try { p = previewAction(s, action); } catch { return; }
    seen.add(k);
    const odds = p.acceptance ?? p.odds;
    out.push({
      i: out.length, action, title: clean(title ?? p.title, 90), why: clean(why, 160), topics: topicsOf(title ?? p.title, topics),
      cost: p.cost, pot: p.pot === 'pocket' ? 'pocket' : 'family', odds: odds ? odds.chance : undefined, disabled: p.disabledReason,
    });
  };
  // What his people already recommend (the brief's own picks).
  for (const r of recommendedActions(s).slice(0, 4)) {
    const lbl = r.option.label.split(/\s+/).length < 3 ? `${r.item.topic}: ${r.option.label}` : r.option.label;
    add(r.action, r.item.line, topicsOf(`${r.item.topic} ${r.option.label}`), lbl);
  }
  // The money: where it leaks, what is for sale.
  const mv = moneyView(s, true);
  if (mv.leak?.action) add(mv.leak.action, mv.leak.why, ['money'], mv.leak.fix);
  for (const b of buyIdeas(s, 2)) add(b.action, `${b.where}: about ${fmtMoney(b.weekly)} a week, pays back in ${b.payback} weeks.`, ['money'], `Buy ${b.name}`);
  // The men who need work.
  for (const r of crewBoard(s).rows.filter((x) => x.assign && (x.status === 'starving' || x.status === 'needs' || x.status === 'own')).slice(0, 3)) add(r.assign!.action, `${r.c.firstName}: ${r.assign!.why}`, ['men', 'money'], `${r.c.firstName}: ${r.assign!.label}`);
  for (const r of mensMoney(s).rows.filter((x) => x.need.fix && x.level === 'broke').slice(0, 1)) add(r.need.fix!.action, `${r.c.firstName} is broke: ${r.need.why[0] ?? ''}`, ['men'], r.need.fix!.label);
  // The wars.
  for (const w of s.wars.slice(0, 2)) {
    add({ kind: 'raid', warId: w.id }, 'Hit their places in the war.', ['war']);
    add({ kind: 'raiseDispute', dispute: 'peace', rival: w.rival, warId: w.id }, 'Ask the Table for peace.', ['war']);
  }
  // The heat.
  const via = holder(s, 'underboss') ? 'underboss' as const : 'direct' as const;
  if (s.heat.local >= 30 || s.heat.federal >= 30) {
    add({ kind: 'order', key: 'cops', via }, 'It cools the local heat for a while.', ['law']);
    add({ kind: 'order', key: 'laylow', via }, 'A quiet week: less street money, less heat.', ['law']);
  }
  if (s.heat.federal >= 40) add({ kind: 'legal', op: 'retainer' }, 'A lawyer on retainer before you need one.', ['law']);
  memoMenu.set(s, out);
  return out;
}

/** The menu items that fit the question (any topic), the usable ones first. */
function menuFor(menu: readonly MenuItem[], topics: readonly AskTopic[]): MenuItem[] {
  // The question's main topic first, then the rest it touches; usable before unavailable; then the menu's own order.
  const rank = (m: MenuItem) => Math.min(...topics.map((t, k) => (m.topics.includes(t) ? k : 99)));
  return menu.filter((m) => rank(m) < 99).sort((a, b) => Number(!!a.disabled) - Number(!!b.disabled) || rank(a) - rank(b) || a.i - b.i);
}

/* ------------------------------------------------------------------ */
/* The prompt                                                          */
/* ------------------------------------------------------------------ */

const RULES = `You are the consigliere of a crime family in "Little Las Vegas", a fictional strategy game set in Wildwood, New Jersey, around 1960. The boss asks you something in his own words; you answer him as his consigliere: a careful, plain-spoken older man, early-1960s Jersey Shore talk, no modern slang.

Rules:
- Answer ONLY from the BRIEF below. Every number, name and fact you use must be in it. If the brief does not say, say you don't know or would have to ask around.
- Use only the people named in the brief. Everyone is fictional; never name real people, real crime families, real businesses or films.
- Violence only implied, never described; nothing sexual or explicit; never real-world instructions for any crime.
- If he asks about something outside this world, answer as the consigliere would ("That's not our business, boss").
- "answer": at most 120 words, spoken to the boss.
- "picks": up to 3 numbers from the MENU (the orders you'd have him give), best first; never one marked UNAVAILABLE; [] if none fits.
- "warn": optional, one short sentence if something in the brief is dangerous.
Reply with ONLY one JSON object: {"answer": string, "picks": [numbers], "warn": string (optional)}`;

export function menuText(menu: readonly MenuItem[]): string {
  return menu.map((m) => `${m.i}. ${m.title}${m.cost ? ` (${fmtMoney(m.cost)} from ${m.pot === 'pocket' ? 'your pocket' : 'the Family'})` : ''}${m.odds !== undefined ? ` (${Math.round(m.odds * 100)}% it works)` : ''}${m.disabled ? ` UNAVAILABLE: ${m.disabled}` : ''}: ${m.why}`).join('\n');
}

export interface CounselTurn { q: string; a: CounselAnswer }

/** One exchange: the rules, brief and menu, the last few questions, and the boss's question. */
export function counselPrompt(s: GameState, q: string, history: readonly CounselTurn[] = []): { role: 'user' | 'assistant'; content: string }[] {
  const b = counselBrief(s);
  const menu = counselMenu(s);
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: `${RULES}\n\nYou are ${b.speaker}.\n\nBRIEF:\n${b.text}\n\nMENU:\n${menu.length ? menuText(menu) : '(nothing to order right now)'}` }];
  for (const t of history.slice(-3)) {
    msgs.push({ role: 'user', content: `The boss asks: "${clean(t.q, MAX_QUESTION)}"` });
    msgs.push({ role: 'assistant', content: JSON.stringify({ answer: t.a.answer, picks: t.a.picks }) });
  }
  msgs.push({ role: 'user', content: `The boss asks: "${clean(q, MAX_QUESTION)}"\nAnswer with only the JSON object.` });
  return msgs;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export function validateCounsel(s: GameState, raw: unknown, menu: readonly MenuItem[] = counselMenu(s)): { ok: true; out: CounselAnswer } | { ok: false; why: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, why: 'not an object' };
  const o = raw as Record<string, unknown>;
  if (typeof o.answer !== 'string') return { ok: false, why: 'no answer' };
  const answer = clean(o.answer, 1200);
  if (!answer) return { ok: false, why: 'empty answer' };
  if (wordCount(answer) > ANSWER_WORDS + 10) return { ok: false, why: 'too long' };
  const warn = typeof o.warn === 'string' && o.warn.trim() ? clean(o.warn, 200) : undefined;
  const b = counselBrief(s);
  const known = vocab(b.text, menuText(menu));
  for (const t of [answer, warn ?? '']) {
    const bad = unfit(t, known);
    if (bad) return { ok: false, why: bad };
    const inv = inventedNames(t, known);
    if (inv.length) return { ok: false, why: `names not in the brief: ${inv.join(', ')}` };
    const who = badCharNames(s, t, new Set(b.people), known);
    if (who.length) return { ok: false, why: `people not in the brief: ${who.join(', ')}` };
    const cash = strangeMoney(t, `${b.text}\n${menuText(menu)}`);
    if (cash.length) return { ok: false, why: `figures not in the brief: ${cash.join(', ')}` };
  }
  if (o.picks !== undefined && !Array.isArray(o.picks)) return { ok: false, why: 'picks not a list' };
  const picks: number[] = [];
  for (const x of (o.picks as unknown[] | undefined) ?? []) {
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : NaN;
    const m = Number.isInteger(n) ? menu[n] : undefined;
    if (!m) return { ok: false, why: `pick ${String(x)} is not on the menu` };
    if (m.disabled) return { ok: false, why: `pick ${n} is unavailable` };
    if (!picks.includes(n)) picks.push(n);
  }
  if (picks.length > MAX_PICKS) return { ok: false, why: 'too many picks' };
  return { ok: true, out: { answer, picks, warn } };
}

/* ------------------------------------------------------------------ */
/* Without Claude: the scripted answer                                 */
/* ------------------------------------------------------------------ */

const OPEN: Record<AskTopic, string[]> = {
  money: ['Here is where the money stands, boss.', 'You want the money? I\'ll give it to you straight.'],
  men: ['About the men.', 'The men, boss. Here\'s how they sit.'],
  war: ['The other families. Here\'s what I see.', 'About our friends across town.'],
  law: ['The law. Here\'s how hot it is.', 'About the cops and the G-men.'],
  women: ['At home, boss. Since you ask.', 'Your house. I\'ll be careful how I say it.'],
  next: ['If it were me, boss, here is where I\'d look first.', 'What next? Here\'s what\'s on the table.'],
};
const CLOSE_PICKS = ['If you want my advice, start here.', 'I\'d start with what I put in front of you.'];
const CLOSE_NONE = ['Nothing I\'d have you order on it today.', 'For now, I\'d let it sit.'];

/** The answer from the brief, by keyword: the same facts, the same menu, no Claude. Deterministic. */
export function scriptedCounsel(s: GameState, q: string): CounselAnswer & { topics: AskTopic[] } {
  const b = counselBrief(s);
  const topics = askTopics(s, q);
  const main = topics[0];
  const h = hashSeed(`${s.seed}|${s.week}|${q.toLowerCase().trim()}`);
  const pick = (xs: string[], k = 0) => xs[(h + k) % xs.length];
  const lines = topics.slice(0, 2).flatMap((t) => b.lines[t].slice(0, t === main ? 3 : 1));
  let body = lines.join(' ');
  // Keep it under the cap, whole sentences only.
  while (wordCount(body) > ANSWER_WORDS - 25 && lines.length > 1) { lines.pop(); body = lines.join(' '); }
  if (wordCount(body) > ANSWER_WORDS - 25) body = body.split(/\s+/).slice(0, ANSWER_WORDS - 25).join(' ') + '…';
  const picks = menuFor(counselMenu(s), topics).filter((m) => !m.disabled).slice(0, MAX_PICKS).map((m) => m.i);
  const answer = `${pick(OPEN[main])} ${body} ${picks.length ? pick(CLOSE_PICKS, 1) : pick(CLOSE_NONE, 1)}`.trim();
  const warn = s.heat.federal >= 60 ? 'The federal heat is high: whatever you do, do it quiet.' : s.money < 0 ? 'The Family money is below zero.' : undefined;
  return { answer, picks, warn, topics };
}

/** Example questions for the box (one per topic). */
export const ASK_EXAMPLES: Record<AskTopic, string> = {
  money: 'Where is my money going?',
  men: 'Which of my men need work?',
  war: 'Should I worry about the other families?',
  law: 'How hot are the cops on us?',
  women: 'How are things at home?',
  next: 'What should I do next?',
};
