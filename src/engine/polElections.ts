import type { Ctx } from './ledger';
import { gauss, hashSeed, rand, type RngHolder } from './rng';
import { OFFICE_BY_ID, OFFICE_DEFS, type OfficeDef } from './polData';
import { assignSeat, chooseFromBody, ctlOf, holder, nameOf, officeActive } from './polGov';
import { generated, promoteToFull } from './polPeople';
import { lawFraudRisk } from './polLaws';
import { addLog, mIdx, mName, mutP, type Candidate, type DirtyOp, type Election, type ElectionResult, type Party, type PolPerson } from './polState';
import type { Choice, Effect, EventInstance, GameState } from './types';

/**
 * Elections. Every elected seat has a term and a calendar (May municipal
 * elections for the Walsh Act commissions, November for the partisan
 * offices); the race opens three months out with candidates from the
 * political dynasties and the population. Vote share comes from personal
 * strength, incumbency, the district's lean, the economy, scandals, your
 * money, endorsement and patronage — and abstract dirty work, which resolves
 * afterwards as events with consequences (recounts, court challenges,
 * investigations, backlash, special elections). No how-to, ever.
 */

export const CAMPAIGN_MONTHS = 3;

/** The shore economy by year (recessions in 1960-61, 1970, 1974-75, 1980-82). */
const ECONOMY: Record<number, number> = {
  1960: 44, 1961: 42, 1962: 55, 1963: 58, 1964: 62, 1965: 64, 1966: 65, 1967: 62, 1968: 63, 1969: 58, 1970: 44, 1971: 50, 1972: 56,
  1973: 52, 1974: 38, 1975: 34, 1976: 50, 1977: 55, 1978: 58, 1979: 48, 1980: 36, 1981: 38, 1982: 34, 1983: 52, 1984: 60, 1985: 62,
};
export function economy(s: GameState): number {
  return ECONOMY[s.date.y] ?? 55;
}

export interface ScoreLine {
  label: string;
  value: number;
}

export const DIRTY_INFO: Record<DirtyOp, { name: string; cost: number; votes: number; risk: number; text: string }> = {
  bribe: { name: 'Buy the precinct workers', cost: 3000, votes: 5, risk: 0.2, text: 'Envelopes for the people who get out the vote, and for some who keep it home.' },
  fraud: { name: 'Irregularities at the count', cost: 2500, votes: 8, risk: 0.35, text: 'Ballots that should not count, counted. Risk of a recount, a court challenge, a special election.' },
  intimidate: { name: 'Pressure at the polls', cost: 1000, votes: 6, risk: 0.3, text: 'Large men near the polling places. Risk of backlash and an investigation.' },
  coerce: { name: 'Lean on the man who counts', cost: 0, votes: 7, risk: 0.25, text: 'The County Clerk owes you. He may resent it, and he may talk.' },
};

/** The vote score of one candidate, with every reason. */
export function candidateScore(s: GameState, e: Election, c: Candidate): ScoreLine[] {
  const def = OFFICE_BY_ID[e.office];
  const p = s.pol!.people[c.id];
  if (!p || !def) return [];
  const out: ScoreLine[] = [{ label: `Personal strength ${p.strength}`, value: Math.round(p.strength * 0.5) }];
  if (c.incumbent) out.push({ label: `Incumbent${(p.terms ?? 1) > 1 ? ` (${p.terms} terms)` : ''}`, value: 9 + Math.min(6, ((p.terms ?? 1) - 1) * 2) });
  if (def.partisan && c.party && c.party !== 'I') out.push({ label: `District leans ${def.lean >= 0 ? 'Democratic' : 'Republican'}`, value: Math.round((c.party === 'D' ? def.lean : -def.lean) * 20) });
  if (c.incumbent) {
    const econ = economy(s);
    out.push({ label: econ >= 50 ? 'Good times on the shore' : 'Hard times on the shore', value: Math.round((econ - 50) / 5) });
  }
  if (p.scandal > 0) out.push({ label: 'Scandal', value: -Math.round(p.scandal * 0.35) });
  const ct = s.pol!.ctl[c.id];
  if (ct && c.incumbent) out.push({ label: `Legitimacy ${Math.round(ct.legitimacy)}`, value: Math.round((ct.legitimacy - 50) / 8) });
  if (c.fund > 0) out.push({ label: `Your campaign money ($${c.fund.toLocaleString('en-US')})`, value: Math.min(16, Math.round(4 * Math.log2(1 + c.fund / 1000))) });
  if (c.endorsed) out.push({ label: 'Your endorsement', value: Math.round((s.respect - 40) / 3 - s.heat.local / 12) });
  if (c.patronage) out.push({ label: `Patronage jobs (${c.patronage})`, value: c.patronage * 4 });
  for (const d of c.dirty) out.push({ label: DIRTY_INFO[d].name, value: DIRTY_INFO[d].votes });
  if (ct?.owner) out.push({ label: `${ct.owner === 'philly' ? 'Philadelphia' : ct.owner} money behind him`, value: 4 });
  if (p.charId && s.pol!.kids[p.charId]) out.push({ label: 'Your family\'s name (both ways)', value: Math.round(s.respect / 20 - s.heat.local / 15) });
  return out.filter((x) => x.value !== 0);
}

