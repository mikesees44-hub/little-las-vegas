import type { PackEvent } from './storyDataSchema';
import {
  biz, crewOp, crewRole, evidence, famOp, famRole, favor, flag, health, heat, hook, infl, leave, money, official, op,
  prison, rank, recruit, respect, rivOp, rivRes, rivalBoss, rivalMan, secret, stress, townie, unwashed,
} from './storyDataSchema';

/** Standalone events I: crew, family, rivals, law, table, vice. */
export const STANDALONE_1: PackEvent[] = [
  /* ------------------------------------------------------------ CREW */
  {
    id: 'cr_hothead_tourist',
    category: 'crew',
    trigger: { trait: 'Hot-headed', rank: ['soldier', 'associate'], season: 'summer', weight: 10 },
    roles: { actor: crewRole('a Hot-headed soldier', { rank: ['soldier', 'associate'] }) },
    title: 'The Councilman\'s Son',
    body: `A college boy in a madras jacket spilled a beer on {actor.call}'s new shoes outside a club on Pacific, said something about "guineas," and found himself sitting in the gutter holding his nose. Nobody would have cared, except the boy's father sits on Philadelphia's City Council and has already called three people about it, one of them a newspaper.

{actor.first} is unrepentant. "He said it twice," he says. "Once I could forgive."`,
    options: [
      {
        text: 'Make {actor.first} apologize, in person, with flowers for the mother.',
        effects: [op('actor', -15), heat('local', -5), respect(-2)],
        preview: 'The story dies. So does a little of {actor.first}\'s respect for you.',
      },
      {
        text: 'Pay the boy\'s doctor bills through a lawyer. Nobody apologizes.',
        effects: [money(-900), heat('local', -2), op('actor', 5)],
        preview: 'Money closes most wounds. Not the one in the councilman\'s pride.',
      },
      {
        text: 'Back your man. Some words cost a nose.',
        effects: [op('actor', 15), crewOp(4), heat('local', 6), heat('family', 3), respect(3)],
        preview: 'Your crew loves it. Philadelphia hates calls from City Hall.',
      },
    ],
  },
  {
    id: 'cr_drinker_loud',
    category: 'crew',
    trigger: { trait: 'Drinker', rank: ['capo', 'soldier'], weight: 10 },
    roles: { actor: crewRole('a capo or soldier with trait Drinker', { rank: ['capo', 'soldier'] }) },
    title: 'Last Call at the Anchor',
    body: `{actor.call} had six highballs at the Anchor Bar on Thursday and explained, at length and to the whole room, exactly how the Causeway pickup works, which motels pay, and which one of the commissioners likes the Phillies' box seats.

The bartender's brother-in-law is a county detective. The bartender says he didn't hear a thing. He says it very quickly.`,
    options: [
      {
        text: 'Dry him out. No more bars for {actor.first}. Coffee and church.',
        effects: [op('actor', -15), evidence('actor', -4), health('actor', 5)],
        preview: 'A sober man is a careful man. A dry man is a resentful one.',
      },
      {
        text: 'Change the Causeway pickup. Everything he said is now wrong.',
        effects: [money(-1200), evidence('player', -3), stress(3)],
        preview: 'Expensive housekeeping. He\'ll drink again; drinkers do.',
      },
      {
        text: 'Take care of the bartender. A raise, from you.',
        effects: [money(-600), hook('actor', 'You cleaned up after his mouth'), heat('local', 2)],
        preview: 'Two men now owe their silence to your wallet.',
      },
    ],
  },
  {
    id: 'cr_pious_holyweek',
    category: 'church',
    trigger: { trait: 'Pious', rank: ['soldier', 'associate'], months: [3, 4], weight: 8 },
    roles: {
      actor: crewRole('a Pious soldier', { rank: ['soldier', 'associate'] }),
      capo: crewRole('his capo', { rank: 'capo', sameRegimeAs: 'actor' }),
    },
    title: 'Not on Good Friday',
    body: `{actor.call} won't collect during Holy Week. Not the numbers, not the vig, not the cigarette machines. He'll fast, he'll walk the Stations of the Cross at Our Lady of the Dunes, he'll carry his grandmother up the church steps, but he will not knock on a man's door for money between Palm Sunday and Easter.

{capo.call} is furious. "It's a week," he says. "God can count. So can I."`,
    options: [
      {
        text: 'Let him have his week. A man\'s soul is his own business.',
        effects: [op('actor', 15), op('capo', -10), money(-500), famOp(3)],
        preview: 'Pious men are loyal men. Capos don\'t like being overruled about faith.',
      },
      {
        text: 'Side with the capo. Business is business.',
        effects: [op('actor', -15), op('capo', 10), money(300)],
        preview: 'He works. He prays harder. He prays about you.',
      },
      {
        text: 'Collect his route yourself on Good Friday. Make a point to everybody.',
        gate: { trait: 'Pious' },
        effects: [op('actor', 10), op('capo', 5), respect(5), stress(3)],
        preview: 'The boss doing a soldier\'s work on a holy day, so the soldier doesn\'t have to. It gets talked about.',
      },
    ],
  },
  {
    id: 'cr_coward_ran',
    category: 'crew',
    trigger: { trait: 'Cowardly', rank: ['soldier', 'associate'], rivalAlive: 'manno', weight: 9 },
    roles: { actor: crewRole('a Cowardly soldier', { rank: ['soldier', 'associate'] }), witness: crewRole('a soldier who was there', { rank: 'soldier', notRole: ['actor'] }) },
    title: 'He Ran',
    body: `Three of Manno's men stopped your Causeway truck at the light by the bridge on Tuesday and asked whose cigarettes those were. {witness.call} stood his ground. {actor.call} ran into a gas station men's room and locked the door.

Nobody was hurt. Manno's men laughed and drove off. But they laughed, and now everybody on the Causeway knows the story, including the gas station attendant, who tells it best.`,
    options: [
      {
        text: 'Take his button. A man who runs isn\'t a soldier.',
        effects: [rank('actor', 'associate'), op('actor', -25), crewOp(4), respect(3)],
        preview: 'The crew agrees. He\'s a quiet, humiliated man now; those can be dangerous.',
      },
      {
        text: 'Move him to the books. Some men count better than they fight.',
        effects: [op('actor', 10), crewOp(-3), money(400)],
        preview: 'A good use of a nervous man. Your crew thinks you\'re going soft.',
      },
      {
        text: 'Reward {witness.first} loudly and say nothing about the other.',
        effects: [op('witness', 15), money(-500), op('actor', -5), crewOp(2)],
        preview: 'Praise the brave one and let the shame do the work.',
      },
    ],
  },
  {
    id: 'cr_honest_overpay',
    category: 'crew',
    trigger: { trait: 'Honest', rank: ['soldier', 'associate'], weight: 8 },
    roles: { actor: crewRole('an Honest associate', { rank: ['soldier', 'associate'] }) },
    title: 'Four Hundred Dollars Too Many',
    body: `The owner of a hot dog stand on the Boardwalk got his envelopes mixed up and paid {actor.call} four hundred dollars more than he owed. {actor.first} walked it back the same afternoon. The stand owner was so moved he gave him a free chili dog.

The rest of the crew has been calling {actor.first} "Saint Francis" for a week. Somebody put a little plaster statue of a saint in his locker at the cigar store. He laughs along, but he asked you, quietly, if he did something wrong.`,
    options: [
      {
        text: 'Tell the crew the nickname stops today. Honest men are rare.',
        effects: [op('actor', 20), crewOp(-3), respect(2), infl('boardwalk', 2)],
        preview: 'The Boardwalk trusts your collectors more. The crew thinks you\'re lecturing them.',
      },
      {
        text: 'Tell him, gently, that next time he keeps it and tells you.',
        effects: [op('actor', -5), money(400)],
        preview: 'He learns. You watch him learn, and feel something you can\'t name.',
      },
      {
        text: 'Make him your bagman. You need a man who can\'t steal.',
        effects: [op('actor', 25), money(300), flag('honest_bagman')],
        preview: 'The envelopes come in exact. A man who can\'t lie also can\'t lie to a grand jury.',
      },
    ],
  },
  {
    id: 'cr_wedding_envelope',
    category: 'crew',
    trigger: { rank: ['soldier', 'capo'], months: [5, 6, 9, 10], weight: 9 },
    roles: { actor: crewRole('a soldier marrying off his daughter', { rank: ['soldier', 'capo'] }) },
    title: 'A Wedding at the Ivanhoe',
    body: `{actor.call}'s daughter is getting married in the Ivanhoe's ballroom: two hundred guests, a seven-piece band, a cake in the shape of the Wildwood lighthouse, and every man in the family in a rented tuxedo.

The envelope you give will be counted. Not by the bride, who is twenty and in love with an insurance salesman, but by every man at every table, who'll know the amount by the time the cannoli are served.`,
    options: [
      {
        text: 'A thick envelope. Five hundred.',
        effects: [money(-500), op('actor', 15), crewOp(3), respect(2)],
        preview: 'Generous. Exactly what the room expects.',
      },
      {
        text: 'A very thick envelope. Two thousand, and you pay for the band.',
        effects: [money(-2500), op('actor', 30), crewOp(6), respect(5), heat('local', 2)],
        preview: 'The wedding of the season. Somebody at the IRS reads wedding announcements.',
      },
      {
        text: 'A modest envelope and a long, beautiful toast.',
        gate: { trait: 'Charming' },
        effects: [money(-200), op('actor', 12), respect(3)],
        preview: 'They\'ll remember the toast after the money is spent.',
      },
    ],
  },
  {
    id: 'cr_old_soldier_florida',
    category: 'crew',
    trigger: { rank: 'soldier', season: 'offseason', weight: 8 },
    roles: { actor: crewRole('the oldest soldier in the family', { rank: 'soldier', age: [60, 80] }) },
    title: 'A Lawn Chair in Hollywood, Florida',
    body: `{actor.call} has been with the family since Prohibition, when he drove rum up from the inlet in a hearse. His knees are gone, his wife wants sun, and his brother-in-law has a little stucco house in Hollywood, Florida, with an orange tree.

He wants to retire. He's never asked for anything. He knows where every dollar has gone since 1931 and where several people have gone too.`,
    options: [
      {
        text: 'Give him your blessing and a pension. He earned it.',
        effects: [leave('actor', 'retires'), money(-3000), crewOp(6), respect(3)],
        preview: 'Every man sees how you treat the old-timers. He takes his memories to Florida.',
      },
      {
        text: 'Ask him to stay one more year. Teach the young ones.',
        effects: [op('actor', -10), crewOp(2), stress(-2)],
        preview: 'He stays, and teaches, and grumbles. The young ones learn a lot.',
      },
      {
        text: 'He can retire, but somewhere you can see him. A bungalow in the Crest, on you.',
        gate: { trait: 'Paranoid' },
        effects: [leave('actor', 'retires'), money(-4000), op('actor', -5), evidence('player', -3)],
        preview: 'Close enough to watch, far enough to rest. He knows exactly why you did it.',
      },
    ],
  },
  {
    id: 'cr_boat_slip',
    category: 'crew',
    trigger: { rank: 'soldier', season: 'summer', weight: 7 },
    roles: { a: crewRole('a soldier with a fishing boat', { rank: 'soldier' }), b: crewRole('another soldier with a fishing boat', { rank: 'soldier', notRole: ['a'] }) },
    title: 'The Slip at Otten\'s Harbor',
    body: `{a.call} and {b.call} haven't spoken in three weeks. Both have a boat. There is one good slip left at Otten's Harbor: shade in the afternoon, close to the bait shop, far from the fish-cleaning table. They both say a dockmaster promised it to them. The dockmaster has left for Delaware and can't be reached.

{a.first} called {b.first}'s boat a bathtub. {b.first} called {a.first}'s mother something worse. Their wives sit at opposite ends of the pew now. It's getting serious, and it is about a parking space for a boat.`,
    options: [
      {
        text: 'Buy a second slip. Peace is cheap at this price.',
        effects: [money(-800), op('a', 8), op('b', 8), crewOp(2)],
        preview: 'Both happy. Both secretly sure they won.',
      },
      {
        text: 'The senior man gets it. Rules are rules.',
        effects: [op('a', 10), op('b', -15)],
        preview: 'Order is kept. One soldier has a new grudge, against you this time.',
      },
      {
        text: 'Make them share it, alternate weeks, and fish together once a month.',
        gate: { trait: 'Charming' },
        effects: [op('a', 5), op('b', 5), crewOp(4), respect(2)],
        preview: 'Ridiculous, and it works. By August they\'re catching bluefish together.',
      },
    ],
  },
  {
    id: 'cr_greedy_keep',
    category: 'crew',
    trigger: { trait: 'Greedy', rank: 'capo', minWeek: 6, weight: 10 },
    roles: { actor: crewRole('a Greedy capo', { rank: 'capo' }) },
    title: 'A Bigger Slice',
    body: `{actor.call} brings you his numbers in a leather folder, which he's never done before. His district is up a third since last year. He wants his keep raised to match. "My men are working harder," he says. "My men see your Cadillac and my Buick and they ask questions."

His men see no such thing. {actor.first} sees it, every Sunday, from the pew behind yours.`,
    options: [
      {
        text: 'Give him the raise. He earned it.',
        effects: [money(-700), op('actor', 20)],
        preview: 'A happier capo, a smaller envelope for you every week.',
      },
      {
        text: 'Half the raise, and you pay for his men\'s Christmas.',
        effects: [money(-350), op('actor', 5), crewOp(3)],
        preview: 'Splits the difference and goes around him to his men. He notices.',
      },
      {
        text: 'No. The keep is the keep. He can buy a Cadillac when he\'s boss.',
        effects: [op('actor', -20), respect(3), secret('actor', 'plot')],
        preview: 'He nods. You notice he didn\'t say "yes, boss."',
      },
    ],
  },
  {
    id: 'cr_patient_docks',
    category: 'crew',
    trigger: { trait: 'Patient', rank: 'capo', weight: 7 },
    roles: { actor: crewRole('a Patient capo', { rank: 'capo' }) },
    title: 'Fish Before Freight',
    body: `{actor.call} has a plan and he's in no hurry to explain it, which is how you know it's a good one. The fishermen's co-op at the bay docks is broke. The boats are old, the ice house leaks, and Manno's cousin buys their catch at a price that would embarrass a pirate.

"We buy the ice house," {actor.first} says. "We pay fair. In two years the co-op is ours without anybody noticing, and the docks with it. Freight follows fish."`,
    options: [
      {
        text: 'Do it his way. Two years.',
        effects: [money(-4000), infl('docks', 8), op('actor', 15), rivOp('manno', -5)],
        preview: 'Slow, legitimate, and the docks become yours a little at a time.',
      },
      {
        text: 'Too slow. Lean on the co-op now.',
        effects: [infl('docks', 5), heat('local', 6), respect(2), op('actor', -10)],
        preview: 'Faster. The fishermen hate you, and fishermen talk to the Coast Guard.',
      },
      {
        text: 'Not interested in fish.',
        effects: [op('actor', -8)],
        preview: 'He shrugs, a Patient man. He\'ll ask again in a year.',
      },
    ],
  },
  {
    id: 'cr_vengeful_bouncer',
    category: 'rivals',
    trigger: { trait: 'Vengeful', rank: ['soldier', 'associate'], rivalAlive: 'kessler', weight: 9 },
    roles: { actor: crewRole('a Vengeful soldier', { rank: ['soldier', 'associate'] }), rival: rivalBoss('kessler', 'Danny Kessler') },
    title: 'The Doorman at the Shamrock',
    body: `Three weeks ago a doorman at one of {rival.name}'s clubs in North Wildwood threw {actor.call} out onto the sidewalk in front of a girl he was trying to impress. {actor.first} hasn't mentioned it since. That's what worries you.

This morning he asked you, very politely, for permission. He didn't say for what. He's been sharpening a grudge for three weeks, and it's very sharp now.`,
    options: [
      {
        text: 'No. Forget it. That\'s an order.',
        effects: [op('actor', -15), stress(2)],
        preview: 'He obeys. Grudges don\'t obey anybody.',
      },
      {
        text: 'Call Danny Kessler and have the doorman apologize.',
        effects: [rivOp('kessler', -3), op('actor', 10), respect(2)],
        preview: 'Kessler owes nothing and gives it anyway, this time. He\'ll remember.',
      },
      {
        text: 'Permission granted. Nothing permanent.',
        gate: { trait: 'Vengeful' },
        effects: [op('actor', 20), rivOp('kessler', -12), heat('local', 5), respect(3)],
        preview: 'The doorman takes a week off. North Wildwood takes notice.',
      },
    ],
  },
  {
    id: 'cr_charming_trooper',
    category: 'law',
    trigger: { trait: 'Charming', rank: ['soldier', 'capo'], weight: 7 },
    roles: { actor: crewRole('a Charming soldier', { rank: ['soldier', 'capo'] }), trooper: official('a New Jersey State Police trooper', 'state trooper', { first: 'Carl', last: 'Voss', ethnicity: 'Irish', age: [28, 38], traits: ['Honest'] }) },
    title: 'Bowling on Tuesdays',
    body: `{actor.call} has a new best friend: {trooper.name}, a New Jersey State Trooper from the barracks on the Parkway. They bowl on Tuesdays. Their wives trade casserole recipes. They went to a Phillies game together and {actor.first} paid for the hot dogs.

The State Police can't be bought the way the locals can. But a trooper who bowls with you might mention, in passing, when the barracks is planning something.`,
    options: [
      {
        text: 'Keep it going. Friends are friends.',
        effects: [flag('trooper_friend'), evidence('player', -3), evidence('actor', 3)],
        preview: 'A window into the barracks. Windows work both ways.',
      },
      {
        text: 'Tell {actor.first} to end it. Troopers are trouble.',
        effects: [op('actor', -10), stress(-2)],
        preview: 'Safe. {actor.first} loses a friend because of you.',
      },
      {
        text: 'Have {actor.first} offer the trooper a little something.',
        effects: [heat('local', 5), op('trooper', -30), evidence('actor', 10)],
        preview: 'Honest men don\'t take envelopes. They write down who offered.',
      },
    ],
  },
  {
    id: 'cr_made_ceremony',
    category: 'crew',
    trigger: { minWeek: 10, respectAbove: 30, cooldownWeeks: 52, weight: 9 },
    roles: {
      loyal: crewRole('a long-serving associate with trait Loyal-to-a-fault', { rank: 'associate', trait: 'Loyal-to-a-fault' }),
      earner: crewRole('a young associate who earns big', { rank: 'associate', trait: 'Ambitious', notRole: ['loyal'] }),
      sal: rivalBoss('philly', 'Sal "the Bag" Moretti'),
    },
    title: 'One Button This Year',
    body: `Philadelphia has allowed you one new made man this year. One. The ceremony would be in the back room of a clam bar that closes in October, with the candle, the card with the saint, and the drop of blood, the old way.

{loyal.call} has carried coffee and bags for you for eleven years without complaint and would walk into the bay if you asked. {earner.call} has been an associate for two years and already brings in more than some capos. He has a temper and a future. Both of them know there's one button. {sal.name} has said he'll accept whichever you choose, which means he'll judge you for it.`,
    options: [
      {
        text: 'Make {loyal.first}. Loyalty is the whole thing.',
        effects: [rank('loyal', 'soldier'), op('loyal', 40), op('earner', -25), crewOp(5), respect(3)],
        preview: 'The old way honored. {earner.first} starts wondering what loyalty pays.',
      },
      {
        text: 'Make {earner.first}. The family needs earners.',
        effects: [rank('earner', 'soldier'), op('earner', 30), op('loyal', -30), money(1500), crewOp(-4)],
        preview: 'The money will come. {loyal.first} will keep carrying coffee, and won\'t smile while he does it.',
      },
      {
        text: 'Ask Philadelphia for two. You\'ll pay for the second.',
        gate: { money: 5000 },
        effects: [money(-5000), rank('loyal', 'soldier'), rank('earner', 'soldier'), op('loyal', 30), op('earner', 20), heat('family', 5)],
        preview: 'Everyone gets made. Philadelphia remembers that you bought an exception.',
      },
    ],
  },
  {
    id: 'cr_womanizer_wife',
    category: 'romance-nonexplicit',
    trigger: { trait: 'Womanizer', rank: ['soldier', 'capo'], weight: 8 },
    roles: { actor: crewRole('a soldier with trait Womanizer', { rank: ['soldier', 'capo'] }), husband: crewRole('another man in the family', { rank: ['soldier', 'capo'], notRole: ['actor'] }) },
    title: 'The One Rule Nobody Writes Down',
    body: `Everybody knows the rule, and nobody says it out loud: you don't go near another man's wife. Not a made man's. Not ever.

{actor.call} has been seen twice driving {husband.call}'s wife home from the beauty parlor on Pacific, and once having a long lunch with her at a place in Cape May where nobody goes to be seen. Maybe it's nothing. {husband.first} doesn't know yet. When he finds out, nothing will stay nothing.`,
    options: [
      {
        text: 'Have a quiet word with {actor.first}. It ends today.',
        effects: [op('actor', -10), secret('actor', 'affair'), stress(2)],
        preview: 'Maybe it ends. You\'re holding a secret either way.',
      },
      {
        text: 'Transfer {actor.first} to the Causeway crew. Distance solves things.',
        effects: [op('actor', -15), crewOp(-2), infl('causeway', 2)],
        preview: 'Out of sight. People will ask why you moved him.',
      },
      {
        text: 'Tell {husband.first}. It\'s his house; it\'s his business.',
        effects: [op('husband', 15), op('actor', -40), heat('local', 4), crewOp(-4), health('actor', -25)],
        preview: 'The rule enforced the old way. Expect a hospital visit and two men who will never speak again.',
      },
    ],
  },

  /* ------------------------------------------------------------ FAMILY */
  {
    id: 'fam_communion',
    category: 'family',
    trigger: { months: [5], weight: 10, cooldownWeeks: 52 },
    roles: { child: famRole('a young child of the boss', 'child', { age: [7, 9] }), spouse: famRole('your wife', 'spouse'), sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'First Communion',
    body: `{child.first} makes First Communion on Sunday in a white suit or a white dress that cost more than your first car. Your wife has planned the party for six weeks: backyard, folding tables, a sheet cake, her mother's lasagna, and only family.

Then {sal.name} calls to say he'd be honored to stop by with a little something for the child. The little something will be an envelope. The stopping by will be with his driver, two cars, and every neighbor watching from behind their curtains.`,
    options: [
      {
        text: 'Welcome Sal. You don\'t refuse Philadelphia.',
        effects: [rivOp('philly', 10), heat('family', -3), op('spouse', -15), heat('local', 2)],
        preview: 'Philadelphia is honored. Your wife spends the party in the kitchen.',
      },
      {
        text: 'Ask Sal, respectfully, to come for coffee the following Sunday.',
        effects: [op('spouse', 15), rivOp('philly', -5), famOp(5)],
        preview: 'Family first. Sal understands, and makes a little note of it.',
      },
      {
        text: 'Invite everyone. The whole crew, Sal, the neighbors. A real party.',
        gate: { money: 1500 },
        effects: [money(-1500), respect(6), crewOp(5), rivOp('philly', 8), op('spouse', -5), heat('local', 3)],
        preview: 'The party of the year. {child.first} gets three hundred dollars in envelopes and a stomachache.',
      },
    ],
  },
  {
    id: 'fam_father_1946',
    category: 'family',
    trigger: { once: true, minWeek: 20, rivalAlive: 'kessler', weight: 8 },
    roles: { father: famRole('your aging father', 'father', { age: [65, 90] }), rival: rivalBoss('kessler', 'Danny Kessler') },
    title: 'What Happened in 1946',
    body: `Your father is sitting up in his bed by the window with the oxygen tank he calls Maria, and he wants to tell you something before, as he puts it, Maria wins the argument.

In 1946, when you were overseas, men from Newark came to take the shore from him. He would have died in a parking lot on Rio Grande Avenue if an Irish bootlegger named Kessler, Danny's father, hadn't pulled up in a truck and given him a ride. Kessler never asked for anything. "We owe that family," your father says. "I never paid. Now you know."`,
    options: [
      {
        text: 'Pay the debt. Make peace with Danny Kessler, whatever it costs.',
        effects: [rivOp('kessler', 25), respect(-2), op('father', 20), flag('kessler_debt_paid')],
        preview: 'An old debt honored. Your crew doesn\'t know why you\'re suddenly soft on North Wildwood.',
      },
      {
        text: 'Thank him. Tell him it was a long time ago.',
        effects: [op('father', -10), stress(3)],
        preview: 'Business is business. Your father turns his face to the window.',
      },
      {
        text: 'Tell Danny Kessler the story yourself, over a drink.',
        gate: { trait: 'Charming' },
        effects: [rivOp('kessler', 15), op('father', 15), hook('rival', 'He owes his peace to your story')],
        preview: 'Danny didn\'t know. Now there\'s something between your houses besides territory.',
      },
    ],
  },
  {
    id: 'fam_matchbook',
    category: 'romance-nonexplicit',
    trigger: { weight: 7, cooldownWeeks: 60 },
    roles: { spouse: famRole('your wife', 'spouse') },
    title: 'A Matchbook From North Wildwood',
    body: `{spouse.first} found it in your sport coat on the way to the dry cleaner: a matchbook from a club in North Wildwood, with a phone number written inside in a woman's handwriting, round and careful.

It was a bookkeeper's number. You needed a bookkeeper. That's the truth, and you can tell by her face that the truth isn't going to be enough tonight. She puts the matchbook on the kitchen table next to the salt and pepper and keeps peeling potatoes.`,
    options: [
      {
        text: 'Tell her the truth and call the number in front of her.',
        effects: [op('spouse', 10), stress(-3), flag('bookkeeper_known')],
        preview: 'A very confused bookkeeper answers. Your wife laughs, finally.',
      },
      {
        text: 'Tell her it\'s business, and business is not her concern.',
        effects: [op('spouse', -20), famOp(-4), stress(4)],
        preview: 'True in a way. Wrong in every way that matters to her.',
      },
      {
        text: 'Take her to dinner in Cape May. Say nothing about it ever.',
        gate: { trait: 'Womanizer' },
        effects: [op('spouse', 5), money(-150), stress(6), secret('player', 'affair')],
        preview: 'She lets it go. She doesn\'t forget. A man with your habits knows the difference.',
      },
    ],
  },
  {
    id: 'fam_daughter_college',
    category: 'family',
    trigger: { months: [3, 4, 5], weight: 8, once: true },
    roles: { daughter: famRole('your eldest daughter', 'daughter', { age: [17, 19] }), spouse: famRole('your wife', 'spouse') },
    title: 'The Letter From Camden',
    body: `{daughter.first} has been accepted to Rutgers in Camden. She applied without telling anybody. She wants to study social work; she says she wants to help families like the ones she grew up around, and she doesn't seem to understand what that sentence does to you.

Nobody in the family has ever gone to college. Your mother thinks a girl should marry. Your wife thinks your daughter should do whatever she wants and has been saving egg money in a coffee can since 1950 to make sure she can.`,
    options: [
      {
        text: 'Pay for all of it. She goes.',
        effects: [money(-2500), famOp(10), op('daughter', 30), op('spouse', 15)],
        preview: 'The first in the family. You drive her over the bridge in September and don\'t say much.',
      },
      {
        text: 'She can go, if she lives at home and commutes.',
        effects: [money(-1000), op('daughter', 10), famOp(3)],
        preview: 'A compromise. She\'ll be on the bus to Camden two hours a day, reading.',
      },
      {
        text: 'No. She marries, she stays close, she\'s safe.',
        effects: [op('daughter', -40), op('spouse', -25), famOp(-10)],
        preview: 'The old way. She goes anyway, two years later, on her own money, and calls less.',
      },
    ],
  },
  {
    id: 'fam_son_fight',
    category: 'family',
    trigger: { months: [10, 11, 12, 1, 2, 3, 4], weight: 8, cooldownWeeks: 60 },
    roles: { son: famRole('your schoolboy son', 'son', { age: [9, 15] }), cop: official('a Wildwood patrolman whose son goes to the same school', 'patrolman', { first: 'Frank', last: 'Doyle', ethnicity: 'Irish', age: [35, 45] }) },
    title: 'Sister Agnes Calls',
    body: `Sister Agnes calls from the parish school: {son.first} gave another boy a bloody nose at recess. The other boy said {son.first}'s father was a gangster who would go to jail like the men in the newspaper.

The other boy's father is Patrolman {cop.name}, who walks the beat on Pacific Avenue and has taken your envelope every Christmas for six years. Sister Agnes would like to see both fathers in her office on Monday. She says "both fathers" like a sentence.`,
    options: [
      {
        text: 'Go to the office. Make {son.first} apologize. Shake Doyle\'s hand.',
        effects: [op('son', -10), op('cop', 15), heat('local', -3), famOp(2)],
        preview: 'Grace in public. Your son learns his father bows to cops.',
      },
      {
        text: 'Tell {son.first} he did right. Send Doyle a message about his Christmas envelope.',
        effects: [op('son', 15), op('cop', -25), heat('local', 4)],
        preview: 'Your son learns how this works. So does the patrolman.',
      },
      {
        text: 'Tell your son the truth about what you do, as much as a boy can hear.',
        effects: [op('son', 10), stress(8), famOp(-2), flag('son_knows')],
        preview: 'No more lies at the dinner table. Some lies were holding the table up.',
      },
    ],
  },
  {
    id: 'fam_brother_in_law',
    category: 'family',
    trigger: { weight: 8, cooldownWeeks: 80 },
    roles: { spouse: famRole('your wife', 'spouse'), bil: townie('your wife\'s brother', { first: 'Sonny', gender: 'M', ethnicity: 'Italian', age: [28, 40], traits: ['Gambler', 'Charming'] }) },
    title: 'Sonny Needs a Job',
    body: `{spouse.first}'s brother {bil.first} has lost another job. This time it was selling vacuum cleaners door to door in Ocean City, which he says was beneath him, and which his boss says he did mostly by visiting the racetrack.

{spouse.first} doesn't ask outright. She makes your favorite dinner on a Tuesday and leaves the pause after "Sonny's been having a hard time" long enough to drive a truck through.`,
    options: [
      {
        text: 'Give Sonny something legitimate. Night manager at a motel.',
        effects: [op('spouse', 15), money(-300), famOp(3), flag('sonny_hired')],
        preview: 'He\'ll be bad at it. He\'ll be bad at it where you can see him.',
      },
      {
        text: 'Give Sonny a route. He wanted excitement.',
        effects: [op('spouse', 5), crewOp(-3), evidence('player', 2)],
        preview: 'A gambler with a collection bag. You know how this story goes.',
      },
      {
        text: 'Say no. Sonny is a grown man.',
        effects: [op('spouse', -15), famOp(-3)],
        preview: 'Correct. Dinner is very quiet for a week.',
      },
    ],
  },
  {
    id: 'fam_mother_cemetery',
    category: 'family',
    trigger: { weight: 7, cooldownWeeks: 52 },
    roles: { mother: famRole('your mother', 'mother') },
    title: 'The Anniversary',
    body: `It's the anniversary of your father's death. Every year your mother takes the bus to the cemetery with a folding chair, a thermos and a bunch of gladiolas, and sits with him for an hour and tells him the news.

This year she wants you to drive her. It's the same afternoon as a sit-down in Philadelphia you've waited three months to get. She knows. She asked anyway. That is her way of telling you what matters.`,
    options: [
      {
        text: 'Drive her. Philadelphia can wait.',
        effects: [op('mother', 20), famOp(5), rivOp('philly', -5), heat('family', 3)],
        preview: 'Your mother tells your father all about you. Philadelphia reschedules, coldly.',
      },
      {
        text: 'Go to Philadelphia. Send a soldier to drive her, with flowers.',
        effects: [op('mother', -15), rivOp('philly', 5)],
        preview: 'The meeting goes well. She doesn\'t mention it again, ever.',
      },
      {
        text: 'Drive her in the morning, and drive like hell to Philadelphia after.',
        gate: { trait: 'Ambitious' },
        effects: [op('mother', 10), stress(6), rivOp('philly', 2)],
        preview: 'Both, barely. You arrive in South Philly with cemetery dirt on your good shoes.',
      },
    ],
  },

  /* ------------------------------------------------------------ RIVALS */
  {
    id: 'riv_manno_produce',
    category: 'rivals',
    trigger: { rivalAlive: 'manno', season: 'summer', minWeek: 4, weight: 10, district: 'causeway' },
    roles: { rival: rivalBoss('manno', 'Carmine Manno') },
    title: 'A Produce Stand on the Causeway',
    body: `A new produce stand has opened at the foot of the Causeway: Jersey tomatoes, white corn, cantaloupes. Very nice. It's run by two of {rival.name}'s nephews, who know nothing about vegetables and a great deal about which trucks are going onto the island and whose cigarettes are in them.

Three of your deliveries this week have been "inspected" for "agricultural pests." One came up short a hundred cartons.`,
    immediate: [money(-600)],
    options: [
      {
        text: 'Buy all their corn every morning at triple the price. Smile every time.',
        effects: [money(-400), respect(4), rivOp('manno', 3)],
        preview: 'Mockery, nicely done. They close the stand from embarrassment by August.',
      },
      {
        text: 'The stand burns down some night. Nobody inside.',
        effects: [heat('local', 8), rivOp('manno', -20), infl('causeway', 5), respect(5)],
        preview: 'The message is unmistakable. So is the answer you\'ll get.',
      },
      {
        text: 'Route your trucks over the bridge from the bay side instead.',
        effects: [money(-900), infl('causeway', 3, 'manno'), stress(2)],
        preview: 'A longer road. Manno owns the Causeway a little more every week you avoid it.',
      },
    ],
  },
  {
    id: 'riv_manno_wine',
    category: 'rivals',
    trigger: { rivalAlive: 'manno', weight: 7, cooldownWeeks: 60 },
    roles: { rival: rivalBoss('manno', 'Carmine Manno'), spouse: famRole('your wife', 'spouse') },
    title: 'A Case of Barolo',
    body: `A case of good Barolo arrives at your house, not the Ivanhoe, with a card: "Happy anniversary to you and {spouse.first}. Many more. C.M."

It is your anniversary. You never told {rival.name} that. You've never told him where you live. Your wife holds the card by its corner like it's a dead mouse. "Who's C.M.?" she asks.`,
    options: [
      {
        text: 'Send him a case back on his anniversary. You know it too.',
        effects: [respect(5), rivOp('manno', -3), stress(3)],
        preview: 'Message received, message returned. Your wife still wants to know who C.M. is.',
      },
      {
        text: 'Move the family to the house in the Crest for a while. Quietly.',
        effects: [money(-1500), op('spouse', -5), stress(-4), famOp(-2)],
        preview: 'Safe. Your kids hate the new school. Manno sees you flinch.',
      },
      {
        text: 'Pour it down the sink in front of your soldiers.',
        gate: { trait: 'Hot-headed' },
        effects: [crewOp(5), respect(3), rivOp('manno', -10)],
        preview: 'Your men cheer. Two hundred dollars of wine in the drain and a story everyone tells.',
      },
    ],
  },
  {
    id: 'riv_kessler_license',
    category: 'rivals',
    trigger: { rivalAlive: 'kessler', weight: 8, cooldownWeeks: 52 },
    roles: { rival: rivalBoss('kessler', 'Danny Kessler'), front: crewRole('your front man, a clean civilian', { rank: 'associate' }) },
    title: 'A License Is a License',
    body: `{rival.name} wants a liquor license for a new place south of 26th Street, in your territory. He can't get one: the ABC board knows who he is. Your front man {front.name} can, on paper, without anybody blinking.

Kessler offers a lot: five hundred a month for the paper, and he'll stay north of 26th for everything else. "It's one bar," he says. "You'll be drinking there yourself by Christmas."`,
    options: [
      {
        text: 'Lend him your front man. Five hundred a month.',
        effects: [money(2000), rivOp('kessler', 15), infl('pacific', 3, 'kessler'), evidence('front', 4)],
        preview: 'Good money and a friendlier Kessler. He now has a door into your territory.',
      },
      {
        text: 'Take his money, and take his bar. Your front man owns it on paper.',
        gate: { trait: 'Greedy' },
        effects: [money(2000), biz('add', 'bar', 'pacific'), rivOp('kessler', -30), respect(3)],
        preview: 'Clever and cruel. Kessler will never trust a Jersey Italian again.',
      },
      {
        text: 'No. South of 26th is yours.',
        effects: [respect(3), rivOp('kessler', -8)],
        preview: 'The line holds. Kessler finds another front man, eventually.',
      },
    ],
  },
  {
    id: 'riv_feld_loan',
    category: 'rivals',
    trigger: { rivalAlive: 'feldstein', weight: 8, cooldownWeeks: 52 },
    roles: { rival: rivalBoss('feldstein', 'Ira Feldstein') },
    title: 'Two Percent',
    body: `{rival.name} hears you want to buy the bowling alley in Rio Grande and can't find the money. He offers to lend you twenty thousand at two percent, which is less than the bank charges a priest.

"I like you," Feldstein says. "I like Wildwood. I like the idea of having friends who owe me nothing but a phone call when I need one." He smiles. He has a lot of very white teeth.`,
    options: [
      {
        text: 'Take the money. Buy the bowling alley.',
        effects: [money(20000), { k: 'debt', lender: 'feldstein', principal: 20000, weeklyPayment: 450, weeks: 52 }, rivOp('feldstein', 10), flag('owe_feldstein')],
        preview: 'Cheap money. The phone call will come at the worst possible time.',
      },
      {
        text: 'Take half, and pay it back early.',
        gate: { trait: 'Patient' },
        effects: [money(10000), { k: 'debt', lender: 'feldstein', principal: 10000, weeklyPayment: 400, weeks: 26 }, rivOp('feldstein', 5)],
        preview: 'Cautious and smart. Feldstein respects a man who doesn\'t need him.',
      },
      {
        text: 'Thank him and say no.',
        effects: [rivOp('feldstein', -5), respect(2)],
        preview: 'No bowling alley. No phone call.',
      },
    ],
  },
  {
    id: 'riv_feld_defector',
    category: 'rivals',
    trigger: { rivalAlive: 'feldstein', minWeek: 15, weight: 6, once: true },
    roles: { clerk: rivalMan('feldstein', 'a bookkeeper in Feldstein\'s organization', { first: 'Herschel', last: 'Brandt', ethnicity: 'Jewish', age: [50, 60], traits: ['Cowardly', 'Honest'] }), rival: rivalBoss('feldstein', 'Ira Feldstein') },
    title: 'A Bookkeeper Who Wants Out',
    body: `{clerk.name} meets you in the back of a delicatessen in Margate and doesn't touch his pastrami. He's kept {rival.name}'s second set of books for twelve years. His wife is sick. He wants a house in a town where nobody knows him and a guarantee.

In exchange he has a briefcase: copies of Feldstein's ledgers. Every cop, every judge, every bank. "I'm not a brave man," he says. "I'm a tired man. Those are different."`,
    options: [
      {
        text: 'Take the briefcase. Give him a house in Pennsylvania.',
        gate: { money: 6000 },
        effects: [money(-6000), hook('rival', 'You have his second set of books', true), rivOp('feldstein', -20), leave('clerk', 'exile')],
        preview: 'Feldstein is in your pocket. When he figures it out, he\'ll want it back.',
      },
      {
        text: 'Send him back to Feldstein with your compliments.',
        effects: [rivOp('feldstein', 25), respect(3)],
        preview: 'Honor among businessmen. Feldstein knows what you passed up. The bookkeeper doesn\'t come back.',
      },
      {
        text: 'Point him toward the prosecutor instead.',
        effects: [rivRes('feldstein', { exposure: 30 }), heat('local', -5), flag('fed_feldstein')],
        preview: 'Feldstein gets a federal case. The bookkeeper gets a witness room. Nobody knows you sent him.',
      },
    ],
  },
  {
    id: 'riv_philly_wedding',
    category: 'rivals',
    trigger: { months: [6, 9, 10], weight: 7, cooldownWeeks: 80 },
    roles: { sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'A Wedding in South Philadelphia',
    body: `{sal.name}'s daughter is getting married at a church on Christian Street, and the reception is at a hall on Broad Street with a twelve-piece orchestra and an ice sculpture of a swan. Every family in the Delaware Valley will be there. Where you sit, and what's in your envelope, will be read like a newspaper.

You've been seated at table nineteen, near the kitchen doors, beside a cousin from Trenton who sells insurance.`,
    options: [
      {
        text: 'A big envelope. Smile at table nineteen.',
        effects: [money(-2000), rivOp('philly', 12), heat('family', -4)],
        preview: 'Humble and generous. Next time you\'ll sit closer.',
      },
      {
        text: 'Have a word with Sal\'s brother about the seating. Politely.',
        gate: { respect: 45 },
        effects: [money(-1500), respect(5), rivOp('philly', -3)],
        preview: 'You move to table eight. Somebody else moves to nineteen and remembers why.',
      },
      {
        text: 'Send regrets, a gift, and your wife\'s best wishes.',
        effects: [money(-800), rivOp('philly', -10), heat('family', 4)],
        preview: 'Absent from the biggest wedding of the year. Absences get noticed.',
      },
    ],
  },
  {
    id: 'riv_philly_lamster',
    category: 'rivals',
    trigger: { season: 'offseason', weight: 7, cooldownWeeks: 60 },
    roles: { lam: rivalMan('philly', 'a Philadelphia man on the lam', { first: 'Vincent', last: 'Abate', nickname: 'Vinnie Shoes', ethnicity: 'Italian', age: [35, 50], traits: ['Hot-headed'] }), sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'A Guest for the Winter',
    body: `{sal.name} needs a favor. One of his men, {lam.call}, has a warrant in Pennsylvania and a temper that put it there. He needs somewhere to be nobody for three months.

The motels on the island are boarded up for the winter. There's one of yours in the Crest with the water still on and the heat working in two rooms. Nobody would think to look in a summer town in January. {lam.first} would have to stay inside, watch television and eat what your men bring him. Sal says he's good company. Nobody has ever said that about a Hot-headed man stuck indoors.`,
    options: [
      {
        text: 'Put him up. Philadelphia\'s friend is your friend.',
        effects: [rivOp('philly', 15), heat('family', -5), heat('federal', 5), evidence('player', 4)],
        preview: 'Harboring a fugitive is a crime that comes with a federal number.',
      },
      {
        text: 'Put him up, and use the three months to learn everything about Philadelphia.',
        gate: { trait: 'Charming' },
        effects: [rivOp('philly', 10), heat('federal', 5), hook('lam', 'You hid him and he talked all winter'), flag('philly_gossip')],
        preview: 'A bored man talks. By March you know where every body in Philadelphia sits.',
      },
      {
        text: 'Decline. Respectfully. Too many eyes this year.',
        effects: [rivOp('philly', -10), heat('family', 4)],
        preview: 'Prudent. Philadelphia keeps a list of men who said no.',
      },
    ],
  },

  /* ------------------------------------------------------------ LAW */
  {
    id: 'law_new_chief',
    category: 'law',
    trigger: { minWeek: 20, once: true, weight: 10 },
    roles: { chief: official('the new chief of police, brought in from outside', 'police chief', { first: 'Harlan', last: 'Pratt', ethnicity: 'Irish', age: [44, 52], traits: ['Honest', 'Patient'] }) },
    title: 'A Chief From Pennsauken',
    body: `The old chief retired to a fishing cottage he could never have afforded on his salary. The commission hired a replacement from outside, {chief.name}, twenty years on the Pennsauken force, a Korean War veteran with a crew cut and a reputation for not taking things.

His first day, he walks the Boardwalk end to end in uniform, introducing himself to every stand owner. When he gets to the Ivanhoe, he shakes your hand, looks at you for a long second, and says, "I've heard a lot about you. I'd like to hear it from you sometime."`,
    options: [
      {
        text: 'Invite him to dinner. Learn what kind of man he is.',
        effects: [op('chief', 5), heat('local', -2), stress(2)],
        preview: 'Knowledge. He\'s learning about you at the same table.',
      },
      {
        text: 'Find out what he owes and to whom. Every man has a mortgage.',
        effects: [heat('local', 4), flag('chief_dirt'), stress(3)],
        preview: 'Maybe you find something. Honest chiefs notice people asking about them.',
      },
      {
        text: 'Leave him alone. Make sure the Boardwalk has nothing for him to see.',
        effects: [money(-2000), heat('local', -6), respect(-2)],
        preview: 'A quieter summer and a thinner one. Patience against patience.',
      },
    ],
  },
  {
    id: 'law_irs',
    category: 'law',
    trigger: { hasBusiness: 'motel', minWeek: 15, weight: 8, cooldownWeeks: 52 },
    roles: { agent: official('an IRS revenue agent', 'IRS agent', { first: 'Norman', last: 'Feeney', ethnicity: 'Irish', age: [38, 50], traits: ['Patient', 'Honest'] }) },
    title: 'The Man From Internal Revenue',
    body: `{agent.name} wears a gray suit in July and carries his lunch in a paper bag. He'd like to see the receipts for your motel for the last three years. Specifically the summers, and more specifically the weeks the motel reported a hundred percent occupancy while the rest of the street had vacancy signs out.

He doesn't threaten. He just writes very small, in a very thick notebook, and thanks you for your time.`,
    options: [
      {
        text: 'Hand him everything. The accountant cooked it well.',
        effects: [evidence('player', 4), unwashed(-2000), stress(4)],
        preview: 'Well-cooked books are still books. Patient men read them twice.',
      },
      {
        text: 'Lawyer up. Make him subpoena every page.',
        gate: { money: 2500 },
        effects: [money(-2500), evidence('player', -2), heat('federal', 3)],
        preview: 'It slows him down a year. It also tells him there\'s something worth subpoenaing.',
      },
      {
        text: 'Pay the back taxes on a few of those summers, voluntarily.',
        gate: { money: 5000 },
        effects: [money(-5000), evidence('player', -6), heat('federal', -4)],
        preview: 'It hurts. It shows good faith, and IRS men like nothing better than a confession.',
      },
    ],
  },
  {
    id: 'law_beat_cop_raise',
    category: 'law',
    trigger: { weight: 9, cooldownWeeks: 40 },
    roles: { cop: official('a beat cop on your payroll', 'patrolman', { first: 'Eddie', last: 'Brophy', ethnicity: 'Irish', age: [26, 34], traits: ['Greedy'] }) },
    title: 'A Baby on the Way',
    body: `Patrolman {cop.name} catches you outside the bakery. His wife is expecting their third. They need a bigger place, a station wagon, and the twenty a week you've been paying him since he joined the force doesn't cover baby shoes.

He wants fifty a week. He says it nervously, like a boy asking for a raise at the hardware store, because that's exactly what he is.`,
    options: [
      {
        text: 'Fifty a week, and a crib from you for the baby.',
        effects: [money(-400), op('cop', 25), heat('local', -4), hook('cop', 'He is on your payroll')],
        preview: 'A grateful cop. The more you pay a man, the more he has to lose.',
      },
      {
        text: 'Thirty. That\'s generous.',
        effects: [money(-100), op('cop', -5)],
        preview: 'Fair. He wanted fifty.',
      },
      {
        text: 'Not a dime more. Cops are cheap on this island.',
        effects: [op('cop', -20), heat('local', 3)],
        preview: 'He looks for other income. Some of it might come from the prosecutor.',
      },
    ],
  },
  {
    id: 'law_fbi_funeral',
    category: 'law',
    trigger: { heatAbove: { federal: 25 }, weight: 8, cooldownWeeks: 52 },
    roles: { actor: crewRole('an old soldier whose funeral it is', { rank: 'soldier' }) },
    title: 'The Photographers at the Funeral',
    body: `The funeral for an old-timer, an uncle of {actor.call}'s, is at the funeral home on Pacific, then the Mass, then the cemetery in Cape May Court House. Everybody comes. That's the point of a funeral.

Across the street, in a parked Plymouth, two men in hats are taking photographs of everybody who comes. They're not even hiding it. One of them waves.`,
    options: [
      {
        text: 'Go anyway. A man doesn\'t skip a funeral for the FBI.',
        effects: [respect(5), crewOp(4), heat('federal', 5), evidence('player', 3), op('actor', 15)],
        preview: 'Your face in a federal album. Your men see you didn\'t hide.',
      },
      {
        text: 'Send flowers and a big Mass card. Stay home.',
        effects: [op('actor', -10), heat('federal', -2), respect(-3)],
        preview: 'Prudent. The family of the dead man will remember the empty pew.',
      },
      {
        text: 'Have the funeral home park a hearse in front of their lens.',
        gate: { trait: 'Charming' },
        effects: [respect(6), crewOp(6), heat('federal', 3), op('actor', 10)],
        preview: 'A great story told at every wake for twenty years. The FBI doesn\'t think it\'s funny.',
      },
    ],
  },
  {
    id: 'law_judge_son',
    category: 'law',
    trigger: { season: 'summer', weight: 7, cooldownWeeks: 60 },
    roles: { judge: official('a Superior Court judge', 'judge', { first: 'Raymond', last: 'Hollis', ethnicity: 'Irish', age: [55, 66], traits: ['Patient'] }) },
    title: 'The Judge\'s Boy',
    body: `At two in the morning a convertible driven by a twenty-year-old went over the curb on the Boardwalk ramp at Rio Grande Avenue and through the front of a frozen custard stand. Yours. Nobody was hurt except the custard machine, which is dead.

The driver is Judge {judge.name}'s son. The judge calls you himself, at home, before the police report is even typed. He would very much like it if the report said the brakes failed, and he would be very grateful.`,
    immediate: [money(-800)],
    options: [
      {
        text: 'The brakes failed. Have the cops write it that way.',
        effects: [hook('judge', 'You buried his son\'s drunk driving', true), heat('local', 3), favor(1)],
        preview: 'A Superior Court judge who owes you. That is worth more than any custard stand.',
      },
      {
        text: 'Let the report say what happened. Send the judge the repair bill.',
        effects: [money(800), op('judge', -15), heat('local', -2)],
        preview: 'Honest, paid in full, and a judge who doesn\'t forget being refused.',
      },
      {
        text: 'Bury it, and have the son work at the custard stand all summer.',
        gate: { trait: 'Patient' },
        effects: [hook('judge', 'You buried his son\'s drunk driving', true), op('judge', 10), respect(3)],
        preview: 'A judge\'s son in a paper hat. The judge thinks it\'s the best thing that ever happened to the boy.',
      },
    ],
  },
  {
    id: 'law_state_raid',
    category: 'law',
    trigger: { heatAbove: { local: 55 }, hasBusiness: 'club', weight: 10, cooldownWeeks: 26 },
    roles: { actor: crewRole('the man who runs your club', { rank: ['capo', 'soldier'] }) },
    title: 'The State Police Don\'t Call Ahead',
    body: `Local cops call ahead. That's what local cops are for. The New Jersey State Police come over the Causeway at eleven on a Saturday night in six cars, without telling anyone in Wildwood, and walk into your club on Pacific with a warrant and a photographer.

They take the dice table, the cash, the bartender, and {actor.call}, who was standing beside the dice table holding the cash. The Herald will have it Monday. Philadelphia will have it Sunday.`,
    immediate: [money(-3000), heat('family', 6), biz('close', 'club', 'pacific', 3)],
    options: [
      {
        text: 'Bail {actor.first} tonight. Best lawyer in Camden.',
        gate: { money: 2500 },
        effects: [money(-2500), op('actor', 20), evidence('actor', -5)],
        preview: 'He\'s home for breakfast. The case goes on.',
      },
      {
        text: 'Let him sit a few days. He knew the risk.',
        effects: [op('actor', -20), prison('actor', 2), money(500)],
        preview: 'Cheaper. A man in a cell has time to think about loyalty.',
      },
      {
        text: 'Find out who in Wildwood didn\'t know this was coming. That\'s the problem.',
        gate: { trait: 'Paranoid' },
        effects: [stress(6), flag('raid_leak_hunt'), evidence('player', -3), op('actor', -5)],
        preview: 'Your local cops were blind. Either they\'re useless or someone made them blind.',
      },
    ],
  },

  /* ------------------------------------------------------------ TABLE */
  {
    id: 'tb_border',
    category: 'table',
    trigger: { minWeek: 6, weight: 9, cooldownWeeks: 40 },
    roles: { a: crewRole('a capo', { rank: 'capo' }), b: crewRole('another capo', { rank: 'capo', notRole: ['a'] }) },
    title: 'The Arcade on the Line',
    body: `A new arcade has opened on the Boardwalk right where {a.call}'s district ends and {b.call}'s begins. Its front door is on {a.first}'s side. Its back door, and its pinball machines, are on {b.first}'s side. Both capos sent men to collect the same week. The arcade owner paid both, and then called you in tears.

Now both capos are in your kitchen, not looking at each other, drinking your coffee. The arcade makes four hundred a week. The argument is worth more than that.`,
    options: [
      {
        text: 'Front door decides. It\'s {a.first}\'s.',
        effects: [op('a', 15), op('b', -15), money(100)],
        preview: 'A clean rule. {b.first} thinks the rule was invented today.',
      },
      {
        text: 'Split it down the middle. Two hundred each.',
        effects: [op('a', 3), op('b', 3), crewOp(2)],
        preview: 'Fair and nobody\'s happy, which is how you know it was fair.',
      },
      {
        text: 'The arcade pays you directly. Neither capo touches it.',
        effects: [money(400), op('a', -10), op('b', -10), respect(3)],
        preview: 'You settle it by taking it. Both capos learn the same lesson about bringing you problems.',
      },
    ],
  },
  {
    id: 'tb_kessler_protection',
    category: 'table',
    trigger: { rivalAlive: 'kessler', minWeek: 25, weight: 6, once: true },
    roles: { rival: rivalBoss('kessler', 'Danny Kessler'), sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'Danny Wants a Roof',
    body: `Manno's men have burned two of {rival.name}'s jukeboxes and leaned on his liquor supplier. Kessler is proud, but he isn't stupid. He comes to you, at night, and asks you to bring him to Philadelphia, under the umbrella. He'll pay tribute through you.

{sal.name}, when you mention it, is very interested, the way a cat is interested in a bird with a broken wing. "Bring him in," Sal says. "Then we'll see what he is."`,
    options: [
      {
        text: 'Bring Kessler to Philadelphia. You vouch for him.',
        effects: [rivOp('kessler', 25), rivOp('philly', 10), heat('family', 4), infl('north', 5), flag('kessler_under_you')],
        preview: 'North Wildwood pays through you. If Kessler misbehaves, it\'s on your name.',
      },
      {
        text: 'Protect him yourself. No Philadelphia.',
        effects: [rivOp('kessler', 30), rivOp('manno', -15), heat('family', 6), rivOp('philly', -8)],
        preview: 'An ally of your own. Philadelphia hates independents who have friends.',
      },
      {
        text: 'Let Manno break him. Pick up the pieces after.',
        gate: { trait: 'Cruel' },
        effects: [rivOp('kessler', -30), rivRes('kessler', { muscle: -10 }), rivRes('manno', { money: 3000 }), infl('north', 3)],
        preview: 'Kessler falls and you inherit North Wildwood. Manno gets stronger doing it.',
      },
    ],
  },
  {
    id: 'tb_manno_complaint',
    category: 'table',
    trigger: { rivalAlive: 'manno', minWeek: 12, weight: 7, cooldownWeeks: 52 },
    roles: { rival: rivalBoss('manno', 'Carmine Manno'), sal: rivalBoss('philly', 'Sal "the Bag" Moretti'), actor: crewRole('a soldier who works in Atlantic County', { rank: ['soldier', 'associate'] }) },
    title: 'A Complaint From Atlantic City',
    body: `{rival.name} has complained to Philadelphia. One of your men, {actor.call}, has been running a numbers route in Pleasantville, which is in Atlantic County, which is Manno's. Manno wants the route, back pay, and an apology at the Table in front of the others.

{sal.name} will hear it at a restaurant in South Philly next Tuesday. He's let you know, as a courtesy, that he thinks Manno is right.`,
    options: [
      {
        text: 'Give up the route and apologize.',
        effects: [money(-1500), rivOp('manno', 10), respect(-5), op('actor', -10), heat('family', -4)],
        preview: 'Peace, at the price of your face at the Table.',
      },
      {
        text: 'Fight it. Show that Manno\'s men have been in Rio Grande for a year.',
        effects: [respect(4), rivOp('manno', -10), heat('family', 3), stress(4)],
        preview: 'A real argument at the Table. Sal hates being made to choose.',
      },
      {
        text: 'Give Manno the route, but quietly move {actor.first} into Manno\'s other routes.',
        gate: { trait: 'Ambitious' },
        effects: [rivOp('manno', 5), money(800), op('actor', 10), heat('family', 4)],
        preview: 'You lose a route in public and win two in private. Until somebody notices.',
      },
    ],
  },

  /* ------------------------------------------------------------ VICE */
  {
    id: 'vc_highroller',
    category: 'vice',
    trigger: { hasBusiness: 'cardgame', weight: 9, cooldownWeeks: 26 },
    roles: { player2: townie('a car dealer from Baltimore who keeps winning', { first: 'Bud', last: 'Haskell', ethnicity: 'Irish', age: [42, 56], traits: ['Gambler', 'Charming'] }), actor: crewRole('the soldier who runs the game', { rank: ['soldier', 'capo'] }) },
    title: 'The Luckiest Man in Baltimore',
    body: `{player2.name} sells Chevrolets in Baltimore and has come to your Saturday game three weeks running. He's won eleven thousand dollars. He tips the dealer fifty, tells good jokes, and never seems to look at his cards.

{actor.call} thinks he's marking the deck. {actor.first} has thought this for two weeks and can't figure out how. "Nobody's that lucky," he says. "Except God, and God doesn't drive down from Baltimore."`,
    immediate: [money(-1500)],
    options: [
      {
        text: 'New decks every hand, and a man behind his chair.',
        effects: [money(800), op('player2', -5)],
        preview: 'If he\'s cheating, it stops. If he isn\'t, you\'ve insulted a whale.',
      },
      {
        text: 'Ban him, politely. Comp his hotel on the way out.',
        effects: [money(-200), respect(2)],
        preview: 'Your money stops leaking. Word gets around that your game is afraid of winners.',
      },
      {
        text: 'Hire him. Teach your dealers whatever he knows.',
        gate: { trait: 'Ambitious' },
        effects: [money(-2000), recruit('player2', 'associate'), biz('add', 'cardgame', 'pacific')],
        preview: 'A card mechanic on your side. The best games on the coast are yours now.',
      },
    ],
  },
  {
    id: 'vc_numbers_hit',
    category: 'vice',
    trigger: { hasBusiness: 'numbers', months: [7], weight: 12, cooldownWeeks: 52 },
    roles: { actor: crewRole('the soldier who runs the policy bank', { rank: ['soldier', 'capo'] }) },
    title: 'Everyone Played 7-4',
    body: `It came out of the Treasury balance figures on the fifth: the number was 704. July Fourth. Half the island played it as a joke, a patriotic gesture, a hunch. Grandmothers played it. Lifeguards played it. A priest may have played it.

Your policy bank, run by {actor.call}, owes more this morning than it took in all of June. {actor.first} is sitting in the back of the cigar store with the adding machine and a face the color of skim milk.`,
    options: [
      {
        text: 'Pay every winner in full, today, with a smile.',
        gate: { money: 9000 },
        effects: [money(-9000), respect(12), infl('downtown', 6)],
        preview: 'It hurts terribly. For ten years, every bet on the island comes to your bank first.',
      },
      {
        text: 'Pay at half and blame a "limit on popular numbers."',
        effects: [money(-4500), respect(-8), infl('downtown', -4)],
        preview: 'Survivable. Half of Wildwood now thinks your bank cheats.',
      },
      {
        text: 'Borrow from Philadelphia to cover it.',
        effects: [money(-1000), { k: 'debt', lender: 'philly', principal: 8000, weeklyPayment: 400, weeks: 26 }, respect(8), heat('family', 3)],
        preview: 'Your reputation is saved. Philadelphia\'s interest is not.',
      },
    ],
  },
  {
    id: 'vc_horse',
    category: 'vice',
    trigger: { hasBusiness: 'bookmaking', season: 'summer', weight: 8, cooldownWeeks: 40 },
    roles: { trainer: townie('a horse trainer who owes your book money', { first: 'Clyde', last: 'Merritt', ethnicity: 'Irish', age: [45, 60], traits: ['Gambler', 'Drinker'] }) },
    title: 'A Horse Named Hard Luck Harry',
    body: `{trainer.name} trains horses at the Atlantic City Race Course and owes your book nine hundred dollars. He offers to settle it: his horse, a seven-year-old gelding called Hard Luck Harry, is running Thursday at long odds, and Harry, he says, is "feeling much better than anybody knows."

What he's offering is a fixed race. Everybody else in the field may be in on it, or nobody may be, or the horse may just fall down. Racing commissioners have been known to test horses.`,
    options: [
      {
        text: 'Put a thousand on Harry, through a book in Philadelphia.',
        effects: [money(4500), heat('local', 4), evidence('player', 3), hook('trainer', 'He fixed a race for you')],
        preview: 'Harry wins by four lengths. The racing commission notes an unusual betting pattern.',
      },
      {
        text: 'Forgive the debt. Don\'t touch the race.',
        effects: [money(-900), op('trainer', 20), stress(-2)],
        preview: 'Clean. Harry loses. Clyde owes you something more valuable than money now.',
      },
      {
        text: 'Lay off every bet on Harry around the shore. Let the other books eat it.',
        gate: { trait: 'Patient' },
        effects: [money(2500), rivRes('kessler', { money: -2000 }), rivRes('manno', { money: -2000 })],
        preview: 'Your rivals\' books pay out. Yours doesn\'t. Nobody knows why but you.',
      },
    ],
  },
  {
    id: 'vc_slots',
    category: 'vice',
    trigger: { minWeek: 10, weight: 7, once: true },
    roles: { salesman: townie('a slot machine salesman from Chicago', { first: 'Augie', last: 'Brennan', ethnicity: 'Irish', age: [40, 55], traits: ['Charming'] }) },
    title: 'One-Armed Bandits',
    body: `{salesman.name} has driven a truck from Chicago with six slot machines under a tarp, a catalog of more, and a business card that doesn't say what business he's in. Chicago has extra. He's heard Wildwood has back rooms.

Slot machines make money while you sleep. They're also federally illegal to ship across state lines, which he's just done, which is why he's offering them at a very good price.`,
    options: [
      {
        text: 'Buy all six for the back rooms.',
        effects: [money(-2400), biz('add', 'vending', 'pacific'), heat('federal', 6), evidence('player', 3)],
        preview: 'Steady money. Federal agents love slot machines; they\'re easy to photograph.',
      },
      {
        text: 'Buy two. For Kessler\'s clubs, as a gift. Then call the State Police.',
        gate: { trait: 'Cruel' },
        effects: [money(-800), rivOp('kessler', -10), rivRes('kessler', { exposure: 15 }), heat('local', -3)],
        preview: 'Kessler\'s clubs get raided for your machines. Dirty and effective.',
      },
      {
        text: 'Not here. Philadelphia doesn\'t want Chicago\'s business.',
        effects: [rivOp('philly', 5), heat('family', -2)],
        preview: 'Philadelphia appreciates boundaries. The truck goes to Atlantic City.',
      },
    ],
  },
  {
    id: 'vc_afterhours',
    category: 'vice',
    trigger: { hasBusiness: 'bar', weight: 7, cooldownWeeks: 40 },
    roles: { inspector: official('a city fire inspector', 'fire inspector', { first: 'Gus', last: 'Meyer', ethnicity: 'Irish', age: [50, 62] }) },
    title: 'Occupancy: Ninety',
    body: `Fire Inspector {inspector.name} comes by your after-hours room at 3 a.m., a time fire inspectors are not usually awake. The sign by the door says Occupancy: 90. There are about two hundred people inside, a jazz trio, a lot of cigarette smoke, and one exit, which is behind the jazz trio.

"This is how people die," Meyer says, not unkindly. "I've carried them out." He has a citation book and a pen. He hasn't opened the book yet.`,
    options: [
      {
        text: 'Put a hundred in his citation book.',
        effects: [money(-100), heat('local', 2), hook('inspector', 'He took a bribe at 3 a.m.')],
        preview: 'He goes away. The exit is still behind the jazz trio.',
      },
      {
        text: 'Cut the room to ninety and build a second exit. He\'s right.',
        effects: [money(-1800), respect(2), heat('local', -3), op('inspector', 20)],
        preview: 'Less money every night. Nobody dies in your room.',
      },
      {
        text: 'Let him write the citation. Fight it with the commission.',
        effects: [money(-500), favor(-1), heat('local', 3)],
        preview: 'A favor spent on a fire code. The room stays the way it is.',
      },
    ],
  },
];
