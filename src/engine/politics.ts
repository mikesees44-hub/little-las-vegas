import { capos, displayName, isFree } from './characters';
import { registerDeathHandler } from './dynasty';
import { registerPermitAuthority } from './econ';
import { permitAuthority } from './polPermits';
import { fmtMoney } from './effects';
import { heat, type Ctx } from './ledger';
import { chance, rand } from './rng';
import { controlIndex } from './polIntegrity';
import { FAVORS, JURIS_NAME, LAW_BY_ID, LEGISLATURE, OFFICE_BY_ID } from './polData';
import { assignSeat, ctlOf, holder, initGovernment, monthlyGov, nameOf, officeActive, officesOf, peekCtl, syncProsecutor, vacate } from './polGov';
import { DIRTY_INFO, addPuppet, economy, openRaces, runElections } from './polElections';
import { billsMonth, billsWeek, introduce, isDone, lawsWeek, STAGE_LABEL } from './polLaws';
import { fromCharacter, getPerson, materialize, toughCost, worldDeath, yearlyCareers } from './polPeople';
import { dirtOn, envelope, favorAcceptance, favorPlan, favorsFor, kidBlock, kidConflict, kidOffices, payrollAcceptance, payrollWeek, puppetsMonth, refusalEffects, shortTitle, topOffice } from './polPuppets';
import { addLog, clamp100, mIdx, mutP, parseSeat, type PolAction, type PolOp, type PolPerson } from './polState';
import type { ActionPreview } from './actions';
import type { GameState } from './types';

/**
 * Politics hub: setup, the weekly/monthly/yearly ticks, the effect ops
 * (`{ type: 'pol' }`, shown as named chips) and the player's political
 * orders (`{ kind: 'pol' }`, previewed with costs, chips and acceptance odds).
 */

let registered = false;
function register(): void {
  if (registered) return;
  registered = true;
  registerDeathHandler((ctx, id, cause, character) => onDeath(ctx, id, cause, character?.id));
  registerPermitAuthority(permitAuthority);
}

/** Called by newGame; also lazily for old saves. */
export function initPolitics(s: GameState): void {
  register();
  if (s.pol) return;
  initGovernment(s);
  openRaces(s);
}

export function ensurePol(s: GameState): void {
  if (!s.pol) initPolitics(s);
  else register();
}

/* ------------------------------------------------------------------ */
/* Ticks                                                               */
/* ------------------------------------------------------------------ */

export function politicsWeek(ctx: Ctx): void {
  const s = ctx.s;
  ensurePol(s);
  const pol = s.pol!;
  pol.night = [];
  payrollWeek(ctx);
  for (const [k, b] of Object.entries(pol.boons).sort()) if (b.until >= s.week && k.startsWith('transfer:') && s.week % 2 === 0 && s.heat.local > 0) heat(ctx, 'local', -1, `Favor: ${b.label}`, 'heat');
  lawsWeek(ctx);
  const billNews = billsWeek(ctx);
  for (const h of billNews.slice(0, 2)) s.news.push({ week: s.week, date: { ...s.date }, paper: 'Wildwood Leader', headline: h.toUpperCase().replace(/\.$/, ''), body: 'The law changes, and so does the street.', kind: 'law' });
  const now = mIdx(s.date.y, s.date.m);
  if (s.date.y > pol.lastYear) {
    pol.lastYear = s.date.y;
    const y = yearlyCareers(ctx, (key, why) => vacate(s, key, why));
    if (y.rising.length) ctx.log.push(`Names on the rise this year: ${y.rising.slice(0, 3).join(', ')}.`);
  }
  if (now !== pol.lastMonth) {
    pol.lastMonth = now;
    monthly(ctx);
  }
  if (pol.crackdown && s.week >= pol.crackdown.until) {
    ctx.log.push('The war on organized crime has gone quiet. The reporters have moved on.');
    pol.crackdown = undefined;
  }
}

function monthly(ctx: Ctx): void {
  const s = ctx.s;
  const pol = s.pol!;
  syncEngineOfficials(ctx);
  const appointed = monthlyGov(ctx);
  for (const n of appointed.slice(0, 2)) s.chronicle.push({ week: s.week, date: { ...s.date }, text: n, kind: 'misc' });
  runElections(ctx);
  openRaces(s);
  billsMonth(s, economy(s));
  puppetsMonth(ctx);
  const conflict = kidConflict(s);
  if (conflict) s.eventQueue.push(conflict);
  // A war on organized crime after a bad summer.
  if (!pol.crackdown && s.heat.local >= 80 && rand(pol) < 0.25) startCrackdown(s, 'a summer of headlines about the rackets', 26);
}

