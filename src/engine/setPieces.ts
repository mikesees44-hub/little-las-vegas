import { ensureAction } from './actionState';
import { dateOfWeek, laborDay, memorialDay, toDays } from './calendar';
import { capos, displayName, isFree } from './characters';
import { applyEffects } from './effects';
import { journal } from './journal';
import { heat, money, newCtx, type Ctx } from './ledger';
import { opinion } from './relations';
import { today } from './days';
import type { NowResult } from './deeds/now';
import type { MomentView } from './schedule';
import type { Effect, EventInstance, GameDate, GameState, RivalId } from './types';

/**
 * THE SEASON'S SET-PIECES (DAILY_LOGIC_AND_ACTION #4): four guaranteed peaks a year, each a
 * Monday decision with odds, a cutscene card and a front page, with real stakes in the world.
 *
 *  - Opening weekend (Memorial Day): the first crowds, the first envelope of the season.
 *  - The Fourth of July: the biggest crowd of the summer; the week's take half again as big, and
 *    the cops on overtime on the boardwalk (local heat).
 *  - Labor Day: the season's count. Philadelphia wants its bonus; somebody came up short.
 *  - The September hurricane (1960: Donna, which came ashore at the Shore in the week of September
 *    12; in later years a storm about one year in three, late August to mid-September): the warning
 *    on Monday (a card, the front page, a countdown), the landfall on a night that week on the running
 *    clock: the boss decides at the door, with odds (resolveStorm): board up, help the neighbors, keep
 *    the stands open to the last minute, or use the storm for cover. Boardwalk places shut a week or more.
 *
 * Dates are the calendar's (Memorial Day, Labor Day); rolls are hashed off the seed (never the dice).
 */

