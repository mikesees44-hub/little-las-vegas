import { displayName, hasTrait, isFree } from '../characters';
import type { Ctx } from '../ledger';
import { opinion } from '../relations';
import { strengthTotal } from '../strength';
import type { Character, GameState } from '../types';
import { believe, gossipWeek, nameOf, observe, startRumor } from './beliefs';
import { evolveAmbition, initialAmbition, refreshGoals } from './goals';
import { absorbOpinions, fadeMemories, remember } from './memory';
import { considerPlan, motive, outlook, workPlan } from './planner';
import { drives, isHothead, isSchemer, moodOf, satisfaction, type WeekLook } from './psyche';
import { drawRoster, ensureMinds, r01, rivalLedBy, roll } from './state';
import { THINK_BUDGET, type Mind, type MindsState } from './types';

export * from './types';
export { ensureMinds, mindOf, importance, drawRoster } from './state';
export { capoLean, noteCapoMove, rivalLean, noteRivalMove, threatLean, noteThreatPlan, ltLean, type CapoMove, type CapoLean } from './planner';
export { believe, startRumor, gossipWeek, observe, factText, sureWord, nameOf } from './beliefs';
export { remember, grudge, gratitude, fadeMemories } from './memory';
export { drives, satisfaction, urgencies, moodOf, riskTolerance, isSchemer, isHothead } from './psyche';

/**
 * THE MINDS' WEEK. Runs before the capos and the rivals act (engine.ts), so
 * their choices read fresh minds:
 *  1. the roster of people who get full minds (redrawn monthly; the dead go at once);
 *  2. what everyone saw last week (a rival's strike, a death and who did it, a man being courted);
 *  3. talk: rumors travel and change; schemers plant lies, the paranoid see rats;
 *  4. a budget of think steps: needs, mood, memory, ambition, goals, the step of a plan.
 * Its dice are its own. It writes stories, memories, opinions and the odd
 * ledger line (an extra envelope, a private score's heat), never a popup.
 */
export function mindsWeek(ctx: Ctx): string[] {
  const s = ctx.s;
  const M = ensureMinds(s);
  const lines: string[] = [];
  // 1. The roster.
  for (const id of Object.keys(M.minds)) if (!s.characters[id]?.alive || id === s.playerId) delete M.minds[id];
  if (s.week - M.roster >= 4) {
    const roster = drawRoster(s);
    const keep = new Set(roster);
    for (const id of Object.keys(M.minds)) if (!keep.has(id)) delete M.minds[id];
    for (const id of roster) if (!M.minds[id]) M.minds[id] = newMind(s, s.characters[id]);
    M.roster = s.week;
  }
  const ids = Object.keys(M.minds).sort();
  const look: WeekLook = {
    bossStrength: strengthTotal(s),
    threatened: new Set((s.threats?.threats ?? []).map((t) => t.targetId).filter((x): x is string => !!x)),
    turf: {},
  };
  for (const d of s.districts) for (const [f, v] of Object.entries(d.influence)) look.turf[f] = (look.turf[f] ?? 0) + (v ?? 0);

  // 2. What they saw.
  witness(s, M, ids);
  // 3. Talk.
  gossipWeek(s, M, [...ids]);
  suspicionsAndLies(s, M, ids);
  // 4. Thinking, on a budget: rival bosses every week; the rest, the longest-unthought first.
  const order = ids.slice().sort((a, b) => {
    const ra = rivalLedBy(s, a) ? 1 : 0;
    const rb = rivalLedBy(s, b) ? 1 : 0;
    return rb - ra || M.minds[a].th - M.minds[b].th || a.localeCompare(b);
  });
  let budget = THINK_BUDGET;
  for (const id of order) {
    if (budget <= 0) break;
    const c = s.characters[id];
    if (!c?.alive) continue;
    budget--;
    const line = think(ctx, M, M.minds[id], c, look, ids);
    if (line) lines.push(line);
  }
  // One line a week makes the chronicle.
  if (lines.length) {
    ctx.log.push(...lines);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: lines[0], kind: 'misc' });
  }
  return lines;
}

function newMind(s: GameState, c: Character): Mind {
  const m: Mind = { id: c.id, sat: [], mood: 'content', mv: 0, goals: [], bel: {}, facts: [], mem: [], why: [], th: s.week - 1 };
  m.amb = initialAmbition(s, c);
  // He starts with what he thinks of the boss.
  const op = opinion(s, c.id, s.playerId);
  m.bel[s.playerId] = { t: Math.round(op / 2), tc: 0.3, u: s.week };
  if (Math.abs(op) >= 25) m.mem.push({ w: s.week, k: op > 0 ? 'favor' : 'slight', who: s.playerId, t: op > 0 ? 'the boss has been good to him' : 'the boss has done him wrong', v: Math.round(op / 4), s: 0.6 });
  return m;
}

