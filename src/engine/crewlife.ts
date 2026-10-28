import { perkMod } from './lifestyle';
import { idleMen } from './business';
import { ageOn } from './calendar';
import { capos, crew, displayName, hasTrait, isFree, makeCharacter, player, rollTraits } from './characters';
import { holder, seatOf, tidyCouncil } from './council';
import { discoverSecret } from './secrets';
import { addStory, giveBio } from './hierarchy';
import { defectTo } from './regimes';
import { maybePlant } from './rivalcrew';
import { heat, money, respect, type Ctx } from './ledger';
import { MALE_FIRST, SURNAMES } from './names';
import { addOpinion, changeMeter, opinion } from './relations';
import { chance, pick, randInt } from './rng';
import type { Character, CrewPolicy, EdictId, Ethnicity, EventInstance, Faction, FactionAgenda, GameState, HireSpec, Specialty } from './types';

/**
 * The life of the crew: what the boss takes from each man's hustle, who is
 * being ignored and drifting toward a rival, standing edicts, who is for
 * hire this month, and the discontented banding together into factions
 * that make demands — and, refused, attempt a coup.
 */

export const POLICY_TAKE: Record<CrewPolicy, number> = { tax: 0.4, earn: 0, squeeze: 0.85 };
export const POLICY_LABEL: Record<CrewPolicy, string> = { tax: 'Tax (40%)', earn: 'Let him earn', squeeze: 'Squeeze (85%)' };

export const EDICTS: Record<EdictId, { name: string; text: string; weekly?: number }> = {
  omerta: { name: 'Strict Omertà', text: '$300/wk. Nobody talks: federal heat cools, the law\'s files grow slower. The crew chafes under the rules.', weekly: 300 },
  blitz: { name: 'Boardwalk Blitz', text: 'Every corner worked hard: street take +20%, local heat +1 a week.' },
  nojunk: { name: 'No Junk in Wildwood', text: 'No narcotics in your territory. Philadelphia approves; the greedy grumble.' },
  lowprofile: { name: 'Low Profile', text: 'No Cadillacs, no furs: household costs halved, the IRS sees less. People slowly forget your name.' },
};

export const SPECIALTY_INFO: Record<Specialty, { name: string; text: string }> = {
  safecracker: { name: 'Safecracker', text: 'Bank and jewel crews score more often.' },
  wheelman: { name: 'Wheelman', text: 'Jobs and hits go faster and are harder to trace.' },
  torpedo: { name: 'Torpedo', text: 'A professional gunman: murder schemes gain power.' },
  accountant: { name: 'Accountant', text: 'The fronts wash 25% more.' },
  lawyer: { name: 'Lawyer', text: 'The law\'s files on your men grow slower; jail terms run shorter.' },
  forger: { name: 'Forger', text: 'Papers, deeds, ledgers: fabricating claims goes faster.' },
  doctor: { name: 'Mob doctor', text: 'Patches up the wounded without a police report: health recovers.' },
};

export function hasSpecialist(s: GameState, sp: Specialty): Character | undefined {
  return crew(s).find((c) => c.specialty === sp && isFree(s, c));
}

/* ---------------------------------------------------------------- */
/* Hustle                                                            */
/* ---------------------------------------------------------------- */

/** Each idle soldier and associate hustles for himself; the boss takes his cut by policy. */
export function crewHustle(ctx: Ctx, mult: number): number {
  const s = ctx.s;
  const men = idleMen(s);
  const blitz = s.edicts?.blitz ? 1.2 : 1;
  const groups: Record<CrewPolicy, { n: number; take: number }> = { tax: { n: 0, take: 0 }, earn: { n: 0, take: 0 }, squeeze: { n: 0, take: 0 } };
  for (const c of men) {
    const craft = c.craft === 'earner' || c.craft === 'bookmaker' ? 1.2 : c.craft === 'collector' ? 1.1 : 1;
    const earned = (c.rank === 'soldier' ? 32 : 18) * (0.7 + c.attributes.business / 200) * mult * blitz * craft;
    c.lastEarn = Math.round(earned);
    const pol = c.policy ?? 'tax';
    const boss = earned * POLICY_TAKE[pol];
    c.wealth += Math.round(earned - boss);
    groups[pol].n++;
    groups[pol].take += boss;
  }
  const st = 1 + perkMod(s, 'street') / 100;
  groups.tax.take *= st;
  groups.squeeze.take *= st;
  let total = 0;
  if (groups.tax.n) total += money(ctx, Math.round(groups.tax.take), `Street hustle: ${groups.tax.n} men hand over 40%`, 'street');
  if (groups.squeeze.n) total += money(ctx, Math.round(groups.squeeze.take), `Street hustle: squeezing ${groups.squeeze.n} men for 85%`, 'street');
  if (groups.earn.n) ctx.log.push(`${groups.earn.n} men kept everything they hustled this week.`);
  return total;
}

