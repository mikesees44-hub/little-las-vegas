import { seenWealth } from '../../engine/crewFinance';
import { useState, type ReactNode } from 'react';
import { FirstSettlement } from '../components/EmptyState';
import { Guard } from '../components/Guard';
import { agreementHistoryLine, agreementName } from '../../engine/agreements';
import { getSettings } from '../settings';
import { capos, crew, isFree } from '../../engine/characters';
import { accountsView, latestReport, memberTerms, obligations, pendingReport, UB_TYPE_LABEL, weeklyCosts } from '../../engine/tribute';
import { rivalBooksView } from '../../engine/rivalBooks';
import { REASON_LABEL, splitText, type TributeReport } from '../../engine/tributeState';
import type { GameState } from '../../engine/types';
import { owned } from '../../engine/business';
import { fmt$ } from '../format';
import { BigPots, MoveMoney } from '../money/MoneyPots';
import { useOrders } from '../components/Orders';
import { CharLink } from '../components/People';
import { CrewTable } from './AudienceScene';
import { useTributeUi } from './context';
import { useShell } from '../shell/context';
import { EarningsBoard } from './EarningsBoard';
import { CardHead, StatChip } from '../components/Layout';
import { domCard, type Domain } from '../domain';

const TABS = [
  ['audience', 'Underboss Audience'], ['envelope', 'Envelope'], ['earnings', 'The Family\'s Earnings'], ['crews', 'Crew Contributions'], ['obligations', 'Obligations'],
  ['accounts', 'Accounts'], ['agreements', 'Agreements'], ['investments', 'Investments'], ['disputes', 'Disputes'], ['ledger', 'Historical Ledger'], ['rivals', 'Other Families'],
] as const;
export type TakeTab = (typeof TABS)[number][0];

/** The five pages of the envelope; each old page lives in one of them (so links to the old pages still land). */
export type TakeGroup = 'week' | 'paid' | 'owed' | 'accounts' | 'books';
const GROUPS: { id: TakeGroup; label: string; tabs: TakeTab[] }[] = [
  { id: 'week', label: 'This Week', tabs: ['audience', 'envelope'] },
  { id: 'paid', label: 'Who Paid', tabs: ['crews', 'earnings'] },
  { id: 'owed', label: 'What Is Owed', tabs: ['obligations', 'disputes', 'investments'] },
  { id: 'accounts', label: 'Accounts', tabs: ['accounts', 'agreements'] },
  { id: 'books', label: 'The Books', tabs: ['ledger', 'rivals'] },
];
const groupOf = (t: TakeTab | TakeGroup): TakeGroup => (GROUPS.some((g) => g.id === t) ? (t as TakeGroup) : GROUPS.find((g) => g.tabs.includes(t as TakeTab))!.id);

/** One page block of the envelope, wearing the part of the Don's life it is about (money, the crews, the other families). */
function Box({ title, note, children, id, d = 'money', glyph }: { title: string; note?: string; children: ReactNode; id?: string; d?: Domain; glyph?: string }) {
  return (
    <section className={`llv-card-box llv-card-plain min-w-0 ${domCard(d)}`} data-testid={id} data-domain={d}>
      <CardHead d={d} glyph={glyph} title={title} sub={note} />
      <div>{children}</div>
    </section>
  );
}

