import { devValue } from './develop';
import { previewAction, VIA_INFO, type ActionPreview } from './actions';
import { bestDistrict } from './racketLife';
import { crewTake } from './racketHub';
import { pillarBestWhen, pillarPurpose, pillarRisks, pillarUnlocks, pillarValue, ROMANCE_PURPOSE } from './advicePillars';
import { idleMen } from './business';
import { isInSeason, memorialDay, toDays } from './calendar';
import { CATALOG } from './catalog';
import { capos, crew, livingDynasty, player } from './characters';
import { holder, SEAT_INFO, seatPower, TASKS } from './council';
import { skimRate, UNWASHED_SAFE } from './economy';
import { describeEffect, fmtMoney } from './effects';
import { ORDERS } from './events';
import { HEAT_THRESHOLD } from './heat';
import { obeyOdds, orderAgent } from './hierarchy';
import { OPEN_FILE } from './longgame';
import { opinion } from './relations';
import { CITIES, HEISTS, needsSanction, sanctioned, SCHEME_INFO, schemeOdds } from './schemes';
import { forecast, newDispute } from './table';
import { recurringOf, recurringOfAll, recurringValue } from './recurring';
import { CAPO_CUT } from './economy';
import type { Choice, CouncilTask, Dispute, Effect, GameState, HeatBar, PlayerAction, Seat } from './types';

/**
 * Advice: why you would do a thing, what it gets you, what it costs, what
 * can go wrong and whether now is the time. Everything is read off the same
 * preview the order card shows (`previewAction`) — the effects listed as
 * "now" are exactly the effects that get applied — plus a few derived
 * "per week" and "if it works" lines that are labelled as such.
 *
 * Pure: never touches the state.
 */

export type Tone = 'good' | 'bad' | 'neutral';
export type When = 'now' | 'if accepted' | 'if it works' | 'next week' | 'per week' | 'later';

export interface NamedEffect {
  /** What causes it (the effect's label, or the action). */
  label: string;
  /** Chip text, e.g. "−$2,000" or "+4 Local heat". */
  text: string;
  tone: Tone;
  when: When;
  /** For money/respect/heat: the range of the change (min = max when certain). */
  stat?: 'money' | 'respect' | `heat.${HeatBar}`;
  min?: number;
  max?: number;
}

export interface Risk {
  text: string;
  /** 0..1 */
  chance: number;
  /** Where the number comes from. */
  source: string;
  severity: 'low' | 'mid' | 'high';
}

export interface Condition {
  text: string;
  met: boolean;
}

export type VerdictTone = 'good' | 'warn' | 'bad' | 'blocked' | 'neutral';

export interface Verdict {
  label: string;
  tone: VerdictTone;
  /** One short reason for the verdict. */
  because: string;
}

export interface ActionExplanation {
  title: string;
  /** "Why do this", in one line. */
  purpose: string;
  gains: NamedEffect[];
  costs: NamedEffect[];
  /** Neutral changes (a seat filled, a scheme begins ...). */
  changes: NamedEffect[];
  risks: Risk[];
  unlocks: string[];
  bestWhen: Condition[];
  verdict: Verdict;
  /** Odds it goes through (acceptance or success), 1 when certain. */
  chance: number;
  /** Rough dollar-equivalent of the expected result (for ranking; not shown as money). */
  value: number;
  /** One line: verdict, best gain, worst cost. */
  summary: string;
}

/* ------------------------------------------------------------------ */
/* Effect values (a common yardstick for ranking and verdicts)         */
/* ------------------------------------------------------------------ */

const HEAT_W: Record<HeatBar, number> = { local: 120, family: 220, federal: 260 };

/** Consequence keys that are good news when they fire. */
const GOOD_LATER = new Set(['parish_blessing', 'favor_returned', 'recruits_arrive', 'recruit_test', 'philly_over']);
/** Rough cost of a bad consequence, by key (dollar-equivalent). */
const LATER_COST: Record<string, number> = {
  retaliation: 3000, shakedown_complaint: 900, business_trouble: 1500, narcotics_rumor: 9000, cops_flip: 2500,
  example_widow: 1800, exile_turns: 1800, bank_examiners: 2500, philly_message: 3000, philly_short: 2500,
};

function heatWeight(s: GameState, bar: HeatBar): number {
  return HEAT_W[bar] * (1 + s.heat[bar] / 50);
}

/** Dollar-equivalent of one effect for the player, as of now. */
export function effectValue(s: GameState, e: Effect): number {
  switch (e.type) {
    // The boss's own money is for spending: what his pocket pays weighs little against what it buys.
    case 'money': return e.pot === 'pocket' && e.amount < 0 ? Math.round(e.amount * 0.1) : e.amount;
    case 'respect': return e.amount * 250;
    case 'heat': return -e.amount * heatWeight(s, e.bar);
    case 'opinion': {
      const c = s.characters[e.from];
      if (!c || e.to !== s.playerId) return 0;
      const w = c.faction === 'player' ? (['capo', 'underboss', 'consigliere'].includes(c.rank) ? 45 : c.rank === 'civilian' ? 10 : 18) : s.rivals.some((r) => r.leaderId === c.id) ? 30 : 8;
      return e.amount * w;
    }
    case 'meter': return e.meter === 'grievance' ? -e.amount * 12 : e.meter === 'trust' ? e.amount * 6 : e.amount * 3;
    case 'crewOpinion': return e.amount * Math.max(1, crew(s).length) * 14;
    case 'familyOpinion': return e.amount * Math.max(1, livingDynasty(s).length) * 8;
    case 'rivalOpinion': return e.amount * (e.rival === 'philly' ? 60 : 20);
    case 'influence': return e.faction === 'player' ? e.amount * 260 : 0;
    case 'favor': return e.amount * 2500;
    case 'evidence': return e.charId === s.playerId ? -e.amount * 320 : -e.amount * 40;
    case 'unwashed': return -e.amount * 0.15;
    case 'kill': {
      const c = s.characters[e.charId];
      return c?.faction === 'player' ? -2500 : 1200;
    }
    case 'addBusiness': {
      // Thirty weeks of an average week (a business is kept for years), less the heat it draws.
      const d = CATALOG[e.business.kind];
      // Crews that work by the score have no base: use their average week.
      const ct = crewTake(e.business.kind, d.base * d.season[0], d.base * d.season[1]);
      return Math.round(((ct.inSeason + ct.offSeason) / 2 - d.upkeep) * 30 - (d.heat * HEAT_W.local + d.fedHeat * HEAT_W.federal) * 30);
    }
    case 'loan': return Math.round(e.amount * 0.05 * 12 - e.amount * 0.15);
    case 'schedule': {
      if (e.key === 'delegated_order') return 0;
      if (GOOD_LATER.has(e.key)) return e.chance * 1500;
      return -e.chance * (LATER_COST[e.key] ?? 1200);
    }
    case 'hook': return e.spend ? -800 : e.strong ? 3500 : 1500;
    case 'warStart': return -2500;
    case 'recruit': return 1200;
    case 'frontMan': return 2500;
    case 'contract': {
      // Every week from now: what the Family gets less (or more), plus what he thinks of you for it.
      const c = s.characters[e.charId];
      const loyal = c ? (e.keep - (c.keep ?? CAPO_CUT)) * 200 * 45 : 0;
      return Math.round(recurringValue(s, e) + loyal);
    }
    default: return 0;
  }
}

