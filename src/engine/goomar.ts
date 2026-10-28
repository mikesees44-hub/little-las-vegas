import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, player } from './characters';
import { maybeConceive } from './dating';
import { datingEvenings, ensureDating } from './datingState';
import { roundSlots } from './rounds';
import { applyEffects } from './effects';
import { addOpinion } from './relations';
import { endRomance, kin, romanceBetween } from './romance';
import { addSecret } from './secrets';
import { spendPocket } from './pocket';
import { hashSeed } from './rng';
import { APARTMENTS } from './nightlifeData';
import { NGOAL_TEXT, type Goomar, type NightlifeState } from './nightlifeState';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Ctx } from './ledger';
import type { NightOp } from './nightlife';
import type { Character, Effect, FactionId, GameState } from './types';

/**
 * THE GOOMAR (CK3's concubine, the island's way): a kept mistress with her
 * own apartment and an allowance, paid every week from the boss's pocket.
 *
 * Only with an adult already in a relationship with the boss (dating,
 * committed, or an affair: romance.ts) who agrees: she decides, from her
 * feelings, her own life (a husband, kids, her faith, her lines) and what
 * he offers. A paid evening never makes one. Her place is a refuge (stress
 * relief, evenings together; a child is possible at the pregnancy setting's
 * odds, less if she is careful); the risks are real (his wife finds out, a
 * rival family gets a lever, it becomes talk and Philadelphia frowns). She
 * can leave: when the money stops, when he is never there, when her
 * feelings go. He can end it. NPC bosses keep theirs (nightlife.ts).
 * Non-explicit: report lines only.
 */

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const NX = (op: NightOp, label: string): Effect => ({ type: 'nightlife', op, label }) as Effect;
const roll = (k: string) => (hashSeed(k) % 100003) / 100003;
const adult = (s: GameState, c: Character | undefined): c is Character => !!c && ageOn(c.birth, s.date) >= 18;

function nlog(N: NightlifeState, s: GameState, text: string): void {
  N.log.push([s.week, text]);
  if (N.log.length > 60) N.log.splice(0, N.log.length - 60);
}

export function goomarOf(s: GameState, id: string): Goomar | undefined {
  const g = s.nightlife?.goomars[id];
  return g && !g.ended ? g : undefined;
}

export function isGoomar(s: GameState, id: string): boolean {
  return !!goomarOf(s, id);
}

export function activeGoomars(s: GameState): Goomar[] {
  return Object.values(s.nightlife?.goomars ?? {}).filter((g) => !g.ended);
}

/** Her terms, fixed per woman: where the apartment is, the rent, the allowance (weekly, from your pocket). */
export function goomarTerms(s: GameState, id: string): { where: string; rent: number; allowance: number; upfront: number } {
  const k = hashSeed(`${s.seed}:goomar:${id}`);
  const where = APARTMENTS[k % APARTMENTS.length];
  const rent = 20 + (k % 4) * 5;
  const p = s.nightlife?.people[id];
  const allowance = p && (p.role === 'escort' || p.role === 'singer') ? 120 : 75;
  return { where, rent, allowance, upfront: 300 };
}

/** Evenings left this week (the dating layer's evenings: dates, paid company and the goomars share them). */
export function eveningsLeft(s: GameState): number {
  return roundSlots(s).slots - datingEvenings(s);
}

/** Asking her (and each evening at her place you choose) takes one of the week's evenings. */
function useEvening(s: GameState): void {
  const D = ensureDating(s);
  if (D.evenings.week !== s.week) D.evenings = { week: s.week, n: 0 };
  D.evenings.n++;
}

function wifeOf(s: GameState): Character | undefined {
  const b = player(s);
  const w = b.spouseId ? s.characters[b.spouseId] : undefined;
  return w?.alive ? w : undefined;
}

