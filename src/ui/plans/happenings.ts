import { displayName } from '../../engine/characters';
import { heatBand } from '../../engine/heat';
import { stageLabel } from '../../engine/longgame';
import { SCHEME_INFO } from '../../engine/schemes';
import { urgentMeetings } from '../../engine/threats';
import { HEAT_BARS, type GameState } from '../../engine/types';
import { weekHeadlines } from '../clock';
import type { Route } from '../shell/routes';
import type { MapFocus } from '../shell/context';

/**
 * WHAT JUST HAPPENED: the live alerts as the days tick. Pure: the difference
 * between the state before and after a day (or a week) — a rival moved, an
 * urgent meeting, one of your schemes moved along or ended, a plot against
 * you came to light, the cops, a deal closed, a building done, a birth, a
 * death, an arrest. Each has a severity colour and where a click goes.
 * "Interrupt" happenings stop the running clock.
 *
 * And the rate limiter that keeps it from spamming: one toast at a time,
 * a gap between them, the same thing never twice, and low-priority news
 * only in the strip (or not at all, with "Quiet").
 */
export type HapSeverity = 'info' | 'good' | 'warn' | 'danger';
export type HapKind = 'rival' | 'urgent' | 'scheme' | 'plot' | 'cops' | 'deal' | 'family' | 'law' | 'decision' | 'money';

export interface Happening {
  /** Stable: the same happening is never shown twice. */
  key: string;
  kind: HapKind;
  severity: HapSeverity;
  text: string;
  /** Stops the running clock. */
  interrupt?: boolean;
  go?: { route?: Route; charId?: string; urgent?: string; focus?: Omit<MapFocus, 'nonce'>; decisions?: boolean };
  week: number;
}

const BAND = ['cold', 'warm', 'hot', 'boiling'];

/** What changed between two states of the same game. Empty for a different game (a load, a new game). */
export function happenings(prev: GameState, next: GameState): Happening[] {
  if (prev === next || prev.seed !== next.seed || next.week < prev.week || next.gameOver) return [];
  const out: Happening[] = [];
  const w = next.week;
  // A rival moved.
  for (const r of next.rivals) {
    const m = r.lastMove;
    const was = prev.rivals.find((x) => x.id === r.id)?.lastMove;
    if (!m || (was && was.week === m.week && was.text === m.text)) continue;
    const vs = m.target === 'player';
    out.push({ key: `rv:${r.id}:${m.week}:${m.text}`, kind: 'rival', severity: vs ? (m.move === 'strike' ? 'danger' : 'warn') : 'info', text: `${r.shortName}: ${m.text}`, interrupt: vs && m.move === 'strike', go: { focus: { mode: 'rival', level: 'wildwood' } }, week: w });
  }
  // Somebody asks for an urgent meeting.
  const before = new Set(urgentMeetings(prev).map((u) => u.id));
  for (const u of urgentMeetings(next).filter((x) => !before.has(x.id) && x.status === 'waiting')) {
    out.push({ key: `tip:${u.id}`, kind: 'urgent', severity: 'danger', text: `${u.who} wants to see you: urgent (${u.when.toLowerCase()})`, interrupt: true, go: { urgent: u.id }, week: w });
  }
  // Your schemes: a step along, done, or blown.
  const prevSc = new Map(prev.schemes.map((x) => [x.id, x]));
  const nextSc = new Map(next.schemes.map((x) => [x.id, x]));
  for (const sc of next.schemes.filter((x) => x.owner === 'player')) {
    const p = prevSc.get(sc.id);
    const nm = SCHEME_INFO[sc.kind].name;
    const t = sc.targetId && next.characters[sc.targetId] ? `: ${displayName(next.characters[sc.targetId])}` : '';
    if (!p) continue;
    if (sc.discovered && !p.discovered) out.push({ key: `scb:${sc.id}`, kind: 'scheme', severity: 'danger', text: `Your ${nm.toLowerCase()}${t} was discovered`, interrupt: true, go: { route: { panel: 'ops', section: 'progress' } }, week: w });
    else for (const mark of [50, 75]) if (p.progress < mark && sc.progress >= mark) out.push({ key: `scp:${sc.id}:${mark}`, kind: 'scheme', severity: 'info', text: `${nm}${t}: ${sc.progress}% along`, go: { route: { panel: 'ops', section: 'progress' } }, week: w });
  }
  for (const p of prev.schemes.filter((x) => x.owner === 'player' && !nextSc.has(x.id))) {
    const t = p.targetId ? next.characters[p.targetId] : undefined;
    const done = p.kind === 'murder' && t && !t.alive;
    out.push({ key: `sce:${p.id}`, kind: 'scheme', severity: done ? 'good' : 'warn', text: `${SCHEME_INFO[p.kind].name}${t ? `: ${displayName(t)}` : ''} ${done ? 'is done' : 'has ended: see the week\'s report'}`, go: { route: { panel: 'ops', section: 'progress' } }, week: w });
  }
  // A plot against you came to light.
  for (const sc of next.schemes.filter((x) => x.owner !== 'player' && x.discovered && !prevSc.get(x.id)?.discovered)) {
    const r = next.rivals.find((x) => x.id === sc.owner);
    const vs = sc.targetId === next.playerId ? 'you' : sc.targetId && next.characters[sc.targetId] ? displayName(next.characters[sc.targetId]) : 'your family';
    out.push({ key: `rs:${sc.id}`, kind: 'plot', severity: 'danger', text: `${r?.shortName ?? 'A rival'} is plotting against ${vs} (${sc.progress}% ready)`, interrupt: true, go: { route: { panel: 'ops', section: 'progress' } }, week: w });
  }
  // The cops (and the feds, and Philadelphia): the heat crosses a band.
  for (const b of HEAT_BARS) {
    const a = BAND.indexOf(heatBand(prev.heat[b]));
    const z = BAND.indexOf(heatBand(next.heat[b]));
    if (z > a && z >= 2) out.push({ key: `heat:${b}:${w}:${z}`, kind: 'cops', severity: z >= 3 ? 'danger' : 'warn', text: b === 'local' ? `Cops seen around your places: local heat ${next.heat[b]}` : b === 'federal' ? `Men in grey suits asking questions: federal heat ${next.heat[b]}` : `Philadelphia is watching: family heat ${next.heat[b]}`, interrupt: z >= 3, go: { focus: { mode: 'heat', level: 'wildwood' }, route: { panel: 'town', section: 'case' } }, week: w });
  }
  const pl = prev.legal?.personId === prev.playerId ? prev.legal : undefined;
  const nl = next.legal?.personId === next.playerId ? next.legal : undefined;
  if (nl && nl.stage !== 'quiet' && nl.stage !== pl?.stage) out.push({ key: `law:${nl.stage}:${w}`, kind: 'law', severity: 'danger', text: stageLabel(nl), interrupt: true, go: { route: { panel: 'town', section: 'case' } }, week: w });
  // A deal closed: a place is yours, a building done.
  const prevLots = new Map((prev.econ?.lots ?? []).map((l) => [l.id, l]));
  for (const l of next.econ?.lots ?? []) {
    const p = prevLots.get(l.id);
    if (!p) continue;
    if (l.owner === 'player' && p.owner !== 'player') out.push({ key: `lot:${l.id}:${w}`, kind: 'deal', severity: 'good', text: `The deal closed: ${l.address} is yours`, go: { route: { panel: 'holdings', section: 'property' } }, week: w });
    else if (l.owner === 'player' && p.stage !== l.stage && !!p.stage && !l.stage) out.push({ key: `built:${l.id}`, kind: 'deal', severity: 'good', text: `Built: ${l.address} is finished`, go: { route: { panel: 'holdings', section: 'property' } }, week: w });
  }
  const prevBiz = new Set(prev.businesses.filter((b) => b.owner === 'player').map((b) => b.id));
  for (const b of next.businesses.filter((x) => x.owner === 'player' && !prevBiz.has(x.id))) out.push({ key: `biz:${b.id}`, kind: 'deal', severity: 'good', text: `${b.name} is yours now`, go: { route: { panel: 'holdings', section: 'rackets' } }, week: w });
  // The family: births, deaths, killings, arrests.
  for (const h of weekHeadlines(prev, next)) out.push({ key: `fam:${h.kind}:${h.text}`, kind: 'family', severity: h.kind === 'birth' ? 'good' : h.kind === 'hit' || h.kind === 'arrest' ? 'danger' : 'warn', text: h.text, interrupt: h.kind === 'hit' || h.kind === 'arrest', week: w });
  // New decisions on the desk.
  const pe = new Set(prev.pendingEvents.map((e) => e.iid));
  const fresh = next.pendingEvents.filter((e) => !pe.has(e.iid));
  if (fresh.length) out.push({ key: `dec:${fresh.map((e) => e.iid).join(',')}`, kind: 'decision', severity: fresh.some((e) => e.mandatory) ? 'warn' : 'info', text: fresh.length === 1 ? `New on your desk: ${fresh[0].title}` : `${fresh.length} new decisions on your desk`, go: { decisions: true }, week: w });
  if (next.money < 0 && prev.money >= 0) out.push({ key: `red:${w}`, kind: 'money', severity: 'danger', text: 'The Family is in the red: payroll is short', interrupt: true, go: { route: { panel: 'holdings', section: 'money' } }, week: w });
  return out;
}

