import { displayName } from './characters';
import { $, age, pickWith, registerFamily, relabel, scaleMoney, type SceneCtx } from './sceneVariants';
import type { Character, Choice, Effect, GameState, RivalId } from './types';
import './sceneFamilies2';

/**
 * Scene families, part 1: Philadelphia's bagman, a sponsor's kid who wants to
 * make his bones, and the four rivals' propositions. Part 2
 * (sceneFamilies2.ts): a rival courting one of your men, favors, a capo's
 * light envelope, Sunday dinner, a man drifting, the crew's scores,
 * funerals, the opening and every other crew decision's setting.
 */

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

export function rivalLeader(s: GameState, id: RivalId): Character | undefined {
  const r = s.rivals.find((x) => x.id === id);
  return r ? s.characters[r.leaderId] : undefined;
}

/** One of a rival's own people other than the leader (his lieutenant, his driver, his nephew). */
export function rivalMan(c: SceneCtx, id: RivalId): Character | undefined {
  const r = c.s.rivals.find((x) => x.id === id);
  if (!r) return undefined;
  const men = Object.values(c.s.characters).filter((x) => x.alive && x.faction === id && x.id !== r.leaderId && x.gender !== 'F' && (x.imprisonedUntil ?? 0) <= c.s.week);
  if (!men.length) return undefined;
  men.sort((a, b) => (a.id < b.id ? -1 : 1));
  return pickWith(c.h, men.slice(0, 6));
}

const nm = (c?: Character) => (c ? displayName(c) : 'a man nobody knows');
const fn = (c?: Character) => c?.firstName ?? 'he';

/** A clause about the state of things, if there is one worth saying (a war, a funeral, the heat). */
export function mood(c: SceneCtx): string {
  if (c.dead && c.dead.weeks <= 4) return ` Nobody has said ${c.dead.first}'s name out loud yet, but everybody is thinking it.`;
  if (c.war) return ` With the ${c.war} business going on, every car that slows down gets looked at twice.`;
  if (c.heat === 'hot') return ' The state police have a car parked on the Causeway around the clock now, and everybody is talking softer.';
  return '';
}

/* ------------------------------------------------------------------ */
/* The bagman                                                          */
/* ------------------------------------------------------------------ */

function bag(c: SceneCtx) {
  const env = Number(c.ev.meta?.envelope ?? 0);
  const p = c.s.rivals.find((r) => r.id === 'philly');
  const sal = p ? c.s.characters[p.leaderId] : undefined;
  return { env, sal: sal?.firstName ?? 'Sal', salFull: sal ? displayName(sal) : 'Sal Moretti' };
}

const BAGMEN = ['Augie Pellegrino', 'Benny Tamburri', 'old Dominic Lapenta', 'a soft-spoken man called Richie the Pencil'];

