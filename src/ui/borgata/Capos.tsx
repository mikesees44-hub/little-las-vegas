import { previewAction } from '../../engine/actions';
import { capos, crew, displayName, isFree } from '../../engine/characters';
import { capoDistrict } from '../../engine/candidates';
import { seatOf, SEAT_INFO } from '../../engine/council';
import { POLICY_LABEL, SPECIALTY_INFO } from '../../engine/crewlife';
import { CAPO_CUT, skimRate } from '../../engine/economy';
import { regime } from '../../engine/hierarchy';
import { opinion } from '../../engine/relations';
import { ageOn } from '../../engine/calendar';
import type { Character, GameState, PlayerAction, Rank, Seat } from '../../engine/types';
import { fmt$ } from '../format';
import { OpinionBadge } from '../components/CrewList';
import { useOrders } from '../components/Orders';
import { CharLink, Face, TraitIcons } from '../components/People';
import { useClarity } from '../clarity/context';
import { MoreButton } from '../sheet/MoreButton';
import { RichTip } from '../shell/Num';

const same = (a: PlayerAction, b: PlayerAction) => JSON.stringify(a) === JSON.stringify(b);

/** −/+ on a capo's contract, the odds he says yes shown inline. */
function ContractStepper({ s, c }: { s: GameState; c: Character }) {
  const { orders, queue, remove } = useOrders();
  const keep = c.keep ?? CAPO_CUT;
  const step = (d: number): PlayerAction => ({ kind: 'contract', charId: c.id, keep: Math.round((keep + d) * 100) / 100 });
  const pending = orders.findIndex((o) => o.kind === 'contract' && o.charId === c.id);
  const btn = (d: number, ok: boolean) => {
    const a = step(d);
    const p = previewAction(s, a);
    const odds = p.acceptance ? Math.round(p.acceptance.chance * 100) : undefined;
    const why = p.disabledReason;
    const on = pending >= 0 && same(orders[pending], a);
    return (
      <RichTip align="right" tip={<><span className="block font-semibold text-gold-300">{p.title}</span>{p.detail}{odds !== undefined && <span className="block">Will accept: {odds}%{p.acceptance!.reasons.slice(0, 4).map((r, i) => <span key={i} className="block text-stone-400">{r.value > 0 ? '+' : ''}{r.value} {r.label}</span>)}</span>}{why && <span className="block text-red-300">{why}</span>}</>}>
        <button type="button" disabled={!ok || !!why || !!s.gameOver} onClick={() => { if (pending >= 0) remove(pending); if (!on) queue(a); }}
          className={`h-6 w-6 rounded border text-sm leading-none ${on ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-200 hover:border-gold-500'} disabled:opacity-30`}
          aria-label={d < 0 ? 'Squeeze his contract 5%' : 'Ease his contract 5%'}>{d < 0 ? '−' : '+'}</button>
      </RichTip>
    );
  };
  const pendingKeep = pending >= 0 ? (orders[pending] as Extract<PlayerAction, { kind: 'contract' }>).keep : undefined;
  const odds = pendingKeep !== undefined ? previewAction(s, orders[pending]).acceptance : undefined;
  return (
    <div className="flex items-center gap-1 text-[11px]" data-testid="contract-stepper">
      <span className="text-stone-500">keeps</span>
      {btn(-0.05, keep > 0.2)}
      <span className="w-14 text-center tabular-nums text-stone-100">{Math.round(keep * 100)}%{pendingKeep !== undefined && <span className="text-gold-300"> → {Math.round(pendingKeep * 100)}</span>}</span>
      {btn(0.05, keep < 0.45)}
      {odds && <span className={Math.round(odds.chance * 100) >= 60 ? 'text-emerald-300' : 'text-amber-300'}>{Math.round(odds.chance * 100)}% yes</span>}
    </div>
  );
}

