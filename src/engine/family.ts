import { pocketPrice } from './pocket';
import { ACTIVITIES, activityBlock, activityCost, finishActivity, honoreeOptions, startActivity, suggestGuests, ACTIVITY_KINDS } from './activities';
import { ageOn } from './calendar';
import { ALL_TRAITS, capos, crew, displayName, hasTrait, isFree, player, relationLabel } from './characters';
import { decisionBlock, decisionView, decisionViews, cityHallCandidate, districtsHeld } from './decisions';
import { chooseHeir, succeed } from './dynasty';
import { fmtMoney } from './effects';
import { activeAlliances, addAlliance, alliedWithFaction, breakAlliance, initHouses, refreshHouses } from './familyHouses';
import { gainRenown, hasPerk, LEGACIES, LEGACY_TRACKS, nextPerkCost } from './familyLegacy';
import { marriageAcceptance, marriageBlock, marriageEffects, matchCandidates, ourMarriageable, performMarriage } from './familyMarriage';
import { ensureDynState, fam, famMut, houseById, houseOf, type DynAction, type DynOp } from './familyState';
import { actionStress, addStress, buildBreakingPoint, choiceStress, COPING_INFO, stressLevel } from './familyStress';
import { autoChildhoodTrait, CONGENITALS, EDUCATION, finishEducation, goalFor, GOAL_INFO, PATH_INFO, processNewborn, seedCongenital, seedGoal, applyCongenital } from './familyTraits';
import { buildChildhood, buildClaim, buildComingOfAge } from './familyDrama';
import type { ActionPreview } from './actions';
import { heat, money, respect, type Ctx } from './ledger';
import { addOpinion, changeMeter, ensureRelation, opinion } from './relations';
import { addSecret } from './secrets';
import { pick, rand } from './rng';
import { changeScore, startWar } from './war';
import type { Character, Effect, EventInstance, GameState, PlayerAction, PlayerChoices, Trait } from './types';

/**
 * The dynasty layer's hub: start-of-game setup, the weekly and monthly
 * ticks, the dynasty orders (marriages, education, hosting, decisions,
 * legacies) and the effect ops used by family events.
 */

/* ---------------------------------------------------------------- */
/* Setup                                                              */
/* ---------------------------------------------------------------- */

/** Called once by newGame (and lazily for old saves). Uses the dynasty's own dice. */
export function initDynasty(s: GameState): void {
  const d = ensureDynState(s);
  if (d.houses.length) return;
  const boss = player(s);
  const heir = chooseHeir(s, boss).heir;
  for (const c of Object.values(s.characters)) {
    if (!c.dynasty) continue;
    seedCongenital(s, c);
    const p = famMut(s, c.id);
    applyCongenital(c, p.congenital);
    p.goal = seedGoal(s, c, c.id === heir?.id);
    if (c.alive && ageOn(c.birth, s.date) >= 16) p.cameOfAge = true;
    if (c.spouseId) p.marriedWeek = -100;
    p.wed = true;
    p.christened = true;
    p.childhood = ageOn(c.birth, s.date) >= 11 ? 2 : ageOn(c.birth, s.date) >= 7 ? 1 : 0;
  }
  initHouses(s);
  d.lastHeadId = s.playerId;
  d.madeCount = madeMen(s);
  d.cooldowns.deathScan = s.week;
}

/**
 * A start (Rise to Power, House of Sees) reshapes the family after
 * `initDynasty` ran: people are removed, re-aged or created. Bring the
 * dynasty layer back in line: drop records of people who no longer exist,
 * seed new members, re-derive ages-based flags and the heir's goal.
 */
export function refreshDynastyAfterStart(s: GameState): void {
  const d = ensureDynState(s);
  for (const id of Object.keys(d.people)) if (!s.characters[id]) delete d.people[id];
  d.alliances = d.alliances.filter((a) => (!a.ourId || s.characters[a.ourId]) && (!a.theirId || s.characters[a.theirId]));
  const boss = player(s);
  const heir = chooseHeir(s, boss).heir;
  for (const c of Object.values(s.characters)) {
    if (!c.dynasty || !c.alive) continue;
    const fresh = !d.people[c.id];
    const p = famMut(s, c.id);
    if (fresh) {
      seedCongenital(s, c);
      applyCongenital(c, p.congenital);
      p.wed = true;
      p.christened = true;
      if (c.spouseId) p.marriedWeek = -100;
    }
    const age = ageOn(c.birth, s.date);
    p.cameOfAge = age >= 16;
    p.childhood = age >= 11 ? 2 : age >= 7 ? 1 : 0;
    if (fresh || c.id === heir?.id || c.id === boss.id) p.goal = seedGoal(s, c, c.id === heir?.id);
  }
  d.lastHeadId = s.playerId;
  d.madeCount = madeMen(s);
}

function madeMen(s: GameState): number {
  return crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere').length;
}

/* ---------------------------------------------------------------- */
/* Effect ops                                                         */
/* ---------------------------------------------------------------- */

const OPPOSED: [Trait, Trait][] = [
  ['Greedy', 'Honest'], ['Hot-headed', 'Patient'], ['Cruel', 'Pious'], ['Cowardly', 'Hot-headed'], ['Loyal-to-a-fault', 'Ambitious'], ['Pious', 'Womanizer'], ['Cowardly', 'Vengeful'],
];

