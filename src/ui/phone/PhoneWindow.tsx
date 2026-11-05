import { useMemo, useState } from 'react';
import type { GameState } from '../../engine/types';
import { canCallBack, lineStatus, missedCalls } from '../../engine/phone';
import { meetDefault } from '../../engine/planner/gate';
import { dialPreview, MEET_HOURS, meetDays, meetPlaces, meetsAhead, phoneBook, PURPOSE_LABEL, type BookEntry, type DialSpec, type PlaceId, type Purpose } from '../../engine/phoneMeet';
import { LINE_LABEL } from '../../engine/phone';
import { DAY_NAMES } from '../../engine/days';
import { hourText } from '../../engine/threats';
import { Modal } from '../components/Modal';
import { Empty } from '../components/Layout';
import { domainOfText, domClass } from '../domain';

/**
 * THE PHONE (PHONE.md): one window, three tabs. Missed calls (call back), the phone book (pick a
 * person, then a purpose, then for a meet the place and the day and hour; a pay phone or code words
 * if the line may be tapped; the odds before you dial), and the log (the meets ahead, the last calls;
 * every call is also in Your File).
 */
type Tab = 'missed' | 'dial' | 'log';

const GROUPS: { id: BookEntry['group']; label: string }[] = [
  { id: 'family', label: 'Family' }, { id: 'crew', label: 'Your people' }, { id: 'outfits', label: 'The other outfits' }, { id: 'services', label: 'Services' },
];

