import { crew, displayName, hasTrait, livingDynasty, player } from './characters';
import { killCharacter } from './dynasty';
import { heat, money, respect, type Ctx } from './ledger';
import { addOpinion, changeMeter } from './relations';
import { chance, randInt } from './rng';
import { FACTION_NAMES } from './world';
import type { Effect, FactionId, GameState, HeatBar, LedgerCategory, ScheduledConsequence } from './types';

const HEAT_NAMES: Record<HeatBar, string> = { local: 'Local heat', family: 'Family heat', federal: 'Federal heat' };

export function fmtMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/** Human-readable chip for an effect, shown on choice buttons before the player commits. */
export function describeEffect(s: GameState, e: Effect): string | undefined {
  switch (e.type) {
    case 'money':
      return `${e.amount >= 0 ? '+' : ''}${fmtMoney(e.amount)}`;
    case 'respect':
      return `${signed(e.amount)} Respect`;
    case 'heat':
      return `${signed(e.amount)} ${HEAT_NAMES[e.bar]}`;
    case 'opinion': {
      const c = s.characters[e.from];
      return `${c ? c.firstName + ' ' + c.lastName : '?'} opinion ${signed(e.amount)}`;
    }
    case 'meter': {
      const c = s.characters[e.from];
      return `${c ? c.firstName : '?'} ${e.meter} ${signed(e.amount)}`;
    }
    case 'crewOpinion':
      return `Crew opinion ${signed(e.amount)}${e.traitMods ? '*' : ''}`;
    case 'familyOpinion':
      return `Family opinion ${signed(e.amount)}`;
    case 'rivalOpinion':
      return `${FACTION_NAMES[e.rival]} opinion ${signed(e.amount)}`;
    case 'influence': {
      const d = s.districts.find((x) => x.id === e.district);
      return `${signed(e.amount)} influence in ${d?.name ?? e.district}`;
    }
    case 'schedule':
      return `${Math.round(e.chance * 100)}% chance in ${e.minWeeks}–${e.maxWeeks} wks: ${e.hint}`;
    case 'kill': {
      const c = s.characters[e.charId];
      return `${c ? displayName(c) : '?'} dies`;
    }
    case 'imprison': {
      const c = s.characters[e.charId];
      return `${c ? c.firstName + ' ' + c.lastName : '?'} jailed ${e.weeks} wks`;
    }
    case 'recruit': {
      const c = s.characters[e.charId];
      return `${c ? c.firstName + ' ' + c.lastName : '?'} joins the crew`;
    }
    case 'rank': {
      const c = s.characters[e.charId];
      return `${c ? c.firstName : '?'} becomes ${e.rank}`;
    }
    case 'health':
      return `Health ${signed(e.amount)}`;
    case 'debt':
      return `Loan ${fmtMoney(e.principal)}, repay ${fmtMoney(e.weeklyPayment)}/wk × ${e.weeks}`;
    case 'skimReset':
      return 'Skimming stops';
    case 'addBusiness':
      return `New: ${e.business.name}`;
    case 'closeBusiness':
      return `Business closed ${e.weeks} wks`;
    case 'flag':
      return undefined;
    case 'rivalResource': {
      const parts: string[] = [];
      if (e.muscle) parts.push(`muscle ${signed(e.muscle)}`);
      if (e.money) parts.push(`money ${fmtMoney(e.money)}`);
      if (e.exposure) parts.push(`exposure ${signed(e.exposure)}`);
      return `${FACTION_NAMES[e.rival]} ${parts.join(', ')}`;
    }
  }
}

/** Change a faction's influence in a district; gains come out of 'none' first, then other factions proportionally. */
export function shiftInfluence(s: GameState, districtId: string, faction: FactionId, amount: number): number {
  const d = s.districts.find((x) => x.id === districtId);
  if (!d) return 0;
  const cur = d.influence[faction] ?? 0;
  if (amount < 0) {
    const loss = Math.min(cur, -amount);
    d.influence[faction] = cur - loss;
    d.influence.none = (d.influence.none ?? 0) + loss;
    return -loss;
  }
  let need = Math.min(amount, 100 - cur);
  let gained = 0;
  const neutral = d.influence.none ?? 0;
  const fromNeutral = Math.min(neutral, need);
  d.influence.none = neutral - fromNeutral;
  gained += fromNeutral;
  need -= fromNeutral;
  if (need > 0) {
    const others = (Object.keys(d.influence) as FactionId[]).filter((f) => f !== faction && f !== 'none' && (d.influence[f] ?? 0) > 0);
    const total = others.reduce((a, f) => a + (d.influence[f] ?? 0), 0);
    if (total > 0) {
      let taken = 0;
      for (const f of others) {
        const share = Math.min(d.influence[f] ?? 0, Math.round((need * (d.influence[f] ?? 0)) / total));
        d.influence[f] = (d.influence[f] ?? 0) - share;
        taken += share;
      }
      gained += taken;
    }
  }
  d.influence[faction] = cur + gained;
  return gained;
}

export interface EffectSource {
  /** Label prefix used for ledger lines, e.g. "Sit-down: Pay off the beat cops". */
  label: string;
  /** "because you ..." phrase for scheduled consequences. */
  because: string;
  category?: LedgerCategory;
}

