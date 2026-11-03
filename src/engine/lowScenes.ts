import { displayName, player } from './characters';
import { beat, hit, registerMinigame, type MgOption, type MgSession, type MinigameDef } from './minigame';
import type { SceneCard } from './scenes';
import { stationOf, unlocksBetween } from './rankView';
import { above, aboveIds, callInOdds, chiefOf, donOf, nextRung, type LowOp } from './valente';
import type { Character, Effect, GameState } from './types';

/**
 * THE CLIMB AS SCENES (LOW START DESIGN stage 2): the player's own making,
 * with him as the candidate, and the sit-down where the boss moves him up.
 * Both are cinematic scenes in the mini-game framework (the same full-screen
 * noir cards as the old making). The odds sit on the options; the session's
 * own dice decide it while he watches; what changed goes in Your File.
 */

interface Beat { card: SceneCard; options: MgOption[] }
interface LowData { beats: Beat[]; i: number; card: SceneCard; fx: Effect[]; picks: string[]; p: number; ok?: boolean; title: string }
type SS = MgSession<LowData>;

const next = (label = 'Continue'): MgOption[] => [{ id: 'next', label }];
const lowFx = (o: LowOp): Effect => ({ type: 'power', op: { op: 'low', o } });
const pct = (p: number) => `${Math.round(Math.max(0.05, Math.min(0.95, p)) * 100)}%`;
const nm = (c: Character | undefined, f: string) => (c ? displayName(c) : f);

/** The odds fixed when the sit-down was set (so the turn replays exactly what he saw). */
function fixedP(s: GameState, ses: SS): number {
  const x = Number(ses.params.p);
  return Number.isFinite(x) && x > 0 ? x / 100 : callInOdds(s).chance;
}

function ring(s: GameState): Character[] {
  const a = above(s);
  return (a?.capoIds ?? []).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive);
}

function advance(ses: SS): void {
  ses.d.i += 1;
  ses.d.card = ses.d.beats[ses.d.i].card;
  ses.phase = `beat${ses.d.i + 1}`;
}

function options(_s: GameState, ses: SS): MgOption[] {
  return ses.d.beats[ses.d.i]?.options ?? next();
}

function auto(s: GameState, ses: SS): string {
  const o = options(s, ses).filter((x) => !x.disabled);
  const pref = ['next', 'w_wait', 'look_sponsor', 'oath_steady', 'ask_record'];
  return o.find((x) => pref.includes(x.id))?.id ?? o[0]?.id ?? 'next';
}

/* ------------------------------------------------------------------ */
/* Getting made: the player is the candidate                          */
/* ------------------------------------------------------------------ */

