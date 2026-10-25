import type { PackEvent } from './storyDataSchema';
import {
  alliance, biz, carried, crewOp, crewRole, evidence, famOp, famRole, favor, flag, heat, hook, infl, leave, money, op, respect, rivOp, rivRes, rivalBoss, rivalMan, stress, thenFx as then, townie, unwashed,
} from './storyDataSchema';

/**
 * Chains C
 * 11. The Ice Men           (ice_*)  a jewel-thief crew wants your fence
 * 12. Skee-Ball             (rom_*)  your heir and Danny Kessler's daughter (non-explicit)
 * 13. The Canary            (can_*)  informant hunt
 * 14. The Valachi Autumn    (val_*)  September-October 1963
 * 15. Convention Week       (con_*)  the 1964 Democratic National Convention, Atlantic City
 */
export const CHAINS_C: PackEvent[] = [
  /* ================================================================ */
  /* 11. THE ICE MEN                                                   */
  /* ================================================================ */
  {
    id: 'ice_1',
    category: 'vice',
    chain: { id: 'ice_men', part: 1 },
    trigger: { season: 'summer', minWeek: 6, once: true, weight: 10 },
    roles: {
      lark: townie('the leader of a traveling jewel-thief crew', { first: 'Sheldon', last: 'Lark', nickname: 'Teddy', ethnicity: 'Jewish', age: [38, 48], traits: ['Charming', 'Patient'] }),
      kip: townie('the youngest of the thieves', { first: 'Kip', last: 'Halloran', ethnicity: 'Irish', age: [20, 24], traits: ['Cowardly'] }),
    },
    title: 'Gentlemen From Miami Beach',
    body: `{lark.call} has a seersucker suit, a Miami Beach tan and two partners who stay in the car. They winter in Florida and summer at the shore, and they are very, very good at getting into the big Victorian houses in Cape May while the owners are at the Coast Guard dance.

What they are not good at is selling what they take. Teddy would like to use your fence, at the usual percentage, with his compliments. "We don't carry," he says. "We don't hurt anybody. We don't even wake the dog." The kid in the back seat, {kip.first}, has his window rolled down and is listening very hard.`,
    options: [
      {
        text: 'Your fence handles their goods. Twenty percent.',
        effects: [biz('add', 'fencing', 'docks'), money(3000), heat('local', 4), flag('ice_partner'), then('ice_2', 2, 4, 1)],
        preview: 'Steady money from somebody else\'s risk. Their mistakes become your mistakes.',
      },
      {
        text: 'They can work the county. They pay a street tax and use somebody else\'s fence.',
        effects: [money(1200), respect(2), then('ice_3', 4, 7, 0.5)],
        preview: 'A taste without the exposure. Burglars who don\'t trust you also don\'t protect you.',
      },
      {
        text: 'Not in Cape May County. Go home to Florida, gentlemen.',
        effects: [respect(3), heat('local', -2), op('lark', -15)],
        preview: 'Clean. They\'ll work Ocean City instead and sell through Atlantic City.',
      },
    ],
  },
  {
    id: 'ice_2',
    category: 'rivals',
    chain: { id: 'ice_men', part: 2 },
    trigger: { chainOnly: true },
    roles: { lark: carried('the thief'), sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'The Brooch',
    body: `Your fence calls you down to the back of his shop to look at one piece from Teddy's latest haul: a sapphire brooch shaped like a swallow, with a jeweler's mark from Sansom Street in Philadelphia. Your fence knows the piece. Half of South Philly knows the piece.

It belongs to a lady with a cottage in the Crest, a lady who is not Mrs. Moretti but whom {sal.name} visits on Thursdays. Sal bought her the swallow. Mrs. Moretti, back in Philadelphia, has never seen it, and Sal would very much like to keep it that way.`,
    options: [
      {
        text: 'Return it to Sal yourself, discreetly, with no questions asked.',
        effects: [hook('sal', 'You know about the cottage in the Crest', true), rivOp('philly', 10), op('lark', -10), then('ice_3', 3, 6, 1)],
        preview: 'Sal owes you, and he knows that you know. A capo hates being grateful.',
      },
      {
        text: 'Break it up and sell the stones. A brooch that doesn\'t exist can\'t embarrass anyone.',
        effects: [money(4000), heat('family', 3), then('ice_3', 3, 6, 1)],
        preview: 'Good money. If Sal ever hears where his swallow went...',
      },
      {
        text: 'Tell Sal who took it. Let Philadelphia deal with the thieves.',
        effects: [rivOp('philly', 12), heat('family', -5), leave('lark', 'exile'), respect(-3), then('ice_3', 3, 6, 0.5)],
        preview: 'Sal is pleased. Thieves along the whole coast learn not to trust your fence.',
      },
    ],
  },
  {
    id: 'ice_3',
    category: 'law',
    chain: { id: 'ice_men', part: 3 },
    trigger: { chainOnly: true },
    roles: { kip: carried('the young thief'), lark: carried('the thief') },
    title: 'Hot Ice',
    body: `County detectives walk into a pawnshop in Rio Grande and walk out with {kip.name}, who tried to sell a lady's gold wristwatch to a man who'd been told to watch for it. The kid is twenty-two and has never seen the inside of a cell. He's in one now, in Cape May Court House, and he knows the name of your fence and the street your fence lives on.

{lark.first} calls from a pay phone in Delaware. "He's a good kid," Teddy says. "He's a scared kid. Those are two different things."`,
    immediate: [heat('local', 5)],
    options: [
      {
        text: 'Pay his bail and get him a lawyer who explains how quiet works.',
        gate: { money: 2000 },
        effects: [money(-2000), op('kip', 20), evidence('player', -3), then('ice_4', 4, 8, 0.8)],
        preview: 'He stays quiet. The prosecutor wonders who\'s paying for a burglar\'s lawyer.',
      },
      {
        text: 'Let him sit. Close the fence for a month.',
        effects: [biz('close', 'fencing', undefined, 4), op('kip', -20), evidence('player', 4), then('ice_4', 4, 8, 0.5)],
        preview: 'Cheaper. A scared kid alone in a cell starts doing arithmetic.',
      },
      {
        text: 'Get word to him through a guard: keep quiet and his mother gets an envelope every month.',
        effects: [money(-1000), hook('kip', 'His silence is on your payroll'), heat('local', 2), then('ice_4', 4, 8, 0.8)],
        preview: 'Cheaper than a lawyer and almost as effective. Guards talk too.',
      },
    ],
  },
  {
    id: 'ice_4',
    category: 'vice',
    chain: { id: 'ice_men', part: 4 },
    trigger: { chainOnly: true, season: 'summer' },
    roles: { lark: carried('the thief'), bellhop: crewRole('an associate who works as a bellhop at a Boardwalk hotel', { rank: 'associate' }) },
    title: 'The Jewelers\' Convention',
    body: `Teddy wants one last score before he retires to a condominium in Fort Lauderdale. A traveling jewelers' convention is booked into a big hotel on the Boardwalk: forty salesmen, forty sample cases, one hotel safe.

He needs one thing from you: {bellhop.call}, who carries bags at that hotel and knows which night the manager plays cards. "Your cut is a third," Teddy says. "The insurance companies will pay. Nobody gets hurt. It's the most victimless crime since bingo."`,
    options: [
      {
        text: 'Do it. A third of forty sample cases.',
        effects: [money(12000), heat('local', 12), heat('federal', 6), evidence('bellhop', 15), op('bellhop', 10), unwashed(8000)],
        preview: 'The score of the decade. Every detective on the shore spends August looking for it.',
      },
      {
        text: 'Lend him the bellhop, but your name stays out of it. Ten percent.',
        effects: [money(4000), heat('local', 6), evidence('bellhop', 10), op('bellhop', -5)],
        preview: 'Less money, less risk. The bellhop carries the risk instead of you.',
      },
      {
        text: 'Tip off the hotel. Let Teddy find another town.',
        effects: [respect(-3), heat('local', -6), op('lark', -40), crewOp(-2), favor(1)],
        preview: 'The hotel is grateful, and so is the police chief. Teddy knows exactly who talked.',
      },
    ],
  },

  /* ================================================================ */
  /* 12. SKEE-BALL (romance, non-explicit)                             */
  /* ================================================================ */
  {
    id: 'rom_1',
    category: 'romance-nonexplicit',
    chain: { id: 'skee_ball', part: 1 },
    trigger: { season: 'summer', rivalAlive: 'kessler', once: true, weight: 12 },
    roles: {
      heir: famRole('your heir, a son of courting age', 'heir', { gender: 'M', age: [17, 24] }),
      girl: rivalMan('kessler', 'Danny Kessler\'s daughter', { first: 'Maureen', last: 'Kessler', gender: 'F', ethnicity: 'Irish', age: [17, 21], traits: ['Charming', 'Honest'] }),
      rival: rivalBoss('kessler', 'Danny Kessler'),
    },
    title: 'Skee-Ball',
    body: `Your soldiers report it the way soldiers report everything, which is to say badly and with a lot of throat-clearing. {heir.first} has been spending his evenings at the Skee-Ball alley on the pier with a red-haired girl. He's won her a stuffed giraffe the size of a fire hydrant. They walk the Boardwalk until the tram cars stop and share a box of saltwater taffy on the steps of the Convention Hall.

The girl is {girl.first} Kessler. Danny Kessler's oldest. She goes to a Catholic girls' school in Philadelphia and wants to be a nurse. {heir.first} hasn't said a word about her at home, which is how you know it's serious.`,
    options: [
      {
        text: 'Forbid it. Kessler is a rival and it\'s a summer fling.',
        effects: [op('heir', -20), famOp(-3), flag('rom_forbid'), then('rom_2', 2, 4, 1)],
        preview: 'He says yes, sir. He means something else.',
      },
      {
        text: 'Say nothing. Let him have his summer.',
        effects: [op('heir', 5), then('rom_2', 2, 4, 1)],
        preview: 'Youth is short. So is Danny Kessler\'s temper.',
      },
      {
        text: 'Have the girl and her family to Sunday dinner. Open the door.',
        gate: { trait: 'Charming' },
        effects: [op('heir', 20), rivOp('kessler', 10), famOp(3), flag('rom_open'), then('rom_2', 2, 4, 1)],
        preview: 'Gravy and Irish whiskey at one table. Your mother will need a rosary.',
      },
    ],
  },
  {
    id: 'rom_2',
    category: 'rivals',
    chain: { id: 'skee_ball', part: 2 },
    trigger: { chainOnly: true },
    roles: { heir: carried('your heir'), girl: carried('Kessler\'s daughter'), rival: carried('Danny Kessler') },
    title: 'Danny Calls',
    body: `{rival.name} calls your house himself, at dinner time, which is a breach of manners on purpose. "Your boy," he says, "is walking my daughter home at midnight past three of my bars and two of yours. I'd like to know if this is a romance or a strategy."

There's a pause on the line. Behind him you can hear a television and a woman telling him to be nice. "Because if it's a romance," Kessler says, a little quieter, "Maureen likes him. God help me, she likes him."`,
    options: [
      {
        text: 'Tell him it\'s a romance, and you\'re as worried as he is.',
        effects: [rivOp('kessler', 15), op('heir', 5), then('rom_3', 4, 6, 1)],
        preview: 'Two fathers, one problem. That\'s more than most rivals ever share.',
      },
      {
        text: 'Tell him a {house} doesn\'t need an Irish bar owner\'s permission.',
        effects: [rivOp('kessler', -20), respect(4), then('rom_3', 4, 6, 1)],
        preview: 'Pride on both sides of 26th Street. The kids are caught in the middle.',
      },
      {
        text: 'Suggest, carefully, that the kids could be a bridge between your houses.',
        gate: { trait: 'Ambitious' },
        effects: [rivOp('kessler', 5), op('heir', -5), flag('rom_strategy'), then('rom_3', 4, 6, 1)],
        preview: 'Danny hears the strategy in it. So, eventually, will your son.',
      },
    ],
  },
  {
    id: 'rom_3',
    category: 'romance-nonexplicit',
    chain: { id: 'skee_ball', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { heir: carried('your heir'), girl: carried('Kessler\'s daughter'), sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'Labor Day',
    body: `The last night of the season. The stands are pulling down their shutters, the lifeguards are burning their benches on the beach the way they do every year, and {heir.first} comes into your study in a pressed shirt and asks to speak to you as a man.

He wants to marry {girl.first} Kessler. Not now, he says. After she finishes nursing school. But he wants your blessing now, so he can tell her father. You think of Danny. You think of Philadelphia, where {sal.name} believes Irish independents should be absorbed, not married. You think of yourself at his age, at a dance at St. Ann's, and a girl in a yellow dress.`,
    options: [
      {
        text: 'Give him your blessing.',
        effects: [op('heir', 30), alliance('kessler', 'heir'), rivOp('kessler', 25), rivOp('philly', -10), heat('family', 5), flag('rom_engaged'), then('rom_4', 20, 30, 1)],
        preview: 'An alliance with North Wildwood through the best possible reason. Philadelphia hates it.',
      },
      {
        text: 'Tell him to wait a year. If it\'s real, it will keep.',
        effects: [op('heir', -5), stress(-3), flag('rom_wait'), then('rom_4b', 20, 40, 0.6)],
        preview: 'Reasonable. Young people in love are rarely reasonable.',
      },
      {
        text: 'No. Not a Kessler. Never.',
        effects: [op('heir', -40), famOp(-6), rivOp('kessler', -10), rivOp('philly', 5), then('rom_4b', 6, 12, 0.8)],
        preview: 'Philadelphia approves. Your son looks at you like a stranger.',
      },
    ],
  },
  {
    id: 'rom_4',
    category: 'family',
    chain: { id: 'skee_ball', part: 4 },
    trigger: { chainOnly: true, flag: 'rom_engaged' },
    roles: { heir: carried('your heir'), girl: carried('Kessler\'s daughter'), rival: carried('Danny Kessler'), sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'Two Parishes, One Wedding',
    body: `The engagement has started a war, just not the kind you were expecting. Your mother wants the wedding at your parish with a Mass in Latin and Italian hymns. Danny's mother wants it at hers with a Mass in Latin and a piper. Both grandmothers have stopped speaking to the monsignor.

Meanwhile {sal.name} sends word that he'll attend, which is a compliment, and that he'll be seated at the head table, which is a demand. Danny Kessler says Philadelphia can sit with the cousins.`,
    options: [
      {
        text: 'Kessler\'s parish, Sal at the head table. Everyone gets half.',
        effects: [rivOp('kessler', 5), rivOp('philly', 8), famOp(-4), money(-3000)],
        preview: 'A diplomatic wedding. Your mother sits through it like a hostage.',
      },
      {
        text: 'Your parish, your rules. Sal at the head table.',
        effects: [famOp(6), rivOp('philly', 10), rivOp('kessler', -10), money(-4000)],
        preview: 'The Italian side is delighted. The bride\'s father spends the reception in the parking lot.',
      },
      {
        text: 'Let the kids elope to a justice of the peace and throw a party for everyone after.',
        effects: [op('heir', 20), famOp(-8), rivOp('philly', -8), rivOp('kessler', 8), money(-2000), respect(-2)],
        preview: 'The young couple is happy. Both grandmothers unite, finally, against you.',
      },
    ],
  },
  {
    id: 'rom_4b',
    category: 'family',
    chain: { id: 'skee_ball', part: 4 },
    trigger: { chainOnly: true },
    roles: { heir: carried('your heir'), girl: carried('Kessler\'s daughter'), rival: carried('Danny Kessler') },
    title: 'A Postcard From Maryland',
    body: `It arrives on a Tuesday: a postcard of a county courthouse in Maryland, in {heir.first}'s handwriting. "Married this morning. She's wonderful. Please don't be angry. Please tell Mom."

Twenty minutes later the phone rings. It's Danny Kessler, and for once he isn't angry either. He sounds like a man who's been hit by a wave he saw coming. "Well," he says. "I suppose we're family now. God help both of us."`,
    options: [
      {
        text: 'Welcome them home. Throw the biggest party the island has ever seen.',
        effects: [money(-4000), op('heir', 30), alliance('kessler', 'heir'), rivOp('kessler', 20), rivOp('philly', -12), famOp(5)],
        preview: 'The family is whole and the Irish are in-laws. Philadelphia sends a very small gift.',
      },
      {
        text: 'Cut him off. No money, no place in the business, until he comes back alone.',
        effects: [op('heir', -50), famOp(-10), rivOp('kessler', -15), respect(3), stress(10)],
        preview: 'The old way. Your wife doesn\'t speak to you at dinner, and it\'s a long winter.',
      },
      {
        text: 'Accept the marriage, quietly, and make Danny pay for the reception.',
        gate: { trait: 'Greedy' },
        effects: [op('heir', 10), alliance('kessler', 'heir'), rivOp('kessler', -5), money(1000)],
        preview: 'Everyone\'s married, and you\'re ahead. Danny will tell this story at your funeral.',
      },
    ],
  },

  /* ================================================================ */
  /* 13. THE CANARY                                                    */
  /* ================================================================ */
  {
    id: 'can_1',
    category: 'law',
    chain: { id: 'canary', part: 1 },
    trigger: { minWeek: 14, heatAbove: { local: 40 }, hasBusiness: 'cardgame', once: true, weight: 14 },
    roles: {
      s1: crewRole('a soldier who knew the new address', { rank: ['soldier', 'capo'] }),
      s2: crewRole('a second man who knew', { rank: ['soldier', 'capo'], notRole: ['s1'] }),
      s3: crewRole('a third man who knew', { rank: ['soldier', 'associate'], notRole: ['s1', 's2'] }),
      prosecutor: rivalBoss('law', 'the Cape May County Prosecutor'),
    },
    title: 'The Night the Game Moved',
    body: `You moved the Saturday card game from above the Anchor Bar to the back room of a laundromat on Spencer Avenue. You did it on a Friday. You told exactly four men: {s1.call}, {s2.call}, {s3.call}, and yourself.

On Saturday night at eleven-forty, {prosecutor.name}'s county detectives came through the laundromat's back door with a warrant that had the correct address typed on it. They took the money, the cards, the dentist from Cape May, and a photograph of you that will run in Monday's Herald.

One of three men. You've known all three of them since you were boys.`,
    immediate: [money(-2500), heat('local', 6), evidence('player', 4)],
    options: [
      {
        text: 'Set a trap. Tell each man a different date for the next big game.',
        gate: { trait: 'Patient' },
        effects: [flag('can_trap'), stress(6), then('can_2', 3, 4, 1)],
        preview: 'Whichever date the detectives raid tells you who. It costs you three weeks of looking them in the eye.',
      },
      {
        text: 'Have your consigliere quietly look at all three men\'s money.',
        effects: [money(-800), stress(4), then('can_2', 2, 4, 1)],
        preview: 'Rats get paid. Somebody has new tires, or a debt that disappeared.',
      },
      {
        text: 'Shut down every game for a month. Trust nobody.',
        effects: [biz('close', 'cardgame', undefined, 4), crewOp(-8), heat('local', -6), then('can_2', 4, 6, 1)],
        preview: 'Safe, expensive, and every man in the crew knows he\'s suspected.',
      },
    ],
  },
  {
    id: 'can_2',
    category: 'crew',
    chain: { id: 'canary', part: 2 },
    trigger: { chainOnly: true },
    roles: { s1: carried('first suspect'), s2: carried('second suspect'), s3: carried('third suspect') },
    title: 'New Tires',
    body: `The answer comes back pointing at {s2.call}. His mortgage on a little house in the Crest, behind for a year, got paid off in March. His wife has a new coat. And he's started going to Mass in Cape May instead of in town, which nobody does unless they don't want to be seen.

But {s1.first} is the one who's been nervous, and {s3.first} is the one who once did six months and came out saying nothing. And {s2.first} carried you home on his back from a dance in 1946 when you couldn't walk.`,
    options: [
      {
        text: 'It\'s {s2.first}. Act on it.',
        effects: [op('s2', -20), stress(5), flag('can_s2'), then('can_4', 1, 2, 1)],
        preview: 'The evidence is good. Good evidence has been wrong before.',
      },
      {
        text: 'Too neat. Somebody wants you to look at {s2.first}. Keep digging.',
        effects: [stress(8), then('can_3', 2, 3, 1)],
        preview: 'Caution. Meanwhile the real rat keeps talking.',
      },
      {
        text: 'Treat all three as rats until proven otherwise.',
        gate: { trait: 'Paranoid' },
        effects: [op('s1', -15), op('s2', -15), op('s3', -15), crewOp(-6), evidence('player', -5), then('can_3', 2, 3, 1)],
        preview: 'No more leaks for a while. Also no more friends.',
      },
    ],
  },
  {
    id: 'can_3',
    category: 'rivals',
    chain: { id: 'canary', part: 3 },
    trigger: { chainOnly: true },
    roles: { s1: carried('first suspect'), s2: carried('second suspect'), rival: rivalBoss('manno', 'Carmine Manno') },
    title: 'The Bartender\'s Cousin',
    body: `Your consigliere comes back with something nobody wanted: the money that paid {s2.first}'s mortgage came through a savings and loan in Atlantic City where {rival.name} owns the president. Could be a payoff from the prosecutor routed strangely. Could be Manno buying you a rat, or buying you the idea of a rat, so you'll do his work for him.

Meanwhile, {s1.call} was seen buying a round at a bar in Somers Point. The bartender there is a cousin of one of Keough's county detectives.`,
    options: [
      {
        text: 'It\'s {s1.first}. The bar, the cousin, the nerves. It fits.',
        effects: [op('s1', -20), flag('can_s1'), then('can_4', 1, 2, 1)],
        preview: 'You switch suspects. If you were wrong once you can be wrong twice.',
      },
      {
        text: 'Stay on {s2.first}. Manno doesn\'t pay off mortgages for fun.',
        effects: [op('s2', -15), flag('can_s2'), then('can_4', 1, 2, 1)],
        preview: 'Your first instinct. Manno may be laughing.',
      },
      {
        text: 'Hold a sit-down with both men, together. Watch who sweats.',
        gate: { trait: 'Charming' },
        effects: [stress(4), op('s1', -5), op('s2', -5), flag('can_sitdown'), then('can_4', 1, 2, 1)],
        preview: 'You read men for a living. Tonight it pays, or it doesn\'t.',
      },
    ],
  },
  {
    id: 'can_4',
    category: 'crew',
    chain: { id: 'canary', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { s2: carried('the suspect'), prosecutor: rivalBoss('law', 'the Cape May County Prosecutor') },
    title: 'Dawn at Otten\'s Harbor',
    body: `You take him out on a party boat at dawn, just the two of you and the captain who doesn't hear things. Halfway to the fishing grounds, {s2.first} stops pretending to bait his hook.

{prosecutor.name}'s men caught him two years ago on an income tax charge that would have taken the house. They let him go home if he'd talk to them twice a month. He told them about the game. He didn't tell them about the Causeway, or the motels, or you. He says that last part three times. Gulls follow the boat. The captain stays in the wheelhouse.`,
    options: [
      {
        text: 'Turn him. He keeps meeting the prosecutor, and tells them what you write.',
        effects: [hook('s2', 'He is your double agent now', true), evidence('player', -8), stress(8), flag('can_double'), then('can_5', 4, 8, 1)],
        preview: 'A rat on a leash. Leashes have two ends.',
      },
      {
        text: 'Put him on a bus to Arizona with his wife and a new name.',
        effects: [leave('s2', 'exile'), money(-3000), crewOp(-3), respect(-3), then('can_5', 4, 8, 1)],
        preview: 'Merciful and expensive. The prosecutor loses a witness and wants to know where he went.',
      },
      {
        text: 'Philadelphia\'s rules are Philadelphia\'s rules. The boat comes back with one less.',
        effects: [leave('s2', 'dies'), respect(12), crewOp(4), heat('federal', 8), heat('local', 8), stress(18), then('can_5', 4, 8, 1)],
        preview: 'The oldest rule kept. A missing informant is the worst kind of headline.',
      },
      {
        text: 'Turn the boat around. Forgive him, and pay his tax bill.',
        effects: [money(-4000), op('s2', 40), crewOp(-10), respect(-8), hook('s2', 'You forgave the unforgivable', true)],
        preview: 'He will die for you now. The rest of the crew wonders what it would take for you to forgive them.',
      },
    ],
  },
  {
    id: 'can_5',
    category: 'law',
    chain: { id: 'canary', part: 5 },
    trigger: { chainOnly: true },
    roles: { prosecutor: rivalBoss('law', 'the Cape May County Prosecutor') },
    title: 'Grand Jury Week',
    body: `The grand jury sits in Cape May Court House for a week in a room with a broken radiator. {prosecutor.name} calls nineteen witnesses: two waitresses, a dentist, a laundromat owner, a cab dispatcher, and fourteen men who say they don't remember anything in fourteen different ways.

On Friday the grand jury returns no indictment against anyone with your last name. On Saturday, the prosecutor's office leaks to the Herald that "the investigation is ongoing and has new sources." That last word is the one you can't stop reading.`,
    options: [
      {
        text: 'Celebrate. Buy the whole Anchor Bar a round.',
        effects: [money(-600), respect(6), crewOp(5), heat('local', 4)],
        preview: 'The men need it. Celebrating a grand jury is a story the Herald will love.',
      },
      {
        text: 'Order every man to stay off the phone for six months.',
        effects: [crewOp(-4), evidence('player', -6), heat('federal', -4), money(-1500)],
        preview: 'Inconvenient, slow, and safe. Business by pay phone and pastry shop.',
      },
      {
        text: 'Assume "new sources" means somebody else. Start over.',
        gate: { trait: 'Paranoid' },
        effects: [stress(10), evidence('player', -4), crewOp(-5), flag('can_again')],
        preview: 'Probably true. Probably also what the prosecutor wants you to think.',
      },
    ],
  },

  /* ================================================================ */
  /* 14. THE VALACHI AUTUMN                                            */
  /* ================================================================ */
  {
    id: 'val_1',
    category: 'history',
    chain: { id: 'valachi', part: 1 },
    trigger: { between: { from: { y: 1963, m: 9 }, to: { y: 1963, m: 10 } }, once: true, mandatory: true },
    roles: { actor: crewRole('a nervous capo', { rank: 'capo' }) },
    title: 'On Every Television in the Ivanhoe',
    body: `The bartender at the Ivanhoe usually keeps the TV on the Phillies. This week it's tuned to a Senate hearing room in Washington, where a small, tired soldier from New York is describing, in a flat voice and on live television, the organization nobody is supposed to admit exists. He gives it a name. He draws a chart. Senators lean into their microphones.

Nobody at the bar talks. Nobody orders. {actor.call} watches with his drink sweating in his hand, then says, to no one: "He took the oath. Same as us. Same words." He puts the glass down. "What's it worth, then?"`,
    immediate: [heat('federal', 8)],
    options: [
      {
        text: 'Turn the TV off. Remind the room what a man is worth.',
        effects: [respect(5), crewOp(4), op('actor', 5), then('val_2', 2, 4, 1)],
        preview: 'The room straightens up. The hearings go on without you watching.',
      },
      {
        text: 'Laugh. Tell them New York always had a big mouth.',
        gate: { trait: 'Charming' },
        effects: [crewOp(6), stress(-5), then('val_2', 2, 4, 1)],
        preview: 'The tension breaks. It comes back at three in the morning, but it breaks.',
      },
      {
        text: 'Watch every minute. Take notes on what the government knows.',
        gate: { trait: 'Patient' },
        effects: [evidence('player', -5), stress(4), flag('val_studied'), then('val_2', 2, 4, 1)],
        preview: 'The best briefing on the FBI you\'ll ever get, delivered free by the Senate.',
      },
    ],
  },
  {
    id: 'val_2',
    category: 'table',
    chain: { id: 'valachi', part: 2 },
    trigger: { chainOnly: true },
    roles: { sal: rivalBoss('philly', 'Sal "the Bag" Moretti'), actor: carried('the nervous capo') },
    title: 'Philadelphia Closes the Doors',
    body: `{sal.name}'s instructions arrive by a cousin, in person, not by phone. No new men get made this year. No meetings with more than four at the table. No talking business in cars, kitchens, or any building with a telephone. Anybody with a federal record goes on the shelf until spring.

Two of your best earners have federal records. One of them is {actor.call}. The cousin waits on your porch for an answer he can carry back.`,
    options: [
      {
        text: 'Comply in full. Shelve your men with records.',
        effects: [heat('family', -8), heat('federal', -5), money(-3000), op('actor', -15), crewOp(-4)],
        preview: 'Philadelphia is pleased. Your shelved men aren\'t earning and aren\'t happy.',
      },
      {
        text: 'Comply on paper. {actor.first} keeps working, through a cousin.',
        effects: [heat('family', 4), evidence('actor', 6), op('actor', 10)],
        preview: 'The money keeps coming. So might the questions.',
      },
      {
        text: 'Send the cousin back with a request: an exception for your two.',
        effects: [rivOp('philly', -5), heat('family', 3), op('actor', 8), then('val_3', 3, 6, 1)],
        preview: 'Sal will think about it. Sal thinks slowly when he\'s nervous.',
      },
    ],
  },
  {
    id: 'val_3',
    category: 'law',
    chain: { id: 'valachi', part: 3 },
    trigger: { chainOnly: true },
    roles: { reporter: townie('a wire-service reporter', { first: 'Gil', last: 'Hanrahan', ethnicity: 'Irish', age: [30, 45] }) },
    title: 'Your Square on the Chart',
    body: `A wire-service reporter named {reporter.name} catches you outside the bakery with a photostat of a government chart: boxes and lines, Philadelphia and its people. One of the boxes, low down on the right, says "South Jersey shore" and has a question mark in it.

"Is that you, Mr. {player.last}?" he asks, friendly as a puppy. "Because if it's not, you'd probably like to say so, and if it is, I'd sure like to know what you'd like to say."`,
    options: [
      {
        text: '"I sell cigarette machines. Have a cannoli."',
        effects: [heat('federal', 2), respect(2)],
        preview: 'A good line. It runs in forty newspapers next to the chart.',
      },
      {
        text: 'Walk away without a word.',
        effects: [heat('federal', 1), crewOp(2)],
        preview: 'No quote, no story. Your silence is the story.',
      },
      {
        text: 'Take him to lunch and talk about Carmine Manno at great length.',
        effects: [rivRes('manno', { exposure: 15 }), rivOp('manno', -8), heat('federal', -3)],
        preview: 'The question mark moves north on the chart. Manno can read too.',
      },
    ],
  },

  /* ================================================================ */
  /* 15. CONVENTION WEEK, AUGUST 1964                                  */
  /* ================================================================ */
  {
    id: 'con_1',
    category: 'history',
    chain: { id: 'convention', part: 1 },
    trigger: { between: { from: { y: 1964, m: 7 }, to: { y: 1964, m: 8 } }, once: true, mandatory: true },
    roles: { rival: rivalBoss('manno', 'Carmine Manno') },
    title: 'The Whole Country Comes to Atlantic City',
    body: `The Democratic Party is holding its national convention in Atlantic City at the end of August. Delegates, reporters, television crews, lobbyists, and everyone who follows them. The President will come. So will the Secret Service, the FBI, and every hotel detective on the East Coast.

The hotels in Atlantic City are full. The overflow is heading down the Parkway to the motels of Wildwood. {rival.name} sends word: Atlantic City is his town during convention week, and any business that follows the delegates south pays him a toll. He means it as a courtesy. It is not one.`,
    options: [
      {
        text: 'Partner with Manno for the week. Split the overflow money.',
        effects: [money(4000), rivOp('manno', 15), respect(-4), heat('federal', 4), then('con_2', 1, 2, 1)],
        preview: 'Peace and profit. Your men watch you take Manno\'s terms.',
      },
      {
        text: 'Wildwood\'s motels, Wildwood\'s money. Not a dime to Atlantic City.',
        effects: [money(6000), rivOp('manno', -15), respect(6), heat('federal', 5), then('con_2', 1, 2, 1)],
        preview: 'Every delegate who sleeps in Wildwood pays you. Manno takes it personally.',
      },
      {
        text: 'Shut the rooms down for the week. The whole federal government is in town.',
        effects: [money(-3000), heat('federal', -8), crewOp(-4), then('con_3', 1, 2, 1)],
        preview: 'Safe and broke. Your men watch every other outfit get rich.',
      },
    ],
  },
  {
    id: 'con_2',
    category: 'politics',
    chain: { id: 'convention', part: 2 },
    trigger: { chainOnly: true },
    roles: { delegate: townie('a convention delegate and congressional aide', { first: 'Warren', last: 'Pruitt', ethnicity: 'Irish', age: [36, 48], traits: ['Gambler', 'Drinker'] }) },
    title: 'The Delegate Who Couldn\'t Stop',
    body: `{delegate.name} is an alternate delegate and the chief aide to a congressman from the Midwest, which is how he got credentials and a hotel room he never sleeps in. Tonight he's at your back-room game on Pacific with a straw boater, a campaign button and a marker for $6,400 he cannot possibly pay.

At four in the morning he sobers up enough to understand his situation. "My boss," he says, "sits on the Judiciary Committee." He says it like an apology. He says it like an offer.`,
    options: [
      {
        text: 'Tear up the marker in front of him. A friend in Washington is worth more.',
        effects: [favor(3), hook('delegate', 'You tore up his marker', true), money(-1000), heat('federal', 2), then('con_3', 1, 2, 1)],
        preview: 'A man in the Congressman\'s office owes you everything. Federal favors are expensive to call in.',
      },
      {
        text: 'Collect. Every dollar, before he leaves the state.',
        effects: [money(6400), heat('federal', 6), op('delegate', -30), then('con_3', 1, 2, 1)],
        preview: 'He pays, in a panic. A panicked congressional aide is a dangerous thing to send home.',
      },
      {
        text: 'Halve it, and hold the rest as a standing marker.',
        gate: { trait: 'Patient' },
        effects: [money(3200), hook('delegate', 'He owes you $3,200 and knows why'), then('con_3', 1, 2, 1)],
        preview: 'Money now, leverage later. Leverage on federal men cuts both ways.',
      },
    ],
  },
  {
    id: 'con_3',
    category: 'law',
    chain: { id: 'convention', part: 3 },
    trigger: { chainOnly: true },
    roles: { actor: crewRole('a soldier who runs the overflow rooms', { rank: ['soldier', 'associate'] }) },
    title: 'Men in Gray Suits on the Boardwalk',
    body: `You can tell the federal men because they're the only ones on the Boardwalk in August wearing wool. They stand at the rail outside your motels and write down license plates. One of them buys a frozen custard and doesn't eat it.

{actor.call} comes in sweating through his shirt. Two of them followed him from the Causeway to the bank and back. "They're not even pretending," he says. "They want us to see them."`,
    immediate: [heat('federal', 5)],
    options: [
      {
        text: 'Send them coffee and doughnuts every morning, with your compliments.',
        gate: { trait: 'Charming' },
        effects: [respect(4), heat('federal', -2), crewOp(3), then('con_4', 1, 2, 1)],
        preview: 'Insolent and charming. The doughnuts go into a report.',
      },
      {
        text: 'Keep {actor.first} off the street until they leave.',
        effects: [money(-1500), op('actor', -5), evidence('actor', -5), then('con_4', 1, 2, 1)],
        preview: 'Lost earnings, no new photographs.',
      },
      {
        text: 'Business as usual. Let them watch.',
        effects: [money(2000), evidence('actor', 8), evidence('player', 4), then('con_4', 1, 2, 1)],
        preview: 'Money keeps flowing. So does film through the FBI\'s cameras.',
      },
    ],
  },
  {
    id: 'con_4',
    category: 'rivals',
    chain: { id: 'convention', part: 4 },
    trigger: { chainOnly: true, rivalAlive: 'manno' },
    roles: { rival: rivalBoss('manno', 'Carmine Manno') },
    title: 'After the Balloons',
    body: `The convention ends with balloons falling in Convention Hall in Atlantic City, and by Friday the delegates are gone, leaving behind campaign buttons in the sand and a lot of money in Atlantic City's pockets and some of it in yours.

{rival.name} also left something behind: two of his crews, who followed the overflow down to Wildwood and liked it here. They're running a dice game out of a motel on Ocean Avenue that isn't his to run games out of.`,
    options: [
      {
        text: 'Ask Philadelphia to rule on it at the Table.',
        effects: [heat('family', 3), rivOp('philly', 4), infl('crest', 3)],
        preview: 'Proper procedure. Philadelphia takes its time and its fee.',
      },
      {
        text: 'Run them off the island tonight.',
        effects: [respect(8), heat('local', 8), rivOp('manno', -20), infl('crest', 6)],
        preview: 'Fast and loud. Manno will want to answer.',
      },
      {
        text: 'Let them stay, for half their take.',
        effects: [money(2500), respect(-5), infl('crest', 4, 'manno'), rivOp('manno', 8)],
        preview: 'Profit now. A foothold for Atlantic City later.',
      },
    ],
  },
];
