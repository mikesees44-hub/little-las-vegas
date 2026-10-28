import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, player } from './characters';
import { herDecision } from './dating';
import { adultOn, datingEvenings, ensureDating } from './datingState';
import { applyEffects } from './effects';
import { addOpinion, opinion } from './relations';
import { kin } from './romance';
import { spendPocket } from './pocket';
import { roundSlots } from './rounds';
import { hashSeed } from './rng';
import { addSecret } from './secrets';
import { askingPrice, eveningKindOf, floorPrice } from './evening';
import type { NightlifeState } from './nightlifeState';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Ctx } from './ledger';
import type { NightOp } from './nightlife';
import type { Character, Effect, FactionId, GameState } from './types';

/**
 * TWO QUICK THINGS AT THE CLUB (non-explicit, period voice, one-line
 * reports that fade; adults only; she decides; mature content Off: neither
 * is offered):
 *
 *  - "Step outside to my car": a professional (she names her price; the
 *    haggle is the same as the evening's) or a willing date. Half an hour or
 *    so, cheap, a little stress off, no attachment. She can say no or laugh
 *    it off. A beat cop's flashlight, a rival's man in the lot, gossip, and
 *    in February a cold car.
 *  - "A bold offer": lean over and flash cash ($100, $250 or $500) for
 *    something discreet, right there. She takes it, ups it, laughs it off,
 *    or is insulted and walks (a drink in your face is possible), more so if
 *    she is not a professional or you have been rude. The manager, your
 *    crew, a rival's man or a vice cop may be watching; if you were
 *    courting her, it costs you.
 */

export const CAR_HOURS = 0.75;
export const BOLD_HOURS = 0.5;
export const BOLD_AMOUNTS = [100, 250, 500, 750, 1000] as const;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const NX = (op: NightOp, label: string): Effect => ({ type: 'nightlife', op, label }) as Effect;
const roll = (k: string) => (hashSeed(k) % 100003) / 100003;
const adult = (s: GameState, c: Character | undefined): c is Character => !!c && ageOn(c.birth, s.date) >= 18;

function nlog(N: NightlifeState, s: GameState, text: string): void {
  N.log.push([s.week, text]);
  if (N.log.length > 60) N.log.splice(0, N.log.length - 60);
}

function baseBlock(s: GameState, c: Character | undefined): string | undefined {
  const boss = player(s);
  if (!adultOn(s)) return 'Mature content is Off in Settings';
  if (!c || !adult(s, c) || !adult(s, boss)) return 'Adults only';
  if (c.id === boss.id || c.id === boss.spouseId || kin(boss, c)) return 'Not her';
  if (!c.alive || !isFree(s, c)) return `${c.firstName} is not here`;
  if (!boss.alive || !isFree(s, boss)) return 'You are not free';
  return undefined;
}

const isPro = (s: GameState, id: string) => eveningKindOf(s, id) === 'paid';
const courting = (s: GameState, id: string) => { const b = s.dating?.bonds[id]; return !!b && !b.ended && b.dates > 0 && !(b.pro && b.pro > s.week); };
const atClub = (s: GameState, id: string) => { const p = s.nightlife?.people[id]; return !!p && p.status === 'active' && ['dancer', 'singer', 'barfly', 'date', 'escort', 'callgirl', 'street'].includes(p.role); };
const winter = (s: GameState) => [12, 1, 2, 3].includes(s.date.m);

/* ---------------- The car ---------------- */

export function carBlock(s: GameState, id: string, price?: number): string | undefined {
  const c = s.characters[id];
  const b = baseBlock(s, c);
  if (b) return b;
  const pro = isPro(s, id);
  if (!pro && !courting(s, id) && !s.nightlife?.goomars[id]) return `${c!.firstName} isn't someone you could ask that`;
  if (pro && price === undefined) return 'Agree her price first';
  if (roundSlots(s).slots - datingEvenings(s) <= 0) return 'No evenings left this week';
  return undefined;
}

