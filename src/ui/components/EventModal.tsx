import type { EventInstance, GameState } from '../../engine/types';
import { Chips } from './Chips';
import { Modal } from './Modal';

export function EventModal({ s, ev, index, total, selected, onChoose, onClose }: {
  s: GameState;
  ev: EventInstance;
  index: number;
  total: number;
  selected?: string;
  onChoose: (choiceId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="p-4 sm:p-6">
        <div className="flex justify-between items-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">
            Decision {index + 1} of {total}
          </div>
          <button className="text-xs text-stone-500 hover:text-gold-300" onClick={onClose}>Later ✕</button>
        </div>
        <h2 className="font-display text-2xl text-gold-400 mt-1">{ev.title}</h2>
        <p className="mt-2 text-stone-300 leading-relaxed">{ev.text}</p>
        <div className="mt-4 space-y-2">
          {ev.choices.map((c) => {
            return (
              <button
                key={c.id}
                disabled={!!c.disabledReason}
                onClick={() => onChoose(c.id)}
                className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors ${
                  selected === c.id ? 'border-gold-400 bg-gold-500/10' : 'border-noir-600 bg-noir-800 hover:border-gold-500'
                } disabled:opacity-40`}
              >
                <div className="font-semibold text-stone-100">{c.label}</div>
                {c.detail && <div className="text-xs text-stone-400 mt-0.5">{c.detail}</div>}
                <Chips s={s} effects={c.effects} />
                {c.disabledReason && <div className="text-xs text-red-400 mt-1">{c.disabledReason}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
