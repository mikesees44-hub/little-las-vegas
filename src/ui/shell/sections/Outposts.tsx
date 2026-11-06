import { useState } from 'react';
import { displayName } from '../../../engine/characters';
import type { FamAction } from '../../../engine/familyWeb';
import {
  breakOdds, driftOf, havensFor, lieCandidates, monthOdds, needsBolthole, outpostsOf, passageOdds, poachOdds, POST_CITIES, POST_CITY_IDS, postActions, postName,
  seedsFor, sendableMen, SPOTS, trendOf, warningsOf, type Outpost, type PostCity, type SpotKind,
} from '../../../engine/outposts';
import type { GameState, PlayerAction } from '../../../engine/types';
import { ActionCard } from '../../components/Orders';
import { CharLink } from '../../components/People';
import { fmt$ } from '../../format';

const fam = (op: FamAction): PlayerAction => ({ kind: 'fam', op });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const sel = 'rounded border border-noir-700 bg-noir-900 px-1 py-0.5 text-[11px] text-stone-200 min-w-0 max-w-full';

/** One outpost: the man, the money sent, his loyalty and its trend, the warning signs, the odds, and the orders. */
function PostCard({ s, o }: { s: GameState; o: Outpost }) {
  const ci = POST_CITIES[o.city];
  const c = s.characters[o.manId];
  const tr = trendOf(o);
  const run = o.status === 'run';
  const d = run ? driftOf(s, o) : undefined;
  const warns = run ? warningsOf(s, o) : [];
  const pb = run ? monthOdds(breakOdds(s, o)) : 0;
  const pp = run ? monthOdds(poachOdds(s, o)) : 0;
  const last = o.sends[o.sends.length - 1] ?? 0;
  const status = { run: 'Running for you', broke: 'Broke away: his own crew now', poached: `Went over to ${o.by ?? 'another family'}`, home: 'Came home', closed: 'Closed' }[o.status];
  return (
    <li className={`llv-card-box ${run && (pb + pp) > 0.1 ? 'llv-card-danger' : 'llv-card-plain'} p-2.5 min-w-0`} data-testid={`outpost-card-${o.id}`}>
      <div className="font-display text-[15px] leading-tight text-stone-100 truncate">{SPOTS[o.spot].name[0].toUpperCase() + SPOTS[o.spot].name.slice(1)} in {ci.name}</div>
      <div className="text-[11px] text-stone-400">Run by {c ? <CharLink s={s} id={c.id}>{displayName(c)}</CharLink> : 'your man'}{o.crew.length ? <> with {o.crew.map((id, i) => <span key={id}>{i ? ' and ' : ''}<CharLink s={s} id={id}>{s.characters[id]?.firstName ?? '?'}</CharLink></span>)}</> : null} · since week {o.since} · seed {fmt$(o.seed)}</div>
      <div className={`text-[11px] ${run ? 'text-emerald-300' : o.status === 'broke' || o.status === 'poached' ? 'text-red-300' : 'text-stone-400'}`} data-testid={`outpost-status-${o.id}`}>{status}</div>
      <div className="text-[11px] text-stone-300" data-testid={`outpost-money-${o.id}`}>Sent home {fmt$(o.sent)} in all{run ? ` · ${fmt$(last)} last week` : ''} · he kept {fmt$(o.kept)} · his share {pct(o.share)}{o.side ? ` · ${o.side} thing${o.side > 1 ? 's' : ''} of his own` : ''}</div>
      {run && (
        <div className="text-[11px] text-stone-300" data-testid={`outpost-loyalty-${o.id}`} title={d?.parts.map((p) => `${p.label}: ${p.value > 0 ? '+' : ''}${p.value}`).join('\n')}>
          Loyalty <b className={o.loyal >= 60 ? 'text-emerald-300' : o.loyal >= 40 ? 'text-amber-200' : 'text-red-300'}>{Math.round(o.loyal)}</b>
          <span className={tr < 0 ? 'text-red-300' : tr > 0 ? 'text-emerald-300' : 'text-stone-500'}> {tr < 0 ? '▼' : tr > 0 ? '▲' : '▬'} {tr > 0 ? '+' : ''}{tr} over {o.hist.length} wk</span>
          <span className="text-stone-500"> · drifts {d!.total > 0 ? '+' : ''}{d!.total}/wk</span>
        </div>
      )}
      {run && <div className="text-[11px] text-stone-400" data-testid={`outpost-odds-${o.id}`}>Next month: {pct(pb)} he breaks away · {pct(pp)} {ci.name === 'Las Vegas' ? 'the Partners' : 'the host family'} take him</div>}
      {warns.length > 0 && <ul className="mt-0.5 list-disc pl-4 text-[11px] text-amber-200" data-testid={`outpost-warnings-${o.id}`}>{warns.map((w) => <li key={w}>{w}</li>)}</ul>}
      {postActions(o).length > 0 && <div className="mt-1 grid gap-1">{postActions(o).map((a) => <ActionCard key={a.op === 'post' ? a.step : ''} s={s} action={fam(a)} compact />)}</div>}
    </li>
  );
}

