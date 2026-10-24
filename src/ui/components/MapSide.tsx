import { owned, playerSlots, expectedTake } from '../../engine/business';
import { CATALOG } from '../../engine/catalog';
import { ageOn } from '../../engine/calendar';
import { displayName, player } from '../../engine/characters';
import type { Alert } from '../../engine/alerts';
import { FACTION_NAMES } from '../../engine/world';
import type { FactionId, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { districtHeat, districtIncome, FACTION_FILL } from './IslandMap';
import { ActionCard } from './Orders';
import { CharLink, Face, TraitIcons } from './People';

export function DistrictPanel({ s, id, onOpenBusiness }: { s: GameState; id: string; onOpenBusiness: () => void }) {
  const d = s.districts.find((x) => x.id === id);
  if (!d) return null;
  const capo = d.capoId ? s.characters[d.capoId] : undefined;
  const biz = owned(s).filter((b) => b.districtId === id);
  const sl = playerSlots(s, id);
  const rivals = s.rivals.filter((r) => r.homeDistrict === id);
  const entries = (Object.entries(d.influence) as [FactionId, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-3" data-testid="district-panel">
      <div>
        <div className="font-display text-xl text-gold-400">{d.name}</div>
        <div className="text-xs text-stone-400 italic">{d.description}</div>
      </div>
      <div className="flex h-2.5 rounded overflow-hidden">
        {entries.map(([f, v]) => <div key={f} style={{ width: `${v}%`, background: FACTION_FILL[f] }} title={`${FACTION_NAMES[f]} ${v}%`} />)}
      </div>
      <div className="text-[11px] text-stone-400 flex flex-wrap gap-x-2">
        {entries.map(([f, v]) => <span key={f}><span className="inline-block w-2 h-2 rounded-sm mr-0.5" style={{ background: FACTION_FILL[f] }} />{FACTION_NAMES[f]} {v}%</span>)}
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-xs">
        <div className="rounded bg-noir-800 px-2 py-1"><div className="text-stone-500">Your take</div><div className="text-gold-300 tabular-nums">{fmt$(districtIncome(s, id))}/wk</div></div>
        <div className="rounded bg-noir-800 px-2 py-1"><div className="text-stone-500">Heat</div><div className="tabular-nums">{districtHeat(s, id)}</div></div>
        <div className="rounded bg-noir-800 px-2 py-1"><div className="text-stone-500">Storefronts</div><div className="tabular-nums">{sl.used}/{sl.max}</div></div>
      </div>
      <div className="flex items-center gap-2">
        {capo ? <Face s={s} c={capo} size={40} /> : null}
        <div className="text-sm">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Holder</div>
          {capo ? <><CharLink s={s} id={capo.id} /> <span className="text-xs text-stone-500">capo, keeps 30%</span></> : <span className="text-stone-400">{(d.influence.player ?? 0) >= 40 ? 'No capo — the take leaks' : 'Not yours to hold yet'}</span>}
        </div>
      </div>
      {rivals.map((r) => {
        const L = s.characters[r.leaderId];
        return L ? (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <Face s={s} c={L} size={36} />
            <div><div className="text-[10px] uppercase tracking-widest text-stone-500">Headquarters of {r.name}</div><CharLink s={s} id={L.id} /></div>
          </div>
        ) : null;
      })}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-stone-500">Your places here</div>
        {biz.length === 0 && <div className="text-xs text-stone-500">None.</div>}
        <ul className="text-xs divide-y divide-noir-800">
          {biz.map((b) => (
            <li key={b.id} className="flex justify-between py-1 gap-2">
              <span className="text-stone-300">{b.name} <span className="text-stone-500">· {CATALOG[b.kind].name}</span></span>
              <span className="text-gold-300 tabular-nums">{CATALOG[b.kind].base ? `${fmt$(expectedTake(s, b))}/wk` : 'by the score'}</span>
            </li>
          ))}
        </ul>
        {sl.used < sl.max && <button className="mt-1 text-xs underline text-gold-300" onClick={onOpenBusiness}>Open a business here →</button>}
      </div>
      {!s.gameOver && <ActionCard s={s} action={{ kind: 'pushDistrict', district: id }} />}
    </div>
  );
}

export function PlayerCard({ s }: { s: GameState }) {
  const b = player(s);
  return (
    <div className="flex items-end gap-2 rounded-lg border border-gold-600/50 bg-noir-900/90 p-2 shadow-lg shadow-black/50" data-testid="player-card">
      <Face s={s} c={b} size={64} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gold-300 truncate max-w-[12rem]">{displayName(b)}</div>
        <div className="text-[11px] text-stone-400">Head of the house · {ageOn(b.birth, s.date)} yrs · health {b.health}</div>
        <div className="mt-1"><TraitIcons c={b} /></div>
      </div>
    </div>
  );
}

const ALERT_GLYPH: Record<Alert['kind'], string> = {
  unhappy: '☹', defector: '⇄', heat: '♨', money: '$', heir: '♔', loan: '%', staff: '⚒', decision: '✉', scheme: '☠', dispute: '⚖', war: '⚔', family: '♥',
};

export function AlertRail({ s, items, onAlert }: { s: GameState; items: Alert[]; onAlert: (a: Alert) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="alert-rail">
      {items.slice(0, 9).map((a, i) => (
        <button
          key={i}
          onClick={() => onAlert(a)}
          title={`${a.title} — ${a.text}`}
          className={`group relative w-9 h-9 rounded-full border-2 flex items-center justify-center text-base font-bold shadow-md shadow-black/60 ${a.severity === 'danger' ? 'bg-blood-500/80 border-red-300 text-white' : a.severity === 'warn' ? 'bg-amber-700/80 border-amber-300 text-white' : 'bg-noir-700/90 border-gold-500 text-gold-300'}`}
        >
          <span style={{ fontVariantEmoji: 'text' } as never}>{ALERT_GLYPH[a.kind]}&#xFE0E;</span>
          <span className="hidden group-hover:block absolute right-11 top-0 w-56 text-left rounded border border-noir-600 bg-noir-900 px-2 py-1 text-[11px] font-normal text-stone-300 z-30">
            <span className="block text-gold-300 font-semibold">{a.title}</span>{a.text}
          </span>
        </button>
      ))}
      <span className="sr-only">{s.week}</span>
    </div>
  );
}
