import { ageOn } from '../../engine/calendar';
import { knownEars } from '../../engine/ears';
import type { CutTier } from '../../engine/earsState';
import { connectionsOf } from '../../engine/earsWeb';
import type { Character, GameState } from '../../engine/types';
import type { MenuGroupId, MenuItem } from '../sheet/menuCatalog';

/**
 * The person menu's "The Ears" category (menuCatalog.ts calls this): ask an
 * Ear about a man, a dance or VIP time, his connections; take care of an Ear;
 * the Madam's diplomacy; going after an operator.
 */
export function addEarsItems(s: GameState, c: Character, add: (id: MenuGroupId, item: MenuItem) => void): void {
  const E = s.ears;
  if (!E || !c.alive || c.id === s.playerId) return;
  const ear = E.ears[c.id];
  const isMadam = E.madam.id === c.id;
  const op = E.ops[c.id];
  const man = c.gender === 'M' && ageOn(c.birth, s.date) >= 21 && !ear;
  if (man && !(c.dynasty && c.faction === 'player')) {
    const n = knownEars(s).length;
    add('spies', { key: 'ears:close', open: { type: 'ears', mode: 'close' }, label: 'Can you get close to him?…', text: n ? `Ask one of your ${n} Ears to sit near ${c.firstName} for a few weeks and tell you what she hears. She decides.` : 'You do not know any of the Ears yet.' });
    add('spies', { key: 'ears:dance', open: { type: 'ears', mode: 'dance' }, label: 'Give him a dance, some VIP time…', text: `One night at the club with ${c.firstName}; afterwards she tells you what she heard and what she thinks of him.` });
    if (E.madam.favors > 0) add('spies', { key: 'ears:favor', action: { kind: 'ears', op: { op: 'madamFavor', targetId: c.id } } });
  }
  if (ear && ear.known && ear.status !== 'gone') {
    add('nightlife', { key: 'ear:retain', action: { kind: 'ears', op: { op: 'retain', earId: c.id } } });
    if (ear.underOp && !ear.protectedFrom) add('nightlife', { key: 'ear:protect', action: { kind: 'ears', op: { op: 'protect', earId: c.id } } });
  }
  if (isMadam) {
    add('nightlife', { key: 'madam:call', action: { kind: 'ears', op: { op: 'madamCall' } } });
    add('nightlife', { key: 'madam:intel', action: { kind: 'ears', op: { op: 'madamIntel', on: !E.madam.intel } } });
    for (const t of [0, 1, 2, 3] as CutTier[]) if (t !== E.madam.cut) add('nightlife', { key: `madam:cut${t}`, action: { kind: 'ears', op: { op: 'madamCut', tier: t } } });
    if (!E.madam.venture) add('nightlife', { key: 'madam:venture', action: { kind: 'ears', op: { op: 'madamVenture', kind: 'stake' } } });
  }
  if (op && op.stage === 'active') {
    for (const k of ['opDig', 'opMadam', 'opExpose', 'opRunoff'] as const) add('spies', { key: `op:${k}`, action: { kind: 'ears', op: { op: k, opId: op.id } }, hostile: k === 'opRunoff' });
  }
  if (connectionsOf(s, c.id).length || man || ear || isMadam) add(man ? 'spies' : 'nightlife', { key: 'ears:web', open: { type: 'ears', mode: 'web' }, label: 'Connections…', text: `Whom ${c.firstName} is attached to, as far as you know.` });
  if (isMadam || ear || op) add('nightlife', { key: 'ears:go', open: { type: 'go', to: 'town.night', label: 'The Night…' }, text: 'The Madam, the Ears and the operators.' });
}
