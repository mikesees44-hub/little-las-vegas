import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { autoFinish, minigameDef, sessionOptions, startSession, stepSession, type MgSession, type MinigameId } from '../../engine/minigames';
import type { Effect, GameState } from '../../engine/types';
import { Chips } from '../components/Chips';
import { prefersReducedMotion, useTypewriter } from '../cutscene/Cutscene';
import { MgStill } from './MgStill';
import { NewspaperReel, type ReelPhoto } from './NewspaperReel';
import { TrialPanel } from './TrialPanel';
import { CinematicBeat } from './Cinematic';

const CINEMATIC: Partial<Record<MinigameId, boolean>> = { madeboss: true, ceremony: true };

/**
 * The mini-game screen: a cutscene-style intro card, then the scene itself
 * (the game's own panel, the narration, the choices with their odds), then
 * the outcome and — when there is one — the newspaper reel. "Let it play
 * out" is always one click away and finishes with the same odds.
 */

export type PanelProps = { s: GameState; ses: MgSession; onMove: (id: string) => void; busy?: boolean };
const PANELS: Partial<Record<MinigameId, ComponentType<PanelProps>>> = {
  trial: TrialPanel as ComponentType<PanelProps>,
  arraignment: TrialPanel as ComponentType<PanelProps>,
};
export function registerPanel(id: MinigameId, c: ComponentType<PanelProps>): void {
  PANELS[id] = c;
}

const PHOTO: Partial<Record<MinigameId, ReelPhoto>> = { trial: 'courthouse', arraignment: 'courthouse', heist: 'car', cards: 'restaurant', sitdown: 'restaurant', collection: 'window', sweep: 'window', election: 'courthouse' };

const PHASE_LABEL: Record<string, string> = {
  side: 'Which side?', arraign: 'The plea', bail: 'Bail', flip: 'The offer', path: 'After', lawyer: 'The lawyer', jury: 'Jury selection', tamper: 'The jury',
  case: "The government's case", cross: 'Cross-examination', deal: 'The offer', defense: 'The defense', closing: 'Closing arguments', verdict: 'The verdict', sentence: 'Sentencing', knock: '6:10 a.m.',
};

