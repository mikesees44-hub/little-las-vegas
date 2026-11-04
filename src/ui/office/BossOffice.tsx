import { unreadCount } from '../../engine/paper';
import { useMemo, useState, type ReactNode } from 'react';
import { deskBadge } from '../../engine/attention';
import { officeBriefing, officePhone, officeRoom, officeVisitors, type DelegateOp, type OfficeUi, type OfficeVisitor } from '../../engine/bossOffice';
import { displayName } from '../../engine/characters';
import { formatDay } from '../../engine/days';
import { lawyerReading } from '../../engine/roundsPersonal';
import { latestReport } from '../../engine/tribute';
import type { GameState } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { FACTION_TINT, useSheet } from '../components/People';
import { ActionMenu, DomainChip } from '../components/Layout';
import { domainOf, domainOfText, domClass, type Domain } from '../domain';
import { useOffice } from '../desk/officeApi';
import { useShell } from '../shell/context';
import { useOpenDating } from '../dating/DatingPanel';
import { fmt$ } from '../format';
import { AssetImg } from '../hood/AssetImg';
import { Portrait } from '../portrait/Portrait';
import { HOTSPOTS, openHotspot, type Hotspot, type OfficePanel } from './hotspots';
import { holder } from '../../engine/council';
import { briefing } from '../../engine/briefing';
import type { CounselSubject } from '../../engine/counsel';
import { TableButton, TableModal } from '../advice/CounselTable';
import { DeskClock, WeekSchedule } from '../components/DeskClock';

/**
 * THE BOSS'S OFFICE: upstairs at the Shore Social Club. The painted room
 * with its objects (keyboard-focusable hotspots) and, beside it — or under
 * it on a phone, where it is the main way in — the same objects as a labeled
 * list. Every object opens an existing flow through the office's entry points
 * (desk/officeApi.ts); the door, the phone and the chair open small panels
 * whose buttons do the same. Nothing here keeps its own money, decisions or
 * payments, and looking at the briefing changes nothing.
 */

export interface BossOfficeProps {
  s: GameState;
  ui: OfficeUi;
  /** Monday's arrival: the man across the desk with his briefing (first view of the week). */
  monday: boolean;
  onMondayDone: () => void;
  /** "Invite in": the visitor's own flow (the decision, the morning, the sit-down, the calendar). */
  onInvite: (v: OfficeVisitor) => void;
  /** "Ask him to handle it": the existing default, given as the boss's answer. */
  onDelegate: (op: DelegateOp) => void;
  /** "Schedule for later": off the door this week (a sit-down item goes to "Not now"). */
  onLater: (v: OfficeVisitor) => void;
  /** Downstairs: the club. */
  onClub: () => void;
  initialPanel?: OfficePanel;
}

const chip = 'inline-flex items-center gap-1 rounded border border-gold-600/50 bg-noir-950/85 px-1.5 py-0.5 text-[10px] leading-none text-gold-200 shadow shadow-black/60';
/** Each object in the room belongs to a part of the Don's life (ui/domain.ts): the envelope money, the phone the law, the photographs the family. */
const spotDomain = (id: Hotspot['id']): Domain => domainOf(`office.${id}`) ?? 'crew';
/** The list under the room, grouped: what is on the desk this week, the calls and the word, home and the way out. */
const SPOT_GROUPS: { title: string; ids: Hotspot['id'][] }[] = [
  { title: 'On the desk this week', ids: ['door', 'envelope', 'chair', 'ledger'] },
  { title: 'Calls and the word', ids: ['phone', 'calendar', 'newspaper'] },
  { title: 'The house, the church, the way out', ids: ['throne', 'photos', 'church', 'map', 'coat'] },
];

/** When the painting cannot load (local preview, offline): a dark panelled room so the objects still read. */
/**
 * When the painting can't load (the single-file build, a slow line): a drawn office in the same frame
 * (1697 × 927), its objects under the hotspots: the map on the wall, the photographs on the credenza,
 * the door with its frosted glass, the walnut desk with the phone, the paper, the ledger and the envelope,
 * the chair across. No empty boxes.
 */
