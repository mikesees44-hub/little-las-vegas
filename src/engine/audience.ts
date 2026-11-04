import { crew, displayName, hasTrait, isFree, player } from './characters';
import { attr } from './attrs';
import { holder } from './council';
import { openGrievances } from './grievances';
import { hasVice } from './hierarchy';
import type { Acceptance, Reason } from './interactions';
import { opinion } from './relations';
import { chance, pick } from './rng';
import { pw, type PetitionKind, type PetitionRec } from './powerState';
import { buildTownPetition, petitionRoll } from './petitions';
import type { Character, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * THE AUDIENCE CHAMBER (design item 19), built on the Boss's Office.
 *
 * People come to whoever holds power — the boss, the shadow Don behind a
 * front, a capo — with problems drawn from the real simulation: a racket
 * dispute between two men who hate each other, a capo's missing kick-up, a
 * passed-over grievance, a debt to a rival's shylock, a rival asking for a
 * sit-down, a claim on the succession. Volume scales with rank and
 * reputation. PETITIONERS CAN LIE: the consigliere (or your own intrigue)
 * can look into it before you rule, and a liar can be caught.
 */

/** Weekly chance someone comes to the back room, by station and respect. */
export function audienceChance(s: GameState): number {
  const p = s.power;
  const station = p?.station ?? 'boss';
  const rank = station === 'boss' ? 1 : station === 'underboss' ? 0.8 : station === 'capo' ? 0.6 : station === 'independent' ? 0.5 : 0.25;
  return Math.min(0.3, (0.04 + s.respect / 700) * rank + (p?.front ? 0.03 : 0));
}

/** How likely a petitioner is to lie, from his character. */
export function lieChance(s: GameState, c: Character): number {
  let pr = 0.15 + (attr(s, c, 'manipulation') - 50) / 200 + (attr(s, c, 'greed') - 50) / 250 - (attr(s, c, 'conscience') - 50) / 200;
  if (hasTrait(c, 'Honest')) pr -= 0.2;
  if (hasTrait(c, 'Greedy')) pr += 0.1;
  return Math.max(0.03, Math.min(0.7, pr));
}

/** Who investigates, and the odds of catching a liar, with reasons. */
export function investigateOdds(s: GameState, rec: PetitionRec): Acceptance & { judgeId: string } {
  const cons = holder(s, 'consigliere');
  const judge = cons && isFree(s, cons) ? cons : player(s);
  const liar = s.characters[rec.petitionerId];
  const reasons: Reason[] = [];
  const j = (attr(s, judge, 'judgment') + attr(s, judge, 'awareness')) / 2;
  reasons.push({ label: cons && judge === cons ? `The consigliere's judgment (${displayName(judge)})` : 'Your own judgment', value: Math.round(j * 0.9) });
  if (liar) reasons.push({ label: `${liar.firstName}'s manipulation`, value: -Math.round(attr(s, liar, 'manipulation') * 0.5) });
  reasons.push({ label: 'Asking around', value: 20 });
  const margin = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.05, Math.min(1, margin / 100)), reasons, judgeId: judge.id };
}

interface Draft {
  kind: PetitionKind;
  petitioner: Character;
  against?: Character;
  rival?: RivalId;
  claim: string;
  truthful: boolean;
  title: string;
  text: string;
  forEffects: Effect[];
  againstEffects: Effect[];
  forLabel: string;
  againstLabel: string;
}

