import { displayName, hasTrait, player } from './characters';
import { registerEventSource } from './events';
import { beat, between, clamp, hit, mgEffect, mgOf, registerAttacher, registerMinigame, roll, usd, type MgOption, type MgSession, type MinigameDef } from './minigame';
import { opinion } from './relations';
import type { Character, Effect, EventInstance, GameState } from './types';

/**
 * THE SIT-DOWN: a multi-round negotiation. A round table in a closed
 * restaurant; the hands stay on the table. Your ask against their offer,
 * on a scale where 50 is a fair deal. They have a reservation point you
 * cannot see, patience that runs out, and a "final offer" that may be a
 * bluff. Used by Table hearings, rival propositions and Philadelphia's
 * points.
 */

type Kind = 'hearing' | 'deal' | 'points';

export interface SitdownData {
  kind: Kind;
  other: string;
  otherFirst: string;
  otherId?: string;
  ask: number;
  offer: number;
  /** Hidden: the best they will really do. */
  reserve: number;
  patience: number;
  patienceMax: number;
  final?: boolean;
  bluff?: boolean;
  /** Your read on a bluff (0..1), from your intrigue. */
  read: number;
  sweetened: number;
  deal?: number;
  walked?: 'you' | 'them';
  round: number;
  base: number;
}

type DS = MgSession<SitdownData>;

function bluffRead(s: GameState, d: SitdownData): number {
  const me = player(s);
  const sharp = me.attributes.intrigue / 100;
  return clamp(d.bluff ? 0.35 + sharp * 0.5 : 0.65 - sharp * 0.5, 0.05, 0.95);
}

function counter(s: GameState, ses: DS, conceded = 0): void {
  const d = ses.d;
  d.round += 1;
  d.patience -= 1;
  if (d.ask <= d.offer) return close(s, ses, d.ask);
  if (d.patience <= 0) {
    d.walked = 'them';
    beat(ses, `${d.otherFirst} stands up, buttons his jacket, and leaves money for the coffee.`, 'bad');
    return end(s, ses);
  }
  const step = (d.reserve - d.offer) * (0.35 + conceded / 40) + (roll(ses) - 0.5) * 4;
  d.offer = clamp(Math.round(d.offer + Math.max(0, step)), 0, 100);
  if (d.ask <= d.offer) return close(s, ses, d.ask);
  if (d.patience === 1) {
    d.final = true;
    d.bluff = d.offer < d.reserve - 4 ? hit(ses, 0.6) : false;
    d.read = bluffRead(s, d);
    beat(ses, `"${d.offer}. That's my final offer." ${d.otherFirst} puts both hands flat on the table.`, 'quote');
  } else beat(ses, `${d.otherFirst} comes back with ${d.offer}.`, 'quote');
}

function close(s: GameState, ses: DS, at: number): void {
  const d = ses.d;
  d.deal = clamp(Math.round(at), 0, 100);
  beat(ses, `Hands across the table. ${d.deal}. It's done.`, d.deal >= 50 ? 'good' : 'info');
  end(s, ses);
}

function opts(s: GameState, ses: DS): MgOption[] {
  const d = ses.d;
  const out: MgOption[] = [];
  if (d.final) {
    out.push({ id: 'accept', label: `Take ${d.offer}`, detail: 'Shake on it.' });
    out.push({ id: 'callbluff', label: 'Call his bluff: hold at your number', detail: `Your read: ${Math.round(d.read * 100)}% he's bluffing. If he isn't, he walks.`, odds: d.read, tone: 'risky' });
  } else {
    out.push({ id: 'hold', label: `Hold firm at ${d.ask}`, detail: 'Let the silence do the work. It costs patience.' });
    out.push({ id: 'meet', label: `Meet him halfway (${Math.round((d.ask + d.offer) / 2)})`, detail: 'Reasonable men.' });
    out.push({ id: 'concede', label: `Give a little (${Math.max(d.offer, d.ask - 10)})`, detail: 'Goodwill: he moves faster.' });
    out.push({ id: 'sweeten', label: `Sweeten it (${usd(1000)})`, detail: 'An envelope on the side. He can live with less.', cost: 1000, disabled: s.money < 1000 + d.sweetened ? 'Needs $1,000' : d.sweetened >= 2000 ? 'Twice is enough' : undefined });
    out.push({ id: 'lean', label: 'Remind him who he is talking to', detail: `Your respect (${s.respect}) against his patience.`, tone: 'risky' });
    out.push({ id: 'accept', label: `Take ${d.offer}`, detail: 'Shake on what is on the table.' });
  }
  out.push({ id: 'walk', label: 'Walk away', detail: 'No deal.' });
  return out;
}

