import type { ActionPreview } from './actions';
import { capos, crew, displayName, isFree } from './characters';
import { holder } from './council';
import { keeper, keeperSkill } from './ledgerbook';
import type { Ctx } from './ledger';
import { addOpinion, changeMeter } from './relations';
import { rand } from './rng';
import { xfer } from './tribute';
import { moneyGrievance, settleMoneyGrievance } from './tributeGrievance';
import { ensureTribute, normSplit, noteFavor, REASON_LABEL, splitText, type ShortReason, type Split } from './tributeState';
import type { GameState, PlayerAction } from './types';

/**
 * The weekly take's orders (Weekly Take screens) and effect ops (story events).
 * Every money movement goes through `xfer` (journal + ledger).
 */

export type Pocket = 'personal' | 'treasury' | 'reserve';

/** What the Don decided in the audience (PlayerChoices.envelope). */
export interface EnvelopeChoice {
  /** The report this split is for (defaults to the pending one). */
  report?: string;
  split?: Split;
  /** Make it the standing policy too. */
  standing?: boolean;
  /** Petition ids granted. */
  grant?: string[];
}

export type TributeAction =
  | { op: 'policy'; split?: Split; auto?: boolean }
  | { op: 'move'; from: Pocket; to: Pocket; amount: number }
  | { op: 'audit'; capoId?: string }
  | { op: 'auditUb' }
  | { op: 'terms'; charId: string; kind: 'fixed' | 'exempt' | 'extension' | 'standard'; weeks: number; amount?: number }
  | { op: 'forgive'; charId: string }
  | { op: 'ubRate'; bp: number }
  | { op: 'allowance'; charId: string; weekly: number };

export type TributeOp =
  | TributeAction
  | { op: 'note'; text: string }
  | { op: 'demand'; charId: string }
  | { op: 'refund'; charId: string; amount: number; from?: Pocket }
  | { op: 'pay'; charId: string; amount: number; from: Pocket; why: string }
  | { op: 'dispute'; id: string; ruling: 'upheld' | 'denied' | 'split' | 'council' }
  | { op: 'base'; amount: number; clear?: boolean }
  | { op: 'stage'; stage: number }
  | { op: 'reveal'; charId: string; chance: number }
  | { op: 'invest'; id: string; ruling: 'writeoff' | 'payback' }
  | { op: 'ubPayback' }
  | { op: 'grievance'; charId: string; why: string; severity: number }
  | { op: 'settle'; charId: string; how: string };

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function pocketBalance(s: GameState, p: Pocket): number {
  if (p === 'treasury') return Math.round(s.money);
  return s.tribute?.acct[p] ?? 0;
}

const op = (o: TributeOp) => ({ type: 'tribute' as const, op: o });

