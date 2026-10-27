import { ageOn } from './calendar';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { attr, viewAttrs } from './attrs';
import { askOdds, boundaryHit, knownEars } from './ears';
import type { ActionPreview } from './actions';
import type { Acceptance } from './interactions';
import type { Ctx } from './ledger';
import { addOpinion, changeMeter, opinion } from './relations';
import {
  AUTH_LEVEL, AUTH_TEXT, declaredHeir, donKnows, knownSessions, learn, members, nameOf, remember, seeBacking, theUb, ubAuthority,
} from './shadow';
import { ensureShadow, shadowView, type ShadowAction, type ShadowOp } from './shadowState';
import { councilReveal, retireDon, reunite, storyChoice } from './shadowStories';
import { ensureTribute } from './tributeState';
import { ubGoal } from './underboss';
import type { Effect, GameState, PlayerAction } from './types';

/**
 * The Don's orders about the succession (the verbs of the Succession
 * screen), routed through the power pillar as `{ kind: 'power', op: { op:
 * 'shadow', a } }` so they share its preview, chips, odds and queue. None of
 * them guarantees obedience: a test can offend, a plant can be caught, a
 * confrontation can be denied, a reward can be pocketed.
 */

const note = (text: string): Effect => ({ type: 'power', op: { op: 'shadow', o: { op: 'note', text } }, label: text });
const base = { effects: [] as Effect[], cost: 0, category: 'event' as const };

const PLANT_WEEKS = 26;
export const REWARD = 750;
export const TEST_COST = 0;

function testOdds(s: GameState, id: string): Acceptance {
  const c = s.characters[id];
  const x = viewAttrs(s, c).v;
  const reasons = [
    { label: 'Base', value: 55 },
    { label: 'His discretion', value: -Math.round((x.discretion - 50) / 2) },
    { label: 'What he thinks of you', value: Math.round(opinion(s, id, s.playerId) / 4) },
    { label: 'Paranoid: smells a test', value: hasTrait(c, 'Paranoid') ? -15 : 0 },
  ].filter((r) => r.value !== 0 || r.label === 'Base');
  return { chance: Math.max(0.1, Math.min(0.9, reasons.reduce((a, r) => a + r.value, 0) / 100)), reasons };
}

function plantManOdds(s: GameState, id: string): Acceptance {
  const ub = theUb(s);
  const c = s.characters[id];
  const reasons = [
    { label: 'Base', value: 50 },
    { label: `${nameOf(s, ub?.id)}'s eyes`, value: ub ? -Math.round((attr(s, ub, 'awareness') - 50) / 2) : 0 },
    { label: `What ${nameOf(s, ub?.id)} thinks of him`, value: ub ? Math.round(opinion(s, ub.id, id) / 3) : 0 },
    { label: 'His nerve', value: Math.round((attr(s, c, 'courage') - 50) / 4) },
  ].filter((r) => r.value !== 0 || r.label === 'Base');
  return { chance: Math.max(0.1, Math.min(0.9, reasons.reduce((a, r) => a + r.value, 0) / 100)), reasons };
}

