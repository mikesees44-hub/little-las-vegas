import { useMemo, useState } from 'react';
import { previewAction } from '../../engine/actions';
import { blackBook, favorsLedger, GROUP_LABEL, GROUPS, type BookGroup, type Contact } from '../../engine/planner/blackbook';
import type { DialSpec } from '../../engine/phoneMeet';
import type { GameState, PlayerAction } from '../../engine/types';
import { weekLabel } from '../../engine/journal';
import { Face } from './ink';
import { OfferCard } from '../borgata/Payroll';

const GROUP_DOM: Record<BookGroup, string> = { men: 'crew', family: 'family', law: 'law', rivals: 'rivals', women: 'romance', business: 'money' };
const DOM_RGB: Record<string, string> = { crew: 'var(--d-crew)', family: 'var(--d-family)', law: 'var(--d-law)', rivals: 'var(--d-rivals)', romance: 'var(--d-romance)', money: 'var(--d-money)' };

/**
 * THE BLACK BOOK: the Rolodex on the desk. Everyone he knows, by group, with the face, what they are to
 * him, how they feel about him, the favors both ways and the last time they had business; and three quick
 * actions (call, meet, a gift). The phone's own book is the same list (phoneMeet.ts), never a copy.
 */
export function BlackBook({ s, onChar, onPhone, onOrder }: { s: GameState; onChar: (id: string) => void; onPhone: (p: Partial<DialSpec>) => void; onOrder: (a: PlayerAction) => void }) {
  const all = useMemo(() => blackBook(s), [s]);
  const fav = useMemo(() => favorsLedger(s), [s]);
  const [g, setG] = useState<BookGroup | 'all'>('all');
  const [q, setQ] = useState('');
  const list = all.filter((c) => (g === 'all' || c.group === g) && (!q || `${c.name} ${c.role}`.toLowerCase().includes(q.toLowerCase())));
  const chip = (id: BookGroup | 'all', label: string, n: number) => (
    <button key={id} type="button" aria-pressed={g === id} onClick={() => setG(id)} className={`llv-ink-btn ${g === id ? 'llv-ink-btn-primary' : ''}`} data-testid={`bb-filter-${id}`}>{label} <span className="opacity-60">{n}</span></button>
  );
  return (
    <div className="llv-paper-plain mx-auto max-w-[1100px] rounded p-3 sm:p-4" data-testid="black-book">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl">The black book</h3>
        <input className="w-40 rounded border border-[#2a2118]/40 bg-[#fffaf0] px-2 py-1 text-[12px]" placeholder="Find a name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a name" data-testid="bb-search" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Who">
        {chip('all', 'Everyone', all.length)}
        {GROUPS.map((x) => chip(x, GROUP_LABEL[x], all.filter((c) => c.group === x).length))}
      </div>
      {(fav.owed.length > 0 || fav.owing.length > 0) && (
        <p className="mt-2 text-[12px] text-[#4a3b28]" data-testid="bb-favors">Favors: <b>{fav.owed.length}</b> owed to you{fav.owed[0] ? ` (the oldest: ${fav.owed[0].c.name}, ${weekLabel(fav.owed[0].f.w)})` : ''} · you owe <b>{fav.owing.length}</b>{fav.owing[0] ? ` (${fav.owing[0].c.name} is waiting)` : ''}.</p>
      )}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => <Card key={c.id} s={s} c={c} onChar={onChar} onPhone={onPhone} onOrder={onOrder} />)}
      </ul>
      {!list.length && <p className="mt-4 text-center text-[13px] text-[#6b5a44]">Nobody under that letter.</p>}
    </div>
  );
}

