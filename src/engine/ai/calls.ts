import { crew, displayName, isFree, player } from '../characters';
import { applyEffects, fmtMoney } from '../effects';
import { newCtx, reconcile } from '../ledger';
import { journal, type JCat } from '../journal';
import { opinion, getRelation } from '../relations';
import { hashSeed } from '../rng';
import { mensMoney } from '../mensMoney';
import { openPitches } from '../eat';
import { activeGoomars } from '../goomar';
import { cheating, wifeOf } from '../bonds';
import { pactWith } from '../talks';
import { phoneClone } from '../phone';
import { ensurePhone, type WordState } from '../phoneState';
import { clean } from '../minds/talk';
import type { Character, Effect, GameState, ReportLine, RivalId } from '../types';

/**
 * WORD FROM PEOPLE: phone calls and letters in their own voice.
 *
 * Each week the people in the boss's life reach out about what ACTUALLY
 * happened to them (read off the state, never invented): a man of his in the
 * county jail, a man who is broke, a man with a grievance, a man with a score
 * to pitch, the goomar, the wife, a woman with news of a baby, a cop on the
 * pad when the heat is up, a rival boss he has a pact or a war with, his
 * mother, a man on the lam. One to three a week, each with a cooldown.
 *
 * Every reason carries a FACT BRIEF (the only things the caller can speak
 * of) and a small whitelist of replies the boss can choose, each one a list
 * of the game's own effects (money from the Family, an opinion, a meter, a
 * rival's opinion, heat, evidence), bounded. The page may ask Claude to voice
 * the caller's message from the brief (≤ 80 words, the period voice); the
 * validator rejects anything with a name not in the brief, numbers, or past
 * the cap, and then the templated line stands. The boss may also type his own
 * answer: Claude classifies it into one of the whitelisted replies (a
 * validated index) and voices the caller's response; the engine applies
 * exactly that reply's effects. Nothing here needs Claude.
 *
 * People who are away write instead of calling (a letter): from the county
 * jail, from wherever a man on the lam is hiding, from Philadelphia.
 *
 * State: `phone.word` (optional; made on the first answer): the ids answered
 * and the cooldowns. The messages are never saved; an answer leaves one line
 * in Your File.
 */

export type WordKind = 'pinch' | 'lam' | 'broke' | 'grievance' | 'score' | 'goomar' | 'wife' | 'baby' | 'cop' | 'rival' | 'ma';

export interface WordReply {
  id: string;
  label: string;
  /** What it does, in words (the cost and the opinion). */
  hint: string;
  eff: Effect[];
  /** The money it takes from the Family (blocked when the Family has less). */
  cost?: number;
  /** How the caller takes it (the templated answer). */
  tone: 'warm' | 'flat' | 'cold';
}

export interface Word {
  id: string;
  kind: WordKind;
  who: string;
  name: string;
  role: string;
  /** A letter (he is away): where from. */
  from?: string;
  /** The facts the caller may speak of, one per line. */
  brief: string[];
  /** The names the message may use (everything else is out). */
  names: string[];
  replies: WordReply[];
  /** The templated message (the fallback). */
  line: string;
}

export const WORD_MAX_WORDS = 80;
export const ANSWER_MAX_WORDS = 60;
export const WORD_PER_WEEK = 3;

/** Weeks before the same person reaches out about the same thing again (after an answer). */
const COOL: Record<WordKind, number> = { pinch: 3, lam: 3, broke: 4, grievance: 4, score: 3, goomar: 3, wife: 4, baby: 6, cop: 5, rival: 4, ma: 4 };
const CAT: Record<WordKind, JCat> = { pinch: 'crew', lam: 'crew', broke: 'crew', grievance: 'crew', score: 'crew', goomar: 'romance', wife: 'family', baby: 'romance', cop: 'law', rival: 'rivals', ma: 'family' };
export const KIND_LABEL: Record<WordKind, string> = {
  pinch: 'From inside', lam: 'From the lam', broke: 'Money trouble', grievance: 'A grievance', score: 'A score', goomar: 'Your goomar', wife: 'Your wife',
  baby: 'News', cop: 'The pad', rival: 'Another family', ma: 'Ma',
};

const H = (k: string) => hashSeed(k);
const short = (c: Character) => c.firstName;

