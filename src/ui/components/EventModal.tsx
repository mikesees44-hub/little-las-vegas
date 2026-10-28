import { useState } from 'react';
import { compareChoices, PRIORITIES, PRIORITY_LABEL, type Priority } from '../../engine/advice';
import { recurringOfAll } from '../../engine/recurring';
import { AdviceButton } from '../advice/AdviceButton';
import { getSettings, setSettings } from '../settings';
import { displayName } from '../../engine/characters';
import { ChoiceWhy } from '../clarity/WhyPanel';
import type { EventInstance, GameState } from '../../engine/types';
import { Chips } from './Chips';
import { Face } from './People';
import { Modal } from './Modal';
import { useNumberKeys } from '../keys';

export function EventModal({ s, ev, index, total, selected, onChoose, onClose }: {
  s: GameState;
  ev: EventInstance;
  index: number;
  total: number;
  selected?: string;
  onChoose: (choiceId: string) => void;
  onClose: () => void;
}) {
  const ids = ev.actors ?? (ev.meta?.charId ? [String(ev.meta.charId)] : []);
  const actors = ids.map((id) => s.characters[id]).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 3);
  const [prio, setPrio] = useState<Priority | undefined>(() => getSettings().priority);
  const advice = compareChoices(s, ev.choices, prio);
  const dflt = ev.choices.find((c) => c.id === ev.defaultChoiceId) ?? ev.choices[0];
  const pickPrio = (p: Priority | undefined) => { setPrio(p); setSettings({ priority: p }); };
  // Number keys pick a choice (1 = the first card).
  useNumberKeys(true, ev.choices.length, (i) => { const c = ev.choices[i]; if (c && !c.disabledReason) onChoose(c.id); });
  return (
    <Modal onClose={onClose}>
      <div className="p-4 sm:p-6">
        <div className="flex justify-between items-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">
            Decision {index + 1} of {total}
          </div>
          <button className="text-xs text-stone-500 hover:text-gold-300" onClick={onClose} data-testid="decide-later">Decide later ✕</button>
        </div>
        <div className="flex gap-3 items-start mt-1">
          {actors.length > 0 && (
            <div className="flex -space-x-2 shrink-0">
              {actors.map((c) => <Face key={c.id} s={s} c={c} size={actors.length > 1 ? 52 : 64} />)}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-display text-2xl text-gold-400 leading-tight">{ev.title}</h2>
            {actors.length > 0 && (
              <div className="text-[11px] text-stone-400 mt-0.5">
                {actors.map((c, i) => <span key={c.id}>{i > 0 && ' · '}{displayName(c)}{c.rank !== 'civilian' ? `, ${c.rank}` : c.office ? `, ${c.office}` : ''}</span>)}
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-stone-300 leading-relaxed">{ev.text}</p>
        {dflt && <p className="mt-1 text-[11px] text-stone-500" data-testid="event-default">If you don't decide before the week turns: <span className="text-stone-300">{dflt.label}</span>.</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]" role="radiogroup" aria-label="What matters most right now" data-testid="priority-picker">
          <span className="text-stone-500 mr-1">What matters most right now?</span>
          {PRIORITIES.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={prio === p} onClick={() => pickPrio(prio === p ? undefined : p)}
              className={`rounded border px-1.5 py-0.5 ${prio === p ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>{PRIORITY_LABEL[p]}</button>
          ))}
          <span className="ml-auto"><AdviceButton s={s} subject={{ kind: 'event', iid: ev.iid }} onChoose={onChoose} auto={false} /></span>
        </div>
        <p className="mt-1 text-[10px] text-stone-500">The tags below weigh each option by what you pick; none of them is "the right answer". Money figures marked "estimate" are reads, not promises.</p>
        <div className="mt-3 space-y-2">
          {ev.choices.map((c, i) => {
            return (
              <div
                key={c.id}
                className={`rounded-md border transition-colors ${
                  selected === c.id ? 'border-gold-400 bg-gold-500/10' : 'border-noir-600 bg-noir-800 hover:border-gold-500'
                } ${c.disabledReason ? 'opacity-40' : ''}`}
                data-testid="event-choice"
              >
                <button type="button" disabled={!!c.disabledReason} onClick={() => onChoose(c.id)} className="w-full text-left px-3 pt-2.5 pb-1 disabled:cursor-not-allowed">
                  <div className="font-semibold text-stone-100">{i < 9 && <kbd className="mr-1.5 rounded border border-noir-500 px-1 text-[10px] font-normal text-stone-400" title={`Press ${i + 1}`} data-testid="choice-key">{i + 1}</kbd>}{c.label}</div>
                  {c.detail && <div className="text-xs text-stone-400 mt-0.5">{c.detail}</div>}
                  <Chips s={s} effects={c.effects} />
                  {recurringOfAll(s, c.effects).map((r, j) => <div key={j} className="text-[11px] text-amber-200 mt-1" data-testid="recurring-note">↻ {r.text}</div>)}
                  {c.disabledReason && <div className="text-xs text-red-400 mt-1">Unavailable: {c.disabledReason.charAt(0).toLowerCase()}{c.disabledReason.slice(1)}</div>}
                </button>
                <div className="px-3 pb-2"><ChoiceWhy a={advice[i]} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
