import { capos, displayName, hasTrait, isFree, player } from '../characters';
import type { NowResult } from '../deeds/now';
import { applyEffects } from '../effects';
import { journal } from '../journal';
import { newCtx } from '../ledger';
import { addSuspicion, readOf } from '../peopleRead';
import { phoneClone } from '../phone';
import { momentClone } from '../momentClone';
import type { PlaceId } from '../phoneMeet';
import { addOpinion, changeMeter, opinion } from '../relations';
import { absDay, hoursLeft } from '../timeCost';
import { today } from '../days';
import type { Character, Effect, GameState } from '../types';
import { allRequests, gatekeeper, type Gatekeeper } from './audience';
import { bookHours } from './hours';
import {
  armedTurn, bossWife, discoverGate, GATE_LABEL, GATE_ROLES, gateHolder, gateOdds, h01, noteTell, roleHolder, seeOdds, turnOf, type GateRole,
} from './gateCore';
import { ensurePlanner, plannerOf } from './state';

/**
 * THE GATEKEEPER, what the boss can do about the door (CONSIGLIERE_GATEKEEPER.md): give it to somebody else
 * (Standing Orders), read the full list himself (an hour), cross-check the man who keeps it (another source,
 * a quiet envelope on his wife, a month with somebody else at the door), and once he is found out, decide
 * what happens to him: confront him, feed him lies, freeze him out, or have him clipped (only by the boss's
 * own choice, confirmed). Every option says its odds and its effects, and lands in Your File.
 *
 * Pure: each transform returns a new state and a result card.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (p: number) => `${Math.round(p * 100)}%`;
const fail = (state: GameState, error: string, title = 'The door'): { state: GameState; result: NowResult } => ({ state, result: { ok: false, error, title, tier: 'fail', headline: error, line: '', changes: [], leadsTo: [] } });
const done = (title: string, who: string | undefined, line: string, changes: string[] = [], leadsTo: string[] = [], roll?: { chance: number; roll: number; ok: boolean }): NowResult => ({
  ok: true, title, ...(who ? { who } : {}), ...(roll ? { chance: roll.chance, roll: Math.floor(roll.roll * 100) } : {}),
  tier: roll ? (roll.ok ? 'success' : 'fail') : 'success', headline: roll ? `${pct(roll.chance)} — ${roll.ok ? 'it went your way' : 'it did not'}` : 'Done', line, changes, leadsTo,
});
const fileIt = (s: GameState, t: string, x: string, p: string[] = [], r?: string[]) => journal(s, { d: today(s), c: 'intrigue', t, x, p, src: 'gate', mine: 1, ...(r ? { r } : {}) });

/* ------------------------------------------------------------------ */
/* Who keeps the door                                                  */
/* ------------------------------------------------------------------ */

export interface RoleRow { role: GateRole; label: string; id?: string; name?: string; on: boolean; block?: string }

export function roleRows(s: GameState): RoleRow[] {
  const g = gatekeeper(s);
  const frz = plannerOf(s).frz;
  return GATE_ROLES.map((role) => {
    const c = roleHolder(s, role);
    return { role, label: GATE_LABEL[role], ...(c ? { id: c.id, name: displayName(c) } : {}), on: g.chosen === role, ...(!c ? { block: role === 'wife' ? 'No wife at home' : `No ${role} in the seat` } : c.id === frz ? { block: 'Frozen out: picking the seat again lets him back in' } : {}) };
  });
}

/** Warnings the old gatekeeper held back, released to the new one. Mutates a working copy. Returns how many. */
function releaseHeldBy(x: GameState, id: string): number {
  const T = x.threats;
  if (!T) return 0;
  let n = 0;
  T.tips = T.tips.map((t) => { if (t.held !== id) return t; const c = { ...t }; delete c.held; if (c.status === 'waiting' && c.deadline >= x.week) n++; return c; });
  return n;
}

/**
 * Give the door to another seat (a standing order). The new keeper lets in the men the old one held back.
 * `compare`: for a month, then hold the two books side by side (gateWeek settles it).
 */