function drafts(s: GameState): Draft[] {
  const out: Draft[] = [];
  const p = pw(s);
  const boss = player(s);
  const men = crew(s).filter((c) => isFree(s, c) && c.id !== boss.id && !s.power?.petitions.some((x) => x.petitionerId === c.id && s.week - x.week < 26));
  // A racket dispute between two men who hate each other.
  for (const a of men) {
    if (a.rank === 'associate') continue;
    const b = men.find((o) => o.id !== a.id && o.rank !== 'associate' && opinion(s, a.id, o.id) <= -10);
    if (!b) continue;
    const lie = chance(p, lieChance(s, a));
    out.push({
      kind: 'dispute', petitioner: a, against: b, truthful: !lie,
      claim: `${b.firstName} moved on his corner`,
      title: `${a.firstName} against ${b.firstName}`,
      text: `${displayName(a)} says ${displayName(b)} put his own runner on a corner that has paid ${a.firstName}'s regime since the war. ${b.firstName} says the corner was never his.`,
      forLabel: `Give ${a.firstName} the corner`, againstLabel: `${b.firstName} keeps it`,
      forEffects: [{ type: 'opinion', from: a.id, to: boss.id, amount: 10, reason: 'Ruled for me', decay: 1 }, { type: 'opinion', from: b.id, to: boss.id, amount: -10, reason: 'Ruled against me', decay: 1 }],
      againstEffects: [{ type: 'opinion', from: b.id, to: boss.id, amount: 8, reason: 'Ruled for me', decay: 1 }, { type: 'opinion', from: a.id, to: boss.id, amount: -10, reason: 'Ruled against me', decay: 1 }],
    });
    break;
  }
  // A missing kick-up: a capo who is short (really short if he skims or owes arrears).
  const short = crew(s).find((c) => c.rank === 'capo' && isFree(s, c) && ((c.skimmed ?? 0) > 300 || (c.arrears ?? 0) > 0));
  const asker = short ? crew(s).find((c) => (c.rank === 'capo' || c.rank === 'soldier') && c.id !== short.id && isFree(s, c)) : undefined;
  if (short) {
    const truth = (short.skimmed ?? 0) > 300;
    out.push({
      kind: 'kickup', petitioner: short, truthful: !truth,
      claim: 'a bad month, not a skim',
      title: `${short.firstName}'s envelope is light`,
      text: `${displayName(short)} comes in before you can send for him. "The envelope's light, I know. A bad stretch — the cops closed two of my spots. I'll make it up by the Fourth."${asker ? ` ${asker.firstName} says the spots were open every night.` : ''}`,
      forLabel: 'Believe him: give him time', againstLabel: 'Make him pay it all now',
      forEffects: [{ type: 'opinion', from: short.id, to: boss.id, amount: 8, reason: 'Gave me time', decay: 1 }],
      againstEffects: [{ type: 'money', amount: Math.min(1500, Math.max(300, short.skimmed ?? 300)) }, { type: 'skimReset', charId: short.id }, { type: 'opinion', from: short.id, to: boss.id, amount: -8, reason: 'Squeezed me when I was down', decay: 1 }],
    });
  }
  // A passed-over man asks for what he thinks he is owed.
  const g = openGrievances(s).find((x) => x.stage >= 1 && x.severity >= 30 && s.characters[x.charId]?.alive && s.characters[x.charId].faction === 'player');
  if (g) {
    const c = s.characters[g.charId];
    const w = g.winnerId ? s.characters[g.winnerId] : undefined;
    const lie = !!w && chance(p, lieChance(s, c));
    out.push({
      kind: 'passedover', petitioner: c, against: w, truthful: !lie,
      claim: w ? `${w.firstName} is skimming from ${g.postLabel}` : 'he was promised it',
      title: `${c.firstName} wants what he was owed`,
      text: `${displayName(c)} has been passed over for ${g.postLabel} and wants you to know it.${w ? ` "And while we're talking — ${w.firstName} is skimming. Ask anybody."` : ' "You promised me, years ago."'}`,
      forLabel: w ? `Take it from ${w.firstName} and give it to ${c.firstName}` : 'Make it up to him', againstLabel: 'Tell him the decision stands',
      forEffects: [{ type: 'opinion', from: c.id, to: boss.id, amount: 15, reason: 'Finally listened to me', decay: 1 }, ...(w ? [{ type: 'opinion', from: w.id, to: boss.id, amount: -15, reason: 'Believed a liar over me', decay: 1 } as Effect] : [{ type: 'money', amount: -1500 } as Effect])],
      againstEffects: [{ type: 'opinion', from: c.id, to: boss.id, amount: -6, reason: 'Would not listen', decay: 1 }],
    });
  }
  // A debt to a rival's shylock: for his kid's hospital bill — or the horses.
  const debtor = crew(s).find((c) => c.debtTo && isFree(s, c));
  if (debtor?.debtTo) {
    const truthful = !hasVice(debtor, 'horses') && !hasVice(debtor, 'cards') && !hasTrait(debtor, 'Gambler');
    out.push({
      kind: 'debt', petitioner: debtor, rival: debtor.debtTo.rival, truthful,
      claim: 'the money went to his kid\'s hospital bill',
      title: `${debtor.firstName} owes the wrong people`,
      text: `${displayName(debtor)} owes $${debtor.debtTo.amount.toLocaleString('en-US')} to a ${s.rivals.find((r) => r.id === debtor.debtTo!.rival)?.shortName ?? 'rival'} shylock. "It was for my kid. Shriners Hospital in Philly. I had no choice."`,
      forLabel: 'Pay it off for him', againstLabel: 'His debt, his problem',
      forEffects: [{ type: 'money', amount: -debtor.debtTo.amount }, { type: 'debtTo', charId: debtor.id, clear: true }, { type: 'opinion', from: debtor.id, to: boss.id, amount: 20, reason: 'Paid my debt', decay: 1 }],
      againstEffects: [{ type: 'opinion', from: debtor.id, to: boss.id, amount: -8, reason: 'Left me to the shylocks', decay: 1 }],
    });
  }
  // A rival asks for a sit-down: peace — or a trap while they plan a blitz.
  const hostile = s.rivals.find((r) => r.kind === 'mob' && (r.feud || r.war) && s.characters[r.leaderId]?.alive);
  if (hostile) {
    const env = s.characters[hostile.leaderId];
    const planning = (p.legit[hostile.id] ?? 0) >= s.week || p.blitzes.some((b) => !b.stopped && b.attacker === hostile.id);
    out.push({
      kind: 'sitdown', petitioner: env, rival: hostile.id, truthful: !planning,
      claim: 'they want peace',
      title: `${hostile.shortName} asks for a sit-down`,
      text: `A message from ${displayName(env)}: a sit-down at a diner on the White Horse Pike, two men each, no guns. "Enough people have been buried."`,
      forLabel: 'Go to the sit-down', againstLabel: 'Send word: no',
      forEffects: [{ type: 'rivalOpinion', rival: hostile.id, amount: 15, reason: 'Came to the sit-down' }, { type: 'heat', bar: 'local', amount: -2 }],
      againstEffects: [{ type: 'rivalOpinion', rival: hostile.id, amount: -8, reason: 'Refused to sit down' }],
    });
  }
  // A succession claim: someone of the house says the old man promised him the chair.
  const claimant = Object.values(s.characters).find((c) => c.alive && c.dynasty && c.id !== boss.id && s.dyn?.people[c.id]?.claimant);
  if (claimant) {
    const lie = chance(p, lieChance(s, claimant) + 0.2);
    out.push({
      kind: 'claim', petitioner: claimant, truthful: !lie,
      claim: 'the old boss promised him the chair',
      title: `${claimant.firstName}'s claim`,
      text: `${displayName(claimant)} says the old man promised him the chair, in the hospital, with nobody else in the room. He wants it recognized in front of the capos.`,
      forLabel: 'Recognize his claim as heir', againstLabel: 'Deny it',
      forEffects: [{ type: 'opinion', from: claimant.id, to: boss.id, amount: 20, reason: 'Recognized my claim', decay: 1 }, { type: 'crewOpinion', amount: -3, reason: 'Gave in to a claimant' }],
      againstEffects: [{ type: 'opinion', from: claimant.id, to: boss.id, amount: -15, reason: 'Denied my claim', decay: 1 }],
    });
  }
  return out;
}

