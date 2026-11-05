import { pregnancyKnown } from '../../engine/dating';
import { useMemo, useState } from 'react';
import type { NowResult } from '../../engine/deeds/now';
import {
  BEEF_LABEL, GROUP_NAME, GROUP_ORDER, hitLine, ledgerActions, ownHitConsequences, peopleLedger, readAct, sitOdds, SUSPECT, testOdds,
  type BeefLevel, type Meter, type PeopleFilter, type PeopleGroup, type PersonView, type ReadOp,
} from '../../engine/peopleRead';
import { candidatesFor, inquiryView, sleuth } from '../../engine/protect';
import type { GameState, PlayerAction } from '../../engine/types';
import { Empty, PageHeader, Section } from '../components/Layout';
import { Modal } from '../components/Modal';
import { useOrders } from '../components/Orders';
import { Face } from '../components/People';
import { usePlanner } from '../components/Schemes';
import { postNow } from '../deeds/NowResult';
import { domClass, type Domain } from '../domain';
import { useShell } from '../shell/context';
import { CloseStrip, PinStar } from './ClosePeople';
import { CrewBadge, CrewStrip, LoyaltyMeter } from '../components/Loyalty';

/**
 * THE PEOPLE LEDGER (imports/queue/PEOPLE_LEDGER.md): one list of everyone the boss knows, grouped by
 * family (your own first), with his private read on each man as small bars in the domain colours:
 * beef (rivals' blood red), trust and loyalty (the crew's brass), "flipped?" (the law's steel blue),
 * "stealing?" (money), fear. Every bar answers "why do I think this?". The row's actions are settled
 * now with their odds (sit him down, test him, clear him), queued the usual way (watch him: an inquiry,
 * protect.ts), or open the hit planner (your own man only after a confirm that names the cost).
 *
 * It is a page of the Black book (planner/BlackBook.tsx). The engine is engine/peopleRead.ts: the read
 * is the boss's belief from evidence, never the hidden truth.
 */

const GROUP_DOM: Record<PeopleGroup, Domain> = { yours: 'crew', manno: 'rivals', feldstein: 'rivals', kessler: 'rivals', philly: 'politics', law: 'law', town: 'politics', other: 'shore' };
const BEEF_V: Record<BeefLevel, number> = { none: 0, tension: 25, feud: 55, war: 80, blood: 100 };
const PER_GROUP = 12;

export type Mode = 'read' | 'hit';

/** Open the Black book on the people page (from anywhere: the hit card, a sheet). */
let pending: Mode | undefined;
export function openPeople(mode: Mode = 'read'): void {
  pending = mode;
  window.dispatchEvent(new CustomEvent('llv-open-planner', { detail: { tab: 'book' } }));
}
/** The Black book asks once when it opens: was it opened on the people page? */
export function takePendingPeople(): Mode | undefined {
  const m = pending;
  pending = undefined;
  return m;
}

