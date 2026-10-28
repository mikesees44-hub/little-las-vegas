import { displayName, hasTrait } from '../characters';
import { applyEffects } from '../effects';
import { cloneState } from '../engine';
import { dynastyChoices } from '../family';
import { newCtx } from '../ledger';
import { arcsResolve } from '../livingStories';
import { opinion } from '../relations';
import { hashSeed } from '../rng';
import { storyResolve } from '../storyPack';
import { noteAnswers } from '../storyPace';
import { AUDIENCE_ID } from '../tributeEvents';
import type { Choice as EventChoice, Effect, EventInstance, GameState } from '../types';
import { grudge } from './memory';
import { clamp, mindOf } from './state';
import { clean, type TalkOutcome } from './talk';
import { mindView } from './view';

/**
 * THE TWO-WAY WINDOW: a conversation or a negotiation with one person, turn
 * by turn. A pure state machine the screens drive (ui/minds/DialogueWindow):
 *
 *  - her (his) live METERS: interest/warmth, annoyance/anger, and the stake on
 *    the table (her price, his cut, the envelope he wants) with how far she
 *    will bend (her reservation, hidden);
 *  - the boss's TONES (Flirt, Compliment, Negotiate, Raise the offer, Push,
 *    Joke, Apologize, Back off, Walk away, Get angry; for business: Firm,
 *    Generous, Threaten, Flatter, Stall), each with a hint of its likely effect;
 *  - her REPLY, read from her mind (mood, traits, what she thinks of him, what
 *    she holds against him): scripted lines by default, Claude's lines when the
 *    page can ask (validated and clamped here like everything else).
 *
 * She decides. Anger past the line and she walks out; patience runs out and
 * she ends it; a deal is a deal only inside her reservation. The window never
 * changes the game itself: a deal comes out as TERMS that the existing ops
 * apply (the evening's price, a decision's choice with its money scaled within
 * bounds); no deal falls back to the refusal / default choice. Nobody of the
 * boss's is ever given up by a negotiation: only the choice he picks does that.
 * Deterministic: every roll is a hash of (seed, week, who, round, tone).
 */

export type Tone =
  | 'flirt' | 'compliment' | 'negotiate' | 'raise' | 'push' | 'joke' | 'apologize' | 'backoff' | 'walk' | 'angry'
  | 'firm' | 'generous' | 'threaten' | 'flatter' | 'stall' | 'accept';
export type DialogueKind = 'talk' | 'romance' | 'haggle' | 'negotiate';
export type DialogueEnd = 'deal' | 'walkout' | 'left' | 'done';

export const TONE_LABEL: Record<Tone, string> = {
  flirt: 'Flirt', compliment: 'Compliment', negotiate: 'Negotiate', raise: 'Raise the offer', push: 'Push', joke: 'Joke', apologize: 'Apologize',
  backoff: 'Back off', walk: 'Walk away', angry: 'Get angry', firm: 'Stand firm', generous: 'Be generous', threaten: 'Threaten', flatter: 'Flatter',
  stall: 'Stall', accept: 'Accept',
};

/** Which tones each kind of window offers. */
export const KIND_TONES: Record<DialogueKind, Tone[]> = {
  talk: ['compliment', 'joke', 'push', 'apologize', 'flatter', 'angry', 'backoff', 'walk'],
  romance: ['flirt', 'compliment', 'joke', 'push', 'apologize', 'backoff', 'angry', 'walk'],
  haggle: ['accept', 'negotiate', 'raise', 'flirt', 'compliment', 'joke', 'angry', 'walk'],
  negotiate: ['accept', 'negotiate', 'firm', 'generous', 'flatter', 'threaten', 'stall', 'walk'],
};

/** What is on the table. `dir` 1: they want an amount from the boss (he pushes it down); -1: they pay him (he pushes it up). */
export interface Stake {
  label: string;
  unit: '$' | '%';
  dir: 1 | -1;
  /** Their opening position. */
  ask: number;
  /** Where they stand now. */
  pos: number;
  /** How far they will go (hidden). */
  res: number;
  /** The boss's last offer. */
  off?: number;
  /** Bounds the terms can never leave (the decision's own range). */
  lo: number;
  hi: number;
}

export interface Line { who: 'boss' | 'them' | 'narrator'; text: string; tone?: Tone }

