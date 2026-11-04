import type { OfficeUi } from '../bossOffice';
import { oddsWord as sharedOddsWord } from '../decide';
import { stormLine, stormWarnings } from '../storms';
import { briefing, recommendedActions } from '../briefing';
import { crew, displayName, isFree, player } from '../characters';
import { holder } from '../council';
import { DAY_NAMES, today } from '../days';
import { fmtMoney } from '../effects';
import { eventsOut } from '../eventDays';
import { whatShouldIDo } from '../opportunities';
import { tapGuess } from '../phone';
import { inTheRanks } from '../rankView';
import { opinion } from '../relations';
import { stormClock } from '../setPieces';
import { aggression } from '../threats';
import { absDay, formatClock, hoursLeft } from '../timeCost';
import { latestReport } from '../tribute';
import { above, chiefOf, quotaNow } from '../valente';
import type { JCat } from '../journal';
import type { Character, GameState } from '../types';
import { audienceRequests, gatekeeper, type AudienceReq } from './audience';
import { dayEntries } from './datebook';
import { hoursWord, weekLeft } from './hours';
import { byName, knownTips, tipConfidence, tipLine, type Conf, type Go } from './intel';

/**
 * THE DON'S DAILY BRIEF (DONS_PLANNER.md §2-3): a typed, stamped folder the consigliere hands over each
 * morning, one page, read in ten seconds. SITUATION (facts only), THREATS (each with how sure the house
 * is and how good the source is: it can be wrong), MONEY, PEOPLE, REQUESTS FOR AN AUDIENCE and
 * RECOMMENDED (his top one to three moves, with his reasons). Every line goes somewhere to act.
 *
 * Below the chair it is the capo's word instead: what he needs from you, the quota, his orders.
 * Pure: reads the state (and the UI's unsent answers); writes nothing.
 */

export type Tone = 'good' | 'bad' | 'warn';

export interface BriefLine {
  id: string;
  text: string;
  sub?: string;
  dom?: JCat | 'church' | 'shore';
  tone?: Tone;
  conf?: Conf;
  /** "B · usually reliable" */
  src?: string;
  go?: Go;
}

export interface Rec {
  id: string;
  /** "Hear Tommy out" */
  title: string;
  /** His reason. */
  why: string;
  /** 0-1 when there is a roll. */
  odds?: number;
  cta: string;
  go: Go;
  score: number;
}

export interface DailyBrief {
  low: boolean;
  stamp: string;
  /** Who hands it over ("Your consigliere, Carmine Russo"). */
  from: string;
  fromId?: string;
  date: string;
  /** "8 AM · 18 hours today · 96 this week" */
  hours: string;
  situation: BriefLine[];
  threats: BriefLine[];
  money: BriefLine[];
  people: BriefLine[];
  audience: { total: number; top: AudienceReq[]; keeper: string };
  recommended: Rec[];
}

/** Plain-language odds (EASIER_NOT_SHALLOWER #13). */
/** The odds in words: the one shared scale (decide.ts), with its article for a sentence ("It is a coin flip"). */
export function oddsWord(p: number): string {
  const w = sharedOddsWord(p);
  return w === 'long shot' || w === 'coin flip' ? `a ${w}` : w;
}

const fm = (n: number) => fmtMoney(Math.round(n));
/** End a clause with one full stop ("3 p.m." already has one). */
const dot = (x: string) => (/[.!?]$/.test(x) ? x : `${x}.`);

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

/** What happened overnight: Your File's entries for yesterday (and the week's turn on a Monday), not his own doings. */
function situation(s: GameState): BriefLine[] {
  const d = today(s);
  const es = (s.journal?.e ?? []).filter((e) => !e.mine && (d > 0 ? e.w === s.week && e.d === d - 1 : (e.w === s.week - 1 && (e.d === undefined || e.d >= 5)) || (e.w === s.week && e.d === undefined)));
  const weight = (e: (typeof es)[number]) => Math.abs(e.m ?? 0) / 100 + (e.c === 'law' || e.c === 'rivals' ? 6 : 0) + (e.c === 'family' ? 4 : 0) + Object.values(e.st ?? {}).reduce((a, v) => a + Math.abs(v ?? 0), 0);
  const out: BriefLine[] = es.slice().sort((a, b) => weight(b) - weight(a)).slice(0, 4).map((e) => ({
    id: `sit:${e.id}`, text: e.t, sub: e.x, dom: e.c, tone: (e.m ?? 0) < -500 || e.c === 'law' ? 'bad' : undefined, go: e.p?.[0] && s.characters[e.p[0]] ? { char: e.p[0] } : { file: true },
  }));
  if (!out.length) out.push({ id: 'sit:quiet', text: 'A quiet night. Nothing came over the wire.', go: { file: true } });
  const book = dayEntries(s, s.week, d).filter((e) => e.kind !== 'done' && e.kind !== 'saint');
  if (book.length) out.push({ id: 'sit:book', text: `On the book today: ${book.length} ${book.length === 1 ? 'thing' : 'things'}, first: ${book[0].title}, ${formatClock(book[0].h)}.`, go: { datebook: true } });
  return out;
}

