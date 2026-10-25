import { bonesOdds, JOB_INFO } from './bones';
import { capos, hasTrait, player } from './characters';
import { fam } from './familyState';
import { capability, challengePressure } from './heir';
import { MODE_INFO } from './ledgerbook';
import { EARS_PURPOSE } from './ears';
import { controlIndex } from './polIntegrity';
import { peekCtl } from './polGov';
import { pwView } from './powerState';
import { opinion } from './relations';
import { skimRate } from './economy';
import { activeRomances } from './romance';
import { quoteTrip } from './travel';
import type { Risk } from './advice';
import type { GameState, PlayerAction } from './types';

/**
 * The "why" for the newer pillars (power, politics, travel, bones, the
 * books, the law, the underbelly, romance): one-line purposes, what each
 * order sets up, when it is best done, and a rough value for the verdict.
 * advice.ts falls back to these for the action kinds it does not know.
 *
 * Pure: never touches the state (only read-only views).
 */

type Cond = { text: string; met: boolean };

const POWER_PURPOSE: Record<string, string> = {
  designate: 'Settle who comes after you, so the capos stop guessing and the ambitious stop campaigning.',
  groom: 'Make the heir better at the job, quietly, before he needs it.',
  stopGrooming: 'Pull the heir back from a path that is drawing attention.',
  place: 'Put a protégé where he learns the trade and builds his own following.',
  unplace: 'Bring a protégé home before he grows too big where he is.',
  read: 'Know what a man really wants before he asks for it — or takes it.',
  promise: 'Buy time from an ambitious man with a promise. Break it and he remembers.',
  amends: 'Take the sting out of a grievance before it becomes a faction.',
  announce: 'Say the succession out loud: certainty for the crew, and a target on the heir.',
  prep: 'Get ready for a fight before it starts: a blitz is won in the preparation.',
  blitz: 'Hit a rival everywhere at once and try to end it in a night.',
  mattresses: 'Protect the leadership when a war is hot, at the price of the weekly take.',
  bodyguards: 'Make a hit on you much harder to land while the threat lasts.',
  front: 'Put another face at the head of the table so the law and the rivals look at him, not you.',
  endFront: 'End the arrangement and sit in the chair yourself again.',
  consult: 'Keep the front boss in line by being seen to consult him.',
  climb: 'Move up a station: more men, more say, more attention.',
  takeover: 'Take the family by force when the boss is weak and you are not.',
  audience: 'Hear the town\'s problems: favors owed and goodwill, for a Sunday afternoon.',
};

const POL_PURPOSE: Record<string, string> = {
  cultivate: 'Start (or warm) a personal tie: the cheapest way to make an official yours, slowly.',
  payroll: 'The fastest way to own him: a weekly envelope. The scrutiny grows with it.',
  dig: 'Find something on him: leverage that does not cost a weekly envelope.',
  coerce: 'Use what you found. It works now; he resents it forever.',
  favor: 'Spend the hold you built on him: this is what owning an official is for.',
  fund: 'Help a friendly candidate win: an officeholder who owes you.',
  endorse: 'Lend your name to a candidate: free, but your heat rubs off on him.',
  patronage: 'Jobs for his people: votes for him, obligations to you.',
  dirty: 'Tilt an election the hard way. It may come out.',
  puppet: 'Run your own man for the office: if he wins, the office is yours.',
  lobby: 'Move a bill your way in the legislature.',
  propose: 'Change the rules the island plays by.',
  enter: 'Put blood of the house on the political ladder: in twenty years, a mayor who is family.',
  groom: 'Help a political child up the next rung.',
  declare: 'Run your own child for office.',
  recruit: 'Bring a useful man from town into the crew.',
};

const TRAVEL_PURPOSE: Record<string, string> = {
  trip: 'Get away (stress down) or do business in another city. While the leader is gone, things at home drift.',
  cancel: 'Call the trip off before anyone leaves: the deposits are spent.',
  recall: 'Bring them home early: something here needs them more.',
  flee: 'Get out before the indictment comes down. A fugitive cannot be tried — but cannot run the family well either.',
  surrender: 'Turn yourself in: the judge sees it, and the running ends.',
  comeHome: 'Come home from hiding and face what is waiting.',
  exile: 'Stay away for good: safe, and forgotten.',
  hide: 'Go deeper underground: harder to find, harder to reach.',
};

const LEDGER_PURPOSE: Record<string, string> = {
  mode: 'Choose between catching skimmers and leaving evidence: the better the books, the more a raid finds.',
  keeper: 'The bookkeeper decides how much of the skimming you see — and what the FBI gets if he is pinched.',
  check: 'Verify a man\'s report of a job before you trust (or pay) him.',
  confront: 'Make a skimmer pay it back: money and fear, and a capo who resents it.',
  forgive: 'Let a short envelope go: goodwill, and the others notice.',
};

