import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, player } from './characters';
import { ensureDating } from './datingState';
import { applyEffects } from './effects';
import { goomarOf } from './goomar';
import { addOpinion, opinion } from './relations';
import { hashSeed } from './rng';
import { addSecret } from './secrets';
import { protectionFor } from './protect';
import { spendPocket } from './pocket';
import type { NightlifeState, NightPerson } from './nightlifeState';
import type { ActionPreview } from './actions';
import type { Ctx } from './ledger';
import type { NightOp } from './nightlife';
import type { Character, Effect, FactionId, GameState } from './types';

/**
 * HER MAN, AND HER GRUDGE.
 *
 *  - Her husband or fella is a person of the world with his own temper
 *    about her life: jealous, volatile, fine with it, or (married and fine
 *    with the trade) her driver and manager. Some don't know. The boss
 *    learns which only by asking around, from gossip, or the hard way: a
 *    jealous man may come at him (off-screen, implied: the bodyguards turn
 *    him away, a scuffle outside a club, a brick through a windshield, a
 *    knife flashed in a lot). The boss can pay him off, have him warned, or
 *    have the crew handle it (implied, off-screen); each one changes what
 *    she thinks of the boss.
 *  - A woman the boss humiliated or threw out may hold a grudge, and a
 *    grudge talks: to a rival family (his habits, where he goes at night,
 *    who he is with, his goomar's address) or to the law. The leaks are
 *    recorded on `nightlife.leaks` (the threats layer reads them as rival
 *    intel); here they hand the rival a secret or the feds a file, and
 *    sometimes one of the boss's own people warns him.
 *
 * Non-explicit, adults only, nothing shown.
 */

export type PartnerHow = 'pay' | 'warn' | 'crew';