export interface Dialogue {
  id: string;
  kind: DialogueKind;
  round: number;
  max: number;
  interest: number;
  anger: number;
  /** Where they started (for the outcome). */
  i0: number;
  stake?: Stake;
  end?: DialogueEnd;
  /** The agreed amount (a deal). */
  deal?: number;
  log: Line[];
}

const H = (k: string) => hashSeed(k) / 4294967296;
const r10 = (n: number) => Math.round(n / 10) * 10;
const fmt = (st: Stake | undefined, n: number) => (st?.unit === '%' ? `${Math.round(n)}%` : `$${Math.round(n).toLocaleString('en-US')}`);

/** Open the window: the meters start from what she thinks of him and what she holds against him. */
export function startDialogue(s: GameState, id: string, kind: DialogueKind, stake?: Omit<Stake, 'pos'> & { pos?: number }, max = 6): Dialogue {
  const op = opinion(s, id, s.playerId);
  const m = mindOf(s, id);
  const g = m ? grudge(m, s.playerId) : 0;
  const interest = Math.round(clamp(40 + op / 2 + (m?.mood === 'proud' || m?.mood === 'content' ? 5 : 0), 5, 95));
  const anger = Math.round(clamp(Math.max(0, -op / 3) + g / 2 + (m?.mood === 'angry' ? 15 : 0), 0, 60));
  const d: Dialogue = { id, kind, round: 0, max, interest, anger, i0: interest, log: [] };
  if (stake) d.stake = { ...stake, pos: stake.pos ?? stake.ask };
  return d;
}

interface ToneEff { i: number; a: number; bend: number }

/** How a tone lands on this person (base, then her nature and her mood). */
export function toneEffect(s: GameState, d: Dialogue, tone: Tone): ToneEff {
  const c = s.characters[d.id];
  const m = mindOf(s, d.id);
  const e: ToneEff = ({
    flirt: { i: 12, a: 0, bend: 0.02 }, compliment: { i: 8, a: -2, bend: 0.02 }, negotiate: { i: -2, a: 5, bend: 0 }, raise: { i: 6, a: -3, bend: 0 },
    push: { i: -6, a: 12, bend: 0.05 }, joke: { i: 6, a: -4, bend: 0.01 }, apologize: { i: 3, a: -15, bend: 0 }, backoff: { i: -4, a: -8, bend: 0 },
    walk: { i: 0, a: 0, bend: 0 }, angry: { i: -10, a: 20, bend: 0.06 }, firm: { i: -2, a: 6, bend: 0.05 }, generous: { i: 10, a: -6, bend: -0.02 },
    threaten: { i: -12, a: 25, bend: 0.12 }, flatter: { i: 8, a: -3, bend: 0.03 }, stall: { i: -3, a: 5, bend: 0.02 }, accept: { i: 4, a: -5, bend: 0 },
  } as Record<Tone, ToneEff>)[tone];
  const out = { ...e };
  if (!c) return out;
  const has = (t: Parameters<typeof hasTrait>[1]) => hasTrait(c, t);
  if (tone === 'flirt' && (has('Pious') || has('Honest') || d.kind === 'negotiate' || d.kind === 'talk')) { out.i -= 10; out.a += 6; }
  if ((tone === 'flatter' || tone === 'compliment') && (has('Ambitious') || has('Greedy'))) out.i += 4;
  if ((tone === 'flatter' || tone === 'compliment') && has('Paranoid')) out.i -= 5;
  if (tone === 'joke' && (m?.mood === 'grieving' || m?.mood === 'angry')) { out.i -= 8; out.a += 6; }
  if (tone === 'negotiate' && (has('Greedy') || has('Hot-headed'))) out.a += 4;
  if ((tone === 'push' || tone === 'angry' || tone === 'threaten') && has('Hot-headed')) out.a = Math.round(out.a * 1.8);
  // A coward bends to pressure; a proud man does not.
  if ((tone === 'push' || tone === 'angry' || tone === 'threaten' || tone === 'firm') && has('Cowardly')) { out.bend += 0.12; out.a = Math.round(out.a * 0.6); }
  if ((tone === 'push' || tone === 'threaten' || tone === 'firm') && (has('Vengeful') || has('Ambitious'))) out.bend -= 0.04;
  if (tone === 'stall' && has('Patient')) { out.a -= 4; out.bend -= 0.02; }
  if (tone === 'generous' && has('Greedy')) out.i += 4;
  if (m?.mood === 'afraid' && (tone === 'threaten' || tone === 'angry')) out.bend += 0.08;
  return out;
}

