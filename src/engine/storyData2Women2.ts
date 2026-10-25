import type { PackEvent } from './storyDataSchema';
import {
  biz, carried, crewOp, crewRole, evidence, famOp, famRole, favor, feud, flag, heat, hook, infl, money, op, rank,
  recruit, respect, rivOp, rivRes, rivalBoss, secret, stress, thenFx as then, townie,
} from './storyDataSchema';
import { lover, world } from './storyData2Cast';

/**
 * Women II
 *  7. The Widow's Book        (p2_wbk_*)  a young South Philly widow's numbers bank wants a new partner
 *  8. The Sandpiper           (p2_sand_*) a woman bar owner and Kessler's appetite for her license
 *  9. Carbon Copies           (p2_cc_*)   an FBI stenographer with a conscience and the Leader's reporter
 * 10. Gloria                  (p2_gl_*)   a married singer with plans of her own; affair, pregnancy, the reckoning
 * 11. The Capo's Wife         (p2_cw_*)   the woman who really does her husband's count
 * 12. Madam Council President (p2_mc_*)   a schoolteacher councilwoman who won't be anyone's
 */
export const WOMEN_2: PackEvent[] = [
  /* ================================================================ */
  /* 7. THE WIDOW'S BOOK                                               */
  /* ================================================================ */
  {
    id: 'p2_wbk_1',
    category: 'vice',
    chain: { id: 'p2_widow', part: 1 },
    trigger: { season: 'summer', minWeek: 2, rivalAlive: 'philly', once: true, weight: 13 },
    roles: {
      angie: world('st_angie_marchetti', 'Angie Marchetti, a young South Philly widow who runs her late husband\'s policy bank', { first: 'Angela', last: 'Marchetti', nickname: 'Angie', gender: 'F', ethnicity: 'Italian', age: [26, 32], traits: ['Ambitious', 'Patient'], faction: 'philly' }),
      sal: rivalBoss('philly', 'Sal "the Bag" Moretti, Philadelphia\'s South Jersey capo'),
    },
    title: 'The Shore End',
    body: `She rents a cabana at the beach club on Rio Grande Avenue for the week and invites you to it, which is either very bold or very smart. {angie.name} is twenty-nine, a widow for two years, in a black one-piece and dark glasses, with a luncheonette on Ninth Street and her late husband's policy bank, which she runs better than he ever did.

"Every family on my book comes down the shore in July," she says. "Wildwood, Ocean City, the Crest. They don't stop playing. They just play with your runners instead of mine, and {sal.name} still taxes me fifteen percent on a book that leaves town every summer." She hands you a folded sheet: her July numbers for three years. "I want to bank the shore end through you. Ten percent. Your runners, my bank, my customers."

She takes off the glasses. "And I'd like it if Sal heard about it from neither of us."`,
    options: [
      {
        text: `Take it. Ten percent of her summer book, through your runners.`,
        effects: [money(1500), op('angie', 15), rivOp('philly', -6), flag('p2_wbk_partner'), then('p2_wbk_2', 4, 6, 1)],
        preview: `A summer of South Philly action on your street corners. Philadelphia taxes everything that moves, and this is moving.`,
      },
      {
        text: `"Clear it with Sal first. Then we'll talk."`,
        effects: [op('angie', -5), rivOp('philly', 3), flag('p2_wbk_fair'), then('p2_wbk_2', 4, 6, 1)],
        preview: `The honest answer. Sal will say no, and Angie will remember who made her ask.`,
      },
      {
        text: `Tell Sal yourself. A gift of information.`,
        effects: [rivOp('philly', 10), op('sal', 8), op('angie', -30), flag('p2_wbk_told'), then('p2_wbk_2', 3, 5, 1)],
        preview: `Sal is grateful. A widow on Ninth Street finds her tax raised to twenty percent and your name on the reason.`,
      },
    ],
  },
  {
    id: 'p2_wbk_2',
    category: 'table',
    chain: { id: 'p2_widow', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      angie: carried('Angie Marchetti'),
      sal: carried('Sal Moretti'),
      duchess: world('st_joan_gilmartin', 'Joan Gilmartin, "the Duchess," who runs North Wildwood\'s numbers bank for Kessler', { first: 'Joan', last: 'Gilmartin', nickname: 'Duchess', gender: 'F', ethnicity: 'Irish', age: [35, 45], faction: 'kessler' }),
    },
    title: 'The Duchess Over a Grilled Cheese',
    body: `{duchess.call} Gilmartin runs a luncheonette in North Wildwood and the numbers bank behind it, for Danny Kessler, who she says takes too much. You meet her because she asked; she slides into your booth at the Olympia Diner and orders a grilled cheese.

"Angie Marchetti came to see me too," she says. "Same cabana, same sheet of paper, same ten percent. Smart girl. She's shopping you against Danny to see who blinks." She eats a pickle. "I'm telling you because I like her, and because I'd like to make the same offer myself next year, and I'd like to know what kind of man you are before I do."

Across the river, Sal Moretti's bagman has noticed that the Ninth Street bank came up short in July.`,
    options: [
      {
        text: `Call Angie. Tell her you know, and the deal's still on if she's straight with you.`,
        effects: [op('angie', 12), op('duchess', 10), respect(3), flag('p2_wbk_straight'), then('p2_wbk_3', 3, 5, 1)],
        preview: `She laughs on the phone. "I had to know," she says. Two women in the numbers business have taken your measure.`,
      },
      {
        text: `Make the Duchess an offer now, and freeze Angie out.`,
        effects: [money(800), op('duchess', 15), op('angie', -20), rivOp('kessler', -10), infl('north', 4), then('p2_wbk_3', 3, 5, 1)],
        preview: `North Wildwood's bank leans your way. A widow in South Philly now owes you nothing and knows a great deal.`,
      },
      {
        text: `Tell Sal's bagman the shortfall is Kessler's doing.`,
        gate: { trait: 'Paranoid' },
        effects: [rivOp('philly', 4), rivOp('kessler', -12), op('duchess', -15), heat('family', 3), then('p2_wbk_3', 3, 5, 1)],
        preview: `Sal looks north instead of at you. The Duchess hears what you said about her boss and draws her own conclusions.`,
      },
    ],
  },
  {
    id: 'p2_wbk_3',
    category: 'vice',
    chain: { id: 'p2_widow', part: 3 },
    trigger: { chainOnly: true },
    roles: { angie: carried('Angie Marchetti'), sal: carried('Sal Moretti') },
    title: 'Seven-One-Five',
    body: `The fifteenth of August is the Feast of the Assumption, and half of South Philadelphia plays 7-1-5. Every year. This year the last three digits of the handle at the racetrack, which is how the number is made, come up 7-1-5.

A bank that doesn't pay is a dead bank. {angie.first} needs nine thousand dollars by Monday to pay off the Feast, and Sal Moretti, who has been told about the shore end by someone, has let her know he is not inclined to lay it off for her this year.

She calls you from the phone booth outside her luncheonette at one in the morning. Her voice is perfectly steady. "I can pay the first half. If I don't pay the second half, I'm out of business by Labor Day and somebody else is banking my husband's customers. I'm not begging. I'm asking what it's worth to you."`,
    options: [
      {
        text: `Cover it. Nine thousand, and you're her partner on paper.`,
        gate: { money: 9000 },
        effects: [money(-9000), op('angie', 30), hook('angie', 'You paid off the Feast for her', true), rivOp('philly', -10), flag('p2_wbk_saved'), then('p2_wbk_4', 4, 8, 1)],
        preview: `You own a piece of a South Philly bank. Sal knows exactly whose money paid the Feast.`,
      },
      {
        text: `Lend it at a point a week.`,
        gate: { money: 9000 },
        effects: [money(-9000), op('angie', 5), flag('p2_wbk_loan'), then('p2_wbk_4', 4, 8, 1)],
        preview: `She'll pay it back with interest. She'll also remember that you charged a widow vig on the Assumption.`,
      },
      {
        text: `Let the bank fail. It isn't your book.`,
        effects: [op('angie', -35), rivOp('philly', 5), flag('p2_wbk_failed'), then('p2_wbk_4', 4, 8, 1)],
        preview: `Sal absorbs her customers by Labor Day. She takes a job at a Ninth Street bakery and takes your name with her.`,
      },
    ],
  },
  {
    id: 'p2_wbk_4',
    category: 'table',
    chain: { id: 'p2_widow', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { angie: carried('Angie Marchetti'), sal: carried('Sal Moretti') },
    title: 'A Seat at Sal\'s Table',
    body: `Sal Moretti calls you to Philadelphia, to the back room of a social club on Passyunk with a statue of Saint Anthony in the window. He doesn't offer you coffee. {angie.name} is there, sitting in the corner with her purse on her knees, which you did not expect.

"There's a question of who this lady's book belongs to," Sal says. "She says her husband's. The Table says the Table's. She says you." He spreads his hands. "Explain it to me like I'm a simple man."

{angie.first} looks at you. Whatever happened in August, she has decided what to say in this room, and she hasn't told you what it is.`,
    options: [
      {
        text: `"It's her book. She paid the Feast. I'm her partner, and I'll pay the Table its fifteen."`,
        gate: { flag: 'p2_wbk_saved' },
        effects: [rivOp('philly', -5), money(-500), recruit('angie', 'associate'), op('angie', 25), infl('pacific', 4), respect(6)],
        preview: `Angie banks the shore end for you for a decade, with Sal's blessing and a long memory. She is the best earner you never have to watch.`,
      },
      {
        text: `"The book was always Sal's. I just kept it warm for the summer."`,
        effects: [rivOp('philly', 12), op('angie', -30), money(-1000), respect(-3)],
        preview: `Sal gets his tax back. Angie stands up, buttons her coat, and walks out without a word.`,
      },
      {
        text: `Let her talk first.`,
        effects: [op('angie', 15), stress(5), rivOp('philly', -2), money(600)],
        preview: `She tells Sal precisely what she owes, to the dollar, to the Table and to you. Whatever happens next, it happens on her terms.`,
      },
    ],
  },

  /* ================================================================ */
  /* 8. THE SANDPIPER                                                  */
  /* ================================================================ */
  {
    id: 'p2_sand_1',
    category: 'rivals',
    chain: { id: 'p2_sandpiper', part: 1 },
    trigger: { rivalAlive: 'kessler', minWeek: 5, once: true, weight: 12 },
    roles: {
      bunny: world('st_bunny_kowalski', 'Bunny Kowalski, who owns the Sandpiper bar on Atlantic Avenue', { first: 'Barbara', last: 'Kowalski', nickname: 'Bunny', gender: 'F', age: [28, 36], traits: ['Honest', 'Hot-headed'] }),
      kessler: rivalBoss('kessler', 'Danny Kessler'),
    },
    title: 'Rats at the Sandpiper',
    body: `The county health inspector found rats in the Sandpiper's kitchen on Monday. {bunny.call} Kowalski points out that she doesn't have a kitchen, just a hot plate and a jar of pickled eggs. On Wednesday the beer distributor's truck skipped her. On Friday two of {kessler.name}'s men sat at the end of her bar for six hours and drank one Coke.

Her father left her the Sandpiper and its liquor license, which is the thing Kessler actually wants, because the commission hasn't issued a new license on Atlantic Avenue since 1948.

"I'll give you thirty percent," she tells you, standing behind her own bar with her arms crossed. "For the license being left alone. But I run it. Nobody behind my bar but me and my cousin Stella. No card game in the back. No men drinking on the house. You want a partner, fine. You want a bar, buy somebody else's."`,
    options: [
      {
        text: `Thirty percent, her terms.`,
        effects: [biz('add', 'bar', 'downtown'), op('bunny', 20), rivOp('kessler', -10), flag('p2_sand_terms'), then('p2_sand_2', 4, 8, 1)],
        preview: `A bar you own a third of and don't control. Kessler wanted the license; now he wants you.`,
      },
      {
        text: `Fifty percent and a quiet game upstairs. That's the price of protection.`,
        effects: [biz('add', 'bar', 'downtown'), biz('add', 'cardgame', 'downtown'), op('bunny', -20), rivOp('kessler', -10), then('p2_sand_2', 4, 8, 1)],
        preview: `She signs because she has no choice, which is the kind of partner who eventually finds one.`,
      },
      {
        text: `Stay out of Kessler's business.`,
        effects: [rivOp('kessler', 3), op('bunny', -10)],
        preview: `The Sandpiper becomes a Kessler bar by Labor Day. Bunny takes a job at the five-and-dime.`,
      },
    ],
  },
  {
    id: 'p2_sand_2',
    category: 'crew',
    chain: { id: 'p2_sandpiper', part: 2 },
    trigger: { chainOnly: true },
    roles: { bunny: carried('Bunny Kowalski'), kessler: carried('Danny Kessler'), soldier: crewRole('a soldier who thinks a partner\'s bar is his bar', { rank: ['soldier', 'associate'] }) },
    title: 'She Threw Him Out',
    body: `{soldier.call} has decided that because you own a third of the Sandpiper, he owns the end stool. He's been drinking there on the house since the Fourth, bringing his friends, and on Saturday he told Bunny's cousin Stella to "smile more, sweetheart, it's a family place."

{bunny.first} came over the bar, took his drink out of his hand, poured it into the sink, and told him to get out. In front of twenty customers. He went, because she was holding a sawed-off pool cue, and now he's at the Ivanhoe telling anybody who'll listen that a Polack barmaid disrespected your whole organization.

The whole island is waiting to see whose side you're on.`,
    options: [
      {
        text: `Hers. {soldier.first} pays his tab, all of it, and apologizes to Stella.`,
        gate: { flag: 'p2_sand_terms' },
        effects: [op('bunny', 25), op('soldier', -20), money(180), crewOp(-3), respect(3), flag('p2_sand_backed'), then('p2_sand_3', 6, 10, 1)],
        preview: `Your partner's word holds behind her own bar. Some of the crew think you've gone soft; the women who run things on this island think otherwise.`,
      },
      {
        text: `His. Tell Bunny to remember who keeps Kessler off her doorstep.`,
        effects: [op('bunny', -25), op('soldier', 12), crewOp(3), then('p2_sand_3', 6, 10, 1)],
        preview: `Your crew is satisfied. Bunny pours, says nothing, and starts writing things down.`,
      },
      {
        text: `Ban {soldier.first} from the Sandpiper. Say nothing else to anybody.`,
        effects: [op('bunny', 10), op('soldier', -8), then('p2_sand_3', 6, 10, 1)],
        preview: `The problem goes away without either of them winning. Both of them notice.`,
      },
    ],
  },
  {
    id: 'p2_sand_3',
    category: 'politics',
    chain: { id: 'p2_sandpiper', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { bunny: carried('Bunny Kowalski'), kessler: carried('Danny Kessler') },
    title: 'The Hearing on the Sandpiper License',
    body: `Kessler's lawyer has filed a complaint with the Alcoholic Beverage Control board: the Sandpiper is a "front for organized gambling interests," and the license should be revoked and offered for transfer. To a qualified local buyer. Whose name happens to be on a Kessler lease.

The hearing is in Trenton in a room with green blinds. {bunny.first} wears her mother's navy suit and testifies for forty minutes without notes: who drinks at her bar, who pours, where the money goes, what time she closes. Then the board's counsel asks her, very politely, what her arrangement is with you.

She looks at you in the third row before she answers.`,
    options: [
      {
        text: `She tells the truth: a silent partner who's never set foot behind the bar.`,
        gate: { flag: 'p2_sand_backed' },
        effects: [op('bunny', 15), hook('kessler', 'Bunny\'s little book of Kessler\'s harassment, entered into the record'), rivOp('kessler', -8), infl('downtown', 5), heat('local', 2), respect(4)],
        preview: `The board keeps her license and reads her diary of Kessler's visits into the record. A woman's word just beat Danny Kessler in Trenton.`,
      },
      {
        text: `She lies for you. She says she's never met you.`,
        effects: [op('bunny', -10), hook('bunny', 'She perjured herself for you', true), evidence('bunny', 10)],
        preview: `She keeps the license by lying under oath, and she owes you for it. A perjury charge is a long fuse.`,
      },
      {
        text: `Sell your third to a clean buyer before she answers. Let her stand alone.`,
        effects: [money(1200), biz('close', 'bar'), op('bunny', 5), rivOp('kessler', 4)],
        preview: `Your name comes off. She keeps the Sandpiper, owes you nothing, and invites you to the reopening anyway.`,
      },
    ],
  },

  /* ================================================================ */
  /* 9. CARBON COPIES                                                  */
  /* ================================================================ */
  {
    id: 'p2_cc_1',
    category: 'law',
    chain: { id: 'p2_carbon', part: 1 },
    trigger: { minWeek: 15, heatAbove: { federal: 15 }, once: true, weight: 12 },
    roles: {
      reporter: world('civ_dorothy_kinsella', 'Dorothy Kinsella, the Leader\'s only real reporter', { first: 'Dorothy', last: 'Kinsella', gender: 'F', ethnicity: 'Irish', age: [35, 50], traits: ['Honest', 'Patient'] }),
      herb: world('civ_herb_albrecht', 'Herb Albrecht, who owns two frozen-custard stands', { first: 'Herbert', last: 'Albrecht', nickname: 'Herb', age: [50, 62], traits: ['Honest'] }),
    },
    title: 'The Meeting That Never Happened',
    body: `{reporter.name} covers City Hall and the police blotter for the Leader, and she has never once written a nice word about you. She comes into your restaurant at three on a Wednesday, sits at the counter, orders a coffee, and puts a sheet of onionskin paper on the Formica.

It is a carbon copy of a typed FBI report. It says that on the evening of June 9, at your restaurant, you met with {herb.name}, who sells frozen custard on the Boardwalk, to discuss "the distribution of protection payments among concessionaires." It cites a confidential informant. It was used, she says, to get a wiretap on {herb.first}'s phone.

"On June 9 Herb Albrecht was in Lancaster at his brother's funeral," she says. "I have the Mass card. So my question is simple. Were you here?"`,
    options: [
      {
        text: `"I was here. He wasn't. Ask me anything else you want."`,
        effects: [op('reporter', 12), op('herb', 10), flag('p2_cc_talked'), then('p2_cc_2', 2, 4, 1)],
        preview: `You just helped a reporter who doesn't like you. Somebody in the FBI made up a meeting at your restaurant, and now you know it.`,
      },
      {
        text: `"No comment. Pay for your coffee."`,
        effects: [op('reporter', -8), then('p2_cc_2', 3, 5, 1)],
        preview: `She pays for her coffee. She leaves the onionskin on the counter, by accident, she will say later.`,
      },
      {
        text: `"Where did you get this?"`,
        effects: [op('reporter', -4), flag('p2_cc_source'), then('p2_cc_2', 2, 4, 1)],
        preview: `She doesn't tell you. She does look, briefly, toward Atlantic City.`,
      },
    ],
  },
  {
    id: 'p2_cc_2',
    category: 'law',
    chain: { id: 'p2_carbon', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      reporter: carried('Dorothy Kinsella'),
      dot: townie('Dot Sweeney, a stenographer at the FBI\'s Atlantic City resident agency', { first: 'Dorothea', last: 'Sweeney', nickname: 'Dot', gender: 'F', ethnicity: 'Irish', age: [40, 52], traits: ['Honest', 'Pious'], faction: 'none' }),
      agent: world('cop_harold_burnham', 'Harold Burnham, Senior Resident Agent, FBI Atlantic City', { first: 'Harold', last: 'Burnham', age: [45, 55], traits: ['Ambitious'] }, 'FBI senior resident agent'),
    },
    title: 'A Booth at the Olympia Diner',
    body: `{reporter.first} Kinsella arranges it: a back booth at the Olympia Diner, where Helen Pappas never forgets a face and never repeats one. The woman across from you is about fifty, in a cardigan with a rosary bracelet. {dot.name} has typed reports for the FBI in Atlantic City for sixteen years.

"Mr. {agent.last} dictated that meeting to me himself," she says. "He wanted the wire on Mr. Albrecht so he could hear who Mr. Albrecht calls, because he thinks the custard man is a way to get to you. There was never any informant at your restaurant. I typed a lie with my own hands and I went to confession, and Father said confession wasn't enough."

She has a manila envelope on her lap. "There are fourteen carbons in here. Thirteen are lies about you and other people. One is true." She keeps both hands flat on top of it. "I won't give you that one. I'll give the thirteen to Mrs. Kinsella if you swear nobody gets hurt because of me."`,
    options: [
      {
        text: `"Nobody gets hurt. Give them to her."`,
        effects: [op('dot', 20), op('reporter', 10), flag('p2_cc_sworn'), then('p2_cc_3', 3, 5, 1)],
        preview: `You swore an oath to a church lady in a diner. Keep it and the federal case against you loses its foundation.`,
      },
      {
        text: `"I want the fourteenth carbon. That's my price."`,
        effects: [op('dot', -20), op('reporter', -15), flag('p2_cc_page'), then('p2_cc_3', 3, 5, 1)],
        preview: `She slides the true page across with shaking hands. Now you know there's a real informant, and you know his code name.`,
      },
      {
        text: `"Keep them. Burn them. Get out of that office before it eats you."`,
        effects: [op('dot', 10), stress(-2), then('p2_cc_3', 3, 5, 1)],
        preview: `Kind advice. The lies stay in the FBI's files, and some of them have your name on them.`,
      },
    ],
  },
  {
    id: 'p2_cc_3',
    category: 'law',
    chain: { id: 'p2_carbon', part: 3 },
    trigger: { chainOnly: true },
    roles: { reporter: carried('Dorothy Kinsella'), dot: carried('Dot Sweeney'), agent: carried('Agent Burnham') },
    title: 'Typewriter Ribbons',
    body: `Agent Burnham has noticed that carbons are missing. He's had the steno pool's typewriter ribbons pulled and is reading them under a lamp, letter by letter, like tea leaves. He's interviewing the four women one at a time with the door closed.

{dot.first} Sweeney calls your restaurant from a pay phone in Somers Point and asks for "the manager." "He's going to find out it was me by Friday," she says. "I've got a sister in Scranton. I've got twenty-two dollars. I've never done a wrong thing in my life except type for that man."

{reporter.first} Kinsella's story, "The Phantom Meeting," is set to run on Sunday, if her publisher doesn't lose his nerve.`,
    options: [
      {
        text: `Get her out clean. A job at the phone company in Scranton, through a friend of a friend.`,
        effects: [money(-600), op('dot', 25), favor(-1), flag('p2_cc_safe'), then('p2_cc_4', 2, 3, 1)],
        preview: `She's on the 7:10 bus with a reference letter and a job. Burnham has a missing stenographer and a very bad week coming.`,
      },
      {
        text: `Tell her to go straight to the FBI inspectors in Washington, before he can.`,
        effects: [op('dot', 10), heat('federal', -4), stress(3), then('p2_cc_4', 2, 3, 1)],
        preview: `A complaint from inside is harder to bury. It's also braver than anything you've ever asked of anyone.`,
      },
      {
        text: `Call the Leader's publisher. Make sure the story runs.`,
        gate: { money: 1000 },
        effects: [money(-1000), op('reporter', 5), heat('local', 2), then('p2_cc_4', 2, 3, 1)],
        preview: `Harlan Pyle's paper suddenly gets a full-page ad from three of your businesses. The story runs, front page.`,
      },
    ],
  },
  {
    id: 'p2_cc_4',
    category: 'law',
    chain: { id: 'p2_carbon', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { reporter: carried('Dorothy Kinsella'), dot: carried('Dot Sweeney'), agent: carried('Agent Burnham') },
    title: 'Butte, Montana',
    body: `"The Phantom Meeting" runs on Sunday under {reporter.first} Kinsella's byline, with a photograph of Herb Albrecht's brother's Mass card. By Wednesday the Philadelphia papers have picked it up. By the following Monday, Senior Resident Agent Harold Burnham has been transferred to Butte, Montana, which is where the Bureau sends men it wants to forget.

Two wiretaps come down. A grand jury in Camden postpones a session indefinitely. Your lawyer calls and laughs into the phone for a full minute.

But in Atlantic City a new man takes Burnham's desk: younger, quieter, and in no hurry. And somewhere there's still a real informant with a real code name.`,
    immediate: [heat('federal', -12), evidence('player', -12)],
    options: [
      {
        text: `Let it go. The truth did enough work this month.`,
        gate: { flag: 'p2_cc_sworn' },
        effects: [op('dot', 15), op('reporter', 10), respect(3), stress(-6)],
        preview: `You kept your word to a stenographer. Kinsella still won't write a nice word about you, but she'll never write a false one.`,
      },
      {
        text: `You have the fourteenth page. Freeze out the man it describes and feed him lies.`,
        gate: { flag: 'p2_cc_page' },
        effects: [evidence('player', -6), crewOp(-4), stress(6), op('dot', -15)],
        preview: `The informant spends a year reporting meetings that never happen. It's a quiet kind of revenge.`,
      },
      {
        text: `You have the fourteenth page. Take the man it describes fishing.`,
        gate: { trait: 'Cruel' },
        effects: [crewOp(-10), heat('federal', 20), heat('local', 8), respect(8), op('dot', -40), op('reporter', -30), stress(15)],
        preview: `A boat leaves Otten's Harbor and comes back lighter. Dot Sweeney reads about it in Scranton and knows what her page did.`,
      },
      {
        text: `Send Dot Sweeney a Mass card of your own. No note.`,
        effects: [op('dot', 5), money(-20)],
        preview: `She keeps it in her missal. She never writes back.`,
      },
    ],
  },

  /* ================================================================ */
  /* 10. GLORIA                                                        */
  /* ================================================================ */
  {
    id: 'p2_gl_1',
    category: 'romance-nonexplicit',
    chain: { id: 'p2_gloria', part: 1 },
    trigger: { season: 'summer', months: [7, 8], minWeek: 6, once: true, weight: 12 },
    roles: {
      gloria: lover('[world:ent_gloria_day] Gloria Day, a blonde nightclub singer married to a Philadelphia supper-club owner', { first: 'Gloria', last: 'Day', gender: 'F', age: [30, 38], traits: ['Charming', 'Ambitious'], faction: 'none' }),
      nino: world('ent_nino_castagna', 'Nino Castagna, the Philadelphia supper-club owner who is her husband', { first: 'Nino', last: 'Castagna', age: [48, 58], traits: ['Vengeful', 'Greedy'], faction: 'none' }),
      wife: famRole('your wife', 'spouse'),
    },
    title: 'After the Late Show',
    body: `{gloria.name} has the August booking at the Hurricane Room: two shows a night, torch songs and a little Gershwin, a white dress that makes the band look at their music. After the late show she comes and sits at your table without being asked, orders a brandy Alexander, and lights her own cigarette.

"You're the one they all look at when you walk in," she says. "I'm the one they look at when I'm on. Nino owns the club in Philadelphia, the band, the Lincoln, the house in Merion, and he thinks he owns the singer." She studies the end of her cigarette. "He's in Philadelphia tonight. He's in Philadelphia most nights. I've got my own plans, and I'm tired of doing everything by myself."

She doesn't look away. She's not asking for anything you can see.`,
    options: [
      {
        text: `Walk her back to the Admiral the long way, along the beach.`,
        effects: [op('gloria', 20), flag('p2_gl_lovers'), secret('player', 'affair'), stress(-4), then('p2_gl_2', 2, 4, 1)],
        preview: `Both of you know exactly what this is. Two in the morning on the wet sand. Fade to black.`,
      },
      {
        text: `"Tell me about your plans." Order her another brandy and keep it business.`,
        effects: [op('gloria', 12), flag('p2_gl_friends'), then('p2_gl_2b', 3, 5, 1)],
        preview: `She's a little surprised. Then she tells you, and her plans turn out to be very interesting.`,
      },
      {
        text: `Pay for the brandy and go home to {wife.first}.`,
        effects: [op('gloria', -5), op('wife', 3)],
        preview: `She lifts her glass to you as you leave. In September she goes back to Philadelphia and Nino.`,
      },
    ],
  },
  {
    id: 'p2_gl_2',
    category: 'romance-nonexplicit',
    chain: { id: 'p2_gloria', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      gloria: carried('Gloria Day'),
      nino: carried('Nino Castagna'),
      photo: world('ent_stan_kopec', 'Stan Kopec, the nightclub photographer with the negative files', { first: 'Stanley', last: 'Kopec', nickname: 'Stan', age: [40, 55], traits: ['Greedy'] }),
    },
    title: 'Tuesdays in Cape May',
    body: `Tuesdays, when the Hurricane Room is dark: a guest house in Cape May with a porch swing and a landlady who's deaf in one ear. You both like it that way.

{gloria.first} talks about the future the way other people talk about the weather. She wants a club of her own, in Wildwood, with her name over the door, where she books the acts and keeps the books. She's seen a lawyer in Atlantic City about a divorce. She's been putting twenty dollars a week in a passbook account Nino doesn't know about since 1957.

On Thursday {photo.name}, who takes the dollar souvenir photos at the Hurricane Room tables, stops you on Pacific Avenue. He has a negative in a glassine sleeve: the two of you at your table, her hand on your arm. "It's a nice picture," he says. "Mr. Castagna in Philadelphia buys pictures sometimes."`,
    options: [
      {
        text: `Buy the negative. Buy all his negatives from August.`,
        gate: { money: 1500 },
        effects: [money(-1500), hook('photo', 'He sold you a negative and admitted he sells to husbands'), op('gloria', 5), then('p2_gl_3', 4, 8, 1)],
        preview: `Stan gets rich this week. Whether he kept a print is something you'll find out later.`,
      },
      {
        text: `Have someone explain photography ethics to Stan.`,
        effects: [heat('local', 3), op('photo', -30), respect(2), then('p2_gl_3', 4, 8, 1)],
        preview: `Stan's camera has an accident. Stan has a long memory and a brother-in-law at the Inquirer.`,
      },
      {
        text: `Tell {gloria.first}. It's her marriage, and her picture.`,
        effects: [op('gloria', 15), stress(3), then('p2_gl_3', 4, 8, 1)],
        preview: `She buys the negative herself with her passbook money and burns it in the guest house sink. "Now I'm in it too," she says.`,
      },
    ],
  },
  {
    id: 'p2_gl_2b',
    category: 'boardwalk',
    chain: { id: 'p2_gloria', part: 2 },
    trigger: { chainOnly: true },
    roles: { gloria: carried('Gloria Day'), nino: carried('Nino Castagna') },
    title: 'Gloria\'s, on Pacific',
    body: `Her plan, on a cocktail napkin from the Hurricane Room: a club of her own on Pacific Avenue. Small. A hundred and twenty seats, a piano, a five-piece band, two shows a night, her name in pink neon. She books the acts, she picks the band, she keeps the books, and she sings when she feels like it.

She has nine thousand dollars in a passbook Nino doesn't know about. She needs twenty. "I want a silent partner," she says. "Silent. You put in the rest, you take thirty percent, and you keep your men off my floor." She taps the napkin. "Nino will say I stole his act. He'll say it to people in Philadelphia who listen to him. I'm not afraid of Nino. I'd like to know if you are."`,
    options: [
      {
        text: `Put in the eleven thousand. Silent partner.`,
        gate: { money: 11000 },
        effects: [money(-11000), biz('add', 'club', 'pacific'), op('gloria', 25), flag('p2_gl_club'), then('p2_gl_4', 6, 10, 1)],
        preview: `Gloria's opens next Memorial Day. Nino Castagna loses a wife's paycheck and a Philadelphia story to tell.`,
      },
      {
        text: `Put it in, and put your own manager on her floor.`,
        gate: { money: 11000 },
        effects: [money(-11000), biz('add', 'club', 'pacific'), op('gloria', -10), flag('p2_gl_club'), then('p2_gl_4', 6, 10, 1)],
        preview: `It's your club with her name on it. She notices before the paint dries.`,
      },
      {
        text: `"A man's wife is a man's business." Pass.`,
        effects: [op('gloria', -15), rivOp('philly', 2)],
        preview: `She finds money in New York instead. You hear her club does very well.`,
      },
    ],
  },
  {
    id: 'p2_gl_3',
    category: 'romance-nonexplicit',
    chain: { id: 'p2_gloria', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { gloria: carried('Gloria Day'), nino: carried('Nino Castagna'), wife: carried('your wife') },
    title: 'What She Came to Tell You',
    body: `She asks you to meet her on the Crest, at the end of the beach where the jetty is, in October when nobody's there. She's wearing a camel coat and no makeup and she looks younger than you've ever seen her.

"I'm going to have a baby," she says. "It's yours. Nino and I haven't been husband and wife since Easter, and he knows it, and he can count." She pulls the coat around herself. "I'm not asking you for anything. I'm telling you because you'd find out, and because I'd rather you heard it from me on a beach than from Nino in a back room.

"I've thought about it. I'm keeping it. I'm leaving him. What I need to know is what you're going to be: the father, the friend who sends money, or a man I met one summer."`,
    options: [
      {
        text: `"The father. Quietly, for now. But the father."`,
        effects: [op('gloria', 30), secret('player', 'bastard'), flag('p2_gl_acknowledged'), money(-1000), stress(8), then('p2_gl_4', 3, 6, 1), then('p2_gl_5', 10, 16, 1), then('p2_gl_6', 900, 960, 1)],
        preview: `A child with your blood and her name. You'll pay for the doctor and the apartment. You'll pay for the rest later, in ways you can't count yet.`,
      },
      {
        text: `"The friend who sends money. Every month, through a lawyer."`,
        effects: [op('gloria', -5), secret('player', 'bastard'), flag('p2_gl_support'), money(-600), then('p2_gl_4', 3, 6, 1), then('p2_gl_5', 10, 16, 0.8), then('p2_gl_6', 900, 960, 1)],
        preview: `A check on the first of every month from an Atlantic City divorce lawyer. The child grows up knowing there's a man somewhere who paid.`,
      },
      {
        text: `"Tell Nino it's his. It's safer for everyone."`,
        effects: [op('gloria', -30), secret('player', 'bastard'), flag('p2_gl_denied'), then('p2_gl_4', 3, 6, 1), then('p2_gl_5', 10, 16, 0.6), then('p2_gl_6', 900, 960, 0.8)],
        preview: `"Safer for you," she says. She walks back up the beach alone. She does not tell Nino it's his.`,
      },
    ],
  },
  {
    id: 'p2_gl_4',
    category: 'table',
    chain: { id: 'p2_gloria', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { gloria: carried('Gloria Day'), nino: carried('Nino Castagna'), sal: rivalBoss('philly', 'Sal Moretti') },
    title: 'Nino Castagna Goes to Sal',
    body: `Nino Castagna has been to see Sal Moretti. Every politician in Philadelphia eats at Nino's Supper Club, and half the Table keeps a tab there. Nino says a Wildwood man took something that was his. Whether he means his wife's voice, his wife's money or his wife, he says it the same way: as a theft.

Sal calls a sit-down at Nino's own club on a Monday, when it's closed: chairs on the tables, a single lamp, Nino in a camel-hair coat with his hands in his pockets. {sal.first} looks tired. "Nino's an old friend of ours," he says. "You understand. Tell me what I'm supposed to do here."

And then the side door opens and {gloria.first} walks in, uninvited, in her navy suit, with a divorce lawyer from Atlantic City on her arm.`,
    options: [
      {
        text: `Let {gloria.first} speak for herself.`,
        effects: [op('gloria', 20), op('nino', -20), rivOp('philly', -4), respect(3), feud('philly')],
        preview: `"I was never anybody's," she tells the Table. Sal almost smiles. Nino will never forgive any of you.`,
      },
      {
        text: `Pay Nino. A settlement, as for a broken contract.`,
        gate: { money: 4000 },
        effects: [money(-4000), op('nino', 10), rivOp('philly', 5), op('gloria', -15)],
        preview: `Nino gets money and his pride gets nothing. {gloria.first} hears herself priced like a booking.`,
      },
      {
        text: `Deny everything. It's a nightclub, people sit at tables.`,
        effects: [op('gloria', -20), op('nino', -5), rivOp('philly', -2), stress(5)],
        preview: `Sal doesn't believe you and doesn't need to. The sit-down ends with nothing decided, which means it isn't over.`,
      },
    ],
  },
  {
    id: 'p2_gl_5',
    category: 'family',
    chain: { id: 'p2_gloria', part: 5 },
    trigger: { chainOnly: true, mandatory: true },
    roles: {
      gloria: carried('Gloria Day'),
      wife: carried('your wife'),
      tina: world('civ_tina_palmieri', 'Tina Palmieri, whose beauty-parlor chairs start and stop every rumor', { first: 'Concetta', last: 'Palmieri', nickname: 'Tina', gender: 'F', ethnicity: 'Italian', age: [35, 50] }),
    },
    title: 'Under the Dryers',
    body: `It started under {tina.call} Palmieri's dryers on Tuesday morning, the way everything on this island starts. A singer from Philadelphia, a baby due in the spring, a Wildwood man who pays the doctor.

{wife.first} doesn't throw anything. She sets the table for dinner, serves the children, clears, washes, dries, puts the dishes away. Then she sits down across from you at the kitchen table, folds her dish towel into a perfect square, and says, "I'm going to ask you once. After that I'm never going to ask you anything again."`,
    options: [
      {
        text: `Tell her the truth.`,
        effects: [op('wife', -25), famOp(-8), stress(10), flag('p2_gl_confessed')],
        preview: `She hears all of it. She doesn't leave; women in her family don't. She moves into the sewing room.`,
      },
      {
        text: `Lie to her.`,
        effects: [op('wife', -10), stress(12), flag('p2_gl_lied')],
        preview: `She nods and goes upstairs. She knew before she asked. Now she knows you'd lie to her face.`,
      },
      {
        text: `She found the money in the cellar and never left. She's earned the truth, and a say in what happens next.`,
        gate: { flag: 'p2_wm_truth' },
        effects: [op('wife', -10), famOp(-2), stress(4), op('gloria', 5)],
        preview: `"The child doesn't pay for what you did," {wife.first} says at last. "Neither do mine." She sets the terms. You live by them.`,
      },
    ],
  },
  {
    id: 'p2_gl_6',
    category: 'family',
    chain: { id: 'p2_gloria', part: 6 },
    trigger: { chainOnly: true, mandatory: true },
    roles: {
      gloria: carried('Gloria Day'),
      child: townie('Gloria\'s child, eighteen, with your father\'s ears', { last: 'Day', age: [17, 19], traits: ['Ambitious'], faction: 'none' }),
    },
    title: 'Your Father\'s Ears',
    body: `There's someone at the door of the restaurant at closing time: eighteen, in a borrowed sport coat, holding an envelope. The face is {gloria.first}'s. The ears are your father's, exactly, the ones in the wedding photograph on your mother's dresser that everybody in the family jokes about.

"My name is {child.name}," the young person says. "My mother told me last week. She says I can decide what to do about it. I'm not here for money." The envelope holds a birth certificate, a Rutgers acceptance letter, and a photograph of you on a beach in Cape May, taken by someone who was standing very close.

"I just wanted to know whether you'd open the door."`,
    options: [
      {
        text: `Open the door. Acknowledge the child before the family.`,
        effects: [flag('p2_gl_claimant'), famOp(-10), op('child', 30), stress(6), respect(-2)],
        preview: `A child of your blood with a claim the dynasty will have to reckon with. Your other children will have opinions.`,
      },
      {
        text: `Pay for Rutgers. A job in the summers. Not the name.`,
        effects: [money(-2500), op('child', 10), flag('p2_gl_quiet_heir')],
        preview: `An ambitious young person with your ears, your money and none of your name. Watch what they build with it.`,
      },
      {
        text: `Close the door.`,
        effects: [op('child', -40), flag('p2_gl_spurned'), stress(4)],
        preview: `They walk down Pacific Avenue in the borrowed coat. Spurned blood remembers.`,
      },
    ],
  },

  /* ================================================================ */
  /* 11. THE CAPO'S WIFE                                               */
  /* ================================================================ */
  {
    id: 'p2_cw_1',
    category: 'crew',
    chain: { id: 'p2_capowife', part: 1 },
    trigger: { rank: 'capo', trait: 'Gambler', minWeek: 8, once: true, weight: 12 },
    roles: {
      mrs: townie('[spouseOf:actor] the capo\'s wife', { first: 'Carmela', gender: 'F', ethnicity: 'Italian', age: [38, 52], traits: ['Patient', 'Ambitious'], faction: 'none' }),
      actor: crewRole('a capo with trait Gambler', { rank: 'capo' }),
    },
    title: 'Mrs. {actor.last} at Three O\'Clock',
    body: `Three o'clock is the dead hour at the restaurant, after lunch and before the early birds. {mrs.first} {actor.last} comes in through the kitchen, which nobody does, and sits at the table by the coat rack with her purse in her lap.

"My husband is going to lose our house," she says. "He's been to the trotters every night since June. He's into a Philadelphia card game for eleven thousand dollars and he took a second mortgage on Hand Avenue without telling me, except that he forgot I'm the one who reads the mail."

She folds her hands. "And I'll tell you something else, since I'm here. Who do you think does his count every Sunday night? Twelve years at my kitchen table, every envelope his regime sends up to you. He can't add a dinner check. I'd like you to stop him. And I'd like it to look like it came from you."`,
    options: [
      {
        text: `Cut his credit all over the shore. Quietly, with a few phone calls.`,
        effects: [money(-300), op('mrs', 20), op('actor', -6), hook('actor', 'His credit is cut and he doesn\'t know who did it'), then('p2_cw_2', 3, 5, 1)],
        preview: `Every bookmaker from Cape May to Camden stops taking {actor.first}'s action. He's going to want to know why.`,
      },
      {
        text: `Call him in and tell him to stop. Leave her out of it.`,
        effects: [op('actor', -10), op('mrs', 8), then('p2_cw_2', 3, 5, 1)],
        preview: `A boss's warning. Gamblers hear warnings the way drunks hear last call.`,
      },
      {
        text: `"You do his count? Then from now on, you bring it to me yourself."`,
        effects: [op('mrs', 25), op('actor', -15), flag('p2_cw_direct'), then('p2_cw_2', 3, 5, 1)],
        preview: `The regime's money comes to you through her hands now. Her husband is a capo in name and a passenger in fact.`,
      },
    ],
  },
  {
    id: 'p2_cw_2',
    category: 'crew',
    chain: { id: 'p2_capowife', part: 2 },
    trigger: { chainOnly: true },
    roles: { mrs: carried('the capo\'s wife'), actor: carried('the capo'), soldier: crewRole('a soldier in the capo\'s regime', { rank: 'soldier', sameRegimeAs: 'actor' }) },
    title: 'He Thinks It Was {soldier.first}',
    body: `{actor.call} has figured out that someone went to you. He's decided it was {soldier.call}, the soldier who drives him to the track and who once, in 1958, said something about Hand Avenue in front of the wrong people.

{actor.first} has stopped talking to {soldier.first}. He has started talking about him, to two other soldiers, in a tone you have heard before. {soldier.first} has no idea why. He's asked to see you, twice.

At Mass on Sunday {mrs.first} {actor.last} sits three pews ahead of you and doesn't turn around.`,
    options: [
      {
        text: `Tell {actor.first} the truth: it was his wife, and she did it to save his house. And that she's under your protection.`,
        effects: [op('actor', -15), op('mrs', 10), op('soldier', 10), stress(3), then('p2_cw_3', 4, 8, 1)],
        preview: `A capo learns his wife went over his head, and that the boss is standing behind her. He's humiliated, and he's careful.`,
      },
      {
        text: `Move {soldier.first} to another regime. Say nothing.`,
        effects: [op('soldier', 5), op('actor', 3), then('p2_cw_3', 4, 8, 1)],
        preview: `The wrong man is out of danger. The right woman is still in the same house with the same husband.`,
      },
      {
        text: `Say you heard it from a bookmaker in Margate. Make it nobody.`,
        gate: { trait: 'Charming' },
        effects: [op('actor', 5), op('mrs', 5), stress(-2), then('p2_cw_3', 4, 8, 1)],
        preview: `A good lie, well told. {actor.first} goes looking in Margate and finds nothing to find.`,
      },
    ],
  },
  {
    id: 'p2_cw_3',
    category: 'crew',
    chain: { id: 'p2_capowife', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { mrs: carried('the capo\'s wife'), actor: carried('the capo') },
    title: 'The Real Capo',
    body: `Six months on, {actor.call}'s regime has had the best winter it has had in years: every envelope full, every count to the penny, two new vending routes in the Crest that he says were his idea. He's off the trotters. He's put on twelve pounds. He's happy.

{mrs.first} {actor.last} comes to the restaurant at three o'clock again. "His knees are going," she says. "His heart isn't great. Dr. Pugliese says Florida. If he goes, his men will want one of their own to take over, and you'll get a regime that's never been run by anybody who can add."

She doesn't say what she wants. She doesn't have to.`,
    options: [
      {
        text: `Keep {actor.first} as capo in name. She runs the regime's money, and everyone who matters knows it.`,
        effects: [op('mrs', 25), op('actor', 5), money(1200), crewOp(-3), flag('p2_cw_shadow')],
        preview: `A capo in front, his wife behind him. The regime earns like never before; some of your men will never accept it.`,
      },
      {
        text: `Send {actor.first} to Florida with honor. Promote one of his soldiers and let her keep the books for him.`,
        effects: [rank('actor', 'soldier'), op('actor', -10), op('mrs', 10), crewOp(4)],
        preview: `A man runs the regime. A woman runs the arithmetic. It's how it's done, and it works about as well as it always has.`,
      },
      {
        text: `Thank her and change nothing.`,
        effects: [op('mrs', -20), op('actor', 5)],
        preview: `She goes home to Hand Avenue and keeps doing the count, for him, the way she's done it for twelve years.`,
      },
    ],
  },

  /* ================================================================ */
  /* 12. MADAM COUNCIL PRESIDENT                                       */
  /* ================================================================ */
  {
    id: 'p2_mc_1',
    category: 'politics',
    chain: { id: 'p2_hanlon', part: 1 },
    trigger: { rivalAlive: 'kessler', minWeek: 20, months: [2, 3, 4], once: true, weight: 12 },
    roles: {
      rita: world('pol_rita_hanlon', 'Rita Hanlon, North Wildwood council president and a schoolteacher', { first: 'Rita', last: 'Hanlon', gender: 'F', ethnicity: 'Irish', age: [40, 52], traits: ['Honest', 'Patient'] }, 'North Wildwood Council President'),
      sister: townie('Peg Hanlon Dwyer, Rita\'s sister and campaign manager', { first: 'Margaret', last: 'Dwyer', nickname: 'Peg', gender: 'F', ethnicity: 'Irish', age: [38, 48], traits: ['Ambitious'], faction: 'none' }),
      kessler: rivalBoss('kessler', 'Danny Kessler'),
    },
    title: 'Against All of Them',
    body: `{rita.name} teaches seventh-grade civics at the Margaret Mace School and runs North Wildwood's council like a classroom: no talking out of turn, hands raised, minutes read aloud. She has announced for mayor against Bill Garrity on a single plank: "the gangsters, all of them, Mr. Kessler's and everyone else's."

Her sister and campaign manager, {sister.name}, wants a word, and she wants it at a gas station on Route 147 where nobody from the island will see. "Rita can't win without a raid on one of Kessler's places the week before the election," she says. "Chief Boyle won't do it. The State Police will, if someone hands them an address and a night. Rita doesn't know I'm here. She'd skin me."`,
    options: [
      {
        text: `Give her the address and the night: Kessler's back room at the Shamrock.`,
        effects: [op('sister', 20), hook('sister', 'She took a mobster\'s tip to win her sister\'s election', true), rivOp('kessler', -8), flag('p2_mc_tip'), then('p2_mc_2', 4, 8, 1)],
        preview: `A raid in the right week. You'll own a piece of a reform campaign, and the reformer will have no idea.`,
      },
      {
        text: `Offer money for the campaign instead.`,
        effects: [op('sister', -10), then('p2_mc_2', 4, 8, 1)],
        preview: `"Rita would give it back with a lecture," {sister.first} says. "And then she'd give your name to the paper."`,
      },
      {
        text: `"Go home. If your sister's honest, let her win honest."`,
        effects: [op('sister', -5), respect(1), flag('p2_mc_clean'), then('p2_mc_2', 4, 8, 1)],
        preview: `You keep your hands off it. Kessler doesn't.`,
      },
    ],
  },
  {
    id: 'p2_mc_2',
    category: 'politics',
    chain: { id: 'p2_hanlon', part: 2 },
    trigger: { chainOnly: true },
    roles: { rita: carried('Rita Hanlon'), sister: carried('Peg Dwyer'), kessler: carried('Danny Kessler') },
    title: 'The Week Before',
    body: `The week before the North Wildwood election, the State Police hit the back room of the Shamrock at eleven on a Friday: nine men, a roulette wheel, a photographer from the Atlantic City paper who just happened to be passing. Or they don't, and instead Bill Garrity's people put out a flyer saying Rita Hanlon is soft on juvenile delinquents.

Either way, Danny Kessler is looking for someone to blame, and he's looking south. And {rita.first} Hanlon, who reads every newspaper on the island, has started to wonder why her campaign has been so lucky.

Her sister has stopped returning her calls.`,
    options: [
      {
        text: `Put out word that the tip came from inside Kessler's own crew.`,
        gate: { flag: 'p2_mc_tip' },
        effects: [rivOp('kessler', 4), rivRes('kessler', { muscle: -1 }), stress(3), then('p2_mc_3', 2, 3, 1)],
        preview: `Kessler spends a month suspecting his own men. That's worth more than the raid.`,
      },
      {
        text: `Let Kessler think whatever he wants.`,
        effects: [rivOp('kessler', -6), then('p2_mc_3', 2, 3, 1)],
        preview: `He'll think it was you, because that's what he'd do.`,
      },
      {
        text: `Fund Rita's get-out-the-vote drive through a teachers' committee she'll never trace.`,
        gate: { money: 1200 },
        effects: [money(-1200), favor(1), flag('p2_mc_money'), then('p2_mc_3', 2, 3, 1)],
        preview: `Station wagons to drive old ladies to the polls. Rita thinks the teachers' union is very generous this year.`,
      },
    ],
  },
  {
    id: 'p2_mc_3',
    category: 'politics',
    chain: { id: 'p2_hanlon', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { rita: carried('Rita Hanlon'), sister: carried('Peg Dwyer') },
    title: 'After School',
    body: `Mayor-elect {rita.name} asks you to see her at the Margaret Mace School at four o'clock, after the buses. You sit in a seventh-grader's desk, which doesn't fit you, while she stands at the blackboard. The Preamble to the Constitution is written on it in her neat cursive.

"I know what my sister did," she says. "She told me the night I won, crying, at my mother's kitchen table. I'm not resigning. Two thousand people voted for me and they didn't vote for her." She puts down the chalk. "I'm not your mayor. I'm going to say so in public at every opportunity. But here's what I'll do. The after-hours place on Surf Avenue, two blocks from this school. Close it. Then stay out of North Wildwood except for your mother's church, and I'll spend the next four years on Mr. Kessler."`,
    options: [
      {
        text: `Close the Surf Avenue place. Her terms.`,
        effects: [money(-800), op('rita', 15), rivOp('kessler', -6), rivRes('kessler', { exposure: 15 }), infl('north', -8, 'kessler'), flag('p2_mc_deal'), then('p2_mc_4', 50, 80, 1)],
        preview: `A clean mayor spends four years at war with Kessler. You don't own her, but you've aimed her.`,
      },
      {
        text: `"I don't take orders from a schoolteacher."`,
        effects: [op('rita', -25), heat('local', 6), then('p2_mc_4', 50, 80, 1)],
        preview: `She spends her four years on everybody, starting with you.`,
      },
      {
        text: `Remind her, gently, that her sister's tip is a story too.`,
        effects: [op('rita', -35), hook('rita', 'Her sister\'s deal with you', false), favor(1), then('p2_mc_4', 50, 80, 1)],
        preview: `She goes white, then red. She'll do what you want this year. She'll spend the rest of her career making sure it never happens again.`,
      },
    ],
  },
  {
    id: 'p2_mc_4',
    category: 'politics',
    chain: { id: 'p2_hanlon', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { rita: carried('Rita Hanlon'), sister: carried('Peg Dwyer'), kessler: carried('Danny Kessler') },
    title: 'The Hanlon Sisters',
    body: `It's in the Atlantic City paper on a Sunday: MAYOR'S SISTER MET WITH WILDWOOD RACKETS FIGURE. Somebody had a photograph of a gas station on Route 147. Somebody, everybody assumes, is Danny Kessler, who has lost three liquor licenses and a numbers bank to Mayor Hanlon's police in two years.

{rita.first} doesn't call you. She calls a press conference on the steps of North Wildwood City Hall and says her sister made a terrible mistake out of love, that she herself knew nothing, and that she is asking the county prosecutor to investigate everyone in the story, starting with herself.

Now everyone is waiting to hear what you say.`,
    options: [
      {
        text: `Say nothing to anyone, ever.`,
        effects: [op('rita', 10), op('sister', 10), heat('local', 4), respect(2)],
        preview: `The story dies for lack of a second source. Rita Hanlon finishes her term and wins another.`,
      },
      {
        text: `Give the prosecutor Kessler's photographer, and the photographer's other negatives.`,
        gate: { flag: 'p2_mc_deal' },
        effects: [rivOp('kessler', -10), rivRes('kessler', { exposure: 20 }), op('rita', 15), heat('local', -3), infl('north', 4)],
        preview: `The story becomes a story about how Kessler blackmails public officials. Rita Hanlon's war with him gets a second front.`,
      },
      {
        text: `Tell a reporter the sister came to you begging, and you sent her away.`,
        effects: [op('sister', -30), op('rita', -10), respect(3), heat('local', -2)],
        preview: `You come off like a gentleman. Peg Dwyer comes off like a fool. Rita never forgives you for that.`,
      },
    ],
  },
];

