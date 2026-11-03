import { displayName } from '../characters';
import { fmtMoney } from '../effects';
import { bossWord, pr } from '../pronouns';
import type { Choice, Effect, EventInstance, GameState } from '../types';
import { ensureDeeds } from './state';
import type { Ask, DeedId } from './types';

/**
 * THE ASKS AT THE BOSS'S DOOR. What the NPCs' own deeds want from the boss
 * (a capo asks a favor, a rival boss proposes a pact, a man asks to borrow,
 * an insult wants an answer, two of his men are at each other's throats,
 * someone has been calling on his wife) reaches him as ONE popup a week at
 * most, through the same pipeline and the story director's caps as
 * everything else (template `deed_<kind>`). Each answer is plain Effects.
 */

const ans = (k: Ask): Effect => ({ type: 'deed', op: { op: 'answered', ask: k.id } });
const op = (from: string, to: string, amount: number, reason: string, decay = 1): Effect => ({ type: 'opinion', from, to, amount, reason, decay });
const deed = (id: DeedId, a: string, t: string): Effect => ({ type: 'deed', op: { op: 'npcDeed', id, a, t } });

function choice(id: string, label: string, detail: string, because: string, effects: Effect[]): Choice {
  return { id, label, detail, because, effects };
}

/** The popup for one ask (undefined if its people are gone). */
export function buildAsk(s: GameState, k: Ask): EventInstance | undefined {
  const a = s.characters[k.a];
  const B = s.playerId;
  if (!a?.alive) return undefined;
  const t = k.t ? s.characters[k.t] : undefined;
  const an = displayName(a);
  // Her, not his, for a woman; a man's own daughter does not call him "Boss".
  const P = pr(a);
  const n = k.n ?? 0;
  const rival = s.rivals.find((r) => r.leaderId === a.id);
  let title = '';
  let text = '';
  let choices: Choice[] = [];
  let theme = a.faction === 'player' ? 'crew' : rival ? 'rivals' : 'town';
  switch (k.d) {
    case 'askFavor':
      title = `${a.firstName} asks a favor`;
      text = `${an} comes in ${a.gender === 'F' ? 'with her gloves in her hands' : 'with his hat in his hands'}. "${bossWord(s, a)}, I wouldn't ask. ${fmtMoney(n)}, and a word in the right ear: my brother-in-law's trouble with the county. I won't forget it."`;
      choices = [
        choice('grant', `Do it (${fmtMoney(n)})`, `${P.He} owes you one, and ${P.he} knows it.`, `did ${a.firstName} a favor`, [{ type: 'money', amount: -n }, op(a.id, B, 12, 'The boss came through for me'), { type: 'deed', op: { op: 'owe', by: a.id, to: B, y: 'The boss came through' } }, ans(k)]),
        choice('remind', `Do it, and remind ${P.him} what it means (${fmtMoney(n)})`, `${P.He} owes you, and ${P.he} is a little afraid of how much.`, `did ${a.firstName} a favor with strings`, [{ type: 'money', amount: -n }, op(a.id, B, 6, 'The boss came through, with strings'), { type: 'meter', from: a.id, to: B, meter: 'fear', amount: 6 }, { type: 'deed', op: { op: 'owe', by: a.id, to: B, y: 'A favor with strings' } }, ans(k)]),
        choice('no', 'Not this time', `${P.He} swallows it. ${P.He} remembers.`, `turned ${a.firstName} down`, [op(a.id, B, -8, 'The boss turned me down when I needed him'), ans(k)]),
      ];
      break;
    case 'askLoan':
      title = `${a.firstName} needs a loan`;
      text = `${an} needs ${fmtMoney(n)}, ${P.he} says, for twelve weeks, with the usual on top. ${P.He} looks like a ${P.man} who has already spent it.`;
      choices = [
        choice('lend', `Lend it (${fmtMoney(n)}, back with 10% in 12 weeks)`, `If ${P.he} has it then.`, `lent ${a.firstName} money`, [{ type: 'money', amount: -n }, { type: 'wealth', charId: a.id, amount: n }, { type: 'deed', op: { op: 'loan', by: B, to: a.id, amt: Math.round(n * 1.1), due: s.week + 12 } }, op(a.id, B, 10, 'Lent me money when I needed it'), ans(k)]),
        choice('half', `Lend half (${fmtMoney(Math.round(n / 2))})`, 'Something, not everything.', `lent ${a.firstName} half`, [{ type: 'money', amount: -Math.round(n / 2) }, { type: 'wealth', charId: a.id, amount: Math.round(n / 2) }, { type: 'deed', op: { op: 'loan', by: B, to: a.id, amt: Math.round(n * 0.55), due: s.week + 12 } }, op(a.id, B, 3, 'Helped, some'), ans(k)]),
        choice('no', 'The bank is closed', `${P.He} will find it somewhere else, maybe somewhere worse.`, `refused ${a.firstName} a loan`, [op(a.id, B, -8, 'Would not lend me a dime'), ans(k)]),
      ];
      break;
    case 'alliance':
      title = `${a.firstName} proposes ${rival ? 'a pact' : 'an understanding'}`;
      text = `${an} sends word: ${rival ? `${rival.name} and your people should watch each other's backs, not each other's corners.` : 'the two of you should look out for each other.'} ${P.He} is waiting for your answer.`;
      theme = rival ? 'rivals' : 'crew';
      choices = [
        choice('yes', 'Shake on it', 'An ally. Allies get called on.', `made a pact with ${a.firstName}`, [{ type: 'deed', op: { op: 'tie', a: a.id, b: B, k: 'ally', y: 'Shook on a pact' } }, op(a.id, B, 12, 'We have an understanding'), ...(rival ? [{ type: 'rivalOpinion', rival: rival.id, amount: 15, reason: 'A pact between our houses' } as Effect] : []), ans(k)]),
        choice('no', `Thank ${P.him}, and say no`, 'Politely.', `declined ${a.firstName}'s pact`, [op(a.id, B, -4, 'Turned down my hand'), ans(k)]),
        choice('insult', 'Laugh at it', `${P.He} will hear how you laughed.`, `laughed at ${a.firstName}'s offer`, [deed('insult', B, a.id), ans(k)]),
      ];
      break;
    case 'partner':
      title = `${a.firstName} wants to go partners`;
      text = `${an} has a deal: a vending route, a piece of a card game, ${P.his} money and yours, a monthly share each for a year.`;
      choices = [
        choice('yes', 'Put up $1,500', 'About $260 a month each, for a year, if it holds.', `went partners with ${a.firstName}`, [{ type: 'money', amount: -1500 }, { type: 'wealth', charId: a.id, amount: -1500 }, { type: 'deed', op: { op: 'partner', a: a.id, b: B, n: 260 } }, op(a.id, B, 10, 'We are partners'), ans(k)]),
        choice('no', 'You work alone', `${P.He} shrugs.`, `turned down ${a.firstName}'s deal`, [op(a.id, B, -3, 'Did not want my deal'), ans(k)]),
      ];
      break;
    case 'offerPiece':
      title = `${a.firstName} offers you a piece`;
      text = `${an} wants to cut you in on something of ${a.gender === 'F' ? 'hers' : 'his'}: ${fmtMoney(n)}, now, and goodwill after. Nobody gives the boss money for nothing.`;
      choices = [
        choice('take', `Take it (+${fmtMoney(n)})`, `You owe ${P.him} a little, now.`, `took a piece from ${a.firstName}`, [{ type: 'money', amount: n }, { type: 'wealth', charId: a.id, amount: -n }, { type: 'deed', op: { op: 'owe', by: B, to: a.id, y: 'Took my money' } }, op(a.id, B, 6, 'The boss took my offer'), ans(k)]),
        choice('no', `Tell ${P.him} to keep it`, `${P.He} wanted something for it. Now ${P.he} will have to ask.`, `turned down ${a.firstName}'s money`, [op(a.id, B, -3, 'The boss turned up his nose'), ans(k)]),
      ];
      break;
    case 'demandRespect':
      title = `${a.firstName} wants your respect, in public`;
      text = `${an} sends word you are to pay your respects at ${P.his} table, in front of ${P.his} people. ${rival ? `${rival.name} is watching how you answer.` : ''}`;
      theme = rival ? 'rivals' : 'crew';
      choices = [
        choice('bow', 'Go, and pay them', 'Peace has a price.', `paid respects to ${a.firstName}`, [{ type: 'respect', amount: -2 }, ...(rival ? [{ type: 'rivalOpinion', rival: rival.id, amount: 12, reason: 'Showed us respect' } as Effect] : []), op(a.id, B, 10, 'Knows his place'), ans(k)]),
        choice('no', 'Do not go', `${P.He} will take it as an answer.`, `refused ${a.firstName}'s summons`, [...(rival ? [{ type: 'rivalOpinion', rival: rival.id, amount: -8, reason: 'Snubbed us' } as Effect] : []), op(a.id, B, -10, 'Snubbed me'), ans(k)]),
        choice('insult', `Send back an answer ${P.he} will not like`, `Words, in front of ${P.his} people.`, `answered ${a.firstName} with an insult`, [deed('insult', B, a.id), ans(k)]),
      ];
      break;
    case 'insult':
      title = `${a.firstName} insulted you`;
      text = `${k.y ?? `${an} said something about you.`} The whole boardwalk is waiting to see what you do.`;
      choices = [
        choice('let', 'Let it go', 'A boss above it. Some will call it weakness.', `let ${a.firstName}'s insult go`, [{ type: 'respect', amount: -1 }, ans(k)]),
        choice('answer', 'Answer in kind', 'An insult for an insult.', `answered ${a.firstName}'s insult`, [deed('insult', B, a.id), ans(k)]),
        choice('word', `Have a word with ${P.him}`, 'A threat, in private.', `threatened ${a.firstName}`, [deed('threaten', B, a.id), ans(k)]),
      ];
      break;
    case 'wife': {
      const w = t ?? s.characters[s.characters[B]?.spouseId ?? ''];
      if (!w?.alive) return undefined;
      title = `${a.firstName} has been calling on ${w.firstName}`;
      text = `${k.y ?? ''} People notice when ${an} stops by the house with flowers for your wife while you are at the club.`;
      theme = 'family';
      choices = [
        choice('warn', `Warn ${P.him} off`, 'Plainly.', `warned ${a.firstName} off`, [deed('threaten', B, a.id), ans(k)]),
        choice('ask', `Ask ${w.firstName} about it`, 'She may not like being asked.', `asked ${w.firstName} about ${a.firstName}`, [op(w.id, B, -4, 'Does not trust me'), op(w.id, a.id, -6, 'Made trouble at home'), ans(k)]),
        choice('let', 'Let it be', 'Friendly is friendly.', `let it be`, [ans(k)]),
      ];
      break;
    }
    case 'clash': {
      if (!t?.alive) return undefined;
      const [kind, why] = (k.y ?? 'rival:').split(':');
      const tn = displayName(t);
      if (kind === 'friend') {
        title = `${a.firstName} is friendly with ${t.firstName}`;
        text = `${an} has been seen at ${tn}'s table more than once. ${why}. ${a.gender === 'F' ? 'A woman' : 'A man'} of yours close to a rival boss is a door: it opens both ways.`;
        theme = 'rivals';
        choices = [
          choice('use', `Use it: send messages through ${P.him}`, 'Talk is cheaper than war.', `used ${a.firstName}'s friendship`, [...(s.rivals.find((r) => r.leaderId === t.id) ? [{ type: 'rivalOpinion', rival: s.rivals.find((r) => r.leaderId === t.id)!.id, amount: 6, reason: 'A friendly channel' } as Effect] : []), op(a.id, B, 6, 'The boss trusts me with this'), ans(k)]),
          choice('word', `Have a word with ${P.him}`, `Remind ${P.him} whose table ${P.he} eats at.`, `warned ${a.firstName} about ${t.firstName}`, [deed('threaten', B, a.id), { type: 'deed', op: { op: 'tie', a: a.id, b: t.id, y: '' } }, ans(k)]),
          choice('watch', `Have ${P.him} watched`, `Put a man on ${P.him}, quietly.`, `had ${a.firstName} watched`, [{ type: 'meter', from: B, to: a.id, meter: 'trust', amount: -10 }, { type: 'meter', from: a.id, to: B, meter: 'fear', amount: 5 }, ans(k)]),
        ];
      } else {
        title = kind === 'feud' ? `Blood between ${a.firstName} and ${t.firstName}` : `${a.firstName} and ${t.firstName} are at odds`;
        text = `${an} and ${tn} ${kind === 'feud' ? 'have gone past words' : 'cannot be in a room together'}. ${why}. The crew is picking sides.`;
        theme = 'crew';
        choices = [
          choice('peace', 'Sit them down together ($300)', 'Dinner, wine, the boss at the head of the table.', `made peace between ${a.firstName} and ${t.firstName}`, [{ type: 'money', amount: -300, pot: 'pocket' }, op(a.id, t.id, 15, 'The boss made us shake hands', 1), op(t.id, a.id, 15, 'The boss made us shake hands', 1), { type: 'deed', op: { op: 'tie', a: a.id, b: t.id, y: '' } }, ans(k)]),
          choice('a', `Side with ${a.firstName}`, `${t.firstName} will remember.`, `sided with ${a.firstName}`, [op(a.id, B, 10, 'The boss took my side'), op(t.id, B, -12, `The boss took ${pr(a).his} side over mine`), ans(k)]),
          choice('b', `Side with ${t.firstName}`, `${a.firstName} will remember.`, `sided with ${t.firstName}`, [op(t.id, B, 10, 'The boss took my side'), op(a.id, B, -12, `The boss took ${pr(t).his} side over mine`), ans(k)]),
          choice('let', 'Let them sort it out', 'Men settle things. Sometimes badly.', 'let them sort it out', [ans(k)]),
        ];
      }
      break;
    }
    default:
      return undefined;
  }
  return {
    iid: `ev${s.nextId++}`,
    defId: `deed_${k.d}`,
    title,
    text,
    week: s.week,
    choices,
    defaultChoiceId: choices[choices.length - 1].id,
    mandatory: false,
    priority: k.d === 'clash' || k.d === 'insult' ? 44 : 38,
    meta: { theme, charId: a.id, ask: k.id, ...(a.faction === 'player' ? { crew: 1 } : {}), ...(theme === 'family' ? { family: 1 } : {}) },
    actors: [a.id, ...(t ? [t.id] : [])],
  };
}

/** The event source: the oldest ask still standing, one a week. */
export function deedsEventSource(s: GameState): EventInstance | undefined {
  if (s.gameOver || !s.deeds) return undefined;
  const D = ensureDeeds(s);
  const pending = new Set(s.pendingEvents.map((e) => String(e.meta?.ask ?? '')));
  for (const k of [...D.asks].sort((x, y) => x.w - y.w || x.id.localeCompare(y.id))) {
    if (pending.has(k.id) || s.eventQueue.some((e) => e.meta?.ask === k.id)) continue;
    const ev = buildAsk(s, k);
    if (ev) return ev;
    D.asks = D.asks.filter((x) => x !== k);
  }
  return undefined;
}