function toneOf(s: GameState, e: Effect): Tone {
  if (e.type === 'schedule') return e.key === 'delegated_order' ? 'neutral' : GOOD_LATER.has(e.key) ? 'good' : 'bad';
  const v = effectValue(s, e);
  return v > 0 ? 'good' : v < 0 ? 'bad' : 'neutral';
}

function statOf(e: Effect): NamedEffect['stat'] {
  return e.type === 'money' ? 'money' : e.type === 'respect' ? 'respect' : e.type === 'heat' ? `heat.${e.bar}` : undefined;
}

function named(s: GameState, e: Effect, when: When, fallback: string): NamedEffect | undefined {
  const text = describeEffect(s, e);
  if (!text) return undefined;
  const st = statOf(e);
  // From the pocket: the Family's money (the stat) moves only by what the pocket cannot cover.
  const amt = e.type === 'money' && e.pot === 'pocket' ? (e.amount < 0 ? -Math.max(0, -e.amount - Math.max(0, s.tribute?.acct.personal ?? 0)) : 0)
    : e.type === 'money' || e.type === 'respect' || e.type === 'heat' ? e.amount : undefined;
  return { label: e.label ?? fallback, text, tone: toneOf(s, e), when, stat: st, min: amt, max: amt };
}

function money(label: string, min: number, max: number, when: When, text?: string): NamedEffect {
  const t = text ?? (min === max ? `${min >= 0 ? '+' : ''}${fmtMoney(min)}` : `${min >= 0 ? '+' : ''}${fmtMoney(min)} to ${max >= 0 ? '+' : ''}${fmtMoney(max)}`);
  return { label, text: t + (when === 'per week' && !text ? '/wk' : ''), tone: max + min >= 0 ? 'good' : 'bad', when, stat: 'money', min, max };
}

/* ------------------------------------------------------------------ */
/* Purposes, unlocks, best-when                                        */
/* ------------------------------------------------------------------ */

const INTERACT_PURPOSE: Record<string, string> = {
  dinner: 'Cheap loyalty: a seat at your table makes him like you and trust you.',
  gift_small: 'Buy goodwill fast. Greedy men like a gift more, honest men less.',
  gift_large: 'Buy a lot of goodwill at once, when you need him on your side now.',
  bribe: 'Put an official on the pad: it cools heat or banks a favor, and gives you a hook on him.',
  favor: 'Bank a political favor you can spend at the Table, on permits or a charter.',
  demand: 'Squeeze cash out of a man who has been putting money away.',
  threaten: 'Make him afraid of you. Fear makes men say yes — and they resent it.',
  expose: 'Use what you know against a rival: it costs them money and face.',
  recruit: 'Add a man to the crew. Poaching one from a rival also weakens them.',
  bringIn: 'Bring a son of the house into the life: a future capo, or an heir who knows the business.',
  make: 'A made man earns more, can run a crew and is much harder to poach.',
  promote: 'Give a district a capo (or the family a second in command) so the take stops leaking.',
  demote: 'Take a man down a peg. He will hate you; the others will notice.',
  exile: 'Get a problem out of Wildwood without blood — he may land with a rival.',
  whack: 'Remove a traitor or a threat for good. The crew will remember either way.',
  ...ROMANCE_PURPOSE,
};

const ORDER_PURPOSE: Record<string, string> = {
  shakedown: 'Fast cash from protection money, paid for in local heat.',
  expand: 'Win influence in a district: more street take and more storefronts.',
  laylow: 'Cool the heat before it turns into raids and arrests.',
  parish: 'Buy goodwill in the town and, maybe, a blessing from the parish.',
  cops: 'Cops on the pad: local heat cools for a while.',
  business: 'Open a new place without going through the shop.',
  hitback: 'Answer a rival\'s strike so they think twice about the next one.',
  shylock: 'Collect what the street owes the shylock book.',
  clambake: 'Raise the whole crew\'s opinion of you in one afternoon.',
  gift: 'Keep Philadelphia sweet: family heat cools and Moretti remembers.',
  recruit: 'New associates for the crew.',
  kessler: 'Take money from Danny Kessler\'s clubs — and his goodwill with it.',
  launder: 'Wash dirty money before the IRS notices it.',
};

const ECON_PURPOSE: Record<string, string> = {
  upgrade: 'Raise this place\'s take for good.',
  collect: 'Bring in what is owed to this racket.',
  buyLot: 'Land to build on or rent out.',
  leaseLot: 'A place to operate without buying the land.',
  build: 'Put up a building: income once the doors open.',
  renovate: 'A better building earns more.',
  sellLot: 'Turn property back into cash.',
  permits: 'Get the paperwork moving so the work can start.',
  manager: 'Put someone in charge: a good manager raises the take; a crooked one skims.',
  oversight: 'Trade the bookkeeper\'s hours for less skimming.',
  audit: 'Find out whether the manager is stealing — and get half of it back.',
  assistant: 'Start a young member of the house learning the business.',
  hq: 'Where you meet decides who can listen in.',
  sweep: 'Sweep the headquarters for federal bugs.',
  gift: 'A gift chosen for his tastes wins a man over.',
  project: 'A community project: the town\'s appreciation, and its trust.',
  leverage: 'Use a gift or a favor to get something from someone.',
  invite: 'An evening at the game builds a friendship.',
};

const DYN_PURPOSE: Record<string, string> = {
  marry: 'An alliance with another house for as long as the marriage stands.',
  guardian: 'Who raises the child decides what comes home at sixteen.',
  host: 'A gathering: opinion, renown and a chance for things to happen.',
  decision: 'A big decision for the house.',
  legacy: 'Spend renown on a perk the dynasty keeps forever.',
  standing: 'Who is in the line of succession, and who the family stands behind.',
};

