import { devKeeperMult, devReportErr } from './devState';
import { offerCut } from './cutScore';
import type { ActionPreview } from './actions';
import { attr } from './attrs';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { holder, seatPower } from './council';
import { applyEffects, fmtMoney } from './effects';
import { addEvidence, addStory } from './hierarchy';
import { heat, money, type Ctx } from './ledger';
import { addOpinion, changeMeter, opinion } from './relations';
import { chance } from './rng';
import { roll01, type BonesOutcome } from './bonesState';
import { ensureLedgerBook, type BookLine, type BooksMode, type BookWeek, type Discrepancy, type KickNote, type LedgerAction, type LedgerBookState, type LedgerOp, type Receipt } from './ledgerbookState';
import type { Character, Effect, GameState, LedgerCategory, PlayerAction, ReportLine, WeeklyReport } from './types';

/**
 * THE BOOKS (the receipts). The boss's private ledger, drawn line for line
 * from the one ledger: who kicked up what and from where, week by week; who
 * is short or late; tribute to Philadelphia; the shylock book; debts both
 * ways; favors and hooks; the pad; big scores and the split; and the reports
 * his men hand in after a job. A report is as true as the man who wrote it,
 * and a bad one can be checked with the consigliere or the enforcer.
 *
 * Keeping books is evidence. In your head (nothing on paper) the boss
 * catches little and remembers a month; a coded ledger catches more; the full
 * books catch skims fast and hold half a year — and are a gift to the Feds if
 * a raid seizes them or the bookkeeper flips.
 */

export const MODE_INFO: Record<BooksMode, { name: string; text: string; retain: number; detect: number; err: number; raid: { boss: number; keeper: number; capo: number; heat: number }; weekly: { boss: number; keeper: number } }> = {
  head: { name: 'Keep it all in your head', text: 'Nothing on paper. You remember about a month, roughly, and a skim has to be big before you feel it.', retain: 4, detect: 0.05, err: 0.5, raid: { boss: 0, keeper: 0, capo: 0, heat: 0 }, weekly: { boss: 0, keeper: 0 } },
  coded: { name: 'A coded ledger', text: 'Initials and numbers in a feed-store notebook. A quarter of the year, close enough; a raid gets something, if they can read it.', retain: 13, detect: 0.12, err: 0.25, raid: { boss: 6, keeper: 4, capo: 1, heat: 1 }, weekly: { boss: 0.06, keeper: 0.1 } },
  full: { name: 'The full books', text: 'Every envelope, every name, every week, in your bookkeeper\'s hand. Skims show up fast. So would you, in a courtroom.', retain: 26, detect: 0.25, err: 0.05, raid: { boss: 18, keeper: 10, capo: 4, heat: 4 }, weekly: { boss: 0.25, keeper: 0.3 } },
};
export const MODES: BooksMode[] = ['head', 'coded', 'full'];
export const ENFORCER_CHECK_COST = 300;
export const RAID_ODDS = { police: 0.15, fbi: 0.3 } as const;

/* ---------------------------------------------------------------- */
/* Feeding the books from the ledger                                 */
/* ---------------------------------------------------------------- */

/** Tags the line just posted with who paid it and from which racket or place. */
export function tagLast(ctx: Ctx, who?: string, src?: string): void {
  const l = ctx.lines[ctx.lines.length - 1];
  if (!l || l.stat !== 'money') return;
  if (who) l.who = who;
  if (src) l.src = src;
}

/** A capo's envelope this week: what he owed, paid, held back and skimmed. */
export function noteKick(s: GameState, capoId: string, districtId: string, owed: number, paid: number, held: number, skim: number): void {
  ensureLedgerBook(s).cur.push({ k: capoId, d: districtId, owed: Math.round(owed), paid: Math.round(paid), held: Math.round(held), skim: Math.round(skim) });
}

/** A big score and its split (yours is the last "Big score" line just posted, unless given). */
export function noteScore(ctx: Ctx, byId: string, value: number, what: string, yours?: number): void {
  const b = ensureLedgerBook(ctx.s);
  let mine = yours;
  if (mine === undefined) {
    const l = ctx.lines[ctx.lines.length - 1];
    mine = l && l.stat === 'money' && l.label.startsWith('Big score') ? l.amount : 0;
  }
  b.scores.push({ week: ctx.s.week, byId, what, value: Math.round(value), yours: Math.round(mine) });
  // What came to the boss's side is cut up with the family (cutScore.ts).
  if (mine > 0) offerCut(ctx.s, mine, what === 'a big score' ? `${ctx.s.characters[byId]?.firstName ?? 'A crew'}'s big score` : what, byId);
  if (b.scores.length > 40) b.scores = b.scores.slice(-40);
}

