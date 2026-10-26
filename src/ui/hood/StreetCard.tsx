import { useState } from 'react';
import { STYLES, SIGN_HEX, type BuildStyle, type SignColor } from '../../engine/design';
import { lookOf, restyleCost } from '../../engine/hood';
import { HOODS_BY_ID, hoodOfZone } from '../../engine/hoodData';
import { rivalName } from '../../engine/construction';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { BizPanel } from '../econ/BizPanel';
import { LotPanel } from '../econ/LotPanel';
import { STATUS_LABEL } from '../econ/RealEstate';
import { fmt$ } from '../format';
import { OWNER_COLOR } from '../map/lotIcons';
import type { Item } from './Buildings';
import { useEmpire } from '../empire/context';
import { venueByKey, venueForLot } from '../../engine/empire';
import { lotName } from '../../engine/property';
import { Facade, type FacadeKind, type FacadeSpec } from './Facade';
import type { Mood } from './iso';
import { AssetImg } from './AssetImg';
import { Turnaround } from './Turnaround';
import { storefrontArt } from './storefrontArt';

/**
 * The storefront: the user's painting for this place (by its name, or the
 * kind of business) when there is one — a four-angle sheet turns round —
 * with its current name on a plate; the drawn postcard when there isn't, or
 * when the painting can't be loaded.
 */
export function Storefront({ it, f }: { it: Item; f: FacadeSpec }) {
  const art = storefrontArt(it);
  const postcard = <div className="rounded-lg overflow-hidden shadow-lg shadow-black/50 rotate-[-0.6deg]" data-testid="sv-postcard"><Facade f={f} /></div>;
  const [shown, setShown] = useState<'store' | 'inline' | 'fallback' | undefined>();
  if (!art) return postcard;
  const turn = art.turn && !Array.isArray(art.key);
  return (
    <div className="space-y-1.5" data-testid="sv-storefront">
      <div className="relative rounded-lg overflow-hidden shadow-lg shadow-black/50 border border-[#ff5fa2]/30">
        {turn
          ? <Turnaround k={art.key as never} name={it.name} fallback={postcard} />
          : <AssetImg k={art.key} alt={`${it.name}, the storefront`} className="block w-full h-auto" fallback={postcard} onShown={setShown} />}
        {(turn || shown === 'store') && (
          <div className="pointer-events-none absolute left-2 top-2 max-w-[80%] rounded border border-[#5ff2e6]/60 bg-[#1b1030]/85 px-2 py-0.5 font-display text-[12px] leading-tight text-[#ffd1e6] truncate" data-testid="sv-plate">{it.name}{f.closed ? ' · closed' : ''}</div>
        )}
      </div>
      {art.inside && (
        <AssetImg k={art.inside} alt={`${it.name}, inside`} className="block w-full h-28 object-cover rounded border border-noir-700" />
      )}
    </div>
  );
}

/** What the street view draws for a record. */
export function facadeOf(s: GameState, it: Item, mood: Mood): FacadeSpec {
  const l = it.lot;
  const id = it.useId ?? '';
  let kind: FacadeKind;
  if (it.vacant) kind = 'vacant';
  else if (it.building) kind = 'construction';
  else if (it.forLease && !l?.use) kind = 'lease';
  else if (it.icon === 'motel') kind = /rooming|boarding|flop/.test(id) ? 'house' : 'motel';
  else if (it.icon === 'hotel') kind = 'hotel';
  else if (it.icon === 'club') kind = 'club';
  else if (it.icon === 'house' || it.icon === 'apartment') kind = 'house';
  else if (it.icon === 'warehouse') kind = 'warehouse';
  else if (it.icon === 'public') kind = 'public';
  else if (it.icon === 'pier') kind = id === 'ride' ? (/flyer|coaster/i.test(it.name) ? 'ride' : 'wheel') : id === 'minigolf' ? 'minigolf' : id === 'stand' ? 'stand' : 'arcade';
  else if (it.icon === 'pizza') kind = 'food';
  else kind = 'shop';
  let seed = 0;
  for (const ch of it.key) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  const z = l?.zone ?? (it.biz?.districtId as string | undefined);
  return {
    kind, name: it.name, style: it.style, sign: it.sign, condition: it.condition, closed: it.closed, mood, year: s.date.y,
    lookYear: Math.max(l?.renovated ?? 0, l?.builtYear ?? 1955, s.hood?.styles[it.key]?.since ?? 0),
    progress: it.progress, boardwalk: z === 'boardwalk' || z === 'piers', address: l?.address ?? HOODS_BY_ID[hoodOfZone((z ?? 'downtown') as never) ?? 'downtown']?.name ?? '', seed,
  };
}

