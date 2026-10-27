import { ageOn, monthKey } from './calendar';
import { capos, crew, displayName, hasTrait, isFree, player } from './characters';
import { holder } from './council';
import { applyEffects } from './effects';
import { knownEars } from './ears';
import { registerEventSource } from './events';
import { hashSeed } from './rng';
import { famMut } from './familyState';
import { capability } from './heir';
import { addStory } from './hierarchy';
import type { Ctx } from './ledger';
import { commitPower } from './power';
import { pw } from './powerState';
import { defectTo } from './regimes';
import { addOpinion, changeMeter, opinion } from './relations';
import { chance, randInt } from './rng';
import {
  AUTH_LEVEL, bloodHeir, claimants, declaredHeir, involvement, knowers, learn, makePromise, members, nameOf, pressure, registerShadowHooks,
  remember, seeBacking, support, theCons, theUb, weighCandidates,
} from './shadow';
import { ensureShadow, type ShStory, type ShSuccession, type SuccessionOutcome, type TemplateId } from './shadowState';
import { depose } from './station';
import { ensureTribute, type UbAuthority } from './tributeState';
import { ubGoal } from './underboss';
import type { Character, Choice, Effect, EventInstance, GameState } from './types';

/**
 * THE TWELVE STORIES of the succession (shadow.ts keeps the records).
 *
 * Each template is an event chain: a trigger read off the real state (the
 * sessions, promises, plans, pressure, the Don's health), silent beats that
 * change the world, and decision beats that reach the Don as a popup only
 * when it would plausibly reach him. Every story has several outcomes, and
 * every outcome leaves something behind: an opinion with a reason, a
 * promise kept or broken, a memory, an authority level, a faction, a split.
 * A beat the Don never answers resolves its own way after a few weeks.
 *
 * Also here: the TRANSITION — what happens to the family when the chair
 * changes hands (death or retirement): peaceful, a kingmaker underboss, a
 * contested succession, a split, an acting boss, or the underboss taking it.
 * The player's chosen heir never becomes boss automatically in practice.
 */

interface ChoiceSpec { id: string; label: string; detail?: string; because: string; effects?: Effect[]; disabled?: string }
interface TplDef {
  name: string;
  blurb: string;
  /** Read monthly: the cast, when the story should begin. */
  trigger?: (s: GameState) => Record<string, string> | undefined;
  /** One beat. Returns a decision for the Don, or nothing (a silent beat). */
  beat: (ctx: Ctx, st: ShStory) => EventInstance | undefined;
  choose: (ctx: Ctx, st: ShStory, choice: string) => void;
  def: string;
}

const note = (text: string): Effect => ({ type: 'power', op: { op: 'shadow', o: { op: 'note', text } }, label: text });
const N = nameOf;

function mkEvent(s: GameState, st: ShStory, title: string, text: string, choices: ChoiceSpec[], who?: string): EventInstance {
  const label = title;
  const cs: Choice[] = choices.map((c) => ({
    id: c.id, label: c.label, detail: c.detail, because: c.because,
    effects: [...(c.effects ?? []), { type: 'power', op: { op: 'shadow', o: { op: 'story', id: st.id, choice: c.id } }, label } as Effect],
    ...(c.disabled ? { disabledReason: c.disabled } : {}),
  }));
  const actors = Object.values(st.cast).filter((id) => s.characters[id]).slice(0, 3);
  return { iid: `ev${s.nextId++}`, defId: `shadow_${st.tpl}`, week: s.week, mandatory: true, priority: 72, title, text, choices: cs, defaultChoiceId: TPL[st.tpl].def, meta: { who: who ?? actors[0] ?? '' }, actors };
}

