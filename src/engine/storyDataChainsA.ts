import type { PackEvent } from './storyDataSchema';
import {
  carried, crewOp, crewRole, evidence, famOp, flag, health, heat, hook, leave, money, official, op, prison, rank, recruit, respect, rivOp, rivRes, rivalBoss, rivalMan, secret, stress, thenFx as then, townie, under, infl, biz, unwashed,
} from './storyDataSchema';

/**
 * Chains A
 *  1. The Long Goodbye  (lg_*)    a capo's slow betrayal to Atlantic City
 *  2. Five Points a Week (vig_*)  a soldier's debt to Kessler's shylock
 *  3. Ink               (ink_*)   a Philadelphia Inquirer reporter digs
 *  4. The Gargano Boy   (garg_*)  a widow's son wants to know who drove
 *  5. Ash Wednesday     (ash_*)   the March 1962 storm
 */
export const CHAINS_A: PackEvent[] = [
  /* ================================================================ */
  /* 1. THE LONG GOODBYE                                               */
  /* ================================================================ */
  {
    id: 'lg_1',
    category: 'crew',
    chain: { id: 'long_goodbye', part: 1 },
    trigger: { rank: 'capo', trait: 'Ambitious', minWeek: 8, rivalAlive: 'manno', once: true, weight: 14 },
    roles: {
      actor: crewRole('a capo with trait Ambitious', { rank: 'capo' }),
      witness: crewRole('a soldier in the actor\'s regime', { rank: 'soldier', sameRegimeAs: 'actor' }),
      rival: rivalMan('manno', 'Manno\'s go-between, a florist from Ventnor', { first: 'Nicky', last: 'Ruggiero', nickname: 'the Florist', ethnicity: 'Italian', age: [40, 55] }),
    },
    title: 'Cherrystones in Somers Point',
    body: `{witness.call} drove his mother to her sister's in Somers Point on Tuesday and stopped at a clam bar on the bay for a dozen cherrystones. Two booths down sat {actor.call}, your capo, splitting a pitcher of Ballantine with {rival.name}, the one they call {rival.nickname}, who sells funeral sprays in Ventnor and favors for {rival.boss}.

{witness.first} says they laughed a lot. He says {actor.first} paid. He says it twice, because in this life the man who picks up the check is the man who wants something.`,
    options: [
      {
        text: 'Ask {actor.first} about it over coffee. Man to man.',
        effects: [op('actor', -5), stress(-2), then('lg_2', 3, 5, 0.5)],
        preview: 'He learns you know. Maybe that ends it. Maybe it teaches him to eat somewhere else.',
      },
      {
        text: 'Tell {witness.first} to keep his eyes open. Quietly.',
        effects: [op('witness', 8), flag('lg_watching'), then('lg_2', 2, 4, 0.9)],
        preview: 'You learn more. If {actor.first} finds out who is watching, {witness.first} pays for it.',
      },
      {
        text: 'A man can eat clams. Let it go.',
        effects: [op('witness', -5), then('lg_2', 3, 6, 1)],
        preview: 'A quiet week. Whatever is growing, grows in the dark.',
      },
      {
        text: 'Route his district\'s envelopes through your own bagman for a month.',
        gate: { trait: 'Paranoid' },
        effects: [money(900), op('actor', -15), crewOp(-3), then('lg_2', 3, 5, 0.7)],
        preview: 'His money passes through your hands. So does his resentment.',
      },
    ],
  },
  {
    id: 'lg_2',
    category: 'crew',
    chain: { id: 'long_goodbye', part: 2 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the capo'), witness: carried('the soldier who saw him'), rival: carried('the florist') },
    title: 'The Sunniest July Since the War',
    body: `{actor.call}'s envelope came in light again, the third week running. Rain, he says. A drowned week. The Weather Bureau in Atlantic City says it was the sunniest stretch since the war, and you yourself waited twenty minutes in line for frozen custard in {district} on Saturday night.

A capo who skims is a capo who is saving up for something. The question is what he thinks he is buying.`,
    immediate: [money(-700)],
    options: [
      {
        text: 'Send the bagman to count his books, in front of his men.',
        effects: [money(1400), op('actor', -18), secret('actor', 'skimming'), respect(4), then('lg_3', 2, 4, 0.8)],
        preview: 'You get your number back. He gets a reason.',
      },
      {
        text: 'Raise his keep. A happy capo is a quiet capo.',
        effects: [money(-400), op('actor', 15), then('lg_3', 4, 8, 0.4)],
        preview: 'Costs you every week. Buys time, not necessarily loyalty.',
      },
      {
        text: 'Move {witness.first} up to run his bookmaking. Your eyes, in his office.',
        effects: [op('witness', 12), op('actor', -6), op('witness', -10, 'actor'), then('lg_3', 2, 5, 1)],
        preview: 'You see everything he does. He sees exactly who you planted.',
      },
    ],
  },
  {
    id: 'lg_3',
    category: 'rivals',
    chain: { id: 'long_goodbye', part: 3 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the capo'), rival: carried('the florist'), sal: rivalBoss('philly', 'Sal "the Bag" Moretti, Philadelphia\'s South Jersey capo') },
    title: 'White Carnations',
    body: `{rival.name} comes into the Ivanhoe carrying a florist's box like it holds a christening gown. White carnations. He sets it on your table and doesn't sit down.

"{rival.boss} doesn't like a man who sells out his own boss," he says. "He finds it unreliable." Inside the box, under the flowers, is an envelope: three pages in {actor.first}'s handwriting. Your Causeway pickup times. The name of your man at the county garage. Who sleeps where in August.

The envelope is sealed. {rival.nickname} would like to talk about what it costs.`,
    options: [
      {
        text: 'Pay what he asks. You want it in writing.',
        gate: { money: 4000 },
        effects: [money(-4000), hook('actor', 'His betrayal, in his own hand', true), rivOp('manno', 5), then('lg_4', 1, 2, 1)],
        preview: 'Proof you can hold. Manno has your money and a good laugh in Atlantic City.',
      },
      {
        text: 'Hand back the box. Tell Manno to keep his flowers.',
        effects: [respect(5), rivOp('manno', -10), stress(6), then('lg_4', 2, 4, 0.85)],
        preview: 'You do your own detective work. It may come too late.',
      },
      {
        text: 'Carry the box, unopened, to Sal Moretti in Philadelphia.',
        effects: [heat('family', -5), rivOp('philly', 10), op('sal', 10), flag('lg_philly'), then('lg_4', 2, 3, 1)],
        preview: 'Philadelphia will want a say in what happens to a capo. That is the price of their blessing.',
      },
      {
        text: 'Make the florist an offer of your own.',
        gate: { trait: 'Charming' },
        effects: [money(-1500), hook('rival', 'He sold out his boss\'s business to you'), rivOp('manno', -5), flag('ear_in_ac'), then('lg_4', 2, 3, 1)],
        preview: 'Somebody in Atlantic City talks to you now. Florists are not famous for keeping secrets.',
      },
    ],
  },
  {
    id: 'lg_4',
    category: 'family',
    chain: { id: 'long_goodbye', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { actor: carried('the capo'), child: { desc: 'the boss\'s youngest child', pool: 'family', relation: 'child' } },
    title: 'Sunday Gravy',
    body: `Your mother insisted {actor.first} come to Sunday dinner. He is {child.first}'s godfather; he has eaten at this table every Sunday since the Truman administration. The gravy has been on since six. Braciole, meatballs, the neck bones nobody admits to liking. He brought sfogliatelle in a white box tied with string.

After coffee he sits on your porch with {child.first} asleep across his lap, watching the traffic on Pacific. He knows you know. You know he knows. Neither of you mentions the weather.`,
    options: [
      {
        text: 'Forgive him, here, where the family can see it.',
        effects: [op('actor', 30), hook('actor', 'You spared him at your own table', true), crewOp(-5), respect(-5), rivOp('manno', -5), famOp(5)],
        preview: 'He owes you his life and everyone knows it. Some men repay that. Some resent it forever.',
      },
      {
        text: 'Take his regime. He keeps a stand on the Boardwalk and his dignity, mostly.',
        effects: [rank('actor', 'soldier'), op('actor', -40), crewOp(3), respect(5)],
        preview: 'A demoted capo is a wound that stays open. His men watch how it heals.',
      },
      {
        text: 'Florida. Tonight. His wife can follow when the house sells.',
        effects: [leave('actor', 'exile'), money(-2000), respect(3), famOp(-6)],
        preview: 'Clean and quiet. And he knows where everything is, from a lawn chair in Hialeah.',
      },
      {
        text: 'Ask Philadelphia for permission. Then take him fishing.',
        gate: { trait: 'Cruel' },
        effects: [leave('actor', 'dies'), heat('local', 10), heat('federal', 5), respect(15), crewOp(-8), famOp(-15), stress(15), rivOp('philly', 5)],
        preview: 'A boat leaves Otten\'s Harbor before dawn and comes back lighter. {child.first} will ask about him for years.',
      },
    ],
  },

  /* ================================================================ */
  /* 2. FIVE POINTS A WEEK                                             */
  /* ================================================================ */
  {
    id: 'vig_1',
    category: 'vice',
    chain: { id: 'vig', part: 1 },
    trigger: { rank: 'soldier', trait: 'Gambler', rivalAlive: 'kessler', minWeek: 4, weight: 12, cooldownWeeks: 60 },
    roles: {
      actor: crewRole('a soldier with trait Gambler', { rank: 'soldier' }),
      shylock: rivalMan('kessler', 'Kessler\'s shylock', { first: 'Hughie', last: 'Shea', ethnicity: 'Irish', age: [45, 60], traits: ['Patient'] }),
    },
    title: 'Five Points a Week',
    body: `{actor.call} catches you at the counter of a luncheonette on Rio Grande Avenue, hat in his hands like a boy at confession. He is into {shylock.name} for $2,200: Danny Kessler's money, five points a week, collected Thursdays in the back booth of a North Wildwood gin mill.

The trotters at the Atlantic City Race Course have been unkind. The vig alone eats his whole end. He hasn't told his wife. He hasn't told his capo. He is telling you, which means he has run out of other people.`,
    options: [
      {
        text: 'Pay {shylock.first} off. {actor.first} works it off for you.',
        gate: { money: 2600 },
        effects: [money(-2600), op('actor', 20), hook('actor', 'You cleared his marker'), rivOp('kessler', 3), then('vig_3', 6, 12, 0.3)],
        preview: 'Your money in Kessler\'s pocket. {actor.first}\'s gratitude, for as long as his luck holds.',
      },
      {
        text: 'I don\'t pay a man\'s bets. He sorts it himself.',
        effects: [op('actor', -15), respect(2), then('vig_2', 2, 3, 1)],
        preview: 'A lesson, maybe. Or Kessler learns he can lean on your soldiers.',
      },
      {
        text: 'Lend it to him yourself, at three points. Cheaper than Hughie.',
        effects: [money(-2200), op('actor', 6), then('vig_3', 4, 8, 0.55)],
        preview: 'Profitable, and now your soldier owes his own boss. That never ends well.',
      },
      {
        text: 'Call Danny Kessler and ask, as a courtesy, that he cut the vig.',
        gate: { trait: 'Charming' },
        effects: [op('actor', 10), rivOp('kessler', 6), flag('owe_kessler'), then('vig_4', 6, 10, 0.5)],
        preview: 'Kessler halves the vig. Now you owe Kessler a courtesy, and he will choose when.',
      },
    ],
  },
  {
    id: 'vig_2',
    category: 'rivals',
    chain: { id: 'vig', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      actor: carried('the soldier'), shylock: carried('the shylock'),
      mother: townie('the soldier\'s widowed mother', { gender: 'F', ethnicity: 'Italian', age: [58, 72], traits: ['Pious'] }),
    },
    title: 'A Studebaker on Holly Street',
    body: `{mother.name} doesn't call her son. She calls you. A green Studebaker has been parked outside her bungalow in Rio Grande for three nights, two men in it eating hoagies and listening to the Phillies lose. They tip their hats when she goes out for the paper.

They are Hughie Shea's men, and the bungalow belongs to the mother of a man who belongs to you. It is a message with whitewall tires on it.`,
    options: [
      {
        text: 'Pay the marker in full, with the week\'s interest. End it.',
        gate: { money: 3400 },
        effects: [money(-3400), respect(-5), rivOp('kessler', 5), op('mother', 15), op('actor', 10)],
        preview: 'The car leaves. Kessler\'s people learn that leaning on your men pays.',
      },
      {
        text: 'Send two soldiers to move the Studebaker. With the men still in it.',
        effects: [respect(8), rivOp('kessler', -15), heat('local', 5), op('mother', 10), then('vig_4', 2, 4, 1)],
        preview: 'Nobody gets hurt badly. Everybody in North Wildwood hears about it.',
      },
      {
        text: 'Tell {actor.first} his mother is his problem.',
        effects: [op('actor', -25), op('mother', -20), secret('actor', 'informant', 'kessler'), then('vig_3', 2, 4, 1)],
        preview: 'A soldier who owes a rival is a door left unlocked.',
      },
    ],
  },
  {
    id: 'vig_3',
    category: 'crew',
    chain: { id: 'vig', part: 3 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the soldier'), shylock: carried('the shylock') },
    title: 'The Knock',
    body: `Two men in stocking masks walked into your card game above the Anchor Bar at one in the morning. They knew the knock. They knew it was the Saturday the dentist from Cape May sits in. They knew the cash box lives behind the radiator. They left with all of it and a wristwatch.

{actor.call} was on the door. He's the only man in the room who wasn't sitting at the table, and the only one who hasn't looked you in the eye since.`,
    immediate: [money(-3000), respect(-4)],
    options: [
      {
        text: 'Make him get it back from North Wildwood. Alone.',
        effects: [op('actor', -10), health('actor', -15), then('vig_4', 2, 3, 1)],
        preview: 'If he comes back with the money, he\'s redeemed. If he comes back at all.',
      },
      {
        text: 'Strip his button. He\'s an associate again, and lucky to be anything.',
        effects: [rank('actor', 'associate'), op('actor', -30), crewOp(3), respect(3)],
        preview: 'Your other men see the price of a loose mouth. He sees it every morning.',
      },
      {
        text: 'Put him on a Greyhound to his cousin in Baltimore.',
        effects: [leave('actor', 'exile'), respect(2)],
        preview: 'He is gone and everything he knows goes with him, as far as Baltimore.',
      },
      {
        text: 'Take it back out of Kessler\'s own till, with interest.',
        gate: { trait: 'Vengeful' },
        effects: [money(4000), rivRes('kessler', { money: -4000 }), heat('local', 10), rivOp('kessler', -25), respect(8), then('vig_4', 1, 2, 1)],
        preview: 'Even, plus a thousand. Danny Kessler is a proud man with a long memory.',
      },
    ],
  },
  {
    id: 'vig_4',
    category: 'table',
    chain: { id: 'vig', part: 4 },
    trigger: { chainOnly: true, rivalAlive: 'kessler' },
    roles: { shylock: carried('the shylock'), rival: rivalBoss('kessler', 'Danny Kessler, North Wildwood club owner') },
    title: 'Eggs at Three in the Morning',
    body: `{rival.name} picks a diner on New Jersey Avenue, the kind with a pie case that rotates. He is younger than you, Irish, freckled, and eats his eggs like a man who grew up with four brothers. {shylock.name} sits at the counter with his back to you, which is either respect or the opposite.

"Your man borrowed," Kessler says. "My man lent. Somewhere in there it became your problem and mine. I'd like it to stop being anybody's problem before August, because August is when I make my money."`,
    options: [
      {
        text: 'Split the difference. Courtesy for courtesy.',
        effects: [money(-1500), rivOp('kessler', 15), respect(-2)],
        preview: 'Peace on the island. Some of your men will call it paying tribute to an Irishman.',
      },
      {
        text: 'Hughie stays north of 26th Street from now on. That is the price.',
        effects: [respect(8), rivOp('kessler', -10), infl('north', 3)],
        preview: 'A line drawn in the sand. Kessler will test it.',
      },
      {
        text: 'Buy Hughie\'s whole book. Every Wildwood marker he holds.',
        gate: { money: 5000 },
        effects: [money(-5000), biz('add', 'loansharking', 'north'), rivOp('kessler', 5), respect(5), infl('north', 4)],
        preview: 'His customers become your customers. Kessler gets cash and a smaller footprint.',
      },
    ],
  },

  /* ================================================================ */
  /* 3. INK                                                            */
  /* ================================================================ */
  {
    id: 'ink_1',
    category: 'law',
    chain: { id: 'ink', part: 1 },
    trigger: { minWeek: 6, heatAbove: { local: 30 }, once: true, weight: 12 },
    roles: {
      reporter: townie('a reporter from the Philadelphia Inquirer', { first: 'Margaret', last: 'Donnelly', nickname: 'Peg', gender: 'F', ethnicity: 'Irish', age: [29, 36], traits: ['Honest', 'Patient'] }),
    },
    title: 'A Lady From North Broad Street',
    body: `She orders a Tom Collins at the Ivanhoe and asks the bartender who owns the jukeboxes. Then the cigarette machines. Then the building. She writes the answers in a steno pad and sharpens her pencil with a penknife.

Her name is {reporter.name}. Everybody calls her {reporter.nickname}. She works for the Philadelphia Inquirer, she drove down in a Plymouth with a cracked windshield, and she is staying at a rooming house in the Crest under her own name, which tells you she isn't afraid of anybody yet.

She leaves a card with the bartender: For Mr. {player.last}, when he's ready to talk about the vending business.`,
    options: [
      {
        text: 'Take her to lunch. Bore her to death with cigarette machine margins.',
        effects: [op('reporter', 10), heat('local', -2), stress(2), then('ink_2', 3, 5, 0.7)],
        preview: 'She\'ll like you. Reporters who like you write longer stories.',
      },
      {
        text: 'Ignore her. The Inquirer forgets the shore by Labor Day.',
        effects: [then('ink_2', 2, 4, 1)],
        preview: 'She writes about you anyway, just without your side of it.',
      },
      {
        text: 'Have a friendly cop ticket her Plymouth every morning.',
        effects: [heat('local', 3), op('reporter', -20), flag('ink_harassed'), then('ink_2', 2, 3, 1)],
        preview: 'She keeps the tickets. Reporters photograph things like that.',
      },
      {
        text: 'Point her at Carmine Manno. Strictly as a concerned citizen.',
        effects: [rivRes('manno', { exposure: 10 }), op('reporter', 5), flag('ink_fed_manno'), then('ink_2', 3, 6, 0.6)],
        preview: 'Aims her north. A good reporter always asks who gave her the tip.',
      },
    ],
  },
  {
    id: 'ink_2',
    category: 'law',
    chain: { id: 'ink', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      reporter: carried('the reporter'),
      front: crewRole('your front man, a clean civilian with no record', { rank: 'associate' }),
      clerk: official('the deputy clerk at the county courthouse, on your payroll', 'deputy county clerk', { first: 'Walt', last: 'Harrigan', ethnicity: 'Irish', age: [50, 64], traits: ['Cowardly'] }),
    },
    title: 'The Deed Room at Cape May Court House',
    body: `{clerk.name} calls from a pay phone, which he never does. The Inquirer woman has spent two days in the deed room at the county courthouse, in white cotton gloves, copying by hand. Three of your properties lead back to {front.name}. One of them leads back to a lawyer who once represented your father.

"She asked me if I liked fishing," {clerk.first} says. "I don't fish. Why would she ask me that?"`,
    options: [
      {
        text: 'Have the lawyer move the deeds into a Delaware corporation.',
        gate: { money: 3000 },
        effects: [money(-3000), evidence('player', -5), then('ink_3', 3, 5, 0.7)],
        preview: 'Expensive paper walls. She may already have copied what she needs.',
      },
      {
        text: 'Ask {clerk.first} to misfile a ledger for a few months.',
        effects: [heat('local', 5), evidence('player', -3), hook('clerk', 'He hid a county ledger for you', true), flag('ink_clerk'), then('ink_3', 2, 4, 1)],
        preview: 'If she notices the missing book, the missing book becomes the story.',
      },
      {
        text: 'Let her copy. Deeds are not crimes.',
        effects: [evidence('front', 10), op('front', -8), then('ink_3', 2, 4, 1)],
        preview: 'Nothing illegal on paper. {front.first} sees his own name in it, and sweats.',
      },
    ],
  },
  {
    id: 'ink_3',
    category: 'law',
    chain: { id: 'ink', part: 3 },
    trigger: { chainOnly: true },
    roles: { reporter: carried('the reporter') },
    title: 'Who Owns the Shore?',
    body: `Sunday's Inquirer. Front of the second section, above the fold, with a photograph of the Ivanhoe's awning and a sidebar map of Pacific Avenue with little black squares on it. "Who Owns the Shore?" by {reporter.name}.

You are not named. You are "a Wildwood businessman whose associates have been described by the State Police as members of a South Jersey crime syndicate." Your mother cut the article out anyway and put it on the refrigerator under a magnet shaped like a lobster. She does not understand it as an insult.`,
    immediate: [heat('local', 8), heat('federal', 3)],
    options: [
      {
        text: 'Have your lawyer threaten a libel suit on heavy letterhead.',
        gate: { money: 2500 },
        effects: [money(-2500), heat('local', -3), op('reporter', -10), then('ink_4', 2, 4, 1)],
        preview: 'Editors hate lawsuits. Reporters love them; they make sequels.',
      },
      {
        text: 'Buy the Boardwalk merchants a Labor Day ad in every shore paper.',
        effects: [money(-1500), respect(3), heat('local', -5), then('ink_4', 3, 5, 1)],
        preview: 'Look like a civic booster. It works on everyone but her.',
      },
      {
        text: 'Nobody says anything to anybody. Not a word.',
        effects: [crewOp(4), heat('federal', 2), then('ink_4', 2, 4, 1)],
        preview: 'Your men respect the silence. The FBI subscribes to the Inquirer too.',
      },
      {
        text: 'Call the Inquirer city desk yourself and give her a piece of your mind.',
        gate: { trait: 'Hot-headed' },
        effects: [heat('local', 6), respect(4), op('reporter', 6), then('ink_4', 1, 3, 1)],
        preview: 'You give her a quote. She will frame it.',
      },
    ],
  },
  {
    id: 'ink_4',
    category: 'law',
    chain: { id: 'ink', part: 4 },
    trigger: { chainOnly: true },
    roles: { reporter: carried('the reporter'), rival: rivalBoss('manno', 'Carmine "The Fist" Manno') },
    title: 'Off the Record, End of the Pier',
    body: `She asks to meet at the end of Hunt's Pier at closing, when the rides are dark and the gulls own the planks. She has her hands in her coat pockets and no notebook.

"My editor wants part two about you. Honestly, you're not that interesting." She lights a cigarette on the third match. "There's a rooming house in town where kids who come down for summer jobs hand over their pay and never see it again. And there's a story about what {rival.name} is moving through the bay. Either of those is a better story than you. I need a source on one of them."`,
    options: [
      {
        text: 'Tell her about the rooming house. Names, addresses, the man who holds the bus tickets.',
        effects: [under('exposure', 25), op('reporter', 15), flag('ink_source'), flag('ink_gave_under'), then('ink_5', 3, 5, 1)],
        preview: 'She writes about a real villain. You become a source, and sources get subpoenaed.',
      },
      {
        text: 'Give her Manno. What comes in at the bay docks, and on which nights.',
        effects: [rivRes('manno', { exposure: 25 }), rivOp('manno', -10), flag('ink_source'), flag('ink_gave_manno'), then('ink_5', 3, 5, 1)],
        preview: 'Atlantic City gets the front page. Manno will wonder who talked.',
      },
      {
        text: 'Give her nothing. You are a vending machine man.',
        effects: [respect(3), crewOp(3), then('ink_5b', 3, 5, 1)],
        preview: 'Omertà holds. So does her editor\'s interest in you.',
      },
      {
        text: 'Offer her more money than the Inquirer pays in a year.',
        gate: { trait: 'Greedy' },
        effects: [op('reporter', -30), heat('local', 5), evidence('player', 5), then('ink_5b', 2, 4, 1)],
        preview: 'Some reporters can be bought. She writes down the figure you offered.',
      },
    ],
  },
  {
    id: 'ink_5',
    category: 'law',
    chain: { id: 'ink', part: 5 },
    trigger: { chainOnly: true, flag: 'ink_source' },
    roles: { reporter: carried('the reporter') },
    title: 'Part Two',
    body: `Part two runs across the top of the Sunday front page, and your name is nowhere in it. The prosecutor gives a statement on the courthouse steps about protecting the young people of Cape May County. The Herald runs his picture three columns wide.

A week later a postcard arrives at the Ivanhoe, addressed to you: a tinted view of City Hall in Philadelphia. On the back, in pencil: "Thanks for the vending tips. P.D." Your consigliere holds it by the edges like it's radioactive.`,
    immediate: [heat('local', -6)],
    options: [
      {
        text: 'Keep the line open. A reporter is a weapon that fires both ways.',
        effects: [flag('reporter_contact'), heat('federal', 4), op('reporter', 10)],
        preview: 'Future rivals get her attention. She also has your private number now.',
      },
      {
        text: 'Burn the postcard. Never take her call again.',
        effects: [op('reporter', -5), heat('local', -4), stress(-4)],
        preview: 'Safer. And the next time you need a headline aimed elsewhere, it won\'t be there.',
      },
      {
        text: 'Ask her for one name in return: who at the courthouse talks to the prosecutor.',
        effects: [op('reporter', -15), flag('know_courthouse_leak'), evidence('player', -6)],
        preview: 'She gives it, once. A reporter who feels used remembers.',
      },
    ],
  },
  {
    id: 'ink_5b',
    category: 'law',
    chain: { id: 'ink', part: 5 },
    trigger: { chainOnly: true },
    roles: { reporter: carried('the reporter'), prosecutor: rivalBoss('law', 'the Cape May County Prosecutor') },
    title: 'Part Two: The House on Pacific',
    body: `Part two is about you. Your father's arrest in 1934, which you had forgotten was public. The vending routes. The motel your wife's cousin owns on paper. A photograph of you at the Ivanhoe, laughing, with a glass in your hand, which is the photograph you will see in every newspaper for the rest of your life.

By Tuesday {prosecutor.name} has announced that his office is "reviewing the Inquirer's findings with great interest." Your children's teachers have read it. So has Philadelphia.`,
    immediate: [heat('local', 10), heat('federal', 6), heat('family', 4)],
    options: [
      {
        text: 'Take the family to Florida for a month. Let it blow over.',
        gate: { money: 2000 },
        effects: [money(-2000), respect(-5), heat('local', -8), famOp(5)],
        preview: 'Out of sight. Also out of the room while your capos run things.',
      },
      {
        text: 'Show up at the Little League field you sponsor, every game, in a short-sleeved shirt.',
        effects: [money(-800), respect(3), heat('local', -4), famOp(3)],
        preview: 'Respectable businessman. Some voters buy it. The prosecutor doesn\'t.',
      },
      {
        text: 'Newspapers wrap fish by Thursday. Wait.',
        gate: { trait: 'Patient' },
        effects: [heat('local', -3), stress(-6)],
        preview: 'Nothing done, nothing to report. Nerves of a man who has seen worse.',
      },
    ],
  },

  /* ================================================================ */
  /* 4. THE GARGANO BOY                                                */
  /* ================================================================ */
  {
    id: 'garg_1',
    category: 'crew',
    chain: { id: 'gargano', part: 1 },
    trigger: { minWeek: 10, once: true, weight: 10 },
    roles: {
      kid: townie('a widow\'s son, 19, who works a ride on the pier', { first: 'Joey', last: 'Gargano', gender: 'M', ethnicity: 'Italian', age: [19, 20], traits: ['Vengeful', 'Hot-headed'] }),
      driver: crewRole('an older soldier who drove the car that night', { rank: 'soldier' }),
    },
    title: 'The Boy Who Runs the Whip',
    body: `Tommy Gargano ran numbers for your father and skimmed for himself, and on the last night of September 1956 {driver.call} drove him out to the jetty at Hereford Inlet. Tommy did not drive back. You were the one who said yes.

His boy {kid.first} was eleven. Now he is nineteen and runs the Whip on the pier, and on his nights off he buys beers for old men at the Anchor Bar and asks who drove his father home that night. He has his father's eyebrows and his mother's patience, which is to say none at all.`,
    options: [
      {
        text: 'Give him a job. Keep him where you can see him.',
        effects: [recruit('kid', 'associate'), op('kid', 10), flag('garg_close'), then('garg_2', 4, 8, 0.6)],
        preview: 'Your enemy on your payroll. He also learns where you park.',
      },
      {
        text: 'Send his mother an envelope every month. A "pension from the club."',
        effects: [money(-1500), then('garg_2', 4, 7, 0.8)],
        preview: 'His mother is grateful. Sons are rarely grateful for the same things.',
      },
      {
        text: 'Have {driver.first} have a word with him. A friendly word.',
        effects: [op('kid', -20), heat('local', 2), then('garg_2', 2, 4, 1)],
        preview: 'Fear works on most nineteen-year-olds. Most.',
      },
    ],
  },
  {
    id: 'garg_2',
    category: 'crew',
    chain: { id: 'gargano', part: 2 },
    trigger: { chainOnly: true },
    roles: { kid: carried('the Gargano boy'), driver: carried('the soldier who drove') },
    title: 'Rio Grande Pawn & Loan',
    body: `The pawnbroker on Rio Grande Avenue is one of yours, and he calls before he's even hung up the CLOSED sign. The Gargano boy came in with forty dollars from his ride wages, in ones, and walked out with a .38 somebody hocked in 1951.

{driver.call} is already at your door with his hat on. "Let me handle it," he says. "Before it handles me." He doesn't say what handling means. He doesn't have to.`,
    options: [
      {
        text: 'Buy the gun back through the pawnbroker. Nobody on the island sells him another.',
        effects: [money(-100), op('kid', -5), then('garg_3', 2, 4, 1)],
        preview: 'He\'ll find another in another town. It buys you a few weeks.',
      },
      {
        text: 'Let {driver.first} scare him. Scare him, nothing more.',
        effects: [health('kid', -15), heat('local', 4), op('kid', -30), op('driver', 10), then('garg_3', 2, 4, 1)],
        preview: 'A boy with bruises and a gun is not a calmer boy.',
      },
      {
        text: 'Nobody touches that kid. That is an order.',
        effects: [op('driver', -15), stress(5), flag('garg_protected'), then('garg_3', 2, 4, 1)],
        preview: '{driver.first} sleeps with the light on now. So do you.',
      },
    ],
  },
  {
    id: 'garg_3',
    category: 'church',
    chain: { id: 'gargano', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      kid: carried('the Gargano boy'),
      widow: townie('Tommy Gargano\'s widow', { first: 'Rose', last: 'Gargano', gender: 'F', ethnicity: 'Italian', age: [42, 52], traits: ['Pious'] }),
    },
    title: 'Seven O\'Clock Mass on a Tuesday',
    body: `Nobody goes to seven o'clock Mass on a Tuesday. You go because it's quiet. {widow.name} knows that, which is why she kneels in the pew directly behind yours.

She doesn't turn your head and she doesn't raise her voice. She knew in 1956, she says. She has kept her mouth shut ever since, because she had a boy to raise. Now the boy is raised and he wants to die like his father. Her sister in Scranton has a spare room. Moving costs money. Or she has the prosecutor's office number written inside her missal.

The priest rings the bell for the consecration. She crosses herself and waits.`,
    options: [
      {
        text: 'Pay for Scranton. A truck, a year\'s rent, a job at the sister\'s husband\'s garage.',
        gate: { money: 3000 },
        effects: [money(-3000), leave('kid', 'exile'), op('widow', 20), flag('garg_scranton'), then('garg_4', 30, 50, 0.3)],
        preview: 'He goes. Sons sometimes come back.',
      },
      {
        text: 'Tell her what happened to Tommy was business, and leave before the blessing.',
        effects: [respect(3), op('widow', -40), evidence('player', 6), then('garg_4', 2, 3, 1)],
        preview: 'Hard. Correct, in this life. She keeps the prosecutor\'s number.',
      },
      {
        text: 'Turn around and tell her the truth: it was your word, and you are sorry.',
        effects: [op('widow', 15), evidence('player', 8), stress(-15), then('garg_4', 2, 3, 1)],
        preview: 'The first honest thing you\'ve said in a church in years. Now she owns it.',
      },
    ],
  },
  {
    id: 'garg_4',
    category: 'boardwalk',
    chain: { id: 'gargano', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { kid: carried('the Gargano boy'), driver: carried('the soldier who drove'), widow: carried('the widow') },
    title: 'The Last Tram Car',
    body: `Midnight on the Boardwalk. The last tram car of the night rolls past with its recorded warning playing to nobody. The stands are shuttered, the pier lights are off, and the ocean is loud.

{kid.first} Gargano is waiting at the rail by the Convention Hall with one hand in his jacket. {driver.call} is ten steps behind you, and his hand is in his jacket too. The boy looks at {driver.first}, then at you. "Which one of you," he says. It isn't a question anymore.`,
    options: [
      {
        text: 'Walk up to him slowly. Talk.',
        gate: { trait: 'Charming' },
        effects: [op('kid', 30), op('widow', 20), respect(5), stress(-10), flag('garg_peace')],
        preview: 'You find the words. The gun goes off the rail into the surf. He will never be your friend, but he\'ll live.',
      },
      {
        text: 'Step to one side. Let him have {driver.first}.',
        effects: [leave('driver', 'dies'), op('kid', 20), crewOp(-15), heat('local', 8), respect(-5), stress(10)],
        preview: 'A kind of justice. Every man in your crew learns you will trade one of them.',
      },
      {
        text: 'Nod to {driver.first}.',
        effects: [leave('kid', 'dies'), heat('local', 12), heat('federal', 4), famOp(-10), stress(20), op('widow', -100), respect(5), evidence('player', 6)],
        preview: 'The surf takes a second Gargano. Rose will not be quiet this time.',
      },
      {
        text: 'Wave over the beat cop and let him find the gun.',
        effects: [prison('kid', 26), heat('local', 2), op('kid', -40), op('widow', -20), respect(-3)],
        preview: 'Six months in county. He\'ll be twenty when he gets out, and angrier.',
      },
    ],
  },

  /* ================================================================ */
  /* 5. ASH WEDNESDAY, 1962                                            */
  /* ================================================================ */
  {
    id: 'ash_1',
    category: 'history',
    chain: { id: 'ash_wednesday', part: 1 },
    trigger: { between: { from: { y: 1962, m: 3 }, to: { y: 1962, m: 3 } }, once: true, mandatory: true },
    roles: { actor: crewRole('your most capable capo', { rank: 'capo' }) },
    title: 'Five High Tides',
    body: `The storm parks off the coast on Ash Wednesday and will not leave. The radio calls it a nor'easter. The old men at the firehouse say they have never seen one like it, and they are not men who exaggerate weather.

The ocean comes over the Boardwalk at high tide, drains back, and comes again: five tides in two days. Water on Pacific Avenue to the hubcaps, then the door handles. A porch from somewhere in the Crest drifts down Atlantic Avenue with a rocking chair still on it. Half the island has no lights. {actor.call} is on the phone from the Ivanhoe, shouting over the wind: what do you want done?`,
    options: [
      {
        text: 'Open the Ivanhoe\'s upstairs to anybody who needs a dry floor. Feed them.',
        effects: [money(-2000), respect(12), crewOp(5), heat('local', -6), then('ash_2', 3, 4, 1)],
        preview: 'Costs money and a carpet. The island remembers who opened the doors.',
      },
      {
        text: 'Every man with sandbags, at our own places. Save what\'s ours.',
        effects: [money(2500), respect(-5), then('ash_2', 3, 4, 1)],
        preview: 'Your businesses come through. People notice whose men weren\'t on their street.',
      },
      {
        text: 'Take the boats out of Otten\'s Harbor and get families off the low streets.',
        effects: [health('actor', -10), respect(15), heat('local', -10), op('actor', 8), stress(6), then('ash_2', 3, 4, 1)],
        preview: 'Risky in that surf. The Herald will run a photograph of your capo carrying somebody\'s grandmother.',
      },
      {
        text: 'Half these stores won\'t reopen anyway. Their stock is floating.',
        gate: { trait: 'Greedy' },
        effects: [money(2500), respect(-12), heat('local', 6), famOp(-5), then('ash_2', 3, 4, 1)],
        preview: 'Free merchandise. Wildwood is a small town with a long memory.',
      },
    ],
  },
  {
    id: 'ash_2',
    category: 'politics',
    chain: { id: 'ash_wednesday', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      commish: official('a Wildwood city commissioner', 'city commissioner', { first: 'Eddie', last: 'Fanucci', ethnicity: 'Italian', age: [48, 62], traits: ['Greedy', 'Charming'] }),
    },
    title: 'Rebuilding Money',
    body: `The Army Corps of Engineers is here, the Governor came down and frowned at the sand in the streets, and Washington has declared a disaster. That means money: for the Boardwalk, the bulkheads, the streets, the sewer pipes the ocean pulled up like shoelaces.

Commissioner {commish.name} sits in your kitchen in hip waders with a coffee. "Somebody's gonna get the lumber contract, somebody's gonna get the hauling. Could be friends. Could be some outfit from Trenton with a nice brochure." He drinks. "I'm just saying friends are better."`,
    options: [
      {
        text: 'Bid through your front man\'s construction company. Honestly. More or less.',
        effects: [biz('add', 'construction', 'boardwalk'), money(-3000), unwashed(-2000), heat('federal', 3), then('ash_3', 2, 4, 1)],
        preview: 'A real business with real federal money in it. Federal money comes with federal auditors.',
      },
      {
        text: 'Take the contract and kick ten percent back to the Commissioner.',
        effects: [money(6000), hook('commish', 'He took a cut of disaster money', true), evidence('player', 6), heat('federal', 5), then('ash_3', 2, 4, 1)],
        preview: 'Very profitable. Disaster fraud is a federal offense with a photograph attached.',
      },
      {
        text: 'Stay out of it. Let the island rebuild clean.',
        effects: [respect(4), heat('local', -4), op('commish', -10), then('ash_3', 2, 4, 1)],
        preview: 'Clean hands, empty pockets. The Commissioner will find other friends.',
      },
    ],
  },
  {
    id: 'ash_3',
    category: 'rivals',
    chain: { id: 'ash_wednesday', part: 3 },
    trigger: { chainOnly: true, rivalAlive: 'kessler' },
    roles: { rival: rivalBoss('kessler', 'Danny Kessler'), actor: crewRole('a soldier who works the bay docks', { rank: ['soldier', 'associate'] }) },
    title: 'Salvage Rights',
    body: `{actor.call} found it in the marsh behind the bay docks when the water went down: a squat black Mosler safe, the paint stenciled with the name of one of Danny Kessler's clubs in North Wildwood. It rode the storm half a mile, which is more than some houses did.

It is sitting on a hand truck in your garage now. It is locked. It is heavy enough that there's either money in it or paperwork, and with Kessler both would be interesting.`,
    options: [
      {
        text: 'Return it to {rival.first} Kessler unopened, with a bow on it.',
        effects: [rivOp('kessler', 25), respect(5), op('actor', -5), then('ash_4', 6, 10, 1)],
        preview: 'The kind of gesture an Irishman never forgets. Your soldier thinks you\'re soft.',
      },
      {
        text: 'Call in a safecracker. What the ocean brings, the ocean gives.',
        effects: [money(6000), hook('rival', 'His ledger washed up in your garage', true), rivOp('kessler', -10), op('actor', 8), then('ash_4', 6, 10, 1)],
        preview: 'Cash and the ledger of every cop he pays. If he learns who has it, he\'ll come for it.',
      },
      {
        text: 'Deliver it to Sal Moretti. Let Philadelphia decide.',
        effects: [rivOp('philly', 12), heat('family', -6), rivOp('kessler', -15), then('ash_4', 6, 10, 1)],
        preview: 'Philadelphia gets leverage on an independent. Kessler learns you are Philly\'s errand boy.',
      },
    ],
  },
  {
    id: 'ash_4',
    category: 'season',
    chain: { id: 'ash_wednesday', part: 4 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the capo') },
    title: 'Opening Day, 1962',
    body: `They said the Boardwalk would never be ready by Memorial Day. Carpenters worked under floodlights. Soldiers who have never held a hammer learned how to hang a door. On the Saturday, the tram cars roll, the custard machines hum, and the first families come over the bridge with their windows down, staring at the new lumber.

It smells like sawdust and fried dough and the ocean pretending nothing happened. {actor.first} hands you a lemon ice and says, "Hell of a year already." It is May.`,
    options: [
      {
        text: 'Pay for the fireworks off the beach. Anonymously, which means everyone knows.',
        effects: [money(-2500), respect(10), heat('local', -5), famOp(4)],
        preview: 'The town feels like a town again. You feel like a man who owns it.',
      },
      {
        text: 'Lend the rebuilt stands their first month\'s stock, at friendly rates.',
        effects: [money(-3000), biz('add', 'loansharking', 'boardwalk'), respect(4), infl('boardwalk', 5)],
        preview: 'Half the Boardwalk owes you by July. Friendly rates have a way of becoming unfriendly.',
      },
      {
        text: 'Raise the street tax. Everyone just got federal money.',
        effects: [money(4000), respect(-6), heat('local', 4), infl('boardwalk', -3)],
        preview: 'Good money and bad timing. People remember what you did in March, and what you did in May.',
      },
    ],
  },
];

