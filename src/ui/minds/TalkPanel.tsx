import { useEffect, useRef, useState } from 'react';
import { displayName } from '../../engine/characters';
import { dialoguePrompt, logDialogue, startDialogue, stepDialogue, talkOutcomeOf, validateDialogue, type Dialogue, type Tone } from '../../engine/minds/dialogue';
import {
  applyTalk, beginTalk, buildTalkPrompt, canTalk, clean, INTENT_TEXT, MAX_SAY, scriptedReply, TALK_TURNS, talkHeader, validateTalk,
  type TalkOutcome, type TalkTurn,
} from '../../engine/minds/talk';
import type { GameState } from '../../engine/types';
import { DialogueWindow } from './DialogueWindow';
import { askJson, sampleOff, sampleWithin } from './sampleClient';

/**
 * Sit and talk, in the two-way window: tone buttons (compliment, joke, push,
 * apologize, flatter, get angry, back off) move his meters by his nature; or
 * the boss says it in his own words and he answers as himself (Claude's lines
 * when the page can ask, his mind's lines otherwise). Everything that changes
 * the game goes through the engine's checks (minds/talk.ts, minds/dialogue.ts).
 */
export function TalkPanel({ s, id, update, onClose }: { s: GameState; id: string; update: (f: (s: GameState) => GameState) => void; onClose: () => void }) {
  const c = s.characters[id];
  const [d, setD] = useState<Dialogue>(() => startDialogue(s, id, 'talk', undefined, TALK_TURNS));
  const [turns, setTurns] = useState<TalkTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | undefined>();
  const [started, setStarted] = useState(false);
  const [settled, setSettled] = useState<string | undefined>();
  const toneRounds = useRef(0);
  const live = useRef(s);
  live.current = s;
  const ctl = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => ctl.current?.abort(), []);
  if (!c) return null;
  const can = canTalk(s, id);

  const begin = (): boolean => {
    if (started) return true;
    if (!can.ok) { setNote(can.why); return false; }
    update((x) => beginTalk(x, id));
    setStarted(true);
    return true;
  };
  /** The tone rounds' net effect is applied once, when the talk ends. */
  const finish = (nd: Dialogue) => {
    if (settled) return;
    update((x) => logDialogue(x, nd, 'Sat and talked'));
    if (toneRounds.current > 0) {
      const out = talkOutcomeOf(nd);
      update((x) => applyTalk(x, id, out));
      setSettled(`${INTENT_TEXT[out.intent]}${out.opinion ? ` · ${out.opinion > 0 ? '+' : ''}${out.opinion} opinion of you` : ''}.`);
    } else setSettled('The talk is over.');
  };

  async function onTone(tone: Tone) {
    if (busy || d.end || !begin()) return;
    toneRounds.current++;
    setBusy(true);
    let ai;
    const sample = await sampleWithin(800);
    if (sample && !sampleOff()) {
      ctl.current = new AbortController();
      const r = await askJson(sample, dialoguePrompt(live.current, d, tone, ''), ctl.current.signal);
      if (r.kind === 'ok') ai = validateDialogue(r.data);
      else if (r.kind === 'busy') setNote('He\'s thinking it over.');
    }
    const r = stepDialogue(live.current, d, tone, ai ? { ai } : {});
    setD(r.d);
    setBusy(false);
    if (r.d.end) finish(r.d);
  }

  async function onSay(text0: string) {
    const text = clean(text0, MAX_SAY);
    if (!text || busy || d.end || !begin()) return;
    setBusy(true);
    setNote(undefined);
    let out: TalkOutcome | undefined;
    const sample = await sampleWithin(1500);
    if (sample && !sampleOff()) {
      const p = buildTalkPrompt(live.current, id, turns, text);
      ctl.current = new AbortController();
      const r = await askJson(sample, p.messages, ctl.current.signal);
      if (r.kind === 'ok') { const v = validateTalk(r.data, p.allow); if (v.ok) out = v.out; else setNote('He mutters something, then says it plainer.'); }
      else if (r.kind === 'busy') { setNote('He\'s thinking it over. Give him a minute.'); setBusy(false); return; }
      else if (r.kind === 'fail' && r.code !== 'cancelled') setNote('He loses the thread for a moment.');
    }
    out ??= scriptedReply(live.current, id, text, turns.length);
    const o = out;
    update((x) => applyTalk(x, id, o));
    setTurns((t) => [...t, { role: 'boss', text }, { role: 'npc', text: o.reply, out: o }]);
    const nd: Dialogue = {
      ...d, round: d.round + 1,
      interest: Math.max(0, Math.min(100, d.interest + o.opinion * 3 + Math.round(o.mood / 2))),
      anger: Math.max(0, Math.min(100, d.anger + (o.intent === 'threaten' ? 15 : o.intent === 'refuse' ? 5 : o.opinion < 0 ? 4 : -2))),
      log: [...d.log, { who: 'boss', text }, { who: 'them', text: o.reply }, ...(o.reveals.length ? [{ who: 'narrator' as const, text: 'He told you something (see What he told you).' }] : [])],
    };
    if (nd.round >= nd.max) nd.end = 'done';
    setD(nd);
    setBusy(false);
    if (nd.end) finish(nd);
  }

  return (
    <DialogueWindow s={s} d={d} title={`Sit and talk with ${displayName(c)}`} busy={busy}
      note={note ?? (!started && !can.ok ? can.why : talkHeader(s, id))}
      onTone={can.ok || started ? (t) => void onTone(t) : undefined}
      onSay={can.ok || started ? (t) => void onSay(t) : undefined}
      result={settled}
      onClose={() => { if (started && !d.end) finish(d); onClose(); }} />
  );
}
