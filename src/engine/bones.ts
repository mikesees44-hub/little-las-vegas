import { bonesXp, schemeXp } from './crewXp';
import type { ActionPreview } from './actions';
import { attr } from './attrs';
import { dateOfWeek } from './calendar';
import { crew, displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { applyEffects, fmtMoney } from './effects';
import { passedOver } from './grievances';
import { addStory, capoOf } from './hierarchy';
import type { Acceptance, Reason } from './interactions';
import { rivalMoneyHit, type Ctx } from './ledger';
import { fileReceipt, receiptLie } from './ledgerbook';
import { addOpinion, changeMeter, opinion } from './relations';
import { chance, pick, randInt } from './rng';
import { ensureBones, roll01, type BonesAction, type BonesEntry, type BonesJob, type BonesJobKind, type BonesOp, type BonesOutcome, type BonesState } from './bonesState';
import { rivalCaps } from './rivals';
import type { Character, Effect, EventInstance, FactionId, GameState, PlayerAction, RivalId, Scheme } from './types';

/**
 * MAKING YOUR BONES. Before an associate can be proposed for membership he
 * has to prove himself on a serious job for the family: part of a hit (on
 * the team or as the shooter), a major heist, a collection that went bad
 * where he stood tall, or a pinch where he said nothing. It goes on his
 * record with the date and the job ("Made his bones: 1961, the Garden Pier
 * job"). Everything is abstract and non-graphic.
 *
 * His sponsor (his capo) puts him on a job. His traits and personality
 * decide how he handles it: he does it, he freezes, he talks too much
 * afterward, or he does it like a hothead. The outcome is a pure hash of the
 * seed and the job, so it replays exactly.
 *
 * Rival families' prospects make their bones too, sometimes on your people.
 * A man with bones and no opening in Philadelphia's books gets restless.
 * Getting made without bones takes a big favor from Philadelphia and costs
 * you with the old-timers.
 */

export const FAVOR_COST = 5000;
export const JOB_INFO: Record<BonesJobKind, { name: string; role: string; text: string; weeks: number; odds: number }> = {
  hit: { name: 'A piece of work', role: 'on the team', text: 'He goes with the men on a hit the family has planned.', weeks: 0, odds: -5 },
  heist: { name: 'A score', role: 'on the crew', text: 'A real score with real men: a truck, a vault, a payroll. Nobody waits for a slow man.', weeks: 3, odds: 5 },
  collection: { name: 'A collection', role: 'collector', text: 'A debt the family has given up on, and the people who don\'t want it paid. He has to stand there and not blink.', weeks: 2, odds: 10 },
  pinch: { name: 'A pinch', role: 'stood up', text: 'Arrested, and said nothing.', weeks: 0, odds: 0 },
};

const PLACES = [
  'Garden Pier', 'Hunt\'s Pier', 'Marine Pier', 'Ocean Pier', 'Schellenger\'s Landing', 'Otten\'s Harbor', 'Two Mile Landing',
  'Rio Grande', 'Anglesea', 'Causeway', 'Pacific Avenue', 'Crest motel', 'Black Horse Pike', 'Cape May ferry', 'Rambler Road',
  'Shore Road', 'Burleigh', 'Fishing Creek', 'Sunset Lake', 'Bolero',
];

/* ---------------------------------------------------------------- */
/* The requirement                                                  */
/* ---------------------------------------------------------------- */

export function hasBones(c: Character | undefined): boolean {
  return !!c && (c.bones?.length ?? 0) > 0;
}

/** "Made his bones: 1961, the Garden Pier job" */
export function bonesLine(e: BonesEntry): string {
  return `Made his bones: ${e.year}, the ${e.job}`;
}

/** He can be proposed: he has bones, or Philadelphia agreed to a favor. */
export function mayPropose(s: GameState, c: Character | undefined): boolean {
  return !!c && (hasBones(c) || s.bones?.waived[c.id] !== undefined);
}

export function needsBones(s: GameState, c: Character): boolean {
  return c.alive && c.faction === 'player' && c.rank === 'associate' && !c.specialty && !hasBones(c) && s.bones?.waived[c.id] === undefined;
}

/** Why he cannot be proposed yet (or undefined). */
export function bonesBlock(s: GameState, c: Character | undefined): string | undefined {
  if (!c || mayPropose(s, c)) return undefined;
  return `${c.firstName} has not made his bones (put him on a job, or ask Philadelphia for a favor)`;
}

export function jobName(seed: string, key: string): string {
  return `${PLACES[Math.floor(roll01(seed, key, 'place') * PLACES.length)]} job`;
}

/** Records the bones on his record (also used by tests and the scheme hooks). */
export function recordBones(s: GameState, c: Character, job: string, kind: BonesJobKind, role: string, text: string, verified = true): BonesEntry {
  const e: BonesEntry = { week: s.week, year: dateOfWeek(Math.max(1, s.week)).y, job, kind, role, text, verified };
  (c.bones ??= []).push(e);
  addStory(s, c, `${bonesLine(e)} (${role}).`);
  return e;
}

/** The sponsor who puts him on a job: his capo, else the boss. */
export function sponsorOf(s: GameState, c: Character): Character {
  return capoOf(s, c) ?? player(s);
}

/* ---------------------------------------------------------------- */
/* Odds and outcomes                                                 */
/* ---------------------------------------------------------------- */

export interface BonesOdds extends Acceptance {
  /** Odds he goes at it too hard, if he does it. */
  hot: number;
  /** Odds he talks about it afterward, if he does it. */
  talk: number;
}

export function bonesOdds(s: GameState, c: Character, kind: BonesJobKind, role?: string): BonesOdds {
  const reasons: Reason[] = [{ label: 'Base', value: 60 }];
  const add = (label: string, v: number) => { if (Math.round(v)) reasons.push({ label, value: Math.round(v) }); };
  add('Courage', (attr(s, c, 'courage') - 50) * 0.6);
  add('Muscle', (c.attributes.force - 50) * 0.3);
  add('Discipline', (c.attributes.discipline - 50) * 0.2);
  add(JOB_INFO[kind].name, JOB_INFO[kind].odds);
  if (role === 'shooter') add('The shooter: it is on him', -15);
  if (hasTrait(c, 'Cowardly')) add('Cowardly', -30);
  if (hasTrait(c, 'Hot-headed')) add('Hot-headed', 10);
  if (hasTrait(c, 'Cruel')) add('Cruel', 10);
  if (hasTrait(c, 'Loyal-to-a-fault')) add('Loyal to a fault', 5);
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  const imp = attr(s, c, 'impulsiveness');
  const hot = Math.max(0, Math.min(0.9, (imp - 45) / 80 + (hasTrait(c, 'Hot-headed') ? 0.3 : 0) + (hasTrait(c, 'Cruel') ? 0.1 : 0)));
  const disc = attr(s, c, 'discretion');
  const talk = Math.max(0, Math.min(0.9, (55 - disc) / 80 + (hasTrait(c, 'Drinker') ? 0.2 : 0) + (hasTrait(c, 'Charming') ? 0.05 : 0) - (hasTrait(c, 'Paranoid') ? 0.1 : 0)));
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons, hot, talk };
}

