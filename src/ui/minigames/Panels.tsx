import type { MgSession } from '../../engine/minigame';
import { cardText, type CardsData } from '../../engine/minigameCards';
import { debtorLine, type CollectData } from '../../engine/minigameCollect';
import type { ElectionData } from '../../engine/minigameElection';
import type { HeistData } from '../../engine/minigameHeist';
import type { SitdownData } from '../../engine/minigameSitdown';
import { SPOTS, type SweepData } from '../../engine/minigameSweep';
import type { GameState } from '../../engine/types';
import { Face } from '../components/People';
import { MgStill } from './MgStill';

type P<D> = { s: GameState; ses: MgSession<D>; onMove: (id: string) => void; busy?: boolean };

function PlayingCard({ c, down }: { c?: number; down?: boolean }) {
  if (c === undefined || down) return <div className="w-8 h-11 sm:w-10 sm:h-14 rounded border border-noir-600 bg-[repeating-linear-gradient(45deg,#5a1f1a,#5a1f1a_4px,#3a1410_4px,#3a1410_8px)]" />;
  const t = cardText(c);
  const red = t.endsWith('♦') || t.endsWith('♥');
  return <div className={`w-8 h-11 sm:w-10 sm:h-14 rounded border border-stone-400 bg-[#efe8d6] flex items-center justify-center font-bold text-sm sm:text-base ${red ? 'text-red-700' : 'text-stone-900'}`}>{t}</div>;
}

