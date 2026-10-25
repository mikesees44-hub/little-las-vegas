import { START_DATE, seasonInfo, toDays } from './calendar';
import { heat, money, type Ctx } from './ledger';
import { gauss, hashSeed, rand, weightedPick, type RngHolder } from './rng';
import { controlIndex } from './polIntegrity';
import { JURIS_NAME, LAW_BY_ID, LAW_DEFS, LEGISLATURE, OFFICE_BY_ID, preempted, type FavorKind, type LawDef } from './polData';
import { holder, holders, nameOf } from './polGov';
import type { Bill, PolPerson } from './polState';
import type { BusinessKind, GameState } from './types';

/**
 * Living legislation. A problem arises (a crime wave, a scandal, a fire, hard
 * times, a reform movement, a war on organized crime, or your own lobbyist),
 * then a bill, debate, a vote by the people who hold the seats, the
 * executive's signature or veto, implementation, a court challenge, and the
 * consequences: every law in force maps to named effects (income lines,
 * heat, evidence, acceptance odds, election risk). Jurisdiction matters: a
 * city cannot pass a state law, and a city ordinance that contradicts a state
 * law in force is struck down. The real anchors (the Wire Act, RICO, the
 * casino referendums and the Casino Control Act ...) land on their dates.
 */

export function inForce(s: GameState, id: string): boolean {
  return s.pol?.laws[id] !== undefined;
}

function lawsInForce(s: GameState): LawDef[] {
  const pol = s.pol;
  if (!pol) return [];
  return Object.keys(pol.laws).map((id) => LAW_BY_ID[id]).filter((l): l is LawDef => !!l);
}

/** Acceptance-odds reasons from laws in force, for a favor kind. */
export function lawFavorReasons(s: GameState, kind: FavorKind): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  for (const l of lawsInForce(s)) for (const e of l.effects) if (e.kind === 'favorOdds' && (e.favors === 'all' || e.favors.includes(kind))) out.push({ label: `Law: ${l.name}`, value: e.value });
  return out;
}

export function lawFraudRisk(s: GameState): number {
  return lawsInForce(s).reduce((a, l) => a + l.effects.reduce((b, e) => b + (e.kind === 'fraudRisk' ? e.value : 0), 0), 0);
}
export function lawFlipRisk(s: GameState): number {
  return lawsInForce(s).reduce((a, l) => a + l.effects.reduce((b, e) => b + (e.kind === 'flipRisk' ? e.value : 0), 0), 0);
}
export function lawKidExposure(s: GameState): number {
  return lawsInForce(s).reduce((a, l) => a + l.effects.reduce((b, e) => b + (e.kind === 'kidExposure' ? e.value : 0), 0), 0);
}

/** What a law does to your books this week: one named line per law. */
export function lawIncomeDelta(s: GameState, law: LawDef): number {
  const mult = seasonInfo(s.date).multiplier;
  let d = 0;
  for (const e of law.effects) {
    if (e.kind !== 'income') continue;
    for (const b of s.businesses) {
      if (b.owner !== 'player' || !e.biz.includes(b.kind) || (b.closedUntil ?? 0) > s.week) continue;
      d += (b.weeklyBase * mult * e.pct) / 100;
    }
  }
  return Math.round(d);
}

export function lawEffectText(l: LawDef): string[] {
  const kinds = (b: BusinessKind[]) => b.join(', ');
  return l.effects.map((e) => {
    switch (e.kind) {
      case 'income': return `${e.pct > 0 ? '+' : '−'}${Math.abs(e.pct)}% at your ${kinds(e.biz)}`;
      case 'heat': return `${e.per4 > 0 ? '+' : '−'}${Math.abs(e.per4)} ${e.bar} heat every 4 weeks`;
      case 'evidence': return `+${e.weekly}/wk evidence when the feds are interested`;
      case 'favorOdds': return `${e.value > 0 ? '+' : '−'}${Math.abs(e.value)} odds on ${e.favors === 'all' ? 'every favor' : e.favors.join('/') + ' favors'}`;
      case 'fraudRisk': return `+${Math.round(e.value * 100)}% risk on dirty elections`;
      case 'flipRisk': return `+${Math.round(e.value * 100)}% a month that a compromised official turns`;
      case 'kidExposure': return 'Your children in office draw double scrutiny';
      case 'enables': return `Enables ${e.what}`;
    }
  });
}

/** Weekly: the laws in force, as named ledger lines. */
export function lawsWeek(ctx: Ctx): void {
  const s = ctx.s;
  for (const l of lawsInForce(s)) {
    const d = lawIncomeDelta(s, l);
    if (d) money(ctx, d, `Law: ${l.name}`, 'business');
    if (s.week % 4 === 0) for (const e of l.effects) if (e.kind === 'heat') heat(ctx, e.bar, e.per4, `Law: ${l.name}`, 'heat');
  }
}

