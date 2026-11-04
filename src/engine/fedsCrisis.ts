import { capos, crew, hasTrait, isFree, makeCharacter, player } from './characters';
import { applyEffects } from './effects';
import { addStory } from './hierarchy';
import type { Ctx } from './ledger';
import { addOpinion, getRelation, opinion } from './relations';
import { journal } from './journal';
import { registerDelivery, scheduled, type MomentView, type ScheduledItem } from './schedule';
import { grievanceLoad, publicHeir } from './heir';
import { chooseHeir, killCharacter } from './dynasty';
import { mindOf } from './minds/state';
import { remember } from './minds/memory';
import { bookOf } from './capos';
import { holder as seatHolder } from './council';
import type { Character, EventInstance, GameState } from './types';
import { ensureFeds, fr, bossHasFlipped, type Crisis, type FedsState, type HollowCrown, type PlotStance } from './fedsState';
import {
  bossCooperates, bossTurnsHook, chron, clamp, endHollow, mine, moment, momentOver, nm, pc, put,
} from './feds';

/**
 * THE DEAD MAN WALKING (imports/queue/DEAD_MAN_WALKING.md): the hollow crown's crisis, seven beats
 * on the running clock (schedule.ts), one a day, Tuesday to Sunday night:
 *
 *   1 the insult (reported Tuesday morning) · 2 the secret supper · 3 the missing envelopes ·
 *   4 the warning from a young soldier (who may be lying) · 5 the family divides (the underboss's own
 *   meetings) · 6 the plot collapses (or does not) · 7 the judgment: four folders.
 *
 * The conspirators are real men of the family. Each decides on his own (hidden) whether to join,
 * resist, inform, exploit or stay out of it, from his loyalty, respect, fear, ambition, greed,
 * grievances, courage, blood, federal exposure, secrecy and opportunism, with some noise. The network
 * recruits by itself between beats and reacts to what the boss does; he learns who is in it only by
 * finding out. A loyal underboss can collapse it early (the judgment comes the next day).
 *
 * The endings change the family for months: the purge (a vacuum, a third to a half of the income
 * gone while it is rebuilt, the Sons of the Fallen, the capo you created), mercy (DEAD MAN WALKING:
 * light envelopes, ignored orders, a second invitation in three months where the underboss may not
 * step in; redeemed by winning the capos back), retirement (the succession, and the old man's kind of
 * retirement; his son comes to see him), and the government (part 3: the boss's deal, and the New Name).
 * Monday cannot hold a moment (the turn lands it), so Monday's insult is reported Tuesday.
 */

const BEATS: { day: number; hour: number }[] = [
  { day: 1, hour: 10 }, { day: 2, hour: 22 }, { day: 3, hour: 11 }, { day: 4, hour: 23 }, { day: 5, hour: 16 }, { day: 6, hour: 3 }, { day: 6, hour: 21 },
];

const PLACES = ['the Shamrock', 'Gus\'s supper club in North Wildwood', 'the Bel Air lounge', 'a clam house on the Rio Grande road'];

/* ------------------------------------------------------------------ */
/* The hidden network                                                   */
/* ------------------------------------------------------------------ */

/** What one man decides when the plot comes to him (hidden). Scores and the winner. */
export function plotScores(s: GameState, c: Character, lead: Character, noise: () => number): Record<PlotStance, number> {
  const loyal = opinion(s, c.id, s.playerId) / 100;
  const toLead = opinion(s, c.id, lead.id) / 100;
  const fear = (getRelation(s, c.id, s.playerId)?.fear ?? 0) / 100;
  const amb = (hasTrait(c, 'Ambitious') ? 0.3 : 0) + (c.rank === 'capo' ? 0.1 : 0);
  const greed = (hasTrait(c, 'Greedy') ? 0.25 : 0) + (c.debtTo ? 0.2 : 0);
  const griev = Math.min(0.4, grievanceLoad(s, c) * 0.05);
  const courage = hasTrait(c, 'Cowardly') ? -0.2 : hasTrait(c, 'Hot-headed') ? 0.1 : 0;
  const blood = c.dynasty ? 0.5 : 0;
  const kinOfLead = c.lastName === lead.lastName || c.capoId === lead.id ? 0.2 : 0;
  const exposure = (c.evidence ?? 0) >= 40 ? 0.15 : 0;
  const leaky = hasTrait(c, 'Drinker') ? 0.1 : 0;
  const opp = hasTrait(c, 'Ambitious') && hasTrait(c, 'Greedy') ? 0.2 : 0;
  return {
    join: 0.15 + toLead * 0.5 - loyal * 0.6 - fear * 0.3 + amb + greed + griev + courage * 0.5 + kinOfLead - blood + noise() * 0.25,
    resist: loyal * 0.7 + (hasTrait(c, 'Loyal-to-a-fault') ? 0.4 : 0) + (hasTrait(c, 'Honest') ? 0.1 : 0) + blood + noise() * 0.25,
    inform: loyal * 0.4 + (hasTrait(c, 'Honest') ? 0.15 : 0) + leaky + exposure + noise() * 0.25 - 0.05,
    exploit: greed + amb * 0.8 + opp - 0.2 + noise() * 0.25,
    neutral: 0.3 + (hasTrait(c, 'Cowardly') ? 0.2 : 0) + noise() * 0.25,
  };
}

