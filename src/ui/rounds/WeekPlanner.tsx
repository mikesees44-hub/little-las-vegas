import { useMemo, useState } from 'react';
import { alwaysOn } from '../../engine/delegation';
import { setAlways } from '../../engine/lieutenants';
import { DecisionCard } from '../decide/DecisionCard';
import { weekCheckIns, type CheckIn } from '../../engine/checkins';
import { awayReason, DAY_NAMES, DAY_SHORT, dayBlock, daysOf, eveningOpen, formatDay, missedMornings, setEvening, setWeekRounds, skipMorning, answerCheckIn, weekPlan } from '../../engine/days';
import { ALL_LANES, LANE_NAME, roundOptions, roundSlots, type Lane, type Round } from '../../engine/rounds';
import { doctorReading, lawyerReading } from '../../engine/roundsPersonal';
import type { GameState, PlayerAction } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { fmt$ } from '../format';

/**
 * Your Rounds as a week of days: Monday to Sunday, each with the morning
 * meeting (every capo's line, a problem some mornings, one tap to answer)
 * and one evening of the boss's own. Reads and writes only `s.days`
 * (days.ts) through `update`; every effect happens when the week turns.
 */

export const LANE_GLYPH: Record<Lane, string> = { people: '☕', fun: '♠', family: '♥', self: '§' };

/** A change that takes effect at once; `what` is what the boss did, in words (the click's feedback and Your File). */
export type Update = (f: (s: GameState) => GameState, what?: string) => void;

function Reading({ s, r }: { s: GameState; r: Round }) {
  if (r.reading === 'lawyer') {
    const l = lawyerReading(s);
    return <ReadingLines title={`What ${l.lawyer.split(',')[0]} will tell you`} lines={l.lines} moves={l.moves} />;
  }
  if (r.reading === 'doctor') return <ReadingLines title="What the doctor will find" lines={doctorReading(s).lines} />;
  return null;
}

function ReadingLines({ title, lines, moves }: { title: string; lines: string[]; moves?: { label: string; why: string; action?: PlayerAction; tab?: string }[] }) {
  const orders = useOrders();
  return (
    <div className="mt-1 rounded border border-noir-700 bg-noir-950/60 p-2 text-[11px] leading-snug text-stone-300" data-testid="round-reading">
      <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-stone-500">{title}</div>
      {lines.map((l, i) => <p key={i}>{l}</p>)}
      {moves && moves.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {moves.map((m) => m.action ? (
            <button key={m.label} type="button" title={m.why} className="rounded border border-gold-600/60 px-1.5 py-0.5 text-[10px] text-gold-300 hover:bg-gold-500/10"
              onClick={(e) => { e.stopPropagation(); orders?.queue(m.action!); }}>{m.label} ▸</button>
          ) : <span key={m.label} title={m.why} className="rounded border border-noir-600 px-1.5 py-0.5 text-[10px] text-stone-400">{m.label}</span>)}
        </div>
      )}
    </div>
  );
}

