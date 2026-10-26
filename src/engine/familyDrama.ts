import { ageOn } from './calendar';
import { displayName, hasTrait, player, relationLabel } from './characters';
import { bloodLine, chooseHeir } from './dynasty';
import { houseLabel, marriageable } from './familyHouses';
import { dowryFor, marriageAcceptance, ourMarriageable } from './familyMarriage';
import { cooldownReady, ensureDynState, fam, famMut, houseOf, setCooldown, type LifePath } from './familyState';
import { CHILDHOOD_PAIRS, educationLabel, leaningPath, openPaths, PATH_INFO } from './familyTraits';
import { opinion } from './relations';
import { chance, pick, rand, randInt, weightedPick } from './rng';
import type { Character, Choice, Effect, EventInstance, GameState } from './types';
import { makeDynCharacter } from './familyState';

/**
 * Family drama with consequences (CK character events), driven by who
 * people are: affairs, a wife who finds the money, a spouse who could flip,
 * a bastard with a claim, sibling rivalry, a black-sheep brother, a cousin
 * in the Feds' sights, an in-law feud, an heir who wants out. Each has a
 * per-person cooldown; at most one surfaces in a week, and all of them go
 * through the normal popup cap.
 */

function iid(s: GameState): string {
  return `ev${s.nextId++}`;
}

const dyn = (s: GameState) => ensureDynState(s);

function dynFx(op: Extract<Effect, { type: 'dyn' }>['op'], label: string): Effect {
  return { type: 'dyn', op, label };
}

function event(s: GameState, defId: string, title: string, text: string, choices: Choice[], actors: string[], priority = 48, mandatory = false, meta: Record<string, string | number> = {}): EventInstance {
  return { iid: iid(s), defId, title, text, week: s.week, mandatory, priority, defaultChoiceId: choices[0].id, choices, actors: actors.slice(0, 3), meta: { family: 1, ...meta } };
}

function adult(s: GameState, c: Character, a = 18): boolean {
  return ageOn(c.birth, s.date) >= a;
}

function wifeOf(s: GameState, c: Character): Character | undefined {
  const w = c.spouseId ? s.characters[c.spouseId] : undefined;
  return w?.alive ? w : undefined;
}

/** Sons and daughters of the boss, alive. */
function kidsOf(s: GameState, c: Character): Character[] {
  return c.childrenIds.map((id) => s.characters[id]).filter((k): k is Character => !!k?.alive && k.dynasty);
}

function siblingsOf(s: GameState, c: Character): Character[] {
  if (!c.fatherId) return [];
  return Object.values(s.characters).filter((o) => o.alive && o.id !== c.id && o.fatherId === c.fatherId && o.dynasty);
}

/* ---------------------------------------------------------------- */
/* Drama definitions                                                  */
/* ---------------------------------------------------------------- */

interface Drama {
  key: string;
  weight: number;
  /** The character it is about, if it can fire. */
  who: (s: GameState) => Character | undefined;
  cooldown: number;
  build: (s: GameState, c: Character) => EventInstance | undefined;
}

