import { ageOn } from './calendar';
import { capos, crew, hasTrait, isFree, player } from './characters';
import { holder } from './council';
import { director } from './storyDirector';
import { heat, type Ctx } from './ledger';
import { addOpinion, changeMeter, opinion } from './relations';
import { rand } from './rng';
import { allocate, latestReport, pendingReport, prepareReport, ubType, xfer } from './tribute';
import { AUDIENCE_ID } from './tributeEvents';
import { ensureTribute, noteFavor, normSplit, splitText, type TributeReport } from './tributeState';
import { purseWeek } from './crewPurse';
import { closeUbRecord, ubGoal } from './underboss';
import { moneyGrievance } from './tributeGrievance';
import { attr } from './attrs';
import type { EventInstance, Faction, PlayerChoices } from './types';

/**
 * The weekly take's place in the week (engine.ts):
 *  - tributeBegin: Monday — the envelope the Don was shown is split as he chose;
 *  - (the economy collects the crews: tribute.ts collectTake);
 *  - tributeWeek: the report is prepared; the underboss's standing, the Don's
 *    greed or thrift, the household and the heir react; story beats are queued;
 *  - tributeEnd: after the week's popups are chosen — a quiet week's envelope
 *    goes by the standing policy; one that needs the Don waits for Monday.
 */

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function tributeBegin(ctx: Ctx, resolving: readonly EventInstance[], choices: PlayerChoices): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const env = choices.envelope;
  const pend = pendingReport(s);
  if (pend) {
    const ev = resolving.find((e) => e.defId === AUDIENCE_ID && e.meta?.report === pend.id);
    const cid = ev ? (choices.choices?.[ev.iid] ?? ev.defaultChoiceId) : 'policy';
    let split = normSplit(t.policy);
    let by: 'policy' | 'his' | 'custom' = 'policy';
    if (env?.split && (!env.report || env.report === pend.id) && (cid === 'custom' || !ev || env.report === pend.id)) {
      split = normSplit(env.split);
      by = 'custom';
    } else if (cid === 'his') {
      split = normSplit(pend.rec);
      by = 'his';
    }
    allocate(ctx, pend, split, by, env?.grant ?? []);
    t.held.push(s.week);
    if (t.held.length > 20) t.held.shift();
    t.stats.audiences++;
    t.ub.absent = 0;
    reactToSplit(ctx, pend, split, by);
    if (env?.standing) t.policy = { ...split, auto: t.policy.auto };
    const a = pend.alloc!;
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The underboss brought the envelope (${$(pend.presented)}): ${$(a.personal)} to you, ${$(a.treasury)} to the family, ${$(a.reserve)} to the reserve.`, kind: 'decision' });
  } else if (env?.standing && env.split) t.policy = { ...normSplit(env.split), auto: t.policy.auto };
}

/** The underboss and the capos read the Don's split. */
function reactToSplit(ctx: Ctx, rep: TributeReport, split: ReturnType<typeof normSplit>, by: string): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const ub = rep.ubId ? s.characters[rep.ubId] : undefined;
  if (!ub?.alive || rep.acting) return;
  const gap = split.personal - rep.rec.personal;
  if (by === 'his') {
    addOpinion(s, ub.id, s.playerId, 'The boss took my advice on the envelope', 2, 1);
    t.ub.disagreements = Math.max(0, t.ub.disagreements - 1);
    return;
  }
  if (Math.abs(gap) >= 2000 && (rep.ubType === 'loyal' || rep.ubType === 'ambitious')) {
    t.ub.disagreements++;
    t.stats.disagreements++;
    if (rep.ubType === 'loyal' && gap > 0) addOpinion(s, ub.id, s.playerId, 'Takes too much and won\'t hear about it', -2, 1);
    if (rep.ubType === 'ambitious' && gap < 0) t.ub.base = Math.min(100, t.ub.base + 1);
    if (t.ub.disagreements >= 3 && t.ub.disagreements % 3 === 0) t.beats.push({ kind: 'disagree', week: s.week, who: ub.id, pri: 58 });
    if (t.ub.disagreements >= 6 && opinion(s, ub.id, s.playerId) < -15) t.beats.push({ kind: 'resign', week: s.week, who: ub.id, pri: 70 });
  }
}

/** Mid-week, after the crews are counted. */
export function tributeWeek(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const rep = latestReport(s);
  // Disputes: a capo who had a genuinely bad week, or a greedy one with a tight contract, says the number is wrong.
  if (rep && rep.week === s.week && !rep.talk.length) {
    for (const cl of rep.crews) {
      const k = s.characters[cl.capoId];
      if (!k || cl.due <= 120 || t.disputes.some((d) => d.capoId === k.id && d.status === 'open')) continue;
      const genuine = (cl.v ?? 1) < 0.85;
      const greedy = hasTrait(k, 'Greedy') && (k.keep ?? 0.3) < 0.3;
      if ((genuine || greedy) && rand(t) < (genuine ? 0.3 : 0.12)) {
        const amount = Math.round((cl.due * (0.1 + rand(t) * 0.15)) / 10) * 10;
        const claims = genuine
          ? ['The boardwalk was rained out three days; you assessed me on a normal week.', 'Half my corner was boarded up for the fire inspector. The number is a summer number.', 'Two of my guys were in the hospital. You counted them like they were working.']
          : ['My district is not what it was. Your number is from two years ago.', 'Everybody knows the Crest is dead in the middle of the week. Count it right.', 'The other capos keep more than me for less work.'];
        const d = { id: `d${s.week}${k.id}`, week: s.week, capoId: k.id, amount, claim: claims[Math.floor(rand(t) * claims.length)], valid: genuine, status: 'open' as const };
        t.disputes.push(d);
        t.stats.disputes++;
        cl.disputed = true;
        t.beats.push({ kind: 'dispute', week: s.week, who: k.id, ref: d.id, amount, pri: 60 });
      }
    }
    if (t.disputes.length > 30) t.disputes = t.disputes.slice(-30);
    // A man short 3 times in 8 weeks becomes his capo's problem, and the Don's.
    for (const cl of rep.crews) for (const m of cl.members) {
      if (!m.truth || m.id === cl.capoId) continue;
      // Holding back over his end, twice: a grievance with a life of its own.
      if (m.truth === 'grievance' && (t.shortHist[m.id] ?? []).filter((w) => s.week - w < 12).length >= 2) {
        const c = s.characters[m.id];
        changeMeter(s, m.id, s.playerId, 'grievance', 8);
        t.stats.grievances++;
        t.beats.push({ kind: 'grievance', week: s.week, who: c.id, amount: t.arrears[m.id] ?? m.due - m.paid, pri: 57 });
        moneyGrievance(s, c.id, `held back $${(m.due - m.paid).toLocaleString('en-US')} over his end, again`, 30);
      }
      if ((t.shortHist[m.id] ?? []).filter((w) => s.week - w < 8).length >= 3) t.beats.push({ kind: 'short', week: s.week, who: cl.capoId, forId: m.id, amount: t.arrears[m.id] ?? 0, pri: 54 });
    }
    // The men's own money: what each one earned, kicked up and kept, and how he lives on it.
    purseWeek(ctx, rep);
    // A capo who has got rich wants a bigger end (an ambitious or greedy one, on a tight contract).
    for (const k of capos(s)) {
      if (!isFree(s, k) || k.wealth < 20000 || (k.keep ?? 0.3) >= 0.45) continue;
      if (!(hasTrait(k, 'Ambitious') || hasTrait(k, 'Greedy') || attr(s, k, 'ambition') >= 60)) continue;
      if (rand(t) < 0.08) t.beats.push({ kind: 'richcapo', week: s.week, who: k.id, amount: Math.round(k.wealth), pri: 53 });
    }
    prepareReport(ctx);
  }
  // Agreement history: a capo's contract changed.
  for (const k of capos(s)) {
    const keep = k.keep ?? 0.3;
    if (t.lastKeep[k.id] !== undefined && Math.abs(t.lastKeep[k.id] - keep) > 1e-9) t.agHist = [...t.agHist, { week: s.week, id: `agr:capo:${k.id}`, text: `${k.firstName} ${k.lastName}: keeps ${Math.round(keep * 100)}% (was ${Math.round(t.lastKeep[k.id] * 100)}%)` }].slice(-40);
    t.lastKeep[k.id] = keep;
  }
  underbossStanding(ctx);
  donsHabits(ctx);
  // Allowances out of the Don's own money.
  for (const [id, wk] of Object.entries(t.allowances)) {
    const c = s.characters[id];
    if (!c?.alive) {
      delete t.allowances[id];
      continue;
    }
    xfer(ctx, 'personal', `wealth:${id}`, wk, 'don_personal_share', `w${s.week}:allow:${id}`, { note: `${c.firstName}'s allowance` });
  }
  // A man who died owing the family: his widow disputes the claim.
  for (const [id, owed] of Object.entries(t.arrears)) {
    const c = s.characters[id];
    if (c && !c.alive) {
      delete t.arrears[id];
      delete t.why[id];
      const widow = c.spouseId ? s.characters[c.spouseId] : undefined;
      if (widow?.alive && owed >= 100) t.beats.push({ kind: 'widow', week: s.week, who: widow.id, forId: c.id, amount: owed, pri: 46 });
    }
  }
  // A capo who resents another's easy envelope.
  if (s.week % 9 === 4) {
    const ks = capos(s).filter((k) => isFree(s, k));
    for (const a of ks) for (const b of ks) {
      if (a.id === b.id || opinion(s, a.id, b.id) > -10) continue;
      t.beats.push({ kind: 'challenge', week: s.week, who: a.id, forId: b.id, pri: 52 });
      break;
    }
  }
  // The underboss's routine authority: he gives a man with arrears a few weeks on his own say-so.
  // A loyal man tells the Don; an ambitious one keeps it to himself (a favor the earners remember).
  const ubh = holder(s, 'underboss');
  if (ubh && rep && rep.week === s.week) {
    t.ub.authority ??= 'routine';
    const type = rep.ubType;
    const owing = Object.keys(t.arrears).filter((id) => s.characters[id]?.alive && s.characters[id].capoId && !t.terms[id]);
    if (owing.length && (type === 'loyal' || type === 'ambitious') && rand(t) < (type === 'ambitious' ? 0.2 : 0.08)) {
      const id = owing[Math.floor(rand(t) * owing.length)];
      const m = s.characters[id];
      t.terms[id] = { kind: 'extension', until: s.week + 4, why: `${ubh.firstName} gave him four weeks` };
      noteFavor(s, { byId: ubh.id, toId: m.capoId!, kind: 'extension', amount: t.arrears[id], authority: 'delegated', truth: `gave ${m.firstName} four more weeks on ${t.arrears[id]} owed`, knownBy: type === 'loyal' ? [s.playerId, id] : [id] });
      addOpinion(s, m.capoId!, ubh.id, 'Gave my man time', 3, 1);
      addOpinion(s, id, ubh.id, 'Gave me time', 5, 1);
      t.petitionsTo[ubh.id] = (t.petitionsTo[ubh.id] ?? 0) + 1;
      if (type === 'loyal') rep.issues.push({ kind: 'short', who: m.capoId, amount: t.arrears[id], severity: 1, text: `${ubh.firstName} gave ${m.firstName} ${m.lastName} four more weeks on what he owes. He's telling you so you know.` });
    }
  }
  // An underboss who cannot work.
  const ub = holder(s, 'underboss');
  if (ub && ub.health < 30) t.beats.push({ kind: 'ub_ill', week: s.week, who: ub.id, pri: 60 });
}