/* ---------------------------------------------------------------- */
/* Weekly crew life                                                  */
/* ---------------------------------------------------------------- */

export function crewWeek(ctx: Ctx): void {
  const s = ctx.s;
  tidyCouncil(s);
  const boss = player(s);
  // Edicts.
  if (s.edicts?.omerta) {
    money(ctx, -EDICTS.omerta.weekly!, 'Edict: Strict Omertà (keeping mouths shut)', 'cost');
    if (s.heat.federal > 0 && s.week % 2 === 0) heat(ctx, 'federal', -1, 'Edict: Strict Omertà — nobody talks', 'heat');
  }
  if (s.edicts?.blitz) heat(ctx, 'local', 1, 'Edict: Boardwalk Blitz — every corner worked hard', 'heat');
  if (s.edicts?.lowprofile && s.week % 4 === 0) respect(ctx, -1, 'Edict: Low Profile — people forget your name', 'drift');

  // Neglect and the slow drift toward a rival.
  for (const c of crew(s)) {
    if (c.dynasty || c.specialty || !isFree(s, c) || (c.rank !== 'soldier' && c.rank !== 'associate') || seatOf(s, c.id)) continue;
    c.neglect = (c.neglect ?? 0) + (c.policy === 'earn' ? (s.week % 2) : c.policy === 'squeeze' ? 2 : 1);
    if (perkMod(s, 'defection') && s.week % 3 === 0) c.neglect = Math.max(0, c.neglect - perkMod(s, 'defection'));
    const op = opinion(s, c.id, boss.id);
    const stage = c.defectStage ?? 0;
    if (hasTrait(c, 'Loyal-to-a-fault')) continue;
    if (stage === 0 && c.neglect >= 10 && op < 15) {
      c.defectStage = 1;
      const r = rivalFor(s);
      ctx.log.push(`${displayName(c)} has been seen drinking with ${r ? `${r.shortName}'s people` : 'strangers'}. Nobody from the family has talked to him in weeks.`);
    } else if (stage === 1 && c.neglect >= 16 && op < 5) {
      c.defectStage = 2;
    } else if (stage === 2 && c.neglect >= 22 && op < 0 && chance(s, 0.35)) {
      defect(ctx, c);
    }
  }
}

function rivalFor(s: GameState) {
  return s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive).sort((a, b) => b.muscle - a.muscle)[0];
}

/** A man walks out to a rival, taking what he knows (and, if he is a capo, the men loyal to him). */
export function defect(ctx: Ctx, c: Character, why: 'neglect' | 'desert' = 'neglect'): void {
  const r = rivalFor(ctx.s);
  defectTo(ctx, c, r?.id, why);
}

/* ---------------------------------------------------------------- */
/* Monthly crew life                                                 */
/* ---------------------------------------------------------------- */

export function crewMonth(ctx: Ctx): void {
  const s = ctx.s;
  const boss = player(s);
  for (const c of crew(s)) {
    if (c.policy === 'earn') addOpinion(s, c.id, boss.id, 'Lets me earn', 3, 1);
    if (c.policy === 'squeeze') {
      addOpinion(s, c.id, boss.id, 'Bleeds me dry', -4, 1);
      changeMeter(s, c.id, boss.id, 'fear', 3);
    }
    if (s.edicts?.omerta) addOpinion(s, c.id, boss.id, 'Strict rules under the Omertà edict', -1, 1);
    if (s.edicts?.nojunk && hasTrait(c, 'Greedy')) addOpinion(s, c.id, boss.id, 'Leaves narcotics money on the table', -2, 1);
  }
  // Specialists' fees are weekly but tallied here for a month (4 weeks).
  refreshHirePool(s);
  updateFactions(ctx);
}

