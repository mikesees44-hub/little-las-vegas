import { useState } from 'react';
import { displayName } from '../../engine/characters';
import { eraHeadline, liesInPlay, moodOf, spyWeb, suspects, toldAndLearned } from '../../engine/intrigue';
import { plantable } from '../../engine/intrigueOps';
import { ERA_LABEL, ERA_RULES, SPY_HOW_LABEL, type Era, type RumorLine, type SpyHow } from '../../engine/intrigueState';
import { FACTION_NAMES } from '../../engine/world';
import type { FactionId, GameState, RivalId } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink, Face } from '../components/People';

/**
 * THE INTRIGUE BOARD: the era with each family and between them, the web of
 * who spies on whom (as far as the boss knows), the men he suspects, the lies
 * and rumors in play, what he was told against what he later learned, and the
 * orders that go with all of it.
 */

export const ERA_TONE: Record<Era, string> = {
  peace: 'text-emerald-300 border-emerald-500/40',
  truce: 'text-sky-300 border-sky-500/40',
  tension: 'text-amber-300 border-amber-500/40',
  cold: 'text-orange-300 border-orange-500/50',
  war: 'text-red-300 border-red-500/60',
};

const fname = (f: FactionId) => (f === 'player' ? 'You' : f === 'law' ? 'The FBI' : f === 'none' ? 'Somebody' : FACTION_NAMES[f] ?? f);
const sel = 'rounded bg-noir-900 border border-noir-600 p-1 text-xs';

function TensionBar({ v }: { v: number }) {
  const c = v >= 85 ? 'bg-red-500' : v >= 70 ? 'bg-orange-500' : v >= 40 ? 'bg-amber-400' : 'bg-emerald-500';
  return <div className="h-1.5 w-full rounded bg-noir-800 overflow-hidden" aria-label={`Tension ${v} of 100`}><div className={`h-full ${c}`} style={{ width: `${v}%` }} /></div>;
}