/** The underboss's standing among the earners: who calls him first, and where it leads. */
function underbossStanding(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const ub = holder(s, 'underboss');
  if (!ub) {
    if (t.ub.id) {
      const old = s.characters[t.ub.id];
      closeUbRecord(s, !old?.alive ? 'died' : !isFree(s, old) ? 'taken away' : 'left the seat');
      t.ub.id = undefined;
      t.ub.helped = {};
    }
    t.ub.base = Math.max(0, t.ub.base - 2);
    t.ub.callsFirst = [];
    if (t.ub.stage < 4) t.ub.stage = 0;
    return;
  }
  if (t.ub.id !== ub.id && t.ub.id) closeUbRecord(s, !s.characters[t.ub.id]?.alive ? 'died' : 'replaced');
  if (t.ub.id !== ub.id) ubGoal(s, ub);
  if (t.ub.id !== ub.id) t.ub = { base: 0, callsFirst: [], since: s.week, absent: 0, stage: 0, disagreements: 0, rateBp: t.ub.rateBp, id: ub.id };
  const type = ubType(s, ub, false);
  const heldNow = t.held[t.held.length - 1] === s.week;
  if (!heldNow) t.ub.absent++;
  let gain = 0.2 + (type === 'ambitious' ? 0.45 : 0) + (t.ub.absent >= 8 ? 0.25 : 0) + t.ub.callsFirst.length * 0.04 - (heldNow ? 0.35 : 0) - (type === 'loyal' ? 0.15 : 0);
  // Patronage: every favor he did the earners lately (his own say-so) adds to his standing.
  gain += t.favors.filter((f) => f.byId === ub.id && s.week - f.week < 8).length * 0.08;
  // A rich underboss can afford his own friends.
  if (ub.wealth >= 30000) gain += ub.wealth >= 80000 ? 0.15 : 0.08;
  if (hasTrait(ub, 'Loyal-to-a-fault')) gain = Math.min(gain, 0.05);
  t.ub.base = Math.max(0, Math.min(100, t.ub.base + gain));
  const ks = capos(s).filter((k) => isFree(s, k));
  t.ub.callsFirst = ks.filter((k) => t.ub.base >= 20 && opinion(s, k.id, ub.id) + t.ub.base / 3 > opinion(s, k.id, s.playerId) + 12).map((k) => k.id);
  const half = ks.length >= 2 && t.ub.callsFirst.length >= Math.ceil(ks.length / 2);
  if (t.ub.stage === 0 && t.ub.callsFirst.length >= 1 && t.ub.base >= 25) {
    t.ub.stage = 1;
    t.beats.push({ kind: 'base', week: s.week, who: ub.id, pri: 62 });
  } else if (t.ub.stage === 1 && half) {
    t.ub.stage = 2;
    t.beats.push({ kind: 'base', week: s.week, who: ub.id, pri: 64 });
  } else if (t.ub.stage === 2 && half && (type === 'ambitious' || (s.designatedHeirId && s.designatedHeirId !== ub.id) || t.ub.base >= 60)) {
    t.ub.stage = 3;
    t.stats.crises++;
    t.beats.push({ kind: 'crisis', week: s.week, who: ub.id, pri: 90 });
  }
  // Ignored: his people organise (the old faction machinery takes it from there).
  if (t.ub.stage === 5 && t.ub.refused !== undefined && s.week - t.ub.refused >= 3) {
    t.ub.stage = 4;
    const members = [ub.id, ...t.ub.callsFirst.filter((id) => s.characters[id]?.alive)];
    if (members.length >= 2 && !s.factions.some((f) => f.leaderId === ub.id)) {
      const f: Faction = { id: `f${s.nextId++}`, leaderId: ub.id, memberIds: members, demand: 'abdicate', agenda: 'abdicate', since: s.week, stage: 0, stageWeek: s.week, name: `${ub.firstName} ${ub.lastName}'s earners` };
      s.factions.push(f);
      ctx.log.push(`${ub.firstName} ${ub.lastName} and ${members.length - 1} capos have started meeting without you. They want you to step aside.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The underboss's earners formed a faction: they want the boss to step aside.`, kind: 'misc' });
    }
  }
  if (t.ub.stage === 4 && t.ub.base < 15) t.ub.stage = 0;
}