/** The boss's options this round, each with a hint of its likely effect. */
export function toneOptions(s: GameState, d: Dialogue): { tone: Tone; label: string; hint: string }[] {
  if (d.end) return [];
  return KIND_TONES[d.kind].filter((t) => (t === 'accept' || t === 'negotiate' || t === 'raise') ? !!d.stake : true).map((t) => {
    const e = toneEffect(s, d, t);
    const bits: string[] = [];
    if (t === 'walk') bits.push('ends it');
    else if (t === 'accept') bits.push(d.stake ? `agree at ${fmt(d.stake, d.stake.pos)}` : 'agree');
    else {
      if (e.i >= 6) bits.push('warms her'); else if (e.i <= -6) bits.push('cools her');
      if (e.a >= 15) bits.push('risks a blow-up'); else if (e.a >= 6) bits.push('annoys'); else if (e.a <= -6) bits.push('calms');
      if (d.stake && e.bend >= 0.05) bits.push('may move the price');
      if (t === 'negotiate' || t === 'raise') bits.push(t === 'raise' ? 'more on the table' : 'counter the figure');
    }
    return { tone: t, label: TONE_LABEL[t], hint: bits.join(', ') || 'little either way' };
  });
}

/** The figure a Negotiate / Raise would put on the table this round. */
export function suggestedOffer(d: Dialogue): number | undefined {
  const st = d.stake;
  if (!st) return undefined;
  const cur = st.off ?? (st.dir === 1 ? st.pos * 0.7 : st.pos * 1.3);
  // Meet in the middle of the last offer and their position.
  return Math.round(clamp(st.unit === '%' ? (cur + st.pos) / 2 : r10((cur + st.pos) / 2), st.lo, st.hi));
}

const LINES: Record<'warm' | 'cool' | 'hot' | 'deal' | 'walk' | 'counter', string[]> = {
  warm: ['That\'s nice of you to say.', 'You\'re not so bad yourself.', 'Now you\'re talking sense.', 'I like the way you put that.'],
  cool: ['Uh-huh.', 'I\'ve heard that one before.', 'Save it.', 'Is that supposed to work on me?'],
  hot: ['Watch your mouth.', 'You don\'t talk to me like that.', 'Keep pushing and see what happens.', 'I\'m this close to walking.'],
  deal: ['Then we understand each other.', 'Fine. We have a deal.', 'All right. For you.', 'Shake on it.'],
  walk: ['We\'re done here.', 'Find somebody else.', 'Don\'t call me again.', 'Good night.'],
  counter: ['That\'s as low as I go.', 'Meet me somewhere real.', 'You\'ll have to do better.', 'Now you\'re insulting me.'],
};
const pickLine = (k: keyof typeof LINES, key: string) => LINES[k][Math.floor(H(key) * LINES[k].length)];

export interface StepResult { d: Dialogue; line: string; di: number; da: number }

/**
 * One round: the boss's tone (and figure, for Negotiate/Raise), her reaction
 * on the meters, the stake's move, her line, and maybe the end. Pure.
 * `say` is what the boss said in his own words (logged; an AI line may follow).
 */