const ACCT_LABEL: Record<string, string> = { treasury: 'Family money', personal: 'Your pocket', reserve: 'Kept for lawyers & emergencies', envelope: 'Envelope on your desk', clearing: 'With the underboss (being counted)' };
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
export function WeeklyTake({ s, initial }: { s: GameState; initial?: TakeTab | TakeGroup }) {
  const [group, setGroup] = useState<TakeGroup>(groupOf(initial ?? 'week'));
  const tabs = GROUPS.find((g) => g.id === group)!.tabs;
  const show = (x: TakeTab) => tabs.includes(x);
  const t = s.tribute;
  const ui = useTributeUi();
  const { queue } = useOrders();
  const { go } = useShell();
  if (!t) return <div data-testid="weekly-take"><FirstSettlement what="The weekly envelope" week={s.week} /></div>;
  const rep = latestReport(s);
  const pend = pendingReport(s);
  const a = accountsView(s);
  return (
    <div className="space-y-3" data-testid="weekly-take">
      <div className="llv-seg tabbar !mb-0" role="tablist" aria-label="The envelope">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)} data-testid={`take-group-${g.id}`}
            className={`llv-seg-tab ${group === g.id ? 'llv-seg-on' : ''}`}>{g.label}</button>
        ))}
      </div>
      <Guard label="This page of the envelope" resetKey={`${group}:${s.week}`}>
      {group === 'week' && rep && <ThisWeekBox s={s} rep={rep} />}
      {(show('audience') || show('crews') || show('envelope')) && !rep && <FirstSettlement what={group === 'week' ? 'The underboss\'s audience' : 'What each crew sent up'} week={s.week} />}
      {show('audience') && rep && (
        <Box d="crew" glyph="♜" title="The Underboss Audience" note="Every Monday the underboss brings the take. Quiet weeks go by your standing split; he asks to see you when something needs you." id="take-audience">
          <AudienceSummary s={s} rep={rep} pending={!!pend} />
          <button type="button" className="btn-gold mt-2 text-xs" onClick={() => ui.openAudience(rep.id)} data-testid="open-office">{pend ? 'He is waiting: open the office' : 'Open the office (this week\'s report)'}</button>
        </Box>
      )}
      {show('envelope') && rep && (
        <Box glyph="✉" title="The Envelope" note="What reached you each week and where it went." id="take-envelope">
          <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[440px]">
            <thead><tr className="text-[10px] uppercase tracking-widest text-stone-400 text-left [&>th]:px-2 [&>th]:pb-1"><th>Week</th><th className="text-right">Presented</th><th className="text-right">You</th><th className="text-right">Family</th><th className="text-right">Reserve</th><th>How</th></tr></thead>
            <tbody>{t.reports.slice().reverse().map((r) => (
              <tr key={r.id} className="border-t border-noir-800 [&>td]:px-2 [&>td]:py-0.5"><td>wk {r.week}</td><td className="text-right tabular-nums text-gold-300">{fmt$(r.presented)}</td>
                <td className="text-right tabular-nums">{r.alloc ? fmt$(r.alloc.personal) : '—'}</td><td className="text-right tabular-nums">{r.alloc ? fmt$(r.alloc.treasury) : '—'}</td><td className="text-right tabular-nums">{r.alloc ? fmt$(r.alloc.reserve) : '—'}</td>
                <td className="text-stone-400">{r.alloc ? (r.alloc.by === 'quiet' ? 'standing split' : r.alloc.by === 'his' ? 'his advice' : r.alloc.by === 'custom' ? 'your own split' : 'the usual') : 'waiting for you'}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="mt-2 text-[11px] text-stone-400">Standing split: <b className="text-gold-300">{splitText(t.policy)}</b> · {t.policy.auto ? 'quiet weeks are split without a meeting' : 'you hold the audience every week'}
            <button type="button" className="ml-2 btn-ghost text-[11px]" onClick={() => queue({ kind: 'tribute', op: { op: 'policy', auto: !t.policy.auto } })}>{t.policy.auto ? 'Hold it every week' : 'Only when it matters'}</button></div>
        </Box>
      )}
      {show('earnings') && (
        <Box d="crew" title="The Family's Earnings" note="Everyone in the family: what each man earned this week, kicked up and kept, his trend, and his own money. Click a name for his sheet." id="take-earnings">
          <EarningsBoard s={s} />
        </Box>
      )}
      {show('crews') && rep && (
        <Box d="crew" title="Crew Contributions" note={`Week ${rep.week}. Click a crew for its accounts: every man's agreement, what was due and paid, and why anybody came up short — what he said, what the underboss believes, and the truth once it is known.`} id="take-crews">
          <CrewView s={s} rep={rep} />
          <div className="mt-2 flex flex-wrap gap-1">
            {capos(s).filter((k) => isFree(s, k)).map((k) => <button key={k.id} type="button" className="btn-ghost text-[11px]" onClick={() => queue({ kind: 'tribute', op: { op: 'audit', capoId: k.id } })}>Audit {k.firstName}'s books ($200)</button>)}
            <button type="button" className="btn-ghost text-[11px]" onClick={() => queue({ kind: 'tribute', op: { op: 'auditUb' } })}>Check the underboss's count ($400)</button>
          </div>
        </Box>
      )}
      {show('obligations') && (
        <Box glyph="⚖" title="Outstanding Obligations" note="What the family owes, what is owed to it, and what comes due." id="take-obligations">
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
      {show('accounts') && (
        <Box glyph="▤" title="Accounts" note="Family money runs the business; your pocket pays for your house, cars, fun and family. Moving money between them is never income." id="take-accounts">
          <BigPots s={s} compact />
          {a.envelope > 0 && <div className="mt-1 text-[11px] text-amber-300" data-testid="acct-envelope">{ACCT_LABEL.envelope}: {fmt$(a.envelope)} (split at your cut when you advance)</div>}
          <div className="mt-2"><MoveMoney s={s} /></div>
          <button type="button" className="mt-1 text-[11px] text-gold-300 hover:underline" onClick={() => go('holdings.money')}>The Money screen ▸</button>
          <div className="mt-3 text-[10px] uppercase tracking-widest text-stone-500">Individual accounts: the crew</div>
          <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[420px]"><tbody>
            {crew(s).filter((c) => c.rank !== 'civilian').sort((x, y) => y.wealth - x.wealth).slice(0, 30).map((c) => (
              <tr key={c.id} className="border-t border-noir-800"><td><CharLink s={s} id={c.id} /> <span className="text-stone-500">{c.rank}</span></td><td className="text-stone-400">{c.rank === 'capo' ? `keeps ${Math.round((c.keep ?? 0.3) * 100)}%` : c.rank === 'underboss' ? `${t.ub.rateBp / 100}% of the take` : c.rank === 'consigliere' ? 'a wage' : memberTerms(s, c).text}</td><td className="text-right tabular-nums">{seenWealth(s, c, !!getSettings().devIds)}</td><td className="text-right tabular-nums text-red-300">{(t.arrears[c.id] ?? 0) + (c.arrears ?? 0) ? fmt$((t.arrears[c.id] ?? 0) + (c.arrears ?? 0)) : ''}</td></tr>
            ))}
          </tbody></table></div>
          {Object.keys(t.allowances).length > 0 && <div className="mt-2 text-[11px] text-stone-400">Allowances from your own money: {Object.entries(t.allowances).map(([id, w]) => `${s.characters[id]?.firstName ?? '?'} ${fmt$(w)}/wk`).join(' · ')}</div>}
        </Box>
      )}
      {show('agreements') && <Agreements s={s} />}
      {show('investments') && (
        <Box glyph="↗" title="Investments" note="Pitched by the capos in the audience, paid from Family money. Their returns come up with the envelope." id="take-investments">
          {t.investments.length === 0 ? <p className="text-[12px] text-stone-500">No investments yet. A capo with a head for business will pitch one.</p> : (
            <ul className="text-[12px]">{t.investments.slice().reverse().map((i) => <li key={i.id} className="flex justify-between gap-2 border-t border-noir-800 py-0.5"><span><CharLink s={s} id={i.byId} />: {i.what}</span><span className="tabular-nums text-stone-400">{fmt$(i.amount)} · {i.status === 'funded' ? `${fmt$(i.weekly)}/wk till wk ${i.until}` : i.status}</span></li>)}</ul>
          )}
        </Box>
      )}
      {show('disputes') && (
        <Box d="crew" glyph="✕" title="Financial Disputes" id="take-disputes">
          {t.disputes.length === 0 ? <p className="text-[12px] text-stone-500">Nobody has disputed his number.</p> : (
            <ul className="text-[12px]">{t.disputes.slice().reverse().map((d) => <li key={d.id} className="border-t border-noir-800 py-1"><CharLink s={s} id={d.capoId} /> (wk {d.week}) — {fmt$(d.amount)}: <i className="text-stone-400">"{d.claim}"</i> <span className={d.status === 'open' ? 'text-amber-300' : 'text-stone-500'}>{d.status}</span></li>)}</ul>
          )}
          <div className="mt-2 text-[10px] uppercase tracking-widest text-stone-500">Favors on the books (who helped whom)</div>
          <ul className="text-[11px] text-stone-400">{t.favors.filter((f) => f.tell.knownBy.includes(s.playerId) || f.byId === s.playerId).slice(-12).reverse().map((f) => <li key={f.id}>wk {f.week}: {s.characters[f.byId]?.firstName ?? '?'} → {s.characters[f.toId]?.firstName ?? '?'}: {f.tell.truth}{f.amount ? ` (${fmt$(f.amount)})` : ''}{f.authority !== 'don' ? ` · on ${f.authority === 'delegated' ? 'his own routine authority' : 'nobody\'s authority'}` : ''}</li>)}</ul>
        </Box>
      )}
      {show('ledger') && <Ledger s={s} />}
      {show('rivals') && (
        <Box d="rivals" title="The Other Families' Books" note="They run the same way: capos keep their end, the boss takes his, a reserve for the bad week. A family can run dry, or split." id="take-rivals">
          <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[480px]">
            <thead><tr className="text-[10px] uppercase tracking-widest text-stone-500 text-left"><th>Family</th><th className="text-right">Family money</th><th className="text-right">Kept for emergencies</th><th className="text-right">Boss's pocket</th><th className="text-right">Last week up</th><th>Capos</th></tr></thead>
            <tbody>{rivalBooksView(s).map((r) => (
              <tr key={r.id} className="border-t border-noir-800"><td>{r.name}{r.books.insolvent ? <span className="text-red-300"> · insolvent</span> : ''}{r.books.fragments ? <span className="text-amber-300"> · split {r.books.fragments}×</span> : ''}</td>
                <td className="text-right tabular-nums">{fmt$(r.money)}</td><td className="text-right tabular-nums">{fmt$(r.books.reserve)}</td><td className="text-right tabular-nums">{fmt$(r.books.personal)}</td><td className="text-right tabular-nums">{fmt$(r.books.last?.toBoss ?? 0)}</td>
                <td className="text-stone-400">{r.books.capos.map((c) => `${c.name}${c.grievance >= 50 ? ' (sore)' : ''}`).join(', ')}</td></tr>
            ))}</tbody>
          </table></div>
        </Box>
      )}
      </Guard>
    </div>
  );
}

/** This week in five numbers: the count, the expenses, what is available, your cut, the Family's share. */
function ThisWeekBox({ s, rep }: { s: GameState; rep: TributeReport }) {
  const cells: [string, string, string?][] = [
    ['The count', fmt$(rep.collected), `came up from the crews, week ${rep.week}`],
    ['Expenses', `${fmt$(weeklyCosts(s))}/wk`, 'payroll, upkeep, the pad (average)'],
    ['Available', fmt$(Math.round(s.money)), 'Family money now'],
    ['Your cut', rep.alloc ? fmt$(rep.alloc.personal) : '—', rep.alloc ? 'into your pocket' : 'waiting for your split'],
    ['Family share', rep.alloc ? fmt$(rep.alloc.treasury + rep.alloc.reserve) : '—', rep.alloc ? `incl. ${fmt$(rep.alloc.reserve)} kept for emergencies` : 'waiting for your split'],
  ];
  return (
    <section className="grid grid-cols-2 sm:grid-cols-5 gap-1.5" data-testid="take-this-week">
      {cells.map(([a, b, c], i) => (
        <StatChip key={a} domain={i === 0 ? 'crew' : 'money'} label={a} value={<span className="text-gold-300">{b}</span>} sub={c} className={i === 0 ? 'col-span-2 sm:col-span-1' : ''} />
      ))}
    </section>
  );
}

function AudienceSummary({ s, rep, pending }: { s: GameState; rep: TributeReport; pending: boolean }) {
  const ub = rep.ubId ? s.characters[rep.ubId] : undefined;
  return (
    <div className="text-[12px] space-y-1">
      <div><span className="text-stone-400">Week {rep.week}:</span> {ub ? <CharLink s={s} id={ub.id} /> : 'nobody'} {rep.acting ? '(acting)' : ''} — {UB_TYPE_LABEL[rep.ubType]}</div>
      <div className="tabular-nums">Came up {fmt$(rep.collected)} · his share {fmt$(rep.ubShare)} · <b className="text-gold-300">envelope {fmt$(rep.presented)}</b>{rep.lastPresented !== undefined ? ` · last week ${fmt$(rep.lastPresented)}` : ''}</div>
      {rep.alloc ? <div className="text-emerald-300 tabular-nums">Split: {fmt$(rep.alloc.personal)} to your pocket · {fmt$(rep.alloc.treasury + rep.alloc.reserve)} to the Family</div> : pending ? <div className="text-amber-300">The envelope is on your desk. He is waiting for your split.</div> : null}
      {rep.talk[0] && <p className="italic text-stone-300">“{rep.talk.slice(0, 3).map((x) => x.text).join(' ')}”</p>}
    </div>
  );
}

function CrewView({ s, rep }: { s: GameState; rep: TributeReport }) {
  const [open, setOpen] = useState<string | undefined>();
  return <CrewTable s={s} rep={rep} open={open} onToggle={(id) => setOpen(open === id ? undefined : id)} />;
}

function Agreements({ s }: { s: GameState }) {
  const t = s.tribute!;
  const ks = capos(s);
  const men = crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate');
  // Human titles and counterparties; the stable internal id only in the developer inspector (A06).
  const dev = !!getSettings().devIds;
  const Title = ({ id }: { id: string }) => (
    <td className="text-stone-200 pr-2" data-agreement={id}>{agreementName(s, id).title}{dev && <span className="ml-1 text-stone-600 text-[10px]" data-testid="dev-id">{id}</span>}</td>
  );
  return (
    <Box glyph="✍" title="Financial Agreements" note="Every standing deal the family has. Capos: their share of their district (the contract). Men: a share of their hustle (or a flat figure, an exemption, an extension). The family's own businesses pay their profit (after upkeep) into Family money. Investments: a weekly return into the take." id="take-agreements">
      <div className="overflow-x-auto"><table className="w-full text-[12px] min-w-[460px]"><tbody>
        {ks.map((k) => <tr key={k.id} className="border-t border-noir-800"><Title id={`agr:capo:${k.id}`} /><td><CharLink s={s} id={k.id} /></td><td className="text-stone-300">keeps {Math.round((k.keep ?? 0.3) * 100)}% of his district, sends up {100 - Math.round((k.keep ?? 0.3) * 100)}%</td></tr>)}
        {men.slice(0, 40).map((c) => <tr key={c.id} className="border-t border-noir-800"><Title id={`agr:member:${c.id}`} /><td><CharLink s={s} id={c.id} /></td><td className="text-stone-300">{memberTerms(s, c).text}{c.capoId ? ` · through ${s.characters[c.capoId]?.firstName ?? '?'}` : ' · direct to the underboss'}</td></tr>)}
        {owned(s).slice(0, 20).map((b) => <tr key={b.id} className="border-t border-noir-800"><Title id={`agr:ent:${b.id}`} /><td>{b.name}</td><td className="text-stone-300">all of the week's profit after upkeep ({fmt$(b.upkeep)}/wk) to Family money</td></tr>)}
        {t.investments.filter((i) => i.status === 'funded').map((i) => <tr key={i.id} className="border-t border-noir-800"><Title id={`agr:inv:${i.id}`} /><td>{i.what}</td><td className="text-stone-300">returns {fmt$(i.weekly)}/wk till wk {i.until}</td></tr>)}
      </tbody></table></div>
      {t.agHist.length > 0 && <><div className="mt-2 text-[10px] uppercase tracking-widest text-stone-500">History</div><ul className="text-[11px] text-stone-400">{t.agHist.slice(-12).reverse().map((h, i) => <li key={i}>{agreementHistoryLine(s, h)}{dev && <span className="ml-1 text-stone-600">({h.id})</span>}</li>)}</ul></>}
    </Box>
  );
}

function Ledger({ s }: { s: GameState }) {
  const t = s.tribute!;
  const [wk, setWk] = useState<number | undefined>(t.books[t.books.length - 1]?.week);
  const b = t.books.find((x) => x.week === wk) ?? t.books[t.books.length - 1];
  if (!b) return <Box title="Historical Ledger"><FirstSettlement what="The ledger" week={s.week} /></Box>;
  const keys = ['treasury', 'personal', 'reserve', 'envelope', 'clearing'];
  return (
    <Box glyph="✍" title="Historical Ledger" note="Every transfer between accounts, week by week, and the balances it reconciles to." id="take-ledger">
      <select value={b.week} onChange={(e) => setWk(Number(e.target.value))} className="rounded border border-noir-600 bg-noir-950 text-[12px]" aria-label="Week">{t.books.slice().reverse().map((x) => <option key={x.week} value={x.week}>Week {x.week}</option>)}</select>
      <div className="mt-1 grid grid-cols-2 sm:grid-cols-5 gap-1 text-[11px]">{keys.map((k) => <div key={k} className="rounded border border-noir-700 px-1.5 py-0.5"><div className="text-stone-500">{ACCT_LABEL[k]}</div><div className="tabular-nums">{fmt$(b.start[k] ?? 0)} → <span className="text-gold-300">{fmt$(b.end[k] ?? 0)}</span></div></div>)}</div>
      <div className="mt-2 max-h-80 overflow-y-auto overflow-x-auto"><table className="w-full text-[11px] min-w-[480px]"><tbody>
        {b.x.map((x, i) => <tr key={i} className="border-t border-noir-800"><td className="text-stone-400">{acctName(s, x[0])}</td><td className="text-stone-500">→</td><td className="text-stone-300">{acctName(s, x[1])}</td><td className="text-right tabular-nums">{fmt$(x[2])}</td><td className="text-stone-500">{x[3].replace(/_/g, ' ')}</td><td className="text-stone-500">{x[4] ?? ''}</td></tr>)}
      </tbody></table></div>
    </Box>
  );
}