/** Greed and thrift have consequences through the people who see them. */
function donsHabits(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const boss = player(s);
  const n = t.greed.length;
  if (n < 6) return;
  const avg = t.greed.slice(-8).reduce((a, b) => a + b, 0) / Math.min(8, n);
  const cost = Math.max(1200, t.costAvg);
  const age = ageOn(boss.birth, s.date);
  if (avg >= 6000) {
    if (s.money < 4 * cost && s.week % 4 === 0) for (const k of capos(s)) addOpinion(s, k.id, boss.id, 'The boss bleeds the family while it runs short', -3, 1);
    t.beats.push({ kind: age >= 65 ? 'aging' : 'greed', week: s.week, pri: 56 });
  } else if (avg <= 1000) {
    const spending = t.reports.slice(-8).some((r) => r.alloc && r.alloc.personal > 0) && s.businesses.some((b) => b.owner === 'player' && (b.boughtWeek ?? 0) >= s.week - 12);
    if (age >= 58 && !spending) {
      t.ub.base = Math.min(100, t.ub.base + 0.3);
      t.beats.push({ kind: 'retire', week: s.week, pri: 48 });
    } else if (s.week % 4 === 0) for (const k of capos(s)) addOpinion(s, k.id, boss.id, 'The boss puts it back into the family', 2, 1);
  }
  // A fortune nobody can explain draws the IRS.
  if (t.acct.personal > 50000 && s.week % 6 === 0) heat(ctx, 'federal', 1, `Unexplained wealth: the boss's own cash (${$(t.acct.personal)})`, 'heat');
  // The household: the wife asks where it went (thin envelopes at home, or his money poured back into the family).
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife?.alive && (avg <= 800 || t.putIn.filter((w) => s.week - w < 6).length >= 2)) t.beats.push({ kind: 'wife', week: s.week, who: wife.id, pri: 50 });
  // The heir: an adult son who sees the envelope.
  const heir = s.designatedHeirId ? s.characters[s.designatedHeirId] : boss.childrenIds.map((id) => s.characters[id]).find((c) => c?.alive && c.gender === 'M' && ageOn(c.birth, s.date) >= 20);
  if (heir?.alive && heir.id !== boss.id && avg >= 2000 && !t.allowances[heir.id] && ageOn(heir.birth, s.date) >= 18) t.beats.push({ kind: 'heir', week: s.week, who: heir.id, pri: 49 });
}

