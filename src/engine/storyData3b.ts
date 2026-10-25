import type { PackEvent } from './storyDataSchema';
import {
  crewOp, crewRole, evidence, famOp, famRole, favor, flag, heat, hook, money, official, op, respect, rivOp, rivRes, rivalBoss,
  stress, townie, unwashed, wealth,
} from './storyDataSchema';
import { world } from './storyData2Cast';

/**
 * Content pack 3, standalones: the house, the women and the extended family,
 * the town, the crew's vices, the show people, and the wider world going by
 * outside the window (1960-1974).
 */
export const STANDALONE_3: PackEvent[] = [
  /* ------------------------------------------------------------ THE HOUSE */
  {
    id: 'p3_wife_shop',
    category: 'family',
    trigger: { minWeek: 8, once: true, weight: 11 },
    roles: { wife: famRole('the boss\'s wife', 'spouse') },
    title: 'A Shop of Her Own',
    body: `{wife.first} has found an empty storefront on Pacific Avenue with a good window and a bad awning, and she wants to open a dress shop. Her own shop, with her own savings from twenty years of household money she never spent, and her own name over the door.

She is not asking your permission. She is telling you over breakfast, and watching how you take it.`,
    options: [
      {
        text: '"Good. It\'s yours. I won\'t come near it."',
        effects: [op('wife', 15), famOp(3), stress(-2)],
        preview: 'A clean business with her name on it. She will run it better than you run yours.',
      },
      {
        text: 'Offer to put up the money for a bigger store.',
        effects: [money(-2000), op('wife', 4), unwashed(-1500)],
        preview: 'Generous. Also a laundromat in a nicer dress. She knows it.',
      },
      {
        text: '"A boss\'s wife does not work behind a counter."',
        effects: [op('wife', -18), famOp(-3), stress(3)],
        preview: 'She opens it anyway, two years later, after a long cold winter.',
      },
    ],
  },
  {
    id: 'p3_sister_parlor',
    category: 'family',
    trigger: { minWeek: 10, once: true, weight: 10 },
    roles: {
      wife: famRole('the boss\'s wife', 'spouse'),
      sis: townie('the wife\'s younger sister', { gender: 'F', first: 'Theresa', age: [26, 36], traits: ['Ambitious'] }),
    },
    title: 'The Sister-in-Law\'s Beauty Parlor',
    body: `{sis.name}, {wife.first}'s younger sister, wants to open a beauty parlor in the Crest. She has the license, the chairs picked out and a husband who thinks it is a hobby. She needs $1,500 for the lease and the dryers.

Every wife and girlfriend of every man in the family will sit in those chairs eventually. Women talk under the dryers. {sis.first} points this out herself.`,
    options: [
      {
        text: 'Lend her the money. A real loan, with a real note.',
        effects: [money(-1500), op('sis', 12), op('wife', 6), hook('sis', 'You backed her parlor')],
        preview: 'She pays it back early. She also hears everything.',
      },
      {
        text: 'Give it to her. Family is family.',
        effects: [money(-1500), op('sis', 18), op('wife', 10), famOp(2)],
        preview: 'Your wife\'s sister will defend you to anyone, which is useful.',
      },
      {
        text: 'Send her to the bank. You stay out of the family\'s businesses.',
        effects: [op('sis', -6), op('wife', -3)],
        preview: 'The bank says no. She remembers who else said no.',
      },
    ],
  },
  {
    id: 'p3_motherinlaw',
    category: 'family',
    trigger: { season: 'offseason', minWeek: 14, once: true, weight: 10 },
    roles: {
      wife: famRole('the boss\'s wife', 'spouse'),
      mil: townie('the boss\'s mother-in-law', { gender: 'F', first: 'Philomena', age: [62, 78], traits: ['Pious', 'Paranoid'] }),
    },
    title: 'Mamma Is Staying for the Winter',
    body: `{mil.name}, your mother-in-law, has had a fall on the ice in Camden and is coming to stay "until spring." She arrives with four suitcases, a statue of the Infant of Prague and opinions about the gravy.

On the second night she answers the telephone before anyone can stop her and tells a man asking for you that you are at the club on Pacific Avenue, the one with the card game in the back. She is very proud of herself for being helpful.`,
    options: [
      {
        text: 'A second telephone line, unlisted, in your study. Mamma gets the old one.',
        effects: [money(-150), evidence('player', -2), op('wife', 4)],
        preview: 'Mamma talks to the parish on the old line. You talk to the family on the new one.',
      },
      {
        text: 'Put her up in a nice apartment near the church instead.',
        effects: [money(-600), op('wife', -6), op('mil', -10)],
        preview: 'Peace at home. Your wife thinks you are throwing her mother out, which you are.',
      },
      {
        text: 'Let her stay. Be very careful what you say at dinner until April.',
        effects: [op('wife', 10), op('mil', 8), stress(4), famOp(2)],
        preview: 'A long, holy winter. You learn to love the Infant of Prague.',
      },
    ],
  },
  {
    id: 'p3_daughter_drive',
    category: 'family',
    trigger: { minWeek: 6, once: true, weight: 10 },
    roles: { girl: famRole('the boss\'s daughter, sixteen or older', 'daughter', { age: [16, 24] }) },
    title: 'She Wants the Keys',
    body: `{girl.first} wants to learn to drive. Not with her mother, not with a driving school, and certainly not with one of your men sitting in the passenger seat like a prison guard. She wants her own car, a used Corvair she has seen on a lot in Rio Grande, and she has saved $300 of the $700 from babysitting and the snack bar.

"Every boy at school drives," she says. "Every one of them. And none of their fathers are you."`,
    options: [
      {
        text: 'Teach her yourself, Sunday mornings, in the Convention Hall parking lot.',
        effects: [op('girl', 15), stress(-3), famOp(2)],
        preview: 'The best hours of your week, and the most terrifying.',
      },
      {
        text: 'Put up the other $400. She drives. She tells you where.',
        effects: [money(-400), op('girl', 12)],
        preview: 'Freedom, with a curfew. She keeps the curfew. Mostly.',
      },
      {
        text: '"When you\'re married, your husband can teach you."',
        effects: [op('girl', -15), famOp(-2)],
        preview: 'She learns anyway, from a boy with a Chevrolet. You hear about it later.',
      },
    ],
  },
  {
    id: 'p3_hospital_ball',
    category: 'town',
    trigger: { months: [2, 3, 10, 11], minWeek: 20, once: true, weight: 10 },
    roles: {
      wife: famRole('the boss\'s wife', 'spouse'),
      mrs: townie('the prosecutor\'s wife, on the same committee', { gender: 'F', first: 'Eleanor', last: 'Whitcomb', age: [40, 55], traits: ['Honest'] }),
    },
    title: 'The Hospital Ball',
    body: `{wife.first} has been asked to chair the Hospital Ball at the Hotel Dorset: dinner, an orchestra, a raffle for a Ford Falcon, every respectable name in the county. The committee meets Thursday mornings in a sunroom in Cape May.

The vice chair is {mrs.name}, whose husband works in the County Prosecutor's office. The two women have discovered that they like each other very much. {wife.first} would like the family to underwrite the orchestra, anonymously.`,
    options: [
      {
        text: 'Underwrite the orchestra, anonymously.',
        effects: [money(-1200), respect(3), heat('local', -4), op('wife', 10)],
        preview: 'The best Hospital Ball in years. Nobody knows. Everybody knows.',
      },
      {
        text: 'Underwrite the whole ball, and have your name read out.',
        effects: [money(-3000), respect(5), heat('local', -2), heat('federal', 2), op('wife', 4)],
        preview: 'Applause in the Dorset ballroom. A prosecutor\'s wife takes a closer look at you.',
      },
      {
        text: 'Ask {wife.first} to step down. Too close to the prosecutor.',
        effects: [op('wife', -14), famOp(-2)],
        preview: 'Safe. She loses a friend she liked, because of you.',
      },
    ],
  },
  {
    id: 'p3_brother_debt',
    category: 'vice',
    trigger: { minWeek: 8, rivalAlive: 'manno', once: true, weight: 10 },
    roles: {
      bro: famRole('the boss\'s brother', 'sibling', { gender: 'M' }),
      manno: rivalBoss('manno'),
    },
    title: 'Your Brother Owes Atlantic City',
    body: `{bro.first} has been betting football at a Manno book in Ventnor, under a fake name that fooled nobody. He owes $3,200. {manno.name}'s people have not threatened him. They have been extremely polite, which is how {bro.first} knows he is in trouble.

He comes to you at Sunday dinner, after the macaroni, in the yard, smoking. "I didn't want to ask," he says. He has wanted to ask for three weeks.`,
    options: [
      {
        text: 'Pay it, through a lawyer, with a note that it will not happen again.',
        effects: [money(-3200), rivOp('manno', 4), op('bro', 10), hook('bro', 'You paid his Atlantic City debt')],
        preview: 'Manno learns your brother is a soft spot. Your brother learns you know it.',
      },
      {
        text: 'Pay half. He works off the rest at one of your places.',
        effects: [money(-1600), op('bro', 4), famOp(1)],
        preview: 'Your brother in an apron, washing glasses. It is good for him.',
      },
      {
        text: '"You made a bet with Carmine Manno. Go explain it to Carmine Manno."',
        effects: [op('bro', -20), famOp(-4), rivOp('manno', 6), respect(-1)],
        preview: 'Manno is gracious to him. Too gracious. He has a friend in Atlantic City now.',
      },
    ],
  },
  {
    id: 'p3_cousin_cop',
    category: 'law',
    trigger: { minWeek: 12, once: true, weight: 10 },
    roles: { cuz: townie('the boss\'s cousin\'s boy', { first: 'Kevin', age: [22, 27], traits: ['Honest'] }) },
    title: 'Your Cousin Wants to Be a Cop',
    body: `{cuz.name}, your cousin Anna's boy, has passed the civil-service exam for the Wildwood Police Department with the second-highest score in the county. He wants a letter from you for his application. He thinks of you as the uncle who owns a restaurant.

The Chief would hire him in a minute on your word. Whether the boy ought to wear a badge in a town where his uncle is who you are is a different question, and the boy does not know it is a question.`,
    options: [
      {
        text: 'Write the letter. A good cop is a good cop.',
        effects: [op('cuz', 15), heat('local', -2), flag('p3_cousin_badge')],
        preview: 'He will be an honest cop. That will be a problem one day, and a comfort.',
      },
      {
        text: 'Get him into the State Police instead, far from the island.',
        effects: [money(-300), favor(-1), op('cuz', 8)],
        preview: 'A trooper on the Turnpike in Mercer County, very far from Pacific Avenue.',
      },
      {
        text: 'Find him a good job at the Parkway Authority instead.',
        effects: [money(-200), op('cuz', -4), famOp(1)],
        preview: 'He never learns why he did not get the badge. His mother does.',
      },
    ],
  },
  {
    id: 'p3_st_anthony',
    category: 'church',
    trigger: { minWeek: 4, once: true, weight: 9 },
    roles: { aunt: townie('the boss\'s great-aunt', { gender: 'F', first: 'Concetta', age: [74, 86], ethnicity: 'Italian', traits: ['Pious'] }) },
    title: 'Zia Concetta\'s Statue',
    body: `Your great-aunt {aunt.first}, eighty if she is a day, has been praying a novena for your soul every Tuesday since 1952. She has decided it is not working fast enough, and she has ordered a five-foot statue of Saint Anthony for your front yard, in a bathtub grotto, with a light bulb.

It arrives on a flatbed from a monument company in Philadelphia, C.O.D., $340. The neighbors have come out to watch. One of the neighbors is a retired FBI agent.`,
    options: [
      {
        text: 'Pay the man and put Saint Anthony in the yard, light bulb and all.',
        effects: [money(-340), respect(2), famOp(3), op('aunt', 20), heat('local', -1)],
        preview: 'The most pious front yard on the island. The FBI agent nods to it every morning.',
      },
      {
        text: 'Donate the statue to St. Ann\'s, in her name.',
        effects: [money(-340), op('aunt', 10), respect(1)],
        preview: 'The parish is delighted. She visits him every day.',
      },
      {
        text: 'Send it back.',
        effects: [op('aunt', -20), famOp(-3), stress(2)],
        preview: 'She adds a second novena: for your manners.',
      },
    ],
  },
  {
    id: 'p3_godchild',
    category: 'family',
    trigger: { minWeek: 16, once: true, weight: 9 },
    roles: {
      mom: townie('the mother of the boss\'s godson', { gender: 'F', first: 'Rosalie', age: [34, 46], traits: ['Honest'] }),
      kid: townie('the boss\'s godson', { first: 'Michael', age: [17, 18] }),
    },
    title: 'Your Godson Got Into Penn',
    body: `Seventeen years ago you stood at the font for {kid.first}, the son of a soldier who died before the boy could walk. You have sent a twenty-dollar bill every birthday since. Today {mom.name} comes to the bakery with a letter: the University of Pennsylvania has accepted him. She cleans offices at night. Penn costs more than she makes in a year.

She has not come for money. She came, she says, because she thought his godfather would want to know.`,
    options: [
      {
        text: 'Pay for all four years. Through the parish, so the boy never knows.',
        effects: [money(-2500), op('mom', 30), respect(2), famOp(2)],
        preview: 'A lawyer, a doctor, an engineer: something you never were.',
      },
      {
        text: 'Pay the first year, and tell him it is from you.',
        effects: [money(-700), op('kid', 15), op('mom', 15), hook('kid', 'His godfather paid for Penn')],
        preview: 'He will be grateful for the rest of his life. You hope he never has to repay it.',
      },
      {
        text: 'Find him a scholarship through the Knights of Columbus.',
        effects: [favor(-1), op('mom', 10), respect(1)],
        preview: 'A phone call, a favor, and the Knights are proud of themselves.',
      },
    ],
  },

  /* ------------------------------------------------------------ THE TOWN */
  {
    id: 'p3_towed',
    category: 'town',
    trigger: { season: 'summer', minWeek: 2, once: true, weight: 10 },
    roles: { cop: official('a rookie patrolman', 'Patrolman', { first: 'Dennis', last: 'Pruitt', age: [22, 25], traits: ['Honest'] }) },
    title: 'Somebody Towed Your Car',
    body: `You come out of the bakery and your Lincoln is gone. In its place, on the curb, a rookie patrolman named {cop.name} is writing a ticket for the next car in line. He has been on the job eleven days. He towed you for parking in a loading zone, which you have done every morning since 1951.

Your driver is apoplectic. A small crowd has formed to see what happens to Officer {cop.last}.`,
    options: [
      {
        text: 'Pay the ticket. Shake his hand. Tell the Chief he has a good man.',
        effects: [money(-15), respect(3), heat('local', -3), op('cop', 10)],
        preview: 'The story goes around the island by lunchtime, and it is a good story about you.',
      },
      {
        text: 'One call to the Chief. The car is back in twenty minutes.',
        effects: [respect(1), heat('local', 2), op('cop', -15)],
        preview: 'The rookie learns how things work. He will remember who taught him.',
      },
      {
        text: 'Walk to the club. Leave the Lincoln at the impound lot for a week.',
        effects: [respect(2), stress(-1)],
        preview: 'A boss who walks. People find it oddly frightening.',
      },
    ],
  },
  {
    id: 'p3_wrong_number',
    category: 'law',
    trigger: { minWeek: 15, heatAbove: { federal: 10 }, once: true, weight: 10 },
    roles: {},
    title: 'The Wrong Number',
    body: `The telephone in the back office of the club rings. A man asks for "Field Office, Newark." Your bookkeeper, who is not a quick thinker, says, "Wrong number." The man says, "Sorry, I thought this was the extension," and hangs up.

Your bookkeeper is still holding the receiver. There is a faint click on the line, and then another one. Everyone in the room has stopped talking.`,
    options: [
      {
        text: 'Have the phone company man you own look at the lines. Today.',
        effects: [money(-500), evidence('player', -4), heat('federal', 2)],
        preview: 'He finds it. Now they know you know.',
      },
      {
        text: 'Leave the tap. Feed it a week of very boring phone calls.',
        effects: [heat('federal', -4), stress(3), flag('p3_tap_known')],
        preview: 'Seven days of calls about produce deliveries. Somebody in Newark is very bored.',
      },
      {
        text: 'Move everything that matters out of the club. Walk-and-talks only.',
        effects: [money(-300), evidence('player', -2), crewOp(-1)],
        preview: 'Your men hate walking on the boardwalk in February.',
      },
    ],
  },
  {
    id: 'p3_sociologist',
    category: 'town',
    trigger: { months: [6, 7, 8], minWeek: 6, once: true, weight: 9 },
    roles: { prof: townie('a Penn sociologist', { first: 'Howard', last: 'Lindqvist', age: [34, 44], traits: ['Honest', 'Charming'] }) },
    title: 'A Study of the Resort Economy',
    body: `{prof.name}, an assistant professor of sociology at the University of Pennsylvania, has a grant to study "informal economic networks in a seasonal resort community." He has a clipboard, two graduate students in Bermuda shorts, and a questionnaire.

Question 14: "In your opinion, who really runs Wildwood?" He has asked it of forty-one people. Thirty-nine of them have given him the same name. It is yours.`,
    options: [
      {
        text: 'Invite him to dinner and explain that the answer is the Chamber of Commerce.',
        effects: [money(-80), respect(1), heat('federal', -1), op('prof', 8)],
        preview: 'He writes a very nice footnote about the Chamber of Commerce.',
      },
      {
        text: 'Make sure his grant money runs out early.',
        effects: [money(-400), favor(-1), heat('local', 1)],
        preview: 'A trustee makes a phone call. The study becomes "a preliminary report."',
      },
      {
        text: 'Ignore him. Professors do not have subpoenas.',
        effects: [heat('federal', 3)],
        preview: 'His paper is published in 1962. Somebody at the Justice Department reads it.',
      },
    ],
  },
  {
    id: 'p3_bingo',
    category: 'church',
    trigger: { minWeek: 10, once: true, weight: 10 },
    roles: { msgr: townie('the monsignor', { first: 'Francis', last: 'Dougherty', age: [58, 70], ethnicity: 'Irish', traits: ['Pious', 'Patient'] }) },
    title: 'Somebody Is Skimming the Bingo',
    body: `{msgr.name} asks you to stay after the nine o'clock Mass, which he has never done. In the sacristy, among the vestments, he tells you that somebody is skimming the Tuesday bingo. Fifty, eighty dollars a week. The money is for the parish school roof.

"I don't want the police," he says. "I don't want a scandal. I want the roof." He looks at you the way priests look at men they have heard confess.`,
    options: [
      {
        text: 'Find the skimmer, quietly. Return the money. Nobody gets hurt.',
        effects: [money(-200), respect(3), op('msgr', 15), heat('local', -2)],
        preview: 'It is the treasurer of the Altar Society\'s husband. He donates a new roof, out of guilt.',
      },
      {
        text: 'Pay for the roof yourself.',
        effects: [money(-1500), respect(4), op('msgr', 20), famOp(2)],
        preview: 'The roof gets a small brass plaque with no name on it.',
      },
      {
        text: '"Father, I run a card game. I don\'t run bingo."',
        effects: [op('msgr', -10), respect(-1)],
        preview: 'He nods. He remembers it the next time you need a favor from the parish.',
      },
    ],
  },
  {
    id: 'p3_grand_marshal',
    category: 'town',
    trigger: { months: [6, 7], minWeek: 3, once: true, weight: 10 },
    roles: { mayor: official('the mayor', 'Mayor', { first: 'Walter', last: 'Brophy', age: [50, 64], traits: ['Charming'] }) },
    title: 'Grand Marshal of the Fourth',
    body: `{mayor.name} calls personally. The Fourth of July parade committee would be honored if you would serve as Grand Marshal: an open convertible, a sash, the high-school band, waving to fifty thousand tourists from Cedar Avenue to the Convention Hall.

The Mayor mentions, in passing, that the County Prosecutor will be on the reviewing stand, and that the photographers from the Philadelphia papers will be there too.`,
    options: [
      {
        text: 'Ride in the convertible. Wave. Throw saltwater taffy to the kids.',
        effects: [respect(5), heat('local', -2), heat('federal', 3), op('mayor', 10)],
        preview: 'The happiest picture ever taken of you, on the front page of the Bulletin.',
      },
      {
        text: 'Decline, and pay for the fireworks instead.',
        effects: [money(-800), respect(2), heat('local', -3), op('mayor', 6)],
        preview: 'The best fireworks in the county. Nobody photographs a man watching fireworks.',
      },
      {
        text: 'Suggest your mother. She has wanted a sash all her life.',
        effects: [respect(3), famOp(4), op('mayor', 4)],
        preview: 'She waves like a queen. The Bulletin calls her "the island\'s grandmother."',
      },
    ],
  },
  {
    id: 'p3_lifeguard_hero',
    category: 'crew',
    trigger: { season: 'summer', rank: ['soldier', 'associate'], minWeek: 3, once: true, weight: 10 },
    roles: { actor: crewRole('a soldier or associate', { rank: ['soldier', 'associate'] }) },
    title: 'A Hero on Schellenger Avenue',
    body: `{actor.call} was walking on the beach on his day off when a riptide took two boys from Scranton. He went in with his shoes on and brought both of them back. The Leader wants his picture. So does the Philadelphia Inquirer. The boys' father, a bus driver, cried on him.

{actor.first} has never had his picture in the paper for a good reason. He would very much like to.`,
    options: [
      {
        text: 'Let him have his picture. He earned it.',
        effects: [op('actor', 15), respect(3), evidence('actor', 2), crewOp(2)],
        preview: 'A hero in the family. The county detectives now know his face, too.',
      },
      {
        text: 'Let the Beach Patrol take the credit.',
        effects: [op('actor', -8), heat('local', -2), favor(1)],
        preview: 'The Beach Patrol captain owes you one. {actor.first} does not forget it.',
      },
      {
        text: 'A dinner in his honor, family only, and a gold medal you had made.',
        effects: [money(-300), op('actor', 12), crewOp(3)],
        preview: 'Only the family knows. That is the kind of hero the family likes.',
      },
    ],
  },

  /* ------------------------------------------------------------ THE CREW'S VICES */
  {
    id: 'p3_comps',
    category: 'vice',
    trigger: { rank: 'capo', minWeek: 10, once: true, weight: 10 },
    roles: { actor: crewRole('a capo', { rank: 'capo' }) },
    title: 'Drinks Are on {actor.first}',
    body: `For a month now {actor.call} has been picking up every check at the Bolero: every round, every steak, every bottle for every table of tourists who recognize him. He calls it goodwill. The bartender calls it $1,900, on the family's tab.

{actor.first} says a capo has to be seen being generous. The bartender says a capo also has to pay.`,
    options: [
      {
        text: 'Make him pay the tab out of his own end.',
        effects: [wealth('actor', -1900), op('actor', -8)],
        preview: 'He pays. He tips much less now.',
      },
      {
        text: 'The family pays; he gets a budget from now on.',
        effects: [money(-1900), op('actor', 4), respect(1)],
        preview: 'Generosity on a budget is still generosity. Mostly.',
      },
      {
        text: '"He\'s right. Put it on the family."',
        effects: [money(-1900), respect(2), op('actor', 10), crewOp(-2)],
        preview: 'Every other capo starts picking up checks too.',
      },
    ],
  },
  {
    id: 'p3_bowling',
    category: 'crew',
    trigger: { season: 'offseason', minWeek: 18, once: true, weight: 9 },
    roles: {
      actor: crewRole('a soldier', { rank: ['soldier', 'associate'] }),
      other: crewRole('another soldier', { rank: ['soldier', 'associate'], notRole: ['actor'] }),
    },
    title: 'The Bowling League',
    body: `The Wednesday night league at the lanes on Rio Grande has gone from bowling to betting to something with a point spread. {actor.call} and {other.call} have each bet a month's envelope on the championship, against each other's teams. {other.first}'s team has a ringer from Bayonne who bowls 240.

{actor.first} would like the family to look into whether the ringer is eligible. {other.first} would like the family to mind its own business.`,
    options: [
      {
        text: 'The ringer bowls. Let the best team win.',
        effects: [op('actor', -6), op('other', 6)],
        preview: 'The ringer bowls a 268. {actor.first} sells his car.',
      },
      {
        text: 'Call off the bet. Nobody bets a month\'s envelope on bowling.',
        effects: [op('actor', 3), op('other', -4), respect(1)],
        preview: 'They bowl for a trophy instead. They are both furious, and both relieved.',
      },
      {
        text: 'Take the action yourself and lay it off in Philadelphia.',
        effects: [money(400), heat('local', 1), crewOp(1)],
        preview: 'The house wins. The house always wins at bowling.',
      },
    ],
  },
  {
    id: 'p3_shoeshine',
    category: 'crew',
    trigger: { rank: 'associate', minWeek: 4, once: true, weight: 9 },
    roles: { actor: crewRole('an associate', { rank: 'associate' }) },
    title: 'The Kid Who Shines Shoes',
    body: `{actor.call} has a second job you did not know about: he shines shoes outside the Shamrock on Saturday mornings, at a quarter a pair. He has been doing it since he was nine. He makes more on the shoes than some of your soldiers make on their corners, because he knows everybody, and everybody talks to the shoeshine kid.

A capo thinks it is beneath the family. {actor.first} thinks it is the best job on the island.`,
    options: [
      {
        text: 'Let him shine. And sit in his chair every Saturday.',
        effects: [op('actor', 14), hook('actor', 'He tells you what he hears at the shoeshine stand'), respect(1)],
        preview: 'The best-informed man in the family, at a quarter a pair.',
      },
      {
        text: 'Tell him a man of the family does not kneel to anybody.',
        effects: [op('actor', -8), respect(1)],
        preview: 'He stops. Somebody else takes his corner, and his ears.',
      },
    ],
  },

  /* ------------------------------------------------------------ SHOW PEOPLE */
  {
    id: 'p3_ravelli',
    category: 'boardwalk',
    trigger: { season: 'summer', minWeek: 5, once: true, weight: 9 },
    roles: { tony: world('ent_tony_ravelli', 'Tony Ravelli, the fading radio crooner', { first: 'Anthony', last: 'Ravelli', nickname: 'Tony', age: [44, 47], ethnicity: 'Italian', traits: ['Drinker', 'Gambler'] }) },
    title: 'Tony Ravelli Missed the Second Show',
    body: `{tony.call} had a radio show in 1948 and a voice that could make a waitress put down her tray. Now he sings the old songs at a room on Pacific Avenue for three hundred a week. Tonight he missed the second show. You find him in the alley behind the club, sitting on a beer case, with a bottle and a racing form.

"I knew everybody, kid," he says. "I knew everybody in 1948. Ask me anything. Ask me who was where the night they found Gus Farina in the trunk."`,
    options: [
      {
        text: 'Ask him. Then get him a cup of coffee.',
        effects: [hook('tony', 'He told you old secrets in an alley'), stress(1), rivRes('philly', { exposure: 4 })],
        preview: 'Old stories, half of them true. Some of them about Philadelphia.',
      },
      {
        text: 'Get him to a doctor and pay his bookmakers. Once.',
        effects: [money(-900), op('tony', 25), respect(1)],
        preview: 'He sings "Stardust" on Saturday like it is 1948. The room cries.',
      },
      {
        text: 'Tell the club to find a new singer.',
        effects: [op('tony', -10)],
        preview: 'He finds a room in Atlantic City. He tells his stories there instead.',
      },
    ],
  },
  {
    id: 'p3_pearl',
    category: 'boardwalk',
    trigger: { minWeek: 8, once: true, weight: 9 },
    roles: { pearl: world('ent_pearl_sinclair', 'Pearl Sinclair, the brassy comedienne', { gender: 'F', first: 'Pearl', last: 'Sinclair', age: [38, 42], traits: ['Charming', 'Drinker'] }) },
    title: 'Pearl\'s Husband Jokes',
    body: `{pearl.name} does forty minutes of husband jokes at a supper club on the boardwalk: he is so cheap, he is so lazy, he is so mean. The audience howls. After the show, in her dressing room, with the makeup half off, she tells you the jokes are true, all of them, and that she has been saving money in a coffee can for two years to leave him.

She does not want anyone hurt. She wants a lawyer who will not be scared of him, a room in a town where he will not find her, and a booking that pays in cash.`,
    options: [
      {
        text: 'A lawyer, a room in Cape May and a summer booking at your club.',
        effects: [money(-800), op('pearl', 30), respect(2), hook('pearl', 'You helped her get away')],
        preview: 'Her decision, your help. Her new act is about being free. It is even funnier.',
      },
      {
        text: 'Book her for the summer, cash. The rest is her business.',
        effects: [money(-300), op('pearl', 12), money(600)],
        preview: 'Cash in a coffee can grows faster. She does the rest herself.',
      },
      {
        text: 'Stay out of a marriage.',
        effects: [op('pearl', -4)],
        preview: 'She leaves him anyway, in the fall, by herself. She sends you a postcard from Miami.',
      },
    ],
  },
  {
    id: 'p3_donna_reale',
    category: 'boardwalk',
    trigger: { season: 'summer', minWeek: 3, once: true, weight: 9 },
    roles: {
      donna: world('ent_donna_reale', 'Donna Reale, a teenage singer', { gender: 'F', first: 'Donna', last: 'Reale', age: [16, 16], ethnicity: 'Italian' }),
      step: townie('her stepfather and manager', { first: 'Ray', last: 'Gorski', age: [40, 50], traits: ['Greedy'] }),
      mom: townie('her mother', { gender: 'F', first: 'Lucia', last: 'Reale', age: [36, 42], traits: ['Honest'] }),
    },
    title: 'A Sixteen-Year-Old With a Hit',
    body: `{donna.first} Reale is sixteen and has a song about summer love on every jukebox on the boardwalk. She plays the Steel Pier on weekends, does her homework between shows and calls everyone "sir." Her stepfather, {step.name}, manages her and her money, and has bought himself a Thunderbird.

Her mother, {mom.first}, comes to you because a waitress told her you take care of things. She does not want anybody hurt. She wants her daughter's money in a trust where {step.first} cannot touch it, and she cannot afford the kind of lawyer who scares a man like him.`,
    options: [
      {
        text: 'Pay for the lawyer. Every dollar goes into a trust in the girl\'s name.',
        effects: [money(-1200), respect(3), op('mom', 30), op('donna', 15), famOp(1)],
        preview: 'A judge in Trenton signs the trust. {step.first} loses the Thunderbird. Nobody touched him.',
      },
      {
        text: 'Have someone explain to {step.first} that the money belongs to the girl.',
        effects: [heat('local', 3), respect(2), op('mom', 20)],
        preview: 'He understands. The money stays in the bank. He stays very polite.',
      },
      {
        text: 'Family business. Not yours.',
        effects: [op('mom', -10)],
        preview: 'The girl keeps singing. The stepfather keeps the Thunderbird.',
      },
    ],
  },

  /* ------------------------------------------------------------ THE WORLD GOING BY */
  {
    id: 'p3_havana_man',
    category: 'history',
    trigger: { between: { from: { y: 1960, m: 6 }, to: { y: 1961, m: 12 } }, minWeek: 4, once: true, weight: 10 },
    roles: { cuban: townie('a casino man from Havana', { first: 'Ernesto', last: 'Villalba', age: [40, 52], traits: ['Charming', 'Patient'] }) },
    title: 'The Man From the Hotel Riviera',
    body: `{cuban.name} ran the baccarat pit at a casino in Havana until Castro's men padlocked the doors. He got out with his wife, a suitcase and what he knows: how to run a casino floor, how to spot a cheat across a room, and where certain men in New York kept their money in Cuba.

Now he is parking cars at a motel in the Crest. He asks, in perfect English, whether you have any use for a man who knows how to run a casino in a place where casinos are illegal.`,
    options: [
      {
        text: 'Put him in charge of the card games.',
        effects: [money(-400), rivOp('feldstein', -3), money(1200), op('cuban', 20)],
        preview: 'Your games run like the Riviera. New York notices who is running them.',
      },
      {
        text: 'Ask him where the New York money in Cuba went.',
        effects: [rivRes('feldstein', { exposure: 6 }), hook('cuban', 'He told you about New York\'s Cuban money'), stress(2)],
        preview: 'Leverage on New York. A frightened man who talked once.',
      },
      {
        text: 'Wish him luck and tip him well for the car.',
        effects: [money(-20)],
        preview: 'He goes to Las Vegas in the spring. He does very well.',
      },
    ],
  },
  {
    id: 'p3_color_tv',
    category: 'town',
    trigger: { between: { from: { y: 1960, m: 10 }, to: { y: 1964, m: 12 } }, months: [10, 11, 12, 1, 2], once: true, weight: 9 },
    roles: { wife: famRole('the boss\'s wife', 'spouse') },
    title: 'The First Color Television on the Block',
    body: `The RCA man installs it on a Saturday: a walnut console the size of a coffin with a picture in living color. By eight o'clock there are eleven neighbors in your living room for Bonanza, three kids on the rug and a casserole on the coffee table nobody remembers bringing.

{wife.first} is thrilled. One of the neighbors is the retired FBI agent from the corner, and he has taken the best chair.`,
    options: [
      {
        text: 'Open house every Saturday night. Popcorn for everybody.',
        effects: [money(-100), respect(3), famOp(3), heat('local', -2)],
        preview: 'The most popular house on the island. Even the FBI man brings beer.',
      },
      {
        text: 'Move the set to the den and close the door.',
        effects: [op('wife', -6), stress(-1)],
        preview: 'You watch Bonanza alone. It is still in color.',
      },
    ],
  },
  {
    id: 'p3_dnc_1964',
    category: 'politics',
    trigger: { between: { from: { y: 1964, m: 7 }, to: { y: 1964, m: 8 } }, once: true, weight: 30 },
    roles: { pol: official('a state committeeman', 'Committeeman', { first: 'Bernard', last: 'Kilroy', age: [45, 60], traits: ['Charming', 'Greedy'] }) },
    title: 'The Convention Comes to Atlantic City',
    body: `The Democratic National Convention is in Atlantic City this August, and Atlantic City does not have enough hotel rooms, restaurants or places for delegates to go after midnight. {pol.name} of the state committee calls: three hundred delegates from the Midwest are being put up in Wildwood. They will need cars, tables and entertainment.

"Clean entertainment," he says. "Mostly." The national press will be here too.`,
    options: [
      {
        text: 'Roll out the island: tables, cars, the best shows. Everything on the level.',
        effects: [money(2500), respect(3), favor(2), heat('federal', 2)],
        preview: 'Three hundred delegates go home talking about Wildwood. Some of them are congressmen.',
      },
      {
        text: 'Run the after-hours games for the delegates. Quietly.',
        effects: [money(5000), unwashed(3000), heat('federal', 5), hook('pol', 'He sent you the delegates')],
        preview: 'A very profitable week. The national press likes after-hours stories.',
      },
      {
        text: 'Stay out of politics. Let Atlantic City have its week.',
        effects: [rivOp('manno', 4)],
        preview: 'Manno runs the delegates. Manno has a good August.',
      },
    ],
  },
  {
    id: 'p3_blackout',
    category: 'history',
    trigger: { between: { from: { y: 1965, m: 11 }, to: { y: 1965, m: 11 } }, once: true, weight: 40 },
    roles: {},
    title: 'The Night the Lights Went Out',
    body: `At 5:27 on a Tuesday evening in November the lights go out from Ontario to New Jersey. New York City is dark. Philadelphia flickers. The phones go strange and then dead.

On the island it is cold and quiet and very dark, and for twelve hours nobody in the world can hear anything anybody says on a telephone, including the FBI.`,
    options: [
      {
        text: 'Call a meeting. Every capo, in person, by candlelight.',
        effects: [evidence('player', -3), crewOp(3), stress(-2)],
        preview: 'The most honest sit-down in years, in the dark, with nothing on tape.',
      },
      {
        text: 'Send men out with flashlights to every shop the family protects.',
        effects: [money(-300), respect(4), heat('local', -3)],
        preview: 'No windows broken on your streets. The shopkeepers remember who came.',
      },
      {
        text: 'Go home and sit with your family by the fire.',
        effects: [famOp(4), stress(-4)],
        preview: 'The kids remember it for the rest of their lives.',
      },
    ],
  },
  {
    id: 'p3_moon',
    category: 'history',
    trigger: { between: { from: { y: 1969, m: 7 }, to: { y: 1969, m: 7 } }, once: true, weight: 40 },
    roles: {},
    title: 'A Man on the Moon',
    body: `July 1969: the boardwalk stops. Every bar, every arcade and every hotel lobby has a television turned up to the top, and ten thousand people in bathing suits are watching a grainy picture of a man climbing down a ladder onto the moon.

The numbers men report the strangest week of play in the history of the policy bank: everybody, it seems, is playing 7-2-0.`,
    options: [
      {
        text: 'Lay off the 720 action in Philadelphia. Fast.',
        effects: [money(-500), heat('family', -2)],
        preview: 'Prudence. If 720 comes in, Philadelphia pays.',
      },
      {
        text: 'Hold all the action. What are the odds?',
        effects: [money(1800), stress(3)],
        preview: 'It does not come in. This time.',
      },
      {
        text: 'Free hot dogs on the boardwalk for the whole night.',
        effects: [money(-400), respect(4), heat('local', -2)],
        preview: 'The best night the island ever had, and everybody remembers who paid.',
      },
    ],
  },
  {
    id: 'p3_gas_lines',
    category: 'history',
    trigger: { between: { from: { y: 1973, m: 11 }, to: { y: 1974, m: 3 } }, once: true, weight: 30 },
    roles: { capo: crewRole('a capo', { rank: 'capo' }) },
    title: 'Odd Days, Even Days',
    body: `There is no gasoline. Cars line up for a mile on Rio Grande Avenue on odd days for odd plates, even days for even plates, and the season is coming, and nobody from Philadelphia will drive to the Shore on an empty tank.

{capo.call} has found a tanker driver at the Paulsboro refinery who will sell a truckload "off the books." He also notes, helpfully, that people in a gas line will pay anything.`,
    options: [
      {
        text: 'Buy the truckload and sell it at the family\'s station at a fair price.',
        effects: [money(-1500), money(2500), respect(4), heat('local', -2)],
        preview: 'The only gas on the island, at the posted price. A boss who looks like a saint.',
      },
      {
        text: 'Buy it and sell it at whatever the line will pay.',
        effects: [money(-1500), money(5000), respect(-3), heat('local', 4), heat('federal', 3)],
        preview: 'Very profitable. Very visible. Federal price controls are federal.',
      },
      {
        text: 'Pass. Stolen gasoline is a federal case.',
        effects: [op('capo', -4)],
        preview: 'Somebody in Atlantic City takes the truckload instead.',
      },
    ],
  },
  {
    id: 'p3_draft_lottery',
    category: 'history',
    trigger: { between: { from: { y: 1969, m: 12 }, to: { y: 1970, m: 1 } }, once: true, weight: 30 },
    roles: { nephew: famRole('a young man of the family', 'nephew', { age: [19, 26] }) },
    title: 'The Lottery',
    body: `On the first of December they draw birthdays out of a glass jar on television, and the order the birthdays come out is the order the young men go to Vietnam. Every family on the island watches. Your nephew {nephew.first}'s birthday comes out ninth.

His mother has not stopped praying. His father has asked, very quietly, whether you know anybody.`,
    options: [
      {
        text: 'You know somebody. A medical deferment from a doctor in Camden.',
        effects: [money(-1500), heat('federal', 3), famOp(4), op('nephew', 10), evidence('player', 2)],
        preview: 'A heart murmur nobody ever heard before. He stays home.',
      },
      {
        text: 'Get him into the National Guard. Weekends, not Vietnam.',
        effects: [money(-500), favor(-1), famOp(3)],
        preview: 'There is a waiting list. You know the man with the list.',
      },
      {
        text: 'It is his decision. Whatever he decides, the family stands by him.',
        effects: [op('nephew', 8), respect(2), stress(3)],
        preview: 'He goes. He writes every week. He comes home in 1971.',
      },
    ],
  },
  {
    id: 'p3_tv_show',
    category: 'boardwalk',
    trigger: { between: { from: { y: 1960, m: 9 }, to: { y: 1963, m: 12 } }, minWeek: 10, once: true, weight: 9 },
    roles: { prod: townie('a television producer', { first: 'Marvin', last: 'Kessel', age: [36, 48], traits: ['Ambitious', 'Charming'] }) },
    title: 'The Syndicate Files',
    body: `A network television show called "The Syndicate Files" (G-men, tommy guns, a narrator with a voice like gravel) wants to shoot an episode about "a resort town owned by the mob." {prod.name}, the producer, has come down to scout locations, and he has heard that you are "a local businessman who knows the town."

He would like a technical advisor. He would also like to know if the Shamrock is available on a Tuesday.`,
    options: [
      {
        text: 'Rent him the Shamrock. Advise him that mobsters are mostly very boring.',
        effects: [money(800), respect(1), heat('federal', 1)],
        preview: 'The episode is terrible. The Shamrock is famous for a summer.',
      },
      {
        text: 'Make sure the town in the episode looks a lot like Atlantic City.',
        effects: [money(-500), rivOp('manno', -6), heat('local', -2)],
        preview: 'Carmine Manno watches it with his whole family. He is not amused.',
      },
      {
        text: 'Make sure they shoot it somewhere else.',
        effects: [favor(-1), heat('federal', -1)],
        preview: 'They shoot it on a back lot in Burbank. Nobody on the island is on television.',
      },
    ],
  },
];

