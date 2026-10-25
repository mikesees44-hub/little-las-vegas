import type { Boundary, EarGoal, EarWork, IntelKind } from './earsState';

/**
 * Words for the Ears (ears.ts). Period noir, short, NON-EXPLICIT: every scene
 * is a set-up or a report, nothing in between is ever shown. Every person and
 * place here is fictional.
 *
 * Tokens: {her} her name, {him} the man's name, {title} his station, {rival}
 * a rival crew, {place} her room, {op} an operator, {madam} the Madam.
 */

export const VENUES: string[] = [
  'the Coral Lantern', 'the Velvet Anchor', 'the Blue Marlin Lounge', 'the Sandpiper Room', 'the Golden Gull', 'the Pink Pelican',
  'the Seashell Supper Club', 'the Jet Lounge', 'the Lucky Tiki', 'the Starfish Room', 'the Rendezvous Room', 'the Mermaid Bar',
  'the Hi-Fi Lounge', 'the Copper Kettle cocktail bar', 'the Cabana Club', 'the Driftwood Room',
];

export const HOTELS = ['the Bel-Aire Motor Hotel', 'the Royal Palm', 'the Carousel Hotel', 'the Seacrest Arms', 'the Marlinspike Hotel', 'the Gull Harbor Inn'];
export const CLUBS = ['the Sapphire Room', 'the Gaslight Supper Club', 'the Rhumba Terrace', 'the Gold Coast Lounge', 'the Moonlit Terrace'];
export const AGENCIES = ['Starbright Talent', 'Shoreline Artists', 'Silver Slipper Bookings', 'Two Rivers Talent', 'Boardwalk Artists Bureau'];
export const CHARITIES = ['the hospital auxiliary', 'the Seashore Children\'s Fund', 'the policemen\'s widows\' benefit', 'the Altar Society bazaar', 'the lifeguards\' scholarship'];
export const OP_BASES = ['rooms over a Pacific Avenue bar', 'a motel out on Rio Grande Avenue', 'a "modeling agency" off the Boulevard', 'the back office of a Schellenger Avenue club', 'a rooming house by the bay'];
export const OP_RACKETS = [
  'keeps the girls\' wages and their bus fare, and calls it a loan',
  'lends dancers money nobody could repay, then owns their bookings',
  'takes the tips at the door and a beating comes with a short night',
  'books girls into rooms they cannot leave on their own terms',
  'holds their papers "for safekeeping" and their debts over their heads',
];

export const WORK_PLACES: Record<EarWork, string> = {
  dancer: 'dances at', hostess: 'works the room at', callgirl: 'takes calls through', waitress: 'carries trays at', cigarette: 'sells cigarettes at',
};

/** A few lines of her, for the sheet: who she is. */
export const EAR_BIO: string[] = [
  'Came down from Scranton with one suitcase and never went back.',
  'Remembers every face and forgets nothing anybody says after midnight.',
  'Reads the racing form and the society page with the same expression.',
  'Laughs at the right moment and hears the wrong one.',
  'Keeps a savings book in her shoe and her opinions to herself.',
  'Was a switchboard girl in Camden before the money got better.',
  'Has a kid sister in Catholic school and pays the tuition in cash.',
  'Never drinks what they buy her; the bartender knows.',
  'Talks like a schoolteacher when she is angry.',
  'Grew up over a tavern in Kensington and can read a drunk like a newspaper.',
];

export const GOALS: EarGoal[] = ['own_place', 'leave_life', 'marry', 'records', 'send_home', 'vegas', 'school'];