export function setGateRole(s: GameState, role: GateRole, compare = false): GameState {
  const c = roleHolder(s, role);
  if (!c) return s;
  const old = gateHolder(s)?.c;
  const x = phoneClone(s);
  const P = ensurePlanner(x);
  if (role === 'consigliere') delete P.gk; else P.gk = role;
  if (P.frz === c.id) delete P.frz;
  const now = gateHolder(x)?.c;
  let n = 0;
  if (old && now && old.id !== now.id) {
    n = releaseHeldBy(x, old.id);
    if (n > 0) {
      const line = `The first day ${now.firstName} kept the door, ${n === 1 ? 'a man came in' : `${n} men came in`} that ${old.firstName} never let through.`;
      noteTell(x, line);
      addSuspicion(x, old.id, 'flip', 10 + 6 * n, line, 'gate');
    }
    if (compare) P.cmp = { id: old.id, w: x.week, n };
  }
  fileIt(x, compare && old && now && old.id !== now.id ? `For a month, ${now ? displayName(now) : 'somebody else'} keeps your door` : `Standing order: ${now ? displayName(now) : 'nobody'} keeps your door`,
    compare && old ? `Then you hold ${old.firstName}'s book against ${now?.firstName ?? 'the new one'}'s.` : `${GATE_LABEL[role]} ranks the requests, writes the bookings and sets the place and hour of a meet.`, now ? [now.id] : []);
  return x;
}

/* ------------------------------------------------------------------ */
/* Read the full list (an hour)                                        */
/* ------------------------------------------------------------------ */

export const FULL_HOURS = 1;

/** If he is holding men back, the share of the time the boss sees it for what it is (`n` held). */
export function fullOdds(s: GameState, n = 1): number {
  return clamp(0.2 + 0.12 * n + seeOdds(s) * 0.5, 0.1, 0.9);
}

export function fullBlock(s: GameState): string | undefined {
  if (plannerOf(s).full === absDay(s)) return 'You read it today';
  if (hoursLeft(s) < FULL_HOURS) return 'Not enough hours left today';
  return undefined;
}

/** The boss reads every request himself (an hour): the held ones show, marked, and the warnings come out. */
export function readFullList(s: GameState): { state: GameState; result: NowResult } {
  const b = fullBlock(s);
  if (b) return fail(s, b, 'The full list');
  const g = gateHolder(s)?.c;
  const x = phoneClone(bookHours(s, absDay(s), FULL_HOURS));
  const P = ensurePlanner(x);
  P.full = absDay(x);
  const held = allRequests(x).filter((r) => r.held);
  const n = held.length;
  const changes: string[] = [];
  const lines: string[] = [];
  if (!g) {
    lines.push('Nobody keeps the door: what you read is what came.');
  } else if (n === 0) {
    lines.push(`Every man who asked is on ${g.firstName}'s list, in about the order you would have put him.`);
    if ((readOf(x, g.id)?.f ?? 0) > 0) { const v = addSuspicion(x, g.id, 'flip', -4, 'You read the full list: nobody held back.', 'gate'); changes.push(`Flipped? ${Math.round(v)}`); }
  } else {
    const names = held.slice(0, 3).map((r) => r.name).join(', ');
    lines.push(`${n === 1 ? 'One man' : `${n} men`} never made ${g.firstName}'s list: ${names}${n > 3 ? '…' : ''}.`);
    const q = fullOdds(s, n);
    const r = h01(x, `full|${absDay(x)}|${g.id}`);
    if (r < q && discoverGate(x, g.id, 'The full list')) {
      lines.push(`${n === 1 ? 'It is' : 'They are'} not men a careful gatekeeper forgets. You know now what ${g.firstName} is.`);
      changes.push(`${g.firstName}: found out`);
    } else {
      const v = addSuspicion(x, g.id, 'flip', 8 + 6 * n, `The full list had ${n === 1 ? 'a man' : `${n} men`} he never brought you.`, 'gate');
      noteTell(x, `The full list: ${n === 1 ? 'a man' : `${n} men`} ${g.firstName} never brought you.`);
      changes.push(`Flipped? ${Math.round(v)}`);
      lines.push('Busy, he would say. Maybe.');
    }
    // The warnings he sat on come out now (the popup, the brief, the phone).
    for (const r0 of held) if (r0.ref.tip) { const t = x.threats?.tips.find((q2) => q2.id === r0.ref.tip); if (t) delete t.held; }
  }
  fileIt(x, 'You read the full list yourself', lines.join(' '), g ? [g.id] : []);
  return { state: x, result: done('The full list', g ? displayName(g) : undefined, lines.join(' '), [`An hour of your day`, ...changes], n ? ['The ones he held back are marked on the list today.'] : []) };
}

