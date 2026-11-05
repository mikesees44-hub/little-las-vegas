import { HEAT_FULL, HEAT_THRESHOLD } from './heat';
import { UNWASHED_SAFE } from './economy';
import { GRAND_JURY, OPEN_FILE } from './longgame';
import { CAPO_CUT, NO_CAPO_EFFICIENCY } from './economy';
import type { Effect, Stat } from './types';

/**
 * Plain-words help for every number on the screen (the CK tooltip layer).
 * Pure data plus two lookups: `statHelp` for the header bars and
 * `effectHelp` for an effect chip. The numbers quoted here come from the
 * engine constants, so a tooltip cannot drift from the rules.
 */

export type GlossarySection = 'Pressure' | 'Standing' | 'Money' | 'People' | 'The Table' | 'Plans' | 'The House';

export interface GlossaryEntry {
  id: string;
  term: string;
  section: GlossarySection;
  /** One line for a tooltip. */
  short: string;
  /** A little more for the help overlay. */
  long?: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'heat.local', term: 'Local heat', section: 'Pressure',
    short: `The Wildwood police and the county Prosecutor's attention. At ${HEAT_THRESHOLD}+ they start to raid (more often the higher it goes, every few weeks by ${HEAT_FULL}): a warrant for a night, a place padlocked, cash seized.`,
    long: 'Shakedowns, hits, rackets and pushing into districts raise it. A quiet week cools it; envelopes downtown (the fixer, a bribed sergeant) cool it faster. Above 55 it is "hot": plan for a raid.',
  },
  {
    id: 'heat.family', term: 'Family heat', section: 'Pressure',
    short: `Philadelphia's patience with you. The hotter it runs (and the richer you get), the sooner they summon you across the bridge; past ${HEAT_FULL} they simply take a cut of the treasury.`,
    long: 'Short envelopes, unsanctioned killings, wars without the Table\'s blessing and narcotics raise it. An envelope to Sal Moretti, a consigliere working the Table and a quiet season lower it.',
  },
  {
    id: 'heat.federal', term: 'Federal heat', section: 'Pressure',
    short: `The FBI and the IRS. At ${HEAT_THRESHOLD}+ they start arresting your men. Unwashed cash above ${usd(UNWASHED_SAFE)} feeds it every week.`,
    long: 'Heists across state lines, bank jobs, dirty money in shoeboxes and big names in the papers raise it. It cools slowly; the fixer\'s friends at the federal building help.',
  },
  {
    id: 'heat', term: 'Heat', section: 'Pressure',
    short: `Attention you do not want, in three bars: local (the county), family (Philadelphia) and federal (the FBI). Past ${HEAT_THRESHOLD} each one bites; quiet weeks cool them.`,
  },
  {
    id: 'storm', term: 'Storm warning', section: 'Pressure',
    short: 'Something big that may land in the next two weeks (a raid, an arrest, an indictment, a hit, the Family running dry), with the odds, the biggest reason and what would help.',
  },
  {
    id: 'respect', term: 'Respect', section: 'Standing',
    short: 'Your reputation on the street (0–100). It raises the odds that people say yes to you and keeps the crew in line.',
    long: 'Winning fights, keeping your word and paying Philadelphia on time raise it; raids, refusals and being in the red lower it. Every 3 points over 40 is +1% on most acceptance odds.',
  },
  {
    id: 'standing', term: 'Standing', section: 'Standing',
    short: 'Below the chair: what the family above you thinks of you (0–100). The quota met, orders done and a made man who vouches raise it. At 45 an associate\'s name can go up to be made.',
  },
  {
    id: 'hollow', term: 'The hollow crown', section: 'Standing',
    short: 'When the capos start running the family without you: your orders go out and come back undone. Low respect, sore capos, a war going badly, a sick or aging boss and an ambitious underboss bring it on.',
    long: 'Three or more of those signs and it can start any week. Win the capos back one at a time, make an example, or step aside for your heir.',
  },
  {
    id: 'money', term: 'Family money', section: 'Money',
    short: 'The Family\'s cash: it pays the crew, the cops, Philadelphia and the upkeep, and buys businesses. Orders are paid from it the week they are carried out. In the red, respect and loyalty bleed every week.',
  },
  {
    id: 'pocket', term: 'Your pocket', section: 'Money',
    short: 'Your own money: your cut of every envelope (40% unless you change it). It pays for your house, cars, fun, gifts and your family. Short, the Family covers the rest, and the capos notice a boss who dips too often.',
  },
  {
    id: 'unwashed', term: 'Unwashed cash / laundering', section: 'Money',
    short: `Dirty money the fronts have not washed yet. Above ${usd(UNWASHED_SAFE)} the IRS notices (federal heat every week). Fronts that launder, a bank and the bagman wash it.`,
  },
  {
    id: 'kickup', term: 'Kick-up', section: 'Money',
    short: `What a capo sends up from his district. By custom he keeps ${pct(CAPO_CUT)} (his contract) and kicks up the rest — minus whatever he skims.`,
    long: `A district with no capo still pays, but badly: you collect only ${pct(NO_CAPO_EFFICIENCY)} of the street yourself. Greedy capos skim; a bagman counting the envelopes stops most of it.`,
  },
  {
    id: 'envelope', term: 'The envelope', section: 'Money',
    short: 'Every Monday the underboss brings the week\'s take from the capos. You make the split: your cut goes to your pocket, the rest to the Family. A short crew or a petition in it needs your word.',
  },
  {
    id: 'tribute', term: 'Tribute', section: 'Money',
    short: 'What goes up the line: Philadelphia\'s monthly envelope through its bagman, or, below the chair, your kick-up to the man you answer to. Short or late, and their patience (family heat) runs out.',
  },
  {
    id: 'contract', term: 'Contract', section: 'Money',
    short: 'The share of his district a capo keeps. Squeeze it and he may refuse — and remember.',
  },
  {
    id: 'favors', term: 'Political favors', section: 'Money',
    short: 'Favors owed to you by officials. Spend them at the Table, on a bank charter, or on construction permits.',
  },
  {
    id: 'season', term: 'The Season', section: 'Money',
    short: 'Memorial Day to Labor Day the boardwalk earns about ×2.5; the off-season about ×0.4. Plan the winter.',
  },
  {
    id: 'opinion', term: 'Opinion', section: 'People',
    short: 'What someone thinks of you (−100 to +100): the sum of named reasons, most fading each month. It drives loyalty, obedience and every "will he accept?" roll.',
  },
  {
    id: 'fear', term: 'Fear, trust, grievance', section: 'People',
    short: 'Fear makes men say yes; trust makes them stay; grievance makes them plot. Threats raise fear and grievance together.',
  },
  {
    id: 'loyalty', term: 'Loyalty to his capo', section: 'People',
    short: 'Soldiers have two loyalties: to their capo and to you. If the capo walks, men who love him more than you follow him.',
  },
  {
    id: 'evidence', term: 'Evidence file', section: 'People',
    short: `What the law has on a man (0–100). The FBI opens a file on you at ${OPEN_FILE}; a grand jury sits at ${GRAND_JURY}. Orders you give yourself add to yours.`,
  },
  {
    id: 'made', term: 'Made', section: 'People',
    short: 'A made man has taken the oath: he cannot be touched without the Table\'s word. Only Philadelphia makes men, when it opens the books. An associate needs a made man to vouch for him; if he goes bad it is on the man who vouched.',
  },
  {
    id: 'delegation', term: 'Delegation', section: 'People',
    short: 'How much you run yourself: Hands-on (you see everything), Balanced, or Chairman (your people settle the routine with the consigliere\'s advice). Everything settled for you is under Handled for you on the Desk.',
  },
  {
    id: 'council', term: 'The administration', section: 'People',
    short: 'Five seats (underboss, consigliere, bagman, enforcer, fixer). Each runs one task a week; skill 60 in the seat\'s attribute is ×1.0.',
  },
  {
    id: 'chain', term: 'Orders through the chain', section: 'People',
    short: 'Orders you give yourself happen now but leave fingerprints. Through the underboss or a capo they take a week, keep you insulated, and may be changed or ignored.',
  },
  {
    id: 'table', term: 'The Table', section: 'The Table',
    short: 'Philadelphia\'s South Jersey sit-down. Members who are not a party vote; the chair breaks ties. Lobby before the hearing.',
    long: 'Bring a dispute (a district, reparations, peace) instead of fighting for it. A hit on a made man and a war both need the Table\'s sanction; without it, expect a blood feud and family heat.',
  },
  {
    id: 'sanction', term: 'Sanction', section: 'The Table',
    short: 'The Table\'s permission to kill a made man or go to war. Without it you start a blood feud and anger Philadelphia.',
  },
  {
    id: 'casusbelli', term: 'Casus belli', section: 'The Table',
    short: 'A reason the Table accepts for war: a claim on the district, a grievance it heard, a blood feud, or its sanction.',
  },
  {
    id: 'influence', term: 'Influence', section: 'The Table',
    short: 'Your share of a district (0–100%). 20% lets you open places there; 40% earns a capo; storefronts grow with your share.',
  },
  {
    id: 'scheme', term: 'Schemes', section: 'Plans',
    short: 'Plans that take weeks: agents, a planning depth, then one roll whose odds you see before you commit. Each week the other side may find out (secrecy).',
  },
  {
    id: 'secrecy', term: 'Secrecy', section: 'Plans',
    short: 'How hard a scheme is to discover. Each week the chance they find out is (100 − secrecy) ÷ 4 percent.',
  },
  {
    id: 'hook', term: 'Hooks and secrets', section: 'Plans',
    short: 'Leverage. A weak hook (a bribe taken, a favor owed) is spent when used; a strong one (a secret) lasts. A hook adds +40 or +80 to acceptance.',
  },
  {
    id: 'succession', term: 'Succession laws', section: 'The House',
    short: 'Who takes the chair when you die: Blood (eldest son, then the house), Appointed (you name the heir), Capos elect, or Underboss inherits.',
    long: 'With no eligible heir the house falls and the game ends. Appointed is the safest if you keep an heir named and alive; Underboss inherits keeps the business in strong hands but out of the bloodline.',
  },
  {
    id: 'renown', term: 'Renown', section: 'The House',
    short: 'The name of your house. Earned by deeds; spent on legacy perks that survive every succession. It also helps marriages.',
  },
  {
    id: 'alliance', term: 'Marriage alliances', section: 'The House',
    short: 'A marriage between houses makes an alliance while it stands: they will not strike you, they join your wars, and their Table votes lean your way.',
  },
];

const BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]));

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return BY_ID[id];
}

/** Tooltip for a header stat. */
export function statHelp(stat: Stat | 'unwashed' | 'favors'): string {
  return BY_ID[stat]?.short ?? '';
}

/** Tooltip for an effect chip: what this kind of change means. */
export function effectHelp(e: Effect): string | undefined {
  switch (e.type) {
    case 'money': return e.pot === 'pocket' ? (e.amount < 0 ? 'Paid from your pocket when the order is carried out (the Family covers what it cannot).' : 'Into your pocket.') : e.amount < 0 ? 'Paid from Family money when the order is carried out.' : 'Added to Family money.';
    case 'respect': return BY_ID.respect.short;
    case 'heat': return BY_ID[`heat.${e.bar}`].short;
    case 'opinion': return BY_ID.opinion.short;
    case 'meter': return BY_ID.fear.short;
    case 'crewOpinion': return `Every man in the family's opinion of you.${e.traitMods ? ' * Some traits feel it more or less.' : ''}`;
    case 'familyOpinion': return 'Every member of the house\'s opinion of you.';
    case 'rivalOpinion': return 'What that organisation\'s boss thinks of you: it decides deals, Table votes and whether they strike.';
    case 'influence': return BY_ID.influence.short;
    case 'schedule': return 'A consequence that may come later. It is rolled when the time comes and named "Because you …" in the report.';
    case 'favor': return BY_ID.favors.short;
    case 'evidence': return BY_ID.evidence.short;
    case 'unwashed': return BY_ID.unwashed.short;
    case 'hook': return BY_ID.hook.short;
    case 'contract': return BY_ID.contract.short;
    case 'seat': return BY_ID.council.short;
    case 'propose':
    case 'making': return BY_ID.made.short;
    case 'warStart':
    case 'dispute':
    case 'lobby': return BY_ID.table.short;
    case 'startScheme': return BY_ID.scheme.short;
    default: return undefined;
  }
}

