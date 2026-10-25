import { ageOn } from './calendar';
import { capos, displayName, player } from './characters';
import { holder } from './council';
import { registerEventSource } from './events';
import { keeper } from './ledgerbook';
import { opinion } from './relations';
import { latestReport, isQuietWeek } from './tribute';
import { ensureTribute, pctOf, REASON_LABEL, splitText, type Beat, type TributeReport } from './tributeState';
import type { Character, Choice, Effect, EventInstance, GameState } from './types';
import type { TributeOp } from './tributeOps';

/**
 * The take in the popup pipeline: the Monday audience (when it needs the
 * Don: the first one, a shortfall that matters, a dispute, a petition, a
 * crisis, or when he asked to hold it every week), and the financial story
 * beats (shortfalls, disputes, a capo carrying a man, the wife, the heir,
 * the underboss's base and the succession crisis it becomes...). One
 * candidate a week from each source; the story director and the weekly
 * attention budget decide what reaches the desk.
 */

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const op = (o: TributeOp, label?: string): Effect => ({ type: 'tribute', op: o, ...(label ? { label } : {}) });
const pickText = (s: GameState, key: string, xs: string[]) => xs[(s.week * 7 + key.length * 13 + s.seed.length) % xs.length];

/* ------------------------------------------------------------------ */
/* The audience                                                        */
/* ------------------------------------------------------------------ */

export const AUDIENCE_ID = 'tribute_audience';

/** Weeks between optional audiences (issues), unless asked or in a crisis. */
const AUDIENCE_GAP = 3;

export function audienceWanted(s: GameState, rep: TributeReport): { want: boolean; mandatory: boolean; asked: boolean; why: string } {
  const t = ensureTribute(s);
  if (t.stats.audiences === 0 && rep.week >= 2) return { want: true, mandatory: true, asked: false, why: 'first' };
  if (!t.policy.auto) return { want: true, mandatory: false, asked: true, why: 'asked' };
  if (t.ub.stage === 3) return { want: true, mandatory: true, asked: false, why: 'crisis' };
  const last = t.held[t.held.length - 1] ?? -99;
  if (!isQuietWeek(rep) && rep.week - last >= AUDIENCE_GAP) return { want: true, mandatory: false, asked: false, why: 'issues' };
  return { want: false, mandatory: false, asked: false, why: '' };
}

function audienceTitle(s: GameState, rep: TributeReport): string {
  const ub = rep.ubId ? s.characters[rep.ubId] : undefined;
  if (!ub) return 'Monday morning: nobody brings the envelope';
  if (rep.acting) return `Monday morning: ${ub.firstName} ${ub.lastName} holds the envelope`;
  return pickText(s, 'title', [
    `Monday morning: ${ub.firstName} ${ub.lastName} brings the take`,
    'Monday morning, the Don\'s office',
    `The underboss's envelope: ${$(rep.presented)}`,
    `${ub.firstName} puts the numbers on the desk`,
  ]);
}

export function buildAudience(s: GameState, rep: TributeReport, w: ReturnType<typeof audienceWanted>): EventInstance {
  const t = ensureTribute(s);
  const pol = t.policy;
  const choices: Choice[] = [
    { id: 'policy', label: `Your usual split (${splitText(pol)})`, detail: 'The envelope goes the way it always does.', because: `split the envelope the usual way (${splitText(pol)})`, effects: [op({ op: 'note', text: `${$(rep.presented * pol.personal / 10000)} to you · ${$(rep.presented * pol.treasury / 10000)} to the family · ${$(rep.presented * pol.reserve / 10000)} to the reserve` }, 'The envelope')] },
  ];
  if (Math.abs(rep.rec.personal - pol.personal) >= 300 || Math.abs(rep.rec.reserve - pol.reserve) >= 300) {
    choices.push({ id: 'his', label: `Take his advice (${splitText(rep.rec)})`, detail: rep.recWhy.join(' '), because: `took the underboss's advice on the envelope (${splitText(rep.rec)})`, effects: [op({ op: 'note', text: `${$(rep.presented * rep.rec.personal / 10000)} to you · ${$(rep.presented * rep.rec.treasury / 10000)} to the family · ${$(rep.presented * rep.rec.reserve / 10000)} to the reserve` }, 'The envelope')] });
  }
  choices.push({ id: 'custom', label: 'Split it yourself', detail: 'Set your own split in the office (percentages or dollars). Must come to every dollar in the envelope.', because: 'split the envelope himself', effects: [op({ op: 'note', text: 'Your split, to the dollar' }, 'The envelope')] });
  const lines = rep.talk.slice(0, 4).map((x) => `"${x.text}"`).join(' ');
  return {
    iid: `ev${s.nextId++}`, defId: AUDIENCE_ID, week: s.week, mandatory: w.mandatory, priority: w.mandatory ? 90 : 68,
    title: audienceTitle(s, rep), text: lines || `The envelope: ${$(rep.presented)}.`,
    defaultChoiceId: 'policy', choices, actors: rep.ubId ? [rep.ubId] : undefined,
    meta: { report: rep.id, theme: 'institution', ...(w.asked ? { asked: 1 } : {}), why: w.why },
  };
}

