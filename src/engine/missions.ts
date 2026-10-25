import type { ActionPreview } from './actions';
import { displayName } from './characters';
import { applyEffects, fmtMoney } from './effects';
import { ensureHood } from './hoodState';
import type { Acceptance, Reason } from './interactions';
import { money, type Ctx } from './ledger';
import { opinion } from './relations';
import { chance, hashSeed, rand, randInt } from './rng';
import { ensureTalks } from './talks';
import type { Character, Effect, FactionId, GameState, RivalId } from './types';
import { FACTION_NAMES } from './world';

/**
 * The Mission Board: major cases as multi-stage stories with participants,
 * objectives, disputed facts (and who knows them), decisions you make or
 * hand to one of your people, what the other side does between your moves,
 * and several endings that stay in the records (the deed, opinions, pacts,
 * the neighborhood's log). Violence stays off the page: an ending says what
 * happened, never how.
 *
 * One storyline so far, built on the 1960 Boardwalk records: "The Tropicana"
 * — old man Kovacs wants out of his motel, two families want in.
 */

export type FactState = 'unknown' | 'true' | 'false';

export interface MissionRun {
  id: string;
  def: 'tropicana';
  stage: string;
  started: number;
  facts: Record<string, FactState>;
  /** The truth behind the disputed facts (hidden from the UI until found out). */
  truth: Record<string, boolean>;
  /** Who told you what. */
  source: Record<string, string>;
  flags: Record<string, number>;
  log: { week: number; text: string; kind: 'you' | 'npc' | 'fact' | 'end' }[];
  /** A decision waiting on the other side's answer. */
  waiting?: { decision: string; until: number };
  resolution?: string;
  ended?: number;
}

export interface MissionState {
  rng: number;
  nextId: number;
  runs: MissionRun[];
  stats: { started: number; ended: number; decisions: number };
}

export type MissionOp = { run: string; decision: string; agent?: string };

export interface Decision {
  id: string;
  label: string;
  detail: (s: GameState, m: MissionRun) => string;
  /** Hand it to one of your people (his skill sets the odds). */
  delegate?: 'intrigue' | 'diplomacy' | 'business';
  cost?: (s: GameState, m: MissionRun) => number;
  odds?: (s: GameState, m: MissionRun, agent?: Character) => Acceptance | undefined;
  blocked?: (s: GameState, m: MissionRun) => string | undefined;
  resolve: (ctx: Ctx, m: MissionRun, ok: boolean, agent?: Character) => void;
}

export interface Stage {
  title: string;
  text: (s: GameState, m: MissionRun) => string;
  objectives: string[];
  decisions: Decision[];
}

export interface MissionDef {
  id: 'tropicana';
  title: string;
  kind: string;
  blurb: string;
  participants: (s: GameState, m: MissionRun) => { id?: string; name: string; role: string }[];
  facts: { id: string; claim: string; knownBy: string }[];
  stages: Record<string, Stage>;
  first: string;
}

/* ---------------- helpers ---------------- */

const LOT = 'bw20';

export function ensureMissions(s: GameState): MissionState {
  s.missions ??= { rng: hashSeed(`${s.seed}:missions`), nextId: 1, runs: [], stats: { started: 0, ended: 0, decisions: 0 } };
  return s.missions;
}

function lotOf(s: GameState) {
  return s.econ?.lots.find((l) => l.id === LOT);
}

function owner(s: GameState): string {
  return lotOf(s)?.tenant?.replace(/'s [a-z][^']*$/, '') ?? 'the Kovacs family';
}

function bossOf(s: GameState, r: RivalId): Character | undefined {
  const x = s.rivals.find((y) => y.id === r);
  const c = x ? s.characters[x.leaderId] : undefined;
  return c?.alive ? c : undefined;
}

function note(s: GameState, m: MissionRun, text: string, kind: MissionRun['log'][number]['kind']): void {
  m.log.push({ week: s.week, text, kind });
}

