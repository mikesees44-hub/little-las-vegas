import { pocketPrice } from './pocket';
import type { ActionPreview } from './actions';
import { noteScore } from './ledgerbook';
import { commitDeal, previewDeal } from './deals';
import { workload } from './applicants';
import { styleDraw } from './design';
import { commitEmpire, empireActions, empireWeek, previewEmpire, venueBusiness } from './empire';
import { commitLux, goodLifeWeek, luxActions, previewLux, truckBonus } from './goodlife';
import { expectedTake, isOpen, newBusiness } from './business';
import { isInSeason, monthKey } from './calendar';
import { CATALOG } from './catalog';
import { crew, hasTrait, isFree, shortName } from './characters';
import { ensureEcon, eid, type EconAction, type EconOp, type HQKind, type Lot, type Manager, type ZoneId } from './econState';
import { fmtMoney, shiftInfluence } from './effects';
import {
  GIFTS_BY_ID, LEVERAGE, PROJECTS, PROJECTS_BY_KIND, TEAMS, giftAvailable, giftOpinion, giftPrice, houseTickets, leverageOdds, teamPlaying, ticketHeir, trustGain,
} from './gifts';
import { addEvidence, addStory } from './hierarchy';
import { bugText, HQ_INFO, hqMorale, hqRestaurants, hqWeek, SWEEP_COST, SWEEP_FIND } from './hq';
import { heat, money, respect, type Ctx } from './ledger';
import {
  OVERSIGHT, SOURCE_LABEL, assistantCandidates, crewCandidates, ensureStaff, familyCandidates, isClub, managerFromChar, managerFromPro, managerMult, managerOf,
  managerSkimRate, managing, newStaff, proCandidates, staffAmbition, ROLE_LABEL,
} from './managers';
import {
  STAGE_COST, USES_BY_ID, ZONES, ZONES_BY_ID, buildCost, districtTilt, generateLots, goodwill, inflation, lotName, propertyNet,
  propertyWash, supplyChain, underConstruction,
} from './property';
import {
  bidOdds, businessForLot, canSlow, constructionWeek, contractsWeek, ensureInspector, fixCost, inspectorBribe, permitAuthority, scheduleWeeks, startBuild, stopWorkEvent, townMonth,
} from './construction';
import { applyRacketOp, commitRacket, describeRacketOp, previewRacket, racketLifeWeek } from './racketLife';
import { applyTreeHeat, collectCost, collectPreview, commitCollect, nextStep, racketMult, racketMut, racketOf, racketWeek } from './rackets';
import { addOpinion, changeMeter, setModifier } from './relations';
import { chance, pick, randInt } from './rng';
import { bigScoresWeek, buildShortEvent, capoBooksMonth, capoBooksWeek } from './scores';
import type { Business, Effect, EventInstance, GameState, PlayerAction, RivalId } from './types';
import { FACTION_NAMES } from './world';
import { commitBank, decideApp, fbankWash, previewBank } from './familyBank';
import { commitHome, previewHome } from './housing';
import { commitKickup, nextSetup, previewKickup } from './kickup';

/**
 * The economy & property pillar's hub: the hooks the old economy calls
 * (expected take, the week of a business, wash capacity), the weekly and
 * monthly ticks, the player's orders (`{ kind: 'econ', op }`), the effect ops
 * (`{ type: 'econ', op }`) and the one event candidate a week it offers to the
 * popup pipeline.
 */

/* ---------------- setup ---------------- */

/** Lays out the property market (once). Uses the layer's own dice. */
export function initEcon(s: GameState): void {
  const e = ensureEcon(s);
  if (!e.lots.length) generateLots(s, e);
  e.lastMonth = monthKey(s.date);
}

/* ---------------- hooks into the old economy ---------------- */

/** Multiplier on a business's expected take: racket books, tree, manager, district demand. Pure. */
export function econTakeMult(s: GameState, b: Business): number {
  if (!s.econ) return 1;
  const def = CATALOG[b.kind];
  let m = racketMult(s, b) * managerMult(managerOf(s, b.id)) * styleDraw(s, b.id) * (b.kind === 'trucking' ? truckBonus(s) : 1);
  m *= districtTilt(b.districtId, isInSeason(s.date), def.season[0] >= 1.8 && def.season[1] <= 0.6);
  const r = racketOf(s, b);
  if (isClub(b) && r.competition) m *= 1 - r.competition / 200;
  if (b.kind === 'label') m *= 1 + 0.1 * Math.min(3, r.contacts ?? 0);
  if (b.districtId.startsWith('zone:')) m *= 0.85;
  return m;
}

/** The week of a business: racket variance, then the manager's hidden skim and his share. */
export function econBusiness(ctx: Ctx, b: Business, amt: number, label: string): { amt: number; label: string } {
  const s = ctx.s;
  // A venue of the Empire Designer posts its own operating statement.
  const ven = venueBusiness(ctx, b);
  if (ven) return ven;
  if (!s.econ) return { amt, label };
  const e = s.econ;
  const r = racketWeek(ctx, b, amt, label);
  amt = r.amt;
  label = r.label;
  const m = e.managers[b.id];
  if (m && amt > 0) {
    const skim = Math.round(amt * managerSkimRate(s, m));
    if (skim > 0) {
      m.skimmed += skim;
      amt -= skim;
      if (m.charId) {
        const c = s.characters[m.charId];
        if (c) c.wealth += skim;
      }
      if (chance(e, OVERSIGHT[m.oversight].detect) && !e.cooldowns[`skimflag:${b.id}`]) e.cooldowns[`skimflag:${b.id}`] = s.week;
    }
    if (m.share > 0) {
      const share = Math.round(amt * m.share);
      if (share > 0) {
        money(ctx, -share, `Manager's share: ${m.name} (${Math.round(m.share * 100)}% of ${b.name})`, 'cost');
        if (m.charId && s.characters[m.charId]) s.characters[m.charId].wealth += share;
      }
    }
  }
  if (e.rackets[b.id] || amt !== 0) {
    const rr = e.rackets[b.id];
    if (rr) rr.lastNet = amt;
  }
  return { amt, label };
}

/** Dirty money the buildings you run can wash this week. */
export function econWash(s: GameState): number {
  return propertyWash(s) + fbankWash(s);
}

/** Extra shylock loans from the book's upgrades. */
export { bookBonus } from './rackets';

/* ---------------- weekly ---------------- */

export function econWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  if (!e.lots.length) generateLots(s, e);
  const mk = monthKey(s.date);
  if (e.lastMonth && e.lastMonth !== mk) econMonth(ctx);
  e.lastMonth = mk;
  tidy(s);
  if (!e.inspector) ensureInspector(s);
  constructionWeek(ctx, (l) => openLot(ctx, l));
  contractsWeek(ctx);
  propertyWeek(ctx);
  managersWeek(ctx);
  projectsWeek(ctx);
  jobsWeek(ctx);
  hqWeek(ctx, (amt, label) => money(ctx, amt, label, 'cost'));
  bigScoresWeek(ctx);
  capoBooksWeek(s);
  goodLifeWeek(ctx);
  empireWeek(ctx);
  racketLifeWeek(ctx);
  for (const b of s.businesses) if (b.owner === 'player' && isClub(b)) ensureStaff(s, b);
}

/** Drops records for businesses and people that are gone. */
function tidy(s: GameState): void {
  const e = s.econ!;
  const ids = new Set(s.businesses.filter((b) => b.owner === 'player').map((b) => b.id));
  for (const k of Object.keys(e.rackets)) if (!ids.has(k)) delete e.rackets[k];
  for (const k of Object.keys(e.staff)) if (!ids.has(k)) delete e.staff[k];
  for (const k of Object.keys(e.managers)) {
    const m = e.managers[k];
    const gone = k.startsWith('lot:') ? !e.lots.some((l) => `lot:${l.id}` === k && (l.status === 'owned' || l.status === 'leased')) : !ids.has(k);
    if (gone) delete e.managers[k];
    else if (m.charId && !(s.characters[m.charId]?.alive && isFree(s, s.characters[m.charId]))) delete e.managers[k];
    else if (m.assistantId && !s.characters[m.assistantId]?.alive) delete m.assistantId;
  }
  for (const l of e.lots) {
    if (l.bizId && (l.status === 'owned' || l.status === 'leased') && !ids.has(l.bizId)) {
      // The business was sold or seized: the building went with it.
      delete l.bizId;
      l.status = 'sale';
      l.owner = 'private';
      l.price = Math.round(((USES_BY_ID[l.use ?? '']?.cost ?? 3000) * ZONES_BY_ID[l.zone].land + 1500) * inflation(s) / 50) * 50;
      delete l.tenant;
      delete l.operating;
    }
  }
}

/**
 * Who signs the building permits, per lot (the politics layer: officials you
 * own speed permits through, honest ones block them). Lives in construction.ts.
 */
export { registerPermitVerdict as registerPermitAuthority, BUILD_CUSHION, type PermitVerdict, type PermitVerdictFn } from './construction';
import { BUILD_CUSHION } from './construction';

/** The ribbon is cut: a catalog use becomes a Business; any other use starts earning. */
export function openLot(ctx: Ctx, l: Lot): void {
  const s = ctx.s;
  const e = s.econ!;
  const u = USES_BY_ID[l.use!];
  const mine = l.status === 'owned' || l.status === 'leased';
  l.stage = 'open';
  l.stageWeek = 0;
  l.builtYear = s.date.y;
  l.condition = 100;
  delete l.permit;
  delete l.contractor;
  if (!mine && l.home) {
    // A house the town's people built for themselves (housing.ts moves the family in).
    e.stats.npcBuilt++;
    return;
  }
  if (!mine) {
    // Someone else's building opens: it joins the town.
    e.stats.npcBuilt++;
    l.tenant = l.status === 'public' ? `${u.name} (the city)` : `${l.developer ?? 'a developer'}'s ${u.name.toLowerCase()}`;
    if (u.id === 'motel' || u.cost >= 20000) ctx.log.push(`New on the island: ${lotName(l)} (${l.developer ?? 'a developer'}).`);
    return;
  }
  l.operating = true;
  delete l.tenant;
  e.stats.built++;
  if (u.biz) {
    const b = businessForLot(s, l);
    s.businesses.push(b);
    l.bizId = b.id;
  }
  const text = `${lotName(l)} opened its doors.`;
  ctx.log.push(text);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
}

function propertyWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.econ!;
  for (const l of e.lots) {
    if (l.status !== 'owned' && l.status !== 'leased') continue;
    if (l.status === 'leased') money(ctx, -l.rent, `Lease: ${l.address}`, 'cost');
    if (l.stage !== 'open' || !l.use) {
      if (l.status === 'owned' && !underConstruction(l)) {
        const tax = Math.max(2, Math.round(l.price * 0.0008));
        money(ctx, -tax, `Property tax: vacant lot at ${l.address}`, 'cost');
      }
      continue;
    }
    if (l.bizId) continue; // runs through the business pipeline
    if (l.hh) continue; // a family rents it: their rent comes out of their own money (livingWorld householdsWeek)
    if (l.tenant && !l.operating) {
      money(ctx, l.rent, `Rent: ${l.tenant} at ${l.address}`, 'business');
      continue;
    }
    const key = `lot:${l.id}`;
    const m = e.managers[key];
    const { rev, exp } = propertyNet(s, l, managerMult(m) * styleDraw(s, key));
    let net = rev - exp;
    if (m && net > 0) {
      const skim = Math.round(net * managerSkimRate(s, m));
      if (skim > 0) {
        m.skimmed += skim;
        net -= skim;
        if (chance(e, OVERSIGHT[m.oversight].detect) && !e.cooldowns[`skimflag:${key}`]) e.cooldowns[`skimflag:${key}`] = s.week;
      }
    }
    if (net !== 0) money(ctx, net, `Property: ${lotName(l)} (takes ${fmtMoney(rev)}, costs ${fmtMoney(exp)})`, 'business');
  }
}

function managersWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.econ!;
  let salaries = 0;
  let oversight = 0;
  let n = 0;
  for (const k in e.managers) {
    const m = e.managers[k];
    salaries += m.salary;
    oversight += OVERSIGHT[m.oversight].cost;
    n++;
  }
  if (salaries) money(ctx, -salaries, `Managers' salaries (${n})`, 'cost');
  if (oversight) money(ctx, -oversight, 'Bookkeeper\'s hours: going over the managers\' books', 'cost');
}

function projectsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.econ!;
  for (const p of e.projects) {
    if (p.done) continue;
    const def = PROJECTS_BY_KIND[p.kind];
    const pay = Math.round(p.cost / p.weeks);
    if (s.money - pay < BUILD_CUSHION) continue; // waits for money (and never takes the payroll)
    money(ctx, -pay, `Community: ${def.name.toLowerCase()} in ${ZONES_BY_ID[p.zone].name} (week ${p.progress + 1}/${p.weeks})`, 'cost');
    p.progress++;
    if (p.progress >= p.weeks) {
      p.done = s.week;
      e.stats.projects++;
      const z = (e.zones[p.zone] ??= { rep: 0, trust: 0 });
      z.rep = Math.min(100, z.rep + def.rep);
      z.trust = Math.min(100, z.trust + trustGain(s, def.rep));
      respect(ctx, def.respect, `Community: ${def.name.toLowerCase()} is finished (${ZONES_BY_ID[p.zone].name})`, 'event');
      const d = ZONES_BY_ID[p.zone].district;
      if (d) shiftInfluence(s, d, 'player', 1);
      const text = `${def.name} in ${ZONES_BY_ID[p.zone].name} is finished, paid for by the ${s.houseName} family.`;
      ctx.log.push(text);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
    }
  }
  e.projects = e.projects.filter((p) => !p.done || s.week - p.done < 52);
}

function jobsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.econ!;
  let total = 0;
  for (const id of Object.keys(e.jobs)) {
    if (!s.characters[id]?.alive) {
      delete e.jobs[id];
      continue;
    }
    total += e.jobs[id];
  }
  if (total) money(ctx, -total, `No-show jobs on your payrolls (${Object.keys(e.jobs).length})`, 'cost');
}

/* ---------------- monthly ---------------- */

export function econMonth(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.econ!;
  // The market moves: owners decide to sell, buyers (some of them rivals) snap things up, buildings age.
  for (const l of e.lots) {
    if (l.stage === 'open') l.condition = Math.max(20, Math.round((l.condition - 0.35) * 100) / 100);
    if (l.status === 'sale') l.price = Math.round(l.price * 1.0025);
  }
  const priv = e.lots.filter((l) => l.status === 'private');
  if (priv.length && chance(e, 0.4)) {
    const l = pick(e, priv);
    l.status = 'sale';
    l.owner = 'private';
  }
  const sale = e.lots.filter((l) => l.status === 'sale');
  if (sale.length > 20 && chance(e, 0.35)) {
    const l = pick(e, sale);
    const z = ZONES_BY_ID[l.zone];
    const d = z.district ? s.districts.find((x) => x.id === z.district) : undefined;
    const rival = (z.rival ?? (d ? (Object.entries(d.influence).filter(([f, v]) => f !== 'player' && (v ?? 0) > 15).map(([f]) => f)[0] as RivalId | undefined) : undefined));
    if (rival && s.rivals.some((r) => r.id === rival)) {
      l.status = 'rival';
      l.owner = rival;
      e.stats.rivalBuys++;
      ctx.log.push(`${FACTION_NAMES[rival]} bought ${lotName(l)}.`);
    } else {
      l.status = 'private';
    }
  }
  // Staff live their own lives.
  if (s.week - (e.cooldowns.staffMove ?? -99) >= 8) {
    for (const bid of Object.keys(e.staff)) {
      const list = e.staff[bid];
      const m = list.find((x) => !x.fate && s.week - x.since >= 20 && staffAmbition(x) && chance(e, 0.15));
      if (m) {
        e.cooldowns.staffMove = s.week;
        e.cooldowns[`staff:${bid}:${m.id}`] = s.week;
        break;
      }
    }
  }
  for (const l of e.lots) {
    // Skills grow: an assistant learns the trade.
    const m = e.managers[`lot:${l.id}`];
    if (m?.assistantId) learn(s, m.assistantId);
  }
  for (const k in e.managers) if (e.managers[k].assistantId) learn(s, e.managers[k].assistantId!);
  // Season tickets pass to the heir.
  for (const t of e.tickets) {
    const h = s.characters[t.holderId];
    if (h?.alive) continue;
    const heir = h ? ticketHeir(s, h) : undefined;
    if (heir) {
      ctx.log.push(`${heir.firstName} inherits the ${TEAMS[t.team].name} season tickets.`);
      t.holderId = heir.id;
    } else t.holderId = '';
  }
  e.tickets = e.tickets.filter((t) => t.holderId);
  // Neighborhoods: appreciation fades a little, trust falls with heat; where they trust you, they look the other way.
  let quiet = false;
  for (const zid of Object.keys(e.zones) as ZoneId[]) {
    const z = e.zones[zid]!;
    z.rep = Math.max(0, z.rep - 1);
    z.trust = Math.max(0, Math.round(z.trust - s.heat.local / 40));
    if (z.trust >= 40 && ZONES_BY_ID[zid].district) quiet = true;
  }
  if (quiet) heat(ctx, 'local', -1, 'The neighborhood looks the other way (community trust)', 'heat');
  // Rich men spend too.
  if (chance(e, 0.3)) {
    const rich = s.rivals.filter((x) => x.kind === 'mob' && x.money > 15000 && x.homeDistrict && s.characters[x.leaderId]?.alive);
    const r = rich.length ? pick(e, rich) : undefined;
    if (r && r.homeDistrict) {
      r.money -= 2000;
      shiftInfluence(s, r.homeDistrict, r.id, 1);
      const p = pick(e, PROJECTS.slice(0, 10));
      ctx.log.push(`${FACTION_NAMES[r.id]} paid for ${p.name.toLowerCase()} in ${s.districts.find((d) => d.id === r.homeDistrict)?.name ?? 'their district'}.`);
    }
  }
  // HQ morale.
  const mo = hqMorale(s);
  if (mo || e.cooldowns.hqMood) for (const c of crew(s)) setModifier(s, c.id, s.playerId, 'Where we do business', mo);
  e.cooldowns.hqMood = mo;
  // The town builds, burns and bids.
  townMonth(ctx);
  // The bagman's numbers: who came up short?
  const sc = capoBooksMonth(s);
  if (sc) e.cooldowns.shortCapo = s.week;
  if (sc) e.cases[sc.capoId] = { skimming: sc.skimming, shortfall: sc.shortfall, week: -1 };
  for (const k of Object.keys(e.cases)) if (e.cases[k].week >= 0 && s.week - e.cases[k].week > 8) delete e.cases[k];
  // A rival wants to buy one of your buildings.
  const mine = e.lots.filter((l) => l.status === 'owned' && l.stage === 'open');
  if (mine.length && chance(e, 0.06)) e.cooldowns[`offer:${pick(e, mine).id}`] = s.week;
}

function learn(s: GameState, id: string): void {
  const c = s.characters[id];
  if (c?.alive && c.attributes.business < 85) c.attributes.business += 1;
}

/* ---------------- the popup candidate ---------------- */

/** One economy event a week at most, offered to the shared popup pipeline. */
export function econEventSource(s: GameState): EventInstance | undefined {
  const e = s.econ;
  if (!e) return undefined;
  // A rival's offer on one of your buildings.
  for (const k of Object.keys(e.cooldowns)) {
    if (!k.startsWith('offer:')) continue;
    delete e.cooldowns[k];
    const ev = offerEvent(s, k.slice(6));
    if (ev) return ev;
  }
  // A short envelope.
  const pend = Object.entries(e.cases).find(([, c]) => c.week === -1);
  if (pend) {
    const [capoId, c] = pend;
    delete e.cases[capoId];
    const ev = buildShortEvent(s, { capoId, skimming: c.skimming, shortfall: c.shortfall, skim: 0 });
    if (ev) return ev;
  }
  // The books at a place don't add up.
  for (const k of Object.keys(e.cooldowns)) {
    if (!k.startsWith('skimflag:')) continue;
    delete e.cooldowns[k];
    const ev = skimEvent(s, k.slice(9));
    if (ev) return ev;
  }
  // A stop-work order on one of your sites.
  for (const k of Object.keys(e.cooldowns)) {
    if (!k.startsWith('stop:')) continue;
    delete e.cooldowns[k];
    const ev = stopWorkEvent(s, k.slice(5));
    if (ev) return ev;
  }
  // Someone on a club's staff wants something more.
  for (const k of Object.keys(e.cooldowns)) {
    if (!k.startsWith('staff:')) continue;
    delete e.cooldowns[k];
    const [, bid, sid] = k.split(':');
    const ev = staffEvent(s, bid, sid);
    if (ev) return ev;
  }
  return undefined;
}

