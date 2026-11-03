import { brascoChecked, isBrasco, survivorFound } from './feds';
import { seasonMultiplier } from './calendar';
import { displayName, hasTrait, isFree, player } from './characters';
import { buildPlantFound } from './crewEvents';
import { ORDERS } from './events';
import { addEvidence, addStory, capoOf, obeyOdds, regime } from './hierarchy';
import type { Ctx } from './ledger';
import { addOpinion, getRelation, opinion } from './relations';
import { chance, pick, randInt } from './rng';
import { needsSanction, sanctioned } from './schemes';
import type { Effect, RivalId, ScheduledConsequence } from './types';

/**
 * Delayed consequences of crew decisions. Same contract as consequences.ts:
 * return a sentence and the effects; the caller labels them
 * "Because you … (wk N)".
 */

type Handler = (ctx: Ctx, sc: ScheduledConsequence) => { text: string; effects?: Effect[] } | undefined;

const r100 = (n: number) => Math.max(100, Math.round(n / 100) * 100);

/** Chance a man in custody turns: traits, loyalty, family and what they have on him. */
export function flipChance(ctx: Ctx, charId: string, help: number): number {
  const s = ctx.s;
  const c = s.characters[charId];
  if (!c) return 0;
  const k = capoOf(s, c);
  let p = 0.1 + (c.evidence ?? 0) / 220;
  if (hasTrait(c, 'Cowardly')) p += 0.22;
  if (hasTrait(c, 'Loyal-to-a-fault')) p -= 0.25;
  if (hasTrait(c, 'Honest')) p -= 0.05;
  if (hasTrait(c, 'Paranoid')) p += 0.05;
  if ((c.household?.kids.length ?? 0) > 0 && help < 1) p += 0.1;
  p -= help * 0.06;
  p -= opinion(s, c.id, s.playerId) / 300;
  if (k) p -= opinion(s, c.id, k.id) / 450;
  p -= (getRelation(s, c.id, s.playerId)?.fear ?? 0) / 400;
  if (c.informantFor === 'law') p += 0.4;
  return Math.max(0.02, Math.min(0.75, p));
}

