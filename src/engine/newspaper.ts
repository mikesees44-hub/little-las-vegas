import { compareDates } from './calendar';
import { heat, type Ctx } from './ledger';
import { pick } from './rng';
import type { ChronicleEntry, GameDate, GameState, NewsItem } from './types';

/**
 * The papers. Each week the Wildwood Leader (local) and, when something is
 * big enough, the Philadelphia Bulletin (regional) put a story on the front
 * page. Stories come from what happened (the chronicle) through typed
 * templates; on quiet weeks the front page carries the history of the day or
 * shore color. Headlines about the boss's business draw heat — each with a
 * named ledger line.
 */
export const LEADER = 'Wildwood Leader';
export const BULLETIN = 'Philadelphia Bulletin';
export const NEWS_KEEP = 80;

export type StoryKind =
  | 'murder' | 'missing' | 'raid' | 'arrest' | 'scandal' | 'expose' | 'expansion' | 'betrayal' | 'alliance'
  | 'illness' | 'death' | 'birth' | 'marriage' | 'succession' | 'war' | 'history' | 'color';

/** Headline and body templates (adapted from the old news desk, set on the Jersey shore). */
const T: Record<Exclude<StoryKind, 'history' | 'color'>, { h: (p: P) => string; b: (p: P) => string; paper?: string; heat?: { bar: 'local' | 'federal'; amount: number } }> = {
  murder: { h: (p) => `POLICE PROBE ${p.place} KILLING; UNDERWORLD WHISPERS`, b: (p) => `Detectives are looking into the death of ${p.who}. Witnesses are scarce, and nobody on the block is eager to talk.`, heat: { bar: 'local', amount: 3 } },
  missing: { h: (p) => `${p.place} FAMILY REPORTS MAN MISSING`, b: (p) => `${p.who} has not been seen in days. Relatives speak of debts and late-night meetings.`, heat: { bar: 'local', amount: 2 } },
  raid: { h: (p) => `RAID ROCKS ${p.place} NIGHT SPOTS`, b: () => 'Officers say the operation targeted gambling and the men who protect it. No top names were charged, but the heat downtown is climbing.' },
  arrest: { h: (p) => `${p.who.toUpperCase()} HELD FOR QUESTIONING`, b: (p) => `${p.who} was taken downtown. A lawyer from Philadelphia arrived within the hour.`, paper: BULLETIN },
  scandal: { h: (p) => `CITY HALL ON EDGE AS ${p.place} SCANDAL WIDENS`, b: () => 'Talk of licenses and no-show contracts is putting new pressure on the commissioners.', heat: { bar: 'local', amount: 2 } },
  expose: { h: (p) => `REPORTER DIGS INTO ${p.place}'S QUIET OWNERS`, b: () => 'A Sunday piece is said to be coming together around shell companies, cash and witnesses who suddenly remember names.', paper: BULLETIN, heat: { bar: 'federal', amount: 2 } },
  expansion: { h: (p) => `RIVAL OUTFIT REDRAWS ${p.place}'S SHADOW MAP`, b: (p) => `${p.who} is taking corners, clerks and small-time politicians block by block.` },
  betrayal: { h: (p) => `PARTNERSHIP CRACKS IN ${p.place} AS LEAKS SURFACE`, b: (p) => `${p.who} appears to have traded whispers for leverage.` },
  alliance: { h: () => `POWER BROKERS MEET BEHIND CLOSED DOORS`, b: (p) => `${p.who}: the kind of arrangement that builds empires also builds resentments.`, paper: BULLETIN },
  illness: { h: (p) => `${p.who.toUpperCase()} SIDELINED BY ILLNESS`, b: () => 'Lieutenants, cousins and creditors are all measuring the room at once.' },
  death: { h: (p) => `${p.who.toUpperCase()} DIES`, b: () => 'Funeral flowers hide old grudges and new ambitions. Men are already choosing sides.' },
  birth: { h: (p) => `SOCIETY: A CHILD FOR THE ${p.house.toUpperCase()} FAMILY`, b: () => 'In some circles even a christening is a future arrangement.' },
  marriage: { h: (p) => `SOCIETY: ${p.house.toUpperCase()} WEDDING DRAWS A CROWD`, b: (p) => `${p.who}. Downtown reads more than romance into it.` },
  succession: { h: (p) => `NEW FACE AT THE HEAD OF THE ${p.house.toUpperCase()} TABLE`, b: (p) => `${p.who}. Old friends of the family say little, and say it carefully.`, paper: BULLETIN },
  war: { h: (p) => `GANG FEUD FEARED AFTER ${p.place} VIOLENCE`, b: () => 'Police brass promise more patrols on the boardwalk. Merchants want the summer trade left alone.', heat: { bar: 'local', amount: 3 } },
};

