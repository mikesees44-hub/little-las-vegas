import { capos, crew, displayName, hasTrait, isFree, player } from './characters';
import { chooseHeir, succeed } from './dynasty';
import { registerEventSource } from './events';
import { capoOf, addStory } from './hierarchy';
import { heat, respect, type Ctx } from './ledger';
import { acquitBoss, BAIL, legalOf, ricoActive, sendToPrison, TRIAL_WEEKS } from './longgame';
import {
  beat, between, choose, clamp, hit, mgEffect, mgOf, mgView, pct, registerMinigame, roll, usd,
  type MgOption, type MgOutcome, type MgSession, type MinigameDef,
} from './minigame';
import { BULLETIN, LEADER } from './newspaper';
import { addOpinion, getRelation } from './relations';
import {
  BASE, buildCase, caseStrength, convictionP, credibilityOf, DEFENSE_STRIKES, fixerOf, hangChance, LAWYER_BY_ID, LAWYERS,
  makePool, npcFlipReasons, pickJudge, SEATS, sumP, type Angle, type CaseItem, type Judge, type Juror, type OddsInput,
} from './trialCase';
import type { Character, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * TRIAL MODE. A courtroom drama in eight acts, played as a mini-game:
 *
 *   arraignment & bail → the choice to flip → the lawyer → jury selection →
 *   the prosecution's case (object, cross-examine, challenge the chain of
 *   custody, concede) → the defense case → closing → the verdict → sentencing
 *
 * The boss's federal case runs in two sittings (the arraignment at the
 * indictment, the trial eight weeks later — the Long Game's clock). A crew
 * man, a member of the house or a rival who is arrested with enough
 * evidence gets the whole thing in one sitting. Letting it play out uses the
 * same engine with the lawyer's default play.
 */

type Mode = 'boss' | 'crew' | 'rival';
type Side = 'defense' | 'prosecution' | 'out';

export interface TrialData {
  mode: Mode;
  side: Side;
  defendantId: string;
  defName: string;
  first: string;
  last: string;
  rico: boolean;
  evidence: number;
  baseDefense: number;
  counts: string[];
  prosecutor: string;
  court: string;
  judge: Judge;
  lawyerId?: string;
  /** Retained at the arraignment (already paid). */
  lawyerPaid?: boolean;
  pool: Juror[];
  strikes: number;
  items: CaseItem[];
  cur: number;
  defensePts: number;
  defenseLog: { label: string; value: number }[];
  used: string[];
  closing?: string;
  closingBonus: number;
  spent: number;
  favors: number;
  bail?: 'bail' | 'held';
  flipReasons?: { label: string; value: number }[];
  flipped?: boolean;
  tamper?: { jurorId: string; ok: boolean; risk: number };
  fixerPicks?: string[];
  verdict?: 'acquitted' | 'partial' | 'convicted' | 'hung' | 'mistrial' | 'plea' | 'flipped';
  pFinal?: number;
  ballots?: number[];
  sentence?: number;
  sentenceNote?: string;
  fixerJudge?: 'ok' | 'caught' | 'failed';
  path?: 'heir' | 'witness';
  exposed?: boolean;
  /** Crew: the time he was looking at when arrested. */
  weeks: number;
  /** No help from the house (crew): a public defender and nothing else. */
  nohelp?: boolean;
  /** Rival: which outfit. */
  rival?: RivalId;
  dealSeen?: boolean;
  /** His capo when arrested (the man a flipper testifies against). */
  capoId?: string;
  /** The arrest at dawn: what he did before the marshals took him. */
  knock?: 'quiet' | 'lawyer' | 'ledger';
  knockEvidence?: number;
  wsec?: number;
}

type TS = MgSession<TrialData>;

/* ---------------------------------------------------------------- */
/* Setup                                                             */
/* ---------------------------------------------------------------- */

const COUNTS_BOSS = ['Conspiracy to conduct an illegal gambling business', 'Extortionate extension of credit (loansharking)', 'Interstate travel in aid of racketeering'];
const COUNTS_CREW: Record<string, string> = {
  muscle: 'Assault and battery', earner: 'Receiving stolen goods', driver: 'Interstate transport of stolen property', bookmaker: 'Bookmaking',
  collector: 'Extortion', burglar: 'Breaking and entering', talker: 'Conspiracy',
};

function heirChild(s: GameState, c: Character | undefined): Character | undefined {
  return c?.childrenIds.map((id) => s.characters[id]).find((k) => k?.alive && k.gender === 'M' && s.date.y - k.birth.y >= 16);
}

function defendant(s: GameState, ses: TS): Character | undefined {
  return s.characters[ses.d.defendantId];
}

function initTrial(s: GameState, ses: TS, arraignmentOnly: boolean): { d: TrialData; intro: TS['intro']; phase: string } {
  const id = String(ses.params.defendant ?? s.playerId);
  const c = s.characters[id];
  const mode = (String(ses.params.mode ?? 'boss') as Mode);
  const side = (String(ses.params.side ?? (mode === 'rival' ? 'out' : 'defense')) as Side);
  const rico = ricoActive(s) && mode !== 'crew' ? true : ricoActive(s) && (c?.rank === 'capo' || c?.rank === 'underboss');
  const l = mode === 'boss' ? s.legal : undefined;
  const rival = mode === 'rival' ? (c?.faction as RivalId) : undefined;
  const r = rival ? s.rivals.find((x) => x.id === rival) : undefined;
  const evidence = Math.round(Math.max(c?.evidence ?? 0, mode === 'rival' ? (r?.exposure ?? 0) : 0) * 10) / 10;
  const mg = mgView(s);
  const obstruction = mg.obstruction[id] ?? 0;
  const counts = mode === 'boss' ? [...COUNTS_BOSS] : [COUNTS_CREW[c?.craft ?? 'talker'] ?? 'Conspiracy', 'Conspiracy'];
  if (rico) counts.push('Racketeering (RICO): conducting an enterprise');
  for (let i = 0; i < obstruction; i++) counts.push('Obstruction of justice');
  const lawyerId = mode === 'boss' ? mg.lawyer[id] : undefined;
  const d: TrialData = {
    mode, side, defendantId: id, defName: c ? displayName(c) : 'the defendant', first: c?.firstName ?? '', last: c?.lastName ?? '',
    rico, evidence, baseDefense: mode === 'boss' ? (l?.defense ?? 0) : 0, counts,
    prosecutor: mode === 'crew' ? 'Assistant Prosecutor Dolores Fiore' : 'Assistant U.S. Attorney Walter Keough',
    court: mode === 'crew' ? 'Cape May County Superior Court, Cape May Court House' : 'U.S. District Court, Camden',
    judge: pickJudge(ses), lawyerId, lawyerPaid: !!lawyerId, pool: [], strikes: DEFENSE_STRIKES, items: [], cur: 0,
    defensePts: 0, defenseLog: [], used: [], closingBonus: 0, spent: 0, favors: 0, weeks: Number(ses.params.weeks ?? 52),
    nohelp: ses.params.nohelp === 1 || undefined, rival, capoId: c ? capoOf(s, c)?.id : undefined,
  };
  if (!arraignmentOnly && c) d.items = buildCase(s, c, evidence, rico, ses);
  const who = c ? displayName(c) : 'The defendant';
  const intro = arraignmentOnly
    ? { title: `United States v. ${d.last}`, kicker: 'The arrest', text: `6:10 a.m. The knock. ${c?.spouseId && s.characters[c.spouseId]?.alive ? 'Your wife in her robe at the top of the stairs.' : 'The hall light comes on next door.'} A young agent who can't be thirty reads the warrant like it's poetry. Later: federal court in Camden, nine in the morning. ${who} in yesterday's suit, a marshal at each elbow. ${d.counts.length} counts. The press is three rows deep and every one of them already has a headline.`, scene: 'courtroom' }
    : mode === 'boss'
      ? { title: `United States v. ${d.last}`, kicker: 'The trial', text: `${d.court}. ${d.judge.name} on the bench. ${d.prosecutor} has ${d.items.length} things to show twelve people from Cape May County. ${who} has his lawyer, his good suit, and his mother in the second row.`, scene: 'courtroom' }
      : mode === 'crew'
        ? { title: `State v. ${d.last}`, kicker: 'A trial for one of yours', text: `${who} was picked up and the county wants a conviction. ${d.court}. What he faces: ${d.counts[0].toLowerCase()}${d.counts.length > 1 ? ' and more' : ''}. What he knows: a great deal about you.`, scene: 'courtroom' }
        : { title: `United States v. ${d.last}`, kicker: `${r?.shortName ?? 'A rival'} in the dock`, text: `The government has ${who} in a courtroom in Camden. You could help his lawyer. You could help the prosecutor. Or you could watch.`, scene: 'courtroom' };
  let phase = arraignmentOnly && mode === 'boss' ? 'knock' : 'arraign';
  if (mode === 'rival') phase = 'side';
  else if (!arraignmentOnly && mode === 'boss') phase = lawyerId ? 'jury' : 'lawyer';
  if (!arraignmentOnly && phase === 'jury') setupPool(s, ses, d);
  return { d, intro, phase };
}

function setupPool(s: GameState, ses: TS, d: TrialData): void {
  const L = lawyer(d);
  d.pool = makePool(s, ses, L.skill, L.local);
  const plant = d.pool.find((j) => j.plant);
  if (plant && hit(ses, L.skill / 160)) beat(ses, `${L.name.split(' ').pop()} leans over: "Something about ${plant.name.split(' ')[0]}, the ${plant.job.toLowerCase()}, bothers me."`, 'info');
}

/* ---------------------------------------------------------------- */
/* Odds                                                              */
/* ---------------------------------------------------------------- */

function lawyer(d: TrialData) {
  return LAWYER_BY_ID[d.lawyerId ?? (d.mode === 'rival' && d.side !== 'defense' ? 'lindner' : 'kaminsky')] ?? LAWYERS[3];
}

function lawyerFee(d: TrialData, id: string): number {
  const L = LAWYER_BY_ID[id];
  let fee = d.mode === 'boss' ? L.cost : Math.round(L.cost / 2);
  if (d.mode === 'boss' && id === 'lindner' && d.baseDefense >= 20) fee = 2000;
  return fee;
}

function oddsIn(d: TrialData): OddsInput {
  const L = lawyer(d);
  return { items: d.items, baseDefense: d.baseDefense, lawyerSkill: L.skill, defensePts: d.defensePts, closingBonus: d.closingBonus, jurors: d.pool, taint: L.taint };
}

/** Conviction odds the player sees (his lawyer's read of the jury), and the truth. */
export function trialOdds(ses: TS, truth = false): { p: number; parts: { label: string; value: number }[] } {
  return convictionP(oddsIn(ses.d), truth);
}

function money(s: GameState, d: TrialData): number {
  return s.money - d.spent;
}

/* ---------------------------------------------------------------- */
/* Options                                                           */
/* ---------------------------------------------------------------- */

