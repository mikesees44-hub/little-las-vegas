import { useEffect, useState } from 'react';
import type { Alert } from '../../engine/alerts';
import { CITIES_BY_ID, GROUP_LABEL, hasPermission, needsPermission, stake, standing, type OwnerGroup } from '../../engine/cities';
import { SCHEME_INFO } from '../../engine/schemes';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import type { MapMode } from '../components/IslandMap';
import { AlertRail, DistrictPanel, PlayerCard } from '../components/MapSide';
import { ActionCard } from '../components/Orders';
import { Overview } from '../components/Overview';
import { CharLink } from '../components/People';
import { GROUP_COLOR, WorldMap, type Level } from './WorldMap';
import { LotPanel } from '../econ/LotPanel';
import { BizPanel } from '../econ/BizPanel';
import { useTravel } from '../travel/context';
import { TravellersPanel } from '../travel/Panels';
import type { MapFocus } from '../shell/context';
import { IslandView } from '../hood/IslandView';
import { RegionView } from '../region/RegionView';
import { HOODS_BY_ID, type HoodId } from '../../engine/hoodData';

/**
 * The map screen: the real map with its overlays (modes, breadcrumbs, legend,
 * the boss's card, alerts) and the side panel (a district, a city, or the
 * whole board), plus the envoys-abroad panel under it.
 */
