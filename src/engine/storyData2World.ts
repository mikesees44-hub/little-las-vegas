import type { PackEvent } from './storyDataSchema';
import {
  biz, carried, crewOp, crewRole, evidence, famOp, famRole, favor, feud, flag, health, heat, hook, infl, money, op,
  recruit, respect, rivOp, rivRes, rivalBoss, rivalMan, stress, thenFx as then, townie, unwashed,
} from './storyDataSchema';
import { world } from './storyData2Cast';

/**
 * World dynamics: events that change the board.
 * 25. The Fist Opens          (p2_stk_*)   Carmine Manno has a stroke; Atlantic City's succession
 * 26. The Men From Down Neck  (p2_nwk_*)   a Newark crew sets up on Pacific Avenue
 * 27. The Dorchester Burns    (p2_lot_*)   a hotel burns; the lot is up for grabs
 * 28. Kitchen Strike          (p2_stz_*)   a July hotel-kitchen strike on the island
 * 29. The Office Above the Pharmacy (p2_fbo_*) the FBI opens a Wildwood office
 * 30. The Bridge War          (p2_pwar_*)  a Philadelphia war spills over the bridge
 * 31. The Gaming Question     (p2_cas_*)   1974 and 1976 casino referendums
 * 32. Superseded              (p2_np_*)    the Attorney General supersedes the county prosecutor
 * 33. Racketeer Influenced    (p2_rico_*)  RICO, 1970
 * 34. Run on the Shore Savings (p2_bank_*) a savings-and-loan fails
 */