/** "Send a man to start something": a city, a spot, the seed, the man and up to two more. */
export function OutpostPlanner({ s, manId, city: city0 }: { s: GameState; manId?: string; city?: PostCity }) {
  const men = sendableMen(s);
  const [city, setCity] = useState<PostCity>(city0 ?? 'vegas');
  const spots = POST_CITIES[city].spots;
  const [spot0, setSpot] = useState<SpotKind>('lounge');
  const spot = spots.includes(spot0) ? spot0 : spots[0];
  const [seedI, setSeedI] = useState(0);
  const [man0, setMan] = useState<string | undefined>(manId);
  const man = man0 && (men.some((m) => m.id === man0) || man0 === manId) ? man0 : men[0]?.id;
  const [crew, setCrew] = useState<string[]>([]);
  const seed = seedsFor(spot)[seedI] ?? seedsFor(spot)[0];
  const pickCrew = (i: number, id: string) => setCrew((x) => { const n = [...x]; n[i] = id; return n.filter(Boolean).filter((v, j, a) => a.indexOf(v) === j && v !== man).slice(0, 2); });
  return (
    <div className="rounded border border-gold-700/50 p-2 text-[11px] space-y-1 min-w-0" data-testid="outpost-planner">
      <div className="text-stone-200">Send a man to start something</div>
      {!men.length && !manId ? <div className="text-stone-500" data-testid="outpost-planner-none">Nobody free to send: soldiers, associates, or a capo with no district, home and not busy.</div> : (
        <>
          <div className="flex flex-wrap gap-1 items-center">
            <label className="text-stone-400">In <select className={sel} value={city} onChange={(e) => setCity(e.target.value as PostCity)} data-testid="outpost-city">{POST_CITY_IDS.map((id) => <option key={id} value={id}>{POST_CITIES[id].name}</option>)}</select></label>
            <label className="text-stone-400">start <select className={sel} value={spot} onChange={(e) => setSpot(e.target.value as SpotKind)} data-testid="outpost-spot">{spots.map((k) => <option key={k} value={k}>{SPOTS[k].name}</option>)}</select></label>
            <label className="text-stone-400">with <select className={sel} value={seedI} onChange={(e) => setSeedI(Number(e.target.value))} data-testid="outpost-seed">{seedsFor(spot).map((v, i) => <option key={v} value={i}>{fmt$(v)}</option>)}</select></label>
          </div>
          <div className="text-stone-500">{POST_CITIES[city].blurb}. {SPOTS[spot].text}.</div>
          <div className="flex flex-wrap gap-1 items-center">
            <label className="text-stone-400">Who runs it <select className={sel} value={man ?? ''} onChange={(e) => setMan(e.target.value)} data-testid="outpost-man">{[...(manId && !men.some((m) => m.id === manId) ? [s.characters[manId]] : []), ...men].filter(Boolean).map((m) => <option key={m!.id} value={m!.id}>{displayName(m!)} ({m!.rank})</option>)}</select></label>
            {[0, 1].map((i) => (
              <label key={i} className="text-stone-400">and <select className={sel} value={crew[i] ?? ''} onChange={(e) => pickCrew(i, e.target.value)} data-testid={`outpost-crew-${i}`}><option value="">nobody</option>{men.filter((m) => m.id !== man).map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}</select></label>
            ))}
          </div>
          {man && <ActionCard s={s} action={fam({ op: 'post', step: 'start', city, spot, man, crew, seed })} />}
        </>
      )}
    </div>
  );
}

/** Safe passage: who goes, where, for how long; the odds before going. */
export function LieLowPlanner({ s, who: who0, compact }: { s: GameState; who?: string; compact?: boolean }) {
  const cands = lieCandidates(s);
  const [who1, setWho] = useState<string | undefined>(who0);
  const who = who1 && cands.some((c) => c.id === who1) ? who1 : cands[0]?.id;
  const havens = havensFor(s);
  const open = havens.filter((h) => !h.block);
  const [at1, setAt] = useState<string | undefined>();
  const at = at1 && havens.some((h) => h.at === at1) ? at1 : (open[0] ?? havens[0])?.at;
  const [weeks, setWeeks] = useState(4);
  const p = who && at ? passageOdds(s, who, at, weeks) : undefined;
  return (
    <div className="rounded border border-sky-800/60 p-2 text-[11px] space-y-1 min-w-0" data-testid="lie-planner">
      {!compact && <div className="text-stone-200">Lie low somewhere</div>}
      {!who ? <div className="text-stone-500">Nobody free to go.</div> : (
        <>
          <div className="flex flex-wrap gap-1 items-center">
            {!who0 && <label className="text-stone-400">Who <select className={sel} value={who} onChange={(e) => setWho(e.target.value)} data-testid="lie-who">{cands.map((c) => <option key={c.id} value={c.id}>{c.id === s.playerId ? 'You (the boss)' : displayName(c)}</option>)}</select></label>}
            <label className="text-stone-400">Where <select className={sel} value={at} onChange={(e) => setAt(e.target.value)} data-testid="lie-where">{havens.map((h) => <option key={h.at} value={h.at}>{h.name}{h.block ? ` — ${h.block}` : ''}</option>)}</select></label>
            <label className="text-stone-400">For <select className={sel} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} data-testid="lie-weeks">{[2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n} weeks</option>)}</select></label>
          </div>
          {p && (
            <div className="text-stone-300" data-testid="lie-odds" title={p.reasons.map((r) => `${r.label}: ${r.value > 0 ? '+' : ''}${r.value}`).join('\n')}>
              <span className="text-emerald-300">{pct(p.safe)} safe</span> · <span className="text-amber-200">{pct(p.found)} found</span> · <span className="text-red-300">{pct(p.sold)} sold out by the host</span>
              <span className="text-stone-500"> · hunting: {p.hunters.length ? p.hunters.map((h) => h.name).join('; ') : 'nobody in particular'}</span>
            </div>
          )}
          {at && <ActionCard s={s} action={fam({ op: 'lie', who, at, weeks })} />}
        </>
      )}
    </div>
  );
}

