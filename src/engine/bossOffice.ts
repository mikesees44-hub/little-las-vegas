import { briefing } from './briefing';
import { capos, displayName, isFree, player } from './characters';
import { weekCheckIns } from './checkins';
import { holder } from './council';
import { DAY_NAMES, daysOf } from './days';
import { fmtMoney } from './effects';
import { HQ_INFO } from './hq';
import { bossInside, LAWYER } from './longgame';
import { pwView } from './powerState';
import { personalRounds } from './roundsPersonal';
import { actingBoss } from './travel';
import { bossAway, bossFugitive, isAway } from './travelState';
import { envelopeMan, latestReport } from './tribute';
import type { Character, GameState, PlayerAction } from './types';

/**
 * THE BOSS'S OFFICE, upstairs at the Shore Social Club: the room the boss
 * does business in first thing every week. Nothing here is a new system —
 * every read is off the state the rest of the game already keeps:
 *
 *  - who sits across the desk on Monday (the underboss, or whoever is
 *    acting for him; the acting boss while the boss is inside),
 *  - his one- or two-line briefing (the last count, what is waiting),
 *  - the visitors at the door: only real items (a decision with a person in
 *    it, a capo's morning problem, a sit-down item, the lawyer asking for an
 *    hour) — each with the existing default as the "let him handle it",
 *  - who the boss can phone (the lawyer, his own people, the other bosses),
 *  - how the room looks (family photographs, a memorial frame, the cane, the
 *    paper's headline, the headquarters).
 *
 * Pure: reads the state and the UI's unsent answers; never writes. Opening
 * or skipping the briefing changes nothing in the game.
 */

/** The UI's unsent bits the office reads (the same the desk reads). */
export interface OfficeUi {
  answers?: Record<string, string>;
  briefSkip?: readonly string[];
  /** Visitors the boss said to come back later (this week, UI only). */
  later?: readonly string[];
}

/* ------------------------------------------------------------------ */
/* The chair across the desk                                           */
/* ------------------------------------------------------------------ */

export type SeatRole = 'underboss' | 'acting' | 'actingBoss' | 'none';

export interface OfficeSeat {
  charId?: string;
  name: string;
  role: SeatRole;
  /** "Your underboss", "Acting for the underboss", "Acting boss while you are inside". */
  title: string;
}

/** Who sits across the desk: the acting boss while the boss is away, else the envelope man (underboss or acting). */
export function officeSeat(s: GameState): OfficeSeat {
  const abs = officeAbsence(s);
  if (abs) {
    const a = abs.actingId ? s.characters[abs.actingId] : undefined;
    return a ? { charId: a.id, name: displayName(a), role: 'actingBoss', title: abs.kind === 'prison' ? 'Acting boss while you are inside' : 'Running things while you are away' } : { name: 'Nobody', role: 'none', title: 'The chair is empty' };
  }
  const m = envelopeMan(s);
  if (!m.c) return { name: 'Nobody', role: 'none', title: 'Nobody to bring the count' };
  return { charId: m.c.id, name: displayName(m.c), role: m.acting ? 'acting' : 'underboss', title: m.acting ? `Acting for the underboss (${holder(s, 'consigliere')?.id === m.c.id ? 'your consigliere' : 'a capo'})` : 'Your underboss' };
}

/* ------------------------------------------------------------------ */
/* Monday's briefing                                                   */
/* ------------------------------------------------------------------ */

export interface OfficeBriefing {
  seat: OfficeSeat;
  /** One or two short lines, in his voice, from the real state. */
  lines: string[];
  /** What he says came in (the last report's reported figure), if there was a count. */
  count?: number;
  /** Things that need the boss: unanswered decisions and open morning problems. */
  needs: number;
  /** The waiting envelope (the report to hear), if any. */
  reportId?: string;
}

