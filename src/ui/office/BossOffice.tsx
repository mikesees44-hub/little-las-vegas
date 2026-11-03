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

/** When the painting cannot load (local preview, offline): a dark panelled room so the objects still read. */
/**
 * When the painting can't load (the single-file build, a slow line): a drawn office in the same frame
 * (1697 × 927), its objects under the hotspots: the map on the wall, the photographs on the credenza,
 * the door with its frosted glass, the walnut desk with the phone, the paper, the ledger and the envelope,
 * the chair across. No empty boxes.
 */
function PaintedFallback() {
  const X = (pct: number) => (pct / 100) * 1697;
  const Y = (pct: number) => (pct / 100) * 927;
  const r = (id: string) => HOTSPOTS.find((h) => h.id === id)!.rect;
  const map = r('map'); const photos = r('photos'); const door = r('door'); const phone = r('phone'); const paper = r('newspaper'); const ledger = r('ledger'); const env = r('envelope'); const chair = r('chair'); const cal = r('calendar');
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1697 927" preserveAspectRatio="xMidYMid slice" aria-hidden data-testid="office-fallback">
      <defs>
        <linearGradient id="of-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2a1c12" /><stop offset="1" stopColor="#3a2617" /></linearGradient>
        <linearGradient id="of-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a3820" /><stop offset="1" stopColor="#2c1a0e" /></linearGradient>
        <radialGradient id="of-lamp" cx="0.42" cy="0.55" r="0.55"><stop offset="0" stopColor="#f3c97a" stopOpacity="0.22" /><stop offset="1" stopColor="#f3c97a" stopOpacity="0" /></radialGradient>
        <pattern id="of-blinds" width="12" height="14" patternUnits="userSpaceOnUse"><rect width="12" height="9" fill="#d9c9a0" opacity="0.18" /></pattern>
      </defs>
      <rect width="1697" height="927" fill="url(#of-wall)" />
      {/* wainscot */}
      <rect y={Y(48)} width="1697" height={Y(8)} fill="#24170e" />
      <line x1="0" x2="1697" y1={Y(48)} y2={Y(48)} stroke="#6b4a2a" strokeWidth="3" />
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
      <rect width="1697" height="927" fill="url(#of-lamp)" />
      {/* the phone */}
      <rect x={X(phone.x + 3)} y={Y(phone.y + 6)} width={X(phone.w - 6)} height={Y(phone.h - 8)} rx="14" fill="#111" />
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
    map: 'Go out: Wildwood and beyond',
  };

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
        <div className="relative">
            <div className="relative w-full overflow-hidden rounded-md border border-gold-700/50 shadow-xl shadow-black/70" style={{ aspectRatio: '1697 / 927' }} data-testid="office-stage">
              <AssetImg k="office_interior" alt="The boss's office: a walnut desk with the envelope, the ledger, the phone and the paper; photographs on the credenza; the map on the wall; the door" className="absolute inset-0 h-full w-full object-cover" fallback={<PaintedFallback />} />
              {seatC && (
                <div className="pointer-events-none absolute flex items-end justify-center" style={{ left: '86.5%', top: '39%', width: '12%', height: '22%' }} data-testid="office-seat-portrait">
                  <span className="rounded-md ring-2 ring-gold-500/70 shadow-lg shadow-black"><Portrait c={seatC} seed={s.seed} date={s.date} size={56} tint={FACTION_TINT[seatC.faction]} /></span>
                </div>
              )}
              {room.memorial && (
                <div className="pointer-events-none absolute hidden sm:block" style={{ left: '30%', top: '30.5%' }} data-testid="office-memorial">
                  <span className={`${chip} border-stone-500 text-stone-200`}>▬ In memory of {room.memorial.name}</span>
                </div>
              )}
              {(room.cane || room.medicine) && (
                <div className="pointer-events-none absolute flex gap-1" style={{ left: '58%', top: '86%' }} data-testid="office-health">
                  {room.cane && <span className={chip}>A cane against the desk</span>}
                  {room.medicine && <span className={chip}>Pills from the doctor</span>}
                </div>
              )}
              {room.headline && (
                <div className="pointer-events-none absolute hidden md:block max-w-[34%]" style={{ left: '1.5%', top: '75%' }} data-testid="office-headline">
                  <span className="block rounded-sm border border-stone-400/60 bg-stone-100/90 px-1.5 py-0.5 font-serif text-[10px] font-bold uppercase leading-tight text-noir-950 shadow">{room.headline.text}</span>
                </div>
              )}
              <DeskClock s={s} onOpen={() => setPanel('week')} className="absolute hidden sm:flex items-end justify-center"
                style={{ left: `${DESK_CLOCK_RECT.x}%`, top: `${DESK_CLOCK_RECT.y}%`, width: `${DESK_CLOCK_RECT.w}%`, height: `${DESK_CLOCK_RECT.h}%`, fontSize: 'clamp(6px, 0.95vw, 14px)' }} />
              {HOTSPOTS.map((h) => (
                <button key={h.id} type="button" onClick={() => act(h)} data-testid={`office-spot-${h.id}`} aria-label={`${h.label}: ${h.hint}`} title={`${h.label}: ${status[h.id]}`}
                  className="group absolute rounded-md border border-transparent transition-colors hover:border-gold-400/80 hover:bg-gold-300/10 focus-visible:border-gold-300 focus-visible:bg-gold-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                  style={{ left: `${h.rect.x}%`, top: `${h.rect.y}%`, width: `${h.rect.w}%`, height: `${h.rect.h}%` }}>
                  <span className={`${chip} absolute left-0.5 ${h.id === 'chair' ? 'bottom-0.5' : 'top-0.5'}`}>
                    <span aria-hidden>{h.icon}</span>
                    <span className="hidden sm:inline">{h.label}</span>
                    {badge(h.id)}
                  </span>
                </button>
              ))}
            </div>
            {((monday && !panel) || panel) && (
              <div className={`mt-2 space-y-2 md:absolute md:right-2 md:z-10 md:mt-0 md:overflow-y-auto ${panel ? 'md:top-2 md:max-h-[calc(100%-16px)] md:w-[min(400px,46%)]' : OFFICE_CARD_CLEAR}`} data-testid="office-card">
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
        </div>
        <div className="mt-2 flex justify-center sm:hidden" style={{ fontSize: '11px' }}><DeskClock s={s} onOpen={() => setPanel('week')} /></div>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3" data-testid="office-list" aria-label="What is in the office">
          {(['chair', 'envelope', 'door', 'ledger', 'phone', 'calendar', 'newspaper', 'photos', 'map'] as Hotspot['id'][]).map((id) => {
            const h = HOTSPOTS.find((x) => x.id === id)!;
            return (
              <li key={id}>
                <button type="button" onClick={() => act(h)} data-testid={`office-item-${id}`}
                  className="flex w-full items-start gap-2 rounded border border-noir-700 bg-noir-900/70 px-2 py-1.5 text-left hover:border-gold-500 focus-visible:border-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                  <span className="w-5 shrink-0 text-center text-gold-300" aria-hidden>{h.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-stone-100">{h.label} {badge(id)}</span>
                    <span className="block truncate text-[11px] text-stone-400">{status[id]}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-gold-300">▸</span>
                </button>
              </li>
            );
          })}
          <li className="grid grid-cols-2 gap-1.5 sm:col-span-2 xl:col-span-3 xl:grid-cols-4 pt-1">
            <button type="button" className="btn-secondary text-xs" disabled={!s.pendingEvents.length} onClick={api.openDecisions} data-testid="office-decisions">✉ Decisions {answered}/{s.pendingEvents.length}</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => api.openDesk()} data-testid="office-desk">▤ The desk's list</button>
            <button type="button" className="btn-primary col-span-2 text-sm" onClick={api.openAdvance} data-testid="office-advance">Advance the week ▸</button>
          </li>
        </ul>
      </div>
      {tableOpen && tableSubject && <TableModal s={s} subject={tableSubject} onClose={() => setTableOpen(false)}
        onChoose={tableSubject.kind === 'event' ? (choiceId) => onDelegate({ kind: 'answer', iid: tableSubject.iid, choiceId }) : undefined}
        onOption={tableSubject.kind === 'brief' ? (id) => { const it = officeBriefItem(s, tableSubject.itemId); const o = it?.options.find((x) => x.id === id); if (o?.action) onDelegate({ kind: 'order', action: o.action }); } : undefined} />}
    </div>
  );
}