interface P {
  who: string;
  place: string;
  house: string;
}

/** History on the front page (no living people, no quotes). */
export const BACKDROP: { date: GameDate; paper: string; headline: string; body: string; heat?: { bar: 'local' | 'federal'; amount: number } }[] = [
  { date: { y: 1960, m: 11, d: 9 }, paper: BULLETIN, headline: 'KENNEDY ELECTED IN A SQUEAKER', body: 'The senator from Massachusetts edges out the Vice President. Illinois and Texas decide it.' },
  { date: { y: 1961, m: 4, d: 19 }, paper: BULLETIN, headline: 'INVASION OF CUBA FAILS AT BAY OF PIGS', body: 'Exile brigade routed; Washington faces hard questions.' },
  { date: { y: 1961, m: 9, d: 13 }, paper: BULLETIN, headline: 'CONGRESS BANS BETTING BY WIRE ACROSS STATE LINES', body: 'Bookmakers who lay off by telephone now face federal charges.', heat: { bar: 'federal', amount: 3 } },
  { date: { y: 1962, m: 10, d: 23 }, paper: BULLETIN, headline: 'NAVY QUARANTINES CUBA; MISSILE CRISIS GRIPS NATION', body: 'Shore families stock up on canned goods.' },
  { date: { y: 1963, m: 9, d: 27 }, paper: BULLETIN, headline: 'MOB TURNCOAT TELLS SENATE OF SECRET SOCIETY', body: 'A convicted soldier names "this thing of ours" before the cameras. Every family on the East Coast is watching.', heat: { bar: 'federal', amount: 6 } },
  { date: { y: 1963, m: 11, d: 23 }, paper: BULLETIN, headline: 'PRESIDENT SLAIN IN DALLAS', body: 'The nation mourns. Flags at half staff on the boardwalk.' },
  { date: { y: 1964, m: 8, d: 25 }, paper: LEADER, headline: 'DEMOCRATS CONVENE IN ATLANTIC CITY', body: 'Hotels full from the Inlet to Ventnor; shore merchants call it the best August in memory.' },
  { date: { y: 1964, m: 7, d: 31 }, paper: LEADER, headline: 'NEW EXPRESSWAY OPENS TO THE SHORE', body: 'Philadelphia to the shore in about an hour — and the cops say that cuts both ways.' },
  { date: { y: 1968, m: 6, d: 20 }, paper: BULLETIN, headline: 'CRIME BILL LETS FEDS TAP PHONES WITH A WARRANT', body: 'Back rooms everywhere get quieter.', heat: { bar: 'federal', amount: 4 } },
  { date: { y: 1969, m: 7, d: 21 }, paper: BULLETIN, headline: 'MEN WALK ON THE MOON', body: 'Boardwalk crowds gather around television sets in shop windows.' },
  { date: { y: 1970, m: 10, d: 16 }, paper: BULLETIN, headline: 'NEW RACKETEERING LAW TARGETS ORGANIZED CRIME', body: 'Prosecutors can now charge a whole enterprise, boss and all.', heat: { bar: 'federal', amount: 6 } },
  { date: { y: 1974, m: 11, d: 6 }, paper: LEADER, headline: 'VOTERS REJECT STATEWIDE CASINO GAMBLING', body: 'Shore towns had hoped for a rescue; the rest of the state said no.' },
  { date: { y: 1976, m: 11, d: 3 }, paper: LEADER, headline: 'CASINOS FOR ATLANTIC CITY: VOTERS SAY YES', body: 'Only Atlantic City this time. Everyone with money is driving up the parkway.' },
  { date: { y: 1978, m: 5, d: 27 }, paper: LEADER, headline: 'FIRST CASINO OPENS ON THE BOARDWALK', body: 'Lines around the block in Atlantic City.' },
];

