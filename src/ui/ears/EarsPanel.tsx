import { useState } from 'react';
import { StandingButton } from '../appts/Standing';
import { ageOn } from '../../engine/calendar';
import { earViews, madamOf, trustWord } from '../../engine/ears';
import { BOUNDARY_TEXT, CUT_INFO, GOAL_TEXT, WORK_LABEL, type CutTier } from '../../engine/earsState';
import { opinionBreakdown } from '../../engine/relations';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { Tip } from '../clarity';
import { fmt$, sinceWeek } from '../format';
import { ConnectionsList } from './Connections';
import { DatingLink } from '../dating/DatingPanel';

function Meter({ label, value, tone, tip, shown }: { label: string; value: number; tone: string; tip?: string; shown?: string }) {
  const body = (
    <div className="rounded border border-noir-700 bg-noir-800/70 p-2">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{label}</div>
      <div className="text-lg font-semibold text-stone-100 tabular-nums">{shown ?? Math.round(value)}</div>
      <div className="h-1.5 rounded bg-noir-700 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
    </div>
  );
  return tip ? <Tip text={tip}>{body}</Tip> : body;
}

/** The Madam: her house, her public face, where the friendship stands, what you can do. */
export function MadamCard({ s }: { s: GameState }) {
  const E = s.ears;
  const m = madamOf(s);
  if (!E || !m) return null;
  const M = E.madam;
  const { total, mods } = opinionBreakdown(s, m.id, s.playerId);
  const ally = M.ally ? s.rivals.find((r) => r.id === M.ally) : undefined;
  const sq = M.squeeze;
  const paused = (M.cutPausedUntil ?? 0) > s.week;
  return (
    <div className="space-y-3" data-testid="madam-card">
      <div className="flex gap-3">
        <Face s={s} c={m} size={72} />
        <div className="min-w-0">
          <div className="font-display text-xl text-gold-400"><CharLink s={s} id={m.id} /></div>
          <div className="text-xs text-stone-400">Head of {M.house} · age {ageOn(m.birth, s.date)} · {sinceWeek(M.since).toLowerCase()}</div>
          <div className="text-sm text-stone-300 mt-1">
            In public: owns <b>{M.hotel}</b> and <b>{M.club}</b>, books acts through <b>{M.agency}</b>, sits on the board of {M.charity}. In private she runs most of the women who work the island's nights, and she is nobody's employee, yours included.
          </div>
        </div>
      </div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <Meter label="Her opinion of you" value={50 + total / 2} shown={`${total > 0 ? '+' : ''}${total}`} tone={total >= 0 ? 'bg-emerald-500' : 'bg-blood-400'} tip={`${total >= 0 ? '+' : ''}${total}: ${mods.slice(0, 5).map((x) => `${x.value > 0 ? '+' : ''}${x.value} ${x.reason}`).join(' · ') || 'nothing yet'}`} />
        <Meter label="Her network" value={M.network} tone="bg-rose-400" tip="How many women work through her house. It grows when the girls feel safe." />
        <div className="rounded border border-noir-700 bg-noir-800/70 p-2 text-xs">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Protection cut</div>
          <div className="text-stone-100 text-sm">{CUT_INFO[M.cut].name}</div>
          <div className="text-stone-400">{paused || ally ? 'Not coming in right now' : `${fmt$(CUT_INFO[M.cut].weekly)}/wk base`}</div>
        </div>
        <div className="rounded border border-noir-700 bg-noir-800/70 p-2 text-xs">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Between you</div>
          <div className="text-stone-200">{M.intel ? 'You share what you hear' : 'No news traded'}</div>
          <div className="text-stone-200">{M.venture ? (M.venture.kind === 'stake' ? `A stake in ${M.hotel}` : 'Her people at your motel') : 'No venture'}</div>
          <div className="text-stone-200">{M.favors ? `She owes you ${M.favors} favor${M.favors > 1 ? 's' : ''}` : 'She owes you nothing'}</div>
        </div>
      </div>
      {ally && <div className="text-sm text-red-300">She has thrown in with {ally.shortName}. Her girls are cooler to you, and her cut has stopped.</div>}
      {sq && <div className="text-sm text-amber-300">She is being squeezed by {sq.by === 'rival' ? s.rivals.find((r) => r.id === sq.rival)?.shortName : sq.by === 'law' ? 'the vice squad' : <CharLink s={s} id={sq.who} />}: {sq.left} week{sq.left === 1 ? '' : 's'} before it costs her.</div>}
      <div className="text-xs text-stone-400">
        Lieutenants: {M.lieutenants.map((id, i) => <span key={id}>{i ? ', ' : ''}<CharLink s={s} id={id} />{id === M.successorId ? ' (her successor)' : ''}</span>)}
        {M.past.length > 0 && <> · Before her: {M.past.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<CharLink s={s} id={p.id} /> ({p.why})</span>)}</>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ActionCard s={s} action={{ kind: 'ears', op: { op: 'madamCall' } }} />
        <ActionCard s={s} action={{ kind: 'ears', op: { op: 'madamIntel', on: !M.intel } }} />
        {([0, 1, 2, 3] as CutTier[]).filter((t) => t !== M.cut).map((t) => <ActionCard key={t} s={s} compact action={{ kind: 'ears', op: { op: 'madamCut', tier: t } }} />)}
        {!M.venture && <ActionCard s={s} action={{ kind: 'ears', op: { op: 'madamVenture', kind: 'stake' } }} />}
        {!M.venture && <ActionCard s={s} compact action={{ kind: 'ears', op: { op: 'madamVenture', kind: 'motel' } }} />}
      </div>
    </div>
  );
}

