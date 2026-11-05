import { displayName, hasTrait, isFree } from '../characters';
import { holder } from '../council';
import { hashSeed } from '../rng';
import type { Character, GameState, RivalId } from '../types';
import type { Tip } from '../threats';
import { ensurePlanner } from './state';

/**
 * THE GATEKEEPER, the core (CONSIGLIERE_GATEKEEPER.md). The consigliere keeps the boss's book: he ranks the
 * requests for an audience, writes the bookings in the datebook, sets the place and the hour of a meet. The
 * boss may give the door to his underboss or his wife instead (a standing order).
 *
 * TURNED is never a new loyalty flag: it is read off what the game already keeps.
 *  - bought by a rival: `informantFor` a family, a family's courting that got as far as being seen with them,
 *    or a betrayal plot (intrigue.ts) with him as the actor;
 *  - flipped by the Feds: `informantFor === 'law'` (a pinch that flipped, the honey trap's witness) or the undercover;
 *  - part of a plot: a faction of the boss's men that wants him gone (abdicate, his head, or gone over his head
 *    to Philadelphia), or the man the hollow crown's capos follow (feds.ts).
 * A loyal gatekeeper does exactly what the door always did. A turned one uses the door as a weapon
 * (planner/gate.ts, planner/gateWeek.ts), each move with odds from his wits against the boss's and the
 * boss's own suspicion of everybody.
 *
 * This file is light on purpose (threats.ts and payroll.ts read it): reads of the state, the odds, and the
 * one write every system may make, `discoverGate`.
 */

export type GateRole = 'consigliere' | 'underboss' | 'wife';
export const GATE_ROLES: GateRole[] = ['consigliere', 'underboss', 'wife'];
export const GATE_LABEL: Record<GateRole, string> = { consigliere: 'Your consigliere', underboss: 'Your underboss', wife: 'Your wife' };