export function stepDialogue(s: GameState, d0: Dialogue, tone: Tone, opts: { offer?: number; say?: string; ai?: AiTurn } = {}): StepResult {
  const d: Dialogue = { ...d0, log: d0.log.slice(), ...(d0.stake ? { stake: { ...d0.stake } } : {}) };
  if (d.end) return { d, line: '', di: 0, da: 0 };
  const c = s.characters[d.id];
  const key = `${s.seed}|${s.week}|dlg|${d.id}|${d.round}|${tone}|${opts.offer ?? ''}`;
  const first = c?.firstName ?? 'She';
  d.log.push({ who: 'boss', text: opts.say ? clean(opts.say, 300) : bossLine(tone, d, opts.offer), tone });
  d.round++;
  if (tone === 'walk') {
    d.end = 'left';
    const line = d.stake ? 'Suit yourself.' : 'Another time, then.';
    d.log.push({ who: 'them', text: line });
    return { d, line, di: 0, da: 0 };
  }
  const e = toneEffect(s, d, tone);
  // Claude's read of the moment may shade it, inside bounds; the engine still decides.
  const di = Math.round(clamp(e.i + (opts.ai ? clamp(opts.ai.interest, -8, 8) : 0) + (H(key + 'i') - 0.5) * 4, -25, 25));
  const da = Math.round(clamp(e.a + (opts.ai ? clamp(opts.ai.anger, -8, 12) : 0) + (H(key + 'a') - 0.5) * 4, -25, 35));
  d.interest = Math.round(clamp(d.interest + di, 0, 100));
  d.anger = Math.round(clamp(d.anger + da, 0, 100));
  let line = '';
  const st = d.stake;
  if (st) {
    // Warmth bends the reservation a little; anger stiffens it.
    const bend = e.bend + (d.interest - 50) / 1000 - Math.max(0, d.anger - 40) / 800;
    st.res = st.dir === 1 ? Math.max(st.lo, st.res * (1 - bend)) : Math.min(st.hi, st.res * (1 + bend));
    if (tone === 'accept') { d.end = 'deal'; d.deal = st.pos; }
    else if (tone === 'negotiate' || tone === 'raise' || tone === 'firm' || tone === 'generous') {
      const want = opts.offer ?? (tone === 'generous' ? (st.pos + (st.off ?? st.pos)) / 2 : suggestedOffer(d) ?? st.pos);
      const off = clamp(want, st.lo, st.hi);
      st.off = off;
      const ok = st.dir === 1 ? off >= st.res : off <= st.res;
      if (ok || (st.dir === 1 ? off >= st.pos : off <= st.pos)) { d.end = 'deal'; d.deal = st.dir === 1 ? Math.min(off, st.pos) : Math.max(off, st.pos); }
      else {
        // They come toward the boss, never past their reservation.
        const step = (st.pos - st.res) * (0.35 + d.interest / 400);
        st.pos = st.dir === 1 ? Math.max(st.res, st.pos - step) : Math.min(st.res, st.pos - step);
        st.pos = st.unit === '%' ? Math.round(st.pos * 10) / 10 : r10(st.pos);
      }
    } else if (e.bend > 0.04 && d.anger < 70) {
      // Pressure that lands: they give a little ground.
      st.pos = st.dir === 1 ? Math.max(st.res, st.pos * (1 - e.bend / 2)) : Math.min(st.res, st.pos * (1 + e.bend / 2));
      st.pos = st.unit === '%' ? Math.round(st.pos * 10) / 10 : r10(st.pos);
    }
  }
  // She can always say no: past the line she walks; out of patience she ends it.
  if (!d.end && (d.anger >= 75 || (opts.ai?.walk && d.anger >= 40))) d.end = 'walkout';
  else if (!d.end && d.interest <= 3 && d.kind !== 'negotiate') d.end = 'walkout';
  else if (!d.end && d.round >= d.max) d.end = st ? 'walkout' : 'done';
  if (opts.ai?.reply) line = clean(opts.ai.reply, 400);
  else if (d.end === 'deal') line = st ? `${pickLine('deal', key)} ${fmt(st, d.deal!)}.` : pickLine('deal', key);
  else if (d.end === 'walkout') line = pickLine('walk', key);
  else if (st && (tone === 'negotiate' || tone === 'raise' || tone === 'firm' || tone === 'generous')) line = `${pickLine('counter', key)} ${fmt(st, st.pos)}.`;
  else line = da >= 12 ? pickLine('hot', key) : di >= 5 ? pickLine('warm', key) : pickLine('cool', key);
  d.log.push({ who: 'them', text: line });
  if (d.end === 'walkout') d.log.push({ who: 'narrator', text: `${first} ${d.stake ? 'won\'t deal' : 'walks out'}.` });
  return { d, line, di, da };
}

