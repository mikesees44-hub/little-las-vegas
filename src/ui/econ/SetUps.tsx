import { useState } from 'react';
import { crew } from '../../engine/characters';
import { envelopeSize } from '../../engine/events';
import {
  canHoldSpot, fineOf, incomeSources, kickupChain, rivalChain, RISK_WORD, spotOf, spotOffers, sponsors, sponsorWord, SPOTS,
  type ChainRow, type SpotKind,
} from '../../engine/kickup';
import { askMeans, counterOdds, openAsks, quickRackets, repWord, suggestAll, tenantsOf, TRADES, type PlaceAsk } from '../../engine/placeAsks';
import { previewAction } from '../../engine/actions';
import type { Character, GameState, PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard, useOrders } from '../components/Orders';
import { CharLink } from '../components/People';
import { WorkPlaceSheet } from './WorkPlace';

/**
 * SET-UPS AND THE KICK-UP CHAIN (engine/kickup.ts, engine/placeAsks.ts).
 *  - SpotLine: one man's spot (or "Set him up with…"), and the answers to a short envelope or a big earner;
 *    used on his sheet's Family-business menu, the My Men list and the Racket hub.
 *  - SetUpPicker: every kind of spot for him, what he'd earn, his share and kick-up, the risk, the sponsor.
 *  - KickupChainView: each man's week, what he kept, what he passed up, who is short; then the
 *    underboss's count, your envelope, Philadelphia's end; and the other families' chains.
 *  - PlaceRequests: men asking to run their thing out of your places (accept, counter, refuse, later).
 *  - QuickRacket / SetUpAllSuggested: a racket at a place of yours in two clicks.
 */

const build = (who: string, spot: SpotKind, by?: string): PlayerAction => ({ kind: 'econ', op: { type: 'setup', who, spot, ...(by ? { by } : {}) } });