/** Why the boss can't ask her (undefined: he can). `quiet`: for sorting only. */
export function goomarBlock(s: GameState, id: string, _quiet = false): string | undefined {
  const boss = player(s);
  const c = s.characters[id];
  if (!c?.alive) return 'Not here';
  if (!adult(s, c) || !adult(s, boss)) return 'Adults only';
  if (c.id === boss.id) return 'That is you';
  if (kin(boss, c)) return 'Family';
  if (boss.spouseId === c.id) return 'She is your wife';
  if (!boss.alive || !isFree(s, boss)) return 'You are inside';
  if (isGoomar(s, id)) return 'She is already your goomar';
  if (!romanceBetween(s, boss.id, c.id)) return `Only with someone you are already seeing: ask ${c.firstName} out first (Relationships & Dating)`;
  if (!isFree(s, c)) return 'She is in jail';
  if (eveningsLeft(s) <= 0) return 'No evenings left this week (asking her takes one)';
  return undefined;
}

/** Her answer, with every reason (never above 85%). */
export function goomarAcceptance(s: GameState, c: Character): Acceptance {
  const boss = player(s);
  const p = s.nightlife?.people[c.id];
  if (p?.bounds.includes('no_married') && wifeOf(s)) return { chance: 0, reasons: [{ label: 'Will not get involved with a married man', value: -100 }] };
  const b = s.dating?.bonds[c.id];
  const reasons: Reason[] = [];
  const aff = b?.aff ?? 30;
  reasons.push({ label: `Her feelings for you: ${aff}`, value: Math.round((aff - 30) * 0.6) });
  if (p?.attach) reasons.push({ label: 'Attached to you', value: Math.round(p.attach * 0.15) });
  if (p && (p.goal === 'home' || p.goal === 'shop' || p.goal === 'out')) reasons.push({ label: `Wants security (${NGOAL_TEXT[p.goal].toLowerCase()})`, value: 10 });
  if (p?.goal === 'marry') reasons.push({ label: 'Wants a husband, not an apartment', value: -15 });
  reasons.push({ label: 'An apartment and an allowance', value: 8 });
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  if (sp?.alive) reasons.push({ label: p?.fam.away ? `Her husband is away (${p.fam.away})` : `She has a husband, ${sp.firstName}`, value: p?.fam.away ? -8 : -25 });
  if (p?.fam.kids.some((k) => s.date.y - k.y < 18)) reasons.push({ label: 'Her kids come first', value: -5 });
  if (hasTrait(c, 'Pious')) reasons.push({ label: 'Pious', value: -20 });
  if (hasTrait(c, 'Ambitious')) reasons.push({ label: 'Ambitious', value: 5 });
  if (wifeOf(s)) reasons.push({ label: 'You are married, and she knows it', value: -5 });
  if (hasTrait(boss, 'Charming')) reasons.push({ label: 'You are Charming', value: 8 });
  if (hasTrait(boss, 'Cruel')) reasons.push({ label: 'People say you can be cruel', value: -15 });
  const others = activeGoomars(s).filter((g) => g.id !== c.id).length;
  if (others) reasons.push({ label: `You already keep ${others} other${others === 1 ? '' : 's'}`, value: -8 * others });
  const pocket = s.tribute?.acct.personal ?? 0;
  const t = goomarTerms(s, c.id);
  if (pocket < (t.rent + t.allowance) * 8) reasons.push({ label: 'Your pocket looks thin for it', value: -10 });
  const sum = reasons.reduce((a, r) => a + r.value, 20);
  return { chance: Math.max(0.05, Math.min(0.85, sum / 100)), reasons: [{ label: 'Base', value: 20 }, ...reasons.filter((r) => r.value !== 0)] };
}