export function scheduleConsequence(
  s: GameState,
  key: string,
  minWeeks: number,
  maxWeeks: number,
  because: string,
  params: Record<string, string | number> = {},
): ScheduledConsequence {
  const sc: ScheduledConsequence = {
    id: `sc${s.nextId++}`,
    key,
    dueWeek: s.week + randInt(s, Math.max(1, minWeeks), Math.max(minWeeks, maxWeeks)),
    because,
    sourceWeek: s.week,
    params,
  };
  s.scheduled.push(sc);
  return sc;
}

export function applyEffects(ctx: Ctx, effects: readonly Effect[], src: EffectSource): void {
  for (const e of effects) applyEffect(ctx, e, src);
}

export function applyEffect(ctx: Ctx, e: Effect, src: EffectSource): void {
  const s = ctx.s;
  const cat = src.category ?? 'event';
  const label = e.label ?? src.label;
  const boss = player(s);
  switch (e.type) {
    case 'money':
      money(ctx, e.amount, label, e.category ?? cat);
      break;
    case 'respect':
      respect(ctx, e.amount, label, cat);
      break;
    case 'heat':
      heat(ctx, e.bar, e.amount, label, cat);
      break;
    case 'opinion':
      if (s.characters[e.from]?.alive && s.characters[e.to]?.alive) addOpinion(s, e.from, e.to, e.reason, e.amount, e.decay);
      break;
    case 'meter':
      changeMeter(s, e.from, e.to, e.meter, e.amount);
      break;
    case 'crewOpinion':
      for (const m of crew(s)) {
        let v = e.amount;
        if (e.traitMods) for (const [t, bonus] of Object.entries(e.traitMods)) if (hasTrait(m, t as never)) v += bonus ?? 0;
        addOpinion(s, m.id, boss.id, e.reason, v);
      }
      break;
    case 'familyOpinion':
      for (const m of livingDynasty(s)) if (m.id !== boss.id) addOpinion(s, m.id, boss.id, e.reason, e.amount);
      break;
    case 'rivalOpinion': {
      const r = s.rivals.find((x) => x.id === e.rival);
      if (r && s.characters[r.leaderId]?.alive) {
        addOpinion(s, r.leaderId, boss.id, e.reason, e.amount, e.amount < 0 ? 1 : 2);
        if (e.amount < 0) changeMeter(s, r.leaderId, boss.id, 'grievance', Math.round(-e.amount / 2));
      }
      break;
    }
    case 'influence':
      shiftInfluence(s, e.district, e.faction, e.amount);
      break;
    case 'schedule':
      if (chance(s, e.chance)) scheduleConsequence(s, e.key, e.minWeeks, e.maxWeeks, src.because, e.params ?? {});
      break;
    case 'kill':
      killCharacter(ctx, e.charId, e.cause, e.killer);
      break;
    case 'imprison': {
      const c = s.characters[e.charId];
      if (c?.alive && c.id !== s.playerId) {
        c.imprisonedUntil = s.week + e.weeks;
        for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
        ctx.log.push(`${displayName(c)} is in county lockup for ${e.weeks} weeks.`);
      }
      break;
    }
    case 'recruit': {
      const c = s.characters[e.charId];
      // Stale events (raised before a succession) must never demote the new boss.
      if (c?.alive && c.id !== s.playerId) {
        c.faction = 'player';
        if (c.rank === 'civilian') c.rank = 'associate';
        ctx.log.push(`${displayName(c)} is with us now.`);
      }
      break;
    }
    case 'rank': {
      const c = s.characters[e.charId];
      if (c?.alive && c.id !== s.playerId) {
        c.rank = e.rank;
        if (e.district) {
          const d = s.districts.find((x) => x.id === e.district);
          if (d) d.capoId = c.id;
        }
      }
      break;
    }
    case 'health': {
      const c = s.characters[e.charId];
      if (c?.alive) c.health = Math.max(0, Math.min(100, c.health + e.amount));
      break;
    }
    case 'debt':
      money(ctx, e.principal, e.label ?? `Loan from ${e.lender}`, 'debt');
      s.debts.push({ id: `d${s.nextId++}`, lender: e.lender, principal: e.principal, weeklyPayment: e.weeklyPayment, weeksLeft: e.weeks });
      break;
    case 'skimReset': {
      const c = s.characters[e.charId];
      if (c) {
        c.wealth = Math.max(0, c.wealth - Math.round((c.skimmed ?? 0) / 2));
        c.skimmed = 0;
      }
      break;
    }
    case 'addBusiness':
      s.businesses.push({ ...e.business });
      break;
    case 'closeBusiness': {
      const b = s.businesses.find((x) => x.id === e.businessId);
      if (b) b.closedUntil = s.week + e.weeks;
      break;
    }
    case 'flag':
      s.flags[e.key] = (s.flags[e.key] ?? 0) + e.value;
      break;
    case 'rivalResource': {
      const r = s.rivals.find((x) => x.id === e.rival);
      if (r) {
        if (e.money) r.money = Math.max(0, r.money + e.money);
        if (e.muscle) r.muscle = Math.max(0, Math.min(100, r.muscle + e.muscle));
        if (e.exposure) r.exposure = Math.max(0, Math.min(100, r.exposure + e.exposure));
      }
      break;
    }
  }
}