/** Every kind of spot for one man: pick the sponsor, see what it pays, set him up. */
export function SetUpPicker({ s, who }: { s: GameState; who: string }) {
  const c = s.characters[who];
  const spons = sponsors(s).filter((x) => x.id !== who);
  const [by, setBy] = useState<string>(spons[0]?.id ?? s.playerId);
  const [all, setAll] = useState(false);
  if (!c || !canHoldSpot(s, c)) return <p className="text-[11px] text-stone-500">He can't be set up now.</p>;
  const offers = spotOffers(s, c, by);
  const shown = all ? offers : offers.slice(0, 3);
  return (
    <div className="mt-1.5 space-y-1.5" data-testid="setup-picker" data-who={who}>
      <div className="flex flex-wrap items-center gap-1 text-[11px]" role="radiogroup" aria-label="Who sets him up">
        <span className="text-stone-500">Who sets him up (gets his loyalty and a 10% piece):</span>
        {spons.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={by === x.id} onClick={() => setBy(x.id)} data-testid={`sponsor-${x.id === s.playerId ? 'boss' : x.id}`}
            className={`rounded border px-2 py-0.5 ${by === x.id ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>
            {x.id === s.playerId ? 'You' : sponsorWord(s, x.id)}
          </button>
        ))}
      </div>
      <ul className="space-y-1">
        {shown.map((o) => (
          <li key={o.k} className="rounded border border-noir-700 bg-noir-900/50 px-2 py-1" data-testid="setup-offer" data-kind={o.k}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px]">
              <span className="font-semibold text-stone-200">{SPOTS[o.k].what}</span>
              <span className="tabular-nums text-gold-300">~{fmt$(o.gross)}/wk <span className="text-stone-500">(season {fmt$(o.summer)}, winter {fmt$(o.winter)})</span></span>
            </div>
            <div className="text-[10px] text-stone-400">He keeps {o.keep}% · kicks up {o.up}%{o.piece ? ` · ${o.piece}% to ${by === s.playerId ? 'your Pocket' : sponsorWord(s, by)}` : ''} · risk: {RISK_WORD[o.risk]} · stake {fmt$(o.stake)}</div>
            <div className="mt-1"><ActionCard s={s} action={build(who, o.k, by === s.playerId ? undefined : by)} compact /></div>
          </li>
        ))}
      </ul>
      {offers.length > 3 && <button type="button" className="text-[11px] text-gold-300 underline" onClick={() => setAll((x) => !x)}>{all ? 'Fewer ▴' : `All ${offers.length} kinds of spot ▾`}</button>}
    </div>
  );
}

/** One man's spot, in a line, with "Set him up with…" and the answers when he is short or wants more. */
export function SpotLine({ s, c }: { s: GameState; c: Character }) {
  const [open, setOpen] = useState(false);
  const { orders } = useOrders();
  if (!canHoldSpot(s, c)) return null;
  const sp = spotOf(s, c.id);
  const src = incomeSources(s, c);
  const ordered = orders.find((o) => o.kind === 'econ' && o.op.type === 'setup' && o.op.who === c.id);
  const short = (s.tribute?.shortHist[c.id] ?? []).filter((w) => s.week - w < 8).length;
  return (
    <div className="mt-1 text-[11px]" data-testid="spot-line" data-who={c.id}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {sp ? (
          <span className={sp.free ? 'text-amber-300' : 'text-emerald-200'}>
            {sp.free ? '⚠ Freelance: ' : '★ '}{sp.nm} · ~{fmt$(sp.a ?? sp.g ?? 0)}/wk · kicks up {sp.up}%{!sp.free && sp.by ? ` · set up by ${sponsorWord(s, sp.by)}` : ''}
            {sp.s ? <span className="text-red-300"> · {fmt$(sp.s)} short last week</span> : null}
          </span>
        ) : (
          <span className="text-amber-300">{src.length ? `Earns from ${src.join(', ')}; no spot of his own.` : 'Nothing of his own: a man with nothing drifts.'}</span>
        )}
        {ordered ? <span className="text-gold-200">Ordered: set up when the week ends.</span>
          : <button type="button" className="rounded border border-gold-500 px-1.5 py-0.5 font-semibold text-gold-300 hover:bg-gold-500/15" onClick={() => setOpen((x) => !x)} aria-expanded={open} data-testid="setup-open">{sp && !sp.free ? 'Move him to another spot…' : 'Set him up with…'}</button>}
      </div>
      {sp && !sp.free && (short >= 2 || sp.want !== undefined) && (
        <div className="mt-1 grid gap-1 sm:grid-cols-3" data-testid="spot-calls">
          {short >= 2 && (['talk', 'fine', 'pull'] as const).map((how) => <ActionCard key={how} s={s} action={{ kind: 'econ', op: { type: 'spotCall', who: c.id, how } }} compact label={how === 'fine' ? `Fine him ${fmt$(fineOf(s, c))}` : undefined} />)}
          {sp.want !== undefined && (['raise', 'hold'] as const).map((how) => <ActionCard key={how} s={s} action={{ kind: 'econ', op: { type: 'spotCall', who: c.id, how } }} compact />)}
        </div>
      )}
      {open && <SetUpPicker s={s} who={c.id} />}
    </div>
  );
}

function Row({ s, r }: { s: GameState; r: ChainRow }) {
  return (
    <tr className={r.short > 0 ? 'bg-red-900/15' : ''} data-testid="chain-row" data-who={r.id}>
      <td className="py-0.5 pr-2"><CharLink s={s} id={r.id} /> <span className="text-[10px] uppercase text-stone-500">{r.rank}</span>{r.spot && <div className="text-[10px] text-stone-500">{r.free ? 'freelance: ' : ''}{r.spot}{r.sponsor ? ` (set up by ${sponsorWord(s, r.sponsor)})` : ''}</div>}</td>
      <td className="tabular-nums text-right pr-2">{fmt$(r.gross)}</td>
      <td className="tabular-nums text-right pr-2">{fmt$(r.kept)}{r.piece ? <span className="text-stone-500"> (+{fmt$(r.piece)} sponsor)</span> : null}</td>
      <td className="tabular-nums text-right pr-2 text-gold-300">{fmt$(r.up)}</td>
      <td className="tabular-nums text-right">{r.short > 0 ? <span className="text-red-300">{fmt$(r.short)}</span> : r.arrears > 0 ? <span className="text-amber-300">owes {fmt$(r.arrears)}</span> : '—'}</td>
    </tr>
  );
}

function Table({ s, rows }: { s: GameState; rows: ChainRow[] }) {
  return (
    <table className="w-full text-[11px] text-stone-300">
      <thead><tr className="text-[10px] uppercase tracking-wider text-stone-500"><th className="text-left">Man</th><th className="text-right pr-2">Gross</th><th className="text-right pr-2">Kept</th><th className="text-right pr-2">Passed up</th><th className="text-right">Short</th></tr></thead>
      <tbody>{rows.map((r) => <Row key={r.id} s={s} r={r} />)}</tbody>
    </table>
  );
}

/** The kick-up chain: every man's week, up through his capo, the underboss, you and Philadelphia. */
export function KickupChainView({ s }: { s: GameState }) {
  let philly = 0;
  try { philly = envelopeSize(s) / 4.33; } catch { /* no history yet */ }
  const ch = kickupChain(s, philly);
  if (!ch) return <p className="text-xs text-stone-500" data-testid="kickup-chain">No envelope yet: the chain shows after the first week's count.</p>;
  const ub = ch.ubId ? s.characters[ch.ubId] : undefined;
  return (
    <section className="space-y-3" data-testid="kickup-chain">
      <div className="panel-title">The kick-up chain (week {ch.week})</div>
      <p className="text-[11px] text-stone-400">Every man earns on his own: his spot, his share of the corners, his hustle. He keeps his end and passes the rest up: a crew man to his capo, a capo to {ub ? `${ub.firstName} (the underboss)` : 'the count'}, the count into your envelope, and the family pays Philadelphia its end.</p>
      {ch.idle.length > 0 && <p className="text-[11px] text-amber-300" data-testid="chain-idle">Nothing of their own: {ch.idle.map((id) => s.characters[id]?.firstName).join(', ')}. Set them up, or they find their own hustle and drift.</p>}
      {ch.crews.map((cl) => {
        const k = s.characters[cl.capoId];
        return (
          <div key={cl.capoId} className="rounded border border-noir-700 bg-noir-900/40 p-2" data-testid="chain-crew">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
              <span className="font-semibold text-stone-200">{k ? <CharLink s={s} id={k.id} /> : 'A capo'}'s crew{cl.district ? ` · ${s.districts.find((d) => d.id === cl.district)?.name}` : ''}</span>
              <span className="text-[11px] text-stone-400">in {fmt$(cl.paidIn)} · his end {fmt$(cl.kept)}{cl.held ? ` · held back ${fmt$(cl.held)}` : ''} · <span className="text-gold-300">up {fmt$(cl.remitted)}</span>{cl.short ? <span className="text-red-300"> · short {fmt$(cl.short)}</span> : ''}</span>
            </div>
            <Table s={s} rows={cl.men} />
          </div>
        );
      })}
      {ch.direct.length > 0 && (
        <div className="rounded border border-noir-700 bg-noir-900/40 p-2" data-testid="chain-direct">
          <div className="text-xs font-semibold text-stone-200">Straight to the count (the council, men with no capo)</div>
          <Table s={s} rows={ch.direct} />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-4 text-[11px]" data-testid="chain-top">
        <Box label="The underboss's count" value={fmt$(ch.collected)} sub={ub ? `${ub.firstName} takes ${fmt$(ch.ubShare)}` : 'nobody in the seat'} />
        <Box label="Your envelope" value={fmt$(ch.presented)} sub={ch.late ? `${fmt$(ch.late)} not counted yet` : 'counted in full'} />
        <Box label="Sponsors' pieces to your Pocket" value={fmt$(ch.bossPieces)} sub="from men you set up" />
        <Box label="Philadelphia's end" value={`~${fmt$(ch.philly)}/wk`} sub="its monthly envelope" />
      </div>
      <RivalChains s={s} />
    </section>
  );
}

function Box({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-800/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-stone-100">{value}</div>
      <div className="text-[10px] text-stone-500">{sub}</div>
    </div>
  );
}

/** The other families' chains: their men's spots, what goes up to their bosses. Hit or poach an earner, and it shows. */
export function RivalChains({ s }: { s: GameState }) {
  const rs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  if (!rs.length) return null;
  return (
    <details className="rounded border border-noir-700 bg-noir-900/40 p-2" data-testid="rival-chains">
      <summary className="cursor-pointer text-xs font-semibold text-stone-200">The other families' chains</summary>
      {rs.map((r) => {
        const rows = rivalChain(s, r);
        const up = rows.reduce((a, x) => a + x.up, 0);
        return (
          <div key={r.id} className="mt-1.5" data-testid="rival-chain" data-rival={r.id}>
            <div className="text-[11px] text-stone-300">{r.name}: their men passed up <span className="text-gold-300">{fmt$(up)}</span> last week{s.tribute?.rivals[r.id]?.last ? ` · the family's week ${fmt$(s.tribute.rivals[r.id].last!.gross)}` : ''}</div>
            <ul className="text-[10px] text-stone-400">
              {rows.map((x) => <li key={x.id}><CharLink s={s} id={x.id} /> ({x.rank}): {x.spot} · {fmt$(x.gross)} gross, {fmt$(x.up)} up{x.short ? <span className="text-red-300">, {fmt$(x.short)} short</span> : ''}</li>)}
            </ul>
          </div>
        );
      })}
    </details>
  );
}

