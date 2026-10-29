import { ageOn } from './calendar';
import { capos, crew, displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { maybePlant } from './rivalcrew';
import { buildMaking } from './crewEvents';
import { shiftInfluence } from './effects';
import {
  addEvidence, addStory, assignTo, bumpStat, capoOf, giveBio, hasVice, heirFromRegime, inRegimeRank, regime, tidyRegimes, transferRegime,
} from './hierarchy';
import { heat, money, rivalMoneyHit, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { chance, pick, randInt, weightedPick } from './rng';
import { rivalCaps } from './rivals';
import type { Character, GameState, RivalId } from './types';
import { awayActMult, awayCapoBias } from './travel';
import { finOf, note } from './crewFinance';
import { capoLean, noteCapoMove } from './minds/planner';


/**
 * The regimes at work. Each week the capos act on their own according to
 * their personalities, evidence piles up (or is cleaned up), plants leak,
 * rivals' courtships ripen, debts grow, and Philadelphia's books open and
 * close.
 */

type CapoMove = 'expand' | 'skim' | 'heat' | 'beef' | 'earn' | 'recruit' | 'cops';

function capoMoveWeights(s: GameState, k: Character): Record<CapoMove, number> {
  const op = opinion(s, k.id, s.playerId);
  const size = regime(s, k.id).length;
  const w: Record<CapoMove, number> = { expand: 1, skim: 0, heat: 0.2, beef: 0.2, earn: 1.5, recruit: crew(s).length >= 18 ? 0 : size < 2 ? 4 : size < 4 ? 1.5 : 0, cops: 0.2 };
  if (hasTrait(k, 'Ambitious')) w.expand += 2.5;
  if (hasTrait(k, 'Hot-headed')) { w.beef += 2.5; w.expand += 0.6; }
  if (hasTrait(k, 'Cruel')) w.beef += 1;
  if (hasTrait(k, 'Vengeful')) w.beef += 0.6;
  if (hasTrait(k, 'Greedy') && op < 30) w.skim += 2.5;
  if (hasTrait(k, 'Loyal-to-a-fault')) w.heat += 2.5;
  if (hasTrait(k, 'Honest')) w.heat += 0.8;
  if (hasTrait(k, 'Charming')) w.cops += 1.5;
  if (hasTrait(k, 'Patient')) w.earn += 1;
  return w;
}

function rivalTurf(s: GameState, k: Character): { d: string; r: RivalId } | undefined {
  const home = s.districts.find((d) => d.capoId === k.id);
  const opts: { d: string; r: RivalId; w: number }[] = [];
  for (const d of s.districts) {
    if ((d.influence.player ?? 0) <= 0) continue;
    for (const r of s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive)) {
      const v = d.influence[r.id] ?? 0;
      if (v >= 4) opts.push({ d: d.id, r: r.id, w: v + (home?.id === d.id ? 30 : 0) });
    }
  }
  return weightedPick(s, opts, (o) => o.w);
}

/** One capo acting on his own initiative. Returns a line for the chronicle, if it is worth one. */
export function capoActs(ctx: Ctx, k: Character): string | undefined {
  const s = ctx.s;
  const w = capoMoveWeights(s, k);
  awayCapoBias(s, k, w);
  // His mind weighs the moves (minds/planner.ts): what he needs, wants and is working toward.
  const lean = capoLean(s, k, w);
  const moves = (Object.keys(w) as CapoMove[]).filter((m) => w[m] > 0);
  const m = weightedPick(s, moves, (x) => w[x]);
  if (m) noteCapoMove(s, k, m, lean);
  const nm = displayName(k);
  switch (m) {
    case 'expand': {
      const t = rivalTurf(s, k);
      if (!t) return undefined;
      const r = s.rivals.find((x) => x.id === t.r)!;
      const d = s.districts.find((x) => x.id === t.d)!;
      const got = shiftInfluence(s, d.id, 'player', randInt(s, 2, 3));
      if (got <= 0) return undefined;
      // shiftInfluence takes from the rival proportionally; the capo pays his own men.
      const paid = Math.min(400, Math.max(0, k.wealth));
      k.wealth -= paid;
      { const f = finOf(s, k.id); if (f && paid > 0) note(f, s.week, `paid his crew to push into ${d.name}`, -paid, 1); }
      addOpinion(s, r.leaderId, s.playerId, `Your capo ${k.firstName} pushed into ${d.name}`, -3, 1);
      const text = `${nm} pushed his crew onto ${r.shortName}'s corners in ${d.name} on his own (+${got}%).`;
      addStory(s, k, `Pushed onto ${r.shortName}'s corners in ${d.name} without being asked.`);
      if (chance(s, 0.12)) {
        s.scheduled.push({ id: `sc${s.nextId++}`, key: 'retaliation', dueWeek: s.week + randInt(s, 1, 4), because: `let ${k.firstName} push into ${d.name}`, sourceWeek: s.week, params: { rival: r.id } });
      }
      return text;
    }
    case 'skim': {
      const amt = randInt(s, 150, 450);
      k.skimmed = (k.skimmed ?? 0) + amt;
      k.wealth += amt;
      return undefined; // hidden: the bookkeeper or the consigliere may notice
    }
    case 'heat': {
      const boss = player(s);
      if ((boss.evidence ?? 0) <= 2 && s.heat.local < 20) return undefined;
      const took = -addEvidence(s, boss, -randInt(s, 2, 4));
      addEvidence(s, k, took + 1);
      if (s.heat.local > 10) heat(ctx, 'local', -2, `${nm} takes the heat for the family`, 'heat');
      addOpinion(s, boss.id, k.id, 'Took the heat for me', 4, 1);
      addStory(s, k, 'Took the heat for the family when the detectives came around.');
      return `${nm} told the detectives it was his business, not the boss's.`;
    }
    case 'beef': {
      const others = capos(s).filter((x) => x.id !== k.id && isFree(s, x));
      const rs = s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
      if (others.length && chance(s, 0.4)) {
        const o = others.sort((a, b) => opinion(s, k.id, a.id) - opinion(s, k.id, b.id))[0];
        addOpinion(s, k.id, o.id, 'Bad blood between our crews', -8, 1);
        addOpinion(s, o.id, k.id, 'Bad blood between our crews', -8, 1);
        addStory(s, k, `Got into it with ${displayName(o)} at the Shamrock in front of everybody.`);
        addStory(s, o, `${displayName(k)} started a beef with him at the Shamrock.`);
        return `${nm} and ${displayName(o)} had to be pulled apart at the Shamrock. Their crews are not talking.`;
      }
      if (!rs.length) return undefined;
      const r = pick(s, rs);
      heat(ctx, 'local', 2, `Bar fight: ${k.firstName}'s crew and ${r.shortName}'s`, 'heat');
      addOpinion(s, r.leaderId, s.playerId, `${k.firstName}'s crew beat up our people`, -3, 1);
      addEvidence(s, k, 2);
      addStory(s, k, `His crew wrecked a bar fighting ${r.shortName}'s men.`);
      return `${nm}'s crew tore up a bar fighting ${r.shortName}'s men.`;
    }
    case 'earn': {
      const amt = randInt(s, 150, 500);
      k.wealth += amt;
      for (const m of regime(s, k.id)) m.wealth += Math.round(amt / 6);
      // A good week: a loyal or patient capo sends an extra envelope up.
      if (opinion(s, k.id, s.playerId) >= 0 && !hasTrait(k, 'Greedy')) {
        const up = Math.round((300 + regime(s, k.id).length * 120) * (s.date.m >= 6 && s.date.m <= 9 ? 1.6 : 0.8));
        money(ctx, up, `${nm}'s crew had a good week: an extra envelope`, 'kickup');
        addStory(s, k, 'Sent an extra envelope up after a good week.');
      }
      return undefined;
    }
    case 'recruit': {
      const kid = makeCharacter(s, { rank: 'associate', faction: 'player', age: randInt(s, 18, 27) });
      giveBio(s, kid);
      maybePlant(s, kid);
      assignTo(s, kid, k.id, `Brought in by ${nm}.`);
      addOpinion(s, kid.id, k.id, 'Gave me my chance', 15, 1);
      addOpinion(s, kid.id, s.playerId, 'The boss let me in', 5, 1);
      addStory(s, k, `Brought in a new associate, ${displayName(kid)}.`);
      return `${nm} brought a new kid into his crew: ${displayName(kid)}.`;
    }
    case 'cops': {
      if (chance(s, 0.25)) {
        s.favors += 1;
        addStory(s, k, 'Made a friend at City Hall over a long lunch.');
        return `${nm} made a friend at City Hall (+1 favor).`;
      }
      return undefined;
    }
  }
  return undefined;
}

/* ---------------------------------------------------------------- */
/* Philadelphia's books                                              */
/* ---------------------------------------------------------------- */

export function booksWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.books) s.books = { open: false, slots: 0, nextChange: s.week + randInt(s, 6, 14) };
  const b = s.books;
  if (s.week >= b.nextChange) {
    if (b.open) {
      b.open = false;
      b.slots = 0;
      b.nextChange = s.week + randInt(s, 10, 20);
      ctx.log.push('Philadelphia has closed the books. No more makings for now.');
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: 'Philadelphia closed the membership books.', kind: 'misc' });
    } else {
      const philly = s.rivals.find((r) => r.id === 'philly');
      const op = philly ? opinion(s, philly.leaderId, s.playerId) : 0;
      b.open = true;
      b.slots = Math.max(1, Math.min(4, randInt(s, 1, 2) + (op > 30 ? 1 : 0) + (op < -20 ? -1 : 0)));
      b.nextChange = s.week + randInt(s, 6, 10);
      ctx.log.push(`Philadelphia has opened the books: ${b.slots} new member${b.slots > 1 ? 's' : ''} for your family.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `Philadelphia opened the books (${b.slots} place${b.slots > 1 ? 's' : ''}).`, kind: 'misc' });
    }
  }
  if (!b.open || b.slots <= 0) return;
  if (s.eventQueue.some((e) => e.defId === 'making') || s.pendingEvents.some((e) => e.defId === 'making')) return;
  const waiting = crew(s).filter((c) => c.rank === 'associate' && c.proposedWeek !== undefined && s.week - c.proposedWeek >= 2 && isFree(s, c) && s.week - (s.flags[`making_${c.id}`] ?? -99) >= 20)
    .sort((a, b2) => (a.proposedWeek ?? 0) - (b2.proposedWeek ?? 0));
  const c = waiting[0];
  if (!c) return;
  // Philadelphia does its own checking.
  if ((c.evidence ?? 0) >= 55 || (c.record ?? 0) >= 4) {
    c.proposedWeek = undefined;
    addOpinion(s, c.id, s.playerId, 'Philadelphia turned my name down', -6, 1);
    addStory(s, c, 'Philadelphia turned his name down: too much heat on him.');
    ctx.log.push(`Philadelphia turned down ${displayName(c)}: the law has too much on him.`);
    return;
  }
  s.flags[`making_${c.id}`] = s.week;
  s.eventQueue.push(buildMaking(s, c));
}

/* ---------------------------------------------------------------- */
/* Weekly crew world                                                 */
/* ---------------------------------------------------------------- */

export function regimesWeek(ctx: Ctx): void {
  const s = ctx.s;
  tidyRegimes(s);
  const boss = player(s);

  // Capos act on their own. One line per week makes the chronicle.
  let told = false;
  for (const k of capos(s)) {
    if (!isFree(s, k) || !chance(s, 0.25 * awayActMult(s))) continue;
    const line = capoActs(ctx, k);
    if (line) {
      ctx.log.push(line);
      if (!told) {
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'misc' });
        told = true;
      }
    }
  }

  // The boss's own file: it feeds the Prosecutor and the FBI.
  const be = boss.evidence ?? 0;
  if (be > 0 && s.week % 6 === 0) boss.evidence = Math.max(0, be - 1);
  if (be >= 40 && s.week % 3 === 0) heat(ctx, 'federal', 1, `The Prosecutor's file on you is getting thick (evidence ${be})`, 'heat');

  for (const c of crew(s)) {
    // Plants leak.
    if (c.informantFor && isFree(s, c) && !s.flags[`fed_${c.id}`]) {
      if (c.informantFor === 'law' && s.week % 3 === 0) {
        addEvidence(s, boss, 2);
        addEvidence(s, capoOf(s, c), 2);
        heat(ctx, 'federal', 1, `A leak in ${capoOf(s, c)?.firstName ?? 'the'}${capoOf(s, c) ? '\'s' : ''} crew? The FBI knows things`, 'heat');
      } else if (c.informantFor !== 'law' && s.week % 6 === 0) {
        const r = s.rivals.find((x) => x.id === c.informantFor);
        if (r && s.characters[r.leaderId]?.alive) rivalMoneyHit(ctx, randInt(s, 200, 500), `${r.shortName} knew exactly where the collection would be`, rivalCaps(s).moneyFrac);
      }
    }
    // Courtships ripen.
    if (c.courtedBy) {
      const weeks = s.week - c.courtedBy.week;
      const op = opinion(s, c.id, boss.id);
      if (weeks >= 5 && (op >= 30 || hasTrait(c, 'Loyal-to-a-fault'))) {
        const line = `Turned down ${s.rivals.find((r) => r.id === c.courtedBy!.rival)?.name ?? 'a rival'}.`;
        if (c.story?.[c.story.length - 1]?.text !== line) addStory(s, c, line);
        c.courtedBy = undefined;
        if (c.debtTo) c.debtTo.week = s.week + 8;
      } else if (weeks >= 6 && op < (c.rank === 'capo' ? 0 : 10) && opinion(s, c.id, s.rivals.find((r) => r.id === c.courtedBy!.rival)?.leaderId ?? '') > op && chance(s, (c.rank === 'capo' ? 0.05 : 0.08) + (weeks - 6) * (c.rank === 'capo' ? 0.005 : 0.01))) {
        // The longer a rival courts an unhappy man, the likelier he goes.
        const rid = c.courtedBy.rival;
        defectTo(ctx, c, rid, 'courted');
        continue;
      } else if (weeks >= 16) c.courtedBy = undefined;
    }
    // Debts to rival shylocks grow; at some point the rival offers to forget it.
    if (c.debtTo) {
      // ... up to a ceiling: a shylock's book is not a sovereign debt (the playtest saw $1.77M at 3% a week for years).
      c.debtTo.amount = Math.min(SHYLOCK_DEBT_CAP, Math.round(c.debtTo.amount * 1.03));
      if (c.debtTo.amount >= 4000 && !c.courtedBy && s.week - c.debtTo.week >= 6) c.courtedBy = { rival: c.debtTo.rival, week: s.week };
    }
  }
  fillVacantDistricts(ctx);
  booksWeek(ctx);
}

/** The most a man's debt to a rival shylock grows to. */
export const SHYLOCK_DEBT_CAP = 12000;

/**
 * A district you hold with nobody running it leaks money. After a few weeks
 * the best soldier steps up — from the old capo's regime if there is one.
 */
export function fillVacantDistricts(ctx: Ctx): void {
  const s = ctx.s;
  for (const d of s.districts) {
    const key = `vacant_${d.id}`;
    const held = (d.influence.player ?? 0) >= 40;
    const k = d.capoId ? s.characters[d.capoId] : undefined;
    if (!held || (k && k.alive && k.faction === 'player' && k.rank === 'capo')) {
      s.flags[key] = 0;
      continue;
    }
    if (!s.flags[key]) {
      s.flags[key] = s.week;
      continue;
    }
    if (s.week - s.flags[key] < 3) continue;
    const idle = capos(s).find((c) => isFree(s, c) && !s.districts.some((x) => x.capoId === c.id));
    if (idle) {
      d.capoId = idle.id;
      s.flags[key] = 0;
      continue;
    }
    const orphanOf = Object.values(s.characters).find((c) => c.id === d.capoId);
    const best = (orphanOf ? heirFromRegime(s, orphanOf.id) : undefined)
      ?? crew(s).filter((c) => c.rank === 'soldier' && !c.specialty && !c.dynasty && isFree(s, c)).sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0];
    if (!best) continue;
    const from = best.capoId;
    best.rank = 'capo';
    best.capoId = undefined;
    d.capoId = best.id;
    if (from && !s.characters[from]?.alive) transferRegime(s, from, best.id);
    addOpinion(s, best.id, s.playerId, 'Made me a capo', 20, 1);
    addStory(s, best, `Stepped up to run ${d.name}.`);
    s.flags[key] = 0;
    const text = `${displayName(best)} stepped up to run ${d.name}.`;
    ctx.log.push(text);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
    tidyRegimes(s);
  }
}

