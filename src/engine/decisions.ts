import { ageOn, isInSeason } from './calendar';
import { capos, crew, displayName, isFree, player } from './characters';
import { chooseHeir } from './dynasty';
import { BANK_COST, bankChecklist, casinoStatus } from './goals';
import { alliedWithFaction } from './familyHouses';
import { hasPerk } from './familyLegacy';
import { ensureDynState, type DecisionId } from './familyState';
import { reached } from './history';
import { opinion } from './relations';
import type { Effect, GameState, PlayerAction } from './types';

/**
 * CK "Decisions": big one-off moves with requirements and costs. The panel
 * shows progress toward each requirement. Some decisions are new here; the
 * bank charter and the casino dream are existing systems surfaced and linked
 * to their own orders.
 */

export interface Requirement {
  label: string;
  ok: boolean;
  /** For a progress bar: current / target. */
  have?: number;
  need?: number;
  /** "under" requirements: lower is better. */
  invert?: boolean;
}

export interface DecisionView {
  id: DecisionId;
  name: string;
  text: string;
  /** Visible at all (e.g. the casino dream only after the 1976 referendum). */
  shown: boolean;
  reqs: Requirement[];
  costText: string;
  effects: Effect[];
  /** An existing system's order this decision links to. */
  link?: PlayerAction;
  /** Already done (one-off) or on cooldown. */
  done?: string;
  risky?: string;
  options?: { id: string; label: string }[];
}

export function districtsHeld(s: GameState, threshold = 50): number {
  return s.districts.filter((d) => (d.influence.player ?? 0) >= threshold).length;
}

function favorsNeeded(s: GameState, n: number): number {
  return Math.max(0, n - (hasPerk(s, 'church', 3) ? 1 : 0));
}

function fronts(s: GameState): number {
  return s.businesses.filter((b) => b.owner === 'player' && b.category === 'front').length;
}

function phillyOk(s: GameState): boolean {
  const r = s.rivals.find((x) => x.id === 'philly');
  return !!r && (opinion(s, r.leaderId, s.playerId) >= 40 || alliedWithFaction(s, 'philly'));
}

function req(label: string, have: number, need: number, invert = false): Requirement {
  return { label, ok: invert ? have <= need : have >= need, have: Math.max(0, have), need, invert };
}

function taken(s: GameState, id: DecisionId): number | undefined {
  return s.dyn?.decisions[id];
}