/** One request: who, what, where, the cut, the heat, his name, what it means; accept, counter, refuse, later. */
function AskCard({ s, a }: { s: GameState; a: PlaceAsk }) {
  const [cut, setCut] = useState(a.cut + 10);
  const T = TRADES[a.trade];
  return (
    <li className="rounded border border-noir-700 bg-noir-900/50 p-2" data-testid="place-ask" data-id={a.id}>
      <div className="text-xs font-semibold text-stone-200">{a.who ? <CharLink s={s} id={a.who} /> : a.name} <span className="font-normal text-stone-400">({a.from === 'own' ? 'one of yours' : a.from === 'rival' ? 'another family\'s man' : T.man})</span> wants to run {T.what} at {a.placeName}</div>
      <div className="text-[11px] text-stone-400">~{fmt$(a.gross)} a week · offers you {a.cut}% (~{fmt$(a.gross * a.cut / 100)}) · heat {T.heat >= 0.06 ? 'steady' : T.heat >= 0.03 ? 'some' : 'little'} · his name: {repWord(a.rep)} · answer by week {a.until}</div>
      <div className="text-[11px] text-amber-200">{askMeans(s, a)}</div>
      <div className="mt-1 grid gap-1 sm:grid-cols-2">
        <ActionCard s={s} action={{ kind: 'econ', op: { type: 'placeAsk', id: a.id, how: 'accept' } }} compact />
        <div>
          <label className="flex items-center gap-1 text-[10px] text-stone-400">Counter at
            <select className="rounded border border-noir-600 bg-noir-800 px-1 py-0.5 text-[11px] text-stone-200" value={cut} onChange={(e) => setCut(Number(e.target.value))} aria-label="Your counter">
              {[5, 10, 15, 20].map((d) => <option key={d} value={a.cut + d}>{a.cut + d}% ({Math.round(counterOdds(a, a.cut + d) * 100)}% he takes it)</option>)}
            </select>
          </label>
          <ActionCard s={s} action={{ kind: 'econ', op: { type: 'placeAsk', id: a.id, how: 'counter', cut } }} compact />
        </div>
        <ActionCard s={s} action={{ kind: 'econ', op: { type: 'placeAsk', id: a.id, how: 'refuse' } }} compact />
        <ActionCard s={s} action={{ kind: 'econ', op: { type: 'placeAsk', id: a.id, how: 'later' } }} compact />
      </div>
    </li>
  );
}

