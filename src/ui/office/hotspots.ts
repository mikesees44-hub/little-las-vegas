import type { OfficeApi } from '../desk/officeApi';
import { wherePath } from '../shell/nav';

/**
 * The Boss's Office picture (office_room_1960, the owner's painting, 1672 × 941: the back room of the club,
 * the tufted chair behind the desk, the window on the neon wheel, the saint and the crucifix, the coat rack
 * and the fedora, the ledger, the cash, the phone and the envelopes on the desk) and its clickable objects,
 * measured on the painting in percent of its width and height. Each opens an existing entry point
 * (desk/officeApi.ts), one of the office's own panels (the door's visitors, the phone, the chair's
 * briefing), or a place by its nav key. Things the painting does not show (the door, the datebook, the
 * paper) sit where they would be: the door just out of frame on the right, the datebook by the cash, the
 * paper on the sideboard.
 */
export type OfficePanel = 'door' | 'phone' | 'brief' | 'week';
export type HotspotEntry = { api: Exclude<keyof OfficeApi, 'openAdvance' | 'openDesk' | 'openVisitors' | 'openDecisions' | 'openPlace'> } | { panel: OfficePanel } | { go: string };

export interface Hotspot {
  id: 'envelope' | 'ledger' | 'phone' | 'calendar' | 'newspaper' | 'photos' | 'map' | 'door' | 'chair' | 'throne' | 'church' | 'coat';
  label: string;
  /** What it does, for the list and the screen reader. */
  hint: string;
  icon: string;
  /** Percent of the picture: left, top, width, height. */
  rect: { x: number; y: number; w: number; h: number };
  entry: HotspotEntry;
}

export const OFFICE_ART_SIZE: [number, number] = [1672, 941];

export const HOTSPOTS: Hotspot[] = [
  { id: 'map', label: 'The window', hint: 'The wheel and the boardwalk outside: go out to the map', icon: '⌖', rect: { x: 30, y: 0, w: 26.8, h: 30 }, entry: { api: 'openMap' } },
  { id: 'photos', label: 'Family photographs', hint: 'Your family: the tree, the heir, the house', icon: '♔', rect: { x: 1.5, y: 0.5, w: 7.5, h: 23 }, entry: { api: 'openFamily' } },
  { id: 'church', label: 'The saint', hint: 'Saint Michael and the crucifix: the church, charity, sharing the wealth', icon: '✝', rect: { x: 60.2, y: 0.5, w: 20, h: 29.5 }, entry: { go: 'you.store#share' } },
  { id: 'coat', label: 'Hat and coat', hint: 'Put on the fedora: a trip, a vacation, the men out of town', icon: '✈', rect: { x: 81, y: 8.5, w: 11, h: 44 }, entry: { go: 'ops.travel' } },
  { id: 'door', label: 'The door', hint: 'Who is waiting outside to see you', icon: '⚑', rect: { x: 92.5, y: 34, w: 7.5, h: 40 }, entry: { panel: 'door' } },
  { id: 'throne', label: 'Your chair', hint: 'The chair behind the desk: who sits in it after you, the succession', icon: '♕', rect: { x: 46, y: 31, w: 19.5, h: 22 }, entry: { go: 'house.court' } },
  { id: 'newspaper', label: 'Newspaper', hint: 'The papers and the news, on the sideboard', icon: '✎', rect: { x: 0.5, y: 44, w: 12.5, h: 14 }, entry: { api: 'openNews' } },
  { id: 'ledger', label: 'Ledger', hint: 'The books: the money, the accounts, the agreements', icon: '▤', rect: { x: 13, y: 60.5, w: 15.7, h: 18 }, entry: { api: 'openLedger' } },
  { id: 'calendar', label: 'The datebook', hint: 'The leather datebook: today hour by hour, the week, who wants an audience', icon: '◷', rect: { x: 29.5, y: 60.5, w: 10, h: 6.5 }, entry: { api: 'openDatebook' } },
  { id: 'phone', label: 'Telephone', hint: 'Call your lawyer, your people, the other bosses', icon: '☏', rect: { x: 68.5, y: 45.5, w: 11.7, h: 15.5 }, entry: { panel: 'phone' } },
  { id: 'envelope', label: 'The envelope', hint: 'This week\'s count: hear it, take your cut', icon: '✉', rect: { x: 66, y: 64, w: 21.5, h: 14 }, entry: { api: 'openEnvelope' } },
  { id: 'chair', label: 'The chair across', hint: 'Your underboss across the desk: the week\'s briefing', icon: '♜', rect: { x: 6, y: 83, w: 35, h: 17 }, entry: { panel: 'brief' } },
];

/**
 * What clicking an object does: one existing entry point, one of the office's panels, or a place. The
 * envelope opens the envelope meeting when there is a report, else the envelope pages (the ledger).
 */
export function openHotspot(h: Hotspot, api: OfficeApi, o: { hasReport: boolean; panel: (p: OfficePanel) => void }): void {
  if ('panel' in h.entry) { o.panel(h.entry.panel); return; }
  if ('go' in h.entry) { api.openPlace(h.entry.go); return; }
  if (h.id === 'envelope' && !o.hasReport) { api.openLedger(); return; }
  const f = api[h.entry.api] as () => void;
  f();
}

/**
 * The place each object opens (STREAMLINE_2 §4: every door to a thing that has a home says so): a
 * registry key, or undefined for the office's own windows and the map. The door's visitors are the
 * Desk's Audience; the envelope opens the envelope meeting when the count is in, else its page.
 */
const API_PLACE: Partial<Record<string, string>> = { openLedger: 'holdings.take', openEnvelope: 'holdings.take', openFamily: 'house.tree', openNews: 'chronicle.papers' };
const PANEL_PLACE: Partial<Record<OfficePanel, string>> = { door: 'you.court' };
const OWN: Record<string, string> = { openMap: 'the map', openDatebook: 'the datebook', phone: 'the telephone', brief: 'the week\'s briefing', week: 'the week' };

export function hotspotKey(h: Hotspot): string | undefined {
  if ('go' in h.entry) return h.entry.go.split('#')[0];
  if ('panel' in h.entry) return PANEL_PLACE[h.entry.panel];
  return API_PLACE[h.entry.api];
}

/** "Opens Money › The envelope" for the tooltip. */
export function hotspotOpens(h: Hotspot): string {
  const k = hotspotKey(h);
  const where = k ? wherePath(k) : undefined;
  if (where) return `Opens ${where}${'panel' in h.entry ? ' (here, at the door)' : h.id === 'envelope' ? ' (the count itself when it is in)' : ''}`;
  const own = 'api' in h.entry ? OWN[h.entry.api] : 'panel' in h.entry ? OWN[h.entry.panel] : undefined;
  return `Opens ${own ?? 'it'}`;
}

export const HOTSPOT_BY_ID = Object.fromEntries(HOTSPOTS.map((h) => [h.id, h])) as Record<Hotspot['id'], Hotspot>;

/** The club in cutaway (social_club_cutaway, 1697 × 927): upstairs is the office, downstairs the bar. */
export const CLUB_SPOTS = {
  upstairs: { x: 49, y: 0.5, w: 50.5, h: 40.5 },
  bar: { x: 38, y: 47, w: 61.5, h: 52 },
  front: { x: 11, y: 5, w: 24, h: 80 },
};