function objectOdds(s: GameState, d: TrialData, it: CaseItem): number {
  const L = lawyer(d);
  let p = 0.1 + L.skill / 400 - d.judge.strict;
  if (it.kind === 'informant') p += 0.2;
  if (it.kind === 'words' && s.date.y >= 1966) p += 0.12;
  if (it.kind === 'tapes') p += 0.08;
  if (it.kind === 'flipper' || it.kind === 'eyewitness') p -= 0.05;
  return clamp(p, 0.04, 0.7);
}

const ANGLES: Record<Angle, { line: (w: string) => string; label: string }> = {
  deal: { label: 'His deal with the government', line: (w) => `"Mr. ${w}, how many years did the government take off your sentence for this story?"` },
  vice: { label: 'His drinking, his debts', line: () => `"You'd had a few that night, hadn't you? And you owed money to half the boardwalk?"` },
  grudge: { label: 'His grudge', line: () => `"Isn't it true you've hated my client ever since he passed you over?"` },
  memory: { label: 'His memory', line: () => `"It was dark, it was raining, and it was three years ago. How sure are you, really?"` },
};

function crossOdds(d: TrialData, it: CaseItem, a: Angle): number {
  const L = lawyer(d);
  const w = it.witness!;
  return clamp(0.2 + L.skill / 300 + (w.weak === a ? 0.25 : 0) - w.credibility / 300, 0.05, 0.85);
}

function custodyOdds(d: TrialData, it: CaseItem): number {
  const L = lawyer(d);
  return clamp(0.16 + L.skill / 350 + (it.kind === 'money' || it.kind === 'surveillance' ? 0.08 : 0) + (it.kind === 'tapes' ? 0.05 : 0), 0.05, 0.75);
}

function current(d: TrialData): CaseItem | undefined {
  return d.items[d.cur];
}

interface DefWitness {
  id: string;
  label: string;
  detail: string;
  value: number;
  risk: number;
}

function defenseWitnesses(s: GameState, d: TrialData): DefWitness[] {
  const c = s.characters[d.defendantId];
  if (!c) return [];
  const out: DefWitness[] = [];
  const wife = c.spouseId ? s.characters[c.spouseId] : undefined;
  if (wife?.alive) out.push({ id: 'wife', label: `${wife.firstName} swears he was home`, detail: 'An alibi from his wife. Juries like her; prosecutors love to break alibis.', value: 7, risk: 0.3 });
  else if (c.household?.wife) out.push({ id: 'wife', label: `${c.household.wife} swears he was home`, detail: 'An alibi from his wife.', value: 6, risk: 0.3 });
  const mother = c.motherId ? s.characters[c.motherId] : undefined;
  if (mother?.alive) out.push({ id: 'mother', label: `His mother, in her Sunday best`, detail: `${mother.firstName} ${mother.lastName}. She does not say much. She does not have to.`, value: 5, risk: 0.05 });
  const pious = hasTrait(c, 'Pious');
  out.push({ id: 'priest', label: 'Father Dominic Russo of St. Ann\'s', detail: pious ? 'He has known him since First Communion.' : 'He has seen him at Christmas and Easter, mostly.', value: pious ? 6 : 3, risk: 0.05 });
  const front = s.frontManId ? s.characters[s.frontManId] : undefined;
  if (front?.alive && d.mode === 'boss') out.push({ id: 'front', label: `${front.firstName} ${front.lastName}, a businessman`, detail: 'A clean man with a clean record vouches for him.', value: 4, risk: 0.1 });
  return out;
}

function testifyOdds(s: GameState, d: TrialData): number {
  const c = s.characters[d.defendantId];
  if (!c) return 0.3;
  return clamp(0.22 + c.attributes.diplomacy / 160 + (hasTrait(c, 'Charming') ? 0.1 : 0) - (hasTrait(c, 'Hot-headed') ? 0.12 : 0), 0.1, 0.85);
}

function closings(d: TrialData, s: GameState): { id: string; label: string; detail: string; bonus: number }[] {
  const out = d.items.filter((x) => x.status === 'out').length;
  const rem = caseStrength(d.items);
  const wit = d.items.filter((x) => (x.kind === 'flipper' || x.kind === 'informant') && x.status !== 'out').reduce((a, x) => a + x.strength, 0);
  const seated = d.pool.filter((j) => j.seated);
  const famJ = seated.filter((j) => j.tags.includes('family')).length;
  const fam = d.used.filter((u) => u === 'wife' || u === 'mother').length;
  const fronts = s.businesses.filter((b) => b.owner === 'player' && b.category === 'front').length;
  const list = [
    { id: 'doubt', label: '"Reasonable doubt"', detail: 'Walk them through every hole in the government\'s case.', bonus: 4 + out * 3 + (rem < 35 ? 4 : 0) },
    { id: 'family', label: '"A family man, a neighbor"', detail: 'He coached Little League. He paid for the church roof.', bonus: 2 + fam * 3 + famJ },
    { id: 'overreach', label: '"Government overreach"', detail: 'Washington came to Cape May County to make an example of a local man.', bonus: d.rico ? 9 : 2 + out },
    { id: 'business', label: '"A businessman, not a gangster"', detail: 'Pizza, a laundromat, a motel. Is that a crime now?', bonus: Math.min(8, 1 + fronts * 2) },
  ];
  if (wit > 0) list.splice(1, 0, { id: 'rat', label: '"The rat is lying to save himself"', detail: 'Every word from a government witness was bought with years off his own sentence.', bonus: Math.round(3 + (wit / Math.max(1, rem)) * 12) });
  return list;
}

function sentenceBase(d: TrialData, partial: boolean, ses: TS): number {
  if (d.mode === 'boss') return Math.round(between(ses, 156, 312) * (d.rico ? 1.6 : 1) * (partial ? 0.55 : 1) * d.judge.temper);
  if (d.mode === 'rival') return Math.round(between(ses, 104, 260) * (partial ? 0.55 : 1) * d.judge.temper);
  return Math.round(d.weeks * (partial ? 0.75 : 1.2) * d.judge.temper);
}

