import { backReasons } from './myMen';
import { pocketPrice } from './pocket';
import { bonesBlock } from './bones';
import { perkMod } from './lifestyle';
import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, player, relationLabel } from './characters';
import { fmtMoney } from './effects';
import { getRelation, opinion } from './relations';
import { FACTION_NAMES } from './world';
import { bribeReasons } from './polIntegrity';
import type { Character, Effect, GameState, Hook, InteractionId } from './types';
import { previewRomance } from './romance';
import { seatPreview } from './eligibility';

/**
 * Character interactions (the CK-style right-click menu). Each interaction
 * has who it applies to, what it does (as labelled effects), and — when the
 * other person can say no — acceptance odds broken down into reasons, e.g.
 * "+12 Opinion of you", "−20 Greedy", "+15 Fears you".
 */

export interface Reason {
  label: string;
  value: number;
}

export interface Acceptance {
  /** 0..1 */
  chance: number;
  reasons: Reason[];
}

export interface InteractionPreview {
  id: InteractionId;
  title: string;
  detail: string;
  effects: Effect[];
  refuseEffects?: Effect[];
  acceptance?: Acceptance;
  cost: number;
  /** 'pocket': the boss's own money pays (pocket.ts). */
  pot?: 'pocket';
  because: string;
  disabledReason?: string;
  /** Extra consequence shown in red under the card. */
  warning?: string;
}

export type Relationship = 'self' | 'crew' | 'family' | 'rival' | 'civilian';

export function relationshipTo(s: GameState, c: Character): Relationship {
  if (c.id === s.playerId) return 'self';
  if (c.faction === 'player' && c.rank !== 'civilian') return 'crew';
  if (c.dynasty) return 'family';
  if (s.rivals.some((r) => r.id === c.faction)) return 'rival';
  return 'civilian';
}

export const INTERACTION_ORDER: InteractionId[] = [
  'dinner', 'gift_small', 'gift_large', 'bribe', 'favor', 'demand', 'threaten', 'expose', 'recruit', 'bringIn', 'make', 'promote', 'demote', 'exile', 'whack',
  'court', 'affair', 'proposeMarriage', 'endRomance', 'separate',
];

/** What a fictional official's envelope buys. */
export const OFFICE_BRIBE: Record<string, { cost: number; effects: (label: string) => Effect[] }> = {
  'Police sergeant': { cost: 2000, effects: (label) => [{ type: 'heat', bar: 'local', amount: -8, label }] },
  'Chief of Police': { cost: 5000, effects: (label) => [{ type: 'heat', bar: 'local', amount: -15, label }] },
  'County judge': { cost: 5000, effects: (label) => [{ type: 'favor', amount: 1, label }, { type: 'heat', bar: 'local', amount: -4, label }] },
  'City councilman': { cost: 2500, effects: (label) => [{ type: 'favor', amount: 1, label }] },
  'State assemblyman': { cost: 4000, effects: (label) => [{ type: 'favor', amount: 1, label }, { type: 'heat', bar: 'family', amount: -2, label }] },
  'IRS agent': { cost: 4500, effects: (label) => [{ type: 'heat', bar: 'federal', amount: -8, label }, { type: 'unwashed', amount: -5000, label }] },
};