/** How he handles the job. Deterministic: a hash of the seed, the job and the man. */
export function bonesOutcome(s: GameState, c: Character, jobId: string, kind: BonesJobKind, role?: string): BonesOutcome {
  const o = bonesOdds(s, c, kind, role);
  if (roll01(s.seed, jobId, c.id, 'do') >= o.chance) return 'froze';
  if (roll01(s.seed, jobId, c.id, 'hot') < o.hot) return 'hothead';
  if (roll01(s.seed, jobId, c.id, 'talk') < o.talk) return 'talked';
  return 'clean';
}

export const OUTCOME_TEXT: Record<BonesOutcome, string> = {
  clean: 'did what he was there to do and went home',
  froze: 'froze when it counted',
  talked: 'did it, then talked about it in a bar on Pacific Avenue',
  hothead: 'did it, and went at it harder than anyone asked',
};

function oddsText(o: BonesOdds): string {
  return `Does it: ${Math.round(o.chance * 100)}% (${o.reasons.filter((r) => r.label !== 'Base').map((r) => `${r.value > 0 ? '+' : '−'}${Math.abs(r.value)} ${r.label}`).join(', ') || 'no edge either way'}). If he does: hothead ${Math.round(o.hot * 100)}%, talks ${Math.round(o.talk * 100)}%.`;
}

/* ---------------------------------------------------------------- */
/* Orders                                                            */
/* ---------------------------------------------------------------- */

function activeHit(s: GameState, schemeId?: string): Scheme | undefined {
  return s.schemes.find((x) => x.owner === 'player' && x.kind === 'murder' && x.agents.length < 4 && x.progress < 85 && (!schemeId || x.id === schemeId));
}

function busyOnJob(s: GameState, id: string): boolean {
  return !!s.bones?.jobs.some((j) => j.prospectId === id);
}

export function oldTimers(s: GameState): Character[] {
  return crew(s).filter((c) => c.rank !== 'associate' && (c.madeWeek !== undefined || (s.date.y - c.birth.y) >= 45) && !c.dynasty);
}