function opts(s: GameState, ses: TS): MgOption[] {
  const d = ses.d;
  const c = defendant(s, ses);
  const nm = d.first;
  switch (ses.phase) {
    case 'knock': {
      const kid = heirChild(s, c);
      return [
        { id: 'knock_quiet', label: 'Go quietly', detail: 'Hat, coat, no scene on the front steps. The neighbors notice (+2 respect).' },
        { id: 'knock_lawyer', label: 'Call the lawyer first', detail: 'Make them wait in the vestibule while you dial (+5 defense).' },
        { id: 'knock_ledger', label: `Tell ${kid ? `your son ${kid.firstName}` : 'your wife'} where the ledger is`, detail: 'If it moves before the search warrant, −8 evidence. If they hear you, +6.', odds: 0.65, tone: 'risky' },
      ];
    }
    case 'side':
      return [
        { id: 'side_defense', label: 'Help his defense', detail: `$2,000 to his lawyer, quietly. ${d.rival ? 'His outfit will remember.' : ''}`, cost: 2000, disabled: money(s, d) < 2000 ? 'Needs $2,000' : undefined },
        { id: 'side_prosecution', label: 'Help the prosecutor', detail: 'Feed the government what you know about him. If it gets out you were talking to them, Philadelphia will not like it.', tone: 'dirty' },
        { id: 'side_out', label: 'Stay out of it', detail: 'Read about it in the Bulletin.' },
      ];
    case 'arraign':
      if (d.mode === 'boss') {
        return [
          { id: 'notguilty', label: '"Not guilty, Your Honor."', detail: 'Fight it. Trial in eight weeks.' },
          { id: 'guilty', label: 'Plead guilty to a lesser count', detail: `No trial. ${d.rico ? '18–30' : '12–24'} months, and the men watch him take it.`, tone: 'safe' },
        ];
      }
      return [
        { id: 'bail', label: `Post his bail (${usd(1500)})`, detail: 'He is home tonight and he knows who came through.', cost: 1500, disabled: money(s, d) < 1500 ? 'Needs $1,500' : undefined },
        { id: 'held', label: 'Let him sit until trial', detail: 'The county jail. A long time to think.' },
        { id: 'pleadout', label: 'Tell him to plead out', detail: `No trial: about ${Math.round(d.weeks * 0.6)} weeks, and the government gets nothing from him.`, tone: 'safe' },
      ];
    case 'bail':
      return [
        { id: 'bail', label: `Post bail (${usd(BAIL)})`, detail: 'He goes home to wait for trial.', cost: BAIL, disabled: money(s, d) < BAIL ? `Needs ${usd(BAIL)}` : undefined },
        { id: 'held', label: 'Wait in a cell', detail: 'The county jail until trial. Things get run through the lawyer.' },
      ];
    case 'flip': {
      if (d.mode === 'boss') {
        return [
          { id: 'standup', label: 'Stand up', detail: '"I got nothing to say to you."' },
          { id: 'flip', label: 'Call the U.S. Attorney', detail: 'Become a cooperating witness: little or no time, a new name somewhere far away. The family will know. You are marked.', drastic: true, tone: 'dirty' },
        ];
      }
      const p = sumP(d.flipReasons ?? []);
      const k = c ? capoOf(s, c) : undefined;
      return [
        { id: 'envelope', label: `An envelope for his family every week (${usd(1200)})`, detail: `Odds he flips: ${pct(p)} → ${pct(Math.max(0.02, p - 0.12))}`, cost: 1200, disabled: money(s, d) < 1200 ? 'Needs $1,200' : undefined },
        ...(k && k.alive && isFree(s, k) ? [{ id: 'capo', label: `Send ${k.firstName} to see him`, detail: `His capo reminds him who he is. Odds: ${pct(p)} → ${pct(Math.max(0.02, p - 0.08))}` }] : []),
        { id: 'trust', label: 'Trust him', detail: `He's a stand-up guy. Odds he flips: ${pct(p)}` },
      ];
    }
    case 'path': {
      const heir = chooseHeir(s, s.characters[d.defendantId]).heir;
      return [
        { id: 'path_heir', label: heir ? `Play on as ${heir.firstName} ${heir.lastName}, the heir` : 'No heir can take the chair', detail: 'The house survives the betrayal. Everyone will be watching the son of a rat.', disabled: heir ? undefined : 'No eligible heir', drastic: true },
        { id: 'path_witness', label: 'Play on as the rat in hiding', detail: 'A new name in a desert town. A short epilogue, and the end of the House.', drastic: true },
      ];
    }
    case 'lawyer':
      return LAWYERS.map((L) => {
        const fee = lawyerFee(d, L.id);
        return { id: `lawyer_${L.id}`, label: `${L.name} — ${fee ? usd(fee) : 'no fee'}`, detail: `${L.firm}. Skill ${L.skill}. ${L.connections}`, cost: fee, disabled: money(s, d) < fee ? `Needs ${usd(fee)}` : d.nohelp && L.id !== 'kaminsky' ? 'You left him to fend for himself' : undefined };
      });
    case 'jury': {
      const out: MgOption[] = d.pool.filter((j) => !j.struck).map((j) => ({ id: `strike_${j.id}`, label: `Strike ${j.name}`, detail: `${j.job}, ${j.town}. Read: ${j.read > 0 ? '+' : ''}${j.read}`, disabled: d.strikes <= 0 ? 'No strikes left' : undefined }));
      out.unshift({ id: 'seat', label: d.strikes > 0 ? `Seat the jury (${d.strikes} strike${d.strikes > 1 ? 's' : ''} unused go to the prosecution)` : 'Seat the jury' });
      return out;
    }
    case 'tamper': {
      const L = lawyer(d);
      const fx = fixerOf(s);
      const out: MgOption[] = [{ id: 'straight', label: 'Play it straight', detail: 'Win or lose on the evidence.', tone: 'safe' }];
      const can = L.tamper || !!fx;
      for (const id of d.fixerPicks ?? []) {
        const j = d.pool.find((x) => x.id === id)!;
        const { ok, risk } = reachOdds(s, d, j);
        out.push({ id: `reach_${j.id}`, label: `Reach ${j.name} (${j.job.toLowerCase()})`, detail: `${usd(3000)}. Works ${pct(ok)}; found out ${pct(risk)} — obstruction, a mistrial, a new count.`, odds: ok, cost: 3000, tone: 'dirty', disabled: !can ? 'Needs a Fixer on the council (or Carbone)' : L.id === 'hale' ? 'Hale will not be in the room for this' : money(s, d) < 3000 ? 'Needs $3,000' : undefined });
      }
      return out;
    }
    case 'case': {
      const it = current(d)!;
      if (d.side === 'prosecution') {
        return [
          { id: 'corroborate', label: 'Corroborate it (an anonymous tip)', detail: `Strength ${Math.round(it.strength)} → ${Math.round(it.strength * 1.3)}. 12% chance somebody sees who sent it.`, tone: 'dirty' },
          { id: 'quiet', label: 'Stay quiet', detail: 'Let the government do its own work.' },
        ];
      }
      const out: MgOption[] = [{ id: 'object', label: 'Object', detail: it.kind === 'informant' ? 'Hearsay: the jury never meets the informant.' : it.kind === 'words' ? 'Was he read his rights? Was the stop legal?' : 'Move to suppress.', odds: objectOdds(s, d, it) }];
      if (it.witness) out.push({ id: 'cross', label: `Cross-examine ${it.witness.name}`, detail: `Credibility ${it.witness.credibility}. Nerve ${it.witness.nerve}. A good cross shakes him; a bad one makes him stronger.` });
      if (it.physical) out.push({ id: 'custody', label: 'Challenge the chain of custody', detail: 'Who had the reels, the photos, the ledgers — and when?', odds: custodyOdds(d, it) });
      out.push({ id: 'concede', label: 'Concede the point', detail: 'Let it go. The jury notices a lawyer who doesn\'t fight everything (+1.5 defense).' });
      return out;
    }
    case 'cross': {
      const it = current(d)!;
      return (Object.keys(ANGLES) as Angle[]).map((a) => ({ id: `angle_${a}`, label: ANGLES[a].line(it.witness!.name.split(' ').pop() ?? ''), detail: ANGLES[a].label, odds: crossOdds(d, it, a) }));
    }
    case 'deal': {
      const pleaW = Math.round((d.rico ? 78 : 52) * d.judge.temper);
      return [
        { id: 'fight', label: 'Fight on', detail: `As it stands: ${pct(trialOdds(ses).p)} to convict.` },
        { id: 'deal_plea', label: `Take the plea: one count, ${Math.round(pleaW / 4.3)} months`, detail: 'Keough wants the conviction more than the years.', tone: 'safe' },
        { id: 'flip', label: 'Cooperate', detail: 'Give them everybody. Walk out with a new name. The family will know.', drastic: true, tone: 'dirty' },
      ];
    }
    case 'defense': {
      const ws = defenseWitnesses(s, d).filter((w) => !d.used.includes(w.id));
      const nW = d.used.filter((u) => u !== 'testify').length;
      const out: MgOption[] = ws.map((w) => ({ id: `wit_${w.id}`, label: w.label, detail: `${w.detail} +${w.value} defense${w.risk >= 0.2 ? `; ${pct(w.risk)} the alibi breaks (−${w.value + 3})` : ''}.`, disabled: nW >= 2 ? 'Two witnesses is all the judge will hear' : undefined }));
      if (!d.used.includes('testify')) {
        const p = testifyOdds(s, d);
        out.push({ id: 'testify', label: `${nm} takes the stand himself`, detail: `High risk, high reward: ${pct(p)} he wins them over (+18); otherwise Keough takes him apart (−16).`, odds: p, tone: 'risky' });
      }
      out.unshift({ id: 'rest', label: 'The defense rests', detail: 'On to closing arguments.' });
      return out;
    }
    case 'closing':
      return closings(d, s).map((x) => ({ id: `close_${x.id}`, label: x.label, detail: `${x.detail} (+${x.bonus} defense)` }));
    case 'verdict':
      return [{ id: 'hear', label: 'The jury goes out', detail: `Conviction odds: ${pct(trialOdds(ses).p)} (your lawyer's read).` }];
    case 'sentence': {
      const fx = fixerOf(s);
      const out: MgOption[] = [
        { id: 'mercy', label: 'Ask for mercy', detail: 'Letters from the parish, the Little League, his mother. −10% time.' },
        { id: 'stand', label: 'Take it standing up', detail: 'No begging. The men will hear about it (+respect).' },
      ];
      if (d.mode !== 'rival') {
        const p = judgeOdds(d, fx);
        const fee = d.mode === 'boss' ? 5000 : 2000;
        out.push({ id: 'fixjudge', label: `Have the Fixer reach ${d.judge.name}`, detail: `${usd(fee)} and a favor. Halves the sentence ${pct(p)}; if it fails, ${pct(0.5)} it comes out (obstruction: +1 year).`, odds: p, cost: fee, tone: 'dirty', disabled: !fx ? 'No Fixer on the council' : s.favors - d.favors < 1 ? 'Needs a political favor' : money(s, d) < fee ? `Needs ${usd(fee)}` : undefined });
      }
      return out;
    }
  }
  return [{ id: 'next', label: 'Continue' }];
}

function reachOdds(s: GameState, d: TrialData, j: Juror): { ok: number; risk: number } {
  const L = lawyer(d);
  const fx = fixerOf(s);
  const ok = clamp(0.5 + (L.id === 'carbone' ? 0.15 : 0) + (fx ? fx.attributes.intrigue / 400 : 0) - (j.tags.includes('law') ? 0.3 : 0) - (j.plant ? 0.4 : 0), 0.05, 0.9);
  const risk = clamp(0.22 - (L.id === 'carbone' ? 0.05 : 0) + (j.tags.includes('law') ? 0.25 : 0) + (j.plant ? 0.45 : 0) - (fx ? fx.attributes.intrigue / 600 : 0), 0.05, 0.9);
  return { ok, risk };
}

function judgeOdds(d: TrialData, fx: Character | undefined): number {
  return clamp(0.15 + (fx ? fx.attributes.diplomacy / 200 : 0) - d.judge.integrity / 160, 0.03, 0.75);
}

/* ---------------------------------------------------------------- */
/* Default play ("let it play out")                                  */
/* ---------------------------------------------------------------- */

function autoMove(s: GameState, ses: TS): string {
  const d = ses.d;
  const legal = opts(s, ses).filter((o) => !o.disabled);
  const has = (id: string) => legal.some((o) => o.id === id);
  switch (ses.phase) {
    case 'knock':
      return 'knock_quiet';
    case 'side':
      return 'side_out';
    case 'arraign':
      return d.mode === 'boss' ? 'notguilty' : 'held';
    case 'bail':
      return has('bail') && money(s, d) >= BAIL + 6000 ? 'bail' : 'held';
    case 'flip':
      return d.mode === 'boss' ? 'standup' : 'trust';
    case 'path':
      return has('path_heir') ? 'path_heir' : 'path_witness';
    case 'lawyer': {
      if (d.nohelp) return 'lawyer_kaminsky';
      const m = money(s, d);
      const order = d.mode === 'boss'
        ? (d.baseDefense >= 20 ? ['lindner'] : m >= 40000 ? ['hale', 'lindner'] : m >= 20000 ? ['lindner', 'carbone'] : m >= 8000 ? ['carbone'] : [])
        : m >= 25000 ? ['lindner', 'carbone'] : m >= 8000 ? ['carbone'] : [];
      for (const id of order) if (has(`lawyer_${id}`)) return `lawyer_${id}`;
      return 'lawyer_kaminsky';
    }
    case 'jury': {
      if (d.strikes <= 0) return 'seat';
      const worst = d.pool.filter((j) => !j.struck).sort((a, b) => b.read - a.read)[0];
      return worst && worst.read > 0 ? `strike_${worst.id}` : 'seat';
    }
    case 'tamper':
      return 'straight';
    case 'case': {
      if (d.side === 'prosecution') return 'quiet';
      const it = current(d)!;
      const S = it.strength;
      const ev: [string, number][] = [['concede', 1.5], ['object', objectOdds(s, d, it) * S]];
      if (it.physical) {
        const p = custodyOdds(d, it);
        ev.push(['custody', p * 0.55 * S - (1 - p) * 0.05 * S]);
      }
      if (it.witness) {
        const p = Math.max(...(Object.keys(ANGLES) as Angle[]).map((a) => crossOdds(d, it, a)));
        ev.push(['cross', p * 0.6 * S - (1 - p) * 0.15 * S]);
      }
      ev.sort((a, b) => b[1] - a[1]);
      return ev[0][0];
    }
    case 'cross': {
      const it = current(d)!;
      return `angle_${(Object.keys(ANGLES) as Angle[]).sort((a, b) => crossOdds(d, it, b) - crossOdds(d, it, a))[0]}`;
    }
    case 'deal':
      return 'fight';
    case 'defense': {
      const ws = defenseWitnesses(s, d).filter((w) => !d.used.includes(w.id) && has(`wit_${w.id}`)).sort((a, b) => b.value * (1 - b.risk) - b.risk * (b.value + 3) - (a.value * (1 - a.risk) - a.risk * (a.value + 3)));
      const best = ws[0];
      if (best && best.value * (1 - best.risk) - best.risk * (best.value + 3) > 0) return `wit_${best.id}`;
      if (has('testify') && testifyOdds(s, d) >= 0.6) return 'testify';
      return 'rest';
    }
    case 'closing':
      return `close_${closings(d, s).sort((a, b) => b.bonus - a.bonus)[0].id}`;
    case 'verdict':
      return 'hear';
    case 'sentence':
      return 'mercy';
  }
  return legal[0]?.id ?? 'next';
}

/* ---------------------------------------------------------------- */
/* Steps                                                             */
/* ---------------------------------------------------------------- */

