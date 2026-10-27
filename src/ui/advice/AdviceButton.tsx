import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { actionFacts } from '../actionFacts';
import { adviceBrief, askLabel, type AdviceBrief, type AdviceSubject, type BriefLine, type Certainty, type Reaction } from '../../engine/adviceBrief';
import type { GameState } from '../../engine/types';
import { Modal } from '../components/Modal';
import { useOrders } from '../components/Orders';
import { useSheet } from '../components/People';
import { Portrait } from '../portrait/Portrait';
import { FACTION_TINT } from '../components/People';
import { autoBriefings } from '../settings';

/**
 * ADVISER BRIEFINGS in the UI: "Ask for advice" on any order, seat or
 * decision opens a panel in which one of your people (the underboss first)
 * says what it gets you, what it takes, what stands in the way, whom he would
 * put on it and why, and who might answer it. Known facts, his estimates and
 * what nobody knows are marked apart. Advice never executes anything: Accept
 * queues the order he names, like any other order, and you can cancel it.
 */

const K_LABEL: Record<Certainty, string> = { known: 'Known', estimate: 'Estimate', unknown: 'Unknown' };
const K_CLASS: Record<Certainty, string> = {
  known: 'border-emerald-700/70 text-emerald-300',
  estimate: 'border-amber-700/70 text-amber-300',
  unknown: 'border-noir-500 text-stone-400',
};

export function KTag({ k }: { k: Certainty }) {
  return <span className={`mr-1 inline-block rounded border px-1 text-[9px] uppercase tracking-wider align-middle ${K_CLASS[k]}`} data-k={k}>{K_LABEL[k]}</span>;
}

function Lines({ title, lines, testid }: { title: string; lines: BriefLine[]; testid: string }) {
  if (!lines.length) return null;
  return (
    <div data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{title}</div>
      <ul className="mt-0.5 space-y-0.5 text-[12px] text-stone-300">{lines.map((l, i) => <li key={i}><KTag k={l.k} />{l.text}</li>)}</ul>
    </div>
  );
}

const LIKE_CLASS: Record<Reaction['likelihood'], string> = { likely: 'text-red-300', possible: 'text-amber-300', unlikely: 'text-stone-400' };