/** Turn a draft into a petition record and the scene. */
export function buildAudience(s: GameState, d: Draft): EventInstance {
  const p = pw(s);
  const rec: PetitionRec = { id: `pt${s.nextId++}`, kind: d.kind, petitionerId: d.petitioner.id, againstId: d.against?.id, claim: d.claim, truthful: d.truthful, week: s.week, status: 'open', rival: d.rival };
  p.petitions.push(rec);
  if (p.petitions.length > 30) p.petitions = p.petitions.slice(-30);
  p.stats.petitions++;
  const label = `The audience: ${d.title}`;
  const op = (ruling: 'for' | 'against' | 'investigate' | 'dismiss') => ({ type: 'power', op: { op: 'petition', id: rec.id, ruling }, label }) as const;
  const inv = investigateOdds(s, rec);
  const judge = s.characters[inv.judgeId];
  return {
    iid: `ev${s.nextId++}`, defId: `aud_${d.kind}`, week: s.week, mandatory: false, priority: 31,
    title: `The audience chamber: ${d.title}`,
    text: d.text,
    defaultChoiceId: 'dismiss', meta: { petition: rec.id, charId: d.petitioner.faction === 'player' ? d.petitioner.id : '' }, actors: [d.petitioner.id, ...(d.against ? [d.against.id] : [])],
    choices: [
      { id: 'for', label: d.forLabel, because: `ruled for ${d.petitioner.firstName}`, effects: [...d.forEffects.map((e) => ({ ...e, label })), op('for')] },
      { id: 'against', label: d.againstLabel, because: `ruled against ${d.petitioner.firstName}`, effects: [...d.againstEffects.map((e) => ({ ...e, label })), op('against')] },
      { id: 'investigate', label: judge.id === s.playerId ? 'Look into it yourself first' : `Have ${judge.firstName} look into it`, detail: `A week of questions. ${Math.round(inv.chance * 100)}% to catch a lie, if there is one.`, because: `had ${d.petitioner.firstName}'s story looked into`, effects: [op('investigate')] },
      { id: 'dismiss', label: 'Send him away', because: `sent ${d.petitioner.firstName} away`, effects: [op('dismiss'), { type: 'respect', amount: -1, label }] },
    ],
  };
}

