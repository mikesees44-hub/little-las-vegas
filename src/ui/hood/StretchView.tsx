import { useMemo, useState } from 'react';
import { rivalName } from '../../engine/construction';
import { placeAll } from '../../engine/hoodGeo';
import { walkLight } from '../../engine/walk';
import { STRETCHES, stretchSpots, whoIsOnStretch, type StretchSpot, type WalkStretch } from '../../engine/walkStretches';
import type { GameState } from '../../engine/types';
import { OWNER_COLOR } from '../map/lotIcons';
import { useTravel } from '../travel/context';
import { AssetImg } from './AssetImg';
import type { AssetKey } from './art/assetUrls';
import { itemsOf, type Item } from './Buildings';
import { ISO, type Mood } from './iso';
import { MeetingPicker, WalkNpcCard, WalkSpotCard } from './WalkCard';

/**
 * Walking the rest of the town: a stretch of street as the user's painting
 * of it, the places along it as a row of cards (their models and
 * storefronts), who is out there this week, and the same place and person
 * cards as the Boardwalk at Hunt's Pier. The painting may not be uploaded
 * yet (or may not load: local dev, tests): the stretch then stands on a
 * drawn dusk sky with its name, and every card falls back to its drawing.
 */

/** "Walk to…": the Boardwalk at Hunt's Pier (the walkable one) and the stretches. */
export function StretchPicker({ at, onPick }: { at: string; onPick: (id: string) => void }) {
  return (
    <label className="flex items-center gap-1 rounded-full border border-[#ff5fa2] bg-[#1b1030]/85 px-2 py-0.5 text-xs text-[#ffd1e6]">
      <span className="sr-only">Walk to</span>
      <select className="max-w-[46vw] bg-transparent font-display text-xs text-[#ffd1e6] outline-none" value={at} onChange={(e) => onPick(e.target.value)} data-testid="walk-stretch">
        <option value="hunts" className="bg-noir-900">The Boardwalk at Hunt's Pier</option>
        {STRETCHES.map((x) => <option key={x.id} value={x.id} className="bg-noir-900">{x.label}</option>)}
      </select>
    </label>
  );
}

function badgeOf(it: Item | undefined, h: StretchSpot): { text: string; color: string } | undefined {
  if (it?.mine) return { text: 'Yours', color: OWNER_COLOR.player };
  if (it?.forSale) return { text: 'For sale', color: OWNER_COLOR.sale };
  const l = it?.lot;
  if (l?.status === 'rival') return { text: rivalName(l.owner as never), color: OWNER_COLOR[l.owner] ?? OWNER_COLOR.private };
  if (h.kind === 'landmark') return { text: 'Landmark', color: OWNER_COLOR.city };
  return undefined;
}

function Tile({ h, it, on, onClick }: { h: StretchSpot; it?: Item; on: boolean; onClick: () => void }) {
  const b = badgeOf(it, h);
  const keys = (Array.isArray(h.art) ? h.art : h.art ? [h.art] : []) as AssetKey[];
  return (
    <button type="button" onClick={onClick} data-testid="stretch-spot" data-spot={h.id}
      className={`group w-[132px] shrink-0 snap-start overflow-hidden rounded-lg border bg-[#1b1030]/90 text-left shadow-lg transition ${on ? 'border-gold-400 ring-1 ring-gold-400' : 'border-[#ff5fa2]/40 hover:border-[#ff5fa2]'}`}>
      <div className="relative h-[84px] bg-gradient-to-b from-[#2a2a5a] via-[#4a3a6a] to-[#7a5a6a]">
        <AssetImg k={keys.length ? keys : undefined} alt={h.label} className="absolute inset-0 h-full w-full object-contain p-1"
          fallback={<div className="absolute inset-0 grid place-items-center px-2 text-center font-display text-[13px] leading-tight text-[#ffd1e6]/80">{it?.name ?? h.label}</div>} />
        {b && <span className="absolute left-1 top-1 rounded-full px-1.5 text-[9px] font-bold text-noir-950" style={{ background: b.color }}>{b.text}</span>}
      </div>
      <div className="px-1.5 py-1">
        <div className="truncate text-[11px] font-semibold text-[#fff3dc]">{it?.name ?? h.label}</div>
        <div className="truncate text-[9.5px] text-stone-400">{h.address}</div>
      </div>
    </button>
  );
}

