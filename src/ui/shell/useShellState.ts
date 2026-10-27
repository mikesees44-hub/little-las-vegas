import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, PlayerAction } from '../../engine/types';
import { sectionVisible } from './unlocks';
import { loadGoalFlags, saveGoalFlags, type UiGoalFlags } from './goals';
import { HOMES_BY_ID, itemOf, NAV_ONLY, NAV_TREE, REGISTRY_KEYS, type NavGroup } from './nav';
import type { HomeId } from './routes';

function read<T>(key: string, dflt: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : dflt; } catch { return dflt; }
}
function write(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* not remembered */ }
}

export const ALL_SECTION_KEYS = REGISTRY_KEYS;

/**
 * The shell's per-viewer conveniences: snoozed alerts, sections revealed so
 * far (sticky, so a dip in money never hides a drawer again), the gold
 * "new" dots, the guided goals' UI flags. All in localStorage, keyed by the
 * game's seed; everything renders without storage.
 */
export function useShellState(s: GameState, orders: PlayerAction[], sheetId?: string) {
  const seed = s.seed;
  const [snoozed, setSnoozed] = useState<Record<string, number>>(() => read(`llv-snooze-${seed}`, {}));
  const [seen, setSeen] = useState<string[]>(() => read(`llv-unlocked-${seed}`, []));
  const [fresh, setFresh] = useState<string[]>([]);
  const [toast, setToast] = useState<string | undefined>();
  const [flags, setFlags] = useState<UiGoalFlags>(() => loadGoalFlags(seed));
  const first = useRef(true);

  // A new game (or a loaded one) brings its own memory.
  useEffect(() => {
    setSnoozed(read(`llv-snooze-${seed}`, {}));
    setSeen(read(`llv-unlocked-${seed}`, []));
    setFlags(loadGoalFlags(seed));
    setFresh([]);
    first.current = true;
  }, [seed]);

  const visibleNow = useMemo(() => ALL_SECTION_KEYS.filter((k) => sectionVisible(s, k)), [s]);
  useEffect(() => {
    const add = visibleNow.filter((k) => !seen.includes(k));
    if (!add.length) { first.current = false; return; }
    const next = [...seen, ...add];
    setSeen(next);
    write(`llv-unlocked-${seed}`, next);
    if (!first.current && seen.length) {
      setFresh((f) => [...f, ...add]);
      const it = itemOf(add[0]);
      if (it) setToast(`New: ${HOMES_BY_ID[it.home].label} › ${it.label}`);
    }
    first.current = false;
  }, [visibleNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guided-goal flags: the underboss's sheet opened, a council job given.
  useEffect(() => {
    if (!sheetId || flags.metUnderboss) return;
    if (s.characters[sheetId]?.rank === 'underboss') { const f = { ...flags, metUnderboss: true }; setFlags(f); saveGoalFlags(seed, f); }
  }, [sheetId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (flags.gaveTask) return;
    if (orders.some((o) => o.kind === 'councilTask' || o.kind === 'appoint')) { const f = { ...flags, gaveTask: true }; setFlags(f); saveGoalFlags(seed, f); }
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const unlocked = useMemo(() => new Set([...seen, ...visibleNow]), [seen, visibleNow]);
  const reveal = (key: string) => {
    if (unlocked.has(key)) return;
    const next = [...seen, key];
    setSeen(next);
    write(`llv-unlocked-${seed}`, next);
  };
  const open = (k: string) => unlocked.has(k) || (NAV_ONLY as readonly string[]).includes(k);
  /** A home's places open to this boss (an item shows when any of its views is open; a hidden view stays hidden). */
  const groupsOf = (home: HomeId): NavGroup[] => NAV_TREE[home]
    .map((g) => ({ ...g, items: g.items.filter((it) => it.keys.some(open)).map((it) => (it.keys.every(open) ? it : { ...it, id: it.keys.find(open)!, keys: it.keys.filter(open), views: it.views?.filter((_, i) => open(it.keys[i])) })) }))
    .filter((g) => g.items.length > 0);
  const dots = new Set(fresh.map((k) => itemOf(k)?.home).filter((h): h is HomeId => !!h));
  return {
    snoozed,
    snooze: (key: string, until: number) => { const n = { ...snoozed, [key]: until }; setSnoozed(n); write(`llv-snooze-${seed}`, n); },
    unlocked, reveal, open, groupsOf, fresh: new Set(fresh),
    seenSection: (key: string) => setFresh((f) => f.filter((x) => x !== key)),
    dots, toast, clearToast: () => setToast(undefined), flags,
  };
}
