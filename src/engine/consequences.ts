import { displayName, makeCharacter } from './characters';
import { applyEffects, shiftInfluence } from './effects';
import type { Ctx } from './ledger';
import { addOpinion } from './relations';
import { chance, randInt } from './rng';
import { executeMove } from './rivals';
import { FACTION_NAMES } from './world';
import type { Effect, RivalId, ScheduledConsequence } from './types';

/**
 * Delayed consequences. A choice schedules a key + params; when the week
 * comes due the handler below runs. Every ledger line it posts is labelled
 * "Because you <did X> (week N): ..." and a chronicle entry is written, so the
 * player always sees cause → effect.
 */

type Handler = (ctx: Ctx, sc: ScheduledConsequence) => { text: string; effects?: Effect[] } | undefined;

const HANDLERS: Record<string, Handler> = {
  shakedown_complaint: () => ({ text: 'a bar owner complained to the Herald', effects: [{ type: 'heat', bar: 'local', amount: 5 }] }),
  cops_flip: () => ({ text: 'a patrolman talked to a reporter about the Chief\'s envelope', effects: [{ type: 'heat', bar: 'local', amount: 9 }, { type: 'respect', amount: -1 }] }),
  parish_blessing: () => ({ text: 'Father Callahan praised you at the Feast of the Assumption', effects: [{ type: 'respect', amount: 2 }, { type: 'heat', bar: 'local', amount: -3 }] }),
  favor_returned: (ctx, sc) => {
    const who = String(sc.params.who ?? 'a friend');
    return chance(ctx.s, 0.5)
      ? { text: `${who} returned the favor with a tip`, effects: [{ type: 'money', amount: randInt(ctx.s, 6, 15) * 100 }] }
      : { text: `${who} quietly made a problem go away`, effects: [{ type: 'heat', bar: 'local', amount: -6 }] };
  },
  philly_short: (ctx) => ({
    text: 'Philadelphia counted the envelope twice',
    effects: [
      { type: 'heat', bar: 'family', amount: 6 },
      { type: 'rivalOpinion', rival: 'philly', amount: -8, reason: 'Tried to cheat Philadelphia' },
      ...(ctx.s.heat.family > 50 ? [{ type: 'respect', amount: -2 } as Effect] : []),
    ],
  }),
  philly_over: () => ({ text: 'Sal Moretti put in a word for you with Bruno', effects: [{ type: 'respect', amount: 2 }, { type: 'heat', bar: 'family', amount: -3 }] }),
  philly_favor_returned: () => ({ text: 'Philadelphia returned the favor', effects: [{ type: 'heat', bar: 'family', amount: -6 }, { type: 'respect', amount: 2 }] }),
  narcotics_found_out: () => ({
    text: 'word reached Angelo Bruno that you touched junk',
    effects: [
      { type: 'heat', bar: 'family', amount: 18 },
      { type: 'respect', amount: -4 },
      { type: 'rivalOpinion', rival: 'philly', amount: -25, reason: 'Broke Bruno\'s rule on narcotics' },
    ],
  }),
  business_trouble: (ctx) => {
    const biz = ctx.s.businesses.filter((b) => b.owner === 'player');
    const b = biz[biz.length - 1];
    if (!b) return undefined;
    return chance(ctx.s, 0.5)
      ? { text: `${b.name} got a visit from the liquor board`, effects: [{ type: 'heat', bar: 'local', amount: 4 }, { type: 'money', amount: -500 }] }
      : { text: `${b.name} is the talk of the island`, effects: [{ type: 'money', amount: randInt(ctx.s, 5, 12) * 100 }, { type: 'respect', amount: 1 }] };
  },
  example_widow: () => ({ text: 'the dead man\'s family talked to the county detectives', effects: [{ type: 'heat', bar: 'local', amount: 7 }, { type: 'heat', bar: 'federal', amount: 3 }] }),
  manno_foothold: (ctx) => {
    shiftInfluence(ctx.s, 'causeway', 'manno', 5);
    return { text: 'Manno\'s men now run the Causeway diner as their own', effects: [{ type: 'respect', amount: -1 }] };
  },
  recruit_rat: (ctx, sc) => {
    const c = ctx.s.characters[String(sc.params.charId)];
    if (!c?.alive || c.faction !== 'player') return undefined;
    return { text: `${c.firstName} ${c.lastName} was picked up and talked`, effects: [{ type: 'heat', bar: 'federal', amount: 8 }, { type: 'heat', bar: 'local', amount: 4 }] };
  },
  recruit_test: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    if (!c?.alive) return undefined;
    const score = c.attributes.discipline + c.attributes.force / 2 + (c.traits.includes('Cowardly') ? -30 : 0);
    if (score >= 60) {
      return {
        text: `${c.firstName} ${c.lastName} passed the test and is with us now`,
        effects: [
          { type: 'recruit', charId: c.id },
          { type: 'money', amount: 300, label: `${c.firstName}'s first collection` },
          { type: 'opinion', from: c.id, to: s.playerId, amount: 25, reason: 'Gave me my chance', decay: 1 },
        ],
      };
    }
    return { text: `${c.firstName} ${c.lastName} fumbled a simple collection and was sent home`, effects: [{ type: 'respect', amount: -1 }] };
  },
  recruits_arrive: (ctx) => {
    const s = ctx.s;
    const n = randInt(s, 1, 2);
    const names: string[] = [];
    const effects: Effect[] = [];
    for (let i = 0; i < n; i++) {
      const c = makeCharacter(s, { rank: 'associate', faction: 'player', age: randInt(s, 18, 28) });
      addOpinion(s, c.id, s.playerId, 'Gave me my chance', 15, 1);
      names.push(displayName(c));
    }
    return { text: `${names.join(' and ')} joined the crew as associates`, effects };
  },
  retaliation: (ctx, sc) => {
    const s = ctx.s;
    const rid = String(sc.params.rival) as RivalId;
    const r = s.rivals.find((x) => x.id === rid);
    if (!r || !s.characters[r.leaderId]?.alive) return undefined;
    ctx.log.push(`Because you ${sc.because}: ${FACTION_NAMES[rid]} retaliates.`);
    executeMove(ctx, r, { move: 'strike', target: 'player', score: 1 });
    return { text: `${FACTION_NAMES[rid]} retaliated` };
  },
};

export function fireConsequences(ctx: Ctx): void {
  const s = ctx.s;
  const due = s.scheduled.filter((x) => x.dueWeek <= s.week);
  s.scheduled = s.scheduled.filter((x) => x.dueWeek > s.week);
  for (const sc of due) {
    const h = HANDLERS[sc.key];
    if (!h) continue;
    const before = ctx.lines.length;
    const res = h(ctx, sc);
    if (!res) continue;
    const label = `Because you ${sc.because} (wk ${sc.sourceWeek}): ${res.text}`;
    // Relabel any lines posted inside the handler (e.g. a retaliation strike) so the cause is visible.
    for (let i = before; i < ctx.lines.length; i++) ctx.lines[i].label = `${label} — ${ctx.lines[i].label}`;
    if (res.effects?.length) applyEffects(ctx, res.effects, { label, because: sc.because, category: 'consequence' });
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: res.text.charAt(0).toUpperCase() + res.text.slice(1) + '.', because: sc.because, becauseWeek: sc.sourceWeek, kind: 'consequence' });
    ctx.log.push(`${label}.`);
  }
}