export function previewTribute(s: GameState, a: TributeAction): ActionPreview {
  const none = (title: string, why: string): ActionPreview => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' });
  const t = s.tribute;
  switch (a.op) {
    case 'policy': {
      const sp = a.split ? normSplit(a.split) : undefined;
      const title = sp ? `Standing split: ${splitText(sp)}` : a.auto ? 'Let quiet weeks go by the standing split' : 'Hold the audience every week';
      return { title, detail: sp ? 'On a quiet week the envelope is split this way without a meeting.' : a.auto ? 'The underboss only asks to see you when something needs you.' : 'He brings the envelope to you every Monday, whatever the week.', effects: [op(a)], cost: 0, because: title.toLowerCase(), category: 'event' };
    }
    case 'move': {
      const have = pocketBalance(s, a.from);
      const title = `Move ${$(a.amount)}: ${a.from} → ${a.to}`;
      return {
        title, detail: a.from === 'personal' ? 'Your own money back into the family. The men notice a boss who does that.' : a.to === 'personal' ? 'Out of the family into your pocket.' : 'Between the family\'s accounts.',
        effects: [op(a)], cost: a.from === 'treasury' ? a.amount : 0, because: `moved ${$(a.amount)} from ${a.from} to ${a.to}`, category: 'event',
        disabledReason: a.from === a.to ? 'Same account' : !(a.amount > 0) ? 'Nothing to move' : have < a.amount ? `Only ${$(Math.max(0, have))} there` : undefined,
      };
    }
    case 'audit': {
      const k = a.capoId ? s.characters[a.capoId] : undefined;
      const kp = keeper(s);
      return {
        title: k ? `Go through ${k.firstName} ${k.lastName}'s crew books` : 'Go through every crew\'s books',
        detail: `${kp ? `${kp.firstName} ${kp.lastName}` : 'You yourself'} checks the last four weeks against what the men said. Finds the truth about shortfalls (${Math.round(Math.min(0.95, 0.45 + keeperSkill(s) * 0.3) * 100)}% each) and maybe a capo's skim. The capos resent being counted.`,
        effects: [{ type: 'money', amount: -(a.capoId ? 200 : 500), label: 'An accountant\'s week' }, op(a)], cost: a.capoId ? 200 : 500,
        because: k ? `had ${k.firstName}'s crew books gone through` : 'had every crew\'s books gone through', category: 'cost',
        disabledReason: !t ? 'No books yet' : a.capoId && (!k || k.rank !== 'capo') ? 'Not a capo' : undefined,
      };
    }
    case 'auditUb': {
      const ub = holder(s, 'underboss');
      return { title: 'Have the underboss\'s count checked', detail: 'Quietly, by somebody he does not know. If he has been taking more than his share, it shows. If he finds out, he will not forget it.', effects: [{ type: 'money', amount: -400, label: 'A quiet accountant' }, op(a)], cost: 400, because: 'had the underboss\'s count checked', category: 'cost', disabledReason: !ub ? 'No underboss' : undefined };
    }
    case 'terms': {
      const c = s.characters[a.charId];
      if (!c || c.faction !== 'player') return none('Terms', 'Not one of yours');
      const what = a.kind === 'standard' ? 'back to his usual terms' : a.kind === 'fixed' ? `a flat ${$(a.amount ?? 0)} a week for ${a.weeks} weeks` : a.kind === 'exempt' ? `exempt for ${a.weeks} weeks` : `${a.weeks} more weeks to pay what he owes`;
      return { title: `${c.firstName} ${c.lastName}: ${what}`, effects: [op(a), { type: 'opinion', from: c.id, to: s.playerId, amount: a.kind === 'standard' ? -3 : 6, reason: a.kind === 'standard' ? 'Took my arrangement away' : 'The boss gave me a break', decay: 1 }], cost: 0, because: `put ${c.firstName} on ${what}`, category: 'event' };
    }
    case 'forgive': {
      const c = s.characters[a.charId];
      const owed = t?.arrears[a.charId] ?? 0;
      return { title: `Forgive ${c?.firstName ?? '?'}'s arrears (${$(owed)})`, effects: [op(a), { type: 'opinion', from: a.charId, to: s.playerId, amount: 10, reason: 'Forgave what I owed', decay: 1 }], cost: 0, because: `forgave ${c?.firstName ?? 'a man'} what he owed`, category: 'event', disabledReason: owed <= 0 ? 'He owes nothing' : undefined };
    }
    case 'ubRate': {
      const ub = holder(s, 'underboss');
      const cur = t?.ub.rateBp ?? 1000;
      return {
        title: `The underboss's share: ${a.bp / 100}%`, detail: 'His authorized end of everything the crews send up (his pay).',
        effects: [op(a), ...(ub ? [{ type: 'opinion' as const, from: ub.id, to: s.playerId, amount: a.bp > cur ? 12 : -15, reason: a.bp > cur ? 'Raised my end' : 'Cut my end', decay: 1 }] : [])],
        cost: 0, because: `set the underboss's share at ${a.bp / 100}%`, category: 'event', disabledReason: a.bp === cur ? 'That is his share now' : a.bp < 500 || a.bp > 2000 ? 'Out of range' : undefined,
      };
    }
    case 'allowance': {
      const c = s.characters[a.charId];
      return { title: `${c?.firstName ?? '?'}: ${a.weekly ? `${$(a.weekly)} a week from your own money` : 'no allowance'}`, effects: [op(a), ...(c && a.weekly ? [{ type: 'opinion' as const, from: c.id, to: s.playerId, amount: 10, reason: 'Gave me an allowance', decay: 1 }] : [])], cost: 0, because: `set ${c?.firstName ?? 'his'} allowance`, category: 'event', disabledReason: !c?.alive ? 'Not available' : undefined };
    }
  }
}