function ownerText(s: GameState, it: Item): string {
  if (it.mine) return `House of ${s.houseName}`;
  const l = it.lot;
  if (!l) return '';
  if (l.owner === 'private') return l.status === 'sale' ? 'On the market' : 'An independent owner';
  return rivalName(l.owner);
}

const SIGNS: SignColor[] = ['pink', 'turquoise', 'red', 'gold', 'green', 'blue', 'white'];

function Restyle({ s, lotId }: { s: GameState; lotId: string }) {
  const l = s.econ?.lots.find((x) => x.id === lotId);
  const look = l ? lookOf(s, l) : undefined;
  const [style, setStyle] = useState<BuildStyle>(look?.style ?? 'doowop');
  const [sign, setSign] = useState<SignColor>(look?.sign ?? 'pink');
  if (!l || !look) return null;
  return (
    <div className="space-y-1.5" data-testid="restyle">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">A new look</div>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(STYLES) as BuildStyle[]).map((k) => (
          <button key={k} type="button" onClick={() => setStyle(k)} className={`rounded border px-1.5 py-0.5 text-[11px] ${style === k ? 'border-gold-400 text-gold-300 bg-gold-500/10' : 'border-noir-600 text-stone-300'}`} title={STYLES[k].blurb}>{STYLES[k].name}</button>
        ))}
      </div>
      <div className="flex gap-1 items-center">
        <span className="text-[11px] text-stone-500 mr-1">Neon</span>
        {SIGNS.map((c) => <button key={c} type="button" aria-label={`${c} neon`} onClick={() => setSign(c)} className={`h-5 w-5 rounded-full border-2 ${sign === c ? 'border-white' : 'border-noir-700'}`} style={{ background: SIGN_HEX[c], boxShadow: sign === c ? `0 0 8px ${SIGN_HEX[c]}` : undefined }} />)}
        <span className="ml-auto text-[11px] text-stone-500">~{fmt$(restyleCost(s, l, style))}</span>
      </div>
      <ActionCard s={s} action={{ kind: 'hood', op: { type: 'restyle', lotId, style, sign } }} compact />
    </div>
  );
}

/**
 * The card for a building clicked on the island: the postcard street view,
 * who holds it and who runs it, its history, and the existing paperwork
 * (LotPanel: buy through the Deal window, lease, managers; BizPanel for a
 * place of yours without a lot). The Empire Designer opens from here.
 */
