import { useMemo, useState } from 'react';
import { previewAction } from '../../engine/actions';
import {
  consigliereWay, hows, hungerBoard, HUNGER_WORD, loadOf, openJobs, openPitches, picker, CRAFT_WORD,
  type Hunger, type JobPick, type OpenJob, type Pitch, type PitchHow,
} from '../../engine/eat';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { Card, CardHead, PageHeader, PlayCard, Section, StatChip } from '../components/Layout';
import { useOrders } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { sameOrder } from '../verbs';
import { moneyWord } from '../../engine/moneyNeed';
import { mensMoney } from '../../engine/mensMoney';
import { fmt$ } from '../format';
import { deskBundles } from '../../engine/bundles';
import { BundleCard } from '../desk/Bundles';
import { PutMoneyToWork } from '../econ/PutMoneyToWork';
import { CrewBoard } from './CrewBoard';

/**
 * LET THEM EAT (engine/eat.ts), in Your men: who is hungry, idle, overworked
 * or earning (a hunger bar on every man), the pitches his men brought him,
 * and every job that needs a man with the consigliere's three best for it,
 * his reasons, and "Do it" (the existing order). One button feeds them all
 * the consigliere's way, after a confirm that lists every assignment.
 */

const TONE: Record<Hunger['word'], string> = {
  starving: 'bg-red-500', hungry: 'bg-amber-400', idle: 'bg-amber-300/70', fed: 'bg-emerald-400', earning: 'bg-emerald-300', overworked: 'bg-sky-400',
};
const INK: Record<Hunger['word'], string> = {
  starving: 'text-red-300', hungry: 'text-amber-300', idle: 'text-amber-200', fed: 'text-emerald-300', earning: 'text-emerald-200', overworked: 'text-sky-300',
};

/** The hunger bar: used here and on each man's card in My Men. */
export function HungerBar({ h, wide }: { h: Hunger; wide?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px]" data-testid="hunger-bar" data-hunger={h.v} data-word={h.word}>
      <span className={`${wide ? 'w-24' : 'w-14'} h-1.5 shrink-0 overflow-hidden rounded bg-noir-700`} role="meter" aria-label="Hunger" aria-valuenow={h.v} aria-valuemin={0} aria-valuemax={100}>
        <span className={`block h-full ${TONE[h.word]}`} style={{ width: `${Math.max(4, h.v)}%` }} />
      </span>
      <span className={INK[h.word]}>{HUNGER_WORD[h.word]}</span>
      <span className="tabular-nums text-stone-500">{h.v}</span>
    </span>
  );
}

