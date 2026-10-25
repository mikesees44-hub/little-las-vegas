import { ageOn } from './calendar';
import { crew, displayName, hasTrait, player } from './characters';
import { attr, viewAttrs } from './attrs';
import { SEATS, SEAT_INFO } from './council';
import { defect } from './crewlife';
import { capability, successionCandidates } from './heir';
import { addStory } from './hierarchy';
import type { Reason } from './interactions';
import type { Ctx } from './ledger';
import { addOpinion, changeMeter, opinion } from './relations';
import { chance, randInt } from './rng';
import { pw, type Grievance } from './powerState';
import type { Character, EventInstance, Faction, GameState } from './types';

/**
 * THE PASSED-OVER SYSTEM (design item 13). Every vacancy produces winners
 * and losers. When a post changes hands the game finds everyone who wanted
 * it and works out how each one takes it (ambition, pride, patience,
 * loyalty, qualification, seniority, perceived fairness, and whether it was
 * announced in public or explained in private). Grievances are remembered
 * and climb an escalation ladder at a pace set by the man's personality:
 *
 *   0 disappointed → 1 private resentment → 2 faction building →
 *   3 open disagreement → 4 breakdown (he walks) → 5 crisis (a coup)
 *
 * Faction building and coups use the crew's existing factions (crewlife.ts):
 * a grievance never duplicates them, it feeds them.
 */

export const STAGE_NAMES = ['Disappointed', 'Private resentment', 'Building a faction', 'Open disagreement', 'Breakdown', 'Crisis'];

/** Every post the game watches, with who holds it now. */
export function currentPosts(s: GameState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of crew(s)) {
    if (c.rank === 'capo') out[`capo:${c.id}`] = c.id;
    if (c.rank === 'underboss') out.underboss = c.id;
  }
  for (const st of SEATS) {
    if (st === 'underboss') continue;
    const h = s.council?.[st]?.holderId;
    if (h) out[`seat:${st}`] = h;
  }
  const d = s.power?.designation;
  const heir = s.successionLaw === 'appointed' ? s.designatedHeirId : undefined;
  if (heir && d?.mode !== 'private') out.heir = heir;
  for (const b of s.businesses) if (b.owner === 'player' && (b.staffIds?.length ?? 0) >= 2) out[`manager:${b.id}`] = b.staffIds![0];
  return out;
}

export function postLabel(s: GameState, post: string): string {
  if (post.startsWith('capo:')) return 'a capo\'s chair';
  if (post === 'underboss') return 'underboss';
  if (post.startsWith('seat:')) return SEAT_INFO[post.slice(5) as keyof typeof SEAT_INFO]?.name.toLowerCase() ?? post.slice(5);
  if (post === 'heir') return 'heir to the chair';
  if (post === 'chair') return 'the chair';
  if (post === 'property') return 'the family property';
  if (post.startsWith('manager:')) {
    const b = s.businesses.find((x) => x.id === post.slice(8));
    return b ? `manager of ${b.name}` : 'a manager\'s job';
  }
  return post;
}

/** Everyone who wanted the post (besides the winner). */
export function wantersFor(s: GameState, post: string, winnerId: string): Character[] {
  const winner = s.characters[winnerId];
  const wants = (c: Character, fit: number) => c.alive && c.id !== winnerId && c.id !== s.playerId && fit + attr(s, c, 'ambition') * 0.6 >= 45;
  if (post.startsWith('capo:')) return crew(s).filter((c) => c.rank === 'soldier' && wants(c, (c.madeWeek !== undefined ? 15 : 5) + (c.goal === 'become_capo' ? 20 : 0)));
  if (post === 'underboss') return crew(s).filter((c) => (c.rank === 'capo' || c.rank === 'consigliere') && wants(c, 15 + (c.goal === 'take_chair' ? 15 : 0)));
  if (post.startsWith('seat:')) {
    const skill = SEAT_INFO[post.slice(5) as keyof typeof SEAT_INFO]?.skill ?? 'leadership';
    return crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'capo') && wants(c, (c.attributes[skill] - 40) / 2));
  }
  if (post === 'heir' || post === 'chair') return successionCandidates(s).filter((c) => wants(c, c.dynasty ? 20 : c.rank === 'underboss' ? 25 : 10));
  if (post === 'property') return [];
  if (post.startsWith('manager:')) {
    const b = s.businesses.find((x) => x.id === post.slice(8));
    return (b?.staffIds ?? []).map((id) => s.characters[id]).filter((c): c is Character => !!c && wants(c, 15));
  }
  void winner;
  return [];
}

