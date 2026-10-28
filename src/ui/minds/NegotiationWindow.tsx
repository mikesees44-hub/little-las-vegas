import { useState } from 'react';
import { displayName } from '../../engine/characters';
import {
  dialoguePrompt, dialogueSummary, negotiable, resolveEventNow, startDialogue, stepDialogue, termsToChoice, validateDialogue,
  type Dialogue, type Tone,
} from '../../engine/minds/dialogue';
import type { EventInstance, GameState } from '../../engine/types';
import { useShell } from '../shell/context';
import { DialogueWindow } from './DialogueWindow';
import { askJson, sampleOff, sampleWithin } from './sampleClient';
import { postSettled } from './settled';

/**
 * A decision with someone on the other side, talked out in the two-way
 * window: his stance (what he wants, how far he bends, his patience and his
 * temper), the boss's tones (firm, generous, threaten, flatter, stall, walk
 * away), a figure to counter with. The agreed terms become the decision's own
 * choice with its money scaled within bounds; no deal, its refusal/default.
 * The classic answers stay one click away ("Just pick"). Either way the
 * decision is SETTLED NOW (engine dialogue.ts `resolveEventNow`): applied at
 * once, shown at once, never again at the week's turn.
 */
export function NegotiationWindow({ s, ev, onClose }: { s: GameState; ev: EventInstance; onClose: () => void }) {
  const shell = useShell();
  const n = negotiable(s, ev);
  const [d, setD] = useState<Dialogue | undefined>(() => (n ? startDialogue(s, n.counterpart, 'negotiate', n.stake) : undefined));
  const [busy, setBusy] = useState(false);
  if (!n || !d) return null;
  const c = s.characters[n.counterpart];

  const settle = (choiceId: string, scale: number, dd?: Dialogue) => {
    if (!shell.update) return;
    const r = resolveEventNow(s, ev.iid, choiceId, scale);
    if (r.state === s) return;
    shell.update(() => r.state);
    postSettled(ev.title, `${dd ? `${dialogueSummary(s, dd)} ` : ''}${r.text}`);
    onClose();
  };

  async function onTone(tone: Tone, offer?: number) {
    if (!d || busy) return;
    setBusy(true);
    let ai;
    const sample = await sampleWithin(800);
    if (sample && !sampleOff()) {
      const r = await askJson(sample, dialoguePrompt(s, d, tone, ''));
      if (r.kind === 'ok') ai = validateDialogue(r.data);
    }
    const r = stepDialogue(s, d, tone, { offer, ...(ai ? { ai } : {}) });
    setD(r.d);
    setBusy(false);
  }

  const terms = d.end ? termsToChoice(n, d) : undefined;
  const termsChoice = terms ? ev.choices.find((x) => x.id === terms.choiceId) : undefined;
  return (
    <DialogueWindow s={s} d={d} title={`${ev.title}: talk it out with ${c ? displayName(c) : 'him'}`} busy={busy}
      onTone={(t, o) => void onTone(t, o)} offerLabel={n.stake.dir === 1 ? 'You offer' : 'You ask'}
      result={terms && termsChoice ? (d.end === 'deal' ? `Terms: ${termsChoice.label} at ${Math.round(terms.scale * 100)}% of the money.` : `No deal: ${termsChoice.label}.`) : undefined}
      onClose={onClose}
      footer={(
        <div className="space-y-1.5">
          {terms && termsChoice && shell.update && (
            <button type="button" className="btn-gold w-full py-1 text-sm" onClick={() => settle(terms.choiceId, terms.scale, d)} data-testid="negotiation-settle">
              {d.end === 'deal' ? 'Shake on it (settled now)' : 'Leave it there (settled now)'}
            </button>
          )}
          <details className="text-[11px] text-stone-400">
            <summary className="cursor-pointer">Just pick (settled now)</summary>
            <div className="mt-1 grid gap-1">
              {ev.choices.filter((x) => !x.disabledReason).map((x) => (
                <button key={x.id} type="button" className="btn-ghost py-1 text-left text-xs" onClick={() => settle(x.id, 1)} data-testid="negotiation-pick">{x.label}</button>
              ))}
            </div>
          </details>
        </div>
      )} />
  );
}
