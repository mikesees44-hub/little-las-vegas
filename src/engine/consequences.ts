import { buildPhillyComes } from './table';
import { displayName, makeCharacter } from './characters';
import { buildNarcoticsReckoning } from './events';
import { frontManClean } from './goals';
import { applyEffects, shiftInfluence } from './effects';
import type { Ctx } from './ledger';
import { addOpinion } from './relations';
import { chance, randInt } from './rng';
import { executeMove } from './rivals';
import { activeTask } from './council';
import { factionPower } from './crewlife';
import { FACTION_NAMES } from './world';
import type { Effect, RivalId, ScheduledConsequence } from './types';
import { CREW_HANDLERS } from './crewConsequences';
import { VARIANT_HANDLERS } from './crewVariants';
import { addStory, bumpStat, giveBio, tidyRegimes } from './hierarchy';
import { defectTo } from './regimes';
import { maybePlant } from './rivalcrew';
import { deposeInsteadOfKill } from './power';
import { packConsequence } from './storyPack';

/**
 * Delayed consequences. A choice schedules a key + params; when the week
 * comes due the handler below runs. Every ledger line it posts is labelled
 * "Because you <did X> (week N): ..." and a chronicle entry is written, so the
 * player always sees cause → effect.
 */

type Handler = (ctx: Ctx, sc: ScheduledConsequence) => { text: string; effects?: Effect[] } | undefined;