function nextAfterLawyer(s: GameState, ses: TS, arraignmentOnly: boolean): void {
  if (arraignmentOnly) return finishArraignment(s, ses);
  ses.phase = 'jury';
  setupPool(s, ses, ses.d);
  beat(ses, `Jury selection. Sixteen citizens of Cape May County file into the box. You have ${ses.d.strikes} strikes.`, 'info');
}

function presentItem(s: GameState, ses: TS): void {
  const d = ses.d;
  const it = current(d);
  if (!it) return startDefense(s, ses);
  beat(ses, `${d.prosecutor.split(' ').pop()} ${it.witness ? `calls ${it.witness.name}, ${it.witness.job}` : `introduces ${it.title.toLowerCase()}`}. ${it.text} (strength ${Math.round(it.strength)})`, 'info');
  if (it.witness) {
    const w = it.witness;
    if (hit(ses, (100 - w.nerve) / 260)) {
      it.strength = Math.round(it.strength * 0.6 * 10) / 10;
      it.status = 'shaken';
      beat(ses, `${w.name} looks at the defense table, then at his hands. His voice drops to nothing. He has lost his nerve. (strength → ${Math.round(it.strength)})`, 'good');
    } else if (hit(ses, w.credibility / 500)) {
      it.strength = Math.round(it.strength * 1.15 * 10) / 10;
      it.status = 'firm';
      beat(ses, `${w.name} is rehearsed and calm. The jury writes it down. (strength → ${Math.round(it.strength)})`, 'bad');
    }
  }
  ses.phase = 'case';
}

function nextItem(s: GameState, ses: TS): void {
  const d = ses.d;
  d.cur += 1;
  if (d.cur >= d.items.length) {
    beat(ses, 'The government rests.', 'info');
    if (d.side === 'prosecution' || d.mode === 'rival') return toVerdict(s, ses);
    if (d.mode === 'boss' && !d.dealSeen) {
      d.dealSeen = true;
      ses.phase = 'deal';
      beat(ses, `In the hallway, ${d.prosecutor} catches the lawyer's sleeve. "Tell your client the offer is still on the table. Until the jury goes out."`, 'quote', d.prosecutor);
      return;
    }
    return startDefense(s, ses);
  }
  presentItem(s, ses);
}

function startDefense(s: GameState, ses: TS): void {
  const d = ses.d;
  if (d.side !== 'defense' || d.mode === 'rival') return startClosing(s, ses);
  ses.phase = 'defense';
  beat(ses, `The defense calls its first witness.`, 'info');
}

function startClosing(_s: GameState, ses: TS): void {
  ses.phase = 'closing';
  beat(ses, 'Closing arguments. The lawyer buttons his jacket and walks to the rail.', 'info');
}

function toVerdict(_s: GameState, ses: TS): void {
  ses.phase = 'verdict';
  beat(ses, `${ses.d.judge.name} charges the jury. Twelve people file out to a room with a table, a pitcher of water and a window painted shut.`, 'info');
}