const OTHER_PURPOSE: Record<string, string> = {
  'bones:assign': 'A man is made only after he does something for this thing of ours: give him the job.',
  'bones:favor': 'Get him made without the job, as a favor: quick, and the old-timers resent it.',
  'legal:retainer': 'A good lawyer working before you are charged: the defense is stronger at trial.',
  'legal:lielow': 'Starve the case of new evidence for a while, at the price of business.',
  'underbelly:investigate': 'Find out who is running the dirty trade so you can end it.',
  'underbelly:expose': 'End it the clean way: the law does the work, the town thanks you.',
  'underbelly:runout': 'End it your way: quick, and noticed.',
  'underbelly:ally': 'Get a rival to help: for once you want the same thing.',
  officeHours: 'Hear the island\'s problems: goodwill, favors owed, sometimes a lead.',
};

/** Purposes for romance interactions (merged into advice.ts's interaction table). */
export const ROMANCE_PURPOSE: Record<string, string> = {
  court: 'A courtship in the open: if it goes well, a marriage and an alliance of houses. Only if the other adult wants it too.',
  affair: 'A secret romance, if both want it. Secrets on this island get out: a spouse, a priest, a rival with a camera.',
  proposeMarriage: 'Make it official: a wedding the family can celebrate, if the answer is yes.',
  endRomance: 'End it cleanly before it is found out — or before it hurts someone more.',
  separate: 'End a marriage that has stopped working. In 1960 the parish and the in-laws will talk.',
};

function opOf(a: PlayerAction): string | undefined {
  switch (a.kind) {
    case 'power': return a.op.op;
    case 'pol': return a.op.op;
    case 'travel': return a.op.type;
    case 'ledger': return a.op.op;
    case 'bones': return a.op.op;
    case 'ears': return a.op.op;
    case 'legal':
    case 'underbelly': return a.op;
    default: return undefined;
  }
}

/** One line: why you would do it. Undefined for kinds advice.ts handles itself. */
export function pillarPurpose(a: PlayerAction): string | undefined {
  const op = opOf(a);
  switch (a.kind) {
    case 'power': return op ? POWER_PURPOSE[op] : undefined;
    case 'pol': return op ? POL_PURPOSE[op] : undefined;
    case 'travel': return op ? TRAVEL_PURPOSE[op] : undefined;
    case 'ledger': return op ? LEDGER_PURPOSE[op] : undefined;
    case 'ears': return op ? EARS_PURPOSE[op] : undefined;
    case 'bones':
    case 'legal':
    case 'underbelly': return OTHER_PURPOSE[`${a.kind}:${op}`];
    case 'officeHours': return OTHER_PURPOSE.officeHours;
    default: return undefined;
  }
}

/** What the order sets up. */
export function pillarUnlocks(_s: GameState, a: PlayerAction): string[] {
  switch (a.kind) {
    case 'power':
      if (a.op.op === 'read') return ['Shows his hidden ambition: whether a promise will hold him'];
      if (a.op.op === 'designate') return ['The capos know whom to follow if you fall'];
      if (a.op.op === 'groom') return ['Skills for the heir, before he needs them'];
      if (a.op.op === 'prep') return ['A blitz lands harder (and one against you less)'];
      return [];
    case 'pol': {
      const o = a.op;
      if (o.op === 'cultivate' || o.op === 'payroll' || o.op === 'coerce') return ['At control 40+ he does favors: permits, a quiet word, a dropped case'];
      if (o.op === 'dig') return ['Something on him: you can lean on him instead of paying'];
      if (o.op === 'fund' || o.op === 'puppet' || o.op === 'patronage') return ['If he wins, an officeholder who owes you'];
      if (o.op === 'enter') return ['A political career for the house: council, mayor, Trenton'];
      return [];
    }
    case 'bones': return a.op.op === 'assign' || a.op.op === 'favor' ? ['Once he has his bones he can be proposed for membership'] : [];
    case 'ledger': return a.op.op === 'keeper' || a.op.op === 'mode' ? ['Decides which skimmers the books catch'] : [];
    case 'travel': return a.op.type === 'trip' && a.op.plan.purpose === 'business' ? ['Contacts in another city'] : [];
    case 'interact':
      if (a.id === 'court') return ['A marriage, if it goes well'];
      if (a.id === 'proposeMarriage') return ['A wedding: in-laws and an alliance'];
      return [];
    default: return [];
  }
}

