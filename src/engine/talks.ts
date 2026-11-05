import type { ActionPreview } from './actions';
import { ageOn } from './calendar';
import { displayName, hasTrait } from './characters';
import { applyEffects, fmtMoney, shiftInfluence } from './effects';
import { askForPitch, askForPlace } from './eat';
import { journal } from './journal';
import { ensureHood } from './hoodState';
import type { Acceptance, Reason } from './interactions';
import { money, type Ctx } from './ledger';
import { addOpinion, getRelation, opinion } from './relations';
import { chance, hashSeed, pick, rand, randInt } from './rng';
import type { Character, Effect, FactionId, GameState, RivalId, Trait } from './types';
import { FACTION_NAMES } from './world';
import { noteBroken, noteKept, noteTheyBroke, type FamRecord } from './minds/familyWord';
import type { FamAsk } from './minds/askView';

/**
 * Talks: the extended person interactions (request a meeting, offer a job,
 * discuss business, form a partnership, ask for advice, hear a grievance,
 * arrange an evening out, negotiate a conflict, discuss succession). Unlike
 * the old yes/no interactions, the other side answers in one of five ways —
 * agrees, refuses, asks for time (the answer comes weeks later), makes a
 * counteroffer (you take it or leave it from the Mission Board), or, if he
 * runs a family, goes and does something on his own instead.
 *
 * Faction diplomacy lives here too: pacts with a family (alliance, truce,
 * partnership) that the rivals' AI respects, and the families' own
 * relations — alliances, territorial disputes and settlements, a crew that
 * splits off, whispers about a succession — rolling every month without the
 * player. All on the layer's own dice (`talks.rng`).
 */

export type TalkId = 'meeting' | 'job' | 'business' | 'partner' | 'advice' | 'grievance' | 'social' | 'negotiate' | 'succession';

export type PactKind = 'alliance' | 'truce' | 'partnership' | 'tribute' | 'handsoff' | 'split';

/** Pacts that keep a family from moving on the other side (a hands-off term binds one district only). */
export const PEACE_PACTS: ReadonlySet<PactKind> = new Set<PactKind>(['alliance', 'truce', 'partnership', 'tribute']);

export interface Pact {
  id: string;
  /** With a family (rival id), or between two families (`a` and `b`). */
  a: FactionId;
  b: FactionId;
  kind: PactKind;
  since: number;
  until: number;
  /** Partnership: what it pays you a week. Tribute: what you pay them a week. */
  weekly?: number;
  terms: string;
  /** Hands-off (minds/diplomacy.ts): the district, the side that stays out, its influence there when they shook. */
  district?: string;
  bound?: FactionId;
  base?: number;
  /** A split (minds/diplomacy.ts): who pays ('player' or the family), a share of one named place's take, or a flat weekly. */
  payer?: FactionId;
  biz?: string;
  pct?: number;
}

export interface PendingTalk {
  id: string;
  talk: TalkId;
  target: string;
  /** When the answer comes (a delay) or the offer lapses (a counteroffer). */
  due: number;
  kind: 'delay' | 'counter';
  /** The counteroffer: what he wants instead. */
  counter?: { text: string; cost?: number; weekly?: number };
}

export interface TalkLog { week: number; y: number; m: number; text: string; target?: string; kind: 'talk' | 'pact' | 'rivals' }

export interface TalkState {
  rng: number;
  nextId: number;
  pending: PendingTalk[];
  pacts: Pact[];
  log: TalkLog[];
  /** Last time each talk was had with each person (`talk:target` → week). */
  cooldown: Record<string, number>;
  /** When you last sat down with someone (unlocks partnership and negotiation). */
  met: Record<string, number>;
  /** How the families feel about each other (`a|b`, −100..100). */
  rivalRel: Record<string, number>;
  /** Families' own cooldowns (splits, whispers). */
  rivalCd: Record<string, number>;
  stats: { asked: number; agreed: number; refused: number; delayed: number; countered: number; independent: number; pacts: number; splits: number; disputes: number; settlements: number; alliances: number };
  lastMonth?: string;
  /** Sit-downs with a family (minds/diplomacy.ts): family → the week the boss last sat down with them. */
  sat?: Record<string, number>;
  /** Each family's record of the boss (minds/familyWord.ts). */
  rec?: Record<string, FamRecord>;
  /** Times the boss broke a pact on purpose: every family marks it down (minds/familyWord.ts). */
  wordAll?: number;
  /** Families asking the boss for a sit-down, or coming to collect a favor (minds/familyAsks.ts). */
  asks?: FamAsk[];
}

export type TalkOp = { t: 'ask'; talk: TalkId; target: string } | { t: 'answer'; id: string; yes: boolean };

