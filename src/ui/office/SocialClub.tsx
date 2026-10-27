import { previewAction } from '../../engine/actions';
import { officeRoom } from '../../engine/bossOffice';
import type { GameState, PlayerAction } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { fmt$ } from '../format';
import { AssetImg } from '../hood/AssetImg';
import { CLUB_SPOTS } from './hotspots';

/**
 * THE SHORE SOCIAL CLUB: the family's headquarters, from the street. The
 * cutaway is the establishing shot (the office upstairs, the bar below);
 * "Go upstairs" enters the office. When business is done somewhere else (a
 * restaurant's back room, a car, the boardwalk), the club is still here and
 * the existing headquarters order can move it back.
 */

/** The existing HQ order that makes the social club the headquarters. */
export const CLUB_HQ: PlayerAction = { kind: 'econ', op: { type: 'hq', kind: 'social' } };

function HqLine({ s }: { s: GameState }) {
  const orders = useOrders();
  const room = officeRoom(s);
  if (room.hq.club) return <p className="text-[12px] text-stone-300" data-testid="club-hq">Your headquarters. The capos come up the back stairs; the men play cards below.</p>;
  const p = previewAction(s, CLUB_HQ);
  const queued = orders.orders.some((a) => a.kind === 'econ' && a.op.type === 'hq' && a.op.kind === 'social');
  return (
    <div className="space-y-1" data-testid="club-hq">
      <p className="text-[12px] text-stone-300">Business is done at: {room.hq.name.toLowerCase()}. The club is not your headquarters right now.</p>
      <button type="button" className="btn-gold text-xs" disabled={!!p.disabledReason || queued} onClick={() => orders.queue(CLUB_HQ)} data-testid="club-set-hq">
        {queued ? 'Ordered: the club becomes headquarters' : `Set up headquarters here${p.cost ? ` (${fmt$(p.cost)})` : ''}`}
      </button>
      {p.disabledReason && <div className="text-[11px] text-stone-500">{p.disabledReason}</div>}
    </div>
  );
}

export function SocialClub({ s, onUpstairs, onHq, onMap }: { s: GameState; onUpstairs: () => void; onHq: () => void; onMap: () => void }) {
  const spot = (r: { x: number; y: number; w: number; h: number }) => ({ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` });
  const btn = 'absolute rounded-md border border-transparent hover:border-gold-400/80 hover:bg-gold-300/10 focus-visible:border-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';
  const lab = 'absolute left-1 top-1 rounded border border-gold-600/50 bg-noir-950/85 px-1.5 py-0.5 text-[11px] text-gold-200';
  return (
    <div className="absolute inset-0 z-[1090] overflow-y-auto bg-noir-950/[0.98] pb-16 md:pb-2" data-testid="social-club" role="region" aria-label="The Shore Social Club">
      <div className="mx-auto max-w-[1300px] p-2 sm:p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl text-gold-400 leading-tight">The Shore Social Club</h1>
            <div className="text-[11px] text-stone-400">Brick front, green awning, two blocks off the boardwalk.</div>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={onMap} data-testid="club-to-map">⌖ The map</button>
        </div>
        <div className="relative w-full overflow-hidden rounded-md border border-gold-700/50 shadow-xl shadow-black/70" style={{ aspectRatio: '1697 / 927' }}>
          <AssetImg k="social_club_cutaway" alt="The Shore Social Club in cutaway: the boss's office upstairs, the bar and card tables downstairs" className="absolute inset-0 h-full w-full object-cover"
            fallback={<div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #3a2618 0%, #3a2618 44%, #1f140c 45%, #5b2f1f 100%)' }} data-testid="club-fallback" />} />
          <button type="button" className={btn} style={spot(CLUB_SPOTS.upstairs)} onClick={onUpstairs} aria-label="Go upstairs to your office" data-testid="club-upstairs"><span className={lab}>⇡ Go upstairs: the office</span></button>
          <button type="button" className={btn} style={spot(CLUB_SPOTS.bar)} onClick={onHq} aria-label="The club downstairs: who meets here, bugs and sweeps" data-testid="club-bar"><span className={lab}>♜ The club: who meets here</span></button>
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
          <HqLine s={s} />
          <div className="flex gap-1.5">
            <button type="button" className="btn-gold text-sm" onClick={onUpstairs} data-testid="club-upstairs-btn">Go upstairs ▸</button>
            <button type="button" className="btn-ghost text-sm" onClick={onHq}>Headquarters</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** On the map: the club as a building you can walk into (the transparent 3/4 sprite). */
export function ClubOnMap({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const room = officeRoom(s);
  return (
    <button type="button" onClick={onOpen} data-testid="club-on-map" title="The Shore Social Club: go in"
      className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-gold-600/60 bg-noir-900/90 p-1 pr-2 text-left shadow-lg shadow-black/70 hover:border-gold-400">
      <span className="relative block h-12 w-[72px] shrink-0">
        <AssetImg k="social_club_building" alt="The Shore Social Club" className="absolute inset-0 h-full w-full object-contain"
          fallback={<span className="flex h-full w-full items-center justify-center rounded bg-[#5b2f1f] text-lg text-gold-200" aria-hidden>⌂</span>} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-gold-300">The Shore Social Club</span>
        <span className="block text-[10px] text-stone-400">{room.hq.club ? 'Your headquarters · go in' : 'Not your headquarters · go in'}</span>
      </span>
    </button>
  );
}
