import { useState } from 'react';
import type { GameState, RivalId } from '../../engine/types';
import { checkThought, seenThought, thoughtPrompt } from '../../engine/ai/rivalMinds';
import { askJson, sampleOff, sampleWithin } from '../minds/sampleClient';

/**
 * "What he's thinking" on a rival's card (engine/ai/rivalMinds.ts): his
 * private note this week, true to the engine's own next move, seen only
 * through a way in (a spy, an informant, an Ear close to him, the boss's own
 * nose). The templated note shows at once; "In his words" may ask Claude to
 * voice it from the brief (never saved).
 */
export function RivalMind({ s, rival }: { s: GameState; rival: RivalId }) {
  const { access, thought } = seenThought(s, rival);
  const [voiced, setVoiced] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const key = `${rival}:${s.week}`;
  if (!access.ok || !thought) {
    return <div className="mt-1 text-[11px] italic text-stone-500" data-testid={`rival-mind-locked-${rival}`}>{access.why ?? 'You don\'t know what he is thinking.'}</div>;
  }
  async function voice() {
    if (busy || !thought) return;
    setBusy(true);
    try {
      const sample = await sampleWithin(800);
      if (!sample || sampleOff()) return;
      const res = await askJson(sample, thoughtPrompt(thought));
      const line = res.kind === 'ok' ? checkThought(s, thought, res.data) : undefined;
      if (line) setVoiced((v) => ({ ...v, [key]: line }));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`mt-1 rounded border px-2 py-1 text-[11px] ${thought.aimsAtYou ? 'border-red-700/50 bg-red-900/15' : 'border-noir-600 bg-noir-900/50'}`} data-testid={`rival-mind-${rival}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-stone-500">What he's thinking</span>
        {!voiced[key] && !sampleOff() && <button type="button" className="btn-quiet px-1 text-[10px]" disabled={busy} onClick={() => void voice()} data-testid={`rival-mind-voice-${rival}`}>{busy ? '…' : 'In his words'}</button>}
      </div>
      <p className="italic text-stone-200" data-testid={`rival-mind-text-${rival}`}>"{voiced[key] ?? thought.line}"</p>
      <div className="text-[10px] text-stone-500">Through {access.via}{thought.aimsAtYou ? <span className="text-red-300"> · aimed at you</span> : null}</div>
    </div>
  );
}
