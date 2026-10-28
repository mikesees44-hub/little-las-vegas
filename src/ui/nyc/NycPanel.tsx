import { useState } from 'react';
import { displayName } from '../../engine/characters';
import {
  atWar, blessGift, capoPool, controllerOf, crewIn, crewLedger, familyOpinion, grievanceOf, inNewYork, isBlessed, nycOf, ownerToAsk, racketIncome, reparations, soldierPool,
  MAX_SOLDIERS, SUMMONS_AT, type NycAction,
} from '../../engine/nyc';
import { NYC_DISTRICTS_BY_ID, NYC_FAMILIES, NYC_FAMILY_IDS, NYC_RACKETS, type NycFamilyId } from '../../engine/nycData';
import { NYC_SIDE_STYLE, SIDE_STYLE } from '../../engine/sides';
import { sceneOf } from '../../engine/visitData';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';
import { fmt$ } from '../format';
import { districtTint, NycMap } from './NycMap';

/**
 * The New York map with its side panel: the neighborhood you picked (who
 * runs it, your crew and rackets there, the people you can see there) and
 * the five families (their blessing, tribute, the Commission). Every button
 * is an order (kind 'nyc', engine/nyc.ts) through the usual order cards, so
 * time costs, money and "Do it tomorrow" work as everywhere else.
 */

const nyc = (op: NycAction): PlayerAction => ({ kind: 'nyc', op });

function Chip({ color, emblem, text }: { color: string; emblem: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider" style={{ borderColor: color, color }}>
      <span className="inline-flex w-3 h-3 items-center justify-center rounded-full text-[8px] text-noir-900" style={{ background: color }}>{emblem}</span>{text}
    </span>
  );
}

function CrewForm({ s, district }: { s: GameState; district: string }) {
  const capos = capoPool(s);
  const [capoId, setCapo] = useState<string | undefined>(capos[0]?.id);
  const capo = capos.find((c) => c.id === capoId) ?? capos[0];
  const pool = soldierPool(s, capo?.id).slice(0, 12);
  const [picked, setPicked] = useState<string[]>(() => pool.slice(0, 2).map((c) => c.id));
  const men = picked.filter((id) => pool.some((c) => c.id === id));
  if (!capo) return <p className="text-xs text-stone-500">No capo free to lead a crew: every one of them is busy, away or already in New York.</p>;
  return (
    <div className="space-y-1.5" data-testid="nyc-crew-form">
      <label className="block text-[11px] text-stone-400">Capo
        <select className="ml-2 rounded bg-noir-900 border border-noir-600 px-1 py-0.5 text-stone-200" value={capo.id} onChange={(e) => { setCapo(e.target.value); setPicked(soldierPool(s, e.target.value).slice(0, 2).map((c) => c.id)); }}>
          {capos.map((c) => <option key={c.id} value={c.id}>{displayName(c)}</option>)}
        </select>
      </label>
      <div className="text-[11px] text-stone-400">His men ({men.length}/{MAX_SOLDIERS}):</div>
      <div className="flex flex-wrap gap-1">
        {pool.map((c) => {
          const on = men.includes(c.id);
          return (
            <button key={c.id} type="button" onClick={() => setPicked(on ? men.filter((x) => x !== c.id) : men.length < MAX_SOLDIERS ? [...men, c.id] : men)}
              className={`rounded border px-1.5 py-0.5 text-[11px] ${on ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-400'}`}>
              {displayName(c)}{c.capoId === capo.id ? '' : ' ·'}
            </button>
          );
        })}
      </div>
      <ActionCard s={s} action={nyc({ op: 'crew', district, capoId: capo.id, soldiers: men })} />
    </div>
  );
}