/** The names a message about these people may use (first, last, nickname). */
function namesOf(cs: (Character | undefined)[]): string[] {
  const out = new Set<string>();
  for (const c of cs) {
    if (!c) continue;
    for (const x of [c.firstName, c.lastName, c.nickname]) if (x) out.add(x);
  }
  return [...out];
}

function op(s: GameState, from: string, amount: number, reason: string): Effect {
  return { type: 'opinion', from, to: s.playerId, amount, reason };
}
function pay(amount: number, label: string): Effect {
  return { type: 'money', amount: -amount, category: 'event', label };
}

const sign = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

/* ------------------------------------------------------------------ */
/* Who reaches out (read off the world)                                */
/* ------------------------------------------------------------------ */

interface Cand { w: Word; pri: number }

function maOf(s: GameState): Character | undefined {
  const b = player(s);
  const m = b.motherId ? s.characters[b.motherId] : undefined;
  return m?.alive ? m : undefined;
}


const LAM_PLACE: Record<string, string> = { vineland: 'a farm near Vineland', florida: 'Florida', montreal: 'Montreal', mexico: 'Mexico', oldcountry: 'the old country' };

/** Every reason anyone has to reach out this week, with a priority. Pure. */
export function wordCandidates(s: GameState): Cand[] {
  const out: Cand[] = [];
  const boss = player(s);
  const bossName = displayName(boss);
  const base = (c: Character) => [`The boss is ${bossName}. It is ${s.date.m}/${s.date.y}, ${s.date.m >= 6 && s.date.m <= 9 ? 'the summer season' : 'the off-season'} on the island.`, `The caller: ${displayName(c)}, ${c.traits.slice(0, 3).join(', ') || 'no notable traits'}; thinks ${sign(opinion(s, c.id, s.playerId))} of the boss (-100..100).`];
  const mine = crew(s);
  // Men of his in the county jail: a letter.
  for (const c of Object.values(s.characters)) {
    if (!c.alive || c.faction !== 'player' || c.id === s.playerId || c.rank === 'civilian' || isFree(s, c)) continue;
    const left = Math.max(1, (c.imprisonedUntil ?? s.week) - s.week);
    const fam = 300;
    out.push({ pri: 5 + (c.rank === 'capo' ? 2 : 0), w: {
      id: `pinch:${c.id}`, kind: 'pinch', who: c.id, name: displayName(c), role: `${c.rank} · in the county jail`, from: 'the county jail',
      brief: [...base(c), `He is in the county jail, ${left} more week${left === 1 ? '' : 's'} to go. He writes to the boss.`, `He worries about his family on the outside and whether the boss remembers him.`],
      names: namesOf([c, boss]),
      replies: [
        { id: 'family', label: 'Take care of his family', hint: `${fmtMoney(fam)} from the Family · he won't forget it`, cost: fam, eff: [pay(fam, `${short(c)}'s family, while he's inside`), op(s, c.id, 8, 'The boss looked after my family while I was inside')], tone: 'warm' },
        { id: 'lawyer', label: 'Send him a lawyer', hint: `${fmtMoney(500)} · a little less the law has on him`, cost: 500, eff: [pay(500, `A lawyer for ${short(c)}`), op(s, c.id, 5, 'The boss sent me a lawyer'), { type: 'evidence', charId: c.id, amount: -3 }], tone: 'warm' },
        { id: 'quiet', label: 'Sit tight and keep quiet', hint: 'free · he gets the message, and a little colder', eff: [{ type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 4 }, op(s, c.id, -2, 'Told me to sit tight, nothing more')], tone: 'flat' },
      ],
      line: '',
    } });
  }
  // A man of his on the lam: a letter from wherever he is.
  for (const f of s.travel?.fugitives ?? []) {
    const c = s.characters[f.personId];
    if (f.end || !c?.alive || c.id === s.playerId || c.faction !== 'player') continue;
    const where = LAM_PLACE[f.dest] ?? 'out of state';
    out.push({ pri: 4, w: {
      id: `lam:${c.id}`, kind: 'lam', who: c.id, name: displayName(c), role: `${c.rank} · on the lam`, from: where,
      brief: [...base(c), `He is on the lam in ${where}, ${s.week - f.since} weeks now. ${f.manhunt >= 50 ? 'The federal men are looking hard.' : 'Nobody has found him yet.'}`, 'He is lonely and short of money and wants to know when he can come home.'],
      names: namesOf([c, boss]),
      replies: [
        { id: 'send', label: 'Send money', hint: `${fmtMoney(400)} from the Family · he holds out`, cost: 400, eff: [pay(400, `Money to ${short(c)} on the lam`), op(s, c.id, 6, 'The boss kept me going on the lam')], tone: 'warm' },
        { id: 'stay', label: 'Stay put, stay quiet', hint: 'free · he waits', eff: [op(s, c.id, -1, 'Told me to stay put')], tone: 'flat' },
      ],
      line: '',
    } });
  }
  // Money trouble.
  const mm = mensMoney(s).rows.filter((r) => r.level === 'broke' && r.c.alive && isFree(s, r.c));
  for (const r of mm.slice(0, 4)) {
    const c = r.c;
    const amt = Math.max(200, Math.min(1000, Math.round((r.owes || 400) / 50) * 50));
    out.push({ pri: 3 + (r.owes > 0 ? 1 : 0), w: {
      id: `broke:${c.id}`, kind: 'broke', who: c.id, name: displayName(c), role: `${c.rank} · broke`,
      brief: [...base(c), `He is broke${r.owes > 0 ? ' and owes money around town' : ''}. His earnings are down.`, 'He is ashamed to ask, but he asks.'],
      names: namesOf([c, boss]),
      replies: [
        { id: 'lend', label: `Give him ${fmtMoney(amt)}`, hint: `${fmtMoney(amt)} from the Family · he remembers who helped`, cost: amt, eff: [pay(amt, `Helped ${short(c)} out`), op(s, c.id, 6, 'The boss helped me when I was broke'), { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: -4 }], tone: 'warm' },
        { id: 'earn', label: 'Tell him to earn it', hint: 'free · he resents it a little', eff: [op(s, c.id, -3, 'Told me to earn it when I was broke'), { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 3 }], tone: 'cold' },
      ],
      line: '',
    } });
  }
  // A grievance.
  for (const c of mine) {
    if (!isFree(s, c)) continue;
    const g = getRelation(s, c.id, s.playerId)?.grievance ?? 0;
    const o = opinion(s, c.id, s.playerId);
    if (g < 35 && o > -20) continue;
    out.push({ pri: 3 + g / 30, w: {
      id: `grievance:${c.id}`, kind: 'grievance', who: c.id, name: displayName(c), role: `${c.rank} · sore at you`,
      brief: [...base(c), `He has a grievance with the boss (${g >= 60 ? 'a deep one' : 'it has been building'}). He feels passed over and not respected.`, 'He calls to get it off his chest, carefully.'],
      names: namesOf([c, boss]),
      replies: [
        { id: 'hear', label: 'Hear him out', hint: 'free · the grievance cools', eff: [{ type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: -10 }, op(s, c.id, 3, 'The boss heard me out')], tone: 'warm' },
        { id: 'pocket', label: 'Put something in his pocket', hint: `${fmtMoney(400)} from the Family · cools it more`, cost: 400, eff: [pay(400, `Something for ${short(c)}`), { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: -8 }, op(s, c.id, 6, 'The boss made it right')], tone: 'warm' },
        { id: 'tone', label: 'Watch your tone', hint: 'free · he fears you more, likes you less', eff: [{ type: 'meter', from: c.id, to: s.playerId, meter: 'fear', amount: 6 }, { type: 'meter', from: c.id, to: s.playerId, meter: 'grievance', amount: 4 }, op(s, c.id, -4, 'Put me in my place on the phone')], tone: 'cold' },
      ],
      line: '',
    } });
  }
  // A score to pitch.
  for (const p of openPitches(s).slice(0, 3)) {
    const c = s.characters[p.by];
    if (!c?.alive || !isFree(s, c)) continue;
    out.push({ pri: 2.5, w: {
      id: `score:${c.id}`, kind: 'score', who: c.id, name: displayName(c), role: `${c.rank} · has something`,
      brief: [...base(c), `He has something to pitch the boss: ${p.what}. He won't say much on the phone.`, 'He wants to come by and lay it out in person (it is on the boss\'s desk to decide).'],
      names: namesOf([c, boss]),
      replies: [
        { id: 'come', label: 'Come by, tell me in person', hint: 'free · it waits on your desk', eff: [op(s, c.id, 2, 'The boss made time for my idea')], tone: 'warm' },
        { id: 'busy', label: 'Not now', hint: 'free · he is let down', eff: [op(s, c.id, -2, 'The boss had no time for my idea')], tone: 'cold' },
      ],
      line: '',
    } });
  }
  // The goomar.
  for (const g of activeGoomars(s)) {
    const c = s.characters[g.id];
    if (!c?.alive) continue;
    out.push({ pri: 2.2, w: {
      id: `goomar:${c.id}`, kind: 'goomar', who: c.id, name: displayName(c), role: 'Your goomar',
      brief: [...base(c), 'She is the boss\'s goomar, kept in an apartment. She misses him and wants to know when he will come by.'],
      names: namesOf([c, boss]),
      replies: [
        { id: 'see', label: 'I\'ll come by this week', hint: 'free · she is happy', eff: [op(s, c.id, 5, 'He said he would come by')], tone: 'warm' },
        { id: 'flowers', label: 'Send her flowers', hint: `${fmtMoney(60)} · she is pleased`, cost: 60, eff: [pay(60, `Flowers for ${short(c)}`), op(s, c.id, 4, 'He sent me flowers')], tone: 'warm' },
        { id: 'busy', label: 'Not this week', hint: 'free · she is hurt', eff: [op(s, c.id, -4, 'He had no time for me')], tone: 'cold' },
      ],
      line: '',
    } });
  }
  // The wife.
  const wife = wifeOf(s);
  if (wife?.alive && (cheating(s) || (s.hours?.late ?? 0) > 0 || (s.hours?.missed ?? 0) > 0)) {
    const why = cheating(s) ? 'She suspects there is another woman; she won\'t say it outright.' : 'He keeps coming home late and missing dinner.';
    out.push({ pri: 3, w: {
      id: `wife:${wife.id}`, kind: 'wife', who: wife.id, name: displayName(wife), role: 'Your wife',
      brief: [...base(wife), `She is the boss's wife. ${why}`, 'She calls to ask where he is and when he is coming home.'],
      names: namesOf([wife, boss]),
      replies: [
        { id: 'sorry', label: 'Tell her you\'re sorry', hint: 'free · she softens', eff: [op(s, wife.id, 4, 'He said he was sorry')], tone: 'warm' },
        { id: 'dinner', label: 'Dinner Saturday, just the two of you', hint: `${fmtMoney(50)} · she softens more`, cost: 50, eff: [pay(50, 'Dinner out with your wife'), op(s, wife.id, 6, 'He took me to dinner')], tone: 'warm' },
        { id: 'snap', label: 'Don\'t question me', hint: 'free · she goes cold', eff: [op(s, wife.id, -6, 'He snapped at me on the phone')], tone: 'cold' },
      ],
      line: '',
    } });
  }
  // News of a baby (she told him; the pregnancy is real, romance.ts keeps it).
  for (const p of s.dating?.preg ?? []) {
    const c = s.characters[p.motherId];
    if (!c?.alive || !p.knownBy.includes(s.playerId) || s.week - p.week > 20 || c.id === wife?.id) continue;
    out.push({ pri: 4.5, w: {
      id: `baby:${c.id}`, kind: 'baby', who: c.id, name: displayName(c), role: 'She has news',
      brief: [...base(c), 'She is expecting the boss\'s child. She is not his wife. She is scared and wants to know where he stands.'],
      names: namesOf([c, boss]),
      replies: [
        { id: 'stand', label: 'I\'ll take care of you both', hint: `${fmtMoney(500)} from the Family · she trusts you`, cost: 500, eff: [pay(500, `For ${short(c)} and the baby`), op(s, c.id, 10, 'He stood by me and the baby')], tone: 'warm' },
        { id: 'quiet', label: 'Keep it quiet; I\'ll send money', hint: `${fmtMoney(300)} · she is hurt but provided for`, cost: 300, eff: [pay(300, `Quiet money for ${short(c)}`), op(s, c.id, -3, 'He wants it kept quiet')], tone: 'flat' },
        { id: 'cold', label: 'That\'s your problem', hint: 'free · she will not forget it', eff: [op(s, c.id, -12, 'He turned his back on me and the baby')], tone: 'cold' },
      ],
      line: '',
    } });
  }
  // A cop on the pad, when the heat is up.
  if (s.heat.local >= 25) {
    for (const [id, h] of Object.entries(s.payroll?.hires ?? {})) {
      const c = s.characters[id];
      if (h.job !== 'cop' || !c?.alive) continue;
      out.push({ pri: 2 + s.heat.local / 30, w: {
        id: `cop:${c.id}`, kind: 'cop', who: c.id, name: displayName(c), role: 'A cop on your pad',
        brief: [...base(c), `He is a police officer on the boss's payroll. The heat on the family is ${s.heat.local >= 50 ? 'high' : 'rising'}; the brass are asking questions.`, 'He wants more to keep looking the other way, and he is nervous.'],
        names: namesOf([c, boss]),
        replies: [
          { id: 'extra', label: 'An extra envelope', hint: `${fmtMoney(300)} · local heat −3`, cost: 300, eff: [pay(300, `Extra envelope for ${short(c)}`), { type: 'heat', bar: 'local', amount: -3, label: `${short(c)} looks the other way` }, op(s, c.id, 3, 'The boss took care of me')], tone: 'warm' },
          { id: 'enough', label: 'You\'re paid enough', hint: 'free · he is sore about it', eff: [op(s, c.id, -5, 'The boss said I was paid enough')], tone: 'cold' },
        ],
        line: '',
      } });
      break;
    }
  }
  // A rival boss with a pact or a war.
  for (const r of s.rivals) {
    if (r.kind === 'law') continue;
    const c = s.characters[r.leaderId];
    if (!c?.alive) continue;
    const pact = pactWith(s, r.id);
    if (!pact && !r.war && !r.feud) continue;
    const letter = r.id === 'philly';
    out.push({ pri: r.war ? 3.5 : 1.8, w: {
      id: `rival:${c.id}`, kind: 'rival', who: c.id, name: displayName(c), role: `Boss of ${r.name}`, ...(letter ? { from: 'Philadelphia' } : {}),
      brief: [...base(c), `He is the boss of ${r.name}. ${r.war ? 'His family is at war with the boss\'s.' : r.feud ? 'There is a blood feud between the families.' : `The families have a ${pact!.kind}: ${pact!.terms}.`}`, r.war || r.feud ? 'He calls to take the boss\'s measure; he is cold and careful.' : 'He calls to see that the arrangement holds.'],
      names: namesOf([c, boss]),
      replies: [
        { id: 'respect', label: 'Assure him of your respect', hint: 'free · his family warms a little', eff: [{ type: 'rivalOpinion', rival: r.id as RivalId, amount: 4, reason: 'The boss showed respect on the phone' }], tone: 'warm' },
        { id: 'warn', label: 'Tell him to watch himself', hint: 'free · respect +1, his family cools', eff: [{ type: 'rivalOpinion', rival: r.id as RivalId, amount: -5, reason: 'The boss warned him off' }, { type: 'respect', amount: 1, label: `Stood up to ${short(c)}` }], tone: 'cold' },
      ],
      line: '',
    } });
  }
  // Ma.
  const ma = maOf(s);
  if (ma) {
    out.push({ pri: 1.2, w: {
      id: `ma:${ma.id}`, kind: 'ma', who: ma.id, name: displayName(ma), role: 'Your mother',
      brief: [`The boss is ${bossName}; the caller is his mother, ${displayName(ma)}. It is ${s.date.m}/${s.date.y}.`, `She worries about him. She wants him at Sunday dinner${wife ? ' with his wife and the kids' : ''}.`, 'She does not ask about his business and does not want to know.'],
      names: namesOf([ma, boss, wife]),
      replies: [
        { id: 'sunday', label: 'I\'ll be there Sunday, Ma', hint: 'free · she is happy', eff: [op(s, ma.id, 5, 'My son is coming Sunday')], tone: 'warm' },
        { id: 'money', label: 'Send her something', hint: `${fmtMoney(100)} · she scolds you and keeps it`, cost: 100, eff: [pay(100, 'Something for Ma'), op(s, ma.id, 4, 'My son sent me something')], tone: 'warm' },
        { id: 'busy', label: 'I\'m busy, Ma', hint: 'free · she sighs', eff: [op(s, ma.id, -3, 'Too busy for his mother')], tone: 'cold' },
      ],
      line: '',
    } });
  }
  for (const c of out) c.w.line = templateLine(s, c.w);
  return out;
}