export function carAcceptance(s: GameState, c: Character, price?: number): Acceptance {
  const boss = player(s);
  const p = s.nightlife?.people[c.id];
  if (p?.bounds.includes('no_married') && boss.spouseId) return { chance: 0, reasons: [{ label: 'Will not get involved with a married man', value: -100 }] };
  const reasons: Reason[] = [];
  let base: number;
  if (isPro(s, c.id)) {
    if ((price ?? 0) < floorPrice(s, c.id, 'car')) return { chance: 0, reasons: [{ label: 'That is not her price', value: -100 }] };
    base = p?.role === 'escort' ? 40 : 75;
    if (p?.role === 'escort') reasons.push({ label: 'An escort, in a car? Not her style', value: 0 });
  } else {
    base = Math.round(herDecision(s, c, 'date').chance * 60);
    reasons.push({ label: 'In a car? She may laugh', value: 0 });
  }
  const op = opinion(s, c.id, boss.id);
  if (op) reasons.push({ label: op > 0 ? 'Thinks well of you' : 'Thinks little of you', value: Math.round(op * 0.3) });
  if (winter(s)) reasons.push({ label: 'A cold car', value: -10 });
  if (hasTrait(boss, 'Cruel')) reasons.push({ label: 'People say you can be cruel', value: -25 });
  const sum = reasons.reduce((x, r) => x + r.value, base);
  return { chance: Math.max(0.05, Math.min(0.9, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

export function previewCar(s: GameState, id: string, price?: number): ActionPreview {
  const c = s.characters[id];
  const pro = isPro(s, id);
  const fee = pro ? price ?? askingPrice(s, id, 'car').price : 0;
  const block = carBlock(s, id, pro ? fee : undefined);
  return {
    title: `"Step outside to my car" with ${c?.firstName ?? 'her'}`, effects: c ? [...(fee ? [{ type: 'money', pot: 'pocket', amount: -fee, label: `A few minutes with ${c.firstName}` } as Effect] : []), NX({ op: 'car', id, price: fee || undefined }, `Out to the car with ${c.firstName}`)] : [],
    cost: fee, pot: 'pocket', because: `stepped outside with ${c?.firstName ?? 'her'}`, category: 'event',
    detail: `${c ? displayName(c) : ''}. Half an hour or so, out in the lot.${pro ? ` Her price: ${$(fee)} from your pocket (she named it; you can haggle in the evening planner).` : ' Not paid: a date who might say yes, or laugh.'} A little stress off you, no attachment. She can say no, and then nothing is paid. Takes one of your evenings (about ${CAR_HOURS * 60} minutes).`,
    acceptance: block || !c ? undefined : carAcceptance(s, c, fee || undefined),
    refuseEffects: [NX({ op: 'refused', id, what: 'the car' }, `${c?.firstName ?? 'She'} laughed it off`)],
    warning: `What can go wrong: a beat cop's flashlight; a rival's man in the lot; gossip${winter(s) ? '; it is a cold car this time of year' : ''}.`,
    disabledReason: block, verb: `Ask ${c?.firstName ?? 'her'}${fee ? ` — ${$(fee)}` : ''}`,
  };
}

export function applyCar(ctx: Ctx, N: NightlifeState, id: string, price?: number): void {
  const s = ctx.s;
  const c = s.characters[id];
  const boss = player(s);
  if (carBlock(s, id, price) || !c) return;
  const D = ensureDating(s);
  if (D.evenings.week !== s.week) D.evenings = { week: s.week, n: 0 };
  D.evenings.n++;
  const pr = D.providers[id];
  if (pr && price) pr.visits = [...pr.visits.filter((w) => s.week - w < 52), s.week];
  const key = `${s.seed}|${s.week}|car|${id}`;
  const lines = [`You and ${c.firstName} stepped outside to your car. Twenty minutes later you were back at the bar.`];
  if (winter(s)) lines.push('February in a Buick: never again.');
  if (s.dyn) applyEffects(ctx, [{ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: -4, source: 'domestic' }, label: 'A few minutes away' } as Effect], { label: 'A few minutes away', because: 'stepped outside', category: 'event' });
  if (roll(`${key}|cop`) < 0.08) { applyEffects(ctx, [{ type: 'heat', bar: 'local', amount: 1, label: 'A beat cop\'s flashlight' }], { label: 'A flashlight', because: 'stepped outside', category: 'event' }); lines.push('A beat cop\'s flashlight on the window; he knew whose car it was.'); }
  if (roll(`${key}|rival`) < 0.06) { const rv = s.rivals.find((x) => x.kind === 'mob'); if (rv) { const sec = addSecret(s, boss, 'affair', [rv.id as FactionId]); if (!sec.knownBy.includes(rv.id as FactionId)) sec.knownBy.push(rv.id as FactionId); lines.push(`One of the ${rv.shortName} men was smoking in the lot.`); } }
  if (roll(`${key}|gossip`) < 0.15) D.rumors.push({ week: s.week, text: `The boss stepped out to his car with ${c.firstName} ${c.lastName}.`, about: boss.id, heard: ['island'], true: true });
  const line = lines.join(' ');
  nlog(N, s, line);
  ctx.log.push(line);
}

/* ---------------- The bold offer (and raising it) ---------------- */

/** The pocket: what a bold offer can go up to. */
export function pocketOf(s: GameState): number {
  return Math.max(0, Math.round(s.tribute?.acct.personal ?? 0));
}

/** She is someone a bold offer could even be made to (at the club, or a woman you have been seeing). */
export function boldEligible(s: GameState, id: string): boolean {
  return !baseBlock(s, s.characters[id]) && (atClub(s, id) || courting(s, id));
}

export function boldBlock(s: GameState, id: string, amount: number): string | undefined {
  const c = s.characters[id];
  const b = baseBlock(s, c);
  if (b) return b;
  if (!atClub(s, id) && !courting(s, id)) return `${c!.firstName} isn't at the club`;
  if (!(amount >= 100)) return 'At least $100';
  if (amount > pocketOf(s)) return `Your pocket holds ${$(pocketOf(s))}`;
  return undefined;
}

/** Some women have a line no amount crosses (her faith, her honesty, her own rule). */
export function boldLine(s: GameState, c: Character): string | undefined {
  const p = s.nightlife?.people[c.id];
  if (hasTrait(c, 'Pious')) return 'Her faith';
  if (hasTrait(c, 'Honest') && !isPro(s, c.id)) return 'She is not that kind of woman, and says so';
  if (p?.bounds.includes('no_married') && player(s).spouseId) return 'Not with a married man, at any price';
  if (!isPro(s, c.id) && hashSeed(`${s.seed}:boldline:${c.id}`) % 100 < 55) return 'She is not for sale, at any price';
  return undefined;
}

export function boldAcceptance(s: GameState, c: Character, amount: number, round = 0): Acceptance {
  const boss = player(s);
  const line = boldLine(s, c);
  if (line) return { chance: 0, reasons: [{ label: line, value: -100 }] };
  const reasons: Reason[] = [];
  let base: number;
  if (isPro(s, c.id)) {
    const ratio = amount / Math.max(50, askingPrice(s, c.id, 'car').price);
    base = Math.round(Math.min(80, 25 + ratio * 25));
    reasons.push({ label: `${$(amount)} against her usual`, value: 0 });
  } else {
    base = Math.min(25, 3 + Math.round(amount / 60));
    reasons.push({ label: 'She is not a working girl', value: 0 });
  }
  if (round) reasons.push({ label: `You raised it ${round} time${round === 1 ? '' : 's'} in front of people`, value: -4 * round });
  if (courting(s, c.id)) reasons.push({ label: 'You were courting her', value: -10 });
  const op = opinion(s, c.id, boss.id);
  if (op < 0) reasons.push({ label: 'Thinks little of you', value: Math.round(op * 0.4) });
  const sum = reasons.reduce((x, r) => x + r.value, base);
  return { chance: Math.max(0.03, Math.min(0.85, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

export type BoldResult = 'yes' | 'no' | 'ups' | 'line' | 'out';
export interface BoldReply { result: BoldResult; line: string }

/**
 * Her answer to the offer at this round (pure: the same figure at the same
 * round on the same night always gets the same answer). Round 0 is the
 * first offer; each raise after a no is the next round. Past her line,
 * pressing on gets you thrown out.
 */
export function boldReply(s: GameState, id: string, amount: number, round: number): BoldReply {
  const c = s.characters[id];
  if (!c) return { result: 'no', line: '' };
  if (boldLine(s, c)) return round === 0 ? { result: 'line', line: `"No amount, mister. Not from you, not from anybody." (${boldLine(s, c)}.)` } : { result: 'out', line: `${c.firstName} stood up. The manager was at your elbow a minute later: time to go.` };
  const ch = boldAcceptance(s, c, amount, round).chance;
  const r = roll(`${s.seed}|${s.week}|bold|${id}|${round}|${amount}`);
  if (r < ch) return { result: 'yes', line: `${c.firstName} folded the bills into her purse without looking at them.` };
  if (isPro(s, id) && r < ch + 0.35) return { result: 'ups', line: `"Make it ${$(Math.round(amount * 1.6 / 50) * 50)}, and not where everybody can see."` };
  return { result: 'no', line: round >= 2 ? `"Honey, the whole room is watching you." She looks away.` : `"Put your money away, honey."` };
}

export function previewBold(s: GameState, id: string, amount: number, raises = 0, after: BoldAfter = 'none'): ActionPreview {
  const c = s.characters[id];
  const block = boldBlock(s, id, amount);
  const final = c && !block ? boldReply(s, id, amount, raises) : undefined;
  return {
    title: `A bold offer to ${c?.firstName ?? 'her'}: ${$(amount)}${raises ? ` (raised ${raises}×)` : ''}`, cost: amount, pot: 'pocket', because: `made ${c?.firstName ?? 'her'} a bold offer`, category: 'event',
    effects: c ? [NX({ op: 'bold', id, amount, raises, after }, `A bold offer to ${c.firstName}`)] : [],
    detail: `Lean over and make her a bold offer: "${$(amount)}, right here. Nobody'll see." Money only ever offers: she takes it, ups it, laughs it off, or is insulted and walks (a drink in your face is possible), more so if she isn't a working girl or you've been rude. Some women have a line no amount crosses. Your pocket pays only if she takes it. Each raise after a no puts more eyes on you. About ${BOLD_HOURS * 60} minutes.${final ? ` Her answer at this figure: ${final.result === 'yes' ? 'yes' : 'no'}.` : ''}`,
    odds: block || !c ? undefined : boldAcceptance(s, c, amount, raises),
    warning: `What can go wrong: the manager or the bouncer; one of your men or a rival's sees (the old-school men think less of you); gossip; a vice cop in the room${courting(s, id) ? '; you were courting her, and this tells her what you think of her' : ''}.`,
    disabledReason: block, verb: `Make the offer — ${$(amount)}`,
  };
}

/* ---------------- After she answers: the scene, the bouncer, the test ---------------- */

export type BoldScene = 'none' | 'fuckyou' | 'drink' | 'walk' | 'bouncer';
export type BoldAfter = 'none' | 'test' | 'sorry' | 'askAgain' | 'getLost';

export const AFTER_INFO: Record<BoldAfter, { label: string; text: string }> = {
  none: { label: 'Leave it there', text: 'Whatever she said, that is the end of it.' },
  test: { label: '"Relax, I was just seeing if you would."', text: 'Call it off as a test. If she said yes, she is humiliated (a working girl wants paying for her time anyway); if she said no, some women read it as respect.' },
  sorry: { label: '"No, I\'m sorry. My fault."', text: 'Gracious: a big plus with her and the room; the old-timers respect it.' },
  askAgain: { label: 'Ask again: the offer stands', text: 'It is still only an offer: she can still say no, and if she does, you let it go. A yes given scared counts for little, she will avoid you, and people will say you lean on girls.' },
  getLost: { label: '"Get lost."', text: 'She is out of the club. Some of your men laugh; she holds a grudge, and a woman with a grudge may talk to the wrong people.' },
};

/** A club in your night: her madam is under your protection, or she works on your side of the night. */
export function yourClub(s: GameState, id: string): boolean {
  const p = s.nightlife?.people[id];
  if (!p) return false;
  const h = p.house ? s.nightlife?.houses[p.house] : undefined;
  return p.side === 'player' || h?.with === 'player';
}

/** How she takes a refusal in public (pure: the flow shows it, the week replays it). */
export function boldScene(s: GameState, id: string, amount: number, raises: number): BoldScene {
  const c = s.characters[id];
  if (!c) return 'none';
  const reply = boldReply(s, id, amount, raises);
  if (reply.result === 'yes') return 'none';
  if (reply.result === 'out') return 'bouncer';
  const boss = player(s);
  const insult = (isPro(s, id) ? 0.1 : 0.4) + (courting(s, id) ? 0.2 : 0) + (opinion(s, id, boss.id) < 0 ? 0.15 : 0) + raises * 0.1 + (hasTrait(c, 'Hot-headed') ? 0.2 : 0);
  const r = roll(`${s.seed}|${s.week}|bscene|${id}|${amount}|${raises}`);
  if (r >= insult) return 'none';
  if (!yourClub(s, id) && raises >= 2) return 'bouncer';
  return hasTrait(c, 'Hot-headed') ? 'drink' : r < insult / 2 ? 'fuckyou' : 'walk';
}

export const SCENE_LINE: Record<Exclude<BoldScene, 'none'>, string> = {
  fuckyou: '"Fuck you." She picked up her purse and walked.',
  drink: 'She threw her drink in your face.',
  walk: 'She said something the whole room heard, and walked out.',
  bouncer: 'The bouncer showed you the door.',
};

/** The follow-ups the player has after her answer. */
export function boldAfters(s: GameState, id: string, amount: number, raises: number): BoldAfter[] {
  const reply = boldReply(s, id, amount, raises);
  const scene = boldScene(s, id, amount, raises);
  if (scene !== 'none' && scene !== 'bouncer' && yourClub(s, id)) return ['sorry', 'askAgain', 'getLost'];
  if (reply.result === 'out' || scene === 'bouncer') return ['none'];
  return ['none', 'test'];
}

/** At your club the bouncer tells her who you are: she apologizes (nervous, or stiff if she is proud). */
export function bouncerLine(s: GameState, id: string): string {
  const c = s.characters[id];
  const proud = !!c && (hasTrait(c, 'Hot-headed') || hasTrait(c, 'Vengeful') || hasTrait(c, 'Ambitious'));
  return `The bouncer came over, apologized to you, and said something in her ear. ${c?.firstName ?? 'She'} went white. ${proud ? '"I apologize," she said, stiff as a board.' : '"I\'m sorry, Mr. ... I didn\'t know," she said, and her hands were shaking.'}`;
}

/** Asking again after the bouncer: still her choice (fear nudges it, never decides it). */
export function askAgainOdds(s: GameState, id: string, amount: number): number {
  const c = s.characters[id];
  if (!c || boldLine(s, c)) return 0;
  return Math.max(0.05, Math.min(0.6, boldAcceptance(s, c, amount, 0).chance + 0.1));
}

function grudge(ctx: Ctx, N: NightlifeState, c: Character, how: string, amount: number): void {
  const s = ctx.s;
  const boss = player(s);
  const deep = hasTrait(c, 'Hot-headed') || hasTrait(c, 'Vengeful') || amount >= 25;
  addOpinion(s, c.id, boss.id, how, -Math.max(15, amount), deep ? 0 : 1);
  const p = N.people[c.id];
  if (p && deep) p.grudge = s.week;
  if (deep) ensureDating(s).rumors.push({ week: s.week, text: `${c.firstName} ${c.lastName} tells anyone who'll listen what the boss is really like.`, about: boss.id, heard: ['island'], true: true });
}

/** The offer and every raise, replayed: refusals in public cost face; her last answer decides; then what you did after. */
export function applyBold(ctx: Ctx, N: NightlifeState, id: string, amount: number, raises: number, after: BoldAfter = 'none'): void {
  const s = ctx.s;
  const c = s.characters[id];
  const boss = player(s);
  if (!c || boldBlock(s, id, amount)) return;
  const key = `${s.seed}|${s.week}|bold|${id}|${amount}|${raises}`;
  const fx = (effects: Effect[], label: string) => applyEffects(ctx, effects, { label, because: 'made a bold offer at the club', category: 'event' });
  const lines: string[] = [];
  const p = N.people[id];
  const D = ensureDating(s);
  const b = D.bonds[id];
  const reply = boldReply(s, id, amount, raises);
  const scene = boldScene(s, id, amount, raises);
  const afters = boldAfters(s, id, amount, raises);
  const pick: BoldAfter = afters.includes(after) ? after : afters[0];
  const eyes = raises + (reply.result === 'yes' ? 0 : 1) + (scene !== 'none' ? 2 : 0);
  if (reply.result === 'yes') {
    if (pick === 'test') {
      const half = isPro(s, id) ? Math.round(amount / 2) : 0;
      if (half) spendPocket(ctx, half, `${c.firstName}'s time`, `boldtest:${id}`, true);
      addOpinion(s, id, boss.id, 'He made a fool of me in public', -15, 1);
      if (b) b.aff = clamp(b.aff - 15);
      if (p) p.scorned = s.week;
      lines.push(`She said yes; then you told her you were only seeing if she would. ${half ? `"Then pay me for my time." You did: ${$(half)}.` : 'She put the money down on the table and left.'}`);
      if (roll(`${key}|leaves`) < 0.25 && p) { p.venue = 'a club in Atlantic City'; lines.push('She doesn\'t work this room any more.'); }
      D.rumors.push({ week: s.week, text: `The boss made a fool of ${c.firstName} ${c.lastName} at a table.`, about: boss.id, heard: ['island'], true: true });
    } else {
      spendPocket(ctx, amount, `A bold offer to ${c.firstName}`, `bold:${id}`, true);
      lines.push(`${$(amount)}${raises ? ', after you raised it' : ''}: ${reply.line} Nobody saw. Probably.`);
      if (s.dyn) fx([{ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: -3, source: 'domestic' }, label: 'A bold offer' } as Effect], 'A bold offer');
      if (!isPro(s, id) && b) { b.aff = clamp(b.aff - 10); addOpinion(s, id, boss.id, 'He thought I was for sale', -6, 1); }
    }
  } else if (reply.result === 'out') {
    if (b) { b.aff = clamp(b.aff - 20); b.no = { week: s.week, what: 'a bold offer' }; }
    if (p) p.scorned = s.week;
    grudge(ctx, N, c, 'He wouldn\'t take no for an answer', 20);
    fx([{ type: 'respect', amount: -2, label: 'Shown the door at a club' }], 'Shown the door');
    lines.push(`She told you where her line was, and you kept going. ${reply.line}`);
  } else if (scene === 'none') {
    lines.push(reply.line);
    if (pick === 'test') {
      const respects = hasTrait(c, 'Honest') || hasTrait(c, 'Pious') || hasTrait(c, 'Patient');
      addOpinion(s, id, boss.id, respects ? 'He was testing me, and I passed' : 'A strange sort of man', respects ? 4 : -3, 1);
      lines.push(`"Relax, I was just seeing if you would." ${respects ? 'She looked at you a moment, and almost smiled.' : '"You\'re a strange one."'}`);
    }
  } else {
    if (b) { b.aff = clamp(b.aff - 15); b.no = { week: s.week, what: 'a bold offer' }; }
    if (p) p.scorned = s.week;
    lines.push(SCENE_LINE[scene]);
    if (scene === 'bouncer') { fx([{ type: 'respect', amount: -2, label: 'Shown the door at a club' }], 'Shown the door'); grudge(ctx, N, c, 'He made a scene of me', 15); }
    else if (yourClub(s, id)) {
      lines.push(bouncerLine(s, id));
      if (pick === 'sorry') {
        addOpinion(s, id, boss.id, 'He apologized, in front of everyone', 12, 1);
        if (b) b.aff = clamp(b.aff + 10);
        const old = Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && (x.rank === 'capo' || x.rank === 'consigliere') && ageOn(x.birth, s.date) >= 45).slice(0, 4);
        fx([{ type: 'respect', amount: 1, label: 'Gracious in his own club' }, ...old.map((x) => ({ type: 'opinion', from: x.id, to: boss.id, amount: 2, reason: 'A gentleman', decay: 1, label: 'The old school' }) as Effect)], 'Gracious');
        lines.push('"No, I\'m sorry. My fault." The room went back to its drinks, and she looked at you differently.');
      } else if (pick === 'askAgain') {
        const yes = roll(`${key}|again`) < askAgainOdds(s, id, amount);
        if (yes) {
          spendPocket(ctx, amount, `A bold offer to ${c.firstName}`, `bold2:${id}`, true);
          if (p) { p.afraid = s.week; p.attach = 0; }
          addOpinion(s, id, boss.id, 'I was afraid to say no', -10, 1);
          D.rumors.push({ week: s.week, text: 'The boss leans on girls in his own club.', about: boss.id, heard: ['island'], true: true });
          fx([{ type: 'respect', amount: -1, label: 'Leaning on a girl in your own club' }], 'Leaning');
          lines.push('You asked again. She said yes, the way people say yes when they are frightened. It counted for nothing, and she will keep away from you.');
        } else {
          D.rumors.push({ week: s.week, text: `${c.firstName} ${c.lastName} told the boss no twice, in his own club.`, about: boss.id, heard: ['island'], true: true });
          lines.push('You asked again. Frightened or not, she said no again, and you let it go.');
        }
      } else {
        if (p) { p.barred = s.week; p.grudge = s.week; }
        grudge(ctx, N, c, 'Thrown out of the club for telling him no', 25);
        const young = Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && (x.rank === 'soldier' || x.rank === 'associate') && ageOn(x.birth, s.date) < 32).slice(0, 4);
        if (young.length) fx(young.map((x) => ({ type: 'opinion', from: x.id, to: boss.id, amount: 1, reason: 'The boss put her in her place', decay: 1, label: 'Laughs at the bar' }) as Effect), 'Laughs');
        lines.push('"Get lost." The bouncer walked her out. A couple of your men laughed. She will not forget it.');
      }
    } else grudge(ctx, N, c, 'He insulted me in public', 15);
  }
  if (roll(`${key}|crew`) < 0.15 + 0.12 * eyes) {
    const old = Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && (x.rank === 'capo' || x.rank === 'consigliere') && ageOn(x.birth, s.date) >= 45).slice(0, 4);
    if (old.length && pick !== 'sorry') { fx(old.map((x) => ({ type: 'opinion', from: x.id, to: boss.id, amount: -3, reason: 'Carrying on at a table like a kid', decay: 1, label: 'The old school' }) as Effect), 'Seen'); lines.push('One of your capos saw it from the bar.'); }
  }
  if (roll(`${key}|rival`) < 0.05 + 0.06 * eyes) { const rv = s.rivals.find((x) => x.kind === 'mob'); if (rv) { const sec = addSecret(s, boss, 'affair', [rv.id as FactionId]); if (!sec.knownBy.includes(rv.id as FactionId)) sec.knownBy.push(rv.id as FactionId); } }
  if (roll(`${key}|cop`) < 0.1) { fx([{ type: 'heat', bar: 'local', amount: 2, label: 'A vice cop in the room' }], 'A vice cop'); lines.push('A vice cop at the bar wrote something down.'); }
  if (roll(`${key}|gossip`) < 0.2 + 0.12 * eyes) D.rumors.push({ week: s.week, text: `The boss waved money at ${c.firstName} ${c.lastName} at a table, in front of everybody.`, about: boss.id, heard: ['island'], true: true });
  const line = lines.join(' ');
  nlog(N, s, line);
  ctx.log.push(line);
}