/** Your Ears: who she is, where she works, how far she trusts you, her lines. */
export function EarsList({ s }: { s: GameState }) {
  const views = earViews(s);
  const unknown = Object.values(s.ears?.ears ?? {}).filter((e) => !e.known && e.status !== 'gone').length;
  return (
    <div className="space-y-2" data-testid="ears-list">
      {!views.length && <p className="text-sm text-stone-400">You don't know any of them yet. The Madam can make an introduction; or one will come to you with something in her pocket.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {views.map(({ ear: e, c, job, bio }) => (
          <div key={e.id} className={`rounded-md border p-2 ${e.status === 'gone' ? 'border-noir-800 opacity-60' : 'border-noir-700 bg-noir-800/60'}`} data-testid="ear-card">
            <div className="flex gap-2">
              <Face s={s} c={c} size={44} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-stone-100 truncate"><CharLink s={s} id={c.id} /></div>
                <div className="text-[11px] text-stone-400">{WORK_LABEL[e.work]} at {e.venue} · {e.network === 'madam' ? 'the Madam\'s' : 'on her own'}</div>
                <div className="text-[11px]">
                  <Tip text={`Trust ${e.loyalty} · nerve ${e.nerve} · discretion ${e.discretion} · charm ${e.charm} · her prices ×${e.greed.toFixed(2)} · paid ${fmt$(e.paid)} so far`}>
                    <span className={`underline decoration-dotted ${e.loyalty >= 55 ? 'text-emerald-300' : e.loyalty >= 30 ? 'text-amber-300' : 'text-red-300'}`}>{trustWord(e.loyalty)}</span>
                  </Tip>
                  <span className="text-stone-500"> · she {GOAL_TEXT[e.goal]}</span>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-stone-500 italic mt-1">{bio}</div>
            {e.boundaries.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{e.boundaries.map((b) => <span key={b} className="rounded border border-noir-600 px-1.5 py-0.5 text-[10px] text-stone-300" title="Her line. She will not cross it, for any price.">{BOUNDARY_TEXT[b]}</span>)}</div>}
            {e.status === 'gone' && <div className="text-[11px] text-stone-400 mt-1">{e.left?.why ?? 'Gone'}{e.left ? ` (week ${e.left.week})` : ''}</div>}
            {job && <div className="text-[11px] text-sky-300 mt-1">Working: {job.mode === 'close' ? 'getting close to' : 'a dance for'} <CharLink s={s} id={job.targetId} /> · back in {Math.max(0, job.due - s.week)} wk</div>}
            {e.protectedFrom && <div className="text-[11px] text-emerald-300 mt-1">Under your protection</div>}
            {e.underOp && !e.protectedFrom && <div className="text-[11px] text-amber-300 mt-1">Someone leans on her: <CharLink s={s} id={e.underOp} /></div>}
            {e.status !== 'gone' && (
              <>
                <div className="mt-1"><ConnectionsList s={s} id={c.id} compact /></div>
                <div className="mt-1.5 grid gap-1.5">
                  <ActionCard s={s} compact action={{ kind: 'ears', op: { op: 'meet', earId: e.id } }} />
                  <ActionCard s={s} compact action={{ kind: 'ears', op: { op: 'retain', earId: e.id } }} />
                  <StandingButton who={e.id} action={{ kind: 'ears', op: { op: 'meet', earId: e.id } }} label="Make it a standing meet (daily or weekly)…" className="text-left text-[11px] text-gold-400 hover:text-gold-300" testid="ear-standing" />
                  {e.underOp && !e.protectedFrom && <ActionCard s={s} compact action={{ kind: 'ears', op: { op: 'protect', earId: e.id } }} />}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {unknown > 0 && <p className="text-xs text-stone-500">There are others who listen ({unknown}). You will meet them when they come to you.</p>}
      <p className="text-xs text-stone-500">To ask one of them about a man, right-click him anywhere: <i>The Ears → Can you get close to him?</i></p>
    </div>
  );
}

/** Men who exploit women: enemies only. */
export function OperatorsPanel({ s }: { s: GameState }) {
  const ops = Object.values(s.ears?.ops ?? {}).filter((o) => o.stage !== 'waiting');
  return (
    <div className="space-y-3" data-testid="operators">
      <p className="text-sm text-stone-400">Men who keep women with debt and fear. It is not your racket and never will be. Take them down and the Madam, and every girl on the island, remembers who did it.</p>
      {!ops.length && <p className="text-sm text-stone-500">Nobody like that on the island right now.</p>}
      {ops.map((o) => {
        const c = s.characters[o.id];
        return (
          <div key={o.id} className={`rounded-md border p-2 ${o.stage === 'gone' ? 'border-noir-800 opacity-70' : 'border-blood-500/50 bg-noir-800/60'}`}>
            <div className="flex gap-2">
              {c && <Face s={s} c={c} size={44} />}
              <div className="min-w-0">
                <div className="text-sm text-stone-100"><CharLink s={s} id={o.id} /></div>
                <div className="text-[11px] text-stone-400">{o.stage === 'gone' ? `Finished: ${o.outcome}` : `Out of ${o.base}: he ${o.racket}.`}</div>
              </div>
            </div>
            {o.stage === 'active' && (
              <>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Meter label="His hold" value={o.strength} tone="bg-blood-400" />
                  <Meter label="Proof (60 to expose)" value={o.exposure} tone="bg-sky-500" />
                </div>
                <div className="grid gap-1.5 mt-2 sm:grid-cols-2">
                  {(['opDig', 'opMadam', 'opExpose', 'opRunoff'] as const).map((op) => <ActionCard key={op} s={s} compact action={{ kind: 'ears', op: { op, opId: o.id } }} />)}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The drawer section: the Madam, the Ears, the operators, what came in lately. */
export function NightPanel({ s }: { s: GameState }) {
  const [tab, setTab] = useState<'madam' | 'ears' | 'ops' | 'notes'>('madam');
  if (!s.ears) return <p className="text-sm text-stone-400" data-testid="night-panel">The night has not opened yet.</p>;
  const tabs: [typeof tab, string][] = [['madam', 'The Madam'], ['ears', 'The Ears'], ['ops', 'Operators'], ['notes', 'What came in']];
  const jobs = s.ears.jobs;
  return (
    <div className="space-y-3" data-testid="night-panel">
      <p className="text-xs text-stone-500">Everything here happens off-screen: a set-up, then a report. Every woman decides for herself what she does, for whom, and for how much.</p>
      <DatingLink s={s} tab="adult" text="the clubs and the street: who offers company, her price, which account pays" />
      <nav className="flex flex-wrap gap-1">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} data-testid={`night-tab-${id}`} className={`rounded px-2 py-1 text-xs font-semibold ${tab === id ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`}>{label}</button>
        ))}
      </nav>
      {jobs.length > 0 && (
        <div className="text-[11px] text-sky-300">
          In motion: {jobs.map((j, i) => <span key={j.id}>{i ? ' · ' : ''}{s.characters[j.earId]?.firstName} on <CharLink s={s} id={j.targetId} /> ({Math.max(0, j.due - s.week)} wk)</span>)}
        </div>
      )}
      {tab === 'madam' && <MadamCard s={s} />}
      {tab === 'ears' && <EarsList s={s} />}
      {tab === 'ops' && <OperatorsPanel s={s} />}
      {tab === 'notes' && (
        <ul className="space-y-1 text-sm text-stone-300">
          {[...s.ears.notes].reverse().map(([w, t], i) => <li key={i}><span className="text-stone-500 text-xs tabular-nums mr-2">wk {w}</span>{t}</li>)}
          {!s.ears.notes.length && <li className="text-stone-500">Nothing yet.</li>}
        </ul>
      )}
    </div>
  );
}
