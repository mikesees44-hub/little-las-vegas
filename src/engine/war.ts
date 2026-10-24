import { crew, displayName, isFree } from './characters';
import { applyEffects, fmtMoney, shiftInfluence } from './effects';
import type { Ctx } from './ledger';
import { addOpinion } from './relations';
import { chance, randInt } from './rng';
import { FACTION_NAMES } from './world';
import type { CasusBelli, Effect, EventInstance, GameState, RivalId, War } from './types';

/**
 * Claims and war. A war needs a casus belli: a claim on the district, a
 * grievance the Table recognised, a blood feud, or the Table's sanction.
 * Without the Table's blessing Philadelphia is angry. War score moves with
 * raids, hits and strikes; a war ends when one side accepts terms or the
 * Table rules.
 */

export const RAID_COST = 1500;
export const DISTRICT_PRIZE = 25;

export function playerMuscle(s: GameState): number {
  return Math.min(100, crew(s).filter((c) => isFree(s, c)).reduce((a, c) => a + c.attributes.force / 18, 0));
}

/** Which casus belli the player holds against a rival for a district, best first. */
export function casusBelli(s: GameState, rival: RivalId, district: string): CasusBelli | undefined {
  const r = s.rivals.find((x) => x.id === rival);
  if (!r) return undefined;
  if (s.claims.some((c) => c.district === district && c.against === rival)) return 'claim';
  if ((s.flags[`sanctionWar_${rival}`] ?? 0) >= s.week) return 'sanction';
  if ((s.flags[`grievance_${rival}`] ?? 0) > 0) return 'grievance';
  if (r.feud) return 'feud';
  return undefined;
}

export const CB_LABEL: Record<CasusBelli, string> = {
  claim: 'A claim on the district',
  sanction: 'The Table\'s sanction',
  grievance: 'A grievance the Table heard',
  feud: 'A blood feud',
};

export function warWith(s: GameState, rival: string): War | undefined {
  return s.wars.find((w) => w.rival === rival);
}

/** Odds a raid on the rival succeeds. */
export function raidOdds(s: GameState, w: War): number {
  const r = s.rivals.find((x) => x.id === w.rival);
  const mine = playerMuscle(s);
  return Math.max(0.1, Math.min(0.9, 0.5 + (mine - (r?.muscle ?? 50)) / 120));
}

export function startWar(ctx: Ctx, rival: RivalId, district: string, cb: CasusBelli, sanctioned: boolean): War {
  const s = ctx.s;
  const r = s.rivals.find((x) => x.id === rival)!;
  const w: War = { id: `w${s.nextId++}`, rival, district, cb, sanctioned, score: 0, startWeek: s.week };
  s.wars.push(w);
  r.war = true;
  addOpinion(s, r.leaderId, s.playerId, 'Declared war on us', -30, 1);
  if (cb === 'claim') s.claims = s.claims.filter((c) => !(c.district === district && c.against === rival));
  if (cb === 'grievance') s.flags[`grievance_${rival}`] = 0;
  const d = s.districts.find((x) => x.id === district);
  ctx.log.push(`War: your crew against ${r.name}, over ${d?.name ?? district}${sanctioned ? ', with the Table\'s blessing' : ' — without the Table\'s blessing'}.`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The house went to war with ${r.name} over ${d?.name ?? district}.`, kind: 'rival' });
  if (s.cutscenes.length < 2) s.cutscenes.push({ key: 'sitdown', title: 'War', text: `The mattresses come out. ${r.name} and your crew are at war over ${d?.name ?? district}.`, week: s.week });
  return w;
}

export function changeScore(s: GameState, warId: string, amount: number): void {
  const w = s.wars.find((x) => x.id === warId);
  if (w) w.score = Math.max(-100, Math.min(100, w.score + amount));
}

/** Apply peace terms. */
export function endWar(ctx: Ctx, w: War, outcome: 'won' | 'lost' | 'white', terms: 'district' | 'tribute' | 'white' = 'district'): void {
  const s = ctx.s;
  const r = s.rivals.find((x) => x.id === w.rival);
  s.wars = s.wars.filter((x) => x !== w);
  if (r) r.war = s.wars.some((x) => x.rival === r.id);
  const d = s.districts.find((x) => x.id === w.district);
  const label = `Peace with ${r?.shortName ?? 'the rival'}`;
  const effects: Effect[] = [];
  if (outcome === 'won' && r) {
    if (terms === 'district' && d) {
      const lost = -shiftInfluence(s, d.id, r.id, -DISTRICT_PRIZE);
      shiftInfluence(s, d.id, 'player', lost);
      effects.push({ type: 'respect', amount: 6, label });
      ctx.log.push(`${r.name} gave up ${lost}% of ${d.name}.`);
    } else if (terms === 'tribute') {
      const amt = Math.min(r.money, 12000);
      r.money -= amt;
      effects.push({ type: 'money', amount: amt, label: `${label}: reparations` }, { type: 'respect', amount: 4, label });
    } else effects.push({ type: 'respect', amount: 2, label });
  } else if (outcome === 'lost' && r) {
    if (d) {
      const lost = -shiftInfluence(s, d.id, 'player', -Math.round(DISTRICT_PRIZE * 0.6));
      shiftInfluence(s, d.id, r.id, lost);
      ctx.log.push(`You gave up ${lost}% of ${d.name} to ${r.name}.`);
    }
    effects.push({ type: 'respect', amount: -6, label }, { type: 'money', amount: -Math.min(Math.max(0, s.money), 5000), label: `${label}: reparations` });
  }
  if (effects.length) applyEffects(ctx, effects, { label, because: `made peace with ${r?.shortName ?? 'a rival'}` });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The war with ${r?.name ?? 'a rival'} ended: ${outcome === 'won' ? 'they gave in' : outcome === 'lost' ? 'you gave in' : 'a white peace'}.`, kind: 'rival' });
}

