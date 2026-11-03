import { useEffect, useState } from 'react';
import { Overlay } from '../components/Modal';
import { monthName, weekday } from '../../engine/calendar';
import type { GameDate } from '../../engine/types';
import { CADILLAC, Man } from '../cutscene/figures';
import { prefersReducedMotion, useTypewriter } from '../cutscene/Cutscene';

/**
 * THE NEWSPAPER REEL: a front page spins out of the dark, three turns,
 * slowing, lands square to the camera; the photo panel fades up; a beat of
 * silence; the consequence line types out underneath. Reduced motion: a
 * fade. The photo panels are drawn in code and never graphic.
 */

import type { Reel as EngineReel, ReelPhoto } from '../../engine/reels';
export type { ReelPhoto };
export type Reel = Omit<EngineReel, 'week'>;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function masthead(paper: string): string {
  if (/leader/i.test(paper)) return 'THE WILDWOOD LEADER';
  if (/star-ledger|newark/i.test(paper)) return 'THE NEWARK STAR-LEDGER';
  return 'THE EVENING BULLETIN';
}

export function dateline(paper: string, d: GameDate): string {
  const city = /leader/i.test(paper) ? 'Wildwood, N.J.' : /newark|star/i.test(paper) ? 'Newark, N.J.' : 'Philadelphia, Pa.';
  return `${city}, ${DAYS[weekday(d)]}, ${monthName(d.m)} ${d.d}, ${d.y}. Price 5 cents.`;
}

const INK = '#141210';

export function ReelPhotoArt({ kind }: { kind: ReelPhoto }) {
  const lamp = (x: number) => (
    <g>
      <rect x={x} y={20} width={4} height={150} fill={INK} />
      <circle cx={x + 2} cy={22} r={40} fill="#fff" opacity={0.25} />
      <path d={`M${x + 2},24 L${x - 40},170 L${x + 44},170Z`} fill="#fff" opacity={0.18} />
    </g>
  );
  let body;
  switch (kind) {
    case 'car':
      body = (
        <>
          {lamp(250)}
          <g transform="translate(40 150) scale(0.62)" fill={INK}><CADILLAC /></g>
          <path d="M0,150 L320,128" stroke="#eee" strokeWidth={3} strokeDasharray="10 6" />
          <ellipse cx={270} cy={168} rx={14} ry={4} fill={INK} />
          <path d="M258,166 q12,-12 24,0Z" fill={INK} />
        </>
      );
      break;
    case 'boardwalk':
      body = (
        <>
          {Array.from({ length: 12 }, (_, i) => <rect key={i} x={0} y={110 + i * 6} width={320} height={2} fill={INK} opacity={0.4} />)}
          <circle cx={240} cy={50} r={40} fill="none" stroke={INK} strokeWidth={2} opacity={0.5} />
          <path d="M150,160 l6,-14 l6,14Z" fill={INK} />
          <circle cx={156} cy={144} r={6} fill="#ddd" stroke={INK} />
          <g fill={INK}><Man x={60} y={175} s={0.55} pose="stand" /></g>
        </>
      );
      break;
    case 'diner':
      body = (
        <>
          <rect x={30} y={30} width={260} height={110} fill="#ddd" stroke={INK} strokeWidth={6} />
          <path d="M160,40 L150,80 L175,100 L160,135" stroke={INK} strokeWidth={2} fill="none" />
          <rect x={120} y={150} width={40} height={22} rx={4} fill={INK} />
          <rect x={132} y={146} width={16} height={6} rx={3} fill="none" stroke={INK} strokeWidth={2} />
        </>
      );
      break;
    case 'window':
      body = (
        <>
          {[40, 130, 220].map((x, i) => <rect key={x} x={x} y={40} width={60} height={90} fill={i === 1 ? '#fff6d0' : INK} />)}
          <rect x={0} y={140} width={320} height={40} fill={INK} opacity={0.6} />
        </>
      );
      break;
    case 'dock':
      body = (
        <>
          <rect x={0} y={130} width={320} height={50} fill={INK} opacity={0.35} />
          {Array.from({ length: 6 }, (_, i) => <rect key={i} x={20 + i * 55} y={120} width={6} height={60} fill={INK} />)}
          <g transform="translate(60 125) scale(0.55)" fill={INK}><CADILLAC /></g>
          <path d="M150,105 l30,-18 l0,22Z" fill={INK} />
        </>
      );
      break;
    case 'arrest':
      body = (
        <>
          <g transform="translate(150 150) scale(0.55)" fill={INK}><CADILLAC /></g>
          <g fill={INK}>
            <Man x={70} y={175} s={0.6} pose="coat" />
            <Man x={100} y={175} s={0.6} pose="walk" />
            <Man x={130} y={175} s={0.6} pose="coat" />
          </g>
        </>
      );
      break;
    case 'restaurant':
      body = (
        <>
          <rect x={110} y={30} width={100} height={140} fill={INK} />
          <rect x={130} y={60} width={60} height={22} fill="#eee" />
          <text x={160} y={76} textAnchor="middle" fontSize={11} fontFamily="Georgia" fill={INK}>CLOSED</text>
          <path d="M0,150 L320,150" stroke="#eee" strokeWidth={3} strokeDasharray="10 6" />
          <g fill={INK}>{[20, 50, 250, 285].map((x) => <Man key={x} x={x} y={185} s={0.5} pose="back" />)}</g>
        </>
      );
      break;
    case 'courthouse':
    default:
      body = (
        <>
          <path d="M40,60 L160,20 L280,60Z" fill={INK} />
          {[60, 100, 140, 180, 220, 260].map((x) => <rect key={x} x={x - 6} y={64} width={12} height={80} fill={INK} opacity={0.75} />)}
          {[0, 1, 2].map((i) => <rect key={i} x={30 - i * 10} y={146 + i * 9} width={260 + i * 20} height={8} fill={INK} opacity={0.6} />)}
        </>
      );
  }
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full block" role="img" aria-label={`Photo: ${kind}`}>
      <filter id={`rp-${kind}`}><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves={1} seed={7} /><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.35 0" /></filter>
      <rect width={320} height={180} fill="#9d988c" />
      {body}
      <rect width={320} height={180} filter={`url(#rp-${kind})`} />
    </svg>
  );
}