function end(ctx: Ctx, st: ShStory, outcome: string, text: string, who: string[] = []): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  st.outcome = outcome;
  st.ended = s.week;
  st.waiting = undefined;
  st.log.push({ week: s.week, text });
  sh.stats.storiesEnded++;
  sh.cool[st.tpl] = s.week;
  if (st.known) s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${TPL[st.tpl].name}: ${text}`, kind: 'family' });
  for (const id of who) if (s.characters[id]) { remember(s, id, `${TPL[st.tpl].name}: ${text}`); addStory(s, s.characters[id], text); }
}

const alive = (s: GameState, id?: string) => !!id && !!s.characters[id]?.alive;
const sayer = (s: GameState) => theCons(s) ?? capos(s).filter((k) => isFree(s, k)).sort((a, b) => opinion(s, b.id, s.playerId) - opinion(s, a.id, s.playerId))[0];

function setAuthority(s: GameState, level: UbAuthority): void {
  ensureTribute(s).ub.authority = level;
}

function learnAll(s: GameState, via: string, max: number, ofUb?: string): number {
  const sh = ensureShadow(s);
  let n = 0;
  for (const ses of [...sh.sessions].reverse()) {
    if (n >= max) break;
    if (ofUb && ses.presiding !== ofUb) continue;
    if (learn(s, s.playerId, ses.id, 'confirmed', via)) n++;
    for (const p of ses.petitions) if (p.promiseId) learn(s, s.playerId, p.promiseId, 'confirmed', via);
  }
  return n;
}

function backersOf(s: GameState, id: string): Character[] {
  const sh = ensureShadow(s);
  return members(s).filter((m) => sh.plans[m.id]?.prefer === id && m.id !== id);
}

function newFaction(ctx: Ctx, leader: Character, memberIds: string[], agenda: 'underboss' | 'abdicate', name: string): void {
  const s = ctx.s;
  if (s.factions.some((f) => f.leaderId === leader.id)) return;
  s.factions.push({ id: `f${s.nextId++}`, leaderId: leader.id, memberIds: [leader.id, ...memberIds.filter((x) => x !== leader.id)].slice(0, 6), demand: 'abdicate', agenda, candidateId: leader.id, since: s.week, stage: 0, stageWeek: s.week, name });
  ctx.log.push(`${displayName(leader)} is gathering men: ${name}.`);
}

/* ------------------------------------------------------------------ */
/* Retirement (an action, and one story's answer)                      */
/* ------------------------------------------------------------------ */

/** The Don steps down: Florida, the consigliere's seat, or emeritus in Wildwood. Play passes to the heir. */
export function retireDon(ctx: Ctx, mode: 'florida' | 'consigliere' | 'emeritus'): boolean {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const old = player(s);
  applyEffects(ctx, [{ type: 'dyn', op: { op: 'abdicate' } }], { label: 'The Don steps down', because: 'stepped down' });
  if (s.playerId === old.id) return false;
  if (mode === 'florida') return true;
  // He stays in Wildwood.
  old.faction = 'player';
  famMut(s, old.id).retired = s.week;
  if (mode === 'consigliere') {
    const cur = holder(s, 'consigliere');
    if (cur && cur.id !== old.id) {
      cur.rank = 'capo';
      addOpinion(s, cur.id, s.playerId, 'Gave my seat to the old man', -8, 1);
    }
    old.rank = 'consigliere';
    s.council.consigliere = { ...s.council.consigliere, holderId: old.id };
  } else old.rank = 'civilian';
  sh.emeritus = { id: old.id, since: s.week, mode };
  const text = mode === 'consigliere' ? `${displayName(old)} stayed on as consigliere to the new boss.` : `${displayName(old)} stayed in Wildwood as the old Don: no title, every door open.`;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'succession' });
  s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
  remember(s, old.id, text);
  return true;
}

/* ------------------------------------------------------------------ */
/* The twelve templates                                                */
/* ------------------------------------------------------------------ */

const TPL: Record<TemplateId, TplDef> = {
  own_court: {
    name: 'The Underboss Who Held His Own Court', blurb: 'Men bring the underboss what they used to bring the Don, and some of what he decides is not his to decide.', def: 'ignore',
    trigger: (s) => {
      const ub = theUb(s);
      const sh = ensureShadow(s);
      if (!ub) return undefined;
      const mine = sh.sessions.filter((x) => x.presiding === ub.id && s.week - x.week <= 52);
      if (mine.length < 3 || !mine.some((x) => x.auth === 'unauthorized')) return undefined;
      return mine.some((x) => sh.know[s.playerId]?.[x.id]) ? { ub: ub.id } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const ub = s.characters[st.cast.ub];
      const who = sayer(s);
      const known = ensureShadow(s).sessions.filter((x) => x.presiding === ub.id && ensureShadow(s).know[s.playerId]?.[x.id]).length;
      return mkEvent(s, st, 'The Underboss\'s Court',
        `${who ? `${displayName(who)} closes the door.` : 'You hear it the way you hear everything.'} ${displayName(ub)} has been holding court — ${known} meeting${known === 1 ? '' : 's'} you know of, likely more. Men bring him what they used to bring you, and some of what he decides is not his to decide.`, [
          { id: 'sanction', label: 'Make it official', detail: 'Raise his authority. He reports to you in return.', because: `made ${ub.firstName}'s court official`, effects: [note('His authority goes up a level'), note('He reports his meetings')] },
          { id: 'curb', label: 'Every petition comes to me', detail: 'You hold court yourself. He loses face; his people notice.', because: `told ${ub.firstName} every petition comes to the boss`, effects: [{ type: 'opinion', from: ub.id, to: s.playerId, amount: -12, reason: 'Took my table away', decay: 1 }, note('His authority drops to routine')] },
          { id: 'confront', label: 'Ask him to his face', detail: 'What he says depends on what he wants.', because: `asked ${ub.firstName} about his meetings`, effects: [note('Learn what he admits')] },
          { id: 'ignore', label: 'Let him. It keeps the men happy.', because: `let ${ub.firstName} keep his court`, effects: [note('His standing grows')] },
        ], ub.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const ub = s.characters[st.cast.ub];
      if (!ub?.alive) return end(ctx, st, 'moot', 'The man who held the court is gone.');
      const goal = ubGoal(s, ub);
      const t = ensureTribute(s);
      if (c === 'sanction') {
        const lvl = AUTH_LEVEL[t.ub.authority ?? 'routine'];
        setAuthority(s, lvl < 2 ? 'operational' : 'executive');
        addOpinion(s, ub.id, s.playerId, 'The boss trusts me with the men', 12, 1);
        learnAll(s, `${N(s, ub.id)}'s report`, 6, ub.id);
        end(ctx, st, 'sanctioned', `${displayName(ub)}'s court became official; he answers for it now.`, [ub.id]);
      } else if (c === 'curb') {
        setAuthority(s, 'routine');
        changeMeter(s, ub.id, s.playerId, 'grievance', 10);
        s.flags.pwr_court = s.week;
        for (const m of backersOf(s, ub.id)) addOpinion(s, m.id, s.playerId, 'Took away the one man who listened', -4, 1);
        end(ctx, st, 'curbed', `The Don took the petitions back from ${displayName(ub)}. His people noticed.`, [ub.id]);
      } else if (c === 'confront') {
        if (goal === 'serve' || hasTrait(ub, 'Loyal-to-a-fault')) {
          learnAll(s, `${N(s, ub.id)}, to your face`, 12, ub.id);
          addOpinion(s, ub.id, s.playerId, 'He asked me straight and I told him', 5, 1);
          end(ctx, st, 'confessed', `${displayName(ub)} told the Don everything, meeting by meeting.`, [ub.id]);
        } else if (goal === 'kingmaker' || goal === 'get_rich') {
          learnAll(s, `${N(s, ub.id)}, half of it`, 2, ub.id);
          end(ctx, st, 'half the truth', `${displayName(ub)} admitted to two meetings and smiled about the rest.`, [ub.id]);
        } else {
          addOpinion(s, ub.id, s.playerId, 'Treated me like a rat', -10, 1);
          changeMeter(s, ub.id, s.playerId, 'grievance', 12);
          end(ctx, st, 'denied', `${displayName(ub)} denied it all. The men who sat at his table did not.`, [ub.id]);
        }
      } else {
        t.ub.base = Math.min(100, t.ub.base + 5);
        end(ctx, st, 'tolerated', `The Don let ${displayName(ub)} keep his court.`, [ub.id]);
      }
    },
  },

  unheard_promise: {
    name: 'The Promise the Don Never Heard', blurb: 'A man was promised something years ago, by someone who had no right to promise it.', def: 'answer',
    trigger: (s) => {
      const sh = ensureShadow(s);
      const p = sh.promises.find((x) => x.status === 'outstanding' && x.maker !== s.playerId && s.week - x.week >= 40 && !sh.know[s.playerId]?.[x.id] && alive(s, x.to) && alive(s, x.maker) && !sh.stories.some((st) => !st.ended && st.cast.promise === x.id));
      return p ? { to: p.to, maker: p.maker, promise: p.id } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const sh = ensureShadow(s);
      const p = sh.promises.find((x) => x.id === st.cast.promise);
      if (!p || !alive(s, p.to) || p.status !== 'outstanding') { end(ctx, st, 'moot', 'The promise no longer stands.'); return undefined; }
      const to = s.characters[p.to];
      learn(s, s.playerId, p.id, 'confirmed', `${N(s, p.to)} himself`);
      const yrs = Math.max(1, Math.round((s.week - p.week) / 52));
      return mkEvent(s, st, 'The Promise You Never Heard',
        `${displayName(to)} asks to see you alone. He says ${displayName(s.characters[p.maker])} promised him ${p.role} — "${p.terms}" — ${yrs} year${yrs > 1 ? 's' : ''} ago, ${p.condition}. He has turned down other offers because of it. He wants to know if it holds.`, [
          { id: 'honor', label: 'It holds', detail: 'You keep a promise you never made.', because: `honored a promise ${N(s, p.maker)} made to ${to.firstName}`, effects: [{ type: 'opinion', from: to.id, to: s.playerId, amount: 12, reason: 'Kept a promise he never made', decay: 1 }] },
          { id: 'disown', label: 'Nobody speaks for me', detail: 'A broken promise. He will remember who broke it.', because: `disowned the promise to ${to.firstName}`, effects: [{ type: 'opinion', from: to.id, to: s.playerId, amount: -10, reason: 'The boss broke a promise made to me', decay: 1 }] },
          { id: 'answer', label: `${N(s, p.maker)} answers for it`, detail: 'Call the man who made it in front of the man who believed it.', because: `made ${N(s, p.maker)} answer for his promise`, effects: [{ type: 'opinion', from: p.maker, to: s.playerId, amount: -8, reason: 'Called me out over a promise', decay: 1 }] },
          { id: 'buy', label: 'Pay him for his patience ($1,500)', because: `paid ${to.firstName} instead of keeping the promise`, effects: [{ type: 'money', amount: -1500, category: 'event' }], disabled: s.money < 1500 ? 'Not enough money' : undefined },
        ], to.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const sh = ensureShadow(s);
      const p = sh.promises.find((x) => x.id === st.cast.promise);
      const to = p ? s.characters[p.to] : undefined;
      if (!p || !to?.alive) return end(ctx, st, 'moot', 'The man who was promised is gone.');
      p.settled = s.week;
      if (c === 'honor') {
        p.status = 'fulfilled';
        if (to.rank === 'associate') to.rank = 'soldier';
        else if (to.rank === 'soldier' && /crew|button/.test(p.role)) to.rank = 'capo';
        addOpinion(s, p.maker, s.playerId, 'Backed my word', 5, 1);
        end(ctx, st, 'honored', `The Don honored ${N(s, p.maker)}'s promise to ${displayName(to)}.`, [to.id, p.maker]);
      } else if (c === 'disown') {
        p.status = 'broken';
        sh.stats.broken++;
        changeMeter(s, to.id, s.playerId, 'grievance', 15);
        end(ctx, st, 'disowned', `The Don disowned the promise ${N(s, p.maker)} made to ${displayName(to)}.`, [to.id]);
      } else if (c === 'buy') {
        p.status = 'broken';
        addOpinion(s, to.id, s.playerId, 'Paid for my patience', 4, 1);
        end(ctx, st, 'bought off', `${displayName(to)} took money instead of what he was promised.`, [to.id]);
      } else {
        p.status = 'disputed';
        addOpinion(s, to.id, s.playerId, 'The boss took it seriously', 4, 1);
        addOpinion(s, to.id, p.maker, 'Promised what was not his to give', -10, 1);
        end(ctx, st, 'disputed', `${N(s, p.maker)} had to answer for a promise he made to ${displayName(to)}.`, [to.id, p.maker]);
      }
    },
  },

  young_capo: {
    name: 'The Young Capo Who Wants Tomorrow', blurb: 'A young man is building for the day after the Don, and wants to know where he fits.', def: 'wait',
    trigger: (s) => {
      const sh = ensureShadow(s);
      if (pressure(s).score < 30) return undefined;
      const y = members(s).find((m) => ageOn(m.birth, s.date) < 40 && (m.rank === 'capo' || m.rank === 'soldier') && ['seek_promotion', 'build_influence', 'build_business'].includes(sh.plans[m.id]?.goal ?? '') && !sh.stories.some((st) => st.cast.young === m.id));
      return y ? { young: y.id } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const sh = ensureShadow(s);
      const y = s.characters[st.cast.young];
      if (st.stage === 0) {
        // Silent: he builds friendships of his own.
        const peers = members(s).filter((m) => m.id !== y.id && ageOn(m.birth, s.date) < 42).slice(0, 2);
        for (const p of peers) addOpinion(s, p.id, y.id, 'We came up together', 8, 1);
        remember(s, y.id, `Started building his own people: ${peers.map((p) => p.firstName).join(', ') || 'nobody yet'}.`);
        st.stage = 1;
        st.next = s.week + randInt(sh, 8, 16);
        return undefined;
      }
      return mkEvent(s, st, `${y.firstName} Wants Tomorrow`,
        `${displayName(y)}, ${ageOn(y.birth, s.date)}, has friends in every crew and a business of his own on the side. He sits across from you, polite as a priest. He wants to know what his future is under the next boss.`, [
          { id: 'promise', label: 'Promise him the underboss seat, later', detail: 'Your own promise, witnessed by nobody. Keep it.', because: `promised ${y.firstName} a future`, effects: [{ type: 'opinion', from: y.id, to: s.playerId, amount: 10, reason: 'The boss promised me tomorrow', decay: 1 }] },
          { id: 'seat', label: 'Give him something real now', detail: 'A step up today. Older men will say he jumped the line.', because: `moved ${y.firstName} up`, effects: [{ type: 'opinion', from: y.id, to: s.playerId, amount: 12, reason: 'Moved me up', decay: 1 }] },
          { id: 'wait', label: '"Your time will come."', detail: 'He may look for someone who will promise.', because: `told ${y.firstName} to wait`, effects: [{ type: 'opinion', from: y.id, to: s.playerId, amount: -6, reason: 'Told me to wait my turn', decay: 1 }] },
          { id: 'heir', label: 'Send him to the heir', detail: 'Make him the next boss\'s man.', because: `sent ${y.firstName} to the heir`, disabled: declaredHeir(s) ? undefined : 'No heir to send him to' },
        ], y.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const y = s.characters[st.cast.young];
      if (!y?.alive) return end(ctx, st, 'moot', 'He is gone.');
      const heir = declaredHeir(s);
      if (c === 'promise') {
        makePromise(s, s.playerId, y.id, 'the underboss seat under the next boss', 'When the next man sits down, you sit at his right hand.', 'when the heir takes the chair', [], undefined, false);
        end(ctx, st, 'promised', `The Don promised ${displayName(y)} a seat at the next boss's right hand.`, [y.id]);
      } else if (c === 'seat') {
        if (y.rank === 'soldier') y.rank = 'capo';
        for (const k of capos(s)) if (k.id !== y.id && ageOn(k.birth, s.date) > 45) addOpinion(s, k.id, s.playerId, 'Let a kid jump the line', -3, 1);
        end(ctx, st, 'moved up', `${displayName(y)} was moved up early.`, [y.id]);
      } else if (c === 'heir' && heir) {
        addOpinion(s, y.id, heir.id, 'The boss put me with his son', 15, 1);
        addOpinion(s, heir.id, y.id, 'My father\'s choice for my right hand', 10, 1);
        end(ctx, st, 'the heir\'s man', `${displayName(y)} became ${N(s, heir.id)}'s man.`, [y.id, heir.id]);
      } else {
        const ub = theUb(s);
        const g = ub ? ubGoal(s, ub) : 'serve';
        if (ub && (g === 'become_boss' || g === 'kingmaker')) {
          makePromise(s, ub.id, y.id, 'a seat at the table', 'The old man told you to wait? I won\'t.', 'when the old man steps down', []);
          end(ctx, st, 'went to the underboss', `Told to wait, ${displayName(y)} went to ${N(s, ub.id)}, who did not tell him to wait.`, [y.id]);
        } else end(ctx, st, 'waiting', `${displayName(y)} was told to wait, and is waiting — for now.`, [y.id]);
      }
    },
  },

  unwanted_son: {
    name: 'The Son Nobody Wants as Boss', blurb: 'The heir is the heir. The capos are not sure he is a boss.', def: 'stand',
    trigger: (s) => {
      const h = declaredHeir(s);
      if (!h?.dynasty) return undefined;
      const sh = ensureShadow(s);
      const sup = support(s).shares[h.id] ?? 0;
      const doubters = capos(s).filter((k) => sh.plans[k.id]?.prefer && sh.plans[k.id]?.prefer !== h.id).length;
      return sup < 35 && doubters >= 2 ? { heir: h.id, sup0: String(sup) } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const h = s.characters[st.cast.heir];
      if (st.stage === 1) {
        const now = support(s).shares[h.id] ?? 0;
        const was = Number(st.cast.sup0);
        if (now >= was + 10) end(ctx, st, 'won them over', `${displayName(h)} won over the men who doubted him (${was}% → ${now}% of the family behind him).`, [h.id]);
        else end(ctx, st, 'still unwanted', `A year on, the capos still do not see ${displayName(h)} in the chair (${was}% → ${now}%).`, [h.id]);
        return undefined;
      }
      const who = sayer(s);
      return mkEvent(s, st, 'The Son Nobody Wants',
        `${who ? `${displayName(who)} picks his words.` : 'It reaches you sideways.'} The capos don't see ${displayName(h)} in the chair. They say it with respect, and they say it at other men's tables.`, [
          { id: 'groom', label: 'Groom him properly', detail: 'A year running the restaurant: payroll, suppliers, people.', because: `put ${h.firstName} to work`, effects: [note('Grooming: run the restaurant or the hotel')] },
          { id: 'crew', label: 'Put him on the street', detail: 'Let him learn where the money comes from, in front of the men.', because: `put ${h.firstName} on the street`, effects: [note('Placed to learn: the street')] },
          { id: 'stand', label: 'Stand by him, in front of everyone', detail: 'Clear. The doubters take it personally.', because: `stood by ${h.firstName} in front of the capos`, effects: [{ type: 'opinion', from: h.id, to: s.playerId, amount: 10, reason: 'My father stood by me', decay: 1 }] },
          { id: 'switch', label: 'Quietly look at the underboss instead', detail: 'The underboss becomes the heir. Your son learns he was not enough.', because: `quietly passed over ${h.firstName}`, disabled: theUb(s) ? undefined : 'There is no underboss' },
        ], h.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const h = s.characters[st.cast.heir];
      if (!h?.alive) return end(ctx, st, 'moot', 'The heir is gone.');
      st.known = true;
      if (c === 'groom') commitPower(ctx, { op: 'groom', charId: h.id, path: 'restaurant' });
      else if (c === 'crew') commitPower(ctx, { op: 'place', charId: h.id, post: 'street' });
      else if (c === 'switch' && theUb(s)) {
        commitPower(ctx, { op: 'designate', mode: 'underboss' });
        addOpinion(s, h.id, s.playerId, 'My father passed me over', -25, 0);
        return end(ctx, st, 'passed over', `The Don quietly passed over ${displayName(h)} for the underboss.`, [h.id]);
      } else {
        for (const k of capos(s)) if (ensureShadow(s).plans[k.id]?.prefer !== h.id) addOpinion(s, k.id, s.playerId, 'Shoving the kid down our throats', -4, 1);
      }
      st.stage = 1;
      st.next = s.week + 52;
    },
  },

  secret_heir: {
    name: 'The Secret Preferred Heir', blurb: 'The underboss has his own idea of who follows the Don.', def: 'forbid',
    trigger: (s) => {
      const ub = theUb(s);
      const h = declaredHeir(s);
      if (!ub || !h || ubGoal(s, ub) !== 'kingmaker') return undefined;
      const pool = [...claimants(s), ...capos(s)].filter((c, i, a) => a.indexOf(c) === i && c.id !== ub.id && c.id !== h.id && c.alive);
      const pick = weighCandidates(s, ub, pool)[0];
      return pick && pick.id !== ub.id && pick.score > 10 ? { ub: ub.id, pick: pick.id, heir: h.id } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const sh = ensureShadow(s);
      const ub = s.characters[st.cast.ub];
      const pick = s.characters[st.cast.pick];
      if (st.stage === 0) {
        const p = makePromise(s, ub.id, pick.id, 'the chair after the old man', 'You. Not the son. Leave the son to me.', 'when the old man is gone', []);
        st.cast.promise = p.id;
        addOpinion(s, pick.id, ub.id, 'He sees me as the next boss', 10, 1);
        st.stage = 1;
        st.next = s.week + randInt(sh, 12, 26);
        return undefined;
      }
      learn(s, s.playerId, st.cast.promise, 'rumor', 'what people are saying');
      return mkEvent(s, st, 'The Underboss\'s Choice',
        `Word reaches you: ${displayName(ub)} has his own idea of who follows you — ${displayName(pick)}, not ${N(s, st.cast.heir)}. He has been bringing ${pick.firstName} into his meetings.`, [
          { id: 'adopt', label: `Let ${N(s, ub.id)} have his way`, detail: 'Raise his authority; your heir hears about it.', because: `let ${ub.firstName} favor ${pick.firstName}`, effects: [{ type: 'opinion', from: st.cast.heir, to: s.playerId, amount: -12, reason: 'Let the underboss pick another man', decay: 1 }] },
          { id: 'forbid', label: 'Forbid it', detail: `${ub.firstName} loses face with ${pick.firstName}.`, because: `forbade ${ub.firstName}'s choice`, effects: [{ type: 'opinion', from: ub.id, to: s.playerId, amount: -10, reason: 'Overruled me in front of my people', decay: 1 }] },
          { id: 'both', label: 'A seat for both', detail: `${pick.firstName} gets a seat; your heir stays the heir.`, because: `gave ${pick.firstName} a seat beside the heir`, effects: [{ type: 'opinion', from: pick.id, to: s.playerId, amount: 8, reason: 'The boss gave me a seat', decay: 1 }] },
        ], ub.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const sh = ensureShadow(s);
      const p = sh.promises.find((x) => x.id === st.cast.promise);
      if (c === 'adopt') {
        setAuthority(s, 'executive');
        end(ctx, st, 'the underboss\'s man', `The Don let ${N(s, st.cast.ub)} favor ${N(s, st.cast.pick)} over the heir.`, [st.cast.ub, st.cast.pick, st.cast.heir]);
      } else if (c === 'forbid') {
        if (p) { p.status = 'disputed'; p.settled = s.week; }
        addOpinion(s, st.cast.pick, s.playerId, 'Blocked my future', -5, 1);
        end(ctx, st, 'forbidden', `The Don forbade ${N(s, st.cast.ub)}'s quiet choice.`, [st.cast.ub, st.cast.pick]);
      } else {
        addOpinion(s, st.cast.ub, s.playerId, 'Found room for my man', 4, 1);
        end(ctx, st, 'a seat for both', `${N(s, st.cast.pick)} got a seat beside the heir.`, [st.cast.pick, st.cast.heir]);
      }
    },
  },

  sick_don: {
    name: 'The Sick Don and the Acting Boss', blurb: 'The Don cannot sit in the chair for a while. Somebody will, and may not want to stand up.', def: 'ub',
    trigger: (s) => {
      const ub = theUb(s);
      const boss = player(s);
      if (boss.health >= 45 || (s.shadow?.actingUntil ?? -1) >= s.week) return undefined;
      return { ub: ub?.id ?? '', heir: declaredHeir(s)?.id ?? '' };
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const ub = s.characters[st.cast.ub];
      if (st.stage === 1) {
        if (st.cast.acting !== 'ub' || !ub?.alive) {
          end(ctx, st, 'recovered', 'The Don took his chair back.', [s.playerId]);
          return undefined;
        }
        const g = ubGoal(s, ub);
        if (g === 'serve' || g === 'get_out') {
          ensureShadow(s).actingUntil = undefined;
          addOpinion(s, ub.id, s.playerId, 'Gave it back like a gentleman', 3, 1);
          end(ctx, st, 'handed back', `${displayName(ub)} handed the family back without being asked.`, [ub.id]);
          return undefined;
        }
        return mkEvent(s, st, 'Handing It Back',
          `You are on your feet again. ${displayName(ub)} has been in your chair for months — and he has gotten comfortable in it. The capos call him first now.`, [
            { id: 'thank', label: 'Thank him, and keep him close', detail: 'He keeps operational authority.', because: `thanked ${ub.firstName} and kept him close`, effects: [note('He keeps operational authority')] },
            { id: 'force', label: 'Take it all back today', detail: 'Routine authority. He will not forget.', because: `took the family back from ${ub.firstName}`, effects: [{ type: 'opinion', from: ub.id, to: s.playerId, amount: -12, reason: 'Threw me out of the chair', decay: 1 }] },
            { id: 'share', label: 'Two chairs', detail: 'Executive authority: he decides real things.', because: `shared the family with ${ub.firstName}`, effects: [{ type: 'opinion', from: ub.id, to: s.playerId, amount: 8, reason: 'Gave me a real say', decay: 1 }] },
          ], ub.id);
      }
      const heir = s.characters[st.cast.heir];
      const cons = theCons(s);
      return mkEvent(s, st, 'The Sick Don',
        `The doctor at the hospital in Cape May Court House wants you off your feet for months. Somebody has to sit in. Everybody is watching who.`, [
          { id: 'ub', label: ub ? `${N(s, ub.id)} sits in` : 'The underboss sits in', detail: 'Acting authority for four months.', because: 'made the underboss acting boss', disabled: ub?.alive ? undefined : 'There is no underboss' },
          { id: 'heir', label: heir ? `${N(s, heir.id)} sits in` : 'The heir sits in', detail: 'A test, in front of everybody.', because: 'made the heir acting boss', disabled: heir?.alive ? undefined : 'No heir' },
          { id: 'bed', label: 'Run it from your bed', detail: 'Nobody sits in. Petitions pile up.', because: 'ran the family from a sickbed', effects: [{ type: 'crewOpinion', amount: -2, reason: 'The old man won\'t let go' }] },
          { id: 'cons', label: cons ? `${N(s, cons.id)} keeps the peace` : 'The consigliere keeps the peace', detail: 'A caretaker; the underboss is passed over.', because: 'let the consigliere keep the peace', disabled: cons ? undefined : 'No consigliere' },
        ], st.cast.ub || undefined);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const sh = ensureShadow(s);
      if (st.stage === 1) {
        const ub = s.characters[st.cast.ub];
        sh.actingUntil = undefined;
        if (!ub?.alive) return end(ctx, st, 'recovered', 'The Don took his chair back.');
        if (c === 'thank') setAuthority(s, 'operational');
        else if (c === 'force') { setAuthority(s, 'routine'); changeMeter(s, ub.id, s.playerId, 'grievance', 20); for (const m of backersOf(s, ub.id)) addOpinion(s, m.id, s.playerId, 'Threw out the man who kept us going', -5, 1); }
        else setAuthority(s, 'executive');
        return end(ctx, st, c === 'thank' ? 'kept a share' : c === 'force' ? 'took it back' : 'two chairs', c === 'force' ? `The Don took the family back from ${displayName(ub)} in one afternoon.` : `${displayName(ub)} kept a real share of the family after the Don recovered.`, [ub.id]);
      }
      st.known = true;
      if (c === 'ub' && alive(s, st.cast.ub)) {
        sh.actingUntil = s.week + 16;
        st.cast.acting = 'ub';
        const t = ensureTribute(s);
        t.ub.base = Math.min(100, t.ub.base + 10);
        addOpinion(s, st.cast.ub, s.playerId, 'Trusted me with the family', 10, 1);
      } else if (c === 'heir' && alive(s, st.cast.heir)) {
        st.cast.acting = 'heir';
        const h = s.characters[st.cast.heir];
        const good = capability(s, h).score >= 50;
        for (const k of capos(s)) addOpinion(s, k.id, h.id, good ? 'Handled it when the old man was sick' : 'In over his head', good ? 6 : -6, 1);
        remember(s, h.id, good ? 'Sat in the chair while his father was sick, and held it.' : 'Sat in the chair while his father was sick, and the capos saw him struggle.');
      } else if (c === 'cons') {
        st.cast.acting = 'cons';
        const cons = theCons(s);
        if (cons) addOpinion(s, cons.id, s.playerId, 'Trusted me to keep the peace', 8, 1);
        if (alive(s, st.cast.ub)) addOpinion(s, st.cast.ub, s.playerId, 'Passed me over for the consigliere', -6, 1);
      } else st.cast.acting = 'bed';
      st.stage = 1;
      st.next = s.week + 16;
    },
  },

  real_leader: {
    name: 'The Underboss Who Became the Real Leader', blurb: 'The capos know whose door to knock on. It is not the Don\'s.', def: 'accept',
    trigger: (s) => {
      const ub = theUb(s);
      const sh = ensureShadow(s);
      if (!ub) return undefined;
      const rows = sh.aud.slice(-8);
      const don = rows.reduce((a, r) => a + r[1], 0);
      const toUb = rows.reduce((a, r) => a + r[2], 0);
      const half = capos(s).length >= 2 && (s.tribute?.ub.callsFirst.length ?? 0) >= Math.ceil(capos(s).length / 2);
      return toUb >= 6 && toUb >= don * 2 && (half || ubGoal(s, ub) === 'kingmaker') ? { ub: ub.id } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const ub = s.characters[st.cast.ub];
      const kingmade = st.cast.kingmade === '1';
      const who = sayer(s);
      return mkEvent(s, st, 'Who Runs This Family?',
        kingmade
          ? `${displayName(ub)} could have taken the chair. He put you in it instead — and every important decision since has gone through him first. You think you are the boss. The capos know who really runs things.`
          : `${who ? `${displayName(who)} says it plainly.` : 'You can count it yourself.'} The men take their problems to ${displayName(ub)} and bring you the answers. Nobody has said a disloyal word. Nobody has to.`, [
          { id: 'challenge', label: 'Challenge him', detail: 'Strip his authority. If enough men are his, they may stand with him.', because: `challenged ${ub.firstName}`, effects: [note('His authority drops to routine'), note('His backers decide')] },
          { id: 'share', label: 'Share it, openly', detail: 'Executive authority, in front of everybody.', because: `shared power with ${ub.firstName}`, effects: [{ type: 'opinion', from: ub.id, to: s.playerId, amount: 10, reason: 'Gave me a real seat', decay: 1 }] },
          { id: 'accept', label: 'Let him run it', detail: 'Shadow boss: he is second in rank, first in practice.', because: `let ${ub.firstName} run the family`, effects: [{ type: 'respect', amount: -2 }] },
          { id: 'council', label: 'Call the family together', detail: 'Every capo at one table. You will see who looks at whom.', because: 'called the family together', effects: [note('You learn where every capo stands (rumor)')] },
        ], ub.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const ub = s.characters[st.cast.ub];
      if (!ub?.alive) return end(ctx, st, 'moot', 'The man is gone.');
      st.known = true;
      if (c === 'challenge') {
        setAuthority(s, 'routine');
        const sup = support(s).shares[ub.id] ?? 0;
        if (sup >= 35 && ubGoal(s, ub) !== 'serve') {
          newFaction(ctx, ub, backersOf(s, ub.id).map((m) => m.id), 'abdicate', `${ub.firstName} ${ub.lastName}'s people`);
          end(ctx, st, 'open rift', `The Don challenged ${displayName(ub)}, and ${sup}% of the family stood with the underboss.`, [ub.id]);
        } else {
          addOpinion(s, ub.id, s.playerId, 'Put me back in my place', -10, 1);
          end(ctx, st, 'put back in his place', `The Don challenged ${displayName(ub)}, and the underboss backed down.`, [ub.id]);
        }
      } else if (c === 'share') {
        setAuthority(s, 'executive');
        end(ctx, st, 'shared power', `The Don and ${displayName(ub)} share the family, openly.`, [ub.id]);
      } else if (c === 'council') {
        councilReveal(s, 'the family council');
        end(ctx, st, 'put to the council', `The Don called the family together; every capo had to show his face.`, [ub.id]);
      } else {
        setAuthority(s, 'shadow');
        end(ctx, st, 'he runs it', `${displayName(ub)} runs the family in practice. The Don keeps the title.`, [ub.id]);
      }
    },
  },

  rival_favorite: {
    name: 'The Rival Family\'s Favorite Successor', blurb: 'Another family has picked a favorite in your succession.', def: 'warn',
    trigger: (s) => {
      const sh = ensureShadow(s);
      if (pressure(s).score < 45) return undefined;
      for (const [rid, rd] of Object.entries(sh.rivals)) {
        if (rd.favor && alive(s, rd.favor) && (rd.stance === 'court' || rd.moves >= 2) && s.rivals.some((r) => r.id === rid)) return { rival: rid, favor: rd.favor };
      }
      return undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const r = s.rivals.find((x) => x.id === st.cast.rival)!;
      const fav = s.characters[st.cast.favor];
      const lead = s.characters[r.leaderId];
      const rd = ensureShadow(s).rivals[r.id];
      if (rd) rd.known = 'confirmed';
      return mkEvent(s, st, `${r.shortName}'s Favorite`,
        `${lead ? displayName(lead) : r.name} has been treating ${displayName(fav)} like the next boss: dinners in Atlantic City, a box at the fights, a word in his ear about how things could be "more reasonable" between the families.`, [
          { id: 'use', label: `Let ${fav.firstName} carry a deal`, detail: 'Good for business. The capos will call him their boy.', because: `let ${fav.firstName} be ${r.shortName}'s channel`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: 6, reason: 'A friend in the family' }] },
          { id: 'warn', label: `Warn ${r.shortName} off`, because: `warned ${r.shortName} off ${fav.firstName}`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: -8, reason: 'Told us to keep away from his people' }] },
          { id: 'cut', label: `${fav.firstName} cuts ties`, detail: 'He will resent being told.', because: `made ${fav.firstName} cut ties with ${r.shortName}`, effects: [{ type: 'opinion', from: fav.id, to: s.playerId, amount: -8, reason: 'Told me who I can eat with', decay: 1 }] },
          { id: 'ask', label: 'Ask them what they know', detail: 'Rivals who like things as they are may tell you what your own people won\'t.', because: `asked ${r.shortName} what they know`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: 2, reason: 'Came to us as a friend' }] },
        ], fav.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const r = s.rivals.find((x) => x.id === st.cast.rival);
      const fav = s.characters[st.cast.favor];
      if (!fav?.alive || !r) return end(ctx, st, 'moot', 'The favorite is gone.');
      st.known = true;
      if (c === 'use') {
        for (const k of capos(s)) if (k.id !== fav.id) addOpinion(s, k.id, fav.id, `${r.shortName}'s boy`, -4, 1);
        end(ctx, st, 'a channel', `${displayName(fav)} became the family's channel to ${r.name}.`, [fav.id]);
      } else if (c === 'cut') {
        addOpinion(s, fav.id, r.leaderId, 'Cost me with my own family', -10, 1);
        end(ctx, st, 'cut ties', `${displayName(fav)} cut his ties with ${r.name}.`, [fav.id]);
      } else if (c === 'ask') {
        const n = learnAll(s, `${r.shortName}, who likes things as they are`, 1);
        if (n) ensureShadow(s).stats.rivalWarnings++;
        end(ctx, st, 'traded word', n ? `${r.name} told the Don about a meeting his own people had not.` : `${r.name} had nothing the Don did not know.`, [fav.id]);
      } else end(ctx, st, 'warned off', `The Don warned ${r.name} away from ${displayName(fav)}.`, [fav.id]);
    },
  },

  refused_boss: {
    name: 'The Crew That Refused the New Boss', blurb: 'A capo will not come and kiss the ring.', def: 'ub',
    trigger: (s) => {
      const sh = ensureShadow(s);
      const last = sh.successions[sh.successions.length - 1];
      if (!last || s.week - last.week > 26) return undefined;
      const k = capos(s).find((x) => isFree(s, x) && sh.plans[x.id]?.prefer && sh.plans[x.id]?.prefer !== s.playerId && opinion(s, x.id, s.playerId) < -10 && !sh.stories.some((st) => st.cast.capo === x.id));
      return k ? { capo: k.id, prefer: sh.plans[k.id]?.prefer ?? '' } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const k = s.characters[st.cast.capo];
      const d = s.districts.find((x) => x.capoId === k.id);
      return mkEvent(s, st, 'The Crew That Refused the New Boss',
        `${displayName(k)} has not come to kiss the ring. His crew kicked up short, and around ${d?.name ?? 'his corners'} they say he answers to ${st.cast.prefer && st.cast.prefer !== k.id ? N(s, st.cast.prefer) : 'himself'} now.`, [
          { id: 'sit', label: 'Go to him yourself ($1,000)', detail: 'A dinner, an envelope, respect paid in person.', because: `went to ${k.firstName} in person`, effects: [{ type: 'money', amount: -1000, category: 'event' }, { type: 'opinion', from: k.id, to: s.playerId, amount: 15, reason: 'The new boss came to me himself', decay: 1 }], disabled: s.money < 1000 ? 'Not enough money' : undefined },
          { id: 'loose', label: 'A looser leash', detail: 'He runs his crew his way; you get your end.', because: `gave ${k.firstName} a looser leash`, effects: [{ type: 'opinion', from: k.id, to: s.playerId, amount: 8, reason: 'Leaves me alone', decay: 1 }] },
          { id: 'example', label: 'Make an example of him', detail: 'Sent away. The other crews watch.', because: `made an example of ${k.firstName}`, effects: [{ type: 'exile', charId: k.id }, { type: 'crewOpinion', amount: -3, reason: 'The new boss came in swinging' }] },
          { id: 'ub', label: 'Let the underboss handle it', detail: 'He gets it done. He also gets the credit.', because: `let the underboss handle ${k.firstName}`, disabled: theUb(s) ? undefined : 'No underboss' },
        ], k.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const k = s.characters[st.cast.capo];
      st.known = true;
      if (c === 'ub') {
        const ub = theUb(s);
        if (ub) {
          ensureTribute(s).ub.base = Math.min(100, ensureTribute(s).ub.base + 8);
          if (k?.alive) addOpinion(s, k.id, ub.id, 'Straightened it out between us', 8, 1);
        }
        return end(ctx, st, 'the underboss\'s problem', `${N(s, ub?.id)} brought ${k ? displayName(k) : 'the capo'} back in line — and everybody knows who did it.`, [st.cast.capo]);
      }
      end(ctx, st, c === 'sit' ? 'reconciled' : c === 'loose' ? 'a looser leash' : 'made an example', c === 'sit' ? `The new boss went to ${k ? displayName(k) : 'the capo'} himself, and was received.` : c === 'loose' ? `${k ? displayName(k) : 'The capo'} runs his crew his own way under the new boss.` : `${k ? displayName(k) : 'The capo'} was sent away for refusing the new boss.`, [st.cast.capo]);
    },
  },

  consig_compromise: {
    name: 'The Consigliere\'s Compromise', blurb: 'Two camps, one chair, and a consigliere who wants nobody to die.', def: 'refuse',
    trigger: (s) => {
      const cons = theCons(s);
      const h = declaredHeir(s);
      const ub = theUb(s);
      if (!cons || !h || !ub || h.id === ub.id || pressure(s).score < 45) return undefined;
      const sh = support(s).shares;
      const a = sh[h.id] ?? 0;
      const b = sh[ub.id] ?? 0;
      return a >= 25 && b >= 25 && Math.abs(a - b) <= 15 ? { cons: cons.id, heir: h.id, ub: ub.id } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      const cons = s.characters[st.cast.cons];
      const h = s.characters[st.cast.heir];
      const ub = s.characters[st.cast.ub];
      return mkEvent(s, st, 'The Consigliere\'s Compromise',
        `${displayName(cons)} has been talking to both camps — ${h.firstName}'s and ${ub.firstName}'s. "Here is how nobody gets hurt," he says, and lays it out on a napkin.`, [
          { id: 'heirub', label: `${h.firstName} the boss, ${ub.firstName} keeps a real say`, detail: `Your promise to ${ub.firstName}, in front of witnesses.`, because: `promised ${ub.firstName} a real say under ${h.firstName}`, effects: [{ type: 'opinion', from: ub.id, to: s.playerId, amount: 12, reason: 'The boss guaranteed my place', decay: 1 }] },
          { id: 'ubheir', label: `${ub.firstName} first, ${h.firstName} after him`, detail: 'The underboss is heir; your son is promised the seat after.', because: `named ${ub.firstName} heir with ${h.firstName} to follow`, effects: [{ type: 'opinion', from: h.id, to: s.playerId, amount: -10, reason: 'Made me wait behind the underboss', decay: 1 }] },
          { id: 'committee', label: 'The capos decide together', detail: 'A committee. Stable, slow.', because: 'left the succession to a committee of capos' },
          { id: 'refuse', label: '"I decide. Not a napkin."', because: `refused ${cons.firstName}'s compromise`, effects: [{ type: 'opinion', from: cons.id, to: s.playerId, amount: -6, reason: 'Threw my work in my face', decay: 1 }] },
        ], cons.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const [cons, h, ub] = [st.cast.cons, st.cast.heir, st.cast.ub];
      st.known = true;
      if (!alive(s, h) || !alive(s, ub)) return end(ctx, st, 'moot', 'One of the two men is gone.');
      if (c === 'heirub') {
        makePromise(s, s.playerId, ub, 'his seat and his say under the next boss', 'You stay. You decide what you decide now. My son listens to you.', `when ${N(s, h)} takes the chair`, [cons, h], undefined, false);
        setAuthority(s, 'executive');
        end(ctx, st, 'the heir, with a strong underboss', `${N(s, h)} will be boss; ${N(s, ub)} keeps his seat and his say.`, [h, ub, cons]);
      } else if (c === 'ubheir') {
        commitPower(ctx, { op: 'designate', mode: 'underboss' });
        makePromise(s, s.playerId, h, 'the chair after the underboss', 'Vincent first. Then you. That is the deal.', `when ${N(s, ub)} steps down`, [cons, ub], undefined, false);
        end(ctx, st, 'the underboss first', `${N(s, ub)} is heir; ${N(s, h)} is promised the chair after him.`, [h, ub, cons]);
      } else if (c === 'committee') {
        commitPower(ctx, { op: 'designate', mode: 'committee' });
        end(ctx, st, 'a committee', 'The capos will choose the next boss together.', [h, ub, cons]);
      } else end(ctx, st, 'no compromise', `The Don refused the consigliere's compromise. Both camps keep counting.`, [cons]);
    },
  },

  wouldnt_retire: {
    name: 'The Boss Who Wouldn\'t Retire', blurb: 'Nobody says "retire". Everybody says Florida is nice in the winter.', def: 'never',
    trigger: (s): Record<string, string> | undefined => {
      const sh = ensureShadow(s);
      const em = sh.emeritus ? s.characters[sh.emeritus.id] : undefined;
      if (em?.alive && sh.emeritus!.mode === 'emeritus' && s.week - sh.emeritus!.since >= 26) return { old: em.id, variant: 'b' };
      const boss = player(s);
      if (ageOn(boss.birth, s.date) < 70 || pressure(s).score < 55) return undefined;
      const k = capos(s).filter((x) => isFree(s, x)).sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0];
      return k ? { spokes: k.id } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      if (st.cast.variant === 'b') {
        const old = s.characters[st.cast.old];
        return mkEvent(s, st, 'The Old Man Still Holds Court',
          `${displayName(old)} handed you the chair. He did not hand over the men. They still stop by his house on the way to yours, and he still tells them what he thinks.`, [
            { id: 'consult', label: 'Make him your counsel', detail: 'Two chairs, one of them in his kitchen.', because: `kept ${old.firstName} as counsel`, effects: [{ type: 'opinion', from: old.id, to: s.playerId, amount: 8, reason: 'The new boss still asks me', decay: 1 }] },
            { id: 'florida', label: 'Florida is nice in the winter', detail: 'Send him south, with love and a firm hand.', because: `sent ${old.firstName} to Florida`, effects: [{ type: 'opinion', from: old.id, to: s.playerId, amount: -10, reason: 'Sent me away from my own town', decay: 1 }] },
            { id: 'honor', label: 'A dinner in his honor, and a word', detail: 'Everyone sees him honored; everyone hears the word.', because: `honored ${old.firstName} and drew the line`, effects: [{ type: 'money', amount: -800, category: 'event' }] },
          ], old.id);
      }
      if (st.stage === 1) {
        const p = ensureShadow(s).promises.find((x) => x.id === st.cast.promise);
        if (p && p.status === 'outstanding') {
          p.status = 'broken';
          p.settled = s.week;
          ensureShadow(s).stats.broken++;
          for (const k of capos(s)) addOpinion(s, k.id, s.playerId, 'Said he would retire. He lied.', -10, 1);
          const k = s.characters[st.cast.spokes];
          if (k?.alive) newFaction(ctx, k, capos(s).filter((x) => opinion(s, x.id, s.playerId) < 0).map((x) => x.id), 'abdicate', `the capos who were promised Florida`);
          end(ctx, st, 'broke his word', 'The Don promised to retire, and did not.', [st.cast.spokes]);
        } else end(ctx, st, 'kept his word', 'The Don kept his word.', [st.cast.spokes]);
        return undefined;
      }
      const k = s.characters[st.cast.spokes];
      return mkEvent(s, st, 'The Boss Who Wouldn\'t Retire',
        `${displayName(k)} speaks for the capos. Nobody says "retire". Everybody says Florida is nice in the winter, and the grandchildren, and your heart.`, [
          { id: 'date', label: 'Set a date: two years', detail: 'A promise in front of every capo. Break it and they move.', because: 'promised to retire in two years', effects: [{ type: 'crewOpinion', amount: 3, reason: 'He set a date' }] },
          { id: 'now', label: 'Step down now, stay as the old Don', detail: 'The chair passes to your heir; you stay in Wildwood.', because: 'stepped down', disabled: declaredHeir(s) ? undefined : 'No heir' },
          { id: 'never', label: '"When I am dead."', detail: 'Respect from some. A clock starts for others.', because: 'refused to retire', effects: [{ type: 'respect', amount: 1 }, { type: 'crewOpinion', amount: -4, reason: 'The old man will not let go' }] },
        ], k.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      st.known = true;
      if (st.cast.variant === 'b') {
        const old = s.characters[st.cast.old];
        const sh = ensureShadow(s);
        if (c === 'florida' && old?.alive) {
          old.faction = 'none';
          old.rank = 'civilian';
          sh.emeritus = undefined;
          return end(ctx, st, 'sent to Florida', `${old ? displayName(old) : 'The old Don'} went to Florida.`, [st.cast.old]);
        }
        if (c === 'honor') { sh.emeritus = undefined; return end(ctx, st, 'honored and retired', `${old ? displayName(old) : 'The old Don'} was honored at a dinner, and the men stopped going to his house.`, [st.cast.old]); }
        return end(ctx, st, 'counsel', `${old ? displayName(old) : 'The old Don'} stayed on as the new boss's counsel. Two chairs.`, [st.cast.old]);
      }
      if (c === 'date') {
        const p = makePromise(s, s.playerId, st.cast.spokes, 'his retirement', 'Two years. Then the chair is my heir\'s.', 'within two years', capos(s).map((k) => k.id), undefined, false);
        st.cast.promise = p.id;
        st.stage = 1;
        st.next = s.week + 104;
        return;
      }
      if (c === 'now') {
        const old = s.playerId;
        if (retireDon(ctx, 'emeritus')) return end(ctx, st, 'stepped down', `${N(s, old)} stepped down and stayed in Wildwood as the old Don.`, [old]);
      }
      for (const m of members(s)) {
        const a = s.power?.ambitions[m.id];
        if (a && a.want === 'chair') a.intensity = Math.min(100, a.intensity + 10);
      }
      end(ctx, st, 'refused', '"When I am dead," the Don said. Some men admired it. Some started counting.', [st.cast.spokes]);
    },
  },

  split_family: {
    name: 'The Family That Split Before the Funeral', blurb: 'Two camps, two tables, and the old man still alive.', def: 'mediate',
    trigger: (s) => {
      const boss = player(s);
      if (boss.health >= 35 && ageOn(boss.birth, s.date) < 75) return undefined;
      const sh = support(s).shares;
      const two = claimants(s).filter((c) => (sh[c.id] ?? 0) >= 30).sort((a, b) => (sh[b.id] ?? 0) - (sh[a.id] ?? 0));
      return two.length >= 2 ? { a: two[0].id, b: two[1].id } : undefined;
    },
    beat: (ctx, st) => {
      const s = ctx.s;
      if (st.stage === 1) {
        const sp = ensureShadow(s).splinters.find((x) => x.id === st.cast.splinter);
        const lead = sp ? s.characters[sp.leaderId] : undefined;
        if (!sp || sp.back || !lead?.alive) { end(ctx, st, 'gone for good', 'The men who left did not come back.'); return undefined; }
        return mkEvent(s, st, 'They Want to Come Home',
          `${displayName(lead)} sends word. The men who walked out want to come home — on terms.`, [
            { id: 'home', label: 'Take them back', detail: 'One family again. The loyal men grumble.', because: `took ${lead.firstName}'s men back`, effects: [{ type: 'crewOpinion', amount: -2, reason: 'Took back the men who walked out' }] },
            { id: 'no', label: 'They chose', because: `refused ${lead.firstName}'s men`, effects: [{ type: 'respect', amount: 1 }] },
          ], lead.id);
      }
      const a = s.characters[st.cast.a];
      const b = s.characters[st.cast.b];
      const cons = theCons(s);
      const dead = !player(s) || player(s).id !== st.cast.don;
      return mkEvent(s, st, 'The Family That Split Before the Funeral',
        `${dead ? 'At the wake' : 'At the Feast, with the old man still alive'}, there are two tables: ${a.firstName}'s and ${b.firstName}'s. Men who have eaten together for twenty years sit with their backs to each other.`, [
          { id: 'reconcile', label: 'One table ($3,000)', detail: 'A dinner nobody can refuse, an envelope for each side.', because: 'sat both camps at one table', effects: [{ type: 'money', amount: -3000, category: 'event' }, { type: 'crewOpinion', amount: 4, reason: 'One family again' }], disabled: s.money < 3000 ? 'Not enough money' : undefined },
          { id: 'let_go', label: 'Let the other table go', detail: 'Their capos walk out with their crews. Maybe they come back.', because: `let ${b.firstName}'s people go`, effects: [note('The other camp leaves the family')] },
          { id: 'crush', label: `Break ${b.firstName}'s camp`, detail: 'Send him away. Loud.', because: `broke ${b.firstName}'s camp`, effects: [{ type: 'heat', bar: 'local', amount: 5 }, note(`${b.firstName} is sent away`)], disabled: b.dynasty || b.id === s.playerId ? 'Not your own blood' : undefined },
          { id: 'mediate', label: cons ? `${N(s, cons.id)} mediates` : 'Find a mediator', detail: 'Six in ten it holds.', because: 'asked the consigliere to mediate', effects: [note('60%: the family holds together')] },
        ], a.id);
    },
    choose: (ctx, st, c) => {
      const s = ctx.s;
      const sh = ensureShadow(s);
      st.known = true;
      if (st.stage === 1) {
        const sp = sh.splinters.find((x) => x.id === st.cast.splinter);
        if (c === 'home' && sp) {
          reunite(ctx, sp.id);
          return end(ctx, st, 'reunited', 'The men who walked out came home.', [sp.leaderId]);
        }
        return end(ctx, st, 'split for good', 'The family stayed split.', sp ? [sp.leaderId] : []);
      }
      const a = s.characters[st.cast.a];
      const b = s.characters[st.cast.b];
      if (!a?.alive || !b?.alive) return end(ctx, st, 'moot', 'One of the two men is gone.');
      const split = () => {
        const goers = backersOf(s, b.id).filter((m) => m.rank === 'capo' && !m.dynasty);
        const lead = !b.dynasty && b.id !== s.playerId && b.faction === 'player' ? b : goers[0];
        if (!lead) return false;
        const out = defectTo(ctx, lead, undefined, 'desert');
        const ids = [lead.id, ...out.map((x) => x.id)];
        for (const g of goers) if (g.id !== lead.id && g.faction === 'player') { const more = defectTo(ctx, g, undefined, 'desert'); ids.push(g.id, ...more.map((x) => x.id)); }
        const sp = { id: `spl${s.nextId++}`, leaderId: lead.id, memberIds: Array.from(new Set(ids)), week: s.week };
        sh.splinters.push(sp);
        st.cast.splinter = sp.id;
        return true;
      };
      if (c === 'reconcile') return end(ctx, st, 'held together', 'The Don sat both camps at one table, and it held.', [a.id, b.id]);
      if (c === 'crush' && !b.dynasty && b.id !== s.playerId) {
        applyEffects(ctx, [{ type: 'exile', charId: b.id }], { label: 'Broke the other camp', because: `broke ${b.firstName}'s camp` });
        return end(ctx, st, 'crushed', `${displayName(b)}'s camp was broken and he was sent away.`, [a.id, b.id]);
      }
      if (c === 'mediate' && theCons(s) && chance(sh, 0.6)) return end(ctx, st, 'mediated', 'The consigliere found words both camps could swallow.', [a.id, b.id]);
      if (split()) {
        st.stage = 1;
        st.next = s.week + 52;
        st.log.push({ week: s.week, text: `${displayName(b)}'s camp walked out.` });
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The family split: ${displayName(b)}'s camp walked out.`, kind: 'family' });
        return;
      }
      end(ctx, st, 'held together', 'Nobody walked out. Nobody forgot either.', [a.id, b.id]);
    },
  },
};

export const TEMPLATES: Record<TemplateId, { name: string; blurb: string }> = Object.fromEntries(Object.entries(TPL).map(([k, v]) => [k, { name: v.name, blurb: v.blurb }])) as Record<TemplateId, { name: string; blurb: string }>;
export const TEMPLATE_IDS = Object.keys(TPL) as TemplateId[];

/** Bring a splinter back (a story's answer and an order). */
export function reunite(ctx: Ctx, splinterId: string): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const sp = sh.splinters.find((x) => x.id === splinterId);
  if (!sp || sp.back) return;
  sp.back = s.week;
  for (const id of sp.memberIds) {
    const c = s.characters[id];
    if (!c?.alive || c.faction !== 'none') continue;
    c.faction = 'player';
    addOpinion(s, c.id, s.playerId, 'Took us back', 10, 1);
  }
}

