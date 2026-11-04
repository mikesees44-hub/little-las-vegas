import { useState } from 'react';
import type { AudienceReq, Slot } from '../../engine/planner/audience';
import { absOf, absOfDate, cancelCost, dateOf, dayPage, eveningPicks, monthPage, PAGE_HOURS, planPeople, weekPage, wdOf, type BookEntry, type DayPage } from '../../engine/planner/datebook';
import { nowHour, PLAN_HOURS, slotBlock } from '../../engine/planner/hours';
import type { Go } from '../../engine/planner/intel';
import { DAY_SHORT } from '../../engine/days';
import { absDay, formatClock, hoursLabel } from '../../engine/timeCost';
import type { DialSpec } from '../../engine/phoneMeet';
import type { GameState } from '../../engine/types';
import { ConfStamp, InkDot } from './ink';
import { SlotPicker, type PickSlot } from './SlotPicker';
import { domainOf, domClass } from '../domain';

type View = 'day' | 'week' | 'month';

export interface DatebookApi {
  onGo: (g: Go) => void;
  onPhone: (p: Partial<DialSpec>) => void;
  onPlan: (kind: 'dinner' | 'visit', who: string, sl: Slot) => void;
  onEvening: (d: number, id: string) => void;
  onGrant: (r: AudienceReq, sl: Slot) => void;
  onMove: (e: BookEntry, sl: PickSlot) => void;
  onCancel: (e: BookEntry) => void;
  onNote: (abs: number, text: string) => void;
}

/**
 * THE DATEBOOK: a leather planner, two pages: today hour by hour (8 AM to 2 AM) and the week at a glance
 * (or the month). An empty hour plans something there (a meet opens the phone filled in); an entry opens to
 * see it, move it or cancel it, with the cost said first. Done things carry a tick and the line that came
 * of them, into Your File. The hours left today and this week are on the spine.
 */