export function PeopleLedger({ s, initialMode = 'read' }: { s: GameState; initialMode?: Mode }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<PeopleGroup | 'all'>('all');
  const [suspected, setSuspected] = useState(false);
  const [fight, setFight] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [open, setOpen] = useState<string | undefined>();
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<string | undefined>();
  const { plan } = usePlanner();
  const filter: PeopleFilter = { q, group, suspected, fight };
  const all = useMemo(() => peopleLedger(s), [s]);
  const groups = useMemo(() => peopleLedger(s, filter), [s, q, group, suspected, fight]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = all.reduce((a, g) => a + g.rows.length, 0);
  const nSusp = all.reduce((a, g) => a + g.rows.filter((v) => Math.max(v.flip.v, v.steal.v) >= SUSPECT).length, 0);
  const nFight = all.reduce((a, g) => a + g.rows.filter((v) => v.beef.level !== 'none').length, 0);
  const hit = (id: string) => (s.characters[id]?.faction === 'player' ? setConfirm(id) : plan('murder', id));

  return (
    <div className="rounded-lg border border-noir-700 bg-noir-900 p-3 text-stone-200 sm:p-4" data-testid="people-ledger">
      <PageHeader title="The people" sub={`Everyone you know of, by family: ${total}. What you believe about each one, and why. Belief is not proof: a loyal man can look like a rat, and a rat can look clean.`} />
      <div className="mb-2"><CloseStrip s={s} /></div>
      <div className="mb-2"><CrewStrip s={s} /></div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter the people">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a name, a rank, a district…" aria-label="Find a person" data-testid="people-search"
          className="min-w-0 flex-1 basis-40 rounded border border-noir-600 bg-noir-950 px-2 py-1 text-[12.5px] text-stone-100 placeholder:text-stone-500" />
        <select value={group} onChange={(e) => setGroup(e.target.value as PeopleGroup | 'all')} aria-label="Family or faction" data-testid="people-group"
          className="rounded border border-noir-600 bg-noir-950 px-1.5 py-1 text-[12px]">
          <option value="all">Every family</option>
          {GROUP_ORDER.filter((g) => all.some((x) => x.group === g)).map((g) => <option key={g} value={g}>{all.find((x) => x.group === g)?.label ?? GROUP_NAME[g]}</option>)}
        </select>
        <Toggle on={suspected} onClick={() => setSuspected((x) => !x)} testid="people-suspected" d="law">Suspected <span className="opacity-60">{nSusp}</span></Toggle>
        <Toggle on={fight} onClick={() => setFight((x) => !x)} testid="people-fight" d="rivals">In a fight <span className="opacity-60">{nFight}</span></Toggle>
        <Toggle on={mode === 'hit'} onClick={() => setMode((m) => (m === 'hit' ? 'read' : 'hit'))} testid="people-hitmode" d="rivals">Hit list</Toggle>
      </div>
      {mode === 'hit' && <p className="mt-1.5 text-[11.5px] text-stone-400" data-testid="people-hit-note">The odds of a planned hit at the barbershop with your two best free men, and the heat it brings. The planner lets you change all of it. Your own men are a section of their own: only on your word, after you see what it costs.</p>}
      <div className="mt-3">
        {!groups.length && <Empty title="Nobody fits that.">Clear a filter, or look under another family.</Empty>}
        {groups.map((g) => {
          const shown = more[g.group] || q ? g.rows : g.rows.slice(0, PER_GROUP);
          return (
            <Section key={g.group} domain={GROUP_DOM[g.group]} title={g.label} aside={<span>{g.rows.length}</span>} testid={`people-group-${g.group}`}>
              <ul className="space-y-1">
                {shown.map((v) => (
                  <Row key={v.id} s={s} v={v} mode={mode} open={open === v.id} onToggle={() => setOpen((x) => (x === v.id ? undefined : v.id))} onHit={() => hit(v.id)} />
                ))}
              </ul>
              {g.rows.length > shown.length && <button type="button" className="mt-1 text-[11.5px] text-stone-400 hover:text-gold-300" onClick={() => setMore((m) => ({ ...m, [g.group]: true }))} data-testid="people-more">All {g.rows.length}</button>}
            </Section>
          );
        })}
      </div>
      {confirm && <OwnHitConfirm s={s} id={confirm} onNo={() => setConfirm(undefined)} onYes={() => { const id = confirm; setConfirm(undefined); plan('murder', id); }} />}
    </div>
  );
}

function Toggle({ on, onClick, children, testid, d }: { on: boolean; onClick: () => void; children: React.ReactNode; testid: string; d: Domain }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} data-testid={testid}
      className={`${domClass(d)} rounded border px-2 py-1 text-[12px] ${on ? 'border-[rgb(var(--d))] bg-[rgb(var(--d)/0.2)] text-[rgb(var(--d-ink))]' : 'border-noir-600 text-stone-300 hover:border-stone-400'}`}>
      {children}
    </button>
  );
}

