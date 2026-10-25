import type { PackEvent } from './storyDataSchema';
import {
  biz, carried, crewOp, crewRole, evidence, famOp, famRole, favor, flag, heat, hook, infl, leave, money, official, op, prison, recruit, respect, rivOp, rivalBoss, rivalMan, secret, stress, thenFx as then, townie, unwashed,
} from './storyDataSchema';

/**
 * Chains B
 *  6. The New Dance        (nd_*)    summer 1960, the Twist comes to Pacific Avenue
 *  7. The Parish Carnival  (car_*)   Father Quinlan asks you to keep it clean
 *  8. The Commission Race  (el_*)    a reform pharmacist runs for city commissioner
 *  9. Desert Money         (ds_*)    Feldstein brings Nevada money to the shore
 * 10. Home From Fort Dix   (nep_*)   your sister's boy comes home from the Army
 */
export const CHAINS_B: PackEvent[] = [
  /* ================================================================ */
  /* 6. THE NEW DANCE                                                  */
  /* ================================================================ */
  {
    id: 'nd_1',
    category: 'boardwalk',
    chain: { id: 'new_dance', part: 1 },
    trigger: { between: { from: { y: 1960, m: 6 }, to: { y: 1960, m: 8 } }, once: true, weight: 30, district: 'pacific' },
    roles: { actor: crewRole('the capo who runs Pacific Avenue', { rank: 'capo' }) },
    title: 'A Line Around the Block',
    body: `There is a line of teenagers around the block outside the Rainbow Club on Pacific Avenue: ponytails, rolled sleeves, Philadelphia accents. Inside, a big kid from South Philly who calls himself Chubby Checker is doing a new dance called the Twist, and the chaperones are going pale in the doorway.

You don't own the Rainbow. You own the supper club two doors down, where a crooner in a white dinner jacket is singing to eleven people, nine of them over sixty. {actor.call} stands on the curb, watching the line, smoking. "It's a fad," he says. "Like hula hoops." He doesn't sound sure.`,
    options: [
      {
        text: 'Book rock-and-roll acts. Fill the room with whoever fills it.',
        effects: [money(2500), crewOp(-3), heat('local', 4), op('actor', -5), flag('nd_rock'), then('nd_2', 2, 4, 1)],
        preview: 'The kids bring money and noise. The old-timers say you\'ve cheapened the place.',
      },
      {
        text: 'Stay a supper club. Steak, martinis and grown-ups.',
        effects: [money(-800), respect(2), op('actor', 8), then('nd_4', 4, 8, 0.6)],
        preview: 'Dignity has a cover charge. Nobody under thirty pays it.',
      },
      {
        text: 'Open a teen club in an empty arcade on the pier. Soda, dancing, no liquor.',
        gate: { money: 4000 },
        effects: [money(-4000), biz('add', 'club', 'piers'), heat('local', -2), famOp(4), flag('nd_teen'), then('nd_3', 3, 5, 1)],
        preview: 'Clean money from a new generation. Their parents may not see it that way.',
      },
    ],
  },
  {
    id: 'nd_2',
    category: 'vice',
    chain: { id: 'new_dance', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      promo: townie('a record promoter from Philadelphia', { first: 'Marvin', last: 'Stoltz', ethnicity: 'Jewish', age: [34, 44], traits: ['Charming', 'Greedy'] }),
    },
    title: 'The Record Man',
    body: `{promo.name} has a sharkskin suit, a box of 45s and an envelope he keeps patting like a dog. Your vending company services every jukebox from the Crest to Rio Grande. He would like his labels in the top row of every one of them, and he would like the Boardwalk disc jockeys to know you like his labels too.

"Congress has been asking disc jockeys about envelopes since spring," he says cheerfully. "That's why we deal with jukebox men now. Jukeboxes don't testify."`,
    options: [
      {
        text: 'Take the envelope. Top row, every box.',
        effects: [money(3000), heat('federal', 4), hook('promo', 'He paid you to rig the jukeboxes'), then('nd_3', 3, 5, 0.5)],
        preview: 'Easy money. Federal investigators are very interested in this exact kind of envelope this year.',
      },
      {
        text: 'Not for an envelope. For a piece of the label.',
        gate: { trait: 'Ambitious' },
        effects: [money(-2000), biz('add', 'vending', 'pacific'), op('promo', -5), flag('own_label'), then('nd_3', 3, 5, 0.5)],
        preview: 'You become a record man. If a hit comes out of Philly with your money behind it...',
      },
      {
        text: 'The jukeboxes play what the customers pay for. Goodnight, Marvin.',
        effects: [respect(2), heat('federal', -2), op('promo', -15), then('nd_4', 4, 6, 0.6)],
        preview: 'Clean. The promoter takes his envelope to Danny Kessler\'s jukeboxes instead.',
      },
    ],
  },
  {
    id: 'nd_3',
    category: 'politics',
    chain: { id: 'new_dance', part: 3 },
    trigger: { chainOnly: true },
    roles: { commish: official('a Wildwood city commissioner', 'city commissioner', { first: 'Eddie', last: 'Fanucci', ethnicity: 'Italian', age: [48, 62], traits: ['Greedy', 'Charming'] }) },
    title: 'Curfew',
    body: `Saturday night two crowds of boys, one from Philadelphia and one from Camden, decided the Boardwalk at Schellenger Avenue wasn't big enough for both of them. Nobody was badly hurt. Three plate-glass windows were. The Herald ran a photograph of a weeping custard vendor.

Commissioner {commish.name} wants a ten o'clock curfew for anyone under eighteen. The motel owners love it. Your arcades, your teen room and half your summer money hate it.`,
    options: [
      {
        text: 'Get the curfew killed. The Commissioner can be reasoned with.',
        effects: [money(-1500), favor(-1), heat('local', 4), hook('commish', 'He killed the curfew for you')],
        preview: 'The kids keep spending. Next fight, it\'s your fault in the paper.',
      },
      {
        text: 'Support the curfew publicly. Be the responsible businessman.',
        effects: [money(-2000), heat('local', -6), respect(3), famOp(3)],
        preview: 'Your summer take dips. Your reputation with the mothers of Wildwood rises.',
      },
      {
        text: 'Put your own men on the Boardwalk at night as "volunteer chaperones."',
        effects: [heat('local', 2), respect(5), infl('boardwalk', 4), crewOp(-2)],
        preview: 'No more fights, no curfew, and your soldiers in polo shirts. They hate it. It works.',
      },
    ],
  },
  {
    id: 'nd_4',
    category: 'rivals',
    chain: { id: 'new_dance', part: 4 },
    trigger: { chainOnly: true },
    roles: { sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'The Old Guard Doesn\'t Twist',
    body: `{sal.name} comes down for a weekend and sits in the back of your place with a plate of clams casino, watching the room. Teenagers. Saxophones. A boy in a sport coat asks his mother to dance and she does.

"In Philadelphia," Sal says, "they're asking me why Pacific Avenue has so many police on it lately. Children bring police. Police bring questions. Questions come up the Expressway to the people I answer to." He wipes his mouth. "Explain to me why I want this."`,
    options: [
      {
        text: 'Show him the books. Children spend more than gamblers in July.',
        effects: [rivOp('philly', 5), money(-1000), heat('family', 3)],
        preview: 'Money talks to Sal. It also tells him to raise your envelope.',
      },
      {
        text: 'Promise to tone it down. Fewer kids, more grown-ups.',
        effects: [money(-1500), heat('family', -6), heat('local', -3), rivOp('philly', 8)],
        preview: 'Philadelphia is pleased. The kids find another club, probably Kessler\'s.',
      },
      {
        text: 'Tell him with respect that Pacific Avenue is your business.',
        gate: { respect: 40 },
        effects: [respect(6), heat('family', 6), rivOp('philly', -10)],
        preview: 'The room hears you say it. So does Philadelphia.',
      },
    ],
  },

  /* ================================================================ */
  /* 7. THE PARISH CARNIVAL                                            */
  /* ================================================================ */
  {
    id: 'car_1',
    category: 'church',
    chain: { id: 'carnival', part: 1 },
    trigger: { months: [7, 8], rank: ['soldier', 'associate'], trait: 'Greedy', once: true, weight: 12 },
    roles: {
      actor: crewRole('a Greedy soldier who runs carnival games', { rank: ['soldier', 'associate'] }),
      priest: townie('the parish priest of Our Lady of the Dunes', { first: 'Dennis', last: 'Quinlan', ethnicity: 'Irish', age: [50, 62], traits: ['Pious', 'Honest'], office: 'pastor' }),
    },
    title: 'The Wheel at Our Lady of the Dunes',
    body: `Every August the parish of Our Lady of the Dunes puts up a carnival in the school lot: a Ferris wheel the size of a beach umbrella, zeppole, a bottle toss, and a big painted money wheel run, for the last three summers, by {actor.call}.

{priest.name} catches you after the ten-thirty Mass, shaking your hand a beat too long. "The wheel only stops on the house numbers after nine o'clock," he says pleasantly. "These are my parishioners' quarters, not tourists'. I'd consider it a personal kindness if it stopped wherever God and physics wanted."`,
    options: [
      {
        text: 'Tell {actor.first} the wheel runs straight. Every night.',
        effects: [money(-600), respect(4), op('priest', 15), op('actor', -10), famOp(3), then('car_2', 2, 4, 1)],
        preview: 'The parish gets an honest wheel. {actor.first} gets an honest wage and resents it.',
      },
      {
        text: 'Offer the parish half the wheel\'s take instead. Everybody wins.',
        effects: [money(-300), op('priest', -5), heat('local', 2), then('car_2', 2, 4, 1)],
        preview: 'The priest is insulted and needs the money. Both are true for a long time.',
      },
      {
        text: 'Smile, thank Father, change nothing.',
        effects: [money(500), op('priest', -20), famOp(-3), then('car_2', 2, 3, 1)],
        preview: 'Your mother sits next to the priest\'s housekeeper at bingo. Expect to hear about it.',
      },
    ],
  },
  {
    id: 'car_2',
    category: 'church',
    chain: { id: 'carnival', part: 2 },
    trigger: { chainOnly: true },
    roles: { actor: carried('the soldier at the wheel'), priest: carried('the priest') },
    title: 'The Rectory Strongbox',
    body: `The carnival take, $1,900 in a gray strongbox meant for a new roof on the school, vanished from the rectory office on Sunday night. The window was open. The housekeeper is beside herself. The police took a report and a donut.

You know who did it before you finish your coffee, because {actor.call} paid off his bookie Monday morning in small bills that smelled faintly of zeppole.`,
    options: [
      {
        text: 'Make him return every dollar, in person, to Father Quinlan.',
        effects: [op('actor', -20), op('priest', 20), respect(5), crewOp(-2), then('car_3', 4, 8, 0.6)],
        preview: 'Humiliation in a cassock\'s presence. The priest now knows exactly who your men are.',
      },
      {
        text: 'Replace it out of your own pocket. Discipline him privately.',
        effects: [money(-1900), op('priest', 10), op('actor', 5), hook('actor', 'He robbed a church and you covered it'), then('car_3', 4, 8, 0.6)],
        preview: 'The roof gets fixed and nobody knows. You hold this over him forever.',
      },
      {
        text: 'Let the police figure it out. Not your money.',
        effects: [op('priest', -15), famOp(-5), heat('local', 3), then('car_3', 3, 6, 1)],
        preview: 'The police will not figure it out. Somebody else might.',
      },
    ],
  },
  {
    id: 'car_3',
    category: 'law',
    chain: { id: 'carnival', part: 3 },
    trigger: { chainOnly: true },
    roles: { priest: carried('the priest'), prosecutor: rivalBoss('law', 'the Cape May County Prosecutor') },
    title: 'The Seal',
    body: `{prosecutor.name} has subpoenaed {priest.name} to the grand jury. The rumor at the Anchor Bar is that someone in your crew made a confession at Our Lady of the Dunes, and the prosecutor thinks a priest can be made to repeat it.

The priest won't. Everybody knows he won't; the seal of confession is older than the State of New Jersey. He'll go to jail for contempt first, in his collar, with the photographers outside. The Bishop in Camden is said to be very unhappy with everyone, which includes you.`,
    options: [
      {
        text: 'Pay for the best church lawyer in Philadelphia, quietly, through a parishioner.',
        gate: { money: 3500 },
        effects: [money(-3500), op('priest', 20), heat('local', -4), evidence('player', -4)],
        preview: 'The subpoena gets quashed. The priest suspects who paid, and says a Mass for you anyway.',
      },
      {
        text: 'Let it play out. A priest in jail is the prosecutor\'s headache, not yours.',
        effects: [heat('local', 5), famOp(-8), respect(-4), prison('priest', 6)],
        preview: 'The prosecutor looks like a bully. Your mother looks at you like you put him there.',
      },
      {
        text: 'Find out which of your men confessed. Then go to confession yourself.',
        gate: { trait: 'Pious' },
        effects: [stress(-12), op('priest', 10), crewOp(-4), flag('know_confessor')],
        preview: 'Your soul is lighter. Your crew wonders why you are asking who goes to church.',
      },
    ],
  },

  /* ================================================================ */
  /* 8. THE COMMISSION RACE                                            */
  /* ================================================================ */
  {
    id: 'el_1',
    category: 'politics',
    chain: { id: 'election', part: 1 },
    trigger: { months: [2, 3], minWeek: 30, once: true, weight: 20 },
    roles: {
      reform: townie('a reform candidate, a pharmacist', { first: 'Harold', last: 'Brenner', ethnicity: 'Jewish', age: [40, 52], traits: ['Honest', 'Patient'] }),
      commish: official('your friend on the city commission', 'city commissioner', { first: 'Eddie', last: 'Fanucci', ethnicity: 'Italian', age: [48, 62], traits: ['Greedy', 'Charming'] }),
    },
    title: 'A Pharmacist With Opinions',
    body: `{reform.name} has filled prescriptions on Pacific Avenue for twenty years and has seen too many young men buy aspirin for hangovers at 7 a.m. He's running for city commissioner on one promise: close the after-hours rooms and clean up "Little Las Vegas."

He is short, bald, honest, and gives free lollipops to children. He is the most dangerous man in Wildwood. Commissioner {commish.name}, your friend on the commission for nine years, has lost forty pounds of confidence since the announcement.`,
    options: [
      {
        text: 'Fund {commish.first}\'s campaign. Generously. In cash.',
        gate: { money: 3000 },
        effects: [money(-3000), op('commish', 15), heat('local', 2), then('el_2', 4, 6, 1)],
        preview: 'Billboards and beer for every firehouse. Money is not the same as votes.',
      },
      {
        text: 'Send someone to find out what the pharmacist is ashamed of.',
        effects: [heat('local', 3), stress(3), flag('el_dirt'), then('el_2', 4, 6, 1)],
        preview: 'Everybody has something. Sometimes it\'s nothing you can use.',
      },
      {
        text: 'Invite Brenner to lunch. Maybe he likes you.',
        gate: { trait: 'Charming' },
        effects: [op('reform', 10), flag('el_lunch'), then('el_2', 4, 6, 1)],
        preview: 'He likes you fine. He still wants to close your rooms.',
      },
    ],
  },
  {
    id: 'el_2',
    category: 'politics',
    chain: { id: 'election', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      reform: carried('the reform candidate'), commish: carried('your commissioner'),
      fixer: crewRole('a soldier who knows the wards', { rank: ['soldier', 'associate', 'capo'] }),
    },
    title: 'Three Hundred Absentee Ballots',
    body: `{fixer.call} has a list. Three hundred names from the off-season rooming houses: waiters who went home to Scranton, dishwashers who went home to Puerto Rico, two gentlemen who went home to God in 1958. Every one of them could vote absentee for Eddie Fanucci, if somebody helpfully filled out the forms.

"It's how we did it in '52," he says. "And '56. Nobody counts absentee ballots, boss. Nobody ever has."`,
    options: [
      {
        text: 'Do it. All three hundred.',
        effects: [evidence('player', 6), heat('local', 6), op('fixer', 5), flag('el_fixed'), then('el_3', 3, 5, 1)],
        preview: 'Probably enough to win. Definitely enough to indict.',
      },
      {
        text: 'Do it honestly: free rides to the polls for every grandmother on the island.',
        effects: [money(-1200), respect(3), flag('el_honest'), then('el_3', 3, 5, 1)],
        preview: 'Legal, decent, and maybe not enough.',
      },
      {
        text: 'Make the dead men vote, and leave the living alone. Fifty names, no more.',
        effects: [evidence('player', 3), heat('local', 3), flag('el_fixed'), then('el_3', 3, 5, 1)],
        preview: 'A smaller sin. Harder to notice, and harder to forgive if somebody does.',
      },
    ],
  },
  {
    id: 'el_3',
    category: 'politics',
    chain: { id: 'election', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { reform: carried('the reform candidate'), commish: carried('your commissioner') },
    title: 'Election Night at the Firehouse',
    body: `They count the ballots at the firehouse on Pacific. Kids sit on the bumper of the pumper truck eating hot dogs; men stand in the doorway with their hats pushed back. By eleven, {reform.last} leads by forty-one votes.

At eleven-fifteen someone notices the ballot box from the Fourth Ward is not on the table. At eleven-twenty a fireman finds it in the back of a pickup truck, which is not where ballot boxes live. Everyone in the room turns, slowly, to look at the one man who would know where it came from. That man is you.`,
    options: [
      {
        text: 'Let it be counted. Whatever is in it is in it.',
        effects: [respect(4), heat('local', -4), flag('el_brenner_won'), then('el_4b', 4, 8, 1)],
        preview: 'Brenner probably wins. The town sees you take a loss like a gentleman.',
      },
      {
        text: 'Have a fireman you know discover that the box was "contaminated by water."',
        effects: [evidence('player', 6), heat('local', 8), op('reform', -30), flag('el_fanucci_won'), then('el_4', 3, 6, 1)],
        preview: 'Fanucci wins on a technicality. Brenner calls the Attorney General in Trenton.',
      },
      {
        text: 'Demand a recount yourself, loudly, so you look like the honest one.',
        gate: { trait: 'Charming' },
        effects: [respect(6), heat('local', 2), op('reform', 5), flag('el_fanucci_won'), then('el_4', 3, 6, 0.6)],
        preview: 'The recount takes weeks and your friends on the board count it. Fanucci by nine.',
      },
    ],
  },
  {
    id: 'el_4',
    category: 'politics',
    chain: { id: 'election', part: 4 },
    trigger: { chainOnly: true, flag: 'el_fanucci_won' },
    roles: { commish: carried('your commissioner') },
    title: 'What a Commissioner Owes',
    body: `{commish.name} is sworn in for a fourth term in a new suit you paid for. Two weeks later he's in your kitchen, at your table, eating your mother's pizzelles.

He needs one thing. His wife's nephew wants a liquor license for a place on Pacific, and the nephew is, to put it charitably, a moron. Licenses are scarce. You were going to use the next one for your own place. "Family," {commish.first} says, spreading his hands. "You understand family."`,
    options: [
      {
        text: 'Give the moron the license. Keep the Commissioner happy.',
        effects: [op('commish', 20), favor(2), money(-1500)],
        preview: 'A friend at City Hall for four more years. A moron on Pacific Avenue for the same four.',
      },
      {
        text: 'Your place gets the license. He\'ll understand. He owes you.',
        effects: [biz('add', 'bar', 'pacific'), op('commish', -15), favor(-1)],
        preview: 'You win the license and teach a politician that you count his debts.',
      },
      {
        text: 'Give it to the nephew, and the nephew sells you the bar in a year at cost.',
        gate: { trait: 'Patient' },
        effects: [op('commish', 10), favor(1), flag('nephew_bar_option')],
        preview: 'Everyone gets something eventually. The moron will run it into the ground first.',
      },
    ],
  },
  {
    id: 'el_4b',
    category: 'politics',
    chain: { id: 'election', part: 4 },
    trigger: { chainOnly: true, flag: 'el_brenner_won' },
    roles: { reform: carried('the new commissioner'), commish: carried('the defeated commissioner') },
    title: 'Commissioner Brenner',
    body: `Commissioner {reform.name}'s first act is a raid on two after-hours rooms. One of them is yours. His second act, the same afternoon, is to walk into the Ivanhoe alone, order a ginger ale, and sit beside you at the bar.

"I'm not a fool," he says. "I can't close Pacific Avenue and I don't want to. I want the after-hours rooms closed by two, no minors through the door, and the rooming houses inspected. Do that, and I'll make speeches about you instead of subpoenas."

{commish.first} Fanucci, meanwhile, has taken a job at a car dealership and calls you twice a day.`,
    immediate: [biz('close', 'club', 'pacific', 4)],
    options: [
      {
        text: 'Shake on it. Close by two, no kids, rooming houses inspected.',
        effects: [money(-2500), heat('local', -10), respect(-2), op('reform', 20)],
        preview: 'Less money and less heat. An honest man who keeps his word is a strange new ally.',
      },
      {
        text: 'Thank him for the ginger ale. Open the rooms back up next week.',
        effects: [money(1500), heat('local', 8), op('reform', -20)],
        preview: 'War with City Hall. City Hall has the police.',
      },
      {
        text: 'Agree, and quietly back Fanucci for a comeback in four years.',
        effects: [heat('local', -6), op('reform', 10), op('commish', 15), money(-1500)],
        preview: 'Play both. Politicians understand that better than you think.',
      },
    ],
  },

  /* ================================================================ */
  /* 9. DESERT MONEY                                                   */
  /* ================================================================ */
  {
    id: 'ds_1',
    category: 'rivals',
    chain: { id: 'desert_money', part: 1 },
    trigger: { minWeek: 20, rivalAlive: 'feldstein', moneyAbove: 8000, once: true, weight: 12 },
    roles: {
      rival: rivalBoss('feldstein', 'Ira Feldstein, New York money'),
      morty: rivalMan('feldstein', 'Feldstein\'s accountant', { first: 'Morty', last: 'Glass', ethnicity: 'Jewish', age: [44, 56], traits: ['Patient', 'Honest'] }),
    },
    title: 'A Man With a Nevada Tan',
    body: `{morty.name} keeps the books for {rival.name} and has the kind of tan you only get standing beside a swimming pool in the desert. He orders iced tea, unbuttons his jacket, and lays it out like a balance sheet.

There are men in Las Vegas with more cash than places to put it. They think, as some men do, that New Jersey will legalize gambling one day. When it does, they'd like to already own oceanfront, through a local partner. "Someone the town knows," Morty says. "Someone Philadelphia knows. Someone, frankly, like you."`,
    options: [
      {
        text: 'Partner with them. Their money, your name on the motels.',
        effects: [money(5000), unwashed(4000), rivOp('feldstein', 15), heat('family', 6), heat('federal', 3), flag('ds_partner'), then('ds_2', 3, 5, 1)],
        preview: 'More money than the island has ever seen. Philadelphia will want to know why it wasn\'t asked.',
      },
      {
        text: 'Ask Sal Moretti first. Philadelphia\'s blessing, or nothing.',
        effects: [rivOp('philly', 10), heat('family', -3), rivOp('feldstein', -5), then('ds_3', 2, 3, 1)],
        preview: 'Proper. Philadelphia will want a piece of a deal it didn\'t make.',
      },
      {
        text: 'No outside money in Wildwood. Not while you\'re here.',
        effects: [respect(5), rivOp('feldstein', -15), crewOp(3)],
        preview: 'The Boardwalk stays local. Feldstein takes his offer to Danny Kessler.',
      },
    ],
  },
  {
    id: 'ds_2',
    category: 'vice',
    chain: { id: 'desert_money', part: 2 },
    trigger: { chainOnly: true },
    roles: { morty: carried('the accountant'), actor: crewRole('the capo whose district holds your motels', { rank: 'capo' }) },
    title: 'The Count Room in Room 14',
    body: `Morty's next visit comes with a valise and an adding machine. Cash from Nevada arrives in your motel's books as guests who never checked in: a Mr. and Mrs. Smith from Dayton in Room 14, all summer, every summer, paying in twenties.

It's clean. It's elegant. {actor.call}, who manages the motel, would need to sign the ledgers. He's watching you, not the adding machine. "My name," he says, "on their paper."`,
    options: [
      {
        text: 'Do it. {actor.first} signs, and gets a percentage.',
        effects: [money(4000), op('actor', 10), evidence('actor', 12), heat('federal', 4), then('ds_3', 3, 5, 1)],
        preview: 'Steady fees for washing other men\'s money. Your capo\'s name is now on federal paper.',
      },
      {
        text: 'Do it, but you sign. Your risk, your money.',
        effects: [money(5000), evidence('player', 10), heat('federal', 4), op('actor', 5), then('ds_3', 3, 5, 1)],
        preview: 'The boss carries the weight. Your crew sees it. So does the IRS.',
      },
      {
        text: 'Close the valise. Partners in land, not in laundry.',
        effects: [rivOp('feldstein', -10), respect(2), then('ds_3', 4, 6, 0.6)],
        preview: 'Feldstein respects caution. Feldstein also finds other launderers.',
      },
    ],
  },
  {
    id: 'ds_3',
    category: 'table',
    chain: { id: 'desert_money', part: 3 },
    trigger: { chainOnly: true },
    roles: { sal: rivalBoss('philly', 'Sal "the Bag" Moretti') },
    title: 'Philadelphia Wants Its Taste',
    body: `{sal.name} calls you up to a restaurant on Christian Street in South Philadelphia, where the waiters have worked since Prohibition. He orders veal for both of you without asking.

"New York money in my South Jersey," he says. "Desert money. You think I wouldn't hear?" He cuts his veal into very small squares. "The old man doesn't like it. He doesn't like anything new. I, personally, am a modern man. I think twenty-five percent of modern is fair."`,
    options: [
      {
        text: 'Give Philadelphia its twenty-five.',
        effects: [money(-3000), heat('family', -10), rivOp('philly', 15), rivOp('feldstein', -5), then('ds_4', 4, 8, 0.8)],
        preview: 'Everybody is happy except your ledger and Ira Feldstein.',
      },
      {
        text: 'Ten percent, and he can tell the old man it was his idea.',
        gate: { trait: 'Charming' },
        effects: [money(-1200), rivOp('philly', 5), heat('family', 2), then('ds_4', 4, 8, 0.8)],
        preview: 'Sal gets to look smart upstairs. That\'s worth more than the points to him.',
      },
      {
        text: 'Walk away from the Nevada money altogether.',
        effects: [money(-2000), rivOp('feldstein', -20), heat('family', -6), rivOp('philly', 5)],
        preview: 'Peace with Philadelphia, and a lot of angry men in Nevada who already wired funds.',
      },
    ],
  },
  {
    id: 'ds_4',
    category: 'rivals',
    chain: { id: 'desert_money', part: 4 },
    trigger: { chainOnly: true, rivalAlive: 'feldstein' },
    roles: { rival: rivalBoss('feldstein', 'Ira Feldstein') },
    title: 'Points in the Desert',
    body: `{rival.name} invites you to his place on the Boardwalk, a corner suite with a view of the ocean and a framed photograph of himself with a senator. He offers you five points in a hotel-casino in Nevada, the real thing, with your name nowhere on it.

There is one string. Once a month somebody carries a suitcase from the count room in Nevada to a bank in Miami. "Couriers get stopped," he says, "by men who don't know whose suitcase it is. Your people are discreet. Your people are invisible. Nobody looks at a family on vacation."`,
    options: [
      {
        text: 'Take the points. Your people carry the suitcase.',
        effects: [money(8000), heat('federal', 10), evidence('player', 8), rivOp('feldstein', 20), flag('nevada_points')],
        preview: 'A fortune, and a federal crime that crosses three state lines every month.',
      },
      {
        text: 'Take the points. Somebody else carries the suitcase.',
        gate: { money: 10000 },
        effects: [money(-10000), rivOp('feldstein', 5), flag('nevada_points')],
        preview: 'You buy in clean, at full price. A good long-term investment, if Nevada lasts.',
      },
      {
        text: 'Decline gracefully. You are a small man from a small town.',
        effects: [rivOp('feldstein', -5), respect(2), stress(-4)],
        preview: 'Feldstein knows exactly how small you are not.',
      },
    ],
  },

  /* ================================================================ */
  /* 10. HOME FROM FORT DIX                                            */
  /* ================================================================ */
  {
    id: 'nep_1',
    category: 'family',
    chain: { id: 'nephew', part: 1 },
    trigger: { minWeek: 12, once: true, weight: 12 },
    roles: {
      nephew: famRole('your sister\'s son, home from the Army', 'nephew', { gender: 'M', age: [21, 24], spawn: { first: 'Richie', gender: 'M', ethnicity: 'Italian', age: [21, 24], traits: ['Honest', 'Hot-headed'] } }),
      sister: famRole('your sister', 'sister', { spawn: { first: 'Angela', gender: 'F', ethnicity: 'Italian', age: [38, 46], traits: ['Pious'] } }),
    },
    title: 'Back From Fort Dix',
    body: `{nephew.first} comes up your front steps in his Army khakis with the creases still sharp, two years at Fort Dix and Germany behind him and a duffel bag he hasn't unpacked. He's grown into his shoulders. He looks like your father.

He wants in. He says it plainly, at your kitchen table, the way they taught him to report. Last night your sister {sister.first} called you, crying, and made you promise on your father's grave you'd keep her boy straight. Both of them are waiting for you to answer, and only one of them is in the room.`,
    options: [
      {
        text: 'Bring him in. Start him as an associate.',
        effects: [recruit('nephew', 'associate'), op('nephew', 20), op('sister', -35), famOp(-5), flag('nep_crew'), then('nep_2a', 3, 6, 1)],
        preview: 'A good kid with discipline and your blood. Your sister will never forgive you.',
      },
      {
        text: 'Get him on the Wildwood police. A cop in the family is no bad thing.',
        effects: [favor(-1), op('nephew', 5), op('sister', 15), flag('nep_cop'), then('nep_2b', 4, 8, 1)],
        preview: 'He gets a badge. You get a nephew with a badge, which is a complicated thing to have.',
      },
      {
        text: 'Call in a favor at the telephone company. Union job, pension, clean.',
        effects: [favor(-1), op('nephew', -10), op('sister', 25), famOp(4), flag('nep_phone'), then('nep_4', 10, 20, 1)],
        preview: 'Straight life. He resents you for it, for now. Phone men know things too.',
      },
    ],
  },
  {
    id: 'nep_2a',
    category: 'crew',
    chain: { id: 'nephew', part: 2 },
    trigger: { chainOnly: true, flag: 'nep_crew' },
    roles: {
      nephew: carried('your nephew'),
      sister: carried('your sister'),
      debtor: townie('a bar owner behind on his payments', { first: 'Stan', last: 'Kowalczyk', ethnicity: 'Irish', age: [40, 55], traits: ['Drinker'] }),
    },
    title: 'His First Collection',
    body: `You send {nephew.first} to collect four hundred dollars from {debtor.name}, who runs a bar on the bay side and has three kids and a wife who walked out at Easter. {nephew.first} comes back in two hours and hands you four hundred dollars.

Later you find out the money was his. Army savings. He took one look at the kids doing homework at the end of the bar and paid it himself. He doesn't know you know. He's polishing his shoes in the back room, whistling.`,
    options: [
      {
        text: 'Say nothing. Let him learn the hard way next time.',
        effects: [money(400), op('nephew', 3), then('nep_3', 4, 8, 1)],
        preview: 'Next time there won\'t be savings. You\'ll learn what he does then.',
      },
      {
        text: 'Give him his money back and tell him a soft heart is a liability.',
        effects: [op('nephew', -5), respect(2), then('nep_3', 4, 8, 1)],
        preview: 'He learns the lesson you learned. You remember what it cost you.',
      },
      {
        text: 'Give him the money back and put him on the books, not the street.',
        effects: [op('nephew', 15), op('sister', 10), then('nep_3', 4, 8, 1)],
        preview: 'He\'d make an accountant. Accountants are the ones who testify.',
      },
    ],
  },
  {
    id: 'nep_2b',
    category: 'law',
    chain: { id: 'nephew', part: 2 },
    trigger: { chainOnly: true, flag: 'nep_cop' },
    roles: {
      nephew: carried('your nephew, the cop'),
      sister: carried('your sister'),
      actor: crewRole('one of your capos', { rank: 'capo' }),
    },
    title: 'Officer in the Family',
    body: `It's two in the morning and {nephew.first} is calling from the desk phone at police headquarters. He pulled over a Cadillac with a busted taillight on Rio Grande Avenue. The driver was {actor.call}. The trunk had sixty cartons of cigarettes without New Jersey tax stamps.

"He told me to call my uncle," {nephew.first} says. His voice is very calm, the way it gets when he's frightened. "So I'm calling my uncle. The sergeant hasn't seen the trunk yet. What do I do?"`,
    options: [
      {
        text: 'Tell him to lose the paperwork. Family first.',
        effects: [op('actor', 10), hook('nephew', 'He buried a report for you', true), op('nephew', -10), evidence('nephew', 8), then('nep_3', 3, 6, 1)],
        preview: 'Your capo walks. Your nephew is now dirty, and you made him so.',
      },
      {
        text: 'Tell him to do his job. {actor.first} can afford a lawyer.',
        effects: [op('actor', -25), op('nephew', 15), op('sister', 10), heat('local', 3), prison('actor', 4), then('nep_3', 3, 6, 1)],
        preview: 'The boy stays clean. Your capo spends a month in county and thinks about loyalty.',
      },
      {
        text: 'Tell him you don\'t know any {actor.last}, and hang up.',
        effects: [op('nephew', -5), op('actor', -10), stress(5), then('nep_3', 3, 6, 1)],
        preview: 'He has to decide by himself. You learn who he is from whatever he does.',
      },
    ],
  },
  {
    id: 'nep_3',
    category: 'family',
    chain: { id: 'nephew', part: 3 },
    trigger: { chainOnly: true },
    roles: { nephew: carried('your nephew'), sister: carried('your sister') },
    title: 'Angela\'s Kitchen',
    body: `{sister.first} doesn't invite you in; she just leaves the screen door open and goes back to the stove. She's making escarole and beans, which she only makes when she's furious, because it's what your mother made when your father didn't come home.

"You promised me," she says, stirring. "On Papa's grave." The spoon goes around and around. "Every night I look at that boy and I see you at his age, and I see where you went." She doesn't turn around. "Give me my son back."`,
    options: [
      {
        text: 'Cut him loose. Find him something straight, far away.',
        effects: [op('sister', 30), op('nephew', -20), famOp(6), leave('nephew', 'retires'), flag('nep_released')],
        preview: 'Your sister gets her son. You lose the best young man you had.',
      },
      {
        text: 'Tell her he\'s a grown man and chose his own life.',
        effects: [op('sister', -30), famOp(-6), respect(3), then('nep_4', 8, 14, 1)],
        preview: 'True, and cruel. She doesn\'t come to Christmas.',
      },
      {
        text: 'Promise her he\'ll never carry a gun or a bag. Mean it.',
        effects: [op('sister', 15), op('nephew', -5), stress(4), then('nep_4', 8, 14, 1)],
        preview: 'A promise you\'ll have to keep in a business that makes them hard to keep.',
      },
    ],
  },
  {
    id: 'nep_4',
    category: 'law',
    chain: { id: 'nephew', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { nephew: carried('your nephew'), prosecutor: rivalBoss('law', 'the Cape May County Prosecutor') },
    title: 'Two Men in a Ford Falcon',
    body: `{nephew.first} comes to your house after midnight and asks to talk in the yard, not the kitchen. Two men in a gray Ford Falcon stopped him outside his apartment: one from {prosecutor.name}'s office, one who didn't give a name and didn't need to.

They know who his uncle is. They'd like his help, the kind that gets a man's record wiped and his mother's mortgage paid. If he works at the phone company, they need a line run. If he wears a badge or works for you, they need a wire. They gave him a week. He came to you in a day.`,
    options: [
      {
        text: 'Tell him to say yes, and feed them exactly what you want them to hear.',
        gate: { trait: 'Paranoid' },
        effects: [evidence('player', -10), heat('federal', -6), hook('nephew', 'He is your double agent', true), stress(10), secret('nephew', 'informant')],
        preview: 'Your own line into the prosecutor. If they ever catch on, the boy pays first.',
      },
      {
        text: 'Get him a lawyer and a plane ticket to your cousin in Providence.',
        gate: { money: 2500 },
        effects: [money(-2500), leave('nephew', 'exile'), op('nephew', 15), heat('federal', 3)],
        preview: 'He disappears from their reach. They will ask why you were so eager to make that happen.',
      },
      {
        text: 'Tell him to do whatever he thinks is right. You mean it.',
        effects: [op('nephew', 25), stress(15), then('nep_5', 2, 6, 0.5)],
        preview: 'He loves you for it. You don\'t sleep for a month.',
      },
    ],
  },
  {
    id: 'nep_5',
    category: 'family',
    chain: { id: 'nephew', part: 5 },
    trigger: { chainOnly: true },
    roles: { nephew: carried('your nephew'), sister: carried('your sister') },
    title: 'What Richie Decided',
    body: `It takes him three weeks. He tells the men in the Falcon no, in a diner in Cape May, in front of a waitress who'll remember. Then he comes and tells you, and asks for nothing.

Two days later his car gets towed from in front of his own apartment, and his landlord gets a visit from a building inspector, and his mother gets a letter from the IRS about her late husband's 1957 return. That's how they do it: not with a hammer, with paper. {sister.first} calls you, and for the first time in a year, she asks for help.`,
    options: [
      {
        text: 'Pay for everything. Lawyers, accountants, the tow.',
        effects: [money(-3000), op('sister', 30), op('nephew', 20), famOp(8)],
        preview: 'The family closes ranks. The prosecutor notes the size of your checks.',
      },
      {
        text: 'Make a phone call to a friend in the IRS office in Camden.',
        effects: [favor(-2), heat('federal', 4), op('sister', 20), op('nephew', 15)],
        preview: 'The letter goes away. Your friend in Camden is now worth less to you.',
      },
      {
        text: 'Bring the boy into the business now. They already think he is.',
        effects: [recruit('nephew', 'soldier'), op('sister', -40), famOp(-8), op('nephew', 10), respect(4)],
        preview: 'He was going to be punished for you anyway. Now he\'s paid for it.',
      },
    ],
  },
];