export const BOUNDARY_SAYS: Record<Boundary, string[]> = {
  no_dances: ['"I don\'t do the back rooms. Never have."', '"I pour drinks and I listen. That\'s the whole act."'],
  no_cops: ['"A cop? Find another girl."', '"Badges remember faces. Mine stays out of it."'],
  no_married: ['"He goes home to a wife. Not with me in the middle."', '"Married men are somebody else\'s trouble."'],
  no_rivals: ['"Those people? I like my face the way it is."', '"Not across that line. Ask me anything else."'],
  no_rough: ['"I\'ve seen what he does when he\'s had a few. No."', '"Not him. One of the girls still has the bruise."'],
  no_stars: ['"Show people come with photographers. Pass."', '"The minute a star\'s involved, it\'s in the columns."'],
};

/* ---------------- the hint: she comes to you ---------------- */

export const HINT_SETTINGS: string[] = [
  'She sets your drink down and doesn\'t take her hand off the glass right away.',
  'At the coat check she hands you the wrong ticket and the right look.',
  'Between sets, she stops at your table to light a cigarette she never smokes.',
  'The jukebox is between records when she leans in.',
  'She passes your booth with a tray of empties and slows down.',
  'On the boardwalk at closing time, she falls into step beside you.',
  'The phone in the back booth rings once. It is her.',
  'She sends a matchbook to your table. The inside cover has one line on it.',
  'At the end of the bar, she asks the bartender for a light and tells you instead.',
  'She is fixing her lipstick in the mirror behind the bar when your eyes meet.',
  'Outside the stage door, wrapped in a borrowed coat, she says it to the night.',
  'She takes the long way past your table on her way to the powder room.',
  'The band is playing something slow. She hums and talks over it.',
  'She counts your change slowly, one bill at a time.',
  'Over the noise of the rain on the awning, she mentions it like the weather.',
  'She sits down for exactly one cigarette.',
  'Waiting on a cab under the neon, she says it without looking at you.',
  'She tucks a cocktail napkin under your glass. You read it later.',
];

export const HINT_TAILS: string[] = [
  'She doesn\'t say anything else.',
  'Then she\'s gone to the next table.',
  'She lets it sit there.',
  'She smiles like she said nothing at all.',
  'She waits to see if you heard.',
  'She looks at the door, not at you.',
  'The rest, her look says, isn\'t free.',
  'Then she asks if you want another.',
  'She shrugs, as if it were nothing.',
  'She leaves the rest of the sentence on the table.',
];

