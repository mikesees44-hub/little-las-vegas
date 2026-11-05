import { useMemo, useState } from 'react';
import type { DeskItem, DeskUi } from '../../engine/desk';
import type { Rec } from '../../engine/planner/brief';
import type { GameState } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { useSheet } from '../components/People';
import { recPick } from '../plans/GoalMenu';
import { ACTION_ENTRIES } from './actionEntries';
import { entryResult, type FindResult } from './find';
import { actionsFor, peopleFor, recsFor } from './placeFront';
import type { HomeId } from './routes';

/**
 * The bands of a home's front page (STREAMLINE_2 §3.3) that sit around "Needs you here" (Drawer's
 * DoNowStrip, `do-now`) and the places (Records). Each band is empty-safe: with nothing in it, it is
 * one line or nothing at all. Every row goes where the same thing goes elsewhere (Find, the sheet).
 */

const BAND = 'mb-1.5 text-[10px] uppercase tracking-[0.25em] text-stone-500';

/** Band 1: the consigliere's picks for this home (at most three), each with Do it and Why?. */
export function RecBand({ s, home, ui, onPick }: { s: GameState; home: HomeId; ui?: DeskUi; onPick?: (r: FindResult) => void }) {
  const recs = useMemo(() => recsFor(s, home, ui ?? {}), [s, home, ui]);
  const [why, setWhy] = useState<string | undefined>();
  if (!recs.length) return null;
  return (
    <section className="mb-4" data-testid="front-recs" aria-label="Recommended">
      <div className={BAND}>Recommended</div>
      <ul className="grid gap-1">
        {recs.map((r: Rec) => (
          <li key={r.id} className="rounded-md border border-gold-600/40 bg-noir-800/60 px-2 py-1.5" data-testid="front-rec">
            {r.go.order ? <ActionRow s={s} action={r.go.order} label={r.title} /> : (
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-stone-100">{r.title}</span>
                {r.odds !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-gold-300">{Math.round(r.odds * 100)}%</span>}
                <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => onPick?.(recPick(r))} data-testid="front-rec-do">{r.cta} ▸</button>
              </div>
            )}
            <button type="button" className="btn-quiet text-[11px]" aria-expanded={why === r.id} onClick={() => setWhy(why === r.id ? undefined : r.id)} data-testid="front-rec-why">Why?</button>
            {why === r.id && <p className="text-[11px] leading-snug text-stone-400" data-testid="front-rec-reason">{r.why}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Band 2's own rows: the Desk's papers that belong to this home (DoNowStrip renders them above its own items). */
export function NeedRows({ needs, onNeed }: { needs: DeskItem[]; onNeed?: (it: DeskItem) => void }) {
  if (!needs.length) return null;
  return (
    <ul className="mb-1.5 grid gap-1.5" data-testid="front-needs">
      {needs.map((it) => (
        <li key={it.key} className={`flex items-center gap-2 rounded border px-2.5 py-2 ${it.done ? 'border-noir-700 opacity-60' : it.urgent ? 'border-red-400/80 bg-blood-500/15' : 'border-amber-500/70 bg-amber-900/15'}`} data-testid="front-need">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-snug text-stone-100">{it.title}</div>
            <div className="text-[11px] leading-snug text-stone-400 line-clamp-2">{it.done ? 'Answered.' : it.detail}</div>
          </div>
          <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => onNeed?.(it)} data-testid="front-need-open">{it.done ? 'Change' : 'Open'} ▸</button>
        </li>
      ))}
    </ul>
  );
}

/** Band 3: the people this home is about (at most six), each one tap from "Deal with…". */
export function PeopleBand({ s, home, onEveryone }: { s: GameState; home: HomeId; onEveryone?: () => void }) {
  const sheet = useSheet();
  const { shown, total } = useMemo(() => peopleFor(s, home, 6), [s, home]);
  if (!shown.length) return null;
  return (
    <section className="mb-4" data-testid="front-people" aria-label="Your people here">
      <div className={`${BAND} flex items-center`}>Your people here{total > shown.length && onEveryone && <button type="button" className="btn-quiet ml-auto normal-case tracking-normal text-[11px]" onClick={onEveryone} data-testid="front-people-all">Everyone ({total}) ▸</button>}</div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {shown.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded border border-noir-700 bg-noir-800/50 px-2 py-1" data-testid="front-person">
            <button type="button" className="btn-quiet min-w-0 flex-1 text-left no-underline" onClick={() => sheet.open(p.id)}>
              <span className="block truncate text-sm text-stone-100">{p.name}</span>
              <span className="block truncate text-[11px] text-stone-500">{p.role}{p.away ? ` · ${p.away}` : ''}{p.trust !== undefined ? ` · trust ${Math.round(p.trust)}` : ''}{p.beef ? ` · beef ${Math.round(p.beef)}` : ''}</span>
            </button>
            {sheet.menu && <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => sheet.menu!(p.id)} data-testid="front-person-deal">Deal with…</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Band 4: this home's things to do by verb; one line of verbs, a verb opens its rows. */
export function ActionsBand({ s, home, open, onPick }: { s: GameState; home: HomeId; open?: (key: string) => boolean; onPick?: (r: FindResult) => void }) {
  const groups = useMemo(() => actionsFor(home, s), [home, s]);
  const [verb, setVerb] = useState<string | undefined>();
  if (!groups.length) return null;
  const g = groups.find((x) => x.verb === verb);
  return (
    <section className="mb-4" data-testid="front-actions" aria-label="Do something here">
      <div className={BAND}>Do something here</div>
      <div className="flex flex-wrap gap-1" role="tablist">
        {groups.map((x) => (
          <button key={x.verb} type="button" role="tab" aria-selected={verb === x.verb} onClick={() => setVerb(verb === x.verb ? undefined : x.verb)} data-testid={`front-verb-${x.verb}`}
            className={`btn-sm ${verb === x.verb ? 'btn-primary' : 'btn-secondary'}`}>{x.glyph} {x.label} <span className="text-stone-500">{x.entries.length}</span></button>
        ))}
      </div>
      {g && (
        <ul className="mt-1" data-testid={`front-verb-list-${g.verb}`}>
          {g.entries.map((i) => {
            const r = entryResult(i, open);
            return (
              <li key={ACTION_ENTRIES[i].label}>
                <button type="button" className="btn-quiet w-full flex-col items-start px-1 py-0.5 text-left no-underline hover:bg-noir-800" onClick={() => onPick?.(r)} data-testid="front-entry">
                  <span className="block truncate text-sm text-stone-100">{r.title}</span>
                  <span className="block truncate text-[11px] text-stone-500">{r.sub}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const STOP_LABEL: Record<string, string> = { needs: 'Needs you', house: 'Family', org: 'Crew', money: 'Money', law: 'Law', rivals: 'Rivals', town: 'Town' };

/**
 * The Round strip (turn mode, on the map where the clock's Today strip sits): seven stops, each a tap
 * from its front page, ticked as he looks at each part of his life; "4 of 7". Never forced.
 */
export function RoundStrip({ rows, onStop }: { rows: { stop: string; ticked: boolean; open: number; quiet: boolean }[]; onStop: (stop: string) => void }) {
  const done = rows.filter((r) => r.ticked).length;
  return (
    <div className="pointer-events-auto flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-gold-600/50 bg-noir-900/95 px-2 py-1 shadow-lg shadow-black/60" data-testid="round-strip" aria-label="This turn's round">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-stone-500" data-testid="round-count">Round {done} of {rows.length}</span>
      {rows.map((r) => (
        <button key={r.stop} type="button" onClick={() => onStop(r.stop)} data-testid={`round-stop-${r.stop}`} data-ticked={r.ticked ? 'true' : undefined}
          title={r.quiet ? 'Quiet: nothing waits here' : r.open ? `${r.open} waiting on you` : r.ticked ? 'Seen' : 'Not looked at this turn'}
          className={`btn-quiet shrink-0 whitespace-nowrap rounded-full px-1.5 text-[11px] no-underline ${r.ticked ? 'text-stone-500' : 'text-gold-300'}`}>
          {r.ticked ? '✓' : r.open ? <span className="text-red-300">{r.open}</span> : '○'} {STOP_LABEL[r.stop] ?? r.stop}{r.quiet ? <span className="text-stone-600"> · quiet</span> : null}
        </button>
      ))}
    </div>
  );
}