export const WORLD: PackEvent[] = [
  /* ================================================================ */
  /* 25. THE FIST OPENS                                                */
  /* ================================================================ */
  {
    id: 'p2_stk_1',
    category: 'rivals',
    chain: { id: 'p2_stroke', part: 1 },
    trigger: { rivalAlive: 'manno', minWeek: 70, once: true, mandatory: true, weight: 8 },
    roles: { manno: rivalBoss('manno', 'Carmine "the Fist" Manno') },
    title: 'At the Two-Dollar Window',
    body: `{manno.name} collapses at the two-dollar window at the Atlantic City Race Course in the fourth race on a Saturday, holding a ticket on a horse that comes in second. A stroke. By Sunday night they've got him at Atlantic City Hospital with a priest, three lawyers and eleven men in the lobby who are not visiting the sick.

He'll live, the doctors say. He won't walk well, and right now he can't talk at all.

Atlantic City's whole operation, the Boardwalk, the Northside, the bay docks, the numbers, the clubs on Kentucky Avenue, is suddenly being run by whoever answers the phone first.`,
    immediate: [health('manno', -50), rivRes('manno', { muscle: -2 }), flag('p2_ww_manno_stroke')],
    options: [
      {
        text: `Send flowers. Nothing else, yet.`,
        effects: [rivOp('manno', 6), then('p2_stk_2', 1, 2, 1)],
        preview: `Patience. The vultures in Atlantic City will start on each other first.`,
      },
      {
        text: `Move on Manno's Boardwalk spots in Wildwood while they're looking the other way.`,
        effects: [infl('boardwalk', 6), infl('piers', 4), infl('boardwalk', -6, 'manno'), rivOp('manno', -15), heat('local', 4), then('p2_stk_2', 1, 2, 1)],
        preview: `You take ground this week. Whoever ends up running Atlantic City will remember who took it from a man in a hospital bed.`,
      },
      {
        text: `Call Sal Moretti. Philadelphia will want to decide this.`,
        effects: [rivOp('philly', 6), heat('family', -3), then('p2_stk_2', 1, 2, 1)],
        preview: `You defer to the Table. That buys you their goodwill and costs you any say of your own.`,
      },
    ],
  },
  {
    id: 'p2_stk_2',
    category: 'rivals',
    chain: { id: 'p2_stroke', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      manno: carried('Carmine Manno'),
      theresa: townie('Theresa Manno Graziano, Carmine\'s daughter, who keeps his books', { first: 'Theresa', last: 'Graziano', gender: 'F', ethnicity: 'Italian', age: [32, 40], traits: ['Patient', 'Ambitious'], faction: 'manno' }),
      sonny: rivalMan('manno', 'Sonny, Carmine\'s younger brother', { first: 'Salvatore', nickname: 'Sonny', ethnicity: 'Italian', age: [50, 58], traits: ['Hot-headed', 'Vengeful'] }),
    },
    title: 'Three Claimants and a Hospital Room',
    body: `There are three people who say they speak for Carmine Manno. His brother {sonny.call} says it the loudest, in every bar on Kentucky Avenue. Carmine's underboss, Augie Spada, says it to Philadelphia on the telephone.

The third comes to see you at your restaurant at nine in the morning, alone, in a gray suit, with a briefcase. {theresa.name}, Carmine's daughter. She's kept her father's books since she was nineteen, and she sits by his bed every afternoon and reads his eyes. He can blink. He can squeeze a hand.

"My uncle will start a war he can't win," she says. "Augie will sell us to Philadelphia by Christmas. My husband Lou is a decent man who runs a car dealership, and the men will accept him because he's a man and he's family. I'll run it through him. I need one thing from you: that you don't move on us while I do it." She opens the briefcase: a list of your people's spots in Atlantic City. "And I'll leave all of these alone. In writing, if you like. Though not, obviously, in writing."`,
    options: [
      {
        text: `"You have a deal, Mrs. Graziano."`,
        effects: [op('theresa', 20), rivOp('manno', 10), flag('p2_stk_theresa'), then('p2_stk_3', 3, 5, 1)],
        preview: `Peace with Atlantic City, brokered by a woman nobody else thinks is in the game. If she loses, you backed the wrong side.`,
      },
      {
        text: `Talk to Sonny. A war in Atlantic City is good for Wildwood.`,
        effects: [op('sonny', 15), op('theresa', -20), rivRes('manno', { muscle: -1 }), flag('p2_stk_sonny'), then('p2_stk_3', 3, 5, 1)],
        preview: `You light the fuse. You'd better be far enough away when it goes off.`,
      },
      {
        text: `"I'll wait and see who's standing."`,
        effects: [then('p2_stk_3', 3, 5, 1)],
        preview: `Neutrality. Whoever wins will remember you didn't help.`,
      },
    ],
  },
  {
    id: 'p2_stk_3',
    category: 'rivals',
    chain: { id: 'p2_stroke', part: 3 },
    trigger: { chainOnly: true },
    roles: { theresa: carried('Theresa Graziano'), sonny: carried('Sonny Manno') },
    title: 'A Lincoln Burns on Arctic Avenue',
    body: `{sonny.call}'s Lincoln burns in the parking lot of a bar on Arctic Avenue at three in the morning. Nobody's in it. Two nights later, a numbers bank on the Northside that pays Augie Spada is robbed by men in stocking masks. The Atlantic City papers start using the word "gangland" again.

Tourists don't come to a town that uses the word "gangland." Wildwood's bookings for August go up twelve percent in a week. So does the State Police presence on the Garden State Parkway.

{theresa.first} calls you from a pay phone. "It wasn't me," she says. "It was Augie, trying to make my uncle start something he can't finish. If Sonny goes after Augie, it's open war by Labor Day. If he goes after me, I'll need help I can't pay for in money."`,
    immediate: [heat('federal', 4), rivRes('manno', { muscle: -1, exposure: 10 })],
    options: [
      {
        text: `Send four men to sit outside Theresa's house in Ventnor.`,
        gate: { flag: 'p2_stk_theresa' },
        effects: [op('theresa', 25), op('sonny', -20), crewOp(-2), heat('local', 4), then('p2_stk_4', 3, 5, 1)],
        preview: `Your men protecting Carmine Manno's daughter. Every crew from here to Camden sees which side you're on.`,
      },
      {
        text: `Take the Atlantic City customers who are drifting south. Book them in Wildwood.`,
        effects: [money(2500), infl('pacific', 4), rivOp('manno', -5), then('p2_stk_4', 3, 5, 1)],
        preview: `War in Atlantic City is good for business on Pacific Avenue. That's a cold thing to know.`,
      },
      {
        text: `Ask Sal to call a sit-down before anybody else dies.`,
        effects: [rivOp('philly', 6), respect(4), then('p2_stk_4', 2, 4, 1)],
        preview: `The Table will choose, and you'll have helped them do it.`,
      },
    ],
  },
  {
    id: 'p2_stk_4',
    category: 'table',
    chain: { id: 'p2_stroke', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { theresa: carried('Theresa Graziano'), sonny: carried('Sonny Manno'), sal: rivalBoss('philly', 'Sal Moretti') },
    title: 'Recognition',
    body: `The Table meets in a farmhouse in Hammonton among blueberry fields, because nobody can be seen meeting anywhere else. {sal.name} speaks for the old man in Philadelphia. Atlantic City needs a boss the Table will recognize, or there'll be no Atlantic City left to recognize.

Three names: {sonny.call}, the brother. Augie Spada, the underboss. Lou Graziano, the son-in-law, who has never been in a room like this one and keeps adjusting his tie, while his wife waits in the car.

Sal turns to you. "You're the closest. You've got the most to lose. Who?"`,
    options: [
      {
        text: `"Lou Graziano." Everyone at the table knows who you're really naming.`,
        effects: [rivOp('manno', 15), op('theresa', 25), flag('p2_stk_puppet'), rivRes('manno', { money: 2000 }), then('p2_stk_5', 6, 12, 1)],
        preview: `A car dealer in the chair, his wife behind it. Atlantic City quiets down. Whether it stays friendly depends on her.`,
      },
      {
        text: `"Augie Spada." Philadelphia's man, Philadelphia's peace.`,
        effects: [rivOp('philly', 10), rivOp('manno', 5), op('theresa', -20), op('sonny', -10), then('p2_stk_5', 6, 12, 1)],
        preview: `Atlantic City becomes a Philadelphia branch office. Order returns. Your most dangerous neighbor now takes orders from the same men you do.`,
      },
      {
        text: `"Sonny. It's his blood."`,
        effects: [op('sonny', 25), op('theresa', -25), rivOp('manno', 8), rivRes('manno', { muscle: 2 }), then('p2_stk_5', 6, 12, 1)],
        preview: `A hothead in charge of the shore's biggest crew, owing you his chair. Hotheads don't stay grateful.`,
      },
    ],
  },
  {
    id: 'p2_stk_5',
    category: 'rivals',
    chain: { id: 'p2_stroke', part: 5 },
    trigger: { chainOnly: true },
    roles: { manno: carried('Carmine Manno'), theresa: carried('Theresa Graziano'), sonny: carried('Sonny Manno') },
    title: 'The Old Man Squeezes a Hand',
    body: `{manno.first} Manno is home in his house in Ventnor, in a wheelchair by the window that looks at the ocean. He can say a few words now. He's asked to see you.

His daughter wheels him to the door of the sunroom and leaves you alone. The Fist's right hand doesn't work. With his left, he takes yours and holds it, hard, for a long time. "Thank you," he says. Or maybe, "Watch her." It's difficult to tell.

Outside, {sonny.call} is sitting in his new Lincoln at the curb, not looking at the house.`,
    options: [
      {
        text: `Go to Mass with Theresa on Sunday. Be seen.`,
        gate: { flag: 'p2_stk_puppet' },
        effects: [rivOp('manno', 15), op('theresa', 15), infl('docks', 4), respect(4)],
        preview: `Wildwood and Atlantic City, kneeling together at St. Michael's. The quietest five years the shore has ever had.`,
      },
      {
        text: `Stop at Sonny's car on the way out.`,
        effects: [op('sonny', 10), op('theresa', -10), stress(3)],
        preview: `He wants to know if you'll back him if he ever moves on his niece. You say you'll think about it, which is an answer.`,
      },
      {
        text: `Tell the old man the truth: you did it for Wildwood.`,
        effects: [op('manno', 10), respect(2), stress(-2)],
        preview: `He laughs, or makes the sound that's left of a laugh. That's the first thing you've ever agreed on.`,
      },
    ],
  },

  /* ================================================================ */
  /* 26. THE MEN FROM DOWN NECK                                        */
  /* ================================================================ */
  {
    id: 'p2_nwk_1',
    category: 'rivals',
    chain: { id: 'p2_newark', part: 1 },
    trigger: { season: 'summer', minWeek: 50, once: true, weight: 12 },
    roles: {
      newark: townie('Tommy Ventimiglia, called "Two Ties," a Newark bookmaker', { first: 'Thomas', last: 'Ventimiglia', nickname: 'Two Ties', ethnicity: 'Italian', age: [38, 48], traits: ['Ambitious', 'Charming'], faction: 'none' }),
    },
    title: 'Room 112 at the Driftwood',
    body: `They rented six rooms at the Driftwood Motel on Pacific Avenue for the whole summer and paid cash in advance. By the second week, Room 112 has four telephones, a wire service ticker and a blackboard with the day's baseball lines. Their runners work the beach in Bermuda shorts.

The man in charge is {newark.call} {newark.last}, from Newark's Down Neck section, who wears two neckties at once, one under the other, as a joke nobody understands. He's connected to people in North Jersey who are connected to people in New York.

"It's a free country," he says, when your man asks him what he thinks he's doing. "And it's a big ocean."`,
    immediate: [infl('pacific', -3), flag('p2_ww_newark_crew')],
    options: [
      {
        text: `Let Philadelphia know. It's their problem as much as yours.`,
        effects: [rivOp('philly', 4), then('p2_nwk_2', 2, 3, 1)],
        preview: `The Table hates outsiders. They'll also want to see what you can do on your own.`,
      },
      {
        text: `Send a few men to the Driftwood. Explain the ocean.`,
        effects: [respect(4), heat('local', 5), op('newark', -15), then('p2_nwk_2', 2, 3, 1)],
        preview: `A message delivered. Newark men are not famous for listening to messages.`,
      },
      {
        text: `Invite Two Ties to dinner. Find out who sent him.`,
        effects: [op('newark', 10), money(-100), then('p2_nwk_2', 2, 3, 1)],
        preview: `Information first. A bookmaker who eats your food is a bookmaker who might talk.`,
      },
    ],
  },
  {
    id: 'p2_nwk_2',
    category: 'vice',
    chain: { id: 'p2_newark', part: 2 },
    trigger: { chainOnly: true },
    roles: { newark: carried('Two Ties'), sal: rivalBoss('philly', 'Sal Moretti') },
    title: 'The Wire',
    body: `Two Ties's wire service has the results from every track on the East Coast forty seconds before anyone else's. That's forty seconds of past-posting: bets taken after a race is already decided. Your bookmakers have been taking a beating all July without knowing why.

{sal.name} sends a message through your bagman. The Table doesn't want a war with North Jersey; North Jersey has New York behind it. "Handle it quietly," Sal says. "And if you can't, handle it loud enough that nobody blames us."

Meanwhile, Two Ties has hired three of your runners at double your rate.`,
    immediate: [money(-1800)],
    options: [
      {
        text: `Cut the Driftwood's phone lines. A storm, a pole, an accident.`,
        effects: [money(-300), op('newark', -10), heat('local', 2), then('p2_nwk_3', 3, 5, 1)],
        preview: `Room 112 goes dark for a week. Two Ties smiles and calls the phone company, and somebody else.`,
      },
      {
        text: `Match their rate and take your runners back.`,
        effects: [money(-1200), crewOp(4), then('p2_nwk_3', 3, 5, 1)],
        preview: `Expensive loyalty. It's still loyalty.`,
      },
      {
        text: `Buy into the wire. Forty seconds is forty seconds.`,
        gate: { trait: 'Greedy' },
        effects: [money(2500), heat('federal', 4), rivOp('philly', -6), op('newark', 15), then('p2_nwk_3', 3, 5, 1)],
        preview: `You make money on the past-posting instead of losing it. Philadelphia notices who you're partners with.`,
      },
    ],
  },
  {
    id: 'p2_nwk_3',
    category: 'rivals',
    chain: { id: 'p2_newark', part: 3 },
    trigger: { chainOnly: true },
    roles: { newark: carried('Two Ties') },
    title: 'An Offer in Two Neckties',
    body: `Two Ties asks for a meeting at Crabby Wendt's on the bay, among the steamed crabs and the newspaper tablecloths, and makes his pitch with Old Bay on his fingers.

"Philadelphia's old," he says. "The old man down there doesn't want trouble with anybody, and his capos are starting to call that weakness. My people in North Jersey are younger and hungrier. When Philly goes soft, and it will, the shore's up for grabs. We'd like a friend on this island when that happens. A partner. Your territory, our wire, our protection, and nobody's tax but your own."

He cracks a claw. "Think about it. I'll be here till Labor Day."`,
    options: [
      {
        text: `Say yes. Quietly.`,
        effects: [rivOp('philly', -10), op('newark', 20), flag('p2_nwk_ally'), heat('family', 8), then('p2_nwk_4', 4, 8, 1)],
        preview: `A secret alliance with North Jersey against your own Table. If Sal finds out, it's the end.`,
      },
      {
        text: `Say no, and tell Sal what Two Ties said.`,
        effects: [rivOp('philly', 12), op('newark', -20), respect(3), then('p2_nwk_4', 4, 8, 1)],
        preview: `Loyalty, reported. Philadelphia will help you run him out. Newark will remember who talked.`,
      },
      {
        text: `Say maybe. Let him keep paying for the crabs.`,
        gate: { trait: 'Patient' },
        effects: [op('newark', 5), hook('newark', 'He told you North Jersey\'s plans for the shore'), then('p2_nwk_4', 4, 8, 1)],
        preview: `You learn everything he's willing to say and promise nothing. That only works for a while.`,
      },
    ],
  },
  {
    id: 'p2_nwk_4',
    category: 'rivals',
    chain: { id: 'p2_newark', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { newark: carried('Two Ties'), sal: rivalBoss('philly', 'Sal Moretti') },
    title: 'Labor Day at the Driftwood',
    body: `It ends on Labor Day weekend, as everything on this island does.

The State Police raid Room 112 at the Driftwood at noon on the Saturday: twelve phones, the ticker, the blackboard, six men in Bermuda shorts. Or they don't, and the Driftwood's owner simply finds the rooms empty on Tuesday with the rent paid through September and a note on the bureau: "See you next year. T.T."

Either way, Newark knows Wildwood now. And Wildwood knows Newark.`,
    options: [
      {
        text: `Make it the raid. Give the troopers the room number.`,
        effects: [op('newark', -25), heat('local', -4), rivOp('philly', 6), infl('pacific', 4), feud('philly'), flag('p2_nwk_raided')],
        preview: `Two Ties does ninety days in Cape May County jail and swears he'll be back. North Jersey adds your name to a list.`,
      },
      {
        text: `Let him go home. Next summer is next summer.`,
        effects: [infl('pacific', 2), stress(3)],
        preview: `He'll be back, probably with more phones.`,
      },
      {
        text: `Keep the arrangement going all winter through his cousin in Bayonne.`,
        gate: { flag: 'p2_nwk_ally' },
        effects: [money(3000), heat('family', 6), rivOp('philly', -8), infl('pacific', 3)],
        preview: `A North Jersey wire on your island all year round. It's very good money, and it's a rope.`,
      },
    ],
  },

  /* ================================================================ */
  /* 27. THE DORCHESTER BURNS                                          */
  /* ================================================================ */
  {
    id: 'p2_lot_1',
    category: 'town',
    chain: { id: 'p2_lot', part: 1 },
    trigger: { months: [1, 2], minWeek: 30, once: true, mandatory: true },
    roles: {},
    title: 'The Dorchester Burns',
    body: `The Hotel Dorchester was built in 1912: four stories of white clapboard and green shutters on Ocean Avenue, with a wraparound porch where Philadelphia families sat in rocking chairs every summer for fifty years. It's closed for the winter, empty except for a caretaker who lives in the cottage out back.

It burns on a Tuesday night in January, in a northeast wind, in about forty minutes. Every company on the island turns out. Nobody is hurt; the caretaker gets out in his pajamas with his cat. By dawn there's nothing left but three brick chimneys and the smell of wet ash all the way to Pacific Avenue.

By noon, three people have called you to ask what you're going to do with the lot.`,
    immediate: [flag('p2_ww_dorchester_lot')],
    options: [
      {
        text: `Send coffee and sandwiches to the firehouses. Then think.`,
        effects: [money(-200), respect(3), infl('{district}', 2), then('p2_lot_2', 2, 3, 1)],
        preview: `The firemen remember who fed them at four in the morning.`,
      },
      {
        text: `Call the owner's lawyer today. Make the first offer.`,
        effects: [money(-500), then('p2_lot_2', 2, 3, 1)],
        preview: `First in line. Being first in line after a fire makes people ask questions.`,
      },
      {
        text: `Find out who the Dorchester's owner owed money to.`,
        effects: [money(-150), flag('p2_lot_asked'), then('p2_lot_2', 2, 3, 1)],
        preview: `A hotel that's losing money doesn't usually burn by accident.`,
      },
    ],
  },
  {
    id: 'p2_lot_2',
    category: 'law',
    chain: { id: 'p2_lot', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      ellen: world('fire_ellen_garrison', 'Ellen Garrison, investigator for the underwriters\' arson bureau, a former Navy WAVE', { first: 'Ellen', last: 'Garrison', gender: 'F', age: [36, 46], traits: ['Honest', 'Patient'] }),
      torch: crewRole('one of your men who was seen on Ocean Avenue that night', { rank: ['soldier', 'associate'] }),
    },
    title: 'A Claim She Flags Never Pays',
    body: `{ellen.name} investigates fires for the insurance companies. She was a WAVE during the war, she wears flat shoes and a man's wristwatch, and a claim she flags never pays.

She's flagged the Dorchester. Kerosene in the basement, she says, and a window broken from the outside. The owner, a Philadelphian, had a $90,000 policy on a hotel nobody would buy for forty.

She comes to see you because a milkman saw {torch.call} on Ocean Avenue at one in the morning. "I don't think your man set it," she says. "I think he saw who did. I think somebody's going to try to hang it on him because of who he works for. I'd like to talk to him before that happens."`,
    options: [
      {
        text: `Let her talk to {torch.first}. With your lawyer in the room.`,
        effects: [op('ellen', 15), op('torch', -5), money(-300), flag('p2_lot_truth'), then('p2_lot_3', 3, 5, 1)],
        preview: `{torch.first} saw a car: a green DeSoto with Pennsylvania plates. Ellen Garrison now owes you a straight answer someday.`,
      },
      {
        text: `"My man was home in bed."`,
        effects: [op('ellen', -10), evidence('torch', 6), then('p2_lot_3', 3, 5, 1)],
        preview: `She writes that down. She also writes down that you said it before she asked.`,
      },
      {
        text: `Find the man in the DeSoto yourself first.`,
        effects: [money(-400), hook('torch', 'He saw the arsonist and told you first'), heat('local', 3), flag('p2_lot_torch_found'), then('p2_lot_3', 3, 5, 1)],
        preview: `A professional torch from Kensington, paid by the owner. Knowing that is worth something to somebody.`,
      },
    ],
  },
  {
    id: 'p2_lot_3',
    category: 'politics',
    chain: { id: 'p2_lot', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      ellen: carried('Ellen Garrison'),
      donnelly: world('game:francis_donnelly', 'Francis Donnelly of Donnelly Construction', { first: 'Francis', last: 'Donnelly', ethnicity: 'Irish', age: [50, 62], traits: ['Greedy'] }),
      kessler: rivalBoss('kessler', 'Danny Kessler'),
    },
    title: 'Three Bids for a Burned Lot',
    body: `The insurance company won't pay, so the Dorchester's owner has to sell the lot. Three bids.

{donnelly.name} wants to put up a six-story motel with a heated pool and a neon sign, union labor, the works. {kessler.name}, through a cousin, wants a nightclub with a liquor license the commission would have to create. And the Crest's Pat Keane, of all people, is circulating a petition for the city to buy it and make it a park with a bandshell, and she has eleven hundred signatures.

The lot's worth whatever the man with the best story is willing to pay. Right now that's you.`,
    options: [
      {
        text: `Outbid them all. Build a motel of your own.`,
        gate: { money: 9000 },
        effects: [money(-9000), unwashed(-5000), op('donnelly', -15), rivOp('kessler', -6), flag('p2_lot_motel'), then('p2_lot_4', 20, 30, 1)],
        preview: `Sixty rooms on Ocean Avenue with your money in the foundation. It opens in eighteen months.`,
      },
      {
        text: `Go in with Donnelly. Your money, his name, his union.`,
        gate: { money: 5000 },
        effects: [money(-5000), op('donnelly', 15), hook('donnelly', 'You\'re his silent partner on the Dorchester lot'), flag('p2_lot_partner'), then('p2_lot_4', 20, 30, 1)],
        preview: `Half a motel, no paperwork with your name, and a construction man who owes you. Construction men have their own friends.`,
      },
      {
        text: `Back the park. Make the city buy it.`,
        effects: [favor(-1), respect(6), infl('{district}', 5), rivOp('kessler', -4), flag('p2_lot_park'), then('p2_lot_4', 20, 30, 1)],
        preview: `A bandshell on Ocean Avenue named for nobody. The whole island knows who made it happen.`,
      },
    ],
  },
  {
    id: 'p2_lot_4',
    category: 'season',
    chain: { id: 'p2_lot', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { ellen: carried('Ellen Garrison') },
    title: 'What Rose Where the Dorchester Stood',
    body: `Eighteen months after the fire, something new stands on Ocean Avenue where the rocking chairs used to be.

Ellen Garrison drives down from Philadelphia for the opening, in her flat shoes, and stands at the edge of the crowd. The Dorchester's old owner was indicted for insurance fraud in March, along with a man from Kensington who drives a green DeSoto. The jury took four hours.

"I said I'd give you a straight answer someday," she says when she finds you. "Here it is. Whatever you built here, you didn't burn the old one down to get it. That's more than I can say about most people who build on burned lots."`,
    options: [
      {
        text: `Cut the ribbon on the motel.`,
        gate: { flag: 'p2_lot_motel' },
        effects: [biz('add', 'motel', '{district}'), money(1500), respect(4), op('ellen', 5)],
        preview: `Sixty rooms with a neon sign of a leaping dolphin. It's booked solid by July.`,
      },
      {
        text: `Stand at the back while Donnelly cuts the ribbon.`,
        gate: { flag: 'p2_lot_partner' },
        effects: [biz('add', 'motel', '{district}'), money(800), unwashed(-2000), op('ellen', 5)],
        preview: `Half the profits of a motel with your name nowhere on it. Donnelly smiles in the newspaper photograph.`,
      },
      {
        text: `Listen to the first concert at the bandshell.`,
        gate: { flag: 'p2_lot_park' },
        effects: [respect(6), famOp(5), infl('{district}', 4), op('ellen', 10), stress(-4)],
        preview: `A Sousa march, folding chairs and four hundred people on a summer night. Your grandchildren will play there.`,
      },
      {
        text: `Thank Mrs. Garrison and buy her a drink.`,
        effects: [op('ellen', 10), money(-10)],
        preview: `A ginger ale. She doesn't drink on duty, and she's always on duty.`,
      },
    ],
  },

  /* ================================================================ */
  /* 28. KITCHEN STRIKE                                                */
  /* ================================================================ */
  {
    id: 'p2_stz_1',
    category: 'town',
    chain: { id: 'p2_strike', part: 1 },
    trigger: { months: [6, 7], minWeek: 50, hasBusiness: 'restaurant', once: true, weight: 13 },
    roles: {
      lucinda: world('civ_lucinda_pettiford', 'Lucinda Pettiford, who organizes the Black kitchen workers and chambermaids', { first: 'Lucinda', last: 'Pettiford', gender: 'F', age: [34, 46], traits: ['Honest', 'Patient'] }),
      russo: world('civ_marty_russo', 'Marty Russo, president of the hotel and restaurant workers\' local', { first: 'Martin', last: 'Russo', nickname: 'Marty', ethnicity: 'Italian', age: [45, 58], traits: ['Greedy', 'Charming'] }),
    },
    title: 'The Fourth of July Walkout',
    body: `On the Thursday before the Fourth of July, every dishwasher, cook, busboy and chambermaid in eleven hotels and nineteen restaurants on the island takes off their apron and walks out. {russo.name}'s local called the strike. {lucinda.name} made it work.

Lucinda organizes the Black kitchen workers and chambermaids, who make thirty cents an hour less than white workers for the same job, sleep in the worst rooms and eat after the guests. Without them, nothing on the island gets washed, cooked or turned down.

Your restaurant has a line out the door and nobody to wash a fork. Danny Kessler is offering to truck in "replacement workers" from Philadelphia at a dollar a head per day.`,
    immediate: [money(-1500), flag('p2_ww_strike')],
    options: [
      {
        text: `Close the restaurant for the strike. Don't cross a picket line.`,
        effects: [money(-1500), op('lucinda', 15), op('russo', 10), respect(2), then('p2_stz_2', 1, 2, 1)],
        preview: `A dark kitchen on the biggest weekend of the year. The people on the line notice whose kitchen it is.`,
      },
      {
        text: `Take Kessler's replacement workers.`,
        effects: [money(1000), op('lucinda', -25), op('russo', -15), rivOp('kessler', 5), heat('local', 4), then('p2_stz_2', 1, 2, 1)],
        preview: `You stay open. You're on the other side of the line now, with Kessler.`,
      },
      {
        text: `Ask Lucinda to come talk in your empty kitchen.`,
        effects: [op('lucinda', 8), then('p2_stz_2', 1, 2, 1)],
        preview: `She'll come. She'll want to know what you're offering before she sits down.`,
      },
    ],
  },
  {
    id: 'p2_stz_2',
    category: 'politics',
    chain: { id: 'p2_strike', part: 2 },
    trigger: { chainOnly: true },
    roles: { lucinda: carried('Lucinda Pettiford'), russo: carried('Marty Russo') },
    title: 'Marty\'s Side Deal',
    body: `Marty Russo calls you at home on the second night. He has a deal: the hotel association will give the local a ten-cent raise across the board and a new pension contribution, which Marty's brother-in-law's insurance company will administer. Everybody goes back to work Monday.

The thirty-cent difference between Black and white workers stays exactly where it is. "Lucinda's people will take what they get," Marty says. "They always do. Help me sell it to the association and there's an envelope for you out of the pension."

Lucinda comes to your kitchen door the next morning. She already knows. "Marty's going to sell us out," she says. "He's done it before. Last time, eleven of my people got fired for walking out, and he never said a word. I'm not asking you to be a saint. I'm asking you which side of the door you're standing on."`,
    options: [
      {
        text: `Back Lucinda: same pay for the same work, or no deal.`,
        effects: [op('lucinda', 25), op('russo', -20), money(-800), infl('{district}', 4), flag('p2_stz_equal'), then('p2_stz_3', 1, 2, 1)],
        preview: `The strike goes another week. The hotel association hates you. The back door of every kitchen on the island opens for you.`,
      },
      {
        text: `Take Marty's envelope. Sell the deal.`,
        effects: [money(1500), op('russo', 20), op('lucinda', -30), hook('russo', 'He skimmed the pension deal with you'), then('p2_stz_3', 1, 2, 1)],
        preview: `Everybody's back Monday. Lucinda's people go back to the worst rooms and remember who stood where.`,
      },
      {
        text: `Tell the hotel association you'll make up the difference at your own places, and let them do what they want.`,
        effects: [money(-600), op('lucinda', 12), op('russo', -5), respect(2), then('p2_stz_3', 1, 2, 1)],
        preview: `Equal pay in your kitchens and nowhere else. It's a start, and it makes the other owners look bad.`,
      },
    ],
  },
  {
    id: 'p2_stz_3',
    category: 'rivals',
    chain: { id: 'p2_strike', part: 3 },
    trigger: { chainOnly: true },
    roles: { lucinda: carried('Lucinda Pettiford'), kessler: rivalBoss('kessler', 'Danny Kessler') },
    title: 'The Trucks on the Causeway',
    body: `Kessler's trucks come over the Rio Grande causeway at five in the morning with forty replacement workers from Philadelphia in the back. The picket line is waiting at the foot of the bridge: three hundred people in aprons, Lucinda at the front with her church hat on.

Someone throws a bottle. Someone else swings a picket sign. A truck window shatters. The Wildwood police arrive and stand around with their thumbs in their belts, waiting to see who they're supposed to arrest.

{kessler.name}'s man is on the running board of the first truck. Lucinda hasn't moved.`,
    options: [
      {
        text: `Send your men to stand on the picket line. Nobody's crossing.`,
        effects: [rivOp('kessler', -15), op('lucinda', 20), heat('local', 6), respect(5), crewOp(-2), then('p2_stz_4', 1, 2, 1)],
        preview: `Mob muscle on a union line. The trucks turn around. The newspapers can't decide who the villain is.`,
      },
      {
        text: `Call the chief. Get the police between them, now.`,
        effects: [favor(-1), heat('local', -2), op('lucinda', 8), then('p2_stz_4', 1, 2, 1)],
        preview: `Nobody's badly hurt. The trucks sit at the foot of the bridge all day in the sun, going nowhere.`,
      },
      {
        text: `Stay out of it.`,
        effects: [op('lucinda', -10), then('p2_stz_4', 1, 2, 1)],
        preview: `Whatever happens at the causeway happens without you.`,
      },
    ],
  },
  {
    id: 'p2_stz_4',
    category: 'town',
    chain: { id: 'p2_strike', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { lucinda: carried('Lucinda Pettiford'), russo: carried('Marty Russo') },
    title: 'Back to Work',
    body: `It ends on the ninth day, after the State's labor mediator drives down from Trenton in a Plymouth with no air conditioning and locks everyone in a room at the Admiral.

The settlement is printed in the Leader on a Friday. You read it at your restaurant counter while the dishwashers, back at last, sing in the kitchen.

Lucinda Pettiford comes in through the back door at closing time, the way the help always comes in. Then she walks through the swinging door into the dining room, sits at the counter, and orders a cup of coffee. Your waitress looks at you.`,
    options: [
      {
        text: `Pour it yourself. On the house.`,
        gate: { flag: 'p2_stz_equal' },
        effects: [op('lucinda', 20), respect(4), infl('{district}', 4), heat('local', -2)],
        preview: `The equal-pay clause is in the contract, because you held out. Every kitchen on the island is a place where you have friends.`,
      },
      {
        text: `Nod to the waitress. Pour it.`,
        effects: [op('lucinda', 8), respect(1)],
        preview: `She drinks it slowly, pays for it, tips well and leaves by the front door.`,
      },
      {
        text: `Ask Lucinda if she'd like a job: managing your restaurant's kitchen and staff.`,
        effects: [op('lucinda', 15), money(-300), recruit('lucinda', 'associate'), op('russo', -5)],
        preview: `The best organizer on the island runs your back of house now. Marty Russo's local loses its most dangerous member to you.`,
      },
    ],
  },

  /* ================================================================ */
  /* 29. THE OFFICE ABOVE THE PHARMACY                                 */
  /* ================================================================ */
  {
    id: 'p2_fbo_1',
    category: 'law',
    chain: { id: 'p2_fbo', part: 1 },
    trigger: { minWeek: 90, heatAbove: { federal: 30 }, once: true, mandatory: true },
    roles: {
      agent: world('cop_william_donnelly', 'Billy Donnelly, FBI special agent', { first: 'William', last: 'Donnelly', nickname: 'Billy', ethnicity: 'Irish', age: [28, 36], traits: ['Honest', 'Ambitious'] }, 'FBI special agent'),
      landlady: townie('Mrs. Rose Gennaro, the pharmacist\'s widow who owns the building', { first: 'Rose', last: 'Gennaro', gender: 'F', ethnicity: 'Italian', age: [55, 66], traits: ['Greedy', 'Patient'], faction: 'none' }),
    },
    title: 'Venetian Blinds Across the Street',
    body: `The second floor above Gennaro's Pharmacy on Pacific Avenue, directly across from your restaurant, has been empty since the dentist retired. Now it has new Venetian blinds, a telephone line, a frosted-glass door with no name on it and three young men in gray suits who come and go at odd hours and buy a lot of Bromo-Seltzer.

The Federal Bureau of Investigation has opened a Wildwood office. Its senior man is {agent.name}, who is twenty-nine and has a crew cut and a brother at the Bureau and an uncle in the construction business.

{landlady.name} owns the building. She comes into your restaurant for her usual cup of tea and says, without looking up, "They pay twice what the dentist paid. Cash in advance. I'm a widow. What was I supposed to do?"`,
    immediate: [heat('federal', 6), flag('p2_ww_fbi_office')],
    options: [
      {
        text: `"Nothing, Mrs. Gennaro. You did the right thing."`,
        effects: [op('landlady', 10), then('p2_fbo_2', 4, 8, 1)],
        preview: `She'll tell you what she sees. Widows in this town see everything.`,
      },
      {
        text: `Offer her three times the dentist's rent to break the lease.`,
        gate: { money: 1500 },
        effects: [money(-1500), op('landlady', 5), heat('federal', 3), then('p2_fbo_2', 4, 8, 1)],
        preview: `She thinks about it. She tells the young men about your offer, because she's not a fool. They stay.`,
      },
      {
        text: `Close the blinds on your side of the street and take your meetings somewhere else.`,
        effects: [money(-400), evidence('player', -3), stress(3), then('p2_fbo_2', 4, 8, 1)],
        preview: `The restaurant becomes just a restaurant. That's inconvenient. It's also smart.`,
      },
    ],
  },
  {
    id: 'p2_fbo_2',
    category: 'law',
    chain: { id: 'p2_fbo', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      agent: carried('Agent Donnelly'),
      landlady: carried('Mrs. Gennaro'),
      tech: world('cop_richard_kendall', 'Richard Kendall, the FBI\'s technical man (microphones)', { first: 'Richard', last: 'Kendall', age: [34, 44], traits: ['Patient'] }),
    },
    title: 'The Telephone Repairman',
    body: `A telephone repairman spent forty minutes in your restaurant's back office on Tuesday, fixing a line that wasn't broken. Your waitress let him in. He had a Bell Telephone truck and a clipboard.

Mrs. Gennaro, over her tea, mentions that a man with the same clipboard went up her stairs that afternoon with a heavy toolbox and came down without it. "His name is Kendall," she says. "He buys cough drops. Horehound."

If there's a microphone in your back office, the last three weeks of conversations are in a government file. If there isn't, then you're starting to see microphones in the cough drops.`,
    options: [
      {
        text: `Hire a man from Philadelphia to sweep the office.`,
        gate: { money: 800 },
        effects: [money(-800), evidence('player', -5), flag('p2_fbo_found'), then('p2_fbo_3', 3, 5, 1)],
        preview: `He finds it in the base of the desk lamp. Now you know. Now you choose what to do with knowing.`,
      },
      {
        text: `Assume it's there. From now on, business is done on walks on the Boardwalk.`,
        effects: [evidence('player', -3), stress(4), money(-200), then('p2_fbo_3', 3, 5, 1)],
        preview: `Walk-and-talks in the salt air. It's healthy, it's paranoid and it's inconvenient in February.`,
      },
      {
        text: `Leave it and say nothing.`,
        effects: [evidence('player', 6), then('p2_fbo_3', 3, 5, 1)],
        preview: `Maybe there's nothing there. Maybe there is.`,
      },
    ],
  },
  {
    id: 'p2_fbo_3',
    category: 'law',
    chain: { id: 'p2_fbo', part: 3 },
    trigger: { chainOnly: true },
    roles: { agent: carried('Agent Donnelly'), landlady: carried('Mrs. Gennaro') },
    title: 'Feed the Lamp',
    body: `A microphone is a two-way street. Whatever goes into it gets typed up in Newark, believed, and acted on.

Your consigliere has an idea. He wants to stage a conversation in your back office, in front of the lamp, about a big shipment coming into the bay docks on a Thursday night. It would be Kessler's shipment. Or Manno's. Or nobody's, just to watch twenty federal agents stand on a dock in the rain.

Meanwhile Mrs. Gennaro has stopped coming in for tea. Agent Donnelly has been seen helping her carry her groceries.`,
    options: [
      {
        text: `Feed the lamp Kessler's Thursday.`,
        gate: { flag: 'p2_fbo_found' },
        effects: [rivRes('kessler', { exposure: 20 }), rivOp('kessler', -8), heat('federal', -4), then('p2_fbo_4', 6, 10, 1)],
        preview: `Agents on Kessler's dock on Thursday night. He'll spend months wondering who on his own crew talks.`,
      },
      {
        text: `Feed it nothing at all. Let them listen to you order lunch.`,
        effects: [evidence('player', -4), then('p2_fbo_4', 6, 10, 1)],
        preview: `Six months of transcripts about veal piccata. Someone in Newark will start to wonder.`,
      },
      {
        text: `Pull the microphone out and mail it to the office across the street.`,
        gate: { flag: 'p2_fbo_found' },
        effects: [respect(6), heat('federal', 6), op('agent', -10), then('p2_fbo_4', 6, 10, 1)],
        preview: `Wrapped in brown paper, postage due. The whole island hears about it. So does Washington.`,
      },
    ],
  },
  {
    id: 'p2_fbo_4',
    category: 'law',
    chain: { id: 'p2_fbo', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { agent: carried('Agent Donnelly'), landlady: carried('Mrs. Gennaro') },
    title: 'Mrs. Gennaro\'s Terms',
    body: `Rose Gennaro asks you to come up to her apartment over the pharmacy, which is next door to the office with the frosted glass. She serves you anisette in a cut-glass glass that belonged to her husband.

"The young man, Billy Donnelly, asked me to testify," she says. "About who comes and goes from your restaurant. He was very polite. His mother raised him well." She sips. "I told him I'd think about it. I'm telling you I'm thinking about it.

"My husband's pharmacy owes eleven thousand dollars to a wholesaler in Camden, and the wholesaler is going to take it in the spring. I'd like to keep my husband's store. I don't much care who helps me."`,
    options: [
      {
        text: `Pay off the wholesaler. Ask for nothing.`,
        gate: { money: 4000 },
        effects: [money(-4000), op('landlady', 30), op('agent', -5), evidence('player', -8)],
        preview: `She keeps the pharmacy. She tells Agent Donnelly her eyesight isn't what it used to be.`,
      },
      {
        text: `"Testify if you want, Rose. I won't stop you."`,
        effects: [op('landlady', 10), evidence('player', 6), respect(2)],
        preview: `She doesn't, in the end. She doesn't tell you why. It might be you; it might be her husband's anisette.`,
      },
      {
        text: `Buy the building out from under the FBI's lease.`,
        gate: { money: 9000 },
        effects: [money(-9000), unwashed(-6000), biz('add', 'stand', 'pacific'), op('landlady', 15), heat('federal', 8), op('agent', -15)],
        preview: `You own the building the FBI rents. When their lease ends in June, it isn't renewed. They take an office in Rio Grande, angry.`,
      },
    ],
  },

  /* ================================================================ */
  /* 30. THE BRIDGE WAR                                                */
  /* ================================================================ */
  {
    id: 'p2_pwar_1',
    category: 'table',
    chain: { id: 'p2_pwar', part: 1 },
    trigger: { rivalAlive: 'philly', minWeek: 120, once: true, mandatory: true },
    roles: {
      sal: rivalBoss('philly', 'Sal Moretti'),
      refugee: rivalMan('philly', 'Johnny Pugliano, a Philadelphia capo on the run from his own side', { first: 'John', last: 'Pugliano', nickname: 'Johnny Pugs', ethnicity: 'Italian', age: [44, 54], traits: ['Paranoid'] }),
    },
    title: 'Shots on Christian Street',
    body: `A Table capo is shot to death in a butcher shop on Christian Street on a Tuesday morning, in front of a case of veal cutlets. By Wednesday everyone knows why: the young captains in South Philadelphia think the old man is too soft, too careful, too old, and they've decided to start proving it one butcher shop at a time.

{sal.name} calls you that night. He sounds older than you've ever heard him. "I need four men. Good ones. For a month." He doesn't say what for.

The next morning, {refugee.call}, one of the young captains' targets, is sitting in a booth at the Marlin's coffee shop in sunglasses with a suitcase, asking for you.`,
    immediate: [heat('federal', 5), flag('p2_ww_philly_war')],
    options: [
      {
        text: `Send Sal his four men.`,
        effects: [crewOp(-4), rivOp('philly', 12), heat('family', 4), then('p2_pwar_2', 2, 3, 1)],
        preview: `You're in Philadelphia's war now, on the old man's side. Four of your men are going to see things.`,
      },
      {
        text: `Tell Sal you need your men at home. Wildwood stays out of it.`,
        effects: [rivOp('philly', -10), respect(2), then('p2_pwar_2', 2, 3, 1)],
        preview: `Neutral. Philadelphia will remember who helped when this is over, whoever wins.`,
      },
      {
        text: `Put Johnny Pugs in a room at the Marlin and find out what he knows.`,
        effects: [op('refugee', 15), heat('family', 6), flag('p2_pwar_hiding'), then('p2_pwar_2', 2, 3, 1)],
        preview: `A hunted man under your roof, full of Philadelphia's secrets. Both sides will want him.`,
      },
    ],
  },
  {
    id: 'p2_pwar_2',
    category: 'family',
    chain: { id: 'p2_pwar', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      refugee: carried('Johnny Pugs'),
      wife2: townie('Connie Pugliano, Johnny\'s wife', { first: 'Concetta', last: 'Pugliano', nickname: 'Connie', gender: 'F', ethnicity: 'Italian', age: [40, 50], traits: ['Patient', 'Pious'], faction: 'none' }),
    },
    title: 'Connie Pugliano Takes the Bus',
    body: `{wife2.name} takes the Greyhound from Philadelphia with a shopping bag and a rosary and comes to your house, not your restaurant, because she wants your wife to hear it too.

"They're going to kill my husband," she says, sitting at your kitchen table. "I don't care what he did. He's the father of my children. Both sides want him: the old man's people want to know what the young ones are planning, and the young ones want him quiet. My cousin has a farm in Florida, near Ocala. Nobody would look there. I need a car, a driver nobody knows and three days."

Your wife puts a cup of coffee in front of her and looks at you, and you know what your wife thinks.`,
    options: [
      {
        text: `Give her the car, the driver and three days.`,
        effects: [money(-800), op('wife2', 25), rivOp('philly', -8), famOp(5), flag('p2_pwar_florida'), then('p2_pwar_3', 2, 4, 1)],
        preview: `Johnny Pugs goes to Ocala. Philadelphia, on both sides, will want to know who drove.`,
      },
      {
        text: `"I'm sorry, Connie. I can't." Tell Sal where he is.`,
        effects: [rivOp('philly', 15), op('wife2', -40), famOp(-10), stress(10), then('p2_pwar_3', 2, 4, 1)],
        preview: `Sal's people pick him up at the Marlin that night. You never find out what happened to him, and you never ask.`,
      },
      {
        text: `Make Johnny trade: everything he knows, for the car.`,
        effects: [money(-800), hook('refugee', 'He told you the young captains\' plans to buy his escape', true), op('wife2', 10), then('p2_pwar_3', 2, 4, 1)],
        preview: `Names, dates, the plans for the shore. You know more about Philadelphia's war than anyone in it.`,
      },
    ],
  },
  {
    id: 'p2_pwar_3',
    category: 'town',
    chain: { id: 'p2_pwar', part: 3 },
    trigger: { chainOnly: true },
    roles: { refugee: carried('Johnny Pugs') },
    title: 'A Car on the Causeway',
    body: `It finally crosses the bridge. A Buick belonging to one of the young captains' men explodes on the Rio Grande causeway at two in the morning in July, in front of a dozen tourist cars coming home from the late show. Nobody's in it, which is a miracle, or a message.

By morning, the Philadelphia papers say MOB WAR REACHES THE SHORE. The Associated Press has a photograph of the burned car with the Wildwood water tower behind it. Three motels get cancellations by noon. The State Police set up a checkpoint on the causeway, and the FBI sends men from Newark.

Every business on the island looks at you to make it stop.`,
    immediate: [heat('federal', 8), heat('local', 6), money(-2000), infl('causeway', -4)],
    options: [
      {
        text: `Find the young captains' man who planted it and give him to the State Police.`,
        effects: [heat('local', -6), rivOp('philly', 6), respect(5), then('p2_pwar_4', 3, 5, 1)],
        preview: `One arrest and a headline that says Wildwood took care of its own. The young captains add you to their list.`,
      },
      {
        text: `Close every game and book on the island for two weeks. Let the heat find nothing.`,
        effects: [money(-3000), heat('federal', -6), heat('local', -4), crewOp(-3), then('p2_pwar_4', 3, 5, 1)],
        preview: `A very clean, very quiet island in the middle of July. Your crew gets restless and broke.`,
      },
      {
        text: `Call both sides. Offer the Admiral's ballroom for a peace meeting.`,
        gate: { trait: 'Charming' },
        effects: [respect(8), rivOp('philly', 4), heat('federal', 3), flag('p2_pwar_broker'), then('p2_pwar_4', 3, 5, 1)],
        preview: `You're about to try to end someone else's war on your own island. That's either statesmanship or suicide.`,
      },
    ],
  },
  {
    id: 'p2_pwar_4',
    category: 'table',
    chain: { id: 'p2_pwar', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { sal: rivalBoss('philly', 'Sal Moretti') },
    title: 'The Peace of the Admiral',
    body: `It ends, as Philadelphia's wars sometimes do, with an old man's patience outlasting young men's rage. Two more of the young captains are found in the trunks of their cars in Delaware County. The rest come to the old man, hats in hand.

The new arrangement is announced in a back room the way all such things are announced. The old man stays. The young captains get pieces of the city. And South Jersey, everyone notices, gets a new word in every sentence: "independent." Or "loyal." Depending on what you did this summer.

{sal.name} comes down to Wildwood to tell you himself.`,
    options: [
      {
        text: `Ask for a seat at the Table in your own right.`,
        gate: { flag: 'p2_pwar_broker' },
        effects: [respect(12), rivOp('philly', 6), heat('family', -5), flag('p2_pwar_seat')],
        preview: `You brokered the peace. The old man gives Wildwood a voice of its own. Sal looks at you with something like worry.`,
      },
      {
        text: `Pledge loyalty. Wildwood is the Table's.`,
        effects: [rivOp('philly', 15), heat('family', -8), respect(-2)],
        preview: `The Table trusts you. The Table also takes a bigger envelope, now that it trusts you.`,
      },
      {
        text: `Tell Sal that from now on, Wildwood pays a tribute, not a tax.`,
        effects: [rivOp('philly', -15), respect(8), heat('family', 10), money(1500), feud('philly')],
        preview: `A declaration of semi-independence. Philadelphia is too tired to fight you now. It won't always be.`,
      },
    ],
  },

  /* ================================================================ */
  /* 31. THE GAMING QUESTION                                           */
  /* ================================================================ */
  {
    id: 'p2_cas_1',
    category: 'history',
    chain: { id: 'p2_casino', part: 1 },
    trigger: { between: { from: { y: 1974, m: 8 }, to: { y: 1974, m: 10 } }, once: true, mandatory: true },
    roles: {
      ogle: world('civ_rev_ogle', 'Reverend Clarence Ogle, the temperance crusader', { first: 'Clarence', last: 'Ogle', age: [55, 70], traits: ['Pious', 'Vengeful'] }),
    },
    title: 'Public Question Number One',
    body: `This November, New Jersey votes on whether to allow casino gambling, in any town whose own voters say yes. Wildwood could be Las Vegas by the sea. So could Atlantic City, Asbury Park and anywhere else with a beach and a mayor.

{ogle.name} has preached against it every Sunday since June. So have the Methodists, the Baptists, half the Catholic pastors and the State Chamber of Commerce. The race tracks are against it. Atlantic City is for it. The polls say it's close.

A man from a Las Vegas hotel company has been staying at the Admiral for a week, asking who owns which oceanfront lots.`,
    options: [
      {
        text: `Fund the Yes campaign. Quietly, through the motel association.`,
        gate: { money: 5000 },
        effects: [money(-5000), favor(1), heat('federal', 3), flag('p2_cas_yes74'), then('p2_cas_2', 8, 12, 1)],
        preview: `Newspaper ads, buttons, a sound truck on Pacific Avenue. Everybody suspects whose money it is.`,
      },
      {
        text: `Stay out. A legal casino is the end of an illegal one.`,
        effects: [respect(2), then('p2_cas_2', 8, 12, 1)],
        preview: `Your card games and books depend on gambling being illegal. Some of your capos agree with Reverend Ogle, for different reasons.`,
      },
      {
        text: `Buy oceanfront options now, quietly, in case it passes.`,
        gate: { money: 4000 },
        effects: [money(-4000), unwashed(-3000), flag('p2_cas_options'), then('p2_cas_2', 8, 12, 1)],
        preview: `Options on three lots on the beach. If it passes, you're rich. If it fails, you're out the option money.`,
      },
    ],
  },
  {
    id: 'p2_cas_2',
    category: 'history',
    chain: { id: 'p2_casino', part: 2 },
    trigger: { chainOnly: true, mandatory: true },
    roles: {},
    title: 'Sixty to Forty',
    body: `It loses badly. Sixty to forty, statewide. Even Cape May County votes no. The newspapers say voters didn't want a casino in every town; they'd heard too many stories about Las Vegas and too many about the men who run it. Reverend Ogle rings the bells at his church for an hour.

The Las Vegas man checks out of the Admiral the next morning.

In Atlantic City, though, the hotel men are already saying something else: next time, ask for one town only. Theirs.`,
    options: [
      {
        text: `Let the options lapse. The dream is over.`,
        gate: { flag: 'p2_cas_options' },
        effects: [money(-500), stress(4), then('p2_cas_3', 80, 96, 1)],
        preview: `Three lots in Wildwood go back to their owners. Wildwood stays Wildwood.`,
      },
      {
        text: `Start buying Atlantic City instead. Boardwalk hotels are cheap and dying.`,
        gate: { money: 6000 },
        effects: [money(-6000), unwashed(-4000), rivOp('manno', -8), flag('p2_cas_ac_land'), then('p2_cas_3', 80, 96, 1)],
        preview: `A failing Boardwalk hotel bought through a Delaware company. Atlantic City's crew notices a stranger buying their town.`,
      },
      {
        text: `Pour the money back into the card games. Illegal is good business.`,
        effects: [money(1500), heat('local', 2), then('p2_cas_3', 80, 96, 1)],
        preview: `The state just voted to keep your business illegal. For now, that keeps it yours.`,
      },
    ],
  },
  {
    id: 'p2_cas_3',
    category: 'history',
    chain: { id: 'p2_casino', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: {
      abrams: world('pol_louis_abrams', 'Louis Abrams, Atlantic City commissioner and owner of a dying Boardwalk hotel', { first: 'Louis', last: 'Abrams', ethnicity: 'Jewish', age: [55, 70], traits: ['Greedy'] }),
    },
    title: 'One Town Only',
    body: `It's on the ballot again, two years later: casino gambling in Atlantic City and nowhere else, with the state taking a cut for senior citizens. The billboards say HELP YOURSELF. The hotel men have raised more money than anyone's ever spent on a New Jersey public question.

Wildwood is not on the ballot. Wildwood is on nobody's mind.

{abrams.name}, who owns a Boardwalk hotel in Atlantic City with a leaking roof and a ballroom where Benny Goodman played in 1938, asks you to lunch. "If this passes, my hotel is worth twenty times what it's worth today," he says. "If it fails, it's worth nothing. I'd like a partner who can wait, and doesn't mind the people who are going to come asking for envelopes."`,
    options: [
      {
        text: `Buy into Abrams's hotel.`,
        gate: { money: 8000 },
        effects: [money(-8000), unwashed(-6000), op('abrams', 20), flag('p2_cas_abrams'), then('p2_cas_4', 6, 10, 1)],
        preview: `A gamble on a gamble. If it pays, you own a piece of the future.`,
      },
      {
        text: `Fight it. Atlantic City with casinos takes every tourist dollar out of Wildwood.`,
        gate: { money: 3000 },
        effects: [money(-3000), rivOp('manno', -6), flag('p2_cas_against'), then('p2_cas_4', 6, 10, 1)],
        preview: `Your money on the side of Reverend Ogle. That's a strange place for it.`,
      },
      {
        text: `Let it play out.`,
        effects: [then('p2_cas_4', 6, 10, 1)],
        preview: `The voters will decide what happens to the shore for the next fifty years.`,
      },
    ],
  },
  {
    id: 'p2_cas_4',
    category: 'history',
    chain: { id: 'p2_casino', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { abrams: carried('Louis Abrams') },
    title: 'Help Yourself',
    body: `It passes. Atlantic City will have casinos. On election night the Boardwalk is a carnival: car horns, bottles, men dancing on the hood of a Cadillac outside Abrams's hotel.

In Wildwood it's quiet. People stand in the bars and watch the television and do the arithmetic. Forty miles up the road, a city is going to get the biggest legal gambling industry outside Nevada. Every high roller in the Northeast will drive past the Wildwood exit to get there.

Your phone starts ringing at midnight. The first call is from a man in Las Vegas. The second is from Philadelphia.`,
    immediate: [flag('p2_ww_ac_casinos'), infl('boardwalk', -4)],
    options: [
      {
        text: `You bought into Abrams's hotel. Take the Las Vegas man's call.`,
        gate: { flag: 'p2_cas_abrams' },
        effects: [money(15000), heat('federal', 10), respect(10), rivOp('philly', -6), rivOp('manno', -10)],
        preview: `Your piece of a Boardwalk hotel is suddenly worth a fortune. Every regulator, federal agent and rival in the state wants to know whose money it is.`,
      },
      {
        text: `You bought AC land two years ago. Now you sell it, at ten times the price.`,
        gate: { flag: 'p2_cas_ac_land' },
        effects: [money(12000), unwashed(4000), heat('federal', 6), rivOp('manno', -4)],
        preview: `You were right early, which is the only way to be right. The money is real and it needs washing.`,
      },
      {
        text: `Take Philadelphia's call. The Table wants Atlantic City, and they'll need men who know the shore.`,
        effects: [rivOp('philly', 10), respect(4), heat('family', 4)],
        preview: `The Table's going to Atlantic City. You'll be part of it, as a soldier in someone else's army.`,
      },
      {
        text: `Unplug the phone. Wildwood is still here.`,
        effects: [stress(-4), famOp(3)],
        preview: `Atlantic City can have its casinos. Wildwood has the tram cars, the custard and the Sunday gravy.`,
      },
    ],
  },

  /* ================================================================ */
  /* 32. SUPERSEDED                                                    */
  /* ================================================================ */
  {
    id: 'p2_np_1',
    category: 'law',
    chain: { id: 'p2_supersede', part: 1 },
    trigger: { minWeek: 60, heatAbove: { local: 30 }, once: true, mandatory: true },
    roles: {
      vassallo: world('law_anthony_vassallo', 'Anthony Vassallo, named acting county prosecutor by the Attorney General', { first: 'Anthony', last: 'Vassallo', ethnicity: 'Italian', age: [38, 46], traits: ['Honest', 'Ambitious'] }, 'acting county prosecutor'),
    },
    title: 'The Attorney General Takes Over',
    body: `The Attorney General of New Jersey has superseded the Cape May County Prosecutor. It's in the Trenton papers on Monday and the Leader on Tuesday: the State is taking over every criminal investigation in the county, "in light of persistent reports of official laxity in the enforcement of the gambling laws."

The new acting prosecutor is {vassallo.name}, the former first assistant, who was passed over for the job twice and has been waiting six years for this. He's the son of a Wildwood fisherman. He doesn't drink, doesn't golf, doesn't play cards and doesn't take envelopes. His first press conference is held at the bay docks at Otten's Harbor, in front of the fishing boats.

"I know this town," he says. "I grew up on these docks. I know who owns what boat."`,
    immediate: [heat('local', 8), favor(-1), flag('p2_ww_superseded')],
    options: [
      {
        text: `Move the boats. Every one of them, out of Otten's Harbor, this week.`,
        effects: [money(-1500), evidence('player', -5), infl('docks', -3), then('p2_np_2', 3, 5, 1)],
        preview: `The bay docks go quiet. Vassallo smiles: a quiet dock is a dock with something to hide.`,
      },
      {
        text: `Have someone find out what Vassallo's family needs.`,
        effects: [money(-200), then('p2_np_2', 3, 5, 1)],
        preview: `Every man has a family. Most families need something.`,
      },
      {
        text: `Send a congratulatory telegram. Mean it, a little.`,
        gate: { trait: 'Charming' },
        effects: [op('vassallo', 3), respect(2), then('p2_np_2', 3, 5, 1)],
        preview: `He'll frame it, his secretary says, and enter it into evidence if he ever needs it.`,
      },
    ],
  },
  {
    id: 'p2_np_2',
    category: 'law',
    chain: { id: 'p2_supersede', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      vassallo: carried('Anthony Vassallo'),
      sister: townie('Carla Vassallo, the prosecutor\'s sister, who runs a luncheonette on the bay', { first: 'Carla', last: 'Vassallo', gender: 'F', ethnicity: 'Italian', age: [34, 44], traits: ['Honest', 'Hot-headed'], faction: 'none' }),
    },
    title: 'The Prosecutor\'s Sister',
    body: `Vassallo's family needs one thing. His sister {sister.name} runs a luncheonette on the bay at the foot of Otten's Harbor, where the fishermen eat at four in the morning. Two years ago she borrowed $3,000 from a Kessler shylock to fix the roof after a storm, and she's been paying five points a week ever since. Her brother doesn't know. Nobody tells a prosecutor that kind of thing.

The marker came to you last week, by way of Kessler, who wanted to get rid of it before it got him indicted.

You now own the prosecutor's sister's debt.`,
    options: [
      {
        text: `Tear up the marker. Have someone tell her, and nobody else.`,
        effects: [money(-300), op('sister', 25), flag('p2_np_torn'), then('p2_np_3', 6, 10, 1)],
        preview: `A woman who owed a shylock owes nobody. She'll know who did it. Whether her brother ever knows is up to her.`,
      },
      {
        text: `Keep it. A prosecutor's sister's marker is a strong card.`,
        effects: [hook('vassallo', 'You hold his sister\'s shylock debt', true), op('sister', -10), flag('p2_np_hook'), then('p2_np_3', 6, 10, 1)],
        preview: `You've got leverage over the most honest man in the county. Honest men with leverage on them do surprising things.`,
      },
      {
        text: `Give the marker to Vassallo himself, in an envelope with Kessler's shylock's name on it.`,
        effects: [rivRes('kessler', { exposure: 20 }), rivOp('kessler', -10), op('vassallo', 10), op('sister', -15), then('p2_np_3', 6, 10, 1)],
        preview: `Vassallo learns about his sister from a gangster. He goes after Kessler's shylock first, with a personal grudge.`,
      },
    ],
  },
  {
    id: 'p2_np_3',
    category: 'law',
    chain: { id: 'p2_supersede', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { vassallo: carried('Anthony Vassallo'), sister: carried('Carla Vassallo') },
    title: 'Grand Jury Season',
    body: `Acting Prosecutor Vassallo's grand jury sits for eleven weeks in the courthouse at Cape May Court House. Forty-one witnesses. Three bookmakers, two police lieutenants, a city commissioner, a beer distributor and a Boardwalk custard man.

Your name comes up on the ninth day. Everybody knows your name comes up on the ninth day; it's in the papers on the tenth.

On the last afternoon, {sister.first} Vassallo is seen bringing a box of crullers to the grand jury room for the jurors. Nobody thinks anything of it except you.`,
    options: [
      {
        text: `You tore up the marker. Wait.`,
        gate: { flag: 'p2_np_torn' },
        effects: [evidence('player', -6), heat('local', -4), stress(-4), op('vassallo', 5)],
        preview: `Vassallo indicts two police lieutenants and a Kessler shylock. Your name is in the report and not in the indictment. His sister never told him; he figured it out himself.`,
      },
      {
        text: `Send Vassallo a note: his sister's marker, a photocopy, nothing else.`,
        gate: { flag: 'p2_np_hook' },
        effects: [evidence('player', -10), heat('local', -6), op('vassallo', -40), heat('federal', 8), stress(8)],
        preview: `Your name stays out of the indictment. Vassallo resigns in the spring and goes to work for the U.S. Attorney, with your file under his arm.`,
      },
      {
        text: `Get the best lawyer in Camden and prepare.`,
        gate: { money: 3000 },
        effects: [money(-3000), evidence('player', -4), stress(4)],
        preview: `Whatever happens, you'll be ready for it.`,
      },
      {
        text: `Ride it out.`,
        effects: [evidence('player', 5), heat('local', 4), stress(6)],
        preview: `Eleven weeks of headlines with your name in them. It costs you a little every day.`,
      },
    ],
  },

  /* ================================================================ */
  /* 33. RACKETEER INFLUENCED                                          */
  /* ================================================================ */
  {
    id: 'p2_rico_1',
    category: 'history',
    chain: { id: 'p2_rico', part: 1 },
    trigger: { between: { from: { y: 1970, m: 10 }, to: { y: 1971, m: 2 } }, once: true, mandatory: true },
    roles: {
      daughter: famRole('your daughter', 'daughter'),
    },
    title: 'Racketeer Influenced and Corrupt Organizations',
    body: `The President signs the Organized Crime Control Act in October. Title Nine has a long name that your lawyer has to read twice: Racketeer Influenced and Corrupt Organizations. RICO.

"It means they don't have to prove you did anything," your lawyer says, sitting in your kitchen with the text of the law on his knees. "They have to prove you're part of an enterprise, and that the enterprise did two things. Any two things, over ten years. A card game in 1962 and a vending machine in 1969. Your restaurant is an enterprise. Your family is an enterprise." He takes off his glasses. "Twenty years per count. And they take the businesses."

{daughter.first} reads the law that night at the kitchen table, and in the morning she says only, "You should restructure everything. This week."`,
    immediate: [flag('p2_ww_rico'), heat('federal', 5)],
    options: [
      {
        text: `Restructure everything: separate companies, separate books, separate lawyers.`,
        gate: { money: 4000 },
        effects: [money(-4000), evidence('player', -10), op('daughter', 10), flag('p2_rico_restructured'), then('p2_rico_2', 30, 60, 1)],
        preview: `Twelve corporations where there was one family. It's expensive and complicated, and it might be enough.`,
      },
      {
        text: `"It'll never hold up in court."`,
        effects: [stress(-2), then('p2_rico_2', 20, 40, 1)],
        preview: `Your lawyer says the same thing. Neither of you believes it.`,
      },
      {
        text: `Start moving the legitimate businesses into your wife's and children's names.`,
        effects: [famOp(5), evidence('player', -6), flag('p2_rico_family'), then('p2_rico_2', 30, 60, 1)],
        preview: `Clean hands holding clean deeds. Unless the government decides your family is the enterprise.`,
      },
    ],
  },
  {
    id: 'p2_rico_2',
    category: 'law',
    chain: { id: 'p2_rico', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      daughter: carried('your daughter'),
      ausa: world('law_gloria_sterling', 'Gloria Sterling, Assistant U.S. Attorney for racketeering and tax', { first: 'Gloria', last: 'Sterling', gender: 'F', age: [38, 48], traits: ['Honest', 'Patient'] }, 'Assistant U.S. Attorney'),
    },
    title: 'A Woman Who Wins',
    body: `{ausa.name} is one of the only women prosecutors in the federal courthouse in Camden, and she wins. She has been building a tax case against you since 1963, very slowly, one bank deposit at a time. Now she has a new law.

She subpoenas the records of your vending company: every route, every machine, every quarter since 1961. The subpoena is forty pages long and arrives in a box.

Your bookkeeper says the vending company's books are clean. Mostly. "Clean like a kitchen floor is clean," he says. "If you don't look under the stove."`,
    options: [
      {
        text: `Comply in full. Let her look under the stove.`,
        gate: { flag: 'p2_rico_restructured' },
        effects: [evidence('player', -5), op('ausa', 5), money(-1000), then('p2_rico_3', 20, 40, 1)],
        preview: `She looks. The vending company is its own corporation now, with its own books, and the stove is very clean.`,
      },
      {
        text: `Fight the subpoena in court. Delay is a strategy.`,
        effects: [money(-2500), evidence('player', 3), stress(4), then('p2_rico_3', 20, 40, 1)],
        preview: `A year of motions. Gloria Sterling is patient. She's been patient since 1963.`,
      },
      {
        text: `Lose some of the records. A flood in the basement.`,
        effects: [evidence('player', 8), heat('federal', 8), money(-300), then('p2_rico_3', 15, 30, 1)],
        preview: `Obstruction of justice is a predicate act. She doesn't even have to prove the vending case now.`,
      },
    ],
  },
  {
    id: 'p2_rico_3',
    category: 'law',
    chain: { id: 'p2_rico', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { daughter: carried('your daughter'), ausa: carried('Gloria Sterling') },
    title: 'The Enterprise',
    body: `The indictment comes down on a Wednesday in a federal courtroom in Camden. United States versus seventeen defendants, the enterprise described as "an association in fact" running gambling, loansharking and vending in Cape May and Atlantic counties since 1958.

Whether your name is on page one or page nine depends on what you did when the law was signed.

Gloria Sterling reads the charges aloud at the arraignment in a gray suit. Afterward, in the hallway, she stops beside your daughter, who is there as a member of the bar and not as anybody's daughter, and says something too quietly for you to hear.`,
    immediate: [heat('federal', 8)],
    options: [
      {
        text: `The twelve corporations held. Your name isn't on it.`,
        gate: { flag: 'p2_rico_restructured' },
        effects: [evidence('player', -10), respect(6), crewOp(-6), stress(-4)],
        preview: `Seventeen defendants: capos, soldiers, a vending manager. Not you. Your men notice who's in the courtroom and who's in the gallery.`,
      },
      {
        text: `Your wife and children hold the deeds. Now the government says they're the enterprise.`,
        gate: { flag: 'p2_rico_family' },
        effects: [famOp(-12), evidence('player', -4), stress(12), money(-3000)],
        preview: `Your wife's name on a federal subpoena. Your son's name in the newspaper. The lawyers say it won't stick. You don't sleep for a month.`,
      },
      {
        text: `Ask your daughter what Sterling said.`,
        effects: [op('daughter', 5), stress(3)],
        preview: `"She said she'd heard I was good," your daughter says. "And that she hoped someday I'd be on the right side of the room." She doesn't say which side she meant.`,
      },
      {
        text: `Hire the best RICO defense team in New York.`,
        gate: { money: 8000 },
        effects: [money(-8000), evidence('player', -8), heat('federal', 3)],
        preview: `Three lawyers in very good suits who have done this before. It's going to be a long trial.`,
      },
    ],
  },

  /* ================================================================ */
  /* 34. RUN ON THE SHORE SAVINGS                                      */
  /* ================================================================ */
  {
    id: 'p2_bank_1',
    category: 'town',
    chain: { id: 'p2_bank', part: 1 },
    trigger: { months: [10, 11, 12, 1, 2], minWeek: 80, once: true, mandatory: true },
    roles: {
      loftus: world('civ_patrick_loftus', 'Patrick Loftus, who runs the savings-and-loan that holds the island\'s mortgages', { first: 'Patrick', last: 'Loftus', ethnicity: 'Irish', age: [55, 66], traits: ['Greedy', 'Cowardly'] }),
    },
    title: 'A Line Down Atlantic Avenue',
    body: `By nine in the morning there's a line from the door of the Shore Savings and Loan on Atlantic Avenue down to the corner and around it. Widows with passbooks, Boardwalk stand owners, the man who owns the miniature golf. Somebody said something at the Olympia Diner on Sunday about bad loans, and by Monday everybody had heard it.

The rumor is true. {loftus.name} lent too much money to a Manno-backed developer who was going to build three hundred houses in the marsh and built nine. The Shore Savings holds half the home mortgages on the island and a lot of motel paper.

Loftus calls you at ten-thirty from his office, with the door locked. "I need sixty thousand dollars by three o'clock," he says. "Or I close the doors."`,
    immediate: [flag('p2_ww_bank_run')],
    options: [
      {
        text: `Bring him cash. Enough to get through the afternoon.`,
        gate: { money: 10000 },
        effects: [money(-10000), unwashed(-8000), hook('loftus', 'You stopped the run on his bank with your money', true), respect(6), flag('p2_bank_saved'), then('p2_bank_2', 2, 4, 1)],
        preview: `A savings-and-loan full of your cash. The line goes home satisfied. You now hold a bank by the throat.`,
      },
      {
        text: `Let it fail.`,
        effects: [money(-1200), respect(-2), infl('downtown', -3), flag('p2_bank_failed'), then('p2_bank_2', 2, 4, 1)],
        preview: `The doors close at three. Half the island's mortgages are about to belong to someone else.`,
      },
      {
        text: `Pull your own money out first.`,
        effects: [money(500), respect(-4), op('loftus', -20), flag('p2_bank_failed'), then('p2_bank_2', 2, 4, 1)],
        preview: `You get yours. A widow behind you in line doesn't. People see you leave with a satchel.`,
      },
    ],
  },
  {
    id: 'p2_bank_2',
    category: 'politics',
    chain: { id: 'p2_bank', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      loftus: carried('Patrick Loftus'),
      whitcomb: world('pol_eleanor_whitcomb', 'Eleanor Whitcomb, whose family bank can call a loan on any motel on the island', { first: 'Eleanor', last: 'Whitcomb', gender: 'F', age: [58, 70], traits: ['Patient', 'Greedy'] }),
    },
    title: 'Mrs. Whitcomb\'s Bank',
    body: `{whitcomb.name}, a Republican National Committeewoman with pearls and a Bryn Mawr accent, the only woman in every room she's been in for thirty years, has offered to have her family's bank absorb the Shore Savings and Loan. The state banking commissioner is inclined to let her.

Her bank will honor the passbooks. It will also review every motel mortgage on the island and call the ones it doesn't like. Including, her people have let it be known, any motel whose owner is "associated with undesirable elements."

She invites you to tea at her house in Cape May, which is the last thing you expected. "I'm not a moralist," she says, pouring. "I'm a banker. Tell me why I should leave your motels alone."`,
    options: [
      {
        text: `"Because I'll put a hundred thousand dollars of deposits in your bank."`,
        gate: { money: 6000 },
        effects: [money(-6000), op('whitcomb', 15), flag('p2_bank_deal'), then('p2_bank_3', 6, 10, 1)],
        preview: `A gangster's deposits in a Main Line bank. Mrs. Whitcomb keeps very good records.`,
      },
      {
        text: `"Because my motels pay on time, and half your other paper doesn't."`,
        effects: [op('whitcomb', 8), respect(2), then('p2_bank_3', 6, 10, 1)],
        preview: `An honest answer, and a good one. She writes something down.`,
      },
      {
        text: `"Because I'll buy any paper you call. At a discount."`,
        gate: { money: 5000 },
        effects: [money(-5000), unwashed(-4000), op('whitcomb', 5), flag('p2_bank_paper'), then('p2_bank_3', 6, 10, 1)],
        preview: `She calls the loans and you buy them. The motels' owners pay you now.`,
      },
    ],
  },
  {
    id: 'p2_bank_3',
    category: 'town',
    chain: { id: 'p2_bank', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { loftus: carried('Patrick Loftus'), whitcomb: carried('Eleanor Whitcomb') },
    title: 'Foreclosure Spring',
    body: `By April the island has changed hands in ways nobody will see for years. Fourteen motels have new mortgage holders. Six have new owners. The Shore Savings sign on Atlantic Avenue has been painted over with the Whitcomb bank's name in gold.

Patrick Loftus has gone to his daughter's in Delaware. The Manno developer's nine houses in the marsh are rented to summer workers by a company nobody can trace.

And the widows with passbooks have their money, every dollar, which is what they'll remember.`,
    options: [
      {
        text: `You saved the bank. Take Loftus's seat on the board of the new one.`,
        gate: { flag: 'p2_bank_saved' },
        effects: [respect(6), favor(2), infl('downtown', 5), heat('federal', 4)],
        preview: `A director of a bank. Your mother would be proud. The FBI would be very interested.`,
      },
      {
        text: `You bought the motel paper. Collect, but gently.`,
        gate: { flag: 'p2_bank_paper' },
        effects: [money(2500), biz('add', 'motel', 'crest'), infl('crest', 5), respect(2)],
        preview: `Six motel owners on the Crest pay you now. One of them couldn't, and now you own a motel.`,
      },
      {
        text: `Pick up two foreclosed motels at auction, through a cousin.`,
        gate: { money: 7000 },
        effects: [money(-7000), unwashed(-5000), biz('add', 'motel', 'crest'), biz('add', 'motel', 'north'), infl('crest', 3)],
        preview: `Forty rooms for the price of twelve. Somebody else's ruin, your spring.`,
      },
      {
        text: `Leave it.`,
        effects: [stress(-2)],
        preview: `The island reshuffles without you.`,
      },
    ],
  },
];

