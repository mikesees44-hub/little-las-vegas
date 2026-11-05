import { useState } from 'react';
import { adultOn } from '../../engine/datingState';
import { askerOf, herBestFirst, herLog, herRows, herSummary, OFFER_LABEL, OFFER_OPS, OFFERS, PATHS, PATH_ORDER, VIA_LABEL, VIAS, type HerOffer, type HerPath, type HerRow, type HerVia } from '../../engine/herway';
import { previewAction } from '../../engine/actions';
import { oddsWord } from '../../engine/decide';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { PlayCard, Section, StatChip } from '../components/Layout';
import { CharLink, Face } from '../components/People';
import type { Domain } from '../domain';
import { fmt$ } from '../format';

/** Each path wears its domain: the money paths green, politics navy, the night rose, what she hears the law's. */
const PATH_DOMAIN: Record<HerPath, Domain> = { street: 'romance', numbers: 'money', books: 'money', fronts: 'money', politics: 'politics', info: 'law' };

const OWN_LABEL = { goomar: 'Your goomar', widow: 'A widow of the Family', daughter: 'Your daughter' } as const;

/**
 * WOMEN OF THE TOWN (engine/herway.ts): the women who earn their own way, by path. Each card: her face,
 * her path and rung, what she makes and what comes to you, her standing and heat, whom she kicks up to,
 * her risks, and what you can do about her (the odds on each order before you choose, settled on the spot,
 * in Your File). A madam's card is her Nightlife house. She always decides.
 */
export function HerBook({ s }: { s: GameState }) {
  const [path, setPath] = useState<HerPath | 'all' | 'mine'>('all');
  const rows = herRows(s);
  const sum = herSummary(s);
  const paths = PATH_ORDER.filter((p) => p !== 'street' || adultOn(s));
  const list = rows.filter((r) => path === 'all' || (path === 'mine' ? r.side === 'player' || !!r.own : r.path === path));
  const chip = (id: HerPath | 'all' | 'mine', label: string, n: number) => (
    <button key={id} type="button" aria-pressed={path === id} onClick={() => setPath(id)} className={`rounded-full border px-2.5 py-0.5 text-[12px] ${path === id ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-300 hover:border-noir-500'}`} data-testid={`her-filter-${id}`}>{label} <span className="opacity-60">{n}</span></button>
  );
  const log = herLog(s, 10);
  return (
    <div className="space-y-3" data-testid="her-book">
      <Section title="Women of the town" domain="money" sub="Women who found their own way into the deep world and into power, and earn. Adults only; every deal is her yes or no; no debt is held over anyone.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatChip label="Women earning" value={sum.women} domain="money" testid="her-stat-women" />
          <StatChip label="Their week" value={fmt$(sum.weekly)} domain="money" />
          <StatChip label="To the Family" value={fmt$(sum.toFamily)} tone={sum.toFamily > 0 ? 'good' : sum.toFamily < 0 ? 'bad' : undefined} domain="money" testid="her-stat-family" />
          <StatChip label="With you" value={sum.withYou} sub={sum.rivals ? `${sum.rivals} a rival to you` : undefined} tone={sum.rivals ? 'warn' : undefined} domain="money" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Path">
          {chip('all', 'Everyone', rows.length)}
          {chip('mine', 'With you', rows.filter((r) => r.side === 'player' || !!r.own).length)}
          {paths.map((p) => chip(p, PATHS[p].label, rows.filter((r) => r.path === p).length))}
        </div>
        {path !== 'all' && path !== 'mine' && <p className="mt-1 text-[11.5px] text-stone-400" data-testid="her-path-blurb">{PATHS[path].blurb} The rungs: {PATHS[path].rungs.join(' → ')}.</p>}
      </Section>
      <ul className="grid gap-3 md:grid-cols-2" data-testid="her-list">
        {list.map((r) => <HerCard key={r.id} s={s} r={r} />)}
      </ul>
      {!list.length && <p className="text-center text-[13px] text-stone-500">Nobody on that path right now.</p>}
      {log.length > 0 && (
        <Section title="Lately" domain="money">
          <ul className="space-y-0.5 text-[12px] text-stone-300" data-testid="her-log">{log.map((l, i) => <li key={i}><span className="text-stone-500">Week {l.week}:</span> {l.text}</li>)}</ul>
        </Section>
      )}
    </div>
  );
}

