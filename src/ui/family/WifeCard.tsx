import { useEffect, useState } from 'react';
import {
  DINNER_LABEL, dinnerAsk, dinnerWeek, setAutoDinner, setDinner, wifeAct, wifeView, type Dinner, type NightKind, type WifeAct,
} from '../../engine/wife';
import { DAY_NAMES, DAY_SHORT } from '../../engine/days';
import type { GameState } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { useShell } from '../shell/context';
import { shortcutBlocked } from '../keys';
import { fmt$ } from '../format';

/**
 * YOUR WIFE (engine/wife.ts) on the screen: her card (the House, and the Desk
 * when she needs him), the daily "Should I expect you for dinner?" on the
 * clock, and the week's seven dinners as toggles for a turn played in one
 * click. Every answer of hers shows its odds; results land in Your File.
 * An unmarried boss sees none of it.
 */

const ANS: Dinner[] = ['home', 'out', 'late'];
const KIND_GLYPH: Record<NightKind, string> = { home: '⌂', withHer: '♥', out: '☾', woman: '☾', trip: '✈', neutral: '·' };
const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The one line every surface shows: "Nights home this week: 2/4". */
export function NightsLine({ home, need }: { home: number; need: number }) {
  const short = need > 0 && home < need;
  return <span data-testid="wife-nights" className={short ? 'text-amber-300' : 'text-emerald-300'}>Nights home this week: {fmtN(home)}/{need || '—'}</span>;
}

function Meter({ v }: { v: number }) {
  const tone = v >= 65 ? 'bg-red-500' : v >= 50 ? 'bg-amber-500' : v >= 30 ? 'bg-amber-300' : 'bg-emerald-500';
  return (
    <span className="inline-flex h-1.5 w-24 overflow-hidden rounded bg-noir-700 align-middle" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label="Her suspicion">
      <span className={tone} style={{ width: `${v}%` }} />
    </span>
  );
}

/** The week's seven dinners: what is booked, what he told her, Home / Out / Late on each day still ahead. */
export function WifeWeekDinners({ s }: { s: GameState }) {
  const shell = useShell();
  const days = dinnerWeek(s);
  if (!days.length) return null;
  return (
    <div className="mt-1 grid grid-cols-7 gap-1" data-testid="wife-week">
      {days.map((d) => {
        const cur = d.ans ?? d.def;
        return (
          <div key={d.day} className={`rounded border px-1 py-1 text-center text-[10px] ${d.row.stoodUp ? 'border-red-500/70' : 'border-noir-700'} ${d.past ? 'opacity-50' : ''}`} data-testid={`wife-night-${d.day}`} title={d.row.why ?? (d.row.kind === 'home' ? 'Nothing booked: home' : '')}>
            <div className="text-stone-300">{DAY_SHORT[d.day]} <span aria-hidden>{KIND_GLYPH[d.row.kind]}</span></div>
            <div className="truncate text-[9px] text-stone-500">{d.row.kind === 'neutral' ? d.row.why : d.row.why ?? 'free'}</div>
            {!d.past && d.row.kind !== 'neutral' && d.row.kind !== 'trip' && (
              <div className="mt-0.5 flex justify-center gap-0.5">
                {ANS.map((a) => (
                  <button key={a} type="button" disabled={!shell.update} onClick={() => shell.update?.((x) => setDinner(x, d.day, d.ans === a ? null : a))}
                    data-testid={`wife-dinner-${d.day}-${a}`} title={DINNER_LABEL[a]} aria-pressed={cur === a}
                    className={`rounded px-1 ${cur === a ? (d.ans ? 'bg-gold-500 text-noir-950' : 'bg-noir-600 text-stone-100') : 'text-stone-500 hover:text-stone-200'}`}>
                    {a === 'home' ? 'H' : a === 'out' ? 'O' : 'L'}
                  </button>
                ))}
              </div>
            )}
            {d.row.stoodUp && <div className="text-[9px] text-red-300">stood up</div>}
          </div>
        );
      })}
    </div>
  );
}

function ActButton({ s, a, onDone }: { s: GameState; a: WifeAct; onDone: (line: string) => void }) {
  const shell = useShell();
  const [sure, setSure] = useState(false);
  const go = () => {
    if (a.confirm && !sure) { setSure(true); return; }
    const r = wifeAct(s, a.k, a.man);
    if (r.ok) shell.update?.(() => r.state);
    onDone(r.line);
    setSure(false);
  };
  return (
    <span className="inline-flex flex-col">
      <button type="button" className={`${a.k === 'divorce' ? 'btn-quiet text-red-300' : 'btn-secondary'} py-0.5 text-[11px]`} disabled={!shell.update || !!a.disabled} onClick={go} title={a.detail} data-testid={`wife-act-${a.k}${a.man ? `-${a.man}` : ''}`}>
        {sure ? `Yes: ${a.label.toLowerCase()}` : a.label}
      </button>
      {sure && <span className="max-w-[260px] text-[10px] text-red-300" data-testid="wife-confirm">{a.confirm} <button type="button" className="btn-quiet text-[10px]" onClick={() => setSure(false)}>Never mind</button></span>}
    </span>
  );
}

