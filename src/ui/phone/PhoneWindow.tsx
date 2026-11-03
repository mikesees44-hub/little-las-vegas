import { useMemo, useState } from 'react';
import type { GameState } from '../../engine/types';
import { canCallBack, lineStatus, missedCalls } from '../../engine/phone';
import { dialPreview, MEET_HOURS, meetDays, meetPlaces, meetsAhead, phoneBook, PURPOSE_LABEL, type BookEntry, type DialSpec, type PlaceId, type Purpose } from '../../engine/phoneMeet';
import { LINE_LABEL } from '../../engine/phone';
import { DAY_NAMES } from '../../engine/days';
import { hourText } from '../../engine/threats';
import { Modal } from '../components/Modal';

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

export function PhoneWindow({ s, onClose, onDial, onCallBack }: { s: GameState; onClose: () => void; onDial: (spec: DialSpec) => void; onCallBack: (missedId: string) => void }) {
  const missed = missedCalls(s);
  const [tab, setTab] = useState<Tab>(missed.length ? 'missed' : 'dial');
  const book = useMemo(() => phoneBook(s), [s]);
  const [who, setWho] = useState<string | undefined>();
  const [purpose, setPurpose] = useState<Purpose | undefined>();
  const days = meetDays(s);
  const places = meetPlaces(s);
  const [place, setPlace] = useState<PlaceId>('diner');
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState(21);
  const [pay, setPay] = useState(false);
  const [code, setCode] = useState(false);
  const entry = book.find((e) => e.id === who);
  const spec: DialSpec | undefined = entry && purpose ? { who: entry.id, purpose, pay, code, ...(purpose === 'meet' && days[day] ? { place, w: days[day].w, d: days[day].d, hour } : {}) } : undefined;
  const pv = spec ? dialPreview(s, spec) : undefined;
  const ahead = meetsAhead(s);
  const tabBtn = (t: Tab, label: string, n?: number) => (
    <button type="button" onClick={() => setTab(t)} data-testid={`phone-tab-${t}`} aria-pressed={tab === t}
      className={`rounded px-2.5 py-1 text-xs font-semibold ${tab === t ? 'bg-gold-500 text-noir-950' : 'text-stone-300 hover:text-gold-300'}`}>
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
          <button type="button" className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
        <div className="mt-3 flex gap-1 border-b border-noir-700 pb-2">
          {tabBtn('missed', 'Missed', missed.length)}
          {tabBtn('dial', 'Make a call')}
          {tabBtn('log', 'Calls & meets', ahead.length)}
        </div>

        {tab === 'missed' && (
          <div className="mt-3 space-y-2" data-testid="phone-missed">
            {!missed.length && <p className="text-sm text-stone-400">No missed calls.</p>}
            {missed.slice().reverse().map((m) => {
              const why = canCallBack(s, m);
              return (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded border border-noir-700 bg-noir-800/60 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-stone-200 truncate">{m.p.name} <span className="text-stone-500">· {m.p.role}</span></div>
                    <div className="text-[11px] text-stone-500">{DAY_NAMES[m.d]}, {hourText(m.h)}{m.h === 2 ? ' · bad news' : ''}</div>
                  </div>
                  <button type="button" className="btn-secondary shrink-0 px-2 py-1 text-xs" disabled={!!why} title={why} onClick={() => onCallBack(m.id)} data-testid={`call-back-${m.id}`}>
                    {why ? why : 'Call back'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'dial' && (
          <div className="mt-3 space-y-3" data-testid="phone-dial">
            <label className="block text-xs text-stone-400">Who
              <select className="inp mt-1 w-full text-sm" value={who ?? ''} onChange={(e) => { setWho(e.target.value || undefined); setPurpose(undefined); }} data-testid="dial-who">
                <option value="">Pick a number…</option>
                {GROUPS.map((g) => {
                  const xs = book.filter((e) => e.group === g.id);
                  return xs.length ? <optgroup key={g.id} label={g.label}>{xs.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}</optgroup> : null;
                })}
              </select>
            </label>
            {entry && (
              <div className="flex flex-wrap gap-1" data-testid="dial-purposes">
                {entry.purposes.map((p) => (
                  <button key={p} type="button" onClick={() => setPurpose(p)} aria-pressed={purpose === p} data-testid={`dial-purpose-${p}`}
                    className={`rounded border px-2 py-1 text-xs ${purpose === p ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>{PURPOSE_LABEL[p]}</button>
                ))}
              </div>
            )}
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
                <p className="sm:col-span-3 text-[11px] text-stone-500">{places.find((p) => p.id === place)?.hint}</p>
              </div>
            )}
            {spec && pv && (
              <div className="rounded border border-noir-700 bg-noir-800/60 p-3 text-sm" data-testid="dial-preview">
                <div className="flex flex-wrap items-center gap-3 text-xs text-stone-300">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={pay} onChange={(e) => setPay(e.target.checked)} data-testid="dial-pay" /> Walk to a pay phone</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={code} onChange={(e) => setCode(e.target.checked)} data-testid="dial-code" /> Don't say it on the phone (code words)</label>
                </div>
                <div className="mt-2 text-stone-300">{pv.hint}</div>
                {pv.tape && <div className="mt-1 text-[11px] text-amber-300/90">{pv.tape}</div>}
                <div className="mt-2 flex items-center justify-between gap-2">
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
                <div className="panel-title text-xs">Meets on the calendar</div>
                {ahead.map((m) => <div key={m.id} className="text-sm text-stone-300">{m.when}: {m.who}, {m.place}</div>)}
              </div>
            )}
            <div>
              <div className="panel-title text-xs">The last calls</div>
              {!(s.phone?.log.length) && <p className="text-sm text-stone-400">Nothing yet.</p>}
              {(s.phone?.log ?? []).slice(-12).reverse().map((l, i) => (
                <div key={i} className="border-b border-noir-800 py-1 text-xs text-stone-400">
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
