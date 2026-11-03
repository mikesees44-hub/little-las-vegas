import { crew, hasTrait } from '../characters';
import type { Ctx } from '../ledger';
import { believe, earsOf } from '../minds/beliefs';
import { remember } from '../minds/memory';
import { mindOf } from '../minds/state';
import { addOpinion, changeMeter } from '../relations';
import type { GameState } from '../types';
import { voiceOf } from './read';
import { clamp, g01 } from './state';
import { HEAR_CAP, HEAR_PER_ARG, type ArgEnd, type Argument, type ArgueState, type Hearsay } from './types';

/**
 * WITNESSES. Only the men in the room remember it first-hand (what they saw,
 * coloured by where they stood). Everybody else hears it later, a week or
 * more, from someone who was there or from the man himself, and the story
 * grows in the telling: it goes through the minds' memories and beliefs.
 */

const fn = (s: GameState, id: string) => s.characters[id]?.firstName ?? 'somebody';

const SAW: Record<ArgEnd, string> = {
  reconciled: 'saw {T} and the boss have it out, and make it up',
  truce: 'saw the boss and {T} go at it; nobody won',
  walkout: 'saw {T} walk out on the boss',
  split: 'saw {T} break with the boss in front of everybody',
  plot: 'saw {T} take it from the boss and smile',
};

/** First-hand: the room remembers, each man his own way. */
export function firstHand(s: GameState, A: Argument): void {
  const B = s.playerId;
  const T = fn(s, A.t);
  const end = A.end ?? 'truce';
  const threatened = A.log.some((l) => l.r === 'threaten' && l.ok === 1);
  for (const id of A.room) {
    const c = s.characters[id];
    if (!c?.alive) continue;
    const m = mindOf(s, id);
    const voice = voiceOf(s, A, id);
    const spoke = A.spoke.includes(id);
    const text = SAW[end].replace('{T}', T);
    // What he makes of the boss, from where he stood.
    let vb = end === 'reconciled' ? 4 : end === 'split' ? -4 : end === 'walkout' ? -2 : end === 'plot' ? 2 : 0;
    if (voice === 'loyalist') vb = Math.max(vb, 3);
    if (voice === 'hothead') vb = -8;
    if (m) {
      remember(m, { w: s.week, k: 'talk', who: A.t, t: text, v: end === 'split' || end === 'walkout' ? -3 : 2 });
      if (vb) remember(m, { w: s.week, k: vb > 0 ? 'favor' : 'slight', who: B, t: text, v: vb });
      // The man taking notes: who looked weak in there.
      if (voice === 'opportunist') {
        const weak = A.used.includes('apologize') && (end === 'walkout' || end === 'split') ? B : end === 'plot' || threatened ? A.t : undefined;
        if (weak) believe(s, m, { k: 'weak', by: weak, c: 0.6, src: 'saw', tr: true });
      }
    }
    if (voice === 'hothead' && spoke) addOpinion(s, id, B, `Went after my friend ${T}`, -6, 1);
    if (voice === 'loyalist' && spoke) addOpinion(s, A.t, id, 'Took the boss\'s side against me', -5, 1);
    if (voice === 'peacemaker' && spoke) addOpinion(s, A.t, id, 'Calmed things down for me', 4, 1);
    if (threatened) changeMeter(s, id, B, 'fear', 2);
  }
}

/** Who might hear it: the men with minds and the crew, minus the room and the man himself. */
function earPool(s: GameState): string[] {
  const ids = new Set<string>(Object.keys(s.minds?.minds ?? {}));
  for (const c of crew(s)) ids.add(c.id);
  ids.delete(s.playerId);
  return [...ids].sort();
}

/** Schedule what the others hear (a week or more later, maybe bigger than it was). */
export function scheduleHearsay(s: GameState, G: ArgueState, A: Argument): number {
  const end = A.end ?? 'truce';
  const T = fn(s, A.t);
  const pool = earPool(s);
  const out: Hearsay[] = [];
  const told = new Set<string>([s.playerId, A.t, ...A.room]);
  const tellers = [A.t, ...A.room];
  for (const teller of tellers) {
    const tc = s.characters[teller];
    if (!tc?.alive) continue;
    const ears = earsOf(s, teller, pool).filter((x) => !told.has(x));
    for (let i = 0; i < 2 && ears.length && out.length < HEAR_PER_ARG; i++) {
      const who = ears.splice(Math.floor(g01(G) * ears.length), 1)[0];
      told.add(who);
      const loose = hasTrait(tc, 'Drinker') || hasTrait(tc, 'Charming') ? 0.55 : hasTrait(tc, 'Honest') ? 0.15 : 0.35;
      const big = g01(G) < loose;
      const due = s.week + 1 + Math.floor(g01(G) * 3);
      if (teller === A.t) {
        // His side of it: the boss shamed him.
        const v = -Math.round(clamp(A.hurt / 8, 3, 12) * (big ? 1.5 : 1));
        out.push({ who, of: s.playerId, teller, arg: A.id, due, v, t: big ? `heard from ${T} that the boss tore into him like a dog in front of everybody` : `heard from ${T} that the boss went at him`, ...(big ? { big: 1 } : {}) });
      } else {
        const base: Record<ArgEnd, [number, string, string]> = {
          reconciled: [2, `heard ${T} and the boss had words and made it up`, `heard ${T} and the boss nearly came to blows, then hugged it out`],
          truce: [-1, `heard ${T} and the boss had words`, `heard ${T} and the boss were shouting so loud the bartender left`],
          walkout: [-4, `heard ${T} walked out on the boss`, `heard ${T} told the boss where to go and walked out`],
          split: [-6, `heard ${T} broke with the boss in front of the capos`, `heard ${T} called the boss out in front of the whole club and dared him to do something`],
          plot: [2, `heard ${T} took a dressing-down and said thank you`, `heard ${T} got cut down to size and never said a word`],
        };
        const [v, small, bigT] = base[end];
        const f: Hearsay['f'] = end === 'split' && big ? 'plot' : end === 'plot' && big ? 'weak' : undefined;
        out.push({ who, of: A.t, teller, arg: A.id, due, v: Math.round(v * (big ? 1.5 : 1)), t: big ? bigT : small, ...(big ? { big: 1 } : {}), ...(f ? { f } : {}) });
      }
    }
  }
  G.hear.push(...out);
  if (G.hear.length > HEAR_CAP) G.hear.splice(0, G.hear.length - HEAR_CAP);
  return out.length;
}

/** The week's hearsay arrives: memories and beliefs for the men with minds, a small opinion for the rest. */
export function deliverHearsay(ctx: Ctx, G: ArgueState): number {
  const s = ctx.s;
  let n = 0;
  const keep: Hearsay[] = [];
  for (const h of G.hear) {
    if (h.due > s.week) { keep.push(h); continue; }
    const c = s.characters[h.who];
    const of = s.characters[h.of];
    if (!c?.alive || !of?.alive) continue;
    const m = mindOf(s, h.who);
    if (m) {
      remember(m, { w: s.week, k: 'talk', who: h.of, t: h.t, v: h.v });
      if (h.f) believe(s, m, { k: h.f, by: h.of, c: 0.4, src: 'rumor', from: h.teller, tr: false });
    } else if (Math.abs(h.v) >= 3) {
      addOpinion(s, h.who, h.of, h.of === s.playerId ? 'What they say about the boss' : `What they say about ${of.firstName}`, Math.round(h.v / 2), 2);
    }
    n++;
  }
  G.hear = keep;
  G.stats.heard += n;
  return n;
}