/** Her card. `compact`: the Desk's version (the nights, the meter, the acts). */
export function WifeCard({ s, compact }: { s: GameState; compact?: boolean }) {
  const { orders } = useOrders();
  const shell = useShell();
  const v = wifeView(s, orders);
  const [line, setLine] = useState<string | undefined>();
  if (!v) return null;
  const f = v.wife.firstName;
  return (
    <section className="rounded-md border border-rose-900/60 bg-noir-800/60 p-3 text-[12px]" data-testid="wife-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold text-rose-200">Your wife: {v.wife.firstName} {v.wife.lastName}</div>
        <NightsLine home={v.plan.home} need={v.plan.need} />
      </div>
      {v.arr ? (
        <div className="mt-1 text-stone-300" data-testid="wife-arr">
          The arrangement: {fmt$(v.arr.allowance)} a week from your pocket, the house, discretion.{v.arr.shop ? ` Her shop pays her about ${fmt$(v.arr.shop.weekly)} a week (${fmt$(v.arr.herMoney)} so far).` : ' She wants money of her own.'} Strikes against it: {v.arr.breach}/3.
        </div>
      ) : (
        <div className="mt-1 text-stone-400">She expects you home at least every other night. Tell her each day whether to expect you; an honest "not tonight" costs less than a broken promise.</div>
      )}
      <WifeWeekDinners s={s} />
      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="wife-susp">
        <span className="text-stone-400">Suspicion</span> <Meter v={v.susp} /> <span className="text-stone-200">{v.susp} · {v.word}</span>
        <span className="text-stone-400" data-testid="wife-opinion">· She thinks {v.opinion >= 0 ? '+' : ''}{v.opinion} of you</span>
      </div>
      {v.why.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px]" data-testid="wife-susp-why">
          {v.why.map((x, i) => <li key={i} className={x.v > 0 ? 'text-amber-300' : 'text-emerald-300'}>{x.v > 0 ? '+' : '−'}{Math.abs(x.v)} {x.t}</li>)}
        </ul>
      )}
      {v.her && <div className="mt-1 text-red-300" data-testid="wife-her">{f} has been seeing {v.her.man.firstName} {v.her.man.lastName}{v.her.kind === 'his' ? ', one of your own' : ''}.</div>}
      {!v.her && v.close && v.close.v >= 40 && <div className="mt-1 text-amber-300" data-testid="wife-close">{f} has grown close to {v.close.man.firstName} ({v.close.v}/100): he is around the house a lot.</div>}
      {!compact && v.calls.length > 0 && <ul className="mt-1 space-y-0.5 text-[11px] text-stone-400" data-testid="wife-calls">{v.calls.map((c, i) => <li key={i}>☎ {c.t}</li>)}</ul>}
      {!compact && v.log.length > 0 && <ul className="mt-1 space-y-0.5 text-[11px] text-stone-400" data-testid="wife-log">{v.log.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      {v.alimony.length > 0 && <div className="mt-1 text-[11px] text-stone-400">Alimony: {v.alimony.map((a) => `${a.name} ${fmt$(a.amount)}/week`).join(', ')}</div>}
      <div className="mt-2 flex flex-wrap gap-1.5" data-testid="wife-acts">
        {v.acts.filter((a) => !compact || a.k !== 'divorce').map((a) => <ActButton key={`${a.k}:${a.man ?? ''}`} s={s} a={a} onDone={setLine} />)}
      </div>
      {line && <div className="mt-1 text-[11px] text-gold-300" data-testid="wife-result">{line}</div>}
      <label className="mt-2 flex items-center gap-1.5 text-[11px] text-stone-400">
        <input type="checkbox" checked={v.auto} disabled={!shell.update} onChange={(e) => shell.update?.((x) => setAutoDinner(x, e.target.checked))} data-testid="wife-auto" />
        Answer her for me (home when nothing is booked)
      </label>
    </section>
  );
}

/** The clock's daily question: "Should I expect you for dinner?" (1 / 2 / 3). Never blocks the clock. */
export function WifeDinnerAsk({ s }: { s: GameState }) {
  const shell = useShell();
  const ask = dinnerAsk(s);
  const w = ask ? s.characters[s.characters[s.playerId].spouseId ?? ''] : undefined;
  const answer = (a: Dinner) => { if (ask) shell.update?.((x) => setDinner(x, ask.day, a)); };
  useEffect(() => {
    if (!ask) return undefined;
    const on = (e: KeyboardEvent) => {
      if (shortcutBlocked(e)) return;
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i < 0) return;
      e.preventDefault();
      answer(ANS[i]);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  if (!ask || !w) return null;
  return (
    <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-rose-800/70 bg-noir-900/95 px-3 py-1 text-[11px] shadow-lg shadow-black/70" data-testid="wife-dinner">
      <span className="text-rose-200">{w.firstName}: "Should I expect you for dinner?"</span>
      {ask.booked && <span className="text-stone-500">({DAY_NAMES[ask.day]}: {ask.booked})</span>}
      {ANS.map((a, i) => (
        <button key={a} type="button" className="btn-quiet px-1.5 py-0 text-[11px]" onClick={() => answer(a)} data-testid={`wife-dinner-${a}`} title={`${DINNER_LABEL[a]} (${i + 1})`}>
          <kbd className="mr-0.5 text-stone-500">{i + 1}</kbd>{DINNER_LABEL[a]}
        </button>
      ))}
      <NightsLine home={ask.home} need={ask.need} />
      <button type="button" className="btn-quiet px-1 text-[10px] text-stone-500" onClick={() => shell.update?.((x) => setAutoDinner(x, true))} data-testid="wife-dinner-auto">Answer for me</button>
    </div>
  );
}