export function decisionViews(s: GameState): DecisionView[] {
  const boss = player(s);
  const heir = chooseHeir(s, boss).heir;
  const muscle = crew(s).filter((c) => isFree(s, c)).length;
  const fav3 = favorsNeeded(s, 3);
  const views: DecisionView[] = [
    {
      id: 'shore_boss', name: 'Become Boss of the Shore', shown: true,
      text: 'Every corner from the Causeway to the Crest answers to the house. Philadelphia gives its blessing and the title follows you to the grave.',
      reqs: [req('Hold 6 districts (50%+)', districtsHeld(s), 6), req('Respect 70', s.respect, 70), { label: 'Philadelphia\'s blessing (Moretti thinks 40+ of you, or a marriage into his house)', ok: phillyOk(s) }],
      costText: '$10,000 for the party at the Hotel Dorset',
      effects: [{ type: 'money', amount: -10000 }, { type: 'respect', amount: 10 }, { type: 'crewOpinion', amount: 10, reason: 'Boss of the Shore' }, { type: 'dyn', op: { op: 'decision', id: 'shore_boss' } }, { type: 'dyn', op: { op: 'renown', amount: 300, reason: 'Became Boss of the Shore' } }],
      done: taken(s, 'shore_boss') !== undefined ? 'You are Boss of the Shore' : undefined,
    },
    {
      id: 'city_hall', name: 'Buy a Seat at City Hall', shown: true,
      text: 'Put one of the family on the city commission. A councilman who comes to Sunday dinner is worth a favor every season and a quieter police department.',
      reqs: [req(`${fav3} political favors`, s.favors, fav3), req('$20,000', s.money, 20000), req('Local heat under 50', s.heat.local, 49, true), { label: 'A grown member of the house with no record', ok: !!cityHallCandidate(s) }],
      costText: `$20,000 and ${fav3} favors`,
      effects: [{ type: 'money', amount: -20000 }, { type: 'favor', amount: -fav3 }, { type: 'heat', bar: 'local', amount: -10 }, { type: 'dyn', op: { op: 'decision', id: 'city_hall' } }, { type: 'dyn', op: { op: 'renown', amount: 150, reason: 'A seat at City Hall' } }],
      done: taken(s, 'city_hall') !== undefined ? 'The house has a seat at City Hall' : undefined,
    },
    {
      id: 'bank', name: 'Charter a Bank', shown: true,
      text: 'A state bank charter through a clean front man. A bank washes almost anything. (The existing bank charter order.)',
      reqs: bankChecklist(s).map((r) => ({ label: r.label, ok: r.ok })),
      costText: `$${BANK_COST.toLocaleString('en-US')} and a favor`,
      effects: [],
      link: { kind: 'charterBank' },
      done: s.goals.bankWeek !== undefined ? 'The bank is chartered' : undefined,
    },
    {
      id: 'florida', name: 'Retire to Florida', shown: true,
      text: 'Hand the chair to your heir while you can still enjoy the sun in Hallandale. The house goes on; you stay alive to give advice nobody takes.',
      reqs: [{ label: 'Aged 55+, or in poor health (under 50)', ok: ageOn(boss.birth, s.date) >= 55 || boss.health < 50 }, { label: `A grown heir${heir ? ` (${heir.firstName})` : ''}`, ok: !!heir && ageOn(heir.birth, s.date) >= 18 }, { label: 'Two years since the last boss retired', ok: taken(s, 'florida') === undefined || s.week - (taken(s, 'florida') ?? 0) >= 104 }],
      costText: 'Your chair',
      effects: [{ type: 'dyn', op: { op: 'abdicate' } }, { type: 'respect', amount: 4, label: 'A graceful exit' }],
    },
    {
      id: 'legit', name: 'Move the Family Legit', shown: true,
      text: 'Fronts become the business. The old-timers say you have gone soft; the IRS stops returning your lawyer\'s calls.',
      reqs: [req('Own 4 legitimate fronts', fronts(s), 4), req('Dirty cash under $5,000', Math.round(s.unwashed), 5000, true), req('Federal heat under 30', s.heat.federal, 29, true), req('$50,000', s.money, 50000)],
      costText: '$50,000 into the legitimate books',
      effects: [{ type: 'money', amount: -50000 }, { type: 'heat', bar: 'federal', amount: -20 }, { type: 'respect', amount: -5 }, { type: 'crewOpinion', amount: -4, reason: 'Gone soft', traitMods: { Honest: 10, Greedy: -6, Cruel: -6 } }, { type: 'dyn', op: { op: 'decision', id: 'legit' } }, { type: 'dyn', op: { op: 'renown', amount: 200, reason: 'Moved the family legit' } }],
      done: taken(s, 'legit') !== undefined ? 'The family is legit (on paper)' : undefined,
    },
    {
      id: 'festival', name: 'Found a Parish Festival', shown: true,
      text: 'The Feast of Our Lady on the boardwalk: zeppole, a procession, the statue with dollar bills pinned to her robe. The whole parish remembers who paid.',
      reqs: [req('$5,000', s.money, 5000), { label: 'In the season (Memorial Day to Labor Day)', ok: isInSeason(s.date) }],
      costText: '$5,000 (once a year)',
      effects: [{ type: 'money', amount: -5000 }, { type: 'respect', amount: 4 }, { type: 'heat', bar: 'local', amount: -8 }, { type: 'familyOpinion', amount: 8, reason: 'The festival' }, { type: 'dyn', op: { op: 'decision', id: 'festival' } }, { type: 'dyn', op: { op: 'renown', amount: 60, reason: 'Founded the parish festival' } }],
      done: taken(s, 'festival') !== undefined && s.week - taken(s, 'festival')! < 52 ? 'Held this year — again next season' : undefined,
    },
    {
      id: 'monument', name: 'Build a Monument', shown: true,
      text: 'Put the family name in stone: a new wing for St. Ann\'s, or a hospital wing at Burdette Tomlin. Long after the rackets, the name stays on the wall.',
      reqs: [req('$40,000', s.money, 40000), req('Respect 50', s.respect, 50)],
      costText: '$40,000',
      options: [{ id: 'church', label: 'A wing for St. Ann\'s' }, { id: 'hospital', label: 'A hospital wing at Burdette Tomlin' }],
      effects: [{ type: 'money', amount: -40000 }, { type: 'respect', amount: 6 }, { type: 'heat', bar: 'local', amount: -10 }, { type: 'dyn', op: { op: 'decision', id: 'monument' } }, { type: 'dyn', op: { op: 'renown', amount: 250, reason: 'Built a monument' } }],
      done: taken(s, 'monument') !== undefined ? 'The family name is on the wall' : undefined,
    },
    {
      id: 'break_philly', name: 'Break from Philadelphia', shown: true,
      text: 'No more envelopes in the Buick. The shore answers to the house alone. Philadelphia will come with everything it has.',
      reqs: [req('Respect 60', s.respect, 60), req('Hold 5 districts (50%+)', districtsHeld(s), 5), req('14 free men in the crew', muscle, 14), req('3 capos', capos(s).length, 3)],
      costText: 'War with Philadelphia',
      risky: 'Very risky: a war with Philadelphia\'s muscle, a blood feud, and the Table against you. Win it and the tribute stops for good.',
      effects: [{ type: 'heat', bar: 'family', amount: 30 }, { type: 'dyn', op: { op: 'decision', id: 'break_philly' } }],
      done: s.flags.brokeFromPhilly ? 'The house answers to no one' : undefined,
    },
    {
      id: 'casino', name: 'Take the Casino Dream', shown: reached(s, 'referendum1976'),
      text: `The voters said yes. ${casinoStatus(s)} (The existing casino order.)`,
      reqs: [{ label: 'The 1976 casino referendum passed', ok: reached(s, 'referendum1976') }, { label: 'Hold options on Atlantic City land', ok: s.goals.casinoStage >= 1 }, { label: 'A clean front man', ok: !!s.frontManId }],
      costText: 'See the casino order',
      effects: [],
      link: { kind: 'casino' },
      done: s.goals.casinoStage >= 2 ? 'The license is in motion' : undefined,
    },
  ];
  return views;
}