/** One think step for one man. */
function think(ctx: Ctx, M: MindsState, m: Mind, c: Character, look: WeekLook, ids: readonly string[]): string | undefined {
  const s = ctx.s;
  const weeks = Math.max(1, s.week - m.th);
  fadeMemories(c, m, weeks);
  absorbOpinions(s, m, [s.playerId, ...ids]);
  m.sat = satisfaction(s, c, look, m);
  // Fun runs down; a man with a vice has his on his own dice.
  const fun = hasTrait(c, 'Womanizer') || hasTrait(c, 'Drinker') || hasTrait(c, 'Gambler') || (c.vices?.length ?? 0) > 0;
  m.sat[5] = Math.max(0, Math.min(100, m.sat[5] - 6 * weeks + (fun && roll(M, 0.45) ? 25 : !fun ? 6 * weeks : 0)));
  // He sizes up the boss, and one more man he deals with.
  observe(s, M, m, c, s.playerId, look);
  const r = rivalLedBy(s, c.id);
  const other = r
    ? s.rivals.filter((x) => x.id !== r.id && x.kind === 'mob' && s.characters[x.leaderId]?.alive).map((x) => x.leaderId)
    : ids.filter((x) => x !== c.id && s.characters[x]?.faction === c.faction);
  if (other.length) observe(s, M, m, c, other[Math.floor(r01(M) * other.length)], look);
  const d = drives(s, c);
  evolveAmbition(s, c, m);
  const mo = moodOf(c, d, m.sat, m, s.week);
  m.mood = mo.mood;
  m.mv = mo.mv;
  refreshGoals(s, c, m, d);
  m.th = s.week;
  M.stats.thinks++;
  const o = outlook(s, c.id);
  if (!o) return undefined;
  considerPlan(s, M, o);
  return isFree(s, c) ? workPlan(ctx, M, o) : undefined;
}

/** Last week's events, as the people with minds saw them. */
function witness(s: GameState, M: MindsState, ids: readonly string[]): void {
  const last = s.week - 1;
  // A rival's move on you, or on another family.
  for (const r of s.rivals) {
    const lm = r.lastMove;
    if (!lm || lm.week !== last || (lm.move !== 'strike' && lm.move !== 'inform')) continue;
    if (lm.target === 'player') {
      for (const id of ids) {
        const c = s.characters[id];
        if (!c || c.faction !== 'player') continue;
        believe(s, M.minds[id], { k: 'hit', by: r.leaderId, on: s.playerId, c: 0.85, src: 'saw', tr: true });
        if (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere') remember(M.minds[id], { w: last, k: 'slight', who: r.leaderId, t: `${r.shortName} hit our people`, v: -6 });
      }
      // Word goes around the other families too (and not always with the right name on it).
      const teller = ids.find((x) => s.characters[x]?.faction === 'player');
      if (teller && roll(M, 0.4)) startRumor(s, M, M.minds[teller], { k: 'hit', by: r.leaderId, on: s.playerId, tr: true });
    } else {
      const vic = s.rivals.find((x) => x.id === lm.target);
      const vm = vic ? M.minds[vic.leaderId] : undefined;
      if (vm) {
        remember(vm, { w: last, k: 'slight', who: r.leaderId, t: lm.move === 'strike' ? `${r.shortName} hit our people` : `${r.shortName} ratted us out`, v: -15 });
        if (roll(M, 0.5)) startRumor(s, M, vm, { k: lm.move === 'strike' ? 'hit' : 'rat', by: r.leaderId, on: vic!.leaderId, tr: true });
      }
    }
  }
  // A death last week: grief for his own, and the question of who did it.
  for (const id in s.characters) {
    const dead = s.characters[id];
    if (dead.alive || !dead.death || dead.death.week < last) continue;
    const killerRival = dead.death.killer ? s.rivals.find((x) => x.id === dead.death!.killer) : undefined;
    for (const mid of ids) {
      const c = s.characters[mid];
      const m = M.minds[mid];
      if (!c || !m) continue;
      const kin = c.spouseId === id || c.childrenIds.includes(id) || dead.childrenIds.includes(mid) || (!!c.fatherId && c.fatherId === dead.fatherId);
      const sameCrew = dead.faction === c.faction && dead.capoId !== undefined && dead.capoId === (c.rank === 'capo' ? c.id : c.capoId);
      if (!kin && !sameCrew) continue;
      remember(m, { w: last, k: 'grief', who: id, t: `lost ${displayName(dead)}`, v: kin ? -20 : -8 });
      if (!killerRival || killerRival.kind === 'law') continue;
      // Word is it was ... (and sometimes word is wrong).
      const others = s.rivals.filter((x) => x.kind === 'mob' && x.id !== killerRival.id && s.characters[x.leaderId]?.alive);
      const wrong = others.length > 0 && roll(M, 0.25);
      const blamed = wrong ? others[Math.floor(r01(M) * others.length)] : killerRival;
      const f = believe(s, m, { k: 'killed', by: blamed.leaderId, on: id, c: kin ? 0.6 : 0.45, src: 'told', tr: !wrong });
      remember(m, { w: last, k: 'slight', who: blamed.leaderId, t: `${blamed.shortName} killed ${dead.firstName}`, v: kin ? -25 : -10 });
      if (kin && (hasTrait(c, 'Vengeful') || isHothead(c) || drives(s, c).revenge >= 0.4) && m.amb?.k !== 'avenge') {
        m.amb = { k: 'avenge', t: blamed.leaderId, p: 0, w: s.week };
        motive(s, m, { a: `swore to avenge ${dead.firstName}`, n: 'revenge', g: 'Avenge his blood', b: `${f.c >= 0.5 ? 'believes' : 'suspects'} ${nameOf(s, blamed.leaderId)} did it` });
      }
      if (roll(M, 0.5)) startRumor(s, M, m, { k: 'killed', by: blamed.leaderId, on: id, tr: !wrong });
    }
  }
  // Men being courted are noticed; skimming capos are noticed by their own.
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.alive || c.faction !== 'player') continue;
    if (c.courtedBy && roll(M, 0.15)) {
      const w = ids.find((x) => x !== id && s.characters[x]?.faction === 'player');
      if (w) startRumor(s, M, M.minds[w], { k: 'courted', by: id, tr: true });
    }
    if (c.rank === 'capo' && (c.skimmed ?? 0) >= 600 && roll(M, 0.12)) {
      const w = ids.find((x) => x !== id && s.characters[x]?.faction === 'player' && (s.characters[x].capoId === id || s.characters[x].rank === 'consigliere'));
      if (w) startRumor(s, M, M.minds[w], { k: 'skim', by: id, tr: true });
    }
  }
}

