import { noteOrder, previewMen } from './myMen';
import { bookMark, bookOrder } from './journal';
import { isIncapable } from './aging';
import { previewUnderbelly } from './underbelly';
import { costHint, moneyCost, withCostHint } from './costHints';
import { LAWYER, RETAINER, RETAINER_CAP, RETAINER_EARLY_CAP } from './longgame';
import { seatPreview } from './eligibility';
import { LIFESTYLE_IDS, LIFESTYLES, findPerk, perkBlocked } from './lifestyle';
import { countKind, isOpen, newBusiness, owned, playerSlots } from './business';
import { availableIn, CATALOG, SHOP_KINDS } from './catalog';
import { commitEcon, econActions, previewEcon } from './econ';
import { commitHood, hoodActions, previewHood } from './hood';
import { previewLiving } from './livingAsk';
import { previewDating } from './dating';
import { previewNight } from './nightlife';
import { noteAttention, previewBond } from './bonds';
import { commitTalk, previewTalk, talkActions } from './talks';
import { commitMission, missionActions, previewMission } from './missions';
import { commitTravel, directOrderBlock, messengerDelay, previewTravel } from './travel';
import { homeOnlyBlock } from './visitAway';
import { commitNyc, previewNyc } from './nyc';
import { applyEffects, fmtMoney } from './effects';
import { BANK_COST, bankChecklist, frontMan, frontManClean, LAND_COST, LAND_SALE, LICENSE_COST } from './goals';
import { reached } from './history';
import type { Ctx } from './ledger';
import { bookCapacity, LEND_AMOUNTS } from './loans';
import { playerHook, previewInteraction, type Acceptance, type Reason } from './interactions';
import { newDispute, tableMembers as tableMembersFor } from './table';
import { CB_LABEL, casusBelli, DISTRICT_PRIZE, RAID_COST, raidOdds, resolveRaid } from './war';
import { SEAT_INFO, TASKS } from './council';
import { EDICTS, POLICY_LABEL, SPECIALTY_INFO } from './crewlife';
import { CAPO_CUT, FIRST_WINTER_PER_NEW, firstWinterAhead } from './economy';
import { CITIES_BY_ID, hasPermission, needsPermission } from './cities';
import { CITIES, HEISTS, needsSanction, sanctioned, SCHEME_INFO, schemeOdds, topRival } from './schemes';
import { OFFICE_BRIBE } from './interactions';
import { getRelation, opinion } from './relations';
import { commitDynasty, dynastyActions, previewDynasty } from './family';
import { commitPower, powerActions, previewPower } from './power';
import { previewPol } from './politics';
import type { Character } from './types';
import { bonesActions, bonesBlock, previewBones } from './bones';
import { ledgerActions, previewLedger } from './ledgerbook';
import { previewTribute } from './tributeOps';
import { earsActions, previewEars } from './ears';
import { commitDirty, previewDirty } from './dirtyWork';
import { commitWork, previewWork } from './bizRacket';
import { commitProtect, previewProtect } from './protect';
import { previewWomen } from './women';
import { commitPaper, previewPaper } from './paper';
import { commitIntrigue, previewIntrigue } from './intrigueOps';
import { commitArmy, previewArmy } from './army';
import { commitDev, previewDev } from './develop';
import { commitSpend, previewSpend } from './spend';
import { commitDeedAction, previewDeedAction } from './deeds/action';

/** A capo's willingness to accept a worse contract. */
export function contractAcceptance(s: GameState, c: Character, cut: number): Acceptance {
  const reasons: Reason[] = [
    { label: opinion(s, c.id, s.playerId) >= 0 ? 'Opinion of you' : 'Dislikes you', value: Math.round(opinion(s, c.id, s.playerId) * 0.5) },
    { label: 'Fears you', value: Math.round((getRelation(s, c.id, s.playerId)?.fear ?? 0) * 0.4) },
    { label: `Gives up ${Math.round(cut * 100)}% of his district`, value: -Math.round(cut * 300) },
    ...c.traits.filter((t) => t === 'Greedy' || t === 'Loyal-to-a-fault' || t === 'Ambitious').map((t) => ({ label: t, value: t === 'Loyal-to-a-fault' ? 25 : -15 })),
  ];
  const sum = reasons.reduce((a, r) => a + r.value, 50);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons: [{ label: 'Base', value: 50 }, ...reasons.filter((r) => r.value !== 0)] };
}
import { chance } from './rng';
import { ORDERS } from './events';
import { capoOf, obeyOdds, orderAgent, validCapo } from './hierarchy';
import { FACTION_NAMES } from './world';
import type { Effect, FactionId, GameState, LedgerCategory, OrderVia, PlayerAction, RivalId } from './types';

export const PUSH_COST = 2000;
export const PUSH_GAIN = 6;

/**
 * Player orders. Every action previews as a list of labelled effects (the UI
 * shows them as named chips, e.g. "−$2,000 Bribe: Sgt. Healy"); resolving an
 * action applies exactly those effects through the one ledger, so the weekly
 * report shows the same names. Previews are pure: they never touch the state.
 */

export interface ActionPreview {
  title: string;
  detail?: string;
  /** Effects, each with a label naming the source. */
  effects: Effect[];
  /** Up-front money cost (for affordability checks across queued orders). */
  cost: number;
  /** Who pays `cost`: 'pocket' is the boss's own money (the rest from the Family); absent, the Family. */
  pot?: 'pocket';
  /** Money moved into the boss's pocket by this order (a draw), or out of it into the Family (negative: putting it back). */
  toPocket?: number;
  because: string;
  disabledReason?: string;
  category: LedgerCategory;
  /** If the other side can say no: the odds and why. */
  acceptance?: Acceptance;
  /** What happens if they say no. */
  refuseEffects?: Effect[];
  /** For schemes: the success odds of the final roll, shown up front (not rolled now). */
  odds?: Acceptance;
  /** Extra warnings shown in red under the card. */
  warning?: string;
  /** The button's words, when the action knows better than the generic verb ("Hire runners — $300"). */
  verb?: string;
  /** What the odds line says ("He says yes", "It works"; default "Success"). */
  oddsLabel?: string;
  /** Every way it can go (deeds/): better than hoped, success, failure, disaster, with chances and effects. */
  outcomes?: { tier: string; label: string; chance: number; text: string; effects: Effect[] }[];
  /** Weeks before it can be tried again on the same person. */
  cooldown?: number;
}

type ActionOf<K extends PlayerAction['kind']> = Extract<PlayerAction, { kind: K }>;
type Def<K extends PlayerAction['kind']> = {
  preview: (s: GameState, a: ActionOf<K>) => ActionPreview;
  /** Extra state changes beyond the effects (rarely needed). */
  commit?: (ctx: Ctx, a: ActionOf<K>) => void;
};

/** Gives every effect a label so chips and report lines are named. */
export function named(label: string, effects: Effect[]): Effect[] {
  return effects.map((e) => (e.label ? e : { ...e, label }));
}

function need(cond: boolean, reason: string, prev?: string): string | undefined {
  return prev ?? (cond ? undefined : reason);
}

export const MAX_PER_KIND = 4;

/** How long an order takes and how insulated the boss is, by channel. */
export const VIA_INFO: Record<OrderVia, { name: string; text: string }> = {
  direct: { name: 'Yourself', text: 'Done this week. Your fingerprints are on it.' },
  underboss: { name: 'Through the underboss', text: 'Takes a week. Little comes back to you, but he may change it or sit on it.' },
  capo: { name: 'Through a capo', text: 'Takes a week. Insulated — but the capo does it his way.' },
};

/** Names of the general orders when they cannot be previewed. */
export const ORDER_TITLES: Record<string, string> = {
  shakedown: 'Lean on the Pacific Avenue bars', expand: 'Push into a district', laylow: 'Tell everyone to lay low', parish: 'Donate to St. Ann\'s',
  cops: 'Grease the Chief of Police', business: 'Open a new place', hitback: 'Hit back', shylock: 'Collect on the shylock book',
  clambake: 'Throw the crew a clambake', gift: 'Send a gift to Sal Moretti', recruit: 'Bring along a couple of young guys', kessler: 'Squeeze Danny Kessler\'s clubs', launder: 'Wash money through the motels',
};

/** Evidence an order leaves on the boss when he gives it himself. */
export const ORDER_PRINTS: Record<string, number> = { shakedown: 4, expand: 3, hitback: 6, kessler: 4, cops: 3, shylock: 3, launder: 2 };

