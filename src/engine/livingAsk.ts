import type { ActionPreview } from './actions';
import { HOODS_BY_ID } from './hoodData';
import { addOpinion } from './relations';
import { respect, type Ctx } from './ledger';
import { askAround, bossLearns, districtCapo, fact, factById, personName, tell } from './livingKnow';
import { pay } from './livingMoney';
import { backstory, closeStory, link, storyById } from './livingStory';
import { clamp, ensureLiving, he, him, his, pname, present, type LivingState, type Td, type Ts } from './livingState';
import { hireAt, lenderName, livingIndex, newDebt, upkeepOf, useEconomics } from './livingWorld';
import type { Choice, EventInstance, GameState, RivalId } from './types';

/**
 * REQUESTS FROM REAL SITUATIONS (B14). When a townsman in trouble goes to the
 * district's capo and the capo decides it is the boss's business, the story
 * it came from becomes a request: the capo brings it, with the backstory the
 * boss now knows ("Sal borrowed from Frank Greco to keep the house going; he
 * missed a payment; he came to me"). The boss's answer is a normal command
 * (Family money moves through the ledger), and the story goes on from there.
 *
 * Also the boss's own two orders about the district: have the capo ask
 * around about someone (finds only what really happened), and send a family
 * money.
 */

export type AskChoice = 'pay' | 'take' | 'lean' | 'decline' | 'lend' | 'find' | 'make_good' | 'give' | 'job';

export type LivingOp =
  | { op: 'answer'; story: string; choice: AskChoice; amt?: number }
  | { op: 'ask'; pid: string }
  | { op: 'give'; hh: string; amt: number };

/** The boss's orders about the district. */
export type LivingAction = { op: 'ask'; pid: string } | { op: 'give'; hh: string; amt: number };

/* ------------------------------------------------------------------ */
/* What the request is about                                           */
/* ------------------------------------------------------------------ */

function askerOf(L: LivingState, st: Ts): string | undefined {
  for (let i = st.f.length - 1; i >= 0; i--) {
    const f = factById(L, st.f[i]);
    if (f?.k === 'asked_help') return f.a[0];
  }
  return st.cast.find((id) => id.startsWith('tp'));
}

function debtOf(L: LivingState, st: Ts): Td | undefined {
  return L.debts.find((d) => d.st === 'open' && st.f.includes(d.fid)) ?? L.debts.find((d) => d.st === 'open' && st.cast.includes(d.by) && st.k === 'debt');
}

type AskKind = 'debt' | 'theft' | 'failing' | 'house' | 'build';

function kindOf(L: LivingState, st: Ts): AskKind {
  if (debtOf(L, st)) return 'debt';
  if (st.k === 'theft') return 'theft';
  if (st.k === 'failing') return 'failing';
  // A family whose builder stopped work on their new house (housing.ts).
  if (st.f.some((id) => factById(L, id)?.k === 'broke_ground')) return 'build';
  return 'house';
}

function familyPlace(s: GameState, L: LivingState): string | undefined {
  const zones = new Set<string>(L.hoods.flatMap((h) => HOODS_BY_ID[h].zones));
  const l = (s.econ?.lots ?? []).filter((x) => zones.has(x.zone) && (x.status === 'owned' || x.status === 'leased') && x.stage === 'open' && x.use).sort((a, b) => a.id.localeCompare(b.id))[0];
  return l?.id;
}

/* ------------------------------------------------------------------ */
/* The request (one popup, through the director)                       */
/* ------------------------------------------------------------------ */