export function StretchView({ s, st, onClose, onStretch }: { s: GameState; st: WalkStretch; onClose: () => void; onStretch: (id: string) => void }) {
  const travel = useTravel();
  const [sel, setSel] = useState<{ spot?: string; npc?: string } | undefined>();
  const [moodSet, setMoodSet] = useState<'auto' | Mood>('auto');
  const [meet, setMeet] = useState(false);
  const [shown, setShown] = useState<'store' | 'inline' | 'fallback' | undefined>();
  const light = walkLight(s);
  const mood: Mood = moodSet === 'auto' ? light.mood : moodSet;
  const spots = useMemo(() => stretchSpots(s, st), [s, st]);
  const npcs = useMemo(() => whoIsOnStretch(s, st, spots), [s, st, spots]);
  const items = useMemo(() => itemsOf(s, placeAll(s), ISO), [s]);
  const itemFor = (h: StretchSpot): Item | undefined => (h.lots ? items.find((x) => x.key === h.lots![0]) : undefined);
  const selSpot = sel?.spot ? spots.find((h) => h.id === sel.spot) : undefined;
  const selNpc = sel?.npc ? npcs.find((n) => n.charId === sel.npc) : undefined;
  const filter = (mood === 'night' ? 'brightness(0.55) saturate(0.8) hue-rotate(-10deg)' : mood === 'dusk' ? 'brightness(0.9) saturate(1.1) sepia(0.2)' : 'none') + (light.winter ? ' saturate(0.7)' : '');
  const panel = selSpot || selNpc;
  const placeName = (id: string) => { const h = spots.find((x) => x.id === id); return h ? (itemFor(h)?.name ?? h.label) : st.label; };

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#1b1030]" data-testid="stretch-view" data-stretch={st.id} data-mood={mood} data-art-shown={shown}>
      {/* The street: the painting, or a drawn dusk with the street's name. */}
      <AssetImg k={st.backdrop as AssetKey[]} alt={`${st.label}: ${st.where}`} className="absolute inset-0 h-full w-full object-cover" style={{ filter }} onShown={setShown}
        fallback={(
          <div className="absolute inset-0 bg-gradient-to-b from-[#1b1030] via-[#4a2a5a] to-[#c8775a]" data-testid="stretch-drawn">
            <div className="absolute inset-x-0 top-[28%] text-center font-display text-3xl text-[#ffd1e6]/70 drop-shadow">{st.label}</div>
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#2e2a33] to-transparent" />
          </div>
        )} />
      {mood === 'night' && <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 60%, rgba(255,190,90,0.08), rgba(10,18,50,0.4) 75%)' }} />}

      {/* Controls. */}
      <div className="absolute left-2 top-11 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5">
        <button type="button" className="hv-btn" onClick={onClose} data-testid="walk-exit">← Island map</button>
        <StretchPicker at={st.id} onPick={(id) => { setSel(undefined); onStretch(id); }} />
        <div className="flex gap-1" role="group" aria-label="Light">
          {(['auto', 'day', 'dusk', 'night'] as const).map((m) => <button key={m} type="button" className={`hv-btn ${moodSet === m ? 'hv-on' : ''}`} onClick={() => setMoodSet(m)} title={m === 'auto' ? 'Follows the heat and the season' : m}>{m === 'auto' ? 'Auto' : m === 'day' ? '☀' : m === 'dusk' ? '◐' : '☾'}</button>)}
        </div>
      </div>

      {/* The street, in a few lines: what it is, who is out. */}
      {!panel && (
        <div className="absolute left-2 top-20 z-10 max-w-[min(360px,calc(100%-1rem))] rounded-lg border border-gold-600/50 bg-noir-900/88 p-2 text-xs shadow-lg" data-testid="stretch-card">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{st.where}</div>
          <div className="font-display text-lg leading-tight text-[#ffd1e6]">{st.label}</div>
          <p className="mt-1 text-[11.5px] leading-snug text-stone-300">{st.blurb}</p>
          {npcs.length > 0 && (
            <div className="mt-1.5">
              <div className="text-[10px] uppercase tracking-widest text-stone-500">Out here this week</div>
              <ul className="mt-0.5 space-y-0.5" data-testid="stretch-npcs">
                {npcs.map((n) => (
                  <li key={n.charId}><button type="button" className="text-left hover:text-gold-300" onClick={() => setSel({ npc: n.charId })}><span className="font-semibold text-stone-100">{n.name}</span> <span className="text-stone-500">· {n.doing}</span></button></li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button type="button" className={`btn-ghost text-xs py-1 ${meet ? 'ring-1 ring-gold-400' : ''}`} onClick={() => setMeet((x) => !x)} data-testid="stretch-meeting">Call a meeting…</button>
            <button type="button" className="btn-ghost text-xs py-1" disabled={!!s.gameOver} onClick={() => travel.plan(s.playerId)}>Plan a trip…</button>
          </div>
          {meet && <div className="mt-2"><MeetingPicker s={s} place={st.label} here={npcs} /></div>}
        </div>
      )}

      {/* The places along it, in walking order. */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/50 to-transparent pb-14 pt-6 md:pb-2">
        <div className="flex snap-x gap-2 overflow-x-auto px-2 pb-1" data-testid="stretch-places">
          {spots.map((h) => <Tile key={h.id} h={h} it={itemFor(h)} on={selSpot?.id === h.id} onClick={() => setSel({ spot: h.id })} />)}
        </div>
      </div>

      {panel && (
        <div className="absolute z-20 panel overflow-y-auto p-3 pb-16 md:pb-3 inset-x-0 bottom-0 max-h-[60%] rounded-b-none md:inset-x-auto md:right-2 md:top-20 md:bottom-2 md:max-h-none md:w-[380px] md:rounded-b-lg llv-slide-right" data-testid="walk-panel">
          {selNpc
            ? <WalkNpcCard key={selNpc.charId} s={s} n={selNpc} place={placeName(selNpc.at)} onClose={() => setSel(undefined)} />
            : selSpot && <WalkSpotCard key={selSpot.id} s={s} h={selSpot} it={itemFor(selSpot)} mood={mood} here={npcs.filter((n) => n.at === selSpot.id)} zone={st.zone} where={st.where} backLabel={`Back out on ${st.label.replace(/^The /, 'the ')}`} onClose={() => setSel(undefined)} onNpc={(id) => setSel({ npc: id })} />}
        </div>
      )}
    </div>
  );
}