function clampChance(base: number, reasons: Reason[]): Acceptance {
  const sum = reasons.reduce((a, r) => a + r.value, base);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

function opinionReason(s: GameState, c: Character, mult = 0.5): Reason {
  const op = opinion(s, c.id, s.playerId);
  return { label: op >= 0 ? 'Opinion of you' : 'Dislikes you', value: Math.round(op * mult) };
}

function fearReason(s: GameState, c: Character, mult = 0.4): Reason {
  return { label: 'Fears you', value: Math.round((getRelation(s, c.id, s.playerId)?.fear ?? 0) * mult) };
}

function respectReason(s: GameState): Reason {
  return { label: 'Your reputation', value: Math.round((s.respect - 40) / 3) };
}

function traitReasons(c: Character, table: Partial<Record<string, number>>): Reason[] {
  return c.traits.filter((t) => table[t] !== undefined).map((t) => ({ label: t, value: table[t]! }));
}

function free(s: GameState, c: Character): string | undefined {
  return isFree(s, c) ? undefined : 'He is in jail';
}

/** All interactions for a character, in menu order (some disabled). */
export function interactionsFor(s: GameState, targetId: string): InteractionPreview[] {
  return INTERACTION_ORDER.map((id) => previewInteraction(s, id, targetId)).filter((p): p is InteractionPreview => !!p);
}

/** Returns undefined when the interaction makes no sense for this person at all. */
export function playerHook(s: GameState, targetId: string): Hook | undefined {
  return s.hooks.find((h) => h.holder === 'player' && h.targetId === targetId && h.strong && (h.usedWeek ?? -99) < s.week - 8)
    ?? s.hooks.find((h) => h.holder === 'player' && h.targetId === targetId && !h.strong);
}

/** Adds a hook to an acceptance-based interaction (spends a weak one). */
function withHook(s: GameState, p: InteractionPreview, targetId: string): InteractionPreview {
  const h = playerHook(s, targetId);
  if (!h || !p.acceptance) return { ...p, disabledReason: p.disabledReason ?? 'You hold no usable hook on him' };
  const bonus = h.strong ? 80 : 40;
  const reasons = [...p.acceptance.reasons, { label: h.strong ? `Strong hook: ${h.reason}` : `Weak hook: ${h.reason} (spent)`, value: bonus }];
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return {
    ...p,
    title: `${p.title} (using your hook)`,
    acceptance: { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons },
    effects: [...p.effects, { type: 'hook', targetId, strong: h.strong, reason: h.reason, spend: true, label: p.title }],
  };
}

export function previewInteraction(s: GameState, id: InteractionId, targetId: string, useHook?: boolean): InteractionPreview | undefined {
  let p = previewInteractionBase(s, id, targetId);
  const pa = perkMod(s, 'accept');
  if (p?.acceptance && pa) {
    const reasons = [...p.acceptance.reasons, { label: 'Your perks: a man people listen to', value: pa }];
    const sum = reasons.reduce((a, r) => a + r.value, 0);
    p = { ...p, acceptance: { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons } };
  }
  return p && useHook ? withHook(s, p, targetId) : p;
}

function previewInteractionBase(s: GameState, id: InteractionId, targetId: string): InteractionPreview | undefined {
  const c = s.characters[targetId];
  const boss = player(s);
  if (!c || !c.alive || c.id === boss.id) return undefined;
  const rel = relationshipTo(s, c);
  const nm = displayName(c);
  const first = c.firstName;
  const adult = ageOn(c.birth, s.date) >= 16;
  switch (id) {
    case 'court':
    case 'affair':
    case 'proposeMarriage':
    case 'endRomance':
    case 'separate':
      return previewRomance(s, id, c);
    case 'dinner': {
      if (rel !== 'family' && rel !== 'crew') return undefined;
      if (!adult) return undefined;
      const label = `Sunday dinner: ${first}`;
      return {
        id, title: `Invite ${first} to Sunday dinner`, detail: 'Gravy at two. Nobody leaves before the cannoli.', cost: 150, pot: 'pocket',
        effects: [
          ...pocketPrice(s, 150, label).effects,
          { type: 'opinion', from: c.id, to: boss.id, amount: rel === 'family' ? 8 : 12, reason: 'Broke bread at the boss\'s table', decay: 1, label },
          { type: 'meter', from: c.id, to: boss.id, meter: 'trust', amount: 5, label },
        ],
        because: `had ${first} to Sunday dinner`,
        disabledReason: free(s, c),
      };
    }
    case 'gift_small':
    case 'gift_large': {
      const amt = id === 'gift_small' ? 500 : 2500;
      const label = `Gift to ${first}`;
      const greedy = hasTrait(c, 'Greedy') ? 1.5 : hasTrait(c, 'Honest') ? 0.6 : 1;
      const value = Math.round((id === 'gift_small' ? 8 : 22) * greedy);
      return {
        id, title: id === 'gift_small' ? `Send ${first} a gift (${fmtMoney(amt)})` : `Send ${first} something special (${fmtMoney(amt)})`,
        detail: id === 'gift_small' ? 'A case of Canadian Club, a box of cigars.' : 'A new Cadillac. A mink for his wife.',
        cost: amt, pot: 'pocket',
        effects: [
          ...pocketPrice(s, amt, label).effects,
          { type: 'opinion', from: c.id, to: boss.id, amount: value, reason: 'Sent me a generous gift', decay: 2, label },
        ],
        because: `sent ${first} a gift`,
        disabledReason: pocketPrice(s, amt, label).why,
      };
    }
    case 'bribe': {
      if (!c.office || !OFFICE_BRIBE[c.office]) return undefined;
      const base = OFFICE_BRIBE[c.office];
      const ob = { ...base, cost: Math.round(base.cost * (1 - perkMod(s, 'bribe') / 100) / 50) * 50 };
      const label = `Bribe: ${c.office === 'Police sergeant' ? 'Sgt. ' : ''}${c.office === 'Police sergeant' ? c.lastName : `${c.firstName} ${c.lastName}`}`;
      const acceptance = clampChance(40, [
        opinionReason(s, c, 0.5),
        respectReason(s),
        ...traitReasons(c, { Honest: -45, Greedy: 25, Gambler: 10, Paranoid: -10, Ambitious: 5 }),
        ...(c.traits.includes('Honest') && s.heat.local > 50 ? [{ label: 'Wants a headline', value: -10 }] : []),
        ...bribeReasons(s, c.id),
      ]);
      return {
        id, title: `Bribe ${displayName(c)}`, detail: `${c.office}. An envelope, discreetly.`, cost: ob.cost,
        effects: [{ type: 'money', amount: -ob.cost, label }, ...ob.effects(label), { type: 'hook', targetId: c.id, strong: false, reason: 'Took our money', label }],
        refuseEffects: [{ type: 'money', amount: -Math.round(ob.cost / 4), label: `${label}: refused (the go-between's cut)` }, { type: 'heat', bar: c.office === 'IRS agent' ? 'federal' : 'local', amount: 6, label: `${label}: refused, and he reported it` }],
        acceptance,
        because: `bribed ${displayName(c)}`,
        disabledReason: s.money < ob.cost ? `Needs ${fmtMoney(ob.cost)}` : undefined,
      };
    }
    case 'expose': {
      const sec = s.secrets.find((x) => x.ownerId === c.id && x.knownBy.includes('player') && x.kind !== 'plot');
      if (!sec || c.faction === 'player') return undefined;
      const r = s.rivals.find((x) => x.id === c.faction);
      const label = `Exposed ${first}`;
      const own = r && sec.kind === 'informant' && sec.text.includes('informs for') && !sec.text.includes('for you');
      return {
        id, title: `Expose ${first}'s secret`, detail: `${sec.text}. Tell the people who would care.`, cost: 0,
        effects: [
          ...(own && r ? [{ type: 'kill', charId: c.id, cause: `killed by his own people as an informant`, killer: r.id, label } as Effect] : []),
          ...(r && !own ? [{ type: 'rivalResource', rival: r.id, exposure: 20, money: -3000, label } as Effect, { type: 'rivalOpinion', rival: r.id, amount: -15, reason: 'Spread our dirty laundry', label } as Effect] : []),
          ...(c.office ? [{ type: 'heat', bar: 'local', amount: -6, label } as Effect] : []),
          { type: 'opinion', from: c.id, to: boss.id, amount: -40, reason: 'Exposed my secret', decay: 0, label },
          { type: 'respect', amount: 2, label },
        ],
        because: `exposed ${first}'s secret`,
      };
    }
    case 'favor': {
      if (rel !== 'rival' && rel !== 'civilian') return undefined;
      if (rel === 'civilian' && !c.frontMan && !c.office) return undefined;
      const label = `Favor from ${first}`;
      const acceptance = clampChance(20, [
        opinionReason(s, c, 0.6),
        fearReason(s, c, 0.3),
        respectReason(s),
        ...(hasTrait(boss, 'Charming') ? [{ label: 'You are Charming', value: 10 }] : []),
        ...traitReasons(c, { Honest: -15, Paranoid: -10, Greedy: -5, Charming: 5, Patient: 5 }),
      ]);
      return {
        id, title: `Ask ${first} for a favor`, detail: 'He does something for you; you owe him a little less goodwill.', cost: 0,
        effects: [
          { type: 'favor', amount: 1, label },
          { type: 'opinion', from: c.id, to: boss.id, amount: -6, reason: 'Called in a favor', decay: 1, label },
        ],
        refuseEffects: [{ type: 'respect', amount: -1, label: `${first} turned you down` }],
        acceptance,
        because: `asked ${first} for a favor`,
      };
    }
    case 'demand': {
      if (rel !== 'crew' || c.rank === 'associate') return undefined;
      const take = Math.max(200, Math.round(c.wealth * 0.25 / 100) * 100);
      const label = `Demand from ${first}`;
      const acceptance = clampChance(45, [
        opinionReason(s, c),
        fearReason(s, c, 0.5),
        respectReason(s),
        ...traitReasons(c, { Greedy: -20, 'Loyal-to-a-fault': 25, Ambitious: -10, Cowardly: 15, 'Hot-headed': -10, Honest: 5 }),
      ]);
      return {
        id, title: `Demand ${fmtMoney(take)} from ${first}`, detail: `A quarter of what he has put away (${fmtMoney(c.wealth)}).`, cost: 0,
        effects: [
          { type: 'money', amount: take, label },
          { type: 'wealth', charId: c.id, amount: -take, label },
          { type: 'opinion', from: c.id, to: boss.id, amount: -12, reason: 'Shook me down', decay: 1, label },
        ],
        refuseEffects: [
          { type: 'respect', amount: -2, label: `${first} refused your demand` },
          { type: 'meter', from: c.id, to: boss.id, meter: 'grievance', amount: 10, label: `${first} refused your demand` },
        ],
        acceptance,
        because: `demanded money from ${first}`,
        disabledReason: c.wealth < 400 ? 'He has nothing worth taking' : free(s, c),
      };
    }
    case 'threaten': {
      if (rel === 'family' || rel === 'self') return undefined;
      const label = `Threatened ${first}`;
      const hot = hasTrait(c, 'Hot-headed') || hasTrait(c, 'Vengeful');
      return {
        id, title: `Threaten ${first}`, detail: hot ? 'He does not take threats quietly.' : 'Remind him what happens to people who forget.', cost: 0,
        effects: [
          { type: 'meter', from: c.id, to: boss.id, meter: 'fear', amount: 20, label },
          { type: 'opinion', from: c.id, to: boss.id, amount: -15, reason: 'Threatened me', decay: 1, label },
          ...(hot ? [{ type: 'meter', from: c.id, to: boss.id, meter: 'grievance', amount: 20, label } as Effect] : []),
          ...(rel === 'rival' ? [{ type: 'heat', bar: 'local', amount: 1, label } as Effect] : []),
        ],
        because: `threatened ${first}`,
      };
    }
    case 'recruit': {
      if (rel !== 'rival' && rel !== 'civilian') return undefined;
      if (c.frontMan || c.rank === 'boss' || (rel === 'rival' && s.rivals.some((r) => r.leaderId === c.id))) return undefined;
      if (c.gender !== 'M' || !adult) return undefined;
      const label = `Recruit ${first}`;
      const acceptance = clampChance(rel === 'rival' ? 10 : 35, [
        opinionReason(s, c),
        respectReason(s),
        { label: 'Signing money', value: 15 },
        ...backReasons(s),
        ...(rel === 'rival' ? [{ label: `Loyal to ${FACTION_NAMES[c.faction]}`, value: -25 }] : []),
        ...traitReasons(c, { Ambitious: 10, Greedy: 10, 'Loyal-to-a-fault': -40, Cowardly: -10, Paranoid: -10 }),
      ]);
      return {
        id, title: `Recruit ${first}`, detail: rel === 'rival' ? `Poach him from ${FACTION_NAMES[c.faction]}. They will not like it.` : 'Bring him in as an associate.', cost: 1000,
        effects: [
          { type: 'money', amount: -1000, label },
          { type: 'recruit', charId: c.id, label },
          { type: 'rank', charId: c.id, rank: 'associate', label },
          { type: 'opinion', from: c.id, to: boss.id, amount: 15, reason: 'Gave me my chance', decay: 1, label },
          ...(rel === 'rival' ? [{ type: 'rivalOpinion', rival: c.faction as never, amount: -15, reason: 'Poached my man', label } as Effect] : []),
        ],
        refuseEffects: [{ type: 'money', amount: -1000, label: `${first} kept the signing money and said no` }],
        acceptance,
        because: `recruited ${nm}`,
        disabledReason: s.money < 1000 ? 'Needs $1,000' : free(s, c),
      };
    }
    case 'bringIn': {
      if (rel !== 'family' || c.gender !== 'M' || c.rank !== 'civilian' || ageOn(c.birth, s.date) < 18) return undefined;
      const label = `${first} joins the business`;
      return {
        id, title: `Bring ${first} into the business`, detail: `Your ${relationLabel(s, boss, c)}, ${ageOn(c.birth, s.date)}. The women of the house will not be happy.`, cost: 0,
        effects: [
          { type: 'rank', charId: c.id, rank: 'associate', label },
          { type: 'recruit', charId: c.id, label },
          { type: 'opinion', from: c.id, to: boss.id, amount: 15, reason: 'Trusted me with the family business', label },
          { type: 'familyOpinion', amount: -3, reason: 'Pulled a boy into the life', label },
        ],
        because: `brought ${first} into the life`,
      };
    }
    case 'make': {
      if (rel !== 'crew' || c.rank !== 'associate' || c.specialty) return undefined;
      const label = `Membership: ${first}`;
      const v = (c.capoId ? s.characters[c.capoId] : undefined) ?? boss;
      const waiting = c.proposedWeek !== undefined;
      return {
        id, title: `Propose ${first} for membership`, detail: `${v.id === boss.id ? 'You vouch' : `${v.firstName} vouches`} for him and his name goes to Philadelphia ($500). When the books open he is made in the ceremony.`, cost: 500,
        effects: [
          { type: 'money', amount: -500, label: `${label}: envelope for Philadelphia` },
          { type: 'propose', charId: c.id, voucherId: v.id, label },
          { type: 'opinion', from: c.id, to: boss.id, amount: 10, reason: 'Put my name up', decay: 1, label },
        ],
        because: `proposed ${nm} for membership`,
        disabledReason: waiting ? `Waiting for the books (proposed week ${c.proposedWeek})` : bonesBlock(s, c) ?? (s.money < 500 ? 'Needs $500' : free(s, c)),
      };
    }
    case 'promote': {
      if (rel !== 'crew' || (c.rank !== 'soldier' && c.rank !== 'capo')) return undefined;
      if (c.rank === 'soldier') {
        const d = s.districts.find((x) => (!x.capoId || !s.characters[x.capoId]?.alive) && (x.influence.player ?? 0) >= 40);
        const label = `Promoted ${first} to capo`;
        return {
          id, title: `Make ${first} a capo${d ? ` of ${d.name}` : ''}`, detail: d ? 'He runs the district and kicks up to you.' : 'No district needs a capo right now.', cost: 0,
          effects: [
            { type: 'rank', charId: c.id, rank: 'capo', district: d?.id, label },
            { type: 'opinion', from: c.id, to: boss.id, amount: 20, reason: 'Made me a capo', decay: 1, label },
            { type: 'crewOpinion', amount: 0, reason: 'Passed over for capo', traitMods: { Ambitious: -6 }, label },
          ],
          because: `made ${nm} a capo`,
          disabledReason: d ? free(s, c) : 'Every district you hold already has a capo',
        };
      }
      // A capo made underboss is the underboss SEAT (rank and seat together): the same preview,
      // permission and effect as the council's Appoint and the sheet's "Seat him as underboss".
      const sp = seatPreview(s, 'underboss', c.id);
      return { id, title: sp.title, detail: sp.detail, cost: 0, effects: sp.effects, because: sp.because, disabledReason: sp.disabledReason, warning: sp.warning };
    }
    case 'demote': {
      if (rel !== 'crew' || (c.rank !== 'capo' && c.rank !== 'underboss' && c.rank !== 'consigliere')) return undefined;
      const label = `Demoted ${first}`;
      return {
        id, title: `Break ${first} down to soldier`, detail: 'He will remember this.', cost: 0,
        effects: [
          { type: 'rank', charId: c.id, rank: 'soldier', label },
          { type: 'opinion', from: c.id, to: boss.id, amount: -30, reason: 'Broke me down to soldier', decay: 1, label },
          { type: 'meter', from: c.id, to: boss.id, meter: 'grievance', amount: 30, label },
          { type: 'respect', amount: 1, label },
        ],
        because: `broke ${nm} down to soldier`,
      };
    }
    case 'exile': {
      if (rel !== 'crew') return undefined;
      const label = `Exiled ${first}`;
      return {
        id, title: `Exile ${first} from Wildwood`, detail: 'Florida, Las Vegas, anywhere but here. He may land with a rival.', cost: 0,
        effects: [
          { type: 'exile', charId: c.id, label },
          { type: 'crewOpinion', amount: -2, reason: 'Threw out one of our own', traitMods: { Cruel: 2, Paranoid: 2 }, label },
          { type: 'schedule', key: 'exile_turns', minWeeks: 3, maxWeeks: 10, chance: 0.4, hint: 'he may go over to a rival', params: { charId: c.id }, label },
        ],
        because: `exiled ${nm}`,
      };
    }
    case 'whack': {
      if (rel !== 'crew') return undefined;
      const label = `Whacked ${first}`;
      return {
        id, title: `Have ${first} whacked`, detail: 'Quick and quiet, by his own people. Everyone will know why — or wonder.', cost: 0,
        effects: [
          { type: 'kill', charId: c.id, cause: 'whacked on the boss\'s orders', killer: 'player', label },
          { type: 'heat', bar: 'local', amount: 6, label },
          { type: 'respect', amount: 2, label },
          { type: 'crewOpinion', amount: -5, reason: 'Killed one of our own', traitMods: { Cruel: 7, Paranoid: -3 }, label },
          { type: 'schedule', key: 'example_widow', minWeeks: 2, maxWeeks: 6, chance: 0.3, hint: 'his family may talk to the cops', label },
        ],
        because: `had ${nm} whacked`,
      };
    }
  }
}

/** Short summary of odds for buttons: "Will accept: 62%". */
export function oddsLabel(a?: Acceptance): string {
  if (!a) return 'Certain';
  return `${Math.round(a.chance * 100)}% to accept`;
}