function DistrictPanel({ s, id, onPlace }: { s: GameState; id: string; onPlace?: (placeId: string) => void }) {
  const d = NYC_DISTRICTS_BY_ID[id];
  const t = districtTint(s, id);
  const crew = crewIn(s, id);
  const owner = ownerToAsk(s, id);
  const ctl = controllerOf(s, id);
  const scene = sceneOf('newyork');
  const L = crew ? crewLedger(s, crew) : undefined;
  return (
    <div className="space-y-2" data-testid="nyc-district-panel">
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{d.borough}</div>
        <h3 className="font-display text-xl text-gold-400 leading-tight">{d.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Chip color={t.color} emblem={t.emblem} text={ctl === 'player' ? 'YOURS' : ctl === 'open' ? 'NOBODY\'S' : NYC_SIDE_STYLE[ctl].short} />
          {owner && <span className={`text-[11px] ${atWar(s, owner) ? 'text-red-300' : isBlessed(s, owner) ? 'text-emerald-300' : 'text-amber-300'}`}>
            {atWar(s, owner) ? 'At war with you' : isBlessed(s, owner) ? 'You have their blessing' : 'You have not asked'}
          </span>}
        </div>
      </div>
      <p className="text-xs text-stone-400 italic">{d.text}</p>
      {d.places?.length ? (
        <div className="text-[11px] text-stone-400">Here:{' '}
          {d.places.map((pid, i) => {
            const p = scene?.places.find((x) => x.id === pid);
            if (!p) return null;
            return <span key={pid}>{i ? ', ' : ''}{onPlace ? <button type="button" className="underline text-gold-300 hover:text-gold-200" onClick={() => onPlace(pid)}>{p.name}</button> : <span className="text-stone-200">{p.name}</span>}{p.contact ? <span className="text-stone-500"> ({p.contact})</span> : null}</span>;
          })}
        </div>
      ) : null}
      {crew ? (
        <section className="rounded border border-gold-700/50 bg-noir-800/60 p-2 space-y-1.5" data-testid="nyc-crew">
          <div className="text-[10px] uppercase tracking-[0.25em] text-gold-300">Your crew · since week {crew.since}</div>
          <div className="text-xs text-stone-300"><CharLink s={s} id={crew.capoId} /> with {crew.soldiers.map((sid, i) => <span key={sid}>{i ? ', ' : ''}<CharLink s={s} id={sid} /></span>)}</div>
          {L && <div className="text-[11px] text-stone-400 tabular-nums">Street {fmt$(L.street)} · rackets {fmt$(L.rackets)} · keep −{fmt$(L.keep)}{L.tribute ? ` · the ${NYC_FAMILIES[owner!].short}s' cut −${fmt$(L.tribute)}` : ''} = <span className={L.net >= 0 ? 'text-emerald-300' : 'text-red-300'}>{fmt$(L.net)}/wk</span></div>}
          {crew.hold ? <div className="text-[11px] text-amber-300">Holding the neighborhood in the war: {crew.hold} of 6 weeks.</div> : null}
          <div className="space-y-1.5">
            {d.rackets.map((k) => crew.rackets.includes(k)
              ? <div key={k} className="text-[11px] text-emerald-300">✓ {NYC_RACKETS[k].name} — about {fmt$(racketIncome(s, crew, k))}/wk</div>
              : <ActionCard key={k} s={s} action={nyc({ op: 'racket', district: id, racket: k })} compact />)}
          </div>
          <ActionCard s={s} action={nyc({ op: 'recall', district: id })} compact />
        </section>
      ) : (
        <section className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Rackets here</div>
          <ul className="text-[11px] text-stone-400">
            {d.rackets.map((k) => <li key={k}>· {NYC_RACKETS[k].name}: {fmt$(NYC_RACKETS[k].cost)} in, about {fmt$(NYC_RACKETS[k].income * d.rich)}/wk</li>)}
          </ul>
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 pt-1">Open a crew</div>
          <CrewForm key={id} s={s} district={id} />
        </section>
      )}
    </div>
  );
}

function FamilyRow({ s, f }: { s: GameState; f: NycFamilyId }) {
  const fam = NYC_FAMILIES[f];
  const st = NYC_SIDE_STYLE[f];
  const n = nycOf(s);
  const g = grievanceOf(s, f);
  const war = atWar(s, f);
  const called = n.summons?.family === f;
  const [open, setOpen] = useState(called || war);
  return (
    <li className="rounded border border-noir-700 bg-noir-800/50 p-2 space-y-1" data-testid={`nyc-family-${f}`}>
      <button type="button" className="w-full flex flex-wrap items-center gap-2 text-left" onClick={() => setOpen(!open)}>
        <Chip color={st.color} emblem={st.emblem} text={st.short} />
        <span className="text-[11px] text-stone-400">{fam.boss}</span>
        <span className="ml-auto text-[10px] tabular-nums text-stone-400">opinion {familyOpinion(s, f)} · grievance <span className={g >= SUMMONS_AT * 0.7 ? 'text-red-300' : ''}>{g}</span></span>
      </button>
      <div className="text-[11px]">
        {war ? <span className="text-red-300">At war with you.</span> : called ? <span className="text-red-300">The Commission has called a sit-down: before week {n.summons!.due + 1}.</span> : isBlessed(s, f) ? <span className="text-emerald-300">Blessing until week {n.blessed[f]}.</span> : <span className="text-stone-500">No arrangement.</span>}
      </div>
      {open && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] text-stone-500 italic">{fam.flavor}</p>
          {(called || war) ? (
            <>
              <ActionCard s={s} action={nyc({ op: 'sitdown', family: f, offer: 'pay' })} label={`Sit down and pay (${fmt$(reparations(s, f))})`} />
              <ActionCard s={s} action={nyc({ op: 'sitdown', family: f, offer: 'cede' })} label="Sit down and give the ground back" />
            </>
          ) : (
            <ActionCard s={s} action={nyc({ op: 'bless', family: f })} label={`Ask ${fam.boss.split(' ')[0]}'s blessing (${fmt$(blessGift(s, f))})`} />
          )}
          <ActionCard s={s} action={nyc({ op: 'tribute', family: f, amount: 1000 })} compact />
        </div>
      )}
    </li>
  );
}