function Bar({ v, tone }: { v: number; tone: string }) {
  return <span className="inline-block h-1.5 w-14 shrink-0 overflow-hidden rounded bg-noir-700 align-middle"><span className={`block h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>;
}

function HerCard({ s, r }: { s: GameState; r: HerRow }) {
  const [more, setMore] = useState(false);
  const [story, setStory] = useState(false);
  const [via, setVia] = useState<HerVia>('boss');
  const [offer, setOffer] = useState<HerOffer>('fair');
  const c = s.characters[r.id];
  if (!c) return null;
  // Who asks and what he offers ride on every offer (partner, protect, hire, lend, back, ears).
  const isOffer = (a: PlayerAction) => a.kind === 'herway' && (OFFER_OPS as readonly string[]).includes(a.op.op);
  const acts = herBestFirst(s, r.id).map((a) => (a.kind === 'herway' && isOffer(a) ? ({ ...a, op: { ...a.op, via, offer } } as PlayerAction) : a));
  const lead = acts.find((a) => isOffer(a) && !previewAction(s, a).disabledReason) ?? acts.find(isOffer);
  const lp = lead ? previewAction(s, lead) : undefined;
  const acc = lp?.acceptance;
  const breakdown = acc ? acc.reasons.filter((x) => x.label !== 'Base').map((x) => `${x.label} ${x.value > 0 ? '+' : '−'}${Math.abs(x.value)}`).join(' · ') : undefined;
  const shown = acts.slice(0, 2);
  const rest = acts.slice(2);
  const d = PATH_DOMAIN[r.path];
  return (
    <PlayCard as="li" d={d} testid="her-card" dataAttrs={{ 'data-id': r.id, 'data-path': r.path }} tone={r.rival ? 'urgent' : undefined}
      art={<Face s={s} c={c} size={64} />}
      corner={<span className="rounded border border-noir-600 bg-noir-900/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-stone-200" data-testid="her-path">{r.pathLabel}</span>}
      caption={r.own ? OWN_LABEL[r.own] : r.rival ? 'A rival to you' : undefined}
      title={<CharLink s={s} id={r.id} />}
      lines={[<>{r.age} · <b>{r.title}</b> · {r.venue}</>, <span data-testid="her-income">{fmt$(r.income)} a week{r.toFamily ? <> · <span className={r.toFamily > 0 ? 'text-emerald-300' : 'text-amber-300'}>{r.toFamily > 0 ? '+' : '−'}{fmt$(Math.abs(r.toFamily))} to the Family</span></> : null}</span>]}>
      <div className="mt-1 space-y-0.5 text-[11.5px] text-stone-300">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span>Standing <Bar v={r.standing} tone="bg-emerald-400" /> {r.standing}</span>
          {r.path !== 'politics' && r.path !== 'info' && <span>Heat <Bar v={r.heat} tone="bg-red-400" /> {r.heat}</span>}
        </div>
        <div className="text-stone-400" data-testid="her-side">{r.sideLabel} · {r.dealLabel}</div>
        {r.risks.length > 0 && <ul className="text-red-300/90" data-testid="her-risks">{r.risks.slice(0, 3).map((x, i) => <li key={i}>⚠ {x}</li>)}</ul>}
      </div>
      {r.path !== 'street' && (
        <div className="mt-2 rounded border border-noir-700 bg-noir-900/40 p-1.5 text-[11px]" data-testid="her-offer">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="text-stone-400">Who asks
              <select className="ml-1 rounded border border-noir-600 bg-noir-800 px-1 py-0.5 text-stone-200" value={via} onChange={(ev) => setVia(ev.target.value as HerVia)} data-testid="her-via">
                {VIAS.map((v) => <option key={v} value={v} disabled={!askerOf(s, v)}>{VIA_LABEL[v]}{!askerOf(s, v) ? ' (nobody free)' : ''}</option>)}
              </select>
            </label>
            <span className="flex flex-wrap gap-1" role="group" aria-label="What you offer">
              {OFFERS.map((o) => <button key={o} type="button" aria-pressed={offer === o} onClick={() => setOffer(o)} className={`rounded border px-1.5 py-0.5 ${offer === o ? 'border-gold-400 text-gold-200' : 'border-noir-600 text-stone-300'}`} data-testid={`her-offer-${o}`}>{OFFER_LABEL[o]}</button>)}
            </span>
          </div>
          {acc && lp && <div className="mt-1 text-stone-400" data-testid="her-breakdown"><b className="text-stone-200">{lp.title}:</b> {Math.round(acc.chance * 100)}% <i>{oddsWord(acc.chance)}</i>{breakdown ? ` · ${breakdown}` : ''}. Her choice either way.</div>}
        </div>
      )}
      {shown.length > 0 && <div className="mt-2 space-y-1">{shown.map((a, i) => <ActionRow key={i} s={s} action={a} />)}</div>}
      <div className="mt-1 flex flex-wrap gap-3">
        {rest.length > 0 && <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" onClick={() => setMore((x) => !x)} aria-expanded={more} data-testid="her-more">{more ? 'Fewer' : `More… (${rest.length})`}</button>}
        {r.hist.length > 0 && <button type="button" className="text-[11px] text-stone-400 hover:text-stone-200" onClick={() => setStory((x) => !x)} aria-expanded={story} data-testid="her-story-toggle">{story ? 'Hide her story' : 'Her story'}</button>}
      </div>
      {more && <div className="mt-1 space-y-1">{rest.map((a, i) => <ActionRow key={i} s={s} action={a} />)}</div>}
      {story && <ul className="mt-1 space-y-0.5 text-[11px] text-stone-400" data-testid="her-story">{r.hist.slice().reverse().map(([w, t], i) => <li key={i}><span className="text-stone-500">Week {w}:</span> {t}</li>)}</ul>}
      {r.path === 'street' && <p className="mt-1 text-[10.5px] text-stone-500">Her house's deal is the same as in Nightlife.</p>}
    </PlayCard>
  );
}