function total(lines: ScoreLine[]): number {
  return lines.reduce((a, l) => a + l.value, 0);
}

/** Expected shares (no noise) — what the UI shows as the polls. */
export function polls(s: GameState, e: Election): Record<string, number> {
  const scores = e.candidates.map((c) => total(candidateScore(s, e, c)));
  return shares(e.candidates.map((c) => c.id), scores);
}

function shares(ids: string[], scores: number[]): Record<string, number> {
  const ex = scores.map((v) => Math.exp(v / 10));
  const sum = ex.reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, number> = {};
  ids.forEach((id, i) => (out[id] = Math.round((1000 * ex[i]) / sum) / 10));
  return out;
}

/* ------------------------------------------------------------------ */
/* Opening races                                                       */
/* ------------------------------------------------------------------ */

/** Monthly: open the races due within CAMPAIGN_MONTHS and fill their tickets. */
export function openRaces(s: GameState): void {
  const pol = s.pol!;
  const now = mIdx(s.date.y, s.date.m);
  for (const def of OFFICE_DEFS) {
    if (def.selection !== 'elected' || !officeActive(s, def)) continue;
    const o = pol.offices[def.id];
    const byWhen = new Map<number, number[]>();
    o.next.forEach((w, i) => {
      if (w && w - now <= CAMPAIGN_MONTHS && w >= now) byWhen.set(w, [...(byWhen.get(w) ?? []), i]);
    });
    for (const [when, seats] of byWhen) {
      if (pol.elections.some((e) => e.office === def.id && e.when === when && e.seats.some((x) => seats.includes(x)))) continue;
      pol.elections.push({ id: `el${when}_${def.id}_${seats.join('')}`, office: def.id, seats, when, candidates: [] });
    }
  }
  for (const e of pol.elections) if (!e.candidates.length) fillTicket(s, e);
}