export function previewShadow(s: GameState, a: ShadowAction): ActionPreview {
  const sh = shadowView(s);
  const boss = player(s);
  const ub = theUb(s);
  const c = 'charId' in a ? s.characters[a.charId] : undefined;
  switch (a.op) {
    case 'report':
      return { ...base, title: `Ask ${ub ? nameOf(s, ub.id) : 'the underboss'} for a full report`, detail: 'Every meeting, every decision. What he leaves out depends on what he wants.', effects: [note('He reports his meetings (as he chooses)')], because: 'asked the underboss for a full report', disabledReason: !ub ? 'There is no underboss' : s.week - (sh.cool.report ?? -99) < 4 ? 'You asked recently' : undefined };
    case 'authority': {
      const cur = ubAuthority(s);
      return { ...base, title: `Underboss authority: ${a.level}`, detail: AUTH_TEXT[a.level], effects: [note(`${cur} → ${a.level}`), ...(ub && AUTH_LEVEL[a.level] < AUTH_LEVEL[cur] ? [{ type: 'opinion', from: ub.id, to: boss.id, amount: -6, reason: 'Clipped my wings' } as Effect] : [])], because: `set the underboss's authority to ${a.level}`, disabledReason: !ub ? 'There is no underboss' : cur === a.level ? 'Already' : undefined };
    }
    case 'test':
      return { ...base, title: `Test ${c?.firstName ?? '?'}'s loyalty`, detail: 'A story planted with him alone. Where it goes tells you where he stands.', effects: [note('You learn whom he backs (confirmed)')], acceptance: c ? testOdds(s, c.id) : undefined, refuseEffects: c ? [{ type: 'opinion', from: c.id, to: boss.id, amount: -8, reason: 'The boss tested me like a rat', decay: 1 }] : undefined, because: `tested ${c?.firstName ?? 'a man'}`, disabledReason: !c?.alive || c.id === boss.id ? 'Not available' : sh.views[c.id]?.lvl === 'confirmed' && s.week - sh.views[c.id].w < 26 ? 'You know where he stands' : undefined };
    case 'meet':
      return { ...base, title: `Meet ${c?.firstName ?? '?'} privately`, detail: 'Coffee, no witnesses. He tells you what he wants — and what anyone has promised him, if he trusts you.', effects: [note('His plans and any promise he holds'), ...(c ? [{ type: 'opinion', from: c.id, to: boss.id, amount: 3, reason: 'The boss made time for me', decay: 1 } as Effect] : [])], because: `met ${c?.firstName ?? 'a man'} privately`, disabledReason: !c?.alive || c.id === boss.id ? 'Not available' : s.week - (sh.cool[`meet:${c.id}`] ?? -99) < 8 ? 'You met him recently' : undefined };
    case 'reward':
      return { ...base, title: `Reward ${c?.firstName ?? '?'} ($${REWARD})`, detail: 'An envelope for a man who stands with your heir.', cost: REWARD, effects: [{ type: 'money', amount: -REWARD }, ...(c ? [{ type: 'opinion', from: c.id, to: boss.id, amount: 8, reason: 'The boss looked after me', decay: 1 } as Effect] : []), note('He leans toward your heir')], because: `rewarded ${c?.firstName ?? 'a man'}`, disabledReason: !c?.alive || c.id === boss.id ? 'Not available' : s.money < REWARD ? 'Not enough money' : undefined };
    case 'plant': {
      if (a.kind === 'ear') {
        const ear = s.ears?.ears[a.id];
        const her = s.characters[a.id];
        const hit = ear && ub ? boundaryHit(s, ear, ub, 'close') : undefined;
        const acc = ear && ub ? askOdds(s, ear, ub, 'close', true) : undefined;
        return { ...base, title: `Ask ${her?.firstName ?? '?'} to get close to ${ub ? nameOf(s, ub.id) : 'the underboss'}`, detail: 'She hears what he says when he relaxes. She decides; she can say no. $600 for six months.', cost: 600, effects: [{ type: 'money', amount: -600 }, { type: 'ears', op: { op: 'paid', earId: a.id, amount: 600 } } as Effect, note(`Reports his meetings for ${PLANT_WEEKS} weeks`)], acceptance: acc, because: `asked ${her?.firstName ?? 'an Ear'} to listen near the underboss`, disabledReason: !ub ? 'There is no underboss' : !ear || ear.status === 'gone' || !her?.alive ? 'Not available' : hit ? 'One of her lines' : sh.plant && !sh.plant.blown && sh.plant.until >= s.week ? 'You already have someone there' : s.money < 600 ? 'Not enough money' : undefined };
      }
      const m = s.characters[a.id];
      return { ...base, title: `Put ${m?.firstName ?? '?'} at ${ub ? nameOf(s, ub.id) : 'the underboss'}'s table`, detail: 'Your man sits in on the meetings and tells you. If he is caught, the underboss will know you set him up.', effects: [note(`Reports the meetings for ${PLANT_WEEKS} weeks`), note('Caught: the underboss takes it personally')], acceptance: m ? plantManOdds(s, m.id) : undefined, because: `planted ${m?.firstName ?? 'a man'} in the underboss's court`, disabledReason: !ub ? 'There is no underboss' : !m?.alive || m.faction !== 'player' || m.id === ub.id ? 'Not available' : opinion(s, m.id, boss.id) < 20 ? 'He is not close enough to you to trust' : sh.plant && !sh.plant.blown && sh.plant.until >= s.week ? 'You already have someone there' : undefined };
    }
    case 'confront': {
      const known = knownSessions(s).filter((x) => x.ses.presiding === ub?.id).length;
      return { ...base, title: `Confront ${ub ? nameOf(s, ub.id) : 'the underboss'} about his court`, detail: 'Name the meetings you know about. What he admits depends on what he wants.', effects: [note('He admits, half-admits, or denies'), ...(ub ? [{ type: 'opinion', from: ub.id, to: boss.id, amount: -4, reason: 'Called me on the carpet', decay: 1 } as Effect] : [])], because: 'confronted the underboss about his court', disabledReason: !ub ? 'There is no underboss' : !known ? 'You know of no meeting to put to him' : s.week - (sh.cool.confront ?? -99) < 8 ? 'You confronted him recently' : undefined };
    }
    case 'council':
      return { ...base, title: 'Hold a family council on the succession', detail: 'Every capo at one table, the heir beside you. You see where they stand — or where they want you to think they stand.', cost: 400, effects: [{ type: 'money', amount: -400 }, note('Where every capo stands (rumor)'), note('Involvement up')], because: 'held a family council on the succession', disabledReason: s.week - (sh.council ?? -99) < 12 ? 'You held one recently' : s.money < 400 ? 'Not enough money' : undefined };
    case 'honor':
    case 'disown': {
      const p = sh.promises.find((x) => x.id === a.promiseId);
      const to = p ? s.characters[p.to] : undefined;
      const known = p && (p.maker === s.playerId || donKnows(s, p.id) !== 'unknown');
      return { ...base, title: `${a.op === 'honor' ? 'Honor' : 'Disown'} the promise to ${to?.firstName ?? '?'}`, detail: p ? `${nameOf(s, p.maker)} promised him ${p.role}.` : undefined, effects: to ? [{ type: 'opinion', from: to.id, to: boss.id, amount: a.op === 'honor' ? 10 : -10, reason: a.op === 'honor' ? 'The boss stood behind the promise' : 'The boss broke the promise', decay: 1 }] : [], because: `${a.op === 'honor' ? 'honored' : 'disowned'} a promise to ${to?.firstName ?? 'a man'}`, disabledReason: !p || !known ? 'Not a promise you know of' : p.status !== 'outstanding' && p.status !== 'disputed' ? 'Already settled' : !to?.alive ? 'He is gone' : undefined };
    }
    case 'retire': {
      const heir = declaredHeir(s);
      const label = a.mode === 'florida' ? 'Retire to Florida' : a.mode === 'consigliere' ? 'Step down and serve as consigliere' : 'Step down; stay on as the old Don';
      const det = a.mode === 'florida' ? 'Out of the life. Your heir takes the chair and you play on as him.' : a.mode === 'consigliere' ? 'Your heir takes the chair; you take the consigliere\'s seat. You play on as the heir.' : 'No title, every door still open. Your heir plays on; you may become the boss who would not retire.';
      return { ...base, title: label, detail: det, effects: [note(heir ? `${nameOf(s, heir.id)} takes the chair` : 'Nobody to take it'), note('Who backs whom decides how it goes')], warning: 'The chosen heir does not automatically keep the chair: the underboss and the capos decide how it goes.', because: `stepped down (${a.mode})`, disabledReason: !heir ? 'No heir: name one first' : s.power?.crisis ? 'Not in the middle of a crisis' : undefined };
    }
    case 'reunite': {
      const sp = sh.splinters.find((x) => x.id === a.splinterId);
      return { ...base, title: `Take ${nameOf(s, sp?.leaderId)}'s men back`, effects: [note('They rejoin the family')], because: 'took back the men who walked out', disabledReason: !sp || sp.back ? 'Nobody to take back' : !s.characters[sp.leaderId]?.alive ? 'He is gone' : undefined };
    }
  }
}