/** Weekly: the war grinds on; a beaten rival sues for peace; an unsanctioned war costs family heat. */
export function warWeek(ctx: Ctx): void {
  const s = ctx.s;
  for (const w of [...s.wars]) {
    const r = s.rivals.find((x) => x.id === w.rival);
    if (!r || !s.characters[r.leaderId]?.alive) {
      endWar(ctx, w, 'won', 'district');
      continue;
    }
    // Attrition: muscle decides the drift.
    const drift = Math.round((playerMuscle(s) - r.muscle) / 25);
    if (drift) changeScore(s, w.id, drift);
    if (!w.sanctioned && s.week % 4 === 0) applyEffects(ctx, [{ type: 'heat', bar: 'family', amount: 2, label: `Unsanctioned war with ${r.shortName}: Philadelphia is unhappy` }], { label: '', because: '' });
    if (w.score <= -60 && !s.eventQueue.some((e) => e.defId === 'war_terms')) s.eventQueue.push(buildEnemyTerms(s, w));
    if (w.score >= 70 && chance(s, 0.3)) {
      ctx.log.push(`${r.name} sent word through Philadelphia: they want out.`);
      endWar(ctx, w, 'won', 'district');
    }
  }
}

/** Their terms when you are losing. */
export function buildEnemyTerms(s: GameState, w: War): EventInstance {
  const r = s.rivals.find((x) => x.id === w.rival)!;
  const d = s.districts.find((x) => x.id === w.district);
  const label = `War with ${r.shortName}`;
  return {
    iid: `ev${s.nextId++}`, defId: 'war_terms', week: s.week, mandatory: true, priority: 82,
    title: `${r.shortName} offers terms`,
    text: `${displayName(s.characters[r.leaderId])} sends a messenger to the Shamrock: give up your piece of ${d?.name ?? 'the district'}, pay for the damage, and it ends tonight.`,
    defaultChoiceId: 'accept', meta: { war: w.id }, actors: [r.leaderId],
    choices: [
      { id: 'accept', label: 'Accept their terms', because: `accepted ${r.shortName}'s terms`, effects: [{ type: 'warEnd', warId: w.id, outcome: 'lost', label }] },
      { id: 'fight', label: 'Fight on', detail: 'The crew will bleed for it.', because: `refused ${r.shortName}'s terms`, effects: [{ type: 'warScore', warId: w.id, amount: 10, label }, { type: 'crewOpinion', amount: -4, reason: 'Kept us at war', label }, { type: 'respect', amount: 1, label }] },
    ],
  };
}

/** Raid resolution (the raid order's commit). */
export function resolveRaid(ctx: Ctx, w: War): void {
  const s = ctx.s;
  const r = s.rivals.find((x) => x.id === w.rival);
  if (!r) return;
  const label = `Raid on ${r.shortName}`;
  if (chance(s, raidOdds(s, w))) {
    const burned = randInt(s, 1500, 5000);
    r.money = Math.max(0, r.money - burned);
    r.muscle = Math.max(5, r.muscle - randInt(s, 4, 9));
    const d = s.districts.find((x) => x.id === w.district);
    if (d) {
      const lost = -shiftInfluence(s, d.id, r.id, -3);
      shiftInfluence(s, d.id, 'player', lost);
    }
    applyEffects(ctx, [{ type: 'warScore', warId: w.id, amount: 10, label }, { type: 'respect', amount: 1, label }, { type: 'heat', bar: 'local', amount: 4, label }], { label, because: `raided ${r.shortName}` });
    ctx.log.push(`Your crew burned one of ${r.shortName}'s places to the ground (${fmtMoney(burned)} of theirs gone).`);
  } else {
    const men = crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && isFree(s, c));
    if (men.length && chance(s, 0.3)) men[randInt(s, 0, men.length - 1)].health -= 25;
    applyEffects(ctx, [{ type: 'warScore', warId: w.id, amount: -6, label }, { type: 'heat', bar: 'local', amount: 5, label }, { type: 'respect', amount: -1, label }], { label, because: `raided ${r.shortName}` });
    ctx.log.push(`${r.shortName} was waiting for your crew. The raid failed.`);
  }
}

export function warName(s: GameState, w: War): string {
  return `${FACTION_NAMES[w.rival]} over ${s.districts.find((d) => d.id === w.district)?.name ?? w.district}`;
}
