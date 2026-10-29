import { FACTION_NAMES } from './world';
import type { GameState } from './types';

/**
 * What a quiet look into a woman can turn up (protect.ts investigations read
 * this): only what the honey layer really holds. A woman working the boss
 * leaves a trail a good man can find; an innocent one turns out to be
 * visiting her mother. Pure but for the `reveal`, which protect.ts calls only
 * when the boss may read the report.
 */

export interface HoneyFinding {
  observation: string;
  interpretation: string;
  alternatives: string[];
  secrecy: number;
  weight: number;
  tone: 'rat' | 'talk' | 'help';
  helpful?: boolean;
  reveal: (s: GameState, lvl: 'low' | 'moderate' | 'high') => void;
}

export function honeyFinding(s: GameState, id: string, purpose: string): HoneyFinding | undefined {
  if (purpose !== 'loyalty' && purpose !== 'story' && purpose !== 'threat') return undefined;
  const H = s.honey;
  const c = s.characters[id];
  if (!H || !c || c.gender !== 'F') return undefined;
  const a = H.agents[id];
  const fam = (f: string | undefined) => (f === 'law' ? 'out of Newark' : `from the ${FACTION_NAMES[f as keyof typeof FACTION_NAMES] ?? 'other'} people`);
  const watch = (st: GameState) => (st.honey!.watch[id] ??= { id, susp: 0, signs: [] });
  if (a && (a.status === 'working' || a.status === 'fed' || a.status === 'turned')) {
    const handler = a.handler ? st(s, a.handler) : undefined;
    const observation = a.kind === 'rival' ? `${c.firstName} meets a man ${fam(a.master)} in the back of the Shamrock on Tuesday afternoons.`
      : a.kind === 'fbi' ? `${c.firstName} makes calls from the pay phone outside the Acme, to a Newark number, the morning after she sees you.`
      : a.kind === 'crew' ? `${c.firstName} goes straight from you to ${handler ?? 'one of your own men'}, and they talk for an hour.`
      : `${c.firstName} was seen getting into a car with men ${fam(a.master)}, the day after she asked how you drive home.`;
    return {
      observation, interpretation: a.kind === 'setup' ? 'She may be setting you up.' : 'She may be passing on what she hears from you.',
      alternatives: ['A woman can have friends you do not know about', 'People talk to people; it may be nothing'], secrecy: 2, weight: 5, tone: 'rat',
      reveal: (x, lvl) => { const w = watch(x); if (lvl === 'low') w.susp = Math.min(100, w.susp + 25); else { w.susp = 100; w.known ??= x.week; w.how ??= 'probe'; } },
    };
  }
  const w = H.watch[id];
  if (!w || w.susp <= 0 || w.known !== undefined) return undefined;
  return {
    observation: `${c.firstName} visits her mother in Rio Grande on Tuesdays and keeps the rest of her week to herself.`, interpretation: 'Nothing that points anywhere.',
    alternatives: [], secrecy: 1, weight: 1, tone: 'help', helpful: true,
    reveal: (x) => { const v = watch(x); v.susp = Math.max(0, v.susp - 40); v.cleared = x.week; },
  };
}

function st(s: GameState, id: string): string | undefined {
  const c = s.characters[id];
  return c ? `${c.firstName} ${c.lastName}` : undefined;
}
