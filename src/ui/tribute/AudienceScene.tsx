import { useMemo, useState } from 'react';
import { alwaysOn } from '../../engine/delegation';
import { setAlways } from '../../engine/lieutenants';
import { Overlay } from '../components/Modal';
import { useShell } from '../shell/context';
import { formatDate, dateOfWeek } from '../../engine/calendar';
import { displayName } from '../../engine/characters';
import { obligations, UB_TYPE_LABEL } from '../../engine/tribute';
import { normSplit, REASON_LABEL, splitText, type CrewLine, type MemberLine, type Split, type TributeReport } from '../../engine/tributeState';
import type { EventInstance, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { Face } from '../components/People';
import { CharLink } from '../components/People';
import { EnvelopeSplit, splitDollars } from './EnvelopeSplit';
import type { EnvelopeChoice } from '../../engine/tributeOps';
import { OFFICE_ART } from './officeArt';

const pct = (bp: number) => `${Math.round(bp / 100)}%`;

function MemberRow({ s, m, kept, prevUp }: { s: GameState; m: MemberLine; kept?: number; prevUp?: number }) {
  const c = s.characters[m.id];
  const short = Math.max(0, m.due - m.paid);
  const up = m.paid + (m.back ?? 0);
  const d = prevUp === undefined ? undefined : up - prevUp;
  return (
    <tr className="border-t border-noir-800 text-[11px]" data-testid="member-row">
      <td className="py-0.5 pr-2"><CharLink s={s} id={m.id}>{c ? `${c.firstName} ${c.lastName}` : m.id}</CharLink> <span className="text-stone-500">{c?.rank}</span></td>
      <td className="pr-2 text-stone-400">{m.terms}</td>
      <td className="pr-2 text-right tabular-nums text-stone-300">{fmt$(m.earned)}</td>
      <td className="pr-2 text-right tabular-nums">{fmt$(m.due)}</td>
      <td className="pr-2 text-right tabular-nums text-gold-300">{fmt$(m.paid)}{m.back ? <span className="text-emerald-400"> +{fmt$(m.back)}</span> : null}</td>
      <td className={`pr-2 text-right tabular-nums ${short ? 'text-red-300' : 'text-stone-600'}`}>{short ? fmt$(short) : '—'}</td>
      <td className="pr-2 text-right tabular-nums text-stone-300">{kept !== undefined ? fmt$(kept) : '—'}</td>
      <td className={`pr-2 text-right tabular-nums ${d === undefined || d === 0 ? 'text-stone-600' : d > 0 ? 'text-emerald-400' : 'text-red-300'}`}>{d === undefined ? 'new' : d === 0 ? '=' : `${d > 0 ? '+' : '−'}${fmt$(Math.abs(d))}`}</td>
      <td className="text-stone-400">
        {short > 0 && (
          <span>
            says <i>{REASON_LABEL[m.said ?? 'bad_week']}</i>
            {m.believed && m.believed !== m.said && <> · he believes <i>{REASON_LABEL[m.believed]}</i></>}
            {m.revealed && m.truth && <> · <b className="text-gold-300">truth: {REASON_LABEL[m.truth]}</b></>}
          </span>
        )}
      </td>
    </tr>
  );
}

export function CrewTable({ s, rep, open, onToggle }: { s: GameState; rep: TributeReport; open?: string; onToggle?: (id: string) => void }) {
  const crews = rep.crews.filter((x) => x.due > 0 || x.remitted > 0);
  const [all, setAll] = useState(false);
  const prev = s.tribute?.reports.filter((r) => r.week < rep.week).slice(-1)[0];
  const prevLines = prev ? [...prev.crews.flatMap((c) => c.members), ...prev.direct] : undefined;
  const prevUp = (id: string, kind: MemberLine['kind']) => {
    if (!prevLines) return undefined;
    const ls = prevLines.filter((x) => x.id === id && x.kind === kind);
    return ls.length ? ls.reduce((a, x) => a + x.paid + (x.back ?? 0), 0) : undefined;
  };
  // What reached his pocket that week (once per man, on his first line).
  const keptOf = (id: string) => s.tribute?.purse?.[id]?.find((r) => r.w === rep.week)?.kept;
  const row = (cl: CrewLine) => {
    const k = s.characters[cl.capoId];
    const d = cl.districtId ? s.districts.find((x) => x.id === cl.districtId) : undefined;
    const isOpen = all || open === cl.capoId;
    const seen = new Set<string>();
    return [
      <tr key={cl.capoId} className={`border-t border-noir-700 ${cl.short || cl.held ? 'bg-blood-500/5' : ''}`} data-testid="crew-row">
        <td className="py-1 pr-2">
          <button type="button" className="text-left hover:text-gold-300" onClick={() => onToggle?.(cl.capoId)} data-testid="crew-inspect" aria-expanded={isOpen}>
            <span className="text-gold-400 mr-1">{isOpen ? '▾' : '▸'}</span>{k ? `${k.firstName} ${k.lastName}` : '?'}
          </button>
          <div className="text-[10px] text-stone-500">{d?.name ?? 'no district'} · {cl.members.length} men{cl.again ? ' · short again' : ''}{cl.disputed ? ' · disputes' : ''}</div>
        </td>
        <td className="pr-2 text-right tabular-nums">{fmt$(cl.due)}</td>
        <td className="pr-2 text-right tabular-nums">{fmt$(cl.paid)}</td>
        <td className={`pr-2 text-right tabular-nums ${cl.short ? 'text-red-300' : 'text-stone-600'}`}>{cl.short ? fmt$(cl.short) : '—'}{cl.held ? <div className="text-[10px] text-amber-300">held {fmt$(cl.held)}</div> : null}</td>
        <td className="pr-2 text-right tabular-nums text-stone-400">{fmt$(cl.kept)}</td>
        <td className="text-right tabular-nums text-gold-300">{fmt$(cl.remitted)}</td>
      </tr>,
      isOpen && (
        <tr key={`${cl.capoId}:m`}>
          <td colSpan={6} className="bg-noir-950/60 px-2 py-1">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">{k?.firstName}'s crew account · arrears on the books {fmt$(cl.arrears)}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]" data-testid="crew-accounts">
                <thead><tr className="text-[10px] text-stone-500 text-left"><th>Man</th><th>Agreement</th><th className="text-right">Earned</th><th className="text-right">Owed</th><th className="text-right">Kicked up</th><th className="text-right">Short</th><th className="text-right">Kept</th><th className="text-right">vs last wk</th><th>Why (said · believed · truth)</th></tr></thead>
                <tbody>{cl.members.map((m) => { const first = !seen.has(m.id); seen.add(m.id); return <MemberRow key={m.id + m.kind} s={s} m={m} kept={first ? keptOf(m.id) : undefined} prevUp={prevUp(m.id, m.kind)} />; })}</tbody>
              </table>
            </div>
          </td>
        </tr>
      ),
    ];
  };
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 flex justify-end"><button type="button" className="btn-ghost text-[10px]" onClick={() => setAll(!all)} data-testid="crew-all">{all ? 'Fold the crews' : 'Every man'}</button></div>
      <table className="w-full table-fixed text-[12px] min-w-[460px]" data-testid="crew-table">
        <thead><tr className="text-[10px] uppercase tracking-widest text-stone-500 text-left"><th className="w-[34%]">Crew</th><th className="text-right">Due</th><th className="text-right">Paid</th><th className="text-right">Short</th><th className="text-right">Capo kept</th><th className="text-right">Up</th></tr></thead>
        <tbody>{crews.flatMap(row)}</tbody>
      </table>
      {rep.direct.some((m) => m.due > 0) && <div className="mt-1 text-[11px] text-stone-400">Men with no capo paid the underboss directly: {fmt$(rep.direct.reduce((a, m) => a + m.paid, 0))} of {fmt$(rep.direct.reduce((a, m) => a + m.due, 0))}.</div>}
    </div>
  );
}

