import { ageOn } from '../calendar';
import { displayName, hasTrait, isFree, relatives } from '../characters';
import { vecScore } from '../deeds/weights';
import type { Axis } from '../deeds/types';
import { fmtMoney } from '../effects';
import { opinion } from '../relations';
import type { Character, Choice, Effect, EventInstance, GameState, Rival, RivalId } from '../types';
import { leaderOf, predictLine, reactionsTo } from './compute';
import { ensureReactions, r01 } from './state';
import { PROPOSAL_GAP, PROPOSAL_KIND_GAP, type Decision, type ProposalKind } from './types';

/**
 * NPC PROPOSALS WITH STAKES. The people around the boss do not only ask; they
 * propose: a capo a new racket or a man for his button, a rival boss a
 * marriage, a truce, a venture or a swap of corners, Philadelphia an extra
 * point, the underboss a purge, the wife a family matter. Who proposes, and
 * what, leans on his nature (the one weight table). Every option carries its
 * reactions (a `react` op, first in its effects, so what lands is what the
 * card said): declining a proud man stings more, a man turned down may take
 * it to a rival, and third parties care (the capo who wanted the same thing,
 * the family that would have lost out). Accepting has its costs too.
 *
 * One candidate at most every few weeks, through the one popup pipeline (the
 * story director's caps and cooldowns apply: template `rx_<kind>`).
 */

const react = (d: Decision): Effect => ({ type: 'deed', op: { op: 'react', d } });
const round100 = (n: number) => Math.max(100, Math.round(n / 100) * 100);

interface Built { kind: ProposalKind; by: Character; title: string; text: string; theme: string; options: { id: string; label: string; detail: string; because: string; d: Decision; fx: Effect[] }[]; actors?: string[]; family?: boolean }

const crewOf = (s: GameState) => Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && isFree(s, c)).sort((a, b) => a.id.localeCompare(b.id));
const capoList = (s: GameState) => crewOf(s).filter((c) => c.rank === 'capo');
const mobRivals = (s: GameState) => s.rivals.filter((r) => r.kind === 'mob' && leaderOf(s, r.id)).sort((a, b) => a.id.localeCompare(b.id));
const greedy = (s: GameState) => capoList(s).filter((k) => hasTrait(k, 'Greedy'));
function districtOf(s: GameState, c: Character) {
  return s.districts.find((d) => d.capoId === c.id);
}
function pickOf<T>(s: GameState, xs: readonly T[]): T | undefined {
  if (!xs.length) return undefined;
  return xs[Math.floor(r01(ensureReactions(s)) * xs.length)];
}
/** The capo who'd want the same thing (ambitious or greedy), other than `not`. */
function rivalCapo(s: GameState, not: string): Character | undefined {
  return capoList(s).filter((k) => k.id !== not && (hasTrait(k, 'Ambitious') || hasTrait(k, 'Greedy'))).sort((a, b) => vecScore(b, { power: 1, money: 1 }) - vecScore(a, { power: 1, money: 1 }) || a.id.localeCompare(b.id))[0];
}

const VENTURES = [
  ['a floating crap game on the beach block', 'crap game'],
  ['a jukebox and cigarette-machine route along Pacific Avenue', 'jukebox route'],
  ['a numbers bank out of a candy store on Rio Grande', 'numbers bank'],
  ['a summer sports book for the shore crowd', 'sports book'],
] as const;