export const HOW_INFO: Record<PartnerHow, { label: string; cost: number; text: string }> = {
  pay: { label: 'Pay him to stay calm', cost: 500, text: '$500 in an envelope and a promise to keep it quiet. He may take it; she may not like being paid around.' },
  warn: { label: 'Have him warned off', cost: 0, text: 'Two of your men have a word. A jealous man may listen; a volatile one may not.' },
  crew: { label: 'Have the crew handle it', cost: 0, text: 'He gets the message the hard way, off-screen. Heat; he may go to the cops; she may thank you, or never forgive you.' },
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const NX = (op: NightOp, label: string): Effect => ({ type: 'nightlife', op, label }) as Effect;
const roll = (k: string) => (hashSeed(k) % 100003) / 100003;
const adult = (s: GameState, c: Character | undefined): c is Character => !!c && ageOn(c.birth, s.date) >= 18;

function nlog(N: NightlifeState, s: GameState, text: string): void {
  N.log.push([s.week, text]);
  if (N.log.length > 60) N.log.splice(0, N.log.length - 60);
}

/** Her man (a living adult), if she has one. */
export function partnerOf(s: GameState, p: NightPerson | undefined): Character | undefined {
  const m = p?.fam.partnerId ? s.characters[p.fam.partnerId] : undefined;
  return m?.alive && adult(s, m) ? m : undefined;
}

/** What kind of man he is about her life (fixed per man; stored once known or changed). */
export function temperOf(s: GameState, p: NightPerson): NonNullable<NightPerson['fam']['temper']> | undefined {
  const m = partnerOf(s, p);
  if (!m) return undefined;
  if (p.fam.temper) return p.fam.temper;
  const k = hashSeed(`${s.seed}:temper:${m.id}`) % 100;
  if (p.fam.knows === 'accepts') return k < 45 ? 'manager' : 'fine';
  if (hasTrait(m, 'Hot-headed') || hasTrait(m, 'Cruel')) return 'volatile';
  return k < 35 ? 'jealous' : k < 50 ? 'volatile' : 'fine';
}

export const TEMPER_TEXT: Record<NonNullable<NightPerson['fam']['temper']>, string> = {
  jealous: 'a jealous man', volatile: 'a volatile man, dangerous when he drinks', fine: 'fine with it, as far as anyone can tell', manager: 'fine with the trade: he drives her and keeps her book',
};

/** What the boss knows about her man, in words (undefined: nothing yet). */
export function partnerKnown(s: GameState, p: NightPerson): string | undefined {
  const m = partnerOf(s, p);
  const t = temperOf(s, p);
  if (!m || !t || !p.fam.temperKnown) return undefined;
  return `${displayName(m)}: ${TEMPER_TEXT[t]}${p.fam.knows ? `; he ${p.fam.knows === 'unaware' ? 'doesn\'t know about you' : p.fam.knows === 'suspects' ? 'suspects' : 'knows'}` : ''}.`;
}

/* ---------------- Orders ---------------- */

export function previewAskMan(s: GameState, id: string): ActionPreview {
  const c = s.characters[id];
  const p = s.nightlife?.people[id];
  const m = partnerOf(s, p);
  return {
    title: `Ask around about ${c?.firstName ?? 'her'}'s man`, cost: 50, pot: 'pocket', because: `asked around about ${c?.firstName ?? 'her'}'s man`, category: 'event',
    detail: `A bartender, a cab driver, ${$(50)} from your pocket: what kind of man ${m ? m.firstName : 'he'} is, and what he knows.`,
    effects: [{ type: 'money', pot: 'pocket', amount: -50, label: 'Asking around' }, NX({ op: 'askMan', id }, `About ${c?.firstName ?? 'her'}'s man`)],
    disabledReason: !c || !adult(s, c) ? 'Adults only' : !m ? 'She has no man that you know of' : p?.fam.temperKnown ? 'You know already' : undefined,
  };
}

export function applyAskMan(ctx: Ctx, N: NightlifeState, id: string): void {
  const s = ctx.s;
  const p = N.people[id];
  if (!p || !partnerOf(s, p) || !adult(s, s.characters[id])) return;
  p.fam.temper = temperOf(s, p);
  p.fam.temperKnown = true;
  p.fam.known = true;
  const line = `You asked around: ${partnerKnown(s, p)}`;
  nlog(N, s, line);
  ctx.log.push(line);
}

export function previewPartner(s: GameState, id: string, how: PartnerHow): ActionPreview {
  const c = s.characters[id];
  const p = s.nightlife?.people[id];
  const m = partnerOf(s, p);
  const info = HOW_INFO[how];
  const t = p ? temperOf(s, p) : undefined;
  return {
    title: `${info.label}: ${m ? displayName(m) : 'her man'}`, cost: info.cost, pot: info.cost ? 'pocket' : undefined, because: `dealt with ${c?.firstName ?? 'her'}'s man`, category: 'event',
    detail: `${info.text} ${how === 'warn' ? `About ${t === 'volatile' ? 35 : 60}% he listens.` : ''} What ${c?.firstName ?? 'she'} thinks of it depends on her, and on him.`,
    effects: [...(info.cost ? [{ type: 'money', pot: 'pocket', amount: -info.cost, label: `${m?.firstName ?? 'Her man'}: an envelope` } as Effect] : []), NX({ op: 'partner', id, how }, `${m?.firstName ?? 'Her man'} dealt with`)],
    warning: how === 'crew' ? 'Local heat; he may go to the cops; she may never forgive you.' : undefined,
    disabledReason: !c || !adult(s, c) ? 'Adults only' : !m || !p ? 'She has no man that you know of' : !p.fam.temperKnown ? 'You don\'t know anything about him yet: ask around first' : t === 'fine' || t === 'manager' ? 'He is no trouble' : !player(s).alive || !isFree(s, player(s)) ? 'You are not free' : undefined,
  };
}

export function applyPartner(ctx: Ctx, N: NightlifeState, id: string, how: PartnerHow): void {
  const s = ctx.s;
  const c = s.characters[id];
  const p = N.people[id];
  const m = partnerOf(s, p);
  const boss = player(s);
  if (!c || !p || !m || !adult(s, c)) return;
  const fx = (effects: Effect[], label: string) => applyEffects(ctx, effects, { label, because: `dealt with ${c.firstName}'s man`, category: 'event' });
  const t = temperOf(s, p);
  const afraidOfHim = t === 'volatile' && hashSeed(`${s.seed}:afraidof:${m.id}`) % 100 < 60;
  const key = `${s.seed}|${s.week}|partner|${id}|${how}`;
  let line: string;
  if (how === 'pay') {
    const takes = roll(`${key}|takes`) < (t === 'volatile' ? 0.5 : 0.75);
    if (takes) { p.fam.temper = 'fine'; addOpinion(s, m.id, boss.id, 'Took his envelope', 5, 1); }
    addOpinion(s, id, boss.id, afraidOfHim ? 'He made him go quiet' : 'He paid my husband off like a bookie', afraidOfHim ? 5 : -5, 1);
    line = takes ? `${m.firstName} took the envelope and went quiet.` : `${m.firstName} threw the envelope back at your man.`;
  } else if (how === 'warn') {
    const listens = roll(`${key}|listens`) < (t === 'volatile' ? 0.35 : 0.6);
    if (listens) p.fam.temper = 'fine';
    else p.fam.lastClash = s.week - 30;
    addOpinion(s, id, boss.id, afraidOfHim ? 'He looked out for me' : 'His men leaned on my husband', afraidOfHim ? 5 : -5, 1);
    line = listens ? `Two of your men had a word with ${m.firstName}. He listened.` : `Two of your men had a word with ${m.firstName}. He didn't listen.`;
  } else {
    m.health = clamp(m.health - 30);
    p.fam.temper = 'fine';
    addOpinion(s, m.id, boss.id, 'Had me beaten', -50, 0);
    fx([{ type: 'heat', bar: 'local', amount: 3, label: `${m.firstName} ended up in Burdette Tomlin` }], 'Handled');
    addOpinion(s, id, boss.id, afraidOfHim ? 'He made him stop' : 'He had my husband beaten', afraidOfHim ? 8 : -25, afraidOfHim ? 1 : 0);
    if (!afraidOfHim) p.grudge = s.week;
    if (roll(`${key}|cops`) < 0.2) { fx([{ type: 'evidence', charId: boss.id, amount: 5, label: `${m.firstName} talked to the police` }], 'He talked'); }
    line = `Your crew handled ${m.firstName}. He'll be in Burdette Tomlin a week. ${afraidOfHim ? `${c.firstName} cried, and then she thanked you.` : `${c.firstName} won't look at you.`}`;
  }
  nlog(N, s, line);
  ctx.log.push(line);
}

/* ---------------- The week: his temper, her grudge ---------------- */

const OUTCOMES = [
  (m: Character) => `${m.firstName} came looking for you at the club; your bodyguards turned him around at the door.`,
  (m: Character) => `${m.firstName} came at you outside the Bolero. A scuffle on the sidewalk, your driver between you; he went home with a split lip.`,
  (m: Character) => `Somebody put a brick through the windshield of your Cadillac. Word is it was ${m.firstName}.`,
  (m: Character) => `${m.firstName} flashed a knife in the parking lot. Your men got between you, and he ran.`,
];

export function partnersWeek(ctx: Ctx, N: NightlifeState): void {
  const s = ctx.s;
  const boss = player(s);
  const D = s.dating;
  for (const p of Object.values(N.people)) {
    if (p.status !== 'active') continue;
    const c = s.characters[p.id];
    const m = partnerOf(s, p);
    if (!c?.alive || !m || !adult(s, c)) continue;
    const t = temperOf(s, p);
    if (t !== 'jealous' && t !== 'volatile') continue;
    if (p.fam.knows === 'unaware' || (p.fam.lastClash !== undefined && s.week - p.fam.lastClash < 20)) continue;
    const last = Math.max(D?.bonds[p.id]?.last ?? -99, ...(D?.providers[p.id]?.visits ?? [-99]));
    if (s.week - last > 6 && !goomarOf(s, p.id)) continue;
    // A man on the boss at night (protect.ts) heads some of it off, never all.
    if (roll(`${s.seed}|${s.week}|clash|${p.id}`) >= (t === 'volatile' ? 0.05 : 0.03) * (1 - protectionFor(s, boss.id, 'night').cut)) continue;
    p.fam.lastClash = s.week;
    p.fam.temper = t;
    p.fam.temperKnown = true;
    const k = hashSeed(`${s.seed}|${s.week}|clashkind|${p.id}`) % OUTCOMES.length;
    const line = OUTCOMES[k](m);
    if (k === 2) spendPocket(ctx, 300, 'A new windshield', `windshield:${s.week}`, true);
    if (s.dyn) applyEffects(ctx, [{ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: 6, source: 'domestic' }, label: `${m.firstName} came at you` } as Effect], { label: 'Her husband', because: 'saw a married woman', category: 'event' });
    addOpinion(s, c.id, boss.id, 'My husband found out', -3, 1);
    ensureDating(s).rumors.push({ week: s.week, text: `${displayName(m)} went after the boss over ${c.firstName}.`, about: boss.id, heard: ['island'], true: true });
    nlog(N, s, `${line} (${c.firstName}'s ${p.fam.st === 'married' ? 'husband' : 'fella'}.)`);
    ctx.log.push(line);
  }
  if (s.week % 4 === 0) grudgesMonth(ctx, N);
  // Your own people may warn you, a few weeks after.
  for (const l of N.leaks ?? []) {
    if (l.warned || s.week - l.week < 2 || roll(`${s.seed}|${s.week}|warn|${l.from}|${l.week}`) > 0.2) continue;
    l.warned = true;
    const c = s.characters[l.from];
    if (!c) continue;
    const line = `Word from one of your people: a girl's been talking to ${l.to === 'police' ? 'the cops' : l.to === 'fbi' ? 'a federal man' : `the ${s.rivals.find((r) => r.id === l.to)?.shortName ?? 'other'} family`}. ${c.firstName} ${c.lastName}, about ${l.what}.`;
    nlog(N, s, line);
    ctx.log.push(line);
  }
}

