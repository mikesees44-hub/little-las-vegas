import type { PackEvent } from './storyDataSchema';
import {
  biz, carried, crewOp, crewRole, evidence, famOp, famRole, favor, flag, heat, hook, infl, leave, money, official, op, respect, rivOp, rivRes, rivalBoss, rivalMan, secret, stress, thenFx as then, townie, under, unwashed,
} from './storyDataSchema';

/**
 * Chains D
 * 16. The Expressway         (exp_*)  the Atlantic City Expressway and the land around it
 * 17. Atomic Age             (dw_*)   a doo-wop motel gets built in the Crest
 * 18. Sal's Ledger           (sl_*)   Philadelphia's bagman is skimming Philadelphia
 * 19. Keough for Congress    (kc_*)   the prosecutor needs a headline before November 1962
 * 20. White Powder           (pw_*)   narcotics: the temptation Philadelphia punishes
 * 21. The House on Spicer Ave (sp_*)  the Underbelly: a rooming house that steals summer kids' wages
 */
export const CHAINS_D: PackEvent[] = [
  /* ================================================================ */
  /* 16. THE EXPRESSWAY                                                */
  /* ================================================================ */
  {
    id: 'exp_1',
    category: 'politics',
    chain: { id: 'expressway', part: 1 },
    trigger: { between: { from: { y: 1962, m: 9 }, to: { y: 1963, m: 12 } }, once: true, weight: 14 },
    roles: {
      engineer: official('a state highway engineer who drinks at the Ivanhoe', 'highway engineer', { first: 'Lowell', last: 'Pfeiffer', ethnicity: 'Irish', age: [44, 58], traits: ['Drinker'] }),
      rival: rivalBoss('manno', 'Carmine Manno'),
    },
    title: 'Surveyors in a Blueberry Field',
    body: `{engineer.name} has had four Manhattans and is drawing on a cocktail napkin. The new expressway, he says, will run from the Philadelphia bridges straight across the Pine Barrens to Atlantic City. A family from Northeast Philly will be on the Boardwalk in Atlantic City in an hour and ten minutes.

He draws Wildwood at the bottom of the napkin, small, with no line going to it. "You'll still have the Parkway," he says kindly. "Lovely road." Then he taps a spot where the new road crosses farm country. "Interchanges," he says. "Land at an interchange doubles. Triples."

Across town, {rival.name} is presumably having the same conversation, with better maps.`,
    options: [
      {
        text: 'Buy farmland near where the interchange will go. Quietly, through cousins.',
        gate: { money: 6000 },
        effects: [money(-6000), op('engineer', 5), flag('exp_land'), heat('local', 2), then('exp_2', 4, 8, 1)],
        preview: 'A gamble on a napkin. If the drunk is right, it\'s the best money you ever spent.',
      },
      {
        text: 'Sell the engineer\'s tip to Carmine Manno for cash and goodwill.',
        effects: [money(3000), rivOp('manno', 12), rivRes('manno', { money: 4000 }), then('exp_3', 30, 50, 1)],
        preview: 'Money now, peace with Atlantic City. You just helped Manno get richer.',
      },
      {
        text: 'Spend the money where it counts: billboards on the Parkway for Wildwood.',
        effects: [money(-3000), respect(4), infl('boardwalk', 4), then('exp_3', 30, 50, 1)],
        preview: 'The island fights for its tourists. Atlantic City is still an hour from Philadelphia.',
      },
    ],
  },
  {
    id: 'exp_2',
    category: 'town',
    chain: { id: 'expressway', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      farmer: townie('an old blueberry farmer who will not sell', { first: 'August', last: 'Kemper', ethnicity: 'Irish', age: [68, 80], traits: ['Honest', 'Patient'] }),
    },
    title: 'The Farmer Who Won\'t Sell',
    body: `You own four parcels. You need five. The fifth belongs to {farmer.name}, who has grown blueberries on it since Coolidge and keeps a photograph of his late wife on the tractor. He serves you lemonade on his porch and listens to every word.

"I'm going to die here," he says pleasantly. "That's my plan. You're welcome to buy it from my nephew after. He's in Cleveland. He hates blueberries."`,
    options: [
      {
        text: 'Offer three times what it\'s worth, and a life tenancy.',
        gate: { money: 5000 },
        effects: [money(-5000), op('farmer', 20), flag('exp_parcel'), then('exp_3', 20, 40, 1)],
        preview: 'He keeps his porch until the end. You own the interchange.',
      },
      {
        text: 'Make him a partner. He keeps the farm, and his heirs get a piece of the gas station.',
        gate: { trait: 'Charming' },
        effects: [op('farmer', 30), flag('exp_parcel'), money(-1500), then('exp_3', 20, 40, 1)],
        preview: 'Fair to everyone. The nephew in Cleveland will be very surprised someday.',
      },
      {
        text: 'Thank him for the lemonade. Four parcels will have to do.',
        effects: [respect(1), stress(-3), then('exp_3', 20, 40, 1)],
        preview: 'Good land, not great land. Some things you don\'t push.',
      },
    ],
  },
  {
    id: 'exp_3',
    category: 'history',
    chain: { id: 'expressway', part: 3 },
    trigger: { chainOnly: true },
    roles: { rival: rivalBoss('manno', 'Carmine Manno') },
    title: 'An Hour From Philadelphia',
    body: `The Atlantic City Expressway opens in sections, and the ribbon-cutting photographs show men in hats squinting at asphalt. On the first warm weekend, the traffic count on the Parkway to Wildwood is down. Atlantic City's isn't.

{rival.name} throws a party at a club on the AC Boardwalk to celebrate, and sends you an invitation embossed in gold. On the back, in pen: "Come see what an hour from Philadelphia looks like."`,
    immediate: [rivRes('manno', { money: 6000 })],
    options: [
      {
        text: 'Sell your interchange land at the top. Take the money and run.',
        gate: { flag: 'exp_land' },
        effects: [money(16000), unwashed(-4000), respect(3)],
        preview: 'The best deal you will ever make. The Boardwalk would have liked that money spent on it.',
      },
      {
        text: 'Build on it: a gas station, a diner, a motel. Catch them before Atlantic City does.',
        gate: { flag: 'exp_land' },
        effects: [money(-3000), biz('add', 'motel', 'causeway'), biz('add', 'restaurant', 'causeway'), infl('causeway', 6)],
        preview: 'Long money. Everyone driving to the shore stops at your pumps.',
      },
      {
        text: 'Go to Manno\'s party. Smile. Count his men.',
        effects: [rivOp('manno', 8), respect(-2), flag('counted_manno')],
        preview: 'Know your enemy. Your enemy is also counting yours.',
      },
      {
        text: 'Make Wildwood the place families go: cheaper rooms, free fireworks, kids eat free.',
        effects: [money(-4000), respect(6), infl('boardwalk', 5), heat('local', -3)],
        preview: 'Atlantic City gets the gamblers. Wildwood keeps the families who come every year.',
      },
    ],
  },

  /* ================================================================ */
  /* 17. ATOMIC AGE                                                    */
  /* ================================================================ */
  {
    id: 'dw_1',
    category: 'town',
    chain: { id: 'atomic_age', part: 1 },
    trigger: { season: 'offseason', minWeek: 18, once: true, weight: 12, district: 'crest' },
    roles: {
      builder: townie('a builder with big ideas', { first: 'Lou', last: 'Petrakis', age: [36, 46], traits: ['Ambitious', 'Charming'] }),
    },
    title: 'A Rocket on Ocean Avenue',
    body: `{builder.name} unrolls a drawing on your kitchen table and holds the corners down with your sugar bowl and your wife's ashtray. It's a motel. Two stories, a boomerang roof, turquoise doors, a kidney-shaped pool and, on a steel pylon forty feet high, a neon rocket ship that flashes VACANCY like it's counting down to launch.

"The Crest is full of motels that look like your aunt's living room," Lou says. "Families want the future. They want Cape Canaveral with a shuffleboard court." The bank in Cape May laughed him out of the lobby. He has the land, the drawings, and nothing else.`,
    options: [
      {
        text: 'Finance it. You own forty percent of the future.',
        gate: { money: 8000 },
        effects: [money(-8000), unwashed(-5000), op('builder', 25), flag('dw_partner'), then('dw_2', 6, 10, 1)],
        preview: 'Clean, beautiful, legitimate, and a perfect place to wash money.',
      },
      {
        text: 'Lend it at loanshark rates. You\'re a businessman, not a patron.',
        effects: [money(-6000), op('builder', -5), flag('dw_lender'), then('dw_2', 6, 10, 1)],
        preview: 'Better returns, and if he fails you own a half-built rocket.',
      },
      {
        text: 'Pass. Rocket ships are a fad.',
        effects: [op('builder', -10)],
        preview: 'Somebody else finances it. Maybe Feldstein. Maybe it\'s a fad.',
      },
    ],
  },
  {
    id: 'dw_2',
    category: 'rivals',
    chain: { id: 'atomic_age', part: 2 },
    trigger: { chainOnly: true },
    roles: { builder: carried('the builder'), rival: rivalBoss('manno', 'Carmine Manno') },
    title: 'Concrete',
    body: `The foundation forms are built, the rebar is laid, and the cement trucks aren't coming. The ready-mix plant on the mainland says there's a scheduling problem. The scheduling problem is that the plant belongs to a cousin of {rival.name}, who has heard whose money is in the rocket motel.

{builder.first} hasn't slept in a week. He's standing in an empty foundation in the rain, looking up at the steel pylon where the rocket will go, like a man watching a ship that may never leave port.`,
    options: [
      {
        text: 'Pay Manno\'s cousin his "scheduling fee."',
        effects: [money(-2500), rivOp('manno', 8), respect(-4), then('dw_3', 8, 12, 1)],
        preview: 'The trucks come Monday. Manno now has a toll booth on everything you build.',
      },
      {
        text: 'Bring in a crew from Philadelphia through Sal\'s union friends.',
        effects: [money(-3000), rivOp('philly', 6), heat('family', 3), rivOp('manno', -8), then('dw_3', 8, 12, 1)],
        preview: 'Philadelphia\'s trucks, Philadelphia\'s favor. Nothing from Philadelphia is free.',
      },
      {
        text: 'Barge it in from Delaware across the bay. Absurd, expensive, and nobody owns the ocean.',
        gate: { trait: 'Ambitious' },
        effects: [money(-4500), respect(8), rivOp('manno', -5), then('dw_3', 8, 12, 1)],
        preview: 'The whole island comes to watch a cement barge dock at the bay. You become a legend.',
      },
    ],
  },
  {
    id: 'dw_3',
    category: 'season',
    chain: { id: 'atomic_age', part: 3 },
    trigger: { chainOnly: true },
    roles: { builder: carried('the builder'), mother: famRole('your mother', 'mother') },
    title: 'Countdown to Vacancy',
    body: `On a warm night in May, {builder.first} flips a switch, and forty feet above Ocean Avenue a neon rocket ship flickers, sputters, and blazes pink and turquoise into the sky. A crowd of fifty people on the sidewalk applauds. A little boy in a Davy Crockett hat salutes.

The pool has water in it. The plastic palm trees are a little too green. The rooms are booked through August. {builder.first} has tears in his eyes. He wants you to name it. "Your money," he says. "Your name. Your call."`,
    options: [
      {
        text: 'Name it after your mother, {mother.first}.',
        effects: [biz('add', 'motel', 'crest'), op('mother', 30), famOp(8), respect(2)],
        preview: 'The {mother.first} Motor Inn. Your mother tells everyone at church. Everyone.',
      },
      {
        text: 'Something space age. The Satellite. The Orbiter. The Starliner.',
        effects: [biz('add', 'motel', 'crest'), money(1500), infl('crest', 5)],
        preview: 'Families love it. It\'ll be on postcards for fifty years.',
      },
      {
        text: 'Let Lou name it. It\'s his dream. You just paid for it.',
        effects: [biz('add', 'motel', 'crest'), op('builder', 30), heat('local', -3)],
        preview: 'Nobody connects your name to it. That\'s worth more than a sign.',
      },
    ],
  },

  /* ================================================================ */
  /* 18. SAL'S LEDGER                                                  */
  /* ================================================================ */
  {
    id: 'sl_1',
    category: 'table',
    chain: { id: 'sals_ledger', part: 1 },
    trigger: { minWeek: 16, once: true, weight: 12 },
    roles: { sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'The Second Envelope',
    body: `{sal.name} comes down himself this month instead of sending the bagman, and asks for a walk on the beach. In February. In his overcoat and good shoes, with sand getting in them.

He wants your tribute in two envelopes from now on. The fat one goes to Philadelphia as always. The thin one comes to him, for "expenses." The total stays the same, he explains. Philadelphia just doesn't need to know exactly what the total is.

He's skimming the people above him. And he just told you so, on a beach, where nobody can hear, which means he trusts you or he thinks you're too small to matter.`,
    options: [
      {
        text: 'Two envelopes. What Sal does with them is Sal\'s business.',
        effects: [hook('sal', 'He is skimming Philadelphia through you', true), rivOp('philly', 10), heat('family', 4), then('sl_2', 6, 10, 1)],
        preview: 'Sal owes you. If Philadelphia finds out, you were the one holding the second envelope.',
      },
      {
        text: 'One envelope. You don\'t want to know about expenses.',
        effects: [op('sal', -15), heat('family', -2), then('sl_2', 6, 10, 0.7)],
        preview: 'Clean hands. Sal never forgets a man who said no.',
      },
      {
        text: 'Say yes, and keep careful notes. For later.',
        gate: { trait: 'Paranoid' },
        effects: [hook('sal', 'You have his skim in writing', true), stress(4), flag('sl_notes'), then('sl_2', 6, 10, 1)],
        preview: 'Insurance. Notebooks are also evidence, and not only for you.',
      },
    ],
  },
  {
    id: 'sl_2',
    category: 'table',
    chain: { id: 'sals_ledger', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      sal: carried('Sal Moretti'),
      uncle: rivalMan('philly', 'an old Philadelphia consigliere sent to ask questions', { first: 'Nunzio', last: 'Pace', nickname: 'Uncle Nunzio', ethnicity: 'Italian', age: [68, 78], traits: ['Patient'] }),
    },
    title: 'A Man From Christian Street',
    body: `{uncle.name}, whom everyone calls {uncle.nickname}, is seventy-something and walks with a cane he doesn't need. He sits on your porch and eats your wife's anisette cookies and talks about the 1920s for an hour. Then, at the end, tapping the cane on your steps like a judge:

"How much does the shore send us every month, son? Round numbers." He smiles. "Philadelphia has a feeling the numbers are smaller than the shore."`,
    options: [
      {
        text: 'Tell him the real number. Every dollar.',
        effects: [rivOp('philly', 15), heat('family', -8), op('sal', -50), flag('sl_told'), then('sl_4', 3, 6, 1)],
        preview: 'Philadelphia respects honesty. Sal will know exactly who told.',
      },
      {
        text: 'Give him the number Sal reports. Cover for Sal.',
        effects: [op('sal', 20), heat('family', 6), stress(8), flag('sl_covered'), then('sl_3', 3, 6, 1)],
        preview: 'Loyal to the man you know. A lie to the men above him.',
      },
      {
        text: 'Tell him numbers are a matter for Sal, and offer more cookies.',
        gate: { trait: 'Charming' },
        effects: [heat('family', 2), op('uncle', 5), then('sl_3', 3, 6, 1)],
        preview: 'Neither yes nor no. Old men in Philadelphia have heard this tune before.',
      },
    ],
  },
  {
    id: 'sl_3',
    category: 'rivals',
    chain: { id: 'sals_ledger', part: 3 },
    trigger: { chainOnly: true },
    roles: { sal: carried('Sal Moretti') },
    title: 'Sal Comes to the Shore',
    body: `Sal arrives after midnight with a suitcase and no driver. He is sweating in December. He sits in your kitchen with his hat on and doesn't eat anything, which is how you know it's bad.

"Forty thousand," he says. "In there. Philadelphia is looking. I need somebody to hold it who nobody would think of. Six months." He looks at you. "You're a good earner. You're a good man. You're also nobody, if you'll forgive me, which right now is the best thing a man can be."`,
    options: [
      {
        text: 'Put it in your safe. You never saw it.',
        effects: [hook('sal', 'You hid his money from Philadelphia', true), heat('family', 10), stress(10), then('sl_4', 4, 8, 1)],
        preview: 'Sal\'s life is in your basement. So is a motive for Philadelphia to visit.',
      },
      {
        text: 'Take it to Philadelphia yourself, tonight.',
        effects: [rivOp('philly', 20), heat('family', -10), op('sal', -80), flag('sl_told'), then('sl_4', 2, 4, 1)],
        preview: 'The right thing by the rules. You may be the last friend Sal ever had.',
      },
      {
        text: 'Hold it for a fee. Ten percent, up front.',
        gate: { trait: 'Greedy' },
        effects: [money(4000), heat('family', 12), op('sal', -10), hook('sal', 'You hid his money from Philadelphia', true), then('sl_4', 4, 8, 1)],
        preview: 'Even in a crisis you get paid. Sal won\'t forget the fee.',
      },
    ],
  },
  {
    id: 'sl_4',
    category: 'table',
    chain: { id: 'sals_ledger', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { sal: carried('Sal Moretti') },
    title: 'Changing of the Bag',
    body: `Word comes down from Philadelphia in a single sentence carried by a cousin: Sal Moretti has retired to Florida for his health. Nobody says which Florida. Nobody says which health.

Next week a new man comes to collect. He's younger, quieter, and he counts the envelope twice in front of you, slowly, licking his thumb. When he's finished he says the number should be higher, and that he's heard you're a man who knows how to keep secrets. He doesn't say whether that's a compliment.`,
    immediate: [leave('sal', 'retires')],
    options: [
      {
        text: 'Pay the higher number. Start fresh.',
        effects: [money(-2000), heat('family', -8), rivOp('philly', 10)],
        preview: 'The new man is happy. Your envelope is fatter forever.',
      },
      {
        text: 'Hand the new man Sal\'s money from your basement, every dollar.',
        gate: { flag: 'sl_covered' },
        effects: [rivOp('philly', 25), heat('family', -12), respect(4), stress(-8)],
        preview: 'You were Sal\'s friend and Philadelphia\'s man, in that order, then the other order.',
      },
      {
        text: 'Pay the old number and look him in the eye.',
        gate: { respect: 50 },
        effects: [respect(6), heat('family', 6), rivOp('philly', -8)],
        preview: 'A test of the new man. He\'s testing you too.',
      },
    ],
  },

  /* ================================================================ */
  /* 19. KEOUGH FOR CONGRESS                                           */
  /* ================================================================ */
  {
    id: 'kc_1',
    category: 'politics',
    chain: { id: 'keough_congress', part: 1 },
    trigger: { between: { from: { y: 1962, m: 4 }, to: { y: 1962, m: 7 } }, once: true, weight: 30 },
    roles: {
      prosecutor: rivalBoss('law', 'the Cape May County Prosecutor'),
      aide: official('the prosecutor\'s campaign aide', 'campaign aide', { first: 'Brendan', last: 'Lally', ethnicity: 'Irish', age: [28, 36], traits: ['Ambitious'] }),
    },
    title: 'The Headline Man',
    body: `{prosecutor.name} announces for Congress on the steps of the county courthouse, with his wife in a hat and his children squinting. He promises to bring "the war on organized crime" to Washington. He needs a big case before November to prove he means it.

Two days later {aide.name}, his campaign aide, finds you at the counter of a diner in Cape May and orders the same thing you're having. "The prosecutor isn't greedy about whose case it is," the aide says, studying the menu. "He just needs one. A big one. By October."`,
    options: [
      {
        text: 'Give them the rooming house on Spicer Avenue. A real villain.',
        effects: [under('exposure', 20), heat('local', -8), op('aide', 15), flag('kc_gave_under'), then('kc_2', 6, 10, 1)],
        preview: 'The prosecutor gets a righteous headline. You become a man he owes.',
      },
      {
        text: 'Give them Carmine Manno\'s card games in Atlantic County.',
        effects: [rivRes('manno', { exposure: 20, money: -4000 }), rivOp('manno', -10), heat('local', -6), then('kc_2', 6, 10, 1)],
        preview: 'Manno takes the hit. If he learns where it came from, he\'ll answer.',
      },
      {
        text: 'Tell the aide you don\'t know what he\'s talking about. Pick up his check.',
        effects: [money(-3), heat('local', 4), op('aide', -10), then('kc_2', 6, 10, 1)],
        preview: 'You don\'t play. The prosecutor will need a headline anyway. Yours is available.',
      },
    ],
  },
  {
    id: 'kc_2',
    category: 'politics',
    chain: { id: 'keough_congress', part: 2 },
    trigger: { chainOnly: true },
    roles: { prosecutor: carried('the prosecutor'), aide: carried('the aide') },
    title: 'A Fundraiser at the Admiral',
    body: `Keough's campaign holds a fundraiser in the ballroom of the Admiral, a grand old hotel on the beachfront, with a Dixieland band and a shrimp tower. Half the Boardwalk merchants are there, because they want him gone to Washington even more than you do.

His opponent, an incumbent who hasn't been seen in the district since Easter, is looking for money too. Both campaigns accept cash. Neither asks many questions in a close year.`,
    options: [
      {
        text: 'Donate to Keough. Generously, through a dozen merchants. Send him to Washington.',
        gate: { money: 4000 },
        effects: [money(-4000), flag('kc_back_keough'), heat('local', -4), then('kc_3', 10, 16, 1)],
        preview: 'If he wins, he\'s out of your county. If he wins, he\'s also in Congress.',
      },
      {
        text: 'Donate to the incumbent. Keep the devil you know here.',
        effects: [money(-3000), flag('kc_back_incumbent'), favor(2), then('kc_3', 10, 16, 1)],
        preview: 'A friendly congressman. And Keough in your county for four more years.',
      },
      {
        text: 'Eat the shrimp and donate to nobody.',
        effects: [stress(-2), then('kc_3', 10, 16, 1)],
        preview: 'Let the voters decide. A radical idea in Cape May County.',
      },
    ],
  },
  {
    id: 'kc_3',
    category: 'politics',
    chain: { id: 'keough_congress', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { prosecutor: carried('the prosecutor') },
    title: 'Election Night, November 1962',
    body: `The Cuban crisis kept everybody indoors and frightened for two weeks in October, and nobody thought about congressional races. Now it's over and the returns are coming in on the radio at the Ivanhoe, precinct by precinct, Cape May County then Atlantic County, a horse race neither horse deserves.

At ten, it's close. At eleven, it's closer. At midnight, a man you know at the county Democratic committee calls: there are two precincts in Wildwood still uncounted. "Whichever way they go," he says, "it goes."`,
    options: [
      {
        text: 'Make sure Keough wins. Get him out of the county.',
        effects: [heat('local', -15), heat('federal', 6), evidence('player', 4), flag('keough_in_congress')],
        preview: 'A new prosecutor in the county, starting from scratch. A congressman who remembers you.',
      },
      {
        text: 'Make sure Keough loses. Keep him small.',
        effects: [heat('local', 10), favor(2), evidence('player', 3), flag('keough_lost')],
        preview: 'A bitter prosecutor with four years and a grudge.',
      },
      {
        text: 'Don\'t touch it. Let the count be the count.',
        effects: [respect(2), stress(-4)],
        preview: 'Whatever happens, it\'s not your fault. That\'s rare in this county.',
      },
    ],
  },

  /* ================================================================ */
  /* 20. WHITE POWDER                                                  */
  /* ================================================================ */
  {
    id: 'pw_1',
    category: 'vice',
    chain: { id: 'powder', part: 1 },
    trigger: { minWeek: 12, rivalAlive: 'manno', hasBusiness: 'fencing', once: true, weight: 8 },
    roles: { envoy: rivalMan('manno', 'a smooth Manno lieutenant', { first: 'Rocco', last: 'Lanzetta', ethnicity: 'Italian', age: [32, 42], traits: ['Greedy', 'Charming'] }), rival: rivalBoss('manno', 'Carmine Manno') },
    title: 'A Boat From Montreal',
    body: `{envoy.name} drives down from Atlantic City in a new Thunderbird and takes you to a seafood place in Cape May where nobody knows either of you. He talks about the weather, the Eagles, and his daughter's piano lessons. Then dessert.

Certain merchandise comes from Marseilles by way of Montreal. It needs a quiet dock on the bay side of the island two nights a month. {rival.boss} is offering a share that would double your year. "Philadelphia," {envoy.first} says, stirring his espresso, "doesn't need to know where every boat ties up."

Philadelphia does need to know. Philadelphia has one rule older than all the others, and men who broke it are not in Florida for their health.`,
    options: [
      {
        text: 'No. Not on this island. Not ever.',
        effects: [respect(4), rivOp('manno', -8), crewOp(3), flag('pw_refused')],
        preview: 'The right answer. Manno finds another dock somewhere.',
      },
      {
        text: 'No, and then tell Sal Moretti exactly who asked.',
        effects: [rivOp('philly', 15), heat('family', -8), rivOp('manno', -25), rivRes('manno', { exposure: 10 }), flag('pw_reported'), then('pw_3', 6, 10, 0.5)],
        preview: 'Philadelphia owes you. Manno will learn you went upstairs.',
      },
      {
        text: 'Ask about the terms. Just to know.',
        gate: { trait: 'Greedy' },
        effects: [secret('player', 'drugs', 'manno'), stress(8), then('pw_2', 3, 6, 1)],
        preview: 'You haven\'t said yes. Manno now has a story about you he can tell Philadelphia.',
      },
    ],
  },
  {
    id: 'pw_2',
    category: 'crew',
    chain: { id: 'powder', part: 2 },
    trigger: { chainOnly: true },
    roles: { actor: crewRole('a Greedy soldier who works the bay docks', { rank: ['soldier', 'associate'], trait: 'Greedy' }), envoy: carried('the Manno lieutenant') },
    title: 'Your Soldier Said Yes',
    body: `You never said yes. {actor.call} did. Two nights a month for three months, he's been letting a boat tie up at the bay dock you pay him to watch, and taking an envelope from {envoy.name}'s people for looking at the stars.

You learn about it because his wife came into the bakery wearing a mink stole in July, and the baker's wife told your wife, and your wife told you while folding laundry, not looking up. "I don't want to know," she says. "But you should."`,
    options: [
      {
        text: 'Cut him off from everything, and tell Philadelphia yourself before anyone else does.',
        effects: [leave('actor', 'exile'), rivOp('philly', 12), heat('family', -6), crewOp(-3), rivOp('manno', -15), then('pw_3', 3, 6, 0.5)],
        preview: 'You get ahead of it. Your soldier goes somewhere far away and stays there.',
      },
      {
        text: 'Make him stop, take his money, and say nothing to anyone.',
        effects: [money(5000), secret('actor', 'drugs'), heat('family', 6), evidence('actor', 6), then('pw_3', 3, 6, 1)],
        preview: 'A secret between you and him. And Manno. And his wife\'s mink.',
      },
      {
        text: 'Let it keep going, and take your cut.',
        gate: { trait: 'Greedy' },
        effects: [money(9000), unwashed(9000), secret('player', 'drugs', 'manno'), flag('pw_took_cut'), heat('family', 12), heat('federal', 10), then('pw_3', 2, 4, 1)],
        preview: 'More money than anything else on this island. The most dangerous thing you will ever do.',
      },
    ],
  },
  {
    id: 'pw_3',
    category: 'table',
    chain: { id: 'powder', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'Philadelphia Asks One Question',
    body: `Sal doesn't come to the Ivanhoe. He sends a car. The car takes you over the bridges to a social club in South Philadelphia where the espresso machine is older than both of you and a picture of a saint watches from above the door.

Sal asks you one question, slowly, the way you ask a child where the cookies went. "Did any man of yours touch the boats from Montreal?" He waits. The man behind you waits. The saint waits.`,
    options: [
      {
        text: 'Tell him the truth, whatever it is.',
        effects: [rivOp('philly', 10), heat('family', -4), respect(2), evidence('player', -2)],
        preview: 'Philadelphia values the truth. It also acts on it.',
      },
      {
        text: 'Look him in the eye and say no.',
        effects: [heat('family', 8), stress(12), flag('pw_lied')],
        preview: 'If the answer was really no, you\'re fine. If it wasn\'t, this conversation will happen again, differently.',
      },
      {
        text: 'Give him Manno: names, nights, the dock in Atlantic County they use now.',
        effects: [rivOp('philly', 15), rivOp('manno', -20), rivRes('manno', { muscle: -10, exposure: 15 }), heat('family', -6)],
        preview: 'Philadelphia\'s anger turns north. Manno\'s anger turns south, toward you.',
      },
    ],
  },

  /* ================================================================ */
  /* 21. THE HOUSE ON SPICER AVENUE (Underbelly, villain-only)         */
  /* ================================================================ */
  {
    id: 'sp_1',
    category: 'town',
    chain: { id: 'spicer', part: 1 },
    trigger: { season: 'summer', minWeek: 4, once: true, weight: 14 },
    roles: {
      kid: townie('a sixteen-year-old summer worker from Pennsylvania', { first: 'Stevie', last: 'Rusnak', ethnicity: 'Irish', age: [16, 17], traits: ['Honest'] }),
      grimsby: townie('the man who runs the rooming house', { first: 'Lyle', last: 'Grimsby', ethnicity: 'Irish', age: [44, 55], traits: ['Cruel', 'Greedy'] }),
    },
    title: 'Paychecks That Never Come',
    body: `A waitress at your luncheonette asks if her kid brother can have a word. {kid.first} is sixteen, from a coal town outside Allentown, and came down in June with a dozen other high school kids for "guaranteed summer jobs" advertised in their local paper.

The man who placed them, {grimsby.name}, runs a rooming house on Spicer Avenue. He collects their paychecks from the employers "for safekeeping," charges them rent equal to their pay, holds their bus tickets home, and tells them their parents will be billed if they leave. Two girls cried all night. One boy tried to walk to the Causeway and was brought back.

{kid.first} doesn't know who you are. He just heard you were the man to ask.`,
    options: [
      {
        text: 'Find out everything about Grimsby. Who he pays, who owns the building.',
        effects: [under('exposure', 15), stress(3), then('sp_2', 1, 2, 1)],
        preview: 'Knowledge first. It takes a week. The kids wait another week.',
      },
      {
        text: 'Send two men to Spicer Avenue tonight to explain things to Grimsby.',
        effects: [under('strength', -15), heat('local', 6), respect(4), op('kid', 20), then('sp_2', 1, 2, 1)],
        preview: 'Grimsby gets scared. Scared men call whoever protects them.',
      },
      {
        text: 'Call the police chief. This is what he\'s for.',
        effects: [heat('local', -2), under('exposure', 8), favor(-1), then('sp_2', 2, 3, 1)],
        preview: 'Proper. The chief may already be on Grimsby\'s list of friends.',
      },
    ],
  },
  {
    id: 'sp_2',
    category: 'rivals',
    chain: { id: 'spicer', part: 2 },
    trigger: { chainOnly: true },
    roles: { grimsby: carried('the rooming house man'), rival: rivalBoss('manno', 'Carmine Manno'), kid: carried('the summer worker') },
    title: 'Who Owns the Building',
    body: `The deed on the Spicer Avenue house runs through a realty company in Ventnor, which runs through a lawyer in Atlantic City, which runs, eventually and unsurprisingly, to {rival.name}. Grimsby pays Manno's people rent and a share. There are two more houses like it in Ocean City and one in Sea Isle.

Manno is getting paid for this. He might not even know the details, the way a man doesn't look in the sausage grinder. Either way, it's in your town, with your name on the street, and children are crying in it.`,
    options: [
      {
        text: 'Raise it at the Table with Philadelphia. Manno answers for it in front of everyone.',
        effects: [rivOp('philly', 8), rivOp('manno', -15), under('exposure', 15), heat('family', 2), then('sp_3', 2, 4, 1)],
        preview: 'Philadelphia hates this kind of thing more than you do. Manno loses face, and remembers who cost him.',
      },
      {
        text: 'Give the whole file to the prosecutor and the Inquirer.',
        effects: [under('exposure', 30), heat('local', -6), rivRes('manno', { exposure: 15 }), then('sp_3', 2, 4, 1)],
        preview: 'The law does the work. Newspaper stories have a way of widening to the next man over.',
      },
      {
        text: 'Buy the building out from under Manno.',
        gate: { money: 7000 },
        effects: [money(-7000), biz('add', 'boarding', 'downtown'), rivOp('manno', -5), under('strength', -20), then('sp_3', 2, 4, 1)],
        preview: 'It becomes an honest rooming house. Grimsby is out of a job and a building.',
      },
    ],
  },
  {
    id: 'sp_3',
    category: 'town',
    chain: { id: 'spicer', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { grimsby: carried('the rooming house man'), kid: carried('the summer worker') },
    title: 'The Greyhound Station, Labor Day',
    body: `The bus station on Labor Day is a madhouse of sunburned families and duffel bags. Thirteen kids from Pennsylvania stand in a cluster by the ticket window, holding paper bags with everything they own.

Grimsby is gone from Spicer Avenue. His car is not. What happens to him next is your decision, and so is what happens to the kids, who were never paid for a single hour of the summer. {kid.first} is standing in front of the others. He's the one who asked.`,
    options: [
      {
        text: 'Pay every kid every dollar they earned, buy their tickets, and run Grimsby off the shore for good.',
        gate: { money: 3000 },
        effects: [money(-3000), under('runout'), respect(10), heat('local', -6), famOp(5), op('kid', 40)],
        preview: 'They go home with money in their pockets. Everybody on the island hears what you did, eventually.',
      },
      {
        text: 'Deliver Grimsby to the county detectives with his ledgers in a shoebox.',
        effects: [under('expose'), heat('local', -10), evidence('player', -4), favor(1), crewOp(-3)],
        preview: 'He goes to trial. Your men grumble about helping cops, and then are quietly proud.',
      },
      {
        text: 'Both. The kids get paid, and Grimsby goes to the prosecutor.',
        gate: { money: 3000 },
        effects: [money(-3000), under('expose'), respect(8), heat('local', -12), crewOp(-2), op('kid', 40)],
        preview: 'Justice by every route at once. The most expensive kind, and the best.',
      },
    ],
  },
];