export function describeTributeOp(s: GameState, o: TributeOp): string | undefined {
  switch (o.op) {
    case 'note': return o.text;
    case 'policy': return o.split ? `Standing split: ${splitText(normSplit(o.split))}` : o.auto ? 'Quiet weeks by the standing split' : 'The audience every week';
    case 'move': return `${$(o.amount)}: ${o.from} → ${o.to}`;
    case 'audit': return 'The books are gone through';
    case 'auditUb': return 'His count is checked';
    case 'terms': return `New terms for ${s.characters[o.charId]?.firstName ?? '?'}`;
    case 'forgive': return `${s.characters[o.charId]?.firstName ?? '?'}'s arrears forgiven`;
    case 'ubRate': return `Underboss's share ${o.bp / 100}%`;
    case 'allowance': return `${s.characters[o.charId]?.firstName ?? '?'}: ${o.weekly ? `${$(o.weekly)}/wk allowance` : 'no allowance'}`;
    case 'demand': return `${s.characters[o.charId]?.firstName ?? '?'} pays what he owes, now`;
    case 'refund': return `${$(o.amount)} back to ${s.characters[o.charId]?.firstName ?? '?'}`;
    case 'pay': return `${$(o.amount)} to ${s.characters[o.charId]?.firstName ?? '?'} (${o.from})`;
    case 'dispute': return o.ruling === 'upheld' ? 'His number is corrected' : o.ruling === 'split' ? 'Split the difference' : o.ruling === 'council' ? 'The capos hear it' : 'His number stands';
    case 'base': return o.clear ? 'The capos bring the envelope to you again' : `The underboss's standing ${o.amount > 0 ? '+' : ''}${o.amount}`;
    case 'stage': return undefined;
    case 'reveal': return `You find out the truth (${Math.round(o.chance * 100)}%)`;
    case 'invest': return o.ruling === 'payback' ? 'He pays back half' : 'Written off';
    case 'ubPayback': return 'He pays back what he took';
    case 'grievance': return `${s.characters[o.charId]?.firstName ?? '?'} will remember this (a grievance)`;
    case 'settle': return `${s.characters[o.charId]?.firstName ?? '?'}'s grievance over his end is settled`;
  }
}

/** Audit: the truth about recent shortfalls comes out; a skimming capo may be caught. */
function audit(ctx: Ctx, capoId?: string): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  t.stats.audits++;
  const odds = Math.min(0.95, 0.45 + keeperSkill(s) * 0.3);
  const recent = t.reports.slice(-4);
  const found: string[] = [];
  for (const r of recent) for (const cl of r.crews) {
    if (capoId && cl.capoId !== capoId) continue;
    for (const m of cl.members) {
      if (!m.truth || m.revealed) continue;
      if (rand(t) < odds) {
        m.revealed = true;
        m.believed = m.truth;
        if (m.truth !== m.said) {
          found.push(m.id);
          const c = s.characters[m.id];
          if (c?.alive) {
            addOpinion(s, s.playerId, c.id, 'Lied about his envelope', -10, 1);
            if (m.truth === 'lying') {
              t.why[m.id] = 'mistake'; // caught: he pays it back
              t.stats.caught++;
            }
          }
        }
      }
    }
  }
  const ks = capoId ? [s.characters[capoId]].filter(Boolean) : capos(s);
  for (const k of ks) {
    if (!k) continue;
    if ((k.skimmed ?? 0) > 200 && rand(t) < odds * 0.7) {
      const back = Math.round(Math.min(k.wealth, (k.skimmed ?? 0) * 0.5));
      xfer(ctx, `wealth:${k.id}`, 'treasury', back, 'arrears', `w${s.week}:auditback:${k.id}`, { label: `The audit: ${k.firstName} ${k.lastName} pays back part of his skim`, category: 'kickup', who: k.id });
      k.skimmed = 0;
      addOpinion(s, k.id, s.playerId, 'Had my books gone through', -8, 1);
      changeMeter(s, k.id, s.playerId, 'fear', 10);
      t.stats.caught++;
      ctx.log.push(`The audit found ${k.firstName} ${k.lastName} skimming. He paid back ${$(back)}.`);
    } else addOpinion(s, k.id, s.playerId, 'Had my books gone through', -3, 1);
  }
  ctx.log.push(found.length ? `The audit: ${found.length} m${found.length > 1 ? 'en' : 'an'}'s stor${found.length > 1 ? 'ies' : 'y'} did not hold up.` : 'The audit: the men\'s stories hold up.');
}

