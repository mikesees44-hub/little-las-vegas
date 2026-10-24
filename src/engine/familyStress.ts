import { displayName, hasTrait } from './characters';
import { fam, famMut, type Coping, type StressSource } from './familyState';
import type { Character, Choice, Effect, EventInstance, GameState, PlayerAction } from './types';

/**
 * Stress (CK3): 0-100 with breaking points at 33, 66 and 100. Stress comes
 * from acting against your nature and from losses, in four sources (from the
 * old Omertà meters): the IRS, paranoia, honor and home. Activities and
 * coping habits relieve it. Each breaking point forces a choice of how the
 * man copes — and the habit stays with him.
 */

export const STRESS_THRESHOLDS = [33, 66, 100];
export const STRESS_SOURCE_NAME: Record<StressSource, string> = {
  irs: 'The IRS and the money',
  paranoia: 'Paranoia',
  honor: 'Honor and conscience',
  domestic: 'Home and family',
};

export const COPING_INFO: Record<Coping, { name: string; text: string; trait?: Character['traits'][number] }> = {
  Drinker: { name: 'The bottle', text: 'A rye at noon. Relieves 6 stress a month; health suffers.', trait: 'Drinker' },
  Gambler: { name: 'The tables', text: 'Cards at the Starlight. Relieves 6 stress a month; costs money.', trait: 'Gambler' },
  Temper: { name: 'Temper', text: 'Takes it out on people. Relieves 6 stress a month; the crew gets the back of his hand.', trait: 'Hot-headed' },
  Insomniac: { name: 'Insomnia', text: 'Walks the boardwalk at 4 a.m. Relieves nothing; health suffers a little.' },
  Devout: { name: 'Faith', text: 'First pew at St. Ann\'s, every morning. Relieves 6 stress a month.', trait: 'Pious' },
};

export function stressLevel(stress: number): number {
  return STRESS_THRESHOLDS.filter((t) => stress >= t).length;
}

/** Engine-side: change someone's stress, recording the source. Returns the applied change. */
export function addStress(s: GameState, charId: string, amount: number, source: StressSource): number {
  const c = s.characters[charId];
  if (!c?.alive || !amount) return 0;
  const p = famMut(s, charId);
  const before = p.stress;
  p.stress = Math.max(0, Math.min(100, Math.round(p.stress + amount)));
  const applied = p.stress - before;
  if (applied > 0) p.stressSrc[source] = (p.stressSrc[source] ?? 0) + applied;
  if (applied < 0) {
    // Relief comes off every source in proportion.
    const tot = Object.values(p.stressSrc).reduce((a, b) => a + b, 0);
    if (tot > 0) for (const k of Object.keys(p.stressSrc) as StressSource[]) p.stressSrc[k] = Math.max(0, Math.round(p.stressSrc[k] + (applied * p.stressSrc[k]) / tot));
  }
  return applied;
}

/** The biggest source of someone's stress. */
export function topSource(s: GameState, charId: string): StressSource {
  const src = fam(s, charId).stressSrc;
  return (Object.keys(src) as StressSource[]).sort((a, b) => src[b] - src[a])[0] ?? 'domestic';
}

/**
 * Stress a chosen event option causes the boss, from his traits. Returns
 * [amount, source, why] or undefined. Positive = stress, negative = relief.
 */
export function choiceStress(_s: GameState, boss: Character, ch: Choice): [number, StressSource, string] | undefined {
  const eff = ch.effects;
  const kills = eff.some((e) => e.type === 'kill' && e.killer === 'player') || /killed|whack|example of/i.test(ch.because);
  if (kills) {
    if (hasTrait(boss, 'Pious')) return [15, 'honor', 'ordered a killing against his faith'];
    if (hasTrait(boss, 'Cowardly')) return [10, 'paranoia', 'ordered a killing and waits for the knock'];
    if (hasTrait(boss, 'Honest')) return [8, 'honor', 'ordered a killing'];
    if (hasTrait(boss, 'Cruel')) return [-5, 'honor', 'enjoyed the work'];
  }
  const spent = eff.filter((e): e is Extract<Effect, { type: 'money' }> => e.type === 'money' && e.amount < 0).reduce((a, e) => a - e.amount, 0);
  if (spent >= 3000 && hasTrait(boss, 'Greedy')) return [5, 'irs', 'parted with real money'];
  const familyHurt = eff.some((e) => e.type === 'familyOpinion' && e.amount < 0);
  if (familyHurt && (hasTrait(boss, 'Loyal-to-a-fault') || hasTrait(boss, 'Pious'))) return [4, 'domestic', 'put business before family'];
  const backDown = eff.some((e) => e.type === 'respect' && e.amount < 0);
  if (backDown && (hasTrait(boss, 'Hot-headed') || hasTrait(boss, 'Vengeful'))) return [5, 'honor', 'swallowed his pride'];
  if (/narcotic|heroin/i.test(ch.because) && (hasTrait(boss, 'Pious') || hasTrait(boss, 'Honest'))) return [10, 'honor', 'went against Bruno\'s rule'];
  if (/bribe|paid off|grease/i.test(ch.because) && hasTrait(boss, 'Honest')) return [4, 'honor', 'paid a bribe'];
  if (/donat|church|parish/i.test(ch.because) && hasTrait(boss, 'Pious')) return [-4, 'honor', 'did right by the parish'];
  if (/lay low|laid low/i.test(ch.because) && hasTrait(boss, 'Paranoid')) return [-3, 'paranoia', 'kept his head down'];
  return undefined;
}