function reveal(s: GameState, m: MissionRun, fact: string, who: string): void {
  if (m.facts[fact] !== 'unknown') return;
  m.facts[fact] = m.truth[fact] ? 'true' : 'false';
  m.source[fact] = who;
  const f = TROPICANA.facts.find((x) => x.id === fact)!;
  note(s, m, `${who}: "${f.claim}" — ${m.truth[fact] ? 'it is true' : 'it is not true'}.`, 'fact');
}

function hoodLog(s: GameState, text: string): void {
  const h = ensureHood(s);
  h?.log.push({ y: s.date.y, m: s.date.m, hood: 'boardwalk', kind: 'owner', text, lotId: LOT });
}

/** Hand the Tropicana to someone, with a line in its deed and the island's log. */
function transfer(ctx: Ctx, to: FactionId | 'private', by: string, price: number, how: 'bought' | 'sold' | 'seized'): void {
  const s = ctx.s;
  const l = lotOf(s);
  if (!l) return;
  if (to === 'player') { l.status = 'owned'; l.owner = 'player'; l.boughtWeek = s.week; l.stage = 'open'; l.invested = price; }
  else if (to === 'private') { l.status = 'private'; l.owner = 'private'; l.tenant = by; }
  else { l.status = 'rival'; l.owner = to; l.tenant = `${FACTION_NAMES[to]}'s people`; }
  (l.history ??= []).push({ year: s.date.y, week: s.week, owner: to, by, price, how });
  hoodLog(s, `The Tropicana Motel changed hands: ${to === 'player' ? 'your house' : to === 'private' ? by : FACTION_NAMES[to]} has it now.`);
}

