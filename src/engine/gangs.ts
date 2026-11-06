import type { ActionPreview } from './actions';
import { shiftInfluence } from './effects';
import type { FamAction, FamOp } from './familyWeb';
import { setView } from './familyWeb';
import type { Acceptance, Reason } from './interactions';
import { journal } from './journal';
import { heat, money, respect, rivalMoneyHit, type Ctx } from './ledger';
import { hashSeed, rand } from './rng';
import type { EventInstance, GameState, RivalId } from './types';

/**
 * GANGS THAT CROP UP. Not families: outlaw biker clubs that ride in for the
 * summer rallies on the Shore, and street crews (Irish, Polish, Black, Puerto
 * Rican, mixed) that move in where there is an opening: a district nobody
 * holds, the boss's places with no capo watching them, a war that has
 * everyone looking the other way. They make trouble (shakedowns, fights,
 * heat), grow or fade, and a rival may hire them. The boss can fight them,
 * buy them off, recruit them or partner with them; each with its odds shown,
 * results in Your File. All names are fictional. Nobody of the boss's is
 * killed or handed over: a lost fight costs respect, money and heat.
 *
 * Lives on `s.gangs` (optional; made the first week it is needed, so a fresh
 * game and an old save are the same). Its dice are its own.
 */

export type GangKind = 'bikers' | 'irish' | 'polish' | 'black' | 'pr' | 'mixed';
export type GangHow = 'fight' | 'buy' | 'recruit' | 'partner';

export interface Gang {
  id: string;
  kind: GangKind;
  name: string;
  leader: string;
  district: string;
  size: number;
  since: number;
  status: 'trouble' | 'paid' | 'partner';
  /** Paid off until this week. */
  until?: number;
  /** What brought them (the opening). */
  why: string;
  /** A rival family that hired them. */
  patron?: RivalId;
}

export interface GangState {
  rng: number;
  next: number;
  list: Gang[];
  log: { w: number; t: string }[];
  cd: Record<string, number>;
}

export const KIND_LABEL: Record<GangKind, string> = {
  bikers: 'an outlaw motorcycle club', irish: 'an Irish street crew', polish: 'a Polish street crew', black: 'a Black street crew', pr: 'a Puerto Rican street crew', mixed: 'a mixed street crew',
};

/** What each kind wants, in the boss's words. */
export const KIND_WANT: Record<GangKind, string> = {
  bikers: 'beer, the boardwalk bars, and nobody telling them where to park',
  irish: 'the bars\' protection money and the after-hours trade',
  polish: 'the docks\' loose freight and a piece of the card games',
  black: 'the numbers on their own blocks, without paying anybody',
  pr: 'the summer jobs on the piers and a corner of their own',
  mixed: 'whatever nobody is watching',
};

const NAMES: Record<GangKind, string[]> = {
  bikers: ['the Pine Barrens Jackals MC', 'the Tuckahoe Road Saints MC', 'the Cape Highway Vultures MC', 'the Delaware Bay Drifters MC'],
  irish: ['the Fishtown Shamrocks', 'the Kerry Street Boys'],
  polish: ['the Port Richmond Eagles', 'the Allegheny Avenue Hawks'],
  black: ['the Lombard Street Royals', 'the Baltic Avenue Kings'],
  pr: ['the Spring Garden Lions', 'the Fairmount Coquis'],
  mixed: ['the Rio Grande Avenue Boys', 'the Back Bay Rats'],
};