const DRAMAS: Drama[] = [
  {
    key: 'affair', weight: 3, cooldown: 52,
    who: (s) => {
      const boss = player(s);
      const men = [boss, ...kidsOf(s, boss), ...siblingsOf(s, boss)].filter((c) => c.gender === 'M' && wifeOf(s, c) && adult(s, c, 21));
      return men.find((c) => hasTrait(c, 'Womanizer') || (c.id === boss.id && fam(s, c.id).stress >= 50 && hasTrait(c, 'Charming')));
    },
    build: (s, c) => {
      const isBoss = c.id === s.playerId;
      const label = `Late nights: ${c.firstName}`;
      const w = wifeOf(s, c)!;
      return event(s, 'dyn_affair', isBoss ? 'Late nights at the Bolero' : `${c.firstName}'s late nights`,
        isBoss
          ? `The hatcheck girl at the Bolero has started calling the house and hanging up when ${w.firstName} answers. You know how this ends.`
          : `${displayName(c)} has been seen leaving the Bolero at four in the morning with a girl who is not ${w.firstName}. ${w.firstName}'s mother has started to ask questions.`,
        [
          { id: 'end', label: isBoss ? 'End it tonight' : `Tell ${c.firstName} to end it`, because: isBoss ? 'ended an affair' : `told ${c.firstName} to end his affair`, effects: [
            dynFx({ op: 'stress', charId: c.id, amount: 6, source: 'domestic' }, label),
            ...(isBoss ? [] : [{ type: 'opinion', from: c.id, to: s.playerId, amount: -6, reason: 'Minds my business', decay: 1, label } as Effect]),
          ] },
          { id: 'discreet', label: 'Keep it discreet', detail: 'A secret someone could find.', because: isBoss ? 'kept a woman on the side' : `looked the other way on ${c.firstName}'s affair`, effects: [
            dynFx({ op: 'secret', charId: c.id, kind: 'affair' }, label),
            dynFx({ op: 'stress', charId: c.id, amount: -8, source: 'domestic' }, label),
          ] },
          { id: 'apartment', label: 'An apartment in Ocean City', detail: '$2,000, and the kind of secret that can have a child.', because: isBoss ? 'set a woman up in an apartment' : `paid for ${c.firstName}'s apartment`, effects: [
            { type: 'money', pot: 'pocket', amount: -2000, label },
            dynFx({ op: 'secret', charId: c.id, kind: 'affair' }, label),
            dynFx({ op: 'secret', charId: c.id, kind: 'bastard' }, label),
            dynFx({ op: 'stress', charId: c.id, amount: -12, source: 'domestic' }, label),
          ] },
        ], [c.id]);
    },
  },
  {
    key: 'money', weight: 3, cooldown: 78,
    who: (s) => {
      const boss = player(s);
      const w = wifeOf(s, boss);
      return w && (s.unwashed >= 8000 || s.money >= 60000) ? w : undefined;
    },
    build: (s, w) => {
      const label = `${w.firstName} found the money`;
      const amt = Math.round(Math.max(s.unwashed, 8000) / 1000) * 1000;
      return event(s, 'dyn_money', `${w.firstName} found the money`, `${displayName(w)} went down to the cellar for the Christmas lights and found a shoebox — $${amt.toLocaleString('en-US')} in rubber bands. She is sitting at the kitchen table with it when you come home.`, [
        { id: 'allowance', label: 'A household allowance', detail: 'And a mink for Christmas.', because: `gave ${w.firstName} an allowance`, effects: [{ type: 'money', pot: 'pocket', amount: -1500, label }, { type: 'opinion', from: w.id, to: s.playerId, amount: 10, reason: 'Takes care of the house', decay: 1, label }] },
        { id: 'truth', label: 'Tell her the truth', because: `told ${w.firstName} the truth about the money`, effects: [
          { type: 'opinion', from: w.id, to: s.playerId, amount: hasTrait(w, 'Honest') || hasTrait(w, 'Pious') ? -15 : -4, reason: 'The truth about the money', decay: 1, label },
          { type: 'meter', from: w.id, to: s.playerId, meter: 'trust', amount: 15, label },
          dynFx({ op: 'stress', charId: s.playerId, amount: -4, source: 'domestic' }, label),
        ] },
        { id: 'lie', label: 'It\'s the restaurant\'s', because: `lied to ${w.firstName} about the money`, effects: [
          { type: 'opinion', from: w.id, to: s.playerId, amount: -10, reason: 'Lies to me', decay: 1, label },
          dynFx({ op: 'stress', charId: s.playerId, amount: 5, source: 'domestic' }, label),
        ] },
      ], [w.id]);
    },
  },
  {
    key: 'flip', weight: 5, cooldown: 52,
    who: (s) => {
      const w = wifeOf(s, player(s));
      return w && opinion(s, w.id, s.playerId) <= -25 && s.heat.federal >= 30 ? w : undefined;
    },
    build: (s, w) => {
      const label = `${w.firstName} and the lawyer`;
      const settle = Math.min(20000, Math.max(3000, Math.round(Math.max(0, s.money) * 0.3 / 100) * 100));
      return event(s, 'dyn_flip', `${w.firstName} has a lawyer`, `${displayName(w)} has been driving to a lawyer in Cape May Court House every Tuesday. The lawyer has been taking calls from Newark. She knows where the shoebox is, and she knows who comes to the house.`, [
        { id: 'winback', label: 'Win her back', detail: 'Flowers, a week in Miami Beach, and a promise.', because: `won ${w.firstName} back`, effects: [{ type: 'money', pot: 'pocket', amount: -3000, label }, { type: 'opinion', from: w.id, to: s.playerId, amount: 25, reason: 'He came back to me', decay: 1, label }, dynFx({ op: 'stress', charId: s.playerId, amount: -5, source: 'domestic' }, label)] },
        { id: 'settle', label: `A settlement ($${settle.toLocaleString('en-US')})`, detail: 'She keeps the house and keeps quiet.', because: `paid ${w.firstName} to keep quiet`, effects: [{ type: 'money', pot: 'pocket', amount: -settle, label }, { type: 'opinion', from: w.id, to: s.playerId, amount: 15, reason: 'Took care of me', decay: 1, label }, { type: 'heat', bar: 'federal', amount: 3, label }] },
        { id: 'talk', label: 'Let her talk — she knows nothing', because: `let ${w.firstName} talk to the FBI`, effects: [{ type: 'heat', bar: 'federal', amount: 15, label }, { type: 'heat', bar: 'local', amount: 4, label }, dynFx({ op: 'stress', charId: s.playerId, amount: 12, source: 'paranoia' }, label), { type: 'familyOpinion', amount: -6, reason: 'Let his own wife go to the Feds', label }] },
      ], [w.id], 56);
    },
  },
  {
    key: 'bastard', weight: 4, cooldown: 156,
    who: (s) => {
      const boss = player(s);
      const sec = s.secrets.find((x) => x.ownerId === boss.id && x.kind === 'bastard');
      if (!sec || Object.values(dyn(s).people).some((p) => p.bastardOf === boss.id)) return undefined;
      return boss;
    },
    build: (s, boss) => {
      const label = 'A young man from Atlantic City';
      const old = ageOn(boss.birth, s.date) >= 40;
      const kid = makeDynCharacter(s, { gender: 'M', ethnicity: boss.ethnicity, age: old ? randInt(dyn(s), 16, 21) : randInt(dyn(s), 1, 4), rank: 'civilian', faction: 'none', nickname: false });
      kid.lastName = pick(dyn(s), ['Russo', 'Greco', 'Leone', 'Marino', 'DeLuca']);
      const kp = famMut(s, kid.id);
      kp.bastardOf = boss.id;
      kp.goal = old ? 'the_chair' : 'grow_up';
      kid.ambition = old ? 'Take his father\'s name' : 'Grow up';
      return event(s, 'dyn_bastard', 'A young man from Atlantic City', old
        ? `A young man of ${ageOn(kid.birth, s.date)} has been asking for you at the Shamrock. He has your jaw and your temper. His mother worked the coat check at the Bolero, a long time ago.`
        : `A woman you knew in Atlantic City sent a photograph of a little boy named ${kid.firstName}. On the back she wrote your name.`, [
        { id: 'recognize', label: 'Recognize him', detail: 'He takes your name — and a place in the line of succession, by age.', because: `recognized ${kid.firstName} as your son`, effects: [
          dynFx({ op: 'legitimize', charId: kid.id }, label),
          { type: 'familyOpinion', amount: -8, reason: 'Brought his bastard into the house', label },
          dynFx({ op: 'stress', charId: boss.id, amount: -6, source: 'honor' }, label),
        ] },
        { id: 'pay', label: 'Pay his mother', detail: '$3,000 a year to stay in Atlantic City. He may not stay quiet forever.', because: `paid to keep ${kid.firstName} quiet`, effects: [{ type: 'money', pot: 'pocket', amount: -3000, label }, dynFx({ op: 'claimant', charId: kid.id, on: old }, label)] },
        { id: 'deny', label: 'Deny everything', because: `denied ${kid.firstName}`, effects: [dynFx({ op: 'claimant', charId: kid.id, on: true }, label), dynFx({ op: 'stress', charId: boss.id, amount: 6, source: 'honor' }, label), { type: 'opinion', from: kid.id, to: boss.id, amount: -30, reason: 'Denied me', decay: 0, label }] },
      ], [kid.id], 52);
    },
  },
  {
    key: 'rivalry', weight: 4, cooldown: 52,
    who: (s) => {
      const boss = player(s);
      const heir = chooseHeir(s, boss).heir;
      if (!heir) return undefined;
      return kidsOf(s, boss).concat(siblingsOf(s, boss)).find((c) => c.id !== heir.id && c.gender === 'M' && adult(s, c) && (fam(s, c.id).goal === 'the_chair' || hasTrait(c, 'Ambitious')) && opinion(s, c.id, heir.id) < 15);
    },
    build: (s, c) => {
      const boss = player(s);
      const heir = chooseHeir(s, boss).heir!;
      const label = `${c.firstName} against ${heir.firstName}`;
      return event(s, 'dyn_rivalry', 'Sibling rivalry', `${displayName(c)} says what everyone at the table is thinking: ${heir.firstName} is not fit to sit in the chair. ${heir.firstName} puts his fork down. The women take the children into the kitchen.`, [
        { id: 'back', label: `Back ${heir.firstName}`, because: `backed ${heir.firstName} as heir`, effects: [{ type: 'opinion', from: c.id, to: boss.id, amount: -15, reason: 'Passed me over', decay: 1, label }, { type: 'opinion', from: heir.id, to: boss.id, amount: 10, reason: 'Backed me', decay: 1, label }, { type: 'opinion', from: c.id, to: heir.id, amount: -10, reason: 'Took what should be mine', decay: 1, label }] },
        { id: 'share', label: `Give ${c.firstName} his own end`, detail: '$3,000 and a piece of the docks.', because: `gave ${c.firstName} his own end`, effects: [{ type: 'money', pot: 'pocket', amount: -3000, label }, { type: 'opinion', from: c.id, to: boss.id, amount: 15, reason: 'Gave me my own end', decay: 1, label }, dynFx({ op: 'goal', charId: c.id, goal: 'own_business' }, label)] },
        { id: 'switch', label: `Make ${c.firstName} your heir`, detail: 'Appoint him. The house will talk.', because: `named ${c.firstName} heir over ${heir.firstName}`, effects: [dynFx({ op: 'appoint', charId: c.id }, label), { type: 'opinion', from: heir.id, to: boss.id, amount: -30, reason: 'Took the chair from me', decay: 0, label }, { type: 'opinion', from: c.id, to: boss.id, amount: 20, reason: 'Named me heir', decay: 1, label }, dynFx({ op: 'goal', charId: heir.id, goal: 'the_chair' }, label)] },
      ], [c.id, heir.id], 50);
    },
  },
  {
    key: 'blacksheep', weight: 3, cooldown: 40,
    who: (s) => {
      const boss = player(s);
      return siblingsOf(s, boss).concat(kidsOf(s, boss)).find((c) => c.gender === 'M' && adult(s, c, 20) && (hasTrait(c, 'Gambler') || hasTrait(c, 'Drinker') || hasTrait(c, 'Hot-headed')));
    },
    build: (s, c) => {
      const boss = player(s);
      const rel = relationLabel(s, boss, c);
      const label = `Your ${rel} ${c.firstName}`;
      const debt = hasTrait(c, 'Gambler');
      return event(s, 'dyn_blacksheep', `The black sheep`, debt
        ? `Your ${rel} ${displayName(c)} owes $4,000 to a bookmaker in Atlantic City — and has been telling him to collect from you.`
        : `Your ${rel} ${displayName(c)} broke a bartender's jaw at the Riptide and told the cops whose ${rel} he is.`, [
        { id: 'pay', label: debt ? 'Pay his debts' : 'Pay the bartender and the cops', because: `cleaned up after your ${rel}`, effects: [{ type: 'money', amount: debt ? -4000 : -1500, label }, { type: 'opinion', from: c.id, to: boss.id, amount: 10, reason: 'Bailed me out', decay: 1, label }, { type: 'respect', amount: -1, label }] },
        { id: 'cut', label: 'Cut him off', because: `cut off your ${rel}`, effects: [{ type: 'opinion', from: c.id, to: boss.id, amount: -20, reason: 'Cut me off', decay: 1, label }, dynFx({ op: 'stress', charId: boss.id, amount: 4, source: 'domestic' }, label), ...(debt ? [] : [{ type: 'heat', bar: 'local', amount: 3, label } as Effect])] },
        { id: 'work', label: 'Put him to work', detail: c.rank === 'civilian' ? 'Bring him in as an associate.' : 'Give him real work and watch him.', because: `put your ${rel} to work`, effects: [...(c.rank === 'civilian' ? [{ type: 'recruit', charId: c.id, label } as Effect] : []), { type: 'opinion', from: c.id, to: boss.id, amount: 5, reason: 'Gave me a chance', decay: 1, label }, { type: 'money', amount: debt ? -2000 : -500, label }] },
      ], [c.id]);
    },
  },
  {
    key: 'feds', weight: 4, cooldown: 52,
    who: (s) => Object.values(s.characters).find((c) => c.alive && c.dynasty && c.id !== s.playerId && c.faction === 'player' && c.rank !== 'civilian' && ((c.evidence ?? 0) >= 30 || s.heat.federal >= 55) && (c.imprisonedUntil ?? 0) <= s.week),
    build: (s, c) => {
      const boss = player(s);
      const rel = relationLabel(s, boss, c) === 'kin' ? 'cousin' : relationLabel(s, boss, c);
      const label = `The Feds and your ${rel}`;
      return event(s, 'dyn_feds', `Your ${rel} in the Feds' sights`, `Two agents picked up your ${rel} ${displayName(c)} outside a diner in Rio Grande and kept him nine hours. He says he told them nothing. He is sweating through his shirt.`, [
        { id: 'lawyer', label: 'The best lawyer in Philadelphia', detail: '$3,000. The file gets thinner.', because: `got your ${rel} a lawyer`, effects: [{ type: 'money', pot: 'pocket', amount: -3000, label }, dynFx({ op: 'evidence', charId: c.id, amount: -25 }, label), { type: 'opinion', from: c.id, to: boss.id, amount: 10, reason: 'Got me a lawyer', decay: 1, label }] },
        { id: 'florida', label: 'Send him to Florida for a while', detail: 'Six months in Hallandale. Out of reach.', because: `sent your ${rel} to Florida`, effects: [dynFx({ op: 'away', charId: c.id, weeks: 26 }, label), dynFx({ op: 'evidence', charId: c.id, amount: -35 }, label), { type: 'money', pot: 'pocket', amount: -1000, label }, { type: 'opinion', from: c.id, to: boss.id, amount: -5, reason: 'Sent me away', decay: 1, label }] },
        { id: 'trust', label: 'He knows to keep quiet', because: `trusted your ${rel} to keep quiet`, effects: [dynFx({ op: 'stress', charId: boss.id, amount: 8, source: 'paranoia' }, label), { type: 'heat', bar: 'federal', amount: 3, label }, { type: 'opinion', from: c.id, to: boss.id, amount: 5, reason: 'Trusts me', decay: 1, label }] },
      ], [c.id], 52);
    },
  },
  {
    key: 'inlaws', weight: 3, cooldown: 52,
    who: (s) => Object.values(s.characters).find((c) => {
      if (!c.alive || !c.dynasty || !c.maidenName || c.maidenName === s.houseName) return false;
      const h = houseOf(s, c.id);
      const head = h ? s.characters[h.headId] : undefined;
      return !!head?.alive && opinion(s, head.id, s.playerId) < 15;
    }),
    build: (s, wife) => {
      const h = houseOf(s, wife.id)!;
      const head = s.characters[h.headId];
      const label = `${h.name}: an in-law feud`;
      return event(s, 'dyn_inlaws', 'An in-law feud', `${displayName(head)} says the house of ${s.houseName} shamed his daughter ${wife.firstName} — seated at the wrong table at the christening, and nobody stood when she came in. ${h.name} remembers these things.`, [
        { id: 'apologize', label: 'Flowers and an apology', because: `apologized to ${h.name}`, effects: [{ type: 'money', pot: 'pocket', amount: -1000, label }, { type: 'opinion', from: head.id, to: s.playerId, amount: 15, reason: 'Apologized properly', decay: 1, label }, { type: 'opinion', from: wife.id, to: s.playerId, amount: 5, reason: 'Made peace with my father', decay: 1, label }] },
        { id: 'remind', label: 'Remind them who they married into', because: `put ${h.name} in its place`, effects: [{ type: 'opinion', from: head.id, to: s.playerId, amount: -15, reason: 'Insulted my family', decay: 1, label }, { type: 'opinion', from: wife.id, to: s.playerId, amount: -10, reason: 'Insulted my father', decay: 1, label }, { type: 'respect', amount: 1, label }] },
      ], [head.id, wife.id]);
    },
  },
  {
    key: 'heirout', weight: 4, cooldown: 78,
    who: (s) => {
      const heir = chooseHeir(s, player(s)).heir;
      return heir && heir.id !== s.playerId && adult(s, heir) && (fam(s, heir.id).goal === 'get_out' || fam(s, heir.id).path === 'straight' || fam(s, heir.id).path === 'priest') ? heir : undefined;
    },
    build: (s, heir) => {
      const boss = player(s);
      const label = `${heir.firstName} wants out`;
      const alt = bloodLine(s, boss).find((c) => c.id !== heir.id && adult(s, c) && c.gender === 'M');
      const choices: Choice[] = [
        { id: 'force', label: 'This is your life now', detail: 'He stays heir. He will not forgive it soon.', because: `made ${heir.firstName} stay in the life`, effects: [{ type: 'opinion', from: heir.id, to: boss.id, amount: -20, reason: 'Won\'t let me go', decay: 1, label }, dynFx({ op: 'stress', charId: heir.id, amount: 15, source: 'honor' }, label), dynFx({ op: 'goal', charId: heir.id, goal: 'the_chair' }, label)] },
        { id: 'legit', label: 'Give him the legitimate side', detail: 'He runs the fronts and stays heir.', because: `gave ${heir.firstName} the legitimate side`, effects: [dynFx({ op: 'path', charId: heir.id, path: 'fronts' }, label), dynFx({ op: 'goal', charId: heir.id, goal: 'own_business' }, label), { type: 'opinion', from: heir.id, to: boss.id, amount: 10, reason: 'Gave me something clean', decay: 1, label }] },
      ];
      if (alt) choices.unshift({ id: 'let', label: `Let him go — ${alt.firstName} is heir`, because: `let ${heir.firstName} leave the life`, effects: [dynFx({ op: 'appoint', charId: alt.id }, label), dynFx({ op: 'path', charId: heir.id, path: 'straight' }, label), { type: 'opinion', from: heir.id, to: boss.id, amount: 20, reason: 'Let me live my own life', decay: 1, label }, { type: 'opinion', from: alt.id, to: boss.id, amount: 15, reason: 'Named me heir', decay: 1, label }] });
      return event(s, 'dyn_heirout', `${heir.firstName} wants out`, `${displayName(heir)} waits until the dishes are done. "I don't want this, Pop. Not the club, not the envelopes, not the chair." He has a job offer from a bank in Philadelphia.`, choices, [heir.id], 54);
    },
  },
];

