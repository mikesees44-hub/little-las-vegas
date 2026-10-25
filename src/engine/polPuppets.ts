import { LADDERS, PEOPLE_BY_ID, type LadderId } from '../worldpack';
import { crew, isFree } from './characters';
import { money, type Ctx } from './ledger';
import { rand } from './rng';
import { controlBreakdown, controlIndex } from './polIntegrity';
import { FAVORS, OFFICE_BY_ID, OFFICE_DEFS, type FavorKind, type OfficeDef } from './polData';
import { ctlOf, holder, nameOf, officesOf, peekCtl } from './polGov';
import { lawFavorReasons, lawFlipRisk, lawKidExposure } from './polLaws';
import { isOfficial } from './polPeople';
import { clamp100, type Ctl, type PolPerson } from './polState';
import type { Character, Effect, EventInstance, GameState } from './types';
import type { Acceptance, Reason } from './interactions';

/**
 * Puppet officials. Influence is not control: each official keeps a sheet
 * (personal and financial relationship, independence, legitimacy, exposure,
 * resentment) and the control index decides what he will do for you. 70+ he
 * does favors (and can still betray you), 40-69 he resists big asks, under 40
 * he is his own man or hostile. Officials refuse, report you, resign or flip.
 * Your influence stops at the Governor and the congressmen.
 */

export function ci(s: GameState, id: string): number {
  const c = peekCtl(s, id);
  return c ? controlIndex(c) : 0;
}

/** The offices a person holds that can do favors, with the favors. */
export function favorsFor(s: GameState, p: PolPerson): { kind: FavorKind; office: OfficeDef }[] {
  const out: { kind: FavorKind; office: OfficeDef }[] = [];
  for (const { office } of officesOf(s, p.id)) for (const k of office.favors) if (!out.some((x) => x.kind === k)) out.push({ kind: k, office });
  return out;
}

/** The highest office he holds (for reach). */
export function topOffice(s: GameState, p: PolPerson): OfficeDef | undefined {
  return officesOf(s, p.id).map((x) => x.office).sort((a, b) => b.rung - a.rung)[0];
}

function isKid(s: GameState, p: PolPerson): boolean {
  return !!p.charId && !!s.pol?.kids[p.charId];
}

/** Acceptance odds of a favor, every reason named. */
export function favorAcceptance(s: GameState, p: PolPerson, kind: FavorKind): Acceptance {
  const c = peekCtl(s, p.id)!;
  const idx = controlIndex(c);
  const f = FAVORS[kind];
  const reasons: Reason[] = [
    { label: `Control index ${idx}`, value: Math.round((idx - 40) * 0.9) },
    { label: `Integrity ${p.integrity}`, value: -Math.round((p.integrity - 50) * 0.6) },
  ];
  if (f.size === 1) reasons.push({ label: 'A real favor', value: -10 });
  if (f.size === 2) reasons.push({ label: 'A big ask', value: -25 });
  if (f.size === 2 && idx < 70) reasons.push({ label: 'Resists big requests (control under 70)', value: -15 });
  if (c.exposure > 0) reasons.push({ label: `Scrutiny on him ${Math.round(c.exposure)}`, value: -Math.round(c.exposure * 0.3) });
  if (c.asked !== undefined && s.week - c.asked < 8) reasons.push({ label: 'You asked recently', value: -15 });
  if (c.owner) reasons.push({ label: `Also owned by ${c.owner === 'philly' ? 'Philadelphia' : c.owner}`, value: -12 });
  if (c.puppet) reasons.push({ label: 'Your puppet', value: 10 });
  if (c.flipped) reasons.push({ label: 'He is talking to investigators', value: -50 });
  if (isKid(s, p)) reasons.push({ label: 'Your own blood', value: 25 });
  if (s.pol?.crackdown && s.week < s.pol.crackdown.until) reasons.push({ label: 'War on organized crime', value: -15 });
  reasons.push(...lawFavorReasons(s, kind));
  const sum = reasons.reduce((a, r) => a + r.value, 25);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons: [{ label: 'Base', value: 25 }, ...reasons.filter((r) => r.value !== 0)] };
}