/** The family council: every capo shows his face (the Don learns where each stands, as a rumor). */
export function councilReveal(s: GameState, via: string): number {
  const sh = ensureShadow(s);
  sh.council = s.week;
  let n = 0;
  for (const m of members(s)) {
    if (m.rank !== 'capo' && m.rank !== 'underboss' && m.rank !== 'consigliere') continue;
    const p = sh.plans[m.id];
    // Men who back the declared heir say so; the others hedge (sometimes convincingly).
    const hedge = p?.prefer && p.prefer !== declaredHeir(s)?.id && chance(sh, 0.4);
    seeBacking(s, m.id, hedge ? declaredHeir(s)?.id : p?.prefer, 'rumor', via, hedge ? 'support_heir' : p?.goal);
    n++;
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* The engine for stories                                              */
/* ------------------------------------------------------------------ */

export function storyName(t: TemplateId): string {
  return TPL[t].name;
}

function startStory(s: GameState, tpl: TemplateId, cast: Record<string, string>): ShStory {
  const sh = ensureShadow(s);
  const st: ShStory = { id: `sst${s.nextId++}`, tpl, stage: 0, since: s.week, next: s.week, cast: { ...cast, don: s.playerId }, known: false, log: [{ week: s.week, text: 'Began.' }] };
  sh.stories.push(st);
  sh.stats.stories++;
  return st;
}

const CAST_PEOPLE = ['ub', 'capo', 'heir', 'young', 'to', 'maker', 'pick', 'favor', 'cons', 'spokes', 'a', 'b', 'old'];

function storiesWeek(ctx: Ctx): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const live = sh.stories.filter((x) => !x.ended);
  for (const st of live) {
    if (st.waiting) {
      const open = s.pendingEvents.some((e) => e.iid === st.waiting!.iid) || s.eventQueue.some((e) => e.iid === st.waiting!.iid);
      if (!open && s.week - st.waiting.since >= 1) {
        // Dropped or never answered: it resolves its own way.
        const w = st.waiting;
        st.waiting = undefined;
        if (s.week - w.since >= 6 || !open) TPL[st.tpl].choose(ctx, st, TPL[st.tpl].def);
      }
      continue;
    }
    if (st.next > s.week) continue;
    // Somebody the story needs is gone (or left the family): it ends there.
    const gone = Object.entries(st.cast).find(([k, id]) => CAST_PEOPLE.includes(k) && id && (!s.characters[id]?.alive || (k !== 'heir' && k !== 'favor' && k !== 'old' && s.characters[id].faction !== 'player')));
    if (gone) { end(ctx, st, 'moot', `${N(s, gone[1])} is no longer part of it.`); continue; }
    const ev = TPL[st.tpl].beat(ctx, st);
    if (ev && !st.ended) {
      st.known = true;
      st.waiting = { iid: ev.iid, since: s.week };
      st.log.push({ week: s.week, text: ev.title });
      s.eventQueue.push(ev);
    }
    if (s.gameOver) return;
  }
  // New stories, once a month, two at a time at most.
  const mk = monthKey(s.date);
  if (sh.cool.month === hashMonth(mk)) return;
  sh.cool.month = hashMonth(mk);
  if (sh.stories.filter((x) => !x.ended).length >= 2) return;
  for (const tpl of TEMPLATE_IDS) {
    if (sh.stories.some((x) => x.tpl === tpl && !x.ended)) continue;
    if (s.week - (sh.cool[tpl] ?? -999) < 78) continue;
    const def = TPL[tpl];
    const cast = def.trigger?.(s);
    if (!cast) continue;
    startStory(s, tpl, cast);
    break;
  }
  if (sh.stories.length > 40) sh.stories = [...sh.stories.filter((x) => !x.ended), ...sh.stories.filter((x) => x.ended).slice(-30)];
}

function hashMonth(mk: string): number {
  let h = 0;
  for (const ch of mk) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

/** The Don's answer to a story beat (effect op). */
export function storyChoice(ctx: Ctx, id: string, choice: string): void {
  const sh = ensureShadow(ctx.s);
  const st = sh.stories.find((x) => x.id === id);
  if (!st || st.ended) return;
  st.waiting = undefined;
  st.known = true;
  TPL[st.tpl].choose(ctx, st, choice);
}

/* ------------------------------------------------------------------ */
/* The transition: the chair changes hands                             */
/* ------------------------------------------------------------------ */

function transition(ctx: Ctx, oldId: string): void {
  const s = ctx.s;
  const sh = ensureShadow(s);
  const old = s.characters[oldId];
  const boss = player(s);
  if (!old || !boss) return;
  const why: ShSuccession['why'] = !old.alive ? 'death' : old.alive ? 'retire' : 'other';
  const shares = support(s).shares;
  const ub = theUb(s);
  const bossShare = shares[boss.id] ?? 0;
  let outcome: SuccessionOutcome = 'peaceful';
  const notes: string[] = [];
  const wasUb = sh.ubWas === boss.id;
  // Whoever had promises "when the old man steps down" now holds them against the new boss.
  for (const p of sh.promises) {
    if (p.status !== 'outstanding') continue;
    if (p.maker === oldId && p.to === boss.id) { p.status = 'fulfilled'; p.settled = s.week; continue; }
    if (p.maker === oldId) { p.status = 'disputed'; notes.push(`${N(s, p.to)} holds a promise from the old Don`); }
  }
  if (wasUb) {
    outcome = 'ub_succeeded';
    const passed = bloodHeir(s);
    if (passed && passed.id !== boss.id && (shares[passed.id] ?? 0) >= 30) startStory(s, 'split_family', { a: boss.id, b: passed.id });
  } else if (ub && ub.id !== boss.id) {
    const goal = ubGoal(s, ub);
    const ubShare = shares[ub.id] ?? 0;
    const young = ageOn(boss.birth, s.date) < 23;
    if (goal === 'kingmaker') {
      outcome = 'kingmaker';
      setAuthority(s, 'shadow');
      remember(s, ub.id, `Could have taken the chair when ${N(s, oldId)} went. Put ${N(s, boss.id)} in it instead, and kept the decisions.`);
      const st = startStory(s, 'real_leader', { ub: ub.id, kingmade: '1' });
      st.next = s.week + 8;
    } else if (goal === 'become_boss' && ubShare >= 55 && bossShare < 30) {
      outcome = 'usurped';
      depose(ctx, ub.id, `the underboss took the family before ${N(s, oldId)} was buried`);
    } else if (goal === 'become_boss' && ubShare >= bossShare - 5 && ubShare >= 25) {
      outcome = 'contested';
      newFaction(ctx, ub, backersOf(s, ub.id).map((m) => m.id), 'abdicate', `${ub.firstName} ${ub.lastName}'s claim`);
      startStory(s, 'split_family', { a: boss.id, b: ub.id });
      changeMeter(s, ub.id, boss.id, 'grievance', 25);
    } else if (goal === 'get_out' && bossShare >= 40) {
      outcome = 'ub_retired';
      ub.rank = 'civilian';
      ub.faction = 'none';
      s.council.underboss = { ...s.council.underboss, holderId: undefined };
      remember(s, ub.id, `Retired with the old Don, as he always said he would.`);
    } else if (young) {
      outcome = 'acting';
      sh.actingUntil = s.week + 52;
      notes.push(`${N(s, ub.id)} acts for the young boss`);
    } else {
      if (goal === 'become_boss') changeMeter(s, ub.id, boss.id, 'grievance', 20);
      addOpinion(s, ub.id, boss.id, goal === 'serve' ? 'Served his father; will serve him' : 'Watching the new boss', goal === 'serve' ? 10 : -5, 1);
    }
  }
  // Capos who wanted someone else and cannot stand the new boss.
  if (outcome !== 'usurped') {
    for (const k of capos(s)) {
      const pref = sh.plans[k.id]?.prefer;
      if (!pref || pref === boss.id || k.dynasty || !isFree(s, k)) continue;
      if (opinion(s, k.id, boss.id) < -30 && pref === k.id && chance(sh, 0.5)) {
        const out = defectTo(ctx, k, undefined, 'desert');
        sh.splinters.push({ id: `spl${s.nextId++}`, leaderId: k.id, memberIds: [k.id, ...out.map((x) => x.id)], week: s.week });
        if (outcome === 'peaceful') outcome = 'split';
        notes.push(`${N(s, k.id)} walked out with his crew`);
      }
    }
  }
  const sup: Record<string, number> = {};
  for (const id of [boss.id, ub?.id, bloodHeir(s)?.id].filter((x): x is string => !!x)) sup[id] = shares[id] ?? 0;
  const OUT: Record<SuccessionOutcome, string> = {
    peaceful: 'a peaceful succession', kingmaker: `${N(s, ub?.id)} put him in the chair and kept the decisions`, contested: `${N(s, ub?.id)} contests it`, usurped: `${N(s, ub?.id)} took the family`,
    split: 'part of the family walked out', acting: `${N(s, ub?.id)} acts for him`, ub_retired: `${N(s, ub?.id)} retired with the old Don`, ub_succeeded: 'the underboss took the chair by right',
  };
  const text = `${N(s, oldId)} → ${N(s, boss.id)} (${why === 'death' ? 'after a death' : 'a retirement'}): ${OUT[outcome]}${notes.length ? `; ${notes.join('; ')}` : ''}. ${bossShare}% of the family was behind him.`;
  sh.successions.push({ week: s.week, fromId: oldId, toId: boss.id, why, outcome, ...(ub ? { ubId: ub.id } : {}), support: sup, text });
  sh.stats.successions++;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The succession: ${text}`, kind: 'succession' });
  ctx.log.push(`The succession: ${text}`);
  remember(s, boss.id, `Took the chair from ${N(s, oldId)}: ${OUT[outcome]}.`);
  // The new Don's own view: what he saw from the inside (his own backers he knows; the rest he must learn).
  sh.views = {};
  for (const m of backersOf(s, boss.id)) seeBacking(s, m.id, boss.id, 'confirmed', 'stood with him at the funeral');
  // Plans re-weigh around the new boss next month; the old pending petitions go stale.
  sh.pending = [];
  void knowers;
  void involvement;
  void crew;
  void hasTrait;
  void pw;
}

registerShadowHooks(storiesWeek, transition);

/* ------------------------------------------------------------------ */
/* The Ears hear about the court                                       */
/* ------------------------------------------------------------------ */

/** An Ear who has heard about the underboss's meetings comes to the Don (one popup now and then). */
export function shadowEarsSource(s: GameState): EventInstance | undefined {
  const sh = s.shadow;
  if (!sh || !s.ears || s.week - (sh.cool.ears ?? -99) < 8) return undefined;
  if (hashSeed(`${s.seed}:${s.week}:shadowears`) % 100 >= 22) return undefined;
  const ears = knownEars(s).filter((e) => e.status === 'listening').sort((a, b) => b.loyalty - a.loyalty);
  const ub = theUb(s);
  if (!ears.length || !ub) return undefined;
  const rec = [...sh.sessions.filter((x) => x.presiding === ub.id && s.week - x.week <= 52).map((x) => x.id), ...sh.promises.filter((p) => p.maker === ub.id && p.status === 'outstanding').map((p) => p.id)]
    .filter((id) => !sh.know[s.playerId]?.[id]).pop();
  if (!rec) return undefined;
  sh.cool.ears = s.week;
  const ear = ears[0];
  const her = s.characters[ear.id];
  const U = nameOf(s, ub.id);
  const learnOp = (lvl: 'rumor' | 'confirmed'): Effect => ({ type: 'power', op: { op: 'shadow', o: { op: 'learn', recId: rec, lvl, via: `${her.firstName} (an Ear)` } }, label: 'What the Ear heard' });
  const isPromise = rec.startsWith('sp');
  return {
    iid: `ev${s.nextId++}`, defId: 'shadow_ears', week: s.week, mandatory: false, priority: 58, title: 'What the Ear Heard', meta: { who: ear.id }, actors: [ear.id, ub.id],
    text: `${displayName(her)} finds you between sets. "Your underboss tips like a man who is celebrating. ${isPromise ? `He was telling somebody what he would give him one day.` : `He had men at his table again, and it wasn't to play cards.`} You want the rest?"`,
    defaultChoiceId: 'listen',
    choices: [
      { id: 'pay', label: 'Pay to hear it all ($200)', because: `paid ${her.firstName} for what she heard about ${U}`, effects: [{ type: 'money', amount: -200, category: 'event' }, { type: 'ears', op: { op: 'paid', earId: ear.id, amount: 200 }, label: 'Paid the Ear' } as Effect, learnOp('confirmed')] },
      { id: 'listen', label: 'Keep listening', detail: 'You take the gist; she keeps her ears open.', because: `told ${her.firstName} to keep listening`, effects: [learnOp('rumor')] },
      { id: 'brush', label: 'Not interested', because: `brushed off ${her.firstName}`, effects: [{ type: 'ears', op: { op: 'brush', earId: ear.id }, label: 'Brushed off the Ear' } as Effect] },
    ],
  };
}
registerEventSource(shadowEarsSource);
