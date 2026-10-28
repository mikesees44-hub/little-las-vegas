import { ageOn } from '../../engine/calendar';
import { capos, isFree } from '../../engine/characters';
import { POSTS } from '../../engine/attrs';
import { holder, SEATS, SEAT_INFO } from '../../engine/council';
import { CAPO_CUT } from '../../engine/economy';
import { GIFTS, LEVERAGE, giftAvailable, giftPrice, houseTickets, tastes } from '../../engine/gifts';
import { DESIGNATION_INFO, DESIGNATION_MODES, GROOM_PATHS, GROOM_PATH_IDS, successionCandidates } from '../../engine/heir';
import { interactionsFor, playerHook } from '../../engine/interactions';
import { favorsFor } from '../../engine/polPuppets';
import { peekCtl } from '../../engine/polGov';
import { FAVORS } from '../../engine/polData';
import { getRelation } from '../../engine/relations';
import { SCHEME_INFO } from '../../engine/schemes';
import { knownSecrets } from '../../engine/secrets';
import { tableMembers } from '../../engine/table';
import { casusBelli } from '../../engine/war';
import { TALK_IDS, talkApplies } from '../../engine/talks';
import { pwView } from '../../engine/powerState';
import { wantedFor } from '../../engine/fugitive';
import { jobsForPerson } from '../../engine/dirtyWork';
import { isAdult } from '../../engine/dating';
import { addEarsItems } from '../ears/earsMenu';
import { nightActionsFor } from '../../engine/nightlife';
import { candidatesFor, isMinor, recommendGuards, sleuth } from '../../engine/protect';
import type { Character, CrewPolicy, GameState, InteractionId, PlayerAction, RivalId, SchemeKind } from '../../engine/types';

/**
 * The CK-style interaction menu: every verb aimed at one person, grouped in
 * categories. Pure: it lists PlayerActions (shown as order cards) and a few
 * "openers" (the scheme planner, the trip planner, the gift catalog).
 */
export type MenuCategoryId = 'best' | 'talk' | 'diplomacy' | 'business' | 'heirs' | 'intrigue' | 'hostile' | 'romance' | 'travel' | 'table' | 'cityhall' | 'self' | 'nightlife';

export type Opener =
  | { type: 'plan'; kind: SchemeKind }
  | { type: 'trip' }
  | { type: 'flee' }
  | { type: 'gifts' }
  | { type: 'marriage' }
  | { type: 'go'; to: string; label: string }
  /** The Ears (src/ui/ears): pick an Ear for a man, or his connections. */
  | { type: 'ears'; mode: 'close' | 'dance' | 'web' }
  /** Dirty work aimed at him (lean on him, pay him off, buy him): opens Dirty work with him chosen. */
  | { type: 'dirty' }
  /** You and her: dating, going steady, company (Relationships & Dating). */
  | { type: 'dating' }
  /** Their calling card (who they are at a glance). */
  | { type: 'card' };

export interface MenuItem {
  key: string;
  action?: PlayerAction;
  /** Card title override. */
  label?: string;
  open?: Opener;
  /** Opener text. */
  text?: string;
  hostile?: boolean;
}

export interface MenuCategory {
  id: MenuCategoryId;
  label: string;
  items: MenuItem[];
}

export const CATEGORY_LABEL: Record<MenuCategoryId, string> = {
  best: 'Best now', talk: 'Talk', diplomacy: 'Diplomacy', business: 'The Family business', heirs: 'Heirs & Grooming', intrigue: 'Intrigue', hostile: 'Hostile', romance: 'Romance & Marriage',
  travel: 'Travel', table: 'The Table', cityhall: 'City Hall', self: 'Yourself', nightlife: 'The night & the Ears',
};

const INTERACT_CAT: Record<InteractionId, MenuCategoryId> = {
  dinner: 'diplomacy', gift_small: 'diplomacy', gift_large: 'diplomacy', favor: 'diplomacy', bribe: 'diplomacy', demand: 'diplomacy',
  recruit: 'business', bringIn: 'business', make: 'business', promote: 'business', demote: 'business',
  expose: 'intrigue', threaten: 'hostile', exile: 'hostile', whack: 'hostile',
  court: 'romance', affair: 'romance', proposeMarriage: 'romance', endRomance: 'romance', separate: 'romance',
};