export function MinigameScreen({ s, game, iid, params, parts, onDone, onCancel }: {
  s: GameState;
  game: MinigameId;
  iid: string;
  params: Record<string, string | number>;
  parts?: Record<string, Effect[]>;
  onDone: (moves: string[]) => void;
  onCancel: () => void;
}) {
  const first = useMemo(() => startSession(s, game, iid, params, parts ?? {}), [s, game, iid, params, parts]);
  const [ses, setSes] = useState<MgSession>(first);
  const [stage, setStage] = useState<'intro' | 'play' | 'reel' | 'epilogue' | 'end'>('intro');
  const [epi, setEpi] = useState(0);
  const reduced = prefersReducedMotion();
  const [introText, introDone, finishIntro] = useTypewriter(stage === 'intro' ? ses.intro.text : '', 42, reduced);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [ses.beats.length]);
  useEffect(() => {
    if (ses.done && stage === 'play') setStage(ses.outcome?.headline ? 'reel' : ses.outcome?.epilogue ? 'epilogue' : 'end');
  }, [ses.done, stage, ses.outcome]);

  const opts = ses.done ? [] : sessionOptions(s, ses);
  const odds = ses.done ? [] : (minigameDef(game).odds?.(s, ses) ?? []);
  const move = (id: string) => setSes((x) => stepSession(s, x, id));
  const playOut = () => {
    setSes((x) => autoFinish(s, x));
    if (stage === 'intro') setStage('play');
  };
  const Panel = PANELS[game];
  const o = ses.outcome;

  return (
    <div className="fixed inset-0 z-[2500] bg-black text-stone-200 flex flex-col" role="dialog" aria-modal="true" aria-label={ses.intro.title} data-testid="minigame">
      {stage === 'intro' && (
        <div className="flex-1 flex flex-col" onClick={() => (introDone ? setStage('play') : finishIntro())}>
          <div className="relative flex-1 overflow-hidden">
            <div className={`absolute inset-0 ${reduced ? '' : 'llv-kb-a'}`}><MgStill scene={ses.intro.scene} seed={s.week} /></div>
            <div className="absolute inset-x-0 top-0 h-[8%] bg-black" />
            <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black" />
          </div>
          <div className="bg-black px-5 sm:px-16 pb-6 pt-3 min-h-[180px]">
            <div className="text-[10px] uppercase tracking-[0.4em] text-stone-500">{ses.intro.kicker}</div>
            <h2 className="font-display text-2xl sm:text-3xl text-gold-400">{ses.intro.title}</h2>
            <p className="font-display text-lg sm:text-xl text-stone-100 mt-2 max-w-3xl leading-snug">{introText}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-gold" data-testid="mg-begin" onClick={(e) => { e.stopPropagation(); setStage('play'); }}>Begin</button>
              <button className="btn-ghost" data-testid="mg-playout" onClick={(e) => { e.stopPropagation(); playOut(); }}>Let it play out</button>
              <button className="text-xs text-stone-500 hover:text-stone-300 ml-auto" onClick={(e) => { e.stopPropagation(); onCancel(); }}>Back to the decision</button>
            </div>
          </div>
        </div>
      )}

      {stage === 'play' && CINEMATIC[game] && !ses.done && (
        <CinematicBeat s={s} ses={ses} opts={opts} onMove={move} onPlayOut={playOut} />
      )}

      {stage !== 'intro' && !(CINEMATIC[game] && !ses.done && stage === 'play') && (
        <>
          <header className="flex items-center gap-3 px-3 sm:px-6 py-2 border-b border-noir-700 bg-noir-950">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.35em] text-stone-500">{ses.intro.kicker}</div>
              <div className="font-display text-lg sm:text-xl text-gold-400 truncate">{ses.intro.title}</div>
            </div>
            {!ses.done && <div className="text-xs text-amber-200 border border-amber-300/30 rounded px-2 py-0.5 shrink-0">{PHASE_LABEL[ses.phase] ?? ses.phase}</div>}
            {!ses.done && <button className="btn-ghost text-xs py-1 ml-auto shrink-0" data-testid="mg-playout" onClick={playOut}>Let it play out</button>}
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto max-w-6xl grid gap-3 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
              <section className="min-w-0 space-y-3">
                {Panel ? <Panel s={s} ses={ses} onMove={move} busy={ses.done} /> : <div className="relative h-48 rounded overflow-hidden"><MgStill scene={ses.intro.scene} seed={s.week} /></div>}
                {odds.length > 0 && (
                  <div className="rounded border border-noir-700 bg-noir-900 p-2" data-testid="mg-odds">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">The odds, and where they come from</div>
                    <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 text-xs">
                      {odds.map((r, i) => (
                        <div key={i} className="flex justify-between gap-2"><span className="text-stone-400 truncate">{r.label}</span><span className={`tabular-nums ${r.tone === 'bad' ? 'text-red-300' : r.tone === 'good' ? 'text-emerald-300' : 'text-stone-100 font-semibold'}`}>{r.value}</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              <aside className="space-y-3 min-w-0">
                <div ref={logRef} className="rounded border border-noir-700 bg-noir-950 p-2 max-h-[38vh] lg:max-h-[46vh] overflow-y-auto text-sm space-y-1.5" data-testid="mg-log">
                  {ses.beats.length === 0 && <p className="text-stone-500 italic">{ses.intro.text}</p>}
                  {ses.beats.map((b, i) => (
                    <p key={i} className={b.tone === 'good' ? 'text-emerald-200' : b.tone === 'bad' ? 'text-red-200' : b.tone === 'quote' ? 'font-display italic text-stone-100' : 'text-stone-300'}>
                      {b.who && <span className="text-[10px] uppercase tracking-widest text-stone-500 mr-1">{b.who}:</span>}
                      {b.text}
                    </p>
                  ))}
                </div>
                {!ses.done && (
                  <div className="space-y-1.5" data-testid="mg-options">
                    {opts.filter((x) => !(ses.phase === 'jury' && x.id.startsWith('strike_'))).map((x) => (
                      <button key={x.id} disabled={!!x.disabled} onClick={() => move(x.id)} data-testid="mg-option"
                        className={`w-full text-left rounded-md border px-3 py-2 transition-colors disabled:opacity-40 ${x.tone === 'dirty' ? 'border-blood-500/50 bg-blood-500/10 hover:border-blood-400' : x.drastic ? 'border-amber-500/50 bg-amber-500/5 hover:border-amber-400' : 'border-noir-600 bg-noir-800 hover:border-gold-500'}`}>
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-stone-100 text-sm">{x.label}</span>
                          {x.odds !== undefined && <span className="chip-neutral shrink-0">{Math.round(x.odds * 100)}%</span>}
                        </div>
                        {x.detail && <div className="text-xs text-stone-400 mt-0.5">{x.detail}</div>}
                        {x.disabled && <div className="text-xs text-red-400 mt-0.5">{x.disabled}</div>}
                      </button>
                    ))}
                  </div>
                )}
                {ses.done && o && stage === 'end' && (
                  <div className={`rounded border p-3 ${o.tone === 'good' ? 'border-emerald-500/50' : o.tone === 'bad' ? 'border-blood-400/60' : 'border-gold-600/50'}`} data-testid="mg-outcome">
                    <div className="font-display text-xl text-gold-300">{o.title}</div>
                    <p className="text-stone-200 mt-1">{o.text}</p>
                    <Chips s={s} effects={o.effects} />
                    <button className="btn-gold mt-3 w-full" data-testid="mg-continue" onClick={() => onDone(ses.moves)}>Continue</button>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </>
      )}

      {stage === 'reel' && o?.headline && (
        <NewspaperReel
          reel={{ paper: o.headline.paper, headline: o.headline.headline, subhead: o.headline.body, date: s.date, photo: PHOTO[game] ?? 'courthouse', consequence: o.text }}
          onDone={() => setStage(o.epilogue ? 'epilogue' : 'end')}
        />
      )}
      {stage === 'epilogue' && o?.epilogue && (
        <div className="fixed inset-0 z-[3200] bg-black flex flex-col" data-testid="mg-epilogue" onClick={() => (epi + 1 < o.epilogue!.length ? setEpi(epi + 1) : setStage('end'))}>
          <div className="relative flex-1 overflow-hidden"><MgStill scene="street" seed={epi + 3} /></div>
          <div className="px-6 sm:px-16 pb-8 pt-4 min-h-[150px]">
            <div className="text-[10px] uppercase tracking-[0.4em] text-stone-500">Epilogue · {epi + 1} / {o.epilogue.length}</div>
            <p className="font-display text-xl text-stone-100 mt-2 max-w-3xl">{o.epilogue[epi]}</p>
          </div>
        </div>
      )}
    </div>
  );
}