function madeBeats(s: GameState, ses: SS): Beat[] {
  const p = player(s);
  const a = above(s);
  const don = donOf(s);
  const sponsor = (a?.sponsors ?? []).map((id) => s.characters[id]).find((c) => c?.alive);
  const chief = chiefOf(s);
  const ub = a?.underbossId ? s.characters[a.underbossId] : undefined;
  const k = ring(s);
  const odds = ses.d.p;
  const envelope = 500;
  return [
    { card: { scene: 'street', kicker: 'The call', text: `The books are open, and your name is on a list in a back room you will never see. ${nm(sponsor, 'Your sponsor')} put it there. Somewhere tonight the capos are talking about you: what you earned, who you ran with, whether you can keep your mouth shut.\n\nThe phone at your mother's house is on the kitchen wall. You sit next to it.`, actors: [p.id, ...(sponsor ? [sponsor.id] : [])] }, options: [
      { id: 'w_wait', label: 'Wait by the phone.', detail: `${pct(odds)} the family says yes.` },
      { id: 'w_push', label: `Ask ${sponsor?.firstName ?? 'your sponsor'} to push for you.`, detail: `${pct(odds + 0.05)}. He spends something on you; his patience −3.` },
      { id: 'w_envelope', label: `An envelope through ${sponsor?.firstName ?? 'your sponsor'} for the old men ($${envelope}).`, detail: `${pct(odds + 0.08)}. It is noticed, and not everybody likes it.`, disabled: s.money < envelope ? `Needs $${envelope}` : undefined },
    ] },
    { card: { scene: 'street', kicker: 'The drive', text: `The phone rings at eleven. "Wear a suit. Corner of Pacific and Schellenger, nine tomorrow." ${nm(sponsor, 'Your sponsor')} picks you up in a Buick that smells of cigars. Nobody talks. Somewhere past the Rio Grande bridge you wonder, the way every one of them has wondered, whether this is the ride you come back from.`, actors: [p.id, ...(sponsor ? [sponsor.id] : [])] }, options: next() },
    { card: { scene: 'ceremony', kicker: 'The room', text: `The back of a closed restaurant in the Crest. Blinds down, one lamp. ${nm(don, 'The Don')} sits at the end of the table. The capos stand around it: ${k.map((x) => x.firstName).join(', ').replace(/, ([^,]*)$/, ' and $1') || 'men you have only heard about'}. On the cloth: a pistol, a knife, a holy card, a candle.\n\nNobody tells you where to look.`, actors: [p.id, ...(don ? [don.id] : []), ...k.slice(0, 3).map((x) => x.id)] }, options: [
      { id: 'look_don', label: `At ${don?.firstName ?? 'the Don'}.`, detail: 'Nerve. The Don notices (+5); some of the old men think it is too much.' },
      { id: 'look_sponsor', label: `At ${sponsor?.firstName ?? 'your sponsor'}.`, detail: `Loyalty. ${sponsor?.firstName ?? 'He'} +8.` },
      { id: 'look_floor', label: 'At the floor.', detail: `Humble. ${ub?.firstName ?? 'The underboss'} likes it (+5).` },
    ] },
    { card: { scene: 'ceremony', kicker: 'The oath', text: `${don?.firstName ?? 'The Don'} speaks and you say it after him, word for word. That this comes first now: before your blood, before your wife, before your own children. That when they call, you come. That what you see, you never saw.\n\nThe knife opens your trigger finger. A drop falls on the holy card, and he sets it alight in your cupped hands. You hold it while it burns. "If you betray us," he says, "you burn like this."`, actors: [p.id, ...(don ? [don.id] : [])] }, options: [
      { id: 'oath_steady', label: 'Hold it until it is ash. Say nothing.', detail: 'Respect +3.' },
      { id: 'oath_loud', label: 'Say the words again, louder.', detail: `The ring likes it; ${chief?.firstName ?? 'your capo'} +5.` },
      { id: 'oath_shake', label: 'Let them see your hands shake.', detail: `Honest. ${a?.consigliereId ? s.characters[a.consigliereId]?.firstName ?? 'The consigliere' : 'The consigliere'} trusts that (+6).` },
    ] },
    { card: { scene: 'ceremony', kicker: 'The kiss', text: `Each of them comes around the table and kisses you on both cheeks. ${nm(ub, 'The underboss')} says it first, to the room: "He's with us now."\n\n${chief ? `${chief.firstName} squeezes the back of your neck. "You're still with me. Don't forget who brought you."` : ''}`, actors: [p.id, ...(ub ? [ub.id] : []), ...(chief ? [chief.id] : [])] }, options: next() },
    { card: { scene: 'street', kicker: 'Outside', text: 'You light a cigarette with hands that will not quite stop. Across the street, a car you don\'t know has its lights off.', actors: [p.id] }, options: next('The end of the night') },
  ];
}