export function addTrait(c: Character, t: Trait): boolean {
  if (hasTrait(c, t) || !ALL_TRAITS.includes(t)) return false;
  if (OPPOSED.some(([a, b]) => (a === t && hasTrait(c, b)) || (b === t && hasTrait(c, a)))) return false;
  c.traits.push(t);
  return true;
}

function setPath(ctx: Ctx, c: Character, path: NonNullable<ReturnType<typeof fam>['path']>): void {
  const s = ctx.s;
  const p = famMut(s, c.id);
  p.path = path;
  const heir = chooseHeir(s, player(s)).heir;
  p.goal = goalFor(s, c, path, heir?.id === c.id);
  c.ambition = PATH_INFO[path].ambition;
  if (path === 'life' && c.rank === 'civilian' && c.id !== s.playerId) {
    c.faction = 'player';
    c.rank = 'associate';
    ctx.log.push(`${displayName(c)} is with the crew now.`);
  }
}

/** Apply a dynasty-layer effect op (called from effects.ts). */
export function applyDynOp(ctx: Ctx, op: DynOp, label: string): void {
  const s = ctx.s;
  const d = ensureDynState(s);
  const boss = player(s);
  switch (op.op) {
    case 'stress':
      addStress(s, op.charId, op.amount, op.source);
      break;
    case 'renown':
      gainRenown(s, op.amount, op.reason);
      break;
    case 'trait': {
      const c = s.characters[op.charId];
      if (!c?.alive) break;
      if (op.remove) c.traits = c.traits.filter((t) => t !== op.trait);
      else addTrait(c, op.trait);
      break;
    }
    case 'coping': {
      const c = s.characters[op.charId];
      if (!c?.alive) break;
      const p = famMut(s, c.id);
      if (!p.coping.includes(op.coping)) p.coping.push(op.coping);
      const t = COPING_INFO[op.coping].trait;
      if (t) addTrait(c, t);
      ctx.log.push(`${displayName(c)} copes the only way he knows: ${COPING_INFO[op.coping].name.toLowerCase()}.`);
      break;
    }
    case 'path':
    case 'comeOfAge': {
      const c = s.characters[op.charId];
      if (c?.alive) setPath(ctx, c, op.path);
      break;
    }
    case 'goal': {
      const c = s.characters[op.charId];
      if (!c?.alive) break;
      famMut(s, c.id).goal = op.goal;
      c.ambition = GOAL_INFO[op.goal];
      break;
    }
    case 'marry': {
      const m = s.characters[op.memberId];
      const sp = s.characters[op.spouseId];
      const house = sp ? houseOf(s, sp.id) : undefined;
      if (performMarriage(s, op.memberId, op.spouseId, !!op.matrilineal, ctx.log)) {
        seedCongenital(s, sp);
        gainRenown(s, 20 + (house ? house.strength / 2 : 0), `${m.firstName} married into ${house?.name ?? 'a good family'}`);
      }
      break;
    }
    case 'alliance':
      if (houseById(s, op.houseId)) {
        addAlliance(s, { houseId: op.houseId, since: s.week, until: s.week + op.weeks });
        ctx.log.push(`A pact with ${houseById(s, op.houseId)!.name} until week ${s.week + op.weeks}.`);
      }
      break;
    case 'breakAlliance':
      breakAlliance(s, op.houseId);
      break;
    case 'legitimize': {
      const c = s.characters[op.charId];
      if (!c?.alive) break;
      const p = famMut(s, c.id);
      const father = s.characters[p.bastardOf ?? ''] ?? boss;
      c.dynasty = true;
      c.faction = 'player';
      c.lastName = father.lastName;
      c.fatherId = father.id;
      if (!father.childrenIds.includes(c.id)) father.childrenIds.push(c.id);
      p.legitimized = true;
      p.claimant = false;
      p.cameOfAge = ageOn(c.birth, s.date) >= 16;
      addOpinion(s, c.id, father.id, 'Gave me his name', 30, 0);
      const text = `${displayName(c)} was recognized as the son of ${displayName(father)}.`;
      s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
      ctx.log.push(text);
      break;
    }
    case 'claimant': {
      const c = s.characters[op.charId];
      if (c) famMut(s, c.id).claimant = op.on;
      break;
    }
    case 'appoint': {
      const c = s.characters[op.charId];
      if (!c?.alive || !c.dynasty) break;
      s.successionLaw = 'appointed';
      s.designatedHeirId = c.id;
      ctx.log.push(`${displayName(c)} is named heir to the house.`);
      break;
    }
    case 'evidence': {
      const c = s.characters[op.charId];
      if (c) c.evidence = Math.max(0, Math.min(100, (c.evidence ?? 0) + op.amount));
      break;
    }
    case 'away': {
      const c = s.characters[op.charId];
      if (c?.alive) c.busyUntil = s.week + op.weeks;
      break;
    }
    case 'secret': {
      const c = s.characters[op.charId];
      if (c?.alive) addSecret(s, c, op.kind, ['player']);
      break;
    }
    case 'attr': {
      const c = s.characters[op.charId];
      if (c) c.attributes[op.attr] = Math.max(0, Math.min(100, c.attributes[op.attr] + op.amount));
      break;
    }
    case 'abdicate': {
      const old = boss;
      const heir = chooseHeir(s, old).heir;
      if (!heir) break;
      succeed(ctx, old);
      if (s.playerId === old.id) break;
      old.rank = 'civilian';
      old.wealth = 0;
      famMut(s, old.id).retired = s.week;
      for (const d2 of s.districts) if (d2.capoId === old.id) d2.capoId = undefined;
      addOpinion(s, s.playerId, old.id, 'Handed me the chair', 20, 1);
      const text = `${displayName(old)} retired to Florida and handed the chair to ${displayName(s.characters[s.playerId])}.`;
      s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
      s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'succession' });
      ctx.log.push(text);
      d.decisions.florida = s.week;
      break;
    }
    case 'decision':
      takeDecision(ctx, op.id, op.option);
      break;
  }
  void label;
}