/** A district with no capo: who should step up, compared. */
function NextCapo({ s }: { s: GameState }) {
  const { openPicker } = useClarity();
  const d = capoDistrict(s);
  if (!d || s.gameOver) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-700/50 bg-amber-900/10 px-2.5 py-1.5 text-xs text-amber-200" data-testid="next-capo">
      <span>{d.name} has no capo: the take leaks until someone runs it.</span>
      <button type="button" className="rounded border border-gold-500 px-2 py-0.5 font-semibold text-gold-300 hover:bg-gold-500/15" onClick={() => openPicker({ kind: 'capo', district: d.id })}>Appoint… compare</button>
    </div>
  );
}

/** The Borgata › Capos & Men: each capo with his contract stepper; every man a status row and "⋯". */
export function CaposSection({ s }: { s: GameState }) {
  const list = capos(s);
  return (
    <section className="space-y-2" data-testid="capos">
      <div className="panel-title">Capos</div>
      <p className="text-xs text-stone-500">Each capo holds a district and keeps a share of its take ({Math.round(CAPO_CUT * 100)}% is the custom). Squeeze the contract and he may refuse, and remember. Hover −/+ for his odds.</p>
      <NextCapo s={s} />
      {list.map((c) => {
        const d = s.districts.find((x) => x.capoId === c.id);
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-noir-700 bg-noir-800/60 p-2">
            <Face s={s} c={c} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold"><CharLink s={s} id={c.id} /> <span className="text-xs font-normal text-stone-500">{d ? `holds ${d.name}` : 'no district'}</span></div>
              <div className="text-[11px] text-stone-400">skims ~{Math.round(skimRate(s, c) * 100)}% · his own money {fmt$(c.wealth)} · {regime(s, c.id).length} men</div>
              <TraitIcons c={c} />
            </div>
            <ContractStepper s={s} c={c} />
            <OpinionBadge v={opinion(s, c.id, s.playerId)} />
            <MoreButton id={c.id} category="business" />
          </div>
        );
      })}
      {list.length === 0 && <div className="text-xs text-stone-500">No capos. Promote a soldier: ⋯ on his row.</div>}
    </section>
  );
}

const RANK_ORDER: Rank[] = ['underboss', 'consigliere', 'capo', 'soldier', 'associate'];

/** Soldiers and associates: status only; the verbs are on "⋯". */
export function MenRoster({ s }: { s: GameState }) {
  const men = crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate').sort((a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));
  return (
    <section data-testid="men">
      <div className="panel-title">The men</div>
      <p className="text-xs text-stone-500">Soldiers and associates hustle for themselves; their hustle sets how much comes to you. Men nobody talks to drift toward rivals. ⋯ for everything you can do to one.</p>
      <ul className="mt-2 divide-y divide-noir-800">
        {men.map((c) => {
          const seat = seatOf(s, c.id);
          return (
            <li key={c.id} className="flex items-center gap-2 py-1.5">
              <Face s={s} c={c} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm"><CharLink s={s} id={c.id}>{displayName(c)}</CharLink>{c.dynasty && <span className="ml-1 text-gold-400" title="Member of the house">♦</span>}</div>
                <div className="text-[11px] text-stone-400">
                  <span className="capitalize">{c.specialty ? SPECIALTY_INFO[c.specialty].name : c.rank}</span>{seat && <> · {SEAT_INFO[seat as Seat].name}</>} · {ageOn(c.birth, s.date)} · {fmt$(c.wealth)}
                  {!c.specialty && <> · <span className="text-stone-300">{POLICY_LABEL[c.policy ?? 'tax']}</span></>}
                  {(c.defectStage ?? 0) > 0 && <span className="text-red-400"> · ⚠ drifting</span>}
                  {!isFree(s, c) && <span className="text-red-400"> · jailed to wk {c.imprisonedUntil}</span>}
                  {(c.neglect ?? 0) >= 8 && <span className="text-amber-400"> · ignored {c.neglect} wks</span>}
                </div>
              </div>
              <OpinionBadge v={opinion(s, c.id, s.playerId)} />
              <MoreButton id={c.id} category="business" />
            </li>
          );
        })}
        {men.length === 0 && <li className="py-2 text-xs text-stone-500">No soldiers or associates yet.</li>}
      </ul>
    </section>
  );
}
