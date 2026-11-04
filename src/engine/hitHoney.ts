import { ageOn } from './calendar';
import { displayName, hasTrait } from './characters';
import { adultOn } from './datingState';
import { allure, appeal, appetite } from './looks';
import { addFedEvidence } from './fedsState';
import { journal } from './journal';
import type { Ctx } from './ledger';
import { opinion, getRelation, addOpinion } from './relations';
import { hashSeed } from './rng';
import type { Character, Choice, EventInstance, GameState, Scheme } from './types';

/**
 * THE HONEY TRAP, as the boss's own move (imports: "hire one for someone else as a planned hit").
 *
 * One extra row in a hit's setup: the boss pays a willing working woman to get the target alone at a set
 * place and hour (a room for the night, a hotel suite, a parked car). The team does the rest, offstage.
 * Non-explicit: the room, the hour, the door, fade out. Hidden entirely when Mature content is Off.
 *
 *  - She must agree: money, her fear of the boss, what she thinks of him, whether she knows the target.
 *    She can say no, take the money and warn him, or lose her nerve. All three are shown before he commits
 *    and rolled when the job comes due (on this module's own dice).
 *  - It helps most against a careful or guarded man, and there are fewer witnesses.
 *  - It costs: she is a witness (more evidence on the team; later she can talk to the government), the
 *    dead man's people may come looking for her, and if the boss does nothing for her she may have to
 *    leave town in a hurry (offstage, never shown).
 *  - Afterwards the boss decides: pay her and send her to Florida, keep her on the payroll, or leave her
 *    be. Nothing is ever done to her except on his explicit word, and this module offers no such word.
 *
 * The candidates come from one small function (the payroll branch's `workingWomen(s)` can replace it).
 * The aftermath is kept in `s.reads.hw` (peopleRead.ts's optional state).
 */

/** What she is offered: the amount, and its pull (diminishing as it grows). */
export type HoneyPay = 'low' | 'fair' | 'generous' | 'name';
export const HONEY_PAY: Record<HoneyPay, { label: string; fee: number; pull: number; warn: number; talk: number }> = {
  low: { label: 'Low', fee: 800, pull: -10, warn: 1.3, talk: 1.3 },
  fair: { label: 'Fair', fee: 1500, pull: 0, warn: 1, talk: 1 },
  generous: { label: 'Generous', fee: 3000, pull: 12, warn: 0.7, talk: 0.7 },
  name: { label: 'Name your price', fee: 6000, pull: 18, warn: 0.5, talk: 0.5 },
};
export const HONEY_PAYS: HoneyPay[] = ['low', 'fair', 'generous', 'name'];
/** The fair fee (kept for older callers). */
export const HONEY_FEE = HONEY_PAY.fair.fee;
export const FLORIDA_COST = 2500;

/** Who asks her matters: the boss in person, then his underboss or consigliere, a capo, a soldier. */
export function askerPull(s: GameState, askerId?: string): { label: string; value: number } {
  const id = askerId ?? s.playerId;
  if (id === s.playerId) return { label: 'Asked by the boss himself', value: 15 };
  const c = s.characters[id];
  if (!c) return { label: 'Asked by the boss himself', value: 15 };
  if (c.rank === 'underboss' || c.rank === 'consigliere' || s.council?.underboss?.holderId === id || s.council?.consigliere?.holderId === id) return { label: `Asked by ${c.firstName}, your ${c.rank === 'consigliere' ? 'consigliere' : 'underboss'}`, value: 8 };
  if (c.rank === 'capo') return { label: `Asked by ${c.firstName}, a capo`, value: 4 };
  return { label: `Asked by ${c.firstName}, a ${c.rank === 'associate' ? 'man' : 'soldier'}`, value: 0 };
}

const WORKING_ROLES = new Set(['escort', 'callgirl', 'street', 'madam']);

/** The adult working women and madams the game knows of (the nightlife cast). One small function, to be replaced by payroll's `workingWomen(s)`. */
export function workingWomenNow(s: GameState): Character[] {
  const out: Character[] = [];
  for (const [id, p] of Object.entries(s.nightlife?.people ?? {})) {
    const c = s.characters[id];
    if (!c?.alive || p.status !== 'active' || !WORKING_ROLES.has(p.role) || ageOn(c.birth, s.date) < 21) continue;
    out.push(c);
  }
  return out.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.id.localeCompare(b.id));
}

