/**
 * "Report a bug or idea": the artifact's shared database (`db` capability,
 * runtime contract 0.2.90). Playtesters send one document each to the
 * `feedback` collection; Claude reads them later with ArtifactData.
 *
 * Design for absence: `window.claude.use("db")` resolves null outside
 * claude.ai, in tests, signed out, or when the page does not declare `db`.
 * Then the form offers "Copy report" instead of "Send". A viewer who may not
 * write shared data (a Viewer, or a visitor from outside the owner's
 * organization by public link) gets the same copy fallback: `user.can("data.write")`
 * false up front, or a refused write (`invalid_argument`) after a try.
 *
 * Nothing personal rides along: only what the player types (the optional
 * name included) and the game's own context (start, week, in-game date, the
 * screen, the seed, the last lines of Your File).
 */
import type { GameState } from '../../engine/types';
import { bookEntries, weekLabel } from '../../engine/journal';
import { longDate } from '../../engine/scenes';
import pkg from '../../../package.json';

export const FEEDBACK_COLLECTION = 'feedback';
export type ReportType = 'bug' | 'idea' | 'story';
export const REPORT_TYPES: { id: ReportType; label: string; hint: string }[] = [
  { id: 'bug', label: 'Bug', hint: 'Something broke, looked wrong, or got stuck.' },
  { id: 'idea', label: 'Idea', hint: 'Something you wish the game did.' },
  { id: 'story', label: 'Story moment', hint: 'A scene that landed, or fell flat.' },
];
export const MAX_TEXT = 4000;
export const MAX_NAME = 60;

/** The build label (package version and save format). */
export const GAME_VERSION = `v${(pkg as { version?: string }).version ?? '0'} · save 2`;

export interface ReportContext {
  version: string;
  start: string;
  week: number;
  date: string;
  screen: string;
  seed: string;
  file: string[];
}

/** Which start this game began from (starts.ts sets `start_<key>`). */
export function startOf(s: GameState): string {
  const k = Object.keys(s.flags ?? {}).find((f) => f.startsWith('start_') && s.flags[f]);
  return k ? k.slice(6) : 'classic';
}

/** The screen the player is on, read off the page: the open drawer and section, and any card on top. */
export function currentScreen(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): string {
  if (!doc) return 'unknown';
  const parts: string[] = [];
  const drawer = doc.querySelector('[data-testid^="drawer-"]:not([data-testid="drawer-back"]):not([data-testid="drawer-close"])');
  if (drawer) {
    parts.push((drawer.getAttribute('data-testid') ?? '').replace('drawer-', 'home:'));
    const sec = drawer.querySelector('[data-testid^="section-"]:not([data-testid="section-blurb"])');
    if (sec) parts.push(sec.getAttribute('data-testid')!.replace('section-', ''));
  } else parts.push('map');
  for (const t of ['decision-card', 'urgent-meeting', 'sitdown', 'phone-window', 'office-panel', 'book', 'travel-picker']) {
    if (doc.querySelector(`[data-testid="${t}"]`)) parts.push(`+${t}`);
  }
  return parts.join(' ');
}

export function buildContext(s: GameState, screen = currentScreen()): ReportContext {
  const file = bookEntries(s).slice(-3).map((e) => `${weekLabel(e.w)}: ${e.t}`.slice(0, 240));
  return {
    version: GAME_VERSION,
    start: startOf(s),
    week: s.week,
    date: longDate(s.date),
    screen,
    seed: String(s.seed),
    file,
  };
}

/** The report as plain text (the copy fallback, and what the player sees attached). */
export function reportText(type: ReportType, text: string, name: string, ctx: ReportContext): string {
  const label = REPORT_TYPES.find((t) => t.id === type)?.label ?? type;
  return [
    `Little Las Vegas: ${label}${name.trim() ? ` from ${name.trim()}` : ''}`,
    '',
    text.trim(),
    '',
    `Game ${ctx.version} · start ${ctx.start} · week ${ctx.week} · ${ctx.date}`,
    `Screen: ${ctx.screen} · seed ${ctx.seed}`,
    ...(ctx.file.length ? ['Last in Your File:', ...ctx.file.map((l) => `  - ${l}`)] : []),
  ].join('\n');
}