const DEFS: { [K in PlayerAction['kind']]: Def<K> } = {
  /** Deeds (deeds/): the roll decides the outcome after the costs are paid. */
  deed: { preview: (s, a) => previewDeedAction(s, a), commit: (ctx, a) => commitDeedAction(ctx, a) },
  pol: { preview: (s, a) => previewPol(s, a.op) },
  dirty: { preview: (s, a) => previewDirty(s, a.op), commit: (ctx, a) => commitDirty(ctx, a.op) },
  work: { preview: (s, a) => previewWork(s, a.op), commit: (ctx, a) => commitWork(ctx, a.op) },
  protect: { preview: (s, a) => previewProtect(s, a.op), commit: (ctx, a) => commitProtect(ctx, a.op) },
  /** The women (women.ts): her answer is rolled; the outcome lands through the 'women' effect. */
  women: { preview: (s, a) => previewWomen(s, a.op) },
  paper: { preview: (s, a) => previewPaper(s, a.op), commit: (ctx, a) => commitPaper(ctx, a.op) },
  intrigue: { preview: (s, a) => previewIntrigue(s, a.op), commit: (ctx, a) => commitIntrigue(ctx, a.op) },
  /** The army (army.ts): raise the troops, hire muscle, the mattresses, a call to arms, a pact, an attack. */
  army: { preview: (s, a) => previewArmy(s, a.op), commit: (ctx, a) => commitArmy(ctx, a.op) },
  dev: { preview: (s, a) => previewDev(s, a.op), commit: (ctx, a) => commitDev(ctx, a.op) },
  /** Spend (spend.ts): the catalog; the Pocket or the Family pays, the IRS counts. */
  spend: { preview: (s, a) => previewSpend(s, a.op), commit: (ctx, a) => commitSpend(ctx, a.op) },
  nyc: { preview: (s, a) => previewNyc(s, a.op), commit: (ctx, a) => commitNyc(ctx, a.op) },
  askPermission: {
    preview: (s, a) => {
      const c = CITIES_BY_ID[a.city];
      const philly = s.rivals.find((r) => r.id === 'philly');
      const mor = philly ? s.characters[philly.leaderId] : undefined;
      const label = `Permission from Philadelphia: ${c?.name ?? '?'}`;
      const reasons: Reason[] = [
        { label: 'Base', value: 45 },
        { label: 'Moretti\'s opinion of you', value: mor ? Math.round(opinion(s, mor.id, s.playerId) / 2) : 0 },
        { label: 'Family heat on you', value: -Math.round(s.heat.family / 3) },
        ...(c?.group === 'philly' ? [{ label: 'Philadelphia\'s own turf', value: -40 }] : []),
        ...(s.flags.brunoKnows ? [{ label: 'You touched narcotics', value: -30 }] : []),
      ];
      const sum = reasons.reduce((x, r) => x + r.value, 0);
      return {
        title: label,
        detail: 'An envelope for the old man\'s charities and a request, hat in hand.',
        effects: [{ type: 'money', amount: -1000, label }, { type: 'permit', city: a.city, weeks: 52, label }],
        refuseEffects: [{ type: 'money', amount: -1000, label: `${label}: refused (he kept the envelope)` }],
        acceptance: { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons },
        cost: 1000,
        because: `asked Philadelphia's permission to go into ${c?.name ?? 'another city'}`,
        disabledReason: !c || !needsPermission(c) ? 'No permission needed there' : hasPermission(s, a.city) ? 'You already have it' : s.money < 1000 ? 'Needs $1,000' : undefined,
        category: 'event',
      };
    },
  },
  order: {
    preview: (s, a) => {
      const def = ORDERS.find((o) => o.key === a.key);
      if (!def) return { title: 'Unknown order', effects: [], cost: 0, because: '', disabledReason: 'No such order', category: 'event' };
      if (!def.available(s)) return { title: ORDER_TITLES[a.key] ?? a.key, effects: [], cost: 0, because: '', disabledReason: 'Not possible right now', category: 'event' };
      const ch = def.build({ ...s });
      const agent = a.via === 'direct' ? undefined : orderAgent(s, a.via);
      const prints = ORDER_PRINTS[a.key] ?? 1;
      const label = `Order: ${ch.label}`;
      const cost = ch.effects.reduce((acc, e) => acc + (e.type === 'money' && e.amount < 0 ? -e.amount : 0), 0);
      let why: string | undefined;
      why = need(def.available(s), 'Not possible right now', why);
      why = need(a.via === 'direct' || !!agent, a.via === 'underboss' ? 'You have no underboss to pass it through' : 'No capo free to carry it', why);
      if (a.via === 'direct') why = why ?? directOrderBlock(s);
      why = need(s.money >= cost, `Needs ${fmtMoney(cost)}`, why);
      if (a.via === 'direct') {
        return {
          title: `${ch.label} (yourself)`, detail: ch.detail, cost, because: ch.because, category: 'event', disabledReason: why,
          effects: [...ch.effects, ...(prints ? [{ type: 'evidence', charId: s.playerId, amount: prints, label: `${label}: your fingerprints` } as Effect] : [])],
        };
      }
      const odds = agent ? obeyOdds(s, agent) : { obey: 0, distort: 0 };
      return {
        title: `${ch.label} (through ${agent ? agent.firstName : 'nobody'})`,
        detail: `${ch.detail ? ch.detail + ' ' : ''}${VIA_INFO[a.via].text}`,
        effects: [{ type: 'schedule', key: 'delegated_order', minWeeks: 1 + messengerDelay(s), maxWeeks: 1 + messengerDelay(s), chance: 1, hint: messengerDelay(s) ? `A messenger carries it; ${agent?.firstName ?? 'he'} acts in ${1 + messengerDelay(s)} weeks` : `${agent?.firstName ?? 'He'} carries it out next week`, params: { key: a.key, via: a.via, agent: agent?.id ?? '' }, label }],
        odds: { chance: odds.obey, reasons: [{ label: `Done as told`, value: Math.round(odds.obey * 100) }, { label: 'Done his way', value: Math.round(odds.distort * 100) }, { label: 'Ignored', value: -Math.round((1 - odds.obey - odds.distort) * 100) }] },
        warning: `What it would do: ${ch.effects.map((e) => e.type === 'money' ? `${e.amount > 0 ? '+' : ''}${fmtMoney(e.amount)}` : e.type).filter((x) => x !== 'schedule').slice(0, 4).join(', ')}`,
        cost: 0, because: `${ch.because} (through ${agent?.firstName ?? 'the chain'})`, disabledReason: why, category: 'event',
      };
    },
  },
  reassign: {
    preview: (s, a) => {
      const c = s.characters[a.charId];
      const k = validCapo(s, a.capoId);
      const prev = c ? capoOf(s, c) : undefined;
      const label = `Move ${c?.firstName ?? '?'} to ${k ? `${k.firstName}'s crew` : '?'}`;
      let why: string | undefined;
      why = need(!!c && c.alive && c.faction === 'player' && (c.rank === 'soldier' || c.rank === 'associate'), 'Only soldiers and associates move between crews', why);
      why = need(!!k, 'Not a capo', why);
      why = need(prev?.id !== k?.id, 'He is already in that crew', why);
      return {
        title: label,
        detail: prev ? `${prev.firstName} loses a man and will not thank you. ${c?.firstName} thinks ${opinion(s, a.charId, prev.id)} of his old capo, ${k ? opinion(s, a.charId, k.id) : 0} of the new one.` : 'He joins a crew.',
        effects: c && k ? [{ type: 'assign', charId: c.id, capoId: k.id, label: `${c.firstName} → ${k.firstName}'s crew` }] : [],
        cost: 0, because: `moved ${c?.firstName ?? 'a man'} to ${k?.firstName ?? 'another'}'s crew`, disabledReason: why, category: 'event',
      };
    },
  },
  propose: {
    preview: (s, a) => {
      const c = s.characters[a.charId];
      const v = (a.voucherId ? s.characters[a.voucherId] : undefined) ?? (c ? capoOf(s, c) : undefined) ?? s.characters[s.playerId];
      const label = `Membership: ${c?.firstName ?? '?'} ${c?.lastName ?? ''}`.trim();
      let why: string | undefined;
      why = need(!!c && c.alive && c.faction === 'player' && c.rank === 'associate' && !c.specialty, 'Only associates of the family can be proposed', why);
      why = need(c?.proposedWeek === undefined, 'His name is already with Philadelphia', why);
      why = why ?? bonesBlock(s, c);
      why = need(s.money >= 500, 'Needs $500', why);
      return {
        title: `Propose ${c?.firstName ?? '?'} for membership`,
        detail: `${v ? `${v.id === s.playerId ? 'You vouch' : `${v.firstName} vouches`} for him — if he goes bad, it is on ${v.id === s.playerId ? 'you' : 'him'}. ` : ''}${s.books?.open ? `The books are open (${s.books.slots} left).` : 'The books are closed: he waits until Philadelphia opens them.'}`,
        effects: c ? [{ type: 'money', amount: -500, label: `${label}: envelope for Philadelphia` }, { type: 'propose', charId: c.id, voucherId: v?.id ?? s.playerId, label }, { type: 'opinion', from: c.id, to: s.playerId, amount: 10, reason: 'Put my name up', decay: 1, label }] : [],
        cost: 500, because: `proposed ${c?.firstName ?? 'a man'} for membership`, disabledReason: why, category: 'event',
      };
    },
  },
  background: {
    preview: (s, a) => {
      const c = s.characters[a.charId];
      const label = `Background check: ${c?.firstName ?? '?'}`;
      return {
        title: `Have ${c?.firstName ?? '?'} looked into`, detail: 'Phone records and a cop who owes you. Two weeks. Plants and informants turn up this way.',
        effects: c ? [{ type: 'money', amount: -600, label }, { type: 'checkBackground', charId: c.id, label }] : [],
        cost: 600, because: `ran a background check on ${c?.firstName ?? 'a man'}`,
        disabledReason: !c || c.faction !== 'player' ? 'Not one of yours' : c.checkedWeek !== undefined && s.week - c.checkedWeek < 26 ? 'Checked recently' : s.money < 600 ? 'Needs $600' : undefined,
        category: 'event',
      };
    },
  },
  /** The dynasty layer (family.ts): marriages, education, hosting, decisions, legacies. */
  dynasty: {
    preview: (s, a) => previewDynasty(s, a.op),
    commit: (ctx, a) => commitDynasty(ctx, a.op),
  },
  /** The power pillar (power.ts): heirs, grooming, protégés, grievances, blitzes, fronts, the ladder. */
  power: {
    preview: (s, a) => previewPower(s, a.op),
    commit: (ctx, a) => commitPower(ctx, a.op),
  },
  econ: {
    preview: (s, a) => previewEcon(s, a.op),
    commit: (ctx, a) => commitEcon(ctx, a.op),
  },
  /** The living district (livingAsk.ts): ask around about someone, help a family. */
  living: {
    preview: (s, a) => previewLiving(s, a.op),
  },
  /** The neighborhoods (hood.ts): restyle a place you own. */
  hood: {
    preview: (s, a) => previewHood(s, a.op),
    commit: (ctx, a) => commitHood(ctx, a.op),
  },
  /** Talks (talks.ts): meetings, jobs, business, partnerships, advice, grievances, evenings out, negotiations, the succession. */
  talk: {
    preview: (s, a) => previewTalk(s, a.op),
    commit: (ctx, a) => commitTalk(ctx, a.op),
  },
  /** The Mission Board (missions.ts). */
  mission: {
    preview: (s, a) => previewMission(s, a.op),
    commit: (ctx, a) => commitMission(ctx, a.op),
  },
  /** Making your bones (bones.ts). */
  bones: {
    preview: (s, a) => previewBones(s, a.op),
  },
  /** The boss's books (ledgerbook.ts). */
  ledger: {
    preview: (s, a) => previewLedger(s, a.op),
  },
  /** The weekly take (tributeOps.ts). */
  tribute: {
    preview: (s, a) => previewTribute(s, a.op),
  },
  /** The Ears: the Madam, the nightlife workers (ears.ts). */
  ears: {
    preview: (s, a) => previewEars(s, a.op),
  },
  /** Relationships & Dating (dating.ts): she decides; the Pocket pays. */
  dating: {
    preview: (s, a) => previewDating(s, a.op),
  },
  /** Nightlife (nightlife.ts, goomar.ts): payroll, promises, goomars, the madams' houses. She decides. */
  nightlife: {
    preview: (s, a) => previewNight(s, a.op),
  },
  /** Your People (bonds.ts): the wife, the goomars, the kids, friends and enemies. They decide. */
  bond: {
    preview: (s, a) => previewBond(s, a.op),
  },
  /** My Men (myMen.ts): money, protection, his back, discipline. */
  mymen: {
    preview: (s, a) => previewMen(s, a.op),
  },
  /** Travel, trips and flight (travel.ts, fugitive.ts). */
  travel: {
    preview: (s, a) => previewTravel(s, a.op),
    commit: (ctx, a) => commitTravel(ctx, a.op),
  },
  declareWar: {
    preview: (s, a) => {
      const r = s.rivals.find((x) => x.id === a.rival);
      const d = s.districts.find((x) => x.id === a.district);
      const cb = casusBelli(s, a.rival, a.district);
      const sanctionedWar = cb === 'sanction';
      const label = `War on ${r?.shortName ?? '?'} over ${d?.name ?? '?'}`;
      let why: string | undefined;
      why = need(!!r && r.kind === 'mob' && !!s.characters[r.leaderId]?.alive, 'Not a family you can fight', why);
      why = need(!!cb, 'You need a casus belli: a claim on the district, a grievance the Table heard, a blood feud, or the Table\'s sanction', why);
      why = need(!s.wars.some((w) => w.rival === a.rival), 'Already at war with them', why);
      why = need(!!d && (d.influence[a.rival] ?? 0) > 0, 'They hold nothing there', why);
      return {
        title: label,
        detail: `Casus belli: ${cb ? CB_LABEL[cb] : 'none'}. Win and they give up ${DISTRICT_PRIZE}% of ${d?.name ?? 'the district'}.`,
        effects: [
          { type: 'warStart', rival: a.rival, district: a.district, cb: cb ?? 'claim', sanctioned: sanctionedWar, label },
          { type: 'respect', amount: 2, label },
          ...(sanctionedWar ? [] : [{ type: 'heat', bar: 'family', amount: 10, label: `${label}: without the Table's blessing` } as Effect, { type: 'rivalOpinion', rival: 'philly', amount: -15, reason: 'Went to war without asking', label } as Effect]),
        ],
        warning: cb && !sanctionedWar ? 'Without the Table\'s sanction Philadelphia will be angry for as long as it lasts.' : undefined,
        cost: 0,
        because: `went to war with ${r?.shortName ?? 'a rival'} over ${d?.name ?? 'a district'}`,
        disabledReason: why,
        category: 'event',
      };
    },
  },
  raid: {
    preview: (s, a) => {
      const w = s.wars.find((x) => x.id === a.warId);
      const r = w ? s.rivals.find((x) => x.id === w.rival) : undefined;
      const label = `Raid on ${r?.shortName ?? '?'}`;
      const p = w ? raidOdds(s, w) : 0;
      return {
        title: label,
        detail: 'Burn one of their places. Success: +10 war score; failure: −6.',
        effects: [{ type: 'money', amount: -RAID_COST, label }],
        odds: { chance: p, reasons: [{ label: 'Your muscle vs theirs', value: Math.round(p * 100) }] },
        cost: RAID_COST,
        because: `raided ${r?.shortName ?? 'a rival'}`,
        disabledReason: !w ? 'No such war' : s.money < RAID_COST ? `Needs ${fmtMoney(RAID_COST)}` : undefined,
        category: 'event',
      };
    },
    commit: (ctx, a) => {
      const w = ctx.s.wars.find((x) => x.id === a.warId);
      if (w) resolveRaid(ctx, w);
    },
  },
  terms: {
    preview: (s, a) => {
      const w = s.wars.find((x) => x.id === a.warId);
      const r = w ? s.rivals.find((x) => x.id === w.rival) : undefined;
      const want = a.terms === 'district' ? -25 : a.terms === 'tribute' ? -10 : 30;
      const label = `Terms to ${r?.shortName ?? '?'}: ${a.terms === 'district' ? 'give up the district' : a.terms === 'tribute' ? 'pay reparations' : 'white peace'}`;
      const reasons = [{ label: 'Base', value: 20 }, { label: 'War score', value: w?.score ?? 0 }, { label: a.terms === 'white' ? 'Nobody loses face' : 'What you ask', value: want }];
      const sum = reasons.reduce((x, y) => x + y.value, 0);
      return {
        title: label,
        effects: w ? [{ type: 'warEnd', warId: w.id, outcome: a.terms === 'white' ? 'white' : 'won', terms: a.terms, label }] : [],
        refuseEffects: [{ type: 'respect', amount: -1, label: `${label}: refused` }],
        acceptance: { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons },
        cost: 0,
        because: `offered ${r?.shortName ?? 'a rival'} terms`,
        disabledReason: w ? undefined : 'No such war',
        category: 'event',
      };
    },
  },
  raiseDispute: {
    preview: (s, a) => {
      const r = s.rivals.find((x) => x.id === a.rival);
      const t = a.targetId ? s.characters[a.targetId] : undefined;
      const d = newDispute(s, a.dispute, 'player', a.rival, { district: a.district, targetId: a.targetId, amount: a.dispute === 'reparations' ? 5000 : undefined, warId: a.warId });
      const label = `The Table: ${a.dispute === 'sanction' ? `sanction a hit on ${t?.firstName ?? '?'}` : a.dispute === 'war' ? `bless a war on ${r?.shortName ?? '?'}` : a.dispute === 'district' ? `${s.districts.find((x) => x.id === a.district)?.name ?? '?'} is ours` : a.dispute === 'peace' ? `end the war with ${r?.shortName ?? '?'}` : `reparations from ${r?.shortName ?? '?'}`}`;
      let why: string | undefined;
      why = need(!!r && !!s.characters[r.leaderId]?.alive && r.kind === 'mob', 'Not a family the Table rules on', why);
      why = need(!s.disputes.some((x) => !x.ruling && (x.plaintiff === a.rival || x.defendant === a.rival)), 'A dispute with them is already pending', why);
      if (a.dispute === 'sanction') why = need(!!t && t.alive && t.faction === a.rival && needsSanction(s, t), 'Pick one of their made men', why);
      if (a.dispute === 'district' || a.dispute === 'war') why = need(!!a.district && (s.districts.find((x) => x.id === a.district)?.influence[a.rival] ?? 0) > 0, 'They hold nothing there', why);
      if (a.dispute === 'reparations') why = need((s.flags[`grievance_${a.rival}`] ?? 0) > 0 || !!r?.feud, 'You need a grievance against them', why);
      if (a.dispute === 'peace') why = need(s.wars.some((w) => w.rival === a.rival), 'You are not at war with them', why);
      why = need(s.money >= 500, 'Needs $500', why);
      return {
        title: label,
        detail: `${d.claim} The hearing is in two weeks; lobby the members first.`,
        effects: [{ type: 'money', amount: -500, label: `${label} (envelope for the chair)` }, { type: 'dispute', dispute: d, label }],
        cost: 500,
        because: `brought a dispute to the Table`,
        disabledReason: why,
        category: 'event',
      };
    },
  },
  lobby: {
    preview: (s, a) => {
      const d = s.disputes.find((x) => x.id === a.disputeId);
      const m = s.characters[a.memberId];
      const label = `Lobby: ${m ? `${m.firstName} ${m.lastName}` : '?'}`;
      const amount = a.mode === 'money' ? 20 : a.mode === 'favor' ? 25 : 40;
      const cost = a.mode === 'money' ? 1500 : 0;
      const h = m ? playerHook(s, m.id) : undefined;
      let why: string | undefined;
      why = need(!!d && !d.ruling, 'No open dispute', why);
      if (a.mode === 'money') why = need(s.money >= cost, `Needs ${fmtMoney(cost)}`, why);
      if (a.mode === 'favor') why = need(s.favors >= 1, 'No political favors to call in', why);
      if (a.mode === 'hook') why = need(!!h, 'You hold no hook on him', why);
      return {
        title: `${label} (${a.mode === 'money' ? 'an envelope' : a.mode === 'favor' ? 'call in a favor' : 'use your hook'})`,
        effects: [
          ...(cost ? [{ type: 'money', amount: -cost, label } as Effect] : []),
          ...(a.mode === 'favor' ? [{ type: 'favor', amount: -1, label } as Effect] : []),
          ...(a.mode === 'hook' && m && h ? [{ type: 'hook', targetId: m.id, strong: h.strong, reason: h.reason, spend: true, label } as Effect] : []),
          { type: 'lobby', disputeId: a.disputeId, memberId: a.memberId, amount, label },
        ],
        cost,
        because: `lobbied ${m?.firstName ?? 'a Table member'}`,
        disabledReason: why,
        category: 'event',
      };
    },
  },
  scheme: {
    preview: (s, a) => {
      const t = a.targetId ? s.characters[a.targetId] : undefined;
      const info = SCHEME_INFO[a.scheme];
      const o = schemeOdds(s, a.scheme, a.targetId, a.agents, a.opts);
      const where = a.scheme === 'heist' ? HEISTS[a.opts.heist ?? 'jewelry'].name : a.scheme === 'envoy' ? CITIES[a.opts.city ?? 'capemay']?.name : a.scheme === 'claim' ? s.districts.find((d) => d.id === a.opts.district)?.name : undefined;
      const label = `Scheme: ${info.name}${t ? ` — ${t.firstName} ${t.lastName}` : where ? ` — ${where}` : ''}`;
      const busy = a.agents.find((id) => s.schemes.some((x) => x.owner === 'player' && x.agents.includes(id)));
      let why = o.disabledReason;
      why = need(!busy, `${s.characters[busy ?? '']?.firstName ?? 'An agent'} is already on another scheme`, why);
      why = need(!isIncapable(s, s.playerId), 'You cannot plan anything now (Incapable): whoever acts for you runs things', why);
      why = need(!a.agents.some((id) => isIncapable(s, id)), 'An agent who can no longer look after his own affairs (Incapable)', why);
      why = need(s.money >= o.cost, `Needs ${fmtMoney(o.cost)}`, why);
      why = need(!(t && s.schemes.some((x) => x.owner === 'player' && x.targetId === t.id && x.kind === a.scheme)), 'Already scheming that', why);
      const unsanctioned = a.scheme === 'murder' && t && needsSanction(s, t) && !sanctioned(s, t.id);
      const city = a.scheme === 'envoy' ? CITIES_BY_ID[a.opts.city ?? ''] : undefined;
      const unpermitted = city && needsPermission(city) && !hasPermission(s, city.id);
      const permitFx: Effect[] = unpermitted ? [{ type: 'heat', bar: 'family', amount: city.group === 'philly' ? 12 : 6, label: `${label}: without Philadelphia's blessing` }, { type: 'rivalOpinion', rival: 'philly', amount: -10, reason: `Went into ${city.name} without asking`, label }] : [];
      return {
        title: label,
        detail: `${info.text} About ${o.weeks} week${o.weeks > 1 ? 's' : ''}; secrecy ${o.secrecy}.`,
        effects: [
          ...(o.cost ? [{ type: 'money', amount: -o.cost, label } as Effect] : []),
          ...permitFx,
          { type: 'startScheme', scheme: { kind: a.scheme, owner: 'player', ownerId: s.playerId, targetId: a.targetId, agents: a.agents, opts: a.opts, because: `${info.verb === 'kill' ? 'ordered the hit on' : `schemed to ${info.verb}`} ${t ? `${t.firstName} ${t.lastName}` : where ?? ''}`.trim() }, label },
        ],
        odds: { chance: o.chance, reasons: o.reasons },
        warning: unsanctioned ? `${t!.firstName} is a made man. Without the Table's sanction this means a blood feud with ${FACTION_NAMES[t!.faction]} and Philadelphia's anger.` : unpermitted ? `${city!.name} is outside South Jersey. Without Philadelphia's permission, they will be angry.` : undefined,
        cost: o.cost,
        because: `started a scheme: ${info.name.toLowerCase()}${t ? ` against ${t.firstName} ${t.lastName}` : ''}`,
        disabledReason: why,
        category: 'event',
      };
    },
  },
  cancelScheme: {
    preview: (s, a) => {
      const sc = s.schemes.find((x) => x.id === a.schemeId && x.owner === 'player');
      const label = `Call off: ${sc ? SCHEME_INFO[sc.kind].name : 'scheme'}`;
      return { title: label, effects: sc ? [{ type: 'endScheme', schemeId: sc.id, label }] : [], cost: 0, because: 'called off a scheme', disabledReason: sc ? undefined : 'No such scheme', category: 'event' };
    },
  },
  appoint: {
    preview: (s, a) => {
      // The one seat preview (eligibility.ts): the council, the sheet's menu and "Make him underboss" agree.
      const p = seatPreview(s, a.seat, a.charId);
      return { ...p, cost: 0, category: 'event' };
    },
  },
  councilTask: {
    preview: (s, a) => {
      const t = TASKS[a.task];
      const label = `${SEAT_INFO[a.seat].name}: ${t.name}`;
      const r = a.target ? s.rivals.find((x) => x.id === a.target) : undefined;
      return {
        title: label + (r ? ` (${r.shortName})` : ''),
        detail: t.text,
        effects: [{ type: 'seat', seat: a.seat, task: a.task, target: a.target, label }],
        cost: 0,
        because: `set the ${SEAT_INFO[a.seat].name.toLowerCase()} to ${t.name.toLowerCase()}`,
        disabledReason: t.seat !== a.seat ? 'Wrong seat' : t.targeted && !r ? 'Pick a rival' : undefined,
        category: 'event',
      };
    },
  },
  officeHours: {
    preview: (s) => {
      const label = 'Office hours';
      return {
        title: 'Hold office hours on Sunday',
        detail: 'The back room of the social club, coffee and anisette. Somebody from the town will come with a favor to ask.',
        effects: [{ type: 'flag', key: 'office_hours', value: 1, label }, { type: 'money', amount: -50, label }],
        cost: 50,
        because: 'held office hours',
        disabledReason: s.flags.office_hours ? 'Already planned' : undefined,
        category: 'event',
      };
    },
  },
  underbelly: {
    preview: (s, a) => previewUnderbelly(s, a.op, a.rival),
  },
  legal: {
    preview: (s, a) => {
      const l = s.legal;
      const open = !!l && l.personId === s.playerId && ['investigation', 'grandjury', 'indicted', 'trial'].includes(l.stage);
      if (a.op === 'retainer') {
        // The retainer contract (A02): it can be signed before any charge. Before a case he can only
        // prepare so much (defense up to RETAINER_EARLY_CAP); once a case is open, up to RETAINER_CAP.
        // The defense carries into any case the FBI opens later. Not while serving a sentence or on parole.
        const label = `Retainer: ${LAWYER}`;
        const stage = l && l.personId === s.playerId ? l.stage : 'quiet';
        const defense = l && l.personId === s.playerId ? l.defense : 0;
        const cap = open ? RETAINER_CAP : RETAINER_EARLY_CAP;
        const gain = Math.max(0, Math.min(10, cap - defense));
        const why = stage === 'prison' ? 'You are serving your sentence: there is no case left to defend'
          : stage === 'parole' ? 'You are on parole: the case is over'
          : gain <= 0 ? (open ? 'He has done all he can' : `Before any charge he can only prepare so much (defense ${defense}/${cap}); the rest once a case is open`)
          : s.money < RETAINER ? `Needs $${RETAINER.toLocaleString('en-US')}` : undefined;
        return {
          title: `Put ${LAWYER} on retainer`,
          detail: open
            ? `He works the case against you: +${gain} defense now (up to ${RETAINER_CAP}).`
            : `No case against you yet: he starts building the defense now, before anybody is charged. +${gain} defense, kept for any case the FBI opens later (before a charge, up to ${RETAINER_EARLY_CAP}).`,
          effects: [{ type: 'money', amount: -RETAINER, label }, { type: 'legal', op: 'defense', amount: gain, label }],
          cost: RETAINER,
          because: 'put a criminal lawyer on retainer',
          disabledReason: why,
          category: 'event',
        };
      }
      const label = 'Lying low';
      return {
        title: 'Lie low for a while',
        detail: 'No meetings, no photographs, no new faces. The men notice.',
        effects: [{ type: 'respect', amount: -2, label }, { type: 'legal', op: 'evidence', amount: -5, label }],
        cost: 0,
        because: 'lay low',
        disabledReason: !open ? 'There is no case against you' : undefined,
        category: 'event',
      };
    },
  },
  lifestyle: {
    preview: (s, a) => {
      const b = s.characters[s.playerId];
      const L = LIFESTYLES[a.focus];
      const label = `Lifestyle: ${L.name}`;
      const cur = b?.lifestyle;
      return {
        title: cur ? `Change to the ${L.name} life` : `Live the ${L.name} life`,
        detail: `${L.text} Learns faster with ${L.skill} (yours: ${b?.attributes[L.skill] ?? 0}).${cur && cur.xp ? ` Switching loses ${cur.xp} XP of progress; perks you have are kept.` : ''}`,
        effects: [{ type: 'lifestyle', focus: a.focus, label }],
        cost: 0,
        because: `took up the ${L.name.toLowerCase()} life`,
        disabledReason: cur?.focus === a.focus ? 'Already your lifestyle' : undefined,
        category: 'event',
      };
    },
  },
  perk: {
    preview: (s, a) => {
      const b = s.characters[s.playerId];
      const p = findPerk(a.perk);
      const label = `Perk: ${p?.name ?? '?'}`;
      return {
        title: `Take the perk ${p?.name ?? '?'}`,
        detail: p?.text ?? '',
        effects: [{ type: 'perk', perk: a.perk, label }],
        cost: 0,
        because: `learned ${p?.name ?? 'a perk'}`,
        disabledReason: b ? perkBlocked(b, a.perk) : 'No boss',
        category: 'event',
      };
    },
  },
  policy: {
    preview: (s, a) => {
      const c = s.characters[a.charId];
      const label = `${c?.firstName ?? '?'}'s hustle: ${POLICY_LABEL[a.policy]}`;
      return {
        title: label,
        detail: a.policy === 'earn' ? 'He keeps everything. He likes you more and gets rich — maybe too rich.' : a.policy === 'squeeze' ? 'You take 85%. He fears you and resents it.' : 'You take 40%, the usual.',
        effects: c ? [{ type: 'policy', charId: c.id, policy: a.policy, label }, { type: 'attention', charId: c.id, label }] : [],
        cost: 0,
        because: `set ${c?.firstName ?? 'a man'}'s hustle to ${a.policy}`,
        disabledReason: !c || c.faction !== 'player' ? 'Not one of your men' : (c.policy ?? 'tax') === a.policy ? 'Already' : undefined,
        category: 'event',
      };
    },
  },
  contract: {
    preview: (s, a) => {
      const c = s.characters[a.charId];
      const cur = c?.keep ?? CAPO_CUT;
      const label = `${c?.firstName ?? '?'}'s contract: keeps ${Math.round(a.keep * 100)}%`;
      const harsher = a.keep < cur;
      const acceptance = c && harsher ? contractAcceptance(s, c, cur - a.keep) : undefined;
      return {
        title: label,
        detail: harsher ? 'More for you, less for him. He has to agree — or be made to.' : 'A bigger end for him. He will remember it.',
        effects: c ? [{ type: 'contract', charId: c.id, keep: a.keep, label }, { type: 'attention', charId: c.id, label }] : [],
        refuseEffects: c && harsher ? [{ type: 'opinion', from: c.id, to: s.playerId, amount: -10, reason: 'Tried to cut my end', decay: 1, label: `${c.firstName} refused the new contract` }, { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 10, label: `${c.firstName} refused the new contract` }] : undefined,
        acceptance,
        cost: 0,
        because: `changed ${c?.firstName ?? 'a capo'}'s contract to ${Math.round(a.keep * 100)}%`,
        disabledReason: !c || c.rank !== 'capo' ? 'Only capos have contracts' : Math.abs(cur - a.keep) < 0.001 ? 'That is his contract now' : a.keep < 0.15 || a.keep > 0.5 ? 'Out of range' : undefined,
        category: 'event',
      };
    },
  },
  edict: {
    preview: (s, a) => {
      const e = EDICTS[a.edict];
      const label = `Edict: ${e.name}`;
      return {
        title: `${a.on ? 'Proclaim' : 'Revoke'} ${e.name}`,
        detail: e.text,
        effects: [{ type: 'edict', edict: a.edict, on: a.on, label }, ...(a.on && a.edict === 'nojunk' ? [{ type: 'respect', amount: 2, label } as Effect] : [])],
        cost: 0,
        because: `${a.on ? 'proclaimed' : 'revoked'} the ${e.name} edict`,
        disabledReason: !!s.edicts[a.edict] === a.on ? (a.on ? 'Already in force' : 'Not in force') : a.on && a.edict === 'nojunk' && owned(s).some((b) => b.kind === 'narcotics') ? 'Shut your own pipeline first' : undefined,
        category: 'event',
      };
    },
  },
  hire: {
    preview: (s, a) => {
      const h = s.hirePool.find((x) => x.id === a.specId);
      const label = `Hire: ${h ? `${h.firstName} ${h.lastName}` : '?'}`;
      return {
        title: label,
        detail: h ? (h.kind === 'recruit' ? `A young man, ${h.age}, ready to hustle. Skill ${h.skill}.` : `${SPECIALTY_INFO[h.kind].name}, ${h.age}, skill ${h.skill}. ${SPECIALTY_INFO[h.kind].text}`) : undefined,
        effects: h ? [{ type: 'money', amount: -h.cost, label }, { type: 'hire', specId: h.id, label }] : [],
        cost: h?.cost ?? 0,
        because: `hired ${h ? `${h.firstName} ${h.lastName}` : 'a man'}`,
        disabledReason: !h ? 'No longer available' : s.money < h.cost ? `Needs ${fmtMoney(h.cost)}` : undefined,
        category: 'event',
      };
    },
  },
  interact: {
    preview: (s, a) => {
      const p = previewInteraction(s, a.id, a.target, a.useHook);
      if (!p) return { title: 'Nothing to do', effects: [], cost: 0, because: '', disabledReason: 'Not possible', category: 'event' };
      return {
        title: p.title,
        detail: p.detail,
        effects: p.effects,
        refuseEffects: p.refuseEffects,
        acceptance: p.acceptance,
        cost: p.cost,
        pot: p.pot,
        because: p.because,
        disabledReason: p.disabledReason ?? (!p.pot && p.cost > s.money ? `Needs ${fmtMoney(p.cost)}` : undefined),
        warning: p.warning,
        category: 'event',
      };
    },
  },
  pushDistrict: {
    preview: (s, a) => {
      const d = s.districts.find((x) => x.id === a.district);
      const label = `Push into ${d?.name ?? '?'}`;
      if (!d) return { title: label, effects: [], cost: 0, because: '', disabledReason: 'Unknown district', category: 'event' };
      const owner = (Object.keys(d.influence) as FactionId[])
        .filter((f) => f !== 'player' && f !== 'none' && (d.influence[f] ?? 0) > 0)
        .sort((x, y) => (d.influence[y] ?? 0) - (d.influence[x] ?? 0))[0] as RivalId | undefined;
      const neutral = d.influence.none ?? 0;
      const effects: Effect[] = [
        { type: 'money', amount: -PUSH_COST, label },
        { type: 'influence', district: d.id, faction: 'player', amount: PUSH_GAIN, label },
        { type: 'heat', bar: 'local', amount: 2, label },
      ];
      if (owner && neutral < PUSH_GAIN && s.rivals.some((r) => r.id === owner)) {
        effects.push({ type: 'rivalOpinion', rival: owner, amount: -10, reason: `Pushed into ${d.name}`, label });
        effects.push({ type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 5, chance: 0.4, hint: `${FACTION_NAMES[owner]} may hit back`, params: { rival: owner }, label });
      }
      return {
        title: label,
        detail: `Men on the corners, envelopes for the bartenders. You hold ${d.influence.player ?? 0}% (${neutral}% is up for grabs).`,
        effects,
        cost: PUSH_COST,
        because: `pushed into ${d.name}`,
        disabledReason: (d.influence.player ?? 0) >= 95 ? 'You already run it' : s.money < PUSH_COST ? `Needs ${fmtMoney(PUSH_COST)}` : undefined,
        category: 'event',
      };
    },
  },
  buyBusiness: {
    preview: (s, a) => {
      const def = CATALOG[a.biz];
      const d = s.districts.find((x) => x.id === a.district);
      const b = newBusiness(s, a.biz, a.district);
      const label = `Buy: ${b.name}`;
      let why: string | undefined;
      why = need(!!d, 'Unknown district', why);
      why = need(!def.hidden, 'Not for sale', why);
      why = need(availableIn(a.biz, s.date.y), `Not before ${def.minYear}`, why);
      why = need((d?.influence.player ?? 0) >= 20, `You need 20% of ${d?.name ?? 'the district'} first`, why);
      const slots = playerSlots(s, a.district);
      why = need(def.category === 'property' || slots.used < slots.max, `No storefronts left for you in ${d?.name ?? 'the district'} (${slots.used}/${slots.max}) — push in further`, why);
      why = need(countKind(s, a.biz) < (def.max ?? MAX_PER_KIND), `You already own ${def.max ?? MAX_PER_KIND}`, why);
      why = need(s.money >= def.cost, `Needs ${fmtMoney(def.cost)}`, why);
      why = need(!(a.biz === 'narcotics' && s.edicts?.nojunk), 'Your own edict bans narcotics', why);
      const effects: Effect[] = [
        { type: 'money', amount: -def.cost, label },
        { type: 'addBusiness', business: b, label },
      ];
      if (a.biz === 'narcotics') effects.push({ type: 'schedule', key: 'narcotics_rumor', minWeeks: 3, maxWeeks: 8, chance: 0.35, hint: 'word may reach Philadelphia', label });
      if (def.category === 'racket' && def.heat >= 0.3) effects.push({ type: 'schedule', key: 'business_trouble', minWeeks: 2, maxWeeks: 8, chance: 0.25, hint: 'new places attract attention', label });
      return {
        title: label,
        detail: `${def.name} in ${d?.name ?? '?'}: ~${fmtMoney(def.base * def.season[0])}/wk in season, ${fmtMoney(def.base * def.season[1])} off-season · upkeep ${fmtMoney(def.upkeep)}/wk${def.staff ? ` · needs ${def.staff} man${def.staff > 1 ? 'men' : ''}`.replace('manmen', 'men') : ''}${def.launder ? ` · washes ${fmtMoney(def.launder)}/wk` : ''}${firstWinterAhead(s) ? ` · the first winter: +${fmtMoney(FIRST_WINTER_PER_NEW)}/wk to winterize it` : ''}`,
        effects,
        cost: def.cost,
        because: `bought ${b.name}`,
        disabledReason: why,
        category: 'event',
      };
    },
  },
  sellBusiness: {
    preview: (s, a) => {
      const b = s.businesses.find((x) => x.id === a.businessId && x.owner === 'player');
      const price = b ? Math.round((b.cost ?? CATALOG[b.kind].cost) * 0.5) : 0;
      const label = `Sell: ${b?.name ?? '?'}`;
      return {
        title: label,
        detail: 'Half what it cost, cash on the table.',
        effects: b ? [{ type: 'money', amount: price, label }, { type: 'removeBusiness', businessId: b.id, label }] : [],
        cost: 0,
        because: `sold ${b?.name ?? 'a business'}`,
        disabledReason: !b ? 'Not yours' : b.kind === 'casino' ? 'The casino stake is not for sale' : undefined,
        category: 'event',
      };
    },
  },
  lend: {
    preview: (s, a) => {
      const cap = bookCapacity(s);
      const label = `Shylock loan: ${fmtMoney(a.amount)} on the street`;
      let why: string | undefined;
      why = need(cap > 0, 'You need an open shylock book', why);
      why = need(s.loans.length < cap, `The book is full (${cap} loans)`, why);
      why = need(s.money >= a.amount, `Needs ${fmtMoney(a.amount)}`, why);
      why = need((LEND_AMOUNTS as readonly number[]).includes(a.amount), 'Odd amount', why);
      return {
        title: label,
        detail: 'Five points a week until he pays back the principal (10–20 weeks). Some won\'t.',
        effects: [{ type: 'money', amount: -a.amount, label }, { type: 'loan', amount: a.amount, label }],
        cost: a.amount,
        because: `put ${fmtMoney(a.amount)} on the street`,
        disabledReason: why,
        category: 'event',
      };
    },
  },
  findFrontMan: {
    preview: (s) => {
      const label = 'Front man: a clean name for the paperwork';
      let why: string | undefined;
      why = need(!frontMan(s), 'You already have a front man', why);
      why = need(s.money >= 2500, 'Needs $2,500', why);
      return {
        title: label,
        detail: 'A dentist, an insurance man — someone with no record who will sign what you tell him to.',
        effects: [{ type: 'money', amount: -2500, label }, { type: 'frontMan', label }],
        cost: 2500,
        because: 'found a clean front man',
        disabledReason: why,
        category: 'event',
      };
    },
  },
  charterBank: {
    preview: (s) => {
      const label = 'Bank charter: Shore Federal Savings & Loan';
      const missing = bankChecklist(s).filter((c) => !c.ok).map((c) => c.label);
      const b = newBusiness(s, 'bank', 'downtown', 'Shore Federal Savings & Loan');
      return {
        title: label,
        detail: 'Your front man signs; the banking commissioner owes you one. The vault washes $6,000 a week.',
        effects: [
          { type: 'money', amount: -BANK_COST, label },
          { type: 'favor', amount: -1, label: 'Political favor: the banking commissioner signs' },
          { type: 'addBusiness', business: b, label },
          { type: 'goal', key: 'bank', label },
          { type: 'respect', amount: 5, label },
          { type: 'schedule', key: 'bank_examiners', minWeeks: 6, maxWeeks: 20, chance: 0.3, hint: 'state examiners may come calling', label },
        ],
        cost: BANK_COST,
        because: 'chartered a bank through a front man',
        disabledReason: s.goals.bankWeek !== undefined ? 'You already own a bank' : missing.length ? `Missing: ${missing.join('; ')}` : undefined,
        category: 'event',
      };
    },
  },
  casino: {
    preview: (s, a) => {
      const g = s.goals;
      if (a.sell) {
        const label = 'Casino dream: sell the land to a hotel company';
        return {
          title: label,
          detail: 'Take the money and let somebody else deal with the Commission.',
          effects: [{ type: 'money', amount: LAND_SALE, label }, { type: 'goal', key: 'sellLand', label }],
          cost: 0,
          because: 'sold the Atlantic City land',
          disabledReason: g.casinoStage !== 1 || g.landSold ? 'You hold no land to sell' : !reached(s, 'referendum1976') ? 'Nobody is buying until the voters allow casinos' : undefined,
          category: 'event',
        };
      }
      if (g.landSold) return { title: 'Casino dream', effects: [], cost: 0, because: '', disabledReason: 'You sold the land', category: 'event' };
      if (g.casinoStage === 0) {
        const label = 'Casino dream: option boardwalk lots in Atlantic City';
        return {
          title: label,
          detail: 'Cheap today. Worth a fortune if the voters ever allow casinos.',
          effects: [{ type: 'money', amount: -LAND_COST, label }, { type: 'goal', key: 'land', label }],
          cost: LAND_COST,
          because: 'optioned land on the Atlantic City boardwalk',
          disabledReason: s.money < LAND_COST ? `Needs ${fmtMoney(LAND_COST)}` : undefined,
          category: 'event',
        };
      }
      if (g.casinoStage === 1) {
        const label = 'Casino dream: apply for a license';
        let why: string | undefined;
        why = need(reached(s, 'referendum1976'), 'Casinos are illegal in New Jersey until the voters change the law', why);
        why = need(frontManClean(s), 'You need a front man with no record and no file', why);
        why = need(s.heat.federal < 40, 'Federal heat must be under 40', why);
        why = need(s.money >= LICENSE_COST, `Needs ${fmtMoney(LICENSE_COST)}`, why);
        return {
          title: label,
          detail: 'Six months of investigators reading your front man\'s life. Keep federal heat down.',
          effects: [{ type: 'money', amount: -LICENSE_COST, label }, { type: 'goal', key: 'license', label }],
          cost: LICENSE_COST,
          because: 'applied for a casino license through a front man',
          disabledReason: why,
          category: 'event',
        };
      }
      return { title: 'Casino dream', effects: [], cost: 0, because: '', disabledReason: 'Already in motion', category: 'event' };
    },
  },
};

