import { useState } from 'react';
import { displayName } from '../../engine/characters';
import { MISSION_DEFS, type MissionRun } from '../../engine/missions';
import { rivalRelation, TALKS } from '../../engine/talks';
import type { GameState, RivalId } from '../../engine/types';
import { FACTION_NAMES } from '../../engine/world';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';
import { fmt$ } from '../format';

const FACT_BADGE: Record<string, string> = { unknown: 'border-stone-600 text-stone-400', true: 'border-emerald-500 text-emerald-300', false: 'border-blood-500 text-red-300' };

function Mission({ s, m }: { s: GameState; m: MissionRun }) {
  const def = MISSION_DEFS[m.def];
  const st = m.ended ? undefined : def.stages[m.stage];
  const crew = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.rank !== 'civilian' && c.id !== s.playerId);
  const [agents, setAgents] = useState<Record<string, string>>({});
  return (
    <article className="rounded-lg border border-gold-600/40 bg-noir-800/60 p-3 space-y-2.5" data-testid={`mission-${m.def}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{def.kind}</div>
          <div className="font-display text-xl text-gold-400">{def.title}</div>
        </div>
        <div className={`text-[11px] rounded px-1.5 py-0.5 border ${m.ended ? 'border-stone-600 text-stone-400' : m.waiting ? 'border-amber-500 text-amber-300' : 'border-emerald-600 text-emerald-300'}`}>
          {m.ended ? 'Closed' : m.waiting ? 'Waiting on an answer' : `Stage: ${st?.title}`}
        </div>
      </div>
      <p className="text-sm text-stone-300 italic">{m.ended ? m.log[m.log.length - 1]?.text : st?.text(s, m)}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Participants</div>
          <ul className="text-xs space-y-0.5">{def.participants(s, m).map((p, i) => <li key={i}>{p.id ? <CharLink s={s} id={p.id} /> : <span className="text-stone-200">{p.name}</span>} <span className="text-stone-500">— {p.role}</span></li>)}</ul>
        </div>
        {st && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-stone-500">Objectives</div>
            <ul className="text-xs text-stone-300 list-disc pl-4">{st.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
          </div>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">Disputed facts</div>
        <ul className="text-xs space-y-1" data-testid="mission-facts">
          {def.facts.map((f) => (
            <li key={f.id} className="flex items-start gap-2">
              <span className={`shrink-0 rounded border px-1 text-[10px] uppercase ${FACT_BADGE[m.facts[f.id]]}`}>{m.facts[f.id] === 'unknown' ? '?' : m.facts[f.id]}</span>
              <span className="text-stone-200">{f.claim}<span className="text-stone-500"> · {m.facts[f.id] === 'unknown' ? `who knows: ${f.knownBy}` : `told by ${m.source[f.id]}`}</span></span>
            </li>
          ))}
        </ul>
      </div>
      {st && !m.waiting && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Your move</div>
          {st.decisions.map((d) => {
            const pickable = d.delegate ? [...crew].sort((a, b) => b.attributes[d.delegate!] - a.attributes[d.delegate!]).slice(0, 6) : [];
            const agent = d.delegate ? agents[d.id] ?? pickable[0]?.id : undefined;
            return (
              <div key={d.id} className="space-y-1">
                {d.delegate && pickable.length > 0 && (
                  <label className="flex items-center gap-2 text-[11px] text-stone-400">Send
                    <select className="bg-noir-900 border border-noir-600 rounded px-1 py-0.5 text-stone-200" value={agent} onChange={(e) => setAgents({ ...agents, [d.id]: e.target.value })}>
                      {pickable.map((c) => <option key={c.id} value={c.id}>{displayName(c)} ({d.delegate} {c.attributes[d.delegate!]})</option>)}
                    </select>
                  </label>
                )}
                <ActionCard s={s} action={{ kind: 'mission', op: { run: m.id, decision: d.id, agent } }} />
              </div>
            );
          })}
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">What happened</div>
        <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto">{[...m.log].reverse().map((l, i) => <li key={i} className={l.kind === 'npc' ? 'text-amber-200' : l.kind === 'fact' ? 'text-emerald-200' : l.kind === 'end' ? 'text-gold-300' : 'text-stone-300'}><span className="text-stone-500">wk {l.week}</span> {l.kind === 'npc' ? '◆ ' : ''}{l.text}</li>)}</ul>
      </div>
    </article>
  );
}

/** Answers you are waiting on, and counteroffers to take or leave. */
export function TalksPanel({ s }: { s: GameState }) {
  const t = s.talks;
  const pend = t?.pending ?? [];
  return (
    <section className="space-y-2" data-testid="talks-panel">
      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Talks in progress</div>
      {pend.length === 0 && <p className="text-xs text-stone-500">Nobody owes you an answer. Right-click a face and choose Talk.</p>}
      {pend.map((p) => {
        const c = s.characters[p.target];
        return (
          <div key={p.id} className="rounded border border-noir-700 p-2 space-y-1">
            <div className="text-xs text-stone-300"><CharLink s={s} id={p.target} /> · {TALKS[p.talk].label.toLowerCase()} · {p.kind === 'delay' ? `answer due week ${p.due}` : `offer stands until week ${p.due}`}</div>
            {p.kind === 'counter' && c && (
              <>
                <div className="text-xs text-amber-200">{p.counter?.text}</div>
                <div className="grid grid-cols-2 gap-1">
                  <ActionCard s={s} compact action={{ kind: 'talk', op: { t: 'answer', id: p.id, yes: true } }} />
                  <ActionCard s={s} compact action={{ kind: 'talk', op: { t: 'answer', id: p.id, yes: false } }} />
                </div>
              </>
            )}
          </div>
        );
      })}
      {(t?.log.length ?? 0) > 0 && (
        <ul className="text-xs text-stone-400 space-y-0.5">{[...(t?.log ?? [])].filter((l) => l.kind === 'talk').slice(-8).reverse().map((l, i) => <li key={i}><span className="text-stone-500">{l.y}/{String(l.m).padStart(2, '0')}</span> {l.text}</li>)}</ul>
      )}
    </section>
  );
}

/** The Mission Board: the big cases, stage by stage. */
export function MissionBoard({ s }: { s: GameState }) {
  const runs = [...(s.missions?.runs ?? [])].sort((a, b) => (a.ended ? 1 : 0) - (b.ended ? 1 : 0));
  return (
    <div className="space-y-4" data-testid="mission-board">
      {runs.length === 0 && <p className="text-sm text-stone-400">No big cases open. They come to you: a building changing hands, a crisis at City Hall, a family secret. Keep an ear on the Boardwalk.</p>}
      {runs.map((m) => <Mission key={m.id} s={s} m={m} />)}
      <TalksPanel s={s} />
    </div>
  );
}

/** Pacts with the families, and the families' own dealings. */
export function PactsPanel({ s }: { s: GameState }) {
  const t = s.talks;
  const pacts = (t?.pacts ?? []).filter((p) => p.until > s.week);
  const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  const name = (f: string) => (f === 'player' ? 'Your house' : FACTION_NAMES[f as RivalId] ?? f);
  return (
    <div className="space-y-4" data-testid="pacts-panel">
      <section>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Pacts</div>
        {pacts.length === 0 && <p className="text-xs text-stone-500">No pacts. Sit down with a family (Rivals ▸ The Board, or a boss's Talk & Favors) and shake on a truce, an alliance, a partnership, tribute or a hands-off term.</p>}
        <ul className="text-sm space-y-1">{pacts.map((p) => <li key={p.id}><span className="text-gold-300 capitalize">{p.kind}</span> · {name(p.a)} & {name(p.b)} <span className="text-stone-500 text-xs">— {p.terms}{p.weekly ? ` (${fmt$(p.weekly)}/wk)` : ''} · until week {p.until}</span></li>)}</ul>
      </section>
      {mobs.length > 1 && (
        <section>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-1">How the families get along</div>
          <table className="text-xs text-stone-300"><tbody>
            {mobs.map((a, i) => mobs.slice(i + 1).map((b) => {
              const v = rivalRelation(s, a.id, b.id);
              return <tr key={`${a.id}${b.id}`}><td className="pr-3">{FACTION_NAMES[a.id]} — {FACTION_NAMES[b.id]}</td><td className={`tabular-nums ${v > 20 ? 'text-emerald-300' : v < -20 ? 'text-red-300' : 'text-stone-400'}`}>{v > 0 ? '+' : ''}{v}</td><td className="pl-2 text-stone-500">{v > 35 ? 'friends' : v > 10 ? 'cordial' : v < -35 ? 'at each other\'s throats' : v < -10 ? 'tense' : 'wary'}</td></tr>;
            }))}
          </tbody></table>
        </section>
      )}
      <section>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">The families, on their own</div>
        <ul className="text-xs text-stone-300 space-y-0.5">{[...(t?.log ?? [])].filter((l) => l.kind !== 'talk').slice(-14).reverse().map((l, i) => <li key={i}><span className="text-stone-500">{l.y}/{String(l.m).padStart(2, '0')}</span> {l.text}</li>)}</ul>
        {!(t?.log ?? []).some((l) => l.kind !== 'talk') && <p className="text-xs text-stone-500">Quiet, for now.</p>}
      </section>
    </div>
  );
}
