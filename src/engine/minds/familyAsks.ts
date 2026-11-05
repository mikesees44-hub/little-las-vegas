import { displayName } from '../characters';
import { shiftInfluence } from '../effects';
import { cloneState } from '../engine';
import { bumpTension } from '../intrigue';
import { journal } from '../journal';
import type { Ctx } from '../ledger';
import { inTheRanks } from '../rankView';
import { addOpinion, opinion } from '../relations';
import { hashSeed } from '../rng';
import { ensureTalks, logTalk, pactWith } from '../talks';
import type { GameState, RivalId } from '../types';
import { FACTION_NAMES } from '../world';
import { counterTo, describeDeal, rivalOf, stanceOf, validateDeal, type Term } from './diplomacy';
import { recordMut } from './familyWord';
import { ASK_LABEL, askFor, askTitle, openAsks, type FamAsk } from './askView';

/**
 * THEY COME TO YOU. A family asks the boss for a sit-down on its own, with
 * an agenda: a grievance about a district (one of his men pushing into their
 * corners), a partnership pitch, a demand for tribute when they are the
 * stronger, a peace feeler when they are losing a war, or Philadelphia
 * calling both families to the Table over a war that drags on.
 *
 * It lands on the Desk ("Needs you": `fam:<id>`, inbox.ts) with their
 * opening offer; opening it starts the sit-down with the agenda loaded
 * (`openSitDown` reads `askFor`). It waits one week: ignored, it is listed
 * under "Will be missed if you advance" (desk.ts `lapsesThisWeek`) and has a
 * consequence when the week turns (his opinion, and on a grievance or a
 * tribute demand they act; Philadelphia marks it down).
 *
 * Deterministic dice off the seed (no RNG stream is consumed), at most one
 * new ask a week, one open per family. State optional (`s.talks.asks`).
 */

export { ASK_LABEL, askFor, askLapses, askTitle, askWhy, ignoreText, openAsks, type AskKind, type FamAsk, type FavorAsk, type FavorKind } from './askView';

const H = (k: string) => hashSeed(k) / 4294967296;
const dn = (s: GameState, id?: string) => s.districts.find((d) => d.id === id)?.name ?? 'the district';

/* ------------------------------------------------------------------ */
/* Who asks, and for what                                               */
/* ------------------------------------------------------------------ */

function candidate(s: GameState, rival: RivalId): Omit<FamAsk, 'id' | 'w' | 'until'> | undefined {
  const r = rivalOf(s, rival);
  if (!r || r.kind !== 'mob') return undefined;
  const c = s.characters[r.leaderId];
  if (!c?.alive) return undefined;
  const st = stanceOf(s, rival);
  if (!st) return undefined;
  const roll = (k: string) => H(`${s.seed}|${s.week}|ask|${rival}|${k}`);
  const w = s.wars.find((x) => x.rival === rival);
  const offer = (base: Term[]): Term[] => {
    const v = validateDeal(s, rival, base);
    return v.length ? counterTo(s, st, v, st.need, true) ?? v : [];
  };
  if (w) {
    const philly = s.rivals.find((x) => x.id === 'philly');
    if (w.score >= 25 && roll('peace') < 0.45) return { rival, kind: 'peace', text: 'This war is bleeding both of us. I came to talk about ending it.', district: w.district, offer: offer([{ kind: 'truce', weeks: 26 }]) };
    if (philly && s.characters[philly.leaderId]?.alive && s.week - w.startWeek >= 8 && roll('table') < 0.25) return { rival, kind: 'table', text: `Philadelphia wants the shooting over ${dn(s, w.district)} stopped. They called us both to the Table.`, district: w.district, offer: offer([{ kind: 'truce', weeks: 26 }]) };
    return undefined;
  }
  if (st.ratio >= 1.3 && !pactWith(s, rival, 'tribute') && st.opinion < 20 && roll('tribute') < 0.12) {
    return { rival, kind: 'tribute', text: 'We are the bigger family on this island. Bigger families get paid. Let\'s talk about what you owe.', offer: offer([{ kind: 'tribute', amount: 200, weeks: 12 }]) };
  }
  if (st.contested.length && st.opinion < 15 && roll('grievance') < 0.12) {
    const d = st.contested[Math.floor(roll('d') * st.contested.length)];
    const capo = s.districts.find((x) => x.id === d)?.capoId;
    const man = capo ? s.characters[capo] : undefined;
    const who = man?.alive && man.faction === 'player' ? man : undefined;
    return {
      rival, kind: 'grievance', district: d, ...(who ? { charId: who.id } : {}),
      text: who ? `Your man ${displayName(who)} is pushing into my corners in ${dn(s, d)}. I want it stopped.` : `Your people are crowding my corners in ${dn(s, d)}. I want it stopped.`,
      offer: offer([{ kind: 'handsoff', dir: 'you', district: d, weeks: 26 }]),
    };
  }
  if (st.opinion >= 15 && st.allowed.includes('partnership') && roll('partner') < 0.1) {
    return { rival, kind: 'partnership', text: 'There is money on this island neither of us is making alone. I have a proposition.', offer: offer([{ kind: 'partnership', weeks: 52 }]) };
  }
  return undefined;
}