export function previewAction(s: GameState, a: PlayerAction): ActionPreview {
  const p = previewCore(s, a);
  // The boss is in another city (visit.ts): what needs him in Wildwood stays on screen, disabled, with the reason.
  const away = homeOnlyBlock(s, a);
  return away ? { ...p, disabledReason: away } : p;
}

/**
 * The preview without the boss's whereabouts. The week's orders resolve on
 * this: an order queued at home before he left was given before he left.
 */
function previewCore(s: GameState, a: PlayerAction): ActionPreview {
  const def = DEFS[a.kind] as Def<typeof a.kind>;
  const p = def.preview(s, a as never);
  const detail = p.disabledReason ? p.detail : withCostHint(p.detail, p.pot === 'pocket' ? costHint(s, p.cost, 'pocket') : costHint(s, Math.max(p.cost, moneyCost(p.effects))));
  return { ...p, detail, effects: named(p.title, p.effects), refuseEffects: p.refuseEffects ? named(`${p.title}: refused`, p.refuseEffects) : undefined };
}

/** Projected treasury after the queued orders (for UI affordability). */
export function queuedCost(s: GameState, actions: readonly PlayerAction[]): number {
  return queuedMoney(s, actions).family;
}

/**
 * What this week's queued orders take from each pot, in order: the Pocket pays the boss's own things first
 * and the Family covers what it cannot; draws move money from the Family into the Pocket.
 * `family` is the Family's committed spending (as `queuedCost` always was); `pocketLeft` / `familyLeft` are the pots after the orders.
 */