/** Her one line, by what she heard. */
export const HINT_LINES: Record<string, string[]> = {
  graft: [
    '"Funny. {him} tips like a man who just came into money."',
    '"{him} paid his tab with a fifty. Brand-new fifty. Then another one."',
    '"{him} keeps saying \'after the vote\' like it\'s a payday."',
    '"Somebody\'s building {him} a garage. A big one."',
    '"{him} had a contractor at his table all night. They didn\'t talk about the weather."',
    '"For a public servant, {him} sure knows his way around a wine list now."',
    '"{him} asked me if I knew a good furrier. For his wife. And for somebody else."',
    '"{him} told a joke about an envelope. Nobody else laughed. He did."',
  ],
  affair: [
    '"{him} has a standing reservation for two. His wife\'s never been."',
    '"Every Thursday, {him}. Same booth, same blonde, same lie about Philadelphia."',
    '"{him} bought a bracelet his wife will never see."',
    '"There\'s an apartment in Ocean City {him} thinks nobody knows about."',
    '"{him} signs the register with a name that isn\'t his."',
    '"{him}\'s friend from out of town? She\'s from Cape May. And she isn\'t his cousin."',
  ],
  rat: [
    '"One of yours, {him}, takes his coffee in Rio Grande on Tuesdays. With a man in a gray suit."',
    '"{him} has a new friend who drives a government Ford."',
    '"{him} asked a lot of questions last night. Questions about you."',
    '"{him} keeps a phone number in his hatband. It isn\'t a girl\'s."',
    '"Funny thing about {him}: he never drinks enough to talk, but he listens like a man taking notes."',
    '"{him} met somebody behind the Convention Hall. The somebody had a badge on his belt."',
  ],
  skim: [
    '"{him} was buying rounds for the house. On a capo\'s end? Must be some end."',
    '"{him}\'s girlfriend has a new coat. It\'s a lot of coat."',
    '"{him} laughs about \'the boss\'s count\' when he\'s had three."',
    '"{him} lost two grand at cards and didn\'t blink."',
    '"{him} paid off a car in cash. A Cadillac."',
  ],
  plans: [
    '"{rival}\'s boys were in last night. {him} did the talking, and he talked about your corner."',
    '"{him} wanted to know what time you leave the club. Every night, he said."',
    '"{him} said something about \'after Labor Day.\' Then the others shushed him."',
    '"The {rival} crowd booked the back room for Friday. {him} paid. In advance."',
    '"{him} keeps drawing a map on the napkins. I keep the napkins."',
    '"{him} told the bartender {rival} won\'t be paying Philadelphia\'s prices much longer."',
    '"{him} asked who drives your car. Just making conversation, he said."',
  ],
  case: [
    '"{him} had dinner with a man from the prosecutor\'s office. They talked about a witness."',
    '"{him} said the county is short on proof and long on patience."',
    '"{him} got drunk and said your name like it was a joke he was waiting to tell."',
    '"{him} says the grand jury\'s favorite witness drinks too much to remember Tuesdays."',
    '"{him} keeps a file on his back seat. He leaves the car unlocked."',
  ],
  debt: [
    '"{him} owes a Camden shylock and the shylock knows his address."',
    '"{him} signs markers like he\'s autographing baseballs."',
    '"{him} bet the rent on a horse called Second Chance. It ran third."',
    '"{him}\'s been borrowing from the bartender. The bartender is out of patience."',
    '"{him} is two months behind with the wrong people."',
  ],
  operator: [
    '"There\'s a man called {op}. The new girls don\'t smile after a week with him."',
    '"{op} took a girl\'s bus ticket and called it insurance."',
    '"One of the girls came in with sunglasses at midnight. Ask {op} why."',
    '"{op} says nobody leaves owing him. Nobody leaves, period."',
    '"If you ever want to do something about {op}, the girls would remember."',
  ],
  leak: [
    '"{him} talks in his sleep. His girl talks to {rival}."',
    '"{him}\'s sweetheart has a cousin on the {rival} payroll."',
    '"{him} tells his girl everything. She tells it again, for money."',
    '"Love makes a man stupid. {him} is very much in love. And so is {rival}\'s bankroll."',
  ],
  link: [
    '"{him} has a girl at {place}. He thinks it\'s a secret."',
    '"{him} comes in every night she works. Only the nights she works."',
    '"{him} is sweet on somebody. Sweeter than his wife would like."',
    '"Watch {him}\'s eyes when the second show starts. He\'s not watching the band."',
  ],
};

export const HINT_TITLES: Record<string, string[]> = {
  graft: ['New money', 'A generous tipper', 'After the vote'],
  affair: ['A table for two', 'Thursday nights', 'A bracelet'],
  rat: ['Coffee in Rio Grande', 'A gray suit', 'Questions about you'],
  skim: ['A lot of coat', 'Rounds for the house', 'Cash for a Cadillac'],
  plans: ['Napkin maps', 'The back room on Friday', 'After Labor Day'],
  case: ['A man from the courthouse', 'Short on proof', 'A file on the back seat'],
  debt: ['Markers', 'A horse called Second Chance', 'The wrong people'],
  operator: ['Sunglasses at midnight', 'Nobody leaves', 'The new girls'],
  leak: ['Pillow talk', 'Love and money', 'A cousin on the payroll'],
  link: ['A girl at the club', 'The second show', 'Sweet on somebody'],
};

/** When she comes back with what she held ("keep listening"). */
export const RIPE_LINES: string[] = [
  '"Remember {him}? It got better."',
  '"You told me to keep listening. I did."',
  '"That thing about {him}. Now I have the rest."',
  '"I sat on it like you said. It hatched."',
  '"{him} again. This time with names."',
  '"You were right to wait. Now it\'s worth something."',
];

