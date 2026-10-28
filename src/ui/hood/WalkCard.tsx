import { StartHereButton } from '../econ/StartRacket';
import { DatingHere, DatingLink } from '../dating/DatingPanel';
import { datingSettings } from '../../engine/datingState';
import { useMemo, useState } from 'react';
import { placeOwnerLabel, placeRunByLabel } from '../../engine/placeEligibility';
import { crew } from '../../engine/characters';
import { hotspotLot, type WalkNpc } from '../../engine/walk';
import type { WalkHotspot } from '../../engine/walkData';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { PlaceVerbs } from './PlaceVerbs';
import { Face, useSheet } from '../components/People';
import { STATUS_LABEL } from '../econ/RealEstate';
import { fmt$ } from '../format';
import { OWNER_COLOR } from '../map/lotIcons';
import { useShell } from '../shell/context';
import { useTravel } from '../travel/context';
import { AssetImg } from './AssetImg';
import type { AssetKey } from './art/assetUrls';
import type { Item } from './Buildings';
import type { Mood } from './iso';
import { facadeOf, Storefront, StreetCard } from './StreetCard';

/**
 * The card for a place you walked up to on the Boardwalk: its picture (the
 * Flyer and the Castle Dungeon sprites for Hunt's Pier, the storefront for a
 * business), who holds it, what is going on there, who is standing outside,
 * and the verbs: go in (the existing street card and its paperwork), make an
 * offer (the Deal window), manage, call a meeting here, shake them down.
 * Everything a verb does is an ordinary queued action or an existing drawer.
 */

const ROLE_LABEL: Record<WalkNpc['role'], string> = { capo: 'Your capo', manager: 'Runs your place', crew: 'One of yours', rival: 'Another family', ear: 'One of the Ears' };