export function StreetCard({ s, it, mood, onClose }: { s: GameState; it: Item; mood: Mood; onClose: () => void }) {
  const empire = useEmpire();
  const l = it.lot;
  // The Empire Designer: your hotel, motel, restaurant, bar or club opens in it;
  // an empty lot of yours is developed through it.
  const ven = it.mine ? (l ? venueForLot(s, l.id) : it.biz ? venueByKey(s, it.biz.id) : undefined) : undefined;
  const develop = it.mine && l && !l.use && l.stage !== 'permits';
  const f = facadeOf(s, it, mood);
  const hood = hoodOfZone((l?.zone ?? it.biz?.districtId ?? 'downtown') as never);
  const hist = (l?.history ?? []).slice(-6).reverse();
  return (
    <div className="space-y-3" data-testid="street-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{hood ? HOODS_BY_ID[hood].name : ''}</div>
          <div className="font-display text-xl leading-tight" style={{ color: it.sign, textShadow: `0 0 10px ${it.sign}55` }}>{it.name}</div>
          <div className="text-xs text-stone-400">{l?.address}</div>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-stone-400 hover:text-gold-300 shrink-0" aria-label="Close">close ×</button>
      </div>
      <Storefront it={it} f={f} />
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-stone-500">Held by</div>
        <div className="text-stone-200 flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: OWNER_COLOR[it.owner] ?? OWNER_COLOR.private }} />{ownerText(s, it)}</div>
        <div className="text-stone-500">Runs it</div>
        <div className="text-stone-200" data-testid="sv-runs">{it.mine ? (s.econ?.managers[l?.bizId ?? (l ? `lot:${l.id}` : it.biz?.id ?? '')]?.name ?? 'Your people') : l?.tenant ?? (it.vacant ? 'Nobody — empty ground' : it.closed ? 'Nobody — it closed' : 'The owner')}</div>
        {l && <><div className="text-stone-500">Status</div><div className="text-stone-200">{STATUS_LABEL[l.status]}{l.status === 'sale' && l.price ? ` · ${fmt$(l.price)}` : ''}{l.status === 'lease' ? ` · ${fmt$(l.rent)}/wk` : ''}</div></>}
        {!it.vacant && <><div className="text-stone-500">Look</div><div className="text-stone-200">{STYLES[it.style].name} · <span style={{ color: it.sign }}>neon</span></div></>}
        {l?.builtYear && <><div className="text-stone-500">Built</div><div className="text-stone-200">{l.builtYear}{l.renovated ? ` · fixed up ${l.renovated}` : ''}</div></>}
        {!it.vacant && l && <><div className="text-stone-500">Condition</div><div className="flex items-center gap-1.5"><div className="h-1.5 w-20 rounded bg-noir-700 overflow-hidden"><div className="h-full" style={{ width: `${l.condition}%`, background: l.condition < 45 ? '#e2563d' : l.condition < 70 ? '#e0b84a' : '#5fae7f' }} /></div><span className="text-stone-400 tabular-nums">{Math.round(l.condition)}%</span></div></>}
      </div>
      {hist.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">The deed</div>
          <ul className="text-[11px] text-stone-400 space-y-0.5" data-testid="sv-history">
            {hist.map((h, i) => <li key={i}><span className="text-stone-500 tabular-nums">{h.year}</span> · {h.how} · {h.owner === 'private' ? h.by ?? 'a private owner' : h.owner === 'player' ? 'you' : rivalName(h.owner)}{h.price ? ` · ${fmt$(h.price)}` : ''}</li>)}
          </ul>
        </div>
      )}
      {ven && <button type="button" className="btn-gold w-full" data-testid="open-designer" onClick={() => empire.open({ venueId: ven.id })}>Open the Empire Designer</button>}
      {!ven && develop && l && <button type="button" className="btn-gold w-full" data-testid="open-designer" onClick={() => empire.open({ pending: { key: `lot:${l.id}`, name: lotName(l), develop: { lotId: l.id } } })}>Develop it in the Designer</button>}
      {it.mine && l && l.stage === 'open' && l.use && (
        <div className="space-y-2 border-t border-noir-700 pt-2">
          <ActionCard s={s} action={{ kind: 'econ', op: { type: 'renovate', lotId: l.id } }} compact />
          <Restyle s={s} lotId={l.id} />
        </div>
      )}
      <div className="border-t border-noir-700 pt-2">
        {l ? <LotPanel s={s} id={l.id} noDesigner /> : it.biz ? <BizPanel s={s} id={it.biz.id} noDesigner /> : null}
      </div>
    </div>
  );
}