/* ---------------- the report ---------------- */

export const REPORT_OPEN: string[] = [
  '{her} comes by the club at four in the afternoon, when nobody is there.',
  '{her} calls from a pay phone on the boardwalk. Coins drop twice.',
  'A note under the office door, in {her}\'s round handwriting, then {her} herself.',
  '{her} sits in your car with her coat buttoned to the chin.',
  '{her} meets you on the Schellenger Avenue pier with the gulls for company.',
  'Over a plate of eggs at the all-night diner, {her} gets to it.',
  '{her} is waiting in the back booth when you come in, already smoking.',
  'In the empty ballroom, chairs up on the tables, {her} talks while she fixes a strap on her shoe.',
];

export const REPORT_LINES: Record<IntelKind, string[]> = {
  graft: [
    '"He\'s on two payrolls. The paving company and the city. Only one of them knows about the other."',
    '"There\'s a contractor who pays him every first of the month. In a hat box. I\'m not joking."',
    '"He fixed a zoning vote for a friend. The friend sent a boat."',
    '"He keeps the envelopes in a tackle box. He doesn\'t fish."',
  ],
  affair: [
    '"There\'s a woman in Ocean City. Rent paid through June. His wife thinks it\'s a lodge brother."',
    '"He has a girl at the Royal. He\'s careless with the hotel stationery."',
    '"A secretary from his office. They take separate cars and the same exit."',
    '"He calls her from the club phone. The bartender keeps a list of the numbers."',
  ],
  rat: [
    '"He meets a federal man every Tuesday. He thinks he\'s clever. He\'s nervous."',
    '"He told me he\'s getting out soon, with a new name. Men don\'t get new names for nothing."',
    '"He\'s scared, and scared men call somebody. He calls a number in Newark."',
  ],
  skim: [
    '"He keeps two counts. The one he gives you and the one he laughs about."',
    '"He brags that the boss never checks Thursdays."',
    '"He\'s putting money in his brother-in-law\'s name. A lot of it."',
  ],
  plans: [
    '"They\'re short men and long on talk. But they want your corner on Pacific, and soon."',
    '"He drew it for me on a napkin to impress me. Here\'s the napkin."',
    '"They\'re waiting for the Labor Day crowds to leave. Then they move."',
    '"He says they\'ve got somebody who knows your schedule. He was showing off."',
  ],
  case: [
    '"Their best witness has a bottle problem and a sister in Trenton who would like him home."',
    '"The prosecutor\'s man says the case leans on one ledger. He doesn\'t know where it is."',
    '"There\'s a cop on the task force who hates the task force."',
  ],
  debt: [
    '"He owes everybody. The shylock gave him till the end of the month."',
    '"He\'s sold his car twice. Once to the bank, once to a bookie."',
    '"He borrowed from the wrong side of the bay and he\'s scared."',
  ],
  operator: [
    '"Here are the girls\' names, the rooms, the dates. Two of them will talk, if someone keeps them safe."',
    '"He keeps a ledger of what they \'owe.\' It\'s fiction. I know where it is."',
    '"The desk clerk at his motel would testify, for a ticket to Florida."',
  ],
  leak: [
    '"She sells what he tells her, every Sunday, to a man from the other side."',
    '"He thinks she\'s in love. She is, with the envelope."',
  ],
  link: [
    '"He has a girl. Three nights a week. Everybody knows but his wife."',
    '"He\'s sweet on a hostess at the Pelican. Sweeter than he lets on."',
  ],
  nothing: [
    '"He\'s clean. Boring, even. Talks about his boat and his mother."',
    '"Nothing. He drinks club soda and goes home at midnight. I almost liked him."',
    '"He\'s either a saint or the most careful man in Cape May County."',
    '"He talked about baseball for two hours. I know more about the Phillies than I ever wanted to."',
  ],
};