function Card({ s, c, onChar, onPhone, onOrder }: { s: GameState; c: Contact; onChar: (id: string) => void; onPhone: (p: Partial<DialSpec>) => void; onOrder: (a: PlayerAction) => void }) {
  const gift: PlayerAction | undefined = c.charId && c.canGift ? { kind: 'interact', id: 'gift_small', target: c.charId } : undefined;
  const pv = gift ? previewAction(s, gift) : undefined;
  const mood = c.mood ?? 0;
  const [offer, setOffer] = useState(false);
  return (
    <li className={`llv-card-rolo ${offer ? 'sm:col-span-2 xl:col-span-3' : ''}`} style={{ ['--d' as string]: DOM_RGB[GROUP_DOM[c.group]] }} data-testid="bb-card" data-group={c.group}>
      <button type="button" onClick={() => c.charId && onChar(c.charId)} disabled={!c.charId} aria-label={`Open ${c.name}`}><Face s={s} id={c.charId} name={c.name} size={44} /></button>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <b className="truncate text-[13.5px]">{c.name}</b>
          <span className={`shrink-0 text-[11px] font-semibold ${mood >= 30 ? 'text-[#1d5b33]' : mood <= -10 ? 'text-[#7d1d14]' : 'text-[#6b5a44]'}`} title={c.mood !== undefined ? `What he thinks of you: ${mood}` : undefined} data-testid="bb-mood">{c.moodWord}{c.mood !== undefined ? ` ${mood > 0 ? '+' : ''}${mood}` : ''}</span>
        </div>
        <div className="truncate text-[11.5px] text-[#4a3b28]">{c.role}{c.away ? ` · ${c.away}` : ''}</div>
        <div className="text-[11px] text-[#6b5a44]">
          {c.owesMe.length > 0 && <span className="mr-2 text-[#1d5b33]" title={c.owesMe.map((f) => `${f.y} (${weekLabel(f.w)})`).join('; ')}>Owes you {c.owesMe.length}</span>}
          {c.iOwe.length > 0 && <span className="mr-2 text-[#7d1d14]" title={c.iOwe.map((f) => `${f.y} (${weekLabel(f.w)})`).join('; ')}>You owe {c.iOwe.length}</span>}
          {c.loan && <span className="mr-2">{c.loan.mine ? 'Owes you' : 'You owe'} ${c.loan.amt.toLocaleString('en-US')}</span>}
          {c.last ? <span className="block truncate" title={c.last.t}>Last: {weekLabel(c.last.w)} · {c.last.t}</span> : <span className="block">No dealings on file</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {c.phone && c.phone.purposes.some((p) => p !== 'meet') && <button type="button" className="llv-ink-btn px-2 py-0.5" onClick={() => onPhone({ who: c.id, purpose: c.phone!.purposes.includes('checkin') ? 'checkin' : c.phone!.purposes[0] })} data-testid="bb-call">☎ Call</button>}
          {c.phone?.purposes.includes('meet') && <button type="button" className="llv-ink-btn px-2 py-0.5" onClick={() => onPhone({ who: c.id, purpose: 'meet' })} data-testid="bb-meet">Meet</button>}
          {c.pay?.offer && <button type="button" className="llv-ink-btn px-2 py-0.5" aria-expanded={offer} onClick={() => setOffer(!offer)} data-testid="bb-hire">{c.pay.label}</button>}
          {c.pay?.on && <span className="text-[11px] text-[#1d5b33]" data-testid="bb-onpay">{c.pay.on}</span>}
          {gift && <button type="button" className="llv-ink-btn px-2 py-0.5" disabled={!!pv?.disabledReason} title={pv?.disabledReason ?? `A gift: ${pv?.cost ? `$${pv.cost.toLocaleString('en-US')}` : ''}`} onClick={() => onOrder(gift)} data-testid="bb-gift">Gift{pv?.cost ? ` $${pv.cost}` : ''}{pv?.acceptance ? ` · ${Math.round(pv.acceptance.chance * 100)}%` : ''}</button>}
        </div>
        {offer && c.pay?.offer && <div className="mt-1 text-stone-200" data-testid="bb-hire-card"><OfferCard s={s} action={c.pay.offer} /></div>}
      </div>
    </li>
  );
}
