import { ageOn } from './calendar';
import { crew, displayName, hasTrait, player } from './characters';
import { attr, addSuccess, groupScore, growAttr, viewAttrs } from './attrs';
import { holder } from './council';
import { addStory } from './hierarchy';
import type { Reason } from './interactions';
import type { Ctx } from './ledger';
import { addOpinion, changeMeter, getRelation, opinion } from './relations';
import { chance } from './rng';
import { pw, pwView, type AmbitionWant, type DesignationMode, type GroomPath, type HiddenAmbition } from './powerState';
import type { Character, EventInstance, GameState } from './types';

/**
 * THE HEIR PARADOX (design item 15) and PUBLIC vs SECRET HEIR (item 16).
 *
 * Every succession candidate has a leadership-capability score and a
 * challenge-pressure score, each with its full breakdown. Strong attributes
 * cut both ways: command and charisma make a better boss — and a man the
 * crew would follow against you. Each candidate also carries a hidden
 * ambition that evolves (a promised retirement that never comes).
 */

export interface Score {
  score: number;
  reasons: Reason[];
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const r1 = (v: number) => Math.round(v);

/** Everyone who could plausibly follow the boss: grown members of the house and the senior crew. */
export function successionCandidates(s: GameState): Character[] {
  const out: Character[] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.alive || c.id === s.playerId) continue;
    const age = ageOn(c.birth, s.date);
    if (age < 18) continue;
    const house = c.dynasty && (c.faction === 'player' || c.faction === 'none');
    const senior = c.faction === 'player' && (c.rank === 'underboss' || c.rank === 'capo' || c.rank === 'consigliere');
    if (house || senior) out.push(c);
  }
  return out;
}

/** How good a boss he would be. */
export function capability(s: GameState, c: Character): Score {
  const reasons: Reason[] = [];
  const add = (label: string, value: number) => { if (Math.round(value)) reasons.push({ label, value: r1(value) }); };
  add('Leadership', groupScore(s, c, 'leadership') * 0.3);
  add('Intelligence', groupScore(s, c, 'intelligence') * 0.18);
  add('Social', groupScore(s, c, 'social') * 0.14);
  add('Business', groupScore(s, c, 'business') * 0.12);
  add('Criminal', groupScore(s, c, 'criminal') * 0.12);
  const age = ageOn(c.birth, s.date);
  if (age < 25) add('Too young', -12);
  else if (age > 68) add('Too old', -8);
  add('His record', Math.min(12, (c.success?.length ?? 0) * 2));
  const caps = crew(s).filter((x) => x.rank === 'capo' && x.id !== c.id);
  if (caps.length) add('What the capos think of him', caps.reduce((a, k) => a + opinion(s, k.id, c.id), 0) / caps.length / 5);
  if (hasTrait(c, 'Hot-headed')) add('Hot-headed', -5);
  if (hasTrait(c, 'Cowardly')) add('Cowardly', -10);
  if (hasTrait(c, 'Drinker')) add('Drinker', -5);
  if (c.rank === 'underboss') add('Already the underboss', 6);
  return { score: clamp(reasons.reduce((a, x) => a + x.value, 0)), reasons };
}

/** Open grievances he holds against the boss (sum of severities). */
export function grievanceLoad(s: GameState, c: Character): number {
  return (s.power?.grievances ?? []).filter((g) => g.charId === c.id && g.status === 'open').reduce((a, g) => a + g.severity, 0);
}

/**
 * How likely he is to take the chair before it is given (0-100).
 * Monotonic: more ambition or more grievance never lowers it.
 */
export function challengePressure(s: GameState, c: Character): Score {
  const x = viewAttrs(s, c).v;
  const reasons: Reason[] = [];
  const add = (label: string, value: number) => { if (Math.round(value)) reasons.push({ label, value: r1(value) }); };
  add('Ambition', (x.ambition - 40) * 0.5);
  const load = grievanceLoad(s, c);
  const meter = getRelation(s, c.id, s.playerId)?.grievance ?? 0;
  add('Grievances against you', load * 0.35 + meter * 0.2);
  add('Men who would follow him', (c.attrs?.followers ?? 0) * 1.5);
  if (x.charisma > 50) add('Charisma pulls the men his way', (x.charisma - 50) * 0.25);
  if (x.command > 50) add('Command', (x.command - 50) * 0.15);
  add('His own money', Math.min(12, c.wealth / 5000));
  const boss = player(s);
  const bossAge = boss ? ageOn(boss.birth, s.date) : 50;
  if (bossAge > 60) add('The boss is getting old', (bossAge - 60) * 0.5);
  const amb = s.power?.ambitions[c.id];
  if (amb?.broken) add('A promise you broke', 15 * amb.broken);
  add('Patience', -(x.patience - 50) * 0.3);
  add('Loyalty', -(x.loyalty - 50) * 0.4);
  add('What he thinks of you', -opinion(s, c.id, s.playerId) * 0.15);
  if (hasTrait(c, 'Loyal-to-a-fault')) add('Loyal to a fault', -15);
  return { score: clamp(reasons.reduce((a, r) => a + r.value, 0) + 10), reasons };
}

