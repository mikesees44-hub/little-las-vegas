import { capos, crew, displayName, isFree, makeCharacter, player } from './characters';
import { holder } from './council';
import { adultOn } from './datingState';
import { fmtMoney } from './effects';
import { addStory, giveBio, tidyRegimes } from './hierarchy';
import type { Ctx } from './ledger';
import { PETITION_TEMPLATES, type PBg, type PLater, type PTpl, type PV } from './petitionData';
import { addOpinion, getRelation } from './relations';
import { stationOf } from './rankView';
import { chance, hashSeed, rand, randInt, type RngHolder } from './rng';
import type { Character, Effect, Ethnicity, EventInstance, GameState, Rival, ScheduledConsequence } from './types';

/**
 * THE PETITIONERS: the town at the boss's door. A deep bed of ordinary people (widows, mothers, wives,
 * a seamstress, a barber, a fisherman, a veteran, the parish priest) who bring the boss the trouble they
 * cannot take to City Hall. Nothing here is a new popup: the templates (petitionData.ts) fill the slots
 * that already exist, the Office's Sunday petition (office.ts officeWeek) and, now and then, the audience
 * chamber's slot (audience.ts). Each is an ordinary EventInstance (`office_<id>`, the petitioner in
 * `actors` and `meta.charId`, `meta.favor` set), so the Office door, the Desk, the inbox and any option
 * offered on favor cards see it like every other ask.
 *
 * Variety: a template never comes back within ten weeks (and rarely within a year); one person brings at
 * most two petitions a season (13 weeks); the season weighs the pool (summer the boardwalk, winter the
 * rent and the oil man); the boss's name weighs it too (a feared boss gets fewer small petitioners and
 * more desperate ones; a beloved one more of both); a man in somebody's ranks gets the neighborhood's
 * small troubles only. Mature content Off hides the madam's petitions.
 *
 * Consequences later go through the existing delayed-consequence queue (the `schedule` effect,
 * consequences.ts): the favor is returned, the son reports for work, the man who was turned away goes to
 * a rival. Each writes a chronicle line. The picker draws no dice from the game's stream (hash rolls and
 * its own holder), so a week without a petition plays exactly as before.
 *
 * State (`s.petitions`) is optional and made with the first petition; a fresh game has none.
 */

export interface PetitionsState {
  /** Recent petitions: template, week, petitioner (capped). */
  log: { t: string; w: number; who: string }[];
}

export const PETITION_REPEAT_WEEKS = 10;
export const PETITION_SEASON_WEEKS = 13;
export const PETITION_PER_SEASON = 2;
const LOG_CAP = 80;

export function ensurePetitions(s: GameState): PetitionsState {
  s.petitions ??= { log: [] };
  s.petitions.log ??= [];
  return s.petitions;
}

const roll = (s: GameState, ...k: (string | number)[]) => hashSeed([s.seed, s.week, 'pet', ...k].join('|')) / 4294967296;
/** A stable roll for this week (no dice drawn from the game's stream). */
export const petitionRoll = roll;
const seasonOf = (week: number) => Math.floor(week / PETITION_SEASON_WEEKS);

/* ------------------------------------------------------------------ */
/* The town's mood toward the boss                                     */
/* ------------------------------------------------------------------ */

/** How the town sees him: love from his respect, fear from his men's fear of him and the street's heat. */
export function townMood(s: GameState): { love: number; fear: number; mood: 'feared' | 'beloved' | 'plain' } {
  const love = Math.max(0, Math.min(100, s.respect));
  const men = crew(s).filter((c) => c.id !== s.playerId);
  const avgFear = men.length ? men.reduce((a, c) => a + (getRelation(s, c.id, s.playerId)?.fear ?? 0), 0) / men.length : 0;
  const fear = Math.max(0, Math.min(100, avgFear * 0.6 + (s.heat?.local ?? 0) * 0.6));
  const mood = fear >= 40 && fear > love * 0.8 ? 'feared' : love >= 60 && fear < 40 ? 'beloved' : 'plain';
  return { love, fear, mood };
}

/** The station's scale on money (a soldier's neighborhood asks for less). */
export function stationScale(s: GameState): number {
  const st = stationOf(s);
  return st === 'boss' ? 1 : st === 'underboss' ? 0.8 : st === 'capo' ? 0.6 : st === 'soldier' ? 0.35 : st === 'associate' ? 0.25 : 0.6;
}

export const lowStation = (s: GameState) => ['associate', 'soldier'].includes(stationOf(s));