function madeStep(s: GameState, ses: SS, move: string): void {
  const d = ses.d;
  const a = above(s);
  const p = player(s);
  const don = donOf(s);
  const chief = chiefOf(s);
  const sponsor = (a?.sponsors ?? []).map((id) => s.characters[id]).find((c) => c?.alive);
  const add = (...xs: Effect[]) => d.fx.push(...xs.map((e) => ({ ...e, label: e.label ?? 'Getting made' })));
  const op = (from: string | undefined, amount: number, reason: string) => { if (from) add({ type: 'opinion', from, to: p.id, amount, reason, decay: 1 }); };
  if (move !== 'next') d.picks.push(move);
  if (d.i === 0) {
    let pr = d.p;
    if (move === 'w_push') { pr += 0.05; op(sponsor?.id, -3, 'Made me push for him'); }
    if (move === 'w_envelope') { pr += 0.08; add({ type: 'money', amount: -500 }); op(a?.consigliereId, -2, 'Sent money to the old men'); }
    d.ok = hit(ses, Math.max(0.05, Math.min(0.95, pr)));
    if (!d.ok) {
      beat(ses, 'The phone doesn\'t ring. In the morning your sponsor tells you: not this time.', 'bad');
      add(lowFx({ op: 'standing', by: -3, why: 'The books opened and your name did not come up' }), lowFx({ op: 'booksAsked' }));
      if (a?.rivalId && s.characters[a.rivalId]?.alive) beat(ses, `${s.characters[a.rivalId].firstName} is at the Shamrock that night, buying rounds. Nobody says why.`, 'bad');
      end(ses, `Not this time: ${pct(pr)} was the chance`, `The books opened and closed without you. Your sponsor says next time. Your standing took a knock.`, 'bad');
      return;
    }
    beat(ses, 'The phone rings at eleven.', 'good');
  }
  switch (move) {
    case 'look_don': op(don?.id, 5, 'Looked me in the eye at his making'); break;
    case 'look_sponsor': op(sponsor?.id, 8, 'Looked to me at his making'); break;
    case 'look_floor': op(a?.underbossId, 5, 'Knew his place at his making'); break;
    case 'oath_steady': add({ type: 'respect', amount: 3 }); break;
    case 'oath_loud': op(chief?.id, 5, 'Said the words like he meant them'); break;
    case 'oath_shake': op(a?.consigliereId, 6, 'His hands shook, and he let us see'); break;
  }
  if (d.i + 1 >= d.beats.length) {
    const fbi = hit(ses, 1 / 8);
    if (fbi) {
      add({ type: 'evidence', charId: p.id, amount: 4 });
      beat(ses, 'Across the street, the car with its lights off writes down a license plate.', 'bad');
    }
    for (const id of aboveIds(s)) if (id !== p.id && s.characters[id]?.alive && s.characters[id].rank !== 'associate') op(id, 3, 'A friend of ours now');
    if (a?.rivalId) op(a.rivalId, -10, 'Got made before me');
    add(lowFx({ op: 'promote', to: 'soldier', why: `Made in the ${a?.name ?? 'Valente'} family${sponsor ? `, with ${sponsor.firstName} standing for him` : ''}.` }));
    const can = unlocksBetween('associate', 'soldier');
    end(ses, 'A friend of ours', `You took the oath. You are a made man in the ${a?.name ?? 'Valente'} family${chief ? `, a soldier in ${chief.firstName}'s regime` : ''}.${can.length ? ` You can now: ${can.join('; ')}.` : ''}`, 'good');
    return;
  }
  if (move === 'next' || d.i > 0) beat(ses, d.card.text.split('\n\n')[0], 'info');
  advance(ses);
}

function end(ses: SS, title: string, text: string, tone: 'good' | 'bad'): void {
  ses.done = true;
  ses.phase = 'end';
  ses.outcome = { title, text, tone, effects: ses.d.fx };
}

export const GET_MADE: MinigameDef<LowData> = {
  id: 'getmade',
  init: (s, ses) => {
    const d: LowData = { beats: [], i: 0, card: { scene: 'street', kicker: '', text: '', actors: [] }, fx: [], picks: [], p: fixedP(s, ses), title: 'Getting made' };
    ses.d = d;
    d.beats = madeBeats(s, ses);
    d.card = d.beats[0].card;
    return { d, phase: 'beat1', intro: { title: 'Getting made', kicker: `The ${above(s)?.name ?? 'Valente'} family`, text: 'The books are open. Tonight the family decides whether you become one of them. The odds are on the table; then the ceremony, if it goes your way.', scene: 'ceremony' } };
  },
  options,
  step: madeStep,
  auto,
  odds: (s, ses) => callInOdds(s).reasons.slice(0, 6).map((r) => ({ label: r.label, value: `${r.value > 0 ? '+' : ''}${r.value}`, tone: r.value >= 0 ? 'good' as const : 'bad' as const })).concat([{ label: 'The chance', value: pct(ses.d.p), tone: 'good' as const }]),
};

/* ------------------------------------------------------------------ */
/* The boss calls you in: a promotion is a sit-down with odds          */
/* ------------------------------------------------------------------ */

const PLACES = ['the Boardwalk', 'Pacific Avenue', 'the piers', 'the Crest', 'Downtown'];

function callBeats(s: GameState, ses: SS): Beat[] {
  const p = player(s);
  const don = donOf(s);
  const a = above(s);
  const ub = a?.underbossId ? s.characters[a.underbossId] : undefined;
  const to = nextRung(stationOf(s)) ?? 'capo';
  const pr = ses.d.p;
  const env = to === 'underboss' ? 5000 : to === 'capo' ? 2500 : 1000;
  const place = PLACES[(s.week + p.id.length) % PLACES.length];
  return [
    { card: { scene: 'sitdown', kicker: 'The Doo Wop diner, seven a.m.', text: `${nm(don, 'The boss')} takes his coffee at the counter, the same stool every morning, his back to the wall. ${ub ? `${ub.firstName} sits two stools down reading the racing form and hearing every word.` : ''} He doesn't look up when you sit.\n\n"So," he says. "You think you're ready for more."`, actors: [p.id, ...(don ? [don.id] : []), ...(ub ? [ub.id] : [])] }, options: next() },
    { card: { scene: 'sitdown', kicker: 'What you say', text: `He wants to hear it from you. What you've done, what you bring in, why you and not somebody else. ${to === 'capo' ? `There is a crew on ${place} that needs a man.` : to === 'underboss' ? 'There is one chair next to his, and somebody is already sitting in it.' : ''}`, actors: [p.id, ...(don ? [don.id] : [])] }, options: [
      { id: 'ask_straight', label: '"Give me the chance. I won\'t let you down."', detail: `${pct(pr)}. If he says no, he remembers you asked (standing −4).` },
      { id: 'ask_record', label: 'Let your record talk. Say almost nothing.', detail: `${pct(pr - 0.08)}. If he says no, it costs you nothing.` },
      { id: 'ask_envelope', label: `Slide an envelope under the saucer ($${env.toLocaleString('en-US')}).`, detail: `${pct(pr + 0.1)}. The money is gone either way.`, disabled: s.money < env ? `Needs $${env.toLocaleString('en-US')}` : undefined },
    ] },
    { card: { scene: 'sitdown', kicker: 'His answer', text: 'He finishes the coffee. He puts down a dime for the girl, never more, never less.', actors: [p.id, ...(don ? [don.id] : [])] }, options: next('Stand up') },
  ];
}

function callStep(s: GameState, ses: SS, move: string): void {
  const d = ses.d;
  const p = player(s);
  const don = donOf(s);
  const st = stationOf(s);
  const to = nextRung(st) ?? 'capo';
  const add = (...xs: Effect[]) => d.fx.push(...xs.map((e) => ({ ...e, label: e.label ?? 'The sit-down' })));
  if (move !== 'next') d.picks.push(move);
  if (d.i === 1) {
    const env = to === 'underboss' ? 5000 : to === 'capo' ? 2500 : 1000;
    const pr = move === 'ask_record' ? d.p - 0.08 : move === 'ask_envelope' ? d.p + 0.1 : d.p;
    if (move === 'ask_envelope') add({ type: 'money', amount: -env });
    d.ok = hit(ses, Math.max(0.05, Math.min(0.95, pr)));
    d.p = pr;
    if (d.ok) {
      const what = to === 'capo' ? 'a crew' : to === 'underboss' ? 'the seat next to mine' : 'a little more';
      beat(ses, `"All right," ${don?.firstName ?? 'he'} says. "You've got ${what}. Don't make me sorry."`, 'good');
      add(lowFx({ op: 'promote', to, why: `${don?.firstName ?? 'The boss'} moved you up over coffee at the Doo Wop.` }));
      if (don) add({ type: 'opinion', from: don.id, to: p.id, amount: 5, reason: 'I gave him his chance', decay: 1 });
    } else {
      beat(ses, `"Not yet," ${don?.firstName ?? 'he'} says. "Keep doing what you're doing." It is not a no forever. It is a no today.`, 'bad');
      if (move === 'ask_straight') add(lowFx({ op: 'standing', by: -4, why: 'Asked to move up and was told not yet' }));
      if (move === 'ask_straight' && don) add({ type: 'opinion', from: don.id, to: p.id, amount: -3, reason: 'Wants too much too fast', decay: 1 });
    }
  }
  if (d.i + 1 >= d.beats.length) {
    const can = unlocksBetween(st, to);
    if (d.ok) end(ses, `Moved up: ${to}`, `${don ? displayName(don) : 'The boss'} said yes (${pct(d.p)}).${can.length ? ` You can now: ${can.join('; ')}.` : ''}`, 'good');
    else end(ses, 'Not yet', `${don ? displayName(don) : 'The boss'} said not yet (${pct(d.p)} was the chance). Ask again in eight weeks; meet your quota and your standing will carry it.`, 'bad');
    return;
  }
  advance(ses);
}

export const CALL_IN: MinigameDef<LowData> = {
  id: 'callin',
  init: (s, ses) => {
    const d: LowData = { beats: [], i: 0, card: { scene: 'sitdown', kicker: '', text: '', actors: [] }, fx: [], picks: [], p: fixedP(s, ses), title: 'The boss calls you in' };
    ses.d = d;
    d.beats = callBeats(s, ses);
    d.card = d.beats[0].card;
    const to = nextRung(stationOf(s));
    return { d, phase: 'beat1', intro: { title: `${donOf(s)?.firstName ?? 'The boss'} calls you in`, kicker: `The ${above(s)?.name ?? 'Valente'} family`, text: `A sit-down about moving up${to ? ` to ${to}` : ''}. The odds are on the table, with every reason; his answer comes before you stand up.`, scene: 'sitdown' } };
  },
  options,
  step: callStep,
  auto,
  odds: (s, ses) => callInOdds(s).reasons.slice(0, 7).map((r) => ({ label: r.label, value: `${r.value > 0 ? '+' : ''}${r.value}`, tone: r.value >= 0 ? 'good' as const : 'bad' as const })).concat([{ label: 'The chance', value: pct(ses.d.p), tone: 'good' as const }]),
};

registerMinigame(GET_MADE);
registerMinigame(CALL_IN);
