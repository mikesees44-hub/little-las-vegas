import type { ActionPreview } from './actions';
import { displayName, hasTrait, isFree } from './characters';
import { fmtMoney } from './effects';
import { addStory } from './hierarchy';
import type { Ctx } from './ledger';
import { pressItem } from './paper';
import { addOpinion, opinion } from './relations';
import { FACTION_NAMES } from './world';
import {
  bumpTension, confirmedMole, confirmMole, dice, eraWith, famName, feedMole, taleFor, tellLie, weakManIntel,
} from './intrigue';
import { ensureIntrigue, pairKey, SPY_HOW_LABEL, type IntrigueAction, type SpyHow } from './intrigueState';
import type { Acceptance } from './interactions';
import type { Character, Effect, GameState, RivalId } from './types';

/**
 * The boss's intrigue orders (the PlayerAction kind 'intrigue'): preview with
 * the odds up front, carried out with the layer's own dice. Anything that
 * touches one of his own men (questioning him hard, sending him away, making
 * him disappear) exists only as an order he gives himself.
 */

export const INTRIGUE_COST = {
  plant: 1000, bribe: 3000, blackmail: 500, debt: 1500, woman: 1000, rumorPaper: 1500, rumorGossip: 300, forge: 2000, sabotage: 1200, proxy: 2500, sitdown: 500,
} as const;

function rivalOk(s: GameState, id: string): boolean {
  const r = s.rivals.find((x) => x.id === id);
  return !!r && r.kind === 'mob' && !!s.characters[r.leaderId]?.alive;
}
const rn = (id: string) => FACTION_NAMES[id as RivalId] ?? id;
const fam = (id: string) => famName(id as RivalId);

/** One of the boss's men who could be planted. */
export function plantable(s: GameState, c: Character | undefined): string | undefined {
  if (!c?.alive) return 'Not among the living';
  if (c.faction !== 'player') return 'Not one of yours';
  if (c.dynasty || c.id === s.playerId) return 'Not blood: they know his face';
  if (!(c.rank === 'soldier' || c.rank === 'associate')) return 'Only a soldier or an associate can go inside';
  if (!isFree(s, c)) return 'He is in jail';
  if (c.informantFor) return 'He is not the man for it';
  if (s.intrigue?.spies.some((x) => x.charId === c.id && !x.ended)) return 'He is already inside';
  return undefined;
}

/** Odds of turning one of theirs, and why. */
export function turnOdds(s: GameState, t: Character, how: Exclude<SpyHow, 'planted'>): Acceptance {
  const reasons: { label: string; value: number }[] = [];
  const base = how === 'blackmail' ? 55 : how === 'bribe' ? 30 : how === 'debt' ? 30 : 25;
  reasons.push({ label: SPY_HOW_LABEL[how], value: base });
  const r = s.rivals.find((x) => x.id === t.faction);
  const op = r ? opinion(s, t.id, r.leaderId) : 0;
  reasons.push({ label: 'How he feels about his boss', value: Math.round(-op / 4) });
  if (hasTrait(t, 'Greedy') && (how === 'bribe' || how === 'debt')) reasons.push({ label: 'Greedy', value: 15 });
  if (hasTrait(t, 'Womanizer') && how === 'woman') reasons.push({ label: 'Has an eye for women', value: 25 });
  if (hasTrait(t, 'Loyal-to-a-fault')) reasons.push({ label: 'Loyal to a fault', value: -40 });
  if (hasTrait(t, 'Honest') && how === 'bribe') reasons.push({ label: 'Honest', value: -15 });
  if (how === 'debt' && t.vices?.some((v) => v === 'horses' || v === 'cards' || v === 'debt')) reasons.push({ label: 'He owes the bookmakers', value: 20 });
  if (how === 'woman' && t.vices?.includes('women')) reasons.push({ label: 'He chases women', value: 15 });
  const it = weakManIntel(s, t.id);
  if (it) reasons.push({ label: 'What your man inside told you', value: it.true ? 25 : -30 });
  const sum = reasons.reduce((a, b) => a + b.value, 0);
  return { chance: Math.max(0.05, Math.min(0.9, sum / 100)), reasons };
}

function blackmailHold(s: GameState, t: Character): boolean {
  return s.secrets.some((x) => x.ownerId === t.id && x.knownBy.includes('player')) || s.hooks.some((h) => h.holder === 'player' && h.targetId === t.id);
}

