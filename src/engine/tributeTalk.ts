import { isInSeason } from './calendar';
import { rand, type RngHolder } from './rng';
import type { CrewLine, ShortReason, TributeReport, UbType } from './tributeState';
import type { Character, GameState } from './types';

/**
 * The underboss's words on Monday morning. Every figure comes from the
 * week's records (the crews' table, his share, the envelope, last week's,
 * the issues and petitions, his recommended split); the bank holds well over
 * a hundred lines across his temperament (loyal, ambitious, overwhelmed,
 * acting), the season and what happened, and a line is not used again until
 * the others that fit have been (`tribute.said`).
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numWord(n: number): string {
  n = Math.round(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${numWord(n % 100)}` : ''}`;
  return String(n);
}

/** Money the way a man says it across a desk: "forty-three hundred", "thirty-seven grand". */
export function spoken(v: number): string {
  const n = Math.max(0, Math.round(v));
  if (n < 100) return n === 1 ? 'a dollar' : `${numWord(n)} dollars`;
  if (n < 1000) {
    const r = Math.round(n / 50) * 50;
    if (r === 100) return 'a hundred';
    return r % 100 ? `${numWord(Math.floor(r / 100))}-fifty` : `${numWord(r / 100)} hundred`;
  }
  if (n < 10000) {
    const h = Math.round(n / 100);
    if (h === 10) return 'a grand';
    if (h % 10 === 0) return `${numWord(h / 10)} grand`;
    return `${numWord(h)} hundred`;
  }
  const k = Math.round(n / 1000);
  return k < 100 ? `${numWord(k)} grand` : `$${k}K`;
}

interface TC {
  s: GameState;
  rep: TributeReport;
  ub?: Character;
  boss: Character;
  type: UbType;
  season: boolean;
  good: CrewLine[];
  short: CrewLine[];
  top?: CrewLine;
  cl?: CrewLine;
  capo?: Character;
  member?: Character;
  reason?: ShortReason;
  amount?: number;
}

type Line = { id: string; when?: (c: TC) => boolean; say: (c: TC) => string };

const nick = (c?: Character) => (c ? c.nickname ?? c.lastName : 'somebody');
const first = (c?: Character) => (c ? c.firstName : 'somebody');
/** The man a petition is for: "himself" when he asks for his own. */
const forWho = (c: TC) => (c.member && c.capo && c.member.id === c.capo.id ? 'himself' : first(c.member));
const bossName = (c: TC) => (c.boss.gender === 'F' ? 'boss' : 'boss');
const isT = (...ts: UbType[]) => (c: TC) => ts.includes(c.type);
const PLACE = ['the restaurant', 'the card game', 'the jukeboxes', 'the parking lot', 'the bar', 'the vending route', 'the numbers', 'the book', 'the bowling alley', 'the arcade', 'the laundromat', 'the motel'];
const place = (c: TC) => PLACE[(c.rep.week + (c.capo?.id.length ?? 0) * 7) % PLACE.length];
const again = (c: TC) => (c.cl?.again ? ' again' : '');
const amt = (c: TC) => spoken(c.amount ?? 0);
const pct = (bp: number) => `${Math.round(bp / 100)}`;
const cap1 = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