function roll(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The game week that contains a date (week 1 starts Monday, Memorial Day 1960). */
export function weekOfDate(d: GameDate): number {
  return Math.floor((toDays(d) - toDays(dateOfWeek(1))) / 7) + 1;
}

export type SetPieceKind = 'opening' | 'fourth' | 'labor' | 'storm';

/** The week of this year's storm (undefined: no storm this year). */
export function stormWeek(s: GameState, y: number): number | undefined {
  if (y === 1960) return weekOfDate({ y: 1960, m: 9, d: 12 });
  if (roll(`${s.seed}|storm|${y}`) >= 0.3) return undefined;
  let w = weekOfDate({ y, m: 8, d: 25 }) + (Math.floor(roll(`${s.seed}|stormwk|${y}`) * 3) % 3);
  if (w === weekOfDate(laborDay(y))) w++;
  return w;
}

/** The storm's name: 1960's is Donna (as the radio called her); later ones get a name off the list. */
export function stormName(s: GameState, y: number): string {
  if (y === 1960) return 'Donna';
  const names = ['Greta', 'Lorna', 'Vera', 'Ilse', 'Nadine', 'Rosalind', 'Thea', 'Wilma'];
  return names[Math.floor(roll(`${s.seed}|stormname|${y}`) * names.length) % names.length];
}

/** Which set-piece (if any) opens this week. */
export function setPieceThisWeek(s: GameState): SetPieceKind | undefined {
  const y = s.date.y;
  if (s.week > 1 && s.week === weekOfDate(memorialDay(y))) return 'opening';
  if (s.week === weekOfDate({ y, m: 7, d: 4 })) return 'fourth';
  if (s.week === weekOfDate(laborDay(y))) return 'labor';
  if (s.week === stormWeek(s, y)) return 'storm';
  return undefined;
}

function gamble(p: number, label: string, ok: Effect[], bad: Effect[], okText: string, badText: string): Effect {
  return { type: 'deed', op: { op: 'gamble', p: Math.round(p), label, ok, bad, okText, badText } };
}

/** The event source (engine.ts): the set-piece decision on the Monday of its week. */
export function setPieceSource(s: GameState): EventInstance | undefined {
  if (s.gameOver) return undefined;
  const kind = setPieceThisWeek(s);
  if (!kind) return undefined;
  const A = ensureAction(s);
  const key = `${kind}:${s.date.y}`;
  if (A.sp[key] !== undefined) return undefined;
  if (kind === 'storm') {
    // The warning comes Monday (a card and the front page); the landfall is a night this week, on the
    // running clock, and the boss decides what to do when she is at the door (stormView / resolveStorm).
    A.sp[key] = s.week;
    A.stats.setPieces++;
    s.flags.storm_week = s.week;
    s.flags.storm_day = s.date.y === 1960 ? 1 : 1 + (Math.floor(roll(`${s.seed}|stormday|${s.date.y}`) * 3) % 3);
    delete s.flags.storm_landed;
    const name = stormName(s, s.date.y);
    s.cutscenes = [...(s.cutscenes ?? []), { key: 'set_piece', title: `Hurricane ${name}`, text: `The radio has Hurricane ${name} coming up the coast. She comes ashore at the Shore this week, at night, and everything you own on the water is in her way.`, week: s.week }];
    return undefined;
  }
  const ev = build(s, kind);
  if (!ev) return undefined;
  A.sp[key] = s.week;
  A.stats.setPieces++;
  s.cutscenes = [...(s.cutscenes ?? []), { key: 'set_piece', title: ev.title, text: ev.text.split('. ').slice(0, 2).join('. ') + '.', week: s.week }];
  return ev;
}

function base(s: GameState, kind: SetPieceKind, title: string, text: string, def: string, choices: EventInstance['choices'], actors?: string[]): EventInstance {
  return { iid: `ev${s.nextId++}`, defId: `setpiece_${kind}`, title, text, week: s.week, choices, defaultChoiceId: def, mandatory: true, priority: 88, meta: { theme: kind === 'labor' ? 'institution' : 'town' }, ...(actors?.length ? { actors } : {}) };
}

function build(s: GameState, kind: SetPieceKind): EventInstance | undefined {
  const local = (n: number, label: string): Effect => ({ type: 'heat', bar: 'local', amount: n, label });
  const cash = (n: number, label: string): Effect => ({ type: 'money', amount: n, category: 'event', label });
  const resp = (n: number, label: string): Effect => ({ type: 'respect', amount: n, label });
  const gross = Math.max(3000, s.lastReport?.grossIncome ?? 4000);
  switch (kind) {
    case 'opening': {
      const take = Math.round((gross * 0.4) / 100) * 100;
      return base(s, 'opening', 'Opening weekend',
        'Memorial Day. The first crowds come over the bridge from Philadelphia, the rides on the piers turn for the first time since September, and every stand on the boards has its shutters up. It is the first envelope of the season, and everybody on the island is watching to see whose season it is.',
        'quiet', [
          { id: 'party', label: 'Throw the opening night at the club', detail: '−$1,500 · respect +3 · local heat +1. Everybody who matters is there, and sees who paid.', because: 'threw the opening night at the club', effects: [cash(-1500, 'Opening night at the club'), resp(3, 'Opening night: the whole island at your tables'), local(1, 'Opening night')] },
          { id: 'men', label: 'Extra men on the boards: the pickpockets and the competition', detail: `−$600 up front. 70% the crowd's money stays yours (+${fmt(take)}); if not, a brawl in front of the cops (local heat +4).`, because: 'put extra men on the boards for the opening', effects: [cash(-600, 'Extra men on the boards'), gamble(70, 'Opening weekend', [cash(take, 'Opening weekend: the crowd\'s money stayed yours')], [local(4, 'A brawl on the boards in front of the cops')], 'Opening weekend: your men worked the boards and nobody else did. The money stayed home.', 'Opening weekend: your men and a crew from Philadelphia went at it in front of the Casino Pier. The cops wrote it all down.')] },
          { id: 'quiet', label: 'Let the season open itself', detail: 'Nothing spent. The season starts the way it starts.', because: 'let the season open itself', effects: [] },
        ]);
    }
    case 'fourth': {
      const take = Math.round((gross * 0.5) / 100) * 100;
      return base(s, 'fourth', 'The Fourth of July',
        'The biggest crowd of the summer: a hundred thousand people on the beach for the fireworks off the Marine Pier, every motel full, the games running till three. The take this week will be half again as big, and the cops are on overtime on the boardwalk.',
        'family', [
          { id: 'barge', label: 'Pay for the fireworks barge', detail: '−$2,500 · respect +4 · local heat −2. Your name is nowhere on it. Everybody knows.', because: 'paid for the fireworks barge', effects: [cash(-2500, 'The fireworks barge'), resp(4, 'The fireworks were yours, and everybody knew'), local(-2, 'The cops enjoyed the fireworks too')] },
          { id: 'games', label: 'Run the games all night while the cops watch the sky', detail: `65% it pays (+${fmt(take)}); if not, a sergeant who does not watch fireworks (local heat +6, respect −1).`, because: 'ran the games all night on the Fourth', effects: [gamble(65, 'The Fourth of July', [cash(take, 'The Fourth: the games ran all night')], [local(6, 'The Fourth: a sergeant who does not watch fireworks'), resp(-1, 'Games shut down on the Fourth')], 'The games ran all night on the Fourth and nobody looked down from the sky.', 'A sergeant from the county who does not care for fireworks walked the boards at midnight. Three games shut, names taken.')] },
          { id: 'family', label: 'Spend it on the beach with the family', detail: 'Your house +3. The crew runs the night without you (−$500 that walks off).', because: 'spent the Fourth with the family', effects: [{ type: 'familyOpinion', amount: 3, reason: 'He spent the Fourth with us', label: 'The Fourth with the family' } as Effect, cash(-500, 'The crew ran the Fourth without you')] },
        ]);
    }
    case 'labor': {
      const philly = s.rivals.find((r) => r.id === 'philly');
      const bonus = Math.max(2000, Math.min(15000, Math.round((Math.max(0, s.money) * 0.05) / 500) * 500));
      const k = capos(s).filter((c) => isFree(s, c)).sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId))[0];
      const back = Math.round(Math.max(1500, Math.min(6000, gross * 0.3)) / 100) * 100;
      const wet = Math.max(20, Math.min(75, 35 + Math.round(s.respect / 4)));
      const choices: EventInstance['choices'] = [
        { id: 'bonus', label: `Send Philadelphia a season bonus (${fmt(bonus)})`, detail: 'Family heat −10 · Philadelphia remembers who sends a bonus.', because: 'sent Philadelphia a season bonus', effects: [{ type: 'money', amount: -bonus, category: 'tribute', label: 'The season bonus to Philadelphia' }, { type: 'heat', bar: 'family', amount: -10, label: 'Philadelphia liked the bonus' }, ...(philly ? [{ type: 'opinion', from: philly.leaderId, to: s.playerId, amount: 6, reason: 'Sent a season bonus', decay: 1 } as Effect] : [])] },
        ...(k ? [{ id: 'count', label: `Count it twice: lean on ${k.firstName}, who came up short`, detail: `60% he pays it back (+${fmt(back)}, ${k.firstName} −8). If you are wrong: ${k.firstName} −15, respect −1.`, because: `counted the season twice and leaned on ${k.firstName}`, effects: [gamble(60, 'The season\'s count', [cash(back, `${k.firstName} paid back what he held out`), { type: 'opinion', from: k.id, to: s.playerId, amount: -8, reason: 'Made me pay back the summer', label: 'The count' }], [{ type: 'opinion', from: k.id, to: s.playerId, amount: -15, reason: 'Called me a thief over a short summer', label: 'The count' }, resp(-1, 'Accused a capo for nothing')], `The ledger came out. ${displayName(k)} found the money he "forgot".`, `The ledger came out, and ${displayName(k)} was square. He will remember you counted him twice.`)] }] as EventInstance['choices'] : []),
        { id: 'wet', label: 'Tell Philadelphia it was a wet summer', detail: `${wet}% they believe it. If not: family heat +12, respect −2.`, because: 'told Philadelphia it was a wet summer', effects: [gamble(wet, 'The season\'s count', [], [{ type: 'heat', bar: 'family', amount: 12, label: 'Philadelphia read the weather reports' }, resp(-2, 'Caught crying poor to Philadelphia')], 'Philadelphia grumbled about the rain and let it go.', 'Philadelphia had somebody read the weather reports. It was a dry summer.')] },
      ];
      return base(s, 'labor', 'Labor Day: the count',
        'The last bus to Philadelphia leaves full and the shutters come down on the boards. The season is over; now it gets counted. Philadelphia expects its bonus, the ledger is on the table, and the numbers from one of your crews do not add up.',
        'bonus', choices, k ? [k.id] : undefined);
    }
    case 'storm': return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* The world's side (the turn; the storm on the clock)                 */
/* ------------------------------------------------------------------ */

/** At the week's turn (engine.ts): the Fourth's crowd; a storm the clock never reached comes ashore now. */
export function setPiecesWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const y = s.date.y;
  if (s.week === weekOfDate({ y, m: 7, d: 4 }) && ctx.gross > 0) {
    money(ctx, Math.round(ctx.gross * 0.5), 'The Fourth of July: the biggest crowd of the summer', 'business');
    heat(ctx, 'local', 5, 'The Fourth: cops on overtime on the boardwalk', 'heat');
  }
  // The week was skipped: she came ashore anyway, and his people did what they could.
  if (s.flags.storm_week === s.week && !s.flags.storm_landed) stormAshore(ctx, 'ride', rollStorm(s, 'ride'));
}

