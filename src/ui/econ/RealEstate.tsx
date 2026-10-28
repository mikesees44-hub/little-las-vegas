import { useState } from 'react';
import { goodwill, lotName, lotsIn, STAGE_LABEL, USES_BY_ID, ZONES, ZONES_BY_ID } from '../../engine/property';
import type { Lot, StageId, ZoneId } from '../../engine/econState';
import { zoneRep } from '../../engine/gifts';
import { FACTION_NAMES } from '../../engine/world';
import type { FactionId, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { StageBar } from './Holdings';
import { PROP_GROUPS, groupOfLot, type PropGroup } from '../../engine/propertyGroups';
import { lotProgress, lotSvg } from '../map/lotIcons';
import { kindOf, listingCounts, newListings, seasonPrice, WHY_LABEL, type MarketKind } from '../../engine/market';

/** One glyph per construction stage (the same marks the map uses). */
export const STAGE_GLYPH: Record<StageId, string> = {
  purchase: '$', permits: '§', siteprep: '≈', foundation: '▁', framing: '#', exterior: '▣', interior: '◩', open: '★',
};

export const STATUS_LABEL: Record<Lot['status'], string> = {
  sale: 'For sale', lease: 'For lease', private: 'Privately held', owned: 'Yours', leased: 'Yours (leased)', rival: 'Rival-owned', public: 'The city',
};

/** The real-estate market: every lot in a district, what's on it and what it costs. */
export function RealEstate({ s, zone: initial }: { s: GameState; zone?: ZoneId }) {
  const [zone, setZone] = useState<ZoneId>(initial ?? 'boardwalk');
  const z = ZONES_BY_ID[zone];
  const all = lotsIn(s, zone);
  const [kind, setKind] = useState<PropGroup | 'all'>('all');
  const present = PROP_GROUPS.filter((g) => all.some((l) => groupOfLot(s, l) === g.id));
  const k = present.some((g) => g.id === kind) ? kind : 'all';
  const lots = k === 'all' ? all : all.filter((l) => groupOfLot(s, l) === k);
  const rep = zoneRep(s, zone);
  return (
    <div className="space-y-4" data-testid="real-estate">
      <NewListings s={s} onZone={setZone} />
      <div className="flex flex-wrap gap-1">
        {ZONES.map((x) => {
          const sale = lotsIn(s, x.id).filter((l) => l.status === 'sale' || l.status === 'lease').length;
          const mine = lotsIn(s, x.id).filter((l) => l.status === 'owned' || l.status === 'leased').length;
          return (
            <button key={x.id} className={`text-xs px-2 py-1 rounded border ${zone === x.id ? 'border-gold-400 text-gold-300 bg-noir-800' : 'border-noir-700 text-stone-400 hover:text-stone-200'}`} onClick={() => setZone(x.id)}>
              {x.name} <span className="text-stone-500">{sale} open{mine ? ` · ${mine} yours` : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="rounded-md border border-noir-700 bg-noir-800/50 p-3 text-xs text-stone-400">
        <div className="font-display text-lg text-gold-400">{z.name}</div>
        Land {z.land >= 1.3 ? 'is dear' : z.land <= 0.7 ? 'is cheap' : 'goes for the usual'} here (×{z.land}). Summer demand ×{z.season[0]}, winter ×{z.season[1]}{z.season[0] === z.season[1] ? ' — the same all year' : ''}.
        {z.rival && <> {FACTION_NAMES[z.rival]} already owns pieces of it; buying here annoys them.</>}
        <div className="mt-1">Appreciation {rep.rep} · trust {rep.trust} <span className="text-stone-500">(community projects build both; trust grows slower and heat wears it down)</span></div>
      </div>
      <div className="flex flex-wrap gap-1 text-[11px]" role="radiogroup" aria-label="Type of property">
        {[{ id: 'all' as const, icon: '', label: 'Everything' }, ...present].map((g) => (
          <button key={g.id} type="button" role="radio" aria-checked={k === g.id} onClick={() => setKind(g.id)}
            className={`rounded border px-2 py-0.5 ${k === g.id ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>
            {g.icon} {g.label} <span className="opacity-70">{g.id === 'all' ? all.length : all.filter((l) => groupOfLot(s, l) === g.id).length}</span>
          </button>
        ))}
      </div>
      <StreetStrip s={s} lots={lots} />
      <ul className="grid gap-2 md:grid-cols-2">
        {lots.map((l) => <LotCard key={l.id} s={s} l={l} />)}
      </ul>
      <p className="text-[11px] text-stone-500">Prices rise about 3% a year. Buying the business with the building gets you a going concern and its old owner as manager; buying the building alone makes you the landlord. Rivals buy what you don't.</p>
    </div>
  );
}

/** The district's lots as a strip of tiles, the way they sit on the map. */
export function StreetStrip({ s, lots }: { s: GameState; lots: Lot[] }) {
  void s;
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" data-testid="street-strip">
      {lots.map((l) => (
        <div key={l.id} title={`${lotName(l)} — ${STATUS_LABEL[l.status]}${l.stage ? ` · ${STAGE_LABEL[l.stage]}` : ''}`}
          className={`shrink-0 w-12 h-12 rounded border flex flex-col items-center justify-center text-[10px] ${tileClass(l)}`}>
          <span className="leading-none" dangerouslySetInnerHTML={{ __html: lotSvg(l, { size: 26 }) }} />
          <span className="truncate w-full text-center px-0.5">{l.use ? USES_BY_ID[l.use].name.split(' ')[0] : 'lot'}</span>
        </div>
      ))}
    </div>
  );
}

function tileClass(l: Lot): string {
  if (l.status === 'owned' || l.status === 'leased') return 'border-gold-400 bg-gold-500/15 text-gold-200';
  if (l.status === 'sale') return 'border-emerald-700 bg-emerald-900/20 text-emerald-200';
  if (l.status === 'lease') return 'border-sky-700 bg-sky-900/20 text-sky-200';
  if (l.status === 'rival') return 'border-red-800 bg-red-900/20 text-red-300';
  return 'border-noir-700 bg-noir-800 text-stone-500';
}

function LotCard({ s, l }: { s: GameState; l: Lot }) {
  const u = l.use ? USES_BY_ID[l.use] : undefined;
  return (
    <li className="rounded-md border border-noir-700 bg-noir-900/40 p-2.5 text-xs" data-testid="lot-card">
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className="text-stone-100 font-semibold text-sm">{lotName(l)}</div>
          <div className="text-stone-500">
            {STATUS_LABEL[l.status]}{l.owner !== 'private' && l.owner !== 'player' ? ` (${FACTION_NAMES[l.owner as FactionId]})` : ''}
            {u && l.stage === 'open' && <> · built {l.builtYear} · condition {Math.round(l.condition)}%</>}
            {l.tenant && <> · {l.tenant}</>}
          </div>
        </div>
        <div className="text-right tabular-nums text-stone-300 shrink-0">
          {l.status === 'sale' && <div>{fmt$(l.price)}</div>}
          {l.status === 'lease' && <div>{fmt$(l.rent)}/wk</div>}
          {l.status === 'sale' && l.tenant && <div className="text-stone-500">+{fmt$(goodwill(s, l))} goodwill</div>}
        </div>
      </div>
      {(l.status === 'owned' || l.status === 'leased') && l.stage && l.stage !== 'open' && l.stage !== 'purchase' && <StageBar s={s} l={l} />}
      <div className="mt-1.5 grid gap-1.5">
        {l.status === 'sale' && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'buyLot', lotId: l.id } }} compact />}
        {l.status === 'sale' && l.tenant && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'buyLot', lotId: l.id, going: true } }} compact />}
        {l.status === 'lease' && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'leaseLot', lotId: l.id } }} compact />}
        {(l.status === 'owned' || l.status === 'leased') && <p className="text-stone-400">Yours — managed under Rackets › Your places.</p>}
        {l.status !== 'owned' && l.status !== 'leased' && l.stage && l.stage !== 'open' && l.stage !== 'purchase' && (
          <p className="text-amber-300/80">Under construction by {l.developer ?? 'someone'}: {STAGE_LABEL[l.stage]} ({Math.round(lotProgress(l) * 100)}%){l.contractor ? ' — your crews hold the contract' : ''}{l.stopWork ? ` — stopped: ${l.stopWork.reason}` : ''}</p>
        )}
        {l.status === 'rival' && l.stage && l.stage !== 'open' && l.stage !== 'purchase' && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'slowRival', lotId: l.id } }} compact />}
        {l.status === 'private' && l.stage === 'open' && <p className="text-stone-500">Not on the market. Owners change their minds; check back.</p>}
      </div>
    </li>
  );
}


const KIND_WORD: Record<MarketKind, string> = { homeLand: 'House lot', house: 'House', land: 'Lot', building: 'Building' };

/** What came on the market in the week just played (or, when nothing did, the last month), and how much is for sale. */
export function NewListings({ s, onZone }: { s: GameState; onZone?: (z: ZoneId) => void }) {
  const [all, setAll] = useState(false);
  const week = newListings(s, 1);
  const recent = week.length ? week : newListings(s, 4);
  const shown = all ? recent : recent.slice(0, 6);
  const c = listingCounts(s);
  const m = s.date.m;
  const mood = m >= 3 && m <= 6 ? 'The spring market: plenty listed, and dear.' : seasonPrice(m) <= 0.9 ? 'Winter: few listings, and the prices are soft.' : m <= 8 ? 'High summer: the prices hold.' : 'The fall: the market slows.';
  return (
    <section className="rounded-md border border-emerald-800/60 bg-emerald-950/20 p-3 text-xs" data-testid="new-listings">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-display text-base text-emerald-200">{week.length ? `New listings this week (${week.length})` : 'Nothing new this week'}</div>
        <div className="text-stone-400" data-testid="listing-counts">For sale: {c.homeLand} house lots · {c.house} houses · {c.land} lots · {c.building} buildings</div>
      </div>
      <div className="text-stone-500">{mood}{!week.length && recent.length ? ' Listed in the last month:' : ''}</div>
      {shown.length > 0 && (
        <ul className="mt-2 grid gap-1.5 md:grid-cols-2">
          {shown.map(({ lot: l, l: why }) => (
            <li key={l.id} className="rounded border border-noir-700 bg-noir-900/50 p-2" data-testid="new-listing">
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <span className="mr-1 rounded bg-emerald-800/60 px-1 py-0.5 text-[10px] font-bold text-emerald-100">{WHY_LABEL[why.why]}</span>
                  <span className="text-stone-100 font-semibold">{lotName(l)}</span>
                  <div className="text-stone-500">{KIND_WORD[kindOf(l)]} · <button type="button" className="underline decoration-dotted hover:text-gold-300" onClick={() => onZone?.(l.zone)}>{ZONES_BY_ID[l.zone]?.name ?? l.zone}</button>{lotName(l).includes(l.address) ? '' : ` · ${l.address}`}</div>
                </div>
                <div className="text-right tabular-nums shrink-0">
                  <div className="text-stone-200">{fmt$(l.price)}</div>
                  {why.ask && why.ask > l.price && <div className="text-stone-500 line-through">{fmt$(why.ask)}</div>}
                </div>
              </div>
              <div className="mt-1"><ActionCard s={s} action={{ kind: 'econ', op: { type: 'buyLot', lotId: l.id } }} compact /></div>
            </li>
          ))}
        </ul>
      )}
      {recent.length > 6 && <button type="button" className="mt-1 text-emerald-300 hover:text-gold-300" onClick={() => setAll((x) => !x)}>{all ? 'Fewer' : `All ${recent.length}`}</button>}
    </section>
  );
}
