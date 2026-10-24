import { displayName } from '../../engine/characters';
import type { EventInstance, GameState } from '../../engine/types';
import { Chips } from './Chips';
import { Face } from './People';
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
  const ids = ev.actors ?? (ev.meta?.charId ? [String(ev.meta.charId)] : []);
  const actors = ids.map((id) => s.characters[id]).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 3);
  return (
    <Modal onClose={onClose}>
      <div className="p-4 sm:p-6">
        <div className="flex justify-between items-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">
            Decision {index + 1} of {total}
          </div>
          <button className="text-xs text-stone-500 hover:text-gold-300" onClick={onClose}>Later ✕</button>
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
