import { useState } from 'react';
import { sideMatches, sideOf, type SideFilter } from '../../engine/sides';
import { SideChip, SideFilterBar } from '../components/Side';
import { attachmentBoard, connectionsOf, sideName } from '../../engine/earsWeb';
import type { GameState } from '../../engine/types';
import { CharLink, Face } from '../components/People';
import { Tip } from '../clarity';
import { sinceWeek } from '../format';

const TYPE_TONE: Record<string, string> = {
  likes: 'text-sky-300', regular: 'text-amber-200', girlfriend: 'text-rose-300', mistress: 'text-rose-400', in_love: 'text-pink-300', ex: 'text-stone-500', owes: 'text-amber-400',
};

/** Whom this person is attached to (what the boss knows; the Ears reveal the rest). */
export function ConnectionsList({ s, id, compact }: { s: GameState; id: string; compact?: boolean }) {
  const [filter, setFilter] = useState<SideFilter>('all');
  const all = connectionsOf(s, id);
  if (!all.length) {
    return compact ? <p className="text-[11px] text-stone-500" data-testid="connections-empty">Nobody you know of. The Ears may know better.</p> : null;
  }
  const mixed = !compact && new Set(all.map((x) => sideOf(s, x.otherId).kind === 'yours')).size > 1;
  const list = mixed ? all.filter((x) => sideMatches(sideOf(s, x.otherId), filter)) : all;
  return (
    <>
    {mixed && <div className="mb-1"><SideFilterBar value={filter} onChange={setFilter} /></div>}
    <ul className="space-y-1" data-testid="connections">
      {list.slice(0, compact ? 6 : 12).map((x) => (
        <li key={`${x.otherId}:${x.type}`} className="flex items-center gap-2 text-sm min-w-0">
          {!compact && s.characters[x.otherId] && <Face s={s} c={s.characters[x.otherId]} size={28} />}
          <Tip text={`${x.text}${x.type !== 'ex' && x.ended === undefined ? ` · strength ${Math.round(x.strength)} of 100` : ''} · ${sinceWeek(x.since).toLowerCase()}${x.source === 'romance' ? ' · a romance' : ''}`}>
            <span className={`min-w-0 truncate ${compact ? 'text-xs' : ''}`}>
              <CharLink s={s} id={x.otherId} className="text-stone-200" />
              <span className={`ml-1.5 ${TYPE_TONE[x.type] ?? 'text-stone-300'} ${x.ended !== undefined ? 'line-through decoration-stone-600' : ''}`}>{x.short}</span>
            </span>
          </Tip>
          {!compact && s.characters[x.otherId] && <SideChip s={s} id={x.otherId} />}
          {x.type !== 'ex' && x.ended === undefined && <span className="ml-auto shrink-0 h-1 w-10 rounded bg-noir-700 overflow-hidden inline-block"><span className="block h-full bg-rose-400/70" style={{ width: `${x.strength}%` }} /></span>}
        </li>
      ))}
    </ul>
    </>
  );
}

/** The sheet's section: shown only when there is something to show. */
export function ConnectionsSection({ s, id }: { s: GameState; id: string }) {
  if (!connectionsOf(s, id).length) return null;
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="sheet-connections">
      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-1">Connections</div>
      <ConnectionsList s={s} id={id} />
    </section>
  );
}

const SIDE_TONE: Record<string, string> = { yours: 'border-gold-600/50', law: 'border-sky-700/60', town: 'border-noir-600' };

/** Who's attached to whom: the board. */
export function AttachmentBoard({ s, limit = 40 }: { s: GameState; limit?: number }) {
  const rows = attachmentBoard(s);
  if (!rows.length) return <p className="text-sm text-stone-400" data-testid="attach-board">Nobody you know of yet. The Ears see who sits with whom; pay them and you will too.</p>;
  const sides = [...new Set(rows.map((r) => r.side))];
  return (
    <div className="space-y-3" data-testid="attach-board">
      {sides.map((side) => (
        <div key={side}>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-1">{sideName(s, side)}</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {rows.filter((r) => r.side === side).slice(0, limit).map((r) => {
              const m = s.characters[r.manId];
              const w = s.characters[r.womanId];
              return (
                <div key={`${r.manId}:${r.womanId}`} className={`flex items-center gap-2 rounded border bg-noir-800/60 px-2 py-1.5 ${SIDE_TONE[side] ?? 'border-blood-500/40'}`}>
                  <Face s={s} c={m} size={30} />
                  <div className="min-w-0 flex-1 text-xs leading-tight">
                    <div className="truncate"><CharLink s={s} id={m.id} className="text-stone-100" /></div>
                    <div className={`${TYPE_TONE[r.type] ?? ''}`}>{r.label}</div>
                    <div className="truncate"><CharLink s={s} id={w.id} className="text-stone-300" /></div>
                    {r.danger && <div className="text-[10px] text-amber-400">⚠ {r.danger}</div>}
                  </div>
                  <Face s={s} c={w} size={30} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