export function NycFamilies({ s }: { s: GameState }) {
  return (
    <section className="space-y-1.5" data-testid="nyc-families">
      <div className="flex items-baseline gap-2">
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">The five families</div>
        {!inNewYork(s) && <span className="text-[10px] text-stone-500">Blessings and sit-downs are asked in person, in New York.</span>}
      </div>
      <ul className="space-y-1.5">{NYC_FAMILY_IDS.map((f) => <FamilyRow key={f} s={s} f={f} />)}</ul>
    </section>
  );
}

/** The map and its panel, for the city screen's Map tab and the world map's New York card. */
export function NycMapView({ s, onPlace }: { s: GameState; onPlace?: (placeId: string) => void }) {
  const [sel, setSel] = useState<string | undefined>();
  const n = nycOf(s);
  const log = n.log.slice(-6).reverse();
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_330px]" data-testid="nyc-map-view">
      <div className="space-y-2 min-w-0">
        <NycMap s={s} sel={sel} onSelect={setSel} />
        {log.length > 0 && (
          <ul className="text-[11px] space-y-0.5" data-testid="nyc-log">
            {log.map((l, i) => <li key={i} className={l.tone === 'good' ? 'text-emerald-300' : l.tone === 'bad' ? 'text-red-300' : 'text-stone-400'}>Week {l.week} · {l.text}</li>)}
          </ul>
        )}
      </div>
      <div className="space-y-3 lg:max-h-[70vh] lg:overflow-y-auto pr-1">
        {sel ? <DistrictPanel s={s} id={sel} onPlace={onPlace} /> : (
          <div className="text-xs text-stone-400 space-y-1">
            <p>Pick a neighborhood on the map. Coloured ones belong to one of the five families; grey ones are nobody's.</p>
            {n.crews.length > 0 && <p className="text-gold-300">Your crews: {n.crews.map((c, i) => <button key={c.district} type="button" className="underline mr-1" onClick={() => setSel(c.district)}>{i ? '' : ''}{NYC_DISTRICTS_BY_ID[c.district]?.name}</button>)}</p>}
            <p className="text-[11px]" style={{ color: SIDE_STYLE.player.color }}>★ marks a neighborhood where your crew works.</p>
          </div>
        )}
        <NycFamilies s={s} />
      </div>
    </div>
  );
}
