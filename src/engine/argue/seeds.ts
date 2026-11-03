import { hasTrait } from '../characters';
import { sceneNext } from '../authored/run';
import { SCENES_BY_ID } from '../authored/library';
import { setTie } from '../deeds/state';
import { addStory } from '../hierarchy';
import type { Ctx } from '../ledger';
import { startRumor } from '../minds/beliefs';
import { remember } from '../minds/memory';
import { ensureMinds, mindOf } from '../minds/state';
import { pw, type Grievance } from '../powerState';
import { addOpinion } from '../relations';
import type { Character, GameState, RivalId } from '../types';
import { g01 } from './state';
import {
  MAX_DEPTH, SEED_CAP, SEED_GAP, SEEDS_PER_ARG, type ArgEnd, type ArgKind, type Argument, type ArgueState, type Seed, type SeedKind,
} from './types';

/**
 * STORY SEEDS. What an argument may grow into, planted when it ends and
 * grown weeks later INTO THE SYSTEMS THAT ALREADY RUN STORIES: the grievance
 * ladder (faction-building, open disagreement, a walkout, a coup), the capos'
 * plots, the minds' rumors, the deeds' ties, a rival's courtship, a shark's
 * debt, and the authored scenes' follow-ups (scenes/argue.json). Seeds are
 * kept apart from the stories they start, deduplicated (one of a kind about
 * the same people at a time), and capped.
 */

/** Everything this kind of argument could lead to (before it ends). */
export const POTENTIAL: Record<ArgKind, SeedKind[]> = {
  insult: ['allies', 'rumor', 'plotDeep', 'mend'],
  refuse: ['shark', 'skim', 'rumor', 'mend'],
  passover: ['allies', 'feud', 'courted', 'plotDeep', 'mend'],
  accuse: ['wounded', 'ratTalk', 'mend'],
  affair: ['vendetta', 'scandal', 'mend'],
  decline: ['courted', 'allies', 'mend'],
};

/** By how it ended, the seeds in order of fit. */
const BY_END: Record<ArgEnd, Record<ArgKind, SeedKind[]>> = {
  reconciled: { insult: ['mend'], refuse: ['mend'], passover: ['mend'], accuse: ['mend'], affair: ['mend', 'scandal'], decline: ['mend'] },
  truce: { insult: ['allies', 'rumor'], refuse: ['skim', 'shark'], passover: ['feud', 'allies'], accuse: ['wounded', 'ratTalk'], affair: ['scandal', 'vendetta'], decline: ['courted'] },
  walkout: { insult: ['allies', 'rumor'], refuse: ['shark', 'rumor'], passover: ['allies', 'courted', 'feud'], accuse: ['wounded', 'ratTalk'], affair: ['vendetta', 'scandal'], decline: ['courted', 'allies'] },
  split: { insult: ['allies', 'rumor'], refuse: ['shark', 'rumor'], passover: ['allies', 'feud', 'courted'], accuse: ['ratTalk', 'wounded'], affair: ['vendetta', 'scandal'], decline: ['allies', 'courted'] },
  plot: { insult: ['plotDeep', 'rumor'], refuse: ['skim', 'plotDeep'], passover: ['plotDeep', 'feud'], accuse: ['ratTalk', 'plotDeep'], affair: ['scandal'], decline: ['plotDeep', 'courted'] },
};

const DUE: Record<SeedKind, [number, number]> = {
  allies: [2, 5], plotDeep: [3, 6], rumor: [1, 2], mend: [1, 2], shark: [2, 4], skim: [2, 4], feud: [1, 3], courted: [3, 6],
  wounded: [2, 4], ratTalk: [1, 3], vendetta: [2, 4], scandal: [1, 3],
};

/** The authored follow-up each seed opens (when the scene exists and the chain is not too deep). */
export const SEED_SCENE: Partial<Record<SeedKind, string>> = {
  mend: 'argue_mend', shark: 'argue_shark', wounded: 'argue_vindicate', vendetta: 'argue_affair_kin', scandal: 'argue_scandal', allies: 'argue_allies',
};