function end(ctx: Ctx, m: MissionRun, res: string, text: string): void {
  const s = ctx.s;
  m.resolution = res;
  m.ended = s.week;
  m.stage = 'end';
  m.waiting = undefined;
  note(s, m, text, 'end');
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The Tropicana: ${text}`, kind: 'misc' });
  ctx.log.push(`The Tropicana: ${text}`);
  ensureMissions(s).stats.ended++;
}

function buyPrice(s: GameState, m: MissionRun): number {
  const l = lotOf(s);
  let p = l?.price ?? 20000;
  if (m.flags.metOwner) p *= 0.92;
  if (m.flags.raised) p *= 1.12;
  if (m.facts.mortgage === 'true') p *= 0.9;
  if (m.facts.books === 'true') p *= 0.92;
  return Math.round(p / 50) * 50;
}

function odds(base: number, reasons: Reason[]): Acceptance {
  const total = base + reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.05, Math.min(0.95, total / 100)), reasons: [{ label: 'Base', value: base }, ...reasons] };
}

/** Feldstein at the table: the same five answers as any talk. */
function sitdownRoll(s: GameState, m: MissionRun, ask: 'partner' | 'walk'): { agree: number; counter: number; delay: number; reasons: Reason[] } {
  const f = bossOf(s, 'feldstein');
  const op = f ? opinion(s, f.id, s.playerId) : 0;
  const reasons: Reason[] = [
    { label: 'His opinion of you', value: Math.round(op * 0.35) },
    { label: 'Your respect', value: Math.round((s.respect - 50) * 0.25) },
  ];
  if (m.facts.threat === 'true') reasons.push({ label: 'You know about the threat', value: 15 });
  if (m.flags.raised) reasons.push({ label: 'He already raised his offer', value: -8 });
  if (ask === 'walk') reasons.push({ label: 'Asking him to walk away', value: -15 });
  const a = odds(ask === 'partner' ? 40 : 30, reasons);
  const rest = 1 - a.chance;
  return { agree: a.chance, counter: rest * 0.4, delay: rest * 0.2, reasons: a.reasons };
}

/* ---------------- the storyline ---------------- */

export const TROPICANA: MissionDef = {
  id: 'tropicana',
  title: 'The Tropicana',
  kind: 'A disputed business acquisition',
  blurb: 'Old man Kovacs wants out of the Tropicana Motel on the Boardwalk at Lincoln Avenue. Two families want in.',
  first: 'word',
  participants: (s, m) => {
    const out: { id?: string; name: string; role: string }[] = [{ name: owner(s), role: 'Owns the Tropicana; wants out' }];
    const f = bossOf(s, 'feldstein');
    if (f) out.push({ id: f.id, name: displayName(f), role: 'New York money; made the first offer' });
    const mm = bossOf(s, 'manno');
    if (mm) out.push({ id: mm.id, name: displayName(mm), role: m.flags.manno ? 'His men have been leaning on Kovacs' : 'Watching from Atlantic City' });
    const law = s.rivals.find((r) => r.kind === 'law');
    const lc = law ? s.characters[law.leaderId] : undefined;
    if (lc?.alive) out.push({ id: lc.id, name: displayName(lc), role: 'The County Prosecutor; would love a case' });
    return out;
  },
  facts: [
    { id: 'threat', claim: 'Feldstein\'s man leaned on old Kovacs to sell', knownBy: 'the Tropicana\'s night clerk' },
    { id: 'mortgage', claim: 'A Philadelphia bank holds the Tropicana\'s mortgage and wants out', knownBy: 'Kovacs himself, if he trusts you' },
    { id: 'books', claim: 'The Tropicana is losing money', knownBy: 'Kovacs\'s accountant' },
  ],
  stages: {
    word: {
      title: 'Word on the Boardwalk',
      text: (s) => `${owner(s)} has had enough of the motel business. Feldstein's people already made an offer on the Tropicana, and somebody has been coming around at night. Before anybody signs anything, find out what is going on.`,
      objectives: ['Find out who has been leaning on Kovacs', 'Learn what the Tropicana is really worth'],
      decisions: [
        {
          id: 'ask', label: 'Send a man to ask around', delegate: 'intrigue',
          detail: () => 'The night clerk, the accountant, the boys on the pier. A quiet man learns more than a loud one.',
          odds: (s, _m, a) => odds(35, [{ label: a ? `${a.firstName}'s intrigue` : 'Nobody sent', value: a ? Math.round(a.attributes.intrigue * 0.5) : -30 }, { label: 'Your respect', value: Math.round((s.respect - 50) * 0.2) }]),
          resolve: (ctx, m, ok, a) => {
            const s = ctx.s;
            if (ok) {
              reveal(s, m, 'threat', `${a ? a.firstName : 'Your man'} via the night clerk`);
              reveal(s, m, 'books', `${a ? a.firstName : 'Your man'} via the accountant`);
              note(s, m, `${a ? displayName(a) : 'Your man'} came back with names.`, 'you');
            } else {
              applyEffects(ctx, [{ type: 'rivalOpinion', rival: 'feldstein', amount: -5, reason: 'Nosing around our deal' }], { label: 'The Tropicana', because: 'asked around about the Tropicana', category: 'event' });
              note(s, m, `${a ? a.firstName : 'Your man'} asked the wrong people. Feldstein heard about it.`, 'you');
            }
            advance(ctx, m, 'offers');
          },
        },
        {
          id: 'visit', label: 'Call on Kovacs yourself',
          detail: (s) => `Coffee in ${owner(s)}'s kitchen. If he trusts you, he will tell you what the bank told him.`,
          odds: (s) => { const b = s.characters[s.playerId]; return odds(40, [{ label: 'Your diplomacy', value: Math.round((b?.attributes.diplomacy ?? 30) * 0.4) }, { label: 'Your respect', value: Math.round((s.respect - 50) * 0.3) }]); },
          resolve: (ctx, m, ok) => {
            const s = ctx.s;
            m.flags.metOwner = 1;
            if (ok) { reveal(s, m, 'mortgage', owner(s)); note(s, m, `${owner(s)} poured the coffee and told you about the bank.`, 'you'); }
            else note(s, m, `${owner(s)} was polite and said nothing.`, 'you');
            advance(ctx, m, 'offers');
          },
        },
        {
          id: 'out', label: 'Stay out of it',
          detail: () => 'Not your motel, not your problem. Feldstein gets a foothold on your Boardwalk.',
          resolve: (ctx, m) => {
            transfer(ctx, bossOf(ctx.s, 'feldstein') ? 'feldstein' : 'private', 'Feldstein\'s people', lotOf(ctx.s)?.price ?? 0, 'sold');
            end(ctx, m, 'stayedOut', 'You stayed out of it. Feldstein bought the Tropicana.');
          },
        },
      ],
    },
    offers: {
      title: 'Two offers on the table',
      text: (s, m) => `Feldstein has an offer in${m.flags.raised ? ' — a better one than last week' : ''}${m.flags.manno ? ', and Manno\'s men have been by twice' : ''}. ${owner(s)} will take the best deal that lets him sleep at night.`,
      objectives: ['Get the Tropicana, a share of it, or Feldstein off your Boardwalk', 'Do not start a war over a motel'],
      decisions: [
        {
          id: 'buy', label: 'Make Kovacs an offer', delegate: 'business',
          detail: (s, m) => `${fmtMoney(buyPrice(s, m))} for the building and the business${m.flags.metOwner ? ' (he knows you)' : ''}${m.flags.raised ? ' (you have to beat Feldstein\'s raise)' : ''}.`,
          cost: (s, m) => buyPrice(s, m),
          odds: (s, m, a) => odds(50, [
            ...(m.flags.metOwner ? [{ label: 'He knows you', value: 15 }] : []),
            ...(m.flags.raised ? [{ label: 'Feldstein raised his offer', value: -10 }] : []),
            ...(m.flags.clear ? [{ label: 'Feldstein walked away', value: 25 }] : []),
            ...(m.flags.sitdownFailed ? [{ label: 'The sit-down went badly', value: -8 }] : []),
            ...(a ? [{ label: `${a.firstName}'s business sense`, value: Math.round(a.attributes.business * 0.3) }] : []),
            { label: 'Your respect', value: Math.round((s.respect - 50) * 0.2) },
          ]),
          blocked: (s, m) => (s.money < buyPrice(s, m) ? `Needs ${fmtMoney(buyPrice(s, m))}` : undefined),
          resolve: (ctx, m, ok) => {
            const s = ctx.s;
            if (!ok) { note(s, m, `${owner(s)} said he would think about Feldstein's offer a while longer.`, 'you'); m.flags.tries = (m.flags.tries ?? 0) + 1; return; }
            const price = buyPrice(s, m);
            money(ctx, -price, 'Bought the Tropicana Motel', 'business');
            transfer(ctx, 'player', owner(s), price, 'bought');
            const eff: Effect[] = [];
            if (!m.flags.clear && bossOf(s, 'feldstein')) eff.push({ type: 'rivalOpinion', rival: 'feldstein', amount: -12, reason: 'Took the Tropicana from under us' });
            if (m.flags.manno && bossOf(s, 'manno')) eff.push({ type: 'rivalOpinion', rival: 'manno', amount: -5, reason: 'Beat us to the Tropicana' });
            applyEffects(ctx, eff, { label: 'The Tropicana', because: 'bought the Tropicana', category: 'event' });
            end(ctx, m, 'bought', `The Tropicana is yours (${fmtMoney(price)}).${m.flags.clear ? ' Feldstein had already walked away.' : ' Feldstein will remember.'}`);
          },
        },
        {
          id: 'sitdown', label: 'Sit down with Feldstein',
          detail: () => 'A table at the Wave Crest Hotel, his place. Settle it like businessmen.',
          blocked: (s, m) => (!bossOf(s, 'feldstein') ? 'Feldstein has nobody to sit down with' : m.flags.sitdowns >= 2 ? 'He will not sit down a third time' : undefined),
          resolve: (ctx, m) => { m.flags.sitdowns = (m.flags.sitdowns ?? 0) + 1; note(ctx.s, m, 'You asked for a sit-down. Feldstein sent word: the Wave Crest, Thursday.', 'you'); advance(ctx, m, 'sitdown', true); },
        },
        {
          id: 'expose', label: 'Tip the Prosecutor about the threat',
          detail: () => 'An anonymous call about a New York man leaning on a Wildwood motel owner. The Prosecutor gets a headline; Feldstein gets a subpoena.',
          blocked: (_s, m) => (m.facts.threat !== 'true' ? 'You need proof he leaned on Kovacs' : undefined),
          resolve: (ctx, m) => {
            const s = ctx.s;
            const eff: Effect[] = [{ type: 'respect', amount: 2 }];
            if (bossOf(s, 'feldstein')) eff.push({ type: 'rivalResource', rival: 'feldstein', exposure: 12 }, { type: 'rivalOpinion', rival: 'feldstein', amount: -25, reason: 'Called the Prosecutor on us' });
            applyEffects(ctx, eff, { label: 'The Tropicana', because: 'tipped off the Prosecutor', category: 'event' });
            const h = ensureHood(s);
            if (h) h.stats.boardwalk.police = Math.min(100, h.stats.boardwalk.police + 10);
            transfer(ctx, 'private', 'Kovacs\'s nephew Tibor', lotOf(s)?.price ?? 0, 'sold');
            end(ctx, m, 'exposed', 'The Prosecutor took the call. Feldstein backed off with a subpoena in his pocket; the Kovacs family kept the Tropicana and sold it to a nephew. The cops are on the Boardwalk more than they were.');
          },
        },
        {
          id: 'letgo', label: 'Let the families have it',
          detail: (_s, m) => (m.flags.manno ? 'Manno\'s men will settle it their way. Kovacs leaves town; you do not ask how.' : 'Feldstein gets the Tropicana.'),
          resolve: (ctx, m) => {
            const s = ctx.s;
            if (m.flags.manno && bossOf(s, 'manno')) {
              transfer(ctx, 'manno', 'Manno\'s people', lotOf(s)?.price ?? 0, 'seized');
              const h = ensureHood(s);
              if (h) { h.stats.boardwalk.police = Math.min(100, h.stats.boardwalk.police + 6); h.stats.boardwalk.rep = Math.max(0, h.stats.boardwalk.rep - 4); }
              end(ctx, m, 'manno', 'Manno settled it. Kovacs left for Florida in the middle of the night; the Tropicana belongs to Atlantic City now. People on the Boardwalk talk about it in low voices.');
            } else {
              transfer(ctx, bossOf(s, 'feldstein') ? 'feldstein' : 'private', 'Feldstein\'s people', lotOf(s)?.price ?? 0, 'sold');
              end(ctx, m, 'feldstein', 'Feldstein bought the Tropicana.');
            }
          },
        },
      ],
    },
    sitdown: {
      title: 'The sit-down at the Wave Crest',
      text: (s) => { const f = bossOf(s, 'feldstein'); return `${f ? displayName(f) : 'Feldstein'} orders for both of you. He wants the Tropicana; he does not want a war. Neither do you.`; },
      objectives: ['Settle the Tropicana without a war'],
      decisions: [
        {
          id: 'partner', label: 'Propose a partnership: he buys, you take a cut',
          detail: (s) => { const r = sitdownRoll(s, findRun(s)!, 'partner'); return `He buys the Tropicana; your house takes $180 a week for a year and he stays off your corners. He agrees ${Math.round(r.agree * 100)}% · counteroffers ${Math.round(r.counter * 100)}% · asks for time ${Math.round(r.delay * 100)}%.`; },
          odds: (s, m) => { const r = sitdownRoll(s, m, 'partner'); return { chance: r.agree, reasons: r.reasons }; },
          resolve: (ctx, m) => sitdownAnswer(ctx, m, 'partner'),
        },
        {
          id: 'walk', label: 'Ask him to walk away',
          detail: (s) => { const r = sitdownRoll(s, findRun(s)!, 'walk'); return `It is your Boardwalk. He agrees ${Math.round(r.agree * 100)}% · counteroffers ${Math.round(r.counter * 100)}% · asks for time ${Math.round(r.delay * 100)}%.`; },
          odds: (s, m) => { const r = sitdownRoll(s, m, 'walk'); return { chance: r.agree, reasons: r.reasons }; },
          resolve: (ctx, m) => sitdownAnswer(ctx, m, 'walk'),
        },
        {
          id: 'leave', label: 'Get up and leave',
          detail: () => 'No deal. Back to Kovacs.',
          resolve: (ctx, m) => { m.flags.sitdownFailed = 1; note(ctx.s, m, 'You left the Wave Crest without a handshake.', 'you'); advance(ctx, m, 'offers', true); },
        },
      ],
    },
    counter: {
      title: 'Feldstein\'s counteroffer',
      text: (_s, m) => (m.flags.counterKind === 2 ? `Feldstein will walk away from the Tropicana — for ${fmtMoney(2500)}, "for my trouble."` : 'Feldstein will take a partner, at $110 a week, not $180. Take it or leave it.'),
      objectives: ['Take his terms or go back to Kovacs'],
      decisions: [
        {
          id: 'take', label: 'Take his terms',
          detail: (_s, m) => (m.flags.counterKind === 2 ? 'Pay him off; the Tropicana is yours to buy.' : 'A partner at $110 a week for a year.'),
          cost: (_s, m) => (m.flags.counterKind === 2 ? 2500 : 0),
          blocked: (s, m) => (m.flags.counterKind === 2 && s.money < 2500 ? 'Needs $2,500' : undefined),
          resolve: (ctx, m) => {
            if (m.flags.counterKind === 2) {
              money(ctx, -2500, 'Paid Feldstein to walk away from the Tropicana', 'event');
              m.flags.clear = 1;
              m.flags.raised = 0;
              note(ctx.s, m, 'You paid. Feldstein withdrew his offer.', 'you');
              advance(ctx, m, 'offers', true);
            } else partnership(ctx, m, 110);
          },
        },
        {
          id: 'refuse', label: 'Turn him down',
          detail: () => 'Back to Kovacs, without Feldstein\'s blessing.',
          resolve: (ctx, m) => { m.flags.sitdownFailed = 1; note(ctx.s, m, 'You turned down his terms.', 'you'); advance(ctx, m, 'offers', true); },
        },
      ],
    },
  },
};

