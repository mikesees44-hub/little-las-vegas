import { dynastyTableLean } from './familyHouses';
import { perkMod } from './lifestyle';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { applyEffects, fmtMoney } from './effects';
import { playerHook } from './interactions';
import type { Ctx } from './ledger';
import { opinion } from './relations';
import { chance, randInt } from './rng';
import { endWar } from './war';
import { FACTION_NAMES } from './world';
import type { Character, Choice, Dispute, DisputeKind, Effect, EventInstance, FactionId, GameState, RivalId } from './types';

/**
 * The Table: Philadelphia's South Jersey sit-down, chaired by Sal Moretti.
 * Members: Moretti, the Camden and Trenton capos, Carmine Manno for Atlantic
 * City — and you. A dispute is stated with both sides, members can be
 * lobbied beforehand (money, favors, hooks), you plead your case at the
 * hearing, the members who are not party to it vote, and the ruling is
 * enforced — comply, or defy Philadelphia.
 */

export const HEARING_DELAY = 2;

export function tableMembers(s: GameState): Character[] {
  const philly = s.rivals.find((r) => r.id === 'philly');
  const manno = s.rivals.find((r) => r.id === 'manno');
  const out: Character[] = [];
  if (philly && s.characters[philly.leaderId]?.alive) out.push(s.characters[philly.leaderId]);
  for (const c of Object.values(s.characters)) if (c.alive && c.faction === 'philly' && (c.office === 'Camden capo' || c.office === 'Trenton capo')) out.push(c);
  if (manno && s.characters[manno.leaderId]?.alive) out.push(s.characters[manno.leaderId]);
  return out;
}

export function chair(s: GameState): Character | undefined {
  return tableMembers(s)[0];
}

function partyLeader(s: GameState, f: FactionId): Character | undefined {
  if (f === 'player') return player(s);
  const r = s.rivals.find((x) => x.id === f);
  return r ? s.characters[r.leaderId] : undefined;
}

function opponent(d: Dispute): FactionId {
  return d.plaintiff === 'player' ? d.defendant : d.plaintiff;
}

/** Members who vote (not a party to the dispute). */
export function voters(s: GameState, d: Dispute): Character[] {
  return tableMembers(s).filter((m) => m.faction !== d.plaintiff && m.faction !== d.defendant);
}

function noise(d: Dispute, m: Character): number {
  let h = 2166136261;
  for (const ch of d.id + m.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h % 21) - 10;
}

export interface Lean {
  member: Character;
  value: number;
  reasons: { label: string; value: number }[];
}

/** How each voting member leans: positive means your side. */
export function forecast(s: GameState, d: Dispute): Lean[] {
  const boss = player(s);
  const opp = partyLeader(s, opponent(d));
  const oppR = s.rivals.find((r) => r.id === opponent(d));
  return voters(s, d).map((m) => {
    const reasons: { label: string; value: number }[] = [];
    reasons.push({ label: 'Thinks of you', value: Math.round(opinion(s, m.id, boss.id) * 0.6) });
    if (opp) reasons.push({ label: `Thinks of ${opp.firstName} ${opp.lastName}`, value: -Math.round(opinion(s, m.id, opp.id) * 0.6) });
    if (d.lobby[m.id]) reasons.push({ label: 'Your lobbying', value: d.lobby[m.id] });
    if (d.plea) reasons.push({ label: 'Your plea', value: d.plea });
    if (d.kind === 'district' && d.district && s.claims.some((c) => c.district === d.district && c.against === opponent(d))) reasons.push({ label: 'You hold a claim', value: 15 });
    if (oppR?.feud && d.plaintiff === 'player') reasons.push({ label: 'They have a blood feud with you', value: -5 });
    if (s.flags.brunoKnows) reasons.push({ label: 'You touched narcotics', value: m.faction === 'philly' ? -30 : -10 });
    if (m.faction === 'philly' && m.id === chair(s)?.id) reasons.push({ label: 'Family heat on you', value: -Math.round(s.heat.family / 4) });
    if (d.kind === 'sanction' && d.plaintiff !== 'player') reasons.push({ label: 'You killed a made man without asking', value: -20 });
    reasons.push(...dynastyTableLean(s, m));
    const pv = perkMod(s, 'vote');
    if (pv) reasons.push({ label: 'Your standing at the Table (perks)', value: pv });
    reasons.push({ label: 'His own reasons', value: noise(d, m) });
    return { member: m, value: reasons.reduce((a, r) => a + r.value, 0), reasons };
  });
}

