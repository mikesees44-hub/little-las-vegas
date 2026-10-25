import { ITEMS_BY_ID, type ItemCat } from './empireCatalog';
import { deptOf, roomCount, seatsOf } from './empireBuild';
import { CONCEPTS, DEPTS, HOUSEKEEPING, STAFFING } from './empireData';
import { xid, type Department, type DeptKind, type EmpireState, type Employment, type Venue } from './empireState';
import { FEMALE_FIRST, MALE_FIRST, SURNAMES } from './names';
import { inflation } from './property';
import { chance, pick, randInt } from './rng';
import type { Character, Ethnicity, GameState } from './types';

/**
 * Staff (Module 6): every worker is a persistent person with a wage, a
 * skill that grows, satisfaction, ambition and a history. Department heads
 * can be a staffer you promote, a pro you hire, or someone of yours: the
 * wife, a grown son or daughter, an in-law, a man from the crew. Workers
 * quit when they are overworked or underpaid; the ambitious ones leave to
 * open a place of their own across the street.
 */

/** What the department's work needs this week, in staff (before the staffing policy). */
export function workload(e: EmpireState, v: Venue, kind: DeptKind, w: { roomNights: number; covers: number; drinks: number; clubGuests: number; spaVisits: number; washes: number; open: boolean; inSeason: boolean }): number {
  if (!w.open) return 0;
  // Service standards: a boutique or a resort staffs every post deeper.
  const svc = v.concept === 'luxury_resort' ? 2.4 : v.concept === 'boutique' ? 1.5 : 1;
  return base(e, v, kind, w) * (['front', 'housekeeping', 'dining', 'kitchen', 'bar', 'security', 'maintenance'].includes(kind) ? svc : 1);
}

function base(e: EmpireState, v: Venue, kind: DeptKind, w: Parameters<typeof workload>[3]): number {
  const rooms = roomCount(e, v);
  const c = CONCEPTS[v.concept];
  const work = (cats: ItemCat[]) => 1 + cats.reduce((a, cat) => a + (ITEMS_BY_ID[v.durables[cat]?.item ?? v.stock[cat]?.item ?? '']?.work ?? 0), 0);
  switch (kind) {
    case 'front': return c.kind !== 'lodging' ? 0 : v.concept === 'rooming' ? 0.6 + rooms / 60 : Math.max(1.5, 1.5 + rooms / 40) * (v.concept === 'hourly_motel' ? 1.4 : 1);
    case 'housekeeping': {
      const perDay = w.roomNights / 7 * (v.concept === 'hourly_motel' ? 0.7 : v.concept === 'rooming' ? 0.45 : 1);
      return perDay / HOUSEKEEPING[v.policy.housekeeping].rooms * work(['cleaning', 'carpet', 'towels', 'mattress']) + (rooms ? 0.5 : 0);
    }
    case 'laundry': return w.washes / 7 / 110 * work(['sheets', 'towels']);
    case 'maintenance': return Math.max(1, rooms / 28 + (seatsOf(e, v, 'dining') ? 0.4 : 0) + (v.amenities.includes('pool') ? 0.4 : 0)) * work(['mattress', 'pool_chemicals']);
    case 'dining': return w.covers ? Math.max(2, w.covers / 7 / 32) : 0;
    case 'kitchen': return w.covers ? Math.max(1.5, w.covers / 7 / 65) * work(['kitchen']) : 0;
    case 'bar': return w.drinks ? Math.max(1, w.drinks / 7 / 160) * work(['bar_equipment']) : 0;
    case 'club': return w.clubGuests ? Math.max(1, w.clubGuests / 7 / 55) : 0;
    case 'pool': return w.inSeason ? 1 : 0;
    case 'spa': return w.spaVisits ? Math.max(1, w.spaVisits / 7 / 8) : 0;
    case 'security': return (v.concept === 'hourly_motel' ? 1.5 : 0) + (rooms >= 40 ? 1 + rooms / 100 : 0) + (seatsOf(e, v, 'club') ? 1.5 : 0) + (c.kind === 'bar' ? 0.5 : 0);
    case 'admin': return rooms >= 40 ? 1 + rooms / 120 : 0;
    case 'marketing': return v.concept === 'luxury_resort' ? 1 : 0;
    case 'parking': return v.concept === 'luxury_resort' ? 2 : 0;
  }
  return 0;
}

/** The staff a department should carry for a forecast week (the policy's cushion included). */
export function staffTarget(e: EmpireState, v: Venue, kind: DeptKind, w: Parameters<typeof workload>[3]): number {
  const need = workload(e, v, kind, w) * STAFFING[v.policy.staffing].mult;
  return need <= 0 ? 0 : Math.max(1, Math.round(need));
}

export function deptStaff(e: EmpireState, d: Department): Employment[] {
  return Object.values(e.staff).filter((x) => x.deptId === d.id);
}