/** Stress from orders (whacking someone, murder schemes). */
export function actionStress(_s: GameState, boss: Character, a: PlayerAction): [number, StressSource, string] | undefined {
  const murder = (a.kind === 'interact' && a.id === 'whack') || (a.kind === 'scheme' && a.scheme === 'murder');
  if (murder) {
    if (hasTrait(boss, 'Pious')) return [12, 'honor', 'ordered a killing against his faith'];
    if (hasTrait(boss, 'Cowardly')) return [8, 'paranoia', 'ordered a killing'];
  }
  if (a.kind === 'interact' && (a.id === 'gift_large' || a.id === 'bribe') && hasTrait(boss, 'Greedy')) return [3, 'irs', 'handed out money'];
  return undefined;
}

/** The breaking-point event: how does he cope? */
export function buildBreakingPoint(s: GameState, c: Character, level: number): EventInstance {
  const p = fam(s, c.id);
  const src = topSource(s, c.id);
  const isBoss = c.id === s.playerId;
  const who = isBoss ? 'You' : displayName(c);
  const options: Coping[] = (['Drinker', 'Gambler', 'Temper', 'Devout', 'Insomniac'] as Coping[]).filter((k) => !p.coping.includes(k));
  const label = `Breaking point: ${c.firstName}`;
  const relief = level >= 3 ? -40 : -25;
  const severe: Effect[] = level >= 3 ? [{ type: 'health', charId: c.id, amount: -12, label }] : [];
  const choices: Choice[] = options.slice(0, 4).map((k) => ({
    id: k,
    label: COPING_INFO[k].name,
    detail: COPING_INFO[k].text,
    because: `coped with the pressure through ${COPING_INFO[k].name.toLowerCase()}`,
    effects: [
      { type: 'dyn', op: { op: 'coping', charId: c.id, coping: k }, label } as Effect,
      { type: 'dyn', op: { op: 'stress', charId: c.id, amount: relief, source: src }, label } as Effect,
      ...severe,
      ...(k === 'Temper' ? [{ type: 'crewOpinion', amount: -3, reason: 'The boss has a temper lately', label } as Effect] : []),
    ],
  }));
  if (!choices.length) {
    choices.push({ id: 'endure', label: 'Endure it', because: 'endured', effects: [{ type: 'dyn', op: { op: 'stress', charId: c.id, amount: relief, source: src }, label }, ...severe] });
  }
  const text = level >= 3
    ? `${who} ${isBoss ? 'have' : 'has'} not slept in four days. ${STRESS_SOURCE_NAME[src]} is eating ${isBoss ? 'you' : 'him'} alive, and the doctor at Burdette Tomlin talks about the heart. Something has to give.`
    : level === 2
      ? `${who} snapped at the kids at Sunday dinner and did not apologize. ${STRESS_SOURCE_NAME[src]} weighs on ${isBoss ? 'you' : 'him'} every hour of the day.`
      : `The pressure is starting to show. ${STRESS_SOURCE_NAME[src]} keeps ${isBoss ? 'you' : 'him'} up at night.`;
  return {
    iid: `ev${s.nextId++}`, defId: 'dyn_breaking', week: s.week, mandatory: true, priority: 74,
    title: `Breaking point (${['', 'strained', 'cracking', 'at the edge'][level]})`, text, defaultChoiceId: choices[0].id,
    meta: { subject: c.id, level }, actors: [c.id], choices,
  };
}
