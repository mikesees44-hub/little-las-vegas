import { officeVisitors, type OfficeVisitor } from './bossOffice';
import { latestReport } from './tribute';
import { urgentMeetings } from './threats';
import { actTitle, docketOf, ifSilent, pendingAsks } from './lieutenants';
import { openAsks, TRADES, TROUBLE_WORD, troubled } from './placeAsks';
import { today } from './days';
import { eventsOut } from './eventDays';
import type { GameState, PlayerAction } from './types';
import type { Stakes } from './attention';

/**
 * THE INBOX: the one list of what wants the boss right now, and its one
 * count. The top bar's "Waiting on you", the Week tab's desk, the Office door
 * and the underboss's "N things need you" all read this; each screen is a view
 * of it, never its own list. Red: it lands soon whether he answers or not;
 * amber: a decision or a request waiting on his word; gold: worth a look
 * (the sit-down's items, the envelope, the lawyer).
 *
 * Built on the door (bossOffice.officeVisitors, with nothing put off) so the
 * door and the inbox can never disagree; plus what the door never showed:
 * decisions with nobody at the door, the urgent meetings, the envelope.
 * The lieutenants' proposals waiting on his word are here too (lieutenants.ts).
 * Items put off "for later" stay in the inbox (they still want him): the door
 * only hides them from its own list. Pure.
 */
export type InboxTone = 'red' | 'amber' | 'gold';
export type InboxKind = 'urgent' | 'decision' | 'petition' | 'morning' | 'sitdown' | 'envelope' | 'lawyer' | 'lieutenant' | 'request';

export interface InboxItem {
  /** Stable for the subject; the door's keys ("ev:<iid>", "am:<key>", "sd:<id>", "lawyer") plus "tip:<id>", "envelope". */
  key: string;
  kind: InboxKind;
  tone: InboxTone;
  title: string;
  /** One line: why it is here. */
  why: string;
  charId?: string;
  /** What is on the line (engine/attention.ts fills it; the inbox itself never does). */
  stakes?: Stakes;
  ref: { event?: string; day?: number; brief?: string; tip?: string; envelope?: string; /** A lieutenant's proposal (lieutenants.ts act id). */ lt?: string; /** A man asking to run his racket at your place (placeAsks.ts). */ ask?: string; /** Trouble at a tenant's racket (placeAsks.ts). */ trouble?: string };
}

export interface InboxUi {
  answers?: Record<string, string>;
  briefSkip?: readonly string[];
  /** This week's orders (a sit-down item already ordered is answered). */
  orders?: readonly PlayerAction[];
}

const TONE_ORDER: Record<InboxTone, number> = { red: 0, amber: 1, gold: 2 };

function fromVisitor(v: OfficeVisitor): InboxItem {
  const tone: InboxTone = v.urgent ? 'red' : v.kind === 'sitdown' || v.kind === 'lawyer' ? 'gold' : 'amber';
  return { key: v.key, kind: v.kind, tone, title: v.name, why: v.why, charId: v.charId, ref: { ...v.ref } };
}

export function inbox(s: GameState, ui: InboxUi = {}): InboxItem[] {
  if (s.gameOver) return [];
  const answers = ui.answers ?? {};
  const out: InboxItem[] = [];
  for (const u of urgentMeetings(s)) {
    if (u.status !== 'waiting' && u.response) continue;
    out.push({ key: `tip:${u.id}`, kind: 'urgent', tone: 'red', title: u.status === 'waiting' ? `${u.who} wants to see you` : `${u.who}: what do we do?`, why: `${u.when}: "${u.hint}"`, charId: u.charId, ref: { tip: u.id } });
  }
  let asks: ReturnType<typeof pendingAsks> = [];
  try { asks = pendingAsks(s); } catch { /* nobody seated yet */ }
  const door = officeVisitors(s, { answers, briefSkip: ui.briefSkip, orders: ui.orders });
  out.push(...door.map(fromVisitor));
  const atDoor = new Set(door.map((v) => v.key));
  let envelope = false;
  // A decision comes out on its day (daily.ts): until then it is not on the desk.
  for (const ev of eventsOut(s)) {
    if (answers[ev.iid] || atDoor.has(`ev:${ev.iid}`)) continue;
    if (ev.defId === 'tribute_audience') { envelope = true; continue; }
    out.push({ key: `ev:${ev.iid}`, kind: 'decision', tone: ev.mandatory ? 'red' : 'amber', title: ev.title, why: ev.text.length > 110 ? `${ev.text.slice(0, 109)}…` : ev.text, ref: { event: ev.iid } });
  }
  // The underboss's and the consigliere's proposals (Ask me first): red on the day he acts.
  {
    const d = today(s);
    for (const a of asks) out.push({ key: `lt:${a.id}`, kind: 'lieutenant', tone: a.day <= d ? 'red' : 'amber', title: actTitle(s, a), why: `"${a.line}" ${ifSilent(a)}`, charId: a.byId, ref: { lt: a.id } });
  }
  // A man asking to run his racket out of your place (placeAsks.ts), unless a lieutenant has it on his docket.
  {
    let covered = new Set<string>();
    try { covered = new Set(docketOf(s).map((a) => a.id.split(':').slice(1).join(':'))); } catch { /* nobody seated yet */ }
    for (const a of openAsks(s)) {
      if (covered.has(`place:${a.id}`)) continue;
      out.push({ key: `ask:${a.id}`, kind: 'request', tone: 'gold', title: `${a.name} asks to run ${TRADES[a.trade].what} at ${a.placeName}`, why: `${a.cut}% of ~$${a.gross.toLocaleString('en-US')} a week to you. Answer by week ${a.until}.`, charId: a.who, ref: { ask: a.id } });
    }
    for (const [id, t] of troubled(s)) {
      if (covered.has(`trouble:${id}`)) continue;
      out.push({ key: `trouble:${id}`, kind: 'request', tone: s.week - t.trouble!.w >= 3 ? 'amber' : 'gold', title: `Trouble at ${t.placeName}`, why: `${t.name}'s ${TRADES[t.trade].what}: ${TROUBLE_WORD[t.trouble!.k]}. Left alone a month, it gets worse.`, charId: t.who, ref: { trouble: id } });
    }
  }
  const rep = latestReport(s);
  if (envelope || rep?.status === 'presented') out.push({ key: 'envelope', kind: 'envelope', tone: 'gold', title: 'The envelope is on your desk', why: 'Your cut of the week\'s take: the split is yours to make.', ref: { envelope: rep?.id } });
  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

/** The one count: how many things want the boss. */
export function inboxCount(s: GameState, ui: InboxUi = {}): number {
  return inbox(s, ui).length;
}

/** The count and its worst tone, for a badge. */
export function inboxBadge(s: GameState, ui: InboxUi = {}): { n: number; tone?: InboxTone } {
  const items = inbox(s, ui);
  return { n: items.length, tone: items[0]?.tone };
}