/** The front page itself (no animation). */
export function FrontPage({ reel }: { reel: Reel }) {
  return (
    <div className="bg-[#efe8d6] text-[#141210] p-3 sm:p-5 shadow-2xl font-display" data-testid="front-page">
      <div className="text-center border-b-4 border-double border-[#141210] pb-1">
        <div className="text-2xl sm:text-4xl font-black tracking-wide" style={{ fontFamily: '"Old English Text MT", "UnifrakturMaguntia", Georgia, serif' }}>{masthead(reel.paper)}</div>
        <div className="text-[10px] sm:text-xs italic mt-0.5">{dateline(reel.paper, reel.date)}</div>
      </div>
      <h3 className="text-xl sm:text-3xl font-black leading-tight text-center mt-2 uppercase">{reel.headline}</h3>
      <div className="text-xs sm:text-sm text-center italic mt-1">{reel.subhead}</div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="col-span-2 aspect-[16/9] border border-[#141210]"><ReelPhotoArt kind={reel.photo} /></div>
        <div className="text-[9px] sm:text-[10px] leading-snug columns-1 opacity-70 overflow-hidden">
          {Array.from({ length: 9 }, (_, i) => <div key={i} className="h-1.5 bg-[#141210]/40 mb-1.5 rounded-sm" style={{ width: `${70 + ((i * 37) % 30)}%` }} />)}
        </div>
      </div>
      {reel.note && <div className="text-[10px] italic mt-1 text-center">{reel.note}</div>}
    </div>
  );
}

/** The spin, the landing, the consequence line. */
export function NewspaperReel({ reel, onDone, inline }: { reel: Reel; onDone?: () => void; inline?: boolean }) {
  const reduced = prefersReducedMotion();
  const [landed, setLanded] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setLanded(true), 2700);
    return () => clearTimeout(t);
  }, [reduced]);
  const [line, done, finish] = useTypewriter(landed ? reel.consequence : '', 40, reduced);
  const page = (
    <div className="w-full max-w-xl mx-auto">
      <div className={reduced ? 'llv-reel-fade' : 'llv-reel-spin'}><FrontPage reel={reel} /></div>
      <p className="mt-3 text-center text-amber-200 font-display text-base sm:text-lg min-h-[1.75rem]" aria-live="polite" data-testid="reel-consequence">{line}</p>
      <style>{`
        .llv-reel-spin{animation:llv-spin 2.6s cubic-bezier(.12,.75,.25,1) both}
        @keyframes llv-spin{0%{transform:rotate(-1080deg) scale(.05);opacity:0}15%{opacity:1}100%{transform:rotate(0) scale(1);opacity:1}}
        .llv-reel-fade{animation:llv-fade .8s ease-out both}
        @keyframes llv-fade{from{opacity:0}to{opacity:1}}
      `}</style>
    </div>
  );
  if (inline) return page;
  return (
    <Overlay z={3100} className="bg-black flex flex-col items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={reel.headline} data-testid="newspaper-reel" onClick={() => (done ? onDone?.() : finish())}>
      {page}
      <button className="btn-ghost text-xs mt-3" onClick={(e) => { e.stopPropagation(); onDone?.(); }}>{done ? 'Continue' : 'Skip'}</button>
    </Overlay>
  );
}