/* ------------------------------------------------------------------ */
/* Cross-checks                                                        */
/* ------------------------------------------------------------------ */

export interface Source { id: string; name: string; role: string; odds: number; block?: string }

/** The share of the time another source catches what the gatekeeper hides (his wits and his love for you). */
export function askOdds(s: GameState, c: Character): number {
  return clamp(0.3 + (c.attributes.intrigue - 50) / 200 + opinion(s, c.id, s.playerId) / 300, 0.1, 0.85);
}

export const ASK_EVERY = 2;

/** Who else the boss can ask about what reaches him: the other seat, his wife, a capo who loves him. */
export function askSources(s: GameState): Source[] {
  const g = gateHolder(s)?.c;
  const out: Source[] = [];
  const seen = new Set<string>([s.playerId, ...(g ? [g.id] : [])]);
  const last = plannerOf(s).xc?.ask;
  const cool = last !== undefined && s.week - last < ASK_EVERY ? `Not again so soon (week ${last + ASK_EVERY})` : undefined;
  const add = (c: Character | undefined, role: string) => {
    if (!c || seen.has(c.id) || !c.alive || !isFree(s, c)) return;
    seen.add(c.id);
    out.push({ id: c.id, name: displayName(c), role, odds: askOdds(s, c), ...(cool ? { block: cool } : hoursLeft(s) < 1 ? { block: 'Not enough hours left today' } : {}) });
  };
  add(roleHolder(s, 'consigliere'), 'Your consigliere');
  add(roleHolder(s, 'underboss'), 'Your underboss');
  add(bossWife(s), 'Your wife');
  for (const c of capos(s).filter((k) => isFree(s, k) && opinion(s, k.id, s.playerId) >= 25).sort((a, b) => opinion(s, b.id, s.playerId) - opinion(s, a.id, s.playerId)).slice(0, 2)) add(c, 'A capo who loves you');
  return out;
}

/** Has a turned gatekeeper left anything a second pair of eyes could see (held men, slanted lines, a booking at the wrong hour)? */
function leftTracks(s: GameState, id: string): boolean {
  const P = plannerOf(s);
  return Object.keys(P.hb ?? {}).length > 0 || (P.sl ?? []).length > 0 || (s.threats?.threats ?? []).some((t) => t.gk === id) || (s.threats?.tips ?? []).some((t) => t.held === id)
    || (s.action?.sched ?? []).some((it) => it.payload.by === id && it.payload.waste);
}