export function h01(s: GameState, key: string): number {
  return hashSeed(`${s.seed}|gate|${key}`) / 4294967296;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The boss's wife, when she is alive and at home. */
export function bossWife(s: GameState): Character | undefined {
  const b = s.characters[s.playerId];
  const w = b?.spouseId ? s.characters[b.spouseId] : undefined;
  return w?.alive && isFree(s, w) && w.id !== s.playerId ? w : undefined;
}

/** Who would hold the door in this role, now (undefined: nobody in it). */
export function roleHolder(s: GameState, role: GateRole): Character | undefined {
  const c = role === 'wife' ? bossWife(s) : holder(s, role);
  return c && c.alive && isFree(s, c) && c.id !== s.playerId ? c : undefined;
}

/** The role the boss gave the door (a standing order; the consigliere unless he said otherwise). */
export function chosenRole(s: GameState): GateRole {
  return s.planner?.gk ?? 'consigliere';
}

/** Who keeps the door now: the man the boss picked, else the consigliere, else the underboss. A man frozen out never does. */
export function gateHolder(s: GameState): { c: Character; role: GateRole } | undefined {
  const frz = s.planner?.frz;
  const order: GateRole[] = [chosenRole(s), 'consigliere', 'underboss'];
  for (const role of order) {
    const c = roleHolder(s, role);
    if (c && c.id !== frz) return { c, role };
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Turned: read off the game's own state                               */
/* ------------------------------------------------------------------ */

export type TurnWhy = 'rival' | 'feds' | 'plot';
export interface Turn { why: TurnWhy; rival?: RivalId; text: string; with: string[] }

/** How a man has turned, if he has (the hidden truth: the dice read it, a screen never shows it until he is found out). */
export function turnOf(s: GameState, id: string | undefined): Turn | undefined {
  const c = id ? s.characters[id] : undefined;
  if (!c?.alive || c.id === s.playerId) return undefined;
  if (c.informantFor === 'law' || (s.feds?.brasco?.id === c.id && !s.feds.brasco.end)) return { why: 'feds', text: 'he talks to the FBI', with: [] };
  const mob = (r: string | undefined) => s.rivals.find((x) => x.id === r && x.kind !== 'law');
  const bought = (r: RivalId, text: string): Turn => ({ why: 'rival', rival: r, text, with: Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && x.id !== c.id && (x.informantFor === r || x.courtedBy?.rival === r)).map((x) => x.id) });
  const inf = mob(c.informantFor);
  if (inf && c.informantFor !== c.faction) return bought(inf.id, `he is on ${inf.shortName}'s pad`);
  const plot = (s.intrigue?.plots ?? []).find((p) => !p.ended && p.kind === 'betrayal' && p.actorId === c.id && mob(p.faction as string));
  if (plot) return bought(plot.faction as RivalId, `he sells ${mob(plot.faction as string)!.shortName} what he hears at your table`);
  if (c.courtedBy && (c.defectStage ?? 0) >= 1 && mob(c.courtedBy.rival)) return bought(c.courtedBy.rival, `${mob(c.courtedBy.rival)!.shortName} has been buying him`);
  const f = (s.factions ?? []).find((x) => (x.leaderId === c.id || x.memberIds.includes(c.id)) && (x.agenda === 'abdicate' || x.agenda === 'head' || x.demand === 'abdicate' || x.demand === 'head' || (x.stage ?? 0) >= 2));
  if (f) return { why: 'plot', text: `he is with ${f.name ?? 'the men who want you out'}`, with: [f.leaderId, ...f.memberIds].filter((x) => x !== c.id) };
  if (s.feds?.hollow?.leadId === c.id) return { why: 'plot', text: 'the capos who no longer answer to you answer to him', with: [] };
  return undefined;
}

/** The gatekeeper's turn when it is a weapon: he keeps the door, he has turned, and the boss is not playing him. */
export function armedTurn(s: GameState): { c: Character; turn: Turn } | undefined {
  const g = gateHolder(s);
  if (!g) return undefined;
  const turn = turnOf(s, g.c.id);
  if (!turn) return undefined;
  const gx = s.planner?.gx;
  if (gx && gx.id === g.c.id && gx.how === 'feed') return undefined;
  return { c: g.c, turn };
}

/** The share of the time a turned gatekeeper gets a move past the boss: his wits against the boss's, and the boss's nerves. */
export function gateOdds(s: GameState, gk: Character): number {
  const boss = s.characters[s.playerId];
  const mine = boss?.attributes.intrigue ?? 50;
  return clamp(0.4 + (gk.attributes.intrigue - 50) / 200 - (mine - 50) / 250 - (boss && hasTrait(boss, 'Paranoid') ? 0.12 : 0), 0.12, 0.8);
}

/** The share of the time the boss notices a tell: his wits and his nerves (a paranoid man sees more, true and false). */
export function seeOdds(s: GameState): number {
  const boss = s.characters[s.playerId];
  return clamp(0.35 + ((boss?.attributes.intrigue ?? 50) - 50) / 150 + (boss && hasTrait(boss, 'Paranoid') ? 0.15 : 0), 0.1, 0.85);
}

/** Is a warning one that hurts the side he turned to (a real one, about a move against the boss)? */
export function hurtsHisSide(s: GameState, turn: Turn, t: Pick<Tip, 'kind' | 'by' | 'targetId' | 'threatId' | 'truth'>): boolean {
  if (!t.threatId || t.truth === 'false') return false;
  const onBoss = t.targetId === s.playerId;
  if (turn.why === 'feds') return t.by === 'fbi' || t.by === 'police' || onBoss;
  if (turn.why === 'rival') return t.by === turn.rival || (onBoss && (t.kind === 'hit' || t.kind === 'setup'));
  return onBoss || t.kind === 'hit' || t.kind === 'bribe' || t.kind === 'poach';
}

/** The brief's grade on a warning as a turned gatekeeper types it: up (a rumor marked confirmed), down, or as read. Pure, hashed. */
export function slantOf(s: GameState, t: Tip): 'up' | 'down' | undefined {
  const a = armedTurn(s);
  if (!a) return undefined;
  const p = gateOdds(s, a.c);
  if (hurtsHisSide(s, a.turn, t)) return h01(s, `slant|${t.id}|${a.c.id}`) < p ? 'down' : undefined;
  if (t.truth === 'false' || (t.plantedBy && t.plantedBy === a.turn.rival)) return h01(s, `slant|${t.id}|${a.c.id}`) < p * 0.8 ? 'up' : undefined;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Found out, and what the boss noticed                                */
/* ------------------------------------------------------------------ */

export const TELL_CAP = 6;

/** A line the boss noticed (a tell or a cross-check): kept on the planner for the brief and the Audience page. */
export function noteTell(s: GameState, t: string): void {
  const P = ensurePlanner(s);
  const tl = (P.tl ??= []);
  tl.push({ w: s.week, t: t.slice(0, 200) });
  if (tl.length > TELL_CAP) tl.splice(0, tl.length - TELL_CAP);
}

/** He is found out: the boss knows, and a decision waits (planner/gate.ts gateChoices). Any system may call it. */
export function discoverGate(s: GameState, id: string, how: string): boolean {
  const c = s.characters[id];
  const turn = turnOf(s, id);
  if (!c || !turn) return false;
  const P = ensurePlanner(s);
  if (P.gx && P.gx.id === id && !P.gx.how) return false;
  P.gx = { id, w: s.week, why: turn.text };
  noteTell(s, `${how}: ${displayName(c)} ${turn.text}.`);
  return true;
}
