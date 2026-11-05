import type { Character, Effect, Ethnicity, GameState, HeatBar, Rival, RivalId } from './types';

/**
 * THE DEEP BED OF PETITIONERS (petitions.ts reads these). Each template is a person at the boss's door
 * with a problem in 1960 Wildwood: who (role, sex, age band, background), the trouble in a line or two,
 * what they offer, and three or four answers in the boss's own words. Every answer is plain Effects
 * (respect, opinion, favors owed, money, heat; the choice's `because` is its chronicle line), and where it
 * fits a consequence later with odds (`later`, run through the delayed-consequence queue).
 *
 * Fictional people only. Adults only for anything romantic or for joining the life. Nothing explicit; she
 * always decides; nothing rough on the page, and anything rough happens offstage and only when the boss
 * chooses it in so many words. The madam's petitions are `mature` (hidden when mature content is Off).
 */

export type PBg = Ethnicity | 'Greek' | 'Polish' | 'German' | 'Portuguese';
export type PSize = 'small' | 'big' | 'desperate';
export type POffer = 'respect' | 'favor' | 'payment' | 'information' | 'loyalty' | 'vote' | 'son';

/** The variables a template reads (petitions.ts petitionVars). */
export interface PV {
  s: GameState;
  who: Character;
  /** Full name, first name, last name. */
  w: string;
  f: string;
  last: string;
  fem: boolean;
  she: string; She: string; her: string; Her: string; hers: string;
  /** How the petitioner addresses the boss ("Don Michael", "Mr. Sees"). */
  addr: string;
  /** The boss is a soldier or an associate: the neighborhood's small troubles. */
  low: boolean;
  /** Money scale by station; `amt` scales a figure, `$` formats it. */
  k: number;
  amt: (n: number) => number;
  $: (n: number) => string;
  rival?: Rival;
  rn: string;
  rboss: string;
  rbossC?: Character;
  rman?: Character;
  rmanN: string;
  judge?: Character;
  cop?: Character;
  chief?: Character;
  council?: Character;
  pol?: Character;
  cons: string;
  consC?: Character;
  capo: string;
  priest: string;
  /** The real person the template is about (its `who`), if any. */
  m?: Character;
  pay: (n: number) => Effect;
  gain: (n: number) => Effect;
  resp: (n: number) => Effect;
  heat: (n: number, bar?: HeatBar) => Effect;
  op: (n: number, reason: string) => Effect;
  opOf: (id: string, n: number, reason: string) => Effect;
  owe: (y: string) => Effect;
  fav: (n: number) => Effect;
  riv: (n: number, reason: string) => Effect[];
  inf: (district: string, n: number) => Effect;
  rinf: (district: string, n: number) => Effect[];
  crew: (n: number, reason: string) => Effect;
}

/** A consequence later: `p` the chance the "yes" branch happens, in `wk` weeks. */
export interface PLater {
  p: number;
  wk: [number, number];
  hint: string;
  yes: (v: PV) => string;
  yesFx?: (v: PV) => Effect[];
  no?: (v: PV) => string;
  noFx?: (v: PV) => Effect[];
  /** Yes: the petitioner's son reports for work (a new associate). */
  son?: true;
}

export interface PAns {
  id: string;
  kind: 'grant' | 'price' | 'send' | 'refuse';
  label: string;
  detail: string;
  because: string;
  fx: Effect[];
  later?: PLater;
  off?: string;
}

