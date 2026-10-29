import { useState } from 'react';
import { DEEDS } from '../../engine/deeds/catalog';
import { checkVoice, voicePrompt } from '../../engine/deeds/voice';
import type { DeedLog } from '../../engine/deeds/types';
import type { GameState } from '../../engine/types';
import { askJson, sampleOff, sampleWithin } from '../minds/sampleClient';

const TONE: Record<string, string> = { crit: 'text-emerald-300', success: 'text-stone-200', fail: 'text-stone-400', critFail: 'text-red-300' };

/**
 * Between people lately: the deeds done (by anyone, to anyone), newest first.
 * "Hear it" retells one in the period voice when the page can ask Claude; the
 * outcome is always the engine's (deeds/voice.ts validates the line).
 */
export function DeedFeed({ s, who, max = 10 }: { s: GameState; who?: string; max?: number }) {
  const [voiced, setVoiced] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | undefined>();
  const list = (s.deeds?.log ?? []).filter((l) => !who || l.a === who || l.t === who).slice(-max).reverse();
  if (!list.length) return <div className="mt-1 text-stone-500 text-xs" data-testid="deed-feed">Nothing lately.</div>;
  const key = (l: DeedLog) => `${l.w}:${l.a}:${l.t}:${l.id}`;
  const hear = async (l: DeedLog) => {
    const k = key(l);
    setBusy(k);
    try {
      const sample = await sampleWithin(1500);
      if (!sample) return;
      const r = await askJson(sample, voicePrompt(s, l));
      const line = r.kind === 'ok' ? checkVoice(s, l, r.data) : undefined;
      if (line) setVoiced((v) => ({ ...v, [k]: line }));
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <ul className="mt-1 space-y-0.5 text-xs" data-testid="deed-feed">
      {list.map((l) => {
        const k = key(l);
        return (
          <li key={k} className={TONE[l.r] ?? 'text-stone-300'}>
            <span className="text-stone-500">wk {l.w} · {DEEDS[l.id]?.cat ?? ''}:</span> {voiced[k] ?? l.x}
            {!voiced[k] && !sampleOff() && (
              <button type="button" className="ml-1 text-[10px] text-stone-600 hover:text-gold-400" disabled={busy === k} onClick={() => void hear(l)} title="Retold in the period voice (the outcome stays the same)">{busy === k ? '…' : 'Hear it'}</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