const HANDLERS: Record<string, Handler> = {
  ...CREW_HANDLERS,
  ...VARIANT_HANDLERS,
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
  narcotics_found_out: (ctx) => {
    const pipe = ctx.s.businesses.find((b) => b.owner === 'player' && b.kind === 'narcotics');
    if (pipe) ctx.s.eventQueue.push(buildNarcoticsReckoning(ctx.s, pipe.id));
    return {
      text: 'word reached Angelo Bruno that you touched junk',
      effects: [
        { type: 'heat', bar: 'family', amount: 18 },
        { type: 'respect', amount: -4 },
        { type: 'rivalOpinion', rival: 'philly', amount: -25, reason: 'Broke Bruno\'s rule on narcotics' },
      ],
    };
  },
  narcotics_rumor: (ctx) => (ctx.s.businesses.some((b) => b.owner === 'player' && b.kind === 'narcotics')
    ? { text: 'a dock foreman bragged in a Camden bar about your pipeline', effects: [{ type: 'heat', bar: 'family', amount: 5 }, { type: 'heat', bar: 'federal', amount: 3 }] }
    : undefined),
  philly_message: (ctx) => {
    const s = ctx.s;
    if (!s.businesses.some((b) => b.owner === 'player' && b.kind === 'narcotics')) return undefined;
    const pool = s.businesses.filter((b) => b.owner === 'player' && b.kind === 'narcotics').flatMap((b) => b.staffIds ?? []).map((id) => s.characters[id]).filter((c) => c?.alive && c.id !== s.playerId);
    const victim = pool[0];
    if (!victim) return { text: 'Philadelphia burned your pipeline\'s warehouse to the waterline', effects: [{ type: 'respect', amount: -5 }, { type: 'heat', bar: 'local', amount: 6 }] };
    return {
      text: `Philadelphia sent a message: ${victim.firstName} ${victim.lastName}, who ran your pipeline, was found in a car trunk in Camden`,
      effects: [{ type: 'kill', charId: victim.id, cause: 'found in a car trunk in Camden (Philadelphia\'s message about narcotics)', killer: 'philly' }, { type: 'respect', amount: -4 }],
    };
  },
  coup: (ctx, sc) => {
    const s = ctx.s;
    const f = s.factions.find((x) => x.id === String(sc.params.faction));
    if (!f) return undefined;
    const power = factionPower(s, f);
    const leader = s.characters[f.leaderId];
    // A plot against the old boss is moot if its leader has since become the boss.
    if (!leader?.alive || leader.faction !== 'player' || leader.id === s.playerId || power < 0.12) {
      s.factions = s.factions.filter((x) => x !== f);
      return { text: 'the plotters lost their nerve and the faction broke up', effects: [{ type: 'respect', amount: 2 }] };
    }
    s.factions = s.factions.filter((x) => x !== f);
    const boss = s.characters[s.playerId];
    bumpStat(s, 'coups');
    if (chance(s, Math.min(0.6, power)) && !activeTask(s, 'ub_guard')) {
      s.cutscenes.push({ key: 'betrayal_confrontation', title: 'Betrayal', text: `${displayName(leader)} was waiting in the back seat of the Cadillac.`, week: s.week });
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A coup: ${displayName(leader)}'s faction moved against the boss.`, kind: 'succession' });
      // Losing the chair does not always mean dying in it: he may be deposed (power pillar).
      if (deposeInsteadOfKill(ctx, leader.id)) return { text: `${leader.firstName} ${leader.lastName}'s faction took the family from the boss` };
      return { text: `${leader.firstName} ${leader.lastName}'s faction moved against the boss`, effects: [{ type: 'kill', charId: boss.id, cause: `murdered by his own capos (${displayName(leader)}'s faction)`, killer: 'none' }] };
    }
    // The coup fails or turns into a walk-out: the leader takes his district to a rival.
    const d = s.districts.find((x) => x.capoId === leader.id);
    const r = s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive)[0];
    for (const id of f.memberIds) {
      const m = s.characters[id];
      if (m?.alive && m.faction === 'player' && m.id !== s.playerId && r) defectTo(ctx, m, r.id, 'coup');
    }
    if (d && r) {
      const lost = -shiftInfluence(s, d.id, 'player', -12);
      shiftInfluence(s, d.id, r.id, lost);
    }
    return { text: `${leader.firstName} ${leader.lastName}'s faction walked out to ${r?.shortName ?? 'nowhere'}${d ? `, taking a piece of ${d.name}` : ''}`, effects: [{ type: 'respect', amount: -6 }] };
  },
  promise_abdicate: () => {
    return { text: 'the capos came back for the boss\'s promise to step aside — and he is still in the chair', effects: [{ type: 'crewOpinion', amount: -10, reason: 'Broke his promise to step aside' }, { type: 'respect', amount: -4 }] };
  },
  table_enforce: (ctx, sc) => {
    const s = ctx.s;
    // The man the ruling named, if he is still around; else a capo.
    const named = sc.params?.charId ? s.characters[String(sc.params.charId)] : undefined;
    const men = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.rank === 'capo' && c.id !== s.playerId);
    const v = named?.alive && named.faction === 'player' && named.id !== s.playerId ? named : men[0];
    if (!v) return { text: 'Philadelphia enforced the ruling: your places in Downtown were burned', effects: [{ type: 'respect', amount: -5 }, { type: 'heat', bar: 'local', amount: 6 }] };
    // They come for him, and the boss decides (handover.ts): nobody is taken on silence.
    s.eventQueue.push(buildPhillyComes(s, v));
    return { text: `Philadelphia sent men to enforce the Table's ruling: they are looking for ${v.firstName} ${v.lastName}`, effects: [{ type: 'respect', amount: -2 }] };
  },
  rat_burned: (ctx, sc) => {
    const c = ctx.s.characters[String(sc.params.charId)];
    if (!c?.alive || c.faction !== 'player') return undefined;
    return { text: `the FBI realised ${c.firstName} ${c.lastName} was feeding them lies, and came back angry`, effects: [{ type: 'heat', bar: 'federal', amount: 12 }] };
  },
  exile_turns: (ctx, sc) => {
    const s = ctx.s;
    const c = s.characters[String(sc.params.charId)];
    if (!c?.alive || c.faction !== 'none') return undefined;
    const r = s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive)[0];
    if (!r) return undefined;
    c.faction = r.id;
    c.rank = 'soldier';
    r.muscle = Math.min(100, r.muscle + 4);
    return { text: `${c.firstName} ${c.lastName} turned up in ${r.shortName}'s crew, telling them everything he knows`, effects: [{ type: 'rivalResource', rival: r.id, muscle: 4 }, { type: 'heat', bar: 'local', amount: 2 }] };
  },
  vice_scandal: (ctx, sc) => (ctx.s.businesses.some((b) => b.owner === 'player' && b.kind === 'blackmail')
    ? { text: `a councilman's name turned up in the books at ${sc.params.biz} — and your camera man was ready`, effects: [{ type: 'heat', bar: 'local', amount: 4 }, { type: 'favor', amount: 1 }] }
    : { text: `the vice squad raided ${sc.params.biz} and the Leader printed the story`, effects: [{ type: 'heat', bar: 'local', amount: 8 }, { type: 'respect', amount: -2 }] }),
  postal_inspectors: (_ctx, sc) => ({ text: `postal inspectors traced a reel shipment back to ${sc.params.biz}`, effects: [{ type: 'heat', bar: 'federal', amount: 7 }] }),
  bank_examiners: (ctx) => (frontManClean(ctx.s)
    ? { text: 'state bank examiners went through the Savings & Loan and found the books in order', effects: [{ type: 'heat', bar: 'federal', amount: -4 }] }
    : { text: 'state bank examiners asked hard questions about your front man', effects: [{ type: 'heat', bar: 'federal', amount: 10 }, { type: 'respect', amount: -2 }] }),
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
      giveBio(s, c);
      maybePlant(s, c);
      addStory(s, c, 'Brought in off the street as an associate.');
      names.push(displayName(c));
    }
    tidyRegimes(s);
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
    const h = HANDLERS[sc.key] ?? (sc.key.startsWith('pack:') ? packConsequence : undefined);
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