/** Odds for putting a man on the payroll. */
export function payrollAcceptance(s: GameState, p: PolPerson): Acceptance {
  const c = peekCtl(s, p.id)!;
  const reasons: Reason[] = [
    { label: `Integrity ${p.integrity}`, value: -Math.round((p.integrity - 50) * 0.9) },
    { label: `Personal relationship ${Math.round(c.personal)}`, value: Math.round(c.personal * 0.3) },
    ...p.traits.filter((t) => t === 'Greedy' || t === 'Honest' || t === 'Gambler' || t === 'Paranoid').map((t) => ({ label: t, value: t === 'Greedy' ? 20 : t === 'Gambler' ? 10 : t === 'Honest' ? -30 : -10 })),
  ];
  if (c.owner) reasons.push({ label: `Already paid by ${c.owner}`, value: -10 });
  if (s.pol?.crackdown && s.week < s.pol.crackdown.until) reasons.push({ label: 'War on organized crime', value: -15 });
  if (isKid(s, p)) reasons.push({ label: 'Your own blood', value: 40 });
  const sum = reasons.reduce((a, r) => a + r.value, 40);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons: [{ label: 'Base', value: 40 }, ...reasons.filter((r) => r.value !== 0)] };
}

/** The weekly envelope for his rung (world-pack ladders). */
export function envelope(p: PolPerson): number {
  const r = LADDERS[p.ladder as LadderId]?.rungs[p.rung];
  return Math.max(25, Math.round((r?.envelope || 40) / 5) * 5);
}

/** Something to dig up: the pack's own secrets, or what a low-integrity man always has. */
export function dirtOn(p: PolPerson): string | undefined {
  const w = PEOPLE_BY_ID[p.id];
  const sec = w?.secrets.filter((x) => x.severity >= 2 && x.kind !== 'illness' && x.kind !== 'family').sort((a, b) => b.severity - a.severity)[0];
  if (sec) return sec.text;
  if (p.scandal >= 30) return 'The story behind last year\'s scandal, with names';
  if (p.integrity < 45) return 'He takes envelopes; somebody kept the receipts';
  return undefined;
}

/* ------------------------------------------------------------------ */
/* What a favor does                                                   */
/* ------------------------------------------------------------------ */

export interface FavorPlan {
  effects: Effect[];
  disabled?: string;
  target?: string;
}

function inside(s: GameState): Character[] {
  return crew(s).filter((c) => !isFree(s, c) && c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week);
}

