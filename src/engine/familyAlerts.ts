import { honoreeOptions } from './activities';
import { ageOn } from './calendar';
import { player } from './characters';
import { chooseHeir } from './dynasty';
import { LEGACY_TRACKS, nextPerkCost } from './familyLegacy';
import { fam } from './familyState';
import { stressLevel } from './familyStress';
import type { Alert } from './alerts';
import type { GameState } from './types';

/** Alert-rail items from the dynasty layer (pure). */
export function familyAlerts(s: GameState): Alert[] {
  if (!s.dyn || s.gameOver) return [];
  const out: Alert[] = [];
  const boss = player(s);
  const st = fam(s, boss.id).stress;
  if (stressLevel(st) >= 2) out.push({ kind: 'family', severity: 'warn', title: 'The pressure is showing', text: `Your stress is ${st}. Host something, or it will break you.`, tab: 'family' });
  const heir = chooseHeir(s, boss).heir;
  if (heir && !heir.spouseId && ageOn(heir.birth, s.date) >= 21 && fam(s, heir.id).path !== 'priest') out.push({ kind: 'family', severity: 'info', title: `${heir.firstName} needs a match`, text: 'Your heir is unmarried. A strong house is an alliance.', tab: 'family' });
  const wed = honoreeOptions(s, 'wedding')[0];
  if (wed && !s.dyn.activity) out.push({ kind: 'family', severity: 'info', title: `A wedding to throw`, text: `${wed.firstName} married. Weddings are where business gets done.`, tab: 'family' });
  const cheapest = Math.min(...LEGACY_TRACKS.map((t) => nextPerkCost(s, t) ?? Infinity));
  if (s.dyn.renown >= cheapest) out.push({ kind: 'family', severity: 'info', title: 'Renown to spend', text: `${Math.round(s.dyn.renown)} renown: take up a legacy for the house.`, tab: 'family' });
  return out;
}