/** Ask another source what reaches him (an hour): he catches what the gatekeeper hides, or swears he is straight. */
export function askAnother(s: GameState, srcId: string): { state: GameState; result: NowResult } {
  const g = gateHolder(s)?.c;
  const src = askSources(s).find((x) => x.id === srcId);
  if (!g) return fail(s, 'Nobody keeps the door', 'Ask another source');
  if (!src) return fail(s, 'Not one to ask', 'Ask another source');
  if (src.block) return fail(s, src.block, 'Ask another source');
  const x = phoneClone(bookHours(s, absDay(s), 1));
  const P = ensurePlanner(x);
  (P.xc ??= {}).ask = x.week;
  const c = x.characters[srcId];
  const turn = turnOf(x, g.id);
  const covers = !!turn && (turn.with.includes(c.id) || (!!turn.rival && (c.informantFor === turn.rival || c.courtedBy?.rival === turn.rival)));
  const r = h01(x, `ask|${x.week}|${srcId}|${g.id}`);
  const changes: string[] = [];
  let line: string;
  let ok = false;
  if (covers) {
    const v = addSuspicion(x, g.id, 'flip', -8, `${c.firstName} says ${g.firstName} is as straight as they come.`, 'gate');
    line = `${c.firstName} says ${g.firstName} is as straight as they come. He says it fast.`;
    changes.push(`Flipped? ${Math.round(v)}`);
  } else if (turn && armedTurn(x) && leftTracks(x, g.id)) {
    ok = r < src.odds;
    if (ok) {
      const v = addSuspicion(x, g.id, 'flip', 22, `${c.firstName}: the street has it different from what reaches your desk.`, 'gate');
      line = `${c.firstName} hears what you hear and frowns: men he knows asked to see you and were told you were busy, and the street has it different from your brief.`;
      noteTell(x, `${c.firstName} says the street and your desk disagree.`);
      changes.push(`Flipped? ${Math.round(v)}`);
      if (v >= 60 && discoverGate(x, g.id, `${c.firstName} put it together`)) { line += ` Put together with the rest, you know what ${g.firstName} is.`; changes.push(`${g.firstName}: found out`); }
    } else line = `${c.firstName} has heard nothing worth repeating.`;
  } else if (!turn) {
    const v = addSuspicion(x, g.id, 'flip', -8, `${c.firstName} says ${g.firstName} is straight.`, 'gate');
    line = `${c.firstName} says what reaches you is what is out there. ${g.firstName} is straight.`;
    changes.push(`Flipped? ${Math.round(v)}`);
    ok = true;
  } else line = `${c.firstName} has heard nothing worth repeating.`;
  fileIt(x, `You asked ${displayName(c)} what reaches you`, line, [c.id, g.id]);
  return { state: x, result: done(`Ask ${c.firstName}`, displayName(c), line, ['An hour of your day', ...changes], [], { chance: src.odds, roll: r, ok }) };
}

/** The quiet envelope on the gatekeeper's wife (payroll.ts): is she on it, and how often she brings something. */
export function wifeCheck(s: GameState): { id?: string; name?: string; on: boolean; odds: number; text: string } {
  const g = gateHolder(s)?.c;
  const w = g?.spouseId ? s.characters[g.spouseId] : undefined;
  if (!g || !w?.alive) return { on: false, odds: 0, text: g ? `${g.firstName} has no wife to ask.` : 'Nobody keeps the door.' };
  const h = s.payroll?.hires[w.id];
  if (h?.hush && h.hush.on === g.id) {
    const odds = clamp(0.35 + h.hush.access / 250, 0, 0.95);
    return { id: w.id, name: displayName(w), on: true, odds, text: `${w.firstName} is on the quiet payroll. Each week about ${pct(odds)} she brings something; if he keeps two books, she may see the other one.` };
  }
  return { id: w.id, name: displayName(w), on: false, odds: 0, text: `Put ${w.firstName} on the quiet payroll (her card, then the quiet envelope): what he does at home, she sees.` };
}

/** Switch the door for a month and compare: the odds, once the month is out, that the two books show him up (if there is anything to show). */
export function compareOdds(s: GameState): number {
  return clamp(0.4 + seeOdds(s) * 0.5, 0.2, 0.92);
}

export function compareOptions(s: GameState): { role: GateRole; name: string; block?: string }[] {
  const g = gateHolder(s)?.c;
  const P = plannerOf(s);
  return GATE_ROLES.map((role) => {
    const c = roleHolder(s, role);
    return { role, name: c ? displayName(c) : GATE_LABEL[role], ...(!c ? { block: 'Nobody in the seat' } : c.id === g?.id ? { block: 'He keeps it now' } : P.cmp ? { block: `A month is running (since week ${P.cmp.w})` } : c.id === P.frz ? { block: 'Frozen out' } : {}) };
  });
}

/* ------------------------------------------------------------------ */
/* Found out: the decision                                             */
/* ------------------------------------------------------------------ */

export type GateChoiceId = 'confront' | 'feed' | 'freeze' | 'clip';
export interface GateChoice { id: GateChoiceId; label: string; hint: string; odds: number; effects: string[]; confirm?: true; block?: string }
export interface GateCase { id: string; name: string; why: string; w: number; how?: GateChoiceId; tries: number; choices: GateChoice[] }

