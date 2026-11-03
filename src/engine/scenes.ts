import { ageOn, isInSeason, memorialDay, toDays, weekday } from './calendar';
import { dressScene } from './sceneVariants';
import { hasBones } from './bones';
import { capos, crew, displayName, isFree, player } from './characters';
import { regimeSizes } from './hierarchy';
import { beat, hit, mgEffect, mgOf, registerAttacher, registerMinigame, type MgOption, type MgSession, type MinigameDef } from './minigame';
import type { Character, Effect, EventInstance, GameDate, GameState } from './types';
import { above, chiefOf, donOf } from './valente';

/**
 * SCRIPTED SPECIAL MOMENTS, played in the mini-game framework as short
 * multi-beat cinematic scenes: a full-screen noir card per beat, the real
 * characters' portraits, typewriter text, one to three choices with real
 * effects, and the same "let it play out".
 *
 *  - MADE THE BOSS: the opening of every new game (and again when a new boss
 *    takes the chair by succession).
 *  - THE MADE-MAN CEREMONY: replaces the old single-card making.
 *
 * The text follows Michael's special-moments script.
 */

export interface SceneCard {
  scene: string;
  kicker: string;
  text: string;
  actors: string[];
}

interface Beat {
  card: SceneCard;
  options: MgOption[];
}

export interface SceneData {
  kind: 'madeboss' | 'ceremony';
  beats: Beat[];
  i: number;
  card: SceneCard;
  /** Effects gathered from the choices. */
  fx: Effect[];
  picks: string[];
  title: string;
  /** Ceremony: the candidate and the people around him. */
  candidateId?: string;
  sponsorId?: string;
  capoId?: string;
  crewCapoId?: string;
  speech?: string;
  fbi?: boolean;
  passedOver?: string[];
  variant?: string;
}

type SS = MgSession<SceneData>;

const next = (label = 'Continue'): MgOption[] => [{ id: 'next', label }];
const name = (c: Character | undefined, fallback = 'somebody') => (c ? displayName(c) : fallback);

/* ---------------------------------------------------------------- */
/* Made the Boss                                                     */
/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */
/* The opening's premise (A14): one record every opening text reads   */
/* ---------------------------------------------------------------- */

/** How the game opens: the old boss buried, the old boss retired, the old boss is you (House of Sees), or a first day on a corner. */
export type OpeningPremise = 'funeral' | 'retired' | 'sees' | 'rise' | 'olddon' | 'associate' | 'soldier' | 'capo';

/** The scene variant a start opens with: the climbing starts (associate, soldier, capo) open like Rise to Power. */
export function openingVariant(start: string): string {
  return start;
}

/** The low starts: an opening that is true to the rank (an associate is never "made the boss"). */
export function isRankVariant(v: string): v is 'associate' | 'soldier' | 'capo' {
  return v === 'associate' || v === 'soldier' || v === 'capo';
}

/** The premise, from the start and from whether the old man (the boss's father) is alive. */
export function openingPremise(s: GameState, variant: string): OpeningPremise {
  if (variant === 'sees') return 'sees';
  if (variant === 'rise') return 'rise';
  if (variant === 'olddon') return 'olddon';
  if (isRankVariant(variant)) return variant;
  const p = player(s);
  const old = p.fatherId ? s.characters[p.fatherId] : undefined;
  return variant === 'succession' || !old || !old.alive ? 'funeral' : 'retired';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday, May 30, 1960". */
export function longDate(d: GameDate): string {
  return `${WEEKDAYS[weekday(d)]}, ${MONTHS[d.m - 1]} ${d.d}, ${d.y}`;
}

/**
 * Where the season stands, read off the calendar (Memorial Day opens the
 * boardwalk; calendar.ts seasonInfo is the same rule): never a fixed "in
 * nine days" that the date in the corner contradicts.
 */
export function boardwalkLine(d: GameDate): string {
  const md = memorialDay(d.y);
  const until = toDays(md) - toDays(d);
  if (until > 0 && until <= 21) return `In ${until} day${until === 1 ? '' : 's'} the boardwalk opens for the season.`;
  if (until === 0) return 'It is Memorial Day: the boardwalk opened for the season this weekend, and the island is full.';
  if (isInSeason(d)) return until > -8 ? 'The boardwalk opened for the season this weekend, and the island is full.' : 'The season is on, and the island is full.';
  return 'The boardwalk is boarded up until Memorial Day.';
}

/** The title card that opens a new game (App shows it before the first scene). Same premise as the scene. */
export function openingCard(s: GameState): { title: string; text: string; key: 'opening' | 'sitdown' } {
  const ev = s.pendingEvents.find((e) => e.defId === 'made_boss');
  const variant = String(ev?.meta?.variant ?? (s.flags.start_olddon ? 'olddon' : s.flags.start_sees ? 'sees' : s.flags.start_rise ? 'rise' : s.flags.start_associate ? 'associate' : s.flags.start_soldier ? 'soldier' : s.flags.start_capo ? 'capo' : 'classic'));
  const premise = openingPremise(s, variant);
  const p = player(s);
  const when = `${MONTHS[s.date.m - 1]} ${s.date.d}, ${s.date.y}`;
  const line = boardwalkLine(s.date);
  const kids = p.childrenIds.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive && ageOn(c.birth, s.date) >= 18).map((c) => c.firstName);
  const list = kids.length ? kids.join(', ').replace(/, ([^,]*)$/, ' and $1') : '';
  if (premise === 'olddon') return { key: 'sitdown', title: `The Bolero Supper Club · ${when}`, text: `Ten summers. Ten summers since ${displayName(p)} sat down in the old chair, and in all that time not one body on the boardwalk, not one envelope to Philadelphia that came up light. The houses are paid for, the children are set up, the cellar on Glenwood Avenue is full of Barolo, and there is a girl on Pacific Avenue who still laughs at his stories. ${line} Tonight the whole island drinks to him. And under the toasts, he can hear it, the way his knees hear rain coming: everybody is posting up.` };
  if (premise === 'sees') return { key: 'sitdown', title: `The Bolero Supper Club · ${when}`, text: `A retirement dinner nobody calls a retirement dinner. ${displayName(p)} has run Wildwood for thirty years, and tonight he tells the room he will choose an heir before the summer is out.${list ? ` ${list} sit at three different tables.` : ''} ${line} By Labor Day everyone will know who comes after him.` };
  if (isRankVariant(premise)) {
    const a = above(s);
    const chief = chiefOf(s);
    const don = donOf(s);
    const dn = don ? displayName(don) : 'Don Cosimo Valente';
    const cn = chief ? displayName(chief) : 'your capo';
    if (premise === 'associate') return { key: 'sitdown', title: `Pacific and Schellenger · ${when}`, text: `You are not anybody yet. You run slips for ${cn} out of a cigar store on Pacific Avenue, and on Mondays you carry an envelope up the back stairs of the Shamrock. Above ${chief?.firstName ?? 'him'} there is an underboss, and above the underboss there is ${dn}, who has never once said your name. ${line} Get made, and he will.` };
    if (premise === 'soldier') return { key: 'sitdown', title: `The Shamrock · ${when}`, text: `Last winter you held a burning holy card in your hands and became one of them. Now you are a soldier in ${cn}'s regime in the ${a?.name ?? 'Valente'} family: a few kids who run for you, an envelope every Monday to ${chief?.firstName ?? 'your capo'}, and a long way still to the top of the stairs. ${line}` };
    return { key: 'sitdown', title: `The Bolero Supper Club · ${when}`, text: `${dn} gave you a crew last month. There are other capos at his table, and none of them asked for you. Every Monday your envelope goes up to the underboss, and every Monday they count it twice. ${line} Run your street, keep your men, and wait for a seat to open.` };
  }
  if (premise === 'rise') return { key: 'sitdown', title: `Pacific and Schellenger · ${when}`, text: `A numbers bank, a few guys, and a corner. Nobody in Philadelphia knows your name yet. ${line} By Labor Day, a few men on this island will know it.` };
  if (premise === 'retired') return { key: 'sitdown', title: `The Bolero Supper Club · ${when}`, text: `A retirement dinner. The old man hands you the keys to the back room and a list of names in his own handwriting. ${line} From tonight you are running things, and behind you the capos are counting.` };
  // The funeral (the church still and clip) only when there was a funeral.
  return { key: 'opening', title: `St. Ann's, Wildwood · ${when}`, text: `The church smells of lilies and floor wax. The old man lies in a bronze casket that cost more than most of the mourners make in a year. ${line} Somebody has to be running things now. You stand in the front pew, and behind you the capos are counting.` };
}