export function RoundButton({ s, r, on, block, onPick, showReading }: { s: GameState; r: Round; on: boolean; block?: string; onPick: () => void; showReading?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded border px-2 py-1 text-left text-[12px] ${on ? 'border-gold-400 bg-gold-500/15' : 'border-noir-600'} ${block && !on ? 'opacity-50' : ''}`} data-testid={`evening-${r.id}`}>
      <button type="button" disabled={!!block && !on} onClick={onPick} className="block w-full text-left disabled:cursor-not-allowed" title={block ?? r.text}>
        <span className="flex items-baseline justify-between gap-2">
          <span className={`font-semibold ${on ? 'text-gold-300' : 'text-stone-200'}`}>{on ? '● ' : '○ '}{r.label}</span>
          <span className="shrink-0 text-[10px] text-stone-400">{r.cost ? fmt$(r.cost) : 'free'}</span>
        </span>
        {r.suggestedBy && <span className="block text-[10px] text-amber-300">{r.suggestedBy}</span>}
        <span className="block text-[10px] leading-snug text-stone-500">{r.text}</span>
        {r.decline && <span className="block text-[10px] text-stone-400">She decides. If she says no, you pay only the Madam's fee.</span>}
        {r.risk && <span className="block text-[10px] text-red-300/80">Risk {Math.round(r.risk.chance * 100)}%: {r.risk.text}</span>}
        {block && !on && <span className="block text-[10px] text-stone-500">{block}</span>}
      </button>
      {showReading && r.reading && (
        <>
          <button type="button" className="mt-0.5 text-[10px] text-stone-400 hover:text-gold-300" onClick={() => setOpen((o) => !o)} data-testid={`reading-${r.id}`}>{open ? 'Hide' : 'Preview'} what he'll say {open ? '▴' : '▾'}</button>
          {open && <Reading s={s} r={r} />}
        </>
      )}
    </div>
  );
}

function Morning({ s, day, list, update, locked }: { s: GameState; day: number; list: CheckIn[]; update: Update; locked: boolean }) {
  const d = daysOf(s);
  const away = awayReason(s, day);
  const skipped = d.skipped.includes(day);
  return (
    <section data-testid="morning" className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] uppercase tracking-[0.25em] text-stone-500">☕ Morning meeting · your capos</h4>
        {!away && !locked && (
          <label className="flex items-center gap-1 text-[10px] text-stone-500">
            <input type="checkbox" className="accent-amber-500" checked={skipped} onChange={(e) => update((x) => skipMorning(x, day, e.target.checked))} data-testid="skip-morning" /> skip it
          </label>
        )}
      </div>
      {away ? <p className="rounded border border-amber-700/60 bg-amber-900/10 px-2 py-1.5 text-[11px] text-amber-200">{away}: no meeting. The capos run things their own way, and some of them help themselves.</p>
        : skipped ? <p className="rounded border border-noir-600 px-2 py-1.5 text-[11px] text-stone-400">You skip the meeting. Their problems get handled their way.</p>
        : !list.length ? <p className="text-[11px] italic text-stone-500">No capos to meet.</p>
        : (
          <ul className="space-y-1">
            {list.map((c) => {
              const ans = d.answers[c.key];
              return (
                <li key={c.key} className={`rounded border px-2 py-1.5 ${c.problem?.urgent && !ans ? 'border-red-400/70 bg-blood-500/10' : 'border-noir-700 bg-noir-900/70'}`} data-testid="checkin">
                  <div className="text-[12px]"><span className="font-semibold text-stone-100">{c.name}</span> <span className="text-[10px] text-stone-500">{c.title}</span></div>
                  <div className="text-[11px] text-stone-400">{c.line}</div>
                  {c.problem && (
                    <div className="mt-1">
                      <div className="text-[11px] text-amber-200">{c.problem.urgent && <span className="mr-1 rounded bg-red-500/80 px-1 text-[9px] font-bold uppercase text-white">urgent</span>}“{c.problem.text}”</div>
                      <DecisionCard s={s} compact selected={ans}
                        options={c.problem.answers.map((a) => ({ id: a.id, label: a.label, detail: a.hint, effects: a.effects, odds: { known: false, label: a.effects.length ? 'certain' : 'no roll', reasons: [] }, done: ans === a.id, rowTestId: `answer-${a.id}`, disabled: locked ? 'The morning is over' : undefined }))}
                        onDecide={(id) => update((x) => answerCheckIn(x, c.key, ans === id ? undefined : id), ans === id ? `Took back your answer to ${c.name}` : `Told ${c.name}: ${c.problem!.answers.find((a) => a.id === id)?.label ?? id}`)}
                        primaryLabel={(o) => (o && ans === o.id ? 'Take it back' : o ? `Tell ${c.name.split(' ')[0]} ▸` : 'Pick one')}
                        onHandOff={!locked && !ans ? () => update((x) => answerCheckIn(x, c.key, c.problem!.own), `${c.name} does it his way`) : undefined}
                        handOffLabel={`His way: ${c.problem.answers.find((a) => a.id === c.problem!.own)?.label ?? 'leave it to him'}`}
                        testid={`morning-${c.key}`} />
                      {!locked && !ans && !c.problem.urgent && !alwaysOn(s, 'mornings') && (
                        <button type="button" className="btn-quiet mt-0.5 text-[10px]" onClick={() => update((x) => setAlways(answerCheckIn(x, c.key, c.problem!.own), 'mornings', true), 'From now on every capo settles his own morning problems')} data-testid="always-mornings"
                          title="Every capo settles his routine morning problems his way; an urgent one still comes to you. They are listed under Handled for you.">↻ His way, and always let the capos settle their mornings</button>
                      )}
                      {!ans && <div className="mt-0.5 text-[10px] text-stone-500">No answer: he does it his way{locked ? '.' : ' (and notices you didn\'t answer).'}</div>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

function Evening({ s, day, update, locked }: { s: GameState; day: number; update: Update; locked: boolean }) {
  const opts = useMemo(() => roundOptions(s), [s]);
  const plan = weekPlan(s);
  const pick = plan[day];
  const r = pick ? opts.find((x) => x.id === pick) : undefined;
  const [choosing, setChoosing] = useState(false);
  const [confirm, setConfirm] = useState<Round | undefined>();
  const open = eveningOpen(s, day);
  const elsewhere = (o: Round) => plan.findIndex((x, i) => x === o.id && i !== day);
  /** Picking an evening: straight in on a free night; on a booked one, ask first (what it replaces, what it costs, who pays). */
  const choose = (o: Round) => {
    if (o.id === pick) { update((x) => setEvening(x, day, null), `${DAY_NAMES[day]} evening cleared`); setChoosing(false); return; }
    if (r) { setConfirm(o); return; }
    update((x) => setEvening(x, day, o.id), `${DAY_NAMES[day]} evening: ${o.label}`);
    setChoosing(false);
  };
  return (
    <section data-testid="evening" className="space-y-1.5">
      <h4 className="text-[10px] uppercase tracking-[0.25em] text-stone-500">☾ {DAY_NAMES[day]} evening · yours</h4>
      {!open ? <p className="text-[11px] italic text-stone-500">{awayReason(s, day) ?? 'Not this evening'}.</p> : (
        <>
          {r ? <RoundButton s={s} r={r} on onPick={() => !locked && update((x) => setEvening(x, day, null))} showReading block={locked ? 'Done' : undefined} />
            : <p className="text-[11px] text-stone-500">A free evening. Home by nine, or pick something.</p>}
          {r && !locked && <p className="text-[10px] text-stone-500" data-testid="evening-pays">{r.cost ? (r.pocketOnly ? `${fmt$(r.cost)} from your pocket only on ${DAY_NAMES[day]} night (never Family money: if the pocket is short, the evening does not happen). ` : `${fmt$(r.cost)} from your pocket on ${DAY_NAMES[day]} night (the Family covers what the pocket can't). `) : 'Costs nothing. '}Cancelling costs nothing until then: tap it to clear the evening.</p>}
          {confirm && r && (
            <div className="rounded border border-gold-500/70 bg-gold-500/10 p-2 text-[12px]" role="alertdialog" aria-label="Replace the evening" data-testid="evening-replace">
              <div className="text-stone-200"><b>{DAY_NAMES[day]} is booked:</b> {r.label}.</div>
              <div className="mt-0.5 text-stone-300">Replace it with <b>{confirm.label}</b>{confirm.cost ? ` — ${fmt$(confirm.cost)} from your pocket on ${DAY_NAMES[day]} night` : ' — costs nothing'}?{r.cost ? ` ${r.label} (${fmt$(r.cost)}) is not charged.` : ''}{elsewhere(confirm) >= 0 ? ` It moves from ${DAY_NAMES[elsewhere(confirm)]}, which becomes free.` : ''}</div>
              <div className="mt-1.5 flex gap-1.5">
                <button type="button" className="btn-gold text-xs py-1" onClick={() => { update((x) => setEvening(x, day, confirm.id), `${DAY_NAMES[day]} evening: ${confirm.label}`); setConfirm(undefined); setChoosing(false); }} data-testid="evening-replace-yes">Replace with {confirm.label}{confirm.cost ? ` — ${fmt$(confirm.cost)}` : ''}</button>
                <button type="button" className="btn-ghost text-xs py-1" onClick={() => setConfirm(undefined)} data-testid="evening-replace-no">Keep {r.label}</button>
              </div>
            </div>
          )}
          {!locked && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setChoosing((c) => !c)} data-testid="evening-choose">{choosing ? 'Close the list' : r ? 'Do something else' : 'Plan the evening'}</button>
          )}
          {choosing && !locked && (
            <div className="grid gap-2 sm:grid-cols-2" data-testid="evening-options">
              {ALL_LANES.map((lane) => {
                const xs = opts.filter((o) => o.lane === lane);
                if (!xs.length) return null;
                return (
                  <div key={lane} className="space-y-1">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{LANE_GLYPH[lane]} {LANE_NAME[lane]}</div>
                    {xs.map((o) => <RoundButton key={o.id} s={s} r={o} on={o.id === pick} block={dayBlock(s, day, o.id)} showReading onPick={() => choose(o)} />)}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** The days strip and the open day (the This Week home, the day window). */
export function WeekPlanner({ s, update, initialDay, onSitDown }: { s: GameState; update: Update; initialDay?: number; onSitDown?: () => void }) {
  const d = daysOf(s);
  const [sel, setSel] = useState(initialDay ?? d.day);
  const day = Math.max(0, Math.min(6, sel));
  const plan = weekPlan(s);
  const opts = useMemo(() => roundOptions(s), [s]);
  const all = useMemo(() => weekCheckIns(s), [s]);
  const missed = missedMornings(s, d.skipped);
  const { slots } = roundSlots(s);
  const used = plan.filter(Boolean).length;
  return (
    <div className="space-y-2" data-testid="week-planner">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-stone-400"><span className="text-stone-200">{used} of {slots}</span> evenings planned <span className="text-stone-500">(you have {slots} evenings out a week; the other nights you're home)</span> · the capos every morning</div>
        <div className="flex gap-1">
          <button type="button" className="text-[11px] text-stone-500 hover:text-gold-300" onClick={() => update((x) => setWeekRounds(x, undefined))} data-testid="planner-usual">usual week</button>
          {onSitDown && <button type="button" className="text-[11px] text-stone-500 hover:text-gold-300" onClick={onSitDown}>· who you trust ▸</button>}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1" role="tablist" data-testid="days-strip">
        {DAY_SHORT.map((nm, i) => {
          const probs = all.filter((c) => c.day === i && c.problem);
          const open = probs.filter((c) => !d.answers[c.key]).length;
          const urgent = probs.some((c) => c.problem!.urgent && !d.answers[c.key]);
          const r = plan[i] ? opts.find((o) => o.id === plan[i]) : undefined;
          const past = i < d.day;
          return (
            <button key={nm} type="button" role="tab" aria-selected={i === day} onClick={() => setSel(i)} data-testid={`day-${i}`}
              className={`min-w-0 rounded border px-0.5 py-1 text-center ${i === day ? 'border-gold-400 bg-gold-500/15' : i === d.day ? 'border-gold-700' : 'border-noir-700'} ${past ? 'opacity-50' : ''}`}>
              <div className={`text-[11px] font-semibold ${i === d.day ? 'text-gold-300' : 'text-stone-200'}`}>{nm}</div>
              <div className="text-[9px] text-stone-500">{formatDay(s, i).split(' ').slice(1, 3).join(' ').replace(',', '')}</div>
              <div className="mt-0.5 flex justify-center gap-0.5 text-[10px] leading-none">
                <span title={missed[i] ?? (open ? `${open} problem(s)` : 'The morning meeting')} className={missed[i] ? 'text-stone-600' : urgent ? 'text-red-400' : open ? 'text-amber-300' : 'text-stone-500'}>{missed[i] ? '✕' : open ? `☕${open}` : '☕'}</span>
                <span title={r?.label ?? 'Free evening'} className={r ? 'text-gold-300' : 'text-stone-600'}>{r ? LANE_GLYPH[r.lane] : '·'}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="rounded-md border border-noir-700 bg-noir-900/80 p-2 space-y-3" data-testid="day-detail">
        <div className="flex items-baseline justify-between">
          <div className="font-display text-gold-300">{formatDay(s, day)}</div>
          <div className="text-[10px] text-stone-500">{day < d.day ? 'Done' : day === d.day ? 'Today' : `In ${day - d.day} day${day - d.day > 1 ? 's' : ''}`}</div>
        </div>
        <Morning s={s} day={day} list={all.filter((c) => c.day === day)} update={update} locked={day < d.day} />
        <Evening s={s} day={day} update={update} locked={day < d.day} />
      </div>
    </div>
  );
}