function decide(sc: Record<PlotStance, number>): PlotStance {
  return (Object.entries(sc) as [PlotStance, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

function weightOf(s: GameState, id: string): number {
  return s.characters[id]?.rank === 'capo' ? 3 : 1;
}

function strengthOf(s: GameState, C: Crisis): number {
  return Math.max(0, 3 - (C.drag ?? 0)) + Object.entries(C.st).filter(([, v]) => v === 'join').reduce((a, [id]) => a + weightOf(s, id), 0);
}

/** Between beats the plot recruits on its own: the undecided are asked again; the informers talk. */
function recruitRound(s: GameState, C: Crisis, F: FedsState, push = 0): string[] {
  const lead = s.characters[C.leadId];
  const out: string[] = [];
  if (!lead?.alive) return out;
  for (const [id, v] of Object.entries(C.st)) {
    const c = s.characters[id];
    if (!c?.alive || c.faction !== 'player') { delete C.st[id]; continue; }
    if ((v === 'neutral' || v === 'exploit') && fr(F) < (0.12 + push + C.strength / 80) * retributionDeters(s)) { C.st[id] = 'join'; out.push(id); }
    else if (v === 'join' && fr(F) < 0.05 + C.exposure / 60) C.st[id] = 'neutral';
    if (C.st[id] === 'inform' && fr(F) < 0.35) C.exposure += 1;
  }
  C.strength = strengthOf(s, C);
  return out;
}

/** The seven days begin (the coming week): the leader, the underboss, every man's hidden choice. */
export function startCrisis(ctx: Ctx, F: FedsState, H: HollowCrown, second = false): void {
  const s = ctx.s;
  const lead = H.leadId ? s.characters[H.leadId] : undefined;
  if (!lead?.alive) return;
  const ub = crew(s).find((c) => c.rank === 'underboss' && isFree(s, c));
  const heir = publicHeir(s);
  let ubSt: Crisis['ub'] = 'wavering';
  if (ub) {
    const op = opinion(s, ub.id, s.playerId);
    const hatesHeir = heir && heir.id !== ub.id ? opinion(s, ub.id, heir.id) < -10 : false;
    ubSt = op >= 35 && !hatesHeir ? 'loyal' : hasTrait(ub, 'Ambitious') && op < 10 ? 'rival' : 'wavering';
    if (second && ubSt === 'loyal' && fr(F) < 0.5) ubSt = 'wavering';
  }
  const pool = crew(s).filter((c) => c.id !== lead.id && c.id !== ub?.id && isFree(s, c) && F.brasco?.id !== c.id)
    .sort((a, b) => (a.rank === 'capo' ? 0 : 1) - (b.rank === 'capo' ? 0 : 1) || a.id.localeCompare(b.id)).slice(0, 16);
  const st: Record<string, PlotStance> = {};
  for (const c of pool) st[c.id] = decide(plotScores(s, c, lead, () => fr(F) - 0.5));
  const C: Crisis = { w: s.week + 1, leadId: lead.id, ...(ub ? { ubId: ub.id } : {}), ub: ubSt, st, known: [lead.id], suspected: [], strength: 0, exposure: 0, guard: 0, drag: 0, beat: 0, short: 0, ...(second ? { second: 1 as const } : {}) };
  C.strength = strengthOf(s, C);
  H.crisis = C;
  F.stats.crises++;
  for (let i = 0; i < BEATS.length; i++) put(s, 'feds_dmw', C.w, BEATS[i].day, BEATS[i].hour, { beat: i + 1, w: C.w });
}

/* ------------------------------------------------------------------ */
/* The beats                                                            */
/* ------------------------------------------------------------------ */

function crisisOf(s: GameState, it: ScheduledItem): Crisis | undefined {
  const C = s.feds?.hollow?.crisis;
  if (!C || C.w !== it.payload.w || C.done === 'judged' || C.done === 'killed' || !player(s)?.alive) return undefined;
  return C;
}

function joiners(C: Crisis): string[] { return Object.entries(C.st).filter(([, v]) => v === 'join').map(([id]) => id); }
function byStance(C: Crisis, v: PlotStance): string[] { return Object.entries(C.st).filter(([, x]) => x === v).map(([id]) => id); }

function knowLine(s: GameState, C: Crisis): string {
  const k = C.known.filter((id) => s.characters[id]?.alive).map((id) => nm(s.characters[id]));
  const sus = C.suspected.filter((id) => !C.known.includes(id) && s.characters[id]?.alive).map((id) => nm(s.characters[id]));
  return `You know: ${k.join(', ') || 'nobody for sure'}.${sus.length ? ` You suspect: ${sus.join(', ')}.` : ''}`;
}

function v(_s: GameState, it: ScheduledItem, title: string, text: string, options: MomentView['options'], def: string): MomentView {
  const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const h = it.h;
  return { id: `sched:${it.id}`, title, when: `${DAY[it.d]}, ${h === 0 ? 'midnight' : h < 12 ? `${h} a.m.` : h === 12 ? 'noon' : `${h - 12} p.m.`}`, warned: true, text, options, def };
}

function swayOdds(s: GameState, c: Character): number {
  return clamp(0.4 + s.respect / 250 + (getRelation(s, c.id, s.playerId)?.fear ?? 0) / 300 - (hasTrait(c, 'Ambitious') ? 0.1 : 0), 0.15, 0.85);
}

function dmwView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const C = crisisOf(s, it);
  if (!C) return undefined;
  const beat = Number(it.payload.beat);
  if (beat <= C.beat && beat !== 7) return undefined;
  if (C.done === 'early' && beat < 7) return undefined;
  if (C.done === 'foiled' && beat === 6) return undefined;
  const lead = s.characters[C.leadId];
  const ub = C.ubId ? s.characters[C.ubId] : undefined;
  if (!mine(s, lead) && beat < 6) return undefined;
  const can = (n: number) => (s.money >= n ? undefined : `Needs $${n.toLocaleString('en-US')}`);
  switch (beat) {
    case 1: {
      const n = 4 + Math.floor(Object.keys(C.st).length / 3);
      return v(s, it, 'Day 1: the insult', `${ub ? nm(ub) : 'Your consigliere'} comes in with the coffee. Last night at ${PLACES[C.w % PLACES.length]}, ${nm(lead)} held court in front of ${n} soldiers: the old days were real, he said, and what sits in the chair now is a good suit and a last name. One of them laughed. One agreed. The rest looked at their plates. By breakfast the whole island has it, and ${lead.firstName} is waiting to see what you do.`, [
        { id: 'summon', label: `Summon ${lead.firstName}; settle it privately`, hint: 'He may back down — or recruit faster because he is afraid', odds: swayOdds(s, lead) },
        { id: 'public', label: 'Dress him down at the Saturday table, in front of everyone', hint: 'Respect if it lands; it pushes the fence-sitters', odds: clamp(0.45 + s.respect / 300, 0.2, 0.8) },
        { id: 'buy', label: `Give ${lead.firstName} a bigger piece (−$2,000)`, hint: 'He may be satisfied. Or learn that pressure works', odds: 0.5, blocked: can(2000) },
        { id: 'quiet', label: `Have ${ub ? ub.firstName : 'someone'} find out who laughed, quietly`, hint: 'Names before they commit', odds: C.ub === 'loyal' ? 0.65 : 0.35 },
        { id: 'ignore', label: 'Ignore it', hint: 'Talk is talk. He will take it as fear', odds: 1 },
      ], 'quiet');
    }
    case 2: {
      const target = byStance(C, 'neutral').concat(byStance(C, 'exploit')).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive)[0];
      return v(s, it, 'Day 2: the secret supper', `${lead.firstName} booked the back room at ${PLACES[(C.w + 1) % PLACES.length]}. Who sat down, nobody will say. The word is that promises were made: better corners, a bigger end, a new chair at the head of the table. Men are being asked, one at a time, whether they are with the family's future or with you. ${knowLine(s, C)}`, [
        { id: 'tail', label: 'Put a man outside the restaurant (−$400)', hint: 'Faces, plates, who left with whom', odds: clamp(0.5 + (hasTrait(player(s), 'Paranoid') ? 0.15 : 0), 0.2, 0.8), blocked: can(400) },
        ...(target ? [{ id: 'counter', label: `Take ${nm(target)} to dinner yourself`, hint: 'Get to him before they do', odds: clamp(0.4 + opinion(s, target.id, s.playerId) / 200 + (hasTrait(target, 'Greedy') ? 0.1 : 0), 0.15, 0.85) }] : []),
        { id: 'nothing', label: 'Let them eat', hint: 'The plot grows on its own', odds: 1 },
      ], 'tail');
    }
    case 3: {
      const exp = 6000 + Object.keys(C.st).length * 600;
      const short = Math.round((joiners(C).length * 900 + C.strength * 150) / 100) * 100;
      return v(s, it, 'Day 3: the missing envelopes', `The weekly count at the office. You expected about $${exp.toLocaleString('en-US')}; ${ub ? ub.firstName : 'the count'} brings $${(exp - short).toLocaleString('en-US')}. Business is slow, three capos say. A soldier you trust says ${lead.firstName} has been collecting extra on his corners without asking anybody. $${short.toLocaleString('en-US')} is buying something — loyalty, guns, or just a boat. ${knowLine(s, C)}`, [
        { id: 'audit', label: 'A quiet audit of the books (−$500)', hint: 'Evidence before accusations', odds: 0.6, blocked: can(500) },
        { id: 'demand', label: `Demand the missing money from ${lead.firstName}`, hint: 'If he will not pay, the fence-sitters notice', odds: swayOdds(s, lead) },
        { id: 'cut', label: `Take a corner off ${lead.firstName}'s territory`, hint: 'Less money to buy men with; a sharper grudge', odds: 0.7 },
        { id: 'accuse', label: 'Accuse them in front of the family', hint: `${C.known.length >= 3 ? 'You have names' : 'Without proof, the neutral men will fear you are next'}`, odds: clamp(0.25 + C.known.length * 0.12, 0.15, 0.85) },
      ], 'audit');
    }
    case 4: {
      const w = C.warnerId ? s.characters[C.warnerId] : undefined;
      if (!w) return undefined;
      return v(s, it, 'Day 4: a meeting you were never meant to hear about', `${nm(w)}, one of the young ones, asks to see you alone at the car wash after closing. He was not supposed to be in the back hallway, he says. He heard ${lead.firstName}'s voice: you will not be at Sunday dinner. They mean this weekend. He looks scared. He also looks like a kid who has worked out what a story like this could be worth.`, [
        { id: 'trust', label: 'Believe him: double the men around you this weekend (−$800)', hint: 'If he is lying, you are guarding against ghosts', odds: 1, blocked: can(800) },
        { id: 'check', label: 'Have your consigliere check his story', hint: 'Is he honest, or stirring up a purge?', odds: 0.6 },
        { id: 'pay', label: 'Pay him for names (−$1,000)', hint: 'A kid who sells this would sell anything', odds: 0.5, blocked: can(1000) },
        { id: 'dismiss', label: 'Send him home', hint: 'Kids hear things', odds: 1 },
      ], 'check');
    }
    case 5: {
      const kid = player(s).childrenIds.map((id) => s.characters[id]).find((c) => c?.alive && c.gender === 'M');
      return v(s, it, 'Day 5: the family divides', `By Saturday nobody is sure whose orders to follow. An associate asks to change crews. A capo does not come to the weekly meeting. ${s.characters[player(s).spouseId ?? '']?.alive ? 'Your wife says there has been a car on the corner two nights running.' : 'There has been a car on your corner two nights running.'} ${kid ? `${kid.firstName} asks you at dinner if what they are saying is true.` : ''} And ${ub ? `${nm(ub)}, your underboss, has had meetings of his own this week` : 'you have no underboss to lean on'}. ${knowLine(s, C)}`, [
        ...(ub ? [
          { id: 'confront', label: `Ask ${ub.firstName} straight out where he stands`, hint: 'Men answer questions like that with their feet', odds: C.ub === 'loyal' ? 0.85 : C.ub === 'wavering' ? 0.5 : 0.2 },
          { id: 'win', label: `Promise ${ub.firstName} the chair after you (−$3,000)`, hint: 'Buy the man who decides which way this goes', odds: C.ub === 'rival' ? 0.3 : 0.65, blocked: can(3000) },
        ] : []),
        { id: 'guards', label: 'Sleep somewhere else, with two men in the hall (−$800)', hint: 'Harder to reach this weekend', odds: 1, blocked: can(800) },
        { id: 'wait', label: 'Go to Mass. Wait', hint: 'Let them show themselves', odds: 1 },
      ], 'guards');
    }
    case 6: {
      const p = foilOdds(s, C);
      return v(s, it, 'Day 6: they come for you', `Three in the morning. A car with its lights off at the end of the block, then a second one. ${C.guard > 0 ? 'Your men in the hall are awake.' : 'The house is dark.'} ${C.ub === 'loyal' && C.ubId ? `${s.characters[C.ubId]?.firstName} is already on the phone.` : ''}`, [
        ...(C.known.length > 1 ? [{ id: 'loyalists', label: 'Let your loyal men move on the ones you know, first', hint: 'Before they get to the door', odds: clamp(p + 0.08, 0.1, 0.97) }] : []),
        { id: 'stand', label: 'Wait for them in the kitchen with the lights off', hint: 'If you live, everyone hears how', odds: clamp(p - 0.05, 0.1, 0.95) },
        { id: 'slip', label: 'Out the back, across the yards, to your cousin\'s', hint: 'Live tonight; the plotters scatter', odds: clamp(p + 0.04, 0.1, 0.97) },
      ], 'slip');
    }
    case 7: {
      const sus = Object.values(C.st).filter((x) => x === 'neutral' || x === 'exploit').length;
      const flipped = bossHasFlipped(s);
      const caught = C.known.filter((id) => s.characters[id]?.alive);
      const rings = ringleaders(s, C).map((c) => c.firstName).join(' and ');
      return v(s, it, 'THE DON\'S RECKONING', `If you come for the Don, you better not miss — and they missed. Sunday night, the office. ${caught.length} men you can name agreed to your removal; ${sus} more were happy to wait and see. Every man out there is watching what kind of Don you are now. There is no clean way out of this.`, [
        { id: 'nomercy', label: `No Mercy: ${caught.length} names, and the network around them`, hint: 'Fear goes through the roof. A vacuum, a third to a half of the income gone while you rebuild, and vendettas', odds: 1 },
        { id: 'selective', label: `Selective Justice: ${rings || 'the ringleaders'} pay; the lesser men are spared`, hint: 'Every remaining capo must prove his loyalty in the weeks ahead, with odds', odds: 1 },
        { id: 'warning', label: 'The Last Warning: forgive them, publicly', hint: 'Some become truly loyal. The rest see a dead man walking', odds: 1 },
        { id: 'walk_retire', label: 'Walk Away: retire, and negotiate your exit', hint: 'Honor, a puppet, or a lonely beach house', odds: 1 },
        { id: 'walk_heir', label: 'Walk Away: hand the chair to your heir now', hint: 'The succession, while you can still choose it', odds: 1 },
        { id: 'walk_feds', label: 'Walk Away: call the Bureau', hint: 'The deal. You only get to do it once', odds: 1, ...(flipped ? { blocked: 'You already made your deal with them once' } : {}) },
      ], 'warning');
    }
  }
  return undefined;
}

/** The owner's scene: the consigliere comes into the office, and the Don stands up. Names from the real plot. */
export function reckoningScene(s: GameState, C: Crisis): string {
  const cons = seatHolder(s, 'consigliere');
  const lead = s.characters[C.leadId];
  const caps = joiners(C).map((id) => s.characters[id]).filter((c): c is Character => !!c && c.rank === 'capo');
  const second = caps[0] ?? joiners(C).map((id) => s.characters[id]).find((c) => !!c);
  const soldiers = joiners(C).filter((id) => id !== second?.id && s.characters[id]?.rank !== 'capo').length;
  const who = `${lead ? `${lead.firstName} ${lead.lastName}` : 'The ringleader'}${second ? ` and ${second.firstName} ${second.lastName}` : ''}${soldiers ? `, and ${soldiers} soldier${soldiers === 1 ? '' : 's'}` : ''}`;
  const text = `${cons ? cons.firstName : 'Your consigliere'} closes the office door behind him. "We got them, boss. ${who}. They were going to take you out Saturday night." — "They thought I was weak?" — "They thought you wouldn't have the stomach to do what needed to be done." — "Then they should've remembered one thing." The Don slowly stands up. "If you come for the Don, you better not miss."`;
  s.cutscenes = s.cutscenes.filter((c) => c.key !== 'dons_reckoning');
  s.cutscenes.push({ key: 'betrayal_confrontation', title: 'The Don\'s Reckoning', text, week: s.week });
  chron(s, `The plot against ${nm(player(s))} was foiled: ${who}.`, 'misc');
  return text;
}

function foilOdds(_s: GameState, C: Crisis): number {
  return clamp(0.55 + C.exposure * 0.03 + (C.ub === 'loyal' ? 0.2 : C.ub === 'rival' ? -0.15 : 0) + C.guard - C.strength * 0.015 + (C.second && C.ub !== 'loyal' ? -0.05 : 0), 0.25, 0.95);
}

function reveal(C: Crisis, ids: string[]): void {
  for (const id of ids) if (!C.known.includes(id)) C.known.push(id);
}

function early(s: GameState, C: Crisis, F: FedsState): boolean {
  // A loyal, able underboss collapses it before the weekend.
  if (C.ub !== 'loyal' || !C.ubId) return false;
  const ub = s.characters[C.ubId];
  if (!ub?.alive || fr(F) > 0.15 + C.exposure * 0.04 + (ub.attributes.leadership - 50) / 300) return false;
  C.done = 'early';
  reveal(C, joiners(C));
  return true;
}

function dmwAnswer(input: GameState, it: ScheduledItem, opt: string) {
  if (!input.feds?.hollow?.crisis) return momentOver(input, 'The plot');
  const beat = Number(it.payload.beat);
  return moment(input, it, opt, ['', 'The insult', 'The secret supper', 'The missing envelopes', 'The warning', 'The family divides', 'They come for you', 'The judgment'][beat] ?? 'The plot', (ctx, F) => {
    const s = ctx.s;
    const C = F.hollow!.crisis!;
    const view = dmwView(input, it);
    const o = view?.options.find((x) => x.id === opt && !x.blocked) ?? view?.options.find((x) => x.id === view.def)!;
    const lead = s.characters[C.leadId];
    const ub = C.ubId ? s.characters[C.ubId] : undefined;
    const ok = fr(F) < (o?.odds ?? 1);
    const label = 'The plot';
    C.beat = beat;
    const pay = (n: number) => applyEffects(ctx, [{ type: 'money', amount: -n }], { label, because: o.label.toLowerCase(), category: 'event' });
    const mem = (id: string, t: string, val: number) => { const m = mindOf(s, id); if (m) remember(m, { w: s.week, k: val < 0 ? 'slight' : 'favor', who: s.playerId, t, v: val }); };
    let line = '';
    const leads: string[] = [];
    const id = o?.id ?? 'ignore';
    switch (beat) {
      case 1:
        if (id === 'summon') {
          if (ok) { C.drag = (C.drag ?? 0) + 2; addOpinion(s, lead.id, s.playerId, 'The boss called me in and I backed down', -5, 1); line = `${lead.firstName} kissed your cheek and said it was the wine talking. Then he went out and counted his friends twice.`; recruitRound(s, C, F, 0.05); }
          else { recruitRound(s, C, F, 0.15); line = `${lead.firstName} apologized like a man reading a menu. He left scared — and men who are scared move faster.`; }
        } else if (id === 'public') {
          if (ok) { applyEffects(ctx, [{ type: 'respect', amount: 3 }], { label, because: `dressed ${lead.firstName} down in front of the family`, category: 'event' }); line = `You said it once, quietly, at the head of the table. ${lead.firstName} went red. Nobody laughed this time.`; }
          else { applyEffects(ctx, [{ type: 'respect', amount: -2 }], { label, because: `tried to dress ${lead.firstName} down`, category: 'event' }); line = `${lead.firstName} answered you back, and two men nodded.`; }
          mem(lead.id, 'Humiliated me at the Saturday table', -15);
          recruitRound(s, C, F, 0.12);
        } else if (id === 'buy') {
          pay(2000);
          if (ok) { C.st[C.leadId] = 'neutral'; C.drag = (C.drag ?? 0) + 3; line = `${lead.firstName} took it, and for a day he is quieter. Some of his own men think he sold them cheap.`; for (const j of joiners(C).slice(0, 2)) if (fr(F) < 0.5) C.st[j] = 'neutral'; }
          else { recruitRound(s, C, F, 0.1); line = `${lead.firstName} took the money and told the others: see, he pays when you push.`; }
        } else if (id === 'quiet') {
          if (ok) { const ins = joiners(C).slice(0, 2); reveal(C, ins); C.exposure += 2; line = ins.length ? `${ub?.firstName ?? 'Your man'} came back with names: ${ins.map((x) => nm(s.characters[x])).join(', ')}.` : 'Nobody laughed who matters, it turns out. Yet.'; }
          else { C.suspected.push(...Object.keys(C.st).filter((x) => C.st[x] !== 'join').slice(0, 1)); line = `${ub?.firstName ?? 'Your man'} came back with a name. You are not sure it is the right one.`; }
        } else { applyEffects(ctx, [{ type: 'respect', amount: -2 }], { label, because: 'ignored the insult', category: 'event' }); recruitRound(s, C, F, 0.1); line = `You let it go. ${lead.firstName} heard that you let it go.`; }
        break;
      case 2: {
        const got = recruitRound(s, C, F);
        if (id === 'tail') {
          pay(400);
          if (ok) { const ins = joiners(C).slice(0, 3); reveal(C, ins); C.exposure += 2; line = `Your man got faces: ${ins.map((x) => nm(s.characters[x])).join(', ') || 'only waiters'}.`; }
          else line = 'Your man got a parking ticket and nothing else.';
        } else if (id === 'counter') {
          const t = byStance(C, 'neutral').concat(byStance(C, 'exploit')).map((x) => s.characters[x]).find((c) => c?.alive) ?? s.characters[got[0] ?? ''];
          if (t && ok) {
            const turn = fr(F) < 0.4;
            C.st[t.id] = turn ? 'inform' : 'resist';
            if (turn) { C.exposure += 3; reveal(C, joiners(C).slice(0, 1)); }
            addOpinion(s, t.id, s.playerId, 'The boss took me to dinner himself when it mattered', 12, 1);
            line = turn ? `${t.firstName} will sit at their table and tell you what is said there.` : `${t.firstName} is with you. He said so twice.`;
          } else { if (t) C.st[t.id] = 'join'; line = `${t?.firstName ?? 'He'} ate your veal and went to their supper anyway.`; }
        } else line = 'They ate. They talked. They went home with more friends than they came with.';
        if (got.length) leads.push(`${got.length} more men went over this week`);
        break;
      }
      case 3: {
        C.short = Math.round((joiners(C).length * 900 + C.strength * 150) / 100) * 100;
        applyEffects(ctx, [{ type: 'money', amount: -C.short, category: 'street' }], { label: 'Missing envelopes', because: 'the plotters held back the money', category: 'street' });
        if (id === 'audit') {
          pay(500);
          if (ok) { reveal(C, joiners(C).filter((x) => s.characters[x]?.rank === 'capo').slice(0, 2)); C.exposure += 2; line = 'The books do not lie, only the men who keep them. You have it on paper.'; }
          else line = 'The books were cooked by somebody good.';
        } else if (id === 'demand') {
          if (ok) { applyEffects(ctx, [{ type: 'money', amount: Math.round(C.short / 2), category: 'street' }], { label, because: 'demanded the missing money', category: 'street' }); line = `${lead.firstName} sent half of it over with a note about slow business.`; }
          else { recruitRound(s, C, F, 0.12); line = `${lead.firstName} said he would see what he could do. Everybody saw that he did nothing.`; }
        } else if (id === 'cut') {
          C.drag = (C.drag ?? 0) + 2;
          mem(lead.id, 'Took a corner off me in the middle of all this', -12);
          line = `A corner of ${lead.firstName}'s comes to you. He has less to buy men with, and one more reason.`;
        } else {
          if (ok) { C.exposure += 3; reveal(C, joiners(C).slice(0, 2)); line = 'You named names in front of the family. The ones you named could not look at you.'; }
          else { for (const n2 of byStance(C, 'neutral').slice(0, 2)) C.st[n2] = 'join'; line = 'You named names without proof. Two men who were sitting it out decided they could be next.'; }
        }
        if (early(s, C, F)) { reckoningScene(s, C); put(s, 'feds_dmw', C.w, 4, 22, { beat: 7, w: C.w }); line += ` Then ${ub?.firstName ?? 'your underboss'} walked in: he had them, all of them. It is over before the weekend.`; F.stats.crisisEnds.early = (F.stats.crisisEnds.early ?? 0) + 1; }
        // The young soldier with the warning (tomorrow night).
        const young = crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && isFree(s, c) && c.id !== lead.id).sort((a, b) => a.birth.y > b.birth.y ? -1 : 1)[0];
        if (young) { C.warnerId = young.id; C.warnerTrue = (C.st[young.id] ?? 'resist') !== 'exploit' && !hasTrait(young, 'Greedy') && fr(F) < 0.8; }
        break;
      }
      case 4: {
        const w = s.characters[C.warnerId ?? '']!;
        recruitRound(s, C, F);
        if (id === 'trust') { pay(800); C.guard += C.warnerTrue ? 0.25 : 0.1; if (!C.warnerTrue) C.suspected.push(...byStance(C, 'resist').slice(0, 2)); line = C.warnerTrue ? 'Your men are on the stairs. If they come, they will find them.' : `You doubled the guard and started to look sideways at men who never did anything to you.`; }
        else if (id === 'check') {
          if (ok) { line = C.warnerTrue ? `${w.firstName} is telling the truth: his father ran numbers for you for twenty years.` : `${w.firstName} owes a shylock in Atlantic City. He was selling you a story.`; if (C.warnerTrue) { C.guard += 0.15; C.exposure += 2; } }
          else line = 'Your consigliere could not make up his mind about the kid.';
        } else if (id === 'pay') {
          pay(1000);
          if (ok && C.warnerTrue) { reveal(C, joiners(C).slice(0, 2)); line = 'He gave you two names for the money.'; } else { C.suspected.push(...byStance(C, 'neutral').slice(0, 1)); line = 'He gave you a name. You paid for it. You are not sure what you bought.'; }
        } else line = `${w.firstName} went home. ${C.warnerTrue ? 'He was right.' : 'Maybe it was nothing.'}`;
        if (C.warnerTrue && w) addOpinion(s, w.id, s.playerId, id === 'dismiss' ? 'The boss sent me home when I warned him' : 'The boss listened to me', id === 'dismiss' ? -8 : 8, 1);
        break;
      }
      case 5: {
        recruitRound(s, C, F);
        if (id === 'confront' && ub) {
          if (ok) { C.ub = 'loyal'; C.exposure += 2; line = `${ub.firstName} told you everything: he has been holding them off, buying time. He is with you.`; }
          else { if (C.ub === 'loyal') addOpinion(s, ub.id, s.playerId, 'The boss asked if I was a traitor', -10, 1); else C.ub = 'rival'; line = C.ub === 'rival' ? `${ub.firstName} said all the right words and none of them meant anything.` : `${ub.firstName} is with you, and insulted that you asked.`; }
        } else if (id === 'win' && ub) {
          pay(3000);
          if (ok) { C.ub = 'loyal'; addOpinion(s, ub.id, s.playerId, 'The boss promised me the chair', 15, 1); line = `${ub.firstName} shook on it. He will remember the promise.`; } else line = `${ub.firstName} took the money and said he would think about it.`;
        } else if (id === 'guards') { pay(800); C.guard += 0.15; line = 'A different bed, two men in the hall, the lights off by ten.'; }
        else line = 'You went to Mass. Half the men in the pews were watching you pray.';
        if (C.done !== 'early' && early(s, C, F)) { reckoningScene(s, C); put(s, 'feds_dmw', C.w, 6, 21, { beat: 7, w: C.w }); line += ` Late that night ${ub?.firstName ?? 'your underboss'} had them, before they could move.`; F.stats.crisisEnds.early = (F.stats.crisisEnds.early ?? 0) + 1; }
        break;
      }
      case 6: {
        if (ok) {
          C.done = 'foiled';
          reveal(C, joiners(C));
          if (id === 'slip') { for (const j of joiners(C)) if (fr(F) < 0.3) { const c = s.characters[j]; if (c?.alive) c.imprisonedUntil = undefined; } }
          if (id === 'stand') applyEffects(ctx, [{ type: 'respect', amount: 5 }], { label, because: 'waited for them in the dark', category: 'event' });
          line = `They came, and it went wrong for them. By dawn ${lead.firstName} had vanished and two of his men were sitting in the back of your cousin's bakery with their hands tied. ${C.known.length} men agreed to your removal. Many more wanted to see how it came out.`;
          F.stats.crisisEnds.foiled = (F.stats.crisisEnds.foiled ?? 0) + 1;
          reckoningScene(s, C);
          return { line, chance: o.odds, ok: true, extra: { h: 'IF YOU COME FOR THE DON, YOU BETTER NOT MISS', b: `Shots before dawn on a quiet Wildwood street. Police found shell casings and an abandoned car. On the boardwalk, they say ${lead.lastName}'s people missed.` } };
        }
        C.done = 'killed';
        endHollow(ctx, F, 'clipped');
        F.stats.crisisEnds.killed = (F.stats.crisisEnds.killed ?? 0) + 1;
        killCharacter(ctx, s.playerId, `murdered by his own capos (${nm(lead)}'s plot)`, 'none');
        return { line: 'They were better than you thought.', chance: o.odds, ok: false, extra: { h: 'REPUTED RACKETS FIGURE SLAIN AT HOME', b: `${nm(player(input))} was shot to death before dawn. Police believe it was an inside job.` } };
      }
      case 7:
        return judge(ctx, F, C, id);
    }
    C.strength = strengthOf(s, C);
    return { line, chance: o?.odds === 1 ? undefined : o?.odds, ok, leads, people: [lead.id] };
  });
}

