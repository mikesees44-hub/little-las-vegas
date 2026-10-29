import { useState } from 'react';
import { DAY_NAMES, DAY_SHORT, today } from '../../engine/days';
import {
  actLocked, BUDGET_STEPS, budgetOf, callOf, chosenOpt, DOMAIN_IDS, DOMAINS, ifSilent, LEVEL_LABEL, levelOf, lc, ltDecide, LT_SEATS, morningReport,
  setBudget, setLevel, type LtAct, type LtLevel, type LtSeat, type MorningReport,
  applyPreset, capoAdvice, capoLevelOf, PRESETS, presetOf, setCapoLevel, type LtPreset,
} from '../../engine/lieutenants';
import { capos, displayName, isFree } from '../../engine/characters';
import { useShell } from '../shell/context';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { Modal } from '../components/Modal';

/**
 * THE LIEUTENANTS ON THE DESK: each morning the underboss and the consigliere report (what they did
 * yesterday, what they do today, what they need from you), and "Who handles what" says how far each may
 * go in each of his domains. Every button is a pure state edit (engine/lieutenants.ts); the work itself
 * is done when the week turns.
 */

type Update = (f: (s: GameState) => GameState, what?: string) => void;

const LEVELS: LtLevel[] = ['handle', 'ask', 'self'];

function ActLine({ s, a, update, onChar, kind }: { s: GameState; a: LtAct; update: Update; onChar?: (id: string) => void; kind: 'done' | 'today' | 'coming' | 'needs' }) {
  const o = chosenOpt(s, a);
  const call = callOf(s, a.id);
  const locked = actLocked(s, a);
  const others = a.options.filter((x) => x.id !== o?.id);
  const decide = (v: 'approve' | 'veto' | 'change' | undefined, opt?: string) => update((cur) => ltDecide(cur, a.id, v, opt), `${v === 'approve' ? 'Approved' : v === 'veto' ? 'Stopped' : v === 'change' ? 'Changed' : 'Left to him'}: ${a.topic}`);
  return (
    <li className={`rounded border px-2 py-1 ${kind === 'needs' ? (a.day <= today(s) ? 'border-red-500/60 bg-blood-500/10' : 'border-amber-600/50 bg-amber-500/5') : 'border-noir-700'}`} data-testid={`lt-act-${kind}`} data-act={a.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-[12px] text-stone-100">
          {kind === 'done' ? '✓ ' : ''}<span className="font-semibold">{o?.label ?? a.topic}</span>
          <span className="text-stone-400"> · {a.topic}</span>
          {o && o.cost > 0 && <span className="text-stone-500"> · {fmt$(o.cost)}</span>}
        </span>
        <span className="text-[10px] text-sky-300">{kind === 'done' ? DAY_NAMES[a.day] : DAY_SHORT[a.day]}{call?.verdict === 'approve' ? ' · approved' : call?.verdict === 'change' ? ' · your way' : ''}</span>
      </div>
      {kind === 'needs' && <div className="text-[11px] italic text-stone-300">"{a.line}"</div>}
      {kind === 'needs' && <div className="text-[10px] text-stone-400">{a.why ? `His reason: ${a.why}. ` : ''}{a.tell ? <span className="text-amber-200/80">{a.tell} </span> : null}{ifSilent(a)}</div>}
      {!locked && kind !== 'done' && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {kind === 'needs' && <button type="button" className="rounded border border-emerald-700 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/10" onClick={() => decide('approve')} data-testid="lt-approve">Approve</button>}
          {others.length > 0 && (
            <select className="rounded border border-noir-600 bg-noir-900 px-1 py-0.5 text-[10px] text-stone-300" value="" onChange={(e) => e.target.value && decide('change', e.target.value)} data-testid="lt-change" aria-label="Change how">
              <option value="">Change ▾</option>
              {others.map((x) => <option key={x.id} value={x.id}>{x.label}{x.cost ? ` (${fmt$(x.cost)})` : ''}</option>)}
            </select>
          )}
          <button type="button" className="rounded border border-red-800/70 px-1.5 py-0.5 text-[10px] text-red-300 hover:border-red-500" onClick={() => decide('veto')} data-testid="lt-veto">{kind === 'needs' ? 'Veto' : 'Stop him'}</button>
          {call && <button type="button" className="text-[10px] text-stone-500 underline" onClick={() => decide(undefined)}>undo</button>}
          {a.charId && onChar && <button type="button" className="text-[10px] text-stone-500 underline decoration-dotted" onClick={() => onChar(a.charId!)}>who?</button>}
        </div>
      )}
    </li>
  );
}

