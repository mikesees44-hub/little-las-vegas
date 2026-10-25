import { displayName, player } from './characters';
import { kinWord, PLAYER_HOUSE } from './houses';
import { kinByRole } from './housesKin';
import { opinion } from './relations';
import { hashSeed } from './rng';
import type { Character, Choice, Effect, EventInstance, GameState, KinRole } from './types';

/**
 * Small story hooks for the extended family: the women and the kin the
 * houses cast (housesKin.ts) come to the boss with their own business. The
 * matriarch gives orders, a widow wants her numbers book kept hers, the wife
 * finds a hole in the bakery's books, a daughter has chosen a young man (her
 * choice: the boss can only bless it or not), a sister wants a say, an aunt
 * brings the parish's gossip, the cousin in the collar and the cousin with
 * the badge, the wife's brother who wants in, a godchild's First Communion.
 *
 * One family popup a week at most (the pipeline's family seat), every few
 * weeks, with a cooldown per hook and per person. The dice are a hash of the
 * seed and the week, so the other systems' draws are untouched.
 */

interface Hook {
  key: string;
  role: KinRole;
  /** Weeks before the same hook comes up again (for anyone). */
  cooldown: number;
  weight: number;
  /** Roles only your house casts (in-laws, godchildren) are looked up anywhere. */
  anyHouse?: boolean;
  /** Extra condition on the person. */
  ok?: (s: GameState, c: Character) => boolean;
  build: (s: GameState, c: Character) => EventInstance | undefined;
}

const EVERY = 5;
const PER_PERSON = 30;

function cd(s: GameState): Record<string, number> {
  return (s.eventCooldowns ??= {});
}

function ready(s: GameState, key: string, weeks: number): boolean {
  return s.week - (cd(s)[key] ?? -999) >= weeks;
}

function roll(s: GameState, salt: string): number {
  return (hashSeed(`${s.seed}:${s.week}:${salt}`) % 10000) / 10000;
}

function ev(s: GameState, key: string, c: Character, title: string, text: string, choices: Choice[], def: string, actors: string[] = [c.id]): EventInstance {
  return { iid: `ev${s.nextId++}`, defId: `kin_${key}`, title, text, week: s.week, mandatory: false, priority: 34, meta: { family: 1, charId: c.id, kin: key }, actors, choices, defaultChoiceId: def };
}

const op = (from: string, to: string, amount: number, reason: string, label: string): Effect => ({ type: 'opinion', from, to, amount, reason, decay: 1, label });

/** "your mother", "your aunt Rose" ... */
function who(s: GameState, c: Character): string {
  const w = kinWord(s, s.playerId, c.id);
  return w ? `your ${w} ${c.firstName}` : displayName(c);
}

function cap(x: string): string {
  return x.charAt(0).toUpperCase() + x.slice(1);
}

