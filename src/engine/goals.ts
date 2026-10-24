import { newBusiness } from './business';
import { displayName, isFree, makeCharacter } from './characters';
import { applyEffects } from './effects';
import { reached } from './history';
import type { Ctx } from './ledger';
import { addOpinion } from './relations';
import { chance, randInt } from './rng';
import type { Character, GameState } from './types';

/**
 * Long-term goals.
 *  - The bank: a state charter needs a clean front man, a political favor, $50K
 *    and federal heat under 50. A bank washes almost anything.
 *  - The casino dream: option boardwalk land in Atlantic City, wait for the
 *    voters (the 1974 referendum fails; 1976 passes), apply for a license
 *    through a front man with no record, survive the investigation, and open
 *    after the first casino opens in 1978. A ten-year arc.
 */

export const BANK_COST = 50000;
export const LAND_COST = 15000;
export const LAND_SALE = 90000;
export const LICENSE_COST = 40000;
export const LICENSE_WEEKS = 26;

export function frontMan(s: GameState): Character | undefined {
  const c = s.frontManId ? s.characters[s.frontManId] : undefined;
  return c && c.alive && isFree(s, c) ? c : undefined;
}

export function frontManClean(s: GameState): boolean {
  const f = frontMan(s);
  return !!f && (f.record ?? 0) === 0 && (f.evidence ?? 0) < 40;
}

export function hasBank(s: GameState): boolean {
  return s.goals.bankWeek !== undefined && s.businesses.some((b) => b.owner === 'player' && b.kind === 'bank');
}

/** Requirements for the bank charter, as a checklist for the UI. */
export function bankChecklist(s: GameState): { label: string; ok: boolean }[] {
  return [
    { label: 'A clean front man with no record', ok: frontManClean(s) },
    { label: 'A political favor (the state banking commissioner)', ok: s.favors >= 1 },
    { label: `$${BANK_COST.toLocaleString('en-US')} in the treasury`, ok: s.money >= BANK_COST },
    { label: 'Federal heat under 50', ok: s.heat.federal < 50 },
  ];
}

export function casinoStatus(s: GameState): string {
  const g = s.goals;
  if (g.landSold) return 'You sold the land. The dream belongs to somebody else now.';
  switch (g.casinoStage) {
    case 0: return 'Nobody can open a casino in New Jersey. The law would have to change — but land is cheap now.';
    case 1:
      return reached(s, 'referendum1976')
        ? 'The voters said yes: casinos in Atlantic City. Your land is worth a fortune — sell it, or apply for a license.'
        : reached(s, 'referendum1974')
          ? 'The 1974 referendum failed. You hold the land and wait for the next vote.'
          : 'You hold options on boardwalk lots in Atlantic City. Only the voters can change the law.';
    case 2: return 'The license application is with the state. Investigators are reading your front man\'s life.';
    case 3: return 'Licensed. Waiting for the first casino to open its doors.';
    default: return 'Your casino stake is open. The dream came true.';
  }
}

/** Creates the front man character (called when the action resolves). */
export function hireFrontMan(ctx: Ctx): Character {
  const s = ctx.s;
  const c = makeCharacter(s, { rank: 'civilian', faction: 'player', age: randInt(s, 38, 55), nickname: false, traits: ['Honest', 'Patient'] });
  c.frontMan = true;
  c.record = 0;
  c.ambition = 'Stay clean and get rich';
  s.frontManId = c.id;
  addOpinion(s, c.id, s.playerId, 'Pays well for a clean name', 15, 1);
  ctx.log.push(`${displayName(c)} — no record, good suits — will front for the family.`);
  return c;
}

/** Weekly tick for the casino arc. */
export function runGoals(ctx: Ctx): void {
  const s = ctx.s;
  const g = s.goals;
  if (g.casinoStage === 2) {
    const since = s.week - (g.casinoSince ?? s.week);
    const clean = frontManClean(s);
    if (!clean || s.heat.federal >= 65) {
      if (!clean || chance(s, 0.1)) {
        g.casinoStage = 1;
        ctx.log.push('The Casino Control Commission denied the license. The investigators found something they did not like.');
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: 'The casino license was denied.', kind: 'misc' });
        return;
      }
    }
    if (since >= LICENSE_WEEKS) {
      g.casinoStage = 3;
      ctx.log.push('The license came through. Your front man shook hands with the Commission chairman.');
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: 'The family (through a front man) won a casino license.', kind: 'misc' });
    }
  }
  if (g.casinoStage === 3 && reached(s, 'firstCasino')) {
    g.casinoStage = 4;
    const b = newBusiness(s, 'casino', 'boardwalk', 'Boardwalk casino stake (Atlantic City)');
    applyEffects(ctx, [{ type: 'addBusiness', business: b }, { type: 'respect', amount: 10, label: 'Opening night in Atlantic City' }], { label: 'Opening night', because: 'chased the casino dream' });
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: 'Opening night: the family\'s casino stake in Atlantic City opened its doors.', kind: 'misc' });
  }
}