/* ------------------------------------------------------------------ */
/* The world's people for a petition                                   */
/* ------------------------------------------------------------------ */

const official = (s: GameState, office: string) => Object.values(s.characters).find((c) => c.alive && c.office === office);

function rivalFor(s: GameState, t: PTpl, fixed?: string): Rival | undefined {
  const live = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
  if (fixed) return live.find((r) => r.id === fixed);
  for (const id of t.rivals ?? []) {
    const r = live.find((x) => x.id === id);
    if (r) return r;
  }
  return live.length ? live[Math.floor(roll(s, t.id, 'rv') * live.length)] : undefined;
}

function rivalMan(s: GameState, r: Rival | undefined): Character | undefined {
  if (!r) return undefined;
  const men = Object.values(s.characters).filter((c) => c.alive && c.faction === r.id && c.id !== r.leaderId && c.gender === 'M').sort((a, b) => a.id.localeCompare(b.id));
  return men[0] ?? s.characters[r.leaderId];
}

const EFFECT_LABEL = (w: string) => `The office: ${w}`;

/** Build the variables a template reads. `label`: effects carry the office label (the scene); off for a later consequence. */
export function petitionVars(s: GameState, t: PTpl, who: Character, extra: { rv?: string; m?: string } = {}, label = true): PV {
  const boss = player(s);
  const rival = rivalFor(s, t, extra.rv);
  const rbossC = rival ? s.characters[rival.leaderId] : undefined;
  const rman = rivalMan(s, rival);
  const k = stationScale(s);
  const low = lowStation(s);
  const cons = holder(s, 'consigliere');
  const capo = capos(s).find((c) => isFree(s, c));
  const w = `${who.firstName} ${who.lastName}`;
  const L = label ? EFFECT_LABEL(w) : undefined;
  const lab = <E extends Effect>(e: E): E => (L ? { ...e, label: L } : e);
  const amt = (n: number) => Math.max(10, Math.round((n * k) / 10) * 10);
  const fem = who.gender === 'F';
  const italian = who.ethnicity === 'Italian';
  const addr = boss.gender === 'F' ? (italian ? 'Signora' : `Mrs. ${boss.lastName}`) : low ? (italian ? `Signor ${boss.lastName}` : `Mr. ${boss.lastName}`) : italian ? `Don ${boss.firstName}` : `Mr. ${boss.lastName}`;
  const m = extra.m ? s.characters[extra.m] : undefined;
  const v: PV = {
    s, who, w, f: who.firstName, last: who.lastName, fem,
    she: fem ? 'she' : 'he', She: fem ? 'She' : 'He', her: fem ? 'her' : 'his', Her: fem ? 'Her' : 'His', hers: fem ? 'her' : 'him',
    addr, low, k, amt, $: (n: number) => fmtMoney(amt(n)),
    rival, rn: rival?.shortName ?? 'the other crew', rboss: rbossC ? displayName(rbossC) : 'the other crew', rbossC,
    rman, rmanN: rman ? displayName(rman) : 'one of their men',
    judge: official(s, 'County judge'), cop: official(s, 'Police sergeant'), chief: official(s, 'Chief of Police'), council: official(s, 'City councilman'), pol: official(s, 'State assemblyman'),
    cons: low ? 'your capo' : cons ? `${cons.firstName} ${cons.lastName}` : 'your consigliere', consC: low ? undefined : cons,
    capo: capo ? `${capo.firstName} ${capo.lastName}` : 'one of your capos', priest: 'Father Callahan',
    m,
    pay: (n) => lab({ type: 'money', amount: -amt(n) }),
    gain: (n) => lab({ type: 'money', amount: amt(n) }),
    resp: (n) => lab({ type: 'respect', amount: n }),
    heat: (n, bar = 'local') => lab({ type: 'heat', bar, amount: n }),
    op: (n, reason) => lab({ type: 'opinion', from: who.id, to: s.playerId, amount: n, reason, decay: 1 }),
    opOf: (id, n, reason) => lab({ type: 'opinion', from: id, to: s.playerId, amount: n, reason, decay: 1 }),
    owe: (y) => lab({ type: 'deed', op: { op: 'owe', by: who.id, to: s.playerId, y } }),
    fav: (n) => lab({ type: 'favor', amount: n }),
    riv: (n, reason) => (rival ? [lab({ type: 'rivalOpinion', rival: rival.id, amount: n, reason } as Effect)] : []),
    inf: (d, n) => lab({ type: 'influence', district: d, faction: 'player', amount: n }),
    rinf: (d, n) => (rival ? [lab({ type: 'influence', district: d, faction: rival.id, amount: n } as Effect)] : []),
    crew: (n, reason) => lab({ type: 'crewOpinion', amount: n, reason }),
  };
  return v;
}