function purposeOf(a: PlayerAction, p: ActionPreview): string {
  switch (a.kind) {
    case 'buyBusiness': {
      const d = CATALOG[a.biz];
      return d.category === 'front' ? `A front earns clean money${d.launder ? ` and washes ${fmtMoney(d.launder)}/wk of dirty cash` : ''}.` : d.category === 'racket' ? 'A racket earns dirty money fast, but draws heat and needs men to run it.' : 'Property: no take of its own; it protects or houses the business.';
    }
    case 'sellBusiness': return 'Turn a place you cannot staff or protect back into cash (half what it cost).';
    case 'lend': return 'Put idle cash on the street at five points a week.';
    case 'findFrontMan': return 'A clean name for charters and licenses: the bank and the casino both need one.';
    case 'charterBank': return 'Your own bank washes $6,000 a week and makes the family look legitimate.';
    case 'casino': return 'The long bet: Atlantic City land is cheap until the voters allow casinos.';
    case 'interact': return INTERACT_PURPOSE[a.id] ?? p.detail ?? p.title;
    case 'order': return ORDER_PURPOSE[a.key] ?? p.detail ?? p.title;
    case 'reassign': return 'Balance the crews: put a man where he is needed, or under a capo he likes.';
    case 'propose': return 'Get him made: he becomes a soldier, earns more and is harder to turn.';
    case 'background': return 'Find out whether he is a plant or an informant before you trust him.';
    case 'dynasty': return DYN_PURPOSE[a.op.type] ?? p.detail ?? p.title;
    case 'econ': return ECON_PURPOSE[a.op.type] ?? p.detail ?? p.title;
    case 'declareWar': return 'Take the district by force. Win and they give up their share.';
    case 'raid': return 'Burn one of their places to push the war score your way.';
    case 'terms': return 'End the war — on your terms if the score lets you.';
    case 'raiseDispute': return 'Let the Table settle it: a ruling can win a district, a sanction or money without a war.';
    case 'lobby': return 'Win a Table member\'s vote before the hearing.';
    case 'askPermission': return 'Philadelphia\'s blessing to work a city outside South Jersey without angering them.';
    case 'pushDistrict': return 'Win influence: more street take and more storefronts there.';
    case 'scheme': return SCHEME_INFO[a.scheme].text;
    case 'cancelScheme': return 'Stop a plan before it is discovered or goes wrong.';
    case 'appoint': return `${SEAT_INFO[a.seat].blurb} The seat works better with ${SEAT_INFO[a.seat].skill}.`;
    case 'councilTask': return TASKS[a.task].text;
    case 'hire': return p.detail ?? 'Another man for the family.';
    case 'policy': return a.policy === 'earn' ? 'Let him keep his hustle: loyalty now, a rich man later.' : a.policy === 'squeeze' ? 'Take most of his hustle: money now, resentment later.' : 'The usual 40%: fair to both sides.';
    case 'contract': return 'Change how much of his district a capo keeps.';
    case 'edict': return p.detail ?? 'A standing order to the whole family.';
    default: return pillarPurpose(a) ?? p.detail ?? p.title;
  }
}

function unlocksOf(s: GameState, a: PlayerAction): string[] {
  const out: string[] = [];
  switch (a.kind) {
    case 'buyBusiness': {
      const d = CATALOG[a.biz];
      if (d.launder) out.push(`Washes ${fmtMoney(d.launder)}/wk of dirty cash`);
      if (a.biz === 'loansharking') out.push('Opens the shylock book: you can lend money');
      if (d.staff) out.push(`Work for ${d.staff} idle m${d.staff > 1 ? 'en' : 'an'}`);
      break;
    }
    case 'pushDistrict': {
      const d = s.districts.find((x) => x.id === a.district);
      const cur = d?.influence.player ?? 0;
      if (cur < 20 && cur + 6 >= 20) out.push('At 20% you can open places there');
      if (cur < 40 && cur + 6 >= 40) out.push('At 40% the district gets a capo');
      out.push('More storefronts as your share grows');
      break;
    }
    case 'findFrontMan': out.push('Needed for a bank charter and a casino license'); break;
    case 'raiseDispute': if (a.dispute === 'district' || a.dispute === 'war') out.push('A ruling for you is a casus belli: a war the Table accepts'); if (a.dispute === 'sanction') out.push('A sanctioned hit costs no blood feud'); break;
    case 'scheme':
      if (a.scheme === 'claim') out.push('A claim lets you declare war on the district');
      if (a.scheme === 'envoy') out.push('An outpost: steady money from another city');
      if (a.scheme === 'blackmail') out.push('A strong hook on him');
      if (a.scheme === 'informant') out.push('Their plans leak to you');
      break;
    case 'interact':
      if (a.id === 'bribe') out.push('A weak hook on him');
      if (a.id === 'make') out.push('When the books open he takes the oath');
      if (a.id === 'promote') out.push('A capo brings in associates of his own');
      if (a.id === 'recruit' || a.id === 'bringIn') out.push('Can be proposed for membership later');
      break;
    case 'propose': out.push('When the books open he takes the oath'); break;
    case 'askPermission': out.push('Send envoys there without angering Philadelphia'); break;
    case 'background': out.push('Uncovers plants and informants'); break;
    case 'appoint': if (a.seat === 'consigliere') out.push('Secrets → hooks → blackmail and leverage'); if (a.seat === 'fixer') out.push('Envelopes downtown: heat cools faster'); break;
    case 'lifestyle': out.push('Perks as you earn experience'); break;
    case 'dynasty': if (a.op.type === 'marry') out.push('An alliance: no strikes from them, their Table votes lean your way'); break;
    default: break;
  }
  return [...out, ...pillarUnlocks(s, a)];
}

