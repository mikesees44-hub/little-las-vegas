import { hasTrait } from './characters';
import { adultOn } from './datingState';
import { applyEffects } from './effects';
import { looksOf } from './looks';
import { becomeMadam, hist, kickbackRate, nlog, retire, syncProvider } from './nightlife';
import { ADULT_ROLES, type NightPerson } from './nightlifeState';
import { addOpinion, opinion } from './relations';
import { ageOf, clamp, isAdultC, roll, wlog } from './womenCore';
import { tierOfRole } from './dossier';
import { ensureWomen, type Ambition, type Arc, type Dream, type WomenState } from './womenState';
import type { Ctx } from './ledger';
import type { Character, GameState } from './types';

/**
 * CAREERS AND LIFE ARCS for the working women of the night (adults only).
 *
 * Her age leans her life aim, it never decides it:
 *  - 18-22: more often fame (modeling, acting, singing) and the high end or
 *    the big clubs;
 *  - 23-29: more often security (a man who takes care of her, a family, a
 *    home);
 *  - ~30 and still working: more often her own house (a madam), getting out,
 *    or pictures (only a woman who has said so herself, and only at the
 *    period's legality: underground stag reels before 1970).
 * Her own goal (nightlife's) pulls first. Each year she takes a step toward
 * it: an audition, a bigger club, her own house, out of the life. Her pay
 * and working conditions are tracked every week, and she can quit a payroll
 * or a house at any time; nobody stops her.
 */

const GOAL_AIM: Partial<Record<NightPerson['goal'], Ambition>> = {
  act: 'fame', sing: 'fame', marry: 'security', family: 'security', home: 'security', madam: 'madam', out: 'retire', shop: 'money', club: 'money', school: 'retire',
};

/** The aim her age leans her to (deterministic per woman and age band). */
export function aimByAge(s: GameState, c: Character, p: NightPerson, age: number): { amb: Ambition; dream?: Dream } {
  const band = age <= 22 ? 'y' : age <= 29 ? 'm' : 'o';
  const r = roll(`${s.seed}:aim:${band}:${c.id}`);
  const dreamOf = (): Dream => p.role === 'singer' ? 'sing' : p.dream === 'record' ? 'sing' : p.dream === 'film' ? 'act' : (looksOf(s, c).score ?? 50) >= 70 && roll(`${s.seed}:dr:${c.id}`) < 0.6 ? 'model' : roll(`${s.seed}:dr2:${c.id}`) < 0.5 ? 'act' : 'sing';
  const own = GOAL_AIM[p.goal];
  // Her own goal pulls first half the time; the age band the rest.
  if (own && roll(`${s.seed}:own:${band}:${c.id}`) < 0.5) return own === 'fame' ? { amb: own, dream: dreamOf() } : { amb: own };
  if (band === 'y') return r < 0.6 ? { amb: 'fame', dream: dreamOf() } : r < 0.85 ? { amb: 'money' } : { amb: 'security' };
  if (band === 'm') return r < 0.5 ? { amb: 'security' } : r < 0.65 ? { amb: 'fame', dream: dreamOf() } : r < 0.85 ? { amb: 'money' } : r < 0.95 && p.role !== 'street' ? { amb: 'madam' } : { amb: 'retire' };
  const films = !!p.adultOk && adultOn(s);
  return r < 0.35 ? { amb: 'madam' } : r < 0.65 ? { amb: 'retire' } : r < 0.8 && films ? { amb: 'films' } : r < 0.95 ? { amb: 'security' } : { amb: 'money' };
}

const WORKS = (p: NightPerson) => p.status === 'active' && ['escort', 'callgirl', 'street', 'dancer', 'singer', 'madam'].includes(p.role);

/** Working conditions 0-100: her tier, her house, the heat, the cut, her man, how the boss treats her. */
export function conditionsOf(s: GameState, p: NightPerson): number {
  const tier = tierOfRole(p.role);
  let v = tier === 'high' ? 72 : tier === 'club' ? 62 : tier === 'call' ? 56 : tier === 'street' ? 30 : 60;
  const h = p.house ? s.nightlife?.houses[p.house] : undefined;
  if (h) { v -= h.heat / 4; if (h.with !== 'none') v += 6; if (h.squeeze) v -= 10; }
  if (p.payroll) v -= kickbackRate(p.earn) * 40;
  if (p.fam.temper === 'volatile') v -= 10;
  if (p.scorned !== undefined && s.week - p.scorned < 26) v -= 12;
  if (p.afraid !== undefined && s.week - p.afraid < 26) v -= 15;
  return clamp(v);
}