export function applyTributeOp(ctx: Ctx, o: TributeOp, label: string): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const k = `w${s.week}:op:${o.op}:${t.journal.length}`;
  switch (o.op) {
    case 'note':
    case 'stage':
      if (o.op === 'stage') {
        t.ub.stage = o.stage;
        if (o.stage === 5) t.ub.refused = s.week;
      }
      break;
    case 'policy':
      if (o.split) t.policy = { ...normSplit(o.split), auto: t.policy.auto };
      if (o.auto !== undefined) t.policy.auto = o.auto;
      break;
    case 'move': {
      const from = o.from === 'treasury' ? 'treasury' : o.from;
      const to = o.to === 'treasury' ? 'treasury' : o.to;
      if (from === to) break;
      xfer(ctx, from, to, Math.min(o.amount, Math.max(0, pocketBalance(s, o.from))), 'transfer', k, { label: `${label}`, category: 'transfer', note: label });
      if (o.from === 'personal' && o.to !== 'personal') {
        for (const c of capos(s)) addOpinion(s, c.id, s.playerId, 'Put his own money into the family', 2, 1);
        t.putIn = [...t.putIn, s.week].slice(-6);
      }
      break;
    }
    case 'audit':
      audit(ctx, o.capoId);
      break;
    case 'auditUb': {
      const ub = holder(s, 'underboss');
      if (!ub) break;
      const took = t.reports.slice(-8).filter((r) => r.ubId === ub.id).reduce((a, r) => a + r.ubSkim, 0);
      if (took > 0 && rand(t) < 0.8) {
        t.beats.push({ kind: 'ub_caught', week: s.week, who: ub.id, amount: took, pri: 85 });
        ctx.log.push(`The quiet accountant found ${$(took)} missing from the underboss's count in eight weeks.`);
      } else ctx.log.push('The underboss\'s count checks out.');
      if (rand(t) < 0.3) addOpinion(s, ub.id, s.playerId, 'Had my count checked behind my back', -12, 1);
      break;
    }
    case 'terms':
      if (o.kind !== 'standard') noteFavor(s, { byId: s.playerId, toId: o.charId, kind: o.kind === 'extension' ? 'extension' : 'contract', amount: o.amount ?? 0, authority: 'don', truth: describeTributeOp(s, o) ?? o.kind });
      if (o.kind === 'standard') delete t.terms[o.charId];
      else t.terms[o.charId] = { kind: o.kind, amount: o.amount, until: s.week + o.weeks, why: label };
      t.agHist = [...t.agHist, { week: s.week, id: `agr:member:${o.charId}`, text: describeTributeOp(s, o) ?? '' }].slice(-40);
      break;
    case 'forgive': {
      const owed = t.arrears[o.charId] ?? 0;
      if (owed > 0) {
        noteFavor(s, { byId: s.playerId, toId: o.charId, kind: 'forgive', amount: owed, authority: 'don', truth: 'forgave what he owed' });
        delete t.arrears[o.charId];
        delete t.why[o.charId];
        t.forgiven += owed;
      }
      const c = s.characters[o.charId];
      if (c?.arrears) c.arrears = 0;
      break;
    }
    case 'demand': {
      const c = s.characters[o.charId];
      const owed = (t.arrears[o.charId] ?? 0) + (c?.arrears ?? 0);
      if (!c || owed <= 0) break;
      const got = xfer(ctx, `wealth:${c.id}`, 'treasury', owed, 'arrears', k, { label: `${label}: ${c.firstName} pays what he owed`, category: 'kickup', who: c.id });
      let left = got;
      const a1 = Math.min(left, t.arrears[o.charId] ?? 0);
      if (a1) { t.arrears[o.charId] -= a1; left -= a1; if (!t.arrears[o.charId]) delete t.arrears[o.charId]; }
      if (c.arrears) c.arrears = Math.max(0, c.arrears - left);
      changeMeter(s, c.id, s.playerId, 'fear', 8);
      break;
    }
    case 'refund':
    case 'pay': {
      const c = s.characters[o.charId];
      if (!c) break;
      const from = (o.from ?? 'treasury') as Pocket;
      noteFavor(s, { byId: s.playerId, toId: c.id, kind: o.op === 'refund' ? 'refund' : 'assistance', amount: o.amount, authority: 'don', truth: o.op === 'pay' ? o.why : 'money back' });
      xfer(ctx, from, `wealth:${c.id}`, Math.min(o.amount, Math.max(0, pocketBalance(s, from))), 'assistance', k, { label: `${label}: ${$(o.amount)} to ${c.firstName}`, category: 'event', who: c.id, note: o.op === 'pay' ? o.why : 'refund' });
      break;
    }
    case 'dispute': {
      const d = t.disputes.find((x) => x.id === o.id);
      if (!d || d.status !== 'open') break;
      d.status = o.ruling;
      const c = s.characters[d.capoId];
      if (!c) break;
      if (o.ruling === 'upheld' || o.ruling === 'split') {
        const amt = o.ruling === 'upheld' ? d.amount : Math.round(d.amount / 2);
        xfer(ctx, 'treasury', `wealth:${c.id}`, amt, 'assistance', `w${s.week}:disp:${d.id}`, { label: `${label}: ${$(amt)} back to ${c.firstName}`, category: 'event', who: c.id });
        if (o.ruling === 'upheld' && !d.valid) for (const x of capos(s)) if (x.id !== c.id) addOpinion(s, x.id, s.playerId, 'Pays anybody who complains', -2, 1);
      }
      if (o.ruling === 'denied') {
        if (d.valid) {
          changeMeter(s, c.id, s.playerId, 'grievance', 15);
          t.beats.push({ kind: 'grievance', week: s.week, who: c.id, amount: d.amount, ref: d.id, pri: 55 });
          t.stats.grievances++;
          moneyGrievance(s, c.id, 'the boss denied an honest dispute', 35);
        }
      }
      if (o.ruling === 'council') {
        for (const x of capos(s)) if (x.id !== c.id) addOpinion(s, x.id, c.id, d.valid ? 'His books were honest' : 'Cried poor at the table', d.valid ? 5 : -8, 1);
        addOpinion(s, c.id, s.playerId, d.valid ? 'Let the table clear my name' : 'Shamed me in front of the table', d.valid ? 8 : -12, 1);
      }
      break;
    }
    case 'base':
      if (o.clear) {
        t.ub.callsFirst = [];
        t.ub.base = Math.max(0, t.ub.base - 40);
      } else t.ub.base = Math.max(0, Math.min(100, t.ub.base + o.amount));
      break;
    case 'reveal': {
      const r = t.reports.slice(-6);
      for (const rep of r) for (const cl of rep.crews) for (const m of cl.members) {
        if (m.id !== o.charId || !m.truth || m.revealed) continue;
        if (rand(t) < o.chance) {
          m.revealed = true;
          m.believed = m.truth;
          ctx.log.push(`${s.characters[m.id]?.firstName ?? 'He'} comes clean: ${REASON_LABEL[m.truth as ShortReason]}.`);
        }
      }
      break;
    }
    case 'ubRate':
      t.ub.rateBp = Math.max(500, Math.min(2000, o.bp));
      break;
    case 'allowance':
      if (o.weekly > 0) t.allowances[o.charId] = o.weekly;
      else delete t.allowances[o.charId];
      break;
    case 'invest': {
      const inv = t.investments.find((x) => x.id === o.id);
      if (!inv) break;
      if (o.ruling === 'payback') {
        const c = s.characters[inv.byId];
        if (c) xfer(ctx, `wealth:${c.id}`, 'reserve', Math.round(inv.amount / 2), 'arrears', k, { note: `${c.firstName} pays back half of the failed investment` });
      }
      break;
    }
    case 'settle':
      settleMoneyGrievance(s, o.charId, o.how);
      break;
    case 'grievance':
      moneyGrievance(s, o.charId, o.why, o.severity);
      t.stats.grievances++;
      break;
    case 'ubPayback': {
      const ub = holder(s, 'underboss');
      if (!ub) break;
      const took = t.reports.slice(-8).filter((r) => r.ubId === ub.id).reduce((a, r) => a + r.ubSkim, 0);
      xfer(ctx, `wealth:${ub.id}`, 'treasury', took, 'arrears', k, { label: `${label}: the underboss pays back what he took`, category: 'kickup', who: ub.id });
      for (const r of t.reports) if (r.ubId === ub.id) r.ubSkim = 0;
      break;
    }
  }
}

/** Orders the random player may give (sim). */
export function tributeActions(s: GameState): PlayerAction[] {
  const t = s.tribute;
  if (!t) return [];
  const out: PlayerAction[] = [];
  const w = s.week;
  const owing = Object.keys(t.arrears).filter((id) => s.characters[id]?.alive);
  if (owing.length) out.push({ kind: 'tribute', op: w % 2 ? { op: 'forgive', charId: owing[w % owing.length] } : { op: 'terms', charId: owing[w % owing.length], kind: 'extension', weeks: 4 } });
  const ks = capos(s).filter((c) => isFree(s, c));
  if (ks.length && w % 13 === 5) out.push({ kind: 'tribute', op: { op: 'audit', capoId: ks[w % ks.length].id } });
  if (w % 26 === 11 && holder(s, 'underboss')) out.push({ kind: 'tribute', op: { op: 'auditUb' } });
  const men = crew(s).filter((c) => c.rank === 'associate' && isFree(s, c));
  if (men.length && w % 17 === 3) out.push({ kind: 'tribute', op: { op: 'terms', charId: men[w % men.length].id, kind: 'fixed', weeks: 12, amount: 15 } });
  return out;
}

export { displayName };