/** The paranoid see rats (sometimes the right one); schemers with a grudge plant stories. */
function suspicionsAndLies(s: GameState, M: MindsState, ids: readonly string[]): void {
  for (const id of ids) {
    const c = s.characters[id];
    const m = M.minds[id];
    if (!c?.alive || !m) continue;
    const protect = m.goals.find((g) => g.k === 'protect');
    if (protect && roll(M, 0.2)) {
      const real = Object.values(s.characters).find((x) => x.alive && x.faction === c.faction && x.informantFor && x.id !== id);
      if (real && roll(M, 0.25 + c.attributes.intrigue / 250)) {
        believe(s, m, { k: 'rat', by: real.id, c: 0.5, src: 'saw', tr: true });
        motive(s, m, { a: `came to suspect ${displayName(real)}`, n: 'safety', g: 'find out who the rat is', b: 'saw him where he shouldn\'t have been' });
      } else {
        // The wrong man: the one he trusts least.
        const pool = ids.filter((x) => x !== id && s.characters[x]?.faction === c.faction && s.characters[x]?.rank !== 'civilian');
        pool.sort((a, b) => (m.bel[a]?.t ?? opinion(s, id, a)) - (m.bel[b]?.t ?? opinion(s, id, b)) || a.localeCompare(b));
        const sus = pool[0];
        if (sus) {
          const truly = !!s.characters[sus].informantFor;
          believe(s, m, { k: 'rat', by: sus, c: 0.35, src: 'saw', tr: truly });
          if (roll(M, 0.4)) startRumor(s, M, m, { k: 'rat', by: sus, tr: truly });
          motive(s, m, { a: `came to suspect ${nameOf(s, sus)}`, n: 'safety', g: 'find out who the rat is', b: `trusts ${nameOf(s, sus)} least` });
        }
      }
    }
    const smear = m.goals.find((g) => g.k === 'smear' && g.t && g.t !== s.playerId);
    if (smear && isSchemer(c) && roll(M, 0.25)) {
      const k = s.characters[smear.t!]?.faction === c.faction ? (roll(M, 0.5) ? 'skim' : 'rat') : 'weak';
      startRumor(s, M, m, { k, by: smear.t!, tr: false }, true);
      motive(s, m, { a: `put a story about ${nameOf(s, smear.t)} in a friendly ear`, n: 'revenge', g: 'blacken a name quietly', c: 'a schemer works with words, not fists', h: 1 });
    }
  }
}