/* ---------------------------------------------------------------- */
/* Growing up                                                         */
/* ---------------------------------------------------------------- */

/** A childhood temperament event for a child of the house (7-13). */
export function buildChildhood(s: GameState, c: Character): EventInstance {
  const d = dyn(s);
  const free = CHILDHOOD_PAIRS.filter(([a, b]) => !hasTrait(c, a) && !hasTrait(c, b));
  const [good, other, what] = free.length ? pick(d, free) : CHILDHOOD_PAIRS[0];
  const label = `${c.firstName}'s childhood`;
  famMut(s, c.id).childhood++;
  return event(s, 'dyn_childhood', `${c.firstName} ${what}`, `${displayName(c)}, ${ageOn(c.birth, s.date)}, ${what}. The nuns want to see a parent. How the boss handles it now is how ${c.gender === 'M' ? 'he' : 'she'} will remember it.`, [
    { id: 'a', label: `Encourage it`, detail: `${c.firstName} becomes ${good}.`, because: `encouraged ${c.firstName}`, effects: [dynFx({ op: 'trait', charId: c.id, trait: good }, label), { type: 'opinion', from: c.id, to: s.playerId, amount: 5, reason: 'Took my side', decay: 1, label }] },
    { id: 'b', label: `Correct it`, detail: `${c.firstName} becomes ${other}.`, because: `corrected ${c.firstName}`, effects: [dynFx({ op: 'trait', charId: c.id, trait: other }, label)] },
    { id: 'c', label: 'Leave it to the nuns', because: `left ${c.firstName} to the nuns`, effects: [] },
  ], [c.id], 34);
}