/** What she keeps of a week's work, roughly. */
export function payOf(p: NightPerson): number {
  const house = p.house ? Math.round(p.earn * 0.4) : 0;
  const kick = p.payroll ? Math.round(p.earn * kickbackRate(p.earn)) : 0;
  return Math.max(0, p.earn - house - kick);
}

/** The arc for a working woman (created the first time). */
export function arcFor(s: GameState, W: WomenState, p: NightPerson, c: Character): Arc {
  let a = W.arcs[p.id];
  if (!a) {
    const aim = aimByAge(s, c, p, ageOf(s, c));
    a = { amb: aim.amb, dream: aim.dream, set: s.week, cond: conditionsOf(s, p), pay: payOf(p), steps: 0 };
    W.arcs[p.id] = a;
  }
  return a;
}

/** Weekly: conditions and pay; she may walk away from a payroll or a house (voluntary, any time). */
export function careersWeek(ctx: Ctx, W: WomenState): void {
  const s = ctx.s;
  const N = s.nightlife;
  if (!N) return;
  for (const p of Object.values(N.people)) {
    const c = s.characters[p.id];
    if (!c?.alive || !isAdultC(s, c)) { delete W.arcs[p.id]; continue; }
    if (!WORKS(p)) continue;
    const a = arcFor(s, W, p, c);
    a.cond = conditionsOf(s, p);
    a.pay = payOf(p);
    const op = opinion(s, c.id, s.playerId);
    const r = roll(`${s.seed}|${s.week}|wquit|${p.id}`);
    if (p.payroll && (a.cond < 35 || p.loyalty < 20 || op < -40) && r < 0.06) {
      p.payroll = undefined;
      a.quit = s.week;
      W.stats.quit++;
      hist(p, s, 'Walked away from your payroll. Her money is her own now.');
      const line = `${c.firstName} ${c.lastName} quit your payroll (${a.cond < 35 ? 'the conditions' : 'how she has been treated'}). That is her right.`;
      nlog(N, s, line);
      wlog(W, s, line);
      ctx.log.push(line);
    } else if (p.house && p.role !== 'madam' && a.cond < 28 && r < 0.05) {
      const h = N.houses[p.house];
      p.house = undefined;
      a.quit = s.week;
      W.stats.quit++;
      hist(p, s, `Left ${h?.name ?? 'her house'}; works for herself now.`);
      const line = `${c.firstName} ${c.lastName} left ${h?.name ?? 'her house'} to work for herself.`;
      nlog(N, s, line);
      wlog(W, s, line);
      syncProvider(s, p);
    }
  }
}

/** Her year: the aim moves with her age band; a step toward it. Spread over the year by her id. */
export function careersYear(ctx: Ctx, W: WomenState): void {
  const s = ctx.s;
  const N = s.nightlife;
  if (!N) return;
  for (const p of Object.values(N.people)) {
    if (!WORKS(p)) continue;
    // Her week of the year (offset from nightlife's own yearly week).
    const k = (s.week + 26 + (roll(`${s.seed}:wyear:${p.id}`) * 52 | 0)) % 52;
    if (k !== 0) continue;
    const c = s.characters[p.id];
    if (!c?.alive || !isAdultC(s, c)) continue;
    const a = arcFor(s, W, p, c);
    const age = ageOf(s, c);
    // A new band can change her mind (not always).
    const band = age <= 22 ? 'y' : age <= 29 ? 'm' : 'o';
    const moved = age === 23 || age === 30 || roll(`${s.seed}:band:${c.id}:${s.date.y}`) < 0.15;
    if (moved && s.week - a.set >= 40) {
      const aim = aimByAge(s, c, p, age);
      if (aim.amb !== a.amb) {
        a.amb = aim.amb;
        a.dream = aim.dream;
        a.set = s.week;
        hist(p, s, band === 'm' ? 'Talks less about the pictures and more about a home.' : band === 'o' ? 'Thinks about what comes after the life.' : 'Has big plans.');
      }
    }
    step(ctx, W, p, c, a, age);
  }
}

