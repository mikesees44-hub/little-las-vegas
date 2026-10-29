import { claimRows, honeyLog, mistressRows, scornRows, watchRows } from '../../engine/honey';
import { adultOn } from '../../engine/datingState';
import type { GameState } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { CharLink } from '../components/People';

/**
 * SECRETS AND LIABILITIES (engine/honey.ts): women you have reason to wonder
 * about (only what you have seen: the signs, your suspicion, what you found
 * out), mistresses and what they want, married women who are "yours" in the
 * island's eyes, and the people who hold it against you. Hidden with mature
 * content Off; adults only.
 */
export function HoneySection({ s }: { s: GameState }) {
  if (!adultOn(s)) return null;
  const watch = watchRows(s);
  const mistresses = mistressRows(s);
  const claims = claimRows(s);
  const scorn = scornRows(s);
  const log = honeyLog(s, 8);
  if (!watch.length && !mistresses.length && !claims.length && !scorn.length && !log.length) return null;
  const H = ({ children }: { children: string }) => <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{children}</div>;
  return (
    <section className="space-y-3" data-testid="honey-section">
      {watch.length > 0 && (
        <div>
          <H>Women you wonder about</H>
          <ul className="mt-1 space-y-1.5">{watch.map((w) => (
            <li key={w.id} className="rounded-md border border-noir-700 bg-noir-800/50 p-2 text-[12px]" data-testid="honey-watch">
              <div className="flex flex-wrap items-center gap-1.5"><CharLink s={s} id={w.id}>{w.name}</CharLink><span className={w.known ? 'text-red-300' : w.cleared ? 'text-emerald-300' : 'text-amber-200'}>{w.known ? `She ${w.known}` : w.cleared ? 'Looked into: nothing found' : `Your suspicion ${w.susp}/100`}</span></div>
              {w.signs.length > 0 && <ul className="mt-0.5 text-[11px] text-stone-400">{w.signs.map(([wk, t], i) => <li key={i}>Week {wk}: {t}</li>)}</ul>}
              {w.actions.length > 0 && <div className="mt-1 space-y-1">{w.actions.map((a, i) => <ActionRow key={i} s={s} action={a} />)}</div>}
            </li>
          ))}</ul>
        </div>
      )}
      {mistresses.length > 0 && (
        <div>
          <H>Mistresses</H>
          <ul className="mt-1 space-y-1.5">{mistresses.map((m) => (
            <li key={m.id} className="rounded-md border border-noir-700 p-2 text-[12px]" data-testid="honey-mistress">
              <div className="flex flex-wrap items-center gap-1.5"><CharLink s={s} id={m.id}>{m.name}</CharLink><span className="text-stone-400">{m.mouth}</span><span className={m.stage === 'Threatening' ? 'text-red-300' : m.stage === 'Demanding' ? 'text-amber-200' : 'text-stone-300'}>{m.settled ? `settled: ${m.settled}` : m.stage}</span></div>
              {(m.want || m.lever) && !m.settled && <div className="text-[11px] text-stone-400">{m.want ? `Wants ${m.want}.` : ''}{m.lever ? ` Says ${m.lever}${m.due !== undefined ? ` by week ${m.due}` : ''}.` : ''}{m.promised !== undefined ? ` You promised: until week ${m.promised}.` : ''}</div>}
              {m.actions.length > 0 && <div className="mt-1 space-y-1">{m.actions.map((a, i) => <ActionRow key={i} s={s} action={a} />)}</div>}
            </li>
          ))}</ul>
        </div>
      )}
      {claims.length > 0 && (
        <div>
          <H>Yours, in the island's eyes</H>
          <ul className="mt-1 space-y-0.5 text-[12px] text-stone-300">{claims.map((c) => <li key={c.id} data-testid="honey-claim"><CharLink s={s} id={c.id}>{c.name}</CharLink>: married to {c.husband}; {c.fallout}.{c.rival ? ` ${c.rival} took it personally.` : ''}</li>)}</ul>
        </div>
      )}
      {scorn.length > 0 && (
        <div>
          <H>Who holds it against you</H>
          <ul className="mt-1 space-y-0.5 text-[12px] text-stone-300">{scorn.map((x) => <li key={x.id} data-testid="honey-scorn"><CharLink s={s} id={x.id}>{x.name}</CharLink> <span className="text-stone-500">({x.kind.toLowerCase()}, {x.heat >= 60 ? 'burning' : x.heat >= 35 ? 'simmering' : 'cooling'})</span>: "{x.why}"</li>)}</ul>
        </div>
      )}
      {log.length > 0 && (
        <div>
          <H>Secrets, lately</H>
          <ul className="mt-1 space-y-0.5 text-[12px] text-stone-300">{log.map((l, i) => <li key={i}><span className="text-stone-500">Week {l.week}:</span> {l.text}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
