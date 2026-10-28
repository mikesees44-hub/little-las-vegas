import { useMemo, useState } from 'react';
import { previewAction } from '../../engine/actions';
import { applicants, summerHelpers, type Applicant } from '../../engine/applicants';
import type { Candidate } from '../../engine/candidates';
import { CASH_DISCOUNT, CASH_SHARES, dealView, MAX_HAGGLES, type DealManager, type DealTarget, type DealTerms } from '../../engine/deals';
import { SIGN_HEX, STYLES, suggestNames, type BuildStyle, type SignColor } from '../../engine/design';
import type { GameState, PlayerAction } from '../../engine/types';
import { CandidatePicker } from '../clarity/CandidatePicker';
import { Chips } from '../components/Chips';
import { Modal } from '../components/Modal';
import { AcceptanceLine, useOrders } from '../components/Orders';
import { fmt$ } from '../format';
import { timeBlock } from '../../engine/timeCost';
import { useEmpire } from '../empire/context';
import { BIZ_CONCEPT, USE_CONCEPT } from '../../engine/empire';

/**
 * The Deal window: buying a place is signing a contract with a named seller.
 * Terms (pay, haggle, cash under the table, walk away) → who runs it (the
 * applicants who asked, the crew's ranked picks, a local hire) → the name and
 * the look → the signature. Signing queues one order; the money moves, by
 * name, when the week turns.
 */

type Step = 'terms' | 'runs' | 'look' | 'sign';
const STEPS: { id: Step; label: string }[] = [
  { id: 'terms', label: 'The terms' },
  { id: 'runs', label: 'Who runs it' },
  { id: 'look', label: 'Name & look' },
  { id: 'sign', label: 'Sign' },
];

function Initials({ name, shady }: { name: string; shady: boolean }) {
  const ini = name.split(' ').map((x) => x[0]).join('').slice(0, 2);
  return (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg ${shady ? 'border-blood-400 bg-noir-900 text-blood-300' : 'border-gold-500 bg-noir-900 text-gold-300'}`} aria-hidden>
      {ini}
    </div>
  );
}

function Bar({ v, label }: { v: number; label: string }) {
  const color = v >= 70 ? 'bg-emerald-500' : v >= 45 ? 'bg-gold-500' : 'bg-blood-400';
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-stone-500" title={`${label}: ${v}/100`}>
      <span className="w-12 shrink-0 uppercase tracking-wider">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-noir-700"><div className={`h-full ${color}`} style={{ width: `${v}%` }} /></div>
      <span className="w-6 text-right tabular-nums text-stone-300">{v}</span>
    </div>
  );
}

function ApplicantCard({ a, picked, onPick }: { a: Applicant; picked: boolean; onPick: () => void }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-md border p-2.5 ${picked ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/60'}`} data-testid="applicant">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 text-sm font-semibold text-stone-100 break-words">{a.name}</div>
        <div className="shrink-0 text-[10px] uppercase tracking-wider text-stone-500">{a.relation}</div>
      </div>
      <div className="text-[12px] italic leading-snug text-gold-200">"{a.pitch}"</div>
      <Bar v={a.work.time} label="Time" />
      <Bar v={a.work.energy} label="Energy" />
      <div className="flex flex-wrap gap-1 text-[11px]">
        <span className="chip-neutral">Business {a.skill}</span>
        <span className={a.loyalty >= 60 ? 'chip-good' : a.loyalty < 40 ? 'chip-bad' : 'chip-neutral'}>Loyalty {a.loyalty}</span>
        <span className={a.skim === 'low' ? 'chip-good' : a.skim === 'high' ? 'chip-bad' : 'chip-neutral'}>Skim risk: {a.skim}</span>
        {a.work.effort < 0.9 && <span className="chip-bad">Runs it at {Math.round(a.work.effort * 100)}%</span>}
      </div>
      {(a.work.jobs.length > 0 || a.work.tired.length > 0) && <div className="text-[11px] text-stone-500">{[...a.work.jobs, ...a.work.tired].join(' · ')}</div>}
      <button type="button" className={picked ? 'btn-ghost mt-auto w-full py-1 text-xs' : 'btn-gold mt-auto w-full py-1 text-xs'} onClick={onPick} data-testid="pick-applicant">{picked ? 'Chosen' : 'Give it to ' + a.name.split(' ')[0]}</button>
    </div>
  );
}