/** This week's word: one to three people, the most pressing first, one per kind, past the cooldowns and the answered. Pure. */
export function wordThisWeek(s: GameState): Word[] {
  const W = s.phone?.word;
  const cands = wordCandidates(s).filter((c) => !answered(s, c.w.id) && (W?.cd[c.w.id] ?? -99) + COOL[c.w.kind] <= s.week);
  cands.sort((a, b) => b.pri + (H(`${s.seed}|${s.week}|${a.w.id}`) % 100) / 100 - (a.pri + (H(`${s.seed}|${s.week}|${b.w.id}`) % 100) / 100));
  const out: Word[] = [];
  const kinds = new Set<WordKind>();
  for (const c of cands) {
    if (out.length >= WORD_PER_WEEK) break;
    if (kinds.has(c.w.kind)) continue;
    kinds.add(c.w.kind);
    out.push(c.w);
  }
  return out;
}

export function answered(s: GameState, id: string): boolean {
  return !!s.phone?.word?.done.some((x) => x[0] === s.week && x[1] === id);
}

/** Word waiting this week (not answered). */
export function wordWaiting(s: GameState): Word[] {
  return wordThisWeek(s);
}

/* ------------------------------------------------------------------ */
/* The templated lines (the fallback)                                  */
/* ------------------------------------------------------------------ */

