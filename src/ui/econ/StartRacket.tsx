import { AdviceButton } from '../advice/AdviceButton';
import { useMemo, useState } from 'react';
import { previewAction, queuedCost } from '../../engine/actions';
import { CATALOG } from '../../engine/catalog';
import { placeStart, MENU_BY_KEY, MENU_GROUPS, menuRows, runnersFor, defaultRunner, startSummary, whereFor, type MenuGroup, type MenuKey, type MenuRow, type RunnerChoice } from '../../engine/racketMenu';
import type { Business, GameState } from '../../engine/types';
import type { Lot } from '../../engine/econState';
import { workPlace } from '../../engine/bizRacket';
import { WorkPlaceSheet } from './WorkPlace';
import { fmt$ } from '../format';
import { useOrders } from '../components/Orders';

/**
 * START A RACKET: a few taps, phone-friendly. Five plain groups as big tiles;
 * each opens a short list (cheapest to start first, with "Good first racket"
 * and "Steady earner" badges); then who runs it, then where, then one plain
 * summary and one "Start it" button (the order toast confirms). Self-contained
 * section: it can be slotted into any home (the Rackets hub carries it now).
 */
type Step = 'groups' | 'list' | 'who' | 'where' | 'sum';

/**
 * Where "Start a racket here" (a Walk or Street card) wants the next racket:
 * set just before the shell opens the Rackets hub, read once when the flow mounts.
 */
export const startHint: { district?: string; name?: string; at?: number } = {};
export function hintStart(district: string, name: string): void {
  startHint.district = district;
  startHint.name = name;
  startHint.at = Date.now();
}
function takeHint(): { district?: string; name?: string } {
  if (!startHint.at || Date.now() - startHint.at > 15000) return {};
  const h = { district: startHint.district, name: startHint.name };
  startHint.at = undefined;
  return h;
}

export function StartRacket({ s, onDone }: { s: GameState; onDone?: () => void }) {
  const { orders, queue } = useOrders();
  const [step, setStep] = useState<Step>('groups');
  const [group, setGroup] = useState<MenuGroup>('street');
  const [key, setKey] = useState<MenuKey | undefined>();
  const [runner, setRunner] = useState<string | undefined>();
  const [district, setDistrict] = useState<string | undefined>();
  const [earner, setEarner] = useState(true);
  const [started, setStarted] = useState<string | undefined>();
  const [here] = useState(takeHint);

  const pickRacket = (k: MenuKey) => {
    setKey(k);
    setStarted(undefined);
    if (k === 'madam') { setStep('sum'); return; }
    const d = defaultRunner(s, k);
    setRunner(d?.c.id);
    setEarner(true);
    const ws = whereFor(s, k);
    setDistrict(here.district && ws.some((w) => w.id === here.district) ? here.district : ws[0]?.id);
    setStep('who');
  };
  const back = () => setStep(step === 'sum' ? (key === 'madam' ? 'list' : 'where') : step === 'where' ? 'who' : step === 'who' ? 'list' : 'groups');
  const item = key ? MENU_BY_KEY[key] : undefined;
  const steps: Step[] = key === 'madam' ? ['groups', 'list', 'sum'] : ['groups', 'list', 'who', 'where', 'sum'];

  return (
    <section className="rounded-md border border-gold-600/60 bg-noir-900/60 p-3" data-testid="start-racket">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="panel-title">Start a racket</div>
          <div className="text-[11px] text-stone-500">
            {step === 'groups' ? 'Pick a kind of work.' : step === 'list' ? MENU_GROUPS.find((g) => g.id === group)?.label : item ? `${item.icon} ${item.title}` : ''}
          </div>
        </div>
        {step !== 'groups' && <button type="button" className="btn-ghost text-xs py-1" onClick={back} data-testid="sr-back">← Back</button>}
      </header>
      <ol className="mt-2 flex gap-1" aria-label="Steps">
        {steps.map((st, i) => <li key={st} className={`h-1 flex-1 rounded ${steps.indexOf(step) >= i ? 'bg-gold-400' : 'bg-noir-700'}`} />)}
      </ol>

      {here.name && step === 'groups' && !started && <div className="mt-2 rounded border border-gold-600/50 bg-gold-500/10 px-2 py-1.5 text-xs text-gold-200" data-testid="sr-here">Starting in {here.name}: pick what to run there.</div>}
      {started && step === 'groups' && <div className="mt-2 rounded border border-emerald-700 bg-emerald-900/20 px-2 py-1.5 text-xs text-emerald-200" data-testid="sr-started">✓ {started}: ordered. It opens when the week ends.</div>}

      {step === 'groups' && (
        <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {MENU_GROUPS.map((g) => {
            const rows = menuRows(s, g.id);
            const running = rows.reduce((a, r) => a + r.running, 0);
            return (
              <button key={g.id} type="button" data-testid={`sr-group-${g.id}`} onClick={() => { setGroup(g.id); setStep('list'); }}
                className="text-left rounded-md border border-noir-600 bg-noir-800/70 px-3 py-3 hover:border-gold-500 focus:border-gold-400 min-h-[72px]">
                <div className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden>{g.icon}</span>
                  <span className="font-semibold text-stone-100">{g.label}</span>
                  <span className="ml-auto text-[10px] text-stone-500">{rows.length} kinds{running ? ` · ${running} running` : ''}</span>
                </div>
                <div className="text-[11px] text-stone-400 mt-1">{g.blurb}</div>
              </button>
            );
          })}
        </div>
      )}

      {step === 'list' && (
        <ul className="mt-3 space-y-1.5" data-testid="sr-list">
          {menuRows(s, group).map((r) => <MenuLine key={r.key} r={r} onPick={() => pickRacket(r.key)} />)}
        </ul>
      )}

      {step === 'who' && key && key !== 'madam' && (
        <Who s={s} kind={key} runner={runner} setRunner={setRunner} earner={earner} setEarner={setEarner} onNext={() => setStep('where')} />
      )}

      {step === 'where' && key && key !== 'madam' && (
        <Where s={s} kind={key} district={district} setDistrict={setDistrict} onNext={() => setStep('sum')} />
      )}

      {step === 'sum' && key && (
        <Summary s={s} k={key} runner={runner} district={district} earner={earner} budget={s.money - queuedCost(s, orders)} queued={orders}
          onStart={(a) => { queue(a); setStarted(item?.title); setStep('groups'); setKey(undefined); onDone?.(); }} />
      )}
    </section>
  );
}