export function livingRequest(s: GameState, st: Ts): EventInstance | undefined {
  const L = s.living;
  if (!L || !st.ask || st.ask.ans) return undefined;
  const capo = s.characters[st.ask.via];
  const askerId = askerOf(L, st);
  const asker = askerId ? L.people[askerId] : undefined;
  if (!capo?.alive || !present(asker, s.week)) return undefined;
  const kind = kindOf(L, st);
  const d = debtOf(L, st);
  const who = pname(asker);
  const cn = `${capo.firstName}`;
  const lines = backstory(s, st);
  const ix = livingIndex(s, L);
  const hh = L.hh[asker.hh];
  const up = hh ? upkeepOf(L, hh, ix) : 30;
  const mk = (id: AskChoice, label: string, detail: string, because: string, amt?: number, disabled?: string): Choice => ({
    id, label, detail, because, effects: [{ type: 'living', op: { op: 'answer', story: st.id, choice: id, ...(amt ? { amt } : {}) }, label: `${who}: ${label}` }], ...(disabled ? { disabledReason: disabled } : {}),
  });
  const short = (n: number) => (s.money < n ? `The Family has $${Math.max(0, Math.round(s.money)).toLocaleString('en-US')}; this takes $${n.toLocaleString('en-US')}.` : undefined);
  const choices: Choice[] = [];
  let title = '';
  let ask = '';
  if (kind === 'debt' && d) {
    const lender = lenderName(s, L, d);
    title = `${who} owes ${lender}`;
    ask = `${he(asker) === 'she' ? 'She' : 'He'} owes $${d.out.toLocaleString('en-US')} and cannot make the payments. What do you want me to tell ${him(asker)}?`;
    choices.push(mk('pay', `Pay it off ($${d.out.toLocaleString('en-US')})`, `Family money settles it with ${lender}. ${who} owes nothing and will not forget it.`, `paid off ${who}'s debt to ${lender}`, d.out, short(d.out)));
    choices.push(mk('take', `Take the debt over ($${d.out.toLocaleString('en-US')})`, `The Family pays ${lender}; ${who} pays the Family back, no vig, over 30 weeks.`, `took over ${who}'s debt`, d.out, short(d.out)));
    if (d.lender.startsWith('rival:')) choices.push(mk('lean', `Tell ${lender} ${he(asker)} is under your protection`, `${cn} lets them know. They will wait, and they will remember it.`, `put ${who} under your protection`));
    else if (d.lender !== 'family') choices.push(mk('lean', `Have ${cn} get ${him(asker)} time`, `${cn} tells ${lender} to wait two months. The debt stands.`, `got ${who} more time`));
  } else if (kind === 'theft') {
    const f = st.f.map((id) => factById(L, id)).find((x) => x?.k === 'theft');
    const amt = f?.amt ?? 100;
    title = `${who} was robbed`;
    ask = `Somebody took $${amt} from ${his(asker)} family. ${he(asker) === 'she' ? 'She' : 'He'} wants to know who.`;
    choices.push(mk('find', `Have ${cn} find out who did it`, `${cn} asks around. If he finds the thief, the money comes back and the street learns who keeps order here.`, `had ${cn} find ${who}'s thief`));
    choices.push(mk('make_good', `Make it good ($${amt})`, `Family money replaces what was taken.`, `made good ${who}'s loss`, amt, short(amt)));
  } else if (kind === 'failing') {
    const lot = asker.job ? ix.lots.get(asker.job) : undefined;
    const loan = Math.round((lot ? useEconomics(lot).exp : 200) * 4 * ix.infl);
    title = `${lot?.name ?? 'A shop'} is going under`;
    ask = `${who} cannot pay ${his(asker)} people or ${his(asker)} suppliers. ${he(asker) === 'she' ? 'She' : 'He'} is asking the Family for a loan.`;
    choices.push(mk('lend', `Lend ${him(asker)} $${loan.toLocaleString('en-US')} (20 weeks, 10%)`, `Family money now; ${who} pays it back weekly, with a little on top.`, `lent ${who} money for the shop`, loan, short(loan)));
  } else if (kind === 'build') {
    const f = [...st.f].reverse().map((id) => factById(L, id)).find((x) => x?.k === 'asked_help');
    const amt = Math.max(100, Math.round(((f?.amt ?? 500) + 99) / 100) * 100);
    title = `${hh?.name ?? 'A family'}: the builder stopped work`;
    ask = `They are $${amt.toLocaleString('en-US')} short for the builder on their new house. They are asking the Family.`;
    choices.push(mk('lend', `Lend them $${amt.toLocaleString('en-US')} (20 weeks, 10%)`, `Family money to the builder's bill now; they pay it back weekly, a little on top.`, `lent ${who} money for the house`, amt, short(amt)));
    choices.push(mk('give', `Pay it for them ($${amt.toLocaleString('en-US')})`, `Family money, a gift. The house goes up and they will remember who finished it.`, `paid ${who}'s builder`, amt, short(amt)));
  } else {
    const amt = up * 6;
    title = `${hh?.name ?? 'A family'} cannot make ends meet`;
    ask = `No work and the bills piling up. They are asking for help.`;
    choices.push(mk('give', `Help them ($${amt})`, `Family money, a gift. They will remember who helped.`, `helped ${hh?.name ?? 'a family'}`, amt, short(amt)));
    const place = familyPlace(s, L);
    if (place && !asker.job) choices.push(mk('job', `Give ${him(asker)} a job at ${ix.lots.get(place)?.name ?? 'one of your places'}`, `Steady wages at one of the Family's places.`, `gave ${who} a job`));
  }
  choices.push(mk('decline', `Leave it to ${cn}`, `You stay out of it. ${cn} will tell ${him(asker)} there is nothing to be done.`, `stayed out of ${who}'s trouble`));
  const text = [`${capo.firstName} ${capo.lastName} has something from ${hh ? HOODS_BY_ID[hh.hood]?.name ?? 'the Boardwalk' : 'the Boardwalk'}.`, ...lines.map((x) => `• ${x}`), ask].join('\n\n');
  return {
    iid: `living:${st.id}`, defId: 'living_request', title, text, week: s.week, choices, defaultChoiceId: 'decline', mandatory: true, priority: 44,
    // A real situation waiting on an answer (and the capo brings one at most every eight weeks): not held back as "the same story again".
    meta: { story: st.id, charId: capo.id, due: 1 }, actors: [capo.id],
  };
}

