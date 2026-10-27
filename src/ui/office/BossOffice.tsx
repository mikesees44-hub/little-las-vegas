import { useMemo, useState, type ReactNode } from 'react';
import { officeBriefing, officePhone, officeRoom, officeVisitors, type DelegateOp, type OfficeUi, type OfficeVisitor } from '../../engine/bossOffice';
import { displayName } from '../../engine/characters';
import { formatDay } from '../../engine/days';
import { lawyerReading } from '../../engine/roundsPersonal';
import { latestReport } from '../../engine/tribute';
import type { GameState } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { FACTION_TINT, useSheet } from '../components/People';
import { useOffice } from '../desk/officeApi';
import { fmt$ } from '../format';
import { AssetImg } from '../hood/AssetImg';
import { Portrait } from '../portrait/Portrait';
import { HOTSPOTS, type Hotspot, type OfficePanel } from './hotspots';

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
function PaintedFallback() {
  return (
    <div className="absolute inset-0" aria-hidden data-testid="office-fallback"
      style={{ background: 'linear-gradient(180deg, #2a1a10 0%, #3b2416 55%, #4a2c18 56%, #2b190e 100%)' }}>
      {HOTSPOTS.map((h) => (
        <div key={h.id} className="absolute rounded border border-amber-200/10 bg-amber-100/5" style={{ left: `${h.rect.x}%`, top: `${h.rect.y}%`, width: `${h.rect.w}%`, height: `${h.rect.h}%` }} />
      ))}
    </div>
  );
}