/** After the week's popups: a quiet envelope goes by the standing policy now. */
export function tributeEnd(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const rep = latestReport(s);
  s.eventQueue = s.eventQueue.filter((e) => e.defId !== AUDIENCE_ID);
  if (rep && rep.status === 'ready') {
    const ev = s.pendingEvents.find((e) => e.defId === AUDIENCE_ID && e.meta?.report === rep.id);
    if (ev) {
      rep.status = 'presented';
      rep.iid = ev.iid;
    } else {
      allocate(ctx, rep, t.policy, 'quiet', []);
      t.stats.quiet++;
      const a = rep.alloc!;
      const ub = rep.ubId ? s.characters[rep.ubId] : undefined;
      const d = director(s);
      d.motion = [...(d.motion ?? []), [s.week, `${ub ? ub.firstName : 'The count'} brought the take (${$(rep.presented)}): ${$(a.personal)} to you, ${$(a.treasury)} to the family, ${$(a.reserve)} put aside (${splitText(a.split)}).`] as [number, string]].slice(-30);
    }
  }
  // The running average of the week's outgoings, for the underboss's advice.
  const out = ctx.lines.filter((l) => l.stat === 'money' && l.amount < 0 && (l.category === 'cost' || l.category === 'debt' || l.category === 'tribute')).reduce((a, l) => a - l.amount, 0);
  t.costAvg = Math.round(t.costAvg * 0.85 + out * 0.15);
}

export { crew };