function findRun(s: GameState): MissionRun | undefined {
  return s.missions?.runs.find((r) => r.def === 'tropicana' && !r.ended);
}

function partnership(ctx: Ctx, m: MissionRun, weekly: number): void {
  const s = ctx.s;
  const t = ensureTalks(s);
  t.pacts.push({ id: `pact${t.nextId++}`, a: 'player', b: 'feldstein', kind: 'partnership', since: s.week, until: s.week + 52, weekly, terms: `the Tropicana: Feldstein owns it, your house takes ${fmtMoney(weekly)}/wk, and neither side moves on the other` });
  t.stats.pacts++;
  t.log.push({ week: s.week, y: s.date.y, m: s.date.m, text: `A partnership with Feldstein over the Tropicana (${fmtMoney(weekly)}/wk).`, kind: 'pact' });
  transfer(ctx, 'feldstein', 'Feldstein\'s people', lotOf(s)?.price ?? 0, 'sold');
  applyEffects(ctx, [{ type: 'rivalOpinion', rival: 'feldstein', amount: 10, reason: 'Partners on the Tropicana' }], { label: 'The Tropicana', because: 'went into partnership with Feldstein', category: 'event' });
  end(ctx, m, 'partners', `Feldstein bought the Tropicana with your blessing; your house takes ${fmtMoney(weekly)} a week and the two families keep the peace for a year.`);
}