/* ------------------------------------------------------------------ */
/* Bills                                                               */
/* ------------------------------------------------------------------ */

export const STAGE_LABEL: Record<Bill['stage'], string> = {
  problem: 'A problem in the papers', debate: 'In debate', vote: 'Up for a vote', signature: 'On the executive\'s desk', implementation: 'Being implemented',
  challenge: 'Challenged in court', law: 'In force', failed: 'Voted down', vetoed: 'Vetoed', struck: 'Struck down',
};

function anchorWeek(_s: GameState, l: LawDef): number {
  // The first week on or after the anchor date.
  return Math.ceil((toDays(l.anchor!) - toDays(START_DATE)) / 7) + 1;
}

function members(s: GameState, l: LawDef): PolPerson[] {
  const leg = LEGISLATURE[l.juris];
  return leg.body.flatMap((o) => holders(s, o)).filter((p): p is PolPerson => !!p && p.alive);
}

/** Base support: reform laws are popular in a crackdown; friendly laws need friends. */
function baseSupport(s: GameState, l: LawDef): number {
  let v = l.friendly ? 42 : 52;
  if (s.pol?.crackdown && s.week < s.pol.crackdown.until) v += l.friendly ? -8 : 10;
  if (l.trigger === 'economy') v += 5;
  return v;
}

/** Introduces a bill (organic problem, crackdown, or your lobbyist). */
export function introduce(s: GameState, lawId: string, note: string, pushBy = 0): Bill | undefined {
  const pol = s.pol!;
  const l = LAW_BY_ID[lawId];
  if (!l || pol.laws[lawId] !== undefined || pol.bills.some((b) => b.law === lawId && !isDone(b))) return undefined;
  if (l.needs?.some((n) => pol.laws[n] === undefined)) return undefined;
  const sponsor = members(s, l)[0];
  const b: Bill = { id: `b${s.week}_${lawId}`, law: lawId, stage: 'problem', since: s.week, next: s.week + 2 + (s.week % 3), support: baseSupport(s, l) + pushBy, push: pushBy, note };
  if (sponsor) b.sponsor = sponsor.id;
  pol.bills.push(b);
  return b;
}

export function isDone(b: Bill): boolean {
  return b.stage === 'law' || b.stage === 'failed' || b.stage === 'vetoed' || b.stage === 'struck';
}

/** Monthly: new problems become bills (one at most), anchors are scheduled. */
export function billsMonth(s: GameState, econ: number): void {
  const pol = s.pol!;
  for (const l of LAW_DEFS) {
    if (!l.anchor || pol.laws[l.id] !== undefined || pol.bills.some((b) => b.law === l.id)) continue;
    const aw = anchorWeek(s, l);
    if (s.week >= aw - 10) {
      pol.bills.push({ id: `b${aw}_${l.id}`, law: l.id, stage: 'debate', since: s.week, next: Math.max(s.week + 1, aw), support: l.anchorFails ? 35 : 70, push: 0, note: l.problem });
    }
  }
  // A new administration settles in first: no new local bills before 1962.
  const open = pol.bills.filter((b) => !isDone(b)).length;
  if (s.date.y < 1962 || open >= 4 || rand(pol) >= 0.08) return;
  const recent = (id: string) => pol.bills.some((b) => b.law === id && s.week - b.since < 52 * 4);
  const cands = LAW_DEFS.filter((l) => !l.anchor && pol.laws[l.id] === undefined && !recent(l.id) && (!l.from || s.date.y >= l.from) && !(l.needs?.some((n) => pol.laws[n] === undefined)) && l.trigger !== 'lobby');
  const weight = (l: LawDef) => {
    switch (l.trigger) {
      case 'heat': return s.heat.local >= 50 ? 3 : 0.3;
      case 'scandal': return pol.stats.scandals > 0 ? 1.5 : 0.4;
      case 'fire': return 0.6;
      case 'economy': return econ < 45 || econ > 58 ? 1.5 : 0.6;
      case 'reform': return 1;
      case 'crackdown': return pol.crackdown && s.week < pol.crackdown.until ? 4 : s.heat.local >= 60 ? 1 : 0.15;
      default: return 0.5;
    }
  };
  const l = weightedPick(pol, cands, weight);
  if (l) introduce(s, l.id, l.problem);
}

