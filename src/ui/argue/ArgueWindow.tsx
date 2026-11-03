import { useEffect, useRef, useState } from 'react';
import { displayName, player } from '../../engine/characters';
import {
  argueReply, closeArgument, END_LABEL, END_TONE, flavorPrompt, mediatorFor, POSTURE_LABEL, REPLIES, REPLY_LABEL, replyOdds, validateFlavor,
  VOICE_LABEL, type Argument, type Reply,
} from '../../engine/argue';
import type { GameState } from '../../engine/types';
import { useOpenBook } from '../book/TheBook';
import { Overlay } from '../components/Modal';
import { Face } from '../components/People';
import { OddsBar } from '../decide/DecisionCard';
import { useEscape, useNumberKeys } from '../keys';
import { askJson, sampleOff, sampleWithin } from '../minds/sampleClient';
import { useShell } from '../shell/context';

/**
 * THE ARGUMENT WINDOW. Face to face: the boss on the left, the man on the
 * right (how he is carrying it, and his temper), the men in the room under
 * them, the exchange as it happens, and at most five answers, each with its
 * odds and the one thing it risks. When it ends: one clear "done" line, and
 * it is in Your File. Engine: engine/argue (the rules and every effect).
 * Claude may reword his lines (optional, never saved, never changes a thing).
 */

const POS_TONE: Record<string, string> = { hot: 'text-red-300', cold: 'text-sky-300', hurt: 'text-amber-300', scared: 'text-stone-300', smiling: 'text-emerald-300' };
const END_CLS = { good: 'border-emerald-600/60 bg-emerald-900/20 text-emerald-200', plain: 'border-gold-600/50 bg-gold-500/10 text-gold-200', bad: 'border-red-700/60 bg-red-900/20 text-red-200' };