function bestWhenOf(s: GameState, a: PlayerAction, p: ActionPreview): Condition[] {
  const boss = player(s);
  const spare = s.money - p.cost;
  switch (a.kind) {
    case 'buyBusiness': {
      const d = CATALOG[a.biz];
      const out: Condition[] = [{ text: 'You keep $3,000+ after paying for it', met: spare >= 3000 }];
      if (d.season[0] >= 1.5) out.push({ text: 'In the Season, or the 10 weeks before it', met: isInSeason(s.date) || preSeason(s) });
      if (d.launder) out.push({ text: 'Dirty cash is piling up', met: s.unwashed > UNWASHED_SAFE / 2 });
      if (d.category === 'racket') out.push({ text: 'Local heat under 50', met: s.heat.local < 50 });
      if (d.staff) out.push({ text: `You have ${d.staff} idle m${d.staff > 1 ? 'en' : 'an'} to run it`, met: idleMen(s).length >= d.staff });
      return out;
    }
    case 'pushDistrict': {
      const d = s.districts.find((x) => x.id === a.district);
      return [
        { text: 'There is unclaimed ground there', met: (d?.influence.none ?? 0) >= 6 },
        { text: 'Local heat under 60', met: s.heat.local < 60 },
        { text: 'You keep $3,000+ after it', met: spare >= 3000 },
      ];
    }
    case 'order': {
      const out: Condition[] = [];
      const k = a.key;
      if (k === 'laylow') out.push({ text: 'Local or federal heat is 40+', met: s.heat.local >= 40 || s.heat.federal >= 40 });
      if (k === 'shakedown') out.push({ text: 'You need cash', met: s.money < 6000 }, { text: 'Local heat under 50', met: s.heat.local < 50 });
      if (k === 'cops') out.push({ text: 'Local heat is 30+', met: s.heat.local >= 30 });
      if (k === 'gift') out.push({ text: 'Family heat is 25+', met: s.heat.family >= 25 });
      if (k === 'launder') out.push({ text: 'Dirty cash is piling up', met: s.unwashed > UNWASHED_SAFE / 2 });
      if (k === 'clambake') out.push({ text: 'The crew is cool toward you', met: avgCrewOpinion(s) < 15 });
      if (k === 'recruit') out.push({ text: 'Fewer than a dozen men', met: crew(s).length < 12 });
      if (k === 'expand') out.push({ text: 'You keep $3,000+ after it', met: s.money - 2000 >= 3000 });
      if (a.via === 'direct') out.push({ text: `Your own file is thin (under ${OPEN_FILE - 5})`, met: (boss.evidence ?? 0) < OPEN_FILE - 5 });
      else {
        const ag = orderAgent(s, a.via);
        out.push({ text: `${ag ? ag.firstName : 'The man carrying it'} does what he's told (70%+)`, met: !!ag && obeyOdds(s, ag).obey >= 0.7 });
      }
      return out;
    }
    case 'interact': {
      const t = s.characters[a.target];
      if (!t) return [];
      const op = opinion(s, t.id, s.playerId);
      if (a.id === 'dinner' || a.id === 'gift_small' || a.id === 'gift_large') return [{ text: 'He is cool toward you or drifting', met: op < 10 || (t.defectStage ?? 0) > 0 || !!t.courtedBy }];
      if (a.id === 'demand') return [{ text: 'He is likely to pay (60%+)', met: (p.acceptance?.chance ?? 0) >= 0.6 }, { text: 'You need the cash', met: s.money < 6000 }];
      if (a.id === 'bribe') return [{ text: 'The heat he can cool is 30+', met: s.heat.local >= 30 || s.heat.federal >= 30 }, { text: 'He is likely to take it (60%+)', met: (p.acceptance?.chance ?? 0) >= 0.6 }];
      if (a.id === 'threaten') return [{ text: 'He is not hot-headed or vengeful', met: !t.traits.includes('Hot-headed') && !t.traits.includes('Vengeful') }];
      if (a.id === 'make') return [{ text: 'Philadelphia has the books open', met: !!s.books?.open }, { text: 'Someone has checked him out', met: t.checkedWeek !== undefined || t.dynasty }];
      if (a.id === 'recruit') return [{ text: 'He is likely to say yes (50%+)', met: (p.acceptance?.chance ?? 0) >= 0.5 }];
      return pillarBestWhen(s, a);
    }
    case 'lend': return [{ text: 'Cash you will not need for 10+ weeks', met: s.money - a.amount >= 5000 }];
    case 'appoint': {
      const c = s.characters[a.charId];
      const cur = holder(s, a.seat);
      const sk = SEAT_INFO[a.seat].skill;
      return [
        { text: cur ? `He is better at it than ${cur.firstName} (${sk} ${cur.attributes[sk]})` : 'The seat is empty', met: !cur || (c?.attributes[sk] ?? 0) > cur.attributes[sk] },
        { text: 'He likes you (opinion 0+)', met: !!c && opinion(s, c.id, s.playerId) >= 0 },
      ];
    }
    case 'scheme': {
      const o = schemeOdds(s, a.scheme, a.targetId, a.agents, a.opts);
      const out: Condition[] = [{ text: 'Odds of 60% or better', met: o.chance >= 0.6 }];
      if (SCHEME_INFO[a.scheme].hostile) out.push({ text: 'Secrecy 60+', met: o.secrecy >= 60 });
      const t = a.targetId ? s.characters[a.targetId] : undefined;
      if (a.scheme === 'murder' && t && needsSanction(s, t)) out.push({ text: 'The Table sanctioned it', met: sanctioned(s, t.id) });
      return out;
    }
    case 'raiseDispute': {
      const d = previewDispute(s, a);
      if (!d) return [];
      const leans = forecast(s, d);
      const yes = leans.filter((l) => l.value > 0).length;
      return [{ text: `Most voters already lean your way (${yes} of ${leans.length})`, met: yes * 2 > leans.length }];
    }
    case 'lobby': {
      const d = s.disputes.find((x) => x.id === a.disputeId);
      const l = d ? forecast(s, d).find((x) => x.member.id === a.memberId) : undefined;
      return l ? [{ text: 'His vote is close enough to flip', met: l.value <= 0 && l.value > -40 }] : [];
    }
    case 'declareWar': {
      const sanc = s.wars.some((w) => w.sanctioned) || false;
      return [{ text: 'You keep $10,000+ for a long fight', met: s.money >= 10000 }, { text: 'Family heat under 50', met: s.heat.family < 50 || sanc }];
    }
    case 'dynasty':
      if (a.op.type === 'marry') return [{ text: 'They are likely to accept (60%+)', met: (p.acceptance?.chance ?? 0) >= 0.6 }];
      return [];
    default: return pillarBestWhen(s, a);
  }
}

/** Within 10 weeks of Memorial Day. */
export function preSeason(s: GameState): boolean {
  const md = memorialDay(s.date.y);
  const d = toDays(md) - toDays(s.date);
  return d >= 0 && d <= 70;
}

function avgCrewOpinion(s: GameState): number {
  const men = crew(s);
  return men.length ? men.reduce((a, c) => a + opinion(s, c.id, s.playerId), 0) / men.length : 0;
}

function previewDispute(s: GameState, a: Extract<PlayerAction, { kind: 'raiseDispute' }>): Dispute | undefined {
  if (!s.rivals.some((r) => r.id === a.rival)) return undefined;
  const d = newDispute(s, a.dispute, 'player', a.rival, { district: a.district, targetId: a.targetId, warId: a.warId });
  return { ...d, id: `preview:${a.rival}:${a.dispute}`, raisedWeek: s.week, hearingWeek: s.week + 2, lobby: {}, plea: 0 };
}

/* ------------------------------------------------------------------ */
/* Derived lines: what happens later / per week / if it works          */
/* ------------------------------------------------------------------ */