function base(title: string, because: string, extra: Partial<ActionPreview> = {}): ActionPreview {
  return { title, effects: [], cost: 0, because, category: 'event', ...extra };
}

export function previewIntrigue(s: GameState, op: IntrigueAction): ActionPreview {
  switch (op.op) {
    case 'plant': {
      const c = s.characters[op.charId];
      const why = plantable(s, c) ?? (rivalOk(s, op.rival) ? undefined : 'No such family');
      const label = `Plant ${c ? displayName(c) : '?'} inside ${fam(op.rival)}`;
      return base(label, `planted ${c ? displayName(c) : 'a man'} inside ${fam(op.rival)}`, {
        detail: 'He "falls out" with you in public and goes to work for them. Every few weeks, what he hears. If they find him, he may be doubled and you will not know it.',
        effects: [{ type: 'money', amount: -INTRIGUE_COST.plant, label }], cost: INTRIGUE_COST.plant,
        odds: { chance: Math.min(0.9, 0.55 + (c?.craft === 'talker' ? 0.15 : 0)), reasons: [{ label: 'They take him in', value: 55 }] },
        disabledReason: why ?? (s.money < INTRIGUE_COST.plant ? `Needs ${fmtMoney(INTRIGUE_COST.plant)}` : undefined),
      });
    }
    case 'turn': {
      const t = s.characters[op.targetId];
      const label = `Turn ${t ? displayName(t) : '?'} (${op.how})`;
      const cost = INTRIGUE_COST[op.how];
      let why: string | undefined;
      if (!t?.alive) why = 'Not among the living';
      else if (!rivalOk(s, t.faction)) why = 'Not a man of another family';
      else if (s.rivals.some((r) => r.leaderId === t.id)) why = 'The boss himself will not turn';
      else if (t.informantFor === 'player') why = 'Already yours';
      else if (op.how === 'blackmail' && !blackmailHold(s, t)) why = 'You hold nothing on him';
      else if (s.money < cost) why = `Needs ${fmtMoney(cost)}`;
      return base(label, `tried to turn ${t ? displayName(t) : 'one of theirs'}`, {
        detail: 'If he says no, his boss hears about it.',
        effects: [{ type: 'money', amount: -cost, label }], cost,
        odds: t ? turnOdds(s, t, op.how) : undefined,
        disabledReason: why,
      });
    }
    case 'recall': {
      const sp = s.intrigue?.spies.find((x) => x.id === op.spyId && !x.ended && x.master === 'player');
      return base(`Pull ${sp ? displayName(s.characters[sp.charId]) : '?'} out`, 'pulled your man out', { disabledReason: sp ? undefined : 'No such man inside' });
    }
    case 'canary': {
      const men = op.suspects.map((id) => s.characters[id]).filter(Boolean);
      const why = !men.length ? 'Pick one to three men' : op.suspects.length > 3 ? 'Three at most' : men.some((c) => !c.alive || c.faction !== 'player') ? 'Only your own men' : s.intrigue?.canaries.some((k) => !k.result) ? 'A trap is already set: wait for it' : undefined;
      return base(`A canary trap: ${men.map((c) => c.firstName).join(', ') || '?'}`, 'set a canary trap', { detail: 'Each man hears a different story. In three weeks, the one that comes back names the leak. Nobody is harmed.', disabledReason: why });
    }
    case 'question': {
      const c = s.characters[op.charId];
      const hard = op.how === 'hard';
      const why = !c?.alive || c.faction !== 'player' || c.id === s.playerId ? 'Only one of your own men' : undefined;
      return base(hard ? `Lean on ${c ? displayName(c) : '?'}` : `Sit ${c ? displayName(c) : '?'} down and ask`, hard ? `leaned on ${c ? displayName(c) : 'one of your men'}` : `questioned ${c ? displayName(c) : 'one of your men'}`, {
        detail: hard ? 'Off the books, in the back room. He gets hurt; if he is clean, he and the crew will not forget it.' : 'A talk. If he is clean, he will resent the question.',
        warning: hard ? 'Your choice: this hurts one of your own men.' : undefined,
        odds: { chance: hard ? 0.8 : 0.4, reasons: [{ label: hard ? 'Under pressure' : 'Over coffee', value: hard ? 80 : 40 }] },
        disabledReason: why,
      });
    }
    case 'moleFate': {
      const c = s.characters[op.charId];
      const why = !c?.alive || c.faction !== 'player' ? 'Only one of your own men' : !confirmedMole(s, c.id) ? 'You do not know he talks. Find out first.' : op.fate === 'feed' && s.intrigue?.spies.some((x) => x.charId === c.id && !x.ended) ? 'You are already feeding him' : undefined;
      const nm = c ? displayName(c) : '?';
      const effects: Effect[] = op.fate === 'exile' && c ? [{ type: 'exile', charId: c.id, label: `${nm} is sent away` }]
        : op.fate === 'bury' && c ? [{ type: 'kill', charId: c.id, cause: 'was never seen again', killer: 'player', label: `${nm} is never seen again` }, { type: 'heat', bar: 'local', amount: 3, label: 'A man missing' }]
        : [];
      const title = op.fate === 'feed' ? `Feed ${nm} lies for his masters` : op.fate === 'forgive' ? `Forgive ${nm}` : op.fate === 'exile' ? `Send ${nm} away` : `${nm} disappears`;
      return base(title, op.fate === 'feed' ? `fed ${nm} lies` : op.fate === 'forgive' ? `forgave ${nm}` : op.fate === 'exile' ? `sent ${nm} away` : `had ${nm} disappear`, {
        detail: op.fate === 'feed' ? 'He keeps his place; what he carries out is yours to write.' : op.fate === 'forgive' ? 'He may come clean, or keep talking.' : op.fate === 'exile' ? 'He leaves the family and Wildwood.' : 'It happens off the page. Permanent.',
        warning: op.fate === 'bury' || op.fate === 'exile' ? 'Your explicit choice about one of your own men.' : undefined,
        effects, disabledReason: why,
      });
    }
    case 'rumor': {
      const paper = op.via === 'paper';
      const cost = paper ? INTRIGUE_COST.rumorPaper : INTRIGUE_COST.rumorGossip;
      const line = op.line === 'weak' ? `${rn(op.rival)} is finished: no money, no men` : op.line === 'rat' ? `somebody high in ${fam(op.rival)} talks to the FBI` : `a capo in ${fam(op.rival)} is robbing his own boss`;
      const label = `Rumor${paper ? ' in Spout Off' : ' in the bars'}: ${line}`;
      return base(label, `spread a rumor about ${fam(op.rival)}`, {
        detail: op.line === 'weak' ? 'Their men lose heart.' : op.line === 'rat' ? 'They look at each other sideways; the law looks at them.' : 'Their boss counts his capos\' money; somebody may reach for his chair.',
        warning: 'A lie: if it is traced to you, they will remember.',
        effects: [{ type: 'money', amount: -cost, label }], cost,
        disabledReason: !rivalOk(s, op.rival) ? 'No such family' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined,
      });
    }
    case 'forge': {
      const label = `Forge proof that ${rn(op.blame)} hit ${fam(op.victim)}`;
      return base(label, `set ${fam(op.victim)} against ${fam(op.blame)}`, {
        detail: 'A false flag: a ledger page, a matchbook, a witness who saw a car. They turn on each other.',
        warning: 'If it comes out, both of them come for you.',
        effects: [{ type: 'money', amount: -INTRIGUE_COST.forge, label }], cost: INTRIGUE_COST.forge,
        disabledReason: op.victim === op.blame ? 'Two different families' : !rivalOk(s, op.victim) || !rivalOk(s, op.blame) ? 'No such family' : s.money < INTRIGUE_COST.forge ? `Needs ${fmtMoney(INTRIGUE_COST.forge)}` : undefined,
      });
    }
    case 'sabotage': {
      const era = eraWith(s, op.rival);
      const label = `Sabotage ${fam(op.rival)}`;
      return base(label, `sabotaged ${fam(op.rival)}`, {
        detail: 'A load goes missing, a truck goes in the bay. Hurts their money; it may be traced.',
        effects: [{ type: 'money', amount: -INTRIGUE_COST.sabotage, label }], cost: INTRIGUE_COST.sabotage,
        disabledReason: !rivalOk(s, op.rival) ? 'No such family' : era !== 'cold' && era !== 'war' ? 'Only in a cold war or a war (now: ' + era + ')' : s.money < INTRIGUE_COST.sabotage ? `Needs ${fmtMoney(INTRIGUE_COST.sabotage)}` : undefined,
      });
    }
    case 'proxy': {
      const label = `Fund ${fam(op.ally)} against ${fam(op.against)}`;
      const t = s.intrigue?.eras[pairKey(op.ally, op.against)];
      return base(label, `funded ${fam(op.ally)} against ${fam(op.against)}`, {
        detail: 'A proxy fight: your money, their men. Their fight gets hotter; your hands stay clean.',
        effects: [{ type: 'money', amount: -INTRIGUE_COST.proxy, label }, { type: 'rivalOpinion', rival: op.ally, amount: 10, reason: 'Backed us with money' }], cost: INTRIGUE_COST.proxy,
        disabledReason: op.ally === op.against ? 'Two different families' : !rivalOk(s, op.ally) || !rivalOk(s, op.against) ? 'No such family' : !t || t.era === 'peace' || t.era === 'truce' ? 'They are not fighting (yet)' : s.money < INTRIGUE_COST.proxy ? `Needs ${fmtMoney(INTRIGUE_COST.proxy)}` : undefined,
      });
    }
    case 'sitdown': {
      const r = s.rivals.find((x) => x.id === op.rival);
      const era = eraWith(s, op.rival);
      const op0 = r ? opinion(s, r.leaderId, s.playerId) : 0;
      const label = `A sit-down with ${fam(op.rival)}`;
      return base(label, `sat down with ${fam(op.rival)}`, {
        detail: 'Dinner at a neutral table. The air clears a little, if he comes.',
        effects: [{ type: 'money', amount: -INTRIGUE_COST.sitdown, label }], cost: INTRIGUE_COST.sitdown,
        acceptance: { chance: Math.max(0.15, Math.min(0.9, 0.55 + op0 / 150)), reasons: [{ label: 'He comes to the table', value: 55 }, { label: 'What he thinks of you', value: Math.round(op0 / 1.5) }] },
        disabledReason: !rivalOk(s, op.rival) ? 'No such family' : era === 'war' ? 'At war: offer terms in the war room' : s.money < INTRIGUE_COST.sitdown ? `Needs ${fmtMoney(INTRIGUE_COST.sitdown)}` : undefined,
      });
    }
    case 'front': {
      const w = s.wars.find((x) => x.id === op.warId);
      const d = s.districts.find((x) => x.id === op.district);
      return base(`Move the fight to ${d?.name ?? '?'}`, `moved the war to ${d?.name ?? 'another district'}`, {
        detail: 'Whatever peace comes, it is this district that changes hands.',
        disabledReason: !w ? 'No such war' : !d ? 'No such district' : w.district === d.id ? 'The fight is already there' : (d.influence[w.rival] ?? 0) < 5 || (d.influence.player ?? 0) < 5 ? 'Both sides need a foothold there' : undefined,
      });
    }
  }
}