/** Coming of age at 16: the education is finished; which path will the child take? */
export function buildComingOfAge(s: GameState, c: Character): EventInstance {
  const leaning = leaningPath(s, c);
  const p = fam(s, c.id);
  const edu = educationLabel(p.education);
  const label = `${c.firstName} comes of age`;
  const paths = openPaths(c);
  const choices: Choice[] = [leaning, ...paths.filter((x) => x !== leaning)].map((path: LifePath) => ({
    id: path,
    label: `${PATH_INFO[path].name}${path === leaning ? ' (what he wants)'.replace('he', c.gender === 'M' ? 'he' : 'she') : ''}`,
    detail: PATH_INFO[path].text,
    because: `set ${c.firstName} on the path: ${PATH_INFO[path].name.toLowerCase()}`,
    effects: [
      dynFx({ op: 'comeOfAge', charId: c.id, path }, label),
      { type: 'opinion', from: c.id, to: s.playerId, amount: path === leaning ? 10 : -15, reason: path === leaning ? 'Let me choose my life' : 'Chose my life for me', decay: 1, label } as Effect,
    ],
  }));
  return event(s, 'dyn_comeofage', `${c.firstName} comes of age`, `${displayName(c)} turns sixteen.${edu ? ` ${c.gender === 'M' ? 'He' : 'She'} comes home ${edu.toLowerCase().replace(/\(.*\)/, '').trim()} — ${p.education ? ['', 'a poor student', 'a fair one', 'a good one', 'the best of the class'][p.education.tier] : ''}.` : ''} ${c.gender === 'M' ? 'He' : 'She'} wants to talk about the future.`, choices, [c.id], 66, true, { subject: c.id });
}