export function specialistFees(ctx: Ctx): void {
  const s = ctx.s;
  const specs = crew(s).filter((c) => c.specialty && isFree(s, c));
  const fee = specs.reduce((a, c) => a + (c.fee ?? 0), 0);
  if (fee) money(ctx, -fee, `Specialist fees: ${specs.map((c) => `${c.firstName} (${c.specialty})`).join(', ')}`, 'cost');
}

export function refreshHirePool(s: GameState): void {
  const out: HireSpec[] = [];
  const mk = (kind: HireSpec['kind']): HireSpec => {
    const eth = pick(s, ['Italian', 'Italian', 'Italian', 'Irish', 'Jewish'] as Ethnicity[]);
    const skill = randInt(s, 40, 85);
    const spec = kind !== 'recruit';
    return {
      id: `h${s.nextId++}`,
      kind,
      firstName: pick(s, MALE_FIRST[eth]),
      lastName: pick(s, SURNAMES[eth]),
      ethnicity: eth,
      age: randInt(s, spec ? 28 : 18, spec ? 55 : 30),
      skill,
      cost: spec ? Math.round((1200 + skill * 25) / 100) * 100 : Math.round((300 + skill * 8) / 100) * 100,
      fee: spec ? Math.round((40 + skill) / 10) * 10 : 0,
      traits: rollTraits(s, 2),
    };
  };
  out.push(mk('recruit'), mk('recruit'));
  const specs: Specialty[] = ['safecracker', 'wheelman', 'torpedo', 'accountant', 'lawyer', 'forger', 'doctor'];
  const a = pick(s, specs);
  out.push(mk(a), mk(pick(s, specs.filter((x) => x !== a))));
  s.hirePool = out;
}

/** Creates the character for a hire. */
export function hireFromPool(ctx: Ctx, specId: string): Character | undefined {
  const s = ctx.s;
  const h = s.hirePool.find((x) => x.id === specId);
  if (!h) return undefined;
  s.hirePool = s.hirePool.filter((x) => x.id !== specId);
  const c = makeCharacter(s, { firstName: h.firstName, lastName: h.lastName, ethnicity: h.ethnicity, age: h.age, rank: 'associate', faction: 'player', traits: h.traits });
  if (h.kind !== 'recruit') {
    c.specialty = h.kind;
    c.fee = h.fee;
    const key = h.kind === 'accountant' ? 'business' : h.kind === 'lawyer' || h.kind === 'forger' ? 'intrigue' : h.kind === 'doctor' ? 'discipline' : 'force';
    c.attributes[key] = Math.max(c.attributes[key], h.skill);
  }
  addOpinion(s, c.id, s.playerId, 'Gave me work', 15, 1);
  giveBio(s, c);
  if (h.kind === 'recruit') maybePlant(s, c);
  addStory(s, c, c.specialty ? `Hired as the family's ${c.specialty}.` : 'Came in off the street looking for work.');
  ctx.log.push(`${displayName(c)} is with us now${c.specialty ? ` (${c.specialty})` : ''}.`);
  return c;
}

/* ---------------------------------------------------------------- */
/* Factions & coups                                                  */
/* ---------------------------------------------------------------- */

function discontent(s: GameState): Character[] {
  const boss = player(s);
  return crew(s).filter((c) => !c.dynasty && isFree(s, c) && (c.rank === 'capo' || c.rank === 'soldier' || c.rank === 'underboss' || c.rank === 'consigliere') && opinion(s, c.id, boss.id) < -25);
}

function strength(c: Character): number {
  return c.attributes.leadership + c.attributes.force + (c.rank === 'capo' ? 60 : c.rank === 'underboss' ? 80 : 0);
}

export function factionPower(s: GameState, f: Faction): number {
  const all = crew(s).filter((c) => isFree(s, c)).reduce((a, c) => a + strength(c), 0) || 1;
  const mine = f.memberIds.map((id) => s.characters[id]).filter((c) => c?.alive && c.faction === 'player').reduce((a, c) => a + strength(c!), 0);
  return mine / all;
}

export const AGENDA_TEXT: Record<FactionAgenda, string> = {
  kickup: 'lower the kick-up',
  contracts: 'bigger contracts for every capo',
  underboss: 'their man as underboss',
  narcotics: 'go into narcotics',
  abdicate: 'the boss steps aside',
  head: 'a head',
};