const HOOKS: Hook[] = [
  {
    key: 'matriarch', role: 'matriarch', cooldown: 14, weight: 3,
    build: (s, c) => {
      const b = player(s);
      const label = `${c.firstName}'s Sunday table`;
      return ev(s, 'matriarch', c, 'Sunday dinner is not a request',
        `${cap(who(s, c))} has set the table for the whole family, and she has let it be known that the boss sits at her right hand, not on the telephone. She has things to say about who is speaking to whom.`,
        [
          { id: 'go', label: 'Go, and listen', detail: 'An afternoon lost. The family sees you at her table.', because: `sat at ${c.firstName}'s table`, effects: [op(c.id, b.id, 15, 'Came to Sunday dinner', label), { type: 'familyOpinion', amount: 3, reason: 'The boss came to dinner', label }] },
          { id: 'flowers', label: 'Send flowers and an envelope ($200)', detail: 'She will say it is lovely. She will not mean it.', because: `sent flowers to ${c.firstName}'s table`, effects: [{ type: 'money', amount: -200, label }, op(c.id, b.id, 4, 'Sent flowers', label)] },
          { id: 'skip', label: 'Business comes first', detail: 'She will remember. So will the aunts.', because: `skipped ${c.firstName}'s Sunday dinner`, effects: [op(c.id, b.id, -15, 'Too busy for his family', label), { type: 'familyOpinion', amount: -3, reason: 'The boss skipped dinner', label }] },
        ], 'go');
    },
  },
  {
    key: 'numbers', role: 'numbers', cooldown: 20, weight: 2,
    build: (s, c) => {
      const b = player(s);
      const label = `${c.firstName}'s numbers book`;
      return ev(s, 'numbers', c, 'The widow\'s book',
        `${cap(who(s, c))} has kept her late husband's numbers book going for years: forty steady players, nobody short. Now a couple of young men from another outfit have been leaning on her runners. She does not ask for help. She tells you it is happening.`,
        [
          { id: 'protect', label: 'Put men near her runners ($300)', detail: 'Her book stays hers. Everybody hears the family looks after its widows.', because: `protected ${c.firstName}'s numbers book`, effects: [{ type: 'money', amount: -300, label }, op(c.id, b.id, 20, 'Looked after my book', label), { type: 'respect', amount: 1, label }] },
          { id: 'cut', label: 'Protect it, for a fifth of the book', detail: 'Fair, says the street. Not from family, says she.', because: `took a cut of ${c.firstName}'s numbers book`, effects: [{ type: 'money', amount: 600, category: 'street', label }, op(c.id, b.id, -10, 'Took a cut from a widow', label)] },
          { id: 'fold', label: 'Tell her to fold it', detail: 'Safer. She loses her income and her standing at the parish.', because: `told ${c.firstName} to fold her book`, effects: [op(c.id, b.id, -20, 'Made me fold my book', label), { type: 'heat', bar: 'local', amount: -1, label }] },
        ], 'protect');
    },
  },
  {
    key: 'front', role: 'front', cooldown: 18, weight: 2,
    build: (s, c) => {
      const b = player(s);
      const label = `${c.firstName} and the books`;
      return ev(s, 'front', c, 'A hole in the books',
        `${cap(who(s, c))} keeps the books on the family's legitimate places. She brings them to the kitchen table: the night manager has been taking a little every week, and he has been careful about it. She has already worked out how much, and what she would do.`,
        [
          { id: 'hers', label: 'Let her handle it her way', detail: 'She gets the money back and a new manager. Quietly.', because: `let ${c.firstName} handle the night manager`, effects: [{ type: 'money', amount: 450, category: 'business', label }, op(c.id, b.id, 15, 'Trusted my judgment', label)] },
          { id: 'mine', label: 'Send someone to talk to him', detail: 'He pays it back with interest. The help talks.', because: `sent a man to the night manager`, effects: [{ type: 'money', amount: 700, category: 'business', label }, { type: 'respect', amount: 1, label }, op(c.id, b.id, -6, 'Took it out of my hands', label), { type: 'heat', bar: 'local', amount: 1, label }] },
          { id: 'let', label: 'Let it go', detail: 'Not worth the trouble, you say.', because: 'let the night manager keep his skim', effects: [op(c.id, b.id, -8, 'Did not listen', label)] },
        ], 'hers');
    },
  },
  {
    key: 'match', role: 'match', cooldown: 26, weight: 2,
    ok: (s, c) => !c.spouseId && suitor(s, c) !== undefined,
    build: (s, c) => {
      const b = player(s);
      const m = suitor(s, c)!;
      const label = `${c.firstName} and ${m.firstName}`;
      const house = s.lineage?.houses[houseIdOf(s, m) ?? '']?.title;
      return ev(s, 'match', c, `${c.firstName} has chosen`,
        `${cap(who(s, c))} has been walking out with ${displayName(m)}${house ? ` of ${house}` : ''}. Nobody arranged it: she chose him, and he her. She wants your blessing before the families talk. She does not need it, and she knows you know that.`,
        [
          { id: 'bless', label: 'Give them your blessing', detail: 'The families can talk. Whether they marry is up to the two of them.', because: `blessed ${c.firstName} and ${m.firstName}`, effects: [op(c.id, b.id, 20, 'Blessed my choice', label), op(m.id, b.id, 10, 'Her father welcomed me', label)] },
          { id: 'wait', label: 'Ask her to wait a year', detail: 'She may. She may not.', because: `asked ${c.firstName} to wait`, effects: [op(c.id, b.id, -6, 'Made me wait', label)] },
          { id: 'against', label: 'Tell her you are against it', detail: 'Her life, her choice. Your disapproval costs you with her.', because: `spoke against ${c.firstName}'s match`, effects: [op(c.id, b.id, -22, 'Stood against my choice', label), op(m.id, b.id, -10, 'Her father looks down on me', label)] },
        ], 'bless', [c.id, m.id]);
    },
  },
  {
    key: 'power', role: 'power', cooldown: 20, weight: 2,
    build: (s, c) => {
      const b = player(s);
      const label = `${c.firstName} wants a say`;
      return ev(s, 'power', c, `${c.firstName} wants a say`,
        `${cap(who(s, c))} has watched the men of this family make the same mistakes for twenty years. She wants a say in the business: not a seat at Sunday dinner, a seat when it is decided. The old men will grumble. It is ${s.date.y}; they grumble at everything.`,
        [
          { id: 'seat', label: 'Give her the bazaar money and the church contracts', detail: 'Real money, real responsibility. Some of the old-timers sulk.', because: `gave ${c.firstName} the church contracts`, effects: [op(c.id, b.id, 22, 'Gave me a real say', label), { type: 'familyOpinion', amount: 2, reason: 'The boss listens to the women of the house', label }, { type: 'crewOpinion', amount: -1, reason: 'A woman in the business', label }] },
          { id: 'ask', label: 'Ask her counsel, privately', detail: 'She gets heard, not seen.', because: `asked ${c.firstName}'s counsel`, effects: [op(c.id, b.id, 8, 'Asks my counsel', label)] },
          { id: 'no', label: 'Tell her it is not her place', detail: 'She will not forget it, and she will not stop wanting it.', because: `told ${c.firstName} it was not her place`, effects: [op(c.id, b.id, -25, 'Told me it was not my place', label)] },
        ], 'seat');
    },
  },
  {
    key: 'church', role: 'church', cooldown: 12, weight: 3,
    build: (s, c) => {
      const b = player(s);
      const r = s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
      const rv = r.length ? r[Math.floor(roll(s, 'church') * r.length)] : undefined;
      const label = `${c.firstName}'s Rosary Society`;
      const fx: Effect[] = [op(c.id, b.id, 6, 'Listens to me', label)];
      if (rv) fx.push({ type: 'rivalResource', rival: rv.id, exposure: 4, label });
      return ev(s, 'church', c, 'What the Rosary Society knows',
        `${cap(who(s, c))} sits on the Rosary Society, which means she knows whose husband has not been home, whose son is suddenly flush${rv ? `, and which of ${rv.name}'s men has been confessing more than his sins` : ''}. She tells you over coffee, as if it were nothing.`,
        [
          { id: 'use', label: 'Pass it to the right ears', detail: rv ? `${rv.shortName} has a little more to hide.` : 'Useful, someday.', because: `used ${c.firstName}'s parish gossip`, effects: fx },
          { id: 'thank', label: 'Thank her, and leave it at the church door', detail: 'She is pleased you keep her out of it.', because: `kept ${c.firstName} out of the business`, effects: [op(c.id, b.id, 10, 'Kept me out of it', label)] },
        ], 'use');
    },
  },
  {
    key: 'priest', role: 'priest', cooldown: 16, weight: 2,
    build: (s, c) => {
      const b = player(s);
      const label = `Father ${c.firstName}`;
      return ev(s, 'priest', c, `Father ${c.firstName} comes to the house`,
        `${cap(who(s, c))}, in the collar, at your kitchen door. The parish school roof leaks, he says. He also says he hears things in the confessional he cannot repeat, and that he prays for you. He means both.`,
        [
          { id: 'roof', label: 'Pay for the roof ($500)', detail: 'The parish knows who paid. So does the Monsignor.', because: 'paid for the parish school roof', effects: [{ type: 'money', amount: -500, label }, op(c.id, b.id, 15, 'Fixed the school roof', label), { type: 'respect', amount: 1, label }, { type: 'heat', bar: 'local', amount: -1, label }] },
          { id: 'confess', label: 'Go to confession', detail: 'You tell him what a man can tell a priest.', because: `went to confession with Father ${c.firstName}`, effects: [op(c.id, b.id, 10, 'Came to confession', label), { type: 'familyOpinion', amount: 1, reason: 'The boss went to confession', label }] },
          { id: 'no', label: 'Not today, Father', because: `sent Father ${c.firstName} away`, effects: [op(c.id, b.id, -6, 'Sent me away', label)] },
        ], 'roof');
    },
  },
  {
    key: 'cop', role: 'cop', cooldown: 18, weight: 2,
    build: (s, c) => {
      const b = player(s);
      const label = `${c.firstName} on the force`;
      return ev(s, 'cop', c, 'A word from the cousin with the badge',
        `${cap(who(s, c))} catches you outside St. Ann's after Mass. Off the record: the state boys are asking about the island, and somebody downtown is putting a list together. He has not said anything. He wants you to know he has not said anything.`,
        [
          { id: 'thank', label: 'Thank him, and change nothing he could be blamed for', detail: 'You tighten up. He stays clean.', because: `thanked ${c.firstName} for the warning`, effects: [{ type: 'heat', bar: 'local', amount: -3, label }, op(c.id, b.id, 8, 'Kept me out of it', label)] },
          { id: 'more', label: 'Ask him for the duty roster', detail: 'Very useful. It puts him in a spot he did not ask for.', because: `asked ${c.firstName} for the duty roster`, effects: [{ type: 'heat', bar: 'local', amount: -6, label }, op(c.id, b.id, -15, 'Asked me to choose', label)] },
          { id: 'away', label: 'Tell him to stay away from the family business', detail: 'For his own good.', because: `told ${c.firstName} to stay clear`, effects: [op(c.id, b.id, 12, 'Looked out for me', label)] },
        ], 'thank');
    },
  },
  {
    key: 'inlaw', role: 'inlaw', cooldown: 24, weight: 2, anyHouse: true,
    ok: (_s, c) => c.faction !== 'player' && c.rank === 'civilian',
    build: (s, c) => {
      const b = player(s);
      const wife = b.spouseId ? s.characters[b.spouseId] : undefined;
      const label = `${c.firstName} wants in`;
      const fx = (n: number, reason: string): Effect[] => (wife?.alive ? [op(wife.id, b.id, n, reason, label)] : []);
      return ev(s, 'inlaw', c, 'Your wife\'s brother wants in',
        `${displayName(c)} drives a cab and has opinions about it. He has asked his sister to ask you, and now he is asking you himself: he wants in. ${wife?.alive ? `${wife.firstName} has not said what she thinks. She will, if you get it wrong.` : ''}`,
        [
          { id: 'in', label: 'Bring him around', detail: 'An associate. Family is family.', because: `brought ${c.firstName} into the crew`, effects: [{ type: 'recruit', charId: c.id, label }, op(c.id, b.id, 20, 'Brought me in', label), ...fx(5, 'Took care of my brother')] },
          { id: 'job', label: 'Find him a straight job ($300)', detail: 'A dispatcher\'s job at a friend\'s cab company.', because: `found ${c.firstName} a straight job`, effects: [{ type: 'money', amount: -300, label }, op(c.id, b.id, 5, 'Found me a job', label), ...fx(10, 'Kept my brother out of it')] },
          { id: 'no', label: 'Tell him no', because: `turned ${c.firstName} down`, effects: [op(c.id, b.id, -15, 'Turned me down', label), ...fx(-6, 'Turned my brother away')] },
        ], 'job');
    },
  },
  {
    key: 'wantsIn', role: 'wantsIn', cooldown: 20, weight: 1,
    ok: (_s, c) => c.faction !== 'player' && c.rank === 'civilian' && !c.kinRoles?.includes('inlaw'),
    build: (s, c) => {
      const b = player(s);
      const label = `${c.firstName} wants in`;
      return ev(s, 'wantsIn', c, `${c.firstName} keeps coming around`,
        `${cap(who(s, c))} has been at the social club four nights this week, waiting to be asked. He is blood. He is also young, and the young ones are the ones who get hurt.`,
        [
          { id: 'in', label: 'Bring him in', detail: 'An associate, under a capo who will watch him.', because: `brought ${c.firstName} into the crew`, effects: [{ type: 'recruit', charId: c.id, label }, op(c.id, b.id, 15, 'Brought me in', label)] },
          { id: 'school', label: 'Pay for school instead ($400)', detail: 'Rutgers, or the trade school in Camden. His mother will light a candle for you.', because: `paid for ${c.firstName}'s schooling`, effects: [{ type: 'money', amount: -400, label }, op(c.id, b.id, 6, 'Paid for my school', label), { type: 'familyOpinion', amount: 2, reason: 'The boss kept a cousin out of it', label }] },
          { id: 'no', label: 'Send him home', because: `sent ${c.firstName} home`, effects: [op(c.id, b.id, -12, 'Sent me home', label)] },
        ], 'school');
    },
  },
  {
    key: 'godchild', role: 'godchild', cooldown: 30, weight: 1, anyHouse: true,
    build: (s, c) => {
      const b = player(s);
      const father = c.fatherId ? s.characters[c.fatherId] : undefined;
      const label = `${c.firstName}'s big day`;
      const day = s.date.y - c.birth.y <= 9 ? 'First Communion' : s.date.y - c.birth.y <= 14 ? 'Confirmation' : 'graduation';
      const fx = (n: number, reason: string): Effect[] => (father?.alive ? [op(father.id, b.id, n, reason, label)] : []);
      return ev(s, 'godchild', c, `Your godchild's ${day}`,
        `${displayName(c)}${father ? `, ${father.firstName}'s ${c.gender === 'M' ? 'boy' : 'girl'},` : ''} has ${day === 'graduation' ? 'a graduation' : `a ${day}`} at St. Ann's on Sunday. The whole crew will be watching to see if the godfather comes.`,
        [
          { id: 'go', label: 'Go, with an envelope ($150)', detail: 'You stand in the back. Everybody sees you anyway.', because: `went to ${c.firstName}'s ${day}`, effects: [{ type: 'money', amount: -150, label }, op(c.id, b.id, 15, 'My godfather came', label), ...fx(10, 'Came for my kid'), { type: 'crewOpinion', amount: 1, reason: 'The boss came to the church', label }] },
          { id: 'send', label: 'Send the envelope ($150)', because: `sent an envelope for ${c.firstName}'s ${day}`, effects: [{ type: 'money', amount: -150, label }, op(c.id, b.id, 5, 'Sent a card', label)] },
          { id: 'forget', label: 'Forget', because: `forgot ${c.firstName}'s ${day}`, effects: [op(c.id, b.id, -10, 'My godfather forgot', label), ...fx(-8, 'Forgot my kid')] },
        ], 'go');
    },
  },
  {
    key: 'uncle', role: 'uncle', cooldown: 18, weight: 1,
    build: (s, c) => {
      const b = player(s);
      const label = `Uncle ${c.firstName}`;
      return ev(s, 'uncle', c, `Uncle ${c.firstName} has a view`,
        `${cap(who(s, c))} knew your grandfather and does not let anyone forget it. He has heard what you are doing on the island and he has a view. At length. Some of it is even good.`,
        [
          { id: 'hear', label: 'Hear him out', detail: 'An evening. He feels consulted.', because: `heard out Uncle ${c.firstName}`, effects: [op(c.id, b.id, 14, 'Asked my opinion', label), { type: 'familyOpinion', amount: 1, reason: 'The boss respects the elders', label }] },
          { id: 'humor', label: 'Nod along', detail: 'He can tell.', because: `humored Uncle ${c.firstName}`, effects: [op(c.id, b.id, 3, 'Humored me', label)] },
          { id: 'cut', label: 'Cut him off', because: `cut off Uncle ${c.firstName}`, effects: [op(c.id, b.id, -14, 'Cut me off', label)] },
        ], 'hear');
    },
  },
];