function threats(s: GameState, low: boolean): BriefLine[] {
  const out: BriefLine[] = [];
  const tips = knownTips(s).filter((t) => !low || t.targetId === s.playerId || (t.bizId && s.businesses.find((b) => b.id === t.bizId)?.owner === 'player'));
  const rows = tips.map((t) => ({ t, l: tipLine(s, t), r: tipConfidence(s, t) })).sort((a, b) => (a.l.days ?? 99) - (b.l.days ?? 99) || b.r.est - a.r.est);
  for (const { t, l, r } of rows.slice(0, 4)) {
    out.push({ id: `thr:${t.id}`, text: `${l.text}, ${l.when}${l.days !== undefined ? ` (${l.days <= 0 ? 'today' : l.days === 1 ? 'tomorrow' : `${l.days} days`})` : ''}`, sub: `From ${t.sourceName}${r.corroborated ? ', and a second source' : ''}.`, conf: r.conf, src: `${r.src.grade} · ${r.src.word}`, dom: t.by === 'police' || t.by === 'fbi' ? 'law' : 'rivals', tone: r.conf === 'rumor' ? 'warn' : 'bad', go: { tip: t.id } });
  }
  // Storm warnings (storms.ts): the big things 1-2 weeks out that no tip names, with the odds and what would help.
  for (const x of stormWarnings(s).filter((y) => !y.id.startsWith('tip:')).slice(0, 2)) {
    const h = x.helps[0];
    out.push({ id: `thr:storm:${x.id}`, text: `Storm warning: ${stormLine(x)}.`, sub: `Mostly: ${x.why}.${h ? ` What would help: ${h.label.charAt(0).toLowerCase()}${h.label.slice(1)}.` : ''}`, conf: 'likely', src: 'B · what you can see', dom: x.domain === 'money' ? 'money' : x.domain === 'rivals' ? 'rivals' : 'law', tone: x.tone === 'red' ? 'bad' : 'warn', go: h?.go ? { tab: `${h.go.panel}${h.go.section ? `.${h.go.section}` : ''}` } : undefined });
  }
  const storm = stormClock(s);
  if (storm) out.push({ id: 'thr:storm', text: storm.text, conf: 'confirmed', src: 'A · the radio', dom: 'shore', tone: 'bad', go: { datebook: true } });
  if (s.heat.federal >= 50) out.push({ id: 'thr:fed', text: `Federal heat is up (${s.heat.federal}). Men in hats ask questions.`, conf: 'confirmed', src: 'A · your lawyer', dom: 'law', tone: 'bad', go: { tab: 'town.case' } });
  else if (s.heat.local >= 60) out.push({ id: 'thr:local', text: `The county is hot (${s.heat.local}). Raids get easy to justify.`, conf: 'confirmed', src: 'A · the precinct', dom: 'law', tone: 'warn', go: { tab: 'town.case' } });
  const tap = tapGuess(s);
  if (!low && tap >= 0.2) out.push({ id: 'thr:tap', text: 'Your phone may be tapped. Say nothing on it you would not say in church.', conf: tap >= 0.6 ? 'likely' : 'rumor', src: tap >= 0.6 ? 'B · a click on the line' : 'C · a hunch', dom: 'law', tone: 'warn', go: { phone: {} } });
  if (!low && !tips.length) {
    const hot = s.rivals.filter((r) => r.kind === 'mob').map((r) => ({ r, a: aggression(s, r).chance })).sort((a, b) => b.a - a.a)[0];
    if (hot && hot.a >= 0.25) out.push({ id: `thr:rival:${hot.r.id}`, text: `Word on the boardwalk: ${hot.r.shortName} is restless.`, conf: 'rumor', src: 'D · the street', dom: 'rivals', tone: 'warn', go: { tab: 'diplomacy' } });
  }
  if (!out.length) out.push({ id: 'thr:none', text: 'Nothing known moving against you.', conf: undefined, sub: 'What is not known is not on this page.' });
  return out.slice(0, 5);
}