registerFamily({
  id: 'bagman',
  match: (ev) => ev.defId === 'bagman',
  scenes: [
    {
      title: () => 'The bagman from Philadelphia',
      text: (c) => { const b = bag(c); return `${b.sal} Moretti's bagman is waiting in a Buick outside the Ivanhoe, motor running, ${c.weather}. He does not get out. Philadelphia's end comes to ${$(b.env)}.${mood(c)}`; },
    },
    {
      when: (c) => c.summer,
      title: () => 'A Buick on Pacific Avenue',
      text: (c) => { const b = bag(c); return `The bagman parks in the shade by the Starlight and eats a hot dog with the window down while the boardwalk crowd goes by. He says ${b.sal} sends his best, and that the Shore must be having quite a season: ${$(b.env)} quite a season.`; },
    },
    {
      title: () => "Second pew at St. Ann's",
      text: (c) => { const b = bag(c); return `Sunday, the ten o'clock Mass. ${b.sal} Moretti's man slides into the pew behind you and hums along with the hymn. During the sign of peace he shakes your hand and keeps his palm open. ${$(b.env)} would make it a good week for the collection plate.`; },
      choices: (_c, ch) => relabel(ch, { full: { label: 'Fold the whole envelope into his palm' }, short: { label: 'A thinner envelope, and a blessing' }, over: { label: 'A fat envelope, and one for the poor box' } }),
    },
    {
      when: (c) => c.season === 'winter' || c.season === 'fall',
      title: () => 'Coffee at the Admiral diner',
      text: (c) => { const b = bag(c); return `The island is shut for the season and the bagman hates the drive. He sits at the counter in his overcoat, stirring a coffee he never drinks. "${b.sal} says the off-season is no excuse." The number he writes on a napkin is ${$(b.env)}.`; },
    },
    {
      when: (c) => c.summer,
      title: () => 'The man with the racing form',
      text: (c) => { const b = bag(c); return `A different bagman this month: a nephew of somebody, with a racing form under his arm and a Philadelphia accent you could cut. He calls ${b.sal} "Uncle Sal," asks twice where the good clams are, and says the envelope should come to ${$(b.env)}, "give or take, but Uncle Sal don't like take."`; },
    },
    {
      title: () => 'A funeral home on New Jersey Avenue',
      text: (c) => { const b = bag(c); return `The bagman likes funeral homes: nobody looks twice at a man in a dark suit. He signs the book for a stranger${c.dead ? ` (it is not ${c.dead.first}'s wake, though he asks after the family)` : ''}, then finds you by the coat rack. ${b.sal} wants to know how business is: ${$(b.env)} worth of how business is.`; },
    },
    {
      when: (c) => !c.summer,
      title: () => 'The ferry lot at Cape May',
      text: (c) => { const b = bag(c); return `This month it is the ferry lot in Cape May, ${c.weather}, the wind off the bay hard enough to rock the car. ${b.sal}'s bagman keeps the heater on and the radio louder than it needs to be. ${$(b.env)}, he says, and turns it up a little more.`; },
    },
    {
      title: () => "Otten's Harbor, after dark",
      text: (c) => { const b = bag(c); return `The bagman waits on the dock at Otten's Harbor among the charter boats, smoking. "${b.sal} likes the sea air," he says, "but he likes his envelope better." He means ${$(b.env)}.${mood(c)}`; },
    },
    {
      title: () => "Nardi's barbershop",
      text: (c) => { const b = bag(c); const who = pickWith(c.h, BAGMEN); return `Saturday morning at Nardi's on Rio Grande Avenue. ${who.charAt(0).toUpperCase()}${who.slice(1)} takes the chair next to yours, and the barber suddenly remembers he is out of cigarettes. Under the striped cloth, the talk is about ${b.sal}'s grandson's First Communion and a figure: ${$(b.env)}.`; },
      choices: (_c, ch) => relabel(ch, { short: { detail: 'Blame the season. The barber will be back any minute.' } }),
    },
    {
      when: (c) => c.month >= 4 && c.month <= 10,
      title: () => 'Between the fourth and fifth',
      text: (c) => { const b = bag(c); return `The clubhouse at Atlantic City Race Course. Philadelphia's man has a box, a pair of binoculars he never lifts, and a two-dollar ticket on a horse called Pay Day, which he thinks is very funny. ${b.sal}'s end is ${$(b.env)}. "Win, place or show," he says, "Sal gets paid."`; },
    },
    {
      when: (c) => !!c.war,
      title: () => 'He will not leave the car',
      text: (c) => { const b = bag(c); return `With the ${c.war} trouble on, the bagman will not set foot on the island. A kid in a Philadelphia Eagles jacket knocks on the Shamrock's back door and points at a Lincoln idling at the corner of Pine and Pacific. Inside, the bagman is chewing an antacid. "${b.sal} hopes your war is going good. ${b.sal} would like ${$(b.env)}."`; },
    },
    {
      when: (c) => c.heat !== 'quiet',
      title: () => 'Exit 13, the Howard Johnson\'s',
      text: (c) => { const b = bag(c); return `With the state police on the Causeway, Philadelphia's man will not come over the bridge. You meet him off the Parkway at a Howard Johnson's, two men in a booth under the orange roof, clam strips going cold. He wants ${$(b.env)} and the name of whoever is talking to the troopers. You give him the first.`; },
    },
    {
      when: (c) => c.month === 12,
      title: () => 'A fruitcake tin',
      text: (c) => { const b = bag(c); return `Christmas week. The bagman brings a fruitcake from ${b.sal}'s wife, wrapped in green cellophane, and waits while you empty the tin. "She says Merry Christmas. Sal says ${$(b.env)}." He takes the tin back with the envelope in it, and the fruitcake stays.`; },
    },
    {
      when: (c) => c.s.heat.family >= 45,
      title: () => 'Sal comes himself',
      text: (c) => { const b = bag(c); return `${b.salFull} does not send the bagman this month. He comes himself, which he has not done in years, and sits in your office without taking off his hat. He talks about his tomatoes, his bad knee, the old man's patience. Then he says the number: ${$(b.env)}. "And Philadelphia hopes it's all there this time."`; },
      choices: (_c, ch) => relabel(ch, { short: { detail: 'To his face. He will remember it.' }, over: { detail: 'Hand it to Sal himself. It goes straight upstairs.' } }),
    },
    {
      when: (c) => c.month === 3 || c.month === 4,
      title: () => 'Sunrise on the beach',
      text: (c) => { const b = bag(c); return `Easter, the sunrise service on the beach at Schellenger Avenue, the whole parish in their good coats with the sand blowing. The bagman stands at the back with his hat over his heart. Afterward, walking up the ramp, he mentions that Philadelphia is also risen: to ${$(b.env)} this month.`; },
    },
    {
      when: (c) => c.season === 'fall',
      title: () => 'Closing up the stands',
      text: (c) => { const b = bag(c); const who = pickWith(c.h, BAGMEN); return `The week the boardwalk closes. ${who.charAt(0).toUpperCase()}${who.slice(1)} watches the men nail plywood over the custard stand and says it always makes him sad, the end of a season. Not so sad he forgets the envelope: ${$(b.env)}, counted twice on the hood of his car.`; },
    },
  ],
});

/* ------------------------------------------------------------------ */
/* Bones                                                               */
/* ------------------------------------------------------------------ */

function bonesCast(c: SceneCtx) {
  const pros = c.who!;
  const spId = c.ev.actors && c.ev.actors.length > 1 ? c.ev.actors[0] : c.s.playerId;
  const sp = c.s.characters[spId];
  const self = sp.id === c.s.playerId;
  return { p: pros, pn: displayName(pros), pf: pros.firstName, sp, sn: self ? 'you' : displayName(sp), sf: self ? 'you' : sp.firstName, self, a: age(c.s, pros) };
}

const trait = (ch: Character, t: string) => ch.traits.includes(t as never);

registerFamily({
  id: 'bones',
  match: (ev) => ev.defId === 'bones_offer',
  scenes: [
    {
      title: (c) => `${c.who!.firstName} wants to make his bones`,
      text: (c) => { const k = bonesCast(c); return `${k.self ? 'You have' : `${k.sn} has`} been watching ${k.pn} for a year. "He's ready. Before his name goes anywhere he has to do something for this thing of ours." Nobody gets proposed to Philadelphia without his bones, and what ${k.pf} does on the job will follow him.`; },
    },
    {
      when: (c) => !bonesCast(c).self,
      title: (c) => `${bonesCast(c).sf} speaks for ${c.who!.firstName}`,
      text: (c) => { const k = bonesCast(c); return `Under the boardwalk at Wildwood Avenue, out of the wind, ${k.sn} lights two cigarettes and hands you one. "The kid, ${k.pf}. ${k.a} years old and he's never once been late, never once had his hand out." He looks at the pilings. "Give him something real. Let Philadelphia hear his name the right way."`; },
    },
    {
      title: (c) => `${c.who!.firstName}'s mother lit a candle`,
      text: (c) => { const k = bonesCast(c); return `After the seven o'clock Mass at St. Ann's, ${k.pn}'s mother stops you on the steps to thank you for "looking after my boy." She has no idea what she is thanking you for. ${k.pf} stands behind her with his hat in his hands, waiting to be given the chance to make his bones.`; },
    },
    {
      when: (c) => trait(c.who!, 'Hot-headed') || trait(c.who!, 'Ambitious'),
      title: (c) => `${c.who!.firstName} is in a hurry`,
      text: (c) => { const k = bonesCast(c); return `${k.pn} has been asking anybody who will listen when it is his turn: the bartender at the Shamrock, the guys on the corner, ${k.self ? 'your driver' : k.sn}. A kid in a hurry makes mistakes. A kid kept waiting too long makes worse ones. Philadelphia will want to know what he did to earn his name.`; },
    },
    {
      when: (c) => trait(c.who!, 'Cowardly') || trait(c.who!, 'Patient') || trait(c.who!, 'Honest'),
      title: (c) => `Is ${c.who!.firstName} ready?`,
      text: (c) => { const k = bonesCast(c); return `${k.self ? 'Your own man' : `${k.sn}'s man`}, ${k.pn}, is careful, maybe too careful. "Some guys you got to push off the dock," ${k.self ? 'your consigliere' : k.sf} says over coffee at the Admiral. "He'll never ask. That's why I'm asking." The question is what kind of job a careful man should make his bones on.`; },
    },
    {
      when: (c) => !!c.war,
      title: (c) => `${c.who!.firstName} wants in on the war`,
      text: (c) => { const k = bonesCast(c); return `The ${c.war} business has every young guy on the island wanting to prove something. ${k.pn} is no different: he has been sleeping at the Shamrock with his shoes on. ${k.self ? 'Everyone' : k.sn} says the same thing: let him make his bones now, while it means something, or he will go find a way on his own.`; },
    },
    {
      when: (c) => !!c.dead,
      title: (c) => `${c.who!.firstName} at the cemetery`,
      text: (c) => { const k = bonesCast(c); return `At Cold Spring cemetery, when the others have gone back to the cars, ${k.pn} is still standing at ${c.dead!.first}'s grave. ${k.self ? 'You watch him' : `${k.sn} watches him with you`}. "He thinks he owes it to ${c.dead!.first}," ${k.self ? 'your driver says' : `${k.sf} says`}. "Let him make his bones and owe it to us."`; },
    },
    {
      when: (c) => c.summer,
      title: (c) => `${c.who!.firstName} on the boardwalk`,
      text: (c) => { const k = bonesCast(c); return `A summer night, the boardwalk packed from the Convention Hall to the Hunt's Pier, the tram car calling "Watch the tram car, please." ${k.pn} walks you the length of it without saying a word, which is his way of asking. ${k.self ? 'You know' : `${k.sn} told you`} what he wants: a job that makes his bones.`; },
    },
    {
      when: (c) => !c.summer,
      title: (c) => `${c.who!.firstName} in the off-season`,
      text: (c) => { const k = bonesCast(c); return `${c.weather[0].toUpperCase()}${c.weather.slice(1)}. In the off-season the young guys have too much time, and ${k.pn} has spent all of it at the Shamrock waiting to be asked. ${k.self ? 'You' : k.sn} could give him a job that tells Philadelphia who he is. Or let him wait for spring.`; },
    },
    {
      when: (c) => age(c.s, c.who!) <= 24,
      title: (c) => `${c.who!.firstName} is only ${age(c.s, c.who!)}`,
      text: (c) => { const k = bonesCast(c); return `${k.pn} is ${k.a}. His father ran numbers for the old man in the forties and never got his button. ${k.self ? 'You' : k.sn} think${k.self ? '' : 's'} the son can do what the father could not, if he gets the right job to make his bones on. Young is not the same as ready. Sometimes it is close enough.`; },
    },
    {
      when: (c) => age(c.s, c.who!) >= 32,
      title: (c) => `${c.who!.firstName} has waited long enough`,
      text: (c) => { const k = bonesCast(c); return `${k.pn} is ${k.a}, old for a man still waiting on his bones, with a wife and a mortgage in Rio Grande. "He's earned for us for ten years," ${k.self ? 'your consigliere says' : `${k.sf} says`} in the car outside the Hotel Dorset. "Give the man his chance before he's too old to want it."`; },
    },
    {
      when: (c) => c.year < 1976,
      title: (c) => `${c.who!.firstName} and the closed books`,
      text: (c) => { const k = bonesCast(c); return `The books in Philadelphia have been closed, more or less, since the raid upstate in 1957 scared every old man in the country. ${k.self ? 'You know' : `${k.sn} knows`} it, and so does ${k.pn}. "When they open, he has to be ready," ${k.self ? 'your consigliere says' : `${k.sf} says`}. "Ready means he did something. Let him do it now."`; },
    },
    {
      title: (c) => `A job for ${c.who!.firstName}`,
      text: (c) => { const k = bonesCast(c); return `Your kitchen table on Glenwood Avenue, late, the house asleep. ${k.self ? 'You lay it out for yourself on a legal pad' : `${k.sn} lays it out on a legal pad`}: three jobs, and the name ${k.pf} at the top. Whatever he does, the story will go up to Philadelphia with him, and stay with him the rest of his life.`; },
    },
  ],
});

/* ------------------------------------------------------------------ */
/* The rivals' propositions                                            */
/* ------------------------------------------------------------------ */

/** Was the last answer to this rival a yes? */
function lastAnswer(c: SceneCtx): string | undefined {
  return c.s.director?.answers?.[c.ev.defId]?.[1];
}

/** "The last time, you said no" — the man's history with you. */
function history(c: SceneCtx, who: string): string {
  const a = lastAnswer(c);
  if (a === 'accept') return ` ${who} remembers the last arrangement fondly.`;
  if (a === 'refuse') return ` The last time ${who} asked, you said no. ${who} says he does not hold grudges, in the way of men who do.`;
  if (a === 'loan') return ` ${who} still has your marker in his desk, and mentions it.`;
  return c.times === 0 ? '' : ` It is not the first time ${who} has made you an offer.`;
}

const mult = (k: number) => (c: SceneCtx, ch: Choice[]) => scaleMoney(ch, 'accept', k * (c.summer ? 1.05 : 1));

/* -------- Manno: Atlantic City wants the Causeway -------- */

const manno = (c: SceneCtx) => ({ L: rivalLeader(c.s, 'manno'), m: rivalMan(c, 'manno') });
registerFamily({
  id: 'deal_manno',
  match: (ev) => ev.defId === 'deal_manno',
  scenes: [
    {
      title: () => 'A proposition from Atlantic City',
      text: (c) => { const k = manno(c); return `${nm(k.L)} wants to split the Causeway: his trucks pass unmolested and he pays for the courtesy.${history(c, fn(k.L))}`; },
    },
    {
      title: () => 'Lunch at the 500 Club',
      text: (c) => { const k = manno(c); return `Lunch at the 500 Club in Atlantic City, the room empty at this hour except for a busboy and ${nm(k.L)}, who orders for both of you. The veal is very good. The proposition is simple: Atlantic City's trucks come over the Causeway at night, nobody looks in the back, and an envelope comes the other way every month.${history(c, fn(k.L))}`; },
      choices: mult(1.1),
    },
    {
      title: () => 'Headlights on the Causeway',
      text: (c) => { const k = manno(c); return `Two in the morning, headlights flashed twice from the far end of the Rio Grande bridge. ${nm(k.m)} walks over alone, hands where you can see them. "${fn(k.L)} says the road is long and the tolls are high. He'd rather pay you than pay for trouble." Manno's trucks, your Causeway, a monthly courtesy.`; },
    },
    {
      when: (c) => c.summer,
      title: () => 'Steel Pier, the diving horse',
      text: (c) => { const k = manno(c); return `${nm(k.L)} invites you to the Steel Pier to watch the diving horse, which he says is the most honest act in Atlantic City: the horse jumps, everybody gets wet. He wants his trucks across your Causeway this summer, and he will pay to be honest about it.${history(c, fn(k.L))}`; },
      choices: mult(1.2),
    },
    {
      when: (c) => !c.summer,
      title: () => 'A cold room on Arctic Avenue',
      text: (c) => { const k = manno(c); return `A back room on Arctic Avenue, ${c.weather} outside, a space heater ticking. ${nm(k.L)} wears his coat indoors and gets right to it: the off-season is long, his trucks need a short road to Cape May, and your Causeway is the short road. He has the first envelope in his pocket.`; },
      choices: mult(0.85),
    },
    {
      when: (c) => !!c.war && c.war !== 'Manno',
      title: () => 'Manno smells an opening',
      text: (c) => { const k = manno(c); return `With you tied up with the ${c.war} trouble, ${nm(k.m)} turns up at the Shamrock with an offer from ${fn(k.L)}: let Atlantic City's trucks use the Causeway and he will "stay out of it," whatever it is. The money is good. The timing is not an accident.`; },
      choices: mult(1.25),
    },
    {
      title: () => 'A wedding in Ventnor',
      text: (c) => { const k = manno(c); return `You are a guest at a Manno niece's wedding in Ventnor, which is itself a message. Between the tarantella and the cake, ${nm(k.L)} walks you out to the terrace. His trucks, your Causeway, his money: "Family business," he says, "between families."${history(c, fn(k.L))}`; },
    },
    {
      title: () => 'The man from the trucking company',
      text: (c) => { const k = manno(c); return `A man in a good suit who says he is from "Seashore Freight, of Atlantic City" asks for ten minutes at your office. ${nm(k.L)}'s name never comes up, which is how you know it is ${fn(k.L)}'s money: trucks over the Causeway at night, a monthly fee, no questions in either direction.`; },
      choices: mult(0.95),
    },
    {
      when: (c) => c.heat !== 'quiet',
      title: () => 'Manno wants a quiet road',
      text: (c) => { const k = manno(c); return `The heat is on the Pike and the Parkway, so ${nm(k.L)}'s trucks want a quieter road, and the quietest one runs through you. ${nm(k.m)} says the troopers never stop a truck on the Causeway. "That's why we pay you." It is also why the troopers might start.`; },
    },
    {
      when: (c) => c.year >= 1977,
      title: () => 'Casino trucks',
      text: (c) => { const k = manno(c); return `With the casinos coming, everything in Atlantic City is being built at once, and ${nm(k.L)} has the concrete, the linen and the vending. His trucks need the Causeway to reach the Cape May yards. "This is the gold rush," he says. "Charge me a toll and get rich with me."`; },
      choices: mult(1.3),
    },
    {
      title: () => 'An envelope on the dashboard',
      text: (c) => { const k = manno(c); return `You come out of the Ivanhoe to find an envelope on your dashboard and the door still locked. Inside: cash, and a card in ${fn(k.L)}'s handwriting. "For the use of the road. More where this came from." ${nm(k.L)} wants his trucks on the Causeway, and he wants you to know he can open your car.`; },
      choices: (_c, ch) => relabel(ch, { accept: { label: 'Keep the envelope, open the road' }, refuse: { label: 'Send the envelope back, with the card' } }),
    },
  ],
});

/* -------- Feldstein: New York money wants in -------- */

const feld = (c: SceneCtx) => ({ L: rivalLeader(c.s, 'feldstein'), m: rivalMan(c, 'feldstein') });
const FELD_WANTS = ['a silent share of the Boardwalk', 'a piece of the arcades on the Boardwalk', 'a quiet stake in the Boardwalk amusement piers', 'a share of the Boardwalk motels', 'a slice of the Boardwalk concessions'];
registerFamily({
  id: 'deal_feldstein',
  match: (ev) => ev.defId === 'deal_feldstein',
  scenes: [
    {
      title: () => 'New York money',
      text: (c) => { const k = feld(c); return `${nm(k.L)} wants a piece of the Boardwalk. He is offering cash now for a silent share.${history(c, fn(k.L))}`; },
    },
    {
      title: () => 'Lunch at the Shelburne',
      text: (c) => { const k = feld(c); return `${nm(k.L)} takes the whole terrace at the Shelburne for lunch and keeps you waiting fifteen minutes so you will notice. He wants ${pickWith(c.h, FELD_WANTS)}. "Not to run. To own. I'm a very quiet owner." Cash on the table now.${history(c, fn(k.L))}`; },
      choices: mult(1.1),
    },
    {
      title: () => 'A lawyer from Manhattan',
      text: (c) => { const k = feld(c); return `A lawyer from a Park Avenue firm drives down in a Lincoln to explain, very slowly, that a client "who prefers to remain anonymous" would purchase ${pickWith(c.h, FELD_WANTS)}. Everyone in the room knows the client is ${nm(k.L)}. The check is certified. There is a second option in his briefcase: a loan, on very civilized terms.`; },
      choices: (_c, ch) => relabel(ch, { accept: { label: 'Sign the lawyer\'s papers' }, loan: { label: 'Take the civilized loan instead' } }),
    },
    {
      when: (c) => c.month >= 5 && c.month <= 9,
      title: () => 'Feldstein buys a round',
      text: (c) => { const k = feld(c); return `Saturday night at the Riptide, the band playing "Shout," the room full of sunburned kids from Philadelphia. ${nm(k.m)} buys the whole bar a round "on Mr. ${k.L?.lastName ?? 'Feldstein'}." Then he sits down across from you with ${fn(k.L)}'s offer: cash now for ${pickWith(c.h, FELD_WANTS)}.`; },
      choices: mult(1.15),
    },
    {
      when: (c) => !c.summer,
      title: () => 'Feldstein in the off-season',
      text: (c) => { const k = feld(c); return `In the off-season everybody on the island is short, and ${nm(k.L)} knows it. He calls from New York, ${c.weather} on your end of the line, and offers the same thing he always offers, ${pickWith(c.h, FELD_WANTS)}, at a winter price. "Money now is worth more than money in July."`; },
      choices: mult(0.85),
    },
    {
      title: () => 'Pinochle on Thursdays',
      text: (c) => { const k = feld(c); return `${nm(k.L)} plays pinochle on Thursdays at a card club on Pacific Avenue and lets you sit in. He loses on purpose, gracefully. Between hands he mentions that New York has more money than places to put it, and the Boardwalk is a place. A silent share, cash on the table.${history(c, fn(k.L))}`; },
    },
    {
      when: (c) => c.s.money < 15000,
      title: () => 'He has heard you are short',
      text: (c) => { const k = feld(c); return `${nm(k.L)} has heard that money is tight on your end of the island; he hears everything. He does not gloat. He offers to buy ${pickWith(c.h, FELD_WANTS)} for cash, or to lend you $6,000 on terms "a friend would offer." Both offers come with a friend.`; },
    },
    {
      when: (c) => !!c.dead,
      title: () => 'Flowers from New York',
      text: (c) => { const k = feld(c); return `A wreath arrives for ${c.dead!.first}'s funeral, the biggest one there, with a card from ${nm(k.L)}. A week later, so does ${fn(k.L)}'s man, with condolences and an offer: cash for a silent share of the Boardwalk, "to help a family in a difficult time."`; },
    },
    {
      when: (c) => c.year >= 1965,
      title: () => 'Pension fund money',
      text: (c) => { const k = feld(c); return `${nm(k.L)} has a friend at a union pension fund in the Midwest with more money than the union has members. He wants to put some of it into the Boardwalk through you: a silent share, cash now, or a loan on terms "the union would never tolerate for its own members." Everyone in the room laughs except the accountant.`; },
    },
    {
      when: (c) => c.year >= 1977,
      title: () => 'After the referendum',
      text: (c) => { const k = feld(c); return `Since the casino vote, ${nm(k.L)} has been buying everything on the Atlantic City Boardwalk that does not move, and now he wants a piece of yours, as a hedge. "Wildwood will be what Atlantic City used to be. Somebody should own that." Cash now for a silent share.`; },
      choices: mult(1.3),
    },
    {
      title: () => 'The accountant',
      text: (c) => { const k = feld(c); return `${nm(k.L)} sends his accountant, a pale man named Mandel who has never been to the beach. Mandel has your Boardwalk receipts in a folder (do not ask how) and a number: what a silent share is worth, plus ten percent "for goodwill." Or a loan, if you would rather keep everything and owe New York instead.`; },
      choices: mult(1.05),
    },
    {
      title: () => 'A walk on the Boardwalk',
      text: (c) => { const k = feld(c); return `${nm(k.L)} wants to walk the Boardwalk with you from Cresse Avenue to the Hunt's Pier, slowly, like a man shopping for a house. He stops in front of every arcade and every frozen custard stand and asks what it takes in. At the end he names his price for ${pickWith(c.h, FELD_WANTS)}.${history(c, fn(k.L))}`; },
    },
  ],
});

/* -------- Kessler: North Wildwood wants a truce -------- */

const kess = (c: SceneCtx) => ({ L: rivalLeader(c.s, 'kessler'), m: rivalMan(c, 'kessler') });
registerFamily({
  id: 'deal_kessler',
  match: (ev) => ev.defId === 'deal_kessler',
  scenes: [
    {
      title: () => 'Kessler wants a truce',
      text: (c) => { const k = kess(c); return `${nm(k.L)} offers joint protection for the clubs on the North End line. It costs you, but it buys peace.${history(c, fn(k.L))}`; },
    },
    {
      title: () => 'The Bolero, before the doors open',
      text: (c) => { const k = kess(c); return `The Bolero at five in the afternoon, chairs on the tables, a bartender cutting limes. ${nm(k.L)} pours two club sodas. "My clubs, your clubs. Every Saturday somebody's cousin gets a bottle broken over his head on the line between us. Let's put men on the line together. You chip in, I chip in, nobody's cousin bleeds."`; },
    },
    {
      when: (c) => c.summer,
      title: () => 'A summer truce',
      text: (c) => { const k = kess(c); return `The season is at its peak and the North End line is a powder keg: sailors, college boys, two sets of bouncers who hate each other. ${nm(k.m)} brings word from ${fn(k.L)}: joint protection, shared costs, peace until Labor Day at least. "The tourists don't care whose club it is. They care if it's safe."`; },
    },
    {
      when: (c) => !!c.war,
      title: () => 'Kessler wants no part of it',
      text: (c) => { const k = kess(c); return `With the ${c.war} business going on, ${nm(k.L)} wants it in writing, or the closest thing to writing, that North Wildwood stays out of it. He offers joint protection on the North End line in exchange for a contribution to the cost. Peace with one neighbor while you fight another.`; },
    },
    {
      title: () => 'Kessler at the firehouse',
      text: (c) => { const k = kess(c); return `The North Wildwood firehouse pancake breakfast. ${nm(k.L)} is flipping pancakes in an apron for the cameras of the Leader. He hands you a plate and says, low, that the North End line needs men from both sides. "You pay a little, I pay a little, and nobody ends up in the paper but me and my pancakes."${history(c, fn(k.L))}`; },
    },
    {
      when: (c) => lastAnswer(c) === 'refuse',
      title: () => 'Kessler asks again',
      text: (c) => { const k = kess(c); return `${nm(k.L)} asks again, which he does not like doing. The North End line has had two bad Saturdays since you turned him down. He says it plainly, at the counter of a luncheonette on New Jersey Avenue: joint protection, shared costs, or next season it gets worse for both of you.`; },
    },
    {
      title: () => 'A note under the door',
      text: (c) => { const k = kess(c); return `A note under the Shamrock's door in ${fn(k.L)}'s square handwriting: "Your boys and my boys again Saturday. A truce on the North End line. My bouncers and yours, my money and yours. Come see me, D.K." ${nm(k.m)} waits across the street to hear your answer.`; },
    },
    {
      when: (c) => !c.summer,
      title: () => 'An off-season handshake',
      text: (c) => { const k = kess(c); return `${c.weather[0].toUpperCase()}${c.weather.slice(1)}, and the North End clubs are mostly dark. ${nm(k.L)} wants to settle the line now, while it is quiet, before the summer crowds make it impossible: joint protection, your money and his, a handshake that lasts until somebody forgets it.`; },
    },
    {
      title: () => 'The Kessler wedding band',
      text: (c) => { const k = kess(c); return `${nm(k.L)}'s house band plays your niece's shower as a courtesy, and the bandleader passes you a message with the bill: a truce on the North End line, joint protection, costs shared. "Mr. Kessler says music sounds better when nobody's fighting."`; },
    },
  ],
});

/* -------- Philadelphia: Moretti needs something done -------- */

/** Moretti's asks: different people, different trouble. Every accept and refuse keeps the original chips. */
const PHILLY_ASKS: { title: string; ask: (c: SceneCtx, sal: string) => string; because: string; when?: (c: SceneCtx) => boolean }[] = [
  { title: 'Moretti needs a favor', ask: (_c, sal) => `${sal} needs a man from Philadelphia kept out of sight in one of your motels for a few weeks. No questions.`, because: "hid Moretti's man" },
  { title: 'Moretti needs a garage', ask: (_c, sal) => `${sal} wants a truck of Philadelphia cigarettes stored in a garage on the bay side until the tax men lose interest.`, because: "stored Moretti's cigarettes" },
  { title: "Moretti's nephew", ask: (_c, sal) => `${sal} wants his nephew given a summer job on your boardwalk, a real job, and nobody lays a finger on him.`, because: "gave Moretti's nephew a summer job", when: (c) => c.month >= 4 && c.month <= 8 },
  { title: 'A job in Camden', ask: (_c, sal) => `${sal} needs a councilman in Camden reminded, gently, by a face nobody in Camden knows.`, because: 'sent a man to Camden for Moretti' },
  { title: "Moretti's boat", ask: (_c, sal) => `${sal}'s cabin cruiser needs a slip at Otten's Harbor for the season, and a man who will not remember who comes and goes on it.`, because: "found Moretti's boat a quiet slip", when: (c) => c.month >= 4 && c.month <= 9 },
  { title: 'A wedding at the Hotel Dorset', ask: (_c, sal) => `${sal}'s goddaughter wants her reception at the Hotel Dorset on a Saturday in June that has been booked for a year. ${sal} would like it to become unbooked, nicely.`, because: "got Moretti's goddaughter her wedding date" },
  { title: 'A witness who needs the sea air', ask: (_c, sal) => `${sal} has a man in Philadelphia who saw something he should not have, and needs the sea air until a grand jury loses interest. A room, three meals, and nobody asks his name.`, because: "hid a Philadelphia witness for Moretti" },
  { title: 'Seats for the Miss America pageant', ask: (_c, sal) => `${sal} wants twelve good seats at Convention Hall for the Miss America pageant, for some people he is trying to impress, and a car to take them.`, because: 'got Moretti his pageant seats', when: (c) => c.month === 8 || c.month === 9 },
  { title: 'A load of hams', ask: (_c, sal) => `${sal} has two thousand Polish hams that fell off a boat in Port Richmond and needs them sold on the Shore before Easter, through your butchers, at his price.`, because: "moved Moretti's hams", when: (c) => c.month >= 1 && c.month <= 4 },
  { title: "Moretti's son-in-law", ask: (_c, sal) => `${sal}'s son-in-law wants to open a pizza stand on your boardwalk. He is, ${sal} says, "a nice boy who cannot cook." He needs the spot, the license, and patience.`, because: "set up Moretti's son-in-law on the boardwalk" },
  { title: 'A ballot box in Gloucester County', ask: (_c, sal) => `${sal} has a friend running for freeholder in Gloucester County and needs a few reliable men to "help count" on election night. Abstractly. No rough stuff, he says. Probably.`, because: "lent Moretti men for an election night", when: (c) => c.month >= 9 && c.month <= 11 },
  { title: 'The truck in the marsh', ask: (_c, sal) => `${sal} needs a stolen Philadelphia truck that ended up in the marsh by the Rio Grande bridge to stop existing before the state police find it.`, because: "made a truck disappear for Moretti" },
];

registerFamily({
  id: 'deal_philly',
  match: (ev) => ev.defId === 'deal_philly',
  scenes: PHILLY_ASKS.map((a) => ({
    when: a.when,
    title: () => a.title,
    text: (c: SceneCtx) => {
      const L = rivalLeader(c.s, 'philly');
      const via = pickWith(c.h, [`${L ? displayName(L) : 'Sal Moretti'} calls the Shamrock himself.`, `The bagman brings a message from ${L?.firstName ?? 'Sal'}, not an envelope.`, `${L?.firstName ?? 'Sal'}'s driver is waiting outside the Ivanhoe with a message.`, `A priest from St. Rita's in South Philadelphia drives down with a message from ${L?.firstName ?? 'Sal'}, which is a new one.`]);
      return `${via} ${a.ask(c, L?.firstName ?? 'Sal')}${c.s.heat.family >= 40 ? ' Philadelphia has not been happy with you lately. This is a chance.' : ''}`;
    },
    choices: (_c: SceneCtx, ch: Choice[]) => relabel(ch, { accept: { because: a.because } }),
  })),
});

/** Effects that only carry money (tests and the quiet renewals use this). */
export function moneyOf(effects: readonly Effect[]): number {
  return effects.filter((e): e is Extract<Effect, { type: 'money' }> => e.type === 'money').reduce((a, e) => a + e.amount, 0);
}