export function commitIntrigue(ctx: Ctx, op: IntrigueAction): void {
  const s = ctx.s;
  const I = ensureIntrigue(s);
  const id = (p: string) => `${p}${I.nextId++}`;
  const log = (t0: string) => { const t = t0.charAt(0).toUpperCase() + t0.slice(1); I.log.push([s.week, t]); if (I.log.length > 60) I.log.splice(0, I.log.length - 60); ctx.log.push(t); };
  switch (op.op) {
    case 'plant': {
      const c = s.characters[op.charId];
      if (!c) return;
      const p = previewIntrigue(s, op).odds?.chance ?? 0.5;
      if (dice(s, `plant:${c.id}`) < p) {
        I.spies.push({ id: id('sp'), charId: c.id, master: 'player', inside: op.rival, how: 'planted', since: s.week, cover: 70 + (c.craft === 'talker' ? 10 : 0), });
        addStory(s, c, `Went inside ${fam(op.rival)} on the boss's word.`);
        log(`${displayName(c)} is inside ${fam(op.rival)}. They bought the falling-out.`);
      } else {
        bumpTension(s, 'player', op.rival, 8, `They saw through your plant ${displayName(c)}`);
        log(`${fam(op.rival)} did not buy ${displayName(c)}'s story. They sent him back with a message.`);
      }
      return;
    }
    case 'turn': {
      const t = s.characters[op.targetId];
      if (!t) return;
      const odds = turnOdds(s, t, op.how).chance;
      if (dice(s, `turn:${t.id}:${op.how}`) < odds) {
        t.informantFor = 'player';
        if (!s.secrets.some((x) => x.ownerId === t.id && x.kind === 'informant' && x.knownBy.includes('player'))) s.secrets.push({ id: `x${s.nextId++}`, ownerId: t.id, kind: 'informant', text: `${t.firstName} ${t.lastName} informs for you`, knownBy: ['player'], week: s.week });
        I.spies.push({ id: id('sp'), charId: t.id, master: 'player', inside: t.faction, how: op.how, since: s.week, cover: op.how === 'blackmail' ? 55 : 65 });
        log(`${displayName(t)} of ${fam(t.faction)} is yours now (${SPY_HOW_LABEL[op.how].toLowerCase()}).`);
      } else {
        const r = s.rivals.find((x) => x.id === t.faction);
        if (r) addOpinion(s, r.leaderId, s.playerId, 'Tried to buy one of my men', -10, 1);
        bumpTension(s, 'player', t.faction, 12, `You tried to turn ${displayName(t)}`);
        log(`${displayName(t)} said no, and told his boss.`);
      }
      return;
    }
    case 'recall': {
      const sp = I.spies.find((x) => x.id === op.spyId);
      if (sp) { sp.ended = s.week; sp.endedWhy = 'You pulled him out.'; log(`${displayName(s.characters[sp.charId])} is out of ${fam(sp.inside)}.`); }
      return;
    }
    case 'canary': {
      I.canaries.push({ id: id('cn'), week: s.week, checkWeek: s.week + 3, entries: op.suspects.map((cid, i) => ({ charId: cid, tale: taleFor(s, i, cid) })) });
      for (const [i, cid] of op.suspects.entries()) tellLie(s, { teller: 'player', to: 'player', kind: 'canary', text: `Told ${displayName(s.characters[cid])} about ${taleFor(s, i, cid)}`, truth: 'There was nothing to it', risk: 0, until: s.week + 3 });
      log(`Three weeks: whichever story comes back names the leak.`);
      return;
    }
    case 'question': {
      const c = s.characters[op.charId];
      if (!c) return;
      const hard = op.how === 'hard';
      const mole = c.alive && !!c.informantFor && c.informantFor !== 'player';
      if (hard) {
        c.health = Math.max(5, c.health - 15);
        addStory(s, c, 'The boss had him taken to the back room.');
      }
      if (mole && dice(s, `q:${c.id}:${op.how}`) < (hard ? 0.8 : 0.4)) {
        confirmMole(s, c);
        log(`${displayName(c)} talked: he reports to ${c.informantFor === 'law' ? 'the FBI' : fam(c.informantFor!)}. What happens to him now is your call.`);
      } else {
        I.suspect[c.id] = Math.max(0, (I.suspect[c.id] ?? 0) - (mole ? 0 : 30));
        if (!mole) {
          addOpinion(s, c.id, s.playerId, hard ? 'The boss had me beaten like a rat' : 'The boss thought I was a rat', hard ? -30 : -12, hard ? 0 : 1);
          if (hard) for (const m of Object.values(s.characters)) if (m.alive && m.faction === 'player' && m.id !== c.id && m.id !== s.playerId && m.capoId === c.capoId) addOpinion(s, m.id, s.playerId, 'He did that to one of us', -4, 2);
        }
        log(mole ? `${displayName(c)} gave you nothing.` : `${displayName(c)} was clean. He knows you asked.`);
      }
      return;
    }
    case 'moleFate': {
      const c = s.characters[op.charId];
      if (!c) return;
      if (op.fate === 'feed') feedMole(s, c);
      else if (op.fate === 'forgive') {
        if (dice(s, `forgive:${c.id}`) < 0.5) { c.informantFor = undefined; addOpinion(s, c.id, s.playerId, 'The boss forgave me', 15, 1); log(`${displayName(c)} wept, and swore he was done with them.`); }
        else log(`${displayName(c)} thanked you. Nobody can say if he stopped.`);
      } else log(op.fate === 'exile' ? `${displayName(c)} is gone from Wildwood.` : `${displayName(c)} was never seen again.`);
      return;
    }
    case 'rumor': {
      const r = s.rivals.find((x) => x.id === op.rival);
      if (!r) return;
      const paper = op.via === 'paper';
      const text = op.line === 'weak' ? `They say ${fam(op.rival)} is broke and their soldiers are looking for work.` : op.line === 'rat' ? `They say somebody high up in ${fam(op.rival)} has been having lunch with the FBI.` : `They say one of ${fam(op.rival)}'s capos has been robbing his own boss blind.`;
      if (paper) pressItem(s, { s: 'spout', b: `Spout Off: ${text.replace(/^They say /, 'I hear ')} Just saying.`, p: 30 });
      if (op.line === 'weak') r.muscle = Math.max(5, r.muscle - (paper ? 4 : 2));
      else if (op.line === 'rat') { r.exposure = Math.min(100, r.exposure + (paper ? 8 : 4)); I.cd[`unrest:${r.id}`] = s.week; }
      else I.cd[`unrest:${r.id}`] = s.week;
      tellLie(s, { teller: 'player', to: r.id, kind: 'rumor', text: `You spread it: ${text}`, truth: 'You made it up', risk: paper ? 0.04 : 0.06, via: paper ? 'paper' : 'gossip' });
      log(`The rumor is out${paper ? ' in Spout Off' : ' in the bars'}: ${text}`);
      return;
    }
    case 'forge': {
      bumpTension(s, op.victim, op.blame, 30, `${rn(op.victim)} found proof ${rn(op.blame)} hit them`);
      const rk = s.talks?.rivalRel;
      if (rk) { const k = op.victim < op.blame ? `${op.victim}|${op.blame}` : `${op.blame}|${op.victim}`; rk[k] = Math.max(-100, (rk[k] ?? 0) - 30); }
      tellLie(s, { teller: 'player', to: op.victim, kind: 'forgery', text: `Forged proof that ${rn(op.blame)} hit ${fam(op.victim)}`, truth: `${rn(op.blame)} did nothing`, blame: op.blame, risk: 0.05, via: 'word' });
      log(`${fam(op.victim)} found the proof you left for them. They are looking at ${fam(op.blame)} now.`);
      return;
    }
    case 'sabotage': {
      const r = s.rivals.find((x) => x.id === op.rival);
      if (!r) return;
      const hit = 3000 + Math.floor(dice(s, `sab:${r.id}:amt`) * 3000);
      r.money = Math.max(0, r.money - hit);
      bumpTension(s, 'player', r.id, 8, 'Somebody sabotaged them');
      if (dice(s, `sab:${r.id}:traced`) < 0.25) { bumpTension(s, 'player', r.id, 12, 'They traced the sabotage to you'); addOpinion(s, r.leaderId, s.playerId, 'Sabotaged us', -10, 1); log(`${fam(r.id)} lost ${fmtMoney(hit)} — and they know it was you.`); }
      else log(`${fam(r.id)} lost ${fmtMoney(hit)}. They do not know who to blame.`);
      return;
    }
    case 'proxy': {
      const a = s.rivals.find((x) => x.id === op.against);
      if (a) a.muscle = Math.max(5, a.muscle - 4);
      bumpTension(s, op.ally, op.against, 15, `${rn(op.ally)} has new money for the fight`);
      log(`${fam(op.ally)} has your money; ${fam(op.against)} feels it.`);
      return;
    }
    case 'sitdown': {
      bumpTension(s, 'player', op.rival, -15, 'A sit-down cleared the air');
      const r = s.rivals.find((x) => x.id === op.rival);
      if (r) addOpinion(s, r.leaderId, s.playerId, 'Sat down with me like a man', 5, 2);
      log(`Dinner with ${fam(op.rival)}: the air is clearer.`);
      return;
    }
    case 'front': {
      const w = s.wars.find((x) => x.id === op.warId);
      if (w) w.district = op.district;
      return;
    }
  }
}

/** Every intrigue order that makes sense now (for the board's menus and the tests). */
export function intrigueActions(s: GameState): { kind: 'intrigue'; op: IntrigueAction }[] {
  const out: { kind: 'intrigue'; op: IntrigueAction }[] = [];
  const mob = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  for (const r of mob) {
    out.push({ kind: 'intrigue', op: { op: 'sitdown', rival: r.id } });
    out.push({ kind: 'intrigue', op: { op: 'rumor', rival: r.id, line: 'weak', via: 'gossip' } });
  }
  return out;
}
