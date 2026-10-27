import type { ActionPreview } from '../engine/actions';
import type { PlayerAction } from '../engine/types';

/**
 * The button word for an action ("Buy", "Order the hit", "Bribe") and the
 * word shown once it is set for this week ("Buying"). "Order" alone told the
 * player nothing; every action now says what it actually does.
 */
export interface Verb {
  /** Button text before clicking. */
  verb: string;
  /** Short state after clicking, e.g. "Buying ✓". */
  done: string;
}

const v = (verb: string, done: string): Verb => ({ verb, done: `${done} ✓` });

const INTERACT: Record<string, Verb> = {
  gift_small: v('Send a gift', 'Gift going'),
  gift_large: v('Send a big gift', 'Gift going'),
  demand: v('Demand', 'Demanding'),
  threaten: v('Threaten', 'Threatening'),
  recruit: v('Recruit', 'Recruiting'),
  favor: v('Ask a favor', 'Asking'),
  dinner: v('Invite to dinner', 'Dinner set'),
  promote: v('Promote', 'Promoting'),
  demote: v('Demote', 'Demoting'),
  exile: v('Send away', 'Sending away'),
  make: v('Make him', 'Ceremony set'),
  whack: v('Order the hit', 'Hit ordered'),
  bringIn: v('Bring him in', 'Bringing in'),
  bribe: v('Bribe', 'Bribing'),
  expose: v('Expose', 'Exposing'),
  court: v('Court', 'Courting'),
  affair: v('Start an affair', 'Affair begun'),
  endRomance: v('End it', 'Ending it'),
  proposeMarriage: v('Propose', 'Proposing'),
  separate: v('Separate', 'Separating'),
};

const SCHEME: Record<string, Verb> = {
  murder: v('Plan the hit', 'Hit planned'),
  claim: v('Start the claim', 'Claim started'),
  blackmail: v('Start the squeeze', 'Squeeze started'),
  informant: v('Plant an informant', 'Informant planted'),
  heist: v('Plan the score', 'Score planned'),
  envoy: v('Send an envoy', 'Envoy sent'),
  befriend: v('Befriend', 'Befriending'),
  sway: v('Win him over', 'Working on him'),
  flip: v('Flip him', 'Flipping'),
  frame: v('Frame him', 'Frame started'),
};

const ORDER: Record<string, Verb> = {
  shakedown: v('Shake them down', 'Shakedown on'),
  expand: v('Move in', 'Moving in'),
  laylow: v('Lay low', 'Laying low'),
  parish: v('Give to the parish', 'Giving'),
  cops: v('Pay the cops', 'Cops paid'),
  business: v('Open it', 'Opening'),
  hitback: v('Hit back', 'Hitting back'),
  shylock: v('Put money on the street', 'Lending'),
  clambake: v('Throw the clambake', 'Clambake set'),
  gift: v('Send a gift', 'Gift going'),
  recruit: v('Recruit', 'Recruiting'),
  kessler: v('Lean on Kessler', 'Leaning on Kessler'),
  launder: v('Wash the money', 'Washing'),
};

const ECON: Record<string, Verb> = {
  upgrade: v('Upgrade', 'Upgrading'),
  collect: v('Give the order', 'Ordered'),
  buyLot: v('Buy the lot', 'Buying'),
  leaseLot: v('Lease the lot', 'Leasing'),
  build: v('Build', 'Building'),
  renovate: v('Renovate', 'Renovating'),
  sellLot: v('Sell', 'Selling'),
  permits: v('File for permits', 'Permits filed'),
  manager: v('Hire the manager', 'Hiring'),
  oversight: v('Check the books', 'Checking'),
  audit: v('Audit', 'Auditing'),
  assistant: v('Hire', 'Hiring'),
  hq: v('Set up headquarters', 'Setting up'),
  sweep: v('Sweep for bugs', 'Sweeping'),
  gift: v('Send a gift', 'Gift going'),
  project: v('Fund it', 'Funding'),
  car: v('Buy the car', 'Buying'),
  property: v('Buy', 'Buying'),
  job: v('Give him the job', 'Job given'),
  invite: v('Invite', 'Invited'),
  introduce: v('Introduce', 'Introducing'),
};

const POL: Record<string, Verb> = {
  cultivate: v('Cultivate', 'Cultivating'),
  payroll: v('Put on the payroll', 'On the payroll'),
  dig: v('Dig up dirt', 'Digging'),
  coerce: v('Lean on him', 'Leaning'),
  favor: v('Call in a favor', 'Calling in'),
  fund: v('Fund the campaign', 'Funding'),
  endorse: v('Endorse', 'Endorsing'),
  bribe: v('Bribe', 'Bribing'),
  lobby: v('Lobby', 'Lobbying'),
  propose: v('Propose', 'Proposing'),
  enter: v('Run for office', 'Running'),
  declare: v('Declare', 'Declaring'),
  recruit: v('Recruit', 'Recruiting'),
  appoint: v('Appoint', 'Appointing'),
  pardon: v('Get the pardon', 'Pardon sought'),
};

const TRAVEL: Record<string, Verb> = {
  trip: v('Book the trip', 'Trip booked'),
  cancel: v('Cancel the trip', 'Cancelling'),
  recall: v('Call them home', 'Calling home'),
  flee: v('Run', 'Running'),
  surrender: v('Turn yourself in', 'Surrendering'),
  comeHome: v('Come home', 'Coming home'),
  hide: v('Go to ground', 'Hiding'),
};

function op(a: { op?: unknown }): string {
  const o = a.op as { type?: string; op?: string } | string | undefined;
  if (typeof o === 'string') return o;
  return o?.type ?? o?.op ?? '';
}