function audienceSource(s: GameState): EventInstance | undefined {
  const rep = latestReport(s);
  if (!rep || rep.status !== 'ready' || s.gameOver) return undefined;
  const w = audienceWanted(s, rep);
  return w.want ? buildAudience(s, rep, w) : undefined;
}

/* ------------------------------------------------------------------ */
/* Story beats                                                         */
/* ------------------------------------------------------------------ */

const COOLDOWN: Record<string, number> = {
  short: 6, dispute: 6, carry: 12, wife: 30, heir: 40, base: 20, crisis: 52, disagree: 16, resign: 30, challenge: 14, inv_failed: 4, greed: 26, aging: 40, retire: 26, widow: 20, ub_caught: 4, grievance: 10, ub_ill: 20,
};

function live(s: GameState, id?: string): Character | undefined {
  const c = id ? s.characters[id] : undefined;
  return c?.alive ? c : undefined;
}

function ev(s: GameState, defId: string, title: string, text: string, actors: string[], choices: Choice[], o: { pri?: number; mandatory?: boolean; family?: boolean; theme?: string; charId?: string } = {}): EventInstance {
  return {
    iid: `ev${s.nextId++}`, defId, week: s.week, title, text, choices, defaultChoiceId: choices[0].id,
    mandatory: !!o.mandatory, priority: o.pri ?? 55, actors: actors.filter((a) => !!s.characters[a]).slice(0, 3),
    meta: { theme: o.theme ?? 'business', ...(o.family ? { family: 1 } : {}), ...(o.charId ? { charId: o.charId } : {}) },
  };
}

