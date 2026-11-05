import { ageOn } from './calendar';
import { crew, displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { holder as seatHolder } from './council';
import { adultOn, ensureDating } from './datingState';
import { killCharacter } from './dynasty';
import { applyEffects } from './effects';
import { bumpTension, eraWith, famName, plantFalseBelief, tellLie } from './intrigue';
import { believe } from './minds/beliefs';
import { remember as mindRemember } from './minds/memory';
import { mindOf } from './minds/state';
import { pressItem } from './paper';
import { spendPocket } from './pocket';
import { createInquiry, protectionFor } from './protect';
import { defectTo } from './regimes';
import { addOpinion, changeMeter, opinion } from './relations';
import { hashSeed } from './rng';
import { addSecret } from './secrets';
import { dropLure, ensureThreats, planLure } from './threats';
import { nudge, peekTie, remember as bondRemember } from './bonds';
import { endAffair, husbandReacts, husbandWay } from './womenAffairs';
import { affairOf } from './womenCore';
import { ensureWomen } from './womenState';
import { ensureRomance } from './storyState';
import {
  $, addSign, adultC, clamp, closeLately, fn, honeyBlock, hlog, hpick, hroll, involvedWith, manOf, marriedOf, nm, pct, perception, watchFor,
} from './honeyCore';
import { CLOSE_INFO, END_TEXT, runDare, type DareAt, type DareMove } from './honeyScript';
import { approachSlotFree, isSingle, SINGLE_TEST, takeHoneyApproach } from './single';
import {
  AGENT_TEXT, ensureHoney, LEVER_TEXT, WANT_COST, WANT_TEXT,
  type Agent, type AgentKind, type Claim, type HoneyState, type Lever, type Mistress, type Scorn, type SettleHow, type Want,
} from './honeyState';
import type { ActionPreview } from './actions';
import type { Ctx } from './ledger';
import type { Character, Choice, Effect, EventInstance, FactionId, GameState, PlayerAction, RivalId } from './types';

/**
 * HONEY: the deep end of the women layer. The bold dare (honeyScript.ts) as
 * an order; married women "claimed" in the island's eyes and what it costs
 * her and him; women working the boss (a rival's spy, an FBI informant, the
 * girl of one of his own men, a set-up for a hit) and how he finds out, turns
 * her, feeds her lies, has it out with her or ends it; mistresses with loud
 * mouths and wants that climb to threats; scorned women and men who remember.
 *
 * Every hard thing goes through the systems that own it: a hit through the
 * threats pipeline (warned of, blunted by guards, caution and a Paranoid
 * nature), intelligence through intrigue (tension, lies, false beliefs, the
 * rival's own threats), evidence through the law, a man's anger through his
 * opinion and his plots. Adults only; non-explicit; one line each; she always
 * decides; the worst is only ever the boss's own explicit order. Mature
 * content Off: nothing here is listed, offered, or rolled.
 */

export type HoneyAction =
  /** The bold dare, as it went in the window (replayed exactly). */
  | { op: 'dare'; id: string; at: DareAt; moves: DareMove[] }
  /** Have a man quietly look into her (a protect.ts inquiry). */
  | { op: 'probe'; id: string }
  /** She works for you now (a double agent): her decision. */
  | { op: 'turn'; id: string }
  /** Keep her, and feed her masters lies through her. */
  | { op: 'feed'; id: string }
  /** Have it out with her. */
  | { op: 'confront'; id: string }
  /** End it, quietly. */
  | { op: 'drop'; id: string }
  /** Settle a mistress's demand. */
  | { op: 'settle'; id: string; how: SettleHow };

export type HoneyOp =
  | { op: 'did'; a: HoneyAction }
  | { op: 'bolted'; id: string }
  | { op: 'agent'; id: string; how: 'turn' | 'feed' | 'confront' | 'drop' | 'watch' }
  | { op: 'want'; id: string; how: 'give' | 'promise' | 'refuse' }
  | { op: 'threat'; id: string; how: SettleHow }
  | { op: 'approach'; id: string; how: 'office' | 'motel' | 'drink' | 'probe' }
  | { op: 'invite'; id: string; how: 'alone' | 'covered' | 'stay' }
  /** Authored scenes: someone holds it against the boss. */
  | { op: 'scorn'; who: string; by: number; why: string }
  /** Authored scenes: a mistress's demand is settled. */
  | { op: 'hush'; id: string }
  /** Authored scenes: a mistress talks. */
  | { op: 'leak'; id: string }
  /** Authored scenes: the boss's suspicion of her. */
  | { op: 'suspect'; id: string; by: number };

export { HONEY_HOURS } from './honeyState';

const HX = (op: HoneyOp, label: string): Effect => ({ type: 'honey', op, label }) as Effect;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function fx(ctx: Ctx, effects: Effect[], label: string, because: string): void {
  if (effects.length) applyEffects(ctx, effects, { label, because, category: 'event' });
}

function say(ctx: Ctx, H: HoneyState, text: string): void {
  hlog(H, ctx.s, text);
  ctx.log.push(text);
}

function rumor(s: GameState, text: string, about: string): void {
  ensureDating(s).rumors.push({ week: s.week, text, about, heard: ['island'], true: true });
}

function hostileRival(s: GameState): RivalId | undefined {
  const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive).sort((a, b) => (a.id < b.id ? -1 : 1));
  const worst = mobs.map((r) => ({ r, v: opinion(s, r.leaderId, s.playerId) - (eraWith(s, r.id) === 'war' ? 60 : eraWith(s, r.id) === 'cold' ? 30 : eraWith(s, r.id) === 'tension' ? 10 : 0) })).sort((a, b) => a.v - b.v || (a.r.id < b.r.id ? -1 : 1))[0];
  return worst && worst.v <= -30 ? worst.r.id as RivalId : undefined;
}

function anyRival(s: GameState): RivalId | undefined {
  return (hostileRival(s) ?? s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive).sort((a, b) => (a.id < b.id ? -1 : 1))[0]?.id) as RivalId | undefined;
}

const isMob = (s: GameState, f: FactionId | undefined) => !!f && s.rivals.some((r) => r.id === f && r.kind === 'mob');

/** The old school and the young bloods: who condemns and who admires (the crew's divide). */
function divide(s: GameState): { old: Character[]; young: Character[] } {
  const men = crew(s).filter((c) => c.alive && c.gender === 'M');
  const old = men.filter((c) => ageOn(c.birth, s.date) >= 45 || hasTrait(c, 'Pious') || hasTrait(c, 'Honest') || hasTrait(c, 'Loyal-to-a-fault'));
  const young = men.filter((c) => !old.includes(c) && (hasTrait(c, 'Womanizer') || hasTrait(c, 'Ambitious') || ageOn(c.birth, s.date) < 32));
  return { old: old.slice(0, 10), young: young.slice(0, 10) };
}

function wifeHears(s: GameState, sus: number, mem?: string): void {
  const b = player(s);
  const t = b.spouseId ? peekTie(s, b.spouseId) : undefined;
  if (!t) return;
  t.sus = clamp((t.sus ?? 0) + sus);
  if (mem) bondRemember(s, t, 'questions', mem, -Math.round(sus / 3));
}

/* ------------------------------------------------------------------ */
/* Scorn: the ones who remember                                        */
/* ------------------------------------------------------------------ */

export function scornAdd(s: GameState, who: string, kind: Scorn['kind'], why: string, heat: number): Scorn | undefined {
  const c = s.characters[who];
  if (!c?.alive || !adultC(s, c) || who === s.playerId) return undefined;
  const H = ensureHoney(s);
  const ex = H.scorn[who];
  if (ex) { ex.heat = clamp(Math.max(ex.heat, heat) + 5); ex.why = why; return ex; }
  const sc: Scorn = { id: who, kind, why, since: s.week, heat: clamp(heat), n: 0 };
  H.scorn[who] = sc;
  H.stats.scorned++;
  const m = mindOf(s, who);
  if (m) mindRemember(m, { w: s.week, k: 'betrayal', who: s.playerId, t: why, v: -Math.round(heat / 2) });
  const keys = Object.keys(H.scorn);
  if (keys.length > 30) {
    const coolest = keys.sort((a, b) => H.scorn[a].heat - H.scorn[b].heat)[0];
    delete H.scorn[coolest];
  }
  return sc;
}

function scornWeek(ctx: Ctx, H: HoneyState): void {
  const s = ctx.s;
  const boss = player(s);
  for (const sc of Object.values(H.scorn)) {
    const c = s.characters[sc.id];
    if (!c?.alive) { delete H.scorn[sc.id]; continue; }
    sc.heat = clamp(sc.heat - (hasTrait(c, 'Vengeful') ? 0.25 : hasTrait(c, 'Patient') ? 2 : 1));
    if (sc.heat <= 5) { delete H.scorn[sc.id]; continue; }
    if (sc.heat < 50 || (sc.acted !== undefined && s.week - sc.acted < 12)) continue;
    if (hroll(s, `scornact:${sc.id}:${s.week}`) >= sc.heat / 400) continue;
    sc.acted = s.week;
    sc.n++;
    H.stats.acted++;
    const r = hroll(s, `scornhow:${sc.id}:${s.week}`);
    const by = `${c.firstName} ${c.lastName}`;
    let line: string;
    if (sc.kind === 'woman') {
      if (boss.spouseId && r < 0.35) { wifeHears(s, 30, `a woman called the house and said things`); line = `${by} called your house. Your wife answered.`; }
      else if (r < 0.6) { pressItem(s, { s: 'spout', b: `Spout Off: Ask a certain big man on Pacific Avenue what he promised a certain redhead, and why she isn't smiling anymore.`, a: 'boss', fx: { wife: -3 } }); line = `${by} has been talking to the Leader's gossip man.`; }
      else if (r < 0.85) { const rv = anyRival(s); if (rv) { const sec = addSecret(s, boss, 'affair', [rv]); if (!sec.knownBy.includes(rv)) sec.knownBy.push(rv); } line = `${by} has been drinking with the wrong crowd, and talking about you.`; }
      else { fx(ctx, [{ type: 'evidence', charId: boss.id, amount: 3 }], 'A woman scorned', 'scorned a woman'); line = `${by} told a county detective what she saw at the club.`; }
    } else {
      // A husband or a jilted man: his own way (traits, his place).
      if (c.faction === 'player' && c.rank !== 'boss' && r < 0.25) { defectTo(ctx, c, hostileRival(s), 'desert'); line = `${displayName(c)} walked out of the family over it.`; }
      else if (r < 0.55) { fx(ctx, [{ type: 'evidence', charId: boss.id, amount: 5 }], 'A man with a grudge', 'wronged a man'); line = `${displayName(c)} went to the county prosecutor with what he knows.`; }
      else if (isMob(s, c.faction) && r < 0.8) { bumpTension(s, 'player', c.faction, 8, `${c.firstName} keeps talking about what the boss did`); line = `${displayName(c)} keeps the grudge alive at every ${c.faction} table.`; }
      else {
        const cut = protectionFor(s, boss.id, 'any').cut;
        if (hroll(s, `scornhit:${sc.id}:${s.week}`) < cut) line = `${displayName(c)} came looking for you outside the Shamrock. Your man walked him back to his car.`;
        else { boss.health = clamp(boss.health - 5, 1, 100); line = `${displayName(c)} caught you outside the Shamrock and broke your nose before your men pulled him off.`; }
      }
    }
    sc.heat = clamp(sc.heat - 30);
    say(ctx, H, line);
  }
}

/* ------------------------------------------------------------------ */
/* Claims: the boss's, in the island's eyes                            */
/* ------------------------------------------------------------------ */

