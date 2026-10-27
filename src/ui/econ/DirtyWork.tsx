import { AdviceButton } from '../advice/AdviceButton';
import { useMemo, useState } from 'react';
import { previewAction, queuedMoney } from '../../engine/actions';
import {
  crewFor, defaultMan, jobAction, JOBS, JOBS_BY_ID, jobLock, jobsForPerson, jobsForPlace, jobSummary, lastResults, RACKET_LINK, takeRange, targetsFor, TILES, weekTip,
  type CrewChoice, type DirtyJobId, type DirtyTile, type JobDef,
} from '../../engine/dirtyWork';
import { hotspotLot } from '../../engine/walk';
import type { Lot } from '../../engine/econState';
import type { Business, GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard, useOrders } from '../components/Orders';
import { useShell } from '../shell/context';

/**
 * DIRTY WORK: one-off jobs, a few taps, phone-friendly. Four big tiles
 * (Scores, Muscle, Fixes, Moving goods); each opens a short list; then who
 * does it (skill, nerve, loyalty, heat, his odds), the target when the job
 * needs one, and one plain summary with one "Do it" button (the order toast
 * confirms; the result is in the week's report and at the top of this panel).
 * Mirrors Start a racket (StartRacket.tsx).
 */
type Step = 'tiles' | 'list' | 'who' | 'target' | 'sum';

/** Where a Walk/Street/character card wants the job aimed: set just before the shell opens this panel, read once on mount. */
export const dirtyHint: { job?: DirtyJobId; target?: string; person?: string; at?: number } = {};
export function hintDirty(h: { job?: DirtyJobId; target?: string; person?: string }): void {
  dirtyHint.job = h.job;
  dirtyHint.target = h.target;
  dirtyHint.person = h.person;
  dirtyHint.at = Date.now();
}
function takeHint(): { job?: DirtyJobId; target?: string; person?: string } {
  if (!dirtyHint.at || Date.now() - dirtyHint.at > 15000) return {};
  const h = { job: dirtyHint.job, target: dirtyHint.target, person: dirtyHint.person };
  dirtyHint.at = undefined;
  return h;
}

/** Men already sent on something this week by the queued orders. */
function queuedMen(orders: PlayerAction[]): Set<string> {
  const out = new Set<string>();
  for (const o of orders) {
    if (o.kind === 'dirty') out.add(o.op.who);
    if (o.kind === 'scheme') for (const a of o.agents) out.add(a);
  }
  return out;
}

const OUTCOME: Record<string, { word: string; cls: string }> = {
  clean: { word: 'Clean', cls: 'text-emerald-300' },
  messy: { word: 'Messy', cls: 'text-amber-300' },
  bust: { word: 'Came up empty', cls: 'text-stone-400' },
  pinched: { word: 'Picked up', cls: 'text-red-300' },
};