export function confrontOdds(s: GameState, c: Character): number {
  const boss = player(s);
  const fear = s.relations[`${c.id}>${s.playerId}`]?.fear ?? 0;
  const tries = plannerOf(s).gx?.n ?? 0;
  return clamp(0.42 + (boss.attributes.intrigue - c.attributes.intrigue) / 250 + fear / 250 + (hasTrait(c, 'Honest') ? 0.1 : 0) - (hasTrait(c, 'Charming') ? 0.08 : 0) - tries * 0.1, 0.12, 0.85);
}
export function clipOdds(s: GameState, c: Character): number {
  const boss = player(s);
  return clamp(0.72 + (boss.attributes.force - 50) / 300 - (hasTrait(c, 'Paranoid') ? 0.1 : 0), 0.4, 0.92);
}
/** While the boss feeds him lies: the weekly share of the time the other side catches on. */
export const FEED_BURN = 0.12;

/** The decision waiting on the boss (he is found out, nothing decided yet), or the last one taken. */
export function gateCase(s: GameState): GateCase | undefined {
  const gx = plannerOf(s).gx;
  const c = gx ? s.characters[gx.id] : undefined;
  if (!gx || !c?.alive) return undefined;
  const turn = turnOf(s, c.id);
  const side = turn?.why === 'feds' ? 'the Bureau' : turn?.rival ? s.rivals.find((r) => r.id === turn.rival)?.shortName ?? 'his people' : 'the plotters';
  const co = confrontOdds(s, c);
  const cl = clipOdds(s, c);
  const keeps = gateHolder(s)?.c.id === c.id;
  const choices: GateChoice[] = [
    { id: 'confront', label: 'Confront him', hint: 'Sit him down and put it to him', odds: co,
      effects: [`If he breaks (${pct(co)}): he cuts it off with ${side}, his fear of you +20, his opinion −10; he keeps his seat`, `If not: he denies it and warns ${side}${turn?.why === 'rival' ? '; he may walk' : turn?.why === 'feds' ? '; federal heat +4' : ''}; his opinion −15`] },
    { id: 'feed', label: 'Feed him lies', hint: `Leave him at the door and let ${side} chase what you want them to`, odds: 1 - FEED_BURN,
      effects: [turn?.why === 'feds' ? 'Federal heat −8 now, −2 a week while it holds' : turn?.why === 'rival' ? `${side} wastes $500 and some muscle a week chasing ghosts` : 'The plotters move on the wrong nights: they lose ground with the crew', `His hand on your book stops: you read it yourself`, `Each week ${pct(FEED_BURN)} they catch on; then you decide again`] },
    { id: 'freeze', label: 'Freeze him out', hint: keeps ? 'Give the door to somebody else and keep him away from your book' : 'He is already away from the door; keep him there', odds: 1,
      effects: ['He never keeps the door again unless you pick his seat', 'His opinion −12', 'The men he held back come in'] },
    { id: 'clip', label: 'Have him clipped', hint: 'Only on your word. You will be asked twice.', odds: cl, confirm: true,
      effects: [`If it goes right (${pct(cl)}): he is gone, respect +2${turn?.why === 'feds' ? ', federal heat +8 (a witness)' : ''}, family heat +3`, 'If not: he runs, local heat +4'] },
  ];
  return { id: c.id, name: displayName(c), why: gx.why, w: gx.w, ...(gx.how ? { how: gx.how } : {}), tries: gx.n ?? 0, choices };
}

/** Cut him loose from whoever turned him (he broke and came clean). Mutates a working copy. */
function cutTurn(x: GameState, c: Character): void {
  if (c.informantFor && c.informantFor !== 'player') delete c.informantFor;
  delete c.courtedBy;
  c.defectStage = 0;
  if (x.flags.informant && `c${x.flags.informant}` === c.id) x.flags.informant = 0;
  for (const p of x.intrigue?.plots ?? []) if (!p.ended && p.actorId === c.id && p.kind === 'betrayal') { p.ended = x.week; p.outcome = 'confronted'; }
  x.factions = (x.factions ?? []).map((f) => (f.leaderId === c.id ? undefined : { ...f, memberIds: f.memberIds.filter((m) => m !== c.id) })).filter((f): f is NonNullable<typeof f> => !!f);
  if (x.feds?.hollow?.leadId === c.id) x.feds.hollow.leadId = undefined;
}