function startCrackdown(s: GameState, reason: string, weeks: number): void {
  const pol = s.pol!;
  const fresh = !pol.crackdown || pol.crackdown.until < s.week;
  pol.crackdown = { until: Math.max(pol.crackdown?.until ?? 0, s.week + weeks), reason };
  if (!fresh) return;
  pol.stats.crackdowns++;
  s.news.push({ week: s.week, date: { ...s.date }, paper: 'Philadelphia Bulletin', headline: 'OFFICIALS DECLARE WAR ON SHORE RACKETS', body: `After ${reason}, the Prosecutor and Trenton promise raids, hearings and new laws.`, kind: 'law' });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A war on organized crime, after ${reason}.`, kind: 'heat' });
  for (const id of ['cmc_oc_squad', 'nj_gambling_sentences', 'nj_witness']) if (introduce(s, id, `War on organized crime: ${reason}.`)) break;
}

/** Engine officials (and the boss's children) stay in step with their world records. */
function syncEngineOfficials(ctx: Ctx): void {
  const s = ctx.s;
  const pol = s.pol!;
  for (const p of Object.values(pol.people)) {
    if (!p.charId || !p.alive) continue;
    const c = s.characters[p.charId];
    if (!c) continue;
    if (!c.alive) onDeath(ctx, p.id, c.death?.cause ?? 'died', c.id);
    else if (c.firstName !== p.first || c.lastName !== p.last) {
      const m = mutP(s, p.id)!;
      m.first = c.firstName;
      m.last = c.lastName;
    }
  }
  syncProsecutor(ctx, false);
}

/** The one death function calls this for every death (character or world person). */
function onDeath(ctx: Ctx, id: string, cause: string, charId?: string): void {
  const s = ctx.s;
  const pol = s.pol;
  if (!pol) return;
  let p: PolPerson | undefined;
  if (charId) p = Object.values(pol.people).find((x) => x.charId === charId && x.alive);
  else p = worldDeath(s, id, cause);
  if (!p) return;
  if (charId) {
    const m = mutP(s, p.id)!;
    m.alive = false;
    m.died = { year: s.date.y, cause };
    pol.stats.deaths++;
  }
  if (p.seat) {
    const def = OFFICE_BY_ID[parseSeat(p.seat)!.office];
    vacate(s, p.seat, `${nameOf(s, p)} died (${cause})`);
    if (def && (def.level !== 'city' || def.juris === 'wildwood')) s.news.push({ week: s.week, date: { ...s.date }, paper: 'Wildwood Leader', headline: `${def.short.toUpperCase()} ${p.last.toUpperCase()} DIES`, body: `${nameOf(s, p)} died of ${cause}. ${def.selection === 'elected' ? 'A special election will fill the seat.' : 'The appointment is open.'}`, kind: 'death' });
  }
  for (const e of pol.elections) e.candidates = e.candidates.filter((c) => c.id !== p!.id);
  if (charId && pol.kids[charId]) delete pol.kids[charId];
}

/* ------------------------------------------------------------------ */
/* Effect ops                                                          */
/* ------------------------------------------------------------------ */

function pname(s: GameState, id: string): string {
  const p = s.pol?.people[id] ?? getPerson(s, id);
  return p ? nameOf(s, p) : '?';
}

const FIELD_NAME: Record<string, string> = { personal: 'personal ties', financial: 'money ties', independence: 'independence', legitimacy: 'legitimacy', exposure: 'scrutiny', resentment: 'resentment' };

export function describePolOp(s: GameState, o: PolOp): string | undefined {
  const sg = (n: number) => (n > 0 ? `+${Math.round(n)}` : `−${Math.abs(Math.round(n))}`);
  switch (o.op) {
    case 'ctl': return `${pname(s, o.id)} ${FIELD_NAME[o.field]} ${sg(o.amount)}`;
    case 'legit': return `${pname(s, o.id)} legitimacy ${sg(o.amount)}`;
    case 'resent': return `${pname(s, o.id)} resentment ${sg(o.amount)}`;
    case 'strength': return `${pname(s, o.id)} electoral strength ${sg(o.amount)}`;
    case 'asked': return undefined;
    case 'payroll': return o.amount ? `${pname(s, o.id)} on the payroll (${fmtMoney(o.amount)}/wk)` : `${pname(s, o.id)} off the payroll`;
    case 'dig': return `${Math.round(o.odds * 100)}%: find something on ${pname(s, o.id)}`;
    case 'coerce': return `${pname(s, o.id)}: independence −30, resentment +35, scrutiny +8`;
    case 'cut': return `Cut ${pname(s, o.id)} loose`;
    case 'unflip': return `${pname(s, o.id)} stops talking`;
    case 'void': return `${pname(s, o.id)}'s win voided: special election`;
    case 'resign': return `${pname(s, o.id)} resigns`;
    case 'crackdown': return `War on organized crime (${o.weeks} wks)`;
    case 'boon': return o.amount ? `${o.label}: +${fmtMoney(o.amount)}/wk for ${o.weeks} wks` : `${o.label} for ${o.weeks} wks`;
    case 'release': {
      const c = s.characters[o.charId];
      return `${c ? c.firstName + ' ' + c.lastName : '?'} ${o.full ? 'pardoned' : 'comes home early'}`;
    }
    case 'reopen': return `${s.businesses.find((b) => b.id === o.businessId)?.name ?? 'Your place'} reopens`;
    case 'casinoLicense': return 'Casino license granted';
    case 'appointWish': return `${pname(s, o.person)} named ${OFFICE_BY_ID[o.office]?.short ?? '?'} when the seat opens`;
    case 'refusal': {
      const parts = [o.report > 0 && `may report you (${Math.round(o.report * 100)}%)`, o.resign > 0 && `may resign (${Math.round(o.resign * 100)}%)`, o.flip > 0 && `may turn (${Math.round(o.flip * 100)}%)`].filter(Boolean);
      return parts.length ? `${pname(s, o.id)} ${parts.join(', ')}` : undefined;
    }
    case 'campaign': {
      const who = pname(s, o.cand);
      if (o.fund) return `${who}: +$${o.fund.toLocaleString('en-US')} campaign money`;
      if (o.endorse) return `${who}: your endorsement`;
      if (o.patronage) return `${who}: patronage jobs`;
      if (o.dirty) return `${who}: ${DIRTY_INFO[o.dirty].name.toLowerCase()} (+${DIRTY_INFO[o.dirty].votes} votes, ${Math.round(DIRTY_INFO[o.dirty].risk * 100)}% risk)`;
      return undefined;
    }
    case 'puppet': return 'Your puppet candidate on the ballot';
    case 'lobby': return `${o.push > 0 ? '+' : '−'}${Math.abs(o.push)} support${o.risk ? ` (${Math.round(o.risk * 100)}% risk: an investigation)` : ''}`;
    case 'propose': return `Bill introduced (+${o.push} support)`;
    case 'enter': return `${s.characters[o.charId]?.firstName ?? '?'} goes into politics`;
    case 'groom': return `${s.characters[o.charId]?.firstName ?? '?'}: electoral strength +${o.amount}`;
    case 'declare': return `${s.characters[o.charId]?.firstName ?? '?'} runs for ${OFFICE_BY_ID[o.office]?.short ?? '?'}`;
    case 'recruit': return `${pname(s, o.id)} joins the crew`;
  }
}