function evBase(s: GameState, defId: string, title: string, text: string, priority = 30): Omit<EventInstance, 'choices' | 'defaultChoiceId'> {
  return { iid: `ev${s.nextId++}`, defId, title, text, week: s.week, mandatory: false, priority };
}

function offerEvent(s: GameState, lotId: string): EventInstance | undefined {
  const l = s.econ!.lots.find((x) => x.id === lotId && x.status === 'owned' && x.stage === 'open');
  if (!l) return undefined;
  const rivals = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  if (!rivals.length) return undefined;
  const r = rivals[s.week % rivals.length];
  const price = Math.round(marketValue(s, l) * 1.4 / 100) * 100;
  const label = `${FACTION_NAMES[r.id]} buys ${lotName(l)}`;
  return {
    ...evBase(s, 'econ_offer', `An offer for ${lotName(l)}`, `${FACTION_NAMES[r.id]} sends a lawyer with a check: ${fmtMoney(price)} for ${lotName(l)}, well over what it is worth. They want a foothold. Your people say the money is good and the neighbors will be worse.`),
    defaultChoiceId: 'refuse',
    choices: [
      { id: 'sell', label: `Sell for ${fmtMoney(price)}`, because: `sold ${lotName(l)} to ${FACTION_NAMES[r.id]}`, effects: [{ type: 'money', amount: price, label }, { type: 'econ', op: { op: 'lotSold', lotId: l.id, to: r.id, price }, label }, { type: 'influence', district: ZONES_BY_ID[l.zone].district ?? 'downtown', faction: r.id, amount: ZONES_BY_ID[l.zone].district ? 2 : 0, label }] },
      { id: 'refuse', label: 'Not for sale', because: `refused to sell ${lotName(l)} to ${FACTION_NAMES[r.id]}`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: -3, reason: 'Wouldn\'t sell', label }] },
      { id: 'insult', label: 'Send the lawyer back without his shoes', detail: 'Everyone hears about it.', because: `humiliated ${FACTION_NAMES[r.id]}'s lawyer`, effects: [{ type: 'respect', amount: 2, label }, { type: 'rivalOpinion', rival: r.id, amount: -12, reason: 'Humiliated our lawyer', label }] },
    ],
  };
}

function skimEvent(s: GameState, key: string): EventInstance | undefined {
  const e = s.econ!;
  const m = e.managers[key];
  if (!m || m.skimmed < 100) return undefined;
  const place = placeName(s, key);
  const back = Math.round(m.skimmed / 2);
  const label = `Skimming at ${place}`;
  return {
    ...evBase(s, 'econ_skim', `The books at ${place} don't add up`, `Your bookkeeper found it: ${m.name} has been taking from ${place} — about ${fmtMoney(m.skimmed)} since anyone looked.`, 32),
    actors: m.charId ? [m.charId] : undefined,
    defaultChoiceId: 'confront',
    choices: [
      { id: 'confront', label: 'Have a word: half back, and he stays', because: `confronted ${m.name} about skimming`, effects: [{ type: 'money', amount: back, label: `${label}: half paid back` }, { type: 'econ', op: { op: 'skimFound', key, recover: back }, label }] },
      { id: 'fire', label: 'Fire him', detail: 'Somebody else runs it; the place limps for a while.', because: `fired ${m.name}`, effects: [{ type: 'econ', op: { op: 'fireManager', key }, label }, ...(m.charId ? [{ type: 'opinion' as const, from: m.charId, to: s.playerId, amount: -20, reason: 'Fired me', decay: 1 }] : [])] },
      { id: 'slide', label: 'Let it slide', detail: 'Everybody wets his beak. He knows you know.', because: `let ${m.name}'s skimming slide`, effects: [{ type: 'econ', op: { op: 'trustManager', key, amount: 10 }, label }] },
    ],
  };
}

function staffEvent(s: GameState, bid: string, sid: string): EventInstance | undefined {
  const b = s.businesses.find((x) => x.id === bid && x.owner === 'player');
  const m = s.econ!.staff[bid]?.find((x) => x.id === sid);
  if (!b || !m || m.fate) return undefined;
  const want = staffAmbition(m);
  if (!want) return undefined;
  const label = `${b.name}: ${m.name}`;
  const ownsLabel = s.businesses.some((x) => x.owner === 'player' && x.kind === 'label');
  const leaveText = want.fate === 'own_club' ? 'opens her own place across town (competition)' : want.fate === 'rival_bar' ? 'opens a bar down the street (competition)' : want.fate === 'producer' ? (ownsLabel ? 'produces records for your label' : 'leaves to produce records in Philadelphia') : 'leaves for a club in Atlantic City';
  return {
    ...evBase(s, 'econ_staff', `${m.name} ${want.text}`, `${m.name}, ${ROLE_LABEL[m.role].toLowerCase()} at ${b.name} for ${Math.round((s.week - m.since) / 52 * 10) / 10} years, ${want.text}. Good people make a place; good people also leave.`, 26),
    defaultChoiceId: 'leave',
    choices: [
      ...(want.fate === 'manager' ? [{ id: 'promote', label: 'Give them the job: manager', because: `made ${m.name} manager of ${b.name}`, effects: [{ type: 'econ' as const, op: { op: 'staffFate' as const, bizId: bid, staffId: sid, fate: 'promote' as const }, label }] }] : []),
      { id: 'raise', label: 'A raise and a promise ($400)', detail: 'Stays, for now.', because: `kept ${m.name} at ${b.name} with a raise`, effects: [{ type: 'money', amount: -400, label }, { type: 'econ', op: { op: 'staffFate', bizId: bid, staffId: sid, fate: 'keep' }, label }], disabledReason: s.money < 400 ? 'Needs $400' : undefined },
      { id: 'leave', label: 'Wish them luck', detail: leaveText, because: `let ${m.name} go`, effects: [{ type: 'econ', op: { op: 'staffFate', bizId: bid, staffId: sid, fate: 'leave' }, label }] },
    ],
  };
}

/* ---------------- effect ops ---------------- */

export function placeName(s: GameState, key: string): string {
  if (key.startsWith('lot:')) {
    const l = s.econ?.lots.find((x) => `lot:${x.id}` === key);
    return l ? lotName(l) : 'a building';
  }
  return s.businesses.find((b) => b.id === key)?.name ?? 'a business';
}