export function marketWage(s: GameState, kind: DeptKind, head = false): number {
  return Math.round(DEPTS[kind].wage * (head ? 1.45 : 1) * inflation(s));
}

const ETH: Ethnicity[] = ['Italian', 'Irish', 'Jewish', 'Italian', 'Irish'];

/** A new local hire (a persistent person: the name stays with the record). */
export function newWorker(s: GameState, e: EmpireState, v: Venue, d: Department, opts: { seasonal?: boolean; head?: boolean; skill?: number } = {}): Employment {
  const eth = pick(e, ETH);
  const female = ['housekeeping', 'laundry', 'spa'].includes(d.kind) ? chance(e, 0.85) : ['dining', 'club', 'front'].includes(d.kind) ? chance(e, 0.5) : chance(e, 0.12);
  const first = pick(e, (female ? FEMALE_FIRST : MALE_FIRST)[eth]);
  const last = pick(e, SURNAMES[eth]);
  const skill = opts.skill ?? (opts.head ? randInt(e, 45, 80) : randInt(e, 20, 65));
  const w: Employment = {
    id: xid(e, 'em'), venueId: v.id, deptId: d.id, name: `${first} ${last}`, female, source: 'local', role: opts.head ? 'head' : 'staff',
    wage: Math.round(marketWage(s, d.kind, opts.head) * (0.85 + skill / 300)), skill, satisfaction: 60 + randInt(e, 0, 15), xp: 0, since: s.week,
    ambition: randInt(e, 5, 95), seasonal: opts.seasonal, trained: 0,
  };
  e.staff[w.id] = w;
  v.staffIds.push(w.id);
  if (opts.head) d.headId = w.id;
  e.stats.hires++;
  return w;
}

/** Someone of yours heads a department: the wife, a grown son, a crew man. */
export function charHead(s: GameState, e: EmpireState, v: Venue, d: Department, c: Character, source: 'family' | 'crew'): Employment {
  dismissHead(e, v, d, 'replaced');
  const skill = Math.round(c.attributes.business * 0.75 + c.attributes.discipline * 0.25);
  const w: Employment = {
    id: xid(e, 'em'), venueId: v.id, deptId: d.id, name: `${c.firstName} ${c.lastName}`, female: c.gender === 'F', charId: c.id, source, role: 'head',
    wage: Math.round(marketWage(s, d.kind, true) * (source === 'family' ? 0.8 : 1)), skill, satisfaction: 70, xp: 0, since: s.week,
    ambition: 40, trained: 0,
  };
  e.staff[w.id] = w;
  v.staffIds.push(w.id);
  d.headId = w.id;
  return w;
}

/** Promote the best staffer in the department to head it. */
export function promote(s: GameState, e: EmpireState, v: Venue, d: Department, empId?: string): Employment | undefined {
  const list = deptStaff(e, d).filter((x) => x.role === 'staff' && !x.seasonal);
  const w = empId ? list.find((x) => x.id === empId) : list.sort((a, b) => b.skill - a.skill)[0];
  if (!w) return undefined;
  dismissHead(e, v, d, 'replaced');
  w.role = 'head';
  w.source = w.charId ? w.source : 'promoted';
  w.wage = Math.max(w.wage, Math.round(marketWage(s, d.kind, true) * (0.85 + w.skill / 300)));
  w.satisfaction = Math.min(100, w.satisfaction + 20);
  d.headId = w.id;
  return w;
}

export function dismissHead(e: EmpireState, v: Venue, d: Department, why: string): void {
  const h = d.headId ? e.staff[d.headId] : undefined;
  d.headId = undefined;
  if (!h) return;
  if (h.charId) { removeWorker(e, v, h, why); return; }
  h.role = 'staff';
}

export function removeWorker(e: EmpireState, v: Venue, w: Employment, why: string, week?: number): void {
  delete e.staff[w.id];
  v.staffIds = v.staffIds.filter((x) => x !== w.id);
  const d = e.depts[w.deptId];
  if (d?.headId === w.id) d.headId = undefined;
  if (!w.charId) {
    v.alumni.push({ name: w.name, week: week ?? 0, why });
    if (v.alumni.length > 30) v.alumni.splice(0, v.alumni.length - 30);
  }
}

/** The head's skill multiplier on the department (0.85 .. 1.2). */
export function headMult(e: EmpireState, d: Department | undefined): number {
  const h = d?.headId ? e.staff[d.headId] : undefined;
  return h ? 0.85 + h.skill / 280 : 0.9;
}

/** How well a department copes this week: staff on hand vs the work (0..1.2), with skill. */
export function adequacy(e: EmpireState, v: Venue, kind: DeptKind, need: number): number {
  const d = deptOf(e, v, kind);
  if (!d || need <= 0) return 1;
  const staff = deptStaff(e, d);
  const prod = staff.reduce((a, x) => a + 0.75 + x.skill / 200, 0) * headMult(e, d);
  return Math.max(0, Math.min(1.2, prod / need));
}


