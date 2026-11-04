import { useState } from 'react';
import {
  buyOdds, caseCount, caseMargin, easyWeekly, envelope, FRONTS, leverOn, ocStatus, raidOdds, ROUTES, runners, seizeOdds, supplies, UP_ORDER, UPS,
  type OcAction, type OcFront, type OcRoute,
} from '../../engine/oceanCity';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { fmt$ } from '../format';
import { DoneMark } from '../components/Layout';

/**
 * OCEAN CITY, THE DRY TOWN (engine/oceanCity.ts): one panel, three parts —
 * the run over the bridge, the speakeasy, the commissioner — each with one
 * order card (the odds on it, settled the moment it is given). Lives in the
 * Rackets hub (My Operations) and on the Ocean City visit screen.
 */
const pct = (p: number) => `${Math.round(p * 100)}%`;

export function OceanCityPanel({ s, open: open0 = false }: { s: GameState; open?: boolean }) {
  const o = s.oc;
  const [open, setOpen] = useState(open0 || !!(o?.run || o?.easy));
  const sups = supplies(s);
  const men = runners(s);
  const [route, setRoute] = useState<OcRoute>(o?.run?.route ?? 'causeway');
  const [supply, setSupply] = useState<string>(o?.run?.supply ?? sups[0]?.id ?? '');
  const [runner, setRunner] = useState<string>(o?.run?.runner ?? men.find((m) => m.id !== s.playerId)?.id ?? s.playerId);
  const [front, setFront] = useState<OcFront>('fountain');
  const todo = UP_ORDER.filter((u) => !o?.easy?.ups.includes(u));
  const [up, setUp] = useState(todo[0]);
  const ups = up && todo.includes(up) ? up : todo[0];
  const pols: { op: OcAction['op']; label: string }[] = [
    { op: 'buy', label: `Put him on an envelope (${pct(buyOdds(s).p)})` },
    { op: leverOn(s) ? 'squeeze' : 'dig', label: leverOn(s) ? 'Squeeze him with what you have' : 'Find out what he hides' },
    { op: 'vote', label: 'Back a "wet" referendum' },
  ];
  const [pol, setPol] = useState<OcAction['op']>('buy');
  const polOp = pols.some((p) => p.op === pol) ? pol : pols[0].op;
  const odds = o?.run ? seizeOdds(s, o.run.route) : seizeOdds(s, route);
  const raid = raidOdds(s);
  return (
    <section className="llv-card-box llv-card-plain llv-d-shore llv-dom-edge llv-dom-tint space-y-2" data-testid="ocean-city" data-domain="shore">
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => setOpen((x) => !x)} aria-expanded={open} data-testid="oc-toggle">
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-[0.3em] text-stone-500">Over the bridge</span>
          <span className="block font-display text-lg leading-tight llv-dom-ink">Ocean City: the dry town</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {(['run', 'easy', 'bought'] as const).filter((k) => (k === 'bought' ? o?.stance === 'bought' || o?.stance === 'wet' : !!o?.[k])).length > 0 && (
            <span className="hidden sm:inline text-[11px] text-emerald-300">{[o?.run && 'run', o?.easy && 'speakeasy', (o?.stance === 'bought' || o?.stance === 'wet') && 'commissioner'].filter(Boolean).join(' · ')}</span>
          )}
          <span className="llv-menu-btn h-7">{open ? 'Close ▴' : 'Open ▾'}</span>
        </span>
      </button>
      <p className="llv-prose text-stone-400" data-testid="oc-status">{ocStatus(s)}</p>
      {open && (
        <div className="space-y-3">
          {/* The run */}
          <div className={`llv-card-box ${o?.run ? 'llv-card-done' : 'llv-card-plain'} space-y-1.5`} data-testid="oc-run">
            <PartHead n={1} title="The run" done={o?.run ? 'Running' : undefined} />
            {o?.run ? (
              <p className="text-[12px] text-stone-300">
                {ROUTES[o.run.route].label}, run by {o.run.runner === s.playerId ? 'you' : s.characters[o.run.runner]?.firstName ?? '?'}: ~{caseCount(s, o.run.route)} cases a week at {fmt$(caseMargin(s))}. {fmt$(o.run.earned)} so far, {o.run.seized} load{o.run.seized === 1 ? '' : 's'} seized. Seized {pct(odds.p)} of weeks ({odds.reasons.slice(0, 3).map((r) => `${r.label} ${r.value >= 0 ? '+' : ''}${r.value}`).join(', ')}).
              </p>
            ) : (
              <p className="text-[12px] text-stone-400">Cases from a bar or distributor of yours, over the bridge into a town that cannot buy a drink. The Season pays three times the winter.</p>
            )}
            {sups.length === 0 ? <p className="text-[12px] text-amber-300">You need a bar, a club or the untaxed-liquor racket to supply it.</p> : (
              <div className="flex flex-wrap gap-2 text-[12px]">
                <select aria-label="Route" className="inp text-xs" value={route} onChange={(e) => setRoute(e.target.value as OcRoute)} data-testid="oc-route">
                  {(Object.keys(ROUTES) as OcRoute[]).map((r) => <option key={r} value={r}>{ROUTES[r].label}</option>)}
                </select>
                <select aria-label="Supply" className="inp text-xs" value={supply} onChange={(e) => setSupply(e.target.value)}>
                  {sups.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select aria-label="Runner" className="inp text-xs" value={runner} onChange={(e) => setRunner(e.target.value)} data-testid="oc-runner">
                  {men.map((m) => <option key={m.id} value={m.id}>{m.id === s.playerId ? 'You run it' : `${m.firstName} ${m.lastName} (capo)`}</option>)}
                </select>
              </div>
            )}
            {sups.length > 0 && <ActionCard s={s} action={{ kind: 'oc', op: { op: 'run', route, supply: supply || sups[0].id, runner } }} compact />}
            {o?.run && <ActionCard s={s} action={{ kind: 'oc', op: { op: 'stopRun' } }} compact />}
          </div>

          {/* The speakeasy */}
          <div className={`llv-card-box ${o?.easy && !(o.easy.closedUntil && o.easy.closedUntil > s.week) ? 'llv-card-done' : o?.easy ? 'llv-card-danger' : 'llv-card-plain'} space-y-1.5`} data-testid="oc-easy">
            <PartHead n={2} title="The speakeasy" done={o?.easy && !(o.easy.closedUntil && o.easy.closedUntil > s.week) ? 'Open' : undefined} />
            {o?.easy ? (
              <>
                <p className="text-[12px] text-stone-300">
                  {o.easy.name}{o.easy.closedUntil && o.easy.closedUntil > s.week ? <span className="text-red-300"> — closed for {o.easy.closedUntil - s.week} more week{o.easy.closedUntil - s.week === 1 ? '' : 's'}</span> : <> — ~{fmt$(easyWeekly(s))} a week</>}. {o.easy.ups.length ? `Has ${o.easy.ups.map((u) => UPS[u].label.toLowerCase()).join(', ')}. ` : ''}A raid {pct(raid.p)} of weeks ({raid.reasons.slice(0, 3).map((r) => `${r.label} ${r.value >= 0 ? '+' : ''}${r.value}`).join(', ')}).
                </p>
                {ups && (
                  <>
                    <select aria-label="Upgrade" className="inp text-xs" value={ups} onChange={(e) => setUp(e.target.value as typeof ups)} data-testid="oc-up">
                      {todo.map((u) => <option key={u} value={u}>{UPS[u].label}</option>)}
                    </select>
                    <ActionCard s={s} action={{ kind: 'oc', op: { op: 'upgrade', up: ups } }} compact />
                  </>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 text-[12px] text-stone-300">
                  {(Object.keys(FRONTS) as OcFront[]).map((f) => <label key={f} title={FRONTS[f].text}><input type="radio" checked={front === f} onChange={() => setFront(f)} /> {FRONTS[f].label}</label>)}
                </div>
                <ActionCard s={s} action={{ kind: 'oc', op: { op: 'build', front } }} compact />
              </>
            )}
          </div>

          {/* The commissioner */}
          <div className={`llv-card-box ${o?.stance === 'bought' || o?.stance === 'wet' ? 'llv-card-done' : 'llv-card-plain'} space-y-1.5`} data-testid="oc-batten">
            <PartHead n={3} title="Commissioner Batten and the Camp Meeting board" done={o?.stance === 'wet' ? 'The town went wet' : o?.stance === 'bought' ? 'On the envelope' : undefined} />
            {o?.vote && <p className="text-[12px] text-amber-200" data-testid="oc-vote">The wet referendum: support {o.vote.support}% (it wins on about those odds), {o.vote.ends - s.week} week{o.vote.ends - s.week === 1 ? '' : 's'} to the vote.</p>}
            {o?.stance === 'bought' && <p className="text-[12px] text-stone-400">He takes {fmt$(envelope(s))} a week.</p>}
            {o?.stance !== 'wet' && (
              <>
                <select aria-label="The commissioner" className="inp text-xs" value={polOp} onChange={(e) => setPol(e.target.value as OcAction['op'])} data-testid="oc-pol">
                  {pols.map((p) => <option key={p.op} value={p.op}>{p.label}</option>)}
                </select>
                <ActionCard s={s} action={{ kind: 'oc', op: { op: polOp } as OcAction }} compact />
              </>
            )}
          </div>

          {o?.log.length ? (
            <ul className="border-t border-noir-700 pt-2 text-[11.5px] text-stone-500 space-y-0.5" data-testid="oc-log">
              {o.log.slice(-4).reverse().map(([w, t], i) => <li key={i}>Week {w}: {t}</li>)}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** One part of the Ocean City panel: a number, the title, and the done mark once it is up and running. */
function PartHead({ n, title, done }: { n: number; title: string; done?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gold-600/60 text-[11px] font-semibold text-gold-300">{n}</span>
      <h5 className="min-w-0 flex-1 text-[13px] font-semibold leading-tight text-stone-100">{title}</h5>
      {done && <DoneMark>{done}</DoneMark>}
    </div>
  );
}
