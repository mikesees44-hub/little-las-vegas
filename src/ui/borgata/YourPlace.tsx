import { displayName } from '../../engine/characters';
import { aStation, CAP_INFO, STATION_CAPS, stationOf, unlocksBetween } from '../../engine/rankView';
import { above, aboveChart, CALLIN_STANDING, callInOdds, MADE_STANDING, placeSummary, quotaNow, standingWord, vouchCandidates, type ChartNode } from '../../engine/valente';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { ActionRow } from '../components/ActionRow';
import { useSheet } from '../components/People';
import { fmt$ } from '../format';

/**
 * YOUR PLACE (LOW START DESIGN): where a low-start player stands in the
 * family above him. His rung and the man he answers to, his standing, the
 * Monday quota, who vouches for him, the books, the next rung and what it
 * opens, the way up (with the odds), and the Valente family's chart with
 * YOU marked where you stand.
 */

function Bar({ v, mark }: { v: number; mark?: number }) {
  return (
    <span className="relative inline-block h-2 w-40 overflow-hidden rounded bg-noir-700 align-middle" aria-hidden>
      <span className="block h-full bg-gold-500" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      {mark !== undefined && <span className="absolute top-0 h-full w-0.5 bg-stone-200" style={{ left: `${mark}%` }} />}
    </span>
  );
}

function Node({ s, n, depth = 0 }: { s: GameState; n: ChartNode; depth?: number }) {
  const { open } = useSheet();
  const c = s.characters[n.id];
  if (!c) return null;
  return (
    <li className={depth ? 'ml-4 border-l border-noir-700 pl-2' : ''}>
      <div className={`my-0.5 flex items-center gap-1.5 rounded px-1.5 py-0.5 ${n.you ? 'border border-gold-500 bg-gold-500/15' : ''}`} data-testid={n.you ? 'place-you' : 'place-node'}>
        <button type="button" onClick={() => open(c.id)} className="text-left text-[12px] font-semibold text-stone-100 hover:text-gold-300">{n.you ? `YOU · ${displayName(c)}` : displayName(c)}</button>
        <span className="rounded border border-noir-600 px-1 text-[9px] uppercase tracking-wider text-stone-400">{n.role}</span>
        {!c.alive && <span className="text-[10px] text-red-300">dead</span>}
      </div>
      {!!n.kids?.length && <ul>{n.kids.map((k) => <Node key={k.id} s={s} n={k} depth={depth + 1} />)}</ul>}
    </li>
  );
}