/** End of the week: the money lines go into the books exactly as posted; skims may surface. */
export function archiveWeek(s: GameState, report: WeeklyReport): void {
  const b = ensureLedgerBook(s);
  const lines: BookLine[] = [];
  for (const l of report.lines) {
    if (l.stat !== 'money' || l.amount === 0) continue;
    const x: BookLine = { a: l.amount, l: l.label, c: l.category };
    if (l.who) x.w = l.who;
    if (l.src) x.s = l.src;
    lines.push(x);
  }
  const w: BookWeek = { week: report.week, start: report.start.money, end: report.end.money, lines, kicks: b.cur };
  b.cur = [];
  b.weeks.push(w);
  const keep = MODE_INFO.full.retain + 2;
  if (b.weeks.length > keep) b.weeks = b.weeks.slice(-keep);
  // Only what the current kind of books can hold.
  const r = MODE_INFO[b.mode].retain;
  if (b.weeks.length && b.weeks[0].week <= report.week - r) b.weeks = b.weeks.filter((x) => x.week > report.week - r);
  detectSkims(s, b, w);
}

/* ---------------------------------------------------------------- */
/* Accuracy and detection                                           */
/* ---------------------------------------------------------------- */

/** Who keeps the books: a dedicated bookkeeper, else the bagman. */
export function keeper(s: GameState): Character | undefined {
  const id = s.ledgerBook?.keeperId;
  const c = id ? s.characters[id] : undefined;
  if (c?.alive && c.faction === 'player' && isFree(s, c)) return c;
  return holder(s, 'bagman');
}

/** How good the bookkeeper is: 0.6 (sloppy) .. 1.5 (a real accountant). Without one the boss counts himself (0.7). */
export function keeperSkill(s: GameState): number {
  const c = keeper(s);
  if (!c) return 0.7;
  const v = (attr(s, c, 'finance') + attr(s, c, 'organization')) / 2;
  return Math.max(0.6, Math.min(1.5, 0.6 + v / 125 + (c.specialty === 'accountant' ? 0.2 : 0))) * devKeeperMult(s);
}