/** Votes, with the chair breaking ties. */
export function tally(s: GameState, d: Dispute): { forPlayer: boolean; votes: Record<string, boolean> } {
  const leans = forecast(s, d);
  const votes: Record<string, boolean> = {};
  let yes = 0;
  for (const l of leans) {
    votes[l.member.id] = l.value > 0;
    if (l.value > 0) yes++;
  }
  const no = leans.length - yes;
  const c = chair(s);
  const tie = yes === no;
  return { forPlayer: tie ? (c ? (leans.find((l) => l.member.id === c.id)?.value ?? 0) > 0 : false) : yes > no, votes };
}

/* ---------------------------------------------------------------- */
/* Raising disputes                                                  */
/* ---------------------------------------------------------------- */

export function disputeText(s: GameState, kind: DisputeKind, plaintiff: FactionId, defendant: FactionId, opts: { district?: string; targetId?: string; amount?: number }): { claim: string; defense: string } {
  const P = plaintiff === 'player' ? `The house of ${s.houseName}` : FACTION_NAMES[plaintiff];
  const D = defendant === 'player' ? `the house of ${s.houseName}` : FACTION_NAMES[defendant];
  const dist = s.districts.find((x) => x.id === opts.district)?.name;
  const t = opts.targetId ? s.characters[opts.targetId] : undefined;
  switch (kind) {
    case 'district':
      return { claim: `${P} says ${dist} is theirs by right and ${D} has no business on those corners.`, defense: `${D[0].toUpperCase()}${D.slice(1)} says they earned every corner in ${dist} and owe nobody an apology.` };
    case 'sanction':
      return { claim: `${P} asks the Table's permission to kill ${t ? displayName(t) : 'a man'}.`, defense: `${D[0].toUpperCase()}${D.slice(1)} says ${t ? t.firstName : 'he'} is a made man under their protection.` };
    case 'reparations':
      return { claim: `${P} says ${D} hurt their people and wants ${fmtMoney(opts.amount ?? 0)} for it.`, defense: `${D[0].toUpperCase()}${D.slice(1)} says it was business, and business is not an insult.` };
    case 'peace':
      return { claim: `${P} asks the Table to end the war — on its terms.`, defense: `${D[0].toUpperCase()}${D.slice(1)} says the war is not finished.` };
    case 'war':
      return { claim: `${P} asks the Table's blessing to go to war with ${D}${dist ? ` over ${dist}` : ''}.`, defense: `${D[0].toUpperCase()}${D.slice(1)} says there is no cause, only greed.` };
  }
}

export function newDispute(s: GameState, kind: DisputeKind, plaintiff: FactionId, defendant: FactionId, opts: { district?: string; targetId?: string; amount?: number; warId?: string }): Omit<Dispute, 'id' | 'raisedWeek' | 'hearingWeek' | 'lobby' | 'plea'> {
  const txt = disputeText(s, kind, plaintiff, defendant, opts);
  return { kind, plaintiff, defendant, claim: txt.claim, defense: txt.defense, district: opts.district, targetId: opts.targetId, amount: opts.amount, warId: opts.warId };
}