/* ------------------------------------------------------------------ */
/* Hidden ambitions                                                    */
/* ------------------------------------------------------------------ */

export function wantOf(s: GameState, c: Character): AmbitionWant {
  const x = viewAttrs(s, c).v;
  if (x.ambition >= 65 && (c.dynasty || c.rank === 'underboss' || c.rank === 'capo')) return 'chair';
  if (c.rank === 'capo' && x.ambition >= 50) return 'underboss';
  if (c.rank === 'soldier' && x.ambition >= 50) return 'capo';
  if (x.conscience >= 70 && x.ambition < 45) return 'out';
  if (x.greed >= 60) return 'money';
  return 'respect';
}

export function ambitionOf(s: GameState, c: Character): HiddenAmbition {
  const p = pw(s);
  let a = p.ambitions[c.id];
  if (!a) {
    a = { want: wantOf(s, c), intensity: clamp(attr(s, c, 'ambition') * 0.6), broken: 0, revealed: false, log: [] };
    p.ambitions[c.id] = a;
  }
  return a;
}

function note(s: GameState, a: HiddenAmbition, text: string): void {
  a.log.push({ week: s.week, text });
  if (a.log.length > 8) a.log = a.log.slice(-8);
}

export const WANT_TEXT: Record<AmbitionWant, string> = {
  chair: 'wants the chair', underboss: 'wants to be underboss', capo: 'wants his own crew', respect: 'wants to be respected', money: 'wants to be rich', out: 'wants out of the life',
};

/** Monthly: ambitions evolve with age, promises, being passed over, and the boss's years. */
export function ambitionsMonth(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  const boss = player(s);
  const bossAge = ageOn(boss.birth, s.date);
  const d = p.designation;
  for (const c of successionCandidates(s)) {
    const a = ambitionOf(s, c);
    const x = viewAttrs(s, c).v;
    let delta = (x.ambition - 50) / 25 - (x.patience - 50) / 50;
    const isHeir = c.id === d.publicId || c.id === d.secretId || s.designatedHeirId === c.id;
    if (isHeir) delta -= bossAge > 65 ? 0 : 1.5;
    if (bossAge > 62) delta += 0.5;
    a.intensity = clamp(a.intensity + delta);
    // A promise that comes due and is not kept.
    if (a.promise && s.week >= a.promise.by) {
      a.broken++;
      a.intensity = clamp(a.intensity + 25);
      a.want = 'chair';
      note(s, a, `The promise came due and the boss is still in the chair: ${a.promise.text}.`);
      addOpinion(s, c.id, boss.id, 'Broke his promise to step aside', -20, 1);
      changeMeter(s, c.id, boss.id, 'grievance', 20);
      addStory(s, c, 'The boss broke his word to him.');
      ctx.log.push(`${displayName(c)} was promised the chair by now. He is still waiting.`);
      p.stats.brokenPromises++;
      a.promise = undefined;
    }
    const w = wantOf(s, c);
    if (w !== a.want && a.intensity < 70) {
      note(s, a, `What he wants changed: he ${WANT_TEXT[w]}.`);
      a.want = w;
    }
    // The consigliere digging for secrets reads men.
    if (!a.revealed && holder(s, 'consigliere') && s.council.consigliere.task === 'cons_secrets' && chance(p, 0.06)) {
      a.revealed = true;
      note(s, a, 'The consigliere found out what he really wants.');
    }
  }
}