function Section({ title, children, n }: { title: string; children: React.ReactNode; n: number }) {
  if (!n) return null;
  return (
    <div className="mt-1.5">
      <div className="text-[9px] uppercase tracking-[0.2em] text-stone-500">{title}</div>
      <ul className="mt-0.5 space-y-1">{children}</ul>
    </div>
  );
}

function ReportCard({ s, r, update, onChar }: { s: GameState; r: MorningReport; update: Update; onChar?: (id: string) => void }) {
  const d = today(s);
  return (
    <article className="rounded-md border border-sky-800/50 bg-noir-900/60 p-2" data-testid={`lt-report-${r.seat}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <div className="text-[12px]">
          <span className="text-[10px] uppercase tracking-[0.2em] text-sky-300">☕ {DAY_NAMES[d]} · {r.title}</span>{' '}
          {r.charId ? <button type="button" className="font-semibold text-stone-100 hover:text-gold-300" onClick={() => onChar?.(r.charId!)}>{r.name}</button> : <span className="text-stone-500">nobody</span>}
        </div>
        {r.charId && <span className="text-[10px] text-stone-400">{r.competenceWord}{r.record ? ` · ${r.record}` : ''}{r.standing !== undefined ? ` · standing ${r.standing}` : ''}</span>}
      </div>
      {r.empty ? <p className="text-[11px] text-stone-500">{r.empty}</p> : (
        <>
          <div className="text-[10px] text-stone-500">Budget {fmt$(r.budget)}/wk · planned {fmt$(r.planned)}{r.kept.length ? ` · you keep: ${r.kept.map((k) => DOMAINS[k].name.toLowerCase()).join(', ')}` : ''}</div>
          {r.found.map((f, i) => <p key={i} className="mt-1 rounded border border-red-700/60 bg-red-900/20 px-2 py-1 text-[11px] text-red-200" data-testid="lt-found">⚠ {f.text}</p>)}
          {r.lastWeek.length > 0 && (
            <Section title="Last week" n={r.lastWeek.length}>
              {r.lastWeek.slice(0, 5).map((e, i) => <li key={i} className={`text-[11px] ${e.result === 'failed' || e.good === false ? 'text-amber-200' : e.result === 'done' ? 'text-stone-300' : 'text-stone-500'}`}>{e.text}</li>)}
            </Section>
          )}
          <Section title="Needs you" n={r.needs.length}>{r.needs.map((a) => <ActLine key={a.id} s={s} a={a} update={update} onChar={onChar} kind="needs" />)}</Section>
          <Section title="Yesterday" n={r.yesterday.length}>{r.yesterday.map((a) => <ActLine key={a.id} s={s} a={a} update={update} kind="done" />)}</Section>
          <Section title="Today" n={r.todayActs.length}>{r.todayActs.map((a) => <ActLine key={a.id} s={s} a={a} update={update} onChar={onChar} kind="today" />)}</Section>
          <Section title="Later this week" n={r.coming.length}>{r.coming.map((a) => <ActLine key={a.id} s={s} a={a} update={update} onChar={onChar} kind="coming" />)}</Section>
          {!r.needs.length && !r.todayActs.length && !r.coming.length && !r.yesterday.length && <p className="mt-1 text-[11px] text-stone-500">Nothing on his list this week{r.handles.length ? '' : ': you kept all of it'}.</p>}
        </>
      )}
    </article>
  );
}

/** The two morning reports, side by side, with "Who handles what". */
export function MorningReports({ s, update, onChar, onSettings }: { s: GameState; update: Update; onChar?: (id: string) => void; onSettings: () => void }) {
  if (s.gameOver) return null;
  const reps = LT_SEATS.map((seat) => morningReport(s, seat));
  const needs = reps.reduce((a, r) => a + r.needs.length, 0);
  return (
    <section className="rounded-md border border-sky-800/40 bg-noir-800/40 p-2.5" data-testid="lt-reports">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="panel-title text-base">Morning report</div>
          <div className="text-[11px] text-stone-400">Your underboss and consigliere run their side of the business. {needs ? <span className="text-amber-200">{needs} waiting on your word.</span> : 'Nothing waiting on your word.'}</div>
        </div>
        <button type="button" className="btn-ghost text-[11px]" onClick={onSettings} data-testid="lt-settings-open">Who handles what ▸</button>
      </div>
      <div className="mt-1.5 grid gap-2 lg:grid-cols-2">
        {reps.map((r) => <ReportCard key={r.seat} s={s} r={r} update={update} onChar={onChar} />)}
      </div>
    </section>
  );
}

/**
 * THE CHAIN OF COMMAND (a place: The Family › Council & chain of command, and the "Who handles what"
 * window): one-tap presets, each lieutenant's domains (Handle it / Ask me first / I'll do it) and
 * budget, and each capo's say over his own territory's routine.
 */
export function ChainOfCommand({ s, update }: { s: GameState; update?: Update }) {
  const [, force] = useState(0);
  const up = (f: (x: GameState) => GameState, what?: string) => { update?.(f, what); force((x) => x + 1); };
  const preset = presetOf(s);
  const ks = capos(s).filter((k) => isFree(s, k));
  return (
    <div className="space-y-3" data-testid="chain-of-command">
      <p className="text-[12px] text-stone-400">How far your people go on their own. <b>Handle it</b>: he acts; you can still stop him before his day. <b>Ask me first</b>: he proposes; approve, change or veto before his day, or he does it his way. <b>I'll do it</b>: he stays out of it. A big step (money out, new ground, a man made, a war move) waits for your word unless you let them run it.</p>
      <div className="grid gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="Presets" data-testid="chain-presets">
        {(Object.keys(PRESETS) as LtPreset[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={preset === p} disabled={!update}
            className={`rounded border px-2 py-1.5 text-left ${preset === p ? 'border-gold-500 bg-gold-500/10' : 'border-noir-600 hover:border-gold-500'}`}
            onClick={() => up((cur) => applyPreset(cur, p), `Chain of command: ${PRESETS[p].name}`)} data-testid={`chain-preset-${p}`}>
            <div className="text-[12px] font-semibold text-stone-100">{PRESETS[p].name}{p === 'balanced' ? ' (default)' : ''}</div>
            <div className="text-[10px] text-stone-400">{PRESETS[p].blurb}</div>
          </button>
        ))}
      </div>
      {!preset && <div className="text-[11px] text-stone-500">Your own mix (a • marks a line set away from the default).</div>}
      {LT_SEATS.map((seat: LtSeat) => {
        const r = morningReport(s, seat);
        const budget = budgetOf(s, seat);
        return (
          <section key={seat} className="rounded border border-noir-700 p-2" data-testid={`lt-settings-${seat}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-[13px] text-stone-100"><span className="panel-title text-sm">{r.title}</span> {r.name ?? <span className="text-stone-500">(empty seat)</span>} {r.charId && <span className="text-[11px] text-stone-400">· {r.competenceWord}{r.record ? ` · ${r.record}` : ''}</span>}</div>
              <label className="text-[11px] text-stone-400">Budget{' '}
                <select className="rounded border border-noir-600 bg-noir-900 px-1 py-0.5 text-[11px] text-stone-200" value={budget} disabled={!update} onChange={(e) => up((cur) => setBudget(cur, seat, Number(e.target.value)))} data-testid={`lt-budget-${seat}`}>
                  {[...new Set([...BUDGET_STEPS, budget])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{v ? `${fmt$(v)} a week` : 'nothing'}</option>)}
                </select>
              </label>
            </div>
            <ul className="mt-1 divide-y divide-noir-800">
              {DOMAIN_IDS.filter((d) => DOMAINS[d].seat === seat).map((d) => (
                <LevelRow key={d} id={`lt-domain-${d}`} name={`${DOMAINS[d].name}${levelOf(s, d) === DOMAINS[d].def ? '' : ' •'}`} blurb={DOMAINS[d].blurb} level={levelOf(s, d)} testid={(l) => `lt-level-${d}-${l}`} onSet={update ? (l) => up((cur) => setLevel(cur, d, l)) : undefined} />
              ))}
            </ul>
          </section>
        );
      })}
      <section className="rounded border border-noir-700 p-2" data-testid="chain-capos">
        <div className="panel-title text-sm">Your capos: each runs his own territory</div>
        <p className="text-[10px] text-stone-500">His morning problems: Handle it (his own answer, no grudge for not asking him), Ask me first (they come to your Desk), I'll do it. Urgent ones always reach you.</p>
        <ul className="mt-1 divide-y divide-noir-800">
          {ks.map((k) => {
            const d = s.districts.find((x) => x.capoId === k.id);
            const adv = capoAdvice(s, k.id);
            const lv = capoLevelOf(s, k.id);
            return <LevelRow key={k.id} id={`chain-capo-${k.id}`} name={`${displayName(k)}${d ? ` · ${d.name}` : ''}`} blurb={`Advice: ${LEVEL_LABEL[adv.level]} (${adv.why})`} level={lv} testid={(l) => `chain-capo-${k.id}-${l}`} onSet={update ? (l) => up((cur) => setCapoLevel(cur, k.id, l)) : undefined} />;
          })}
          {!ks.length && <li className="py-1 text-[11px] text-stone-500">No capos yet.</li>}
        </ul>
      </section>
      <p className="text-[11px] text-stone-500">Delegating is not running the family: an idle boss still pays for it, though a good man softens the bite in what he minds. Veto too often and he takes it personally; sign off on a bad call and it is yours. What a greedy or disloyal man does with the room you give him comes out later.</p>
    </div>
  );
}