export function openDispute(s: GameState, d: Omit<Dispute, 'id' | 'raisedWeek' | 'hearingWeek' | 'lobby' | 'plea'>): Dispute {
  const full: Dispute = { ...d, id: `dp${s.nextId++}`, raisedWeek: s.week, hearingWeek: s.week + HEARING_DELAY, lobby: {}, plea: 0 };
  s.disputes.push(full);
  return full;
}

/** Rivals bring disputes against you when they have a grievance. */
export function rivalDisputes(ctx: Ctx): void {
  const s = ctx.s;
  if (!chair(s)) return;
  const boss = player(s);
  for (const r of s.rivals) {
    if (r.kind !== 'mob' || !s.characters[r.leaderId]?.alive) continue;
    if (s.disputes.some((d) => !d.ruling && (d.plaintiff === r.id || d.defendant === r.id))) continue;
    const op = opinion(s, r.leaderId, boss.id);
    if (op > -25 || !chance(s, r.feud ? 0.08 : 0.025)) continue;
    let d: Dispute;
    // At most one sanction against your men a season, from anybody (playtest #3: up to 8 a year).
    const sanctionOk = s.week - (s.flags.lastSanctionVsPlayer ?? -99) >= SANCTION_COOLDOWN;
    if (r.feud && sanctionOk) {
      const capo = crew(s).filter((c) => c.rank === 'capo' && isFree(s, c))[0] ?? crew(s).filter((c) => isFree(s, c))[0];
      if (!capo) continue;
      d = openDispute(s, newDispute(s, 'sanction', r.id, 'player', { targetId: capo.id }));
      s.flags.lastSanctionVsPlayer = s.week;
    } else {
      const contested = s.districts.filter((x) => (x.influence.player ?? 0) > 0 && (x.influence[r.id] ?? 0) > 0).sort((a, b) => (b.influence[r.id] ?? 0) - (a.influence[r.id] ?? 0))[0];
      d = contested && chance(s, 0.6)
        ? openDispute(s, newDispute(s, 'district', r.id, 'player', { district: contested.id }))
        : openDispute(s, newDispute(s, 'reparations', r.id, 'player', { amount: randInt(s, 30, 80) * 100 }));
    }
    s.eventQueue.push(buildDisputeRaised(s, d));
    ctx.log.push(`${r.name} has brought a dispute against you to the Table. The hearing is in ${HEARING_DELAY} weeks.`);
  }
}

export function buildDisputeRaised(s: GameState, d: Dispute): EventInstance {
  const opp = partyLeader(s, d.plaintiff)!;
  const label = 'Dispute at the Table';
  const settle: Effect[] = d.kind === 'reparations'
    ? [{ type: 'money', amount: -(d.amount ?? 0), label: `${label}: settled privately` }]
    : d.kind === 'district' && d.district
      ? [{ type: 'influence', district: d.district, faction: 'player', amount: -6, label: `${label}: settled privately` }, { type: 'influence', district: d.district, faction: d.plaintiff, amount: 6, label: `${label}: settled privately` }]
      : [{ type: 'respect', amount: -4, label: `${label}: settled privately` }, { type: 'money', amount: -3000, label: `${label}: settled privately` }];
  const leans = forecast(s, d);
  const leanYes = leans.filter((l) => l.value > 0).length;
  return {
    iid: `ev${s.nextId++}`, defId: 'dispute_raised', week: s.week, mandatory: false, priority: 60,
    title: 'A dispute is brought to the Table',
    text: `${d.claim} ${d.defense} Sal Moretti will hear it in ${HEARING_DELAY} weeks. Today ${leanYes} of ${leans.length} votes lean your way${d.kind === 'sanction' && d.targetId ? `; lose, and they will ask for ${s.characters[d.targetId]?.firstName ?? 'him'} (or ${fmtMoney(bloodPrice(s, s.characters[d.targetId]))} in blood money)` : ''}. Until then, the members can be talked to.`,
    defaultChoiceId: 'answer', meta: { dispute: d.id }, actors: [opp.id, ...(chair(s) ? [chair(s)!.id] : [])],
    choices: [
      { id: 'answer', label: 'We will answer at the Table', detail: 'Lobby the members before the hearing (the Table tab).', because: `chose to answer ${FACTION_NAMES[d.plaintiff]} at the Table`, effects: [{ type: 'respect', amount: 1, label }] },
      { id: 'settle', label: 'Settle it privately', because: `settled with ${FACTION_NAMES[d.plaintiff]} privately`, effects: [...settle, { type: 'ruling', disputeId: d.id, comply: true, label: `${label}: settled privately` }] },
    ],
  };
}