function bossLine(tone: Tone, d: Dialogue, offer?: number): string {
  const st = d.stake;
  switch (tone) {
    case 'negotiate': return `How about ${fmt(st, offer ?? suggestedOffer(d) ?? 0)}?`;
    case 'raise': return `All right: ${fmt(st, offer ?? suggestedOffer(d) ?? 0)}.`;
    case 'accept': return st ? `${fmt(st, st.pos)}. Done.` : 'You got it.';
    case 'firm': return `${fmt(st, offer ?? suggestedOffer(d) ?? 0)}. That's my number.`;
    case 'generous': return 'Let\'s not fight over nickels. Meet me halfway.';
    case 'flirt': return 'You know you\'re the best-looking thing on this island.';
    case 'compliment': return 'I\'ve always liked the way you handle yourself.';
    case 'flatter': return 'A man like you, everybody knows you\'re the one who matters.';
    case 'push': return 'Come on. Don\'t make me ask twice.';
    case 'joke': return 'Relax. Nobody ever died from a little conversation. Well. Almost nobody.';
    case 'apologize': return 'I was out of line. I\'m sorry.';
    case 'backoff': return 'Forget I said anything.';
    case 'angry': return 'Who do you think you\'re talking to?';
    case 'threaten': return 'Think about who you\'re saying no to.';
    case 'stall': return 'Let me think about it.';
    case 'walk': return 'I\'m done here.';
  }
  return '...';
}

/* ------------------------------------------------------------------ */
/* Claude's line (optional): validated and clamped                     */
/* ------------------------------------------------------------------ */

export interface AiTurn { reply: string; interest: number; anger: number; walk: boolean }

export function dialoguePrompt(s: GameState, d: Dialogue, tone: Tone, say: string): { role: 'user' | 'assistant'; content: string }[] {
  const c = s.characters[d.id];
  const v = mindView(s, d.id);
  const rules = `You voice one fictional character in "Little Las Vegas", a 1960 Wildwood, New Jersey mob-family game, in a two-way ${d.kind === 'negotiate' || d.kind === 'haggle' ? 'negotiation' : 'conversation'} with the boss. Rules: period Jersey Shore talk; everyone fictional, never real people; adults only for romance, nothing explicit (fade to black); violence only implied; never real-world crime instructions; SHE (he) decides and may refuse, get angry or walk out; never coerced. 1-3 sentences.
Reply with ONLY JSON: {"reply": string, "interest_delta": integer -8..8, "anger_delta": integer -8..12, "walk": boolean}`;
  const persona = c && v ? `Character: ${displayName(c)}, ${c.traits.join(', ') || 'no strong traits'}. Mood: ${v.moodText}. Thinks ${opinion(s, d.id, s.playerId)} of the boss (-100..100). Meters now: interest ${d.interest}/100, anger ${d.anger}/100.${d.stake ? ` On the table: ${d.stake.label}, her position ${fmt(d.stake, d.stake.pos)}${d.stake.off !== undefined ? `, his last offer ${fmt(d.stake, d.stake.off)}` : ''}. Do not state any other figure.` : ''}` : '';
  const hist = d.log.slice(-6).map((l) => `${l.who === 'boss' ? 'Boss' : l.who === 'them' ? (c?.firstName ?? 'Her') : 'Narrator'}: ${l.text}`).join('\n');
  return [{ role: 'user', content: `${rules}\n\n${persona}\n\nSo far:\n${hist || '(nothing yet)'}\n\nThe boss (${TONE_LABEL[tone]}): "${clean(say, 300)}"\nAnswer as ${c?.firstName ?? 'her'}, only the JSON.` }];
}

export function validateDialogue(raw: unknown): AiTurn | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.reply !== 'string') return undefined;
  const reply = clean(o.reply, 400);
  if (!reply) return undefined;
  const n = (v: unknown, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.round(clamp(x, lo, hi)) : 0; };
  return { reply, interest: n(o.interest_delta, -8, 8), anger: n(o.anger_delta, -8, 12), walk: o.walk === true };
}

/* ------------------------------------------------------------------ */
/* Outcomes                                                            */
/* ------------------------------------------------------------------ */

/** A talk window's end as a talk outcome (minds/talk.ts applies it, bounded). */
export function talkOutcomeOf(d: Dialogue): TalkOutcome {
  const op = Math.round(clamp((d.interest - d.i0) / 8 - Math.max(0, d.anger - 40) / 15, -5, 5));
  return {
    reply: d.log.filter((l) => l.who === 'them').slice(-1)[0]?.text ?? '',
    mood: Math.round(clamp((d.interest - d.i0) / 5 - d.anger / 20, -10, 10)),
    opinion: op,
    reveals: [],
    lie: false,
    intent: d.end === 'walkout' ? 'refuse' : d.anger >= 50 ? 'threaten' : d.interest >= 70 ? 'agree' : 'deflect',
  };
}

