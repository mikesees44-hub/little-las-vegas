import { useState } from 'react';
import { CATALOG } from '../../engine/catalog';
import { isOpen } from '../../engine/business';
import { CUT_INFO, type CutTier } from '../../engine/earsState';
import { hubCards, runningLine, whichRacket, type HubCard } from '../../engine/racketHub';
import { adviseDials, dialCosts, dialOf, dialsOf, optEffects, racketTake } from '../../engine/racketLife';
import { racketOf, racketSummary, stepsOf, nextStep, collectPreview } from '../../engine/rackets';
import { groupOfBiz, PROP_GROUP_BY_ID } from '../../engine/propertyGroups';
import type { Business, GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard, useOrders } from '../components/Orders';
import { CharLink } from '../components/People';

/**
 * THE RACKETS: every racket on one page. What it is, what it takes to start,
 * what it pays, the heat, its ladder, who runs it, and how it is run (the
 * standing decisions), with one-click Start / Next step / Take the advice.
 * Locked rackets say exactly how to unlock them; "Which racket should I
 * start?" ranks the ones you can start for the situation right now.
 */
export function RacketHub({ s }: { s: GameState }) {
  const cards = hubCards(s);
  const [filter, setFilter] = useState<'all' | 'running' | 'ready' | 'locked'>('all');
  const running = cards.filter((c) => c.owned.length || (c.madam && (s.ears?.madam.cut ?? 0) > 0));
  const shown = cards.filter((c) => filter === 'all' || (filter === 'running' ? running.includes(c) : filter === 'ready' ? !c.locks.length && !running.includes(c) && !c.madam : c.locks.length > 0));
  const costs = dialCosts(s).reduce((a, x) => a + (x.o.weekly ?? 0), 0);
  return (
    <div className="space-y-4" data-testid="racket-hub">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Rackets you run" value={`${running.length}`} sub={`of ${cards.length} on the island`} />
        <Stat label="Their take" value={`~${fmt$(racketTake(s))}/wk`} sub="this week, expected" />
        <Stat label="Pads & arrangements" value={`${fmt$(costs)}/wk`} sub={costs ? 'paid every week' : 'nobody on the pad'} />
        <Stat label="Heat" value={`${Math.round(s.heat.local)} / ${Math.round(s.heat.federal)}`} sub="local / federal" />
      </section>

      <WhichRacket s={s} />

      <div className="flex flex-wrap gap-1 text-[11px]" role="radiogroup" aria-label="Show">
        {(['all', 'running', 'ready', 'locked'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}
            className={`rounded border px-2 py-0.5 ${filter === k ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>
            {k === 'all' ? `All (${cards.length})` : k === 'running' ? `Running (${running.length})` : k === 'ready' ? 'Ready to start' : 'Locked'}
          </button>
        ))}
      </div>

      {!shown.length && <p className="text-xs text-stone-500">{filter === 'locked' ? 'Nothing is locked: every racket on the island is open to you.' : filter === 'running' ? 'You run no rackets yet. "Which racket should I start?" above picks one.' : 'Nothing to start right now.'}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((c) => (c.madam ? <MadamCard key={c.kind} s={s} c={c} /> : <RacketCard key={c.kind} s={s} c={c} />))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-noir-700 bg-noir-800/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-lg font-semibold text-stone-100 tabular-nums">{value}</div>
      <div className="text-[11px] text-stone-500">{sub}</div>
    </div>
  );
}

/** "Which racket should I start?": the best three for right now, with reasons, and Start on the best. */
function WhichRacket({ s }: { s: GameState }) {
  const picks = whichRacket(s).slice(0, 3);
  return (
    <section className="rounded-md border border-gold-600/60 bg-gold-500/5 p-3" data-testid="which-racket">
      <div className="panel-title">Which racket should I start?</div>
      {!picks.length && <p className="text-xs text-stone-400 mt-1">Nothing you can start right now. The locked cards below say what each one needs.</p>}
      <ol className="mt-1 space-y-2">
        {picks.map((p, i) => (
          <li key={p.kind} className="text-xs">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-stone-100">{i + 1}. {CATALOG[p.kind].name}</span>
              <span className="text-stone-500">{fmt$(CATALOG[p.kind].cost)} to start</span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {p.reasons.map((r, j) => <span key={j} className={r.value > 0 ? 'chip-good' : r.value < 0 ? 'chip-bad' : 'chip-neutral'}>{r.label}</span>)}
            </div>
            {i === 0 && <div className="mt-1.5"><ActionCard s={s} action={{ kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind: p.kind } } }} compact /></div>}
          </li>
        ))}
      </ol>
    </section>
  );
}

const heatWord = (h: number) => (h >= 0.45 ? 'high' : h >= 0.25 ? 'some' : h > 0 ? 'low' : 'none');

function RacketCard({ s, c }: { s: GameState; c: HubCard }) {
  const g = PROP_GROUP_BY_ID[groupOfBiz(c.kind)];
  const status = c.owned.length ? `Running ×${c.owned.length}` : c.locks.length ? 'Locked' : 'Ready';
  const tier = c.owned.length ? Math.max(...c.owned.map((b) => racketOf(s, b).tier)) : -1;
  return (
    <article className="rounded-md border border-noir-700 bg-noir-800/60 p-3" data-testid="racket-card" data-kind={c.kind}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-stone-100">{g?.icon} {c.name}</div>
          <div className="text-xs text-stone-400 mt-0.5">{c.line}</div>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${c.owned.length ? 'bg-emerald-700/40 text-emerald-200' : c.locks.length ? 'bg-noir-700 text-stone-400' : 'bg-gold-500/20 text-gold-200'}`}>{status}</span>
      </header>
      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        <span className="chip-neutral">{fmt$(c.cost)} to start</span>
        <span className="chip-good">~{fmt$(c.inSeason)}/wk in season · {fmt$(c.offSeason)} off{c.byScore ? ' (average: big, rare scores)' : ''}</span>
        <span className="chip-neutral">upkeep {fmt$(c.upkeep)}/wk</span>
        <span className={c.heat >= 0.25 ? 'chip-bad' : 'chip-neutral'}>heat: {heatWord(c.heat)}</span>
        {c.fed > 0 && <span className={c.fed >= 0.1 ? 'chip-bad' : 'chip-neutral'}>federal: {c.fed >= 0.2 ? 'high' : c.fed >= 0.1 ? 'some' : 'low'}</span>}
        {c.men > 0 && <span className="chip-neutral">{c.men} m{c.men > 1 ? 'en' : 'an'} to run it</span>}
      </div>
      {c.pays && <div className="text-[11px] text-stone-500 mt-1">{c.pays}</div>}
      {c.ladder.length > 0 && (
        <ol className="mt-2 flex flex-wrap gap-1 text-[10px]" aria-label="Tier ladder">
          {c.ladder.map((st, i) => (
            <li key={st} className={`rounded border px-1.5 py-0.5 ${i < tier ? 'border-emerald-600 text-emerald-200' : i === tier ? 'border-gold-400 text-gold-200' : 'border-noir-600 text-stone-500'}`}>
              {i < tier ? '✓ ' : i === tier ? '→ ' : ''}{st}
            </li>
          ))}
        </ol>
      )}
      {c.locks.length > 0 && !c.owned.length && (
        <ul className="mt-2 space-y-0.5 text-[11px]" data-testid="racket-locks">
          {c.locks.map((l, i) => <li key={i}><span className="text-red-300">✗ {l.why}</span> <span className="text-stone-500">— {l.how}</span></li>)}
        </ul>
      )}
      {c.warns.map((w, i) => <div key={i} className="text-[11px] text-amber-300 mt-1">⚠ {w}</div>)}
      {c.laws.length > 0 && <div className="text-[11px] text-stone-400 mt-1">On the books: {c.laws.join(' · ')}</div>}
      {c.owned.map((b) => <Running key={b.id} s={s} b={b} />)}
      {c.start && !c.locks.length && <div className="mt-2"><ActionCard s={s} action={c.start} compact label={c.owned.length ? `Start another ${c.name.toLowerCase()}` : undefined} /></div>}
    </article>
  );
}

/** One racket you run: who runs it, the take, how it is run (the dials), the next step, the advice. */
function Running({ s, b }: { s: GameState; b: Business }) {
  const r = runningLine(s, b);
  const sum = racketSummary(s, b);
  const nxt = nextStep(s, b);
  const dials = dialsOf(b.kind);
  const advice = adviseDials(s, b).filter((a) => dialOf(s, b, a.dial.id) !== a.opt.id);
  const bo = racketOf(s, b).boost;
  return (
    <div className="mt-2 rounded border border-noir-700 bg-noir-900/50 p-2" data-testid="racket-running">
      <div className="flex flex-wrap justify-between gap-x-2 text-xs">
        <div className="text-stone-200 font-semibold">{b.name} <span className="text-stone-500 font-normal">· {r.district} · tier {stepsOf(s, b).length}</span></div>
        <div className={isOpen(s, b) ? 'text-gold-300 tabular-nums' : 'text-red-400'}>{isOpen(s, b) ? `~${fmt$(r.take)}/wk` : `padlocked to wk ${b.closedUntil}`}</div>
      </div>
      <div className="text-[11px] text-stone-400">
        {r.runner ? <>Run by <CharLink s={s} id={r.runner.id} /></> : <span className="text-amber-300">Nobody runs it: 40% speed</span>}
        {r.capo ? <> · under capo <CharLink s={s} id={r.capo.id} /></> : <> · no capo in {r.district}</>}
        {sum && <> · {sum}</>}
        {bo && bo.until > s.week && <> · <span className={bo.pct >= 0 ? 'text-emerald-300' : 'text-red-300'}>take {bo.pct > 0 ? '+' : ''}{bo.pct}% to wk {bo.until}</span></>}
      </div>
      {dials.map((d) => <DialRow key={d.id} s={s} b={b} dialId={d.id} />)}
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
        {nxt && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'upgrade', bizId: b.id } }} compact label={`Next step: ${nxt.name}`} />}
        {advice.length > 0 && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'racket', cmd: { c: 'advice', bizId: b.id } } }} compact label="Take your people's advice" />}
        {['bookmaking', 'vending', 'numbers', 'cargo'].includes(b.kind) && !collectPreview(s, b).why && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'collect', bizId: b.id } }} compact />}
      </div>
    </div>
  );
}

