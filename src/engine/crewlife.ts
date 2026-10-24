import { idleMen } from './business';
import { ageOn } from './calendar';
import { capos, crew, displayName, hasTrait, isFree, makeCharacter, player, rollTraits } from './characters';
import { holder, seatOf, tidyCouncil } from './council';
import { discoverSecret } from './secrets';
import { heat, money, respect, type Ctx } from './ledger';
import { MALE_FIRST, SURNAMES } from './names';
import { addOpinion, changeMeter, opinion } from './relations';
import { chance, pick, randInt } from './rng';
import type { Character, CrewPolicy, EdictId, Ethnicity, EventInstance, Faction, GameState, HireSpec, Specialty } from './types';

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
    const earned = (c.rank === 'soldier' ? 32 : 18) * (0.7 + c.attributes.business / 200) * mult * blitz;
    const pol = c.policy ?? 'tax';
    const boss = earned * POLICY_TAKE[pol];
    c.wealth += Math.round(earned - boss);
    groups[pol].n++;
    groups[pol].take += boss;
  }
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

/** A man walks out to a rival, taking what he knows. */
export function defect(ctx: Ctx, c: Character): void {
  const s = ctx.s;
  const r = rivalFor(s);
  c.faction = r?.id ?? 'none';
  c.defectStage = 0;
  for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
  for (const b of s.businesses) if (b.staffIds) b.staffIds = b.staffIds.filter((id) => id !== c.id);
  if (r) r.muscle = Math.min(100, r.muscle + 3);
  addOpinion(s, s.playerId, c.id, 'Walked out on the family', -40, 0);
  ctx.log.push(`${displayName(c)} walked out and went over to ${r ? r.shortName : 'nobody'}. He knows where things are kept.`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} defected${r ? ` to ${r.shortName}` : ''} after weeks of being ignored.`, kind: 'misc' });
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

export function updateFactions(ctx: Ctx): void {
  const s = ctx.s;
  const boss = player(s);
  const unhappy = discontent(s);
  // Members whose mood recovered leave; dead or departed are dropped.
  for (const f of s.factions) f.memberIds = f.memberIds.filter((id) => unhappy.some((c) => c.id === id));
  s.factions = s.factions.filter((f) => f.memberIds.length >= 2 && f.memberIds.includes(f.leaderId));
  if (s.factions.length === 0 && unhappy.length >= 2 && unhappy.some((c) => c.rank === 'capo')) {
    const leader = unhappy.slice().sort((a, b) => strength(b) - strength(a))[0];
    const demand: Faction['demand'] = hasTrait(leader, 'Ambitious') && ageOn(boss.birth, s.date) > 50 ? 'abdicate' : hasTrait(leader, 'Greedy') || unhappy.some((c) => (c.keep ?? 0.3) < 0.3) ? 'contracts' : 'head';
    const target = demand === 'head' ? crew(s).filter((c) => !unhappy.includes(c) && seatOf(s, c.id)).sort((a, b) => opinion(s, leader.id, a.id) - opinion(s, leader.id, b.id))[0] : undefined;
    const f: Faction = { id: `f${s.nextId++}`, leaderId: leader.id, memberIds: unhappy.map((c) => c.id), demand: target || demand !== 'head' ? demand : 'contracts', targetId: target?.id, since: s.week };
    s.factions.push(f);
    ctx.log.push(`${displayName(leader)} and ${unhappy.length - 1} others have started meeting without you.`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A faction formed against the boss around ${displayName(leader)}.`, kind: 'misc' });
  }
  for (const f of s.factions) {
    const caps = f.memberIds.filter((id) => s.characters[id]?.rank === 'capo').length;
    if (!f.ultimatumWeek && s.week - f.since >= 2 && (factionPower(s, f) >= 0.2 || caps >= 2)) {
      f.ultimatumWeek = s.week;
      s.eventQueue.push(buildUltimatum(s, f));
    }
  }
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
    { id: 'refuse', label: 'Tell them to go to hell', detail: `They hold ${power}% of the crew's muscle.`, because: `defied ${leader.firstName}'s faction`, effects: [{ type: 'respect', amount: 1, label }, { type: 'schedule', key: 'coup', minWeeks: 2, maxWeeks: 6, chance: 1, hint: `${power}% of the crew may move against you`, params: { faction: f.id }, label }] },
  );
  return {
    iid: `ev${s.nextId++}`, defId: 'faction_ultimatum', week: s.week, mandatory: true, priority: 88,
    title: 'An ultimatum from your own people',
    text: `${displayName(leader)} speaks for ${n} men of the family. They are not asking. They want ${demandText}.`,
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
      defaultChoiceId: 'whack', meta: { charId: rat.id }, actors: [rat.id],
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