function capoRacket(s: GameState): Built | undefined {
  const k = pickOf(s, capoList(s));
  if (!k) return undefined;
  const [what, short] = VENTURES[Math.floor(r01(ensureReactions(s)) * VENTURES.length)];
  const n = round100(1500 + r01(ensureReactions(s)) * 1500);
  const share = Math.round(n / 6 / 10) * 10;
  const d = districtOf(s, k);
  const fam = d ? mobRivals(s).filter((r) => (d.influence[r.id] ?? 0) >= 10).sort((a, b) => (d.influence[b.id] ?? 0) - (d.influence[a.id] ?? 0))[0] : undefined;
  const other = rivalCapo(s, k.id);
  const kn = k.firstName;
  return {
    kind: 'capoRacket', by: k, theme: 'crew',
    title: `${kn} has an idea`,
    text: `${displayName(k)} wants to open ${what}${d ? ` in ${d.name}` : ''}. "${fmtMoney(n)} to set it up, boss, and it pays every month. I'll run it myself."${other ? ` ${other.firstName} has been saying he wants a new piece too.` : ''}${fam ? ` ${fam.shortName ?? fam.name} work those corners and won't like it.` : ''}`,
    options: [
      { id: 'yes', label: `Back him (${fmtMoney(n)})`, detail: `About ${fmtMoney(share)} a month each, for a year, if it holds.`, because: `backed ${kn}'s ${short}`,
        d: { k: 'accept', label: `You backed ${kn}'s ${short}`, t: k.id, v: 10, y: 'The boss backed my idea', ...(other ? { over: other.id, overV: -6, overY: `Gave ${kn} the ${short}, not me` } : {}), ...(fam ? { fam: [{ id: fam.id, v: -5, y: `Moving in on our trade` }] } : {}) },
        fx: [{ type: 'money', amount: -n }, { type: 'deed', op: { op: 'partner', a: k.id, b: s.playerId, n: share } }] },
      { id: 'later', label: 'Tell him to come back in the spring', detail: 'A soft no.', because: `put off ${kn}'s ${short}`,
        d: { k: 'decline', label: `You put off ${kn}'s ${short}`, t: k.id, v: -4, y: 'Told me to wait' }, fx: [] },
      { id: 'no', label: 'No', detail: 'A hard no, to his face.', because: `turned down ${kn}'s ${short}`,
        d: { k: 'decline', label: `You turned down ${kn}'s ${short}`, t: k.id, v: -10, y: 'Turned down my idea', pride: 1, ...(fam ? { go: fam.id, fam: [{ id: fam.id, v: 3, y: 'Kept off our trade' }] } : {}) }, fx: [] },
    ],
  };
}

function capoMan(s: GameState): Built | undefined {
  const pairs = capoList(s).map((k) => [k, crewOf(s).find((a) => a.capoId === k.id && a.rank === 'associate' && a.proposedWeek === undefined)] as const).filter(([, a]) => !!a);
  const p = pickOf(s, pairs);
  if (!p) return undefined;
  const [k, a] = p as [Character, Character];
  return {
    kind: 'capoMan', by: k, theme: 'crew', actors: [k.id, a.id],
    title: `${k.firstName} puts up a man`,
    text: `${displayName(k)} wants ${displayName(a)} put up for his button. "He's earned, he's kept his mouth shut. I'll vouch for him with my life." Philadelphia will want to know what he ever did.`,
    options: [
      { id: 'yes', label: `Put ${a.firstName}'s name in`, detail: `${k.firstName} vouches; if ${a.firstName} disappoints, it is on him (and you).`, because: `put ${a.firstName}'s name up`,
        d: { k: 'grant', label: `You put ${a.firstName} up for his button`, t: k.id, v: 8, y: 'Took my word for my man', more: [[a.id, 12, 'The boss put my name in']] }, fx: [{ type: 'propose', charId: a.id, voucherId: k.id }] },
      { id: 'no', label: 'Not yet', detail: 'He waits. They both remember.', because: `would not put ${a.firstName} up`,
        d: { k: 'decline', label: `You would not put ${a.firstName} up`, t: k.id, v: -8, y: 'Would not hear my man', pride: 1, more: [[a.id, -10, 'Not good enough for the boss']] }, fx: [] },
    ],
  };
}

function bride(s: GameState, L: Character): Character | undefined {
  const pool = [...relatives(s, L), ...L.childrenIds.map((id) => s.characters[id])].filter((c): c is Character => !!c?.alive && c.gender === 'F' && !c.spouseId && ageOn(c.birth, s.date) >= 17 && ageOn(c.birth, s.date) <= 30);
  return pool.sort((a, b) => a.id.localeCompare(b.id))[0];
}
function groom(s: GameState): Character | undefined {
  return Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== s.playerId && c.gender === 'M' && !c.spouseId && ageOn(c.birth, s.date) >= 18 && ageOn(c.birth, s.date) <= 35).sort((a, b) => a.id.localeCompare(b.id))[0];
}