/** The boss decides what happens to the man found out. `clip` needs `sure` (the second click). */
export function decideGate(s: GameState, id: GateChoiceId, sure = false): { state: GameState; result: NowResult } {
  const cs = gateCase(s);
  if (!cs) return fail(s, 'Nobody to decide on');
  if (cs.how && cs.how !== 'confront') return fail(s, 'You already decided');
  const ch = cs.choices.find((x) => x.id === id);
  if (!ch) return fail(s, 'Not an option');
  if (ch.confirm && !sure) return fail(s, 'Say it twice: it cannot be undone', 'Have him clipped');
  const x = momentClone(s);
  const P = ensurePlanner(x);
  const gx = P.gx!;
  const c = x.characters[cs.id];
  const turn = turnOf(x, c.id);
  const who = displayName(c);
  const ctx = newCtx(x);
  const changes: string[] = [];
  const lines: string[] = [];
  const r = h01(x, `decide|${x.week}|${id}|${c.id}|${gx.n ?? 0}`);
  let roll: { chance: number; roll: number; ok: boolean } | undefined;
  const fx = (effects: Effect[], label: string) => applyEffects(ctx, effects, { label, because: label.toLowerCase(), category: 'event' });
  if (id === 'confront') {
    const ok = r < ch.odds;
    roll = { chance: ch.odds, roll: r, ok };
    if (ok) {
      cutTurn(x, c);
      changeMeter(x, c.id, x.playerId, 'fear', 20);
      addOpinion(x, c.id, x.playerId, 'The boss caught me out', -10, 1);
      gx.how = 'confront';
      lines.push(`${c.firstName} held out for a minute, then he told you all of it: ${cs.why}. He is done with them. He knows what the next time costs.`);
      changes.push(`${c.firstName}: cut off from ${turn?.why === 'feds' ? 'the Bureau' : 'them'}`, `His fear of you +20`, `His opinion −10`);
    } else {
      gx.n = (gx.n ?? 0) + 1;
      addOpinion(x, c.id, x.playerId, 'The boss accused me', -15, 1);
      changeMeter(x, c.id, x.playerId, 'grievance', 12);
      if (turn?.why === 'feds') { fx([{ type: 'heat', bar: 'federal', amount: 4, label: 'He told his handlers you know' }], 'He told his handlers you know'); changes.push('Federal heat +4'); }
      if (turn?.why === 'rival' && turn.rival) { c.courtedBy = { rival: turn.rival, week: x.week }; c.defectStage = Math.max(c.defectStage ?? 0, 2); changes.push(`${c.firstName} is ready to walk`); }
      lines.push(`${c.firstName} denied every word, and looked hurt doing it. Whoever he works for knows you know.`);
      changes.push('His opinion −15');
    }
  } else if (id === 'feed') {
    gx.how = 'feed';
    if (turn?.why === 'feds') { fx([{ type: 'heat', bar: 'federal', amount: -8, label: 'Feeding the Bureau through your own man' }], 'Feeding the Bureau'); changes.push('Federal heat −8'); }
    lines.push(`${c.firstName} keeps the door and thinks he is safe. Everything he passes on now, you wrote for him.`);
    changes.push('His hand on your book: stopped', `Each week ${pct(FEED_BURN)} they catch on`);
  } else if (id === 'freeze') {
    gx.how = 'freeze';
    P.frz = c.id;
    const n = releaseHeldBy(x, c.id);
    const now = gateHolder(x)?.c;
    addOpinion(x, c.id, x.playerId, 'The boss froze me out', -12, 1);
    lines.push(`${c.firstName} is off the door. ${now ? `${now.firstName} keeps your book now.` : 'You keep your own book.'}${n ? ` ${n === 1 ? 'A man' : `${n} men`} he held back came in.` : ''}`);
    changes.push(`${c.firstName}'s opinion −12`, now ? `Door: ${displayName(now)}` : 'Door: nobody');
  } else {
    const ok = r < ch.odds;
    roll = { chance: ch.odds, roll: r, ok };
    gx.how = 'clip';
    if (ok) {
      fx([
        { type: 'kill', charId: c.id, cause: 'killed for betraying the boss at his own door', killer: 'player', label: 'The gatekeeper' },
        { type: 'respect', amount: 2, label: 'The gatekeeper' },
        { type: 'heat', bar: 'family', amount: 3, label: 'The gatekeeper' },
        ...(turn?.why === 'feds' ? [{ type: 'heat', bar: 'federal', amount: 8, label: 'A federal witness gone' } as Effect] : []),
      ], 'The gatekeeper');
      lines.push(`${c.firstName} went out for cigarettes and did not come back. Nobody at the club asks.`);
      changes.push(`${c.firstName}: gone`, 'Respect +2', 'Family heat +3', ...(turn?.why === 'feds' ? ['Federal heat +8'] : []));
    } else {
      fx([{ type: 'exile', charId: c.id, label: 'He ran' }, { type: 'heat', bar: 'local', amount: 4, label: 'A job gone wrong' }], 'He ran');
      P.frz = c.id;
      lines.push(`${c.firstName} saw it coming and was gone before the car got there.`);
      changes.push(`${c.firstName}: ran`, 'Local heat +4');
    }
  }
  if (ctx.log.length) lines.push(...ctx.log.slice(-2));
  fileIt(x, `${ch.label}: ${who}`, lines.join(' '), [c.id], [`He ${cs.why}.`, `You chose: ${ch.label.toLowerCase()}.`]);
  return { state: x, result: done(`${ch.label}: ${c.firstName}`, who, lines.join(' '), changes, ['In Your File.'], roll) };
}