const T: Record<WordKind, string[]> = {
  pinch: [
    'Boss, the food in here would kill a horse. I keep my mouth shut and my head down, you know that. It\'s my wife I worry about. Anything you can do, I won\'t forget it.',
    'They got me counting days in here. I\'m not saying a word to nobody, don\'t you worry. Just look in on my family for me, will you?',
  ],
  lam: [
    'It\'s quiet down here. Too quiet. I\'m running low and I miss the boardwalk. When can I come home, boss?',
    'Nobody knows me here, which is the point. Money\'s thin. Tell me when it\'s safe and I\'m on the first bus.',
  ],
  broke: [
    'Boss, I hate to call you with this. Things have been bad. I\'m into a few guys and the rent\'s due. I wouldn\'t ask if I had anywhere else to go.',
    'I\'m tapped out, boss. Flat. I\'ll make it right when the season turns, on my mother.',
  ],
  grievance: [
    'Boss, I gotta say this once and then I\'ll drop it. I been loyal, I been earning, and I feel like I\'m standing outside in the rain. That\'s all. I said it.',
    'I\'m not complaining. I\'m just saying. Other guys get looked after and I get looked past. You should know how I feel.',
  ],
  score: [
    'Boss, I got something. Can\'t say it on the phone. It\'s good, though. Let me come by and lay it out.',
    'I found a thing. Real money, low noise. Give me ten minutes of your time, in person.',
  ],
  goomar: [
    'It\'s me. I haven\'t seen you in days. The apartment\'s too quiet. When are you coming by?',
    'I bought a new dress and nobody to wear it for. You remember where I live, don\'t you?',
  ],
  wife: [
    'Dinner was on the table at six. It\'s cold now. The kids asked where you were. What do I tell them?',
    'I\'m not going to ask where you are. I just want to know if you\'re coming home tonight.',
  ],
  baby: [
    'I need to know where you stand. I\'m keeping it. I\'m scared, and I need to hear it from you.',
    'You heard what I told you. I\'m not asking for the moon. I just need to know I\'m not alone in this.',
  ],
  cop: [
    'It\'s getting hot down at the station. The captain\'s asking questions. I\'m sticking my neck out for you and it\'s costing me.',
    'I can\'t keep looking the other way for what you\'re paying, not with the brass breathing on me.',
  ],
  rival: [
    'I wanted to hear your voice. See how things stand between us. A man likes to know where he is.',
    'We have an understanding. I call to make sure it still means something.',
  ],
  ma: [
    'You don\'t call your mother anymore? Sunday, one o\'clock, I\'m making the gravy. Don\'t make me wait.',
    'I lit a candle for you at Saint Ann\'s. Come Sunday. Bring an appetite.',
  ],
};