const LEADERS: Record<GangKind, string[]> = {
  bikers: ['"Tiny" Earl Schaefer', 'Dutch "Spokes" Harnish', 'Buck "Gravel" Loomis', 'Ray "Torch" Pruitt'],
  irish: ['Mike "the Mick" Dolan', 'Jackie Furlong'],
  polish: ['Stan "Big Stosh" Wojcik', 'Eddie Pawlak'],
  black: ['Calvin "Sweets" Holloway', 'Leon Mabry'],
  pr: ['Ángel "Cuco" Santiago', 'Luis "Lucky" Ortega'],
  mixed: ['Frankie "Two Ways" Novak', 'Sonny Kaplan'],
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const MAX_LIVE = 3;

function ensureGangs(s: GameState): GangState {
  if (!s.gangs) s.gangs = { rng: hashSeed(`${s.seed}:gangs`), next: 1, list: [], log: [], cd: {} };
  return s.gangs;
}

export function gangsOf(s: GameState): Gang[] {
  return s.gangs?.list ?? [];
}

export function gangById(s: GameState, id: string): Gang | undefined {
  return s.gangs?.list.find((g) => g.id === id);
}

function districtName(s: GameState, id: string): string {
  return s.districts.find((d) => d.id === id)?.name ?? id;
}

function say(s: GameState, st: GangState, t: string, x?: string, heard = false): void {
  st.log.push({ w: s.week, t });
  if (st.log.length > 12) st.log.splice(0, st.log.length - 12);
  journal(s, { t, ...(x ? { x } : {}), c: 'town', src: 'gangs', ln: 'diplomacy.board', ...(heard ? { k: 'heard' as const } : {}) });
}

/* ------------------------------------------------------------------ */
/* The odds                                                             */
/* ------------------------------------------------------------------ */

/** The boss's men on the street (soldiers and associates). */
function streetMen(s: GameState): number {
  return Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && (c.rank === 'soldier' || c.rank === 'associate' || c.rank === 'capo')).length;
}

/** What it costs to buy them off for a season. */
export function buyCost(g: Gang): number {
  return Math.round((g.size * 80) / 50) * 50;
}

export function gangOdds(s: GameState, g: Gang, how: GangHow): Acceptance {
  const infl = s.districts.find((d) => d.id === g.district)?.influence.player ?? 0;
  const parts: Reason[] = [];
  let base = 0;
  switch (how) {
    case 'fight':
      base = 45;
      parts.push({ label: `Your men on the street (${streetMen(s)})`, value: Math.min(20, Math.round(streetMen(s) * 0.8)) });
      parts.push({ label: `Your hold on ${districtName(s, g.district)} (${infl})`, value: Math.round((infl - 20) * 0.4) });
      parts.push({ label: `Their numbers (${g.size})`, value: -Math.round(g.size * 0.7) });
      break;
    case 'buy':
      base = 70;
      parts.push({ label: `Their numbers (${g.size})`, value: -Math.round(g.size * 0.4) });
      break;
    case 'recruit':
      base = 25;
      parts.push({ label: `Their numbers (${g.size}): a big crew wants its own name`, value: -Math.round(g.size * 0.4) });
      if (g.status === 'partner') parts.push({ label: 'Already partners', value: 25 });
      if (g.kind === 'bikers') parts.push({ label: 'Bikers answer to their club, not to you', value: -15 });
      break;
    case 'partner':
      base = 50;
      parts.push({ label: `Their numbers (${g.size})`, value: -Math.round(g.size * 0.2) });
      break;
  }
  parts.push({ label: `Your respect (${Math.round(s.respect)})`, value: Math.round((s.respect - 50) * (how === 'fight' ? 0.3 : 0.4)) });
  if (g.patron && how !== 'fight') parts.push({ label: `${s.rivals.find((r) => r.id === g.patron)?.shortName ?? 'A rival'} pays them already`, value: -20 });
  const sum = base + parts.reduce((a, p) => a + p.value, 0);
  return { chance: clamp(sum, 8, 90) / 100, reasons: [{ label: 'Base', value: base }, ...parts.filter((p) => p.value)] };
}

const HOW_TITLE: Record<GangHow, string> = { fight: 'Run them off', buy: 'Buy them off for a season', recruit: 'Recruit them', partner: 'Go into partnership with them' };