/** Weekly: bills move through their stages. Returns headlines. */
export function billsWeek(ctx: Ctx): string[] {
  const s = ctx.s;
  const pol = s.pol!;
  const news: string[] = [];
  for (const b of pol.bills) {
    if (isDone(b) || s.week < b.next) continue;
    const l = LAW_BY_ID[b.law];
    if (!l) continue;
    const r: RngHolder = { rng: hashSeed(`${s.seed}:${b.id}:${b.stage}`) };
    const step = (stage: Bill['stage'], wait: number) => {
      b.stage = stage;
      b.since = s.week;
      b.next = s.week + wait;
    };
    switch (b.stage) {
      case 'problem':
        step('debate', 4 + Math.floor(rand(r) * 5));
        break;
      case 'debate':
        b.support = Math.max(0, Math.min(100, b.support + (l.anchor ? 0 : gauss(r) * 5)));
        step('vote', 1);
        break;
      case 'vote': {
        const res = vote(s, l, b, r);
        b.votes = res.votes;
        if (res.pass) {
          news.push(`${l.name} passes ${LEGISLATURE[l.juris].name}.`);
          if (LEGISLATURE[l.juris].exec && !l.anchor) step('signature', 1);
          else step('implementation', l.anchor ? 0 : 2 + Math.floor(rand(r) * 4));
        } else {
          step('failed', 0);
          pol.stats.billsFailed++;
          news.push(`${l.name} fails${l.anchor ? ' at the polls' : ''}.`);
        }
        break;
      }
      case 'signature': {
        const exec = holder(s, LEGISLATURE[l.juris].exec!);
        const ct = exec ? pol.ctl[exec.id] : undefined;
        const ci = ct ? controlIndex(ct) : 0;
        let veto = 0.08 + (exec && !l.friendly ? (50 - exec.integrity) / 300 : 0);
        if (ci >= 70 && b.push < 0) veto += 0.6;
        else if (ci >= 40 && b.push < 0) veto += 0.25;
        if (ci >= 40 && b.push > 0) veto = Math.max(0, veto - 0.1);
        if (rand(r) < veto) {
          step('vetoed', 0);
          pol.stats.billsFailed++;
          news.push(`${exec ? nameOf(s, exec) : 'The executive'} vetoes the ${l.name}.`);
        } else step('implementation', 2 + Math.floor(rand(r) * 4));
        break;
      }
      case 'implementation': {
        const pre = preempted(l, pol.laws);
        if (pre || (!l.anchor && rand(r) < 0.25)) step('challenge', 3 + Math.floor(rand(r) * 4));
        else enact(ctx, b, l, news);
        break;
      }
      case 'challenge': {
        const pre = preempted(l, pol.laws);
        if (pre || rand(r) < 0.2) {
          step('struck', 0);
          b.note = pre ? `Preempted by state law (${pre}): a city cannot override the state.` : 'A judge found it unconstitutional.';
          pol.stats.struck++;
          news.push(`Court strikes down the ${l.name}.`);
        } else enact(ctx, b, l, news);
        break;
      }
    }
  }
  // Keep the docket short: the last few finished bills, every open one.
  const done = pol.bills.filter(isDone);
  if (done.length > 16) {
    const drop = new Set(done.slice(0, done.length - 16).map((b) => b.id));
    pol.bills = pol.bills.filter((b) => !drop.has(b.id));
  }
  return news;
}

function enact(ctx: Ctx, b: Bill, l: LawDef, news: string[]): void {
  const s = ctx.s;
  const pol = s.pol!;
  b.stage = 'law';
  b.since = s.week;
  pol.laws[l.id] = s.week;
  pol.stats.billsPassed++;
  news.push(`${l.name} takes effect.`);
  // A state law voids the city ordinances it preempts.
  for (const other of LAW_DEFS) {
    if (other.preemptedBy === l.id && pol.laws[other.id] !== undefined) {
      delete pol.laws[other.id];
      news.push(`${other.name} is void under the new state law.`);
    }
  }
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `New law: ${l.name} (${JURIS_NAME[l.juris]}). ${l.text}`, kind: 'misc' });
}

/**
 * The vote. Small bodies vote by name (each member: support, his own
 * integrity on a reform bill, and you if you own him); big ones are the
 * floor's mood plus the named local members.
 */
export function vote(s: GameState, l: LawDef, b: Bill, r: RngHolder): { pass: boolean; votes: Record<string, boolean> } {
  const pol = s.pol!;
  const votes: Record<string, boolean> = {};
  if (l.anchor) return { pass: !l.anchorFails, votes };
  const ms = members(s, l);
  let yes = 0;
  for (const m of ms) {
    let v = b.support + gauss(r) * 8;
    if (!l.friendly) v += (m.integrity - 50) / 3;
    const ct = pol.ctl[m.id];
    const ci = ct ? controlIndex(ct) : 0;
    if (ci >= 40 && b.push !== 0) v += Math.sign(b.push) * (ci >= 70 ? 40 : 15);
    votes[m.id] = v >= 50;
    if (votes[m.id]) yes++;
  }
  const level = OFFICE_BY_ID[LEGISLATURE[l.juris].body[0] ?? '']?.level;
  if (l.juris === 'state' || l.juris === 'federal' || level === undefined) {
    const floor = b.support + (yes - (ms.length - yes)) * 3 + gauss(r) * 4;
    return { pass: floor >= 50, votes };
  }
  return { pass: yes * 2 > ms.length, votes };
}