/** When it is best done (✓ met / ○ not yet). */
export function pillarBestWhen(s: GameState, a: PlayerAction): Cond[] {
  const boss = player(s);
  switch (a.kind) {
    case 'power': {
      const o = a.op;
      if (o.op === 'designate' && o.charId) {
        const c = s.characters[o.charId];
        if (!c) return [];
        const cap = capability(s, c).score;
        const pr = challengePressure(s, c).score;
        return [
          { text: `He would make a good boss (capability ${Math.round(cap)}, 50+)`, met: cap >= 50 },
          { text: `He is not pushing for the chair yet (pressure ${Math.round(pr)}, under 50)`, met: pr < 50 },
        ];
      }
      if (o.op === 'read') return [{ text: 'His ambition is still hidden', met: !pwView(s).ambitions[o.charId]?.revealed }];
      if (o.op === 'promise') {
        const c = s.characters[o.charId];
        return c ? [{ text: 'He is pushing hard (pressure 40+)', met: challengePressure(s, c).score >= 40 }] : [];
      }
      if (o.op === 'mattresses' || o.op === 'bodyguards' || o.op === 'prep') {
        const plot = s.schemes.some((x) => x.owner !== 'player' && x.discovered && x.targetId === boss.id);
        return [{ text: 'A war or a known plot against you', met: plot || s.wars.length > 0 }];
      }
      return [];
    }
    case 'pol': {
      const o = a.op;
      if (!('id' in o)) return [];
      const p = s.pol?.people[o.id];
      const c = p ? peekCtl(s, p.id) : undefined;
      const idx = c ? controlIndex(c) : 0;
      if (!p) return [];
      if (o.op === 'cultivate') return [{ text: `His integrity is not high (${p.integrity}, under 60)`, met: p.integrity < 60 }, { text: 'You do not own him yet (control under 40)', met: idx < 40 }];
      if (o.op === 'payroll') return [{ text: `He takes envelopes (integrity ${p.integrity}, under 50)`, met: p.integrity < 50 }, { text: 'Low scrutiny on him (under 30)', met: (c?.exposure ?? 0) < 30 }];
      if (o.op === 'favor') return [{ text: `You own him (control ${idx}, 40+)`, met: idx >= 40 }, { text: 'Low scrutiny on him (under 30)', met: (c?.exposure ?? 0) < 30 }];
      if (o.op === 'dig') return [{ text: 'He will not take your money (integrity 60+)', met: p.integrity >= 60 }];
      return [];
    }
    case 'travel': {
      if (a.op.type !== 'trip') return [];
      const L = s.characters[a.op.plan.leaderId];
      const stress = L ? fam(s, L.id).stress : 0;
      const quiet = !s.wars.length && !s.schemes.some((x) => x.owner !== 'player' && x.discovered && x.targetId === s.playerId);
      const out: Cond[] = [{ text: 'No war or known plot at home', met: quiet }];
      if (a.op.plan.purpose === 'vacation') out.unshift({ text: `${L?.firstName ?? 'He'} needs the rest (stress ${stress}, 30+)`, met: stress >= 30 });
      if (a.op.plan.leaderId === s.playerId) out.push({ text: 'The capos are loyal (avg opinion 20+)', met: avgCapoOpinion(s) >= 20 });
      return out;
    }
    case 'ledger': {
      if (a.op.op === 'mode') {
        const skimmers = capos(s).filter((c) => skimRate(s, c) >= 0.05).length;
        const m = MODE_INFO[a.op.mode];
        return m.raid.boss > 0
          ? [{ text: skimmers ? `${skimmers} capo${skimmers > 1 ? 's look' : ' looks'} like ${skimmers > 1 ? 'they are' : 'he is'} skimming` : 'Capos you need to watch', met: skimmers > 0 }, { text: `Federal heat under 40 (now ${s.heat.federal})`, met: s.heat.federal < 40 }]
          : [{ text: `Federal heat is high (now ${s.heat.federal}, 40+)`, met: s.heat.federal >= 40 }];
      }
      if (a.op.op === 'keeper' && a.op.charId) {
        const c = s.characters[a.op.charId];
        if (!c) return [];
        return [
          { text: `Good with money (Business ${c.attributes.business}, 60+)`, met: c.attributes.business >= 60 || c.specialty === 'accountant' },
          { text: 'Not known to be greedy or a gambler', met: !hasTrait(c, 'Greedy') && !hasTrait(c, 'Gambler') },
          { text: `A thin file (${Math.round(c.evidence ?? 0)}, under 40)`, met: (c.evidence ?? 0) < 40 },
        ];
      }
      return [];
    }
    case 'bones': {
      if (a.op.op !== 'assign') return [];
      const c = s.characters[a.op.charId];
      if (!c) return [];
      const odds = bonesOdds(s, c, a.op.kind).chance;
      return [{ text: `He is likely to hold up on a ${JOB_INFO[a.op.kind].name.toLowerCase()} (${Math.round(odds * 100)}%, 60%+)`, met: odds >= 0.6 }];
    }
    case 'interact': {
      if (a.id !== 'court' && a.id !== 'affair' && a.id !== 'proposeMarriage') return [];
      const c = s.characters[a.target];
      if (!c) return [];
      const op = opinion(s, c.id, boss.id);
      const out: Cond[] = [{ text: `${c.firstName} likes you already (${op >= 0 ? '+' : ''}${op}, 20+)`, met: op >= 20 }];
      if (a.id === 'affair') out.push({ text: 'Neither of you is married', met: !boss.spouseId && !c.spouseId });
      if (a.id === 'court') out.push({ text: 'You are free to court', met: !boss.spouseId && !activeRomances(s, boss.id).length });
      return out;
    }
    default: return [];
  }
}

