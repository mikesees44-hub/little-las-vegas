import { player } from './characters';
import { MALE_FIRST, FEMALE_FIRST, SURNAMES } from './names';
import { chance, pick, rand } from './rng';
import { buildTownPetition, petitionRoll } from './petitions';
import { PETITION_TEMPLATES } from './petitionData';
import type { Choice, Effect, Ethnicity, EventInstance, GameState } from './types';

/**
 * The Boss's Office. On Sunday afternoons people from the town come to the
 * back room of the social club with something they can't take to City Hall.
 * Each petition is a short scene with dialogue answers; what the boss says
 * is remembered in respect, favors, heat and the people he helps or turns away.
 *
 * Petitioners are ordinary fictional townspeople. Nothing here is a racket:
 * the office is where the boss is the town's other government.
 */
export const OFFICE_CHANCE = 0.07;

interface Petition {
  id: string;
  when?: (s: GameState) => boolean;
  title: string;
  text: (who: string, s: GameState) => string;
  choices: (who: string, s: GameState) => Choice[];
}

const L = (who: string) => `The office: ${who}`;

const PETITIONS: Petition[] = [
  {
    id: 'rent',
    title: 'A widow and her stand',
    text: (w) => `${w} sells saltwater taffy from a stand her husband built in '38. The new landlord on the boardwalk wants triple the rent by Memorial Day. "My husband always said you were a fair man."`,
    choices: (w) => [
      { id: 'pay', label: '"I\'ll cover the difference this year."', detail: '$250', because: `paid ${w}'s rent`, effects: [{ type: 'money', amount: -250, label: L(w) }, { type: 'respect', amount: 2, label: L(w) }] },
      { id: 'talk', label: '"Let me have a word with your landlord."', detail: 'He\'ll listen. The cops may hear about it.', because: `had a word with ${w}'s landlord`, effects: [{ type: 'respect', amount: 3, label: L(w) }, { type: 'heat', bar: 'local', amount: 1, label: L(w) }] },
      { id: 'no', label: '"Times change, signora."', because: `turned ${w} away`, effects: [{ type: 'respect', amount: -1, label: L(w) }] },
    ],
  },
  {
    id: 'son',
    title: 'A father and a son in lockup',
    text: (w) => `${w}'s boy got into a fistfight with a sailor outside a Pacific Avenue club. Now he's in the county lockup and the sailor's in the hospital. "He's a good boy. Stupid, but good."`,
    choices: (w, s) => [
      { id: 'healy', label: '"I\'ll call Sergeant Healy."', detail: 'A favor, spent.', because: `got ${w}'s son out of lockup`, effects: [{ type: 'favor', amount: -1, label: L(w) }, { type: 'respect', amount: 3, label: L(w) }], disabledReason: s.favors < 1 ? 'No favors to spend' : undefined },
      { id: 'lawyer', label: '"My lawyer will be there in the morning."', detail: '$400', because: `sent a lawyer for ${w}'s son`, effects: [{ type: 'money', amount: -400, label: L(w) }, { type: 'respect', amount: 2, label: L(w) }] },
      { id: 'lesson', label: '"A night in a cell teaches a man something."', because: `let ${w}'s son sit in a cell`, effects: [{ type: 'respect', amount: -1, label: L(w) }] },
    ],
  },
  {
    id: 'shakedown',
    when: (s) => s.rivals.some((r) => r.id === 'manno'),
    title: 'A grocer squeezed',
    text: (w, s) => `${w} keeps a grocery off New Jersey Avenue. Two of ${mannoName(s)}'s men came by and named a weekly figure. "I already pay you. Do I pay everybody now?"`,
    choices: (w, s) => {
      const r = s.rivals.find((x) => x.id === 'manno');
      return [
        { id: 'protect', label: '"Nobody else collects on my street."', detail: 'Manno will take it personally.', because: `put ${w}'s grocery under the house's protection`, effects: [{ type: 'respect', amount: 4, label: L(w) }, { type: 'influence', district: 'downtown', faction: 'player', amount: 3, label: L(w) }, ...(r ? [{ type: 'opinion', from: r.leaderId, to: s.playerId, amount: -10, reason: 'Stood between my men and a grocer', decay: 1, label: L(w) } as Effect] : [])] },
        { id: 'refund', label: '"Pay them this once. I\'ll make it right."', detail: '$200', because: `paid ${w}'s tribute to Manno himself`, effects: [{ type: 'money', amount: -200, label: L(w) }, { type: 'respect', amount: 1, label: L(w) }] },
        { id: 'no', label: '"That\'s between you and the Mannos."', because: `told ${w} he was on his own`, effects: [{ type: 'respect', amount: -3, label: L(w) }, { type: 'influence', district: 'downtown', faction: 'player', amount: -2, label: L(w) }] },
      ];
    },
  },
  {
    id: 'roof',
    title: 'The parish roof',
    text: (w) => `Father ${w.split(' ')[1]} of St. Ann's, hat in his hands. The winter storms took half the church roof. "The diocese says next year. The Lord does not say next year."`,
    choices: (w) => [
      { id: 'all', label: '"Send me the bill, Father."', detail: '$800', because: 'paid for the church roof', effects: [{ type: 'money', amount: -800, label: L(w) }, { type: 'respect', amount: 4, label: L(w) }, { type: 'heat', bar: 'local', amount: -3, label: `${L(w)}: the cops go to St. Ann's too` }] },
      { id: 'half', label: '"Half now. The rest after the season."', detail: '$350', because: 'paid for half the church roof', effects: [{ type: 'money', amount: -350, label: L(w) }, { type: 'respect', amount: 2, label: L(w) }] },
      { id: 'pray', label: '"I\'ll pray on it, Father."', because: 'left the church roof to the diocese', effects: [{ type: 'respect', amount: -1, label: L(w) }] },
    ],
  },
  {
    id: 'nephew',
    title: 'A councilman\'s nephew',
    text: (w) => `${w} — a cousin of Councilman Frank Dougherty, he says twice — wants a summer job for his nephew. Something with a little cash in it and nothing he has to explain at Mass.`,
    choices: (w) => [
      { id: 'job', label: '"He can count tickets at the pier."', detail: '$100 of wages, and the councilman will owe you.', because: `gave the councilman's nephew a job`, effects: [{ type: 'money', amount: -100, label: L(w) }, { type: 'favor', amount: 1, label: L(w) }] },
      { id: 'no', label: '"I don\'t hire on account of who your uncle is."', because: 'turned down the councilman\'s nephew', effects: [{ type: 'respect', amount: 1, label: L(w) }] },
    ],
  },
  {
    id: 'harbor',
    when: (s) => s.underbelly?.stage === 'active' || s.underbelly?.stage === 'entrenched',
    title: 'A cousin who didn\'t come home',
    text: (w) => `${w}'s cousin came over for summer work and took a room the Harbor Crew found for her. Now she owes them for the room, the ticket, the food, and they won't let her leave. "The police said she's a grown woman. You're not the police."`,
    choices: (w) => [
      { id: 'find', label: '"Tell me everything. Names, the address."', detail: 'Proof against the Harbor Crew.', because: `took up the case of ${w}'s cousin`, effects: [{ type: 'underbelly', op: 'exposure', amount: 18, label: L(w) }, { type: 'respect', amount: 2, label: L(w) }] },
      { id: 'pay', label: '"Whatever she owes, I\'ll pay it. Bring her home."', detail: '$500 — and they learn you pay.', because: `paid the Harbor Crew to let ${w}'s cousin go`, effects: [{ type: 'money', amount: -500, label: L(w) }, { type: 'underbelly', op: 'strength', amount: 3, label: L(w) }, { type: 'respect', amount: 1, label: L(w) }] },
      { id: 'no', label: '"I can\'t fight every fight."', because: `turned ${w} away`, effects: [{ type: 'respect', amount: -3, label: L(w) }] },
    ],
  },
  {
    id: 'lifeguard',
    title: 'The beach patrol captain',
    text: (w) => `${w}, captain of the beach patrol, sunburned and polite. Gangs of kids from Philadelphia have been fighting on the beach at night. "The cops don't come down to the sand."`,
    choices: (w) => [
      { id: 'men', label: '"My men will walk the beach a few nights."', detail: 'Quiet beaches, happy merchants.', because: 'had his men keep the peace on the beach', effects: [{ type: 'respect', amount: 3, label: L(w) }, { type: 'influence', district: 'boardwalk', faction: 'player', amount: 2, label: L(w) }, { type: 'heat', bar: 'local', amount: 1, label: L(w) }] },
      { id: 'no', label: '"Call the chief. That\'s what he\'s for."', because: 'sent the beach patrol to the police', effects: [] },
    ],
  },
  {
    id: 'gambler',
    title: 'A man in over his head',
    text: (w) => `${w} drives a bread truck and plays the horses. He owes a Philadelphia book $600 and they've stopped asking nicely. "I'll pay it back, swear to God."`,
    choices: (w) => [
      { id: 'lend', label: '"I\'ll take the debt over. Six points a week."', detail: 'A loan on your book.', because: `took over ${w}'s debt at six points`, effects: [{ type: 'loan', amount: 1000, label: L(w) }] },
      { id: 'clear', label: '"Go home to your wife. It\'s handled."', detail: '$600, and a man who owes you his life.', because: `cleared ${w}'s debt`, effects: [{ type: 'money', amount: -600, label: L(w) }, { type: 'respect', amount: 3, label: L(w) }] },
      { id: 'no', label: '"Stay off the horses."', because: `sent ${w} away`, effects: [] },
    ],
  },
];