function rivalMarriage(s: GameState): Built | undefined {
  const m = groom(s);
  if (!m) return undefined;
  const opts = mobRivals(s).filter((r) => !r.war).map((r) => [r, leaderOf(s, r.id)!, bride(s, leaderOf(s, r.id)!)] as const).filter(([, , b]) => !!b);
  const p = pickOf(s, opts);
  if (!p) return undefined;
  const [r, L, b] = p as [Rival, Character, Character];
  const others = mobRivals(s).filter((x) => x.id !== r.id).map((x) => ({ id: x.id, v: -4, y: `Married into the ${r.shortName ?? r.name}` }));
  return {
    kind: 'rivalMarriage', by: L, theme: 'rivals', actors: [L.id, b.id, m.id], family: true,
    title: `${L.firstName} proposes a match`,
    text: `${displayName(L)} sends word through a priest: his ${b.fatherId === L.id ? 'daughter' : 'girl'} ${b.firstName} and your ${m.firstName}. "Two houses, one table at Christmas." It would tie your family to ${r.name}, and everybody on the island would read it that way.`,
    options: [
      { id: 'yes', label: `Promise ${m.firstName} to ${b.firstName}`, detail: 'An alliance by blood. The other families will take note.', because: `promised ${m.firstName} to ${L.firstName}'s ${b.firstName}`,
        d: { k: 'marriage', label: `You promised ${m.firstName} to ${b.firstName}`, t: L.id, v: 15, y: 'A marriage between our houses', fam: others, wife: { v: 5, y: 'A good match for the boy' }, more: [[m.id, hasTrait(m, 'Womanizer') ? -6 : 4, hasTrait(m, 'Womanizer') ? 'Married off without a say' : 'A fine girl']] },
        fx: [{ type: 'deed', op: { op: 'tie', a: m.id, b: b.id, k: 'lovers', y: 'Promised by their families' } }, { type: 'deed', op: { op: 'tie', a: L.id, b: s.playerId, k: 'ally', y: 'A marriage between our houses' } }] },
      { id: 'no', label: 'Decline, with respect', detail: 'His blood, refused.', because: `declined ${L.firstName}'s match`,
        d: { k: 'decline', label: `You refused ${L.firstName}'s match`, t: L.id, v: -12, y: 'Refused my blood', pride: 1 }, fx: [] },
    ],
  };
}

function rivalTruce(s: GameState): Built | undefined {
  const r = pickOf(s, mobRivals(s).filter((x) => x.war || opinion(s, x.leaderId, s.playerId) < 10));
  if (!r) return undefined;
  const L = leaderOf(s, r.id)!;
  const war = s.wars.find((w) => w.rival === r.id);
  const nm = r.shortName ?? r.name;
  return {
    kind: 'rivalTruce', by: L, theme: 'rivals',
    title: war ? `${L.firstName} wants to end the war` : `${L.firstName} proposes a truce`,
    text: war ? `${displayName(L)} sends a man with his hat off: enough. Everybody goes back to what he had, nobody says who won.` : `${displayName(L)} proposes a year of peace between your people and ${r.name}: no poaching, no raids, the Table as witness.`,
    options: [
      { id: 'yes', label: war ? 'A white peace' : 'Shake on it', detail: war ? 'The war ends where it stands.' : 'An understanding. Your hot-heads will grumble.', because: `made peace with the ${nm}`,
        d: { k: 'peace', label: `You made peace with ${r.name}`, t: L.id, v: 12, y: 'We made peace' },
        fx: war ? [{ type: 'warEnd', warId: war.id, outcome: 'white' }] : [{ type: 'deed', op: { op: 'tie', a: L.id, b: s.playerId, k: 'ally', y: 'A truce' } }] },
      { id: 'no', label: 'Send his man back', detail: 'No peace.', because: `refused the ${nm}'s peace`,
        d: { k: 'decline', label: `You refused ${r.name}'s peace`, t: L.id, v: -10, y: 'Spat on my offer of peace', pride: 1, fam: [{ id: 'philly' as RivalId, v: -4, y: 'Turned down a peace' }] }, fx: [] },
    ],
  };
}