export function YourPlace({ s }: { s: GameState }) {
  const p = placeSummary(s);
  const a = above(s);
  const { open } = useSheet();
  if (!p || !a) return <p className="text-sm text-stone-400">You are the boss. Nobody above you in Wildwood; Philadelphia's Table is where you answer.</p>;
  const st = stationOf(s);
  const chart = aboveChart(s);
  const odds = callInOdds(s);
  const can = p.next ? unlocksBetween(st, p.next) : [];
  const need = st === 'associate' ? MADE_STANDING : CALLIN_STANDING;
  const want = quotaNow(s);
  const closed = (Object.keys(CAP_INFO) as (keyof typeof CAP_INFO)[]).filter((k) => !STATION_CAPS[st].includes(k));
  return (
    <div className="grid gap-3" data-testid="your-place">
      <section className="rounded border border-gold-600/50 bg-noir-800/60 p-3">
        <div className="text-[11px] text-stone-400">Your place in the {a.name} family</div>
        <div className="font-display text-xl text-gold-300" data-testid="place-line">{p.line}</div>
        <p className="mt-1 text-xs text-stone-400">
          You answer to {p.chief ? <button type="button" className="text-gold-300 hover:underline" onClick={() => open(p.chief!.id)}>{displayName(p.chief)}</button> : 'nobody'}
          {p.don && p.chief?.id !== p.don.id ? <> · the Don is <button type="button" className="text-gold-300 hover:underline" onClick={() => open(p.don!.id)}>{displayName(p.don)}</button></> : null}.
          {' '}You head your own house; in the family you are {aStation(st)}.
        </p>
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-noir-700 bg-noir-800/40 p-3">
          <div className="llv-section-title mb-1">Standing</div>
          <div className="flex items-center gap-2"><Bar v={p.standing} mark={need} /><span className="tabular-nums text-stone-200">{p.standing}</span><span className="text-xs text-stone-400">{p.word}</span></div>
          <p className="mt-1 text-[11px] text-stone-500">{st === 'associate' ? `They put a name up at ${MADE_STANDING}.` : st === 'underboss' ? 'The chair opens when the Don goes.' : `The boss hears a man ask at ${CALLIN_STANDING}.`} Met quotas, orders done well and a closed mouth raise it; short Mondays and excuses lower it.</p>
          {!!a.log.length && <ul className="mt-1 text-[11px] text-stone-400">{a.log.slice(-4).reverse().map((l, i) => <li key={i}><span className={l.d > 0 ? 'text-emerald-300' : 'text-red-300'}>{l.d > 0 ? '+' : ''}{l.d}</span> {l.t}</li>)}</ul>}
        </div>
        <div className="rounded-lg border border-noir-700 bg-noir-800/40 p-3" data-testid="place-quota">
          <div className="llv-section-title mb-1">Monday's envelope</div>
          {a.quota > 0 ? (
            <>
              <div className="text-stone-200">{p.chief?.firstName ?? 'Your chief'} expects <b className="text-gold-300">{fmt$(want)}</b>{want !== a.quota ? ` (the winter number; ${fmt$(a.quota)} in season)` : ''}.</div>
              <div className="text-xs text-stone-400">Last Monday: {p.lastKick !== undefined ? fmt$(p.lastKick) : 'not yet'} · {a.streak} week{a.streak === 1 ? '' : 's'} in a row on the number{a.missed ? ` · short ${a.missed} time${a.missed === 1 ? '' : 's'}` : ''}</div>
              {a.owed > 0 && <div className="mt-1 text-xs text-red-300">You owe him {fmt$(a.owed)} from short weeks.</div>}
            </>
          ) : <div className="text-stone-300">No number: you sit next to the Don.</div>}
        </div>
      </section>

      {st === 'associate' && (
        <section className="rounded-lg border border-noir-700 bg-noir-800/40 p-3" data-testid="place-books">
          <div className="llv-section-title mb-1">Getting made</div>
          <p className="text-xs text-stone-400">An associate needs a made man to vouch for him; his name goes up when the books open; then the ceremony. If he goes bad, it is on the man who vouched.</p>
          <div className="mt-1 text-sm text-stone-200">The books are <b className={p.booksOpen ? 'text-emerald-300' : 'text-stone-400'}>{p.booksOpen ? 'OPEN' : 'closed'}</b>. Vouching for you: {p.sponsors.length ? p.sponsors.map((c) => c.firstName).join(', ') : <span className="text-amber-200">nobody yet</span>}.</div>
          {/* One line per man (who, the odds, one button); tap a line for the whole card. */}
          <div className="mt-2 grid gap-1.5" data-testid="place-vouchers">
            {vouchCandidates(s).slice(0, 4).map((c) => (
              <ActionRow key={c.id} s={s} label={`Ask ${displayName(c)} to vouch for you`} action={{ kind: 'power', op: { op: 'low', a: { op: 'askVouch', id: c.id } } }} />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-stone-500">Each line shows his odds of saying yes; tap it for every reason.</p>
        </section>
      )}

      <section className="rounded-lg border border-noir-700 bg-noir-800/40 p-3" data-testid="place-climb">
        <div className="llv-section-title mb-1">The way up</div>
        {p.next ? (
          <>
            <div className="text-sm text-stone-200">Next rung: <b className="text-gold-300">{p.next}</b>. {p.callIn ? <span className="text-amber-200">{p.callIn}.</span> : <span className="text-emerald-300">You can ask now: {Math.round(odds.chance * 100)}%.</span>}</div>
            {!!can.length && <div className="mt-1 text-xs text-stone-300" data-testid="place-unlocks">When you get there you can: {can.join('; ')}.</div>}
            <ul className="mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-stone-400">{odds.reasons.map((r) => <li key={r.label} className="flex justify-between"><span>{r.label}</span><span className={r.value >= 0 ? 'text-emerald-300' : 'text-red-300'}>{r.value > 0 ? '+' : ''}{r.value}</span></li>)}</ul>
            <div className="mt-2"><ActionCard s={s} action={{ kind: 'power', op: { op: 'low', a: { op: 'callIn' } } }} /></div>
          </>
        ) : <div className="text-sm text-stone-300">The chair. It opens when the Don goes.</div>}
        <div className="mt-2 grid gap-1.5">
          {[p.chief, p.don].filter((c, i, xs): c is NonNullable<typeof c> => !!c?.alive && xs.findIndex((x) => x?.id === c.id) === i).map((c) => <ActionRow key={c.id} s={s} action={{ kind: 'power', op: { op: 'low', a: { op: 'coffee', id: c.id } } }} />)}
        </div>
      </section>

      {chart && (
        <section className="rounded-lg border border-noir-700 bg-noir-800/40 p-3" data-testid="place-chart">
          <div className="llv-section-title mb-1">The {a.name} family</div>
          <ul><Node s={s} n={chart} /></ul>
        </section>
      )}

      {!!closed.length && (
        <section className="rounded-lg border border-noir-700 bg-noir-800/40 p-3 text-[11px] text-stone-500" data-testid="place-closed">
          <div className="llv-section-title mb-1">Above your rank (for now)</div>
          {closed.map((k) => CAP_INFO[k].name).join(' · ')}
        </section>
      )}
    </div>
  );
}

/** The family above, as a chart with YOU marked (for the org chart and the Rivals board). */
export function AboveChart({ s, title }: { s: GameState; title?: string }) {
  const chart = aboveChart(s);
  const a = above(s);
  if (!chart || !a) return null;
  return (
    <section className="rounded border border-gold-600/40 bg-noir-800/50 p-2.5" data-testid="above-chart">
      <div className="llv-section-title mb-1">{title ?? `The ${a.name} family, and where you stand in it`}</div>
      <ul><Node s={s} n={chart} /></ul>
    </section>
  );
}

/** One line for the Desk: where you stand, the number, the books. */
export function PlaceStrip({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const p = placeSummary(s);
  if (!p) return null;
  return (
    <button type="button" onClick={onOpen} data-testid="place-strip" className="mb-3 flex w-full items-center gap-2 rounded border border-gold-600/50 bg-noir-800/70 px-2.5 py-1.5 text-left hover:border-gold-500">
      <span className="text-[11px] font-semibold text-gold-400">Your place</span>
      <span className="min-w-0 flex-1 truncate text-xs text-stone-200">{p.line}</span>
      <span className="shrink-0 text-[11px] text-stone-400">standing {p.standing} · {standingWord(p.standing).toLowerCase()}</span>
      <span className="shrink-0 text-gold-300">▸</span>
    </button>
  );
}