export function commitShadow(ctx: Ctx, a: ShadowAction): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const boss = player(s);
  const ub = theUb(s);
  switch (a.op) {
    case 'report': {
      sh.cool.report = s.week;
      if (!ub) break;
      const goal = ubGoal(s, ub);
      const mine = sh.sessions.filter((x) => x.presiding === ub.id && s.week - x.week <= 104);
      let n = 0;
      for (const ses of mine) {
        const hides = ses.auth === 'unauthorized' && goal !== 'serve' && !hasTrait(ub, 'Loyal-to-a-fault');
        if (hides) continue;
        if (learn(s, boss.id, ses.id, 'confirmed', `${nameOf(s, ub.id)}'s report`)) n++;
      }
      const hidden = mine.filter((x) => donKnows(s, x.id) === 'unknown').length;
      ctx.log.push(`${displayName(ub)} reported ${n} meeting${n === 1 ? '' : 's'} you had not heard about${hidden ? '. You have a feeling it was not all of them' : ''}.`);
      break;
    }
    case 'authority':
      ensureTribute(s).ub.authority = a.level === 'acting' ? 'operational' : a.level;
      if (a.level === 'acting') sh.actingUntil = s.week + 16;
      else sh.actingUntil = undefined;
      break;
    case 'test': {
      const c = s.characters[a.charId];
      const p = sh.plans[a.charId];
      if (c) seeBacking(s, c.id, p?.prefer, 'confirmed', 'your test', p?.goal);
      break;
    }
    case 'meet': {
      const c = s.characters[a.charId];
      sh.cool[`meet:${a.charId}`] = s.week;
      if (!c) break;
      const p = sh.plans[c.id];
      const trusts = opinion(s, c.id, boss.id) >= 10;
      // A man who trusts you says where he stands; one who doesn't tells you what you want to hear.
      seeBacking(s, c.id, trusts ? p?.prefer : declaredHeir(s)?.id, trusts ? 'confirmed' : 'rumor', `${c.firstName}, over coffee`, trusts ? p?.goal : 'support_heir');
      if (trusts) for (const pr of sh.promises.filter((x) => x.to === c.id && x.status === 'outstanding')) learn(s, boss.id, pr.id, 'confirmed', `${c.firstName}, over coffee`);
      break;
    }
    case 'reward': {
      const c = s.characters[a.charId];
      const h = declaredHeir(s);
      if (c && h && c.id !== h.id) addOpinion(s, c.id, h.id, 'The boss wants us close', 6, 1);
      break;
    }
    case 'plant':
      sh.plant = { kind: a.kind, id: a.id, since: s.week, until: s.week + PLANT_WEEKS, reports: 0 };
      remember(s, a.id, `Was asked to listen at ${nameOf(s, ub?.id)}'s table for the Don.`);
      break;
    case 'confront': {
      sh.cool.confront = s.week;
      if (!ub) break;
      const goal = ubGoal(s, ub);
      if (goal === 'serve' || hasTrait(ub, 'Loyal-to-a-fault')) {
        for (const ses of sh.sessions.filter((x) => x.presiding === ub.id)) learn(s, boss.id, ses.id, 'confirmed', `${nameOf(s, ub.id)}, to your face`);
        for (const p of sh.promises.filter((x) => x.maker === ub.id && x.status === 'outstanding')) learn(s, boss.id, p.id, 'confirmed', `${nameOf(s, ub.id)}, to your face`);
        ctx.log.push(`${displayName(ub)} told you everything, and asked what you wanted done about it.`);
      } else if (goal === 'become_boss') {
        changeMeter(s, ub.id, boss.id, 'grievance', 10);
        ctx.log.push(`${displayName(ub)} denied it, looking you in the eye. He will remember being asked.`);
        remember(s, ub.id, 'The Don confronted him about his meetings. He denied everything.');
      } else {
        const one = sh.sessions.filter((x) => x.presiding === ub.id && donKnows(s, x.id) === 'unknown').slice(-1);
        for (const ses of one) learn(s, boss.id, ses.id, 'confirmed', `${nameOf(s, ub.id)}, half the truth`);
        ctx.log.push(`${displayName(ub)} admitted to what you knew, and one thing more. Not all of it.`);
      }
      break;
    }
    case 'council': {
      const n = councilReveal(s, 'the family council');
      s.flags.pwr_court = s.week;
      ctx.log.push(`The family council: ${n} men at one table. You watched where they looked.`);
      break;
    }
    case 'honor':
    case 'disown': {
      const p = sh.promises.find((x) => x.id === a.promiseId);
      if (!p) break;
      p.settled = s.week;
      p.status = a.op === 'honor' ? 'fulfilled' : 'broken';
      if (a.op === 'disown') {
        sh.stats.broken++;
        changeMeter(s, p.to, boss.id, 'grievance', 12);
      } else {
        const to = s.characters[p.to];
        if (to?.rank === 'associate') to.rank = 'soldier';
        else if (to?.rank === 'soldier' && /crew|button/.test(p.role)) to.rank = 'capo';
      }
      remember(s, p.to, `The Don ${a.op === 'honor' ? 'honored' : 'broke'} the promise of ${p.role}.`);
      break;
    }
    case 'retire':
      retireDon(ctx, a.mode);
      break;
    case 'reunite':
      reunite(ctx, a.splinterId);
      break;
  }
}