function sitdownAnswer(ctx: Ctx, m: MissionRun, ask: 'partner' | 'walk'): void {
  const s = ctx.s;
  const ms = ensureMissions(s);
  const r = sitdownRoll(s, m, ask);
  const x = rand(ms);
  if (x < r.agree) {
    if (ask === 'partner') return partnership(ctx, m, 180);
    m.flags.clear = 1;
    m.flags.raised = 0;
    note(s, m, 'Feldstein shrugged: "It is your Boardwalk." He withdrew his offer.', 'npc');
    applyEffects(ctx, [{ type: 'rivalOpinion', rival: 'feldstein', amount: 3, reason: 'Settled it like gentlemen' }], { label: 'The Tropicana', because: 'settled with Feldstein', category: 'event' });
    return advance(ctx, m, 'offers', true);
  }
  if (x < r.agree + r.counter) {
    m.flags.counterKind = ask === 'partner' ? 1 : 2;
    note(s, m, ask === 'partner' ? 'Feldstein smiled: "A partner, yes. At a hundred and ten."' : 'Feldstein smiled: "I could walk away. For my trouble."', 'npc');
    return advance(ctx, m, 'counter', true);
  }
  if (x < r.agree + r.counter + r.delay) {
    m.waiting = { decision: ask, until: s.week + randInt(ms, 2, 3) };
    note(s, m, '"Let me think about it," Feldstein said, and paid the check.', 'npc');
    return;
  }
  m.flags.sitdownFailed = 1;
  note(s, m, 'Feldstein said no and lit a cigar. The sit-down is over.', 'npc');
  advance(ctx, m, 'offers', true);
}