function seniority(s: GameState, c: Character): number {
  const rank = { boss: 6, underboss: 5, consigliere: 4, capo: 3, soldier: 2, associate: 1, civilian: 0 }[c.rank];
  return rank * 10 + Math.min(30, ageOn(c.birth, s.date) - 20);
}

/** How a man takes losing a post to someone else: severity 0-100 with the reasons. */
export function resentment(s: GameState, c: Character, winner: Character | undefined, post: string, isPublic: boolean): { severity: number; reasons: Reason[] } {
  const x = viewAttrs(s, c).v;
  const reasons: Reason[] = [];
  const add = (label: string, v: number) => { if (Math.round(v)) reasons.push({ label, value: Math.round(v) }); };
  add('Ambition', (x.ambition - 50) * 0.4);
  add('Pride', (x.pride - 50) * (isPublic ? 0.45 : 0.3));
  add('Patience', -(x.patience - 50) * 0.3);
  add('Loyalty', -(x.loyalty - 50) * 0.3);
  if (winner) {
    const q = capability(s, c).score - capability(s, winner).score;
    add(q > 0 ? 'He is the better man' : 'The better man won', q * 0.4);
    const sen = (seniority(s, c) - seniority(s, winner)) / 3;
    add(sen > 0 ? 'Seniority: he was here first' : 'The winner had seniority', Math.max(-10, Math.min(12, sen)));
    if (winner.dynasty && !c.dynasty && q > 0) add('Nepotism: the boss\'s blood got it', 15);
  }
  if ((post === 'chair' || post === 'heir') && c.rank === 'underboss') add('The underboss\'s claim', 15);
  if (isPublic && x.pride >= 60) add('Humiliated in front of everyone', 6);
  if (!isPublic) add('You explained it to him privately', -8);
  add('What he thinks of you', -opinion(s, c.id, s.playerId) * 0.15);
  return { severity: Math.max(0, Math.min(100, Math.round(18 + reasons.reduce((a, r) => a + r.value, 0)))), reasons };
}

/** Weeks between escalation checks: patient men simmer for years, hotheads boil in weeks. */
function interval(s: GameState, c: Character): number {
  const x = viewAttrs(s, c).v;
  const base = 6 + (x.patience - 50) / 2 + (100 - x.impulsiveness) / 10;
  return Math.max(3, Math.round(hasTrait(c, 'Hot-headed') ? base / 2 : hasTrait(c, 'Patient') ? base * 2 : base));
}

/** Highest stage this man will ever reach (loyal and very patient men stop at quiet resentment). */
export function ceiling(s: GameState, c: Character, g: Grievance): number {
  const x = viewAttrs(s, c).v;
  if (hasTrait(c, 'Loyal-to-a-fault')) return 1;
  if (x.patience >= 75 && g.severity < 70) return 1;
  if (x.loyalty >= 75 && g.severity < 60) return 2;
  if (hasTrait(c, 'Cowardly')) return 3;
  return 5;
}

/**
 * A post changed hands: create a grievance for EVERY man who wanted it
 * (mild ones start, and usually stay, at "disappointed").
 */