const OPEN: Line[] = [
  { id: 'o_l1', when: isT('loyal'), say: (c) => `Morning, ${bossName(c)}. Coffee's on. I got the whole week here.` },
  { id: 'o_l2', when: isT('loyal'), say: () => 'Sit down. Let me go through it before the phone starts.' },
  { id: 'o_l3', when: isT('loyal'), say: () => 'I counted it twice. You want the good news first, or the rest?' },
  { id: 'o_l4', when: (c) => c.type === 'loyal' && c.season, say: () => 'The boardwalk was packed all week. Here\'s what came of it.' },
  { id: 'o_l5', when: (c) => c.type === 'loyal' && !c.season, say: () => 'Quiet week on the island. Quiet weeks still count.' },
  { id: 'o_l6', when: isT('loyal'), say: () => 'Everybody came in by Sunday night. Here it is.' },
  { id: 'o_l7', when: isT('loyal'), say: () => 'I\'ll keep it short. You\'ve got the barber at ten.' },
  { id: 'o_l8', when: (c) => c.type === 'loyal' && !c.season, say: () => 'Cold in here. You should get that radiator looked at. Anyway — the week.' },
  { id: 'o_l9', when: isT('loyal'), say: () => 'Before anything else: the books balance. Now the details.' },
  { id: 'o_l10', when: (c) => c.type === 'loyal' && c.season, say: () => 'Hot one. The ice man was late, the fellas weren\'t. Here\'s the week.' },
  { id: 'o_a1', when: isT('ambitious'), say: () => 'Big week. The fellas are happy. I made sure of it.' },
  { id: 'o_a2', when: isT('ambitious'), say: () => 'I talked to every crew myself this week. They like it when somebody listens.' },
  { id: 'o_a3', when: isT('ambitious'), say: () => 'Don\'t get up. I\'ll tell you what you need to know.' },
  { id: 'o_a4', when: (c) => c.type === 'ambitious' && !!c.top, say: (c) => `${nick(c.s.characters[c.top!.capoId])} says hello. He calls me now. Saves you the trouble.` },
  { id: 'o_a5', when: (c) => c.type === 'ambitious' && !c.season, say: () => 'Winter\'s slow, but my guys are still moving.' },
  { id: 'o_a6', when: isT('ambitious'), say: () => 'You look tired. Let me carry the weight on this stuff; that\'s what I\'m here for.' },
  { id: 'o_a7', when: isT('ambitious'), say: () => 'I had dinner with three of the capos Saturday. Good men. They\'re with us.' },
  { id: 'o_o1', when: isT('overwhelmed'), say: () => 'Sorry I\'m late. Two crews brought it in this morning.' },
  { id: 'o_o2', when: isT('overwhelmed'), say: () => 'I got most of it here. Don\'t ask me where the adding machine went.' },
  { id: 'o_o3', when: isT('overwhelmed'), say: () => 'I\'ve been on the phone since six. Here — I think that\'s everything.' },
  { id: 'o_o4', when: isT('overwhelmed'), say: () => 'There\'s a lot of men now. A lot of envelopes. I\'m doing my best.' },
  { id: 'o_o5', when: isT('overwhelmed'), say: () => 'Give me a minute, the numbers are on the back of a menu.' },
  { id: 'o_c1', when: isT('acting', 'none'), say: () => 'Until you put somebody in that chair, I\'m holding this. I don\'t like it.' },
  { id: 'o_c2', when: isT('acting', 'none'), say: () => 'I did the count myself. It\'s rough. Nobody tells me anything.' },
  { id: 'o_c3', when: isT('acting', 'none'), say: () => 'You need an underboss. Meantime, here\'s what I got.' },
  { id: 'o_c4', when: isT('acting', 'none'), say: () => 'The capos don\'t know who to bring it to. Some came to me, some waited.' },
];

const GOOD: Line[] = [
  { id: 'g1', when: (c) => c.good.length >= 2 && !c.short.length, say: () => 'Every crew came in clean. Every one.' },
  { id: 'g2', when: (c) => c.good.length >= 2, say: (c) => `${cap1(numWord(c.good.length))} crews came in good.` },
  { id: 'g3', when: (c) => c.good.length === 1, say: (c) => `${nick(c.s.characters[c.good[0].capoId])} came in clean, like always.` },
  { id: 'g4', when: (c) => !!c.top && c.top.remitted > 0, say: (c) => `${nick(c.s.characters[c.top!.capoId])} had the best week: ${spoken(c.top!.remitted)} up from his crew.` },
  { id: 'g5', when: (c) => c.season && c.good.length >= 2, say: (c) => `The Season's doing what the Season does. ${cap1(numWord(c.good.length))} crews right on the number.` },
  { id: 'g6', when: (c) => c.good.length >= 2, say: (c) => `No complaints from ${numWord(c.good.length)} of them. That's a good week.` },
  { id: 'g7', when: (c) => !c.rep.crews.length, say: () => 'No crews to speak of yet. It\'s the men\'s own hustle, what there is of it.' },
  { id: 'g8', when: (c) => c.good.length >= 1 && c.short.length >= 1, say: (c) => `${cap1(numWord(c.good.length))} on the number. The rest I'll tell you about.` },
  { id: 'g9', when: (c) => c.good.length >= 3, say: () => 'The capos earned this week. You should tell them so.' },
  { id: 'g10', when: (c) => !c.season && c.good.length >= 1, say: (c) => `Even in this weather, ${numWord(c.good.length)} crew${c.good.length > 1 ? 's' : ''} made the number.` },
];