function capoRing(s: GameState): Character[] {
  const ks = capos(s).filter((k) => k.alive && k.id !== s.playerId);
  const ub = crew(s).find((c) => c.rank === 'underboss' && c.alive);
  const all = [...(ub ? [ub] : []), ...ks];
  // Capo1 is the one who would sit in the old man's chair: the most ambitious, then the oldest.
  return all.sort((a, b) => Number(b.traits.includes('Ambitious')) - Number(a.traits.includes('Ambitious')) || a.birth.y - b.birth.y);
}

function madeBossBeats(s: GameState, ses: SS): Beat[] {
  const p = player(s);
  const variant = String(ses.params.variant ?? (s.flags.start_rise ? 'rise' : s.flags.start_sees ? 'sees' : 'classic'));
  const ring = capoRing(s);
  const [k1, k2, k3] = ring;
  const philly = s.rivals.find((r) => r.id === 'philly');
  const phillyBoss = philly ? s.characters[philly.leaderId] : undefined;
  const wife = p.spouseId ? s.characters[p.spouseId] : undefined;
  const oldId = String(ses.params.old ?? p.fatherId ?? '');
  const old = oldId ? s.characters[oldId] : undefined;
  const cause = String(ses.params.cause ?? old?.death?.cause ?? '');
  const kName = (k: Character | undefined, f: string) => (k ? displayName(k) : f);
  const date = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][s.date.m - 1]} ${s.date.d}, ${s.date.y}`;
  const fx = {
    sit: [{ type: 'respect', amount: 3 }, ...(k1 ? [{ type: 'opinion', from: k1.id, to: p.id, amount: -10, reason: 'Took the chair without a word', decay: 0 }] : [])] as Effect[],
    stay: [{ type: 'respect', amount: -2 }, ...(k1 ? [{ type: 'opinion', from: k1.id, to: p.id, amount: 15, reason: 'Let me keep the old man\'s chair', decay: 1 }] : [])] as Effect[],
    round: [...ring.map((k) => ({ type: 'opinion', from: k.id, to: p.id, amount: 5, reason: 'A round table', decay: 1 }) as Effect), ...(ring.length ? [{ type: 'opinion', from: [...ring].sort((a, b) => a.birth.y - b.birth.y)[0].id, to: p.id, amount: -4, reason: 'The old guard grumbles', decay: 1 } as Effect] : [])],
  };
  const chairChoices = (who: Character | undefined): MgOption[] => who ? [
    { id: 'sit', label: 'Sit in it. Say nothing.', detail: `Fear: +3 respect; ${who.firstName} −10, and he remembers.` },
    { id: 'stay', label: `Ask him to stay seated. "${variant === 'sees' ? 'You earned' : 'My father would want you'} comfortable."`, detail: `Respect: ${who.firstName} +15; the others read it as softness (−2 respect).` },
    { id: 'round', label: 'Take a different chair. "We\'ll get a round table."', detail: 'Generosity: every capo +5; the old guard grumbles.' },
  ] : next();
  const beats: Beat[] = [];
  if (isRankVariant(variant)) {
    ses.d.fx = [];
    (ses.d as SceneData & { chairFx?: typeof fx }).chairFx = fx;
    return rankBeats(s, variant);
  }
  if (variant === 'olddon') {
    const kids = p.childrenIds.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
    const goom = s.nightlife ? Object.values(s.nightlife.goomars).find((g) => !g.ended) : undefined;
    const her = goom ? s.characters[goom.id] : undefined;
    beats.push({ card: { scene: 'sitdown', kicker: `The Bolero Supper Club. ${date}.`, text: `Ten years ago this week the old Don's heart gave out on a train platform and Philadelphia said yes to you. Since then: the numbers paid, the clubs full, the cops fed, and the Daily Tide calling you a Pacific Avenue businessman with a straight face.\n\nThe band plays "Volare" for the third time because you asked them to.`, actors: [p.id] }, options: next() });
    beats.push({ card: { scene: 'street', kicker: 'What ten years bought', text: `${kids.length ? `${kids.map((k) => k.firstName).join(', ').replace(/, ([^,]*)$/, ' and $1')} are set up: a motor inn with clean books, a house in the Crest, a house for the one who still wants in. ` : ''}${wife ? `${wife.firstName} has her furs and her rosary and her Sundays. ` : ''}The cellar on Glenwood Avenue is full of Barolo you are saving for occasions that keep coming.${her ? `\n\nAnd ${her.firstName}, on ${goom!.where.replace(/^an? /, 'the ')}, who has never once asked you for anything you did not want to give.` : ''}`, actors: [p.id, ...(wife ? [wife.id] : []), ...(her ? [her.id] : [])] }, options: next() });
    beats.push({ card: { scene: 'sitdown', kicker: 'Who stands, who sits', text: `The toasts start. ${kName(k3, 'An old friend')} is on his feet before the band stops. ${kName(k2, 'Another capo')} raises his glass a beat late. ${kName(k1, 'One of them')} stays in his chair, smiling, and checks his watch.\n\nEverybody is posting up. Not against you, maybe. Around you. Like men on a pier waiting to see which way the boat tips.`, actors: [p.id, ...[k1, k2, k3].filter((x): x is Character => !!x).map((x) => x.id)] }, options: [
      { id: 'od_toast', label: 'Stand and toast them all: "Ten more years."', detail: 'The room roars: crew opinion +3, respect +2. The men waiting on you hear it too.' },
      { id: 'od_watch', label: 'Say little. Watch who doesn\'t clap.', detail: 'You will know whose name to ask about.' },
      { id: 'od_future', label: 'Tell them you are thinking about the future.', detail: 'The ambitious relax a little; the question is open now, out loud.' },
    ] });
    beats.push({ card: { scene: 'street', kicker: 'The boardwalk at midnight', text: `${wife ? `${wife.firstName} takes your arm on the boards. "They're all waiting for you to get old, ${p.firstName}."\n\n"I am old."\n\n"Then stop letting them watch you climb stairs."` : 'You walk the boards alone. A kid closing up a stand nods at you the way his father did.'}`, actors: wife ? [p.id, wife.id] : [p.id] }, options: next() });
    beats.push({ card: { scene: 'sitdown', kicker: 'In the morning, to the family', text: 'The capos are gathered in the back of the Shamrock. The coffee is bad. Everyone waits to hear what the old man sounds like the morning after.', actors: [p.id, ...ring.slice(0, 3).map((x) => x.id)] }, options: [
      { id: 'w_fear', label: '"Nothing moves on this island without my say. Still."', detail: 'Fear: +5 respect, crew opinion −3, rivals cautious.' },
      { id: 'w_respect', label: '"Ten years of peace. We keep it. We keep each other."', detail: 'Respect: crew opinion +5, family heat −3.' },
      { id: 'w_generous', label: '"Everybody eats this summer. Everybody."', detail: 'Generosity: crew opinion +8, −$1,500 in envelopes.' },
    ] });
    ses.d.fx = [];
    (ses.d as SceneData & { chairFx?: typeof fx }).chairFx = fx;
    return beats;
  }
  if (variant === 'rise') {
    const k = k1;
    beats.push({ card: { scene: 'street', kicker: 'First day with the crew', text: `The corner of Pacific and Schellenger, outside the numbers bank, ${longDate(s.date).replace(/, \d{4}$/, '')}, ${s.date.y}. Runners go in with paper bags and come out with nothing. Nobody in Philadelphia knows your name. Today, a few men on this island will learn it.`, actors: [p.id] }, options: next() });
    beats.push({ card: { scene: 'sitdown', kicker: 'The back room of the Shamrock', text: `The table is short and the coffee is bad. ${kName(k, 'Your capo')} is already sitting at the head of it. He stands when you walk in. Slowly. The two soldiers behind him watch to see what you do.`, actors: k ? [p.id, k.id] : [p.id] }, options: chairChoices(k) });
    beats.push({ card: { scene: 'street', kicker: 'The boardwalk at dusk', text: `You walk the length of it alone. The Ferris wheel on Hunt's Pier is still. A kid painting a ring-toss stand stops to watch you pass. Nobody has ever watched you pass before.${wife ? ` At the end of the boards ${wife.firstName} is waiting with your coat.` : ''}`, actors: wife ? [p.id, wife.id] : [p.id] }, options: next() });
    beats.push({ card: { scene: 'sitdown', kicker: 'What you tell him you want', text: `${k ? k.firstName : 'Your capo'} pours two glasses and waits. "So. What do you want out of this?"`, actors: k ? [p.id, k.id] : [p.id] }, options: firstWords(true) });
  } else {
    // One premise for every line (A14): the funeral only when the old man is dead; the date and the season from the calendar.
    const funeral = openingPremise(s, variant) === 'funeral';
    const season = boardwalkLine(s.date);
    const heirNames = variant === 'sees' ? p.childrenIds.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive && ageOn(c.birth, s.date) >= 18).map((c) => c.firstName).join(', ').replace(/, ([^,]*)$/, ' and $1') : '';
    const b1 = variant === 'sees'
      ? `The back room of the Bolero Supper Club, a retirement dinner nobody calls a retirement dinner. ${displayName(p)}, ${ageOn(p.birth, s.date)} years old, tells the room he will choose an heir before the summer is out.${heirNames ? ` ${heirNames} sit at three different tables.` : ''} ${season} By Labor Day everyone will know who comes after him.`
      : funeral
        // The opening card already set the church (lilies, the casket, the front pew): this page picks up
        // where it left off, so the player does not read the same funeral twice (playtest #7).
        ? `The priest says the last words over ${name(old, 'the old man')}${cause && variant === 'succession' ? ` (${cause})` : ''} and the pallbearers lift him. As the casket passes the front pew, every head in St. Ann's turns, not to the coffin, but to you.${variant === 'succession' ? ' Outside, the island is waiting.' : ''}\n\nOn the church steps, the old men shake your hand one at a time and say nothing that means anything.`
        // As with the funeral, the opening card already told the dinner: this page goes on from it.
        : `The plates are cleared at the Bolero. ${name(old, 'The old man')} raises his glass to you, sits back down, and just like that the room is yours. Men who never looked at you twice come over to shake your hand.\n\nThe ones who stay in their seats are the ones to watch.`;
    beats.push({ card: { scene: funeral ? 'church' : 'sitdown', kicker: funeral ? `St. Ann's, Wildwood. ${longDate(s.date)}.` : `The Bolero Supper Club. ${date}.`, text: b1, actors: [p.id, ...(old ? [old.id] : [])] }, options: next() });
    beats.push({ card: { scene: 'sitdown', kicker: funeral ? 'The back room of the Shamrock, after the burial' : 'The back room of the Shamrock, after the dinner', text: `The table is long and the coffee is bad. ${kName(k1, 'The underboss')} is already sitting in ${variant === 'sees' ? 'your chair, the way he has been practicing' : 'the old man\'s chair'}. He stands when you walk in. Slowly.\n\nOne by one they come to you. ${kName(k2, 'One capo')} kisses your cheek. ${kName(k3, 'Another')} shakes your hand and holds it a second too long. ${k1 ? k1.firstName : 'He'} does neither.`, actors: [p.id, ...[k1, k2, k3].filter((x): x is Character => !!x).map((x) => x.id)] }, options: chairChoices(k1) });
    if (variant !== 'sees') {
      beats.push({ card: { scene: 'street', kicker: 'The Buick outside', text: `A man you have never met is waiting in a gray Buick with Pennsylvania plates. ${name(phillyBoss, 'Philadelphia')} sent him. He doesn't get out.\n\n"The old man paid nine points of everything, on the first of the month, in an envelope that was never light. Philadelphia would like to know if anything has changed."`, actors: phillyBoss ? [phillyBoss.id] : [] }, options: [
        { id: 'philly_same', label: '"Nothing has changed."', detail: 'Philadelphia opinion +10.' },
        { id: 'philly_summer', label: '"Give me the summer. Then we\'ll talk about points."', detail: 'Philadelphia opinion −5; they will want to talk in the fall.' },
        { id: 'philly_envelope', label: 'Hand him an envelope you prepared last night.', detail: '−$2,000, Philadelphia opinion +20; the bagman remembers you.', disabled: s.money < 2000 ? 'Needs $2,000' : undefined },
      ] });
    }
    beats.push({ card: { scene: 'street', kicker: 'The boardwalk at dusk', text: `You walk the length of it alone. The Ferris wheel on Hunt's Pier is still. A kid painting a ring-toss stand stops to watch you pass, the way people watched ${variant === 'sees' ? 'you thirty years ago' : 'your father'}.${wife ? `\n\nAt the end of the boards ${wife.firstName} is waiting with your coat.` : ''}`, actors: wife ? [p.id, wife.id] : [p.id] }, options: next() });
    const heirs = variant === 'sees' ? p.childrenIds.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive) : [];
    beats.push({ card: { scene: 'sitdown', kicker: 'Your first words to the family', text: `The capos are gathered again. Everyone waits.${heirs.length ? ` ${heirs.map((h) => h.firstName).join(', ').replace(/, ([^,]*)$/, ' and $1')} watch from the end of the table.` : ''}`, actors: [p.id, ...(heirs.length ? heirs : ring.slice(0, 3)).map((x) => x.id)] }, options: firstWords(false) });
  }
  ses.d.fx = [];
  (ses.d as SceneData & { chairFx?: typeof fx }).chairFx = fx;
  return beats;
}