/** The templated message for a reason (deterministic). */
export function templateLine(s: GameState, w: Word): string {
  const xs = T[w.kind];
  return xs[H(`${s.seed}|${s.week}|${w.id}`) % xs.length];
}

const ANSWER: Record<WordReply['tone'], string[]> = {
  warm: ['That\'s all I needed to hear. Thank you.', 'You\'re good to me. I won\'t forget it.', 'God bless you. I mean it.'],
  flat: ['All right. If that\'s how it is.', 'I hear you. I\'ll do what you say.'],
  cold: ['...Fine. I understand.', 'Okay. I\'ll remember this.', 'If that\'s how you want it.'],
};

/** The caller's templated answer to a reply. */
export function templateAnswer(s: GameState, w: Word, r: WordReply): string {
  const xs = ANSWER[r.tone];
  return xs[H(`${s.seed}|${w.id}|${r.id}`) % xs.length];
}

/* ------------------------------------------------------------------ */
/* Claude: the prompts and the validators                              */
/* ------------------------------------------------------------------ */

const RULES = `You voice one person in "Little Las Vegas", a fictional crime drama set in Wildwood, New Jersey, around 1960 (everyone is invented). The person reaches out to the boss of a crime family by {MEDIUM}.
Rules:
- Write ONLY from the FACTS below. Invent no events, no people, no places beyond them. The only names you may use are: {NAMES}.
- Period voice, early-1960s Jersey Shore: plain, clipped, warm or cold as the person feels. No modern words.
- At most 80 words. No numbers, no dollar amounts, no dates.
- Violence only implied. Romance only between adults, nothing explicit. Never give real-world instructions for any crime.
Answer with ONLY a JSON object: {"message": "..."}`;