function takeDecision(ctx: Ctx, id: NonNullable<Extract<DynOp, { op: 'decision' }>['id']>, option?: string): void {
  const s = ctx.s;
  const d = ensureDynState(s);
  d.decisions[id] = s.week;
  d.stats.decisions++;
  const name = decisionViews(s).find((v) => v.id === id)?.name ?? id;
  switch (id) {
    case 'shore_boss':
      if (!d.titles.includes('Boss of the Shore')) d.titles.push('Boss of the Shore');
      break;
    case 'city_hall': {
      const c = cityHallCandidate(s);
      if (c) {
        c.office = 'City commissioner';
        famMut(s, c.id).path = 'politics';
        c.ambition = 'Win re-election';
        ctx.log.push(`${displayName(c)} takes a seat on the Wildwood city commission.`);
      }
      if (!d.titles.includes('A seat at City Hall')) d.titles.push('A seat at City Hall');
      break;
    }
    case 'legit':
      if (!d.titles.includes('Legitimate')) d.titles.push('Legitimate');
      break;
    case 'monument':
      d.titles.push(option === 'hospital' ? 'The hospital wing' : 'The church wing');
      break;
    case 'break_philly': {
      s.flags.brokeFromPhilly = 1;
      const r = s.rivals.find((x) => x.id === 'philly');
      const moretti = d.houses.find((h) => h.leads && h.faction === 'philly');
      if (moretti) breakAlliance(s, moretti.id);
      if (r) {
        r.feud = true;
        addOpinion(s, r.leaderId, s.playerId, 'Broke from Philadelphia', -50, 0);
        if (!s.wars.some((w) => w.rival === 'philly')) startWar(ctx, 'philly', s.districts.find((x) => (x.influence.player ?? 0) >= 50)?.id ?? 'downtown', 'feud', false);
      }
      break;
    }
    default:
      break;
  }
  const text = `The house of ${s.houseName}: ${name}${option ? ` (${option === 'hospital' ? 'a hospital wing' : 'a church wing'})` : ''}.`;
  s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'family' });
}

/** Chip text for a dynasty op. */
export function describeDynOp(s: GameState, op: DynOp): string | undefined {
  const nm = (id: string) => { const c = s.characters[id]; return c ? `${c.firstName} ${c.lastName}` : '?'; };
  switch (op.op) {
    case 'stress': return `${op.charId === s.playerId ? 'Your' : nm(op.charId) + '\'s'} stress ${op.amount > 0 ? '+' : '−'}${Math.abs(op.amount)}`;
    case 'renown': return `${op.amount > 0 ? '+' : '−'}${Math.abs(op.amount)} renown`;
    case 'trait': return `${nm(op.charId)} ${op.remove ? 'loses' : 'becomes'} ${op.trait}`;
    case 'coping': return `Coping habit: ${COPING_INFO[op.coping].name}`;
    case 'path': case 'comeOfAge': return `${nm(op.charId)}: ${PATH_INFO[op.path].name}`;
    case 'goal': return `${nm(op.charId)} wants to ${GOAL_INFO[op.goal].toLowerCase()}`;
    case 'marry': return `${nm(op.memberId)} marries ${nm(op.spouseId)}`;
    case 'alliance': return `Pact with ${houseById(s, op.houseId)?.name ?? '?'} (${op.weeks} weeks)`;
    case 'breakAlliance': return `Alliance with ${houseById(s, op.houseId)?.name ?? '?'} ends`;
    case 'legitimize': return `${nm(op.charId)} joins the house and the line of succession`;
    case 'claimant': return op.on ? `${nm(op.charId)} may claim the chair` : `${nm(op.charId)} gives up his claim`;
    case 'abdicate': return 'Abdicate to your heir';
    case 'decision': return undefined;
    case 'attr': return `${nm(op.charId)} ${op.attr} ${op.amount > 0 ? '+' : '−'}${Math.abs(op.amount)}`;
    case 'appoint': return `${nm(op.charId)} named heir`;
    case 'evidence': return `Law's file on ${nm(op.charId)} ${op.amount > 0 ? '+' : '−'}${Math.abs(op.amount)}`;
    case 'away': return `${nm(op.charId)} away for ${op.weeks} weeks`;
    case 'secret': return op.kind === 'affair' ? 'A secret: the other woman' : 'A secret: a child';
  }
}

/* ---------------------------------------------------------------- */
/* Orders                                                             */
/* ---------------------------------------------------------------- */