function stepTrial(s: GameState, ses: TS, move: string, arraignmentOnly: boolean): void {
  const d = ses.d;
  const c = defendant(s, ses);
  switch (ses.phase) {
    case 'knock': {
      d.knock = move === 'knock_lawyer' ? 'lawyer' : move === 'knock_ledger' ? 'ledger' : 'quiet';
      if (d.knock === 'lawyer') {
        d.baseDefense += 5;
        beat(ses, `"Abe? They're here." The agent waits in the vestibule with his hat in his hands.`, 'good');
      } else if (d.knock === 'ledger') {
        if (hit(ses, 0.65)) {
          d.knockEvidence = -8;
          beat(ses, 'By the time the search team reaches the cellar, the ledger is in a cake box on its way to Rio Grande.', 'good');
        } else {
          d.knockEvidence = 6;
          beat(ses, 'The young agent was listening at the bottom of the stairs. He writes it all down.', 'bad');
        }
      } else beat(ses, `${d.first} puts on his hat and walks out past the neighbors without a word.`, 'info');
      ses.phase = 'arraign';
      beat(ses, `${d.court}. ${d.counts.length} counts are read aloud.`, 'info');
      return;
    }
    case 'side': {
      d.side = move === 'side_defense' ? 'defense' : move === 'side_prosecution' ? 'prosecution' : 'out';
      if (d.side === 'defense') {
        d.spent += 2000;
        beat(ses, `An envelope goes to his lawyer's office on Atlantic Avenue. ${d.first}'s people will know where it came from.`, 'good');
        ses.phase = 'jury';
        d.lawyerId = 'lindner';
        setupPool(s, ses, d);
      } else if (d.side === 'prosecution') {
        beat(ses, 'A plain envelope, no return address, to the federal building.', 'bad');
        d.lawyerId = 'lindner';
        presentItem(s, ses);
      } else {
        beat(ses, 'You read about it over coffee, like everybody else.', 'info');
        d.lawyerId = 'lindner';
        d.pool = makePool(s, ses, 70, 0);
        seatJury(ses, d);
        for (const it of d.items) if (hit(ses, 0.3)) it.strength = Math.round(it.strength * 0.7 * 10) / 10;
        toVerdict(s, ses);
      }
      return;
    }
    case 'arraign':
      if (move === 'guilty' || move === 'pleadout') {
        d.verdict = 'plea';
        d.sentence = d.mode === 'boss' ? Math.round(between(ses, 52, 104) * (d.rico ? 1.25 : 1)) : Math.round(d.weeks * 0.6);
        beat(ses, d.mode === 'boss' ? `"Guilty, Your Honor." ${Math.round(d.sentence / 4.3)} months. The courtroom is very quiet.` : `${d.first} pleads to the lesser count: ${d.sentence} weeks.`, 'info');
        return endSession(s, ses);
      }
      if (d.mode === 'boss') {
        beat(ses, `"Not guilty, Your Honor." ${d.prosecutor} asks for remand: a flight risk, a danger to witnesses.`, 'info');
        ses.phase = 'bail';
      } else {
        if (move === 'bail') {
          d.spent += 1500;
          d.bail = 'bail';
          beat(ses, `${d.first} walks out to the parking lot. He looks for the car you sent.`, 'good');
        } else {
          d.bail = 'held';
          beat(ses, `${d.first} goes back to the county jail in Cape May Court House to wait.`, 'info');
        }
        if (c) d.flipReasons = npcFlipReasons(s, c, d.evidence, d.rico).concat(LAWYER_BY_ID['carbone'] && d.bail === 'bail' ? [{ label: 'Out on your bail', value: -0.06 }] : []);
        ses.phase = 'flip';
        beat(ses, `Two FBI agents visit ${d.first} with coffee and an offer.`, 'bad');
      }
      return;
    case 'bail':
      if (move === 'bail') {
        d.spent += BAIL;
        d.bail = 'bail';
        beat(ses, `Bail is set at ${usd(BAIL)}. ${d.first} goes home through the side door.`, 'good');
      } else {
        d.bail = 'held';
        beat(ses, `Remanded. ${d.first} spends eight weeks in the county jail waiting for his trial.`, 'bad');
      }
      ses.phase = 'flip';
      beat(ses, `That night ${d.prosecutor} visits. "Help us, and you could be somewhere warm by Christmas. Under another name."`, 'quote', d.prosecutor);
      return;
    case 'flip':
      if (d.mode === 'boss') {
        if (move === 'flip') return bossFlips(s, ses);
        beat(ses, `"I got nothing to say to you." ${d.prosecutor} leaves his card on the table anyway.`, 'info');
        if (arraignmentOnly || !d.lawyerId) ses.phase = 'lawyer';
        else nextAfterLawyer(s, ses, arraignmentOnly);
        return;
      }
      {
        let p = sumP(d.flipReasons ?? []);
        if (move === 'envelope') {
          d.spent += 1200;
          p = Math.max(0.02, p - 0.12);
          beat(ses, `${c?.household?.wife ?? 'His wife'} gets an envelope every Friday. ${d.first} hears about it.`, 'good');
        } else if (move === 'capo') {
          p = Math.max(0.02, p - 0.08);
          beat(ses, `His capo sits across from him in the visiting room for an hour. Nobody hears what is said.`, 'info');
        }
        if (hit(ses, p)) {
          d.flipped = true;
          d.verdict = 'flipped';
          beat(ses, `${d.first} asks for the agents by name. By morning his family is gone from the island.`, 'bad');
          return endSession(s, ses);
        }
        beat(ses, `${d.first} tells the agents to go to hell, more or less politely.`, 'good');
        ses.phase = 'lawyer';
      }
      return;
    case 'path':
      d.path = move === 'path_heir' ? 'heir' : 'witness';
      if (d.path === 'heir') {
        const heir = chooseHeir(s, s.characters[d.defendantId]).heir;
        beat(ses, `${heir ? heir.firstName : 'The heir'} hears it from a cousin, then from the papers. The chair is his now — and so is the shame.`, 'bad');
      } else beat(ses, `A marshal hands ${d.first} a folder with a new name in it.`, 'info');
      return endSession(s, ses);
    case 'lawyer': {
      const id = move.replace('lawyer_', '');
      const L = LAWYER_BY_ID[id];
      const fee = lawyerFee(d, id);
      d.spent += fee;
      d.lawyerId = id;
      beat(ses, `${L.name} takes the case${fee ? ` for ${usd(fee)}` : ''}. ${L.blurb}`, 'info');
      return nextAfterLawyer(s, ses, arraignmentOnly);
    }
    case 'jury': {
      if (move.startsWith('strike_')) {
        const j = d.pool.find((x) => x.id === move.slice(7));
        if (j && d.strikes > 0) {
          j.struck = 'defense';
          d.strikes -= 1;
          beat(ses, `Struck: ${j.name}, ${j.job.toLowerCase()}, ${j.town}.`, 'info');
        }
        return;
      }
      seatJury(ses, d);
      const L = lawyer(d);
      const fx = fixerOf(s);
      if ((L.tamper || fx) && L.id !== 'hale') {
        const cands = d.pool.filter((j) => j.seated && j.read <= 4).sort((a, b) => a.read - b.read).slice(0, 2);
        d.fixerPicks = cands.map((j) => j.id);
        ses.phase = 'tamper';
        beat(ses, `${fx ? fx.firstName : L.name.split(' ').pop()} mentions, over a drink, that some jurors have money troubles.`, 'quote');
      } else presentItem(s, ses);
      return;
    }
    case 'tamper': {
      if (move.startsWith('reach_')) {
        const j = d.pool.find((x) => x.id === move.slice(6))!;
        const { ok, risk } = reachOdds(s, d, j);
        d.spent += 3000;
        const worked = hit(ses, ok);
        d.tamper = { jurorId: j.id, ok: worked, risk: worked ? risk : Math.min(0.95, risk * 1.6) };
        if (worked) j.reached = true;
        beat(ses, worked ? `Word comes back: ${j.name.split(' ')[0]} understands.` : `Word comes back: ${j.name.split(' ')[0]} slammed the door. Now somebody knows.`, worked ? 'good' : 'bad');
      } else beat(ses, 'You play it straight.', 'info');
      presentItem(s, ses);
      return;
    }
    case 'case': {
      const it = current(d)!;
      if (d.side === 'prosecution') {
        if (move === 'corroborate') {
          it.strength = Math.round(it.strength * 1.3 * 10) / 10;
          it.status = 'firm';
          beat(ses, `Your tip checks out. (strength → ${Math.round(it.strength)})`, 'good');
          if (hit(ses, 0.12)) {
            d.exposed = true;
            beat(ses, 'A clerk at the federal building has a cousin in South Philadelphia. People are going to hear where the tip came from.', 'bad');
          }
        } else beat(ses, 'You stay quiet.', 'info');
        it.status = it.status === 'pending' ? 'in' : it.status;
        return nextItem(s, ses);
      }
      if (move === 'cross' && it.witness) {
        ses.phase = 'cross';
        return;
      }
      if (move === 'object') {
        if (hit(ses, objectOdds(s, d, it))) {
          it.status = 'out';
          it.note = 'Excluded';
          beat(ses, `"Sustained." ${it.title} is out. The jury is told to disregard it.`, 'good');
        } else {
          it.status = it.status === 'pending' ? 'in' : it.status;
          beat(ses, '"Overruled." It comes in.', 'bad');
        }
      } else if (move === 'custody' && it.physical) {
        if (hit(ses, custodyOdds(d, it))) {
          it.strength = Math.round(it.strength * 0.45 * 10) / 10;
          it.status = 'shaken';
          beat(ses, `Nobody can say who had the evidence on the weekend of the 14th. (strength → ${Math.round(it.strength)})`, 'good');
        } else {
          it.strength = Math.round(it.strength * 1.05 * 10) / 10;
          it.status = it.status === 'pending' ? 'in' : it.status;
          beat(ses, 'An agent reads the evidence log, line by line. Every signature is there.', 'bad');
        }
      } else {
        d.defensePts += 1.5;
        d.defenseLog.push({ label: `Conceded: ${it.title}`, value: 1.5 });
        it.status = it.status === 'pending' ? 'in' : it.status;
        beat(ses, 'The lawyer lets it go with a shrug. A juror in the front row nods.', 'info');
      }
      return nextItem(s, ses);
    }
    case 'cross': {
      const it = current(d)!;
      const a = move.replace('angle_', '') as Angle;
      beat(ses, ANGLES[a].line(it.witness!.name.split(' ').pop() ?? ''), 'quote', lawyer(d).name);
      if (hit(ses, crossOdds(d, it, a))) {
        it.strength = Math.round(it.strength * 0.4 * 10) / 10;
        it.status = 'shaken';
        beat(ses, `${it.witness!.name} hesitates too long. Then contradicts himself. (strength → ${Math.round(it.strength)})`, 'good');
      } else {
        it.strength = Math.round(it.strength * 1.15 * 10) / 10;
        it.status = 'firm';
        beat(ses, `${it.witness!.name} doesn't blink. If anything, he sounds surer. (strength → ${Math.round(it.strength)})`, 'bad');
      }
      ses.phase = 'case';
      return nextItem(s, ses);
    }
    case 'deal':
      if (move === 'flip') return bossFlips(s, ses);
      if (move === 'deal_plea') {
        d.verdict = 'plea';
        d.sentence = Math.round((d.rico ? 78 : 52) * d.judge.temper);
        beat(ses, `${d.first} changes his plea. ${Math.round(d.sentence / 4.3)} months.`, 'info');
        return endSession(s, ses);
      }
      beat(ses, '"Tell him to go to hell."', 'quote', d.first);
      return startDefense(s, ses);
    case 'defense': {
      if (move === 'rest') {
        beat(ses, 'The defense rests.', 'info');
        return startClosing(s, ses);
      }
      if (move === 'testify') {
        d.used.push('testify');
        const p = testifyOdds(s, d);
        if (hit(ses, p)) {
          d.defensePts += 18;
          d.defenseLog.push({ label: `${d.first} testified: the jury liked him`, value: 18 });
          beat(ses, `${d.first} talks about his father's fish market, the war, the church roof. Two jurors are nodding. (+18)`, 'good');
        } else {
          d.defensePts -= 16;
          d.defenseLog.push({ label: `${d.first} testified: Keough took him apart`, value: -16 });
          beat(ses, `Keough asks about the Tuesday meetings. ${d.first} loses his temper on the stand. (−16)`, 'bad');
        }
        return;
      }
      const w = defenseWitnesses(s, d).find((x) => `wit_${x.id}` === move);
      if (w) {
        d.used.push(w.id);
        if (w.risk > 0 && hit(ses, w.risk)) {
          d.defensePts -= w.value + 3;
          d.defenseLog.push({ label: `${w.label}: broken on cross`, value: -(w.value + 3) });
          beat(ses, `${w.label.split(' ')[0]} gets the date wrong under cross. The alibi falls apart. (−${w.value + 3})`, 'bad');
        } else {
          d.defensePts += w.value;
          d.defenseLog.push({ label: w.label, value: w.value });
          beat(ses, `${w.label}. (+${w.value})`, 'good');
        }
      }
      return;
    }
    case 'closing': {
      const x = closings(d, s).find((cl) => `close_${cl.id}` === move) ?? closings(d, s)[0];
      d.closing = x.id;
      d.closingBonus = x.bonus;
      beat(ses, `Closing: ${x.label} (+${x.bonus})`, 'quote', lawyer(d).name);
      return toVerdict(s, ses);
    }
    case 'verdict':
      return deliberate(s, ses);
    case 'sentence': {
      const base = d.sentence ?? 52;
      const L = lawyer(d);
      let w = base * (1 - L.bench);
      if (move === 'mercy') {
        w *= 0.9;
        beat(ses, 'Letters from the parish are read into the record.', 'info');
      } else if (move === 'stand') {
        beat(ses, `${d.first} looks the judge in the eye and says nothing at all.`, 'info');
      } else if (move === 'fixjudge') {
        const fx = fixerOf(s);
        const fee = d.mode === 'boss' ? 5000 : 2000;
        d.spent += fee;
        d.favors += 1;
        if (hit(ses, judgeOdds(d, fx))) {
          w *= 0.5;
          d.fixerJudge = 'ok';
          beat(ses, `${d.judge.name} surprises everyone with his leniency.`, 'good');
        } else if (hit(ses, 0.5)) {
          w += 52;
          d.fixerJudge = 'caught';
          beat(ses, `${d.judge.name} reports the approach to the U.S. Attorney. Another year, and a headline.`, 'bad');
        } else {
          d.fixerJudge = 'failed';
          beat(ses, 'The judge never answers the message.', 'info');
        }
      }
      d.sentence = Math.max(4, Math.round(w));
      beat(ses, `Sentence: ${fmtTime(d.sentence)}.${L.bench ? ` (${L.name.split(' ').pop()}'s standing with the bench: −${Math.round(L.bench * 100)}%)` : ''}`, 'bad');
      return endSession(s, ses);
    }
  }
}

function seatJury(ses: TS, d: TrialData): void {
  // Unused defense strikes go to the prosecution, which strikes the friendliest faces (it knows them).
  const avail = () => d.pool.filter((j) => !j.struck);
  while (avail().length > SEATS) {
    const best = avail().sort((a, b) => a.lean - b.lean)[0];
    best.struck = 'prosecution';
    beat(ses, `The government strikes ${best.name}, ${best.job.toLowerCase()}.`, 'info');
  }
  for (const j of avail()) j.seated = true;
  beat(ses, `The jury is seated: ${avail().map((j) => j.name.split(' ')[0]).join(', ')}.`, 'info');
}

function fmtTime(w: number): string {
  return w >= 104 ? `${(w / 52).toFixed(1).replace('.0', '')} years` : `${Math.round(w / 4.3)} months`;
}

function deliberate(s: GameState, ses: TS): void {
  const d = ses.d;
  const { p } = trialOdds(ses, true);
  d.pFinal = p;
  if (d.tamper && hit(ses, d.tamper.risk)) {
    d.verdict = 'mistrial';
    d.ballots = [];
    beat(ses, 'Before the jury can vote, a juror passes a note to the bailiff. Federal agents are in the hallway by lunch. Mistrial.', 'bad');
    return endSession(s, ses);
  }
  if (d.mode === 'boss') beat(ses, `The foreman stands. ${d.first}'s mother grips the rosary. The lawyer doesn't look at him, which he decides to take as a good sign.`, 'quote');
  const u = roll(ses);
  const hours = between(ses, 3, 14);
  let final: number;
  if (u < p) {
    if (hit(ses, hangChance(d.pool))) {
      d.verdict = 'hung';
      final = between(ses, 8, 11);
    } else {
      d.verdict = u > p * (0.5 + 0.5 * p) ? 'partial' : 'convicted';
      final = 12;
    }
  } else {
    d.verdict = 'acquitted';
    final = 0;
  }
  const start = clamp(Math.round(12 * (0.25 + 0.5 * p)) + between(ses, -2, 2), 1, 11);
  d.ballots = [start, Math.round((start + final) / 2), final];
  beat(ses, `${hours} hours. Ballots: ${d.ballots.map((g) => `${g}–${12 - g}`).join(', ')}.`, 'info');
  const counts = d.counts.length;
  if (d.verdict === 'acquitted') beat(ses, `"On all counts: not guilty." Somebody in the back row starts to clap.`, 'good');
  else if (d.verdict === 'hung') beat(ses, `The foreman sends a note: they cannot agree. ${d.judge.name} declares a hung jury. The government will try again.`, 'info');
  else if (d.verdict === 'partial') beat(ses, `"Guilty on ${Math.max(1, Math.floor(counts / 2))} of ${counts} counts."`, 'bad');
  else beat(ses, '"Guilty on all counts."', 'bad');
  if (d.verdict === 'partial' || d.verdict === 'convicted') {
    d.sentence = sentenceBase(d, d.verdict === 'partial', ses);
    if (d.mode === 'rival') {
      beat(ses, `Sentence: ${fmtTime(d.sentence)}.`, 'info');
      return endSession(s, ses);
    }
    ses.phase = 'sentence';
    beat(ses, `Sentencing before ${d.judge.name}. ${d.judge.blurb} He is looking at ${fmtTime(d.sentence)}.`, 'info');
    return;
  }
  endSession(s, ses);
}

function bossFlips(_s: GameState, ses: TS): void {
  const d = ses.d;
  d.flipped = true;
  d.verdict = 'flipped';
  d.wsec = hit(ses, 0.5) ? 0 : between(ses, 52, 110);
  beat(ses, `${d.first} asks for a private word with the U.S. Attorney. By evening he is in a motel in Pennsylvania with four marshals and a tape recorder.`, 'bad');
  beat(ses, d.wsec ? `The deal: ${fmtTime(d.wsec)} in a witness unit, then WITSEC.` : 'The deal: no time at all. WITSEC. A new name.', 'info');
  beat(ses, 'Philadelphia hears about it before the papers do. Somebody puts a price on the name he used to have.', 'bad');
  ses.phase = 'path';
}

function finishArraignment(s: GameState, ses: TS): void {
  const d = ses.d;
  beat(ses, `Trial is set for ${TRIAL_WEEKS} weeks out. ${d.bail === 'bail' ? `${d.first} is home until then.` : `${d.first} waits in a cell.`}`, 'info');
  endSession(s, ses);
}

/* ---------------------------------------------------------------- */
/* Outcome                                                           */
/* ---------------------------------------------------------------- */

function endSession(s: GameState, ses: TS): void {
  ses.done = true;
  ses.phase = 'end';
  ses.outcome = outcomeOf(s, ses);
}

function outcomeOf(s: GameState, ses: TS): MgOutcome {
  const d = ses.d;
  const label = ses.game === 'arraignment' ? 'Arraignment' : d.mode === 'rival' ? `Trial: ${d.defName}` : d.mode === 'crew' ? `Trial: ${d.defName}` : `United States v. ${d.last}`;
  const fx: Effect[] = [];
  if (d.spent > 0) fx.push({ type: 'money', amount: -d.spent, label: `${label}: lawyers, bail and envelopes` });
  if (d.favors > 0) fx.push({ type: 'favor', amount: -d.favors, label: `${label}: a word with the judge` });
  const LAST = d.last.toUpperCase();
  const paper = d.mode === 'crew' ? LEADER : BULLETIN;
  const c = s.characters[d.defendantId];
  const yrs = d.sentence ? fmtTime(d.sentence) : '';
  if (d.knock === 'quiet') fx.push({ type: 'respect', amount: 2, label: `${label}: he went quietly` });
  if (d.knock === 'lawyer') fx.push({ type: 'legal', op: 'defense', amount: 5, label: `${label}: the lawyer was there first` });
  if (d.knockEvidence) fx.push({ type: 'evidence', charId: d.defendantId, amount: d.knockEvidence, label: `${label}: the ledger` });
  if (ses.game === 'arraignment' && !d.verdict) {
    return { title: label, text: `Not guilty. ${d.bail === 'bail' ? 'Out on bail' : 'Held without bail'}. ${lawyer(d).name} for the defense. Trial in ${TRIAL_WEEKS} weeks.`, tone: 'mixed', effects: fx, headline: { paper: BULLETIN, headline: `${LAST} PLEADS NOT GUILTY IN FEDERAL COURT`, body: `${d.defName} entered a plea of not guilty in Camden. ${d.bail === 'bail' ? 'He was released on bail.' : 'He was held without bail.'} Trial is expected in ${TRIAL_WEEKS} weeks.` } };
  }
  switch (d.verdict) {
    case 'plea':
      if (d.mode === 'boss') fx.push({ type: 'respect', amount: -6, label: `${label}: he pleaded guilty` });
      else if (c) fx.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 4, reason: 'Told me to take the deal', decay: 1, label });
      return { title: label, text: `${d.first} pleaded guilty: ${yrs}.`, tone: 'mixed', effects: fx, headline: { paper, headline: `${LAST} PLEADS GUILTY`, body: `${d.defName} admitted to a reduced charge and will serve ${yrs}.` } };
    case 'flipped':
      if (d.mode === 'boss') {
        return { title: label, text: d.path === 'witness' ? `${d.first} became a government witness and disappeared into the program.` : `${d.first} became a government witness. The house goes on without him.`, tone: 'bad', effects: fx, headline: { paper: BULLETIN, headline: `SHORE RACKETS FIGURE ${LAST} TURNS GOVERNMENT WITNESS`, body: `Sources say ${d.defName} has agreed to testify against his former associates in exchange for leniency. He has been moved to an undisclosed location.` }, epilogue: d.path === 'witness' ? epilogue(s, ses) : undefined };
      }
      if (c) fx.push({ type: 'flip', charId: c.id, label: `${label}: he took the deal` });
      return { title: label, text: `${d.first} took the government's deal. He will testify.`, tone: 'bad', effects: fx, headline: { paper, headline: `${LAST} TO TESTIFY FOR THE STATE`, body: `${d.defName}, said to be an associate of Wildwood gambling interests, has agreed to cooperate with prosecutors.` } };
    case 'acquitted':
      if (d.mode === 'crew' && c) {
        fx.push({ type: 'respect', amount: 2, label: `${label}: acquitted` });
        if (!d.nohelp) fx.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: 'Stood by me at my trial', decay: 1, label });
      }
      if (d.mode === 'rival' && d.rival) {
        fx.push({ type: 'rivalResource', rival: d.rival, exposure: -25, label });
        if (d.side === 'defense') fx.push({ type: 'rivalOpinion', rival: d.rival, amount: 20, reason: 'Helped at the trial', label });
      }
      return { title: label, text: `Not guilty on all counts.${d.mode === 'boss' ? ' He walked out the front door of the federal building.' : ''}`, tone: d.side === 'prosecution' ? 'bad' : 'good', effects: fx.concat(rivalExposure(s, d, label)), headline: { paper, headline: `${LAST} ACQUITTED; ${d.mode === 'boss' ? 'WALKS FROM FEDERAL COURT' : 'JURY SAYS NOT GUILTY'}`, body: `After ${d.ballots?.length ? 'a long day' : 'a short deliberation'}, a Cape May County jury found ${d.defName} not guilty. ${d.prosecutor} declined to comment.` } };
    case 'hung':
      return { title: label, text: `A hung jury (${(d.ballots ?? [10]).slice(-1)[0]}–${12 - (d.ballots ?? [10]).slice(-1)[0]}). The government will try again.`, tone: 'mixed', effects: fx.concat(rivalExposure(s, d, label)), headline: { paper, headline: `JURY DEADLOCKS IN ${LAST} CASE; RETRIAL SET`, body: `After days of deliberation the jurors told the judge they could not reach a verdict. Prosecutors said they would try the case again.` } };
    case 'mistrial':
      fx.push({ type: 'heat', bar: 'federal', amount: 12, label: `${label}: a juror tampering probe` });
      if (d.mode === 'boss') fx.push({ type: 'respect', amount: -3, label: `${label}: mistrial` });
      return { title: label, text: 'Mistrial: a juror was approached and talked. An obstruction count will be added at the retrial.', tone: 'bad', effects: fx, headline: { paper, headline: `MISTRIAL! JUROR TAMPERING PROBE IN ${LAST} CASE`, body: `A juror told the court she had been approached. The FBI is investigating; the government will retry ${d.defName} with an obstruction count added.` } };
    case 'partial':
    case 'convicted': {
      if (d.mode === 'crew' && c && !d.nohelp) fx.push({ type: 'opinion', from: c.id, to: s.playerId, amount: 4, reason: 'You paid for my lawyer', decay: 1, label });
      if (d.mode === 'crew' && c && d.nohelp) fx.push({ type: 'opinion', from: c.id, to: s.playerId, amount: -10, reason: 'Left me alone with a public defender', decay: 1, label });
      if (d.fixerJudge === 'caught') fx.push({ type: 'heat', bar: 'federal', amount: 10, label: `${label}: the judge reported the approach` });
      if (d.mode === 'rival' && d.rival) fx.push({ type: 'rivalResource', rival: d.rival, muscle: -12, exposure: -40, label });
      const n = d.counts.length;
      const head = d.verdict === 'partial' ? `JURY SPLITS: ${LAST} GUILTY ON ${Math.max(1, Math.floor(n / 2))} OF ${n} COUNTS` : `${LAST} GUILTY ON ALL COUNTS`;
      return { title: label, text: `${d.verdict === 'partial' ? 'Guilty on some counts' : 'Guilty on all counts'}: ${yrs}.`, tone: d.side === 'prosecution' ? 'good' : 'bad', effects: fx.concat(rivalExposure(s, d, label)), headline: { paper, headline: head, body: `${d.judge.name} sentenced ${d.defName} to ${yrs}${d.rico ? ' under the racketeering law' : ''}. "${d.verdict === 'partial' ? 'The jury has spoken, in part.' : 'Justice has been done,'}" said ${d.prosecutor}.` } };
    }
  }
  return { title: label, text: 'The case is over.', tone: 'mixed', effects: fx };
}