export function previewBones(s: GameState, a: BonesAction): ActionPreview {
  const c = s.characters[a.charId];
  const nm = c ? `${c.firstName} ${c.lastName}` : '?';
  if (a.op === 'assign') {
    const info = JOB_INFO[a.kind];
    const sc = a.kind === 'hit' ? activeHit(s, a.schemeId) : undefined;
    const target = sc?.targetId ? s.characters[sc.targetId] : undefined;
    const sponsor = c ? sponsorOf(s, c) : undefined;
    const title = a.kind === 'hit' ? `Put ${c?.firstName ?? '?'} on the team${target ? ` for ${target.firstName} ${target.lastName}` : ''}` : `Put ${c?.firstName ?? '?'} on ${info.name.toLowerCase()} to make his bones`;
    let why: string | undefined;
    if (!c || !c.alive || c.faction !== 'player' || c.rank !== 'associate') why = 'Only associates make their bones';
    else if (c.specialty) why = 'Specialists are hired hands, not prospects';
    else if (hasBones(c)) why = 'He already made his bones';
    else if (!isFree(s, c)) why = 'He is inside';
    else if (busyOnJob(s, c.id)) why = 'He is already on a job';
    else if (a.kind === 'hit' && !sc) why = 'No hit planned that has room for one more man';
    else if (a.kind === 'hit' && sc?.agents.includes(c.id)) why = 'He is already on that team';
    const odds = c ? bonesOdds(s, c, a.kind) : undefined;
    return {
      title,
      detail: `${info.text} ${sponsor && c ? `${sponsor.id === s.playerId ? 'You sponsor him' : `${sponsor.firstName} sponsors him`}. ` : ''}${a.kind === 'hit' ? 'He gets his bones if the hit comes off and he does his part.' : `Takes ${info.weeks} weeks.`} The family hears how he did from his own report.`,
      effects: c && sponsor ? [{ type: 'bones', op: { op: 'assign', charId: c.id, sponsorId: sponsor.id, kind: a.kind, schemeId: sc?.id } }] : [],
      cost: 0, because: `put ${nm} on a job to make his bones`, disabledReason: why, category: 'event',
      odds: odds ? { chance: odds.chance, reasons: odds.reasons } : undefined,
      warning: odds && (odds.hot >= 0.35 || odds.talk >= 0.35) ? `${odds.hot >= 0.35 ? `A hothead (${Math.round(odds.hot * 100)}%)` : ''}${odds.hot >= 0.35 && odds.talk >= 0.35 ? ' and ' : ''}${odds.talk >= 0.35 ? `a talker (${Math.round(odds.talk * 100)}%)` : ''}: it may cost you after.` : undefined,
    };
  }
  // The favor: Philadelphia makes him without bones.
  const philly = s.rivals.find((r) => r.id === 'philly');
  const pOp = philly ? opinion(s, philly.leaderId, s.playerId) : 0;
  const v = c ? sponsorOf(s, c) : undefined;
  let why: string | undefined;
  if (!c || !c.alive || c.faction !== 'player' || c.rank !== 'associate' || c.specialty) why = 'Only associates of the family can be proposed';
  else if (hasBones(c)) why = 'He made his bones: propose him the normal way';
  else if (c.proposedWeek !== undefined) why = 'His name is already with Philadelphia';
  else if (s.bones?.waived[c.id] !== undefined) why = 'Philadelphia already agreed';
  else if (pOp < -30) why = 'Philadelphia will not do you a favor right now';
  else if (s.money < FAVOR_COST) why = `Needs ${fmtMoney(FAVOR_COST)}`;
  const n = oldTimers(s).length;
  return {
    title: `Ask Philadelphia to make ${c?.firstName ?? '?'} as a favor`,
    detail: `A big ask: his name goes up without bones. ${n} old-timer${n === 1 ? '' : 's'} will remember that he never did anything for this thing of ours.`,
    effects: c ? [
      { type: 'money', amount: -FAVOR_COST, label: `A favor from Philadelphia: ${nm} without his bones` },
      { type: 'rivalOpinion', rival: 'philly', amount: -10, reason: 'Asked for a big favor' },
      { type: 'bones', op: { op: 'waive', charId: c.id } },
      { type: 'propose', charId: c.id, voucherId: v?.id ?? s.playerId },
      { type: 'opinion', from: c.id, to: s.playerId, amount: 12, reason: 'Got me made as a favor', decay: 1 },
    ] : [],
    cost: FAVOR_COST, because: `asked Philadelphia to make ${nm} as a favor`, disabledReason: why, category: 'event',
  };
}

/* ---------------------------------------------------------------- */
/* Effect ops                                                        */
/* ---------------------------------------------------------------- */

export function describeBonesOp(s: GameState, op: BonesOp): string | undefined {
  switch (op.op) {
    case 'assign': {
      const c = s.characters[op.charId];
      return `${c?.firstName ?? '?'} goes on ${op.kind === 'hit' ? 'the team' : JOB_INFO[op.kind].name.toLowerCase()} (${c ? Math.round(bonesOdds(s, c, op.kind).chance * 100) : '?'}% he does it)`;
    }
    case 'waive': return `Old-timers −6: made without his bones (${oldTimers(s).length} men)`;
    case 'pinch': return 'He made his bones by standing up';
    case 'guard': return 'Men on the target until it blows over';
    case 'note': return op.text;
  }
}

