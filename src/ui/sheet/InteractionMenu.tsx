import { CallingCard } from '../nightlife/CallingCard';
import { openProtectionFor } from '../borgata/Protection';
import { previewAction } from '../../engine/actions';
import { useEscape } from '../keys';
import { useMemo, useRef, useState } from 'react';
import { displayName } from '../../engine/characters';
import { GIFT_CAT_LABEL } from '../../engine/gifts';
import type { Character, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { useSheet } from '../components/People';
import { usePlanner } from '../components/Schemes';
import { useClarity } from '../clarity/context';
import { useTravel } from '../travel/context';
import { useShell } from '../shell/context';
import { CATEGORY_LABEL, menuFor, rankedGifts, type MenuCategory, type MenuCategoryId, type MenuItem } from './menuCatalog';
import { EarsPicker } from '../ears/EarsPicker';
import { ActionRow } from '../components/ActionRow';
import { DatingSection } from '../dating/DatingPanel';
import { DirtyOnPerson } from '../econ/DirtyWork';
import { quickActionsFor } from './QuickActions';
import { ConnectionsList } from '../ears/Connections';
import { RelationChip, SideChip } from '../components/Side';
import { sideOf } from '../../engine/sides';

/** What you can do now first; what is blocked (with its reason) after. */
function sortItems(s: GameState, items: MenuItem[]): MenuItem[] {
  const blocked = (it: MenuItem) => (it.action ? !!previewAction(s, it.action).disabledReason : false);
  return [...items.filter((x) => !blocked(x)), ...items.filter(blocked)];
}

function GiftPicker({ s, c }: { s: GameState; c: Character }) {
  const [more, setMore] = useState(false);
  const { known, list } = useMemo(() => rankedGifts(s, c), [s, c]);
  const best = list.slice(0, 3);
  const cats = [...new Set(list.map((x) => x.g.cat))];
  const [cat, setCat] = useState(cats[0]);
  return (
    <div className="space-y-1.5" data-testid="gift-picker">
      <div className="text-[11px] text-stone-400">{known ? 'The three he would like best:' : 'You do not know his tastes yet (trust 20+). Three that suit his station:'}</div>
      {best.map((x) => <ActionCard key={x.g.id} s={s} compact action={{ kind: 'econ', op: { type: 'gift', giftId: x.g.id, to: c.id } }} label={`${x.g.name} — ${fmt$(x.price)}${x.liked ? ' ♥' : ''}`} />)}
      <button type="button" className="text-[11px] text-gold-300 underline" onClick={() => setMore((m) => !m)}>{more ? 'fewer' : `more… (${list.length} in the catalogue)`}</button>
      {more && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">{cats.map((k) => <button key={k} type="button" onClick={() => setCat(k)} className={`text-[11px] px-1.5 py-0.5 rounded ${cat === k ? 'bg-noir-700 text-gold-300' : 'text-stone-400'}`}>{GIFT_CAT_LABEL[k]}</button>)}</div>
          {list.filter((x) => x.g.cat === cat).map((x) => <ActionCard key={x.g.id} s={s} compact action={{ kind: 'econ', op: { type: 'gift', giftId: x.g.id, to: c.id } }} label={`${x.g.name} — ${fmt$(x.price)}${x.liked ? ' ♥' : x.disliked ? ' ✕' : ''}`} />)}
        </div>
      )}
    </div>
  );
}

