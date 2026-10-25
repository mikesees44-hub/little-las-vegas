import { useMemo, useState } from 'react';
import { rankCandidates, type Candidate, type Chip, type Ranking, type Role } from '../../engine/candidates';
import type { GameState, PlayerAction } from '../../engine/types';
import { signed } from '../format';
import { Modal } from '../components/Modal';
import { useOrders } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { AdvisorQuotes } from './AdvisorQuote';
import { actionVerb } from '../verbs';
import { Tip } from './Tip';

/**
 * Side-by-side candidates for any "pick a person" decision: predicted
 * outcome, pros and cons as small chips, risk flags, the opportunity cost,
 * Recommended and Alternative badges, and the advisors' (possibly partial)
 * advice. Sortable by outcome, loyalty or risk.
 *
 * By default picking a man queues his order. Pass `onPick` to do something
 * else (name an heir, choose a match), or `selected` + `onToggle` to build a
 * team (scheme agents).
 */

type SortKey = 'outcome' | 'loyalty' | 'risk';

const same = (a: PlayerAction, b: PlayerAction) => JSON.stringify(a) === JSON.stringify(b);

function ChipRow({ items, tone }: { items: Chip[]; tone?: 'flag' }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((x, i) => (
        <span key={i} className={tone === 'flag' ? (x.tone === 'bad' ? 'chip bg-amber-900/40 text-amber-200 border border-amber-700/60' : 'chip-neutral') : x.tone === 'good' ? 'chip-good' : x.tone === 'bad' ? 'chip-bad' : 'chip-neutral'}>
          {tone === 'flag' && x.tone === 'bad' ? '⚑ ' : ''}{x.text}
        </span>
      ))}
    </div>
  );
}

function Meter({ v, label }: { v: number; label: string }) {
  const color = v >= 70 ? 'bg-emerald-500' : v >= 45 ? 'bg-gold-500' : 'bg-blood-400';
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-stone-500" title={`${label}: ${v}/100`}>
      <span className="w-14 shrink-0 uppercase tracking-wider">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-noir-700"><div className={`h-full ${color}`} style={{ width: `${v}%` }} /></div>
      <span className="w-6 text-right tabular-nums text-stone-300">{v}</span>
    </div>
  );
}