export function applyPolOp(ctx: Ctx, o: PolOp, label: string): void {
  const s = ctx.s;
  ensurePol(s);
  const pol = s.pol!;
  const ctl = (id: string) => ctlOf(s, id);
  switch (o.op) {
    case 'ctl': {
      const c = ctl(o.id);
      c[o.field] = clamp100(c[o.field] + o.amount);
      break;
    }
    case 'legit':
      ctl(o.id).legitimacy = clamp100(ctl(o.id).legitimacy + o.amount);
      break;
    case 'resent':
      ctl(o.id).resentment = clamp100(ctl(o.id).resentment + o.amount);
      break;
    case 'strength': {
      const p = mutP(s, o.id);
      if (p) p.strength = clamp100(p.strength + o.amount);
      break;
    }
    case 'asked':
      ctl(o.id).asked = s.week;
      pol.stats.favors++;
      break;
    case 'payroll': {
      const c = ctl(o.id);
      c.payroll = o.amount || undefined;
      if (o.amount) c.financial = clamp100(c.financial + 15);
      break;
    }
    case 'dig': {
      const p = pol.people[o.id];
      const d = p ? dirtOn(p) : undefined;
      if (p && d && rand(pol) < o.odds) {
        ctl(o.id).dirt = d;
        ctx.log.push(`You found something on ${nameOf(s, p)}: ${d}.`);
      } else ctx.log.push(`Your people found nothing usable on ${p ? nameOf(s, p) : 'him'}.`);
      break;
    }
    case 'coerce': {
      const c = ctl(o.id);
      c.independence = clamp100(c.independence - 30);
      c.resentment = clamp100(c.resentment + 35);
      c.exposure = clamp100(c.exposure + 8);
      break;
    }
    case 'cut': {
      const c = ctl(o.id);
      c.payroll = undefined;
      c.financial = 0;
      c.resentment = clamp100(c.resentment + 10);
      c.puppet = false;
      break;
    }
    case 'unflip':
      ctl(o.id).flipped = false;
      break;
    case 'void': {
      const p = pol.people[o.id];
      if (p?.seat) vacate(s, p.seat, `A court voided ${nameOf(s, p)}'s election`);
      break;
    }
    case 'resign': {
      const p = pol.people[o.id];
      if (p?.seat) {
        pol.stats.resignations++;
        const m = mutP(s, p.id)!;
        addLog(m, s.date.y, 'Resigned');
        vacate(s, p.seat, `${nameOf(s, p)} resigned`);
      }
      break;
    }
    case 'crackdown':
      startCrackdown(s, o.reason, o.weeks);
      break;
    case 'boon':
      pol.boons[o.key] = { until: s.week + o.weeks, label: o.label, amount: o.amount };
      break;
    case 'release': {
      const c = s.characters[o.charId];
      if (c?.imprisonedUntil !== undefined) {
        c.imprisonedUntil = o.full ? s.week : Math.max(s.week, Math.round(s.week + (c.imprisonedUntil - s.week) / 3));
        ctx.log.push(`${displayName(c)} ${o.full ? 'walks out with a pardon' : 'gets his sentence cut'}.`);
      }
      break;
    }
    case 'reopen': {
      const b = s.businesses.find((x) => x.id === o.businessId);
      if (b) b.closedUntil = undefined;
      break;
    }
    case 'casinoLicense':
      if (s.goals.casinoStage === 2) {
        s.goals.casinoStage = 3;
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: 'A casino commissioner moved your front man\'s license to the top of the pile.', kind: 'misc' });
      }
      break;
    case 'appointWish':
      pol.boons[`appoint:${o.office}`] = { until: s.week + o.weeks, label: o.person, amount: 0 };
      break;
    case 'refusal': {
      const p = pol.people[o.id];
      if (!p) break;
      pol.stats.refusals++;
      const r = rand(pol);
      if (r < o.report) {
        pol.stats.reports++;
        heat(ctx, 'local', 5, `${nameOf(s, p)} reported the approach`, 'heat');
        const boss = s.characters[s.playerId];
        if (boss) boss.evidence = Math.min(100, Math.round(((boss.evidence ?? 0) + 3) * 10) / 10);
        ctx.log.push(`${nameOf(s, p)} went to the Prosecutor about your offer.`);
      } else if (r < o.report + o.resign && p.seat) {
        pol.stats.resignations++;
        vacate(s, p.seat, `${nameOf(s, p)} resigned rather than deal with you`);
      } else if (r < o.report + o.resign + o.flip) {
        ctl(o.id).flipped = true;
        pol.stats.flips++;
        ctx.log.push(`${nameOf(s, p)} is talking to the investigators.`);
      }
      break;
    }
    case 'campaign': {
      const e = pol.elections.find((x) => x.id === o.election);
      const c = e?.candidates.find((x) => x.id === o.cand);
      if (!c) break;
      if (o.fund) c.fund += o.fund;
      if (o.endorse) {
        for (const x of e!.candidates) x.endorsed = false;
        c.endorsed = true;
      }
      if (o.patronage) c.patronage += o.patronage;
      if (o.dirty && !c.dirty.includes(o.dirty)) c.dirty.push(o.dirty);
      break;
    }
    case 'puppet': {
      const e = pol.elections.find((x) => x.id === o.election);
      if (e && !e.candidates.some((c) => c.puppet)) {
        const p = addPuppet(s, e);
        const c = ctl(p.id);
        c.personal = Math.max(c.personal, 50);
        c.financial = Math.max(c.financial, 50);
      }
      break;
    }
    case 'lobby': {
      const b = pol.bills.find((x) => x.id === o.bill);
      if (!b || isDone(b)) break;
      b.support = clamp100(b.support + o.push);
      b.push += o.push;
      if (o.risk && rand(pol) < o.risk) {
        heat(ctx, 'local', 3, `${label}: a legislator talked`, 'heat');
        const boss = s.characters[s.playerId];
        if (boss) boss.evidence = Math.min(100, (boss.evidence ?? 0) + 4);
        ctx.log.push('A legislator you paid told a reporter about it.');
      }
      break;
    }
    case 'propose': {
      introduce(s, o.law, 'Your friends in the legislature want it.', o.push);
      break;
    }
    case 'enter': {
      const c = s.characters[o.charId];
      if (!c || pol.kids[c.id]) break;
      const p = fromCharacter(c, 'wildwood_city', 'local_politics', 0, 'Committeeman, Wildwood', s.date.y);
      p.party = 'D';
      p.since = s.date.y;
      pol.people[p.id] = p;
      pol.kids[c.id] = { since: s.week, groomed: 0, held: [] };
      const cc = ctl(p.id);
      cc.personal = 80;
      cc.independence = 20;
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} went into politics: committeeman in the Wildwood Democratic club.`, kind: 'family' });
      break;
    }
    case 'groom': {
      const p = Object.values(pol.people).find((x) => x.charId === o.charId && x.alive);
      const k = pol.kids[o.charId];
      if (!p || !k) break;
      const m = mutP(s, p.id)!;
      m.strength = clamp100(m.strength + o.amount);
      m.charisma = clamp100(m.charisma + 3);
      if (m.rung === 0) {
        m.rung = 1;
        m.title = 'Ward leader, Wildwood Democrats';
      }
      k.groomed++;
      k.lastGroom = s.week;
      break;
    }
    case 'declare': {
      const k = pol.kids[o.charId];
      if (!k) break;
      k.office = o.office;
      const p = Object.values(pol.people).find((x) => x.charId === o.charId && x.alive);
      const e = pol.elections.find((x) => x.office === o.office && !x.special) ?? pol.elections.find((x) => x.office === o.office);
      if (p && e && !e.candidates.some((c) => c.id === p.id)) e.candidates.push({ id: p.id, party: OFFICE_BY_ID[o.office]?.partisan ? p.party ?? 'D' : undefined, incumbent: false, fund: 0, patronage: 0, dirty: [] });
      break;
    }
    case 'recruit': {
      const p = pol.people[o.id];
      if (!p?.alive || !p.street) break;
      const c = materialize(s, p, { faction: 'player', rank: 'associate' });
      const capo = capos(s).find((x) => isFree(s, x));
      if (capo) c.capoId = capo.id;
      const m = mutP(s, p.id)!;
      m.charId = c.id;
      m.street = { ...m.street!, with: 'player' };
      addLog(m, s.date.y, 'Joined your crew');
      pol.stats.recruitedToughs++;
      ctx.log.push(`${displayName(c)} comes off the street into your crew.`);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Player orders                                                       */
/* ------------------------------------------------------------------ */

function noop(title: string, why: string): ActionPreview {
  return { title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' };
}

export function previewPol(s: GameState, a: PolAction): ActionPreview {
  if (!s.pol) return noop('Politics', 'Not set up yet');
  const pol = s.pol;
  switch (a.op) {
    case 'cultivate': {
      const p = pol.people[a.id];
      if (!p?.alive) return noop('Cultivate', 'No such person');
      const nm = nameOf(s, p);
      const gift = a.how === 'gift';
      const cost = gift ? 1500 : 300;
      const honest = p.integrity >= 70;
      const label = gift ? `Gift to ${nm}` : `Dinner with ${nm}`;
      return {
        title: gift ? `Send ${nm} a gift (${fmtMoney(cost)})` : `Dinner with ${nm} at the Diamond Beach Club`,
        detail: gift ? 'Season tickets, a case of Scotch, a fur for his wife.' : 'Veal, a good bottle, nothing about business.',
        effects: [
          { type: 'money', amount: -cost, label },
          { type: 'pol', op: { op: 'ctl', id: p.id, field: 'personal', amount: Math.round((gift ? 18 : 10) * (honest ? 0.5 : 1)) }, label },
          ...(gift ? [{ type: 'pol', op: { op: 'ctl', id: p.id, field: 'financial', amount: 5 }, label } as const] : []),
          ...(honest ? [{ type: 'pol', op: { op: 'ctl', id: p.id, field: 'exposure', amount: 3 }, label } as const] : []),
        ],
        cost,
        because: gift ? `sent ${nm} a gift` : `had dinner with ${nm}`,
        disabledReason: s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined,
        category: 'event',
        ...(honest ? { warning: 'An honest man: half the effect, and people notice.' } : {}),
      };
    }
    case 'payroll': {
      const p = pol.people[a.id];
      if (!p?.alive) return noop('Payroll', 'No such person');
      const nm = nameOf(s, p);
      const c = peekCtl(s, p.id)!;
      if (!a.on) {
        return { title: `Take ${nm} off the payroll`, effects: [{ type: 'pol', op: { op: 'payroll', id: p.id, amount: 0 }, label: `Payroll: ${nm}` }, { type: 'pol', op: { op: 'ctl', id: p.id, field: 'resentment', amount: 8 }, label: `Payroll: ${nm}` }], cost: 0, because: `took ${nm} off the payroll`, disabledReason: c.payroll ? undefined : 'Not on the payroll', category: 'event' };
      }
      const env = envelope(p);
      const label = `Payroll: ${nm}`;
      return {
        title: `Put ${nm} on the payroll (${fmtMoney(env)}/wk)`,
        detail: `${shortTitle(s, p)}. A weekly envelope: money ties grow every month; so does the scrutiny.`,
        effects: [{ type: 'pol', op: { op: 'payroll', id: p.id, amount: env }, label }],
        refuseEffects: refusalEffects(s, p, `${label}: refused`),
        acceptance: payrollAcceptance(s, p),
        cost: 0,
        because: `put ${nm} on the payroll`,
        disabledReason: c.payroll ? 'Already on the payroll' : c.flipped ? 'He is talking to investigators' : undefined,
        category: 'cost',
      };
    }
    case 'dig': {
      const p = pol.people[a.id];
      if (!p?.alive) return noop('Dig', 'No such person');
      const nm = nameOf(s, p);
      const label = `Digging on ${nm}`;
      const odds = dirtOn(p) ? 0.65 : 0.0;
      return {
        title: `Have somebody dig into ${nm}`,
        detail: 'A private detective, a bank clerk, an old girlfriend with a grudge. Abstract, and slow to pay off.',
        effects: [{ type: 'money', amount: -1500, label }, { type: 'pol', op: { op: 'dig', id: p.id, odds }, label }],
        cost: 1500,
        because: `had people dig into ${nm}`,
        disabledReason: peekCtl(s, p.id)?.dirt ? 'You already have something on him' : s.money < 1500 ? 'Needs $1,500' : undefined,
        category: 'event',
        odds: { chance: odds, reasons: [{ label: odds ? 'There is something to find' : 'He looks clean', value: Math.round(odds * 100) }] }, oddsLabel: 'Finds something',
        ...(odds === 0 ? { warning: 'He looks clean. You may find nothing.' } : {}),
      };
    }
    case 'coerce': {
      const p = pol.people[a.id];
      if (!p?.alive) return noop('Coerce', 'No such person');
      const nm = nameOf(s, p);
      const c = peekCtl(s, p.id)!;
      const label = `Leaning on ${nm}`;
      return {
        title: `Lean on ${nm}`,
        detail: c.dirt ? `What you have: ${c.dirt}. He complies, for now. He will not forget.` : 'You need something on him first.',
        effects: [{ type: 'pol', op: { op: 'coerce', id: p.id }, label }],
        cost: 0,
        because: `leaned on ${nm}`,
        disabledReason: c.dirt ? undefined : 'You have nothing on him (dig first)',
        warning: 'Coercion buys compliance, not loyalty: resentment can make him turn.',
        category: 'event',
      };
    }
    case 'favor': {
      const p = pol.people[a.id];
      if (!p?.alive) return noop('Favor', 'No such person');
      const f = FAVORS[a.kind];
      const fav = favorsFor(s, p).find((x) => x.kind === a.kind);
      const top = topOffice(s, p);
      const nm = nameOf(s, p);
      const title = `Ask ${nm}: ${f.name.toLowerCase()}`;
      if (!fav) return noop(title, `${shortTitle(s, p)} cannot do that`);
      if (!fav.office.reach || (top && !top.reach)) return noop(title, 'Beyond any shore family\'s reach');
      const plan = favorPlan(s, p, a.kind, fav.office);
      return {
        title,
        detail: f.text,
        effects: plan.effects,
        refuseEffects: refusalEffects(s, p, `${title}: refused`),
        acceptance: favorAcceptance(s, p, a.kind),
        cost: 0,
        because: `asked ${nm} for ${f.name.toLowerCase()}`,
        disabledReason: plan.disabled ?? (peekCtl(s, p.id)?.flipped ? 'He is talking to investigators' : undefined),
        category: 'event',
      };
    }
    case 'fund':
    case 'endorse':
    case 'patronage':
    case 'dirty': {
      const e = pol.elections.find((x) => x.id === a.election);
      const c = e?.candidates.find((x) => x.id === a.cand);
      if (!e || !c) return noop('Campaign', 'No such race');
      const def = OFFICE_BY_ID[e.office];
      const nm = pname(s, c.id);
      const label = `Campaign: ${nm} for ${def.short}`;
      const closed = !def.reach ? 'Beyond any shore family\'s reach' : undefined;
      if (a.op === 'fund') {
        return { title: `Give ${nm}'s campaign ${fmtMoney(a.amount)}`, detail: 'Lawful money, through the right committees. Buys votes and his gratitude.', effects: [{ type: 'money', amount: -a.amount, label }, { type: 'pol', op: { op: 'campaign', election: e.id, cand: c.id, fund: a.amount }, label }], cost: a.amount, because: `funded ${nm}'s campaign`, disabledReason: closed ?? (s.money < a.amount ? `Needs ${fmtMoney(a.amount)}` : undefined), category: 'event' };
      }
      if (a.op === 'endorse') {
        const v = Math.round((s.respect - 40) / 3 - s.heat.local / 12);
        return { title: `Let it be known you back ${nm}`, detail: `Your name carries ${v >= 0 ? '+' : '−'}${Math.abs(v)} votes: respect helps, heat hurts.`, effects: [{ type: 'pol', op: { op: 'campaign', election: e.id, cand: c.id, endorse: true }, label }, { type: 'pol', op: { op: 'ctl', id: c.id, field: 'personal', amount: 5 }, label }], cost: 0, because: `endorsed ${nm}`, disabledReason: closed ?? (c.endorsed ? 'Already endorsed' : undefined), category: 'event' };
      }
      if (a.op === 'patronage') {
        return { title: `Patronage jobs for ${nm}'s people`, detail: 'Lifeguards, meter maids and summer cops who owe their jobs to him. Obligations and scrutiny.', effects: [{ type: 'favor', amount: -1, label }, { type: 'pol', op: { op: 'campaign', election: e.id, cand: c.id, patronage: 1 }, label }, { type: 'pol', op: { op: 'ctl', id: c.id, field: 'exposure', amount: 4 }, label }], cost: 0, because: `found patronage jobs for ${nm}'s people`, disabledReason: closed ?? (s.favors < 1 ? 'No favors to spend' : undefined), category: 'event' };
      }
      const d = DIRTY_INFO[a.dirty];
      const clerk = holder(s, 'cmc_clerk');
      const needClerk = a.dirty === 'coerce' && (!clerk || controlIndex(peekCtl(s, clerk.id)!) < 40 && !peekCtl(s, clerk.id)?.dirt);
      return {
        title: `${d.name} for ${nm}`,
        detail: `${d.text} No questions about how.`,
        effects: [
          ...(d.cost ? [{ type: 'money', amount: -d.cost, label } as const] : []),
          ...(a.dirty === 'intimidate' ? [{ type: 'heat', bar: 'local', amount: 2, label } as const] : []),
          ...(a.dirty === 'coerce' && clerk ? [{ type: 'pol', op: { op: 'resent', id: clerk.id, amount: 15 }, label } as const] : []),
          { type: 'pol', op: { op: 'campaign', election: e.id, cand: c.id, dirty: a.dirty }, label },
        ],
        cost: d.cost,
        because: `arranged ${d.name.toLowerCase()} for ${nm}`,
        disabledReason: closed ?? (c.dirty.includes(a.dirty) ? 'Already arranged' : needClerk ? 'You do not own the County Clerk (control 40+ or something on him)' : s.money < d.cost ? `Needs ${fmtMoney(d.cost)}` : undefined),
        warning: `Risk of a recount, an investigation or a backlash: ${Math.round(d.risk * 100)}% before the margin and the laws.`,
        category: 'event',
      };
    }
    case 'puppet': {
      const e = pol.elections.find((x) => x.id === a.election);
      if (!e) return noop('Puppet candidate', 'No such race');
      const def = OFFICE_BY_ID[e.office];
      const label = `Puppet candidate for ${def.short}`;
      return {
        title: `Run a puppet for ${def.title}`,
        detail: 'A clean front with your money behind him. If he wins he takes your calls, until the arrangement comes out.',
        effects: [{ type: 'money', amount: -5000, label }, { type: 'pol', op: { op: 'puppet', election: e.id }, label }],
        cost: 5000,
        because: `ran a puppet candidate for ${def.title}`,
        disabledReason: !def.reach ? 'Beyond any shore family\'s reach' : e.candidates.some((c) => c.puppet) ? 'You already have a man in this race' : s.money < 5000 ? 'Needs $5,000' : undefined,
        category: 'event',
      };
    }
    case 'lobby': {
      const b = pol.bills.find((x) => x.id === a.bill);
      const l = b ? LAW_BY_ID[b.law] : undefined;
      if (!b || !l) return noop('Lobby', 'No such bill');
      const label = `Lobbying ${a.dir > 0 ? 'for' : 'against'} the ${l.name}`;
      const cost = a.mode === 'money' ? 2500 : a.mode === 'bribe' ? 5000 : 0;
      const push = (a.mode === 'money' ? 8 : a.mode === 'bribe' ? 15 : 6) * a.dir;
      const open = b.stage === 'problem' || b.stage === 'debate' || b.stage === 'signature';
      return {
        title: `${a.mode === 'bribe' ? 'Envelopes' : a.mode === 'favor' ? 'Call in a favor' : 'Lobbyists'} ${a.dir > 0 ? 'for' : 'against'} the ${l.name}`,
        detail: a.mode === 'bribe' ? 'Cash for votes. It works, and it leaves a trail.' : a.mode === 'favor' ? 'Someone in the right office owes you.' : 'A lobbyist, lunches, campaign checks in the right districts.',
        effects: [...(cost ? [{ type: 'money', amount: -cost, label } as const] : []), ...(a.mode === 'favor' ? [{ type: 'favor', amount: -1, label } as const] : []), { type: 'pol', op: { op: 'lobby', bill: b.id, push, ...(a.mode === 'bribe' ? { risk: 0.25 } : {}) }, label }],
        cost,
        because: `lobbied ${a.dir > 0 ? 'for' : 'against'} the ${l.name}`,
        disabledReason: l.anchor ? 'History: this one is bigger than any shore family' : !open ? `Too late: ${STAGE_LABEL[b.stage].toLowerCase()}` : a.mode === 'favor' && s.favors < 1 ? 'No favors to spend' : cost && s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined,
        category: 'event',
      };
    }
    case 'propose': {
      const l = LAW_BY_ID[a.law];
      if (!l) return noop('Propose', 'No such law');
      const leg = LEGISLATURE[l.juris];
      const friend = leg.body.flatMap((o) => pol.offices[o]?.holders ?? []).find((id) => id && controlIndex(peekCtl(s, id) ?? { personal: 0, financial: 0, independence: 100, resentment: 0, exposure: 0 }) >= 40);
      const label = `Bill: ${l.name}`;
      return {
        title: `Have a friend introduce the ${l.name}`,
        detail: `${l.text} Needs someone you own in ${leg.name}.`,
        effects: [{ type: 'money', amount: -2000, label }, { type: 'pol', op: { op: 'propose', law: l.id, push: 8 }, label }],
        cost: 2000,
        because: `had a friend introduce the ${l.name}`,
        disabledReason: l.anchor ? 'History decides this one' : pol.laws[l.id] !== undefined ? 'Already law' : pol.bills.some((b) => b.law === l.id && !isDone(b)) ? 'Already before the body' : l.needs?.some((n) => pol.laws[n] === undefined) ? 'Needs another law first' : !friend ? `You own nobody in ${leg.name} (control 40+)` : s.money < 2000 ? 'Needs $2,000' : undefined,
        category: 'event',
      };
    }
    case 'enter': {
      const c = s.characters[a.charId];
      if (!c) return noop('Politics', 'No such person');
      const label = `${c.firstName} goes into politics`;
      return {
        title: `Send ${c.firstName} into politics`,
        detail: 'Committeeman in the Wildwood Democratic club, Communion breakfasts, every wake in the parish. Council, then mayor, then Trenton, then Washington.',
        effects: [{ type: 'money', amount: -1500, label }, { type: 'pol', op: { op: 'enter', charId: c.id }, label }],
        cost: 1500,
        because: `sent ${c.firstName} into politics`,
        disabledReason: kidBlock(s, c) ?? (s.money < 1500 ? 'Needs $1,500' : undefined),
        category: 'event',
      };
    }
    case 'groom': {
      const c = s.characters[a.charId];
      const k = pol.kids[a.charId];
      if (!c || !k) return noop('Groom', 'Not in politics');
      const label = `Grooming ${c.firstName}`;
      const wait = k.lastGroom !== undefined ? 13 - (s.week - k.lastGroom) : 0;
      return {
        title: `Groom ${c.firstName} (speech lessons, the right lunches)`,
        detail: 'A speechwriter from Philadelphia, the party chairman\'s ear, his picture at the Holy Name breakfast.',
        effects: [{ type: 'money', amount: -2000, label }, { type: 'pol', op: { op: 'groom', charId: c.id, amount: 6 }, label }],
        cost: 2000,
        because: `groomed ${c.firstName} for office`,
        disabledReason: wait > 0 ? `Again in ${wait} weeks` : s.money < 2000 ? 'Needs $2,000' : undefined,
        category: 'event',
      };
    }
    case 'declare': {
      const c = s.characters[a.charId];
      const def = OFFICE_BY_ID[a.office];
      if (!c || !def || !pol.kids[a.charId]) return noop('Declare', 'Not in politics');
      const opt = kidOffices(s, c).find((x) => x.office.id === def.id);
      const race = pol.elections.find((e) => e.office === def.id);
      const next = pol.offices[def.id]?.next.filter((x) => x > 0).sort((x, y) => x - y)[0];
      return {
        title: `${c.firstName} runs for ${def.title}`,
        detail: race ? 'The race is open: he goes on the ballot now.' : next ? `He goes on the ballot when the race opens.` : 'He goes on the ballot at the next election.',
        effects: [{ type: 'pol', op: { op: 'declare', charId: c.id, office: def.id }, label: `${c.firstName} for ${def.short}` }],
        cost: 0,
        because: `had ${c.firstName} run for ${def.title}`,
        disabledReason: !opt ? 'Not open to him' : opt.why ?? (pol.kids[a.charId].office === def.id ? 'Already running' : undefined),
        category: 'event',
      };
    }
    case 'recruit': {
      const p = pol.people[a.id];
      if (!p?.alive || !p.street) return noop('Recruit', 'No such man');
      const cost = toughCost(p);
      const nm = nameOf(s, p);
      const label = `Recruit ${nm}`;
      return {
        title: `Bring ${nm} into the crew (${fmtMoney(cost)})`,
        detail: `${p.title}. Leadership potential ${p.street.pot}.`,
        effects: [{ type: 'money', amount: -cost, label }, { type: 'pol', op: { op: 'recruit', id: p.id }, label }],
        cost,
        because: `brought ${nm} into the crew`,
        disabledReason: p.street.with !== 'none' ? `He runs with ${p.street.with === 'player' ? 'you already' : p.street.with}` : p.charId ? 'Already one of yours' : s.money < cost ? `Needs ${fmtMoney(cost)}` : undefined,
        category: 'event',
      };
    }
  }
}

/** A few political orders the random player can give (the sim). */
export function polActions(s: GameState): { kind: 'pol'; op: PolAction }[] {
  const pol = s.pol;
  if (!pol) return [];
  const out: PolAction[] = [];
  const officials = Object.values(pol.people).filter((p) => p.alive && p.seat && OFFICE_BY_ID[parseSeat(p.seat)!.office]?.reach).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (officials.length) {
    const p = officials[s.week % officials.length];
    out.push({ op: 'cultivate', id: p.id, how: s.week % 2 ? 'dinner' : 'gift' }, { op: 'payroll', id: p.id, on: true }, { op: 'dig', id: p.id }, { op: 'coerce', id: p.id });
    for (const f of favorsFor(s, p)) out.push({ op: 'favor', id: p.id, kind: f.kind });
  }
  const owned = Object.entries(pol.ctl).filter(([, c]) => c.payroll).map(([id]) => id);
  if (owned.length) out.push({ op: 'payroll', id: owned[s.week % owned.length], on: false });
  for (const e of pol.elections.slice(0, 3)) {
    const c = e.candidates[s.week % Math.max(1, e.candidates.length)];
    if (!c) continue;
    out.push({ op: 'fund', election: e.id, cand: c.id, amount: 2000 }, { op: 'endorse', election: e.id, cand: c.id }, { op: 'patronage', election: e.id, cand: c.id });
    out.push({ op: 'dirty', election: e.id, cand: c.id, dirty: (['bribe', 'fraud', 'intimidate', 'coerce'] as const)[s.week % 4] }, { op: 'puppet', election: e.id });
  }
  for (const b of pol.bills.filter((x) => !isDone(x)).slice(0, 2)) out.push({ op: 'lobby', bill: b.id, dir: s.week % 2 ? 1 : -1, mode: (['money', 'favor', 'bribe'] as const)[s.week % 3] });
  for (const id of ['nj_liquor_hours', 'ww_local_option', 'nw_club_hours', 'nj_usury']) out.push({ op: 'propose', law: id });
  for (const c of Object.values(s.characters)) {
    if (!c.dynasty || !c.alive) continue;
    if (!pol.kids[c.id]) out.push({ op: 'enter', charId: c.id });
    else {
      out.push({ op: 'groom', charId: c.id });
      const offs = kidOffices(s, c).filter((x) => !x.why);
      if (offs.length) out.push({ op: 'declare', charId: c.id, office: offs[s.week % offs.length].office.id });
    }
  }
  const toughs = Object.values(pol.people).filter((p) => p.alive && p.street && p.street.with === 'none' && !p.charId);
  if (toughs.length) out.push({ op: 'recruit', id: toughs[s.week % toughs.length].id });
  return out.map((op) => ({ kind: 'pol', op }));
}

export { JURIS_NAME, chance, officeActive, officesOf, assignSeat };