/* ------------------------------------------------------------------ */
/* Not spamming                                                        */
/* ------------------------------------------------------------------ */

export interface FeedState {
  /** The strip: newest first, a short memory. */
  feed: Happening[];
  /** Toasts waiting their turn. */
  queue: Happening[];
  seen: string[];
  lastToastAt: number;
}

export const FEED_MAX = 30;
export const TOAST_GAP_MS = 3500;
export const QUEUE_MAX = 3;

export function emptyFeed(): FeedState {
  return { feed: [], queue: [], seen: [], lastToastAt: 0 };
}

/** Does it get a toast (beyond the strip)? Info never; good news only when not quiet. */
export function toastWorthy(h: Happening, quiet: boolean): boolean {
  if (h.severity === 'info') return false;
  if (h.severity === 'good') return !quiet;
  return true;
}

/** Take in new happenings: never the same key twice; the toast queue keeps the worst few. */
export function ingest(f: FeedState, hs: readonly Happening[], quiet: boolean): FeedState {
  const seen = new Set(f.seen);
  const fresh = hs.filter((h) => !seen.has(h.key));
  if (!fresh.length) return f;
  for (const h of fresh) seen.add(h.key);
  const rank = { danger: 0, warn: 1, good: 2, info: 3 } as const;
  const queue = [...f.queue, ...fresh.filter((h) => toastWorthy(h, quiet))].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, QUEUE_MAX);
  const strip = quiet ? fresh.filter((h) => h.severity !== 'info') : fresh;
  return { ...f, feed: [...strip.reverse(), ...f.feed].slice(0, FEED_MAX), queue, seen: [...seen].slice(-400) };
}

/** The next toast, if the gap since the last one has passed. */
export function nextToast(f: FeedState, now: number): { f: FeedState; toast?: Happening } {
  if (!f.queue.length || now - f.lastToastAt < TOAST_GAP_MS) return { f };
  const [toast, ...rest] = f.queue;
  return { f: { ...f, queue: rest, lastToastAt: now }, toast };
}
