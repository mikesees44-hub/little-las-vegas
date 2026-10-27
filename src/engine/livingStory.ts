import { factById, factSeen, seenText, type Seen } from './livingKnow';
import type { LivingState, StoryK, Tf, Ts } from './livingState';
import type { GameState } from './types';

/**
 * ONGOING STORIES (B14). A story is a chain of facts that really happened,
 * linked cause to consequence: "Sal borrowed to buy the bar -> a bad
 * September -> a missed payment -> his friend went to the capo -> the capo
 * brought it to you". Nothing is written for the story; it only collects the
 * facts the people made, and it ends when the people end it (paid off, the
 * shop sold, a wedding, a reconciliation). The boss sees a story only through
 * the facts he knows; the links he does not know show as gaps.
 */

export function openStory(s: GameState, L: LivingState, k: StoryK, title: string, cast: string[], fids: (string | undefined)[]): Ts {
  const st: Ts = { id: `ts${L.next++}`, k, title, cast: [...new Set(cast.filter(Boolean))], f: [], open: true, w0: s.week };
  L.stories.push(st);
  for (const id of fids) if (id) link(L, st, id);
  return st;
}

export function storyById(L: LivingState, id: string | undefined): Ts | undefined {
  return id ? L.stories.find((x) => x.id === id) : undefined;
}

/** Add a fact to a story (it becomes the story's latest beat). */
export function link(L: LivingState, st: Ts | undefined, fid: string | undefined): void {
  if (!st || !fid || st.f.includes(fid)) return;
  st.f.push(fid);
  const f = factById(L, fid);
  if (f) {
    f.st ??= st.id;
    for (const a of f.a) if (!st.cast.includes(a) && st.cast.length < 8) st.cast.push(a);
  }
}

/** The open story of a kind about a person (the one his new trouble continues). */
export function openStoryOf(L: LivingState, k: StoryK | StoryK[], who: string): Ts | undefined {
  const ks = Array.isArray(k) ? k : [k];
  for (let i = L.stories.length - 1; i >= 0; i--) {
    const st = L.stories[i];
    if (st.open && ks.includes(st.k) && st.cast.includes(who)) return st;
  }
  return undefined;
}

export function closeStory(s: GameState, st: Ts | undefined, end: string): void {
  if (!st || !st.open) return;
  st.open = false;
  st.w1 = s.week;
  st.end = end;
}

/** Old closed stories go; open ones stay (a debt is never forgotten because it is old). */
export function pruneStories(s: GameState, L: LivingState): void {
  L.stories = L.stories.filter((st) => st.open || s.week - (st.w1 ?? st.w0) < 104);
  if (L.stories.length > 300) {
    const closed = L.stories.filter((st) => !st.open);
    const drop = new Set(closed.slice(0, L.stories.length - 300).map((x) => x.id));
    L.stories = L.stories.filter((st) => !drop.has(st.id));
  }
}

/* ------------------------------------------------------------------ */
/* The boss's view of a story                                          */
/* ------------------------------------------------------------------ */

export interface StoryBeat { id: string; w: number; text: string; seen: Seen }
export interface StoryView {
  id: string;
  k: StoryK;
  title: string;
  open: boolean;
  /** Beats the boss knows, in order. */
  beats: StoryBeat[];
  /** Beats he does not know (only the count: never what they are). */
  gaps: number;
  cast: string[];
  /** A request to the boss came of it. */
  asked?: { w: number; via: string; ans?: string };
  /** The ending, if it is over and he knows how. */
  end?: string;
  last: number;
}

export function storyView(s: GameState, st: Ts): StoryView | undefined {
  const L = s.living!;
  const beats: StoryBeat[] = [];
  let gaps = 0;
  for (const id of st.f) {
    const f = factById(L, id);
    if (!f) continue;
    const seen = factSeen(s, f);
    if (seen) beats.push({ id: f.id, w: f.w, text: seenText(f, seen), seen });
    else gaps++;
  }
  if (!beats.length) return undefined;
  const lastKnown = beats[beats.length - 1];
  const endKnown = !st.open && st.f.length && beats.some((b) => b.id === st.f[st.f.length - 1]);
  return {
    id: st.id, k: st.k, title: st.title, open: st.open, beats, gaps, cast: st.cast,
    ...(st.ask ? { asked: { w: st.ask.w, via: st.ask.via, ...(st.ask.ans ? { ans: st.ask.ans } : {}) } } : {}),
    ...(endKnown && st.end ? { end: st.end } : {}),
    last: lastKnown.w,
  };
}

/** Stories the boss knows something of, the most recently moving first. */
export function knownStories(s: GameState, limit = 30): StoryView[] {
  const L = s.living;
  if (!L) return [];
  const out: StoryView[] = [];
  for (let i = L.stories.length - 1; i >= 0; i--) {
    const v = storyView(s, L.stories[i]);
    if (v) out.push(v);
  }
  return out.sort((a, b) => Number(b.open) - Number(a.open) || b.last - a.last).slice(0, limit);
}

/** The backstory of a request: the known beats, as the capo tells it. */
export function backstory(s: GameState, st: Ts): string[] {
  const v = storyView(s, st);
  return v ? v.beats.map((b) => (b.seen.lvl === 'rumor' ? `(word is) ${b.text}` : b.text)) : [];
}

export function factsOf(L: LivingState, st: Ts): Tf[] {
  return st.f.map((id) => factById(L, id)).filter((f): f is Tf => !!f);
}