const SHORT: Record<ShortReason | 'held', Line[]> = {
  bad_week: [
    { id: 's_bw1', say: (c) => `${nick(c.capo)}'s short${again(c)}, says ${place(c)} had a bad week.` },
    { id: 's_bw2', say: (c) => `${nick(c.capo)} came in ${amt(c)} light. Rain, he says. It did rain.` },
    { id: 's_bw3', say: (c) => `${nick(c.capo)}'s crew is ${amt(c)} short${again(c)}. ${first(c.member)} had a bad week; I believe him.` },
    { id: 's_bw4', say: (c) => `${nick(c.capo)} says the tourists didn't spend. ${cap1(amt(c))} short.` },
    { id: 's_bw5', say: (c) => `${nick(c.capo)}'s down ${amt(c)}. ${first(c.member)}'s corner was dead all week.` },
  ],
  default: [
    { id: 's_df1', say: (c) => `${nick(c.capo)}'s light ${amt(c)}. A customer stiffed ${first(c.member)}.` },
    { id: 's_df2', say: (c) => `Somebody owes ${first(c.member)} and didn't pay, so ${nick(c.capo)}'s short${again(c)}.` },
    { id: 's_df3', say: (c) => `${nick(c.capo)}: ${amt(c)} missing. A guy on the Crest welshed on ${first(c.member)}.` },
    { id: 's_df4', say: (c) => `${first(c.member)} carried a marker that went bad. ${nick(c.capo)} is ${amt(c)} short.` },
  ],
  mistake: [
    { id: 's_mi1', say: (c) => `${nick(c.capo)}'s count was off ${amt(c)}. A mistake, he says. He'll fix it next week.` },
    { id: 's_mi2', say: (c) => `There's ${amt(c)} missing from ${nick(c.capo)}'s envelope. Somebody can't add.` },
    { id: 's_mi3', say: (c) => `${first(c.member)} miscounted. ${cap1(amt(c))}. It'll turn up.` },
  ],
  overspent: [
    { id: 's_ov1', say: (c) => `${first(c.member)} spent it. He says so himself. ${nick(c.capo)}'s short ${amt(c)}.` },
    { id: 's_ov2', say: (c) => `${first(c.member)} was at the track again. ${nick(c.capo)} is ${amt(c)} short.` },
    { id: 's_ov3', say: (c) => `${first(c.member)} drank a piece of the envelope, near enough. ${cap1(amt(c))}.` },
  ],
  grievance: [
    { id: 's_gr1', say: (c) => `${nick(c.capo)} is short ${amt(c)} and he isn't sorry. He says his end's too small.` },
    { id: 's_gr2', say: (c) => `${first(c.member)} held back ${amt(c)}. He thinks he's worth more than he's getting.` },
    { id: 's_gr3', say: (c) => `${first(c.member)} has a beef about his cut. ${cap1(amt(c))} of it stayed in his pocket.` },
  ],
  promised: [
    { id: 's_pr1', say: (c) => `${first(c.member)}'s money went somewhere else. He owed somebody. ${nick(c.capo)}'s short ${amt(c)}.` },
    { id: 's_pr2', say: (c) => `${nick(c.capo)} says ${first(c.member)} promised that money out before he promised it to us.` },
  ],
  investigation: [
    { id: 's_in1', say: (c) => `${first(c.member)} is lying low. The government's asking about him. ${nick(c.capo)}'s short ${amt(c)}.` },
    { id: 's_in2', say: (c) => `${first(c.member)} won't touch an envelope while they're watching him. ${cap1(amt(c))} short.` },
  ],
  lying: [
    { id: 's_ly1', say: (c) => `${nick(c.capo)}'s short ${amt(c)}. ${first(c.member)} says it was a bad week. It wasn't.` },
    { id: 's_ly2', say: (c) => `I don't like ${first(c.member)}'s story. ${cap1(amt(c))} doesn't just disappear.` },
    { id: 's_ly3', say: (c) => `${first(c.member)} is ${amt(c)} short and he's telling everybody a different reason.` },
  ],
  carried: [
    { id: 's_ca1', say: (c) => `${nick(c.capo)}'s covering for ${first(c.member)} out of his own pocket. Second week now.` },
    { id: 's_ca2', say: (c) => `${first(c.member)}'s struggling. ${nick(c.capo)} made up the difference himself. That's a good capo.` },
  ],
  late: [{ id: 's_la1', say: (c) => `${nick(c.capo)}'s money isn't all counted yet. ${cap1(amt(c))} comes next week.` }],
  held: [
    { id: 's_he1', say: (c) => `${nick(c.capo)} held back ${amt(c)}. Says the winter's slow, he'll make it up in the spring.` },
    { id: 's_he2', say: (c) => `${nick(c.capo)}'s envelope is thin${again(c)}. Winter, he says. It's on the books.` },
    { id: 's_he3', say: (c) => `${nick(c.capo)} owes us ${amt(c)} from the off-season. He knows it.` },
  ],
};
const PROTECT: Line[] = [
  { id: 's_pt1', say: (c) => `Don't worry about ${nick(c.capo)}. I'll handle it.` },
  { id: 's_pt2', say: (c) => `${nick(c.capo)}'s a little light. Nothing. He's good for it, I vouch for him.` },
  { id: 's_pt3', say: (c) => `${nick(c.capo)} had a thing come up. I told him take a week.` },
];