/** Incumbents who run again, the boss's children who declared, and challengers from the pool. */
export function fillTicket(s: GameState, e: Election): void {
  const pol = s.pol!;
  const def = OFFICE_BY_ID[e.office];
  const r: RngHolder = { rng: hashSeed(`${s.seed}:${e.id}:ticket`) };
  const cands: Candidate[] = [];
  const add = (p: PolPerson, incumbent: boolean, party?: Party) => {
    if (cands.some((c) => c.id === p.id)) return;
    cands.push({ id: p.id, party: def.partisan ? party ?? p.party ?? 'R' : undefined, incumbent, fund: 0, patronage: 0, dirty: [] });
  };
  for (const seat of e.seats) {
    const h = holder(s, def.id, seat);
    if (!h || !h.alive) continue;
    const a = s.date.y - h.born;
    const limited = def.termLimit > 0 && (h.terms ?? 1) >= def.termLimit;
    const quits = a >= 74 ? rand(r) < 0.6 : a >= 68 ? rand(r) < 0.2 : h.scandal >= 60 ? rand(r) < 0.5 : false;
    if (!limited && !quits) add(h, true);
  }
  for (const [charId, k] of Object.entries(pol.kids)) {
    if (k.office !== def.id) continue;
    const p = Object.values(pol.people).find((x) => x.charId === charId && x.alive);
    if (p && !(p.seat && p.seat.startsWith(`${def.id}#`))) add(p, false, p.party ?? 'D');
  }
  const want = def.partisan ? Math.max(2, e.seats.length + 1) : e.seats.length + Math.max(1, Math.ceil(e.seats.length / 2));
  const parties: Party[] = ['D', 'R'];
  const pool = Object.values(pol.people)
    .filter((p) => p.alive && !p.retired && !p.charId && !cands.some((c) => c.id === p.id) && def.pool.includes(p.inst) && s.date.y - p.born >= 27 && s.date.y - p.born <= 70)
    .filter((p) => !p.seat || seatRank(p.seat) < def.rung + levelBonus(def))
    .map((p) => ({ p, v: p.strength + (p.dyn ? 10 : 0) + p.ambition / 5 + rand(r) * 25 }))
    .sort((a, b) => b.v - a.v || (a.p.id < b.p.id ? -1 : 1));
  let guard = 0;
  while (cands.length < want && guard++ < 10) {
    const needParty = def.partisan ? parties.find((pt) => !cands.some((c) => c.party === pt)) : undefined;
    const next = pool.find((x) => !cands.some((c) => c.id === x.p.id) && (!needParty || !x.p.party || x.p.party === needParty));
    if (next) add(next.p, false, needParty ?? next.p.party);
    else {
      const g = generated(s, def.inst, `cand:${e.id}:${cands.length}`, { rung: Math.max(0, def.rung - 1), party: needParty });
      g.born = Math.min(g.born, s.date.y - 32);
      pol.people[g.id] = g;
      add(g, false, needParty);
    }
  }
  e.candidates = cands;
}

function seatRank(key: string): number {
  const def = OFFICE_BY_ID[key.slice(0, key.lastIndexOf('#'))];
  return def ? def.rung + levelBonus(def) : 0;
}
function levelBonus(def: OfficeDef): number {
  return def.level === 'city' ? 0 : def.level === 'county' ? 2 : def.level === 'state' ? 4 : 6;
}

/* ------------------------------------------------------------------ */
/* Election day                                                        */
/* ------------------------------------------------------------------ */