/**
 * Monday morning, the Don's office. The underboss puts the numbers on the
 * desk: his words (from the records), the crews' table (due, paid, short,
 * drill into any crew's accounts), his share, the envelope, last week's,
 * the issues and petitions, his recommended split; then the Don splits it.
 * `ev` is the audience popup when it is waiting for him; without it the
 * scene shows a week already split (and lets him set his standing split).
 */
export function AudienceScene({ s, rep, ev, onDecide, onClose, onPolicy }: {
  s: GameState;
  rep: TributeReport;
  ev?: EventInstance;
  onDecide?: (choiceId: string, env: EnvelopeChoice) => void;
  onClose: () => void;
  onPolicy?: (split: Split, auto?: boolean) => void;
}) {
  const t = s.tribute!;
  const update = useShell().update;
  const ub = rep.ubId ? s.characters[rep.ubId] : undefined;
  const [open, setOpen] = useState<string | undefined>();
  const [split, setSplit] = useState<Split>(() => normSplit(rep.alloc?.split ?? t.policy));
  const [standing, setStanding] = useState(false);
  const [grant, setGrant] = useState<string[]>([]);
  const [tab, setTab] = useState<'talk' | 'crews'>('talk');
  const decided = !!rep.alloc;
  const ob = useMemo(() => obligations(s), [s]);
  const d = splitDollars(rep.presented, split);
  const prev = rep.lastPresented;
  const date = formatDate(dateOfWeek(Math.max(1, rep.week + 1)));
  const same = (a: Split, b: Split) => a.personal === b.personal && a.reserve === b.reserve;
  const pick = (id: string, sp: Split) => onDecide?.(id, { report: rep.id, split: sp, standing, grant });
  return (
    <Overlay z={1180} className="flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-3" onClick={onClose} data-testid="audience-scene">
      <div className="panel w-full sm:max-w-5xl max-h-[96vh] overflow-y-auto rounded-b-none sm:rounded-lg border-gold-600/50 bg-gradient-to-b from-noir-900 to-noir-950" onClick={(e) => e.stopPropagation()}>
        <div className="relative overflow-hidden flex items-start justify-between gap-2 border-b border-noir-700 px-3 sm:px-5 py-3 sm:py-10" data-testid="audience-header">
          <img src={OFFICE_ART} alt="" aria-hidden className="pointer-events-none absolute right-0 top-0 h-full w-[60%] sm:w-[380px] object-cover object-[center_45%] opacity-40 sm:opacity-70" style={{ maskImage: 'linear-gradient(to right, transparent, black 45%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 45%)' }} />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{date} · Monday morning, the Don's office</div>
            <h2 className="font-display text-xl sm:text-2xl text-gold-400 leading-tight">{ev?.title ?? (ub ? `${ub.firstName} ${ub.lastName} brought the take` : 'The week\'s take')}</h2>
          </div>
          <button type="button" className="relative text-xs text-stone-300 hover:text-gold-300 drop-shadow" onClick={onClose}>{ev ? 'Later ✕' : 'Close ✕'}</button>
        </div>
        <div className="grid gap-3 p-3 sm:p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* Left: the man, his words, the crews */}
          <div className="min-w-0 space-y-3">
            <div className="flex gap-3 items-start">
              {ub ? <Face s={s} c={ub} size={96} /> : <div className="h-24 w-24 rounded-md border border-noir-600 bg-noir-800" />}
              <div className="min-w-0">
                <div className="text-stone-100 font-semibold">{ub ? displayName(ub) : 'Nobody'}</div>
                <div className="text-[11px] text-stone-400">{rep.acting ? 'Acting underboss' : 'Underboss'} · {UB_TYPE_LABEL[rep.ubType]}</div>
                {!rep.acting && ub && <div className="text-[11px] text-stone-500">His share {t.ub.rateBp / 100}% · standing among the earners {Math.round(t.ub.base)}/100{t.ub.callsFirst.length ? ` · ${t.ub.callsFirst.length} capo${t.ub.callsFirst.length > 1 ? 's' : ''} call him first` : ''}</div>}
              </div>
            </div>
            <div className="flex gap-1 text-[11px] sm:hidden">
              <button type="button" className={`rounded px-2 py-0.5 border ${tab === 'talk' ? 'border-gold-500 text-gold-300' : 'border-noir-600 text-stone-400'}`} onClick={() => setTab('talk')}>What he says</button>
              <button type="button" className={`rounded px-2 py-0.5 border ${tab === 'crews' ? 'border-gold-500 text-gold-300' : 'border-noir-600 text-stone-400'}`} onClick={() => setTab('crews')}>The crews</button>
            </div>
            <blockquote className={`${tab === 'talk' ? '' : 'hidden'} sm:block border-l-2 border-gold-600/60 pl-3 space-y-1 text-[13px] leading-relaxed text-stone-200 font-serif italic`} data-testid="audience-talk">
              {rep.talk.map((x) => <p key={x.id}>“{x.text}”</p>)}
            </blockquote>
            <div className={`${tab === 'crews' ? '' : 'hidden'} sm:block`}>
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 mb-1">Crew by crew — click a crew to inspect its accounts</div>
              <CrewTable s={s} rep={rep} open={open} onToggle={(id) => setOpen(open === id ? undefined : id)} />
            </div>
          </div>
          {/* Right: the numbers and the split */}
          <div className="min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-1.5 text-[12px]" data-testid="audience-numbers">
              <Num label="Came up from the crews" v={rep.collected} />
              <Num label={rep.acting ? 'His share (none: acting)' : `His share (${t.ub.rateBp / 100}%)`} v={rep.ubShare} />
              <Num label="In the envelope" v={rep.presented} gold />
              <Num label="Last week" v={prev ?? 0} sub={prev !== undefined ? `${rep.presented >= prev ? '+' : '−'}${fmt$(Math.abs(rep.presented - prev))}` : 'first week'} />
            </div>
            {(rep.issues.length > 0 || rep.petitions.length > 0) && (
              <div className="rounded border border-noir-700 bg-noir-900/60 p-2 text-[12px]" data-testid="audience-issues">
                {rep.issues.length > 0 && <><div className="text-[10px] uppercase tracking-widest text-red-300/80">Issues</div><ul className="list-disc pl-4 text-stone-300">{rep.issues.map((i, n) => <li key={n} className={i.severity >= 2 ? 'text-amber-200' : ''}>{i.text}</li>)}</ul></>}
                {rep.petitions.length > 0 && <><div className="mt-1 text-[10px] uppercase tracking-widest text-gold-400/80">Petitions</div>
                  {rep.petitions.map((p) => {
                    const by = s.characters[p.byId];
                    const g = grant.includes(p.id) || !!rep.alloc?.granted.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-start gap-2 py-0.5" data-testid="petition">
                        <input type="checkbox" disabled={decided || !ev} checked={g} onChange={() => setGrant(g ? grant.filter((x) => x !== p.id) : [...grant, p.id])} className="mt-1 accent-gold-400" />
                        <span className="text-stone-300">{by ? `${by.firstName} ${by.lastName}` : '?'} asks for {p.text} — <b className="text-gold-300">{fmt$(p.amount)}</b> <span className="text-stone-500">({p.kind === 'extension' ? 'no money, time' : p.from === 'reserve' ? 'from the Family' : 'off the top of the envelope'})</span></span>
                      </label>
                    );
                  })}</>}
              </div>
            )}
            <details className="rounded border border-noir-700 bg-noir-900/40 p-2 text-[11px]">
              <summary className="cursor-pointer text-stone-400">Outstanding obligations ({ob.length})</summary>
              <ul className="mt-1 space-y-0.5">{ob.map((o, i) => <li key={i} className="flex justify-between gap-2"><span className="text-stone-300">{o.what}</span><span className="tabular-nums text-stone-400">{fmt$(o.amount)}{o.weekly ? '/wk' : o.due !== undefined ? ` in ${o.due} wk` : ''}</span></li>)}</ul>
            </details>
            <div className="rounded border border-gold-600/30 bg-noir-900/60 p-2 text-[12px]" data-testid="audience-rec">
              <div className="text-[10px] uppercase tracking-widest text-stone-500">{rep.acting ? 'He has no advice' : 'His advice on your cut'}</div>
              <div className="text-gold-300 font-semibold">{splitText(rep.rec)}</div>
              <ul className="text-[11px] text-stone-400">{rep.recWhy.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
            {decided ? (
              <div className="rounded border border-emerald-700/50 bg-emerald-900/10 p-2 text-[12px]" data-testid="audience-done">
                <div className="text-emerald-300 font-semibold">{rep.alloc!.by === 'quiet' ? 'Went in on its own at your cut' : rep.alloc!.by === 'his' ? 'His advice on your cut' : rep.alloc!.by === 'custom' ? 'Your own cut this week' : 'Your usual cut'}: {splitText(rep.alloc!.split)}</div>
                <div className="tabular-nums text-stone-300">{fmt$(rep.alloc!.personal)} to your Pocket · {fmt$(rep.alloc!.treasury + rep.alloc!.reserve)} to the Family{rep.alloc!.reserve ? ` (${fmt$(rep.alloc!.reserve)} set aside)` : ''}</div>
                {onPolicy && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] text-stone-400">Your cut, every week from now on:</div>
                    <EnvelopeSplit env={rep.presented} value={split} onChange={setSplit} />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-gold text-xs" disabled={same(split, t.policy)} onClick={() => onPolicy(split)} data-testid="set-policy">Make this my cut</button>
                      <button type="button" className="btn-ghost text-xs" onClick={() => onPolicy(split, !t.policy.auto)} data-testid="toggle-auto">{t.policy.auto ? 'See every envelope myself' : 'Only call me when something is wrong'}</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <EnvelopeSplit env={rep.presented} value={split} onChange={setSplit} />
                <label className="flex items-center gap-2 text-[11px] text-stone-400"><input type="checkbox" checked={standing} onChange={(e) => setStanding(e.target.checked)} className="accent-gold-400" data-testid="standing" /> Make it my cut from now on</label>
                <div className="grid gap-1.5 sm:grid-cols-3">
                  <button type="button" className="btn-gold text-xs" disabled={!ev} onClick={() => pick(same(split, rep.rec) ? 'his' : same(split, normSplit(t.policy)) ? 'policy' : 'custom', split)} data-testid="accept-split">
                    Take it: {fmt$(d.personal)} to you · {fmt$(d.treasury + d.reserve)} to the Family
                  </button>
                  <button type="button" className="btn-ghost text-xs" disabled={!ev} onClick={() => { setSplit(normSplit(rep.rec)); pick('his', normSplit(rep.rec)); }} data-testid="accept-his">His advice: a {pct(rep.rec.personal)} cut</button>
                  <button type="button" className="btn-ghost text-xs" disabled={!ev} onClick={() => { const p = normSplit(t.policy); pick('policy', p); }} data-testid="accept-usual">Your usual {pct(t.policy.personal)} cut</button>
                </div>
                {update && !alwaysOn(s, 'envelopes') && (
                  <button type="button" className="btn-quiet text-[11px]" disabled={!ev} onClick={() => { update((x) => setAlways(x, 'envelopes', true)); setSplit(normSplit(rep.rec)); pick('his', normSplit(rep.rec)); }} data-testid="always-envelopes"
                    title="Every week the underboss splits the envelope by his own advice, even with a short or a petition in it. It is listed under Handled for you; take it back any week.">↻ His advice, and always let him split the envelope</button>
                )}
                <p className="text-[10px] text-stone-500">One number, your cut; the Family takes the rest, to the dollar, when the week turns. If you do nothing, {alwaysOn(s, 'envelopes') ? 'he splits it by his advice' : 'your usual cut applies'}.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function Num({ label, v, gold, sub }: { label: string; v: number; gold?: boolean; sub?: string }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-900/60 px-2 py-1">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
      <div className={`tabular-nums ${gold ? 'text-gold-300 text-lg font-semibold' : 'text-stone-100'}`}>{fmt$(v)}</div>
      {sub && <div className="text-[10px] text-stone-500 tabular-nums">{sub}</div>}
    </div>
  );
}