/* ---------------------------------------------------------------- */
/* Hearings                                                          */
/* ---------------------------------------------------------------- */

export function tableWeek(ctx: Ctx): void {
  const s = ctx.s;
  s.disputes = s.disputes.filter((d) => !d.ruling || s.week - d.ruling.week < 26);
  for (const d of s.disputes) {
    if (d.ruling || d.hearingWeek > s.week + 1) continue;
    if (s.eventQueue.some((e) => e.meta?.dispute === d.id && e.defId === 'hearing') || s.pendingEvents.some((e) => e.meta?.dispute === d.id && e.defId === 'hearing')) continue;
    if (!chair(s) || !partyLeader(s, opponent(d))) {
      d.ruling = { forPlayer: true, votes: {}, week: s.week };
      continue;
    }
    s.eventQueue.push(buildHearing(s, d));
  }
  // A war that drags on is brought to the Table.
  for (const w of s.wars) {
    // Philadelphia's own war is not the Table's to end: Sal is the chair (army.ts).
    if (w.rival === 'philly') continue;
    if (s.week - w.startWeek >= 10 && !s.disputes.some((d) => d.warId === w.id && !d.ruling)) {
      openDispute(s, newDispute(s, 'peace', 'player', w.rival, { warId: w.id, district: w.district }));
      ctx.log.push(`Philadelphia has had enough of the war with ${FACTION_NAMES[w.rival]}. The Table will rule on it in ${HEARING_DELAY} weeks.`);
    }
  }
}

export interface Plea {
  id: string;
  label: string;
  detail: string;
  bonus: number;
  extra?: Effect[];
}

export function pleas(s: GameState, d: Dispute): Plea[] {
  const boss = player(s);
  const c = chair(s);
  const opp = partyLeader(s, opponent(d));
  const out: Plea[] = [];
  out.push({ id: 'envelopes', label: 'Remind them every envelope came on time', detail: `Leans on what ${c?.firstName ?? 'the chair'} thinks of you.`, bonus: Math.max(-10, Math.round((c ? opinion(s, c.id, boss.id) : 0) / 2.5)) });
  if (opp && playerHook(s, opp.id)?.strong) out.push({ id: 'proof', label: `Show them what ${opp.firstName} plotted`, detail: 'You hold proof. It will hurt him in that room.', bonus: 30 });
  const oppR = s.rivals.find((r) => r.id === opponent(d));
  out.push({ id: 'tradition', label: 'Appeal to tradition', detail: 'The old rules: respect, sanction, no junk.', bonus: 8 + (oppR?.feud ? 0 : 0) + (hasTrait(boss, 'Pious') ? 6 : 0) + (s.flags.brunoKnows ? -15 : 0) + (oppR && (s.flags[`grievance_${oppR.id}`] ?? 0) > 0 ? 12 : 0) });
  out.push({ id: 'threaten', label: 'Let them see your strength', detail: 'Respect counts in that room — and so does arrogance.', bonus: Math.round((s.respect - 50) / 2), extra: [{ type: 'heat', bar: 'family', amount: 4, label: 'Threatened the Table' }] });
  out.push({ id: 'concede', label: 'Offer a concession ($3,000 to the Table)', detail: 'Money on the table for the old man\'s charities.', bonus: 18, extra: [{ type: 'money', amount: -3000, label: 'Concession to the Table' }] });
  return out;
}