export function previewGoomar(s: GameState, id: string): ActionPreview {
  const c = s.characters[id];
  const base: ActionPreview = { title: `Make ${c?.firstName ?? 'her'} your goomar`, effects: [], cost: 0, because: `asked ${c?.firstName ?? 'her'} to be your goomar`, category: 'event' };
  if (!c) return { ...base, disabledReason: 'Not here' };
  const t = goomarTerms(s, id);
  const wife = wifeOf(s);
  const weekly = t.rent + t.allowance;
  return {
    ...base, cost: t.upfront, pot: 'pocket',
    detail: `${activeGoomars(s).length ? `You keep ${activeGoomars(s).length} already; each one is her own arrangement, her own costs, and they may not like sharing you. ` : ''}Asking takes one of your evenings this week (${Math.max(0, eveningsLeft(s))} left). Ask ${displayName(c)} to be your goomar: ${t.where} in her name, ${$(t.rent)} a week rent and a ${$(t.allowance)} allowance, ${$(weekly)} a week from your pocket (${$(t.upfront)} now to furnish it). She decides; if she says no, nothing is paid. Her place is somewhere to breathe (less stress) and evenings together${s.dating?.settings.pregnancy !== 'off' ? '; a child is possible at your pregnancy setting\'s odds' : ''}. She can leave: if the money stops, if you are never there, if her feelings go. You can end it any time.`,
    effects: [{ type: 'money', pot: 'pocket', amount: -t.upfront, label: `Furnishing ${c.firstName}'s apartment` }, NX({ op: 'goomar', id, rent: t.rent, allowance: t.allowance, where: t.where }, `${c.firstName}, your goomar`)],
    acceptance: goomarBlock(s, id) ? undefined : goomarAcceptance(s, c),
    refuseEffects: [NX({ op: 'refused', id, what: 'being your goomar' }, `${c.firstName} said no`)],
    warning: `Risks: ${wife ? `${wife.firstName} may find out (more likely the more you keep, and the more openly); ` : ''}${activeGoomars(s).length ? 'the others may hear of her and be jealous; ' : ''}a rival family may learn of it and use it; if it becomes talk, Philadelphia thinks less of a boss who can't keep it quiet.`,
    disabledReason: goomarBlock(s, id),
    verb: `Ask ${c.firstName} — ${$(t.upfront)} now, ${$(weekly)}/wk`,
  };
}

export function previewEndGoomar(s: GameState, id: string): ActionPreview {
  const c = s.characters[id];
  const g = goomarOf(s, id);
  const gift = 500;
  return {
    title: `End it with ${c?.firstName ?? 'her'}, decently`, effects: g && c ? [{ type: 'money', pot: 'pocket', amount: -gift, label: `Seeing ${c.firstName} right` }, NX({ op: 'endGoomar', id, gift }, `It ended with ${c.firstName}`)] : [], cost: gift, pot: 'pocket',
    because: `ended it with ${c?.firstName ?? 'her'}`, category: 'event',
    detail: `The apartment is hers until the lease runs out, and ${$(gift)} from your pocket to see her right. No more rent or allowance. She will think less of you, less if you are decent about it.`,
    disabledReason: !g ? 'She is not your goomar' : undefined,
  };
}

export function applyGoomarOp(ctx: Ctx, N: NightlifeState, o: Extract<NightOp, { op: 'goomar' | 'endGoomar' }>): void {
  const s = ctx.s;
  const boss = player(s);
  const c = s.characters[o.id];
  if (!adult(s, c) || !c.alive) return;
  if (o.op === 'goomar') {
    // Consent backstop: still in a relationship, still adults, at the moment it happens.
    if (goomarBlock(s, o.id)) return;
    useEvening(s);
    N.goomars[o.id] = { id: o.id, since: s.week, rent: o.rent, allowance: o.allowance, missed: 0, where: o.where };
    N.stats.goomars++;
    const D = ensureDating(s);
    const b = D.bonds[o.id];
    if (b) { b.aff = clamp(b.aff + 8); b.last = s.week; b.committed = true; }
    addOpinion(s, o.id, boss.id, 'He set me up in a place of my own', 12, 1);
    const p = N.people[o.id];
    if (p) { p.attach = clamp(p.attach + 15); p.hist.push([s.week, `Became your goomar: ${o.where}.`]); }
    nlog(N, s, `${c.firstName} ${c.lastName} said yes: ${o.where}, her name on the lease. Your goomar.`);
    ctx.log.push(`${c.firstName} is your goomar now: ${o.where}.`);
    return;
  }
  const g = N.goomars[o.id];
  if (!g || g.ended) return;
  endGoomar(s, N, g, c, 'You ended it', -8);
  ctx.log.push(`You ended it with ${c.firstName}.`);
}

