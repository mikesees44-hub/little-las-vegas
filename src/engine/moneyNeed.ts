import { previewAction } from './actions';
import { eaters, hungerOf, openJobs } from './eat';
import { debtsOf } from './myMen';
import type { Character, GameState, PlayerAction } from './types';

/**
 * WHO NEEDS MONEY (owner, 2026-11-05: "any crew member or associate we bring on, we know they need money;
 * if they're running low or can't earn, we should try and increase it, and it should be an easy option").
 *
 * For every man of the family (and his associates): how he's doing for money, why, and the one best way
 * to help, already picked: put him on work when he can't earn (the consigliere's job pick), cover a debt
 * that's sinking him, pay his family's bills, give him a bigger end, or slip him a bonus. Each fix is an
 * ordinary My Men or Let them eat order, so its cost, hours and cooldown are the ones those already have.
 */
export type MoneyLevel = 'broke' | 'tight' | 'ok' | 'flush';

export interface MoneyNeed {
  c: Character;
  level: MoneyLevel;
  why: string[];
  fix?: { action: PlayerAction; label: string; cost: number };
}

const LEVEL_WORD: Record<MoneyLevel, string> = { broke: 'Broke', tight: 'Running low', ok: 'Getting by', flush: 'Doing well' };
export const moneyWord = (l: MoneyLevel) => LEVEL_WORD[l];

export function moneyNeedOf(s: GameState, c: Character, jobs = openJobs(s)): MoneyNeed {
  const d = debtsOf(s, c);
  const h = hungerOf(s, c);
  const cash = Math.round(c.wealth ?? 0);
  const why: string[] = [];
  const cantEarn = h.word === 'starving' || h.word === 'hungry' || h.word === 'idle';
  if (cash < 150) why.push(`down to ${cash < 0 ? 'nothing' : `$${cash}`}`);
  if (d.shylock) why.push(`owes a rival's shylock $${d.shylock}`);
  else if (d.total > 300) why.push(`owes $${d.total}`);
  if (cantEarn) why.push(h.why[0] ? `can't earn: ${h.why[0]}` : "can't earn");
  const level: MoneyLevel = (cash < 150 && (cantEarn || d.total > 300)) || d.shylock > 0 ? 'broke'
    : cash < 400 || d.total > 300 || cantEarn ? 'tight'
      : cash > 3000 ? 'flush' : 'ok';
  if (level === 'ok' || level === 'flush') return { c, level, why };
  // The best help first, the first one that can be done now.
  const tries: { action: PlayerAction; label: string }[] = [];
  if (d.shylock || d.total > 300) tries.push({ action: { kind: 'mymen', op: { op: 'debt', id: c.id } }, label: 'Cover his debt' });
  if (cantEarn) {
    const job = jobs.flatMap((j) => j.picks.filter((p) => p.id === c.id).map((p) => ({ j, p }))).sort((a, b) => b.p.fit.score - a.p.fit.score)[0];
    if (job) tries.push({ action: job.p.action, label: `Put him to work: ${job.j.title}` });
    tries.push({ action: { kind: 'mymen', op: { op: 'noshow', id: c.id } }, label: 'A no-show job' });
  }
  if (c.household?.wife || (c.household?.kids?.length ?? 0) > 0) tries.push({ action: { kind: 'mymen', op: { op: 'bills', id: c.id } }, label: "Pay his family's bills" });
  if (c.rank !== 'associate') tries.push({ action: { kind: 'mymen', op: { op: 'raise', id: c.id } }, label: 'A bigger end' });
  tries.push({ action: { kind: 'mymen', op: { op: 'bonus', id: c.id, amount: level === 'broke' ? 500 : 250 } }, label: `Slip him $${level === 'broke' ? 500 : 250}` });
  for (const t of tries) {
    let pv;
    try { pv = previewAction(s, t.action); } catch { continue; }
    if (!pv.disabledReason) return { c, level, why, fix: { ...t, cost: pv.cost ?? 0 } };
  }
  return { c, level, why };
}

/** Every man short of money, the broke ones first. */
export function whoNeedsMoney(s: GameState): MoneyNeed[] {
  const jobs = openJobs(s);
  return eaters(s).map((c) => moneyNeedOf(s, c, jobs)).filter((n) => n.level === 'broke' || n.level === 'tight')
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'broke' ? -1 : 1) || a.c.lastName.localeCompare(b.c.lastName));
}