export function applyEconOp(ctx: Ctx, op: EconOp, label: string): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  if (op.op === 'racket') { applyRacketOp(ctx, op, label); return; }
  switch (op.op) {
    case 'note':
      break;
    case 'skimFound': {
      const m = e.managers[op.key];
      if (!m) break;
      m.found = (m.found ?? 0) + m.skimmed;
      m.skimmed = 0;
      m.honesty = Math.min(100, m.honesty + 15);
      m.loyalty = Math.max(0, m.loyalty - 10);
      e.stats.skimsCaught++;
      break;
    }
    case 'fireManager': {
      const m = e.managers[op.key];
      if (m) {
        e.stats.skimsCaught += m.skimmed > 0 ? 1 : 0;
        ctx.log.push(`${m.name} is out at ${placeName(s, op.key)}.`);
      }
      delete e.managers[op.key];
      break;
    }
    case 'trustManager': {
      const m = e.managers[op.key];
      if (m) {
        m.loyalty = Math.min(100, m.loyalty + op.amount);
        m.skimmed = 0;
      }
      break;
    }
    case 'auditCapo': {
      const k = s.characters[op.charId];
      const c = e.cases[op.charId];
      if (!k?.alive) break;
      if (c?.skimming || (k.skimmed ?? 0) >= 250) {
        const back = Math.round(Math.min(Math.max(0, k.wealth), (k.skimmed ?? 0) / 2));
        if (back > 0) {
          k.wealth -= back;
          money(ctx, back, `${label}: the bookkeeper found it — he pays back ${fmtMoney(back)}`, 'kickup');
        }
        k.skimmed = 0;
        addOpinion(s, k.id, s.playerId, 'Caught me', -6, 1);
        ctx.log.push(`The bookkeeper went through ${shortName(k)}'s envelopes: he was skimming.`);
        addStory(s, k, 'The boss had his envelopes checked. They found the skim.');
        e.stats.skimsCaught++;
      } else {
        addOpinion(s, k.id, s.playerId, 'Checked and found me clean', 5, 1);
        ctx.log.push(`The bookkeeper went through ${shortName(k)}'s envelopes: it really was a bad month.`);
      }
      delete e.cases[op.charId];
      break;
    }
    case 'squeeze': {
      const k = s.characters[op.charId];
      const c = e.cases[op.charId];
      if (!k?.alive) break;
      if (c?.skimming) {
        addOpinion(s, k.id, s.playerId, 'Squeezed me', -4, 1);
        k.skimmed = 0;
      } else {
        addOpinion(s, k.id, s.playerId, 'Called me a thief', -15, 1);
        changeMeter(s, k.id, s.playerId, 'grievance', 10);
      }
      delete e.cases[op.charId];
      break;
    }
    case 'credit': {
      const k = s.characters[op.charId];
      if (k) addStory(s, k, `Took down a ${fmtMoney(op.amount)} score.`);
      if (k) noteScore(ctx, k.id, op.amount, 'a big score');
      break;
    }
    case 'zone': {
      const z = (e.zones[op.zone] ??= { rep: 0, trust: 0 });
      z.rep = Math.max(0, Math.min(100, z.rep + (op.rep ?? 0)));
      z.trust = Math.max(0, Math.min(100, z.trust + (op.trust ?? 0)));
      break;
    }
    case 'staffFate': {
      const list = e.staff[op.bizId] ?? [];
      const m = list.find((x) => x.id === op.staffId);
      const b = s.businesses.find((x) => x.id === op.bizId);
      if (!m || !b) break;
      e.stats.staffMoves++;
      if (op.fate === 'keep') {
        m.ambition = Math.max(0, m.ambition - 40);
        break;
      }
      const want = staffAmbition(m);
      if (op.fate === 'promote') {
        e.managers[b.id] = { source: 'pro', name: m.name, skill: Math.min(95, m.skill + 10), loyalty: 70, honesty: 70, salary: 20 + Math.round(m.skill * 0.3), share: 0.05, oversight: 'monthly', since: s.week, skimmed: 0 };
        m.fate = `Became manager (wk ${s.week})`;
      } else {
        const r = racketMut(s, b);
        if (want?.fate === 'own_club') { r.competition = Math.min(60, (r.competition ?? 0) + 12); m.fate = `Opened her own club (wk ${s.week})`; }
        else if (want?.fate === 'rival_bar') { r.competition = Math.min(60, (r.competition ?? 0) + 8); m.fate = `Opened a bar down the street (wk ${s.week})`; }
        else if (want?.fate === 'producer') {
          const lab = s.businesses.find((x) => x.owner === 'player' && x.kind === 'label');
          if (lab) { const lr = racketMut(s, lab); lr.contacts = (lr.contacts ?? 0) + 1; m.fate = `Produces records for ${lab.name} (wk ${s.week})`; }
          else m.fate = `Went to produce records in Philadelphia (wk ${s.week})`;
        } else m.fate = `Left (wk ${s.week})`;
      }
      ctx.log.push(`${m.name}: ${m.fate}.`);
      // Someone new is hired in their place.
      list.push(newStaff(s, m.role));
      e.staff[op.bizId] = list.filter((x) => !x.fate).concat(list.filter((x) => x.fate).slice(-4));
      break;
    }
    case 'competition': {
      const b = s.businesses.find((x) => x.id === op.bizId);
      if (b) { const r = racketMut(s, b); r.competition = Math.max(0, Math.min(80, (r.competition ?? 0) + op.amount)); }
      break;
    }
    case 'job':
      if (op.salary > 0) e.jobs[op.charId] = op.salary;
      else delete e.jobs[op.charId];
      break;
    case 'gift':
      e.gifts.push({ week: s.week, to: op.to, giftId: op.giftId, value: op.value, fit: op.fit });
      if (e.gifts.length > 200) e.gifts = e.gifts.slice(-200);
      e.stats.gifts++;
      {
        const g = GIFTS_BY_ID[op.giftId];
        if (g?.team) e.tickets.push({ team: g.team, holderId: op.to, since: s.week, box: !!g.box });
      }
      break;
    case 'ticket':
      e.tickets.push({ team: op.team, holderId: op.holderId, since: s.week, box: op.box });
      break;
    case 'lotSold': {
      const l = e.lots.find((x) => x.id === op.lotId);
      if (!l) break;
      if (l.bizId) s.businesses = s.businesses.filter((b) => b.id !== l.bizId);
      delete l.bizId;
      l.status = op.to === 'private' ? 'private' : 'rival';
      l.owner = op.to;
      delete l.operating;
      delete e.managers[`lot:${l.id}`];
      if (op.to !== 'private' && op.to !== 'player') e.stats.rivalBuys++;
      break;
    }
    case 'tenant': {
      const l = e.lots.find((x) => x.id === op.lotId);
      if (l) l.tenant = op.name;
      break;
    }
    case 'clearStop': {
      const l = e.lots.find((x) => x.id === op.lotId);
      if (l) { delete l.stopWork; delete l.stalled; }
      break;
    }
    case 'bribeStop': {
      const l = e.lots.find((x) => x.id === op.lotId);
      const insp = permitAuthority(s).inspector;
      if (!l) break;
      if (insp && hasTrait(insp, 'Honest')) {
        addEvidence(s, s.characters[s.playerId], 3);
        heat(ctx, 'local', 2, `${label}: the inspector reported the envelope`, 'event');
        ctx.log.push(`${insp.firstName} ${insp.lastName} is honest. He reported the envelope.`);
      } else {
        delete l.stopWork;
        delete l.stalled;
        if (l.permit) l.permit.bribed = true;
      }
      break;
    }
    case 'loanApp':
      decideApp(ctx, op.id, op.verdict, op.amt ? { amt: op.amt } : {});
      break;
    case 'outbid': {
      const l = e.lots.find((x) => x.id === op.lotId);
      if (!l || !l.bidder) break;
      l.status = 'rival';
      l.owner = l.bidder;
      delete l.bidder;
      e.stats.outbid++;
      ctx.log.push(`${FACTION_NAMES[l.owner as RivalId]} outbid you for ${lotName(l)}.`);
      break;
    }
  }
}

export function describeEconOp(s: GameState, op: EconOp): string | undefined {
  switch (op.op) {
    case 'note': return op.text;
    case 'racket': return describeRacketOp(s, op);
    case 'skimFound': return 'He stays, on a short leash';
    case 'fireManager': return `Fire ${s.econ?.managers[op.key]?.name ?? 'the manager'}`;
    case 'trustManager': return 'He keeps his job; the skim is forgiven';
    case 'auditCapo': return 'The bookkeeper checks his envelopes (you find out which it was)';
    case 'squeeze': return 'He pays out of his pocket; how he takes it depends on whether he was really short';
    case 'credit': return `${s.characters[op.charId]?.firstName ?? '?'} gets the credit`;
    case 'zone': return `${ZONES_BY_ID[op.zone]?.name}: ${op.rep ? `appreciation ${op.rep > 0 ? '+' : ''}${op.rep}` : ''}${op.trust ? ` trust ${op.trust > 0 ? '+' : ''}${op.trust}` : ''}`;
    case 'staffFate': return op.fate === 'promote' ? 'Promoted to manager' : op.fate === 'keep' ? 'Stays' : 'Leaves';
    case 'competition': return `Competition ${op.amount > 0 ? '+' : ''}${op.amount}%`;
    case 'job': return op.salary > 0 ? `${fmtMoney(op.salary)}/wk on your payroll, ongoing` : 'Off the payroll';
    case 'gift': return undefined;
    case 'ticket': return `${TEAMS[op.team].name} season tickets`;
    case 'lotSold': return 'The building changes hands';
    case 'tenant': return undefined;
    case 'clearStop': return 'Work resumes';
    case 'bribeStop': return 'If he takes it, work resumes';
    case 'outbid': return 'The rival gets the lot';
    case 'loanApp': return op.verdict === 'deny' ? 'He is turned down' : `$${(op.amt ?? 0).toLocaleString('en-US')} of Family money lent; paid back weekly`;
  }
}

/* ---------------- player orders ---------------- */

const noop = (title: string, why: string): ActionPreview => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' });
const note = (text: string): Effect => ({ type: 'econ', op: { op: 'note', text } });

export function marketValue(s: GameState, l: Lot): number {
  const z = ZONES_BY_ID[l.zone];
  const u = l.use ? USES_BY_ID[l.use] : undefined;
  const land = 1500 * z.land;
  const bldg = u && l.stage === 'open' ? u.cost * z.land * 0.85 * (0.6 + 0.4 * l.condition / 100) * (l.renovated ? 1.1 : 1) : (l.invested ?? 0) * 0.7;
  return Math.round((land + bldg) * inflation(s) / 50) * 50;
}