/** A standing decision as a row of choices: click one to set it this week. */
function DialRow({ s, b, dialId }: { s: GameState; b: Business; dialId: string }) {
  const { orders, queue, remove } = useOrders();
  const d = dialsOf(b.kind).find((x) => x.id === dialId)!;
  const cur = dialOf(s, b, d.id);
  const act = (opt: string): PlayerAction => ({ kind: 'econ', op: { type: 'racket', cmd: { c: 'dial', bizId: b.id, dial: d.id, opt } } });
  const qi = orders.findIndex((o) => o.kind === 'econ' && o.op.type === 'racket' && o.op.cmd.c === 'dial' && o.op.cmd.bizId === b.id && o.op.cmd.dial === d.id);
  const pending = qi >= 0 ? (orders[qi] as { op: { cmd: { opt: string } } }).op.cmd.opt : undefined;
  const sel = d.opts.find((o) => o.id === (pending ?? cur))!;
  return (
    <div className="mt-1.5" data-testid="racket-dial">
      <div className="text-[11px] text-stone-300"><span className="font-semibold">{d.name}</span> <span className="text-stone-500">— {d.ask}</span></div>
      <div className="mt-0.5 flex flex-wrap gap-1" role="radiogroup" aria-label={d.name}>
        {d.opts.map((o) => {
          const on = (pending ?? cur) === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} title={`${o.blurb} (${optEffects(o)})`}
              onClick={() => {
                if (qi >= 0) remove(qi);
                if (o.id !== cur) queue(act(o.id));
              }}
              className={`rounded border px-2 py-0.5 text-[11px] ${on ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>
              {o.label}{pending === o.id ? ' ✓' : ''}
            </button>
          );
        })}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
        <span className="text-stone-500">{sel.blurb}</span>
        <span className={sel.risk || (sel.heat ?? 0) > 0 ? 'chip-bad' : (sel.income ?? 0) > 0 || (sel.heat ?? 0) < 0 ? 'chip-good' : 'chip-neutral'}>{optEffects(sel)}</span>
        {pending && <span className="chip-neutral">changes when the week ends</span>}
      </div>
    </div>
  );
}

/** The Madam's arrangement: the family protects her network for a cut; she decides everything else. */
function MadamCard({ s, c }: { s: GameState; c: HubCard }) {
  const M = s.ears?.madam;
  const mc = M ? s.characters[M.id] : undefined;
  return (
    <article className="rounded-md border border-noir-700 bg-noir-800/60 p-3" data-testid="racket-card" data-kind="madam">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-stone-100">🕶 {c.name}</div>
          <div className="text-xs text-stone-400 mt-0.5">{c.line}</div>
        </div>
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-noir-700 text-stone-300">{M && M.cut > 0 ? 'Protection' : 'No cut'}</span>
      </header>
      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
        <span className="chip-good">{c.pays}</span>
        <span className={c.heat >= 0.1 ? 'chip-bad' : 'chip-neutral'}>vice heat: {M && M.cut >= 2 ? 'some' : M && M.cut ? 'low' : 'none'}</span>
      </div>
      {mc?.alive && <div className="text-[11px] text-stone-400 mt-1">The Madam: <CharLink s={s} id={mc.id} /> · {M!.house} · network {Math.round(M!.network)}</div>}
      {c.locks.map((l, i) => <div key={i} className="text-[11px] text-red-300 mt-1">✗ {l.why} <span className="text-stone-500">— {l.how}</span></div>)}
      {c.warns.map((w, i) => <div key={i} className="text-[11px] text-amber-300 mt-1">⚠ {w}</div>)}
      {mc?.alive && M && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {([0, 1, 2, 3] as CutTier[]).filter((t) => t !== M.cut && Math.abs(t - M.cut) === 1).map((t) => (
            <ActionCard key={t} s={s} action={{ kind: 'ears', op: { op: 'madamCut', tier: t } }} compact label={`${t > M.cut ? 'Ask for' : 'Ease to'} ${CUT_INFO[t].name.toLowerCase()}`} />
          ))}
        </div>
      )}
      <p className="text-[10px] text-stone-500 mt-1.5">More with her (calls, ventures, favors) in Town &amp; Law › The Night.</p>
    </article>
  );
}
