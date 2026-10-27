import { useState } from 'react';
import { appLine, AUTO_LABEL, canCarry, COLL_LABEL, DEFAULT_LABEL, deskLoans, deskOpen, familyBankName, LEND_LABEL, RATE_PRESETS, rateWords, shadiness, TERM_PRESETS, weeklyPayment, type AutoRule, type BankPolicy, type Collateral, type DefaultPolicy, type LendTo } from '../../engine/familyBank';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { fmt$ } from '../format';
import { HousesSummary } from './HomePanel';

const DEFAULT_POLICY: BankPolicy = { rate: 0.06 / 52, weeks: 260, lendTo: 'both', max: 6000, coll: 'house', onDef: 'extend', auto: 'none' };
const MAXES = [1000, 3000, 6000, 10000, 20000];

function Pick<T extends string | number>({ label, value, opts, onPick, testid }: { label: string; value: T; opts: { v: T; t: string; tip?: string }[]; onPick: (v: T) => void; testid?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label} data-testid={testid}>
        {opts.map((o) => (
          <button key={String(o.v)} type="button" title={o.tip} onClick={() => onPick(o.v)} className={`rounded border px-1.5 py-0.5 text-[11px] ${value === o.v ? 'border-gold-400 text-gold-300 bg-gold-500/10' : 'border-noir-600 text-stone-300'}`}>{o.t}</button>
        ))}
      </div>
    </div>
  );
}

/**
 * THE LOAN DESK. The Family's bank (or book): its terms, who comes asking
 * after Chemical Bank turned them down (with what the Family knows of their
 * money), and the loans out on the street with what happens if they stop
 * paying. Summary first; the policy and the history under More….
 */
