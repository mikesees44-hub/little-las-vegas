import { crew, isFree } from './characters';
import { audienceView, declaredHeir, donKnows, knownSessions, nameOf, pressure, theUb } from './shadow';
import { shadowView } from './shadowState';
import type { Character, GameState, PlayerAction } from './types';

/**
 * The shadow court at the Sit-Down (briefing.ts): the underboss brings what
 * he chose to raise; the consigliere brings what he has heard about the
 * underboss's court and the promises going around; a loyal capo brings a
 * promise somebody made him. Every option is a real order. Pure.
 */

interface Opt { id: string; label: string; action?: PlayerAction; link?: { tab: string }; why: string; bonus?: number }
export interface ShadowDraft {
  id: string;
  charId?: string;
  priority: number;
  topic: string;
  says: string[];
  opts: (Opt | undefined)[];
  about?: string[];
  open?: { label: string; link: { tab: string } };
}

const sh = (a: import('./shadowState').ShadowAction): PlayerAction => ({ kind: 'power', op: { op: 'shadow', a } });
const wait = (why = 'Let it ride a week.'): Opt => ({ id: 'wait', label: 'Not now', why });
const open = { label: 'Open the succession', link: { tab: 'court' } };

export function shadowDrafts(s: GameState, role: 'underboss' | 'consigliere' | 'capo', c: Character | undefined): ShadowDraft[] {
  if (!c || !s.shadow) return [];
  const S = shadowView(s);
  const out: ShadowDraft[] = [];
  if (role === 'underboss') {
    // What he chose to bring the Don himself.
    for (const r of S.raised.filter((x) => s.week - x.week <= 2).slice(-1)) {
      const ses = S.sessions.find((x) => x.id === r.sessionId);
      const pet = ses?.petitions.find((p) => p.id === r.petId);
      const m = pet ? s.characters[pet.by] : undefined;
      if (!pet || !m?.alive) continue;
      out.push({
        id: `raised:${pet.id}`, charId: m.id, priority: 650, topic: `${nameOf(s, m.id)}'s petition`, about: [m.id], open,
        says: [`${pet.text}. He came to me; I told him I'd bring it to you.`, `${nameOf(s, m.id)} asked me something that's yours to answer: ${pet.text.replace(/^\S+ /, '')}.`],
        opts: [
          { id: 'meet', label: 'See him yourself', action: sh({ op: 'meet', charId: m.id }), why: 'he asked for the boss; let him see the boss', bonus: 300 },
          { id: 'reward', label: 'Take care of him', action: sh({ op: 'reward', charId: m.id }), why: 'an envelope settles most things' },
          { id: 'auth', label: 'Let the underboss decide these', action: sh({ op: 'authority', level: 'operational' }), why: 'saves you the time — and gives him the men' },
          wait(),
        ],
      });
    }
    return out;
  }
  if (role === 'consigliere') {
    const ub = theUb(s);
    const known = ub ? knownSessions(s).filter((x) => x.ses.presiding === ub.id && s.week - x.ses.week <= 26) : [];
    if (ub && known.length) {
      const a = audienceView(s, 8);
      const planted = S.plant && !S.plant.blown && S.plant.until >= s.week;
      const plantMan = crew(s).filter((m) => m.rank === 'soldier' && isFree(s, m) && m.id !== ub.id).sort((x, y) => x.id.localeCompare(y.id))[0];
      out.push({
        id: 'court', charId: ub.id, priority: 500 + known.length * 60 + (known.some((x) => x.ses.auth === 'unauthorized') ? 300 : 0), topic: `${nameOf(s, ub.id)}'s court`, open,
        says: [
          `${nameOf(s, ub.id)} is holding his own court. ${known.length} meeting${known.length > 1 ? 's' : ''} I know of. ${a.don} petitions came to you in two months; at least ${a.ubKnown} went to him.`,
          `Men are going to ${nameOf(s, ub.id)} instead of you. Not a crime. Not nothing either.`,
        ],
        opts: [
          { id: 'report', label: 'Ask him for a full report', action: sh({ op: 'report' }), why: 'see what he chooses to leave out' },
          !planted && plantMan ? { id: 'plant', label: `Put ${nameOf(s, plantMan.id)} at his table`, action: sh({ op: 'plant', kind: 'man', id: plantMan.id }), why: 'you will know what is said in the room' } : undefined,
          { id: 'confront', label: 'Confront him', action: sh({ op: 'confront' }), why: 'make him say it to your face' },
          wait('Watch it a while longer.'),
        ],
      });
    }
    const pr = S.promises.find((p) => p.status === 'outstanding' && p.maker !== s.playerId && donKnows(s, p.id) === 'rumor' && s.characters[p.to]?.alive);
    if (pr) out.push({
      id: `promise:${pr.id}`, charId: pr.to, priority: 700, topic: 'A promise going around', about: [pr.to], open,
      says: [`They say ${nameOf(s, pr.maker)} promised ${nameOf(s, pr.to)} ${pr.role}. Nobody asked you.`, `${nameOf(s, pr.to)} talks like a man who was promised ${pr.role}. By ${nameOf(s, pr.maker)}, I hear.`],
      opts: [
        { id: 'meet', label: `Meet ${nameOf(s, pr.to)}`, action: sh({ op: 'meet', charId: pr.to }), why: 'hear it from him' },
        { id: 'test', label: `Test ${nameOf(s, pr.to)}`, action: sh({ op: 'test', charId: pr.to }), why: 'find out who he really backs' },
        wait(),
      ],
    });
    const pr0 = pressure(s).score;
    if (pr0 >= 55 && !declaredHeir(s)) out.push({
      id: 'noheir', priority: 600 + pr0 * 4, topic: 'After you', open,
      says: ['The capos ask me who comes after you. I have no answer for them.', 'Nobody knows who is next. That is how families split.'],
      opts: [{ id: 'council', label: 'Hold a family council', action: sh({ op: 'council' }), why: 'one table, everybody sees where everybody stands' }, wait()],
    });
    return out;
  }
  // A capo who was promised something says so, if he is loyal to the Don.
  const pr = S.promises.find((p) => p.to === c.id && p.status === 'outstanding' && p.maker !== s.playerId && donKnows(s, p.id) === 'unknown');
  if (pr && (S.plans[c.id]?.prefer !== pr.maker)) out.push({
    id: `mine:${pr.id}`, charId: c.id, priority: 550, topic: 'Something I was told', about: [c.id], open,
    says: [`${nameOf(s, pr.maker)} told me I'd have ${pr.role} ${pr.condition}. I figured you should hear it from me.`],
    opts: [
      { id: 'meet', label: 'Sit down with him', action: sh({ op: 'meet', charId: c.id }), why: 'he came to you first; that is worth something', bonus: 200 },
      { id: 'honor', label: 'Tell him it holds', action: sh({ op: 'honor', promiseId: pr.id }), why: 'he keeps his faith in you' },
      wait(),
    ],
  });
  return out;
}