function factionName(s: GameState, leader: Character): string {
  const d = s.districts.find((x) => x.capoId === leader.id);
  return d ? `the ${d.name} guys` : `${leader.firstName} ${leader.lastName}'s people`;
}

/** What the faction says it wants, in one line ("the Boardwalk guys want Leo as underboss"). */
export function factionAgendaText(s: GameState, f: Faction): string {
  const a = f.agenda ?? (f.demand === 'contracts' ? 'kickup' : f.demand);
  const cand = f.candidateId ? s.characters[f.candidateId] : undefined;
  const target = f.targetId ? s.characters[f.targetId] : undefined;
  if (a === 'underboss' && cand) return `${f.name ?? 'They'} want ${cand.firstName} as underboss`;
  if (a === 'head' && target) return `${f.name ?? 'They'} want ${target.firstName} ${target.lastName}'s head`;
  return `${f.name ?? 'They'} want ${AGENDA_TEXT[a]}`;
}

export function factionStageText(f: Faction): string {
  return ['Making demands', 'Ultimatum issued', 'Gone to Philadelphia behind your back', 'Planning to move on you'][Math.min(3, f.stage ?? (f.ultimatumWeek ? 1 : 0))];
}

/** Capos who share an interest band together even before they hate you. */
function agendaFaction(s: GameState): Faction | undefined {
  const boss = player(s);
  const caps = capos(s).filter((c) => isFree(s, c) && !c.dynasty && opinion(s, c.id, boss.id) < 15);
  if (caps.length < 2) return undefined;
  // An ambitious capo with friends wants to be underboss.
  const ub = crew(s).find((c) => c.rank === 'underboss');
  for (const cand of caps.filter((c) => hasTrait(c, 'Ambitious') && c.attributes.leadership >= 50)) {
    const friends = capos(s).filter((o) => o.id !== cand.id && isFree(s, o) && opinion(s, o.id, cand.id) >= 10 && (!ub || opinion(s, o.id, ub.id) < 10));
    if (friends.length >= 1) return { id: `f${s.nextId++}`, leaderId: cand.id, memberIds: [cand.id, ...friends.map((x) => x.id)], demand: 'contracts', agenda: 'underboss', candidateId: cand.id, since: s.week, stage: 0, stageWeek: s.week, name: factionName(s, cand) };
  }
  const greedy = caps.filter((c) => hasTrait(c, 'Greedy') || (c.keep ?? 0.3) < 0.3);
  if (greedy.length >= 2) {
    const lead = greedy.sort((a, b) => strength(b) - strength(a))[0];
    const narco = greedy.some((c) => hasTrait(c, 'Cruel') || hasTrait(c, 'Ambitious')) && !s.edicts?.nojunk && chance(s, 0.35);
    return { id: `f${s.nextId++}`, leaderId: lead.id, memberIds: greedy.map((c) => c.id), demand: 'contracts', agenda: narco ? 'narcotics' : 'kickup', since: s.week, stage: 0, stageWeek: s.week, name: factionName(s, lead) };
  }
  return undefined;
}

export function updateFactions(ctx: Ctx): void {
  const s = ctx.s;
  const boss = player(s);
  const unhappy = discontent(s);
  // Members whose mood recovered leave; dead or departed are dropped.
  for (const f of s.factions) {
    const agenda = f.agenda && f.agenda !== 'contracts' && f.agenda !== 'abdicate' && f.agenda !== 'head';
    f.memberIds = f.memberIds.filter((id) => {
      const c = s.characters[id];
      if (!c?.alive || c.faction !== 'player') return false;
      return agenda ? opinion(s, id, boss.id) < 30 : unhappy.some((u) => u.id === id);
    });
  }
  s.factions = s.factions.filter((f) => f.memberIds.length >= 2 && f.memberIds.includes(f.leaderId));
  if (s.factions.length === 0 && unhappy.length >= 2 && unhappy.some((c) => c.rank === 'capo')) {
    const leader = unhappy.slice().sort((a, b) => strength(b) - strength(a))[0];
    const demand: Faction['demand'] = hasTrait(leader, 'Ambitious') && ageOn(boss.birth, s.date) > 50 ? 'abdicate' : hasTrait(leader, 'Greedy') || unhappy.some((c) => (c.keep ?? 0.3) < 0.3) ? 'contracts' : 'head';
    const target = demand === 'head' ? crew(s).filter((c) => !unhappy.includes(c) && seatOf(s, c.id)).sort((a, b) => opinion(s, leader.id, a.id) - opinion(s, leader.id, b.id))[0] : undefined;
    const d2: Faction['demand'] = target || demand !== 'head' ? demand : 'contracts';
    const f: Faction = { id: `f${s.nextId++}`, leaderId: leader.id, memberIds: unhappy.map((c) => c.id), demand: d2, agenda: d2, targetId: target?.id, since: s.week, stage: 0, stageWeek: s.week, name: factionName(s, leader) };
    s.factions.push(f);
    announceFaction(ctx, f);
  } else if (s.factions.length < 2) {
    const f = agendaFaction(s);
    if (f && !s.factions.some((x) => x.leaderId === f.leaderId || x.agenda === f.agenda)) {
      s.factions.push(f);
      announceFaction(ctx, f);
    }
  }
}