function derived(s: GameState, a: PlayerAction, p: ActionPreview): NamedEffect[] {
  const out: NamedEffect[] = [];
  switch (a.kind) {
    case 'dev': { const u = devValue(s, a.op).upkeep; if (u) out.push(money('Upkeep', -u, -u, 'per week')); break; }
    case 'buyBusiness': {
      const d = CATALOG[a.biz];
      if (d.base) out.push(money(`${d.name}: the take`, Math.round(d.base * d.season[1] - d.upkeep), Math.round(d.base * d.season[0] - d.upkeep), 'per week', `${fmtMoney(Math.round(d.base * d.season[1] - d.upkeep))}/wk off-season to ${fmtMoney(Math.round(d.base * d.season[0] - d.upkeep))}/wk in season, after upkeep`));
      if (d.heat >= 0.3) out.push({ label: d.name, text: `+${d.heat.toFixed(1)} Local heat a week`, tone: 'bad', when: 'per week' });
      if (d.fedHeat >= 0.2) out.push({ label: d.name, text: `+${d.fedHeat.toFixed(1)} Federal heat a week`, tone: 'bad', when: 'per week' });
      break;
    }
    case 'lend': out.push(money('Vig', Math.round(a.amount * 0.05), Math.round(a.amount * 0.05), 'per week')); break;
    case 'hire': {
      const h = s.hirePool.find((x) => x.id === a.specId);
      if (h?.fee) out.push(money(`${h.firstName}'s fee`, -h.fee, -h.fee, 'per week'));
      break;
    }
    case 'order': {
      if (a.via === 'direct') break;
      const def = ORDERS.find((o) => o.key === a.key);
      if (!def || !def.available(s)) break;
      const ch = def.build({ ...s });
      const ob = p.odds?.chance ?? 0;
      for (const e of ch.effects) {
        if (e.type === 'schedule') continue;
        const n = named(s, e, 'next week', `Order: ${ch.label}`);
        if (!n) continue;
        if (n.stat === 'money' && e.type === 'money') out.push({ ...n, min: e.amount > 0 ? 0 : e.amount, max: e.amount > 0 ? e.amount : 0, text: `${n.text} (if done as told, ${Math.round(ob * 100)}%)` });
        else out.push({ ...n, text: `${n.text} (if done)` });
      }
      break;
    }
    case 'scheme': {
      const t = a.targetId ? s.characters[a.targetId] : undefined;
      if (a.scheme === 'heist') {
        const h = HEISTS[a.opts.heist ?? 'jewelry'];
        out.push(money(h.name, h.payout[0], h.payout[1], 'if it works'));
        out.push({ label: h.name, text: `+${h.heatAmt} ${h.heat === 'federal' ? 'Federal' : 'Local'} heat`, tone: 'bad', when: 'if it works' });
      } else if (a.scheme === 'envoy') {
        const c = CITIES[a.opts.city ?? ''];
        if (c) out.push(money(`Outpost in ${c.name}`, Math.round(c.income * 0.6), c.income, 'per week'));
      } else if (a.scheme === 'murder' && t) out.push({ label: 'The hit', text: `${t.firstName} ${t.lastName} dies`, tone: t.faction === 'player' ? 'bad' : 'good', when: 'if it works' });
      else if (a.scheme === 'blackmail' && t) out.push({ label: 'Blackmail', text: `Strong hook on ${t.firstName}`, tone: 'good', when: 'if it works' });
      else if (a.scheme === 'claim') out.push({ label: 'Forged papers', text: 'A claim on the district', tone: 'good', when: 'if it works' });
      else if (a.scheme === 'informant' && t) out.push({ label: 'Informant', text: `${t.firstName} feeds you their plans`, tone: 'good', when: 'if it works' });
      else if ((a.scheme === 'befriend' || a.scheme === 'sway') && t) out.push({ label: SCHEME_INFO[a.scheme].name, text: `${t.firstName} thinks better of you`, tone: 'good', when: 'if it works' });
      break;
    }
    case 'appoint': {
      const c = s.characters[a.charId];
      const sk = SEAT_INFO[a.seat].skill;
      if (c) {
        const now = seatPower(s, a.seat);
        const next = Math.max(0.2, c.attributes[sk] / 60);
        out.push({ label: SEAT_INFO[a.seat].name, text: `Seat works at ×${next.toFixed(2)} (now ×${now.toFixed(2)})`, tone: next > now ? 'good' : next < now ? 'bad' : 'neutral', when: 'per week' });
      }
      break;
    }
    default: break;
  }
  return out;
}

function derivedValue(s: GameState, a: PlayerAction, chanceOk: number): number {
  switch (a.kind) {
    case 'dev': return devValue(s, a.op).value;
    case 'scheme': {
      if (a.scheme === 'heist') { const h = HEISTS[a.opts.heist ?? 'jewelry']; return chanceOk * ((h.payout[0] + h.payout[1]) / 2 - h.heatAmt * heatWeight(s, h.heat)); }
      if (a.scheme === 'envoy') { const c = CITIES[a.opts.city ?? '']; return chanceOk * (c ? c.income * 20 : 0); }
      if (a.scheme === 'murder') { const t = a.targetId ? s.characters[a.targetId] : undefined; return chanceOk * (t && t.faction !== 'player' ? 2500 : -2500); }
      return chanceOk * 2000;
    }
    case 'appoint': {
      const c = s.characters[a.charId];
      if (!c) return 0;
      const next = Math.max(0.2, c.attributes[SEAT_INFO[a.seat].skill] / 60);
      return (next - seatPower(s, a.seat)) * 4000;
    }
    case 'order': {
      if (a.via === 'direct') return 0;
      const def = ORDERS.find((o) => o.key === a.key);
      if (!def || !def.available(s)) return 0;
      const ch = def.build({ ...s });
      return chanceOk * ch.effects.reduce((x, e) => x + effectValue(s, e), 0);
    }
    case 'interact': {
      if (a.id === 'promote') return 2500;
      if (a.id === 'make') return 2000;
      return 0;
    }
    case 'propose': return 2000;
    case 'raiseDispute': return 1500;
    case 'lobby': return 1200;
    case 'background': return 700;
    case 'dynasty': return a.op.type === 'marry' ? 4000 : 800;
    case 'econ': return a.op.type === 'upgrade' || a.op.type === 'build' ? 3000 : a.op.type === 'audit' ? 500 : 0;
    default: return pillarValue(s, a, chanceOk);
  }
}

/* ------------------------------------------------------------------ */
/* Risks                                                               */
/* ------------------------------------------------------------------ */

function worst(reasons: { label: string; value: number }[] | undefined, n = 2): string {
  const bad = (reasons ?? []).filter((r) => r.value < 0 && r.label !== 'Base').sort((x, y) => x.value - y.value).slice(0, n);
  return bad.length ? bad.map((r) => `${r.label} (${r.value})`).join(', ') : 'the odds';
}

const HEAT_AT_80: Record<HeatBar, string> = { local: 'the police raid', family: 'Philadelphia summons you', federal: 'the FBI makes arrests' };

function risksOf(s: GameState, a: PlayerAction, p: ActionPreview): Risk[] {
  const out: Risk[] = [];
  if (p.acceptance && p.acceptance.chance < 1) {
    const no = 1 - p.acceptance.chance;
    const tail = (p.refuseEffects ?? []).map((e) => describeEffect(s, e)).filter(Boolean).slice(0, 2).join(', ');
    out.push({ text: `${Math.round(no * 100)}% they say no${tail ? `: ${tail}` : ''}`, chance: no, source: `Acceptance: ${worst(p.acceptance.reasons)}`, severity: no >= 0.5 ? 'high' : no >= 0.25 ? 'mid' : 'low' });
  }
  if (p.odds) {
    if (a.kind === 'order') {
      const ignored = Math.max(0, -(p.odds.reasons.find((r) => r.label === 'Ignored')?.value ?? 0));
      const changed = p.odds.reasons.find((r) => r.label === 'Done his way')?.value ?? 0;
      if (ignored) out.push({ text: `${ignored}% he sits on it and nothing happens`, chance: ignored / 100, source: 'What he thinks of you', severity: ignored >= 30 ? 'mid' : 'low' });
      if (changed) out.push({ text: `${changed}% he does it his way`, chance: changed / 100, source: 'His traits and what he thinks of you', severity: 'low' });
    } else {
      const fail = 1 - p.odds.chance;
      out.push({ text: `${Math.round(fail * 100)}% it fails`, chance: fail, source: `Odds: ${worst(p.odds.reasons)}`, severity: fail >= 0.5 ? 'high' : fail >= 0.3 ? 'mid' : 'low' });
    }
  }
  if (a.kind === 'scheme' && SCHEME_INFO[a.scheme].hostile) {
    const o = schemeOdds(s, a.scheme, a.targetId, a.agents, a.opts);
    const wk = (100 - o.secrecy) / 400;
    const total = 1 - Math.pow(1 - wk, o.weeks);
    out.push({ text: `${Math.round(total * 100)}% they find out before it's done`, chance: total, source: `Secrecy ${o.secrecy} over ~${o.weeks} weeks`, severity: total >= 0.4 ? 'high' : total >= 0.2 ? 'mid' : 'low' });
  }
  for (const e of p.effects) {
    if (e.type === 'schedule' && e.key !== 'delegated_order' && !GOOD_LATER.has(e.key)) out.push({ text: `${e.hint} (in ${e.minWeeks}–${e.maxWeeks} wks)`, chance: e.chance, source: e.label ?? p.title, severity: e.chance >= 0.4 ? 'mid' : 'low' });
    if (e.type === 'heat' && e.amount > 0) {
      const after = s.heat[e.bar] + e.amount;
      if (after >= 60) out.push({ text: `${e.bar[0].toUpperCase()}${e.bar.slice(1)} heat would reach ${Math.min(100, after)}: at ${HEAT_THRESHOLD} ${HEAT_AT_80[e.bar]}`, chance: after >= HEAT_THRESHOLD ? 0.45 : 0.15, source: 'Heat', severity: after >= HEAT_THRESHOLD ? 'high' : 'mid' });
    }
    if (e.type === 'evidence' && e.charId === s.playerId && e.amount > 0) {
      const ev = (s.characters[s.playerId]?.evidence ?? 0) + e.amount;
      if (ev >= OPEN_FILE - 5) out.push({ text: `Your file would be ${Math.round(ev)}/100: the FBI opens a case at ${OPEN_FILE}`, chance: ev >= OPEN_FILE ? 1 : 0.5, source: 'Giving the order yourself', severity: ev >= OPEN_FILE ? 'high' : 'mid' });
    }
  }
  const famCost = p.pot === 'pocket' ? Math.max(0, p.cost - Math.max(0, s.tribute?.acct.personal ?? 0)) : p.cost;
  if (famCost > 0 && s.money - famCost < 1000 && !p.disabledReason) out.push({ text: `Leaves only ${fmtMoney(s.money - famCost)} of Family money`, chance: 1, source: 'Family money', severity: s.money - famCost < 0 ? 'high' : 'mid' });
  const own = pillarRisks(s, a);
  if (own) out.push(...own);
  else if (p.warning && a.kind !== 'order') out.push({ text: p.warning, chance: 1, source: 'Warning', severity: 'high' });
  return out;
}