/** The whole briefing. `onChoose` takes a decision's option (event subjects); orders are queued here. */
export function AdvicePanel({ s, subject, onClose, onChoose, initialAdviser }: { s: GameState; subject: AdviceSubject; onClose: () => void; onChoose?: (choiceId: string) => void; initialAdviser?: string }) {
  const [who, setWho] = useState<string | undefined>(initialAdviser);
  const [others, setOthers] = useState(false);
  const [plan, setPlan] = useState(false);
  const b = useMemo(() => adviceBrief(s, subject, who), [s, subject, who]);
  const { queue } = useOrders();
  const { open } = useSheet();
  if (!b) return (
    <div className="p-4" data-testid="advice-panel">
      <div className="panel-title">No one to ask</div>
      <p className="mt-1 text-sm text-stone-400">There is nobody free at your table right now: no underboss, consigliere or capo who is out and on his feet.</p>
      <button type="button" className="btn-ghost mt-2 text-xs" onClick={onClose}>Close</button>
    </div>
  );
  const adv = s.characters[b.adviser.charId];
  const rec = b.recommendation;
  const accept = () => {
    if (rec?.choiceId && onChoose) { onChoose(rec.choiceId); onClose(); return; }
    if (rec?.action) { queue(rec.action); onClose(); }
  };
  const canAccept = !!rec && (rec.choiceId ? !!onChoose : !!rec.action) && b.verdict.tone !== 'blocked';
  return (
    <div className="p-4 sm:p-5 space-y-3" data-testid="advice-panel" data-adviser={b.adviser.role}>
      <div className="flex items-start gap-3">
        {adv && <button type="button" onClick={() => open(adv.id)} className="shrink-0 rounded-md"><Portrait c={adv} seed={s.seed} date={s.date} size={56} tint={FACTION_TINT[adv.faction]} /></button>}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{b.adviser.title} · {b.adviser.name}</div>
          <div className="font-display text-xl text-gold-400 leading-tight">{b.title}</div>
          <p className="mt-1 text-sm italic text-stone-200" data-testid="advice-opener">{b.opener}</p>
          <div className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${b.verdict.tone === 'go' ? 'bg-emerald-900/60 text-emerald-200' : b.verdict.tone === 'no' ? 'bg-blood-500/30 text-red-200' : b.verdict.tone === 'blocked' ? 'bg-noir-700 text-stone-400' : 'bg-amber-900/50 text-amber-200'}`} data-testid="advice-verdict">{b.verdict.text}</div>
        </div>
        <button type="button" className="btn-ghost text-xs shrink-0" onClick={onClose} aria-label="Close">×</button>
      </div>
      {b.bias && <div className="rounded border border-amber-700/60 bg-amber-900/20 px-2 py-1 text-[11px] text-amber-200" data-testid="advice-bias">Possible bias: {b.bias}.</div>}
      {b.authority && <div className="text-[11px] text-stone-400" data-testid="advice-authority">{b.authority.note}.</div>}
      <Lines title="What it gets you" lines={b.accomplishes} testid="advice-accomplishes" />
      <Lines title="What it takes" lines={b.requirements} testid="advice-requirements" />
      <Lines title="What stands in the way" lines={b.obstacles} testid="advice-obstacles" />
      {b.candidates.length > 0 && (
        <div data-testid="advice-candidates">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Who he would put on it</div>
          <ul className="mt-1 space-y-1.5">
            {b.candidates.filter((c) => c.pick || others).map((c) => (
              <li key={c.charId} className={`rounded border px-2 py-1.5 ${c.pick ? 'border-gold-500/70 bg-gold-500/5' : 'border-noir-700'}`} data-testid={c.pick ? 'advice-pick' : 'advice-candidate'}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <button type="button" className="text-sm font-semibold text-stone-100 hover:text-gold-300 underline decoration-dotted decoration-stone-600" onClick={() => open(c.charId)}>{c.pick ? '★ ' : ''}{c.name}</button>
                  {c.unavailable ? <span className="text-[11px] text-red-300">Unavailable: {c.unavailable.toLowerCase()}</span>
                    : !c.pick && c.action && <button type="button" className="btn-ghost text-[11px] py-0" onClick={() => { queue(c.action!); onClose(); }}>Put {c.name.split(' ')[0]} on it</button>}
                </div>
                {c.outlook && <div className="text-[11px] text-stone-300"><KTag k={c.outlook.k} />{c.outlook.text}</div>}
                <ul className="text-[11px] text-stone-400">{c.why.map((w, i) => <li key={i}><KTag k={w.k} />{w.text}</li>)}</ul>
                {c.bias && <div className="text-[11px] text-amber-300">Possible bias: {c.bias}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {b.reactions.length > 0 && (
        <div data-testid="advice-reactions">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Who might answer it</div>
          <ul className="mt-0.5 space-y-1 text-[12px]">
            {b.reactions.map((r, i) => (
              <li key={i}>
                <KTag k={r.k} /><span className="font-semibold text-stone-200">{r.who}</span>: <span className="text-stone-300">{r.text}</span> <span className={`text-[11px] ${LIKE_CLASS[r.likelihood]}`}>({r.likelihood})</span>
                {r.reasons.length > 0 && <div className="text-[11px] text-stone-500">because {r.reasons.join('; ')}</div>}
              </li>
            ))}
          </ul>
          <p className="mt-0.5 text-[10px] text-stone-500">Nothing here is certain: it is what he expects from what he knows.</p>
        </div>
      )}
      <Lines title="What nobody knows" lines={b.unknowns} testid="advice-unknowns" />
      {plan && b.plan && <PlanCard s={s} b={b} />}
      <div className="flex flex-wrap gap-1.5 border-t border-noir-700 pt-2" data-testid="advice-buttons">
        <button type="button" className="btn-gold text-xs" disabled={!canAccept} onClick={accept} data-testid="advice-accept">Accept recommendation{rec ? `: ${rec.text.replace(/^"|"$/g, '').replace(/\.$/, '')}` : ''}</button>
        {b.candidates.length > 1 && <button type="button" className="btn-ghost text-xs" onClick={() => setOthers((x) => !x)} data-testid="advice-choose-other">{others ? 'Just his pick' : 'Choose someone else'}</button>}
        {b.others.length > 0 && (
          <span className="inline-flex flex-wrap gap-1" data-testid="advice-ask-other">
            {b.others.map((o) => <button key={o.charId} type="button" className="btn-ghost text-xs" onClick={() => setWho(o.charId)}>{askLabel(o)}</button>)}
          </span>
        )}
        {b.plan && <button type="button" className="btn-ghost text-xs" onClick={() => setPlan((x) => !x)} data-testid="advice-view-plan">{plan ? 'Hide the plan' : 'View plan'}</button>}
        <button type="button" className="btn-ghost text-xs" onClick={onClose} data-testid="advice-not-now">Not now</button>
      </div>
      <p className="text-[10px] text-stone-500">Advice only: nothing happens until you give the order, and orders run when you advance the week. He can be wrong, and he has his own interests.</p>
    </div>
  );
}

function PlanCard({ s, b }: { s: GameState; b: AdviceBrief }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-900/60 p-2 text-[12px]" data-testid="advice-plan">
      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">The plan</div>
      <PlanFacts s={s} b={b} />
    </div>
  );
}

function PlanFacts({ s, b }: { s: GameState; b: AdviceBrief }) {
  const f = actionFacts(s, b.plan!);
  return (
    <ul className="mt-0.5 space-y-0.5 text-stone-300">
      <li><span className="text-stone-500">Order:</span> {f.button}</li>
      <li><span className="text-stone-500">Who:</span> {f.actor}{f.target ? <> · <span className="text-stone-500">On:</span> {f.target}</> : null}</li>
      <li><span className="text-stone-500">Cost:</span> {f.cost}</li>
      <li><span className="text-stone-500">When:</span> {f.timing}</li>
      {f.consequences.map((c, i) => <li key={i} className="text-stone-400">· {c}</li>)}
      {f.unavailable && <li className="text-red-300">{f.unavailable}</li>}
    </ul>
  );
}

/**
 * "Ask for advice" (always there), plus — when automatic briefings are on and
 * the move is a big one — his one-line take right under the order.
 */
export function AdviceButton({ s, subject, onChoose, auto = true, label = 'Ask for advice' }: { s: GameState; subject: AdviceSubject; onChoose?: (choiceId: string) => void; auto?: boolean; label?: string }) {
  const [openIt, setOpen] = useState(false);
  const mode = autoBriefings();
  const showAuto = auto && mode !== 'off' && !openIt;
  const short = useMemo(() => (showAuto ? adviceBrief(s, subject) : undefined), [showAuto, s, subject]);
  const autoNote = short && (mode === 'all' || short.major) ? short : undefined;
  return (
    <>
      <button type="button" className="text-[11px] text-gold-300 underline decoration-dotted underline-offset-2 hover:text-gold-200" onClick={(e) => { e.stopPropagation(); setOpen(true); }} data-testid="ask-advice">☏ {label}</button>
      {autoNote && (
        <span className="text-[11px] text-stone-400" data-testid="auto-brief">
          <span className="text-stone-500">{autoNote.adviser.role === 'capo' ? autoNote.adviser.name.split(' ')[0] : `The ${autoNote.adviser.role}`}:</span> {autoNote.verdict.text.toLowerCase()}{autoNote.recommendation?.charId ? `; he'd use ${s.characters[autoNote.recommendation.charId]?.firstName}` : ''}{autoNote.bias ? ' (possible bias)' : ''}.
        </span>
      )}
      {openIt && typeof document !== 'undefined' && createPortal(
        <div className="relative z-[1200]" onClick={(e) => e.stopPropagation()}>
          <Modal onClose={() => setOpen(false)} wide>
            <AdvicePanel s={s} subject={subject} onClose={() => setOpen(false)} onChoose={onChoose} />
          </Modal>
        </div>, document.body)}
    </>
  );
}