/** One feedback document (the shape Claude reads back). */
export function reportDoc(type: ReportType, text: string, name: string, ctx: ReportContext, at = new Date().toISOString()): Record<string, unknown> {
  return {
    type,
    text: text.trim().slice(0, MAX_TEXT),
    ...(name.trim() ? { name: name.trim().slice(0, MAX_NAME) } : {}),
    at,
    ctx: { ...ctx },
  };
}

/* ------------------------------------------------------------------ */
/* The capability                                                      */
/* ------------------------------------------------------------------ */

type DocSnap = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
type QuerySnap = { docs: DocSnap[] };
export interface FeedbackQuery {
  orderBy(field: string, dir?: 'asc' | 'desc'): FeedbackQuery;
  limit(n: number): FeedbackQuery;
  onSnapshot(next: (q: QuerySnap) => void, error?: (e: { code: string }) => void): () => void;
}
export interface FeedbackCollection extends FeedbackQuery {
  add(data: Record<string, unknown>): Promise<unknown>;
}
export interface FeedbackDb { collection(path: string): FeedbackCollection }
interface UserNs { can(name: string): Promise<boolean | null>; canEdit(): Promise<boolean> }
type Host = { use?: (name: string) => Promise<unknown> };

export interface Channel {
  /** 'db': Send writes a document. 'copy': no store here, copy the report instead. */
  mode: 'db' | 'copy';
  db?: FeedbackDb;
  /** The owner or an editor: may open the "Feedback received" list. */
  reader: boolean;
}

let pending: Promise<Channel> | undefined;

function host(): Host | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { claude?: Host }).claude : undefined;
}

/** Where a report goes in this view (resolved once per page; never rejects). */
export function feedbackChannel(): Promise<Channel> {
  if (!pending) {
    const h = host();
    pending = !h?.use
      ? Promise.resolve<Channel>({ mode: 'copy', reader: false })
      : (async (): Promise<Channel> => {
        try {
          const [db, user] = await Promise.all([
            h.use!('db').catch(() => null) as Promise<FeedbackDb | null>,
            h.use!('user').catch(() => null) as Promise<UserNs | null>,
          ]);
          if (!db || typeof db.collection !== 'function') return { mode: 'copy', reader: false };
          // null = the platform said nothing (an outside visitor, an older host): keep Send and let a refused write decide.
          const can = user ? await user.can('data.write').catch(() => null) : null;
          const reader = user ? await user.canEdit().catch(() => false) : false;
          return { mode: can === false ? 'copy' : 'db', db, reader: !!reader };
        } catch {
          return { mode: 'copy', reader: false };
        }
      })();
  }
  return pending;
}

/** Tests: forget the resolved channel. */
export function resetFeedbackChannel(): void {
  pending = undefined;
}

export type SendResult = { ok: true } | { ok: false; code: string; fallback: boolean };

/** Write one report. A refusal that retrying cannot fix says so (`fallback`: offer the copy instead). */
export async function sendReport(db: FeedbackDb, doc: Record<string, unknown>): Promise<SendResult> {
  const once = () => db.collection(FEEDBACK_COLLECTION).add(doc);
  try {
    await once();
    return { ok: true };
  } catch (e) {
    let code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'unavailable';
    if (code === 'unavailable') {
      // Transient: one retry after a short randomized delay (db.d.ts).
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
      try { await once(); return { ok: true }; } catch (e2) { code = typeof (e2 as { code?: unknown })?.code === 'string' ? (e2 as { code: string }).code : 'unavailable'; }
    }
    const fallback = code !== 'resource_exhausted';
    return { ok: false, code, fallback };
  }
}

/** Copy text to the clipboard; false if the page may not (the form then shows the text to select). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand?.('copy') ?? false;
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