export const TALKS: Record<TalkId, { label: string; verb: string; base: number; counter: boolean; blurb: string }> = {
  meeting: { label: 'Request a meeting', verb: 'asked for a sit-down with', base: 45, counter: true, blurb: 'A table, coffee, nobody else. Opens the door to partnerships and settlements.' },
  job: { label: 'Offer employment', verb: 'offered a job to', base: 38, counter: true, blurb: 'A paycheck from one of your places. People on your payroll remember who signs it.' },
  business: { label: 'Discuss business', verb: 'talked business with', base: 42, counter: true, blurb: 'Who is selling, who is overextended, where the money is going. One of your men brings you a score, or a made man asks for a place to make money; anyone else has a tip or a better price.' },
  partner: { label: 'Form a partnership', verb: 'proposed a partnership to', base: 22, counter: true, blurb: 'A joint venture for a year: a weekly share, and a family that will not move on you.' },
  advice: { label: 'Ask for advice', verb: 'asked the advice of', base: 72, counter: false, blurb: 'People like being asked. Sometimes they are even right.' },
  grievance: { label: 'Discuss a grievance', verb: 'heard out', base: 45, counter: true, blurb: 'Let him say it to your face, before he says it to someone else.' },
  social: { label: 'Arrange a social evening', verb: 'took out', base: 58, counter: false, blurb: 'Dinner at the Wave Crest, a show at the 500 Club. The bill is yours either way.' },
  negotiate: { label: 'Negotiate the conflict', verb: 'opened negotiations with', base: 26, counter: true, blurb: 'A truce for half a year: neither side moves on the other.' },
  succession: { label: 'Discuss the succession', verb: 'talked about the future with', base: 52, counter: false, blurb: 'Who comes after you, and what he thinks about it.' },
};

export const TALK_IDS = Object.keys(TALKS) as TalkId[];

/* ---------------- state ---------------- */

export function ensureTalks(s: GameState): TalkState {
  s.talks ??= { rng: hashSeed(`${s.seed}:talks`), nextId: 1, pending: [], pacts: [], log: [], cooldown: {}, met: {}, rivalRel: {}, rivalCd: {}, stats: { asked: 0, agreed: 0, refused: 0, delayed: 0, countered: 0, independent: 0, pacts: 0, splits: 0, disputes: 0, settlements: 0, alliances: 0 } };
  return s.talks;
}

function log(s: GameState, t: TalkState, text: string, kind: TalkLog['kind'], target?: string): void {
  t.log.push({ week: s.week, y: s.date.y, m: s.date.m, text, target, kind });
  if (t.log.length > 80) t.log.splice(0, t.log.length - 80);
}

/** A line in the talks log (Pacts & Families). */
export function logTalk(s: GameState, text: string, kind: TalkLog['kind'], target?: string): void {
  log(s, ensureTalks(s), text, kind, target);
}

/** A family the player has an active pact of a kind with (or any pact that keeps the peace). */
export function pactWith(s: GameState, rival: FactionId, kind?: PactKind): Pact | undefined {
  return s.talks?.pacts.find((p) => ((p.a === 'player' && p.b === rival) || (p.b === 'player' && p.a === rival)) && p.until > s.week && (kind ? p.kind === kind : PEACE_PACTS.has(p.kind)));
}

/** Has this family given its word to stay out of the district (a hands-off term in force)? */
export function keepsOut(s: GameState, rival: FactionId, district: string): boolean {
  return !!s.talks?.pacts.some((p) => p.kind === 'handsoff' && p.until > s.week && p.bound === rival && p.district === district);
}

function rivalLed(s: GameState, c: Character): RivalId | undefined {
  return s.rivals.find((r) => r.leaderId === c.id && r.kind === 'mob')?.id;
}

/* ---------------- who you can talk to ---------------- */

export function talkApplies(s: GameState, talk: TalkId, c: Character): string | undefined {
  if (!c.alive || c.id === s.playerId) return 'Not here';
  const crew = c.faction === 'player' && c.rank !== 'civilian';
  const family = !!c.dynasty;
  const boss = rivalLed(s, c);
  const met = (s.talks?.met[c.id] ?? -999) > s.week - 26;
  switch (talk) {
    case 'meeting': return crew || family ? 'You see him every day' : undefined;
    case 'job': return crew ? 'He already works for you' : boss ? 'He runs his own family' : c.faction !== 'player' && c.faction !== 'none' ? 'He works for another family' : undefined;
    case 'business': return undefined;
    case 'partner': return !boss ? 'Partnerships are made with a family' : !met ? 'Sit down with him first' : pactWith(s, boss, 'partnership') ? 'You are already partners' : undefined;
    case 'advice': return crew || family || c.office ? undefined : 'He is not someone whose advice you would take';
    case 'grievance': return (getRelation(s, c.id, s.playerId)?.grievance ?? 0) < 15 && opinion(s, c.id, s.playerId) > -20 ? 'He has nothing against you' : undefined;
    case 'social': return undefined;
    case 'negotiate': {
      if (!boss) return 'Only a family can be negotiated with';
      const r = s.rivals.find((x) => x.id === boss)!;
      if (pactWith(s, boss, 'truce') || pactWith(s, boss, 'alliance')) return 'There is already peace';
      return r.war || r.feud || opinion(s, c.id, s.playerId) < 0 || met ? undefined : 'There is no conflict to settle';
    }
    case 'succession': return crew && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere') || (family && ageOn(c.birth, s.date) >= 18) ? undefined : 'Not his business';
  }
}

