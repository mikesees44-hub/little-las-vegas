import { displayName, player } from './characters';
import { politicalEvidence } from './polIntegrity';
import { reached } from './history';
import { heat, money, respect, type Ctx } from './ledger';
import { chance, randInt } from './rng';
import { mgEffect } from './minigame';
import type { Choice, Effect, EventInstance, GameState, LegalOp, LegalState } from './types';
import { fleeChoices } from './fugitive';
import { legalPaused } from './travelState';

/**
 * The Long Game: the federal case against the boss himself.
 *
 *   quiet → investigation (a file opens) → grand jury (a few weeks of
 *   testimony; it may or may not return a true bill) → indicted (bail or a
 *   cell; plead or fight) → trial (a verdict) → prison (run things from
 *   inside; parole hearings) → parole (one slip and he goes back).
 *
 * Evidence builds from federal heat and from informants; from October 1970
 * the racketeering law makes it build faster and doubles what a conviction
 * costs. The player defends with lawyers, favors and lying low — never by
 * touching witnesses. Every money or heat change is a named ledger line.
 */

export const OPEN_FILE = 25;
export const GRAND_JURY = 50;
export const GJ_WEEKS = 6;
export const TRIAL_WEEKS = 8;
export const RETAINER = 2500;
export const BAIL = 10000;
export const INSIDE_COST = 150;
export const LAWYER = 'Abe Lindner, Esq.';

export function legalOf(s: GameState): LegalState {
  if (!s.legal || s.legal.personId !== s.playerId) {
    // A new boss: the case starts over, but his own file (Character.evidence) is what it is.
    s.legal = { stage: 'quiet', personId: s.playerId, defense: 0, since: s.week };
  }
  return s.legal;
}

/**
 * The evidence against the man the case is about. There is ONE evidence value
 * per character (`Character.evidence`, 0-100): the crew's crimes, the
 * dynasty's lawyers and the federal case all read and write the same file.
 */
export function caseEvidence(s: GameState, l: LegalState | undefined = s.legal): number {
  const c = s.characters[l?.personId ?? s.playerId];
  return c?.evidence ?? 0;
}

function setCaseEvidence(s: GameState, l: LegalState, v: number): void {
  const c = s.characters[l.personId];
  if (c) c.evidence = Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
}

export function ricoActive(s: GameState): boolean {
  return reached(s, 'rico');
}

/** Weekly evidence: what the feds gained this week, with the reasons. */
export function evidenceGain(s: GameState): { total: number; reasons: { label: string; value: number }[] } {
  const reasons: { label: string; value: number }[] = [];
  const fed = s.heat.federal;
  if (fed > 35) reasons.push({ label: `Federal heat ${fed}`, value: (fed - 35) / 12 });
  else if (fed < 25) reasons.push({ label: 'The feds have other cases', value: -0.6 });
  if ((s.flags.informant ?? 0) > 0) reasons.push({ label: 'An informant in your crew', value: 1.2 });
  if (s.unwashed > 15000) reasons.push({ label: 'Dirty cash nobody can explain', value: 0.5 });
  if (s.edicts?.lowprofile) reasons.push({ label: 'Edict: low profile', value: -0.4 });
  reasons.push(...politicalEvidence(s));
  let total = reasons.reduce((a, r) => a + r.value, 0);
  if (ricoActive(s) && total > 0) {
    reasons.push({ label: 'Racketeering law (RICO): the enterprise is the crime', value: total * 0.5 });
    total *= 1.5;
  }
  return { total, reasons };
}

/** Odds a trial ends in conviction. */
export function convictionOdds(s: GameState, l: LegalState): number {
  return Math.max(0.1, Math.min(0.9, 0.15 + (caseEvidence(s, l) - l.defense) / 100));
}

/** Odds the grand jury returns an indictment. */
export function indictOdds(s: GameState, l: LegalState): number {
  return Math.max(0.1, Math.min(0.9, (caseEvidence(s, l) - l.defense / 2) / 100));
}

const STAGE_LABEL: Record<LegalState['stage'], string> = {
  quiet: 'No case',
  investigation: 'Under investigation',
  grandjury: 'Before a grand jury',
  indicted: 'Indicted',
  trial: 'On trial',
  prison: 'In prison',
  parole: 'On parole',
};
export function stageLabel(l: LegalState): string {
  return STAGE_LABEL[l.stage];
}

function ev(s: GameState, defId: string, title: string, text: string, choices: Choice[], def: string, iid = `ev${s.nextId++}`): EventInstance {
  return { iid, defId, week: s.week, mandatory: true, priority: 92, title, text, choices, defaultChoiceId: def, actors: [s.playerId] };
}

function L(op: LegalOp, amount?: number, label = 'The case'): Effect {
  return { type: 'legal', op, amount, label };
}