/* ------------------------------------------------------------------ */
/* Who comes                                                           */
/* ------------------------------------------------------------------ */

const OTHER_NAMES: Record<Exclude<PBg, Ethnicity>, { M: string[]; F: string[]; last: string[]; eth: Ethnicity }> = {
  Greek: { M: ['Nick', 'George', 'Gus', 'Spiro', 'Constantine'], F: ['Helen', 'Anna', 'Despina', 'Katherine', 'Sophia'], last: ['Pappas', 'Kostakis', 'Demos', 'Andreou', 'Lekkas'], eth: 'Italian' },
  Polish: { M: ['Stanley', 'Walter', 'Casimir', 'Joe', 'Ed'], F: ['Helen', 'Stella', 'Wanda', 'Irene', 'Sophie'], last: ['Kowalski', 'Nowak', 'Wisniewski', 'Zielinski', 'Grabowski'], eth: 'Irish' },
  German: { M: ['Karl', 'Otto', 'Fred', 'Herman', 'Bill'], F: ['Gertrude', 'Hilda', 'Elsie', 'Frieda', 'Ruth'], last: ['Schmidt', 'Becker', 'Hoffman', 'Kraus', 'Vogel'], eth: 'Irish' },
  Portuguese: { M: ['Manny', 'Tony', 'Joe', 'Frank', 'John'], F: ['Mary', 'Rose', 'Fatima', 'Lucy', 'Isabel'], last: ['Silva', 'Souza', 'Medeiros', 'Furtado', 'Costa'], eth: 'Italian' },
};

/** The petitioner's own dice (never the game's stream). */
function petitionerRng(s: GameState, t: PTpl): RngHolder {
  return { rng: hashSeed(`${s.seed}|${s.week}|petitioner|${t.id}|${s.nextId}`) };
}

function withHolder<T>(s: GameState, h: RngHolder, fn: () => T): T {
  const main = s.rng;
  s.rng = h.rng;
  try {
    return fn();
  } finally {
    h.rng = s.rng;
    s.rng = main;
  }
}

/** A new townsperson with the template's role, sex, age band and background (the existing generator). */
export function spawnPetitioner(s: GameState, t: PTpl, lastName?: string): Character {
  const h = petitionerRng(s, t);
  const bg = t.bg[Math.floor(rand(h) * t.bg.length)];
  const age = randInt(h, t.age[0], t.age[1]);
  const other = bg in OTHER_NAMES ? OTHER_NAMES[bg as keyof typeof OTHER_NAMES] : undefined;
  const c = withHolder(s, h, () => makeCharacter(s, {
    gender: t.gender, age, rank: 'civilian', faction: 'none', nickname: false, wealth: t.size === 'desperate' ? 150 : 900,
    ethnicity: other ? other.eth : (bg as Ethnicity),
    ...(other ? { firstName: other[t.gender][Math.floor(rand(h) * 5)], lastName: other.last[Math.floor(rand(h) * 5)] } : {}),
    ...(lastName ? { lastName } : {}),
  }));
  c.office = t.role;
  return c;
}

const ageOf = (s: GameState, c: Character) => s.date.y - c.birth.y - (s.date.m < c.birth.m || (s.date.m === c.birth.m && s.date.d < c.birth.d) ? 1 : 0);

/** Visits by this person in the season of `week`. */
export function visitsThisSeason(s: GameState, who: string, week = s.week): number {
  return (s.petitions?.log ?? []).filter((x) => x.who === who && seasonOf(x.w) === seasonOf(week)).length;
}

/** Somebody who came before and may come again (same sex, the age fits, under the season's cap, not lately). */
function returning(s: GameState, t: PTpl): Character | undefined {
  if (t.who || roll(s, t.id, 'again') >= 0.3) return undefined;
  const seen = [...new Set((s.petitions?.log ?? []).map((x) => x.who))];
  const fit = seen.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive && c.faction === 'none' && c.gender === t.gender && ageOf(s, c) >= Math.max(18, t.age[0] - 3) && ageOf(s, c) <= t.age[1] + 3
    && visitsThisSeason(s, c.id) < PETITION_PER_SEASON && !(s.petitions?.log ?? []).some((x) => x.who === c.id && s.week - x.w < 6));
  return fit.length ? fit[Math.floor(roll(s, t.id, 'who') * fit.length)] : undefined;
}

