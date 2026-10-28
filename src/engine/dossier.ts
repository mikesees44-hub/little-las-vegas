import { ageOn } from './calendar';
import { displayName, hasTrait, player, TRAIT_INFO } from './characters';
import { adultOn } from './datingState';
import { appeal, looksOf } from './looks';
import { bodyLine, bodyOf, BUILD_LABEL, FIGURE_LABEL, tasteOf, tasteText, type BodyProfile } from './body';
import { opinion } from './relations';
import { hashSeed } from './rng';
import { knownSecrets } from './secrets';
import { NGOAL_TEXT, ROLE_LABEL } from './nightlifeState';
import {
  AMBITION_TEXT, BASIS_TEXT, DREAM_TEXT, MOTIVE_TEXT, STAGE_TEXT, TIER_TEXT, ensureWomen,
  type DescOverride, type Tier,
} from './womenState';
import type { Character, GameState, Trait } from './types';

/**
 * THE DOSSIER: everything the boss has on one adult woman, as a big portrait
 * and a set of charts (ui/nightlife/Dossier.tsx; the calling card's "Dossier"
 * button). Appearance is several independent descriptors (an overall look,
 * a build, a figure, the bust in words, hair, eyes, a way of dressing, a
 * signature feature, and a "type" in fictional 1960 archetypes), each one
 * changeable on its own, over the full head-to-toe profile in words
 * (body.ts), and how different people rate her (attraction is personal). Then an
 * aptitude chart (game scores, not IQ; an IQ only where a fictional test
 * result exists), a trait chart, a motivation chart, her relationships, and
 * the secrets the boss knows.
 *
 * Tasteful on purpose: no bra or cup sizes, no bust/waist/hip numbers,
 * nothing explicit (the bust is a word: small, modest, full, ample); never a comparison to a real person. Appearance never
 * decides intelligence, willingness or worth. Adults only: no dossier for
 * anyone under 18, and none at all with mature content Off. Pure: reads the state, never writes it (the player's
 * appearance choices are written by `setDescriptor`, a UI state function).
 */

export const LOOK_TIERS = ['Plain', 'Pretty', 'Very cute', 'Stunning', 'Glamour-model look'] as const;
export const HAIRS = [
  'Raven black, in a sleek pageboy', 'Dark brown, in a French twist', 'Chestnut, in long loose waves', 'Auburn, in a bouffant', 'Red, in a short poodle cut',
  'Strawberry blonde, in a ponytail', 'Honey blonde, in a soft flip', 'Platinum blonde, in a high beehive', 'Black, in a pixie cut', 'Ash brown, pinned up',
  'Copper, worn long', 'Golden blonde, in a chignon',
] as const;
export const EYES = [
  'Dark brown, almond-shaped', 'Hazel, wide-set', 'Green, heavy-lidded', 'Blue, large and bright', 'Gray, cool and steady', 'Brown, quick to laugh', 'Violet-blue, striking', 'Amber, cat-like',
] as const;
export const STYLES = ['Glamorous', 'Understated', 'A provocative dresser', 'Businesslike', 'The girl next door', 'Fashionable', 'Beatnik black', 'Sporty'] as const;
export const MARKS = [
  'Striking eyes', 'A warm smile', 'A beauty mark', 'Freckles', 'Dimples', 'A husky laugh', 'Long legs', 'A dancer\'s posture', 'A crooked smile', 'A small scar through one eyebrow', 'A gap-toothed grin', 'Perfect posture',
] as const;
/** Fictional 1960 archetypes: never a real person. */
export const TYPES = [
  'Screen-star elegance', 'High-fashion model look', 'Girl-next-door', 'Pin-up glamour', 'Showgirl sparkle', 'Society-page polish', 'Boardwalk sweetheart',
  'Beatnik cool', 'Continental chic', 'Bombshell glamour', 'Hometown wholesome', 'Torch-singer smolder',
] as const;
export const BUSTS = ['Small', 'Modest', 'Full', 'Ample'] as const;