export function buildGrandJury(s: GameState): EventInstance {
  const l = legalOf(s);
  const label = 'Grand jury';
  return ev(s, 'grand_jury', 'A grand jury is sitting', `Assistant U.S. Attorney Walter Keough has a grand jury in Camden hearing about you. Men you know are getting subpoenas. Evidence so far: ${Math.round(caseEvidence(s, l))}. Odds of an indictment if nothing changes: ${Math.round(indictOdds(s, l) * 100)}%.`, [
    { id: 'lawyer', label: `Retain ${LAWYER}`, detail: '$4,000. The best criminal lawyer in the Delaware Valley.', because: 'hired the best lawyer in the Delaware Valley', effects: [{ type: 'money', amount: -4000, label }, L('defense', 20, label)], disabledReason: s.money < 4000 ? 'Needs $4,000' : undefined },
    { id: 'favor', label: 'Call in a favor at the courthouse', detail: 'A friendly clerk loses some paperwork.', because: 'called in a favor at the courthouse', effects: [{ type: 'favor', amount: -1, label }, L('evidence', -15, label)], disabledReason: s.favors < 1 ? 'No favors to call in' : undefined },
    { id: 'lielow', label: 'Lie low', detail: 'No new rackets, no meetings, no photographs.', because: 'lay low while the grand jury sat', effects: [{ type: 'respect', amount: -3, label }, L('evidence', -8, label)] },
    { id: 'nothing', label: 'Say nothing, do nothing', because: 'ignored the grand jury', effects: [L('evidence', 0, label)] },
  ], 'lielow');
}

export function buildIndictment(s: GameState): EventInstance {
  const l = legalOf(s);
  const label = 'Indictment';
  const iid = `ev${s.nextId++}`;
  return ev(s, 'indictment', 'Indicted', `The grand jury returned a true bill${l.rico ? ' under the new racketeering law' : ''}. Federal marshals came for ${player(s).firstName} at breakfast. Trial is set for ${TRIAL_WEEKS} weeks out.`, [
    { id: 'arraign', label: 'Stand up at the arraignment', detail: 'Play it: the plea, bail, the government\'s offer, the lawyer.', because: 'stood up at his arraignment', effects: [mgEffect('arraignment', iid, { defendant: s.playerId, mode: 'boss', play: 1 }, undefined, label)] },
    { id: 'bail', label: 'Post bail and fight it', detail: `$${BAIL.toLocaleString('en-US')} bond. He stays home until trial.`, because: 'posted bail and fought the charges', effects: [{ type: 'money', amount: -BAIL, label }, L('bail', 1, label), L('fight', 0, label)], disabledReason: s.money < BAIL ? `Needs $${BAIL.toLocaleString('en-US')}` : undefined },
    { id: 'jail', label: 'No bail: fight it from a cell', detail: 'He waits for trial in the county jail.', because: 'fought the charges from a cell', effects: [L('jail', 0, label), L('fight', 0, label)] },
    { id: 'plea', label: 'Plead guilty to a lesser count', detail: `No trial. A shorter stretch (${l.rico ? '18–30' : '12–24'} months), and the men see him take it.`, because: 'pleaded guilty to a lesser count', effects: [{ type: 'respect', amount: -6, label }, L('plea', 0, label)] },
 
    // On the lam (travel branch): run instead of facing it.
    ...fleeChoices(s),
  ], s.money >= BAIL ? 'bail' : 'jail', iid);
}

export function buildTrial(s: GameState): EventInstance {
  const l = legalOf(s);
  const label = 'The trial';
  const iid = `ev${s.nextId++}`;
  const fx = (play: number) => mgEffect('trial', iid, { defendant: s.playerId, mode: 'boss', play }, undefined, label);
  return ev(s, 'trial', 'United States v. ' + player(s).lastName, `Federal court in Camden. Walter Keough lays out ${Math.round(caseEvidence(s, l))} points of evidence; the defense has ${Math.round(l.defense)}. As it stands the jury convicts ${Math.round(convictionOdds(s, l) * 100)}% of the time.`, [
    { id: 'court', label: 'Go to trial', detail: 'Play it: the jury, the government\'s witnesses, your defense, the verdict.', because: 'went to trial', effects: [fx(1)] },
    { id: 'quiet', label: 'Let it play out', detail: 'The lawyer does the talking. Same odds, no say.', because: 'let the lawyer do the talking', effects: [fx(0)] },
    { id: 'plea', label: 'Plead guilty on the courthouse steps', detail: `A shorter stretch (${l.rico ? '18–30' : '12–24'} months), and the men see him take it.`, because: 'pleaded guilty on the courthouse steps', effects: [{ type: 'respect', amount: -6, label }, L('plea', 0, label)] },
  ], 'quiet', iid);
}