/** The best gifts for him first (what he likes, what fits his station), then the rest. */
export function rankedGifts(s: GameState, c: Character) {
  const t = tastes(c);
  const known = c.dynasty || c.faction === 'player' || (getRelation(s, c.id, s.playerId)?.trust ?? 0) >= 20;
  const list = GIFTS.filter((g) => giftAvailable(g, s.date.y)).map((g) => {
    const price = giftPrice(s, g);
    const like = known && t.likes.includes(g.cat) ? 2 : known && t.dislikes.includes(g.cat) ? -2 : 0;
    const fit = -Math.abs(Math.log10(Math.max(100, price)) - Math.log10(Math.max(500, c.wealth / 4 + 500)));
    return { g, price, score: like + fit, liked: like > 0, disliked: like < 0 };
  });
  return { known, list: list.sort((a, b) => b.score - a.score) };
}

export function menuFor(s: GameState, c: Character): MenuCategory[] {
  const cats = new Map<MenuCategoryId, MenuItem[]>();
  const add = (id: MenuCategoryId, item: MenuItem) => { if (!cats.has(id)) cats.set(id, []); cats.get(id)!.push(item); };
  const isBoss = c.id === s.playerId;
  if (!c.alive || s.gameOver) return [];

  if (isBoss) {
    add('self', { key: 'office', action: { kind: 'officeHours' } });
    add('self', { key: 'lifestyle', open: { type: 'go', to: 'you.lifestyle', label: 'Lifestyle & perks…' }, text: 'Choose a focus and learn perks.' });
    add('self', { key: 'court', open: { type: 'go', to: 'you.court', label: 'Hold court…' }, text: 'Office hours and the Audience.' });
    add('self', { key: 'host', open: { type: 'go', to: 'house.activities', label: 'Host a gathering…' }, text: 'Sunday dinner, a clambake, a christening.' });
    add('self', { key: 'night', open: { type: 'go', to: 'town.night', label: 'The Night…' }, text: 'The Madam, the Ears, who is attached to whom.' });
    const p = pwView(s);
    if (p.station !== 'boss') { add('self', { key: 'climb', action: { kind: 'power', op: { op: 'climb' } } }); add('self', { key: 'takeover', action: { kind: 'power', op: { op: 'takeover' } } }); }
    addProtect(s, c, add);
    add('travel', { key: 'trip', open: { type: 'trip' }, label: 'Plan a trip…', text: 'A vacation, or business in another city.' });
    if (wantedFor(s, c.id)) add('travel', { key: 'flee', open: { type: 'flee' }, label: 'Run for it…', text: 'Leave town before they come for you.', hostile: true });
    return order(cats);
  }

  // Interactions (diplomacy, the family business, hostile, romance, expose).
  const inters = interactionsFor(s, c.id);
  const hook = !!playerHook(s, c.id);
  for (const p of inters) {
    add(INTERACT_CAT[p.id] ?? 'diplomacy', { key: `i:${p.id}`, action: { kind: 'interact', id: p.id, target: c.id }, hostile: INTERACT_CAT[p.id] === 'hostile' });
    if (hook && p.acceptance) add('intrigue', { key: `ih:${p.id}`, action: { kind: 'interact', id: p.id, target: c.id, useHook: true } });
  }

  // Gifts, tickets, gifts with strings.
  add('diplomacy', { key: 'gifts', open: { type: 'gifts' }, label: 'Give a gift…', text: 'The three he would like best first; the whole catalogue behind them.' });
  for (const tk of houseTickets(s)) add('diplomacy', { key: `inv:${tk.team}`, action: { kind: 'econ', op: { type: 'invite', team: tk.team, to: c.id } } });
  if (c.faction !== 'player' || c.office) for (const m of Object.keys(LEVERAGE)) if (m !== 'introduce') add('diplomacy', { key: `lev:${m}`, action: { kind: 'econ', op: { type: 'leverage', mode: m as never, to: c.id } } });

  // The family business.
  const mine = c.faction === 'player' && c.rank !== 'civilian';
  if (mine && isFree(s, c)) {
    if (c.rank === 'associate' && c.proposedWeek === undefined) add('business', { key: 'propose', action: { kind: 'propose', charId: c.id } });
    if ((c.rank === 'soldier' || c.rank === 'associate') && !c.specialty) {
      for (const pol of ['tax', 'earn', 'squeeze'] as CrewPolicy[]) if (pol !== (c.policy ?? 'tax')) add('business', { key: `pol:${pol}`, action: { kind: 'policy', charId: c.id, policy: pol } });
      for (const k of capos(s).filter((k) => k.id !== c.capoId).slice(0, 4)) add('business', { key: `re:${k.id}`, action: { kind: 'reassign', charId: c.id, capoId: k.id } });
    }
    if (c.rank === 'capo') {
      const keep = c.keep ?? CAPO_CUT;
      if (keep > 0.2) add('business', { key: 'k-', action: { kind: 'contract', charId: c.id, keep: Math.round((keep - 0.05) * 100) / 100 } });
      if (keep < 0.45) add('business', { key: 'k+', action: { kind: 'contract', charId: c.id, keep: Math.round((keep + 0.05) * 100) / 100 } });
    }
    if (c.rank !== 'associate' && !c.specialty) {
      for (const st of SEATS) if (holder(s, st)?.id !== c.id) add('business', { key: `seat:${st}`, action: { kind: 'appoint', seat: st, charId: c.id }, label: `Seat him as ${SEAT_INFO[st].name.toLowerCase()}${holder(s, st) ? ` (in ${holder(s, st)!.firstName}'s place)` : ''}` });
    }
    add('business', { key: 'bg', action: { kind: 'background', charId: c.id } });
  }

  // Heirs & grooming.
  const cand = successionCandidates(s).some((x) => x.id === c.id);
  if (cand) {
    add('heirs', { key: 'read', action: { kind: 'power', op: { op: 'read', charId: c.id } }, label: `Find out what ${c.firstName} wants` });
    add('heirs', { key: 'promise', action: { kind: 'power', op: { op: 'promise', charId: c.id, years: 3 } } });
    if (c.dynasty) {
      for (const m of DESIGNATION_MODES.filter((m) => DESIGNATION_INFO[m].needsHeir)) add('heirs', { key: `des:${m}`, action: { kind: 'power', op: { op: 'designate', mode: m, charId: c.id } } });
      for (const g of GROOM_PATH_IDS) add('heirs', { key: `groom:${g}`, action: { kind: 'power', op: { op: 'groom', charId: c.id, path: g } }, label: `Groom him: ${GROOM_PATHS[g].name.toLowerCase()}` });
    }
    const placed = !!pwView(s).placements[c.id];
    if (placed) add('heirs', { key: 'unplace', action: { kind: 'power', op: { op: 'unplace', charId: c.id } } });
    else for (const post of Object.keys(POSTS)) add('heirs', { key: `place:${post}`, action: { kind: 'power', op: { op: 'place', charId: c.id, post } }, label: `Protégé: ${POSTS[post].name.toLowerCase()}` });
  }

  // Schemes.
  const rivalMob = s.rivals.some((r) => r.id === c.faction && r.kind === 'mob');
  const isLeader = s.rivals.some((r) => r.leaderId === c.id);
  const kinds: SchemeKind[] = [
    'befriend', 'sway',
    ...(knownSecrets(s, c.id).length && c.faction !== 'player' ? ['blackmail' as const] : []),
    ...(rivalMob && !isLeader && c.rank !== 'civilian' ? ['informant' as const, 'flip' as const] : []),
    ...(rivalMob ? ['frame' as const] : []),
  ];
  for (const k of kinds) add('intrigue', { key: `plan:${k}`, open: { type: 'plan', kind: k }, label: `${SCHEME_INFO[k].name}…`, text: SCHEME_INFO[k].text, hostile: SCHEME_INFO[k].hostile });
  addEarsItems(s, c, add);
  addProtect(s, c, add);
  if (!c.office && c.faction !== 'law') add('hostile', { key: 'plan:murder', open: { type: 'plan', kind: 'murder' }, label: 'Plan a hit…', text: SCHEME_INFO.murder.text, hostile: true });

  // Dirty work aimed at him: the same jobs as the old row on his sheet, now in the menu everywhere.
  if (jobsForPerson(s, c.id).length) add('hostile', { key: 'dirty', open: { type: 'dirty' }, label: 'Dirty work on him…', text: 'Lean on him, pay him off, buy him: a one-off job with him as the target.', hostile: true });

  // You and her (adults only; never your own kin unless she is your wife): dating, going steady, company.
  if (isAdult(s, c) && !(c.dynasty && s.characters[s.playerId]?.spouseId !== c.id)) add('romance', { key: 'dating', open: { type: 'dating' }, label: `You and ${c.firstName}…`, text: 'Dating, going steady, gifts, company. She always decides.' });

  // Their calling card (adults), the goomar (CK's concubine: only someone you are already seeing, and she decides), the night's orders.
  if (isAdult(s, c)) add('talk', { key: 'card', open: { type: 'card' }, label: `${c.firstName}'s calling card…`, text: 'Who they are at a glance: looks, personality, skills, family, money as known, you, rumors.' });
  if (isAdult(s, c) && !(c.dynasty && s.characters[s.playerId]?.spouseId !== c.id) && s.characters[s.playerId]?.spouseId !== c.id) add('romance', { key: 'goomar', action: { kind: 'nightlife', op: { op: 'goomar', id: c.id } }, label: `Make ${c.firstName} your goomar` });
  for (const a of nightActionsFor(s, c.id)) if (a.kind === 'nightlife' && a.op.op !== 'goomar') add(a.op.op === 'endGoomar' ? 'romance' : 'nightlife', { key: `nl:${JSON.stringify(a.op)}`, action: a });

  // Romance and marriage of the house's people.
  if (c.dynasty && c.faction === 'player' && !c.spouseId && ageOn(c.birth, s.date) >= 16) add('romance', { key: 'match', open: { type: 'marriage' }, label: `Arrange a match for ${c.firstName}…`, text: 'Compare the families\' sons and daughters; the match is theirs to accept.' });

  // Travel.
  if (c.faction === 'player') add('travel', { key: 'trip', open: { type: 'trip' }, label: 'Send him on a trip…', text: 'A vacation, or business in another city, with him leading.' });
  if (c.faction === 'player' && wantedFor(s, c.id)) add('travel', { key: 'flee', open: { type: 'flee' }, label: 'Get him out of town…', text: 'Hide him before the law comes.' });
  const fug = s.travel?.fugitives.find((f) => !f.end && f.personId === c.id);
  if (fug) { add('travel', { key: 'home', action: { kind: 'travel', op: { type: 'comeHome', personId: c.id } } }); add('travel', { key: 'exile', action: { kind: 'travel', op: { type: 'exile', personId: c.id } } }); }

  // The Table: rival bosses and Table members.
  const member = tableMembers(s).some((m) => m.id === c.id);
  if (member) {
    for (const d of s.disputes.filter((x) => !x.ruling && x.plaintiff !== c.faction && x.defendant !== c.faction)) {
      for (const mode of ['money', 'favor', 'hook'] as const) add('table', { key: `lob:${d.id}:${mode}`, action: { kind: 'lobby', disputeId: d.id, memberId: c.id, mode } });
    }
  }
  if (isLeader && rivalMob) {
    const rival = c.faction as RivalId;
    const contested = s.districts.filter((d) => (d.influence[rival] ?? 0) > 0);
    for (const d of contested.slice(0, 2)) add('table', { key: `dis:${d.id}`, action: { kind: 'raiseDispute', dispute: 'district', rival, district: d.id } });
    add('table', { key: 'rep', action: { kind: 'raiseDispute', dispute: 'reparations', rival } });
    for (const d of contested.filter((x) => casusBelli(s, rival, x.id) && !s.wars.some((w) => w.rival === rival)).slice(0, 2)) add('table', { key: `war:${d.id}`, action: { kind: 'declareWar', rival, district: d.id }, hostile: true });
    for (const w of s.wars.filter((x) => x.rival === rival)) {
      add('table', { key: `raid:${w.id}`, action: { kind: 'raid', warId: w.id }, hostile: true });
      for (const t of ['white', 'tribute', 'district'] as const) add('table', { key: `terms:${w.id}:${t}`, action: { kind: 'terms', warId: w.id, terms: t } });
    }
  }

  // Talks: he may agree, refuse, ask for time, counter, or go his own way (talks.ts).
  for (const id of TALK_IDS) if (!talkApplies(s, id, c)) add('talk', { key: `t:${id}`, action: { kind: 'talk', op: { t: 'ask', talk: id, target: c.id } } });

  // City Hall: officials who are also people of the world.
  const p = Object.values(s.pol?.people ?? {}).find((x) => x.charId === c.id);
  if (p && p.alive) addPol(s, p.id, add);
  return order(cats);
}

/** Protection & intelligence (engine/protect.ts): Assign protection, and have him looked into. */
function addProtect(s: GameState, c: Character, add: (id: MenuCategoryId, item: MenuItem) => void): void {
  const boss = s.characters[s.playerId];
  const isBoss = c.id === s.playerId;
  const close = isBoss || c.dynasty || boss?.spouseId === c.id || boss?.childrenIds.includes(c.id) || !!s.nightlife?.goomars[c.id] || c.faction === 'player';
  const cat: MenuCategoryId = isBoss ? 'self' : 'intrigue';
  if (close) {
    const rec = recommendGuards(s, c.id, 'day', 1)[0];
    if (rec) add(cat, { key: 'protect', action: { kind: 'protect', op: { op: 'guard', subject: c.id, who: [rec.guard.id], kind: isBoss ? 'bodyguard' : isMinor(s, c) ? 'family' : 'driver', shift: 'day', weeks: 8, reportsTo: isBoss ? 'me' : 'both' } }, label: `Assign protection: ${rec.guard.firstName} on ${isBoss ? 'you' : c.firstName}` });
    add(cat, { key: 'protect-open', open: { type: 'go', to: 'borgata.protect', label: 'Assign protection…' }, text: 'Pick the guard or team, the schedule, how long, who gets the reports, the spending limit.' });
  }
  if (isBoss || isMinor(s, c)) return;
  const man = candidatesFor(s, c.id, 'day').filter((m) => m.rank !== 'capo').sort((a, b) => sleuth(s, b) - sleuth(s, a) || a.id.localeCompare(b.id))[0];
  if (!man) return;
  const purpose = c.faction === 'player' && c.rank !== 'civilian' ? (c.rank === 'capo' ? 'money' : 'loyalty') : 'personal';
  add('intrigue', { key: 'inquiry', action: { kind: 'protect', op: { op: 'investigate', subject: c.id, purpose, who: man.id, weeks: 6 } }, label: `Have ${man.firstName} look into ${c.firstName}`, hostile: true });
}

/** City Hall verbs for a person of the political world (by pol id). */
export function addPol(s: GameState, polId: string, add: (id: MenuCategoryId, item: MenuItem) => void): void {
  const p = s.pol?.people[polId];
  if (!p) return;
  const pa = (op: Extract<PlayerAction, { kind: 'pol' }>['op']): PlayerAction => ({ kind: 'pol', op });
  const c = peekCtl(s, p.id);
  add('cityhall', { key: 'cult-d', action: pa({ op: 'cultivate', id: p.id, how: 'dinner' }) });
  add('cityhall', { key: 'cult-g', action: pa({ op: 'cultivate', id: p.id, how: 'gift' }) });
  add('cityhall', { key: 'pad', action: pa({ op: 'payroll', id: p.id, on: !c?.payroll }) });
  add('cityhall', { key: 'dig', action: c?.dirt ? pa({ op: 'coerce', id: p.id }) : pa({ op: 'dig', id: p.id }), hostile: !!c?.dirt });
  for (const f of favorsFor(s, p)) add('cityhall', { key: `fav:${f.kind}`, action: pa({ op: 'favor', id: p.id, kind: f.kind }), label: `Ask: ${FAVORS[f.kind].name.toLowerCase()}` });
  if (p.street) add('cityhall', { key: 'recruit', action: pa({ op: 'recruit', id: p.id }) });
}

const ORDER: MenuCategoryId[] = ['self', 'talk', 'diplomacy', 'business', 'heirs', 'romance', 'intrigue', 'nightlife', 'hostile', 'table', 'cityhall', 'travel'];
function order(m: Map<MenuCategoryId, MenuItem[]>): MenuCategory[] {
  return ORDER.filter((id) => m.get(id)?.length).map((id) => ({ id, label: CATEGORY_LABEL[id], items: m.get(id)! }));
}