/** "Somewhere to go" (the Desk): shown when the boss is losing a war or the heat is heavy. */
export function SomewhereToGo({ s }: { s: GameState }) {
  const why = needsBolthole(s);
  const [open, setOpen] = useState(false);
  if (!why.length || s.posts?.lie.some((l) => l.status === 'away' && l.who === s.playerId)) return null;
  return (
    <section className="mb-2 rounded-md border border-sky-700/60 bg-sky-950/20 px-2.5 py-1.5 text-[12px]" data-testid="desk-somewhere-to-go" aria-label="Somewhere to go">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.25em] text-sky-300">Somewhere to go</span>
        <span className="min-w-0 flex-1 text-stone-300">{why.join(' · ')}. An outpost or a friendly family's city could hide you for a while; nobody is untouchable.</span>
        <button type="button" className="btn-secondary btn-sm shrink-0 text-[11px]" onClick={() => setOpen(!open)} data-testid="desk-somewhere-open">{open ? 'Close' : 'Lie low in…'}</button>
      </div>
      {open && <div className="mt-1"><LieLowPlanner s={s} who={s.playerId} compact /></div>}
    </section>
  );
}

/** Rivals ▸ Connections ▸ Outposts: the men out of town, sending a new one, and safe passage. */
export function Outposts({ s, city }: { s: GameState; city?: PostCity }) {
  const posts = outpostsOf(s);
  const away = (s.posts?.lie ?? []).filter((l) => l.status === 'away');
  const live = posts.filter((o) => o.status === 'run');
  return (
    <section className="space-y-2" data-testid="outposts">
      <p className="llv-prose text-[12px]">Your men out of town: each runs something with your seed money and sends money home every week. Far from home a man starts his own things; his loyalty drifts with the distance, the time and his nature. Keep him close, or he may break away, or the family there may take him. An outpost is also somewhere to go when you need to get out of Wildwood.</p>
      <div className="text-[12px] text-stone-300" data-testid="outposts-summary">{live.length ? `${live.length} running · ${fmt$(live.reduce((a, o) => a + (o.sends[o.sends.length - 1] ?? 0), 0))} came home last week` : 'No man of yours is out of town.'}</div>
      {posts.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">{posts.map((o) => <PostCard key={o.id} s={s} o={o} />)}</ul>}
      <OutpostPlanner s={s} city={city} />
      <div data-testid="safe-passage" className="space-y-1">
        <div className="mt-1 text-[12px] uppercase tracking-wide text-stone-400">Safe passage — lie low in another city</div>
        {away.length > 0 && (
          <ul className="grid gap-1" data-testid="lie-away">
            {away.map((l) => (
              <li key={l.id} className="rounded border border-sky-800/60 p-1.5 text-[11px]" data-testid={`lie-card-${l.id}`}>
                <div className="text-stone-200">{l.who === s.playerId ? 'You' : <CharLink s={s} id={l.who}>{displayName(s.characters[l.who])}</CharLink>} in {l.city}, until week {l.until}</div>
                <div className="text-stone-500">When {l.who === s.playerId ? 'you' : 'he'} went: {l.odds.safe}% safe, {l.odds.found}% found, {l.odds.sold}% sold out. Hunting: {l.hunters.join('; ') || 'nobody in particular'}.</div>
                <div className="mt-1"><ActionCard s={s} action={fam({ op: 'lie', home: l.id })} compact /></div>
              </li>
            ))}
          </ul>
        )}
        <LieLowPlanner s={s} />
      </div>
    </section>
  );
}

/** A small "Send a man here" for a host family's card in Connections. */
export function postCityOf(famId: string): PostCity | undefined {
  return POST_CITY_IDS.find((c) => POST_CITIES[c].host === famId);
}
export { postName };
