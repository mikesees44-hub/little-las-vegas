import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../engine/types';
import { Modal } from '../components/Modal';
import { DoneMark, Empty } from '../components/Layout';
import {
  buildContext, copyText, feedbackChannel, FEEDBACK_COLLECTION, MAX_NAME, MAX_TEXT, REPORT_TYPES, reportDoc, reportText, sendReport,
  type Channel, type ReportContext, type ReportType,
} from './reportClient';

/**
 * The playtesters' "Report a bug or idea" form (reportClient.ts): a type,
 * the words, an optional name, and the game's context attached. Send writes
 * one document to the shared `feedback` collection; where this view cannot
 * write (outside claude.ai, a view-only visitor) the same form copies the
 * report to the clipboard instead.
 */
export function ReportBug({ s, onClose, initialScreen }: { s: GameState; onClose: () => void; initialScreen?: string }) {
  const [ch, setCh] = useState<Channel | undefined>();
  const [type, setType] = useState<ReportType>('bug');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState<'edit' | 'sending' | 'sent' | 'copied' | 'copyfail'>('edit');
  const [err, setErr] = useState<string | undefined>();
  const [forceCopy, setForceCopy] = useState(false);
  const [inbox, setInbox] = useState(false);
  // The context is read once, when the form opens: the screen behind it, not the form itself.
  const ctx: ReportContext = useMemo(() => buildContext(s, initialScreen), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    feedbackChannel().then((c) => { if (live) setCh(c); });
    return () => { live = false; };
  }, []);
  const mode = forceCopy || ch?.mode !== 'db' ? 'copy' : 'db';
  const full = reportText(type, text, name, ctx);
  const ready = text.trim().length >= 3;

  const send = async () => {
    if (!ready) return;
    if (mode === 'copy' || !ch?.db) {
      setState((await copyText(full)) ? 'copied' : 'copyfail');
      return;
    }
    setState('sending');
    setErr(undefined);
    const r = await sendReport(ch.db, reportDoc(type, text, name, ctx));
    if (r.ok) { setState('sent'); return; }
    setState('edit');
    if (r.fallback) {
      setForceCopy(true);
      setErr(r.code === 'quota_exceeded'
        ? 'The feedback box is full. Copy the report instead and send it to whoever shared the game with you.'
        : 'This view of the game cannot send reports from your account. Copy the report instead and send it to whoever shared the game with you.');
    } else setErr('Too many sends at once. Wait a moment and try again.');
  };

  if (inbox && ch?.db) return <FeedbackInbox db={ch.db} onBack={() => setInbox(false)} onClose={onClose} />;

  const done = state === 'sent' || state === 'copied';
  return (
    <Modal onClose={onClose}>
      <div className="p-4 sm:p-5" data-testid="feedback-form" data-mode={mode}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">For the people making the game</div>
            <h2 className="font-display text-xl leading-tight text-gold-300">Report a bug or idea</h2>
          </div>
          <button type="button" className="btn-quiet shrink-0 text-xs" onClick={onClose} aria-label="Close" data-testid="feedback-close">✕</button>
        </div>

        {done ? (
          <div className="mt-4 space-y-3" data-testid="feedback-done" role="status">
            <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/20 p-4">
              <DoneMark>{state === 'sent' ? 'Sent' : 'Copied'}</DoneMark>
              <p className="mt-2 font-display text-lg text-stone-100">{state === 'sent' ? 'Sent, thank you.' : 'Copied, thank you.'}</p>
              <p className="mt-1 text-[12.5px] text-stone-400">
                {state === 'sent' ? 'It went straight to the people making the game, with where you were in it.' : 'Paste it in a message to whoever shared the game with you.'}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => { setText(''); setState('edit'); }} data-testid="feedback-another">Send another</button>
              <button type="button" className="btn-primary text-sm" onClick={onClose} data-testid="feedback-back">Back to the game</button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div role="radiogroup" aria-label="What is it?" className="grid grid-cols-3 gap-1.5" data-testid="feedback-type">
              {REPORT_TYPES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={type === t.id} onClick={() => setType(t.id)} data-testid={`feedback-type-${t.id}`} title={t.hint}
                  className={`rounded-md border px-2 py-2 text-[12.5px] font-semibold ${type === t.id ? 'border-gold-400 bg-gold-500/10 text-gold-300' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-stone-500">{REPORT_TYPES.find((t) => t.id === type)?.hint}</p>
            <label className="block">
              <span className="text-[12px] font-semibold text-stone-300">What happened, or what you'd like</span>
              <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))} rows={5} autoFocus data-testid="feedback-text"
                placeholder={type === 'bug' ? 'What did you do, what did you expect, what happened instead?' : type === 'idea' ? 'What would make it better?' : 'Which scene, and how did it land?'}
                className="inp mt-1 resize-y text-[13px] leading-relaxed" />
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-stone-300">Your name <span className="font-normal text-stone-500">(optional)</span></span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))} className="inp mt-1 text-[13px]" data-testid="feedback-name" autoComplete="off" />
            </label>
            <details className="rounded-md border border-noir-700 bg-noir-800/40 px-2.5 py-1.5 text-[11.5px] text-stone-400" data-testid="feedback-context">
              <summary className="cursor-pointer select-none text-stone-300">Attached: where you are in the game</summary>
              <ul className="mt-1 space-y-0.5">
                <li>Game {ctx.version} · start <b className="text-stone-300">{ctx.start}</b> · week {ctx.week} · {ctx.date}</li>
                <li>Screen: {ctx.screen} · seed {ctx.seed}</li>
                {ctx.file.map((l, i) => <li key={i} className="truncate" title={l}>Your File: {l}</li>)}
              </ul>
              <p className="mt-1 text-stone-500">Nothing else about you is sent: only what you type here.</p>
            </details>
            {err && <p className="rounded border border-amber-600/50 bg-amber-900/10 px-2 py-1.5 text-[12px] text-amber-100" role="alert" data-testid="feedback-error">{err}</p>}
            {state === 'copyfail' && (
              <div data-testid="feedback-copyfail">
                <p className="text-[12px] text-amber-200">Your browser would not copy it. Select the text below and copy it yourself:</p>
                <textarea readOnly value={full} rows={6} className="inp mt-1 text-[11.5px]" onFocus={(e) => e.currentTarget.select()} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-noir-700 pt-3">
              {ch?.reader && ch.db && <button type="button" className="btn-quiet text-xs" onClick={() => setInbox(true)} data-testid="feedback-inbox-open">Feedback received</button>}
              {mode === 'db' && <button type="button" className="btn-quiet text-xs" disabled={!ready} onClick={async () => setState((await copyText(full)) ? 'copied' : 'copyfail')} data-testid="feedback-copy-alt">Copy instead</button>}
              <span className="ml-auto text-[11px] text-stone-500">{!ch ? 'Checking…' : mode === 'db' ? 'Goes to the game makers' : 'Copies the report to paste in a message'}</span>
              <button type="button" className="btn-primary text-sm" disabled={!ready || state === 'sending' || !ch} onClick={send} data-testid="feedback-send">
                {state === 'sending' ? 'Sending…' : mode === 'db' ? 'Send ▸' : 'Copy report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

type Row = { id: string; type?: string; text?: string; name?: string; at?: string; ctx?: Partial<ReportContext> };

/** The owner's and editors' list of what playtesters sent (newest first; reading is open to viewers by the default rules, so it is only offered to editors). */
function FeedbackInbox({ db, onBack, onClose }: { db: import('./reportClient').FeedbackDb; onBack: () => void; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | undefined>();
  const [err, setErr] = useState<string | undefined>();
  useEffect(() => {
    const off = db.collection(FEEDBACK_COLLECTION).orderBy('at', 'desc').limit(200)
      .onSnapshot((q) => setRows(q.docs.filter((d) => d.exists).map((d) => ({ id: d.id, ...(d.data() as Omit<Row, 'id'>) }))), (e) => setErr(e.code));
    return off;
  }, [db]);
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5" data-testid="feedback-inbox">
        <div className="flex items-center gap-2">
          <button type="button" className="btn-quiet text-xs" onClick={onBack}>◂ Back</button>
          <h2 className="font-display text-xl text-gold-300">Feedback received{rows ? ` (${rows.length})` : ''}</h2>
          <button type="button" className="btn-quiet ml-auto text-xs" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {err && <p className="mt-2 text-[12px] text-amber-200">Could not read the feedback ({err}).</p>}
        {!rows && !err && <p className="mt-3 text-[12px] text-stone-500">Loading…</p>}
        {rows && rows.length === 0 && <div className="mt-3"><Empty title="Nothing yet">When a playtester sends a report, it shows up here.</Empty></div>}
        <ul className="mt-3 space-y-2">
          {rows?.map((r) => (
            <li key={r.id} className="llv-card-box llv-card-plain">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-stone-400">
                <span className="rounded bg-noir-700 px-1.5 font-semibold uppercase tracking-wider text-gold-300">{r.type}</span>
                <span>{r.name || 'Anonymous'}</span>
                <span>{r.at ? new Date(r.at).toLocaleString() : ''}</span>
                <span className="ml-auto">{r.ctx?.start} · wk {r.ctx?.week} · {r.ctx?.screen}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-stone-200">{r.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