/** Move to a stage; between your moves, the other side acts. */
function advance(ctx: Ctx, m: MissionRun, stage: string, quiet = false): void {
  const s = ctx.s;
  const ms = ensureMissions(s);
  m.stage = stage;
  if (quiet || stage !== 'offers') return;
  if (bossOf(s, 'feldstein') && chance(ms, 0.5)) { m.flags.raised = 1; note(s, m, 'Feldstein raised his offer for the Tropicana.', 'npc'); }
  if (bossOf(s, 'manno') && chance(ms, 0.35)) {
    m.flags.manno = 1;
    note(s, m, 'Manno\'s men paid Kovacs a visit. Nobody saw anything.', 'npc');
    const h = ensureHood(s);
    if (h) h.stats.boardwalk.police = Math.min(100, h.stats.boardwalk.police + 4);
  }
}

/* ---------------- the board ---------------- */

export const MISSION_DEFS: Record<string, MissionDef> = { tropicana: TROPICANA };

/** Weekly: open the case when its moment comes; answers come in; the other side moves if you dawdle. */
export function missionsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const l = lotOf(s);
  if (!s.missions && !(l && l.status === 'sale' && s.week >= 2)) return;
  const ms = ensureMissions(s);
  if (!ms.runs.some((r) => r.def === 'tropicana') && l && l.status === 'sale' && l.tenant) {
    const run: MissionRun = {
      id: `ms${ms.nextId++}`, def: 'tropicana', stage: TROPICANA.first, started: s.week,
      facts: { threat: 'unknown', mortgage: 'unknown', books: 'unknown' },
      truth: { threat: chance(ms, 0.6), mortgage: chance(ms, 0.6), books: chance(ms, 0.45) },
      source: {}, flags: {}, log: [],
    };
    note(s, run, 'The case opened: Kovacs wants out of the Tropicana.', 'npc');
    ms.runs.push(run);
    ms.stats.started++;
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: 'On the Boardwalk, old man Kovacs wants out of the Tropicana Motel. Feldstein has made an offer. (Mission Board)', kind: 'misc' });
    return;
  }
  for (const m of ms.runs) {
    if (m.ended) continue;
    if (m.waiting && m.waiting.until <= s.week) {
      const d = m.waiting.decision as 'partner' | 'walk';
      m.waiting = undefined;
      note(s, m, 'Feldstein sent word.', 'npc');
      sitdownAnswer(ctx, m, d);
      continue;
    }
    // Dawdle and Feldstein closes on his own.
    if (m.stage !== 'sitdown' && m.stage !== 'counter' && !m.flags.clear && s.week - m.started > (m.flags.raised ? 8 : 12) && bossOf(s, 'feldstein') && chance(ms, 0.25)) {
      transfer(ctx, 'feldstein', 'Feldstein\'s people', lotOf(s)?.price ?? 0, 'sold');
      end(ctx, m, 'feldstein', 'While you thought it over, Feldstein closed. The Tropicana is his.');
    }
    // The building went another way (sold, burned).
    const lot = lotOf(s);
    if (!m.ended && lot && (lot.status === 'owned' || lot.status === 'leased')) end(ctx, m, 'bought', 'You bought the Tropicana outright, before anybody else could.');
    else if (!m.ended && lot && lot.status !== 'sale') end(ctx, m, 'gone', 'The Tropicana went another way before anybody signed.');
  }
}