export function describeShadowOp(s: GameState, o: ShadowOp): string | undefined {
  switch (o.op) {
    case 'note': return o.text;
    case 'learn': return 'You learn something';
    case 'learnAll': return 'You learn what was hidden';
    case 'story': return undefined;
  }
  void s;
}

export function applyShadowOp(ctx: Ctx, o: ShadowOp): void {
  const s = ctx.s;
  switch (o.op) {
    case 'story': storyChoice(ctx, o.id, o.choice); break;
    case 'learn': learn(s, s.playerId, o.recId, o.lvl, o.via); break;
    case 'learnAll': {
      const sh = ensureShadow(s);
      let n = 0;
      for (const x of [...sh.sessions].reverse()) { if (n >= o.max) break; if (learn(s, s.playerId, x.id, 'confirmed', o.via)) n++; }
      break;
    }
    default: break;
  }
}

/** Orders for the headless player (a rotating handful, some disabled). */
export function shadowActions(s: GameState): PlayerAction[] {
  const w = s.week;
  const ms = members(s);
  const m = ms.length ? ms[w % ms.length] : undefined;
  const out: ShadowAction[] = [{ op: 'report' }, { op: 'council' }, { op: 'confront' }, { op: 'authority', level: (['routine', 'operational', 'executive'] as const)[w % 3] }];
  if (m) out.push({ op: 'test', charId: m.id }, { op: 'meet', charId: m.id }, { op: 'reward', charId: m.id });
  const soldier = crew(s).find((c) => c.rank === 'soldier' && isFree(s, c));
  if (soldier) out.push({ op: 'plant', kind: 'man', id: soldier.id });
  const ear = knownEars(s)[0];
  if (ear) out.push({ op: 'plant', kind: 'ear', id: ear.id });
  const sh = shadowView(s);
  const pr = sh.promises.find((p) => p.status === 'outstanding' && donKnows(s, p.id) !== 'unknown');
  if (pr) out.push({ op: w % 2 ? 'honor' : 'disown', promiseId: pr.id });
  const boss = player(s);
  if (ageOn(boss.birth, s.date) >= 70 && w % 13 === 0) out.push({ op: 'retire', mode: (['florida', 'consigliere', 'emeritus'] as const)[w % 3] });
  return out.filter((_, i) => (i + w) % 5 === 0).map((a) => ({ kind: 'power', op: { op: 'shadow', a } }));
}