export const DESC_OPTIONS: Record<keyof DescOverride, readonly string[]> = {
  tier: LOOK_TIERS, body: Object.keys(BUILD_LABEL), figure: Object.keys(FIGURE_LABEL), bust: BUSTS, hair: HAIRS, eyes: EYES, style: STYLES, mark: MARKS, type: TYPES,
};
export const DESC_LABEL: Record<keyof DescOverride, string> = { tier: 'Overall look', body: 'Build', figure: 'Figure', bust: 'Bust', hair: 'Hair', eyes: 'Eyes', style: 'Style', mark: 'Signature feature', type: 'Type' };
/** How an option reads (builds and figures are stored as keys). */
export function optionLabel(key: keyof DescOverride, v: string): string {
  return key === 'body' ? BUILD_LABEL[v as keyof typeof BUILD_LABEL] ?? v : key === 'figure' ? FIGURE_LABEL[v as keyof typeof FIGURE_LABEL] ?? v : v;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const u = (k: string) => (hashSeed(k) % 100003) / 100003;
const pickK = <T,>(arr: readonly T[], k: string): T => arr[hashSeed(k) % arr.length];

export interface Appearance {
  tier: string; build: string; figure: string; bust?: string; hair: string; eyes: string; style: string; mark: string; type: string;
  /** The full head-to-toe profile in words (body.ts). */
  body: BodyProfile;
  /** One readable line built from the descriptors. */
  line: string;
  /** How different people see her (attraction is personal: looks.ts appeal). */
  ratings: { who: string; word: string }[];
  /** Which descriptors the player has set by hand. */
  set: (keyof DescOverride)[];
}

export interface Bar { key: string; label: string; v: number; text: string }
export interface TraitRow { name: string; v: number; good: string; bad: string }
export interface DossierView {
  id: string;
  name: string;
  age: number;
  role: string;
  look: Appearance;
  iq: { text: string; tested: boolean };
  aptitude: Bar[];
  traits: TraitRow[];
  motives: Bar[];
  /** How sure the boss's read of her motives is. */
  read: 'known' | 'good read' | 'a guess';
  career?: { aim: string; tier: string; cond: number; pay: number; text: string };
  relations: { label: string; text: string; tone?: 'good' | 'bad' | 'warn' }[];
  secrets: { text: string; label: 'Known' | 'Rumor' | 'Hook' }[];
}

/** The look tier from the looks score (adults only). */
function tierFor(score: number): (typeof LOOK_TIERS)[number] {
  return score >= 88 ? 'Glamour-model look' : score >= 76 ? 'Stunning' : score >= 62 ? 'Very cute' : score >= 40 ? 'Pretty' : 'Plain';
}

function typeFor(s: GameState, c: Character, tier: string, b: BodyProfile, style: string): (typeof TYPES)[number] {
  const role = s.nightlife?.people[c.id]?.role;
  const top = tier === 'Stunning' || tier === 'Glamour-model look';
  const curves = /hourglass/i.test(b.figure) || b.build === 'voluptuous' || b.build === 'curvy';
  if (role === 'singer' || role === 'recording') return 'Torch-singer smolder';
  if (role === 'dancer') return top ? 'Showgirl sparkle' : 'Boardwalk sweetheart';
  if (style === 'The girl next door') return 'Girl-next-door';
  if (style === 'A provocative dresser') return curves ? 'Bombshell glamour' : 'Pin-up glamour';
  if (style === 'Businesslike') return 'Society-page polish';
  if (style === 'Fashionable') return top && (b.build === 'willowy' || b.build === 'slender') ? 'High-fashion model look' : 'Continental chic';
  if (style === 'Beatnik black') return 'Beatnik cool';
  if (style === 'Glamorous') return top ? (curves ? 'Bombshell glamour' : 'Screen-star elegance') : 'Pin-up glamour';
  return top ? 'High-fashion model look' : pickK(['Hometown wholesome', 'Boardwalk sweetheart', 'Girl-next-door'] as const, `${s.seed}:wtype:${c.id}`);
}

function rateWord(v: number): string {
  return v >= 20 ? 'a knockout' : v >= 10 ? 'very attractive' : v >= 3 ? 'pretty' : v > -5 ? 'nothing special' : 'not his type';
}

/** How a few different people see her: the boss, and men of the crew (adults only). */
function ratingsOf(s: GameState, c: Character): Appearance['ratings'] {
  const boss = player(s);
  const out: Appearance['ratings'] = [];
  if (boss && boss.id !== c.id && ageOn(boss.birth, s.date) >= 18) out.push({ who: 'You', word: rateWord(appeal(s, boss, c).value) });
  const men = Object.values(s.characters).filter((m) => m.alive && m.gender !== c.gender && m.id !== boss?.id && m.faction === 'player' && ageOn(m.birth, s.date) >= 18).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (let i = 0; i < 3 && men.length; i++) {
    const m = men[hashSeed(`${s.seed}:rate:${c.id}:${i}`) % men.length];
    if (out.some((x) => x.who === displayName(m))) continue;
    out.push({ who: displayName(m), word: `${rateWord(appeal(s, m, c).value)} (${tasteText(tasteOf(s, m))})` });
  }
  return out;
}

/** Her appearance as descriptors (undefined for a minor or a man). */
export function appearanceOf(s: GameState, c: Character): Appearance | undefined {
  if (c.gender !== 'F' || ageOn(c.birth, c.death ? c.death.date : s.date) < 18) return undefined;
  const l = looksOf(s, c);
  const body = bodyOf(s, c)!;
  const o = s.women?.looks?.[c.id] ?? {};
  const k = (x: string) => `${s.seed}:w${x}:${c.id}`;
  const tier = o.tier ?? tierFor(l.score ?? 50);
  const style = o.style ?? (STYLES as readonly string[]).find((x) => x === l.style) ?? l.style;
  const markBase = l.feature === 'A beautiful face' ? 'A warm smile' : l.feature === 'Red hair' || l.feature === 'Platinum hair' || l.feature === 'Long dark hair' || l.feature === 'A strong nose' ? pickK(MARKS, k('mk')) : l.feature;
  const hairBase = l.feature === 'Red hair' ? 'Red, in a short poodle cut' : l.feature === 'Platinum hair' ? 'Platinum blonde, in a high beehive' : l.feature === 'Long dark hair' ? 'Chestnut, in long loose waves' : body.hair;
  const look: Appearance = {
    tier, build: body.buildLabel, figure: body.figure, bust: body.bust, style, hair: o.hair ?? hairBase, eyes: o.eyes ?? body.face.eyes, mark: o.mark ?? markBase, type: '',
    body, line: '', ratings: ratingsOf(s, c), set: (Object.keys(o) as (keyof DescOverride)[]).filter((x) => o[x] !== undefined),
  };
  look.type = o.type ?? typeFor(s, c, tier, body, style);
  look.line = `${look.tier}. ${bodyLine(body)} ${look.hair}; ${look.eyes.toLowerCase()} eyes. ${look.style}. ${look.mark}. Her type: ${look.type.toLowerCase()}.`;
  return look;
}

/** A UI state function: set (or clear, with undefined) one appearance descriptor. Adults only; only listed options. */
export function setDescriptor(s: GameState, id: string, key: keyof DescOverride, value: string | undefined): GameState {
  const c = s.characters[id];
  if (!c || ageOn(c.birth, s.date) < 18) return s;
  if (key === 'bust' && c.gender !== 'F') return s;
  if (value !== undefined && !DESC_OPTIONS[key].includes(value)) return s;
  const next: GameState = { ...s, women: s.women ? { ...s.women, looks: { ...s.women.looks } } : undefined };
  const W = ensureWomen(next);
  const cur = { ...(W.looks[id] ?? {}) };
  if (value === undefined) delete cur[key];
  else cur[key] = value;
  if (Object.keys(cur).length) W.looks[id] = cur;
  else delete W.looks[id];
  return next;
}

/** Her tier on the island's trade (for arcs and the dossier). */
export function tierOfRole(role: string | undefined): Tier {
  return role === 'escort' ? 'high' : role === 'dancer' ? 'club' : role === 'callgirl' || role === 'madam' ? 'call' : role === 'street' ? 'street' : 'other';
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

function aptitude(s: GameState, c: Character): Bar[] {
  const a = c.attributes;
  const p = s.nightlife?.people[c.id];
  const j = (x: string) => (u(`${s.seed}:apt:${x}:${c.id}`) - 0.5) * 24;
  const age = ageOn(c.birth, s.date);
  const school = p?.goal === 'school';
  return [
    { key: 'reason', label: 'Reasoning', v: clamp((a.intrigue + a.business) / 2 + j('r')), text: 'Thinking through a complicated choice' },
    { key: 'social', label: 'Reading people', v: clamp(a.diplomacy + (p ? (p.discretion - 50) / 5 : 0) + j('s') + (hasTrait(c, 'Charming') ? 8 : 0)), text: 'Moods, motives, who is lying' },
    { key: 'business', label: 'Business sense', v: clamp(a.business + j('b') + (p?.role === 'madam' ? 15 : 0)), text: 'Money, deals, a business of her own' },
    { key: 'creative', label: 'Talent & creativity', v: clamp(p ? p.talent + j('c') / 2 : 45 + j('c')), text: 'The stage, the camera, a song' },
    { key: 'memory', label: 'Memory', v: clamp(50 + j('m') * 1.5 + (a.intrigue - 45) / 3), text: 'Faces, names, what was promised' },
    { key: 'practical', label: 'Street smarts', v: clamp(a.discipline + Math.min(15, (age - 18) / 2) + (p?.role === 'street' ? 10 : 0) + j('p')), text: 'Getting by, staying out of trouble' },
    { key: 'school', label: 'Schooling', v: clamp(40 + j('e') * 1.5 + (school ? 25 : 0)), text: 'What she learned in school (can grow)' },
    { key: 'calm', label: 'Composure', v: clamp(a.discipline + j('k') + (hasTrait(c, 'Patient') ? 10 : 0) - (hasTrait(c, 'Hot-headed') ? 15 : 0)), text: 'Holding together under pressure' },
  ];
}

function iqOf(s: GameState, c: Character, apt: Bar[]): DossierView['iq'] {
  const p = s.nightlife?.people[c.id];
  const tested = p?.goal === 'school' || u(`${s.seed}:iqt:${c.id}`) < 0.2;
  if (!tested) return { text: 'Not assessed (no test on record; the chart is your read, not an IQ)', tested: false };
  const reason = apt.find((b) => b.key === 'reason')!.v;
  const score = Math.round(88 + reason * 0.35 + (u(`${s.seed}:iq:${c.id}`) - 0.5) * 10);
  const yr = c.birth.y + 16;
  return { text: `${score} on ${p?.goal === 'school' ? 'a nursing-school entrance examination' : 'a high-school aptitude test'}, ${yr} (a fictional test record)`, tested: true };
}

const DISPO: { name: string; good: string; bad: string; of: (s: GameState, c: Character) => number }[] = [
  { name: 'Ambitious', good: 'Goes after opportunities', bad: 'Dislikes stalled promises', of: (s, c) => {
    const amb = s.women?.arcs[c.id]?.amb;
    return (amb === 'fame' || amb === 'madam' ? 75 : amb === 'films' || amb === 'money' ? 55 : 35) + (hasTrait(c, 'Ambitious') ? 20 : 0);
  } },
  { name: 'Affectionate', good: 'Builds close bonds', bad: 'Wants real attention, not gifts', of: (s, c) => 30 + (s.women?.affairs[c.id]?.aff ?? 0) * 0.4 + (s.nightlife?.people[c.id]?.attach ?? 0) * 0.3 + u(`${s.seed}:af:${c.id}`) * 25 },
  { name: 'Independent', good: 'Runs her own life', bad: 'Resists being told', of: (s, c) => 35 + (s.nightlife?.people[c.id]?.bounds.includes('no_payroll') ? 35 : 0) + u(`${s.seed}:ind:${c.id}`) * 30 },
  { name: 'Discreet', good: 'Keeps a confidence', bad: 'Tells her closest friend', of: (s, c) => s.nightlife?.people[c.id]?.discretion ?? 40 + u(`${s.seed}:ds:${c.id}`) * 40 },
  { name: 'Materialistic', good: 'Enjoys the good life', bad: 'Not every gift lands', of: (s, c) => 25 + (hasTrait(c, 'Greedy') ? 40 : 0) + (s.women?.arcs[c.id]?.amb === 'money' ? 20 : 0) + u(`${s.seed}:mt:${c.id}`) * 20 },
  { name: 'Jealous', good: 'Fiercely loyal to her own', bad: 'Can make a scene', of: (s, c) => 15 + (hasTrait(c, 'Hot-headed') ? 30 : 0) + (hasTrait(c, 'Vengeful') ? 20 : 0) + u(`${s.seed}:jl:${c.id}`) * 25 },
];

function traitRows(s: GameState, c: Character): TraitRow[] {
  const out: TraitRow[] = c.traits.map((t: Trait) => ({ name: t, v: 85, good: TRAIT_INFO[t], bad: '' }));
  for (const d of DISPO) out.push({ name: d.name, v: clamp(d.of(s, c)), good: d.good, bad: d.bad });
  return out;
}

function motives(s: GameState, c: Character): Bar[] {
  const p = s.nightlife?.people[c.id];
  const arc = s.women?.arcs[c.id];
  const af = s.women?.affairs[c.id];
  const age = ageOn(c.birth, s.date);
  const j = (x: string) => u(`${s.seed}:mo:${x}:${c.id}`) * 20;
  const kids = p ? p.fam.kids.length : c.childrenIds.length;
  const married = p ? p.fam.st === 'married' : !!c.spouseId;
  const op = opinion(s, c.id, s.playerId);
  const hooked = (s.women?.hooks ?? []).some((h) => h.target === c.id && h.status === 'used');
  const grudge = p?.grudge !== undefined || p?.scorned !== undefined;
  const amb = arc?.amb;
  return [
    { key: 'security', label: 'Security', v: clamp(25 + j('s') + (amb === 'security' ? 45 : 0) + (age >= 23 && age <= 29 ? 10 : 0) + kids * 6), text: 'A roof, a man who stays, a future' },
    { key: 'money', label: 'Money', v: clamp(25 + j('m') + (amb === 'money' || amb === 'retire' ? 35 : 0) + (hasTrait(c, 'Greedy') ? 20 : 0) + (p && p.savings < 1000 ? 10 : 0)), text: 'Enough, and then some' },
    { key: 'fame', label: 'Fame', v: clamp(10 + j('f') + (amb === 'fame' ? 55 : amb === 'films' ? 30 : 0) + (age <= 22 ? 10 : 0) + (p?.dream ? 10 : 0)), text: 'Her name on a marquee' },
    { key: 'love', label: 'Love', v: clamp(20 + j('l') + (af ? af.aff * 0.5 : 0) + (p ? p.attach * 0.3 : 0) + (!married ? 8 : 0)), text: 'Someone who sees her' },
    { key: 'family', label: 'Family', v: clamp(15 + j('fa') + kids * 15 + (married ? 12 : 0) + (p?.fam.mother === 'ailing' ? 15 : 0)), text: 'Her kids, her mother, her people' },
    { key: 'freedom', label: 'Freedom', v: clamp(20 + j('fr') + (p?.bounds.includes('no_payroll') ? 25 : 0) + (amb === 'retire' ? 25 : 0) + (arc && arc.cond < 40 ? 15 : 0)), text: 'Her own hours, her own say' },
    { key: 'revenge', label: 'Revenge', v: clamp(j('r') / 2 + (grudge ? 35 : 0) + (hooked ? 30 : 0) + (op < -25 ? 20 : 0)), text: 'Getting even with somebody' },
  ];
}

/** The dossier, or undefined for a minor, a man, or nobody. */
export function dossierOf(s: GameState, id: string): DossierView | undefined {
  const c = s.characters[id];
  if (!c || c.gender !== 'F') return undefined;
  const age = ageOn(c.birth, c.death ? c.death.date : s.date);
  if (age < 18 || !adultOn(s)) return undefined;
  const look = appearanceOf(s, c)!;
  const p = s.nightlife?.people[id];
  const W = s.women;
  const arc = W?.arcs[id];
  const role = p ? ROLE_LABEL[p.role] : c.ambition;
  const apt = aptitude(s, c);
  const af = W?.affairs[id];
  const knowsHer = !!(p?.met || p?.payroll || af || (s.dating?.met?.[id] !== undefined));
  const relations: DossierView['relations'] = [];
  const boss = player(s);
  const sp = (p?.fam.partnerId ? s.characters[p.fam.partnerId] : undefined) ?? (c.spouseId ? s.characters[c.spouseId] : undefined);
  if (sp) relations.push({ label: p?.fam.st === 'steady' ? 'Her fella' : 'Her husband', text: `${displayName(sp)}${sp.faction === 'player' ? ` (one of your men: ${sp.rank})` : sp.faction !== 'none' ? ' (another family\'s man)' : ''}${sp.alive ? '' : ' (dead)'}`, tone: sp.faction === 'player' ? 'warn' : undefined });
  const kids = p ? p.fam.kids.length : c.childrenIds.filter((k) => s.characters[k]?.alive).length;
  if (kids) relations.push({ label: 'Children', text: `${kids}` });
  if (p?.house && s.nightlife?.houses[p.house]) relations.push({ label: 'Her house', text: s.nightlife.houses[p.house].name });
  if (c.id !== boss.id) {
    const op = opinion(s, c.id, boss.id);
    relations.push({ label: 'Thinks of you', text: `${op >= 0 ? '+' : ''}${op}`, tone: op >= 25 ? 'good' : op <= -25 ? 'bad' : undefined });
  }
  if (af) relations.push({ label: 'You and her', text: `${STAGE_TEXT[af.stage]}${af.stage !== 'ended' ? `; her feelings ${af.aff >= 70 ? 'run deep' : af.aff >= 40 ? 'are growing' : 'are cautious'}${af.guilt >= 50 ? ', and the guilt is heavy' : ''}` : af.ended ? ` (${af.ended.why})` : ''}`, tone: af.stage === 'affair' ? 'warn' : undefined });
  if (af?.initiated) relations.push({ label: 'She came to you', text: `For ${MOTIVE_TEXT[af.initiated]} (your read)` });
  const cl = W?.close[id];
  if (cl?.known !== undefined && s.characters[cl.man]) relations.push({ label: 'Close to', text: `${displayName(s.characters[cl.man])}: ${cl.why}`, tone: 'bad' });
  const tl = W?.talent[id];
  if (tl) relations.push({ label: 'Your company', text: `${tl.kind === 'actress' ? 'Actress' : tl.kind === 'singer' ? 'Singer' : 'A celebrity'} under contract since week ${tl.since}${tl.left !== undefined ? `; left week ${tl.left}` : ''} (fame ${tl.fame})`, tone: tl.left !== undefined ? 'bad' : 'good' });
  const secrets: DossierView['secrets'] = [];
  for (const x of knownSecrets(s, id)) secrets.push({ text: x.text, label: 'Known' });
  for (const h of (W?.hooks ?? []).filter((x) => x.target === id && x.holder === boss.id && x.status === 'active')) secrets.push({ text: `You hold a hook: ${BASIS_TEXT[h.basis]} (until week ${h.expires}; one use)`, label: 'Hook' });
  for (const r of (s.dating?.rumors ?? []).filter((x) => x.about === id).slice(-3)) secrets.push({ text: r.text, label: 'Rumor' });
  const career = arc ? { aim: AMBITION_TEXT[arc.amb] + (arc.dream ? ` (${DREAM_TEXT[arc.dream]})` : ''), tier: TIER_TEXT[tierOfRole(p?.role)], cond: arc.cond, pay: arc.pay, text: p ? NGOAL_TEXT[p.goal] : '' } : undefined;
  return {
    id, name: displayName(c), age, role, look, iq: iqOf(s, c, apt), aptitude: apt, traits: traitRows(s, c), motives: motives(s, c),
    read: af?.stage === 'affair' || (p?.attach ?? 0) >= 50 ? 'known' : knowsHer ? 'good read' : 'a guess',
    career, relations, secrets,
  };
}