export function buildHearing(s: GameState, d: Dispute): EventInstance {
  const c = chair(s)!;
  const opp = partyLeader(s, opponent(d))!;
  const label = 'The Table';
  const leans = forecast(s, d);
  const likely = leans.filter((l) => l.value > 0).length;
  const choices: Choice[] = pleas(s, d).map((p) => ({
    id: p.id,
    label: p.label,
    detail: p.detail,
    because: `pleaded before the Table: ${p.label.toLowerCase()}`,
    effects: [...(p.extra ?? []), { type: 'plea', disputeId: d.id, amount: p.bonus, label: `${label}: ${p.bonus >= 0 ? '+' : '−'}${Math.abs(p.bonus)} to every vote` }],
  }));
  return {
    iid: `ev${s.nextId++}`, defId: 'hearing', week: s.week, mandatory: true, priority: 86,
    title: 'The Table sits',
    text: `A private room above a Ninth Street restaurant. ${displayName(c)} at the head. ${d.claim} ${d.defense} Before your plea, ${likely} of ${leans.length} votes lean your way.`,
    defaultChoiceId: 'envelopes', meta: { dispute: d.id }, actors: [c.id, opp.id],
    choices,
  };
}

/** Called when the plea is made: the vote happens and the ruling is enforced or put to you. */
export function holdVote(ctx: Ctx, d: Dispute): void {
  const s = ctx.s;
  const t = tally(s, d);
  d.ruling = { forPlayer: t.forPlayer, votes: t.votes, week: s.week };
  const yes = Object.values(t.votes).filter(Boolean).length;
  const n = Object.keys(t.votes).length;
  const opp = opponent(d);
  const oppName = FACTION_NAMES[opp];
  ctx.log.push(`The Table voted ${yes}–${n - yes} ${t.forPlayer ? 'for you' : `for ${oppName}`}.`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The Table ruled ${t.forPlayer ? 'for the house' : `for ${oppName}`} (${yes}–${n - yes}): ${d.claim}`, kind: 'rival' });
  if (s.cutscenes.length < 2) s.cutscenes.push({ key: 'sitdown', title: 'The Table rules', text: `${yes} hands for you, ${n - yes} against. ${t.forPlayer ? 'Sal Moretti nods once.' : 'Sal Moretti does not look at you.'}`, week: s.week });
  const win = winEffects(s, d, t.forPlayer);
  if (win.length) applyEffects(ctx, win, { label: 'The Table rules', because: 'took a dispute to the Table' });
  if (!t.forPlayer && d.plaintiff !== 'player') s.eventQueue.push(buildRulingAgainst(s, d));
  if (d.kind === 'peace' && d.warId) {
    const w = s.wars.find((x) => x.id === d.warId);
    if (w) endWar(ctx, w, t.forPlayer ? 'won' : 'lost', 'district');
  }
}

/** Effects that follow automatically from the vote (anything the player gains, or loses when he brought it). */
function winEffects(s: GameState, d: Dispute, forPlayer: boolean): Effect[] {
  const label = 'The Table rules';
  const opp = opponent(d) as RivalId;
  if (forPlayer) {
    switch (d.kind) {
      case 'district':
        return d.district ? [{ type: 'influence', district: d.district, faction: opp, amount: -15, label }, { type: 'influence', district: d.district, faction: 'player', amount: 15, label }, { type: 'respect', amount: 3, label }] : [];
      case 'sanction':
        return d.plaintiff === 'player' && d.targetId ? [{ type: 'sanction', targetId: d.targetId, weeks: 26, label }, { type: 'respect', amount: 1, label }] : [{ type: 'respect', amount: 3, label }];
      case 'war':
        return [{ type: 'flag', key: `sanctionWar_${opp}`, value: s.week + 12 - (s.flags[`sanctionWar_${opp}`] ?? 0), label }, { type: 'respect', amount: 2, label }];
      case 'reparations':
        return d.plaintiff === 'player' ? [{ type: 'money', amount: Math.min(d.amount ?? 0, s.rivals.find((r) => r.id === opp)?.money ?? 0), label: `${label}: reparations paid to you` }] : [{ type: 'respect', amount: 3, label }];
      default:
        return [{ type: 'respect', amount: 2, label }];
    }
  }
  if (d.plaintiff === 'player') return [{ type: 'respect', amount: -3, label }, { type: 'rivalOpinion', rival: opp, amount: -5, reason: 'Dragged us before the Table', label }];
  return [];
}

/** A season: rivals may raise at most one sanction against your men in this many weeks. */
export const SANCTION_COOLDOWN = 13;

/** Blood money: what buys a sanctioned man's life from the side that asked for it (scales with his rank and your treasury). */
export function bloodPrice(s: GameState, t: Character | undefined): number {
  const w = !t ? 1 : t.rank === 'underboss' ? 1.6 : t.rank === 'consigliere' ? 1.4 : t.rank === 'capo' ? 1.2 : 0.8;
  const raw = 6000 * w + Math.max(0, s.money) * 0.08;
  return Math.max(4000, Math.min(60000, Math.round(raw / 500) * 500));
}

/** Handing over your own man: everyone in the crew remembers it, and his own men most of all. */
export function sacrificeCost(s: GameState, t: Character, label: string): Effect[] {
  const out: Effect[] = [{ type: 'crewOpinion', amount: -8, reason: `Gave ${t.firstName} to Philadelphia`, label }, { type: 'respect', amount: -3, label }];
  for (const c of crew(s)) {
    if (c.id === t.id || !c.alive) continue;
    if (c.capoId === t.id || hasTrait(c, 'Loyal-to-a-fault')) out.push({ type: 'opinion', from: c.id, to: s.playerId, amount: -20, reason: `Handed ${t.firstName} over to be killed`, decay: 0, label });
  }
  return out;
}

/** You lost a dispute someone brought against you: comply, pay, negotiate, or defy. */
export function buildRulingAgainst(s: GameState, d: Dispute): EventInstance {
  const label = 'The Table\'s ruling';
  const opp = opponent(d);
  const t = d.targetId ? s.characters[d.targetId] : undefined;
  let comply: Effect[] = [];
  let what = '';
  switch (d.kind) {
    case 'district':
      comply = d.district ? [{ type: 'influence', district: d.district, faction: 'player', amount: -12, label }, { type: 'influence', district: d.district, faction: opp, amount: 12, label }] : [];
      what = `give up your corners in ${s.districts.find((x) => x.id === d.district)?.name}`;
      break;
    case 'reparations':
      comply = [{ type: 'money', amount: -(d.amount ?? 0), label: `${label}: reparations to ${FACTION_NAMES[opp]}` }];
      what = `pay ${FACTION_NAMES[opp]} ${fmtMoney(d.amount ?? 0)}`;
      break;
    case 'sanction':
      comply = t ? [{ type: 'kill', charId: t.id, cause: 'given up to the Table\'s sanctioned hit', killer: opp as FactionId, label }, ...sacrificeCost(s, t, label)] : [];
      what = t ? `give up ${displayName(t)} — the Table sanctions his death` : 'accept their sanction';
      break;
    default:
      comply = [{ type: 'respect', amount: -3, label }];
      what = 'accept the ruling';
  }
  const defy: Choice = { id: 'defy', label: 'Defy the Table', detail: 'Nobody defies Philadelphia twice.', because: 'defied the Table', effects: [{ type: 'ruling', disputeId: d.id, comply: false, label }, { type: 'heat', bar: 'family', amount: 25, label }, { type: 'rivalOpinion', rival: 'philly', amount: -30, reason: 'Defied the Table', label }, { type: 'respect', amount: 2, label }, { type: 'schedule', key: 'table_enforce', minWeeks: 2, maxWeeks: 6, chance: 0.6, hint: 'Philadelphia may enforce it themselves', label, ...(t ? { params: { charId: t.id } } : {}) }] };
  const obey: Choice = { id: 'comply', label: t && d.kind === 'sanction' ? `Give up ${t.firstName}` : 'Do as the Table says', ...(t && d.kind === 'sanction' ? { detail: `${t.firstName} dies. Your crew will remember who handed him over${crew(s).some((c) => c.capoId === t.id) ? ', and his own men will never forgive it' : ''}.` } : {}), because: 'complied with the Table\'s ruling', effects: [...comply, { type: 'ruling', disputeId: d.id, comply: true, label }, { type: 'heat', bar: 'family', amount: -5, label }] };
  const choices: Choice[] = [obey];
  let defaultChoiceId = 'comply';
  // A sanction against one of your own (playtest #3): the Table's default must never quietly hand him over.
  // Pay blood money, send someone to bargain, or defy; giving him up is a choice, with its price.
  if (d.kind === 'sanction' && t) {
    const price = bloodPrice(s, t);
    const cons = crew(s).find((c) => c.rank === 'consigliere' && isFree(s, c));
    const short = s.money < price ? `Needs ${fmtMoney(price)} in the Family's money` : undefined;
    choices.push({ id: 'pay', label: `Pay blood money for ${t.firstName} (${fmtMoney(price)})`, detail: `${FACTION_NAMES[opp]} takes the money instead of the man. Philadelphia approves of business.`, because: `paid blood money for ${t.firstName}`, disabledReason: short, effects: [{ type: 'money', amount: -price, label: `${label}: blood money to ${FACTION_NAMES[opp]}` }, { type: 'ruling', disputeId: d.id, comply: true, label }, { type: 'rivalOpinion', rival: opp as RivalId, amount: 10, reason: 'Paid for his man', label }, { type: 'respect', amount: -1, label }, { type: 'opinion', from: t.id, to: s.playerId, amount: 25, reason: 'Paid for my life', decay: 0, label }] });
    const half = Math.round(price / 1000) * 500;
    choices.push({ id: 'negotiate', label: cons ? `Send ${cons.firstName} to bargain` : 'Send someone to bargain', detail: `Half the price (${fmtMoney(half)}) and a plea to Sal Moretti. It may hold; if it does not, Philadelphia comes for ${t.firstName} anyway.`, because: `sent ${cons ? cons.firstName : 'a man'} to bargain for ${t.firstName}`, disabledReason: s.money < half ? `Needs ${fmtMoney(half)}` : undefined, effects: [{ type: 'money', amount: -half, label: `${label}: a bargain for ${t.firstName}` }, { type: 'ruling', disputeId: d.id, comply: true, label }, { type: 'rivalOpinion', rival: 'philly', amount: -5, reason: 'Haggled over a ruling', label }, { type: 'schedule', key: 'table_enforce', minWeeks: 2, maxWeeks: 6, chance: cons ? 0.25 : 0.45, hint: `The bargain may not hold: ${t.firstName} could still be taken`, label, params: { charId: t.id } }] });
    defaultChoiceId = !short ? 'pay' : s.money >= half ? 'negotiate' : 'defy';
  }
  choices.push(defy);
  return {
    iid: `ev${s.nextId++}`, defId: 'ruling_against', week: s.week, mandatory: true, priority: 87,
    title: 'The ruling went against you',
    text: `The Table has spoken: you are to ${what}. Philadelphia expects it done.${d.kind === 'sanction' && t ? ` Unless something else changes hands.` : ''}`,
    defaultChoiceId, meta: { dispute: d.id, ...(t ? { charId: t.id } : {}) }, actors: [chair(s)?.id, t?.id].filter((x): x is string => !!x),
    choices,
  };
}

