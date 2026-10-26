import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { assetUrl, type AssetKey } from './art/assetUrls';

/** URLs that failed once this session: skip straight to the fallback next time (no flicker). */
const failed = new Set<string>();
const loaded = new Set<string>();

/** The candidate sources, best first: the asset store's, then an inlined fallback image. */
export function sourcesOf(keys: AssetKey | AssetKey[] | undefined, inline?: string): string[] {
  const ks = keys === undefined ? [] : Array.isArray(keys) ? keys : [keys];
  const out: string[] = [];
  for (const k of ks) { const u = assetUrl(k); if (u && !failed.has(u)) out.push(u); }
  if (inline) out.push(inline);
  return out;
}

/**
 * Tries each source in turn and reports which one is showing; when none is
 * left, renders `fallback` (the SVG art). Use for every asset-store image.
 */
export function useAssetSrc(keys: AssetKey | AssetKey[] | undefined, inline?: string) {
  const [bad, setBad] = useState<string[]>([]);
  const src = sourcesOf(keys, inline).find((u) => !bad.includes(u));
  return {
    src,
    fromStore: !!src && src !== inline,
    onError: () => { if (!src) return; if (src !== inline) failed.add(src); setBad((b) => [...b, src]); },
    onLoad: () => { if (src) loaded.add(src); },
  };
}

export function AssetImg({ k, inline, fallback, alt, className, style, onShown }: {
  k: AssetKey | AssetKey[] | undefined;
  inline?: string;
  fallback?: ReactNode;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** Which kind of art is showing now: 'store' (the big image), 'inline' or 'fallback'. */
  onShown?: (what: 'store' | 'inline' | 'fallback') => void;
}) {
  const a = useAssetSrc(k, inline);
  const what = !a.src ? 'fallback' : a.fromStore ? 'store' : 'inline';
  useEffect(() => { onShown?.(what); }, [what]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a.src) return <>{fallback ?? null}</>;
  return <img key={a.src} src={a.src} alt={alt} className={className} style={style} draggable={false} onError={a.onError} onLoad={a.onLoad} data-art-src={what} />;
}