export type StormOptId = 'board' | 'neighbors' | 'open' | 'cover' | 'ride';
interface StormOpt { id: StormOptId; label: string; hint: string; odds: number; cost: Effect[]; ok: Effect[]; bad: Effect[]; blocked?: string }

/** Tonight is the storm's night (the clock has reached it, and she has not come ashore yet). */
export function stormTonight(s: GameState): boolean {
  return !s.gameOver && s.flags.storm_week === s.week && !s.flags.storm_landed && today(s) === s.flags.storm_day;
}

function stormOpts(s: GameState): StormOpt[] {
  const name = stormName(s, s.date.y);
  const places = s.businesses.filter((b) => b.owner === 'player' && (b.districtId === 'boardwalk' || b.districtId === 'piers')).length;
  const board = 1000 + 300 * places;
  const gross = Math.max(3000, s.lastReport?.grossIncome ?? 4000);
  const last = Math.round((gross * 0.35) / 100) * 100;
  const rival = s.rivals.filter((r) => r.kind === 'mob' && !r.war).sort((a, b) => opinion(s, a.leaderId, s.playerId) - opinion(s, b.leaderId, s.playerId))[0];
  const cash = (n: number, label: string): Effect => ({ type: 'money', amount: n, category: 'event', label });
  const out: StormOpt[] = [
    { id: 'board', label: 'Board up everything, move the boats up the creek', hint: `−${fmt(board)} · crew +1`, odds: 0.75, cost: [cash(-board, `Plywood and men before Hurricane ${name}`), { type: 'crewOpinion', amount: 1, reason: 'The boss looked after the places', label: 'Boarded up' }], ok: [], bad: [], blocked: s.money < board ? `Needs ${fmt(board)}` : undefined },
    { id: 'neighbors', label: 'Board up yours, then send the men to help the neighbors', hint: `−${fmt(board + 1000)} · respect +4 · local heat −3`, odds: 0.7, cost: [cash(-(board + 1000), `Plywood for the whole block before Hurricane ${name}`), { type: 'respect', amount: 4, label: 'Your men boarded up the whole block' }, { type: 'heat', bar: 'local', amount: -3, label: 'Even the cops said thank you' }], ok: [], bad: [], blocked: s.money < board + 1000 ? `Needs ${fmt(board + 1000)}` : undefined },
    { id: 'open', label: 'Keep the stands open to the last minute', hint: `if she turns: +${fmt(last)}; if not, she finds you open (worse damage, respect −1)`, odds: 0.45, cost: [], ok: [cash(last, 'The last weekend before the storm')], bad: [{ type: 'respect', amount: -1, label: 'Caught open by the storm' }] },
  ];
  if (rival) out.push({ id: 'cover', label: `Storm cover: move on ${rival.shortName} while the cops are on the causeway`, hint: `if it works: ${rival.shortName} muscle −8, respect +2; if not: local heat +5, respect −1 (your places take the storm as they are)`, odds: 0.6, cost: [], ok: [{ type: 'rivalResource', rival: rival.id as RivalId, muscle: -8, label: 'Storm cover' }, { type: 'respect', amount: 2, label: `Hit ${rival.shortName} in the storm` }], bad: [{ type: 'heat', bar: 'local', amount: 5, label: 'Caught out in the storm with guns in the car' }, { type: 'respect', amount: -1, label: 'Storm cover went wrong' }] });
  out.push({ id: 'ride', label: 'Let her come', hint: 'free · the island has seen storms before', odds: 0.35, cost: [], ok: [], bad: [] });
  return out;
}