/** Another house proposes a match. */
export function buildProposal(s: GameState): EventInstance | undefined {
  const d = dyn(s);
  const ours = ourMarriageable(s).filter((c) => c.id !== s.playerId);
  if (!ours.length) return undefined;
  const member = pick(d, ours);
  const pool = d.houses.flatMap((h) => marriageable(s, h).filter((c) => c.gender !== member.gender).map((c) => ({ h, c })));
  if (!pool.length) return undefined;
  const { h, c } = weightedPick(d, pool, (x) => 1 + x.h.strength / 20 + Math.max(0, marriageAcceptance(s, member, x.c).chance * 3)) ?? pool[0];
  const head = s.characters[h.headId];
  const dowry = dowryFor(s, member, h, false);
  const label = `A match from ${h.name}`;
  return event(s, 'dyn_proposal', `${h.name} proposes a match`, `${head ? displayName(head) : h.name} sends word through the monsignor: ${h.name} would be honored if ${displayName(member)} would marry ${c.firstName} ${c.lastName}, ${ageOn(c.birth, s.date)}. ${h.blurb}`, [
    { id: 'accept', label: 'Accept the match', detail: dowry ? `Dowry: ${dowry > 0 ? 'they pay' : 'you pay'} $${Math.abs(dowry).toLocaleString('en-US')}. An alliance with ${h.name}.` : `An alliance with ${h.name}.`, because: `accepted a match with ${h.name}`, effects: [
      dynFx({ op: 'marry', memberId: member.id, spouseId: c.id }, label),
      ...(dowry ? [{ type: 'money', amount: dowry, label: `${label}: dowry` } as Effect] : []),
    ] },
    { id: 'decline', label: 'Politely decline', because: `declined ${h.name}'s match`, effects: head?.alive ? [{ type: 'opinion', from: head.id, to: s.playerId, amount: -6, reason: 'Turned down our match', decay: 1, label }] : [] },
  ], [member.id, c.id], 44, false, { house: h.id, houseLabel: houseLabel(s, c) ?? '' });
}