function rivalExposure(_s: GameState, d: TrialData, label: string): Effect[] {
  if (d.mode !== 'rival' || d.side !== 'prosecution' || !d.exposed) return [];
  const out: Effect[] = [
    { type: 'heat', bar: 'family', amount: 8, label: `${label}: word is you talked to the government` },
    { type: 'respect', amount: -4, label: `${label}: seen helping the law` },
  ];
  if (d.rival) out.push({ type: 'rivalOpinion', rival: d.rival, amount: -25, reason: 'Helped the government against us', label });
  return out;
}

function epilogue(s: GameState, ses: TS): string[] {
  const d = ses.d;
  const towns = ['Mesa, Arizona', 'Tucson, Arizona', 'Bakersfield, California', 'Boise, Idaho', 'Las Cruces, New Mexico'];
  const names = ['Frank Morrow', 'Gene Hollis', 'Walter Prescott', 'Ray Sutter', 'Don Kearney'];
  const town = choose(ses, towns);
  const alias = choose(ses, names);
  return [
    `${d.wsec ? `${fmtTime(d.wsec)} in a federal witness unit, a television, a guard who called him "sir". Then a bus.` : 'No time at all. A bus ticket and a folder.'} ${town}. His name is ${alias} now.`,
    `He testified in four trials. Men he had known since grade school looked at him across the courtroom and he looked at the flag.`,
    `${alias} manages a tire shop. He doesn't go to the beach. He never answers a knock without looking first, and he never goes back to Wildwood.`,
    `The House of ${s.houseName} ended the day he picked up the phone. Somewhere in South Philadelphia his old name is still on a list.`,
  ];
}

/* ---------------------------------------------------------------- */
/* Applying the outcome (beyond the ledger effects)                  */
/* ---------------------------------------------------------------- */