/* ---------------- how he will answer ---------------- */

const TRAIT_TALK: Partial<Record<Trait, Partial<Record<TalkId | 'all', number>>>> = {
  Greedy: { business: 12, partner: 12, job: 12, social: -4 },
  Paranoid: { meeting: -18, partner: -12, all: -4 },
  Honest: { job: -10, business: -12, advice: 6 },
  'Loyal-to-a-fault': { all: 10 },
  Ambitious: { succession: 12, partner: 6, job: -6 },
  'Hot-headed': { negotiate: -14, grievance: -8 },
  Patient: { negotiate: 10, meeting: 6 },
  Charming: { social: 10, meeting: 6 },
  Vengeful: { negotiate: -14, grievance: -10 },
  Drinker: { social: 12 },
  Gambler: { business: 6, partner: 6 },
  Cowardly: { meeting: -6, negotiate: 8 },
  Pious: { social: -4, succession: 6 },
};

export interface TalkOdds { agree: number; counter: number; delay: number; refuse: number; independent: number; reasons: Reason[] }

export function talkOdds(s: GameState, talk: TalkId, c: Character): TalkOdds {
  const reasons: Reason[] = [{ label: `${TALKS[talk].label} (base)`, value: TALKS[talk].base }];
  const op = opinion(s, c.id, s.playerId);
  reasons.push({ label: 'His opinion of you', value: Math.round(op * 0.35) });
  reasons.push({ label: 'Your respect', value: Math.round((s.respect - 50) * 0.2) });
  const crew = c.faction === 'player' && c.rank !== 'civilian';
  const boss = rivalLed(s, c);
  if (crew) reasons.push({ label: 'He is one of yours', value: 15 });
  if (crew && talk === 'business' && (c.rank === 'soldier' || c.rank === 'capo' || c.rank === 'associate')) reasons.push({ label: 'One of yours: he has been waiting to bring you something', value: 30 });
  else if (c.dynasty) reasons.push({ label: 'Family', value: 18 });
  else if (boss || s.rivals.some((r) => r.id === c.faction)) reasons.push({ label: 'Another family', value: -12 });
  const r = boss ? s.rivals.find((x) => x.id === boss) : undefined;
  if (r?.war) reasons.push({ label: 'At war with you', value: talk === 'negotiate' ? -5 : -30 });
  if (r?.feud) reasons.push({ label: 'Blood feud', value: -20 });
  if (boss && pactWith(s, boss)) reasons.push({ label: 'You have a pact', value: 15 });
  if (r && talk === 'negotiate') { const w = s.wars.find((x) => x.rival === r.id); if (w && w.score > 20) reasons.push({ label: 'You are winning the war', value: Math.round(w.score / 4) }); }
  for (const t of c.traits) { const m = TRAIT_TALK[t]; const v = (m?.[talk] ?? 0) + (m?.all ?? 0); if (v) reasons.push({ label: t, value: v }); }
  if ((s.talks?.met[c.id] ?? -999) > s.week - 26 && talk !== 'meeting') reasons.push({ label: 'You sat down recently', value: 8 });
  const total = reasons.reduce((a, x) => a + x.value, 0);
  const agree = Math.max(0.04, Math.min(0.94, total / 100));
  const rest = 1 - agree;
  const counter = TALKS[talk].counter ? rest * (hasTrait(c, 'Greedy') ? 0.42 : 0.3) : 0;
  const independent = boss && talk !== 'advice' ? rest * 0.12 : 0;
  const delay = rest * (hasTrait(c, 'Patient') ? 0.3 : 0.2);
  return { agree, counter, delay, independent, refuse: Math.max(0, 1 - agree - counter - delay - independent), reasons };
}

function socialCost(c: Character): number {
  return Math.round((250 + Math.min(1200, c.wealth / 40)) / 50) * 50;
}

/** What a partnership with a family pays a week. */
export function partnerWeekly(s: GameState, rival: RivalId): number {
  const r = s.rivals.find((x) => x.id === rival);
  return Math.round(Math.min(450, 140 + (r?.money ?? 0) / 300) / 10) * 10;
}

/* ---------------- preview ---------------- */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const noop = (title: string, why: string): ActionPreview => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' });

