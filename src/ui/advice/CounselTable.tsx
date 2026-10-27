import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { counsel, VERDICT_LABEL, type Counsel, type CounselOption, type CounselPoint, type CounselSubject, type CounselVerdict, type Tally, type Voice } from '../../engine/counsel';
import type { GameState } from '../../engine/types';
import { Modal } from '../components/Modal';
import { useOrders } from '../components/Orders';
import { FACTION_TINT, useSheet } from '../components/People';
import { Portrait } from '../portrait/Portrait';
import { KTag } from './AdviceButton';

/**
 * THE TABLE in the UI: "Ask the table" next to every "Ask for advice", in the
 * sit-down, the office, the decisions and the ready-to-advance review. A
 * summary bar first ("2 for, 1 wait — main worry: federal heat", and why it
 * matters), then each man's verdict and his line; "More…" opens his pros and
 * cons, every one marked Known / Estimate / Unknown. Decisions with options
 * get a matrix (options × advisers): tap an option to hear everyone on it.
 * Nothing here gives an order on its own: the buttons are the same orders
 * and answers as everywhere else, and every option stays open to you.
 */

const V_CLASS: Record<CounselVerdict, string> = {
  do: 'border-emerald-600/70 bg-emerald-900/50 text-emerald-200',
  doBut: 'border-lime-700/70 bg-lime-900/30 text-lime-200',
  wait: 'border-amber-700/70 bg-amber-900/40 text-amber-200',
  dont: 'border-red-700/70 bg-blood-500/30 text-red-200',
};
const V_GLYPH: Record<CounselVerdict, string> = { do: '✓', doBut: '✓…', wait: '⏸', dont: '✗' };

function VerdictBadge({ v, small }: { v: CounselVerdict; small?: boolean }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 ${small ? 'py-0 text-[10px]' : 'py-0.5 text-[11px] font-semibold'} ${V_CLASS[v]}`} data-verdict={v}>{V_GLYPH[v]} {VERDICT_LABEL[v]}</span>;
}

function TallyChips({ t }: { t: Tally }) {
  const parts: [CounselVerdict, number][] = [['do', t.for], ['doBut', t.but], ['wait', t.wait], ['dont', t.against]];
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid="table-tally">
      {parts.filter(([, n]) => n > 0).map(([v, n]) => <span key={v} className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${V_CLASS[v]}`}>{n} × {VERDICT_LABEL[v]}</span>)}
    </span>
  );
}

const first = (name: string) => name.replace(/ ".*?"/, '').split(' ')[0];

function Points({ title, pts, tone, testid }: { title: string; pts: CounselPoint[]; tone: 'pro' | 'con'; testid: string }) {
  return (
    <div data-testid={testid}>
      <div className={`text-[10px] uppercase tracking-[0.2em] ${tone === 'pro' ? 'text-emerald-400/80' : 'text-red-300/80'}`}>{title}</div>
      <ul className="mt-0.5 space-y-0.5 text-[12px] leading-snug text-stone-300">
        {pts.map((p, i) => <li key={i} className="flex gap-1"><span className={tone === 'pro' ? 'text-emerald-400' : 'text-red-300'} aria-hidden>{tone === 'pro' ? '+' : '−'}</span><span><KTag k={p.k} />{p.text}</span></li>)}
      </ul>
    </div>
  );
}