/** What she thinks of him, by his nature. */
export const OPINION_LINES: { trait: string; lines: string[] }[] = [
  { trait: 'Cruel', lines: ['"He\'s mean when he drinks. I won\'t sit with him again."', '"He likes it when people are afraid of him. Watch him."'] },
  { trait: 'Hot-headed', lines: ['"Short fuse. The waiter dropped a fork and he nearly came across the table."', '"Loud. Loud men tell you everything."'] },
  { trait: 'Charming', lines: ['"Smooth. Too smooth. He practices."', '"He could sell sand on this beach."'] },
  { trait: 'Greedy', lines: ['"He counted the change. Twice."', '"Money is the only thing he looks at longer than a woman."'] },
  { trait: 'Paranoid', lines: ['"He sat facing the door and asked my real name three times."', '"Jumpy. Every time the door opened he reached for his hat."'] },
  { trait: 'Womanizer', lines: ['"He\'s got a line for every girl in the room. Same line."', '"He tried his luck. He tries it everywhere."'] },
  { trait: 'Drinker', lines: ['"By the third Manhattan he forgot I was there."', '"He drinks to remember he\'s important."'] },
  { trait: 'Gambler', lines: ['"He tipped me with a marker. A marker."', '"He bet the bartender on the fourth race. He lost."'] },
  { trait: 'Pious', lines: ['"He crossed himself when the band played. I think he meant it."', '"He talked about Mass and looked guilty about the cocktail."'] },
  { trait: 'Honest', lines: ['"I don\'t know what you want with him. He\'s decent."', '"He paid what he owed and said thank you. In this town."'] },
  { trait: 'Ambitious', lines: ['"He wants a bigger chair. Yours, maybe."', '"He talks about next year like he owns it."'] },
  { trait: 'Cowardly', lines: ['"He\'s scared of somebody. Not you. Not yet."', '"A car backfired and he went under the table."'] },
];

export const OPINION_PLAIN: string[] = [
  '"He\'s nothing special. That\'s what makes him useful."',
  '"A gentleman, mostly. Mostly."',
  '"He talks about himself in the third person after midnight."',
  '"I\'ve met worse. Not many."',
];

export const REGULAR_LINES: string[] = [
  'He asked for her again on Friday.',
  'He has a table now, the one with the view of the stage.',
  'He sends flowers to the dressing room. She gives them to the coat-check girl.',
  'He\'s a regular now. She didn\'t have to try hard.',
];

export const FAIL_LINES: string[] = [
  '"He\'s careful. Too careful. I got a drink and a cab fare."',
  '"He had a man watching the room. I left early."',
  '"He spent the night talking to somebody else. I couldn\'t get near."',
  '"He knew. Don\'t ask me how. He smiled at me like he knew."',
  '"Nothing. And he asked who sent me. I said nobody. He didn\'t believe me."',
];

export const REFUSE_LINES: string[] = [
  '"Not this one. Ask me again some other time."',
  '"I like you. I don\'t like this."',
  '"No. And don\'t ask me why."',
  '"Find somebody braver. Or richer."',
  '"Not for that money. Not for any money, maybe."',
  '"I\'ll pretend you didn\'t ask."',
];

export const COUNTER_LINES: string[] = [
  '"For {price}, I\'d think about it. I already thought about it. {price}."',
  '"He\'s worth more trouble than you\'re paying for. {price}."',
  '"{price}, and a cab home every night. That\'s the job."',
  '"Double it and I\'m already there. {price}."',
  '"{price}. I have a sister in school."',
];

/* ---------------- protection ---------------- */