export interface PTpl {
  id: string;
  role: string;
  gender: 'M' | 'F';
  age: [number, number];
  bg: PBg[];
  size: PSize;
  season?: 'summer' | 'winter';
  mature?: true;
  /** May come to a soldier or an associate (default: the small ones). */
  low?: boolean;
  weight?: number;
  rivals?: RivalId[];
  needs?: ('rival' | 'judge' | 'cop' | 'council')[];
  /** The real person it is about (undefined: the template cannot come now). */
  who?: (s: GameState) => Character | undefined;
  /** The petitioner, when it is a real person tied to `who` (his wife). */
  petitioner?: (s: GameState, m: Character) => Character | undefined;
  /** A spawned petitioner takes the last name of `who` (his wife, his mother). */
  sameName?: true;
  when?: (s: GameState) => boolean;
  title: string;
  offer: POffer;
  offerLine?: (v: PV) => string;
  problem: (v: PV) => string;
  answers: (v: PV) => PAns[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const A = (id: string, kind: PAns['kind'], label: string, detail: string, because: string, fx: Effect[], later?: PLater, off?: string): PAns => ({ id, kind, label, detail, because, fx, later, off });

/** Turned away: a chance the petitioner takes it to a rival, who gains on the street. */
const toRival = (v: PV, district: string, p = 0.35): PLater | undefined => (v.rival ? {
  p, wk: [2, 6], hint: `${v.f} takes it to ${v.rn}`,
  yes: (x) => `${x.w} took ${x.her} trouble to ${x.rboss}, who fixed it and made sure the street knew`,
  yesFx: (x) => [...x.rinf(district, 2), x.resp(-1)],
} : undefined);

/** Sent to the parish: the priest does what a priest can. */
const toPriest = (v: PV, donation = 50): PAns => A('priest', 'send', `"Go and see ${v.priest}. Tell him I sent you."`, `A ${v.$(donation)} donation with ${v.her} name on it. The parish helps; it can't do much.`, `sent ${v.w} to the parish`,
  [v.pay(donation), v.op(-2, 'Sent me to the priest'), v.resp(1)], { p: 0.5, wk: [2, 5], hint: 'the parish finds a way', yes: (x) => `${x.priest} found ${x.w} some help and told the parish where it came from`, yesFx: (x) => [x.resp(1), x.op(4, 'The priest said you sent help')], no: (x) => `the parish had nothing for ${x.w}`, noFx: (x) => [x.op(-2, 'The priest had nothing for me')] });

/** Sent to the consigliere (or the capo, at a low station): he looks into it. */
const toCons = (v: PV, what: string): PAns => A('cons', 'send', `"${v.low ? 'Talk to my capo.' : `${v.cons} will sit with you.`} He'll know what to do."`, `${v.low ? 'Your capo' : 'Your consigliere'} takes it on. It may come to nothing.`, `sent ${v.w} to ${v.cons}`,
  [v.op(-1, 'Passed me to somebody else')], { p: 0.6, wk: [1, 4], hint: `${v.cons} ${what}`, yes: (x) => `${x.cons} ${what}, and ${x.w} knows whose word it was`, yesFx: (x) => [x.resp(1), x.op(5, 'It got handled')], no: (x) => `${x.cons} couldn't do much for ${x.w}`, noFx: (x) => [x.op(-3, 'Nothing came of it')] });

/** A refusal: a little respect lost, sometimes the rival gains. */
const no = (v: PV, label: string, because: string, district = 'downtown', p = 0.3, drop = -1): PAns => A('no', 'refuse', label, 'You turn it down. People talk about who the boss turns away.', because, [v.resp(drop), v.op(-6, 'Turned me away')], toRival(v, district, p));

/** The favor comes back later. */
const favorBack = (what: string, fx: (x: PV) => Effect[], p = 0.6, wk: [number, number] = [4, 12]): PLater => ({ p, wk, hint: 'the favor comes back', yes: (x) => `${x.w} ${what}`, yesFx: fx });

const crewIn = (s: GameState) => Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && !!c.imprisonedUntil && c.imprisonedUntil > s.week && c.gender === 'M').sort((a, b) => a.id.localeCompare(b.id))[0];
const adultWife = (s: GameState, m: Character) => {
  const w = m.spouseId ? s.characters[m.spouseId] : undefined;
  return w?.alive && w.gender === 'F' && s.date.y - w.birth.y >= 19 ? w : undefined;
};

/* ------------------------------------------------------------------ */
/* The women                                                           */
/* ------------------------------------------------------------------ */

const WOMEN: PTpl[] = [
  {
    id: 'w_widow_pension', role: 'Widow', gender: 'F', age: [55, 74], bg: ['Irish', 'Italian', 'Polish'], size: 'small', title: 'A widow and the union pension', offer: 'respect',
    problem: (v) => `${v.w} buried her husband in March, thirty-one years a longshoreman. The local says his pension card was never stamped and there is no pension. "He paid dues every Friday of his life, ${v.addr}."`,
    answers: (v) => [
      A('call', 'grant', '"I\'ll call the hall. The card will turn up."', 'A word with the business agent. They owe you more than this.', `got the hall to find ${v.f}'s pension card`, [v.resp(2), v.op(10, 'Got me my husband\'s pension')], { p: 0.8, wk: [1, 3], hint: 'the card turns up', yes: (x) => `the union hall found ${x.w}'s husband's card, stamped, in a drawer`, yesFx: (x) => [x.resp(1)], no: (x) => `the hall stalled ${x.w} again; the agent wants his own envelope`, noFx: (x) => [x.op(-3, 'It did not come through')] }),
      A('pay', 'grant', '"Until they find it, you get an envelope every month from me."', `${v.$(240)} now, against the season.`, `paid ${v.f}'s pension himself`, [v.pay(240), v.resp(2), v.op(14, 'Paid me what the union would not')]),
      toPriest(v),
      no(v, '"The union\'s business is the union\'s."', `left ${v.f}'s pension to the union`, 'docks', 0.15),
    ],
  },
  {
    id: 'w_widow_boarding', role: 'Widow, keeps a rooming house', gender: 'F', age: [48, 70], bg: ['Irish', 'German', 'Italian'], size: 'desperate', season: 'winter', title: 'A widow\'s rooming house', offer: 'information',
    problem: (v) => `${v.w} keeps a rooming house on Spencer Avenue: empty from October to May and the bank wants the winter note in full. "Six rooms, ${v.addr}. In July every one of them is yours if you need a place for a man to sleep."`,
    offerLine: (v) => `${v.She} sees every summer face that comes to the island, and remembers them.`,
    answers: (v) => [
      A('note', 'grant', '"I\'ll carry the note till the season."', `${v.$(600)}. A safe house in July, and her eyes on the boarders.`, `carried ${v.f}'s winter note`, [v.pay(600), v.resp(2), v.op(14, 'Carried my note through the winter'), v.owe('Carried her winter note')], favorBack('sent word about two men from Atlantic City asking questions at her door', (x) => [x.heat(-3)])),
      A('bank', 'price', '"I\'ll talk to the bank. And two of your rooms are mine in summer."', 'A call to the bank manager. Two rooms, free, for the season.', `leaned on the bank for ${v.f}, for two rooms`, [v.resp(1), v.heat(1), v.op(6, 'Got the bank off my back, at a price')], { p: 0.75, wk: [1, 3], hint: 'the bank waits', yes: (x) => `the bank gave ${x.w} until the Fourth of July`, yesFx: (x) => [x.gain(150)], no: () => `the bank manager called the Herald instead`, noFx: (x) => [x.heat(3)] }),
      toCons(v, 'found her a buyer for the house who lets her stay on'),
      no(v, '"A house is a business, signora. Sell it."', `told ${v.f} to sell her house`, 'crest', 0.2),
    ],
  },
  {
    id: 'w_widow_headstone', role: 'Widow', gender: 'F', age: [40, 70], bg: ['Italian', 'Jewish', 'Irish'], size: 'small', low: true, title: 'A stone for the grave', offer: 'respect',
    problem: (v) => `${v.w}'s husband has been in the ground at Cold Spring a year with a wooden marker. The monument man in Rio Grande wants cash she doesn't have. "Everybody walks past him and thinks nobody loved him."`,
    answers: (v) => [
      A('stone', 'grant', '"He gets a stone. Granite. Tell them to send me the bill."', `${v.$(180)}.`, `paid for a stone on ${v.f}'s husband's grave`, [v.pay(180), v.resp(2), v.op(14, 'Put a stone on my husband\'s grave')]),
      A('talk', 'grant', '"I\'ll talk to the monument man about his price."', 'He will find a smaller number.', `got the monument man to come down for ${v.f}`, [v.pay(60), v.resp(1), v.op(8, 'Got me a fair price')]),
      toPriest(v, 30),
      no(v, '"A wooden cross is no shame."', `told ${v.f} the wooden cross would do`, 'downtown', 0.1),
    ],
  },
  {
    id: 'w_mother_arrest', role: 'Mother', gender: 'F', age: [40, 62], bg: ['Italian', 'Irish', 'Polish'], size: 'desperate', low: true, needs: ['cop'], title: 'A mother and her boy in the county jail', offer: 'son',
    problem: (v) => `${v.w}'s son, nineteen, was picked up behind a Pacific Avenue liquor store with a crowbar. ${v.cop ? `Sergeant ${v.cop.lastName}` : 'The sergeant'} says it's eighteen months in Annandale. "He was holding it for a friend. He doesn't even know the friend's last name."`,
    answers: (v) => [
      A('sergeant', 'grant', `"I'll talk to ${v.cop ? `Sergeant ${v.cop.lastName}` : 'the sergeant'}."`, 'A favor spent. The charge goes away.', `got ${v.f}'s son's charge dropped`, [v.fav(-1), v.resp(2), v.op(16, 'Brought my boy home')], { p: 0.7, wk: [6, 14], hint: 'the boy comes to work for you', son: true, yes: (x) => `${x.w}'s boy came by the club to say thank you, and stayed`, yesFx: (x) => [x.resp(1)], no: (x) => `${x.w}'s boy went straight, and his mother lights a candle for you`, noFx: (x) => [x.resp(1)] }, v.s.favors < 1 ? 'No favors to spend' : undefined),
      A('lawyer', 'grant', '"My lawyer will be at the arraignment."', `${v.$(400)}. Probation, probably.`, `sent a lawyer for ${v.f}'s son`, [v.pay(400), v.resp(1), v.op(10, 'Sent a lawyer for my boy')], { p: 0.65, wk: [2, 4], hint: 'probation', yes: (x) => `${x.w}'s son got probation and a lecture`, yesFx: (x) => [x.resp(1)], no: (x) => `${x.w}'s son got nine months in spite of the lawyer`, noFx: (x) => [x.op(-4, 'My boy went away anyway')] }),
      A('work', 'price', '"When he\'s out, he works for me. He answers to my people now."', 'He does his time, then he is yours.', `took ${v.f}'s son on for after`, [v.op(4, 'Took my boy on')], { p: 0.6, wk: [10, 20], hint: 'the boy reports when he is out', son: true, yes: (x) => `${x.w}'s son came out and came straight to the club`, no: (x) => `${x.w}'s son came out and went to Philadelphia instead` }),
      no(v, '"A crowbar is a crowbar."', `let ${v.f}'s son take his chances`, 'pacific', 0.25),
    ],
  },
  {
    id: 'w_drink_rent', role: 'Wife', gender: 'F', age: [26, 48], bg: ['Irish', 'Italian', 'Polish', 'German'], size: 'desperate', season: 'winter', low: true, title: 'A husband who drinks the rent', offer: 'respect',
    problem: (v) => `${v.w}'s husband gets paid Friday at the bottling plant and by Saturday night the rent is at the Shamrock bar on Rio Grande Avenue. Three kids, February, and the landlord on the stairs. "I don't want him hurt. I want him home on Fridays."`,
    answers: (v) => [
      A('bar', 'grant', '"Nobody on this island pours for him on a Friday. I\'ll see to it."', 'A word to every bartender who owes you. He drinks somewhere else, or not at all.', `cut off ${v.f}'s husband at every bar on the island`, [v.resp(2), v.op(14, 'Kept my husband out of the bars')], { p: 0.7, wk: [2, 6], hint: 'he comes home sober on Fridays', yes: (x) => `${x.w}'s husband started coming home on Fridays with his pay envelope sealed`, yesFx: (x) => [x.resp(1)], no: (x) => `${x.w}'s husband found a bar in Cape May that never heard your name`, noFx: (x) => [x.op(-2, 'He found another bar')] }),
      A('envelope', 'grant', '"His foreman gives the pay envelope to you, not him."', 'A call to the bottling plant. His wages go home.', `had ${v.f}'s husband's pay sent home`, [v.resp(1), v.op(12, 'Got the pay to the house'), v.heat(1)]),
      A('rent', 'grant', '"Here\'s the rent. Keep it in the coffee can, not the sugar bowl."', `${v.$(90)}.`, `paid ${v.f}'s rent`, [v.pay(90), v.op(8, 'Paid our rent')]),
      toPriest(v, 30),
    ],
  },
  {
    id: 'w_hits', role: 'Wife', gender: 'F', age: [22, 45], bg: ['Italian', 'Irish', 'Polish'], size: 'desperate', low: true, title: 'A wife who wears long sleeves in July', offer: 'respect',
    problem: (v) => `${v.w} keeps her coat on in the back room. Her husband has a temper and a heavy hand, and the last time the children saw it. She doesn't cry. "I can't go to the police. He'd be out by morning. I didn't know where else to go."`,
    offerLine: () => 'She asks for nothing for herself. She asks for the children.',
    answers: (v) => [
      A('word', 'grant', '"I\'ll have a word with him. Only a word."', 'He is told, quietly, that people are watching his house. She decides whether he comes back.', `had a word with ${v.f}'s husband`, [v.resp(2), v.op(14, 'Stood up for me and the kids')], { p: 0.65, wk: [2, 6], hint: 'he keeps his hands to himself', yes: (x) => `${x.w}'s husband understood the word; the house on Pine Avenue is quiet`, yesFx: (x) => [x.resp(1)], no: (x) => `${x.w} came back to say the word didn't hold; she wants the place for the children now`, noFx: (x) => [x.op(-2, 'It did not hold')] }),
      A('place', 'grant', '"I\'ll find you and the children a place of your own. Today."', `${v.$(300)}: an apartment in the Crest, paid through the season, and a job if she wants one. Her choice whether she goes.`, `found ${v.f} and her children a place`, [v.pay(300), v.resp(3), v.op(20, 'Gave me and the kids a way out')]),
      A('lesson', 'price', '"Some of my men will explain it to him. Away from the house."', 'Your explicit order. Nothing happens in front of her or the children. The cops may hear about it.', `had men teach ${v.f}'s husband a lesson`, [v.resp(2), v.heat(3), v.op(10, 'Made him stop'), v.crew(1, 'The boss looks after the neighborhood')], { p: 0.25, wk: [1, 3], hint: 'he goes to the cops', yes: (x) => `${x.w}'s husband went to the police; a detective asked questions at the club`, yesFx: (x) => [x.heat(4)] }),
      toPriest(v, 40),
    ],
  },
  {
    id: 'w_seamstress', role: 'Seamstress', gender: 'F', age: [24, 58], bg: ['Italian', 'Jewish', 'Polish'], size: 'small', low: true, title: 'A seamstress and the dress shop', offer: 'payment',
    problem: (v) => `${v.w} sewed forty bathing suits for a shop on the boardwalk all spring. The owner sold every one and now says the stitching was bad and won't pay. "My stitching was good enough to sell, ${v.addr}."`,
    answers: (v) => [
      A('collect', 'grant', '"He\'ll pay you. Today."', 'One of your men visits the shop. He pays, with a little extra for the delay.', `collected for ${v.f} from the dress shop`, [v.resp(2), v.op(12, 'Got me my money'), v.gain(30)], { p: 0.2, wk: [1, 3], hint: 'the shop owner complains', yes: () => `the shop owner complained to the Herald about "hoodlums" and got laughed at`, yesFx: (x) => [x.heat(2)] }),
      A('cut', 'price', '"I\'ll collect. A third is mine."', 'He pays. You keep a third of it.', `collected for ${v.f} and kept a third`, [v.gain(120), v.op(4, 'Got me most of my money')]),
      A('work', 'grant', '"Forget him. My wife\'s dressmaker needs a hand. Steady work."', 'She sews for people who pay.', `found ${v.f} steady work`, [v.resp(1), v.op(10, 'Found me steady work')]),
      no(v, '"A contract is a contract. Get a lawyer."', `left ${v.f} to the dress shop`, 'boardwalk', 0.15),
    ],
  },
  {
    id: 'w_marriage', role: 'Young woman', gender: 'F', age: [21, 27], bg: ['Italian', 'Irish', 'Jewish'], size: 'small', low: true, title: 'A daughter and her father\'s word', offer: 'respect',
    problem: (v) => `${v.w} is twenty-four and works the switchboard at the Hotel Dorset. She wants to marry a ${v.who.ethnicity === 'Italian' ? 'Polish' : 'Italian'} boy who drives for the bakery, and her father won't hear of it: he says he'll sit shiva, or worse, he'll stop talking to her. "I'm going to marry him either way. I'd rather do it with my father in the church."`,
    answers: (v) => [
      A('father', 'grant', '"I\'ll sit down with your father. Just to talk."', 'A visit, an espresso, a word about the boy. Her father decides; she has already decided.', `spoke to ${v.f}'s father for her`, [v.resp(2), v.op(12, 'Talked to my father')], { p: 0.6, wk: [3, 8], hint: 'her father comes around', yes: (x) => `${x.w}'s father walked her down the aisle at St. Ann's, and you got an invitation`, yesFx: (x) => [x.resp(1)], no: (x) => `${x.w} married her bakery driver at City Hall; her father stayed home`, noFx: () => [] }),
      A('vouch', 'grant', '"Tell your father the boy works for people I know. That\'s a recommendation."', 'Your name on the boy. If he turns out bad, that\'s on you too.', `vouched for ${v.f}'s young man`, [v.resp(1), v.op(10, 'Vouched for us')]),
      A('gift', 'grant', '"Whatever you decide, here\'s for the wedding."', `${v.$(100)} in an envelope. It's her decision.`, `gave ${v.f} a wedding envelope`, [v.pay(100), v.op(8, 'Gave us a wedding envelope')]),
      A('stay', 'refuse', '"Between a father and a daughter, nobody comes."', 'You stay out of it. Some will call that wisdom.', `stayed out of ${v.f}'s family business`, [v.op(-3, 'Would not help')]),
    ],
  },
  {
    id: 'w_madam_cop', role: 'Madam', gender: 'F', age: [34, 56], bg: ['Irish', 'Italian', 'Jewish'], size: 'big', mature: true, needs: ['rival'], rivals: ['kessler', 'manno'], title: 'The madam and the patrolman', offer: 'information',
    problem: (v) => `${v.w} keeps a quiet house in North Wildwood. A patrolman who drinks at ${v.rn}'s club has doubled his envelope twice since Easter and says the next raid is in the newspaper. "I pay. I always paid. But he's not a cop anymore, he's a collector for ${v.rboss}."`,
    offerLine: (v) => `Men talk in ${v.her} house, ${v.she} says. ${v.She} would rather they talked to you.`,
    answers: (v) => [
      A('chief', 'grant', `"I'll have a word with ${v.chief ? `Chief ${v.chief.lastName}` : 'the chief'}. He'll walk a beach for the summer."`, 'The patrolman is moved. She pays the old rate, to your man.', `had the patrolman moved off ${v.f}'s street`, [v.resp(1), v.heat(1), v.op(12, 'Got the cop off my back'), ...v.riv(-6, 'Moved our patrolman')], favorBack('passed along what a ' + v.rn + ' man said in her parlor about their books', (x) => [x.gain(400)])),
      A('pad', 'price', '"From now on you pay me, not him. And he gets nothing."', `You take her envelope. ${v.rn} loses it.`, `took ${v.f}'s house under his protection`, [v.gain(150), v.heat(2), ...v.riv(-10, 'Took our envelope'), v.op(6, 'Took me over, at least fairly')], toRival(v, 'north', 0.4)),
      toCons(v, 'found the patrolman a reason to retire'),
      no(v, '"That\'s not my kind of business."', `turned ${v.f} away`, 'north', 0.4, 0),
    ],
  },
  {
    id: 'w_teacher_shylock', role: 'Schoolteacher', gender: 'F', age: [26, 50], bg: ['Irish', 'Jewish', 'Italian'], size: 'desperate', needs: ['rival'], title: 'A schoolteacher and her brother\'s debt', offer: 'vote',
    problem: (v) => `${v.w} teaches fourth grade at Glenwood Avenue School. Her brother borrowed from ${v.rmanN} of ${v.rn} for a used Chevrolet and has paid the vig for a year on a loan that never gets smaller. Last night two men waited for him outside her apartment. "I teach the councilman's grandchildren. I know how that sounds."`,
    answers: (v) => [
      A('buy', 'grant', '"I\'ll buy the paper on your brother. He pays me, no vig, when he can."', `${v.$(700)} to ${v.rn}. Her brother owes you instead.`, `bought ${v.f}'s brother's debt from ${v.rn}`, [v.pay(700), v.resp(2), v.op(14, 'Took my brother off the hook'), v.owe('Bought her brother\'s debt')], favorBack('got the PTA and the teachers\' local to back your man in the council race', (x) => [x.inf('downtown', 3), x.resp(1)])),
      A('word', 'price', `"I'll tell ${v.rman?.firstName ?? 'their man'} the debt is paid. The principal, no vig."`, `A sit-down with ${v.rn}. They won't like it.`, `told ${v.rn} to settle ${v.f}'s brother's debt for the principal`, [v.pay(300), v.resp(2), ...v.riv(-8, 'Told us how to run our book'), v.op(10, 'Got them to settle')], { p: 0.7, wk: [1, 3], hint: `${v.rn} takes the principal`, yes: (x) => `${x.rn} took the principal and let ${x.f}'s brother go`, no: (x) => `${x.rn} took the money and kept the vig running`, noFx: (x) => [x.resp(-1), x.op(-4, 'They kept squeezing him')] }),
      toCons(v, 'found her brother a job that pays the debt in a year'),
      no(v, '"He borrowed it. He pays it."', `left ${v.f}'s brother to the shylock`, 'downtown', 0.2),
    ],
  },
  {
    id: 'w_nurse', role: 'Nurse', gender: 'F', age: [24, 50], bg: ['Irish', 'Italian', 'Polish'], size: 'big', needs: ['rival'], title: 'A nurse who saw something', offer: 'information',
    problem: (v) => `${v.w} works nights at Burdette Tomlin Hospital. Two of ${v.rn}'s men brought in a man with a gunshot they called a fishing accident, and a detective has been asking her to swear to what she saw. Now somebody is parked outside her house. "I didn't ask to see anything."`,
    answers: (v) => [
      A('watch', 'grant', '"My people will watch your house. Tell the detective whatever you want."', 'A car on her street at night. She decides what she tells the law.', `put a man on ${v.f}'s street`, [v.resp(2), v.op(14, 'Kept me safe'), ...v.riv(-5, 'Protecting a witness against us')], favorBack(`told you the name of the man with the "fishing accident", and who shot him`, (x) => [...x.rinf('north', -2), x.heat(-2)])),
      A('away', 'grant', '"You have a sister in Scranton? Go visit her. I\'ll pay for the bus and the month."', `${v.$(200)}. She is gone till it blows over.`, `sent ${v.f} out of town for a month`, [v.pay(200), v.op(10, 'Got me out of it')]),
      A('use', 'price', '"Tell the detective everything. My lawyer will sit with you."', `It hurts ${v.rn}. It also puts her in the middle.`, `had ${v.f} testify against ${v.rn}`, [v.pay(150), ...v.riv(-15, 'Pushed a witness at us'), v.heat(1, 'local'), v.op(-2, 'Put me in front of them')], { p: 0.6, wk: [3, 8], hint: `${v.rn} gets hurt in court`, yes: (x) => `a ${x.rn} man was indicted on the nurse's word`, yesFx: (x) => [...x.rinf('north', -3), x.resp(1)], no: (x) => `the case against ${x.rn} fell apart and ${x.w} moved to Pennsylvania`, noFx: (x) => [x.resp(-1)] }),
      no(v, '"You saw nothing. That\'s my advice, free."', `told ${v.f} to forget what she saw`, 'downtown', 0.15, 0),
    ],
  },
  {
    id: 'w_landlady', role: 'Landlady', gender: 'F', age: [45, 70], bg: ['German', 'Irish', 'Italian', 'Jewish'], size: 'small', season: 'winter', low: true, title: 'A landlady and a tenant who won\'t pay', offer: 'payment',
    problem: (v) => `${v.w} owns a two-family on Burk Avenue and lives downstairs. The tenant upstairs hasn't paid since Thanksgiving, plays the radio at two in the morning, and laughs at her in the hall. "The court says March. I'll be dead by March."`,
    answers: (v) => [
      A('visit', 'grant', '"He\'ll pay what he owes, or he\'ll move. His choice."', 'One of your men knocks on his door, politely.', `had a man talk to ${v.f}'s tenant`, [v.resp(1), v.op(12, 'Got my tenant to pay'), v.gain(40)], { p: 0.75, wk: [1, 2], hint: 'he pays up', yes: (x) => `${x.w}'s tenant paid three months and turned down the radio`, no: (x) => `${x.w}'s tenant left in the night with her good lamp`, noFx: (x) => [x.op(-3, 'He ran off with my lamp')] }),
      A('cut', 'price', '"We collect. Half of it is ours."', 'Your man collects and keeps half.', `collected ${v.f}'s back rent, half for himself`, [v.gain(90), v.op(3, 'Got me something')]),
      A('tenant', 'grant', '"I\'ll send you a tenant who pays. He\'s gone by Sunday."', 'One of your men takes the rooms. She never hears the radio again.', `found ${v.f} a quiet tenant`, [v.resp(1), v.op(10, 'Found me a good tenant')]),
      no(v, '"That\'s what the courts are for, signora."', `told ${v.f} to wait for the court`, 'downtown', 0.1),
    ],
  },
  {
    id: 'w_waitress', role: 'Waitress', gender: 'F', age: [19, 35], bg: ['Irish', 'Italian', 'Polish', 'Greek'], size: 'small', low: true, title: 'A waitress and a customer', offer: 'information',
    problem: (v) => `${v.w} waits tables at a diner on Atlantic Avenue. A man in a good suit comes in every morning, sits in her section, says things, and last week followed her to the bus. The owner says he tips. "I need the job. I don't need him."`,
    offerLine: (v) => `${v.She} hears every table in the place, ${v.she} says, and cops eat breakfast there.`,
    answers: (v) => [
      A('word', 'grant', '"Tomorrow he eats breakfast somewhere else. For good."', 'Two of your men have coffee at the next table. Nothing happens in the diner.', `had ${v.f}'s customer told to eat elsewhere`, [v.resp(2), v.op(14, 'Made him leave me alone')], favorBack('told you which detectives eat breakfast together and what they talk about', (x) => [x.heat(-3)])),
      A('job', 'grant', '"There\'s a job for you at a place of mine. Better tips, and nobody follows you."', 'She decides if she takes it.', `offered ${v.f} work at a place of his`, [v.resp(1), v.op(10, 'Gave me a better job')]),
      A('owner', 'grant', '"I\'ll talk to the owner. He\'ll want to listen."', 'The owner throws the man out himself.', `had a word with ${v.f}'s boss`, [v.resp(1), v.op(8, 'Talked to my boss')]),
      no(v, '"Ask for another section."', `told ${v.f} to switch sections`, 'downtown', 0.05),
    ],
  },
  {
    id: 'w_irish_mother', role: 'Mother from North Wildwood', gender: 'F', age: [38, 60], bg: ['Irish'], size: 'small', rivals: ['kessler'], needs: ['rival'], title: 'An Irish mother from the north end', offer: 'vote',
    problem: (v) => `${v.w} came down from North Wildwood on the bus, which she says she has never done for anybody. Her son fixes cars and ${v.rn}'s people want him to strip the ones they bring in. He said no and they broke his garage window. "In my neighborhood we don't come to you people. I came anyway."`,
    answers: (v) => [
      A('protect', 'grant', '"Your son\'s garage is under my eye now."', `A man by the garage. ${v.rn} will hear about it.`, `put ${v.f}'s son's garage under his protection`, [v.resp(3), v.inf('north', 2), ...v.riv(-8, 'Took a garage on our side'), v.op(14, 'Protected my boy')], favorBack('brought half the north end to vote the way you asked', (x) => [x.inf('north', 2), x.fav(1)], 0.5)),
      A('talk', 'price', `"I'll send word to ${v.rboss}. Your son pays me a little, for the trouble."`, 'A message, and a small envelope from the garage every month.', `took ${v.f}'s son's garage for a small fee`, [v.gain(40), ...v.riv(-4, 'Interfered on our side'), v.op(4, 'Helped, for a price')]),
      toPriest(v, 40),
      no(v, '"North Wildwood is not my side of the island."', `told ${v.f} her side of the island was not his`, 'north', 0.35),
    ],
  },
  {
    id: 'w_jewish_mother', role: 'Mother from Atlantic City', gender: 'F', age: [42, 64], bg: ['Jewish'], size: 'small', needs: ['council'], title: 'A mother from up the shore', offer: 'favor',
    problem: (v) => `${v.w} came down from Atlantic City because her son-in-law is opening a delicatessen on Pacific Avenue and the license has been on ${v.council ? `Councilman ${v.council.lastName}` : 'a councilman'}'s desk since Passover. "In Atlantic City they told me: go to Wildwood, see who really runs it."`,
    answers: (v) => [
      A('call', 'grant', `"${v.council ? `Frank ${v.council.lastName}` : 'The councilman'} will sign it this week."`, 'A call. You will be asked to remember it.', `got ${v.f}'s son-in-law his license`, [v.resp(2), v.op(12, 'Got the license signed'), v.owe('Got the deli license signed')], favorBack('sent a cousin in the Atlantic City clerk\'s office your way', (x) => [x.fav(1)])),
      A('piece', 'price', '"He\'ll get the license. I\'ll get a little piece of the delicatessen."', 'A silent share, paid monthly.', `took a piece of ${v.f}'s son-in-law's delicatessen`, [v.gain(80), v.op(2, 'He took a piece')]),
      toCons(v, 'walked the license through City Hall'),
      no(v, '"Atlantic City has its own people."', `sent ${v.f} back to Atlantic City`, 'pacific', 0.2),
    ],
  },
  {
    id: 'w_crew_wife', role: 'Wife of one of your men', gender: 'F', age: [20, 55], bg: ['Italian', 'Irish'], size: 'desperate', sameName: true, who: crewIn, petitioner: adultWife, title: 'The wife of a man inside', offer: 'loyalty',
    problem: (v) => `${v.w} comes in her church hat. ${v.m ? `${v.m.firstName} has been inside since the spring and ` : ''}The envelope that was supposed to come every week has come twice. The coal man wants cash and her oldest needs shoes. "He never said a word to the police. Not one word. Does that count for nothing?"`,
    offerLine: (v) => `${v.m ? `${v.m.firstName} hears everything from her on visiting day.` : 'Her husband hears everything on visiting day.'}`,
    answers: (v) => [
      A('weekly', 'grant', '"From now on the envelope comes every Friday. My word."', `${v.$(240)} now, and the house knows the boss keeps faith.`, `kept faith with ${v.f} while her man is inside`, [v.pay(240), v.resp(2), v.op(16, 'Kept faith with my family'), ...(v.m ? [v.opOf(v.m.id, 12, 'Looked after my wife while I was inside')] : []), v.crew(2, 'The boss looks after the families')]),
      A('job', 'grant', '"There\'s work for you at the bakery on Pacific. Good money."', 'Steady wages. Not charity.', `found ${v.f} work`, [v.op(8, 'Found me work'), ...(v.m ? [v.opOf(v.m.id, 4, 'Found my wife work')] : [])]),
      A('capo', 'send', `"Your husband's capo should have handled this. He will now."`, `${v.capo} hears about it from you.`, `sent ${v.f} to her husband's capo`, [v.op(2, 'Told his capo to fix it'), v.crew(-1, 'The boss called out a capo')], { p: 0.7, wk: [1, 3], hint: 'the envelopes come on time', yes: (x) => `${x.w}'s envelopes started coming every Friday`, yesFx: (x) => [x.op(4, 'The envelopes come now')], no: (x) => `the capo's envelopes to ${x.w} came late again`, noFx: (x) => [x.op(-6, 'Still nothing'), ...(x.m ? [x.opOf(x.m.id, -8, 'My family was forgotten')] : [])] }),
      A('no', 'refuse', '"Everybody\'s short this year."', 'The crew hears what happens to a man\'s family when he keeps his mouth shut.', `turned away ${v.f}`, [v.op(-10, 'Forgot my family'), ...(v.m ? [v.opOf(v.m.id, -15, 'Forgot my family while I was inside')] : []), v.crew(-3, 'The boss forgets the families')]),
    ],
  },
  {
    id: 'w_cop_widow', role: 'Policeman\'s widow', gender: 'F', age: [32, 60], bg: ['Irish', 'German'], size: 'small', title: 'A policeman\'s widow', offer: 'information',
    problem: (v) => `${v.w}'s husband was a patrolman twenty-two years and died of his heart on the beat. The city says it wasn't "in the line of duty" so the pension is half. "He took your money for twenty years, ${v.addr}. I know he did. I'm not proud. I'm asking."`,
    offerLine: () => 'She still has his notebooks, she says. All twenty-two years.',
    answers: (v) => [
      A('council', 'grant', '"The city will find it was the line of duty."', 'A call to City Hall. A favor spent.', `got ${v.f} her husband's full pension`, [v.fav(-1), v.resp(2), v.op(14, 'Got me his full pension')], favorBack('gave you her husband\'s notebooks: twenty years of who paid whom', (x) => [x.heat(-4), x.fav(1)]), v.s.favors < 1 ? 'No favors to spend' : undefined),
      A('pay', 'grant', '"You\'ll get the difference from me, every month."', `${v.$(200)} to start.`, `paid ${v.f} the other half of the pension`, [v.pay(200), v.resp(1), v.op(12, 'Made up the pension')]),
      A('books', 'price', '"Bring me his notebooks and I\'ll take care of the rest."', 'His notebooks for your help. She hesitates, then nods.', `traded ${v.f}'s help for her husband's notebooks`, [v.pay(100), v.heat(-3), v.op(2, 'Wanted his notebooks')]),
      no(v, '"The police take care of their own."', `sent ${v.f} back to the police`, 'downtown', 0.1),
    ],
  },
  {
    id: 'w_oil_man', role: 'Mother', gender: 'F', age: [24, 45], bg: ['Irish', 'Italian', 'Polish', 'German'], size: 'desperate', season: 'winter', low: true, title: 'No oil in January', offer: 'respect',
    problem: (v) => `${v.w} has four children in a bungalow off New Jersey Avenue and the oil man won't deliver until she pays October. The kids sleep in their coats. Her husband went to Camden for work at Thanksgiving and the money stopped. "I'll scrub floors. I'll scrub yours."`,
    answers: (v) => [
      A('oil', 'grant', '"The truck will be there tonight. Paid through March."', `${v.$(120)}.`, `filled ${v.f}'s oil tank for the winter`, [v.pay(120), v.resp(2), v.op(16, 'Kept my kids warm')]),
      A('oilman', 'grant', '"The oil man and I will talk about his manners."', 'He delivers, on account. He will remember who asked.', `made the oil man deliver to ${v.f}`, [v.resp(2), v.op(12, 'Made the oil man come'), v.heat(1)]),
      A('find', 'grant', '"And we\'ll find your husband in Camden."', `${v.$(60)} and a few phone calls.`, `had ${v.f}'s husband found`, [v.pay(60), v.op(6, 'Looking for my husband')], { p: 0.5, wk: [2, 5], hint: 'he sends money home', yes: (x) => `${x.w}'s husband was found working the Camden shipyard; the money comes home again`, yesFx: (x) => [x.op(8, 'Found my husband')], no: (x) => `${x.w}'s husband had left Camden for Baltimore, with somebody`, noFx: () => [] }),
      toPriest(v, 40),
    ],
  },
  {
    id: 'w_fortune', role: 'Boardwalk fortune teller', gender: 'F', age: [30, 65], bg: ['Italian', 'Greek', 'Polish'], size: 'small', season: 'summer', low: true, needs: ['rival'], rivals: ['feldstein', 'kessler'], title: 'A fortune teller\'s booth', offer: 'information',
    problem: (v) => `${v.w} reads palms in a booth by the Casino Arcade. ${v.rn}'s people bought the building and say her lease is up at the end of July; they'll put a frozen custard stand in. "Twenty summers I'm in that booth, ${v.addr}. Twenty. People come back to me."`,
    offerLine: (v) => `People tell a fortune teller what they don't tell a priest, ${v.she} says.`,
    answers: (v) => [
      A('lease', 'grant', `"I'll talk to ${v.rn}. You keep your booth."`, `They'll want something for it.`, `kept ${v.f}'s booth for her`, [v.resp(2), v.inf('boardwalk', 1), ...v.riv(-4, 'Interfered in a lease'), v.op(12, 'Kept my booth')], favorBack('told you what a ' + v.rn + ' man\'s wife asked the cards', (x) => [...x.rinf('boardwalk', -1), x.gain(200)], 0.5)),
      A('move', 'grant', '"There\'s a spot by a pier of mine. Better foot traffic."', 'A new booth, rent free for the summer.', `moved ${v.f}'s booth to his own spot`, [v.pay(60), v.op(10, 'Gave me a new spot')]),
      no(v, '"Custard sells, signora."', `let ${v.rn} have ${v.f}'s booth`, 'boardwalk', 0.2),
    ],
  },
  {
    id: 'w_daughter_job', role: 'Mother', gender: 'F', age: [40, 60], bg: ['Italian', 'Irish'], size: 'small', low: true, title: 'A job for her daughter', offer: 'vote',
    problem: (v) => `${v.w}'s daughter is eighteen, finished at Wildwood High in June, typing sixty words a minute. Every job worth having goes to somebody's niece. "The phone company. The bank. City Hall. Somewhere with a pension and a clean ladies' room."`,
    answers: (v) => [
      A('cityhall', 'grant', '"City Hall needs a typist. She starts Monday."', 'A word with the clerk. Her whole family votes your way now.', `got ${v.f}'s daughter a job at City Hall`, [v.resp(1), v.inf('downtown', 1), v.op(12, 'Got my girl a good job')], favorBack('\'s daughter, typing at City Hall, mentioned which permits are being held and why', (x) => [x.fav(1)], 0.4)),
      A('bank', 'grant', '"The bank on Pacific. The manager owes me."', 'A teller\'s window.', `got ${v.f}'s daughter a job at the bank`, [v.op(10, 'Got my girl a job at the bank')]),
      A('mine', 'grant', '"She can keep the books at one of my places."', 'Honest books. Mostly.', `hired ${v.f}'s daughter`, [v.op(8, 'Gave my girl a job')]),
      no(v, '"Let her look in the paper like everybody."', `told ${v.f} to read the want ads`, 'downtown', 0.05),
    ],
  },
  {
    id: 'w_hospital', role: 'Wife', gender: 'F', age: [30, 60], bg: ['Italian', 'Irish', 'Jewish', 'German'], size: 'desperate', low: true, title: 'A hospital bill', offer: 'favor',
    problem: (v) => `${v.w}'s husband fell off a roof in Cape May; no insurance, no union, and Burdette Tomlin wants $900 before they'll keep him past the week. "He'll pay you back. Every penny. When he walks."`,
    answers: (v) => [
      A('pay', 'grant', '"Give me the bill."', `${v.$(900)}.`, `paid ${v.f}'s husband's hospital bill`, [v.pay(900), v.resp(3), v.op(18, 'Paid the hospital'), v.owe('Paid the hospital bill')], favorBack('\'s husband, walking again, did a carpentry job for you at cost', (x) => [x.gain(500)], 0.7, [10, 20])),
      A('doctor', 'grant', '"The hospital will find he can stay. I know the board."', 'A favor spent with a board member.', `got the hospital to keep ${v.f}'s husband`, [v.fav(-1), v.resp(2), v.op(14, 'Got them to keep him')], undefined, v.s.favors < 1 ? 'No favors to spend' : undefined),
      A('loan', 'price', '"I\'ll lend it. Easy terms, no vig. He pays when he works."', `${v.$(900)} as a loan. He owes you.`, `lent ${v.f} the hospital money`, [v.pay(900), v.op(8, 'Lent us the money'), v.owe('Lent the hospital money')], { p: 0.7, wk: [12, 24], hint: 'he pays it back', yes: (x) => `${x.w}'s husband paid back the hospital money, all of it`, yesFx: (x) => [x.gain(900)], no: (x) => `${x.w}'s husband never worked again; the loan is a gift now`, noFx: () => [] }),
      toPriest(v, 60),
    ],
  },
  {
    id: 'w_runner_widow', role: 'Widow of a numbers runner', gender: 'F', age: [30, 60], bg: ['Italian', 'Irish'], size: 'small', needs: ['rival'], title: 'A runner\'s widow', offer: 'information',
    problem: (v) => `${v.w}'s husband ran numbers on Schellenger Avenue for ${v.rn}'s bank for fifteen years. He died in May and the bank kept his last two weeks and the "Christmas money" they always promised. "Who do I complain to? The police?"`,
    offerLine: (v) => `${v.She} knows every stop on her husband's route and every player's name.`,
    answers: (v) => [
      A('collect', 'grant', `"${v.rn} will pay his widow. I'll see that they do."`, `A message. They pay, and they resent it.`, `made ${v.rn} pay ${v.f} her husband's money`, [v.resp(2), ...v.riv(-6, 'Collected from our bank'), v.op(12, 'Got me what they owed')]),
      A('route', 'price', '"Your husband\'s route works for me now. You get a piece every week."', `You take the route; she gets ${v.$(30)} a week.`, `took ${v.f}'s husband's numbers route`, [v.gain(200), v.inf('downtown', 2), ...v.riv(-10, 'Took one of our routes'), v.op(8, 'Gave me a piece of the route')], toRival(v, 'downtown', 0.3)),
      A('pay', 'grant', '"Here\'s what they owe. I\'ll get it from them myself."', `${v.$(250)}.`, `paid ${v.f} what ${v.rn} owed`, [v.pay(250), v.op(14, 'Paid me what they owed')]),
      no(v, '"It\'s their bank. Talk to them."', `sent ${v.f} back to ${v.rn}`, 'downtown', 0.2),
    ],
  },
  {
    id: 'w_beauty_parlor', role: 'Beauty parlor owner', gender: 'F', age: [30, 55], bg: ['Italian', 'Jewish', 'Irish'], size: 'big', needs: ['rival'], rivals: ['feldstein', 'manno'], title: 'The block they want to buy', offer: 'information',
    problem: (v) => `${v.w} owns the beauty parlor on the corner of Pacific and Wildwood. ${v.rn}'s people are buying the whole block for a motel and she's the last one who won't sell. Last week the plate glass broke "by itself." "Every wife on this island gets her hair done in my chair. Every wife talks."`,
    answers: (v) => [
      A('block', 'grant', `"Nobody buys that corner. Tell ${v.rboss}'s man I said so."`, `Your name on her window. ${v.rn} takes it personally.`, `stood between ${v.rn} and ${v.f}'s corner`, [v.resp(3), v.inf('pacific', 2), ...v.riv(-10, 'Blocked our deal'), v.op(14, 'Saved my shop')], favorBack('passed along what ' + v.rn + ' wives say under the dryer', (x) => [...x.rinf('pacific', -2), x.fav(1)])),
      A('price', 'price', '"Sell, but for twice the money. I\'ll negotiate. Ten percent is mine."', `They pay up. You keep ${v.$(300)}.`, `got ${v.f} twice the money for her corner`, [v.gain(300), v.op(6, 'Got me a better price'), ...v.riv(-3, 'Raised our price')]),
      A('partner', 'grant', '"Don\'t sell. I\'ll put in money for new chairs, and it\'s a partnership."', `${v.$(500)} for a share of the shop.`, `went partners in ${v.f}'s beauty parlor`, [v.pay(500), v.op(10, 'Became my partner'), v.inf('pacific', 1)], favorBack('\'s shop turned a good summer; your share came in', (x) => [x.gain(700)], 0.7, [8, 16])),
      no(v, '"Take their money, signora. It\'s good money."', `told ${v.f} to sell to ${v.rn}`, 'pacific', 0.3),
    ],
  },
  {
    id: 'w_grandmother', role: 'Grandmother', gender: 'F', age: [62, 80], bg: ['Italian', 'Irish', 'Jewish', 'Polish'], size: 'small', low: true, needs: ['rival'], rivals: ['kessler'], title: 'A grandmother and a card game', offer: 'respect',
    problem: (v) => `${v.w} raised her grandson after his parents passed. He's twenty-one, drives a beer truck, and lost his whole pay at a card game in the back of ${v.rn}'s club. They took his truck keys as a marker. "His boss will fire him Monday. Then what does he have?"`,
    answers: (v) => [
      A('keys', 'grant', `"He'll have his keys back tonight. And he won't be welcome at that table again."`, `A word with ${v.rn}'s card man.`, `got ${v.f}'s grandson's keys back from ${v.rn}`, [v.resp(2), ...v.riv(-3, 'Took back a marker'), v.op(12, 'Got my boy\'s keys back')]),
      A('pay', 'grant', '"How much? Here. And he comes to see me."', `${v.$(140)}. A talk with the boy.`, `paid ${v.f}'s grandson's marker`, [v.pay(140), v.op(10, 'Paid my grandson\'s marker')], { p: 0.4, wk: [6, 14], hint: 'the boy comes to work for you', son: true, yes: (x) => `${x.w}'s grandson came by to work off his debt and stayed on` }),
      toPriest(v, 20),
      no(v, '"A lesson is cheaper at twenty-one than at forty."', `let ${v.f}'s grandson learn his lesson`, 'north', 0.1),
    ],
  },
  {
    id: 'w_operator', role: 'Telephone operator', gender: 'F', age: [20, 45], bg: ['Irish', 'German', 'Italian'], size: 'small', needs: ['rival'], title: 'The switchboard girl', offer: 'information',
    problem: (v) => `${v.w} works the switchboard at Bell on Pacific. Her landlord is raising her rent because she "has a good job," and her mother in Pennsville is sick. She doesn't ask for money; she offers a trade. "I hear things on the line. Sometimes I hear your name."`,
    answers: (v) => [
      A('rent', 'grant', '"Your landlord will find he can\'t raise the rent this year."', 'He keeps the rent where it was. She keeps her ears open.', `kept ${v.f}'s rent down`, [v.resp(1), v.op(12, 'Kept my rent down')], favorBack(`told you about a long-distance call between ${v.rn} and a Philadelphia number`, (x) => [x.fav(1)], 0.7, [2, 8])),
      A('pay', 'price', '"Fifty a month for what you hear. And you never write anything down."', `${v.$(50)} a month. She is on your pad.`, `put ${v.f} on the pad`, [v.pay(50), v.op(6, 'Pays me to listen'), v.heat(1, 'federal')], favorBack('passed along that the county is asking Bell about your lines', (x) => [x.heat(-4), x.heat(-2, 'federal')], 0.6, [3, 10])),
      no(v, '"I don\'t want to hear my name on anybody\'s phone."', `turned ${v.f} away`, 'downtown', 0.1, 0),
    ],
  },
  {
    id: 'w_altar_society', role: 'President of the Altar Society', gender: 'F', age: [45, 72], bg: ['Italian', 'Irish'], size: 'small', season: 'summer', low: true, title: 'The Feast and the boardwalk', offer: 'respect',
    problem: (v) => `${v.w}, president of the Altar Rosary Society, about the Feast of the Assumption procession on the fifteenth. Last year a carload of drunks from Philadelphia drove through the procession on Pacific Avenue and knocked over the Madonna. "This year I want men on the corners. Not policemen. Men."`,
    answers: (v) => [
      A('men', 'grant', '"My men will walk with the Madonna. Every corner."', 'Your men in their Sunday suits. The whole parish sees.', `had his men guard the Feast procession`, [v.resp(3), v.inf('pacific', 1), v.op(12, 'Kept the Feast safe')], { p: 0.8, wk: [2, 6], hint: 'the Feast goes off clean', yes: (x) => `the Feast went off without a scratch; ${x.priest} thanked "our friends" from the altar`, yesFx: (x) => [x.resp(2), x.heat(-2)], no: () => `a scuffle at the Feast made the Herald, your men in the photograph`, noFx: (x) => [x.heat(3)] }),
      A('money', 'grant', '"And the fireworks this year are on me."', `${v.$(250)}. Your name isn't on them. Everybody knows.`, `paid for the Feast fireworks`, [v.pay(250), v.resp(2), v.op(10, 'Paid for the fireworks')]),
      toCons(v, 'arranged a detail of off-duty cops and his own men'),
      no(v, '"That\'s what the police are for."', `left the Feast to the police`, 'pacific', 0.05),
    ],
  },
  {
    id: 'w_gold_star', role: 'Gold Star mother', gender: 'F', age: [44, 66], bg: ['Irish', 'Italian', 'Polish'], size: 'small', needs: ['cop'], title: 'A Gold Star mother', offer: 'vote',
    problem: (v) => `${v.w} lost her oldest at the Chosin Reservoir. Her second boy passed the police exam with the top mark in the county, and the department won't take him because his uncle did a year for bookmaking in '48. "One son for the country. Isn't that enough for them?"`,
    answers: (v) => [
      A('chief', 'grant', `"${v.chief ? `Chief ${v.chief.lastName}` : 'The chief'} will see your son. He'll get his badge."`, 'A favor spent. A cop who owes you his badge.', `got ${v.f}'s son on the police force`, [v.fav(-1), v.resp(2), v.op(16, 'Got my boy his badge')], favorBack(`'s son, the young patrolman, made a report about your place go missing`, (x) => [x.heat(-5)], 0.6, [10, 26]), v.s.favors < 1 ? 'No favors to spend' : undefined),
      A('job', 'grant', '"The fire department, then. I know the captain."', 'Not a badge, but a pension.', `got ${v.f}'s son on the fire department`, [v.resp(1), v.op(10, 'Got my boy a good job')]),
      A('vfw', 'send', '"Go to the VFW. Tell them who your oldest was. I\'ll call ahead."', 'The veterans take it up. It may work.', `sent ${v.f} to the VFW`, [v.op(2, 'Called ahead for me')], { p: 0.5, wk: [3, 8], hint: 'the veterans get him in', yes: (x) => `the VFW got ${x.w}'s son his badge`, yesFx: (x) => [x.resp(1)], no: (x) => `the department held to its rule; ${x.w}'s son went to the Navy` }),
      no(v, '"The police make their own rules."', `left ${v.f}'s son to the police board`, 'downtown', 0.05),
    ],
  },
  {
    id: 'w_divorce', role: 'Wife', gender: 'F', age: [24, 45], bg: ['Irish', 'Jewish', 'German', 'Italian'], size: 'small', low: true, title: 'A woman who wants out', offer: 'payment',
    problem: (v) => `${v.w} wants a divorce. Her husband went to Florida with the car and a girl from the five-and-ten, and the lawyer on Pacific wants $500 and says she needs "grounds a judge will like." "I have grounds. I have a whole Buick of grounds."`,
    answers: (v) => [
      A('lawyer', 'grant', '"My lawyer will take your case. You pay him what you can."', 'Her decision, her case; your lawyer, your bill.', `got ${v.f} a lawyer for her divorce`, [v.pay(150), v.op(12, 'Got me a real lawyer')], { p: 0.7, wk: [6, 14], hint: 'she gets her divorce and the house', yes: (x) => `${x.w} got her divorce, and the house`, yesFx: (x) => [x.resp(1)], no: (x) => `${x.w}'s divorce is still before the court` }),
      A('judge', 'grant', '"The judge will like your grounds."', 'A word with somebody who knows the judge. A favor spent.', `smoothed ${v.f}'s divorce with the court`, [v.fav(-1), v.op(14, 'Got me my divorce')], undefined, v.s.favors < 1 ? 'No favors to spend' : undefined),
      toPriest(v, 20),
      no(v, '"Marriage is marriage."', `told ${v.f} marriage is marriage`, 'downtown', 0.05),
    ],
  },
  {
    id: 'w_eloped', role: 'Mother', gender: 'F', age: [40, 60], bg: ['Italian', 'Irish', 'Jewish'], size: 'small', low: true, title: 'A daughter and a sailor', offer: 'respect',
    problem: (v) => `${v.w}'s daughter is twenty and married a sailor from the Cape May base after three dances. Now he's shipping to Norfolk, she wants to go, and her mother has heard he has a wife in Tennessee. "If it's true, I want her to know. If it's not, God bless them."`,
    answers: (v) => [
      A('find', 'grant', '"I\'ll find out about the sailor. Then she decides."', `${v.$(60)} and a call to a friend in Norfolk.`, `found out about ${v.f}'s son-in-law`, [v.pay(60), v.op(12, 'Found out the truth')], { p: 0.5, wk: [2, 5], hint: 'he is what he says he is', yes: (x) => `the sailor was clean; ${x.w}'s daughter went to Norfolk with her mother's blessing`, yesFx: (x) => [x.op(4, 'Set my mind at ease')], no: (x) => `the sailor had a wife in Knoxville; ${x.w}'s daughter came home, and decided that was her business`, noFx: (x) => [x.op(6, 'Saved my girl from a liar')] }),
      A('talk', 'grant', '"Bring her here. She can hear it from me what to look out for."', 'A talk. She makes up her own mind.', `talked to ${v.f}'s daughter`, [v.op(6, 'Talked to my girl')]),
      no(v, '"She\'s a married woman. Let her be."', `left ${v.f}'s daughter to her marriage`, 'downtown', 0.05, 0),
    ],
  },
  {
    id: 'w_restaurant_widow', role: 'Widow, restaurant owner', gender: 'F', age: [40, 66], bg: ['Italian', 'Greek'], size: 'big', needs: ['council'], title: 'A widow and her husband\'s restaurant', offer: 'payment',
    problem: (v) => `${v.w} is keeping her late husband's restaurant open on Pacific Avenue, and the liquor license renewal is stuck at City Hall: the board says a license "belongs to the man." "My husband never cooked a meal in his life. Every plate in that place, I made."`,
    answers: (v) => [
      A('license', 'grant', `"The license will be in your name by the end of the month."`, `${v.council ? `Councilman ${v.council.lastName}` : 'The board'} gets a call. It costs a favor.`, `got ${v.f}'s liquor license in her name`, [v.fav(-1), v.resp(2), v.op(14, 'Got me my license'), v.inf('pacific', 1)], favorBack('\'s restaurant became the place your men eat for free', (x) => [x.crew(2, 'Free dinners on Pacific')]), v.s.favors < 1 ? 'No favors to spend' : undefined),
      A('partner', 'price', '"Put my cousin\'s name on the license. You run it. He gets a little."', `Your man on paper; she keeps the kitchen and pays ${v.$(60)} a month.`, `put his man's name on ${v.f}'s liquor license`, [v.gain(60), v.inf('pacific', 2), v.op(2, 'Took a name on my license')]),
      toCons(v, 'found a lawyer who got the board to see reason'),
      no(v, '"City Hall is City Hall."', `left ${v.f} to the license board`, 'pacific', 0.25),
    ],
  },
  {
    id: 'w_insurance', role: 'Widow', gender: 'F', age: [30, 65], bg: ['Irish', 'Italian', 'German', 'Portuguese'], size: 'small', title: 'An insurance man who won\'t pay', offer: 'respect',
    problem: (v) => `${v.w}'s husband drowned off the Crest in June. The insurance man from Philadelphia says he'd had a beer, so the policy doesn't pay. "One beer. At a christening. Twenty years of premiums, ${v.addr}."`,
    answers: (v) => [
      A('agent', 'grant', '"The insurance man will reconsider. He drives home on our roads."', 'A visit to his hotel. He finds a way.', `got ${v.f}'s insurance paid`, [v.resp(2), v.heat(1), v.op(14, 'Made the insurance pay')], { p: 0.75, wk: [2, 5], hint: 'the claim is paid', yes: (x) => `the insurance company paid ${x.w}'s claim, with a letter of apology`, no: () => `the insurance man reported "threats" to his office in Philadelphia`, noFx: (x) => [x.heat(3)] }),
      A('lawyer', 'grant', '"My lawyer will write them a letter they won\'t like."', `${v.$(120)}.`, `sent a lawyer after ${v.f}'s insurance`, [v.pay(120), v.op(10, 'Got me a lawyer')]),
      toPriest(v, 30),
      no(v, '"Contracts, signora. I don\'t read them for a living."', `left ${v.f} to the insurance company`, 'crest', 0.05),
    ],
  },
  {
    id: 'w_motel', role: 'Motel owner', gender: 'F', age: [36, 62], bg: ['German', 'Irish', 'Italian'], size: 'small', season: 'summer', needs: ['rival'], rivals: ['kessler', 'manno'], title: 'A motel in the Crest', offer: 'payment',
    problem: (v) => `${v.w} runs a twelve-unit motel in the Crest with her sister. Every weekend a crowd from ${v.rn}'s club rents three rooms, breaks the furniture and leaves without paying. The police say "boys will be boys." "My guests are families. The families are leaving."`,
    answers: (v) => [
      A('men', 'grant', '"Saturday night my men will be in the parking lot."', `${v.rn}'s crowd finds another motel.`, `put his men in ${v.f}'s motel lot`, [v.resp(2), v.inf('crest', 2), ...v.riv(-4, 'Ran our boys out of the Crest'), v.op(12, 'Saved my motel')]),
      A('bill', 'price', `"${v.rboss} will pay for the furniture. And you pay me a little every summer."`, `${v.rn} pays. She pays you a little.`, `made ${v.rn} pay ${v.f}'s damages`, [v.gain(100), ...v.riv(-6, 'Made us pay a motel'), v.op(6, 'Got me paid')]),
      toCons(v, 'had a word with the club'),
      no(v, '"The Crest is quiet money. Keep it quiet."', `left ${v.f} to ${v.rn}'s crowd`, 'crest', 0.3),
    ],
  },
  {
    id: 'w_madam_customer', role: 'Madam', gender: 'F', age: [32, 55], bg: ['Irish', 'Italian', 'Polish'], size: 'small', mature: true, title: 'A madam and a bad customer', offer: 'information',
    problem: (v) => `${v.w} runs a discreet house on the bay side. A regular, a salesman from Vineland, has gotten rough with one of her girls, and the girl, twenty-six, wants to leave the life and go home to Hazleton. "I'm not asking for the moon. Keep him away, and help me give her a start."`,
    offerLine: (v) => `${v.She} knows which councilmen visit, and when.`,
    answers: (v) => [
      A('ban', 'grant', '"He doesn\'t set foot on this island again. Tell me his name."', 'A word to the salesman, at his hotel. Nothing rough unless you say so.', `had ${v.f}'s customer banned from the island`, [v.resp(1), v.op(12, 'Kept him away from my girls')], favorBack('told you which councilman visits on Tuesdays, and what he says', (x) => [x.fav(1)])),
      A('start', 'grant', '"The girl gets a bus ticket and a month\'s rent. Her choice where."', `${v.$(150)}. She decides; nobody follows her.`, `gave ${v.f}'s girl a start back home`, [v.pay(150), v.resp(1), v.op(14, 'Gave my girl a way out')]),
      A('both', 'grant', '"Both. And the house is under my protection."', `${v.$(150)} and a man on the door Saturdays.`, `protected ${v.f}'s house and paid the girl's way home`, [v.pay(150), v.heat(1), v.op(16, 'Did right by us'), v.gain(60)]),
      no(v, '"That\'s not my kind of business."', `turned ${v.f} away`, 'docks', 0.2, 0),
    ],
  },
  {
    id: 'w_sister_killed', role: 'Sister', gender: 'F', age: [24, 50], bg: ['Italian', 'Irish'], size: 'desperate', needs: ['rival'], title: 'A sister who wants a name', offer: 'loyalty',
    problem: (v) => `${v.w}'s brother was found in the bay in April. The county says he fell off a dock drunk. He didn't drink. He had been doing a little work for ${v.rn}. "I don't want anything done. I want to know. I want my mother to have something to know."`,
    answers: (v) => [
      A('ask', 'grant', '"I\'ll ask around. Whatever I find, you\'ll hear it from me."', `${v.$(100)} in the right pockets. It may stir up ${v.rn}.`, `looked into ${v.f}'s brother's death`, [v.pay(100), v.op(12, 'Found out for me')], { p: 0.55, wk: [3, 8], hint: 'you find out who', yes: (x) => `${x.w} learned it was ${x.rn} business, and who gave the order; she lit a candle and said nothing more`, yesFx: (x) => [x.op(8, 'Told me the truth'), x.fav(1)], no: (x) => `nobody on the docks would say a word about ${x.w}'s brother`, noFx: (x) => [x.op(-2, 'Nobody would say')] }),
      A('mass', 'grant', '"I\'ll pay for the Mass and the stone. That much I can do."', `${v.$(160)}.`, `paid for ${v.f}'s brother's Mass and stone`, [v.pay(160), v.resp(1), v.op(10, 'Gave my brother a proper Mass')]),
      toPriest(v, 30),
      no(v, '"The bay keeps its own secrets, signora."', `told ${v.f} to let her brother rest`, 'docks', 0.2, 0),
    ],
  },
  {
    id: 'w_candy_store', role: 'Candy store owner', gender: 'F', age: [38, 66], bg: ['Jewish', 'Italian', 'Irish'], size: 'small', low: true, needs: ['rival'], title: 'A candy store and a pinball machine', offer: 'payment',
    problem: (v) => `${v.w} runs a candy store and newsstand near the high school. ${v.rn}'s jukebox man put a pinball machine in her back room without asking and takes eighty percent. Now the police say pinball is gambling. "I sell egg creams and the Bulletin. I'm going to jail for a pinball?"`,
    answers: (v) => [
      A('pull', 'grant', '"The machine goes back to them tomorrow."', `${v.rn} loses a machine.`, `had ${v.rn}'s pinball pulled from ${v.f}'s store`, [v.resp(2), ...v.riv(-3, 'Pulled our machine'), v.op(12, 'Got that machine out of my store')]),
      A('ours', 'price', '"It\'s our machine now. You get half, not twenty percent, and no police."', 'Your machine, your arrangement with the cops.', `took over the pinball in ${v.f}'s store`, [v.gain(60), v.heat(1), ...v.riv(-5, 'Took our machine'), v.op(6, 'Fairer split')]),
      toCons(v, 'squared it with the cops and the jukebox man'),
      no(v, '"Half the stores on the island have one."', `left ${v.f} to the pinball man`, 'downtown', 0.15),
    ],
  },
];

/* ------------------------------------------------------------------ */
/* The men                                                             */
/* ------------------------------------------------------------------ */

const MEN: PTpl[] = [
  {
    id: 'm_barber', role: 'Barber', gender: 'M', age: [35, 70], bg: ['Italian', 'Greek'], size: 'small', low: true, title: 'The barber and the inspector', offer: 'information',
    problem: (v) => `${v.w} has cut hair on Oak Avenue for thirty years. A new building inspector has written him up four times: the pole, the sink, the chair, the sign. Each time the fine is smaller if it's cash. "He wants a piece of a two-chair shop, ${v.addr}. Of a barber."`,
    offerLine: () => 'Every cop on the island sits in his chair, he says, and men talk with a razor at their throat.',
    answers: (v) => [
      A('inspector', 'grant', '"The inspector will find a different street."', 'A word with City Hall about the inspector.', `got the inspector off ${v.f}'s back`, [v.resp(2), v.op(12, 'Got the inspector off me')], favorBack('told you which detective is going to the grand jury', (x) => [x.heat(-4)])),
      A('cut', 'price', '"The fines stop. You pay me a little instead, half what he wanted."', 'His envelope goes to you.', `took the barber's envelope from the inspector`, [v.gain(40), v.op(2, 'At least it\'s fair')]),
      toCons(v, 'had the inspector transferred'),
      no(v, '"Pay the man. It\'s cheaper."', `told ${v.f} to pay the inspector`, 'downtown', 0.1),
    ],
  },
  {
    id: 'm_fisherman', role: 'Fisherman', gender: 'M', age: [30, 65], bg: ['Portuguese', 'Italian', 'Irish'], size: 'desperate', low: true, needs: ['rival'], title: 'A fisherman and his boat', offer: 'loyalty',
    problem: (v) => `${v.w} fishes out of Otten's Harbor. He borrowed on the boat from ${v.rmanN} after a bad winter and now ${v.rn} has the boat tied up and says they own it. Forty-one feet. His father built half of her. "Without the boat I'm a man standing on a dock."`,
    answers: (v) => [
      A('buy', 'grant', '"I\'ll pay what you owe. You fish, and you pay me back from the catch."', `${v.$(800)} to ${v.rn}. He owes you.`, `bought back ${v.f}'s boat`, [v.pay(800), v.resp(2), v.op(16, 'Got my boat back'), v.owe('Got his boat back')], favorBack('ran a load across the bay for you with no questions', (x) => [x.gain(600)], 0.7, [6, 16])),
      A('take', 'price', '"The boat goes back to the water. It runs a few things for me, now and then."', `A word with ${v.rn}. The boat is yours to use.`, `took ${v.f}'s boat back from ${v.rn}, for his own use`, [v.resp(1), v.heat(1), ...v.riv(-10, 'Took a boat off us'), v.op(8, 'Got my boat back, with strings')], favorBack('\'s boat brought in a load off a freighter', (x) => [x.gain(900), x.heat(1)], 0.6, [4, 12])),
      toCons(v, 'got the note renegotiated'),
      no(v, '"A debt is a debt."', `left ${v.f}'s boat to ${v.rn}`, 'docks', 0.35),
    ],
  },
  {
    id: 'm_wheel_game', role: 'Boardwalk game operator', gender: 'M', age: [28, 60], bg: ['Italian', 'Jewish', 'Irish'], size: 'small', season: 'summer', low: true, needs: ['cop'], title: 'A wheel game on the boardwalk', offer: 'payment',
    problem: (v) => `${v.w} runs a wheel of fortune by Hunt's Pier: ham, bacon and cartons of cigarettes. A patrolman closed him three nights running and says games of chance need "a license," which is a brown envelope. "I already pay the pier. Now I pay the cops. Who don't I pay?"`,
    answers: (v) => [
      A('cop', 'grant', `"${v.cop ? `Sergeant ${v.cop.lastName}` : 'The sergeant'} will tell his patrolman the wheel is licensed."`, 'One call. The patrolman walks by.', `squared ${v.f}'s wheel game with the cops`, [v.resp(1), v.inf('boardwalk', 1), v.op(12, 'Kept my wheel spinning')]),
      A('ours', 'price', '"You pay me, not him. Less than him."', `${v.$(40)} a week to you in season.`, `took ${v.f}'s wheel game under his protection`, [v.gain(160), v.inf('boardwalk', 1), v.op(6, 'Pay less now')]),
      no(v, '"Pay the license."', `told ${v.f} to pay the cop`, 'boardwalk', 0.2),
    ],
  },
  {
    id: 'm_baker', role: 'Baker', gender: 'M', age: [35, 65], bg: ['Italian', 'German', 'Jewish'], size: 'small', low: true, needs: ['rival'], title: 'A baker shaken down', offer: 'payment',
    problem: (v) => `${v.w} bakes bread on Pacific Avenue, three in the morning till noon. Two of ${v.rn}'s men told him the price of bread just went up, for him: a weekly figure, or the ovens "have an accident." "I give bread to the convent for free. I'm not giving it to them."`,
    answers: (v) => [
      A('protect', 'grant', '"Your ovens are under my roof. Tell them that."', `${v.rn} takes it as a challenge.`, `put ${v.f}'s bakery under his protection`, [v.resp(3), v.inf('pacific', 2), ...v.riv(-10, 'Stood between our men and a baker'), v.op(14, 'Stood up for me')], { p: 0.3, wk: [2, 5], hint: `${v.rn} tests it`, yes: (x) => `${x.rn} broke ${x.w}'s bakery window to see what you would do`, yesFx: (x) => [x.resp(-1), ...x.rinf('pacific', 1)] }),
      A('pay', 'price', '"Pay me what they asked. Half goes to keep them off you."', 'His envelope comes to you. They stay away; you see to it.', `took ${v.f}'s envelope instead of ${v.rn}`, [v.gain(80), ...v.riv(-5, 'Took our baker'), v.op(4, 'At least he keeps them off')]),
      toCons(v, 'reminded ' + v.rn + ' whose street it is'),
      no(v, '"That\'s between you and them."', `left ${v.f} to ${v.rn}`, 'pacific', 0.4, -2),
    ],
  },
  {
    id: 'm_father_wedding', role: 'Father of the bride', gender: 'M', age: [44, 66], bg: ['Italian', 'Irish', 'Polish', 'Jewish'], size: 'small', low: true, title: 'A father and his daughter\'s wedding', offer: 'loyalty',
    problem: (v) => `${v.w} drives a bread truck for the Italian bakery on Pacific Avenue. His daughter ${brideOf(v)} marries in June, and the Dorset wants half the hall money by Friday. "Thirty years I never asked anybody for anything, ${v.addr}. She's my only girl."`,
    answers: (v) => [
      A('payall', 'grant', '"The wedding is on me. All of it. You walk her down the aisle."', `${v.$(1200)}: the hall, the band, the cake. He owes you, and the whole parish knows who paid.`, `paid for ${v.f}'s daughter's wedding`, [v.pay(1200), v.resp(3), v.op(20, 'Paid for my daughter\'s wedding'), v.owe('Paid for his daughter\'s wedding'), { type: 'gf', op: { op: 'pay', who: v.who.id, nm: brideOf(v), scope: 'all' }, ...(v.resp(0).label ? { label: v.resp(0).label } : {}) } as Effect], favorBack('\'s nephew at the bakery told you which truck carries the Manno numbers slips', (x) => [x.gain(300)], 0.5, [6, 16])),
      A('loan', 'price', '"I\'ll lend you the hall money. Easy terms, between us."', `${v.$(500)} now. He pays it back from the truck, a little every week.`, `lent ${v.f} the hall money`, [v.pay(500), v.op(8, 'Lent me the hall money'), v.owe('Lent him the hall money')]),
      A('gift', 'grant', '"Here\'s for the bride. Tell her it\'s from a friend."', `${v.$(150)} in an envelope.`, `gave ${v.f} a wedding envelope`, [v.pay(150), v.op(6, 'Gave my girl an envelope')]),
      no(v, '"A man pays for his own daughter\'s wedding."', `sent ${v.f} away`, 'downtown', 0.1),
    ],
  },
  {
    id: 'm_widower_funeral', role: 'Widower', gender: 'M', age: [50, 80], bg: ['Italian', 'Irish', 'Polish', 'Jewish'], size: 'desperate', low: true, title: 'A widower and the undertaker', offer: 'respect',
    problem: (v) => `${v.w} buried his wife Saturday, or would have: the undertaker on New Jersey Avenue won't release her without $400 down. Forty-four years married. "I sold the car. I sold her ring. I can't sell the house; she's in it, still, everywhere."`,
    answers: (v) => [
      A('pay', 'grant', '"Go home. The funeral is paid. Flowers too."', `${v.$(400)}.`, `paid for ${v.f}'s wife's funeral`, [v.pay(400), v.resp(3), v.op(20, 'Buried my wife')]),
      A('undertaker', 'grant', '"The undertaker will take what you have. I\'ll tell him."', 'He takes a hundred and his manners improve.', `made the undertaker bury ${v.f}'s wife for what he had`, [v.resp(2), v.op(14, 'Made the undertaker decent'), v.heat(1)]),
      A('ring', 'grant', '"And whoever bought her ring sells it back. Today."', `${v.$(150)}. The ring goes back in the box.`, `got ${v.f}'s wife's ring back`, [v.pay(150), v.op(12, 'Got her ring back')]),
      toPriest(v, 60),
    ],
  },
  {
    id: 'm_veteran', role: 'Veteran', gender: 'M', age: [28, 45], bg: ['Irish', 'Italian', 'Polish', 'German'], size: 'small', low: true, title: 'A veteran who can\'t get work', offer: 'loyalty',
    problem: (v) => `${v.w} was a sergeant in Korea: two Purple Hearts, a bad leg, and a bad temper he says he has under control now. Nobody hires him: the docks say the leg, the plants say the temper. "I can drive. I can count. I can stand at a door all night and nobody gets by me."`,
    answers: (v) => [
      A('door', 'grant', '"You start Friday on the door at one of my places."', 'A good man on a door. He owes you his job.', `put ${v.f} on a door`, [v.op(14, 'Gave me work when nobody would'), v.resp(1)], { p: 0.5, wk: [6, 16], hint: 'he wants to come in all the way', yes: (x) => `${x.w}, steady on the door all season, asked to be put on with the crew; he was`, yesFx: (x) => [x.crew(1, 'A good man came on')] }),
      A('job', 'grant', '"The Public Works needs a foreman. Tell them I sent you."', 'A city job with a pension.', `got ${v.f} a city job`, [v.resp(1), v.op(12, 'Got me a city job'), v.inf('downtown', 1)]),
      A('vfw', 'send', '"Go see the VFW. I\'ll make a call."', 'The veterans look after their own, slowly.', `sent ${v.f} to the VFW`, [v.op(2, 'Made a call for me')], { p: 0.5, wk: [3, 8], hint: 'the VFW finds him work', yes: (x) => `the VFW found ${x.w} work at the Coast Guard station`, no: (x) => `${x.w} is still looking`, noFx: (x) => [x.op(-3, 'Nothing came of it')] }),
      no(v, '"I\'ve got enough men."', `turned ${v.f} away`, 'downtown', 0.3),
    ],
  },
  {
    id: 'm_burned_out', role: 'Shopkeeper', gender: 'M', age: [35, 65], bg: ['Jewish', 'Italian', 'Greek', 'Irish'], size: 'desperate', needs: ['rival'], title: 'A shopkeeper burned out', offer: 'information',
    problem: (v) => `${v.w}'s hardware store burned Tuesday night. The fire marshal says faulty wiring; ${v.w} says he rewired it himself in the spring, and that a man from ${v.rn} came by twice in May about "insurance." The insurance company won't pay until the marshal changes his mind.`,
    answers: (v) => [
      A('rebuild', 'grant', '"You\'ll rebuild. I\'ll front the lumber."', `${v.$(900)}. He owes you a store.`, `fronted ${v.f} the money to rebuild`, [v.pay(900), v.resp(3), v.op(18, 'Helped me rebuild'), v.owe('Fronted the rebuild')], favorBack('\'s new store took in goods for you, no questions', (x) => [x.gain(600)], 0.6, [8, 20])),
      A('marshal', 'grant', '"The marshal will look again. More carefully."', 'A word, and the report changes. The insurance pays.', `got the fire marshal to look again for ${v.f}`, [v.resp(2), v.heat(1), v.op(14, 'Got the insurance to pay')], { p: 0.7, wk: [2, 5], hint: 'the report changes to arson', yes: (x) => `the marshal's new report said arson; ${x.w}'s insurance paid and the county asked questions of ${x.rn}`, yesFx: (x) => [...x.rinf('downtown', -2)], no: () => `the marshal stood by his wiring report`, noFx: (x) => [x.op(-3, 'The marshal would not budge')] }),
      A('even', 'price', `"And ${v.rn} pays for the store. One way or the other."`, `A message to ${v.rboss}. It could start something.`, `made ${v.rn} answer for ${v.f}'s store`, [v.resp(3), ...v.riv(-15, 'Accused us of a fire'), v.op(12, 'Made them answer'), v.heat(2)], { p: 0.4, wk: [1, 4], hint: `${v.rn} pays`, yes: (x) => `${x.rn} sent an envelope for ${x.w}'s store, through a lawyer`, yesFx: (x) => [x.resp(1)], no: (x) => `${x.rn} laughed off the message`, noFx: (x) => [x.resp(-1)] }),
      no(v, '"Fires happen, my friend."', `told ${v.f} fires happen`, 'downtown', 0.35),
    ],
  },
  {
    id: 'm_daughter_musician', role: 'Father', gender: 'M', age: [42, 65], bg: ['Italian', 'Irish', 'Jewish'], size: 'small', low: true, season: 'summer', title: 'A daughter and a trumpet player', offer: 'respect',
    problem: (v) => `${v.w}'s daughter is twenty, a good girl, and she ran off with a trumpet player from a band at the Riptide. They're living in a rooming house on Cedar, she's singing with the band, and he wants her home. "She won't see me. She'll see you."`,
    answers: (v) => [
      A('talk', 'grant', '"I\'ll talk to her. If she wants to come home, she comes. If not, you leave her be."', 'Her choice. You make sure it\'s hers and nobody else\'s.', `talked to ${v.f}'s daughter for him`, [v.resp(1), v.op(8, 'Talked to my girl')], { p: 0.4, wk: [2, 6], hint: 'she comes home', yes: (x) => `${x.w}'s daughter came home for Sunday dinner, and kept singing on Saturdays`, yesFx: (x) => [x.op(8, 'My girl came home')], no: (x) => `${x.w}'s daughter stayed with her trumpet player; she sent her father a postcard from Atlantic City`, noFx: () => [] }),
      A('check', 'grant', '"I\'ll find out about the trumpet player. If he\'s a bum, she\'ll hear it."', `${v.$(40)}. A few questions at the union hall.`, `checked out ${v.f}'s daughter's musician`, [v.pay(40), v.op(6, 'Checked out the boy')]),
      A('stay', 'refuse', '"She\'s a grown woman. She chose."', 'You stay out of it. The father doesn\'t forgive it.', `told ${v.f} his daughter is grown`, [v.op(-5, 'Would not help with my girl')]),
    ],
  },
  {
    id: 'm_kid_life', role: 'Young man', gender: 'M', age: [18, 22], bg: ['Italian', 'Irish'], size: 'small', title: 'A kid who wants in', offer: 'loyalty',
    problem: (v) => `${v.w} is nineteen, works the parking lot at the Starlight, and has been watching your men for two summers: the cars, the suits, how the waiters move for them. He came in with his hair combed and his hands shaking. "I don't want to park cars for the rest of my life. I want to work for you."`,
    offerLine: () => 'He offers the only thing he has: himself.',
    answers: (v) => [
      A('take', 'grant', '"You run errands for one of my men. Keep your mouth shut and your eyes open."', 'He starts at the bottom, as an associate. Adults only; he is nineteen.', `took on ${v.f} as a runner`, [v.op(16, 'Gave me my chance')], { p: 0.75, wk: [2, 6], hint: 'he reports for work', son: true, yes: (x) => `${x.w} showed up every morning at seven, and was put on`, no: (x) => `${x.w}'s mother got wind of it and sent him to his uncle in Newark` }),
      A('school', 'refuse', '"Finish something first. Then come back."', 'A gentle no. He may come back, or go elsewhere.', `sent ${v.f} back to finish school`, [v.op(-2, 'Told me to wait')], toRival(v, 'pacific', 0.25)),
      A('honest', 'grant', '"There\'s a job at the bank. Take it. This life isn\'t a parking lot, it\'s a cemetery."', 'A real job. He may thank you in twenty years.', `got ${v.f} an honest job`, [v.resp(1), v.op(4, 'Got me a job, not the one I wanted')]),
      no(v, '"Go home, kid."', `sent ${v.f} home`, 'pacific', 0.35, 0),
    ],
  },
  {
    id: 'm_priest_coal', role: 'Priest', gender: 'M', age: [40, 70], bg: ['Irish', 'Italian'], size: 'small', season: 'winter', title: 'The parish school\'s coal', offer: 'respect',
    problem: (v) => `Father ${v.last} of the parish school, with snow on his hat. The boiler at the school takes coal and the coal fund ran out in January. "The sisters are teaching in their coats. The children write with mittens on. I'm told you're a man who can't stand to see that."`,
    offerLine: () => 'He offers prayers, sincerely, and the parish\'s goodwill, which is worth more.',
    answers: (v) => [
      A('coal', 'grant', '"The coal truck will be there in the morning. Through April."', `${v.$(400)}.`, `paid for the parish school's coal`, [v.pay(400), v.resp(3), v.heat(-2)], { p: 0.6, wk: [2, 6], hint: 'praised from the pulpit', yes: (x) => `Father ${x.last} thanked "a friend of the parish" at every Mass; everybody knew`, yesFx: (x) => [x.resp(2), x.heat(-2)] }),
      A('half', 'grant', '"Half. The rest from the Knights of Columbus. I\'ll call them."', `${v.$(200)} and a call.`, `paid half the school's coal`, [v.pay(200), v.resp(2)]),
      A('dealer', 'grant', '"The coal dealer owes me. He\'ll deliver for nothing."', 'A word with the coal dealer.', `got the coal dealer to heat the parish school`, [v.resp(2), v.heat(1)]),
      no(v, '"I\'ll pray on it, Father."', `left the parish school to the diocese`, 'downtown', 0.05),
    ],
  },
  {
    id: 'm_eviction', role: 'Father of a family', gender: 'M', age: [30, 55], bg: ['Italian', 'Irish', 'Polish', 'Portuguese'], size: 'desperate', season: 'winter', low: true, title: 'A family on the sidewalk', offer: 'loyalty',
    problem: (v) => `${v.w} was laid off from the glass works in November. The landlord put a padlock on the door Thursday; his wife and three kids are at her sister's, sleeping four to a bed. The furniture is on the sidewalk on Baker Avenue. "I'll pay it all back the day I work."`,
    answers: (v) => [
      A('rent', 'grant', '"The padlock comes off today. I\'ll pay the back rent."', `${v.$(300)}.`, `paid ${v.f}'s back rent`, [v.pay(300), v.resp(2), v.op(18, 'Put my family back in our home'), v.owe('Paid the back rent')], favorBack('worked a month for you for nothing, driving', (x) => [x.gain(300)], 0.7, [4, 10])),
      A('landlord', 'grant', '"The landlord will give you till spring. I\'ll explain it to him."', 'The landlord listens. He won\'t forget either.', `got ${v.f}'s landlord to wait till spring`, [v.resp(2), v.heat(1), v.op(14, 'Got us till spring')]),
      A('work', 'price', '"There\'s work, now. You drive for me. Don\'t ask what\'s in the truck."', 'Wages. And a man who knows a little.', `put ${v.f} to work driving`, [v.op(10, 'Gave me work'), v.heat(1)], favorBack('drove a load to Philadelphia and kept his mouth shut', (x) => [x.gain(400)], 0.7, [3, 8])),
      toPriest(v, 60),
    ],
  },
  {
    id: 'm_judge', role: 'Man wronged by a judge', gender: 'M', age: [35, 65], bg: ['Italian', 'Jewish', 'Irish'], size: 'big', needs: ['judge'], title: 'A man and the county judge', offer: 'favor',
    problem: (v) => `${v.w} lost his luncheonette in a lawsuit to a neighbor whose cousin is clerk in ${v.judge ? `Judge ${v.judge.lastName}` : 'the judge'}'s court. The judgment came down before his lawyer finished speaking. "The judge didn't even look up, ${v.addr}. He had decided at breakfast."`,
    answers: (v) => [
      A('appeal', 'grant', '"The appeal will go to a judge who reads. I\'ll see to that."', 'A favor spent in Trenton. He owes you the luncheonette.', `got ${v.f}'s appeal heard properly`, [v.fav(-1), v.resp(2), v.op(16, 'Got me a fair hearing'), v.owe('Got his appeal heard')], { p: 0.65, wk: [6, 14], hint: 'he gets his place back', yes: (x) => `${x.w} won his appeal and reopened his luncheonette; your coffee is free for life`, yesFx: (x) => [x.resp(1)], no: (x) => `${x.w} lost the appeal too; the clerk's cousin runs the luncheonette now`, noFx: (x) => [x.op(-4, 'I lost anyway')] }, v.s.favors < 1 ? 'No favors to spend' : undefined),
      A('judge', 'price', `"${v.judge ? `Judge ${v.judge.lastName}` : 'The judge'} owes me money. He'll owe me a hearing too."`, 'You lean on the judge himself. It costs you something with him.', `leaned on the judge for ${v.f}`, [v.resp(2), v.heat(2), v.op(14, 'Leaned on the judge'), ...(v.judge ? [v.opOf(v.judge.id, -10, 'Was pushed over a luncheonette')] : [])]),
      toCons(v, 'found a lawyer who knows the appellate court'),
      no(v, '"You don\'t fight a judge on his own bench."', `told ${v.f} to live with the judgment`, 'downtown', 0.1),
    ],
  },
  {
    id: 'm_numbers_hit', role: 'Numbers player', gender: 'M', age: [30, 70], bg: ['Italian', 'Irish', 'Polish'], size: 'small', low: true, needs: ['rival'], title: 'A man who hit the number', offer: 'loyalty',
    problem: (v) => `${v.w} played 7-4-1 for eleven years, his wife's birthday, a dime a day, and on Thursday it came out. ${v.rn}'s bank says his runner never turned in the slip. The runner says he did. "Six hundred to one, ${v.addr}. Sixty dollars. I wanted to buy her a coat."`,
    answers: (v) => [
      A('collect', 'grant', `"${v.rn} pays a winner. Every winner. I'll remind them."`, 'A message. A bank that doesn\'t pay is bad for every bank.', `made ${v.rn}'s bank pay ${v.f}`, [v.resp(2), ...v.riv(-4, 'Told us how to run our bank'), v.op(14, 'Got me paid')]),
      A('pay', 'grant', '"Here\'s your sixty. Buy her the coat. From now on you play with my bank."', `${v.$(60)}, and a new customer.`, `paid ${v.f}'s number himself`, [v.pay(60), v.inf('downtown', 1), v.op(12, 'Paid my number'), v.resp(1)]),
      no(v, '"No slip, no money. That\'s how it works."', `told ${v.f} no slip, no money`, 'downtown', 0.2),
    ],
  },
  {
    id: 'm_union', role: 'Union man', gender: 'M', age: [35, 60], bg: ['Irish', 'Italian', 'Polish'], size: 'big', title: 'An election at the local', offer: 'vote',
    problem: (v) => `${v.w} is running for business agent of the hotel and restaurant workers' local. The other slate is backed out of Philadelphia and they have the ballot box in the treasurer's closet. "I don't want anybody hurt. I want the box counted in the open, where the members can see."`,
    answers: (v) => [
      A('count', 'grant', '"The box gets counted in the open. My men will stand at the door."', 'Your men watch the count. Philadelphia notices.', `had his men watch ${v.f}'s union count`, [v.resp(2), v.inf('pacific', 2), v.op(14, 'Got me an honest count'), { type: 'rivalOpinion', rival: 'philly', amount: -4, reason: 'Meddled in a Philadelphia local', label: `The office: ${v.w}` } as Effect], { p: 0.6, wk: [3, 8], hint: 'he wins, and the local is friendly', yes: (x) => `${x.w} won the local; the hotel kitchens hire whoever you send`, yesFx: (x) => [x.fav(1), x.inf('pacific', 2)], no: (x) => `${x.w} lost the count fair and square`, noFx: () => [] }),
      A('money', 'grant', '"Here\'s money for the campaign. Leaflets, beer, a hall."', `${v.$(400)}. Your man in the local, maybe.`, `funded ${v.f}'s union campaign`, [v.pay(400), v.op(10, 'Paid for my campaign')], { p: 0.5, wk: [3, 8], hint: 'he wins', yes: (x) => `${x.w} won the local, and remembers who paid for the beer`, yesFx: (x) => [x.fav(1)], no: (x) => `${x.w} lost by forty votes` }),
      A('philly', 'send', '"Philadelphia\'s locals are Philadelphia\'s business. Talk to the bagman."', 'You keep out of it. He knows what that means.', `sent ${v.f} to Philadelphia`, [v.op(-4, 'Sent me to them')]),
      no(v, '"Unions are trouble I don\'t need."', `turned ${v.f} away`, 'pacific', 0.1),
    ],
  },
  {
    id: 'm_contractor', role: 'Contractor', gender: 'M', age: [35, 60], bg: ['Italian', 'Irish', 'German'], size: 'big', needs: ['council'], title: 'A contractor frozen out', offer: 'payment',
    problem: (v) => `${v.w} pours concrete. He bid lowest on the new boardwalk ramps three years running and lost three years running to the same outfit, whose owner is ${v.council ? `Councilman ${v.council.lastName}` : 'a councilman'}'s brother-in-law. "I'm not asking for a gift. I'm asking for a fair look at my number."`,
    answers: (v) => [
      A('look', 'grant', '"This year your number gets a fair look."', 'A call. The councilman owes you; now you owe the contractor nothing.', `got ${v.f} a fair look at City Hall`, [v.resp(1), v.op(14, 'Got me a fair look'), v.owe('Got his bid a fair look')], { p: 0.6, wk: [4, 10], hint: 'he wins the contract', yes: (x) => `${x.w} won the ramps contract; an envelope came to the club`, yesFx: (x) => [x.gain(600)], no: (x) => `${x.w} lost again; the councilman says it was fair this time` }),
      A('piece', 'price', '"You get the contract. Ten points are mine."', 'A lean on City Hall. Ten percent of a city job.', `got ${v.f} the contract for ten points`, [v.heat(2), v.op(4, 'Took ten points')], favorBack('\'s first payment on the ramps came in, ten points', (x) => [x.gain(1200)], 0.75, [4, 10])),
      toCons(v, 'found him subcontract work on the Crest seawall'),
      no(v, '"City Hall is City Hall."', `left ${v.f} to City Hall`, 'downtown', 0.15),
    ],
  },
  {
    id: 'm_cab', role: 'Cab driver', gender: 'M', age: [25, 60], bg: ['Irish', 'Jewish', 'Italian', 'Greek'], size: 'small', low: true, needs: ['rival'], rivals: ['kessler'], title: 'A cab driver and the taxi stand', offer: 'information',
    problem: (v) => `${v.w} drives a Checker on the island. ${v.rn}'s cab company told every independent driver to stay off the stands by the clubs at night or lose their windshields. He's lost two. "Nights are the only money. Daytime, it's old ladies going to Acme."`,
    offerLine: () => 'Cab drivers know who goes where at two in the morning, he says.',
    answers: (v) => [
      A('stand', 'grant', '"The stand at the Riptide is yours. Anybody bothers you, my name."', `${v.rn} hears about it.`, `got ${v.f} his taxi stand back`, [v.resp(2), v.inf('pacific', 1), ...v.riv(-5, 'Put a driver on our stand'), v.op(12, 'Got my stand back')], favorBack('told you who rode to a Kessler meeting at two in the morning', (x) => [...x.rinf('north', -1), x.fav(1)])),
      A('radio', 'price', '"Drive for a company of mine. Nobody touches my cabs."', 'He drives for you and hears everything.', `took ${v.f} on as a driver`, [v.op(8, 'Gave me a good shift'), v.gain(40)]),
      no(v, '"Drive days."', `told ${v.f} to drive days`, 'pacific', 0.15),
    ],
  },
  {
    id: 'm_greek_diner', role: 'Diner owner', gender: 'M', age: [35, 65], bg: ['Greek'], size: 'small', low: true, title: 'A diner and the health inspector', offer: 'payment',
    problem: (v) => `${v.w} runs a diner on Rio Grande Avenue, open twenty-four hours since 1947. The new county health inspector has closed him twice this summer, each time on a Friday, each time "for violations" that a twenty-dollar bill would fix. "My kitchen is cleaner than his house."`,
    answers: (v) => [
      A('inspector', 'grant', '"The inspector will find your kitchen spotless."', 'A word with somebody at the county.', `squared the inspector for ${v.f}`, [v.resp(1), v.op(12, 'Got the inspector off me')]),
      A('ours', 'price', '"Your coffee is free for my men, and your problems are mine."', 'Free meals for your crew. His trouble stops.', `took ${v.f}'s diner under his protection`, [v.crew(1, 'Free coffee at the diner'), v.op(6, 'Protected for a few coffees')]),
      no(v, '"Twenty dollars is cheap, my friend."', `told ${v.f} to pay the inspector`, 'causeway', 0.1),
    ],
  },
  {
    id: 'm_pension_thief', role: 'Old man', gender: 'M', age: [66, 84], bg: ['Polish', 'German', 'Irish', 'Italian'], size: 'small', low: true, title: 'An old man and the mailboxes', offer: 'respect',
    problem: (v) => `${v.w}, seventy-five, with a cane and a hearing aid. Somebody has been stealing Social Security checks from the mailboxes in his building on Glenwood Avenue, three months now, his and the widows'. The post office says "file a form." "We're old, ${v.addr}. Not stupid. We know which boy it is."`,
    answers: (v) => [
      A('boy', 'grant', '"The boy gives back the money. And he moves to his aunt\'s in Millville."', 'A talk with the boy and his father. Nothing rough.', `made the check thief give it back`, [v.resp(2), v.op(14, 'Got our checks back')], { p: 0.75, wk: [1, 3], hint: 'the money comes back', yes: () => `the boy brought back what he could, and his father made up the rest; the widows sent a pie to the club`, yesFx: (x) => [x.resp(1)], no: () => `the boy had spent it all at the track; his father works it off for the widows` }),
      A('pay', 'grant', '"Here\'s their money. All of it. Everyone in the building."', `${v.$(220)}.`, `paid back the stolen pension checks`, [v.pay(220), v.resp(2), v.op(12, 'Made us whole')]),
      no(v, '"File the form."', `told ${v.f} to file the form`, 'downtown', 0.05),
    ],
  },
  {
    id: 'm_docks_hall', role: 'Dock worker', gender: 'M', age: [22, 50], bg: ['Portuguese', 'Irish', 'Polish'], size: 'small', low: true, needs: ['rival'], rivals: ['manno'], title: 'A dock worker and the shape-up', offer: 'loyalty',
    problem: (v) => `${v.w} stands the shape-up every morning on the bay docks and the hiring boss, a ${v.rn} man, never picks him unless he kicks back two dollars a day. "Two dollars out of twelve, ${v.addr}. I have a wife expecting."`,
    answers: (v) => [
      A('boss', 'grant', '"Tomorrow you get picked. Every day."', `A word on the docks. ${v.rn} feels it.`, `got ${v.f} picked at the shape-up`, [v.resp(2), v.inf('docks', 2), ...v.riv(-6, 'Muscled in on our shape-up'), v.op(14, 'Got me work every day')], favorBack('told you which crates come off at night and where they go', (x) => [x.gain(300), ...x.rinf('docks', -1)])),
      A('crew', 'grant', '"Work for one of my men instead. Better money."', 'He comes off the docks and into your orbit.', `took ${v.f} off the docks`, [v.op(10, 'Gave me better work')]),
      no(v, '"Everybody kicks back on the docks."', `left ${v.f} to the hiring boss`, 'docks', 0.3),
    ],
  },
  {
    id: 'm_bartender', role: 'Bartender', gender: 'M', age: [25, 55], bg: ['Irish', 'Italian', 'German'], size: 'small', low: true, needs: ['rival'], title: 'A bartender who wouldn\'t water the scotch', offer: 'information',
    problem: (v) => `${v.w} tended bar at a ${v.rn} club for six years. They told him to water the scotch for the tourists and he said no; now he can't get hired anywhere on Pacific Avenue. "I'm not a saint. I just don't cheat a man on his drink."`,
    offerLine: () => 'He knows every bar on the avenue, he says, and what goes on behind it.',
    answers: (v) => [
      A('hire', 'grant', '"You pour at one of my places. Honest pours."', 'A good bartender. He brings his customers.', `hired ${v.f} at one of his bars`, [v.op(14, 'Hired me when they blackballed me'), v.gain(40)], favorBack(`told you what ${v.rn}'s club takes in on a Saturday, and who skims it`, (x) => [...x.rinf('pacific', -1), x.fav(1)])),
      A('word', 'grant', '"Every owner on Pacific will hear you\'re a good man."', 'Your word against theirs.', `put in a word for ${v.f} on Pacific`, [v.resp(1), ...v.riv(-3, 'Spoke for a man we fired'), v.op(10, 'Spoke for me')]),
      no(v, '"Water the scotch next time."', `told ${v.f} to water the scotch`, 'pacific', 0.2),
    ],
  },
  {
    id: 'm_young_groom', role: 'Young man', gender: 'M', age: [21, 28], bg: ['Italian', 'Irish', 'Polish'], size: 'small', low: true, title: 'A young man and a girl\'s father', offer: 'loyalty',
    problem: (v) => `${v.w} wants to marry the girl he's been seeing since high school, twenty-three, a nurse's aide. Her father says not until he has a real job and a down payment on a house in the Crest. "She said yes. He said not on a dishwasher's pay. He's not wrong."`,
    answers: (v) => [
      A('job', 'grant', '"There\'s a real job at the lumber yard. Start Monday."', 'A job. The rest is up to them.', `got ${v.f} a real job`, [v.op(14, 'Got me a real job'), v.resp(1)]),
      A('loan', 'grant', '"Here\'s the down payment. You pay me back a little every month. No vig."', `${v.$(500)}. He owes you a house.`, `lent ${v.f} the down payment`, [v.pay(500), v.op(16, 'Got me the house'), v.owe('Lent the down payment')], { p: 0.75, wk: [16, 30], hint: 'he pays it back', yes: (x) => `${x.w} paid back the down payment, and you were godfather to the first one`, yesFx: (x) => [x.gain(500), x.resp(1)], no: (x) => `${x.w} is still paying, a little at a time` }),
      A('father', 'grant', '"I\'ll talk to her father. Then she decides."', 'A word with her father. It is still her choice.', `talked to the girl's father for ${v.f}`, [v.op(8, 'Talked to her father')]),
      no(v, '"Wash dishes and save."', `told ${v.f} to save his money`, 'downtown', 0.05, 0),
    ],
  },
  {
    id: 'm_pharmacist', role: 'Pharmacist', gender: 'M', age: [35, 65], bg: ['Jewish', 'Italian', 'German'], size: 'small', needs: ['rival'], title: 'A pharmacist robbed twice', offer: 'information',
    problem: (v) => `${v.w}'s drugstore on Atlantic Avenue has been held up twice since Easter by boys looking for the narcotics cabinet, and he knows who's buying from them. "The police take a report. The boys come back. I have a wife who works the register."`,
    answers: (v) => [
      A('protect', 'grant', '"Nobody comes in your store again. And the boys get a talking-to."', 'Your men find the boys. Nothing on the page; the boys stop.', `put ${v.f}'s drugstore under his protection`, [v.resp(2), v.op(14, 'Kept my store safe'), v.heat(1)], favorBack(`told you who is buying the pills: a ${v.rn} man`, (x) => [...x.riv(-4, 'You know about our pills'), x.fav(1)])),
      A('feds', 'price', '"Tell the narcotics bureau who\'s buying. My lawyer goes with you."', `It hurts whoever is dealing. It puts the feds on the island.`, `sent ${v.f} to the narcotics bureau`, [v.heat(2, 'federal'), ...v.rinf('downtown', -2), v.op(6, 'Sent me to the federal men')]),
      no(v, '"Get a better lock."', `told ${v.f} to buy a better lock`, 'downtown', 0.1),
    ],
  },
  {
    id: 'm_bandleader', role: 'Bandleader', gender: 'M', age: [28, 55], bg: ['Italian', 'Jewish', 'Irish'], size: 'small', season: 'summer', needs: ['rival'], rivals: ['kessler'], title: 'A band that wasn\'t paid', offer: 'payment',
    problem: (v) => `${v.w} leads a seven-piece band. They played four weeks at a ${v.rn} club in North Wildwood and the owner paid the first week and then said "next Friday" three times. Seven men, ${v.addr}, and two of them have kids. "The union won't touch it. The union drinks there."`,
    answers: (v) => [
      A('collect', 'grant', `"${v.rboss} pays his musicians. I'll see he remembers."`, `A message to ${v.rn}.`, `collected ${v.f}'s band's money from ${v.rn}`, [v.resp(2), ...v.riv(-5, 'Collected from our club'), v.op(14, 'Got my band paid')]),
      A('book', 'price', '"Play my clubs from now on. I pay on Friday. You pay me the booking."', 'A good band on your stage; ten percent of their bookings.', `booked ${v.f}'s band at his clubs`, [v.gain(80), v.op(8, 'Booked us'), ...v.riv(-3, 'Took our band')]),
      no(v, '"Musicians get stiffed. It\'s the business."', `told ${v.f} it\'s the business`, 'north', 0.15),
    ],
  },
  {
    id: 'm_farmer', role: 'Farmer from Rio Grande', gender: 'M', age: [45, 75], bg: ['German', 'Italian', 'Irish'], size: 'big', needs: ['council'], title: 'A farmer and the new road', offer: 'vote',
    problem: (v) => `${v.w} grows tomatoes and lima beans off the causeway, on land his grandfather cleared. The county wants a road through the middle of it and is offering a third of what it's worth. "Somebody on the freeholders already bought the land on the other side. I can read a map."`,
    answers: (v) => [
      A('price', 'grant', '"The county will pay what it\'s worth. Or the road goes elsewhere."', 'A word with the freeholders. They owe you something.', `got ${v.f} a fair price from the county`, [v.resp(2), v.inf('causeway', 2), v.op(14, 'Got me a fair price')], favorBack('brought every farm vote on the mainland for your candidate', (x) => [x.inf('causeway', 2), x.fav(1)], 0.6, [6, 16])),
      A('buy', 'price', '"Sell it to me, at a fair price. I\'ll deal with the county."', `${v.$(1200)} for land the road will make worth double.`, `bought ${v.f}'s farm ahead of the road`, [v.pay(1200), v.op(6, 'Bought me out fair')], favorBack('\'s old farm sold to the county for twice what you paid', (x) => [x.gain(2200)], 0.7, [12, 26])),
      toCons(v, 'found him a lawyer who knows the condemnation board'),
      no(v, '"You can\'t fight the county."', `told ${v.f} to take the county's price`, 'causeway', 0.15),
    ],
  },
  {
    id: 'm_tailor', role: 'Tailor', gender: 'M', age: [45, 75], bg: ['Jewish', 'Italian'], size: 'small', needs: ['rival'], rivals: ['feldstein'], title: 'A tailor and the note', offer: 'payment',
    problem: (v) => `${v.w} has made suits on Pacific Avenue since before the war; half your men wear his work. He borrowed from a ${v.rn} finance company to buy the building, and now they've sold the note and the new holder wants it all by September. "They want the building. They don't want my money."`,
    answers: (v) => [
      A('note', 'grant', '"I\'ll buy the note. You pay me what you paid them."', `${v.$(1000)}. He owes you, and so does every suit he makes.`, `bought ${v.f}'s note`, [v.pay(1000), v.resp(2), v.op(16, 'Saved my building'), v.owe('Bought his building\'s note'), ...v.riv(-4, 'Took a note from us')], { p: 0.8, wk: [10, 24], hint: 'he pays it off', yes: (x) => `${x.w} paid off his note to you in full, and threw in a suit`, yesFx: (x) => [x.gain(1000)] }),
      A('suits', 'price', '"I\'ll handle it. Suits for my men at cost from now on."', `A word with ${v.rn}. Your crew dresses well.`, `got ${v.rn} to extend ${v.f}'s note`, [v.crew(2, 'Suits at cost'), ...v.riv(-6, 'Leaned on our note'), v.op(8, 'Got me time')]),
      no(v, '"Business is business."', `left ${v.f} to ${v.rn}`, 'pacific', 0.3),
    ],
  },
  {
    id: 'm_ice_cream', role: 'Ice cream man', gender: 'M', age: [24, 55], bg: ['Italian', 'Greek', 'Irish'], size: 'small', season: 'summer', low: true, needs: ['rival'], title: 'A Good Humor war', offer: 'information',
    problem: (v) => `${v.w} drives an ice cream truck along the beach blocks. A cousin of ${v.rmanN} put a second truck on his route, ten minutes ahead of him, and yesterday somebody let the air out of his tires. "Ice cream, ${v.addr}. They're fighting me over ice cream."`,
    offerLine: () => 'He sees every street on the island every afternoon, he says.',
    answers: (v) => [
      A('route', 'grant', '"The beach blocks are yours. The cousin finds another island."', `A word to ${v.rn}. Small, but they notice.`, `kept ${v.f}'s ice cream route for him`, [v.resp(1), ...v.riv(-2, 'Ice cream, of all things'), v.op(12, 'Kept my route')], favorBack('noticed a county car parked on the same block three afternoons running', (x) => [x.heat(-3)], 0.5)),
      A('split', 'grant', '"Split the route. Mornings and afternoons. Shake hands."', 'You arrange it. Everybody sells ice cream.', `split the ice cream route`, [v.resp(1), v.op(6, 'Made a fair split')]),
      no(v, '"Sell faster."', `told ${v.f} to sell faster`, 'boardwalk', 0.05, 0),
    ],
  },
  {
    id: 'm_garage', role: 'Garage owner', gender: 'M', age: [30, 60], bg: ['Italian', 'Irish', 'Polish'], size: 'small', needs: ['rival', 'cop'], title: 'Stolen cars in a garage lot', offer: 'loyalty',
    problem: (v) => `${v.w} runs a garage on the causeway. Three times this summer somebody's left a stolen car in his lot overnight, and the police come in the morning and look at him. "${v.rn} is using my lot for a parking place. And the police are building a case on me."`,
    answers: (v) => [
      A('cops', 'grant', `"I'll tell ${v.cop ? `Sergeant ${v.cop.lastName}` : 'the sergeant'} you're not his man. And ${v.rn} parks elsewhere."`, 'Two messages. Both land.', `cleared ${v.f} with the cops and ${v.rn}`, [v.resp(2), ...v.riv(-5, 'Kicked us off a lot'), v.op(14, 'Kept me out of jail')]),
      A('ours', 'price', '"From now on, the cars that park there are mine. You get a piece."', 'His lot works for you. The cops are your problem.', `took ${v.f}'s lot for his own cars`, [v.gain(200), v.heat(2), v.inf('causeway', 1), ...v.riv(-8, 'Took our lot'), v.op(4, 'At least I get a piece')]),
      no(v, '"Get a fence."', `told ${v.f} to buy a fence`, 'causeway', 0.2),
    ],
  },
  {
    id: 'm_nephew_sicily', role: 'Old man', gender: 'M', age: [60, 82], bg: ['Italian'], size: 'big', title: 'A nephew in Sicily', offer: 'son',
    problem: (v) => `${v.w} came from Castellammare in 1913. His sister's boy, twenty, wants to come over and the quota is closed till God knows when. "A congressman can do it with a private bill, I'm told. I'm told you know a congressman."`,
    offerLine: () => 'The boy will work for whoever brings him over, he says. For life.',
    answers: (v) => [
      A('bill', 'grant', `"${v.pol ? `Assemblyman ${v.pol.lastName}` : 'My friend in Trenton'} knows the congressman. The boy will come."`, 'A favor spent. A boy who owes you his country.', `brought ${v.f}'s nephew over from Sicily`, [v.fav(-1), v.resp(2), v.op(18, 'Brought my sister\'s boy over')], { p: 0.7, wk: [12, 26], hint: 'the nephew comes to work for you', son: true, yes: (x) => `${x.w}'s nephew stepped off the boat in Philadelphia and came straight to the club`, no: (x) => `the private bill died in committee; ${x.w} lit a candle anyway` }, v.s.favors < 1 ? 'No favors to spend' : undefined),
      A('canada', 'price', '"There are other ways in. Through Montreal. It costs."', `${v.$(600)}, a man in Montreal, and a boy who owes you more than a job.`, `arranged ${v.f}'s nephew's way in through Montreal`, [v.pay(600), v.heat(1, 'federal'), v.op(14, 'Brought my sister\'s boy')], { p: 0.75, wk: [8, 16], hint: 'the nephew arrives', son: true, yes: (x) => `${x.w}'s nephew came down from Montreal in the back of a produce truck`, no: (x) => `${x.w}'s nephew was stopped at the border and sent back`, noFx: (x) => [x.heat(1, 'federal')] }),
      no(v, '"The quota is the quota."', `told ${v.f} the quota is the quota`, 'downtown', 0.05),
    ],
  },
  {
    id: 'm_coach', role: 'High school coach', gender: 'M', age: [30, 55], bg: ['Irish', 'Italian', 'Polish'], size: 'small', low: true, title: 'The football team\'s uniforms', offer: 'respect',
    problem: (v) => `Coach ${v.last} of Wildwood High, in a letterman's jacket. The board of education cut the football budget and the boys are playing in jerseys from 1951, patched. "Thanksgiving is Lower Cape May. I won't have my boys look like orphans in front of Lower Cape May."`,
    answers: (v) => [
      A('all', 'grant', '"New uniforms. Helmets too. Send me the bill."', `${v.$(450)}. The whole town comes to the Thanksgiving game.`, `bought the high school football team new uniforms`, [v.pay(450), v.resp(3), v.heat(-1)]),
      A('half', 'grant', '"I\'ll match whatever the boosters raise."', `${v.$(200)}.`, `matched the football boosters`, [v.pay(200), v.resp(1)]),
      no(v, '"The board has its reasons."', `left the football team to the board`, 'downtown', 0.05),
    ],
  },
  {
    id: 'm_doctor', role: 'Doctor', gender: 'M', age: [45, 68], bg: ['Jewish', 'Italian', 'Irish'], size: 'big', title: 'The doctor who asks no questions', offer: 'favor',
    problem: (v) => `Dr. ${v.last} has stitched up three of your men this year at his kitchen table, cash, no reports. His son was turned down by Penn's medical school with grades better than the boys they took. "There are quotas, unwritten. I thought maybe somebody could write a different letter."`,
    answers: (v) => [
      A('letter', 'grant', '"His letter will come from somebody Penn listens to."', 'A favor spent with a trustee. The doctor is yours.', `got the doctor's son into medical school`, [v.fav(-1), v.resp(1), v.op(20, 'Got my son into Penn'), v.owe('Got his son into Penn'), v.crew(1, 'The doctor will always come')], favorBack('stitched up one of your men and lost the paperwork', (x) => [x.heat(-4)], 0.8, [6, 20]), v.s.favors < 1 ? 'No favors to spend' : undefined),
      A('tuition', 'grant', '"Jefferson, then. And the tuition is on me."', `${v.$(800)}. A doctor who owes you a son.`, `paid the doctor's son's tuition at Jefferson`, [v.pay(800), v.op(16, 'Paid for my son\'s school'), v.owe('Paid his son\'s tuition')]),
      no(v, '"I can\'t fix Philadelphia, Doc."', `told the doctor he could not help`, 'downtown', 0.05, 0),
    ],
  },
  {
    id: 'm_brother_trenton', role: 'Brother of a prisoner', gender: 'M', age: [30, 60], bg: ['Italian', 'Irish', 'Polish'], size: 'big', title: 'A brother in Trenton State', offer: 'loyalty',
    problem: (v) => `${v.w}'s younger brother is doing five years in Trenton State for a hijacking he wouldn't talk about, and he's in the wing with the Newark people who think he's somebody else's man. Their mother is seventy-four and can't make the trip. "Get him moved to Leesburg. Closer, and safer."`,
    answers: (v) => [
      A('move', 'grant', '"He\'ll be in Leesburg by the first of the month."', 'A favor spent with the Department of Corrections.', `got ${v.f}'s brother moved to Leesburg`, [v.fav(-1), v.resp(2), v.op(16, 'Got my brother moved')], { p: 0.6, wk: [20, 40], hint: 'the brother comes to work for you when he is out', son: true, yes: (x) => `${x.w}'s brother walked out of Leesburg and came to the club to say thank you`, no: (x) => `${x.w}'s brother came out and went home to his mother, which is right` }, v.s.favors < 1 ? 'No favors to spend' : undefined),
      A('word', 'grant', '"I\'ll send word to Newark that he\'s nobody\'s problem."', 'A message through Philadelphia.', `got word to Newark about ${v.f}'s brother`, [v.resp(1), v.op(12, 'Kept my brother safe'), { type: 'rivalOpinion', rival: 'philly', amount: -2, reason: 'Asked a favor on a nobody', label: `The office: ${v.w}` } as Effect]),
      A('lawyer', 'send', '"My lawyer will look at his parole."', `${v.$(200)}.`, `had the lawyer look at ${v.f}'s brother's parole`, [v.pay(200), v.op(6, 'Got a lawyer on it')]),
      no(v, '"He knew the risk."', `told ${v.f} his brother knew the risk`, 'downtown', 0.15),
    ],
  },
  {
    id: 'm_fireman_house', role: 'Retired fireman', gender: 'M', age: [55, 75], bg: ['Irish', 'German'], size: 'small', needs: ['rival'], rivals: ['feldstein'], title: 'A cracked foundation', offer: 'vote',
    problem: (v) => `${v.w} retired from the fire department and put his whole savings into a new cape cod in the Crest, built by a ${v.rn} company. The foundation cracked in the first winter and the builder's lawyer says "settling." "I carried people out of fires for thirty years. I'd like a house that stands up."`,
    answers: (v) => [
      A('builder', 'grant', `"The builder will fix it. ${v.rboss} will want to keep his name clean."`, `A message to ${v.rn}. They fix it, or they explain.`, `got ${v.rn}'s builder to fix ${v.f}'s house`, [v.resp(2), ...v.riv(-4, 'Called out our builder'), v.op(14, 'Got my house fixed')], favorBack('brought the firemen\'s association to vote your way', (x) => [x.inf('crest', 2), x.fav(1)], 0.5)),
      A('fix', 'grant', '"I\'ll send my own concrete man. You pay for the cement."', `${v.$(150)}. A real foundation.`, `fixed ${v.f}'s foundation`, [v.pay(150), v.op(12, 'Fixed my house')]),
      no(v, '"Sue them."', `told ${v.f} to sue`, 'crest', 0.1),
    ],
  },
  {
    id: 'm_bookie', role: 'Independent bookmaker', gender: 'M', age: [30, 60], bg: ['Jewish', 'Irish', 'Italian'], size: 'small', title: 'A small book asks permission', offer: 'payment',
    problem: (v) => `${v.w} takes a few horse bets out of a cigar store in the Crest: old men, two dollars a race. He came to ask, properly, before somebody tells him he should have. "I don't want trouble. I want to know what it costs to be left alone."`,
    answers: (v) => [
      A('ok', 'price', '"Ten percent of the handle, every Monday. And you lay off big bets with my book."', 'A small, steady envelope.', `let ${v.f} keep his book for ten percent`, [v.gain(120), v.inf('crest', 1), v.op(8, 'Let me work')]),
      A('free', 'grant', '"Two-dollar bets? Keep them. Just send the big ones to me."', 'A friend in the Crest.', `let ${v.f} keep his small book`, [v.resp(1), v.op(14, 'Let me work for nothing'), v.owe('Let him keep his book')], favorBack('sent you a big Philadelphia bettor who loses every week', (x) => [x.gain(500)])),
      no(v, '"There\'s one book on this island."', `shut down ${v.f}'s book`, 'crest', 0.4, 0),
    ],
  },
  {
    id: 'm_lifeguard_son', role: 'Father', gender: 'M', age: [40, 60], bg: ['Irish', 'Italian', 'German'], size: 'small', season: 'summer', low: true, title: 'A boy who saved a life', offer: 'respect',
    problem: (v) => `${v.w}'s son, a beach patrol rookie, pulled a drowning girl out at Rio Grande Avenue last week, and the girl's father, a big man from Philadelphia, has been telling everybody the boy "manhandled" her and is threatening to have him fired. "My boy saved his daughter. Now he wants his badge."`,
    answers: (v) => [
      A('father', 'grant', '"The man from Philadelphia will say thank you, in the newspaper."', 'A word at his hotel. He finds his manners.', `made the Philadelphia man thank ${v.f}'s son`, [v.resp(2), v.op(14, 'Stood up for my boy')]),
      A('patrol', 'grant', '"The beach patrol captain knows your boy is a hero. I\'ll tell him."', 'The boy keeps his badge and gets a medal.', `put in a word for ${v.f}'s son at the beach patrol`, [v.resp(1), v.op(10, 'Spoke for my boy'), v.inf('boardwalk', 1)]),
      no(v, '"The beach patrol takes care of its own."', `left ${v.f}'s son to the beach patrol`, 'boardwalk', 0.05, 0),
    ],
  },
  {
    id: 'm_shoemaker', role: 'Shoemaker', gender: 'M', age: [50, 78], bg: ['Italian', 'Polish', 'Jewish'], size: 'small', low: true, title: 'A shoemaker and the broken window', offer: 'respect',
    problem: (v) => `${v.w} fixes shoes on Maple Avenue. Some boys from the summer crowd broke his window three Saturdays in a row and wrote things on his door. The police say "kids." "I came here in 1921. Nobody wrote anything on my door in 1921."`,
    answers: (v) => [
      A('boys', 'grant', '"The boys will paint your door. And pay for the window."', 'Your men find the boys and their fathers. Nothing rough.', `made the boys pay for ${v.f}'s window`, [v.resp(2), v.op(14, 'Made them pay')]),
      A('window', 'grant', '"Here\'s for the glass. And a man walks by Saturday nights."', `${v.$(60)}.`, `paid for ${v.f}'s window and watched his shop`, [v.pay(60), v.op(10, 'Fixed my window')]),
      no(v, '"Kids are kids."', `told ${v.f} kids are kids`, 'downtown', 0.05),
    ],
  },
  {
    id: 'm_boat_rental', role: 'Boat rental man', gender: 'M', age: [35, 65], bg: ['Portuguese', 'Irish', 'German'], size: 'small', season: 'summer', low: true, needs: ['rival'], title: 'Boats on the bay', offer: 'loyalty',
    problem: (v) => `${v.w} rents rowboats and outboards on the bay side. ${v.rn} wants to use his dock at night, "a few hours, a few boats, no questions," and says the dock would be safer if he said yes. "If the Coast Guard finds anything, it's my license."`,
    answers: (v) => [
      A('no', 'grant', `"${v.rn} uses somebody else's dock. I'll tell them."`, `A message. ${v.rn} finds another dock.`, `kept ${v.rn} off ${v.f}'s dock`, [v.resp(2), v.inf('docks', 1), ...v.riv(-6, 'Kept us off a dock'), v.op(14, 'Kept them off my dock')]),
      A('mine', 'price', '"The dock is mine at night. Not theirs. You get a piece, and my lawyer if anything happens."', 'Your boats, his dock.', `took ${v.f}'s dock for his own night work`, [v.gain(150), v.heat(1), v.inf('docks', 2), ...v.riv(-8, 'Took the dock we wanted'), v.op(4, 'At least he pays')]),
      no(v, '"Say yes. It\'s healthier."', `told ${v.f} to say yes to ${v.rn}`, 'docks', 0.3),
    ],
  },
  {
    id: 'm_grandson_army', role: 'Grandfather', gender: 'M', age: [65, 85], bg: ['Italian', 'Irish', 'Polish'], size: 'small', low: true, title: 'A grandson and the Army', offer: 'respect',
    problem: (v) => `${v.w} raised his grandson, eighteen, who enlisted last month and now has been told his eyesight is bad and he's out. The boy sits in the house all day. "I was in the Argonne. I want him to have something to stand up in. A uniform, a job, something."`,
    answers: (v) => [
      A('coastguard', 'grant', '"The Coast Guard station needs boys. I know the chief petty officer."', 'A word. The boy gets a chance.', `got ${v.f}'s grandson into the Coast Guard`, [v.resp(1), v.op(14, 'Got my boy a uniform')]),
      A('work', 'grant', '"He can work for one of my places. Honest work."', 'A job in a legitimate place of yours.', `gave ${v.f}'s grandson a job`, [v.op(10, 'Gave my boy work')], { p: 0.3, wk: [8, 20], hint: 'the boy wants more', son: true, yes: (x) => `${x.w}'s grandson asked to work for your people, not just your business; he was taken on` }),
      no(v, '"Glasses. Tell him to get glasses."', `told ${v.f} to buy the boy glasses`, 'downtown', 0.05, 0),
    ],
  },
  {
    id: 'm_rabbi_vandals', role: 'Shul president', gender: 'M', age: [45, 75], bg: ['Jewish'], size: 'small', title: 'A synagogue window', offer: 'vote',
    problem: (v) => `${v.w}, president of the little synagogue on Pacific Avenue. Somebody threw stones through the windows on a Friday night and painted a swastika on the door. "Fifteen years after the war, ${v.addr}. On this island. The police wrote it down and drove away."`,
    answers: (v) => [
      A('find', 'grant', '"I\'ll find out who. They\'ll pay for the windows, and they\'ll apologize, in person."', 'Your men ask around. The answers come quickly.', `found out who defaced the synagogue`, [v.resp(3), v.op(16, 'Found out who did it')], favorBack('brought the congregation and their cousins to vote your way', (x) => [x.inf('pacific', 2), x.fav(1)], 0.6)),
      A('pay', 'grant', '"New windows. Better glass. Send me the bill."', `${v.$(250)}.`, `paid for the synagogue's windows`, [v.pay(250), v.resp(2), v.op(12, 'Paid for our windows')]),
      A('watch', 'grant', '"A man outside every Friday night until the High Holy Days."', 'Your men by the door.', `put men outside the synagogue`, [v.resp(2), v.op(12, 'Watched over us')]),
      no(v, '"The police will handle it."', `left the synagogue to the police`, 'pacific', 0.05),
    ],
  },
];

/** The deep bed: the women and the men. */
export const PETITION_TEMPLATES: PTpl[] = [...WOMEN, ...MEN];

/** The bride's name, steady for the petitioner (godfather.ts reads it as the wedding's). */
function brideOf(v: PV): string {
  const names = ['Rosemarie', 'Theresa', 'Angela', 'Carol', 'Joan', 'Margaret', 'Dolores', 'Frances'];
  let h = 0;
  for (const ch of v.who.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return names[h % names.length];
}
