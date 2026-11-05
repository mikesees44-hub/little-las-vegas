import { useState } from 'react';
import type { GameState } from '../../engine/types';
import {
  answerWord, checkReplyClass, checkWordMessage, KIND_LABEL, replyBlock, replyPrompt, wordPrompt, wordThisWeek, type Word,
} from '../../engine/ai/calls';
import { Empty } from '../components/Layout';
import { askJson, sampleOff, sampleWithin } from '../minds/sampleClient';
import { useShell } from '../shell/context';

/**
 * WORD FROM PEOPLE (engine/ai/calls.ts): this week's calls and letters, on
 * the phone's "Word" tab. Each one: who, why, the message (the templated
 * line; on "Hear him out" the page may ask Claude to say it in his own voice,
 * from the brief only), the whitelisted answers with what each does, and
 * "Say it your way" (Claude picks which answer the words mean; without
 * Claude the box is not there). The engine applies exactly the chosen
 * answer. Messages are never saved; the answer goes to Your File.
 */
export function WordPanel({ s, update: upd }: { s: GameState; update?: (f: (s: GameState) => GameState) => void }) {
  const shell = useShell();
  const update = upd ?? shell.update;
  const words = wordThisWeek(s);
  const [done, setDone] = useState<Record<string, { answer: string; changes: string[] }>>({});
  if (!words.length && !Object.keys(done).length) {
    return <Empty title="Nobody's reached out">When your people have something to tell you (a pinch, money trouble, a grievance, news), they call or write. It shows up here.</Empty>;
  }
  return (
    <div className="space-y-2" data-testid="word-panel">
      {Object.entries(done).map(([id, d]) => (
        <div key={id} className="llv-card-box llv-card-plain py-2 text-[12px] text-stone-300" data-testid={`word-done-${id}`}>
          <span className="italic">"{d.answer}"</span>
          {d.changes.length > 0 && <div className="mt-0.5 text-[11px] text-stone-500">{d.changes.join(' · ')}</div>}
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Done · in Your File</div>
        </div>
      ))}
      {words.map((w) => (
        <WordCard key={w.id} s={s} w={w} onAnswer={(rid, answer, said) => {
          if (!update) return;
          const r = answerWord(s, w.id, rid, answer, said);
          if (!r.result.ok) return;
          setDone((d) => ({ ...d, [w.id]: { answer: r.result.answer, changes: r.result.changes } }));
          update(() => r.state);
        }} />
      ))}
    </div>
  );
}

export function WordCard({ s, w, onAnswer }: { s: GameState; w: Word; onAnswer: (replyId: string, answer?: string, said?: string) => void }) {
  const [msg, setMsg] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [note, setNote] = useState<string | undefined>();
  const [canSay, setCanSay] = useState(!sampleOff());
  const letter = !!w.from;

  async function hear() {
    if (busy) return;
    setBusy(true);
    try {
      const sample = await sampleWithin(800);
      if (!sample || sampleOff()) { setCanSay(false); setMsg(w.line); return; }
      const res = await askJson(sample, wordPrompt(w));
      setMsg((res.kind === 'ok' ? checkWordMessage(s, w, res.data) : undefined) ?? w.line);
      if (res.kind === 'off') setCanSay(false);
    } finally {
      setBusy(false);
    }
  }

  async function sayIt() {
    const text = said.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote(undefined);
    try {
      const sample = await sampleWithin(800);
      if (!sample || sampleOff()) { setCanSay(false); setNote('Pick one of the answers.'); return; }
      const res = await askJson(sample, replyPrompt(w, text, msg ?? w.line));
      const c = res.kind === 'ok' ? checkReplyClass(s, w, res.data) : undefined;
      if (!c) { setNote(res.kind === 'busy' ? 'The line is busy. Pick one of the answers.' : 'He didn\'t follow you. Pick one of the answers.'); return; }
      const why = replyBlock(s, c.reply);
      if (why) { setNote(`That means "${c.reply.label}": ${why}.`); return; }
      onAnswer(c.reply.id, c.answer, text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`llv-card-box ${w.kind === 'pinch' || w.kind === 'baby' || w.kind === 'grievance' ? 'llv-card-attention' : 'llv-card-plain'} py-2`} data-testid={`word-${w.id}`} data-kind={w.kind}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 truncate text-sm text-stone-200">{letter ? '✉' : '☎'} {w.name} <span className="text-stone-500">· {w.role}</span></div>
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-stone-500">{KIND_LABEL[w.kind]}</span>
      </div>
      {msg === undefined ? (
        <button type="button" className="btn-secondary mt-1.5 px-2 py-0.5 text-xs" disabled={busy} onClick={() => void hear()} data-testid={`word-open-${w.id}`}>
          {busy ? (letter ? 'Opening…' : 'Picking up…') : letter ? `Open the letter${w.from ? ` from ${w.from}` : ''} ▸` : 'Pick up ▸'}
        </button>
      ) : (
        <>
          <p className={`mt-1.5 whitespace-pre-line text-[13px] ${letter ? 'rounded border border-amber-200/20 bg-amber-50/5 px-2 py-1.5 font-serif italic text-amber-100/90' : 'text-stone-200'}`} data-testid={`word-msg-${w.id}`}>
            {letter ? msg : `"${msg}"`}
          </p>
          <div className="mt-2 grid gap-1">
            {w.replies.map((r) => {
              const why = replyBlock(s, r);
              return (
                <button key={r.id} type="button" disabled={busy || !!why} title={why ?? r.hint} onClick={() => onAnswer(r.id)} data-testid={`word-reply-${w.id}-${r.id}`}
                  className="rounded-md border border-noir-600 bg-noir-800/70 px-2 py-1 text-left hover:border-gold-500 disabled:opacity-50">
                  <span className="block text-[12px] font-semibold text-stone-100">{r.label}</span>
                  <span className="block text-[10px] text-stone-500">{why ?? r.hint}</span>
                </button>
              );
            })}
          </div>
          {canSay && (
            <div className="mt-2 flex gap-1">
              <input className="inp min-w-0 flex-1 text-xs" maxLength={300} placeholder="Or say it your way…" value={said} onChange={(e) => setSaid(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void sayIt(); }} data-testid={`word-say-${w.id}`} />
              <button type="button" className="btn-secondary px-2 py-0.5 text-xs" disabled={busy || !said.trim()} onClick={() => void sayIt()} data-testid={`word-say-go-${w.id}`}>Say it</button>
            </div>
          )}
          {note && <div className="mt-1 text-[11px] text-amber-300/90" data-testid={`word-note-${w.id}`}>{note}</div>}
        </>
      )}
    </div>
  );
}