export function buildParole(s: GameState): EventInstance {
  const l = legalOf(s);
  const label = 'Parole board';
  return ev(s, 'parole', 'The parole board', `${player(s).firstName} has served ${l.served ?? 0} weeks of ${l.sentence ?? 0}. The board meets in Trenton.`, [
    { id: 'model', label: 'A model prisoner', detail: 'Chapel on Sunday, the prison library.', because: 'went before the parole board a model prisoner', effects: [L('parole', 0, label)] },
    { id: 'lawyer', label: 'A lawyer at the hearing', detail: '$3,000.', because: 'sent a lawyer to the parole hearing', effects: [{ type: 'money', amount: -3000, label }, L('parole', 20, label)], disabledReason: s.money < 3000 ? 'Needs $3,000' : undefined },
    { id: 'favor', label: 'A word from the assemblyman', detail: 'One favor.', because: 'had a word put in with the parole board', effects: [{ type: 'favor', amount: -1, label }, L('parole', 30, label)], disabledReason: s.favors < 1 ? 'No favors' : undefined },
  ], 'model');
}

export function sendToPrison(ctx: Ctx, weeks: number, why: string): void {
  const s = ctx.s;
  const l = legalOf(s);
  const b = player(s);
  l.stage = 'prison';
  l.sentence = weeks;
  l.served = 0;
  l.next = s.week + Math.max(8, Math.round(weeks / 3));
  l.since = s.week;
  b.imprisonedUntil = s.week + weeks;
  respect(ctx, -5, `${why}: the boss goes away`, 'heat');
  heat(ctx, 'federal', -30, `${why}: the feds have their man`, 'heat');
  const yrs = (weeks / 52).toFixed(1).replace('.0', '');
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(b)} was sentenced to ${yrs} years in federal prison.`, because: why, kind: 'heat' });
  if (s.cutscenes.length < 3) s.cutscenes.push({ key: 'arrest_interrogation', title: 'Sentenced', text: `${yrs} years. ${b.firstName} doesn't look at the jury on the way out.`, week: s.week });
}

/** The jury walks him: the case closes. */
export function acquitBoss(ctx: Ctx): void {
  const s = ctx.s;
  const l = legalOf(s);
  const b = player(s);
  respect(ctx, 10, 'Acquitted: the jury walks him', 'event');
  heat(ctx, 'federal', -20, 'Acquitted: the feds are embarrassed', 'heat');
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(b)} was acquitted. He walked out the front door of the federal building.`, kind: 'heat' });
  b.imprisonedUntil = undefined;
  setCaseEvidence(s, l, 0);
  Object.assign(l, { stage: 'quiet', defense: 0, since: s.week, next: undefined, bail: undefined });
}

/** Applies a legal effect (from an event choice or an order). */
export function applyLegal(ctx: Ctx, op: LegalOp, amount = 0): void {
  const s = ctx.s;
  const l = legalOf(s);
  const b = player(s);
  switch (op) {
    case 'defense':
      l.defense = Math.max(0, l.defense + amount);
      break;
    case 'evidence':
      setCaseEvidence(s, l, caseEvidence(s, l) + amount);
      break;
    case 'bail':
      l.bail = true;
      break;
    case 'jail':
      l.bail = false;
      b.imprisonedUntil = s.week + TRIAL_WEEKS;
      break;
    case 'fight':
      l.stage = 'trial';
      l.next = s.week + TRIAL_WEEKS;
      break;
    case 'plea': {
      const w = randInt(s, 52, 104) * (l.rico ? 1.25 : 1);
      sendToPrison(ctx, Math.round(w), 'Guilty plea');
      break;
    }
    case 'verdict': {
      const p = convictionOdds(s, l);
      if (chance(s, p)) {
        const w = randInt(s, 156, 312) * (l.rico ? 1.6 : 1);
        sendToPrison(ctx, Math.round(w), l.rico ? 'Convicted under RICO' : 'Convicted');
      } else {
        acquitBoss(ctx);
      }
      break;
    }
    case 'parole': {
      const p = Math.max(0.1, Math.min(0.9, 0.3 + amount / 100 + ((l.served ?? 0) / Math.max(1, l.sentence ?? 1)) * 0.4 - (s.heat.federal > 60 ? 0.15 : 0)));
      if (chance(s, p)) {
        const left = (b.imprisonedUntil ?? s.week) - s.week;
        b.imprisonedUntil = undefined;
        l.stage = 'parole';
        l.next = s.week + Math.max(8, left);
        l.since = s.week;
        respect(ctx, 3, 'Paroled: the boss is home', 'event');
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(b)} was paroled after ${l.served} weeks.`, kind: 'heat' });
      } else {
        l.next = s.week + 26;
        ctx.log.push('Parole denied. The next hearing is in six months.');
      }
      break;
    }
  }
}