export function applyBonesOp(ctx: Ctx, op: BonesOp, _label: string): void {
  const s = ctx.s;
  const b = ensureBones(s);
  switch (op.op) {
    case 'assign': {
      const c = s.characters[op.charId];
      if (!c?.alive || c.faction !== 'player' || c.rank !== 'associate' || hasBones(c) || busyOnJob(s, c.id)) break;
      const id = `bj${s.nextId++}`;
      const sc = op.kind === 'hit' ? activeHit(s, op.schemeId) : undefined;
      if (op.kind === 'hit') {
        if (!sc) break;
        if (!sc.agents.includes(c.id)) sc.agents.push(c.id);
      }
      const name = sc?.targetId && s.characters[sc.targetId] ? `${s.characters[sc.targetId].lastName} piece of work` : jobName(s.seed, id);
      const job: BonesJob = { id, owner: 'player', prospectId: c.id, sponsorId: op.sponsorId, kind: op.kind, name, startWeek: s.week, dueWeek: s.week + (JOB_INFO[op.kind].weeks || 99), schemeId: sc?.id };
      b.jobs.push(job);
      b.stats.jobs++;
      if (op.kind !== 'hit') c.busyUntil = job.dueWeek;
      addStory(s, c, `Put on the ${name} to make his bones${s.characters[op.sponsorId] && op.sponsorId !== s.playerId ? ` (${s.characters[op.sponsorId].firstName} sponsors him)` : ''}.`);
      ctx.log.push(`${displayName(c)} goes on the ${name} to make his bones.`);
      break;
    }
    case 'waive': {
      const c = s.characters[op.charId];
      if (!c) break;
      b.waived[c.id] = s.week;
      b.stats.favors++;
      for (const m of oldTimers(s)) addOpinion(s, m.id, s.playerId, `Got ${c.firstName} made without his bones`, -6, 1);
      addStory(s, c, 'Philadelphia agreed to make him as a favor to the boss. He never made his bones.');
      break;
    }
    case 'pinch': {
      const c = s.characters[op.charId];
      if (!c?.alive || c.faction !== 'player' || c.rank !== 'associate' || hasBones(c)) break;
      recordBones(s, c, jobName(s.seed, `pinch:${c.id}:${s.week}`), 'pinch', 'stood up', 'Took a pinch and said nothing to the detectives.');
      b.history.push({ week: s.week, owner: 'player', prospectId: c.id, kind: 'pinch', name: c.bones![c.bones!.length - 1].job, outcome: 'clean' });
      b.stats.made++;
      break;
    }
    case 'guard': {
      const j = b.jobs.find((x) => x.id === op.jobId);
      if (j) j.guarded = true;
      break;
    }
    case 'note':
      break;
  }
  trimHistory(b);
}

function trimHistory(b: BonesState): void {
  if (b.history.length > 60) b.history = b.history.slice(-60);
}

/* ---------------------------------------------------------------- */
/* Resolution                                                        */
/* ---------------------------------------------------------------- */

function apply(ctx: Ctx, label: string, because: string, effects: Effect[]): void {
  if (effects.length) applyEffects(ctx, effects.map((e) => (e.label ? e : { ...e, label })), { label, because, category: 'event' });
}