const WORDS = ['Nothing', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things', 'Six things'];
export const thingsWord = (n: number) => WORDS[n] ?? `${n} things`;

function shortFirst(c: Character | undefined): string {
  return c ? (c.nickname ? `"${c.nickname}"` : c.firstName) : 'He';
}

/** Open morning problems still to come this week (unanswered, not skipped). */
function openMornings(s: GameState) {
  const d = daysOf(s);
  return weekCheckIns(s).filter((c) => c.problem && c.day >= d.day && !d.skipped.includes(c.day) && !d.answers[c.key]);
}

export function officeBriefing(s: GameState, ui: OfficeUi = {}): OfficeBriefing {
  const seat = officeSeat(s);
  const answers = ui.answers ?? {};
  const rep = latestReport(s);
  const fresh = rep && rep.week >= s.week - 1 ? rep : undefined;
  const decisions = s.pendingEvents.filter((e) => !answers[e.iid] && e.defId !== 'tribute_audience').length;
  const needs = decisions + openMornings(s).length;
  const lines: string[] = [];
  const abs = officeAbsence(s);
  if (abs) {
    lines.push(abs.note);
    if (fresh) lines.push(`The crews brought in ${fmtMoney(fresh.reported)}. ${needs ? `${thingsWord(needs)} still want${needs === 1 ? 's' : ''} your word.` : 'He is handling the rest.'}`);
  } else if (seat.role === 'none') {
    lines.push('Nobody is waiting with a count: you have no underboss and no capo to bring it.');
    if (needs) lines.push(`${thingsWord(needs)} need${needs === 1 ? 's' : ''} you.`);
  } else if (fresh) {
    lines.push(`The crews brought in ${fmtMoney(fresh.reported)}.${fresh.status === 'presented' ? ' The envelope is on the desk.' : ''}`);
    lines.push(needs ? `${thingsWord(needs)} need${needs === 1 ? 's' : ''} you.` : 'Nothing that can\'t wait. A quiet week, so far.');
  } else {
    lines.push('No count yet: the first envelope comes next Monday.');
    lines.push(needs ? `${thingsWord(needs)} need${needs === 1 ? 's' : ''} you.` : 'Nothing that can\'t wait.');
  }
  return { seat, lines: lines.slice(0, 2), count: fresh?.reported, needs, reportId: rep?.status === 'presented' ? rep.id : undefined };
}

/* ------------------------------------------------------------------ */
/* The door: who is waiting outside                                    */
/* ------------------------------------------------------------------ */

export type VisitorKind = 'decision' | 'petition' | 'morning' | 'sitdown' | 'lawyer';

/** "Let him handle it": the existing default, made explicit. Only where one exists. */
export type DelegateOp =
  | { kind: 'answer'; iid: string; choiceId: string }
  | { kind: 'checkin'; key: string; answer: string }
  | { kind: 'order'; action: PlayerAction };

export interface OfficeVisitor {
  /** Stable for the subject (the desk's keys): "ev:<iid>", "am:<key>", "sd:<id>", "lawyer". */
  key: string;
  kind: VisitorKind;
  name: string;
  charId?: string;
  /** Why he is here, one line. */
  why: string;
  urgent?: boolean;
  /** Where "Invite in" goes: the decision, the morning, the sit-down, the calendar. */
  ref: { event?: string; day?: number; brief?: string };
  delegate?: { label: string; does: string; op: DelegateOp };
}

function clip(t: string, n = 110): string {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** The first person in a decision who is not the boss (a real character). */
function personIn(s: GameState, actors: readonly string[] | undefined): Character | undefined {
  for (const id of actors ?? []) {
    const c = s.characters[id];
    if (c && c.id !== s.playerId && c.alive) return c;
  }
  return undefined;
}

/** The visitors outside the door: real items only, in the order the desk lists them. */
export function officeVisitors(s: GameState, ui: OfficeUi = {}): OfficeVisitor[] {
  const answers = ui.answers ?? {};
  const later = new Set(ui.later ?? []);
  const out: OfficeVisitor[] = [];
  const seat = officeSeat(s);
  const by = seat.role !== 'none' ? shortFirst(seat.charId ? s.characters[seat.charId] : undefined) : undefined;
  for (const ev of s.pendingEvents) {
    if (answers[ev.iid] || ev.defId === 'tribute_audience') continue;
    const petition = ev.defId.startsWith('office_');
    const who = personIn(s, ev.actors);
    if (!who && !petition) continue;
    const def = ev.choices.find((c) => c.id === ev.defaultChoiceId && !c.disabledReason);
    out.push({
      key: `ev:${ev.iid}`, kind: petition ? 'petition' : 'decision',
      name: who ? displayName(who) : 'Somebody from town', charId: who?.id,
      why: `${ev.title}. ${clip(ev.text)}`, urgent: ev.mandatory,
      ref: { event: ev.iid },
      delegate: def && by && seat.charId !== who?.id ? { label: `Ask ${by} to handle it`, does: def.label, op: { kind: 'answer', iid: ev.iid, choiceId: def.id } } : def && by ? { label: `Let ${by} handle it`, does: def.label, op: { kind: 'answer', iid: ev.iid, choiceId: def.id } } : undefined,
    });
  }
  for (const c of openMornings(s)) {
    const p = c.problem!;
    const own = p.answers.find((a) => a.id === p.own);
    const k = s.characters[c.capoId];
    out.push({
      key: `am:${c.key}`, kind: 'morning', name: k ? displayName(k) : c.name, charId: c.capoId,
      why: `${DAY_NAMES[c.day]} morning: ${clip(p.text)}`, urgent: p.urgent,
      ref: { day: c.day },
      delegate: own ? { label: `Leave it to ${k ? shortFirst(k) : c.name}`, does: `His way: ${own.label}`, op: { kind: 'checkin', key: c.key, answer: own.id } } : undefined,
    });
  }
  const b = briefing(s);
  for (const it of b.items) {
    if (ui.briefSkip?.includes(it.id)) continue;
    const rec = it.options.find((o) => o.id === it.recommended);
    const who = it.charId ? s.characters[it.charId] : it.role === 'underboss' || it.role === 'consigliere' ? holder(s, it.role) : undefined;
    out.push({
      key: `sd:${it.id}`, kind: 'sitdown', name: who ? displayName(who) : it.speaker, charId: who?.id,
      why: `${it.topic}: ${clip(it.line)}`,
      ref: { brief: it.id },
      delegate: rec?.action && rec.id !== 'wait' ? { label: `Do what ${who ? shortFirst(who) : it.speaker} recommends`, does: rec.label, op: { kind: 'order', action: rec.action } } : undefined,
    });
  }
  const lawyer = personalRounds(s, undefined).find((r) => r.id === 'self:lawyer');
  if (lawyer?.suggestedBy) out.push({ key: 'lawyer', kind: 'lawyer', name: LAWYER, why: `${lawyer.suggestedBy}: an hour on the heat and the case.`, ref: {} });
  return out.filter((v) => !later.has(v.key));
}

/* ------------------------------------------------------------------ */
/* The phone                                                           */
/* ------------------------------------------------------------------ */

export interface PhoneEntry {
  key: string;
  name: string;
  charId?: string;
  kind: 'lawyer' | 'crew' | 'rival';
  /** "Your lawyer · on retainer", "Capo · Pine Avenue", "Boss of the Manno family". */
  role: string;
  /** Why he can't be called right now. */
  blocked?: string;
}

/** Whether the lawyer is on retainer: the boss's legal file has a defense built. */
export function lawyerRetained(s: GameState): boolean {
  const l = s.legal;
  return !!l && l.personId === s.playerId && l.defense > 0;
}

export function officePhone(s: GameState): PhoneEntry[] {
  const out: PhoneEntry[] = [{ key: 'lawyer', name: LAWYER, kind: 'lawyer', role: lawyerRetained(s) ? 'Your lawyer · on retainer' : 'The best criminal lawyer in the Delaware Valley · not on retainer' }];
  if (bossInside(s)) return out;
  const seen = new Set<string>();
  const add = (c: Character | undefined, role: string) => {
    if (!c || seen.has(c.id) || c.id === s.playerId) return;
    seen.add(c.id);
    out.push({ key: c.id, name: displayName(c), charId: c.id, kind: 'crew', role, blocked: !isFree(s, c) ? 'Inside: no phone' : isAway(s, c.id) ? 'Out of town' : undefined });
  };
  add(holder(s, 'underboss'), 'Your underboss');
  add(holder(s, 'consigliere'), 'Your consigliere');
  for (const k of capos(s)) add(k, 'Capo');
  for (const r of s.rivals) {
    if (r.kind === 'law') continue;
    const c = s.characters[r.leaderId];
    if (!c?.alive) continue;
    out.push({ key: c.id, name: displayName(c), charId: c.id, kind: 'rival', role: `Head of ${r.name}`, blocked: !isFree(s, c) ? 'Inside: no phone' : undefined });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The room                                                            */
/* ------------------------------------------------------------------ */

export interface OfficeAbsence {
  kind: 'prison' | 'away' | 'fugitive';
  actingId?: string;
  until?: number;
  note: string;
}

/** The boss is inside, on the lam, or out of town: who has the chair, from the existing rules. */
export function officeAbsence(s: GameState): OfficeAbsence | undefined {
  const boss = player(s);
  if (!boss) return undefined;
  if (bossInside(s)) {
    const a = pwView(s).acting;
    const ac = a ? s.characters[a.id] : actingBoss(s);
    return { kind: 'prison', actingId: ac?.alive ? ac.id : undefined, until: boss.imprisonedUntil, note: `You are inside until week ${boss.imprisonedUntil}. ${ac?.alive ? `${shortFirst(ac)} keeps the chair warm; ` : ''}the lawyer carries your messages.` };
  }
  if (bossFugitive(s)) {
    const ac = actingBoss(s);
    return { kind: 'fugitive', actingId: ac?.id, note: `You are on the run. ${ac ? `${shortFirst(ac)} sits behind the desk until you are back.` : 'Nobody sits behind the desk.'}` };
  }
  if (bossAway(s)) {
    const ac = actingBoss(s);
    return { kind: 'away', actingId: ac?.id, note: `You are out of town. ${ac ? `${shortFirst(ac)} minds the office.` : 'The office is locked.'}` };
  }
  return undefined;
}

export interface OfficeRoom {
  /** Framed photographs on the credenza: the living family. */
  photos: number;
  family: { id: string; name: string }[];
  /** A memorial frame (black ribbon) for a death in the family within the year. */
  memorial?: { id: string; name: string; week: number };
  /** The boss's health shows: a cane by the desk, a medicine bottle. */
  cane: boolean;
  medicine: boolean;
  health: number;
  /** The paper on the desk: the latest headline. */
  headline?: { paper: string; text: string; week: number };
  absence?: OfficeAbsence;
  /** The headquarters: the Shore Social Club, or wherever business is done instead. */
  hq: { kind: string; club: boolean; name: string };
}

export const MEMORIAL_WEEKS = 52;

export function officeRoom(s: GameState): OfficeRoom {
  const boss = player(s);
  const fam = Object.values(s.characters).filter((c) => c.dynasty && c.id !== s.playerId);
  const living = fam.filter((c) => c.alive);
  const dead = fam.filter((c) => !c.alive && c.death && s.week - c.death.week <= MEMORIAL_WEEKS).sort((a, b) => b.death!.week - a.death!.week)[0];
  const news = s.news[s.news.length - 1];
  const kind = s.econ?.hq.kind ?? 'social';
  return {
    photos: Math.min(8, living.length),
    family: living.slice(0, 8).map((c) => ({ id: c.id, name: displayName(c) })),
    memorial: dead ? { id: dead.id, name: displayName(dead), week: dead.death!.week } : undefined,
    cane: !!boss && boss.health < 45,
    medicine: !!boss && (boss.conditions.length > 0 || boss.health < 60),
    health: boss?.health ?? 100,
    headline: news ? { paper: news.paper, text: news.headline, week: news.week } : undefined,
    absence: officeAbsence(s),
    hq: { kind, club: kind === 'social', name: kind === 'social' ? 'The Shore Social Club' : HQ_INFO[kind].name },
  };
}