/** The move an heir makes when his ambition boils over (a mandatory scene). */
export function buildHeirMove(s: GameState, c: Character): EventInstance {
  const label = `${c.firstName} wants the chair`;
  const op = (reply: 'stepaside' | 'promise' | 'refuse' | 'exile') => ({ type: 'power', op: { op: 'heirMove', charId: c.id, reply }, label }) as const;
  return {
    iid: `ev${s.nextId++}`, defId: 'power_heir_move', week: s.week, mandatory: true, priority: 86,
    title: `${c.firstName} will not wait`,
    text: `${displayName(c)} closes the office door behind him. "You said it would be me. You said it years ago. The men already come to me with their problems. How long do I wait — until they carry you out?"`,
    defaultChoiceId: 'promise', meta: { who: c.id }, actors: [c.id],
    choices: [
      { id: 'stepaside', label: 'Step aside for him', detail: 'Retire to Florida. He takes the chair.', because: `stepped aside for ${c.firstName}`, effects: [op('stepaside')] },
      { id: 'promise', label: 'Promise him: two more years', detail: 'Buys time. Break it and he will remember.', because: `promised ${c.firstName} the chair in two years`, effects: [op('promise')] },
      { id: 'refuse', label: '"When I am dead. Not before."', detail: 'His pressure rises; his friends hear about it.', because: `told ${c.firstName} to wait for the funeral`, effects: [op('refuse'), { type: 'respect', amount: 1, label }] },
      { id: 'exile', label: 'Send him away', detail: 'Out of Wildwood. Out of the line.', because: `sent ${c.firstName} away`, effects: [op('exile'), { type: 'familyOpinion', amount: -6, reason: `Sent ${c.firstName} away`, label }] },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Designation and quiet grooming (item 16)                            */
/* ------------------------------------------------------------------ */

export const DESIGNATION_INFO: Record<DesignationMode, { name: string; text: string; needsHeir: boolean }> = {
  underboss: { name: 'The official underboss', text: 'The underboss is the heir. Everyone knows where they stand.', needsHeir: false },
  named: { name: 'A publicly named successor', text: 'You name him in front of the capos. Clear — and every man who wanted it knows he lost.', needsHeir: true },
  private: { name: 'A private designation (the secret heir)', text: 'The crew thinks it is the underboss. You groom someone else quietly. If it comes out, the underboss learns he was a placeholder.', needsHeir: true },
  unwritten: { name: 'An unwritten preference', text: 'Everybody can guess; nobody can prove it. Less resentment now, more trouble at the funeral.', needsHeir: true },
  multiple: { name: 'Several heirs, let them prove it', text: 'The capos choose among the house when the day comes. Rivalry keeps them sharp — and at each other\'s throats.', needsHeir: false },
  none: { name: 'No heir', text: 'Blood decides. Nobody is passed over today; everybody fights tomorrow.', needsHeir: false },
  committee: { name: 'A leadership committee', text: 'The capos rule together and choose. Stable, slow, and nobody is boss.', needsHeir: false },
};

export const GROOM_PATHS: Record<GroomPath, { name: string; text: string; keys: Parameters<typeof growAttr>[2][]; weekly: number; exposure: number }> = {
  restaurant: { name: 'Run the restaurant or the hotel', text: 'Payroll, suppliers, a dining room full of people who must leave happy.', keys: ['management', 'earning', 'interpersonal', 'entrepreneurship'], weekly: 100, exposure: 3 },
  lawschool: { name: 'Law school in Philadelphia', text: 'Three years at Temple Law. Comes home knowing exactly how a RICO case is built.', keys: ['knowledge', 'negotiation', 'judgment', 'discretion'], weekly: 200, exposure: 1 },
  college: { name: 'College', text: 'Penn, then a job in town. A degree is a disguise.', keys: ['learning', 'knowledge', 'intelligence', 'strategy'], weekly: 150, exposure: 1 },
  legit: { name: 'A legitimate company', text: 'A trucking firm with clean books and real customers.', keys: ['finance', 'management', 'investment', 'organization'], weekly: 120, exposure: 2 },
  charity: { name: 'The parish charity', text: 'The Feast of the Assumption committee, the food drive, a name the town trusts.', keys: ['empathy', 'charisma', 'interpersonal', 'conflict'], weekly: 80, exposure: 2.5 },
  properties: { name: 'Manage the properties', text: 'Rooming houses, storefronts, collection day. Learns who pays and who doesn\'t.', keys: ['investment', 'finance', 'organization', 'streetSmarts'], weekly: 60, exposure: 2.5 },
  consigliere: { name: 'Apprentice to the consigliere', text: 'Learns the family\'s secrets from the man who keeps them. Close to the life — close to being seen.', keys: ['judgment', 'strategy', 'negotiation', 'manipulation'], weekly: 0, exposure: 5 },
  political: { name: 'A post at City Hall', text: 'A commission seat, a ribbon to cut, a phone that rings in Trenton.', keys: ['persuasion', 'negotiation', 'charisma', 'knowledge'], weekly: 150, exposure: 3.5 },
};

/** Who the crew believes the heir is. */
export function publicHeir(s: GameState): Character | undefined {
  const d = pwView(s).designation;
  if (d.mode === 'underboss' || d.mode === 'private') return crew(s).find((c) => c.rank === 'underboss');
  if (d.mode === 'named' && d.publicId) return s.characters[d.publicId];
  return undefined;
}

/** Monthly: the secret heir grows on his path; the secret creeps toward the light. */
export function groomingMonth(ctx: Ctx): EventInstance | undefined {
  const s = ctx.s;
  const p = pw(s);
  const d = p.designation;
  const g = d.grooming;
  if (!g) return undefined;
  const c = s.characters[g.charId];
  if (!c?.alive) {
    d.grooming = undefined;
    return undefined;
  }
  const path = GROOM_PATHS[g.path];
  for (const k of path.keys) if (chance(p, 0.55)) growAttr(s, c, k, 1);
  if (s.week - g.since >= 52 && !(c.success ?? []).some((e) => e.text.startsWith('Groomed'))) addSuccess(s, c, `Groomed for the chair: ${path.name.toLowerCase()}`);
  if (d.mode !== 'private' || d.exposed) return undefined;
  // Exposure: the path's visibility, his discretion, the underboss's eyes.
  const ub = crew(s).find((x) => x.rank === 'underboss');
  const disc = attr(s, c, 'discretion');
  const eyes = ub ? attr(s, ub, 'awareness') : 40;
  d.exposure = Math.min(100, d.exposure + path.exposure * (1 + (60 - disc) / 100) + Math.max(0, eyes - 50) / 15);
  if (d.exposure >= 100 || chance(p, d.exposure / 600)) {
    d.exposed = s.week;
    p.stats.discoveries++;
    if (ub && ub.id !== c.id) return buildBrokenPromise(s, ub, c);
  }
  return undefined;
}

/** How the underboss takes it, by his traits. */
export function brokenPromiseReaction(s: GameState, ub: Character): { kind: 'accept' | 'swallow' | 'faction' | 'confront' | 'money' | 'talk'; text: string } {
  const x = viewAttrs(s, ub).v;
  if (hasTrait(ub, 'Loyal-to-a-fault')) return { kind: 'accept', text: 'He is hurt, and loyal anyway. He asks only to hear it from you.' };
  if (hasTrait(ub, 'Hot-headed')) return { kind: 'confront', text: 'He kicks the door of your office open. He wants it out, now, in front of whoever is there.' };
  if (hasTrait(ub, 'Ambitious') || x.ambition >= 70) return { kind: 'faction', text: 'He says nothing to you. He says a lot to the capos.' };
  if (hasTrait(ub, 'Greedy')) return { kind: 'money', text: 'He wants to be paid for the years he kept the chair warm.' };
  if (hasTrait(ub, 'Cowardly')) return { kind: 'talk', text: 'He is frightened of what comes next, and frightened men talk — to Philadelphia, or worse.' };
  if (hasTrait(ub, 'Patient') || x.patience >= 65) return { kind: 'swallow', text: 'He swallows it. He will wait. Patient men can resent quietly for fifteen years.' };
  return { kind: 'swallow', text: 'He takes it without a word. That is what worries the consigliere.' };
}

/** "The Broken Promise": the underboss finds out he was a placeholder. */
export function buildBrokenPromise(s: GameState, ub: Character, heir: Character): EventInstance {
  const r = brokenPromiseReaction(s, ub);
  const label = 'The Broken Promise';
  const op = (reply: 'truth' | 'official' | 'buy' | 'retire' | 'remove') => ({ type: 'power', op: { op: 'brokenPromise', reply, ubId: ub.id, heirId: heir.id }, label }) as const;
  return {
    iid: `ev${s.nextId++}`, defId: 'power_broken_promise', week: s.week, mandatory: true, priority: 87,
    title: 'The Broken Promise',
    text: `${displayName(ub)} knows. Somebody saw ${heir.firstName} where an heir is groomed, and put it together: the underboss was only keeping the chair warm. ${r.text}`,
    defaultChoiceId: r.kind === 'accept' ? 'truth' : 'buy', meta: { who: ub.id, heir: heir.id, reaction: r.kind }, actors: [ub.id, heir.id],
    choices: [
      { id: 'truth', label: '"The chair is yours. It always was."', detail: `Drop the secret. ${heir.firstName} will remember being dropped.`, because: `told ${ub.firstName} the chair is his`, effects: [op('truth')] },
      { id: 'official', label: `Make ${heir.firstName} the heir, openly`, detail: `${ub.firstName} is passed over in front of everyone.`, because: `named ${heir.firstName} heir in front of the capos`, effects: [op('official')] },
      { id: 'buy', label: 'Buy his patience ($5,000)', detail: 'Money now; the grievance stays, smaller.', because: `paid ${ub.firstName} to accept it`, effects: [{ type: 'money', amount: -5000, label }, op('buy')] },
      { id: 'retire', label: 'Retire him with honor', detail: 'A party at the 500 Club, a house in Florida, out of the life.', because: `retired ${ub.firstName} with honor`, effects: [{ type: 'money', amount: -3000, label }, op('retire')] },
      { id: 'remove', label: 'He knows too much. Remove him.', detail: 'The crew will understand what kind of boss you are.', because: `had ${ub.firstName} removed`, effects: [op('remove'), { type: 'heat', bar: 'local', amount: 6, label }] },
    ],
  };
}

export const DESIGNATION_MODES = Object.keys(DESIGNATION_INFO) as DesignationMode[];
export const GROOM_PATH_IDS = Object.keys(GROOM_PATHS) as GroomPath[];
