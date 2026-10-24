import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { GameState } from '../../engine/types';
import { deathLine, fullName, houseTree, lifespan, livingOnly, node, type PNode, type TreeUnit } from '../../engine/housesView';
import { useSheet } from '../components/People';
import { Badge } from '../family/bits';
import { useHousesNav } from './nav';
import { PersonFace } from './PersonFace';

/**
 * A house's full multi-generation tree (CK3): the founder at the top, each
 * couple with their children below, spouses beside them with the house they
 * came from (click to jump to that house's tree), the living in colour and
 * the dead greyed with a black ribbon and their cause of death. Generation
 * rows are labelled with their decade. Big trees open with the dead-only
 * branches folded; zoom, drag to pan, fold or unfold any branch.
 */

const CARD_H = 158;
const GAP = 28;
const ROW = CARD_H + GAP;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];

interface CardProps {
  s: GameState;
  n: PNode;
  houseId: string;
  head: boolean;
  founder: boolean;
  spouse?: boolean;
}

function CardImpl({ s, n, houseId, head, founder, spouse }: CardProps) {
  const { open } = useSheet();
  const { openHouse } = useHousesNav();
  const L = s.lineage!;
  const from = spouse && n.house && n.house !== houseId ? L.houses[n.house] : undefined;
  // A daughter whose children belong to her husband's house.
  const married = !spouse && n.g === 'F' ? n.sp.map((x) => node(s, x)).find((x) => x?.house && x.house !== houseId) : undefined;
  const marriedHouse = married?.house ? L.houses[married.house] : undefined;
  const dl = deathLine(s, n);
  return (
    <div
      className={`relative w-[112px] shrink-0 overflow-hidden rounded-md border px-1 pt-1 pb-0.5 text-center ${head ? 'border-gold-400 bg-gold-500/10' : n.alive ? 'border-noir-600 bg-noir-800/90' : 'border-noir-700 bg-noir-900/80'}`}
      style={{ height: CARD_H, filter: n.alive ? undefined : 'grayscale(0.85)' }}
      data-testid={n.alive ? 'tree-living' : 'tree-dead'}
      title={dl ?? undefined}
    >
      {!n.alive && <div className="pointer-events-none absolute -left-6 top-2 w-20 -rotate-45 bg-black py-px text-center text-[7px] tracking-[0.2em] text-stone-400" aria-hidden>{' '}</div>}
      <button type="button" className="mx-auto block rounded hover:ring-2 hover:ring-gold-400" onClick={(e) => { e.stopPropagation(); open(n.id); }} title={fullName(n)}>
        <PersonFace n={n} seed={s.seed} date={s.date} size={spouse ? 36 : 42} />
      </button>
      <button type="button" className={`mt-0.5 block w-full truncate text-[12px] font-semibold leading-tight hover:text-gold-300 ${n.alive ? 'text-stone-100' : 'text-stone-400'}`} onClick={(e) => { e.stopPropagation(); open(n.id); }}>
        {n.first}{n.nick ? ` "${n.nick}"` : ''}
      </button>
      <div className="truncate text-[10px] leading-tight text-stone-400">{n.last}{n.maiden && n.maiden !== n.last ? ` (née ${n.maiden})` : ''}</div>
      <div className="text-[10px] leading-tight text-stone-500">{lifespan(s, n)}</div>
      {dl && <div className="mt-px line-clamp-2 text-[9.5px] leading-[1.15] text-stone-500" data-testid="death-line">{dl}</div>}
      <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
        {head && <Badge tone="gold">♔ Head</Badge>}
        {founder && <Badge tone="gold">Founder</Badge>}
        {n.note && <Badge>{n.note === 'Took the veil' ? 'Nun' : n.note === 'Became a priest' ? 'Priest' : n.note}</Badge>}
        {n.alive && n.rank && n.rank !== 'civilian' && !head && <Badge>{n.rank}</Badge>}
        {!n.alive && n.titles.length > 0 && !founder && <Badge title={n.titles.join('; ')}>{n.titles[0].split(/ \d| since/)[0].slice(0, 18)}</Badge>}
        {from && (
          <button type="button" data-testid="spouse-house" className="rounded border border-gold-600/50 bg-noir-700 px-1 text-[10px] font-semibold text-gold-300 hover:bg-gold-500/20" onClick={(e) => { e.stopPropagation(); openHouse(from.id); }} title={`Go to ${from.title}`}>
            {from.title.replace(/^House /, '')} ›
          </button>
        )}
        {marriedHouse && (
          <button type="button" className="rounded border border-noir-600 bg-noir-700 px-1 text-[10px] text-stone-300 hover:text-gold-300" onClick={(e) => { e.stopPropagation(); openHouse(marriedHouse.id); }} title={`Her children are of ${marriedHouse.title}`}>
            → {marriedHouse.name}
          </button>
        )}
      </div>
    </div>
  );
}

