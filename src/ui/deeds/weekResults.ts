import type { NowResult } from '../../engine/deeds/now';
import type { DirtyResult } from '../../engine/dirtyWork';
import { JOBS_BY_ID } from '../../engine/dirtyWork';
import { hashSeed } from '../../engine/rng';
import { PUSH_COST, PUSH_GAIN } from '../../engine/actions';
import { FACTION_NAMES } from '../../engine/world';
import type { FactionId, GameState, PlayerAction } from '../../engine/types';

/**
 * SHOW WHAT HAPPENS WHEN YOU ACT. The orders that roll at the week's turn (a dirty job) or move the map
 * (a push into a district) come back as a result card, not one Results line: the dice (the odds and the
 * roll, the same pattern as a deed settled now), two or three lines of what happened, what changed, what
 * may follow. Everything on the card is also in Your File (the week's journal), so nothing is only here.
 */

type Outcome = DirtyResult['outcome'];

/** Two or three lines of what happened, by the kind of job and how it went. Inspiration only: no real people. */
const SCENE: Record<string, Record<Outcome, string[]>> = {
  scores: {
    clean: ['The truck was where the dispatcher said it would be. Nobody argued with the man holding the clipboard, and by midnight the load was in a garage in Rio Grande.', 'In and out in eleven minutes. The only sound was a dog two yards over, and he lost interest.'],
    messy: ['It went through, but a night watchman got a look at a face before he got a look at the floor. The goods are moved. The description is in a notebook somewhere.', 'The score came off, ugly. Somebody\'s cousin talked in a bar the next night, not much, but enough.'],
    bust: ['Wrong night: the load had gone out on the earlier truck. They sat in the car for an hour and drove home with nothing but the coffee.', 'The lock was new. The plan was not. They walked away before anybody looked twice.'],
    pinched: ['Headlights at both ends of the lot, and a sergeant who already knew the name. The car is in the impound lot; so is everything in it.', 'A patrol car that was not supposed to be on that road was on that road.'],
  },
  muscle: {
    clean: ['He listened. They usually do, after the first one. By the end of it he was saying "yes" before the question.', 'A word, a hand on the shoulder, the other hand where he could see it. The message was received.'],
    messy: ['It got done, louder than it should have. Half the block heard it, and the other half heard about it by morning.', 'The message landed, and so did a chair through a window. People will talk.'],
    bust: ['He wasn\'t there. His wife said he went to his sister\'s in Camden. Maybe he did.', 'They found him with three friends. Nobody wanted it that way tonight. They left.'],
    pinched: ['A beat cop came around the corner at the worst possible second. Now there\'s a report with a name on it.', 'Somebody called it in before it started. The squad car was waiting.'],
  },
  fixes: {
    clean: ['The envelope went across the table and came back empty. Nobody said anything worth remembering, which is the point.', 'He took it the way they all take it: without looking at it, and without looking at you.'],
    messy: ['He took the money, and then he told his brother-in-law he took the money. It will hold. Probably.', 'It is fixed, but a clerk saw the envelope. Clerks remember.'],
    bust: ['He wouldn\'t take it. Not offended, just scared: somebody else is already paying him, or watching him.', 'The price went up between the phone call and the meeting. Nobody paid it.'],
    pinched: ['He took the envelope with one hand and the other was under the table on a button. The man from the D.A.\'s office was in the next booth.', 'A setup. The money is evidence now, and so is the man who carried it.'],
  },
  goods: {
    clean: ['The load came across without a single question at the bridge. By Thursday it was on shelves from Cape May to Ocean City.', 'Two trucks, a farm road, and a barn with the doors open. Clean as a church.'],
    messy: ['It moved, but a state trooper wrote down a plate number on the way. The goods are sold; the plate is a problem for later.', 'One case broke open in the parking lot. Somebody saw what was inside.'],
    bust: ['The buyer never showed. The load sits in a garage, costing money every day it sits.', 'The road was closed for a wreck. They turned back and the load went back in the barn.'],
    pinched: ['A roadblock that was not there last week. The truck, the load and the driver are all in Mays Landing.', 'Federal agents at the warehouse, with paper. Somebody knew the day.'],
  },
};

const TIER: Record<Outcome, NowResult['tier']> = { clean: 'success', messy: 'success', bust: 'fail', pinched: 'critFail' };
const HEAD: Record<Outcome, string> = { clean: 'It went clean.', messy: 'It went through, but somebody saw something.', bust: 'It came up empty.', pinched: 'It went wrong: somebody was picked up.' };

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The jobs settled at this turn (new on the log since `prev`). */
function newJobs(prev: GameState, next: GameState): DirtyResult[] {
  const before = new Set((prev.dirty?.log ?? []).map((x) => JSON.stringify(x)));
  return (next.dirty?.log ?? []).filter((x) => x.week >= prev.week && !before.has(JSON.stringify(x)));
}