export function previewMission(s: GameState, op: MissionOp): ActionPreview {
  const m = s.missions?.runs.find((r) => r.id === op.run);
  const def = m ? MISSION_DEFS[m.def] : undefined;
  const st = m && def ? def.stages[m.stage] : undefined;
  const d = st?.decisions.find((x) => x.id === op.decision);
  if (!m || !def || !st || !d) return { title: 'Mission', effects: [], cost: 0, because: '', disabledReason: 'Not now', category: 'event' };
  const agent = op.agent ? s.characters[op.agent] : undefined;
  const cost = d.cost?.(s, m) ?? 0;
  const why = m.ended ? 'The case is closed' : m.waiting ? 'Waiting on an answer' : d.delegate && op.agent && (!agent?.alive || agent.faction !== 'player') ? 'He cannot do it' : d.blocked?.(s, m);
  return {
    title: `${def.title}: ${d.label}${agent ? ` (${agent.firstName})` : ''}`, detail: d.detail(s, m), effects: [], cost,
    because: `${d.label.charAt(0).toLowerCase()}${d.label.slice(1)} (the Tropicana)`, disabledReason: why, odds: d.odds?.(s, m, agent), category: 'event',
  };
}

export function commitMission(ctx: Ctx, op: MissionOp): void {
  const s = ctx.s;
  const ms = ensureMissions(s);
  const m = ms.runs.find((r) => r.id === op.run);
  const def = m ? MISSION_DEFS[m.def] : undefined;
  const d = m && def ? def.stages[m.stage]?.decisions.find((x) => x.id === op.decision) : undefined;
  if (!m || !d || m.ended) return;
  ms.stats.decisions++;
  const agent = op.agent ? s.characters[op.agent] : undefined;
  const o = d.odds?.(s, m, agent);
  const ok = o ? rand(ms) < o.chance : true;
  d.resolve(ctx, m, ok, agent);
}

/** What the sim's random player can decide this week. */
export function missionActions(s: GameState): { kind: 'mission'; op: MissionOp }[] {
  const out: { kind: 'mission'; op: MissionOp }[] = [];
  for (const m of s.missions?.runs ?? []) {
    if (m.ended || m.waiting) continue;
    const st = MISSION_DEFS[m.def].stages[m.stage];
    const agent = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank !== 'civilian' && c.id !== s.playerId);
    for (const d of st?.decisions ?? []) out.push({ kind: 'mission', op: { run: m.id, decision: d.id, agent: d.delegate ? agent?.id : undefined } });
  }
  return out;
}
