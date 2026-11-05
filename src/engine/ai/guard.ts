import { clean } from '../minds/talk';
import type { GameState } from '../types';

/**
 * THE GUARD for anything Claude writes into the game (ai/counsel.ts, ai/paper.ts).
 * The engine decides; Claude's words are data, and they pass only if they keep
 * to the facts they were given: no names that were not supplied, no money that
 * was not supplied, nothing explicit or how-to, no real people, no film lines.
 * Pure, deterministic, never throws.
 */

export { clean };

/** Nothing explicit, no gore, no slurs or curses. */
export const BAD = /\b(sex|sexual|naked|nude|rape|gore|guts|brains|blood everywhere|torture|dismember\w*|fuck\w*|shit\w*|cunt|whore|nigg\w*|fag\w*)\b/i;

/** How-to talk: real-world instructions are never part of an answer. */
export const HOWTO = /\b(how to (make|build|cook|mix|wire|pick|hotwire|launder)|step one|step 1|ingredients|recipe for|detonat\w*|silencer|untraceable|bleach the|dissolve the)\b/i;

/** Lines everyone knows from the pictures (and their near-misses). */
export const FILM = /(offer he can'?t refuse|offer you can'?t refuse|leave the gun|take the cannoli|sleeps with the fishes|say hello to my little friend|you talkin'? to me|funny how\??|i'?m gonna make him an offer|keep your friends close|it'?s not personal|strictly business|forget about it|fuggedaboutit|top of the world, ma|made it, ma|go to the mattresses|just when i thought i was out|badges\? we don'?t need)/i;

/** Real crime figures and real public people a period piece might reach for. Never in our pages. */
export const REAL = /\b(capone|luciano|lansky|genovese|gambino|gotti|bonanno|lucchese|colombo|costello|anastasia|bruno|scarfo|nicodemo|sinatra|kennedy|nixon|eisenhower|hoover|kefauver|giancana|trafficante|marcello|hoffa|dean martin|sammy davis|elvis|presley|chubby checker|dick clark|bobby rydell|frankie avalon|annette|trump|biden|obama)\b/i;

/** Words that may be capitalized in a period text without being a name nobody gave. */
const COMMON = new Set(`a an the and but or nor for so yet of in on at to by with from as if then than this that these those there here when where who what why how which while after before since until because though although i me my mine we us our you your he him his she her they them their it its one two three four five six seven eight nine ten
mr mrs miss ms dr sr jr st ave avenue blvd street boulevard road
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december
spring summer fall autumn winter season labor memorial independence christmas easter thanksgiving new year years day night week weekend
god lord heaven church father mother brother sister uncle aunt cousin son daughter wife husband widow boss don sir ma pa
wildwood north crest west jersey new york philadelphia philly cape county shore boardwalk beach island inlet ocean atlantic city pier piers pacific
police chief mayor council commissioner prosecutor sheriff detective sergeant captain officer patrolman judge court federal state government bureau fbi g-men feds
daily tide weekly leader editor editorial letters sports society business weather gossip column page front extra edition paper news newspaper reporter
american america nation national navy army war peace family families crew club clubs hotel motel lounge bar tavern ballroom hall theater theatre
no yes not now never always every all some any each most more much many few last next first second third
mister madam lady gentleman gentlemen ladies folks fellow fellows town townspeople visitors tourists merchants
it's i'm he's she's we're they're don't can't won't isn't wasn't`.split(/\s+/));

const words = (t: string): string[] => t.toLowerCase().replace(/[^a-z'\s-]/g, ' ').split(/\s+/).filter(Boolean);

/** The vocabulary of the facts given (lower case), to test names against. */
export function vocab(...texts: string[]): Set<string> {
  const v = new Set<string>();
  for (const t of texts) for (const w of words(t)) { v.add(w); v.add(w.replace(/'s$/, '')); }
  return v;
}

/**
 * Capitalized words in the middle of a sentence that are neither common nor
 * in the facts given: names (people, places, businesses) nobody supplied.
 * ALL-CAPS words are not judged here (headlines); see `badCharNames`.
 */
export function inventedNames(text: string, known: Set<string>): string[] {
  const out: string[] = [];
  // Split into sentences; the first word of each is allowed its capital.
  for (const sent of text.split(/(?<=[.!?:;—–"“”])\s+|\n+/)) {
    const toks = sent.split(/\s+/).filter(Boolean);
    toks.forEach((raw, i) => {
      const w = raw.replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, '');
      if (!w || i === 0) return;
      if (!/^[A-Z][a-z]/.test(w)) return;
      const lw = w.toLowerCase().replace(/'s$/, '');
      if (COMMON.has(lw) || known.has(lw)) return;
      out.push(w);
    });
  }
  return [...new Set(out)];
}

/**
 * Names of people in the game who are NOT among the allowed: a last name (or
 * first and last) found in the text, any case. A last name an allowed person
 * shares is not counted.
 */
export function badCharNames(s: GameState, text: string, allowed: ReadonlySet<string>, known?: ReadonlySet<string>): string[] {
  const okLast = new Set<string>();
  const okFirst = new Set<string>();
  for (const id of allowed) { const c = s.characters[id]; if (c) { okLast.add(c.lastName.toLowerCase()); okFirst.add(c.firstName.toLowerCase()); } }
  const t = ` ${text.toLowerCase().replace(/[^a-z'\s]/g, ' ').replace(/\s+/g, ' ')} `;
  const out = new Set<string>();
  for (const c of Object.values(s.characters)) {
    if (allowed.has(c.id) || !c.lastName || c.lastName.length < 4) continue;
    const last = c.lastName.toLowerCase();
    if (okLast.has(last) || COMMON.has(last) || known?.has(last)) continue;
    if (t.includes(` ${last} `) || t.includes(` ${last}'s `)) out.add(c.lastName);
  }
  for (const d of s.departed ?? []) {
    const nm = (d as { name?: string }).name;
    const last = nm?.split(/\s+/).pop()?.toLowerCase();
    if (last && last.length >= 4 && !okLast.has(last) && !COMMON.has(last) && !known?.has(last) && t.includes(` ${last} `)) out.add(last);
  }
  return [...out];
}

/** Dollar figures in the text that are not among the figures given (commas ignored). */
export function strangeMoney(text: string, given: string): string[] {
  const have = new Set((given.match(/\$[\d,]+/g) ?? []).map((x) => x.replace(/[$,]/g, '')));
  return (text.match(/\$[\d,]+/g) ?? []).map((x) => x.replace(/[$,]/g, '')).filter((x) => !have.has(x));
}

export function wordCount(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}

/** The common checks: the first failure, or undefined when the text is fit to print. */
export function unfit(text: string, known?: Set<string>): string | undefined {
  if (BAD.test(text)) return 'explicit';
  if (HOWTO.test(text)) return 'how-to';
  if (FILM.test(text)) return 'film line';
  // A real name is out, unless the game itself gave someone that name (then it is ours).
  for (const m of text.matchAll(new RegExp(REAL.source, 'gi'))) if (!m[0].toLowerCase().split(/\s+/).every((w) => known?.has(w))) return 'real person';
  if (/https?:|www\.|<\/?[a-z]/i.test(text)) return 'markup';
  return undefined;
}
