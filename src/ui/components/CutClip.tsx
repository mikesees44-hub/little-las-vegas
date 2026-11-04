import { useEffect, useRef, useState } from 'react';

/**
 * CUTSCENES: short clips (made in Gemini's video tool) that play once at the top of a card.
 * They live in the published artifact's asset store (`/_blob/...`), not in the page, so they
 * only load inside the published game; anywhere else (local dev, tests, offline) the clip
 * quietly isn't there. Tap to skip; off under prefers-reduced-motion.
 */
export const CLIP_URLS: Record<string, string> = {
  phone_2am: '/_blob/dd128ad3148a318017a31f09054b2145',
};

function reducedMotion(): boolean {
  try { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function CutClip({ k }: { k: string }) {
  const url = CLIP_URLS[k];
  const ref = useRef<HTMLVideoElement>(null);
  const [gone, setGone] = useState(() => !url || typeof window === 'undefined' || reducedMotion() || !/^https?:/.test(window.location?.protocol ?? ''));
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v || gone) return;
    // Try with sound (the ring is the point); browsers that refuse play it muted with a sound button.
    v.muted = false;
    v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => setGone(true)); });
  }, [gone]);
  if (gone) return null;
  return (
    <div className="relative overflow-hidden rounded-t-xl bg-black" data-testid={`clip-${k}`}>
      <video ref={ref} src={url} playsInline preload="auto" className="block aspect-video w-full object-cover"
        onEnded={() => setGone(true)} onError={() => setGone(true)} onClick={() => setGone(true)} aria-label="Cutscene" />
      <div className="absolute bottom-2 right-2 flex gap-2">
        {muted && <button type="button" className="rounded bg-black/70 px-2 py-1 text-xs text-stone-200" onClick={() => { const v = ref.current; if (v) { v.muted = false; setMuted(false); } }}>🔊 Sound</button>}
        <button type="button" className="rounded bg-black/70 px-2 py-1 text-xs text-stone-200" onClick={() => setGone(true)} data-testid="clip-skip">Skip ▸</button>
      </div>
    </div>
  );
}