/** Men asking to run their thing out of your places, and the outsiders who already do. */
export function PlaceRequests({ s }: { s: GameState }) {
  const asks = openAsks(s);
  const ten = tenantsOf(s);
  return (
    <section data-testid="place-requests">
      <div className="panel-title">Requests to do business at your places</div>
      {!asks.length && <p className="text-[11px] text-stone-500">Nobody is asking right now. Word gets around when you own places: men come to you.</p>}
      <ul className="mt-1 space-y-1.5">{asks.map((a) => <AskCard key={a.id} s={s} a={a} />)}</ul>
      {ten.length > 0 && (
        <div className="mt-2 text-[11px] text-stone-400" data-testid="tenants">
          <div className="text-stone-300 font-semibold">Running at your places</div>
          <ul>{ten.map((t) => <li key={`${t.place}:${t.name}`}>{t.name}: {TRADES[t.trade].what} at {t.placeName} · {t.cut}% to you{t.paid !== undefined ? ` · ${fmt$(t.paid)} last week` : ''}{t.rival ? ' · their man (a foothold)' : ''}{t.cop ? ' · the precinct\'s friend' : ''}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

/** "Set up a racket" on a place: the three best, each with its man; one click for details, one to confirm. */
export function QuickRacket({ s, placeId }: { s: GameState; placeId: string }) {
  const { queue } = useOrders();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<number | undefined>(undefined);
  const [sheet, setSheet] = useState(false);
  const opts = open ? quickRackets(s, placeId) : [];
  return (
    <div className="mt-1" data-testid="quick-racket" data-place={placeId}>
      <button type="button" className="rounded border border-gold-500 px-2 py-0.5 text-[11px] font-semibold text-gold-300 hover:bg-gold-500/15" onClick={() => { setOpen((x) => !x); setPick(undefined); }} aria-expanded={open} data-testid="quick-racket-open">Set up a racket ▾</button>
      {open && (
        <div className="mt-1 space-y-1">
          {!opts.length && <p className="text-[11px] text-stone-500">Nothing fits here right now.</p>}
          {opts.map((o, i) => (
            <div key={o.scheme} className="rounded border border-noir-700 bg-noir-900/50 px-2 py-1" data-testid="quick-option" data-scheme={o.scheme}>
              <button type="button" className="flex w-full flex-wrap items-baseline justify-between gap-x-2 text-left text-[11px]" onClick={() => setPick(pick === i ? undefined : i)} aria-expanded={pick === i}>
                <span className="font-semibold text-stone-200">{o.title}</span>
                <span className="text-stone-400">{o.whoName} · ~{fmt$(o.take)}/wk · {fmt$(o.cost)} to set up</span>
              </button>
              {pick === i && (
                <div className="mt-1 text-[11px] text-stone-400">
                  <p>{o.line}</p>
                  <p>Heat: {o.heat}. {previewAction(s, o.action).disabledReason ?? ''}</p>
                  <button type="button" className="btn-gold mt-1 text-xs py-1" disabled={!!previewAction(s, o.action).disabledReason} onClick={() => { queue(o.action, true); setOpen(false); }} data-testid="quick-confirm">Confirm: {o.whoName} sets it up</button>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="text-[11px] text-gold-300 underline" onClick={() => setSheet(true)}>Every option for this place (Work this place)…</button>
        </div>
      )}
      {sheet && <WorkPlaceSheet s={s} place={placeId} onClose={() => setSheet(false)} />}
    </div>
  );
}

/** Every place of yours with nothing running: the best racket for each, and one confirm for all. */
export function SetUpAllSuggested({ s }: { s: GameState }) {
  const { queue } = useOrders();
  const [review, setReview] = useState(false);
  const list = suggestAll(s);
  if (!list.length) return null;
  const total = list.reduce((a, x) => a + x.pick.cost, 0);
  return (
    <section className="rounded-md border border-gold-600/50 bg-gold-500/5 p-2" data-testid="setup-all">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-stone-200">{list.length} of your places have nothing running.</span>
        <button type="button" className="rounded border border-gold-500 px-2 py-0.5 font-semibold text-gold-300" onClick={() => setReview((x) => !x)} data-testid="setup-all-open">Set up all suggested ▾</button>
      </div>
      {review && (
        <div className="mt-1 space-y-0.5 text-[11px] text-stone-300">
          {list.map((x) => <div key={x.place.id}>{x.place.name}: {x.pick.title} · {x.pick.whoName} · ~{fmt$(x.pick.take)}/wk · {fmt$(x.pick.cost)}</div>)}
          <button type="button" className="btn-gold mt-1 text-xs py-1" disabled={total > s.money} onClick={() => { for (const x of list) queue(x.pick.action, true); setReview(false); }} data-testid="setup-all-confirm">Confirm all {list.length} — {fmt$(total)}</button>
        </div>
      )}
    </section>
  );
}

/** The hub's tab: every man and his spot, the requests, the chain. */
export function SetUpsPanel({ s }: { s: GameState }) {
  const men = crew(s).filter((c) => canHoldSpot(s, c)).sort((a, b) => Number(!!spotOf(s, a.id) && !spotOf(s, a.id)?.free) - Number(!!spotOf(s, b.id) && !spotOf(s, b.id)?.free) || (a.id < b.id ? -1 : 1));
  return (
    <div className="space-y-4" data-testid="setups-panel">
      <section>
        <div className="panel-title">Set your men up</div>
        <p className="text-[11px] text-stone-400">You, the underboss or the consigliere can set any man up with a spot of his own: a numbers route, a card game, a shylock book, a bar's machines, a protection stop, a no-show job, a fence. He keeps his end, kicks up the rest, and owes the man who set him up.</p>
        <ul className="mt-1.5 space-y-1.5">
          {men.map((c) => (
            <li key={c.id} className="rounded border border-noir-700 bg-noir-900/40 px-2 py-1"><span className="text-xs font-semibold text-stone-200"><CharLink s={s} id={c.id} /></span> <span className="text-[10px] uppercase text-stone-500">{c.rank}</span><SpotLine s={s} c={c} /></li>
          ))}
        </ul>
      </section>
      <PlaceRequests s={s} />
      <SetUpAllSuggested s={s} />
      <KickupChainView s={s} />
    </div>
  );
}