export function favorPlan(s: GameState, p: PolPerson, kind: FavorKind, office: OfficeDef): FavorPlan {
  const label = `Favor from ${nameOf(s, p)}: ${FAVORS[kind].name.toLowerCase()}`;
  const ex = (n: number): Effect => ({ type: 'pol', op: { op: 'ctl', id: p.id, field: 'exposure', amount: n * (isKid(s, p) ? 2 + lawKidExposure(s) : 1) }, label });
  const spend: Effect = { type: 'pol', op: { op: 'asked', id: p.id }, label };
  switch (kind) {
    case 'zoning': {
      const fronts = s.businesses.filter((b) => b.owner === 'player' && b.category === 'front').length;
      return { effects: [{ type: 'pol', op: { op: 'boon', key: `zoning:${p.id}`, label: `Zoning variance (${nameOf(s, p)})`, amount: 120 + fronts * 20, weeks: 26 }, label }, spend, ex(4)], disabled: fronts ? undefined : 'You own no fronts to rezone' };
    }
    case 'license': {
      const closed = s.businesses.find((b) => b.owner === 'player' && (b.closedUntil ?? 0) > s.week);
      return {
        effects: [
          ...(closed ? [{ type: 'pol', op: { op: 'reopen', businessId: closed.id }, label } as Effect] : [{ type: 'pol', op: { op: 'boon', key: `license:${p.id}`, label: `Licenses protected (${nameOf(s, p)})`, amount: 150, weeks: 26 }, label } as Effect]),
          { type: 'heat', bar: 'local', amount: -3, label }, spend, ex(6),
        ],
      };
    }
    case 'sentence':
    case 'pardon': {
      const man = inside(s).sort((a, b) => (b.imprisonedUntil ?? 0) - (a.imprisonedUntil ?? 0))[0];
      return { effects: man ? [{ type: 'pol', op: { op: 'release', charId: man.id, full: kind === 'pardon' }, label }, spend, ex(kind === 'pardon' ? 15 : 8)] : [], disabled: man ? undefined : 'None of your men is inside', target: man?.id };
    }
    case 'case': {
      const fed = office.level === 'federal';
      const target = crew(s).filter((c) => (c.evidence ?? 0) >= 10 && c.id !== s.playerId).sort((a, b) => (b.evidence ?? 0) - (a.evidence ?? 0))[0];
      const effs: Effect[] = [{ type: 'heat', bar: office.juris === 'philly' ? 'family' : 'local', amount: -8, label }, spend, ex(10)];
      if (target) effs.unshift({ type: 'evidence', charId: target.id, amount: -20, label });
      else effs.unshift({ type: 'evidence', charId: s.playerId, amount: fed ? -10 : -5, label: `${label} (the county stops sharing its files)` });
      return { effects: effs, target: target?.id };
    }
    case 'transfer': {
      const bar = office.juris === 'philly' ? 'family' : 'local';
      return { effects: [{ type: 'heat', bar, amount: -10, label }, { type: 'pol', op: { op: 'boon', key: `transfer:${p.id}`, label: `Friendly beat cops (${nameOf(s, p)})`, amount: 0, weeks: 13, heat: -1 }, label }, spend, ex(6)] };
    }
    case 'casino': {
      const ok = s.goals.casinoStage === 2;
      return { effects: [{ type: 'pol', op: { op: 'casinoLicense' }, label }, spend, ex(15)], disabled: ok ? undefined : 'You have no license application before the Commission' };
    }
    case 'contract': {
      const builder = s.businesses.some((b) => b.owner === 'player' && b.kind === 'construction');
      const base = office.level === 'federal' ? 9000 : office.level === 'state' ? 6000 : office.level === 'county' ? 4000 : 2500;
      const amt = builder ? base : Math.round(base / 2);
      return { effects: [{ type: 'money', amount: amt, label: `${label}${builder ? '' : ' (a subcontract: you own no construction company)'}`, category: 'business' }, spend, ex(8)] };
    }
    case 'appoint': {
      const offices = OFFICE_DEFS.filter((d) => d.selection === 'appointed' && officesOf(s, p.id).some((x) => x.office.id === d.by));
      const man = ownedCandidate(s, offices);
      return {
        effects: man ? [{ type: 'pol', op: { op: 'appointWish', office: man.office.id, person: man.p.id, weeks: 52 }, label }, spend, ex(10)] : [],
        disabled: !offices.length ? 'He appoints nobody' : man ? undefined : 'You have no man for any office he fills (own a lawyer, a cop or a politician first)',
        target: man?.p.id,
      };
    }
  }
}

/** Your man for an appointed office: somebody you own in its pool, or one of your children in politics. */
export function ownedCandidate(s: GameState, offices: OfficeDef[]): { p: PolPerson; office: OfficeDef } | undefined {
  const pol = s.pol!;
  for (const d of offices) {
    const best = Object.values(pol.people)
      .filter((p) => p.alive && !p.retired && !p.seat && (d.pool.includes(p.inst) || (p.charId && pol.kids[p.charId])) && ci(s, p.id) >= 50)
      .sort((a, b) => ci(s, b.id) - ci(s, a.id))[0];
    if (best) return { p: best, office: d };
  }
  return undefined;
}

/** What happens if he says no: shown as chips with the odds. */
export function refusalEffects(s: GameState, p: PolPerson, label: string): Effect[] {
  const c = peekCtl(s, p.id)!;
  const report = Math.min(0.6, (p.integrity >= 60 ? 0.3 : 0.08) + (s.pol?.crackdown && s.week < s.pol.crackdown.until ? 0.1 : 0));
  const resign = c.exposure >= 50 && p.seat ? 0.12 : 0;
  const flip = controlIndex(c) < 40 && c.exposure >= 40 ? 0.1 + lawFlipRisk(s) : 0;
  return [
    { type: 'pol', op: { op: 'ctl', id: p.id, field: 'resentment', amount: 5 }, label },
    { type: 'pol', op: { op: 'refusal', id: p.id, report, resign, flip }, label },
  ];
}

/* ------------------------------------------------------------------ */
/* Monthly: the sheets drift; some men turn                            */
/* ------------------------------------------------------------------ */

