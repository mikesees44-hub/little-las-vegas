import { ConfirmOrders } from '../components/ConfirmOrders';
import { useMemo, useState } from 'react';
import { buyBlock, buyIdeas, earnIdeas, heldReturns, pitchIdeas, workIdeas } from '../../engine/invest';
import type { GameState, PlayerAction } from '../../engine/types';
import { Card, CardHead } from '../components/Layout';
import { ActionCard, useOrders } from '../components/Orders';
import { CharLink } from '../components/People';
import { sameOrder } from '../verbs';
import { fmt$ } from '../format';

const weeksWord = (n: number) => (Number.isFinite(n) ? `${n} wk${n === 1 ? '' : 's'}` : 'never');

/** "Do all N" with one confirm that lists every order (nothing goes without the boss's yes). */
function DoAll({ items, label, testid }: { items: { text: string; action: PlayerAction }[]; label: string; testid: string }) {
  const { orders, queue } = useOrders();
  const [ask, setAsk] = useState(false);
  const todo = items.filter((x) => !orders.some((o) => sameOrder(o, x.action)));
  if (todo.length < 2) return null;
  return (
    <div className="mb-2">
      <button type="button" className="btn-primary text-xs" onClick={() => setAsk(true)} data-testid={testid}>{label.replace('N', String(todo.length))}</button>
      {ask && (
        <ConfirmOrders className="mt-1" testid={`${testid}-confirm`} yesTestId={`${testid}-yes`} lines={todo.map((x) => x.text)}
          onYes={() => { for (const x of todo) queue(x.action, true); setAsk(false); }} onNo={() => setAsk(false)} />
      )}
    </div>
  );
}

/**
 * Put your money to work (engine/invest.ts): your men as earners, idle men to work,
 * places to buy ranked by how fast they pay for themselves, your men's own ideas,
 * and what every place you own has paid back. Every line is the existing order.
 */
export function PutMoneyToWork({ s }: { s: GameState }) {
  const earn = useMemo(() => earnIdeas(s), [s]);
  const work = useMemo(() => workIdeas(s), [s]);
  const buys = useMemo(() => buyIdeas(s), [s]);
  const ideas = useMemo(() => pitchIdeas(s), [s]);
  const held = useMemo(() => heldReturns(s), [s]);
  const [open, setOpen] = useState(false);
  const earnWk = earn.reduce((a, x) => a + x.weekly, 0);
  return (
    <Card domain="money" testid="invest">
      <CardHead d="money" title="Put your money to work" sub="Make your men earners, buy what pays, and see what pays you back. Every number is the year's average, summer and winter together." />
      <div className="space-y-3">
        <div data-testid="invest-earners">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Make your men earners ({earn.length})</div>
          {earn.length ? (
            <>
              <p className="mb-1 text-[11px] text-stone-400">A capo or made man with a place of his own runs it himself: it pays every week, summer and winter, and he kicks up the rest. Together about {fmt$(earnWk)} a week.</p>
              <DoAll testid="invest-earners-all" label={`Make all N earners · ~${fmt$(earnWk)}/wk`} items={earn.map((x) => ({ text: `${x.c.firstName} ${x.c.lastName}: ${x.b.name} (~${fmt$(x.weekly)}/wk)`, action: x.action }))} />
              <ul className="space-y-1">{earn.slice(0, open ? 99 : 4).map((x) => <li key={x.c.id} className="text-xs"><span className="mr-1"><CharLink s={s} id={x.c.id} /></span><span className="text-stone-500">{x.c.rank}</span><ActionCard s={s} action={x.action} compact /></li>)}</ul>
            </>
          ) : <p className="text-[11px] text-stone-500">Every man who can hold a place has one, or there is nothing free to give. Buy a place below and it can be his.</p>}
        </div>
        {work.length > 0 && (
          <div data-testid="invest-work">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Idle men, put to work ({work.length})</div>
            <DoAll testid="invest-work-all" label="Put all N to work the consigliere's way" items={work.map((w) => ({ text: `${w.c?.firstName ?? 'A man'}: ${w.job.title}`, action: w.pick.action }))} />
            <ul className="space-y-1">{work.slice(0, open ? 99 : 3).map((w) => <li key={w.job.key} className="text-xs"><span className="text-stone-300">{w.job.title}:</span> <ActionCard s={s} action={w.pick.action} compact /></li>)}</ul>
          </div>
        )}
        <div data-testid="invest-buy">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Buy what pays, fastest payback first</div>
          {buys.length ? (
            <ul className="space-y-1">{buys.slice(0, open ? 99 : 4).map((x) => (
              <li key={x.kind} className="text-xs" data-testid="invest-buy-row">
                <div className="flex flex-wrap justify-between gap-x-2"><span className="text-stone-200">{x.name} · {x.where}</span><span className="tabular-nums text-stone-400">{fmt$(x.cost)} → ~{fmt$(x.weekly)}/wk · pays back in {weeksWord(x.payback)}{x.winter ? ` (counting ~${fmt$(x.winter)} to winterize it)` : ''}{x.staff ? ` · needs ${x.staff} man` : ''}</span></div>
                <ActionCard s={s} action={x.action} compact />
              </li>
            ))}</ul>
          ) : <p className="text-[11px] text-stone-500" data-testid="invest-buy-none">{buyBlock(s) ? `${buyBlock(s)}. Until then: earn on the street, back your men's ideas, and rise (Crew ▸ The Rise shows what it takes).` : 'No storefront free in a neighborhood you hold 20% of. Push into a district first.'}</p>}
        </div>
        {ideas.length > 0 && (
          <div data-testid="invest-pitches">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Your men's own ideas ({ideas.length})</div>
            <ul className="space-y-1">{ideas.map((x) => (
              <li key={x.p.id} className="text-xs">
                <div className="flex flex-wrap justify-between gap-x-2"><span className="text-stone-200"><CharLink s={s} id={x.p.by} />: {x.p.what}</span>
                  <span className="tabular-nums text-stone-400">{x.p.kind === 'place' ? `${fmt$(x.cost)} → ~${fmt$(x.back)}/wk · pays back in ${weeksWord(x.payback)}` : `${fmt$(x.cost)} in · ${Math.round(x.chance * 100)}% · worth ${x.back >= 0 ? '+' : ''}${fmt$(x.back)} on average`}</span></div>
                <ActionCard s={s} action={x.action} compact />
              </li>
            ))}</ul>
          </div>
        )}
        <div data-testid="invest-held">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">What your places pay you back</div>
          {held.length ? (
            <table className="mt-1 w-full text-[11px] tabular-nums"><thead><tr className="text-stone-500"><th className="text-left font-normal">Place</th><th className="text-right font-normal">Net/wk</th><th className="text-right font-normal">Paid back</th></tr></thead>
              <tbody>{held.slice(0, open ? 99 : 6).map((h) => (
                <tr key={h.b.id} className="border-t border-noir-800"><td className="py-0.5 text-stone-200">{h.b.name}{h.holder ? <span className="text-stone-500"> · {s.characters[h.holder]?.firstName}'s</span> : ''}</td><td className={`text-right ${h.net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{fmt$(h.net)}</td><td className="text-right text-stone-300">{h.weeks ? `${Math.round(h.paidBack * 100)}% in ${h.weeks} wk` : 'new'}</td></tr>
              ))}</tbody></table>
          ) : <p className="text-[11px] text-stone-500">You own nothing yet.</p>}
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={() => setOpen((v) => !v)} data-testid="invest-more">{open ? 'Show less' : 'Show everything'}</button>
      </div>
    </Card>
  );
}