/** A woman with a grudge may talk: to a rival family or to the law. */
function grudgesMonth(ctx: Ctx, N: NightlifeState): void {
  const s = ctx.s;
  const boss = player(s);
  for (const p of Object.values(N.people)) {
    const c = s.characters[p.id];
    if (!c?.alive || !adult(s, c) || p.status !== 'active') continue;
    const op = opinion(s, c.id, boss.id);
    if (p.grudge === undefined && op > -40) continue;
    const since = p.grudge ?? s.week - 4;
    const months = Math.max(0, (s.week - since) / 4);
    if (roll(`${s.seed}|${s.week}|leak|${p.id}`) >= Math.min(0.2, 0.04 + 0.01 * months)) continue;
    const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
    const toLaw = c.informantFor === 'law' || s.heat.federal >= 40 || roll(`${s.seed}|${s.week}|leakto|${p.id}`) < 0.3;
    const to: string = toLaw ? (s.heat.federal >= 40 ? 'fbi' : 'police') : mobs[hashSeed(`${s.seed}:${s.week}:leakr:${p.id}`) % Math.max(1, mobs.length)]?.id ?? 'police';
    const g = Object.values(N.goomars).find((x) => !x.ended);
    const topics = ['your habits', 'where you go at night', 'who you are seeing', ...(g ? [`your goomar's address (${g.where})`] : [])];
    const what = topics[hashSeed(`${s.seed}:${s.week}:leakw:${p.id}`) % topics.length];
    (N.leaks ??= []).push({ week: s.week, from: p.id, to, what });
    if (N.leaks.length > 30) N.leaks.splice(0, N.leaks.length - 30);
    if (to === 'police' || to === 'fbi') {
      if (!c.informantFor) c.informantFor = 'law';
      applyEffects(ctx, [{ type: 'evidence', charId: boss.id, amount: 3, label: 'Someone is talking' }], { label: 'Someone is talking', because: 'made an enemy of a woman', category: 'event' });
    } else {
      const sec = addSecret(s, boss, 'affair', [to as FactionId]);
      if (!sec.knownBy.includes(to as FactionId)) sec.knownBy.push(to as FactionId);
    }
    p.grudge = s.week;
  }
}