/** A grown, unmarried man of another house (a Character) who suits her. */
function suitor(s: GameState, c: Character): Character | undefined {
  const age = s.date.y - c.birth.y;
  let best: Character | undefined;
  for (const id in s.characters) {
    const m = s.characters[id];
    if (!m.alive || m.gender !== 'M' || m.spouseId || m.dynasty || m.faction === 'player' || m.id === s.playerId) continue;
    const ma = s.date.y - m.birth.y;
    if (ma < age || ma > age + 9 || ma < 18) continue;
    const h = houseIdOf(s, m);
    if (!h || h === PLAYER_HOUSE) continue;
    if (!best || m.id < best.id) best = m;
  }
  return best;
}

function houseIdOf(s: GameState, m: Character): string | undefined {
  return s.lineage?.links[m.id]?.house;
}

/** The event source (registered with the one popup pipeline). */
export function kinEventSource(s: GameState): EventInstance | undefined {
  if (!s.lineage || s.gameOver || s.week < 3) return undefined;
  if (!ready(s, 'kin:any', EVERY) || roll(s, 'go') > 0.55) return undefined;
  const b = s.characters[s.playerId];
  if (!b?.alive) return undefined;
  const cands: { h: Hook; c: Character; w: number }[] = [];
  for (const h of HOOKS) {
    if (!ready(s, `kin:${h.key}`, h.cooldown)) continue;
    for (const c of kinByRole(s, h.role, h.anyHouse ? undefined : 'player')) {
      if (c.id === s.playerId || !ready(s, `kin:p:${c.id}`, PER_PERSON) || (h.ok && !h.ok(s, c))) continue;
      // Imprisoned or away men and women don't come to the door.
      if (c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week) continue;
      cands.push({ h, c, w: h.weight * (opinion(s, c.id, b.id) < -40 ? 0.5 : 1) });
    }
  }
  if (!cands.length) return undefined;
  const total = cands.reduce((a, x) => a + x.w, 0);
  let r = roll(s, 'pick') * total;
  let pickd = cands[cands.length - 1];
  for (const x of cands) {
    r -= x.w;
    if (r <= 0) {
      pickd = x;
      break;
    }
  }
  const e = pickd.h.build(s, pickd.c);
  if (!e) return undefined;
  const C = cd(s);
  C['kin:any'] = s.week;
  C[`kin:${pickd.h.key}`] = s.week;
  C[`kin:p:${pickd.c.id}`] = s.week;
  return e;
}

/** The hooks' keys (tests). */
export const KIN_HOOKS = HOOKS.map((h) => h.key);
