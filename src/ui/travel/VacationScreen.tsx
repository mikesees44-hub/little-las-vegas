import { useState } from 'react';
import { formatDate, monthName } from '../../engine/calendar';
import { displayName } from '../../engine/characters';
import { actingBoss, dayDate, travellers } from '../../engine/travel';
import { TIER_INFO } from '../../engine/travelDests';
import { resolveTransport } from '../../engine/transport';
import { destOf } from '../../engine/trips';
import type { Trip } from '../../engine/travelState';
import type { Character, GameState } from '../../engine/types';
import {
  bossVacation, HEADLINE_HOURS, planVac, sceneOf, unplanVac, VAC, VAC_DAY_HOURS, vacHours, vacOptions, vacParty, type SceneKind, type VacKind,
} from '../../engine/vacation';
import { fmt$ } from '../format';
import { Modal } from '../components/Modal';
import { CharLink, Face } from '../components/People';
import { ModeIcon } from './icons';
import { ActionCard } from '../components/Orders';

const PHASE: Record<string, string> = { booked: 'Booked', out: 'On the way', there: 'On vacation', back: 'On the way home' };

/* ---------------------------------------------------------------- */
/* The postcard: a period scene in SVG, no pictures                  */
/* ---------------------------------------------------------------- */

const SKY: Record<SceneKind, [string, string]> = {
  beach: ['#f6b26b', '#7ec8e3'], desert: ['#f9844a', '#5b2a86'], mountains: ['#ffd6a5', '#6c9bd2'], lake: ['#fde2b3', '#5fa8d3'],
  spa: ['#fbe7c6', '#94b9d8'], city: ['#f4a259', '#33415c'], island: ['#ffd29d', '#2ec4b6'],
};

function Ground({ scene }: { scene: SceneKind }) {
  switch (scene) {
    case 'beach':
    case 'island':
      return (
        <g>
          <rect x="0" y="78" width="400" height="22" fill="#2f7fb5" />
          <path d="M0 84 Q20 80 40 84 T80 84 T120 84 T160 84 T200 84 T240 84 T280 84 T320 84 T360 84 T400 84" stroke="#bfe6ff" strokeWidth="1.5" fill="none" />
          <path d="M0 100 L0 94 Q120 86 400 92 L400 100 Z" fill="#f3d9a4" />
          {scene === 'island' ? <path d="M250 80 Q285 58 320 80 Z" fill="#2d6a4f" /> : null}
          <g transform="translate(60 92)"><path d="M0 0 L2 -34" stroke="#6b4423" strokeWidth="3" /><path d="M2 -34 q-14 -2 -22 8 M2 -34 q14 -4 22 6 M2 -34 q-6 -10 -16 -12 M2 -34 q8 -10 18 -10" stroke="#2d6a4f" strokeWidth="3" fill="none" /></g>
          <g transform="translate(330 95)"><path d="M0 0 L0 -18" stroke="#444" strokeWidth="1.5" /><path d="M-14 -16 Q0 -28 14 -16 Z" fill="#e63946" /><path d="M-14 -16 Q-7 -22 0 -16 Z" fill="#fff" /></g>
          {scene === 'island' ? <g transform="translate(180 74)"><path d="M0 0 L10 -18 L10 0 Z" fill="#fff" /><path d="M-6 0 L16 0 L12 4 L-2 4 Z" fill="#8d5524" /></g> : null}
        </g>
      );
    case 'desert':
      return (
        <g>
          <path d="M0 100 L0 80 L40 80 L55 64 L90 64 L100 80 L400 80 L400 100 Z" fill="#9c4f2e" />
          <path d="M240 80 L260 60 L300 60 L315 80 Z" fill="#b5653f" />
          <g transform="translate(150 50)"><rect x="0" y="0" width="70" height="22" rx="3" fill="#1d1d2b" stroke="#ff5d8f" strokeWidth="2" /><text x="35" y="15" textAnchor="middle" fontSize="11" fill="#ffd166" fontFamily="Georgia, serif" letterSpacing="2">CASINO</text><rect x="33" y="22" width="4" height="10" fill="#333" /></g>
          <g transform="translate(350 82)"><path d="M0 0 L0 -18 M0 -10 L-6 -14 L-6 -18 M0 -8 L6 -12 L6 -16" stroke="#2d6a4f" strokeWidth="3" fill="none" /></g>
        </g>
      );
    case 'mountains':
    case 'lake':
      return (
        <g>
          <path d="M0 80 L60 40 L110 70 L170 30 L240 75 L300 45 L400 80 L400 100 L0 100 Z" fill="#4a6a5a" />
          <path d="M170 30 L160 40 L180 40 Z M60 40 L52 46 L68 46 Z" fill="#fff" />
          {scene === 'lake'
            ? <g><rect x="0" y="80" width="400" height="20" fill="#3d7ea6" /><g transform="translate(250 80)"><rect x="-16" y="-8" width="32" height="6" fill="#fff" /><rect x="-6" y="-14" width="4" height="6" fill="#c0392b" /><path d="M-20 -2 L20 -2 L16 2 L-16 2 Z" fill="#222" /></g></g>
            : <path d="M0 100 L0 86 Q200 78 400 88 L400 100 Z" fill="#2f4f3a" />}
          {[30, 48, 330, 352, 370].map((x) => <path key={x} d={`M${x} ${scene === 'lake' ? 82 : 90} l6 -16 l6 16 Z`} fill="#1f3d2b" />)}
        </g>
      );
    case 'spa':
      return (
        <g>
          <path d="M0 100 L0 84 L400 84 L400 100 Z" fill="#6a994e" />
          <g transform="translate(120 46)"><path d="M0 12 L80 12 L40 0 Z" fill="#f2e8cf" /><rect x="4" y="12" width="72" height="26" fill="#f2e8cf" />{[10, 24, 38, 52, 66].map((x) => <rect key={x} x={x} y="14" width="4" height="24" fill="#d6ccb0" />)}</g>
          <path d="M0 88 L400 88" stroke="#fff" strokeWidth="2" strokeDasharray="6 4" />
          <g transform="translate(300 80)"><path d="M0 0 q6 -10 16 -8 l4 -6 l2 6 q4 2 2 8 l-4 0 l0 6 M4 0 l0 6" stroke="#5c3d2e" strokeWidth="3" fill="none" /></g>
        </g>
      );
    case 'city':
      return (
        <g>
          {[[10, 40, 40], [55, 28, 52], [88, 44, 36], [135, 24, 60], [165, 36, 46], [205, 30, 66], [240, 42, 40], [290, 26, 56], [322, 38, 44], [365, 30, 50]].map(([x, w, h]) => (
            <g key={x}><rect x={x} y={100 - h} width={w} height={h} fill="#1b263b" />{Array.from({ length: Math.floor(h / 10) }, (_, i) => <rect key={i} x={x + 4} y={100 - h + 4 + i * 10} width={w - 8} height="3" fill="#ffd166" opacity={0.35 + ((x + i) % 3) * 0.2} />)}</g>
          ))}
          <path d="M218 34 L218 20 L222 20 L222 34" fill="#1b263b" />
        </g>
      );
  }
}