function mobRival(s: GameState, G: ArgueState): RivalId | undefined {
  const r = s.rivals.filter((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
  return r.length ? r[Math.floor(g01(G) * r.length)].id : undefined;
}

/** Can this seed take root with these people? */
function fits(s: GameState, k: SeedKind, A: Argument, c: Character): boolean {
  const mine = c.faction === 'player' && c.rank !== 'civilian';
  switch (k) {
    case 'allies': case 'plotDeep': case 'wounded': case 'skim': return mine || (k === 'plotDeep' && c.dynasty);
    case 'courted': return mine && !c.dynasty && !c.courtedBy && s.rivals.some((r) => r.kind === 'mob');
    case 'shark': return !c.debtTo && s.rivals.some((r) => r.kind === 'mob');
    case 'feud': return !!A.about && !!s.characters[A.about]?.alive && A.about !== A.t;
    case 'rumor': case 'ratTalk': return A.room.length > 0;
    case 'mend': return A.end === 'reconciled' || A.hurt <= 60 || hasTrait(c, 'Loyal-to-a-fault');
    case 'vendetta': case 'scandal': return A.k === 'affair';
  }
  return false;
}

/** The kinds this argument could still lead to, for the window and the tests (at least two distinct). */
export function potentialSeeds(s: GameState, A: Argument): SeedKind[] {
  const c = s.characters[A.t];
  if (!c) return [];
  return POTENTIAL[A.k].filter((k) => k === 'mend' || k === 'plotDeep' || fits(s, k, { ...A, end: A.end ?? 'walkout', hurt: Math.min(A.hurt, 60) }, c));
}

function keyOf(k: SeedKind, who: string, about?: string): string {
  return `${k}:${who}:${about ?? ''}`;
}

/** Plant one seed (unless one like it is open or grew lately). */
export function plantSeed(s: GameState, G: ArgueState, k: SeedKind, A: Pick<Argument, 'id' | 't' | 'about' | 'depth'>): Seed | undefined {
  const key = keyOf(k, A.t, A.about);
  if (G.seeds.some((x) => x.key === key && (x.done === undefined || s.week - x.done < SEED_GAP))) return undefined;
  const [lo, hi] = DUE[k];
  const sd: Seed = { id: `sd${G.n++}`, k, who: A.t, ...(A.about ? { about: A.about } : {}), w: s.week, due: s.week + lo + Math.floor(g01(G) * (hi - lo + 1)), from: A.id, key, depth: A.depth + 1 };
  G.seeds.push(sd);
  G.stats.seeds++;
  if (G.seeds.length > SEED_CAP) {
    // Old grown seeds go first, then the oldest.
    const i = G.seeds.findIndex((x) => x.done !== undefined);
    G.seeds.splice(i >= 0 ? i : 0, 1);
  }
  return sd;
}

/** Plant the seeds an ended argument leaves (up to SEEDS_PER_ARG). */
export function plantSeeds(s: GameState, G: ArgueState, A: Argument): Seed[] {
  const c = s.characters[A.t];
  if (!c?.alive || !A.end) return [];
  const out: Seed[] = [];
  for (const k of BY_END[A.end][A.k]) {
    if (out.length >= SEEDS_PER_ARG) break;
    if (!fits(s, k, A, c)) continue;
    const sd = plantSeed(s, G, k, A);
    if (sd) out.push(sd);
  }
  A.seeds = out.map((x) => x.id);
  return out;
}

/* ------------------------------------------------------------------ */
/* Growing a seed into the systems that run stories                    */
/* ------------------------------------------------------------------ */

const ORIGIN: Record<ArgKind, string> = {
  insult: 'being shamed in front of the men', refuse: 'being turned away when he needed help', passover: 'being passed over for a kid',
  accuse: 'being called a rat', affair: 'the boss coming into his marriage', decline: 'having his idea thrown back at him',
};

/** A grievance on the passed-over ladder (grievances.ts): it climbs at his own pace from there. */
function grievance(s: GameState, c: Character, k: ArgKind, sd: Seed, stage: number, severity: number): string {
  const P = pw(s);
  const post = `argue:${sd.from}`;
  const open = P.grievances.find((g) => g.charId === c.id && g.status === 'open' && g.post.startsWith('argue:'));
  if (open) {
    open.severity = Math.min(100, open.severity + Math.round(severity / 3));
    open.stage = Math.max(open.stage, stage);
    return 'An old grievance got worse';
  }
  const g: Grievance = {
    id: `g${s.nextId++}`, charId: c.id, post, postLabel: ORIGIN[k], ...(sd.about ? { winnerId: sd.about } : {}), byId: s.playerId, severity,
    witnesses: 3, week: s.week, stage, status: 'open', reasons: [{ label: ORIGIN[k].replace(/^being /, 'Being '), value: -Math.round(severity / 3) }], public: true,
    next: s.week + 4,
  };
  P.grievances.push(g);
  P.stats.grievances++;
  return stage >= 2 ? 'Started meeting with friends about it' : 'Nursing a grievance';
}

function scene(s: GameState, sd: Seed, cast: Record<string, string>): boolean {
  const id = SEED_SCENE[sd.k];
  if (!id || !SCENES_BY_ID[id] || sd.depth > MAX_DEPTH) return false;
  sceneNext(s, id, [0, 1], cast, 'argue');
  return true;
}

/** One seed grows (or withers when its people are gone). Returns the note, or undefined. */
export function growSeed(ctx: Ctx, G: ArgueState, sd: Seed): string | undefined {
  const s = ctx.s;
  const c = s.characters[sd.who];
  sd.done = s.week;
  if (!c?.alive) { sd.note = 'Gone before it came to anything'; return undefined; }
  const origin = G.hist.find((h) => h.id === sd.from);
  const k: ArgKind = origin?.k ?? 'insult';
  const m = mindOf(s, c.id);
  let note: string | undefined;
  switch (sd.k) {
    case 'allies':
      note = grievance(s, c, k, sd, 1, 45 + Math.round(g01(G) * 20));
      scene(s, sd, { man: c.id });
      break;
    case 'plotDeep': {
      const b = s.capos?.books[c.id];
      if (b && !b.plot && c.rank === 'capo') {
        b.plot = { k: 'coup', st: 0, w: s.week, sw: s.week };
        s.capos!.stats.plots++;
        note = 'Started something quiet';
      } else note = grievance(s, c, k, sd, 2, 55);
      if (m) { remember(m, { w: s.week, k: 'betrayal', who: s.playerId, t: 'smiled at the boss and meant none of it', v: -14 }); m.mood = 'scheming'; }
      break;
    }
    case 'rumor': {
      const M = ensureMinds(s);
      const teller = [...(origin?.room ?? []), c.id].map((id) => M.minds[id]).find((x) => !!x);
      if (teller) {
        const bossWeak = origin?.end === 'walkout' || origin?.end === 'split';
        startRumor(s, M, teller, { k: 'weak', by: bossWeak ? s.playerId : c.id, tr: false });
        note = bossWeak ? 'The story says the boss cannot keep his men in line' : `The story says ${c.firstName} folded`;
      }
      break;
    }
    case 'mend':
      if (!scene(s, sd, { man: c.id })) addOpinion(s, c.id, s.playerId, 'Came back to make peace', 4, 1);
      note = 'He is coming back to make peace';
      break;
    case 'shark': {
      const rival = mobRival(s, G);
      if (rival && !c.debtTo) c.debtTo = { rival, amount: 400 + Math.round(g01(G) * 6) * 100, week: s.week };
      scene(s, sd, { man: c.id });
      note = 'Went to a shark for the money';
      break;
    }
    case 'skim': {
      const amt = 300 + Math.round(g01(G) * 4) * 100;
      c.skimmed = (c.skimmed ?? 0) + amt;
      c.wealth += amt;
      if (m) remember(m, { w: s.week, k: 'debt', who: s.playerId, t: 'took what the boss would not give', v: -6 });
      note = 'Took what he thinks he is owed';
      break;
    }
    case 'feud': {
      const o = sd.about ? s.characters[sd.about] : undefined;
      if (o?.alive) {
        setTie(s, c.id, o.id, 'feud', 'Got what was mine');
        addOpinion(s, c.id, o.id, 'Took what was mine', -15, 1);
        addOpinion(s, o.id, c.id, 'Will not let it go', -8, 1);
        note = `Bad blood with ${o.firstName}`;
      }
      break;
    }
    case 'courted': {
      const rival = mobRival(s, G);
      if (rival && !c.courtedBy && !c.dynasty) { c.courtedBy = { rival, week: s.week }; note = 'Another family heard he is unhappy'; }
      break;
    }
    case 'wounded':
      note = grievance(s, c, k, sd, 1, 40);
      scene(s, sd, { man: c.id });
      break;
    case 'ratTalk': {
      const M = ensureMinds(s);
      const teller = (origin?.room ?? []).map((id) => M.minds[id]).find((x) => !!x);
      if (teller) {
        startRumor(s, M, teller, { k: 'rat', by: c.id, tr: !!c.informantFor && c.informantFor !== 'player' });
        note = `The crew is whispering about ${c.firstName}`;
      }
      break;
    }
    case 'vendetta':
      if (sd.about && s.characters[sd.about]?.alive) scene(s, sd, { man: c.id, wronged: sd.about });
      note = 'The other side of the family wants it settled';
      break;
    case 'scandal':
      if (sd.about && s.characters[sd.about]?.alive) scene(s, sd, { man: c.id, wronged: sd.about });
      note = 'The family is being talked about';
      break;
  }
  sd.note = note ?? 'It came to nothing';
  if (note) {
    addStory(s, c, note + '.');
    G.stats.grown++;
  }
  return note;
}

/** The week's seeds grow. */
export function growSeeds(ctx: Ctx, G: ArgueState): string[] {
  const out: string[] = [];
  for (const sd of G.seeds) {
    if (sd.done !== undefined || sd.due > ctx.s.week) continue;
    const n = growSeed(ctx, G, sd);
    if (n) out.push(`${ctx.s.characters[sd.who]?.firstName ?? 'Someone'}: ${n}.`);
  }
  // Grown seeds are forgotten after a while (the dedupe window).
  G.seeds = G.seeds.filter((x) => x.done === undefined || ctx.s.week - x.done < SEED_GAP);
  return out;
}