export function MapView({ s, alerts, onAlert, onOpenBusiness, onEnvoy, shell, focus }: {
  /** Inside the map-first shell: full height, no side panel or alert rail; district and city cards float over the map. */
  shell?: boolean;
  /** Point the map at something (alerts, chips): a mode, a district or city, a level. */
  focus?: MapFocus;
  s: GameState;
  alerts: Alert[];
  onAlert: (a: Alert) => void;
  onOpenBusiness: () => void;
  onEnvoy: (cityId: string) => void;
}) {
  const travel = useTravel();
  const [mode, setMode] = useState<MapMode>('control');
  const [district, setDistrict] = useState<string | undefined>();
  const [city, setCity] = useState<string | undefined>();
  const [level, setLevel] = useState<Level>('usa');
  const [fly, setFly] = useState<{ level: Level; nonce: number } | undefined>();
  const [asOf, setAsOf] = useState<number | undefined>();
  const [since, setSince] = useState(false);
  const [lot, setLot] = useState<string | undefined>();
  // Wildwood up close: the illustrated island (the shell opens on it); 'map' is the Leaflet survey map.
  // South Jersey illustrated: the road-map postcard (the shell's region level); 'map' is Leaflet at every level.
  const [view, setView] = useState<'island' | 'region' | 'map'>(shell ? 'island' : 'map');
  const [hood, setHood] = useState<HoodId | undefined>();
  const island = view === 'island';
  const region = view === 'region';
  const drawn = island || region;
  const go = (l: Level) => { setView(shell && l === 'wildwood' ? 'island' : shell && l === 'region' ? 'region' : 'map'); setFly({ level: l, nonce: (fly?.nonce ?? 0) + 1 }); };
  const crumbs: { l: Level; t: string }[] = [{ l: 'usa', t: 'USA' }, { l: 'region', t: 'South Jersey' }, { l: 'wildwood', t: 'Wildwood' }];
  // The shell opens on the island, not the nation.
  useEffect(() => { if (shell) setFly({ level: 'wildwood', nonce: 1 }); }, [shell]);
  useEffect(() => {
    if (!focus) return;
    setView('map');
    if (focus.mode) setMode(focus.mode);
    if (focus.district) { setDistrict(focus.district); setCity(undefined); }
    if (focus.city) { setCity(focus.city); setDistrict(undefined); }
    const l = focus.level ?? (focus.district ? 'wildwood' : undefined);
    if (l) setFly((f) => ({ level: l, nonce: (f?.nonce ?? 0) + 1 }));
  }, [focus?.nonce]);

  return (
    <div className={shell ? 'h-full' : 'space-y-3'}>
      <div className={shell ? 'relative h-full' : 'grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_400px]'} data-shell={shell ? '' : undefined}>
        <div className={shell ? 'relative isolate overflow-hidden h-full' : 'panel relative isolate overflow-hidden h-[calc(100vh-190px)] min-h-[520px]'}>
          <WorldMap
            s={s}
            mode={mode}
            selectedDistrict={district}
            onDistrict={(id) => { setDistrict(id); setCity(undefined); setLot(undefined); }}
            onCity={(id) => { setCity(id); setDistrict(undefined); }}
            onEnvoy={onEnvoy}
            onTrip={(id) => travel.plan(s.playerId, id)}
            onLevel={setLevel}
            flyTo={fly}
            lots={{ year: asOf, since1960: since }}
            onLot={(id) => { setLot(id); setDistrict(undefined); setCity(undefined); }}
            onBiz={(id) => { setLot(`biz:${id}`); setDistrict(undefined); setCity(undefined); }}
          />
          {region && <div className="absolute inset-0 z-[900]"><RegionView s={s} onEnvoy={onEnvoy} onStreet={() => { setView('island'); setFly({ level: 'wildwood', nonce: (fly?.nonce ?? 0) + 1 }); }} onSurvey={() => { setView('map'); setFly({ level: 'region', nonce: (fly?.nonce ?? 0) + 1 }); }} /></div>}
          {island && <div className="absolute inset-0 z-[900]"><IslandView s={s} onSurvey={() => { setView('map'); setFly({ level: 'wildwood', nonce: (fly?.nonce ?? 0) + 1 }); }} onHood={setHood} /></div>}
          <div className="absolute top-2 left-2 z-[1000] flex flex-col gap-1.5">
            <nav className="flex items-center gap-1 rounded bg-noir-900/90 border border-noir-700 px-2 py-1 text-xs" aria-label="Map level">
              {crumbs.map((c, i) => (
                <span key={c.l} className="flex items-center gap-1">
                  {i > 0 && <span className="text-stone-600">›</span>}
                  <button onClick={() => go(c.l)} className={(island ? c.l === 'wildwood' && !hood : region ? c.l === 'region' : level === c.l) ? 'text-gold-300 font-semibold' : 'text-stone-400 hover:text-gold-300'}>{c.t}</button>
                </span>
              ))}
              {island && hood && <span className="flex items-center gap-1"><span className="text-stone-600">›</span><span className="text-gold-300 font-semibold" data-testid="crumb-hood">{HOODS_BY_ID[hood].name}</span></span>}
            </nav>
            {!drawn && <div className="flex gap-1 flex-wrap" role="group" aria-label="Map mode">
              {(['control', 'heat', 'income', 'rival'] as MapMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-0.5 text-[11px] font-semibold border ${mode === m ? 'bg-gold-500 text-noir-950 border-gold-400' : 'bg-noir-900/85 text-stone-300 border-noir-600 hover:border-gold-500'}`}>
                  {m === 'rival' ? 'Rival influence' : m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>}
            {!drawn && shell && level === 'region' && <button onClick={() => setView('region')} className="self-start rounded bg-gold-500 text-noir-950 border border-gold-400 px-2 py-0.5 text-[11px] font-semibold" data-testid="to-region">South Jersey illustrated</button>}
            {!drawn && shell && level === 'wildwood' && <button onClick={() => setView('island')} className="self-start rounded bg-gold-500 text-noir-950 border border-gold-400 px-2 py-0.5 text-[11px] font-semibold" data-testid="to-island">Wildwood up close</button>}
            {!drawn && level === 'wildwood' && s.date.y > 1960 && (
              <div className="flex items-center gap-1.5 rounded bg-noir-900/90 border border-noir-700 px-2 py-1 text-[11px] text-stone-300" data-testid="map-timeline">
                <span className="text-stone-500">The island in</span>
                <input type="range" min={1960} max={s.date.y} value={asOf ?? s.date.y} onChange={(e) => { const y = Number(e.target.value); setAsOf(y >= s.date.y ? undefined : y); }} aria-label="Show the island as it stood in" className="w-24 accent-[#c49a3a]" />
                <span className="tabular-nums text-gold-300 w-9">{asOf ?? s.date.y}</span>
                <label className="flex items-center gap-1 ml-1"><input type="checkbox" checked={since} onChange={(e) => setSince(e.target.checked)} />since 1960</label>
              </div>
            )}
            {!drawn && <button onClick={() => go(level)} data-testid="map-recenter" className="self-start rounded bg-noir-900/90 border border-noir-600 px-2 py-0.5 text-[11px] text-stone-300 hover:text-gold-300" title="Drag to move around; this brings the view back">⌂ Recenter</button>}
            {!drawn && level !== 'usa' && <button onClick={() => go('usa')} className="self-start rounded bg-noir-900/90 border border-noir-600 px-2 py-0.5 text-[11px] text-stone-300 hover:text-gold-300">← Back to US</button>}
          </div>
          {!shell && <div className="absolute right-12 top-2 z-[1000]"><AlertRail s={s} items={alerts} onAlert={onAlert} /></div>}
          <div className="absolute left-2 bottom-6 z-[1000] hidden sm:block"><PlayerCard s={s} /></div>
          {!drawn && <div className="absolute right-2 bottom-6 z-[1000] rounded bg-noir-900/90 border border-noir-700 px-2 py-1.5 text-[10px] text-stone-400 max-w-[50%]" data-testid="map-legend">
            <div className="uppercase tracking-[0.25em] text-stone-500 mb-0.5">Who holds what</div>
            {(['player', 'philly', 'manno', 'newyork', 'other', 'unclaimed', 'exiles'] as OwnerGroup[]).map((g) => (
              <div key={g} className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full border border-noir-950" style={{ background: GROUP_COLOR[g] }} />{GROUP_LABEL[g]}</div>
            ))}
          </div>}
        </div>
        <aside className="panel p-3 sm:p-4 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto">
          {lot ? (
            <>
              <button className="text-xs text-stone-500 hover:text-gold-300 mb-2" onClick={() => setLot(undefined)}>← the whole board</button>
              {lot.startsWith('biz:') ? <BizPanel s={s} id={lot.slice(4)} /> : <LotPanel s={s} id={lot} />}
            </>
          ) : district ? (
            <>
              <button className="text-xs text-stone-500 hover:text-gold-300 mb-2" onClick={() => setDistrict(undefined)}>← the whole board</button>
              <DistrictPanel s={s} id={district} onOpenBusiness={onOpenBusiness} />
            </>
          ) : city ? (
            <>
              <button className="text-xs text-stone-500 hover:text-gold-300 mb-2" onClick={() => setCity(undefined)}>← the whole board</button>
              <CityPanel s={s} id={city} onEnvoy={onEnvoy} />
            </>
          ) : shell ? null : <Overview s={s} />}
        </aside>
      </div>
      {!shell && <EnvoysAbroad s={s} />}
      {!shell && <TravellersPanel s={s} />}
    </div>
  );
}

export function CityPanel({ s, id, onEnvoy }: { s: GameState; id: string; onEnvoy: (cityId: string) => void }) {
  const c = CITIES_BY_ID[id];
  if (!c) return null;
  const travelApi = useTravel();
  const running = s.schemes.find((x) => x.owner === 'player' && x.kind === 'envoy' && x.opts.city === id);
  return (
    <div className="space-y-2" data-testid="city-panel">
      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{c.region}</div>
      <div className="font-display text-2xl text-gold-400">{c.name}</div>
      <div className="flex items-center gap-2 text-sm"><span className="inline-block w-3 h-3 rounded-full" style={{ background: GROUP_COLOR[c.group] }} /><span className="text-stone-200">{c.owner}</span></div>
      {c.group !== 'player' && <div className="text-xs text-stone-400">Run by {c.boss}</div>}
      <p className="text-sm text-stone-300 italic">{c.flavor}</p>
      <div className="text-xs text-stone-400">Rackets: <span className="text-stone-200">{c.rackets.join(', ')}</span></div>
      <div className="text-xs text-stone-400">Your stake: <span className="text-stone-200">{stake(s, id)}</span> · standing {standing(s, id)}</div>
      {id !== 'wildwood' && (
        <>
          <div className="text-xs text-stone-400">Envoy difficulty {c.difficulty} · a partnership pays ~{fmt$(c.income)}/wk, a franchise more.</div>
          {needsPermission(c) && (
            <div className="text-xs">{hasPermission(s, id) ? <span className="text-emerald-300">Philadelphia has given its blessing.</span> : <span className="text-amber-300">Outside South Jersey: Philadelphia expects to be asked.</span>}</div>
          )}
          {needsPermission(c) && !hasPermission(s, id) && <ActionCard s={s} action={{ kind: 'askPermission', city: id }} compact />}
          {running ? <div className="text-xs text-gold-300">An envoy is on the way ({running.progress}%).</div> : <button className="btn-gold w-full" onClick={() => onEnvoy(id)}>Send an envoy…</button>}
          {!s.gameOver && <button className="btn-ghost w-full" onClick={() => travelApi.plan(s.playerId, id)}>Travel here…</button>}
        </>
      )}
    </div>
  );
}

export function EnvoysAbroad({ s }: { s: GameState }) {
  const out = s.schemes.filter((x) => x.owner === 'player' && x.kind === 'envoy');
  return (
    <section className="panel p-3" data-testid="envoys-abroad">
      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Envoys abroad</div>
      {out.length === 0 && s.outposts.length === 0 && <p className="text-sm text-stone-400 mt-1">Nobody is out. Pick a city on the map — or a district on the island — and send a man.</p>}
      <ul className="mt-1 space-y-1 text-sm">
        {out.map((sc) => {
          const c = CITIES_BY_ID[sc.opts.city ?? ''];
          const a = sc.agents[0];
          return (
            <li key={sc.id} className="flex flex-wrap items-center gap-2">
              <span className="text-stone-200">{c?.name}</span>
              <span className="text-stone-500 text-xs">{SCHEME_INFO.envoy.name} · <CharLink s={s} id={a} /> · {sc.progress}%</span>
              <div className="h-1 w-32 rounded bg-noir-700 overflow-hidden"><div className="h-full bg-gold-500" style={{ width: `${sc.progress}%` }} /></div>
            </li>
          );
        })}
        {s.outposts.map((o) => (
          <li key={o.city} className="text-stone-300">
            {CITIES_BY_ID[o.city]?.name}: <span className="text-gold-300">{o.kind === 'franchise' ? 'a franchise' : o.kind === 'partner' ? 'a partnership' : 'a contact'}</span>
            {o.income > 0 && <span className="text-stone-500 text-xs"> · {fmt$(o.income)}/wk</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