function VoiceCard({ s, v, open, onToggle }: { s: GameState; v: Voice; open: boolean; onToggle: () => void }) {
  const c = s.characters[v.adviser.charId];
  const sheet = useSheet();
  return (
    <section className="flex min-w-0 flex-col rounded-md border border-noir-700 bg-noir-900/80 p-2.5" data-testid="table-voice" data-role={v.adviser.role} data-verdict={v.verdict}>
      <div className="flex items-start gap-2">
        {c && <button type="button" className="shrink-0 rounded-md" onClick={() => sheet.open(c.id)} aria-label={`Open ${v.adviser.name}`}><Portrait c={c} seed={s.seed} date={s.date} size={40} tint={FACTION_TINT[c.faction]} /></button>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] uppercase tracking-[0.2em] text-stone-500">{v.adviser.title}</div>
          <div className="truncate text-[13px] font-semibold text-stone-100">{v.adviser.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <VerdictBadge v={v.verdict} />
            <span className="text-[10px] text-stone-400" title="How sure he is: his margin, and his skill for this kind of thing">{v.confidenceWord} ({v.confidence}%)</span>
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-[12.5px] italic leading-snug text-stone-200" data-testid="table-says">{v.says}</p>
      {v.backsLabel && <p className="mt-0.5 text-[11px] text-stone-400">Backs: <span className="text-gold-300">{v.backsLabel}</span></p>}
      {v.but && v.verdict === 'doBut' && <p className="mt-0.5 text-[11px] text-lime-200/90" data-testid="table-but">…{v.but}.</p>}
      {v.instead && (v.verdict === 'wait' || v.verdict === 'dont') && <p className="mt-0.5 text-[11px] text-amber-200" data-testid="table-instead">Instead: {v.instead}</p>}
      {v.bias && <p className="mt-1 rounded border border-amber-700/60 bg-amber-900/20 px-1.5 py-0.5 text-[11px] text-amber-200" data-testid="table-bias">Possible bias: {v.bias}.</p>}
      {open && (
        <div className="mt-2 space-y-1.5 border-t border-noir-800 pt-1.5" data-testid="table-reasons">
          <Points title="For it" pts={v.pros} tone="pro" testid="table-pros" />
          <Points title="Against it" pts={v.cons} tone="con" testid="table-cons" />
          <p className="text-[10px] text-stone-500"><KTag k="unknown" />{v.blind}.</p>
        </div>
      )}
      <button type="button" className="mt-auto self-start pt-1.5 text-[11px] text-gold-300 underline decoration-dotted underline-offset-2 hover:text-gold-200" onClick={onToggle} data-testid="table-more">
        {open ? 'Less' : `More… (${v.pros.length} for, ${v.cons.length} against)`}
      </button>
    </section>
  );
}

function Matrix({ c, sel, onSel }: { c: Counsel; sel: string; onSel: (id: string) => void }) {
  const opts = c.options!;
  return (
    <div data-testid="table-matrix">
      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">The options, and where each man stands · tap one to hear them on it</div>
      <ul className="mt-1 space-y-1">
        {opts.map((o: CounselOption) => (
          <li key={o.id}>
            <button type="button" onClick={() => onSel(o.id)} aria-pressed={sel === o.id} data-testid="table-option" disabled={false}
              className={`w-full rounded border px-2 py-1.5 text-left ${sel === o.id ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 hover:border-gold-600'} ${o.disabled ? 'opacity-60' : ''}`}>
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-semibold text-stone-100">{o.label}</span>
                <span className="text-[10px] text-stone-400">{o.backers ? `${o.backers} back${o.backers === 1 ? 's' : ''} it` : 'nobody\'s first pick'}{o.disabled ? ' · not open to you' : ''}</span>
              </span>
              <span className="mt-0.5 flex flex-wrap gap-1">
                {o.voices.map((v) => <span key={v.adviser.charId} className="inline-flex items-center gap-0.5 text-[10px] text-stone-400" data-testid="table-cell">{first(v.adviser.name)} <VerdictBadge v={v.verdict} small /></span>)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface CounselPanelProps {
  s: GameState;
  subject: CounselSubject;
  onClose: () => void;
  /** A decision's option (event subjects). */
  onChoose?: (choiceId: string) => void;
  /** A sit-down item's option (brief subjects): the sit-down's own pick, so "Not now" works as there. */
  onOption?: (optionId: string) => void;
  /** "Ask one of them alone": back to the one-adviser briefing. */
  onSingle?: () => void;
}

export function CounselPanel({ s, subject, onClose, onChoose, onOption, onSingle }: CounselPanelProps) {
  const key = JSON.stringify(subject);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const c = useMemo(() => counsel(s, subject), [s, key]);
  const [sel, setSel] = useState<string | undefined>();
  const [openAll, setOpenAll] = useState(false);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const { queue } = useOrders();
  if (!c) return (
    <div className="p-4" data-testid="table-panel">
      <div className="panel-title">Nobody at the table</div>
      <p className="mt-1 text-sm text-stone-400">There is nobody free to ask right now: no underboss, consigliere or capo who is out and on his feet — or the matter is already settled.</p>
      <button type="button" className="btn-ghost mt-2 text-xs" onClick={onClose}>Close</button>
    </div>
  );
  const defaultOpt = c.options ? [...c.options].sort((a, b) => b.backers - a.backers || c.options!.indexOf(a) - c.options!.indexOf(b))[0] : undefined;
  const opt = c.options ? c.options.find((o) => o.id === sel) ?? defaultOpt : undefined;
  const voices = opt ? opt.voices : c.voices;
  const isOpen = (v: Voice) => openAll || !!opened[v.adviser.charId];
  const blocked = c.plan ? c.voices.every((v) => v.cons.some((p) => /^Can't be done this week/.test(p.text))) : false;
  const act = () => {
    if (opt) {
      if (opt.choiceId && onChoose) { onChoose(opt.choiceId); onClose(); return; }
      if (c.kind === 'brief' && onOption) { onOption(opt.id); onClose(); return; }
      if (opt.action) { queue(opt.action); onClose(); return; }
      onClose();
      return;
    }
    if (c.plan) { queue(c.plan); onClose(); }
  };
  const canAct = opt ? !opt.disabled && (!!opt.choiceId ? !!onChoose : c.kind === 'brief' ? (!!onOption || !!opt.action || opt.id === 'wait') : !!opt.action) : !!c.plan && !blocked;
  const optTally = opt ? opt.tally : c.summary.tally;
  return (
    <div className="space-y-3 p-3 sm:p-5" data-testid="table-panel" data-kind={c.kind}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">The Table · your people, all at once</div>
          <h2 className="font-display text-xl leading-tight text-gold-400 sm:text-2xl">{c.title}</h2>
        </div>
        <button type="button" className="btn-ghost shrink-0 text-xs" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="rounded-md border border-gold-600/50 bg-noir-900/90 p-2.5" data-testid="table-summary">
        <div className="flex flex-wrap items-center gap-2">
          <TallyChips t={c.summary.tally} />
        </div>
        <p className="mt-1 text-[13px] font-semibold text-stone-100" data-testid="table-summary-line">{c.summary.line}</p>
        <p className="mt-0.5 text-[12px] text-stone-300" data-testid="table-why"><span className="text-stone-500">Why this matters: </span>{c.why}</p>
        {c.defaultLabel && <p className="mt-0.5 text-[11px] text-stone-500">If nobody decides: <span className="text-stone-300">{c.defaultLabel}</span>.</p>}
      </div>
      {c.options && opt && <Matrix c={c} sel={opt.id} onSel={setSel} />}
      {opt && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]" data-testid="table-on-option">
          <span className="text-stone-400">On</span><span className="font-semibold text-gold-300">“{opt.label}”</span><TallyChips t={optTally} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2" data-testid="table-voices">
        {voices.map((v) => <VoiceCard key={v.adviser.charId} s={s} v={v} open={isOpen(v)} onToggle={() => setOpened((o) => ({ ...o, [v.adviser.charId]: !isOpen(v) }))} />)}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-noir-700 pt-2" data-testid="table-buttons">
        <button type="button" className="btn-gold text-xs" disabled={!canAct} onClick={act} data-testid="table-act">
          {opt ? (opt.id === 'wait' ? `“${opt.label}”` : `Choose “${opt.label.length > 40 ? `${opt.label.slice(0, 39)}…` : opt.label}”`) : blocked ? 'Can\'t be ordered this week' : 'Give the order'}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setOpenAll((x) => !x)} data-testid="table-all-reasons">{openAll ? 'Just the verdicts' : 'All the reasons'}</button>
        {onSingle && <button type="button" className="btn-ghost text-xs" onClick={onSingle} data-testid="table-single">Ask one of them alone</button>}
        <button type="button" className="btn-ghost text-xs" onClick={onClose} data-testid="table-not-now">Not now</button>
      </div>
      <p className="text-[10px] text-stone-500">Advice only: nothing happens until you give the order, and orders run when you advance the week. Each man speaks from what he knows — <KTag k="known" />what you can see too, <KTag k="estimate" />his read (it can be wrong), <KTag k="unknown" />what nobody knows. Every option stays yours.</p>
    </div>
  );
}

/** "Ask the table": opens the table on a subject in its own window. */
export function TableButton({ s, subject, onChoose, onOption, label = 'Ask the table', className, testid = 'ask-table' }: { s: GameState; subject: CounselSubject; onChoose?: (choiceId: string) => void; onOption?: (optionId: string) => void; label?: string; className?: string; testid?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? 'text-[11px] text-gold-300 underline decoration-dotted underline-offset-2 hover:text-gold-200'} onClick={(e) => { e.stopPropagation(); setOpen(true); }} data-testid={testid}>⚖ {label}</button>
      {open && <TableModal s={s} subject={subject} onChoose={onChoose} onOption={onOption} onClose={() => setOpen(false)} />}
    </>
  );
}

export function TableModal({ s, subject, onChoose, onOption, onClose, onSingle }: { s: GameState; subject: CounselSubject; onChoose?: (choiceId: string) => void; onOption?: (optionId: string) => void; onClose: () => void; onSingle?: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="relative z-[1200]" onClick={(e) => e.stopPropagation()}>
      <Modal onClose={onClose} xwide>
        <CounselPanel s={s} subject={subject} onClose={onClose} onChoose={onChoose} onOption={onOption} onSingle={onSingle} />
      </Modal>
    </div>, document.body);
}