/** Who could do it (nobody when Mature content is Off). Never the target's own wife. */
export function honeyCandidates(s: GameState, targetId?: string): Character[] {
  if (!adultOn(s)) return [];
  const t = targetId ? s.characters[targetId] : undefined;
  return workingWomenNow(s).filter((c) => !t || (c.id !== t.id && c.spouseId !== t.id && t.spouseId !== c.id));
}

export interface HoneyOdds {
  /** She agrees and goes through with it. */
  yes: number;
  /** She takes the money and warns him. */
  warn: number;
  /** She agrees, then loses her nerve. */
  nerve: number;
  /** She says no. */
  no: number;
  reasons: { label: string; value: number }[];
  /** Points it adds to the hit's odds when she goes through with it. */
  bonus: number;
  /** She knows him. */
  knows: boolean;
  /** Does he take the bait (his appetite, a ladies' man, her looks to him), and why. */
  bait: number;
  baitReasons: { label: string; value: number }[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Her answer, as odds the boss can see (pure). */
export function honeyOdds(s: GameState, womanId: string, targetId: string, ask: { by?: string; pay?: HoneyPay } = {}): HoneyOdds {
  const pay = HONEY_PAY[ask.pay ?? 'fair'];
  const w = s.characters[womanId];
  const t = s.characters[targetId];
  const np = s.nightlife?.people[womanId];
  const reasons: { label: string; value: number }[] = [{ label: 'Base', value: 40 }];
  const who = askerPull(s, ask.by);
  if (who.value) reasons.push(who);
  // The asker's own pull with her (looks.ts allure: his looks to her, charm, a ladies' man's practice). Rank is counted above.
  const asker = s.characters[ask.by ?? s.playerId];
  if (asker && w) for (const r of allure(s, asker, w).reasons) if (!/name opens doors|man of standing/.test(r.label)) reasons.push({ label: `${asker.id === s.playerId ? 'Your' : `${asker.firstName}'s`} ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)}`, value: Math.round(r.value / 2) });
  reasons.push({ label: `${pay.label}: $${pay.fee.toLocaleString('en-US')}`, value: pay.pull });
  const fear = getRelation(s, womanId, s.playerId)?.fear ?? 0;
  if (fear >= 10) reasons.push({ label: 'She is afraid of you', value: Math.round(fear / 4) });
  const op = opinion(s, womanId, s.playerId);
  if (op) reasons.push({ label: op > 0 ? 'She likes you' : 'She does not like you', value: Math.round(op / 3) });
  if (np?.payroll) reasons.push({ label: 'On your payroll', value: 12 });
  if (np && np.loyalty >= 60) reasons.push({ label: 'She trusts you', value: 8 });
  const opT = t ? opinion(s, womanId, targetId) : 0;
  const knows = opT !== 0 || !!(t && (s.nightlife?.people[womanId]?.house === targetId));
  if (knows) reasons.push({ label: opT > 0 ? 'She knows him, and likes him' : 'She knows him', value: opT > 0 ? -25 : -8 });
  if (w && hasTrait(w, 'Greedy')) reasons.push({ label: 'Greedy', value: 10 });
  // Heavy fear of him, or loyalty to him, caps what any money or any asker can do.
  const fearT = t ? getRelation(s, womanId, targetId)?.fear ?? 0 : 0;
  if (fearT >= 20) reasons.push({ label: 'Scared of him', value: -Math.round(fearT / 3) });
  let cap = 0.9;
  if (fearT >= 50) cap = Math.min(cap, 0.35);
  if (opT >= 40) cap = Math.min(cap, 0.3);
  const will = clamp(reasons.reduce((a, r) => a + r.value, 0) / 100, 0.05, cap);
  const discretion = np?.discretion ?? 50;
  const warn = clamp((0.04 + (opT > 0 ? opT / 250 : 0) + (knows ? 0.06 : 0) - fear / 600 + (50 - discretion) / 800) * pay.warn, 0.01, 0.4);
  const nerve = clamp(0.12 - fear / 800 - (np?.payroll ? 0.04 : 0), 0.03, 0.2);
  const yes = clamp(will - warn - nerve, 0.02, 0.9);
  const careful = t ? (t.rank === 'boss' || s.rivals.some((r) => r.leaderId === t.id) ? 10 : 0) + (hasTrait(t, 'Paranoid') ? 6 : 0) + (t.rank === 'capo' || t.rank === 'underboss' ? 6 : 0) + (hasTrait(t, 'Womanizer') ? 6 : 0) : 0;
  // Does he take the bait: a big appetite, a ladies' man, her looks to him; a pious or faithful man rarely does.
  const baitReasons: { label: string; value: number }[] = [{ label: 'Base', value: 45 }];
  if (t && w) {
    const ap = appetite(s, t);
    if (ap !== 50) baitReasons.push({ label: ap >= 50 ? 'His appetite' : 'Not a man who strays', value: Math.round((ap - 50) / 2) });
    if (hasTrait(t, 'Womanizer')) baitReasons.push({ label: 'A ladies\' man', value: 15 });
    if (hasTrait(t, 'Pious')) baitReasons.push({ label: 'Pious', value: -15 });
    const ap2 = appeal(s, t, w).value;
    if (ap2) baitReasons.push({ label: ap2 > 0 ? 'Her looks, to him' : 'Not his type', value: ap2 });
    if (t.spouseId && !hasTrait(t, 'Womanizer') && opinion(s, t.id, t.spouseId) >= 40) baitReasons.push({ label: 'Faithful to his wife', value: -15 });
  }
  const bait = clamp(baitReasons.reduce((a, r) => a + r.value, 0) / 100, 0.05, 0.95);
  return { yes, warn, nerve, no: Math.max(0, 1 - yes - warn - nerve), reasons, bonus: Math.round((14 + careful) * bait), knows, bait, baitReasons };
}

export type HoneyAnswer = 'yes' | 'warn' | 'nerve' | 'no';

/** Which answer a roll gives (pure; `r` in [0,1)). */
export function honeyAnswer(o: Pick<HoneyOdds, 'yes' | 'warn' | 'nerve'>, r: number): HoneyAnswer {
  if (r < o.yes) return 'yes';
  if (r < o.yes + o.warn) return 'warn';
  if (r < o.yes + o.warn + o.nerve) return 'nerve';
  return 'no';
}

/** Her answer when the job comes due (own dice: never the main stream). */
export function rollHoney(s: GameState, sc: Scheme): HoneyAnswer | undefined {
  const wid = sc.opts.honey;
  if (!wid || !sc.targetId || !honeyCandidates(s, sc.targetId).some((c) => c.id === wid)) return undefined;
  const r = hashSeed(`${s.seed}|honey|${sc.id}|${s.week}`) / 4294967296;
  return honeyAnswer(honeyOdds(s, wid, sc.targetId, { by: sc.opts.honeyAsk, pay: sc.opts.honeyPay }), r);
}

/** The lines and changes of her answer that come before the shot is fired (a refusal, a warning, cold feet). */
export function honeyBefore(ctx: Ctx, sc: Scheme, ans: HoneyAnswer): void {
  const s = ctx.s;
  const w = s.characters[sc.opts.honey!];
  const t = s.characters[sc.targetId!];
  const line = ans === 'yes' ? `${w.firstName} took the money and booked a room for the night. ${t.firstName} came up the stairs alone.`
    : ans === 'warn' ? `${w.firstName} took the money, then went to ${t.firstName}. He never came to the room.`
      : ans === 'nerve' ? `${w.firstName} lost her nerve and never showed. The team had to do it the hard way.`
        : `${w.firstName} heard what it was for and said no. The team had to do it the hard way.`;
  ctx.log.push(line);
  journal(s, { c: 'intrigue', t: `The room for the night: ${w.firstName} ${w.lastName}`, x: line, p: [w.id, t.id], src: 'honey', mine: 1 });
  if (ans === 'warn') {
    addOpinion(s, t.id, s.playerId, 'Set me up with a girl to be killed', -35, 1);
    addOpinion(s, t.id, w.id, 'Warned me', 25, 1);
  }
  if (ans === 'no') addOpinion(s, w.id, s.playerId, 'Asked me to set a man up', -6, 1);
}

/** She went through with it: a witness. The team's file grows; the boss decides what becomes of her. */
export function honeyAfter(ctx: Ctx, sc: Scheme, agents: readonly Character[]): void {
  const s = ctx.s;
  const w = s.characters[sc.opts.honey!];
  const t = s.characters[sc.targetId!];
  if (!w || !t) return;
  for (const a of agents) addFedEvidence(s, a.id, 4, 'a witness: the girl in the room');
  const R = (s.reads ??= { v: 1, p: {}, seen: [] });
  (R.hw ??= []).push({ id: w.id, t: t.id, w: s.week, ...(sc.opts.honeyPay && sc.opts.honeyPay !== 'fair' ? { pay: sc.opts.honeyPay } : {}) });
  s.eventQueue.push(honeyEvent(s, w, t));
}

function honeyEvent(s: GameState, w: Character, t: Character): EventInstance {
  const label = `${w.firstName} ${w.lastName}`;
  const flag = (v: number) => ({ type: 'flag' as const, key: `honeyfate:${w.id}`, value: v, label });
  const choices: Choice[] = [
    { id: 'florida', label: `Pay her and send her to Florida ($${FLORIDA_COST.toLocaleString('en-US')})`, detail: 'A ticket south and enough to start over. Out of reach of his people and of a subpoena.', because: `sent ${w.firstName} to Florida after the ${t.lastName} job`, effects: [{ type: 'money', amount: -FLORIDA_COST, label }, flag(1)] },
    { id: 'payroll', label: 'Keep her on the payroll', detail: 'She stays, she earns, she owes you. She is still a witness, and she is still in town.', because: `kept ${w.firstName} on the payroll after the ${t.lastName} job`, effects: [flag(2)] },
    { id: 'leave', label: 'Leave her be', detail: 'Nothing more for her. His people may come looking, and the government may find her first.', because: `left ${w.firstName} to herself after the ${t.lastName} job`, effects: [flag(3)] },
  ];
  return {
    iid: `ev${s.nextId++}`, defId: 'honey_after', week: s.week, mandatory: true, priority: 60,
    title: `The girl in the room`, text: `${displayName(w)} did what she was paid to do. She knows who sent her, and she saw the men who came after ${t.firstName}. What becomes of her is your call.`,
    defaultChoiceId: 'payroll', actors: [w.id], meta: { honey: w.id }, choices,
  };
}

/** The aftermath week by week: the boss's answer, then the risks of a witness left in town. */
export function honeyWeek(ctx: Ctx): void {
  const s = ctx.s;
  for (const h of s.reads?.hw ?? []) {
    const w = s.characters[h.id];
    const np = s.nightlife?.people[h.id];
    if (!w?.alive || h.done) continue;
    const f = s.flags[`honeyfate:${h.id}`];
    if (!h.fate && f) {
      h.fate = f === 1 ? 'florida' : f === 2 ? 'payroll' : 'left';
      if (h.fate === 'florida' && np) np.status = 'gone';
      if (h.fate === 'payroll' && np && !np.payroll) np.payroll = { since: s.week, paid: 0 };
      if (h.fate === 'florida') { h.done = s.week; journal(s, { c: 'intrigue', t: `${w.firstName} is on a train to Florida`, p: [w.id], src: 'honey' }); continue; }
    }
    if (!h.fate || s.week - h.w > 104) continue;
    const r = hashSeed(`${s.seed}|honeywk|${h.id}|${s.week}`) / 4294967296;
    // She talks to the government (a witness with nothing holding her).
    const talk = (h.fate === 'payroll' ? 0.006 : 0.015) * HONEY_PAY[h.pay ?? 'fair'].talk;
    if (r < talk) {
      h.done = s.week;
      w.informantFor = 'law';
      addFedEvidence(s, s.playerId, 4, 'a witness: the girl in the room');
      continue;
    }
    // His people come looking for her: she leaves town in a hurry (offstage; only when the boss did nothing for her).
    const kin = Object.values(s.characters).some((k) => k.alive && (k.fatherId === h.t || s.characters[h.t]?.fatherId === k.id || k.spouseId === h.t) && k.faction !== 'player');
    if (h.fate === 'left' && kin && r < talk + 0.02) {
      h.done = s.week;
      if (np) np.status = 'gone';
      journal(s, { c: 'intrigue', t: `${w.firstName} ${w.lastName} left town in a hurry`, x: 'Nobody on the island has seen her since.', p: [w.id], src: 'honey' });
    }
  }
}