function Item({ s, c, it, onDone }: { s: GameState; c: Character; it: MenuItem; onDone?: () => void }) {
  const { plan } = usePlanner();
  const travel = useTravel();
  const { openPicker } = useClarity();
  const shell = useShell();
  const [gifts, setGifts] = useState(false);
  if (it.action) return <ActionRow s={s} action={it.action} label={it.label} hostile={it.hostile} />;
  const o = it.open!;
  if (o.type === 'gifts' && gifts) return <GiftPicker s={s} c={c} />;
  if (o.type === 'dirty' && gifts) return <div className="sm:col-span-2 rounded-md border border-blood-500/40 p-2"><DirtyOnPerson s={s} charId={c.id} onGo={() => { onDone?.(); shell.go('holdings.dirty'); }} /></div>;
  if (o.type === 'dating' && gifts) {
    const more = <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" onClick={() => { onDone?.(); shell.go('you.dating'); }}>Relationships & Dating ▸</button>;
    return <div className="sm:col-span-2 rounded-md border border-noir-700 p-2"><DatingSection s={s} id={c.id} fallback={<div className="text-xs text-stone-400">Nothing between you yet. {more}</div>} /></div>;
  }
  if (o.type === 'card' && gifts) return <div className="sm:col-span-2 rounded-md border border-noir-700 p-2"><CallingCard s={s} id={c.id} /></div>;
  if (o.type === 'ears' && gifts) return <div className="sm:col-span-2 rounded-md border border-noir-700 p-2">{o.mode === 'web' ? <ConnectionsList s={s} id={c.id} compact /> : <EarsPicker s={s} target={c} mode={o.mode} />}</div>;
  const run = () => {
    if (o.type === 'plan') { onDone?.(); plan(o.kind, c.id); }
    else if (o.type === 'trip') { onDone?.(); travel.plan(c.id); }
    else if (o.type === 'flee') { onDone?.(); travel.flee(c.id); }
    else if (o.type === 'marriage') { onDone?.(); openPicker({ kind: 'marriage', memberId: c.id }); }
    else if (o.type === 'go') { onDone?.(); if (o.to === 'borgata.protect') openProtectionFor(c.id); shell.go(o.to); }
    else if (o.type === 'gifts' || o.type === 'ears' || o.type === 'dating' || o.type === 'dirty' || o.type === 'card') setGifts(true);
  };
  return (
    <button type="button" onClick={run} className={`w-full rounded-md border px-3 py-2 text-left ${it.hostile ? 'border-blood-500/50 hover:bg-blood-500/10' : 'border-noir-700 bg-noir-800/70 hover:border-gold-500'}`}>
      <div className={`text-sm font-semibold ${it.hostile ? 'text-red-300' : 'text-stone-100'}`}>{it.label ?? (o.type === 'go' ? o.label : '')} <span className="text-gold-300">▸</span></div>
      {it.text && <div className="text-[11px] text-stone-400">{it.text}</div>}
    </button>
  );
}

/** Everything one line of the menu says, for "Find an action…". */
function itemText(s: GameState, it: MenuItem): string {
  const t = it.action ? `${previewAction(s, it.action).title} ${previewAction(s, it.action).verb ?? ''}` : '';
  return `${it.label ?? ''} ${t} ${it.text ?? ''} ${it.open?.type === 'go' ? it.open.label : ''}`.toLowerCase();
}

/** Moves that are never a suggestion (they stay in their category): breaking a man down, sending him away, ending things. */
const HARSH = /^i:(demote|exile|threaten|whack|expose|endRomance|separate|demand)$|^(k-|unplace)$|^d:(insult|threaten|demandRespect|disown|frame|blackmail|plantRumor|fabricateHook|discipline|turn)$/;

/**
 * "Best now": the few orders that fit this kind of man best (the sheet's quick
 * row), then the first thing you can do in each other category, so the most
 * relevant are one tap away and nothing else is more than two.
 */
export function bestFor(s: GameState, c: { id: string } & Parameters<typeof quickActionsFor>[1], cats: MenuCategory[], max = 6): MenuItem[] {
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  const blocked = (it: MenuItem) => (it.action ? !!previewAction(s, it.action).disabledReason : false);
  const all = cats.flatMap((x) => x.items);
  for (const a of quickActionsFor(s, c)) {
    const it = all.find((x) => x.action && JSON.stringify(x.action) === JSON.stringify(a));
    if (it && !seen.has(it.key)) { out.push(it); seen.add(it.key); }
  }
  for (const cat of cats) {
    if (out.length >= max) break;
    const it = cat.items.find((x) => !seen.has(x.key) && !blocked(x) && !x.hostile && !HARSH.test(x.key));
    if (it) { out.push(it); seen.add(it.key); }
  }
  return out;
}

/**
 * DEAL WITH [PERSON]: everything you can do to one person, CK style, in one
 * panel used by his sheet, the right-click menu and every ⋯. "Best now" first;
 * "Find an action…" searches every category; each order is a folded row (tap
 * it for the full card). What can't be done now sits last with its reason.
 */