function avgCapoOpinion(s: GameState): number {
  const cs = capos(s);
  return cs.length ? cs.reduce((a, c) => a + opinion(s, c.id, s.playerId), 0) / cs.length : 0;
}

/** A rough dollar-equivalent of what the order sets up (only for the verdict and ranking). */
export function pillarValue(s: GameState, a: PlayerAction, chanceOk: number): number {
  switch (a.kind) {
    case 'power':
      if (a.op.op === 'read') return 600;
      if (a.op.op === 'designate') return 500;
      if (a.op.op === 'amends') return 900;
      return 0;
    case 'pol':
      if (a.op.op === 'cultivate') return 700 * chanceOk;
      if (a.op.op === 'dig') return 500;
      return 0;
    case 'bones': return a.op.op === 'assign' ? 1500 * chanceOk : 0;
    case 'ledger': return a.op.op === 'check' ? 400 : 0;
    case 'travel': {
      if (a.op.type !== 'trip') return 0;
      const L = s.characters[a.op.plan.leaderId];
      return L && a.op.plan.purpose === 'vacation' ? Math.max(0, fam(s, L.id).stress - 20) * 60 : 0;
    }
    default: return 0;
  }
}

/**
 * Risks with their real odds, for orders whose preview only carries them in
 * its warning text. Returns undefined when advice.ts should use the warning.
 */
export function pillarRisks(s: GameState, a: PlayerAction): Risk[] | undefined {
  if (a.kind === 'travel' && a.op.type === 'trip') {
    const q = quoteTrip(s, a.op.plan);
    const sev = (x: number): Risk['severity'] => (x >= 0.25 ? 'high' : x >= 0.08 ? 'mid' : 'low');
    const out: Risk[] = [];
    const add = (chance: number, text: string, source: string) => { if (chance >= 0.01) out.push({ text, chance, source, severity: sev(chance) }); };
    add(q.risks.sighting, 'the Feds see who he meets', `${a.op.plan.mode} and ${a.op.plan.guests.length} guest${a.op.plan.guests.length === 1 ? '' : 's'}`);
    add(q.risks.tail, 'he is tailed', 'How conspicuous the trip is');
    add(q.risks.accident, 'an accident on the way', 'How they travel');
    add(q.risks.discovery, 'the wife finds out', 'The companion on the trip');
    if (a.op.plan.leaderId === s.playerId) out.push({ text: 'the capos get ideas while you are gone; orders go through the chain', chance: 1, source: 'The boss away', severity: 'mid' });
    return out;
  }
  if (a.kind === 'bones' && a.op.op === 'assign') {
    const c = s.characters[a.op.charId];
    if (!c) return undefined;
    const o = bonesOdds(s, c, a.op.kind);
    const out: Risk[] = [{ text: 'he freezes or fails: no bones', chance: 1 - o.chance, source: 'His odds on the job', severity: o.chance < 0.5 ? 'high' : o.chance < 0.7 ? 'mid' : 'low' }];
    if (o.hot >= 0.1) out.push({ text: 'he goes too far: heat and a body nobody wanted', chance: o.hot, source: 'Impulsiveness', severity: o.hot >= 0.35 ? 'high' : 'mid' });
    if (o.talk >= 0.1) out.push({ text: 'he talks about it after: evidence', chance: o.talk, source: 'Discretion', severity: o.talk >= 0.35 ? 'high' : 'mid' });
    return out;
  }
  return undefined;
}