export function passedOver(ctx: Ctx, post: string, winnerId: string, opts: { public?: boolean; wanters?: Character[] } = {}): Grievance[] {
  const s = ctx.s;
  const p = pw(s);
  const isPublic = opts.public ?? p.announce === 'public';
  const winner = s.characters[winnerId];
  const wanters = opts.wanters ?? wantersFor(s, post, winnerId);
  const out: Grievance[] = [];
  const label = postLabel(s, post);
  const boss = player(s);
  for (const c of wanters) {
    if (p.grievances.some((g) => g.charId === c.id && g.post === post && g.winnerId === winnerId && g.status === 'open')) continue;
    const { severity, reasons } = resentment(s, c, winner, post, isPublic);
    const g: Grievance = {
      id: `g${s.nextId++}`, charId: c.id, post, postLabel: label, winnerId, byId: boss.id, severity,
      witnesses: isPublic ? Math.max(3, crew(s).length) : 1, week: s.week, stage: 0, status: 'open', reasons, public: isPublic,
      next: s.week + interval(s, c),
    };
    p.grievances.push(g);
    p.stats.grievances++;
    out.push(g);
    if (severity >= 10) {
      addOpinion(s, c.id, boss.id, `Passed over for ${label}`, -Math.round(severity / 3), 1);
      if (winner && winner.id !== c.id) addOpinion(s, c.id, winner.id, `Got ${label} instead of me`, -Math.round(severity / 4), 1);
      changeMeter(s, c.id, boss.id, 'grievance', Math.round(severity / 2));
    }
    addStory(s, c, `Wanted ${label}; ${winner ? `${winner.firstName} ${winner.lastName}` : 'someone else'} got it.`);
    const amb = p.ambitions[c.id];
    if (amb) amb.intensity = Math.min(100, amb.intensity + Math.round(severity / 8));
  }
  if (out.length) {
    const hot = out.filter((g) => g.severity >= 40);
    ctx.log.push(`${winner ? displayName(winner) : 'Someone'} got ${label}. ${out.length} man${out.length > 1 ? 'en' : ''} wanted it${hot.length ? `; ${hot.map((g) => s.characters[g.charId]?.firstName).join(', ')} took it badly` : ''}.`);
  }
  // Keep the list bounded: forget long-settled ones.
  if (p.grievances.length > 80) p.grievances = p.grievances.filter((g) => g.status === 'open' || s.week - g.week < 156).slice(-80);
  return out;
}

/** Weekly vacancy detection: compare who holds each post with last week. */
export function detectVacancies(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  const now = currentPosts(s);
  if (Object.keys(p.posts).length) {
    for (const [post, id] of Object.entries(now)) {
      const prev = p.posts[post];
      if (prev === id) continue;
      if (post.startsWith('capo:')) passedOver(ctx, post, id);
      else if (post.startsWith('manager:')) { if (prev) passedOver(ctx, post, id); }
      else passedOver(ctx, post, id);
    }
  }
  p.posts = now;
}

/** Monthly: grievances climb (or fade), at each man's own pace. */
export function grievancesMonth(ctx: Ctx): EventInstance[] {
  const s = ctx.s;
  const p = pw(s);
  const out: EventInstance[] = [];
  const boss = player(s);
  for (const g of p.grievances) {
    if (g.status !== 'open') continue;
    const c = s.characters[g.charId];
    if (!c?.alive || c.faction !== 'player' && !c.dynasty) {
      g.status = 'faded';
      continue;
    }
    // Fading: a man who is doing well and likes the boss lets it go.
    const op = opinion(s, c.id, boss.id);
    if (g.stage <= 1 && op >= 30 && s.week - g.week > 26) {
      g.status = 'faded';
      g.resolution = 'He let it go.';
      continue;
    }
    if (g.severity < 15 && s.week - g.week > 52) {
      g.status = 'faded';
      g.resolution = 'It stopped mattering.';
      continue;
    }
    if (s.week < g.next) continue;
    g.next = s.week + interval(s, c);
    if (g.stage >= ceiling(s, c, g)) continue;
    const pUp = g.severity / 100 + attr(s, c, 'ambition') / 250 - op / 150;
    if (!chance(p, Math.max(0.03, Math.min(0.85, pUp)))) continue;
    g.stage++;
    const ev = escalate(ctx, g, c);
    if (ev) out.push(ev);
  }
  return out;
}