export function previewEcon(s: GameState, a: EconAction): ActionPreview {
  const e = s.econ;
  switch (a.type) {
    case 'upgrade': {
      const b = s.businesses.find((x) => x.id === a.bizId && x.owner === 'player');
      if (!b) return noop('Upgrade', 'Not yours');
      const st = nextStep(s, b);
      if (!st) return noop(`Upgrade ${b.name}`, 'Nothing left to build on');
      const title = `${b.name}: ${st.name}`;
      const why = (st.minYear ?? 0) > s.date.y ? `Not before ${st.minYear}` : s.money < st.cost ? `Needs ${fmtMoney(st.cost)}` : !isOpen(s, b) ? 'Padlocked' : undefined;
      return {
        title, detail: st.blurb,
        effects: [{ type: 'money', amount: -st.cost, label: title }, note(`Take ${st.income >= 0 ? '+' : ''}${Math.round(st.income * 100)}%${st.heat ? `, heat ${st.heat > 0 ? '+' : ''}${Math.round(st.heat * 100)}%` : ''}`)],
        cost: st.cost, because: `put money into ${b.name} (${st.name.toLowerCase()})`, disabledReason: why, category: 'event',
      };
    }
    case 'collect': {
      const b = s.businesses.find((x) => x.id === a.bizId && x.owner === 'player');
      if (!b) return noop('Collect', 'Not yours');
      const c = collectPreview(s, b);
      const cost = collectCost(b);
      const title = `${b.name}: ${c.text.split(' (')[0].split(':')[0]}`;
      const effects: Effect[] = [];
      if (c.amount) effects.push({ type: 'money', amount: c.amount, label: `${b.name}: markers collected` });
      if (cost) effects.push({ type: 'money', amount: -cost, label: title });
      if (c.heat) effects.push({ type: 'heat', bar: 'local', amount: c.heat, label: title });
      effects.push(note(c.text));
      return { title, detail: c.detail ?? c.text, effects, cost, because: c.text.charAt(0).toLowerCase() + c.text.slice(1), disabledReason: c.why, category: 'event', verb: c.verb };
    }
    case 'deal': return previewDeal(s, a.target, a.terms);
    case 'bank': return previewBank(s, a.cmd);
    case 'home': return previewHome(s, a.cmd);
    case 'racket': return previewRacket(s, a.cmd);
    case 'setup': case 'spotCall': case 'placeAsk': return previewKickup(s, a);
    case 'empire': return previewEmpire(s, a.cmd);
    case 'luxBuy': case 'luxSell': return previewLux(s, a);
    case 'rename': {
      const nm = a.name.trim().slice(0, 40);
      const lot = a.key.startsWith('lot:') ? e?.lots.find((l) => `lot:${l.id}` === a.key) : undefined;
      const b = s.businesses.find((x) => x.id === a.key && x.owner === 'player');
      const title = `Rename ${placeName(s, a.key)} "${nm}"`;
      const why = !nm ? 'No name' : !b && !(lot && (lot.status === 'owned' || lot.status === 'leased')) ? 'Not yours' : undefined;
      return { title, detail: 'A new sign goes up over the door.', effects: [note(`The sign reads "${nm}"`)], cost: 0, because: `renamed ${placeName(s, a.key)} "${nm}"`, disabledReason: why, category: 'event' };
    }
    case 'buyLot': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      if (!l) return noop('Buy property', 'No such lot');
      const gw = a.going ? goodwill(s, l) : 0;
      const price = l.price + gw;
      const z = ZONES_BY_ID[l.zone];
      const title = a.going ? `Buy the business: ${lotName(l)}` : `Buy ${l.use ? 'the building' : 'the land'}: ${lotName(l)}`;
      const u = l.use ? USES_BY_ID[l.use] : undefined;
      const effects: Effect[] = [{ type: 'money', amount: -price, label: title }];
      if (z.rival) effects.push({ type: 'rivalOpinion', rival: z.rival as RivalId, amount: -3, reason: 'Buying on our turf', label: title });
      effects.push(note(a.going ? `You run ${u?.name.toLowerCase()} (the old owner stays on as manager)` : l.tenant ? `${l.tenant} pays you ${fmtMoney(l.rent)}/wk rent` : l.use ? 'An empty building' : 'Vacant land: build on it'));
      const why = l.status !== 'sale' ? (l.status === 'rival' ? `${FACTION_NAMES[l.owner as RivalId] ?? 'A rival'} owns it` : 'Not for sale') : a.going && !l.tenant ? 'No business inside to buy' : s.money < price ? `Needs ${fmtMoney(price)}` : undefined;
      const rival = l.bidder ? s.rivals.find((r) => r.id === l.bidder) : undefined;
      const acceptance = rival ? lotBidOdds(s, rival) : undefined;
      return {
        title, detail: `${z.name}. ${a.going ? `Building ${fmtMoney(l.price)} + goodwill ${fmtMoney(gw)}.` : ''}${l.use && l.stage === 'open' ? ` Built ${l.builtYear}, condition ${Math.round(l.condition)}%.` : ''}${rival ? ` ${FACTION_NAMES[rival.id]} is bidding for it too.` : ''}`.trim(),
        effects, cost: price, because: `bought ${lotName(l)}`, disabledReason: why, category: 'event',
        acceptance, refuseEffects: rival ? [{ type: 'econ', op: { op: 'outbid', lotId: l.id }, label: `${title}: outbid` }] : undefined,
      };
    }
    case 'leaseLot': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      if (!l) return noop('Lease', 'No such lot');
      const title = `Lease the storefront at ${l.address}`;
      const dep = l.rent * 4;
      return {
        title, detail: `${fmtMoney(l.rent)}/wk. Fit it out as any shop; a fit-out costs half and takes half as long.`,
        effects: [{ type: 'money', amount: -dep, label: `${title}: a month's deposit` }, note(`${fmtMoney(l.rent)}/wk lease`)],
        cost: dep, because: `leased ${l.address}`, disabledReason: l.status !== 'lease' ? 'Not for lease' : s.money < dep ? `Needs ${fmtMoney(dep)}` : undefined, category: 'event',
      };
    }
    case 'build': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      const u = USES_BY_ID[a.use];
      if (!l || !u) return noop('Build', 'Nothing to build');
      const cost = buildCost(l, u, s);
      const weeks = scheduleWeeks(s, l, u);
      const sc = supplyChain(s);
      const title = `Build: ${u.name} at ${l.address}`;
      const first = Math.round(cost * STAGE_COST.permits);
      const z = ZONES_BY_ID[l.zone];
      const fits = u.zones ? u.zones.includes(l.zone) : true;
      const why = u.npcOnly ? 'Only the city builds those' : (l.status !== 'owned' && l.status !== 'leased') ? 'You don\'t own it' : (l.use && l.stage === 'open') ? 'Something already stands there' : underConstruction(l) ? 'Already building' : !fits ? `Not in ${z.name}` : (u.minYear ?? 0) > s.date.y ? `Not before ${u.minYear}` : s.money < first ? `Needs ${fmtMoney(first)} to start` : undefined;
      const earn = u.biz ? `becomes a ${CATALOG[u.biz].name.toLowerCase()}` : `~${fmtMoney((u.rev - u.exp) * inflation(s))}/wk in an average week${u.seasonal ? ` (seasonal: ×${z.season[0]} in summer here)` : ''}`;
      return {
        title, detail: `About ${weeks} weeks from permits to opening (the inspector and ${permitAuthority(s).zoning} first), ${fmtMoney(cost)} paid stage by stage. Then it ${earn}.${sc.owned.length ? ` Your own ${sc.owned.join(', ')}: −${Math.round(sc.cost * 100)}% cost, −${Math.round(sc.time * 100)}% time.` : ' Owning a construction company, a concrete plant, a lumber yard and trucks makes building cheaper and faster.'}`,
        effects: [note(`Construction: ~${weeks} weeks, ${fmtMoney(cost)} over 6 stages`)],
        cost: first, because: `broke ground on ${u.name.toLowerCase()} at ${l.address}`, disabledReason: why, category: 'event',
      };
    }
    case 'renovate': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      const u = l?.use ? USES_BY_ID[l.use] : undefined;
      if (!l || !u) return noop('Renovate', 'Nothing to renovate');
      const cost = Math.round(u.cost * 0.3 * ZONES_BY_ID[l.zone].land * inflation(s) / 50) * 50;
      const title = `Renovate ${lotName(l)}`;
      return {
        title, detail: `Condition ${Math.round(l.condition)}% → 100%, and it looks new again (+10% to the take).`,
        effects: [{ type: 'money', amount: -cost, label: title }, note('Condition 100%, +10% take')],
        cost, because: `renovated ${lotName(l)}`, disabledReason: l.status !== 'owned' ? 'You don\'t own it' : l.stage !== 'open' ? 'Not built yet' : l.condition >= 90 && l.renovated && s.date.y - l.renovated < 10 ? 'Renovated recently' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined, category: 'event',
      };
    }
    case 'sellLot': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      if (!l) return noop('Sell', 'No such lot');
      const v = marketValue(s, l);
      const title = `Sell ${lotName(l)}`;
      return {
        title, detail: `Market value ${fmtMoney(v)}.${l.bizId ? ' The business inside goes with it.' : ''}`,
        effects: [{ type: 'money', amount: v, label: title }, { type: 'econ', op: { op: 'lotSold', lotId: l.id, to: 'private', price: v }, label: title }],
        cost: 0, because: `sold ${lotName(l)}`, disabledReason: l.status === 'leased' ? 'You only lease it' : l.status !== 'owned' ? 'Not yours' : underConstruction(l) ? 'Finish building first' : undefined, category: 'event',
      };
    }
    case 'permits': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      if (!l) return noop('Permits', 'No such lot');
      const title = `Call in a favor at City Hall: permits for ${l.address}`;
      return {
        title, effects: [{ type: 'favor', amount: -1, label: title }, note('Zoning and the inspector sign this week')],
        cost: 0, because: `called in a favor for building permits`, disabledReason: l.stage !== 'permits' ? 'Not waiting on permits' : s.favors < 1 ? 'No favors to call in' : undefined, category: 'event',
      };
    }
    case 'bribeInspector': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      const insp = permitAuthority(s).inspector;
      if (!l) return noop('Inspector', 'No such lot');
      const cost = inspectorBribe(s, l);
      const title = `An envelope for ${insp ? `${insp.firstName} ${insp.lastName}` : 'the building inspector'}: ${l.address}`;
      const reasons = [{ label: 'Base', value: 55 }, ...(insp ? [
        ...(hasTrait(insp, 'Honest') ? [{ label: 'Honest', value: -45 }] : []),
        ...(hasTrait(insp, 'Greedy') ? [{ label: 'Greedy', value: 25 }] : []),
        ...((e?.stats.inspectorPaid ?? 0) > 0 ? [{ label: 'Took one before', value: 20 }] : []),
      ] : []), ...(s.heat.local > 60 ? [{ label: `Local heat ${s.heat.local}`, value: -15 }] : [])];
      const sum = reasons.reduce((x, r) => x + r.value, 0);
      const waiting = l.stage === 'permits' && (l.permit?.inspector ?? 0) > 0;
      return {
        title, detail: 'His permit signed today, or a stop-work order lifted. Bribed sites also pass his inspections more easily.',
        effects: [{ type: 'money', amount: -cost, label: title }, note('Permit signed / stop-work lifted')],
        acceptance: { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons },
        refuseEffects: insp && hasTrait(insp, 'Honest') ? [{ type: 'evidence', charId: s.playerId, amount: 3, label: `${title}: he reported it` }, { type: 'heat', bar: 'local', amount: 2, label: `${title}: he reported it` }] : [{ type: 'money', amount: -Math.round(cost / 4), label: `${title}: refused (a lunch on you anyway)` }],
        cost, because: `paid off the building inspector at ${l.address}`,
        disabledReason: !(l.status === 'owned' || l.status === 'leased') ? 'Not yours' : !waiting && !l.stopWork ? 'Nothing he is holding up' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined,
        category: 'event', warning: insp && hasTrait(insp, 'Honest') ? 'He is honest. He may report it.' : undefined,
      };
    }
    case 'puppetPermit': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      const auth = permitAuthority(s);
      const p = auth.puppet?.(s);
      const title = `${p ? `${p.firstName} ${p.lastName}` : 'Your man on the commission'} pushes the zoning through: ${l?.address ?? '?'}`;
      return {
        title, detail: `An official who owes you sits on ${auth.zoning}. The variance passes at the next meeting, or sooner.`,
        effects: [note('Zoning approved this week')], cost: 0, because: 'had the zoning pushed through',
        disabledReason: !l ? 'No such lot' : !p ? `No official of yours on ${auth.zoning}` : l.stage !== 'permits' || !(l.permit?.zoning ?? 0) ? 'Zoning is not holding it up' : undefined, category: 'event',
      };
    }
    case 'fixCode': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      if (!l) return noop('Fix', 'No such lot');
      const cost = fixCost(s, l);
      const title = `Fix the code violations at ${l.address}`;
      return { title, detail: l.stopWork?.reason, effects: [{ type: 'money', amount: -cost, label: title }, note('Stop-work order lifted')], cost, because: `fixed the code at ${l.address}`, disabledReason: !l.stopWork ? 'No stop-work order' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined, category: 'event' };
    }
    case 'slowRival': {
      const l = e?.lots.find((x) => x.id === a.lotId);
      if (!l) return noop('Slow', 'No such lot');
      const rival = l.owner !== 'private' && l.owner !== 'city' && l.owner !== 'player' ? (l.owner as RivalId) : undefined;
      const title = `Slow down ${rival ? FACTION_NAMES[rival] : 'the'} build at ${l.address}`;
      return {
        title, detail: 'The concrete truck is late, the lumber is short, the hod carriers call in sick. Four weeks lost.',
        effects: [note('Their build stalls 4 weeks'), { type: 'heat', bar: 'local', amount: 1, label: title }, ...(rival ? [{ type: 'rivalOpinion' as const, rival, amount: -5, reason: 'Sabotaged our construction', label: title }] : [])],
        cost: 0, because: `slowed down a rival's construction at ${l.address}`,
        disabledReason: !underConstruction(l) || l.status === 'owned' || l.status === 'leased' ? 'Not a rival build' : canSlow(s) ?? ((e?.cooldowns[`slow:${l.id}`] ?? -99) > s.week - 8 ? 'Already slowed' : undefined), category: 'event',
      };
    }
    case 'bid': {
      const t = e?.tenders.find((x) => x.id === a.contractId);
      if (!t) return noop('Bid', 'No such job');
      const title = `Bid on the city job: ${t.name}`;
      const odds = bidOdds(s);
      return {
        title, detail: `${fmtMoney(t.value)} over ${t.weeks} weeks; your margin about 15%. Bids close week ${t.closes}.`,
        effects: [note(`~${fmtMoney(Math.round(t.value * 0.15 / t.weeks))}/wk for ${t.weeks} wk`)], acceptance: odds,
        refuseEffects: [{ type: 'econ', op: { op: 'note', text: 'Someone else got it' }, label: title }],
        cost: 0, because: `bid on the city's ${t.name.toLowerCase()}`,
        disabledReason: !supplyChain(s).owned.includes('construction') ? 'You need a construction company' : undefined, category: 'event',
      };
    }
    case 'manager': {
      const place = placeName(s, a.key);
      let m: Manager | undefined;
      if (a.source === 'pro') {
        const p = proCandidates(s, a.key)[a.pro ?? 0];
        if (p) m = managerFromPro(s, p);
      } else {
        const c = a.charId ? s.characters[a.charId] : undefined;
        if (c) { m = managerFromChar(s, c, a.source); m.effort = workload(s, c, a.key).effort; }
      }
      if (!m) return noop(`Manager for ${place}`, 'Nobody to put in');
      const title = `${m.name} runs ${place}`;
      const busy = a.charId ? managing(s, a.charId) : undefined;
      return {
        title, detail: `${SOURCE_LABEL[a.source]} · skill ${m.skill} · salary ${fmtMoney(m.salary)}/wk${m.share ? ` · ${Math.round(m.share * 100)}% of the take` : ''}`,
        effects: [note(`Take ×${managerMult(m).toFixed(2)} · ${fmtMoney(m.salary)}/wk`)],
        cost: 0, because: `put ${m.name} in charge of ${place}`, disabledReason: busy && busy !== a.key ? 'Already runs another place' : undefined, category: 'event',
      };
    }
    case 'oversight': {
      const m = managerOf(s, a.key);
      const title = `${OVERSIGHT[a.level].name} oversight at ${placeName(s, a.key)}`;
      return { title, detail: OVERSIGHT[a.level].text, effects: [note(`${fmtMoney(OVERSIGHT[a.level].cost)}/wk of the bookkeeper's time`)], cost: 0, because: `set ${a.level.replace('_', '-')} oversight at ${placeName(s, a.key)}`, disabledReason: !m ? 'No manager' : m.oversight === a.level ? 'Already' : undefined, category: 'event' };
    }
    case 'audit': {
      const m = managerOf(s, a.key);
      const title = `Audit the books at ${placeName(s, a.key)}`;
      return { title, detail: 'An accountant from Philadelphia goes through everything. Whatever was taken, you find out; half comes back.', effects: [{ type: 'money', amount: -250, label: title }, note('Reveals any skim; half recovered')], cost: 250, because: `audited ${placeName(s, a.key)}`, disabledReason: !m ? 'No manager' : s.money < 250 ? 'Needs $250' : undefined, category: 'event' };
    }
    case 'assistant': {
      const m = managerOf(s, a.key);
      const c = a.charId ? s.characters[a.charId] : undefined;
      const title = c ? `${c.firstName} learns the trade at ${placeName(s, a.key)}` : `No assistant at ${placeName(s, a.key)}`;
      return { title, detail: 'An adult child of the house as the manager\'s assistant: learns business month by month, and is a second pair of eyes on the books.', effects: [note('Business skill grows; less skimming')], cost: 0, because: c ? `put ${c.firstName} to work at ${placeName(s, a.key)}` : 'removed an assistant', disabledReason: !m ? 'No manager' : c && managing(s, c.id) ? 'Already working somewhere' : undefined, category: 'event' };
    }
    case 'hq': {
      const info = HQ_INFO[a.kind];
      const cur = e?.hq.kind ?? 'social';
      const b = a.bizId ? s.businesses.find((x) => x.id === a.bizId) : undefined;
      const title = `Headquarters: ${a.kind === 'restaurant' && b ? `the back of ${b.name}` : info.name.toLowerCase()}`;
      const effects: Effect[] = [];
      if (info.cost) effects.push({ type: 'money', amount: -info.cost, label: title });
      effects.push(note(`Bug risk ×${info.bug} · crew morale ${info.morale >= 0 ? '+' : ''}${info.morale}`));
      const why = cur === a.kind && (a.kind !== 'restaurant' || e?.hq.bizId === a.bizId) ? 'Already there' : a.kind === 'restaurant' && !b ? 'You need a restaurant' : s.money < info.cost ? `Needs ${fmtMoney(info.cost)}` : undefined;
      return { title, detail: info.blurb, effects, cost: info.cost, because: `moved headquarters to ${a.kind === 'restaurant' && b ? `the back of ${b.name}` : info.name.toLowerCase()}`, disabledReason: why, category: 'event' };
    }
    case 'sweep': {
      const title = 'Sweep the HQ for bugs';
      return { title, detail: `An ex-phone-company man with a box of tubes. Finds a bug ${Math.round(SWEEP_FIND * 100)}% of the time, if there is one.`, effects: [{ type: 'money', amount: -SWEEP_COST, label: title }], cost: SWEEP_COST, because: 'had the headquarters swept for bugs', disabledReason: s.money < SWEEP_COST ? `Needs ${fmtMoney(SWEEP_COST)}` : e?.hq.lastSweep !== undefined && s.week - e.hq.lastSweep < 2 ? 'Swept last week' : undefined, category: 'event' };
    }
    case 'gift': {
      const g = GIFTS_BY_ID[a.giftId];
      const c = s.characters[a.to];
      if (!g || !c) return noop('Gift', 'No such gift');
      const price = giftPrice(s, g);
      const r = giftOpinion(s, c, g, price);
      const title = `Gift: ${g.name} for ${c.firstName} ${c.lastName}`;
      const pp = pocketPrice(s, price, title);
      const effects: Effect[] = [
        ...pp.effects,
        { type: 'opinion', from: c.id, to: s.playerId, amount: r.opinion, reason: r.fit < 0 ? `An awkward gift (${g.name.toLowerCase()})` : `Gave me ${g.name.toLowerCase()}`, decay: 1, label: title },
        { type: 'meter', from: c.id, to: s.playerId, meter: 'trust', amount: r.trust, label: title },
        { type: 'econ', op: { op: 'gift', to: c.id, giftId: g.id, fit: r.fit, value: price }, label: title },
      ];
      return {
        title, detail: r.reasons.map((x) => `${x.label} ${x.value >= 0 ? '+' : ''}${x.value}`).join(' · '),
        effects, cost: price, pot: 'pocket', because: `gave ${c.firstName} ${g.name.toLowerCase()}`,
        disabledReason: !c.alive ? 'Dead' : c.id === s.playerId ? 'For yourself? Buy it yourself' : !giftAvailable(g, s.date.y) ? 'Not available this year' : pp.why,
        category: 'event', acceptance: undefined,
      };
    }
    case 'project': {
      const p = PROJECTS_BY_KIND[a.kind];
      const z = ZONES_BY_ID[a.zone];
      if (!p || !z) return noop('Community project', 'No such project');
      const cost = Math.round(p.cost * inflation(s) / 50) * 50;
      const title = `Community: ${p.name.toLowerCase()} in ${z.name}`;
      const busy = (e?.projects ?? []).some((x) => !x.done && x.kind === p.kind && x.zone === a.zone);
      const why = busy ? 'Already under way' : p.months && !p.months.includes(s.date.m) ? 'Wrong time of year' : (e?.projects ?? []).filter((x) => !x.done).length >= 3 ? 'Three projects at once is plenty' : s.money < cost / p.weeks ? 'Not enough money' : undefined;
      return {
        title, detail: `${fmtMoney(cost)} over ${p.weeks} week${p.weeks > 1 ? 's' : ''}. When it's done: appreciation +${p.rep}, trust +${trustGain(s, p.rep)}, respect +${p.respect}.`,
        effects: [note(`${fmtMoney(Math.round(cost / p.weeks))}/wk for ${p.weeks} wk`), note(`${z.name}: appreciation +${p.rep}, trust +${trustGain(s, p.rep)}`)],
        cost: Math.round(cost / p.weeks), because: `paid for ${p.name.toLowerCase()} in ${z.name}`, disabledReason: why, category: 'event',
      };
    }
    case 'leverage': {
      const c = s.characters[a.to];
      const L = LEVERAGE[a.mode];
      if (!c || !L) return noop('Leverage', 'Nobody');
      const cost = Math.round(L.cost(s, c) * inflation(s) / 10) * 10;
      const w = a.withId ? s.characters[a.withId] : undefined;
      const title = a.mode === 'introduce' ? `Introduce ${c.firstName} ${c.lastName} to ${w ? `${w.firstName} ${w.lastName}` : '?'}` : `${L.name} for ${c.firstName} ${c.lastName}`;
      const prior = (e?.gifts ?? []).filter((g) => g.to === c.id && g.giftId.startsWith('lev:')).length;
      const strong = !!c.office && prior >= 2 && a.mode !== 'invite' && a.mode !== 'introduce';
      const effects: Effect[] = [];
      if (a.mode === 'job') effects.push({ type: 'econ', op: { op: 'job', charId: c.id, salary: cost }, label: title });
      else effects.push({ type: 'money', amount: -cost, label: title });
      effects.push({ type: 'opinion', from: c.id, to: s.playerId, amount: L.opinion, reason: a.mode === 'introduce' ? 'Made an introduction for me' : a.mode === 'invite' ? 'A fine evening' : `${L.name}`, decay: 1, label: title });
      if (a.mode === 'introduce' && w) {
        effects.push({ type: 'opinion', from: c.id, to: w.id, amount: 8, reason: 'We were introduced', decay: 1, label: title });
        effects.push({ type: 'opinion', from: w.id, to: c.id, amount: 8, reason: 'We were introduced', decay: 1, label: title });
      }
      if (L.hook) effects.push({ type: 'hook', targetId: c.id, strong, reason: `${strong ? 'Has taken from you again and again' : `Took ${L.name.toLowerCase()} from you`}`, label: title });
      effects.push({ type: 'econ', op: { op: 'gift', to: c.id, giftId: `lev:${a.mode}`, fit: 0, value: cost }, label: title });
      const reports = hasTrait(c, 'Honest') && !!c.office && L.hook;
      const refuse: Effect[] = reports
        ? [{ type: 'evidence', charId: s.playerId, amount: 4, label: `${title}: he reported it` }, { type: 'heat', bar: 'local', amount: 2, label: `${title}: he reported it` }]
        : [{ type: 'opinion', from: c.id, to: s.playerId, amount: -3, reason: 'Tried to buy me', decay: 1, label: `${title}: refused` }];
      const why = !c.alive ? 'Dead' : c.id === s.playerId ? 'Yourself' : a.mode === 'introduce' && (!w || !w.alive || w.id === c.id) ? 'Introduce him to whom?' : a.mode === 'job' && e?.jobs[c.id] ? 'Already on a payroll' : a.mode !== 'job' && s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined;
      return {
        title, detail: `${L.blurb}${a.mode === 'introduce' ? ' Two adults meet; what they make of each other is up to them.' : ''}`,
        effects, refuseEffects: refuse, acceptance: leverageOdds(s, c, a.mode), cost: a.mode === 'job' ? 0 : cost,
        because: a.mode === 'introduce' ? `introduced ${c.firstName} to ${w?.firstName ?? 'a friend'}` : `offered ${c.firstName} ${L.name.toLowerCase()}`,
        disabledReason: why, category: 'event', warning: reports ? 'He is honest and holds office: if he says no, he may report it.' : undefined,
      };
    }
    case 'invite': {
      const c = s.characters[a.to];
      const t = houseTickets(s).find((x) => x.team === a.team);
      const title = `Take ${c?.firstName ?? '?'} to the ${TEAMS[a.team].name} game`;
      if (!c) return noop(title, 'Nobody');
      const amt = t?.box ? 10 : 6;
      return {
        title, detail: t?.box ? 'The box: a waiter, a view and nobody listening.' : 'Two seats, hot dogs and four hours to talk.',
        effects: [{ type: 'money', amount: -20, label: title }, { type: 'opinion', from: c.id, to: s.playerId, amount: amt, reason: `Took me to the ${TEAMS[a.team].name}`, decay: 1, label: title }, { type: 'meter', from: c.id, to: s.playerId, meter: 'trust', amount: 3, label: title }],
        cost: 20, because: `took ${c.firstName} to the ${TEAMS[a.team].name} game`,
        disabledReason: !t ? 'The house has no season tickets for them' : !teamPlaying(a.team, s) ? 'Not their season' : !c.alive ? 'Dead' : (s.econ?.cooldowns[`invite:${c.id}`] ?? -99) > s.week - 4 ? 'Went to a game together recently' : undefined, category: 'event',
      };
    }
  }
}