const UBSHARE: Line[] = [
  { id: 'u_l1', when: isT('loyal'), say: (c) => `I took my ${numWord(c.s.tribute!.ub.rateBp / 100)} percent, like we agreed. ${cap1(spoken(c.rep.ubShare))}.` },
  { id: 'u_l2', when: isT('loyal'), say: (c) => `My end's out already: ${spoken(c.rep.ubShare)}. Count it if you want.` },
  { id: 'u_l3', when: isT('loyal'), say: (c) => `I took ${spoken(c.rep.ubShare)}, my piece. Not a dollar more.` },
  { id: 'u_l4', when: isT('loyal'), say: (c) => `${cap1(spoken(c.rep.ubShare))} came out for me. It's on the sheet.` },
  { id: 'u_a1', when: isT('ambitious'), say: () => 'My end\'s taken care of.' },
  { id: 'u_a2', when: isT('ambitious'), say: () => 'I took my piece. You don\'t need to worry about my piece.' },
  { id: 'u_a3', when: isT('ambitious'), say: (c) => `Mine's out. ${cap1(spoken(c.rep.ubShare))}, give or take.` },
  { id: 'u_o1', when: isT('overwhelmed'), say: (c) => `I took mine. ${cap1(numWord(c.s.tribute!.ub.rateBp / 100))} percent, I think. I'd have to look.` },
  { id: 'u_o2', when: isT('overwhelmed'), say: () => 'My end\'s out. I didn\'t get to write it down yet.' },
  { id: 'u_c1', when: isT('acting', 'none'), say: () => 'I didn\'t take anything for holding it. Wouldn\'t be right.' },
  { id: 'u_c2', when: isT('acting', 'none'), say: () => 'Nothing for me in there. I\'m just holding it.' },
];