function money(s: GameState, low: boolean): BriefLine[] {
  const out: BriefLine[] = [];
  const pocket = Math.round(s.tribute?.acct.personal ?? 0);
  out.push({ id: 'm:cash', text: low ? `Your pocket: ${fm(pocket || s.money)}` : `Family money ${fm(s.money)} · your pocket ${fm(pocket)}`, dom: 'money', tone: s.money < 0 ? 'bad' : undefined, go: { tab: 'holdings.money' } });
  if (low) {
    const q = quotaNow(s);
    const a = above(s);
    if (q > 0) out.push({ id: 'm:quota', text: `Monday's kick-up to ${chiefOf(s)?.firstName ?? 'your capo'}: ${fm(q)}${a?.owed ? `, plus ${fm(a.owed)} you still owe` : ''}.`, dom: 'money', tone: a?.owed ? 'warn' : undefined, go: { tab: 'borgata.place' } });
    return out;
  }
  const rep = latestReport(s);
  if (rep) out.push({ id: 'm:env', text: `The last envelope: ${fm(rep.reported)} (week ${rep.week}).`, dom: 'money', go: { office: true } });
  const lr = s.lastReport;
  if (lr) {
    const net = lr.end.money - lr.start.money;
    out.push({ id: 'm:net', text: `Last week the Family ${net >= 0 ? 'made' : 'lost'} ${fm(Math.abs(net))} after costs.`, dom: 'money', tone: net < 0 ? 'bad' : 'good', go: { tab: 'holdings.money' } });
  }
  const B = s.playerId;
  for (const l of s.deeds?.ln ?? []) {
    if (l.due > s.week + 1) continue;
    const other = s.characters[l.by === B ? l.to : l.by];
    if (!other) continue;
    out.push({ id: `m:ln:${other.id}`, text: l.by === B ? `${displayName(other)} owes you ${fm(l.amt)}, due ${l.due <= s.week ? 'this week' : 'next week'}.` : `You owe ${displayName(other)} ${fm(l.amt)}, due ${l.due <= s.week ? 'this week' : 'next week'}.`, dom: 'money', tone: l.by === B ? undefined : 'warn', go: { char: other.id } });
    if (out.length >= 4) break;
  }
  return out.slice(0, 4);
}

function people(s: GameState, low: boolean): BriefLine[] {
  const out: BriefLine[] = [];
  const B = s.playerId;
  const men = (low ? Object.values(s.characters).filter((c) => c.alive && c.id !== B && (c.faction === 'player' || c.capoId === chiefOf(s)?.id)) : crew(s)).filter((c) => c.alive && c.id !== B && isFree(s, c));
  const trouble = (c: Character): string | undefined => c.debtTo ? `owes ${fm(c.debtTo.amount)} to a shylock` : s.mg?.docket?.some((x) => x.defendantId === c.id) ? 'has a court date' : (c.evidence ?? 0) >= 60 ? 'the law has a thick file on him' : c.health < 30 ? 'is in a bad way' : undefined;
  for (const c of men) {
    const t = trouble(c);
    if (t) out.push({ id: `p:t:${c.id}`, text: `${displayName(c)} ${t}.`, dom: 'crew', tone: 'warn', go: { char: c.id } });
  }
  const sulk = s.reactions?.sulk ?? {};
  for (const c of men.filter((x) => x.faction === 'player').map((x) => ({ x, o: opinion(s, x.id, B) })).sort((a, b) => a.o - b.o)) {
    if (c.o > -20 && !(c.x.defectStage ?? 0) && !((sulk[c.x.id] ?? 0) > s.week)) break;
    out.push({ id: `p:r:${c.x.id}`, text: `${displayName(c.x)} is restless (${c.o > 0 ? '+' : ''}${c.o})${(c.x.defectStage ?? 0) >= 1 ? ': seen with the wrong people' : (sulk[c.x.id] ?? 0) > s.week ? ': sulking' : ''}.`, dom: 'crew', tone: 'bad', go: { char: c.x.id } });
    if (out.length >= 4) break;
  }
  const loyal = men.filter((x) => x.faction === 'player').map((x) => ({ x, o: opinion(s, x.id, B) })).sort((a, b) => b.o - a.o)[0];
  if (loyal && loyal.o >= 50 && out.length < 4) out.push({ id: `p:l:${loyal.x.id}`, text: `${displayName(loyal.x)} would walk through a wall for you (+${loyal.o}).`, dom: 'crew', tone: 'good', go: { char: loyal.x.id } });
  if (!out.length) out.push({ id: 'p:none', text: 'Nobody in trouble, nobody sore. Enjoy it.' });
  return out.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Recommended, and "what would the old man do?"                       */
/* ------------------------------------------------------------------ */

export function recommendations(s: GameState, ui: OfficeUi = {}, reqs?: AudienceReq[]): Rec[] {
  const out: Rec[] = [];
  const answers = ui.answers ?? {};
  for (const t of knownTips(s).filter((x) => x.status === 'waiting')) {
    const l = tipLine(s, t);
    const r = tipConfidence(s, t);
    out.push({ id: `r:tip:${t.id}`, title: `Hear ${t.sourceName} out`, why: `${dot(`${l.text}, ${l.when}`)} ${r.conf === 'rumor' ? 'Maybe nothing, but a warning with a deadline is heard before it lands.' : 'If it is true, the time to act is before it lands.'}`, cta: 'Hear him', go: { tip: t.id }, score: 92 - Math.min(20, (l.days ?? 7) * 2) });
  }
  for (const ev of eventsOut(s)) {
    if (answers[ev.iid] || !ev.mandatory) continue;
    out.push({ id: `r:ev:${ev.iid}`, title: ev.title, why: 'It will not wait past the week, and if you do not decide, it gets decided for you.', cta: 'Decide', go: { event: ev.iid }, score: 84 });
  }
  try {
    const b = briefing(s);
    for (const x of recommendedActions(s, b, ui.orders ?? [], ui.briefSkip ?? []).slice(0, 2)) {
      out.push({ id: `r:br:${x.item.id}`, title: `${x.item.topic}: ${x.option.label}`, why: x.item.reason || x.option.why, odds: x.option.chance, cta: 'Do it', go: { order: x.action }, score: 30 + Math.min(55, x.item.priority / 50) });
    }
  } catch { /* nobody seated */ }
  const top = (reqs ?? audienceRequests(s, ui)).find((r) => !r.booked && r.desp.v >= 40);
  if (top) out.push({ id: `r:aud:${top.key}`, title: `Give ${top.name} an hour`, why: `${top.desp.why.slice(0, 2).join('; ')}. A man in that kind of trouble who cannot get in to see you finds somebody else to see.`, cta: 'See him', go: { audience: true }, score: 40 + top.desp.v / 4 });
  try {
    const o = whatShouldIDo(s, 3)[0];
    if (o) out.push({ id: `r:op:${o.id}`, title: o.title, why: o.text, cta: o.cta.replace(/\s*[→▸]$/, ''), go: o.link.action ? { order: o.link.action } : o.link.charId ? { char: o.link.charId } : { tab: o.link.tab ?? 'desk' }, score: 28 + Math.min(40, o.score / 60) });
  } catch { /* nothing to suggest */ }
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.title) ? false : (seen.add(r.title), true))).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
}