/** Monthly: evidence drift, vices, new debts, goals that change with rank. */
export function regimesMonth(ctx: Ctx): void {
  const s = ctx.s;
  for (const c of crew(s, true)) {
    if (c.id !== s.playerId && !c.craft) giveBio(s, c);
    if (c.id === s.playerId) continue;
    const ev = c.evidence ?? 0;
    const risky = c.craft === 'muscle' || c.craft === 'collector' || c.craft === 'burglar' || hasTrait(c, 'Cruel');
    c.evidence = Math.max(0, Math.min(100, ev + (risky ? 1 : -1)));
    // Gamblers lose to the wrong people.
    if (!c.debtTo && (hasVice(c, 'horses') || hasVice(c, 'cards') || hasVice(c, 'debt')) && chance(s, 0.035)) {
      const rs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
      if (rs.length) {
        const r = pick(s, rs);
        c.debtTo = { rival: r.id, amount: randInt(s, 12, 30) * 100, week: s.week };
        addStory(s, c, `Borrowed from a ${r.shortName} shylock after a bad run.`);
        ctx.log.push(`${displayName(c)} owes money to a ${r.shortName} shylock.`);
      }
    }
    // Goals move with a man's life.
    if (c.goal === 'get_made' && c.rank !== 'associate') c.goal = hasTrait(c, 'Ambitious') ? 'become_capo' : 'get_rich';
    if (c.goal === 'become_capo' && c.rank === 'capo') c.goal = hasTrait(c, 'Ambitious') ? 'take_chair' : 'get_rich';
    if (c.goal !== 'get_out' && ageOn(c.birth, s.date) >= 62 && c.rank !== 'capo' && chance(s, 0.05)) c.goal = 'get_out';
    else if (c.goal !== 'get_out' && c.rank === 'soldier' && ageOn(c.birth, s.date) >= 40 && (c.household?.kids.length ?? 0) > 0 && chance(s, 0.012)) {
      c.goal = 'get_out';
      addStory(s, c, 'Started talking about getting out, for his kids.');
    }
  }
}