function howDetail(s: GameState, g: Gang, how: GangHow, pct: number): string {
  const d = districtName(s, g.district);
  switch (how) {
    case 'fight': return `${pct}%: they are gone, respect +2, your hold on ${d} +2; otherwise respect −2, doctors' bills (${fmt(200 + g.size * 20)}) and they grow bolder. Local heat +3 either way. Your men come home.`;
    case 'buy': return `${pct}%: ${fmt(buyCost(g))} and they leave you alone for a season (13 weeks); otherwise they keep the envelope's promise for nobody and respect −1 (the money stays home).`;
    case 'recruit': return `${pct}%: they come over to your house: they are gone as a gang, your hold on ${d} +4, respect +1; otherwise they laugh at the offer, respect −1.`;
    case 'partner': return `${pct}%: they work your side of ${d} and pay you a piece every week (about ${fmt(g.size * 8)}), no more trouble from them; local heat +2, and Philadelphia thinks a little less of you for the company (−2). Otherwise nothing changes.`;
  }
}

export function previewGang(s: GameState, a: Extract<FamAction, { op: 'gang' }>): ActionPreview {
  const g = gangById(s, a.id);
  const base = { effects: [], cost: 0, category: 'cost' as const, because: '' };
  if (!g) return { ...base, title: HOW_TITLE[a.how], disabledReason: 'They are gone' };
  const acc = gangOdds(s, g, a.how);
  const pct = Math.round(acc.chance * 100);
  const cost = a.how === 'buy' ? buyCost(g) : 0;
  const block = a.how === 'partner' && g.status === 'partner' ? 'Already partners'
    : a.how === 'buy' && g.status === 'paid' ? `Paid until week ${g.until}`
      : a.how === 'buy' && s.money < cost ? 'Not enough money' : undefined;
  return {
    ...base, title: `${HOW_TITLE[a.how]}: ${g.name}`, cost, because: `${a.how === 'fight' ? 'ran off' : a.how === 'buy' ? 'bought off' : a.how === 'recruit' ? 'recruited' : 'went into partnership with'} ${g.name}`,
    detail: howDetail(s, g, a.how, pct),
    effects: [{ type: 'fam', op: { op: 'gang', id: g.id, how: a.how, chance: 1, ...(cost ? { cost } : {}) } }],
    refuseEffects: [{ type: 'fam', op: { op: 'gang', id: g.id, how: a.how, chance: 0 } }],
    acceptance: acc, oddsLabel: a.how === 'fight' ? 'You run them off' : a.how === 'buy' ? 'They take the money and keep their word' : 'They say yes',
    ...(block ? { disabledReason: block } : {}),
  };
}

/** The four orders on a gang's card (UI): op: 'gang'. */
export function gangActions(g: Gang): FamAction[] {
  return (['fight', 'buy', 'recruit', 'partner'] as const).map((how) => ({ op: 'gang' as const, id: g.id, how }));
}

/* ------------------------------------------------------------------ */
/* Applying                                                             */
/* ------------------------------------------------------------------ */

function drop(st: GangState, id: string): void {
  st.list = st.list.filter((g) => g.id !== id);
}