const Card = memo(CardImpl);

interface UnitProps {
  s: GameState;
  u: TreeUnit;
  houseId: string;
  headId?: string;
  founderId?: string;
  showDead: boolean;
  isOpen: (u: TreeUnit) => boolean;
  toggle: (id: string, open: boolean) => void;
}

function Unit({ s, u, houseId, headId, founderId, showDead, isOpen, toggle }: UnitProps) {
  const n = node(s, u.id);
  if (!n) return null;
  const spouses = u.spouses.map((x) => node(s, x)).filter((x): x is PNode => !!x && (showDead || x.alive));
  const open = u.kids.length > 0 && isOpen(u);
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-start gap-1">
        <Card s={s} n={n} houseId={houseId} head={n.id === headId} founder={n.id === founderId} />
        {spouses.map((sp) => (
          <div key={sp.id} className="flex items-start gap-1">
            <div className="self-center text-sm text-gold-500" title="Married">⚭</div>
            <Card s={s} n={sp} houseId={houseId} head={false} founder={false} spouse />
          </div>
        ))}
        {u.kids.length > 0 && (
          <button
            type="button"
            className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-gold-600/60 bg-noir-900 px-1.5 text-[10px] leading-4 text-gold-300 hover:bg-gold-500/20"
            onClick={(e) => { e.stopPropagation(); toggle(u.id, !open); }}
            data-testid="branch-toggle"
            title={open ? 'Fold this branch' : 'Unfold this branch'}
          >
            {open ? '▾' : `▸ ${u.kids.length} ${u.kids.length === 1 ? 'child' : 'children'}`}
          </button>
        )}
      </div>
      {open && (
        <>
          <div className="w-px bg-gold-600/50" style={{ height: GAP / 2 }} />
          <div className="flex items-start">
            {u.kids.map((k, i) => (
              <div key={k.id} className="relative flex flex-col items-center px-1.5" style={{ paddingTop: GAP / 2 }}>
                {i > 0 && <div className="absolute left-0 top-0 h-px w-1/2 bg-gold-600/50" />}
                {i < u.kids.length - 1 && <div className="absolute right-0 top-0 h-px w-1/2 bg-gold-600/50" />}
                <div className="absolute left-1/2 top-0 w-px bg-gold-600/50" style={{ height: GAP / 2 }} />
                <Unit s={s} u={k} houseId={houseId} headId={headId} founderId={founderId} showDead={showDead} isOpen={isOpen} toggle={toggle} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function deepest(u: TreeUnit, isOpen: (u: TreeUnit) => boolean): number {
  if (!u.kids.length || !isOpen(u)) return u.depth;
  return Math.max(...u.kids.map((k) => deepest(k, isOpen)));
}

export function HouseTree({ s, houseId }: { s: GameState; houseId: string }) {
  const L = s.lineage!;
  const h = L.houses[houseId];
  const tree = useMemo(() => houseTree(s, houseId), [s, houseId]);
  const [showDead, setShowDead] = useState(true);
  const [zoom, setZoom] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 0.7 : 1));
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => setOverrides({}), [houseId]);
  const root = useMemo(() => (tree.root ? (showDead ? tree.root : livingOnly(tree.root)) : undefined), [tree, showDead]);
  const big = tree.people > 45;
  const isOpen = useCallback((u: TreeUnit) => {
    const o = overrides[u.id];
    if (o !== undefined) return o;
    if (o === undefined && overrides.__all !== undefined) return overrides.__all;
    if (u.depth < 2) return true;
    return u.living && (!big || u.size <= 30);
  }, [overrides, big]);
  const toggle = useCallback((id: string, open: boolean) => setOverrides((o) => ({ ...o, [id]: open })), []);
  const rows = root ? deepest(root, isOpen) + 1 : 0;
  const headId = h.player ? s.playerId : h.headId;

  // Drag to pan.
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const onDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('button') || !box.current) return;
    drag.current = { x: e.clientX, y: e.clientY, l: box.current.scrollLeft, t: box.current.scrollTop };
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current || !box.current) return;
    box.current.scrollLeft = drag.current.l - (e.clientX - drag.current.x);
    box.current.scrollTop = drag.current.t - (e.clientY - drag.current.y);
  };
  const onUp = () => { drag.current = null; };
  // Start centred on the founder.
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
  }, [houseId, showDead]);

  return (
    <div className="space-y-2" data-testid="house-tree">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1 text-stone-300">
          <input type="checkbox" checked={showDead} onChange={(e) => setShowDead(e.target.checked)} data-testid="show-dead" /> Show the dead
        </label>
        <span className="text-stone-600">·</span>
        <button className="btn-ghost py-0.5 text-xs" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">−</button>
        <span className="w-10 text-center tabular-nums text-stone-400">{Math.round(zoom * 100)}%</span>
        <button className="btn-ghost py-0.5 text-xs" onClick={() => setZoom((z) => Math.min(1.3, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">+</button>
        <span className="text-stone-600">·</span>
        <button className="btn-ghost py-0.5 text-xs" onClick={() => setOverrides({ __all: true })}>Unfold all</button>
        <button className="btn-ghost py-0.5 text-xs" onClick={() => setOverrides({ __all: false })}>Fold all</button>
        <span className="ml-auto text-stone-500">{tree.people} of the blood · drag to pan</span>
      </div>
      <div
        ref={box}
        className="max-h-[70vh] cursor-grab overflow-auto overscroll-contain rounded-md border border-noir-700 bg-noir-950/50 p-3 active:cursor-grabbing"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
      >
        {root ? (
          <div className="relative mx-auto flex w-max" style={{ zoom }}>
            <div className="sticky left-0 z-20 w-0 shrink-0 self-stretch">
              {Array.from({ length: rows }, (_, d) => (
                <div key={d} className="absolute left-0 whitespace-nowrap rounded-sm border border-noir-700 bg-noir-950/95 px-1.5 py-px" style={{ top: d === 0 ? -10 : d * ROW - GAP / 2 - 9 }} data-testid="gen-label">
                  <span className="font-display text-[12px] text-gold-400">Gen {ROMAN[d] ?? d + 1}</span>
                  <span className="ml-1 text-[10px] text-stone-400">{tree.gens[d] ?? ''}</span>
                </div>
              ))}
            </div>
            <div className="pl-1">
              <Unit s={s} u={root} houseId={houseId} headId={headId} founderId={h.founderId} showDead={showDead} isOpen={isOpen} toggle={toggle} />
            </div>
          </div>
        ) : <div className="text-sm text-stone-500">No tree recorded.</div>}
      </div>
      {tree.orphans.length > 0 && (
        <OtherKin s={s} ids={tree.orphans} houseId={houseId} />
      )}
    </div>
  );
}

function OtherKin({ s, ids, houseId }: { s: GameState; ids: string[]; houseId: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Other kin of the house</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {ids.slice(0, 24).map((id) => {
          const n = node(s, id);
          return n ? <Card key={id} s={s} n={n} houseId={houseId} head={false} founder={false} /> : null;
        })}
      </div>
    </div>
  );
}