function announceFaction(ctx: Ctx, f: Faction): void {
  const s = ctx.s;
  const leader = s.characters[f.leaderId];
  ctx.log.push(`${displayName(leader)} and ${f.memberIds.length - 1} other${f.memberIds.length > 2 ? 's' : ''} have started meeting without you: ${factionAgendaText(s, f).replace(/^the /, 'The ')}.`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A faction formed around ${displayName(leader)}: ${factionAgendaText(s, f)}.`, kind: 'misc' });
  for (const id of f.memberIds) addStory(s, s.characters[id], `Joined ${f.name ?? 'a faction'}: ${AGENDA_TEXT[f.agenda ?? 'contracts']}.`);
  s.eventQueue.push(buildFactionDemand(s, f));
}

/** Weekly: factions escalate — demand → ultimatum → Philadelphia → a coup. */
export function factionsWeek(ctx: Ctx): void {
  const s = ctx.s;
  for (const f of s.factions) {
    const stage = f.stage ?? (f.ultimatumWeek ? 1 : 0);
    const caps = f.memberIds.filter((id) => s.characters[id]?.rank === 'capo').length;
    if (stage === 0 && !f.ultimatumWeek && s.week - f.since >= 2 && (factionPower(s, f) >= 0.2 || caps >= 2)) {
      f.ultimatumWeek = s.week;
      f.stage = 1;
      f.stageWeek = s.week;
      s.eventQueue.push(buildUltimatum(s, f));
    } else if (stage === 1 && s.week - (f.stageWeek ?? s.week) >= 6 && !s.scheduled.some((x) => x.key === 'coup' && x.params.faction === f.id)) {
      // Still together six weeks after the ultimatum: they stop waiting for an answer.
      const L = s.characters[f.leaderId];
      f.stageWeek = s.week;
      s.scheduled.push({ id: `sc${s.nextId++}`, key: 'faction_philly', dueWeek: s.week + 1, because: `left ${L?.firstName ?? 'the'}${L ? '\'s' : ''} faction without an answer`, sourceWeek: s.week, params: { faction: f.id } });
      s.scheduled.push({ id: `sc${s.nextId++}`, key: 'coup', dueWeek: s.week + randInt(s, 3, 6), because: `left ${L?.firstName ?? 'the'}${L ? '\'s' : ''} faction without an answer`, sourceWeek: s.week, params: { faction: f.id } });
      ctx.log.push(`${L ? displayName(L) : 'The faction'} stopped waiting for your answer.`);
    }
  }
}

/** The first approach: they state their agenda and ask. */
export function buildFactionDemand(s: GameState, f: Faction): EventInstance {
  const leader = s.characters[f.leaderId];
  const label = `Faction of ${leader.firstName} ${leader.lastName}`;
  const agenda = f.agenda ?? 'contracts';
  const cand = f.candidateId ? s.characters[f.candidateId] : undefined;
  const others = f.memberIds.filter((id) => id !== f.leaderId).map((id) => s.characters[id]).filter((c): c is Character => !!c);
  const weakest = others.slice().sort((a, b) => strength(a) - strength(b))[0];
  const choices: EventInstance['choices'] = [];
  if (agenda === 'kickup' || agenda === 'contracts') {
    choices.push({ id: 'concede', label: 'Lower the kick-up for every capo', detail: 'Every capo keeps 5% more.', because: `lowered the kick-up for ${f.name ?? 'the capos'}`, effects: [{ type: 'faction', factionId: f.id, outcome: 'disband', label }, ...capos(s).map((c) => ({ type: 'contract', charId: c.id, keep: Math.min(0.45, Math.round(((c.keep ?? 0.3) + 0.05) * 100) / 100), label }) as const), { type: 'respect', amount: -2, label }] });
  } else if (agenda === 'underboss' && cand) {
    choices.push({ id: 'concede', label: `Make ${cand.firstName} underboss`, because: `made ${cand.firstName} underboss to satisfy his faction`, effects: [{ type: 'faction', factionId: f.id, outcome: 'disband', label }, { type: 'seat', seat: 'underboss', charId: cand.id, label }, { type: 'opinion', from: cand.id, to: s.playerId, amount: 20, reason: 'Made me underboss', decay: 1, label }] });
  } else if (agenda === 'narcotics') {
    choices.push({ id: 'concede', label: 'Look the other way', detail: 'They dabble on their own. Bruno must never hear of it.', because: `looked the other way while ${f.name ?? 'the capos'} dabbled in narcotics`, effects: [{ type: 'faction', factionId: f.id, outcome: 'disband', label }, ...f.memberIds.map((id) => ({ type: 'opinion', from: id, to: s.playerId, amount: 15, reason: 'Let us make real money', decay: 1, label }) as const), { type: 'heat', bar: 'federal', amount: 4, label }, { type: 'schedule', key: 'narcotics_found_out', minWeeks: 3, maxWeeks: 10, chance: 0.45, hint: 'Philadelphia may hear of it', label }] });
  }
  choices.push(
    { id: 'buy', label: `Buy them off ($${(1000 * f.memberIds.length).toLocaleString('en-US')})`, because: `paid off ${f.name ?? 'the faction'}`, effects: [{ type: 'money', amount: -1000 * f.memberIds.length, label }, ...f.memberIds.map((id) => ({ type: 'opinion', from: id, to: s.playerId, amount: 18, reason: 'Paid us to stay quiet', decay: 2, label }) as const)] },
  );
  if (weakest && f.memberIds.length >= 3) {
    choices.push({ id: 'split', label: `Peel off ${weakest.firstName} ($1,500 to him)`, detail: 'Split them up: one envelope, one fewer voice.', because: `peeled ${weakest.firstName} away from ${f.name ?? 'the faction'}`, effects: [{ type: 'money', amount: -1500, label }, { type: 'wealth', charId: weakest.id, amount: 1500, label }, { type: 'faction2', factionId: f.id, op: 'remove', memberId: weakest.id, label }, { type: 'opinion', from: weakest.id, to: s.playerId, amount: 25, reason: 'The boss took care of me', decay: 1, label }, { type: 'opinion', from: f.leaderId, to: weakest.id, amount: -20, reason: 'Sold us out', decay: 1, label }] });
  }
  if (agenda !== 'underboss') {
    choices.push({ id: 'promote', label: `Buy ${leader.firstName} with a better contract`, detail: 'Their ringleader keeps 8% more. The rest lose their voice.', because: `bought ${leader.firstName} off with a better contract`, effects: [{ type: 'contract', charId: leader.id, keep: Math.min(0.5, Math.round(((leader.keep ?? 0.3) + 0.08) * 100) / 100), label }, { type: 'faction', factionId: f.id, outcome: 'disband', label }, ...others.map((o) => ({ type: 'opinion', from: o.id, to: leader.id, amount: -15, reason: 'Sold us out for himself', decay: 1, label }) as const)] });
  }
  choices.push(
    { id: 'crush', label: `Eliminate ${leader.firstName}`, detail: 'The ringleader disappears. The rest will remember.', because: `had ${leader.firstName} killed for leading a faction`, effects: [{ type: 'kill', charId: leader.id, cause: 'whacked for plotting against the boss', killer: 'player', label }, ...others.map((o) => ({ type: 'meter', from: o.id, to: s.playerId, meter: 'fear', amount: 25, label }) as const), { type: 'faction', factionId: f.id, outcome: 'disband', label }, { type: 'heat', bar: 'local', amount: 6, label }] },
    { id: 'stall', label: 'Tell them you will think about it', detail: 'They will not wait long.', because: `stalled ${f.name ?? 'the faction'}`, effects: [{ type: 'opinion', from: f.leaderId, to: s.playerId, amount: -4, reason: 'Gave us the runaround', decay: 1, label }] },
  );
  return {
    iid: `ev${s.nextId++}`, defId: 'faction_demand', week: s.week, mandatory: true, priority: 70,
    title: `${(f.name ?? 'A faction').replace(/^the /, 'The ')} want something`,
    text: `${displayName(leader)} speaks for ${f.memberIds.length} men: ${factionAgendaText(s, f)}. "We are asking nicely. This time."`,
    defaultChoiceId: 'stall', meta: { faction: f.id }, actors: [leader.id, ...others.slice(0, 2).map((o) => o.id)], choices,
  };
}

export function buildUltimatum(s: GameState, f: Faction): EventInstance {
  const leader = s.characters[f.leaderId];
  const target = f.targetId ? s.characters[f.targetId] : undefined;
  const n = f.memberIds.length;
  const power = Math.round(factionPower(s, f) * 100);
  const buy = 1500 * n;
  const demandText = f.demand === 'contracts' ? 'every capo keeps a bigger end of his district' : f.demand === 'abdicate' ? 'you step aside for your heir' : `you give them ${target ? displayName(target) : 'a scapegoat'}`;
  const label = `Faction of ${leader.firstName} ${leader.lastName}`;
  const choices: EventInstance['choices'] = [];
  if (f.demand === 'contracts') {
    choices.push({ id: 'concede', label: 'Give them their bigger end', detail: 'Every capo keeps 5% more.', because: `gave in to ${leader.firstName}'s faction`, effects: [{ type: 'faction', factionId: f.id, outcome: 'disband', label }, ...capos(s).map((c) => ({ type: 'contract', charId: c.id, keep: Math.min(0.45, (c.keep ?? 0.3) + 0.05), label }) as const), { type: 'respect', amount: -3, label }] });
  } else if (f.demand === 'head' && target) {
    choices.push({ id: 'concede', label: `Give them ${target.firstName}`, detail: 'Exile him. They stop meeting.', because: `sacrificed ${target.firstName} to the faction`, effects: [{ type: 'exile', charId: target.id, label }, { type: 'faction', factionId: f.id, outcome: 'disband', label }, { type: 'respect', amount: -2, label }] });
  } else {
    choices.push({ id: 'concede', label: 'Promise to step aside in a year', detail: 'Buys time. They will hold you to it.', because: `promised ${leader.firstName}'s faction you would step aside`, effects: [{ type: 'faction', factionId: f.id, outcome: 'disband', label }, { type: 'respect', amount: -5, label }, { type: 'schedule', key: 'promise_abdicate', minWeeks: 40, maxWeeks: 52, chance: 1, hint: 'they will come back for your answer', params: { leader: leader.id }, label }] });
  }
  choices.push(
    { id: 'buy', label: `Buy them off (${'$' + buy.toLocaleString('en-US')})`, detail: 'Envelopes all round.', because: `paid off ${leader.firstName}'s faction`, effects: [{ type: 'money', amount: -buy, label }, ...f.memberIds.map((id) => ({ type: 'opinion', from: id, to: s.playerId, amount: 25, reason: 'Paid us to stay quiet', decay: 2, label }) as const), { type: 'respect', amount: -2, label }] },
    { id: 'crush', label: `Make an example of ${leader.firstName}`, detail: 'Whack the ringleader. The rest will remember.', because: `had ${leader.firstName} whacked for leading a faction`, effects: [{ type: 'kill', charId: leader.id, cause: 'whacked for plotting against the boss', killer: 'player', label }, ...f.memberIds.filter((id) => id !== leader.id).map((id) => ({ type: 'meter', from: id, to: s.playerId, meter: 'fear', amount: 30, label }) as const), { type: 'faction', factionId: f.id, outcome: 'disband', label }, { type: 'respect', amount: 3, label }, { type: 'heat', bar: 'local', amount: 6, label }] },
    { id: 'refuse', label: 'Tell them to go to hell', detail: `They hold ${power}% of the crew's muscle.`, because: `defied ${leader.firstName}'s faction`, effects: [{ type: 'respect', amount: 1, label }, { type: 'schedule', key: 'faction_philly', minWeeks: 1, maxWeeks: 2, chance: 1, hint: 'they may go to Philadelphia behind your back', params: { faction: f.id }, label }, { type: 'schedule', key: 'coup', minWeeks: 3, maxWeeks: 6, chance: 1, hint: `${power}% of the crew may move against you`, params: { faction: f.id }, label }] },
  );
  return {
    iid: `ev${s.nextId++}`, defId: 'faction_ultimatum', week: s.week, mandatory: true, priority: 88,
    title: 'An ultimatum from your own people',
    text: `${displayName(leader)} speaks for ${n} men of the family. They are not asking any more. They want ${f.agenda && f.agenda !== 'contracts' && f.agenda !== 'abdicate' && f.agenda !== 'head' ? AGENDA_TEXT[f.agenda] : demandText}.`,
    defaultChoiceId: 'buy',
    meta: { faction: f.id },
    actors: [leader.id, ...f.memberIds.filter((id) => id !== leader.id).slice(0, 2)],
    choices,
  };
}