/** How honest a man is with the family (0-100). */
export function honesty(s: GameState, c: Character): number {
  let v = attr(s, c, 'conscience') * 0.5 + attr(s, c, 'loyalty') * 0.3 + (100 - attr(s, c, 'greed')) * 0.2;
  if (hasTrait(c, 'Honest')) v += 20;
  if (hasTrait(c, 'Greedy')) v -= 15;
  if (hasTrait(c, 'Gambler')) v -= 10;
  if (c.debtTo) v -= 10;
  if (c.faction === 'player' && c.id !== s.playerId) v += opinion(s, c.id, s.playerId) * 0.1;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Does he shade his report? Deterministic per man and job. */
export function receiptLie(s: GameState, c: Character, key: string): boolean {
  const p = Math.max(0.03, Math.min(0.7, (60 - honesty(s, c)) / 60));
  return roll01(s.seed, key, c.id, 'lie') < p;
}

/** Weekly odds the books flag a skimming capo (pure: exported for the tests). */
export function detectChance(mode: BooksMode, skill: number, ratio: number): number {
  return Math.min(0.9, MODE_INFO[mode].detect * skill * (ratio >= 0.05 ? 1 : 0.3));
}

/** The figure the boss expects from a capo's envelope (exact with full books). */
export function expectedKick(s: GameState, n: KickNote, week: number, mode: BooksMode = s.ledgerBook?.mode ?? 'coded'): number {
  const err = MODE_INFO[mode].err * devReportErr(s);
  return Math.round(n.owed * (1 + (roll01(s.seed, 'exp', n.k, week) - 0.5) * 2 * err) / 10) * 10;
}

function detectSkims(s: GameState, b: LedgerBookState, w: BookWeek): void {
  const kp = keeper(s);
  const skill = keeperSkill(s);
  for (const n of w.kicks) {
    const capo = s.characters[n.k];
    if (!capo) continue;
    // A crooked bookkeeper covers for a friend.
    if (kp && honesty(s, kp) < 35 && opinion(s, kp.id, capo.id) > 15) continue;
    const open = b.discrepancies.find((d) => d.whoId === n.k && d.kind === 'skim' && !d.settled);
    if (n.skim > 0) {
      const p = detectChance(b.mode, skill, n.owed > 0 ? n.skim / n.owed : 1);
      if (roll01(s.seed, 'skim', n.k, w.week) >= p) continue;
      const est = Math.max(10, Math.round(n.skim * (1 + (roll01(s.seed, 'est', n.k, w.week) - 0.5) * 2 * MODE_INFO[b.mode].err) / 10) * 10);
      if (open) {
        open.amount += est;
        open.truth = true;
        open.week = w.week;
      } else {
        b.discrepancies.push({ id: `dq${s.nextId++}`, week: w.week, whoId: n.k, kind: 'skim', amount: est, src: n.d, truth: true, text: `${capo.firstName}'s envelope from ${s.districts.find((d) => d.id === n.d)?.name ?? 'his district'} is light: about ${fmtMoney(est)} the books can't find` });
        b.stats.skimsFound++;
      }
    } else if (b.mode === 'head' && !open && roll01(s.seed, 'fp', n.k, w.week) < 0.01) {
      // Counting in your head, an honest bad week can look like a skim.
      const est = Math.round(n.owed * 0.15 / 10) * 10;
      if (est > 0) {
        b.discrepancies.push({ id: `dq${s.nextId++}`, week: w.week, whoId: n.k, kind: 'skim', amount: est, src: n.d, truth: false, text: `${capo.firstName}'s envelope feels light — about ${fmtMoney(est)}, as far as you remember` });
        b.stats.falseAlarms++;
      }
    }
  }
  if (b.discrepancies.length > 30) b.discrepancies = b.discrepancies.filter((d) => !d.settled || s.week - (d.settledWeek ?? d.week) < 26).slice(-30);
}

/* ---------------------------------------------------------------- */
/* Receipts                                                          */
/* ---------------------------------------------------------------- */

const SAID: Record<BonesOutcome, string> = {
  clean: 'It went the way it was supposed to. Nobody saw nothing.',
  froze: 'I froze up. The others finished it. It won\'t happen again.',
  talked: 'It got done. I might have said something to a guy after. Nothing he can use.',
  hothead: 'It got done. Maybe louder than you wanted.',
};

export interface ReceiptInput {
  byId: string;
  job: string;
  kind: Receipt['kind'];
  actual: number;
  reported: number;
  outcome?: BonesOutcome;
  claimed?: BonesOutcome;
  said?: string;
  truth?: string;
  bonesOf?: string;
  jobId: string;
}

/** A man hands in his report on a job: what he says, next to what happened. */
export function fileReceipt(s: GameState, r: ReceiptInput): Receipt {
  const b = ensureLedgerBook(s);
  const said = r.said ?? `${SAID[r.claimed ?? r.outcome ?? 'clean']}${r.reported > 0 ? ` Here's the end: ${fmtMoney(r.reported)}.` : ''}`;
  const truth = r.truth ?? `${SAID[r.outcome ?? 'clean']}${r.actual > 0 ? ` It came to ${fmtMoney(r.actual)}.` : ''}`;
  const rec: Receipt = { id: `rc${s.nextId++}`, week: s.week, byId: r.byId, job: r.job, kind: r.kind, reported: r.reported, actual: r.actual, said, truth, lie: r.reported !== r.actual || (r.claimed ?? r.outcome) !== r.outcome || (r.said !== undefined && r.said !== r.truth), jobId: r.jobId };
  if (r.bonesOf) rec.bonesOf = r.bonesOf;
  b.receipts.push(rec);
  b.stats.receipts++;
  if (rec.lie) b.stats.lies++;
  if (b.receipts.length > 40) b.receipts = b.receipts.slice(-40);
  return rec;
}

/** Odds a check through this seat gets to the truth. */
export function checkOdds(s: GameState, r: Receipt, via: 'consigliere' | 'enforcer'): number {
  const mode = s.ledgerBook?.mode ?? 'coded';
  return Math.max(0.1, Math.min(0.9, 0.25 + seatPower(s, via) * 0.35 + (mode === 'full' && r.actual > 0 ? 0.1 : 0) + (via === 'enforcer' ? 0.05 : 0)));
}

/* ---------------------------------------------------------------- */
/* Evidence, raids, the bookkeeper                                   */
/* ---------------------------------------------------------------- */

/** What the books add to the boss's evidence each week (the Law tab's reasons). */
export function booksEvidenceReasons(s: GameState): { label: string; value: number }[] {
  const b = s.ledgerBook;
  if (!b || b.mode === 'head' || s.heat.federal <= 30) return [];
  return [{ label: `The books: ${b.mode === 'full' ? 'a full ledger with names in it' : 'a coded ledger'}`, value: MODE_INFO[b.mode].weekly.boss }];
}

/** What a seizure of the books would add to the boss's file right now. */
export function raidExposure(s: GameState): number {
  return MODE_INFO[s.ledgerBook?.mode ?? 'coded'].raid.boss;
}

/**
 * A raid may seize the books (heat.ts calls this on a police raid and a
 * federal arrest). Full books are a case; coded ones a lead; your head
 * holds nothing. Returns the evidence added to the boss's file.
 */
export function booksRaid(ctx: Ctx, by: 'police' | 'fbi', force = false): number {
  const s = ctx.s;
  const b = ensureLedgerBook(s);
  if (b.mode === 'head' || (!b.weeks.length && !force)) return 0;
  if (!force && !chance(b, RAID_ODDS[by])) return 0;
  const R = MODE_INFO[b.mode].raid;
  const boss = player(s);
  const added = addEvidence(s, boss, R.boss);
  const kp = keeper(s);
  if (kp) addEvidence(s, kp, R.keeper);
  const named = new Set<string>();
  for (const w of b.weeks) for (const l of w.lines) if (l.w && l.c === 'kickup') named.add(l.w);
  for (const id of named) addEvidence(s, s.characters[id], R.capo);
  if (R.heat) heat(ctx, 'federal', R.heat, `RAID: ${by === 'fbi' ? 'the FBI' : 'the county detectives'} seized your ${b.mode === 'full' ? 'books' : 'coded ledger'}`, 'heat');
  b.seizures.push({ week: s.week, by, mode: b.mode, evidence: added });
  b.stats.seizures++;
  b.weeks = [];
  b.since = s.week + 1;
  ctx.log.push(`RAID: ${by === 'fbi' ? 'Federal agents' : 'The county detectives'} carried out your ${b.mode === 'full' ? 'books' : 'coded ledger'} in a cardboard box (+${added} on your file${named.size ? `, and ${named.size} capo${named.size > 1 ? 's' : ''} named in it` : ''}).`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The ${by === 'fbi' ? 'FBI' : 'county detectives'} seized the family's ${b.mode === 'full' ? 'books' : 'coded ledger'}.`, kind: 'heat' });
  if (s.cutscenes.length < 2) s.cutscenes.push({ key: 'raid_books', title: 'The books', text: `A detective holds up the ledger for the photographers. ${b.mode === 'full' ? 'Names, dates, envelopes — all of it in your bookkeeper\'s neat hand.' : 'Initials and numbers. Somebody downtown will spend the winter reading it.'}`, week: s.week });
  return added;
}

/** Weekly: the bookkeeper's own file grows with what he holds; a bug at HQ hears the counting. */
export function ledgerWeek(ctx: Ctx): void {
  const s = ctx.s;
  const b = ensureLedgerBook(s);
  if (b.keeperId && !(s.characters[b.keeperId]?.alive && s.characters[b.keeperId].faction === 'player')) delete b.keeperId;
  const kp = keeper(s);
  if (!kp || b.mode === 'head') return;
  let amt = MODE_INFO[b.mode].weekly.keeper;
  if (s.econ?.hq.bug) amt += b.mode === 'full' ? 0.5 : 0.2;
  const carry = Math.round(((b.carry[kp.id] ?? 0) + amt) * 1e6) / 1e6;
  const whole = Math.floor(carry);
  b.carry[kp.id] = carry - whole;
  if (whole > 0) addEvidence(s, kp, whole);
  // Once a month a bookkeeper with a thick file and thin loyalty may take the books to the Feds.
  if (s.week % 4 === 2 && (kp.evidence ?? 0) >= 40 && kp.id !== s.playerId && !kp.dynasty) {
    const loyal = attr(s, kp, 'loyalty');
    const p = Math.max(0, (50 - loyal) / 250 + ((kp.evidence ?? 0) - 40) / 400 - (hasTrait(kp, 'Loyal-to-a-fault') ? 1 : 0));
    if (p > 0 && chance(b, p)) keeperFlips(ctx, kp);
  }
}

function keeperFlips(ctx: Ctx, kp: Character): void {
  const s = ctx.s;
  const b = ensureLedgerBook(s);
  const mode = b.mode;
  const extra = mode === 'full' ? 20 : mode === 'coded' ? 8 : 0;
  applyEffects(ctx, [{ type: 'flip', charId: kp.id }], { label: `${kp.firstName} took the books to the Feds`, because: 'kept books', category: 'heat' });
  const added = addEvidence(s, player(s), extra);
  b.seizures.push({ week: s.week, by: 'flip', mode, evidence: added });
  b.stats.keeperFlips++;
  b.weeks = [];
  b.since = s.week + 1;
  if (b.keeperId === kp.id) delete b.keeperId;
  ctx.log.push(`${displayName(kp)}, who kept your books, walked into the federal building with them (+${added} on your file).`);
}

/* ---------------------------------------------------------------- */
/* Orders and effect ops                                             */
/* ---------------------------------------------------------------- */

const op = (o: LedgerOp, label?: string): Effect => ({ type: 'ledger', op: o, ...(label ? { label } : {}) });

export function previewLedger(s: GameState, a: LedgerAction): ActionPreview {
  const b = s.ledgerBook;
  const none = (title: string, why: string): ActionPreview => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' });
  switch (a.op) {
    case 'mode': {
      const I = MODE_INFO[a.mode];
      const cur = b?.mode ?? 'coded';
      const burn = MODES.indexOf(a.mode) < MODES.indexOf(cur);
      return {
        title: I.name, detail: `${I.text}${burn ? ' The old pages go in the furnace tonight.' : ''}`,
        effects: [op({ op: 'mode', mode: a.mode })], cost: 0, because: `changed how the books are kept (${I.name.toLowerCase()})`,
        disabledReason: cur === a.mode ? 'That is how you keep them now' : undefined, category: 'event',
        warning: a.mode === 'full' ? `If the books are seized: +${I.raid.boss} on your file, +${I.raid.capo} on every capo in them.` : undefined,
      };
    }
    case 'keeper': {
      const c = a.charId ? s.characters[a.charId] : undefined;
      if (a.charId && (!c || !c.alive || c.faction !== 'player' || c.id === s.playerId)) return none('Bookkeeper', 'Not one of yours');
      return {
        title: c ? `${c.firstName} ${c.lastName} keeps the books` : 'The bagman keeps the books',
        detail: c ? `Honesty and loyalty matter: he sees every envelope, and his file grows with what he holds. ${c.specialty === 'accountant' ? 'A real accountant.' : ''}` : 'The bagman counts the envelopes as part of his seat.',
        effects: [op({ op: 'keeper', charId: c?.id })], cost: 0, because: c ? `gave ${c.firstName} the books` : 'gave the books back to the bagman',
        disabledReason: (b?.keeperId ?? undefined) === (c?.id ?? undefined) ? 'He keeps them now' : undefined, category: 'event',
      };
    }
    case 'check': {
      const r = b?.receipts.find((x) => x.id === a.receiptId);
      const c = r ? s.characters[r.byId] : undefined;
      if (!r || !c) return none('Check a report', 'No such report');
      const who = holder(s, a.via);
      const p = checkOdds(s, r, a.via);
      const cost = a.via === 'enforcer' ? ENFORCER_CHECK_COST : 0;
      const title = `${a.via === 'consigliere' ? 'Have the consigliere look into' : 'Send the enforcer to check'} ${c.firstName}'s report on ${r.job}`;
      return {
        title, detail: a.via === 'consigliere' ? 'Quiet questions to the right people. He never knows.' : 'The enforcer talks to everyone who was there. Effective, and he will hear about it.',
        effects: [...(cost ? [{ type: 'money', amount: -cost, label: title } as Effect] : []), op({ op: 'check', receiptId: r.id, via: a.via })],
        cost, because: `checked ${c.firstName}'s story about ${r.job}`, category: 'event',
        odds: { chance: p, reasons: [{ label: 'Base', value: 25 }, { label: `${who ? who.firstName : 'Nobody'} in the seat`, value: Math.round(seatPower(s, a.via) * 35) }, ...(b?.mode === 'full' && r.actual > 0 ? [{ label: 'The full books', value: 10 }] : []), ...(a.via === 'enforcer' ? [{ label: 'He leans on people', value: 5 }] : [])] },
        disabledReason: !who ? `No ${a.via}` : r.checked ? 'Already checked' : !c.alive ? 'He is dead' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined,
      };
    }
    case 'confront':
    case 'forgive': {
      const d = b?.discrepancies.find((x) => x.id === a.discId);
      const c = d ? s.characters[d.whoId] : undefined;
      if (!d || !c) return none('Discrepancy', 'Nothing to settle');
      const title = a.op === 'confront' ? `Confront ${c.firstName} about ${fmtMoney(d.amount)}` : `Let ${c.firstName}'s ${fmtMoney(d.amount)} go`;
      return {
        title, detail: a.op === 'confront' ? 'Show him the page. If the money is gone, he finds it. If he never took it, he will not forget you asked.' : 'Nothing said. The books carry it.',
        effects: [op({ op: a.op, discId: d.id })], cost: 0, because: a.op === 'confront' ? `confronted ${c.firstName} about the books` : `let ${c.firstName}'s shortfall go`,
        disabledReason: d.settled ? 'Settled' : !c.alive ? 'He is dead' : c.faction !== 'player' ? 'He is not with you any more' : undefined, category: 'event',
      };
    }
  }
}

export function describeLedgerOp(s: GameState, o: LedgerOp): string | undefined {
  switch (o.op) {
    case 'mode': return `Books: ${MODE_INFO[o.mode].name.toLowerCase()}`;
    case 'keeper': return o.charId ? `${s.characters[o.charId]?.firstName ?? '?'} keeps the books` : 'The bagman keeps the books';
    case 'check': return 'You find out if his story holds';
    case 'confront': return 'He pays it back if he took it; he resents it either way';
    case 'forgive': return 'Settled without a word';
    case 'note': return o.text;
  }
}

export function applyLedgerOp(ctx: Ctx, o: LedgerOp, label: string): void {
  const s = ctx.s;
  const b = ensureLedgerBook(s);
  switch (o.op) {
    case 'note':
      break;
    case 'mode': {
      const up = MODES.indexOf(o.mode) > MODES.indexOf(b.mode);
      b.mode = o.mode;
      if (up) b.since = s.week;
      const r = MODE_INFO[o.mode].retain;
      b.weeks = b.weeks.filter((w) => w.week > s.week - 1 - r);
      if (o.mode === 'head') b.weeks = b.weeks.slice(-r);
      ctx.log.push(`The books: ${MODE_INFO[o.mode].name.toLowerCase()}.`);
      break;
    }
    case 'keeper':
      if (o.charId) b.keeperId = o.charId;
      else delete b.keeperId;
      break;
    case 'check': {
      const r = b.receipts.find((x) => x.id === o.receiptId);
      const c = r ? s.characters[r.byId] : undefined;
      if (!r || !c || r.checked) break;
      const caught = r.lie && roll01(s.seed, r.id, o.via, 'check') < checkOdds(s, r, o.via);
      r.checked = { via: o.via, week: s.week, caught };
      b.stats.checks++;
      if (o.via === 'enforcer' && c.alive && c.faction === 'player') addOpinion(s, c.id, s.playerId, 'Sent the enforcer to check my story', r.lie ? -2 : -5, 1);
      const bones = r.bonesOf ? s.characters[r.bonesOf]?.bones?.find((e) => r.job === `the ${e.job}`) : undefined;
      if (!caught) {
        if (!r.lie && bones) bones.verified = true;
        ctx.log.push(r.lie ? `Nothing turned up on ${c.firstName}'s story about ${r.job}.` : `${c.firstName}'s story about ${r.job} checks out.`);
        break;
      }
      b.stats.caught++;
      const short = r.actual - r.reported;
      b.discrepancies.push({ id: `dq${s.nextId++}`, week: s.week, whoId: c.id, kind: 'receipt', amount: Math.max(0, short), receiptId: r.id, truth: true, text: `${c.firstName} lied about ${r.job}: ${r.truth}${short > 0 ? ` He kept ${fmtMoney(short)}.` : ''}` });
      if (c.alive && c.faction === 'player') {
        addOpinion(s, s.playerId, c.id, `Lied to me about ${r.job}`, -15, 1);
        changeMeter(s, s.playerId, c.id, 'trust', -15);
      }
      // A lie about how he did on his bones job strikes the bones off his record.
      if (bones && r.truth.startsWith('I froze')) {
        c.bones = (c.bones ?? []).filter((e) => e !== bones);
        if (!c.bones.length) delete c.bones;
        if (c.proposedWeek !== undefined) delete c.proposedWeek;
        addStory(s, c, `It came out that he froze on ${r.job}. His bones were struck off.`);
        for (const m of crew(s)) if (m.capoId === c.capoId && m.id !== c.id) addOpinion(s, m.id, c.id, 'Froze and lied about it', -10, 1);
      }
      ctx.log.push(`${c.firstName}'s report on ${r.job} was a lie: ${r.truth}`);
      break;
    }
    case 'confront': {
      const d = b.discrepancies.find((x) => x.id === o.discId);
      const c = d ? s.characters[d.whoId] : undefined;
      if (!d || !c || d.settled) break;
      d.settled = 'confronted';
      d.settledWeek = s.week;
      b.stats.confronted++;
      if (d.truth) {
        const back = Math.max(0, Math.min(d.amount, Math.round(c.wealth)));
        if (back > 0) {
          money(ctx, back, `${label}: ${c.firstName} made it good`, 'event');
          tagLast(ctx, c.id, d.src);
          c.wealth -= back;
          b.stats.recovered += back;
        }
        if (d.kind === 'skim' && c.skimmed) c.skimmed = Math.max(0, c.skimmed - back);
        addOpinion(s, c.id, s.playerId, 'Caught me short in the books', -8, 1);
        changeMeter(s, c.id, s.playerId, 'fear', 10);
        addStory(s, c, `The boss showed him the page. He paid back ${fmtMoney(back)}.`);
      } else {
        addOpinion(s, c.id, s.playerId, 'Accused me of stealing', -15, 1);
        changeMeter(s, c.id, s.playerId, 'grievance', 10);
        addStory(s, c, 'The boss accused him of skimming. He never took a dime.');
      }
      break;
    }
    case 'forgive': {
      const d = b.discrepancies.find((x) => x.id === o.discId);
      if (!d || d.settled) break;
      d.settled = 'forgiven';
      d.settledWeek = s.week;
      const c = s.characters[d.whoId];
      if (c?.alive) addOpinion(s, c.id, s.playerId, 'The boss let it go', 3, 1);
      break;
    }
  }
}

/* ---------------------------------------------------------------- */
/* The screen (pure views)                                           */
/* ---------------------------------------------------------------- */

export type Section = 'kickup' | 'street' | 'business' | 'shylock' | 'tribute' | 'pad' | 'score' | 'cost' | 'debt' | 'rival' | 'heat' | 'other';
export const SECTION_LABEL: Record<Section, string> = {
  kickup: 'Kick-ups', street: 'Street', business: 'Businesses & rackets', shylock: 'Shylock book', tribute: 'Tribute to Philly', pad: 'The pad',
  score: 'Scores & jobs', cost: 'Costs', debt: 'Debts', rival: 'Rivals', heat: 'Raids & fines', other: 'Other',
};

const PAD = /^(Payroll: |Bribe: |Envelopes for the beat cops)|Grease the Chief|on the pad/;

export function classify(l: BookLine): Section {
  if (l.c === 'tribute') return 'tribute';
  if (PAD.test(l.l)) return 'pad';
  if (/^(Vig: |Loan repaid: )|shylock/i.test(l.l)) return 'shylock';
  if (/^(Big score|Heist: |Bones: )/.test(l.l)) return 'score';
  if (l.c === 'kickup') return 'kickup';
  if (l.c === 'street') return 'street';
  if (l.c === 'business') return 'business';
  if (l.c === 'debt') return 'debt';
  if (l.c === 'rival') return 'rival';
  if (l.c === 'heat') return 'heat';
  if (l.c === 'cost') return 'cost';
  return 'other';
}

/** The weeks the boss's books can show (by how they are kept). */
export function visibleWeeks(s: GameState): BookWeek[] {
  const b = s.ledgerBook;
  if (!b) return [];
  const r = MODE_INFO[b.mode].retain;
  return b.weeks.filter((w) => w.week >= b.since && w.week > s.week - 1 - r);
}

export function srcName(s: GameState, id?: string): string | undefined {
  if (!id) return undefined;
  return s.districts.find((d) => d.id === id)?.name ?? s.businesses.find((x) => x.id === id)?.name;
}

export interface BookFilter {
  who?: string;
  src?: string;
  section?: Section;
  week?: number;
}

export function filterLines(s: GameState, f: BookFilter): { week: number; line: BookLine; section: Section }[] {
  const out: { week: number; line: BookLine; section: Section }[] = [];
  for (const w of visibleWeeks(s)) {
    if (f.week !== undefined && w.week !== f.week) continue;
    for (const l of w.lines) {
      const sec = classify(l);
      if (f.who && l.w !== f.who) continue;
      if (f.src && l.s !== f.src) continue;
      if (f.section && sec !== f.section) continue;
      out.push({ week: w.week, line: l, section: sec });
    }
  }
  return out;
}

/** Per-capo kick-ups week by week (for the sparklines), with what he owes and how often he was light. */
export function capoTrends(s: GameState): { id: string; weeks: number[]; values: number[]; total: number; late: number; flagged: number }[] {
  const ws = visibleWeeks(s);
  const ids = new Set<string>();
  for (const c of crew(s)) if (c.rank === 'capo') ids.add(c.id);
  for (const w of ws) for (const l of w.lines) if (l.c === 'kickup' && l.w && s.characters[l.w]?.rank === 'capo') ids.add(l.w);
  const disc = s.ledgerBook?.discrepancies ?? [];
  return [...ids].map((id) => {
    const values = ws.map((w) => w.lines.filter((l) => l.w === id && l.c === 'kickup').reduce((a, l) => a + l.a, 0));
    return { id, weeks: ws.map((w) => w.week), values, total: values.reduce((a, v) => a + v, 0), late: Math.round(s.characters[id]?.arrears ?? 0), flagged: disc.filter((d) => d.whoId === id && !d.settled).length };
  }).sort((a, b) => b.total - a.total);
}

/** The reconciliation the screen prints: lines vs the real treasury change, per week. */
export function reconcileBooks(s: GameState): { week: number; lines: number; delta: number; ok: boolean }[] {
  return (s.ledgerBook?.weeks ?? []).map((w) => {
    const sum = w.lines.reduce((a, l) => a + l.a, 0);
    return { week: w.week, lines: sum, delta: w.end - w.start, ok: sum === w.end - w.start };
  });
}

/** The live lines of this week's report as they will be archived (exported for tests). */
export function moneyLines(lines: readonly ReportLine[]): ReportLine[] {
  return lines.filter((l) => l.stat === 'money' && l.amount !== 0);
}

/** The random player's orders. */
export function ledgerActions(s: GameState): PlayerAction[] {
  const b = s.ledgerBook;
  if (!b) return [];
  const out: PlayerAction[] = [];
  const w = s.week;
  if (w % 26 === 13) out.push({ kind: 'ledger', op: { op: 'mode', mode: MODES[(w / 13) % 3 | 0] } });
  const r = b.receipts.filter((x) => !x.checked && s.week - x.week < 12);
  if (r.length) out.push({ kind: 'ledger', op: { op: 'check', receiptId: r[w % r.length].id, via: w % 2 ? 'consigliere' : 'enforcer' } });
  const d = b.discrepancies.filter((x) => !x.settled);
  if (d.length) out.push({ kind: 'ledger', op: { op: w % 3 ? 'confront' : 'forgive', discId: d[w % d.length].id } });
  if (w % 52 === 20) {
    const acct = crew(s).find((c) => c.specialty === 'accountant') ?? crew(s).filter((c) => c.rank === 'soldier').sort((x, y) => y.attributes.business - x.attributes.business)[0];
    if (acct) out.push({ kind: 'ledger', op: { op: 'keeper', charId: acct.id } });
  }
  return out;
}

/** Category of every line in the week (for tests: the books hold exactly the ledger). */
export function weekCategories(w: BookWeek): Record<LedgerCategory, number> {
  const out = {} as Record<LedgerCategory, number>;
  for (const l of w.lines) out[l.c] = (out[l.c] ?? 0) + l.a;
  return out;
}

export type { Discrepancy };