/* ---------------------------------------------------------------- */
/* The low starts' openings: true to the rank                        */
/* ---------------------------------------------------------------- */

type RankV = 'associate' | 'soldier' | 'capo';
const RANK_OPENING: Record<RankV, { label: string; pitch: string; place: (s: GameState, chief: Character | undefined) => string }> = {
  associate: { label: 'First day in the crew', pitch: 'Not made. Not anybody yet. Earn, keep your mouth shut, and wait for the books.', place: (s, ch) => `An associate in ${ch ? `${ch.firstName} ${ch.lastName}` : 'a capo'}'s crew, the ${above(s)?.name ?? 'Valente'} family` },
  soldier: { label: 'A friend of ours', pitch: 'Made. A few kids of your own, an envelope every Monday, and a capo who decides how far you go.', place: (s, ch) => `A soldier in ${ch ? `${ch.firstName} ${ch.lastName}` : 'a capo'}'s regime, the ${above(s)?.name ?? 'Valente'} family` },
  capo: { label: 'Your own crew', pitch: 'A crew, a street, and a boss above you who counts every envelope. The chair is two rungs up.', place: (s) => `A capo in the ${above(s)?.name ?? 'Valente'} family` },
};

function rankBeats(s: GameState, v: RankV): Beat[] {
  const p = player(s);
  const a = above(s);
  const ch = chiefOf(s);
  const don = donOf(s);
  const wife = p.spouseId ? s.characters[p.spouseId] : undefined;
  const ub = a?.underbossId ? s.characters[a.underbossId] : undefined;
  const rival = a?.rivalId ? s.characters[a.rivalId] : undefined;
  const others = (a?.capoIds ?? []).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
  const mine = crew(s).slice(0, 3);
  const nm = (c: Character | undefined, f: string) => (c ? displayName(c) : f);
  const quota = a?.quota ?? 0;
  const dusk: Beat = { card: { scene: 'street', kicker: 'The boardwalk at dusk', text: `You walk the length of it. The Ferris wheel on Hunt's Pier turns with nobody on it. ${v === 'associate' ? `${rival ? `Outside the Shamrock, ${rival.firstName} ${rival.lastName} is buying a round for two of ${ch?.firstName ?? 'the capo'}'s soldiers. He wants the same thing you want, and there is one slot when the books open.` : 'Nobody looks at you twice. Not yet.'}` : v === 'soldier' ? 'A kid at the ring-toss stand knows who you are and pretends he doesn\'t. That is what being made buys you on this island.' : 'Men nod at you now from the doorways. Some of them used to nod at somebody else, and they have not decided yet whether you will last.'}${wife ? `\n\nAt the end of the boards ${wife.firstName} is waiting with your coat.` : ''}`, actors: [p.id, ...(v === 'associate' && rival ? [rival.id] : []), ...(wife ? [wife.id] : [])] }, options: next() };
  if (v === 'associate') return [
    { card: { scene: 'street', kicker: 'Pacific and Schellenger', text: `The corner outside the cigar store, ${longDate(s.date)}. Runners go in with paper bags and come out with nothing. You are one of them, more or less. Nobody on this island knows your name. They know ${nm(ch, 'your capo')}'s.`, actors: [p.id] }, options: next() },
    { card: { scene: 'sitdown', kicker: 'The back booth at the Shamrock', text: `${nm(ch, 'Your capo')} has the booth facing the door, the way he always does. Two of his soldiers sit at the bar with their backs to you and see everything. He doesn't stand up. He points at the seat across from him, the one that faces the wall.`, actors: [p.id, ...(ch ? [ch.id] : [])] }, options: [
      { id: 'a1_loyal', label: 'Sit where he points.', detail: `${ch?.firstName ?? 'He'} +8. You know your place, and he likes that.` },
      { id: 'a1_hard', label: 'Take the other side of the booth, facing the door.', detail: `Respect +2; ${ch?.firstName ?? 'he'} −6: the kid thinks he's somebody.` },
      { id: 'a1_wait', label: 'Stay standing until he tells you twice.', detail: `${ch?.firstName ?? 'He'} +4; standing with the family +1.` },
    ] },
    dusk,
    { card: { scene: 'sitdown', kicker: 'What he asks you', text: `${ch?.firstName ?? 'He'} stirs his coffee for a long time. "You bring me ${quota ? `$${quota.toLocaleString('en-US')}` : 'something'} every Monday. You don't come up short, you don't run your mouth, you don't touch nobody that's with us. Do that a while and maybe somebody stands up for you." He looks at you. "So what do you want out of this?"`, actors: [p.id, ...(ch ? [ch.id] : [])] }, options: [
      { id: 'a2_hard', label: '"To get made."', detail: 'Standing +3: they like a kid who wants it. The other kids hear about it.' },
      { id: 'a2_loyal', label: '"To earn. For you first."', detail: `${ch?.firstName ?? 'He'} +6.` },
      { id: 'a2_wait', label: '"Whatever you need. Whenever."', detail: `Standing +2; ${ch?.firstName ?? 'he'} +3. He will take you up on it.` },
    ] },
  ];
  if (v === 'soldier') return [
    { card: { scene: 'street', kicker: 'A friend of ours', text: `${longDate(s.date)}. You have been made for six months. You still walk into the Shamrock the way you did as an associate and you still catch yourself. ${nm(ch, 'Your capo')} runs the regime; above him there is ${nm(ub, 'the underboss')}; above him, ${nm(don, 'the Don')}.`, actors: [p.id, ...(ch ? [ch.id] : [])] }, options: next() },
    { card: { scene: 'sitdown', kicker: 'Monday morning', text: `${ch?.firstName ?? 'Your capo'} counts your envelope at the bar without looking at it, the way a man counts change. ${quota ? `$${quota.toLocaleString('en-US')} a week, that is the number.` : ''} "Everything all right with your guys?"`, actors: [p.id, ...(ch ? [ch.id] : [])] }, options: [
      { id: 's1_loyal', label: '"Everything\'s fine." Hand it over.', detail: `${ch?.firstName ?? 'He'} +5.` },
      { id: 's1_wait', label: 'Tell him one of your kids is slow, and that you\'re handling it.', detail: 'Standing +2: he likes a man who brings him the truth.' },
      { id: 's1_hard', label: 'Put an extra $200 in it.', detail: `−$200; ${ch?.firstName ?? 'he'} +8, standing +2.`, disabled: s.money < 200 ? 'Needs $200' : undefined },
    ] },
    dusk,
    { card: { scene: 'sitdown', kicker: 'Your guys', text: `${mine.length ? mine.map((c) => c.firstName).join(', ').replace(/, ([^,]*)$/, ' and $1') : 'The kids who run for you'} wait for you at the counter of the Admiral diner. They look at you the way you used to look at ${ch?.firstName ?? 'your capo'}.`, actors: [p.id, ...mine.map((c) => c.id)] }, options: [
      { id: 's2_hard', label: 'Tell them the rules. Once.', detail: 'Their fear of you +8. Respect +2.' },
      { id: 's2_loyal', label: 'Buy them dinner and ask about their mothers.', detail: 'Their opinion of you +6; −$60.' },
      { id: 's2_wait', label: '"Earn, and I\'ll put your names up when the books open."', detail: 'Their opinion of you +4; they will hold you to it.' },
    ] },
  ];
  return [
    { card: { scene: 'sitdown', kicker: `The Bolero Supper Club. ${longDate(s.date)}.`, text: `${nm(don, 'The Don')} has the round table in the back. ${ub ? `${ub.firstName} on his right. ` : ''}The capos around the rest of it: ${others.map((c) => c.firstName).join(', ').replace(/, ([^,]*)$/, ' and $1') || 'the old men'}. Your chair is the one nearest the kitchen door. Last one in.`, actors: [p.id, ...(don ? [don.id] : []), ...others.slice(0, 2).map((c) => c.id)] }, options: next() },
    { card: { scene: 'sitdown', kicker: 'The other capos', text: 'Everybody watches how the new capo comes into the room. They will tell the story of it for years, one way or the other.', actors: [p.id, ...others.map((c) => c.id)] }, options: [
      { id: 'c1_loyal', label: `Kiss ${don?.firstName ?? 'the Don'}'s cheek, nod to the others.`, detail: `${don?.firstName ?? 'The Don'} +5; standing +2.` },
      { id: 'c1_wait', label: 'Go around the table and shake every hand.', detail: 'Every capo +4.' },
      { id: 'c1_hard', label: 'Sit down and let them come to you.', detail: 'Respect +3; every capo −3.' },
    ] },
    { card: { scene: 'street', kicker: 'Your street', text: `Your soldiers are waiting at the corner when you come out: ${mine.length ? mine.map((c) => c.firstName).join(', ').replace(/, ([^,]*)$/, ' and $1') : 'your men'}. The street is yours to run. What goes up the ladder is not yours to decide.`, actors: [p.id, ...mine.map((c) => c.id)] }, options: next() },
    { card: { scene: 'sitdown', kicker: 'What the Don wants', text: `${don?.firstName ?? 'The Don'} doesn't raise his voice. "${quota ? `$${quota.toLocaleString('en-US')}` : 'Your envelope'} every Monday, through ${ub?.firstName ?? 'the underboss'}. Big moves, you come to me first. And you stay out of the Crest."`, actors: [p.id, ...(don ? [don.id] : [])] }, options: [
      { id: 'c2_loyal', label: `"Yes, Don ${don?.firstName ?? 'Cosimo'}."`, detail: 'Standing +3.' },
      { id: 'c2_hard', label: '"You\'ll have more than that."', detail: 'Standing +5, and he raises your number to match (+10%).' },
      { id: 'c2_wait', label: '"And if the Crest comes to me?"', detail: `Respect +2; ${don?.firstName ?? 'he'} −3. He will remember you asked.` },
    ] },
  ];
}

