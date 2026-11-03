import type { Alert, AlertKind } from '../../engine/alerts';
import { placeSummary } from '../../engine/valente';
import { displayName } from '../../engine/characters';
import { pwView } from '../../engine/powerState';
import { STATION_INFO } from '../../engine/station';
import { FLEE_DESTS } from '../../engine/travelDests';
import type { GameState } from '../../engine/types';
import { routeFor, type Route } from './routes';
import type { MapFocus } from './context';

/**
 * The engine's alerts, dressed for the shell (UI only, the engine type is
 * untouched): a route, a map focus, a stable key for snoozing, a group.
 */
export interface ShellAlert extends Alert {
  key: string;
  group: string;
  route?: Route;
  mapFocus?: Omit<MapFocus, 'nonce'>;
}

const KIND_ROUTE: Partial<Record<AlertKind, Route>> = {
  heat: { panel: 'town', section: 'case' },
  money: { panel: 'holdings', section: 'rackets' },
  staff: { panel: 'holdings', section: 'rackets' },
  loan: { panel: 'holdings', section: 'books' },
  books: { panel: 'borgata', section: 'membership' },
  faction: { panel: 'borgata', section: 'grievances' },
  scheme: { panel: 'ops', section: 'progress' },
  dispute: { panel: 'diplomacy', section: 'table' },
  war: { panel: 'diplomacy', section: 'table' },
  heir: { panel: 'house', section: 'succession' },
  law: { panel: 'town', section: 'case' },
  evidence: { panel: 'town', section: 'case' },
  underbelly: { panel: 'town', section: 'underbelly' },
  lifestyle: { panel: 'you', section: 'lifestyle' },
  family: { panel: 'house', section: 'tree' },
  protect: { panel: 'borgata', section: 'protect' },
};

const KIND_FOCUS: Partial<Record<AlertKind, Omit<MapFocus, 'nonce'>>> = {
  heat: { mode: 'heat', level: 'wildwood' },
  money: { mode: 'income', level: 'wildwood' },
  staff: { mode: 'income', level: 'wildwood' },
  war: { mode: 'rival', level: 'wildwood' },
  rival: { mode: 'rival', level: 'wildwood' },
  underbelly: { mode: 'control', level: 'wildwood' },
};

export function shellAlerts(s: GameState, base: Alert[]): ShellAlert[] {
  const out: ShellAlert[] = base.map((a) => ({
    ...a,
    key: `${a.kind}:${a.charId ?? a.title}`,
    group: a.kind,
    route: a.tab ? routeFor(a.tab) : KIND_ROUTE[a.kind],
    mapFocus: KIND_FOCUS[a.kind],
  }));
  // The old banners (succession crisis, the ladder, on the lam) become alerts.
  try {
    const p = s.power ? pwView(s) : undefined;
    if (p?.crisis) out.unshift({ kind: 'heir', severity: 'danger', title: 'Succession crisis', text: `Beat ${p.crisis.beat + 1} of ${p.crisis.beats}. ${displayName(s.characters[s.playerId])} holds the chair. Cohesion ${p.crisis.meters.cohesion} · survival ${p.crisis.meters.survival}.`, key: 'crisis', group: 'crisis', route: { panel: 'house', section: 'succession' } });
    else if (p && p.station !== 'boss') out.push({ kind: 'goal', severity: 'info', title: STATION_INFO[p.station].name, text: placeSummary(s)?.line ?? STATION_INFO[p.station].text, key: 'station', group: 'station', route: p.above ? { panel: 'borgata', section: 'place' } : { panel: 'you', section: 'character' } });
  } catch { /* no power pillar */ }
  const f = s.travel?.fugitives.find((x) => !x.end && x.personId === s.playerId);
  if (f) out.unshift({ kind: 'law', severity: 'danger', title: 'On the lam', text: `Hiding: ${FLEE_DESTS[f.dest]?.name ?? f.dest} · manhunt ${Math.round(f.manhunt)} · cover ${Math.round(f.cover * 100)}%.`, key: 'lam', group: 'law', route: { panel: 'town', section: 'case' } });
  return out;
}

export interface AlertGroup {
  group: string;
  kind: AlertKind;
  severity: Alert['severity'];
  items: ShellAlert[];
}

const SEV = { danger: 0, warn: 1, info: 2 } as const;

/** Same-kind alerts collapse into one icon with a count; danger first. */
export function groupAlerts(list: ShellAlert[]): AlertGroup[] {
  const by = new Map<string, AlertGroup>();
  for (const a of list) {
    const g = by.get(a.group);
    if (!g) by.set(a.group, { group: a.group, kind: a.kind, severity: a.severity, items: [a] });
    else {
      g.items.push(a);
      if (SEV[a.severity] < SEV[g.severity]) g.severity = a.severity;
    }
  }
  return [...by.values()].sort((a, b) => SEV[a.severity] - SEV[b.severity]);
}