const PRESENT: Line[] = [
  { id: 'p1', say: (c) => `I got ${spoken(c.rep.presented)} for you.` },
  { id: 'p2', say: (c) => `Here's ${spoken(c.rep.presented)}. It's all there.` },
  { id: 'p3', say: (c) => `${cap1(spoken(c.rep.presented))} in the envelope.` },
  { id: 'p4', say: (c) => `It comes to ${spoken(c.rep.presented)}.` },
  { id: 'p5', when: isT('loyal'), say: (c) => `That's ${spoken(c.rep.presented)}. Counted it twice.` },
  { id: 'p6', when: isT('ambitious'), say: (c) => `${cap1(spoken(c.rep.presented))}. The crews did good by you.` },
  { id: 'p7', when: isT('overwhelmed', 'acting'), say: (c) => `It's ${spoken(c.rep.presented)}. That's what I have right now.` },
  { id: 'p8', when: (c) => !!c.rep.lastPresented && c.rep.presented > c.rep.lastPresented * 1.3, say: (c) => `${cap1(spoken(c.rep.presented))}. Best envelope in a while.` },
  { id: 'p9', when: (c) => c.rep.presented < 300, say: (c) => `It's a thin one. ${cap1(spoken(c.rep.presented))}.` },
  { id: 'p10', say: (c) => `${cap1(spoken(c.rep.presented))}, boss. Your envelope.` },
];

const COMPARE: Line[] = [
  { id: 'cu1', when: (c) => diff(c) >= 100, say: (c) => `That's up ${spoken(diff(c))} on last week.` },
  { id: 'cu2', when: (c) => diff(c) >= 100, say: (c) => `Better than last week by ${spoken(diff(c))}.` },
  { id: 'cu3', when: (c) => diff(c) >= 100, say: (c) => `${cap1(spoken(diff(c)))} more than last Monday.` },
  { id: 'cu4', when: (c) => diff(c) >= 100 && c.season, say: () => 'The summer people are spending. Up on last week.' },
  { id: 'cd1', when: (c) => diff(c) <= -100, say: (c) => `It's down ${spoken(-diff(c))} from last week.` },
  { id: 'cd2', when: (c) => diff(c) <= -100, say: (c) => `Last week was better by ${spoken(-diff(c))}.` },
  { id: 'cd3', when: (c) => diff(c) <= -100 && c.short.length > 0, say: (c) => `${cap1(spoken(-diff(c)))} less than last time, and you know why.` },
  { id: 'cd4', when: (c) => diff(c) <= -100 && !c.season, say: () => 'Down on last week. The off-season does that.' },
  { id: 'cs1', when: (c) => c.rep.lastPresented !== undefined && Math.abs(diff(c)) < 100, say: () => 'About the same as last week.' },
  { id: 'cs2', when: (c) => c.rep.lastPresented !== undefined && Math.abs(diff(c)) < 100, say: () => 'Right where it was last week. Steady.' },
];
function diff(c: TC): number {
  return c.rep.lastPresented === undefined ? 0 : c.rep.presented - c.rep.lastPresented;
}

const ISSUE: Record<string, Line[]> = {
  legal: [
    { id: 'i_lg1', say: (c) => `But we got legal bills coming: ${amt(c)}.` },
    { id: 'i_lg2', say: (c) => `The lawyers want ${amt(c)} before the hearing.` },
    { id: 'i_lg3', say: (c) => `Don't forget the lawyer. ${cap1(amt(c))}, he says, and he means soon.` },
  ],
  tribute: [
    { id: 'i_tr1', say: (c) => `Philadelphia's envelope is due: ${amt(c)}.` },
    { id: 'i_tr2', say: (c) => `The bag goes to Philly this week. ${cap1(amt(c))}.` },
    { id: 'i_tr3', say: (c) => `Remember the drop for Philadelphia. ${cap1(amt(c))}, give or take.` },
  ],
  treasury: [
    { id: 'i_ts1', say: (c) => `The family's running thin: ${spoken(Math.max(0, c.amount ?? 0))} in the drawer.` },
    { id: 'i_ts2', say: (c) => `We're down to ${spoken(Math.max(0, c.amount ?? 0))} for payroll. I'm telling you so you hear it from me.` },
    { id: 'i_ts3', say: () => 'Payroll\'s tight. The family needs this one more than you do.' },
  ],
  dispute: [
    { id: 'i_ds1', say: (c) => `${nick(c.capo)} wants to talk about his number. He thinks we've got it wrong.` },
    { id: 'i_ds2', say: (c) => `${nick(c.capo)} says his assessment's too high. He's going to ask you himself.` },
    { id: 'i_ds3', say: (c) => `${nick(c.capo)} brought his own figures. They don't match mine.` },
  ],
  greed: [
    { id: 'i_gr1', say: () => 'And, boss — the fellas notice where the money goes. I\'m just saying.' },
    { id: 'i_gr2', say: () => 'People talk when the family\'s short and the boss\'s car is new.' },
    { id: 'i_gr3', say: () => 'The capos are asking why the family\'s end keeps shrinking. I don\'t have an answer for them.' },
  ],
  acting: [
    { id: 'i_ac1', say: () => 'You need to name somebody. The capos are confused.' },
    { id: 'i_ac2', say: () => 'Every week without an underboss, a little more goes missing in the shuffle.' },
  ],
  late: [
    { id: 'i_lt1', say: (c) => `Some of it isn't counted yet. ${cap1(amt(c))} comes next week.` },
    { id: 'i_lt2', say: (c) => `I'm behind on the count. ${cap1(amt(c))} is still in the bag downstairs.` },
  ],
  debt: [{ id: 'i_db1', say: (c) => `The loan payment's due again: ${amt(c)}.` }],
};