/* ------------------------------------------------------------------ */
/* The meet's default place and hour (the phone)                       */
/* ------------------------------------------------------------------ */

/** The place and hour the gatekeeper puts down for a meet (the phone pre-fills them; the boss can change both). */
export function meetDefault(s: GameState, who?: string): { place: PlaceId; hour: number; by?: string } {
  const g = gateHolder(s)?.c;
  if (!g) return { place: 'diner', hour: 21 };
  const a = armedTurn(s);
  if (a && h01(s, `meetdef|${s.week}|${who ?? ''}|${g.id}`) < gateOdds(s, a.c)) return { place: 'hotel', hour: 23, by: displayName(g) };
  return { place: 'diner', hour: 21, by: displayName(g) };
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export interface GateView {
  keeper: Gatekeeper;
  roles: RoleRow[];
  full: boolean;
  fullBlock?: string;
  fullOdds: number;
  heldNow: number;
  sources: Source[];
  wife: ReturnType<typeof wifeCheck>;
  compare: { odds: number; options: ReturnType<typeof compareOptions>; running?: { name: string; w: number; left: number } };
  tells: { w: number; t: string }[];
  suspicion?: number;
  case?: GateCase;
}

export function gateView(s: GameState): GateView {
  const P = plannerOf(s);
  const keeper = gatekeeper(s);
  const old = P.cmp ? s.characters[P.cmp.id] : undefined;
  return {
    keeper,
    roles: roleRows(s),
    full: P.full === absDay(s),
    ...(fullBlock(s) ? { fullBlock: fullBlock(s) } : {}),
    fullOdds: fullOdds(s, 1),
    heldNow: P.full === absDay(s) ? allRequests(s).filter((r) => r.held).length : 0,
    sources: askSources(s),
    wife: wifeCheck(s),
    compare: { odds: compareOdds(s), options: compareOptions(s), ...(P.cmp && old ? { running: { name: displayName(old), w: P.cmp.w, left: Math.max(0, P.cmp.w + 4 - s.week) } } : {}) },
    tells: (P.tl ?? []).filter((x) => s.week - x.w <= 8).slice().reverse(),
    ...(keeper.id && readOf(s, keeper.id) ? { suspicion: Math.round(readOf(s, keeper.id)!.f) } : {}),
    ...(gateCase(s) ? { case: gateCase(s) } : {}),
  };
}
