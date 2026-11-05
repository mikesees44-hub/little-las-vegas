import { useEffect, useRef, useState } from 'react';
import {
  ASK_EXAMPLES, ASK_TOPICS, askLabel, counselMenu, counselor, counselPrompt, MAX_QUESTION, scriptedCounsel, validateCounsel, type CounselAnswer, type CounselTurn,
} from '../../engine/ai/counsel';
import { displayName } from '../../engine/characters';
import type { GameState, PlayerAction } from '../../engine/types';
import { Overlay } from '../components/Modal';
import { ActionCard } from '../components/Orders';
import { Face } from '../components/People';
import { useEscape } from '../keys';
import { askJson, sampleOff, sampleWithin } from '../minds/sampleClient';

/**
 * ASK THE CONSIGLIERE: a box where the boss asks anything in his own words.
 * The engine writes the brief and the menu of orders (engine/ai/counsel.ts);
 * Claude, when the page can ask him, words the answer and picks from the
 * menu; the picks are checked and shown as the normal one-tap order cards
 * (odds, cost and "why not" from the engine). Without Claude the answer comes
 * from the same brief, by keyword. The talk is kept for this visit only (not
 * in the save).
 */

export interface AskTurn { q: string; a: CounselAnswer; picks: PlayerAction[]; by: 'claude' | 'notes'; week: number }

/** This visit's questions, per game (never saved). */
const visit = new Map<string, AskTurn[]>();
const turnsOf = (s: GameState) => visit.get(s.seed) ?? [];
export function clearAskHistory(): void { visit.clear(); }

/** One answer, Claude's if he answers in time and passes the checks, else his notes. Never throws. */
export async function answerQuestion(s: GameState, q: string, history: readonly CounselTurn[]): Promise<AskTurn> {
  const menu = counselMenu(s);
  const scripted = (): AskTurn => { const a = scriptedCounsel(s, q); return { q, a, picks: a.picks.map((i) => menu[i].action), by: 'notes', week: s.week }; };
  try {
    const sample = await sampleWithin(800);
    if (!sample || sampleOff()) return scripted();
    const res = await askJson(sample, counselPrompt(s, q, history));
    if (res.kind !== 'ok') return scripted();
    const v = validateCounsel(s, res.data, menu);
    if (!v.ok) return scripted();
    return { q, a: v.out, picks: v.out.picks.map((i) => menu[i].action), by: 'claude', week: s.week };
  } catch {
    return scripted();
  }
}

export function AskPanel({ s, initialQ, autoAsk }: { s: GameState; initialQ?: string; /** Ask `initialQ` at once (from the Find box). */ autoAsk?: boolean }) {
  const [q, setQ] = useState(initialQ ?? '');
  const [turns, setTurns] = useState<AskTurn[]>(() => turnsOf(s));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const c = counselor(s);
  const name = c ? (c.nickname ?? c.firstName) : 'your counsel';
  const asked = useRef(false);

  async function ask(text: string) {
    const t = text.trim().slice(0, MAX_QUESTION);
    if (!t || busy) return;
    setBusy(true);
    setQ('');
    const prior = turnsOf(s);
    const turn = await answerQuestion(s, t, prior.map((x) => ({ q: x.q, a: x.a })));
    const next = [...prior, turn].slice(-8);
    visit.set(s.seed, next);
    setTurns(next);
    setBusy(false);
  }

  useEffect(() => {
    if (autoAsk && initialQ && !asked.current) { asked.current = true; void ask(initialQ); } else input.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [turns.length, busy]);

  return (
    <div className="flex min-h-0 flex-col" data-testid="ask-panel">
      <div className="flex items-center gap-2 border-b border-noir-700 px-3 py-2">
        {c && <Face s={s} c={c} size={36} />}
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{c ? 'Your consigliere' : 'Counsel'}</div>
          <div className="truncate font-display text-base text-gold-300">{c ? displayName(c) : 'Nobody in the chair'}</div>
        </div>
      </div>
      <div className="max-h-[52vh] min-h-[6rem] space-y-3 overflow-y-auto px-3 py-2" aria-live="polite" data-testid="ask-log">
        {!turns.length && !busy && (
          <div className="text-[12px] text-stone-400">
            <p>Ask {name} anything: money, the men, the other families, the law, home. He answers from what he knows, and puts the orders he would give in front of you.</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {ASK_TOPICS.map((k) => (
                <button key={k} type="button" className="rounded-full border border-noir-600 px-2 py-0.5 text-[11px] text-stone-300 hover:border-gold-500" onClick={() => void ask(ASK_EXAMPLES[k])} data-testid={`ask-example-${k}`}>{ASK_EXAMPLES[k]}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-1.5" data-testid="ask-turn">
            <div className="text-left"><span className="inline-block max-w-[85%] rounded-lg rounded-bl-none bg-noir-700 px-2.5 py-1 text-[13px] text-stone-200">{t.q}</span></div>
            <div className="rounded-lg border border-noir-600 bg-noir-800 px-2.5 py-1.5 text-[13px] leading-snug text-stone-100" data-testid="ask-answer" data-by={t.by}>
              {t.a.answer}
              {t.a.warn && <span className="mt-1 block text-[11px] text-amber-300" data-testid="ask-warn">⚠ {t.a.warn}</span>}
              <span className="mt-0.5 block text-[10px] text-stone-500">{t.by === 'claude' ? `${name}, in his own words` : `${name}, from his notes`}{t.week !== s.week ? ` · week ${t.week}` : ''}</span>
            </div>
            {t.picks.length > 0 && (
              <div className="grid gap-1.5" data-testid="ask-picks">
                {t.picks.map((a, k) => <ActionCard key={k} s={s} action={a} compact />)}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="text-[12px] italic text-stone-500" data-testid="ask-busy">{name} thinks it over…</div>}
        <div ref={end} />
      </div>
      <form className="flex items-center gap-2 border-t border-noir-700 px-3 py-2" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} maxLength={MAX_QUESTION} placeholder={askLabel(s)} aria-label={askLabel(s)}
          className="min-w-0 flex-1 rounded border border-noir-600 bg-noir-900 px-2 py-1 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-gold-500" data-testid="ask-input" />
        <button type="submit" className="btn-gold text-xs" disabled={busy || !q.trim()} data-testid="ask-send">Ask</button>
      </form>
    </div>
  );
}

/** The box over the game. */
export function AskOverlay({ s, onClose, initialQ, autoAsk }: { s: GameState; onClose: () => void; initialQ?: string; autoAsk?: boolean }) {
  useEscape(true, onClose);
  return (
    <Overlay z={1185} className="flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Ask the consigliere" data-testid="ask-overlay">
      <div className="panel w-full max-h-[94vh] overflow-hidden rounded-b-none border-gold-600/60 sm:max-w-lg sm:rounded-lg" onClick={(e) => e.stopPropagation()}>
        <AskPanel s={s} initialQ={initialQ} autoAsk={autoAsk} />
        <div className="flex justify-end border-t border-noir-800 px-3 py-1.5"><button type="button" className="btn-quiet text-[11px]" onClick={onClose} data-testid="ask-close">Close</button></div>
      </div>
    </Overlay>
  );
}

/** The small button on the Desk: "Ask Dominic…". */
export function AskButton({ s, className = '' }: { s: GameState; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn-quiet text-[10px] ${className}`} onClick={() => setOpen(true)} data-testid="desk-ask" title="Ask your consigliere anything, in your own words">✎ {askLabel(s)}</button>
      {open && <AskOverlay s={s} onClose={() => setOpen(false)} />}
    </>
  );
}