/** Monday's card sits in the bottom-right corner, below the chair and the door: it never covers a hotspot
 * (playtest #11: at the top right it hid the door). */
export const OFFICE_CARD_CLEAR = 'md:bottom-2 md:top-auto md:max-h-[37%] md:w-[min(400px,41%)]';
/** The corner it keeps to, in the scene's percent units (tests check no hotspot reaches into it). */
export const OFFICE_CARD_RECT = { x: 58, y: 63, w: 41, h: 37 };

/** The flip clock and tear-off calendar on the desk, between the appointment book and the chair, above Monday's card
 * (scene percent units; tests check it touches no hotspot and stays clear of the card). */
export const DESK_CLOCK_RECT = { x: 70, y: 44, w: 14.5, h: 17.5 };

/** The man across the desk and his one or two lines. Monday's arrival has the four ways to start. */
function BriefCard({ s, brief, monday, onEnvelope, onDoor, onDesk, onDone, table }: {
  s: GameState; brief: ReturnType<typeof officeBriefing>; monday?: boolean; table?: { label: string; about?: string; onOpen?: () => void };
  onEnvelope: () => void; onDoor: () => void; onDesk: () => void; onDone: () => void;
}) {
  const c = brief.seat.charId ? s.characters[brief.seat.charId] : undefined;
  return (
    <section className="rounded-md border border-gold-500/70 bg-noir-900/95 p-2.5 shadow-lg shadow-black/60" data-testid={monday ? 'office-monday' : 'office-brief'}>
      <div className="flex items-start gap-2">
        {c && <span className="shrink-0 rounded-md ring-1 ring-gold-600/60"><Portrait c={c} seed={s.seed} date={s.date} size={52} tint={FACTION_TINT[c.faction]} /></span>}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{monday ? 'Monday morning' : 'Across the desk'} · {brief.seat.title}</div>
          <div className="font-semibold text-gold-300">{c ? displayName(c) : brief.seat.name}</div>
          {brief.lines.map((l, i) => <p key={i} className="text-[13px] leading-snug text-stone-200">{i === 0 && c ? '"' : ''}{l}{i === brief.lines.length - 1 && c ? '"' : ''}</p>)}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" className="btn-primary text-xs" onClick={onEnvelope} data-testid="office-hear-count">{brief.count !== undefined ? 'Hear the count' : 'The envelope pages'}</button>
        <button type="button" className="btn-secondary text-xs" onClick={onDoor} data-testid="office-see-waiting">See who's waiting</button>
        <button type="button" className="btn-secondary text-xs" onClick={onDesk} data-testid="office-review-desk">Review the desk</button>
        <button type="button" className="btn-secondary text-xs" onClick={onDone} data-testid="office-something-else">{monday ? 'Start with something else' : 'Thanks, that\'s all'}</button>
        {table && <button type="button" className="btn-secondary col-span-2 text-xs" disabled={!table.onOpen} onClick={table.onOpen} title={table.about ? `Everyone's view on: ${table.about}` : 'Nothing waiting at the door to weigh'} data-testid="office-table">⚖ {table.label}{table.about ? <span className="text-stone-500"> — on {table.about.length > 38 ? `${table.about.slice(0, 37)}…` : table.about}</span> : <span className="text-stone-500"> (nothing waiting to weigh)</span>}</button>}
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
          return (
            <li key={v.key} className={`rounded border px-2 py-1.5 ${v.urgent ? 'border-red-400/70 bg-blood-500/10' : 'border-noir-700 bg-noir-950/60'}`} data-testid="office-visitor">
              <div className="flex items-start gap-2">
                {c && <span className="shrink-0"><Portrait c={c} seed={s.seed} date={s.date} size={36} tint={FACTION_TINT[c.faction]} /></span>}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-stone-100">{v.name} <span className="font-normal text-stone-500">· {KIND_WORD[v.kind]}</span>{v.urgent && <span className="ml-1 rounded bg-red-500/80 px-1 text-[9px] font-bold uppercase text-white">urgent</span>}</div>
                  <div className="text-[11px] leading-snug text-stone-400">{v.why}</div>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <button type="button" className="btn-primary px-2 py-0.5 text-[11px]" onClick={() => onInvite(v)} data-testid="office-invite">Invite in</button>
                {v.delegate && <button type="button" className="btn-secondary px-2 py-0.5 text-[11px]" title={v.delegate.does} onClick={() => onDelegate(v.delegate!.op)} data-testid="office-delegate">{v.delegate.label} <span className="text-stone-500">({v.delegate.does})</span></button>}
                <button type="button" className="btn-secondary px-2 py-0.5 text-[11px]" onClick={() => onLater(v)} data-testid="office-later">Schedule for later</button>
                {v.ref.event && <TableButton s={s} subject={{ kind: 'event', iid: v.ref.event }} onChoose={(choiceId) => onDelegate({ kind: 'answer', iid: v.ref.event!, choiceId })} className="btn-secondary px-2 py-0.5 text-[11px]" testid="office-visitor-table" />}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[10px] text-stone-500">"Later" only clears the hall: it stays on the desk, and anything unanswered takes its default when the week turns.</p>
    </div>
  );
}

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
          <li key={p.key} className="rounded border border-noir-700 bg-noir-950/60 px-2 py-1.5" data-testid={`office-call-${p.kind}`}>
            <div className="flex items-center gap-2">
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
