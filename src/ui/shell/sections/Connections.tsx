import { useState } from 'react';
import { allTies, famCard, famName, stanceWord, tieLine, type FamAction, type FamCard, type Tie } from '../../../engine/familyWeb';
import { FAMILY_DEFS, GROUP_ORDER, GROUP_TITLE, TIE_GLYPH, TIE_LABEL, TIE_SIGN, type FamKey } from '../../../engine/familyWebData';
import type { GameState, PlayerAction } from '../../../engine/types';
import { ActionCard } from '../../components/Orders';
import { OpinionBadge } from '../../components/CrewList';
import { CharLink } from '../../components/People';
import { fmt$ } from '../../format';
import { colOf, cokeActions, LEVEL_WORD, market, weeklyTake } from '../../../engine/colombia';
import { gangActions, gangsOf, KIND_LABEL, KIND_WANT } from '../../../engine/gangs';
import { LieLowPlanner, OutpostPlanner, Outposts, postCityOf } from './Outposts';
import { CASINOS, holdersLine, lvActions, lvOf, pointsIn, pointWeekly } from '../../../engine/vegas';

const fam = (op: FamAction): PlayerAction => ({ kind: 'fam', op });
/** The orders on a family's card: op: 'envoy', op: 'favor', op: 'partner', op: 'marry' (and op: 'broker' on the web). */
const ORDERS = ['envoy', 'favor', 'partner', 'marry'] as const;

const GROUP_NOTE: Partial<Record<string, string>> = {
  nyc: 'the five families and the Commission (South Philadelphia sits in as a friend)',
  chi: 'the Outfit: the Midwest, the racing wire, the desert skim, a seat on the Commission',
  nola: 'the oldest family: the port, the Gulf\'s slot machines, the tracks',
  fla: 'Tampa, Miami Beach (the families\' winter base), the Havana men, and a Colombian trickle',
  out: 'Boston, Cleveland, and Las Vegas: an open city where everybody holds a point and nobody holds the town',
};

const tone = (t: Tie) => (TIE_SIGN[t.kind] >= 0.5 ? 'text-emerald-300' : TIE_SIGN[t.kind] < 0 ? 'text-red-300' : 'text-stone-300');

/** A family's ties, one line each (on its card and on the board's rival cards). */
export function TieList({ s, id, max }: { s: GameState; id: FamKey; max?: number }) {
  const ties = allTies(s).filter((t) => t.a === id || t.b === id);
  if (!ties.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-[11px]" data-testid={`fam-ties-${id}`}>
      {ties.slice(0, max ?? ties.length).map((t) => (
        <li key={t.id} className={tone(t)} title={`${TIE_LABEL[t.kind]} since ${t.since}, strength ${t.strength}/100. ${t.story}`}>
          <span className="mr-1">{TIE_GLYPH[t.kind]}</span>{tieLine(s, t, id)} <span className="text-stone-500">({t.strength})</span>
        </li>
      ))}
      {max && ties.length > max ? <li className="text-stone-500">and {ties.length - max} more (Connections, below)</li> : null}
    </ul>
  );
}

