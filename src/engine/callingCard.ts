import { ageOn, formatDate } from './calendar';
import { displayName, player, TRAIT_INFO } from './characters';
import { adultOn } from './datingState';
import { affectionWord, stageOf } from './dating';
import { STAGE_LABEL } from './datingState';
import { knownOld, skillLines } from './aging';
import { CRAFT_INFO, GOAL_INFO, OUTSIDE_INFO, VICE_INFO } from './hierarchy';
import { appeal, impressionWord, looksOf, type Looks } from './looks';
import { familyLine, kickbackRate, personOf, roleShown, roleText, sideName } from './nightlife';
import { goomarOf, goomarTerms } from './goomar';
import { KNOWS_LABEL, MARITAL_LABEL, NBOUND_TEXT, NGOAL_TEXT } from './nightlifeState';
import { opinion } from './relations';
import { romanceBetween } from './romance';
import { knownSecrets } from './secrets';
import { seenWealth } from './crewFinance';
import { FACTION_NAMES } from './world';
import type { Character, GameState } from './types';

/**
 * THE CALLING CARD: one person at a glance, for every adult man and woman.
 * A friendly summary first (who, what they do, what they want, where you
 * stand, the price when there is one and the setting allows it), then the
 * details behind "More…": appearance, personality, skills, health and
 * aging as far as known, family and household, money as far as known,
 * relationships to the boss, rumors (labelled as such), her lines, her
 * story. Only what the boss could reasonably know; private things stay
 * private. Adults only: a minor has no calling card.
 */

export interface CardLine { label: string; text: string; tone?: 'good' | 'bad' | 'warn' }

export interface CallingCardView {
  id: string;
  name: string;
  gender: 'M' | 'F';
  age: number;
  born: string;
  /** "High-end escort · the Hart agency" / "Capo · Your crew". */
  role: string;
  place?: string;
  side: string;
  /** The summary rows (first screen). */
  summary: CardLine[];
  looks: Looks;
  /** How the boss sees them (his own eye). */
  impression?: string;
  traits: { name: string; text: string }[];
  skills: { label: string; learned: number; effective: number; why: string[] }[];
  health: number;
  aging: { label: string; sure: boolean; text: string }[];
  agingLooks?: string;
  family: string[];
  money: string[];
  you: CardLine[];
  wants: string[];
  rumors: { text: string; label: 'Rumor' | 'Known' }[];
  lines: string[];
  story: { week: number; text: string }[];
}

const SKILL_LABEL: Record<string, string> = { leadership: 'Leadership', business: 'Business', diplomacy: 'Diplomacy', intrigue: 'Intrigue', force: 'Muscle', discipline: 'Discipline' };
const RANK: Record<string, string> = { boss: 'Boss', underboss: 'Underboss', consigliere: 'Consigliere', capo: 'Capo', soldier: 'Soldier', associate: 'Associate', civilian: 'Civilian' };
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function opinionWord(v: number): string {
  return v >= 50 ? 'Devoted to you' : v >= 25 ? 'Friendly' : v >= 8 ? 'Warm' : v > -8 ? 'Neutral' : v > -25 ? 'Cool' : v > -50 ? 'Unfriendly' : 'Hostile';
}