/**
 * The words that name a glossary term in running text (case-insensitive, whole words), longest first, so
 * "local heat" wins over "heat". A Term (ui/clarity/Term.tsx) links them, the nested tooltip's own text too.
 */
export const TERM_WORDS: [string, string][] = ([
  ['hollow crown', 'hollow'], ['local heat', 'heat.local'], ['family heat', 'heat.family'], ['federal heat', 'heat.federal'],
  ['kick-up', 'kickup'], ['kicks up', 'kickup'], ['respect', 'respect'], ['heat', 'heat'], ['standing', 'standing'], ['made man', 'made'], ['made men', 'made'], ['get made', 'made'], ['getting made', 'made'], ['be made', 'made'],
  ['envelope', 'envelope'], ['tribute', 'tribute'], ['the Table', 'table'], ['opinion', 'opinion'], ['influence', 'influence'],
  ['storm warning', 'storm'], ['unwashed', 'unwashed'], ['favors', 'favors'],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

/** Split text into plain runs and term runs (each term linked once). Pure. */
export function termRuns(text: string, skip: readonly string[] = []): { t: string; id?: string }[] {
  const seen = new Set(skip);
  const out: { t: string; id?: string }[] = [];
  let rest = text;
  for (let guard = 0; rest && guard < 40; guard++) {
    let best: { i: number; len: number; id: string } | undefined;
    for (const [w, id] of TERM_WORDS) {
      if (seen.has(id) || !BY_ID[id]) continue;
      const m = new RegExp(`\\b${w.replace(/[-]/g, '\\-')}\\b`, 'i').exec(rest);
      if (m && (!best || m.index < best.i || (m.index === best.i && w.length > best.len))) best = { i: m.index, len: m[0].length, id };
    }
    if (!best) { out.push({ t: rest }); break; }
    if (best.i > 0) out.push({ t: rest.slice(0, best.i) });
    out.push({ t: rest.slice(best.i, best.i + best.len), id: best.id });
    seen.add(best.id);
    rest = rest.slice(best.i + best.len);
  }
  return out;
}