function Card({ s, c }: { s: GameState; c: FamCard }) {
  const [open, setOpen] = useState(false);
  const [go, setGo] = useState<'' | 'post' | 'lie'>('');
  const city = postCityOf(c.id);
  const haven = s.families && ['vegas', 'chicago', 'nola', 'biscayne', 'tampa', 'cleveland', 'boston'].includes(c.id);
  return (
    <li className="llv-card-box llv-card-plain p-2.5 min-w-0" data-testid={`fam-card-${c.id}`}>
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-[15px] leading-tight text-stone-100 truncate">{c.def.name}</div>
          <div className="text-[11px] text-stone-400">{c.def.seat} · <span data-testid={`fam-size-${c.id}`}>{c.size}</span></div>
        </div>
        <div className="shrink-0 text-right" title={c.stance.parts.map((p) => `${p.label}: ${p.value > 0 ? '+' : ''}${p.value}`).join('\n')} data-testid={`fam-stance-${c.id}`}>
          <OpinionBadge v={c.stance.value} />
          <div className="text-[10px] text-stone-500">{stanceWord(c.stance.value)}{c.stance.shift ? ` (ties ${c.stance.shift > 0 ? '+' : ''}${c.stance.shift})` : ''}</div>
        </div>
      </div>
      <div className="text-[11px] text-stone-400">Boss: {c.bossId ? <CharLink s={s} id={c.bossId}>{c.boss}</CharLink> : c.boss}</div>
      <div className="text-[11px] text-stone-500">Rackets: {c.def.rackets.join(', ')}</div>
      <TieList s={s} id={c.id} />
      {c.deals.map((d) => <div key={d.what} className={`text-[11px] ${d.weekly < 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{d.weekly < 0 ? `You pay ${fmt$(-d.weekly)}/wk` : `Pays you ${fmt$(d.weekly)}/wk`}: {d.what} (to week {d.until})</div>)}
      {c.id === 'colombians' && <CokePanel s={s} />}
      {c.id === 'vegas' && <StripPanel s={s} />}
      {(city || haven) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {city && <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setGo(go === 'post' ? '' : 'post')} data-testid={`fam-post-${c.id}`}>Send a man to start something here…</button>}
          {haven && <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setGo(go === 'lie' ? '' : 'lie')} data-testid={`fam-lie-${c.id}`}>Lie low here…</button>}
        </div>
      )}
      {go === 'post' && city && <div className="mt-1"><OutpostPlanner s={s} city={city} /></div>}
      {go === 'lie' && <div className="mt-1"><LieLowPlanner s={s} /></div>}
      <button type="button" className="btn-ghost mt-1 px-2 py-0.5 text-[11px]" onClick={() => setOpen(!open)} data-testid={`fam-open-${c.id}`}>{open ? 'Close' : 'Roster & deal with them…'}</button>
      {open && (
        <div className="mt-1 space-y-1.5">
          <p className="text-[11px] text-stone-400 italic">{c.def.blurb}</p>
          <ul className="text-[11px] text-stone-300" data-testid={`fam-roster-${c.id}`}>
            {c.roster.map((m) => (
              <li key={m.name}><span className="text-stone-500">{m.role}:</span> {m.charId ? <CharLink s={s} id={m.charId}>{m.name}</CharLink> : m.name}{m.note ? <span className="text-stone-500"> — {m.note}</span> : null}</li>
            ))}
          </ul>
          <div className="grid gap-1">
            {ORDERS.map((op) => <ActionCard key={op} s={s} action={fam({ op, fam: c.id })} compact />)}
          </div>
        </div>
      )}
    </li>
  );
}

/** The Colombian connection: the boss's place in the import racket (op: 'coke'), abstract and with its costs said plainly. */
function CokePanel({ s }: { s: GameState }) {
  const col = colOf(s);
  const lvl = col?.lvl ?? 0;
  return (
    <div className="mt-1 rounded border border-red-900/50 p-1.5 text-[11px]" data-testid="coke-panel">
      <div className="text-stone-300">The import racket: <span className={lvl ? 'text-red-300' : 'text-stone-400'} data-testid="coke-level">{lvl ? LEVEL_WORD[lvl] : 'you are not in it'}</span>{lvl ? ` · about ${fmt$(Math.round(weeklyTake(s, lvl) * (1 - (col?.cut?.share ?? 0))))}/wk` : ''}</div>
      <div className="text-stone-500">The trade in {s.date.y}: {market(s.date.y) <= 1.2 ? 'a trickle' : market(s.date.y) < 3 ? 'growing' : 'big money'}.{col?.known ? ' Philadelphia knows.' : ''}{col?.cut ? ` ${col.cut.fam} takes ${Math.round(col.cut.share * 100)}%.` : ''}{col?.tot ? ` Paid you ${fmt$(col.tot)} so far.` : ''}</div>
      <div className="mt-1 grid gap-1">{cokeActions().map((a) => <ActionCard key={a.op === 'coke' ? a.step : ''} s={s} action={fam(a)} compact />)}</div>
    </div>
  );
}

/** Las Vegas, an open city: the Strip's casinos, who holds their points, the boss's own points (op: 'lv'). */
function StripPanel({ s }: { s: GameState }) {
  const [open, setOpen] = useState(false);
  const lv = lvOf(s);
  const held = lv?.pts ?? [];
  return (
    <div className="mt-1 rounded border border-gold-700/50 p-1.5 text-[11px]" data-testid="strip-panel">
      <div className="text-stone-300">The Strip: <span data-testid="strip-held">{held.length ? held.map((p) => `${p.n} point${p.n > 1 ? 's' : ''} in ${CASINOS.find((c) => c.id === p.c)?.name ?? p.c}`).join(', ') : 'you hold no point'}</span>{lv?.tot ? ` · paid you ${fmt$(lv.tot)} so far` : ''}</div>
      <div className="text-stone-500">An open city: nobody owns the Strip. The points pay every week out of the count; the skim draws a little federal attention.</div>
      <button type="button" className="btn-ghost mt-1 px-2 py-0.5 text-[11px]" onClick={() => setOpen(!open)} data-testid="strip-open">{open ? 'Close the Strip' : 'The casinos and their points…'}</button>
      {open && (
        <ul className="mt-1 space-y-1.5" data-testid="strip-casinos">
          {CASINOS.map((c) => (
            <li key={c.id} data-testid={`casino-${c.id}`}>
              <div className="text-stone-200 capitalize">{c.name}{c.downtown ? ' (downtown)' : ''} <span className="text-stone-500 normal-case">— {c.note}</span></div>
              <div className="text-stone-500">Points held by {holdersLine(s, c)} · a point pays about {fmt$(pointWeekly(s, c))}/wk{pointsIn(s, c.id) ? <span className="text-emerald-300"> · you hold {pointsIn(s, c.id)}</span> : null}</div>
              <div className="mt-0.5 grid gap-1">{lvActions(c).map((a) => <ActionCard key={a.op === 'lv' ? a.step : ''} s={s} action={fam(a)} compact />)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Gangs that cropped up: where they are, what they want, and the four ways to deal with them (op: 'gang'). */
function Gangs({ s }: { s: GameState }) {
  const gangs = gangsOf(s);
  return (
    <div data-testid="fam-group-gangs">
      <div className="mt-1 text-[12px] uppercase tracking-wide text-stone-400">Gangs — biker clubs and street crews that turned up</div>
      {!gangs.length ? <p className="text-[11px] text-stone-500" data-testid="gangs-none">None on the island now. They come where there is an opening: a summer rally, a district nobody holds, places with no capo, a war.</p> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {gangs.map((g) => {
            const where = s.districts.find((d) => d.id === g.district)?.name ?? g.district;
            const patron = g.patron ? s.rivals.find((r) => r.id === g.patron)?.shortName : undefined;
            return (
              <li key={g.id} className="llv-card-box llv-card-plain p-2.5 min-w-0" data-testid={`gang-card-${g.id}`}>
                <div className="font-display text-[15px] leading-tight text-stone-100 truncate">{g.name}</div>
                <div className="text-[11px] text-stone-400">{KIND_LABEL[g.kind]} · {g.size} strong · led by {g.leader}</div>
                <div className="text-[11px] text-stone-300" data-testid={`gang-where-${g.id}`}>In {where} since week {g.since}: {g.why}.</div>
                <div className="text-[11px] text-stone-400" data-testid={`gang-want-${g.id}`}>They want {KIND_WANT[g.kind]}.</div>
                <div className={`text-[11px] ${g.status === 'partner' ? 'text-emerald-300' : g.status === 'paid' ? 'text-stone-300' : 'text-red-300'}`} data-testid={`gang-status-${g.id}`}>
                  {g.status === 'partner' ? 'Partners: they pay you a piece every week.' : g.status === 'paid' ? `Paid off until week ${g.until}.` : 'Making trouble: shakedowns, fights, heat.'}{patron ? ` On ${patron}'s payroll.` : ''}
                </div>
                <div className="mt-1 grid gap-1">{gangActions(g).map((a) => <ActionCard key={a.op === 'gang' ? a.how : ''} s={s} action={fam(a)} compact />)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The web drawn: every family on a ring, grouped, a line for each tie (green warm, red hostile). */
function Web({ s }: { s: GameState }) {
  const ids: FamKey[] = ['player', ...GROUP_ORDER.flatMap((g) => FAMILY_DEFS.filter((d) => d.group === g).map((d) => d.id))];
  const R = 150, C = 190;
  const at = new Map(ids.map((id, i) => {
    const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
    return [id, [C + Math.cos(a) * R, C + Math.sin(a) * R] as const];
  }));
  const ties = allTies(s);
  return (
    <svg viewBox="0 0 380 380" className="w-full max-w-[460px] mx-auto" role="img" aria-label="The web of family ties" data-testid="connections-web">
      {ties.map((t) => {
        const p = at.get(t.a), q = at.get(t.b);
        if (!p || !q) return null;
        const col = TIE_SIGN[t.kind] >= 0.5 ? '#34d399' : TIE_SIGN[t.kind] < 0 ? '#f87171' : '#a8a29e';
        return <line key={t.id} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={col} strokeOpacity={0.35 + t.strength / 200} strokeWidth={0.6 + t.strength / 40}><title>{`${famName(s, t.a)} — ${famName(s, t.b)}: ${TIE_LABEL[t.kind]} (${t.strength}). ${t.story}`}</title></line>;
      })}
      {ids.map((id) => {
        const [x, y] = at.get(id)!;
        const label = id === 'player' ? 'You' : famName(s, id);
        return (
          <g key={id}>
            <circle cx={x} cy={y} r={id === 'player' ? 7 : 5} fill={id === 'player' ? '#d9b75f' : '#57534e'} stroke="#1c1917" />
            <text x={x} y={y + (y > C ? 15 : -9)} textAnchor="middle" fontSize="9" fill="currentColor" className="text-stone-300">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Rivals ▸ The other families ▸ Connections: every family by where it sits, its ties and roster, the web, the news. */
export function Connections({ s }: { s: GameState }) {
  const [view, setView] = useState<'list' | 'web' | 'posts'>('list');
  const st = s.families;
  if (!st) return null;
  const feuds = st.ties.filter((t) => (t.kind === 'feud' || t.kind === 'broken') && t.a !== 'player' && t.b !== 'player');
  return (
    <section className="space-y-2" data-testid="connections">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[17px] text-gold-300">Connections: every family and who it is tied to</h3>
        <div className="flex gap-1">
          <button type="button" className={view === 'list' ? 'btn-gold px-2 py-0.5 text-[11px]' : 'btn-ghost px-2 py-0.5 text-[11px]'} onClick={() => setView('list')} data-testid="connections-list-tab">By family</button>
          <button type="button" className={view === 'web' ? 'btn-gold px-2 py-0.5 text-[11px]' : 'btn-ghost px-2 py-0.5 text-[11px]'} onClick={() => setView('web')} data-testid="connections-web-tab">The web</button>
          <button type="button" className={view === 'posts' ? 'btn-gold px-2 py-0.5 text-[11px]' : 'btn-ghost px-2 py-0.5 text-[11px]'} onClick={() => setView('posts')} data-testid="connections-outposts-tab">Outposts{s.posts?.list.some((o) => o.status === 'run') ? ` (${s.posts.list.filter((o) => o.status === 'run').length})` : ''}</button>
        </div>
      </div>
      <p className="llv-prose text-[12px]">A family's stance toward you is what it thinks of you plus its ties: friends of your friends warm to you, friends of your enemies cool. Send an envoy, do a favor, go into business, marry into them, or broker a truce between two families.</p>
      {view === 'posts' ? <Outposts s={s} /> : view === 'web' ? (
        <div className="space-y-2">
          <Web s={s} />
          {feuds.length > 0 && (
            <div data-testid="connections-feuds">
              <div className="text-[12px] text-stone-300">Bad blood you could settle:</div>
              <div className="grid gap-1 sm:grid-cols-2">{feuds.slice(0, 6).map((t) => <ActionCard key={t.id} s={s} action={fam({ op: 'broker', tie: t.id })} compact />)}</div>
            </div>
          )}
        </div>
      ) : (
        <>
          {GROUP_ORDER.map((g) => (
            <div key={g} data-testid={`fam-group-${g}`}>
              <div className="mt-1 text-[12px] uppercase tracking-wide text-stone-400">{GROUP_TITLE[g]}{GROUP_NOTE[g] ? ` — ${GROUP_NOTE[g]}` : ''}</div>
              <ul className="grid gap-2 sm:grid-cols-2">{FAMILY_DEFS.filter((d) => d.group === g).map((d) => <Card key={d.id} s={s} c={famCard(s, d.id)} />)}</ul>
            </div>
          ))}
          <Gangs s={s} />
        </>
      )}
      {st.log.length > 0 && (
        <div data-testid="connections-news">
          <div className="text-[12px] text-stone-300">Lately among the families:</div>
          <ul className="text-[11px] text-stone-400 space-y-0.5">{st.log.slice(-10).reverse().map((l, i) => <li key={i} className={l.tone === 'bad' ? 'text-red-300/80' : l.tone === 'good' ? 'text-emerald-300/80' : ''}>Wk {l.w}: {l.t}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