function PaintedFallback() {
  const X = (pct: number) => (pct / 100) * 1672;
  const Y = (pct: number) => (pct / 100) * 941;
  const r = (id: string) => HOTSPOTS.find((h) => h.id === id)!.rect;
  const map = r('map'); const photos = r('photos'); const door = r('door'); const phone = r('phone'); const paper = r('newspaper'); const ledger = r('ledger'); const env = r('envelope'); const chair = r('chair'); const cal = r('calendar');
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice" aria-hidden data-testid="office-fallback">
      <defs>
        <linearGradient id="of-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a1c12" /><stop offset="1" stopColor="#3a2617" /></linearGradient>
        <linearGradient id="of-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a3820" /><stop offset="1" stopColor="#2c1a0e" /></linearGradient>
        <radialGradient id="of-lamp" cx="0.42" cy="0.55" r="0.55"><stop offset="0" stopColor="#f3c97a" stopOpacity="0.22" /><stop offset="1" stopColor="#f3c97a" stopOpacity="0" /></radialGradient>
        <pattern id="of-blinds" width="12" height="14" patternUnits="userSpaceOnUse"><rect width="12" height="9" fill="#d9c9a0" opacity="0.18" /></pattern>
      </defs>
      <rect width="1672" height="941" fill="url(#of-wall)" />
      {/* wainscot */}
      <rect y={Y(48)} width="1672" height={Y(8)} fill="#24170e" />
      <line x1="0" x2="1672" y1={Y(48)} y2={Y(48)} stroke="#6b4a2a" strokeWidth="3" />
      {/* the window with blinds, right of the door */}
      <rect x={X(72)} y={Y(6)} width={X(12)} height={Y(30)} fill="#0e141c" stroke="#5b3f24" strokeWidth="6" />
      <rect x={X(72)} y={Y(6)} width={X(12)} height={Y(30)} fill="url(#of-blinds)" />
      {/* the map on the wall */}
      <rect x={X(map.x + 1)} y={Y(map.y + 3)} width={X(map.w - 2)} height={Y(map.h - 6)} fill="#c9b78a" opacity="0.85" stroke="#6b4a2a" strokeWidth="8" />
      <path d={`M${X(map.x + 6)} ${Y(map.y + 8)} q ${X(4)} ${Y(6)} ${X(2)} ${Y(12)} t ${X(5)} ${Y(9)}`} fill="none" stroke="#5a7a8a" strokeWidth="5" opacity="0.8" />
      <circle cx={X(map.x + 14)} cy={Y(map.y + 20)} r="7" fill="#9b2c2c" />
      {/* the credenza and the photographs */}
      <rect x={X(photos.x)} y={Y(photos.y + 7)} width={X(photos.w)} height={Y(photos.h - 5)} fill="#3e2615" stroke="#24170e" strokeWidth="3" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={X(photos.x + 2 + i * 6.3)} y={Y(photos.y + 1)} width={X(4.2)} height={Y(6.5)} fill="#d8d0bc" opacity="0.75" stroke="#8a6a3a" strokeWidth="3" />
      ))}
      {/* the door, frosted glass */}
      <rect x={X(door.x)} y={Y(door.y)} width={X(door.w)} height={Y(door.h)} fill="#3b2516" stroke="#1e130b" strokeWidth="6" />
      <rect x={X(door.x + 1.8)} y={Y(door.y + 3)} width={X(door.w - 3.6)} height={Y(door.h * 0.42)} fill="#cfc6a8" opacity="0.28" />
      <circle cx={X(door.x + door.w - 2)} cy={Y(door.y + door.h * 0.6)} r="7" fill="#b8913f" />
      {/* the desk */}
      <rect x={X(1)} y={Y(54)} width={X(70)} height={Y(46)} fill="url(#of-desk)" />
      <rect x={X(1)} y={Y(54)} width={X(70)} height={Y(3)} fill="#6e4628" />
      <rect width="1672" height="941" fill="url(#of-lamp)" />
      {/* the phone */}
      <rect x={X(phone.x + 3)} y={Y(phone.y + 5)} width={X(phone.w - 6)} height={Y(phone.h - 12)} rx="14" fill="#111" />
      <rect x={X(phone.x + 2)} y={Y(phone.y + 3)} width={X(phone.w - 4)} height={Y(4)} rx="10" fill="#1b1b1b" />
      <circle cx={X(phone.x + phone.w / 2)} cy={Y(phone.y + 12)} r={X(2)} fill="#2a2a2a" stroke="#555" strokeWidth="2" />
      {/* the paper */}
      <rect x={X(paper.x + 1)} y={Y(paper.y + 1)} width={X(paper.w - 2)} height={Y(paper.h - 2)} fill="#e6dfcb" opacity="0.85" transform={`rotate(-4 ${X(paper.x + paper.w / 2)} ${Y(paper.y + paper.h / 2)})`} />
      {[0, 1, 2].map((i) => <rect key={i} x={X(paper.x + 2)} y={Y(paper.y + 2.5 + i * 2.4)} width={X(paper.w - 4)} height="4" fill="#3a3a3a" opacity="0.5" />)}
      {/* the ledger */}
      <rect x={X(ledger.x + 2)} y={Y(ledger.y + 1.5)} width={X(ledger.w - 4)} height={Y(ledger.h - 3)} fill="#3d1f1a" stroke="#1d0f0c" strokeWidth="3" />
      <line x1={X(ledger.x + ledger.w / 2)} x2={X(ledger.x + ledger.w / 2)} y1={Y(ledger.y + 1.5)} y2={Y(ledger.y + ledger.h - 1.5)} stroke="#b8913f" strokeWidth="3" />
      {/* the envelope */}
      <rect x={X(env.x + 1.5)} y={Y(env.y + 1.5)} width={X(env.w - 3)} height={Y(env.h - 3)} fill="#d9c79c" />
      <path d={`M${X(env.x + 1.5)} ${Y(env.y + 1.5)} L${X(env.x + env.w / 2)} ${Y(env.y + env.h / 2)} L${X(env.x + env.w - 1.5)} ${Y(env.y + 1.5)}`} fill="none" stroke="#9c8a5f" strokeWidth="3" />
      {/* the appointment book */}
      <rect x={X(cal.x + 1)} y={Y(cal.y + 0.5)} width={X(cal.w - 2)} height={Y(cal.h - 1)} fill="#22301f" stroke="#111" strokeWidth="2" />
      {/* the chair across */}
      <path d={`M${X(chair.x + 2)} ${Y(chair.y + chair.h)} L${X(chair.x + 2)} ${Y(chair.y + 2)} Q${X(chair.x + chair.w / 2)} ${Y(chair.y - 3)} ${X(chair.x + chair.w - 2)} ${Y(chair.y + 2)} L${X(chair.x + chair.w - 2)} ${Y(chair.y + chair.h)} Z`} fill="#4a1f1a" stroke="#1d0d0b" strokeWidth="4" />
    </svg>
  );
}