export function applyGangOp(ctx: Ctx, o: Extract<FamOp, { op: 'gang' }>): void {
  const s = ctx.s;
  const st = ensureGangs(s);
  const g = st.list.find((x) => x.id === o.id);
  if (!g) return;
  const d = districtName(s, g.district);
  if (o.how === 'ignore') {
    say(s, st, `You let ${g.name} be, for now.`);
    return;
  }
  const win = rand(st) < o.chance;
  const pct = o.chance > 0 && o.chance < 1 ? ` (it was ${Math.round(o.chance * 100)}%)` : '';
  switch (o.how) {
    case 'fight':
      heat(ctx, 'local', 3, `A street fight with ${g.name}`, 'heat');
      if (win) {
        respect(ctx, 2, `Ran ${g.name} off`, 'event');
        shiftInfluence(s, g.district, 'player', 2);
        drop(st, g.id);
        say(s, st, `Your men ran ${g.name} out of ${d}`, `Respect +2, your hold on ${d} +2, local heat +3${pct}. Your men came home.`);
      } else {
        respect(ctx, -2, `${g.name} stood their ground`, 'event');
        money(ctx, -(200 + g.size * 20), 'Doctors\' bills after the fight', 'cost');
        g.size += 3;
        say(s, st, `${g.name} stood their ground in ${d}`, `Respect −2, doctors' bills, local heat +3; they are bolder now (${g.size} strong)${pct}. Your men came home bruised.`);
      }
      return;
    case 'buy':
      if (win) {
        money(ctx, -(o.cost ?? buyCost(g)), `Bought off ${g.name}`, 'cost');
        g.status = 'paid';
        g.until = s.week + 13;
        say(s, st, `${g.name} took your envelope`, `${fmt(o.cost ?? buyCost(g))}: they leave you alone until week ${g.until}${pct}.`);
      } else {
        respect(ctx, -1, `${g.name} laughed at the envelope`, 'event');
        say(s, st, `${g.name} would not be bought`, `They laughed at the envelope; the money stayed home, respect −1${pct}.`);
      }
      return;
    case 'recruit':
      if (win) {
        respect(ctx, 1, `${g.name} came over to your house`, 'event');
        shiftInfluence(s, g.district, 'player', 4);
        drop(st, g.id);
        say(s, st, `${g.name} came over to your house`, `${g.leader} and his ${g.size} work for you now: your hold on ${d} +4, respect +1${pct}.`);
      } else {
        respect(ctx, -1, `${g.name} laughed at the offer`, 'event');
        say(s, st, `${g.name} would not come over`, `They want their own name; respect −1${pct}.`);
      }
      return;
    case 'partner':
      if (win) {
        g.status = 'partner';
        delete g.until;
        heat(ctx, 'local', 2, `Partners with ${g.name}`, 'heat');
        setView(s, 'philly', -2, 'Keeps company with street gangs');
        say(s, st, `Partners with ${g.name}`, `They work your side of ${d} and pay you a piece every week; local heat +2, Philadelphia −2${pct}.`);
      } else {
        say(s, st, `${g.name} would not partner`, `They will not work with you; nothing changes${pct}.`);
      }
      return;
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

const summer = (s: GameState) => s.date.m >= 6 && s.date.m <= 8;

/** The openings a gang moves into: why, where, and what kind. */
function openings(s: GameState, st: GangState): { why: string; district: string; kinds: GangKind[]; p: number }[] {
  const out: { why: string; district: string; kinds: GangKind[]; p: number }[] = [];
  const live = new Set(st.list.map((g) => g.district));
  if (summer(s) && !st.list.some((g) => g.kind === 'bikers')) {
    out.push({ why: 'a summer motorcycle rally on the Shore', district: rand(st) < 0.5 ? 'causeway' : 'boardwalk', kinds: ['bikers'], p: 0.1 });
  }
  for (const d of s.districts) {
    if (live.has(d.id)) continue;
    const top = Math.max(0, ...Object.entries(d.influence).filter(([k]) => k !== 'none').map(([, v]) => v ?? 0));
    if (top < 30) out.push({ why: `nobody really holds ${d.name}`, district: d.id, kinds: ['irish', 'polish', 'black', 'pr', 'mixed'], p: 0.03 });
    const mine = s.businesses.filter((b) => b.districtId === d.id).length;
    if (mine >= 2 && !d.capoId) out.push({ why: `your places in ${d.name} have no capo watching them`, district: d.id, kinds: ['irish', 'polish', 'mixed'], p: 0.025 });
  }
  for (const w of s.wars) {
    const d = s.districts.find((x) => !live.has(x.id) && (x.influence[w.rival as RivalId] ?? 0) > 0 && (x.influence.player ?? 0) > 0);
    if (d) out.push({ why: 'the war has everyone looking the other way', district: d.id, kinds: ['irish', 'black', 'pr', 'mixed'], p: 0.05 });
  }
  return out;
}

function choices(s: GameState, g: Gang): EventInstance['choices'] {
  const ign = { id: 'ignore', label: 'Let them be for now', detail: 'Certain: nothing now. They will make trouble, and they may grow or a rival may hire them.', because: `let ${g.name} be`, effects: [{ type: 'fam' as const, op: { op: 'gang' as const, id: g.id, how: 'ignore' as const, chance: 1 } }] };
  const rest = (['fight', 'buy', 'recruit', 'partner'] as const).filter((how) => !(how === 'partner' && g.status === 'partner') && !(how === 'buy' && s.money < buyCost(g))).map((how) => {
    const acc = gangOdds(s, g, how);
    const pct = Math.round(acc.chance * 100);
    return {
      id: how, label: `${HOW_TITLE[how]}${how === 'buy' ? ` (${fmt(buyCost(g))})` : ''} (${pct}%)`, detail: howDetail(s, g, how, pct),
      because: `${how === 'fight' ? 'tried to run off' : how === 'buy' ? 'tried to buy off' : how === 'recruit' ? 'tried to recruit' : 'offered a partnership to'} ${g.name}`,
      effects: [{ type: 'fam' as const, op: { op: 'gang' as const, id: g.id, how, chance: acc.chance, ...(how === 'buy' ? { cost: buyCost(g) } : {}) } }],
    };
  });
  return [ign, ...rest];
}

function gangEvent(s: GameState, g: Gang, defId: string, title: string, text: string): EventInstance {
  return {
    iid: `ev${s.nextId++}`, defId, week: s.week, mandatory: false, priority: 50, title, text,
    choices: choices(s, g), defaultChoiceId: 'ignore', meta: { gang: g.id }, actors: [],
  };
}

const pending = (s: GameState, defId: string) => s.eventQueue.some((e) => e.defId === defId) || s.pendingEvents.some((e) => e.defId === defId);

/**
 * The gangs' week (engine.ts): a new gang moves into an opening; the ones
 * here make trouble, pay their partners, grow, fade, or get hired by a rival.
 */
export function gangsWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.rivals?.length || s.gameOver || !s.districts?.length) return;
  // Nothing to do until there is an opening or a gang (no state in a quiet game).
  if (!s.gangs && !summer(s) && !s.wars.length && !s.districts.some((d) => Math.max(0, ...Object.entries(d.influence).filter(([k]) => k !== 'none').map(([, v]) => v ?? 0)) < 30)) return;
  const st = ensureGangs(s);
  const w = s.week;
  // A new gang.
  if (st.list.length < MAX_LIVE && (st.cd.any ?? 0) <= w) {
    for (const o of openings(s, st)) {
      if (rand(st) >= o.p) continue;
      const kind = o.kinds[Math.floor(rand(st) * o.kinds.length)];
      const used = new Set(st.list.map((g) => g.name));
      const names = NAMES[kind].filter((n) => !used.has(n));
      if (!names.length) continue;
      const g: Gang = {
        id: `g${st.next++}`, kind, name: names[Math.floor(rand(st) * names.length)], leader: LEADERS[kind][Math.floor(rand(st) * LEADERS[kind].length)],
        district: o.district, size: kind === 'bikers' ? 20 + Math.floor(rand(st) * 25) : 6 + Math.floor(rand(st) * 12), since: w, status: 'trouble', why: o.why,
      };
      st.list.push(g);
      st.cd.any = w + 6;
      st.cd[`remind:${g.id}`] = w + 8;
      say(s, st, `${g.name} turned up in ${districtName(s, g.district)}`, `${KIND_LABEL[kind]}, ${g.size} strong, led by ${g.leader}, came because ${o.why}. They want ${KIND_WANT[kind]}.`);
      if (!pending(s, 'gang_new')) s.eventQueue.push(gangEvent(s, g, 'gang_new', `${g.name} in ${districtName(s, g.district)}`, `${KIND_LABEL[kind][0].toUpperCase()}${KIND_LABEL[kind].slice(1)}, ${g.size} strong, led by ${g.leader}, has turned up in ${districtName(s, g.district)}: they came because ${o.why}. They want ${KIND_WANT[kind]}. Your men are asking what you want done.`));
      break;
    }
  }
  const monthly = (st.cd.month ?? 0) <= w;
  if (monthly) st.cd.month = w + 4;
  for (const g of [...st.list]) {
    const d = districtName(s, g.district);
    if (g.status === 'paid' && (g.until ?? 0) <= w) { g.status = 'trouble'; delete g.until; say(s, st, `${g.name}'s season is up`, `The envelope ran out; they are back to making trouble in ${d}.`, true); }
    // Bikers ride home after Labor Day.
    if (g.kind === 'bikers' && s.date.m >= 9) { drop(st, g.id); say(s, st, `${g.name} rode home after Labor Day`, `The rally is over; ${d} is quiet again.`, true); continue; }
    if (g.status === 'partner') {
      money(ctx, g.size * 8, `${g.name}: your piece`, 'street');
      if (w % 2 === 0) heat(ctx, 'local', 1, `${g.name} on your side of ${d}`, 'heat');
    } else if (g.status === 'trouble' && rand(st) < 0.3) {
      const k = Math.floor(rand(st) * 3);
      if (k === 0) rivalMoneyHit(ctx, g.size * 15, `${g.name} shook down your places in ${d}`, 0.15);
      else if (k === 1) respect(ctx, -1, `${g.name} beat up a bartender of yours in ${d}`, 'rival');
      else heat(ctx, 'local', 2, `${g.name} brawling in ${d}`, 'heat');
    }
    if (!monthly) continue;
    // Grow or fade.
    if (g.status === 'trouble' && rand(st) < 0.4) g.size += Math.max(1, Math.round(g.size * 0.1));
    else if (g.kind !== 'bikers' && rand(st) < 0.08 + (g.size < 6 ? 0.3 : 0)) { drop(st, g.id); say(s, st, `${g.name} broke up`, `Some went to jail, some went straight; ${d} is quiet again.`, true); continue; }
    // A rival hires them.
    if (g.status === 'trouble' && !g.patron && rand(st) < 0.12) {
      const rv = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
      if (rv.length) {
        const r = rv[Math.floor(rand(st) * rv.length)];
        g.patron = r.id;
        r.muscle = clamp(r.muscle + 2, 5, 100);
        say(s, st, `${r.shortName} hired ${g.name}`, `${g.name} works for ${r.shortName} now (their muscle +2); buying or recruiting them will be harder.`, true);
      }
    }
    // A reminder while they make trouble.
    if (g.status === 'trouble' && (st.cd[`remind:${g.id}`] ?? 0) <= w && !pending(s, 'gang_trouble') && !pending(s, 'gang_new')) {
      st.cd[`remind:${g.id}`] = w + 10;
      s.eventQueue.push(gangEvent(s, g, 'gang_trouble', `${g.name} is still making trouble in ${d}`, `${g.leader}'s ${KIND_LABEL[g.kind].replace(/^an? /, '')}, ${g.size} strong now${g.patron ? `, on ${s.rivals.find((r) => r.id === g.patron)?.shortName}'s payroll` : ''}, is shaking down your places and brawling in ${d}. They want ${KIND_WANT[g.kind]}.`));
    }
  }
  for (const k of Object.keys(st.cd)) if (k.startsWith('remind:') && !st.list.some((g) => `remind:${g.id}` === k)) delete st.cd[k];
}