/** The landfall card (the same shape as a strike's: threats.ts StrikeView). */
export function stormView(s: GameState): MomentView | undefined {
  if (!stormTonight(s)) return undefined;
  const name = stormName(s, s.date.y);
  return {
    id: 'storm', title: `Hurricane ${name} is at the door`, warned: true, when: 'Tonight',
    text: `The wind is up over forty and the bay is in the streets on the west side. The radio says ${name} comes ashore before morning. Your capos are on the phone: what do we do with the places on the boards?`,
    options: stormOpts(s).map((o) => ({ id: o.id, label: o.label, hint: o.hint, odds: o.odds, ...(o.blocked ? { blocked: o.blocked } : {}) })),
    def: 'ride',
  };
}

/** The roll for a storm answer, hashed (the same save, the same storm). */
function rollStorm(s: GameState, opt: StormOptId): number {
  return roll(`${s.seed}|${s.week}|storm|${opt}`);
}

/** The storm comes ashore: places shut, the repair bill; the answer's own stakes. Returns the result line. */
function stormAshore(ctx: Ctx, optId: StormOptId, r: number): { line: string; ok: boolean; odds: number } {
  const s = ctx.s;
  s.flags.storm_landed = 1;
  const name = stormName(s, s.date.y);
  const opt = stormOpts(s).find((o) => o.id === optId && !o.blocked) ?? stormOpts(s).find((o) => o.id === 'ride')!;
  if (opt.cost.length) applyEffects(ctx, opt.cost, { label: opt.label, because: opt.label.toLowerCase(), category: 'event' });
  const ok = r < opt.odds;
  if (ok && opt.ok.length) applyEffects(ctx, opt.ok, { label: `Hurricane ${name}`, because: opt.label.toLowerCase(), category: 'event' });
  if (!ok && opt.bad.length) applyEffects(ctx, opt.bad, { label: `Hurricane ${name}`, because: opt.label.toLowerCase(), category: 'event' });
  // The damage: light when the plywood held (or she turned), heavy when she found you open or unready.
  const turned = opt.id === 'open' && ok;
  const prepared = opt.id === 'board' || opt.id === 'neighbors';
  const light = turned || (prepared ? ok : r < 0.35);
  const caughtOpen = opt.id === 'open' && !ok;
  const mine = s.businesses.filter((b) => b.owner === 'player' && (b.districtId === 'boardwalk' || b.districtId === 'piers') && !(b.closedUntil !== undefined && b.closedUntil > s.week));
  const pool = mine.length ? mine : s.businesses.filter((b) => b.owner === 'player' && !(b.closedUntil !== undefined && b.closedUntil > s.week)).slice(0, 1);
  const n = turned ? 0 : Math.min(pool.length, light ? 1 : 2 + (caughtOpen ? 1 : 0));
  const weeks = light ? 1 : 2 + (caughtOpen ? 1 : 0);
  const hit = [...pool].sort((a, b) => roll(`${s.seed}|${s.week}|st|${a.id}`) - roll(`${s.seed}|${s.week}|st|${b.id}`)).slice(0, n);
  for (const b of hit) applyEffects(ctx, [{ type: 'closeBusiness', businessId: b.id, weeks, label: `Hurricane ${name}` }], { label: `Hurricane ${name}`, because: 'the storm came ashore', category: 'event' });
  const repair = hit.length * (light ? 600 : 1500);
  if (repair > 0 && s.money > 0) money(ctx, -Math.min(s.money, repair), `Hurricane ${name}: glass, roofs, a boat on the rocks`, 'event');
  const line = turned
    ? `Hurricane ${name} wobbled out to sea at the last hour. The boards were packed for one more night, and you had the money.`
    : `Hurricane ${name} came ashore in the night. ${hit.length ? `${hit.map((b) => b.name).join(' and ')} ${hit.length > 1 ? 'are' : 'is'} shut ${weeks} week${weeks > 1 ? 's' : ''} while the sand is shoveled out.` : 'The island took it on the chin.'}${prepared && light ? ' The plywood held where it mattered.' : ''}`;
  ctx.log.push(line);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'misc' });
  return { line, ok, odds: opt.odds };
}

