import { useMemo, useState } from 'react';
import { crew, displayName } from '../../engine/characters';
import {
  activeGuards, ageOf, assignmentsFor, consentOf, dutyLine, GUARD_ATTR_LABEL, guardAttrs, isMinor, protectBill, protectLog, protectionFor,
  recommendGuards, reportsAbout, reportsFor, type Assignment, type GuardAttrs, type ProtectAction, type Report,
} from '../../engine/protect';
import { KIND_INFO, PROT_KINDS, PURPOSE_INFO, PURPOSES, SHIFT_INFO, SHIFTS, type InvPurpose, type ProtKind, type Remit, type Shift } from '../../engine/protectData';
import type { Character, GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { Face } from '../components/People';
import { useShell } from '../shell/context';
import { fmt$ } from '../format';

/**
 * The Borgata › Guards & inquiries (engine/protect.ts): the central screen for
 * protection and intelligence. Who is guarding whom and on what schedule, the
 * wages, the reviews, the inquiries running, the reports you are allowed to
 * read (observation apart from interpretation, with the source, its
 * reliability, the innocent explanations, whether the subject knows and an
 * adviser's word), and the window to assign a guard or start an inquiry.
 * How anyone is watched stays off-screen.
 */

/** The person a profile's "Assign protection…" opened the screen for (read once, at mount). */
let pendingSubject: string | undefined;
export function openProtectionFor(id: string): void {
  pendingSubject = id;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const name = (s: GameState, id: string) => (id === s.playerId ? 'You' : s.characters[id] ? displayName(s.characters[id]) : '?');

/** The people a boss would think to guard: himself, his family, his capos, his goomars. */
function protectees(s: GameState): Character[] {
  const boss = s.characters[s.playerId];
  const ids = new Set<string>([s.playerId]);
  if (boss?.spouseId) ids.add(boss.spouseId);
  for (const k of boss?.childrenIds ?? []) ids.add(k);
  for (const g of Object.values(s.nightlife?.goomars ?? {})) if (!g.ended) ids.add(g.id);
  for (const c of Object.values(s.characters)) if (c.alive && c.dynasty) ids.add(c.id);
  for (const c of crew(s)) if (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere') ids.add(c.id);
  return [...ids].map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
}

/** Adults you could have looked into: your crew, your wife, rival bosses, the people you know. */
function subjects(s: GameState): Character[] {
  const out = new Map<string, Character>();
  for (const c of crew(s)) out.set(c.id, c);
  const boss = s.characters[s.playerId];
  if (boss?.spouseId && s.characters[boss.spouseId]?.alive) out.set(boss.spouseId, s.characters[boss.spouseId]);
  for (const r of s.rivals) { const L = s.characters[r.leaderId]; if (L?.alive) out.set(L.id, L); }
  for (const id of Object.keys(s.dating?.bonds ?? {})) { const c = s.characters[id]; if (c?.alive) out.set(id, c); }
  for (const id of Object.keys(s.bonds?.ties ?? {})) { const c = s.characters[id]; if (c?.alive) out.set(id, c); }
  return [...out.values()].filter((c) => c.id !== s.playerId && !isMinor(s, c)).sort((a, b) => a.lastName.localeCompare(b.lastName));
}

function Attrs({ s, c }: { s: GameState; c: Character }) {
  const g = guardAttrs(s, c);
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-stone-400" data-testid="guard-attrs">
      {(Object.keys(g) as (keyof GuardAttrs)[]).map((k) => <span key={k}>{GUARD_ATTR_LABEL[k]} <span className={g[k] >= 60 ? 'text-emerald-300' : g[k] < 40 ? 'text-red-300' : 'text-stone-200'}>{g[k]}</span></span>)}
    </div>
  );
}

export function ReportCard({ s, r }: { s: GameState; r: Report }) {
  const subj = s.characters[r.subject];
  const adv = r.adviser ? s.characters[r.adviser] : undefined;
  const conf = r.confidence === 'high' ? 'text-emerald-300' : r.confidence === 'moderate' ? 'text-amber-300' : 'text-stone-400';
  return (
    <div className="rounded-md border border-noir-700 bg-noir-900/60 p-2.5 font-mono text-[11px] leading-snug text-stone-300" data-testid="protect-report">
      <div className="text-stone-100">SUBJECT: {subj ? displayName(subj) : '?'}{subj?.rank && subj.rank !== 'civilian' ? ` — ${subj.rank.charAt(0).toUpperCase()}${subj.rank.slice(1)}` : ''}</div>
      <div>Status: {r.status === 'inconclusive' ? 'Inconclusive' : 'Report received'} <span className="text-stone-500">(week {r.w}, {r.purpose === 'guard' ? 'from the guard' : PURPOSE_INFO[r.purpose].name.toLowerCase()})</span></div>
      <div className="mt-1"><span className="text-stone-500">Observation:</span> {r.observation}</div>
      <div><span className="text-stone-500">Interpretation:</span> {r.interpretation}</div>
      <div><span className="text-stone-500">Confidence:</span> <span className={conf}>{r.confidence.charAt(0).toUpperCase() + r.confidence.slice(1)}</span></div>
      <div><span className="text-stone-500">Source:</span> {r.source} · <span className="text-stone-500">reliability</span> <span className={r.reliability === 'shaky' ? 'text-red-300' : r.reliability === 'mixed' ? 'text-amber-300' : 'text-emerald-300'}>{r.reliability}</span></div>
      {r.alternatives.length > 0 && <div><span className="text-stone-500">Alternative explanation{r.alternatives.length > 1 ? 's' : ''}:</span> {r.alternatives.join('; ')}.</div>}
      <div><span className="text-stone-500">Does {subj?.firstName ?? 'the subject'} know:</span> {r.subjectKnows === 'yes' ? 'Yes' : r.subjectKnows === 'suspects' ? 'May suspect' : 'Not as far as anyone can tell'}</div>
      <div><span className="text-stone-500">What you can conclude:</span> {r.conclusion}</div>
      <div className="mt-1 text-gold-300"><span className="text-stone-500">Adviser's recommendation{adv ? ` (${adv.firstName})` : ''}:</span> {r.advice}</div>
    </div>
  );
}

function AsgRow({ s, a }: { s: GameState; a: Assignment }) {
  const shell = useShell();
  const men = a.agents.map((id) => s.characters[id]).filter((c): c is Character => !!c);
  const subj = s.characters[a.subjects[0]];
  const mine = a.by === s.playerId;
  const left = a.until - s.week;
  return (
    <li className="rounded-md border border-noir-700 bg-noir-800/60 p-2 text-xs" data-testid="protect-asg">
      <div className="flex flex-wrap items-center gap-2">
        {men.map((m) => <Face key={m.id} s={s} c={m} size={32} />)}
        <span className="text-stone-500">→</span>
        {subj && <Face s={s} c={subj} size={32} />}
        <div className="min-w-[10rem] flex-1">
          <div className="text-stone-100">{a.type === 'protect' ? `${KIND_INFO[a.kind!].name}: ${men.map((m) => m.firstName).join(', ')} on ${name(s, a.subjects[0])}` : `${PURPOSE_INFO[a.purpose!].name}: ${men[0]?.firstName ?? '?'} on ${name(s, a.subjects[0])}`}</div>
          <div className="text-[11px] text-stone-400">
            {a.type === 'protect' ? `${SHIFT_INFO[a.shift].name}` : 'Reports every two weeks'} · {fmt$(a.wage)}/wk{a.limit ? ` (limit ${fmt$(a.limit)}, spent ${fmt$(a.spent)})` : a.spent ? ` (spent ${fmt$(a.spent)})` : ''} · {a.status === 'active' ? `${left} week${left === 1 ? '' : 's'} left, review week ${a.review}` : `ended week ${a.ended?.w}: ${a.ended?.why}`}
          </div>
          <div className="text-[11px] text-stone-500">
            {!mine && `Ordered by ${name(s, a.by)}. `}
            {a.type === 'protect' && (a.consent === 'objected' ? `${subj?.firstName} did not want it. ` : a.consent === 'guardian' ? 'Guardian-approved. ' : a.consent === 'agreed' ? `${subj?.firstName} agreed. ` : '')}
            {a.type === 'protect' && (a.remit === 'monitor' ? 'He reports on her private life too. ' : 'Safety only. ')}
            {a.known !== undefined && <span className="text-red-300">{subj?.firstName} found out (week {a.known}). </span>}
            Reports to {a.reportsTo.map((id) => name(s, id)).join(', ')}.
          </div>
        </div>
        {a.district && <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => shell.focus({ district: a.district, level: 'wildwood' })} data-testid="protect-on-map">On the map</button>}
      </div>
      {mine && a.status === 'active' && (
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          <ActionCard s={s} compact action={{ kind: 'protect', op: { op: 'renew', id: a.id, weeks: 8 } }} />
          <ActionCard s={s} compact action={{ kind: 'protect', op: { op: 'end', id: a.id } }} />
        </div>
      )}
    </li>
  );
}

function AssignWindow({ s, initial }: { s: GameState; initial?: string }) {
  const people = protectees(s);
  const [subject, setSubject] = useState<string>(() => (initial && s.characters[initial] ? initial : s.playerId));
  const subj = s.characters[subject];
  const child = isMinor(s, subj);
  const [kind, setKind] = useState<ProtKind>(subject === s.playerId ? 'bodyguard' : child ? 'family' : 'driver');
  const [shift, setShift] = useState<Shift>('day');
  const [weeks, setWeeks] = useState(8);
  const [review, setReview] = useState(4);
  const [limit, setLimit] = useState(0);
  const [remit, setRemit] = useState<Remit>('safety');
  const [insist, setInsist] = useState(false);
  const [reportsTo, setReportsTo] = useState<'me' | 'them' | 'both'>('me');
  const recs = useMemo(() => recommendGuards(s, subject, shift, 3), [s, subject, shift]);
  const [who, setWho] = useState<string[]>([]);
  const men = who.length ? who : recs[0] ? [recs[0].guard.id] : [];
  const pool = crew(s).filter((c) => c.id !== subject && !c.specialty && (c.rank === 'soldier' || c.rank === 'associate' || c.rank === 'capo'));
  const consent = consentOf(s, subject, kind);
  const action: ProtectAction = { op: 'guard', subject, who: men, kind, shift, weeks: kind === 'event' ? 1 : weeks, review, ...(limit ? { limit } : {}), remit: child ? 'safety' : remit, insist, reportsTo };
  const cover = protectionFor(s, subject);
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5 space-y-2 text-xs" data-testid="assign-protection">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Assign protection</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">Who is protected
          <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1" value={subject} onChange={(e) => { setSubject(e.target.value); setWho([]); }} data-testid="protect-subject">
            {people.map((c) => <option key={c.id} value={c.id}>{c.id === s.playerId ? 'You' : `${displayName(c)}${isMinor(s, c) ? ` (age ${ageOf(s, c)})` : ''}`}</option>)}
          </select>
        </label>
        <label className="block">What kind
          <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1" value={kind} onChange={(e) => setKind(e.target.value as ProtKind)}>
            {PROT_KINDS.map((k) => <option key={k} value={k}>{KIND_INFO[k].name} — {KIND_INFO[k].suits}</option>)}
          </select>
        </label>
        <label className="block">Schedule
          <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1" value={shift} onChange={(e) => setShift(e.target.value as Shift)} disabled={kind === 'event'}>
            {SHIFTS.map((x) => <option key={x} value={x}>{SHIFT_INFO[x].name}</option>)}
          </select>
        </label>
        <label className="block">Duration and review
          <div className="mt-0.5 flex gap-1">
            <input type="number" min={1} max={52} className="w-16 rounded bg-noir-900 border border-noir-600 p-1" value={kind === 'event' ? 1 : weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))} aria-label="Weeks" />
            <span className="self-center text-stone-500">weeks, review in</span>
            <input type="number" min={1} max={52} className="w-14 rounded bg-noir-900 border border-noir-600 p-1" value={review} onChange={(e) => setReview(Math.max(1, Math.min(52, Number(e.target.value) || 1)))} aria-label="Review in weeks" />
          </div>
        </label>
        <label className="block">Spending limit (whole assignment, 0 = none)
          <input type="number" min={0} step={100} className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1" value={limit} onChange={(e) => setLimit(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label className="block">Who receives reports
          <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1" value={reportsTo} onChange={(e) => setReportsTo(e.target.value as 'me' | 'them' | 'both')} disabled={subject === s.playerId}>
            <option value="me">You</option><option value="them">{subj?.firstName ?? 'Them'}</option><option value="both">Both of you</option>
          </select>
        </label>
      </div>
      {!child && subject !== s.playerId && (
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-1"><input type="radio" checked={remit === 'safety'} onChange={() => setRemit('safety')} /> Safety only: what is private stays private</label>
          <label className="flex items-center gap-1"><input type="radio" checked={remit === 'monitor'} onChange={() => setRemit('monitor')} /> Report {subj?.gender === 'F' ? 'her' : 'his'} private life too</label>
        </div>
      )}
      <div className={consent.consent === 'objected' ? 'text-amber-300' : 'text-stone-400'} data-testid="protect-consent">
        {child ? `${subj?.firstName} is a child: guardian-approved safety only. ${consent.why}.` : `${consent.why}.`}
        {!child && consent.consent === 'objected' && <label className="ml-2 inline-flex items-center gap-1"><input type="checkbox" checked={insist} onChange={(e) => setInsist(e.target.checked)} /> Insist anyway</label>}
      </div>
      {recs[0] && (
        <div className="rounded border border-gold-600/40 bg-gold-500/5 p-2 text-stone-300" data-testid="protect-rec">
          <span className="text-gold-300">{recs[0].adviser ? `${recs[0].adviser.firstName}, your ${recs[0].adviser.rank}:` : 'Your own judgment:'}</span> "{recs[0].line}"
        </div>
      )}
      <div>
        <div className="text-stone-500">Guard or team (up to three) · on {subj?.firstName ?? '?'} now: {activeGuards(s, subject).map((x) => x.guard.firstName).join(', ') || 'nobody'}{cover.cut ? ` (−${pct(cover.cut)})` : ''}</div>
        <ul className="mt-1 max-h-64 overflow-y-auto space-y-1">
          {pool.map((c) => {
            const on = men.includes(c.id);
            const duty = dutyLine(s, c.id);
            return (
              <li key={c.id} className={`flex items-start gap-2 rounded border p-1 ${on ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700'}`}>
                <input type="checkbox" checked={on} onChange={() => setWho((w) => { const cur = w.length ? w : men; return cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id].slice(-3); })} aria-label={`Guard: ${c.firstName}`} />
                <div className="flex-1">
                  <div className="text-stone-200">{displayName(c)} <span className="text-stone-500">{c.rank}{duty ? ` · ${duty}` : ''}</span></div>
                  <Attrs s={s} c={c} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <ActionCard s={s} action={{ kind: 'protect', op: action }} />
    </section>
  );
}

function InquiryWindow({ s }: { s: GameState }) {
  const list = subjects(s);
  const [subject, setSubject] = useState<string>(list[0]?.id ?? '');
  const [purpose, setPurpose] = useState<InvPurpose>('money');
  const [weeks, setWeeks] = useState(6);
  const pool = crew(s).filter((c) => c.id !== subject && !c.specialty && c.rank !== 'capo');
  const [who, setWho] = useState<string>('');
  const man = who || pool[0]?.id || '';
  if (!list.length) return null;
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5 space-y-2 text-xs" data-testid="assign-inquiry">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Have someone looked into</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">Who
          <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1" value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="inquiry-subject">
            {list.map((c) => <option key={c.id} value={c.id}>{displayName(c)}</option>)}
          </select>
        </label>
        <label className="block">Why
          <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1" value={purpose} onChange={(e) => setPurpose(e.target.value as InvPurpose)}>
            {PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_INFO[p].name}</option>)}
          </select>
        </label>
        <label className="block">Who looks
          <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1" value={man} onChange={(e) => setWho(e.target.value)}>
            {pool.map((c) => <option key={c.id} value={c.id}>{displayName(c)} ({c.rank})</option>)}
          </select>
        </label>
        <label className="block">For how long (weeks)
          <input type="number" min={2} max={26} className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1" value={weeks} onChange={(e) => setWeeks(Math.max(2, Math.min(26, Number(e.target.value) || 2)))} />
        </label>
      </div>
      <div className="text-stone-500">Can turn up: {PURPOSE_INFO[purpose].finds}. Only what is really there; it may come back with nothing.</div>
      {subject && man && <ActionCard s={s} action={{ kind: 'protect', op: { op: 'investigate', subject, purpose, who: man, weeks } }} />}
    </section>
  );
}