/* ------------------------------------------------------------------ */
/* The judgment: four folders                                           */
/* ------------------------------------------------------------------ */

function judge(ctx: Ctx, F: FedsState, C: Crisis, id: string): { line: string; ok: boolean; extra?: { h: string; b: string }; leads?: string[]; people?: string[] } {
  const s = ctx.s;
  const H = F.hollow!;
  C.done = 'judged';
  F.stats.crisisEnds[id] = (F.stats.crisisEnds[id] ?? 0) + 1;
  const label = 'The Don\'s Reckoning';
  const named = [...new Set([C.leadId, ...C.known])].map((x) => s.characters[x]).filter((c): c is Character => mine(s, c));
  const witnesses = crew(s).filter((c) => !named.includes(c));
  const memAll = (t: string, val: number) => { for (const c of witnesses) { const m = mindOf(s, c.id); if (m) remember(m, { w: s.week, k: val < 0 ? 'fear' : 'favor', who: s.playerId, t, v: val }); } };
  if (id === 'nomercy' || id === 'brutal') {
    const killed: Character[] = [];
    for (const c of named) {
      if (c.rank === 'capo' || c.id === C.leadId) {
        applyEffects(ctx, [{ type: 'kill', charId: c.id, cause: 'killed in the purge after the plot against the boss', killer: 'player' }], { label, because: `purged ${c.firstName} ${c.lastName}`, category: 'event' });
        killed.push(c);
      } else {
        c.faction = 'none'; c.rank = 'civilian'; c.capoId = undefined;
        addStory(s, c, 'Thrown out of the family after the plot.');
        addOpinion(s, c.id, s.playerId, 'Threw me out after the plot', -50, 0);
      }
    }
    for (const c of crew(s)) { const r = getRelation(s, c.id, s.playerId); if (r) r.fear = Math.min(100, (r.fear ?? 0) + 25); }
    applyEffects(ctx, [{ type: 'respect', amount: 6 }, { type: 'heat', bar: 'local', amount: 15 }, { type: 'heat', bar: 'federal', amount: 12 }, { type: 'heat', bar: 'family', amount: 6 }, { type: 'crewOpinion', amount: -5, reason: 'The purge', traitMods: { Cruel: 5, 'Loyal-to-a-fault': 3, Honest: -4 } }], { label, because: 'purged the family', category: 'event' });
    for (const c of killed) for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
    F.rebuild = { until: s.week + 12, cut: clamp(0.3 + killed.length * 0.05, 0.3, 0.5) };
    for (const c of killed) F.seeds.push({ key: 'sons', at: s.week + 24 + Math.floor(fr(F) * 8), ids: [c.id] });
    F.seeds.push({ key: 'capo', at: s.week + 13, ids: [] });
    const scared = witnesses.find((c) => c.rank === 'soldier' && hasTrait(c, 'Cowardly')) ?? witnesses.find((c) => c.rank === 'soldier');
    const r = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
    if (scared && r) scared.courtedBy = { rival: r.id, week: s.week };
    const heir = publicHeir(s);
    if (heir && heir.id !== s.playerId) addOpinion(s, heir.id, s.playerId, hasTrait(heir, 'Cruel') || hasTrait(heir, 'Hot-headed') ? 'Showed me what it takes to keep the chair' : 'I saw what my father did that week', hasTrait(heir, 'Cruel') || hasTrait(heir, 'Hot-headed') ? 10 : -10, 0);
    memAll('The week of the empty chairs', -10);
    endHollow(ctx, F, 'purge');
    giveRetribution(ctx, F, C);
    plantSurvivor(s, F, killed);
    return {
      line: `The Night of the Empty Chairs: ${killed.length} gone, ${named.length - killed.length} thrown out. Nobody will challenge you this year. Half the rackets have nobody who knows how to run them.`, ok: true, people: named.map((c) => c.id),
      leads: ['Rebuilding: the family earns a third to a half less for three months', 'Some of the dead have sons'],
      extra: { h: 'WAVE OF DISAPPEARANCES ALARMS SHORE', b: `Police are investigating the disappearance of ${killed.length} men with reputed ties to local rackets.` },
    };
  }
  if (id === 'selective') return selective(ctx, F, C, named, witnesses);
  if (id === 'warning' || id === 'mercy') {
    const lead = s.characters[C.leadId];
    if (mine(s, lead)) {
      applyEffects(ctx, [{ type: 'rank', charId: lead.id, rank: 'soldier' }], { label, because: `stripped ${lead.firstName} and spared him`, category: 'event' });
      for (const d of s.districts) if (d.capoId === lead.id) d.capoId = undefined;
      addOpinion(s, lead.id, s.playerId, 'He spared me — and took everything', -10, 0);
    }
    // Forgiven in public: some of them mean it from now on.
    for (const c of named) if (c.id !== C.leadId) {
      const real = fr(F) < 0.35 + (hasTrait(c, 'Honest') ? 0.2 : 0) + (hasTrait(c, 'Loyal-to-a-fault') ? 0.2 : 0) - (hasTrait(c, 'Ambitious') ? 0.15 : 0);
      addOpinion(s, c.id, s.playerId, real ? 'He forgave me in front of everybody. I owe him my life' : 'The boss spared me after the plot', real ? 30 : 10, 0);
      if (real) addStory(s, c, 'Forgiven in public after the plot; loyal ever since.');
    }
    for (const c of crew(s)) { const r = getRelation(s, c.id, s.playerId); if (r) r.fear = Math.max(0, (r.fear ?? 0) - 15); }
    // Somebody is devoted for life: the man whose brother (or friend) was spared.
    const dev = witnesses.find((c) => C.st[c.id] === 'resist' || C.st[c.id] === 'inform');
    if (dev) { addOpinion(s, dev.id, s.playerId, 'You gave them a chance when the others wanted them buried', 25, 0); addStory(s, dev, 'Stayed with the boss because he showed mercy.'); }
    applyEffects(ctx, [{ type: 'respect', amount: -8 }], { label, because: 'showed mercy', category: 'event' });
    s.factions = s.factions.filter((f) => f.leaderId !== C.leadId);
    H.dmw = s.week;
    H.meter = Math.min(H.meter, 50);
    H.crisis = undefined;
    H.leadId = named.find((c) => c.id !== C.leadId && c.rank === 'capo')?.id ?? H.leadId;
    H.next = s.week + 3;
    F.seeds.push({ key: 'second', at: s.week + 12 + Math.floor(fr(F) * 3), ids: [] });
    memAll('The boss caught them and let them walk', -4);
    chron(s, `${nm(player(s))} spared the men who plotted against him. The street calls him a dead man walking.`, 'misc');
    return { line: 'You stripped them and let them live. The men who wanted blood went home and told their wives you are finished. A few went home and lit a candle for you.', ok: true, people: named.map((c) => c.id), leads: ['DEAD MAN WALKING: light envelopes, ignored orders, more challenges', 'Win the capos back one at a time to lift it'] };
  }
  if (id === 'retire' || id === 'walk_retire' || id === 'walk_heir') {
    const b = player(s);
    const res = chooseHeir(s, b);
    const heir = res.heir;
    if (!heir) {
      return { line: 'There is nobody to hand it to. You stay in the chair, and everyone knows you wanted out.', ok: false };
    }
    const op = opinion(s, heir.id, b.id);
    const kind: 'honorable' | 'puppet' | 'isolated' = id === 'walk_heir' ? 'honorable' : op >= 30 && s.respect >= 40 ? 'honorable' : C.ub === 'rival' || C.strength >= 10 ? 'puppet' : op >= 0 ? 'honorable' : 'isolated';
    F.retired = { id: b.id, kind, w: s.week };
    endHollow(ctx, F, 'stepped');
    applyEffects(ctx, [{ type: 'dyn', op: { op: 'abdicate' } }, { type: 'respect', amount: 3 }], { label, because: 'retired after the plot', category: 'event' });
    if (kind === 'isolated') b.wealth = Math.round(b.wealth * 0.6);
    addStory(s, b, kind === 'honorable' ? 'Retired with honor after the plot.' : kind === 'puppet' ? 'Retired; a figure at weddings, watched.' : 'Retired; his old friends stopped calling.');
    F.seeds.push({ key: 'father', at: s.week + 3, ids: [b.id] });
    return { line: `The last Sunday dinner. ${kind === 'honorable' ? 'They stood when you left the room.' : kind === 'puppet' ? 'They will keep you at the head of the table for the photographs.' : 'Nobody walked you to the car.'} The chair goes to ${nm(heir)}.`, ok: true, people: [heir.id] };
  }
  // The Bureau: the boss's deal (part 3), from here.
  const b = player(s);
  bossCooperates(ctx, 'heir');
  const heir = chooseHeir(s, b).heir;
  endHollow(ctx, F, 'federal');
  bossTurnsHook(ctx, b, heir ? 'heir' : 'witness', [`${b.firstName} ${b.lastName} walked into the federal building in Camden on a Monday morning with a lawyer and no hat. The family he built went on without him; his sons were asked about him for the rest of their lives.`]);
  if (heir) F.seeds.push({ key: 'newname', at: s.week + 40, ids: [b.id] });
  return { line: 'Monday morning, the federal building in Camden. You gave them everything. The family goes on without you, and it will never forgive you.', ok: true, extra: { h: 'RACKETS FIGURE SAID TO BE COOPERATING', b: 'Sources say a reputed shore rackets boss is cooperating with federal prosecutors.' } };
}

