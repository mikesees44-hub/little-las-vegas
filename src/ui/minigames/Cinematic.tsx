import type { MgOption, MgSession } from '../../engine/minigame';
import type { SceneData } from '../../engine/scenes';
import type { GameState } from '../../engine/types';
import { prefersReducedMotion, useTypewriter } from '../cutscene/Cutscene';
import { Face } from '../components/People';
import { MgStill } from './MgStill';

/** A scripted scene beat: a full-screen noir card, the real faces, typewriter text, the choices. */
export function CinematicBeat({ s, ses, opts, onMove, onPlayOut }: { s: GameState; ses: MgSession<SceneData>; opts: MgOption[]; onMove: (id: string) => void; onPlayOut: () => void }) {
  const card = ses.d.card;
  const reduced = prefersReducedMotion();
  const [text, done, finish] = useTypewriter(card.text, 48, reduced);
  const actors = card.actors.map((id) => s.characters[id]).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 5);
  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="cinematic" onClick={() => !done && finish()}>
      <div className="relative h-[42vh] sm:h-[50vh] shrink-0 overflow-hidden">
        <div className={`absolute inset-0 ${reduced ? '' : ['llv-kb-a', 'llv-kb-b', 'llv-kb-c'][ses.d.i % 3]}`} key={ses.d.i}><MgStill scene={card.scene} seed={s.week + ses.d.i} /></div>
        <div className="absolute inset-x-0 top-0 h-[8%] bg-black" />
        <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black" />
        {actors.length > 0 && (
          <div className="absolute left-3 sm:left-8 bottom-[10%] flex gap-1.5">
            {actors.map((c) => <Face key={c.id} s={s} c={c} size={actors.length > 3 ? 48 : 60} />)}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto bg-black px-5 sm:px-16 pb-6 pt-3">
        <div className="text-[10px] uppercase tracking-[0.4em] text-stone-500">{card.kicker} · {ses.d.i + 1} / {ses.d.beats.length}</div>
        <p className="font-display text-lg sm:text-xl text-stone-100 mt-2 max-w-3xl leading-snug whitespace-pre-line" aria-live="polite">{text}</p>
        <div className={`mt-4 max-w-3xl space-y-1.5 transition-opacity ${done ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {opts.map((x) => (
            <button key={x.id} disabled={!!x.disabled} data-testid="mg-option" onClick={(e) => { e.stopPropagation(); onMove(x.id); }}
              className={`w-full text-left rounded-md border px-3 py-2 disabled:opacity-40 ${x.id === 'next' ? 'border-noir-600 bg-transparent hover:border-gold-500 w-auto inline-block' : 'border-noir-600 bg-noir-900 hover:border-gold-500'}`}>
              <div className="font-semibold text-stone-100 text-sm">{x.label}</div>
              {x.detail && <div className="text-xs text-stone-400 mt-0.5">{x.detail}</div>}
              {x.disabled && <div className="text-xs text-red-400 mt-0.5">{x.disabled}</div>}
            </button>
          ))}
        </div>
        <button className="mt-3 text-xs text-stone-500 hover:text-stone-300" data-testid="mg-playout" onClick={(e) => { e.stopPropagation(); onPlayOut(); }}>Let it play out</button>
      </div>
    </div>
  );
}