/** One line for the books (The Book journal hook can take it as an entry). */
export function dialogueSummary(s: GameState, d: Dialogue, title?: string): string {
  const c = s.characters[d.id];
  const who = c ? displayName(c) : 'someone';
  const end = d.end === 'deal' ? `a deal${d.deal !== undefined ? ` at ${fmt(d.stake, d.deal)}` : ''}` : d.end === 'walkout' ? `${c?.firstName ?? 'they'} walked out` : d.end === 'left' ? 'you walked away' : 'a talk';
  return `${title ? `${title}: ` : ''}${d.round} rounds with ${who}, ${end} (warmth ${d.interest}, anger ${d.anger}).`;
}

/* ------------------------------------------------------------------ */
/* Decisions with a counterpart: negotiate the terms, settle it now    */
/* ------------------------------------------------------------------ */

const moneyOf = (ch: EventChoice): number => ch.effects.reduce((a, e) => a + (e.type === 'money' ? e.amount : 0), 0);
/** Choices that hand someone over or put someone in the ground: never chosen by a failed negotiation. */
const grave = (ch: EventChoice) => ch.effects.some((e) => e.type === 'kill' || e.type === 'imprison' || e.type === 'rank' || e.type === 'recruit');

export interface Negotiable {
  counterpart: string;
  /** The choice the terms are about, and the one a failed negotiation falls back to. */
  dealChoice: string;
  fallback: string;
  stake: Omit<Stake, 'pos'>;
}

/** Can this decision be haggled over with its counterpart? (a person on the other side and money on the table). */
export function negotiable(s: GameState, ev: EventInstance): Negotiable | undefined {
  if (ev.defId === AUDIENCE_ID || ev.choices.some((ch) => ch.effects.some((e) => e.type === 'minigame'))) return undefined;
  const ids = ev.actors ?? (ev.meta?.charId ? [String(ev.meta.charId)] : []);
  const counterpart = ids.find((id) => id !== s.playerId && s.characters[id]?.alive);
  if (!counterpart) return undefined;
  const live = ev.choices.filter((ch) => !ch.disabledReason);
  const withMoney = live.filter((ch) => moneyOf(ch) !== 0 && !grave(ch)).sort((a, b) => Math.abs(moneyOf(b)) - Math.abs(moneyOf(a)) || a.id.localeCompare(b.id));
  const deal = withMoney[0];
  if (!deal) return undefined;
  const dflt = live.find((ch) => ch.id === ev.defaultChoiceId && ch.id !== deal.id && !grave(ch)) ?? live.find((ch) => ch.id !== deal.id && !grave(ch));
  if (!dflt) return undefined;
  const amt = moneyOf(deal);
  const c = s.characters[counterpart];
  const m = mindOf(s, counterpart);
  // How far he bends: his greed and pride against his nerve and his need.
  let bend = 0.22;
  if (c && hasTrait(c, 'Greedy')) bend -= 0.08;
  if (c && (hasTrait(c, 'Cowardly') || hasTrait(c, 'Charming'))) bend += 0.06;
  if (m?.mood === 'afraid') bend += 0.06;
  if (m?.mood === 'greedy') bend -= 0.05;
  bend = clamp(bend, 0.05, 0.4);
  const ask = Math.abs(amt);
  const dir: 1 | -1 = amt < 0 ? 1 : -1;
  return {
    counterpart,
    dealChoice: deal.id,
    fallback: dflt.id,
    stake: {
      label: dir === 1 ? 'What he wants from you' : 'What he pays you',
      unit: '$', dir, ask,
      res: dir === 1 ? r10(ask * (1 - bend)) : r10(ask * (1 + bend)),
      lo: r10(ask * 0.5), hi: r10(ask * 1.5),
    },
  };
}