/** A grown member of the house with a clean record to sit on the commission. */
export function cityHallCandidate(s: GameState) {
  const all = Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== s.playerId && ageOn(c.birth, s.date) >= 25 && (c.record ?? 0) === 0 && (c.rank === 'civilian'));
  return all.sort((a, b) => b.attributes.diplomacy - a.attributes.diplomacy)[0];
}

export function decisionBlock(_s: GameState, v: DecisionView): string | undefined {
  if (!v.shown) return 'Not yet possible';
  if (v.done) return v.done;
  if (v.link) return undefined;
  const miss = v.reqs.find((r) => !r.ok);
  return miss ? `Requires: ${miss.label}` : undefined;
}

export function decisionView(s: GameState, id: DecisionId): DecisionView | undefined {
  return decisionViews(s).find((v) => v.id === id);
}

export function decisionProgress(v: DecisionView): number {
  if (!v.reqs.length) return 0;
  const part = (r: Requirement) => {
    if (r.ok) return 1;
    if (!r.need) return 0;
    const f = r.invert ? r.need / Math.max(1, r.have ?? 0) : (r.have ?? 0) / r.need;
    return Math.max(0, Math.min(1, f)) * 0.9;
  };
  return v.reqs.reduce((a, r) => a + part(r), 0) / v.reqs.length;
}

export { displayName, ensureDynState };