function rankFx(s: GameState, move: string): Effect[] {
  const p = player(s);
  const a = above(s);
  const ch = chiefOf(s);
  const don = donOf(s);
  const op = (c: Character | undefined, amount: number, reason: string): Effect[] => (c ? [{ type: 'opinion', from: c.id, to: p.id, amount, reason, decay: 1 }] : []);
  const st = (by: number, why: string): Effect => ({ type: 'power', op: { op: 'low', o: { op: 'standing', by, why } } });
  const mine = crew(s).slice(0, 3);
  const others = (a?.capoIds ?? []).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
  switch (move) {
    case 'a1_loyal': return op(ch, 8, 'Sat where I told him');
    case 'a1_hard': return [{ type: 'respect', amount: 2 }, ...op(ch, -6, 'The kid thinks he\'s somebody')];
    case 'a1_wait': return [...op(ch, 4, 'Waited to be asked'), st(1, 'Knew his place on the first day')];
    case 'a2_hard': return [st(3, 'Said out loud he wants to be made'), ...(a?.rivalId ? op(s.characters[a.rivalId], -5, 'Wants my slot') : [])];
    case 'a2_loyal': return op(ch, 6, 'Earns for me first');
    case 'a2_wait': return [st(2, 'Whatever they need'), ...op(ch, 3, 'Said whatever I need')];
    case 's1_loyal': return op(ch, 5, 'No trouble on Monday');
    case 's1_wait': return [st(2, 'Brought his capo the truth')];
    case 's1_hard': return [{ type: 'money', amount: -200 }, ...op(ch, 8, 'Put extra in the envelope'), st(2, 'An envelope that came up heavy')];
    case 's2_hard': return [{ type: 'respect', amount: 2 }, ...mine.map((c) => ({ type: 'meter', from: c.id, to: p.id, meter: 'fear', amount: 8 }) as Effect)];
    case 's2_loyal': return [{ type: 'money', amount: -60 }, ...mine.flatMap((c) => op(c, 6, 'Bought us dinner'))];
    case 's2_wait': return mine.flatMap((c) => op(c, 4, 'Promised to put our names up'));
    case 'c1_loyal': return [...op(don, 5, 'Came to me first'), st(2, 'Paid his respects to the Don')];
    case 'c1_wait': return others.flatMap((c) => op(c, 4, 'Shook my hand at the table'));
    case 'c1_hard': return [{ type: 'respect', amount: 3 }, ...others.flatMap((c) => op(c, -3, 'Sat there like he owned the place'))];
    case 'c2_loyal': return [st(3, 'Yes, Don Cosimo')];
    case 'c2_hard': return [st(5, 'Promised the Don more'), { type: 'flag', key: 'low_quota_up', value: 1 }];
    case 'c2_wait': return [{ type: 'respect', amount: 2 }, ...op(don, -3, 'Asked about the Crest')];
  }
  return [];
}

