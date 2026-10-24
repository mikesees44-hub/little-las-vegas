import { CITIES_BY_ID } from './cities';
import { displayName } from './characters';
import { applyEffects } from './effects';
import { money, type Ctx } from './ledger';
import { chance, rand, randInt } from './rng';
import type { Character, Effect, Scheme } from './types';

/**
 * Envoys to other cities (see cities.ts). An envoy is a scheme (agents,
 * weeks, odds); this module decides what he brings home and pays the
 * outposts' weekly cut through the ledger.
 */

/**
 * An envoy comes home. A good roll opens a franchise (your own business
 * there), a decent one a partnership (a weekly cut), a bare one a contact
 * (standing and a favor). A bad roll means trouble.
 */
export function resolveEnvoy(ctx: Ctx, sc: Scheme, p: number, agents: Character[]): void {
  const s = ctx.s;
  const c = CITIES_BY_ID[sc.opts.city ?? 'capemay'];
  if (!c) return;
  const envoy = agents[0];
  const label = `Envoy: ${c.name}`;
  const roll = rand(s);
  const margin = p - roll;
  const existing = s.outposts.find((o) => o.city === c.id);
  if (margin > 0) {
    const kind: 'franchise' | 'partner' | 'contact' = margin > 0.35 ? 'franchise' : margin > 0.15 ? 'partner' : 'contact';
    const rank = { contact: 0, partner: 1, franchise: 2 };
    const best = existing && rank[existing.kind] >= rank[kind] ? existing.kind : kind;
    const income = best === 'franchise' ? Math.round(c.income * 1.6) : best === 'partner' ? c.income : 0;
    s.outposts = s.outposts.filter((o) => o.city !== c.id);
    s.outposts.push({ city: c.id, kind: best, income, since: s.week, envoyId: envoy?.id });
    const eff: Effect[] = [{ type: 'standing', city: c.id, amount: kind === 'contact' ? 20 : 30 }, { type: 'respect', amount: kind === 'franchise' ? 4 : 2 }];
    if (kind === 'contact') eff.push({ type: 'favor', amount: 1 });
    applyEffects(ctx, eff.map((e) => (e.label ? e : { ...e, label })), { label, because: sc.because, category: 'event' });
    ctx.log.push(kind === 'franchise' ? `${envoy ? displayName(envoy) : 'Your envoy'} came back from ${c.name} with a franchise: your own place there, under ${c.owner}'s eye.` : kind === 'partner' ? `${c.owner} cut you into their action in ${c.name}: a weekly envelope.` : `${envoy ? displayName(envoy) : 'Your envoy'} made friends in ${c.name}. A contact, and a favor owed.`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The house opened a ${best === 'partner' ? 'partnership' : best} in ${c.name}.`, because: sc.because, becauseWeek: sc.startWeek, kind: 'misc' });
    return;
  }
  // Trouble.
  const eff: Effect[] = [{ type: 'standing', city: c.id, amount: -15 }, { type: 'respect', amount: -2 }];
  if (envoy && chance(s, 0.25) && envoy.id !== s.playerId) {
    eff.push({ type: 'imprison', charId: envoy.id, weeks: randInt(s, 8, 30) });
    ctx.log.push(`${displayName(envoy)} was picked up by the ${c.name} police on a vagrancy charge. Somebody tipped them.`);
  } else if (envoy && chance(s, 0.15) && envoy.id !== s.playerId) {
    eff.push({ type: 'kill', charId: envoy.id, cause: `found in a ${c.name} rail yard — the locals did not want company`, killer: 'none' });
    if (s.cutscenes.length < 2) s.cutscenes.push({ key: 'funeral', title: `${c.name}`, text: `They sent ${envoy.firstName} home in a box.`, week: s.week });
  } else {
    if (envoy) envoy.health = Math.max(10, envoy.health - 20);
    ctx.log.push(`${c.owner} sent your envoy home from ${c.name} with a broken nose.`);
  }
  applyEffects(ctx, eff.map((e) => (e.label ? e : { ...e, label })), { label, because: sc.because, category: 'event' });
}

/** Weekly outpost income. */
export function outpostIncome(ctx: Ctx): number {
  let total = 0;
  for (const o of ctx.s.outposts) {
    if (!o.income) continue;
    const name = CITIES_BY_ID[o.city]?.name ?? o.city;
    total += money(ctx, o.income, `Outpost: ${name}${o.kind === 'franchise' ? ' (franchise)' : ' (partnership)'}`, 'business');
  }
  return total;
}