const PETITION: Record<string, Line[]> = {
  families: [
    { id: 'pe_f1', say: (c) => `${first(c.capo)} wants another ${amt(c)} put aside for the families.` },
    { id: 'pe_f2', say: (c) => `${first(c.capo)} asked about the wives of the men inside. ${cap1(amt(c))} would do it.` },
    { id: 'pe_f3', say: (c) => `The families of the men inside, boss. ${first(c.capo)} says ${amt(c)} keeps them quiet and fed.` },
  ],
  extension: [
    { id: 'pe_e1', say: (c) => `${first(c.capo)} wants four more weeks for ${forWho(c)} to make it good.` },
    { id: 'pe_e2', say: (c) => `${first(c.capo)} is asking for time for ${forWho(c)}. ${cap1(amt(c))} owed.` },
  ],
  advance: [
    { id: 'pe_a1', say: (c) => `${first(c.member)} asked for an advance, ${amt(c)}. Rent and the kids' shoes.` },
    { id: 'pe_a2', say: (c) => `${first(c.member)} wants ${amt(c)} against next month. He's good for it, ${first(c.capo)} says.` },
  ],
  help: [
    { id: 'pe_h1', say: (c) => `${first(c.member)} can't cover his household this month. ${first(c.capo)} asked if the family can help: ${amt(c)}.` },
    { id: 'pe_h2', say: (c) => `${first(c.member)}'s wife called ${first(c.capo)}'s wife. ${cap1(amt(c))} would carry them.` },
  ],
  investment: [
    { id: 'pe_i1', say: (c) => `${first(c.capo)} has a thing: ${c.rep.petitions[0]?.text}. He wants ${amt(c)} out of the reserve.` },
    { id: 'pe_i2', say: (c) => `${first(c.capo)} pitched me ${c.rep.petitions[0]?.text}. ${cap1(amt(c))}. He swears by it.` },
  ],
  legal: [
    { id: 'pe_l1', say: (c) => `${first(c.capo)} wants ${amt(c)} for a real lawyer for ${forWho(c)}. Before the grand jury gets to him.` },
    { id: 'pe_l2', say: (c) => `${first(c.member)}'s in trouble downtown. ${first(c.capo)} says ${amt(c)} for a good lawyer is cheaper than what happens if he talks.` },
  ],
};