export function CardsPanel({ s, ses }: P<CardsData>) {
  const d = ses.d;
  const showAll = ses.done || ses.phase === 'between' || ses.phase === 'last';
  return (
    <div className="space-y-2" data-testid="cards-panel">
      <div className="relative h-32 sm:h-40 rounded overflow-hidden"><MgStill scene="cardtable" seed={d.hand + 1} /></div>
      {d.opps.map((o) => {
        const c = s.characters[o.id];
        return (
          <div key={o.id} className={`flex items-center gap-2 rounded border border-noir-700 p-1.5 ${o.folded ? 'opacity-40' : ''}`}>
            {c && <Face s={s} c={c} size={40} />}
            <div className="min-w-0 flex-1">
              <div className="text-sm text-stone-100 truncate">{o.name} <span className="text-[11px] text-stone-500">{o.traits.join(', ')}</span></div>
              <div className="flex gap-1 mt-0.5">
                {o.down.map((x, i) => <PlayingCard key={`d${i}`} c={x} down={!showAll || o.folded} />)}
                {o.up.map((x, i) => <PlayingCard key={`u${i}`} c={x} />)}
              </div>
            </div>
            <div className={`text-xs tabular-nums ${o.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{o.net >= 0 ? '+' : ''}{o.net}</div>
          </div>
        );
      })}
      <div className="rounded border border-gold-600/50 p-1.5">
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Your hand · pot ${d.pot}</div>
        <div className="flex gap-1 mt-1">
          {d.me.down.map((x, i) => <PlayingCard key={`md${i}`} c={x} />)}
          {d.me.up.map((x, i) => <PlayingCard key={`mu${i}`} c={x} />)}
        </div>
      </div>
      {d.lastShow && <div className="text-xs text-stone-400">Last showdown: {d.lastShow.hands.map((h) => `${h.name} — ${h.hand} (${h.cards})`).join(' · ')}</div>}
    </div>
  );
}

export function SitdownPanel({ s, ses }: P<SitdownData>) {
  const d = ses.d;
  const other = d.otherId ? s.characters[d.otherId] : undefined;
  return (
    <div className="space-y-3" data-testid="sitdown-panel">
      <div className="relative h-36 rounded overflow-hidden"><MgStill scene="sitdown" seed={d.round + 2} /></div>
      <div className="flex items-center gap-3">
        {other && <Face s={s} c={other} size={56} />}
        <div className="text-sm text-stone-300">Across the table: <span className="text-stone-100">{d.other}</span></div>
      </div>
      <div>
        <div className="relative h-8 rounded bg-noir-800 border border-noir-700">
          <div className="absolute top-0 bottom-0 bg-emerald-700/40" style={{ left: `${Math.min(d.offer, d.ask)}%`, width: `${Math.abs(d.ask - d.offer)}%` }} />
          <div className="absolute top-0 bottom-0 w-px bg-stone-500" style={{ left: '50%' }} />
          <div className="absolute -top-0.5 h-9 w-1 bg-red-400" style={{ left: `${d.offer}%` }} title="Their offer" />
          <div className="absolute -top-0.5 h-9 w-1 bg-gold-400" style={{ left: `${d.ask}%` }} title="Your ask" />
        </div>
        <div className="flex justify-between text-[11px] text-stone-500 mt-0.5"><span>0 · their way</span><span>fair</span><span>your way · 100</span></div>
        <div className="text-xs text-stone-300 mt-1">Their offer <span className="text-red-300">{d.offer}</span> · your ask <span className="text-gold-300">{d.ask}</span> · patience {'●'.repeat(Math.max(0, Math.round(d.patience)))}{'○'.repeat(Math.max(0, d.patienceMax - Math.round(d.patience)))}</div>
      </div>
    </div>
  );
}

export function CollectionPanel({ ses }: P<CollectData>) {
  const d = ses.d;
  return (
    <div className="grid gap-2 sm:grid-cols-3" data-testid="collection-panel">
      {d.debtors.map((x, i) => (
        <div key={x.loanId} className={`rounded border p-2 text-xs ${i === d.cur && !ses.done ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700'}`}>
          <div className="text-stone-100 font-semibold text-sm">{x.name}</div>
          <div className="text-stone-400">{x.job}</div>
          <div className="mt-1">Owes <span className="text-stone-100">${x.owed.toLocaleString('en-US')}</span></div>
          <div className="mt-1">Your read: <span className="text-amber-200">{x.read}</span> ({Math.round(x.sure * 100)}% sure)</div>
          <div className="text-stone-500 italic">{debtorLine[x.read]}</div>
          {x.done && <div className="mt-1 text-stone-300">{x.done}{x.got !== undefined ? `: $${x.got.toLocaleString('en-US')}` : ''} · he was {x.temper}</div>}
        </div>
      ))}
    </div>
  );
}

export function HeistPanel({ s, ses }: P<HeistData>) {
  const d = ses.d;
  const stages = ['The plan', 'Getting in', 'The take', 'Getting away'];
  const at = ses.phase === 'plan' ? 0 : d.step + 1;
  return (
    <div className="space-y-2" data-testid="heist-panel">
      <div className="relative h-36 rounded overflow-hidden"><MgStill scene="vault" seed={d.step + 3} /></div>
      <ol className="flex gap-1 text-xs">
        {stages.map((x, i) => <li key={x} className={`flex-1 rounded px-2 py-1 border text-center ${i === at && !ses.done ? 'border-gold-400 text-gold-300' : i < at ? 'border-noir-600 text-stone-400' : 'border-noir-700 text-stone-600'}`}>{x}</li>)}
      </ol>
      {d.alarm && <div className="text-xs text-red-300">The alarm is ringing.</div>}
      <div className="flex gap-2">
        {d.agents.map((a) => s.characters[a.id] && <div key={a.id} className="text-center text-[10px] text-stone-400"><Face s={s} c={s.characters[a.id]} size={44} /><div>{a.first}{a.specialty ? `, ${a.specialty}` : ''}</div></div>)}
      </div>
    </div>
  );
}

export function SweepPanel({ ses, onMove, busy }: P<SweepData>) {
  const d = ses.d;
  return (
    <div data-testid="sweep-panel">
      <div className="text-xs text-stone-400 mb-1">{d.looks} look{d.looks === 1 ? '' : 's'} left. Hot means very close; warm means near.</div>
      <div className="grid grid-cols-4 gap-1.5">
        {SPOTS.map((sp, i) => {
          const searched = d.searched.includes(i);
          const beat = searched ? ses.beats.find((b) => b.text.startsWith(sp)) : undefined;
          const tone = beat?.text.includes('jumps') ? 'border-red-400 bg-red-500/20' : beat?.text.includes('twitches') ? 'border-amber-400 bg-amber-500/15' : searched ? 'border-noir-700 bg-noir-900 opacity-60' : 'border-noir-600 bg-noir-800 hover:border-gold-500';
          const found = d.found && d.bugAt === i;
          return (
            <button key={sp} disabled={searched || busy || ses.phase !== 'search'} onClick={() => onMove(`search_${i}`)} className={`rounded border p-2 text-[11px] sm:text-xs text-left min-h-[3.25rem] ${found ? 'border-emerald-400 bg-emerald-600/30' : tone}`} data-testid="sweep-spot">
              {sp}{found ? ' — the bug' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ElectionPanel({ ses }: P<ElectionData>) {
  const d = ses.d;
  return (
    <div className="space-y-1.5" data-testid="election-panel">
      <div className="relative h-28 rounded overflow-hidden"><MgStill scene="ward" seed={d.batch + 1} /></div>
      {d.wards.map((w) => (
        <div key={w.name} className="text-xs">
          <div className="flex justify-between text-stone-300"><span>{w.name}</span><span>{w.in ? `${Math.round(w.share)}% – ${100 - Math.round(w.share)}%` : 'not in'}</span></div>
          <div className="h-2 rounded bg-noir-800 overflow-hidden flex">{w.in && <><div className="bg-gold-500" style={{ width: `${w.share}%` }} /><div className="bg-blood-500 flex-1" /></>}</div>
        </div>
      ))}
    </div>
  );
}