/** A player prospect's job (a score or a collection) comes due. */
function resolvePlayerJob(ctx: Ctx, j: BonesJob): void {
  const s = ctx.s;
  const b = ensureBones(s);
  const c = s.characters[j.prospectId];
  const k = s.characters[j.sponsorId];
  if (!c?.alive || c.faction !== 'player' || !isFree(s, c)) return;
  const out = bonesOutcome(s, c, j.id, j.kind);
  const label = `Bones: the ${j.name}`;
  const because = `put ${c.firstName} on the ${j.name}`;
  const base = j.kind === 'heist' ? 1500 + Math.round(roll01(s.seed, j.id, 'take') * 40) * 100 : 600 + Math.round(roll01(s.seed, j.id, 'take') * 18) * 100;
  const actual = out === 'froze' ? Math.round(base * 0.3 / 100) * 100 : base;
  // His report: an honest man reports what happened; a dishonest one shades it.
  const lie = receiptLie(s, c, j.id);
  const skim = lie && actual > 0 ? Math.round(actual * (0.2 + roll01(s.seed, j.id, 'skim') * 0.25) / 100) * 100 : 0;
  const reported = actual - skim;
  const claimed: BonesOutcome = lie ? 'clean' : out;
  const eff: Effect[] = [];
  if (reported > 0) eff.push({ type: 'money', amount: reported, label: `${label}: ${c.firstName}'s envelope` });
  if (skim > 0) eff.push({ type: 'wealth', charId: c.id, amount: skim, label });
  if (out !== 'froze') eff.push({ type: 'respect', amount: 1, label });
  if (out === 'froze') {
    eff.push({ type: 'heat', bar: 'local', amount: 3, label: `${label}: it went sideways` });
    if (k && k.id !== c.id && k.id !== s.playerId) eff.push({ type: 'opinion', from: k.id, to: c.id, amount: -15, reason: 'Froze on the job', decay: 1, label });
  } else if (k && k.id !== c.id && k.id !== s.playerId) eff.push({ type: 'opinion', from: k.id, to: c.id, amount: 8, reason: 'Did the job right', decay: 1, label });
  if (out === 'talked') {
    eff.push({ type: 'evidence', charId: c.id, amount: 12, label: `${label}: he talked` }, { type: 'heat', bar: 'federal', amount: 2, label: `${label}: he talked` });
    if (k) eff.push({ type: 'evidence', charId: k.id, amount: 4, label: `${label}: he talked` });
  }
  if (out === 'hothead') eff.push({ type: 'heat', bar: 'local', amount: 5, label: `${label}: too much` }, { type: 'evidence', charId: c.id, amount: 6, label: `${label}: too much` });
  apply(ctx, label, because, eff);
  // His bones go on the record if he did it, or if he says he did (his word, until it is checked).
  if (out !== 'froze' || claimed !== 'froze') {
    recordBones(s, c, j.name, j.kind, JOB_INFO[j.kind].role, `${c.firstName} ${claimed === 'froze' ? OUTCOME_TEXT.froze : OUTCOME_TEXT[claimed]}.`, out !== 'froze');
  } else addStory(s, c, `Froze on the ${j.name}.`);
  bumpOutcome(b, out, out !== 'froze' || claimed !== 'froze');
  bonesXp(s, c.id, j.name, out);
  b.history.push({ week: s.week, owner: 'player', prospectId: c.id, kind: j.kind, name: j.name, outcome: out });
  fileReceipt(s, { byId: c.id, job: `the ${j.name}`, kind: j.kind, actual, reported, outcome: out, claimed, bonesOf: c.id, jobId: j.id });
  ctx.log.push(`The ${j.name}: ${displayName(c)} ${OUTCOME_TEXT[claimed]}${lie ? ' — so he says' : ''}.`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} went on the ${j.name} to make his bones.`, kind: 'misc' });
}

function bumpOutcome(b: BonesState, out: BonesOutcome, made: boolean): void {
  if (made) b.stats.made++;
  if (out === 'froze') b.stats.froze++;
  if (out === 'talked') b.stats.talked++;
  if (out === 'hothead') b.stats.hotheads++;
}

/**
 * Hook for the scheme system: a player's hit or heist resolved. Each
 * associate on it who has no bones gets a role and an outcome; on success
 * the ones who did their part made their bones. Returns the men who froze.
 */
export function bonesFromScheme(ctx: Ctx, sc: Scheme, agents: Character[], success: boolean): void {
  const s = ctx.s;
  if (sc.owner !== 'player' || (sc.kind !== 'murder' && sc.kind !== 'heist')) return;
  // Everyone on it learns something (crewXp.ts).
  schemeXp(s, sc.kind, agents.map((a) => a.id), success);
  const b = ensureBones(s);
  const prospects = agents.filter((a) => a.alive && a.faction === 'player' && a.rank === 'associate' && !a.specialty && !hasBones(a));
  if (!prospects.length) {
    b.jobs = b.jobs.filter((j) => j.schemeId !== sc.id);
    return;
  }
  const kind: BonesJobKind = sc.kind === 'murder' ? 'hit' : 'heist';
  const strongest = [...agents].sort((x, y) => y.attributes.force - x.attributes.force)[0];
  const t = sc.targetId ? s.characters[sc.targetId] : undefined;
  for (const c of prospects) {
    const j = b.jobs.find((x) => x.schemeId === sc.id && x.prospectId === c.id);
    const name = j?.name ?? (t ? `${t.lastName} piece of work` : jobName(s.seed, `${sc.id}:${c.id}`));
    const role = kind === 'hit' ? (strongest?.id === c.id ? 'shooter' : 'on the team') : 'on the crew';
    const out = bonesOutcome(s, c, j?.id ?? sc.id, kind, role);
    const label = `Bones: the ${name}`;
    const lie = receiptLie(s, c, j?.id ?? sc.id);
    const claimed: BonesOutcome = lie ? 'clean' : out;
    const eff: Effect[] = [];
    if (out === 'talked') eff.push({ type: 'evidence', charId: c.id, amount: 12, label: `${label}: he talked` }, { type: 'heat', bar: 'federal', amount: 2, label: `${label}: he talked` });
    if (out === 'hothead') eff.push({ type: 'heat', bar: 'local', amount: 4, label: `${label}: too much` });
    apply(ctx, label, sc.because, eff);
    const earned = success && (out !== 'froze' || claimed !== 'froze');
    if (earned) recordBones(s, c, name, kind, role, `${c.firstName} ${OUTCOME_TEXT[claimed]}.`, out !== 'froze');
    else addStory(s, c, success ? `Froze on the ${name}; the others finished it.` : `Was on the ${name} when it fell apart.`);
    bumpOutcome(b, out, earned);
    b.history.push({ week: s.week, owner: 'player', prospectId: c.id, kind, name, outcome: out });
    fileReceipt(s, { byId: c.id, job: `the ${name}`, kind, actual: 0, reported: 0, outcome: out, claimed, bonesOf: earned ? c.id : undefined, jobId: j?.id ?? `${sc.id}:${c.id}` });
  }
  b.jobs = b.jobs.filter((x) => x.schemeId !== sc.id);
  trimHistory(b);
}

/* ---------------------------------------------------------------- */
/* Rival prospects                                                   */
/* ---------------------------------------------------------------- */

function withStream<T>(s: GameState, b: BonesState, fn: () => T): T {
  const main = s.rng;
  s.rng = b.rng;
  try {
    return fn();
  } finally {
    b.rng = s.rng;
    s.rng = main;
  }
}

function rivalProspect(s: GameState, b: BonesState, r: RivalId): Character | undefined {
  const id = b.rivalProspects[r];
  const c = id ? s.characters[id] : undefined;
  if (c?.alive && c.faction === r && c.rank === 'associate') return c;
  const made = withStream(s, b, () => makeCharacter(s, { faction: r, rank: 'associate', age: randInt(s, 19, 26), ethnicity: r === 'feldstein' ? 'Jewish' : r === 'kessler' ? 'Irish' : 'Italian' }));
  made.ambition = 'Make his bones and get made';
  b.rivalProspects[r] = made.id;
  return made;
}

function rivalWeek(ctx: Ctx, b: BonesState): void {
  const s = ctx.s;
  if (s.week < 8 || s.week % 4 !== 0) return;
  const boss = player(s);
  for (const r of s.rivals) {
    if (r.kind !== 'mob' || !s.characters[r.leaderId]?.alive) continue;
    if (b.jobs.some((j) => j.owner === r.id)) continue;
    if (!chance(b, 0.15)) continue;
    const pr = rivalProspect(s, b, r.id);
    if (!pr) continue;
    const hostile = opinion(s, r.leaderId, boss.id) < -20 || r.feud || r.war;
    const onYou = chance(b, hostile ? 0.8 : 0.45);
    const id = `bj${s.nextId++}`;
    const job: BonesJob = { id, owner: r.id, prospectId: pr.id, sponsorId: r.leaderId, kind: 'collection', name: jobName(s.seed, id), startWeek: s.week, dueWeek: s.week + randInt(b, 3, 5) };
    if (onYou) {
      const men = crew(s).filter((c) => isFree(s, c) && (c.rank === 'soldier' || c.rank === 'associate') && !c.dynasty);
      const biz = s.businesses.filter((x) => x.owner === 'player' && x.category !== 'property');
      if (men.length && (chance(b, 0.6) || !biz.length)) {
        job.kind = 'hit';
        job.targetId = pick(b, men).id;
      } else if (biz.length) {
        job.kind = 'heist';
        job.targetBizId = pick(b, biz).id;
      }
      // Your people hear about it in time, often.
      job.warned = !chance(b, 0.55);
    } else job.kind = pick(b, ['heist', 'collection', 'hit'] as const);
    b.jobs.push(job);
    b.stats.rivalJobs++;
  }
}

function resolveRivalJob(ctx: Ctx, j: BonesJob): void {
  const s = ctx.s;
  const b = ensureBones(s);
  const r = s.rivals.find((x) => x.id === j.owner);
  const c = s.characters[j.prospectId];
  if (!r || !c?.alive || c.faction !== r.id) return;
  let out = bonesOutcome(s, c, j.id, j.kind);
  const t = j.targetId ? s.characters[j.targetId] : undefined;
  const biz = j.targetBizId ? s.businesses.find((x) => x.id === j.targetBizId && x.owner === 'player') : undefined;
  const onYou = (!!t && t.alive && t.faction === 'player') || !!biz;
  // Men on the target turn most of these away.
  if (onYou && j.guarded && out !== 'froze' && roll01(s.seed, j.id, 'guard') < 0.6) out = 'froze';
  const label = `${r.shortName}'s new man makes his bones`;
  let cost: string | undefined;
  if (out !== 'froze' && onYou) {
    if (t) {
      const killed = roll01(s.seed, j.id, 'grave') < (out === 'hothead' ? 0.25 : 0.08);
      if (killed) {
        apply(ctx, label, `${r.shortName} sent a prospect after ${t.firstName}`, [{ type: 'kill', charId: t.id, cause: `killed by a ${r.shortName} prospect making his bones`, killer: r.id }]);
        cost = `${t.firstName} ${t.lastName} killed`;
      } else {
        apply(ctx, label, `${r.shortName} sent a prospect after ${t.firstName}`, [
          { type: 'health', charId: t.id, amount: -25, label },
          { type: 'respect', amount: -1, label: `${label}: ${t.firstName} was jumped` },
          { type: 'opinion', from: t.id, to: r.leaderId, amount: -25, reason: 'Sent a kid after me', decay: 1, label },
        ]);
        addStory(s, t, `Jumped on ${pick(b, ['Pacific Avenue', 'the boardwalk', 'Rio Grande Avenue', 'the Causeway'])} by a ${r.shortName} prospect making his bones. He was in Burdette Tomlin for a week.`);
        cost = `${t.firstName} ${t.lastName} hurt`;
      }
    } else if (biz) {
      const took = rivalMoneyHit(ctx, Math.round(biz.weeklyBase * 2), `${label}: ${biz.name} robbed`, rivalCaps(s).moneyFrac);
      cost = `${biz.name} robbed (${fmtMoney(took)})`;
    }
    b.stats.rivalOnYou++;
    ctx.log.push(`${displayName(c)} of ${r.name} made his bones on your people: ${cost}.`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A ${r.shortName} prospect, ${displayName(c)}, made his bones on your people (${cost}).`, kind: 'rival' });
  }
  if (out === 'talked') {
    // Bar talk reaches your people too.
    apply(ctx, `${label}: he talked`, `${c.firstName} talked`, [{ type: 'hook', targetId: c.id, strong: false, reason: `He talked about the ${j.name} in a bar` }]);
    c.evidence = Math.min(100, (c.evidence ?? 0) + 10);
  }
  if (out !== 'froze') {
    recordBones(s, c, j.name, j.kind, JOB_INFO[j.kind].role, onYou ? `Against the Wildwood family: ${cost}.` : `For ${r.name}.`);
    c.rank = 'soldier';
    c.madeWeek = s.week;
    b.rivalProspects[r.id] = undefined;
  } else addStory(s, c, `Froze on the ${j.name}.`);
  b.history.push({ week: s.week, owner: r.id, prospectId: c.id, kind: j.kind, name: j.name, outcome: out, ...(cost !== undefined ? { onYou: cost } : {}) });
}

/* ---------------------------------------------------------------- */
/* Restless men                                                      */
/* ---------------------------------------------------------------- */

function restlessWeek(ctx: Ctx, b: BonesState): void {
  const s = ctx.s;
  const waiting = crew(s).filter((c) => c.rank === 'associate' && hasBones(c) && isFree(s, c));
  // Someone else was made this week: every man with older bones who is still waiting was passed over.
  const madeNow = crew(s).filter((c) => c.madeWeek === s.week && c.rank !== 'associate');
  for (const m of madeNow) {
    const mine = m.bones?.[0]?.week ?? Infinity;
    const wanters = waiting.filter((c) => (c.bones![0].week < mine) && c.id !== m.id);
    if (wanters.length) passedOver(ctx, 'membership', m.id, { wanters, public: true });
  }
  const full = !s.books?.open || (s.books?.slots ?? 0) <= 0;
  if (!full) return;
  for (const c of waiting) {
    const since = s.week - c.bones![c.bones!.length - 1].week;
    const key = `restless:${c.id}`;
    if (since < 20 || s.week - (b.cooldowns[key] ?? -99) < 26) continue;
    b.cooldowns[key] = s.week;
    const patient = hasTrait(c, 'Patient') || hasTrait(c, 'Loyal-to-a-fault');
    addOpinion(s, c.id, s.playerId, 'Made my bones and I am still waiting', patient ? -3 : -7, 1);
    changeMeter(s, c.id, s.playerId, 'grievance', patient ? 3 : 8);
    addStory(s, c, `Made his bones ${Math.round(since / 52 * 10) / 10 >= 1 ? `${Math.floor(since / 52)} year${since >= 104 ? 's' : ''}` : `${since} weeks`} ago and is still waiting for the books to open.`);
    b.stats.restless++;
  }
}

/* ---------------------------------------------------------------- */
/* The week                                                          */
/* ---------------------------------------------------------------- */

export function bonesWeek(ctx: Ctx): void {
  const s = ctx.s;
  const b = ensureBones(s);
  // Jobs on schemes that are gone are dropped (the hook resolves the ones that finish).
  b.jobs = b.jobs.filter((j) => !j.schemeId || s.schemes.some((x) => x.id === j.schemeId));
  for (const j of [...b.jobs]) {
    if (j.schemeId || j.dueWeek > s.week) continue;
    b.jobs = b.jobs.filter((x) => x !== j);
    if (j.owner === 'player') resolvePlayerJob(ctx, j);
    else resolveRivalJob(ctx, j);
  }
  rivalWeek(ctx, b);
  restlessWeek(ctx, b);
  for (const k of Object.keys(b.waived)) if (!s.characters[k]?.alive || s.characters[k].rank !== 'associate') delete b.waived[k];
  trimHistory(b);
}

/* ---------------------------------------------------------------- */
/* Popups (one candidate a week)                                     */
/* ---------------------------------------------------------------- */

function evBase(s: GameState, defId: string, title: string, text: string, priority: number, charId: string, actors: string[]): Omit<EventInstance, 'choices' | 'defaultChoiceId'> {
  return { iid: `ev${s.nextId++}`, defId, title, text, week: s.week, mandatory: false, priority, meta: { charId }, actors };
}

/** The prospect a sponsor would bring up this week (exported for tests and the UI). */
export function offerProspect(s: GameState): Character | undefined {
  const b = s.bones;
  return crew(s)
    .filter((c) => needsBones(s, c) && isFree(s, c) && !busyOnJob(s, c.id) && s.week - (b?.cooldowns[`offer:${c.id}`] ?? -99) >= 16 && s.week - (c.lastAskWeek ?? -99) >= 4)
    .sort((x, y) => x.birth.y - y.birth.y || (x.id < y.id ? -1 : 1))[0];
}

export function buildBonesOffer(s: GameState, c: Character): EventInstance {
  const k = sponsorOf(s, c);
  const kn = k.id === s.playerId ? 'You' : displayName(k);
  const sc = activeHit(s);
  const target = sc?.targetId ? s.characters[sc.targetId] : undefined;
  const heist = jobName(s.seed, `offer:${c.id}:${s.week}`);
  const label = `${c.firstName} makes his bones`;
  const choice = (id: string, kind: 'heist' | 'collection' | 'hit', title: string): EventInstance['choices'][number] => {
    const o = bonesOdds(s, c, kind);
    return {
      id, label: title, detail: oddsText(o), because: `put ${c.firstName} on a job to make his bones`,
      effects: [{ type: 'bones', op: { op: 'assign', charId: c.id, sponsorId: k.id, kind, schemeId: kind === 'hit' ? sc?.id : undefined }, label }],
    };
  };
  const choices = [
    choice('heist', 'heist', `Put him on the ${heist} (a real score)`),
    choice('collection', 'collection', 'Give him a collection nobody else could make'),
    ...(sc && target ? [choice('hit', 'hit', `Put him on the team for ${target.firstName} ${target.lastName}`)] : []),
    { id: 'wait', label: 'He is not ready', because: `told ${k.firstName} his man is not ready`, effects: [{ type: 'opinion', from: c.id, to: s.playerId, amount: -4, reason: 'Said I was not ready', decay: 1, label } as Effect, ...(k.id !== s.playerId ? [{ type: 'opinion', from: k.id, to: s.playerId, amount: -2, reason: 'Did not trust my judgment', decay: 1, label } as Effect] : [])] },
  ];
  return {
    ...evBase(s, 'bones_offer', `${c.firstName} wants to make his bones`,
      `${kn === 'You' ? 'You have' : `${kn} has`} been watching ${displayName(c)} for a year. "He's ready. Before his name goes anywhere he has to do something for this thing of ours." Nobody gets proposed to Philadelphia without his bones. What ${c.firstName} does on the job — and what he says about it after — will follow him.`,
      44, c.id, k.id === s.playerId ? [c.id] : [k.id, c.id]),
    choices, defaultChoiceId: 'collection',
  };
}

function buildRivalWarning(s: GameState, j: BonesJob): EventInstance | undefined {
  const r = s.rivals.find((x) => x.id === j.owner);
  const c = s.characters[j.prospectId];
  const t = j.targetId ? s.characters[j.targetId] : undefined;
  const biz = j.targetBizId ? s.businesses.find((x) => x.id === j.targetBizId) : undefined;
  if (!r || !c?.alive || (!t?.alive && !biz)) return undefined;
  const what = t ? `${displayName(t)}` : biz!.name;
  const label = `Word about ${r.shortName}'s new kid`;
  return {
    ...evBase(s, 'bones_warning', `${r.shortName}'s new kid needs to make his bones`,
      `A bartender at the Shamrock heard it twice in one night: ${displayName(c)}, a kid ${r.name} is bringing along, has to make his bones — and the talk is it's on ${what}. Kids like that go hard to prove themselves.`,
      41, t?.id ?? c.id, [c.id, ...(t ? [t.id] : [])]),
    choices: [
      { id: 'guard', label: `Put men on ${t ? t.firstName : biz!.name} ($600)`, detail: 'Most of these fall apart when somebody is waiting.', because: `put men on ${what}`, effects: [{ type: 'money', amount: -600, label }, { type: 'bones', op: { op: 'guard', jobId: j.id }, label }] },
      { id: 'word', label: `Send word to ${s.characters[r.leaderId]?.firstName ?? r.shortName}`, detail: 'Tell his boss you know. It costs nothing, and it does nothing to stop a kid who wants it bad.', because: `sent word to ${r.shortName} about their kid`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: -3, reason: 'Knows our business', label }] },
      { id: 'ignore', label: 'Kids talk', because: `ignored the talk about ${r.shortName}'s kid`, effects: [] },
    ],
    defaultChoiceId: 'guard',
  };
}

