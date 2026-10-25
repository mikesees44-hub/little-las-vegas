import type { PackEvent } from './storyDataSchema';
import {
  biz, crewOp, crewRole, evidence, famOp, famRole, favor, flag, health, heat, hook, infl, money, official, op,
  recruit, respect, rivOp, rivRes, rivalBoss, rivalMan, secret, stress, townie, unwashed,
} from './storyDataSchema';

/** Standalone events II: season, history, boardwalk, town, church, politics, romance. */
export const STANDALONE_2: PackEvent[] = [
  /* ------------------------------------------------------------ SEASON */
  {
    id: 'ss_memorial_day',
    category: 'season',
    trigger: { months: [5, 6], season: 'summer', weight: 40, cooldownWeeks: 40, minWeek: 40 },
    roles: { actor: crewRole('your underboss or senior capo', { rank: ['underboss', 'capo'] }) },
    title: 'The Shutters Go Up',
    body: `Memorial Day weekend. At seven in the morning the shutters go up on the Boardwalk one after another, like a long row of eyelids opening: pizza, custard, taffy, the photo stand, the Skee-Ball alley, the stand that sells your name in rhinestones on a T-shirt.

The first families come over the bridge with their windows down and the kids standing up in the back seat. {actor.call} stands beside you at the rail with a coffee. "Hundred days," he says. "Hundred days to make the year." Every man on the island is doing the same arithmetic.`,
    options: [
      {
        text: 'Raise the street tax for the season. Everyone\'s flush.',
        effects: [money(3000), respect(-3), infl('boardwalk', -2)],
        preview: 'A richer summer. Stand owners grumble into their fryers.',
      },
      {
        text: 'Hold the tax flat. Good years are built on goodwill.',
        effects: [respect(4), infl('boardwalk', 4), crewOp(-2)],
        preview: 'The Boardwalk is loyal. Your men wanted a raise this year.',
      },
      {
        text: 'Throw an opening-night party for every stand owner at the Ivanhoe.',
        effects: [money(-1500), respect(6), infl('boardwalk', 3), famOp(2)],
        preview: 'Clams, beer and a band. Everybody remembers who throws the party.',
      },
    ],
  },
  {
    id: 'ss_july4',
    category: 'season',
    trigger: { months: [7], season: 'summer', weight: 30, cooldownWeeks: 40 },
    roles: { actor: crewRole('a capo', { rank: 'capo' }) },
    title: 'The Biggest Weekend',
    body: `The Fourth. The beach is a quilt of towels from the inlet to the Crest, and there's not a parking space within a mile of the ocean. Every motel has a NO VACANCY sign and a family sleeping in its station wagon in the lot.

{actor.call} wants to put every man you have on the street, double the games of chance, and run the back rooms until dawn. Your bagman wants you to remember that the State Police also know what weekend it is.`,
    options: [
      {
        text: 'Every man on the street. Make the year in three days.',
        effects: [money(5000), heat('local', 8), op('actor', 10)],
        preview: 'The richest weekend you\'ll have. The State Police like big weekends too.',
      },
      {
        text: 'Business as usual. Nothing extra.',
        effects: [money(1500), heat('local', -2)],
        preview: 'Steady and safe. {actor.first} thinks you left money on the beach.',
      },
      {
        text: 'Sponsor the fireworks. Then work the crowd they bring.',
        effects: [money(1000), respect(6), heat('local', 2), infl('boardwalk', 3)],
        preview: 'Good citizen and good businessman at the same time, for one night.',
      },
    ],
  },
  {
    id: 'ss_labor_day',
    category: 'season',
    trigger: { months: [9], weight: 40, cooldownWeeks: 40 },
    roles: { owner: townie('a stand owner who had a terrible summer', { first: 'Mike', last: 'Pagano', ethnicity: 'Italian', age: [50, 65], traits: ['Honest'] }) },
    title: 'The Last Weekend',
    body: `Labor Day. Hundred days gone. By Tuesday the families are gone, the lifeguard stands are dragged up the beach, and the Boardwalk sounds like a library. Accounts get settled this week.

{owner.name} sold lemonade on the Boardwalk for thirty-one summers. This one it rained every Saturday in July, his fryer caught fire, and his son left for California. He owes you eight hundred dollars he doesn't have. He came to tell you himself, hat in his hand, which is more than most men do.`,
    options: [
      {
        text: 'Forgive it. Thirty-one summers count for something.',
        effects: [money(-800), respect(4), infl('boardwalk', 3), op('owner', 30)],
        preview: 'The Boardwalk hears. A soft heart is also an advertisement.',
      },
      {
        text: 'Carry it over to next summer at no interest.',
        effects: [op('owner', 15), money(-100)],
        preview: 'Fair. He\'ll pay if he lives to June.',
      },
      {
        text: 'Take the stand. That\'s what collateral is for.',
        effects: [biz('add', 'stand', 'boardwalk'), respect(-4), op('owner', -40), infl('boardwalk', -2)],
        preview: 'You own a lemonade stand. The Boardwalk watches you take it.',
      },
    ],
  },
  {
    id: 'ss_october_empty',
    category: 'season',
    trigger: { months: [10, 11], season: 'offseason', weight: 25, cooldownWeeks: 40 },
    roles: { actor: crewRole('an idle soldier', { rank: ['soldier', 'associate'] }) },
    title: 'The Empty Boardwalk',
    body: `October. The Boardwalk is gray planks and gulls, the stands boarded up with plywood that says CLOSED FOR SEASON in spray paint. The wind blows sand into the tram tracks. The only people on the beach are old men with metal detectors and a priest walking a dog.

Your men have nothing to do. Idle men drink, gamble and get ideas. {actor.call} has already been in two fights at the Anchor and borrowed money from somebody he shouldn't have.`,
    options: [
      {
        text: 'Winter project: renovate the Ivanhoe. Everybody holds a hammer.',
        effects: [money(-2500), crewOp(5), op('actor', 5)],
        preview: 'Busy men are loyal men. The Ivanhoe gets new carpet.',
      },
      {
        text: 'Send half the crew to work Philadelphia for the winter under Sal.',
        effects: [money(1500), rivOp('philly', 6), crewOp(-3), heat('family', -2)],
        preview: 'Money and goodwill. Your men come back in May knowing Sal better than you.',
      },
      {
        text: 'Let them be. Winter is for resting.',
        effects: [stress(-4), crewOp(-2), heat('local', 2)],
        preview: 'Peace for you. A long winter of small trouble.',
      },
    ],
  },
  {
    id: 'ss_winter_game',
    category: 'vice',
    trigger: { months: [12, 1, 2], season: 'offseason', weight: 20, cooldownWeeks: 40 },
    roles: { actor: crewRole('the soldier who runs the winter game', { rank: ['soldier', 'capo'] }) },
    title: 'The Winter Game',
    body: `In the off-season the best card game on the island moves into a boarded-up motel in the Crest: a kerosene heater, a felt table, sandwiches from the deli and coffee in a percolator. Philadelphia men drive down for it. So do a dentist, two doctors, and a city commissioner who loses beautifully.

{actor.call} has a request: a very rich man from Main Line Philadelphia wants in. He plays badly and pays slowly. He also owns half a bank.`,
    options: [
      {
        text: 'Let him in. Let him lose. Let him owe.',
        effects: [money(2500), hook('actor', 'He brought a banker to your table'), flag('banker_owes')],
        preview: 'A banker in debt to you. Bankers have lawyers.',
      },
      {
        text: 'Keep the game small. Locals and friends.',
        effects: [money(800), crewOp(2), heat('local', -2)],
        preview: 'Safe winter money. Nobody\'s lawyer comes looking.',
      },
      {
        text: 'Raise the stakes for everyone. It\'s a long winter.',
        gate: { trait: 'Gambler' },
        effects: [money(4000), heat('local', 5), stress(6)],
        preview: 'Big money, big losers, big grudges by spring.',
      },
    ],
  },
  {
    id: 'ss_christmas',
    category: 'family',
    trigger: { months: [12], weight: 40, cooldownWeeks: 40 },
    roles: { spouse: famRole('your wife', 'spouse'), mother: famRole('your mother', 'mother') },
    title: 'The Feast of the Seven Fishes',
    body: `Christmas Eve. Your mother has been cleaning baccalà since Tuesday. Smelts, calamari, shrimp, clams, mussels, the baccalà, and an eel that everyone pretends not to see. Thirty people at three tables pushed together, the children at the card table, the old men arguing about 1934.

This is also the week of envelopes: to every cop on the payroll, the mailman, the priest, the nuns, the men. Your wife has a list. So does Philadelphia.`,
    options: [
      {
        text: 'Generous envelopes for everyone. It\'s Christmas.',
        effects: [money(-4000), heat('local', -6), crewOp(6), famOp(4), respect(4)],
        preview: 'Goodwill from the police chief to the paperboy. A very expensive night.',
      },
      {
        text: 'Normal envelopes. Spend the night with the family.',
        effects: [money(-1500), famOp(8), op('spouse', 10), stress(-8)],
        preview: 'The best Christmas in years. Some cops expected more.',
      },
      {
        text: 'Take the whole crew\'s kids Christmas shopping on your dime.',
        gate: { trait: 'Charming' },
        effects: [money(-2500), crewOp(10), famOp(3), respect(5)],
        preview: 'Your men will never forget it. Neither will their wives.',
      },
    ],
  },
  {
    id: 'ss_new_years',
    category: 'season',
    trigger: { months: [12, 1], weight: 15, cooldownWeeks: 40 },
    roles: { actor: crewRole('a capo who wants a word', { rank: 'capo' }) },
    title: 'Auld Lang Syne at the Ivanhoe',
    body: `New Year's Eve. The Ivanhoe is full of paper hats and noisemakers and men in tuxedos who look like they're about to testify. The band plays the old songs. At midnight everybody kisses everybody, and old enemies shake hands.

At 12:20, {actor.call} pulls you into the coat room. He's had a few. He says he's been thinking about the future, about how the family is run, about what comes next. He says it like a toast. It doesn't sound like one.`,
    options: [
      {
        text: 'Hear him out, here and now.',
        effects: [op('actor', 10), stress(4), flag('capo_ideas')],
        preview: 'You learn what he\'s been thinking. He learns you\'ll listen.',
      },
      {
        text: 'Tell him to go home to his wife and say it sober.',
        effects: [op('actor', -5), respect(2)],
        preview: 'Maybe he\'ll say it again in daylight. Maybe he\'ll just think it.',
      },
      {
        text: 'Pour him another drink and tell him a story about your father.',
        gate: { trait: 'Charming' },
        effects: [op('actor', 15), stress(-3)],
        preview: 'He forgets his speech. He remembers the story.',
      },
    ],
  },
  {
    id: 'ss_donna',
    category: 'history',
    trigger: { between: { from: { y: 1960, m: 9 }, to: { y: 1960, m: 9 } }, once: true, mandatory: true },
    roles: { actor: crewRole('a capo', { rank: 'capo' }) },
    title: 'Hurricane Donna',
    body: `The Weather Bureau says a hurricane named Donna is coming up the coast after the season ended, which is the only decent thing she's done. The radio says it could hit the Jersey shore on Monday. Plywood sells out in Cape May by noon.

{actor.call} wants to know what to do about the motels, the stands, the boats at Otten's Harbor, and the card game that was supposed to run Sunday night.`,
    options: [
      {
        text: 'Board up everything. Move the boats up the creek. Cancel the game.',
        effects: [money(-1500), crewOp(2)],
        preview: 'Expensive caution. If she misses, you lost a weekend for nothing.',
      },
      {
        text: 'Board up your own places, then send men to help the neighbors.',
        effects: [money(-2000), respect(6), heat('local', -3)],
        preview: 'Good neighbors are remembered. So are good neighbors\' Cadillacs parked in front of their houses.',
      },
      {
        text: 'Run the card game anyway. A hurricane party.',
        gate: { trait: 'Gambler' },
        effects: [money(2000), health('actor', -5), respect(3), stress(4)],
        preview: 'Candles, cards and the wind screaming on the shutters. Legend, if the roof holds.',
      },
    ],
  },
  {
    id: 'ss_easter',
    category: 'church',
    trigger: { months: [3, 4], season: 'offseason', weight: 15, cooldownWeeks: 40 },
    roles: { priest: townie('the parish priest of Our Lady of the Dunes', { first: 'Dennis', last: 'Quinlan', ethnicity: 'Irish', age: [50, 62], traits: ['Pious', 'Honest'], office: 'pastor' }) },
    title: 'Easter on the Boards',
    body: `Easter Sunday, the first warm day. After Mass the whole town walks the Boardwalk in new hats and spring coats: the Easter promenade, a hundred years old. A few stands open for the day just to sell coffee and crumb cake. It's the first money since October.

{priest.name} walks beside you for a block, nodding at parishioners. He says the parish needs a new boiler before next winter and doesn't say anything else, which is a priest's version of a bagman.`,
    options: [
      {
        text: 'Buy the boiler.',
        effects: [money(-1500), op('priest', 20), famOp(4), respect(3)],
        preview: 'The church is warm next winter. Your mother tells everyone.',
      },
      {
        text: 'Put a fifty in the collection basket and wish him a happy Easter.',
        effects: [money(-50), op('priest', -5)],
        preview: 'He thanks you. Priests know the difference between fifty and a boiler.',
      },
      {
        text: 'Buy the boiler through Danny Kessler\'s parish committee, together.',
        gate: { trait: 'Charming' },
        effects: [money(-800), op('priest', 15), rivOp('kessler', 8)],
        preview: 'Italian and Irish money, one boiler. The priest calls it a small miracle.',
      },
    ],
  },
  {
    id: 'ss_miss_america',
    category: 'season',
    trigger: { months: [9], rivalAlive: 'manno', weight: 12, cooldownWeeks: 40 },
    roles: { rival: rivalBoss('manno', 'Carmine Manno') },
    title: 'Pageant Week',
    body: `The week after Labor Day, Atlantic City hosts the Miss America Pageant: a parade on the Boardwalk, contestants in convertibles, and every hotel room on Absecon Island booked. The overflow trickles down to Wildwood's half-empty motels, an unexpected last week of summer.

{rival.name}'s men are steering pageant-week visitors to their own places. You could compete for the overflow, or you could leave Atlantic City to Atlantic City.`,
    options: [
      {
        text: 'Billboards on the Parkway: "Cheaper rooms, prettier beaches."',
        effects: [money(1500), rivOp('manno', -5), infl('crest', 2)],
        preview: 'A good last week. Manno doesn\'t like the billboards.',
      },
      {
        text: 'Leave it. Rest the men.',
        effects: [stress(-4), crewOp(2)],
        preview: 'A quiet week. The season is over anyway.',
      },
      {
        text: 'Send your best men to AC to work the crowds. Quietly.',
        effects: [money(2500), rivOp('manno', -10), heat('local', 3), infl('causeway', 2)],
        preview: 'Your men in Manno\'s town during his biggest week. A provocation with a profit.',
      },
    ],
  },
  {
    id: 'ss_spring_loans',
    category: 'boardwalk',
    trigger: { months: [3, 4, 5], season: 'offseason', weight: 15, cooldownWeeks: 40 },
    roles: { owner: townie('a young couple opening a pizza stand', { first: 'Tony', last: 'Ricci', ethnicity: 'Italian', age: [24, 30], traits: ['Ambitious'] }) },
    title: 'Opening Money',
    body: `Spring. Every stand on the Boardwalk needs money before it makes money: new paint, new fryers, the season's first order of flour and cheese and sugar. The banks lend to people with nice suits. Everybody else comes to you.

{owner.name} and his wife want to open a pizza stand near the Convention Hall. They have a recipe from his grandmother in Naples and two thousand dollars short. He's polite and terrified and smells like oregano.`,
    options: [
      {
        text: 'Lend at the usual rate.',
        effects: [money(-2000), biz('add', 'loansharking', 'boardwalk')],
        preview: 'Steady vig. If the pizza is bad, you own an oven.',
      },
      {
        text: 'Lend at a friend\'s rate, and eat there every Friday.',
        effects: [money(-2000), op('owner', 25), infl('boardwalk', 3), respect(2)],
        preview: 'Less profit, a lot of loyalty. The pizza, it turns out, is very good.',
      },
      {
        text: 'Buy in as a silent partner.',
        gate: { trait: 'Ambitious' },
        effects: [money(-3000), biz('add', 'pizza', 'boardwalk'), op('owner', 5), unwashed(-1500)],
        preview: 'A real business and a clean cash register. His grandmother\'s recipe is now partly yours.',
      },
    ],
  },

  /* ------------------------------------------------------------ HISTORY */
  {
    id: 'hi_apalachin',
    category: 'history',
    trigger: { between: { from: { y: 1960, m: 6 }, to: { y: 1960, m: 11 } }, once: true, weight: 25 },
    roles: { actor: crewRole('an old-timer who remembers', { rank: ['soldier', 'consigliere', 'capo'] }), sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'Since Apalachin',
    body: `It's been nearly three years since state troopers found sixty men from all over the country at a house in Apalachin, New York, and stopped them on the road with their good suits and their steaks still digesting. The convictions that followed are still in the courts. Every family in the country learned the same lesson: don't gather.

You want to call your capos together for the first real sit-down of the season. {actor.call} reminds you that {sal.name} has said no more than four men in a room, anywhere, for any reason. "Apalachin was a barbecue," he says. "Nobody remembers the steaks. Everybody remembers the photographs."`,
    options: [
      {
        text: 'Meet one capo at a time. Slow and safe.',
        effects: [stress(4), heat('federal', -3), rivOp('philly', 4)],
        preview: 'Nobody gets photographed. You hear four different versions of everything.',
      },
      {
        text: 'Meet them all on a party boat out of Otten\'s Harbor. Nobody photographs fish.',
        gate: { trait: 'Charming' },
        effects: [crewOp(6), heat('family', 3), respect(3)],
        preview: 'A real meeting, a lot of bluefish, and a captain who saw everyone\'s face.',
      },
      {
        text: 'Meet at the Ivanhoe. This is your town.',
        effects: [respect(5), crewOp(3), heat('federal', 6), heat('family', 5)],
        preview: 'Pride. Somebody across the street with a camera is also proud of his work.',
      },
    ],
  },
  {
    id: 'hi_jfk_elected',
    category: 'history',
    trigger: { between: { from: { y: 1960, m: 11 }, to: { y: 1960, m: 11 } }, once: true, mandatory: true },
    roles: { mother: famRole('your mother', 'mother') },
    title: 'A Catholic in the White House',
    body: `The election is so close that the radio at the Ivanhoe stays on all night. By morning it's official: the Senator from Massachusetts, forty-three years old, Irish and Catholic, has won. Your mother cries at the kitchen table and lights a candle under the picture of the Pope.

Your bookmakers took heavy action both ways, and the Irish bars in North Wildwood are buying rounds for strangers. Somewhere in Washington, the new administration is choosing an Attorney General.`,
    options: [
      {
        text: 'Free drinks at the Ivanhoe. A celebration.',
        effects: [money(-800), respect(4), famOp(5), op('mother', 10)],
        preview: 'A good night for the town. Everyone remembers where they were.',
      },
      {
        text: 'Count the bookmaking take and stay quiet.',
        effects: [money(3000)],
        preview: 'A profitable election. You don\'t vote with your heart.',
      },
      {
        text: 'Raise a glass, and tell your consigliere to start reading about the Justice Department.',
        gate: { trait: 'Paranoid' },
        effects: [money(-300), stress(3), evidence('player', -3), flag('studied_justice')],
        preview: 'Your mother thinks you\'re a pessimist. You think the brother is the one to watch.',
      },
    ],
  },
  {
    id: 'hi_rfk_justice',
    category: 'history',
    trigger: { between: { from: { y: 1961, m: 2 }, to: { y: 1961, m: 5 } }, once: true, weight: 30 },
    roles: { lawyer: crewRole('the family\'s lawyer or consigliere', { rank: ['consigliere', 'associate'] }) },
    title: 'The New Attorney General',
    body: `The President has made his younger brother Attorney General, and the brother has said on the record that organized crime is his first priority. The Justice Department is hiring lawyers. The FBI, which spent years saying there was no such thing as a national organization, is suddenly very interested in finding one.

{lawyer.call} reads you a newspaper article slowly, twice. "It used to be the county," he says. "Now it's Washington. Washington doesn't take envelopes."`,
    immediate: [heat('federal', 6)],
    options: [
      {
        text: 'Clean house. Every business with a paper trail gets a lawyer\'s review.',
        gate: { money: 4000 },
        effects: [money(-4000), evidence('player', -10)],
        preview: 'Expensive housekeeping. The kind that keeps men out of Lewisburg.',
      },
      {
        text: 'Diversify: more legitimate businesses, fewer rackets.',
        effects: [money(-2000), unwashed(-3000), heat('federal', -3), crewOp(-4)],
        preview: 'Safer. Your soldiers don\'t like hearing the word "legitimate."',
      },
      {
        text: 'Nothing changes. Washington is a long way from Wildwood.',
        effects: [respect(2), heat('federal', 3)],
        preview: 'Confidence. Washington is closer than it looks.',
      },
    ],
  },
  {
    id: 'hi_havana',
    category: 'history',
    trigger: { between: { from: { y: 1961, m: 4 }, to: { y: 1961, m: 7 } }, once: true, weight: 25 },
    roles: { croupier: townie('a croupier from Havana', { first: 'Emilio', last: 'Varela', ethnicity: 'Italian', age: [35, 48], traits: ['Charming', 'Patient'] }) },
    title: 'A Croupier From Havana',
    body: `The invasion at the Bay of Pigs has failed, and with it any hope that the casinos of Havana will open again for the people who used to run them. Men who dealt cards in Havana in their tuxedos are dealing cards in Miami, Las Vegas, and now, apparently, Wildwood.

{croupier.name} dealt baccarat at a hotel casino in Havana for nine years. He has beautiful hands, four languages, and a suitcase. He'd like to work. "I know how a real room runs," he says. "Your rooms are very nice. They are not real rooms."`,
    options: [
      {
        text: 'Hire him to run your back rooms properly.',
        effects: [recruit('croupier', 'associate'), money(-1000), biz('add', 'cardgame', 'pacific'), heat('federal', 3)],
        preview: 'Your games become the best on the coast. The FBI is very interested in former Havana men.',
      },
      {
        text: 'Send him to Feldstein. He\'s more Feldstein\'s style.',
        effects: [rivOp('feldstein', 10), rivRes('feldstein', { money: 2000 })],
        preview: 'Feldstein owes you a small favor and has a much better casino man.',
      },
      {
        text: 'Give him a job dealing at the Saturday game. Start small.',
        effects: [money(-300), op('croupier', 10)],
        preview: 'A quiet hire. He\'s overqualified and very polite about it.',
      },
    ],
  },
  {
    id: 'hi_wire_act',
    category: 'history',
    trigger: { between: { from: { y: 1961, m: 9 }, to: { y: 1961, m: 11 } }, once: true, weight: 30 },
    roles: { actor: crewRole('the soldier who runs your bookmaking', { rank: ['soldier', 'capo'] }) },
    title: 'The Wire',
    body: `Congress has passed a new law, part of the Attorney General's program: using a telephone or a telegraph line across state lines to take bets or pass racing results is now a federal crime. Your bookmakers get their results from Philadelphia by phone, every race, every day. Philadelphia gets them from Maryland and New York.

{actor.call} wants to know what to do about the phones. "They can't arrest the telephone company," he says. "Can they?"`,
    immediate: [heat('federal', 4)],
    options: [
      {
        text: 'Move the results by car. A runner on the Parkway every afternoon.',
        effects: [money(-1500), evidence('player', -4), op('actor', -5)],
        preview: 'Slower results, fewer bets. No federal wire.',
      },
      {
        text: 'Keep the phones. Pay-phone to pay-phone, never the same one twice.',
        effects: [evidence('player', 4), money(800), stress(4)],
        preview: 'Business as usual, with more dimes. The FBI also knows where pay phones are.',
      },
      {
        text: 'Shut down out-of-state racing entirely. Local action only.',
        effects: [money(-3000), heat('federal', -6), crewOp(-3)],
        preview: 'Clean. Expensive. Your bookies hate it.',
      },
    ],
  },
  {
    id: 'hi_missile_crisis',
    category: 'history',
    trigger: { between: { from: { y: 1962, m: 10 }, to: { y: 1962, m: 10 } }, once: true, mandatory: true },
    roles: { actor: crewRole('a soldier who wants to build a fallout shelter', { rank: ['soldier', 'associate'] }), spouse: famRole('your wife', 'spouse') },
    title: 'Thirteen Days in October',
    body: `The President is on television talking about missiles in Cuba, ninety miles from Florida. For days the whole country holds its breath. The grocery store on Pacific runs out of canned goods. Your wife fills the basement with water jugs and asks you, very quietly, whether you know anyone who knows anything.

{actor.call} has decided to build a fallout shelter in his backyard in Rio Grande and wants to borrow the family's cement mixer, three soldiers and a week. He is completely serious.`,
    options: [
      {
        text: 'Give him the mixer and the men. Build two. One for your family.',
        effects: [money(-2000), op('actor', 15), op('spouse', 15), stress(-6)],
        preview: 'Peace of mind, in concrete. A great place to store wine after it\'s over.',
      },
      {
        text: 'Close everything for a week. Be with your family.',
        effects: [money(-2500), famOp(10), stress(-8), crewOp(2)],
        preview: 'Your children remember that week as the one you were home.',
      },
      {
        text: 'Business as usual. If the world ends, it ends with the envelope paid.',
        effects: [money(1500), op('spouse', -10), respect(2), stress(6)],
        preview: 'Steady nerves. Your wife sleeps in the basement.',
      },
    ],
  },
  {
    id: 'hi_november_63',
    category: 'history',
    trigger: { between: { from: { y: 1963, m: 11 }, to: { y: 1963, m: 11 } }, once: true, mandatory: true },
    roles: { mother: famRole('your mother', 'mother') },
    title: 'November 22',
    body: `It comes over the radio at the Ivanhoe at a little after half past one: the President has been shot in Dallas. Then, at two-thirty, the rest of it. The bartender turns off the jukebox. Nobody turns it back on.

Your mother is sitting in the dark in her living room with the television on and the candle under the Pope's picture lit beside a newspaper photograph of the President. All over the island, people walk out of their houses and stand on their porches, not knowing why. The bells at Our Lady of the Dunes ring for an hour.`,
    options: [
      {
        text: 'Close everything through the funeral. Every game, every room, every route.',
        effects: [money(-3500), respect(8), famOp(6), heat('local', -5)],
        preview: 'The island is in mourning, and so are you.',
      },
      {
        text: 'Go sit with your mother.',
        effects: [op('mother', 25), famOp(8), stress(-6)],
        preview: 'You don\'t say anything for a long time. Neither does she.',
      },
      {
        text: 'Keep the back rooms open quietly. Men need somewhere to go.',
        effects: [money(1000), respect(-6), famOp(-4)],
        preview: 'Some men do. Most of the town will remember the lights on.',
      },
    ],
  },
  {
    id: 'hi_beatles',
    category: 'history',
    trigger: { between: { from: { y: 1964, m: 8 }, to: { y: 1964, m: 8 } }, once: true, weight: 40 },
    roles: { daughter: famRole('your teenage daughter', 'daughter', { age: [13, 18] }), actor: crewRole('a soldier with an idea', { rank: ['soldier', 'associate'], trait: 'Greedy' }) },
    title: 'Four Boys From Liverpool',
    body: `At the end of August, the English band everybody's daughter is screaming about plays Convention Hall in Atlantic City. Tickets sold out in a day. The girls on the Boardwalk in Wildwood wear their hair like the band and carry transistor radios.

{daughter.first} wants to go more than she has ever wanted anything. {actor.call} has forty tickets he got from a cousin at the box office, and an idea about what teenage girls' fathers will pay for them.`,
    options: [
      {
        text: 'Scalp all forty at triple face value.',
        effects: [money(1800), heat('local', 3), op('daughter', -5)],
        preview: 'Easy money from desperate fathers. Your daughter knows exactly where the tickets went.',
      },
      {
        text: 'Give {daughter.first} two tickets and drive her and a friend yourself.',
        effects: [op('daughter', 40), famOp(5), stress(-3)],
        preview: 'You don\'t hear a single note over the screaming. She remembers it her whole life.',
      },
      {
        text: 'Give the tickets to the girls at the parish school, by lottery.',
        effects: [respect(6), famOp(4), heat('local', -3), op('actor', -10)],
        preview: 'Forty families owe you a story. Your soldier is furious about the money.',
      },
    ],
  },

  /* ------------------------------------------------------------ BOARDWALK */
  {
    id: 'bw_custard_war',
    category: 'boardwalk',
    trigger: { season: 'summer', rivalAlive: 'kessler', weight: 9, cooldownWeeks: 40 },
    roles: { a: townie('a custard stand owner who pays you', { first: 'Sal', last: 'Esposito', ethnicity: 'Italian', age: [45, 60] }), rival: rivalBoss('kessler', 'Danny Kessler') },
    title: 'The Custard War',
    body: `Two frozen custard stands, forty feet apart near the Schellenger Avenue ramp. One pays you. The other pays {rival.name}. For thirty years they sold their cones at the same price. This summer the Kessler stand dropped to a nickel, and {a.name}'s line has gone from around the block to the end of his counter.

{a.first} wants you to "talk to" the other stand. The other stand belongs to a widow from North Wildwood with four kids, which you know because she told everyone on the Boardwalk.`,
    options: [
      {
        text: 'Match the price, out of your pocket, all summer.',
        effects: [money(-1200), op('a', 15), rivOp('kessler', -3)],
        preview: 'The price war goes on. Kids get cheap custard. Nobody wins but the kids.',
      },
      {
        text: 'Call Danny Kessler. Back to the same price, both stands.',
        effects: [rivOp('kessler', 8), op('a', 8), respect(2)],
        preview: 'A gentleman\'s agreement about custard. You will both deny it was ever discussed.',
      },
      {
        text: 'Tell {a.first} to make better custard.',
        effects: [op('a', -15), infl('boardwalk', -2)],
        preview: 'Honest advice. He switches his payments to Kessler by August.',
      },
    ],
  },
  {
    id: 'bw_weight_guesser',
    category: 'boardwalk',
    trigger: { season: 'summer', heatAbove: { federal: 20 }, weight: 8, cooldownWeeks: 40 },
    roles: { guesser: townie('the Boardwalk weight-guesser', { first: 'Honus', last: 'Dietz', nickname: 'the Professor', ethnicity: 'Irish', age: [58, 70], traits: ['Patient'] }) },
    title: 'The Professor Never Misses',
    body: `{guesser.name}, known on the Boardwalk as {guesser.nickname}, has guessed weights and ages at the same stand since 1938. He's never off by more than three pounds or two years. He notices things.

He beckons you over and says, under his breath, that the young man in the Hawaiian shirt who has walked past the Ivanhoe five times today weighs a hundred and eighty-two, is thirty-one, does not eat custard, and wears government shoes. "Nobody on vacation," the Professor says, "wears shoes like that to the beach."`,
    options: [
      {
        text: 'Thank him with a fifty and put the Professor on a retainer.',
        effects: [money(-300), evidence('player', -4), flag('professor_eyes')],
        preview: 'A spotter who has watched the Boardwalk since before the war. Worth every cent.',
      },
      {
        text: 'Have a soldier follow the man in the Hawaiian shirt.',
        effects: [heat('federal', 3), evidence('player', -2), stress(3)],
        preview: 'You learn which motel the agent uses. He learns he\'s been made.',
      },
      {
        text: 'Send the agent a free custard, with your compliments.',
        gate: { trait: 'Charming' },
        effects: [respect(4), heat('federal', 2), crewOp(3)],
        preview: 'A joke the whole Boardwalk enjoys. The agent doesn\'t laugh.',
      },
    ],
  },
  {
    id: 'bw_pickpockets',
    category: 'boardwalk',
    trigger: { season: 'summer', weight: 9, cooldownWeeks: 40 },
    roles: { actor: crewRole('a soldier who works the Boardwalk', { rank: ['soldier', 'associate'] }) },
    title: 'The Baltimore Dips',
    body: `A pickpocket crew from Baltimore has been working the tram cars and the crowds outside the piers: a well-dressed couple, two kids, and a man who bumps into you and apologizes. Families are losing their vacation money. Stand owners are losing their customers. The police are taking reports and shrugging.

The stand owners have come to you. Nobody else on the island is going to fix it. {actor.call} already knows which rooming house the dips are staying at.`,
    options: [
      {
        text: 'Run them off the island. Tonight. Nobody hurt.',
        effects: [respect(6), infl('boardwalk', 4), heat('local', 2), op('actor', 5)],
        preview: 'The Boardwalk is safe. Everyone knows who made it safe.',
      },
      {
        text: 'Make them pay a street tax and work Ocean City instead.',
        gate: { trait: 'Greedy' },
        effects: [money(1200), respect(-3), infl('boardwalk', 1)],
        preview: 'Money from thieves. Families in Ocean City pay for it.',
      },
      {
        text: 'Hand them, with their wallets and their addresses, to the police chief.',
        effects: [heat('local', -6), favor(1), respect(2), crewOp(-2)],
        preview: 'The chief gets a headline. Your men don\'t like playing cop.',
      },
    ],
  },
  {
    id: 'bw_photo_stand',
    category: 'boardwalk',
    trigger: { season: 'summer', rivalAlive: 'manno', weight: 7, cooldownWeeks: 52 },
    roles: { photog: townie('a Boardwalk photographer', { first: 'Wally', last: 'Kline', ethnicity: 'Jewish', age: [40, 55], traits: ['Greedy'] }), rival: rivalBoss('manno', 'Carmine Manno') },
    title: 'Smile for the Birdie',
    body: `{photog.name} runs a photo stand on the Boardwalk: "Your Picture With the Ocean!" Yesterday his roving camera caught a candid shot of you and {rival.name} shaking hands outside a restaurant on Pacific Avenue, a meeting that was supposed to have never happened.

Wally has the negative. Wally isn't stupid. He's also heard newspapers pay for photographs like this, and so do prosecutors, and so does Philadelphia, which would very much like to know why you were shaking Manno's hand.`,
    options: [
      {
        text: 'Buy the negative. Generously.',
        effects: [money(-1500), hook('photog', 'He sold you the negative')],
        preview: 'Problem solved, unless he made a print.',
      },
      {
        text: 'Buy the negative, and his stand. He doesn\'t need to work the Boardwalk anymore.',
        gate: { money: 4000 },
        effects: [money(-4000), biz('add', 'stand', 'boardwalk'), respect(2)],
        preview: 'You own a photo stand. Every photograph on the Boardwalk is yours now.',
      },
      {
        text: 'Tell Philadelphia yourself before the photograph does.',
        effects: [rivOp('philly', 5), heat('family', 3), stress(-3)],
        preview: 'No secret, no leverage. Sal is irritated but not suspicious.',
      },
    ],
  },
  {
    id: 'bw_taffy',
    category: 'boardwalk',
    trigger: { rivalAlive: 'feldstein', weight: 7, once: true },
    roles: { old: townie('an old saltwater taffy maker', { first: 'Ezra', last: 'Lowenthal', ethnicity: 'Jewish', age: [75, 85], traits: ['Honest', 'Patient'] }), rival: rivalBoss('feldstein', 'Ira Feldstein') },
    title: 'Sixty Years of Taffy',
    body: `Old {old.name} has pulled saltwater taffy on the Boardwalk since 1901, in the same window, on the same hook. His grandson wants to sell the shop and the building to {rival.name} for a price the grandson can't refuse. The old man can.

He comes to you in his apron, smelling like molasses and peppermint. He doesn't want money. He wants the sale stopped. "Feldstein buys the building, next year it's a parking lot," he says. "You people are crooks. But you're our crooks."`,
    options: [
      {
        text: 'Match Feldstein\'s offer. Keep the taffy shop as it is.',
        gate: { money: 8000 },
        effects: [money(-8000), biz('add', 'stand', 'boardwalk'), respect(8), rivOp('feldstein', -10), infl('boardwalk', 4)],
        preview: 'The taffy stays. You own a piece of Boardwalk history and a lot of molasses.',
      },
      {
        text: 'Have a word with the grandson about family loyalty.',
        effects: [heat('local', 3), rivOp('feldstein', -8), op('old', 20), respect(3)],
        preview: 'The grandson changes his mind. He resents it for years.',
      },
      {
        text: 'Stay out of it. It\'s the grandson\'s building.',
        effects: [rivOp('feldstein', 5), op('old', -20), respect(-2)],
        preview: 'Feldstein gets the building. The Boardwalk loses a window it had for sixty years.',
      },
    ],
  },
  {
    id: 'bw_beach_patrol',
    category: 'boardwalk',
    trigger: { season: 'summer', weight: 7, cooldownWeeks: 52 },
    roles: { captain: official('the Beach Patrol captain', 'beach patrol captain', { first: 'Bob', last: 'Kirby', ethnicity: 'Irish', age: [34, 44], traits: ['Honest'] }) },
    title: 'Umbrellas and Lifeguards',
    body: `Your umbrella-and-chair rental on the beach makes good money: a whole row of striped umbrellas you put up at dawn and charge for until dusk. The Beach Patrol captain, {captain.name}, says your umbrellas block his lifeguards' view of the water. Last week a kid got pulled out of a rip current behind one of them, barely.

He's asked nicely. He's a former Marine who doesn't ask a third time nicely.`,
    options: [
      {
        text: 'Move the umbrellas back thirty feet. He\'s right.',
        effects: [money(-600), op('captain', 20), heat('local', -2), respect(2)],
        preview: 'Less money. No drowned children with your umbrella in the photo.',
      },
      {
        text: 'Pay for a new lifeguard stand right where he needs it, with your name on it.',
        effects: [money(-1000), op('captain', 10), respect(4)],
        preview: 'Generous and public. A good look, a fair fix.',
      },
      {
        text: 'Leave them. The beach is big enough.',
        effects: [money(600), op('captain', -20), heat('local', 4)],
        preview: 'More money until something goes wrong. Then it\'s all your fault.',
      },
    ],
  },

  /* ------------------------------------------------------------ TOWN */
  {
    id: 'tw_tram_cadillac',
    category: 'town',
    trigger: { season: 'summer', weight: 8, cooldownWeeks: 52 },
    roles: { actor: crewRole('a soldier who parks where he likes', { rank: ['soldier', 'capo'] }) },
    title: 'Watch the Tram Car, Please',
    body: `The Boardwalk tram cars play a recorded warning every few seconds so nobody gets run over. {actor.call} had heard that warning ten thousand times and parked his brand-new white Cadillac on the Boardwalk ramp anyway, with its tail sticking out, to pick up pizza.

The tram car won. The Cadillac now has a dent in its rear fin shaped like a tram car, and the tram car driver, a retired schoolteacher, is giving a statement to a patrolman while a crowd of tourists photographs the car. Someone is already selling postcards.`,
    options: [
      {
        text: 'Pay for the tram car. Laugh about it. It\'s funny.',
        effects: [money(-400), respect(2), crewOp(3), op('actor', -5)],
        preview: 'The town laughs with you. {actor.first} is called "Tram Car" for the rest of his life.',
      },
      {
        text: 'Make {actor.first} pay for everything himself.',
        effects: [op('actor', -10), respect(2)],
        preview: 'A lesson in parking and pride.',
      },
      {
        text: 'Have the patrolman write that the tram car was speeding.',
        effects: [heat('local', 4), respect(-3), op('actor', 10)],
        preview: 'The schoolteacher gets fined. The Boardwalk thinks you\'re a bully.',
      },
    ],
  },
  {
    id: 'tw_ice_shortage',
    category: 'town',
    trigger: { months: [7, 8], weight: 8, cooldownWeeks: 52 },
    roles: { actor: crewRole('the soldier who runs your ice house', { rank: ['soldier', 'associate'] }) },
    title: 'Ninety-Eight Degrees',
    body: `A heat wave: four days over ninety-five, no breeze, the tar on Pacific Avenue soft enough to hold a footprint. Every stand, bar and motel on the island needs ice, and the ice plant on the mainland broke down Tuesday.

Your ice house at the bay docks has the only ice for twenty miles. {actor.call} wants to charge four times the normal price. The hospital in Cape May Court House has called to ask if you can spare some.`,
    options: [
      {
        text: 'Hospital first, then normal prices for everyone.',
        effects: [money(800), respect(8), heat('local', -4)],
        preview: 'You could have made a fortune. You made friends instead.',
      },
      {
        text: 'Hospital free, everyone else pays four times.',
        effects: [money(4000), respect(-2), heat('local', 2)],
        preview: 'A fortune with a conscience. Bar owners won\'t forget the price.',
      },
      {
        text: 'Highest bidder gets the ice. Including the hospital.',
        gate: { trait: 'Greedy' },
        effects: [money(6000), respect(-10), famOp(-5), heat('local', 6)],
        preview: 'The most profitable week of the summer, and the one people tell stories about.',
      },
    ],
  },
  {
    id: 'tw_lost_child',
    category: 'town',
    trigger: { season: 'summer', weight: 7, cooldownWeeks: 52 },
    roles: { actor: crewRole('a soldier who found a lost child', { rank: ['soldier', 'associate'] }) },
    title: 'The Little Girl at Lifeguard Stand Twelve',
    body: `A four-year-old girl from Scranton wandered away from her parents' blanket and spent three hours lost on the beach. {actor.call} found her crying under the Boardwalk, bought her a lemonade, carried her on his shoulders up and down the beach shouting her name, and returned her to her hysterical mother.

The Herald wants to put his picture on the front page: Local Man Finds Lost Girl. {actor.first} has a record in two states and would rather not have his face in the newspaper.`,
    options: [
      {
        text: 'Let them run it. Good for the town, good for you.',
        effects: [respect(5), heat('local', -4), evidence('actor', 3), op('actor', 5)],
        preview: 'A hero on page one. A prosecutor somewhere clips the picture for a file.',
      },
      {
        text: 'Ask the Herald to run it without his name or face.',
        effects: [respect(3), op('actor', 10)],
        preview: 'An anonymous good deed. The whole Boardwalk knows who it was anyway.',
      },
      {
        text: 'Give {actor.first} a bonus. Quietly.',
        effects: [money(-300), op('actor', 15), crewOp(2)],
        preview: 'The kind of man you want, rewarded the right way.',
      },
    ],
  },
  {
    id: 'tw_stand_fire',
    category: 'town',
    trigger: { weight: 7, cooldownWeeks: 52 },
    roles: { owner: townie('a stand owner whose business burned', { first: 'Phil', last: 'Gennaro', ethnicity: 'Italian', age: [45, 58], traits: ['Greedy'] }), actor: crewRole('the soldier who collects from him', { rank: ['soldier', 'associate'] }) },
    title: 'Smoke on the Boards',
    body: `A fire at three in the morning gutted {owner.name}'s arcade near the pier. The fire company saved the Boardwalk next to it. The fire marshal smells kerosene. The insurance company smells kerosene.

{owner.first} pays you every week through {actor.call}. Last month he told {actor.first} business was terrible and asked about "options." Now he wants you to tell the insurance investigator that Kessler's men have been threatening him. That would make it arson by a rival, not fraud by an owner.`,
    options: [
      {
        text: 'Back his story. Blame Kessler.',
        effects: [hook('owner', 'You covered his insurance fire', true), rivOp('kessler', -15), rivRes('kessler', { exposure: 10 }), heat('local', 3), money(1500)],
        preview: 'He collects and pays you a share. Kessler gets blamed for a fire he didn\'t set.',
      },
      {
        text: 'Stay out of it. He made his own mess.',
        effects: [op('owner', -15), heat('local', -2)],
        preview: 'He may go to jail. He may mention who he pays every week.',
      },
      {
        text: 'Tell him to withdraw the claim, and lend him money to rebuild.',
        effects: [money(-3000), op('owner', 20), biz('add', 'loansharking', 'piers')],
        preview: 'He owes you instead of the insurance company. That\'s a better kind of debt.',
      },
    ],
  },

  /* ------------------------------------------------------------ CHURCH */
  {
    id: 'ch_bishop_school',
    category: 'church',
    trigger: { minWeek: 20, weight: 7, once: true },
    roles: { priest: townie('the parish priest of Our Lady of the Dunes', { first: 'Dennis', last: 'Quinlan', ethnicity: 'Irish', age: [50, 62], traits: ['Pious', 'Honest'], office: 'pastor' }) },
    title: 'The New Wing',
    body: `The diocese is raising money for a new wing on the parish school: eight classrooms, a gymnasium, a cafeteria. The Bishop is coming from Camden to bless the shovel. {priest.name} has a list of donors and a plaque with spaces on it.

The biggest space is at the top. A name there would be read by every child who walks into the school for fifty years. Father Quinlan says, carefully, that the diocese is not able to accept anonymous gifts above a certain size, so the name would have to be real.`,
    options: [
      {
        text: 'Your name at the top. Ten thousand.',
        gate: { money: 10000 },
        effects: [money(-10000), respect(10), famOp(10), heat('local', -6), heat('federal', 2)],
        preview: 'Your name on a school forever. Reporters love to photograph plaques.',
      },
      {
        text: 'Your mother\'s name. Five thousand.',
        gate: { money: 5000 },
        effects: [money(-5000), famOp(12), respect(5), heat('local', -3)],
        preview: 'Your mother cries when she sees it. Nobody can write a mean story about a grandmother.',
      },
      {
        text: 'A small, anonymous gift.',
        effects: [money(-500), op('priest', 5)],
        preview: 'Your name is nowhere. Neither is your gratitude.',
      },
    ],
  },
  {
    id: 'ch_soup_kitchen',
    category: 'church',
    trigger: { season: 'offseason', months: [12, 1, 2], weight: 8, cooldownWeeks: 52 },
    roles: { nun: townie('a nun who runs the off-season soup kitchen', { first: 'Mary Bernard', last: 'Walsh', gender: 'F', ethnicity: 'Irish', age: [55, 70], traits: ['Pious', 'Honest'] }) },
    title: 'Sister Mary Bernard\'s Kitchen',
    body: `In winter, Wildwood is a different town: no jobs, no tourists, families living in summer cottages with no heat. Sister {nun.first} runs a soup kitchen in the parish hall five days a week and has never once asked anybody for anything, until today.

She sits across from you at the Ivanhoe in her black habit and asks for whatever your restaurants throw away at the end of the night. "God doesn't care whose bread it is," she says. "He cares whether it gets eaten."`,
    options: [
      {
        text: 'Every restaurant you own sends everything, every night.',
        effects: [money(-400), respect(5), famOp(5), op('nun', 25)],
        preview: 'The kitchen is full all winter. Your cooks grumble about the extra work.',
      },
      {
        text: 'Better: send her fresh food, not leftovers. On you.',
        effects: [money(-2000), respect(8), famOp(6), op('nun', 35), heat('local', -4)],
        preview: 'The whole parish knows. Nuns are terrible at keeping good deeds secret.',
      },
      {
        text: 'Tell her you\'ll think about it.',
        effects: [op('nun', -5)],
        preview: 'She thanks you and goes. She\'ll pray for you, which is somehow worse.',
      },
    ],
  },
  {
    id: 'ch_st_joseph',
    category: 'church',
    trigger: { months: [3], weight: 20, cooldownWeeks: 40 },
    roles: { mother: famRole('your mother', 'mother') },
    title: 'St. Joseph\'s Table',
    body: `March 19th. Your mother has built a St. Joseph's table in the parish hall the way her mother did in Sicily: three tiers covered with bread shaped like crosses and staffs, fava beans, fennel, fried fish, and hundreds of zeppole with custard and a cherry. Anybody can come and eat. That's the point. Nobody who is hungry is turned away.

This year she wants your men to serve, in aprons. All of them.`,
    options: [
      {
        text: 'Every man in an apron. No exceptions.',
        effects: [crewOp(-2), respect(6), famOp(8), op('mother', 25), heat('local', -3)],
        preview: 'Your soldiers grumble and then fight over who carries the zeppole. Good for everybody.',
      },
      {
        text: 'You serve, alone, all day.',
        effects: [op('mother', 30), famOp(5), respect(3), stress(-5)],
        preview: 'The boss in an apron. The town has never seen anything like it.',
      },
      {
        text: 'Send money for the table, but you have business.',
        effects: [money(-300), op('mother', -10)],
        preview: 'Your mother serves without you. She doesn\'t mention it. She doesn\'t have to.',
      },
    ],
  },

  /* ------------------------------------------------------------ POLITICS */
  {
    id: 'po_abc_board',
    category: 'politics',
    trigger: { hasBusiness: 'bar', weight: 7, cooldownWeeks: 52 },
    roles: { official: official('a hearing examiner at the state liquor board', 'ABC hearing examiner', { first: 'Milton', last: 'Gross', ethnicity: 'Jewish', age: [50, 62], traits: ['Honest', 'Patient'] }) },
    title: 'A Hearing in Trenton',
    body: `The State Division of Alcoholic Beverage Control has scheduled a hearing in Trenton on one of your liquor licenses. Somebody told them the real owner isn't the man on the license. Somebody is right.

Hearing Examiner {official.name} has a reputation as the one man in Trenton who doesn't eat lunch with anybody. Your lawyer says you can fight it, fold it, or find another way.`,
    options: [
      {
        text: 'Fight it. Your front man testifies that he owns it.',
        effects: [money(-2000), evidence('player', 4), heat('local', 2)],
        preview: 'You might win. Your front man under oath is a risk all its own.',
      },
      {
        text: 'Sell the license to a real person and lease it back.',
        effects: [money(-3000), evidence('player', -4)],
        preview: 'Legal, clean, and expensive.',
      },
      {
        text: 'Find out whose lunch the examiner does eat.',
        gate: { trait: 'Charming' },
        effects: [favor(-1), heat('local', 4), hook('official', 'He made your hearing go away')],
        preview: 'Everyone eats lunch with somebody. The State Police keep track of lunches.',
      },
    ],
  },
  {
    id: 'po_assemblyman',
    category: 'politics',
    trigger: { minWeek: 26, weight: 7, cooldownWeeks: 52 },
    roles: { pol: official('a state assemblyman from the shore district', 'state assemblyman', { first: 'Lyman', last: 'Teague', ethnicity: 'Irish', age: [45, 58], traits: ['Greedy', 'Charming'] }) },
    title: 'A Bill About Games of Chance',
    body: `Assemblyman {pol.name} has a bill in Trenton that would license the Boardwalk's games of chance: the wheels, the bottle toss, the crane games. On paper it's about honesty. In practice it means somebody in the state government decides who gets the licenses.

He'd like a campaign contribution and an understanding. The licenses could go to friends. Or the bill could die in committee, which also costs money.`,
    options: [
      {
        text: 'Fund the bill. Make sure your friends get the licenses.',
        effects: [money(-3000), hook('pol', 'He wrote your games into law', true), infl('boardwalk', 6), evidence('player', 3)],
        preview: 'Legal games run by you. The licensing board becomes everybody\'s target.',
      },
      {
        text: 'Pay to kill it in committee.',
        effects: [money(-2000), favor(1), respect(2)],
        preview: 'Nothing changes on the Boardwalk. Which is the point.',
      },
      {
        text: 'Let it go wherever it goes.',
        effects: [op('pol', -10)],
        preview: 'Maybe it passes, maybe it dies. Either way, you didn\'t buy anyone.',
      },
    ],
  },

  /* ------------------------------------------------------------ ROMANCE (non-explicit) */
  {
    id: 'ro_old_flame',
    category: 'romance-nonexplicit',
    trigger: { minWeek: 10, weight: 6, once: true },
    roles: { flame: townie('a woman the boss loved before the war, now widowed', { first: 'Lorraine', last: 'Mancuso', gender: 'F', ethnicity: 'Italian', age: [36, 46], traits: ['Charming', 'Honest'] }), spouse: famRole('your wife', 'spouse') },
    title: 'Lorraine Comes Home',
    body: `{flame.name} has come back to Wildwood after twenty years in Baltimore. Her husband died last winter. She's opened a little gift shop on the Boardwalk: seashell lamps, postcards, ceramic dogs. She was the girl you were going to marry before the war and before everything else.

She doesn't need money. She needs a lease renewed on her shop, which happens to be in a building you control. She asked your capo, not you. When you walk past her window she waves, and she has the same laugh.`,
    options: [
      {
        text: 'Renew her lease at a fair price. Through your capo. Stay away.',
        effects: [op('flame', 10), stress(2)],
        preview: 'The right thing, at a distance. You walk the other side of the Boardwalk now.',
      },
      {
        text: 'Renew it yourself, in person. Have a coffee. Just a coffee.',
        effects: [op('flame', 20), op('spouse', -10), stress(-4), secret('player', 'affair')],
        preview: 'Just coffee. Wildwood is a small town and your wife has friends.',
      },
      {
        text: 'Tell {spouse.first} about her, before anyone else does.',
        gate: { trait: 'Honest' },
        effects: [op('spouse', 10), op('flame', 5), famOp(3)],
        preview: 'Your wife buys a seashell lamp from Lorraine to make a point. The two women become friends, terrifyingly.',
      },
    ],
  },
  {
    id: 'ro_sister_suitor',
    category: 'romance-nonexplicit',
    trigger: { rivalAlive: 'manno', weight: 6, once: true, minWeek: 20 },
    roles: { sister: famRole('your widowed sister', 'sister', { gender: 'F' }), suitor: rivalMan('manno', 'a polite Manno soldier courting your sister', { first: 'Frankie', last: 'Russo', nickname: 'Gentleman Frankie', ethnicity: 'Italian', age: [40, 50], traits: ['Charming', 'Loyal-to-a-fault'] }) },
    title: 'Gentleman Frankie',
    body: `Your sister {sister.first} has been a widow for four years and has a new suitor: {suitor.call}, who sends flowers, takes her to dinner in Cape May, opens car doors, and has been a soldier for Carmine Manno for twenty years.

{sister.first} knows. She doesn't care. "He's kind to me," she says. "Do you know how long it's been since anybody was kind to me?" You don't know if Frankie is in love with your sister or in love with what your sister knows.`,
    options: [
      {
        text: 'Give them your blessing. Kindness is rare.',
        effects: [op('sister', 25), rivOp('manno', 8), secret('suitor', 'informant', 'manno'), stress(4)],
        preview: 'Your sister is happy. Something you say at Sunday dinner might reach Atlantic City.',
      },
      {
        text: 'Have a talk with Frankie. Man to man.',
        effects: [op('suitor', 10), op('sister', 5), flag('frankie_talk')],
        preview: 'He swears on his mother he loves her. He might even mean it.',
      },
      {
        text: 'Forbid it. Not a Manno man. Not in this family.',
        effects: [op('sister', -30), famOp(-6), rivOp('manno', -5)],
        preview: 'Your sister stops coming to Sunday dinner. Frankie keeps sending flowers.',
      },
    ],
  },
];