/**
 * Philadelphia comes to collect a man the Table named (after a defiance, or a bargain that did not hold).
 * They do not just take him: the boss is told, and the boss decides. Hiding him or standing with him costs;
 * giving him up is a choice he makes out loud (handover.ts), never what silence does.
 */
export function buildPhillyComes(s: GameState, v: Character): EventInstance {
  const label = 'Philadelphia comes for him';
  const price = Math.round(bloodPrice(s, v) * 1.25 / 500) * 500;
  const hideCost = 1500;
  const choices: Choice[] = [
    { id: 'hide', label: `Hide ${v.firstName} until it cools ($${hideCost.toLocaleString('en-US')})`, detail: 'A farmhouse in Cumberland County, a month out of sight. Philadelphia will look, and not find him.', because: `hid ${v.firstName} from Philadelphia`, disabledReason: s.money < hideCost ? `Needs $${hideCost.toLocaleString('en-US')}` : undefined, effects: [{ type: 'money', amount: -hideCost, label }, { type: 'mymen', op: { op: 'protect', id: v.id, how: 'hide' }, label }, { type: 'rivalOpinion', rival: 'philly', amount: -6, reason: 'Hid the man we asked for', label }, { type: 'opinion', from: v.id, to: s.playerId, amount: 15, reason: 'Hid me from Philadelphia', decay: 0, label }] },
    { id: 'stand', label: `Stand with ${v.firstName}`, detail: 'Two of your guys on him day and night. Philadelphia sees you mean it, and does not like it.', because: `stood with ${v.firstName} against Philadelphia`, effects: [{ type: 'mymen', op: { op: 'protect', id: v.id, how: 'guard' }, label }, { type: 'heat', bar: 'family', amount: 8, label }, { type: 'rivalOpinion', rival: 'philly', amount: -12, reason: 'Stood in our way', label }, { type: 'respect', amount: 2, label }, { type: 'crewOpinion', amount: 3, reason: `The boss stood with ${v.firstName}`, label }, { type: 'opinion', from: v.id, to: s.playerId, amount: 20, reason: 'Stood with me against Philadelphia', decay: 0, label }] },
    { id: 'pay', label: `Pay for him after all (${fmtMoney(price)})`, detail: 'Late money costs more. They take it.', because: `paid Philadelphia for ${v.firstName} late`, disabledReason: s.money < price ? `Needs ${fmtMoney(price)}` : undefined, effects: [{ type: 'money', amount: -price, label: `${label}: blood money` }, { type: 'rivalOpinion', rival: 'philly', amount: 6, reason: 'Paid in the end', label }, { type: 'opinion', from: v.id, to: s.playerId, amount: 20, reason: 'Paid for my life', decay: 0, label }] },
    { id: 'giveup', label: `Give ${v.firstName} up`, detail: `${v.firstName} dies. Every man in the family will know you let them take him.`, because: `gave ${v.firstName} up to Philadelphia`, effects: [{ type: 'kill', charId: v.id, cause: 'given up to Philadelphia after the Table\'s ruling', killer: 'philly', label }, ...sacrificeCost(s, v, label), { type: 'mymen', op: { op: 'note', text: `gave ${v.firstName} up to Philadelphia`, amount: -25 }, label }] },
  ];
  const def = choices.find((c) => c.id === 'hide' && !c.disabledReason) ? 'hide' : 'stand';
  return {
    iid: `ev${s.nextId++}`, defId: 'philly_comes', week: s.week, mandatory: true, priority: 88,
    title: `Philadelphia comes for ${v.firstName}`,
    text: `Two cars with Pennsylvania plates have been parked on ${v.firstName}'s street since Sunday. The Table's ruling still stands, and Philadelphia means to enforce it. ${displayName(v)} is waiting to hear what you will do.`,
    defaultChoiceId: def, meta: { charId: v.id }, actors: [v.id, ...(chair(s) ? [chair(s)!.id] : [])],
    choices,
  };
}

export function disputeById(s: GameState, id: string): Dispute | undefined {
  return s.disputes.find((d) => d.id === id);
}
