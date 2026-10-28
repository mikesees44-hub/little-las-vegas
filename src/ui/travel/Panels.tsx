import { useState } from 'react';
import { displayName } from '../../engine/characters';
import { captureChance, EXILE_WEEKS, sightingChance, wantedFor, wantedPeople } from '../../engine/fugitive';
import { actingBoss, dayDate, travellers } from '../../engine/travel';
import { FLEE_DESTS, MODES } from '../../engine/travelDests';
import { destOf, partyOf } from '../../engine/trips';
import { bossAway, currentVisit, type Fugitive } from '../../engine/travelState';
import { absLabel } from '../../engine/visit';
import { whereAway } from '../../engine/visitAway';
import { formatDate } from '../../engine/calendar';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { useTravel } from './context';
import { ModeIcon } from './icons';

const PHASE: Record<string, string> = { booked: 'Booked', out: 'On the way', there: 'There', back: 'Coming home' };

/** Who is away, where, and what happened (the trip journals). */
export function TravellersPanel({ s }: { s: GameState }) {
  const list = travellers(s).filter((x) => x.trip.purpose !== 'lam');
  const [open, setOpen] = useState<string | undefined>();
  const { plan, go, city, vacation } = useTravel();
  const visit = currentVisit(s);
  const acting = s.travel?.acting ? s.characters[s.travel.acting.id] : undefined;
  const hist = s.travel?.history.slice(-3).reverse() ?? [];
  return (
    <section className="panel p-3" data-testid="travellers">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Travellers</div>
        <div className="flex gap-1">
          {!s.gameOver && !visit && go && <button className="btn-ghost text-xs py-0.5" data-testid="go-somewhere" onClick={() => go()}>Go somewhere yourself…</button>}
          {!s.gameOver && <button className="btn-ghost text-xs py-0.5" onClick={() => plan(s.playerId)}>Plan a trip…</button>}
        </div>
      </div>
      {visit && (
        <button type="button" onClick={() => city?.()} className="mt-1 w-full rounded border border-amber-700/70 bg-amber-500/5 px-2 py-1.5 text-left text-xs text-amber-200" data-testid="visit-row">
          {whereAway(s, visit)} · {visit.agenda.filter((i) => !i.done).length} on the agenda{visit.homeDay !== undefined ? ` · home ${absLabel(s, visit.homeDay)}` : ''} — open the city
        </button>
      )}
      {bossAway(s) && acting && <div className="mt-1 text-xs text-amber-300">The boss is away. <CharLink s={s} id={acting.id} /> is running things{s.travel?.acting ? ` (${s.travel.acting.weeks} wk)` : ''}.</div>}
      {list.length === 0 && !visit && <p className="text-sm text-stone-400 mt-1">Everybody is home. The Catskills in July, Miami in February, the old country in the spring — pick a destination on the map or plan a trip.</p>}
      <ul className="mt-1 space-y-1.5">
        {list.map(({ trip: t, phase }) => {
          const L = s.characters[t.leaderId];
          const d = destOf(t);
          return (
            <li key={t.id} className="rounded border border-noir-700 bg-noir-800/60 px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ModeIcon mode={t.mode} className="text-gold-300" />
                <span className="text-stone-200">{L ? displayName(L) : '?'}</span>
                <span className="text-stone-500">→ {d.name}</span>
                <span className="text-[11px] rounded bg-noir-700 px-1.5 text-stone-300">{PHASE[phase]}</span>
                <span className="text-[11px] text-stone-500">home {formatDate(dayDate(t.homeDay))}</span>
                <span className="text-[11px] text-stone-500">{partyOf(s, t).length - 1} with him</span>
                {vacation && t.purpose === 'vacation' && t.leaderId === s.playerId && <button className="ml-auto text-[11px] underline text-sky-300" data-testid="open-vacation" onClick={() => vacation()}>the vacation</button>}
                <button className={`${vacation && t.purpose === 'vacation' && t.leaderId === s.playerId ? '' : 'ml-auto '}text-[11px] underline text-gold-300`} onClick={() => setOpen(open === t.id ? undefined : t.id)}>{open === t.id ? 'hide' : 'journal'}</button>
              </div>
              {open === t.id && (
                <div className="mt-1 space-y-1">
                  <ul className="text-[11px] space-y-0.5 max-h-48 overflow-y-auto">
                    {t.journal.map((j, i) => <li key={i} className={j.tone === 'good' ? 'text-emerald-300' : j.tone === 'bad' ? 'text-red-300' : 'text-stone-400'}>{formatDate(dayDate(Math.min(j.day, s.week * 7 + 6)))} · {j.text}</li>)}
                  </ul>
                  {phase === 'booked' && <ActionCard s={s} action={{ kind: 'travel', op: { type: 'cancel', tripId: t.id } }} compact />}
                  {(phase === 'out' || phase === 'there') && <ActionCard s={s} action={{ kind: 'travel', op: { type: 'recall', tripId: t.id } }} compact />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hist.length > 0 && (
        <div className="mt-2 text-[11px] text-stone-500">
          Lately: {hist.map((h, i) => <span key={i}>{i > 0 && ' · '}{s.characters[h.leaderId]?.firstName ?? '?'} to {destOf({ destId: h.destId }).name} ({MODES[h.mode].name.toLowerCase()}, {fmt$(h.cost)})</span>)}
        </div>
      )}
    </section>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-800/70 p-2">
      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{label}</div>
      <div className="text-xl font-semibold text-stone-100 tabular-nums">{Math.round(value)}</div>
      <div className="h-1.5 rounded bg-noir-700 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} /></div>
    </div>
  );
}

function FugitiveCard({ s, f }: { s: GameState; f: Fugitive }) {
  const c = s.characters[f.personId];
  const d = FLEE_DESTS[f.dest];
  if (!c) return null;
  const weeks = s.week - f.since;
  const acting = f.personId === s.playerId ? actingBoss(s) : undefined;
  return (
    <div className="rounded-lg border border-red-900/70 bg-blood-500/5 p-3 space-y-2" data-testid="fugitive-panel">
      <div className="flex items-start gap-3">
        <div className="relative">
          <Face s={s} c={c} size={72} />
          <span className="absolute -bottom-1 left-0 right-0 text-center text-[9px] font-bold tracking-widest bg-red-800 text-white rounded">WANTED</span>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.3em] text-red-400">On the lam · {weeks} week{weeks === 1 ? '' : 's'}</div>
          <div className="font-display text-xl text-gold-300">{displayName(c)}</div>
          <div className="text-xs text-stone-400">{d.name} — {d.blurb}</div>
          <div className="text-xs text-stone-400 mt-0.5 flex items-center gap-1"><ModeIcon mode={f.mode} size={12} /> {MODES[f.mode].name} · {d.extradition >= 1 ? 'home soil: a capture means jail' : `extradition ${Math.round(d.extradition * 100)}%`} · {fmt$(d.drain)}/wk · {f.sightings} sighting{f.sightings === 1 ? '' : 's'}{f.bailForfeited ? ` · bail forfeited (${fmt$(f.bailForfeited)})` : ''}</div>
          {acting && <div className="text-xs text-amber-300 mt-0.5">Orders go by messenger (late, garbled). <CharLink s={s} id={acting.id} /> is running things.</div>}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Meter label="Manhunt" value={f.manhunt} tone="bg-blood-400" />
        <Meter label="Cover" value={f.cover * 100} tone="bg-emerald-500" />
        <Meter label="Case evidence" value={c.evidence ?? 0} tone="bg-amber-500" />
      </div>
      <div className="text-[11px] text-stone-400">This week: {Math.round(sightingChance(f) * 100)}% he is seen; if seen, {Math.round(captureChance(f) * 100)}% he is taken. {f.collapsed ? <span className="text-emerald-300">The case has collapsed: he can come home.</span> : `The case falls apart below 20 evidence.`}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ActionCard s={s} action={{ kind: 'travel', op: { type: 'hide', personId: c.id } }} />
        {f.collapsed ? <ActionCard s={s} action={{ kind: 'travel', op: { type: 'comeHome', personId: c.id } }} /> : <ActionCard s={s} action={{ kind: 'travel', op: { type: 'surrender', personId: c.id } }} />}
        {d.abroad && <ActionCard s={s} action={{ kind: 'travel', op: { type: 'exile', personId: c.id } }} label={weeks < EXILE_WEEKS ? `Live out his days in ${d.name} (after ${EXILE_WEEKS} weeks)` : undefined} />}
      </div>
    </div>
  );
}

/** The Law tab: anyone on the lam, and anyone who could run. */
export function FugitivePanel({ s }: { s: GameState }) {
  const { flee } = useTravel();
  const fugs = s.travel?.fugitives.filter((f) => !f.end) ?? [];
  const wanted = wantedPeople(s).filter((c) => c.id === s.playerId || c.faction === 'player' || c.dynasty);
  if (!fugs.length && !wanted.length) return null;
  return (
    <div className="space-y-3">
      {fugs.map((f) => <FugitiveCard key={f.personId} s={s} f={f} />)}
      {wanted.length > 0 && !s.gameOver && (
        <div className="rounded border border-noir-700 p-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Go on the lam</div>
          <p className="text-xs text-stone-400">Run before they come: a hideout, a way out, someone to help. The case waits while he is gone — and may fall apart.</p>
          <ul className="mt-1 space-y-1">
            {wanted.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                <CharLink s={s} id={c.id} />
                <span className="text-[11px] text-stone-500">{wantedFor(s, c.id)}</span>
                <button className="ml-auto btn-ghost text-xs py-0.5" data-testid="flee-button" onClick={() => flee(c.id)}>Plan the escape…</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A thin red band across the top while the boss is a fugitive. */
export function FugitiveBanner({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const f = s.travel?.fugitives.find((x) => !x.end && x.personId === s.playerId);
  if (!f) return null;
  const d = FLEE_DESTS[f.dest];
  return (
    <button type="button" onClick={onOpen} className="w-full rounded border border-red-800 bg-blood-500/20 px-3 py-1.5 text-left text-xs text-red-200" data-testid="fugitive-banner">
      <b className="tracking-widest">ON THE LAM</b> · {s.characters[f.personId]?.firstName} is hiding: {d.name} · manhunt {Math.round(f.manhunt)} · cover {Math.round(f.cover * 100)}% — the Law tab
    </button>
  );
}