export function puppetsMonth(ctx: Ctx): void {
  const s = ctx.s;
  const pol = s.pol!;
  const crack = !!pol.crackdown && s.week < pol.crackdown.until;
  for (const id of Object.keys(pol.ctl).sort()) {
    const p = pol.people[id];
    const c = pol.ctl[id];
    if (!p || !p.alive) {
      delete pol.ctl[id];
      continue;
    }
    c.personal = Math.max(0, c.personal - 1);
    c.financial = c.payroll ? Math.min(90, c.financial + 3) : Math.max(0, c.financial - 2);
    c.exposure = clamp100(c.exposure + (c.payroll ? 1 : 0) + (c.puppet ? 1 : 0) + (crack ? 2 : 0) - 2);
    c.resentment = Math.max(0, c.resentment - 1);
    if (p.seat) c.independence = clamp100(c.independence + (c.legitimacy > 55 ? 1 : 0) - (c.puppet ? 1 : 0));
    c.legitimacy = clamp100(c.legitimacy + (c.legitimacy < 60 ? 1 : -1) - (p.scandal > 40 ? 2 : 0));
    const idx = controlIndex(c);
    // A man you owned grows strong enough to resist.
    if (idx >= 70 && c.legitimacy > 70 && rand(pol) < 0.01) {
      c.independence = clamp100(c.independence + 30);
      ctx.log.push(`${nameOf(s, p)} has grown strong enough to stop taking your calls.`);
    }
    // The puppet arrangement comes out.
    if (c.puppet && c.exposure >= 70 && rand(pol) < 0.08) {
      s.eventQueue.push(puppetExposed(s, p));
      c.puppet = false;
      continue;
    }
    // Low control and high pressure: he turns.
    if (!c.flipped && idx < 40 && (c.resentment >= 50 || c.exposure >= 60) && (c.financial > 0 || c.dirt || c.puppet) && rand(pol) < 0.04 + lawFlipRisk(s) + (crack ? 0.03 : 0)) {
      c.flipped = true;
      pol.stats.flips++;
      s.eventQueue.push(flippedEvent(s, p));
      continue;
    }
    // Too hot to stay.
    if (p.seat && c.exposure >= 85 && rand(pol) < 0.1) s.eventQueue.push(resignEvent(s, p));
  }
}

/** Weekly payroll envelopes and favors still paying, as named lines. */
export function payrollWeek(ctx: Ctx): void {
  const s = ctx.s;
  const pol = s.pol!;
  for (const id of Object.keys(pol.ctl).sort()) {
    const c = pol.ctl[id];
    const p = pol.people[id];
    if (!c.payroll) continue;
    if (!p?.alive) {
      c.payroll = undefined;
      continue;
    }
    money(ctx, -c.payroll, `Payroll: ${nameOf(s, p)} (${shortTitle(s, p)})`, 'cost');
  }
  for (const [k, b] of Object.entries(pol.boons).sort()) {
    if (b.until < s.week) {
      delete pol.boons[k];
      continue;
    }
    if (k.startsWith('appoint:')) continue;
    if (b.amount) money(ctx, b.amount, `Favor: ${b.label}`, 'business');
  }
}