/** The ringleaders: the man who led it and the capo who stood next to him. */
function ringleaders(s: GameState, C: Crisis): Character[] {
  const lead = s.characters[C.leadId];
  const second = joiners(C).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive && c.faction === 'player').sort((a, b) => (b.rank === 'capo' ? 1 : 0) - (a.rank === 'capo' ? 1 : 0))[0];
  return [lead, second].filter((c): c is Character => !!c && mine(s, c));
}

/** The tests a spared family must pass: each capo left owes the boss proof, by a week. */
const TESTS = ['bring in an extra envelope from his corners', 'give up the names of anyone who still talks about the plot', 'take care of a debt to the family nobody else could collect', 'settle a beef with the Manno crew without blood'];

/** Selective Justice: the ringleaders pay, the lesser men are spared, and every capo must prove himself. */
function selective(ctx: Ctx, F: FedsState, C: Crisis, named: Character[], witnesses: Character[]): { line: string; ok: boolean; extra?: { h: string; b: string }; leads?: string[]; people?: string[] } {
  const s = ctx.s;
  const label = 'The Don\'s Reckoning';
  const rings = ringleaders(s, C);
  for (const c of rings) applyEffects(ctx, [{ type: 'kill', charId: c.id, cause: 'killed for leading the plot against the boss', killer: 'player' }], { label, because: `had ${c.firstName} ${c.lastName} killed for the plot`, category: 'event' });
  for (const c of rings) for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
  for (const c of named) if (!rings.includes(c)) addOpinion(s, c.id, s.playerId, 'The boss let the small men live', 12, 0);
  for (const c of crew(s)) { const r = getRelation(s, c.id, s.playerId); if (r) r.fear = Math.min(100, (r.fear ?? 0) + 12); }
  applyEffects(ctx, [{ type: 'respect', amount: 4 }, { type: 'heat', bar: 'local', amount: 8 }, { type: 'heat', bar: 'federal', amount: 5 }], { label, because: 'punished the ringleaders and spared the rest', category: 'event' });
  F.rebuild = { until: s.week + 6, cut: 0.15 };
  const ks = capos(s).filter((k) => isFree(s, k));
  ks.forEach((k, i) => F.tests.push({ capoId: k.id, due: s.week + 3 + i, what: TESTS[i % TESTS.length] }));
  for (const c of witnesses) { const m = mindOf(s, c.id); if (m) remember(m, { w: s.week, k: 'fear', who: s.playerId, t: `Saw ${rings.map((x) => x.firstName).join(' and ')} pay for the plot`, v: -4 }); }
  endHollow(ctx, F, 'selective');
  return {
    line: `${rings.map((c) => c.firstName).join(' and ') || 'The ringleaders'} did not come back from a ride to the Pines. The rest kissed your ring. Every capo you have left owes you proof, and you have told each of them what.`, ok: true, people: rings.map((c) => c.id),
    leads: ks.map((k) => `${k.firstName} must ${TESTS[ks.indexOf(k) % TESTS.length]}`).slice(0, 3),
    extra: { h: 'TWO MISSING IN SHORE RACKETS FEUD', b: `${rings.map((c) => nm(c)).join(' and ')} have not been seen since Sunday. Police suspect foul play.` },
  };
}

