import { CLIP_URLS } from '../components/CutClip';
import { useEffect, useState } from 'react';
import { getSettings, TEXT_CPS } from '../settings';
import type { CutsceneCue } from '../../engine/types';
import { NoirStill } from './NoirStill';
import { AssetImg } from '../hood/AssetImg';
import { CUTSCENE_ART, NOIR_GRADE } from '../hood/art/sceneArt';
import { stinger } from '../audio';

/**
 * Video slot: drop a clip's URL here under a cutscene key and it plays in
 * place of the drawn still (muted, inline, with the still as poster fallback).
 */
const CHURCH = '/_blob/25fa9dfa1f331c39f1c4837e8fafa445'; // funeral at St. Ann's (user's Gemini clip)
const OFFICE = '/_blob/46a7b354dd048daa000e67374ee4b0f7'; // the boss's office: loyalty (user's Gemini clip)
export const CUTSCENE_VIDEOS: Partial<Record<string, string>> = {
  opening: CHURCH,
  funeral: CHURCH,
  // The owner's montage shots (CutClip.tsx).
  succession: CLIP_URLS.take_chair,
  heir_rises: CLIP_URLS.take_chair,
  boss_death: CLIP_URLS.funeral_cars,
  arrest_interrogation: CLIP_URLS.feds_door,
  sitdown: OFFICE,
  betrayal_confrontation: OFFICE,
};

export function prefersReducedMotion(): boolean {
  if (getSettings().reducedMotion) return true;
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The scene typewriters' pace: the player's text speed, never slower than `floor` (an authored beat's own pace). */
export function sceneCps(floor = 0): number {
  return Math.max(floor, TEXT_CPS[getSettings().textSpeed]);
}

/**
 * Text revealed a few characters at a time (instantly when motion is reduced). `finish` completes
 * the line being typed (to the next line break); the text after it keeps typing. On the last line
 * it completes the text.
 */
export function useTypewriter(text: string, cps = 60, instant = false): [string, boolean, () => void] {
  const [n, setN] = useState(instant ? text.length : 0);
  useEffect(() => {
    setN(instant ? text.length : 0);
  }, [text, instant]);
  useEffect(() => {
    if (n >= text.length) return;
    // ~30 frames a second, several characters a frame at speed: smooth and quick.
    const step = Math.max(1, Math.round(cps / 30));
    const t = setTimeout(() => setN((x) => Math.min(text.length, x + step)), Math.max(16, 1000 / Math.min(cps, 30)));
    return () => clearTimeout(t);
  }, [n, text, cps]);
  const finish = () => setN((x) => {
    const br = text.indexOf('\n', x);
    return br < 0 ? text.length : br + 1;
  });
  return [text.slice(0, n), n >= text.length, finish];
}

/** Full-screen cards for this week's big moments, one after another. */
export function CutscenePlayer({ cues, onDone }: { cues: CutsceneCue[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const reduced = prefersReducedMotion();
  const cue = cues[i];
  const [shown, done, finish] = useTypewriter(cue?.text ?? '', TEXT_CPS[getSettings().textSpeed], reduced || getSettings().textSpeed === 'instant');
  const next = () => {
    if (!done) return finish();
    if (i + 1 < cues.length) setI(i + 1);
    else onDone();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onDone(); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopImmediatePropagation();
        next();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });
  useEffect(() => {
    if (cue) void stinger(cue.key);
  }, [cue]);
  if (!cue) return null;
  const video = CUTSCENE_VIDEOS[cue.key];
  const pan = ['llv-kb-a', 'llv-kb-b', 'llv-kb-c'][(cue.week + i) % 3];
  return (
    <div className="fixed inset-0 z-[3000] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label={cue.title} data-testid="cutscene" onClick={next}>
      <div className="relative flex-1 overflow-hidden">
        <div className={`absolute inset-0 ${reduced ? '' : pan}`} key={`${cue.key}${i}`}>
          {video ? (
            <video src={video} autoPlay={!reduced} muted playsInline loop onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.duration < 3) v.playbackRate = 0.6; }} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLVideoElement).style.display = 'none'; }} />
          ) : CUTSCENE_ART[cue.key] ? (
            // The user's painting of the place, graded noir; the drawn still when it can't load.
            <AssetImg k={CUTSCENE_ART[cue.key]} alt="" className="w-full h-full object-cover" style={{ filter: NOIR_GRADE }} fallback={<NoirStill cue={cue.key} seed={cue.week + i} />} />
          ) : (
            <NoirStill cue={cue.key} seed={cue.week + i} />
          )}
        </div>
        <div className="absolute inset-x-0 top-0 h-[8%] bg-black" />
        <div className="absolute inset-x-0 bottom-0 h-[8%] bg-black" />
      </div>
      <div className="bg-black px-6 sm:px-16 pb-8 pt-4 min-h-[150px]">
        <div className="text-[10px] uppercase tracking-[0.4em] text-stone-500">{cue.title}</div>
        <p className="font-display text-xl sm:text-2xl text-stone-100 mt-2 max-w-3xl leading-snug" aria-live="polite">
          {shown}
          {!done && <span className="inline-block w-2 h-5 bg-stone-300 ml-0.5 align-middle llv-caret" />}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-stone-500">
          <button className="btn-ghost text-xs py-1" onClick={(e) => { e.stopPropagation(); next(); }}>{done ? (i + 1 < cues.length ? 'Next' : 'Continue') : 'Skip'}</button>
          <button className="text-stone-500 hover:text-stone-300" onClick={(e) => { e.stopPropagation(); onDone(); }}>Skip all</button>
          {cues.length > 1 && <span>{i + 1} / {cues.length}</span>}
        </div>
      </div>
    </div>
  );
}
