import { hasTrait } from './characters';
import { rivalSpotsUp } from './kickup';
import type { Ctx } from './ledger';
import { rand } from './rng';
import { ensureTribute, type RivalBooks, type RivalCapo } from './tributeState';
import type { GameState, Rival } from './types';

/**
 * Rival families run the same architecture as the player's (simplified):
 * their districts and rackets earn; expenses come off; each capo keeps his
 * end under his contract and remits the rest (or comes up short, more so
 * when he holds a grievance); the boss takes his personal cut, puts some in
 * reserve, and the rest is the family's treasury (`Rival.money`, which every
 * rival system already reads). A treasury that runs dry draws the reserve;
 * with both empty the family is insolvent: its muscle bleeds, its capos'
 * grievances grow, and one may walk with his corner (the family fragments).
 * Calibrated so that an ordinary week leaves the treasury what the old flat
 * income gave it. Rolls on the tribute stream, never the main dice.
 */

const NAMES = ['Sally Boots', 'Nicky the Hat', 'Joe Pins', 'Tommy Quarters', 'Augie Blue', 'Lefty Cream', 'Frankie Sixes', 'Charlie Ice', 'Benny Coins', 'Vinnie Socks'];

function seedBooks(s: GameState, r: Rival): RivalBooks {
  const t = ensureTribute(s);
  const leader = s.characters[r.leaderId];
  const caps = Object.values(s.characters).filter((c) => c.faction === r.id && c.alive && c.rank === 'capo');
  const capos: RivalCapo[] = (caps.length ? caps.map((c) => `${c.firstName} ${c.lastName}`) : [NAMES[Math.floor(rand(t) * NAMES.length)], NAMES[Math.floor(rand(t) * NAMES.length)]]).slice(0, 3)
    .map((name) => ({ name, earn: 0, keepBp: 1800 + Math.floor(rand(t) * 1000), short: 0, arrears: 0, grievance: Math.floor(rand(t) * 20) }));
  const greedy = leader && (hasTrait(leader, 'Greedy') ? 1 : 0);
  return { reserve: 0, personal: 0, capos, dry: 0, greedBp: 800 + greedy * 1500 + Math.floor(rand(t) * 700), fragments: 0, leaderId: r.leaderId };
}

/** One rival family's week. Returns what reaches its treasury (added to Rival.money by the caller). */
export function rivalTake(ctx: Ctx, r: Rival, owned: number): number {
  const s = ctx.s;
  const t = ensureTribute(s);
  const b = (t.rivals[r.id] ??= seedBooks(s, r));
  // A new boss: his own appetite; the capos give him a honeymoon.
  if (b.leaderId !== r.leaderId) {
    b.leaderId = r.leaderId;
    const L = s.characters[r.leaderId];
    b.greedBp = 800 + (L && hasTrait(L, 'Greedy') ? 1500 : 0) + Math.floor(rand(t) * 700);
    for (const c of b.capos) c.grievance = Math.max(0, c.grievance - 20);
  }
  // The districts, and every man's own spot kicked up to his boss (kickup.ts): lose an earner, lose his money.
  const base = r.kind === 'mob' ? owned * 0.5 + rivalSpotsUp(s, r) : 500;
  const avgKeep = b.capos.reduce((a, c) => a + c.keepBp, 0) / Math.max(1, b.capos.length) / 10000;
  const reserveBp = 1000;
  const expected = 0.85 * (1 - avgKeep) * 0.97 * (1 - (b.greedBp + reserveBp) / 10000);
  const revenue = (base / Math.max(0.3, expected)) * (0.85 + rand(t) * 0.3);
  const expenses = revenue * 0.15;
  const gross = revenue - expenses;
  let toBoss = 0;
  let kept = 0;
  let short = 0;
  const n = Math.max(1, b.capos.length);
  for (const c of b.capos) {
    const earn = gross / n;
    c.earn = Math.round(earn);
    const keep = (earn * c.keepBp) / 10000;
    const owed = earn - keep;
    const pShort = 0.03 + c.grievance / 250;
    const sh = rand(t) < pShort ? Math.round(owed * (0.2 + rand(t) * 0.6)) : 0;
    c.short = sh;
    c.arrears += sh;
    // Arrears come back when he is not aggrieved.
    const back = c.grievance < 40 ? Math.round(c.arrears * 0.3) : 0;
    c.arrears -= back;
    kept += keep;
    short += sh;
    toBoss += owed - sh + back;
    // Grievances: a greedy boss, an insolvent family.
    c.grievance = Math.max(0, Math.min(100, c.grievance + (b.greedBp > 2000 ? 1.5 : -0.5) + (b.dry >= 3 ? 3 : 0)));
  }
  const personal = Math.round((toBoss * b.greedBp) / 10000);
  const reserve = Math.round((toBoss * reserveBp) / 10000);
  const treasury = Math.round(toBoss - personal - reserve);
  b.personal += personal;
  b.reserve += reserve;
  b.last = { week: s.week, gross: Math.round(gross), kept: Math.round(kept), short: Math.round(short), toBoss: Math.round(toBoss), personal, treasury, reserve };
  // The treasury runs dry: the reserve covers it; with both empty the family is insolvent.
  let cover = 0;
  if (r.money + treasury < 1000 && b.reserve > 0) {
    cover = Math.min(b.reserve, 1000 - (r.money + treasury));
    b.reserve -= cover;
  }
  if (r.money + treasury + cover <= 500 && b.reserve <= 0) {
    b.dry++;
    if (b.dry >= 4) {
      r.muscle = Math.max(5, r.muscle - 2);
      if (!b.insolvent) {
        b.insolvent = s.week;
        t.stats.insolvencies++;
        ctx.log.push(`[${r.id}] ${r.shortName}'s family cannot make its payroll; its men are drifting.`);
      }
    }
  } else {
    b.dry = Math.max(0, b.dry - 1);
    if (b.dry === 0) b.insolvent = undefined;
  }
  // A capo who has had enough walks with his corner: the family fragments.
  const sore = b.capos.find((c) => c.grievance >= 85);
  if (sore && b.capos.length > 1 && rand(t) < 0.1) {
    b.capos = b.capos.filter((c) => c !== sore);
    b.fragments++;
    r.muscle = Math.max(5, r.muscle - 8);
    const home = s.districts.find((d) => d.id === r.homeDistrict) ?? s.districts.filter((d) => (d.influence[r.id] ?? 0) > 0).sort((a, b2) => (b2.influence[r.id] ?? 0) - (a.influence[r.id] ?? 0))[0];
    if (home && (home.influence[r.id] ?? 0) >= 5) home.influence[r.id] = (home.influence[r.id] ?? 0) - 5;
    ctx.log.push(`[${r.id}] ${sore.name} walked out on ${r.shortName} with his corner. The family is splitting.`);
  }
  // A new capo comes up when there are too few.
  if (b.capos.length < 2 && rand(t) < 0.05) b.capos.push({ name: NAMES[Math.floor(rand(t) * NAMES.length)], earn: 0, keepBp: 2000, short: 0, arrears: 0, grievance: 0 });
  return treasury + cover;
}

/** The rival families' books (UI and tests). */
export function rivalBooksView(s: GameState): { id: string; name: string; money: number; books: RivalBooks }[] {
  const t = s.tribute;
  if (!t) return [];
  return s.rivals.filter((r) => t.rivals[r.id]).map((r) => ({ id: r.id, name: r.shortName, money: Math.round(r.money), books: t.rivals[r.id] }));
}