/** Odds a capo passes his loyalty test. */
export function testOdds(s: GameState, k: Character): number {
  return clamp(0.45 + opinion(s, k.id, s.playerId) / 200 + (getRelation(s, k.id, s.playerId)?.fear ?? 0) / 300 + (hasTrait(k, 'Loyal-to-a-fault') ? 0.15 : 0) - (hasTrait(k, 'Ambitious') ? 0.1 : 0), 0.15, 0.9);
}

/** REPUTATION OF RETRIBUTION: a ruthless or calculating Don becomes a legend; a reckless or wrathful one a terror. */
function giveRetribution(ctx: Ctx, F: FedsState, C: Crisis): void {
  const s = ctx.s;
  const b = player(s);
  const wild = hasTrait(b, 'Hot-headed') || hasTrait(b, 'Vengeful');
  const kind = wild && !hasTrait(b, 'Patient') ? 'terror' : 'legend';
  F.retribution = { since: s.week, kind, lead: nm(s.characters[C.leadId]), bossId: b.id };
  addStory(s, b, kind === 'legend' ? 'After the plot, a reputation: nobody comes for him twice.' : 'After the plot, a reputation: a man who kills first and counts later.');
  ctx.log.push(kind === 'legend' ? 'A REPUTATION OF RETRIBUTION: on the island they talk about what happened to the men who came for you. Nobody will try it lightly again.' : 'A REPUTATION OF RETRIBUTION: on the island they say you have lost your mind. Some of your best earners are quietly looking for the door.');
}