/** The share of the audience slot that goes to a petitioner from the town. */
export const AUD_TOWN_SHARE = 0.3;

/** Weekly: maybe someone comes to the back room with a real problem. */
export function audienceWeek(s: GameState, force = false): EventInstance | undefined {
  const p = pw(s);
  if (!force && !chance(p, audienceChance(s))) return undefined;
  // The same slot, sometimes filled from the town's petitioners (petitions.ts): the widow, the barber, the
  // fisherman. No extra interruption: it takes the place of a draft. Holding court (force) with no draft
  // from the crew still gets somebody from the town at the door.
  if (petitionRoll(s, 'aud') < AUD_TOWN_SHARE) {
    const ev = buildTownPetition(s, undefined, 'audience');
    if (ev) return ev;
  }
  const ds = drafts(s);
  if (!ds.length) return force ? buildTownPetition(s, undefined, 'audience') : undefined;
  return buildAudience(s, pick(p, ds));
}

/** The follow-up a week after an investigation. */
export function buildFinding(s: GameState, rec: PetitionRec, caught: boolean): EventInstance {
  const c = s.characters[rec.petitionerId];
  const name = c ? displayName(c) : 'The petitioner';
  const label = `The audience: what ${c?.firstName ?? 'he'} said`;
  const op = (ruling: 'for' | 'against' | 'punish' | 'forgive' | 'dismiss') => ({ type: 'power', op: { op: 'petition', id: rec.id, ruling }, label }) as const;
  const text = caught
    ? `${name} lied: it is not true that ${rec.claim}. The consigliere has the names and the dates.`
    : rec.status === 'confirmed'
      ? `${name} told the truth: ${rec.claim}.`
      : `Nobody can say for sure whether ${rec.claim}. Whatever you decide, you decide blind.`;
  const choices = caught
    ? [
        { id: 'punish', label: `Punish ${c?.firstName ?? 'him'} for lying to you`, detail: 'A fine and a lesson. The crew hears.', because: `punished ${c?.firstName ?? 'a liar'} for lying`, effects: [op('punish'), { type: 'respect', amount: 2, label } as Effect] },
        { id: 'forgive', label: 'Forgive him, and let him know you know', detail: 'He owes you now.', because: `forgave ${c?.firstName ?? 'a liar'}`, effects: [op('forgive')] },
      ]
    : [
        { id: 'for', label: 'Rule for him', because: `ruled for ${c?.firstName ?? 'the petitioner'}`, effects: [op('for')] },
        { id: 'against', label: 'Rule against him', because: `ruled against ${c?.firstName ?? 'the petitioner'}`, effects: [op('against')] },
      ];
  return {
    iid: `ev${s.nextId++}`, defId: 'aud_finding', week: s.week, mandatory: false, priority: 40,
    title: caught ? 'A liar in the back room' : 'What the questions turned up',
    text, defaultChoiceId: choices[0].id, meta: { petition: rec.id }, actors: c ? [c.id] : undefined,
    choices,
  };
}