function mannoName(s: GameState): string {
  const r = s.rivals.find((x) => x.id === 'manno');
  const c = r ? s.characters[r.leaderId] : undefined;
  return c ? `${c.firstName} ${c.lastName}` : 'Manno';
}

function petitioner(s: GameState, female = false): string {
  const eth = pick(s, ['Italian', 'Irish', 'Jewish'] as Ethnicity[]);
  return `${pick(s, (female ? FEMALE_FIRST : MALE_FIRST)[eth])} ${pick(s, SURNAMES[eth])}`;
}

export function buildPetition(s: GameState, id?: string): EventInstance | undefined {
  // The deep bed (petitionData.ts): a named template, or most unnamed draws.
  if (id && PETITION_TEMPLATES.some((t) => t.id === id)) return buildTownPetition(s, id);
  const pool = PETITIONS.filter((p) => (!id || p.id === id) && (!p.when || p.when(s)) && s.flags[`office_${p.id}`] === undefined);
  if (!id && (!pool.length || petitionRoll(s, 'old') >= OLD_SHARE)) {
    const ev = buildTownPetition(s, undefined, 'office');
    // The same dice as an original petition draws (the pick and the name), so the rest of the week plays as before.
    if (ev) for (let i = 0; i < 4; i++) rand(s);
    if (ev || !pool.length) return ev;
  }
  if (!pool.length) return undefined;
  const p = pick(s, pool);
  const who = petitioner(s, p.id === 'rent' || p.id === 'harbor');
  s.flags[`office_${p.id}`] = s.week;
  return {
    iid: `ev${s.nextId++}`, defId: `office_${p.id}`, week: s.week, mandatory: false, priority: 30,
    title: `The office: ${p.title.toLowerCase()}`,
    text: p.text(who, s),
    choices: p.choices(who, s),
    defaultChoiceId: p.choices(who, s).at(-1)!.id,
    actors: [player(s).id],
  };
}

/** The share of unnamed office draws that go to the original eight (the rest come from the deep bed). */
const OLD_SHARE = 0.12;

/** Weekly: sometimes somebody comes to the back room; office hours guarantee it. */
export function officeWeek(s: GameState): void {
  // Petitions can come back after a year.
  for (const k of Object.keys(s.flags)) if (k.startsWith('office_') && k !== 'office_hours' && s.week - s.flags[k] > 52) delete s.flags[k];
  const hours = !!s.flags.office_hours;
  if (hours) delete s.flags.office_hours;
  if (!hours && !chance(s, OFFICE_CHANCE)) return;
  const ev = buildPetition(s);
  // The boss asked for it (office hours): it is not routine, it gets a seat (storyPace.ts).
  if (ev && hours) ev.meta = { ...(ev.meta ?? {}), asked: 1 };
  if (ev) s.eventQueue.push(ev);
}

export const PETITION_IDS = PETITIONS.map((p) => p.id);