function step(ctx: Ctx, W: WomenState, p: NightPerson, c: Character, a: Arc, age: number): void {
  const s = ctx.s;
  const N = s.nightlife!;
  const r = (x: string) => roll(`${s.seed}|${s.date.y}|wstep|${x}|${p.id}`);
  const say = (line: string) => { hist(p, s, line); nlog(N, s, `${c.firstName} ${c.lastName}: ${line}`); wlog(W, s, `${c.firstName} ${c.lastName}: ${line}`); };
  switch (a.amb) {
    case 'fame': {
      const odds = 0.15 + p.talent / 250 + ((looksOf(s, c).score ?? 50) - 50) / 400;
      if (r('fame') < odds) {
        a.steps++;
        if (a.dream === 'model' && age <= 26) { p.savings += 600; say('Booked as a model for a department-store catalog in Philadelphia.'); }
        else if (p.role === 'dancer') { p.venue = 'Club Paree'; say('Moved up to the big room at Club Paree: the headline spot in the revue.'); }
        else if (r('break') < 0.25) {
          p.role = a.dream === 'sing' ? 'recording' : 'actress';
          p.price = 0;
          p.payroll = undefined;
          N.stats.careers++;
          say(a.dream === 'sing' ? 'Signed a record deal on her own: a single for the summer.' : 'Got a part in a picture on her own, a small one. She is going to New York.');
          syncProvider(s, p);
        } else say(`An audition (${a.dream === 'sing' ? 'a band singer\'s spot' : 'a screen test'}): not this time. She keeps at it.`);
      }
      break;
    }
    case 'security': {
      if ((p.fam.st === 'married' || p.fam.st === 'steady') && ADULT_ROLES.includes(p.role) && r('settle') < 0.3) {
        a.steps++;
        retire(s, N, p, c, 'Settled down with her man and got out of the life.');
        wlog(W, s, `${c.firstName} ${c.lastName} settled down and got out of the life.`);
      } else if (r('look') < 0.3) hist(p, s, 'Says she wants a man who will take care of her. Not a customer.');
      break;
    }
    case 'madam': {
      if (p.role !== 'madam' && age >= 27 && p.savings >= 9000 && r('madam') < 0.25) {
        a.steps++;
        p.savings -= 4000;
        becomeMadam(s, N, p, c);
        wlog(W, s, `${c.firstName} ${c.lastName} opened a house of her own. She may want a partner or protection: her choice.`);
        if (opinion(s, c.id, s.playerId) > 10) addOpinion(s, c.id, s.playerId, 'He let me go my own way', 4, 1);
      }
      break;
    }
    case 'retire': {
      if (p.role !== 'madam' && p.savings >= 5000 && r('ret') < 0.5) {
        a.steps++;
        p.savings -= 2000;
        retire(s, N, p, c, 'Got out of the life with something put by.');
        wlog(W, s, `${c.firstName} ${c.lastName} got out of the life.`);
      }
      break;
    }
    case 'films': {
      if (p.adultOk && adultOn(s) && age >= 21 && p.role !== 'adultfilm' && r('films') < 0.3) {
        a.steps++;
        p.role = 'adultfilm';
        p.price = 0;
        p.payroll = undefined;
        say(s.date.y < 1970 ? 'Made a stag reel in a Camden apartment, on her own terms. It is illegal in 1960, and she knows it.' : 'Signed with an adult-picture outfit on her own terms.');
        if (s.date.y < 1970) applyEffects(ctx, [{ type: 'heat', bar: 'local', amount: 1, label: 'A stag reel made on the island' }], { label: 'Stag reels', because: 'let the island get a reputation', category: 'event' });
        syncProvider(s, p);
      }
      break;
    }
    case 'money':
      if (hasTrait(c, 'Greedy') && r('rate') < 0.4) { p.price = Math.round(p.price * 1.1); say('Raised her rate.'); }
      break;
  }
}

export { ensureWomen };