export const PROTECT_OPEN: string[] = [
  'She came in through the kitchen at two in the morning, past the dishwashers, and asked for you by name.',
  'The cook says there is a girl in the alley who will only talk to the boss.',
  'She is waiting in the church parking lot after the nine o\'clock Mass, in sunglasses.',
  'Your driver says a girl flagged the car down on Ocean Avenue. She is in the back seat, shaking.',
  'The coat-check girl walks a friend to your table and stays to hold her hand.',
  'She is sitting on the steps of your club when you arrive in the morning. She has been there all night.',
];

export const PROTECT_PLEA: string[] = [
  '"I work for {op}. I mean I did. I owe him, he says. I\'ll owe him forever, he says."',
  '"{op} has my papers and my wages. I want out. That\'s all. Out."',
  '"Everyone says you\'re the only one {op} is afraid of. Is that true?"',
  '"I don\'t want money. I want {op} to stop knowing where I sleep."',
  '"I\'m not asking for charity. I\'ll pay you back. Just not in his way."',
];

/* ---------------- web story hooks ---------------- */

export const JEALOUSY: string[] = [
  '{a} and {b} both want the same girl at {place}, {her}. Last night it nearly came to fists over a song request.',
  '{a} found out {b} has been sending flowers to {her}. He sent a brick through {b}\'s windshield in reply.',
  'At {place}, {a} told {b} to find another table. {her} told them both to grow up.',
];

export const PROTECTOR: string[] = [
  '{a} heard {her} has been sitting with {him}. He came to you hat in hand and jaw tight: he doesn\'t like it.',
  '{a} is sweet on {her}, and now he knows she is working {him}. "Pull her off it," he says. "Or I will."',
];

export const BREAKUP: string[] = [
  '{a} and {her} are finished. She threw his ring in the ocean off the Hunt pier and his secrets went with it, to somebody else.',
  '{her} left {a} for good. People say she has a new friend now, and the new friend works for {rival}.',
];

export const PREGNANT: string[] = [
  '{her} is expecting. She says it is {a}\'s. She says it quietly, and only to you.',
  '{her} has been sick in the mornings. The girls know before {a} does.',
];

export const WIFE: string[] = [
  '{a}\'s wife found a matchbook from {place} in his jacket, and then she found out who works there.',
  'Somebody told {a}\'s wife about {her}. She showed up at the club in her church hat.',
];

export const LEAVING: string[] = [
  '{her} says she\'s done. She has a bus ticket and a little money saved, and she wanted to say goodbye.',
  '{her} came by to tell you she is leaving the life. "Nothing personal," she says. "It\'s just time."',
  '{her} has an offer: a straight job and a man who doesn\'t ask questions. She is taking it.',
];

/* ---------------- the Madam ---------------- */

export const MADAM_SQUEEZE: Record<'operator' | 'rival' | 'law', string[]> = {
  operator: [
    '{madam} sends a car. In her office above {hotel}, she pours two coffees. "{op} is poaching my girls and scaring the rest. I could use a friend."',
    '{madam} meets you at the charity luncheon and says, between the speeches, that {op} put one of her girls in the hospital.',
  ],
  rival: [
    '{madam}\'s lieutenant comes alone. "{rival} wants a piece of the house. They sent two men to say so." The Madam would like to know whose friend you are.',
    '{madam} calls herself: "{rival} is leaning on my hotel. Either they stop, or I make my own arrangements."',
  ],
  law: [
    'The vice squad raided {hotel} twice this month. {madam} wants to know if you know anyone who can make it stop.',
    'A county detective is asking {madam}\'s girls about her books. She would consider it a great kindness if he lost interest.',
  ],
};

export const MADAM_ALLY: string[] = [
  '{madam} was seen at {rival}\'s table at {club}, laughing at the right moments.',
  'Word is {madam} has a new friend: {rival}. Her girls have stopped saying hello.',
];

export const MADAM_INTRO: string[] = [
  '{madam} introduces you to {her} at the bar of {hotel}. "She hears things," the Madam says. "Be nice to her."',
  'At {madam}\'s charity dinner, you are seated next to {her}. By dessert you understand why.',
];
