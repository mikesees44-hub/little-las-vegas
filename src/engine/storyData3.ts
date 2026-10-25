import type { ChainInfo, PackEvent } from './storyDataSchema';
import {
  carried, crewOp, crewRole, evidence, famOp, famRole, favor, flag, heat, hook, leave, money, op, respect, rivOp, rivRes, rivalBoss,
  secret, stress, thenFx as then, townie, unwashed, wealth,
} from './storyDataSchema';
import { world } from './storyData2Cast';
import { STANDALONE_3 } from './storyData3b';

/**
 * LITTLE LAS VEGAS — CONTENT PACK 3 (written for the story director)
 *
 * Small things that get big. Pack-1 schema, pack-1 tone. Short 2-3 part
 * chains (p3_*) and standalones (storyData3b.ts): a $14 sandwich, a waiter
 * who heard too much, a capo's new Coupe de Ville, a soldier who wants to be
 * famous, a forgotten anniversary, a joke at the wrong wedding, a forty-year
 * grudge, a wife and a best friend, a Las Vegas marker, and the show people
 * of the world pack's entertainment roster (cast by worldId when the
 * population is present, else spawned under the same name).
 *
 * Content rules: noir and non-explicit, violence implied, adults decide for
 * themselves, no real living people, kids are never targets.
 */