export function PhoneWindow({ s, onClose, onDial, onCallBack, prefill }: {
  s: GameState; onClose: () => void; onDial: (spec: DialSpec) => void; onCallBack: (missedId: string) => void;
  /** Opened from the datebook or the black book: the number, the purpose and the slot already filled in. */
  prefill?: Partial<DialSpec>;
}) {
  const missed = missedCalls(s);
  const [tab, setTab] = useState<Tab>(prefill || !missed.length ? 'dial' : 'missed');
  const book = useMemo(() => phoneBook(s), [s]);
  const [who, setWho] = useState<string | undefined>(prefill?.who && book.some((e) => e.id === prefill.who) ? prefill.who : undefined);
  const [purpose, setPurpose] = useState<Purpose | undefined>(prefill?.who && prefill.purpose ? prefill.purpose : undefined);
  const days = meetDays(s);
  const places = meetPlaces(s);
  // The gatekeeper puts down the place and the hour (planner/gate.ts meetDefault); the boss can change both.
  const dflt = useMemo(() => meetDefault(s, prefill?.who), [s, prefill?.who]);
  const [place, setPlace] = useState<PlaceId>(prefill?.place ?? dflt.place);
  const [day, setDay] = useState(() => Math.max(0, prefill?.d !== undefined ? days.findIndex((x) => x.w === (prefill.w ?? s.week) && x.d === prefill.d) : 0));
  const [hour, setHour] = useState(() => (prefill?.hour !== undefined ? MEET_HOURS.reduce((a, b) => (Math.abs(b - prefill.hour!) < Math.abs(a - prefill.hour!) ? b : a)) : dflt.hour));
  const [pay, setPay] = useState(false);
  const [code, setCode] = useState(false);
  const entry = book.find((e) => e.id === who);
  const spec: DialSpec | undefined = entry && purpose ? { who: entry.id, purpose, pay, code, ...(purpose === 'meet' && days[day] ? { place, w: days[day].w, d: days[day].d, hour } : {}) } : undefined;
  const pv = spec ? dialPreview(s, spec) : undefined;
  const ahead = meetsAhead(s);
  const tabBtn = (t: Tab, label: string, n?: number) => (
    <button type="button" role="tab" onClick={() => setTab(t)} data-testid={`phone-tab-${t}`} aria-pressed={tab === t} aria-selected={tab === t}
      className={`llv-seg-tab ${tab === t ? 'llv-seg-on' : ''}`}>
      {label}{n ? <span className="ml-1 rounded-full bg-blood-500 px-1.5 text-[10px] text-white">{n}</span> : null}
    </button>
  );
  return (
    <Modal onClose={onClose}>
      <div className="p-4" data-testid="phone-window">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gold-600/60 bg-noir-800 text-gold-300" aria-hidden>☎</span>
            <div>
              <div className="font-display text-xl text-gold-400 leading-none">The phone</div>
              <div className="text-[11px] text-stone-400" data-testid="phone-line">{lineStatus(s)}</div>
            </div>
          </div>
          <button type="button" className="btn-quiet text-xs" onClick={onClose} aria-label="Close" data-testid="phone-close">✕</button>
        </div>
        <div className="llv-seg tabbar mt-3 !mb-0" role="tablist" aria-label="The phone">
          {tabBtn('missed', 'Missed', missed.length)}
          {tabBtn('dial', 'Make a call')}
          {tabBtn('log', 'Calls & meets', ahead.length)}
        </div>

        {tab === 'missed' && (
          <div className="mt-3 space-y-2" data-testid="phone-missed">
            {!missed.length && <Empty title="No missed calls" action={<button type="button" className="btn-secondary text-xs" onClick={() => setTab('dial')}>Make a call ▸</button>}>When somebody rings while you are out, it shows up here.</Empty>}
            {missed.slice().reverse().map((m) => {
              const why = canCallBack(s, m);
              const d = domainOfText(s, `${m.p.role} ${m.p.name}`);
              return (
                <div key={m.id} className={`llv-card-box ${m.h === 2 ? 'llv-card-danger' : 'llv-card-plain'} ${d ? `${domClass(d)} llv-dom-edge llv-dom-tint` : ''} flex items-center justify-between gap-2 py-2`} data-domain={d}>
                  <div className="min-w-0">
                    <div className="text-sm text-stone-200 truncate">{m.p.name} <span className="text-stone-500">· {m.p.role}</span></div>
                    <div className="text-[11px] text-stone-500">{DAY_NAMES[m.d]}, {hourText(m.h)}{m.h === 2 ? ' · bad news' : ''}</div>
                  </div>
                  <button type="button" className={`${why ? 'btn-secondary' : 'btn-primary'} shrink-0 px-2.5 py-1 text-xs`} disabled={!!why} title={why} onClick={() => onCallBack(m.id)} data-testid={`call-back-${m.id}`}>
                    {why ? why : 'Call back ▸'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'dial' && (
          <div className="mt-3 space-y-3" data-testid="phone-dial">
            <label className="block text-xs text-stone-400"><Step n={1} on={!!entry}>Who</Step>
              <select className="inp mt-1 w-full text-sm" value={who ?? ''} onChange={(e) => { setWho(e.target.value || undefined); setPurpose(prefill?.purpose && book.find((x) => x.id === e.target.value)?.purposes.includes(prefill.purpose) ? prefill.purpose : undefined); }} data-testid="dial-who">
                <option value="">Pick a number…</option>
                {GROUPS.map((g) => {
                  const xs = book.filter((e) => e.group === g.id);
                  return xs.length ? <optgroup key={g.id} label={g.label}>{xs.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}</optgroup> : null;
                })}
              </select>
            </label>
            {entry && <Step n={2} on={!!purpose}>What for</Step>}
            {entry && (
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="What for" data-testid="dial-purposes">
                {entry.purposes.map((p) => (
                  <button key={p} type="button" onClick={() => setPurpose(p)} aria-pressed={purpose === p} data-testid={`dial-purpose-${p}`}
                    className="llv-choice py-1 text-xs">{PURPOSE_LABEL[p]}</button>
                ))}
              </div>
            )}
            {purpose === 'meet' && <Step n={3} on>Where and when</Step>}
            {purpose === 'meet' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="text-xs text-stone-400">Where
                  <select className="inp mt-1 w-full text-sm" value={place} onChange={(e) => setPlace(e.target.value as PlaceId)} data-testid="dial-place">
                    {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-stone-400">Day
                  <select className="inp mt-1 w-full text-sm" value={day} onChange={(e) => setDay(Number(e.target.value))} data-testid="dial-day">
                    {days.map((d, i) => <option key={`${d.w}:${d.d}`} value={i}>{d.label}</option>)}
                  </select>
                </label>
                <label className="text-xs text-stone-400">Hour
                  <select className="inp mt-1 w-full text-sm" value={hour} onChange={(e) => setHour(Number(e.target.value))} data-testid="dial-hour">
                    {MEET_HOURS.map((h) => <option key={h} value={h}>{hourText(h)}</option>)}
                  </select>
                </label>
                <p className="sm:col-span-3 text-[11px] text-stone-500">{dflt.by && !prefill?.place && <span data-testid="dial-by">Place and hour as {dflt.by} put them down. </span>}{places.find((p) => p.id === place)?.hint}</p>
              </div>
            )}
            {spec && pv && (
              <div className="llv-card-box llv-card-attention text-sm" data-testid="dial-preview">
                <div className="flex flex-wrap items-center gap-3 text-xs text-stone-300">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={pay} onChange={(e) => setPay(e.target.checked)} data-testid="dial-pay" /> Walk to a pay phone</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={code} onChange={(e) => setCode(e.target.checked)} data-testid="dial-code" /> Don't say it on the phone (code words)</label>
                </div>
                <div className="mt-2 text-stone-300">{pv.hint}</div>
                {pv.tape && <div className="mt-1 text-[11px] text-amber-300/90">{pv.tape}</div>}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-noir-700 pt-2.5">
                  <span className="text-xs text-stone-400">On {LINE_LABEL[pv.line]} · <span className="font-semibold text-gold-300" data-testid="dial-odds">{Math.round(pv.odds * 100)}%</span> it goes your way</span>
                  <button type="button" className="btn-primary px-3 py-1 text-sm" disabled={!!pv.blocked} title={pv.blocked} onClick={() => onDial(spec)} data-testid="dial-call">{pv.blocked ?? 'Call ▸'}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'log' && (
          <div className="mt-3 space-y-3" data-testid="phone-log">
            {ahead.length > 0 && (
              <div>
                <h4 className="llv-section-title mb-1">Meets on the calendar</h4>
                {ahead.map((m) => <div key={m.id} className="llv-card-box llv-card-attention mb-1 py-1.5 text-sm text-stone-200"><b className="text-gold-300">{m.when}</b>: {m.who}, {m.place}</div>)}
              </div>
            )}
            <div>
              <h4 className="llv-section-title mb-1">The last calls</h4>
              {!(s.phone?.log.length) && <Empty title="Nothing yet">Calls in and out, and the meets, are logged here and in Your File.</Empty>}
              {(s.phone?.log ?? []).slice(-12).reverse().map((l, i) => (
                <div key={i} className={`border-b border-noir-800 py-1 pl-2 text-xs text-stone-400 ${domClass(domainOfText(s, `${l.name} ${l.t}`))} ${domainOfText(s, `${l.name} ${l.t}`) ? 'llv-dom-edge' : ''}`}>
                  <span className="text-stone-500">Wk {l.w} {DAY_NAMES[l.d].slice(0, 3)} {hourText(l.h)} · {l.dir === 'in' ? 'in' : l.dir === 'out' ? 'out' : l.dir === 'meet' ? 'meet' : 'missed'}</span> <span className="text-stone-200">{l.name}</span>: {l.t}
                </div>
              ))}
              <p className="mt-2 text-[11px] text-stone-500">Every call is in Your File.</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** A numbered step of making a call, lit once it is answered. */
function Step({ n, on, children }: { n: number; on?: boolean; children: React.ReactNode }) {
  return (
    <span className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-stone-300">
      <span aria-hidden className={`flex h-[1.1rem] w-[1.1rem] items-center justify-center rounded-full border text-[10px] ${on ? 'border-gold-500 bg-gold-500 text-noir-950' : 'border-noir-500 text-stone-400'}`}>{on ? '✓' : n}</span>
      {children}
    </span>
  );
}

/** The phone on the top bar: a badge for missed calls, a ring while a call waits. */
export function PhoneButton({ missed, ringing, onOpen }: { missed: number; ringing: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} data-testid="phone-button" title={ringing ? 'The phone is ringing' : missed ? `${missed} missed call${missed === 1 ? '' : 's'}` : 'The phone: make a call'}
      aria-label={`The phone${missed ? `: ${missed} missed` : ''}`}
      className={`relative h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap ${ringing || missed ? 'border-blood-500/70 text-gold-200' : 'border-noir-600 text-stone-300'} hover:border-gold-500 ${ringing ? 'llv-ring' : ''}`}>
      ☎<span className="hidden sm:inline"> Phone</span>
      {missed > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-[1.1rem] rounded-full bg-blood-500 px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-noir-900" data-testid="phone-badge">{missed}</span>}
    </button>
  );
}