function firstWords(rise: boolean): MgOption[] {
  return rise
    ? [
      { id: 'w_fear', label: '"Everything. Starting with the corner."', detail: 'Fear: +5 respect, crew opinion −3.' },
      { id: 'w_respect', label: '"A seat at the Table. We get there together."', detail: 'Respect: crew opinion +5, family heat −3.' },
      { id: 'w_generous', label: '"Everybody eats this summer. Everybody."', detail: 'Generosity: crew opinion +8, −$1,500 in envelopes.' },
    ]
    : [
      { id: 'w_fear', label: '"Nothing moves on this island without my say. Nothing."', detail: 'Fear: +5 respect, crew opinion −3, rivals cautious.' },
      { id: 'w_respect', label: '"My father built this. We keep it. We keep each other."', detail: 'Respect: crew opinion +5, family heat −3.' },
      { id: 'w_generous', label: '"Everybody eats this summer. Everybody."', detail: 'Generosity: crew opinion +8, −$1,500 in envelopes.' },
    ];
}

function madeBossStep(s: GameState, ses: SS, move: string): void {
  const d = ses.d;
  const p = player(s);
  const fx = (d as SceneData & { chairFx: Record<string, Effect[]> }).chairFx;
  const rankV = isRankVariant(String(d.variant ?? ''));
  const label = rankV ? RANK_OPENING[d.variant as 'associate'].label : 'Made the boss';
  const add = (xs: Effect[]) => d.fx.push(...xs.map((e) => ({ ...e, label })));
  if (move !== 'next') d.picks.push(move);
  if (rankV) {
    add(rankFx(s, move));
    if (d.i + 1 >= d.beats.length) {
      const o = RANK_OPENING[d.variant as 'associate'];
      const tone = d.picks.some((x) => x.endsWith('_hard')) ? 'nerve' : d.picks.some((x) => x.endsWith('_loyal')) ? 'loyalty' : 'patience';
      const ch = chiefOf(s);
      beat(ses, `${displayName(p)}. Head of the House of ${s.houseName}. ${o.place(s, ch)}. ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][s.date.m - 1]} ${s.date.d}, ${s.date.y}.`, 'quote');
      ses.done = true;
      ses.phase = 'end';
      ses.outcome = { title: o.label, text: `${displayName(p)} is ${o.place(s, ch).replace(/^An? /, (x) => x.toLowerCase())}. How they will remember the first day: ${tone}.`, tone: 'good', effects: d.fx };
      return;
    }
    advance(ses);
    return;
  }
  switch (move) {
    case 'sit':
    case 'stay':
    case 'round':
      add(fx[move]);
      break;
    case 'philly_same':
      add([{ type: 'rivalOpinion', rival: 'philly', amount: 10, reason: 'Nothing has changed' }]);
      break;
    case 'philly_summer':
      add([{ type: 'rivalOpinion', rival: 'philly', amount: -5, reason: 'Asked for the summer' }, { type: 'flag', key: 'phillyPoints', value: s.week + 14 }]);
      break;
    case 'philly_envelope':
      add([{ type: 'money', amount: -2000 }, { type: 'rivalOpinion', rival: 'philly', amount: 20, reason: 'An envelope on day one' }, { type: 'heat', bar: 'family', amount: -3 }]);
      break;
    case 'od_toast':
      add([{ type: 'crewOpinion', amount: 3, reason: 'Ten more years' }, { type: 'respect', amount: 2 }]);
      break;
    case 'od_watch':
      add([{ type: 'flag', key: 'od_watch', value: 1 }]);
      break;
    case 'od_future':
      add([{ type: 'flag', key: 'od_spoke_future', value: 1 }, { type: 'respect', amount: -1 }]);
      break;
    case 'w_fear':
      add([{ type: 'respect', amount: 5 }, { type: 'crewOpinion', amount: -3, reason: 'Nothing moves without his say' }, ...s.rivals.filter((r) => r.kind === 'mob').map((r) => ({ type: 'rivalOpinion', rival: r.id, amount: -3, reason: 'A hard man in the chair' }) as Effect)]);
      break;
    case 'w_respect':
      add([{ type: 'crewOpinion', amount: 5, reason: 'We keep each other' }, { type: 'heat', bar: 'family', amount: -3 }]);
      break;
    case 'w_generous':
      add([{ type: 'crewOpinion', amount: 8, reason: 'Everybody eats this summer' }, { type: 'money', amount: -1500 }]);
      break;
  }
  if (move.startsWith('w_') || d.i + 1 >= d.beats.length) {
    const tone = move === 'w_fear' ? 'fear' : move === 'w_generous' ? 'generosity' : 'respect';
    beat(ses, `${displayName(p)}. Head of the House of ${s.houseName}. Wildwood, New Jersey. ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][s.date.m - 1]} ${s.date.d}, ${s.date.y}.`, 'quote');
    ses.done = true;
    ses.phase = 'end';
    ses.outcome = { title: 'Made the boss', text: `${displayName(p)} sits in the chair. The tone of the reign: ${tone}.`, tone: 'good', effects: d.fx };
    return;
  }
  advance(ses);
}