function medium(w: Word): string {
  return w.from ? `a letter (from ${w.from}); write it as a short letter, signed with a first name` : 'telephone; write what they say when he picks up';
}

/** The prompt for the caller's message. */
export function wordPrompt(w: Word): { role: 'user'; content: string }[] {
  const rules = RULES.replace('{MEDIUM}', medium(w)).replace('{NAMES}', w.names.join(', ') || 'none');
  return [{ role: 'user', content: `${rules}\n\nFACTS:\n${w.brief.map((b) => `- ${b}`).join('\n')}` }];
}

const BAD = /\b(sex|sexy|naked|nude|rape|fuck|shit|cocaine|heroin|gun ?powder|silencer|how to)\b/i;
const MODERN = /\b(okay cool|awesome|text me|cell ?phone|internet|email|dude)\b/i;

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

/**
 * Is this text speakable for this word? Bounded, no numbers, no names but the
 * brief's (any other character's first or last name is out), nothing explicit.
 */
export function checkText(s: GameState, w: Pick<Word, 'names'>, text: string, maxWords: number): string | undefined {
  const t = clean(text, 900);
  if (!t || words(t) > maxWords) return undefined;
  if (/\d|\$/.test(t)) return undefined;
  if (BAD.test(t) || MODERN.test(t)) return undefined;
  const ok = new Set(w.names.map((n) => n.toLowerCase()));
  const tokens = new Set((t.match(/\b[A-Z][a-z]+(?:'[a-z]+)?\b/g) ?? []).map((x) => x.toLowerCase()));
  for (const c of Object.values(s.characters)) {
    for (const n of [c.firstName, c.lastName, c.nickname]) {
      if (!n || n.length < 3) continue;
      const k = n.toLowerCase();
      if (tokens.has(k) && !ok.has(k)) return undefined;
    }
  }
  return t;
}

/** The voiced message, if it passes; else undefined (the templated line stands). */
export function checkWordMessage(s: GameState, w: Word, raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const m = (raw as Record<string, unknown>).message;
  return typeof m === 'string' ? checkText(s, w, m, WORD_MAX_WORDS) : undefined;
}

/** The prompt for the boss's own words: which whitelisted reply they are, and the caller's answer. */
export function replyPrompt(w: Word, said: string, message: string): { role: 'user'; content: string }[] {
  const rules = RULES.replace('{MEDIUM}', medium(w)).replace('{NAMES}', w.names.join(', ') || 'none').replace('At most 80 words', 'At most 60 words').replace('{"message": "..."}', '{"choice": <index>, "answer": "..."}');
  const menu = w.replies.map((r, i) => `${i}: ${r.label}`).join('\n');
  return [{ role: 'user', content: `${rules}\n\nFACTS:\n${w.brief.map((b) => `- ${b}`).join('\n')}\n\nThe person said: "${clean(message, 900)}"\nThe boss answered in his own words: "${clean(said, 300)}"\n\nFirst decide which ONE of these answers the boss's words mean (pick the closest; the index only):\n${menu}\nThen write the person's short answer to him ("answer", at most 60 words).` }];
}

/** The classified reply (a whitelisted index) and the caller's voiced answer if it passes. */
export function checkReplyClass(s: GameState, w: Word, raw: unknown): { reply: WordReply; answer?: string } | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const n = typeof o.choice === 'number' ? o.choice : typeof o.choice === 'string' && /^\d+$/.test(o.choice) ? Number(o.choice) : NaN;
  if (!Number.isInteger(n) || n < 0 || n >= w.replies.length) return undefined;
  const reply = w.replies[n];
  const answer = typeof o.answer === 'string' ? checkText(s, w, o.answer, ANSWER_MAX_WORDS) : undefined;
  return { reply, ...(answer ? { answer } : {}) };
}

/* ------------------------------------------------------------------ */
/* Answering                                                           */
/* ------------------------------------------------------------------ */

/** Why this reply can't be given now (the Family hasn't the money), or undefined. */
export function replyBlock(s: GameState, r: WordReply): string | undefined {
  if (r.cost && s.money < r.cost) return `The Family hasn't ${fmtMoney(r.cost)}`;
  return undefined;
}

export interface WordResult {
  ok: boolean;
  error?: string;
  /** What the caller said back. */
  answer: string;
  /** What changed (ledger lines and notes). */
  changes: string[];
  /** The ledger lines the answer posted (for reconcile). */
  lines: ReportLine[];
  start: { money: number; respect: number; heat: GameState['heat'] };
}

function ensureWord(s: GameState): WordState {
  const P = ensurePhone(s);
  P.word ??= { done: [], cd: {} };
  return P.word;
}

/**
 * The boss answers: exactly the whitelisted reply's effects, the cooldown,
 * one line in Your File. `answer`: the caller's voiced answer if Claude gave a
 * valid one (else the templated one). Pure: returns a new state.
 */
export function answerWord(input: GameState, wordId: string, replyId: string, answer?: string, said?: string): { state: GameState; result: WordResult } {
  const w = wordThisWeek(input).find((x) => x.id === wordId);
  const start = { money: input.money, respect: input.respect, heat: { ...input.heat } };
  const fail = (error: string) => ({ state: input, result: { ok: false, error, answer: '', changes: [], lines: [], start } });
  if (!w) return fail('Nobody is on the line');
  const r = w.replies.find((x) => x.id === replyId);
  if (!r) return fail('Not one of the answers');
  const why = replyBlock(input, r);
  if (why) return fail(why);
  const s = phoneClone(input);
  const W = ensureWord(s);
  const ctx = newCtx(s);
  applyEffects(ctx, r.eff, { label: `${w.name}: ${r.label}`, because: r.label.toLowerCase(), category: 'event' });
  W.done.push([s.week, w.id]);
  W.done = W.done.filter((x) => x[0] >= s.week - 1).slice(-12);
  W.cd[w.id] = s.week;
  for (const k of Object.keys(W.cd)) if (W.cd[k] < s.week - 8) delete W.cd[k];
  const said2 = answer ?? templateAnswer(s, w, r);
  journal(s, {
    c: CAT[w.kind], t: `${w.from ? 'A letter from' : 'On the phone:'} ${w.name}`,
    r: [`${KIND_LABEL[w.kind]}. You answered: ${r.label}${said ? ` ("${clean(said, 120)}")` : ''}.`, `${short(input.characters[w.who] ?? player(input))}: "${clean(said2, 200)}"`, ...ctx.log].slice(0, 6),
    src: 'phone', mine: 1, p: [w.who],
  });
  const changes = ctx.lines.filter((l) => l.amount).map((l) => `${l.label}: ${l.stat === 'money' ? `${l.amount > 0 ? '+' : '−'}${fmtMoney(Math.abs(l.amount))}` : `${l.stat} ${sign(Math.round(l.amount))}`}`);
  for (const e of r.eff) if (e.type === 'opinion') changes.push(`${short(s.characters[e.from] ?? player(s))} thinks ${sign(e.amount)} of you`);
  return { state: s, result: { ok: true, answer: said2, changes, lines: ctx.lines, start } };
}

/** Do the answer's ledger lines account for every change? ([] = yes). */
export function reconcileWord(state: GameState, r: WordResult): string[] {
  return reconcile({ start: r.start, end: { money: state.money, respect: state.respect, heat: state.heat }, lines: r.lines });
}