export function actionVerb(a: PlayerAction): Verb {
  switch (a.kind) {
    case 'buyBusiness': return v('Buy', 'Buying');
    case 'sellBusiness': return v('Sell', 'Selling');
    case 'lend': return v('Lend', 'Lending');
    case 'findFrontMan': return v('Find a front man', 'Looking');
    case 'charterBank': return v('Charter the bank', 'Chartering');
    case 'casino': return a.sell ? v('Sell the casino', 'Selling') : v('Buy in', 'Buying in');
    case 'interact': return INTERACT[a.id] ?? v('Do it', 'Set');
    case 'scheme': return SCHEME[a.scheme] ?? v('Start the plan', 'Plan started');
    case 'cancelScheme': return v('Call it off', 'Calling off');
    case 'declareWar': return v('Go to war', 'War declared');
    case 'raid': return v('Hit their spot', 'Raid ordered');
    case 'terms': return v('Offer terms', 'Terms offered');
    case 'raiseDispute': return v('Take it to the Table', 'Raised');
    case 'lobby': return v('Lobby him', 'Lobbying');
    case 'askPermission': return v('Ask permission', 'Asking');
    case 'pushDistrict': return v('Push in', 'Pushing in');
    case 'appoint': return v('Appoint', 'Appointing');
    case 'councilTask': return v('Give the job', 'Job given');
    case 'policy': return v('Set the rule', 'Rule set');
    case 'contract': return v('Set his cut', 'Cut set');
    case 'edict': return a.on ? v('Lay down the law', 'Law set') : v('Lift it', 'Lifting');
    case 'hire': return v('Hire', 'Hiring');
    case 'lifestyle': return v('Live this life', 'Switching');
    case 'legal': return a.op === 'retainer' ? v('Retain the lawyer', 'Retained') : v('Lie low', 'Lying low');
    case 'underbelly': return v('Make the move', 'Moving');
    case 'officeHours': return v('Hold office hours', 'Office hours set');
    case 'perk': return v('Learn', 'Learning');
    case 'reassign': return v('Move him', 'Moving him');
    case 'propose': return v('Put him up', 'Proposed');
    case 'background': return v('Check him out', 'Checking');
    case 'order': return ORDER[a.key] ?? v('Give the order', 'Ordered');
    case 'econ': {
      if (a.op.type === 'racket') return a.op.cmd.c === 'start' ? v('Start it', 'Starting') : a.op.cmd.c === 'earner' ? (a.op.cmd.bizId ? v('Give it to him', 'Given') : v('Take it back', 'Taken back')) : a.op.cmd.c === 'advice' ? v('Take the advice', 'Advice taken') : v('Set it', 'Set');
      return ECON[op(a)] ?? v('Do it', 'Set');
    }
    case 'pol': return POL[op(a)] ?? v('Make the move', 'Moving');
    case 'travel': return TRAVEL[op(a)] ?? v('Go', 'Going');
    case 'ears': {
      const o = a.op.op;
      if (o === 'ask') return v('Ask her', 'Asked');
      if (o === 'retain') return v('Take care of her', 'Envelope sent');
      if (o === 'protect') return v('Protect her', 'Protected');
      if (o === 'madamCall') return v('Pay a call', 'Calling');
      if (o === 'madamFavor') return v('Call in the favor', 'Asked');
      if (o === 'opRunoff') return v('Run him off', 'Moving');
      if (o === 'opExpose') return v('Expose him', 'Exposing');
      return v('Propose it', 'Proposed');
    }
    case 'bones': {
      const o = a.op as { op: string; kind?: string };
      if (o.op === 'assign') return o.kind === 'hit' ? v('Give him the hit', 'Hit assigned') : o.kind === 'heist' ? v('Send him on the score', 'Sent') : v('Send him to collect', 'Sent');
      return v('Do him a favor', 'Favor done');
    }
    case 'dynasty': {
      const t = op(a);
      if (t === 'marry') return v('Arrange the marriage', 'Arranged');
      if (t === 'alliance') return v('Make the alliance', 'Allying');
      if (t === 'breakAlliance') return v('Break it off', 'Breaking');
      return v('Do it', 'Set');
    }
    case 'hood': return v('Restyle it', 'Restyling');
    case 'dirty': return a.op.job === 'shakedown' ? v('Shake them down', 'Shakedown on') : v('Do it', 'Job on');
    case 'talk': return a.op.t === 'answer' ? (a.op.yes ? v('Take it', 'Taking it') : v('Turn it down', 'Turning down')) : v('Ask him', 'Asked');
    case 'mission': return v('Do it', 'Decided');
    case 'power': {
      const t = op(a);
      if (t === 'designate') return v('Name the heir', 'Heir named');
      if (t === 'groom') return v('Groom him', 'Grooming');
      if (t === 'bodyguards') return v('Hire bodyguards', 'Hiring');
      if (t === 'mattresses') return v('Go to the mattresses', 'Mattresses');
      if (t === 'takeover') return v('Take over', 'Taking over');
      return v('Make the move', 'Moving');
    }
    default: return v('Do it', 'Set');
  }
}

/**
 * The button words for one action: the preview's own verb when it names the
 * thing exactly ("Hire runners — $300"), else the generic verb for the kind.
 */
export function verbOf(a: PlayerAction, p?: Pick<ActionPreview, 'verb'>): Verb {
  const base = actionVerb(a);
  return p?.verb ? { verb: p.verb, done: base.done } : base;
}

/** The same order, whoever approved its funding (for "is it queued?" checks). */
export function sameOrder(a: PlayerAction, b: PlayerAction): boolean {
  const strip = (x: PlayerAction) => JSON.stringify({ ...x, fund: undefined });
  return strip(a) === strip(b);
}