export function dirtyCard(next: GameState, r: DirtyResult): NowResult {
  const j = JOBS_BY_ID[r.job];
  const boss = r.who === next.playerId;
  const c = next.characters[r.who];
  const bank = SCENE[j?.tile ?? 'scores']?.[r.outcome] ?? SCENE.scores[r.outcome];
  const line = bank[hashSeed(`${next.seed}|${r.week}|${r.job}|${r.who}`) % bank.length];
  // The rest of the log's line: the money and what followed, without repeating the title.
  const tail = r.text.replace(/^[^:]*:\s*[^.]*\.\s*/, '').trim();
  const changes: string[] = [];
  if (r.take > 0) changes.push(`+${fmt(r.take)}`);
  if (r.outcome === 'messy' || r.outcome === 'pinched') changes.push('Evidence up');
  if (r.outcome === 'pinched' && !boss) changes.push(`${c?.firstName ?? 'He'} held`);
  const leadsTo: string[] = [];
  if (r.rat) leadsTo.push(`${c?.firstName ?? 'He'} talked: the law has more on you.`);
  if (r.outcome === 'messy') leadsTo.push('A witness may come forward.');
  if (r.outcome === 'pinched') leadsTo.push(boss ? 'The arrest is on your file.' : `${c?.firstName ?? 'He'} may need a lawyer, and he will want to know you are paying for it.`);
  return {
    ok: true,
    title: `Dirty work: ${r.label ?? j?.title ?? r.job}`,
    who: boss ? 'You' : c ? `${c.firstName} ${c.lastName}` : undefined,
    ...(r.odds !== undefined && r.roll !== undefined ? { chance: r.odds, roll: r.roll } : {}),
    tier: TIER[r.outcome],
    headline: HEAD[r.outcome],
    line: `${line}${tail ? ` ${tail}` : ''}`,
    changes,
    leadsTo,
    when: 'at the week\'s turn',
  };
}

const PUSH_LINES = [
  'Men on the corners by Tuesday, envelopes for the bartenders by Thursday. By Saturday the jukebox route asks who to pay now.',
  'Two new faces at every bar on the strip, buying rounds and remembering names. The neighbourhood noticed. So did the people who used to own it.',
  'Your people walked the blocks all week, shaking hands, paying for coffee, standing where the other side used to stand.',
];

function pushCards(prev: GameState, next: GameState, orders: readonly PlayerAction[]): NowResult[] {
  const out: NowResult[] = [];
  for (const a of orders) {
    if (a.kind !== 'pushDistrict') continue;
    const d0 = prev.districts.find((x) => x.id === a.district);
    const d1 = next.districts.find((x) => x.id === a.district);
    if (!d0 || !d1) continue;
    const b = Math.round(d0.influence.player ?? 0);
    const n = Math.round(d1.influence.player ?? 0);
    // Who held it, and whether they noticed.
    const owner = (Object.keys(d0.influence) as FactionId[]).filter((f) => f !== 'player' && f !== 'none' && (d0.influence[f] ?? 0) > 0).sort((x, y) => (d0.influence[y] ?? 0) - (d0.influence[x] ?? 0))[0];
    // The push takes ground from them when the open ground runs out (actions.ts pushDistrict): they take it badly.
    const sore = !!owner && (d0.influence.none ?? 0) < PUSH_GAIN && prev.rivals.some((r) => r.id === owner);
    const line = PUSH_LINES[hashSeed(`${next.seed}|${prev.week}|${a.district}`) % PUSH_LINES.length];
    out.push({
      ok: true,
      title: `Push into ${d1.name}`,
      tier: n > b ? 'success' : 'fail',
      headline: n > b ? `${d1.name}: you hold ${n}%, up from ${b}%.` : `${d1.name}: no ground gained (${n}%).`,
      line: `${line}${sore && owner ? ` ${FACTION_NAMES[owner]} noticed.` : ''}`,
      changes: [`${d1.name} ${b}% → ${n}%`, `−${fmt(PUSH_COST)}`, 'Local heat +2'],
      leadsTo: sore && owner ? [`${FACTION_NAMES[owner]} may hit back in the coming weeks.`] : [],
      when: 'at the week\'s turn',
    });
  }
  return out;
}

/** The result cards for one week's turn: the dirty jobs, then the pushes. */
export function weekResultCards(prev: GameState, next: GameState, orders: readonly PlayerAction[]): NowResult[] {
  try {
    return [...newJobs(prev, next).map((r) => dirtyCard(next, r)), ...pushCards(prev, next, orders)];
  } catch {
    return [];
  }
}
