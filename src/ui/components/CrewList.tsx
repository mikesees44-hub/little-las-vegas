import { useState } from 'react';
import { ageOn } from '../../engine/calendar';
import { capos, crew, displayName, isFree } from '../../engine/characters';
import { holder, SEAT_INFO, SEATS, seatOf, seatPower, TASKS } from '../../engine/council';
import { EDICTS, POLICY_LABEL, SPECIALTY_INFO } from '../../engine/crewlife';
import { BooksPanel, FactionsPanel, GeneralOrders } from './CrewTree';
import { CAPO_CUT, skimRate } from '../../engine/economy';
import { opinion } from '../../engine/relations';
import { regime } from '../../engine/hierarchy';
import type { Character, CouncilTask, CrewPolicy, EdictId, GameState, Rank, Seat } from '../../engine/types';
import { fmt$, signed } from '../format';
import { ActionCard, useOrders } from './Orders';
import { CharLink, Face, TraitIcons } from './People';
import { useClarity } from '../clarity/context';
import { TaskAdvice } from '../clarity/TaskAdvice';
import { capoDistrict } from '../../engine/candidates';

const RANK_ORDER: Rank[] = ['underboss', 'consigliere', 'capo', 'soldier', 'associate'];

export function OpinionBadge({ v }: { v: number }) {
  const tone = v >= 25 ? 'text-emerald-400' : v <= -25 ? 'text-red-400' : 'text-stone-300';
  return <span className={`tabular-nums font-semibold ${tone}`}>{signed(v)}</span>;
}

export function CrewList({ s }: { s: GameState }) {
  const men = crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate').sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
  return (
    <div className="space-y-6">
      <Council s={s} />
      <GeneralOrders s={s} />
      <Vassals s={s} />
      <FactionsPanel s={s} />
      <BooksPanel s={s} />
      <section>
        <div className="panel-title">The men</div>
        <p className="text-xs text-stone-500">Soldiers and associates hustle for themselves. You decide how much of it comes to you. Men nobody talks to start drifting toward rivals.</p>
        <div className="mt-2 space-y-1.5">{men.map((c) => <ManRow key={c.id} s={s} c={c} />)}</div>
      </section>
      <HirePool s={s} />
      <Edicts s={s} />
    </div>
  );
}