export function previewTalk(s: GameState, op: TalkOp): ActionPreview {
  if (op.t === 'answer') {
    const p = s.talks?.pending.find((x) => x.id === op.id);
    const c = p ? s.characters[p.target] : undefined;
    if (!p || !c || !p.counter) return noop('Answer', 'That offer is off the table');
    const cost = op.yes ? p.counter.cost ?? 0 : 0;
    return {
      title: `${op.yes ? 'Take' : 'Turn down'} ${c.firstName}'s counteroffer`, detail: p.counter.text,
      effects: cost ? [{ type: 'money', amount: -cost, label: `${c.firstName}'s terms` }] : [], cost,
      because: `${op.yes ? 'took' : 'turned down'} ${displayName(c)}'s counteroffer`, disabledReason: op.yes && cost > s.money ? `Needs ${fmtMoney(cost)}` : undefined, category: 'event',
    };
  }
  const c = s.characters[op.target];
  const d = TALKS[op.talk];
  if (!c) return noop(d.label, 'Nobody');
  const title = `${d.label}: ${displayName(c)}`;
  const why = talkApplies(s, op.talk, c);
  const cd = s.talks?.cooldown[`${op.talk}:${c.id}`];
  const pending = s.talks?.pending.some((p) => p.target === c.id && p.talk === op.talk);
  const o = talkOdds(s, op.talk, c);
  const cost = op.talk === 'social' ? socialCost(c) : 0;
  const outcomes = [`agrees ${pct(o.agree)}`, o.counter ? `counteroffers ${pct(o.counter)}` : '', `asks for time ${pct(o.delay)}`, o.independent ? `goes his own way ${pct(o.independent)}` : '', `refuses ${pct(o.refuse)}`].filter(Boolean).join(' · ');
  return {
    title, detail: `${d.blurb} He ${outcomes}.`,
    effects: cost ? [{ type: 'money', amount: -cost, label: title, category: 'cost' }] : [],
    cost, because: `${d.verb} ${displayName(c)}`,
    disabledReason: why ?? (pending ? 'Waiting on his answer' : cd !== undefined && s.week - cd < 8 ? 'You asked recently' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined),
    odds: { chance: o.agree, reasons: o.reasons } as Acceptance, category: 'event',
  };
}

/* ---------------- outcomes ---------------- */