/* ---------------------------------------------------------------- */
/* Intel from the consigliere                                        */
/* ---------------------------------------------------------------- */

/** Spend accumulated intel to reveal something hidden. Returns an event to show, if any. */
export function revealIntel(ctx: Ctx): EventInstance | undefined {
  const s = ctx.s;
  if ((s.flags.intel ?? 0) < 100) return undefined;
  const cons = holder(s, 'consigliere');
  const rat = s.flags.informant ? s.characters[`c${s.flags.informant}`] : undefined;
  if (rat?.alive && rat.faction === 'player' && !s.flags.informantKnown) {
    s.flags.intel -= 100;
    s.flags.informantKnown = 1;
    return {
      iid: `ev${s.nextId++}`, defId: 'rat_found', week: s.week, mandatory: true, priority: 75,
      title: 'The rat',
      text: `${cons ? displayName(cons) : 'Your consigliere'} lays it out: phone records, a car seen outside the federal building in Camden. It is ${displayName(rat)}.`,
      // Killing one of your own is the boss's explicit order, never what silence does (handover.ts).
      defaultChoiceId: 'feed', meta: { charId: rat.id }, actors: [rat.id],
      choices: [
        { id: 'whack', label: 'He goes in the marsh', because: `had the informant ${rat.firstName} killed`, effects: [{ type: 'kill', charId: rat.id, cause: 'killed as an informant', killer: 'player', label: 'The rat' }, { type: 'flag', key: 'informant', value: -(s.flags.informant ?? 0), label: 'The rat' }, { type: 'heat', bar: 'federal', amount: 6, label: 'The rat' }, { type: 'respect', amount: 3, label: 'The rat' }] },
        { id: 'feed', label: 'Feed him lies', detail: 'Let the FBI chase ghosts.', because: `fed false information through ${rat.firstName}`, effects: [{ type: 'heat', bar: 'federal', amount: -12, label: 'Feeding the rat' }, { type: 'flag', key: 'informant', value: -(s.flags.informant ?? 0), label: 'Feeding the rat' }, { type: 'schedule', key: 'rat_burned', minWeeks: 4, maxWeeks: 12, chance: 0.35, hint: 'the FBI may realise', params: { charId: rat.id }, label: 'Feeding the rat' }] },
        { id: 'exile', label: 'Run him off the island', because: `ran the informant ${rat.firstName} off the island`, effects: [{ type: 'exile', charId: rat.id, label: 'The rat' }, { type: 'flag', key: 'informant', value: -(s.flags.informant ?? 0), label: 'The rat' }] },
      ],
    };
  }
  const skim = capos(s).filter((c) => (c.skimmed ?? 0) >= 600).sort((a, b) => (b.skimmed ?? 0) - (a.skimmed ?? 0))[0];
  if (skim) {
    s.flags.intel -= 100;
    skim.skimmed = Math.max(skim.skimmed ?? 0, 1200);
    ctx.log.push(`${cons ? displayName(cons) : 'Your consigliere'} has numbers on ${displayName(skim)}: his envelopes are light.`);
    return undefined;
  }
  if (discoverSecret(ctx)) {
    s.flags.intel -= 100;
    return undefined;
  }
  s.flags.intel = 100; // nothing to find yet; keep the edge
  return undefined;
}

export { POLICY_TAKE as POLICY_SHARE };
export type { Faction };
