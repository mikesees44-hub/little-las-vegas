import { TrustToggle } from '../components/TrustToggle';
import { BUDGET_STEPS, setBudget, setCapoLevel, setLevel, type LtLevel } from '../../engine/lieutenants';
import { DelegationPicker } from './DelegationPicker';
import { setTrust } from '../../engine/briefing';
import { edictOrder, LEVEL_LABEL, LEVELS, splitOrder, standingOrders } from '../../engine/planner/orders';
import { setAutoBrief } from '../../engine/planner/state';
import { setGateRole } from '../../engine/planner/gate';
import type { GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';

type Act = (f: (s: GameState) => GameState, what: string) => void;

/**
 * STANDING ORDERS: one page, every rule he has set and delegated, editable here. Each control writes to the
 * system that owns it (lieutenants, the trusted advisors, the envelope's split, the edicts, the brief); the
 * split and the edicts are orders like anywhere else (they take hold when the week turns).
 */
export function StandingOrders({ s, act, onOrder }: { s: GameState; act: Act; onOrder: (a: PlayerAction) => void }) {
  const so = standingOrders(s);
  const sel = 'rounded border border-[#2a2118]/40 bg-[#fffaf0] px-1 py-0.5 text-[12px]';
  const row = 'flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[#2a2118]/20 py-1.5';
  const levelSel = (v: LtLevel, on: (l: LtLevel) => void, label: string, testid?: string) => (
    <select className={sel} value={v} onChange={(e) => on(e.target.value as LtLevel)} aria-label={label} data-testid={testid}>
      {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
    </select>
  );
  return (
    <div className="llv-paper-plain mx-auto max-w-[900px] rounded p-3 sm:p-5 text-[13px]" data-testid="standing-orders">
      <h3 className="font-display text-xl">Standing orders</h3>
      <p className="text-[12px] text-[#4a3b28]">Every rule you have set, in one place. Change one here and it is changed everywhere.</p>
      {!so.low && (
        <section className="mt-3">
          <h4 className="llv-brief-h">How much you hand off</h4>
          <div className="mt-1"><DelegationPicker s={s} act={act} paper /></div>
          <h4 className="llv-brief-h mt-2">Who handles what</h4>
          <ul className="mt-1">
            {so.domains.map((d) => (
              <li key={d.id} className={row} data-testid={`so-domain-${d.id}`}>
                <span className="min-w-0"><b>{d.name}</b> <span className="text-[11px] text-[#6b5a44]">· {d.seatName}</span><span className="block text-[11px] text-[#6b5a44]">{d.blurb}</span></span>
                {levelSel(d.level, (l) => act((x) => setLevel(x, d.id, l), `Standing order: ${d.name}: ${LEVEL_LABEL[l].toLowerCase()}`), d.name, `so-level-${d.id}`)}
              </li>
            ))}
            {so.budgets.map((b) => (
              <li key={b.seat} className={row}>
                <span><b>{b.name}</b> <span className="text-[11px] text-[#6b5a44]">may spend a week without asking</span></span>
                <select className={sel} value={b.amount} onChange={(e) => act((x) => setBudget(x, b.seat, Number(e.target.value)), `Standing order: the ${b.seat}'s budget is ${fmt$(Number(e.target.value))}`)} aria-label={`The ${b.seat}'s budget`}>
                  {BUDGET_STEPS.map((n) => <option key={n} value={n}>{fmt$(n)}</option>)}
                </select>
              </li>
            ))}
            {so.capos.map((c) => (
              <li key={c.id} className={row}>
                <span><b>{c.name}</b> <span className="text-[11px] text-[#6b5a44]">· his own crew</span></span>
                {levelSel(c.level, (l) => act((x) => setCapoLevel(x, c.id, l), `Standing order: ${c.name}: ${LEVEL_LABEL[l].toLowerCase()}`), c.name)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {so.door.length > 0 && (
        <section className="mt-3" data-testid="so-door">
          <h4 className="llv-brief-h">Who keeps your door</h4>
          <p className="text-[11.5px] text-[#6b5a44]">The gatekeeper ranks who gets in to see you, writes the bookings in your datebook and sets the place and the hour of a meet. You can still book anybody yourself.</p>
          <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Who keeps your door">
            {so.door.map((r) => (
              <button key={r.role} type="button" role="radio" aria-checked={r.on} disabled={!!r.block && !r.on} title={r.block}
                className={`llv-ink-btn ${r.on ? 'llv-ink-btn-primary' : ''} disabled:opacity-50`}
                onClick={() => act((x) => setGateRole(x, r.role), `Standing order: ${r.name ?? r.label.toLowerCase()} keeps your door`)} data-testid={`so-door-${r.role}`}>
                {r.label.replace('Your ', '').replace(/^./, (c) => c.toUpperCase())}{r.name ? <span className="ml-1 text-[11px] opacity-80">· {r.name}</span> : null}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11.5px]" data-testid="so-door-now">At the door now: <b>{so.keeper}</b>{so.door.find((r) => r.on)?.block ? ` (${so.door.find((r) => r.on)!.block!.toLowerCase()}, so the next seat keeps it)` : ''}.</p>
        </section>
      )}
      {so.advisors.length > 0 && (
        <section className="mt-3">
          <h4 className="llv-brief-h">Small stuff: does he ask you, or handle it himself?</h4>
          <ul>
            {so.advisors.map((a) => (
              <li key={a.key} className={`${row} flex-col !items-stretch gap-1`}>
                <span><b>{a.name}</b> <span className="text-[11px] text-[#6b5a44]">· {a.title}</span></span>
                <TrustToggle name={a.name} on={a.on} onChange={(v) => act((x) => setTrust(x, a.key, v), v ? `Standing order: ${a.name} handles his small stuff himself` : `Standing order: ${a.name} asks you first`)} testId={`so-trust-${a.key}`} paper />
              </li>
            ))}
          </ul>
        </section>
      )}
      {!so.low && (
        <section className="mt-3">
          <h4 className="llv-brief-h">The envelope</h4>
          <div className={row}>
            <span><b>Your cut</b> <span className="block text-[11px] text-[#6b5a44]">{so.split.text}{so.split.auto ? '. Quiet weeks go by this split without a meeting.' : '. He brings the envelope every Monday.'}</span></span>
            <span className="flex items-center gap-1.5">
              <select className={sel} value={so.split.personal} onChange={(e) => onOrder(splitOrder(s, Number(e.target.value)))} aria-label="Your cut" data-testid="so-cut">
                {[...new Set([10, 20, 30, 40, 50, 60, so.split.personal])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}%</option>)}
              </select>
              <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={so.split.auto} onChange={(e) => onOrder(splitOrder(s, so.split.personal, e.target.checked))} /> Quiet weeks by it</label>
            </span>
          </div>
        </section>
      )}
      {so.edicts.length > 0 && (
        <section className="mt-3">
          <h4 className="llv-brief-h">The rules of the house</h4>
          <ul>
            {so.edicts.map((e) => (
              <li key={e.id} className={row} data-testid={`so-edict-${e.id}`}>
                <span className="min-w-0 flex-1"><b>{e.name}</b><span className="block text-[11px] text-[#6b5a44]">{e.text}</span></span>
                <button type="button" className={`llv-ink-btn ${e.on ? 'llv-ink-btn-primary' : ''}`} aria-pressed={e.on} onClick={() => onOrder(edictOrder(e.id, !e.on))}>{e.on ? 'In force' : 'Lay it down'}</button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-[#6b5a44]">The cut and the rules are orders: they take hold when the week turns.</p>
        </section>
      )}
      <section className="mt-3">
        <h4 className="llv-brief-h">The morning brief</h4>
        <label className={`${row} cursor-pointer`}>
          <span>{so.low ? 'Your capo\'s word' : 'The brief'} waits on the desk at the morning's first stop</span>
          <input type="checkbox" checked={so.brief} onChange={(e) => act((x) => setAutoBrief(x, e.target.checked), e.target.checked ? 'Standing order: the brief each morning' : 'Standing order: no brief unless you ask')} data-testid="so-brief" />
        </label>
      </section>
    </div>
  );
}