function MenuLine({ r, onPick }: { r: MenuRow; onPick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onPick} data-testid="sr-item" data-key={r.key}
        className={`w-full text-left rounded-md border px-3 py-2 ${r.locked ? 'border-noir-700 bg-noir-900/40' : 'border-noir-600 bg-noir-800/70 hover:border-gold-500'}`}>
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none mt-0.5" aria-hidden>{r.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold text-stone-100 text-sm">{r.title}</span>
              {r.first && <span className="chip-good text-[10px]">Good first racket</span>}
              {r.steady && <span className="rounded bg-emerald-800/50 px-1 text-[10px] text-emerald-200">Steady earner</span>}
              {r.running > 0 && <span className="rounded bg-noir-700 px-1 text-[10px] text-stone-300">running{r.running > 1 ? ` ×${r.running}` : ''}</span>}
            </div>
            <div className="text-[11px] text-stone-400">{r.line}</div>
            {r.locked && <div className="text-[10px] text-red-300 mt-0.5">✗ {r.locked}</div>}
          </div>
          <div className="shrink-0 text-right text-[11px] tabular-nums">
            <div className="text-stone-300">{r.key === 'madam' ? 'no cost' : fmt$(r.cost)}</div>
            <div className={r.weekly < 0 ? 'text-red-300' : 'text-gold-300'}>{r.weekly < 0 ? `${fmt$(r.weekly)}/wk` : r.weekly ? `~${fmt$(r.weekly)}/wk` : 'one score'}</div>
          </div>
        </div>
      </button>
    </li>
  );
}

const ROLE: Record<RunnerChoice['role'], string> = { boss: 'You', capo: 'Capo', soldier: 'Soldier', associate: 'Associate' };