/** The window's end as the decision's answer: a deal is the deal choice with its money scaled (0.5-1.5); no deal, the fallback. */
export function termsToChoice(n: Negotiable, d: Dialogue): { choiceId: string; scale: number } {
  if (d.end === 'deal' && d.deal !== undefined) return { choiceId: n.dealChoice, scale: Math.round(clamp(d.deal / n.stake.ask, 0.5, 1.5) * 1000) / 1000 };
  return { choiceId: n.fallback, scale: 1 };
}

/** Money effects scaled by the agreed terms (everything else as written). */
export function scaleEffects(effects: readonly Effect[], scale: number): Effect[] {
  const f = clamp(scale, 0.5, 1.5);
  return effects.map((e) => (e.type === 'money' ? { ...e, amount: Math.round(e.amount * f) } : e));
}

/**
 * Settle a decision NOW (the window's answer): the choice's effects go through
 * the same application as at the week's turn (ledger, heat, opinions, the
 * scheduled consequences), the story layers note it, and the event leaves the
 * pending list, so the week's turn cannot apply it again. Pure: a new state,
 * the lines it posted, and a sentence for the window. Events that resolve
 * through their own screens (the Monday audience, mini-games) are left alone.
 */
export function resolveEventNow(input: GameState, iid: string, choiceId: string, scale = 1): { state: GameState; lines: string[]; text: string } {
  const ev = input.pendingEvents.find((e) => e.iid === iid);
  if (!ev || ev.defId === AUDIENCE_ID || ev.choices.some((ch) => ch.effects.some((e) => e.type === 'minigame'))) return { state: input, lines: [], text: '' };
  const ch = ev.choices.find((c) => c.id === choiceId && !c.disabledReason);
  if (!ch) return { state: input, lines: [], text: '' };
  const s = cloneState(input);
  s.pendingEvents = s.pendingEvents.filter((e) => e.iid !== iid);
  const ctx = newCtx(s);
  const choices = { choices: { [iid]: choiceId } };
  noteAnswers(s, [ev], choices);
  const eff = scale === 1 ? ch.effects : scaleEffects(ch.effects, scale);
  const because = scale !== 1 && Math.abs(scale - 1) > 0.001 ? `${ch.because} (on terms you talked out)` : ch.because;
  applyEffects(ctx, eff, { label: `${ev.title}: ${ch.label}`, because, category: 'event' });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You ${because}.`, kind: 'decision' });
  if (!s.gameOver) dynastyChoices(ctx, [ev], choices);
  if (!s.gameOver) storyResolve(ctx, [ev]);
  if (!s.gameOver) arcsResolve(ctx, [ev], choices);
  // Settled now: the boss's ledger lines are kept for the screens (and the next report's "settled" note).
  const lines = ctx.lines.map((l) => `${l.label}: ${l.stat === 'money' ? `${l.amount >= 0 ? '+' : '-'}$${Math.abs(l.amount).toLocaleString('en-US')}` : `${l.amount >= 0 ? '+' : ''}${l.amount} ${l.stat}`}`);
  const M = s.minds;
  if (M) {
    M.settled = [...(M.settled ?? []), { w: s.week, text: `${ev.title}: ${ch.label}${scale !== 1 ? ` (x${scale.toFixed(2)})` : ''}` }].slice(-10);
  }
  const text = `Done: ${ch.label}${lines.length ? ` — ${lines.slice(0, 3).join('; ')}` : ''}.`;
  return { state: s, lines, text };
}

/**
 * Log a finished window (talk, haggle, flirt, negotiation) as one line: the
 * chronicle and the minds' settled list. The hook for "The Book" journal
 * (`journal(s, entry)`, another branch) is `journalEntryOf`: call it there
 * once merged. Pure.
 */
export function journalEntryOf(s: GameState, d: Dialogue, title?: string): { week: number; kind: 'conversation'; who: string; text: string } {
  return { week: s.week, kind: 'conversation', who: d.id, text: dialogueSummary(s, d, title) };
}

export function logDialogue(s: GameState, d: Dialogue, title?: string): GameState {
  if (!d.round) return s;
  const e = journalEntryOf(s, d, title);
  const next: GameState = { ...s, chronicle: [...s.chronicle, { week: s.week, date: { ...s.date }, text: e.text, kind: 'misc' }] };
  if (s.minds) next.minds = { ...s.minds, settled: [...(s.minds.settled ?? []), { w: s.week, text: e.text }].slice(-10) };
  return next;
}
