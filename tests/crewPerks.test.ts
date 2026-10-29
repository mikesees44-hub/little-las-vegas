import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { crew } from '../src/engine/characters';
import { allCrewPerks, MAN_KEYS_WAITING, manMod, type ManKey } from '../src/engine/lifestyle';
import { ensureXp, xpCornersMult, xpEvidenceMult, xpHustleMult, xpJobOdds, xpRatMult, xpTakeMult } from '../src/engine/crewXp';
import { ltProfile } from '../src/engine/lieutenants';
import { holder } from '../src/engine/council';
import type { Character, GameState } from '../src/engine/types';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('crew perks: every modifier is read somewhere', () => {
  it('each key a crew perk moves is read by an engine hook (manMod(..., key)), or is listed as waiting', () => {
    const src = files('src/engine').filter((f) => !f.endsWith('lifestyle.ts')).map((f) => readFileSync(f, 'utf8')).join('\n');
    const keys = new Set(allCrewPerks().flatMap((p) => Object.keys(p.mods) as ManKey[]));
    for (const k of keys) {
      if (MAN_KEYS_WAITING.includes(k)) continue;
      expect(src.includes(`'${k}')`), k).toBe(true);
    }
    // 5 focuses × 3 branches × 4 perks, unique ids, every text states a number or is an old specialty.
    const all = allCrewPerks();
    expect(all.length).toBe(60);
    expect(new Set(all.map((p) => p.id)).size).toBe(60);
    for (const p of all) expect(p.xp || /\d/.test(p.text), p.id).toBeTruthy();
  });
});

function withPerks(s: GameState, c: Character, gp: string[]): void {
  ensureXp(s).men[c.id] = { xp: 0, lvl: 1, gp };
}

describe('crew perks: each wired perk moves its number by what it says', () => {
  const s0 = newGame('perks-wire');
  const man = crew(s0).find((c) => c.rank === 'soldier' && !c.outside)!;
  it('hustle, take, corners, evidence, rat', () => {
    const s = structuredClone(s0);
    const c = s.characters[man.id];
    const h0 = xpHustleMult(s, c);
    withPerks(s, c, ['$_margin']);
    expect(xpHustleMult(s, c) / h0).toBeCloseTo(1.05, 5);
    const t0 = xpTakeMult(s, c);
    withPerks(s, c, ['$_ledgers']);
    expect(xpTakeMult(s, c) / t0).toBeCloseTo(1.05, 5);
    withPerks(s, c, ['l_tight']);
    expect(xpCornersMult(s, c)).toBeCloseTo(1.04, 5);
    withPerks(s, c, ['$_paper']);
    expect(xpEvidenceMult(s, c)).toBeCloseTo(0.9, 5);
    withPerks(s, c, ['b_wire']);
    expect(xpRatMult(s, c)).toBeCloseTo(0.8, 5);
  });
  it('dirty-job odds: +5 on every job (Professional), +8 on muscle jobs (Mattress Veteran)', () => {
    const s = structuredClone(s0);
    const c = s.characters[man.id];
    withPerks(s, c, ['m_pro', 'm_mattress']);
    const rs = xpJobOdds(s, c, 'shakedown', 'muscle');
    expect(rs.find((r) => r.label.startsWith('His craft'))?.value).toBe(5);
    expect(rs.find((r) => r.label.startsWith('His muscle'))?.value).toBe(8);
    expect(manMod(s, c, 'jobs')).toBe(5);
  });
  it('a lieutenant\'s competence: +8 (Reads the Street)', () => {
    const s = structuredClone(s0);
    const ub = holder(s, 'underboss');
    if (!ub) return;
    ub.attributes.leadership = 50;
    ub.attributes.business = 50;
    const p0 = ltProfile(s, 'underboss')!.competence;
    withPerks(s, ub, ['l_reads']);
    expect(Math.round((ltProfile(s, 'underboss')!.competence - p0) * 100)).toBe(8);
  });
});