export function queuedMoney(s: GameState, actions: readonly PlayerAction[]): { family: number; pocket: number; pocketLeft: number; familyLeft: number; dips: number } {
  let pocket = Math.max(0, s.tribute?.acct.personal ?? 0);
  let family = 0;
  let fromPocket = 0;
  let back = 0;
  let dips = 0;
  for (const a of actions) {
    const p = previewAction(s, a);
    if (p.toPocket) {
      if (p.toPocket > 0) { family += p.toPocket; dips++; }
      else back += Math.min(-p.toPocket, Math.max(0, pocket));
      pocket = Math.max(0, pocket + p.toPocket);
    }
    if (p.pot === 'pocket') {
      const own = Math.min(p.cost, Math.max(0, pocket));
      pocket -= own;
      fromPocket += own;
      family += p.cost - own;
      if (p.cost > own) dips++;
    } else if (!p.toPocket) family += p.cost;
  }
  return { family, pocket: fromPocket, pocketLeft: pocket, familyLeft: Math.round(s.money) - family + back, dips };
}

/**
 * Why a pocket order can't be paid now without the Family (undefined: it can).
 * The Family only covers a short Pocket when the order says so (`fund: 'family'`),
 * which the button that names the amount sets. A stale preview (the Pocket was
 * spent by something else first) is caught here and the order is not carried out.
 */