/** The one the purge missed: a son, a nephew or a protégé of a dead man, taken in. Hidden. */
function plantSurvivor(s: GameState, F: FedsState, killed: Character[]): void {
  const dead = killed[Math.floor(fr(F) * killed.length)];
  if (!dead || F.survivor) return;
  let c = dead.childrenIds.map((x) => s.characters[x]).find((k) => k?.alive && k.gender === 'M' && s.date.y - k.birth.y >= 18 && k.faction !== 'player');
  let tie: 'son' | 'nephew' | 'protege' = 'son';
  if (!c) {
    tie = fr(F) < 0.5 ? 'nephew' : 'protege';
    c = makeCharacter(s, { gender: 'M', age: 22 + Math.floor(fr(F) * 6), faction: 'none', ethnicity: dead.ethnicity, ...(tie === 'nephew' ? { lastName: dead.lastName === 'Russo' ? 'Russo' : dead.lastName } : {}), traits: ['Patient', 'Charming'] });
  }
  c.faction = 'player';
  c.rank = 'associate';
  c.capoId = capos(s).find((k) => isFree(s, k))?.id;
  c.traits = [...new Set([...c.traits.filter((x) => x !== 'Hot-headed'), 'Patient' as const])];
  addStory(s, c, 'Came to the family after the purge, asking for work. Never late, never short.');
  addOpinion(s, c.id, s.playerId, 'Gave me a chance when nobody else would', 20, 0);
  F.survivor = { id: c.id, of: dead.id, tie, since: s.week };
}

/** Weekly: the loyalty tests, the reputation, and the survivor's long wait. */
function afterWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  const b = player(s);
  // Selective Justice: each capo's proof comes due.
  for (const tst of F.tests.filter((x) => x.due <= s.week)) {
    const k = s.characters[tst.capoId];
    if (!mine(s, k)) continue;
    const p = testOdds(s, k);
    if (fr(F) < p) {
      applyEffects(ctx, [{ type: 'money', amount: 1000, category: 'kickup' }, { type: 'opinion', from: s.playerId, to: k.id, amount: 10, reason: 'Proved himself after the plot', decay: 1 }], { label: `${k.firstName}'s proof`, because: `${k.firstName} had to prove himself`, category: 'kickup' });
      ctx.log.push(`${nm(k)} did what you asked: he had to ${tst.what}. (${pc(p)}) He passed.`);
    } else {
      ctx.log.push(`${nm(k)} was asked to ${tst.what}, and did not. (${pc(p)})`);
      s.eventQueue.push(failedTest(s, k, tst.what));
    }
  }
  F.tests = F.tests.filter((x) => x.due > s.week);
  // The reputation: men remember, and say so.
  const R = F.retribution;
  if (R && R.bossId !== s.playerId) F.retribution = undefined;
  else if (R) {
    for (const c of crew(s)) { const r = getRelation(s, c.id, s.playerId); if (r && (r.fear ?? 0) < 30) r.fear = 30; }
    if (fr(F) < 0.08) {
      const k = capos(s).filter((x) => isFree(s, x))[Math.floor(fr(F) * capos(s).length)];
      if (k) {
        const lines = [
          `${k.firstName} had two drinks too many and somebody asked him if the boss is slipping. He said he still remembers how fast ${R.lead}'s crew was gone — a Sunday, and by Thursday nobody would say their names. He changed the subject.`,
          `A young fella asked ${k.firstName} what it would take to run the island. ${k.firstName} told him about ${R.lead}, and the empty chairs, and told him to finish his beer and go home.`,
        ];
        journal(s, { c: 'crew', t: `They still talk about ${R.lead}`, x: lines[Math.floor(fr(F) * lines.length)], src: 'feds', k: 'heard', p: [k.id] });
      }
    }
    if (R.kind === 'terror' && fr(F) < 0.05) {
      const earner = crew(s).filter((c) => (c.rank === 'associate' || c.rank === 'soldier') && isFree(s, c) && opinion(s, c.id, s.playerId) < 20).sort((a, c) => (c.lastEarn ?? 0) - (a.lastEarn ?? 0))[0];
      if (earner) { applyEffects(ctx, [{ type: 'retire', charId: earner.id }], { label: 'A reputation of retribution', because: 'the purge frightened the earners', category: 'event' }); ctx.log.push(`${nm(earner)}, one of your best earners, took his family to Florida. He did not say goodbye.`); }
      applyEffects(ctx, [{ type: 'heat', bar: 'family', amount: 2 }, { type: 'heat', bar: 'federal', amount: 2 }], { label: 'A reputation of retribution', because: 'Philadelphia and the Bureau are nervous about you', category: 'heat' });
    }
  }
  // The survivor: earns, rises, waits for the Don's weakest hour.
  const V = F.survivor;
  if (!V || V.moved) return;
  const c = s.characters[V.id];
  if (!c?.alive || c.faction !== 'player') { F.survivor = undefined; return; }
  if (V.found) return;
  const age = s.week - V.since;
  applyEffects(ctx, [{ type: 'money', amount: 200 + Math.floor(fr(F) * 300), category: 'street' }], { label: `${c.firstName}'s corner`, because: `${c.firstName} earns`, category: 'street' });
  if (age === 30 && c.rank === 'associate') applyEffects(ctx, [{ type: 'rank', charId: c.id, rank: 'soldier' }], { label: 'A rising man', because: `${c.firstName} earned his button`, category: 'event' });
  if (fr(F) < 0.03) journal(s, { c: 'crew', t: `Talk about ${c.firstName} ${c.lastName}`, x: `An old-timer at the Shamrock swears ${c.firstName} has ${nm(s.characters[V.of])}'s way of holding a cigarette. Probably nothing.`, src: 'feds', k: 'heard', p: [c.id] });
  const weak = b.health < 45 || s.wars.some((w) => w.score <= -25) || (F.hollow && !F.hollow.dmw) || s.playerId !== (F.retribution?.bossId ?? s.playerId);
  if (age >= 52 && weak && !scheduled(s).some((x) => x.kind === 'feds_survivor') && fr(F) < 0.35) {
    V.moved = s.week;
    put(s, 'feds_survivor', s.week + 1, 1 + Math.floor(fr(F) * 5), 23, {});
  }
}