const COLOR: { m: number[]; headline: string; body: string }[] = [
  { m: [6, 7, 8], headline: 'RECORD CROWDS ON THE BOARDWALK', body: 'Merchants report their best weekend in years; the trams ran late into the night.' },
  { m: [6, 7, 8], headline: 'RIP CURRENTS: LIFEGUARDS MAKE SIX RESCUES', body: 'The beach patrol asks bathers to stay between the flags.' },
  { m: [7, 8], headline: 'ROCK AND ROLL KEEPS THE PIERS UP LATE', body: 'Clubs on Pacific Avenue packed past midnight; neighbors complain of the noise.' },
  { m: [9], headline: 'LABOR DAY CLOSES THE SEASON', body: 'Shutters come down on the boardwalk. Winter is long on the island.' },
  { m: [10, 11, 12, 1, 2, 3], headline: 'NOR\'EASTER BATTERS THE ISLAND', body: 'Flooding on New Jersey Avenue; the boardwalk takes a beating.' },
  { m: [11, 12, 1, 2], headline: 'OFF-SEASON: SHOPS SHUTTERED, TOWN QUIET', body: 'Year-rounders hunker down. The fishing is good off the Crest.' },
  { m: [4, 5], headline: 'COUNCIL PLANS BOARDWALK REPAIRS FOR THE SEASON', body: 'Bids are out; everyone wonders who will get the contract.' },
  { m: [5, 6], headline: 'SEASON OPENS: PIERS READY, MOTELS BOOKED', body: 'Memorial Day weekend brings the first crowds over the bridge.' },
];

function classify(e: ChronicleEntry): StoryKind | undefined {
  const t = e.text.toLowerCase();
  if (e.kind === 'succession') return 'succession';
  if (e.kind === 'death') {
    if (/never found|disappear/.test(t)) return 'missing';
    if (/killed|shot|murder|trunk|whacked|hit/.test(t)) return 'murder';
    return 'death';
  }
  if (e.kind === 'heat') {
    if (/raid|padlock/.test(t)) return 'raid';
    if (/arrest|indict|picked up|held/.test(t)) return 'arrest';
    return 'scandal';
  }
  if (e.kind === 'family') {
    if (/born|birth/.test(t)) return 'birth';
    if (/married|wedding/.test(t)) return 'marriage';
    if (/ill|sick/.test(t)) return 'illness';
  }
  if (e.kind === 'rival') {
    if (/war/.test(t)) return 'war';
    if (/took|claim|moved/.test(t)) return 'expansion';
  }
  if (/informant|rat|betray/.test(t)) return 'betrayal';
  if (/expos|reporter/.test(t)) return 'expose';
  return undefined;
}

const PRIORITY: StoryKind[] = ['succession', 'murder', 'war', 'missing', 'arrest', 'raid', 'expose', 'scandal', 'betrayal', 'expansion', 'death', 'illness', 'marriage', 'birth', 'alliance'];
const PLACES = ['WILDWOOD', 'NORTH WILDWOOD', 'WILDWOOD CREST', 'RIO GRANDE', 'CAPE MAY'];

/** Who a chronicle line is about: the start of the line up to the verb. */
function subject(text: string): string {
  const m = text.match(/^(.+?) (was|died|became|fell|married|has|is|had|took)\b/);
  return (m ? m[1] : text.split('.')[0]).replace(/^You /, 'A local businessman ').slice(0, 60);
}

/**
 * This week's front pages. Reads chronicle entries written since the last
 * edition (tracked in flags.newsIdx) and posts heat for headlines about the
 * boss's world, named by the headline.
 */