export function LoanDesk({ s }: { s: GameState }) {
  const via = deskOpen(s);
  const F = s.fbank;
  const pol = F?.policy ?? DEFAULT_POLICY;
  const [draft, setDraft] = useState<BankPolicy>(pol);
  const [showPolicy, setShowPolicy] = useState(false);
  const apps = (F?.apps ?? []).filter((a) => a.st === 'open');
  const past = (F?.apps ?? []).filter((a) => a.st !== 'open').slice(-12).reverse();
  const loans = deskLoans(s);
  const out = loans.reduce((a, x) => a + x.d.out, 0);
  const changed = JSON.stringify(draft) !== JSON.stringify(pol);
  const set = (k: Partial<BankPolicy>) => setDraft((d) => ({ ...d, ...k }));
  return (
    <div className="space-y-3" data-testid="loan-desk">
      <div className="space-y-1">
        <div className="font-display text-xl text-gold-400">{via === 'bank' ? familyBankName(s) : via === 'book' ? 'The Family\'s book' : 'The loan desk'}</div>
        {!via ? (
          <div className="text-sm text-stone-400" data-testid="desk-closed">The Family has no bank and no book yet. Charter a bank through a front man, or start a shylock book: then the people Chemical Bank turns down come to you, on your terms.</div>
        ) : (
          <div className="text-sm text-stone-300" data-testid="desk-summary">
            {loans.length} loans out ({fmt$(out)} owed to the Family) · {apps.length} waiting · terms: {rateWords(pol.rate).split(':')[0]}, {pol.weeks} weeks; if they stop paying, {DEFAULT_LABEL[pol.onDef].label.toLowerCase()}.
            {F && F.talk >= 20 && <div className="text-xs text-rose-300">The town talks about the Family's lending ({Math.round(F.talk)}/100).</div>}
            {via === 'bank' && shadiness(pol.rate) === 0 && <div className="text-xs text-emerald-300">Clean terms: the loan book washes money too.</div>}
          </div>
        )}
      </div>

      {via && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Turned down at Chemical Bank, asking the Family</div>
          {!apps.length && <div className="text-xs text-stone-500">Nobody waiting. When Chemical Bank turns a family or a shop down, they come here (up to four weeks).</div>}
          {apps.map((a) => {
            const amt = Math.min(a.amt, pol.max);
            const pw = weeklyPayment(amt, pol.rate, pol.weeks);
            return (
              <div key={a.id} className="rounded border border-noir-700 p-2 space-y-1" data-testid="desk-app">
                <div className="text-sm text-stone-200">{appLine(s, a)}</div>
                <div className="text-[11px] text-stone-400">Chemical Bank: {a.denied.join('; ') || 'no'}. What we know: {fmt$(a.income)}/wk coming in, {fmt$(a.cash)} in the house, {fmt$(a.owed)}/wk already owed. On your terms: {fmt$(pw)}/wk — {canCarry(a, amt, pol.rate, pol.weeks) ? 'he can carry it' : 'more than he can carry'}.</div>
                <ActionCard s={s} action={{ kind: 'econ', op: { type: 'bank', cmd: { k: 'decide', app: a.id, verdict: 'approve', amt } } }} compact />
                <details className="text-xs">
                  <summary className="cursor-pointer text-stone-400">More… (offer half, turn him down)</summary>
                  <div className="mt-1 space-y-1">
                    <ActionCard s={s} action={{ kind: 'econ', op: { type: 'bank', cmd: { k: 'decide', app: a.id, verdict: 'counter', amt: Math.round(a.amt / 2) } } }} compact />
                    <ActionCard s={s} action={{ kind: 'econ', op: { type: 'bank', cmd: { k: 'decide', app: a.id, verdict: 'deny' } } }} compact />
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}

      {loans.length > 0 && (
        <details className="text-xs" open={loans.some((x) => x.late > 0)}>
          <summary className="cursor-pointer text-stone-400">The loans out ({loans.length}){loans.some((x) => x.late > 0) ? ` — ${loans.filter((x) => x.late > 0).length} behind` : ''}</summary>
          <ul className="mt-1 space-y-1.5" data-testid="desk-loans">
            {loans.map(({ d, who, pay, late }) => (
              <li key={d.id} className="rounded border border-noir-700 p-1.5">
                <div className="text-stone-200">{who}: owes {fmt$(d.out)} · {fmt$(pay)}/wk · {rateWords(d.fb!.rate).split(':')[0]}{late ? <span className="text-rose-300"> · {late} wk behind</span> : ''}</div>
                <div className="text-stone-500">If he stops paying: {DEFAULT_LABEL[d.fb!.onDef].label.toLowerCase()} · put up: {COLL_LABEL[d.fb!.coll].toLowerCase()}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(Object.keys(DEFAULT_LABEL) as DefaultPolicy[]).filter((k) => k !== d.fb!.onDef).map((k) => <ActionCard key={k} s={s} action={{ kind: 'econ', op: { type: 'bank', cmd: { k: 'onDef', debt: d.id, onDef: k } } }} compact />)}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="space-y-2 border-t border-noir-700 pt-2">
        <button type="button" className="text-xs text-stone-400 hover:text-gold-300" onClick={() => setShowPolicy((x) => !x)} data-testid="desk-policy-toggle">{showPolicy ? '▾' : '▸'} The desk's terms (rate, term, who, collateral, if they don't pay)…</button>
        {showPolicy && (
          <div className="space-y-2" data-testid="desk-policy">
            <Pick label="Interest" value={draft.rate} onPick={(v) => set({ rate: v })} testid="desk-rate" opts={RATE_PRESETS.map((r) => ({ v: r.rate, t: r.label, tip: rateWords(r.rate) }))} />
            <div className="text-[11px] text-stone-400">{rateWords(draft.rate)}. On a $1,000 loan over {draft.weeks} weeks he pays {fmt$(weeklyPayment(1000, draft.rate, draft.weeks))}/wk, {fmt$(weeklyPayment(1000, draft.rate, draft.weeks) * draft.weeks)} in all.{shadiness(draft.rate) > 0 ? ' Above a bank\'s rate: heat, resentment and talk' + (shadiness(draft.rate) > 2 ? ', and the bank examiners if it is the bank lending.' : '.') : ''}</div>
            <Pick label="Weeks to pay it back" value={draft.weeks} onPick={(v) => set({ weeks: v })} opts={TERM_PRESETS.map((w) => ({ v: w, t: w >= 52 ? `${w / 52} yr` : `${w} wk` }))} />
            <Pick label="Lends to" value={draft.lendTo} onPick={(v) => set({ lendTo: v })} opts={(Object.keys(LEND_LABEL) as LendTo[]).map((k) => ({ v: k, t: LEND_LABEL[k] }))} />
            <Pick label="The most to one borrower" value={draft.max} onPick={(v) => set({ max: v })} opts={MAXES.map((m) => ({ v: m, t: fmt$(m) }))} />
            <Pick label="What he puts up" value={draft.coll} onPick={(v) => set({ coll: v })} opts={(Object.keys(COLL_LABEL) as Collateral[]).map((k) => ({ v: k, t: COLL_LABEL[k] }))} />
            <Pick label="If he stops paying" value={draft.onDef} onPick={(v) => set({ onDef: v })} opts={(Object.keys(DEFAULT_LABEL) as DefaultPolicy[]).map((k) => ({ v: k, t: DEFAULT_LABEL[k].label, tip: DEFAULT_LABEL[k].detail }))} />
            <div className="text-[11px] text-stone-400">{DEFAULT_LABEL[draft.onDef].detail}</div>
            <Pick label="Applicants" value={draft.auto} onPick={(v) => set({ auto: v })} opts={(Object.keys(AUTO_LABEL) as AutoRule[]).map((k) => ({ v: k, t: AUTO_LABEL[k] }))} />
            {changed && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'bank', cmd: { k: 'policy', set: draft } } }} />}
          </div>
        )}
      </div>

      {past.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-stone-400">More… the last applicants ({past.length})</summary>
          <ul className="mt-1 space-y-0.5 text-stone-400">
            {past.map((a) => <li key={a.id}>{appLine(s, a)} — {a.st === 'yes' ? `lent ${fmt$(a.made?.amt ?? a.amt)}` : a.st === 'no' ? 'turned down' : 'went elsewhere'}</li>)}
          </ul>
        </details>
      )}

      <div className="border-t border-noir-700 pt-2">
        <div className="text-[10px] uppercase tracking-widest text-stone-500">The town's houses</div>
        <HousesSummary s={s} />
      </div>
    </div>
  );
}