function failedTest(s: GameState, k: Character, what: string): EventInstance {
  const label = `${k.firstName} failed his test`;
  return {
    iid: `ev${s.nextId++}`, defId: 'feds_test', week: s.week, mandatory: false, priority: 76, actors: [k.id], meta: { feds: 1, crew: 1, charId: k.id },
    title: `${k.firstName} did not deliver`, text: `After the plot you told ${nm(k)} to ${what}. He did not. He says he needs more time. Every capo who passed is watching.`, defaultChoiceId: 'chance',
    choices: [
      { id: 'chance', label: 'One more chance', detail: 'Patience; the others may read it as softness.', because: `gave ${k.firstName} one more chance`, effects: [{ type: 'respect', amount: -1, label }, { type: 'opinion', from: k.id, to: s.playerId, amount: 6, reason: 'The boss gave me another chance', decay: 1, label }] },
      { id: 'bust', label: 'Bust him down to soldier', detail: 'His corner goes to a man who delivered.', because: `busted ${k.firstName} down`, effects: [{ type: 'rank', charId: k.id, rank: 'soldier', label }, { type: 'opinion', from: k.id, to: s.playerId, amount: -20, reason: 'Busted me down after the plot', decay: 1, label }, { type: 'respect', amount: 2, label }] },
      { id: 'clip', label: `Have ${k.firstName} killed`, detail: 'Your explicit order. Nobody will fail you again — or nobody will stay.', because: `had ${k.firstName} killed for failing`, effects: [{ type: 'kill', charId: k.id, cause: 'killed for failing the boss after the plot', killer: 'player', label }, { type: 'crewOpinion', amount: -4, reason: `${k.firstName} was killed for failing a test`, label }, { type: 'heat', bar: 'local', amount: 6, label }] },
    ],
  };
}

function survivorView(s: GameState, it: ScheduledItem): MomentView | undefined {
  const V = s.feds?.survivor;
  const c = V ? s.characters[V.id] : undefined;
  const dead = V ? s.characters[V.of] : undefined;
  if (!V || !c?.alive || c.faction !== 'player' || !player(s)?.alive) return undefined;
  const guards = clamp(0.35 + s.respect / 300 + (hasTrait(player(s), 'Paranoid') ? 0.15 : 0), 0.2, 0.8);
  return v(s, it, 'The one you missed', `Eleven at night, the lot behind the Shamrock. ${nm(c)} is waiting by your car, the way he has waited by it a hundred times. Only tonight he is not smiling. ${dead ? `He is ${dead.firstName} ${dead.lastName}'s ${V.tie === 'son' ? 'son' : V.tie === 'nephew' ? 'nephew' : 'boy — the one ' + dead.firstName + ' raised'}.` : ''} The Don didn't miss either. He just didn't finish what he started.`, [
    { id: 'draw', label: 'Go for the gun under the seat', hint: 'You are older and slower. You are also you', odds: clamp(guards - 0.05, 0.15, 0.8) },
    { id: 'talk', label: `Say his father's name to him`, hint: 'Make him look you in the eye first', odds: clamp(0.3 + (hasTrait(player(s), 'Charming') ? 0.15 : 0), 0.15, 0.6) },
    { id: 'run', label: 'Back inside, through the kitchen', hint: 'Live tonight', odds: clamp(guards + 0.05, 0.2, 0.85) },
  ], 'run');
}

function survivorAnswer(input: GameState, it: ScheduledItem, opt: string) {
  return moment(input, it, opt, 'The one you missed', (ctx, F) => {
    const s = ctx.s;
    const V = F.survivor!;
    const c = s.characters[V.id];
    const view = survivorView(input, it);
    const o = view?.options.find((x) => x.id === opt) ?? view?.options.find((x) => x.id === 'run')!;
    const ok = fr(F) < o.odds;
    F.survivor = undefined;
    if (ok) {
      if (o.id === 'draw') applyEffects(ctx, [{ type: 'kill', charId: c.id, cause: 'shot by the boss in the lot behind the Shamrock', killer: 'player' }, { type: 'respect', amount: 4 }, { type: 'heat', bar: 'local', amount: 8 }], { label: 'The one you missed', because: `shot ${c.firstName} first`, category: 'event' });
      else { c.faction = 'none'; c.rank = 'civilian'; c.capoId = undefined; addOpinion(s, c.id, s.playerId, 'Looked me in the eye and said my father\'s name', 20, 0); }
      return { line: o.id === 'draw' ? `You were faster. ${c.firstName} lies on the gravel where you parked for twenty years.` : o.id === 'talk' ? `${c.firstName} lowered the gun. He walked out of the lot and out of Wildwood.` : 'You made the kitchen door. By morning he was gone, and so was every dollar on his corner.', chance: o.odds, ok: true, who: nm(c), people: [c.id] };
    }
    killCharacter(ctx, s.playerId, `shot by ${nm(c)}, whose ${V.tie === 'son' ? 'father' : V.tie === 'nephew' ? 'uncle' : 'mentor'} died in the purge`, 'none');
    return { line: 'He finished what you started.', chance: o.odds, ok: false, who: nm(c), people: [c.id], extra: { h: 'REPUTED BOSS SLAIN BEHIND TAVERN', b: `${nm(player(input))} was shot to death in a parking lot. Police are seeking a young associate.` } };
  });
}

/** The survivor found out (a background check, or the investigation): the boss decides. */
export function survivorFound(s: GameState): EventInstance | undefined {
  const V = s.feds?.survivor;
  const c = V ? s.characters[V.id] : undefined;
  if (!V || !c?.alive || V.found) return undefined;
  V.found = s.week;
  const dead = s.characters[V.of];
  const label = 'The one you missed';
  return {
    iid: `ev${s.nextId++}`, defId: 'feds_survivor_found', week: s.week, mandatory: true, priority: 82, actors: [c.id], meta: { feds: 1, crew: 1, charId: c.id },
    title: `${c.firstName} is ${dead?.lastName ?? 'one of'}'s ${V.tie === 'protege' ? 'boy' : V.tie}`, text: `${nm(c)} — never late, never short, the best young earner you have — is tied to ${dead ? nm(dead) : 'a man'} who died in the purge. He has been at your elbow for ${Math.round((s.week - V.since) / 4.3)} months.`, defaultChoiceId: 'away',
    choices: [
      { id: 'away', label: 'Send him away with money', detail: 'Out of Wildwood, alive.', because: `sent ${c.firstName} away`, effects: [{ type: 'money', amount: -2000, label }, { type: 'retire', charId: c.id, label }] },
      { id: 'keep', label: 'Keep him close, and watch him', detail: 'Maybe he only wanted work.', because: `kept ${c.firstName} close`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: 5, reason: 'The boss knows and kept me anyway', decay: 1, label }] },
      { id: 'clip', label: `Have ${c.firstName} killed`, detail: 'Your explicit order. Finish what you started.', because: `had ${c.firstName} killed`, effects: [{ type: 'kill', charId: c.id, cause: 'killed when the boss learned whose son he was', killer: 'player', label }, { type: 'heat', bar: 'local', amount: 5, label }] },
    ],
  };
}

/** The reputation deters plots (feds.ts reads it). */
export function retributionDeters(s: GameState): number {
  const R = s.feds?.retribution;
  return R && R.bossId === s.playerId ? (R.kind === 'legend' ? 0.35 : 0.6) : 1;
}

/* ------------------------------------------------------------------ */
/* The weeks after                                                       */
/* ------------------------------------------------------------------ */

/** Weekly: the purge's rebuilding; a crisis left hanging at the turn is closed out. */
export function crisisWeek(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  afterWeek(ctx, F);
  if (F.rebuild) {
    if (F.rebuild.until <= s.week) { F.rebuild = undefined; ctx.log.push('The family has found its feet again after the purge.'); }
    else {
      const h = s.incomeHistory.slice(-5, -1);
      const avg = h.length ? h.reduce((a, x) => a + x, 0) / h.length : 2000;
      const loss = Math.round(Math.max(500, avg) * F.rebuild.cut / 10) * 10;
      applyEffects(ctx, [{ type: 'money', amount: -loss, category: 'street' }], { label: 'Rebuilding after the purge: nobody who knows the rackets', because: 'purged the family', category: 'street' });
    }
  }
  const C = F.hollow?.crisis;
  // A crisis whose week passed without a judgment (the clock skipped it): mercy by default.
  if (C && C.w < s.week && C.done !== 'judged' && C.done !== 'killed' && player(s)?.alive) {
    judge(ctx, F, C, 'warning');
  }
}