function advance(ses: SS): void {
  const d = ses.d;
  d.i += 1;
  d.card = d.beats[d.i].card;
  ses.phase = `beat${d.i + 1}`;
}

function sceneOptions(_s: GameState, ses: SS): MgOption[] {
  return ses.d.beats[ses.d.i]?.options ?? next();
}

function sceneAuto(_s: GameState, ses: SS): string {
  const o = sceneOptions(_s, ses).filter((x) => !x.disabled);
  // The default play: the respectful middle road.
  const pref = ['next', 'round', 'philly_same', 'od_toast', 'w_respect', 'sp_sponsor', 'say_warm', 'crew_own'];
  return o.find((x) => pref.includes(x.id))?.id ?? o.find((x) => x.id.startsWith('crew_'))?.id ?? o[0]?.id ?? 'next';
}

export const MADE_BOSS: MinigameDef<SceneData> = {
  id: 'madeboss',
  init: (s, ses) => {
    const d: SceneData = { kind: 'madeboss', beats: [], i: 0, card: { scene: 'church', kicker: '', text: '', actors: [] }, fx: [], picks: [], title: madeBossWords(s, String(ses.params.variant ?? '')).title, variant: String(ses.params.variant ?? '') };
    ses.d = d;
    d.beats = madeBossBeats(s, ses);
    d.card = d.beats[0].card;
    const p = player(s);
    const v = String(ses.params.variant ?? '');
    const prem = openingPremise(s, v);
    const intro = madeBossWords(s, v);
    return { d, phase: 'beat1', intro: { title: intro.title, kicker: isRankVariant(prem) ? `The ${above(s)?.name ?? 'Valente'} family` : `The House of ${s.houseName}`, text: v === 'succession' ? `The old man is gone, and the island looks at ${p.firstName}.` : prem === 'olddon' ? 'Ten years in the chair. Tonight they drink to you; tomorrow they start counting.' : prem === 'sees' ? 'The first five minutes of your last summer in the chair. Your answers set the tone for whoever comes after you.' : prem === 'rise' ? 'The first five minutes: a corner, a few guys, and men deciding what to make of you.' : isRankVariant(prem) ? `${RANK_OPENING[prem].place(s, chiefOf(s))}. ${RANK_OPENING[prem].pitch}` : `The first five minutes: ${prem === 'funeral' ? 'the old man is gone' : 'the old man has stepped aside'}, and the island looks at you. Your answers set the tone of your reign.`, scene: d.card.scene } };
  },
  options: sceneOptions,
  step: (s, ses, m) => {
    if (m === 'next') beat(ses, ses.d.card.text.split('\n\n')[0], 'info');
    madeBossStep(s, ses, m);
  },
  auto: sceneAuto,
};

/* ---------------------------------------------------------------- */
/* The Made-Man Ceremony                                             */
/* ---------------------------------------------------------------- */

function ceremonyBeats(s: GameState, ses: SS): Beat[] {
  const d = ses.d;
  const c = s.characters[d.candidateId!];
  const p = player(s);
  const sponsor = d.sponsorId ? s.characters[d.sponsorId] : undefined;
  const sizes = regimeSizes(s);
  const ring = capos(s).filter((k) => k.alive && isFree(s, k));
  const other = ring.filter((k) => k.id !== sponsor?.id).sort((a, b) => (sizes.get(a.id) ?? 0) - (sizes.get(b.id) ?? 0))[0];
  d.capoId = other?.id;
  const ub = crew(s).find((x) => x.rank === 'underboss' && x.alive);
  const sponsorOpts: MgOption[] = [
    ...(sponsor ? [{ id: 'sp_sponsor', label: `${displayName(sponsor)}, who brought him in.`, detail: `Natural. ${sponsor.firstName} +10.` }] : []),
    { id: 'sp_you', label: 'You, personally.', detail: `He is yours now: his loyalty to you +20, to his capo −10. Other associates take note.` },
    ...(other ? [{ id: 'sp_capo', label: `${displayName(other)}, the capo you want him under.`, detail: `${other.firstName} +10${sponsor ? `; ${sponsor.firstName} feels passed over` : ''}.` }] : []),
  ];
  const crewOpts: MgOption[] = ring.slice(0, 4).map((k) => {
    const n = sizes.get(k.id) ?? 0;
    const minN = Math.min(...ring.map((x) => sizes.get(x.id) ?? 0));
    const maxN = Math.max(...ring.map((x) => sizes.get(x.id) ?? 0));
    return { id: `crew_${k.id}`, label: `${displayName(k)}'s crew (${n} men)`, detail: n === minN ? `A short crew: ${k.firstName} +5.` : n === maxN ? `The strongest crew: ${k.firstName}'s faction grows (+3).` : `${k.firstName} +3.` };
  });
  const sponsorOrYou = sponsor ? displayName(sponsor) : 'Your underboss';
  // What he did to be here (bones.ts): the ring knows, or knows he did nothing.
  const bones = c.bones?.[0];
  const record = bones ? ` Everyone in the ring knows why he is here: ${bones.year}, the ${bones.job} (${bones.role}).` : ` Nobody in the ring can say what he ever did for this thing of ours. Philadelphia did you a favor, and the old-timers look at the floor.`;
  return [
    { card: { scene: 'street', kicker: 'The drive', text: `${c.firstName} was told to wear a suit and wait on the corner of Pacific and Schellenger at nine. ${sponsorOrYou} picks him up. Nobody talks. Somewhere past the Rio Grande bridge, ${c.firstName} wonders, the way they all wonder, whether this is the ride you come back from.`, actors: [c.id, ...(sponsor ? [sponsor.id] : [])] }, options: next() },
    { card: { scene: 'ceremony', kicker: 'The room', text: `The back of a closed restaurant in the Crest; blinds down, one lamp. The capos stand in a ring. On the table: a revolver, a knife, a saint card, and a candle.${record}\n\nWho stands up for him?`, actors: [c.id, p.id, ...ring.slice(0, 3).map((k) => k.id)] }, options: sponsorOpts },
    { card: { scene: 'ceremony', kicker: 'The oath', text: `You speak. He repeats.\n\n"You came in here alive. You'll leave here a different man. This thing of ours comes before your blood, before your wife, before your children, before God himself on a Sunday. When you're called, you come. What you see, you never saw. You never touch another man's wife, and you never raise your hand to a friend of ours without the word."\n\nThe knife touches his trigger finger; one drop falls on the saint. You set the card alight in his cupped hands. It curls and blackens.\n\n"As this saint burns, so burns my soul if I betray this family."`, actors: [c.id, p.id] }, options: [
      { id: 'say_fear', label: '"Now you can\'t leave. Remember that."', detail: 'Fear: loyalty +10; his ambition cools.' },
      { id: 'say_warm', label: '"Now you eat with us. Bring your mother to Sunday dinner."', detail: 'Warmth: his opinion of you +15.' },
      { id: 'say_earn', label: '"Now you earn. Every week. Don\'t make me ask."', detail: 'Business: his earnings +10%, opinion −5.' },
    ] },
    { card: { scene: 'ceremony', kicker: 'The kiss', text: `Each capo kisses him on both cheeks. ${ub ? displayName(ub) : 'The underboss'} says it first: "He's a friend of ours."\n\nWhich crew does he join?`, actors: [c.id, ...(ub ? [ub.id] : []), ...ring.slice(0, 3).map((k) => k.id)] }, options: crewOpts.length ? crewOpts : next() },
    { card: { scene: 'street', kicker: 'Outside', text: `${c.firstName} lights a cigarette with hands that won't quite stop shaking. Across the street, a car he doesn't recognize has its lights off.`, actors: [c.id] }, options: next('The end of the night') },
  ];
}

