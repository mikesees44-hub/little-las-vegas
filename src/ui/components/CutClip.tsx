import { useEffect, useRef, useState } from 'react';

/**
 * CUTSCENES: short clips (made in Gemini's video tool) that play once at the top of a card.
 * They live in the published artifact's asset store (`/_blob/...`), not in the page, so they
 * only load inside the published game; anywhere else (local dev, tests, offline) the clip
 * quietly isn't there. Tap to skip; off under prefers-reduced-motion.
 */
export const CLIP_URLS: Record<string, string> = {
  phone_2am: '/_blob/dd128ad3148a318017a31f09054b2145',
  // The owner's montage, cut into its five shots (two seconds each: played slower and held on the last frame).
  envelope: '/_blob/cd6a8d6cf1cc4e1e0c9216cb49fd8c99',
  headlights: '/_blob/f3385d48ac897c4f7165600c8176b865',
  feds_door: '/_blob/599446d7ec9ea9a218194a92f66ab50a',
  take_chair: '/_blob/f139a62fb18d749ea8b0247baed45e9a',
  funeral_cars: '/_blob/9c0fb8b90ac598d89f36fee687ecc7cd',
};

/** Short shots: slowed down and held on the last frame instead of closing. */
const HOLD = new Set(['envelope', 'headlights', 'feds_door', 'take_chair', 'funeral_cars']);

function reducedMotion(): boolean {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

const played = new Set<string>();

/** `once`: play only the first time this key is seen this session (e.g. once a week). */
export function CutClip({ k, once }: { k: string; once?: string }) {
  const url = CLIP_URLS[k];
  const [first] = useState(() => { if (!once) return true; if (played.has(once)) return false; played.add(once); return true; });
  const ref = useRef<HTMLVideoElement>(null);
  const [gone, setGone] = useState(() => !first || !url || typeof window === 'undefined' || reducedMotion() || !/^https?:/.test(window.location?.protocol ?? ''));
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v || gone) return;
    // Try with sound (the ring is the point); browsers that refuse play it muted with a sound button.
    if (HOLD.has(k)) { v.muted = true; v.playbackRate = 0.6; }
    else v.muted = false;
    v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => setGone(true)); });
  }, [gone]);
  if (gone) return null;
  return (
    <div className="relative overflow-hidden rounded-t-xl bg-black" data-testid={`clip-${k}`}>
      <video ref={ref} src={url} playsInline preload="auto" className="block aspect-video w-full object-cover"
        onEnded={() => { if (!HOLD.has(k)) setGone(true); }} onError={() => setGone(true)} onClick={() => setGone(true)} aria-label="Cutscene" />
      <div className="absolute bottom-2 right-2 flex gap-2">
        {muted && !HOLD.has(k) && <button type="button" className="rounded bg-black/70 px-2 py-1 text-xs text-stone-200" onClick={() => { const v = ref.current; if (v) { v.muted = false; setMuted(false); } }}>🔊 Sound</button>}
        <button type="button" className="rounded bg-black/70 px-2 py-1 text-xs text-stone-200" onClick={() => setGone(true)} data-testid="clip-skip">Skip ▸</button>
      </div>
    </div>
  );
}