/** The signature queues the purchase, already confirmed (playtest bug #6: a hidden confirm dropped it). */
export function signDeal(s: GameState, action: PlayerAction, api: { queue: (a: PlayerAction, confirmed?: boolean) => void; later?: (a: PlayerAction) => void }): 'queued' | 'tomorrow' {
  if (api.later && timeBlock(s, action)) { api.later(action); return 'tomorrow'; }
  api.queue(action, true);
  return 'queued';
}

const mgrId = (m: DealManager | undefined): string | undefined => (!m ? undefined : 'keep' in m ? 'keep' : m.source === 'pro' ? `pro:${m.pro ?? 0}` : m.charId);

export function DealWindow({ s, target, onClose }: { s: GameState; target: DealTarget; onClose: () => void }) {
  const { queue, later } = useOrders();
  const empire = useEmpire();
  const [step, setStep] = useState<Step>('terms');
  const [terms, setTerms] = useState<DealTerms>({ haggles: 0, cash: 0 });
  const [signed, setSigned] = useState(false);
  const v = useMemo(() => dealView(s, target, terms), [s, target, terms]);
  const action: PlayerAction = { kind: 'econ', op: { type: 'deal', target, terms } };
  const p = useMemo(() => previewAction(s, action), [s, JSON.stringify(action)]); // eslint-disable-line react-hooks/exhaustive-deps
  const aps = useMemo(() => (v.runs ? applicants(s, v.mgrKey) : []), [s, v.runs, v.mgrKey]);
  const names = useMemo(() => suggestNames(s, target), [s, target]);
  const helpers = useMemo(() => summerHelpers(s), [s]);
  const role = useMemo(() => ({ kind: 'manager' as const, key: v.mgrKey, base: v.take, place: v.place }), [v.mgrKey, v.take, v.place]);
  const set = (x: Partial<DealTerms>) => setTerms((t) => ({ ...t, ...x }));
  const picked = mgrId(terms.mgr);
  const pickCandidate = (c: Candidate) => {
    const op = c.action?.kind === 'econ' && c.action.op.type === 'manager' ? c.action.op : undefined;
    if (!op) return;
    set({ mgr: op.source === 'pro' ? { source: 'pro', pro: op.pro } : { source: op.source, charId: op.charId } });
  };
  const sign = () => {
    if (p.disabledReason) return;
    // Signing is the confirmation: the order goes straight into the tray (no second "Are you sure?"
    // hiding behind the congratulations). Not enough hours left today: the deal closes tomorrow.
    signDeal(s, action, { queue, later });
    setSigned(true);
  };
  const mgrName = !terms.mgr ? undefined : 'keep' in terms.mgr ? v.oldOwner : p.effects.find((e) => e.type === 'econ' && e.op.op === 'note' && e.op.text.endsWith(' runs it'));
  const mgrLabel = typeof mgrName === 'string' ? mgrName : mgrName && mgrName.type === 'econ' && mgrName.op.op === 'note' ? mgrName.op.text.replace(/ runs it$/, '') : undefined;

  if (signed) {
    return (
      <Modal onClose={onClose}>
        <div className="space-y-3 p-5" data-testid="deal-signed">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{v.where}</div>
          <div className="font-display text-2xl text-gold-300">{terms.name || v.place}</div>
          <p className="deal-beat text-sm leading-relaxed text-stone-300" style={{ animationDelay: '0ms' }}>
            The pen scratches twice. {v.seller.name} blots the ink, folds {v.seller.shady ? 'the paper into an envelope that never sees a lawyer' : 'the deed into thirds'}, and slides it across the desk.
          </p>
          {terms.cash > 0 && v.cashPart > 0 && <p className="deal-beat text-sm text-stone-400" style={{ animationDelay: '500ms' }}>A second envelope goes the other way, thick with twenties. Nobody counts it in front of you.</p>}
          <p className="deal-beat text-sm text-stone-300" style={{ animationDelay: '900ms' }}>{v.soured ? 'There is no handshake.' : 'A handshake, dry and brief.'}</p>
          <p className="deal-beat font-display text-lg italic text-gold-200" style={{ animationDelay: '1300ms' }}>{v.seller.lastLine(v.soured, v.cashPart)}</p>
          {mgrLabel && <p className="deal-beat text-sm text-stone-400" style={{ animationDelay: '1700ms' }}>Monday morning, {mgrLabel} has the keys.</p>}
          <p className="text-[11px] text-stone-500">The money changes hands when the week turns. Every dollar shows in the weekly report.</p>
          {(() => {
            const lot = target.kind === 'lot' ? s.econ?.lots.find((l) => l.id === target.lotId) : undefined;
            const lodging = target.kind === 'biz' ? !!BIZ_CONCEPT[target.biz] : !!lot && (!lot.use || lot.use === 'motel' || lot.use === 'boarding' || !!USE_CONCEPT[lot.use]);
            if (!lodging) return <div className="flex justify-end"><button type="button" className="btn-gold" onClick={onClose}>Close</button></div>;
            const key = target.kind === 'lot' ? `lot:${target.lotId}` : `biz:${target.biz}:${target.district}`;
            const go = () => { onClose(); empire.open({ pending: { key, name: terms.name || v.place, develop: lot && !lot.use ? { lotId: lot.id } : undefined } }); };
            return (
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={onClose}>Later</button>
                <button type="button" className="btn-gold" onClick={go} data-testid="open-designer">Set it up in the Designer →</button>
              </div>
            );
          })()}
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5 space-y-3" data-testid="deal-window">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Contract of sale · {v.where}</div>
            <div className="font-display text-xl sm:text-2xl text-gold-300 break-words">{v.place}</div>
          </div>
          <button type="button" className="btn-ghost shrink-0 text-xs" onClick={onClose} data-testid="walk-away">Walk away</button>
        </div>

        <nav className="flex flex-wrap gap-1" aria-label="Deal steps">
          {STEPS.map((x, i) => (
            <button key={x.id} type="button" className={`tab text-xs ${step === x.id ? 'tab-active' : ''}`} onClick={() => setStep(x.id)} aria-current={step === x.id}>
              {i + 1}. {x.label}
            </button>
          ))}
        </nav>

        {/* The seller across the desk */}
        <div className="flex gap-3 rounded-md border border-noir-700 bg-noir-900/70 p-3">
          <Initials name={v.seller.name} shady={v.seller.shady} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-stone-100">{v.seller.name} <span className="font-normal text-stone-500">· {v.seller.role}</span></div>
            {v.seller.forWhom && <div className="text-[11px] text-stone-500">Selling for {v.seller.forWhom}</div>}
            <div className="text-[12px] italic leading-snug text-stone-300">{v.seller.line}</div>
          </div>
        </div>

        {step === 'terms' && (
          <div className="space-y-3" data-testid="deal-terms">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Figure label="Asking" value={fmt$(v.asking)} />
              <Figure label="Agreed" value={fmt$(v.agreed)} tone={v.agreed < v.asking ? 'good' : v.agreed > v.asking ? 'bad' : undefined} />
              <Figure label="You pay" value={fmt$(v.price)} tone={v.price < v.asking ? 'good' : v.price > v.asking ? 'bad' : undefined} />
              <Figure label="Family money" value={fmt$(s.money)} tone={s.money < v.price ? 'bad' : undefined} />
            </div>
            {v.rounds.map((r, i) => (
              <div key={i} className={`rounded border px-3 py-2 text-sm ${r.ok ? 'border-emerald-700/60 bg-emerald-900/20' : 'border-blood-500/60 bg-blood-900/20'}`} data-testid="haggle-round">
                <div className={r.ok ? 'text-emerald-300' : 'text-red-300'}>
                  {r.ok ? `You lean on the number. ${v.seller.name.split(' ')[0]} gives a little: ${fmt$(r.price)}.` : `${v.seller.name.split(' ')[0]} goes cold. The price goes up to ${fmt$(r.price)}, and that's the end of the haggling.`}
                </div>
                <AcceptanceLine a={{ chance: r.chance, reasons: r.reasons }} prefix={`Haggle ${i + 1}`} />
              </div>
            ))}
            <div className="rounded-md border border-noir-700 bg-noir-800/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-stone-200">Haggle</div>
                <button type="button" className="btn-gold text-xs" disabled={!v.next} onClick={() => set({ haggles: Math.min(MAX_HAGGLES, terms.haggles + 1) })} data-testid="haggle">
                  {v.next ? `Push on the price (${Math.round(v.next.chance * 100)}%)` : v.soured ? `${v.seller.female ? 'She' : 'He'} won't move again` : 'You\'ve pushed enough'}
                </button>
              </div>
              {v.next && <AcceptanceLine a={v.next} prefix="Odds he gives" />}
              {v.next && <div className="mt-1 text-[11px] text-stone-500">Works: {terms.haggles === 0 ? '10%' : '6%'} off. Fails: the price goes up 5% and the seller is sour{v.seller.shady ? '' : ' (word gets around the neighborhood)'}.</div>}
            </div>
            <div className="rounded-md border border-noir-700 bg-noir-800/60 p-3">
              <div className="text-sm text-stone-200">Cash under the table</div>
              {v.cashBlock ? <div className="text-[12px] text-stone-400">{v.cashBlock}.</div> : (
                <>
                  <div className="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label="Cash share">
                    {CASH_SHARES.map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={terms.cash === c} className={`rounded border px-2 py-1 text-xs ${terms.cash === c ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`} onClick={() => set({ cash: c })} data-testid={`cash-${c}`}>
                        {c === 0 ? 'All on the books' : `${c * 100}% in cash`}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 text-[11px] text-stone-500">The seller knocks {CASH_DISCOUNT * 100}% off the part he never declares. It comes out of your unwashed cash first — and a property bought with cash the books can't explain is what the IRS looks for{terms.cash > 0 ? ` (federal heat +${v.fedHeat})` : ''}.</div>
                  {terms.cash > 0 && <div className="mt-1 text-[12px] text-stone-300">{fmt$(v.booksPart)} on the books · {fmt$(v.cashPart)} in an envelope</div>}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={onClose}>Walk away</button>
              <button type="button" className="btn-gold text-xs" onClick={() => setStep('runs')} data-testid="next-runs">Agree to {fmt$(v.price)} →</button>
            </div>
          </div>
        )}

        {step === 'runs' && (
          <div className="space-y-3" data-testid="deal-runs">
            {!v.runs ? <p className="text-sm text-stone-400">{v.runsWhy}</p> : (
              <>
                <div>
                  <div className="font-display text-base text-gold-400">They asked for it</div>
                  {aps.length ? (
                    <div className="mt-1 grid gap-2 sm:grid-cols-2" data-testid="applicants">
                      {aps.map((a) => <ApplicantCard key={a.charId} a={a} picked={picked === a.charId} onPick={() => set({ mgr: { source: a.family ? 'family' : 'crew', charId: a.charId } })} />)}
                    </div>
                  ) : <p className="text-xs text-stone-500">Nobody came to you about this one.</p>}
                  {aps.length > 0 && <p className="mt-1 text-[11px] text-stone-500">Whoever asked and doesn't get it will take it a little personally.</p>}
                </div>
                {v.oldOwner && (
                  <button type="button" className={`w-full rounded border px-3 py-2 text-left text-sm ${picked === 'keep' ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/60'}`} onClick={() => set({ mgr: { keep: true } })} data-testid="keep-owner">
                    Keep {v.oldOwner} on to run it <span className="text-stone-500">— knows the place; you don't know his books</span>
                  </button>
                )}
                <CandidatePicker s={s} role={role} onPick={pickCandidate} selected={picked ? [picked] : []} limit={4} hideAdvisors />
                {helpers.length > 0 && <p className="text-[11px] text-stone-500">{helpers.map((h) => h.firstName).join(' and ')} {helpers.length > 1 ? 'are' : 'is'} too young to run anything — at most {helpers.length > 1 ? 'they' : 'one'} can help out in the summers.</p>}
                <button type="button" className={`text-xs ${!terms.mgr ? 'text-gold-300' : 'text-stone-500 hover:text-stone-300'}`} onClick={() => set({ mgr: undefined })}>{!terms.mgr ? '✓ ' : ''}Nobody yet: the crew and the counter staff run it the old way</button>
              </>
            )}
            <div className="flex justify-between gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={() => setStep('terms')}>← Terms</button>
              <button type="button" className="btn-gold text-xs" onClick={() => setStep('look')} data-testid="next-look">Name & look →</button>
            </div>
          </div>
        )}

        {step === 'look' && (
          <div className="space-y-3" data-testid="deal-look">
            <label className="block text-sm text-stone-200">
              The name on the sign
              <input className="mt-1 w-full rounded border border-noir-600 bg-noir-900 p-2 text-sm text-stone-100" maxLength={40} placeholder={v.place} value={terms.name ?? ''} onChange={(e) => set({ name: e.target.value })} data-testid="deal-name" />
            </label>
            <div className="flex flex-wrap gap-1">
              {names.map((n) => <button key={n} type="button" className="chip-neutral hover:border-gold-500" onClick={() => set({ name: n })}>{n}</button>)}
            </div>
            <div>
              <div className="text-sm text-stone-200">The look</div>
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                {(Object.keys(STYLES) as BuildStyle[]).filter((k) => (STYLES[k].from ?? 0) <= s.date.y).map((k) => (
                  <button key={k} type="button" className={`rounded border p-2 text-left ${terms.style === k ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/60 hover:border-gold-600'}`} onClick={() => set({ style: terms.style === k ? undefined : k })}>
                    <div className="text-sm text-stone-100">{STYLES[k].name}</div>
                    <div className="text-[11px] text-stone-500">{STYLES[k].blurb}</div>
                    <div className="text-[11px] text-emerald-300">{STYLES[k].draw ? `Draw +${Math.round(STYLES[k].draw * 100)}%` : 'No extra draw'}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-stone-200">The neon</div>
              <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Sign color">
                {(Object.keys(SIGN_HEX) as SignColor[]).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={terms.sign === c} aria-label={c} title={c} className={`h-7 w-7 rounded-full border-2 ${terms.sign === c ? 'border-white' : 'border-noir-600'}`} style={{ background: SIGN_HEX[c], boxShadow: terms.sign === c ? `0 0 10px ${SIGN_HEX[c]}` : undefined }} onClick={() => set({ sign: c })} />
                ))}
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={() => setStep('runs')}>← Who runs it</button>
              <button type="button" className="btn-gold text-xs" onClick={() => setStep('sign')} data-testid="next-sign">To the signature →</button>
            </div>
          </div>
        )}

        {step === 'sign' && (
          <div className="space-y-3" data-testid="deal-sign">
            <div className="rounded-md border border-gold-700/50 bg-[#efe6d2] p-4 font-serif text-stone-900 shadow-inner">
              <div className="text-center text-[11px] uppercase tracking-[0.3em] text-stone-600">Agreement of sale</div>
              <p className="mt-2 text-sm leading-relaxed">
                {v.seller.name}{v.seller.forWhom ? `, for ${v.seller.forWhom},` : ''} agrees to sell <b>{terms.name || v.place}</b> ({v.where}) to the buyer for <b>{fmt$(v.booksPart + Math.round(v.cashPart / (1 - CASH_DISCOUNT)))}</b>{v.cashPart > 0 ? <>, of which <b>{fmt$(v.booksPart)}</b> appears on this paper</> : ''}.
                {mgrLabel ? <> The premises to be managed by <b>{mgrLabel}</b>.</> : v.runs ? ' Management to be arranged.' : ''}
              </p>
              <div className="mt-4 flex items-end justify-between gap-4 text-[11px] text-stone-600">
                <div className="flex-1 border-t border-stone-500 pt-1">Seller</div>
                <div className="flex-1 border-t border-stone-500 pt-1">Buyer</div>
              </div>
            </div>
            <Chips s={s} effects={p.effects} />
            {p.acceptance && <AcceptanceLine a={p.acceptance} prefix="You get it over the other bidder" />}
            {p.disabledReason && <div className="text-[12px] text-red-400">{p.disabledReason}</div>}
            <div className="flex justify-between gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={() => setStep('look')}>← Name & look</button>
              <button type="button" className="btn-gold" disabled={!!p.disabledReason} onClick={sign} data-testid="sign">Sign for {fmt$(v.price)}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-900/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`tabular-nums text-sm font-semibold ${tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-stone-100'}`}>{value}</div>
    </div>
  );
}
