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
import { noteBroken, noteKept, recordMut } from './familyWord';
import { owedBy } from '../deeds/state';
import { applyEffects } from '../effects';
import { newCtx, type Ctx as Ctx2 } from '../ledger';
import { rivalRelation } from '../talks';
import type { Character, Effect } from '../types';
import type { FavorAsk } from './askView';
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
  // A favor the boss owes their boss: they come to collect it, first.
  if (owedBy(s, s.playerId, c.id) > 0 && roll('collect') < 0.2) {
    const f = favorFor(s, rival, roll);
    if (f) return { rival, kind: 'collect', text: f.text, ...(f.favor.district ? { district: f.favor.district } : {}), offer: [], favor: f.favor };
  }
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
  if (a.kind === 'collect') { refuseFavorIn(ctx.s, a, true); ctx.log.push(`You never answered ${FACTION_NAMES[a.rival]} about the favor: they take it as a no.`); return; }
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
      applyEffects(ctx, [{ type: 'heat', bar: 'family', amount: 4, label: 'Ignored Philadelphia\'s call to the Table' }], { label: '', because: '' });
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

/* ------------------------------------------------------------------ */
/* Favors: they come to collect                                         */
/* ------------------------------------------------------------------ */

/** Your men who could be lent for a week: free, not a capo or above, not busy. Never more than two. */
export function lendableMen(s: GameState): Character[] {
  return Object.values(s.characters)
    .filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && (c.rank === 'soldier' || c.rank === 'associate') && (c.imprisonedUntil ?? 0) <= s.week && (c.busyUntil ?? 0) <= s.week)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** What they ask for: concrete and bounded. */
function favorFor(s: GameState, rival: RivalId, roll: (k: string) => number): { favor: FavorAsk; text: string } | undefined {
  const opts: { favor: FavorAsk; text: string }[] = [];
  const near = s.districts.filter((d) => (d.influence.player ?? 0) >= 5 && (d.influence[rival] ?? 0) > 0);
  if (near.length) {
    const d = near[Math.floor(roll('fd') * near.length)];
    const weeks = 4 + Math.floor(roll('fw') * 5);
    opts.push({ favor: { kind: 'lookaway', district: d.id, weeks }, text: `You owe me one. Look the other way in ${d.name} for ${weeks} weeks: your people don't push, whatever mine do.` });
  }
  const mine = s.districts.filter((d) => (d.influence.player ?? 0) >= 10);
  if (mine.length) {
    const d = mine[Math.floor(roll('gd') * mine.length)];
    const weeks = 8 + Math.floor(roll('gw') * 9);
    const cut = Math.round((60 + roll('gc') * 90) / 10) * 10;
    opts.push({ favor: { kind: 'game', district: d.id, weeks, cut }, text: `You owe me one. My people run a card game in ${d.name}, in your territory, for ${weeks} weeks. You get ${'$'}${cut} a week for the courtesy.` });
  }
  const foes = s.rivals.filter((o) => o.kind === 'mob' && o.id !== rival && s.characters[o.leaderId]?.alive && rivalRelation(s, rival, o.id) < 0);
  if (foes.length) {
    const o = foes[Math.floor(roll('vo') * foes.length)];
    opts.push({ favor: { kind: 'vote', against: o.id }, text: `You owe me one. At the Table, you stand with me against ${FACTION_NAMES[o.id]}.` });
  }
  const men = lendableMen(s);
  if (men.length) {
    const n = men.length >= 2 && roll('mn') < 0.5 ? 2 : 1;
    const start = Math.floor(roll('mm') * men.length);
    const pick = [men[start], ...(n === 2 ? [men[(start + 1) % men.length]] : [])].filter((x, i, a) => a.indexOf(x) === i);
    opts.push({ favor: { kind: 'muscle', menIds: pick.map((c) => c.id) }, text: `You owe me one. Lend me ${pick.map((c) => displayName(c)).join(' and ')} for a week: drive, stand around, look big. Nobody lays a finger on them, my word.` });
  }
  return opts.length ? opts[Math.floor(roll('fk') * opts.length)] : undefined;
}

/** What doing the favor means, in words (for the confirm). */
export function favorTerms(s: GameState, a: FamAsk): string[] {
  const f = a.favor;
  if (!f) return [];
  const fam = FACTION_NAMES[a.rival];
  switch (f.kind) {
    case 'lookaway': return [`Your people stay out of ${dn(s, f.district)} for ${f.weeks} weeks (a hands-off pact; growing there breaks your word).`];
    case 'game': return [`${fam} runs a game in ${dn(s, f.district)}: their ground there +3.`, `You get $${f.cut}/wk for ${f.weeks} weeks, through the books.`];
    case 'vote': return [`You stand with ${fam} against ${FACTION_NAMES[f.against!]}: ${FACTION_NAMES[f.against!]} thinks less of you (−8).`, `${fam} gains ground where the two of them fight.`];
    case 'muscle': return [`${(f.menIds ?? []).map((id) => (s.characters[id] ? displayName(s.characters[id]) : '?')).join(' and ')} busy for a week with ${fam}: no work for you, and they come back unharmed.`];
  }
}

/** Can the favor be done now? */
export function canHonor(s: GameState, a: FamAsk): { ok: boolean; why?: string } {
  const f = a.favor;
  if (a.kind !== 'collect' || !f) return { ok: false, why: 'Not a favor' };
  const r = rivalOf(s, a.rival);
  if (!r || !s.characters[r.leaderId]?.alive) return { ok: false, why: 'Their boss is gone' };
  if (owedBy(s, s.playerId, r.leaderId) < 1) return { ok: false, why: 'You owe them nothing now' };
  if (f.kind === 'muscle') {
    const free = new Set(lendableMen(s).map((c) => c.id));
    if (!(f.menIds ?? []).length || (f.menIds ?? []).some((id) => !free.has(id))) return { ok: false, why: 'Those men are not free this week' };
  }
  return { ok: true };
}