export function newsWeek(ctx: Ctx): NewsItem[] {
  const s = ctx.s;
  const from = s.flags.newsIdx ?? Math.max(0, s.chronicle.length - 1);
  const fresh = s.chronicle.slice(from);
  s.flags.newsIdx = s.chronicle.length;
  const out: NewsItem[] = [];
  const add = (paper: string, headline: string, body: string, kind: string) => out.push({ week: s.week, date: { ...s.date }, paper, headline, body, kind });

  // The story of the week.
  const CUE_STORY: Record<string, StoryKind> = { hit_botched: 'arrest', hit_witness: 'murder', betrayal_confrontation: 'betrayal' };
  const fromCues: ChronicleEntry[] = s.cutscenes.filter((c) => CUE_STORY[c.key]).map((c) => ({ week: s.week, date: s.date, text: c.text, because: c.key, kind: CUE_STORY[c.key] === 'arrest' ? 'heat' : CUE_STORY[c.key] === 'murder' ? 'death' : 'misc' }));
  const stories = [...fromCues, ...fresh].map((e) => ({ e, k: (CUE_STORY[e.because ?? ''] as StoryKind | undefined) ?? classify(e) })).filter((x): x is { e: ChronicleEntry; k: Exclude<StoryKind, 'history' | 'color'> } => !!x.k && x.k in T);
  stories.sort((a, b) => PRIORITY.indexOf(a.k) - PRIORITY.indexOf(b.k));
  const lead = stories[0];
  let heated = false;
  if (lead) {
    const tpl = T[lead.k];
    const p: P = { who: subject(lead.e.text), place: pick(s, PLACES), house: s.houseName };
    const headline = tpl.h(p);
    add(tpl.paper ?? LEADER, headline, tpl.b(p), lead.k);
    if (tpl.heat && lead.e.because) {
      const amt = s.edicts?.lowprofile ? Math.ceil(tpl.heat.amount / 2) : tpl.heat.amount;
      heat(ctx, tpl.heat.bar, amt, `Headline: "${headline}"`, 'heat');
      heated = true;
    }
    // A second, smaller story from the other paper.
    const second = stories.find((x) => x !== lead && (T[x.k].paper ?? LEADER) !== (tpl.paper ?? LEADER));
    if (second) {
      const t2 = T[second.k];
      const p2: P = { who: subject(second.e.text), place: pick(s, PLACES), house: s.houseName };
      add(t2.paper ?? LEADER, t2.h(p2), t2.b(p2), second.k);
    }
  }

  // History on the day.
  for (const h of BACKDROP) {
    const c = compareDates(s.date, h.date);
    const key = `news_${h.date.y}${h.date.m}${h.date.d}`;
    const ord = (d: GameDate) => d.y * 372 + d.m * 31 + d.d;
    if (c >= 0 && !s.flags[key] && ord(s.date) - ord(h.date) <= 14) {
      s.flags[key] = 1;
      add(h.paper, h.headline, h.body, 'history');
      if (h.heat && !heated) heat(ctx, h.heat.bar, h.heat.amount, `Headline: "${h.headline}"`, 'heat');
    }
  }

  // A quiet week: shore color in the Leader.
  if (!out.some((n) => n.paper === LEADER)) {
    const opts = COLOR.filter((c) => c.m.includes(s.date.m));
    if (opts.length) {
      const c = opts[s.week % opts.length];
      add(LEADER, c.headline, c.body, 'color');
    }
  }
  s.news.push(...out);
  if (s.news.length > NEWS_KEEP) s.news = s.news.slice(-NEWS_KEEP);
  return out;
}

/** The latest edition of a paper (the most recent week it printed). */
export function frontPage(s: GameState, paper: string, week?: number): NewsItem[] {
  const items = s.news.filter((n) => n.paper === paper && (week === undefined || n.week <= week));
  if (!items.length) return [];
  const w = items[items.length - 1].week;
  return items.filter((n) => n.week === w).concat(items.filter((n) => n.week < w).slice(-4).reverse());
}