export function commitEcon(ctx: Ctx, a: EconAction): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  switch (a.type) {
    case 'upgrade': {
      const b = s.businesses.find((x) => x.id === a.bizId);
      if (!b) break;
      const st = nextStep(s, b);
      const r = racketMut(s, b);
      r.tier++;
      if (st?.runners) r.runners = (r.runners ?? 6) + st.runners;
      if (st?.placements) r.placements = (r.placements ?? 20) + st.placements;
      if (st?.contacts) r.contacts = (r.contacts ?? 1) + st.contacts;
      applyTreeHeat(s, b);
      e.stats.upgrades++;
      break;
    }
    case 'collect': {
      const b = s.businesses.find((x) => x.id === a.bizId);
      if (b) commitCollect(ctx, b);
      break;
    }
    case 'deal': commitDeal(ctx, a.target, a.terms); break;
    case 'racket': commitRacket(ctx, a.cmd); break;
    case 'setup': case 'spotCall': case 'placeAsk': commitKickup(ctx, a); break;
    case 'empire': commitEmpire(ctx, a.cmd); break;
    case 'luxBuy': case 'luxSell': commitLux(ctx, a); break;
    case 'rename': {
      const nm = a.name.trim().slice(0, 40);
      const lot = a.key.startsWith('lot:') ? e.lots.find((l) => `lot:${l.id}` === a.key) : undefined;
      if (lot) lot.name = nm;
      const b = s.businesses.find((x) => x.id === (lot?.bizId ?? a.key));
      if (b) b.name = nm;
      if (b && !lot) { const l2 = e.lots.find((l) => l.bizId === b.id); if (l2) l2.name = nm; }
      break;
    }
    case 'bank': commitBank(ctx, a.cmd); break;
    case 'home': commitHome(ctx, a.cmd); break;
    case 'buyLot': {
      const l = e.lots.find((x) => x.id === a.lotId);
      if (!l) break;
      l.status = 'owned';
      l.owner = 'player';
      l.boughtWeek = s.week;
      l.invested = l.price + (a.going ? goodwill(s, l) : 0);
      e.stats.lotsBought++;
      if (!l.use) { l.stage = 'purchase'; break; }
      if (a.going && l.tenant) {
        const prior = l.tenant.split('\'s ')[0];
        l.operating = true;
        const u = USES_BY_ID[l.use];
        if (u.biz) {
          const z = ZONES_BY_ID[l.zone];
          const b = newBusiness(s, u.biz, z.district ?? `zone:${l.zone}`);
          b.id = `b${s.nextId++}`;
          b.cost = u.cost;
          if (l.name) b.name = l.name; // a going concern keeps its sign
          s.businesses.push(b);
          l.bizId = b.id;
          e.managers[b.id] = oldOwner(s, prior);
        } else e.managers[`lot:${l.id}`] = oldOwner(s, prior);
        delete l.tenant;
      }
      break;
    }
    case 'leaseLot': {
      const l = e.lots.find((x) => x.id === a.lotId);
      if (!l) break;
      l.status = 'leased';
      l.owner = 'player';
      l.boughtWeek = s.week;
      l.stage = 'purchase';
      break;
    }
    case 'build': {
      const l = e.lots.find((x) => x.id === a.lotId);
      if (!l) break;
      startBuild(s, l, a.use);
      break;
    }
    case 'renovate': {
      const l = e.lots.find((x) => x.id === a.lotId);
      if (!l) break;
      l.condition = 100;
      l.renovated = s.date.y;
      break;
    }
    case 'permits': {
      const l = e.lots.find((x) => x.id === a.lotId);
      if (l?.stage === 'permits') l.permit = { ...(l.permit ?? { zoning: 0, inspector: 0 }), zoning: 0, inspector: 0 };
      break;
    }
    case 'bribeInspector': {
      const l = e.lots.find((x) => x.id === a.lotId);
      if (!l) break;
      if (l.permit) { l.permit.inspector = 0; l.permit.bribed = true; }
      e.stats.inspectorPaid = (e.stats.inspectorPaid ?? 0) + 1;
      delete l.stopWork;
      delete l.stalled;
      break;
    }
    case 'puppetPermit': {
      const l = e.lots.find((x) => x.id === a.lotId);
      if (l?.permit) l.permit.zoning = 0;
      break;
    }
    case 'fixCode': {
      const l = e.lots.find((x) => x.id === a.lotId);
      if (l) { delete l.stopWork; delete l.stalled; }
      break;
    }
    case 'slowRival': {
      const l = e.lots.find((x) => x.id === a.lotId);
      if (l) l.stopWork = { weeks: 4 + (l.stopWork?.weeks ?? 0), reason: 'no concrete, no trucks, no men — somebody made some calls' };
      e.cooldowns[`slow:${a.lotId}`] = s.week;
      break;
    }
    case 'bid': {
      const t = e.tenders.find((x) => x.id === a.contractId);
      if (!t) break;
      e.tenders = e.tenders.filter((x) => x.id !== t.id);
      e.contracts.push({ id: t.id, name: t.name, weekly: Math.round(t.value * 0.15 / t.weeks), weeksLeft: t.weeks, kind: 'city' });
      e.stats.contractsWon++;
      ctx.log.push(`Your construction company won the city's bid: ${t.name}.`);
      break;
    }
    case 'manager': {
      let m: Manager | undefined;
      if (a.source === 'pro') {
        const p = proCandidates(s, a.key)[a.pro ?? 0];
        if (p) m = managerFromPro(s, p);
      } else {
        const c = a.charId ? s.characters[a.charId] : undefined;
        if (c) { m = managerFromChar(s, c, a.source); m.effort = workload(s, c, a.key).effort; }
      }
      if (m) {
        const old = e.managers[a.key];
        if (old?.assistantId && old.assistantId !== m.charId) m.assistantId = old.assistantId;
        e.managers[a.key] = m;
        if (m.charId) addStory(s, s.characters[m.charId], `Put in charge of ${placeName(s, a.key)}.`);
      }
      break;
    }
    case 'oversight': {
      const m = e.managers[a.key];
      if (m) m.oversight = a.level;
      break;
    }
    case 'audit': {
      const m = e.managers[a.key];
      if (!m) break;
      const took = m.skimmed;
      m.found = (m.found ?? 0) + took;
      if (took > 0) {
        const back = Math.round(took / 2);
        money(ctx, back, `Audit at ${placeName(s, a.key)}: ${m.name} took ${fmtMoney(took)} — half recovered`, 'event');
        m.honesty = Math.min(100, m.honesty + 10);
        m.loyalty = Math.max(0, m.loyalty - 10);
        e.stats.skimsCaught++;
        ctx.log.push(`The audit found ${m.name} had taken ${fmtMoney(took)} from ${placeName(s, a.key)}.`);
      } else ctx.log.push(`The audit at ${placeName(s, a.key)} came back clean.`);
      m.skimmed = 0;
      e.cooldowns[`audited:${a.key}`] = s.week;
      break;
    }
    case 'assistant': {
      const m = e.managers[a.key];
      if (m) m.assistantId = a.charId;
      break;
    }
    case 'hq': {
      e.hq = { kind: a.kind, bizId: a.kind === 'restaurant' ? a.bizId : undefined, since: s.week, sweeps: e.hq.sweeps, lastSweep: e.hq.lastSweep, leaked: e.hq.leaked, found: e.hq.found };
      break;
    }
    case 'sweep': {
      e.hq.sweeps++;
      e.hq.lastSweep = s.week;
      if (e.hq.bug && chance(e, SWEEP_FIND)) {
        const b = e.hq.bug;
        delete e.hq.bug;
        e.hq.found++;
        delete e.hq.rumor;
        e.stats.bugsFound++;
        const text = `The sweep found a bug in the headquarters: planted ${s.week - b.week} weeks ago by ${bugText(b.source)}. It heard everything.`;
        ctx.log.push(text);
        s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'heat' });
      } else {
        ctx.log.push('The sweep found nothing.');
        delete e.hq.rumor;
      }
      break;
    }
    case 'project': {
      const p = PROJECTS_BY_KIND[a.kind];
      e.projects.push({ id: eid(e, 'pj'), kind: a.kind, zone: a.zone, cost: Math.round(p.cost * inflation(s) / 50) * 50, weeks: p.weeks, progress: 0, started: s.week });
      break;
    }
    case 'leverage':
      e.stats.leverage++;
      break;
    case 'invite':
      e.cooldowns[`invite:${a.to}`] = s.week;
      break;
    case 'gift':
    case 'sellLot':
      break;
  }
}