/** The people you might call to a meeting: who is out here first, then your capos and men, then the other families' bosses. */
export function meetingCandidates(s: GameState, here: WalkNpc[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>([s.playerId]);
  const add = (id: string, label: string) => { if (seen.has(id) || !s.characters[id]?.alive) return; seen.add(id); out.push({ id, label }); };
  for (const n of here) add(n.charId, `${n.name} (out here)`);
  for (const c of crew(s).sort((a, b) => (a.rank === 'capo' ? -1 : 0) - (b.rank === 'capo' ? -1 : 0))) add(c.id, `${c.firstName} ${c.lastName} (${c.rank})`);
  for (const r of s.rivals) if (r.kind !== 'law') add(r.leaderId, `${s.characters[r.leaderId]?.firstName ?? ''} ${s.characters[r.leaderId]?.lastName ?? ''} (${r.shortName})`);
  return out.slice(0, 30);
}

/** "Have him meet me here": picks the man and queues the sit-down (the talks system's meeting). */
export function MeetingPicker({ s, place, here, initial }: { s: GameState; place: string; here: WalkNpc[]; initial?: string }) {
  const cands = useMemo(() => meetingCandidates(s, here), [s, here]);
  const [who, setWho] = useState(initial ?? cands[0]?.id);
  if (!cands.length) return <div className="text-xs text-stone-500">Nobody to call.</div>;
  const action: PlayerAction | undefined = who ? { kind: 'talk', op: { t: 'ask', talk: 'meeting', target: who } } : undefined;
  return (
    <div className="space-y-1.5" data-testid="walk-meeting">
      <label className="block text-[11px] text-stone-400">Have him meet you at {place}
        <select className="mt-0.5 block w-full rounded border border-noir-600 bg-noir-900 px-2 py-1 text-xs text-stone-200" value={who} onChange={(e) => setWho(e.target.value)} data-testid="walk-meeting-who">
          {cands.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      {action && <ActionCard key={who} s={s} action={action} compact label={`Meet ${s.characters[who!]?.firstName ?? ''} at ${place}`} />}
    </div>
  );
}

function ownerOf(s: GameState, h: WalkHotspot, it?: Item): { text: string; color: string } {
  if (it?.mine) return { text: `House of ${s.houseName}`, color: OWNER_COLOR.player };
  const l = it?.lot;
  if (l) {
    // The same words as the street card, the block map and Holdings (placeEligibility).
    const text = placeOwnerLabel(s, l);
    if (l.owner === 'private') return { text, color: l.status === 'sale' ? OWNER_COLOR.sale : OWNER_COLOR.private };
    return { text, color: OWNER_COLOR[l.owner] ?? OWNER_COLOR.private };
  }
  if (h.ownerText) return { text: h.ownerText, color: /city|parish|congregation/i.test(h.ownerText) ? OWNER_COLOR.city : OWNER_COLOR.private };
  if (h.kind === 'beach') return { text: 'Everybody\'s (the city keeps it)', color: OWNER_COLOR.city };
  if (h.kind === 'tram') return { text: 'The tram car company', color: OWNER_COLOR.private };
  if (h.landmark === 'hunts-pier') return { text: 'The pier company (not for sale)', color: OWNER_COLOR.private };
  return { text: 'An independent owner (not for sale)', color: OWNER_COLOR.private };
}

function SpotArt({ s, h, it, mood }: { s: GameState; h: WalkHotspot; it?: Item; mood: Mood }) {
  const label = <div className="absolute inset-0 grid place-items-center font-display text-lg text-[#ffd1e6]">{h.label}</div>;
  if (h.art) {
    const keys = (Array.isArray(h.art) ? h.art : [h.art]) as AssetKey[];
    const sprite = keys[0] !== 'walk_pier_beach';
    // The painting, or (when no picture loads: local dev, before the upload) the drawn storefront, or the name.
    const fallback = it ? <Storefront it={it} f={facadeOf(s, it, mood)} /> : label;
    return (
      <div className={`relative overflow-hidden rounded-lg border border-[#ff5fa2]/30 ${sprite ? 'bg-gradient-to-b from-[#7fc4e8] via-[#bfe3f0] to-[#f2dfb4]' : 'bg-noir-800'}`} style={{ aspectRatio: sprite ? '4 / 3' : '1576 / 998' }} data-testid="walk-art">
        <AssetImg k={keys} alt={`${h.label}`} className={`absolute inset-0 h-full w-full ${sprite ? 'object-contain' : 'object-cover'}`} fallback={it ? <div className="absolute inset-0 overflow-auto">{fallback}</div> : label} />
      </div>
    );
  }
  if (it) return <Storefront it={it} f={facadeOf(s, it, mood)} />;
  return <div className="relative h-28 rounded-lg border border-[#ff5fa2]/30 bg-gradient-to-b from-[#2a1f52] to-[#1b1030]">{label}</div>;
}

export function WalkSpotCard({ s, h, it, mood, here, onClose, onNpc, onTram, zone = 'boardwalk', where = 'The Boardwalk at Hunt\'s Pier', backLabel = 'Back out on the boards' }: {
  s: GameState; h: WalkHotspot; it?: Item; mood: Mood; here: WalkNpc[];
  /** The game zone the place is in (Start a racket here). */
  zone?: string;
  /** The stretch, when the place has no address of its own. */
  where?: string;
  backLabel?: string;
  onClose: () => void;
  onNpc: (charId: string) => void;
  /** The tram stop: ride to the other end of the boards. */
  onTram?: () => void;
}) {
  const shell = useShell();
  const travel = useTravel();
  const [inside, setInside] = useState(false);
  const [meet, setMeet] = useState(false);
  const lot = hotspotLot(s, h);
  const own = ownerOf(s, h, it);
  if (inside && it) {
    return (
      <div className="space-y-2">
        <button type="button" className="text-xs text-stone-400 hover:text-gold-300" onClick={() => setInside(false)} data-testid="walk-back">← {backLabel}</button>
        <StreetCard s={s} it={it} mood={mood} onClose={onClose} />
      </div>
    );
  }
  const mine = !!it?.mine;
  const badge = it?.building ? 'Going up' : it?.closed ? 'Closed' : it?.forSale && !mine ? `For sale${lot?.price ? ` · ${fmt$(lot.price)}` : ''}` : it?.forLease ? 'For rent' : mine ? 'Yours' : lot?.status === 'rival' ? 'Rival-held' : h.landmark || !lot ? 'Landmark' : undefined;
  return (
    <div className="space-y-3" data-testid="walk-card" data-spot={h.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{h.address ?? lot?.address ?? where}</div>
          <div className="font-display text-xl leading-tight text-[#ffd1e6]">{it?.name ?? h.label}</div>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-stone-400 hover:text-gold-300 shrink-0" aria-label="Close" data-testid="walk-card-close">close ×</button>
      </div>
      <SpotArt s={s} h={h} it={it} mood={mood} />
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <div className="text-stone-500">Held by</div>
        <div className="text-stone-200 flex items-center gap-1.5" data-testid="walk-owner"><span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: own.color }} />{own.text}</div>
        {lot && <><div className="text-stone-500">Runs it</div><div className="text-stone-200" data-testid="walk-runs">{placeRunByLabel(s, lot)}</div></>}
        {lot && <><div className="text-stone-500">Status</div><div className="text-stone-200" data-testid="walk-status">{STATUS_LABEL[lot.status]}{badge ? ` · ${badge}` : ''}</div></>}
        {!lot && badge && <><div className="text-stone-500">Status</div><div className="text-stone-200">{badge}</div></>}
      </div>
      <p className="text-xs text-stone-300 leading-relaxed">{h.blurb}</p>
      {here.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Who's here</div>
          <ul className="mt-1 space-y-1" data-testid="walk-here">
            {here.map((n) => (
              <li key={n.charId}>
                <button type="button" className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-noir-800" onClick={() => onNpc(n.charId)}>
                  <span className="font-semibold text-stone-100">{n.name}</span><span className="text-stone-500">· {n.doing}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <StartHereButton s={s} place={lot?.zone ?? (it?.biz?.districtId as string | undefined) ?? zone} lot={lot} biz={mine ? it?.biz : undefined} onGo={() => shell.go('holdings.hub')} />
      {/* This place: every verb it offers, the same on every card (PlaceVerbs). */}
      <PlaceVerbs s={s} lot={lot} biz={mine ? it?.biz : undefined}
        on={{ goIn: it ? () => setInside(true) : undefined, meeting: () => setMeet((x) => !x) }}
        extra={<>
          {h.kind === 'tram' && onTram && <button type="button" className="btn-ghost text-xs py-1" onClick={onTram} data-testid="walk-tram">Ride the tram car</button>}
          {(h.kind === 'tram' || h.kind === 'pier') && <button type="button" className="btn-ghost text-xs py-1" disabled={!!s.gameOver} onClick={() => travel.plan(s.playerId)} data-testid="walk-trip">Plan a trip</button>}
        </>} />
      {h.kind === 'business' && <DatingLink s={s} tab={datingSettings(s).mature === 'off' ? 'people' : 'adult'} text={datingSettings(s).mature === 'off' ? 'who you know here, asking someone out' : 'asking someone out, or company for the evening (her price, your pocket)'} />}
      {meet && <MeetingPicker s={s} place={it?.name ?? h.label} here={here} />}
    </div>
  );
}

export function WalkNpcCard({ s, n, place, onClose }: { s: GameState; n: WalkNpc; place: string; onClose: () => void }) {
  const sheet = useSheet();
  const c = s.characters[n.charId];
  if (!c) return null;
  const mine = c.faction === 'player';
  return (
    <div className="space-y-3" data-testid="walk-npc-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Face s={s} c={c} size={56} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{ROLE_LABEL[n.role]}</div>
            <div className="font-display text-lg leading-tight text-[#ffd1e6] truncate">{n.name}</div>
            <div className="text-xs text-stone-400">{n.doing}</div>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-stone-400 hover:text-gold-300 shrink-0" aria-label="Close">close ×</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn-gold text-xs py-1" onClick={() => sheet.open(c.id)} data-testid="walk-talk">Talk to {c.firstName}</button>
        {sheet.menu && <button type="button" className="btn-ghost text-xs py-1" onClick={(e) => sheet.menu!(c.id, undefined, { x: e.clientX, y: e.clientY })}>Everything you can do…</button>}
      </div>
      <ActionCard s={s} action={{ kind: 'talk', op: { t: 'ask', talk: 'meeting', target: c.id } }} compact label={`Sit down with ${c.firstName} at ${place}`} />
      {mine && <ActionCard s={s} action={{ kind: 'talk', op: { t: 'ask', talk: 'advice', target: c.id } }} compact label={`Ask ${c.firstName} what he hears`} />}
      {!mine && n.role !== 'ear' && <ActionCard s={s} action={{ kind: 'talk', op: { t: 'ask', talk: 'business', target: c.id } }} compact label={`Talk business with ${c.firstName}`} />}
      <DatingHere s={s} id={c.id} />
    </div>
  );
}
