import { useMemo, useState } from 'react';
import { previewAction } from '../../engine/actions';
import { fmtMoney } from '../../engine/effects';
import {
  hireAcceptance, hireAction, jobsFor, payrollGroups, payrollTotals, recentIntel, socialCircle, JOBS,
  type PayRow, type RingId,
} from '../../engine/payroll';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { PlayCard, Section, StatChip } from '../components/Layout';
import { CharLink, Face } from '../components/People';
import type { Domain } from '../domain';

/**
 * THE CIVILIAN PAYROLL on the crew screen (engine/payroll.ts): everyone outside the Family who draws an
 * envelope from you, grouped by job, read from wherever their payroll lives (this one, the night's, City
 * Hall's, the no-show jobs, the outside guys): face, job, wage, what they bring, loyalty and risk, with a
 * raise, a cut, letting go, and naming the main earner. Below it, how deep the boss's circle goes.
 */

const SRC_WORD: Record<PayRow['source'], string> = { payroll: 'Your payroll', night: 'The night', house: 'Her house', pol: 'City Hall', job: 'A no-show job', outside: 'Through a capo' };

function Meter({ label, v, bad }: { label: string; v: number; bad?: boolean }) {
  const tone = bad ? (v >= 60 ? 'bg-red-500' : v >= 35 ? 'bg-amber-500' : 'bg-emerald-500') : (v >= 60 ? 'bg-emerald-500' : v >= 35 ? 'bg-amber-500' : 'bg-red-500');
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="w-12 shrink-0 text-stone-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-noir-700" role="meter" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}><div className={`h-full ${tone}`} style={{ width: `${v}%` }} /></div>
      <span className="w-6 text-right tabular-nums text-stone-300">{v}</span>
    </div>
  );
}

function RowCard({ s, r }: { s: GameState; r: PayRow }) {
  const c = r.charId ? s.characters[r.charId] : undefined;
  const [open, setOpen] = useState(false);
  const acts: [PlayerAction | undefined, string][] = [[r.raise, 'A raise (+$10/wk)'], [r.cut, 'Cut the envelope (−$10/wk)'], [r.main ? undefined : r.makeMain, 'Name main earner'], [r.fire, 'Let go']];
  const d: Domain = r.job === 'hush' ? 'rivals' : r.job === 'cop' || r.job === 'politician' ? 'law' : r.job === 'girl' || r.job === 'madam' ? 'romance' : 'money';
  return (
    <PlayCard as="li" d={d} testid="payroll-row" dataAttrs={{ 'data-job': r.job, 'data-source': r.source }}
      art={c ? <Face s={s} c={c} size={52} /> : undefined} artClassName="!min-h-[64px]"
      corner={r.main ? <span className="rounded bg-gold-500 px-1 text-[10px] font-semibold text-noir-950" data-testid="payroll-main">Main earner</span> : r.hush?.found ? <span className="rounded bg-red-600 px-1 text-[10px] text-white">Found out</span> : undefined}
      title={c ? <CharLink s={s} id={c.id} /> : r.name}
      lines={[`${r.title}${r.wage ? ` · ${fmtMoney(r.wage)}/wk` : ''}`, r.yields]}>
      <div className="mt-1 space-y-0.5">
        <Meter label="Loyalty" v={r.loyalty} />
        <Meter label="Risk" v={r.risk} bad />
        {r.hush && <p className="text-[11px] text-stone-400">On her {r.hush.rel}, {r.hush.on} · reliability {r.hush.rel100} · suspicion at home {r.hush.heat}</p>}
        <p className="text-[10.5px] text-stone-500">{SRC_WORD[r.source]}{r.note ? ` · ${r.note}` : ''}</p>
      </div>
      {acts.some(([a]) => a) && (
        <div className="mt-1">
          <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="payroll-actions">{open ? 'Close ▴' : `${[r.raise && 'Raise', r.cut && 'cut', !r.main && r.makeMain && 'main earner', r.fire && 'let go'].filter(Boolean).join(' · ')} ▾`}</button>
          {open && <div className="mt-1 space-y-1">{acts.map(([a, label]) => a && <ActionRow key={label} s={s} action={a} label={label} hostile={label === 'Let go'} />)}</div>}
        </div>
      )}
    </PlayCard>
  );
}

/** People the boss knows outside the Family who might take a job: the best odds first. */
function Candidates({ s }: { s: GameState }) {
  const list = useMemo(() => {
    const circle = socialCircle(s);
    const ids = circle.rings.filter((r) => r.id === 'friends' || r.id === 'acquaintances').flatMap((r) => r.ids);
    const out: { id: string; a: PlayerAction; pct: number }[] = [];
    for (const id of ids) {
      const c = s.characters[id];
      const j = c ? jobsFor(s, c)[0] : undefined;
      if (!c || !j) continue;
      const a = hireAction(s, id, j);
      if (previewAction(s, a).disabledReason) continue;
      out.push({ id, a, pct: Math.round(hireAcceptance(s, c, j).chance * 100) });
    }
    return out.sort((x, y) => y.pct - x.pct).slice(0, 4);
  }, [s]);
  if (!list.length) return null;
  return (
    <div className="space-y-1" data-testid="payroll-candidates">
      <div className="text-[11px] uppercase tracking-wide text-stone-500">People you know who might take a job</div>
      {list.map((x) => <ActionRow key={x.id} s={s} action={x.a} />)}
    </div>
  );
}