function step(s: GameState, ses: DS, move: string): void {
  const d = ses.d;
  switch (move) {
    case 'accept':
      return close(s, ses, d.offer);
    case 'walk':
      d.walked = 'you';
      beat(ses, 'You put your hat on. Nobody says goodbye.', 'info');
      return end(s, ses);
    case 'callbluff':
      if (d.bluff) {
        d.offer = Math.min(d.reserve, d.ask);
        beat(ses, `${d.otherFirst} laughs, shakes his head, and comes up to ${d.offer}.`, 'good');
        return close(s, ses, d.offer);
      }
      d.walked = 'them';
      beat(ses, `He meant it. ${d.otherFirst} leaves.`, 'bad');
      return end(s, ses);
    case 'hold':
      beat(ses, `You say nothing for a long time. ${d.ask}.`, 'info');
      return counter(s, ses, 0);
    case 'meet':
      d.ask = Math.round((d.ask + d.offer) / 2);
      beat(ses, `"Let's be reasonable. ${d.ask}."`, 'quote');
      d.patience += 0.5;
      return counter(s, ses, 3);
    case 'concede':
      d.ask = Math.max(d.offer, d.ask - 10);
      beat(ses, `You give a little. ${d.ask}.`, 'info');
      d.patience += 1;
      return counter(s, ses, 6);
    case 'sweeten':
      d.sweetened += 1000;
      d.reserve += 8;
      beat(ses, 'An envelope slides across the tablecloth and disappears.', 'good');
      return counter(s, ses, 2);
    case 'lean': {
      const p = clamp(0.3 + (s.respect - 50) / 100, 0.1, 0.8);
      if (hit(ses, p)) {
        d.reserve += 8;
        beat(ses, `${d.otherFirst} remembers who you are. Something in his face changes.`, 'good');
      } else {
        d.patience -= 1;
        beat(ses, `${d.otherFirst} doesn't like being reminded of anything.`, 'bad');
      }
      return counter(s, ses, 0);
    }
  }
}

function end(_s: GameState, ses: DS): void {
  const d = ses.d;
  ses.done = true;
  ses.phase = 'end';
  const label = d.kind === 'hearing' ? 'The Table' : d.kind === 'points' ? 'Points with Philadelphia' : `Sit-down: ${d.other}`;
  const fx: Effect[] = [];
  if (d.sweetened) fx.push({ type: 'money', amount: -d.sweetened, label: `${label}: an envelope on the side` });
  const v = d.deal;
  if (d.kind === 'hearing') {
    const amount = v !== undefined ? d.base + Math.round((v - 50) * 0.6) : d.base - 10;
    fx.push({ type: 'plea', disputeId: String(ses.params.dispute), amount, label: `${label}: ${amount >= 0 ? '+' : '−'}${Math.abs(amount)} to every vote` });
    ses.outcome = { title: label, text: v !== undefined ? `You worked the room to ${v}: ${amount >= 0 ? '+' : ''}${amount} to every vote.` : 'You walked out of the room. The vote goes on without your plea.', tone: v !== undefined && v >= 50 ? 'good' : 'mixed', effects: fx };
    return;
  }
  if (d.kind === 'points') {
    if (v !== undefined) fx.push({ type: 'money', amount: Math.round((v - 50) * 80), label: `${label}: the new arrangement` }, { type: 'rivalOpinion', rival: 'philly', amount: v > 60 ? -6 : 4, reason: 'Talked points', label });
    else fx.push({ type: 'rivalOpinion', rival: 'philly', amount: -10, reason: 'Walked away from the points', label }, { type: 'heat', bar: 'family', amount: 6, label });
    ses.outcome = { title: label, text: v !== undefined ? `Philadelphia settles at ${v}.` : 'No arrangement. Philadelphia does not like it.', tone: v !== undefined && v >= 50 ? 'good' : 'bad', effects: fx };
    return;
  }
  if (v !== undefined) {
    const mult = 0.6 + (v / 100) * 0.9;
    for (const e of ses.parts.accept ?? []) fx.push(e.type === 'money' ? { ...e, amount: Math.round((e.amount * mult) / 50) * 50 } : e);
  } else fx.push(...(ses.parts.refuse ?? []));
  ses.outcome = { title: label, text: v !== undefined ? `A deal at ${v}${v >= 50 ? ', in your favor' : ''}.` : d.walked === 'you' ? 'You walked away.' : `${d.otherFirst} walked away.`, tone: v !== undefined && v >= 50 ? 'good' : 'mixed', effects: fx };
}

function auto(_s: GameState, ses: DS): string {
  const d = ses.d;
  if (d.final) return 'accept';
  if (d.offer >= d.ask - 6) return 'accept';
  return 'meet';
}