export function BossOffice({ s, ui, monday, onMondayDone, onInvite, onDelegate, onLater, onClub, initialPanel }: BossOfficeProps) {
  const api = useOffice();
  const [panel, setPanel] = useState<OfficePanel | undefined>(initialPanel);
  const brief = useMemo(() => officeBriefing(s, ui), [s, ui]);
  const visitors = useMemo(() => officeVisitors(s, ui), [s, ui]);
  const room = useMemo(() => officeRoom(s), [s]);
  const rep = latestReport(s);
  const envelopeWaiting = rep?.status === 'presented';
  const seatC = brief.seat.charId ? s.characters[brief.seat.charId] : undefined;
  const answered = s.pendingEvents.filter((e) => ui.answers?.[e.iid]).length;

  const openEnvelope = () => (rep ? api.openEnvelope() : api.openLedger());
  function act(h: Hotspot) {
    if ('panel' in h.entry) { setPanel(h.entry.panel); return; }
    if (h.id === 'envelope') { openEnvelope(); return; }
    const f = api[h.entry.api] as (x?: number) => void;
    f();
  }
  const badge = (id: Hotspot['id']): ReactNode => {
    if (id === 'envelope' && envelopeWaiting) return <span className="text-emerald-300">{fmt$(rep!.reported)}</span>;
    if (id === 'door' && visitors.length) return <span className={`rounded-full px-1 font-bold text-white ${visitors.some((v) => v.urgent) ? 'bg-red-600' : 'bg-blood-500'}`}>{visitors.length}</span>;
    if (id === 'photos') return <span className="text-stone-300">{room.photos}</span>;
    return null;
  };

  const status: Record<Hotspot['id'], string> = {
    chair: brief.seat.role === 'none' ? 'Nobody in the chair' : `${brief.seat.name} · ${brief.seat.title.toLowerCase()}`,
    envelope: envelopeWaiting ? `${fmt$(rep!.reported)} on the desk: hear the count` : rep ? 'Heard this week · the envelope pages' : 'No count yet · the weekly envelope page',
    door: visitors.length ? `${visitors.length} waiting${visitors.some((v) => v.urgent) ? ' · urgent' : ''}` : 'Nobody waiting',
    ledger: 'The money, the accounts, the agreements',
    phone: room.absence?.kind === 'prison' ? 'From inside: only your lawyer' : 'Your lawyer, your people, the other bosses',
    calendar: formatDay(s),
    newspaper: room.headline ? room.headline.text : 'Nothing in the papers yet',
    photos: `${room.photos} photograph${room.photos === 1 ? '' : 's'}${room.memorial ? ` · in memory of ${room.memorial.name}` : ''}`,
    map: 'Go out: Wildwood and beyond',
  };

  const panelBody = panel === 'door' ? <DoorPanel s={s} visitors={visitors} onInvite={onInvite} onDelegate={onDelegate} onLater={onLater} />
    : panel === 'phone' ? <PhonePanel s={s} />
    : panel === 'brief' ? <BriefCard s={s} brief={brief} onEnvelope={openEnvelope} onDoor={() => setPanel('door')} onDesk={api.openDesk} onDone={() => setPanel(undefined)} />
    : undefined;

  return (
    <div className="absolute inset-0 z-[1090] overflow-y-auto bg-noir-950/[0.98] pb-16 md:pb-2" data-testid="boss-office" role="region" aria-label="The Boss's Office">
      <div className="mx-auto max-w-[1500px] p-2 sm:p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl text-gold-400 leading-tight">The Office</h1>
            <div className="text-[11px] text-stone-400">{room.hq.club ? 'Upstairs at the Shore Social Club' : `Business is done at: ${room.hq.name.toLowerCase()}. The office upstairs at the club`} · {formatDay(s)} · week {s.week}</div>
          </div>
          <div className="flex gap-1.5">
            <button type="button" className="btn-ghost text-xs" onClick={onClub} data-testid="office-downstairs">⇣ Downstairs</button>
            <button type="button" className="btn-ghost text-xs" onClick={api.openMap} data-testid="office-to-map">⌖ The map</button>
          </div>
        </div>
        {room.absence && (
          <div className="mb-2 rounded border border-amber-500/60 bg-amber-900/20 px-2 py-1.5 text-[12px] text-amber-100" data-testid="office-absence">{room.absence.note}</div>
        )}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
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
              {HOTSPOTS.map((h) => (
                <button key={h.id} type="button" onClick={() => act(h)} data-testid={`office-spot-${h.id}`} aria-label={`${h.label}: ${h.hint}`} title={`${h.label}: ${status[h.id]}`}
                  className="group absolute rounded-md border border-transparent transition-colors hover:border-gold-400/80 hover:bg-gold-300/10 focus-visible:border-gold-300 focus-visible:bg-gold-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                  style={{ left: `${h.rect.x}%`, top: `${h.rect.y}%`, width: `${h.rect.w}%`, height: `${h.rect.h}%` }}>
                  <span className={`${chip} absolute left-0.5 top-0.5`}>
                    <span aria-hidden>{h.icon}</span>
                    <span className="hidden sm:inline">{h.label}</span>
                    {badge(h.id)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <aside className="space-y-2">
            {monday && !panel && (
              <BriefCard s={s} brief={brief} monday onEnvelope={() => { onMondayDone(); openEnvelope(); }} onDoor={() => { onMondayDone(); setPanel('door'); }} onDesk={() => { onMondayDone(); api.openDesk(); }} onDone={onMondayDone} />
            )}
            {panel ? (
              <div className="rounded-md border border-gold-600/50 bg-noir-900/90 p-2.5" data-testid={`office-panel-${panel}`}>
                <button type="button" className="mb-1 text-[11px] text-stone-400 hover:text-gold-300" onClick={() => setPanel(undefined)} data-testid="office-panel-back">← Back to the office</button>
                {panelBody}
              </div>
            ) : (
              <ul className="space-y-1" data-testid="office-list" aria-label="What is in the office">
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
                <li className="grid grid-cols-2 gap-1.5 pt-1">
                  <button type="button" className="btn-ghost text-xs" disabled={!s.pendingEvents.length} onClick={api.openDecisions} data-testid="office-decisions">✉ Decisions {answered}/{s.pendingEvents.length}</button>
                  <button type="button" className="btn-ghost text-xs" onClick={api.openDesk} data-testid="office-desk">▤ The desk's list</button>
                  <button type="button" className="btn-gold col-span-2 text-sm" onClick={api.openAdvance} data-testid="office-advance">Advance the week ▸</button>
                </li>
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** The man across the desk and his one or two lines. Monday's arrival has the four ways to start. */
function BriefCard({ s, brief, monday, onEnvelope, onDoor, onDesk, onDone }: {
  s: GameState; brief: ReturnType<typeof officeBriefing>; monday?: boolean;
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
        <button type="button" className="btn-gold text-xs" onClick={onEnvelope} data-testid="office-hear-count">{brief.reportId ? 'Hear the count' : 'The envelope pages'}</button>
        <button type="button" className="btn-ghost text-xs" onClick={onDoor} data-testid="office-see-waiting">See who's waiting</button>
        <button type="button" className="btn-ghost text-xs" onClick={onDesk} data-testid="office-review-desk">Review the desk</button>
        <button type="button" className="btn-ghost text-xs" onClick={onDone} data-testid="office-something-else">{monday ? 'Start with something else' : 'Thanks, that\'s all'}</button>
      </div>
    </section>
  );
}

const KIND_WORD: Record<OfficeVisitor['kind'], string> = { decision: 'Wants a decision', petition: 'A petition', morning: 'A capo\'s request', sitdown: 'For the sit-down', lawyer: 'Your lawyer' };

function DoorPanel({ s, visitors, onInvite, onDelegate, onLater }: { s: GameState; visitors: OfficeVisitor[]; onInvite: (v: OfficeVisitor) => void; onDelegate: (op: DelegateOp) => void; onLater: (v: OfficeVisitor) => void }) {
  return (
    <div data-testid="office-door">
      <div className="panel-title text-base">Outside the door</div>
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
                <button type="button" className="btn-gold px-2 py-0.5 text-[11px]" onClick={() => onInvite(v)} data-testid="office-invite">Invite in</button>
                {v.delegate && <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" title={v.delegate.does} onClick={() => onDelegate(v.delegate!.op)} data-testid="office-delegate">{v.delegate.label} <span className="text-stone-500">({v.delegate.does})</span></button>}
                <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => onLater(v)} data-testid="office-later">Schedule for later</button>
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
              <button type="button" className="btn-ghost shrink-0 px-2 py-0.5 text-[11px]" disabled={!!p.blocked}
                onClick={(e) => { if (p.kind === 'lawyer') setLawyer((x) => !x); else if (p.charId) sheet.menu?.(p.charId, p.kind === 'rival' ? 'diplomacy' : 'talk', { x: Math.max(8, e.clientX - 260), y: e.clientY }); }}
                data-testid={p.kind === 'lawyer' ? 'office-call-lawyer-btn' : undefined}>☏ Call</button>
            </div>
            {p.kind === 'lawyer' && reading && (
              <div className="mt-1 rounded border border-noir-700 bg-noir-900/80 p-2 text-[11px] leading-snug text-stone-300" data-testid="office-lawyer">
                <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">On the line: what he will tell you</div>
                {reading.lines.map((l, i) => <p key={i}>{l}</p>)}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <button type="button" className="btn-gold px-2 py-0.5 text-[11px]" onClick={() => api.openCalendar()} data-testid="office-lawyer-book">Book an hour with him (an evening) ▸</button>
                  {reading.moves.filter((m) => m.action).map((m) => (
                    <button key={m.label} type="button" title={m.why} className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => orders.queue(m.action!)}>{m.label} ▸</button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-stone-500">A real sit-down with him is an evening in your week (Your affairs). Anything he does is an order, carried out when the week turns.</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
