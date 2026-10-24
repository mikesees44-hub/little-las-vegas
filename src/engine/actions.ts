import { countKind, isOpen, newBusiness, owned, playerSlots } from './business';
import { CATALOG, SHOP_KINDS } from './catalog';
import { applyEffects, fmtMoney } from './effects';
import { BANK_COST, bankChecklist, frontMan, frontManClean, LAND_COST, LAND_SALE, LICENSE_COST } from './goals';
import { reached } from './history';
import type { Ctx } from './ledger';
import { bookCapacity, LEND_AMOUNTS } from './loans';
import { previewInteraction, type Acceptance } from './interactions';
import { chance } from './rng';
import { FACTION_NAMES } from './world';
import type { Effect, FactionId, GameState, LedgerCategory, PlayerAction, RivalId } from './types';

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
  because: string;
  disabledReason?: string;
  category: LedgerCategory;
  /** If the other side can say no: the odds and why. */
  acceptance?: Acceptance;
  /** What happens if they say no. */
  refuseEffects?: Effect[];
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

const DEFS: { [K in PlayerAction['kind']]: Def<K> } = {
  interact: {
    preview: (s, a) => {
      const p = previewInteraction(s, a.id, a.target);
      if (!p) return { title: 'Nothing to do', effects: [], cost: 0, because: '', disabledReason: 'Not possible', category: 'event' };
      return {
        title: p.title,
        detail: p.detail,
        effects: p.effects,
        refuseEffects: p.refuseEffects,
        acceptance: p.acceptance,
        cost: p.cost,
        because: p.because,
        disabledReason: p.disabledReason ?? (p.cost > s.money ? `Needs ${fmtMoney(p.cost)}` : undefined),
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
      why = need((d?.influence.player ?? 0) >= 20, `You need 20% of ${d?.name ?? 'the district'} first`, why);
      const slots = playerSlots(s, a.district);
      why = need(def.category === 'property' || slots.used < slots.max, `No storefronts left for you in ${d?.name ?? 'the district'} (${slots.used}/${slots.max}) — push in further`, why);
      why = need(countKind(s, a.biz) < (def.max ?? MAX_PER_KIND), `You already own ${def.max ?? MAX_PER_KIND}`, why);
      why = need(s.money >= def.cost, `Needs ${fmtMoney(def.cost)}`, why);
      why = need(!(a.biz === 'narcotics' && s.flags.edict_nojunk), 'Your own edict bans narcotics', why);
      const effects: Effect[] = [
        { type: 'money', amount: -def.cost, label },
        { type: 'addBusiness', business: b, label },
      ];
      if (a.biz === 'narcotics') effects.push({ type: 'schedule', key: 'narcotics_rumor', minWeeks: 3, maxWeeks: 8, chance: 0.35, hint: 'word may reach Philadelphia', label });
      if (def.category === 'racket' && def.heat >= 0.3) effects.push({ type: 'schedule', key: 'business_trouble', minWeeks: 2, maxWeeks: 8, chance: 0.25, hint: 'new places attract attention', label });
      return {
        title: label,
        detail: `${def.name} in ${d?.name ?? '?'}: ~${fmtMoney(def.base * def.season[0])}/wk in season, ${fmtMoney(def.base * def.season[1])} off-season · upkeep ${fmtMoney(def.upkeep)}/wk${def.staff ? ` · needs ${def.staff} man${def.staff > 1 ? 'men' : ''}`.replace('manmen', 'men') : ''}${def.launder ? ` · washes ${fmtMoney(def.launder)}/wk` : ''}`,
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
  const def = DEFS[a.kind] as Def<typeof a.kind>;
  const p = def.preview(s, a as never);
  return { ...p, effects: named(p.title, p.effects), refuseEffects: p.refuseEffects ? named(`${p.title}: refused`, p.refuseEffects) : undefined };
}

/** Projected treasury after the queued orders (for UI affordability). */
export function queuedCost(s: GameState, actions: readonly PlayerAction[]): number {
  return actions.reduce((acc, a) => acc + previewAction(s, a).cost, 0);
}

/** Resolve the week's orders in order, re-checking each against the live state. */
export function resolveActions(ctx: Ctx, actions: readonly PlayerAction[]): void {
  const s = ctx.s;
  for (const a of actions) {
    if (s.gameOver) break;
    const def = DEFS[a.kind] as Def<typeof a.kind>;
    if (!def) continue;
    const p = previewAction(s, a);
    if (p.disabledReason) {
      ctx.log.push(`Order not carried out — ${p.title}: ${p.disabledReason}.`);
      continue;
    }
    if (p.acceptance && !chance(s, p.acceptance.chance)) {
      if (p.refuseEffects?.length) applyEffects(ctx, p.refuseEffects, { label: `${p.title}: refused`, because: p.because, category: p.category });
      ctx.log.push(`${p.title} — refused.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You tried: ${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}. The answer was no.`, kind: 'decision' });
      continue;
    }
    applyEffects(ctx, p.effects, { label: p.title, because: p.because, category: p.category });
    def.commit?.(ctx, a as never);
    if (p.acceptance) ctx.log.push(`${p.title} — accepted.`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You ${p.because}.`, kind: 'decision' });
  }
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