export function DirtyWork({ s, onDone }: { s: GameState; onDone?: () => void }) {
  const { orders, queue } = useOrders();
  const shell = useShell();
  const [hint] = useState(takeHint);
  const first = hint.job ? JOBS_BY_ID[hint.job] : undefined;
  const [step, setStep] = useState<Step>(first ? (first.noWho ? 'sum' : 'who') : 'tiles');
  const [tile, setTile] = useState<DirtyTile>(first?.tile ?? 'scores');
  const [job, setJob] = useState<DirtyJobId | undefined>(hint.job);
  const [who, setWho] = useState<string | undefined>(() => (hint.job ? (JOBS_BY_ID[hint.job].noWho ? s.playerId : defaultMan(s, hint.job)?.c.id) : undefined));
  const [target, setTarget] = useState<string | undefined>(hint.target ?? (hint.person && hint.job ? hint.person : undefined));
  const [pocket, setPocket] = useState(false);
  const [done, setDone] = useState<string | undefined>();
  const [person] = useState(hint.person);
  const j = job ? JOBS_BY_ID[job] : undefined;
  const results = lastResults(s);
  const tip = weekTip(s);

  const pick = (id: DirtyJobId, tgt?: string) => {
    const d = JOBS_BY_ID[id];
    setJob(id);
    setDone(undefined);
    setPocket(false);
    setTarget(tgt ?? (d.target === 'route' || d.target === 'fix' ? targetsFor(s, id)[0]?.id : undefined));
    setWho(d.noWho ? s.playerId : defaultMan(s, id)?.c.id);
    setStep(d.noWho ? (tgt ? 'sum' : 'target') : 'who');
  };
  const steps: Step[] = !j ? ['tiles', 'list', 'who', 'sum'] : j.noWho ? ['tiles', 'list', 'target', 'sum'] : j.target ? ['tiles', 'list', 'who', 'target', 'sum'] : ['tiles', 'list', 'who', 'sum'];
  const back = () => {
    const i = steps.indexOf(step);
    setStep(i > 0 ? steps[i - 1] : 'tiles');
  };
  const next = () => {
    const i = steps.indexOf(step);
    setStep(steps[Math.min(steps.length - 1, i + 1)]);
  };
  const forPerson = person ? jobsForPerson(s, person) : [];

  return (
    <section className="rounded-md border border-red-800/70 bg-noir-900/60 p-3" data-testid="dirty-work">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="panel-title">Dirty work</div>
          <div className="text-[11px] text-stone-500">
            {step === 'tiles' ? 'One-off jobs: pick the kind of work.' : step === 'list' ? TILES.find((t) => t.id === tile)?.label : j ? `${j.icon} ${j.title}` : ''}
          </div>
        </div>
        {step !== 'tiles' && <button type="button" className="btn-ghost text-xs py-1" onClick={back} data-testid="dw-back">← Back</button>}
      </header>
      <ol className="mt-2 flex gap-1" aria-label="Steps">
        {steps.map((st, i) => <li key={st} className={`h-1 flex-1 rounded ${steps.indexOf(step) >= i ? 'bg-red-400' : 'bg-noir-700'}`} />)}
      </ol>

      {step === 'tiles' && results.length > 0 && (
        <div className="mt-2 rounded border border-noir-600 bg-noir-800/60 px-2 py-1.5" data-testid="dw-results">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">How last week's jobs went</div>
          <ul className="mt-1 space-y-1">
            {results.map((r, i) => (
              <li key={i} className="text-xs text-stone-300" data-testid="dw-result" data-outcome={r.outcome}>
                <span className={`mr-1 rounded px-1 text-[10px] font-semibold uppercase tracking-wide bg-noir-900 ${OUTCOME[r.outcome].cls}`}>{OUTCOME[r.outcome].word}</span>{r.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {done && step === 'tiles' && <div className="mt-2 rounded border border-emerald-700 bg-emerald-900/20 px-2 py-1.5 text-xs text-emerald-200" data-testid="dw-ordered">✓ {done}: ordered. It happens this week; the result is in the week's report.</div>}
      {step === 'tiles' && tip && !done && (
        <button type="button" onClick={() => { setTile(JOBS_BY_ID[tip.job].tile); pick(tip.job); }} data-testid="dw-tip"
          className="mt-2 w-full text-left rounded border border-gold-600/50 bg-gold-500/10 px-2 py-1.5 text-xs text-gold-200 hover:border-gold-400">
          ★ A tip this week: {tip.text} <span className="text-gold-400">({JOBS_BY_ID[tip.job].title.toLowerCase()}: bigger take, better odds) →</span>
        </button>
      )}
      {step === 'tiles' && person && forPerson.length > 0 && (
        <div className="mt-2 rounded border border-red-700/50 bg-red-900/10 px-2 py-1.5" data-testid="dw-person">
          <div className="text-xs text-stone-300">About {s.characters[person]?.firstName} {s.characters[person]?.lastName}:</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {forPerson.map((id) => <button key={id} type="button" className="btn-ghost text-xs py-1" onClick={() => { setTile(JOBS_BY_ID[id].tile); pick(id, person); }} data-testid="dw-person-job">{JOBS_BY_ID[id].icon} {JOBS_BY_ID[id].title}</button>)}
          </div>
        </div>
      )}

      {step === 'tiles' && (
        <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-2">
          {TILES.map((t) => {
            const n = JOBS.filter((x) => x.tile === t.id);
            const open = n.filter((x) => !jobLock(s, x.id)).length;
            return (
              <button key={t.id} type="button" data-testid={`dw-tile-${t.id}`} onClick={() => { setTile(t.id); setStep('list'); }}
                className="text-left rounded-md border border-noir-600 bg-noir-800/70 px-3 py-3 hover:border-red-400 focus:border-red-400 min-h-[72px]">
                <div className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden>{t.icon}</span>
                  <span className="font-semibold text-stone-100">{t.label}</span>
                  <span className="ml-auto text-[10px] text-stone-500">{open} of {n.length} open now</span>
                </div>
                <div className="text-[11px] text-stone-400 mt-1">{t.blurb}</div>
              </button>
            );
          })}
        </div>
      )}

      {step === 'list' && (
        <ul className="mt-3 space-y-1.5" data-testid="dw-list">
          {JOBS.filter((x) => x.tile === tile).map((x) => <JobLine key={x.id} s={s} j={x} tip={tip?.job === x.id} onPick={() => pick(x.id)} />)}
        </ul>
      )}

      {step === 'who' && j && (
        <Who s={s} job={j.id} who={who} setWho={setWho} busy={queuedMen(orders)} onNext={next} last={!j.target} />
      )}

      {step === 'target' && j && (
        <Target s={s} job={j.id} target={target} setTarget={setTarget} onNext={next} />
      )}

      {step === 'sum' && j && who && (
        <Summary s={s} job={j.id} who={who} target={target} pocket={pocket} setPocket={setPocket} orders={orders}
          onGo={(a) => { queue(a); setDone(j.title); setStep('tiles'); setJob(undefined); onDone?.(); }}
          onRacket={RACKET_LINK[j.id] ? () => shell.go('holdings.hub') : undefined} />
      )}
    </section>
  );
}

function JobLine({ s, j, tip, onPick }: { s: GameState; j: JobDef; tip: boolean; onPick: () => void }) {
  const lock = jobLock(s, j.id);
  const [lo, hi] = j.wrap ? j.take : takeRange(s, j.id, j.target === 'route' ? 'docks' : undefined);
  return (
    <li>
      <button type="button" onClick={onPick} data-testid="dw-item" data-job={j.id}
        className={`w-full text-left rounded-md border px-3 py-2 ${lock ? 'border-noir-700 bg-noir-900/40' : 'border-noir-600 bg-noir-800/70 hover:border-red-400'}`}>
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none mt-0.5" aria-hidden>{j.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold text-stone-100 text-sm">{j.title}</span>
              {tip && <span className="chip-good text-[10px]">Tip this week</span>}
              {j.wrap && <span className="rounded bg-noir-700 px-1 text-[10px] text-stone-300">{j.wrap === 'bustout' ? 'a racket' : j.wrap === 'bribe' ? 'an envelope' : 'planned over weeks'}</span>}
              {j.id === 'dope' && <span className="rounded bg-red-900/60 px-1 text-[10px] text-red-200">Forbidden</span>}
            </div>
            <div className="text-[11px] text-stone-400">{j.line}</div>
            {lock && <div className="text-[10px] text-red-300 mt-0.5">✗ {lock.why}</div>}
          </div>
          <div className="shrink-0 text-right text-[11px] tabular-nums">
            <div className="text-stone-300">{j.cost ? fmt$(j.cost) : j.wrap ? '' : 'no cost'}</div>
            <div className="text-gold-300">{hi ? `${fmt$(lo)}–${fmt$(hi)}` : j.tile === 'fixes' ? 'a fix' : 'no take'}</div>
          </div>
        </div>
      </button>
    </li>
  );
}

const ROLE: Record<CrewChoice['role'], string> = { boss: 'You', capo: 'Capo', soldier: 'Soldier', associate: 'Associate', specialist: 'Specialist' };

function Bar({ v, cls = 'bg-gold-400' }: { v: number; cls?: string }) {
  return <span className="inline-block h-1.5 w-10 rounded bg-noir-700 align-middle"><span className={`block h-1.5 rounded ${cls}`} style={{ width: `${Math.max(4, Math.min(100, v))}%` }} /></span>;
}

function Who({ s, job, who, setWho, busy, onNext, last }: { s: GameState; job: DirtyJobId; who?: string; setWho: (x: string) => void; busy: Set<string>; onNext: () => void; last: boolean }) {
  const all = useMemo(() => crewFor(s, job), [s, job]);
  const j = JOBS_BY_ID[job];
  const sel = all.find((r) => r.c.id === who);
  const queued = (id: string) => busy.has(id);
  return (
    <div className="mt-3" data-testid="dw-who">
      <div className="text-xs text-stone-300">Who does it? <span className="text-stone-500">The job wants {j.fit}{j.spec ? ` (a ${j.spec} helps)` : ''} and nerve. A loyal man keeps his mouth shut if he is picked up.</span></div>
      <ul className="mt-2 space-y-1.5 max-h-[52vh] overflow-y-auto pr-1" role="radiogroup" aria-label="Who does it">
        {all.map((r) => {
          const on = r.c.id === who;
          const blocked = r.busy ?? (queued(r.c.id) && !on ? 'Already sent on something this week' : undefined);
          return (
            <li key={r.c.id}>
              <button type="button" role="radio" aria-checked={on} disabled={!!r.busy} onClick={() => setWho(r.c.id)} data-testid="dw-man" data-role={r.role}
                className={`w-full text-left rounded-md border px-3 py-2 ${on ? 'border-red-400 bg-red-500/10' : blocked ? 'border-noir-700 bg-noir-900/40 opacity-70' : 'border-noir-600 bg-noir-800/70 hover:border-red-400'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-sm text-stone-100">{r.role === 'boss' ? 'You' : `${r.c.firstName}${r.c.nickname ? ` "${r.c.nickname}"` : ''} ${r.c.lastName}`}</span>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">{ROLE[r.role]}</span>
                  {r.best && <span className="chip-good text-[10px]">Best fit</span>}
                  <span className={`ml-auto text-xs font-semibold tabular-nums ${r.odds >= 70 ? 'text-emerald-300' : r.odds >= 50 ? 'text-gold-300' : 'text-red-300'}`}>{r.odds}%</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-400 tabular-nums">
                  <span>Skill <Bar v={r.skill} /> {r.skill}</span>
                  <span>Nerve <Bar v={r.nerve} cls="bg-red-400" /> {r.nerve}</span>
                  {r.loyalty !== undefined && <span className={r.loyalty >= 20 ? 'text-emerald-300' : r.loyalty < 0 ? 'text-red-300' : ''}>Loyalty {r.loyalty > 0 ? '+' : ''}{r.loyalty}</span>}
                  <span className={r.heat >= 40 ? 'text-red-300' : r.heat >= 15 ? 'text-amber-300' : ''}>Heat {r.heat}</span>
                </div>
                <div className={`text-[10px] mt-0.5 ${blocked ? 'text-red-300' : 'text-stone-500'}`}>{blocked ?? r.note}</div>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn-gold mt-3 w-full sm:w-auto" disabled={!sel || !!sel.busy} onClick={onNext} data-testid="dw-next">{last ? 'Next: the summary →' : 'Next: the target →'}</button>
    </div>
  );
}

function Target({ s, job, target, setTarget, onNext }: { s: GameState; job: DirtyJobId; target?: string; setTarget: (x: string | undefined) => void; onNext: () => void }) {
  const j = JOBS_BY_ID[job];
  const all = targetsFor(s, job);
  const word = { route: 'Where?', fix: 'Which one?', shop: 'Which shop?', rivalLot: 'Which place?', rival: 'Which family?', person: 'Who?', official: 'Who gets the envelope?', loan: 'Who is late?', mine: 'Which of your places?' }[j.target!];
  return (
    <div className="mt-3" data-testid="dw-target">
      <div className="text-xs text-stone-300">{word} {j.target === 'shop' && <span className="text-stone-500">Or walk the boardwalk and pick a shop on the street.</span>}</div>
      {!all.length && <p className="mt-2 text-xs text-stone-400">{j.targetOptional ? 'Nothing in particular: the job goes ahead without a target.' : 'Nothing to aim it at right now.'}</p>}
      <ul className="mt-2 space-y-1.5 max-h-[52vh] overflow-y-auto pr-1" role="radiogroup" aria-label="Target">
        {j.targetOptional && all.length > 0 && (
          <li>
            <button type="button" role="radio" aria-checked={!target} onClick={() => setTarget(undefined)} data-testid="dw-target-none"
              className={`w-full text-left rounded-md border px-3 py-2 ${!target ? 'border-red-400 bg-red-500/10' : 'border-noir-600 bg-noir-800/70 hover:border-red-400'}`}>
              <div className="font-semibold text-sm text-stone-100">{job === 'cardgame' ? 'An out-of-town game (nobody\'s)' : job === 'welsher' ? 'Somebody on the shylock book' : 'Nobody in particular'}</div>
            </button>
          </li>
        )}
        {all.map((t) => {
          const on = t.id === target;
          return (
            <li key={t.id}>
              <button type="button" role="radio" aria-checked={on} onClick={() => setTarget(t.id)} data-testid="dw-target-opt"
                className={`w-full text-left rounded-md border px-3 py-2 ${on ? 'border-red-400 bg-red-500/10' : 'border-noir-600 bg-noir-800/70 hover:border-red-400'}`}>
                <div className="font-semibold text-sm text-stone-100">{t.name}</div>
                <div className="text-[11px] text-stone-400">{t.note}</div>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn-gold mt-3 w-full sm:w-auto" disabled={!j.targetOptional && !target} onClick={onNext} data-testid="dw-next">Next: the summary →</button>
    </div>
  );
}

function Summary({ s, job, who, target, pocket, setPocket, orders, onGo, onRacket }: {
  s: GameState; job: DirtyJobId; who: string; target?: string; pocket: boolean; setPocket: (x: boolean) => void; orders: PlayerAction[];
  onGo: (a: PlayerAction) => void; onRacket?: () => void;
}) {
  const sum = jobSummary(s, job, who, target, pocket ? 'pocket' : undefined);
  const j = sum.job;
  const p = sum.action ? previewAction(s, sum.action) : undefined;
  const q = queuedMoney(s, orders);
  const short = sum.cost > 0 && (pocket ? sum.cost > q.pocketLeft + q.familyLeft : sum.cost > q.familyLeft) ? `Only ${fmt$(pocket ? q.pocketLeft : q.familyLeft)} left after this week's orders` : undefined;
  const already = !!sum.action && orders.some((o) => JSON.stringify(o) === JSON.stringify(sum.action));
  const manBusy = !j.noWho && orders.some((o) => o.kind === 'dirty' && o.op.who === who) && !already ? 'He is already on a job this week' : undefined;
  const why = sum.lock?.why ?? p?.disabledReason ?? manBusy ?? short;
  const c = s.characters[who];
  const rows: [string, string, string?][] = [
    ['Who', j.noWho ? 'You: an envelope' : who === s.playerId ? 'You, yourself' : `${c?.firstName} ${c?.lastName}`],
    ...(sum.targetName ? [['Target', sum.targetName] as [string, string]] : []),
    ['Cost', sum.cost ? `${fmt$(sum.cost)} from ${pocket ? 'your pocket' : 'Family money'}` : 'Nothing up front'],
    ['The take', sum.take[1] ? `${fmt$(sum.take[0])}–${fmt$(sum.take[1])}${j.wrap ? '' : ` to ${pocket ? 'your pocket' : 'the Family'} (dirty cash); his end is 10%`}${job === 'torch' ? ' (clean: the insurer pays)' : ''}` : j.tile === 'fixes' ? 'No money: it fixes something' : 'No money: it sends a message', 'text-gold-300'],
    ['Odds', j.wrap === 'bustout' ? 'A racket: it runs, then it pays' : j.wrap === 'bribe' ? `${p?.acceptance ? Math.round(p.acceptance.chance * 100) : '?'}% he takes it` : `${sum.odds}% it goes clean${j.wrap ? '' : ` · ${sum.witness}% a witness`}`, sum.odds >= 70 || j.wrap === 'bustout' ? 'text-emerald-300' : sum.odds >= 50 || j.wrap === 'bribe' ? 'text-gold-300' : 'text-red-300'],
    ...(!j.wrap ? [['Arrest', `${sum.arrest}% he is picked up${sum.rat ? ` · ${sum.rat}% he talks (a rat)` : ''}`, sum.arrest >= 15 ? 'text-red-300' : sum.arrest >= 8 ? 'text-amber-300' : 'text-stone-200'] as [string, string, string]] : []),
    ['Heat', sum.heat, /federal/.test(sum.heat) ? 'text-amber-300' : 'text-stone-200'],
    ...(sum.evidence ? [['Evidence', sum.evidence] as [string, string]] : []),
    ['Who objects', sum.objects],
    ...(sum.philly ? [['Philadelphia', sum.philly] as [string, string]] : []),
    ...(sum.weeks ? [['How long', `About ${sum.weeks} week${sum.weeks > 1 ? 's' : ''} of planning`] as [string, string]] : []),
  ];
  return (
    <div className="mt-3" data-testid="dw-summary">
      <div className="font-semibold text-stone-100">{j.icon} {sum.title}</div>
      {sum.tip && <div className="mt-1 text-[11px] text-gold-300">★ {sum.tip}</div>}
      {sum.wrapped && <div className="mt-1 text-[11px] text-stone-400">{sum.wrapped}</div>}
      <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-xs">
        {rows.map(([a, b, cls]) => [<dt key={`${a}t`} className="text-stone-500">{a}</dt>, <dd key={`${a}d`} className={cls ?? 'text-stone-200'}>{b}</dd>])}
      </dl>
      {sum.reasons.length > 1 && (
        <details className="mt-1.5 text-[11px] text-stone-400">
          <summary className="cursor-pointer text-stone-500">Why those odds</summary>
          <ul className="mt-1 grid grid-cols-[1fr_auto] gap-x-3">
            {sum.reasons.map((r, i) => [<li key={`${i}l`}>{r.label}</li>, <li key={`${i}v`} className={`tabular-nums text-right ${r.value < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{r.value > 0 ? '+' : ''}{r.value}</li>])}
          </ul>
        </details>
      )}
      {sum.warns.map((w, i) => <div key={i} className="mt-1.5 text-[11px] text-amber-300">⚠ {w}</div>)}
      {sum.lock?.how && <div className="mt-1 text-[11px]"><span className="text-red-300">✗ {sum.lock.why}</span> <span className="text-stone-500">— {sum.lock.how}</span></div>}
      {!j.wrap && sum.cost > 0 && (
        <label className="mt-2 flex items-center gap-2 text-xs text-stone-200">
          <input type="checkbox" checked={pocket} onChange={(e) => setPocket(e.target.checked)} data-testid="dw-pocket" />
          My own score: pay from my pocket, and the take is mine
        </label>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-gold w-full sm:w-auto bg-red-700 border-red-500" disabled={!sum.action || !!why || already} onClick={() => sum.action && onGo(sum.action)} data-testid="dw-go">
          {already ? 'Ordered ✓' : j.wrap === 'hit' ? 'Plan the hit' : j.wrap === 'bribe' ? 'Send the envelope' : j.wrap === 'bustout' ? 'Start the bust-out' : j.wrap ? 'Plan the score' : 'Do it'}
        </button>
        {onRacket && <button type="button" className="btn-ghost text-xs py-1" onClick={onRacket} data-testid="dw-racket">Or run it every week as a racket →</button>}
      </div>
      {why && <div className="text-[11px] text-red-400 mt-1">Unavailable: {why.charAt(0).toLowerCase()}{why.slice(1)}</div>}
      {sum.action && <div className="mt-2 flex flex-wrap items-baseline gap-2" data-testid="dw-advice"><AdviceButton s={s} subject={{ kind: 'action', action: sum.action }} label="Ask your underboss about the job" /></div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Entry points on the Walk, Street and character cards                */
/* ------------------------------------------------------------------ */

/**
 * The targeted jobs for one place: "Shake them down" (this shop), "Run them
 * off" (a rival's place), "An insurance fire" (one of yours), each with the
 * best man already picked, plus a link into the full Dirty Work flow.
 */
export function DirtyHere({ s, lot, biz, onGo }: { s: GameState; lot?: Lot; biz?: Business; onGo: () => void }) {
  const { orders } = useOrders();
  const jobs = jobsForPlace(s, lot, biz);
  if (!jobs.length || s.gameOver) return null;
  const main = jobs[0];
  // The best man not already sent on something this week.
  const sent = queuedMen(orders);
  const mine = orders.find((o): o is Extract<PlayerAction, { kind: 'dirty' }> => o.kind === 'dirty' && o.op.job === main.job && o.op.target === main.target);
  const man = (mine ? crewFor(s, main.job).find((r) => r.c.id === mine.op.who) : undefined) ?? crewFor(s, main.job).filter((r) => !r.busy && r.role !== 'boss' && !sent.has(r.c.id)).sort((a, b) => b.odds - a.odds)[0] ?? defaultMan(s, main.job);
  const a = man ? jobAction(s, main.job, man.c.id, main.target) : undefined;
  const sum = man ? jobSummary(s, main.job, man.c.id, main.target) : undefined;
  return (
    <div className="space-y-1.5 rounded border border-red-800/60 bg-red-900/10 px-2 py-1.5" data-testid="dirty-here">
      {a && sum && (
        <ActionCard s={s} action={a} compact label={`${main.label}${sum.take[1] ? ` (~${fmt$(Math.round((sum.take[0] + sum.take[1]) / 2))})` : ''}: ${man!.c.id === s.playerId ? 'you' : man!.c.firstName}, ${sum.odds}%`} />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="btn-ghost text-xs py-1" onClick={() => { hintDirty({ job: main.job, target: main.target }); onGo(); }} data-testid="dirty-here-more">✂ Dirty work here…</button>
        {jobs.slice(1).map((x) => <button key={x.job} type="button" className="btn-ghost text-xs py-1" onClick={() => { hintDirty({ job: x.job, target: x.target }); onGo(); }} data-testid="dirty-here-job">{x.label}</button>)}
      </div>
    </div>
  );
}

/** Walk-card variant: the hotspot's lot. */
export function DirtyHereForSpot({ s, spot, biz, onGo }: { s: GameState; spot: Parameters<typeof hotspotLot>[1]; biz?: Business; onGo: () => void }) {
  return <DirtyHere s={s} lot={hotspotLot(s, spot)} biz={biz} onGo={onGo} />;
}

/** Character card: the people jobs aimed at him (lean on him, pay him off, buy him, a hit). */
export function DirtyOnPerson({ s, charId, onGo }: { s: GameState; charId: string; onGo: () => void }) {
  const jobs = jobsForPerson(s, charId);
  if (!jobs.length || s.gameOver) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="dirty-person">
      <span className="text-[10px] uppercase tracking-widest text-red-300">Dirty work</span>
      {jobs.map((id) => (
        <button key={id} type="button" className="btn-ghost text-xs py-1" onClick={() => { hintDirty({ job: id, target: charId, person: charId }); onGo(); }} data-testid="dirty-person-job">
          {JOBS_BY_ID[id].icon} {id === 'beating' ? 'Lean on him' : id === 'witness' ? 'Pay him off' : id === 'bribe' ? 'Buy him' : JOBS_BY_ID[id].title}
        </button>
      ))}
    </div>
  );
}