export function ArgueWindow({ s, A, onReply, onClose, flavor = {}, busy }: {
  s: GameState;
  A: Argument;
  onReply: (r: Reply) => void;
  onClose: () => void;
  flavor?: Record<number, string>;
  busy?: boolean;
}) {
  const boss = player(s);
  const c = s.characters[A.t];
  const med = mediatorFor(s, A);
  const opts = A.end ? [] : REPLIES.map((r) => ({ r, o: replyOdds(s, A, r) })).filter((x) => !(x.r === 'mediate' && !med));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [A.log.length]);
  useNumberKeys(!busy && !A.end, opts.length, (i) => { const x = opts[i]; if (x && !x.o.blocked) onReply(x.r); });
  const openBook = useOpenBook();
  if (!c) return null;
  const last = [...A.log].reverse().find((l) => l.by && l.by !== '')?.by;
  const label = (r: Reply) => REPLY_LABEL[A.k][r].replace('{m}', med?.firstName ?? 'him');
  const speaking = (id: string) => (last === id ? 'ring-2 ring-gold-400 rounded-md' : '');
  return (
    <Overlay z={1170} className="flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Face to face with ${displayName(c)}`} onClick={A.end ? onClose : undefined}>
      <div className="panel w-full max-h-[94vh] overflow-y-auto rounded-b-none border-red-800/50 sm:max-w-lg sm:rounded-lg" onClick={(e) => e.stopPropagation()} data-testid="argue-window">
        <div className="border-b border-noir-700 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Face to face</div>
          <h3 className="truncate font-display text-lg text-gold-300">{A.label}</h3>
        </div>
        {/* The two of them, and the room. */}
        <div className="flex items-start justify-between gap-2 px-3 pt-2">
          <div className="flex flex-col items-center text-[11px] text-stone-400"><span className={speaking('boss')}><Face s={s} c={boss} size={56} /></span><span className="mt-0.5">You</span></div>
          <div className="min-w-0 flex-1 pt-1 text-center">
            {A.room.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5" data-testid="argue-room">
                <span className="text-[10px] uppercase tracking-wider text-stone-500">In the room</span>
                {A.room.map((id) => s.characters[id] && (
                  <span key={id} className={`flex flex-col items-center text-[10px] text-stone-400 ${speaking(id)}`} title={displayName(s.characters[id])}>
                    <Face s={s} c={s.characters[id]} size={30} noSide /><span className="max-w-[4rem] truncate">{s.characters[id].firstName}</span>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-stone-400" title={`His temper ${A.heat}/100: past the line he walks`} data-testid="argue-temper">
              <span className="w-12 shrink-0 text-right">Temper</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded bg-noir-700"><span className={`block h-full ${A.heat >= 70 ? 'bg-red-500' : A.heat >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${A.heat}%` }} /></span>
              <span className="w-6 tabular-nums">{A.heat}</span>
            </div>
            <div className="mt-0.5 text-[10px] text-stone-500">Round {A.round}/4</div>
          </div>
          <div className="flex flex-col items-center text-[11px] text-stone-400">
            <span className={speaking(c.id)} style={{ transform: 'scaleX(-1)' }}><Face s={s} c={c} size={56} /></span>
            <span className="mt-0.5 max-w-[6rem] truncate">{displayName(c)}</span>
            {!A.end && <span className={`text-[10px] uppercase tracking-wider ${POS_TONE[A.pos]}`} data-testid="argue-posture">{POSTURE_LABEL[A.pos]}</span>}
          </div>
        </div>
        {/* The exchange. */}
        <div className="mt-2 max-h-[36vh] space-y-1.5 overflow-y-auto px-3 text-[13px]" aria-live="polite" data-testid="argue-log">
          {A.log.map((l, i) => {
            const t = flavor[i] ?? l.t;
            if (!l.by) return <div key={i} className="text-center text-[11px] italic text-stone-500">{t}</div>;
            if (l.by === 'boss') return <div key={i} className="text-left"><span className="inline-block max-w-[85%] rounded-lg rounded-bl-none bg-noir-700 px-2.5 py-1 text-stone-200">{t}</span></div>;
            if (l.by === A.t) return <div key={i} className="text-right"><span className="inline-block max-w-[85%] rounded-lg rounded-br-none border border-noir-600 bg-noir-800 px-2.5 py-1 text-stone-100">{t}</span></div>;
            const w = s.characters[l.by];
            return (
              <div key={i} className="text-center" data-testid="argue-voice">
                <span className="inline-block max-w-[90%] rounded-lg border border-noir-700 bg-noir-900/70 px-2 py-0.5 text-[12px] text-stone-300">
                  <b className="text-stone-200">{w?.firstName ?? '?'}</b>{l.v ? <span className="text-[10px] text-stone-500"> ({VOICE_LABEL[l.v].toLowerCase()})</span> : null}: {t}
                </span>
              </div>
            );
          })}
          {busy && <div className="text-right text-[11px] italic text-stone-500">{c.firstName} takes a breath...</div>}
          <div ref={end} />
        </div>
        {/* The boss's answers, or the done line. */}
        {A.end ? (
          <div className="px-3 pb-3 pt-2">
            <div className={`rounded border px-2 py-1.5 text-[13px] ${END_CLS[END_TONE[A.end]]}`} data-testid="argue-done">
              <div className="text-[10px] uppercase tracking-[0.25em] opacity-80">Done · in Your File</div>
              <div className="font-semibold">{END_LABEL[A.end]}</div>
              <div className="text-[12px]">{A.done?.replace(`${END_LABEL[A.end]}. `, '')}</div>
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => { onClose(); openBook({ person: A.t }); }} data-testid="argue-file">In Your File ▸</button>
              <button type="button" className="btn-gold ml-auto text-sm" onClick={onClose} autoFocus data-testid="argue-close">Go on</button>
            </div>
          </div>
        ) : (
          <div className="px-3 pb-3 pt-2">
            <div className="grid gap-1.5" data-testid="argue-replies">
              {opts.map(({ r, o }, i) => (
                <button key={r} type="button" disabled={busy || !!o.blocked} onClick={() => onReply(r)} title={o.why.join(', ')} data-testid={`argue-${r}`}
                  className={`rounded-md border px-2 py-1 text-left ${r === 'threaten' || r === 'double' ? 'border-red-400/40' : 'border-noir-600'} bg-noir-800/70 hover:border-gold-500 disabled:opacity-50`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-stone-100"><kbd className="mr-1 rounded border border-noir-500 px-1 text-[10px] font-normal text-stone-400">{i + 1}</kbd>{label(r)}</span>
                    <OddsBar odds={{ known: true, chance: o.p, label: 'It works', reasons: [] }} compact />
                  </span>
                  <span className="block text-[10px] text-stone-500">{o.blocked ?? o.hint}{o.why.length ? <span className="text-stone-600"> · {o.why.join(', ')}</span> : null}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

/** Shows the argument in progress over the game (it is saved with the game, so it comes back where it was). */
export function ArgueHost({ s, blocked }: { s: GameState; blocked?: boolean }) {
  const shell = useShell();
  const A = s.argue?.live;
  const [busy, setBusy] = useState(false);
  const [flavor, setFlavor] = useState<Record<string, Record<number, string>>>({});
  const close = () => shell.update?.((x) => closeArgument(x));
  useEscape(!!A?.end && !blocked, close);
  if (!A || blocked || !shell.update) return null;

  async function reply(r: Reply) {
    if (busy || !shell.update) return;
    const next = argueReply(s, r);
    if (next === s) return;
    shell.update(() => next);
    const B = next.argue?.live;
    if (!B) return;
    // Optional flavor: Claude rewords his last line (the words only; the outcome is already decided).
    setBusy(true);
    try {
      const sample = await sampleWithin(800);
      const msgs = sample && !sampleOff() ? flavorPrompt(next, B) : undefined;
      if (sample && msgs) {
        const res = await askJson(sample, msgs);
        const line = res.kind === 'ok' ? validateFlavor(res.data) : undefined;
        const idx = B.log.map((l) => l.by).lastIndexOf(B.t);
        if (line && idx >= 0) setFlavor((f) => ({ ...f, [B.id]: { ...(f[B.id] ?? {}), [idx]: line } }));
      }
    } finally {
      setBusy(false);
    }
  }

  return <ArgueWindow s={s} A={A} busy={busy} flavor={flavor[A.id]} onReply={(r) => void reply(r)} onClose={close} />;
}