function escalate(ctx: Ctx, g: Grievance, c: Character): EventInstance | undefined {
  const s = ctx.s;
  const boss = player(s);
  const name = displayName(c);
  switch (g.stage) {
    case 1: {
      const who = c.household?.wife ? `his wife ${c.household.wife}` : 'his friends at the club';
      addStory(s, c, `Complains to ${who} about being passed over for ${g.postLabel}.`);
      addOpinion(s, c.id, boss.id, `Still bitter about ${g.postLabel}`, -4, 1);
      return undefined;
    }
    case 2: {
      // Faction building: join or found one in the crew's existing faction system.
      if (c.faction !== 'player') return undefined;
      const existing = s.factions.find((f) => f.memberIds.includes(c.id));
      if (existing) return undefined;
      const friends = crew(s).filter((o) => o.id !== c.id && o.rank !== 'associate' && opinion(s, o.id, c.id) >= 10 && opinion(s, o.id, boss.id) < 30);
      const join = s.factions.find((f) => f.agenda === 'underboss' || f.agenda === 'abdicate');
      if (join) {
        join.memberIds.push(c.id);
        addStory(s, c, `Joined ${join.name ?? 'a faction'} over ${g.postLabel}.`);
      } else if (friends.length) {
        const d = s.districts.find((x) => x.capoId === c.id);
        const f: Faction = { id: `f${s.nextId++}`, leaderId: c.id, memberIds: [c.id, ...friends.slice(0, 3).map((o) => o.id)], demand: 'contracts', agenda: 'underboss', candidateId: c.id, since: s.week, stage: 0, stageWeek: s.week, name: d ? `the ${d.name} guys` : `${c.firstName} ${c.lastName}'s people` };
        s.factions.push(f);
        addStory(s, c, `Started meeting with ${friends.length} friends about ${g.postLabel}.`);
        ctx.log.push(`${name} has started meeting with friends: he never got over being passed over for ${g.postLabel}.`);
      }
      return undefined;
    }
    case 3:
      return buildOpenDisagreement(s, g, c);
    case 4: {
      if (c.faction === 'player' && !c.dynasty && c.rank !== 'underboss') {
        g.status = 'exploded';
        g.resolution = 'He walked out.';
        defect(ctx, c, 'desert');
        return undefined;
      }
      addOpinion(s, c.id, boss.id, `Will not forgive ${g.postLabel}`, -10, 0);
      return undefined;
    }
    case 5: {
      g.status = 'exploded';
      g.resolution = 'It became a coup.';
      const f = s.factions.find((x) => x.memberIds.includes(c.id));
      if (f && !s.scheduled.some((x) => x.key === 'coup' && x.params.faction === f.id)) {
        s.scheduled.push({ id: `sc${s.nextId++}`, key: 'coup', dueWeek: s.week + randInt(s, 2, 4), because: `passed ${c.firstName} over for ${g.postLabel}`, sourceWeek: g.week, params: { faction: f.id } });
        ctx.log.push(`${name}'s grievance over ${g.postLabel} has become something worse.`);
      }
      return undefined;
    }
  }
  return undefined;
}

/** Stage 3: he says it to your face. */
export function buildOpenDisagreement(s: GameState, g: Grievance, c: Character): EventInstance {
  const label = `Passed over: ${c.firstName}`;
  const op = (resolve: 'amends' | 'post' | 'rebuke' | 'exile' | 'explain' | 'share') => ({ type: 'power', op: { op: 'grievance', id: g.id, resolve }, label }) as const;
  const winner = g.winnerId ? s.characters[g.winnerId] : undefined;
  const cost = 1000 + Math.round(g.severity * 40);
  return {
    iid: `ev${s.nextId++}`, defId: 'power_grievance', week: s.week, mandatory: false, priority: 64,
    title: `${c.firstName} says it to your face`,
    text: `${displayName(c)}, in front of ${g.public ? 'half the club' : 'the consigliere'}: "${winner ? `${winner.firstName} got ${g.postLabel}` : `Somebody else got ${g.postLabel}`}. I have been here longer and I have done more. I want to know why." (${STAGE_NAMES[g.stage]}.)`,
    defaultChoiceId: 'explain', meta: { who: c.id, grievance: g.id, crew: 1 }, actors: [c.id],
    choices: [
      { id: 'amends', label: `Make it right (${'$' + cost.toLocaleString('en-US')})`, detail: 'An envelope and an apology. The grievance is settled.', because: `made amends to ${c.firstName}`, effects: [{ type: 'money', amount: -cost, label }, op('amends')] },
      { id: 'share', label: 'Give him a piece of something', detail: 'A bigger end of his district: he keeps 5% more.', because: `gave ${c.firstName} a bigger end`, effects: [op('share')] },
      { id: 'explain', label: 'Explain it, man to man', detail: 'Works on the patient and the loyal. The proud hear an excuse.', because: `explained to ${c.firstName} why he was passed over`, effects: [op('explain')] },
      { id: 'rebuke', label: '"You forget who you are talking to."', detail: 'Fear, now. A deeper grudge, later.', because: `put ${c.firstName} in his place`, effects: [op('rebuke'), { type: 'respect', amount: 1, label }] },
      { id: 'exile', label: 'Send him out of the family', detail: 'Before he becomes a problem.', because: `threw ${c.firstName} out of the family`, effects: [op('exile')] },
    ],
  };
}

export function grievancesOf(s: GameState, charId: string) {
  return (s.power?.grievances ?? []).filter((g) => g.charId === charId);
}

export function openGrievances(s: GameState): Grievance[] {
  return (s.power?.grievances ?? []).filter((g) => g.status === 'open');
}