/** Follow-ups planted by the endings. */
export function crisisSeeds(ctx: Ctx, F: FedsState): void {
  const s = ctx.s;
  const due = F.seeds.filter((x) => x.at <= s.week);
  if (!due.length) return;
  F.seeds = F.seeds.filter((x) => x.at > s.week);
  for (const sd of due.slice(0, 1)) {
    const ev = seedEvent(ctx, F, sd.key, sd.ids);
    if (ev) { s.eventQueue.push(ev); F.stats.seedsFired++; }
  }
  // One a week: the rest wait.
  for (const sd of due.slice(1)) F.seeds.push({ ...sd, at: s.week + 1 });
}

function seedEvent(ctx: Ctx, F: FedsState, key: string, ids: string[]): EventInstance | undefined {
  const s = ctx.s;
  const b = player(s);
  const base = (defId: string, title: string, text: string, choices: EventInstance['choices'], def: string, actors: string[]): EventInstance => ({ iid: `ev${s.nextId++}`, defId, title, text, week: s.week, choices, defaultChoiceId: def, mandatory: false, priority: 74, actors, meta: { feds: 1, crew: 1, ...(actors[0] ? { charId: actors[0] } : {}) } });
  if (key === 'sons') {
    const dead = s.characters[ids[0]];
    if (!dead) return undefined;
    let son = dead.childrenIds.map((x) => s.characters[x]).find((c) => c?.alive && c.gender === 'M' && s.date.y - c.birth.y >= 18);
    if (!son) { son = makeCharacter(s, { lastName: dead.lastName, age: 20 + Math.floor(fr(F) * 8), gender: 'M', faction: 'none', ethnicity: dead.ethnicity }); son.fatherId = dead.id; dead.childrenIds.push(son.id); }
    addOpinion(s, son.id, b.id, `Killed my father, ${dead.firstName}`, -70, 0);
    const label = 'The Sons of the Fallen';
    return base('feds_sons', label, `A note under the office door, in a young man's careful hand. ${nm(son)} has not forgotten the week his father, ${dead.firstName}, did not come home: who gave the order, who took the money, who took the corners. He has been asking around. He has been seen with people who do not like you.`, [
      { id: 'meet', label: `Sit down with ${son.firstName}: his father's share, and a job`, detail: 'Buy the grudge off before it grows. It may not be for sale.', because: `sat down with ${son.firstName}`, effects: [{ type: 'money', amount: -3000, label }, { type: 'wealth', charId: son.id, amount: 3000, label }, { type: 'opinion', from: son.id, to: b.id, amount: 30, reason: 'The man who killed my father paid his debt', decay: 1, label }] },
      { id: 'watch', label: 'Have him watched', detail: 'Patience. He is young.', because: `had ${son.firstName} watched`, effects: [{ type: 'money', amount: -500, label }, { type: 'story', charId: son.id, text: 'Watched by the family since his father died.', label }] },
      { id: 'clip', label: `Have ${son.firstName} killed`, detail: 'Your explicit order. Some families will never be finished with you.', because: `had ${son.firstName} killed`, effects: [{ type: 'kill', charId: son.id, cause: 'shot; his father died in the purge', killer: 'player', label }, { type: 'heat', bar: 'local', amount: 8, label }, { type: 'crewOpinion', amount: -3, reason: 'Killed a dead man\'s son', label }] },
    ], 'watch', [son.id]);
  }
  if (key === 'capo') {
    const k = capos(s).filter((c) => isFree(s, c)).sort((a, c) => (c.birth.y - a.birth.y) || ((bookOf(s, c.id)?.take.at(-1) ?? 0) - (bookOf(s, a.id)?.take.at(-1) ?? 0)))[0];
    if (!k) return undefined;
    const ub = crew(s).find((c) => c.rank === 'underboss' && isFree(s, c));
    const label = 'The Capo You Created';
    return base('feds_capo', label, `${nm(k)} has made more money in two months than his corner made in a year, and his men would walk into the ocean for him. Today he told ${ub ? ub.firstName : 'your underboss'} he answers to you, and only to you. Your consigliere says he reminds him of somebody — somebody you buried.`, [
      { id: 'mentor', label: `Bring ${k.firstName} close: dinner on Sundays`, detail: 'Your man, before he is his own.', because: `brought ${k.firstName} close`, effects: [{ type: 'opinion', from: k.id, to: b.id, amount: 15, reason: 'The boss brought me close', decay: 1, label }, ...(ub ? [{ type: 'opinion', from: ub.id, to: b.id, amount: -8, reason: 'The boss went around me for the new kid', decay: 1, label } as const] : [])] },
      { id: 'rein', label: `Rein him in: he goes through ${ub ? ub.firstName : 'the chain'}`, detail: 'The order of things.', because: `reined ${k.firstName} in`, effects: [{ type: 'opinion', from: k.id, to: b.id, amount: -8, reason: 'Put me back in my place', decay: 1, label }, { type: 'respect', amount: 1, label }] },
      { id: 'clip', label: `Have ${k.firstName} killed before he becomes the next one`, detail: 'Your explicit order. Your best young earner. Paranoia, or wisdom.', because: `had ${k.firstName} killed`, effects: [{ type: 'kill', charId: k.id, cause: 'shot; the boss feared another plot', killer: 'player', label }, { type: 'crewOpinion', amount: -6, reason: 'Killed his best young capo', label }, { type: 'heat', bar: 'local', amount: 6, label }] },
    ], 'mentor', [k.id]);
  }
  if (key === 'second') {
    const H = F.hollow;
    if (!H?.dmw || H.crisis || H.boss !== s.playerId) return undefined;
    const lead = capos(s).filter((c) => isFree(s, c)).sort((a, c) => opinion(s, a.id, s.playerId) - opinion(s, c.id, s.playerId))[0];
    if (!lead || capos(s).length < 2) return undefined;
    H.leadId = lead.id;
    startCrisis(ctx, F, H, true);
    ctx.log.push(`The Second Invitation: ${nm(lead)} is asking men to supper. They think they will live even if they fail. Last time, they did.`);
    return undefined;
  }
  if (key === 'father') {
    const old = s.characters[ids[0]];
    const R = F.retired;
    if (!old?.alive || !R || old.id === s.playerId) return undefined;
    const label = 'Your father sends for you';
    return base('feds_father', label, `Three weeks into his retirement, ${nm(old)} asks you down to the beach house. ${R.kind === 'honorable' ? 'He looks rested.' : R.kind === 'puppet' ? 'There is a man in a car outside who works for you, and he knows it.' : 'Nobody has visited in a week; the grass is long.'} "They are laughing at us," he says. "The men keep asking me when somebody is going to do something about it."`, [
      { id: 'counsel', label: 'Ask for his advice, and take it seriously', detail: 'The old guard will like it. Some will say he still runs things.', because: 'took his father\'s counsel', effects: [{ type: 'opinion', from: old.id, to: s.playerId, amount: 15, reason: 'My son still asks me', decay: 0, label }, { type: 'crewOpinion', amount: 2, reason: 'Respects the old man', label }] },
      { id: 'warn', label: 'Tell him to stay out of it', detail: 'It is your chair now.', because: 'told his father to stay out of it', effects: [{ type: 'opinion', from: old.id, to: s.playerId, amount: -10, reason: 'My son shut me out', decay: 1, label }, { type: 'respect', amount: 1, label }] },
      { id: 'away', label: 'Send him to Florida for the winter (−$2,000)', detail: 'Out of the way, in comfort.', because: 'sent his father south', effects: [{ type: 'money', amount: -2000, label }, { type: 'opinion', from: old.id, to: s.playerId, amount: 5, reason: 'Sent me to the sun', decay: 1, label }] },
    ], 'counsel', [old.id]);
  }
  if (key === 'newname') {
    const old = s.characters[ids[0]];
    const sis = player(s).fatherId === old?.id ? old?.childrenIds.map((x) => s.characters[x]).find((c) => c?.alive && c.gender === 'F') : undefined;
    if (!old?.alive) return undefined;
    const label = 'The New Name';
    return base('feds_newname', label, `A letter with an Arizona postmark, in a hand you know, signed with a name you do not. ${sis ? `${sis.firstName} is getting married in June, and he` : 'He'} wants to know if there is a seat for him at the back of the church. If Philadelphia ever learns he was there, it will not matter what name he used.`, [
      { id: 'yes', label: 'A seat at the back, and nobody told', detail: 'Blood is blood. If it comes out, it is your neck too.', because: 'let the rat come to the wedding', effects: [{ type: 'heat', bar: 'family', amount: 10, label }, { type: 'familyOpinion', amount: 6, reason: 'Let the old man see the wedding', label }] },
      { id: 'no', label: 'Burn the letter', detail: 'He made his choice in Camden.', because: 'burned the letter', effects: [{ type: 'respect', amount: 2, label }, { type: 'familyOpinion', amount: -4, reason: 'Would not let the old man come', label }] },
    ], 'no', [old.id]);
  }
  return undefined;
}

let registered = false;
export function registerCrisis(): void {
  if (registered) return;
  registered = true;
  registerDelivery({ kind: 'feds_dmw', view: dmwView, answer: dmwAnswer });
  registerDelivery({ kind: 'feds_survivor', view: survivorView, answer: survivorAnswer });
}

/** For tests: the crisis now running, if any. */
export function crisisNow(s: GameState): Crisis | undefined {
  return s.feds?.hollow?.crisis;
}

export { pc, scheduled, ensureFeds };
