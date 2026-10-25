import type { Ctl, PolPerson } from './polState';
import { LAW_BY_ID } from './polData';
import type { GameState } from './types';

/**
 * Corruption is individual. The leaf the older systems read (bribes, the
 * fixer, the Long Game, the Prosecutor): no imports beyond data, so any
 * module can use it without cycles.
 */

/** The puppet control index (design notes): clamp(influence·0.55 + (100−independence)·0.30 + (100−resentment)·0.15 − scrutiny·0.25). */
export function controlIndex(c: Pick<Ctl, 'personal' | 'financial' | 'independence' | 'resentment' | 'exposure'>): number {
  const influence = (c.personal + c.financial) / 2;
  const v = influence * 0.55 + (100 - c.independence) * 0.3 + (100 - c.resentment) * 0.15 - c.exposure * 0.25;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function controlBreakdown(c: Ctl): { label: string; value: number }[] {
  const influence = (c.personal + c.financial) / 2;
  return [
    { label: `Your influence (personal ${Math.round(c.personal)}, money ${Math.round(c.financial)})`, value: Math.round(influence * 0.55) },
    { label: `Independence ${Math.round(c.independence)}`, value: Math.round((100 - c.independence) * 0.3) },
    { label: `Resentment ${Math.round(c.resentment)}`, value: Math.round((100 - c.resentment) * 0.15) },
    { label: `Scrutiny ${Math.round(c.exposure)}`, value: -Math.round(c.exposure * 0.25) },
  ];
}

export function controlBand(ci: number): { label: string; tone: 'good' | 'mixed' | 'bad' } {
  return ci >= 70 ? { label: 'Strong (betrayal still possible)', tone: 'good' } : ci >= 40 ? { label: 'Unstable: resists big requests', tone: 'mixed' } : { label: 'Autonomous or hostile', tone: 'bad' };
}

/** The world person behind an engine character, if any. */
export function polOfChar(s: GameState, charId: string): PolPerson | undefined {
  const pol = s.pol;
  if (!pol) return undefined;
  const p = pol.people[`pc_${charId}`];
  if (p && p.charId === charId) return p;
  for (const id in pol.people) if (pol.people[id].charId === charId) return pol.people[id];
  return undefined;
}

/** Acceptance reasons for bribing an engine official: his own integrity and how far you own him. */
export function bribeReasons(s: GameState, charId: string): { label: string; value: number }[] {
  const p = polOfChar(s, charId);
  if (!p) return [];
  const out = [{ label: `Integrity ${p.integrity}`, value: -Math.round((p.integrity - 50) * 0.5) }];
  const c = s.pol!.ctl[p.id];
  if (c) {
    const ci = controlIndex(c);
    if (ci >= 40) out.push({ label: `In your pocket (control ${ci})`, value: Math.round((ci - 40) * 0.4) });
    if (c.owner) out.push({ label: `Already owned by ${c.owner}`, value: -10 });
  }
  if (s.pol?.crackdown && s.week < s.pol.crackdown.until) out.push({ label: 'War on organized crime', value: -10 });
  return out.filter((r) => r.value !== 0);
}

function holderOf(s: GameState, office: string): PolPerson | undefined {
  const id = s.pol?.offices[office]?.holders[0];
  return id ? s.pol!.people[id] : undefined;
}

/** How easily the island's cops take an envelope (the fixer's 'grease the cops'): 0.6 .. 1.4. */
export function policeEase(s: GameState): number {
  const pol = s.pol;
  if (!pol) return 1;
  const cops = Object.values(pol.people).filter((p) => p.alive && !p.retired && p.inst === 'wildwood_pd');
  if (!cops.length) return 1;
  const avg = cops.reduce((a, p) => a + p.integrity, 0) / cops.length;
  const chief = holderOf(s, 'ww_chief');
  const ci = chief && pol.ctl[chief.id] ? controlIndex(pol.ctl[chief.id]) : 0;
  return Math.max(0.6, Math.min(1.4, 1 + (55 - avg) / 80 + (ci >= 70 ? 0.15 : 0) - (pol.laws.ww_police_review !== undefined ? 0.1 : 0)));
}

/** The federal building is harder: 0.5 .. 1.1. */
export function fedEase(s: GameState): number {
  const pol = s.pol;
  if (!pol) return 1;
  const agents = Object.values(pol.people).filter((p) => p.alive && !p.retired && (p.inst === 'fbi_newark' || p.inst === 'federal_other'));
  if (!agents.length) return 1;
  const avg = agents.reduce((a, p) => a + p.integrity, 0) / agents.length;
  return Math.max(0.5, Math.min(1.1, 1 + (75 - avg) / 60));
}

/** How hard the County Prosecutor goes after you (scales his weekly move odds): 0.4 .. 1.4. */
export function lawZeal(s: GameState): number {
  const pol = s.pol;
  if (!pol) return 1;
  let z = 1;
  const pros = holderOf(s, 'cmc_prosecutor');
  if (pros) {
    const c = pol.ctl[pros.id];
    const ci = c ? controlIndex(c) : 0;
    if (ci >= 70) z -= 0.45;
    else if (ci >= 40) z -= 0.2;
    z += (pros.integrity - 60) / 200;
  }
  if (pol.crackdown && s.week < pol.crackdown.until) z += 0.3;
  return Math.max(0.4, Math.min(1.4, z));
}

/** What the political world adds to the federal case each week (officials who turned, laws in force). */
export function politicalEvidence(s: GameState): { label: string; value: number }[] {
  const pol = s.pol;
  if (!pol) return [];
  const out: { label: string; value: number }[] = [];
  const flipped = Object.entries(pol.ctl).filter(([id, c]) => c.flipped && pol.people[id]?.alive).length;
  if (flipped) out.push({ label: `${flipped} official${flipped > 1 ? 's' : ''} talking to investigators`, value: Math.min(1.5, flipped * 0.5) });
  if (s.heat.federal <= 30) return out;
  for (const id in pol.laws) {
    const law = LAW_BY_ID[id];
    if (!law) continue;
    for (const e of law.effects) if (e.kind === 'evidence') out.push({ label: `Law: ${law.name} (they have the tools)`, value: e.weekly });
  }
  return out;
}