/** One small bar in a domain's colour, with its words (colour is never the only signal). */
function Bar({ d, label, v, word, testid }: { d: Domain; label: string; v: number; word: string; testid?: string }) {
  const w = Math.max(0, Math.min(100, v));
  return (
    <div className={`${domClass(d)} min-w-0`} data-testid={testid} title={`${label}: ${word}`}>
      <div className="flex items-baseline justify-between gap-1 text-[10px] leading-tight">
        <span className="truncate uppercase tracking-wide text-stone-500 sm:tracking-wider">{label}</span>
        <span className="hidden truncate text-[rgb(var(--d-ink))] sm:inline">{word}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-noir-700" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)} aria-valuetext={word}>
        <div className="h-full rounded-full bg-[rgb(var(--d))]" style={{ width: `${w}%` }} />
      </div>
      <div className="truncate text-[10px] leading-tight text-[rgb(var(--d-ink))] sm:hidden">{word}</div>
    </div>
  );
}

function Row({ s, v, mode, open, onToggle, onHit }: { s: GameState; v: PersonView; mode: Mode; open: boolean; onToggle: () => void; onHit: () => void }) {
  const c = s.characters[v.id];
  const h = useMemo(() => (mode === 'hit' ? hitLine(s, v.id) : undefined), [mode, s, v.id]);
  const susp = Math.max(v.flip.v, v.steal.v) >= SUSPECT;
  if (!c) return null;
  const fam = v.side.kind === 'yours' ? 'Yours' : v.side.label.replace(/^The | family$/g, '');
  return (
    <li className={`rounded border ${susp ? 'border-sky-700/60' : 'border-noir-700'} bg-noir-800/60`} data-testid="people-row" data-group={v.group} data-suspected={susp ? 1 : 0} data-beef={v.beef.level}>
      <div className="flex items-start gap-2 p-1.5">
        <Face s={s} c={c} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <button type="button" className="truncate text-left text-[13px] font-semibold text-stone-100 hover:text-gold-300" onClick={onToggle} aria-expanded={open} data-testid="people-name">{v.name}</button>{pregnancyKnown(s, v.id) && <span className="ml-1 rounded-full bg-rose-500/20 px-1.5 text-[10px] text-rose-200">Pregnant</span>}
            <PinStar s={s} id={v.id} />
            {c.alive && <CrewBadge s={s} c={c} />}
            <span className="truncate text-[11px] text-stone-400">{v.rank}<span style={{ color: v.side.color }} className="sr-only"> · {v.side.emblem} {fam}</span>{v.district ? ` · ${v.district}` : ''}</span>
            {v.watched && <span className="text-[10.5px] text-sky-300" title={v.watched}>◉ watched</span>}
            {v.cleared !== undefined && <span className="text-[10.5px] text-emerald-300">✓ cleared</span>}
          </div>
          <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-1 sm:grid-cols-6" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }} aria-label={`Why do you think this about ${v.name}?`}>
            <Bar d="rivals" label="Beef" v={BEEF_V[v.beef.level]} word={BEEF_LABEL[v.beef.level]} testid="meter-beef" />
            <Bar d="crew" label="Trust" v={v.trust.v} word={v.trust.label} testid="meter-trust" />
            <Bar d="law" label="Flipped?" v={v.flip.v} word={short(v.flip)} testid="meter-flip" />
            <Bar d="money" label="Stealing?" v={v.steal.v} word={short(v.steal)} testid="meter-steal" />
            <Bar d="crew" label="Loyalty" v={(v.loyalty.v + 100) / 2} word={`${v.loyalty.label} ${v.loyalty.v > 0 ? '+' : ''}${v.loyalty.v}`} testid="meter-loyalty" />
            <Bar d="rivals" label="Fear" v={v.fear.v} word={v.fear.label} testid="meter-fear" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-stone-400">
            {(v.favors.owesMe > 0 || v.favors.iOwe > 0) && <span data-testid="people-favors">Favors: {v.favors.owesMe > 0 && <span className="text-emerald-300">owes you {v.favors.owesMe}</span>}{v.favors.owesMe > 0 && v.favors.iOwe > 0 && ' · '}{v.favors.iOwe > 0 && <span className="text-amber-200">you owe {v.favors.iOwe}</span>}</span>}
            {h && <span data-testid="people-hitline" className={h.blocked ? 'text-stone-500' : 'text-red-300'}>{h.blocked ? `Hit: ${h.blocked}` : `Hit ${Math.round(h.chance * 100)}% · heat ${h.heat}`}</span>}
            <button type="button" className="ml-auto text-stone-400 hover:text-gold-300" onClick={onToggle} data-testid="people-why">{open ? 'Close ▴' : 'Why? · act ▾'}</button>
          </div>
        </div>
      </div>
      {open && <Detail s={s} v={v} onHit={onHit} />}
    </li>
  );
}

