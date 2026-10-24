import type { HQKind } from '../../engine/econState';
import { bugOdds, HQ_INFO, hqRestaurants, talkers } from '../../engine/hq';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';
import { Stat } from './Holdings';

/** Headquarters: where business gets done, and whether anyone else is listening. */
export function HQPanel({ s }: { s: GameState }) {
  const hq = s.econ?.hq;
  if (!hq) return null;
  const info = HQ_INFO[hq.kind];
  const where = hq.kind === 'restaurant' ? `the back of ${s.businesses.find((b) => b.id === hq.bizId)?.name ?? 'a restaurant'}` : info.name.toLowerCase();
  const odds = bugOdds(s);
  const rest = hqRestaurants(s);
  return (
    <div className="space-y-4" data-testid="hq-panel">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Headquarters" value={info.name} sub={`since week ${hq.since}`} />
        <Stat label="Bug risk" value={`${(odds * 100).toFixed(1)}%/wk`} sub={`federal heat ${s.heat.federal}`} warn={odds > 0.01} />
        <Stat label="Sweeps" value={`${hq.sweeps}`} sub={hq.lastSweep ? `last week ${hq.lastSweep}` : 'never swept'} />
        <Stat label="Bugs found" value={`${hq.found}`} sub="all time" />
      </section>
      <div className="rounded-md border border-noir-700 bg-noir-800/50 p-3 text-sm">
        <div className="text-stone-200">Business gets done in {where}.</div>
        <p className="text-xs text-stone-400 mt-1">{info.blurb}</p>
        {hq.rumor ? <p className="text-xs text-amber-300 mt-2">⚠ {hq.rumor}</p> : <p className="text-xs text-stone-500 mt-2">Nothing out of the ordinary. That you know of.</p>}
        <div className="text-xs text-stone-400 mt-2">
          Who talks here (and would be on any tape):{' '}
          {talkers(s).map((c, i) => <span key={c.id}>{i ? ', ' : ''}<CharLink s={s} id={c.id} /> <span className="text-stone-500">(file {Math.round(c.evidence ?? 0)})</span></span>)}
        </div>
        <p className="text-[11px] text-stone-500 mt-2">The Feds get a bug in through a technician (before 1968), a wiretap warrant (from 1968), or an informant who tells them where to put it. While it is there, every man who talks business here adds to his own evidence file each week.</p>
      </div>
      <section>
        <div className="panel-title">Counter-measures</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ActionCard s={s} action={{ kind: 'econ', op: { type: 'sweep' } }} />
          {(['social', 'car', 'walk'] as HQKind[]).map((k) => <ActionCard key={k} s={s} action={{ kind: 'econ', op: { type: 'hq', kind: k } }} />)}
          {rest.slice(0, 3).map((b) => <ActionCard key={b.id} s={s} action={{ kind: 'econ', op: { type: 'hq', kind: 'restaurant', bizId: b.id } }} />)}
        </div>
      </section>
    </div>
  );
}