function rivalVenture(s: GameState): Built | undefined {
  const rs = mobRivals(s).filter((x) => !x.war && opinion(s, x.leaderId, s.playerId) > -20);
  const r = pickOf(s, rs);
  if (!r) return undefined;
  const L = leaderOf(s, r.id)!;
  const elsewhere = rs.find((x) => x.id !== r.id) ?? mobRivals(s).find((x) => x.id !== r.id);
  const nm = r.shortName ?? r.name;
  return {
    kind: 'rivalVenture', by: L, theme: 'business',
    title: `${L.firstName} offers a joint venture`,
    text: `${displayName(L)} wants to go in with you on a vending company for the boardwalk arcades: $2,000 each, the profits split down the middle for a year.${elsewhere ? ` If not you, he says, the ${elsewhere.shortName ?? elsewhere.name} will take it.` : ''}`,
    options: [
      { id: 'yes', label: 'Go in ($2,000)', detail: 'About $330 a month for a year, if it holds.', because: `went in with the ${nm}`,
        d: { k: 'accept', label: `You went into business with ${r.name}`, t: L.id, v: 10, y: 'Partners in business', more: greedy(s).map((k) => [k.id, -3, `Partners with the ${nm} while we go short`] as [string, number, string]) },
        fx: [{ type: 'money', amount: -2000 }, { type: 'deed', op: { op: 'partner', a: L.id, b: s.playerId, n: 330 } }] },
      { id: 'no', label: 'Pass', detail: elsewhere ? `He takes it to the ${elsewhere.shortName ?? elsewhere.name}.` : 'He shrugs.', because: `passed on the ${nm}'s venture`,
        d: { k: 'decline', label: `You passed on ${r.name}'s venture`, t: L.id, v: -6, y: 'Did not want my money', pride: 1, ...(elsewhere ? { go: elsewhere.id } : {}) }, fx: [] },
    ],
  };
}

function rivalSwap(s: GameState): Built | undefined {
  for (const r of mobRivals(s).filter((x) => !x.war)) {
    const A = s.districts.filter((d) => (d.influence.player ?? 0) >= 15 && (d.influence[r.id] ?? 0) >= 15).sort((a, b) => a.id.localeCompare(b.id))[0];
    const Bd = s.districts.filter((d) => d !== A && (d.influence[r.id] ?? 0) >= 20 && (d.influence.player ?? 0) >= 5).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!A || !Bd) continue;
    const L = leaderOf(s, r.id)!;
    const ka = A.capoId ? s.characters[A.capoId] : undefined;
    const kb = Bd.capoId ? s.characters[Bd.capoId] : undefined;
    const more: [string, number, string][] = [];
    if (ka?.alive && ka.faction === 'player') more.push([ka.id, -12, `Traded away my corners in ${A.name}`]);
    if (kb?.alive && kb.faction === 'player' && kb.id !== ka?.id) more.push([kb.id, 5, `More streets in ${Bd.name}`]);
    const nm = r.shortName ?? r.name;
    return {
      kind: 'rivalSwap', by: L, theme: 'rivals',
      title: `${L.firstName} proposes a swap`,
      text: `${displayName(L)} proposes you trade corners: his people pull back in ${Bd.name}, yours in ${A.name}. "Cleaner lines, fewer funerals."${ka ? ` ${ka.firstName} runs ${A.name} and will not like it.` : ''}`,
      options: [
        { id: 'yes', label: 'Trade', detail: `You give ground in ${A.name} and take it in ${Bd.name}.`, because: `traded corners with the ${nm}`,
          d: { k: 'accept', label: `You traded corners with ${r.name}`, t: L.id, v: 8, y: 'A fair trade', more },
          fx: [{ type: 'influence', district: A.id, faction: 'player', amount: -10 }, { type: 'influence', district: A.id, faction: r.id, amount: 10 }, { type: 'influence', district: Bd.id, faction: 'player', amount: 10 }, { type: 'influence', district: Bd.id, faction: r.id, amount: -10 }] },
        { id: 'no', label: 'Keep what you have', detail: 'Lines stay where they are.', because: `refused the ${nm}'s swap`,
          d: { k: 'decline', label: `You refused ${r.name}'s swap`, t: L.id, v: -6, y: 'Would not trade fair', pride: 1, ...(ka ? { more: [[ka.id, 3, `Kept my corners in ${A.name}`]] } : {}) }, fx: [] },
      ],
    };
  }
  return undefined;
}