export function InteractionMenu({ s, c, initial, onDone, cats: given }: { s: GameState; c: Character; initial?: MenuCategoryId; onDone?: () => void; cats?: MenuCategory[] }) {
  const base = useMemo(() => given ?? menuFor(s, c), [given, s, c]);
  const cats = useMemo(() => {
    const best = base.length > 1 ? bestFor(s, c, base) : [];
    return best.length >= 2 ? [{ id: 'best' as MenuCategoryId, label: CATEGORY_LABEL.best, items: best }, ...base] : base;
  }, [base, s, c]);
  const [cur, setCur] = useState<MenuCategoryId | undefined>(initial && cats.some((x) => x.id === initial) ? initial : cats[0]?.id);
  const [q, setQ] = useState('');
  if (!cats.length) return null;
  const cat = cats.find((x) => x.id === cur) ?? cats[0];
  const total = base.reduce((n, x) => n + x.items.length, 0);
  const query = q.trim().toLowerCase();
  const hits = query ? base.flatMap((x) => x.items.map((it) => ({ it, cat: x }))).filter(({ it }) => query.split(/\s+/).every((w) => itemText(s, it).includes(w) || CATEGORY_LABEL[base.find((y) => y.items.includes(it))!.id].toLowerCase().includes(w))) : [];
  return (
    <section className="mt-4" data-testid="interaction-menu">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="panel-title text-base flex flex-wrap items-center gap-1.5">{c.id === s.playerId ? 'Your own business' : `Deal with ${c.firstName}`}{c.id !== s.playerId && <><SideChip s={s} id={c.id} /><RelationChip relation={sideOf(s, c.id).relation} /></>}</div>
        <span className="text-[11px] text-stone-500">{total} things you can do · carried out when the week turns</span>
      </div>
      {total > 6 && (
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find an action… (gift, dinner, hit, promote)`} aria-label="Find an action"
          className="inp mt-1.5 text-xs" data-testid="menu-find" />
      )}
      {query ? (
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5" data-testid="menu-find-hits">
          {!hits.length && <p className="text-xs text-stone-500">Nothing by that name for {c.firstName}. Try another word, or Find… in the top bar.</p>}
          {sortItems(s, hits.map((h) => h.it)).map((it) => <Item key={it.key} s={s} c={c} it={it} onDone={onDone} />)}
        </div>
      ) : (
        <>
          <nav className="mt-1.5 flex flex-wrap gap-1" aria-label="Interaction categories">
            {cats.map((x) => (
              <button key={x.id} type="button" onClick={() => setCur(x.id)} data-testid={`menu-cat-${x.id}`}
                className={`rounded px-2 py-1 text-xs font-semibold ${cat.id === x.id ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`}>
                {x.label} <span className={cat.id === x.id ? 'text-noir-800' : 'text-stone-500'}>{x.items.length}</span>
              </button>
            ))}
          </nav>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5">
            {sortItems(s, cat.items).map((it) => <Item key={it.key} s={s} c={c} it={it} onDone={onDone} />)}
          </div>
        </>
      )}
    </section>
  );
}

/** The right-click menu: the same categories in a floating card at the cursor. */
export function ContextMenu({ s, id, x, y, category, onClose }: { s: GameState; id: string; x: number; y: number; category?: MenuCategoryId; onClose: () => void }) {
  const c = s.characters[id];
  const { open } = useSheet();
  const ref = useRef<HTMLDivElement>(null);
  useEscape(true, onClose);
  if (!c) return null;
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  const width = Math.min(560, w - 16);
  const left = Math.max(8, Math.min(x, w - width - 8));
  // Phones: a sheet from near the top, the whole height to scroll in.
  const top = w < 640 ? 48 : Math.max(8, Math.min(y, h - 360));
  return (
    <div className="fixed inset-0 z-[1180] bg-black/40 sm:bg-transparent" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} data-testid="context-menu-backdrop">
      <div ref={ref} className="absolute panel border-gold-600/60 p-3 overflow-y-auto shadow-2xl shadow-black/80" style={{ left, top, width, maxHeight: h - top - 8 }} onClick={(e) => e.stopPropagation()} data-testid="context-menu">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display text-lg text-gold-400 truncate">{displayName(c)}</div>
            {c.id !== s.playerId && <SideChip s={s} id={c.id} full />}
          </div>
          <div className="flex gap-1 shrink-0">
            <button type="button" className="btn-ghost text-xs py-0.5" onClick={() => { onClose(); open(c.id); }}>Open sheet</button>
            <button type="button" className="btn-ghost text-xs py-0.5" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>
        <InteractionMenu s={s} c={c} initial={category} onDone={onClose} />
      </div>
    </div>
  );
}