export function bonesEventSource(s: GameState): EventInstance | undefined {
  const b = s.bones;
  if (!b) return undefined;
  const warn = b.jobs.find((j) => j.owner !== 'player' && j.warned && (j.targetId || j.targetBizId) && !j.guarded && j.dueWeek > s.week && s.week - (b.cooldowns[`warn:${j.id}`] ?? -99) > 99);
  if (warn) {
    b.cooldowns[`warn:${warn.id}`] = s.week;
    warn.warned = false;
    const ev = buildRivalWarning(s, warn);
    if (ev) return ev;
  }
  if (s.week < 6 || s.week - (b.cooldowns.offer ?? -99) < 6) return undefined;
  const c = offerProspect(s);
  if (!c) return undefined;
  b.cooldowns.offer = s.week;
  b.cooldowns[`offer:${c.id}`] = s.week;
  return buildBonesOffer(s, c);
}

/* ---------------------------------------------------------------- */
/* The random player                                                 */
/* ---------------------------------------------------------------- */

export function bonesActions(s: GameState): PlayerAction[] {
  const out: PlayerAction[] = [];
  const pros = crew(s).filter((c) => needsBones(s, c));
  if (!pros.length) return out;
  const c = pros[s.week % pros.length];
  out.push({ kind: 'bones', op: { op: 'assign', charId: c.id, kind: (['heist', 'collection', 'hit'] as const)[s.week % 3] } });
  if (s.week % 7 === 0) out.push({ kind: 'bones', op: { op: 'favor', charId: c.id } });
  return out;
}

/** The men who made their bones on a rival's side against you, newest first (UI). */
export function rivalBonesOnYou(s: GameState): { name: string; rival: FactionId; week: number; cost: string }[] {
  return (s.bones?.history ?? []).filter((h) => h.owner !== 'player' && h.onYou).map((h) => ({ name: s.characters[h.prospectId] ? displayName(s.characters[h.prospectId]) : '?', rival: h.owner, week: h.week, cost: h.onYou! })).reverse();
}