/** The popup pipeline's candidate: the oldest unanswered request (requests that waited too long are the capo's to settle). */
export function livingEventSource(s: GameState): EventInstance | undefined {
  const L = s.living;
  if (!L) return undefined;
  for (const st of L.stories) {
    // A request queued when it was made gets its own seat; this offers it again if the week was too full.
    if (!st.open || !st.ask || st.ask.ans || s.week - st.ask.w > 4 || (st.ask.iid && s.week - st.ask.w < 3)) continue;
    const ev = livingRequest(s, st);
    if (ev) return ev;
  }
  return undefined;
}

/** A request nobody answered: the capo settles it his own way (weekly). */
export function expireRequests(ctx: Ctx, L: LivingState): void {
  const s = ctx.s;
  for (const st of L.stories) {
    if (!st.ask || st.ask.ans) continue;
    // It sorted itself out before the boss answered.
    if (!st.open) { st.ask.ans = 'moot'; st.ask.aw = s.week; continue; }
    if (s.week - st.ask.w <= 4) continue;
    st.ask.ans = 'capo';
    st.ask.aw = s.week;
    const capo = s.characters[st.ask.via];
    const d = debtOf(L, st);
    if (capo?.alive && d && !d.lender.startsWith('rival:') && d.lender !== 'family') {
      d.missed = 0;
      d.next = s.week + 4;
      d.grace = s.week;
      const f = fact(s, L, 'capo_settled', [capo.id, d.by], `${capo.firstName} ${capo.lastName} got ${pname(L.people[d.by])} a month from ${lenderName(s, L, d)} on his own.`, 2);
      link(L, st, f);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

export function describeLivingOp(s: GameState, o: LivingOp): string | undefined {
  const L = s.living;
  const money = (n?: number) => (n ? `−$${n.toLocaleString('en-US')} Family money` : '');
  switch (o.op) {
    case 'answer': {
      const st = L ? storyById(L, o.story) : undefined;
      const who = st && L ? pname(L.people[askerOf(L, st) ?? '']) : 'them';
      switch (o.choice) {
        case 'pay': return `${money(o.amt)}: the debt is paid; ${who} is grateful`;
        case 'take': return `${money(o.amt)} now; ${who} owes the Family instead`;
        case 'lean': return `The lender waits two months`;
        case 'lend': return `${money(o.amt)} lent; paid back weekly`;
        case 'find': return `The capo looks for the thief (finds him only if there is one to find)`;
        case 'make_good': case 'give': return `${money(o.amt)}: a gift; ${who} is grateful`;
        case 'job': return `${who} goes to work at one of your places`;
        case 'decline': return `Nothing from you; ${who} remembers that too`;
      }
      return undefined;
    }
    case 'ask': return `Your capo asks around about ${personName(s, o.pid)}`;
    case 'give': return `${money(o.amt)} to ${L?.hh[o.hh]?.name ?? 'the family'}`;
  }
}

function gratitude(s: GameState, L: LivingState, pid: string, by: number): void {
  const p = L.people[pid];
  if (!p) return;
  const t = (p.ties[s.playerId] ??= { a: 0, tr: 30, gr: 0 });
  t.a = clamp(t.a + by, -100, 100);
  t.tr = clamp(t.tr + Math.round(by / 2));
  if (by < 0) t.why = 'turned a deaf ear when he needed help';
}

export function applyLivingOp(ctx: Ctx, o: LivingOp): void {
  const s = ctx.s;
  const L = ensureLiving(s);
  if (!L) return;
  if (o.op === 'ask') {
    const p = L.people[o.pid];
    const capo = p ? districtCapo(s, L.hh[p.hh]?.hood ?? L.hoods[0]) : undefined;
    const n = askAround(s, L, o.pid, capo ? `${capo.firstName} ${capo.lastName}, asking around` : 'asking around the Boardwalk');
    L.askW = s.week;
    ctx.log.push(n ? `Asking around about ${personName(s, o.pid)} turned up ${n} thing${n === 1 ? '' : 's'}.` : `Asking around about ${personName(s, o.pid)} turned up nothing new.`);
    return;
  }
  if (o.op === 'give') {
    const hh = L.hh[o.hh];
    if (!hh || hh.gone !== undefined) return;
    const got = pay(ctx, L, 'family', `h:${hh.id}`, o.amt, `Family money to ${hh.name}`);
    if (!got) return;
    const head = hh.members.map((id) => L.people[id]).find((p) => present(p, s.week));
    fact(s, L, 'boss_helped', [s.playerId, ...(head ? [head.id] : [])], `The boss sent ${hh.name} $${got}.`, 1, { amt: got, kn: hh.members });
    for (const id of hh.members) gratitude(s, L, id, 25);
    return;
  }
  const st = storyById(L, o.story);
  if (!st || !st.ask || st.ask.ans) return;
  st.ask.ans = o.choice;
  st.ask.aw = s.week;
  const askerId = askerOf(L, st);
  const asker = askerId ? L.people[askerId] : undefined;
  if (!asker) return;
  const capo = s.characters[st.ask.via];
  const d = debtOf(L, st);
  const who = pname(asker);
  const note = (k: 'boss_helped' | 'boss_refused' | 'mediated', txt: string, sec: 0 | 1 | 2, amt?: number) => {
    const f = fact(s, L, k, [s.playerId, asker.id, ...(capo ? [capo.id] : [])], txt, sec, { ...(amt ? { amt } : {}), c: [st.f[st.f.length - 1]] });
    link(L, st, f);
    return f;
  };
  switch (o.choice) {
    case 'pay':
    case 'take': {
      if (!d) return;
      const out = d.out;
      const got = pay(ctx, L, 'family', lenderTo(L, s, d), out, `The Family pays ${lenderName(s, L, d)} what ${who} owed`);
      if (!got) return;
      d.out -= got;
      if (d.out <= 0) { d.out = 0; d.st = 'paid'; }
      if (o.choice === 'pay') {
        note('boss_helped', `The boss paid off ${who}'s debt to ${lenderName(s, L, d)} ($${got}).`, 1, got);
        closeStory(s, st, `The boss paid it off.`);
        gratitude(s, L, asker.id, 40);
      } else {
        const f = note('boss_helped', `The boss took over ${who}'s debt: ${he(asker)} pays the Family back now, no vig.`, 1, got);
        const nd = newDebtOwedOnly(L, s, asker.id, asker.hh, got, f);
        void nd;
        gratitude(s, L, asker.id, 25);
      }
      return;
    }
    case 'lean': {
      if (!d) return;
      d.missed = 0;
      d.next = s.week + 8;
      d.grace = s.week;
      if (d.lender.startsWith('rival:')) {
        const r = s.rivals.find((x) => x.id === (d.lender.slice(6) as RivalId));
        if (r) addOpinion(s, r.leaderId, s.playerId, `Protected ${who} from our shylock`, -6, 1);
      } else if (d.lender.startsWith('tp')) {
        const lp = L.people[d.lender];
        if (lp) { const t = (lp.ties[s.playerId] ??= { a: 0, tr: 30, gr: 0 }); t.a = clamp(t.a - 8, -100, 100); }
      }
      note('mediated', `${capo ? capo.firstName : 'The capo'} told ${lenderName(s, L, d)} to give ${who} two months, on the boss's word.`, 1);
      gratitude(s, L, asker.id, 20);
      return;
    }
    case 'lend': {
      const amt = o.amt ?? 0;
      const house = kindOf(L, st) === 'build';
      const f = note('boss_helped', house ? `The boss lent ${who} $${amt} to finish the house.` : `The boss lent ${who} $${amt} to keep the shop going.`, 1, amt);
      const nd = newDebt(ctx, L, { lender: 'family', from: 'family', by: asker, amt, rate: 0.1, weeks: 20, why: house ? 'a loan from the Family for the house' : 'a loan from the Family for the shop', fid: f });
      if (nd) gratitude(s, L, asker.id, 25);
      return;
    }
    case 'find': {
      const theft = st.f.map((id) => factById(L, id)).find((x) => x?.k === 'theft');
      const thiefF = st.f.map((id) => factById(L, id)).find((x) => x?.k === 'thief');
      const thief = thiefF ? L.people[thiefF.a[0]] : undefined;
      // He finds only what is there to find; a thief who left town is gone.
      if (thiefF && thief && present(thief, s.week)) {
        bossLearns(s, thiefF, 'confirmed', `${capo ? capo.firstName : 'Your capo'}, who found him`);
        if (capo) tell(thiefF, capo.id);
        const amt = theft?.amt ?? 0;
        let back = pay(ctx, L, `p:${thief.id}`, `h:${asker.hh}`, amt, `${pname(thief)} gives back what ${he(thief)} took`);
        if (back < amt) back += pay(ctx, L, `h:${thief.hh}`, `h:${asker.hh}`, amt - back, `${pname(thief)}'s family makes it good`);
        note('mediated', `${capo ? capo.firstName : 'The capo'} found out it was ${pname(thief)}; ${back ? `$${back} came back` : 'there was nothing left to give back'}.`, 0, back);
        const t = (thief.ties[capo?.id ?? s.playerId] ??= { a: 0, tr: 30, gr: 0 });
        t.gr = clamp(t.gr + 30);
        t.why = 'shamed him in front of the Boardwalk';
        respect(ctx, 1, `Order on the Boardwalk: ${who}'s money came back`, 'event');
        closeStory(s, st, `${pname(thief)} was found out.`);
        gratitude(s, L, asker.id, 30);
      } else {
        note('mediated', `${capo ? capo.firstName : 'The capo'} asked around about ${who}'s money and came up empty.`, 1);
        gratitude(s, L, asker.id, 8);
      }
      return;
    }
    case 'make_good':
    case 'give': {
      const amt = o.amt ?? 0;
      const got = pay(ctx, L, 'family', `h:${asker.hh}`, amt, `Family money to ${L.hh[asker.hh]?.name ?? who}`);
      note('boss_helped', `The boss gave ${who} $${got}.`, 1, got);
      gratitude(s, L, asker.id, 30);
      if (o.choice === 'make_good') closeStory(s, st, 'The boss made it good.');
      return;
    }
    case 'job': {
      const place = familyPlace(s, L);
      if (!place) return;
      hireAt(s, L, asker, place, ', one of the Family\'s places, on the boss\'s word');
      note('boss_helped', `The boss gave ${who} a job.`, 1);
      gratitude(s, L, asker.id, 30);
      return;
    }
    case 'decline':
      note('boss_refused', `The boss stayed out of ${who}'s trouble.`, 2);
      gratitude(s, L, asker.id, -10);
      return;
  }
}

function lenderTo(L: LivingState, s: GameState, d: Td): string {
  if (d.lender.startsWith('tp')) {
    const lp = L.people[d.lender];
    const hh = lp ? L.hh[lp.hh] : undefined;
    return hh && hh.gone === undefined ? `h:${hh.id}` : 'x:estate';
  }
  if (d.lender.startsWith('rival:')) return d.lender;
  if (d.lender === 'bank') return 'x:bank';
  const c = s.characters[d.lender];
  return c?.alive ? `wealth:${c.id}` : 'x:estate';
}

/** A debt the Family took over: no money moves now (the Family already paid the lender). */
function newDebtOwedOnly(L: LivingState, s: GameState, by: string, hh: string, amt: number, fid: string): Td {
  const d: Td = { id: `td${L.next++}`, lender: 'family', by, hh, amt, out: amt, pay: Math.max(1, Math.ceil(amt / 30)), next: s.week + 2, missed: 0, fid, st: 'open', why: 'the debt the boss took over', w: s.week };
  L.debts.push(d);
  return d;
}

/* ------------------------------------------------------------------ */
/* The boss's orders about the district                                */
/* ------------------------------------------------------------------ */

export function previewLiving(s: GameState, a: LivingAction): ActionPreview {
  const L = s.living;
  if (a.op === 'ask') {
    const p = L?.people[a.pid];
    const capo = p && L ? districtCapo(s, L.hh[p.hh]?.hood ?? L.hoods[0]) : undefined;
    const name = p ? pname(p) : 'him';
    return {
      title: `Ask around about ${name}`,
      detail: `${capo ? `${capo.firstName} ${capo.lastName}` : 'Someone'} asks the people who know ${p ? him(p) : 'him'}. What the street knows comes back as talk or better; a well-kept secret rarely does. Nothing is made up.`,
      effects: [{ type: 'living', op: { op: 'ask', pid: a.pid }, label: `Ask around about ${name}` }],
      cost: 0, because: `had ${capo?.firstName ?? 'someone'} ask around about ${name}`, category: 'event', verb: 'Ask around',
      disabledReason: !p || !present(p, s.week) ? 'Not on the Boardwalk now.' : !capo ? 'You have no capo on the Boardwalk to do the asking.' : L!.askW === s.week ? 'Your capo already asked around about someone this week.' : undefined,
    };
  }
  const hh = L?.hh[a.hh];
  return {
    title: `Send ${hh?.name ?? 'the family'} $${a.amt.toLocaleString('en-US')}`,
    detail: 'Family money, a gift. Word gets around who helped.',
    effects: [{ type: 'living', op: { op: 'give', hh: a.hh, amt: a.amt }, label: `Help ${hh?.name ?? 'the family'}` }],
    cost: a.amt, because: `helped ${hh?.name ?? 'a family'}`, category: 'event', verb: `Send $${a.amt.toLocaleString('en-US')}`,
    disabledReason: !hh || hh.gone !== undefined ? 'They are not on the Boardwalk any more.' : s.money < a.amt ? `The Family has $${Math.max(0, Math.round(s.money)).toLocaleString('en-US')}.` : undefined,
  };
}

/** The capo has decided to bring it to the boss: the request goes into next week's queue. */
export function queueRequest(s: GameState, st: Ts): void {
  const ev = livingRequest(s, st);
  if (!ev || !st.ask) return;
  st.ask.iid = ev.iid;
  s.eventQueue.push(ev);
}
