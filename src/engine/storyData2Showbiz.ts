import type { PackEvent } from './storyDataSchema';
import {
  biz, carried, crewOp, crewRole, evidence, favor, feud, flag, heat, hook, infl, money, op, respect, rivOp, rivRes,
  rivalBoss, stress, thenFx as then, under, unwashed,
} from './storyDataSchema';
import { world } from './storyData2Cast';

/**
 * Show business
 * 19. The Kincaid Subpoena   (p2_kin_*)  the payola hearings reach a Philadelphia TV dance-show host
 * 20. The Sandettes          (p2_sdt_*)  three Camden singers and the manager who steals from them (villain)
 * 21. Vic Marlowe's Marker   (p2_vm_*)   a national crooner's gambling debt
 * 22. Low Tide               (p2_pic_*)  a film producer wants mob money for a crime picture about a shore town
 * 23. Seashell Records       (p2_sea_*)  buying a record label after the hearings
 * 24. Sunset on Ocean Avenue (p2_cs_*)   a hometown girl singer whose career you could make
 */
export const SHOWBIZ: PackEvent[] = [
  /* ================================================================ */
  /* 19. THE KINCAID SUBPOENA                                          */
  /* ================================================================ */
  {
    id: 'p2_kin_1',
    category: 'boardwalk',
    chain: { id: 'p2_kincaid', part: 1 },
    trigger: { between: { from: { y: 1960, m: 6 }, to: { y: 1960, m: 8 } }, once: true, mandatory: true },
    roles: {
      host: world('ent_jerry_kincaid', 'Jerry Kincaid, host of Kincaid\'s Record Hop, the Philadelphia TV dance show', { first: 'Gerald', last: 'Kincaid', nickname: 'Jerry', age: [30, 36], traits: ['Charming', 'Ambitious'] }),
    },
    title: 'America\'s Favorite Teenager',
    body: `Every afternoon at four, half the teenagers in America watch {host.name} introduce records from a studio in West Philadelphia. All this summer he's doing it live from the Surf Ballroom on the Wildwood boardwalk, in a seersucker jacket, with four hundred kids twisting behind him and a sponsor's soda bottle on every table.

In Washington, a House subcommittee has spent the spring asking disc jockeys about money in envelopes, and a couple of famous ones have already lost their jobs. Jerry's name hasn't come up yet. Jerry would like to keep it that way.

He meets you after the broadcast in the Surf Ballroom's office, still in makeup. "I own pieces of three record companies, a music publisher and a pressing plant," he says. "By the time I go to Washington, I'd like to own none of them. I need somebody to hold them for a while. Somebody who doesn't mind owning things on paper."`,
    options: [
      {
        text: `Hold them. At a third of what they're worth.`,
        gate: { money: 5000 },
        effects: [money(-5000), unwashed(-3000), op('host', 10), hook('host', 'You hold his record companies so he can testify he owns nothing', true), flag('p2_kin_front'), heat('federal', 5), then('p2_kin_2', 3, 5, 1)],
        preview: `You own a slice of the record business, at a discount, from a man who'll owe you his career. It's also the exact thing the subcommittee is looking for.`,
      },
      {
        text: `"Get yourself a lawyer, Jerry. Not a gangster."`,
        effects: [op('host', -5), respect(2), then('p2_kin_2', 3, 5, 1)],
        preview: `He finds someone in New York. You find out later whether that was a mistake.`,
      },
      {
        text: `Buy the pressing plant outright. Just that. Real money, real deed.`,
        gate: { money: 3000 },
        effects: [money(-3000), biz('add', 'vending', 'causeway'), op('host', 5), then('p2_kin_2', 3, 5, 1)],
        preview: `Not a front, a purchase. Records get pressed whether the hearings come or not.`,
      },
    ],
  },
  {
    id: 'p2_kin_2',
    category: 'vice',
    chain: { id: 'p2_kincaid', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      host: carried('Jerry Kincaid'),
      fein: world('ent_arnold_fein', 'Arnold Fein, producer of Kincaid\'s Record Hop', { first: 'Arnold', last: 'Fein', age: [40, 50], traits: ['Paranoid', 'Greedy'] }),
    },
    title: 'Arnold Fein\'s Copy',
    body: `{fein.name} produces Jerry's show and keeps a copy of everything, including a green cloth ledger that lists every record played on the Record Hop since 1957, and next to each one, in pencil, a figure and a set of initials.

He shows you two pages of it in the front seat of his Pontiac on the Rio Grande causeway. Some of the initials belong to Harvey Lipman of Seashell Records. Some belong to a jukebox man from Philadelphia who belongs to the Table. A few belong to a man in Atlantic City who belongs to Carmine Manno.

"The committee's investigator would give his left arm for this," Fein says. "Jerry would give his right. I'm a producer. I'm taking bids."`,
    options: [
      {
        text: `Buy it. You'll decide what it's for later.`,
        gate: { money: 4000 },
        effects: [money(-4000), hook('host', 'You hold the ledger that could end him', true), flag('p2_kin_ledger'), then('p2_kin_3', 3, 5, 1)],
        preview: `The most dangerous document in the record business, in your safe. Several powerful men will want to know where it went.`,
      },
      {
        text: `Tell Fein to take it to the committee. Let it burn the people it burns.`,
        effects: [rivRes('manno', { exposure: 15 }), rivOp('philly', -6), heat('federal', 4), op('fein', 5), then('p2_kin_3', 3, 5, 1)],
        preview: `Manno's record man and a Table jukebox man end up in the newspapers. The Table wonders who advised Mr. Fein.`,
      },
      {
        text: `Tell Jerry his producer is shopping him.`,
        effects: [op('host', 15), op('fein', -20), then('p2_kin_3', 3, 5, 1)],
        preview: `Jerry is grateful and frightened. Arnold Fein is unemployed by Friday, and holding his ledger.`,
      },
    ],
  },
  {
    id: 'p2_kin_3',
    category: 'law',
    chain: { id: 'p2_kincaid', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      host: carried('Jerry Kincaid'),
      ginny: world('ent_ginny_walsh', 'Ginny Walsh, the Wildwood station\'s summer DJ, broadcasting from the boardwalk', { first: 'Virginia', last: 'Walsh', nickname: 'Ginny', gender: 'F', age: [24, 30], traits: ['Honest', 'Charming'] }),
    },
    title: 'The Girl in the Glass Booth',
    body: `{ginny.name} broadcasts from a glass booth on the Boardwalk at Schellenger Avenue, six to midnight, all summer, and she's the only disc jockey on the shore who has never taken an envelope. Everybody knows it; they've all tried. The House subcommittee's investigator knows it too, and he's asked her to testify about what she's been offered, and by whom.

She's been offered things by Jerry's people. She's been offered things by a man who works for you, who pays her to play a record by an act at your club.

She comes to see you at the Ivanhoe at one in the morning, still in her headphones necklace, and says, "I'm going to tell them the truth. I'm telling you first because you're the only one who never threatened me. I'd like that to stay true."`,
    options: [
      {
        text: `"Tell them the truth. Including about my man."`,
        effects: [op('ginny', 25), heat('federal', 5), crewOp(-3), respect(3), flag('p2_kin_ginny'), then('p2_kin_4', 4, 6, 1)],
        preview: `A clean witness with your name in her testimony, as the boss who told her to be honest. That's a strange thing to be known for.`,
      },
      {
        text: `Ask her, as a favor, to leave your man out of it.`,
        effects: [op('ginny', -10), heat('federal', 2), then('p2_kin_4', 4, 6, 1)],
        preview: `She thinks about it. She leaves him out, and never plays another record for you again.`,
      },
      {
        text: `Get her a lawyer, paid for by the station's owner. She shouldn't go to Washington alone.`,
        gate: { money: 800 },
        effects: [money(-800), op('ginny', 15), favor(1), then('p2_kin_4', 4, 6, 1)],
        preview: `A good lawyer keeps her testimony narrow and her name out of the gossip columns.`,
      },
    ],
  },
  {
    id: 'p2_kin_4',
    category: 'history',
    chain: { id: 'p2_kincaid', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { host: carried('Jerry Kincaid'), ginny: carried('Ginny Walsh') },
    title: 'Washington, on Television',
    body: `Jerry Kincaid testifies in Washington in a navy suit with a pocket square. He tells the subcommittee he has divested himself of all his music-business interests, that he never played a record he didn't like, and that he is proud of the young people of America. A congressman calls him "a fine young man." The newspapers in Philadelphia call him "unsinged."

That fall, Congress amends the law to make payola a crime. Kincaid's Record Hop is renewed. The Surf Ballroom broadcast will be back next summer.

Jerry calls you from a pay phone at Union Station. "I owe you," he says, and you can hear that he's already trying to work out how much.`,
    options: [
      {
        text: `Keep the record companies. Jerry can buy them back in five years, at a price.`,
        gate: { flag: 'p2_kin_front' },
        effects: [money(2500), biz('add', 'club', 'boardwalk'), hook('host', 'He owes you his career and his companies', true), heat('federal', 3)],
        preview: `Three record companies and the summer's biggest stage. Every act on the shore now comes through people who owe you.`,
      },
      {
        text: `Put the ledger in a bank box in Philadelphia. Insurance.`,
        gate: { flag: 'p2_kin_ledger' },
        effects: [rivOp('manno', -4), rivOp('philly', -3), hook('host', 'The green ledger, in your bank box', true), stress(3)],
        preview: `Half of the record business in Philadelphia now has a reason to be nice to you, and a reason to want you dead.`,
      },
      {
        text: `Ask for one favor: Ginny Walsh on Jerry's show, as his summer co-host.`,
        gate: { flag: 'p2_kin_ginny' },
        effects: [op('ginny', 20), op('host', -5), infl('boardwalk', 4), respect(3)],
        preview: `The only honest DJ on the shore goes national. She knows who arranged it, and it's the one favor she accepts.`,
      },
      {
        text: `"You don't owe me anything, Jerry."`,
        effects: [op('host', 10), respect(2)],
        preview: `He doesn't believe you. Men like Jerry never believe a debt is forgiven, which is why they're always paying.`,
      },
    ],
  },

  /* ================================================================ */
  /* 20. THE SANDETTES                                                 */
  /* ================================================================ */
  {
    id: 'p2_sdt_1',
    category: 'boardwalk',
    chain: { id: 'p2_sandettes', part: 1 },
    trigger: { season: 'summer', minWeek: 4, once: true, weight: 13 },
    roles: {
      rainy: world('ent_rainy_hodges', 'Rainy Hodges, lead singer of the Sandettes, three young women from Camden', { first: 'Lorraine', last: 'Hodges', nickname: 'Rainy', gender: 'F', age: [20, 24], traits: ['Ambitious', 'Charming'] }),
      manager: { desc: 'Leonard Voight, the Sandettes\' manager (a villain)', pool: 'town', spawn: { first: 'Leonard', last: 'Voight', age: [40, 52], traits: ['Cruel', 'Greedy'], faction: 'none' } },
      hollis: world('ent_hollis_boatwright', 'Hollis Boatwright, owner of Club Harbor Lights', { first: 'Hollis', last: 'Boatwright', age: [45, 58], traits: ['Patient'] }),
    },
    title: 'Seven Months Without a Check',
    body: `The Sandettes close the second show at Club Harbor Lights on the west side, where {hollis.name} lets the musicians who play Pacific Avenue eat, sleep and jam after hours. Three girls from Camden with a sound the radio loves and a record at number eleven in Philadelphia.

{rainy.name}, the lead, asks {hollis.first} to introduce you. She doesn't sit down. "We have a hit record and we haven't been paid in seven months," she says. "{manager.name} holds our contract. He says the record company didn't pay. Gwen called the record company. The record company paid him." She keeps her voice even. "He says if we leave him, nobody will book three colored girls from Camden ever again. He says we owe him for the dresses."

"I'm not asking for charity. Mr. Boatwright says you're a man who buys contracts."`,
    options: [
      {
        text: `"Show me the contract."`,
        effects: [op('rainy', 15), op('hollis', 10), then('p2_sdt_2', 2, 4, 1)],
        preview: `You start with the paper. Paper is where men like Voight hide.`,
      },
      {
        text: `Buy their contract from Voight tonight. Whatever he asks.`,
        gate: { money: 5000 },
        effects: [money(-5000), op('rainy', 10), op('manager', 10), flag('p2_sdt_bought'), then('p2_sdt_2', 2, 4, 1)],
        preview: `The girls are free of him by morning. Voight walks away rich, which is what men like him count on.`,
      },
      {
        text: `"Not my business."`,
        effects: [op('rainy', -15), op('hollis', -10)],
        preview: `They finish the summer. In September a Philadelphia paper reports the Sandettes have "broken up."`,
      },
    ],
  },
  {
    id: 'p2_sdt_2',
    category: 'vice',
    chain: { id: 'p2_sandettes', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      rainy: carried('Rainy Hodges'),
      manager: carried('Leonard Voight'),
      gwen: world('ent_gwen_satterfield', 'Gwen Satterfield, the Sandettes\' soprano, who writes everything down', { first: 'Gwendolyn', last: 'Satterfield', nickname: 'Gwen', gender: 'F', age: [20, 24], traits: ['Honest', 'Patient'] }),
      dottie: world('ent_dottie_gaynor', 'Dottie Gaynor, an agent for girl singers who won\'t let anyone push them around', { first: 'Dorothy', last: 'Gaynor', nickname: 'Dottie', gender: 'F', age: [42, 55], traits: ['Honest', 'Hot-headed'] }),
    },
    title: 'Gwen\'s Notebook',
    body: `{gwen.name} keeps a composition notebook with a marbled cover. Every date since 1958: the club, the city, the fee Voight said they got, the fee the club owner says he paid. In the back: royalty statements she copied by hand from his desk while he was in the bathroom. The difference comes to $22,400.

There's also a page Gwen wrote in red. Twice this year Voight booked them for "private parties" at a house in Margate where nobody wanted singers, and the girls left by a back door and walked three miles to the bus.

{dottie.name}, the only agent in New York who handles girl groups and never cheats them, will take the Sandettes the day the contract is broken. "I've seen Voight before," she says on the phone. "He's got money behind him from somebody in Atlantic City. He doesn't let go of anything."`,
    options: [
      {
        text: `Take Gwen's notebook to a lawyer and break the contract in court.`,
        effects: [money(-1500), op('gwen', 20), op('dottie', 15), under('exposure', 15), then('p2_sdt_3', 4, 6, 1)],
        preview: `The slow, honest way. Voight's backers in Atlantic City will have time to notice.`,
      },
      {
        text: `Find out whose money is behind Voight.`,
        effects: [money(-400), flag('p2_sdt_traced'), rivRes('manno', { exposure: 10 }), then('p2_sdt_3', 3, 5, 1)],
        preview: `The Margate house, the money and Voight all lead back to a Manno associate. Now it's a different kind of problem.`,
      },
      {
        text: `Pay the girls their $22,400 yourself, today. Settle with Voight later.`,
        gate: { money: 6000 },
        effects: [money(-6000), op('rainy', 25), op('gwen', 20), then('p2_sdt_3', 3, 5, 1)],
        preview: `Part of it, now, in cash, from you. The girls can pay the rent. Voight won't like being skipped.`,
      },
    ],
  },
  {
    id: 'p2_sdt_3',
    category: 'rivals',
    chain: { id: 'p2_sandettes', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { rainy: carried('Rainy Hodges'), manager: carried('Leonard Voight'), gwen: carried('Gwen Satterfield'), soldier: crewRole('a steady soldier', { rank: ['soldier', 'capo'], notTrait: 'Hot-headed' }) },
    title: 'The House in Margate',
    body: `Voight has booked the Sandettes for another "private party" in Margate on Saturday and told them their contract says they go. Rainy has told him they're not going. Voight has told Rainy that Bettye, the youngest, still lives with her mother in Camden, and that he knows the address.

That's the moment he stops being a crooked manager and becomes something else. It's the kind of thing even your world doesn't do.

{soldier.call} is waiting in the car outside the Harbor Lights for you to tell him what happens next. Rainy is waiting inside.`,
    options: [
      {
        text: `Send {soldier.first} and two men to Margate on Saturday. The party's over. Voight leaves the state.`,
        effects: [under('runout', 20), op('rainy', 25), op('gwen', 15), heat('local', 6), respect(6), rivOp('manno', -8), then('p2_sdt_4', 3, 5, 1)],
        preview: `Nobody is hurt who didn't have it coming, and nobody is hurt badly. The house in Margate is dark by Sunday. Voight is in Baltimore by Monday.`,
      },
      {
        text: `Give Gwen's red page to the Atlantic County Prosecutor's office: the woman who tries the cases nobody else will.`,
        effects: [under('expose'), under('exposure', 25), op('gwen', 25), op('rainy', 15), heat('local', 2), then('p2_sdt_4', 3, 5, 1)],
        preview: `Margaret Quaranta raids the Margate house. Voight goes to trial. The girls testify, together, holding hands.`,
      },
      {
        text: `Move the three girls and Bettye's mother into the Marlin tonight. Under your roof, then decide.`,
        effects: [money(-400), op('rainy', 20), op('gwen', 10), under('strength', -5), then('p2_sdt_4', 3, 5, 1)],
        preview: `Nobody in Atlantic City will try anything under your roof. Voight is still out there, angrier.`,
      },
    ],
  },
  {
    id: 'p2_sdt_4',
    category: 'boardwalk',
    chain: { id: 'p2_sandettes', part: 4 },
    trigger: { chainOnly: true },
    roles: { rainy: carried('Rainy Hodges'), gwen: carried('Gwen Satterfield') },
    title: 'Loyal for a Decade',
    body: `The Sandettes sign with Dottie Gaynor in New York in the fall. Their next record goes to number four nationally. They play the Apollo, a television variety show and a supper club in Chicago.

Every summer for the next ten years, they come back to the island for two weeks and play one place: wherever you tell them. They don't ask for a fee. Rainy brings you a framed gold record with a note taped to the back: "From three girls from Camden. You know what for."`,
    options: [
      {
        text: `Book them at your club every August.`,
        effects: [money(2500), biz('add', 'club', 'pacific'), respect(4), infl('pacific', 4)],
        preview: `Two sold-out weeks every summer. Every Black musician on the circuit hears why they keep coming back.`,
      },
      {
        text: `Tell them to play the Harbor Lights. Hollis earned it.`,
        effects: [respect(5), infl('causeway', 3), op('rainy', 10)],
        preview: `The west side's best room gets the summer's biggest act. You get nothing but the island's goodwill, which pays in other ways.`,
      },
      {
        text: `Hang the gold record in the restaurant, by the coat rack.`,
        effects: [stress(-4), op('rainy', 5)],
        preview: `For twenty years customers ask you about it. You never tell them.`,
      },
    ],
  },

  /* ================================================================ */
  /* 21. VIC MARLOWE'S MARKER                                          */
  /* ================================================================ */
  {
    id: 'p2_vm_1',
    category: 'boardwalk',
    chain: { id: 'p2_marlowe', part: 1 },
    trigger: { hasBusiness: 'club', rivalAlive: 'feldstein', minWeek: 10, once: true, weight: 12 },
    roles: {
      vic: world('ent_vic_marlowe', 'Vic Marlowe, the national crooner', { first: 'Vic', last: 'Marlowe', age: [38, 46], traits: ['Charming', 'Gambler'] }),
      agent: world('ent_swifty_pinsker', 'Swifty Pinsker, the New York agent who books the shore clubs', { first: 'Irving', last: 'Pinsker', nickname: 'Swifty', age: [50, 62], traits: ['Greedy'] }),
      feld: rivalBoss('feldstein', 'Ira Feldstein'),
    },
    title: 'One Week in July',
    body: `{agent.call} Pinsker calls collect from a phone booth on Broadway. "How'd you like {vic.name} for a week in July? Two shows a night. Your room."

Vic Marlowe: Las Vegas showrooms, television specials, a movie career taking off, a face on every jukebox card in America. A week of Vic Marlowe on Pacific Avenue would announce your club to the country.

"Here's the thing," Swifty says. "Vic owes {feld.name}'s casino in Nevada. A lot. Ira has to agree before Vic sings anywhere east of the Mississippi. And Ira will want something. Ira always wants something."`,
    options: [
      {
        text: `Call Feldstein. Ask what he wants.`,
        effects: [rivOp('feldstein', 5), flag('p2_vm_asked'), then('p2_vm_2', 3, 5, 1)],
        preview: `Feldstein wants a percentage of the week's gate and the use of your counting room for two Mondays. You'll find out what for.`,
      },
      {
        text: `Pay Vic's fee and a cut to Feldstein up front.`,
        gate: { money: 6000 },
        effects: [money(-6000), rivOp('feldstein', 10), respect(5), then('p2_vm_2', 3, 5, 1)],
        preview: `Expensive and clean, as clean as anything involving Ira Feldstein is.`,
      },
      {
        text: `"I don't book men who belong to other people."`,
        effects: [respect(1), rivOp('feldstein', -3)],
        preview: `Vic plays Atlantic City instead. Manno's club has its best July ever.`,
      },
    ],
  },
  {
    id: 'p2_vm_2',
    category: 'vice',
    chain: { id: 'p2_marlowe', part: 2 },
    trigger: { chainOnly: true },
    roles: { vic: carried('Vic Marlowe'), feld: carried('Ira Feldstein') },
    title: 'Fourteen Thousand Before Sunrise',
    body: `Vic is magnificent. Two shows a night, standing room only, women crying in the second show, a line down Pacific Avenue to the Wildwood Avenue corner.

After the late show on Thursday he finds your card game over the bakery and sits down with a highball and a cigarette and the happiest smile you've ever seen. By sunrise he's lost fourteen thousand dollars to a lumber dealer from Vineland and a dentist from Bryn Mawr.

"Put it on my tab," he says, cheerfully. "You're good for it. I'm good for it." He's been good for it to a lot of people, from the look of his hands.`,
    options: [
      {
        text: `Extend the credit. A star who owes you is a star who comes back.`,
        effects: [money(-14000), hook('vic', 'He owes your game fourteen thousand dollars', true), op('vic', 15), flag('p2_vm_credit'), then('p2_vm_3', 3, 5, 1)],
        preview: `You cover the table. Vic Marlowe owes you a fortune. So, it turns out, does he owe several other people.`,
      },
      {
        text: `Cover it, and cut him off. No more games on this island.`,
        effects: [money(-14000), op('vic', -10), respect(3), then('p2_vm_3', 3, 5, 1)],
        preview: `He's insulted. He's also sober by Saturday's show.`,
      },
      {
        text: `Make him pay the table now, out of his fee.`,
        effects: [money(2000), op('vic', -20), rivOp('feldstein', -5), then('p2_vm_3', 3, 5, 1)],
        preview: `The players are paid. Vic finishes the week for nothing and tells Swifty you're a peasant.`,
      },
    ],
  },
  {
    id: 'p2_vm_3',
    category: 'rivals',
    chain: { id: 'p2_marlowe', part: 3 },
    trigger: { chainOnly: true },
    roles: { vic: carried('Vic Marlowe'), feld: carried('Ira Feldstein'), manno: rivalBoss('manno', 'Carmine Manno') },
    title: 'The Stage Door on Saturday',
    body: `Two men are waiting at the stage door after Saturday's late show. They're not autograph seekers. They're from Atlantic City.

Vic's marker with Feldstein's Nevada casino, it turns out, was sold last month, at a discount, to {manno.name}. Carmine bought it because he can collect in person, on the East Coast, any time Vic sings within a hundred miles of the Boardwalk. Like tonight. In your club.

Vic is in his dressing room with the door locked, in his undershirt, calling Swifty in New York. He asks for you.`,
    options: [
      {
        text: `Walk him out the front door yourself, past Manno's men, to your car.`,
        effects: [op('vic', 25), rivOp('manno', -12), respect(8), feud('manno'), then('p2_vm_4', 4, 8, 1)],
        preview: `The whole street sees you take Vic Marlowe under your protection. Carmine Manno sees it too.`,
      },
      {
        text: `Buy the marker from Manno. Tonight, at the stage door.`,
        gate: { money: 8000 },
        effects: [money(-8000), hook('vic', 'You own his marker now', true), rivOp('manno', 4), flag('p2_vm_owner'), then('p2_vm_4', 4, 8, 1)],
        preview: `You own Vic Marlowe's debt. It's an asset, if you're the kind of man who collects from a crooner.`,
      },
      {
        text: `Call Feldstein. It was his marker. Let him explain it to Manno.`,
        effects: [rivOp('feldstein', -6), rivOp('manno', -4), stress(3), then('p2_vm_4', 4, 8, 1)],
        preview: `New York and Atlantic City argue on the phone for an hour while Vic hides under a dressing-room table.`,
      },
    ],
  },
  {
    id: 'p2_vm_4',
    category: 'boardwalk',
    chain: { id: 'p2_marlowe', part: 4 },
    trigger: { chainOnly: true },
    roles: { vic: carried('Vic Marlowe') },
    title: 'On National Television',
    body: `Vic Marlowe has a television special in October: a full hour, sponsored by an automobile company, with a big orchestra and two guest stars. Halfway through, between songs, he loosens his tie and looks into the camera.

"I want to say hello to a little town on the Jersey Shore called Wildwood, where some people looked out for me this summer. You know who you are." He winks.

Every club owner in America sees it. So does the FBI's office in Newark, which takes notes on these things.`,
    immediate: [heat('federal', 3)],
    options: [
      {
        text: `Send him a case of Barolo and a thank-you note.`,
        effects: [money(-200), op('vic', 10), respect(6), infl('pacific', 3)],
        preview: `The club is booked solid for two years on the strength of one wink.`,
      },
      {
        text: `Forgive the marker. Let him owe you something better than money.`,
        gate: { flag: 'p2_vm_owner' },
        effects: [op('vic', 30), hook('vic', 'You tore up his marker', true), respect(4)],
        preview: `A national star who owes you his career and knows it. That kind of debt never gets paid off and never goes bad.`,
      },
      {
        text: `Ask Swifty for Vic again next July. Same terms.`,
        effects: [money(3000), rivOp('feldstein', 3), heat('federal', 2)],
        preview: `Vic comes back. He doesn't gamble this time. He mostly sits on the beach in a hat.`,
      },
    ],
  },

  /* ================================================================ */
  /* 22. LOW TIDE                                                      */
  /* ================================================================ */
  {
    id: 'p2_pic_1',
    category: 'boardwalk',
    chain: { id: 'p2_picture', part: 1 },
    trigger: { minWeek: 30, moneyAbove: 10000, once: true, weight: 11 },
    roles: {
      producer: world('ent_saul_wexman', 'Saul Wexman, an independent producer of hard-edged crime pictures', { first: 'Saul', last: 'Wexman', age: [44, 56], traits: ['Ambitious', 'Charming'] }),
      star: world('ent_tony_valetti', 'Tony Valetti, who plays tough guys in every crime picture', { first: 'Anthony', last: 'Valetti', nickname: 'Tony', age: [36, 46], traits: ['Charming', 'Hot-headed'] }),
    },
    title: 'A Picture Called Low Tide',
    body: `{producer.name} flies into Atlantic City on a two-engine plane and takes you to lunch at the Admiral, where he orders the lobster and talks with his hands. He makes crime pictures. Fast, mean and cheap; the critics hate them and the drive-ins love them.

His next one is called Low Tide. A shore town, a summer, a boss who runs the Boardwalk from the back of a restaurant, a reporter who wants to take him down. {star.name} has agreed to play the boss. The studio dropped it last week. Wexman needs forty thousand dollars and a town that will let him shoot on its streets.

He slides the script across the tablecloth. "Read the first ten pages," he says. "You'll recognize some things. I've been coming here every summer since the war."`,
    options: [
      {
        text: `Put in the forty thousand. Through a lumber company in Vineland.`,
        gate: { money: 12000 },
        effects: [money(-12000), unwashed(-10000), op('producer', 20), flag('p2_pic_backer'), then('p2_pic_2', 4, 8, 1)],
        preview: `Your money in the movies, laundered through lumber. If the picture hits, it's clean money coming back. If it doesn't, it's an expensive education.`,
      },
      {
        text: `No money. But you'll get him the permits and the town.`,
        effects: [favor(-1), op('producer', 8), then('p2_pic_2', 4, 8, 1)],
        preview: `Wexman finds money in New York. He shoots on your streets, owing you for the street.`,
      },
      {
        text: `"Change the boss. Make him from Atlantic City."`,
        effects: [op('producer', -5), rivOp('manno', -4), respect(2), flag('p2_pic_ac'), then('p2_pic_2', 4, 8, 1)],
        preview: `Wexman agrees with a smile. The boss in Low Tide now has a very familiar Atlantic City temper.`,
      },
    ],
  },
  {
    id: 'p2_pic_2',
    category: 'town',
    chain: { id: 'p2_picture', part: 2 },
    trigger: { chainOnly: true },
    roles: { producer: carried('Saul Wexman'), star: carried('Tony Valetti') },
    title: 'Tony Valetti Wants to Learn the Part',
    body: `The location shoot takes over Pacific Avenue for three weeks in September: lights on scaffolds, a generator truck, a hundred local extras at ten dollars a day, and a lot of Wildwood girls suddenly very interested in the catering tent.

{star.name} has decided he's going to study you. He's been eating lunch at your restaurant every day, at the table by the window, watching the way you take a phone call and the way you button your coat. He's asked if he can ride along on a "normal day." He wants to know how you'd say "Take him for a walk."

Photographers follow him everywhere. Everywhere he goes, so do you.`,
    options: [
      {
        text: `Let him ride along. A very boring normal day: the bank, the barber, the church.`,
        effects: [op('star', 15), heat('federal', 2), respect(3), then('p2_pic_3', 4, 8, 1)],
        preview: `Tony learns how a respectable businessman spends Tuesday. The photographs are wonderful publicity for everyone.`,
      },
      {
        text: `Keep him at arm's length. No pictures together.`,
        effects: [op('star', -10), heat('federal', -2), then('p2_pic_3', 4, 8, 1)],
        preview: `He plays the boss as a man who never lets anybody close, which turns out to be the right choice.`,
      },
      {
        text: `Give him one real story from 1956, off the record.`,
        gate: { trait: 'Charming' },
        effects: [op('star', 25), op('producer', 10), evidence('player', 3), then('p2_pic_3', 4, 8, 1)],
        preview: `Tony Valetti does your story on screen better than you lived it. Somebody else in the audience will recognize it too.`,
      },
    ],
  },
  {
    id: 'p2_pic_3',
    category: 'law',
    chain: { id: 'p2_picture', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      producer: carried('Saul Wexman'),
      editor: world('ent_edith_rand', 'Edith Rand, a film editor making a documentary about the shore\'s summer workers', { first: 'Edith', last: 'Rand', gender: 'F', age: [30, 40], traits: ['Honest', 'Patient'] }),
      soldier: crewRole('a soldier who collects on Pacific Avenue', { rank: ['soldier', 'associate'] }),
    },
    title: 'Edith Rand\'s Footage',
    body: `{editor.name} cuts Wexman's dailies at night in a rented room above the Five and Ten. In the daytime she shoots her own film with a borrowed 16mm camera: a documentary about the shore's summer workers, the dishwashers, chambermaids and ride boys. She has a grant from a foundation in New York. She is very serious about it.

In one of her shots, behind a dishwasher smoking on a fire escape, {soldier.call} takes an envelope from a Wildwood police sergeant in uniform, counts it, and hands half back.

Wexman has seen it. "She won't sell it," he tells you. "I offered. She says it's about the dishwasher, and she's not cutting the dishwasher to save a cop. She's not afraid of anybody. That's the trouble with documentary people."`,
    options: [
      {
        text: `Go see her yourself. Ask her what she wants for the dishwasher.`,
        effects: [op('editor', 10), then('p2_pic_4', 6, 10, 1)],
        preview: `She wants the dishwasher paid the minimum wage. She wants all of them paid. She says it like a price.`,
      },
      {
        text: `Make sure the sergeant and {soldier.first} stop meeting on fire escapes, and let her film whatever she wants.`,
        effects: [op('soldier', -6), heat('local', 3), op('editor', 5), then('p2_pic_4', 6, 10, 1)],
        preview: `The shot stays in her film. Nobody who matters will ever see a documentary about dishwashers. Probably.`,
      },
      {
        text: `Have her room above the Five and Ten burgled. Just the cans of film.`,
        effects: [op('editor', -30), op('producer', -15), heat('local', 6), evidence('player', 4), then('p2_pic_4', 6, 10, 1)],
        preview: `She had a copy at the lab in New York. She also now has a story about who stole her film.`,
      },
    ],
  },
  {
    id: 'p2_pic_4',
    category: 'boardwalk',
    chain: { id: 'p2_picture', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: {
      producer: carried('Saul Wexman'),
      editor: carried('Edith Rand'),
      theater: world('civ_saul_plotkin', 'Saul Plotkin, who shows the first-run pictures all summer', { first: 'Saul', last: 'Plotkin', age: [55, 68] }),
    },
    title: 'The Premiere at the Strand',
    body: `Low Tide premieres at {theater.name}'s theater on a hot night the following June with searchlights in the sky, a red carpet on the sidewalk and Tony Valetti in a white dinner jacket. Half the town is in it as extras, and they cheer every time they see themselves.

The boss in the picture is a man who runs the Boardwalk from the back of a restaurant and loves his mother and dies on the beach at dawn. The audience gasps. You're in the third row. Your wife holds your hand very tightly.

In the lobby afterward, everybody wants to shake your hand. A man in a gray suit by the popcorn machine doesn't.`,
    options: [
      {
        text: `The picture's a hit. Take your money back through the lumber company.`,
        gate: { flag: 'p2_pic_backer' },
        effects: [money(18000), respect(6), heat('federal', 5), op('producer', 10)],
        preview: `Clean money from Hollywood, and your name in the trade papers as a "Vineland lumber investor." Wexman wants to make a sequel.`,
      },
      {
        text: `Pay the summer dishwashers at your fronts a fair wage, the way Edith Rand asked.`,
        effects: [money(-1500), op('editor', 25), infl('{district}', 4), respect(3)],
        preview: `Her documentary ends with a title card about a Wildwood restaurant that raised its kitchen wages. She never says whose.`,
      },
      {
        text: `Shake hands with the man in the gray suit, too.`,
        gate: { trait: 'Charming' },
        effects: [heat('federal', -3), respect(3), stress(-2)],
        preview: `He's from the Newark office. He liked the picture. He says so, then says he's seen the real one, and leaves.`,
      },
      {
        text: `Leave before the lights come up.`,
        effects: [stress(-3)],
        preview: `You don't want to see the end twice.`,
      },
    ],
  },

  /* ================================================================ */
  /* 23. SEASHELL RECORDS                                              */
  /* ================================================================ */
  {
    id: 'p2_sea_1',
    category: 'boardwalk',
    chain: { id: 'p2_seashell', part: 1 },
    trigger: { between: { from: { y: 1960, m: 9 }, to: { y: 1962, m: 6 } }, once: true, weight: 12 },
    roles: {
      lipman: world('ent_harvey_lipman', 'Harvey Lipman, owner of Seashell Records', { first: 'Harvey', last: 'Lipman', age: [44, 56], traits: ['Greedy', 'Paranoid'] }),
      ruth: world('ent_ruth_engel', 'Ruth Engel, a young songwriter with two hits for girl groups', { first: 'Ruth', last: 'Engel', gender: 'F', ethnicity: 'Jewish', age: [24, 30], traits: ['Ambitious', 'Honest'] }),
    },
    title: 'Seashell Records, Cheap',
    body: `After the hearings, {lipman.name} wants out of the record business. He owns Seashell Records, the hottest independent label in Philadelphia, and he'd like to own a dry-cleaning chain in Florida instead. He'll sell the label, the catalog and the contracts for a third of what it was worth a year ago.

The real value of Seashell isn't Harvey, though. It's {ruth.name}, a twenty-six-year-old songwriter from the Bronx who wrote two of the label's biggest hits on a piano in a rented room above a dentist on Chestnut Street. She doesn't have a contract. Harvey forgot.

She comes to the meeting uninvited. "If you buy it, I want to run the publishing," she says. "In my name. You can be the silent partner. You'll make more money than Harvey ever did, and it'll be legal."`,
    options: [
      {
        text: `Buy it. Ruth runs publishing, in her name.`,
        gate: { money: 8000 },
        effects: [money(-8000), unwashed(-6000), biz('add', 'club', 'downtown'), op('ruth', 25), flag('p2_sea_ruth'), then('p2_sea_2', 6, 10, 1)],
        preview: `A record label with a woman's name on the publishing and yours nowhere. It's the most legitimate thing you own.`,
      },
      {
        text: `Buy it. You run everything; Ruth writes songs.`,
        gate: { money: 8000 },
        effects: [money(-8000), unwashed(-6000), biz('add', 'club', 'downtown'), op('ruth', -15), then('p2_sea_2', 6, 10, 1)],
        preview: `You own a label. Ruth Engel will be in New York by Christmas, writing hits for somebody else.`,
      },
      {
        text: `Pass. Records are a young man's game.`,
        effects: [op('ruth', -5)],
        preview: `Irv Gladstone in New York buys it. Ruth goes with it.`,
      },
    ],
  },
  {
    id: 'p2_sea_2',
    category: 'vice',
    chain: { id: 'p2_seashell', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      ruth: carried('Ruth Engel'),
      herb: world('ent_herb_ziegler', 'Herb Ziegler, who owns a record-pressing plant in Camden', { first: 'Herbert', last: 'Ziegler', nickname: 'Herb', age: [48, 60], traits: ['Greedy'] }),
    },
    title: 'The Second Shift in Camden',
    body: `{herb.name} presses records in Camden for half the labels on the East Coast. He comes to see you with a proposition: a second shift, at night, pressing extra copies of Seashell's hits and of other people's hits, with counterfeit labels, sold out of trucks to jukebox operators and five-and-dimes from Baltimore to Boston.

"No royalties, no taxes, no paper," Herb says. "Fifty thousand records a month. The labels never know."

{ruth.first} Engel finds out the way she finds out everything: by reading the invoices. She comes to your office with a stack of them. "Bootlegging my own songs," she says. "My songs. Every copy you press at night is a copy I don't get paid for, and neither do the girls who sang it."`,
    options: [
      {
        text: `Turn Herb down. Ruth's label stays clean.`,
        effects: [op('ruth', 20), respect(2), then('p2_sea_3', 8, 14, 1)],
        preview: `You leave fifty thousand records a month on the table. Ruth stops reading your invoices.`,
      },
      {
        text: `Run the second shift, but only on other labels' records.`,
        effects: [money(2500), unwashed(2500), op('ruth', -10), heat('federal', 4), evidence('player', 3), then('p2_sea_3', 8, 14, 1)],
        preview: `Real money in the dark. Ruth knows that a man who bootlegs other people's songs will get around to hers.`,
      },
      {
        text: `Run it on everything. Ruth can write more songs.`,
        effects: [money(4500), unwashed(4500), op('ruth', -30), heat('federal', 6), evidence('player', 5), flag('p2_sea_bootleg'), then('p2_sea_3', 8, 14, 1)],
        preview: `A fortune from a pressing plant in Camden. Ruth Engel takes a meeting with a lawyer in New York.`,
      },
    ],
  },
  {
    id: 'p2_sea_3',
    category: 'rivals',
    chain: { id: 'p2_seashell', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      ruth: carried('Ruth Engel'),
      juke: world('ent_lou_carlucci', 'Lou Carlucci, who stocks the jukeboxes across South Jersey for Philadelphia', { first: 'Louis', last: 'Carlucci', nickname: 'Lou', ethnicity: 'Italian', age: [45, 58], traits: ['Greedy'] }),
    },
    title: 'A Hit Needs Jukeboxes',
    body: `Seashell has a hit: a girl-group record Ruth wrote in a week, about a lifeguard who never looks up from his chair. It's number six in Philadelphia and climbing.

Then it stops climbing. {juke.name}, who stocks every jukebox in South Jersey for the Table, has decided that a record from a label you own doesn't go in his machines unless the Table gets two cents a play.

{ruth.first} doesn't care who owns the jukeboxes. "Find out what it costs," she says. "Then decide if the song is worth it. I think it is."`,
    options: [
      {
        text: `Pay the Table its two cents. A hit's a hit.`,
        effects: [money(2000), rivOp('philly', 5), op('ruth', 10)],
        preview: `The record goes to number two nationally. The Table now considers your label one of its businesses.`,
      },
      {
        text: `Go around Carlucci: the DJs, the TV dance show, the record stores.`,
        effects: [money(800), rivOp('philly', -8), op('ruth', 15), infl('boardwalk', 3)],
        preview: `It's slower, and it makes the Table angry, and it still gets to number nine. Ruth respects you for it.`,
      },
      {
        text: `Ruth sold out to New York. Sell her songs and her label to Irv Gladstone and get out.`,
        gate: { flag: 'p2_sea_bootleg' },
        effects: [money(6000), biz('close', 'club'), op('ruth', -10), heat('federal', -4)],
        preview: `Gladstone buys the catalog and Ruth's lawsuit with it. You walk away with money and a story about the record business.`,
      },
    ],
  },

  /* ================================================================ */
  /* 24. SUNSET ON OCEAN AVENUE                                        */
  /* ================================================================ */
  {
    id: 'p2_cs_1',
    category: 'boardwalk',
    chain: { id: 'p2_candy', part: 1 },
    trigger: { season: 'summer', between: { from: { y: 1960, m: 6 }, to: { y: 1963, m: 9 } }, once: true, weight: 12 },
    roles: {
      candy: world('ent_candy_sheridan', 'Candy Sheridan, a Wildwood girl with a regional hit, "Sunset on Ocean Avenue"', { first: 'Constance', last: 'Sheridan', nickname: 'Candy', gender: 'F', age: [19, 23], traits: ['Ambitious', 'Honest'] }),
      gladstone: world('ent_irv_gladstone', 'Irv Gladstone, a New York record producer who buys hot regional acts', { first: 'Irving', last: 'Gladstone', nickname: 'Irv', age: [42, 55], traits: ['Greedy', 'Charming'] }),
    },
    title: 'The Girl From Ocean Avenue',
    body: `{candy.name} grew up over her father's barbershop on Ocean Avenue and sang in the choir at St. Ann's, and this summer her record "Sunset on Ocean Avenue" is on every radio on the island. She recorded it in a studio in Philadelphia for a hundred dollars of her own money.

{gladstone.name} from New York has offered her a contract: five years, two percent royalties, and he owns the recordings forever. Harvey Lipman offered three percent and the same forever.

She comes to your restaurant with her father, who cut your hair for twenty years. "Everybody says you know how these things work," she says. "I want to own my own records. Not Irv. Not Harvey. Me. Is that a crazy thing to want?"`,
    options: [
      {
        text: `"Not crazy. Expensive. I'll back you: your own label, your masters."`,
        gate: { money: 3000 },
        effects: [money(-3000), op('candy', 25), flag('p2_cs_masters'), then('p2_cs_2', 4, 8, 1)],
        preview: `A nineteen-year-old with her own record label and you as a silent partner. If she becomes a star, she owns herself.`,
      },
      {
        text: `"Take Irv's deal. Five years goes fast, and New York makes stars."`,
        effects: [op('candy', -5), then('p2_cs_2', 4, 8, 1)],
        preview: `Sound advice in 1960. She signs. She'll learn what "forever" means.`,
      },
      {
        text: `Sign her yourself. Your management, a straight twenty percent, her masters at the end.`,
        effects: [op('candy', 12), money(-1000), flag('p2_cs_managed'), then('p2_cs_2', 4, 8, 1)],
        preview: `You manage a singer. It's a new line of work. It comes with a whole set of new men who want envelopes.`,
      },
    ],
  },
  {
    id: 'p2_cs_2',
    category: 'vice',
    chain: { id: 'p2_candy', part: 2 },
    trigger: { chainOnly: true },
    roles: { candy: carried('Candy Sheridan'), host: world('ent_jerry_kincaid', 'Jerry Kincaid, the TV dance-show host', { first: 'Gerald', last: 'Kincaid', nickname: 'Jerry', age: [30, 36], traits: ['Charming'] }) },
    title: 'The Price of Four O\'Clock',
    body: `{host.name} would love to have {candy.first} on Kincaid's Record Hop. National television, four o'clock, every teenager in America. Payola is a crime now, of course. So nobody asks for an envelope.

Instead, his producer mentions that Jerry has a small interest in a music publisher, and that a girl who signed her B-side over to that publisher would certainly get a lot of airplay.

{candy.first} says no before you can say anything. "I'm not giving away my song to be on television," she says. "If I'm good enough, they'll put me on. If I'm not, I'll sing at weddings." She means it.`,
    options: [
      {
        text: `Respect it. She goes on when she's good enough.`,
        effects: [op('candy', 15), respect(2), then('p2_cs_3', 8, 14, 1)],
        preview: `It takes eight more months. When she finally goes on, she owns every note.`,
      },
      {
        text: `Get her on the show some other way. Jerry owes you, or will.`,
        effects: [op('host', -5), op('candy', 5), favor(-1), then('p2_cs_3', 6, 10, 1)],
        preview: `She's on in two weeks. She thinks she got there herself. Jerry knows otherwise.`,
      },
      {
        text: `Sign the B-side over behind her back.`,
        effects: [op('candy', -30), money(500), flag('p2_cs_betrayed'), then('p2_cs_3', 6, 10, 1)],
        preview: `She's on national television next week, and she finds out the week after.`,
      },
    ],
  },
  {
    id: 'p2_cs_3',
    category: 'romance-nonexplicit',
    chain: { id: 'p2_candy', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      candy: carried('Candy Sheridan'),
      gary: world('ent_gary_lindner', 'Gary Lindner, who leads the Riptides, a teen instrumental band', { first: 'Gary', last: 'Lindner', age: [20, 24], traits: ['Charming', 'Hot-headed'] }),
    },
    title: 'A Tour Bus to Ohio',
    body: `A national package tour wants {candy.first}: thirty-one cities in thirty-four days on a Greyhound with eight other acts, from Pittsburgh to Kansas City and back. It's how everybody becomes a star.

It's also where she'd be for the rest of the summer, instead of at your club, where she's been packing the place on weekends. And {gary.name} of the Riptides, the guitar player she's been seen with on the Hunt's Pier Ferris wheel, is on the tour too. Her father doesn't like him. Her father doesn't like anybody with a guitar.

She asks you, because her father asked her to.`,
    options: [
      {
        text: `"Go. Be a star. The club will be here."`,
        effects: [op('candy', 20), money(-1500), respect(2), then('p2_cs_4', 10, 20, 1)],
        preview: `You lose your best act for the summer and gain a hometown girl in thirty-one cities.`,
      },
      {
        text: `"Stay through Labor Day. Then go." Double her fee.`,
        effects: [money(1200), op('candy', -5), then('p2_cs_4', 10, 20, 1)],
        preview: `A great August at the club. The tour finds another girl singer, and that girl gets the national hit.`,
      },
      {
        text: `Have a word with Gary about the Sheridan family's expectations.`,
        effects: [op('gary', -10), op('candy', -10), then('p2_cs_4', 10, 20, 1)],
        preview: `Gary is polite and terrified. Candy finds out and is furious: it's her life, she says, and her Ferris wheel.`,
      },
    ],
  },
  {
    id: 'p2_cs_4',
    category: 'boardwalk',
    chain: { id: 'p2_candy', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { candy: carried('Candy Sheridan') },
    title: 'The Magazine Interview',
    body: `{candy.first} Sheridan is on the cover of a teen magazine in a sailor collar: "Wildwood's Sweetheart." Inside, four pages about her father's barbershop, her choir, her first car (a turquoise Ford Falcon) and how she made it.

The reporter asked her about the rumors: that a certain Wildwood businessman backed her career. You read her answer in the barber's chair, under a hot towel, while her father pretends not to watch you.`,
    options: [
      {
        text: `She owns her masters. She tells the truth: a friend of the family believed in her.`,
        gate: { flag: 'p2_cs_masters' },
        effects: [op('candy', 15), respect(6), money(2500), infl('boardwalk', 3)],
        preview: `"He never asked me for a thing," she says. Your share of her records pays for your granddaughter's college.`,
      },
      {
        text: `He signed away her B-side. She tells the truth about that too.`,
        gate: { flag: 'p2_cs_betrayed' },
        effects: [op('candy', -10), heat('local', 3), respect(-4)],
        preview: `"Some people in my hometown think they own you," she tells America. Everybody on the island knows who she means.`,
      },
      {
        text: `However she answered, send her father's barbershop a new chair.`,
        effects: [money(-300), op('candy', 5), stress(-2)],
        preview: `Red leather, chrome footrest. He puts it by the window. Every haircut you get there for the rest of your life is free.`,
      },
    ],
  },
];