function agreeEffects(ctx: Ctx, talk: TalkId, c: Character, terms?: { weekly?: number }): string {
  const s = ctx.s;
  const t = ensureTalks(s);
  const label = `${TALKS[talk].label}: ${c.firstName} agreed`;
  const eff: Effect[] = [];
  const boss = rivalLed(s, c);
  let text = `${displayName(c)} agreed.`;
  switch (talk) {
    case 'meeting':
      t.met[c.id] = s.week;
      eff.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 8, reason: 'Sat down with you', decay: 1 });
      text = `${displayName(c)} sat down with you. The door is open.`;
      break;
    case 'job': {
      const salary = Math.round((60 + Math.min(200, c.wealth / 100)) / 10) * 10;
      eff.push({ type: 'econ', op: { op: 'job', charId: c.id, salary } }, { type: 'opinion', from: c.id, to: s.playerId, amount: 10, reason: 'On your payroll', decay: 1 });
      text = `${displayName(c)} took the job (${fmtMoney(salary)}/wk).`;
      break;
    }
    case 'business': {
      // One of your own: a made man asks for a place to make money; anyone of yours brings a score of his own.
      const mine = c.faction === 'player' && c.id !== s.playerId;
      const place = mine ? askForPlace(s, c) : undefined;
      const score = mine && !place ? askForPitch(s, c) : undefined;
      eff.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 4, reason: 'Talked business', decay: 1 });
      if (place) {
        text = `${displayName(c)} wants a place of his own: ${place.what}. Help him open it (Crew ▸ Let them eat).`;
        journal(s, { t: `Talked business with ${displayName(c)}: he wants ${place.what}`, x: `${fmtMoney(place.stake)} to open it; he runs it. Answer him in Crew ▸ Let them eat.`, p: [c.id], c: 'crew', src: 'talk', ln: 'borgata.eat', mine: 1 });
        break;
      }
      if (score) {
        text = `${displayName(c)} brought you a score of his own: ${score.what}. Back him or not (Crew ▸ Let them eat).`;
        journal(s, { t: `Talked business with ${displayName(c)}: ${score.what}`, x: `${score.text} ${score.stake ? `He needs ${fmtMoney(score.stake)}.` : ''} Answer him in Crew ▸ Let them eat.`, p: [c.id], c: 'crew', src: 'talk', ln: 'borgata.eat', mine: 1 });
        break;
      }
      const h = ensureHood(s);
      const lots = (s.econ?.lots ?? []).filter((l) => l.status === 'sale' && l.use && l.stage === 'open');
      const l = lots.length ? pick(t, lots) : undefined;
      if (l) {
        l.price = Math.round(l.price * 0.88 / 50) * 50;
        text = `${displayName(c)} knows the owner of ${l.name ?? l.address}: the price came down to ${fmtMoney(l.price)}.`;
        if (h) h.log.push({ y: s.date.y, m: s.date.m, hood: 'boardwalk', kind: 'owner', text: `${l.name ?? l.address}: the asking price came down (${displayName(c)} put in a word).`, lotId: l.id });
      } else {
        // A tip you can bank: who is overextended, a load coming in, a deal before it is public.
        const tip = Math.round((150 + Math.min(900, (c.wealth ?? 0) / 40) + randInt(t, 0, 300)) / 50) * 50;
        const what = pick(t, ['a load coming in off the Parkway', 'a motel owner who has to sell before the season', 'a land deal in Rio Grande before it is in the paper', 'which jukebox route is behind on its notes', 'a bookmaker in Cape May who is overextended']);
        eff.push({ type: 'money', amount: tip, label: `Talked business with ${c.firstName}: a tip on ${what}`, category: 'event' } as Effect);
        text = `${displayName(c)} gave you a tip on ${what}: ${fmtMoney(tip)} for the Family.`;
      }
      journal(s, { t: `Talked business with ${displayName(c)}`, x: text, p: [c.id], c: 'crew', src: 'talk', mine: 1 });
      break;
    }
    case 'partner': {
      if (!boss) break;
      const weekly = terms?.weekly ?? partnerWeekly(s, boss);
      t.pacts.push({ id: `pact${t.nextId++}`, a: 'player', b: boss, kind: 'partnership', since: s.week, until: s.week + 52, weekly, terms: `a joint venture: ${fmtMoney(weekly)}/wk to you for a year, and neither side moves on the other` });
      t.stats.pacts++;
      eff.push({ type: 'rivalOpinion', rival: boss, amount: 10, reason: 'Partners' });
      text = `${FACTION_NAMES[boss]} and your house are partners for a year (${fmtMoney(weekly)}/wk).`;
      log(s, t, text, 'pact', c.id);
      break;
    }
    case 'advice': {
      const best = Object.entries(s.hood?.stats ?? {}).sort((a, b) => b[1].econ - a[1].econ)[0]?.[0];
      const lines = [
        best ? `"Buy where the money is going. Right now that is ${best === 'boardwalk' ? 'the Boardwalk' : best}."` : '"Keep your head down this season."',
        s.heat.local > 50 ? '"Lie low. The cops are counting cars outside your places."' : '"Nobody is watching you. Use it."',
        s.money > 60000 ? '"Money sitting in a drawer earns nothing."' : '"Watch the cash. One bad month and the vultures circle."',
      ];
      text = `${displayName(c)}: ${pick(t, lines)}`;
      eff.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 5, reason: 'You asked my advice', decay: 1 });
      break;
    }
    case 'grievance':
      eff.push({ type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: -25 }, { type: 'opinion', from: c.id, to: s.playerId, amount: 10, reason: 'You heard me out', decay: 1 });
      text = `${displayName(c)} said his piece, and it cleared the air.`;
      break;
    case 'social':
      eff.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 14, reason: 'A night on the town', decay: 1 });
      text = `A good night out with ${displayName(c)}.`;
      break;
    case 'negotiate': {
      if (!boss) break;
      const r = s.rivals.find((x) => x.id === boss)!;
      t.pacts.push({ id: `pact${t.nextId++}`, a: 'player', b: boss, kind: 'truce', since: s.week, until: s.week + 26, terms: 'a truce: half a year, nobody moves on anybody' });
      t.stats.pacts++;
      eff.push({ type: 'rivalOpinion', rival: boss, amount: 12, reason: 'A negotiated truce' });
      const war = s.wars.find((w) => w.rival === boss);
      if (war) eff.push({ type: 'warEnd', warId: war.id, outcome: 'white', terms: 'white' });
      r.feud = false;
      text = `A truce with ${FACTION_NAMES[boss]}: six months of peace.`;
      log(s, t, text, 'pact', c.id);
      break;
    }
    case 'succession':
      eff.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 10, reason: 'You trusted me with the future', decay: 1 }, { type: 'meter', from: c.id, to: s.playerId, meter: 'trust', amount: 8 });
      text = hasTrait(c, 'Ambitious') ? `${displayName(c)} listened closely. Too closely?` : `${displayName(c)} gave you his word he will stand behind whoever you name.`;
      break;
  }
  applyEffects(ctx, eff, { label, because: `${TALKS[talk].verb} ${displayName(c)}`, category: 'event' });
  t.stats.agreed++;
  return text;
}

function refuseEffects(ctx: Ctx, talk: TalkId, c: Character): string {
  const s = ctx.s;
  ensureTalks(s).stats.refused++;
  addOpinion(s, c.id, s.playerId, 'Pressed me', -3, 1);
  if (talk === 'negotiate' || talk === 'partner') {
    const boss = rivalLed(s, c);
    if (boss) return `${FACTION_NAMES[boss]} said no. Word gets around.`;
  }
  return `${displayName(c)} said no.`;
}

/** A family's boss answers by doing something on his own. */
function independent(ctx: Ctx, c: Character): string {
  const s = ctx.s;
  const t = ensureTalks(s);
  const boss = rivalLed(s, c)!;
  t.stats.independent++;
  const where = s.districts.filter((d) => (d.influence[boss] ?? 0) > 0);
  const d = where.length ? pick(t, where) : s.districts[0];
  shiftInfluence(s, d.id, boss, 2);
  const text = `${displayName(c)} never answered. Instead his people moved into ${d.name}.`;
  log(s, t, text, 'rivals', c.id);
  return text;
}