export function BossOffice({ s, ui, monday, onMondayDone, onInvite, onDelegate, onLater, onClub, initialPanel }: BossOfficeProps) {
  const api = useOffice();
  const [panel, setPanel] = useState<OfficePanel | undefined>(initialPanel);
  const brief = useMemo(() => officeBriefing(s, ui), [s, ui]);
  const visitors = useMemo(() => officeVisitors(s, ui), [s, ui]);
  // The one count (engine/attention.ts, on the inbox): the door's badge says what the top bar and the desk say; the door lists the people at it.
  const box = useMemo(() => deskBadge(s, ui), [s, ui]);
  const room = useMemo(() => officeRoom(s), [s]);
  const rep = latestReport(s);
  const envelopeWaiting = rep?.status === 'presented';
  const seatC = brief.seat.charId ? s.characters[brief.seat.charId] : undefined;
  const answered = s.pendingEvents.filter((e) => ui.answers?.[e.iid]).length;
  // "Bring in the consigliere": the table on the first thing waiting at the door (a decision, else a sit-down item).
  const [tableOpen, setTableOpen] = useState(false);
  const tableFor = visitors.find((v) => v.ref.event || v.ref.brief);
  const tableSubject: CounselSubject | undefined = tableFor?.ref.event ? { kind: 'event', iid: tableFor.ref.event } : tableFor?.ref.brief ? { kind: 'brief', itemId: tableFor.ref.brief } : undefined;
  const cons = holder(s, 'consigliere');
  const table = { label: cons && cons.id !== brief.seat.charId ? 'Bring in the consigliere' : 'Call in the table', about: tableFor ? tableFor.why.split('.')[0] : undefined, onOpen: tableSubject ? () => setTableOpen(true) : undefined };

  const openEnvelope = () => (rep ? api.openEnvelope() : api.openLedger());
  const act = (h: Hotspot) => openHotspot(h, api, { hasReport: !!rep, panel: setPanel });
  const badge = (id: Hotspot['id']): ReactNode => {
    if (id === 'envelope' && envelopeWaiting) return <span className="text-emerald-300">{fmt$(rep!.reported)}</span>;
    if (id === 'door' && box.n) return <span className={`rounded-full px-1 font-bold text-white ${box.tone === 'red' ? 'bg-red-600' : 'bg-blood-500'}`} data-testid="door-count">{box.n}</span>;
    if (id === 'photos') return <span className="text-stone-300">{room.photos}</span>;
    if (id === 'newspaper' && unreadCount(s)) return <span className="inline-block h-2 w-2 rounded-full bg-blood-500" data-testid="paper-unread-dot" aria-label="New paper" />;
    return null;
  };

  const status: Record<Hotspot['id'], string> = {
    chair: brief.seat.role === 'none' ? 'Nobody in the chair' : `${brief.seat.name} · ${brief.seat.title.toLowerCase()}`,
    envelope: envelopeWaiting ? `${fmt$(rep!.reported)} on the desk: hear the count` : rep ? `Counted: ${fmt$(rep.reported)} · go over it again` : 'No count yet · the weekly envelope page',
    door: box.n ? `${box.n} waiting on you${box.tone === 'red' ? ' · urgent' : ''}${box.n > visitors.length ? ` · ${visitors.length} at the door` : ''}` : 'Nobody waiting',
    ledger: 'The money, the accounts, the agreements',
    phone: room.absence?.kind === 'prison' ? 'From inside: only your lawyer' : 'Your lawyer, your people, the other bosses',
    calendar: formatDay(s),
    newspaper: room.headline ? room.headline.text : 'Nothing in the papers yet',
    photos: `${room.photos} photograph${room.photos === 1 ? '' : 's'}${room.memorial ? ` · in memory of ${room.memorial.name}` : ''}`,
    map: 'The wheel outside: go out to Wildwood and beyond',
    throne: 'Who sits in it after you · the succession',
    church: 'The church, charity, share the wealth',
    coat: 'A trip, a vacation, the men out of town',
  };

  // The focal point: people at the door first (urgent or not), else an envelope on the desk waiting to be heard.
  const lead: Hotspot['id'] | undefined = box.n && box.tone === 'red' ? 'door' : envelopeWaiting ? 'envelope' : box.n ? 'door' : undefined;
  const panelBody = panel === 'door' ? <DoorPanel s={s} visitors={visitors} onInvite={onInvite} onDelegate={onDelegate} onLater={onLater} onDesk={() => api.openDesk('people')} />
    : panel === 'phone' ? <PhonePanel s={s} />
    : panel === 'week' ? <WeekSchedule s={s} />
    : panel === 'brief' ? <BriefCard s={s} brief={brief} onEnvelope={openEnvelope} onDoor={() => setPanel('door')} onDesk={() => api.openDesk()} onDone={() => setPanel(undefined)} table={table} />
    : undefined;

  return (
    <div className="absolute inset-0 z-[1090] overflow-y-auto bg-noir-950 pb-16 md:pb-2" data-testid="boss-office" role="region" aria-label="The Boss's Office">
      <div className="mx-auto max-w-[1500px] p-2 sm:p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl text-gold-400 leading-tight">The Office</h1>
            <div className="text-[11px] text-stone-400">{room.hq.club ? 'Upstairs at the Shore Social Club' : `Business is done at: ${room.hq.name.toLowerCase()}. The office upstairs at the club`} · {formatDay(s)} · week {s.week}</div>
          </div>
          <div className="flex gap-1.5">
            <button type="button" className="btn-secondary text-xs" onClick={onClub} data-testid="office-downstairs">⇣ Downstairs</button>
            <button type="button" className="btn-secondary text-xs" onClick={api.openMap} data-testid="office-to-map">⌖ The map</button>
          </div>
        </div>
        {room.absence && (
          <div className="mb-2 rounded border border-amber-500/60 bg-amber-900/20 px-2 py-1.5 text-[12px] text-amber-100" data-testid="office-absence">{room.absence.note}</div>
        )}
        {/* The painting on the left, the column beside it: Monday's card and the panels never sit on the room. */}
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div className="min-w-0">
            <div className="relative w-full overflow-hidden rounded-md border border-gold-700/50 shadow-xl shadow-black/70" style={{ aspectRatio: '1672 / 941' }} data-testid="office-stage">
              <AssetImg k="office_room_1960" alt="The back room of the club: the tufted chair behind the desk, the window on the neon wheel, the saint on the wall, the hat and coat on the rack, the ledger, the cash, the phone and the envelopes on the desk" className="absolute inset-0 h-full w-full object-cover" fallback={<PaintedFallback />} />
              {seatC && (
                <div className="pointer-events-none absolute flex items-end justify-center" style={{ left: '17%', top: '74%', width: '13%', height: '22%' }} data-testid="office-seat-portrait">
                  <span className="rounded-md ring-2 ring-gold-500/70 shadow-lg shadow-black"><Portrait c={seatC} seed={s.seed} date={s.date} size={56} tint={FACTION_TINT[seatC.faction]} /></span>
                </div>
              )}
              {room.memorial && (
                <div className="pointer-events-none absolute hidden sm:block" style={{ left: '1.5%', top: '24.5%' }} data-testid="office-memorial">
                  <span className={`${chip} border-stone-500 text-stone-200`}>▬ In memory of {room.memorial.name}</span>
                </div>
              )}
              {(room.cane || room.medicine) && (
                <div className="pointer-events-none absolute flex gap-1" style={{ left: '67%', top: '88%' }} data-testid="office-health">
                  {room.cane && <span className={chip}>A cane against the desk</span>}
                  {room.medicine && <span className={chip}>Pills from the doctor</span>}
                </div>
              )}
              {room.headline && (
                <div className="pointer-events-none absolute hidden xl:block max-w-[12%]" style={{ left: '0.5%', top: '58.5%' }} data-testid="office-headline">
                  <span className="block rounded-sm border border-stone-400/60 bg-stone-100/90 px-1.5 py-0.5 font-serif text-[10px] font-bold uppercase leading-tight text-noir-950 shadow">{room.headline.text}</span>
                </div>
              )}
              <DeskClock s={s} onOpen={() => setPanel('week')} className="absolute hidden sm:flex items-end justify-center"
                style={{ left: `${DESK_CLOCK_RECT.x}%`, top: `${DESK_CLOCK_RECT.y}%`, width: `${DESK_CLOCK_RECT.w}%`, height: `${DESK_CLOCK_RECT.h}%`, fontSize: 'clamp(6px, 0.95vw, 14px)' }} />
              {HOTSPOTS.map((h) => (
                <button key={h.id} type="button" onClick={() => act(h)} data-testid={`office-spot-${h.id}`} aria-label={`${h.label}: ${h.hint}`} title={`${h.label}: ${status[h.id]}`}
                  className="llv-spot group absolute rounded-md border border-transparent focus-visible:outline-none"
                  style={{ left: `${h.rect.x}%`, top: `${h.rect.y}%`, width: `${h.rect.w}%`, height: `${h.rect.h}%` }}>
                  <span className={`${chip} ${domClass(spotDomain(h.id))} llv-dom-border absolute left-0.5 ${h.id === 'chair' ? 'bottom-0.5' : 'top-0.5'}`}>
                    <span aria-hidden className="llv-dom-ink">{h.icon}</span>
                    <span className="llv-spot-label">{h.label}</span>
                    {badge(h.id)}
                  </span>
                </button>
              ))}
            </div>
        <div className="mt-2 flex justify-center sm:hidden" style={{ fontSize: '11px' }}><DeskClock s={s} onOpen={() => setPanel('week')} /></div>
        </div>
        <aside className="min-w-0 space-y-3" data-testid="office-side">
            {((monday && !panel) || panel) && (
              <div className={`space-y-2 ${OFFICE_CARD_CLEAR}`} data-testid="office-card">
                {monday && !panel && (
                  <BriefCard s={s} brief={brief} monday onEnvelope={() => { onMondayDone(); openEnvelope(); }} onDoor={() => { onMondayDone(); setPanel('door'); }} onDesk={() => { onMondayDone(); api.openDesk(); }} onDone={onMondayDone} table={table} />
                )}
                {panel && (
                  <div className="rounded-md border border-gold-600/60 bg-noir-900/[0.97] p-2.5 shadow-xl shadow-black/70" data-testid={`office-panel-${panel}`}>
                    <button type="button" className="mb-1 text-[11px] text-stone-400 hover:text-gold-300" onClick={() => setPanel(undefined)} data-testid="office-panel-back">← Back to the office</button>
                    {panelBody}
                  </div>
                )}
              </div>
            )}
                {/* The one thing this room most wants of you, big and first (the door when people wait, else the count on the desk). */}
        {lead && (() => {
          const h = HOTSPOTS.find((x) => x.id === lead)!;
          const d = spotDomain(lead);
          const first = lead === 'door' ? visitors[0] : undefined;
          const fc = first?.charId ? s.characters[first.charId] : undefined;
          return (
            <button type="button" onClick={() => act(h)} data-testid="office-lead" data-domain={d}
              className={`llv-card-box llv-card-attention llv-slide-up llv-next flex w-full items-center gap-3 text-left ${domClass(d)} llv-dom-edge llv-dom-tint hover:border-gold-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300`}>
              {fc ? <span className="shrink-0 rounded-md ring-2 ring-gold-500/60"><Portrait c={fc} seed={s.seed} date={s.date} size={64} tint={FACTION_TINT[fc.faction]} /></span> : <DomainChip d={d} glyph={h.icon} size={44} />}
              <span className="min-w-0 flex-1">
                <span className="llv-kicker block">{lead === 'door' ? (box.tone === 'red' ? 'Urgent · outside the door' : 'Outside the door') : 'On the desk'}</span>
                <span className="block font-display text-xl leading-tight text-stone-100 sm:text-2xl">{lead === 'door' ? `${box.n} waiting on you` : `${fmt$(rep!.reported)} in the envelope`}</span>
                <span className="block truncate text-[12px] text-stone-300">{lead === 'door' ? (first ? `${first.name}: ${first.why}` : status.door) : 'Hear the count and take your cut.'}</span>
              </span>
              <span className="btn-primary hidden shrink-0 text-xs sm:inline-flex lg:hidden xl:inline-flex">{lead === 'door' ? 'See who\'s waiting' : 'Hear the count'} ▸</span>
              <span className="shrink-0 text-gold-300 sm:hidden" aria-hidden>▸</span>
            </button>
          );
        })()}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1" data-testid="office-list" role="list" aria-label="What is in the office">
          {SPOT_GROUPS.map((g) => (
            <section key={g.title} className="min-w-0" aria-label={g.title}>
              <div className="llv-kicker mb-1">{g.title}</div>
              <ul className="grid gap-1.5">
                {g.ids.map((id) => {
                  const h = HOTSPOTS.find((x) => x.id === id)!;
                  const d = spotDomain(id);
                  return (
                    <li key={id} role="listitem">
                      <button type="button" onClick={() => act(h)} data-testid={`office-item-${id}`} data-domain={d}
                        className={`flex w-full items-center gap-2.5 rounded-md border border-noir-700 bg-noir-900/70 px-2.5 py-2 text-left llv-dom-row ${domClass(d)} hover:border-gold-500 focus-visible:border-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300`}>
                        <DomainChip d={d} glyph={h.icon} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-stone-100">{h.label} {badge(id)}</span>
                          <span className="block truncate text-[11px] text-stone-400">{status[id]}</span>
                        </span>
                        <span className="shrink-0 text-[11px] llv-dom-ink" aria-hidden>▸</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <ul className="border-t border-noir-700 pt-3">
          <li className="grid grid-cols-2 gap-1.5">
            <button type="button" className="btn-secondary text-xs" disabled={!s.pendingEvents.length} onClick={api.openDecisions} data-testid="office-decisions">✉ Decisions {answered}/{s.pendingEvents.length}</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => api.openDesk()} data-testid="office-desk">▤ The desk's list</button>
            <button type="button" className="btn-primary col-span-2 text-sm" onClick={api.openAdvance} data-testid="office-advance">Advance the week ▸</button>
          </li>
        </ul>
        </aside>
        </div>
      </div>
      {tableOpen && tableSubject && <TableModal s={s} subject={tableSubject} onClose={() => setTableOpen(false)}
        onChoose={tableSubject.kind === 'event' ? (choiceId) => onDelegate({ kind: 'answer', iid: tableSubject.iid, choiceId }) : undefined}
        onOption={tableSubject.kind === 'brief' ? (id) => { const it = officeBriefItem(s, tableSubject.itemId); const o = it?.options.find((x) => x.id === id); if (o?.action) onDelegate({ kind: 'order', action: o.action }); } : undefined} />}
    </div>
  );
}

/** Monday's card (and the door's, the phone's, the chair's panels) sit in the column beside the painting, never on it:
 * it covers no hotspot (playtest #11). */
export const OFFICE_CARD_CLEAR = '';
/** Where it sits in the scene's percent units: outside the picture, to the right (tests check no hotspot reaches into it). */
export const OFFICE_CARD_RECT = { x: 100, y: 0, w: 0, h: 0 };

/** The flip clock and tear-off calendar on the desk, between the appointment book and the chair, above Monday's card
 * (scene percent units; tests check it touches no hotspot and stays clear of the card). */
export const DESK_CLOCK_RECT = { x: 42.5, y: 64.5, w: 14, h: 16 };

/** The man across the desk and his one or two lines. Monday's arrival has the four ways to start. */
function BriefCard({ s, brief, monday, onEnvelope, onDoor, onDesk, onDone, table }: {
  s: GameState; brief: ReturnType<typeof officeBriefing>; monday?: boolean; table?: { label: string; about?: string; onOpen?: () => void };
  onEnvelope: () => void; onDoor: () => void; onDesk: () => void; onDone: () => void;
}) {
  const c = brief.seat.charId ? s.characters[brief.seat.charId] : undefined;
  return (
    <section className={`llv-slide-up rounded-md border border-gold-500/70 bg-noir-900/95 p-2.5 shadow-lg shadow-black/60 ${domClass('crew')} llv-dom-edge`} data-testid={monday ? 'office-monday' : 'office-brief'} data-domain="crew">
      <div className="flex items-start gap-2.5">
        {c && <span className="shrink-0 rounded-md ring-2 ring-gold-600/60"><Portrait c={c} seed={s.seed} date={s.date} size={64} tint={FACTION_TINT[c.faction]} /></span>}
        <div className="min-w-0 flex-1">
          <div className="llv-kicker">{monday ? 'Monday morning' : 'Across the desk'} · {brief.seat.title}</div>
          <div className="font-semibold text-gold-300">{c ? displayName(c) : brief.seat.name}</div>
          {brief.lines.map((l, i) => <p key={i} className="text-[13px] leading-snug text-stone-200">{i === 0 && c ? '"' : ''}{l}{i === brief.lines.length - 1 && c ? '"' : ''}</p>)}
        </div>
      </div>
      {/* One primary (the count), one secondary (the door); the rest are quiet links, so the next step is plain. */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" className="btn-primary text-xs" onClick={onEnvelope} data-testid="office-hear-count">{brief.count !== undefined ? 'Hear the count' : 'The envelope pages'}</button>
        <button type="button" className="btn-secondary text-xs" onClick={onDoor} data-testid="office-see-waiting">See who's waiting</button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
        <button type="button" className="btn-quiet" onClick={onDesk} data-testid="office-review-desk">Review the desk</button>
        {table && <button type="button" className="btn-quiet max-w-full truncate" disabled={!table.onOpen} onClick={table.onOpen} title={table.about ? `Everyone's view on: ${table.about}` : 'Nothing waiting at the door to weigh'} data-testid="office-table">⚖ {table.label}{table.about ? <span className="text-stone-500"> on {table.about.length > 30 ? `${table.about.slice(0, 29)}…` : table.about}</span> : <span className="text-stone-500"> (nothing to weigh)</span>}</button>}
        <button type="button" className="btn-quiet ml-auto text-stone-400" onClick={onDone} data-testid="office-something-else">{monday ? 'Start with something else' : 'Thanks, that\'s all'}</button>
      </div>
    </section>
  );
}

const KIND_WORD: Record<OfficeVisitor['kind'], string> = { decision: 'Wants a decision', petition: 'A petition', morning: 'A capo\'s request', sitdown: 'For the sit-down', lawyer: 'Your lawyer' };

function DoorPanel({ s, visitors, onInvite, onDelegate, onLater, onDesk }: { s: GameState; visitors: OfficeVisitor[]; onInvite: (v: OfficeVisitor) => void; onDelegate: (op: DelegateOp) => void; onLater: (v: OfficeVisitor) => void; onDesk?: () => void }) {
  return (
    <div data-testid="office-door">
      <div className="flex items-baseline justify-between gap-2"><div className="panel-title text-base">Outside the door</div>{onDesk && <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" onClick={onDesk} data-testid="office-door-desk">On the Desk ▸</button>}</div>
      {!visitors.length && <p className="mt-1 text-[12px] text-stone-400">Nobody is waiting. The hall is empty except for the man on the door.</p>}
      <ul className="mt-1.5 space-y-1.5">
        {visitors.map((v) => {
          const c = v.charId ? s.characters[v.charId] : undefined;
          const d: Domain = domainOfText(s, v.why) ?? (v.kind === 'lawyer' ? 'law' : 'crew');
          return (
            <li key={v.key} className={`rounded-md border px-2 py-1.5 llv-dom-row ${domClass(v.urgent ? 'rivals' : d)} ${v.urgent ? 'border-red-400/70 bg-blood-500/10' : 'border-noir-700 bg-noir-950/60'}`} data-testid="office-visitor" data-domain={v.urgent ? 'rivals' : d}>
              <div className="flex items-start gap-2">
                {c && <span className="shrink-0"><Portrait c={c} seed={s.seed} date={s.date} size={44} tint={FACTION_TINT[c.faction]} /></span>}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-stone-100">{v.name} <span className="font-normal text-stone-500">· {KIND_WORD[v.kind]}</span>{v.urgent && <span className="ml-1 rounded bg-red-500/80 px-1 text-[9px] font-bold uppercase text-white">urgent</span>}</div>
                  <div className="text-[11px] leading-snug text-stone-400">{v.why}</div>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <button type="button" className="btn-primary px-2 py-0.5 text-[11px]" onClick={() => onInvite(v)} data-testid="office-invite">Invite in</button>
                {v.delegate && <button type="button" className="btn-secondary px-2 py-0.5 text-[11px]" title={v.delegate.does} onClick={() => onDelegate(v.delegate!.op)} data-testid="office-delegate">{v.delegate.label} <span className="text-stone-500">({v.delegate.does})</span></button>}
                <ActionMenu className="[&_.llv-menu-btn]:h-6 [&_.llv-menu-btn]:px-2 [&_.llv-menu-btn]:text-[11px]">
                  <button type="button" onClick={() => onLater(v)} data-testid="office-later">Schedule for later</button>
                  {v.ref.event && <TableButton s={s} subject={{ kind: 'event', iid: v.ref.event }} onChoose={(choiceId) => onDelegate({ kind: 'answer', iid: v.ref.event!, choiceId })} className="btn-secondary px-2 py-0.5 text-[11px]" testid="office-visitor-table" />}
                </ActionMenu>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[10px] text-stone-500">"Later" only clears the hall: it stays on the desk, and anything unanswered takes its default when the week turns.</p>
    </div>
  );
}

/** Who is on the other end: the lawyer is the law, your people the crew, the other bosses rivals, the women romance. */
const PHONE_DOMAIN: Record<string, Domain> = { lawyer: 'law', crew: 'crew', rival: 'rivals', dating: 'romance', company: 'romance' };

function PhonePanel({ s }: { s: GameState }) {
  const api = useOffice();
  const sheet = useSheet();
  const orders = useOrders();
  const book = useMemo(() => officePhone(s), [s]);
  const shell = useShell();
  const openDating = useOpenDating();
  const [lawyer, setLawyer] = useState(false);
  const reading = lawyer ? lawyerReading(s) : undefined;
  return (
    <div data-testid="office-phone">
      <div className="panel-title text-base">The telephone</div>
      <ul className="mt-1.5 space-y-1">
        {book.map((p) => (
          <li key={p.key} className={`rounded-md border border-noir-700 bg-noir-950/60 px-2 py-1.5 llv-dom-row ${domClass(PHONE_DOMAIN[p.kind] ?? 'crew')}`} data-testid={`office-call-${p.kind}`} data-domain={PHONE_DOMAIN[p.kind] ?? 'crew'}>
            <div className="flex items-center gap-2">
              <DomainChip d={PHONE_DOMAIN[p.kind] ?? 'crew'} size={22} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-stone-100">{p.name}</div>
                <div className="text-[11px] text-stone-400">{p.role}{p.blocked ? ` · ${p.blocked}` : ''}</div>
              </div>
              <button type="button" className="btn-secondary shrink-0 px-2 py-0.5 text-[11px]" disabled={!!p.blocked}
                onClick={(e) => { if (p.kind === 'lawyer') setLawyer((x) => !x); else if (p.kind === 'dating' || p.kind === 'company') openDating({ tab: p.kind === 'company' ? 'adult' : 'together' }); else if (p.charId) sheet.menu?.(p.charId, p.kind === 'rival' ? 'diplomacy' : 'talk', { x: Math.max(8, e.clientX - 260), y: e.clientY }); }}
                data-testid={p.kind === 'lawyer' ? 'office-call-lawyer-btn' : undefined}>☏ Call</button>
            </div>
            {p.kind === 'lawyer' && reading && (
              <div className="mt-1 rounded border border-noir-700 bg-noir-900/80 p-2 text-[11px] leading-snug text-stone-300" data-testid="office-lawyer">
                <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">On the line: what he will tell you</div>
                {reading.lines.map((l, i) => <p key={i}>{l}</p>)}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <button type="button" className="btn-primary px-2 py-0.5 text-[11px]" onClick={() => api.openCalendar()} data-testid="office-lawyer-book">Book an hour with him (an evening) ▸</button>
                  {reading.moves.filter((m) => m.action).map((m) => (
                    <button key={m.label} type="button" title={m.why} className="btn-secondary px-2 py-0.5 text-[11px]" onClick={() => orders.queue(m.action!)}>{m.label} ▸</button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-stone-500">A real sit-down with him is an evening in your week (Your affairs). Anything he does is an order, carried out when the week turns.</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="btn-secondary mt-1.5 w-full px-2 py-1 text-[11px]" onClick={() => shell.go('you.dating')} data-testid="office-call-dating-open">♥ Relationships & Dating ▸</button>
    </div>
  );
}

function officeBriefItem(s: GameState, id: string) {
  return briefing(s).items.find((x) => x.id === id);
}