const short = (m: Meter) => (m.v >= 70 ? 'Nearly sure' : m.v >= SUSPECT ? 'Suspect' : m.v >= 15 ? 'A doubt' : 'No sign');

function Why({ d, title, m, extra }: { d: Domain; title: string; m: { why: string[] }; extra?: string }) {
  return (
    <div className={`${domClass(d)} llv-dom-edge rounded border border-noir-700 bg-noir-900/70 px-2 py-1.5`}>
      <div className="text-[11px] font-semibold text-[rgb(var(--d-ink))]">{title}{extra ? <span className="ml-1 font-normal text-stone-400">{extra}</span> : null}</div>
      <ul className="mt-0.5 space-y-0.5 text-[11.5px] leading-snug text-stone-300">
        {m.why.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}
      </ul>
    </div>
  );
}

function Detail({ s, v, onHit }: { s: GameState; v: PersonView; onHit: () => void }) {
  const shell = useShell();
  const orders = useOrders();
  const c = s.characters[v.id];
  const mine = c?.faction === 'player';
  const watch = useMemo<PlayerAction | undefined>(() => {
    if (!mine || v.watched) return undefined;
    const man = candidatesFor(s, v.id, 'day').filter((m) => m.rank !== 'capo').sort((a, b) => sleuth(s, b) - sleuth(s, a) || a.id.localeCompare(b.id))[0];
    if (!man) return undefined;
    return { kind: 'protect', op: { op: 'investigate', subject: v.id, purpose: v.steal.v > v.flip.v ? 'money' : 'loyalty', who: man.id, weeks: 6 } };
  }, [s, v.id, v.watched, v.flip.v, v.steal.v, mine]);
  const wv = watch && watch.kind === 'protect' && watch.op.op === 'investigate' ? inquiryView(s, watch.op) : undefined;
  const so = mine ? sitOdds(s, v.id) : undefined;
  const to = mine ? testOdds(s, v.id) : undefined;
  const run = (op: ReadOp) => {
    const r = readAct(s, v.id, op);
    if (r.result.ok) shell.update?.(() => r.state);
    postNow(r.result as NowResult);
  };
  const extra = ledgerActions().map((d) => ({ d, a: d.available(s, v.id) })).filter((x) => x.a !== false);
  const btn = 'rounded border border-noir-600 px-2 py-1 text-left text-[12px] text-stone-200 hover:border-gold-500 disabled:opacity-50 disabled:hover:border-noir-600';
  return (
    <div className="border-t border-noir-700 p-2" data-testid="people-detail">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Why do I think this?</div>
      <div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        <Why d="rivals" title={`Beef: ${BEEF_LABEL[v.beef.level]}`} m={v.beef} />
        <Why d="crew" title={`Trust: ${v.trust.label}`} extra={`${v.trust.v}/100`} m={v.trust} />
        <Why d="law" title={`Flipped? ${v.flip.label}`} extra={`${v.flip.v}/100`} m={v.flip} />
        <Why d="money" title={`Stealing? ${v.steal.label}`} extra={`${v.steal.v}/100`} m={v.steal} />
        <div className="min-w-0">
          <Why d="crew" title={`Loyalty: ${v.loyalty.label}`} extra={`${v.loyalty.v > 0 ? '+' : ''}${v.loyalty.v}`} m={v.loyalty} />
          {c?.alive && <LoyaltyMeter s={s} id={v.id} why className="mt-1 px-2" />}
        </div>
        <Why d="rivals" title={`Fear: ${v.fear.label}`} extra={`· favors: owes you ${v.favors.owesMe}, you owe ${v.favors.iOwe}`} m={{ why: [...v.fear.why, ...v.favors.why] }} />
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={`What to do about ${v.name}`}>
        {mine && (
          <button type="button" className={btn} disabled={!watch || !!wv?.block} onClick={() => watch && orders.queue(watch)} data-testid="people-act-watch"
            title={wv?.warn}>
            <b>Watch him</b>
            <span className="block text-[11px] text-stone-400">{v.watched ? `${v.watched}.` : !watch ? 'Nobody free to do it.' : wv?.block ? wv.block : `${wv?.who?.firstName ?? 'A man'} looks into him for 6 weeks, $${wv?.wage ?? 0}/wk. Reports every two weeks; he may notice (~${Math.round((wv?.discovery ?? 0) * 100)}% a week).`}</span>
          </button>
        )}
        {mine && to && (
          <button type="button" className={btn} disabled={!!to.block} onClick={() => run('test')} data-testid="people-act-test">
            <b>Test him</b>
            <span className="block text-[11px] text-stone-400">{to.block ?? `Feed him a story nobody else hears. If he talks, it comes back ~${Math.round(to.ifTalks * 100)}% of the time; a clean man's story leaks ~${Math.round(to.ifClean * 100)}% anyway.`}</span>
          </button>
        )}
        {mine && so && (
          <button type="button" className={btn} disabled={!!so.block} onClick={() => run('sit')} data-testid="people-act-sit" title={so.reasons.map((r) => `${r.label} ${r.value > 0 ? '+' : ''}${r.value}`).join(' · ')}>
            <b>Sit him down</b>
            <span className="block text-[11px] text-stone-400">{so.block ?? `Ask him straight. ${Math.round(so.chance * 100)}% you read him right. A clean man you doubt will remember it.`}</span>
          </button>
        )}
        <button type="button" className={btn} disabled={!v.flip.v && !v.steal.v} onClick={() => run('clear')} data-testid="people-act-clear">
          <b>Clear him</b>
          <span className="block text-[11px] text-stone-400">{!v.flip.v && !v.steal.v ? 'Nothing to clear.' : 'Put your doubts away. New evidence still counts.'}</span>
        </button>
        <button type="button" className={`${btn} border-blood-500/60 hover:border-blood-500`} onClick={onHit} data-testid="people-act-hit">
          <b className="text-red-300">Plan a hit…</b>
          <span className="block text-[11px] text-stone-400">{mine ? 'One of your own: you will see what it costs first.' : 'Opens the planner: the team, the place, the odds.'}</span>
        </button>
        {extra.map(({ d, a }) => (
          <button key={d.key} type="button" className={btn} disabled={typeof a === 'string'} title={typeof a === 'string' ? a : undefined} data-testid={`people-act-${d.key}`}
            onClick={() => { const out = d.run(s, v.id); if (out?.state) { const st = out.state; shell.act ? shell.act(() => st, out.line) : shell.update?.(() => st); } out?.open?.(); }}>
            <b>{d.label(s, v.id)}</b>
            {typeof a === 'string' && <span className="block text-[11px] text-stone-400">{a}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The confirm before a hit on one of your own: what it costs, said plainly. Nobody of yours dies without your word. */
export function OwnHitConfirm({ s, id, onYes, onNo }: { s: GameState; id: string; onYes: () => void; onNo: () => void }) {
  const c = s.characters[id];
  const h = hitLine(s, id);
  return (
    <Modal onClose={onNo}>
      <div className="space-y-2 p-4" data-testid="own-hit-confirm">
        <div className="text-[10px] uppercase tracking-[0.3em] text-red-300">One of your own</div>
        <h2 className="font-display text-xl text-gold-300">Plan a hit on {c?.firstName} {c?.lastName}?</h2>
        <p className="text-[12.5px] text-stone-300">Nobody of yours dies unless you choose it. If you go on, the planner opens: you still pick the team and the place, and the order is not given until you give it there. Odds with your two best free men: {Math.round(h.chance * 100)}%; heat {h.heat}.</p>
        <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-stone-300">
          {ownHitConsequences(s, id).map((x, i) => <li key={i}>{x}</li>)}
        </ul>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost text-xs" onClick={onNo} data-testid="own-hit-no">No</button>
          <button type="button" className="btn border border-blood-500 text-xs text-red-300 hover:bg-blood-500/20" onClick={onYes} data-testid="own-hit-yes">Yes, plan it</button>
        </div>
      </div>
    </Modal>
  );
}