export interface OldMan { voice: string; by: string; byId?: string; rec?: Rec }

/** "What would the old man do?": the consigliere's one pick on the most pressing item, with his reason. */
export function oldManPick(s: GameState, ui: OfficeUi = {}): OldMan {
  const cons = holder(s, 'consigliere');
  const who = cons && isFree(s, cons) && cons.id !== s.playerId ? cons : inTheRanks(s) ? chiefOf(s) : holder(s, 'underboss');
  const by = who ? displayName(who) : 'Your own gut';
  const rec = recommendations(s, ui)[0];
  if (!rec) return { voice: 'The old man would sit tight. Nothing on the desk is worth a move today.', by, byId: who?.id };
  const odds = rec.odds !== undefined ? ` It is ${oddsWord(rec.odds)}, ${Math.round(rec.odds * 100)}%.` : '';
  return { voice: `The old man? He would ${rec.cta.toLowerCase()}: ${dot(rec.title)} ${dot(rec.why)}${odds}`, by, byId: who?.id, rec };
}

/* ------------------------------------------------------------------ */
/* The folder                                                          */
/* ------------------------------------------------------------------ */

export function dailyBrief(s: GameState, ui: OfficeUi = {}): DailyBrief {
  const low = inTheRanks(s);
  const d = today(s);
  const boss = player(s);
  const g = gatekeeper(s);
  const chief = low ? chiefOf(s) : undefined;
  const from = low ? (chief ? `From your capo, ${displayName(chief)}` : 'From your capo') : g.id ? `Your ${g.role}, ${g.name}` : 'Typed up by your own hand';
  const reqs = low ? [] : audienceRequests(s, ui);
  const dt = s.date;
  void dt;
  return {
    low,
    stamp: low ? `FOR ${boss.firstName.toUpperCase()} · FROM THE CAPO` : 'EYES ONLY · THE DON',
    from,
    fromId: low ? chief?.id : g.id,
    date: `${DAY_NAMES[d]} morning, week ${s.week}`,
    hours: `${hoursWord(hoursLeft(s))} left today · ${hoursWord(weekLeft(s))} this week`,
    situation: situation(s),
    threats: threats(s, low),
    money: money(s, low),
    people: people(s, low),
    audience: { total: reqs.length, top: reqs.slice(0, 3), keeper: g.line },
    recommended: recommendations(s, ui, reqs),
  };
}

/** The brief opens by itself once a day, at the morning's first stop. */
export function briefDue(s: GameState): boolean {
  const P = s.planner;
  if (s.gameOver || (P && P.auto === false)) return false;
  return (P?.briefDay ?? -1) !== absDay(s);
}

export { byName };