/** A claimant presses his claim after a succession. */
export function buildClaim(s: GameState, c: Character): EventInstance {
  const boss = player(s);
  const label = `${c.firstName}'s claim`;
  const p = fam(s, c.id);
  const why = p.bastardOf ? 'he is the old man\'s blood, recognized or not' : 'the chair should have been his';
  return event(s, 'dyn_claim', `${c.firstName} presses a claim`, `${displayName(c)} tells anyone at the Shamrock who will listen that ${why}. A few of the older men are listening. ${boss.firstName}, this has to be settled before it spreads.`, [
    { id: 'buy', label: 'Buy him off', detail: '$5,000 and a car lot in Rio Grande.', because: `bought off ${c.firstName}'s claim`, effects: [{ type: 'money', pot: 'pocket', amount: -5000, label }, dynFx({ op: 'claimant', charId: c.id, on: false }, label), { type: 'opinion', from: c.id, to: boss.id, amount: 15, reason: 'Made it right', decay: 1, label }] },
    { id: 'capos', label: 'Let the capos speak for you', detail: 'Respect pays for it.', because: `let the capos settle ${c.firstName}'s claim`, effects: [{ type: 'respect', amount: -4, label }, dynFx({ op: 'claimant', charId: c.id, on: false }, label), { type: 'crewOpinion', amount: 3, reason: 'Asked our counsel', label }] },
    { id: 'exile', label: 'Run him off the island', detail: 'He may turn up with a rival crew.', because: `ran ${c.firstName} off the island`, effects: [{ type: 'exile', charId: c.id, label }, dynFx({ op: 'claimant', charId: c.id, on: false }, label), { type: 'respect', amount: 2, label }] },
  ], [c.id], 70, true);
}