export function CandidateCard({ s, c, ranking, picked, onPick, pickLabel }: {
  s: GameState;
  c: Candidate;
  ranking: Ranking;
  picked: boolean;
  onPick?: () => void;
  pickLabel?: string;
}) {
  const ch = c.charId ? s.characters[c.charId] : undefined;
  const rec = ranking.recommendedId === c.id;
  const alt = ranking.alternativeId === c.id;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 rounded-md border p-2.5 ${picked ? 'border-gold-400 bg-gold-500/10' : rec ? 'border-gold-600/70 bg-noir-800/80' : 'border-noir-700 bg-noir-800/60'} ${c.disabledReason ? 'opacity-60' : ''}`} data-testid="candidate-card">
      <div className="flex items-start gap-2">
        {ch && <Face s={s} c={ch} size={44} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            {rec && <span className="rounded bg-gold-500 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-noir-950" data-testid="badge-recommended">Recommended</span>}
            {alt && <span className="rounded border border-sky-600 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-sky-300" data-testid="badge-alternative">{ranking.alternativeWhy ?? 'Alternative'}</span>}
          </div>
          <div className="text-sm font-semibold leading-tight text-stone-100 break-words">{ch ? <CharLink s={s} id={ch.id}>{c.name}</CharLink> : c.name}</div>
          <div className="text-[11px] leading-snug text-gold-300">{c.outcome}</div>
        </div>
      </div>
      <Meter v={c.score} label="Outcome" />
      <Meter v={c.safety} label="Safety" />
      {(c.opinion !== undefined || c.capoLoyalty !== undefined) && (
        <div className="flex flex-wrap gap-x-3 text-[11px] text-stone-400">
          {c.opinion !== undefined && <Tip term="opinion"><span>Of you <span className={`tabular-nums font-semibold ${c.opinion >= 25 ? 'text-emerald-300' : c.opinion <= -20 ? 'text-red-300' : 'text-stone-200'}`}>{signed(c.opinion)}</span></span></Tip>}
          {c.capoLoyalty !== undefined && <Tip term="loyalty"><span>Of his capo <span className="tabular-nums font-semibold text-stone-200">{signed(c.capoLoyalty)}</span></span></Tip>}
        </div>
      )}
      <ChipRow items={c.pros} />
      <ChipRow items={c.cons} />
      <ChipRow items={c.flags} tone="flag" />
      {c.opportunityCost && <div className="text-[11px] text-stone-500"><span className="text-stone-400">{/^Pulled from: |hustle/.test(c.opportunityCost) ? 'Cost of moving him: ' : 'Cost: '}</span>{c.opportunityCost.replace(/^Pulled from: /, '')}</div>}
      <div className="mt-auto pt-1">
        {c.disabledReason ? (
          <div className="text-[11px] text-red-400">{c.disabledReason}</div>
        ) : onPick ? (
          <button type="button" className={picked ? 'btn-ghost w-full py-1 text-xs' : 'btn-gold w-full py-1 text-xs'} onClick={onPick} data-testid="pick">
            {pickLabel ?? (picked ? 'Picked' : 'Pick')}
          </button>
        ) : (
          <div className="text-center text-[11px] text-stone-500">Already where he is: keep him</div>
        )}
      </div>
    </div>
  );
}

export function CandidatePicker({ s, role, pool, onPick, selected, onToggle, limit = 6, hideAdvisors, ranking: given }: {
  s: GameState;
  role: Role;
  pool?: string[];
  onPick?: (c: Candidate) => void;
  selected?: string[];
  onToggle?: (id: string) => void;
  limit?: number;
  hideAdvisors?: boolean;
  ranking?: Ranking;
}) {
  const { orders, queue } = useOrders();
  const [sort, setSort] = useState<SortKey>('outcome');
  const [all, setAll] = useState(false);
  const ranking = useMemo(() => given ?? rankCandidates(s, role, pool), [given, s, role, pool]);
  const list = useMemo(() => {
    const xs = [...ranking.candidates];
    if (sort === 'loyalty') xs.sort((a, b) => (b.opinion ?? -999) - (a.opinion ?? -999) || b.score - a.score);
    if (sort === 'risk') xs.sort((a, b) => b.safety - a.safety || b.score - a.score);
    // Keep the two badged picks visible whatever the sort.
    const shown = all ? xs : xs.slice(0, limit);
    for (const id of [ranking.recommendedId, ranking.alternativeId]) {
      const c = id ? xs.find((x) => x.id === id) : undefined;
      if (c && !shown.includes(c)) shown.push(c);
    }
    return shown;
  }, [ranking, sort, all, limit]);
  if (!ranking.candidates.length) return <div className="text-xs text-stone-500" data-testid="candidate-picker">Nobody can do this right now.</div>;
  return (
    <div className="space-y-2" data-testid="candidate-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-base text-gold-400">{ranking.question}</div>
        <div className="flex gap-1" role="radiogroup" aria-label="Sort candidates">
          {(['outcome', 'loyalty', 'risk'] as SortKey[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={sort === k} onClick={() => setSort(k)} className={`rounded border px-2 py-0.5 text-[11px] ${sort === k ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>
              {k === 'outcome' ? 'Best outcome' : k === 'loyalty' ? 'Most loyal' : 'Least risk'}
            </button>
          ))}
        </div>
      </div>
      {!hideAdvisors && <AdvisorQuotes s={s} ranking={ranking} />}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => {
          const team = !!onToggle;
          const picked = team ? !!selected?.includes(c.id) : !!c.action && orders.some((o) => same(o, c.action!));
          const handler = team ? () => onToggle!(c.id) : onPick ? () => onPick(c) : c.action ? () => queue(c.action!) : undefined;
          return (
            <CandidateCard key={c.id} s={s} c={c} ranking={ranking} picked={picked || (!!selected && selected.includes(c.id))} onPick={picked && !team ? undefined : handler}
              pickLabel={team ? (picked ? 'On the team ✓ (remove)' : 'Add to the team') : onPick ? (selected?.includes(c.id) ? 'Chosen' : 'Choose') : c.action ? actionVerb(c.action).verb : 'Choose'} />
          );
        })}
      </div>
      {ranking.candidates.length > limit && (
        <button type="button" className="text-[11px] text-gold-300 underline" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${ranking.candidates.length}`}</button>
      )}
    </div>
  );
}

/** The picker in a modal (opened from anywhere through the clarity context). */
export function PickerModal({ s, role, pool, onPick, onClose }: { s: GameState; role: Role; pool?: string[]; onPick?: (c: Candidate) => void; onClose: () => void }) {
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5" data-testid="picker-modal">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Compare candidates</div>
          <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
        <CandidatePicker s={s} role={role} pool={pool} onPick={onPick ? (c) => { onPick(c); onClose(); } : undefined} />
        <p className="mt-2 text-[11px] text-stone-500">Ordering a pick queues it for this week; it happens when you advance. Outcome mixes how good he is at it (70%) with how little can go wrong (30%), less a little for every job he already does.</p>
      </div>
    </Modal>
  );
}