function counterFor(s: GameState, talk: TalkId, c: Character): PendingTalk['counter'] {
  const boss = rivalLed(s, c);
  switch (talk) {
    case 'meeting': return { text: `${c.firstName} will meet — on his ground, and you pay for the room.`, cost: 400 };
    case 'job': return { text: `${c.firstName} wants a signing bonus first.`, cost: Math.round((300 + c.wealth / 60) / 50) * 50 };
    case 'business': return { text: `${c.firstName} talks for a consideration.`, cost: 500 };
    case 'partner': return boss ? { text: `${FACTION_NAMES[boss]} wants the bigger end: a partnership at ${fmtMoney(Math.round(partnerWeekly(s, boss) * 0.6 / 10) * 10)}/wk to you.`, weekly: Math.round(partnerWeekly(s, boss) * 0.6 / 10) * 10 } : undefined;
    case 'grievance': return { text: `${c.firstName} wants it made right in cash.`, cost: Math.round((400 + c.wealth / 80) / 50) * 50 };
    case 'negotiate': return boss ? { text: `${FACTION_NAMES[boss]} will sign a truce for a tribute.`, cost: Math.round((1500 + (s.rivals.find((r) => r.id === boss)?.muscle ?? 50) * 40) / 100) * 100 } : undefined;
    default: return undefined;
  }
}

export function commitTalk(ctx: Ctx, op: TalkOp): void {
  const s = ctx.s;
  const t = ensureTalks(s);
  if (op.t === 'answer') {
    const p = t.pending.find((x) => x.id === op.id);
    const c = p ? s.characters[p.target] : undefined;
    t.pending = t.pending.filter((x) => x.id !== op.id);
    if (!p || !c) return;
    const text = op.yes ? agreeEffects(ctx, p.talk, c, { weekly: p.counter?.weekly }) : `You turned down ${displayName(c)}'s terms.`;
    if (!op.yes) addOpinion(s, c.id, s.playerId, 'Turned down my terms', -3, 1);
    log(s, t, text, 'talk', c.id);
    ctx.log.push(text);
    return;
  }
  const c = s.characters[op.target];
  if (!c) return;
  t.stats.asked++;
  t.cooldown[`${op.talk}:${c.id}`] = s.week;
  const o = talkOdds(s, op.talk, c);
  const r = rand(t);
  let text: string;
  if (r < o.agree) text = agreeEffects(ctx, op.talk, c);
  else if (r < o.agree + o.counter) {
    const counter = counterFor(s, op.talk, c);
    if (counter) {
      t.pending.push({ id: `tk${t.nextId++}`, talk: op.talk, target: c.id, due: s.week + 4, kind: 'counter', counter });
      t.stats.countered++;
      text = `${displayName(c)} came back with a counteroffer: ${counter.text}`;
    } else text = refuseEffects(ctx, op.talk, c);
  } else if (r < o.agree + o.counter + o.delay) {
    t.pending.push({ id: `tk${t.nextId++}`, talk: op.talk, target: c.id, due: s.week + randInt(t, 2, 4), kind: 'delay' });
    t.stats.delayed++;
    text = `${displayName(c)} will think it over.`;
  } else if (r < o.agree + o.counter + o.delay + o.independent) text = independent(ctx, c);
  else text = refuseEffects(ctx, op.talk, c);
  log(s, t, text, 'talk', c.id);
  ctx.log.push(text);
}

/** Talks the sim's random player can try this week (a handful). */
export function talkActions(s: GameState): { kind: 'talk'; op: TalkOp }[] {
  const out: { kind: 'talk'; op: TalkOp }[] = [];
  const h = { rng: hashSeed(`${s.seed}:${s.week}:talk`) };
  const people = Object.values(s.characters).filter((c) => c.alive && c.id !== s.playerId && (c.faction === 'player' || c.dynasty || s.rivals.some((r) => r.leaderId === c.id)));
  for (let i = 0; i < 3 && people.length; i++) {
    const c = pick(h, people);
    const talk = pick(h, TALK_IDS);
    if (!talkApplies(s, talk, c)) out.push({ kind: 'talk', op: { t: 'ask', talk, target: c.id } });
  }
  for (const p of s.talks?.pending ?? []) if (p.kind === 'counter') out.push({ kind: 'talk', op: { t: 'answer', id: p.id, yes: chance(h, 0.5) } });
  return out;
}

/* ---------------- weekly & monthly ---------------- */

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function rivalRelation(s: GameState, a: RivalId, b: RivalId): number {
  return s.talks?.rivalRel[pairKey(a, b)] ?? 0;
}