/**
 * The family event source: at most one drama a week (or a match proposal),
 * with per-person cooldowns and a household cooldown so the house does not
 * dominate the week. Registered with the normal popup pipeline.
 */
export function familyEventSource(s: GameState): EventInstance | undefined {
  if (!s.dyn || s.gameOver) return undefined;
  const d = dyn(s);
  if (!cooldownReady(s, 'drama', 3)) return undefined;
  if (rand(d) > 0.45) return undefined;
  if (cooldownReady(s, 'proposal', 16) && rand(d) < 0.3) {
    const ev = buildProposal(s);
    if (ev) {
      setCooldown(s, 'proposal');
      setCooldown(s, 'drama');
      return ev;
    }
  }
  const ready = DRAMAS.map((x) => ({ x, c: cooldownReady(s, `drama_${x.key}`, Math.round(x.cooldown / 2)) ? x.who(s) : undefined })).filter((o) => o.c && cooldownReady(s, `drama_${o.x.key}_${o.c.id}`, o.x.cooldown));
  const pickd = weightedPick(d, ready, (o) => o.x.weight);
  if (!pickd || !pickd.c) return undefined;
  const ev = pickd.x.build(s, pickd.c);
  if (!ev) return undefined;
  setCooldown(s, 'drama');
  setCooldown(s, `drama_${pickd.x.key}`);
  setCooldown(s, `drama_${pickd.x.key}_${pickd.c.id}`);
  d.stats.dramas++;
  return ev;
}

export const DRAMA_KEYS = DRAMAS.map((x) => x.key);
export { chance };