const favorWords: Record<FavorAsk['kind'], string> = { lookaway: 'looked the other way', game: 'let them run a game', vote: 'stood with them at the Table', muscle: 'lent them muscle for a week' };

/**
 * Do the favor (the boss's explicit yes): the favor owed is spent, your word
 * is kept, and the favor happens through the game's mechanics. Pure.
 */
export function honorFavor(input: GameState, askId: string): { state: GameState; ok: boolean; why?: string; changes: string[] } {
  const a0 = openAsks(input).find((x) => x.id === askId);
  if (!a0) return { state: input, ok: false, why: 'That request is gone', changes: [] };
  const can = canHonor(input, a0);
  if (!can.ok) return { state: input, ok: false, why: can.why, changes: [] };
  const s = cloneState(input);
  const a = openAsks(s).find((x) => x.id === askId)!;
  const f = a.favor!;
  const r = rivalOf(s, a.rival)!;
  const boss = s.characters[r.leaderId];
  const fam = FACTION_NAMES[a.rival];
  const t = ensureTalks(s);
  const ctx: Ctx2 = newCtx(s);
  const changes = favorTerms(s, a);
  const eff: Effect[] = [{ type: 'deed', op: { op: 'spendOwed', by: s.playerId, to: boss.id } }, { type: 'opinion', from: boss.id, to: s.playerId, amount: 8, reason: 'Paid the favor he owed', decay: 1 }];
  switch (f.kind) {
    case 'lookaway':
      t.pacts.push({ id: `pact${t.nextId++}`, a: 'player', b: a.rival, kind: 'handsoff', since: s.week, until: s.week + (f.weeks ?? 4), terms: `a favor: your house stays out of ${dn(s, f.district)} for ${f.weeks} weeks`, district: f.district, bound: 'player', base: Math.round(s.districts.find((d) => d.id === f.district)?.influence.player ?? 0) });
      break;
    case 'game':
      shiftInfluence(s, f.district!, a.rival, 3);
      t.pacts.push({ id: `pact${t.nextId++}`, a: 'player', b: a.rival, kind: 'split', since: s.week, until: s.week + (f.weeks ?? 8), weekly: f.cut, payer: a.rival, terms: `their card game in ${dn(s, f.district)}: $${f.cut}/wk to you for ${f.weeks} weeks` });
      break;
    case 'vote': {
      const o = s.rivals.find((x) => x.id === f.against);
      if (o) {
        eff.push({ type: 'rivalOpinion', rival: o.id, amount: -8, reason: `Stood with ${fam} at the Table` });
        const d = s.districts.filter((x) => (x.influence[a.rival] ?? 0) > 0 && (x.influence[o.id] ?? 0) > 0).sort((x, y) => (y.influence[o.id] ?? 0) - (x.influence[o.id] ?? 0))[0];
        if (d) { shiftInfluence(s, d.id, a.rival, 2); shiftInfluence(s, d.id, o.id, -2); }
      }
      break;
    }
    case 'muscle':
      for (const id of f.menIds ?? []) { const c = s.characters[id]; if (c) c.busyUntil = s.week + 1; }
      break;
  }
  applyEffects(ctx, eff, { label: `A favor for ${fam}`, because: `${favorWords[f.kind]} for ${displayName(boss)}`, category: 'event' });
  t.asks = (t.asks ?? []).filter((x) => x.id !== askId);
  if (!t.asks.length) delete t.asks;
  noteKept(s, a.rival, `you paid the favor you owed: ${favorWords[f.kind]}`);
  const text = `You paid ${fam} the favor you owed: you ${favorWords[f.kind]}.`;
  logTalk(s, text, 'pact', boss.id);
  journal(s, { t: text, x: changes.join(' '), p: [boss.id, ...(f.menIds ?? [])], ...(f.district ? { pl: [`d:${f.district}`] } : {}), c: 'rivals', src: 'talk', ln: 'diplomacy.board', mine: 1, r: changes });
  return { state: s, ok: true, changes };
}

function refuseFavorIn(s: GameState, a: FamAsk, silent: boolean): string {
  const r = rivalOf(s, a.rival);
  const boss = r ? s.characters[r.leaderId] : undefined;
  const fam = FACTION_NAMES[a.rival];
  if (boss) addOpinion(s, boss.id, s.playerId, 'Refused the favor he owed me', -12, 1);
  noteBroken(s, a.rival, 'you refused the favor you owed', true);
  const text = silent ? `You never answered ${fam} about the favor you owe: a no, and they remember it.` : `You refused ${fam} the favor you owe.`;
  logTalk(s, text, 'talk', boss?.id);
  journal(s, { t: text, x: `${boss ? `${displayName(boss)} thinks much less of you (−12). ` : ''}Your word with them suffers. You still owe the favor.`, ...(boss ? { p: [boss.id] } : {}), c: 'rivals', src: 'talk', ln: 'diplomacy.board', mine: 1 });
  return text;
}

/** Say no (the favor stays owed; your word with them suffers). Pure. */
export function refuseFavor(input: GameState, askId: string): GameState {
  const a0 = openAsks(input).find((x) => x.id === askId && x.kind === 'collect');
  if (!a0) return input;
  const s = cloneState(input);
  const t = ensureTalks(s);
  const a = t.asks!.find((x) => x.id === askId)!;
  t.asks = t.asks!.filter((x) => x.id !== askId);
  if (!t.asks.length) delete t.asks;
  refuseFavorIn(s, a, false);
  return s;
}