function PickRow({ s, p, top }: { s: GameState; p: JobPick; top: boolean }) {
  const { orders, queue } = useOrders();
  const c = s.characters[p.id];
  const pv = previewAction(s, p.action);
  const queued = orders.some((o) => sameOrder(o, p.action));
  if (!c) return null;
  return (
    <li className={`flex items-start gap-2 rounded border p-1.5 ${top ? 'border-gold-500/50 bg-gold-500/5' : 'border-noir-700'}`} data-testid="eat-pick" data-id={p.id}>
      <Face s={s} c={c} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <CharLink s={s} id={c.id} />
          <span className="text-stone-500">{c.rank}{c.craft ? ` · ${CRAFT_WORD[c.craft]}` : ''}</span>
          <span className="tabular-nums text-gold-300" title={p.fit.parts.map((x) => `${x.value > 0 ? '+' : ''}${x.value} ${x.label}`).join('\n')}>fit {p.fit.score}</span>
          {p.odds !== undefined && <span className="text-stone-400">{p.odds}% clean</span>}
        </div>
        <p className="text-[11px] text-stone-300">{p.fit.why}</p>
        {pv.disabledReason && <p className="text-[11px] text-stone-500">Can't now: {pv.disabledReason}</p>}
      </div>
      <button type="button" className={top ? 'btn-primary shrink-0 text-xs' : 'btn-ghost shrink-0 text-xs'} disabled={!!pv.disabledReason || queued} onClick={() => queue(p.action, true)} data-testid="eat-doit">
        {queued ? 'Queued' : 'Do it'}
      </button>
    </li>
  );
}

function JobCard({ s, job }: { s: GameState; job: OpenJob }) {
  return (
    <Card domain="crew" testid="eat-job">
      <CardHead d="crew" glyph="⚒" title={job.title} sub={job.sub} />
      <ol className="mt-2 space-y-1">
        {job.picks.map((p, i) => <PickRow key={p.id} s={s} p={p} top={i === 0} />)}
      </ol>
    </Card>
  );
}

function PitchCard({ s, p }: { s: GameState; p: Pitch }) {
  const c = s.characters[p.by];
  if (!c) return null;
  const A = (how: PitchHow): PlayerAction => ({ kind: 'mymen', op: { op: 'pitch', pitch: p.id, how } });
  return (
    <Card domain="crew" tone="attention" testid="eat-pitch">
      <div className="flex items-start gap-2">
        <Face s={s} c={c} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm"><CharLink s={s} id={c.id} /><span className="text-[11px] text-stone-500">{p.what} · until week {p.due}</span></div>
          <p className="text-xs italic text-stone-300">{p.text}</p>
          {p.stake > 0 && <p className="text-[11px] text-stone-500">Stake {`$${p.stake.toLocaleString('en-US')}`}; each answer shows its odds and what comes back.</p>}
        </div>
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
        {hows(p).map((how) => <ActionRow key={how} s={s} action={A(how)} hostile={how === 'no'} />)}
      </div>
    </Card>
  );
}

function FeedAll({ s, jobs }: { s: GameState; jobs: OpenJob[] }) {
  const { orders, queue } = useOrders();
  const [asking, setAsking] = useState(false);
  const way = consigliereWay(s, jobs).filter((x) => !previewAction(s, x.pick.action).disabledReason && !orders.some((o) => sameOrder(o, x.pick.action)));
  const k = picker(s);
  return (
    <div className="space-y-1.5">
      <button type="button" className="btn-primary text-xs" disabled={!way.length} onClick={() => setAsking(true)} data-testid="eat-feed-all">
        Feed the hungry ones the {k ? 'consigliere\'s' : 'best'} way{way.length ? ` (${way.length})` : ''}
      </button>
      {asking && (
        <div className="rounded-md border border-gold-500/50 bg-noir-900/90 p-2 text-xs" role="dialog" aria-label="Confirm the assignments" data-testid="eat-feed-confirm">
          <div className="mb-1 font-semibold text-stone-100">{k ? `${k.firstName}'s picks` : 'Your own read'}: {way.length} order{way.length === 1 ? '' : 's'}</div>
          <ul className="mb-2 space-y-0.5 text-stone-300">
            {way.map(({ job, pick }) => <li key={job.key}>• {s.characters[pick.id]?.firstName} {s.characters[pick.id]?.lastName} → {job.title} <span className="text-stone-500">(fit {pick.fit.score})</span></li>)}
          </ul>
          <div className="flex gap-1.5">
            <button type="button" className="btn-primary text-xs" onClick={() => { for (const x of way) queue(x.pick.action, true); setAsking(false); }} data-testid="eat-feed-yes">Give the orders</button>
            <button type="button" className="btn-ghost text-xs" onClick={() => setAsking(false)}>Not now</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Two or more pitches: one card, "Settle all N the consigliere's way", each still changeable beneath (engine/bundles.ts). */
function PitchBundle({ s }: { s: GameState }) {
  const { orders, queue } = useOrders();
  const b = deskBundles(s, { orders }, ['pitches'])[0];
  if (!b) return null;
  return <BundleCard s={s} b={b} onSettle={(rows) => { for (const r of rows) if (r.answer.kind === 'order') queue(r.answer.action, true); }} />;
}

/** Who needs money: every man running low or broke, why, and the one best way to help, ready to give. */
const LEVEL_INK: Record<string, string> = { broke: 'text-red-300', tight: 'text-amber-300', ok: 'text-stone-300', flush: 'text-emerald-300' };

/** Your men's money (engine/mensMoney.ts): one easy report, the men who need help first, each with the best way to help. */
export function NeedsMoney({ s }: { s: GameState }) {
  const { orders, queue } = useOrders();
  const [asking, setAsking] = useState(false);
  const [all, setAll] = useState(false);
  const rep = useMemo(() => mensMoney(s), [s]);
  const need = rep.rows.filter((r) => r.level === 'broke' || r.level === 'tight');
  const todo = need.filter((r) => r.need.fix && !orders.some((o) => sameOrder(o, r.need.fix!.action)));
  const total = todo.reduce((a, r) => a + (r.need.fix?.cost ?? 0), 0);
  const shown = all ? rep.rows : need;
  return (
    <Card domain="money" testid="mens-money">
      <CardHead d="money" title="Your men's money" sub="What each man has, earns, kicks up, keeps and spends a week (his last four weeks), what he owes, and which way it is going." />
      <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]" data-testid="mens-money-sum">
        <span className={`rounded border px-2 py-0.5 ${rep.total.broke ? 'border-red-500/60 text-red-300' : 'border-noir-600 text-stone-400'}`}>{rep.total.broke} broke</span>
        <span className={`rounded border px-2 py-0.5 ${rep.total.tight ? 'border-amber-500/60 text-amber-300' : 'border-noir-600 text-stone-400'}`}>{rep.total.tight} tight</span>
        <span className="rounded border border-noir-600 px-2 py-0.5 text-stone-300">{rep.rows.length - rep.total.broke - rep.total.tight} doing fine</span>
        <span className="rounded border border-noir-600 px-2 py-0.5 text-stone-300">they hold {fmt$(rep.total.has)}</span>
        <span className="rounded border border-noir-600 px-2 py-0.5 text-stone-300">kick up ~{fmt$(rep.total.up)}/wk</span>
        {rep.total.owes > 0 && <span className="rounded border border-red-500/40 px-2 py-0.5 text-red-200">owe {fmt$(rep.total.owes)}</span>}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {todo.length > 0 && <button type="button" className="btn-primary text-xs" onClick={() => setAsking(true)} data-testid="money-help-all">Take care of all {todo.length}{total ? ` · ${fmt$(total)}` : ''}</button>}
        <button type="button" className="btn-secondary text-xs" onClick={() => setAll((v) => !v)} data-testid="mens-money-all">{all ? 'Only who needs help' : `Every man (${rep.rows.length})`}</button>
      </div>
      {asking && (
        <div className="mb-2 rounded-md border border-gold-500/50 bg-noir-900/90 p-2 text-xs" role="dialog" aria-label="Confirm" data-testid="money-help-confirm">
          <ul className="mb-2 space-y-0.5 text-stone-300">{todo.map((r) => <li key={r.c.id}>• {r.c.firstName} {r.c.lastName}: {r.need.fix!.label}{r.need.fix!.cost ? ` (${fmt$(r.need.fix!.cost)})` : ''}</li>)}</ul>
          <div className="flex gap-1.5">
            <button type="button" className="btn-primary text-xs" onClick={() => { for (const r of todo) queue(r.need.fix!.action, true); setAsking(false); }} data-testid="money-help-yes">Give the orders</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setAsking(false)}>Not now</button>
          </div>
        </div>
      )}
      {shown.length === 0 ? <p className="text-xs text-stone-400">Nobody is short right now. Every man is getting by.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] tabular-nums" data-testid="mens-money-table">
            <thead><tr className="text-stone-500"><th className="text-left font-normal">Man</th><th className="text-right font-normal">Has</th><th className="text-right font-normal">Earns/wk</th><th className="text-right font-normal">Kicks up</th><th className="text-right font-normal">Keeps</th><th className="text-right font-normal">Spends</th><th className="text-right font-normal">Owes</th><th className="text-right font-normal">4 wks</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => {
                const queued = r.need.fix ? orders.some((o) => sameOrder(o, r.need.fix!.action)) : false;
                return (
                  <tr key={r.c.id} className="border-t border-noir-800 align-top" data-testid="money-need" data-level={r.level}>
                    <td className="py-1 pr-2"><div className="flex flex-wrap items-baseline gap-x-1.5"><CharLink s={s} id={r.c.id} /><span className="text-stone-500">{r.c.rank}</span><span className={LEVEL_INK[r.level]}>{moneyWord(r.level)}</span></div>{r.need.why.length > 0 && <div className="text-[10px] text-stone-500">{r.need.why.join(' · ')}</div>}</td>
                    <td className={`text-right ${r.has < 150 ? 'text-red-300' : 'text-stone-200'}`}>{fmt$(r.has)}</td>
                    <td className="text-right text-stone-300">{fmt$(r.earned)}</td>
                    <td className="text-right text-stone-300">{fmt$(r.up)}</td>
                    <td className="text-right text-stone-300">{fmt$(r.kept)}</td>
                    <td className="text-right text-stone-300">{fmt$(r.spent)}</td>
                    <td className={`text-right ${r.owes ? 'text-red-300' : 'text-stone-500'}`}>{r.owes ? fmt$(r.owes) : '—'}</td>
                    <td className={`text-right ${r.trend < 0 ? 'text-red-300' : r.trend > 0 ? 'text-emerald-300' : 'text-stone-500'}`}>{r.trend > 0 ? '▲' : r.trend < 0 ? '▼' : '·'} {r.trend ? fmt$(Math.abs(r.trend)) : ''}</td>
                    <td className="pl-2 text-right">{r.need.fix && (r.level === 'broke' || r.level === 'tight') ? <button type="button" className="btn-primary text-[11px]" disabled={queued} onClick={() => queue(r.need.fix!.action, true)} data-testid="money-help">{queued ? 'Queued' : `${r.need.fix.label}${r.need.fix.cost ? ` · ${fmt$(r.need.fix.cost)}` : ''}`}</button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function LetThemEat({ s }: { s: GameState }) {
  const board = useMemo(() => hungerBoard(s), [s]);
  const jobs = useMemo(() => openJobs(s), [s]);
  const pitches = openPitches(s);
  const [show, setShow] = useState<'all' | 'hungry'>('hungry');
  const count = (w: Hunger['word'][]) => board.filter((x) => w.includes(x.h.word)).length;
  const men = show === 'hungry' ? board.filter((x) => x.h.v >= 45 || x.h.word === 'overworked' || x.h.word === 'idle') : board;
  const k = picker(s);
  return (
    <div className="space-y-4" data-testid="eat">
      <PageHeader title="Let them eat" sub={`Your men want work, and some bring their own. ${k ? `${k.firstName}, your consigliere,` : 'With no consigliere, your own read'} ranks the men for every open job.`} />
      <CrewBoard s={s} />
      <NeedsMoney s={s} />
      <PutMoneyToWork s={s} />
      <FeedAll s={s} jobs={jobs} />
      <div className="flex flex-wrap gap-1.5">
        <StatChip domain="crew" label="Starving" value={count(['starving'])} tone={count(['starving']) ? 'bad' : undefined} />
        <StatChip domain="crew" label="Hungry" value={count(['hungry'])} tone={count(['hungry']) ? 'warn' : undefined} />
        <StatChip domain="crew" label="Idle" value={count(['idle'])} />
        <StatChip domain="crew" label="Overworked" value={count(['overworked'])} tone={count(['overworked']) ? 'warn' : undefined} />
        <StatChip domain="crew" label="Fed or earning" value={count(['fed', 'earning'])} tone="good" />
        <StatChip domain="crew" label="Pitches" value={pitches.length} />
      </div>

      {pitches.length > 0 && (
        <Section domain="crew" title="Pitches waiting" sub="Their own thing, brought to you. Their capo brings it to a morning too; answer here or there." testid="eat-pitches">
          <PitchBundle s={s} />
          <div className="grid gap-2">{pitches.map((p) => <PitchCard key={p.id} s={s} p={p} />)}</div>
        </Section>
      )}

      <Section domain="crew" title="Open jobs" sub="What needs a man now, and the three best for it. A good match does it better; a hungry man fed is a loyal man." aside={<span>{jobs.length}</span>} testid="eat-jobs">
        {jobs.length ? <div className="grid gap-2 lg:grid-cols-2">{jobs.map((j) => <JobCard key={j.key} s={s} job={j} />)}</div>
          : <p className="text-xs text-stone-400">Nothing needs a man this week. Hungry men will come with their own.</p>}
      </Section>

      <Section domain="crew" title="Who's hungry" sub="Hunger comes from idle weeks, earning less than his peers, what he wants, his nature and his debts. Fed men are loyal and kick up; starving men skim, drift or freelance; overloaded men get careless." testid="eat-men"
        aside={<span className="flex gap-1">{(['hungry', 'all'] as const).map((f) => <button key={f} type="button" className={`rounded px-1.5 ${show === f ? 'bg-gold-500 text-noir-950' : 'text-stone-400 hover:text-gold-300'}`} onClick={() => setShow(f)}>{f === 'hungry' ? 'Need work' : `Everyone (${board.length})`}</button>)}</span>}>
        {men.length ? (
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {men.map(({ c, h }) => {
              const work = loadOf(s, c);
              const p = pitches.find((x) => x.by === c.id);
              return (
                <PlayCard key={c.id} as="li" d="crew" testid="eat-man" dataAttrs={{ 'data-id': c.id, 'data-word': h.word }}
                  art={<Face s={s} c={c} size={58} />}
                  corner={p ? <span className="rounded bg-gold-500 px-1 text-[10px] font-semibold text-noir-950">pitch</span> : undefined}
                  title={<CharLink s={s} id={c.id} />}
                  lines={[<HungerBar key="h" h={h} />, <>{c.rank}{c.craft ? ` · ${CRAFT_WORD[c.craft]}` : ''} · {work.length ? work.slice(0, 2).join(', ') : 'nothing of his own'}</>]}>
                  {h.why.length > 0 && <p className="mt-1 text-[10px] leading-snug text-stone-500">{h.why.slice(0, 3).join(' · ')}</p>}
                </PlayCard>
              );
            })}
          </ul>
        ) : <p className="text-xs text-stone-400">Nobody is going hungry. Every man has something.</p>}
      </Section>
    </div>
  );
}