export function PayrollSection({ s }: { s: GameState }) {
  const groups = useMemo(() => payrollGroups(s), [s]);
  const t = useMemo(() => payrollTotals(s), [s]);
  const intel = recentIntel(s, 4);
  return (
    <Section title="Civilians · on the payroll" domain="money" testid="payroll-section"
      sub="Not made, not sworn: anyone outside the Family who draws an envelope from you. Offer a job from anyone's sheet or the black book. They decide; working girls keep their share and can quit any time.">
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="On the payroll" value={t.people} domain="money" testid="payroll-count" />
        <StatChip label="Wages a week" value={fmtMoney(t.wages)} domain="money" />
        <StatChip label="They bring in" value={fmtMoney(t.money)} sub="a week, about" tone={t.money >= t.wages ? 'good' : 'warn'} domain="money" />
        <StatChip label="Main earner" value={t.main ?? '—'} domain="money" />
      </div>
      {!groups.length && <p className="text-[12px] text-stone-400" data-testid="payroll-empty">Nobody outside the Family is on your payroll yet. A barber, a bartender, a cop: open anyone's sheet and offer a job.</p>}
      {groups.map((g) => (
        <div key={g.job} className="mt-2" data-testid={`payroll-group-${g.job}`}>
          <div className="mb-1 flex items-baseline gap-2"><span className="panel-title">{g.label}</span><span className="text-[11px] text-stone-500">{g.rows.length} · {JOBS[g.job].blurb.toLowerCase()}</span></div>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{g.rows.map((r) => <RowCard key={r.id} s={s} r={r} />)}</ul>
        </div>
      ))}
      {intel.length > 0 && (
        <div className="mt-3 space-y-1" data-testid="payroll-intel">
          <div className="panel-title">What the quiet envelopes brought</div>
          <ul className="space-y-0.5 text-[12px]">
            {intel.slice(0, 6).map((x) => (
              <li key={x.id} className="flex gap-2"><span className={`w-20 shrink-0 text-[10.5px] uppercase ${x.conf === 'confirmed' ? 'text-emerald-300' : x.conf === 'likely' ? 'text-amber-200' : 'text-stone-400'}`}>{x.conf}</span><span className="text-stone-300">{x.text}</span></li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3"><Candidates s={s} /></div>
    </Section>
  );
}

const RING_TONE: Record<RingId, string> = {
  blood: '--d-family', made: '--d-crew', associates: '--d-crew', payroll: '--d-money', friends: '--d-politics', acquaintances: '--d-shore',
};

/** How deep the boss's circle goes: the rings from blood outward, a count each and a depth score. */
export function SocialCircle({ s }: { s: GameState }) {
  const c = useMemo(() => socialCircle(s), [s]);
  const [pick, setPick] = useState<RingId | undefined>();
  const ring = c.rings.find((r) => r.id === pick);
  return (
    <Section title="How deep your circle goes" domain="family" testid="social-circle" aside={<span data-testid="circle-depth">Depth <b className="text-stone-100">{c.depth}</b>/100</span>}
      sub={`${c.word}. ${c.total} people, from your blood out to the people who only know your name.`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative mx-auto aspect-square w-48 shrink-0" aria-hidden>
          {c.rings.slice().reverse().map((r, i) => {
            const k = c.rings.length - i;
            const pct = 100 * (k / c.rings.length);
            return <div key={r.id} className="absolute rounded-full border" style={{ width: `${pct}%`, height: `${pct}%`, left: `${(100 - pct) / 2}%`, top: `${(100 - pct) / 2}%`, borderColor: `rgb(var(${RING_TONE[r.id]}))`, background: `rgb(var(${RING_TONE[r.id]}) / ${r.count ? 0.16 : 0.04})` }} />;
          })}
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-stone-100">You</div>
        </div>
        <ol className="flex-1 space-y-1">
          {c.rings.map((r, i) => (
            <li key={r.id}>
              <button type="button" onClick={() => setPick(pick === r.id ? undefined : r.id)} aria-pressed={pick === r.id} data-testid={`ring-${r.id}`}
                className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-[12px] ${pick === r.id ? 'border-gold-400' : 'border-noir-700 hover:border-noir-500'}`}>
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(var(${RING_TONE[r.id]}))` }} />
                <span className="text-stone-500">{i + 1}</span>
                <span className="flex-1 text-stone-200">{r.label}</span>
                <span className="tabular-nums text-stone-100">{r.count}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      {ring && (
        <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="ring-people">
          {ring.ids.slice(0, 24).map((id) => <li key={id} className="text-[12px]"><CharLink s={s} id={id} /></li>)}
          {ring.ids.length > 24 && <li className="text-[11px] text-stone-500">and {ring.ids.length - 24} more</li>}
          {!ring.ids.length && <li className="text-[12px] text-stone-500">Nobody yet.</li>}
        </ul>
      )}
    </Section>
  );
}