const REC: Line[] = [
  { id: 'r_l1', when: isT('loyal'), say: (c) => `If it was me: ${pct(c.rep.rec.personal)} percent for you, ${pct(c.rep.rec.treasury)} for the family, ${pct(c.rep.rec.reserve)} put aside.` },
  { id: 'r_l2', when: isT('loyal'), say: (c) => `My advice? Take ${pct(c.rep.rec.personal)}, leave ${pct(c.rep.rec.treasury)} in the drawer, put ${pct(c.rep.rec.reserve)} away.` },
  { id: 'r_l3', when: isT('loyal'), say: (c) => `I'd split it ${pct(c.rep.rec.personal)}, ${pct(c.rep.rec.treasury)}, ${pct(c.rep.rec.reserve)}. You, the family, the rainy day.` },
  { id: 'r_l4', when: (c) => c.type === 'loyal' && c.rep.rec.reserve >= 2000, say: (c) => `Put ${pct(c.rep.rec.reserve)} percent away this week. I mean it.` },
  { id: 'r_a1', when: isT('ambitious'), say: (c) => `Take ${pct(c.rep.rec.personal)}. You earned it. Leave ${pct(c.rep.rec.treasury)} for the family; I'll make it stretch.` },
  { id: 'r_a2', when: isT('ambitious'), say: (c) => `Treat yourself: ${pct(c.rep.rec.personal)} percent. The crews are my worry.` },
  { id: 'r_a3', when: isT('ambitious'), say: (c) => `${pct(c.rep.rec.personal)} for you, boss. A man in your spot should live like it.` },
  { id: 'r_o1', when: isT('overwhelmed'), say: () => 'Same split as always, I guess.' },
  { id: 'r_o2', when: isT('overwhelmed'), say: () => 'However you usually do it. I didn\'t get to the bills.' },
  { id: 'r_c1', when: isT('acting', 'none'), say: () => 'I\'d do what you always do.' },
  { id: 'r_c2', when: isT('acting', 'none'), say: () => 'Not my place to say how you split it.' },
];

const DISAGREE: Line[] = [
  { id: 'd_l1', when: (c) => c.type === 'loyal' && c.rep.rec.personal < c.s.tribute!.policy.personal, say: (c) => `I know you like ${pct(c.s.tribute!.policy.personal)} for yourself. This week I'd take less.` },
  { id: 'd_l2', when: (c) => c.type === 'loyal' && c.rep.rec.personal < c.s.tribute!.policy.personal, say: () => 'I\'m going to say it once: your usual split doesn\'t fit this week.' },
  { id: 'd_a1', when: (c) => c.type === 'ambitious' && c.rep.rec.personal > c.s.tribute!.policy.personal, say: (c) => `You're too hard on yourself, taking ${pct(c.s.tribute!.policy.personal)}.` },
  { id: 'd_a2', when: (c) => c.type === 'ambitious' && c.rep.rec.personal > c.s.tribute!.policy.personal, say: () => 'You keep giving it all back to the family. People think you\'re saving up to leave.' },
];

const CLOSE: Line[] = [
  { id: 'c1', say: () => 'That\'s it. Anything else, you know where I am.' },
  { id: 'c2', say: () => 'I\'ll be at the club if you need me.' },
  { id: 'c3', say: () => 'You want to look at the crews\' books, they\'re right here.' },
  { id: 'c4', say: () => 'That\'s the week.' },
  { id: 'c5', when: (c) => c.season, say: () => 'Another big week coming, with this weather.' },
  { id: 'c6', when: (c) => !c.season, say: () => 'Long winter. We\'ll get through it.' },
  { id: 'c7', when: isT('ambitious'), say: () => 'Leave the crews to me. Enjoy your Sunday.' },
  { id: 'c8', when: isT('overwhelmed'), say: () => 'I\'ll get you the rest of the count by Wednesday. Thursday.' },
  { id: 'c9', when: isT('loyal'), say: () => 'Say the word and I\'ll talk to whoever needs talking to.' },
  { id: 'c10', when: isT('acting', 'none'), say: () => 'Name somebody soon. Please.' },
  { id: 'c11', say: () => 'Same time next Monday.' },
];

/** Every line id in the bank (tests: the bank is big enough and ids are unique). */
export function allTalkIds(): string[] {
  const all = [...OPEN, ...GOOD, ...Object.values(SHORT).flat(), ...PROTECT, ...UBSHARE, ...PRESENT, ...COMPARE, ...Object.values(ISSUE).flat(), ...Object.values(PETITION).flat(), ...REC, ...DISAGREE, ...CLOSE];
  return all.map((l) => l.id);
}

