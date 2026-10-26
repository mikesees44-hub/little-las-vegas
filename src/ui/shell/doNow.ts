import type { AlertKind } from '../../engine/alerts';
import { capos, displayName } from '../../engine/characters';
import { holder, SEAT_INFO, SEATS } from '../../engine/council';
import { idleMen } from '../../engine/business';
import type { Opportunity } from '../../engine/opportunities';
import type { GameState } from '../../engine/types';
import type { ShellAlert } from './alertRoutes';
import { resolveRoute } from './nav';
import type { HomeId, Route } from './routes';

/**
 * "Do this now": the two or three things on each home's front page that
 * want the boss today, each one click from the screen that answers it.
 * Pure: built from the alerts, the "what should I do" list and a few
 * home-specific checks (decisions on the desk, an empty council seat, the
 * envelope waiting). The shell renders it and carries out the act.
 */
export type DoNowAct =
  | { kind: 'decisions' }
  | { kind: 'sitdown'; tab: 'council' | 'rounds' }
  | { kind: 'office'; reportId?: string }
  | { kind: 'route'; route: Route }
  | { kind: 'alert'; alert: ShellAlert }
  | { kind: 'opp'; opp: Opportunity };

export interface DoNowItem {
  id: string;
  tone: 'danger' | 'warn' | 'info' | 'good';
  title: string;
  text?: string;
  cta: string;
  act: DoNowAct;
}

export interface DoNowInput {
  alerts: ShellAlert[];
  opps: Opportunity[];
  /** Decisions not answered yet. */
  unanswered: number;
  /** Things the sit-down has for the boss. */
  brief: number;
}

/** Alerts that carry no route: the home they belong to. */
const KIND_HOME: Partial<Record<AlertKind, HomeId>> = {
  unhappy: 'family', defector: 'family', faction: 'family', heir: 'family', family: 'family', books: 'family',
  money: 'money', loan: 'money', debt: 'money',
  staff: 'biz',
  heat: 'you', law: 'you', evidence: 'you', lifestyle: 'you',
  dispute: 'town', war: 'town', rival: 'town', courted: 'town', underbelly: 'town',
  scheme: 'week', goal: 'you',
};

/** Opportunities whose link points at a generic tab: the home they are really about. */
function oppHome(o: Opportunity): HomeId | undefined {
  if (/^heat:|^evidence$|^stress$|^lifestyle$|^perk$/.test(o.id)) return 'you';
  if (/^unwashed$|^broke$|^cut-|^lend$/.test(o.id)) return 'money';
  if (/^goal:/.test(o.id)) return 'week';
  if (/^idle$|^racket$|^staff$/.test(o.id)) return 'biz';
  if (/^plot$|^unhappy:|^drift:|^pressure:|^heir$|^books$|^bones$/.test(o.id)) return 'family';
  if (/^dispute:|^official$/.test(o.id)) return 'town';
  if (o.link.role?.kind === 'capo' || o.link.role?.kind === 'seat') return 'family';
  return o.link.tab ? resolveRoute(o.link.tab).home : undefined;
}

export function alertHome(a: ShellAlert): HomeId | undefined {
  if (a.kind === 'decision') return 'week';
  const r = a.route ? resolveRoute(a.route).home : undefined;
  // A heat alert points at the case; the case lives with the boss.
  return r ?? KIND_HOME[a.kind];
}

const SEV = { danger: 0, warn: 1, good: 2, info: 3 } as const;

/** Everything for one home, most urgent first (the strip shows the first three). */
export function doNow(s: GameState, home: HomeId, x: DoNowInput): DoNowItem[] {
  if (s.gameOver) return [];
  const out: DoNowItem[] = [];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (home === 'week') {
    if (x.unanswered > 0) out.push({ id: 'decisions', tone: 'warn', title: `${plural(x.unanswered, 'decision')} on your desk`, text: 'Answer them before the week turns, or they are decided for you.', cta: 'Read them', act: { kind: 'decisions' } });
    if (x.brief > 0) out.push({ id: 'sitdown', tone: 'info', title: `The sit-down: ${plural(x.brief, 'thing')} from your people`, text: 'Your underboss, consigliere and the rest, each with a recommendation.', cta: 'Hear them', act: { kind: 'sitdown', tab: 'council' } });
  }
  if (home === 'money') {
    const rep = s.tribute?.reports[s.tribute.reports.length - 1];
    if (rep?.status === 'presented') out.push({ id: 'envelope', tone: 'warn', title: `The envelope is on your desk: $${rep.presented.toLocaleString('en-US')}`, text: 'Your underboss is waiting for your split.', cta: 'See him', act: { kind: 'office', reportId: rep.id } });
  }
  if (home === 'family') {
    const empty = SEATS.filter((st) => !holder(s, st));
    if (empty.length && !x.opps.some((o) => o.link.role?.kind === 'seat')) out.push({ id: 'seats', tone: 'warn', title: empty.length === 1 ? `The ${SEAT_INFO[empty[0]].name.toLowerCase()} seat is empty` : `${empty.length} council seats are empty`, text: 'An empty seat does no job this week.', cta: 'Fill it', act: { kind: 'route', route: { panel: 'borgata', section: 'council' } } });
    const idleCapos = capos(s).filter((c) => !s.districts.some((d) => d.capoId === c.id));
    if (idleCapos.length) out.push({ id: 'idle-capos', tone: 'info', title: idleCapos.length === 1 ? `${displayName(idleCapos[0])} has no district` : `${idleCapos.length} capos without a district`, text: 'A capo with nothing to run earns nothing and starts to wonder.', cta: 'Give him one', act: { kind: 'route', route: { panel: 'borgata', section: 'capos' } } });
    const idle = idleMen(s).length;
    if (idle >= 3) out.push({ id: 'idle-men', tone: 'info', title: `${idle} men with nothing to do`, text: 'Start a racket or open a place and they go to work.', cta: 'Put them to work', act: { kind: 'route', route: { panel: 'holdings', section: 'hub' } } });
  }
  const alerts = x.alerts.filter((a) => a.kind !== 'decision' && alertHome(a) === home)
    .map((a): DoNowItem => ({ id: `a:${a.key}`, tone: a.severity, title: a.title, text: a.text, cta: a.charId ? 'See him' : 'Go', act: { kind: 'alert', alert: a } }));
  const seen = new Set(alerts.map((a) => a.title));
  const opps = x.opps.filter((o) => oppHome(o) === home && !seen.has(o.title))
    .map((o): DoNowItem => ({ id: `o:${o.id}`, tone: o.kind === 'threat' ? 'warn' : 'good', title: o.title, text: o.text, cta: o.cta.replace(/\s*→\s*$/, ''), act: { kind: 'opp', opp: o } }));
  const rest = [...alerts.filter((a) => a.tone !== 'info'), ...opps, ...alerts.filter((a) => a.tone === 'info')];
  rest.sort((a, b) => SEV[a.tone] - SEV[b.tone]);
  return [...out, ...rest];
}
