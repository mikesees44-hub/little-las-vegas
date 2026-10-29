import { hashSeed, rand } from '../rng';
import type { GameState } from '../types';
import { HOOK_CAP, LOG_CAP, OWED_CAP, TIE_CAP, type DeedId, type DeedsState, type Tie, type TieKind } from './types';

/** The deeds layer, made on first use. */
export function ensureDeeds(s: GameState): DeedsState {
  if (!s.deeds) {
    s.deeds = {
      v: 1, rng: hashSeed(`${s.seed}:deeds`), cd: {}, ties: {}, log: [], owed: [], hooks: [], asks: [], last: {}, told: {}, edu: {}, sc: {}, due: [], cw: -99, pt: [], ln: [],
      stats: { done: 0, npc: 0, asks: 0, ties: 0, scenes: 0 },
    };
  }
  const D = s.deeds;
  D.cd ??= {};
  D.ties ??= {};
  D.log ??= [];
  D.owed ??= [];
  D.hooks ??= [];
  D.asks ??= [];
  D.last ??= {};
  D.told ??= {};
  D.edu ??= {};
  D.sc ??= {};
  D.due ??= [];
  D.cw ??= -99;
  D.pt ??= [];
  D.ln ??= [];
  D.stats ??= { done: 0, npc: 0, asks: 0, ties: 0, scenes: 0 };
  return D;
}

/** The deeds' own dice. */
export function d01(D: DeedsState): number {
  return rand(D);
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function tieOf(s: GameState, a: string, b: string): Tie | undefined {
  return s.deeds?.ties[pairKey(a, b)];
}

export function setTie(s: GameState, a: string, b: string, k: TieKind | undefined, y: string): void {
  const D = ensureDeeds(s);
  const key = pairKey(a, b);
  if (!k) { delete D.ties[key]; return; }
  const prev = D.ties[key];
  if (prev?.k === k) return;
  D.ties[key] = { k, w: s.week, y: y.slice(0, 60) };
  D.stats.ties++;
  const keys = Object.keys(D.ties);
  if (keys.length > TIE_CAP) {
    // The oldest go first (a friendship of years outlasts a spat of last month only if renewed).
    keys.sort((x, y2) => D.ties[x].w - D.ties[y2].w || x.localeCompare(y2));
    for (const k2 of keys.slice(0, keys.length - TIE_CAP)) delete D.ties[k2];
  }
}

/** Everyone he has a tie with. */
export function tiesOf(s: GameState, id: string): { other: string; tie: Tie }[] {
  const out: { other: string; tie: Tie }[] = [];
  for (const [k, t] of Object.entries(s.deeds?.ties ?? {})) {
    const [a, b] = k.split('|');
    if (a === id) out.push({ other: b, tie: t });
    else if (b === id) out.push({ other: a, tie: t });
  }
  return out;
}

export function cdKey(id: DeedId, a: string, t: string): string {
  return `${id}:${a}:${t}`;
}

/** Weeks left on a deed's cooldown for this pair (0 = ready). */
export function cooldownLeft(s: GameState, id: DeedId, a: string, t: string): number {
  const until = s.deeds?.cd[cdKey(id, a, t)];
  return until !== undefined && until > s.week ? until - s.week : 0;
}

export function prune(s: GameState): void {
  const D = ensureDeeds(s);
  for (const [k, w] of Object.entries(D.cd)) if (w <= s.week) delete D.cd[k];
  if (D.log.length > LOG_CAP) D.log.splice(0, D.log.length - LOG_CAP);
  const alive = (id: string) => !!s.characters[id]?.alive;
  D.owed = D.owed.filter((o) => alive(o.by) && alive(o.to) && s.week - o.w < 104).slice(-OWED_CAP);
  D.hooks = D.hooks.filter((h) => alive(h.h) && alive(h.t)).slice(-HOOK_CAP);
  for (const k of Object.keys(D.ties)) {
    const [a, b] = k.split('|');
    if (!alive(a) || !alive(b)) delete D.ties[k];
  }
  for (const [id, [tutor]] of Object.entries(D.edu)) if (!alive(id) || !alive(tutor)) delete D.edu[id];
  for (const k of Object.keys(D.told)) if (s.week - D.told[k] > 52) delete D.told[k];
  for (const k of Object.keys(D.last)) if (!alive(k)) delete D.last[k];
}

/** Favors `by` owes `to`. */
export function owedBy(s: GameState, by: string, to: string): number {
  return (s.deeds?.owed ?? []).filter((o) => o.by === by && o.to === to).length;
}

export function npcHookOn(s: GameState, h: string, t: string) {
  return (s.deeds?.hooks ?? []).find((x) => x.h === h && x.t === t);
}