/** Runs every race whose month has come (first week of the month). Returns the results. */
export function runElections(ctx: Ctx): ElectionResult[] {
  const s = ctx.s;
  const pol = s.pol!;
  const now = mIdx(s.date.y, s.date.m);
  const due = pol.elections.filter((e) => e.when <= now);
  if (!due.length) return [];
  pol.elections = pol.elections.filter((e) => e.when > now);
  const out: ElectionResult[] = [];
  for (const e of due) {
    const r = resolveElection(ctx, e);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Deterministic for a given seed, race and set of choices: the noise comes
 * from a stream seeded by the game seed and the race id, not the week's dice.
 */
export function resolveElection(ctx: Ctx, e: Election): ElectionResult | undefined {
  const s = ctx.s;
  const pol = s.pol!;
  const def = OFFICE_BY_ID[e.office];
  if (!def) return undefined;
  if (!e.candidates.length) fillTicket(s, e);
  const live = e.candidates.filter((c) => pol.people[c.id]?.alive);
  if (!live.length) return undefined;
  const r: RngHolder = { rng: hashSeed(`${s.seed}:${e.id}:vote`) };
  const scores = live.map((c) => total(candidateScore(s, { ...e, candidates: live }, c)) + gauss(r) * 5);
  const sh = shares(live.map((c) => c.id), scores);
  const ranked = live.map((c, i) => ({ c, v: scores[i] })).sort((a, b) => b.v - a.v || (a.c.id < b.c.id ? -1 : 1));
  const winners = ranked.slice(0, e.seats.length).map((x) => x.c);
  const turnout = Math.round(48 + rand(r) * 22 + (def.level === 'federal' || def.id === 'nj_governor' ? 10 : 0));
  // Seat the winners: incumbents keep their own seats, newcomers fill the rest.
  const freeSeats = e.seats.filter((seat) => !winners.some((w) => w.incumbent && pol.offices[def.id].holders[seat] === w.id));
  for (const w of winners) {
    const seat = w.incumbent ? pol.offices[def.id].holders.indexOf(w.id) : freeSeats.shift() ?? e.seats[0];
    assignSeat(s, w.id, def.id, seat >= 0 ? seat : e.seats[0], e.special ? 'Won a special election' : w.incumbent ? 'Re-elected' : 'Elected');
  }
  for (const seat of e.seats) pol.offices[def.id].next[seat] = e.when + def.termYears * 12;
  // Losing incumbents go home.
  for (const c of live) if (c.incumbent && !winners.includes(c)) {
    const p = mutP(s, c.id);
    if (p) addLog(p, s.date.y, `Lost re-election as ${def.short}`);
  }
  pol.stats.elections++;
  if (live.some((c) => c.incumbent)) {
    pol.stats.contested++;
    if (winners.some((w) => w.incumbent)) pol.stats.incumbentWins++;
  }
  // The commission chooses its mayor again after a commission election.
  for (const d of OFFICE_DEFS) if (d.selection === 'chosen' && d.by === def.id) chooseFromBody(s, d);

  const backed = live.filter((c) => c.fund > 0 || c.endorsed || c.patronage > 0 || c.dirty.length || c.puppet);
  const res: ElectionResult = {
    id: e.id,
    office: def.id,
    seats: e.seats.slice(),
    when: e.when,
    week: s.week,
    winners: winners.map((w) => w.id),
    shares: sh,
    names: Object.fromEntries(live.map((c) => [c.id, `${nameOf(s, pol.people[c.id])}${c.party ? ` (${c.party})` : ''}`])),
    turnout,
    headline: '',
    paper: def.level === 'city' || def.level === 'county' ? 'Wildwood Leader' : 'Philadelphia Bulletin',
    fallout: [],
    ...(e.special ? { special: true } : {}),
  };
  if (backed.length) res.backed = backed[0].id;
  res.headline = headline(s, def, res, winners, live);

  // Your candidates: the winners owe you; the winners you fought remember.
  for (const c of live) {
    const won = winners.includes(c);
    const helped = c.fund > 0 || c.endorsed || c.patronage > 0 || c.dirty.length > 0 || c.puppet;
    if (!won) continue;
    if (helped) {
      const ct = ctlOf(s, c.id);
      ct.financial = Math.min(100, ct.financial + Math.min(40, Math.round(c.fund / 400)) + c.patronage * 5);
      ct.personal = Math.min(100, ct.personal + (c.endorsed ? 15 : 0) + 5);
      if (c.puppet) {
        ct.puppet = true;
        ct.personal = Math.max(ct.personal, 60);
        ct.financial = Math.max(ct.financial, 60);
        ct.independence = Math.min(ct.independence, 25);
      }
      if (c.dirty.includes('fraud')) ct.legitimacy = Math.max(0, ct.legitimacy - 10);
      ct.exposure = Math.min(100, ct.exposure + c.dirty.length * 6);
    } else if (backed.length) {
      const ct = ctlOf(s, c.id);
      ct.resentment = Math.min(100, ct.resentment + 15);
    }
    const p = pol.people[c.id];
    if (p?.charId && pol.kids[p.charId]) {
      pol.stats.kidWins++;
      pol.kids[p.charId].office = undefined;
    }
  }
  if (live.some((c) => c.dirty.length)) pol.stats.fraud++;

  // The dirty work comes due.
  const fallout = dirtyFallout(s, e, live, winners, sh, r);
  if (fallout) {
    res.fallout.push(fallout.title);
    s.eventQueue.push(fallout);
  }
  pol.results = [...pol.results, res].slice(-40);
  pol.night = [...pol.night, res];
  s.news.push({ week: s.week, date: { ...s.date }, paper: res.paper, headline: res.headline, body: resultBody(res), kind: 'election' });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${res.headline.charAt(0)}${res.headline.slice(1).toLowerCase()}.`, kind: 'misc' });
  return res;
}

function headline(s: GameState, def: OfficeDef, res: ElectionResult, winners: Candidate[], live: Candidate[]): string {
  const w = s.pol!.people[winners[0].id];
  const last = (w ? (s.characters[w.charId ?? '']?.lastName ?? w.last) : '?').toUpperCase();
  const sorted = Object.values(res.shares).sort((a, b) => b - a);
  const margin = sorted.length > 1 ? sorted[0] - sorted[1] : 100;
  const upset = live.some((c) => c.incumbent && !winners.includes(c));
  const where = def.level === 'city' ? def.short.toUpperCase() : def.title.toUpperCase();
  if (winners.length > 1) return `${winners.map((c) => (s.pol!.people[c.id]?.last ?? '?').toUpperCase()).join(', ')} TAKE ${def.juris === 'wildwood' ? 'WILDWOOD' : def.juris === 'crest' ? 'CREST' : def.juris === 'ac' ? 'ATLANTIC CITY' : ''} COMMISSION`.replace('  ', ' ');
  if (upset) return `UPSET! ${last} OUSTS INCUMBENT FOR ${where}`;
  if (margin < 3) return `${last} WINS ${where} BY A WHISKER; RECOUNT TALK`;
  if (winners[0].incumbent) return `${last} RE-ELECTED ${where}`;
  return `${last} ELECTED ${where}`;
}

function resultBody(res: ElectionResult): string {
  const parts = Object.entries(res.shares).sort((a, b) => b[1] - a[1]).map(([id, v]) => `${res.names[id]} ${v.toFixed(1)}%`);
  return `${parts.join(', ')}. Turnout ${res.turnout}%.${res.special ? ' A special election.' : ''}`;
}

/**
 * Abstract illegal help comes due as one event: a recount, a court
 * challenge, an investigation, a backlash. Each choice lists its effects.
 */
function dirtyFallout(s: GameState, e: Election, live: Candidate[], winners: Candidate[], sh: Record<string, number>, r: RngHolder): EventInstance | undefined {
  const pol = s.pol!;
  const def = OFFICE_BY_ID[e.office];
  const dirty = live.filter((c) => c.dirty.length);
  if (!dirty.length) return undefined;
  const sorted = Object.values(sh).sort((a, b) => b - a);
  const close = sorted.length > 1 && sorted[0] - sorted[1] < 5;
  const risk = Math.min(0.9, Math.max(...dirty.flatMap((c) => c.dirty.map((d) => DIRTY_INFO[d].risk))) + (close ? 0.15 : 0) + lawFraudRisk(s) + (pol.crackdown && s.week < pol.crackdown.until ? 0.1 : 0) + 0.05 * (dirty[0].dirty.length - 1));
  if (rand(r) >= risk) return undefined;
  const c = dirty[0];
  const p = pol.people[c.id];
  if (!p) return undefined;
  const nm = nameOf(s, p);
  const won = winners.includes(c);
  const label = `Election fallout: ${def.short}`;
  const ops = c.dirty;
  const kind = ops.includes('fraud') ? 'fraud' : ops.includes('coerce') ? 'coerce' : ops.includes('intimidate') ? 'intimidate' : 'bribe';
  const T: Record<DirtyOp, { title: string; text: string }> = {
    fraud: { title: 'A recount, and a court challenge', text: `The losing side found ballots that should not have counted in the ${def.title} race. A judge orders a recount; the County Prosecutor wants to know who arranged the count.${won ? ` If it goes against ${nm}, the seat goes to a special election.` : ''}` },
    intimidate: { title: 'Backlash at the polls', text: `Voters told the Leader about large men near the polling places. Ministers preach about it; a grand jury is asking about the ${def.title} race.` },
    bribe: { title: 'An investigation into the precinct money', text: `A precinct worker kept the envelope and called the Prosecutor. Investigators are asking who paid for the ${def.title} vote.` },
    coerce: { title: 'The man who counts is talking', text: 'The County Clerk did what you asked, and he has been drinking about it. He told someone. Now he wants assurances.' },
  };
  const voided = won && kind === 'fraud';
  const ride: Effect[] = [
    { type: 'heat', bar: 'local', amount: kind === 'intimidate' ? 6 : 8, label },
    { type: 'evidence', charId: s.playerId, amount: kind === 'bribe' ? 5 : 6, label },
    ...(kind === 'intimidate' ? [{ type: 'respect', amount: -4, label } as Effect] : []),
    { type: 'pol', op: { op: 'legit', id: c.id, amount: kind === 'intimidate' ? -20 : -30 }, label },
    ...(voided ? [{ type: 'pol', op: { op: 'void', id: c.id, office: def.id }, label } as Effect] : []),
    ...(kind === 'coerce' ? [{ type: 'pol', op: { op: 'resent', id: holder(s, 'cmc_clerk')?.id ?? c.id, amount: 30 }, label } as Effect] : []),
    { type: 'pol', op: { op: 'crackdown', reason: 'election fraud', weeks: 13 }, label },
  ];
  const choices: Choice[] = [
    { id: 'lawyers', label: 'Lawyers and a quiet word with the judge', detail: '$3,000. The worst of it goes away.', because: 'paid lawyers to bury the election fallout', effects: [{ type: 'money', amount: -3000, label }, { type: 'heat', bar: 'local', amount: 3, label }, { type: 'evidence', charId: s.playerId, amount: 2, label }, { type: 'pol', op: { op: 'legit', id: c.id, amount: -10 }, label }], disabledReason: s.money < 3000 ? 'Needs $3,000' : undefined },
    { id: 'sacrifice', label: `Let ${p.first} take the fall`, detail: won ? 'He resigns; a special election. Nothing reaches you.' : 'He carries it alone. Nothing reaches you.', because: `let ${p.first} ${p.last} take the fall for the election`, effects: [{ type: 'pol', op: { op: 'resign', id: c.id }, label }, { type: 'respect', amount: -2, label }, { type: 'pol', op: { op: 'resent', id: c.id, amount: 40 }, label }] },
    { id: 'ride', label: 'Ride it out', detail: 'Say nothing. Let them dig.', because: 'rode out the election fallout', effects: ride },
  ];
  return {
    iid: `ev${s.nextId++}`, defId: 'pol_fallout', week: s.week, mandatory: true, priority: 70,
    title: T[kind].title, text: T[kind].text, choices, defaultChoiceId: 'ride', meta: { election: e.id, person: c.id },
    actors: [s.playerId, ...(p.charId ? [p.charId] : [])],
  };
}

/** Months until a race, for the calendar. */
export function whenLabel(when: number): string {
  return mName(when);
}

/** Upcoming regular elections (next per office), sorted by date — the calendar. */
export function calendar(s: GameState, horizonYears = 4): { when: number; office: OfficeDef; seats: number[]; open: boolean }[] {
  const pol = s.pol;
  if (!pol) return [];
  const now = mIdx(s.date.y, s.date.m);
  const out: { when: number; office: OfficeDef; seats: number[]; open: boolean }[] = [];
  for (const def of OFFICE_DEFS) {
    if (!officeActive(s, def)) continue;
    const o = pol.offices[def.id];
    const m = new Map<number, number[]>();
    o.next.forEach((w, i) => {
      if (w && w >= now && w - now <= horizonYears * 12) m.set(w, [...(m.get(w) ?? []), i]);
    });
    for (const [when, seats] of m) out.push({ when, office: def, seats, open: pol.elections.some((e) => e.office === def.id && e.when === when) });
  }
  for (const e of pol.elections) if (e.special) out.push({ when: e.when, office: OFFICE_BY_ID[e.office], seats: e.seats, open: true });
  return out.sort((a, b) => a.when - b.when || (a.office.id < b.office.id ? -1 : 1));
}

/** Puts a person on the ballot as your puppet (a clean front with your money behind him). */
export function addPuppet(s: GameState, e: Election): PolPerson {
  const pol = s.pol!;
  const def = OFFICE_BY_ID[e.office];
  const owned = Object.values(pol.people).find((p) => p.alive && !p.seat && !p.charId && pol.ctl[p.id] && pol.ctl[p.id].personal + pol.ctl[p.id].financial >= 100 && def.pool.includes(p.inst) && !e.candidates.some((c) => c.id === p.id));
  const p = owned ?? (() => {
    const g = generated(s, def.inst, `puppet:${e.id}`, { rung: Math.max(0, def.rung - 1), party: def.partisan ? (def.lean >= 0 ? 'D' : 'R') : undefined });
    g.born = Math.min(g.born, s.date.y - 34);
    g.strength = Math.max(g.strength, 45);
    g.integrity = Math.min(g.integrity, 45);
    pol.people[g.id] = g;
    return g;
  })();
  promoteToFull(s, p.id);
  e.candidates.push({ id: p.id, party: def.partisan ? p.party ?? 'R' : undefined, incumbent: false, fund: 0, patronage: 0, dirty: [], puppet: true });
  return p;
}