/** Weekly (engine.ts, after talksWeek): the ones nobody answered lapse with their consequence; a family may ask. */
export function familyAsksWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.talks?.asks?.length && (s.gameOver || inTheRanks(s))) return;
  const t = ensureTalks(s);
  // Lapses: shown through `until`, unanswered when that week turns.
  for (const a of [...(t.asks ?? [])]) {
    if (a.until > s.week) continue;
    t.asks = (t.asks ?? []).filter((x) => x !== a);
    lapse(ctx, a);
  }
  if (!t.asks?.length) delete t.asks;
  if (s.gameOver || inTheRanks(s)) return;
  if (openAsks(s).some((a) => a.w > s.week)) return;
  const ids = s.rivals.filter((r) => r.kind === 'mob').map((r) => r.id).sort((a, b) => H(`${s.seed}|${s.week}|order|${a}`) - H(`${s.seed}|${s.week}|order|${b}`));
  for (const id of ids) {
    if (askFor(s, id)) continue;
    // Not twice in a row: a family that asked waits a month.
    if ((t.rivalCd[`ask:${id}`] ?? -999) > s.week - 4) continue;
    const c = candidate(s, id);
    if (!c) continue;
    const ask: FamAsk = { ...c, id: `fa${t.nextId++}`, w: s.week + 1, until: s.week + 1, ...(c.offer.length ? { offerText: describeDeal(s, id, c.offer as Term[]) } : {}) };
    (t.asks ??= []).push(ask);
    t.rivalCd[`ask:${id}`] = s.week;
    const boss = s.characters[rivalOf(s, id)!.leaderId];
    logTalk(s, `${askTitle(ask)}.`, 'talk', boss?.id);
    ctx.log.push(`${askTitle(ask)}.`);
    return;
  }
}

function lapse(ctx: Ctx, a: FamAsk): void {
  const s = ctx.s;
  const r = rivalOf(s, a.rival);
  const boss = r ? s.characters[r.leaderId] : undefined;
  if (!r || !boss?.alive) return;
  const fam = FACTION_NAMES[a.rival];
  addOpinion(s, boss.id, s.playerId, 'Ignored my request for a sit-down', -6, 1);
  recordMut(s, a.rival).last = 'you ignored my request for a sit-down';
  const out: string[] = [`${displayName(boss)} thinks less of you (−6).`];
  switch (a.kind) {
    case 'grievance':
      if (a.district) {
        shiftInfluence(s, a.district, a.rival, 3);
        const lost = -shiftInfluence(s, a.district, 'player', -2);
        out.push(`${fam} moved on ${dn(s, a.district)} on its own (their ground +3, yours −${lost}).`);
      }
      bumpTension(s, 'player', a.rival, 8, `${fam}'s grievance went unanswered`);
      break;
    case 'tribute':
      addOpinion(s, boss.id, s.playerId, 'Would not even talk about tribute', -4, 1);
      bumpTension(s, 'player', a.rival, 12, 'You ignored their demand for tribute');
      out.push('Tension with them rises.');
      break;
    case 'peace':
      addOpinion(s, boss.id, s.playerId, 'Turned down peace', -4, 1);
      out.push('The war goes on.');
      break;
    case 'table': {
      const ph = s.rivals.find((x) => x.id === 'philly');
      if (ph && s.characters[ph.leaderId]?.alive) addOpinion(s, ph.leaderId, s.playerId, 'Ignored the Table', -8, 1);
      s.heat.family = Math.min(100, s.heat.family + 4);
      out.push('Philadelphia marks it down (−8); family heat +4.');
      break;
    }
    case 'partnership':
      break;
  }
  const text = `You ignored ${fam}'s request for a sit-down (${ASK_LABEL[a.kind]}).`;
  logTalk(s, text, 'talk', boss.id);
  journal(s, { t: text, x: out.join(' '), p: [boss.id, ...(a.charId ? [a.charId] : [])], ...(a.district ? { pl: [`d:${a.district}`] } : {}), c: 'rivals', src: 'talk', ln: 'diplomacy.board' });
  ctx.log.push(text);
}

/** The boss sat down to hear it: the ask is answered (no lapse). Pure. */
export function answerAsk(input: GameState, rival: string): GameState {
  const a = askFor(input, rival);
  if (!a) return input;
  const s = cloneState(input);
  const t = ensureTalks(s);
  t.asks = (t.asks ?? []).filter((x) => x.id !== a.id);
  if (!t.asks.length) delete t.asks;
  return s;
}

/** His opinion now, for the Desk's line. */
export function askOpinion(s: GameState, a: FamAsk): number {
  const r = rivalOf(s, a.rival);
  return r ? opinion(s, r.leaderId, s.playerId) : 0;
}
