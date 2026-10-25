import { useState, type ReactNode } from 'react';
import { capos, crew, isFree } from '../../engine/characters';
import { accountsView, latestReport, memberTerms, obligations, pendingReport, UB_TYPE_LABEL } from '../../engine/tribute';
import { rivalBooksView } from '../../engine/rivalBooks';
import { REASON_LABEL, splitText, type TributeReport } from '../../engine/tributeState';
import type { GameState } from '../../engine/types';
import { owned } from '../../engine/business';
import { fmt$ } from '../format';
import { useOrders } from '../components/Orders';
import { CharLink } from '../components/People';
import { CrewTable } from './AudienceScene';
import { useTributeUi } from './context';

const TABS = [
  ['audience', 'Underboss Audience'], ['envelope', 'Envelope'], ['crews', 'Crew Contributions'], ['obligations', 'Obligations'],
  ['accounts', 'Accounts'], ['agreements', 'Agreements'], ['investments', 'Investments'], ['disputes', 'Disputes'], ['ledger', 'Historical Ledger'], ['rivals', 'Other Families'],
] as const;
type Tab = (typeof TABS)[number][0];

function Box({ title, note, children, id }: { title: string; note?: string; children: ReactNode; id?: string }) {
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/50 p-3 min-w-0" data-testid={id}>
      <div className="panel-title">{title}</div>
      {note && <p className="text-[11px] text-stone-500 mt-0.5">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

const ACCT_LABEL: Record<string, string> = { treasury: 'Family treasury', personal: 'Your own', reserve: 'Reserve', envelope: 'Pending envelope', clearing: 'Underboss clearing' };
const acctName = (s: GameState, id: string) => {
  if (ACCT_LABEL[id]) return ACCT_LABEL[id];
  if (id.startsWith('crew:')) { const c = s.characters[id.slice(5)]; return `${c?.firstName ?? '?'}'s crew account`; }
  if (id.startsWith('wealth:')) { const c = s.characters[id.slice(7)]; return `${c?.firstName ?? '?'} ${c?.lastName ?? ''} (own pocket)`; }
  if (id.startsWith('ext:street:')) return `The street: ${s.districts.find((d) => d.id === id.slice(11))?.name ?? id.slice(11)}`;
  if (id.startsWith('ext:hustle')) return 'His hustle';
  if (id.startsWith('ext:work')) return 'Crew work';
  if (id.startsWith('ext:inv')) return 'An investment';
  return id.replace(/^ext:/, '').replace(/_/g, ' ');
};

/** THE WEEKLY TAKE: every section of the money that comes up through the underboss. */
export function WeeklyTake({ s }: { s: GameState }) {
  const [tab, setTab] = useState<Tab>('audience');
  const t = s.tribute;
  const ui = useTributeUi();
  const { queue } = useOrders();
  if (!t) return <div className="text-sm text-stone-400" data-testid="weekly-take">The first envelope comes at the end of your first week.</div>;
  const rep = latestReport(s);
  const pend = pendingReport(s);
  const a = accountsView(s);
  return (
    <div className="space-y-3" data-testid="weekly-take">
      <div className="flex flex-wrap gap-1">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} data-testid={`take-tab-${id}`}
            className={`rounded border px-2 py-0.5 text-[11px] ${tab === id ? 'border-gold-500 bg-gold-500/15 text-gold-300' : 'border-noir-600 text-stone-400 hover:text-gold-300'}`}>{label}</button>
        ))}
      </div>
      {tab === 'audience' && rep && (
        <Box title="The Underboss Audience" note="Every Monday the underboss brings the take. Quiet weeks go by your standing split; he asks to see you when something needs you." id="take-audience">
          <AudienceSummary s={s} rep={rep} pending={!!pend} />
          <button type="button" className="btn-gold mt-2 text-xs" onClick={() => ui.openAudience(rep.id)} data-testid="open-office">{pend ? 'He is waiting: open the office' : 'Open the office (this week\'s report)'}</button>
        </Box>
      )}
      {tab === 'envelope' && (
        <Box title="The Envelope" note="What reached you each week and where it went." id="take-envelope">
          <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[440px]">
            <thead><tr className="text-[10px] uppercase tracking-widest text-stone-500 text-left"><th>Week</th><th className="text-right">Presented</th><th className="text-right">You</th><th className="text-right">Family</th><th className="text-right">Reserve</th><th>How</th></tr></thead>
            <tbody>{t.reports.slice().reverse().map((r) => (
              <tr key={r.id} className="border-t border-noir-800"><td>wk {r.week}</td><td className="text-right tabular-nums text-gold-300">{fmt$(r.presented)}</td>
                <td className="text-right tabular-nums">{r.alloc ? fmt$(r.alloc.personal) : '—'}</td><td className="text-right tabular-nums">{r.alloc ? fmt$(r.alloc.treasury) : '—'}</td><td className="text-right tabular-nums">{r.alloc ? fmt$(r.alloc.reserve) : '—'}</td>
                <td className="text-stone-400">{r.alloc ? (r.alloc.by === 'quiet' ? 'standing split' : r.alloc.by === 'his' ? 'his advice' : r.alloc.by === 'custom' ? 'your own split' : 'the usual') : 'waiting for you'}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="mt-2 text-[11px] text-stone-400">Standing split: <b className="text-gold-300">{splitText(t.policy)}</b> · {t.policy.auto ? 'quiet weeks are split without a meeting' : 'you hold the audience every week'}
            <button type="button" className="ml-2 btn-ghost text-[11px]" onClick={() => queue({ kind: 'tribute', op: { op: 'policy', auto: !t.policy.auto } })}>{t.policy.auto ? 'Hold it every week' : 'Only when it matters'}</button></div>
        </Box>
      )}
      {tab === 'crews' && rep && (
        <Box title="Crew Contributions" note={`Week ${rep.week}. Click a crew for its accounts: every man's agreement, what was due and paid, and why anybody came up short — what he said, what the underboss believes, and the truth once it is known.`} id="take-crews">
          <CrewView s={s} rep={rep} />
          <div className="mt-2 flex flex-wrap gap-1">
            {capos(s).filter((k) => isFree(s, k)).map((k) => <button key={k.id} type="button" className="btn-ghost text-[11px]" onClick={() => queue({ kind: 'tribute', op: { op: 'audit', capoId: k.id } })}>Audit {k.firstName}'s books ($200)</button>)}
            <button type="button" className="btn-ghost text-[11px]" onClick={() => queue({ kind: 'tribute', op: { op: 'auditUb' } })}>Check the underboss's count ($400)</button>
          </div>
        </Box>
      )}
      {tab === 'obligations' && (
        <Box title="Outstanding Obligations" note="What the family owes, what is owed to it, and what comes due." id="take-obligations">
          <ul className="text-[12px] space-y-0.5">{obligations(s).map((o, i) => <li key={i} className="flex justify-between gap-2 border-t border-noir-800 py-0.5"><span className={o.kind === 'receivable' ? 'text-emerald-300' : 'text-stone-300'}>{o.what}</span><span className="tabular-nums text-stone-400">{fmt$(o.amount)}{o.weekly ? '/wk' : o.due !== undefined ? ` in ${o.due} wk` : ''}</span></li>)}</ul>
          <div className="mt-2 text-[10px] uppercase tracking-widest text-stone-500">Who owes the family (arrears)</div>
          <ul className="text-[12px]">{Object.entries(t.arrears).filter(([id]) => s.characters[id]?.alive).map(([id, v]) => (
            <li key={id} className="flex flex-wrap items-center justify-between gap-2 border-t border-noir-800 py-0.5"><span><CharLink s={s} id={id} /> <span className="text-stone-500">({REASON_LABEL[t.why[id] ?? 'bad_week']}{t.terms[id] ? `; ${t.terms[id].kind} till wk ${t.terms[id].until}` : ''})</span></span>
              <span className="flex items-center gap-1"><span className="tabular-nums text-red-300">{fmt$(v)}</span>
                <button type="button" className="btn-ghost text-[10px]" onClick={() => queue({ kind: 'tribute', op: { op: 'terms', charId: id, kind: 'extension', weeks: 4 } })}>4 weeks</button>
                <button type="button" className="btn-ghost text-[10px]" onClick={() => queue({ kind: 'tribute', op: { op: 'forgive', charId: id } })}>forgive</button></span></li>
          ))}</ul>
        </Box>
      )}
      {tab === 'accounts' && (
        <Box title="Accounts" note="The family treasury runs the business; your own money pays your household and the Good Life first; the reserve covers the treasury when it runs dry. Moving money between them is never income." id="take-accounts">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[12px]">
            {(['treasury', 'personal', 'reserve', 'envelope'] as const).map((k) => (
              <div key={k} className="rounded border border-noir-700 bg-noir-900/60 px-2 py-1" data-testid={`acct-${k}`}><div className="text-[10px] uppercase tracking-widest text-stone-500">{ACCT_LABEL[k]}</div><div className={`tabular-nums text-lg ${a[k] < 0 ? 'text-red-400' : 'text-gold-300'}`}>{fmt$(a[k])}</div></div>
            ))}
          </div>
          <MoveMoney />
          <div className="mt-3 text-[10px] uppercase tracking-widest text-stone-500">Individual accounts: the crew</div>
          <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[420px]"><tbody>
            {crew(s).filter((c) => c.rank !== 'civilian').sort((x, y) => y.wealth - x.wealth).slice(0, 30).map((c) => (
              <tr key={c.id} className="border-t border-noir-800"><td><CharLink s={s} id={c.id} /> <span className="text-stone-500">{c.rank}</span></td><td className="text-stone-400">{c.rank === 'capo' ? `keeps ${Math.round((c.keep ?? 0.3) * 100)}%` : memberTerms(s, c).text}</td><td className="text-right tabular-nums">{fmt$(c.wealth)}</td><td className="text-right tabular-nums text-red-300">{(t.arrears[c.id] ?? 0) + (c.arrears ?? 0) ? fmt$((t.arrears[c.id] ?? 0) + (c.arrears ?? 0)) : ''}</td></tr>
            ))}
          </tbody></table></div>
          {Object.keys(t.allowances).length > 0 && <div className="mt-2 text-[11px] text-stone-400">Allowances from your own money: {Object.entries(t.allowances).map(([id, w]) => `${s.characters[id]?.firstName ?? '?'} ${fmt$(w)}/wk`).join(' · ')}</div>}
        </Box>
      )}
      {tab === 'agreements' && <Agreements s={s} />}
      {tab === 'investments' && (
        <Box title="Investments" note="Pitched by the capos in the audience, paid from the reserve. Their returns come up with the take." id="take-investments">
          {t.investments.length === 0 ? <p className="text-[12px] text-stone-500">No investments yet. A capo with a head for business will pitch one.</p> : (
            <ul className="text-[12px]">{t.investments.slice().reverse().map((i) => <li key={i.id} className="flex justify-between gap-2 border-t border-noir-800 py-0.5"><span><CharLink s={s} id={i.byId} />: {i.what}</span><span className="tabular-nums text-stone-400">{fmt$(i.amount)} · {i.status === 'funded' ? `${fmt$(i.weekly)}/wk till wk ${i.until}` : i.status}</span></li>)}</ul>
          )}
        </Box>
      )}
      {tab === 'disputes' && (
        <Box title="Financial Disputes" id="take-disputes">
          {t.disputes.length === 0 ? <p className="text-[12px] text-stone-500">Nobody has disputed his number.</p> : (
            <ul className="text-[12px]">{t.disputes.slice().reverse().map((d) => <li key={d.id} className="border-t border-noir-800 py-1"><CharLink s={s} id={d.capoId} /> (wk {d.week}) — {fmt$(d.amount)}: <i className="text-stone-400">"{d.claim}"</i> <span className={d.status === 'open' ? 'text-amber-300' : 'text-stone-500'}>{d.status}</span></li>)}</ul>
          )}
          <div className="mt-2 text-[10px] uppercase tracking-widest text-stone-500">Favors on the books (who helped whom)</div>
          <ul className="text-[11px] text-stone-400">{t.favors.filter((f) => f.tell.knownBy.includes(s.playerId) || f.byId === s.playerId).slice(-12).reverse().map((f) => <li key={f.id}>wk {f.week}: {s.characters[f.byId]?.firstName ?? '?'} → {s.characters[f.toId]?.firstName ?? '?'}: {f.tell.truth}{f.amount ? ` (${fmt$(f.amount)})` : ''}{f.authority !== 'don' ? ` · on ${f.authority === 'delegated' ? 'his own routine authority' : 'nobody\'s authority'}` : ''}</li>)}</ul>
        </Box>
      )}
      {tab === 'ledger' && <Ledger s={s} />}
      {tab === 'rivals' && (
        <Box title="The Other Families' Books" note="They run the same way: capos keep their end, the boss takes his, a reserve for the bad week. A family can run dry, or split." id="take-rivals">
          <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[480px]">
            <thead><tr className="text-[10px] uppercase tracking-widest text-stone-500 text-left"><th>Family</th><th className="text-right">Treasury</th><th className="text-right">Reserve</th><th className="text-right">Boss's own</th><th className="text-right">Last week up</th><th>Capos</th></tr></thead>
            <tbody>{rivalBooksView(s).map((r) => (
              <tr key={r.id} className="border-t border-noir-800"><td>{r.name}{r.books.insolvent ? <span className="text-red-300"> · insolvent</span> : ''}{r.books.fragments ? <span className="text-amber-300"> · split {r.books.fragments}×</span> : ''}</td>
                <td className="text-right tabular-nums">{fmt$(r.money)}</td><td className="text-right tabular-nums">{fmt$(r.books.reserve)}</td><td className="text-right tabular-nums">{fmt$(r.books.personal)}</td><td className="text-right tabular-nums">{fmt$(r.books.last?.toBoss ?? 0)}</td>
                <td className="text-stone-400">{r.books.capos.map((c) => `${c.name}${c.grievance >= 50 ? ' (sore)' : ''}`).join(', ')}</td></tr>
            ))}</tbody>
          </table></div>
        </Box>
      )}
    </div>
  );
}

function AudienceSummary({ s, rep, pending }: { s: GameState; rep: TributeReport; pending: boolean }) {
  const ub = rep.ubId ? s.characters[rep.ubId] : undefined;
  return (
    <div className="text-[12px] space-y-1">
      <div><span className="text-stone-400">Week {rep.week}:</span> {ub ? <CharLink s={s} id={ub.id} /> : 'nobody'} {rep.acting ? '(acting)' : ''} — {UB_TYPE_LABEL[rep.ubType]}</div>
      <div className="tabular-nums">Came up {fmt$(rep.collected)} · his share {fmt$(rep.ubShare)} · <b className="text-gold-300">envelope {fmt$(rep.presented)}</b>{rep.lastPresented !== undefined ? ` · last week ${fmt$(rep.lastPresented)}` : ''}</div>
      {rep.alloc ? <div className="text-emerald-300 tabular-nums">Split: {fmt$(rep.alloc.personal)} to you · {fmt$(rep.alloc.treasury)} to the family · {fmt$(rep.alloc.reserve)} put aside</div> : pending ? <div className="text-amber-300">The envelope is on your desk. He is waiting for your split.</div> : null}
      {rep.talk[0] && <p className="italic text-stone-300">“{rep.talk.slice(0, 3).map((x) => x.text).join(' ')}”</p>}
    </div>
  );
}

function CrewView({ s, rep }: { s: GameState; rep: TributeReport }) {
  const [open, setOpen] = useState<string | undefined>();
  return <CrewTable s={s} rep={rep} open={open} onToggle={(id) => setOpen(open === id ? undefined : id)} />;
}

function MoveMoney() {
  const { queue } = useOrders();
  const [from, setFrom] = useState<'personal' | 'treasury' | 'reserve'>('personal');
  const [to, setTo] = useState<'personal' | 'treasury' | 'reserve'>('treasury');
  const [amt, setAmt] = useState(1000);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]" data-testid="move-money">
      <span className="text-stone-400">Move</span>
      <input type="number" min={0} step={100} value={amt} onChange={(e) => setAmt(Number(e.target.value))} className="w-24 rounded border border-noir-600 bg-noir-950 px-1 tabular-nums" aria-label="Amount" />
      <select value={from} onChange={(e) => setFrom(e.target.value as typeof from)} className="rounded border border-noir-600 bg-noir-950" aria-label="From"><option value="personal">from your own</option><option value="treasury">from the treasury</option><option value="reserve">from the reserve</option></select>
      <select value={to} onChange={(e) => setTo(e.target.value as typeof to)} className="rounded border border-noir-600 bg-noir-950" aria-label="To"><option value="treasury">to the treasury</option><option value="personal">to your own</option><option value="reserve">to the reserve</option></select>
      <button type="button" className="btn-ghost text-[11px]" disabled={from === to || !(amt > 0)} onClick={() => queue({ kind: 'tribute', op: { op: 'move', from, to, amount: amt } })}>Order it</button>
    </div>
  );
}

function Agreements({ s }: { s: GameState }) {
  const t = s.tribute!;
  const ks = capos(s);
  const men = crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate');
  return (
    <Box title="Financial Agreements" note="Every agreement has a stable id. Capos: revenue share of their district (the contract). Men: a share of their hustle (or a flat figure, an exemption, an extension). Enterprises: the family's own businesses pay their profit (after upkeep) into the treasury. Investments: a weekly return into the take." id="take-agreements">
      <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[460px]"><tbody>
        {ks.map((k) => <tr key={k.id} className="border-t border-noir-800"><td className="text-stone-500 text-[10px]">agr:capo:{k.id}</td><td><CharLink s={s} id={k.id} /></td><td className="text-stone-300">revenue share: keeps {Math.round((k.keep ?? 0.3) * 100)}%, remits {100 - Math.round((k.keep ?? 0.3) * 100)}%</td></tr>)}
        {men.slice(0, 40).map((c) => <tr key={c.id} className="border-t border-noir-800"><td className="text-stone-500 text-[10px]">agr:member:{c.id}</td><td><CharLink s={s} id={c.id} /></td><td className="text-stone-300">{memberTerms(s, c).text}{c.capoId ? ` · through ${s.characters[c.capoId]?.firstName ?? '?'}` : ' · direct to the underboss'}</td></tr>)}
        {owned(s).slice(0, 20).map((b) => <tr key={b.id} className="border-t border-noir-800"><td className="text-stone-500 text-[10px]">agr:ent:{b.id}</td><td>{b.name}</td><td className="text-stone-300">profit share: 100% of the week after upkeep ({fmt$(b.upkeep)}/wk) to the treasury</td></tr>)}
        {t.investments.filter((i) => i.status === 'funded').map((i) => <tr key={i.id} className="border-t border-noir-800"><td className="text-stone-500 text-[10px]">agr:inv:{i.id}</td><td>{i.what}</td><td className="text-stone-300">investment return: {fmt$(i.weekly)}/wk till wk {i.until}</td></tr>)}
      </tbody></table></div>
      {t.agHist.length > 0 && <><div className="mt-2 text-[10px] uppercase tracking-widest text-stone-500">History</div><ul className="text-[11px] text-stone-400">{t.agHist.slice(-12).reverse().map((h, i) => <li key={i}>wk {h.week} · {h.id}: {h.text}</li>)}</ul></>}
    </Box>
  );
}

function Ledger({ s }: { s: GameState }) {
  const t = s.tribute!;
  const [wk, setWk] = useState<number | undefined>(t.books[t.books.length - 1]?.week);
  const b = t.books.find((x) => x.week === wk) ?? t.books[t.books.length - 1];
  if (!b) return <Box title="Historical Ledger"><p className="text-[12px] text-stone-500">Nothing yet.</p></Box>;
  const keys = ['treasury', 'personal', 'reserve', 'envelope', 'clearing'];
  return (
    <Box title="Historical Ledger" note="Every transfer between accounts, week by week, and the balances it reconciles to." id="take-ledger">
      <select value={b.week} onChange={(e) => setWk(Number(e.target.value))} className="rounded border border-noir-600 bg-noir-950 text-[12px]" aria-label="Week">{t.books.slice().reverse().map((x) => <option key={x.week} value={x.week}>Week {x.week}</option>)}</select>
      <div className="mt-1 grid grid-cols-2 sm:grid-cols-5 gap-1 text-[11px]">{keys.map((k) => <div key={k} className="rounded border border-noir-700 px-1.5 py-0.5"><div className="text-stone-500">{ACCT_LABEL[k]}</div><div className="tabular-nums">{fmt$(b.start[k] ?? 0)} → <span className="text-gold-300">{fmt$(b.end[k] ?? 0)}</span></div></div>)}</div>
      <div className="mt-2 max-h-80 overflow-y-auto overflow-x-auto"><table className="w-full text-[11px] min-w-[480px]"><tbody>
        {b.x.map((x, i) => <tr key={i} className="border-t border-noir-800"><td className="text-stone-400">{acctName(s, x[0])}</td><td className="text-stone-500">→</td><td className="text-stone-300">{acctName(s, x[1])}</td><td className="text-right tabular-nums">{fmt$(x[2])}</td><td className="text-stone-500">{x[3].replace(/_/g, ' ')}</td><td className="text-stone-500">{x[4] ?? ''}</td></tr>)}
      </tbody></table></div>
    </Box>
  );
}