export function shortTitle(s: GameState, p: PolPerson): string {
  const o = officesOf(s, p.id).map((x) => x.office).sort((a, b) => b.rung - a.rung)[0];
  return o ? o.short : p.title.split(',')[0];
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function ev(s: GameState, defId: string, p: PolPerson, title: string, text: string, choices: EventInstance['choices'], def: string): EventInstance {
  return { iid: `ev${s.nextId++}`, defId, week: s.week, mandatory: false, priority: 66, title, text, choices, defaultChoiceId: def, meta: { person: p.id }, actors: [s.playerId, ...(p.charId ? [p.charId] : [])] };
}

export function flippedEvent(s: GameState, p: PolPerson): EventInstance {
  const nm = nameOf(s, p);
  const label = `${nm} is talking`;
  return ev(s, 'pol_flip', p, `${shortTitle(s, p)} ${p.last} is talking`, `Word from the courthouse: ${nm} has been seen going into the Prosecutor's office by the side door. Whatever he did for you, he is describing it now.`, [
    { id: 'pay', label: 'Make it worth his while to forget', detail: '$5,000, and he may stay bought.', because: `paid ${nm} to forget`, effects: [{ type: 'money', amount: -5000, label }, { type: 'pol', op: { op: 'unflip', id: p.id }, label }, { type: 'pol', op: { op: 'ctl', id: p.id, field: 'financial', amount: 20 }, label }], disabledReason: s.money < 5000 ? 'Needs $5,000' : undefined },
    { id: 'scare', label: 'Have somebody explain the facts of life', detail: 'He stops talking. He will never forgive it.', because: `had ${nm} frightened into silence`, effects: [{ type: 'pol', op: { op: 'unflip', id: p.id }, label }, { type: 'pol', op: { op: 'ctl', id: p.id, field: 'resentment', amount: 40 }, label }, { type: 'heat', bar: 'local', amount: 6, label }] },
    { id: 'cut', label: 'Cut every tie and let him talk', detail: 'He tells what he knows.', because: `cut ${nm} loose`, effects: [{ type: 'evidence', charId: s.playerId, amount: 4, label }, { type: 'pol', op: { op: 'cut', id: p.id }, label }] },
  ], 'cut');
}

function puppetExposed(s: GameState, p: PolPerson): EventInstance {
  const nm = nameOf(s, p);
  const label = `The arrangement with ${nm} comes out`;
  return ev(s, 'pol_puppet', p, 'A puppet\'s strings show', `The Bulletin has the story: ${nm} was put in office with your money and takes your calls. Editorials, a grand jury, and the reformers smell blood.`, [
    { id: 'deny', label: 'Deny everything; lawyers for him', detail: '$4,000. He keeps the seat, for now.', because: `defended ${nm} when the arrangement came out`, effects: [{ type: 'money', amount: -4000, label }, { type: 'heat', bar: 'local', amount: 6, label }, { type: 'pol', op: { op: 'legit', id: p.id, amount: -25 }, label }, { type: 'pol', op: { op: 'crackdown', reason: 'a puppet official exposed', weeks: 26 }, label }], disabledReason: s.money < 4000 ? 'Needs $4,000' : undefined },
    { id: 'resign', label: 'He resigns "for his health"', detail: 'A special election; the story dies with the seat.', because: `had ${nm} resign`, effects: [{ type: 'pol', op: { op: 'resign', id: p.id }, label }, { type: 'heat', bar: 'local', amount: 3, label }, { type: 'evidence', charId: s.playerId, amount: 3, label }] },
  ], 'resign');
}

function resignEvent(s: GameState, p: PolPerson): EventInstance {
  const nm = nameOf(s, p);
  const label = `${nm} wants out`;
  return ev(s, 'pol_resign', p, `${shortTitle(s, p)} ${p.last} wants out`, `${nm} says the reporters are at his house every morning. He wants to resign before somebody makes him.`, [
    { id: 'let', label: 'Let him go quietly', because: `let ${nm} resign`, effects: [{ type: 'pol', op: { op: 'resign', id: p.id }, label }] },
    { id: 'hold', label: 'Tell him to hold on', detail: 'He stays, sweating. The scrutiny climbs.', because: `told ${nm} to hold on`, effects: [{ type: 'pol', op: { op: 'ctl', id: p.id, field: 'resentment', amount: 15 }, label }, { type: 'pol', op: { op: 'ctl', id: p.id, field: 'exposure', amount: 5 }, label }] },
  ], 'let');
}

/* ------------------------------------------------------------------ */
/* Kids in politics                                                    */
/* ------------------------------------------------------------------ */

/** Can this member of the house go into politics? */
export function kidBlock(s: GameState, c: Character): string | undefined {
  const a = s.date.y - c.birth.y;
  if (!c.alive || !c.dynasty || c.id === s.playerId) return 'Not a member of the house';
  if (a < 21) return 'Too young (21+)';
  if (c.rank !== 'civilian') return 'A made man cannot run for office';
  if ((c.record ?? 0) > 0) return 'He has a record';
  if (!isFree(s, c)) return 'He is in jail';
  if (s.pol?.kids[c.id]) return 'Already in politics';
  return undefined;
}

/** Which offices a child can run for now (the ladder: city → county/Assembly → Senate/Congress → Governor; never higher). */
export function kidOffices(s: GameState, c: Character): { office: OfficeDef; why?: string }[] {
  const k = s.pol?.kids[c.id];
  if (!k) return [];
  const held = new Set(k.held);
  const levelHeld = (lv: string) => [...held].some((id) => OFFICE_BY_ID[id]?.level === lv);
  const p = Object.values(s.pol!.people).find((x) => x.charId === c.id);
  const strength = p?.strength ?? 0;
  const out: { office: OfficeDef; why?: string }[] = [];
  for (const d of OFFICE_DEFS) {
    if (d.selection !== 'elected' || !d.reach) continue;
    if (d.juris === 'philly' || d.juris === 'ac') continue;
    let why: string | undefined;
    if (d.id === 'nj_assembly_cm' || d.level === 'county') why = levelHeld('city') || levelHeld('county') ? undefined : 'Needs a city office first';
    if (d.id === 'nj_senate_cm' || d.level === 'federal') why = levelHeld('state') || held.has('cmc_freeholder') ? undefined : 'Needs the Assembly or the freeholders first';
    if (d.id === 'nj_governor') why = held.has('nj_senate_cm') || levelHeld('federal') ? (strength >= 65 ? undefined : 'Needs strength 65') : 'Needs the State Senate or Congress first';
    if (d.id === 'nw_mayor') why = levelHeld('city') ? undefined : 'Needs a city office first';
    if (p?.seat?.startsWith(`${d.id}#`)) continue;
    out.push({ office: d, ...(why ? { why } : {}) });
  }
  return out;
}

/** A conflict of interest: your child in office votes on the family's business. */
export function kidConflict(s: GameState): EventInstance | undefined {
  const pol = s.pol!;
  const kids = Object.keys(pol.kids).map((id) => Object.values(pol.people).find((p) => p.charId === id && p.alive && p.seat)).filter((p): p is PolPerson => !!p);
  if (!kids.length) return undefined;
  if (rand(pol) >= 0.06 * (1 + lawKidExposure(s))) return undefined;
  const p = kids[Math.floor(rand(pol) * kids.length)];
  const nm = nameOf(s, p);
  const label = `Conflict of interest: ${nm}`;
  const off = shortTitle(s, p);
  return ev(s, 'pol_conflict', p, `${off} ${p.first} votes on the family`, `A license for one of the family's places is on the agenda, and ${nm} has the deciding vote. The Leader's man is in the front row with his pencil out.`, [
    { id: 'recuse', label: `${p.first} recuses himself`, detail: 'Clean hands. The license waits.', because: `had ${p.first} recuse himself`, effects: [{ type: 'pol', op: { op: 'legit', id: p.id, amount: 6 }, label }] },
    { id: 'vote', label: `${p.first} votes for it`, detail: 'The license goes through. The papers notice.', because: `had ${p.first} vote on the family's license`, effects: [{ type: 'pol', op: { op: 'boon', key: `kidvote:${p.id}`, label: `License through ${p.first}'s vote`, amount: 140, weeks: 26 }, label }, { type: 'pol', op: { op: 'ctl', id: p.id, field: 'exposure', amount: 12 * (1 + lawKidExposure(s)) }, label }, { type: 'heat', bar: 'local', amount: 3, label }] },
    { id: 'others', label: `${p.first} works on the others`, detail: 'He gets the votes and keeps his own off the record. Costs him with his colleagues.', because: `had ${p.first} whip the votes for the family`, effects: [{ type: 'pol', op: { op: 'boon', key: `kidvote:${p.id}`, label: `License through ${p.first}'s friends`, amount: 140, weeks: 26 }, label }, { type: 'pol', op: { op: 'ctl', id: p.id, field: 'independence', amount: -5 }, label }, { type: 'pol', op: { op: 'strength', id: p.id, amount: -4 }, label }] },
  ], 'recuse');
}

export function breakdown(c: Ctl): Reason[] {
  return controlBreakdown(c);
}

/** Every official you have a sheet on, by control. */
export function myOfficials(s: GameState): { p: PolPerson; c: Ctl; idx: number }[] {
  const pol = s.pol;
  if (!pol) return [];
  return Object.entries(pol.ctl)
    .map(([id, c]) => ({ p: pol.people[id], c, idx: controlIndex(c) }))
    .filter((x): x is { p: PolPerson; c: Ctl; idx: number } => !!x.p && x.p.alive && isOfficial(x.p) && (x.c.personal > 5 || x.c.financial > 0 || !!x.c.puppet || !!x.c.dirt || x.c.resentment > 0 || !!x.p.charId))
    .sort((a, b) => b.idx - a.idx);
}

export { ctlOf, holder };