/** The card, or undefined for a minor or someone who is not in the world. */
export function callingCard(s: GameState, id: string): CallingCardView | undefined {
  const c = s.characters[id];
  if (!c) return undefined;
  const age = ageOn(c.birth, c.death ? c.death.date : s.date);
  if (age < 18) return undefined;
  const boss = player(s);
  const isBoss = c.id === boss.id;
  const p = personOf(s, id);
  const shown = p ? roleShown(s, p.role) : true;
  const l = looksOf(s, c);
  const he = c.gender === 'F' ? 'She' : 'He';
  const his = c.gender === 'F' ? 'her' : 'his';

  // Who and what.
  let role: string;
  if (p) {
    const h = p.house ? s.nightlife?.houses[p.house] : undefined;
    role = `${roleText(s, p)}${h && shown ? ` · ${h.name}` : ''}`;
  } else if (isBoss) role = `Boss of the house of ${s.houseName}`;
  else role = `${c.office ?? (c.outside ? OUTSIDE_INFO[c.outside] : c.frontMan ? 'Front man' : RANK[c.rank])}${c.faction !== 'none' ? ` · ${FACTION_NAMES[c.faction] === 'Your crew' ? (c.dynasty ? `House of ${s.houseName}` : 'Your crew') : FACTION_NAMES[c.faction]}` : ''}${c.craft ? ` · ${CRAFT_INFO[c.craft].name}` : ''}`;
  const place = p ? (shown ? p.venue : undefined) : s.districts.find((d) => d.capoId === c.id)?.name;

  // Family and household.
  const family: string[] = [];
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  if (p) {
    family.push(familyLine(s, p));
    const pt = p.fam.partnerId ? s.characters[p.fam.partnerId] : undefined;
    if (pt) family.push(`${p.fam.st === 'steady' ? 'Her fella' : 'Her husband'}: ${displayName(pt)}, ${ageOn(pt.birth, s.date)}, ${pt.ambition.toLowerCase()}${p.fam.knows && shown ? `; he ${KNOWS_LABEL[p.fam.knows]}` : ''}.`);
    for (const k of p.fam.kids) { const a = s.date.y - k.y; family.push(`${k.m ? 'Son' : 'Daughter'} ${k.n}, ${a <= 0 ? 'a baby' : a}`); }
  } else {
    family.push(sp ? `${sp.alive ? 'Married to' : 'Widowed: was married to'} ${displayName(sp)}` : 'Not married');
    for (const kid of c.childrenIds.map((k) => s.characters[k]).filter((k): k is Character => !!k)) family.push(`${kid.gender === 'M' ? 'Son' : 'Daughter'} ${displayName(kid)}, ${kid.alive ? ageOn(kid.birth, s.date) : 'died'}`);
    if (c.household?.kids.length && !c.childrenIds.length) for (const k of c.household.kids) family.push(`${k.male ? 'Son' : 'Daughter'} ${k.name}, ${Math.max(0, s.week - k.born) / 52 < 1 ? 'a baby' : Math.floor((s.week - k.born) / 52)}`);
  }
  if (c.motherId && s.characters[c.motherId]?.alive) family.push(`Mother: ${displayName(s.characters[c.motherId])}`);
  if (c.fatherId && s.characters[c.fatherId]?.alive) family.push(`Father: ${displayName(s.characters[c.fatherId])}`);

  // Money, as far as you know.
  const money: string[] = [];
  const knowsMoney = isBoss || c.faction === 'player' || c.dynasty || !!p?.payroll || !!p?.met;
  if (p && shown) {
    if (p.price && adultOn(s)) money.push(`Her price: ${$(p.price)} an evening`);
    if (knowsMoney && p.earn) money.push(`Made about ${$(p.earn)} last week${p.payroll ? `; kicks back ${Math.round(kickbackRate(p.earn) * 100)}% to the Family` : ''}`);
    if (knowsMoney) money.push(`Savings: ${p.savings >= 10000 ? 'a nice nest egg' : p.savings >= 3000 ? 'something put by' : 'not much'} (as far as you know)`);
    if (p.role === 'madam') { const h = s.nightlife?.houses[p.id]; if (h) money.push(`Her house took about ${$(h.take)} last week`); }
  } else if (!p) {
    money.push(knowsMoney ? `Worth ${seenWealth(s, c)}` : 'You don\'t know; you would have to ask around');
    if (c.lastEarn && c.faction === 'player') money.push(`Brought in ${$(c.lastEarn)} last week`);
  }
  if (!money.length) money.push('Keeps her money to herself');

  // You and them.
  const you: CardLine[] = [];
  if (!isBoss) {
    const op = opinion(s, c.id, boss.id);
    you.push({ label: 'Thinks of you', text: `${opinionWord(op)} (${op >= 0 ? '+' : ''}${op})`, tone: op >= 25 ? 'good' : op <= -25 ? 'bad' : undefined });
    if (c.id === boss.spouseId) you.push({ label: 'Your', text: c.gender === 'F' ? 'wife' : 'husband' });
    const b = s.dating?.bonds[c.id];
    if (b || romanceBetween(s, boss.id, c.id)) you.push({ label: 'Between you', text: `${STAGE_LABEL[stageOf(s, c.id)]}${b ? `; ${his} feelings: ${affectionWord(b.aff)}` : ''}` });
    const g = goomarOf(s, c.id);
    if (g) you.push({ label: 'Your goomar', text: `Since week ${g.since}: ${g.where}, ${$(g.rent + g.allowance)} a week from your pocket${g.wifeKnows ? '; your wife knows' : ''}`, tone: 'warn' });
    if (p) {
      if (p.payroll) you.push({ label: 'Payroll', text: `On your payroll since week ${p.payroll.since}; ${$(p.payroll.paid)} kicked back so far`, tone: 'good' });
      you.push({ label: 'Trusts you', text: `${p.loyalty} of 100` });
      if (p.attach >= 20) you.push({ label: 'Attached to you', text: p.attach >= 70 ? 'Very: she wants more of you' : p.attach >= 40 ? 'Growing' : 'A little', tone: p.attach >= 70 ? 'warn' : undefined });
      const pr = s.nightlife?.promises.filter((x) => x.who === c.id && (x.kind !== 'adult' || adultOn(s))) ?? [];
      for (const x of pr) you.push({ label: 'A promise', text: x.status === 'open' ? `You promised an introduction (${x.kind === 'record' ? 'a record man' : x.kind === 'film' ? 'a film producer' : 'an adult-picture producer'}): due by week ${x.due}` : `${x.status === 'kept' ? 'Kept' : 'Broken'}: ${x.result ?? 'you never called'}`, tone: x.status === 'broken' ? 'bad' : x.status === 'kept' ? 'good' : 'warn' });
    }
  }

  // What they want.
  const wants: string[] = [];
  if (p) {
    wants.push(NGOAL_TEXT[p.goal]);
    if (p.dream && (p.dream !== 'adult' || adultOn(s)) && shown) wants.push(p.dream === 'record' ? 'Dreams of making a record' : p.dream === 'film' ? 'Dreams of getting into pictures' : 'Has said she would do adult pictures, on her own terms');
  } else {
    wants.push(c.goal ? GOAL_INFO[c.goal] : c.ambition);
  }

  // Rumors and what is known.
  const rumors: CallingCardView['rumors'] = [];
  for (const x of knownSecrets(s, c.id)) rumors.push({ text: x.text, label: 'Known' });
  for (const r of (s.dating?.rumors ?? []).filter((x) => x.about === c.id).slice(-3)) rumors.push({ text: r.text, label: 'Rumor' });
  for (const g of (s.nightlife?.npc ?? []).filter((x) => x.known && x.ended === undefined && (x.man === c.id || x.her === c.id))) {
    const o = s.characters[g.man === c.id ? g.her : g.man];
    if (o) rumors.push({ text: g.man === c.id ? `Keeps ${displayName(o)} in an apartment` : `${displayName(o)} keeps her in an apartment`, label: 'Rumor' });
  }
  for (const k of (s.ears?.links ?? []).filter((x) => !x.hidden && x.ended === undefined && (x.a === c.id || x.b === c.id) && x.type !== 'mistress').slice(0, 3)) {
    const o = s.characters[k.a === c.id ? k.b : k.a];
    if (o) rumors.push({ text: `${k.a === c.id ? `${he} is sweet on` : 'Seen with'} ${displayName(o)} (${k.type.replace('_', ' ')})`, label: 'Rumor' });
  }
  if (c.vices?.length) for (const v of c.vices) rumors.push({ text: VICE_INFO[v], label: 'Rumor' });

  // The summary: the friendly first screen.
  const summary: CardLine[] = [];
  summary.push({ label: 'Family', text: p ? familyLine(s, p) : family[0] });
  summary.push({ label: 'Known for', text: [l.tierLabel, ...c.traits.slice(0, 2)].filter(Boolean).join(', ') || 'Nothing in particular' });
  summary.push({ label: 'Wants', text: wants[0] });
  if (!isBoss) summary.push(you[0]);
  const g = goomarOf(s, c.id);
  if (g) summary.push({ label: 'Your goomar', text: g.where, tone: 'warn' });
  if (p && shown && p.price && adultOn(s)) summary.push({ label: 'Her price', text: `${$(p.price)} an evening (she decides who she sees)` });
  if (p?.seeking && p.seeking >= s.week) summary.push({ label: 'Looking for work', text: 'Her madam brought her to you', tone: 'good' });
  if (p && p.role !== 'madam' && !g && romanceBetween(s, boss.id, c.id)) {
    const t = goomarTerms(s, c.id);
    summary.push({ label: 'Could be your goomar', text: `If she agrees: ${$(t.rent + t.allowance)} a week from your pocket` });
  }

  const imp = !isBoss && ageOn(boss.birth, s.date) >= 18 ? appeal(s, boss, c) : undefined;
  return {
    id, name: displayName(c), gender: c.gender, age, born: formatDate(c.birth), role, place, side: p ? sideName(s, p.side) : FACTION_NAMES[c.faction],
    summary, looks: l, impression: imp ? `${impressionWord(imp.value)}${imp.reasons.length ? ` (${imp.reasons.map((r) => r.label).join(', ')})` : ''}` : undefined,
    traits: c.traits.map((t) => ({ name: t, text: TRAIT_INFO[t] })),
    skills: skillLines(s, c).map((x) => ({ label: SKILL_LABEL[x.skill], learned: x.learned, effective: x.effective, why: x.why })),
    health: c.health, aging: knownOld(s, c).map((k) => ({ label: k.label, sure: k.sure, text: k.text })), agingLooks: l.aging,
    family, money, you, wants, rumors,
    lines: p && (p.met || p.payroll) ? p.bounds.filter((b) => b !== 'careful' || adultOn(s)).map((b) => NBOUND_TEXT[b]) : [],
    story: (shown ? p?.hist ?? [] : []).slice(-6).reverse().map(([week, text]) => ({ week, text })),
  };
}

export { MARITAL_LABEL };