function LevelRow({ id, name, blurb, level, onSet, testid }: { id: string; name: string; blurb: string; level: LtLevel; onSet?: (l: LtLevel) => void; testid: (l: LtLevel) => string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-1" data-testid={id}>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-stone-200">{name}</div>
        <div className="text-[10px] text-stone-500">{blurb}</div>
      </div>
      <div className="flex overflow-hidden rounded border border-noir-600" role="radiogroup" aria-label={name}>
        {LEVELS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={level === l} disabled={!onSet}
            className={`px-2 py-0.5 text-[10px] ${level === l ? (l === 'handle' ? 'bg-emerald-700/60 text-emerald-50' : l === 'ask' ? 'bg-amber-600/60 text-amber-50' : 'bg-noir-600 text-stone-100') : 'text-stone-400 hover:bg-noir-700'}`}
            onClick={() => onSet?.(l)} data-testid={testid(l)}>{LEVEL_LABEL[l]}</button>
        ))}
      </div>
    </li>
  );
}

/** The chain of command as a place (panels.tsx borgata.chain): the shell's update. */
export function ChainOfCommandPlace({ s }: { s: GameState }) {
  const { update } = useShell();
  return <ChainOfCommand s={s} update={update ? (f) => update(f) : undefined} />;
}

/** "Who handles what": the chain of command in a window (from the Desk and the morning reports). */
export function WhoHandlesWhat({ s, update, onClose }: { s: GameState; update: Update; onClose: () => void }) {
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5 space-y-3" data-testid="lt-settings">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-2xl text-gold-400">Who handles what</h2>
          <button type="button" className="btn-ghost text-xs" onClick={onClose} data-testid="lt-settings-close">Done</button>
        </div>
        <ChainOfCommand s={s} update={update} />
      </div>
    </Modal>
  );
}

/** One line for an approve/veto row elsewhere (the Plans panel). */
export function actSummary(s: GameState, a: LtAct): string {
  const o = chosenOpt(s, a);
  return `${lc(o?.label ?? a.topic)} (${a.topic})`;
}