/* ------------------------------------------------------------------ */
/* Verdict                                                             */
/* ------------------------------------------------------------------ */

function shortReason(r: string): string {
  const t = r.replace(/\.$/, '');
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

function verdictOf(p: { disabledReason?: string }, value: number, chanceOk: number, risks: Risk[], best: Condition[]): Verdict {
  if (p.disabledReason) return { label: `Not yet: ${shortReason(p.disabledReason).replace(/^Needs /, 'needs ')}`, tone: 'blocked', because: p.disabledReason };
  const big = risks.filter((r) => r.severity === 'high');
  const metN = best.filter((c) => c.met).length;
  const unmet = best.filter((c) => !c.met);
  // A fact, not a ruling (the playthrough: all three tribute options read "not worth it now").
  if (value <= -1500) return { label: 'Costs more than it brings in', tone: 'bad', because: 'In money, as things stand; what it buys may be worth it to you.' };
  if (big.length && (chanceOk < 0.6 || value < 3000)) return { label: 'Risky', tone: 'warn', because: big[0].text };
  if (value >= 800 && chanceOk >= 0.6 && (best.length === 0 || metN * 2 >= best.length)) return { label: 'Good idea now', tone: 'good', because: best.find((c) => c.met)?.text ?? 'It pays for itself.' };
  if (value > 0 && chanceOk < 0.6) return { label: 'Risky', tone: 'warn', because: `Only ${Math.round(chanceOk * 100)}% it goes through.` };
  if (best.length >= 2 && !unmet.length && value > -1500) return { label: 'Worth considering', tone: 'neutral', because: `${best[0].text}.` };
  if (unmet.length && unmet.length * 2 > best.length) return { label: 'Not the moment', tone: 'neutral', because: `Better when: ${unmet[0].text.charAt(0).toLowerCase()}${unmet[0].text.slice(1)}.` };
  if (value > 0) return { label: 'Worth considering', tone: 'neutral', because: 'A small gain.' };
  return { label: 'Situational', tone: 'neutral', because: 'Depends on what you are after.' };
}

/* ------------------------------------------------------------------ */
/* Public                                                              */
/* ------------------------------------------------------------------ */

function build(s: GameState, title: string, purpose: string, p: ActionPreview, extra: NamedEffect[], extraValue: (chanceOk: number) => number, risks: Risk[], unlocks: string[], best: Condition[]): ActionExplanation {
  const chanceOk = p.acceptance?.chance ?? (p.odds && !p.effects.some((e) => e.type === 'schedule' && e.key === 'delegated_order') ? p.odds.chance : 1);
  const when: When = p.acceptance ? 'if accepted' : 'now';
  const gains: NamedEffect[] = [];
  const costs: NamedEffect[] = [];
  const changes: NamedEffect[] = [];
  const put = (n: NamedEffect | undefined) => { if (!n) return; (n.tone === 'good' ? gains : n.tone === 'bad' ? costs : changes).push(n); };
  for (const e of p.effects) {
    if (e.type === 'schedule' && (e.key === 'delegated_order' || !GOOD_LATER.has(e.key))) {
      if (e.key === 'delegated_order') put({ label: e.label ?? title, text: e.hint, tone: 'neutral', when: 'next week' });
      continue; // bad consequences are listed as risks
    }
    // Money paid up front is a cost now even when the rest depends on a yes.
    const w: When = e.type === 'schedule' ? 'later' : e.type === 'money' && e.amount < 0 && p.cost > 0 ? 'now' : when;
    put(named(s, e, w, title));
    const r = recurringOf(s, e);
    if (r && r.weekly) put({ label: e.label ?? title, text: `${r.weekly > 0 ? '+' : '−'}${fmtMoney(Math.abs(r.weekly))}/wk to the Family${r.weeks ? ` for ${r.weeks} wks` : ', every week'} (estimate)`, tone: r.weekly > 0 ? 'good' : 'bad', when: 'per week', stat: 'money', min: r.weekly, max: r.weekly });
  }
  for (const n of extra) put(n);
  const sv = p.effects.reduce((x, e) => x + effectValue(s, e), 0);
  const rv = (p.refuseEffects ?? []).reduce((x, e) => x + effectValue(s, e), 0);
  const value = Math.round(chanceOk * sv + (p.acceptance ? (1 - chanceOk) * rv : 0) + extraValue(chanceOk));
  const verdict = verdictOf(p, value, chanceOk, risks, best);
  const g = gains[0];
  const c = costs[0];
  const summary = `${verdict.label}${g ? ` · ${g.text}` : ''}${c ? ` · ${c.text}` : ''}`;
  return { title, purpose, gains, costs, changes, risks, unlocks, bestWhen: best, verdict, chance: chanceOk, value, summary };
}

/** Why you would give this order, what it gets you and what it costs. */
export function explainAction(s: GameState, a0: PlayerAction): ActionExplanation {
  const p = previewAction(s, a0);
  // Starting a racket from the Rackets hub is explained like buying it (the take, the heat, the payback).
  const a: PlayerAction = a0.kind === 'econ' && a0.op.type === 'racket' && a0.op.cmd.c === 'start'
    ? { kind: 'buyBusiness', biz: a0.op.cmd.kind, district: a0.op.cmd.district ?? bestDistrict(s, a0.op.cmd.kind) ?? s.districts[0].id }
    : a0;
  const risks = risksOf(s, a, p);
  return build(s, p.title, purposeOf(a, p), p, derived(s, a, p), (ok) => derivedValue(s, a, ok), risks, unlocksOf(s, a), bestWhenOf(s, a, p));
}

/** The same, for one option of a weekly decision. */
export function explainChoice(s: GameState, ch: Choice): ActionExplanation {
  const cost = ch.effects.reduce((x, e) => x + (e.type === 'money' && e.amount < 0 ? -e.amount : 0), 0);
  const p: ActionPreview = { title: ch.label, detail: ch.detail, effects: ch.effects, cost, because: ch.because, disabledReason: ch.disabledReason, category: 'event' };
  const risks: Risk[] = [];
  for (const e of ch.effects) {
    if (e.type === 'schedule' && !GOOD_LATER.has(e.key)) risks.push({ text: `${e.hint} (in ${e.minWeeks}–${e.maxWeeks} wks)`, chance: e.chance, source: e.label ?? ch.label, severity: e.chance >= 0.5 ? 'mid' : 'low' });
    if (e.type === 'heat' && e.amount > 0 && s.heat[e.bar] + e.amount >= 60) risks.push({ text: `${e.bar[0].toUpperCase()}${e.bar.slice(1)} heat would reach ${Math.min(100, s.heat[e.bar] + e.amount)}: at ${HEAT_THRESHOLD} ${HEAT_AT_80[e.bar]}`, chance: 0.3, source: 'Heat', severity: s.heat[e.bar] + e.amount >= HEAT_THRESHOLD ? 'high' : 'mid' });
  }
  if (cost > 0 && s.money - cost < 1000) risks.push({ text: `Leaves only ${fmtMoney(s.money - cost)} in the treasury`, chance: 1, source: 'Treasury', severity: s.money - cost < 0 ? 'high' : 'mid' });
  const ex = build(s, ch.label, '', p, [], () => 0, risks, [], []);
  return { ...ex, purpose: whyPick(s, ch, ex) };
}

/** "Why you might pick this": the best thing it does, or the worst thing it avoids. */
export function whyPick(s: GameState, ch: Choice, ex: ActionExplanation): string {
  const ranked = ch.effects.map((e) => ({ e, v: effectValue(s, e) })).filter((x) => x.v !== 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const best = ranked.find((x) => x.v > 0);
  const cheap = !ranked.some((x) => x.v < -300);
  // A standing change (a contract, a loan) is explained by what it does every week, never as "nothing changes".
  const rec = recurringOfAll(s, ch.effects);
  if (rec.length) {
    const lead = best && best.e.type !== 'contract' ? `It buys ${describeEffect(s, best.e) ?? 'goodwill'}. ` : '';
    return `${lead}${rec.map((r) => r.text).join(' ')}`;
  }
  if (!ranked.length) {
    const named = ch.effects.map((e) => describeEffect(s, e)).filter((x): x is string => !!x);
    return ch.detail ?? (named.length ? `What it does: ${named.slice(0, 3).join('; ')}. No money, respect or heat moves with it.` : 'No money, respect or heat moves with it; what follows is in the story it starts.');
  }
  if (best) {
    const d = describeEffect(s, best.e) ?? '';
    const why = best.e.type === 'evidence' ? 'you want the law off his back' : best.e.type === 'schedule' ? 'you want something back later' : best.e.type === 'hook' ? 'you want leverage on him' : best.e.type === 'kill' ? 'you want him gone' : best.e.type === 'money' ? 'you need the money' : best.e.type === 'heat' ? `you want ${best.e.bar} heat down` : best.e.type === 'respect' ? 'your name matters more than the cost' : best.e.type === 'opinion' || best.e.type === 'crewOpinion' || best.e.type === 'meter' ? 'you need him (or them) on your side' : best.e.type === 'rivalOpinion' ? 'you want peace with them' : best.e.type === 'influence' ? 'you want ground on the island' : best.e.type === 'favor' ? 'you want a favor in the bank' : 'it suits your plans';
    return `Pick this if ${why}: ${d}${cheap ? ', and it costs little' : ''}.`;
  }
  const least = ranked[ranked.length - 1];
  // What it costs, said plainly (the playthrough: paying for proof was called "the cheapest way out").
  return `What it costs: ${describeEffect(s, least.e) ?? 'little'}${ex.risks.length ? '' : ', with nothing known to come back later'}.`;
}

/** The three channels for a general order, compared. */
export function compareVias(s: GameState, key: string): { via: 'direct' | 'underboss' | 'capo'; name: string; ex: ActionExplanation }[] {
  return (['direct', 'underboss', 'capo'] as const).map((via) => ({ via, name: VIA_INFO[via].name, ex: explainAction(s, { kind: 'order', key, via }) }));
}

/** Total certain change in a stat from the "now"/"if accepted" lines (what the test checks against the ledger). */
export function immediateTotal(ex: ActionExplanation, stat: NonNullable<NamedEffect['stat']>): number {
  return [...ex.gains, ...ex.costs].filter((n) => n.stat === stat && (n.when === 'now' || n.when === 'if accepted') && n.min === n.max).reduce((a, n) => a + (n.min ?? 0), 0);
}


export interface ChoiceAdvice {
  id: string;
  ex: ActionExplanation;
  /** "Cheapest", "Safest", "Best for: <the player's priority>" — only when one option stands out. */
  tags: string[];
}

/** What the player says matters most right now. Advice is weighed by it; it is never "the right answer". */
export type Priority = 'money' | 'heat' | 'loyalty' | 'family';
export const PRIORITIES: Priority[] = ['money', 'heat', 'loyalty', 'family'];
export const PRIORITY_LABEL: Record<Priority, string> = { money: 'Money', heat: 'Keep the heat down', loyalty: 'Loyalty of the men', family: 'Protect the family' };

/** How well a set of effects serves one priority (higher is better). Pure. */
export function priorityScore(s: GameState, effects: readonly Effect[], prio: Priority): number {
  let v = 0;
  for (const e of effects) {
    switch (prio) {
      case 'money':
        if (e.type === 'money') v += e.amount;
        v += recurringValue(s, e);
        break;
      case 'heat':
        if (e.type === 'heat') v -= e.amount * 100;
        if (e.type === 'evidence') v -= e.amount * 60;
        if (e.type === 'schedule' && !GOOD_LATER.has(e.key)) v -= e.chance * 400;
        break;
      case 'loyalty':
        if (e.type === 'opinion' && e.to === s.playerId && s.characters[e.from]?.faction === 'player') v += e.amount * 30;
        if (e.type === 'crewOpinion') v += e.amount * 120;
        if (e.type === 'meter' && e.to === s.playerId) v += e.meter === 'grievance' ? -e.amount * 20 : e.amount * 10;
        if (e.type === 'contract') { const c = s.characters[e.charId]; v += c ? (e.keep - (c.keep ?? CAPO_CUT)) * 4000 : 0; }
        break;
      case 'family':
        if (e.type === 'familyOpinion') v += e.amount * 120;
        if (e.type === 'kill') v += s.characters[e.charId]?.dynasty ? -5000 : -300;
        if (e.type === 'evidence' && e.charId === s.playerId) v -= e.amount * 80;
        if (e.type === 'heat' && e.bar === 'federal') v -= e.amount * 60;
        if (e.type === 'warStart' || e.type === 'feud') v -= 2000;
        if (e.type === 'schedule' && e.key === 'retaliation') v -= e.chance * 1500;
        break;
    }
  }
  return v;
}

/** Every option of a decision explained, with the stand-out ones tagged against each other (and against the player's priority, if he set one). */
export function compareChoices(s: GameState, choices: readonly Choice[], priority?: Priority): ChoiceAdvice[] {
  const rows = choices.map((ch) => ({ id: ch.id, ex: explainChoice(s, ch), cost: ch.effects.reduce((x, e) => x + (e.type === 'money' && e.amount < 0 ? -e.amount : 0), 0), off: !!ch.disabledReason }));
  const live = rows.filter((r) => !r.off);
  const tags: Record<string, string[]> = Object.fromEntries(rows.map((r) => [r.id, []]));
  const uniqueBest = (score: (r: (typeof rows)[number]) => number, tag: string) => {
    if (live.length < 2) return;
    const sorted = [...live].sort((a, b) => score(b) - score(a));
    if (score(sorted[0]) > score(sorted[1])) tags[sorted[0].id].push(tag);
  };
  // No "Best value": a decision with a printed answer is not a decision (playtest). The facts stay: cheapest, safest, and what serves the priority the player picked.
  uniqueBest((r) => -r.cost, 'Cheapest');
  uniqueBest((r) => -r.ex.risks.reduce((x, k) => x + k.chance * (k.severity === 'high' ? 3 : k.severity === 'mid' ? 2 : 1), 0), 'Safest');
  if (priority) {
    const byId = Object.fromEntries(choices.map((c) => [c.id, c]));
    uniqueBest((r) => priorityScore(s, byId[r.id].effects, priority), `Best for: ${PRIORITY_LABEL[priority].toLowerCase()}`);
  }
  return rows.map((r) => ({ id: r.id, ex: r.ex, tags: tags[r.id] }));
}

export interface TaskAdvice {
  task: CouncilTask;
  /** Why this task is worth running now (or "the default"). */
  why: string;
  /** How pressing it is right now, 0..100. */
  urgency: number;
}

/** For one council seat: each task, why you would run it now, and which is most pressing. */
export function taskAdvice(s: GameState, seat: Seat): TaskAdvice[] {
  const boss = player(s);
  const men = crew(s);
  const recentStrike = s.rivals.some((r) => r.lastMove && r.lastMove.move === 'strike' && r.lastMove.target === 'player' && s.week - r.lastMove.week <= 4);
  const plot = s.schemes.some((x) => x.owner !== 'player' && x.discovered && x.targetId === boss.id);
  const skimmers = capos(s).filter((c) => skimRate(s, c) >= 0.05).length;
  const hotFiles = men.filter((c) => (c.evidence ?? 0) >= 45).length;
  const enemy = s.rivals.filter((r) => r.kind !== 'law' && s.characters[r.leaderId]?.alive).sort((a, b) => opinion(s, a.leaderId, boss.id) - opinion(s, b.leaderId, boss.id))[0];
  const enemyOp = enemy ? opinion(s, enemy.leaderId, boss.id) : 0;
  const all: Record<CouncilTask, () => { why: string; urgency: number }> = {
    ub_discipline: () => ({ why: avgCrewOpinion(s) < 10 ? `The crew is cool toward you (avg ${Math.round(avgCrewOpinion(s))}).` : 'The crew is content; this keeps it that way.', urgency: avgCrewOpinion(s) < 10 ? 60 : 15 }),
    ub_streets: () => ({ why: isInSeason(s.date) ? 'The Season: a share of every corner is worth the most now.' : 'Steady money from the corners.', urgency: isInSeason(s.date) ? 45 : 30 }),
    ub_guard: () => ({ why: plot ? 'There is a contract on you.' : 'Nobody is known to be after you.', urgency: plot ? 100 : 5 }),
    cons_relations: () => ({ why: enemy && enemyOp < -15 ? `${enemy.shortName} thinks ${enemyOp} of you.` : 'No rival badly needs winning over.', urgency: enemy && enemyOp < -15 ? 40 : 10 }),
    cons_secrets: () => ({ why: 'Secrets become hooks and uncover plots against you.', urgency: 35 }),
    cons_table: () => ({ why: s.heat.family >= 30 || s.disputes.some((d) => !d.ruling) ? `${s.disputes.some((d) => !d.ruling) ? 'A dispute is before the Table' : `Family heat is ${s.heat.family}`}.` : 'Philadelphia is calm.', urgency: s.disputes.some((d) => !d.ruling) ? 70 : s.heat.family >= 30 ? 50 : 10 }),
    bag_launder: () => ({ why: s.unwashed > UNWASHED_SAFE / 2 ? `${fmtMoney(s.unwashed)} of dirty cash is waiting.` : 'Little dirty money to wash right now.', urgency: s.unwashed > UNWASHED_SAFE ? 80 : s.unwashed > UNWASHED_SAFE / 2 ? 50 : 15 }),
    bag_tax: () => ({ why: skimmers ? `${skimmers} capo${skimmers > 1 ? 's are' : ' is'} likely skimming.` : 'Your capos look honest.', urgency: skimmers ? 40 + skimmers * 10 : 5 }),
    bag_book: () => ({ why: s.loans.length >= 2 ? `${s.loans.length} loans on the street.` : 'Few loans to watch.', urgency: s.loans.length >= 2 ? 35 : 5 }),
    enf_collect: () => ({ why: isInSeason(s.date) ? 'The Season: collections pay most now.' : 'Extra money, a little heat.', urgency: s.heat.local < 50 ? (isInSeason(s.date) ? 40 : 25) : 5 }),
    enf_intimidate: () => ({ why: hotFiles ? `${hotFiles} of your men ha${hotFiles > 1 ? 've' : 's'} a thick file.` : 'No files worth thinning.', urgency: hotFiles ? 40 + hotFiles * 10 : 5 }),
    enf_protect: () => ({ why: recentStrike ? 'A rival hit you in the last month.' : 'Insurance against the next strike.', urgency: recentStrike ? 65 : 20 }),
    fix_cops: () => ({ why: s.heat.local >= 30 ? `Local heat is ${s.heat.local}.` : 'Local heat is low.', urgency: s.heat.local >= 55 ? 85 : s.heat.local >= 30 ? 50 : 10 }),
    fix_favors: () => ({ why: s.favors < 2 ? 'Few favors in the bank.' : 'You have favors to spend.', urgency: s.favors < 2 ? 30 : 10 }),
    fix_feds: () => ({ why: s.heat.federal >= 30 ? `Federal heat is ${s.heat.federal}.` : 'The feds are quiet.', urgency: s.heat.federal >= 50 ? 90 : s.heat.federal >= 30 ? 55 : 5 }),
  };
  return (Object.keys(TASKS) as CouncilTask[]).filter((t) => TASKS[t].seat === seat).map((task) => ({ task, ...all[task]() })).sort((a, b) => b.urgency - a.urgency);
}