/** Weekly: answers that were delayed come in, counteroffers lapse, partnerships pay, pacts expire; monthly: the families' own diplomacy. */
export function talksWeek(ctx: Ctx): void {
  const s = ctx.s;
  const tt = ensureTalks(s);
  for (const p of [...tt.pending]) {
    if (p.due > s.week) continue;
    tt.pending = tt.pending.filter((x) => x !== p);
    const c = s.characters[p.target];
    if (!c?.alive) continue;
    if (p.kind === 'counter') { log(s, tt, `${displayName(c)}'s offer lapsed.`, 'talk', c.id); continue; }
    const o = talkOdds(s, p.talk, c);
    const text = chance(tt, Math.min(0.95, o.agree + 0.08)) ? agreeEffects(ctx, p.talk, c) : refuseEffects(ctx, p.talk, c);
    log(s, tt, `An answer at last — ${text}`, 'talk', c.id);
    ctx.log.push(`An answer at last — ${text}`);
  }
  for (const p of tt.pacts) {
    if (p.until <= s.week || p.a !== 'player') continue;
    if (p.kind === 'handsoff') { handsOffWeek(ctx, tt, p); continue; }
    if (p.kind === 'split') { splitWeek(ctx, tt, p); continue; }
    if (!p.weekly) continue;
    const r = s.rivals.find((x) => x.id === p.b);
    if (!r || !s.characters[r.leaderId]?.alive) { p.until = s.week; log(s, tt, `The ${p.kind} with ${FACTION_NAMES[p.b]} died with its boss.`, 'pact'); continue; }
    if (p.kind === 'tribute') {
      // The boss pays; a week he cannot, the deal is broken and they remember it.
      if (s.money < p.weekly) {
        p.until = s.week - 1;
        addOpinion(s, r.leaderId, s.playerId, 'Stopped paying tribute', -20, 1);
        noteBroken(s, r.id, 'you missed the tribute');
        const text = `You missed the tribute to ${FACTION_NAMES[p.b]}: the deal is off, and they are not happy.`;
        log(s, tt, text, 'pact', r.leaderId);
        journal(s, { t: `Missed the tribute to ${FACTION_NAMES[p.b]}`, x: 'Not enough Family money for the week\'s payment. The pact is broken.', p: [r.leaderId], c: 'rivals', src: 'talk', ln: 'diplomacy.pacts' });
        ctx.log.push(text);
        continue;
      }
      money(ctx, -p.weekly, `Tribute to ${FACTION_NAMES[p.b]}`, 'cost');
      r.money += p.weekly;
      continue;
    }
    money(ctx, p.weekly, `Partnership with ${FACTION_NAMES[p.b]}`, 'business');
  }
  for (const p of tt.pacts) if (p.until === s.week && p.a === 'player' && !(p.kind === 'handsoff' && p.bound !== 'player')) noteKept(s, p.b, `the ${p.kind === 'handsoff' ? 'hands-off promise' : p.kind} ran its full term`);
  for (const p of tt.pacts) if (p.until === s.week) log(s, tt, `The ${p.kind === 'handsoff' ? 'hands-off pact' : p.kind} between ${p.a === 'player' ? 'your house' : FACTION_NAMES[p.a]} and ${FACTION_NAMES[p.b]} ran out.`, 'pact');
  tt.pacts = tt.pacts.filter((p) => p.until > s.week - 52);
  const mk = `${s.date.y}-${s.date.m}`;
  if (tt.lastMonth !== mk) {
    if (tt.lastMonth) rivalDiplomacy(ctx);
    tt.lastMonth = mk;
  }
}

/** What a split pays this week: a share of the named place's take (nothing while it is closed), else the flat weekly. */
export function splitAmount(s: GameState, p: Pact): number {
  if (p.biz) {
    const b = s.businesses.find((x) => x.id === p.biz);
    if (!b || (b.closedUntil ?? 0) > s.week) return 0;
    return Math.max(0, Math.round((b.weeklyBase * (p.pct ?? 0)) / 100));
  }
  return p.weekly ?? 0;
}

/** A split: the payer's share goes across through the books. */
function splitWeek(ctx: Ctx, tt: TalkState, p: Pact): void {
  const s = ctx.s;
  const r = s.rivals.find((x) => x.id === p.b);
  if (!r || !s.characters[r.leaderId]?.alive) { p.until = s.week; return; }
  if (p.biz && !s.businesses.some((x) => x.id === p.biz)) { p.until = s.week - 1; log(s, tt, `The split with ${FACTION_NAMES[p.b]} ended: the place is gone.`, 'pact'); return; }
  const amt = splitAmount(s, p);
  if (!amt) return;
  if (p.payer === 'player') {
    money(ctx, -amt, `${FACTION_NAMES[p.b]}'s split`, 'cost');
    r.money += amt;
  } else {
    const pay = Math.min(amt, Math.max(0, r.money));
    if (!pay) return;
    money(ctx, pay, `Split from ${FACTION_NAMES[p.b]}`, 'business');
    r.money -= pay;
  }
}

