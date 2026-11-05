import { useMemo, useState } from 'react';
import { Overlay } from '../components/Modal';
import { useEscape } from '../keys';
import { useShell } from '../shell/context';
import { DAY_NAMES, DAY_SHORT } from '../../engine/days';
import { hoursLabel } from '../../engine/timeCost';
import { displayName } from '../../engine/characters';
import { addAppt, apptOptions, apptViews, cancelAppt, editAppt, overbook, pauseAppt, type ApptDraft } from '../../engine/appointments';
import { SLOT_LABEL, type ApptCadence, type ApptSlot } from '../../engine/apptsState';
import type { GameState, PlayerAction } from '../../engine/types';

/**
 * STANDING APPOINTMENTS (engine/appointments.ts): "Make it a standing date/meeting…" from a person's menu,
 * a dating card, an Ear's card or a result card; the dialog (what, how often, how long, a budget); and the
 * list of them with pause, resume, edit and call off, and how each one went last time.
 */

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const SPANS: { id: string; label: string; weeks?: number }[] = [{ id: '4', label: '4 weeks', weeks: 4 }, { id: '8', label: '8 weeks', weeks: 8 }, { id: '12', label: '12 weeks', weeks: 12 }, { id: 'open', label: 'Until I stop it' }];

/** The button that opens the dialog (absent where there is no shell to open it: isolated renders). */
export function StandingButton({ who, action, label, className, testid, onOpen }: { who: string; action?: PlayerAction; label?: string; className?: string; testid?: string; onOpen?: () => void }) {
  const shell = useShell();
  if (!shell.standing) return null;
  return (
    <button type="button" className={className ?? 'btn-secondary text-xs'} onClick={(e) => { e.stopPropagation(); onOpen?.(); shell.standing!(who, action); }} data-testid={testid ?? 'standing-open'}>
      {label ?? 'Make it a standing date/meeting…'}
    </button>
  );
}

export interface StandingAsk { who: string; action?: PlayerAction; edit?: string }