/** The boss's answer the night she comes ashore: rolled in the moment (pure). */
export function resolveStorm(input: GameState, optId: StormOptId): { state: GameState; result: NowResult; extra: { h: string; b: string } } | undefined {
  if (!stormTonight(input)) return undefined;
  const s = structuredClone(input) as GameState;
  const ctx = newCtx(s);
  const m0 = s.money;
  const r0 = s.respect;
  const r = rollStorm(s, optId);
  const out = stormAshore(ctx, optId, r);
  const name = stormName(s, s.date.y);
  const label = stormOpts(input).find((o) => o.id === optId)?.label ?? 'Let her come';
  journal(s, { d: today(s), tm: 'the night', c: 'property', t: `Hurricane ${name} comes ashore`, r: [`You chose: ${label}.`, out.line], m: s.money - m0, st: { respect: s.respect - r0 }, src: 'storm', mine: 1 });
  const changes: string[] = [];
  if (s.money !== m0) changes.push(`Money ${s.money > m0 ? '+' : '−'}$${Math.abs(s.money - m0).toLocaleString('en-US')}`);
  if (s.respect !== r0) changes.push(`Respect ${s.respect > r0 ? '+' : '−'}${Math.abs(s.respect - r0)}`);
  return {
    state: s,
    extra: { h: `HURRICANE ${name.toUpperCase()} LASHES THE ISLAND`, b: out.line },
    result: { ok: true, title: `Hurricane ${name}`, chance: out.odds, roll: Math.floor(r * 100), tier: out.ok ? 'success' : 'fail', headline: `${Math.round(out.odds * 100)}% — ${out.ok ? 'it went your way' : 'she found you'}`, line: out.line, changes, leadsTo: ['It is on tomorrow\'s front page.'] },
  };
}

/** The countdown chip: the storm's night this week. */
export function stormClock(s: GameState): { text: string; days: number } | undefined {
  if (s.gameOver || s.flags.storm_week !== s.week || s.flags.storm_landed) return undefined;
  const left = (s.flags.storm_day ?? 1) - today(s);
  if (left < 0) return undefined;
  return { text: `Hurricane ${stormName(s, s.date.y)} · ashore ${left === 0 ? 'tonight' : left === 1 ? 'tomorrow night' : `in ${left} days`}`, days: left };
}