function endGoomar(s: GameState, N: NightlifeState, g: Goomar, c: Character, why: string, op: number): void {
  g.ended = { week: s.week, why };
  const boss = player(s);
  const r = romanceBetween(s, boss.id, c.id);
  if (r) endRomance(s, r, why);
  const b = s.dating?.bonds[c.id];
  if (b) { b.committed = undefined; b.ended = { week: s.week, why }; }
  addOpinion(s, c.id, boss.id, why, op, 1);
  const p = N.people[c.id];
  if (p) p.hist.push([s.week, `No longer your goomar: ${why.toLowerCase()}.`]);
  nlog(N, s, `${c.firstName} ${c.lastName} is no longer your goomar: ${why.toLowerCase()}.`);
}

/** Weekly: the money, her place, the risks, whether she stays. */
export function goomarWeek(ctx: Ctx, N: NightlifeState): void {
  const s = ctx.s;
  const boss = player(s);
  const wife = wifeOf(s);
  const many = activeGoomars(s).length;
  const open = activeGoomars(s).filter((x) => x.public).length;
  for (const g of Object.values(N.goomars)) {
    if (g.ended) continue;
    const c = s.characters[g.id];
    if (!c?.alive || !adult(s, c) || !boss.alive) { if (c) endGoomar(s, N, g, c, c.alive ? 'It ended' : `${c.firstName} died`, 0); else g.ended = { week: s.week, why: 'gone' }; continue; }
    if (!romanceBetween(s, boss.id, c.id)) { endGoomar(s, N, g, c, 'It ended', -5); continue; }
    const p = N.people[g.id];
    const D = ensureDating(s);
    const b = D.bonds[g.id];
    // The money: from the pocket only; when it doesn't come, she notices.
    const weekly = g.rent + g.allowance;
    if ((s.tribute?.acct.personal ?? 0) >= weekly) {
      spendPocket(ctx, weekly, `${c.firstName}'s apartment and allowance`, `goomar:${g.id}`, true);
      g.missed = 0;
      if (b) b.aff = clamp(b.aff + 1);
    } else {
      g.missed++;
      if (b) b.aff = clamp(b.aff - 6);
      ctx.log.push(`${c.firstName}'s rent and allowance didn't come this week (your pocket is short).`);
    }
    // Her place: an evening there about every other week.
    if (roll(`${s.seed}|${s.week}|gvisit|${g.id}`) < 0.5) {
      if (b) b.last = s.week;
      if (s.dyn) applyEffects(ctx, [{ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: -4, source: 'domestic' }, label: `An evening at ${c.firstName}'s place` } as Effect], { label: 'Her place', because: 'kept a goomar', category: 'event' });
      maybeConceive(s, D, c, 'goomar', p?.bounds.includes('careful') ? 0.4 : 1);
    }
    // The risks.
    const k = (hasTrait(boss, 'Womanizer') ? 1.5 : 1) * (1 - (p?.discretion ?? 50) / 200);
    // The wife: more likely, and worse, the more he keeps and the more openly.
    if (wife && !g.wifeKnows && roll(`${s.seed}|${s.week}|gwife|${g.id}`) < (0.012 * (1 + 0.5 * (many - 1)) + (g.public ? 0.04 : 0)) * k) {
      g.wifeKnows = true;
      const known = activeGoomars(s).filter((x) => x.wifeKnows).length;
      const hurt = Math.min(60, 20 + 8 * (known - 1) + 8 * open);
      applyEffects(ctx, [{ type: 'opinion', from: wife.id, to: boss.id, amount: -hurt, reason: known > 1 ? `He keeps ${known} women in apartments` : 'He keeps a woman in an apartment', decay: 1, label: `${wife.firstName} found out about ${c.firstName}` }, { type: 'familyOpinion', amount: -(2 + known + open), reason: 'The boss\'s goomars', label: 'The family knows' }], { label: `${wife.firstName} found out`, because: 'kept a goomar', category: 'event' });
      D.rumors.push({ week: s.week, text: `${wife.firstName} knows about the apartment on ${g.where.replace(/^an? /, '')}.`, about: boss.id, heard: [wife.id], true: true });
      nlog(N, s, `${wife.firstName} found out about ${c.firstName} and the apartment.`);
      ctx.log.push(`${wife.firstName} found out about ${c.firstName}.`);
    }
    if (roll(`${s.seed}|${s.week}|grival|${g.id}`) < 0.008 * k) {
      const rv = s.rivals.find((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive && !s.secrets.some((x) => x.ownerId === boss.id && x.kind === 'affair' && x.knownBy.includes(r.id as FactionId)));
      if (rv) {
        const sec = addSecret(s, boss, 'affair', [rv.id as FactionId]);
        if (!sec.knownBy.includes(rv.id as FactionId)) sec.knownBy.push(rv.id as FactionId);
        sec.text = `${displayName(boss)} keeps ${displayName(c)} in an apartment`;
        nlog(N, s, `The ${rv.shortName} family knows about ${c.firstName}. A lever, if they want one.`);
      }
    }
    if (!g.public && s.week - g.since > 26 && roll(`${s.seed}|${s.week}|gpublic|${g.id}`) < 0.03 * k) {
      g.public = true;
      applyEffects(ctx, [{ type: 'rivalOpinion', rival: 'philly', amount: -3, reason: 'A boss who can\'t keep his goomar quiet', label: 'Philadelphia hears' }], { label: 'Talk', because: 'kept a goomar', category: 'event' });
      nlog(N, s, `Your goomar is talk on the island now. Philadelphia doesn't like a boss who can't keep it quiet.`);
    }
    // Jealousy: she is not the only one, and she may find out about the others.
    if (many > 1 && b) {
      b.aff = clamp(b.aff - (many - 1));
      const other = activeGoomars(s).find((x) => x.id !== g.id);
      const oc = other ? s.characters[other.id] : undefined;
      if (oc && roll(`${s.seed}|${s.week}|gjeal|${g.id}`) < 0.03 * (many - 1)) {
        b.aff = clamp(b.aff - 12);
        addOpinion(s, c.id, oc.id, 'She is seeing him too', -25, 1);
        addOpinion(s, oc.id, c.id, 'She is seeing him too', -15, 1);
        addOpinion(s, c.id, boss.id, `He keeps ${oc.firstName} too`, -10, 1);
        if (p) p.hist.push([s.week, `Found out about ${oc.firstName}, your other goomar.`]);
        nlog(N, s, `${c.firstName} found out about ${oc.firstName}. She wants to know where she stands with you.`);
        ctx.log.push(`${c.firstName} found out about ${oc.firstName}, and she is not happy.`);
      }
    }
    // Whether she stays: her decision.
    const neglected = b?.last !== undefined && s.week - b.last > 10;
    const leave = g.missed >= 3 ? 'The money stopped coming' : (b && b.aff < 20 && roll(`${s.seed}|${s.week}|gleave|${g.id}`) < 0.1) ? 'Her feelings went' : neglected && roll(`${s.seed}|${s.week}|glonely|${g.id}`) < 0.08 ? 'She was lonely; you were never there' : undefined;
    if (leave) {
      endGoomar(s, N, g, c, `She left: ${leave.toLowerCase()}`, -10);
      ctx.log.push(`${c.firstName} left the apartment: ${leave.toLowerCase()}.`);
    }
  }
}