function oldOwner(s: GameState, name: string): Manager {
  const e = s.econ!;
  const skill = randInt(e, 45, 80);
  return { source: 'pro', name: name.startsWith('the ') ? `${name.slice(4)} (the old owners)` : name, skill, loyalty: 50, honesty: randInt(e, 30, 90), salary: Math.round(15 + skill * 0.3), share: 0, oversight: 'monthly', since: s.week, skimmed: 0 };
}

/* ---------------- suggestions for the random player ---------------- */

const op = (o: EconAction): PlayerAction => ({ kind: 'econ', op: o });

/** A handful of economy orders the house could give right now (for the simulator's random player). */
export function econActions(s: GameState): PlayerAction[] {
  const e = s.econ;
  if (!e) return [];
  const out: PlayerAction[] = [];
  const w = s.week;
  const mine = s.businesses.filter((b) => b.owner === 'player');
  if (mine.length) {
    const b = mine[w % mine.length];
    if (nextStep(s, b)) out.push(op({ type: 'upgrade', bizId: b.id }));
    if (['bookmaking', 'vending', 'numbers', 'cargo'].includes(b.kind)) out.push(op({ type: 'collect', bizId: b.id }));
    if (!e.managers[b.id] && expectedTake(s, b) >= 150) {
      const fam = familyCandidates(s)[0];
      out.push(fam ? op({ type: 'manager', key: b.id, source: 'family', charId: fam.id }) : op({ type: 'manager', key: b.id, source: 'pro', pro: w % 3 }));
    } else if (e.managers[b.id]) {
      out.push(op({ type: 'oversight', key: b.id, level: (['weekly', 'monthly', 'quarterly', 'hands_off'] as const)[w % 4] }));
      if (w % 5 === 0) out.push(op({ type: 'audit', key: b.id }));
      const kid = assistantCandidates(s)[0];
      if (kid && !e.managers[b.id].assistantId) out.push(op({ type: 'assistant', key: b.id, charId: kid.id }));
    }
    const crewC = crewCandidates(s)[w % Math.max(1, crewCandidates(s).length)];
    if (crewC && w % 7 === 0) out.push(op({ type: 'manager', key: b.id, source: 'crew', charId: crewC.id }));
  }
  // Property: something cheap for sale, building on what we own.
  const sale = e.lots.filter((l) => l.status === 'sale' && l.price * 5 <= s.money).sort((a, b) => a.price - b.price);
  if (sale.length) {
    const l = sale[w % Math.min(6, sale.length)];
    out.push(op({ type: 'buyLot', lotId: l.id, going: !!l.tenant && w % 2 === 0 }));
  }
  const lux = luxActions(s);
  if (lux.length && w % 9 === 0) out.push(op(lux[w % lux.length]));
  // A man with nothing of his own: set him up (kickup.ts).
  const su = nextSetup(s);
  if (su) out.push(su);
  out.push(...empireActions(s));
  const lease = e.lots.find((l) => l.status === 'lease');
  if (lease && w % 3 === 0) out.push(op({ type: 'leaseLot', lotId: lease.id }));
  for (const l of e.lots.filter((x) => (x.status === 'owned' || x.status === 'leased') && x.stage === 'purchase').slice(0, 1)) {
    const z = ZONES_BY_ID[l.zone];
    const uses = Object.values(USES_BY_ID).filter((u) => (u.zones ? u.zones.includes(l.zone) : z.cats.includes(u.cat)) && (u.minYear ?? 0) <= s.date.y && buildCost(l, u) * 5 <= s.money);
    if (uses.length) out.push(op({ type: 'build', lotId: l.id, use: uses[w % uses.length].id }));
  }
  const owned = e.lots.filter((l) => l.status === 'owned' && l.stage === 'open');
  if (owned.length) {
    const l = owned[w % owned.length];
    if (l.condition < 60) out.push(op({ type: 'renovate', lotId: l.id }));
    if (!e.managers[`lot:${l.id}`] && !l.bizId && !l.tenant) out.push(op({ type: 'manager', key: `lot:${l.id}`, source: 'pro', pro: w % 3 }));
    if (w % 13 === 0) out.push(op({ type: 'sellLot', lotId: l.id }));
  }
  const building = e.lots.find((l) => l.stage === 'permits' && (l.status === 'owned' || l.status === 'leased'));
  if (building) out.push(op({ type: 'permits', lotId: building.id }), op({ type: 'bribeInspector', lotId: building.id }));
  const stopped = e.lots.find((l) => l.stopWork && (l.status === 'owned' || l.status === 'leased'));
  if (stopped) out.push(op({ type: 'fixCode', lotId: stopped.id }));
  for (const t of e.tenders.slice(0, 1)) out.push(op({ type: 'bid', contractId: t.id }));
  const rivalSite = e.lots.find((l) => underConstruction(l) && l.status === 'rival');
  if (rivalSite && w % 4 === 0) out.push(op({ type: 'slowRival', lotId: rivalSite.id }));
  // HQ.
  if (w % 9 === 0) out.push(op({ type: 'sweep' }));
  if (w % 17 === 0) {
    const kinds: HQKind[] = ['social', 'restaurant', 'car', 'walk'];
    const k = kinds[(w / 17) % 4 | 0];
    out.push(op({ type: 'hq', kind: k, bizId: k === 'restaurant' ? hqRestaurants(s)[0]?.id : undefined }));
  }
  // Gifts, community, leverage.
  const people = crew(s).concat(Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== s.playerId));
  if (people.length) {
    const c = people[w % people.length];
    const affordable = Object.values(GIFTS_BY_ID).filter((g) => giftAvailable(g, s.date.y) && giftPrice(s, g) * 12 <= s.money);
    if (affordable.length) out.push(op({ type: 'gift', giftId: affordable[(w * 7) % affordable.length].id, to: c.id }));
  }
  const p = PROJECTS[w % PROJECTS.length];
  if (p.cost * 12 <= s.money) out.push(op({ type: 'project', kind: p.kind, zone: ZONES[w % 8].id }));
  const officials = Object.values(s.characters).filter((c) => c.alive && c.office && c.faction !== 'player');
  if (officials.length) {
    const c = officials[w % officials.length];
    const modes = Object.keys(LEVERAGE) as (keyof typeof LEVERAGE)[];
    let mode = modes[w % modes.length] as 'cash';
    if (mode === ('job' as string) && s.money < 25000) mode = 'invite' as 'cash';
    const withC = crew(s)[0];
    out.push(op({ type: 'leverage', mode, to: c.id, withId: mode === ('introduce' as string) ? withC?.id : undefined }));
  }
  for (const t of houseTickets(s)) if (teamPlaying(t.team, s) && people.length) out.push(op({ type: 'invite', team: t.team, to: people[(w + 3) % people.length].id }));
  return out;
}

/** Odds you beat a rival bidding for the same lot. */
export function lotBidOdds(s: GameState, rival: { id: RivalId; money: number }): { chance: number; reasons: { label: string; value: number }[] } {
  const reasons = [
    { label: 'Base', value: 55 },
    { label: `Your respect ${s.respect}`, value: Math.round((s.respect - 40) / 3) },
    { label: `${FACTION_NAMES[rival.id]} has deep pockets`, value: -Math.min(30, Math.round(rival.money / 3000)) },
    ...(s.favors > 0 ? [{ label: 'A word at the title company', value: 8 }] : []),
  ];
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.1, Math.min(0.9, sum / 100)), reasons };
}