function applyTrial(ctx: Ctx, ses: TS): void {
  const s = ctx.s;
  const d = ses.d;
  const mg = mgOf(s);
  const c = s.characters[d.defendantId];
  mg.open = mg.open.filter((x) => x !== d.defendantId);
  mg.cool[d.defendantId] = s.week;
  if (d.lawyerId && d.mode === 'boss') mg.lawyer[d.defendantId] = d.lawyerId;
  if (!c || !c.alive) return;
  if (d.mode === 'boss') return applyBoss(ctx, ses, c);
  if (d.mode === 'rival') {
    if (d.verdict === 'partial' || d.verdict === 'convicted') {
      c.imprisonedUntil = s.week + (d.sentence ?? 104);
      c.evidence = 0;
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} was convicted in federal court and sentenced to ${fmtTime(d.sentence ?? 104)}.`, kind: 'rival' });
    } else if (d.verdict === 'hung' || d.verdict === 'mistrial') {
      mg.docket.push({ defendantId: c.id, due: s.week + TRIAL_WEEKS, mode: 'rival', weeks: d.weeks });
    } else s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} was acquitted in federal court.`, kind: 'rival' });
    return;
  }
  // A man of yours (or of the house).
  switch (d.verdict) {
    case 'flipped':
      registerWitness(s, c, true, d.capoId);
      break;
    case 'plea':
    case 'partial':
    case 'convicted':
      c.imprisonedUntil = s.week + Math.max(1, d.sentence ?? d.weeks);
      c.record = (c.record ?? 0) + 1;
      c.evidence = Math.round((c.evidence ?? 0) * 0.3);
      for (const dd of s.districts) if (dd.capoId === c.id) dd.capoId = undefined;
      addStory(s, c, `${d.verdict === 'plea' ? 'Pleaded guilty' : 'Convicted'}: ${fmtTime(d.sentence ?? d.weeks)}.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} was ${d.verdict === 'plea' ? 'sentenced on a guilty plea' : 'convicted'}: ${fmtTime(d.sentence ?? d.weeks)}.`, kind: 'heat' });
      break;
    case 'acquitted':
      c.imprisonedUntil = undefined;
      c.evidence = Math.round((c.evidence ?? 0) * 0.4);
      addStory(s, c, 'Acquitted by a jury.');
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} was acquitted.`, kind: 'heat' });
      break;
    case 'hung':
    case 'mistrial':
      c.imprisonedUntil = d.bail === 'bail' ? undefined : s.week + TRIAL_WEEKS + 1;
      if (d.verdict === 'mistrial') {
        mg.obstruction[c.id] = (mg.obstruction[c.id] ?? 0) + 1;
        c.evidence = Math.min(100, (c.evidence ?? 0) + 12);
      }
      mg.docket.push({ defendantId: c.id, due: s.week + TRIAL_WEEKS, mode: 'crew', weeks: d.weeks });
      break;
  }
  if (d.bail === 'bail' && d.verdict !== 'flipped' && d.verdict !== 'plea' && d.verdict !== 'partial' && d.verdict !== 'convicted' && d.verdict !== 'hung' && d.verdict !== 'mistrial') c.imprisonedUntil = undefined;
}

function applyBoss(ctx: Ctx, ses: TS, b: Character): void {
  const s = ctx.s;
  const d = ses.d;
  const l = legalOf(s);
  const mg = mgOf(s);
  if (ses.game === 'arraignment' && !d.verdict) {
    if (d.bail === 'bail') {
      l.bail = true;
    } else {
      l.bail = false;
      b.imprisonedUntil = s.week + TRIAL_WEEKS;
    }
    l.stage = 'trial';
    l.next = s.week + TRIAL_WEEKS;
    return;
  }
  switch (d.verdict) {
    case 'plea':
      sendToPrison(ctx, d.sentence ?? 52, 'Guilty plea');
      break;
    case 'partial':
    case 'convicted':
      sendToPrison(ctx, d.sentence ?? 156, d.rico ? 'Convicted under RICO' : 'Convicted');
      if (d.fixerJudge === 'caught') mg.obstruction[b.id] = (mg.obstruction[b.id] ?? 0) + 1;
      break;
    case 'acquitted':
      acquitBoss(ctx);
      delete mg.obstruction[b.id];
      break;
    case 'hung':
      l.stage = 'trial';
      l.next = s.week + TRIAL_WEEKS;
      respect(ctx, 2, 'Hung jury: the government could not convict him', 'event');
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The jury deadlocked in the case against ${displayName(b)}. A retrial is set.`, kind: 'heat' });
      break;
    case 'mistrial':
      l.stage = 'trial';
      l.next = s.week + TRIAL_WEEKS;
      mg.obstruction[b.id] = (mg.obstruction[b.id] ?? 0) + 1;
      b.evidence = Math.min(100, (b.evidence ?? 0) + 12);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `Mistrial: a juror in the case against ${displayName(b)} was approached. An obstruction count is added.`, kind: 'heat' });
      break;
    case 'flipped':
      bossTurns(ctx, b, d.path ?? 'heir', ses.outcome?.epilogue);
      break;
  }
}

/** The boss became a government witness: the heir takes over under a cloud, or the game ends with the rat in hiding. */
export function bossTurns(ctx: Ctx, b: Character, path: 'heir' | 'witness', epi?: string[]): void {
  const s = ctx.s;
  const mg = mgOf(s);
  const capoIds = capos(s).filter((k) => k.id !== b.id).map((k) => k.id);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(b)} turned government witness.`, kind: 'heat' });
  s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text: `${displayName(b)} betrayed the family and went into witness protection.` });
  const heir = chooseHeir(s, b).heir;
  if (path === 'witness' || !heir) {
    b.imprisonedUntil = undefined;
    s.gameOver = { week: s.week, reason: 'witness', text: (epi ?? [`${displayName(b)} went into witness protection under a new name. The House of ${s.houseName} is finished in Wildwood.`]).join(' ') };
    ctx.log.push(`${displayName(b)} became a government witness. The game ends with the rat in hiding.`);
    return;
  }
  // The old man is gone from the house: a witness against everyone he knew.
  b.faction = 'law';
  b.rank = 'civilian';
  b.dynasty = false;
  b.imprisonedUntil = undefined;
  b.capoId = undefined;
  for (const dd of s.districts) if (dd.capoId === b.id) dd.capoId = undefined;
  succeed(ctx, b);
  const nb = s.characters[s.playerId];
  s.legal = { stage: 'quiet', personId: s.playerId, defense: 0, since: s.week };
  mg.witnesses.push({ id: b.id, name: displayName(b), against: [nb.id, ...capoIds], week: s.week, credibility: 70, boss: true });
  mg.known[b.id] = s.week;
  mg.betrayal = { ratId: b.id, heirId: nb.id, week: s.week, stage: 0 };
  for (const k of capoIds) {
    const kc = s.characters[k];
    if (kc) kc.evidence = Math.min(100, (kc.evidence ?? 0) + 15);
  }
  nb.evidence = Math.min(100, (nb.evidence ?? 0) + 10);
  heat(ctx, 'family', 20, `${b.firstName} ${b.lastName} turned: Philadelphia wants to know what the house knew`, 'heat');
  heat(ctx, 'federal', 10, `${b.firstName} ${b.lastName} is talking to the government`, 'heat');
  respect(ctx, -10, 'The old boss is a rat', 'event');
  for (const m of crew(s)) {
    addOpinion(s, m.id, nb.id, 'Son of a rat', -15, 1);
    addOpinion(s, m.id, b.id, 'Rat', -60, 0);
  }
  addOpinion(s, nb.id, b.id, 'Betrayed the family', -50, 0);
  if (s.cutscenes.length < 3) s.cutscenes.push({ key: 'betrayal_confrontation', title: 'A rat in the house', text: `${b.firstName} ${b.lastName} is in a motel in Pennsylvania with four marshals. ${nb.firstName} sits in his father's chair with the blinds down.`, week: s.week });
}

/** A man of yours who turned: he goes on the witness list against the boss and his capo. */
export function registerWitness(s: GameState, c: Character, scheduleTestimony: boolean, capoId?: string): void {
  const mg = mgOf(s);
  if (mg.witnesses.some((w) => w.id === c.id)) return;
  const k = capoId ? s.characters[capoId] : capoOf(s, c);
  const against = [s.playerId, ...(k && k.id !== c.id ? [k.id] : [])];
  mg.witnesses.push({ id: c.id, name: displayName(c), against, week: s.week, credibility: credibilityOf(c) });
  if (mg.witnesses.length > 12) mg.witnesses = mg.witnesses.slice(-12);
  mg.known[c.id] = s.week;
  if (scheduleTestimony && k && k.id !== c.id) mg.testimony.push({ witnessId: c.id, targetId: k.id, due: s.week + 4 + (s.week % 7) });
}

/* ---------------------------------------------------------------- */
/* Registration                                                      */
/* ---------------------------------------------------------------- */

const trialOddsRows = (_s: GameState, ses: TS) => {
  const d = ses.d;
  if (!d.items.length && !d.pool.length) return [];
  const o = trialOdds(ses);
  return [
    ...o.parts.filter((x) => Math.abs(x.value) >= 0.005).map((x) => ({ label: x.label, value: `${x.value >= 0 ? '+' : '−'}${Math.round(Math.abs(x.value) * 100)}`, tone: (x.value > 0) === (d.side !== 'prosecution') ? 'bad' as const : 'good' as const })),
    { label: 'Base', value: `${Math.round(BASE * 100)}` },
    { label: 'Conviction odds', value: pct(o.p) },
    ...(d.tamper ? [{ label: 'Tampering found out', value: pct(d.tamper.risk), tone: 'bad' as const }] : []),
    ...(d.pool.some((j) => j.seated) ? [{ label: 'A conviction hangs instead', value: pct(hangChance(d.pool)) }] : []),
  ];
};

export const ARRAIGNMENT: MinigameDef<TrialData> = {
  id: 'arraignment',
  init: (s, ses) => initTrial(s, ses, true),
  options: opts,
  step: (s, ses, m) => stepTrial(s, ses, m, true),
  auto: autoMove,
  apply: applyTrial,
};

export const TRIAL: MinigameDef<TrialData> = {
  id: 'trial',
  init: (s, ses) => initTrial(s, ses, false),
  options: opts,
  step: (s, ses, m) => stepTrial(s, ses, m, false),
  auto: autoMove,
  apply: applyTrial,
  odds: trialOddsRows,
};

registerMinigame(ARRAIGNMENT);
registerMinigame(TRIAL);

/* ---------------------------------------------------------------- */
/* Triggers: arrests, testimony, retrials, rival indictments         */
/* ---------------------------------------------------------------- */

export const TRIAL_EVIDENCE = 30;
const NPC_TRIAL_GAP = 4;

export function buildNpcTrial(s: GameState, c: Character, weeks: number): EventInstance {
  const iid = `ev${s.nextId++}`;
  const label = `Trial: ${c.firstName} ${c.lastName}`;
  const fx = (play: number, extra: Record<string, string | number> = {}) => mgEffect('trial', iid, { defendant: c.id, mode: 'crew', play, weeks, ...extra }, undefined, label);
  const rel = c.dynasty ? 'your own blood' : c.rank;
  return {
    iid, defId: 'npc_trial', week: s.week, mandatory: true, priority: 84, meta: { charId: c.id, trial: 1 }, actors: [c.id],
    title: `The county wants ${c.firstName} ${c.lastName}`,
    text: `${displayName(c)} (${rel}) was arrested and the Prosecutor is going to trial: ${Math.round(c.evidence ?? 0)} points of evidence. He knows things. What happens in that courtroom — and in the visiting room — matters to you.`,
    defaultChoiceId: 'quiet',
    choices: [
      { id: 'court', label: 'Take charge of his defense', detail: 'Play it: bail, the government\'s offer to him, the lawyer, the jury, the verdict.', because: `took charge of ${c.firstName}'s defense`, effects: [fx(1)] },
      { id: 'quiet', label: 'Let it play out', detail: 'The house pays for a lawyer and lets him work. Same odds, no say.', because: `let ${c.firstName}'s lawyer handle it`, effects: [fx(0)] },
      { id: 'alone', label: 'Let him fend for himself', detail: 'A public defender, no bail, no envelopes. He will remember.', because: `left ${c.firstName} to fend for himself`, effects: [fx(0, { nohelp: 1 })] },
    ],
  };
}