function Who({ s, kind, runner, setRunner, earner, setEarner, onNext }: { s: GameState; kind: keyof typeof CATALOG; runner?: string; setRunner: (x: string) => void; earner: boolean; setEarner: (x: boolean) => void; onNext: () => void }) {
  const all = useMemo(() => runnersFor(s, kind), [s, kind]);
  const sel = all.find((r) => r.c.id === runner);
  const fit = all[0]?.fit ?? 'business';
  return (
    <div className="mt-3" data-testid="sr-who">
      <div className="text-xs text-stone-300">Who runs it? <span className="text-stone-500">The best at {fit} runs it best. You or a capo can make it his own steady earner.</span></div>
      <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label="Who runs it">
        {all.map((r) => {
          const on = r.c.id === runner;
          return (
            <li key={r.c.id}>
              <button type="button" role="radio" aria-checked={on} onClick={() => setRunner(r.c.id)} data-testid="sr-runner" data-role={r.role}
                className={`w-full text-left rounded-md border px-3 py-2 ${on ? 'border-gold-400 bg-gold-500/10' : 'border-noir-600 bg-noir-800/70 hover:border-gold-500'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-sm text-stone-100">{r.role === 'boss' ? 'You' : `${r.c.firstName}${r.c.nickname ? ` "${r.c.nickname}"` : ''} ${r.c.lastName}`}</span>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500">{ROLE[r.role]}</span>
                  {r.best && <span className="chip-good text-[10px]">Best fit</span>}
                  {r.canEarn && <span className="rounded bg-emerald-800/50 px-1 text-[10px] text-emerald-200">No earner yet</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-stone-400 tabular-nums">
                  <span>Skill ({r.fit}) <Bar v={r.skill} /> {r.skill}</span>
                  {r.loyalty !== undefined && <span className={r.loyalty >= 20 ? 'text-emerald-300' : r.loyalty < 0 ? 'text-red-300' : ''}>Loyalty {r.loyalty > 0 ? '+' : ''}{r.loyalty}</span>}
                  <span>Load {r.load}</span>
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">{r.note}</div>
              </button>
            </li>
          );
        })}
      </ul>
      {sel?.canEarn && (
        <label className="mt-2 flex items-center gap-2 text-xs text-stone-200">
          <input type="checkbox" checked={earner} onChange={(e) => setEarner(e.target.checked)} data-testid="sr-earner" />
          {sel.role === 'boss' ? 'Make it my own steady earner (my piece pays into my Pocket)' : `Make it ${sel.c.firstName}'s steady earner`}
        </label>
      )}
      <button type="button" className="btn-gold mt-3 w-full sm:w-auto" disabled={!runner} onClick={onNext} data-testid="sr-next">Next: where →</button>
    </div>
  );
}

function Bar({ v }: { v: number }) {
  return <span className="inline-block h-1.5 w-12 rounded bg-noir-700 align-middle"><span className="block h-1.5 rounded bg-gold-400" style={{ width: `${Math.max(4, Math.min(100, v))}%` }} /></span>;
}

function Where({ s, kind, district, setDistrict, onNext }: { s: GameState; kind: keyof typeof CATALOG; district?: string; setDistrict: (x: string) => void; onNext: () => void }) {
  const all = whereFor(s, kind);
  return (
    <div className="mt-3" data-testid="sr-where">
      <div className="text-xs text-stone-300">Where? <span className="text-stone-500">A district where you hold 20% or more and have a free storefront. The best one is first.</span></div>
      {!all.length && <p className="mt-2 text-xs text-red-300">No district has room. Push into one on the map, or take more of one you hold.</p>}
      <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label="Where">
        {all.map((d) => {
          const on = d.id === district;
          return (
            <li key={d.id}>
              <button type="button" role="radio" aria-checked={on} onClick={() => setDistrict(d.id)} data-testid="sr-district"
                className={`w-full text-left rounded-md border px-3 py-2 ${on ? 'border-gold-400 bg-gold-500/10' : 'border-noir-600 bg-noir-800/70 hover:border-gold-500'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-sm text-stone-100">{d.name}</span>
                  {d.best && <span className="chip-good text-[10px]">Best</span>}
                </div>
                <div className="text-[11px] text-stone-400">{d.control}% yours{d.capo ? ` · capo ${d.capo}` : ' · no capo'}{d.same ? ` · ${d.same} already there` : ''}</div>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn-gold mt-3 w-full sm:w-auto" disabled={!all.length} onClick={onNext} data-testid="sr-next">Next: the summary →</button>
    </div>
  );
}

function Summary({ s, k, runner, district, earner, budget, queued, onStart }: { s: GameState; k: MenuKey; runner?: string; district?: string; earner: boolean; budget: number; queued: unknown[]; onStart: (a: NonNullable<ReturnType<typeof startSummary>['action']>) => void }) {
  const sum = startSummary(s, k, runner, district, earner);
  const p = sum.action ? previewAction(s, sum.action) : undefined;
  const why = sum.locks[0]?.why ?? p?.disabledReason ?? (sum.cost > budget ? `Only ${fmt$(budget)} left after this week's orders` : undefined);
  const already = !!sum.action && queued.some((o) => JSON.stringify(o) === JSON.stringify(sum.action));
  const rows: [string, string, string?][] = [
    ['Startup cost', k === 'madam' ? 'Nothing: you agree a cut with her' : fmt$(sum.cost)],
    ['Weekly take', sum.byScore ? `${sum.weekly ? `~${fmt$(sum.weekly)}/wk · ` : ''}${sum.byScore}` : sum.steady ? `~${fmt$(sum.weekly)}/wk, every week, summer and winter` : `~${fmt$(sum.weekly)}/wk now · ~${fmt$(sum.other)} the other season`, sum.weekly < 0 ? 'text-red-300' : 'text-gold-300'],
    ['Heat', `${sum.heat} local · ${sum.federal} federal`, sum.heat === 'high' || sum.federal === 'high' ? 'text-red-300' : sum.heat === 'some' || sum.federal === 'some' ? 'text-amber-300' : 'text-stone-200'],
    ['Risk', sum.risk],
    ['Who objects', sum.objects],
    ['Philadelphia', sum.philly],
  ];
  return (
    <div className="mt-3" data-testid="sr-summary">
      <div className="font-semibold text-stone-100">{sum.title}</div>
      <dl className="mt-2 grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1 text-xs">
        {rows.map(([a, b, cls]) => [<dt key={`${a}t`} className="text-stone-500">{a}</dt>, <dd key={`${a}d`} className={cls ?? 'text-stone-200'}>{b}</dd>])}
      </dl>
      {sum.earner && <div className="mt-2 rounded border border-emerald-700/60 bg-emerald-900/20 px-2 py-1 text-[11px] text-emerald-200">★ {sum.earner}</div>}
      {sum.warns.map((w, i) => <div key={i} className="mt-1.5 text-[11px] text-amber-300">⚠ {w}</div>)}
      {sum.laws.length > 0 && <div className="mt-1 text-[11px] text-stone-400">On the books: {sum.laws.join(' · ')}</div>}
      {sum.locks.map((l, i) => <div key={i} className="mt-1 text-[11px]"><span className="text-red-300">✗ {l.why}</span> <span className="text-stone-500">— {l.how}</span></div>)}
      {p?.detail && !sum.locks.length && <div className="mt-1.5 text-[10px] text-stone-500">{p.effects.filter((e) => e.type === 'econ' && e.op.op === 'note').map((e) => (e.type === 'econ' && e.op.op === 'note' ? e.op.text : '')).join(' · ')}</div>}
      <button type="button" className="btn-gold mt-3 w-full sm:w-auto" disabled={!sum.action || !!why || already} onClick={() => sum.action && onStart(sum.action)} data-testid="sr-start">
        {already ? 'Ordered ✓' : k === 'madam' ? 'Agree the cut' : `Start it — ${fmt$(sum.cost)}`}
      </button>
      {why && <div className="text-[11px] text-red-400 mt-1">Unavailable: {why.charAt(0).toLowerCase()}{why.slice(1)}</div>}
      {sum.action && sum.action.kind === 'econ' && <div className="mt-2 flex flex-wrap items-baseline gap-2" data-testid="sr-advice"><AdviceButton s={s} subject={{ kind: 'action', action: sum.action }} label="Ask your underboss about it" /></div>}
    </div>
  );
}

/**
 * "Start a racket here" on a Walk or Street card. On a particular business it
 * opens Work this place (WorkPlace.tsx): the rackets for THAT business, its
 * owner and who protects him. Anywhere else (a stretch of the boards, a lot
 * with no business) it opens the generic flow with this district picked.
 */
export function StartHereButton({ s, place, lot, biz, onGo }: { s: GameState; place?: string; lot?: Lot; biz?: Business; onGo: () => void }) {
  const [open, setOpen] = useState(false);
  const p = placeStart(s, place);
  const wp = workPlace(s, lot, biz);
  if ((!p && !wp) || s.gameOver) return null;
  const go = () => { if (p) hintStart(p.district, p.name); onGo(); };
  return (
    <div className="rounded border border-gold-600/40 bg-gold-500/5 px-2 py-1.5" data-testid="start-here">
      <button type="button" className="btn-gold text-xs py-1" onClick={() => (wp ? setOpen(true) : go())} data-testid="start-here-btn">♣ Start a racket here</button>
      <span className="ml-2 text-[11px] text-stone-400">
        {wp ? <>Work {wp.name}: {wp.mine ? 'what you can run through your own place' : 'protection, a skim, the back door, the owner himself'}.</> : <>{p!.name} fits {p!.picks.map((r) => r.title.toLowerCase()).join(', ')}{p!.picks.length >= 3 ? ', and more' : ''}.</>}
      </span>
      {open && wp && <WorkPlaceSheet s={s} place={wp.id} onClose={() => setOpen(false)} onHub={p ? go : undefined} />}
    </div>
  );
}