/* ------------------------------------------------------------------ */
/* The pool                                                            */
/* ------------------------------------------------------------------ */

export type PetitionSeason = 'summer' | 'winter' | 'spring' | 'fall';
export function seasonNow(s: GameState): PetitionSeason {
  const m = s.date.m;
  return m >= 6 && m <= 8 ? 'summer' : m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : 'fall';
}

/** Weeks since this template last came (Infinity: never, or long ago). */
export function weeksSince(s: GameState, id: string): number {
  const f = s.flags[`office_${id}`];
  const l = (s.petitions?.log ?? []).filter((x) => x.t === id).map((x) => x.w);
  const last = Math.max(f ?? -Infinity, ...l);
  return last === -Infinity ? Infinity : s.week - last;
}

/** May this template come now (gating only: mature content, station, its own condition, the ten weeks)? */
export function templateOpen(s: GameState, t: PTpl): boolean {
  if (t.mature && !adultOn(s)) return false;
  if (lowStation(s) && !(t.low ?? t.size === 'small')) return false;
  if (weeksSince(s, t.id) < PETITION_REPEAT_WEEKS) return false;
  if (t.needs?.includes('rival') && !rivalFor(s, t)) return false;
  if (t.needs?.includes('judge') && !official(s, 'County judge')) return false;
  if (t.needs?.includes('cop') && !official(s, 'Police sergeant')) return false;
  if (t.needs?.includes('council') && !official(s, 'City councilman')) return false;
  if (t.who && !t.who(s)) return false;
  if (t.when && !t.when(s)) return false;
  return true;
}

/** The weight of a template now: season, the boss's name, how lately it came. */
export function templateWeight(s: GameState, t: PTpl, mood = townMood(s).mood): number {
  let wgt = t.weight ?? 1;
  const sn = seasonNow(s);
  if (t.season) wgt *= t.season === sn ? 3 : t.season === 'summer' && sn !== 'winter' ? 0.6 : 0.15;
  if (mood === 'feared') wgt *= t.size === 'small' ? 0.4 : t.size === 'desperate' ? 1.8 : 1;
  else if (mood === 'beloved') wgt *= t.size === 'big' ? 1 : 1.5;
  const since = weeksSince(s, t.id);
  if (since < 52) wgt *= 0.15;
  return wgt;
}

export function openTemplates(s: GameState): PTpl[] {
  return PETITION_TEMPLATES.filter((t) => templateOpen(s, t));
}

/* ------------------------------------------------------------------ */
/* The scene                                                           */
/* ------------------------------------------------------------------ */

function laterEffect(v: PV, t: PTpl, ansId: string, l: PLater, extra: { rv?: string; m?: string }): Effect {
  const pct = Math.round(l.p * 100);
  return {
    type: 'schedule', key: 'petition_later', minWeeks: l.wk[0], maxWeeks: l.wk[1], chance: 1,
    hint: `word comes back (${pct}%: ${l.hint})`,
    params: { t: t.id, a: ansId, who: v.who.id, ...(extra.rv ? { rv: extra.rv } : {}), ...(extra.m ? { m: extra.m } : {}) },
    label: EFFECT_LABEL(v.w),
  };
}

/** Build the event for a template and a petitioner (no state written except the petitioner's record). */
export function petitionEvent(s: GameState, t: PTpl, who: Character): EventInstance {
  const m = t.who?.(s);
  const r0 = rivalFor(s, t);
  const extra = { rv: r0?.id, m: m?.id };
  const v = petitionVars(s, t, who, extra);
  const answers = t.answers(v);
  const choices = answers.map((a) => {
    const pct = a.later ? Math.round(a.later.p * 100) : undefined;
    return {
      id: a.id, label: a.label,
      detail: [a.detail, a.later ? `${pct}%: ${a.later.hint}.` : ''].filter(Boolean).join(' '),
      because: a.because,
      effects: [...a.fx, ...(a.later ? [laterEffect(v, t, a.id, a.later, extra)] : [])],
      disabledReason: a.off,
    };
  });
  const def = answers.find((a) => a.kind === 'send' && !a.off) ?? answers.filter((a) => !a.off).at(-1)!;
  return {
    iid: `ev${s.nextId++}`, defId: `office_${t.id}`, week: s.week, mandatory: false, priority: 30,
    title: `The office: ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}`,
    text: `${t.problem(v)} ${offerLine(v, t)}`,
    choices, defaultChoiceId: def.id,
    actors: [who.id, ...(m && m.id !== who.id ? [m.id] : [])],
    meta: { charId: who.id, favor: 1, pt: t.id, offer: t.offer, ...(lowStation(s) ? { low: 1 } : {}) },
  };
}