export function Protection({ s }: { s: GameState }) {
  const [initial] = useState(() => { const x = pendingSubject; pendingSubject = undefined; return x; });
  const list = assignmentsFor(s);
  const live = list.filter((a) => a.status === 'active');
  const done = list.filter((a) => a.status !== 'active').slice(-6);
  const reports = reportsFor(s).slice().reverse();
  const log = protectLog(s).slice().reverse();
  return (
    <div className="space-y-4" data-testid="protection">
      <div className="text-xs text-stone-400">
        Guards cost {fmt$(protectBill(s))} a week. Protection takes a share off the danger; it never makes anyone safe. A man on a detail is off his other work.
      </div>
      <section>
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Running now</div>
        {live.length === 0 ? <div className="mt-1 text-xs text-stone-500">Nobody is on anybody.</div> : <ul className="mt-1 space-y-1.5">{live.map((a) => <AsgRow key={a.id} s={s} a={a} />)}</ul>}
      </section>
      <section>
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Reports you can read</div>
        {reports.length === 0 ? <div className="mt-1 text-xs text-stone-500">Nothing yet.</div> : <div className="mt-1 space-y-1.5">{reports.slice(0, 12).map((r) => <ReportCard key={r.id} s={s} r={r} />)}</div>}
      </section>
      <AssignWindow s={s} initial={initial} />
      <InquiryWindow s={s} />
      {done.length > 0 && (
        <section>
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Ended</div>
          <ul className="mt-1 space-y-1.5">{done.map((a) => <AsgRow key={a.id} s={s} a={a} />)}</ul>
        </section>
      )}
      {log.length > 0 && (
        <section>
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">The record</div>
          <ul className="mt-1 space-y-0.5 text-xs text-stone-400">{log.slice(0, 20).map((l, i) => <li key={i}><span className="text-stone-600">Wk {l.w}</span> {l.t}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

/** On a character's sheet: who guards him, what he is on, the reports about him you may read. */
export function ProtectSection({ s, c }: { s: GameState; c: Character }) {
  const shell = useShell();
  const guards = activeGuards(s, c.id).filter((x) => assignmentsFor(s).includes(x.asg));
  const duty = dutyLine(s, c.id);
  const reps = reportsAbout(s, c.id);
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5 text-xs text-stone-300 space-y-1" data-testid="sheet-protect">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Protection & intelligence</div>
      <div>{guards.length ? `Guarded by ${guards.map((x) => `${x.guard.firstName} (${SHIFT_INFO[x.asg.shift].name.toLowerCase()})`).join(', ')}.` : 'Nobody guards ' + (c.id === s.playerId ? 'you.' : `${c.gender === 'F' ? 'her' : 'him'}.`)}</div>
      {duty && <div className="text-stone-400">{duty}.</div>}
      {reps.slice(-2).map((r) => <ReportCard key={r.id} s={s} r={r} />)}
      <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => { openProtectionFor(c.id); shell.go('borgata.protect'); }} data-testid="sheet-assign-protection">Assign protection…</button>
    </section>
  );
}