function phillyPoint(s: GameState): Built | undefined {
  const P = leaderOf(s, 'philly' as RivalId);
  if (!P) return undefined;
  const recent = s.incomeHistory.slice(-4);
  const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 2000;
  const n = round100(Math.max(800, avg * 0.6));
  const g = greedy(s);
  return {
    kind: 'phillyPoint', by: P, theme: 'institution',
    title: 'Philadelphia wants an extra point',
    text: `${displayName(P)} lets it be known that the commission has expenses: an extra point for the season, ${fmtMoney(n)} now. In return, Philadelphia remembers its friends at the Table.`,
    options: [
      { id: 'yes', label: `Pay the point (${fmtMoney(n)})`, detail: 'A favor banked with Philadelphia.', because: 'paid Philadelphia the extra point',
        d: { k: 'accept', label: 'You paid Philadelphia the extra point', t: P.id, v: 12, y: 'Paid the extra point', more: g.map((k) => [k.id, -3, 'Sends our money up the turnpike'] as [string, number, string]) },
        fx: [{ type: 'money', amount: -n, category: 'tribute' }, { type: 'favor', amount: 1 }] },
      { id: 'no', label: 'Plead a slow season', detail: 'Philadelphia does not like the word no.', because: 'refused Philadelphia the extra point',
        d: { k: 'decline', label: 'You refused Philadelphia the extra point', t: P.id, v: -10, y: "Refused the commission's point", pride: 1, more: g.map((k) => [k.id, 3, 'Kept our money home'] as [string, number, string]) }, fx: [] },
    ],
  };
}

function ubPurge(s: GameState): Built | undefined {
  const U = crewOf(s).find((c) => c.rank === 'underboss');
  if (!U) return undefined;
  const T = crewOf(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && !c.dynasty && c.id !== U.id && opinion(s, c.id, s.playerId) <= 0)
    .sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId) || a.id.localeCompare(b.id))[0];
  if (!T) return undefined;
  return {
    kind: 'ubPurge', by: U, theme: 'crew', actors: [U.id, T.id],
    title: `${U.firstName} wants ${T.firstName} gone`,
    text: `${displayName(U)} closes the door. "${T.firstName} ${T.lastName}. He talks about you behind your back, he's short, he's sour. Run him off the island before he does something. Say the word."`,
    options: [
      { id: 'yes', label: `Run ${T.firstName} off`, detail: 'His people will not forget it. The rest of the crew will watch.', because: `ran ${T.firstName} off on ${U.firstName}'s word`,
        d: { k: 'punish', label: `You ran ${T.firstName} off the island`, t: T.id, v: -25, y: 'Ran me out of town', more: [[U.id, 8, 'Listened to me']] }, fx: [{ type: 'exile', charId: T.id }] },
      { id: 'no', label: 'He stays', detail: `${U.firstName} thinks you are making a mistake.`, because: `kept ${T.firstName} against ${U.firstName}'s advice`,
        d: { k: 'decline', label: `You kept ${T.firstName} against ${U.firstName}'s advice`, t: U.id, v: -8, y: 'Ignored my warning', pride: 1 }, fx: [] },
    ],
  };
}

const WIFE_MATTERS = [
  ['her sister\'s boy needs a job, and a word with the parish', 400],
  ['Sunday dinner for her whole family at the house, the way her mother did it', 300],
  ['the children to St. Ann\'s, with the good families', 900],
] as const;

function wifeFamily(s: GameState): Built | undefined {
  const W = s.characters[s.characters[s.playerId]?.spouseId ?? ''];
  if (!W?.alive) return undefined;
  const [what, n] = WIFE_MATTERS[Math.floor(r01(ensureReactions(s)) * WIFE_MATTERS.length)];
  return {
    kind: 'wifeFamily', by: W, theme: 'family', family: true,
    title: `${W.firstName} has a family matter`,
    text: `${W.firstName} waits until the kitchen is empty: ${what}. "For once, put us first."`,
    options: [
      { id: 'yes', label: `Do it (${fmtMoney(n)})`, detail: 'Her people will hear you did right.', because: `did right by ${W.firstName}'s family`,
        d: { k: 'family', label: `You did right by ${W.firstName}'s family`, t: W.id, v: 10, y: 'Put the family first' }, fx: [{ type: 'money', amount: -n, pot: 'pocket' }] },
      { id: 'no', label: 'Not now, the business', detail: 'She has heard that before.', because: `put the business before ${W.firstName}'s family`,
        d: { k: 'decline', label: `You put the business before ${W.firstName}`, t: W.id, v: -10, y: 'Put the business before the family', pride: 1 }, fx: [] },
    ],
  };
}