/** A married woman's affair with the boss is out: she is "the boss's" now, and everybody pays. */
export function claimFrom(ctx: Ctx, id: string, from: Claim['from']): Claim | undefined {
  const s = ctx.s;
  const H = ensureHoney(s);
  if (H.claims[id]) return H.claims[id];
  const c = s.characters[id];
  if (honeyBlock(s, id) || !c) return undefined;
  const m = manOf(s, c);
  if (!m || !marriedOf(s, c)) return undefined;
  const boss = player(s);
  const way = husbandWay(s, m);
  const p = s.nightlife?.people[id];
  const kids = (p?.fam.kids.length ?? 0) > 0 || (m.household?.kids.length ?? 0) > 0;
  const fallout: Claim['fallout'] = way === 'separate' || way === 'leave' ? 'left' : way === 'revenge' || way === 'rival' ? (kids ? 'kids' : 'left') : way === 'cops' ? 'cutoff' : 'cold';
  const rival = isMob(s, m.faction) ? m.faction as RivalId : undefined;
  const cl: Claim = { id, husband: m.id, since: s.week, fallout, from, ...(rival ? { rival } : {}) };
  H.claims[id] = cl;
  H.stats.claims++;
  // Her side of it (implied, one line): the house, the kids, the money.
  const her = c.firstName;
  if (fallout === 'left') { ensureRomance(s).separations.push({ a: c.id, b: m.id, week: s.week }); if (p && p.fam.st === 'married') p.fam.st = 'separated'; }
  if (fallout === 'cutoff' && p) p.savings = Math.min(p.savings, 40);
  addOpinion(s, c.id, m.id, fallout === 'cold' ? 'He won\'t look at me' : 'He threw me out', -25, 1);
  const hm = mindOf(s, c.id);
  if (hm) mindRemember(hm, { w: s.week, k: 'loss', who: m.id, t: fallout === 'kids' ? 'he took the children to his mother\'s' : fallout === 'left' ? 'he packed a bag and left' : fallout === 'cutoff' ? 'he closed the bank account' : 'the house went cold', v: -25 });
  const af = affairOf(s, id);
  if (af) { af.guilt = clamp(af.guilt + 15); af.aff = clamp(af.aff + (fallout === 'cold' ? 0 : 8)); }
  const herLine = { left: `${m.firstName} packed a bag and left her.`, kids: `${m.firstName} took the children to his mother's and changed the locks.`, cutoff: `${m.firstName} closed the bank account and told the grocer not to give her credit.`, cold: `${m.firstName} stayed. The house went cold.` }[fallout];
  // His side: the husband, his people, the crew split down the middle.
  const effects: Effect[] = [];
  const { old, young } = divide(s);
  for (const o of old) if (o.id !== m.id) effects.push({ type: 'opinion', from: o.id, to: boss.id, amount: m.faction === 'player' ? -8 : -4, reason: 'Took another man\'s wife, and everybody knows', decay: 1, label: 'The old school' });
  for (const y of young) if (y.id !== m.id) effects.push({ type: 'opinion', from: y.id, to: boss.id, amount: 2, reason: 'The boss takes what he wants', decay: 1, label: 'The young bloods' });
  if (m.faction === 'player') effects.push({ type: 'respect', amount: -1, label: `${m.firstName}'s wife` }, { type: 'familyOpinion', amount: -2, reason: 'He did it to one of his own', label: 'The family heard' });
  if (rival) effects.push({ type: 'rivalOpinion', rival, amount: -12, reason: `The boss took ${m.firstName}'s wife`, label: `${famName(rival)}` } as Effect);
  fx(ctx, effects, 'She is the boss\'s now', `took ${m.firstName}'s wife`);
  if (rival) bumpTension(s, 'player', rival, 22, `The boss took the wife of their man ${m.firstName}`);
  changeMeter(s, m.id, boss.id, 'grievance', 35);
  addOpinion(s, m.id, boss.id, 'Made a fool of me in front of the whole island', -30, 0);
  scornAdd(s, m.id, 'husband', `the boss took my wife, and the whole island watched`, m.faction === 'player' || rival ? 75 : 55);
  // An affair her husband had not heard of yet: now he has, and he answers in his own way.
  if (af && af.husbandKnew === undefined && m.alive) husbandReacts(ctx, ensureWomen(s), af, c, m);
  rumor(s, `${her} ${c.lastName} is the boss's now. Ask her husband.`, boss.id);
  if (hroll(s, `claimspout:${id}`) < 0.5) pressItem(s, { s: 'spout', b: `Spout Off: The talk of the Crest is a certain married lady who no longer bothers to come home. Her husband, they say, has stopped asking where she goes.`, a: 'boss', fx: { wife: -2 } });
  wifeHears(s, 15);
  say(ctx, H, `${her} ${c.lastName} is yours in the island's eyes now. ${herLine}${rival ? ` ${famName(rival)} takes it as an insult to the family.` : m.faction === 'player' ? ` Your crew is split: the old men won't look at you; the young ones grin.` : ''}`);
  return cl;
}

function claimsWeek(ctx: Ctx): void {
  const s = ctx.s;
  for (const a of Object.values(s.women?.affairs ?? {})) {
    if (a.with !== s.playerId || a.stage === 'interest' || s.honey?.claims[a.id]) continue;
    const out = a.husbandKnew !== undefined || a.known.some((k) => k.how === 'gossip' || k.how === 'spout' || k.how === 'husband');
    if (out) claimFrom(ctx, a.id, 'affair');
  }
}

/* ------------------------------------------------------------------ */
/* Agents: the women working him                                       */
/* ------------------------------------------------------------------ */

/** Weigh once whether a woman the boss is involved with is working him (the hidden truth). */
export function weighAgent(s: GameState, id: string): Agent | undefined {
  const H = ensureHoney(s);
  if (H.seen[id] !== undefined || H.agents[id]) return H.agents[id];
  H.seen[id] = s.week;
  const c = s.characters[id];
  if (!c || honeyBlock(s, id)) return undefined;
  const m = manOf(s, c);
  const p = s.nightlife?.people[id];
  const hostile = hostileRival(s);
  const fed = (s.threats?.fed.stage ?? 0) >= 1 || s.heat.federal >= 25;
  const cands: { kind: AgentKind; master: FactionId; handler?: string; p: number }[] = [];
  if (m && isMob(s, m.faction)) cands.push({ kind: 'rival', master: m.faction, handler: m.id, p: 0.35 });
  if (m && m.faction === 'player' && (m.rank === 'associate' || m.rank === 'soldier')) cands.push({ kind: 'crew', master: 'player', handler: m.id, p: 0.22 });
  if (p && isMob(s, p.side)) cands.push({ kind: 'rival', master: p.side, p: 0.2 });
  if (fed) cands.push({ kind: 'fbi', master: 'law', p: 0.06 + s.heat.federal / 500 });
  if (hostile) cands.push({ kind: 'setup', master: hostile, p: eraWith(s, hostile) === 'war' ? 0.12 : 0.06 });
  if (!cands.length) return undefined;
  let mult = 1;
  if (s.women?.affairs[id]?.initiated) mult *= 1.5;
  if (hasTrait(c, 'Pious') || hasTrait(c, 'Honest')) mult *= 0.3;
  const r = hroll(s, `agent:${id}`);
  let acc = 0;
  for (const x of cands.sort((a, b) => b.p - a.p)) {
    acc += x.p * mult;
    if (r < acc) {
      const a: Agent = { id, kind: x.kind, master: x.master, ...(x.handler ? { handler: x.handler } : {}), since: s.week, status: 'working', intel: 0 };
      H.agents[id] = a;
      H.stats.agents++;
      return a;
    }
  }
  return undefined;
}

const LEAK_WHAT = ['the Thursday count', 'where the card game moved', 'the new drop at the garage', 'who you had dinner with on Sunday', 'what was said at the sit-down', 'the shipment coming in at the bay docks'];

/** She passes on what she heard: real effects through the systems that own them. */
export function leakIntel(ctx: Ctx, a: Agent, where: 'pillow' | 'office'): void {
  const s = ctx.s;
  const H = ensureHoney(s);
  const boss = player(s);
  a.intel++;
  H.stats.leaks++;
  const what = hpick(s, `leakwhat:${a.id}:${s.week}:${a.intel}`, LEAK_WHAT);
  const r = hroll(s, `leakkind:${a.id}:${s.week}:${a.intel}`);
  const her = s.characters[a.id];
  // The boss sees the symptom (they knew), never the source: everybody close to him is a little suspect.
  const spread = () => { for (const id of involvedWith(s)) addSign(s, id, `They knew about ${what}. Not many people did.`, id === a.id ? 8 : 5); };
  if (a.kind === 'rival' && isMob(s, a.master)) {
    const rv = a.master as RivalId;
    if (r < 0.35) { const sec = addSecret(s, boss, 'affair', [rv]); if (!sec.knownBy.includes(rv)) sec.knownBy.push(rv); }
    else if (r < 0.7) {
      const T = ensureThreats(s);
      const biz = s.businesses.filter((b) => b.owner === 'player').sort((x, y) => (x.id < y.id ? -1 : 1));
      if (biz.length && T.threats.filter((x) => !x.schemeId).length < 4 && !T.threats.some((x) => x.by === rv && !x.schemeId)) {
        const b = biz[Math.floor(hroll(s, `leakbiz:${a.id}:${s.week}`) * biz.length)];
        T.threats.push({ id: `th${T.n++}`, kind: 'racket', by: rv, bizId: b.id, district: b.districtId, start: s.week, due: s.week + 2, blunt: 0 });
        T.stats.planned++;
      }
    }
    bumpTension(s, 'player', rv, where === 'office' ? 6 : 4, `They knew about ${what}`);
    spread();
  } else if (a.kind === 'fbi') {
    fx(ctx, [{ type: 'evidence', charId: boss.id, amount: where === 'office' ? 6 : 4 }, { type: 'heat', bar: 'federal', amount: 2 }], 'Somebody talks to the FBI', 'kept company with the wrong woman');
    const T = ensureThreats(s);
    if (T.fed.stage === 0) T.fed.next = Math.min(T.fed.next, s.week + 2);
    spread();
  } else if (a.kind === 'crew') {
    const h = a.handler ? s.characters[a.handler] : undefined;
    if (h?.alive && h.faction === 'player') {
      addOpinion(s, h.id, boss.id, 'Knows things about the boss he shouldn\'t', -3, 1);
      // A man who knows where the money is, and is sore: he may sell it.
      if (!h.informantFor && (hasTrait(h, 'Greedy') || opinion(s, h.id, boss.id) < 0) && r < 0.4) {
        const to = hostileRival(s) ?? (s.heat.federal >= 30 ? 'law' : anyRival(s));
        if (to) {
          h.informantFor = to;
          s.secrets.push({ id: `x${s.nextId++}`, ownerId: h.id, kind: 'informant', text: `${h.firstName} ${h.lastName} informs for ${to === 'law' ? 'the FBI' : famName(to)}`, knownBy: to === 'law' ? [] : [to], week: s.week });
        }
      }
    }
    spread();
  }
  // The setup counts your habits; nothing shows yet.
  if (her) hlog(H, s, `(Unknown to you: ${her.firstName} passed on ${where === 'office' ? 'what she saw in your office' : 'what you said'}.)`);
}

/** Warning signs, by what she is. */
const SIGN_TEXT: Record<AgentKind, string[]> = {
  rival: ['She asked who the fella with the Packard is. You never mentioned a Packard.', 'She wanted to know which nights you play cards, and where.', 'She looked at the safe longer than she looked at you.'],
  fbi: ['She asked what kind of business keeps a man out till three. Twice.', 'A Ford with two men in hats sat on her street the night you left.', 'She knew Wednesday was the count. You never told her.'],
  crew: ['She called one of your men by his first name, like an old friend.', 'She knew about the new drop before your capo did.'],
  setup: ['She asked, twice, whether you drive yourself home.', 'She wanted to know if your driver waits for you.', 'She kept asking when you\'d be alone.'],
};

function agentWeek(ctx: Ctx, H: HoneyState, a: Agent): void {
  const s = ctx.s;
  const boss = player(s);
  const c = s.characters[a.id];
  if (!c?.alive || !adultC(s, c)) { a.status = 'done'; return; }
  const close = closeLately(s, a.id);
  const w = watchFor(s, a.id);
  // A set-up that came due: whatever happened at the Starlight, she is gone, and now he knows.
  if (a.lure && !s.threats?.threats.some((t) => t.id === a.lure)) {
    a.status = 'done';
    w.known ??= s.week;
    w.how ??= 'late';
    w.susp = 100;
    const p = s.nightlife?.people[a.id];
    if (p) p.status = 'gone';
    say(ctx, H, `${c.firstName} ${c.lastName} left the island the same night. She was never going to come to room 9.`);
    return;
  }
  if (a.status === 'working') {
    if (close && a.kind !== 'setup' && hroll(s, `intel:${a.id}:${s.week}`) < (hasTrait(boss, 'Paranoid') ? 0.15 : 0.3)) leakIntel(ctx, a, 'pillow');
    if (close && a.kind === 'setup') a.intel++;
    // Signs: a guard notices, or he does.
    const cov = protectionFor(s, boss.id, 'night');
    if (close && hroll(s, `sign:${a.id}:${s.week}`) < perception(s, cov.cut) * 0.5) {
      const t = hpick(s, `signt:${a.id}:${s.week}`, SIGN_TEXT[a.kind]);
      const g = cov.guards[0];
      if (g && hroll(s, `signg:${a.id}:${s.week}`) < 0.5) {
        addSign(s, a.id, `${g.firstName} says: "${t}"`, 22);
        const gm = mindOf(s, g.id);
        if (gm) believe(s, gm, { k: 'rat', by: a.id, c: 0.5, src: 'saw', tr: true });
        w.how ??= 'guard';
      } else addSign(s, a.id, t, 14);
    }
    // The set-up asks him somewhere quiet (the honey trap's invitation).
    if (a.kind === 'setup' && !a.lure && close && a.intel >= 2 && (H.cool[`invite:${a.id}`] ?? -99) + 6 <= s.week && hroll(s, `inv:${a.id}:${s.week}`) < 0.4) {
      H.cool[`invite:${a.id}`] = s.week;
      queue(s, inviteEvent(s, a));
    }
  } else if (a.status === 'turned') {
    if (hroll(s, `turned:${a.id}:${s.week}`) < 0.3 && a.master !== 'player') {
      plantFalseBelief(s, { about: a.master, sourceId: a.id, kind: 'plan', isTrue: true, learnIn: 3, told: `${c.firstName}: "${a.master === 'law' ? 'The FBI wants your capos in front of a grand jury by spring.' : `${famName(a.master)} is short of men and long on talk.`}"`, truth: 'She told you the truth.' });
      hlog(H, s, `${c.firstName} brought you word from ${a.master === 'law' ? 'Newark' : famName(a.master)}.`);
    }
    if (hroll(s, `turnedburn:${a.id}:${s.week}`) < 0.03) { a.status = 'burned'; say(ctx, H, `${famName(a.master)} stopped trusting ${c.firstName}. She left town on the morning bus.`); }
  } else if (a.status === 'fed') {
    if (hroll(s, `fed:${a.id}:${s.week}`) < 0.25) {
      if (isMob(s, a.master)) {
        const r = s.rivals.find((x) => x.id === a.master);
        const lost = 1500 + Math.floor(hroll(s, `fedamt:${a.id}:${s.week}`) * 2500);
        if (r) r.money = Math.max(0, r.money - lost);
        tellLie(s, { teller: 'player', to: a.master, kind: 'canary', text: `A story you fed ${famName(a.master)} through ${c.firstName}`, truth: 'There was nothing to it', risk: 0.03, via: 'word' });
        say(ctx, H, `${famName(a.master)} acted on a story you fed ${c.firstName}: a truck that was never there, ${$(lost)} of theirs wasted.`);
      } else if (a.master === 'law') {
        fx(ctx, [{ type: 'heat', bar: 'federal', amount: -2 }], 'The FBI chases a story', `fed ${c.firstName} a story for the FBI`);
        hlog(H, s, `The FBI chased a story you fed ${c.firstName}.`);
      }
    }
    if (hroll(s, `fedwise:${a.id}:${s.week}`) < 0.04) { a.status = 'burned'; say(ctx, H, `${a.master === 'law' ? 'The FBI' : famName(a.master)} worked out that ${c.firstName}'s stories were yours. She is no use to them now, or to you.`); }
  }
  // He has seen enough: the truth, and a decision.
  if (a.status === 'working' && w.known === undefined && w.susp >= 75) { w.known = s.week; w.how ??= 'signs'; }
  if (w.known !== undefined && w.asked === undefined && a.status === 'working') { w.asked = s.week; H.stats.caught++; queue(s, agentEvent(s, a, w.how ?? 'signs')); }
}

/** Turning her: she decides (what she feels for you, what she fears, what they have on her). */
export function turnOdds(s: GameState, id: string): { chance: number; reasons: { label: string; value: number }[] } {
  const c = s.characters[id];
  const a = s.honey?.agents[id];
  const af = affairOf(s, id);
  const reasons: { label: string; value: number }[] = [{ label: 'Base', value: 30 }];
  if (af?.aff) reasons.push({ label: 'What she feels for you', value: Math.round(af.aff / 3) });
  const op = opinion(s, id, s.playerId);
  if (op) reasons.push({ label: op > 0 ? 'She likes you' : 'She has no love for you', value: Math.round(op / 4) });
  if (a?.kind === 'fbi') reasons.push({ label: 'The FBI has something on her', value: -15 });
  if (a?.kind === 'crew') reasons.push({ label: 'Her fella is one of yours anyway', value: 15 });
  if (a?.kind === 'setup') reasons.push({ label: 'The men behind her kill people', value: -20 });
  if (c && (hasTrait(c, 'Greedy') || hasTrait(c, 'Cowardly'))) reasons.push({ label: hasTrait(c, 'Greedy') ? 'Money talks to her' : 'She frightens easily', value: 12 });
  if (c && hasTrait(c, 'Loyal-to-a-fault')) reasons.push({ label: 'Loyal to the people who sent her', value: -25 });
  const sum = reasons.reduce((x, r) => x + r.value, 0);
  return { chance: clamp(sum / 100, 0.05, 0.9), reasons };
}

function agentAnswer(ctx: Ctx, id: string, how: 'turn' | 'feed' | 'confront' | 'drop' | 'watch', rolled?: boolean): void {
  const s = ctx.s;
  const H = ensureHoney(s);
  const c = s.characters[id];
  const a = H.agents[id];
  const w = watchFor(s, id);
  if (!c?.alive || !adultC(s, c)) return;
  const her = c.firstName;
  if (how === 'watch') { hlog(H, s, `You said nothing to ${her}. Yet.`); return; }
  if (how === 'turn') {
    if (!a || a.status !== 'working') return;
    const ok = rolled ?? hroll(s, `turn:${id}:${s.week}`) < turnOdds(s, id).chance;
    if (ok) { a.status = 'turned'; H.stats.turned++; dropLure(s, id); say(ctx, H, `${her} works for you now. What she brings ${a.master === 'law' ? 'Newark' : famName(a.master)} is what you give her; what she brings you is theirs.`); }
    else bolted(ctx, id);
    return;
  }
  if (how === 'feed') {
    if (!a || a.status !== 'working') return;
    a.status = 'fed';
    dropLure(s, id);
    say(ctx, H, `${her} doesn't know you know. From now on, everything she hears from you is a story.`);
    return;
  }
  if (how === 'confront') {
    if (a && (a.status === 'working' || a.status === 'fed' || a.status === 'turned')) {
      a.status = 'burned';
      w.known ??= s.week;
      w.how ??= 'confessed';
      dropLure(s, id);
      if (isMob(s, a.master)) bumpTension(s, 'player', a.master, 8, `You caught their woman, ${her}`);
      const p = s.nightlife?.people[id];
      if (p) p.status = 'gone';
      const af = affairOf(s, id);
      if (af && af.stage !== 'ended') endAffair(ctx, ensureWomen(s), af, c, 'boss', 'You had it out with her: she was working you.');
      say(ctx, H, `You had it out with ${her}. She cried, then she stopped crying and told you who sent her. She was on the morning bus to Philadelphia.`);
    } else {
      // She wasn't. And now she knows what you thought of her.
      addOpinion(s, id, s.playerId, 'He thought I was a rat', -25, 1);
      w.susp = 0;
      w.cleared = s.week;
      const af = affairOf(s, id);
      if (af && af.stage !== 'ended') endAffair(ctx, ensureWomen(s), af, c, 'her', 'You accused her of working you. She wasn\'t.');
      scornAdd(s, id, 'woman', 'he called me a rat to my face, and I never did a thing', 55);
      say(ctx, H, `You had it out with ${her}. She had no idea what you were talking about, and then she did. She will not forget it.`);
    }
    return;
  }
  // Drop it, quietly.
  if (a && (a.status === 'working' || a.status === 'fed' || a.status === 'turned')) { a.status = 'done'; dropLure(s, id); }
  const af = affairOf(s, id);
  if (af && af.stage !== 'ended') endAffair(ctx, ensureWomen(s), af, c, 'boss', 'You ended it, quietly.');
  const g = s.nightlife?.goomars[id];
  if (g && !g.ended) g.ended = { week: s.week, why: 'You ended it, quietly' };
  say(ctx, H, `You stopped seeing ${her}. No scene, no reasons.`);
}

/** Turning her failed: she runs to her masters, and they know he knows. */
function bolted(ctx: Ctx, id: string): void {
  const s = ctx.s;
  const H = ensureHoney(s);
  const a = H.agents[id];
  const c = s.characters[id];
  if (!a || !c) return;
  a.status = 'burned';
  dropLure(s, id);
  if (isMob(s, a.master)) bumpTension(s, 'player', a.master, 10, `They know you found their woman`);
  if (a.master === 'law') fx(ctx, [{ type: 'heat', bar: 'federal', amount: 3 }], 'She ran to the FBI', `tried to turn ${c.firstName}`);
  const p = s.nightlife?.people[id];
  if (p) p.status = 'gone';
  say(ctx, H, `${c.firstName} said she'd think about it. By morning she was gone, and ${a.master === 'law' ? 'the FBI' : famName(a.master)} knew you were onto her.`);
}

/* ------------------------------------------------------------------ */
/* Mistresses: the mouth, the want, the threat                         */
/* ------------------------------------------------------------------ */

function mistressFor(s: GameState, id: string): Mistress {
  const H = ensureHoney(s);
  const ex = H.mistresses[id];
  if (ex) return ex;
  const c = s.characters[id];
  const p = s.nightlife?.people[id];
  const T = (t: Parameters<typeof hasTrait>[1]) => (c && hasTrait(c, t) ? 1 : 0);
  const mouth = clamp(Math.round(100 - (p?.discretion ?? 55) + T('Hot-headed') * 15 + T('Drinker') * 20 - T('Patient') * 15 - T('Honest') * 5));
  const amb = s.women?.arcs[id]?.amb;
  const r = hroll(s, `want:${id}`);
  const claim = H.claims[id];
  const want: Want | undefined = claim && claim.fallout !== 'cold' ? 'apartment'
    : T('Greedy') || amb === 'money' ? 'money'
    : (amb === 'security' && c && !marriedOf(s, c)) ? (r < 0.5 ? 'wife' : 'ring')
    : T('Ambitious') ? (r < 0.5 ? 'job' : 'money')
    : T('Patient') && r < 0.6 ? undefined
    : (['money', 'apartment', 'ring', 'job', undefined] as (Want | undefined)[])[Math.floor(r * 5)];
  const m: Mistress = { id, since: s.week, mouth, ...(want ? { want } : {}), stage: 0, next: s.week + 6 + Math.floor(hroll(s, `wnext:${id}`) * 7), paid: 0, leaks: 0 };
  H.mistresses[id] = m;
  return m;
}

/** Is she still his (an affair, a goomar)? */
function stillHis(s: GameState, id: string): boolean {
  const a = affairOf(s, id);
  if (a && a.stage === 'affair') return true;
  const g = s.nightlife?.goomars[id];
  return !!g && !g.ended;
}

/** A loud mouth: one leak, in one of the directions it can go. */
export function mistressLeak(ctx: Ctx, id: string): void {
  const s = ctx.s;
  const H = ensureHoney(s);
  const c = s.characters[id];
  if (!c || honeyBlock(s, id)) return;
  const m = H.mistresses[id] ?? mistressFor(s, id);
  m.leaks++;
  H.stats.leaks++;
  const boss = player(s);
  const r = hroll(s, `mleak:${id}:${s.week}:${m.leaks}`);
  let line: string;
  if (r < 0.3) {
    pressItem(s, { s: 'spout', b: `Spout Off: Which club owner's lady friend told the whole beauty parlor on Pacific Avenue what he keeps in his desk drawer? Asking for the county detectives.`, a: 'boss', fx: { wife: -2, heat: [['local', 1]] } });
    line = `${c.firstName} talks under the dryer at the beauty parlor. Spout Off has it this week.`;
  } else if (r < 0.55 && boss.spouseId) {
    wifeHears(s, 18, 'what the women at the parlor were saying');
    line = `${c.firstName} said too much at the beauty parlor, and the parlor is where your wife gets her hair done.`;
  } else if (r < 0.8) {
    const { old } = divide(s);
    fx(ctx, old.slice(0, 4).map((o) => ({ type: 'opinion', from: o.id, to: boss.id, amount: -2, reason: 'His girlfriend knows the family\'s business', decay: 1, label: 'The crew heard' }) as Effect), 'The crew heard', 'kept a woman with a loud mouth');
    line = `${c.firstName} told a soldier's wife what you said about his capo. Now the capo knows.`;
  } else {
    const rv = anyRival(s);
    if (rv) { const sec = addSecret(s, boss, 'affair', [rv]); if (!sec.knownBy.includes(rv)) sec.knownBy.push(rv); }
    line = `${c.firstName} had three Manhattans at a ${rv ? famName(rv).replace(/^the /, '') : 'rival'} bar and talked about you all night.`;
  }
  say(ctx, H, line);
}

function mistressWeek(ctx: Ctx, H: HoneyState): void {
  const s = ctx.s;
  for (const id of involvedWith(s)) if (stillHis(s, id)) {
    const a = affairOf(s, id);
    if (!H.mistresses[id] && (!a || s.week - a.since >= 3)) mistressFor(s, id);
  }
  for (const m of Object.values(H.mistresses)) {
    const c = s.characters[m.id];
    if (!c?.alive || !adultC(s, c)) { delete H.mistresses[m.id]; continue; }
    const his = stillHis(s, m.id);
    // Over: a woman who wanted something, and was left with nothing, remembers.
    if (!his) {
      if (m.settled === undefined && m.stage >= 2 && m.stage < 4) { scornAdd(s, m.id, 'woman', `he dropped me the minute I asked for ${WANT_TEXT[m.want ?? 'money']}`, 30 + m.stage * 10); m.settled = { week: s.week, how: 'it ended' }; }
      if (m.settled && s.week - m.settled.week > 26) delete H.mistresses[m.id];
      if (m.stage < 4 || m.settled) continue;
    }
    // The mouth.
    if (his && m.mouth >= 40 && hroll(s, `mouth:${m.id}:${s.week}`) < m.mouth / 500) mistressLeak(ctx, m.id);
    if (m.settled || !m.want) continue;
    // A promise kept her quiet; a broken one brings her back angrier.
    if (m.promised !== undefined) {
      if (s.week <= m.promised) continue;
      m.promised = undefined;
      m.broken = s.week;
      m.stage = 3;
      m.next = s.week;
      hlog(H, s, `${c.firstName}: "You promised." She hasn't forgotten.`);
    }
    if (m.stage === 4 && m.due !== undefined && s.week >= m.due) { expose(ctx, m); continue; }
    if (s.week < m.next || !his) continue;
    const pace = hasTrait(c, 'Patient') ? 8 : hasTrait(c, 'Vengeful') || hasTrait(c, 'Hot-headed') ? 3 : 5;
    m.next = s.week + pace + Math.floor(hroll(s, `mpace:${m.id}:${s.week}`) * 3);
    if (m.stage === 0) { m.stage = 1; hlog(H, s, `${c.firstName} mentioned ${WANT_TEXT[m.want]} again. Lightly. For now.`); continue; }
    if (m.stage === 1 || m.stage === 2) { m.stage = (m.stage + 1) as 2 | 3; queue(s, wantEvent(s, m)); continue; }
    if (m.stage === 3) {
      m.stage = 4;
      m.lever = leverOf(s, m);
      m.due = s.week + 2;
      queue(s, threatEvent(s, m));
    }
  }
}

/** Who she says she'll tell: the wife if there is one and she is hurt, the feds if she knows business, a rival if she has friends there. */
function leverOf(s: GameState, m: Mistress): Lever {
  const c = s.characters[m.id];
  const boss = player(s);
  const knows = m.leaks > 0 || m.mouth >= 60 || (s.honey?.agents[m.id]?.intel ?? 0) > 0;
  const p = s.nightlife?.people[m.id];
  if (p && isMob(s, p.side)) return 'rival';
  if (c && hasTrait(c, 'Vengeful') && knows) return 'feds';
  if (boss.spouseId && hroll(s, `lever:${m.id}`) < 0.6) return 'wife';
  return knows ? 'feds' : 'rival';
}

/** The threat lands: she does what she said she would. */
function expose(ctx: Ctx, m: Mistress): void {
  const s = ctx.s;
  const H = ensureHoney(s);
  const c = s.characters[m.id];
  const boss = player(s);
  if (!c) return;
  const lever: Lever = m.lever === 'wife' && !boss.spouseId ? 'rival' : m.lever ?? 'wife';
  m.settled = { week: s.week, how: `she told ${LEVER_TEXT[lever]}` };
  H.stats.threats++;
  let line: string;
  if (lever === 'wife') {
    const t = boss.spouseId ? peekTie(s, boss.spouseId) : undefined;
    if (t) { t.sus = 100; t.knows ??= s.week; bondRemember(s, t, 'found', 'his girlfriend came to my door and told me everything', -25); nudge(t, { aff: -15, trust: -20, resent: 20 }); }
    if (boss.spouseId) addOpinion(s, boss.spouseId, boss.id, 'His girlfriend came to my door', -25, 0);
    line = `${c.firstName} rang your doorbell on a Sunday afternoon and told your wife everything.`;
  } else if (lever === 'feds') {
    fx(ctx, [{ type: 'evidence', charId: boss.id, amount: 10 }, { type: 'heat', bar: 'federal', amount: 4 }], 'She talked to the FBI', `crossed ${c.firstName}`);
    const T = ensureThreats(s);
    T.fed.next = Math.min(T.fed.next, s.week + 1);
    line = `${c.firstName} sat in a room in Newark for six hours and told two men in gray suits what she knows.`;
  } else {
    const rv = anyRival(s);
    if (rv) { const sec = addSecret(s, boss, 'affair', [rv]); if (!sec.knownBy.includes(rv)) sec.knownBy.push(rv); bumpTension(s, 'player', rv, 8, `${c.firstName} brought them your secrets`); }
    line = `${c.firstName} took what she knows to ${rv ? famName(rv) : 'another family'}. They were very grateful.`;
  }
  const af = affairOf(s, m.id);
  if (af && af.stage !== 'ended') endAffair(ctx, ensureWomen(s), af, c, 'her', 'She made good on her threat.');
  const g = s.nightlife?.goomars[m.id];
  if (g && !g.ended) g.ended = { week: s.week, why: 'She made good on her threat' };
  scornAdd(s, m.id, 'woman', 'he thought I was bluffing', 45);
  say(ctx, H, line);
}

/** How likely she is to back down if he calls her bluff (pure). */
export function bluffOdds(s: GameState, id: string): number {
  const c = s.characters[id];
  const m = s.honey?.mistresses[id];
  const af = affairOf(s, id);
  if (!c || !m) return 0;
  let p = 0.45 + (af?.aff ?? 0) / 300 - m.stage * 0.03;
  if (hasTrait(c, 'Cowardly') || hasTrait(c, 'Patient')) p += 0.2;
  if (hasTrait(c, 'Vengeful') || hasTrait(c, 'Hot-headed')) p -= 0.25;
  if (m.broken !== undefined) p -= 0.15;
  return clamp(p, 0.05, 0.9);
}

export function awayOdds(s: GameState, id: string): number {
  const c = s.characters[id];
  if (!c) return 0;
  return clamp(0.6 + (hasTrait(c, 'Greedy') ? 0.15 : 0) - (hasTrait(c, 'Vengeful') ? 0.25 : 0) - ((s.nightlife?.people[id]?.fam.kids.length ?? 0) > 0 ? 0.15 : 0), 0.1, 0.9);
}

export function consigOdds(s: GameState): number {
  const k = seatHolder(s, 'consigliere');
  return k ? clamp(0.4 + k.attributes.diplomacy / 200, 0.1, 0.9) : 0;
}

/** What paying her costs. */
export function settleCost(m: Mistress): number {
  return m.want ? Math.max(500, WANT_COST[m.want] || 2000) : 1000;
}

function settle(ctx: Ctx, id: string, how: SettleHow): void {
  const s = ctx.s;
  const H = ensureHoney(s);
  const m = H.mistresses[id];
  const c = s.characters[id];
  const boss = player(s);
  if (!m || !c || m.settled || honeyBlock(s, id)) return;
  const her = c.firstName;
  const done = (text: string) => { m.settled = { week: s.week, how: text }; m.stage = 0; m.due = undefined; H.stats.settled++; };
  switch (how) {
    case 'pay': {
      const cost = settleCost(m);
      if (m.want === 'job') {
        fx(ctx, [{ type: 'money', amount: -500, label: `${her}'s brother on the payroll` }, { type: 'familyOpinion', amount: -1, reason: 'A girlfriend\'s brother on the payroll', label: 'The family noticed' }], 'A job for her brother', `gave ${her}'s brother a job`);
      } else if (m.want === 'wife') {
        addOpinion(s, id, boss.id, 'He bought me off instead of marrying me', -10, 1);
        spendPocket(ctx, 2000, `${her}: a settlement`, `hsettle:${id}`);
      } else spendPocket(ctx, cost, `${her}: ${WANT_TEXT[m.want ?? 'money']}`, `hsettle:${id}`);
      m.paid += cost;
      addOpinion(s, id, boss.id, 'He took care of me', 8, 1);
      done('paid');
      say(ctx, H, m.want === 'wife' ? `You can't marry ${her}. You gave her money instead. She took it, and looked at you a long time.` : `${her} got ${WANT_TEXT[m.want ?? 'money']}. For now, she is happy, and quiet.`);
      return;
    }
    case 'promise':
      m.promised = s.week + 10;
      m.stage = 2;
      m.due = undefined;
      say(ctx, H, `You promised ${her} ${WANT_TEXT[m.want ?? 'money']}. Ten weeks, she says. She is counting.`);
      return;
    case 'bluff': {
      if (hroll(s, `bluff:${id}:${s.week}`) < bluffOdds(s, id)) { done('she backed down'); scornAdd(s, id, 'woman', 'he called my bluff and laughed', 30); say(ctx, H, `"Go ahead," you told ${her}. She didn't. She also hasn't smiled at you since.`); }
      else expose(ctx, m);
      return;
    }
    case 'away': {
      spendPocket(ctx, 3000, `${her}: a train ticket and a new start`, `haway:${id}`);
      if (hroll(s, `away:${id}:${s.week}`) < awayOdds(s, id)) {
        done('sent away');
        const af = affairOf(s, id);
        if (af && af.stage !== 'ended') endAffair(ctx, ensureWomen(s), af, c, 'boss', 'You sent her to Florida with money.');
        const g = s.nightlife?.goomars[id];
        if (g && !g.ended) g.ended = { week: s.week, why: 'Sent to Florida' };
        const p = s.nightlife?.people[id];
        if (p) { p.status = 'gone'; p.venue = 'Miami Beach'; }
        scornAdd(s, id, 'woman', 'he shipped me to Florida like a crate of oranges', 35);
        say(ctx, H, `${her} took the money and the Silver Meteor to Miami. She sent a postcard with nothing written on it.`);
      } else { m.due = s.week + 1; say(ctx, H, `${her} tore the train ticket in half. "I'm not going anywhere."`); }
      return;
    }
    case 'consig': {
      const k = seatHolder(s, 'consigliere');
      if (!k) return;
      fx(ctx, [{ type: 'money', amount: -1500, label: `${k.firstName} handled ${her}` }], 'The consigliere handled it', `had ${k.firstName} handle ${her}`);
      if (hroll(s, `consig:${id}:${s.week}`) < consigOdds(s)) {
        done('the consigliere settled it');
        addOpinion(s, k.id, boss.id, 'Had me clean up his personal mess', -3, 1);
        say(ctx, H, `${k.firstName} took ${her} to lunch at the Shalimar. Nobody knows what was said. She hasn't made a threat since.`);
      } else { m.due = s.week; expose(ctx, m); }
      return;
    }
    case 'worse': {
      // Only ever the boss's own explicit order. Off-screen; it costs him for years.
      done('she disappeared');
      killCharacter(ctx, id, 'Left the club one night and was never seen again', 'player');
      const { old, young } = divide(s);
      fx(ctx, [
        { type: 'heat', bar: 'local', amount: 6 },
        { type: 'evidence', charId: boss.id, amount: 5 },
        { type: 'respect', amount: -2, label: 'A woman disappeared' },
        ...old.map((o) => ({ type: 'opinion', from: o.id, to: boss.id, amount: -10, reason: 'We don\'t touch women. We never did', decay: 0, label: 'The old school' }) as Effect),
        ...young.slice(0, 4).map((y) => ({ type: 'opinion', from: y.id, to: boss.id, amount: -3, reason: 'Even we have rules', decay: 1, label: 'The crew' }) as Effect),
      ], 'She disappeared', `had ${her} taken care of`);
      wifeHears(s, 30, `the girl from the club who disappeared`);
      rumor(s, `${her} ${c.lastName} hasn't been seen since Tuesday. People look at the boss and say nothing.`, boss.id);
      pressItem(s, { s: 'blotter', h: 'CLUB HOSTESS MISSING', b: `Police are asking anyone who saw ${c.firstName} ${c.lastName}, 2${Math.floor(hroll(s, `age:${id}`) * 9)}, after she left a Pacific Avenue nightclub last week to come forward.`, p: 45, a: 'town' });
      say(ctx, H, `${her} didn't come home. You never said the words out loud, and you never will.`);
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The women who come to him: a drink sent over, a set-up              */
/* ------------------------------------------------------------------ */

/** A stranger at the bar (an adult woman of the world, new in town). The layer's own dice make her. */
function stranger(s: GameState): Character {
  const main = s.rng;
  s.rng = hashSeed(`${s.seed}|honey|stranger|${s.week}`);
  try {
    const age = 22 + Math.floor(hroll(s, `sage:${s.week}`) * 12);
    const c = makeCharacter(s, { gender: 'F', age, rank: 'civilian', faction: 'none', nickname: false, wealth: 400 });
    while (ageOn(c.birth, s.date) < 21) c.birth = { ...c.birth, y: c.birth.y - 1 };
    c.orientation = 'straight';
    c.ambition = 'Whatever she came to town for';
    return c;
  } finally { s.rng = main; }
}

function approachWeek(ctx: Ctx, H: HoneyState): void {
  const s = ctx.s;
  if (s.week < 10 || s.week % 4 !== 1 || (H.cool.approach ?? -99) + 12 > s.week) return;
  if (s.eventQueue.some((e) => e.defId.startsWith('honey_')) || s.pendingEvents.some((e) => e.defId.startsWith('honey_'))) return;
  const boss = player(s);
  if (!boss.alive || !isFree(s, boss) || !adultC(s, boss)) return;
  // A single boss gets her as his card (single.ts), not a popup: only when the card is free.
  const single = !SINGLE_TEST.off && isSingle(s) && boss.gender === 'M';
  if (single && !approachSlotFree(s)) return;
  const hostile = hostileRival(s);
  const fed = (s.threats?.fed.stage ?? 0) >= 1;
  if (hroll(s, `appr:${s.week}`) >= 0.15 + (hostile ? 0.12 : 0) + (fed ? 0.05 : 0)) return;
  H.cool.approach = s.week;
  const c = stranger(s);
  H.seen[c.id] = s.week;
  const r = hroll(s, `apprkind:${c.id}`);
  const kind: AgentKind | undefined = hostile && r < 0.35 ? 'setup' : hostile && r < 0.6 ? 'rival' : fed && r < 0.75 ? 'fbi' : undefined;
  if (kind) {
    H.agents[c.id] = { id: c.id, kind, master: kind === 'fbi' ? 'law' : hostile!, since: s.week, status: 'working', intel: 0 };
    H.stats.agents++;
  }
  if (single) takeHoneyApproach(s, c, !!kind);
  else queue(s, approachEvent(s, c));
}

function approachAnswer(ctx: Ctx, id: string, how: 'office' | 'motel' | 'drink' | 'probe'): void {
  const s = ctx.s;
  const H = ensureHoney(s);
  const c = s.characters[id];
  if (!c || honeyBlock(s, id)) return;
  const a = H.agents[id];
  const her = c.firstName;
  if (how === 'drink') { hlog(H, s, `You sent ${her} a drink back and went home.`); return; }
  if (how === 'probe') {
    const cut = protectionFor(s, s.playerId, 'night').cut;
    const g = protectionFor(s, s.playerId, 'night').guards[0] ?? seatHolder(s, 'consigliere');
    const p = perception(s, cut) + 0.3;
    const w = watchFor(s, id);
    if (a && hroll(s, `aprobe:${id}`) < p) {
      w.known = s.week; w.how = 'probe'; w.susp = 100;
      if (a.status === 'working') { a.status = 'burned'; H.stats.caught++; }
      if (isMob(s, a.master)) bumpTension(s, 'player', a.master, 6, `You made their woman, ${her}`);
      say(ctx, H, `${g ? g.firstName : 'Your man'} made one phone call. ${her} was ${a.kind === 'fbi' ? 'on a Newark payroll' : `sent by ${famName(a.master)}`}${a.kind === 'setup' ? ', and two men were waiting in her car' : ''}. She left town that night.`);
    } else if (a) { addSign(s, id, `${g ? g.firstName : 'Your man'} couldn't find out where ${her} came from. Nobody could.`, 25); say(ctx, H, `Nobody could say where ${her} came from. She drank her drink and left.`); }
    else { w.cleared = s.week; addOpinion(s, id, s.playerId, 'He had me checked out like a stolen car', -10, 1); say(ctx, H, `${her} is a schoolteacher from Allentown on her summer off. She found out you had her checked, and laughed at you on her way out.`); }
    return;
  }
  H.dares.push({ w: s.week, id, out: 'yes', at: how === 'office' ? 'desk' : 'motel' });
  if (H.dares.length > 20) H.dares.splice(0, H.dares.length - 20);
  if (how === 'office') {
    say(ctx, H, `${her} went up the stairs ahead of you. What happened in the office stayed in the office.`);
    if (a && a.status === 'working' && a.kind !== 'setup') leakIntel(ctx, a, 'office');
    if (a?.kind === 'setup') a.intel++;
    return;
  }
  // Her motel: the set-up's door is open tonight.
  if (a?.kind === 'setup' && a.status === 'working' && isMob(s, a.master)) {
    const t = planLure(s, a.master as RivalId, id, 0);
    if (t) { a.lure = t.id; H.stats.lures++; addSign(s, id, `${her} asked you to come alone, and didn't want your driver waiting.`, 20); }
    say(ctx, H, `${her} gave you the key to room 9 at the Starlight and told you to give her an hour.`);
    return;
  }
  say(ctx, H, `Room 9 at the Starlight. The neon sign buzzed all night. Then it was morning.`);
  if (a && a.status === 'working') leakIntel(ctx, a, 'pillow');
}

function inviteAnswer(ctx: Ctx, id: string, how: 'alone' | 'covered' | 'stay'): void {
  const s = ctx.s;
  const H = ensureHoney(s);
  const a = H.agents[id];
  const c = s.characters[id];
  if (!c || honeyBlock(s, id)) return;
  if (how === 'stay') { hlog(H, s, `You sent ${c.firstName} flowers and stayed home.`); return; }
  if (a?.kind === 'setup' && a.status === 'working' && isMob(s, a.master)) {
    const t = planLure(s, a.master as RivalId, id, how === 'covered' ? 0.45 : 0);
    if (t) { a.lure = t.id; H.stats.lures++; }
    addSign(s, id, `${c.firstName} wanted you alone, at a motel, at an hour she picked.`, 20);
    say(ctx, H, how === 'covered' ? `You'll go to the Starlight. Two of your men will be in a car across the Boulevard.` : `You'll go to the Starlight. Alone, the way she asked.`);
    return;
  }
  say(ctx, H, `Room 9 at the Starlight. Then it was morning.`);
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function hev(s: GameState, key: string, title: string, text: string, choices: Choice[], actors: string[], def?: string, prio = 50): EventInstance {
  return { iid: `ev${s.nextId++}`, defId: `honey_${key}`, week: s.week, mandatory: false, priority: prio, title, text, choices, defaultChoiceId: def ?? choices[choices.length - 1].id, meta: { asked: 1, family: 1, theme: 'romance' }, actors: actors.slice(0, 3) };
}

function queue(s: GameState, ev: EventInstance | undefined): void {
  if (ev) s.eventQueue.push(ev);
}

const HOW_TEXT: Record<NonNullable<import('./honeyState').Watch['how']>, string> = {
  signs: 'It adds up. Every little thing you noticed points the same way.',
  guard: 'Your man has been watching her, and he is sure.',
  probe: 'The man you had look into her came back with it.',
  confessed: 'She told you herself.',
  late: 'You found out the hard way.',
};

function agentEvent(s: GameState, a: Agent, how: NonNullable<import('./honeyState').Watch['how']>): EventInstance {
  const c = s.characters[a.id];
  const her = c.firstName;
  const t = turnOdds(s, a.id);
  const who = a.kind === 'crew' && a.handler ? `${her} ${AGENT_TEXT.crew.replace('one of your own men', nm(s, a.handler))}.` : `${her} ${AGENT_TEXT[a.kind]}${a.kind === 'rival' || a.kind === 'setup' ? ` (${famName(a.master)})` : ''}.`;
  return hev(s, 'agent', `${her}: what she really is`, `${HOW_TEXT[how]} ${who} She doesn't know you know.`, [
    { id: 'turn', label: `Turn her: she works for you now`, detail: `She decides: about ${pct(t.chance)} (${t.reasons.slice(1, 3).map((r) => `${r.value > 0 ? '+' : ''}${r.value} ${r.label.toLowerCase()}`).join(', ')}). If she says no, she runs to them.`, because: `tried to turn ${her}`, effects: [HX({ op: 'agent', id: a.id, how: 'turn' }, `${her}`)] },
    { id: 'feed', label: 'Keep her, and feed her lies', detail: 'Everything she carries is your story now. They act on it until they work it out.', because: `fed ${her} stories`, effects: [HX({ op: 'agent', id: a.id, how: 'feed' }, `${her}`)] },
    { id: 'confront', label: 'Have it out with her', detail: 'She confesses and leaves the island. Her people learn you know.', because: `had it out with ${her}`, effects: [HX({ op: 'agent', id: a.id, how: 'confront' }, `${her}`)] },
    { id: 'drop', label: 'End it. Quietly.', detail: 'No scene. She goes back to them with nothing more.', because: `stopped seeing ${her}`, effects: [HX({ op: 'agent', id: a.id, how: 'drop' }, `${her}`)] },
    { id: 'watch', label: 'Say nothing yet', detail: 'Decide later, from her dossier. Meanwhile she keeps listening.', because: `kept quiet about ${her}`, effects: [HX({ op: 'agent', id: a.id, how: 'watch' }, `${her}`)] },
  ], [a.id], 'watch', 60);
}

function wantEvent(s: GameState, m: Mistress): EventInstance {
  const c = s.characters[m.id];
  const her = c.firstName;
  const want = m.want ?? 'money';
  const cost = settleCost(m);
  const demand = m.stage >= 3;
  const lines: Record<Want, string> = {
    money: demand ? `"I'm not a girl you keep in a drawer. I want money of my own, in a bank, in my name. ${$(cost)}."` : `"A girl can't live on flowers. I was thinking, something of my own put by. Just in case."`,
    apartment: demand ? `"I'm living out of a suitcase at my sister's because of you. I want an apartment, in my name. This month."` : `"There's a place on Atlantic Avenue, with a view of the ocean. Wouldn't it be nice if I had a door you could knock on?"`,
    ring: demand ? `"Everybody on this island knows what I am to you. I want something that says it. A ring. A real one."` : `"I saw the prettiest ring in the window at Ostendorf's."`,
    job: demand ? `"My brother Eddie needs work. Real work, with your people. You can do that with one phone call, and you will."` : `"My kid brother is a good boy. He just needs somebody to give him a chance."`,
    wife: demand ? `"I'm thirty years old. I'm done waiting for you to leave her. Choose."` : `"Do you ever think about what it would be like, if it were just us? Out in the open?"`,
  };
  const give = want === 'wife' ? `"I can't marry you. But you'll never want for anything." (${$(2000)})` : want === 'job' ? `Put her brother on the payroll` : `"It's yours." (${$(cost)} from your pocket)`;
  return hev(s, 'want', demand ? `${her} wants an answer` : `${her} wants something`, `${lines[want]}${m.broken !== undefined ? ' (You promised her once already.)' : ''}`, [
    { id: 'give', label: give, detail: 'She is happy, and quiet. A woman who learns that asking works may ask again.', because: `gave ${her} ${WANT_TEXT[want]}`, effects: [HX({ op: 'want', id: m.id, how: 'give' }, `${her}`)] },
    { id: 'refuse', label: '"No."', detail: demand ? 'She will not take it well. Next comes a threat.' : 'She lets it go, this time.', because: `told ${her} no`, effects: [HX({ op: 'want', id: m.id, how: 'refuse' }, `${her}`)] },
    { id: 'promise', label: '"Soon. I promise."', detail: 'Ten weeks of quiet. Then she wants it, or she wants your head.', because: `promised ${her} ${WANT_TEXT[want]}`, effects: [HX({ op: 'want', id: m.id, how: 'promise' }, `${her}`)] },
  ], [m.id], 'promise', 46);
}

function threatEvent(s: GameState, m: Mistress): EventInstance {
  const c = s.characters[m.id];
  const her = c.firstName;
  const lever = m.lever ?? 'wife';
  const cost = settleCost(m);
  const k = seatHolder(s, 'consigliere');
  const threat: Record<Lever, string> = {
    wife: `"Give me what I asked for, or I'll go tell your wife myself. I know which house. I know which church."`,
    feds: `"I know what's in the desk drawer. I know where the Thursday money goes. There are men in Newark who'd buy me a very nice lunch to hear it."`,
    rival: `"You're not the only big man on this island. I know people who'd be very interested in what you say in your sleep."`,
  };
  const choices: Choice[] = [
    { id: 'pay', label: `Pay her (${$(m.want === 'job' ? 500 : m.want === 'wife' ? 2000 : cost)})`, detail: 'It ends this, today. She knows now what a threat is worth.', because: `paid ${her} off`, effects: [HX({ op: 'threat', id: m.id, how: 'pay' }, `${her}'s threat`)] },
    { id: 'bluff', label: '"Go ahead."', detail: `Call her bluff: about ${pct(bluffOdds(s, m.id))} she backs down. If not, she does it.`, because: `called ${her}'s bluff`, effects: [HX({ op: 'threat', id: m.id, how: 'bluff' }, `${her}'s threat`)] },
    { id: 'away', label: `Send her away: Florida, with ${$(3000)}`, detail: `About ${pct(awayOdds(s, m.id))} she takes the ticket. If not, she means it more.`, because: `sent ${her} away`, effects: [HX({ op: 'threat', id: m.id, how: 'away' }, `${her}'s threat`)] },
  ];
  if (k) choices.push({ id: 'consig', label: `Have ${k.firstName} handle it`, detail: `${$(1500)} of the Family's. About ${pct(consigOdds(s))} he makes it go away.`, because: `had ${k.firstName} handle ${her}`, effects: [HX({ op: 'threat', id: m.id, how: 'consig' }, `${her}'s threat`)] });
  choices.push({ id: 'promise', label: '"You\'ll have it. Give me time."', detail: 'Ten more weeks. A second broken promise will not be forgiven.', because: `bought time with ${her}`, effects: [HX({ op: 'threat', id: m.id, how: 'promise' }, `${her}'s threat`)] });
  return hev(s, 'threat', `${her}: "Or else"`, `${threat[lever]} She wants ${WANT_TEXT[m.want ?? 'money']} by the end of next week. (Worse things can be done about a woman like this, and some bosses do them. If you want that, it is in her dossier, and it is yours alone to order.)`, choices, [m.id], 'promise', 62);
}

function approachEvent(s: GameState, c: Character): EventInstance {
  const her = c.firstName;
  const g = protectionFor(s, s.playerId, 'night').guards[0] ?? seatHolder(s, 'consigliere');
  return hev(s, 'approach', `A drink from the end of the bar`, `The bartender at the Riptide sets down a rye, neat, the way you take it. "From the lady." ${her} ${c.lastName}, somewhere under thirty, a green dress, in town for the week and staying at the Starlight on the Boulevard. She raises her glass. She knows exactly who you are.`, [
    { id: 'office', label: 'Take her up to your office', detail: 'Her idea as much as yours. What happens upstairs stays upstairs, mostly.', because: `took ${her} up to the office`, effects: [HX({ op: 'approach', id: c.id, how: 'office' }, `${her} at the Riptide`)] },
    { id: 'motel', label: 'Go back to the Starlight with her', detail: 'Her place, her door, her hour.', because: `went to the Starlight with ${her}`, effects: [HX({ op: 'approach', id: c.id, how: 'motel' }, `${her} at the Riptide`)] },
    { id: 'probe', label: `Have ${g ? g.firstName : 'somebody'} find out who she is first`, detail: 'A phone call or two. If she is what she looks like, she will not like being checked.', because: `had ${her} checked out`, effects: [HX({ op: 'approach', id: c.id, how: 'probe' }, `${her} at the Riptide`)] },
    { id: 'drink', label: 'Send a drink back, and go home', detail: 'Nothing ventured.', because: `sent ${her} a drink back`, effects: [HX({ op: 'approach', id: c.id, how: 'drink' }, `${her} at the Riptide`)] },
  ], [c.id], 'drink', 48);
}

function inviteEvent(s: GameState, a: Agent): EventInstance {
  const c = s.characters[a.id];
  const her = c.firstName;
  return hev(s, 'invite', `${her}: "Just you"`, `${her} slips a key into your pocket: room 9 at the Starlight, Saturday, after midnight. "Don't bring your driver. Don't bring anybody. I want you all to myself for once."`, [
    { id: 'alone', label: 'Go, alone, the way she asked', detail: 'Her terms.', because: `went to meet ${her} alone`, effects: [HX({ op: 'invite', id: a.id, how: 'alone' }, `${her}'s invitation`)] },
    { id: 'covered', label: 'Go, with two of your men in a car across the street', detail: 'She need not know. If anything is wrong, it is less wrong.', because: `went to meet ${her}, covered`, effects: [HX({ op: 'invite', id: a.id, how: 'covered' }, `${her}'s invitation`)] },
    { id: 'stay', label: 'Send her flowers, and stay home', detail: 'Something about it.', because: `stayed home from ${her}'s invitation`, effects: [HX({ op: 'invite', id: a.id, how: 'stay' }, `${her}'s invitation`)] },
  ], [a.id], 'stay', 55);
}

/* ------------------------------------------------------------------ */
/* Orders: previews and their outcomes                                 */
/* ------------------------------------------------------------------ */

function base(title: string, because: string, disabledReason?: string): ActionPreview {
  return { title, effects: [], cost: 0, because, category: 'event', disabledReason };
}

function prober(s: GameState): Character | undefined {
  const g = protectionFor(s, s.playerId, 'any').guards.find((x) => x.alive && isFree(s, x));
  return seatHolder(s, 'consigliere') ?? g ?? crew(s).filter((c) => isFree(s, c) && (c.rank === 'capo' || c.rank === 'soldier')).sort((a, b) => b.attributes.intrigue - a.attributes.intrigue || (a.id < b.id ? -1 : 1))[0];
}

export function previewHoney(s: GameState, a: HoneyAction): ActionPreview {
  const c = s.characters[a.id];
  const her = c?.firstName ?? 'her';
  const blk = honeyBlock(s, a.id);
  if (blk || !c) return base(`${her}`, `tried with ${her}`, blk ?? 'Nobody');
  const H = s.honey;
  const w = H?.watch[a.id];
  const ag = H?.agents[a.id];
  const live = !!ag && ag.status === 'working';
  switch (a.op) {
    case 'dare': {
      const run = runDare(s, a.id, a.at, a.moves);
      const why = run.block ?? (!run.end ? 'Play the scene to the end first' : undefined);
      const paid = run.end === 'yes' ? run.money : 0;
      return {
        ...base(`A bold dare with ${her}: ${run.end ? END_TEXT[run.end].toLowerCase() : 'unfinished'}`, `made ${her} a bold offer`, why), cost: paid, pot: paid ? 'pocket' : undefined,
        detail: `${run.close && run.close !== 'back' ? CLOSE_INFO[run.close].label : run.at === 'office' ? 'In your office' : 'At the club'}. Her answer is the one she gave you, face to face.${paid ? ` ${$(paid)} from your pocket, because she said yes.` : ''} Fade to black; one line.`,
        effects: [HX({ op: 'did', a }, `A bold dare with ${her}`)],
        warning: run.end === 'yes' && run.close && run.close !== 'back' && run.close !== 'motel' ? `What can go wrong: ${Math.round(CLOSE_INFO[run.close].expose * 100)}% somebody sees.${marriedOf(s, c) ? ' She is married: if it gets out, she is yours in the island\'s eyes, and her husband pays, and so do you.' : ''}` : undefined,
      };
    }
    case 'probe': {
      const m = prober(s);
      const busy = s.protect?.asg.some((x) => x.status === 'active' && x.type === 'investigate' && x.subjects.includes(a.id));
      return {
        ...base(`Have ${m ? m.firstName : 'a man'} quietly look into ${her}`, `had ${her} looked into`, !m ? 'Nobody to send' : busy ? 'Somebody is already on it' : undefined),
        detail: `A few weeks of discreet questions: who she sees, where she goes after you. A report comes back with what he could find (and how sure he is). If she notices, she will not forgive it.`,
        effects: [HX({ op: 'did', a }, `${her}: looked into`)],
      };
    }
    case 'turn': {
      const why = !w?.known ? 'You don\'t know what she is' : !live ? 'She is not working anybody now' : undefined;
      const t = turnOdds(s, a.id);
      return {
        ...base(`Turn ${her}: she works for you now`, `tried to turn ${her}`, why),
        detail: 'A double agent: what she carries back is yours, and what she brings you is theirs. If she says no, she runs to them.',
        effects: [HX({ op: 'did', a }, `${her} turns`)], acceptance: why ? undefined : { chance: t.chance, reasons: t.reasons },
        refuseEffects: [HX({ op: 'bolted', id: a.id }, `${her} ran`)],
      };
    }
    case 'feed':
      return { ...base(`Feed ${her} lies`, `fed ${her} stories`, !w?.known ? 'You don\'t know what she is' : !live ? 'She is not working anybody now' : undefined), detail: 'Keep seeing her; every story she carries is yours. Her masters act on them until they work it out.', effects: [HX({ op: 'did', a }, `${her}: stories`)] };
    case 'confront':
      return { ...base(`Have it out with ${her}`, `had it out with ${her}`, !w || (w.susp < 30 && w.known === undefined) ? 'You have nothing to go on' : undefined), detail: w?.known ? 'She confesses and leaves the island; her people learn you know.' : 'If she is working you, she breaks. If she isn\'t, you just called her a rat to her face.', effects: [HX({ op: 'did', a }, `${her}: confronted`)], warning: w?.known ? undefined : `Your suspicion: ${w?.susp ?? 0}/100. You could be wrong.` };
    case 'drop': {
      const any = !!affairOf(s, a.id) && affairOf(s, a.id)!.stage !== 'ended' || !!(s.nightlife?.goomars[a.id] && !s.nightlife.goomars[a.id].ended) || live;
      return { ...base(`Stop seeing ${her}, quietly`, `stopped seeing ${her}`, any ? undefined : 'Nothing to end'), detail: 'No scene, no reasons.', effects: [HX({ op: 'did', a }, `${her}: it ends`)] };
    }
    case 'settle': {
      const m = H?.mistresses[a.id];
      const why = !m || m.settled || !m.want || m.stage < 2 ? 'She has asked you for nothing' : a.how === 'consig' && !seatHolder(s, 'consigliere') ? 'You have no consigliere' : undefined;
      const cost = a.how === 'pay' && m ? (m.want === 'job' ? 0 : m.want === 'wife' ? 2000 : settleCost(m)) : a.how === 'away' ? 3000 : 0;
      const LBL: Record<SettleHow, string> = { pay: `Give ${her} what she wants`, promise: `Promise ${her}`, bluff: `Call ${her}'s bluff`, away: `Send ${her} to Florida`, consig: `Have the consigliere handle ${her}`, worse: `Have ${her} taken care of` };
      const DET: Record<SettleHow, string> = {
        pay: `${m?.want ? WANT_TEXT[m.want] : 'Money'}. She is quiet, for now.`, promise: 'Ten weeks. Then she wants it, or worse.',
        bluff: `About ${pct(bluffOdds(s, a.id))} she backs down; if not, she does what she said.`, away: `About ${pct(awayOdds(s, a.id))} she takes the money and the train.`,
        consig: `${$(1500)} of the Family's; about ${pct(consigOdds(s))} he settles it.`,
        worse: 'Your order, and yours alone. Off the page; it will cost you with your own men for years, and the law will come asking.',
      };
      return { ...base(LBL[a.how], `${a.how === 'worse' ? 'had her taken care of' : `settled with ${her}`}`, why), cost, pot: cost && a.how !== 'consig' ? 'pocket' : undefined, detail: DET[a.how], effects: [HX({ op: 'did', a }, LBL[a.how])], warning: a.how === 'worse' ? 'There is no taking this back.' : undefined };
    }
  }
}

export function describeHoneyOp(s: GameState, o: HoneyOp): string | undefined {
  const her = (id: string) => fn(s, id);
  switch (o.op) {
    case 'did': return o.a.op === 'dare' ? `A bold dare with ${her(o.a.id)}` : o.a.op === 'probe' ? `${her(o.a.id)}, looked into` : o.a.op === 'settle' ? `${her(o.a.id)}: settled` : `${her(o.a.id)}: ${o.a.op}`;
    case 'bolted': return `${her(o.id)} ran to her people`;
    case 'agent': return `${her(o.id)}: ${o.how}`;
    case 'want': return `${her(o.id)}'s want: ${o.how}`;
    case 'threat': return `${her(o.id)}'s threat: ${o.how}`;
    case 'approach': case 'invite': return `${her(o.id)}`;
    case 'scorn': return `${nm(s, o.who)} won't forget it`;
    case 'hush': return `${her(o.id)} is quiet`;
    case 'leak': return `${her(o.id)} talks`;
    case 'suspect': return `Your suspicion of ${her(o.id)}`;
  }
}

export function applyHoneyOp(ctx: Ctx, o: HoneyOp): void {
  const s = ctx.s;
  if (!adultOn(s)) return;
  const H = ensureHoney(s);
  switch (o.op) {
    case 'did': {
      const a = o.a;
      if (honeyBlock(s, a.id)) return;
      if (a.op === 'dare') { applyDare(ctx, a); return; }
      if (a.op === 'probe') {
        const m = prober(s);
        if (!m) return;
        createInquiry(ctx, a.id, 'loyalty', m.id, 3, s.playerId, [s.playerId], true);
        watchFor(s, a.id);
        hlog(H, s, `${m.firstName} is asking around about ${fn(s, a.id)}, quietly.`);
        return;
      }
      if (a.op === 'turn') { agentAnswer(ctx, a.id, 'turn', true); return; }
      if (a.op === 'feed' || a.op === 'confront' || a.op === 'drop') { agentAnswer(ctx, a.id, a.op); return; }
      if (a.op === 'settle') { settle(ctx, a.id, a.how); return; }
      return;
    }
    case 'bolted': bolted(ctx, o.id); return;
    case 'agent': agentAnswer(ctx, o.id, o.how); return;
    case 'want': {
      const m = H.mistresses[o.id];
      const c = s.characters[o.id];
      if (!m || !c || m.settled || honeyBlock(s, o.id)) return;
      if (o.how === 'give') settle(ctx, o.id, 'pay');
      else if (o.how === 'promise') settle(ctx, o.id, 'promise');
      else {
        addOpinion(s, o.id, s.playerId, `He said no to ${WANT_TEXT[m.want ?? 'money']}`, -6, 1);
        m.next = s.week + (m.stage >= 3 ? 1 : 4);
        const af = affairOf(s, o.id);
        if (af) af.aff = clamp(af.aff - 8);
        hlog(H, s, `You told ${c.firstName} no.`);
      }
      return;
    }
    case 'threat': settle(ctx, o.id, o.how); return;
    case 'approach': approachAnswer(ctx, o.id, o.how); return;
    case 'invite': inviteAnswer(ctx, o.id, o.how); return;
    case 'scorn': scornAdd(s, o.who, s.characters[o.who]?.gender === 'F' ? 'woman' : 'husband', o.why, o.by); return;
    case 'hush': { const m = H.mistresses[o.id]; if (m && !m.settled) { m.settled = { week: s.week, how: 'quieted' }; m.stage = 0; m.due = undefined; H.stats.settled++; } return; }
    case 'leak': if (!honeyBlock(s, o.id)) mistressLeak(ctx, o.id); return;
    case 'suspect': if (!honeyBlock(s, o.id)) { const w = watchFor(s, o.id); w.susp = clamp(w.susp + o.by); } return;
  }
}

/** The dare, replayed from the window's moves: the same answers, now with consequences. */
function applyDare(ctx: Ctx, a: Extract<HoneyAction, { op: 'dare' }>): void {
  const s = ctx.s;
  const H = ensureHoney(s);
  const run = runDare(s, a.id, a.at, a.moves);
  if (run.block || !run.end) return;
  const c = s.characters[a.id];
  const boss = player(s);
  const her = c.firstName;
  H.stats.dares++;
  H.dares.push({ w: s.week, id: a.id, out: run.end, at: run.close ?? a.at });
  if (H.dares.length > 20) H.dares.splice(0, H.dares.length - 20);
  for (const t of run.signs) addSign(s, a.id, t, 18);
  const ag = H.agents[a.id];
  const key = `dare:${a.id}:${s.week}`;
  const p = s.nightlife?.people[a.id];
  const b = s.dating?.bonds[a.id];
  switch (run.end) {
    case 'yes': {
      H.stats.yes++;
      if (run.money) spendPocket(ctx, run.money, `${her}: a bold dare`, `hdare:${a.id}`, true);
      if (s.dyn) fx(ctx, [{ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: -4, source: 'domestic' }, label: 'A night to remember' } as Effect], 'A night to remember', 'took a dare');
      const info = CLOSE_INFO[run.close as Exclude<typeof run.close, 'back' | undefined>];
      say(ctx, H, info?.yes ?? `${her} said yes. Then it was morning.`);
      if (!run.read.pro) addOpinion(s, a.id, boss.id, 'A night I won\'t forget', 4, 1);
      const cut = protectionFor(s, boss.id, 'night').cut;
      if (info && hroll(s, `${key}|seen`) < info.expose * (1 - cut * 0.5)) {
        rumor(s, `The boss and ${her} ${c.lastName}: ${info.label.toLowerCase()}. Ask anybody who was there.`, boss.id);
        if (info.thrill >= 3) pressItem(s, { s: 'spout', b: `Spout Off: The floor show at a certain Pacific Avenue nightspot ran twenty minutes long on Saturday. The coat-check girl got the night off. Draw your own conclusions.`, a: 'boss', fx: { wife: -2 } });
        if (info.thrill >= 2) {
          const { old, young } = divide(s);
          fx(ctx, [...old.slice(0, 4).map((o) => ({ type: 'opinion', from: o.id, to: boss.id, amount: -2, reason: 'Carrying on like a kid in his own place', decay: 1, label: 'The old school' }) as Effect), ...young.slice(0, 3).map((y) => ({ type: 'opinion', from: y.id, to: boss.id, amount: 1, reason: 'The boss has still got it', decay: 1, label: 'The young bloods' }) as Effect)], 'People saw', 'took a dare in public');
        }
        wifeHears(s, 10);
        if (marriedOf(s, c)) claimFrom(ctx, a.id, 'dare');
      }
      if (ag && ag.status === 'working' && ag.kind !== 'setup' && info?.at === 'office') leakIntel(ctx, ag, 'office');
      if (ag?.kind === 'setup') ag.intel++;
      weighAgent(s, a.id);
      return;
    }
    case 'lure': {
      if (ag?.kind === 'setup' && ag.status === 'working' && isMob(s, ag.master)) {
        const t = planLure(s, ag.master as RivalId, a.id, 0);
        if (t) { ag.lure = t.id; H.stats.lures++; }
      }
      say(ctx, H, `${her} left first. Room 9 at the Starlight, in an hour, she said.`);
      return;
    }
    case 'walked': {
      if (p) p.scorned = s.week;
      if (b) { b.aff = clamp(b.aff - 15); b.no = { week: s.week, what: 'a bold dare' }; }
      addOpinion(s, a.id, boss.id, 'He wouldn\'t take no for an answer', -20, 1);
      scornAdd(s, a.id, 'woman', 'he pushed, in front of the whole room', 45);
      fx(ctx, [{ type: 'respect', amount: -1, label: 'A woman walked out on you' }], 'She walked out', 'pushed a woman too far');
      rumor(s, `${her} ${c.lastName} told the boss where to go, in front of the whole room.`, boss.id);
      say(ctx, H, `${her} walked out on you. The room watched her go.`);
      return;
    }
    case 'refused': {
      if (b && !run.read.pro) b.aff = clamp(b.aff - 6);
      if (!run.read.pro) addOpinion(s, a.id, boss.id, 'He thought I was that kind of girl', -4, 1);
      if (hroll(s, `${key}|gossip`) < 0.2) rumor(s, `${her} ${c.lastName} turned the boss down flat.`, boss.id);
      say(ctx, H, `${her} said no. You let it go.`);
      return;
    }
    case 'laughed': say(ctx, H, `${her} laughed it off, and so did you.`); return;
    case 'bowed': addOpinion(s, a.id, boss.id, 'A gentleman, for once', 4, 1); say(ctx, H, `You bowed out with your hat in your hand. ${her} liked you better for it.`); return;
    case 'seen': hlog(H, s, `Something about ${her} isn't right. You'll be watching.`); ctx.log.push(`Something about ${her} isn't right.`); return;
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

/** Who is weighed for whether she is working him: the women he is with, and women of the night on another family's side. */
function weighWeek(s: GameState): void {
  for (const id of involvedWith(s)) weighAgent(s, id);
  for (const p of Object.values(s.nightlife?.people ?? {})) {
    if (p.status !== 'active' || !p.met || !isMob(s, p.side)) continue;
    const c = s.characters[p.id];
    if (c?.gender === 'F' && adultC(s, c)) weighAgent(s, p.id);
  }
}

/** Women (and men) wronged by the other layers: a bold offer gone bad, a boss who ended it on her, the fella she left for him. */
function scornFromOthers(s: GameState, H: HoneyState): void {
  const once = (k: string, v: number) => { if (H.cool[k] === v) return false; H.cool[k] = v; return true; };
  for (const p of Object.values(s.nightlife?.people ?? {})) {
    if (p.scorned !== undefined && s.week - p.scorned <= 2 && once(`sc:${p.id}`, p.scorned)) scornAdd(s, p.id, 'woman', 'he made a fool of me in front of everybody', 35);
  }
  for (const a of Object.values(s.women?.affairs ?? {})) {
    if (a.with !== s.playerId) continue;
    if (a.stage === 'ended' && a.ended?.by === 'boss' && a.aff >= 50 && s.week - a.ended.week <= 2 && once(`end:${a.id}`, a.ended.week)) scornAdd(s, a.id, 'woman', 'he ended it like he was cancelling a newspaper', Math.min(80, a.aff));
    if (a.stage === 'affair' && s.week - a.since <= 2 && once(`jilt:${a.id}`, a.since)) {
      const p = s.nightlife?.people[a.id];
      const fella = p && p.fam.st !== 'married' && p.fam.partnerId ? s.characters[p.fam.partnerId] : undefined;
      if (fella?.alive && adultC(s, fella)) scornAdd(s, fella.id, 'jilted', 'she left me for the boss', 40);
    }
  }
}

export function honeyWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver || !adultOn(s)) return;
  const boss = player(s);
  if (!boss?.alive) return;
  // Nothing to keep yet: no state until there is something to keep.
  if (!s.honey && !involvedWith(s).length && s.week < 10) return;
  const H = ensureHoney(s);
  weighWeek(s);
  claimsWeek(ctx);
  for (const a of Object.values(H.agents)) if (a.status === 'working' || a.status === 'turned' || a.status === 'fed' || a.lure) agentWeek(ctx, H, a);
  mistressWeek(ctx, H);
  scornFromOthers(s, H);
  scornWeek(ctx, H);
  approachWeek(ctx, H);
  // Bounded.
  for (const [id, a] of Object.entries(H.agents)) if ((a.status === 'done' || a.status === 'burned') && s.week - a.since > 104) delete H.agents[id];
  for (const [id, w] of Object.entries(H.watch)) if (!s.characters[id]?.alive || (w.susp === 0 && w.known === undefined && s.week - (w.signs[w.signs.length - 1]?.[0] ?? w.cleared ?? 0) > 52)) delete H.watch[id];
  for (const k of Object.keys(H.seen)) if (s.week - H.seen[k] > 156 && !H.agents[k]) delete H.seen[k];
  for (const k of Object.keys(H.cool)) if (s.week - H.cool[k] > 104) delete H.cool[k];
  for (const [id, cl] of Object.entries(H.claims)) if (!s.characters[id]?.alive || s.week - cl.since > 260) delete H.claims[id];
}

/* ------------------------------------------------------------------ */
/* Views (the women panel, her dossier)                                */
/* ------------------------------------------------------------------ */

export interface WatchRow { id: string; name: string; susp: number; signs: [number, string][]; known?: string; cleared: boolean; actions: PlayerAction[] }
export interface MistressRow { id: string; name: string; mouth: string; want?: string; stage: string; lever?: string; due?: number; promised?: number; settled?: string; actions: PlayerAction[] }
export interface ClaimRow { id: string; name: string; husband: string; fallout: string; rival?: string }
export interface ScornRow { id: string; name: string; kind: string; why: string; heat: number }

const STAGE_LINE = ['Content', 'Hinting', 'Asking', 'Demanding', 'Threatening'];
const FALLOUT: Record<Claim['fallout'], string> = { left: 'her husband left her', kids: 'he took the children to his mother\'s', cutoff: 'he cut her off without a dime', cold: 'he stayed; the house went cold' };

export function watchRows(s: GameState): WatchRow[] {
  if (!adultOn(s) || !s.honey) return [];
  return Object.values(s.honey.watch).filter((w) => adultC(s, s.characters[w.id]) && (w.susp > 0 || w.known !== undefined)).map((w) => {
    const a = s.honey!.agents[w.id];
    const acts: PlayerAction[] = [];
    const known = w.known !== undefined && a ? `${AGENT_TEXT[a.kind]}${a.status === 'turned' ? ' (turned: she works for you)' : a.status === 'fed' ? ' (you feed her lies)' : a.status === 'burned' || a.status === 'done' ? ' (finished)' : ''}` : undefined;
    if (!honeyBlock(s, w.id)) {
      if (w.known === undefined) acts.push({ kind: 'honey', op: { op: 'probe', id: w.id } });
      if (w.known !== undefined && a?.status === 'working') acts.push({ kind: 'honey', op: { op: 'turn', id: w.id } }, { kind: 'honey', op: { op: 'feed', id: w.id } });
      if (w.known !== undefined ? a && (a.status === 'working' || a.status === 'fed' || a.status === 'turned') : w.susp >= 30) acts.push({ kind: 'honey', op: { op: 'confront', id: w.id } });
      acts.push({ kind: 'honey', op: { op: 'drop', id: w.id } });
    }
    return { id: w.id, name: nm(s, w.id), susp: w.susp, signs: w.signs.slice(-4), known, cleared: w.cleared !== undefined && w.known === undefined, actions: acts };
  }).sort((a, b) => b.susp - a.susp || a.id.localeCompare(b.id));
}

export function mistressRows(s: GameState): MistressRow[] {
  if (!adultOn(s) || !s.honey) return [];
  return Object.values(s.honey.mistresses).filter((m) => adultC(s, s.characters[m.id])).map((m) => {
    const acts: PlayerAction[] = [];
    if (!m.settled && m.want && m.stage >= 2 && !honeyBlock(s, m.id)) for (const how of ['pay', 'promise', 'bluff', 'away', 'consig', 'worse'] as SettleHow[]) acts.push({ kind: 'honey', op: { op: 'settle', id: m.id, how } });
    return {
      id: m.id, name: nm(s, m.id), mouth: m.mouth >= 70 ? 'a loud mouth' : m.mouth >= 40 ? 'talks when she drinks' : 'discreet',
      want: m.want && m.stage >= 1 ? WANT_TEXT[m.want] : undefined, stage: STAGE_LINE[m.stage], lever: m.stage >= 4 && m.lever ? `she will tell ${LEVER_TEXT[m.lever]}` : undefined,
      due: m.due, promised: m.promised, settled: m.settled?.how, actions: acts,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function claimRows(s: GameState): ClaimRow[] {
  if (!adultOn(s) || !s.honey) return [];
  return Object.values(s.honey.claims).filter((c) => adultC(s, s.characters[c.id])).map((c) => ({ id: c.id, name: nm(s, c.id), husband: nm(s, c.husband), fallout: FALLOUT[c.fallout], rival: c.rival ? famName(c.rival) : undefined }));
}

export function scornRows(s: GameState): ScornRow[] {
  if (!adultOn(s) || !s.honey) return [];
  return Object.values(s.honey.scorn).filter((x) => adultC(s, s.characters[x.id])).map((x) => ({ id: x.id, name: nm(s, x.id), kind: x.kind === 'woman' ? 'A woman scorned' : x.kind === 'husband' ? 'A husband' : 'A jilted man', why: x.why, heat: Math.round(x.heat) })).sort((a, b) => b.heat - a.heat);
}

export function honeyLog(s: GameState, n = 10): { week: number; text: string }[] {
  if (!adultOn(s)) return [];
  return (s.honey?.log ?? []).filter(([, t]) => !t.startsWith('(Unknown to you')).slice(-n).reverse().map(([week, text]) => ({ week, text }));
}

/** The orders on her from this layer (her dossier and calling card). */
export function honeyActionsFor(s: GameState, id: string): PlayerAction[] {
  if (honeyBlock(s, id)) return [];
  const out: PlayerAction[] = [];
  const row = watchRows(s).find((r) => r.id === id);
  if (row) out.push(...row.actions);
  else if (affairOf(s, id)?.stage === 'affair' || (s.nightlife?.goomars[id] && !s.nightlife.goomars[id].ended)) out.push({ kind: 'honey', op: { op: 'probe', id } });
  const m = mistressRows(s).find((r) => r.id === id);
  if (m) out.push(...m.actions);
  return out;
}