export const CREW_HANDLERS: Record<string, Handler> = {
  crew_job: (ctx, sc) => {
    const s = ctx.s;
    const k = s.characters[String(sc.params.capo)];
    const rid = String(sc.params.rival) as RivalId;
    const r = s.rivals.find((x) => x.id === rid);
    const d = s.districts.find((x) => x.id === String(sc.params.district));
    const via = String(sc.params.via);
    const what = String(sc.params.racket);
    if (!r || !d || !k?.alive || k.faction !== 'player') return { text: `the play for ${r?.shortName ?? 'a rival'}'s ${what} fell apart before it started` };
    const crewMen = regime(s, k.id).filter((m) => isFree(s, m));
    let p = 0.42 + k.attributes.force / 300 + k.attributes.leadership / 400 + Math.min(4, crewMen.length) * 0.04 - r.muscle / 280;
    if (via === 'direct') p += 0.12;
    p = Math.max(0.15, Math.min(0.9, p));
    const ok = chance(s, p);
    const nm = k.firstName;
    if (ok) {
      const take = r100((1500 + randInt(s, 0, 2000)) * Math.max(0.6, seasonMultiplier(s.date) / 1.5));
      const effects: Effect[] = [
        { type: 'influence', district: d.id, faction: 'player', amount: randInt(s, 5, 8) },
        { type: 'rivalOpinion', rival: rid, amount: -8, reason: `Took our ${what}` },
        { type: 'respect', amount: 2 },
        { type: 'story', charId: k.id, text: `Took ${r.shortName}'s ${what} in ${d.name}.` },
      ];
      if (via === 'own') {
        effects.push({ type: 'wealth', charId: k.id, amount: take }, { type: 'money', amount: r100(take * 0.25) });
      } else {
        effects.push({ type: 'money', amount: take }, { type: 'opinion', from: k.id, to: s.playerId, amount: 6, reason: 'Made his play work', decay: 1 });
      }
      // A play handed down the chain can be carried out in the capo's own style.
      let extra = '';
      if (via !== 'direct' && (hasTrait(k, 'Hot-headed') || hasTrait(k, 'Cruel')) && chance(s, 0.5)) {
        effects.push({ type: 'heat', bar: 'local', amount: 5 }, { type: 'rivalOpinion', rival: rid, amount: -6, reason: 'Broke our people\'s hands' }, { type: 'evidence', charId: k.id, amount: 6 });
        effects.push({ type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 4, chance: 0.35, hint: `${r.shortName} will want blood`, params: { rival: rid } });
        extra = ` — and ${nm}'s guys broke the dealer's hands doing it`;
      } else if (via !== 'direct' && hasTrait(k, 'Greedy') && chance(s, 0.5)) {
        effects.push({ type: 'wealth', charId: k.id, amount: r100(take * 0.3) }, { type: 'money', amount: -r100(take * 0.3) });
        extra = `, though ${nm} kept a fat slice of the first week's take`;
      }
      return { text: `${displayName(k)}'s crew took ${r.shortName}'s ${what} in ${d.name}${extra}`, effects };
    }
    const effects: Effect[] = [
      { type: 'respect', amount: -1 },
      { type: 'opinion', from: k.id, to: s.playerId, amount: -3, reason: 'The play went bad', decay: 1 },
      { type: 'story', charId: k.id, text: `His play for ${r.shortName}'s ${what} went bad.` },
      { type: 'heat', bar: 'local', amount: 3 },
    ];
    const victim = crewMen.length ? pick(s, crewMen) : undefined;
    if (victim) {
      if (chance(s, 0.5)) effects.push({ type: 'imprison', charId: victim.id, weeks: randInt(s, 6, 16) }, { type: 'evidence', charId: victim.id, amount: 10 });
      else effects.push({ type: 'health', charId: victim.id, amount: -20 });
    }
    return { text: `${displayName(k)}'s play for ${r.shortName}'s ${what} went bad${victim ? `; ${victim.firstName} ${victim.lastName} ${effects.some((e) => e.type === 'imprison') ? 'was arrested' : 'was beaten badly'}` : ''}`, effects };
  },
  crew_bar_opens: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    const d = s.districts.filter((x) => (x.influence.player ?? 0) >= 20)[0] ?? s.districts[0];
    const b = { id: '', name: c ? `${c.lastName}'s Tap Room` : 'The corner tap room', kind: 'bar' as const, districtId: d.id, owner: 'player' as const, weeklyBase: 150, upkeep: 50, heat: 0.05, category: 'front' as const, staffIds: [], cost: 5000 };
    return { text: `${b.name} opened under the family`, effects: [{ type: 'addBusiness', business: b }] };
  },
  goes_rogue: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    const t = s.characters[String(sc.params.target)];
    if (!c?.alive || c.faction !== 'player' || !isFree(s, c) || !t?.alive) return undefined;
    const r = s.rivals.find((x) => x.id === t.faction);
    const made = needsSanction(s, t) && !sanctioned(s, t.id);
    return {
      text: `${displayName(c)} did not wait: ${t.firstName} ${t.lastName} was shot outside a bar on the Causeway`,
      effects: [
        { type: 'kill', charId: t.id, cause: `shot by ${displayName(c)} against the boss's word`, killer: 'player' },
        { type: 'heat', bar: 'local', amount: 7 },
        { type: 'evidence', charId: c.id, amount: 20 },
        { type: 'story', charId: c.id, text: `Killed ${t.firstName} ${t.lastName} against the boss's word.` },
        ...(r ? [{ type: 'rivalOpinion', rival: r.id, amount: -20, reason: `Killed ${t.firstName} ${t.lastName}` } as Effect] : []),
        ...(r && made && r.kind === 'mob' ? [{ type: 'feud', rival: r.id } as Effect] : []),
      ],
    };
  },
  loan_repaid: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    const amt = Number(sc.params.amount);
    if (!c?.alive || c.faction !== 'player') return { text: 'the loan will never be repaid' };
    if (c.wealth >= amt * 0.6) {
      const back = Math.min(c.wealth, Math.round(amt * 1.1));
      return { text: `${c.firstName} ${c.lastName} paid back his loan with a little extra`, effects: [{ type: 'money', amount: back }, { type: 'wealth', charId: c.id, amount: -back }, { type: 'opinion', from: c.id, to: s.playerId, amount: 4, reason: 'Square with the boss', decay: 1 }] };
    }
    return { text: `${c.firstName} ${c.lastName} could not pay back his loan`, effects: [{ type: 'story', charId: c.id, text: 'Still owes the boss.' }, { type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 6 }] };
  },
  goes_to_shylock: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    if (!c?.alive || c.faction !== 'player' || c.debtTo) return undefined;
    const rs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
    if (!rs.length) return undefined;
    const r = pick(s, rs);
    c.debtTo = { rival: r.id, amount: Number(sc.params.amount) || 1500, week: s.week };
    return { text: `${c.firstName} ${c.lastName} borrowed from a ${r.shortName} shylock instead`, effects: [{ type: 'story', charId: c.id, text: `Borrowed from ${r.name} when the boss said no.` }] };
  },
  stand_up: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    if (!c?.alive || c.faction !== 'player') return undefined;
    const p = flipChance(ctx, c.id, Number(sc.params.help));
    if (chance(s, p)) {
      return { text: `${displayName(c)} could not do the time: he is talking to the Prosecutor`, effects: [{ type: 'flip', charId: c.id }] };
    }
    const k = capoOf(s, c);
    return {
      text: `${displayName(c)} stood up: he told the detectives nothing`,
      effects: [
        { type: 'respect', amount: 2 },
        { type: 'opinion', from: c.id, to: s.playerId, amount: 6, reason: 'I stood up and the family knows it', decay: 1 },
        { type: 'crewOpinion', amount: 2, reason: `${c.firstName} stood up` },
        { type: 'story', charId: c.id, text: 'Stood up to the county detectives and said nothing.' },
        { type: 'bones', op: { op: 'pinch', charId: c.id } },
        ...(k ? [{ type: 'opinion', from: k.id, to: c.id, amount: 10, reason: 'Stood up like a man', decay: 1 } as Effect] : []),
      ],
    };
  },
  wife_to_cops: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    if (!c?.alive || c.faction !== 'player') return undefined;
    return { text: `${c.household?.wife ?? 'His wife'} ${c.lastName} told a county detective what she knew`, effects: [{ type: 'evidence', charId: c.id, amount: 15 }, { type: 'evidence', charId: s.playerId, amount: 4 }, { type: 'heat', bar: 'local', amount: 3 }] };
  },
  mistress_blowup: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    if (!c?.alive || c.faction !== 'player') return undefined;
    return { text: `${c.firstName} ${c.lastName}'s in-laws took his private life to Philadelphia`, effects: [{ type: 'heat', bar: 'family', amount: 4 }, { type: 'opinion', from: c.id, to: s.playerId, amount: -4, reason: 'Let my in-laws embarrass me', decay: 1 }, { type: 'story', charId: c.id, text: 'His in-laws went to Philadelphia about him.' }] };
  },
  retired_talks: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    if (!c?.alive || c.faction === 'player') return undefined;
    return { text: `${c.firstName} ${c.lastName}, retired in the sun, gave an interview to two FBI agents`, effects: [{ type: 'evidence', charId: s.playerId, amount: 6 }, { type: 'heat', bar: 'federal', amount: 4 }] };
  },
  double_game: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    const r = s.rivals.find((x) => x.id === String(sc.params.rival));
    if (!c?.alive || !r || !s.characters[r.leaderId]?.alive) return undefined;
    return { text: `${r.shortName} worked out that ${c.firstName} was playing them`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: -15, reason: `${c.firstName} played us` }, { type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 3, chance: 0.6, hint: `${r.shortName} answers`, params: { rival: r.id } }] };
  },
  faction_philly: (ctx, sc) => {
    const s = ctx.s;
    const f = s.factions.find((x) => x.id === String(sc.params.faction));
    if (!f) return undefined;
    f.stage = Math.max(f.stage ?? 0, 2);
    f.stageWeek = s.week;
    const L = s.characters[f.leaderId];
    return {
      text: `${L ? displayName(L) : 'The plotters'} went to Philadelphia behind your back to complain about how you run the family`,
      effects: [{ type: 'heat', bar: 'family', amount: 6 }, { type: 'rivalOpinion', rival: 'philly', amount: -8, reason: 'His own capos complain about him' }],
    };
  },
  background_result: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    if (!c?.alive || c.faction !== 'player') return undefined;
    c.checkedWeek = s.week;
    if (s.feds?.survivor?.id === c.id && !s.feds.survivor.found) {
      const ev = survivorFound(s);
      if (ev) s.eventQueue.push(ev);
      return { text: `the background check on ${c.firstName} ${c.lastName} turned up whose family he comes from` };
    }
    if (isBrasco(s, c.id)) {
      return brascoChecked(ctx, 0.2, true) ? { text: `the background check on ${c.firstName} ${c.lastName} turned up an uncle in ${s.feds?.brasco?.town ?? 'his home town'} who does not exist` } : { text: `the background check on ${c.firstName} ${c.lastName} came back clean, more or less`, effects: [{ type: 'story', charId: c.id, text: 'A background check came back clean.' }] };
    }
    if (c.informantFor) {
      s.eventQueue.push(buildPlantFound(s, c));
      return { text: `the background check on ${c.firstName} ${c.lastName} turned something up` };
    }
    return { text: `the background check on ${c.firstName} ${c.lastName} came back clean`, effects: [{ type: 'story', charId: c.id, text: 'A background check came back clean.' }] };
  },
  delegated_order: (ctx, sc) => {
    const s = ctx.s;
    const agent = s.characters[String(sc.params.agent)];
    const key = String(sc.params.key);
    const order = ORDERS.find((o) => o.key === key);
    if (!order) return undefined;
    if (!order.available(s)) return { text: `${agent ? displayName(agent) : 'Your man'} reported the order could not be carried out any more` };
    const ch = order.build(s);
    if (!agent?.alive || agent.faction !== 'player' || !isFree(s, agent)) {
      return { text: `nobody carried out the order (${ch.label.toLowerCase()}): the man you gave it to was gone` };
    }
    const odds = obeyOdds(s, agent);
    const roll = randInt(s, 0, 9999) / 10000;
    const boss = player(s);
    if (roll < odds.obey) {
      addEvidence(s, agent, 2);
      return { text: `${displayName(agent)} carried out your order: ${ch.label.toLowerCase()}`, effects: [...ch.effects, { type: 'evidence', charId: boss.id, amount: 1 }] };
    }
    if (roll < odds.obey + odds.distort) {
      addEvidence(s, agent, 3);
      if (hasTrait(agent, 'Hot-headed') || hasTrait(agent, 'Cruel')) {
        return { text: `${displayName(agent)} went further than you said (${ch.label.toLowerCase()}) — people got hurt`, effects: [...ch.effects, { type: 'heat', bar: 'local', amount: 5 }, { type: 'evidence', charId: agent.id, amount: 5 }] };
      }
      if (hasTrait(agent, 'Greedy')) {
        const fx = ch.effects.map((e) => (e.type === 'money' && e.amount > 0 ? { ...e, amount: Math.round(e.amount / 2) } : e));
        const kept = ch.effects.filter((e) => e.type === 'money' && e.amount > 0).reduce((a, e) => a + (e as { amount: number }).amount / 2, 0);
        return { text: `${displayName(agent)} carried out your order (${ch.label.toLowerCase()}) and kept half the money`, effects: [...fx, ...(kept > 0 ? [{ type: 'wealth', charId: agent.id, amount: Math.round(kept) } as Effect] : [])] };
      }
      const half = ch.effects.map((e) => (e.type === 'money' && e.amount > 0 ? { ...e, amount: Math.round(e.amount / 2) } : e.type === 'influence' ? { ...e, amount: Math.round(e.amount / 2) } : e));
      return { text: `${displayName(agent)} half-did what you asked (${ch.label.toLowerCase()})`, effects: half };
    }
    addOpinion(s, s.playerId, agent.id, 'Ignored my order', -10, 1);
    addStory(s, agent, `Sat on an order from the boss: ${ch.label.toLowerCase()}.`);
    return { text: `${displayName(agent)} never carried out your order (${ch.label.toLowerCase()})`, effects: ch.effects.filter((e) => e.type === 'money' && e.amount < 0) };
  },
};

