import { dateOfWeek, formatDate } from '../../engine/calendar';
import { finView, type Label } from '../../engine/crewFinance';
import { characterDealings } from '../../engine/livingView';
import type { Character, GameState } from '../../engine/types';
import { getSettings } from '../settings';
import { SeenChip } from '../town/Happening';

/**
 * A man's Financial Life, as the boss knows it: what his envelope's books
 * verify, what has been reported, what is only talk, and estimates. Never his
 * exact private balance or a hidden skim (Settings → Show internal ids shows
 * the developer's truth). Self-contained so it can sit in any sheet tab.
 */

const TONE: Record<Label, string> = {
  verified: 'border-emerald-700 text-emerald-300',
  reported: 'border-sky-700 text-sky-300',
  rumor: 'border-amber-700 text-amber-300',
  estimate: 'border-stone-600 text-stone-400',
};

function Tag({ l }: { l: Label }) {
  return <span className={`ml-1 inline-block rounded border px-1 text-[10px] uppercase tracking-wide ${TONE[l]}`}>{l}</span>;
}

function Line({ text, label }: { text: string; label: Label }) {
  return <li className="text-xs text-stone-300">{text}<Tag l={label} /></li>;
}

export function FinancialLife({ s, c }: { s: GameState; c: Character }) {
  if (c.id === s.playerId) return null;
  const dev = !!getSettings().devIds;
  const v = finView(s, c, dev);
  const dealings = characterDealings(s, c.id, 6);
  const sec = (title: string, rows: { text: string; label: Label }[], empty: string) => (
    <details className="group" open={rows.length > 0 && rows.length <= 3}>
      <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-stone-500">{title} <span className="normal-case tracking-normal text-stone-600">({rows.length ? `${rows.length} known` : 'nothing known'}) · More…</span></summary>
      {rows.length ? <ul>{rows.map((r, i) => <Line key={i} text={r.text} label={r.label} />)}</ul> : <div className="text-xs text-stone-500">{empty}</div>}
    </details>
  );
  return (
    <section className="space-y-2" data-testid="financial-life">
      <div className="panel-title">Financial life</div>
      <div className="text-[11px] text-stone-500">What you know of his money. <span className="text-emerald-300">Verified</span>: in the envelope's books or plain to see. <span className="text-sky-300">Reported</span>: someone told you. <span className="text-amber-300">Rumor</span>: talk. <span className="text-stone-400">Estimate</span>: your own read.</div>
      <ul>
        <Line text={`Cash: ${v.cash.text}`} label={v.cash.label} />
        {v.savings && <Line text={v.savings.text} label={v.savings.label} />}
        <Line text={`Wants ${v.goal.text}`} label={v.goal.label} />
        <Line text={`With money: ${v.risk.text}`} label={v.risk.label} />
      </ul>
      {sec('Income', v.income, 'Nothing on the books yet.')}
      {sec('What he owns', v.assets, 'Nothing you know of.')}
      {sec('What he owes', v.debts, 'Nothing you know of.')}
      {v.hist.length > 0 && (
        <details open={v.hist.length <= 3}>
          <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-stone-500">Big money moments <span className="normal-case tracking-normal text-stone-600">({v.hist.length}) · More…</span></summary>
          <ul>{v.hist.map((h, i) => <li key={i} className="text-xs text-stone-300"><span className="text-stone-500 tabular-nums">{formatDate(dateOfWeek(Math.max(1, h.w)))}</span> — {h.text}<Tag l={h.label} /></li>)}</ul>
        </details>
      )}
      {dealings.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500">On the Boardwalk</div>
          <ul>{dealings.map((f) => <li key={f.id} className="text-xs text-stone-300">{f.seen.lvl === 'rumor' ? <span className="italic">“{f.text}”</span> : f.text} <SeenChip seen={f.seen} /></li>)}</ul>
        </div>
      )}
      {v.dev && (
        <div className="rounded border border-dashed border-stone-600 px-2 py-1 text-[11px] text-stone-400" data-testid="financial-dev">
          Developer inspector: own money ${v.dev.wealth}, bank ${v.dev.bank}, books explain ${v.dev.est}; assets {v.dev.assets.map((a) => `${a.k} ${a.value}`).join(', ') || '—'}; loans {v.dev.loans.map((d) => `${d.lender} ${d.out}`).join(', ') || '—'}
        </div>
      )}
    </section>
  );
}