function noop(title: string, why: string): ActionPreview {
  return { title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' };
}

export function previewDynasty(s: GameState, a: DynAction): ActionPreview {
  const d = s.dyn;
  switch (a.type) {
    case 'marry': {
      const m = s.characters[a.memberId];
      const sp = s.characters[a.spouseId];
      if (!m || !sp) return noop('Marriage', 'No such person');
      const h = houseOf(s, sp.id);
      const head = h ? s.characters[h.headId] : undefined;
      const title = `Propose: ${m.firstName} to marry ${sp.firstName} ${sp.lastName}${a.matrilineal ? ' (matrilineal)' : ''}`;
      const effects = marriageEffects(s, m, sp, !!a.matrilineal);
      const dowry = effects.find((e): e is Extract<Effect, { type: 'money' }> => e.type === 'money')?.amount ?? 0;
      return {
        title, detail: `${h ? `${h.name}: ${h.blurb}` : ''} A marriage makes an alliance: they won't move against you, they join your wars, and they vote with you at the Table.`,
        effects, cost: dowry < 0 ? -dowry : 0, because: `married ${m.firstName} into ${h?.name ?? 'another family'}`,
        acceptance: marriageAcceptance(s, m, sp, !!a.matrilineal),
        refuseEffects: head?.alive ? [{ type: 'opinion', from: head.id, to: s.playerId, amount: -5, reason: 'Proposed an insulting match', decay: 1 }] : [],
        disabledReason: marriageBlock(s, m, sp) ?? (dowry < 0 && s.money < -dowry ? `Needs ${fmtMoney(-dowry)} for the dowry` : undefined),
        category: 'event',
      };
    }
    case 'guardian': {
      const c = s.characters[a.childId];
      const info = EDUCATION[a.kind];
      if (!c) return noop('Education', 'No such child');
      const g = a.guardianId ? s.characters[a.guardianId] : undefined;
      const title = `Education: ${c.firstName} — ${info.name}${g ? ` (${g.firstName} ${g.lastName})` : ''}`;
      const age = ageOn(c.birth, s.date);
      let why: string | undefined;
      if (!c.alive || !c.dynasty) why = 'Not a child of the house';
      else if (age >= 16) why = 'Already grown';
      else if (age < info.minAge) why = `Too young (from ${info.minAge})`;
      else if (fam(s, c.id).guardian?.kind === a.kind && fam(s, c.id).guardian?.guardianId === a.guardianId) why = 'Already so';
      else if (a.kind === 'capo' && (!g?.alive || g.rank !== 'capo' || g.faction !== 'player')) why = 'Choose one of your capos';
      else if (info.cost) why = pocketPrice(s, info.cost, title).why;
      return {
        title, detail: info.text, effects: info.cost ? pocketPrice(s, info.cost, title).effects : [], cost: info.cost, pot: 'pocket',
        because: `sent ${c.firstName} to ${info.guardian.toLowerCase()}`, disabledReason: why, category: 'event',
      };
    }
    case 'host': {
      const def = ACTIVITIES[a.activity];
      const cost = activityCost(a.activity, a.guests.length);
      const hon = a.honoreeId ? s.characters[a.honoreeId] : honoreeOptions(s, a.activity)[0];
      const title = `Host ${def.name.toLowerCase()}${hon && (a.activity === 'wedding' || a.activity === 'christening' || a.activity === 'funeral') ? ` for ${hon.firstName}` : ''}`;
      const why = activityBlock(s, a.activity, a.guests, a.honoreeId) ?? pocketPrice(s, cost, title).why;
      return {
        title, detail: `${def.text} ${def.weeks} week${def.weeks > 1 ? 's' : ''} at ${def.place}; ${a.guests.length} guest${a.guests.length === 1 ? '' : 's'}. When it ends: −${def.relief} stress, +${def.renown} renown, guests +${def.opinion} opinion.`,
        // Relief and renown come when it ends (activities.ts), so only the bill is an effect here.
        effects: pocketPrice(s, cost, title).effects,
        cost, pot: 'pocket', because: `hosted ${def.name.toLowerCase()}`, disabledReason: why, category: 'event',
      };
    }
    case 'decision': {
      const v = decisionView(s, a.id);
      if (!v) return noop('Decision', 'Unknown decision');
      const cost = v.effects.filter((e): e is Extract<Effect, { type: 'money' }> => e.type === 'money' && e.amount < 0).reduce((x, e) => x - e.amount, 0);
      const opt = v.options?.find((o) => o.id === a.option);
      const effects = v.effects.map((e) => (e.type === 'dyn' && e.op.op === 'decision' ? { ...e, op: { ...e.op, option: a.option } } : e));
      return {
        title: `Decision: ${v.name}${opt ? ` — ${opt.label}` : ''}`, detail: v.text, effects, cost, because: `took the decision: ${v.name.toLowerCase()}`,
        disabledReason: v.link ? 'Use its own order' : decisionBlock(s, v) ?? (v.options && !opt ? 'Choose an option' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined),
        warning: v.risky, category: 'event',
      };
    }
    case 'legacy': {
      const info = LEGACIES[a.track];
      const have = d?.legacy[a.track] ?? 0;
      const cost = nextPerkCost(s, a.track);
      const perk = info.perks[have];
      if (!perk || cost === undefined) return noop(`Legacy: ${info.name}`, 'Every perk of this legacy is unlocked');
      const effects: Effect[] = a.track === 'name' && have === 3 ? [{ type: 'respect', amount: 5 }] : [];
      return {
        title: `Legacy: ${perk.name}`, detail: `${info.name} legacy, perk ${have + 1} of 4 — ${perk.text} Costs ${cost} renown.`, effects, cost: 0,
        because: `took up the ${info.name} legacy: ${perk.name}`,
        disabledReason: (d?.renown ?? 0) < cost ? `Needs ${cost} renown (you have ${Math.round(d?.renown ?? 0)})` : undefined, category: 'event',
      };
    }
  }
}

export function commitDynasty(ctx: Ctx, a: DynAction): void {
  const s = ctx.s;
  const d = ensureDynState(s);
  switch (a.type) {
    case 'guardian': {
      const p = famMut(s, a.childId);
      p.guardian = { kind: a.kind, guardianId: a.guardianId, since: s.week };
      if (a.guardianId) addOpinion(s, a.guardianId, s.playerId, 'Trusted me with his child', 10, 1);
      break;
    }
    case 'host':
      startActivity(ctx, a.activity, a.guests, a.honoreeId);
      break;
    case 'legacy': {
      const cost = nextPerkCost(s, a.track);
      if (cost === undefined || d.renown < cost) break;
      d.renown -= cost;
      d.legacy[a.track]++;
      d.stats.legacies++;
      const perk = LEGACIES[a.track].perks[d.legacy[a.track] - 1];
      const text = `The house of ${s.houseName} took up the ${LEGACIES[a.track].name} legacy: ${perk.name}.`;
      s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
      ctx.log.push(text);
      break;
    }
    default:
      break;
  }
}

/** Dynasty orders the sim's random player may give (some disabled). */
export function dynastyActions(s: GameState): PlayerAction[] {
  if (!s.dyn) return [];
  const all = dynastyActionsAll(s);
  // Suggestions for the random player: only what the house can comfortably afford.
  return all.filter((a) => { const c = previewDynasty(s, (a as Extract<PlayerAction, { kind: 'dynasty' }>).op).cost; return c === 0 || s.money >= c * 3; });
}

function dynastyActionsAll(s: GameState): PlayerAction[] {
  const out: PlayerAction[] = [];
  const op = (o: DynAction): PlayerAction => ({ kind: 'dynasty', op: o });
  for (const m of ourMarriageable(s).slice(0, 2)) {
    const cands = matchCandidates(s, m);
    if (cands.length) {
      const best = cands.map((x) => ({ x, p: marriageAcceptance(s, m, x.c).chance })).sort((a, b) => b.p - a.p)[0];
      out.push(op({ type: 'marry', memberId: m.id, spouseId: best.x.c.id }));
    }
  }
  const kids = Object.values(s.characters).filter((c) => c.alive && c.dynasty && ageOn(c.birth, s.date) >= 6 && ageOn(c.birth, s.date) < 16 && !fam(s, c.id).guardian);
  for (const k of kids.slice(0, 1)) {
    const kinds = (Object.keys(EDUCATION) as (keyof typeof EDUCATION)[]).filter((x) => x !== 'capo' && x !== 'home');
    const kind = kinds[s.week % kinds.length];
    out.push(op({ type: 'guardian', childId: k.id, kind }));
    const capo = capos(s)[0];
    if (capo) out.push(op({ type: 'guardian', childId: k.id, kind: 'capo', guardianId: capo.id }));
  }
  // A couple of suggestions a week (rotating), to keep the random player's menu cheap.
  for (const kind of [ACTIVITY_KINDS[s.week % ACTIVITY_KINDS.length], ACTIVITY_KINDS[(s.week + 3) % ACTIVITY_KINDS.length]]) {
    const hon = honoreeOptions(s, kind)[0];
    out.push(op({ type: 'host', activity: kind, guests: suggestGuests(s, kind), honoreeId: hon?.id }));
  }
  const views = decisionViews(s).filter((v) => !v.link && v.id !== 'break_philly' && !v.done);
  if (views.length) {
    const v = views[s.week % views.length];
    out.push(op({ type: 'decision', id: v.id, option: v.options?.[0]?.id }));
  }
  for (const t of LEGACY_TRACKS) out.push(op({ type: 'legacy', track: t }));
  return out;
}

/* ---------------------------------------------------------------- */
/* Stress from the boss's own choices                                 */
/* ---------------------------------------------------------------- */

export function dynastyChoices(ctx: Ctx, resolved: EventInstance[], choices: PlayerChoices): void {
  const s = ctx.s;
  if (!s.dyn) return;
  const boss = player(s);
  for (const ev of resolved) {
    if (ev.defId.startsWith('dyn_breaking')) continue;
    const wanted = choices.choices?.[ev.iid];
    const ch = ev.choices.find((c) => c.id === wanted && !c.disabledReason) ?? ev.choices.find((c) => c.id === ev.defaultChoiceId) ?? ev.choices[0];
    if (!ch) continue;
    const st = choiceStress(s, boss, ch);
    if (st) {
      addStress(s, boss.id, st[0], st[1]);
      if (st[0] >= 8) ctx.log.push(`It weighs on ${boss.firstName}: he ${st[2]}.`);
    }
  }
  for (const a of choices.actions ?? []) {
    const st = actionStress(s, boss, a);
    if (st) addStress(s, boss.id, st[0], st[1]);
  }
}

/* ---------------------------------------------------------------- */
/* Weekly tick                                                        */
/* ---------------------------------------------------------------- */

function checkBreakingPoints(s: GameState): void {
  const ids = [s.playerId, chooseHeir(s, player(s)).heir?.id].filter((x): x is string => !!x);
  for (const id of ids) {
    const c = s.characters[id];
    if (!c?.alive) continue;
    const p = famMut(s, id);
    const lvl = stressLevel(p.stress);
    if (lvl < p.stressLevel) p.stressLevel = lvl;
    if (lvl > p.stressLevel && !s.eventQueue.some((e) => e.defId === 'dyn_breaking' && e.meta?.subject === id) && !s.pendingEvents.some((e) => e.defId === 'dyn_breaking' && e.meta?.subject === id)) {
      p.stressLevel = lvl;
      s.eventQueue.push(buildBreakingPoint(s, c, lvl));
      ensureDynState(s).stats.breakingPoints++;
    }
  }
}

function griefFor(s: GameState, dead: Character): void {
  for (const o of Object.values(s.characters)) {
    if (!o.alive || !(o.dynasty || o.id === s.playerId)) continue;
    const close = o.spouseId === dead.id || o.childrenIds.includes(dead.id);
    const near = o.fatherId === dead.id || o.motherId === dead.id || (dead.fatherId && o.fatherId === dead.fatherId);
    if (close) addStress(s, o.id, 25, 'domestic');
    else if (near) addStress(s, o.id, 12, 'domestic');
    else if (o.id === s.playerId && dead.faction === 'player' && (dead.rank === 'capo' || dead.rank === 'underboss')) addStress(s, o.id, 5, 'paranoia');
    // Revenge goals for the grown children of a murdered man.
    if ((close || near) && dead.death?.killer && dead.death.killer !== 'none' && dead.death.killer !== 'player' && ageOn(o.birth, s.date) >= 16 && o.id !== s.playerId) {
      famMut(s, o.id).goal = 'revenge';
      o.ambition = GOAL_INFO.revenge;
    }
  }
}

function onSuccession(ctx: Ctx, prevId: string): void {
  const s = ctx.s;
  const d = ensureDynState(s);
  const heir = player(s);
  const prev = s.characters[prevId];
  d.stats.successions++;
  const blood = prev && (prev.childrenIds.includes(heir.id) || (prev.fatherId && heir.fatherId === prev.fatherId) || heir.fatherId && prev.childrenIds.includes(heir.fatherId));
  if (blood) gainRenown(s, 30, `${heir.firstName} carried the name on`);
  if (hasPerk(s, 'blood', 4)) {
    heir.attributes.leadership = Math.min(100, heir.attributes.leadership + 10);
    for (const m of crew(s)) addOpinion(s, m.id, heir.id, 'Of the old blood (legacy)', 10, 0);
  }
  if (hasPerk(s, 'name', 2)) respect(ctx, 4, 'Smooth Handover (legacy)', 'event');
  if (hasPerk(s, 'name', 3)) for (const m of crew(s)) changeMeter(s, m.id, heir.id, 'fear', 15);
  const hp = famMut(s, heir.id);
  hp.goal = 'protect_family';
  heir.ambition = GOAL_INFO.protect_family;
  // Brothers who wanted the chair.
  let claimQueued = false;
  for (const sib of Object.values(s.characters)) {
    if (!sib.alive || sib.id === heir.id || !sib.dynasty || ageOn(sib.birth, s.date) < 18) continue;
    const sp = fam(s, sib.id);
    const passed = sp.goal === 'the_chair' && (sib.fatherId === heir.fatherId || (prev && prev.childrenIds.includes(sib.id)));
    if (passed) {
      addOpinion(s, sib.id, heir.id, 'Passed over for the chair', -15, 1);
      if (!claimQueued && (hasTrait(sib, 'Ambitious') || opinion(s, sib.id, heir.id) < -10)) {
        famMut(s, sib.id).claimant = true;
        s.eventQueue.push(buildClaim(s, sib));
        claimQueued = true;
      }
    }
  }
  // A bastard who never gave up his claim.
  if (!claimQueued) {
    const bastard = Object.values(s.characters).find((c) => c.alive && fam(s, c.id).claimant && ageOn(c.birth, s.date) >= 16 && c.id !== heir.id);
    if (bastard) s.eventQueue.push(buildClaim(s, bastard));
  }
  // The new head inherits the house's stress? No — but he starts with the weight of the chair.
  addStress(s, heir.id, 10, 'paranoia');
}

/** Engine hook: after the week's systems have run (before the calendar moves). */
export function dynastyWeek(ctx: Ctx): void {
  const s = ctx.s;
  const d = ensureDynState(s);
  if (!d.houses.length) initDynasty(s);
  const boss = player(s);

  // Succession happened this week (death or abdication)?
  if (d.lastHeadId !== s.playerId) {
    const prev = d.lastHeadId;
    d.lastHeadId = s.playerId;
    onSuccession(ctx, prev);
  }

  // Deaths since the last scan: grief.
  const scan = d.cooldowns.deathScan ?? 0;
  for (const c of Object.values(s.characters)) if (!c.alive && c.death && c.death.week >= scan && (c.dynasty || c.faction === 'player')) griefFor(s, c);
  d.cooldowns.deathScan = s.week + 1;

  // An activity ends.
  for (const ev of finishActivity(ctx)) s.eventQueue.push(ev);
  if (d.activity && !s.characters[d.activity.hostId]?.alive) d.activity = undefined;

  // Renown from deeds.
  for (const dsp of s.disputes) if (dsp.ruling?.forPlayer && dsp.ruling.week === s.week) gainRenown(s, 25, 'Won at the Table');
  const big = ctx.lines.filter((l) => l.stat === 'money' && l.amount >= 8000 && (l.category === 'event' || l.category === 'consequence') && !/dowry|loan|sold|sale|partner/i.test(l.label));
  if (big.length) gainRenown(s, 15, `A big score: ${big[0].label}`);
  const made = madeMen(s);
  if (made > d.madeCount) gainRenown(s, 8 * Math.min(3, made - d.madeCount), 'Made men for the family');
  d.madeCount = made;

  // Alliances in war: in-laws send men; going to war with an ally breaks faith.
  for (const w of s.wars) {
    if (alliedWithFaction(s, w.rival)) {
      for (const a of activeAlliances(s)) {
        const h = houseById(s, a.houseId);
        if (h?.faction === w.rival) breakAlliance(s, h.id);
      }
      respect(ctx, -5, 'Broke faith with your in-laws', 'event');
      gainRenown(s, -50, 'Broke faith with an allied house');
      continue;
    }
    const helpers = activeAlliances(s).map((a) => houseById(s, a.houseId)).filter((h) => h?.leads && h.faction && h.faction !== w.rival && s.rivals.some((r) => r.id === h.faction));
    if (helpers.length) {
      changeScore(s, w.id, 2 * helpers.length);
      if (s.week % 4 === 0) ctx.log.push(`Your in-laws send men to the war (${helpers.map((h) => h!.name).join(', ')}).`);
    }
  }

  // Breaking from Philadelphia: did the war end?
  if (s.flags.brokeFromPhilly) {
    const w = s.wars.find((x) => x.rival === 'philly');
    if (w) d.cooldowns.phillyScore = w.score;
    else if (!d.titles.includes('Independent')) {
      if ((d.cooldowns.phillyScore ?? 0) >= 0) {
        d.titles.push('Independent');
        gainRenown(s, 400, 'Broke from Philadelphia and lived');
        s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text: `The house of ${s.houseName} answers to no one. Philadelphia's envelope never came again.` });
      } else {
        s.flags.brokeFromPhilly = 0;
        heat(ctx, 'family', 10, 'Back under Philadelphia (lost the war)', 'event');
        ctx.log.push('Philadelphia\'s bagman is back, and the envelope is bigger.');
      }
    }
  }

  // Pressure on the boss.
  if (s.heat.federal >= 65 && s.week % 2 === 0) addStress(s, boss.id, 1, 'irs');
  if (s.money < 0 && s.week % 2 === 1) addStress(s, boss.id, 1, 'irs');
  if (s.wars.length && s.week % 2 === 0) addStress(s, boss.id, 1, 'paranoia');
  const plots = s.schemes.filter((x) => x.owner !== 'player' && x.discovered && x.targetId === boss.id).length;
  if (plots) addStress(s, boss.id, hasTrait(boss, 'Paranoid') ? 3 : 1, 'paranoia');

  // Legacy and family income.
  if (hasPerk(s, 'money', 3)) money(ctx, 150, 'Family trust (legacy)', 'business');

  checkBreakingPoints(s);
}