/** The dialog: pick the order, the days, the length and the budget; warnings when the week is overbooked. */
export function StandingDialog({ s, ask, onClose, onSave }: { s: GameState; ask: StandingAsk; onClose: () => void; onSave: (f: (x: GameState) => GameState, what: string) => void }) {
  const cur = ask.edit ? s.appts?.list.find((a) => a.id === ask.edit) : undefined;
  const who = cur?.who ?? ask.who;
  const c = s.characters[who];
  const opts = useMemo(() => apptOptions(s, who), [s, who]);
  const pre = cur?.action ?? ask.action;
  const preKey = pre ? JSON.stringify(pre) : undefined;
  const [key, setKey] = useState<string | undefined>(() => (preKey && opts.some((o) => o.key === preKey) ? preKey : (opts.find((o) => !o.now) ?? opts[0])?.key));
  const opt = opts.find((o) => o.key === key);
  const [cadence, setCadence] = useState<ApptCadence>(cur?.cadence ?? 'weekly');
  const [day, setDay] = useState<number>(cur?.day ?? Math.min(6, (s.days?.day ?? 0) + 1));
  const [slot, setSlot] = useState<ApptSlot>(cur?.slot ?? (opt?.evening ? 'evening' : 'afternoon'));
  const [span, setSpan] = useState<string>(cur ? (cur.weeks === undefined ? 'open' : String(Math.min(12, cur.weeks))) : '8');
  const [budget, setBudget] = useState<string>(cur?.budget !== undefined ? String(cur.budget) : '');
  useEscape(true, onClose);
  if (!c) return null;
  const weeks = SPANS.find((x) => x.id === span)?.weeks;
  const bud = budget.trim() === '' ? undefined : Math.max(0, Math.round(Number(budget) || 0));
  const draft: ApptDraft | undefined = opt ? { who, action: opt.action, cadence, day, slot, weeks, budget: bud } : undefined;
  const times = cadence === 'daily' ? 7 : 1;
  const perWeek = opt ? Math.min(bud ?? Infinity, opt.cost * times) : 0;
  const warn = draft && !cur ? overbook(s, draft) : draft ? overbook(editAppt(s, cur!.id, draft).state) : [];
  const save = () => {
    if (!draft) return;
    const what = `Standing: ${opt!.label}, ${cadence === 'daily' ? `every day, ${slot}s` : `${DAY_NAMES[day]}s, ${slot}`}`;
    onSave((x) => (cur ? editAppt(x, cur.id, draft).state : addAppt(x, draft).state), what);
    onClose();
  };
  const chip = (on: boolean) => `rounded border px-2 py-1 text-xs ${on ? 'border-gold-400 bg-gold-500/20 text-gold-200' : 'border-noir-600 text-stone-300 hover:border-gold-600'}`;
  return (
    <Overlay z={5000} className="flex items-end sm:items-center justify-center bg-black/60 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label="A standing date or meeting">
      <div className="panel w-[min(94vw,560px)] max-h-[90vh] overflow-y-auto rounded-lg border-gold-600/40 bg-noir-900 p-4" onClick={(e) => e.stopPropagation()} data-testid="standing-dialog">
        <div className="text-[11px] uppercase tracking-widest text-gold-400">{cur ? 'Change the standing appointment' : 'A standing date or meeting'}</div>
        <div className="mt-0.5 font-display text-lg text-stone-100">{displayName(c)}</div>
        <p className="mt-1 text-xs text-stone-400">It goes on your book every time and is given at the week's turn like any order you give: same odds, same price, in Your File. {c.gender === 'F' ? 'She' : 'He'} still decides each time; two no's in a row and it is paused.</p>
        {!opts.length && <div className="mt-3 text-sm text-amber-300" data-testid="standing-none">Nothing you do with {c.firstName} can be made routine right now.</div>}
        {opts.length > 0 && (
          <>
            <div className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">What</div>
            <div className="mt-1 flex flex-col gap-1" role="radiogroup" aria-label="What" data-testid="standing-what">
              {opts.map((o) => (
                <label key={o.key} className={`flex cursor-pointer items-start gap-2 rounded border px-2 py-1.5 text-xs ${o.key === key ? 'border-gold-500 bg-gold-500/10' : 'border-noir-700 hover:border-noir-500'}`}>
                  <input type="radio" name="standing-what" className="mt-0.5" checked={o.key === key} onChange={() => { setKey(o.key); if (o.evening) setSlot('evening'); }} data-testid="standing-opt" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-stone-100">{o.label}</span>
                    <span className="block text-stone-400">{hoursLabel(o.hours)}{o.evening ? ' · takes an evening' : ''}{o.cost ? ` · ${$(o.cost)} from ${o.pot === 'pocket' ? 'your pocket' : 'the Family'}` : ' · no money'}{o.now ? ` · not this week: ${o.now}` : ''}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">How often</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <button type="button" className={chip(cadence === 'weekly')} onClick={() => setCadence('weekly')} data-testid="standing-weekly">Once a week</button>
              <button type="button" className={chip(cadence === 'daily')} onClick={() => setCadence('daily')} data-testid="standing-daily">Every day</button>
            </div>
            {cadence === 'weekly' && (
              <div className="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label="Day">
                {DAY_SHORT.map((d, i) => <button key={d} type="button" className={chip(day === i)} onClick={() => setDay(i)} data-testid={`standing-day-${i}`}>{d}</button>)}
              </div>
            )}
            <div className="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label="Time of day">
              {(['morning', 'afternoon', 'evening'] as ApptSlot[]).map((x) => <button key={x} type="button" className={chip(slot === x)} onClick={() => setSlot(x)} data-testid={`standing-slot-${x}`}>{SLOT_LABEL[x]}</button>)}
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-wider text-stone-500">How long</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {SPANS.map((x) => <button key={x.id} type="button" className={chip(span === x.id)} onClick={() => setSpan(x.id)} data-testid={`standing-span-${x.id}`}>{x.label}</button>)}
            </div>
            <label className="mt-3 block text-[11px] uppercase tracking-wider text-stone-500">
              Budget a week (blank: no cap)
              <input type="number" min={0} step={50} value={budget} onChange={(e) => setBudget(e.target.value)} className="mt-1 block w-32 rounded border border-noir-600 bg-noir-800 px-2 py-1 text-sm text-stone-100" data-testid="standing-budget" />
            </label>
            {opt && <div className="mt-2 text-xs text-stone-300" data-testid="standing-cost">About {$(perWeek)} a week from {opt.pot === 'pocket' ? 'your pocket' : 'the Family'} · {hoursLabel(opt.hours * times)} of your week{opt.evening ? ` · ${times} evening${times > 1 ? 's' : ''}` : ''}</div>}
            {warn.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-300" data-testid="standing-warn">{warn.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          </>
        )}
        <div className="mt-4 flex items-center gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={onClose} data-testid="standing-cancel">Never mind</button>
          <button type="button" className="btn-primary ml-auto text-sm" disabled={!draft} onClick={save} data-testid="standing-save">{cur ? 'Change it' : 'Put it on the book'}</button>
        </div>
      </div>
    </Overlay>
  );
}

/** "Your standing appointments": each with when, what it costs a week, how it went last, and pause / resume / change / call off. */
export function StandingList({ s, onAct, who }: { s: GameState; onAct?: (f: (x: GameState) => GameState, what: string) => void; who?: string }) {
  const shell = useShell();
  const act = onAct ?? ((f: (x: GameState) => GameState, what: string) => (shell.act ? shell.act(f, what) : shell.update?.(f)));
  const views = apptViews(s).filter((v) => !who || v.who === who);
  const warn = overbook(s);
  return (
    <section className="panel p-3" data-testid="standing-list">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base text-gold-300">Your standing appointments</h3>
        <span className="text-[11px] text-stone-500">{views.filter((v) => v.status === 'on').length} on the book</span>
      </div>
      {!views.length && <p className="mt-1 text-xs text-stone-400" data-testid="standing-empty">None yet. Open anyone's menu (or her card, or an Ear's) and choose "Make it a standing date/meeting…" to fill your days.</p>}
      {warn.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-amber-300" data-testid="standing-overbook">{warn.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      <ul className="mt-2 flex flex-col gap-1.5">
        {views.map((v) => (
          <li key={v.a.id} className={`rounded border px-2 py-1.5 text-xs ${v.status === 'on' ? 'border-noir-600' : 'border-noir-800 opacity-75'}`} data-testid="standing-row" data-status={v.status}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-stone-100">{v.a.what}</span>
              <span className="text-stone-400">{v.when} · {v.span}</span>
              {v.status !== 'on' && <span className="text-amber-300" data-testid="standing-status">{v.status === 'paused' ? `Paused: ${v.a.paused}` : 'Over'}</span>}
            </div>
            <div className="text-stone-400">{v.perWeek.cost ? `About ${$(v.perWeek.cost)} a week from ${v.perWeek.pot === 'pocket' ? 'your pocket' : 'the Family'}` : 'No money'}{v.a.budget !== undefined ? ` (cap ${$(v.a.budget)})` : ''} · {hoursLabel(v.perWeek.hours)} a week</div>
            {v.last && <div className="text-stone-300" data-testid="standing-last">{v.last}</div>}
            <div className="mt-1 flex flex-wrap gap-1">
              {v.status === 'on' && <button type="button" className="btn-secondary text-[11px]" onClick={() => act((x) => pauseAppt(x, v.a.id, true), `Paused: standing ${v.a.what}`)} data-testid="standing-pause">Pause</button>}
              {v.status === 'paused' && <button type="button" className="btn-secondary text-[11px]" onClick={() => act((x) => pauseAppt(x, v.a.id, false), `Resumed: standing ${v.a.what}`)} data-testid="standing-resume">Resume</button>}
              {shell.standingEdit && <button type="button" className="btn-secondary text-[11px]" onClick={() => shell.standingEdit!(v.a.id)} data-testid="standing-edit">Change…</button>}
              <button type="button" className="btn-secondary text-[11px]" onClick={() => act((x) => cancelAppt(x, v.a.id), `Called off: standing ${v.a.what}`)} data-testid="standing-cancel-appt">Call it off</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