/** A hands-off term: the bound side's ground in the district may not grow; if it does, the word is broken. */
function handsOffWeek(ctx: Ctx, tt: TalkState, p: Pact): void {
  const s = ctx.s;
  if (!p.district || !p.bound) return;
  const d = s.districts.find((x) => x.id === p.district);
  const r = s.rivals.find((x) => x.id === p.b);
  if (!d || !r) return;
  const now = d.influence[p.bound] ?? 0;
  if (now <= (p.base ?? 0) + 2) return;
  p.until = s.week - 1;
  if (p.bound === 'player') {
    addOpinion(s, r.leaderId, s.playerId, `Broke his word about ${d.name}`, -20, 1);
    noteBroken(s, r.id, `you moved into ${d.name} after promising to stay out`);
    const text = `Your people moved into ${d.name} after you gave ${FACTION_NAMES[p.b]} your word: they call it a broken promise.`;
    log(s, tt, text, 'pact', r.leaderId);
    journal(s, { t: `You broke your word to ${FACTION_NAMES[p.b]} about ${d.name}`, x: 'Your ground there grew after you promised to stay out. They will remember.', p: [r.leaderId], pl: [`d:${d.id}`], c: 'rivals', src: 'talk', ln: 'diplomacy.pacts' });
    ctx.log.push(text);
  } else {
    // Their broken word is a grievance: a cause for war (war.ts casusBelli).
    s.flags[`grievance_${r.id}`] = Math.max(1, s.week);
    noteTheyBroke(s, r.id);
    const text = `${FACTION_NAMES[p.b]} moved into ${d.name} after giving you their word. You have a grievance: a cause for war.`;
    log(s, tt, text, 'pact', r.leaderId);
    journal(s, { t: `${FACTION_NAMES[p.b]} broke their word about ${d.name}`, x: 'They gave their word to stay out, and moved in anyway. You hold a grievance against them (a cause for war).', p: [r.leaderId], pl: [`d:${d.id}`], c: 'rivals', src: 'talk', ln: 'diplomacy.pacts' });
    ctx.log.push(text);
  }
}

/** The families, on their own: alliances, disputes over ground, settlements, splits, whispers about who comes next. */
export function rivalDiplomacy(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTalks(s);
  const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  for (let i = 0; i < mobs.length; i++) for (let j = i + 1; j < mobs.length; j++) {
    const [a, b] = [mobs[i], mobs[j]];
    const k = pairKey(a.id, b.id);
    let rel = t.rivalRel[k] ?? 0;
    // Ground they both want.
    const contested = s.districts.filter((d) => (d.influence[a.id] ?? 0) >= 12 && (d.influence[b.id] ?? 0) >= 12);
    rel += contested.length ? -2 * contested.length : 1;
    rel += (rand(t) - 0.5) * 6;
    const allied = t.pacts.some((p) => p.kind === 'alliance' && p.until > s.week && pairKey(p.a, p.b) === k);
    if (contested.length && rel < -25 && chance(t, 0.25)) {
      const d = pick(t, contested);
      const [w, l] = a.muscle >= b.muscle ? [a, b] : [b, a];
      shiftInfluence(s, d.id, w.id, 2);
      shiftInfluence(s, d.id, l.id, -2);
      t.stats.disputes++;
      log(s, t, `${FACTION_NAMES[w.id]} and ${FACTION_NAMES[l.id]} are fighting over ${d.name}; ${FACTION_NAMES[w.id]} is winning.`, 'rivals');
      if (chance(t, 0.3)) {
        rel += 30;
        t.stats.settlements++;
        log(s, t, `${FACTION_NAMES[a.id]} and ${FACTION_NAMES[b.id]} settled it at a sit-down: each keeps his own corners in ${d.name}.`, 'rivals');
      }
    } else if (!allied && rel > 35 && chance(t, 0.2)) {
      t.pacts.push({ id: `pact${t.nextId++}`, a: a.id, b: b.id, kind: 'alliance', since: s.week, until: s.week + 52, terms: 'they will not move on each other, and may move together' });
      t.stats.alliances++;
      log(s, t, `${FACTION_NAMES[a.id]} and ${FACTION_NAMES[b.id]} shook hands on an alliance.`, 'rivals');
    }
    t.rivalRel[k] = Math.max(-100, Math.min(100, Math.round(rel)));
  }
  // A crew splits off from a weak family; an old boss draws whispers.
  for (const r of mobs) {
    const cd = t.rivalCd[`split:${r.id}`] ?? -999;
    if ((r.muscle < 22 || r.money < 0) && s.week - cd > 104 && chance(t, 0.15)) {
      t.rivalCd[`split:${r.id}`] = s.week;
      t.stats.splits++;
      const lots = (s.econ?.lots ?? []).filter((l) => l.status === 'rival' && l.owner === r.id).slice(0, 3);
      for (const l of lots) { l.status = 'private'; l.owner = 'private'; l.tenant = `the breakaway crew from ${FACTION_NAMES[r.id]}`; }
      if (r.homeDistrict) shiftInfluence(s, r.homeDistrict, r.id, -4);
      r.muscle = Math.max(5, r.muscle - 4);
      log(s, t, `A crew split off from ${FACTION_NAMES[r.id]} and went its own way${lots.length ? `, taking ${lots.length} of its places` : ''}.`, 'rivals');
    }
    const boss = s.characters[r.leaderId];
    const wcd = t.rivalCd[`whisper:${r.id}`] ?? -999;
    if (boss && ageOn(boss.birth, s.date) >= 66 && s.week - wcd > 104 && chance(t, 0.1)) {
      t.rivalCd[`whisper:${r.id}`] = s.week;
      r.muscle = Math.max(5, r.muscle - 2);
      log(s, t, `${displayName(boss)} is getting old, and his capos are counting chairs. A leadership fight is coming in ${FACTION_NAMES[r.id]}.`, 'rivals');
    }
  }
}

