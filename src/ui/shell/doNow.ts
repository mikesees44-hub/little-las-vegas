import type { AlertKind } from '../../engine/alerts';
import { can } from '../../engine/rankView';
import { capos, displayName } from '../../engine/characters';
import { holder, SEAT_INFO, SEATS } from '../../engine/council';
import { idleMen } from '../../engine/business';
import { racketGaps } from '../../engine/racketMenu';
import { defaultMan, jobLock, JOBS_BY_ID, weekTip } from '../../engine/dirtyWork';
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
  /** Today's morning meeting and evening (the day window). */
  | { kind: 'day' }
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
  /** Problems at this morning's meeting still waiting on an answer (who brought the first, and whether it is urgent). */
  morning?: { open: number; name?: string; urgent?: boolean };
}

/** Alerts that carry no route: the home they belong to. */
const KIND_HOME: Partial<Record<AlertKind, HomeId>> = {
  unhappy: 'org', defector: 'org', faction: 'org', heir: 'house', family: 'house', books: 'org',
  money: 'money', loan: 'money', debt: 'money',
  staff: 'money',
  heat: 'law', law: 'law', evidence: 'law', lifestyle: 'house', protect: 'law',
  dispute: 'rivals', war: 'rivals', rival: 'rivals', courted: 'org', underbelly: 'town',
  scheme: 'desk', goal: 'org',
};

/** Opportunities whose link points at a generic tab: the home they are really about. */
function oppHome(o: Opportunity): HomeId | undefined {
  if (/^heat:|^evidence$/.test(o.id)) return 'law';
  if (/^stress$|^lifestyle$|^perk$/.test(o.id)) return 'house';
  if (/^unwashed$|^broke$|^cut-|^lend$/.test(o.id)) return 'money';
  if (/^goal:/.test(o.id)) return 'org';
  if (/^idle$|^racket$|^staff$/.test(o.id)) return 'money';
  if (/^plot$|^unhappy:|^drift:|^pressure:|^heir$|^books$|^bones$/.test(o.id)) return 'org';
  if (/^dispute:/.test(o.id)) return 'rivals';
  if (/^official$/.test(o.id)) return 'town';
  if (o.link.role?.kind === 'capo' || o.link.role?.kind === 'seat') return 'org';
  return o.link.tab ? resolveRoute(o.link.tab).home : undefined;
}

export function alertHome(a: ShellAlert): HomeId | undefined {
  if (a.kind === 'decision') return 'desk';
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
  if (home === 'desk') {
    if (x.unanswered > 0) out.push({ id: 'decisions', tone: 'warn', title: `${plural(x.unanswered, 'decision')} on your desk`, text: 'Answer them before the week turns, or they are decided for you.', cta: 'Read them', act: { kind: 'decisions' } });
    if (x.morning && x.morning.open > 0) out.push({ id: 'morning', tone: x.morning.urgent ? 'danger' : 'warn', title: x.morning.open === 1 ? `${x.morning.name ?? 'A capo'} has a problem at this morning's meeting` : `${x.morning.open} problems at this morning's meeting`, text: 'One tap to answer. Leave it and he does it his own way, and notices.', cta: 'Hear him', act: { kind: 'day' } });
    if (x.brief > 0 && can(s, 'sitdown')) out.push({ id: 'sitdown', tone: 'info', title: `The sit-down: ${plural(x.brief, 'thing')} from your people`, text: 'Your underboss, consigliere and the rest, each with a recommendation.', cta: 'Hear them', act: { kind: 'sitdown', tab: 'council' } });
  }
  if (home === 'money') {
    const rep = s.tribute?.reports[s.tribute.reports.length - 1];
    if (rep?.status === 'presented') out.push({ id: 'envelope', tone: 'warn', title: `The envelope is on your desk: $${rep.presented.toLocaleString('en-US')}`, text: 'Your underboss is waiting for your split.', cta: 'See him', act: { kind: 'office', reportId: rep.id } });
  }
  if (home === 'org') {
    const empty = SEATS.filter((st) => !holder(s, st));
    if (empty.length && can(s, 'council') && !x.opps.some((o) => o.link.role?.kind === 'seat')) out.push({ id: 'seats', tone: 'warn', title: empty.length === 1 ? `The ${SEAT_INFO[empty[0]].name.toLowerCase()} seat is empty` : `${empty.length} council seats are empty`, text: 'An empty seat does no job this week.', cta: 'Fill it', act: { kind: 'route', route: { panel: 'borgata', section: 'council' } } });
    const idleCapos = capos(s).filter((c) => !s.districts.some((d) => d.capoId === c.id));
    if (idleCapos.length) out.push({ id: 'idle-capos', tone: 'info', title: idleCapos.length === 1 ? `${displayName(idleCapos[0])} has no district` : `${idleCapos.length} capos without a district`, text: 'A capo with nothing to run earns nothing and starts to wonder.', cta: 'Give him one', act: { kind: 'route', route: { panel: 'borgata', section: 'capos' } } });
    const idle = idleMen(s).length;
    if (idle >= 3) out.push({ id: 'idle-men', tone: 'info', title: `${idle} men with nothing to do`, text: 'Start a racket or open a place and they go to work.', cta: 'Put them to work', act: { kind: 'route', route: { panel: 'holdings', section: 'hub' } } });
  }
  if (home === 'money') {
    // Rackets & steady earners (racketMenu.ts): impossible to miss.
    const g = racketGaps(s);
    const hub: DoNowAct = { kind: 'route', route: { panel: 'holdings', section: 'hub' } };
    if (g.rackets < 3) out.push({ id: 'start-racket', tone: 'good', title: g.rackets ? `Only ${plural(g.rackets, 'racket')} running` : 'No rackets running yet', text: 'Protection, untaxed smokes, a numbers bank, the book, guns, the Madam\'s arrangement: a few taps and it opens next week.', cta: 'Start a racket', act: hub });
    if (g.noEarner.length) {
      const boss = g.noEarner.find((c) => c.id === s.playerId);
      const men = g.noEarner.filter((c) => c.id !== s.playerId);
      out.push({ id: 'steady-earners', tone: 'info', title: men.length === 1 && !boss ? `${displayName(men[0])} has no steady earner` : men.length ? `${plural(men.length, 'capo')}${boss ? ' and you' : ''} without a steady earner` : 'You have no steady earner of your own', text: 'One thing that is his: it pays every week, summer and winter. A capo with one kicks up reliably and stays loyal; without one he grumbles.', cta: 'Give them one', act: hub });
    }
  }
  // Dirty work: some weeks a job is worth more (a tip), one tap to it.
  if (home === 'money' || home === 'desk') {
    const tip = weekTip(s);
    if (tip && !jobLock(s, tip.job) && defaultMan(s, tip.job)) out.push({ id: 'dirty-tip', tone: 'good', title: `A tip: ${JOBS_BY_ID[tip.job].title.toLowerCase()} this week`, text: tip.text, cta: 'Dirty work', act: { kind: 'route', route: { panel: 'holdings', section: 'dirty' } } });
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