function buildBeat(s: GameState, b: Beat): EventInstance | undefined {
  const t = ensureTribute(s);
  const boss = player(s);
  const who = live(s, b.who);
  const forC = live(s, b.forId);
  const kp = keeper(s);
  switch (b.kind) {
    case 'short': {
      if (!who || !forC) return undefined;
      const owed = t.arrears[forC.id] ?? b.amount ?? 0;
      const rep = latestReport(s);
      const ml = rep?.crews.flatMap((c) => c.members).find((m) => m.id === forC.id);
      const said = ml?.said ? REASON_LABEL[ml.said] : 'a bad week';
      const label = `${forC.firstName}'s envelope`;
      return ev(s, 'tr_shortfall', pickText(s, 'short', [`${forC.firstName} ${forC.lastName} keeps coming up short`, `Short again: ${forC.firstName} ${forC.lastName}`, `${who.firstName}'s problem with ${forC.firstName}`]),
        pickText(s, 'shorttext', [
          `${displayName(who)} brings it to you himself: ${forC.firstName} has come up short ${t.shortHist[forC.id]?.length ?? 2} times in eight weeks. He owes ${$(owed)}. He says it is ${said}.`,
          `${forC.firstName} ${forC.lastName} is ${$(owed)} behind. ${who.firstName} says ${forC.firstName} blames ${said}. "I can carry him a week. Not a month."`,
          `The sheet says ${$(owed)} owed by ${forC.firstName}. What he says: ${said}. What it is, nobody has checked.`,
        ]), [who.id, forC.id], [
          { id: 'review', label: 'Review the accounts', detail: `${kp ? `${kp.firstName} ${kp.lastName}` : 'Your books'} go through his envelopes: the truth comes out, most likely.`, because: `had ${forC.firstName}'s envelopes gone through`, effects: [{ type: 'money', amount: -150, label }, op({ op: 'reveal', charId: forC.id, chance: 0.8 }, label), { type: 'opinion', from: forC.id, to: boss.id, amount: -3, reason: 'Had my envelopes checked', decay: 1, label }] },
          { id: 'explain', label: 'Ask him to explain, to your face', detail: 'An honest man tells you. A liar tells you something.', because: `asked ${forC.firstName} to explain`, effects: [op({ op: 'reveal', charId: forC.id, chance: 0.4 }, label), { type: 'opinion', from: forC.id, to: boss.id, amount: 2, reason: 'The boss heard me out', decay: 1, label }] },
          { id: 'extend', label: 'Give him six weeks', because: `gave ${forC.firstName} six weeks to make it good`, effects: [op({ op: 'terms', charId: forC.id, kind: 'extension', weeks: 6 }, label), { type: 'opinion', from: forC.id, to: boss.id, amount: 6, reason: 'Gave me time', decay: 1, label }, { type: 'opinion', from: who.id, to: boss.id, amount: 3, reason: 'Backed my man', decay: 1, label }] },
          { id: 'demand', label: 'He pays it now, out of his pocket', because: `made ${forC.firstName} pay what he owed`, effects: [op({ op: 'demand', charId: forC.id }, label), { type: 'opinion', from: forC.id, to: boss.id, amount: -8, reason: 'Squeezed me when I was down', decay: 1, label }] },
          { id: 'council', label: 'Take it to the capos', detail: 'The table hears it. If he lied, everybody knows. If he did not, he was shamed for nothing.', because: `took ${forC.firstName}'s shortfall to the capos`, effects: [op({ op: 'reveal', charId: forC.id, chance: 0.6 }, label), ...capos(s).filter((k) => k.id !== who.id).slice(0, 4).map((k) => ({ type: 'opinion' as const, from: k.id, to: forC.id, amount: -5, reason: 'Came up short at the table', decay: 1, label })), { type: 'opinion', from: forC.id, to: boss.id, amount: -6, reason: 'Shamed me in front of the table', decay: 1, label }] },
        ], { charId: forC.id });
    }
    case 'dispute': {
      const d = t.disputes.find((x) => x.id === b.ref && x.status === 'open');
      if (!who || !d) return undefined;
      const label = `${who.firstName}'s assessment`;
      return ev(s, 'tr_dispute', pickText(s, 'disp', [`${who.firstName} ${who.lastName} disputes his number`, 'A disputed assessment', `${who.firstName} brings his own figures`]),
        `${displayName(who)}: "${d.claim}" He says the family over-assessed him by ${$(d.amount)}. ${t.ub.id && live(s, t.ub.id) ? `${live(s, t.ub.id)!.firstName} thinks ${d.valid ? 'he may have a point' : 'he is crying poor'}` : 'Nobody has checked'}.`,
        [who.id], [
          { id: 'recheck', label: 'Bring in an accountant', detail: 'A real count. If he is right, he gets it back; if not, he looks foolish.', because: `had ${who.firstName}'s assessment rechecked`, effects: [{ type: 'money', amount: -250, label }, op({ op: 'dispute', id: d.id, ruling: d.valid ? 'upheld' : 'denied' }, label)] },
          { id: 'split', label: `Split the difference (${$(d.amount / 2)})`, because: `split the difference with ${who.firstName}`, effects: [op({ op: 'dispute', id: d.id, ruling: 'split' }, label), { type: 'opinion', from: who.id, to: boss.id, amount: 3, reason: 'Met me halfway', decay: 1, label }] },
          { id: 'uphold', label: `Give him his number (${$(d.amount)})`, because: `gave ${who.firstName} his number`, effects: [op({ op: 'dispute', id: d.id, ruling: 'upheld' }, label), { type: 'opinion', from: who.id, to: boss.id, amount: 8, reason: 'The boss took my word', decay: 1, label }] },
          { id: 'deny', label: 'The number stands', because: `told ${who.firstName} his number stands`, effects: [op({ op: 'dispute', id: d.id, ruling: 'denied' }, label), { type: 'opinion', from: who.id, to: boss.id, amount: -5, reason: 'Would not hear my figures', decay: 1, label }] },
          { id: 'council', label: 'Let the capos hear it', because: `put ${who.firstName}'s dispute to the capos`, effects: [op({ op: 'dispute', id: d.id, ruling: 'council' }, label)] },
        ], { charId: who.id });
    }
    case 'carry': {
      if (!who || !forC) return undefined;
      const amt = t.carry[`${who.id}>${forC.id}`] ?? b.amount ?? 0;
      const label = `${who.firstName} carries ${forC.firstName}`;
      return ev(s, 'tr_carry', pickText(s, 'carry', [`${who.firstName} is carrying ${forC.firstName}`, 'A capo covers for his man', `${forC.firstName} ${forC.lastName} is struggling`]),
        `${displayName(who)} has covered ${$(amt)} of ${forC.firstName} ${forC.lastName}'s dues out of his own pocket. ${forC.firstName}'s corner is dead and ${forC.household?.kids?.length ? 'he has kids at home' : 'he is too proud to ask'}. ${who.firstName} did not ask you for anything. Somebody told you anyway.`,
        [who.id, forC.id], [
          { id: 'reimburse', label: `The family pays ${who.firstName} back (${$(amt)})`, because: `paid ${who.firstName} back for carrying ${forC.firstName}`, effects: [op({ op: 'refund', charId: who.id, amount: amt, from: 'treasury' }, label), { type: 'opinion', from: who.id, to: boss.id, amount: 10, reason: 'The boss saw what I did', decay: 1, label }] },
          { id: 'exempt', label: `Exempt ${forC.firstName} for eight weeks`, because: `exempted ${forC.firstName} for eight weeks`, effects: [op({ op: 'terms', charId: forC.id, kind: 'exempt', weeks: 8 }, label), { type: 'opinion', from: forC.id, to: boss.id, amount: 10, reason: 'Gave me a break when I needed it', decay: 1, label }] },
          { id: 'praise', label: `Tell ${who.firstName} he is a good capo`, because: `praised ${who.firstName} for carrying his man`, effects: [{ type: 'opinion', from: who.id, to: boss.id, amount: 3, reason: 'A kind word', decay: 1, label }, { type: 'meter', from: who.id, to: boss.id, meter: 'grievance', amount: 4, label }] },
          { id: 'flat', label: `Put ${forC.firstName} on a flat $20 a week`, because: `put ${forC.firstName} on a flat figure`, effects: [op({ op: 'terms', charId: forC.id, kind: 'fixed', weeks: 12, amount: 20 }, label)] },
        ], { charId: forC.id });
    }
    case 'wife': {
      const wife = live(s, boss.spouseId);
      if (!wife) return undefined;
      const label = 'Where the money went';
      return ev(s, 'tr_wife', pickText(s, 'wife', ['Where did the money go?', `${wife.firstName} wants to talk`, 'A question at the kitchen table']),
        pickText(s, 'wifetext', [
          `${wife.firstName} has the household book open on the kitchen table. "We used to have more. Now the envelope I get is thinner and you're out every night. Where does it go?" Your own money: ${$(t.acct.personal)}.`,
          `"The butcher asked me if we were all right," ${wife.firstName} says. "Are we?" Your own account holds ${$(t.acct.personal)}; the family's ${$(s.money)}.`,
        ]), [wife.id], [
          { id: 'household', label: 'Give her household money (from your own)', because: `gave ${wife.firstName} household money`, effects: [op({ op: 'pay', charId: wife.id, amount: 600, from: 'personal', why: 'household money' }, label), { type: 'opinion', from: wife.id, to: boss.id, amount: 10, reason: 'Took care of the house', decay: 1, label }] },
          { id: 'allowance', label: 'A standing $75 a week for the house', because: `set ${wife.firstName} a weekly allowance`, effects: [op({ op: 'allowance', charId: wife.id, weekly: 75 }, label), { type: 'opinion', from: wife.id, to: boss.id, amount: 12, reason: 'Gave me my own money', decay: 1, label }] },
          { id: 'business', label: '"It\'s business."', because: `told ${wife.firstName} it was business`, effects: [{ type: 'opinion', from: wife.id, to: boss.id, amount: -10, reason: 'Shut me out', decay: 1, label }] },
        ], { family: true, theme: 'family', pri: 50 });
    }
    case 'heir': {
      if (!who) return undefined;
      const label = `${who.firstName} wants a bigger share`;
      return ev(s, 'tr_heir', pickText(s, 'heir', [`${who.firstName} wants his share`, 'The heir asks for more', `${who.firstName} at the door of the office`]),
        `${displayName(who)} knows what is in the envelope. "You take ${pctOf(t.greed.length ? t.greed.reduce((a, x) => a + x, 0) / t.greed.length : t.policy.personal)} percent for yourself and I take the bus. When it's mine, it's mine — but I live now."`,
        [who.id], [
          { id: 'allowance', label: `$100 a week from your own money`, because: `gave ${who.firstName} an allowance`, effects: [op({ op: 'allowance', charId: who.id, weekly: 100 }, label), { type: 'opinion', from: who.id, to: boss.id, amount: 12, reason: 'Gave me my share', decay: 1, label }] },
          { id: 'earn', label: 'Put him with a capo: let him earn it', because: `told ${who.firstName} to earn it with a crew`, effects: [{ type: 'opinion', from: who.id, to: boss.id, amount: 2, reason: 'Made me earn it', decay: 1, label }, { type: 'respect', amount: 1, label }] },
          { id: 'refuse', label: 'Refuse him', because: `refused ${who.firstName} a bigger share`, effects: [{ type: 'opinion', from: who.id, to: boss.id, amount: -12, reason: 'Kept me on a leash', decay: 1, label }, { type: 'meter', from: who.id, to: boss.id, meter: 'grievance', amount: 10, label }] },
        ], { family: true, theme: 'family', charId: who.id });
    }
    case 'base': {
      const ub = live(s, t.ub.id);
      const cons = holder(s, 'consigliere');
      if (!ub) return undefined;
      const n = t.ub.callsFirst.length;
      const label = 'The underboss\'s people';
      return ev(s, 'tr_base', pickText(s, 'base', ['Who the capos call first', `${ub.firstName}'s people`, 'A word from the consigliere']),
        `${cons ? displayName(cons) : 'Somebody you trust'} closes the door. "${ub.firstName} delivers the take, every week, and the earners have noticed. ${n} of your capos call him before they call you. ${n >= Math.ceil(capos(s).length / 2) ? 'That\'s half the family.' : 'It isn\'t half. Yet.'}"`,
        [...(cons ? [cons.id] : []), ub.id], [
          { id: 'hold', label: 'Hold the audience yourself, every week', detail: 'The capos see you take the envelope from his hand, every Monday.', because: 'started holding the audience every week', effects: [op({ op: 'policy', auto: false }, label), op({ op: 'base', amount: -15 }, label)] },
          { id: 'talk', label: `Talk to ${ub.firstName}`, because: `talked to ${ub.firstName} about his people`, effects: [{ type: 'opinion', from: ub.id, to: boss.id, amount: 4, reason: 'The boss still trusts me', decay: 1, label }, op({ op: 'base', amount: -5 }, label)] },
          { id: 'cut', label: 'Cut his share to 7%', because: `cut ${ub.firstName}'s share`, effects: [op({ op: 'ubRate', bp: 700 }, label), op({ op: 'base', amount: -10 }, label), { type: 'opinion', from: ub.id, to: boss.id, amount: -15, reason: 'Cut my end', decay: 1, label }] },
          { id: 'ignore', label: 'He is loyal. Let it be.', because: 'let the underboss keep his people', effects: [op({ op: 'base', amount: 5 }, label)] },
        ], { theme: 'crew', pri: 62 });
    }
    case 'crisis': {
      const ub = live(s, t.ub.id);
      if (!ub) return undefined;
      const heir = s.designatedHeirId ? live(s, s.designatedHeirId) : undefined;
      const label = 'The underboss and the succession';
      const n = t.ub.callsFirst.length;
      return ev(s, 'tr_crisis', 'The envelope and the succession',
        `${displayName(ub)} has delivered the take for ${Math.round((s.week - t.ub.since) / 52 * 10) / 10} years. ${n} of your capos call him first. ${heir ? `You named ${heir.firstName} your heir, and the earners are asking why it isn't the man who pays them.` : 'The earners are asking who comes after you, and they all say the same name.'} He is rich (${$(ub.wealth)}) and he is patient. It is a succession crisis, and it has written itself.`,
        [ub.id, ...(heir ? [heir.id] : [])], [
          { id: 'name', label: `Name ${ub.firstName} your heir`, because: `named ${ub.firstName} the heir`, effects: [{ type: 'opinion', from: ub.id, to: boss.id, amount: 25, reason: 'Named me his heir', decay: 1, label }, ...(heir ? [{ type: 'opinion' as const, from: heir.id, to: boss.id, amount: -30, reason: 'Gave my birthright away', decay: 1, label }, { type: 'meter' as const, from: heir.id, to: boss.id, meter: 'grievance' as const, amount: 25, label }] : []), op({ op: 'stage', stage: 4 }, label)] },
          { id: 'curb', label: 'Take the envelope back: the capos come to you', detail: 'Every Monday, every capo, in person. He loses his standing, and he knows why.', because: `took the envelope back from ${ub.firstName}`, effects: [op({ op: 'base', amount: 0, clear: true }, label), op({ op: 'policy', auto: false }, label), { type: 'opinion', from: ub.id, to: boss.id, amount: -20, reason: 'Took my job away in front of everybody', decay: 1, label }, { type: 'meter', from: ub.id, to: boss.id, meter: 'grievance', amount: 20, label }, op({ op: 'stage', stage: 4 }, label)] },
          { id: 'retire', label: `Retire him with an envelope (${$(5000)} of your own)`, because: `retired ${ub.firstName} with a gift`, effects: [op({ op: 'pay', charId: ub.id, amount: 5000, from: 'personal', why: 'a retirement' }, label), { type: 'seat', seat: 'underboss', charId: '', label }, ...t.ub.callsFirst.map((id) => ({ type: 'opinion' as const, from: id, to: boss.id, amount: -10, reason: 'Pushed out the man who looked after us', decay: 1, label })), op({ op: 'base', amount: 0, clear: true }, label), op({ op: 'stage', stage: 4 }, label)] },
          { id: 'refuse', label: 'Do nothing. You are the boss.', detail: 'His people may stop waiting.', because: `ignored ${ub.firstName}'s people`, effects: [op({ op: 'note', text: 'His people may organise against you' }, label), op({ op: 'stage', stage: 5 }, label)] },
        ], { mandatory: true, pri: 85, theme: 'crew', charId: ub.id });
    }
    case 'disagree':
    case 'resign': {
      const ub = live(s, t.ub.id);
      if (!ub) return undefined;
      const label = b.kind === 'resign' ? `${ub.firstName} wants out` : `${ub.firstName} disagrees`;
      if (b.kind === 'resign') {
        return ev(s, 'tr_resign', `${ub.firstName} ${ub.lastName} offers to step down`,
          `"I tell you what the family needs and you do the opposite. ${t.ub.disagreements} times now. Find somebody you listen to." ${displayName(ub)} puts the ledger on your desk.`,
          [ub.id], [
            { id: 'accept', label: 'Accept it', because: `accepted ${ub.firstName}'s resignation`, effects: [{ type: 'seat', seat: 'underboss', charId: '', label }, { type: 'opinion', from: ub.id, to: boss.id, amount: -5, reason: 'Let me walk', decay: 1, label }] },
            { id: 'listen', label: `Adopt his split as your standing policy`, because: `promised to listen to ${ub.firstName}`, effects: [op({ op: 'policy', split: latestReport(s)?.rec }, label), { type: 'opinion', from: ub.id, to: boss.id, amount: 15, reason: 'The boss listened', decay: 1, label }] },
            { id: 'raise', label: 'Raise his share to 12%', because: `raised ${ub.firstName}'s share to keep him`, effects: [op({ op: 'ubRate', bp: 1200 }, label), { type: 'opinion', from: ub.id, to: boss.id, amount: 10, reason: 'Raised my end', decay: 1, label }] },
          ], { pri: 70, theme: 'crew', charId: ub.id });
      }
      const rep = latestReport(s);
      return ev(s, 'tr_disagree', pickText(s, 'disag', [`${ub.firstName} does not like your split`, 'The underboss pushes back', `A hard word from ${ub.firstName}`]),
        `"${t.ub.disagreements} weeks now you take ${pctOf(t.policy.personal)} percent and the family runs thin. I'd split it ${rep ? splitText(rep.rec) : 'differently'}." ${displayName(ub)} is not shouting. That is worse.`,
        [ub.id], [
          { id: 'adopt', label: 'Make his split your standing policy', because: `adopted ${ub.firstName}'s split`, effects: [op({ op: 'policy', split: rep?.rec }, label), { type: 'opinion', from: ub.id, to: boss.id, amount: 8, reason: 'The boss listened', decay: 1, label }] },
          { id: 'firm', label: 'It is your envelope', because: `told ${ub.firstName} it was his envelope`, effects: [{ type: 'opinion', from: ub.id, to: boss.id, amount: -8, reason: 'Won\'t hear a word about money', decay: 1, label }] },
          { id: 'replace', label: 'Find a new underboss', because: `removed ${ub.firstName} as underboss`, effects: [{ type: 'seat', seat: 'underboss', charId: '', label }, { type: 'opinion', from: ub.id, to: boss.id, amount: -25, reason: 'Threw me out for telling the truth', decay: 1, label }, { type: 'meter', from: ub.id, to: boss.id, meter: 'grievance', amount: 20, label }] },
        ], { pri: 58, theme: 'crew', charId: ub.id });
    }
    case 'challenge': {
      const acc = forC;
      if (!who || !acc) return undefined;
      const label = `${who.firstName} against ${acc.firstName}`;
      const truth = (acc.skimmed ?? 0) > 150;
      return ev(s, 'tr_challenge', `${who.firstName} ${who.lastName} questions ${acc.firstName}'s books`,
        `"${acc.firstName}'s district does twice the business mine does and he sends up the same envelope. Somebody should count." ${displayName(who)} and ${displayName(acc)} have not liked each other for a long time.`,
        [who.id, acc.id], [
          { id: 'audit', label: `Have ${acc.firstName}'s books gone through`, because: `had ${acc.firstName}'s books gone through`, effects: [op({ op: 'audit', capoId: acc.id }, label), { type: 'money', amount: -200, label }, ...(truth ? [] : [{ type: 'opinion' as const, from: acc.id, to: who.id, amount: -15, reason: 'Accused me falsely', decay: 1, label }, { type: 'opinion' as const, from: acc.id, to: boss.id, amount: -6, reason: 'Listened to a false accusation', decay: 1, label }])] },
          { id: 'dismiss', label: 'Tell him to mind his own crew', because: `dismissed ${who.firstName}'s accusation`, effects: [{ type: 'opinion', from: who.id, to: boss.id, amount: -5, reason: 'Would not listen', decay: 1, label }, { type: 'opinion', from: acc.id, to: boss.id, amount: 3, reason: 'Stood by me', decay: 1, label }] },
          { id: 'council', label: 'Both of them, at the table', because: `put ${who.firstName} and ${acc.firstName} at the table`, effects: [{ type: 'opinion', from: who.id, to: acc.id, amount: -6, reason: 'A shouting match at the table', decay: 1, label }, op({ op: 'audit', capoId: acc.id }, label), { type: 'money', amount: -200, label }] },
        ], { pri: 52, charId: acc.id });
    }
    case 'inv_failed': {
      const inv = t.investments.find((x) => x.id === b.ref);
      if (!inv || !who) return undefined;
      const label = `${inv.what}`;
      return ev(s, 'tr_investment', `The investment went bad: ${inv.what}`,
        `${displayName(who)} pitched ${inv.what}; the reserve put up ${$(inv.amount)}. ${pickText(s, 'inv', ['The partner skipped to Florida.', 'The building inspector shut it down.', 'The other side was keeping two sets of books.', 'There was never any business there.'])} The money is gone.`,
        [who.id], [
          { id: 'writeoff', label: 'Write it off', because: `wrote off ${who.firstName}'s investment`, effects: [op({ op: 'invest', id: inv.id, ruling: 'writeoff' }, label), { type: 'opinion', from: who.id, to: boss.id, amount: 5, reason: 'Did not blame me for bad luck', decay: 1, label }] },
          { id: 'payback', label: 'He pays back half', because: `made ${who.firstName} pay back half`, effects: [op({ op: 'invest', id: inv.id, ruling: 'payback' }, label), { type: 'opinion', from: who.id, to: boss.id, amount: -10, reason: 'Made me eat a bad deal', decay: 1, label }] },
          { id: 'audit', label: 'Find out if he was in on it', because: `had ${who.firstName}'s books gone through`, effects: [op({ op: 'audit', capoId: who.rank === 'capo' ? who.id : undefined }, label), { type: 'money', amount: -200, label }] },
        ], { pri: 50, charId: who.id });
    }
    case 'greed':
    case 'aging': {
      const cons = holder(s, 'consigliere') ?? capos(s)[0];
      if (!cons) return undefined;
      const avg = t.greed.length ? t.greed.reduce((a, x) => a + x, 0) / t.greed.length : 0;
      const label = b.kind === 'aging' ? 'An old man\'s envelope' : 'The family\'s end';
      return ev(s, b.kind === 'aging' ? 'tr_aging' : 'tr_greed', b.kind === 'aging' ? 'The old man is bleeding the family' : 'The capos are talking about your cut',
        b.kind === 'aging'
          ? `${displayName(cons)} chooses his words. "You've taken ${Math.round(avg / 100)} percent for yourself for months. You're ${ageOn(boss.birth, s.date)}. The young ones say you're filling a mattress for Florida while the family pays its bills late."`
          : `${displayName(cons)}: "You take ${Math.round(avg / 100)} percent. The family has ${$(s.money)}. The capos can count too."`,
        [cons.id], [
          { id: 'putback', label: `Put ${$(Math.min(t.acct.personal, 3000))} of your own back in`, because: 'put his own money back into the family', effects: [op({ op: 'move', from: 'personal', to: 'treasury', amount: Math.min(t.acct.personal, 3000) }, label)] },
          { id: 'lower', label: 'Take 10% from now on', because: 'cut his own share to 10%', effects: [op({ op: 'policy', split: { personal: 1000, treasury: 7500, reserve: 1500 } }, label), ...capos(s).map((k) => ({ type: 'opinion' as const, from: k.id, to: boss.id, amount: 3, reason: 'The boss tightened his own belt', decay: 1, label }))] },
          { id: 'mine', label: '"My money is my business."', because: 'told them his money was his business', effects: capos(s).map((k) => ({ type: 'opinion' as const, from: k.id, to: boss.id, amount: -4, reason: 'The boss bleeds the family', decay: 1, label })) },
        ], { pri: 56, theme: 'crew' });
    }
    case 'retire': {
      const ub = live(s, t.ub.id) ?? capos(s)[0];
      if (!ub) return undefined;
      const label = 'Talk of retirement';
      return ev(s, 'tr_retire', 'They think you are getting out',
        `You have taken almost nothing for yourself for weeks and spent less. ${displayName(ub)} says the capos read it two ways: "Half of them think you're the best boss they ever had, putting it all back. The other half think you're getting ready to retire, and they're picking sides."`,
        [ub.id], [
          { id: 'announce', label: 'Tell them: it is all going back into the family', because: 'told the capos he was reinvesting', effects: [...capos(s).map((k) => ({ type: 'opinion' as const, from: k.id, to: boss.id, amount: 4, reason: 'The boss reinvests in the family', decay: 1, label })), op({ op: 'base', amount: -5 }, label)] },
          { id: 'show', label: 'Be seen: dinners, the club, the boardwalk', because: 'made himself seen around the island', effects: [{ type: 'money', amount: -800, label }, { type: 'respect', amount: 2, label }, op({ op: 'base', amount: -8 }, label)] },
          { id: 'let', label: 'Let them talk', because: 'let them talk about his retirement', effects: [op({ op: 'base', amount: 6 }, label)] },
        ], { pri: 48, theme: 'crew' });
    }
    case 'widow': {
      const widow = live(s, b.who);
      const dead = b.forId ? s.characters[b.forId] : undefined;
      if (!widow || !dead) return undefined;
      const label = `${dead.firstName}'s widow`;
      return ev(s, 'tr_widow', `${widow.firstName} ${widow.lastName} disputes the family's claim`,
        `${dead.firstName} ${dead.lastName} died owing the family ${$(b.amount ?? 0)}. The underboss wants it from the estate. ${widow.firstName} says ${dead.firstName} paid for years and the house is all she has, and half of what he had was hers.`,
        [widow.id], [
          { id: 'forgive', label: 'Forgive it, and send her something', because: `forgave ${dead.firstName}'s debt and helped his widow`, effects: [op({ op: 'pay', charId: widow.id, amount: 500, from: 'personal', why: 'for the widow' }, label), { type: 'opinion', from: widow.id, to: boss.id, amount: 15, reason: 'Took care of me', decay: 1, label }, { type: 'crewOpinion', amount: 2, reason: 'The boss takes care of the widows', label }] },
          { id: 'split', label: 'Take half from the estate', because: `took half of ${dead.firstName}'s debt from his widow`, effects: [{ type: 'money', amount: Math.round((b.amount ?? 0) / 2), label: `${label}: half from the estate` }, { type: 'wealth', charId: widow.id, amount: -Math.round((b.amount ?? 0) / 2), label }, { type: 'opinion', from: widow.id, to: boss.id, amount: -8, reason: 'Took from a widow', decay: 1, label }] },
          { id: 'insist', label: 'The family is owed', because: `collected ${dead.firstName}'s debt from his widow`, effects: [{ type: 'money', amount: b.amount ?? 0, label: `${label}: the debt from the estate` }, { type: 'wealth', charId: widow.id, amount: -(b.amount ?? 0), label }, { type: 'respect', amount: -2, label }, { type: 'crewOpinion', amount: -3, reason: 'Squeezed a widow', label }] },
        ], { family: true, theme: 'family', pri: 46 });
    }
    case 'ub_caught': {
      const ub = live(s, b.who);
      if (!ub) return undefined;
      const label = `${ub.firstName}'s count`;
      return ev(s, 'tr_ubcaught', 'The underboss\'s count does not add up',
        `The quiet accountant puts it in front of you: in eight weeks ${displayName(ub)} took ${$(b.amount ?? 0)} more than his share and left it out of his reports. ${t.ub.callsFirst.length ? `${t.ub.callsFirst.length} capos call him first.` : ''}`,
        [ub.id], [
          { id: 'payback', label: 'He pays it back, quietly', because: `made ${ub.firstName} pay back what he took`, effects: [op({ op: 'ubPayback' }, label), { type: 'opinion', from: ub.id, to: boss.id, amount: -10, reason: 'Caught me with my hand out', decay: 1, label }, { type: 'meter', from: ub.id, to: boss.id, meter: 'fear', amount: 15, label }, op({ op: 'base', amount: -15 }, label)] },
          { id: 'demote', label: 'Take the seat from him', because: `took the underboss's seat from ${ub.firstName}`, effects: [op({ op: 'ubPayback' }, label), { type: 'seat', seat: 'underboss', charId: '', label }, { type: 'opinion', from: ub.id, to: boss.id, amount: -30, reason: 'Disgraced me', decay: 1, label }, { type: 'meter', from: ub.id, to: boss.id, meter: 'grievance', amount: 25, label }, op({ op: 'base', amount: 0, clear: true }, label)] },
          { id: 'let', label: 'Let it go; you know now', because: `let ${ub.firstName}'s skim go`, effects: [op({ op: 'base', amount: 5 }, label)] },
        ], { mandatory: true, pri: 80, theme: 'crew', charId: ub.id });
    }
    case 'grievance': {
      if (!who) return undefined;
      const label = `${who.firstName}'s grievance`;
      return ev(s, 'tr_grievance', `${who.firstName} ${who.lastName} has not forgotten his number`,
        b.ref
          ? `You told ${who.firstName} his assessment stood. He was right, and he knows you know. He has started telling the story at the club: the boss shorted him ${$(b.amount ?? 0)} and would not look at the figures. ${opinion(s, who.id, boss.id) < 0 ? 'He is listening when other capos complain.' : ''}`
          : `${displayName(who)} has held money back from his envelope twice now, and he does not pretend it was a bad week. He thinks his end is too small, ${$(b.amount ?? 0)} too small, and he says so at the club. ${opinion(s, who.id, boss.id) < 0 ? 'Other men are listening.' : ''}`,
        [who.id], [
          { id: 'amends', label: `Make it right (${$(b.amount ?? 0)} and an apology)`, because: `made amends to ${who.firstName}`, effects: [op({ op: 'refund', charId: who.id, amount: b.amount ?? 0, from: 'treasury' }, label), { type: 'opinion', from: who.id, to: boss.id, amount: 12, reason: 'The boss made it right', decay: 1, label }, { type: 'meter', from: who.id, to: boss.id, meter: 'grievance', amount: -20, label }] },
          { id: 'contract', label: 'A better contract instead (+5%)', because: `gave ${who.firstName} a better contract`, effects: [{ type: 'contract', charId: who.id, keep: Math.min(0.5, Math.round(((who.keep ?? 0.3) + 0.05) * 100) / 100), label }, { type: 'meter', from: who.id, to: boss.id, meter: 'grievance', amount: -15, label }] },
          { id: 'warn', label: 'Tell him to stop talking', because: `warned ${who.firstName} to stop talking`, effects: [{ type: 'meter', from: who.id, to: boss.id, meter: 'fear', amount: 10, label }, { type: 'meter', from: who.id, to: boss.id, meter: 'grievance', amount: 10, label }, { type: 'opinion', from: who.id, to: boss.id, amount: -6, reason: 'Threatened me for being right', decay: 1, label }] },
        ], { pri: 57, theme: 'crew', charId: who.id });
    }
    case 'ub_ill': {
      const ub = live(s, b.who);
      if (!ub) return undefined;
      const label = `${ub.firstName}'s health`;
      return ev(s, 'tr_ubill', `${ub.firstName} ${ub.lastName} cannot do the count`,
        `${displayName(ub)} is laid up (his health is ${Math.round(ub.health)}). The envelopes are piling up in his kitchen. The capos do not know who to bring them to.`,
        [ub.id], [
          { id: 'acting', label: 'Name an acting underboss: the consigliere holds it', because: `let the consigliere hold the envelope while ${ub.firstName} recovers`, effects: [{ type: 'seat', seat: 'underboss', charId: '', label }, { type: 'opinion', from: ub.id, to: boss.id, amount: -6, reason: 'Replaced me while I was sick', decay: 1, label }] },
          { id: 'wait', label: 'Wait for him', because: `waited for ${ub.firstName} to recover`, effects: [{ type: 'opinion', from: ub.id, to: boss.id, amount: 8, reason: 'Kept my seat while I was sick', decay: 1, label }] },
        ], { pri: 60, theme: 'crew', charId: ub.id });
    }
  }
  return undefined;
}

function beatSource(s: GameState): EventInstance | undefined {
  const t = s.tribute;
  if (!t?.beats.length || s.gameOver) return undefined;
  t.beats = t.beats.filter((b) => s.week - b.week <= 6);
  const ok = t.beats.filter((b) => s.week - (t.cool[b.kind] ?? -999) >= (COOLDOWN[b.kind] ?? 8)).sort((a, b) => b.pri - a.pri);
  for (const b of ok) {
    const e = buildBeat(s, b);
    t.beats = t.beats.filter((x) => x !== b);
    if (!e) continue;
    t.cool[b.kind] = s.week;
    return e;
  }
  return undefined;
}

registerEventSource(audienceSource);
registerEventSource(beatSource);