export const SITDOWN: MinigameDef<SitdownData> = {
  id: 'sitdown',
  init: (s, ses) => {
    const kind = String(ses.params.kind ?? 'deal') as Kind;
    const other = ses.params.other ? s.characters[String(ses.params.other)] : undefined;
    const name = other ? displayName(other) : String(ses.params.otherName ?? 'the other side');
    const op = other ? opinion(s, other.id, s.playerId) : 0;
    let patience = 4;
    if (other && hasTrait(other, 'Patient')) patience += 2;
    if (other && hasTrait(other, 'Hot-headed')) patience -= 1;
    const reserve = clamp(Math.round(48 + op / 8 + (s.respect - 50) / 10 + between(ses, -8, 8)), 25, 80);
    const d: SitdownData = { kind, other: name, otherFirst: other?.firstName ?? name.split(' ')[0], otherId: other?.id, ask: 75, offer: clamp(reserve - between(ses, 18, 28), 5, 60), reserve, patience, patienceMax: patience, read: 0.5, sweetened: 0, round: 0, base: Number(ses.params.base ?? 0) };
    beat(ses, `${d.otherFirst} speaks first, which is a mistake. He opens at ${d.offer}. You want ${d.ask}.`, 'quote');
    return { d, phase: 'talk', intro: { title: kind === 'hearing' ? 'The Table sits' : kind === 'points' ? 'Points' : 'The sit-down', kicker: 'A round table in a closed restaurant', text: `A round table in a closed restaurant; the hands stay on the table. ${name} speaks first, which is a mistake.`, scene: 'sitdown' } };
  },
  options: opts,
  step,
  auto,
  odds: (_s, ses) => {
    const d = ses.d;
    return [{ label: 'Your ask', value: String(d.ask) }, { label: 'Their offer', value: String(d.offer) }, { label: 'Fair', value: '50' }, { label: 'Their patience', value: `${Math.max(0, Math.round(d.patience))} of ${d.patienceMax}`, tone: d.patience <= 1 ? 'bad' : undefined }];
  },
};
registerMinigame(SITDOWN);

/* ---------------------------------------------------------------- */
/* Hooks: Table hearings, rival propositions, Philadelphia's points  */
/* ---------------------------------------------------------------- */

registerAttacher((_s, ev) => {
  if (ev.defId === 'hearing' && ev.meta?.dispute) {
    const env = ev.choices.find((c) => c.id === 'envelopes');
    const base = Number((env?.effects.find((e) => e.type === 'plea') as { amount?: number } | undefined)?.amount ?? 0);
    const opp = (ev.actors ?? [])[1];
    return { id: 'room', label: 'Work the room (a sit-down)', detail: 'Negotiate with the other side before the vote: your deal moves every vote.', because: 'worked the room at the Table', effects: [mgEffect('sitdown', ev.iid, { kind: 'hearing', dispute: String(ev.meta.dispute), base, other: opp ?? '', play: 1 })] };
  }
  if (ev.defId.startsWith('deal_')) {
    const accept = ev.choices.find((c) => c.id === 'accept');
    const refuse = ev.choices.find((c) => c.id === 'refuse');
    if (!accept || !refuse) return undefined;
    const other = (ev.actors ?? [])[0];
    return { id: 'negotiate', label: 'Negotiate the terms', detail: 'Sit down with him. Push the price, or walk.', because: 'negotiated the terms', effects: [mgEffect('sitdown', ev.iid, { kind: 'deal', other: other ?? '', play: 1 }, { accept: accept.effects, refuse: refuse.effects })] };
  }
  return undefined;
});

export function buildPointsTalk(s: GameState): EventInstance | undefined {
  const philly = s.rivals.find((r) => r.id === 'philly');
  const man: Character | undefined = philly ? s.characters[philly.leaderId] : undefined;
  if (!man?.alive) return undefined;
  const iid = `ev${s.nextId++}`;
  const params = { kind: 'points', other: man.id, play: 1 };
  return {
    iid, defId: 'philly_points', week: s.week, mandatory: true, priority: 80, actors: [man.id],
    title: 'The summer is over',
    text: `You asked Philadelphia for the summer. ${displayName(man)} would like to talk about points now.`,
    defaultChoiceId: 'quiet',
    choices: [
      { id: 'talk', label: 'Sit down and talk points', because: 'talked points with Philadelphia', effects: [mgEffect('sitdown', iid, params)] },
      { id: 'quiet', label: 'Let the consigliere handle it', because: 'let the consigliere talk points', effects: [mgEffect('sitdown', iid, { ...params, play: 0 })] },
    ],
  };
}

let on = false;
export function ensureSitdownSource(): void {
  if (on) return;
  on = true;
  registerEventSource((s) => {
    const due = s.flags.phillyPoints;
    if (!due || s.week < due) return undefined;
    delete s.flags.phillyPoints;
    mgOf(s).offered.points = s.week;
    return buildPointsTalk(s);
  });
}