/** What makes a man reach for each kind (the act axes) and how to build it. */
const KINDS: { kind: ProposalKind; act: Partial<Record<Axis, number>>; base: number; build: (s: GameState) => Built | undefined }[] = [
  { kind: 'capoRacket', act: { money: 1, power: 0.5 }, base: 14, build: capoRacket },
  { kind: 'capoMan', act: { power: 0.5, loyalty: 0.5 }, base: 10, build: capoMan },
  { kind: 'rivalMarriage', act: { social: 1, power: 0.5 }, base: 6, build: rivalMarriage },
  { kind: 'rivalTruce', act: { honor: 0.5, risk: -0.5 }, base: 8, build: rivalTruce },
  { kind: 'rivalVenture', act: { money: 1 }, base: 8, build: rivalVenture },
  { kind: 'rivalSwap', act: { power: 1 }, base: 6, build: rivalSwap },
  { kind: 'phillyPoint', act: { money: 1 }, base: 6, build: phillyPoint },
  { kind: 'ubPurge', act: { violence: 0.7, scheme: 0.5 }, base: 7, build: ubPurge },
  { kind: 'wifeFamily', act: { social: 0.5 }, base: 9, build: wifeFamily },
];

/** Turn a built proposal into a popup, each option carrying its predicted reactions. */
export function proposalEvent(s: GameState, b: Built): EventInstance {
  const choices: Choice[] = b.options.map((o) => {
    const pred = reactionsTo(s, o.d);
    const line = predictLine(s, pred);
    return { id: o.id, label: o.label, detail: line ? `${o.detail} ${o.id === 'yes' ? 'Accepting' : 'Declining'}: ${line}.` : o.detail, because: o.because, effects: [react({ ...o.d, src: `rx_${b.kind}` }), ...o.fx] };
  });
  return {
    iid: `ev${s.nextId++}`, defId: `rx_${b.kind}`, title: b.title, text: b.text, week: s.week, choices,
    defaultChoiceId: choices[choices.length - 1].id, mandatory: false, priority: 40,
    meta: { theme: b.theme, charId: b.by.id, rx: b.kind, ...(b.by.faction === 'player' ? { crew: 1 } : {}), ...(b.family ? { family: 1 } : {}) },
    actors: b.actors ?? [b.by.id],
  };
}

/** Build one proposal of a given kind now (tests, the dev panel). */
export function buildProposal(s: GameState, kind: ProposalKind): EventInstance | undefined {
  const k = KINDS.find((x) => x.kind === kind);
  const b = k?.build(s);
  return b ? proposalEvent(s, b) : undefined;
}

/** The event source: at most one proposal every few weeks, the kind leaning on the proposer's nature. */
export function proposalsEventSource(s: GameState): EventInstance | undefined {
  if (s.gameOver || !s.minds || s.week < 3) return undefined;
  if (s.pendingEvents.some((e) => e.defId.startsWith('rx_')) || s.eventQueue.some((e) => e.defId.startsWith('rx_'))) return undefined;
  const R = ensureReactions(s);
  if (s.week - R.pl < PROPOSAL_GAP) return undefined;
  if (r01(R) >= 0.45) return undefined;
  const built: [Built, number][] = [];
  for (const k of KINDS) {
    if (s.week - (R.pr[k.kind] ?? -99) < PROPOSAL_KIND_GAP) continue;
    const b = k.build(s);
    if (!b) continue;
    built.push([b, Math.max(1, k.base + vecScore(b.by, k.act) / 3)]);
  }
  if (!built.length) return undefined;
  const total = built.reduce((a, x) => a + x[1], 0);
  let roll = r01(R) * total;
  let pick = built[built.length - 1][0];
  for (const [b, w] of built) { roll -= w; if (roll < 0) { pick = b; break; } }
  R.pl = s.week;
  R.pr[pick.kind] = s.week;
  R.stats.props++;
  return proposalEvent(s, pick);
}