/** A "Greetings from…" postcard header for the destination (pure SVG, period lettering). */
export function Postcard({ scene, name, sub }: { scene: SceneKind; name: string; sub?: string }) {
  const [top, bottom] = SKY[scene];
  const id = `sky-${scene}`;
  return (
    <div className="relative overflow-hidden rounded-md border-4 border-[#f4ead5] shadow-lg shadow-black/50" data-testid="vacation-postcard" data-scene={scene}>
      <svg viewBox="0 0 400 100" className="block w-full h-auto" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={bottom} /><stop offset="1" stopColor={top} /></linearGradient></defs>
        <rect width="400" height="100" fill={`url(#${id})`} />
        <circle cx={scene === 'city' || scene === 'desert' ? 330 : 300} cy="30" r="14" fill="#fff3b0" opacity="0.9" />
        <Ground scene={scene} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-start justify-start p-2 sm:p-3">
        <span className="text-[10px] sm:text-xs italic text-white drop-shadow" style={{ fontFamily: 'Georgia, serif' }}>Greetings from</span>
        <span className="font-display text-2xl sm:text-4xl leading-none text-[#ffd166]" style={{ WebkitTextStroke: '1px #7a1f1f', textShadow: '2px 2px 0 #7a1f1f' }}>{name}</span>
        {sub && <span className="mt-1 rounded bg-black/40 px-1.5 text-[10px] text-stone-100">{sub}</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Who came along                                                    */
/* ---------------------------------------------------------------- */

function Who({ s, label, people, note }: { s: GameState; label: string; people: Character[]; note?: string }) {
  if (!people.length) return null;
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{label}{note ? <span className="normal-case tracking-normal text-amber-300"> · {note}</span> : null}</div>
      <div className="mt-0.5 flex flex-wrap gap-1.5">
        {people.map((c) => <span key={c.id} className="flex items-center gap-1 text-xs text-stone-200"><Face s={s} c={c} size={24} /><CharLink s={s} id={c.id} /></span>)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* The screen                                                        */
/* ---------------------------------------------------------------- */

function DayCard({ s, t, i, update }: { s: GameState; t: Trip; i: number; update: (f: (s: GameState) => GameState, what?: string) => void }) {
  const [adding, setAdding] = useState(false);
  const d = destOf(t);
  const head = d.activities.find((a) => a.id === t.days[i]);
  const plan = (t.vac?.plan[i] ?? []) as VacKind[];
  const done = i < t.done;
  const used = vacHours(t, i);
  const results = (t.vac?.done ?? []).filter((x) => x.day === i);
  const opts = adding && !done ? vacOptions(s, t, i) : [];
  return (
    <li className={`rounded border px-2 py-2 ${done ? 'border-noir-700 bg-noir-900/40' : 'border-gold-700/40 bg-noir-800/60'}`} data-testid="vacation-day">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gold-300">Day {i + 1}</span>
        <span className="text-[11px] text-stone-500">{formatDate(dayDate(t.arriveDay + i))}</span>
        <span className="text-sm text-stone-200">{head?.name ?? '—'}</span>
        <span className="ml-auto text-[11px] text-stone-400 tabular-nums" title={`${HEADLINE_HOURS}h for the day's headline; ${VAC_DAY_HOURS} waking hours`}>{used}/{VAC_DAY_HOURS}h</span>
      </div>
      <div className="mt-1 h-1 rounded bg-noir-700 overflow-hidden"><div className="h-full bg-gold-500/70" style={{ width: `${Math.min(100, (used / VAC_DAY_HOURS) * 100)}%` }} /></div>
      {plan.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {plan.map((id) => (
            <li key={id} className="flex items-center gap-2 text-xs text-stone-300" data-testid="vacation-planned">
              <span>{VAC[id]?.name}</span>
              <span className="text-stone-500">{VAC[id]?.hours}h</span>
              {!done && <button type="button" className="ml-auto text-[11px] text-stone-500 hover:text-red-300" onClick={() => update((x) => unplanVac(x, t.id, i, id))} aria-label={`Take ${VAC[id]?.name} off the plan`}>remove ✕</button>}
            </li>
          ))}
        </ul>
      )}
      {results.length > 0 && <ul className="mt-1 space-y-0.5">{results.map((r, k) => <li key={k} className={`text-[11px] ${r.tone === 'bad' ? 'text-red-300' : r.tone === 'neutral' ? 'text-stone-400' : 'text-emerald-300'}`}>{r.text}</li>)}</ul>}
      {!done && (
        <button type="button" className="mt-1.5 text-[11px] underline text-gold-300" onClick={() => setAdding(!adding)} data-testid="vacation-add">{adding ? 'close' : '+ something to do'}</button>
      )}
      {opts.length > 0 && (
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2" data-testid="vacation-options">
          {opts.map((o) => (
            <button key={o.id} type="button" disabled={!!o.block} data-testid={`vac-${o.id}`} title={o.block ?? o.text}
              onClick={() => update((x) => planVac(x, t.id, i, o.id))}
              className="rounded border border-gold-700/50 bg-noir-900 px-2 py-1.5 text-left text-[11px] text-stone-300 hover:border-gold-400 disabled:border-noir-700 disabled:opacity-50">
              <span className="flex flex-wrap items-baseline gap-x-1.5"><b className="text-gold-200">{o.name}</b><span className="text-stone-500">{o.hours}h · {o.cost ? fmt$(o.cost) : 'free'}</span></span>
              {o.where && <span className="block text-stone-400 italic">{o.where}</span>}
              <span className="block text-[10px] text-stone-500">{o.block ?? o.effects.join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * The boss on vacation: a postcard of the place, who came along, each day
 * of the stay with the itinerary's headline and what else he does (hours,
 * cost, what it does to whom), what happened, and back home who is running
 * things while he is gone.
 */
export function VacationScreen({ s, update, onClose }: { s: GameState; update: (f: (s: GameState) => GameState, what?: string) => void; onClose: () => void }) {
  const t = bossVacation(s);
  if (!t) {
    return (
      <Modal onClose={onClose}>
        <div className="p-4 text-sm text-stone-300" data-testid="vacation-screen">No vacation booked. <button className="underline text-gold-300" onClick={onClose}>Close</button></div>
      </Modal>
    );
  }
  const d = destOf(t);
  const p = vacParty(s, t);
  const pos = travellers(s).find((x) => x.trip.id === t.id);
  const o = resolveTransport(t.mode, t.tier, d, t.transport);
  const k = actingBoss(s);
  const acting = s.travel?.acting;
  const month = dayDate(t.arriveDay).m;
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5 space-y-4" data-testid="vacation-screen">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{PHASE[pos?.phase ?? 'booked']} · {monthName(month)} · {TIER_INFO[t.tier].name}</div>
          <button className="text-xs text-stone-500 hover:text-gold-300" onClick={onClose}>Close ✕</button>
        </div>
        <Postcard scene={sceneOf(d)} name={d.name} sub={`${d.hotels[t.tier === 'modest' ? 0 : t.tier === 'first' ? 1 : 2]} · home ${formatDate(dayDate(t.homeDay))}`} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
          <ModeIcon mode={t.mode} className="text-gold-300" /> {o.name} <span className="text-stone-500">({o.carrier})</span>
        </div>
        {(pos?.phase === 'there' || pos?.phase === 'out') && <div data-testid="vacation-come-home"><ActionCard s={s} action={{ kind: 'travel', op: { type: 'recall', tripId: t.id } }} /></div>}

        <section className="grid gap-3 sm:grid-cols-2 rounded border border-noir-700 p-3" data-testid="vacation-party">
          <Who s={s} label="The boss" people={[s.characters[t.leaderId]].filter((c): c is Character => !!c)} />
          <Who s={s} label="His wife" people={p.wife ? [p.wife] : []} />
          <Who s={s} label="The kids" people={p.kids} />
          <Who s={s} label="Family" people={p.family} />
          <Who s={s} label={p.wife ? 'The other woman' : 'Along instead'} people={p.goomar ? [p.goomar] : []} note={p.goomar && p.wife ? 'the wife is on this trip too' : p.goomar ? 'the wife thinks it\'s business' : undefined} />
          <Who s={s} label="The crew" people={p.crew} />
          <Who s={s} label="Guests" people={p.others} />
          {!p.wife && !p.kids.length && !p.goomar && !p.crew.length && !p.others.length && <div className="text-xs text-stone-500">He went alone.</div>}
        </section>

        <section>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-1">Day by day</div>
          <p className="text-[11px] text-stone-500 mb-1.5">Each day has {VAC_DAY_HOURS} waking hours; the itinerary takes {HEADLINE_HOURS}. Plan the rest — it happens when the week turns.</p>
          <ol className="space-y-1.5">
            {t.days.map((_, i) => <DayCard key={i} s={s} t={t} i={i} update={update} />)}
          </ol>
        </section>

        <section className="rounded border border-amber-800/50 bg-amber-500/5 p-3 text-xs text-amber-200 space-y-1" data-testid="vacation-home">
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400/80">Back home</div>
          {k ? <div><CharLink s={s} id={k.id} /> runs things while {s.characters[t.leaderId]?.firstName} is away{acting ? ` (${acting.weeks} wk)` : ''}. The capos get ideas; orders go through the chain.</div> : <div>Nobody to run things: Wildwood waits.</div>}
          {acting?.deeds.slice(-3).map((x, i) => <div key={i} className="text-stone-300">· {x}</div>)}
        </section>

        {t.journal.length > 0 && (
          <details className="text-[11px] text-stone-400">
            <summary className="cursor-pointer text-stone-500">The trip journal ({t.journal.length})</summary>
            <ul className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
              {t.journal.map((j, i) => <li key={i} className={j.tone === 'good' ? 'text-emerald-300' : j.tone === 'bad' ? 'text-red-300' : ''}>{formatDate(dayDate(j.day))} · {j.text}</li>)}
            </ul>
          </details>
        )}
        <div className="text-[11px] text-stone-500">With him: {partyNames(s, t)}</div>
      </div>
    </Modal>
  );
}

function partyNames(s: GameState, t: Trip): string {
  const names = t.party.map((id) => s.characters[id]).filter(Boolean).map((c) => displayName(c));
  return names.length ? names.join(', ') : 'nobody';
}

/** "On vacation in Miami Beach" — a pill on the map dock while the boss's vacation is booked or under way. */
export function VacationPill({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const t = bossVacation(s);
  if (!t) return null;
  const pos = travellers(s).find((x) => x.trip.id === t.id);
  return (
    <button type="button" onClick={onOpen} data-testid="vacation-pill"
      className="pointer-events-auto max-w-full truncate rounded-full border border-sky-500/70 bg-noir-900/95 px-3 py-1.5 text-left text-[11px] text-sky-200 shadow-lg shadow-black/70">
      ☀ {PHASE[pos?.phase ?? 'booked']}: {destOf(t).name}
    </button>
  );
}