export function fundingBlock(s: GameState, a: PlayerAction, p: ActionPreview = previewAction(s, a)): string | undefined {
  if (p.pot !== 'pocket' || !(p.cost > 0) || a.fund === 'family') return undefined;
  const pocket = Math.max(0, Math.round(s.tribute?.acct.personal ?? 0));
  if (p.cost <= pocket) return undefined;
  return `your pocket had $${pocket.toLocaleString('en-US')} of $${Math.round(p.cost).toLocaleString('en-US')}, and you had not approved Family money for the rest`;
}

/** Resolve the week's orders in order, re-checking each against the live state. */
export function resolveActions(ctx: Ctx, actions: readonly PlayerAction[], opts: { strictFunding?: boolean; own?: number } = {}): void {
  const s = ctx.s;
  // The Book (journal.ts): each order, and what came of it, is one entry. `own`: the boss's own orders come first.
  const by = (i: number) => (opts.own === undefined ? 'his people' : i < opts.own ? undefined : 'a trusted advisor');
  for (const [i, a] of actions.entries()) {
    if (s.gameOver) break;
    const def = DEFS[a.kind] as Def<typeof a.kind>;
    if (!def) continue;
    const mark = bookMark(ctx);
    const p = previewCore(s, a);
    if (p.disabledReason) {
      ctx.log.push(`Order not carried out — ${p.title}: ${p.disabledReason}.`);
      bookOrder(ctx, mark, a, { title: p.title, outcome: 'blocked', why: p.disabledReason, by: by(i) });
      continue;
    }
    const unfunded = opts.strictFunding ? fundingBlock(s, a, p) : undefined;
    if (unfunded) {
      ctx.log.push(`Order not carried out — ${p.title}: ${unfunded}.`);
      bookOrder(ctx, mark, a, { title: p.title, outcome: 'blocked', why: unfunded, by: by(i) });
      continue;
    }
    if (p.acceptance && !chance(s, p.acceptance.chance)) {
      if (p.refuseEffects?.length) applyEffects(ctx, p.refuseEffects, { label: `${p.title}: refused`, because: p.because, category: p.category });
      ctx.log.push(`${p.title} — refused.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You tried: ${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}. The answer was no.`, kind: 'decision' });
      bookOrder(ctx, mark, a, { title: p.title, outcome: 'refused', by: by(i) });
      continue;
    }
    applyEffects(ctx, p.effects, { label: p.title, because: p.because, category: p.category });
    def.commit?.(ctx, a as never);
    noteAttention(s, a);
    noteOrder(s, a);
    if (a.kind === 'interact' || a.kind === 'deed') {
      const t = s.characters[a.target];
      if (t) {
        t.neglect = 0;
        t.defectStage = 0;
      }
    }
    if (p.acceptance) ctx.log.push(`${p.title} — accepted.`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You ${p.because}.`, kind: 'decision' });
    bookOrder(ctx, mark, a, { title: p.title, outcome: 'done', by: by(i) });
  }
}

/**
 * One order settled NOW, the answer already decided (deeds/now.ts rolls it on
 * its own dice): the same effects, commit, chronicle and Book entry as at the
 * week's turn, so it is never applied twice (it is not queued).
 */
export function settleOrderNow(ctx: Ctx, a: PlayerAction, accepted: boolean): ActionPreview {
  const s = ctx.s;
  const def = DEFS[a.kind] as Def<typeof a.kind>;
  const mark = bookMark(ctx);
  const p = previewCore(s, a);
  if (!accepted) {
    if (p.refuseEffects?.length) applyEffects(ctx, p.refuseEffects, { label: `${p.title}: refused`, because: p.because, category: p.category });
    ctx.log.push(`${p.title} — refused.`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You tried: ${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}. The answer was no.`, kind: 'decision' });
    bookOrder(ctx, mark, a, { title: p.title, outcome: 'refused' });
    return p;
  }
  applyEffects(ctx, p.effects, { label: p.title, because: p.because, category: p.category });
  def.commit?.(ctx, a as never);
  noteAttention(s, a);
  noteOrder(s, a);
  if (a.kind === 'interact' || a.kind === 'deed') {
    const t = s.characters[a.target];
    if (t) { t.neglect = 0; t.defectStage = 0; }
  }
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You ${p.because}.`, kind: 'decision' });
  bookOrder(ctx, mark, a, { title: p.title, outcome: 'done' });
  return p;
}

/**
 * Every order the player could give right now (some disabled). Used by the
 * sim's random player and by tests; the UI builds its own menus.
 */
export function availableActions(s: GameState): PlayerAction[] {
  const out: PlayerAction[] = [];
  const ours = s.districts.filter((d) => { const sl = playerSlots(s, d.id); return (d.influence.player ?? 0) >= 20 && sl.used < sl.max; });
  for (const kind of SHOP_KINDS) {
    const d = ours.length ? ours[(s.week + kind.length) % ours.length] : s.districts[0];
    out.push({ kind: 'buyBusiness', biz: kind, district: d.id });
  }
  for (const b of owned(s)) if (b.kind !== 'casino' && !isOpen(s, b)) out.push({ kind: 'sellBusiness', businessId: b.id });
  for (const amount of LEND_AMOUNTS) out.push({ kind: 'lend', amount });
  out.push({ kind: 'findFrontMan' }, { kind: 'charterBank' }, { kind: 'casino' });
  for (const d of s.districts) if ((d.influence.player ?? 0) < 90) out.push({ kind: 'pushDistrict', district: d.id });
  for (const h of s.hirePool) out.push({ kind: 'hire', specId: h.id });
  const men = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && c.rank !== 'civilian');
  if (men.length) {
    const m = men[(s.week * 7) % men.length];
    out.push({ kind: 'policy', charId: m.id, policy: (['tax', 'earn', 'squeeze'] as const)[s.week % 3] });
    if (m.rank === 'capo') out.push({ kind: 'contract', charId: m.id, keep: [0.2, 0.25, 0.35][s.week % 3] });
    const seat = (['underboss', 'consigliere', 'bagman', 'enforcer', 'fixer'] as const)[s.week % 5];
    out.push({ kind: 'appoint', seat, charId: m.id });
    const tasks = (Object.keys(TASKS) as (keyof typeof TASKS)[]).filter((t) => TASKS[t].seat === seat);
    const t = tasks[s.week % tasks.length];
    out.push({ kind: 'councilTask', seat, task: t, target: TASKS[t].targeted ? 'feldstein' : undefined });
  }
  const boss = s.characters[s.playerId];
  out.push({ kind: 'legal', op: 'retainer' }, { kind: 'legal', op: 'lielow' }, { kind: 'officeHours' });
  out.push({ kind: 'underbelly', op: 'investigate' }, { kind: 'underbelly', op: 'expose' }, { kind: 'underbelly', op: 'runout' }, { kind: 'underbelly', op: 'ally', rival: (['manno', 'kessler', 'feldstein'] as const)[s.week % 3] });
  if (!boss?.lifestyle) out.push({ kind: 'lifestyle', focus: LIFESTYLE_IDS[(s.week + 2) % LIFESTYLE_IDS.length] });
  if (boss?.lifestyle?.points) {
    const L = LIFESTYLES[boss.lifestyle.focus];
    for (const tr of L.trees) {
      const next = tr.perks.find((p) => !boss.lifestyle!.perks.includes(p.id));
      if (next) out.push({ kind: 'perk', perk: next.id });
    }
  }
  for (const o of ORDERS) if (o.key !== 'narcotics') out.push({ kind: 'order', key: o.key, via: (['direct', 'underboss', 'capo'] as const)[(s.week + o.key.length) % 3] });
  const assoc = men.filter((c) => c.rank === 'associate');
  if (assoc.length) {
    const a0 = assoc[s.week % assoc.length];
    out.push({ kind: 'propose', charId: a0.id }, { kind: 'background', charId: a0.id });
  }
  const capoList = men.filter((c) => c.rank === 'capo');
  const movers = men.filter((c) => c.rank === 'soldier' || c.rank === 'associate');
  if (capoList.length >= 2 && movers.length) out.push({ kind: 'reassign', charId: movers[s.week % movers.length].id, capoId: capoList[s.week % capoList.length].id });
  const ed = (['omerta', 'blitz', 'nojunk', 'lowprofile'] as const)[s.week % 4];
  out.push({ kind: 'edict', edict: ed, on: !s.edicts[ed] });
  const free = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.rank !== 'civilian' && c.id !== s.playerId && !s.schemes.some((x) => x.agents.includes(c.id)));
  if (free.length >= 2) {
    const agents = [free[s.week % free.length].id, free[(s.week + 1) % free.length].id].filter((v, i, a) => a.indexOf(v) === i);
    const lts = Object.values(s.characters).filter((c) => c.alive && s.rivals.some((r) => r.id === c.faction && r.kind === 'mob' && r.leaderId !== c.id));
    if (lts.length) out.push({ kind: 'scheme', scheme: 'murder', targetId: lts[s.week % lts.length].id, agents, opts: { depth: 'planned', location: 'car', disposal: 'disappear', equipment: 'street' } });
    out.push({ kind: 'scheme', scheme: 'heist', agents, opts: { depth: 'planned', heist: (['jewelry', 'armored', 'bank'] as const)[s.week % 3] } });
    out.push({ kind: 'scheme', scheme: 'envoy', agents: agents.slice(0, 1), opts: { depth: 'planned', city: ['capemay', 'ac', 'baltimore', 'miami'][s.week % 4] } });
    const cd = s.districts.find((d) => topRival(s, d.id));
    if (cd) out.push({ kind: 'scheme', scheme: 'claim', agents: agents.slice(0, 1), opts: { depth: 'planned', district: cd.id } });
  }
  for (const w of s.wars) out.push({ kind: 'raid', warId: w.id }, { kind: 'terms', warId: w.id, terms: (['district', 'tribute', 'white'] as const)[s.week % 3] });
  for (const r of s.rivals.filter((x) => x.kind === 'mob')) {
    const d = s.districts.find((x) => (x.influence[r.id] ?? 0) > 0);
    if (d) {
      out.push({ kind: 'declareWar', rival: r.id, district: d.id });
      out.push({ kind: 'raiseDispute', dispute: (['district', 'war', 'reparations'] as const)[s.week % 3], rival: r.id, district: d.id });
    }
  }
  for (const d of s.disputes.filter((x) => !x.ruling)) {
    const m = tableMembersFor(s)[s.week % Math.max(1, tableMembersFor(s).length)];
    if (m) out.push({ kind: 'lobby', disputeId: d.id, memberId: m.id, mode: 'money' });
  }
  const official = Object.values(s.characters).find((c) => c.alive && c.office && OFFICE_BRIBE[c.office] && (s.week % 3 === 0));
  if (official) out.push({ kind: 'interact', id: 'bribe', target: official.id });
  out.push(...dynastyActions(s));
  out.push(...powerActions(s));
  out.push(...econActions(s).filter((a) => { const c = previewAction(s, a).cost; return c === 0 || s.money >= c * 3; }));
  out.push(...hoodActions(s).filter((a) => s.money >= previewAction(s, a).cost * 4));
  out.push(...talkActions(s), ...missionActions(s).filter((a) => s.money >= previewAction(s, a).cost * 3));
  out.push(...bonesActions(s).filter((a) => { const c = previewAction(s, a).cost; return c === 0 || s.money >= c * 4; }), ...ledgerActions(s));
  out.push(...earsActions(s).filter((a) => { const c = previewAction(s, a).cost; return c === 0 || s.money >= c * 4; }));
  // A couple of interactions with random people.
  const people = Object.values(s.characters).filter((c) => c.alive && c.id !== s.playerId && (c.faction === 'player' || c.dynasty));
  if (people.length) {
    const c = people[s.week % people.length];
    for (const id of ['gift_small', 'dinner', 'make', 'promote', 'demand'] as const) out.push({ kind: 'interact', id, target: c.id });
  }
  return out;
}

export function legalActions(s: GameState): PlayerAction[] {
  return availableActions(s).filter((a) => !previewAction(s, a).disabledReason);
}

export { applyEffects };