export function EraBadge({ era, children }: { era: Era; children?: React.ReactNode }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] ${ERA_TONE[era]}`} data-testid="era-badge">{children ?? ERA_LABEL[era]}</span>;
}

export function IntrigueBoard({ s }: { s: GameState }) {
  const I = s.intrigue;
  const head = eraHeadline(s);
  const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  const web = spyWeb(s);
  const sus = suspects(s);
  const lies = liesInPlay(s);
  const intel = toldAndLearned(s);
  const plots = (I?.plots ?? []).filter((p) => p.known && !p.ended);
  return (
    <div className="space-y-6" data-testid="intrigue-board">
      <section>
        <div className="panel-title">The era</div>
        <p className="text-sm text-stone-200" data-testid="era-headline"><EraBadge era={head.era}>{head.text}</EraBadge>{head.cause && <span className="ml-2 text-xs text-stone-400">{head.cause}</span>}</p>
        <p className="text-[11px] text-stone-500 mt-1">{ERA_RULES[head.era]}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {mobs.map((r) => {
            const m = moodOf(s, r.id);
            const t = I?.eras[`player|${r.id}`];
            return (
              <div key={r.id} className="rounded-md border border-noir-700 bg-noir-800/60 p-2" data-testid="family-mood">
                <div className="flex items-center gap-2">
                  <Face s={s} c={s.characters[r.leaderId]} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-stone-100 truncate">{r.name}</div>
                    <div className="text-[11px] text-stone-400">Mood toward you: <span className="text-stone-200">{m.mood}</span></div>
                  </div>
                  <EraBadge era={m.era} />
                </div>
                <div className="mt-1.5"><TensionBar v={m.tension} /></div>
                <div className="text-[11px] text-stone-500 mt-1">{t?.cause ?? 'Nothing between you yet.'}</div>
                {t?.settlement && t.settlement.until > s.week && <div className="text-[11px] text-sky-300 mt-1">Settlement until week {t.settlement.until}: {t.settlement.text}.</div>}
                <div className="mt-1 grid gap-1">
                  <ActionCard s={s} action={{ kind: 'intrigue', op: { op: 'sitdown', rival: r.id } }} compact />
                  {(m.era === 'cold' || m.era === 'war') && <ActionCard s={s} action={{ kind: 'intrigue', op: { op: 'sabotage', rival: r.id } }} compact />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-stone-400">Between the families:{' '}
          {Object.values(I?.eras ?? {}).filter((t) => t.a !== 'player').map((t) => (
            <span key={t.key} className="mr-2">{FACTION_NAMES[t.a]} – {FACTION_NAMES[t.b]} <EraBadge era={t.era} /></span>
          ))}
          {!I && <span>Nothing to read yet: the board fills in after the first week.</span>}
        </div>
        <ProxyOrders s={s} />
      </section>

      <section>
        <div className="panel-title">The web: who spies on whom</div>
        <p className="text-[11px] text-stone-500">As far as you know. A spy who brings you false word may have been doubled.</p>
        {web.length === 0 && <p className="text-xs text-stone-500 mt-1">No eyes inside anybody's house, and none you know of inside yours.</p>}
        <ul className="mt-1 space-y-1" data-testid="spy-web">
          {web.map((e) => (
            <li key={e.charId} className="flex items-center gap-2 text-sm">
              <span className="text-stone-400 w-28 truncate">{fname(e.from)}</span>
              <span className="text-stone-500">→</span>
              <span className="text-stone-400 w-28 truncate">{fname(e.to)}</span>
              <CharLink s={s} id={e.charId} />
              <span className={`text-[11px] ${e.status === 'doubled?' || e.status === 'known' ? 'text-red-300' : e.status === 'suspected' ? 'text-amber-300' : 'text-emerald-300'}`}>{e.status}</span>
              <span className="text-[11px] text-stone-500 truncate">{e.note}</span>
              {e.status !== 'known' && e.status !== 'suspected' && e.from === 'player' && I?.spies.find((x) => x.charId === e.charId && !x.ended) && <ActionCard s={s} action={{ kind: 'intrigue', op: { op: 'recall', spyId: I.spies.find((x) => x.charId === e.charId && !x.ended)!.id } }} compact />}
            </li>
          ))}
        </ul>
        <SpyOrders s={s} />
      </section>

      <section>
        <div className="panel-title">Moles: the men you suspect</div>
        <p className="text-[11px] text-stone-500">Suspicion comes from leaks: who knew what, when. Nothing happens to any of your men unless you order it.</p>
        {sus.length === 0 && <p className="text-xs text-stone-500 mt-1">No suspicions. That is either good news or very bad news.</p>}
        <MoleHunt s={s} sus={sus.map((x) => ({ id: x.c.id, level: x.level, confirmed: x.confirmed }))} />
        {(I?.canaries ?? []).map((k) => (
          <div key={k.id} className="mt-1 text-[11px] text-stone-400" data-testid="canary">Canary trap (week {k.week}): {k.result ?? `waiting until week ${k.checkWeek}`} </div>
        ))}
      </section>

      <section>
        <div className="panel-title">Lies & rumors in play</div>
        {lies.length === 0 && <p className="text-xs text-stone-500">Nothing you said that could come back.</p>}
        <ul className="space-y-1" data-testid="lies">
          {lies.slice(0, 12).map((l) => (
            <li key={l.id} className="text-xs">
              <span className={l.discovered ? 'text-red-300' : 'text-stone-300'}>{l.text}</span>
              <span className="text-stone-500"> · to {fname(l.to)} · week {l.week}{l.discovered ? ` · came out in week ${l.discovered}` : l.until > s.week ? ' · could still come out' : ' · safe now'}</span>
            </li>
          ))}
        </ul>
        <RumorOrders s={s} />
      </section>

      <section>
        <div className="panel-title">What you were told — what you later learned</div>
        {intel.length === 0 && <p className="text-xs text-stone-500">Nothing reported yet.</p>}
        <ul className="space-y-1.5" data-testid="told-learned">
          {intel.slice(0, 14).map((it) => (
            <li key={it.id} className="text-xs rounded border border-noir-700 p-1.5">
              <div className="text-stone-300">“{it.told.replace(/^"|"$/g, '')}” <span className="text-stone-500">· week {it.week}{it.sourceId ? <> · from <CharLink s={s} id={it.sourceId} /></> : ''}</span></div>
              {it.learned ? <div className={it.true ? 'text-emerald-300' : 'text-red-300'}>Later: {it.true ? 'it was so.' : it.truth}{!it.true && it.motive ? ` (he had his reasons: ${it.motive})` : ''}</div> : <div className="text-stone-500">Not yet borne out.</div>}
            </li>
          ))}
        </ul>
      </section>

      {plots.length > 0 && (
        <section>
          <div className="panel-title">Plots you know of</div>
          <ul className="space-y-1 text-xs">
            {plots.map((p) => <li key={p.id}><CharLink s={s} id={p.actorId} /> — {p.kind === 'coup' ? `wants the chair in ${FACTION_NAMES[p.faction]}` : p.kind === 'betrayal' ? `seen with ${FACTION_NAMES[p.faction]}` : p.kind === 'inlaw' ? 'talks to the FBI' : `a venture with ${FACTION_NAMES[p.faction]}`}{p.backed ? ` (you backed the ${p.backed})` : ''}</li>)}
          </ul>
        </section>
      )}

      <section>
        <div className="panel-title">The intrigue log</div>
        <ul className="text-[11px] text-stone-400 space-y-0.5 max-h-48 overflow-y-auto" data-testid="intrigue-log">
          {(I?.log ?? []).slice().reverse().map(([w, t], i) => <li key={i}><span className="text-stone-500">Wk {w}</span> {t}</li>)}
        </ul>
      </section>
    </div>
  );
}

function MoleHunt({ s, sus }: { s: GameState; sus: { id: string; level: number; confirmed: boolean }[] }) {
  const [pick, setPick] = useState<string[]>([]);
  const top = sus.filter((x) => !x.confirmed).slice(0, 6);
  const chosen = pick.filter((id) => top.some((x) => x.id === id)).slice(0, 3);
  return (
    <div className="mt-1 space-y-1.5">
      {sus.slice(0, 8).map((x) => {
        const c = s.characters[x.id];
        return (
          <div key={x.id} className="rounded border border-noir-700 p-1.5" data-testid="suspect">
            <div className="flex items-center gap-2 text-sm">
              {!x.confirmed && <input type="checkbox" aria-label={`Put ${displayName(c)} in the canary trap`} checked={chosen.includes(x.id)} onChange={(e) => setPick((p) => e.target.checked ? [...p, x.id] : p.filter((y) => y !== x.id))} />}
              <CharLink s={s} id={x.id} />
              <span className={`text-[11px] ${x.confirmed ? 'text-red-300' : 'text-amber-300'}`}>{x.confirmed ? 'talks — you know it' : `suspicion ${x.level}`}</span>
            </div>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {x.confirmed ? (['feed', 'forgive', 'exile', 'bury'] as const).map((f) => <ActionCard key={f} s={s} action={{ kind: 'intrigue', op: { op: 'moleFate', charId: x.id, fate: f } }} compact />)
                : (['talk', 'hard'] as const).map((h) => <ActionCard key={h} s={s} action={{ kind: 'intrigue', op: { op: 'question', charId: x.id, how: h } }} compact />)}
            </div>
          </div>
        );
      })}
      {top.length > 0 && <div className="max-w-xl"><ActionCard s={s} action={{ kind: 'intrigue', op: { op: 'canary', suspects: chosen.length ? chosen : top.slice(0, 3).map((x) => x.id) } }} /></div>}
    </div>
  );
}

function SpyOrders({ s }: { s: GameState }) {
  const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  const [rival, setRival] = useState<RivalId>(mobs[0]?.id ?? 'kessler');
  const mine = Object.values(s.characters).filter((c) => !plantable(s, c)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const [man, setMan] = useState(mine[0]?.id ?? '');
  const theirs = Object.values(s.characters).filter((c) => c.alive && c.faction === rival && c.rank !== 'civilian' && !s.rivals.some((r) => r.leaderId === c.id));
  const [target, setTarget] = useState(theirs[0]?.id ?? '');
  const [how, setHow] = useState<Exclude<SpyHow, 'planted'>>('bribe');
  const m = mine.some((c) => c.id === man) ? man : mine[0]?.id;
  const t = theirs.some((c) => c.id === target) ? target : theirs[0]?.id;
  return (
    <div className="mt-2 rounded border border-noir-700 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Eyes inside</span>
        <select className={sel} value={rival} onChange={(e) => setRival(e.target.value as RivalId)} aria-label="Which family">{mobs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      </div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <div>
          <select className={sel} value={m} onChange={(e) => setMan(e.target.value)} aria-label="Your man to plant">{mine.map((c) => <option key={c.id} value={c.id}>{displayName(c)}</option>)}</select>
          {m ? <ActionCard s={s} action={{ kind: 'intrigue', op: { op: 'plant', charId: m, rival } }} compact /> : <p className="text-[11px] text-stone-500">No soldier or associate free to go inside.</p>}
        </div>
        <div>
          <div className="flex gap-1">
            <select className={sel} value={t} onChange={(e) => setTarget(e.target.value)} aria-label="Their man">{theirs.map((c) => <option key={c.id} value={c.id}>{displayName(c)}</option>)}</select>
            <select className={sel} value={how} onChange={(e) => setHow(e.target.value as typeof how)} aria-label="How">{(['bribe', 'blackmail', 'debt', 'woman'] as const).map((h) => <option key={h} value={h}>{SPY_HOW_LABEL[h]}</option>)}</select>
          </div>
          {t ? <ActionCard s={s} action={{ kind: 'intrigue', op: { op: 'turn', targetId: t, how } }} compact /> : <p className="text-[11px] text-stone-500">Nobody of theirs to approach.</p>}
        </div>
      </div>
    </div>
  );
}

function RumorOrders({ s }: { s: GameState }) {
  const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  const [rival, setRival] = useState<RivalId>(mobs[0]?.id ?? 'kessler');
  const [line, setLine] = useState<RumorLine>('weak');
  const [via, setVia] = useState<'paper' | 'gossip'>('gossip');
  const [blame, setBlame] = useState<RivalId>(mobs[1]?.id ?? 'manno');
  const b = blame === rival ? mobs.find((r) => r.id !== rival)?.id ?? blame : blame;
  return (
    <div className="mt-2 rounded border border-noir-700 p-2 space-y-1">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Rumors, forgeries, false flags</div>
      <div className="flex flex-wrap gap-1">
        <select className={sel} value={rival} onChange={(e) => setRival(e.target.value as RivalId)} aria-label="About">{mobs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select className={sel} value={line} onChange={(e) => setLine(e.target.value as RumorLine)} aria-label="Rumor"><option value="weak">They are finished</option><option value="rat">One of them talks to the FBI</option><option value="skim">A capo robs his boss</option></select>
        <select className={sel} value={via} onChange={(e) => setVia(e.target.value as 'paper' | 'gossip')} aria-label="Through"><option value="gossip">In the bars</option><option value="paper">In the paper's Spout Off</option></select>
      </div>
      <ActionCard s={s} action={{ kind: 'intrigue', op: { op: 'rumor', rival, line, via } }} compact />
      <div className="flex flex-wrap gap-1 items-center text-xs text-stone-400">Make {mobs.find((r) => r.id === rival)?.shortName} believe
        <select className={sel} value={b} onChange={(e) => setBlame(e.target.value as RivalId)} aria-label="Blame">{mobs.filter((r) => r.id !== rival).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select> hit them</div>
      {b !== rival && <ActionCard s={s} action={{ kind: 'intrigue', op: { op: 'forge', victim: rival, blame: b } }} compact />}
    </div>
  );
}

function ProxyOrders({ s }: { s: GameState }) {
  const I = s.intrigue;
  const fights = Object.values(I?.eras ?? {}).filter((t) => t.a !== 'player' && (t.era === 'tension' || t.era === 'cold' || t.era === 'war'));
  if (!fights.length) return null;
  return (
    <div className="mt-2 grid gap-1 sm:grid-cols-2" data-testid="proxy">
      {fights.flatMap((t) => [
        <ActionCard key={`${t.key}a`} s={s} action={{ kind: 'intrigue', op: { op: 'proxy', ally: t.a as RivalId, against: t.b } }} compact />,
        <ActionCard key={`${t.key}b`} s={s} action={{ kind: 'intrigue', op: { op: 'proxy', ally: t.b, against: t.a as RivalId } }} compact />,
      ])}
    </div>
  );
}