function ceremonyStep(s: GameState, ses: SS, move: string): void {
  const d = ses.d;
  const c = s.characters[d.candidateId!];
  const p = player(s);
  const label = `The making of ${c.firstName} ${c.lastName}`;
  const add = (xs: Effect[]) => d.fx.push(...xs.map((e) => ({ ...e, label })));
  const sponsor = d.sponsorId ? s.characters[d.sponsorId] : undefined;
  const capo = d.capoId ? s.characters[d.capoId] : undefined;
  if (move !== 'next') d.picks.push(move);
  if (move === 'next' || d.i === 0) beat(ses, d.card.text.split('\n\n')[0], 'info');
  switch (move) {
    case 'sp_sponsor':
      if (sponsor) add([{ type: 'opinion', from: sponsor.id, to: p.id, amount: 10, reason: `Let me stand for ${c.firstName}`, decay: 1 }]);
      beat(ses, `${sponsor?.firstName ?? 'His sponsor'} puts a hand on his shoulder. "I stand for him."`, 'quote');
      break;
    case 'sp_you': {
      const k = c.capoId ? s.characters[c.capoId] : undefined;
      add([{ type: 'opinion', from: c.id, to: p.id, amount: 20, reason: 'The boss stood for me himself', decay: 0 }, ...(k ? [{ type: 'opinion', from: c.id, to: k.id, amount: -10, reason: 'The boss stood for me, not him', decay: 1 } as Effect] : [])]);
      for (const a of crew(s).filter((x) => x.rank === 'associate' && x.id !== c.id).slice(0, 4)) add([{ type: 'opinion', from: a.id, to: p.id, amount: -2, reason: 'The boss has favorites', decay: 1 }]);
      beat(ses, '"I stand for him." The room goes very quiet.', 'quote');
      break;
    }
    case 'sp_capo':
      if (capo) add([{ type: 'opinion', from: capo.id, to: p.id, amount: 10, reason: `Asked me to stand for ${c.firstName}`, decay: 1 }]);
      if (sponsor && sponsor.id !== capo?.id) add([{ type: 'opinion', from: sponsor.id, to: p.id, amount: -8, reason: `Passed over as ${c.firstName}'s sponsor`, decay: 1 }]);
      beat(ses, `${capo?.firstName ?? 'The capo'} stands for him. ${sponsor ? `${sponsor.firstName} studies the wallpaper.` : ''}`, 'quote');
      break;
    case 'say_fear':
      d.speech = 'fear';
      add([{ type: 'opinion', from: c.id, to: p.id, amount: 10, reason: 'Now I can\'t leave', decay: 0 }, { type: 'meter', from: c.id, to: p.id, meter: 'fear', amount: 10 }, ...(c.goal === 'take_chair' || c.goal === 'become_capo' ? [{ type: 'goalSet', charId: c.id, goal: 'get_rich' } as Effect] : [])]);
      break;
    case 'say_warm':
      d.speech = 'warm';
      add([{ type: 'opinion', from: c.id, to: p.id, amount: 15, reason: 'Bring your mother to Sunday dinner', decay: 1 }]);
      break;
    case 'say_earn':
      d.speech = 'earn';
      add([{ type: 'opinion', from: c.id, to: p.id, amount: -5, reason: 'Every week. Don\'t make me ask.', decay: 1 }, { type: 'story', charId: c.id, text: 'Told at his making: now you earn. He earns harder (+10%).' }]);
      break;
  }
  if (move.startsWith('crew_')) {
    const kid = move.slice(5);
    const k = s.characters[kid];
    const sizes = regimeSizes(s);
    const ring = capos(s).filter((x) => x.alive && isFree(s, x));
    const minN = Math.min(...ring.map((x) => sizes.get(x.id) ?? 0));
    d.crewCapoId = kid;
    add([{ type: 'assign', charId: c.id, capoId: kid }, { type: 'opinion', from: kid, to: p.id, amount: (sizes.get(kid) ?? 0) === minN ? 5 : 3, reason: `Gave me ${c.firstName}`, decay: 1 }]);
    beat(ses, `${c.firstName} goes to ${k ? k.firstName : 'his capo'}'s crew.`, 'info');
  }
  if (d.i + 1 >= d.beats.length) {
    d.fbi = hit(ses, 1 / 8);
    if (d.fbi) add([{ type: 'evidence', charId: c.id, amount: 5 }, { type: 'story', charId: c.id, text: 'The night he was made, a car with its lights off sat across the street. The FBI wrote down his plate.' }]);
    // The passed-over echo.
    const passed = crew(s).filter((x) => x.rank === 'associate' && x.id !== c.id && x.goal === 'get_made' && !x.proposedWeek && !hasBones(x)).slice(0, 2);
    d.passedOver = passed.map((x) => x.id);
    for (const a of passed) {
      add([{ type: 'opinion', from: a.id, to: p.id, amount: -6, reason: `Passed over when ${c.firstName} was made`, decay: 1 }, { type: 'meter', from: a.id, to: p.id, meter: 'grievance', amount: 8 }]);
      beat(ses, `${displayName(a)} heard about the ceremony from a bartender.`, 'bad');
    }
    if (d.fbi) beat(ses, 'Across the street, the car with its lights off writes down a license plate.', 'bad');
    ses.done = true;
    ses.phase = 'end';
    const make = ses.parts.make ?? [];
    ses.outcome = { title: `A friend of ours: ${c.firstName} ${c.lastName}`, text: `${displayName(c)} took the oath${d.crewCapoId ? ` and joined ${s.characters[d.crewCapoId]?.firstName ?? 'his capo'}'s crew` : ''}.`, tone: 'good', effects: [...make, ...d.fx] };
    return;
  }
  advance(ses);
}

export const CEREMONY: MinigameDef<SceneData> = {
  id: 'ceremony',
  init: (s, ses) => {
    const c = s.characters[String(ses.params.candidate)];
    const sponsor = c?.vouchedBy ? s.characters[c.vouchedBy] : undefined;
    const d: SceneData = { kind: 'ceremony', beats: [], i: 0, card: { scene: 'street', kicker: '', text: '', actors: [] }, fx: [], picks: [], title: 'The ceremony', candidateId: c?.id, sponsorId: sponsor?.alive ? sponsor.id : (c?.capoId ?? undefined) };
    ses.d = d;
    d.beats = ceremonyBeats(s, ses);
    d.card = d.beats[0].card;
    return { d, phase: 'beat1', intro: { title: `The making of ${c ? c.firstName : 'a friend'}`, kicker: 'The Made-Man Ceremony', text: 'The night an associate becomes a friend of ours. Your choices shape how loyal he is, who resents it, and which crew he joins.', scene: 'ceremony' } };
  },
  options: sceneOptions,
  step: ceremonyStep,
  auto: sceneAuto,
  apply: (ctx, ses) => {
    const c = ctx.s.characters[ses.d.candidateId ?? ''];
    if (c && ses.d.speech === 'earn') c.attributes.business = Math.min(100, c.attributes.business + 6);
  },
};

registerMinigame(MADE_BOSS);
registerMinigame(CEREMONY);

/* ---------------------------------------------------------------- */
/* Hooks                                                             */
/* ---------------------------------------------------------------- */

/** The "Made the boss" popup (opened automatically by the UI). */
/** The opening card's words for each premise (title, text, and the scene button). */
export function madeBossWords(s: GameState, variant: string, old?: Character): { title: string; text: string; play: string; playDetail: string } {
  const p = player(s);
  if (variant === 'succession') return { title: 'Made the boss', text: `${old ? displayName(old) : 'The old boss'} is gone. ${p.firstName} takes the chair.`, play: 'Take the chair', playDetail: 'A short scene: three choices set the tone of your reign.' };
  const prem = openingPremise(s, variant);
  if (isRankVariant(prem)) {
    const ch = chiefOf(s);
    const o = RANK_OPENING[prem];
    return { title: o.label, text: `${o.place(s, ch)}. ${o.pitch}`, play: 'Walk in', playDetail: 'A short scene: four beats, and the men above you decide what to make of you.' };
  }
  if (prem === 'olddon') return { title: 'The Old Don', text: `${p.firstName} has ruled Wildwood for ten years. Tonight the island drinks to him, and everyone is posting up.`, play: 'Hold the room', playDetail: 'A short scene: how the old man takes his own party sets the tone of his last year.' };
  if (prem === 'sees') return { title: 'The Shark\'s last summer', text: `${p.firstName} has run Wildwood for thirty years. Tonight he tells the room he will name an heir before the summer is out.`, play: 'Hold the room', playDetail: 'A short scene: three choices set the tone of your last summer in the chair.' };
  if (prem === 'rise') return { title: 'First day with the crew', text: 'A corner, a few guys, and nobody in Philadelphia who knows your name.', play: 'Walk in', playDetail: 'A short scene: three choices set the tone with your crew.' };
  return { title: 'Made the boss', text: prem === 'funeral' ? 'The old man is gone, and the island looks at you.' : 'The old man has stepped aside, and the island looks at you.', play: 'Take the chair', playDetail: 'A short scene: three choices set the tone of your reign.' };
}

export function buildMadeBoss(s: GameState, variant: string, old?: Character, cause?: string): EventInstance {
  const iid = `ev${s.nextId++}`;
  const params: Record<string, string | number> = { variant, ...(old ? { old: old.id } : {}), ...(cause ? { cause } : {}) };
  const p = player(s);
  const w = madeBossWords(s, variant, old);
  return {
    iid, defId: 'made_boss', week: s.week, mandatory: true, priority: 99, meta: { scene: 1, variant, premise: variant === 'succession' ? 'funeral' : openingPremise(s, variant) }, actors: [p.id],
    title: w.title,
    text: w.text,
    defaultChoiceId: 'quiet',
    choices: [
      { id: 'play', label: w.play, detail: w.playDetail, because: 'took the chair', effects: [mgEffect('madeboss', iid, { ...params, play: 1 })] },
      { id: 'quiet', label: 'Let it play out', because: 'took the chair quietly', effects: [mgEffect('madeboss', iid, { ...params, play: 0 })] },
    ],
  };
}

/** The opening of every new game: the scene takes the first seat in week one's popups. */
export function addOpeningScene(s: GameState, start: string): void {
  if (s.pendingEvents.some((e) => e.defId === 'made_boss')) return;
  if (s.pendingEvents.length >= 4) {
    const drop = [...s.pendingEvents].reverse().find((e) => !e.mandatory) ?? s.pendingEvents[s.pendingEvents.length - 1];
    s.pendingEvents = s.pendingEvents.filter((e) => e !== drop);
    if (drop.mandatory) s.eventQueue.push(drop);
  }
  const ev = buildMadeBoss(s, openingVariant(start));
  // The opening scene is told a different way each game (sceneFamilies2.ts).
  dressScene(s, ev);
  s.pendingEvents.unshift(ev);
  mgOf(s).known[`boss:${s.playerId}`] = s.week;
}

/** Weekly: a new boss in the chair gets his scene. */
export function scenesWeek(s: GameState): void {
  const mg = mgOf(s);
  const key = `boss:${s.playerId}`;
  if (mg.known[key] !== undefined) return;
  const first = !Object.keys(mg.known).some((k) => k.startsWith('boss:'));
  mg.known[key] = s.week;
  if (first) return; // an old save, or a game started without the opening scene
  const p = player(s);
  const prevIds = Object.keys(mg.known).filter((k) => k.startsWith('boss:') && k !== key).sort((a, b) => mg.known[b] - mg.known[a]);
  const old = prevIds.length ? s.characters[prevIds[0].slice(5)] : undefined;
  const cause = !old ? undefined : old.alive ? (old.faction === 'law' ? 'turned government witness' : 'stepped aside') : old.death?.cause;
  if (p) s.eventQueue.push(buildMadeBoss(s, 'succession', old, cause));
}

/** The making popup gets the ceremony as its first (and default) choice. */
registerAttacher((s, ev) => {
  if (ev.defId !== 'making') return undefined;
  const make = ev.choices.find((c) => c.id === 'make');
  const cid = String(ev.meta?.charId ?? '');
  const c = s.characters[cid];
  if (!make || !c) return undefined;
  ev.defaultChoiceId = 'ceremony_auto';
  ev.choices = [{ id: 'ceremony_auto', label: 'Let the ceremony play out', detail: make.detail, because: make.because, effects: [mgEffect('ceremony', ev.iid, { candidate: c.id, play: 0 }, { make: make.effects })] }, ...ev.choices.filter((x) => x.id !== 'make')];
  return { id: 'ceremony', label: 'Hold the ceremony', detail: `${make.detail ?? ''} A short scene: who stands up for him, what you tell him, which crew he joins.`, because: make.because, effects: [mgEffect('ceremony', ev.iid, { candidate: c.id, play: 1 }, { make: make.effects })] };
});

export function sceneAge(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}