function choose(s: GameState, lines: Line[], c: TC, h: RngHolder): { id: string; text: string } | undefined {
  const t = s.tribute!;
  // The man holding the envelope never talks about himself in the third person ("Slim says his assessment's too
  // high" from Slim): when the capo in question is the speaker, the lines that name him are passed over.
  const self = !!(c.capo && c.ub && c.capo.id === c.ub.id);
  const names = self ? [nick(c.capo), first(c.capo)].filter((x) => x && x !== 'somebody') : [];
  const ok = lines.filter((l) => (!l.when || l.when(c)) && !(self && names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(l.say(c)))));
  if (!ok.length) return undefined;
  const fresh = ok.filter((l) => !t.said.includes(l.id));
  let pick: Line;
  if (fresh.length) pick = fresh[Math.floor(rand(h) * fresh.length)];
  else pick = ok.slice().sort((a, b) => t.said.indexOf(a.id) - t.said.indexOf(b.id))[0];
  t.said = t.said.filter((x) => x !== pick.id);
  t.said.push(pick.id);
  if (t.said.length > 150) t.said.shift();
  return { id: pick.id, text: pick.say(c) };
}

/** The scene's dialogue for one week's report, from the records. */
export function tributeTalk(s: GameState, rep: TributeReport, h: RngHolder): { id: string; text: string }[] {
  const ub = rep.ubId ? s.characters[rep.ubId] : undefined;
  const crews = rep.crews.filter((x) => x.due > 0 || x.remitted > 0);
  const short = crews.filter((x) => x.short > 0 || x.held > 0).sort((a, b) => b.short + b.held - (a.short + a.held));
  const good = crews.filter((x) => x.short === 0 && x.held === 0);
  const top = crews.slice().sort((a, b) => b.remitted - a.remitted)[0];
  const base: TC = { s, rep, ub, boss: s.characters[s.playerId], type: rep.ubType, season: isInSeason(s.date), good, short, top };
  const out: { id: string; text: string }[] = [];
  const add = (x?: { id: string; text: string }) => { if (x) out.push(x); };
  add(choose(s, OPEN, base, h));
  add(choose(s, GOOD, base, h));
  for (const cl of short.slice(0, 2)) {
    const capo = s.characters[cl.capoId];
    const worst = cl.members.filter((m) => m.due > m.paid).sort((a, b) => b.due - b.paid - (a.due - a.paid))[0];
    const member = worst ? s.characters[worst.id] : undefined;
    const c: TC = { ...base, cl, capo, member: member ?? capo };
    if (rep.ubType === 'ambitious' && s.tribute!.ub.callsFirst.includes(cl.capoId)) add(choose(s, PROTECT, c, h));
    else if (cl.held > 0 && cl.short === 0) add(choose(s, SHORT.held, { ...c, amount: cl.held }, h));
    else add(choose(s, SHORT[worst?.believed ?? 'bad_week'], { ...c, amount: cl.short }, h));
  }
  add(choose(s, UBSHARE, base, h));
  add(choose(s, PRESENT, base, h));
  add(choose(s, COMPARE, base, h));
  const iss = rep.issues.filter((i) => i.kind !== 'short' && ISSUE[i.kind]).sort((a, b) => b.severity - a.severity).slice(0, 2);
  for (const i of iss) add(choose(s, ISSUE[i.kind], { ...base, capo: i.who ? s.characters[i.who] : undefined, amount: i.amount }, h));
  for (const p of rep.petitions.slice(0, 1)) add(choose(s, PETITION[p.kind], { ...base, capo: s.characters[p.byId], member: p.forId ? s.characters[p.forId] : undefined, amount: p.amount }, h));
  add(choose(s, REC, base, h));
  const pol = s.tribute!.policy;
  if (Math.abs(rep.rec.personal - pol.personal) >= 1500 && (rep.ubType === 'loyal' || rep.ubType === 'ambitious')) add(choose(s, DISAGREE, base, h));
  add(choose(s, CLOSE, base, h));
  return out;
}
