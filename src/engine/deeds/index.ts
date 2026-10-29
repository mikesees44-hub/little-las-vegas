import { isFree } from '../characters';
import { ageOn } from '../calendar';
import { applyEffects } from '../effects';
import type { Ctx } from '../ledger';
import { addOpinion } from '../relations';
import type { Attributes, Effect } from '../types';
import { cash } from './catalog';
import { clashWeek } from './clash';
import { npcWeek } from './npc';
import { d01, ensureDeeds, prune } from './state';

export * from './types';
export { ensureDeeds, tieOf, tiesOf, cooldownLeft, owedBy, pairKey } from './state';
export { DEEDS, DEED_ORDER, type DeedDef, type DX } from './catalog';
export { acceptance, rawSum, type Acceptance, type Reason } from './accept';
export { deedPreview, deedsFor, doDeed, tierOdds, tierOf, oddsWord, type DeedPreview, type TierView } from './resolve';
export { weigh, bestMove, circleOf, npcWeek, type Weighed } from './npc';
export { clashWeek, clashReasons, tieFor, relationsWeb, CLASH_RULES } from './clash';
export { deedsEventSource, buildAsk } from './asks';
export { TRAIT_WEIGHTS, leanWords, axesOf, vecScore, traitTerms } from './weights';

/**
 * THE DEEDS' WEEK (after the minds think, before the capos and rivals act):
 *  1. bookkeeping (cooldowns, the dead);
 *  2. the NPCs' own deeds (npc.ts), on each other and on the boss;
 *  3. once a month, the clashes (clash.ts): natures rub, ties form;
 *  4. partnerships pay, loans fall due, children learn.
 * Its dice are its own. Returns the lines worth telling.
 */
export function deedsWeek(ctx: Ctx): string[] {
  const s = ctx.s;
  if (s.gameOver || !s.minds) return [];
  const D = ensureDeeds(s);
  prune(s);
  const lines = [...npcWeek(ctx), ...clashWeek(ctx)];
  const P = s.playerId;
  // Partnerships: a monthly share for a year; one in twenty months the venture goes bust.
  for (const p of [...D.pt]) {
    const age = s.week - p.w;
    const a = s.characters[p.a];
    const b = s.characters[p.b];
    if (age > 52 || !a?.alive || !b?.alive) { D.pt = D.pt.filter((x) => x !== p); continue; }
    if (age === 0 || age % 4 !== 0) continue;
    if (d01(D) < 0.05) {
      D.pt = D.pt.filter((x) => x !== p);
      lines.push(`The venture between ${a.firstName} and ${b.firstName} went bust.`);
      continue;
    }
    applyEffects(ctx, [cash(s, a, p.n, 'family'), cash(s, b, p.n, 'family')], { label: `Partnership: ${a.firstName} & ${b.firstName}`, because: 'went partners', category: 'business' });
  }
  // Loans fall due: paid back with interest if he has it; if not, it is remembered.
  for (const l of [...D.ln]) {
    if (s.week < l.due) continue;
    D.ln = D.ln.filter((x) => x !== l);
    const by = s.characters[l.by];
    const to = s.characters[l.to];
    if (!by?.alive || !to?.alive) continue;
    const can = to.id === P ? s.money >= l.amt : to.wealth >= l.amt;
    if (can) {
      const fx: Effect[] = [cash(s, to, -l.amt, 'family'), cash(s, by, l.amt, 'family')];
      applyEffects(ctx, fx, { label: `${to.firstName} paid back the loan`, because: 'lent money', category: 'debt' });
    } else {
      addOpinion(s, by.id, to.id, 'Welshed on my loan', -15, 1);
      if (by.id === P) lines.push(`${to.firstName} ${to.lastName} could not pay back what you lent. He knows you know.`);
      D.owed.push({ by: to.id, to: by.id, w: s.week, y: 'Welshed on a loan' });
    }
  }
  // Education: a point a month in the tutor's best subject; at sixteen, the child is done.
  if (s.week % 4 === 0) {
    for (const [cid, [tid, focus]] of Object.entries(D.edu)) {
      const c = s.characters[cid];
      const tu = s.characters[tid];
      if (!c?.alive || !tu?.alive) { delete D.edu[cid]; continue; }
      const k = focus as keyof Attributes;
      if (k in c.attributes && c.attributes[k] < Math.min(80, tu.attributes[k] ?? 60)) c.attributes[k] += 1;
      if (ageOn(c.birth, s.date) >= 16) {
        delete D.edu[cid];
        const pass = tu.traits.filter((t) => !c.traits.includes(t) && t !== 'Cowardly');
        if (pass.length && d01(D) < 0.35 && c.traits.length < 3) {
          const t = pass[Math.floor(d01(D) * pass.length)];
          c.traits.push(t);
          lines.push(`${c.firstName} grew up at ${tu.firstName}'s elbow, and it shows: ${t.toLowerCase()}, like his teacher.`);
        }
        if (isFree(s, tu)) addOpinion(s, cid, tid, 'Taught me what I know', 15, 1);
      }
    }
  }
  return lines;
}