const OFFER_LINE: Record<PTpl['offer'], (v: PV) => string> = {
  respect: (v) => `${v.She} has nothing to give but ${v.her} respect, and says so.`,
  favor: (v) => `${v.She} will owe you, and ${v.she} knows what that means.`,
  payment: (v) => `${v.She} puts an envelope on the desk: what ${v.she} can afford, which isn't much.`,
  information: (v) => `${v.She} hears things, ${v.she} says, and will tell you what ${v.she} hears.`,
  loyalty: (v) => `"Whatever you need, ${v.addr}. Any time."`,
  vote: (v) => `${v.Her} whole family votes, ${v.she} says, and so does ${v.her} block.`,
  son: (v) => `${v.She} has a son, a good boy, nineteen, who could use a job and a man to answer to.`,
};
function offerLine(v: PV, t: PTpl): string {
  return t.offerLine ? t.offerLine(v) : OFFER_LINE[t.offer](v);
}

/** Pick a template (weighted) among those open now; `id` forces one if it is open. */
export function pickTemplate(s: GameState, id?: string, salt = ''): PTpl | undefined {
  const open = openTemplates(s).filter((t) => !id || t.id === id);
  if (!open.length) return undefined;
  const mood = townMood(s).mood;
  const ws = open.map((t) => templateWeight(s, t, mood));
  const total = ws.reduce((a, b) => a + b, 0);
  let x = roll(s, 'pick', salt) * total;
  for (let i = 0; i < open.length; i++) {
    x -= ws[i];
    if (x < 0) return open[i];
  }
  return open[open.length - 1];
}

/**
 * A petition from the deep bed for this week (or undefined). Records the template and the petitioner,
 * so the variety rules hold. `salt` separates two slots in the same week (the office, the audience).
 */
export function buildTownPetition(s: GameState, id?: string, salt = ''): EventInstance | undefined {
  const t = pickTemplate(s, id, salt);
  if (!t) return undefined;
  const m = t.who?.(s);
  let who = (m ? t.petitioner?.(s, m) : undefined) ?? returning(s, t);
  if (who && (!who.alive || visitsThisSeason(s, who.id) >= PETITION_PER_SEASON)) who = undefined;
  if (!who) who = spawnPetitioner(s, t, t.sameName ? m?.lastName : undefined);
  const ev = petitionEvent(s, t, who);
  const P = ensurePetitions(s);
  P.log.push({ t: t.id, w: s.week, who: who.id });
  if (P.log.length > LOG_CAP) P.log.splice(0, P.log.length - LOG_CAP);
  s.flags[`office_${t.id}`] = s.week;
  return ev;
}

/* ------------------------------------------------------------------ */
/* Later: the favor returned, the son reports, the man goes elsewhere  */
/* ------------------------------------------------------------------ */

type Handler = (ctx: Ctx, sc: ScheduledConsequence) => { text: string; effects?: Effect[] } | undefined;

export const PETITION_HANDLERS: Record<string, Handler> = {
  petition_later: (ctx, sc) => {
    const s = ctx.s;
    const t = PETITION_TEMPLATES.find((x) => x.id === String(sc.params.t));
    const who = s.characters[String(sc.params.who)];
    if (!t || !who) return undefined;
    const v = petitionVars(s, t, who, { rv: sc.params.rv ? String(sc.params.rv) : undefined, m: sc.params.m ? String(sc.params.m) : undefined }, false);
    const a = t.answers(v).find((x) => x.id === String(sc.params.a));
    const l = a?.later;
    if (!l) return undefined;
    const yes = chance(s, l.p);
    if (yes && l.son) {
      const boy = makeCharacter(s, { rank: 'associate', faction: 'player', age: randInt(s, 18, 22), lastName: who.lastName, ethnicity: who.ethnicity });
      addOpinion(s, boy.id, s.playerId, 'Gave me my start, for my mother', 18, 1);
      giveBio(s, boy);
      addStory(s, boy, `Came to the crew at nineteen: his ${who.gender === 'F' ? 'mother' : 'father'}, ${who.firstName}, asked the boss for him.`);
      tidyRegimes(s);
      return { text: `${l.yes(v)} (${boy.firstName} ${boy.lastName} joins as an associate)`, effects: l.yesFx?.(v) };
    }
    if (yes) return { text: l.yes(v), effects: l.yesFx?.(v) };
    if (!l.no) return undefined;
    return { text: l.no(v), effects: l.noFx?.(v) };
  },
};