/**
 * A man leaves the family for a rival. If he is a capo, the men of his
 * regime who are more loyal to him than to you go with him.
 */
export function defectTo(ctx: Ctx, c: Character, rival: RivalId | undefined, why: 'courted' | 'neglect' | 'coup' | 'desert'): Character[] {
  const s = ctx.s;
  const r = rival ? s.rivals.find((x) => x.id === rival) : undefined;
  const followers: Character[] = [];
  if (c.rank === 'capo') {
    for (const m of regime(s, c.id)) {
      if (m.dynasty || hasTrait(m, 'Loyal-to-a-fault')) continue;
      const toCapo = opinion(s, m.id, c.id);
      const toBoss = opinion(s, m.id, s.playerId);
      if (toCapo > toBoss + 10) followers.push(m);
    }
  }
  for (const m of [c, ...followers]) {
    // Never the boss himself.
    if (m.id === s.playerId) continue;
    m.faction = r?.id ?? 'none';
    m.courtedBy = undefined;
    m.defectStage = 0;
    m.capoId = undefined;
    for (const d of s.districts) if (d.capoId === m.id) d.capoId = undefined;
    for (const b of s.businesses) if (b.staffIds) b.staffIds = b.staffIds.filter((id) => id !== m.id);
    addOpinion(s, s.playerId, m.id, 'Walked out on the family', -40, 0);
    addStory(s, m, `Left the family${r ? ` for ${r.name}` : ''}${m !== c ? ` with his capo ${displayName(c)}` : ''}.`);
    bumpStat(s, 'defections');
    voucherBlame(ctx, m, 'walked out');
  }
  if (r) r.muscle = Math.min(100, r.muscle + 3 + followers.length * 2);
  const text = followers.length
    ? `${displayName(c)} went over to ${r ? r.shortName : 'nobody'} and took ${followers.map((f) => f.firstName).join(', ')} with him.`
    : `${displayName(c)} walked out${r ? ` and went over to ${r.shortName}` : ''}${why === 'courted' ? ' after weeks of their courting' : why === 'neglect' ? ' after weeks of being ignored' : ''}.`;
  ctx.log.push(text);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
  tidyRegimes(s);
  return followers;
}

/** The man who vouched for someone who went bad pays for it. */
export function voucherBlame(ctx: Ctx, c: Character, what: string): void {
  const s = ctx.s;
  const v = c.vouchedBy ? s.characters[c.vouchedBy] : undefined;
  if (!v?.alive || v.faction !== 'player' || v.id === s.playerId) return;
  addOpinion(s, s.playerId, v.id, `Vouched for ${c.firstName}, who ${what}`, -20, 1);
  addOpinion(s, v.id, s.playerId, `Blamed me for ${c.firstName}`, -6, 1);
  addEvidence(s, v, 5);
  addStory(s, v, `Vouched for ${displayName(c)}, who ${what}. It is on him now.`);
  ctx.log.push(`${displayName(v)} vouched for ${c.firstName}. Everybody remembers that now.`);
}

/** A man in the regimes is a soldier or associate of the family (not hired help). */
export function regimeMen(s: GameState): Character[] {
  return crew(s).filter(inRegimeRank);
}