/** The case moves forward each week. */
export function legalWeek(ctx: Ctx): void {
  const s = ctx.s;
  const l = legalOf(s);
  const b = player(s);
  // The case waits while the man it is about is on the lam (fugitive.ts).
  if (legalPaused(s, l.personId)) return;
  if (ricoActive(s) && !l.rico && l.stage !== 'prison' && l.stage !== 'parole') l.rico = true;
  switch (l.stage) {
    case 'quiet':
    case 'investigation': {
      setCaseEvidence(s, l, caseEvidence(s, l) + evidenceGain(s).total);
      if (l.stage === 'quiet' && caseEvidence(s, l) >= OPEN_FILE) {
        l.stage = 'investigation';
        l.since = s.week;
        ctx.log.push('The FBI has opened a file on the boss himself.');
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The FBI opened a file on ${displayName(b)}.`, kind: 'heat' });
      } else if (l.stage === 'investigation' && caseEvidence(s, l) < OPEN_FILE - 10) {
        l.stage = 'quiet';
        ctx.log.push('The FBI file on the boss has gone cold.');
      } else if (l.stage === 'investigation' && caseEvidence(s, l) >= GRAND_JURY) {
        l.stage = 'grandjury';
        l.since = s.week;
        l.next = s.week + GJ_WEEKS;
        s.eventQueue.push(buildGrandJury(s));
      }
      break;
    }
    case 'grandjury': {
      setCaseEvidence(s, l, caseEvidence(s, l) + evidenceGain(s).total / 2);
      if (s.week >= (l.next ?? s.week)) {
        if (chance(s, indictOdds(s, l))) {
          l.stage = 'indicted';
          l.since = s.week;
          s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(b)} was indicted by a federal grand jury${l.rico ? ' under the racketeering law' : ''}.`, kind: 'heat' });
          if (s.cutscenes.length < 3) s.cutscenes.push({ key: 'arrest_interrogation', title: 'Indicted', text: `Marshals at the door before the coffee is poured. ${b.firstName} asks for his hat.`, week: s.week });
          s.eventQueue.push(buildIndictment(s));
        } else {
          l.stage = 'investigation';
          setCaseEvidence(s, l, caseEvidence(s, l) - 20);
          respect(ctx, 4, 'No true bill: the grand jury goes home', 'event');
          s.chronicle.push({ week: s.week, date: { ...s.date }, text: 'The grand jury declined to indict.', kind: 'heat' });
        }
      }
      break;
    }
    case 'indicted':
      // Waiting for the choice (bail/jail/plea). If the card was lost, ask again.
      if (s.week - l.since >= 3 && !s.pendingEvents.some((e) => e.defId === 'indictment') && !s.eventQueue.some((e) => e.defId === 'indictment')) {
        l.since = s.week;
        s.eventQueue.push(buildIndictment(s));
      }
      break;
    case 'trial':
      if (s.week >= (l.next ?? s.week) && !s.eventQueue.some((e) => e.defId === 'trial') && !s.pendingEvents.some((e) => e.defId === 'trial')) s.eventQueue.push(buildTrial(s));
      break;
    case 'prison': {
      l.served = (l.served ?? 0) + 1;
      if (!b.imprisonedUntil || b.imprisonedUntil <= s.week + 1) {
        setCaseEvidence(s, l, 0);
        Object.assign(l, { stage: 'quiet', defense: 0, since: s.week, next: undefined });
        respect(ctx, 4, 'Out: the boss served his time', 'event');
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(b)} walked out of prison, his time served.`, kind: 'heat' });
        break;
      }
      money(ctx, -INSIDE_COST, 'Running things from inside: the lawyer carries messages', 'cost');
      if (s.week % 4 === 0) respect(ctx, -1, 'Running things from inside: out of sight, out of mind', 'drift');
      if (s.week >= (l.next ?? Infinity) && !s.pendingEvents.some((e) => e.defId === 'parole')) {
        l.next = s.week + 26;
        s.eventQueue.push(buildParole(s));
      }
      break;
    }
    case 'parole':
      if (s.heat.federal >= 70 && chance(s, 0.12)) {
        const left = Math.max(26, (l.next ?? s.week) - s.week);
        b.imprisonedUntil = s.week + left;
        l.stage = 'prison';
        l.next = s.week + left + 1;
        respect(ctx, -4, 'Parole violated: back inside', 'heat');
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(b)} violated his parole and went back inside.`, kind: 'heat' });
      } else if (s.week >= (l.next ?? s.week)) {
        setCaseEvidence(s, l, 0);
        Object.assign(l, { stage: 'quiet', defense: 0, since: s.week, next: undefined });
        ctx.log.push('Parole is over. The boss is a free man.');
      }
      break;
  }
}

/** Is the boss behind bars right now? */
export function bossInside(s: GameState): boolean {
  const b = s.characters[s.playerId];
  return !!b && (b.imprisonedUntil ?? 0) > s.week;
}