export function Datebook({ s, reqs, api }: { s: GameState; reqs: AudienceReq[]; api: DatebookApi }) {
  const now = absDay(s);
  const [cur, setCur] = useState(now);
  const [view, setView] = useState<View>('day');
  const [right, setRight] = useState<'week' | 'month'>('week');
  const { w, d } = wdOf(cur);
  const page = dayPage(s, w, d);
  const wk = weekPage(s, w);
  const goDay = (abs: number) => { setCur(abs); setView('day'); };
  const seg = (v: View, label: string) => (
    <button type="button" role="tab" aria-selected={view === v} onClick={() => { setView(v); if (v !== 'day') setRight(v); }} className={`rounded px-2.5 py-1 text-[12px] font-semibold ${view === v ? 'bg-[#f4ecd8] text-[#2a2118]' : 'text-[#e9d6b0] hover:text-white'}`} data-testid={`book-view-${v}`}>{label}</button>
  );
  return (
    <div className="llv-leather mx-auto max-w-[1100px] p-2 sm:p-3" data-testid="datebook">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[#e9d6b0]">
        <div className="flex items-center gap-1" role="tablist" aria-label="Datebook pages">{seg('day', 'Day')}{seg('week', 'Week')}{seg('month', 'Month')}</div>
        <div className="text-[12px]" data-testid="book-hours"><b>{hoursLabel(page.today ? page.free : wk.days.find((x) => x.today)?.free ?? 0)}</b> left today · <b>{hoursLabel(weekPage(s, s.week).left)}</b> this week</div>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <div className={view === 'day' ? '' : 'hidden lg:block'}>
          <DayView s={s} page={page} reqs={reqs} api={api} onNav={(n) => setCur((c) => c + n)} onToday={() => setCur(now)} />
        </div>
        <div className={view === 'day' ? 'hidden lg:block' : ''}>
          {(view === 'month' || (view === 'day' && right === 'month'))
            ? <MonthView s={s} abs={cur} onDay={goDay} onNav={(n) => setCur((c) => monthStep(c, n))} />
            : <WeekView s={s} w={w} cur={cur} onDay={goDay} onNav={(n) => setCur((c) => c + n * 7)} />}
        </div>
      </div>
    </div>
  );
}

/** The same day a month on (or back), clamped into the month. */
function monthStep(abs: number, n: number): number {
  const { w, d } = wdOf(abs);
  const dt = dateOf(w, d);
  let m = dt.m + n;
  let y = dt.y;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return absOfDate({ y, m, d: Math.min(dt.d, 28) });
}

function entryClass(e: BookEntry): string {
  const dd = domainOf(e.dom);
  return `llv-entry ${dd ? domClass(dd) : ''} ${e.done ? 'llv-entry-done' : ''}`;
}

function DayView({ s, page, reqs, api, onNav, onToday }: { s: GameState; page: DayPage; reqs: AudienceReq[]; api: DatebookApi; onNav: (n: number) => void; onToday: () => void }) {
  const [sel, setSel] = useState<{ entry?: string; hour?: number } | undefined>();
  const live = !page.past;
  const nowH = page.today ? Math.floor(nowHour(s)) : 0;
  const at = (h: number) => page.entries.filter((e) => e.kind !== 'done' && Math.floor(e.h) === h);
  const done = page.entries.filter((e) => e.kind === 'done');
  return (
    <section className="llv-paper min-h-[420px] rounded-sm px-1 pb-3 pt-2 sm:px-2" data-testid="book-day" data-abs={page.abs}>
      <header className="mb-1 flex items-center justify-between gap-1 pl-9 pr-1">
        <button type="button" className="llv-ink-btn px-2" onClick={() => onNav(-1)} aria-label="The day before" data-testid="book-prev">‹</button>
        <div className="min-w-0 text-center">
          <div className="font-display text-[17px] leading-tight">{page.label}</div>
          <div className="text-[11px] text-[#6b5a44]">{page.past ? 'Gone: what happened' : `${hoursLabel(page.free)} free`}{!page.today && <button type="button" className="ml-2 underline" onClick={onToday} data-testid="book-today">today</button>}</div>
        </div>
        <button type="button" className="llv-ink-btn px-2" onClick={() => onNav(1)} aria-label="The day after" data-testid="book-next">›</button>
      </header>
      {page.w === s.week && live && <div className="-mt-0.5 mb-1 pl-9 text-[11px]"><button type="button" className="underline decoration-dotted text-[#4a3b28] hover:text-[#2a2118]" onClick={() => api.onGo({ day: page.d })} data-testid="book-rounds">The morning with the capos, the evening's round ▸</button></div>}
      {live && (
        <div role="list" aria-label="Hours">
          {PAGE_HOURS.map((h) => {
            const es = at(h);
            const gone = page.today && h < nowH;
            const open = sel?.hour === h;
            return (
              <div key={h} className={`llv-hour ${gone ? 'llv-hour-gone' : ''}`} role="listitem" data-hour={h}>
                <div className="llv-hour-l">{formatClock(h).replace(':00', '').replace(' ', ' ')}</div>
                <div className="min-w-0">
                  {es.map((e) => (
                    <div key={e.id}>
                      <button type="button" className={entryClass(e)} onClick={() => setSel(sel?.entry === e.id ? undefined : { entry: e.id })} aria-expanded={sel?.entry === e.id} data-testid={`book-entry-${e.kind}`} data-entry={e.id}>
                        <span className="flex items-baseline gap-1.5">
                          <span className={`min-w-0 flex-1 truncate font-semibold ${e.hidden ? 'llv-hidden-ink' : ''}`} tabIndex={-1}>{e.title}</span>
                          {e.count && <span className="shrink-0 text-[10.5px] font-bold text-[#a3271d]">{e.count}</span>}
                          <ConfStamp conf={e.conf} />
                        </span>
                        {e.dur > 0 && <span className="block text-[10.5px] text-[#6b5a44]">{formatClock(e.h)} – {formatClock(e.h + e.dur)}</span>}
                      </button>
                      {sel?.entry === e.id && <EntryCard s={s} e={e} api={api} onClose={() => setSel(undefined)} />}
                    </div>
                  ))}
                  {!es.length && !gone && (
                    <button type="button" className="llv-hour-slot text-[11px] text-transparent hover:text-[#8a7a62] focus-visible:text-[#8a7a62]" onClick={() => setSel(open ? undefined : { hour: h })} aria-label={`Plan something at ${formatClock(h)}`} data-testid={`book-slot-${h}`}>+ plan</button>
                  )}
                  {open && <PlanCard s={s} w={page.w} d={page.d} h={h} reqs={reqs} api={api} onClose={() => setSel(undefined)} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(done.length > 0 || page.file.length > 0) && (
        <div className="mt-2 pl-9 pr-2" data-testid="book-done">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#6b5a44]">Done</div>
          <ul className="text-[12.5px]">
            {done.map((e) => (
              <li key={e.id}><button type="button" className="text-left hover:underline" onClick={() => api.onGo({ file: true })} data-testid="book-done-tick"><span className="llv-tick">✓</span> {formatClock(e.h)} {e.title}: <i>{e.done?.r}</i> <span className="text-[10.5px] text-[#6b5a44]">Your File ▸</span></button></li>
            ))}
            {page.file.filter((f) => !done.some((x) => x.done?.jid === f.id)).slice(0, 8).map((f) => (
              <li key={f.id}><button type="button" className="text-left hover:underline" onClick={() => api.onGo({ file: true })}>{f.mine ? <span className="llv-tick">✓</span> : <span className="text-[#8a7a62]">·</span>} {f.tm ? `${f.tm} ` : ''}{f.t}</button></li>
            ))}
          </ul>
        </div>
      )}
      {page.past && !done.length && !page.file.length && <p className="pl-9 pt-4 text-[13px] text-[#6b5a44]">Nothing written down that day.</p>}
      <div className="mt-2 pl-9 pr-2">
        <label className="text-[10.5px] uppercase tracking-[0.16em] text-[#6b5a44]" htmlFor={`note-${page.abs}`}>In the margin</label>
        <textarea key={page.abs} id={`note-${page.abs}`} className="llv-planner-note" defaultValue={page.note ?? ''} placeholder="A note to yourself…" maxLength={280}
          onBlur={(e) => { if ((e.target.value || '') !== (page.note ?? '')) api.onNote(page.abs, e.target.value); }} data-testid="book-note" />
      </div>
    </section>
  );
}

function EntryCard({ s, e, api, onClose }: { s: GameState; e: BookEntry; api: DatebookApi; onClose: () => void }) {
  const [what, setWhat] = useState<'move' | 'cancel' | undefined>();
  return (
    <div className="llv-pop my-1 p-2 text-[12.5px]" data-testid="book-entry-card">
      <div className="flex items-start gap-1.5"><InkDot dom={e.dom} /><b className={e.hidden ? 'llv-hidden-ink' : ''} data-shown="1">{e.title}</b></div>
      {e.sub && <p className={`text-[12px] text-[#4a3b28] ${e.hidden ? 'llv-hidden-ink' : ''}`} data-shown="1">{e.sub}</p>}
      {e.hidden && <p className="text-[11px] italic text-[#3d2a7a]">Written in the ink only you can read.</p>}
      {e.count && <p className="text-[11.5px] text-[#a3271d]">It lands {e.count}.{e.conf ? ` The house rates it: ${e.conf}.` : ''}</p>}
      {e.done && <p className="text-[12px]"><span className="llv-tick">✓</span> {e.done.r}</p>}
      <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
        {e.cancel && <button type="button" className="llv-ink-btn llv-ink-btn-red" onClick={() => setWhat(what === 'cancel' ? undefined : 'cancel')} data-testid="entry-cancel">Cancel</button>}
        {e.move && <button type="button" className="llv-ink-btn" onClick={() => setWhat(what === 'move' ? undefined : 'move')} data-testid="entry-move">Move</button>}
        {e.done && <button type="button" className="llv-ink-btn" onClick={() => api.onGo({ file: true })}>Your File ▸</button>}
        {e.go && !e.done && <button type="button" className="llv-ink-btn llv-ink-btn-primary" onClick={() => api.onGo(e.go!)} data-testid="entry-open">Open ▸</button>}
      </div>
      {what === 'cancel' && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[#2a2118]/30 pt-1.5">
          <span>{cancelCost(s, e)}</span>
          <button type="button" className="llv-ink-btn llv-ink-btn-red" onClick={() => { onClose(); api.onCancel(e); }} data-testid="entry-cancel-yes">Call it off</button>
        </div>
      )}
      {what === 'move' && (e.kind === 'evening'
        ? <div className="mt-1 flex flex-wrap gap-1">{[0, 1, 2, 3, 4, 5, 6].filter((d) => d !== e.d && absOf(s.week, d) >= absDay(s)).map((d) => <button key={d} type="button" className="llv-ink-btn" onClick={() => { onClose(); api.onMove(e, { w: s.week, d, h: 20 }); }}>{DAY_SHORT[d]}</button>)}</div>
        : <SlotPicker s={s} hours={e.dur || 1} initial={{ w: e.w, d: e.d, h: e.h }} label="Move it to" testid="move" onPick={(sl) => { onClose(); api.onMove(e, sl); }} />)}
    </div>
  );
}

type PlanWhat = 'meet' | 'dinner' | 'visit' | 'evening' | 'audience';

function PlanCard({ s, w, d, h, reqs, api, onClose }: { s: GameState; w: number; d: number; h: number; reqs: AudienceReq[]; api: DatebookApi; onClose: () => void }) {
  const [what, setWhat] = useState<PlanWhat>('meet');
  const kinds: { id: PlanWhat; label: string }[] = [
    { id: 'meet', label: '☎ A meet' }, { id: 'dinner', label: 'Dinner' }, { id: 'visit', label: 'A visit' },
    ...(w === s.week && h >= 18 ? [{ id: 'evening' as const, label: 'An evening' }] : []),
    ...(reqs.some((r) => !r.booked) ? [{ id: 'audience' as const, label: 'An audience' }] : []),
  ];
  const sl = { w, d, h };
  const hrs = what === 'dinner' ? PLAN_HOURS.dinner : what === 'visit' ? PLAN_HOURS.visit : what === 'audience' ? PLAN_HOURS.audience : PLAN_HOURS.meet;
  const block = what === 'evening' ? undefined : slotBlock(s, w, d, h, hrs);
  const people = what === 'dinner' || what === 'visit' ? planPeople(s, what) : [];
  const [who, setWho] = useState('');
  return (
    <div className="llv-pop my-1 p-2 text-[12.5px]" data-testid="book-plan">
      <div className="mb-1 flex flex-wrap gap-1" role="radiogroup" aria-label={`Plan at ${formatClock(h)}`}>
        {kinds.map((k) => <button key={k.id} type="button" aria-pressed={what === k.id} onClick={() => setWhat(k.id)} className={`llv-ink-btn ${what === k.id ? 'llv-ink-btn-primary' : ''}`} data-testid={`plan-${k.id}`}>{k.label}</button>)}
      </div>
      {what === 'meet' && (
        <div className="flex items-center justify-between gap-2"><span>Call somebody and set it: {formatClock(h)}. The phone has the odds.</span>
          <button type="button" className="llv-ink-btn llv-ink-btn-primary" onClick={() => { onClose(); api.onPhone({ purpose: 'meet', w, d, hour: h }); }} data-testid="plan-meet-phone">Pick up the phone ▸</button></div>
      )}
      {(what === 'dinner' || what === 'visit') && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select className="min-w-0 flex-1 rounded border border-[#2a2118]/40 bg-[#fffaf0] px-1 py-1" value={who} onChange={(e) => setWho(e.target.value)} aria-label="With whom" data-testid="plan-who">
            <option value="">{what === 'dinner' ? 'Dinner with…' : 'Call on…'}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
          </select>
          <button type="button" className="llv-ink-btn llv-ink-btn-primary" disabled={!who || !!block} title={block} onClick={() => { onClose(); api.onPlan(what, who, sl); }} data-testid="plan-book">{block ?? `Book it (${hoursLabel(hrs)})`}</button>
        </div>
      )}
      {what === 'evening' && (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto">
          {eveningPicks(s, w, d).map((r) => (
            <li key={r.id}><button type="button" className="w-full rounded px-1 py-0.5 text-left hover:bg-[#2a2118]/10 disabled:opacity-50" disabled={!!r.blocked} title={r.blocked ?? r.text} onClick={() => { onClose(); api.onEvening(d, r.id); }}>{r.label}{r.blocked && <span className="text-[11px] text-[#6b5a44]"> · {r.blocked}</span>}</button></li>
          ))}
        </ul>
      )}
      {what === 'audience' && (
        <ul className="space-y-0.5">
          {reqs.filter((r) => !r.booked && !r.ref.tip).slice(0, 5).map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{r.name} <span className="text-[11px] text-[#6b5a44]">· {r.score}</span></span>
              <button type="button" className="llv-ink-btn" disabled={!!block} title={block} onClick={() => { onClose(); api.onGrant(r, sl); }}>{block ?? 'This hour'}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WeekView({ s, w, cur, onDay, onNav }: { s: GameState; w: number; cur: number; onDay: (abs: number) => void; onNav: (n: number) => void }) {
  const wk = weekPage(s, w);
  return (
    <section className="llv-paper-plain min-h-[420px] rounded-sm p-2" data-testid="book-week">
      <header className="mb-1 flex items-center justify-between">
        <button type="button" className="llv-ink-btn px-2" onClick={() => onNav(-1)} aria-label="The week before">‹</button>
        <div className="text-center"><div className="font-display text-[16px]">The week of {wk.label}</div>{w >= s.week && <div className="text-[11px] text-[#6b5a44]">{hoursLabel(wk.left)} free</div>}</div>
        <button type="button" className="llv-ink-btn px-2" onClick={() => onNav(1)} aria-label="The week after">›</button>
      </header>
      <ul className="divide-y divide-[#2a2118]/15">
        {wk.days.map((p) => {
          const es = p.entries.filter((e) => e.kind !== 'saint');
          return (
            <li key={p.abs}>
              <button type="button" onClick={() => onDay(p.abs)} className={`grid w-full grid-cols-[3.4rem_1fr] gap-2 py-1.5 text-left hover:bg-[#fffaf0]/70 ${p.abs === cur ? 'bg-[#fffaf0]/80' : ''} ${p.past ? 'opacity-70' : ''}`} data-testid={`book-week-day-${p.d}`}>
                <span className="leading-tight"><b className={p.today ? 'text-[#a3271d]' : ''}>{p.short}</b><span className="block text-[10px] text-[#6b5a44]">{p.past ? 'gone' : `${hoursLabel(p.free)}`}</span></span>
                <span className="min-w-0 space-y-0.5 text-[12px]">
                  {!es.length && <span className="text-[#8a7a62]">{p.past ? '' : 'Open'}</span>}
                  {es.slice(0, 4).map((e) => (
                    <span key={e.id} className="flex items-baseline gap-1.5"><InkDot dom={e.dom} /><span className="w-12 shrink-0 text-[10.5px] text-[#6b5a44]">{formatClock(e.h)}</span><span className={`min-w-0 truncate ${e.hidden ? 'llv-hidden-ink' : ''} ${e.done ? 'line-through decoration-[#2a2118]/40' : ''}`}>{e.done ? '✓ ' : ''}{e.title}</span>{e.count && <span className="shrink-0 text-[10px] text-[#a3271d]">{e.count}</span>}</span>
                  ))}
                  {es.length > 4 && <span className="text-[10.5px] text-[#6b5a44]">+{es.length - 4} more</span>}
                  {p.note && <span className="block truncate font-[cursive] text-[#3d2a7a]">✎ {p.note}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MonthView({ s, abs, onDay, onNav }: { s: GameState; abs: number; onDay: (abs: number) => void; onNav: (n: number) => void }) {
  const m = monthOf(s, abs);
  return (
    <section className="llv-paper-plain min-h-[420px] rounded-sm p-2" data-testid="book-month">
      <header className="mb-1 flex items-center justify-between">
        <button type="button" className="llv-ink-btn px-2" onClick={() => onNav(-1)} aria-label="The month before">‹</button>
        <div className="font-display text-[16px]">{m.label}</div>
        <button type="button" className="llv-ink-btn px-2" onClick={() => onNav(1)} aria-label="The month after">›</button>
      </header>
      <div className="llv-month mb-1 text-center text-[10px] uppercase tracking-wider text-[#6b5a44]">{DAY_SHORT.map((x) => <span key={x}>{x}</span>)}</div>
      <div className="llv-month">
        {Array.from({ length: m.lead }, (_, i) => <span key={`b${i}`} />)}
        {m.cells.map((c) => (
          <button key={c.abs} type="button" className={`llv-month-cell ${c.past ? 'opacity-60' : ''} ${c.today ? 'ring-2 ring-[#a3271d]' : ''}`} onClick={() => onDay(c.abs)} data-testid={c.today ? 'book-month-today' : undefined} aria-label={`${m.label.split(' ')[0]} ${c.day}: ${c.n} on the book`}>
            <b>{c.day}</b>
            <span className="mt-0.5 flex flex-wrap gap-0.5">{c.flags.slice(0, 4).map((f) => <span key={f} className={`inline-block h-1.5 w-1.5 rounded-full ${f === 'threat' || f === 'storm' ? 'bg-[#a3271d]' : f === 'family' ? 'bg-[#b63e62]' : f === 'court' ? 'bg-[#4a7cb0]' : 'bg-[#2a2118]/60'}`} title={f} />)}</span>
            {c.n > 0 && <span className="block text-[9.5px] text-[#6b5a44]">{c.n}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The month the cursor day falls in. */
function monthOf(s: GameState, abs: number) {
  const { w, d } = wdOf(abs);
  const dt = dateOf(w, d);
  return monthPage(s, dt.y, dt.m);
}
