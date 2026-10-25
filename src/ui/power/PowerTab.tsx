import { useMemo, useState } from 'react';
import { ageOn } from '../../engine/calendar';
import { crew, displayName, player } from '../../engine/characters';
import { cloneState } from '../../engine/engine';
import { POSTS } from '../../engine/attrs';
import { activeBlitz, balanceOfPower, PREP_INFO } from '../../engine/blitz';
import { CAUSE_TEXT } from '../../engine/crisis';
import { FRONT_INFO } from '../../engine/front';
import { STAGE_NAMES } from '../../engine/grievances';
import { ambitionOf, capability, challengePressure, DESIGNATION_INFO, DESIGNATION_MODES, GROOM_PATHS, GROOM_PATH_IDS, successionCandidates, WANT_TEXT, type Score } from '../../engine/heir';
import { pwView } from '../../engine/powerState';
import { STATION_INFO } from '../../engine/station';
import type { Character, GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { signed } from '../format';
import { HeirCompare } from '../clarity/Pickers';

export type PowerSub = 'power' | 'grievances' | 'blitz' | 'front';

/** A copy of the state the screens may compute on freely (attrs and ambitions are generated lazily). */
function useView(s: GameState): GameState {
  return useMemo(() => cloneState(s), [s]);
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{children}</div>;
}

function Bar({ value, tone, max = 100 }: { value: number; tone: string; max?: number }) {
  return (
    <div className="h-1.5 w-full rounded bg-noir-700 overflow-hidden">
      <div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function ScoreBox({ title, sc, tone }: { title: string; sc: Score; tone: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0">
      <button type="button" className="w-full text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="flex justify-between text-[11px] text-stone-400"><span>{title}</span><span className="tabular-nums text-stone-100 font-semibold">{sc.score}</span></div>
        <Bar value={sc.score} tone={tone} />
      </button>
      {open && (
        <ul className="mt-1 text-[11px] space-y-0.5">
          {sc.reasons.map((r, i) => (
            <li key={i} className="flex justify-between gap-2"><span className="text-stone-400">{r.label}</span><span className={`tabular-nums ${r.value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{signed(r.value)}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The Power tab: heirs, grievances, the balance of power and blitzes, the front and the ladder. */
export function PowerTab({ s, sub }: { s: GameState; sub: PowerSub }) {
  const v = useView(s);
  return (
    <div className="space-y-4" data-testid="power-tab">
      <StationStrip s={v} />
      <CrisisPanel s={v} />
      {sub === 'power' && <HeirsPanel s={v} />}
      {sub === 'grievances' && <GrievancesPanel s={v} />}
      {sub === 'blitz' && <BlitzPanel s={v} />}
      {sub === 'front' && <FrontPanel s={v} />}
    </div>
  );
}

function StationStrip({ s }: { s: GameState }) {
  const p = pwView(s);
  if (p.station === 'boss' && !p.front) return null;
  const over = p.overId ? s.characters[p.overId] : undefined;
  return (
    <section className="rounded-md border border-gold-600/40 bg-noir-800/60 p-3" data-testid="station">
      <Label>Your place in the family</Label>
      <div className="font-display text-xl text-gold-300">{STATION_INFO[p.station].name}</div>
      <p className="text-xs text-stone-400">{STATION_INFO[p.station].text}{over?.alive ? <> Above you: <CharLink s={s} id={over.id} />.</> : null}</p>
      {p.station !== 'boss' && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ActionCard s={s} action={{ kind: 'power', op: { op: 'climb' } }} />
          <ActionCard s={s} action={{ kind: 'power', op: { op: 'takeover' } }} />
        </div>
      )}
    </section>
  );
}

function CrisisPanel({ s }: { s: GameState }) {
  const c = pwView(s).crisis;
  if (!c) return null;
  const fallen = s.characters[c.fallenId];
  const m = c.meters;
  return (
    <section className="rounded-md border border-blood-400/60 bg-blood-900/20 p-3" data-testid="crisis">
      <Label>Succession crisis · beat {c.beat + 1} of {c.beats}{c.wave > 1 ? ` · wave ${c.wave}` : ''}</Label>
      <div className="text-sm text-stone-200">{fallen ? displayName(fallen) : 'The boss'} {CAUSE_TEXT[c.cause]}. {displayName(player(s))} holds the chair.</div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
        {(['cohesion', 'survival', 'escalation', 'loyalty'] as const).map((k) => (
          <div key={k}><div className="flex justify-between text-stone-400"><span>{k[0].toUpperCase() + k.slice(1)}</span><span className="tabular-nums text-stone-100">{m[k]}</span></div><Bar value={m[k]} tone={k === 'escalation' ? 'bg-blood-400' : 'bg-gold-500'} /></div>
        ))}
        <div><div className="text-stone-400">Treasury</div><div className={`tabular-nums ${s.money >= c.money0 ? 'text-stone-100' : 'text-red-300'}`}>{s.money >= c.money0 ? 'holding' : `−$${(c.money0 - s.money).toLocaleString('en-US')}`}</div></div>
      </div>
      <div className="mt-2 text-[11px] text-stone-400">
        Who did it: <span className="text-stone-200">{c.known.killer === 'unknown' || !c.known.killer ? 'unknown' : c.known.killer}</span> · Another hit coming: <span className="text-stone-200">{c.known.nextHit === undefined ? '?' : c.known.nextHit ? 'yes' : 'no'}</span>
        {c.known.leakId && <> · The leak: <CharLink s={s} id={c.known.leakId} /></>}
      </div>
      <ul className="mt-1 text-[11px] text-stone-500">{c.log.slice(-3).map((l, i) => <li key={i}>{l.text}</li>)}</ul>
    </section>
  );
}

/* ---------------- Heirs ---------------- */

function HeirsPanel({ s }: { s: GameState }) {
  const p = pwView(s);
  const d = p.designation;
  const cands = successionCandidates(s);
  const house = cands.filter((c) => c.dynasty);
  const [pick, setPick] = useState<string>(house[0]?.id ?? '');
  const heirIds = new Set([d.publicId, d.secretId, s.designatedHeirId].filter(Boolean));
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl text-gold-400">The Heir Paradox</h2>
        <p className="text-sm text-stone-400">The skills that make a man a good boss are the same skills that let him take your chair. Every candidate has two numbers: how good a boss he would be, and how hard he is pushing to be one now. Tap a bar for the reasons.</p>
      </div>
      <section className="rounded-md border border-noir-700 bg-noir-800/50 p-3">
        <Label>How the heir is named</Label>
        <div className="text-sm text-stone-200">{DESIGNATION_INFO[d.mode].name}{d.publicId ? <> · the crew's heir: <CharLink s={s} id={d.publicId} /></> : null}{d.secretId ? <> · <span className="text-gold-300">secret heir</span>: <CharLink s={s} id={d.secretId} /></> : null}</div>
        {d.mode === 'private' && <div className="mt-1 text-[11px] text-stone-400">The secret: {d.exposed ? <span className="text-red-300">out</span> : <>exposure {Math.round(d.exposure)} / 100</>}</div>}
        {d.grooming && <div className="mt-1 text-[11px] text-stone-400">Grooming: <CharLink s={s} id={d.grooming.charId} /> — {GROOM_PATHS[d.grooming.path].name.toLowerCase()} (since week {d.grooming.since})</div>}
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        {cands.map((c) => <CandidateCard key={c.id} s={s} c={c} heir={heirIds.has(c.id)} />)}
        {cands.length === 0 && <p className="text-sm text-stone-500">Nobody old enough to follow you.</p>}
      </div>
      <section className="space-y-2">
        <h3 className="font-display text-lg text-gold-400">Designate an heir</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-400">Of the house:</span>
          <select className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200" value={pick} onChange={(e) => setPick(e.target.value)} data-testid="heir-pick">
            {house.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({ageOn(c.birth, s.date)})</option>)}
          </select>
        </div>
        <HeirCompare s={s} pool={house.map((c) => c.id)} pickId={pick} onPick={setPick} />
        <div className="grid gap-2 sm:grid-cols-2">
          {DESIGNATION_MODES.map((m) => (
            <ActionCard key={m} s={s} action={{ kind: 'power', op: { op: 'designate', mode: m, charId: DESIGNATION_INFO[m].needsHeir ? pick || undefined : undefined } }} />
          ))}
        </div>
      </section>
      {pick && (
        <section className="space-y-2">
          <h3 className="font-display text-lg text-gold-400">Quiet grooming</h3>
          <p className="text-xs text-stone-400">Develop {s.characters[pick]?.firstName} away from the heat. Every path builds different skills — and some are closer to the life, where people talk.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {GROOM_PATH_IDS.map((g) => <ActionCard key={g} s={s} action={{ kind: 'power', op: { op: 'groom', charId: pick, path: g } }} compact />)}
            {d.grooming && <ActionCard s={s} action={{ kind: 'power', op: { op: 'stopGrooming' } }} compact />}
          </div>
        </section>
      )}
      <ProtegePanel s={s} />
    </div>
  );
}

function CandidateCard({ s, c, heir }: { s: GameState; c: Character; heir: boolean }) {
  const cap = capability(s, c);
  const pr = challengePressure(s, c);
  const a = ambitionOf(s, c);
  return (
    <div className={`rounded-md border p-2.5 ${heir ? 'border-gold-500/70 bg-gold-500/5' : 'border-noir-700 bg-noir-800/60'}`} data-testid="candidate">
      <div className="flex gap-2">
        <Face s={s} c={c} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-stone-100 truncate"><CharLink s={s} id={c.id} />{heir && <span className="ml-1 text-[10px] text-gold-300 uppercase tracking-wider">heir</span>}</div>
          <div className="text-[11px] text-stone-400">{c.dynasty ? 'Of the house' : c.rank} · {ageOn(c.birth, s.date)} yrs · followers {c.attrs?.followers ?? 0}</div>
          <div className="text-[11px] mt-0.5">{a.revealed ? <span className="text-amber-300">{c.gender === 'F' ? 'She' : 'He'} {WANT_TEXT[a.want]} (drive {a.intensity}){a.promise ? ` · promised by week ${a.promise.by}` : ''}{a.broken ? ` · ${a.broken} broken promise${a.broken > 1 ? 's' : ''}` : ''}</span> : <span className="text-stone-500">Hidden ambition: unknown</span>}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <ScoreBox title="Leadership capability" sc={cap} tone="bg-emerald-600" />
        <ScoreBox title="Challenge pressure" sc={pr} tone="bg-blood-400" />
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {!a.revealed && <ActionCard s={s} action={{ kind: 'power', op: { op: 'read', charId: c.id } }} compact />}
        {!a.promise && pr.score >= 40 && <ActionCard s={s} action={{ kind: 'power', op: { op: 'promise', charId: c.id, years: 3 } }} compact />}
      </div>
    </div>
  );
}

function ProtegePanel({ s }: { s: GameState }) {
  const p = pwView(s);
  const men = [...crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate'), ...Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== s.playerId && ageOn(c.birth, s.date) >= 16 && c.faction !== 'player')];
  const [who, setWho] = useState(men[0]?.id ?? '');
  const placed = Object.entries(p.placements);
  return (
    <section className="space-y-2">
      <h3 className="font-display text-lg text-gold-400">Protégés</h3>
      <p className="text-xs text-stone-400">Skills grow with the job, the seat, the business a man runs, his schooling and his years. Put a protégé where he will learn — and remember that a protégé who does well gets rich and gathers men.</p>
      {placed.length > 0 && (
        <ul className="text-xs text-stone-300 space-y-0.5">
          {placed.map(([id, pl]) => <li key={id}><CharLink s={s} id={id} /> — {POSTS[pl.post]?.name.toLowerCase()}{pl.mentorId ? <> under <CharLink s={s} id={pl.mentorId} /></> : null} · {s.characters[id]?.attrs?.followers ?? 0} followers</li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-400">Protégé:</span>
        <select className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200" value={who} onChange={(e) => setWho(e.target.value)}>
          {men.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.rank})</option>)}
        </select>
      </div>
      {who && <div className="grid gap-2 sm:grid-cols-2">{Object.keys(POSTS).map((k) => <ActionCard key={k} s={s} action={{ kind: 'power', op: { op: 'place', charId: who, post: k } }} compact />)}</div>}
    </section>
  );
}

/* ---------------- Grievances ---------------- */

function GrievancesPanel({ s }: { s: GameState }) {
  const p = pwView(s);
  const open = p.grievances.filter((g) => g.status === 'open').sort((a, b) => b.stage - a.stage || b.severity - a.severity);
  const closed = p.grievances.filter((g) => g.status !== 'open').slice(-8).reverse();
  return (
    <div className="space-y-4" data-testid="grievances">
      <div>
        <h2 className="font-display text-2xl text-gold-400">Passed Over</h2>
        <p className="text-sm text-stone-400">Every post that changes hands makes winners and losers. Each man who wanted it takes it his own way — ambition, pride, patience, loyalty, whether he was the better man, how long he has been here, and whether it looked fair. A patient man can resent you quietly for fifteen years; a hothead is building a faction by Labor Day.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ActionCard s={s} action={{ kind: 'power', op: { op: 'announce', mode: 'public' } }} compact />
        <ActionCard s={s} action={{ kind: 'power', op: { op: 'announce', mode: 'private' } }} compact />
      </div>
      <div className="text-[11px] text-stone-500">Ladder: {STAGE_NAMES.join(' → ')}</div>
      {open.length === 0 && <p className="text-sm text-stone-500">Nobody is nursing a grudge over a post. For now.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {open.map((g) => {
          const c = s.characters[g.charId];
          if (!c) return null;
          return (
            <div key={g.id} className="rounded-md border border-noir-700 bg-noir-800/60 p-2.5">
              <div className="flex gap-2">
                <Face s={s} c={c} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-stone-100"><CharLink s={s} id={c.id} /> wanted {g.postLabel}</div>
                  <div className="text-[11px] text-stone-400">{g.winnerId ? <>Went to <CharLink s={s} id={g.winnerId} /></> : null} · week {g.week} · {g.public ? `public, ${g.witnesses} witnesses` : 'explained privately'}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px]"><span className={g.stage >= 3 ? 'text-red-300' : g.stage >= 2 ? 'text-amber-300' : 'text-stone-300'}>{STAGE_NAMES[g.stage]}</span><span className="text-stone-500">severity {g.severity}</span></div>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 text-[11px]">{g.reasons.map((r, i) => <span key={i} className={r.value > 0 ? 'text-red-400' : 'text-emerald-400'}>{signed(r.value)} {r.label}</span>)}</div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                {(['money', 'share', 'apology'] as const).map((k) => <ActionCard key={k} s={s} action={{ kind: 'power', op: { op: 'amends', grievanceId: g.id, kind: k } }} compact />)}
              </div>
            </div>
          );
        })}
      </div>
      {closed.length > 0 && (
        <div>
          <Label>Settled and exploded</Label>
          <ul className="mt-1 text-xs text-stone-400 space-y-0.5">{closed.map((g) => <li key={g.id}>{s.characters[g.charId] ? displayName(s.characters[g.charId]) : '?'} over {g.postLabel}: {g.resolution ?? g.status}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/* ---------------- Balance & blitz ---------------- */

function BlitzPanel({ s }: { s: GameState }) {
  const p = pwView(s);
  const bal = balanceOfPower(s);
  const onMe = activeBlitz(s, undefined, 'player');
  const mine = activeBlitz(s, 'player');
  const legit = Object.entries(p.legit).filter(([, w]) => (w ?? 0) >= s.week);
  return (
    <div className="space-y-4" data-testid="blitz">
      <div>
        <h2 className="font-display text-2xl text-gold-400">The Balance of Power</h2>
        <p className="text-sm text-stone-400">Muscle, money, men, allies and heat for every family. A weaker family can still take you out with a blitz — a chain of hits on the leadership, one a week, until somebody stops it.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {bal.map((b) => (
          <div key={b.id} className={`rounded-md border p-2.5 ${b.id === 'player' ? 'border-gold-500/60' : 'border-noir-700'} bg-noir-800/60`}>
            <div className="flex justify-between text-sm"><span className="text-stone-100 truncate">{b.name}</span><span className="tabular-nums text-gold-300 font-semibold">{b.total}</span></div>
            <Bar value={b.total} tone={b.id === 'player' ? 'bg-gold-500' : 'bg-stone-400'} />
            <div className="mt-1 grid grid-cols-5 gap-1 text-[10px] text-stone-400 text-center">
              <span>Muscle<br /><b className="text-stone-200">{b.muscle}</b></span><span>Money<br /><b className="text-stone-200">{b.money}</b></span><span>Men<br /><b className="text-stone-200">{b.men}</b></span><span>Allies<br /><b className="text-stone-200">{b.allies}</b></span><span>Heat<br /><b className="text-stone-200">{b.heat}</b></span>
            </div>
          </div>
        ))}
      </div>
      {legit.length > 0 && <p className="text-xs text-red-300">You killed a made man without the Table's consent: {legit.map(([r]) => s.rivals.find((x) => x.id === r)?.name).join(', ')} may come for you, and nobody will object.</p>}
      {[onMe, mine].filter(Boolean).map((b) => (
        <section key={b!.id} className="rounded-md border border-blood-400/60 bg-noir-800/60 p-3">
          <Label>{b!.attacker === 'player' ? 'Your blitz' : 'A blitz on your family'} · momentum {b!.momentum}</Label>
          <ol className="mt-1 flex flex-wrap gap-2 text-xs">
            {b!.targets.map((id, i) => {
              const c = s.characters[id];
              const st = b!.kills.includes(id) ? 'line-through text-red-400' : b!.misses.includes(id) ? 'text-emerald-300' : i === b!.idx ? 'text-amber-300 font-semibold' : 'text-stone-300';
              return <li key={id + i} className={st}>{i + 1}. {c ? `${c.firstName} ${c.lastName}` : '?'}</li>;
            })}
          </ol>
        </section>
      ))}
      <section className="space-y-2">
        <h3 className="font-display text-lg text-gold-400">Defenses</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionCard s={s} action={{ kind: 'power', op: { op: 'mattresses', on: !p.mattresses } }} />
          <ActionCard s={s} action={{ kind: 'power', op: { op: 'bodyguards', on: !p.bodyguards } }} />
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="font-display text-lg text-gold-400">Going to the mattresses</h3>
        <div className="text-xs text-stone-400">Preparation: {(['intel', 'crews', 'safehouses'] as const).map((k) => `${PREP_INFO[k].name} ${p.prep[k]}/3`).join(' · ')}</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['intel', 'crews', 'safehouses'] as const).map((k) => <ActionCard key={k} s={s} action={{ kind: 'power', op: { op: 'prep', kind: k } }} compact />)}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {s.rivals.filter((r) => r.kind === 'mob').map((r) => <ActionCard key={r.id} s={s} action={{ kind: 'power', op: { op: 'blitz', rival: r.id } }} />)}
        </div>
      </section>
    </div>
  );
}

/* ---------------- The front ---------------- */

function FrontPanel({ s }: { s: GameState }) {
  const p = pwView(s);
  const f = p.front;
  const fig = f ? s.characters[f.figureheadId] : undefined;
  const men = crew(s).filter((c) => c.rank === 'capo' || c.rank === 'consigliere' || c.rank === 'underboss' || ageOn(c.birth, s.date) >= 58);
  const [who, setWho] = useState(men[0]?.id ?? '');
  return (
    <div className="space-y-4" data-testid="front">
      <div>
        <h2 className="font-display text-2xl text-gold-400">The Front Boss</h2>
        <p className="text-sm text-stone-400">The official Don and the real power can be different men. A front draws the cameras and the heat — until the prosecutor or the rivals see through it, or the figurehead notices he is being bypassed.</p>
      </div>
      {f && fig ? (
        <section className="rounded-md border border-noir-700 bg-noir-800/60 p-3 space-y-2">
          <div className="flex gap-2 items-center">
            <Face s={s} c={fig} size={48} />
            <div>
              <Label>The official Don</Label>
              <div className="text-sm text-stone-100"><CharLink s={s} id={fig.id} /> · {FRONT_INFO[f.type].name}</div>
              <div className="text-[11px] text-stone-400">The shadow Don: <CharLink s={s} id={s.playerId} />{f.reaction ? ` · he knows (${f.reaction})` : ''}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
            {([['His official authority', f.authority, 'bg-stone-400'], ['Your real influence', f.influence, 'bg-gold-500'], ['His suspicion', f.suspicion, 'bg-amber-500'], ['The law sees through it', f.seenByLaw, 'bg-sky-500'], ['The rivals see through it', f.seenByRivals, 'bg-blood-400']] as const).map(([l, v, t]) => (
              <div key={l}><div className="flex justify-between text-stone-400"><span>{l}</span><span className="text-stone-100 tabular-nums">{Math.round(v)}</span></div><Bar value={v} tone={t} /></div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionCard s={s} action={{ kind: 'power', op: { op: 'consult' } }} compact />
            <ActionCard s={s} action={{ kind: 'power', op: { op: 'endFront' } }} compact />
          </div>
        </section>
      ) : (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-stone-400">The man in front:</span>
            <select className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200" value={who} onChange={(e) => setWho(e.target.value)}>
              {men.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.rank}, {ageOn(c.birth, s.date)})</option>)}
            </select>
          </div>
          {who && <div className="grid gap-2 sm:grid-cols-3">{(['unaware', 'willing', 'elder'] as const).map((t) => <ActionCard key={t} s={s} action={{ kind: 'power', op: { op: 'front', charId: who, type: t } }} />)}</div>}
        </section>
      )}
      {p.acting && (
        <p className="text-xs text-stone-400">While you are inside, <CharLink s={s} id={p.acting.id} /> is acting boss (his authority {p.acting.authority}). Two centers of power.</p>
      )}
    </div>
  );
}