function Council({ s }: { s: GameState }) {
  const { queue } = useOrders();
  const { openPicker } = useClarity();
  return (
    <section>
      <div className="panel-title">The administration</div>
      <p className="text-xs text-stone-500">Five seats. Each does one job a week, and does it better with the right skill. Changes are orders, carried out when you advance.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="council">
        {SEATS.map((st) => {
          const h = holder(s, st);
          const info = SEAT_INFO[st];
          const seat = s.council[st];
          const tasks = (Object.keys(TASKS) as CouncilTask[]).filter((t) => TASKS[t].seat === st);
          const cands = crew(s).filter((c) => isFree(s, c) && !c.specialty && c.rank !== 'associate' && c.id !== h?.id).sort((a, b) => b.attributes[info.skill] - a.attributes[info.skill]);
          return (
            <div key={st} className="rounded-md border border-noir-700 bg-noir-800/60 p-2.5">
              <div className="flex justify-between items-baseline">
                <div className="font-semibold text-gold-300">{info.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-stone-500">{info.skill}</div>
              </div>
              <div className="mt-1 flex gap-2 items-center">
                {h ? <Face s={s} c={h} size={40} /> : <div className="w-10 h-12 rounded bg-noir-900 border border-dashed border-noir-600" />}
                <div className="min-w-0 text-sm">
                  {h ? <CharLink s={s} id={h.id} /> : <span className="text-stone-500">Vacant</span>}
                  {h && <div className="text-[11px] text-stone-400">{info.skill} {h.attributes[info.skill]} · ×{seatPower(s, st).toFixed(2)}</div>}
                </div>
              </div>
              <label className="block mt-2 text-[11px] text-stone-500">Task</label>
              <select className="w-full rounded bg-noir-900 border border-noir-600 p-1 text-xs" value={seat.task} onChange={(e) => {
                const t = e.target.value as CouncilTask;
                queue({ kind: 'councilTask', seat: st, task: t, target: TASKS[t].targeted ? (seat.target ?? s.rivals.find((r) => r.kind === 'mob')?.id) : undefined });
              }}>
                {tasks.map((t) => <option key={t} value={t}>{TASKS[t].name}</option>)}
              </select>
              <div className="text-[11px] text-stone-400 mt-0.5">{TASKS[seat.task].text}</div>
              <TaskAdvice s={s} seat={st} />
              {TASKS[seat.task].targeted && (
                <select className="mt-1 w-full rounded bg-noir-900 border border-noir-600 p-1 text-xs" value={seat.target ?? ''} onChange={(e) => queue({ kind: 'councilTask', seat: st, task: seat.task, target: e.target.value })}>
                  <option value="">— pick a rival —</option>
                  {s.rivals.filter((r) => r.kind !== 'law').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
              {cands.length > 0 && (
                <button type="button" className={`mt-1.5 w-full rounded border px-2 py-1 text-xs font-semibold ${h ? 'border-noir-600 text-stone-300 hover:border-gold-500' : 'border-gold-500 text-gold-300 hover:bg-gold-500/15'}`} onClick={() => openPicker({ kind: 'seat', seat: st })} data-testid={`compare-${st}`}>
                  {h ? 'Compare candidates…' : `Appoint: compare ${cands.length} candidates…`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Vassals({ s }: { s: GameState }) {
  const list = capos(s);
  return (
    <section>
      <div className="panel-title">Capos</div>
      <p className="text-xs text-stone-500">Each capo holds a district and keeps a share of its take under his contract ({Math.round(CAPO_CUT * 100)}% is the custom). Squeeze the contract and he may refuse — and remember.</p>
      <NextCapo s={s} />
      <div className="mt-2 space-y-1.5">
        {list.map((c) => {
          const d = s.districts.find((x) => x.capoId === c.id);
          const keep = c.keep ?? CAPO_CUT;
          return (
            <div key={c.id} className="rounded-md border border-noir-700 bg-noir-800/60 p-2 flex flex-wrap gap-2 items-center">
              <Face s={s} c={c} size={40} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold"><CharLink s={s} id={c.id} /> <span className="text-xs text-stone-500 font-normal">{d ? `holds ${d.name}` : 'no district'}</span></div>
                <div className="text-[11px] text-stone-400">kicks up {Math.round((1 - keep) * 100)}% · keeps {Math.round(keep * 100)}% · skims ~{Math.round(skimRate(s, c) * 100)}% · treasury {fmt$(c.wealth)} · {regime(s, c.id).length} men</div>
                <TraitIcons c={c} />
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-stone-500">Opinion</div>
                <OpinionBadge v={opinion(s, c.id, s.playerId)} />
              </div>
              <div className="w-full grid gap-1.5 sm:grid-cols-2">
                {keep > 0.2 && <ActionCard s={s} action={{ kind: 'contract', charId: c.id, keep: Math.round((keep - 0.05) * 100) / 100 }} compact />}
                {keep < 0.45 && <ActionCard s={s} action={{ kind: 'contract', charId: c.id, keep: Math.round((keep + 0.05) * 100) / 100 }} compact />}
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div className="text-xs text-stone-500">No capos. Promote a soldier from his sheet.</div>}
      </div>
    </section>
  );
}

/** A district with no capo: who should step up, compared. */
function NextCapo({ s }: { s: GameState }) {
  const { openPicker } = useClarity();
  const d = capoDistrict(s);
  if (!d || s.gameOver) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-700/50 bg-amber-900/10 px-2.5 py-1.5 text-xs text-amber-200" data-testid="next-capo">
      <span>{d.name} has no capo: the take leaks until someone runs it.</span>
      <button type="button" className="rounded border border-gold-500 px-2 py-0.5 font-semibold text-gold-300 hover:bg-gold-500/15" onClick={() => openPicker({ kind: 'capo', district: d.id })}>Who should run it? Compare…</button>
    </div>
  );
}

function ManRow({ s, c }: { s: GameState; c: Character }) {
  const { queue } = useOrders();
  const [open, setOpen] = useState(false);
  const pol = c.policy ?? 'tax';
  const seat = seatOf(s, c.id);
  return (
    <div className="rounded-md border border-noir-700 bg-noir-800/70 px-2.5 py-2">
      <div className="flex gap-2 items-center">
        <Face s={s} c={c} size={38} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-stone-100 truncate">
            <CharLink s={s} id={c.id} />
            {c.dynasty && <span className="ml-1 text-gold-400" title="Member of the house">♦</span>}
            {(c.defectStage ?? 0) > 0 && <span className="ml-1 text-red-400 text-xs" title="Seen with a rival crew">⚠ drifting</span>}
          </div>
          <div className="text-[11px] text-stone-400">
            <span className="capitalize">{c.specialty ? SPECIALTY_INFO[c.specialty].name : c.rank}</span>
            {seat && <> · {SEAT_INFO[seat as Seat].name}</>} · {ageOn(c.birth, s.date)} yrs · own money {fmt$(c.wealth)}
            {!isFree(s, c) && <span className="text-red-400"> · jailed to wk {c.imprisonedUntil}</span>}
            {(c.neglect ?? 0) >= 8 && <span className="text-amber-400"> · ignored {c.neglect} wks</span>}
          </div>
        </div>
        <OpinionBadge v={opinion(s, c.id, s.playerId)} />
      </div>
      {!c.specialty && (
        <div className="mt-1.5 flex flex-wrap gap-1 items-center">
          <span className="text-[11px] text-stone-500 mr-1">Hustle:</span>
          {(['tax', 'earn', 'squeeze'] as CrewPolicy[]).map((p) => (
            <button key={p} onClick={() => p !== pol && queue({ kind: 'policy', charId: c.id, policy: p })} className={`rounded px-2 py-0.5 text-[11px] border ${p === pol ? 'bg-gold-500 text-noir-950 border-gold-400' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>
              {POLICY_LABEL[p]}
            </button>
          ))}
          <button className="ml-auto text-[11px] text-stone-500 underline" onClick={() => setOpen(!open)}>{open ? 'less' : 'traits'}</button>
        </div>
      )}
      {open && <div className="mt-1"><TraitIcons c={c} labels /></div>}
    </div>
  );
}

function HirePool({ s }: { s: GameState }) {
  return (
    <section>
      <div className="panel-title">For hire this month</div>
      <p className="text-xs text-stone-500">Young men who want in, and specialists who work for a weekly fee. A new list every month.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {s.hirePool.map((h) => (
          <div key={h.id}>
            <ActionCard s={s} action={{ kind: 'hire', specId: h.id }} label={`${h.firstName} ${h.lastName} — ${h.kind === 'recruit' ? 'recruit' : SPECIALTY_INFO[h.kind].name} · ${fmt$(h.cost)}`} />
            <div className="text-[11px] text-stone-500 px-1">{h.traits.join(', ')}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Edicts({ s }: { s: GameState }) {
  return (
    <section>
      <div className="panel-title">Edicts</div>
      <p className="text-xs text-stone-500">Standing orders to the whole family.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {(Object.keys(EDICTS) as EdictId[]).map((e) => (
          <div key={e} className={s.edicts[e] ? 'ring-1 ring-gold-500 rounded-md' : ''}>
            <ActionCard s={s} action={{ kind: 'edict', edict: e, on: !s.edicts[e] }} />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-stone-600 mt-2">{crew(s).length} men in the family · {displayName(s.characters[s.playerId])} at the head.</p>
    </section>
  );
}

/** One part of the old Administration screen on its own (the shell's Borgata drawer). */
export function CrewListPart({ s, part }: { s: GameState; part: 'council' | 'capos' | 'men' | 'hire' | 'edicts' }) {
  const men = crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate').sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
  if (part === 'council') return <Council s={s} />;
  if (part === 'capos') return <Vassals s={s} />;
  if (part === 'hire') return <HirePool s={s} />;
  if (part === 'edicts') return <Edicts s={s} />;
  return (
    <section>
      <div className="panel-title">The men</div>
      <p className="text-xs text-stone-500">Soldiers and associates hustle for themselves. You decide how much of it comes to you. Men nobody talks to start drifting toward rivals.</p>
      <div className="mt-2 space-y-1.5">{men.map((c) => <ManRow key={c.id} s={s} c={c} />)}</div>
    </section>
  );
}