/* ---------------------------------------------------------------- */
/* Monthly tick                                                       */
/* ---------------------------------------------------------------- */

export function dynastyMonth(ctx: Ctx): void {
  const s = ctx.s;
  const d = ensureDynState(s);
  if (!d.houses.length) initDynasty(s);
  const boss = player(s);
  const living = Object.values(s.characters).filter((c) => c.alive);
  const blood = hasPerk(s, 'blood', 1);

  for (const c of living) {
    const a = ageOn(c.birth, s.date);
    // Newborns.
    if (a === 0 && !d.people[c.id] && (c.fatherId || c.motherId)) {
      processNewborn(s, c, blood ? 2 : 1, blood ? 0.5 : 1);
      if (c.dynasty) {
        d.stats.births++;
        gainRenown(s, 10, `${c.firstName} was born`);
      }
      continue;
    }
    if (!c.dynasty) continue;
    const p = famMut(s, c.id);
    // New marriages made outside the dynasty orders (love matches).
    if (c.spouseId && p.marriedWeek === undefined) {
      p.marriedWeek = s.week;
      p.wed = false;
      if (!c.maidenName || c.maidenName === s.houseName) {
        d.stats.marriages++;
        gainRenown(s, 10, `${c.firstName} married`);
        const sp = s.characters[c.spouseId];
        if (sp) {
          seedCongenital(s, sp);
          famMut(s, sp.id).marriedWeek = s.week;
          famMut(s, sp.id).goal = 'protect_family';
        }
      }
    }
    // Childhood temperament.
    if (a >= 7 && a < 16 && p.childhood < (a >= 11 ? 2 : 1)) {
      const close = c.fatherId === boss.id || c.motherId === boss.id || (c.fatherId && boss.childrenIds.includes(c.fatherId));
      if (close && rand(d) < 0.3) s.eventQueue.push(buildChildhood(s, c));
      else {
        autoChildhoodTrait(s, c);
        p.childhood++;
      }
    }
    // Coming of age.
    if (a >= 16 && !p.cameOfAge) {
      p.cameOfAge = true;
      finishEducation(s, c, hasPerk(s, 'blood', 3) ? 1 : 0);
      while (c.traits.length < 2) if (!autoChildhoodTrait(s, c)) break;
      d.stats.comingOfAge++;
      gainRenown(s, 20, `${c.firstName} came of age`);
      s.eventQueue.push(buildComingOfAge(s, c));
    }
    // Goals that pull at people.
    if (a >= 18) {
      const heir = chooseHeir(s, boss).heir;
      if (p.goal === 'the_chair' && heir && heir.id !== c.id && c.id !== boss.id && opinion(s, c.id, heir.id) > -30) addOpinion(s, c.id, heir.id, 'Wants what he has', -2, 1);
      if (p.goal === 'get_out' && c.faction === 'player' && c.rank !== 'civilian') addStress(s, c.id, 2, 'honor');
      if (p.goal === 'marry_well' && !c.spouseId && a >= 24 && opinion(s, c.id, boss.id) > -15) addOpinion(s, c.id, boss.id, 'Still no match for me', -1, 0);
      if (p.path === 'politics' && s.week % 26 < 5 && rand(d) < 0.2) s.favors += 1;
      if (p.path === 'fronts') s.unwashed = Math.max(0, s.unwashed - 1000);
      if (p.path === 'adviser' && c.id !== boss.id) addStress(s, boss.id, -2, 'paranoia');
    }
    // Stress: time heals a little; habits help more.
    if (p.stress > 0 || p.coping.length) {
      let relief = 4;
      for (const k of p.coping) if (k !== 'Insomniac') relief += 6;
      addStress(s, c.id, -relief, 'domestic');
      if (c.id === boss.id) {
        if (p.coping.includes('Gambler')) money(ctx, -300, 'A bad night at cards (coping)', 'cost');
        if (p.coping.includes('Temper')) { const m = crew(s); if (m.length) addOpinion(s, pick(d, m).id, boss.id, 'The boss\'s temper', -3, 1); }
      }
      if (p.coping.includes('Insomniac') || p.coping.includes('Drinker')) c.health = Math.max(0, c.health - 1);
    }
    if (hasPerk(s, 'blood', 2)) c.health = Math.min(100, c.health + 1);
    // Kids under a guardian bond with him.
    if (p.guardian?.guardianId && a < 16) {
      const g = s.characters[p.guardian.guardianId];
      if (g?.alive) addOpinion(s, c.id, g.id, 'Raised me', 1, 0);
    }
  }

  // Monthly renown from standing.
  gainRenown(s, Math.max(0, Math.round(s.respect / 25)) + districtsHeld(s) * 1, 'The standing of the house');

  // Legacy perks (monthly).
  if (hasPerk(s, 'name', 1) && s.respect < 70) respect(ctx, 1, 'A name on the boardwalk (legacy)', 'event');
  if (hasPerk(s, 'name', 3)) for (const m of crew(s)) { const r = ensureRelation(s, m.id, boss.id); r.grievance = Math.max(0, r.grievance - 3); }
  if (hasPerk(s, 'money', 1)) s.unwashed = Math.max(0, s.unwashed - 2000);
  if (hasPerk(s, 'money', 4)) heat(ctx, 'federal', -2, 'Old money: the family looks respectable (legacy)', 'heat');
  if (hasPerk(s, 'church', 1)) heat(ctx, 'local', -1, 'Parish friends (legacy)', 'heat');
  if (hasPerk(s, 'church', 2) && s.date.m % 3 === 0) s.favors += 1;
  if (d.decisions.city_hall !== undefined) {
    if (s.date.m % 2 === 0) s.favors += 1;
    heat(ctx, 'local', -1, 'A seat at City Hall', 'heat');
  }
  // Alliance dividends.
  for (const a of activeAlliances(s)) {
    const h = houseById(s, a.houseId);
    if (!h) continue;
    if (h.kind === 'political' && s.date.m % 3 === 0) s.favors += 1;
    if (h.kind === 'legit') s.unwashed = Math.max(0, s.unwashed - 1500);
    if (h.kind === 'philly' && h.leads) heat(ctx, 'family', -2, `Family by marriage: ${h.name}`, 'heat');
    const head = s.characters[h.headId];
    if (head?.alive && opinion(s, head.id, s.playerId) < 20) addOpinion(s, head.id, s.playerId, 'Allied houses', 2, 1);
  }
  refreshHouses(s);
  // Expired pacts drop off the list.
  d.alliances = d.alliances.filter((a) => activeAlliances(s).includes(a));
  checkBreakingPoints(s);
  if (!isFree(s, boss)) addStress(s, boss.id, 2, 'paranoia');
  void relationLabel;
  void CONGENITALS;
}

export { GOAL_INFO };