export function buildRivalTrial(s: GameState, c: Character): EventInstance {
  const iid = `ev${s.nextId++}`;
  const label = `Trial: ${c.firstName} ${c.lastName}`;
  const fx = (play: number, side: Side) => mgEffect('trial', iid, { defendant: c.id, mode: 'rival', play, side }, undefined, label);
  const r = s.rivals.find((x) => x.id === c.faction);
  return {
    iid, defId: 'rival_trial', week: s.week, mandatory: true, priority: 70, meta: { charId: c.id, trial: 1, rival: c.faction }, actors: [c.id],
    title: `${r?.shortName ?? 'A rival'} in the dock`,
    text: `A federal grand jury indicted ${displayName(c)}. The trial is in Camden. You could tip the scales — either way.`,
    defaultChoiceId: 'out',
    choices: [
      { id: 'defend', label: 'Help his defense', detail: 'Money to his lawyer. His outfit will owe you.', because: `helped ${c.firstName} ${c.lastName}'s defense`, effects: [fx(1, 'defense')], disabledReason: s.money < 2000 ? 'Needs $2,000' : undefined },
      { id: 'prosecute', label: 'Help the prosecutor', detail: 'Feed the government what you know. Philadelphia hates a man who talks to the law.', because: `fed the prosecutor what you knew about ${c.firstName}`, effects: [fx(1, 'prosecution')] },
      { id: 'out', label: 'Stay out of it', because: `stayed out of ${c.firstName}'s trial`, effects: [fx(0, 'out')] },
    ],
  };
}

/** Hook from the `imprison` effect: a man with a thick file goes to trial. */
export function onArrest(s: GameState, c: Character, weeks: number): void {
  if (!c.alive || c.id === s.playerId || weeks < 12) return;
  if (c.faction !== 'player' && !c.dynasty) return;
  if ((c.evidence ?? 0) < TRIAL_EVIDENCE) return;
  const mg = mgOf(s);
  if (mg.open.includes(c.id) || s.week - (mg.cool[c.id] ?? -999) < 26) return;
  if (s.week - (mg.lastNpcTrial ?? -999) < NPC_TRIAL_GAP) return;
  mg.open.push(c.id);
  mg.lastNpcTrial = s.week;
  s.eventQueue.push(buildNpcTrial(s, c, weeks));
}

/** Weekly: witnesses testify, retrials come due, the government indicts a rival, flippers are noticed. */
export function trialWeek(ctx: Ctx): void {
  ensureTrialSources();
  const s = ctx.s;
  if (!s.mg && (s.week % 4 !== 0)) return;
  const mg = mgOf(s);
  // Men who turned elsewhere (stand-up/flip consequences) go on the witness list.
  if (s.week % 4 === 0) {
    for (const c of Object.values(s.characters)) {
      if (!c.alive || c.faction !== 'law' || mg.known[c.id] || c.rank !== 'civilian') continue;
      const r = getRelation(s, s.playerId, c.id);
      if (r?.modifiers.some((m) => m.reason === 'Rat')) registerWitness(s, c, false);
      mg.known[c.id] = s.week;
    }
  }
  // A witness takes the stand before a grand jury against one of your people.
  const due = mg.testimony.filter((t) => t.due <= s.week);
  mg.testimony = mg.testimony.filter((t) => t.due > s.week);
  for (const t of due) {
    const target = s.characters[t.targetId];
    const w = s.characters[t.witnessId];
    if (!target?.alive || !w?.alive || target.faction !== 'player') continue;
    target.evidence = Math.min(100, (target.evidence ?? 0) + 15);
    ctx.log.push(`${displayName(w)} testified before a grand jury about ${displayName(target)}.`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(w)} testified before a grand jury about ${displayName(target)}.`, kind: 'heat' });
    if (target.id !== s.playerId && (target.evidence ?? 0) >= 50 && isFree(s, target)) {
      target.imprisonedUntil = s.week + 30;
      target.record = (target.record ?? 0) + 1;
      for (const dd of s.districts) if (dd.capoId === target.id) dd.capoId = undefined;
      ctx.log.push(`ARREST: ${displayName(target)} was picked up on the strength of the testimony.`);
      if (s.cutscenes.length < 3) s.cutscenes.push({ key: 'arrest_interrogation', title: 'The rat\'s testimony', text: `Agents came for ${target.firstName} at the barbershop. The man who sent them used to sit in the next chair.`, week: s.week });
      onArrest(s, target, 30);
    }
  }
  // Retrials.
  const docket = mg.docket.filter((x) => x.due <= s.week);
  mg.docket = mg.docket.filter((x) => x.due > s.week);
  for (const x of docket) {
    const c = s.characters[x.defendantId];
    if (!c?.alive) continue;
    if (x.mode === 'crew' && (c.faction === 'player' || c.dynasty) && c.id !== s.playerId) {
      mg.open.push(c.id);
      s.eventQueue.push(buildNpcTrial(s, c, x.weeks));
    } else if (x.mode === 'rival' && s.rivals.some((r) => r.id === c.faction)) s.eventQueue.push(buildRivalTrial(s, c));
  }
  // The government indicts a rival who has been too loud for too long.
  if (s.week % 2 === 0) {
    for (const r of s.rivals) {
      if (r.kind !== 'mob' || r.exposure < 75) continue;
      const leader = s.characters[r.leaderId];
      if (!leader?.alive || (leader.imprisonedUntil ?? 0) > s.week) continue;
      if (s.week - (mg.cool[leader.id] ?? -999) < 52 || mg.open.includes(leader.id)) continue;
      if (roll({ rng: (s.rng ^ (s.week * 2654435761)) >>> 0 } as unknown as MgSession) > 0.08) continue;
      mg.cool[leader.id] = s.week;
      mg.open.push(leader.id);
      leader.imprisonedUntil = s.week + 2;
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A federal grand jury indicted ${displayName(leader)} of ${r.name}.`, kind: 'rival' });
      s.eventQueue.push(buildRivalTrial(s, leader));
      break;
    }
  }
}

/* ---------------------------------------------------------------- */
/* The heir's betrayal storyline                                     */
/* ---------------------------------------------------------------- */

function betrayalSource(s: GameState): EventInstance | undefined {
  const b = s.mg?.betrayal;
  if (!b || b.heirId !== s.playerId) return undefined;
  const rat = s.characters[b.ratId];
  const heir = player(s);
  if (!rat) return undefined;
  const label = 'The rat in the family';
  const iid = `ev${s.nextId}`;
  const mk = (stage: number, title: string, text: string, choices: EventInstance['choices'], def: string): EventInstance => {
    s.nextId++;
    b.stage = stage;
    return { iid, defId: `betrayal_${stage}`, week: s.week, mandatory: true, priority: 88, title, text, choices, defaultChoiceId: def, actors: [heir.id, rat.id], meta: { family: 1 } };
  };
  const since = s.week - b.week;
  if (b.stage === 0 && since >= 1) {
    return mk(1, 'Philadelphia sends for you', `A car is waiting outside on Pacific Avenue. Across the bridge, men who knew ${rat.firstName} for thirty years want to know what ${heir.firstName} knew, and when.`, [
      { id: 'disown', label: `Disown ${rat.firstName} in front of them`, detail: '"He is dead to me. He is dead to my mother."', because: `disowned ${rat.firstName} in front of Philadelphia`, effects: [{ type: 'heat', bar: 'family', amount: -12, label }, { type: 'respect', amount: 4, label }, { type: 'familyOpinion', amount: -8, reason: `Disowned ${rat.firstName}`, label }] },
      { id: 'tribute', label: 'Bring an envelope ($5,000)', detail: 'Money says what words cannot.', because: 'paid Philadelphia to forget', effects: [{ type: 'money', amount: -5000, label }, { type: 'heat', bar: 'family', amount: -18, label }], disabledReason: s.money < 5000 ? 'Needs $5,000' : undefined },
      { id: 'silent', label: 'Say nothing', detail: 'Let them think what they think.', because: 'said nothing to Philadelphia about his father', effects: [{ type: 'heat', bar: 'family', amount: 5, label }, { type: 'respect', amount: -2, label }] },
    ], 'disown');
  }
  if (b.stage === 1 && since >= 10) {
    return mk(2, `${rat.firstName} testifies`, `${displayName(rat)} sat in a federal courtroom for three days and named names. Some of them were yours.`, [
      { id: 'cleanup', label: 'Clean house: close what he knew about', detail: 'Shut two rackets for a season and move the books.', because: 'cleaned house after the testimony', effects: [{ type: 'money', amount: -4000, label }, { type: 'evidence', charId: heir.id, amount: -10, label }, { type: 'heat', bar: 'federal', amount: -6, label }] },
      { id: 'ride', label: 'Ride it out', because: 'rode out the testimony', effects: [{ type: 'evidence', charId: heir.id, amount: 8, label }, { type: 'heat', bar: 'federal', amount: 5, label }] },
    ], 'cleanup');
  }
  if (b.stage === 2 && since >= 26) {
    return mk(3, 'A letter with no return address', `Postmarked somewhere in the desert. Four lines in ${rat.firstName}'s handwriting. He asks about his grandchildren.`, [
      { id: 'burn', label: 'Burn it unread', because: 'burned the letter', effects: [{ type: 'respect', amount: 1, label }] },
      { id: 'keep', label: 'Keep it in the cellar safe', detail: 'Blood is blood. If Philadelphia ever finds it...', because: 'kept the letter', effects: [{ type: 'schedule', key: 'stand_up', minWeeks: 8, maxWeeks: 30, chance: 0, hint: 'a letter in the safe', label }, { type: 'heat', bar: 'family', amount: 4, label }] },
    ], 'burn');
  }
  if (b.stage === 3) delete s.mg!.betrayal;
  return undefined;
}

let sourcesOn = false;
/** Event sources register lazily (events.ts and this module import each other). */
export function ensureTrialSources(): void {
  if (sourcesOn) return;
  sourcesOn = true;
  registerEventSource(betrayalSource);
}

/** A trial of a rival leader (for tests and other branches). */
export function rivalTrialFor(s: GameState, rival: RivalId): EventInstance | undefined {
  const r = s.rivals.find((x) => x.id === rival);
  const leader = r ? s.characters[r.leaderId] : undefined;
  return leader ? buildRivalTrial(s, leader) : undefined;
}
