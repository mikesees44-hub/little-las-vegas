import { useMemo, useRef, useState, type ReactNode } from 'react';
import { HOODS, type HoodId } from '../../engine/hoodData';
import type { GameState } from '../../engine/types';
import { useSheet } from '../components/People';
import { useEscape } from '../keys';
import type { Item } from './Buildings';

/**
 * The island map's controls in three menus: View (island, plan, block map,
 * street, walk, districts, survey), Show (an overlay and the lighting) and
 * Find (a district, an address, a business, a person). The zoom and Recenter
 * stay on the map.
 */

export function MapMenu({ label, testid, children }: { label: string; testid: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  useEscape(open, () => setOpen(false));
  return (
    <div className="relative">
      <button type="button" className="hv-btn hv-on" aria-expanded={open} onClick={() => setOpen((x) => !x)} data-testid={testid}>{label} ▾</button>
      {open && (
        <div className="absolute right-0 mt-1 w-52 max-h-[60vh] overflow-y-auto rounded border border-noir-600 bg-noir-900/95 p-1 shadow-xl z-[1005]" role="menu" data-testid={`${testid}-menu`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export interface FindHit { kind: 'district' | 'address' | 'business' | 'person'; id: string; name: string; sub: string }

/** Everything Find can reach, matched on a query. Pure. */
export function findOnMap(s: GameState, items: Item[], q: string, limit = 12): FindHit[] {
  const qq = q.trim().toLowerCase();
  if (qq.length < 2) return [];
  const out: FindHit[] = [];
  for (const h of HOODS) if (h.name.toLowerCase().includes(qq)) out.push({ kind: 'district', id: h.id, name: h.name, sub: 'District' });
  for (const it of items) {
    const addr = it.lot?.address ?? '';
    if (it.name.toLowerCase().includes(qq)) out.push({ kind: 'business', id: it.key, name: it.name, sub: addr || 'A place' });
    else if (addr.toLowerCase().includes(qq)) out.push({ kind: 'address', id: it.key, name: addr, sub: it.name });
  }
  for (const c of Object.values(s.characters)) {
    if (!c.alive) continue;
    const n = `${c.firstName} ${c.nickname ? `"${c.nickname}" ` : ''}${c.lastName}`;
    if (n.toLowerCase().includes(qq)) out.push({ kind: 'person', id: c.id, name: n, sub: c.rank !== 'civilian' ? c.rank : c.office ?? 'Townsperson' });
    if (out.length > limit * 3) break;
  }
  const order = { district: 0, business: 1, address: 2, person: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, limit);
}

export function MapFind({ s, items, onHood, onItem }: { s: GameState; items: Item[]; onHood: (id: HoodId) => void; onItem: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { open: openSheet } = useSheet();
  useEscape(open, () => setOpen(false));
  const hits = useMemo(() => findOnMap(s, items, q), [s, items, q]);
  const go = (h: FindHit) => {
    setOpen(false);
    if (h.kind === 'district') onHood(h.id as HoodId);
    else if (h.kind === 'person') openSheet(h.id);
    else onItem(h.id);
  };
  return (
    <div className="relative">
      <button type="button" className="hv-btn hv-on" aria-expanded={open} onClick={() => { setOpen((x) => !x); setTimeout(() => input.current?.focus(), 0); }} data-testid="map-find">Find ▾</button>
      {open && (
        <div className="absolute right-0 mt-1 w-64 rounded border border-noir-600 bg-noir-900/95 p-1.5 shadow-xl z-[1005]" data-testid="map-find-menu">
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A district, address, place or person" aria-label="Find on the map" data-testid="map-find-input"
            className="w-full rounded border border-noir-600 bg-noir-950 px-2 py-1 text-xs text-stone-200" />
          {q.trim().length >= 2 && !hits.length && <p className="px-1 pt-1 text-[11px] text-stone-500">Nothing by that name.</p>}
          <ul className="mt-1 max-h-[50vh] overflow-y-auto">
            {hits.map((h) => (
              <li key={`${h.kind}:${h.id}`}>
                <button type="button" className="hv-mi" onClick={() => go(h)} data-testid="map-find-hit">
                  <span className="text-stone-100">{h.name}</span> <span className="text-[10px] text-stone-500">· {h.kind} · {h.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
