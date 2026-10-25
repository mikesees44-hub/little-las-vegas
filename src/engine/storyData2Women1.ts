import type { PackEvent } from './storyDataSchema';
import {
  biz, carried, crewOp, crewRole, evidence, famOp, famRole, favor, flag, health, heat, hook, infl, money, official,
  op, recruit, respect, rivOp, stress, thenFx as then, townie, unwashed,
} from './storyDataSchema';
import { world } from './storyData2Cast';

/**
 * Women I
 *  1. The Wall Behind the Furnace (p2_wm_*)   the boss's wife finds the money, then runs it
 *  2. The Altar Society          (p2_alt_*)  the wife runs for parish office against the mayor's wife
 *  3. The Captain's Boy          (p2_wb_*)   a daughter in love with a police captain's son
 *  4. The Marlin                 (p2_hd_*)   a daughter who wants to run the family hotel
 *  5. Counselor                  (p2_cn_*)   a daughter who becomes a lawyer
 *  6. Nonna's Table              (p2_nn_*)   the matriarch who still gives orders
 */
export const WOMEN_1: PackEvent[] = [
  /* ================================================================ */
  /* 1. THE WALL BEHIND THE FURNACE                                    */
  /* ================================================================ */
  {
    id: 'p2_wm_1',
    category: 'family',
    chain: { id: 'p2_wall', part: 1 },
    trigger: { months: [11, 12], minWeek: 20, moneyAbove: 8000, once: true, weight: 14 },
    roles: { wife: famRole('your wife', 'spouse') },
    title: 'The Christmas Boxes',
    body: `{wife.first} went down to the cellar for the Christmas boxes: the crèche, the bubble lights, the ceramic Santa her mother left her. The boxes are behind the furnace. So is the panel your cousin built in 1957, and the panel came loose.

When you get home she is sitting on an upturned crate under the bare bulb with the money in stacks on the washing machine, sorted by denomination, a pencil behind her ear. She didn't scream. She counted.

"Thirty-eight thousand four hundred," she says. "I want to know how much of it is ours, and how much of it is somebody's."`,
    options: [
      {
        text: `Tell her the truth. All of it. Sit down on the other crate.`,
        effects: [op('wife', 10), stress(-4), flag('p2_wm_truth'), then('p2_wm_2', 3, 5, 1)],
        preview: `Twenty years of not saying it, said. She will never again be able to tell a grand jury she didn't know.`,
      },
      {
        text: `"It's the restaurant's. For the bank. Don't worry about it."`,
        effects: [op('wife', -12), flag('p2_wm_lie'), then('p2_wm_2', 3, 5, 1)],
        preview: `She nods. She married a liar on purpose, she will say later; she did not marry a bad one.`,
      },
      {
        text: `"Count it again. Then you tell me where it should go."`,
        gate: { trait: 'Patient' },
        effects: [op('wife', 18), flag('p2_wm_truth'), flag('p2_wm_partner'), then('p2_wm_2', 2, 4, 1)],
        preview: `You hand her the problem instead of the story. She has been waiting fifteen years to be asked.`,
      },
    ],
  },
  {
    id: 'p2_wm_2',
    category: 'family',
    chain: { id: 'p2_wall', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      wife: carried('your wife'),
      books: world('st_tessie_abbate', 'Tessie Abbate, the twenty-year-old math whiz from Weiss\'s credit office', { first: 'Theresa', last: 'Abbate', nickname: 'Tessie', gender: 'F', ethnicity: 'Italian', age: [20, 21], traits: ['Honest'] }),
    },
    title: 'Your Accountant Drinks at the Anchor',
    body: `{wife.first} has been reading. Not the Bible; the restaurant's ledgers, which she took out of the office in a shopping bag from Weiss's and brought back before anyone noticed.

"Your Mr. Pellegrino drinks at the Anchor four nights a week," she says, "and the linen bill for the restaurant went up thirty percent in a year we did less tables. Either the napkins got very expensive or he's got a girlfriend in the laundry business." She has circled things in red. She has also, God help you, written totals in the margin, and they're right.

"I want the books for the restaurant and the laundromat. The clean ones. I don't want to know about the other ones." A pause. "Yet."`,
    options: [
      {
        text: `Give her the books. Pellegrino can retire to Florida.`,
        effects: [op('wife', 15), money(600), flag('p2_wm_books'), famOp(4), then('p2_wm_3', 4, 8, 1)],
        preview: `Your wife runs the legitimate side. The next man who comes to look at those books will meet her first.`,
      },
      {
        text: `Bring in {books.name} to audit. A stranger, so nobody's feelings get hurt.`,
        effects: [money(-300), op('wife', -6), op('books', 10), hook('books', 'She found the skim and you kept her name out of it'), then('p2_wm_3', 4, 8, 1)],
        preview: `{books.first} finds the leak in a weekend. {wife.first} finds out who you trusted instead of her.`,
      },
      {
        text: `"This isn't for you. Go back to the Christmas lights."`,
        effects: [op('wife', -22), famOp(-4), flag('p2_wm_shut'), then('p2_wm_3b', 4, 8, 1)],
        preview: `She goes back upstairs. She does not go back to the Christmas lights.`,
      },
    ],
  },
  {
    id: 'p2_wm_3',
    category: 'law',
    chain: { id: 'p2_wall', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      wife: carried('your wife'),
      irs: official('the IRS revenue agent', 'IRS agent', { first: 'Walter', last: 'Kerns', ethnicity: 'Irish', age: [40, 52], traits: ['Honest', 'Patient'] }),
    },
    title: 'Coffee With the Revenue Man',
    body: `{irs.name} of the Internal Revenue Service sits at your kitchen table on a Tuesday morning because that is where {wife.first} told him to sit. She has made a pot of coffee and put out a plate of pizzelles, and she has put the restaurant's books in front of him in date order with a paper clip on every month.

"Mr. {irs.last} wants to know why a restaurant with forty-two seats deposits like a restaurant with sixty," she says to you pleasantly, as if he is asking about the weather. "I told him about the catering. The christenings, the Knights of Columbus, the funeral lunches. I have the receipts." She has the receipts. You did not know there were receipts.

{irs.first} turns a page. He is a careful man. He eats a pizzelle anyway.`,
    options: [
      {
        text: `Let her do the talking. Go read the paper on the porch.`,
        effects: [evidence('player', -8), op('wife', 15), op('irs', -4), respect(2), then('p2_wm_4', 4, 8, 1)],
        preview: `If her catering story holds, the Revenue man goes back to Camden with nothing. If it doesn't, it's her name on the receipts.`,
      },
      {
        text: `Take over. "Honey, let the men talk."`,
        effects: [op('wife', -18), evidence('player', 3), stress(4), then('p2_wm_4', 4, 8, 1)],
        preview: `You know the business. She knew the books. Mr. {irs.last} notices the difference.`,
      },
      {
        text: `She told the truth in the cellar; tell her to tell it here, minus a few chapters.`,
        gate: { flag: 'p2_wm_truth' },
        effects: [evidence('player', -12), op('wife', 20), hook('irs', 'He accepted a catering story he knows is thin'), then('p2_wm_4', 4, 8, 1)],
        preview: `Because she knows where the edges are, she can walk right up to them. The agent leaves with a story and a plate of pizzelles.`,
      },
    ],
  },
  {
    id: 'p2_wm_3b',
    category: 'family',
    chain: { id: 'p2_wall', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      wife: carried('your wife'),
      collector: { desc: 'a Kessler collector who does not know whose wife she is', pool: 'rival', faction: 'kessler', spawn: { first: 'Artie', last: 'Brogan', ethnicity: 'Irish', age: [30, 45] } },
    },
    title: `{wife.first}'s on Pacific`,
    body: `You find out the way the rest of the island does: a hand-painted sign over a narrow storefront on Pacific Avenue, two doors from the shoe repair. Gloves, hats, communion dresses, a rack of Capri pants for the summer girls. {wife.first} signed a lease with her own egg money and her sister's name.

On the second Saturday, {collector.name}, who collects for Danny Kessler on blocks Kessler has no business collecting on, comes in and explains about insurance. {wife.first} gives him a cup of coffee, pays him twenty dollars, and writes down his name, the date, and the license plate of his Oldsmobile in a little book she keeps under the register.

She tells you about it at dinner. Not asking. Telling.`,
    options: [
      {
        text: `Let her run it. Her shop, her book, her twenty dollars.`,
        effects: [op('wife', 20), hook('collector', 'Your wife has his extortion in writing'), rivOp('kessler', -3), biz('add', 'stand', 'pacific'), then('p2_wm_4', 4, 8, 1)],
        preview: `She has a business and a ledger of Kessler's crimes. The marriage has a new partner in it.`,
      },
      {
        text: `Have a word with {collector.first} about whose block this is.`,
        effects: [op('wife', -8), respect(4), rivOp('kessler', -8), infl('pacific', 3), heat('local', 3), then('p2_wm_4', 4, 8, 1)],
        preview: `He never comes back. Neither does her chance to handle it herself.`,
      },
      {
        text: `Call Danny Kessler. A courtesy: his man shook down your wife.`,
        effects: [rivOp('kessler', 6), op('wife', 5), money(200), then('p2_wm_4', 4, 8, 1)],
        preview: `Kessler apologizes and returns the twenty. Now Kessler knows your wife has a shop.`,
      },
    ],
  },
  {
    id: 'p2_wm_4',
    category: 'family',
    chain: { id: 'p2_wall', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { wife: carried('your wife'), mother: famRole('your mother', 'mother') },
    title: 'A Roof in Her Own Name',
    body: `She waits until the kids are asleep. She has a folder.

"There's a motel on the Crest, the Sea Wren, nineteen units, the owner's going to his daughter's in Fort Lauderdale. Forty-one thousand." She opens the folder: the owner's books, a survey, a letter from a lawyer in Cape May who doesn't know you. "I want it in my maiden name. Not yours, not your mother's, not some cousin's. Mine.

"If they come for you some morning, and they will come some morning, the kids still have a roof and something that pays. I'm not asking you to stop. I'm asking you to let me plan for it."`,
    options: [
      {
        text: `Buy it. Her name on the deed.`,
        gate: { money: 6000 },
        effects: [money(-6000), unwashed(-4000), biz('add', 'motel', 'crest'), op('wife', 30), flag('p2_wm_deed'), famOp(6), op('mother', -10), then('p2_wm_5', 40, 70, 1)],
        preview: `The down payment is clean on paper. Your mother will hear about whose name is on it before the ink is dry.`,
      },
      {
        text: `Put it in your mother's name. That's how it's always been done.`,
        gate: { money: 6000 },
        effects: [money(-6000), biz('add', 'motel', 'crest'), op('wife', -20), op('mother', 15), flag('p2_wm_nonna_deed'), then('p2_wm_5', 40, 70, 1)],
        preview: `The family is protected. {wife.first} learns again where she ranks in it.`,
      },
      {
        text: `"Nobody's coming for me." No.`,
        effects: [op('wife', -25), famOp(-5), stress(5), then('p2_wm_5', 40, 70, 1)],
        preview: `She closes the folder. She keeps it.`,
      },
      {
        text: `Buy it through a straw man in Cape May. Nobody's name is safe.`,
        gate: { trait: 'Paranoid' },
        effects: [money(-6500), biz('add', 'motel', 'crest'), op('wife', -5), evidence('player', -3), then('p2_wm_5', 40, 70, 1)],
        preview: `Safe from the Feds, maybe. A straw man is a man, and men can be bought by other people.`,
      },
    ],
  },
  {
    id: 'p2_wm_5',
    category: 'law',
    chain: { id: 'p2_wall', part: 5 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { wife: carried('your wife'), mother: carried('your mother') },
    title: 'The Morning They Came',
    body: `It is a Thursday, as it always seems to be. Treasury men with a federal lien and a list: the restaurant's account, the vending company's account, the safe deposit box in Rio Grande. Somebody in Camden signed a piece of paper and three of your doors close at once.

You stand in the kitchen in your undershirt while a man in a gray suit inventories the silverware. {wife.first} is already dressed. She has been dressed since six. She pours the man a cup of coffee, because she was raised right, and then she looks at you over his shoulder with an expression you have never seen on her face before. It might be fear. It might be the look of a woman who has been right for a long time and has never once gotten to say so.`,
    immediate: [money(-5000), heat('federal', 6)],
    options: [
      {
        text: `The Sea Wren is in her name. Let her carry the family through the winter.`,
        gate: { flag: 'p2_wm_deed' },
        effects: [money(3500), op('wife', 15), famOp(10), stress(-8), respect(3)],
        preview: `Nineteen units, clean books, her name. The lien can't touch it, and everyone in the family knows who saw it coming.`,
      },
      {
        text: `Your mother holds the deed. Ask her to sign the income over.`,
        gate: { flag: 'p2_wm_nonna_deed' },
        effects: [money(2500), op('mother', 5), op('wife', -10), famOp(-3)],
        preview: `Your mother signs, eventually, with conditions, and reminds you of them at every Sunday dinner.`,
      },
      {
        text: `Ride it out. Borrow from the crew.`,
        effects: [money(2000), crewOp(-6), respect(-4), stress(10)],
        preview: `Your capos lend you money. Every one of them notices that you needed it.`,
      },
      {
        text: `"You knew. You always knew. Thank you."`,
        gate: { flag: 'p2_wm_truth' },
        effects: [op('wife', 25), stress(-10), famOp(5)],
        preview: `It doesn't unfreeze a single account. It is the best thing you've said to her in years.`,
      },
    ],
  },

  /* ================================================================ */
  /* 2. THE ALTAR SOCIETY                                              */
  /* ================================================================ */
  {
    id: 'p2_alt_1',
    category: 'church',
    chain: { id: 'p2_altar', part: 1 },
    trigger: { months: [9, 10], minWeek: 12, once: true, weight: 12 },
    roles: {
      wife: famRole('your wife', 'spouse'),
      nora: world('pol_nora_callahan', 'Nora Callahan, the mayor\'s wife and president of the Rosary Altar Society', { first: 'Nora', last: 'Callahan', gender: 'F', ethnicity: 'Irish', age: [50, 60], traits: ['Charming', 'Patient'] }),
    },
    title: 'President of the Rosary Altar Society',
    body: `{nora.name} has been president of the Rosary Altar Society at Our Lady of the Dunes for eleven years. The Society runs the bazaar, rents the parish hall for every wedding and political rally on the island, and keeps a card file of every Catholic family in Wildwood: who's sick, who's out of work, whose boy is at Fort Dix. The mayor's wife knows which families need a turkey at Thanksgiving. Her husband knows how those families vote.

{wife.first} announces at dinner that she's running against her. "Eleven years is long enough," she says. "And the bazaar loses money every year on the wheel of chance, which I'd like somebody to explain to me." She looks at you as if you might be able to.`,
    options: [
      {
        text: `"Go get her." Stay out of it.`,
        effects: [op('wife', 12), flag('p2_alt_hers'), then('p2_alt_2', 3, 5, 1)],
        preview: `It's her campaign. The Callahan machine has never lost an election it cared about, including this one.`,
      },
      {
        text: `Ask her not to. The mayor is useful.`,
        effects: [op('wife', -15), op('nora', 5), favor(1)],
        preview: `{nora.first} hears that you kept your wife home. She is grateful in the way of people who now know something about you.`,
      },
      {
        text: `Back her. Write a check to the bazaar fund, a big one, in her name.`,
        gate: { money: 1500 },
        effects: [money(-1500), op('wife', 6), respect(2), flag('p2_alt_check'), then('p2_alt_2', 3, 5, 1)],
        preview: `The money helps. It also makes it your campaign, a little, and everybody at the Dunes notices whose money it is.`,
      },
    ],
  },
  {
    id: 'p2_alt_2',
    category: 'politics',
    chain: { id: 'p2_altar', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      wife: carried('your wife'),
      nora: carried('Nora Callahan'),
      tina: world('civ_tina_palmieri', 'Tina Palmieri, who does the hair of every wife on the island', { first: 'Concetta', last: 'Palmieri', nickname: 'Tina', gender: 'F', ethnicity: 'Italian', age: [35, 50] }),
    },
    title: 'The Card File',
    body: `{nora.first} Callahan asks {wife.first} to tea at the rectory parlor and makes her an offer in a voice like a doily. Withdraw, and the Society's new hospitality chair will be {wife.first}, with a seat on the bazaar committee. And {nora.first}'s husband would be so pleased to see that the liquor license transfer for your restaurant goes through the commission without any of the usual delays.

Meanwhile {tina.call} has been doing hair. Under her dryers, the Altar Society's sixty-one voting members have been learning that {wife.first} plans to publish the bazaar accounts. Twenty-two are with your wife. Nineteen are with the mayor's. The rest are waiting to see which way the monsignor leans.

{wife.first} lays it out for you on the porch. "I could win this," she says. "Or I could take her deal. What I won't do is let you fix it for me."`,
    options: [
      {
        text: `"Take her deal. The license is real money."`,
        effects: [op('wife', -12), favor(2), money(800), op('nora', 10), flag('p2_alt_deal'), then('p2_alt_3', 2, 3, 1)],
        preview: `A license and a favor from City Hall. {wife.first} gets a title and a lesson in what you think her campaign is worth.`,
      },
      {
        text: `"It's your election. Win it."`,
        effects: [op('wife', 14), op('tina', 5), op('nora', -8), then('p2_alt_3', 2, 3, 1)],
        preview: `She runs on the bazaar books, the turkeys and her own name. The machine runs on what it always runs on.`,
      },
      {
        text: `Have a few of the men's wives remember who pays their husbands.`,
        effects: [op('wife', -20), flag('p2_alt_muscle'), heat('local', 2), then('p2_alt_3', 2, 3, 1)],
        preview: `Seventeen votes, guaranteed. She will know exactly where every one of them came from.`,
      },
    ],
  },
  {
    id: 'p2_alt_3',
    category: 'church',
    chain: { id: 'p2_altar', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      wife: carried('your wife'),
      nora: carried('Nora Callahan'),
      msgr: world('civ_msgr_tierney', 'Monsignor Tierney, who counts the ballots', { first: 'Hugh', last: 'Tierney', ethnicity: 'Irish', age: [65, 75], traits: ['Pious', 'Patient'] }),
    },
    title: 'Paper Ballots in a Collection Basket',
    body: `{msgr.name} counts the ballots himself at a card table in the parish hall, out of a wicker collection basket, with his reading glasses on the end of his nose. Sixty-one women in hats watch him do it. Coffee cake, percolator, folding chairs. It is the most honest election in Cape May County this year, and everybody in the room knows it.

Thirty-three to twenty-eight. The monsignor reads the name twice so nobody can say they misheard.

Afterward, in the parking lot, {nora.first} Callahan comes to your car window. She's not smiling and she's not angry. "Your wife beat me fair, or she beat me with your help," she says. "I know which. So does she. So does Dick." Then she goes home to tell the mayor.`,
    options: [
      {
        text: `She won it fair. Let her run the Society her own way.`,
        gate: { flag: 'p2_alt_hers' },
        effects: [op('wife', 20), famOp(6), respect(5), infl('downtown', 4), op('nora', -6), favor(1)],
        preview: `Your wife now keeps the card file. Every Catholic family's troubles, and the votes that follow them, pass through your kitchen.`,
      },
      {
        text: `Ask {wife.first} for the card file. Just to look.`,
        effects: [op('wife', -15), favor(2), infl('downtown', 6), heat('local', 2), op('nora', -10)],
        preview: `The machine's oldest tool, in your hands. Your wife decides how she feels about lending it.`,
      },
      {
        text: `The muscle won it. Make it up to her: let her publish the bazaar accounts, wheel and all.`,
        gate: { flag: 'p2_alt_muscle' },
        effects: [op('wife', 8), money(-700), respect(-2), heat('local', -2)],
        preview: `The wheel of chance comes off the bazaar books, and so does your cut of it. It's an apology she can count.`,
      },
      {
        text: `Send {nora.first} flowers. You'll need the Callahans next year.`,
        effects: [op('nora', 10), money(-100), op('wife', -4)],
        preview: `{nora.first} keeps the card. Politics is a long game, and she is better at it than either of you.`,
      },
    ],
  },

  /* ================================================================ */
  /* 3. THE CAPTAIN'S BOY                                              */
  /* ================================================================ */
  {
    id: 'p2_wb_1',
    category: 'romance-nonexplicit',
    chain: { id: 'p2_wrongboy', part: 1 },
    trigger: { season: 'summer', minWeek: 3, once: true, weight: 13 },
    roles: {
      daughter: famRole('your daughter, eighteen or older', 'daughter', { age: [18, 24] }),
      boy: townie('Danny Kilbride, the police captain\'s youngest son', { first: 'Daniel', last: 'Kilbride', nickname: 'Danny', gender: 'M', ethnicity: 'Irish', age: [19, 24], traits: ['Honest', 'Charming'], faction: 'none' }),
      captain: world('cop_james_kilbride', 'Captain James Kilbride, second in command of the Wildwood police', { first: 'James', last: 'Kilbride', nickname: 'Jimmy K', ethnicity: 'Irish', age: [45, 55], traits: ['Ambitious'] }, 'police captain'),
    },
    title: 'Before Nonna\'s Hairdresser Does',
    body: `{daughter.first} comes into the kitchen while you're reading the Racing Form and sits across from you with her hands folded, which is how she sat when she was seven and broke the Infant of Prague.

"I'm seeing someone. I'm telling you before Nonna's hairdresser does." His name is {boy.name}. He's a lifeguard at Stand 9, he's starting at Glassboro State in the fall, and his father is {captain.name}, second in command of the Wildwood police. They met on the Hunt's Pier carousel, of all places. He has walked her home every night for three weeks and has never once tried to come up the steps.

"He knows who you are," she says. "Everybody knows who you are. He asked me anyway."`,
    options: [
      {
        text: `"Bring him to Sunday dinner."`,
        effects: [op('daughter', 18), famOp(4), then('p2_wb_2', 3, 5, 1)],
        preview: `A policeman's son at your table. The whole island will know by Monday.`,
      },
      {
        text: `"A cop's son. No. End it."`,
        effects: [op('daughter', -25), famOp(-4), flag('p2_wb_forbade'), then('p2_wb_2', 3, 5, 1)],
        preview: `She's eighteen. She heard you. That isn't the same thing as obeying you.`,
      },
      {
        text: `Say nothing. Have someone find out what kind of boy he is.`,
        gate: { trait: 'Paranoid' },
        effects: [op('daughter', -5), money(-150), hook('boy', 'You know what he does on his nights off: nothing, mostly'), then('p2_wb_2', 3, 5, 1)],
        preview: `He's exactly what he looks like, which is worse news than if he weren't.`,
      },
    ],
  },
  {
    id: 'p2_wb_2',
    category: 'law',
    chain: { id: 'p2_wrongboy', part: 2 },
    trigger: { chainOnly: true },
    roles: { daughter: carried('your daughter'), boy: carried('Danny Kilbride'), captain: carried('Captain Kilbride') },
    title: 'Two Fathers on the Boardwalk',
    body: `{captain.call} doesn't come to the Ivanhoe; he would never be seen there. He finds you on the Boardwalk at seven in the morning, when it's just the gulls and the men hosing down the custard stands, and he walks beside you for two blocks without saying a word.

"Gorman retires in two years," he says finally. "I want that chair. You know I want that chair. And now my son is walking your daughter home from the pier, and every man in my department thinks I arranged it." He stops at the railing. "I didn't. He's a good boy. He's a better man than me. So tell me what you want, because everybody in this town wants something."`,
    options: [
      {
        text: `"I want my daughter happy. That's all. Go be chief on your own."`,
        effects: [op('captain', 15), op('daughter', 10), flag('p2_wb_clean'), then('p2_wb_3', 6, 10, 1)],
        preview: `Two fathers who agree to stay out of it. Whether the rest of the island lets them is another question.`,
      },
      {
        text: `"Help me, and I'll help you get that chair."`,
        effects: [op('captain', 8), favor(2), hook('captain', 'He bargained for the chief\'s chair over his son\'s romance', true), flag('p2_wb_bargained'), op('daughter', -10), then('p2_wb_3', 6, 10, 1)],
        preview: `You could own the next chief of police. Your daughter will find out what her romance was traded for.`,
      },
      {
        text: `"Tell your boy to stay away from her, and we never had this conversation."`,
        effects: [op('captain', -10), op('daughter', -20), op('boy', -15), then('p2_wb_3', 6, 10, 1)],
        preview: `The captain can't make his son obey any more than you can make your daughter. Now you've both tried.`,
      },
    ],
  },
  {
    id: 'p2_wb_3',
    category: 'law',
    chain: { id: 'p2_wrongboy', part: 3 },
    trigger: { chainOnly: true },
    roles: { daughter: carried('your daughter'), boy: carried('Danny Kilbride'), captain: carried('Captain Kilbride'), soldier: crewRole('a soldier who runs your card game', { rank: ['soldier', 'associate'] }) },
    title: 'She Knew on Tuesday',
    body: `The raid on {soldier.call}'s card game over the bakery comes on Friday at eleven: three patrol cars, a photographer from the Leader, a sergeant who's never been on your pad. They find a table, two decks and a coffee can of quarters, because the real game moved on Wednesday.

It moved on Wednesday because on Tuesday night {daughter.first} sat at the foot of your bed in her bathrobe and said, very quietly, "Danny's father is planning something for Friday. Danny doesn't know I heard. Don't ask me anything else."

Now {boy.first} wants to know why his father's big raid found a coffee can. And {daughter.first} hasn't slept in two days.`,
    options: [
      {
        text: `Tell her you'll never ask her for anything like that again. And mean it.`,
        effects: [op('daughter', 20), money(800), respect(2), stress(-3), then('p2_wb_4', 6, 12, 1)],
        preview: `She chose you once. You make sure she never has to choose again.`,
      },
      {
        text: `Ask her what else she hears at the Kilbrides' table.`,
        effects: [op('daughter', -25), hook('captain', 'His raid was blown through his own kitchen'), heat('local', -4), then('p2_wb_4b', 3, 6, 1)],
        preview: `A source inside the captain's house. It's the end of something between you and your daughter.`,
      },
      {
        text: `Let {soldier.first} take a small pinch next week, so the captain gets his headline.`,
        effects: [op('soldier', -10), money(-500), op('captain', 10), heat('local', -6), op('daughter', 8), then('p2_wb_4', 6, 12, 1)],
        preview: `A $25 fine and a photograph in the Leader. Nobody looks at where the leak was.`,
      },
    ],
  },
  {
    id: 'p2_wb_4',
    category: 'family',
    chain: { id: 'p2_wrongboy', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { daughter: carried('your daughter'), boy: carried('Danny Kilbride'), captain: carried('Captain Kilbride') },
    title: 'Both Sides of the Aisle',
    body: `The Kilbrides sit on the left: patrolmen in their dress blues, a monsignor's worth of aunts, the captain with his jaw set like he's about to testify. Your side sits on the right: capos in mohair, your mother in black lace, a Philadelphia man at the end of the third pew pretending he's somebody's cousin.

{daughter.first} walks up the aisle at Our Lady of the Dunes on your arm. At the altar {boy.first} is so nervous he drops the ring, and both families laugh at the same moment, which is the first thing they have ever done together.

At the reception at the Admiral, the captain asks you for a word by the coat check.`,
    options: [
      {
        text: `Toast the Kilbrides. Give the kids the down payment on a house, clean money, no strings.`,
        gate: { money: 3000 },
        effects: [money(-3000), op('daughter', 25), op('boy', 15), op('captain', 10), famOp(10), respect(4)],
        preview: `A cop and a bootlegger's granddaughter in a Cape Cod on Burk Avenue. It works better than anyone bet.`,
      },
      {
        text: `By the coat check: the chair is his. Now he's family, and family owes.`,
        gate: { flag: 'p2_wb_bargained' },
        effects: [favor(3), hook('captain', 'The chief owes you his chair and his son\'s wedding', true), heat('local', -10), op('daughter', -15), op('boy', -20)],
        preview: `You own the next chief of police. Your son-in-law will never quite look you in the eye again.`,
      },
      {
        text: `By the coat check: "Keep your raids off my family's streets and I'll keep my business off yours."`,
        effects: [op('captain', 5), heat('local', -4), infl('{district}', 2)],
        preview: `A truce between in-laws. It holds as long as nobody gets ambitious, and both of you are.`,
      },
    ],
  },
  {
    id: 'p2_wb_4b',
    category: 'family',
    chain: { id: 'p2_wrongboy', part: 4 },
    trigger: { chainOnly: true },
    roles: { daughter: carried('your daughter'), boy: carried('Danny Kilbride') },
    title: 'A Postcard From Burlington, Vermont',
    body: `The postcard shows a covered bridge in autumn. On the back, in {daughter.first}'s round convent-school handwriting:

"We were married Saturday by a justice of the peace who smelled like maple syrup. Danny has a job at the paper mill and I'm going to finish school here. Please tell Ma I'm sorry about the church. Don't tell Nonna anything; I'll write her myself. I'm not angry. I just don't want to be the one who tells you what the Kilbrides eat for dinner anymore. Love, your daughter."

Your wife reads it twice and puts it in her apron pocket and doesn't speak to you for the rest of the day.`,
    options: [
      {
        text: `Drive to Vermont. Just to see her.`,
        effects: [money(-300), op('daughter', 20), famOp(4), stress(-5)],
        preview: `Nine hours in the Cadillac. She lets you in. She doesn't come home.`,
      },
      {
        text: `Send money every month through her mother. Say nothing.`,
        effects: [money(-200), op('daughter', 8), famOp(2)],
        preview: `She cashes the checks for the baby, later. She never mentions where they come from.`,
      },
      {
        text: `She made her choice.`,
        effects: [op('daughter', -15), famOp(-10), stress(6)],
        preview: `You have a daughter in Vermont who sends Christmas cards to her mother and her grandmother.`,
      },
    ],
  },

  /* ================================================================ */
  /* 4. THE MARLIN                                                     */
  /* ================================================================ */
  {
    id: 'p2_hd_1',
    category: 'family',
    chain: { id: 'p2_marlin', part: 1 },
    trigger: { hasBusiness: 'motel', months: [3, 4], once: true, weight: 12 },
    roles: {
      daughter: famRole('your daughter, twenty or older', 'daughter', { age: [20, 32] }),
      nephew: famRole('your nephew', 'nephew', { age: [22, 40] }),
    },
    title: 'Who Runs the Marlin',
    body: `Augie Ferrante has managed the Marlin for nineteen years: forty rooms on Ocean Avenue, a pool shaped like a kidney, a sign with a leaping blue fish that buzzes in the rain. Augie's knees are gone and he's moving to his son's in Pennsauken. The season opens in nine weeks.

Your nephew {nephew.first} has been the Marlin's night man for three summers and assumes the job is his. Everybody assumes it, including {nephew.first}'s mother, who has already told her canasta club.

Your daughter {daughter.first} comes to see you with a typed proposal, three pages, single-spaced: a rate card for the Labor Day week, a deal with the Greyhound tours out of Scranton, a plan to fix the pool filter that's been leaking since Eisenhower. "I've been doing the front desk since I was fourteen," she says. "{nephew.first} has been sleeping behind it."`,
    options: [
      {
        text: `Give it to {daughter.first}.`,
        effects: [op('daughter', 25), op('nephew', -25), flag('p2_hd_daughter'), famOp(-2), then('p2_hd_2a', 3, 5, 1)],
        preview: `She gets her chance. {nephew.first} gets a grievance, and so does his mother, who is your sister.`,
      },
      {
        text: `Give it to {nephew.first}. Seniority. And it's how things are done.`,
        effects: [op('nephew', 15), op('daughter', -25), flag('p2_hd_nephew'), then('p2_hd_2b', 3, 5, 1)],
        preview: `Nobody's surprised. That's the problem: especially not {daughter.first}.`,
      },
      {
        text: `Both. Co-managers. Let the season decide.`,
        effects: [op('daughter', 5), op('nephew', -5), stress(4), flag('p2_hd_both'), then('p2_hd_2a', 3, 5, 1)],
        preview: `A fair answer, which means both of them think you were unfair.`,
      },
    ],
  },
  {
    id: 'p2_hd_2a',
    category: 'rivals',
    chain: { id: 'p2_marlin', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      daughter: carried('your daughter'),
      nephew: carried('your nephew'),
      linen: { desc: 'Kessler\'s linen-service man', pool: 'rival', faction: 'kessler', spawn: { first: 'Lou', last: 'Garrity', ethnicity: 'Irish', age: [40, 55], traits: ['Greedy'] } },
    },
    title: 'The Linen Man',
    body: `{linen.name} has supplied the Marlin's sheets and towels since the war. He works for a laundry in North Wildwood that works for Danny Kessler, and his price has gone up every year, and Augie always paid it because Augie liked a quiet life.

{daughter.first} sent the June invoice back with a note: "We counted. You billed us for 900 towels and delivered 640. Please correct and resubmit." {linen.first} came in person, stood at the front desk, and told her that her father would want her to pay it.

She called the Neptune Laundry in the Crest and got a quote for a third less. Then she called you, but only to tell you she'd done it.`,
    options: [
      {
        text: `"It's your hotel."`,
        effects: [op('daughter', 15), money(400), rivOp('kessler', -5), then('p2_hd_3', 6, 10, 1)],
        preview: `She switches laundries. Kessler's people learn the Marlin is run by someone who counts towels.`,
      },
      {
        text: `Call {linen.first} yourself and settle it man to man.`,
        effects: [op('daughter', -12), money(200), respect(2), then('p2_hd_3', 6, 10, 1)],
        preview: `It's solved in a phone call. Every supplier on the island now knows who to call instead of her.`,
      },
      {
        text: `Pay the invoice. A towel war with Kessler isn't worth it.`,
        effects: [money(-300), op('daughter', -18), rivOp('kessler', 4), then('p2_hd_3', 6, 10, 1)],
        preview: `Quiet, like Augie liked it. {daughter.first} learns her authority runs exactly as far as Kessler's patience.`,
      },
    ],
  },
  {
    id: 'p2_hd_2b',
    category: 'family',
    chain: { id: 'p2_marlin', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      daughter: carried('your daughter'),
      nephew: carried('your nephew'),
      pat: world('pol_pat_keane', 'Pat Keane, Crest commissioner and the motel queen of the Crest', { first: 'Patricia', last: 'Keane', nickname: 'Pat', gender: 'F', ethnicity: 'Irish', age: [38, 48], traits: ['Honest', 'Ambitious'] }, 'Wildwood Crest Commissioner'),
    },
    title: 'A Job Offer From the Crest',
    body: `{daughter.first} has taken a job. Assistant manager at the Pelican Arms, the biggest of the Keane motels in the Crest: a hundred and ten rooms, a rooftop sun deck, and a boss named {pat.name} who sits on the Crest commission and has spent five years trying to keep men like you off it.

"Mrs. Keane says I'm the best front-desk girl she's ever seen," {daughter.first} tells her mother, loudly enough for you to hear. "She says I should have my own place by thirty. She says it's a shame some families don't know what they have."

Meanwhile the Marlin under {nephew.first} has had a bad June: two bounced checks from a tour operator, a pool that turned green over the Fourth.`,
    options: [
      {
        text: `Let her go. She'll learn more from Pat Keane than from you.`,
        effects: [op('daughter', 10), op('pat', 5), flag('p2_hd_keane'), then('p2_hd_3', 6, 10, 1)],
        preview: `Your daughter learns the motel business from the cleanest operator on the island. It may make her someone you can't control.`,
      },
      {
        text: `Ask her to come back. Make her assistant manager under {nephew.first}.`,
        effects: [op('daughter', -10), op('nephew', 5), money(300), then('p2_hd_3', 6, 10, 1)],
        preview: `She comes back for her mother's sake. She does the work and he gets the title.`,
      },
      {
        text: `Ask Pat Keane, quietly, to fire her.`,
        effects: [op('pat', -20), op('daughter', -30), famOp(-6), then('p2_hd_3', 6, 10, 1)],
        preview: `Keane refuses, then tells your daughter you asked. Commissioner Keane is not on anyone's pad, and now she has a reason to stay off yours.`,
      },
    ],
  },
  {
    id: 'p2_hd_3',
    category: 'season',
    chain: { id: 'p2_marlin', part: 3 },
    trigger: { chainOnly: true },
    roles: { daughter: carried('your daughter'), nephew: carried('your nephew') },
    title: 'Labor Day Numbers',
    body: `The season's over. The Marlin's books come to your table the Tuesday after Labor Day in a manila envelope.

{daughter.first} has a second envelope: an idea. The old Starlight Ballroom on the Marlin's ground floor has been storing deck chairs since 1954. She wants to clean it out and rent it nine months a year: Knights of Columbus banquets, sweet sixteens, Rotary lunches, Greek weddings, the Methodists' covered-dish supper. "Off-season money," she says. "The whole island closes in October. We don't have to."

{nephew.first} has heard about the second envelope. He thinks the ballroom should be a card room, which is what it was in 1949, and he's said so to two of your soldiers.`,
    options: [
      {
        text: `Banquet hall. {daughter.first}'s plan.`,
        effects: [money(-1500), biz('add', 'restaurant', '{district}'), op('daughter', 18), op('nephew', -15), then('p2_hd_4', 20, 30, 1)],
        preview: `A legitimate business that earns in February. {nephew.first} keeps a list of everything that should have been his.`,
      },
      {
        text: `Card room. {nephew.first}'s plan.`,
        effects: [biz('add', 'cardgame', '{district}'), heat('local', 4), op('nephew', 15), op('daughter', -18), then('p2_hd_4', 20, 30, 1)],
        preview: `Money every weekend, and a raid waiting to happen in the family hotel.`,
      },
      {
        text: `Banquets upstairs, a quiet game in the back. Both.`,
        effects: [money(-1500), biz('add', 'restaurant', '{district}'), biz('add', 'cardgame', '{district}'), heat('local', 3), op('daughter', -5), op('nephew', 3), then('p2_hd_4', 20, 30, 1)],
        preview: `The Methodists eat covered-dish casseroles twenty feet from a poker table. It works, until it doesn't.`,
      },
    ],
  },
  {
    id: 'p2_hd_4',
    category: 'family',
    chain: { id: 'p2_marlin', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { daughter: carried('your daughter'), nephew: carried('your nephew') },
    title: 'The Passed-Over Party',
    body: `Somebody always pays for being passed over. This spring, it's coming due.

{nephew.first} has been seen at the Shamrock with two of Danny Kessler's men, buying the rounds. {daughter.first} has had a letter from a bank in Cape May, which she leaves on your desk without comment: they would be pleased to discuss a mortgage for a motel of her own, eighteen units on the Crest, with a Mrs. Patricia Keane as reference.

Your sister calls on Sunday, crying, to ask what her son ever did to you. Your wife says nothing at all, which in your house is louder.`,
    options: [
      {
        text: `Make {daughter.first} manager of the Marlin outright, title and salary. Find {nephew.first} something of his own.`,
        effects: [op('daughter', 25), op('nephew', -10), money(-1000), famOp(4), recruit('nephew', 'associate')],
        preview: `Your daughter runs the family hotel. Your nephew gets a vending route and a reason to stay where you can see him.`,
      },
      {
        text: `Back {daughter.first}'s motel on the Crest. Let her build her own.`,
        gate: { flag: 'p2_hd_keane' },
        effects: [money(-4000), biz('add', 'motel', 'crest'), op('daughter', 30), infl('crest', 5), op('nephew', 5)],
        preview: `She owns eighteen units in the Crest with Pat Keane's blessing. A clean business that's half yours and entirely hers.`,
      },
      {
        text: `Bring {nephew.first} back from the Shamrock. Give him the Marlin, for good this time.`,
        effects: [op('nephew', 20), op('daughter', -30), famOp(-6), rivOp('kessler', -4)],
        preview: `Blood keeps him off Kessler's payroll. {daughter.first} takes the bank's meeting anyway.`,
      },
      {
        text: `Sit them both down at the Marlin's front desk. "One of you runs it, one of you runs the money. Fight in private."`,
        gate: { trait: 'Charming' },
        effects: [op('daughter', 10), op('nephew', 10), stress(5), famOp(3)],
        preview: `Cousins who will someday hate each other with great professionalism. For now, the Marlin is the best-run hotel on Ocean Avenue.`,
      },
    ],
  },

  /* ================================================================ */
  /* 5. COUNSELOR                                                      */
  /* ================================================================ */
  {
    id: 'p2_cn_1',
    category: 'family',
    chain: { id: 'p2_counselor', part: 1 },
    trigger: { minWeek: 40, months: [4, 5], once: true, weight: 11 },
    roles: { daughter: famRole('your daughter, finishing college', 'daughter', { age: [20, 24] }), mother: famRole('your mother', 'mother') },
    title: 'One of Nine Women',
    body: `The envelope is from Rutgers Law School in Newark. {daughter.first} opens it at the kitchen table with a butter knife, reads it once, and puts it face down.

"I'm in," she says. "There'll be nine women in the class. Out of a hundred and forty." She took the admissions test in Philadelphia last October and told everyone she was at a retreat with the Sodality.

Your mother crosses herself. "A lawyer. What man is going to marry a lawyer?" Your consigliere, when you tell him later, takes off his glasses and cleans them for a long time. "A lawyer in the family," he says. "Your father would have paid anything for that." Then: "A lawyer in the family knows things she has to swear an oath about."`,
    options: [
      {
        text: `Pay the tuition. All three years. Clean money.`,
        gate: { money: 2500 },
        effects: [money(-2500), op('daughter', 25), op('mother', -8), flag('p2_cn_paid'), then('p2_cn_2', 100, 140, 1)],
        preview: `She goes to Newark on your dime. She'll remember, and so will the bar examiners who look at where it came from.`,
      },
      {
        text: `Let her pay her own way. She's been saving from Weiss's for four years.`,
        effects: [op('daughter', 8), flag('p2_cn_own'), then('p2_cn_2', 100, 140, 1)],
        preview: `She works nights at a Newark department store and owes you nothing, which is how she wanted it.`,
      },
      {
        text: `"No daughter of mine." Forbid it.`,
        effects: [op('daughter', -30), op('mother', 10), famOp(-5), flag('p2_cn_forbade'), then('p2_cn_2', 100, 140, 0.8)],
        preview: `She goes anyway, the next year, with a scholarship and a different address.`,
      },
    ],
  },
  {
    id: 'p2_cn_2',
    category: 'law',
    chain: { id: 'p2_counselor', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      daughter: carried('your daughter'),
      judge: world('law_marjorie_pembroke', 'Judge Marjorie Pembroke of the Chancery Division', { first: 'Marjorie', last: 'Pembroke', gender: 'F', age: [40, 50], traits: ['Honest', 'Ambitious'] }, 'Superior Court judge (Chancery)'),
    },
    title: 'Chambers',
    body: `{daughter.first} graduated fourth in her class, and {judge.name} of the Chancery Division picked her to clerk: the youngest woman on the Superior Court choosing the most promising woman in the graduating class, and the Atlantic City paper ran a photograph of them on the courthouse steps.

Chancery decides who owns things: a pier in a partnership dispute, a dead man's nightclub, a motel two brothers both claim. This term the docket includes a quiet title action over the Neptune Pier lease, which you need to go a certain way, and a petition about a liquor license on Pacific that has your cousin's name on it.

{daughter.first} comes home for Easter and talks about everything except work.`,
    options: [
      {
        text: `Never ask her about chambers. Not once.`,
        effects: [op('daughter', 15), flag('p2_cn_clean'), op('judge', 5), then('p2_cn_3', 30, 50, 1)],
        preview: `You lose a look at the docket. You keep a daughter whose word is good in every courthouse in New Jersey.`,
      },
      {
        text: `Ask her, just once, how the pier case looks.`,
        effects: [op('daughter', -20), evidence('daughter', 5), money(1200), then('p2_cn_3', 30, 50, 1)],
        preview: `She tells you nothing useful and goes back to Atlantic City early. You can't take back the question.`,
      },
      {
        text: `Pull the cousin's license petition so she never has to see your family's name on the docket.`,
        effects: [money(-800), op('daughter', 10), respect(-2), then('p2_cn_3', 30, 50, 1)],
        preview: `A license lost to protect a clerkship. She notices the petition vanished and knows exactly why.`,
      },
    ],
  },
  {
    id: 'p2_cn_3',
    category: 'law',
    chain: { id: 'p2_counselor', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      daughter: carried('your daughter'),
      dag: world('law_judith_rosenfeld', 'Judith Rosenfeld, Deputy Attorney General, criminal investigations', { first: 'Judith', last: 'Rosenfeld', gender: 'F', ethnicity: 'Jewish', age: [30, 40], traits: ['Ambitious', 'Honest'] }, 'Deputy Attorney General'),
    },
    title: 'An Offer From Trenton',
    body: `{dag.name}, the Deputy Attorney General who writes the memos about superseding county prosecutors who can't or won't touch the rackets, has offered {daughter.first} a job. Criminal investigations. Trenton. The people who would, someday, come for you.

"She told me she knew exactly whose daughter I was," {daughter.first} says, sitting on your porch with a glass of iced tea she hasn't touched. "She said that's why she wants me. She said I'd know where to look, and I'd also know what it costs. She said I'd be good at it." She finally looks at you. "Mr. Vecchio's firm in Camden also called. Defense work. Your kind of clients."

"I'm not asking permission. I'm asking you what you'd do."`,
    options: [
      {
        text: `"Take Trenton. Be good at it. Just never come to my house with a warrant."`,
        effects: [op('daughter', 20), flag('p2_cn_state'), heat('federal', -2), stress(6), then('p2_cn_4b', 60, 120, 1)],
        preview: `Your daughter goes to work for the State. It is the most respectable thing anyone in your family has ever done, and the most dangerous.`,
      },
      {
        text: `"Take the defense job. Somebody's got to keep honest people's sons out of Trenton State."`,
        effects: [op('daughter', 10), flag('p2_cn_defense'), then('p2_cn_4', 30, 60, 1)],
        preview: `She'll be the best defense lawyer in South Jersey. Some of her clients will be yours, and that is its own kind of trap.`,
      },
      {
        text: `"Hang out your own shingle in Wildwood. Wills, deeds, divorces. Be nobody's."`,
        effects: [op('daughter', 5), money(-1000), biz('add', 'stand', 'downtown'), flag('p2_cn_defense'), then('p2_cn_4', 30, 60, 1)],
        preview: `A storefront office on Pacific with her name in gold leaf. Sooner or later one of your men will need her.`,
      },
    ],
  },
  {
    id: 'p2_cn_4',
    category: 'law',
    chain: { id: 'p2_counselor', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: {
      daughter: carried('your daughter'),
      soldier: crewRole('a soldier facing trial', { rank: ['soldier', 'associate'] }),
      cop: official('the arresting detective', 'county detective', { first: 'Raymond', last: 'Vitale', ethnicity: 'Italian', age: [35, 50], traits: ['Ambitious'] }),
    },
    title: 'The People Versus {soldier.last}',
    body: `{soldier.call} is on trial in County Court for receiving stolen goods: a truckload of Philco televisions, found in a garage he rents. Detective {cop.name} swears he saw {soldier.first} unloading them on a Sunday night under a streetlight.

{daughter.first} has the case. She asked for it. She has measured the distance from the streetlight to the garage door with a tape measure from Lafferty's Hardware, gone back at the same hour on a Sunday, and photographed what you can and can't see.

Tomorrow she cross-examines the detective. Tonight she sits at your kitchen table with her notes and asks you only one question: "Did he do it? I don't need to know. I want to know if you'll lie to me."`,
    options: [
      {
        text: `"Yes, he did it. Win anyway, if the detective's lying about the light."`,
        effects: [op('daughter', 15), evidence('soldier', -10), op('soldier', 15), respect(5)],
        preview: `She takes {cop.last} apart over the streetlight. Acquitted. She doesn't come to the party at the Ivanhoe.`,
      },
      {
        text: `Lie to her. "He was home with his mother."`,
        effects: [op('daughter', -25), evidence('soldier', -10), op('soldier', 10)],
        preview: `She wins, because she's good. The next time you need her she checks your story first.`,
      },
      {
        text: `"Let somebody else take it. I don't want my daughter's name next to his."`,
        effects: [op('daughter', -10), money(-2000), op('soldier', -5)],
        preview: `A Philadelphia lawyer at two thousand dollars loses it in a day. {soldier.first} does eighteen months and blames you.`,
      },
    ],
  },
  {
    id: 'p2_cn_4b',
    category: 'law',
    chain: { id: 'p2_counselor', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { daughter: carried('your daughter'), dag: carried('Judith Rosenfeld') },
    title: 'Get a Good Lawyer',
    body: `Your daughter calls on a Thursday night from a pay phone. You can hear trucks behind her on Route 1.

"I'm not calling you," she says. "This call isn't happening. I'm on a case that's going to touch the county. I can't tell you whose name is in it. I asked to be taken off and they took me off, and that's all I'm allowed to do, and I've done it." A long pause. A truck goes by. "I love you. Get a good lawyer. Don't call me at the office."

Then a dial tone. {dag.first} Rosenfeld, you suspect, knows exactly where her deputy is standing tonight, and let her go anyway.`,
    immediate: [heat('federal', 5)],
    options: [
      {
        text: `Get a good lawyer. Move the books. Do it all yourself; never mention her name.`,
        effects: [money(-3000), evidence('player', -10), op('daughter', 15), stress(8)],
        preview: `She gave you a day's warning without breaking a single rule. You make sure nobody can ever say she did.`,
      },
      {
        text: `Call her back at the office anyway. You need to know whose name.`,
        effects: [op('daughter', -35), evidence('daughter', 15), heat('federal', 5), famOp(-8)],
        preview: `The line at the Attorney General's office is the one line in New Jersey you know is recorded. She hangs up. Her career hangs by a thread.`,
      },
      {
        text: `Do nothing. If they come, they come. She doesn't owe you.`,
        effects: [op('daughter', 10), stress(4), respect(2)],
        preview: `You decide your daughter's integrity is worth more than your warning. She'll never know whether you listened.`,
      },
    ],
  },

  /* ================================================================ */
  /* 6. NONNA'S TABLE                                                  */
  /* ================================================================ */
  {
    id: 'p2_nn_1',
    category: 'family',
    chain: { id: 'p2_nonna', part: 1 },
    trigger: { minWeek: 6, once: true, weight: 13 },
    roles: {
      mother: famRole('your mother', 'mother'),
      capo: crewRole('a capo', { rank: 'capo' }),
      debtor: world('civ_patsy_iorio', 'Patsy Iorio, who makes the best tomato pie on the boardwalk', { first: 'Pasquale', last: 'Iorio', nickname: 'Patsy', ethnicity: 'Italian', age: [50, 65] }),
    },
    title: 'Who Gives the Orders',
    body: `You told {capo.call} that {debtor.call}'s tomato pie stand was three weeks behind on the vig, and that three weeks is a week too many. {capo.first} went to see {debtor.first} on Tuesday. He came back with nothing, and with an explanation.

"Your mother was there," he says, studying his shoes. "She was buying a pie. She said Patsy's wife had a gallbladder operation and nobody collects off a man whose wife is in Burdette Tomlin Hospital, and she said your father would never have sent me, and then she said 'go home, Sonny,' and..." He spreads his hands. "She's your mother. What was I gonna do?"

At Sunday gravy your mother passes you the braciole and says nothing about it at all.`,
    options: [
      {
        text: `Back her. At the table, so the family hears it: Patsy gets a month.`,
        effects: [op('mother', 15), op('capo', 5), money(-400), respect(-3), famOp(5), op('debtor', 15), then('p2_nn_2', 5, 9, 1)],
        preview: `Your mother gave an order and you confirmed it. Every capo you have now knows there are two bosses on Sunday.`,
      },
      {
        text: `Take her aside after coffee. "Ma. You can't do that."`,
        effects: [op('mother', -10), respect(2), then('p2_nn_2', 5, 9, 1)],
        preview: `She listens with her arms folded and says, "Your father let me." You don't know whether that's true.`,
      },
      {
        text: `Tell {capo.first}: only you give orders. Go back and collect.`,
        effects: [op('mother', -20), op('capo', -8), money(400), respect(4), famOp(-6), op('debtor', -15), then('p2_nn_2', 5, 9, 1)],
        preview: `The money comes in. Your mother doesn't come to the next Sunday dinner, and she makes sure everyone knows why.`,
      },
    ],
  },
  {
    id: 'p2_nn_2',
    category: 'family',
    chain: { id: 'p2_nonna', part: 2 },
    trigger: { chainOnly: true },
    roles: { mother: carried('your mother'), wife: famRole('your wife', 'spouse') },
    title: 'Seven Fishes, Two Kitchens',
    body: `It's about the Christmas Eve dinner. It's been about the Christmas Eve dinner for twenty years, but this year it's out in the open.

Your mother has cooked the Feast of the Seven Fishes in her own kitchen since 1931: the baccalà, the smelts, the calamari, the eel your kids won't touch. This year {wife.first} has announced she's doing it, in your house, because your mother's knees are bad and her stove has two working burners. Your mother has announced that {wife.first}'s calamari is like chewing a rubber band, that her gravy comes out of a jar (it does not), and that she never liked the way {wife.first}'s people dress at funerals.

Each of them has told you she won't be the one to give in. Each of them has told you that you'll decide.`,
    options: [
      {
        text: `Christmas Eve at your house. {wife.first} cooks.`,
        effects: [op('wife', 15), op('mother', -15), flag('p2_nn_wife'), then('p2_nn_3', 8, 14, 1)],
        preview: `Your mother arrives at four with three of the fishes in Tupperware "just in case." It's a start.`,
      },
      {
        text: `Christmas Eve at Ma's. Like always.`,
        effects: [op('mother', 15), op('wife', -15), flag('p2_nn_mother'), then('p2_nn_3', 8, 14, 1)],
        preview: `Twenty-six people around two working burners. Your wife washes dishes all night and doesn't say a word.`,
      },
      {
        text: `Make them cook it together. In your kitchen. You'll be at the Ivanhoe.`,
        gate: { trait: 'Charming' },
        effects: [op('mother', 5), op('wife', 5), stress(-2), famOp(5), then('p2_nn_3', 8, 14, 1)],
        preview: `Two women, one stove, four hours. They come out of it allies against you, which is the best possible outcome.`,
      },
    ],
  },
  {
    id: 'p2_nn_3',
    category: 'vice',
    chain: { id: 'p2_nonna', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      mother: carried('your mother'),
      wife: carried('your wife'),
      mannoman: { desc: 'a Manno collector working the old men', pool: 'rival', faction: 'manno', spawn: { first: 'Ralphie', last: 'Venuto', ethnicity: 'Italian', age: [28, 40], traits: ['Greedy'] } },
    },
    title: 'Your Father\'s Little Book',
    body: `You find out from Sister Mary Agnes, of all people, who thanks you after the eleven o'clock Mass for the envelope that comes every month for the school, "from your family, the way it did when your father was alive."

Your mother keeps a little book. Your father's book, actually: fourteen old men from the neighborhood who borrowed from him in the 1940s and never quite finished paying. Forty dollars a week, collected by your mother in person on Thursday afternoons, with a coffee and a pastry at every kitchen table. She has never missed a Thursday in nine years. The money goes to the school, the widows, and the votive candles.

Now {mannoman.name}, one of Manno's people, has heard about the book. He has been visiting the same fourteen old men on Fridays and explaining that the debt has been sold.`,
    options: [
      {
        text: `Send men to explain to {mannoman.first} whose mother he's robbing.`,
        effects: [respect(5), rivOp('manno', -10), heat('local', 3), op('mother', 10), then('p2_nn_4', 30, 60, 1)],
        preview: `He never comes back to Wildwood. Your mother is proud of you, and is careful never to say so.`,
      },
      {
        text: `Ask your mother what she wants done. It's her book.`,
        effects: [op('mother', 20), op('wife', 4), stress(-2), then('p2_nn_4', 30, 60, 1)],
        preview: `She wants the men to stop paying anybody. "It's paid, all of it, ten times over. Your father would want it." She burns the book in the sink.`,
      },
      {
        text: `Take the book over yourself. A family business is a family business.`,
        effects: [money(400), op('mother', -20), famOp(-4), rivOp('manno', -5), then('p2_nn_4', 30, 60, 1)],
        preview: `Your crew collects on Thursdays now, with no coffee and no pastry. Sister Mary Agnes's envelope stops coming.`,
      },
    ],
  },
  {
    id: 'p2_nn_4',
    category: 'family',
    chain: { id: 'p2_nonna', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { mother: carried('your mother'), wife: carried('your wife'), daughter: famRole('your daughter or eldest granddaughter', 'daughter') },
    title: 'The Ring and the Recipe',
    body: `Her heart, Dr. Pugliese says. Weeks, maybe a few months. She is in her own bed on Baker Avenue and she will not go to Burdette Tomlin. "I was born in a bed and I'll die in one."

She has everything arranged. Her funeral is at Our Lady of the Dunes with Father Sarno saying the Italian Mass. The good china goes to your sister. She calls you in alone and tells you what she wants done with the rest: her wedding ring, the one your father bought in 1928 with his first real money; and the recipe for the gravy, which has never been written down and which she says she will say out loud exactly once.

"I want to give them to somebody who'll keep this family together when you can't," she says. "You tell me who."`,
    immediate: [health('mother', -30), stress(8)],
    options: [
      {
        text: `"Give them to {wife.first}."`,
        effects: [op('wife', 25), op('mother', 5), famOp(8), stress(-4)],
        preview: `Your mother holds your wife's hand and says the recipe once, slowly. {wife.first} writes nothing down. She doesn't need to.`,
      },
      {
        text: `"Give them to {daughter.first}. She's the future."`,
        effects: [op('daughter', 25), op('wife', -5), famOp(5)],
        preview: `Your mother skips a generation on purpose. {daughter.first} wears the ring on a chain and becomes the one everyone calls.`,
      },
      {
        text: `"Give them to me, Ma."`,
        effects: [op('mother', -5), famOp(-3), respect(2)],
        preview: `She gives you the ring. She takes the recipe with her. "You never once came into the kitchen," she says. She isn't wrong.`,
      },
      {
        text: `You sided with {wife.first} at Christmas. Your mother asks for her by name.`,
        gate: { flag: 'p2_nn_wife' },
        effects: [op('wife', 30), famOp(12), stress(-8)],
        preview: `"The calamari wasn't so bad," your mother tells your wife, the last week. It is the closest thing to an apology she has ever given anyone.`,
      },
    ],
  },
];