const CHAIN_EVENTS: PackEvent[] = [
  /* ================================================================ */
  /* A $14 SANDWICH                                                     */
  /* ================================================================ */
  {
    id: 'p3_sw_1',
    category: 'crew',
    chain: { id: 'p3_sandwich', part: 1 },
    trigger: { season: 'summer', rank: ['soldier', 'associate'], rivalAlive: 'kessler', minWeek: 3, once: true, weight: 14 },
    roles: {
      actor: crewRole('a soldier or associate', { rank: ['soldier', 'associate'] }),
      rival: rivalBoss('kessler'),
    },
    title: 'Ham on Rye, Fourteen Dollars',
    body: `There is a new delicatessen on the boardwalk at Spicer Avenue with a striped awning, a pickle barrel and a hand-lettered menu that nobody reads. {actor.call} ordered a ham on rye and a cream soda. The kid at the register said, "Fourteen dollars."

In 1960 a ham on rye is forty cents. {actor.first} laughed. The kid did not. The owner came out of the back, a heavy man with Danny Kessler's brother-in-law's nose, and said it was fourteen dollars for "people like you."

{actor.first} put a quarter and a dime on the counter, ate the sandwich standing up, and left. Now the whole boardwalk is telling it, and {actor.first} wants to know what you want done about the price of ham.`,
    options: [
      {
        text: 'Pay the fourteen dollars. Add a tip. Make it a joke on them.',
        effects: [money(-14), respect(1), op('actor', -3), then('p3_sw_2', 2, 4, 0.5)],
        preview: 'The boardwalk laughs at the deli. Probably.',
      },
      {
        text: 'Send two men to discuss the price of ham with the owner.',
        effects: [heat('local', 3), rivOp('kessler', -6), op('actor', 8), crewOp(2), then('p3_sw_2', 2, 4, 1)],
        preview: 'The price comes down. Something else goes up.',
      },
      {
        text: 'Buy the delicatessen. Through a cousin, before Labor Day.',
        gate: { money: 3000 },
        effects: [money(-3000), op('actor', 10), respect(2), rivOp('kessler', -10), then('p3_sw_2', 3, 5, 1)],
        preview: 'Fourteen-dollar sandwiches are now your problem. And your joke.',
      },
    ],
  },
  {
    id: 'p3_sw_2',
    category: 'rivals',
    chain: { id: 'p3_sandwich', part: 2 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the soldier with the sandwich'), rival: carried('Danny Kessler') },
    title: 'The Leader Has a Headline',
    body: `The Wildwood Leader runs it on page three with a cartoon: a fat sandwich in a fedora holding up the boardwalk. HAM-HANDED, it says. Nobody is named. Everybody is named.

{rival.name} sends word through a bartender in North Wildwood. His brother-in-law has a broken pickle barrel, a lost lease and a wife who will not stop calling. Danny says he does not care about the sandwich. He cares that the whole island is laughing, and it is not at you.`,
    options: [
      {
        text: 'Send {rival.first} a ham on rye. Fourteen dollars, receipt attached.',
        effects: [respect(2), rivOp('kessler', -8), op('actor', 5), then('p3_sw_3', 2, 5, 0.7)],
        preview: 'Very funny. He may not think so.',
      },
      {
        text: 'Make it right with the brother-in-law: a new barrel and a month\'s lease.',
        effects: [money(-700), rivOp('kessler', 10), op('actor', -6)],
        preview: 'The joke ends. A little of your crew\'s fun ends with it.',
      },
      {
        text: 'Ask {rival.first} to the Table. Over a sandwich, of course.',
        effects: [stress(2), then('p3_sw_3', 1, 3, 1)],
        preview: 'Two grown men, one sandwich, and everybody watching.',
      },
    ],
  },
  {
    id: 'p3_sw_3',
    category: 'table',
    chain: { id: 'p3_sandwich', part: 3 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the soldier with the sandwich'), rival: carried('Danny Kessler') },
    title: 'The Sandwich Sit-Down',
    body: `Back room of a diner on the Rio Grande causeway, neutral ground. Two plates arrive without anyone ordering: ham on rye, a pickle, a cream soda. {rival.name} looks at his and does not touch it.

"My wife's brother is an idiot," he says. "Your man is an animal. And the whole Shore thinks this is about a sandwich. It is not about a sandwich. It is about who gets laughed at." {actor.call} is outside in the car. He would like very much to be inside.`,
    options: [
      {
        text: 'Pick up the sandwich, take a bite, and pay for both. "It\'s good ham, Danny."',
        effects: [money(-28), rivOp('kessler', 12), respect(2), flag('p3_ham_peace')],
        preview: 'Both men walk out with their faces. The island talks about it for years.',
      },
      {
        text: 'Bring {actor.first} in and have him apologize. To the sandwich.',
        effects: [rivOp('kessler', 6), op('actor', -10), respect(3)],
        preview: 'Danny almost smiles. {actor.first} will never forgive you, and never forget the laugh.',
      },
      {
        text: '"Your brother-in-law\'s lease runs out in October. So does his luck."',
        effects: [rivOp('kessler', -15), rivRes('kessler', { money: -1500 }), heat('local', 2), op('actor', 8)],
        preview: 'The deli closes. The feud does not.',
      },
    ],
  },

  /* ================================================================ */
  /* THE WAITER WHO HEARD EVERYTHING                                    */
  /* ================================================================ */
  {
    id: 'p3_wt_1',
    category: 'crew',
    chain: { id: 'p3_waiter', part: 1 },
    trigger: { rank: 'capo', minWeek: 6, once: true, weight: 13 },
    roles: {
      actor: crewRole('a capo', { rank: 'capo' }),
      waiter: townie('an old waiter', { first: 'Augustine', last: 'Ferrante', nickname: 'Gus', age: [64, 72], ethnicity: 'Italian', traits: ['Patient'] }),
    },
    title: 'Table Six',
    body: `{waiter.call} has waited tables at the same restaurant on New Jersey Avenue for thirty-one years. He knows how everyone takes their coffee and who sits with their back to the wall. Tonight he waits until the dining room is empty and comes to your table with the check and his hat in his hands.

"Mr. {player.last}. Thursday, table six. {actor.name} and two men I did not know. {actor.first} said, 'The old man won't be around forever.' He said it twice. I thought you would want to know." He will not take a tip for it.`,
    options: [
      {
        text: 'Thank him, and find out what {actor.first} meant.',
        effects: [op('waiter', 8), stress(3), then('p3_wt_2', 2, 4, 1)],
        preview: 'One sentence, overheard by a man with bad hearing. Or a warning.',
      },
      {
        text: 'Tell {waiter.first} he heard wrong, and to keep it that way.',
        effects: [op('waiter', -5), then('p3_wt_2', 4, 8, 0.4)],
        preview: 'You do not chase ghosts. Ghosts sometimes chase you.',
      },
      {
        text: 'Put {actor.first} at table six again, and have {waiter.first} listen.',
        effects: [money(-200), hook('waiter', 'He listens at table six for you'), then('p3_wt_2', 2, 3, 1)],
        preview: 'A waiter is invisible. That is the point of him.',
      },
    ],
  },
  {
    id: 'p3_wt_2',
    category: 'crew',
    chain: { id: 'p3_waiter', part: 2 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the capo'), waiter: carried('the waiter') },
    title: 'What He Meant',
    body: `It takes two weeks and a cousin at the phone company. The two men at table six were from a funeral home in Camden. {actor.call} has been pricing plots: his doctor found something on an X-ray, and the "old man" was his own father, who is ninety and refuses to die before his son.

Or that is what {actor.first} says when you ask him, red in the face, with the X-ray in his coat pocket. He also asks who told you.`,
    options: [
      {
        text: 'Believe him. Pay for the specialist at Jefferson.',
        effects: [money(-800), op('actor', 15), then('p3_wt_3', 4, 8, 0.5)],
        preview: 'A man who is dying is loyal, or desperate. You are betting on loyal.',
      },
      {
        text: 'Tell him who told you. Let them sort it out.',
        effects: [op('actor', -5), op('actor', -20, 'waiter'), then('p3_wt_3', 2, 4, 1)],
        preview: 'Honesty, the expensive kind. An old waiter is now afraid.',
      },
      {
        text: '"Nobody told me. I just know things."',
        effects: [respect(2), op('actor', -8), stress(2)],
        preview: 'Fear works. He will be careful at every table now, which is not the same as loyal.',
      },
    ],
  },
  {
    id: 'p3_wt_3',
    category: 'crew',
    chain: { id: 'p3_waiter', part: 3 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the capo'), waiter: carried('the waiter') },
    title: 'Thirty-Two Years',
    body: `{waiter.call} retires on a Sunday. The owner gives him a cake and a gold watch that cost less than one of your envelopes. {actor.call} comes, which nobody expected, and stands in the doorway until the old man sees him.

Whatever happened between them, it happens in the kitchen, five minutes, the door closed. When {actor.first} comes out he asks you, quietly, what the family does for a man who gave thirty-two years to the same tables.`,
    options: [
      {
        text: 'A pension, from the family, every month until he dies.',
        effects: [money(-600), respect(3), op('actor', 6), op('waiter', 25), famOp(2)],
        preview: 'Every waiter on the island will know. Waiters hear everything.',
      },
      {
        text: 'A summer job at one of your places. Sitting down.',
        effects: [money(-200), op('waiter', 15), hook('waiter', 'He still hears things for you')],
        preview: 'He keeps listening. He likes being useful.',
      },
      {
        text: 'Nothing. It is his life, not your business.',
        effects: [op('actor', -4), op('waiter', -5)],
        preview: 'The cake was nice.',
      },
    ],
  },

  /* ================================================================ */
  /* THE NEW COUPE DE VILLE                                              */
  /* ================================================================ */
  {
    id: 'p3_cdv_1',
    category: 'vice',
    chain: { id: 'p3_coupe', part: 1 },
    trigger: { rank: 'capo', trait: 'Greedy', minWeek: 8, once: true, weight: 13 },
    roles: { actor: crewRole('a Greedy capo', { rank: 'capo', trait: 'Greedy' }) },
    title: 'Where\'d He Get the Money?',
    body: `{actor.call} parks a new Cadillac Coupe de Ville outside the Shamrock: Persian Sand, white leather, fins like a jet fighter, $5,400 sticker. On paper he manages a laundromat on Pacific Avenue that clears sixty dollars a week.

The bartender asks where'd he get the money. A county detective in an unmarked Ford across the street writes the plate number down without even pretending not to. {actor.first} tosses you the keys. "Take her around the block, boss. She drives like a dream."`,
    options: [
      {
        text: 'Make him sell it. Tonight. A two-year-old Buick is what a laundromat buys.',
        effects: [op('actor', -12), evidence('actor', -5), evidence('player', -2)],
        preview: 'He sulks. The detective has nothing to write.',
      },
      {
        text: 'Paper it: a car loan from a finance company you own.',
        effects: [money(-300), evidence('actor', -2), op('actor', 6), then('p3_cdv_2', 4, 8, 0.6)],
        preview: 'Now it is a car payment. Payments are records too.',
      },
      {
        text: 'Take her around the block.',
        effects: [op('actor', 10), evidence('player', 2), heat('federal', 2), then('p3_cdv_2', 3, 6, 1)],
        preview: 'She does drive like a dream. Everybody saw you in it.',
      },
    ],
  },
  {
    id: 'p3_cdv_2',
    category: 'vice',
    chain: { id: 'p3_coupe', part: 2 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the capo') },
    title: 'And a Boat',
    body: `The Cadillac was the beginning. Since then {actor.call} has bought a thirty-two-foot Chris-Craft, a mink for his wife, a mink for a woman who is not his wife, and the first color television on his street, which the neighbors watch through his front window.

His envelope to you has been the same size every week. Either he has found new money, or he has found yours.`,
    options: [
      {
        text: 'Have his books looked at, quietly.',
        effects: [money(-400), stress(2), then('p3_cdv_3', 2, 4, 1)],
        preview: 'Numbers do not lie. Accountants sometimes do.',
      },
      {
        text: 'Ask him straight, over dinner.',
        effects: [op('actor', -2), then('p3_cdv_3', 1, 2, 1)],
        preview: 'He will tell you something. Whether it is true is another matter.',
      },
      {
        text: 'A man is entitled to a boat. Leave it.',
        effects: [heat('federal', 3), evidence('actor', 4), then('p3_cdv_3', 5, 8, 0.5)],
        preview: 'Somebody else is counting his boats.',
      },
    ],
  },
  {
    id: 'p3_cdv_3',
    category: 'law',
    chain: { id: 'p3_coupe', part: 3 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the capo') },
    title: 'The Man From the IRS',
    body: `He is thirty, crew-cut, wears a gray suit in July, and he has rented the room over the barbershop across from {actor.call}'s laundromat. Every morning he counts the customers. Every evening he counts them again. The laundromat has nine machines. According to its taxes it washes four thousand loads a week.

{actor.first} is not sleeping. He comes to you with the Cadillac's title in an envelope, as though that will fix it.`,
    options: [
      {
        text: 'Make the laundromat real: more machines, real customers, real books.',
        effects: [money(-2000), evidence('actor', -8), heat('federal', -4)],
        preview: 'Expensive. It might even turn a profit.',
      },
      {
        text: 'He takes the tax case alone. He pleads, he pays, he keeps his mouth shut.',
        effects: [wealth('actor', -3000), op('actor', -15), heat('federal', -2), secret('actor', 'skimming')],
        preview: 'He stays out of prison, barely. He remembers who left him alone.',
      },
      {
        text: 'Find out what the man from the IRS likes.',
        effects: [money(-1200), heat('federal', 4), evidence('player', 3), stress(4)],
        preview: 'Some men like money. Some men like arresting people who offer it.',
      },
    ],
  },

  /* ================================================================ */
  /* FAMOUS                                                              */
  /* ================================================================ */
  {
    id: 'p3_fame_1',
    category: 'crew',
    chain: { id: 'p3_famous', part: 1 },
    trigger: { trait: 'Charming', rank: ['soldier', 'associate'], minWeek: 5, once: true, weight: 13 },
    roles: {
      actor: crewRole('a Charming soldier', { rank: ['soldier', 'associate'], trait: 'Charming' }),
      writer: townie('a magazine writer', { first: 'Bradford', last: 'Hale', age: [28, 38], ethnicity: 'Irish', traits: ['Ambitious', 'Charming'] }),
    },
    title: 'A Face for Magazines',
    body: `A writer from a New York magazine is doing a piece on "the Las Vegas of the East." {writer.name} has a photographer, an expense account and a weakness for anyone who talks like a movie.

{actor.call} talks like a movie. He has been buying {writer.first} drinks for three nights at the Bolero, posing against the railing on the boardwalk with his hat tipped, telling stories that are almost true. "Nothing about the family," he swears. "Just color."`,
    options: [
      {
        text: 'Shut it down. Nobody in this family is anybody\'s color.',
        effects: [op('actor', -12), evidence('actor', -2)],
        preview: 'He wanted to be somebody. He still is: yours.',
      },
      {
        text: 'Let him talk, and tell him exactly what to say.',
        effects: [respect(2), op('actor', 8), then('p3_fame_2', 4, 7, 1)],
        preview: 'A story about a fun island with a little danger in it. Good for business.',
      },
      {
        text: 'Feed the writer a better story about {writer.first}\'s own magazine.',
        effects: [money(-300), hook('writer', 'You know who paid for his expense account'), then('p3_fame_2', 4, 7, 0.5)],
        preview: 'Writers have editors, and editors have secrets.',
      },
    ],
  },
  {
    id: 'p3_fame_2',
    category: 'crew',
    chain: { id: 'p3_famous', part: 2 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the soldier'), writer: carried('the writer') },
    title: 'Page Forty-Four',
    body: `The magazine comes out. Page forty-four is a full-page photograph of {actor.call} on the boardwalk at dusk, hat tipped, cigarette lit, the Ferris wheel behind him like a halo. The caption calls him "a man who knows where everything on this island comes from."

Girls ask for his autograph. A television producer calls the Shamrock. So does a man from the Justice Department who would like to know where everything on the island comes from.`,
    options: [
      {
        text: 'Send {actor.first} to Florida until the magazine is in the recycling.',
        effects: [money(-800), evidence('actor', -4), op('actor', -6)],
        preview: 'Fame fades fast if you leave it in the sun.',
      },
      {
        text: 'Let him do the television show. Under a fake name.',
        effects: [heat('federal', 4), op('actor', 12), then('p3_fame_3', 4, 8, 1)],
        preview: 'He will be very good on television. That is the problem.',
      },
      {
        text: 'Make him a front: the family\'s handsome face on a legitimate club.',
        effects: [money(-1500), respect(2), op('actor', 10), evidence('actor', 3)],
        preview: 'He gets his spotlight. The club gets customers.',
      },
    ],
  },
  {
    id: 'p3_fame_3',
    category: 'law',
    chain: { id: 'p3_famous', part: 3 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the soldier'), writer: carried('the writer') },
    title: 'The Book Deal',
    body: `A publisher in New York has offered {actor.call} an advance of eight thousand dollars for a memoir. Working title: "I Ran the Shore." He has not written a word. He swears he would change every name.

He would not have to change his own. Everyone already knows it from television, and the Justice Department has started sending him Christmas cards.`,
    options: [
      {
        text: 'Buy the book from him. Double the advance. No book.',
        effects: [money(-4000), op('actor', 5), evidence('actor', -6)],
        preview: 'The most expensive book never written.',
      },
      {
        text: 'Let him write a novel. Fiction. With a lawyer reading every page.',
        effects: [money(-500), op('actor', 10), heat('federal', 2), respect(1)],
        preview: 'Everybody will know it is not fiction. Nobody will be able to prove it.',
      },
      {
        text: 'Some men are not meant for this life. Let him go.',
        effects: [leave('actor', 'retires'), crewOp(-2)],
        preview: 'He moves to Los Angeles to write for television. He sends a postcard.',
      },
    ],
  },

  /* ================================================================ */
  /* THE ANNIVERSARY                                                     */
  /* ================================================================ */
  {
    id: 'p3_ann_1',
    category: 'family',
    chain: { id: 'p3_anniversary', part: 1 },
    trigger: { minWeek: 4, once: true, weight: 13 },
    roles: { wife: famRole('the boss\'s wife', 'spouse') },
    title: 'You Forgot',
    body: `You come home at two in the morning from a sit-down in Ventnor. The good tablecloth is on the dining-room table. Two candles have burned down to nothing. There is a roast in the oven that was a roast at seven and is now a lesson.

{wife.first} is not asleep. She is sitting in the dark in the kitchen in her good dress. "Our anniversary," she says. "I told myself, this year he'll remember." She does not shout. That is worse.`,
    options: [
      {
        text: 'The truth: you forgot. No excuses. You will make it right.',
        effects: [op('wife', -6), stress(3), then('p3_ann_2', 1, 2, 1)],
        preview: 'Honest, and hard. She will be watching what "right" means.',
      },
      {
        text: 'A story about the sit-down. Business, the family, Philadelphia.',
        effects: [op('wife', -12), stress(2), then('p3_ann_2', 1, 2, 1)],
        preview: 'She knows what business is. She also knows what an excuse is.',
      },
      {
        text: 'Sit down in the dark with her, in your coat, and eat the roast.',
        effects: [op('wife', 4), stress(-2), then('p3_ann_2', 1, 2, 1)],
        preview: 'It is terrible roast. It is the right roast.',
      },
    ],
  },
  {
    id: 'p3_ann_2',
    category: 'family',
    chain: { id: 'p3_anniversary', part: 2 },
    trigger: { chainOnly: true },
    roles: { wife: carried('the boss\'s wife') },
    title: 'Making It Right',
    body: `The whole island has an opinion on how to make it right. The underboss says diamonds. Your mother says a novena. The florist on Pacific Avenue says roses, and has already put two hundred of them on your account.

{wife.first} says nothing at all, and goes to the eight o'clock Mass without you.`,
    options: [
      {
        text: 'A week in Bermuda, just the two of you. The family runs itself.',
        effects: [money(-1500), op('wife', 20), stress(-8), famOp(3)],
        preview: 'Seven days with no telephone. The family may or may not run itself.',
      },
      {
        text: 'The diamond bracelet from Bailey Banks & Biddle.',
        effects: [money(-2500), op('wife', 10), unwashed(-1000)],
        preview: 'Beautiful. She knows exactly where the money came from.',
      },
      {
        text: 'Go to Mass with her next Sunday. Every Sunday.',
        effects: [op('wife', 14), respect(1), stress(-3), famOp(2)],
        preview: 'Free, and the most expensive thing on the list: your time.',
      },
    ],
  },

  /* ================================================================ */
  /* THE JOKE AT THE WEDDING                                             */
  /* ================================================================ */
  {
    id: 'p3_joke_1',
    category: 'table',
    chain: { id: 'p3_joke', part: 1 },
    trigger: { rivalAlive: 'philly', minWeek: 8, once: true, weight: 12 },
    roles: { sal: rivalBoss('philly') },
    title: 'A Very Funny Toast',
    body: `A wedding in South Philadelphia: four hundred guests, a sweet table the length of a trolley car, and you, with three glasses of Strega in you, asked to give a toast. It went well. It went very well. The line about {sal.name}'s appetite brought the house down: "Sal doesn't come to weddings for the bride. He comes for the cannoli, and the bride's mother's cannoli, and the cannoli she was saving for the christening."

Everybody laughed. {sal.first} laughed. He laughed a little longer than everybody else, and then he stopped.`,
    options: [
      {
        text: 'Send {sal.first} a tray of cannoli from Termini\'s with a card: "For the christening."',
        effects: [money(-50), rivOp('philly', 4), respect(1), then('p3_joke_2', 2, 4, 0.5)],
        preview: 'Doubling down on a joke takes nerve. Or Strega.',
      },
      {
        text: 'Apologize, in person, sober, at his social club.',
        effects: [rivOp('philly', 8), respect(-2), heat('family', -3)],
        preview: 'He accepts. He will mention it at every wedding for ten years.',
      },
      {
        text: 'It was a joke. Philadelphia can take a joke.',
        effects: [rivOp('philly', -6), heat('family', 4), then('p3_joke_2', 2, 5, 1)],
        preview: 'Philadelphia can take a lot of things. Usually from you.',
      },
    ],
  },
  {
    id: 'p3_joke_2',
    category: 'table',
    chain: { id: 'p3_joke', part: 2 },
    trigger: { chainOnly: true },
    roles: { sal: carried('Sal Moretti') },
    title: 'Philadelphia\'s Sense of Humor',
    body: `This month the bagman counts the envelope twice, slowly, licking his thumb, in front of your men. Then he hands you a white bakery box tied with string. Inside: one cannoli, and a card in {sal.first}'s handwriting.

"For the christening," it says. "Yours. Make sure you are around for it." Your underboss reads it over your shoulder and goes pale. You are almost sure it is a joke.`,
    options: [
      {
        text: 'Eat the cannoli in front of the bagman. Compliment the ricotta.',
        effects: [respect(3), rivOp('philly', 3), stress(3)],
        preview: 'Nerve, observed by Philadelphia. They file it under "useful" or "dangerous."',
      },
      {
        text: 'An extra envelope this month: an apology Philadelphia can count.',
        effects: [money(-1000), rivOp('philly', 12), heat('family', -6)],
        preview: 'Jokes are expensive in this business.',
      },
      {
        text: 'Have a christening. Invite {sal.first} as the guest of honor.',
        effects: [money(-600), rivOp('philly', 10), famOp(3), respect(2)],
        preview: 'He comes. He eats. He gives a toast about you. It is very funny.',
      },
    ],
  },

  /* ================================================================ */
  /* FORTY YEARS                                                         */
  /* ================================================================ */
  {
    id: 'p3_grd_1',
    category: 'crew',
    chain: { id: 'p3_grudge', part: 1 },
    trigger: { rank: ['soldier', 'capo'], minWeek: 10, once: true, weight: 11 },
    roles: {
      actor: crewRole('an old soldier', { rank: ['soldier', 'capo'], age: [50, 80] }),
      other: crewRole('another old hand', { rank: ['soldier', 'capo'], age: [45, 80], notRole: ['actor'] }),
    },
    title: 'A Missed Funeral, 1921',
    body: `At the Sunday dinner {actor.call} will not sit down. Not at the table, not in the room, not while {other.call} is in it. It has been this way, it turns out, since 1921, when {actor.first}'s father was buried in the rain at Holy Cross and {other.first}'s family did not come.

Neither of them remembers why the {other.last}s stayed away. Both of them remember that they did. The gravy is getting cold, and your wife is looking at you.`,
    options: [
      {
        text: 'Two tables. Some things a boss does not fix.',
        effects: [op('actor', 3), op('other', 3), stress(1)],
        preview: 'Peace by furniture. It has worked for forty years.',
      },
      {
        text: 'Take them both to Holy Cross. Stand at the grave together.',
        effects: [money(-150), op('actor', 8), op('other', 4), then('p3_grd_2', 2, 4, 1)],
        preview: 'Old men, an old grave, an old grudge. Anything can happen.',
      },
      {
        text: '"Sit down, both of you. It was 1921."',
        effects: [respect(1), op('actor', -6), op('other', -2), then('p3_grd_2', 3, 6, 0.5)],
        preview: 'They sit. They do not speak. The gravy is still cold.',
      },
    ],
  },
  {
    id: 'p3_grd_2',
    category: 'crew',
    chain: { id: 'p3_grudge', part: 2 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the old soldier'), other: carried('the other old hand') },
    title: 'Why the {other.last}s Stayed Away',
    body: `It comes out at the cemetery, or after it, over anisette in a bar on Rio Grande. In 1921 {other.first}'s father was in the county jail. He had taken the fall for something {actor.first}'s father did, and the family was told to stay away from the funeral so nobody would connect the two men.

Both of them sit with that for a while. Then {actor.first} pays for the round, which in forty years he has never done.`,
    options: [
      {
        text: 'Let them have their evening. Pay for the next round.',
        effects: [money(-40), op('actor', 10), op('other', 10), crewOp(2)],
        preview: 'Two old men find out their fathers were friends after all.',
      },
      {
        text: 'Tell the crew the story at the next dinner. It is a story about loyalty.',
        effects: [respect(2), crewOp(4), op('actor', 4), op('other', 4)],
        preview: 'Every young soldier hears it. Some of them understand it.',
      },
    ],
  },

  /* ================================================================ */
  /* HE SLEPT WITH THE WRONG WIFE                                        */
  /* ================================================================ */
  {
    id: 'p3_ww_1',
    category: 'crew',
    chain: { id: 'p3_wrongwife', part: 1 },
    trigger: { rank: 'capo', minWeek: 12, once: true, weight: 11 },
    roles: {
      capo: crewRole('a capo', { rank: 'capo' }),
      friend: crewRole('his best friend in the crew', { rank: ['soldier', 'associate'], sameRegimeAs: 'capo', notRole: ['capo'] }),
      wife: townie('the capo\'s wife', { gender: 'F', first: 'Marianne', age: [30, 45], ethnicity: 'Italian', traits: ['Charming'] }),
    },
    title: 'Two Visitors in One Day',
    body: `On Tuesday morning {wife.first}, {capo.call}'s wife, comes to see you at the bakery with her hair done and her hands shaking. On Tuesday afternoon {friend.call}, {capo.first}'s best friend since grade school, comes to see you at the club, unshaven.

They tell the same story from two ends, which is how you know it is true. It started last winter. Neither of them meant it to. Both of them say it is over. Neither of them knows the other came to you. And {capo.first} knows nothing at all, yet.`,
    options: [
      {
        text: 'Their lives, their secret. Tell them both to end it, and keep it.',
        effects: [secret('friend', 'affair'), hook('friend', 'You know about him and his capo\'s wife'), stress(4), then('p3_ww_2', 4, 8, 0.5)],
        preview: 'Grown people decide for themselves. Secrets in a crew have a half-life.',
      },
      {
        text: 'Move {friend.first} to another crew, quietly. No reason given.',
        effects: [op('friend', -6), op('capo', -4), stress(2), then('p3_ww_2', 4, 8, 0.3)],
        preview: 'Distance helps. {capo.first} will wonder why his best friend was moved.',
      },
      {
        text: '{capo.first} has a right to know. Tell him, with {friend.first} in the room.',
        effects: [op('capo', 6), op('capo', -20, 'friend'), op('friend', -10), crewOp(-2), then('p3_ww_2', 1, 2, 1)],
        preview: 'Honest. Brutal. The room will need new furniture.',
      },
    ],
  },
  {
    id: 'p3_ww_2',
    category: 'crew',
    chain: { id: 'p3_wrongwife', part: 2 },
    trigger: { chainOnly: true },
    roles: { capo: carried('the capo'), friend: carried('the friend'), wife: carried('the capo\'s wife') },
    title: 'He Knows',
    body: `{capo.call} knows. Maybe you told him, maybe the neighborhood did. He comes to you sober and very calm, which is the worst way for a man like him to be, and asks for permission.

He does not say permission for what. He does not have to. {wife.first} has gone to her mother's in Glassboro with the children; that was her decision, and she made it before he got home. {friend.first} has not been seen since Friday.`,
    options: [
      {
        text: '"No. Nobody touches him. He leaves the island; you keep your crew."',
        effects: [leave('friend', 'exile'), op('capo', -10), respect(2), stress(3)],
        preview: 'A boss says no. The capo obeys. Obeying is not forgiving.',
      },
      {
        text: 'Sit with him all night. Let him talk until he is done.',
        effects: [op('capo', 12), stress(5), heat('local', -1)],
        preview: 'By morning he is tired, not murderous. It is the best you can do.',
      },
      {
        text: 'Send {capo.first} to Florida for a month, on the family, to cool off.',
        effects: [money(-1000), op('capo', 6), leave('friend', 'retires')],
        preview: 'The friend quietly leaves the life. The capo comes back tan and quieter.',
      },
    ],
  },

  /* ================================================================ */
  /* THE MARKER                                                          */
  /* ================================================================ */
  {
    id: 'p3_mk_1',
    category: 'vice',
    chain: { id: 'p3_marker', part: 1 },
    trigger: { trait: 'Gambler', rank: ['capo', 'soldier'], rivalAlive: 'feldstein', minWeek: 10, once: true, weight: 12 },
    roles: {
      actor: crewRole('a Gambler capo or soldier', { rank: ['capo', 'soldier'], trait: 'Gambler' }),
      feld: rivalBoss('feldstein'),
    },
    title: 'What Happens in Las Vegas',
    body: `{actor.call} went to Las Vegas for his cousin's wedding and came back with a tan, a matchbook from the Desert Inn and a marker for $18,000 signed at a baccarat table at four in the morning.

The casino's money comes from New York, and New York's money is {feld.name}. The marker arrived at the Shamrock this morning in a hotel envelope, with a note: "Mr. Feldstein would be happy to discuss terms with Mr. {player.last}."`,
    options: [
      {
        text: 'Pay it. All of it. Then {actor.first} pays you, forever.',
        gate: { money: 9000 },
        effects: [money(-9000), rivOp('feldstein', 8), op('actor', 10), hook('actor', 'You paid his Las Vegas marker', true)],
        preview: 'A strong hook on a man who owes you everything.',
      },
      {
        text: 'Discuss terms with Mr. Feldstein.',
        effects: [stress(3), then('p3_mk_2', 1, 3, 1)],
        preview: 'He did not get rich by being reasonable.',
      },
      {
        text: 'It is {actor.first}\'s marker. Let him go to New York and explain.',
        effects: [op('actor', -15), rivOp('feldstein', -4), crewOp(-2)],
        preview: 'He goes. He comes back with a new friend in New York. That is the risk.',
      },
    ],
  },
  {
    id: 'p3_mk_2',
    category: 'rivals',
    chain: { id: 'p3_marker', part: 2 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the gambler'), feld: carried('Ira Feldstein') },
    title: 'Terms',
    body: `{feld.name} receives you in a suite at the Traymore with a view of the ocean he does not look at. He has the marker on the coffee table and a plate of rugelach nobody touches.

"I do not want your money," he says. "Money I have. I want your Thursday nights: the card game in the Crest. Six months. My dealers, my players, my house cut. After that the marker disappears and so do I."`,
    options: [
      {
        text: 'Give him the Thursday nights. Six months.',
        effects: [rivRes('feldstein', { money: 3000 }), rivOp('feldstein', 12), money(-1500), op('actor', 8)],
        preview: 'New York at your card table. They will learn who plays there.',
      },
      {
        text: 'Counter: half the marker in cash, the rest forgiven as a courtesy.',
        gate: { money: 5000 },
        effects: [money(-5000), rivOp('feldstein', 4), respect(2), op('actor', 6)],
        preview: 'He accepts, which means you could have paid less.',
      },
      {
        text: '"My men do not sign markers in my name. Collect it from him."',
        effects: [rivOp('feldstein', -12), op('actor', -12), respect(1), heat('local', 2)],
        preview: 'A principle. Principles are what other people pay for.',
      },
    ],
  },

  /* ================================================================ */
  /* MORTY GLASS'S MARKERS                                               */
  /* ================================================================ */
  {
    id: 'p3_mg_1',
    category: 'boardwalk',
    chain: { id: 'p3_morty', part: 1 },
    trigger: { season: 'summer', rivalAlive: 'feldstein', minWeek: 4, once: true, weight: 12 },
    roles: {
      morty: world('ent_morty_glass', 'Morty Glass, the Catskills comic', { first: 'Mortimer', last: 'Glassberg', nickname: 'Morty Glass', age: [43, 47], ethnicity: 'Jewish', traits: ['Gambler', 'Charming', 'Paranoid'] }),
      feld: rivalBoss('feldstein'),
    },
    title: 'The Funniest Man in the Catskills',
    body: `{morty.call} is the hottest comic on television and he is playing a two-week engagement at a club on the boardwalk for a fraction of his fee, because he needs the cash. He finds you after the late show, still sweating under his tuxedo, and does ten minutes on the humidity before he gets to the point.

He owes {feld.name}'s card games fifteen thousand dollars. "Buy my markers," he says, "and I'll play your club every summer for scale until I'm dead. Which, if Ira keeps calling, is September."`,
    options: [
      {
        text: 'Buy his markers.',
        gate: { money: 7500 },
        effects: [money(-7500), rivOp('feldstein', 6), op('morty', 25), flag('p3_morty_ours'), then('p3_mg_2', 5, 8, 1)],
        preview: 'The funniest man in the Catskills, on your stage, every summer.',
      },
      {
        text: 'Book him for August at full price instead. He can pay Ira himself.',
        effects: [money(1000), op('morty', 8), respect(2)],
        preview: 'A great August. Ira gets paid. Everybody laughs.',
      },
      {
        text: '"I don\'t buy markers, Morty. I just laugh at them."',
        effects: [op('morty', -8)],
        preview: 'He uses the line on stage. It gets a big laugh.',
      },
    ],
  },
  {
    id: 'p3_mg_2',
    category: 'boardwalk',
    chain: { id: 'p3_morty', part: 2 },
    trigger: { chainOnly: true },
    roles: { morty: carried('Morty Glass'), feld: carried('Ira Feldstein') },
    title: 'Morty Does Twenty Minutes on You',
    body: `{morty.call} keeps his word and plays your club. The crowds are lined up past the Ferris wheel. Then, on the third night, he does twenty minutes about "a fella on this island who owns everything except a sense of humor" and the room roars.

He swears it's affectionate. The County Prosecutor is in the third row, laughing hardest of all.`,
    options: [
      {
        text: 'Laugh. Loudly. From the front table.',
        effects: [respect(3), op('morty', 6), heat('local', -2)],
        preview: 'A man who can laugh at himself is hard to make into a villain.',
      },
      {
        text: 'Have a word with Morty about his material.',
        effects: [op('morty', -10), heat('local', 2)],
        preview: 'He changes the bit. The new one is about a fella who has words with comics.',
      },
      {
        text: 'Sell his contract back to Ira, at a profit.',
        effects: [money(9000), rivOp('feldstein', 10), op('morty', -20)],
        preview: 'Comedy is a business. Morty knows that better than anyone.',
      },
    ],
  },

  /* ================================================================ */
  /* JOHNNY BELMONTE'S COMEBACK                                          */
  /* ================================================================ */
  {
    id: 'p3_jb_1',
    category: 'boardwalk',
    chain: { id: 'p3_belmonte', part: 1 },
    trigger: { minWeek: 6, once: true, weight: 11 },
    roles: {
      johnny: world('ent_johnny_belmonte', 'Johnny Belmonte, the comeback crooner', { first: 'Giovanni', last: 'Belmonte', nickname: 'Johnny', age: [34, 38], ethnicity: 'Italian', traits: ['Patient', 'Charming'] }),
      manager: townie('his old manager', { first: 'Lou', last: 'Spadaro', age: [50, 60], ethnicity: 'Italian', traits: ['Greedy'] }),
    },
    title: 'A Song About Falling Down',
    body: `In 1954 {johnny.call} had three hits and a drinking problem. In 1958 he had the drinking problem. Now he is two years sober, singing a nightclub act about his own fall, and it is the best thing he has ever done. People cry into their highballs.

{manager.name}, the manager who drank with him all the way down, has turned up with a contract from 1953 that says he owns forty percent of everything Johnny earns until 1970. Johnny asks you, very politely, whether contracts like that can be talked about.`,
    options: [
      {
        text: 'Have a lawyer read it. Contracts have holes.',
        effects: [money(-600), op('johnny', 12), then('p3_jb_2', 3, 6, 1)],
        preview: 'Clean, slow, and legal. Lou has lawyers too.',
      },
      {
        text: 'Talk to {manager.first}. The way people talk on this island.',
        effects: [heat('local', 3), op('johnny', 15), hook('johnny', 'You got Lou Spadaro off his back'), then('p3_jb_2', 3, 6, 1)],
        preview: 'Lou finds the contract was always negotiable.',
      },
      {
        text: 'Buy the contract from {manager.first} yourself.',
        gate: { money: 4000 },
        effects: [money(-4000), op('johnny', 6), flag('p3_johnny_contract'), then('p3_jb_2', 3, 6, 1)],
        preview: 'Now you own forty percent of a comeback. And of a sober man\'s gratitude.',
      },
    ],
  },
  {
    id: 'p3_jb_2',
    category: 'boardwalk',
    chain: { id: 'p3_belmonte', part: 2 },
    trigger: { chainOnly: true },
    roles: { johnny: carried('Johnny Belmonte'), manager: carried('the old manager') },
    title: 'Opening Night in Atlantic City',
    body: `{johnny.call} gets a two-week booking at a big room in Atlantic City. Opening night there is a bottle of champagne in his dressing room with no card. He has not had a drink in two years, three months and eleven days. He calls you from the pay phone in the hallway, twenty minutes before showtime.

"Somebody wants me to fall down again," he says. "I just want to know if it's you."`,
    options: [
      {
        text: 'Drive to Atlantic City. Stand in his dressing room until he goes on.',
        effects: [op('johnny', 20), respect(2), stress(2)],
        preview: 'He sings like a man who has someone in his corner.',
      },
      {
        text: 'Find out who sent the bottle.',
        effects: [money(-300), rivOp('manno', -4), op('johnny', 8)],
        preview: 'A Manno florist. Somebody in Atlantic City does not like comebacks they do not own.',
      },
      {
        text: '"It\'s not me, Johnny. Go sing."',
        effects: [op('johnny', 4)],
        preview: 'He goes. He sings. Nobody knows how close it was.',
      },
    ],
  },

  /* ================================================================ */
  /* A MOVIE STAR ON THE BOARDWALK                                       */
  /* ================================================================ */
  {
    id: 'p3_rex_1',
    category: 'boardwalk',
    chain: { id: 'p3_rex', part: 1 },
    trigger: { season: 'summer', minWeek: 6, once: true, weight: 11 },
    roles: {
      rex: world('ent_rex_dorian', 'Rex Dorian, the matinee idol', { first: 'Rex', last: 'Dorian', age: [30, 33], traits: ['Gambler', 'Charming'] }),
    },
    title: 'Rex Dorian Is Shooting on the Pier',
    body: `A Hollywood studio has closed Hunt's Pier for a week to shoot the ending of a picture: {rex.name}, the face on every magazine cover, running down the boardwalk in the rain from a machine that makes rain. Half the island stands behind sawhorses to watch.

The studio's fixer finds you on the second day. Rex has been losing at a card game in the Crest, the kind of game that does not take checks, and the fixer would like the press kept away from the man and the man kept away from the game. Discreetly. For a fee, in either direction.`,
    options: [
      {
        text: 'Keep the press away and the game closed to him. The studio pays.',
        effects: [money(2000), respect(1), heat('local', -1)],
        preview: 'Clean money from Hollywood. A movie star sulks in his hotel.',
      },
      {
        text: 'Let him play. Your house, your dealer.',
        effects: [money(3500), heat('local', 2), hook('rex', 'He lost at your table in Wildwood'), then('p3_rex_2', 4, 8, 1)],
        preview: 'A movie star\'s marker in your drawer. Hollywood does not forget.',
      },
      {
        text: 'Put Rex in a photograph with the Mayor and the Miss Wildwood court.',
        effects: [respect(3), favor(1), heat('local', -3)],
        preview: 'Front page of the Leader. Good for the island. Good for you.',
      },
    ],
  },
  {
    id: 'p3_rex_2',
    category: 'boardwalk',
    chain: { id: 'p3_rex', part: 2 },
    trigger: { chainOnly: true },
    roles: { rex: carried('Rex Dorian') },
    title: 'A Telegram From Hollywood',
    body: `A telegram from Los Angeles: REX SENDS REGARDS STOP STUDIO WISHES TO DISCUSS MARKER STOP ALSO SECOND PICTURE STOP. The second picture is about a resort town run by a quiet man with a big family. The studio wants to film it here, and they want a "technical advisor."

Your lawyer reads it twice and asks if you want to be in pictures.`,
    options: [
      {
        text: 'Forgive the marker. Be the technical advisor. Under another name.',
        effects: [respect(3), heat('federal', 3), money(1500)],
        preview: 'The picture is a hit. Everybody in Wildwood knows which character is you.',
      },
      {
        text: 'Collect the marker in full and decline the picture.',
        effects: [money(4000), heat('federal', 1)],
        preview: 'Money in hand. A studio lawyer remembers your name.',
      },
      {
        text: 'Trade the marker for a piece of the picture.',
        effects: [unwashed(-1000), money(-500), flag('p3_rex_points')],
        preview: 'Points on a Hollywood picture. Hollywood math is creative.',
      },
    ],
  },
];

export const EVENTS_3: PackEvent[] = [...CHAIN_EVENTS, ...STANDALONE_3];

const TITLES: Record<string, string> = {
  p3_sandwich: 'A $14 Sandwich', p3_waiter: 'The Waiter Who Heard Everything', p3_coupe: 'The New Coupe de Ville', p3_famous: 'Famous',
  p3_anniversary: 'The Anniversary', p3_joke: 'The Toast', p3_grudge: 'Forty Years', p3_wrongwife: 'The Wrong Wife', p3_marker: 'The Marker',
  p3_morty: 'Morty Glass\'s Markers', p3_belmonte: 'The Comeback', p3_rex: 'Rex Dorian on the Pier',
};

export const CHAINS_3: ChainInfo[] = (() => {
  const by = new Map<string, PackEvent[]>();
  for (const e of EVENTS_3) if (e.chain) by.set(e.chain.id, [...(by.get(e.chain.id) ?? []), e]);
  return [...by.entries()].map(([id, es]) => {
    const parts = es.slice().sort((a, b) => a.chain!.part - b.chain!.part);
    return { id, title: TITLES[id] ?? parts[0].title, summary: parts[0].title, events: parts.map((e) => e.id) };
  });
})();
