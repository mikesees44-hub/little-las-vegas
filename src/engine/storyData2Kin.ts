import type { PackEvent } from './storyDataSchema';
import {
  alliance, biz, carried, crewOp, crewRole, evidence, famOp, famRole, favor, flag, heat, hook, infl, leave, money,
  op, prison, recruit, respect, rivOp, rivalBoss, stress, thenFx as then, townie,
} from './storyDataSchema';
import { kin, world } from './storyData2Cast';

/**
 * Extended family
 * 13. Zio Tano Says        (p2_unc_*)  the uncle you made the front boss
 * 14. Two Cousins          (p2_cz_*)   a cousin who's a priest, a cousin who's a cop
 * 15. The Man From Calabria (p2_old_*) the grandfather from the old country, and what happened in 1933
 * 16. Zia Rosaria's Will   (p2_will_*) an aunt, her friend of thirty years, and two wills
 * 17. The Wedding of the Year (p2_wed_*) your niece marries a Camden capo's son
 * 18. The Godson           (p2_gs_*)   a soldier's widow and the boy who wants in
 */
export const KIN: PackEvent[] = [
  /* ================================================================ */
  /* 13. ZIO TANO SAYS                                                 */
  /* ================================================================ */
  {
    id: 'p2_unc_1',
    category: 'table',
    chain: { id: 'p2_uncle', part: 1 },
    trigger: { heatAbove: { federal: 25 }, minWeek: 20, once: true, weight: 14 },
    roles: {
      tano: kin('uncle', 'Zio Tano, your father\'s older brother, retired', { first: 'Gaetano', nickname: 'Zio Tano', gender: 'M', ethnicity: 'Italian', age: [64, 72], traits: ['Charming', 'Hot-headed'], rank: 'civilian' }),
      sal: rivalBoss('philly', 'Sal Moretti'),
    },
    title: 'A Face for the Newspapers',
    body: `{sal.name} explains it over a plate of clams at a place in Gloucester City where the waiters are all over seventy. "The government wants a face. You've got too much face right now. So give them one."

The face he means is your uncle. {tano.call}, your father's older brother: sixty-eight, retired from the bread-delivery business, white hair like a movie senator, ran a small crew in the thirties until his nerves went. He still wears a fedora to the barber. He still calls you "the kid."

"Make him the boss," Sal says. "On paper. In the papers. He holds court at the Ivanhoe, he goes to the wakes, the Feds take his picture. You run things from your kitchen. The old man gets to feel like somebody again. Everybody wins." He eats a clam. "Or tell him nothing. Some men are happier not knowing they're a coat rack."`,
    options: [
      {
        text: `Tell {tano.first} the deal. He takes the title and the heat, and he knows it.`,
        effects: [heat('federal', -10), op('tano', 15), money(-500), flag('p2_unc_willing'), then('p2_unc_2', 4, 8, 1)],
        preview: `A willing figurehead: paid, honored and aware. The Feds' photographs start to have white hair in them.`,
      },
      {
        text: `Let him believe it's real. The men will play along.`,
        effects: [heat('federal', -12), op('tano', 25), crewOp(-3), flag('p2_unc_unaware'), then('p2_unc_2', 4, 8, 1)],
        preview: `Zio Tano thinks the family finally came to its senses. It's the happiest you've ever seen him, and it's built on a lie.`,
      },
      {
        text: `"I'm the boss. I'll wear my own face."`,
        effects: [respect(5), rivOp('philly', -4), heat('federal', 3)],
        preview: `Sal shrugs and pays for the clams. He'll remember that you said no.`,
      },
    ],
  },
  {
    id: 'p2_unc_2',
    category: 'crew',
    chain: { id: 'p2_uncle', part: 2 },
    trigger: { chainOnly: true },
    roles: { tano: carried('Zio Tano'), sal: carried('Sal Moretti'), soldier: crewRole('a soldier with a request', { rank: ['soldier', 'associate'] }) },
    title: 'Reputed',
    body: `The Inquirer runs a photograph of {tano.call} coming out of the Ivanhoe in his camel coat, tipping his hat at the camera like it's the Easter Parade. The caption calls him "the reputed head of Wildwood's rackets." He has it framed. He sends one to his sister in Bayonne.

He also, it turns out, has started giving orders. He approved a $2,000 loan to {soldier.call} without asking you. He promised one of Danny Kessler's men a sit-down "with the family" about a cigarette route. He told the Monsignor the family would pay for the new roof on the school, all of it.

"I'm the boss," he says, when you visit him at the barber's. "A boss decides. Your father, God rest him, would have wanted me to decide."`,
    options: [
      {
        text: `Honor the loan and the roof. Quietly cancel the Kessler sit-down.`,
        effects: [money(-3500), op('tano', 10), op('soldier', 10), famOp(4), then('p2_unc_3', 6, 10, 1)],
        preview: `Expensive, but the act holds. The bill for a figurehead is paid in full and in installments.`,
      },
      {
        text: `Tell the capos: nothing Zio Tano says is real unless it comes through you.`,
        effects: [crewOp(2), flag('p2_unc_bypassed'), then('p2_unc_3', 3, 6, 1)],
        preview: `The men understand. Old men always find out what other men understand.`,
      },
      {
        text: `Let him decide small things. A boss's dignity is cheap at this price.`,
        effects: [money(-1500), op('tano', 15), heat('federal', -3), then('p2_unc_3', 6, 10, 1)],
        preview: `He gets the roof and the loans; you keep everything that matters. For now that line holds.`,
      },
    ],
  },
  {
    id: 'p2_unc_3',
    category: 'family',
    chain: { id: 'p2_uncle', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      tano: carried('Zio Tano'),
      oldcapo: crewRole('your oldest capo, who served under your father', { rank: 'capo', age: [55, 75] }),
    },
    title: 'A Coat Rack in a Camel Coat',
    body: `It's {oldcapo.call} who tells him, at the cigar store, after two anisettes. Not to be cruel. Out of friendship, the way old men tell each other they've got spinach in their teeth.

"Tano. They meet in the kid's kitchen on Thursdays. They've been meeting there the whole time. You're the picture in the paper. You're the coat rack."

{tano.first} doesn't come to Sunday dinner. He doesn't go to the barber's. On Wednesday he shows up at your kitchen door at seven in the morning in his undershirt and his fedora, and he looks a hundred years old, and he says, "Is it true?"`,
    options: [
      {
        text: `"It's true. And you're doing the most important job in this family."`,
        gate: { flag: 'p2_unc_willing' },
        effects: [op('tano', 10), stress(-3), flag('p2_unc_reconciled'), then('p2_unc_4', 8, 14, 1)],
        preview: `He always knew, he says. He just didn't like hearing it from a man with anisette on his breath.`,
      },
      {
        text: `"It's true." Then give him something real: the Causeway route, his own.`,
        effects: [op('tano', 15), money(-800), crewOp(-2), flag('p2_unc_real'), then('p2_unc_4', 8, 14, 1)],
        preview: `An old man with a real route and a real crew of four. The real thing is better than the picture, and more dangerous.`,
      },
      {
        text: `"Who told you that? It's not true. You're the boss, Zio."`,
        effects: [op('tano', -5), op('oldcapo', -10), stress(6), flag('p2_unc_lied'), then('p2_unc_4', 6, 10, 1)],
        preview: `He wants to believe you. He goes back to the barber's. He watches the kitchen door.`,
      },
    ],
  },
  {
    id: 'p2_unc_4',
    category: 'crew',
    chain: { id: 'p2_uncle', part: 4 },
    trigger: { chainOnly: true },
    roles: { tano: carried('Zio Tano'), oldcapo: carried('the old capo') },
    title: 'Seventy Candles at the Admiral',
    body: `{tano.call}'s seventieth birthday is in the Admiral's ballroom: a five-tier cake, an accordion player, a hundred and forty people, every old man who ever ran a crew from Camden to Cape May. He makes a toast in Italian and then in English.

"To the boss," he says, and lifts his glass, and looks around the room, and the room is very quiet. Then {oldcapo.call} lifts his glass. Then two more of the old capos lift theirs, men who served under your father. They're not looking at you. They're looking at him.

Later, by the cake, your consigliere murmurs that three regimes' worth of old men just told the whole South Jersey underworld that they'd rather take orders from a seventy-year-old bread man than from you.`,
    options: [
      {
        text: `Lift your own glass to him. Let the old men have their night.`,
        effects: [op('tano', 15), op('oldcapo', 10), respect(-3), crewOp(3), then('p2_unc_5', 10, 20, 1)],
        preview: `You look gracious. Whether you look weak depends on who's telling the story tomorrow.`,
      },
      {
        text: `Retire {oldcapo.first}. Florida, a pension, a gold watch.`,
        effects: [leave('oldcapo', 'retires'), respect(5), crewOp(-5), op('tano', -15), then('p2_unc_5', 10, 20, 1)],
        preview: `An example made with a gold watch. The other old men read it perfectly.`,
      },
      {
        text: `Sit with Tano after the cake and ask him what he wants.`,
        gate: { trait: 'Patient' },
        effects: [op('tano', 20), stress(-4), flag('p2_unc_heard'), then('p2_unc_5', 10, 20, 1)],
        preview: `"To be remembered for something," he says. "Your father got everything. I got a bread truck."`,
      },
    ],
  },
  {
    id: 'p2_unc_5',
    category: 'law',
    chain: { id: 'p2_uncle', part: 5 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { tano: carried('Zio Tano'), prosecutor: rivalBoss('law', 'the County Prosecutor') },
    title: 'The People Versus the Picture',
    body: `The grand jury hands up its indictment on a Tuesday, and the name at the top of it is {tano.name}: conspiracy, bookmaking, operating a gambling enterprise. The picture in the newspaper finally came true. {prosecutor.name} gives a press conference in front of the courthouse in Cape May Court House and calls it "the beheading of Wildwood's rackets."

{tano.first} is out on bail by supper. He knows the Thursday kitchen. He knows the Causeway, the motels, the county garage, the names. He is seventy years old and his lawyer says he's looking at six to ten.

He asks to see you alone, on the bench in front of the Wildwood Fire Department where he used to sit with your father.`,
    immediate: [heat('federal', 5)],
    options: [
      {
        text: `He knew the bargain. He takes the fall with honor, and you take care of everything.`,
        gate: { flag: 'p2_unc_willing' },
        effects: [prison('tano', 150), money(-5000), heat('federal', -15), evidence('player', -15), respect(8), famOp(4), stress(6)],
        preview: `"This is what I was for," he says. He does it with his hat on. The family pays his wife's bills until the day he walks out.`,
      },
      {
        text: `He found out he was a coat rack. Now he's talking about the State Police.`,
        gate: { flag: 'p2_unc_lied' },
        effects: [evidence('player', 20), heat('federal', 10), op('tano', -30), stress(15)],
        preview: `He never quite flips. He just stops protecting you, and he knows where everything is.`,
      },
      {
        text: `Hire the best lawyer in Philadelphia and fight it.`,
        gate: { money: 6000 },
        effects: [money(-6000), op('tano', 20), evidence('player', 5), stress(5)],
        preview: `A trial makes everyone testify about who really runs things. You might win. The whole county will be watching how.`,
      },
      {
        text: `Ask him to take a plea. Promise him whatever he wants.`,
        effects: [prison('tano', 100), op('tano', -5), money(-3000), heat('federal', -8), famOp(-2)],
        preview: `Four years in Leesburg. He asks for a television in his cell and your father's ring. You give him both.`,
      },
    ],
  },

  /* ================================================================ */
  /* 14. TWO COUSINS                                                   */
  /* ================================================================ */
  {
    id: 'p2_cz_1',
    category: 'church',
    chain: { id: 'p2_cousins', part: 1 },
    trigger: { minWeek: 10, heatAbove: { local: 10 }, once: true, weight: 12 },
    roles: {
      priest: kin('cousin', 'Father Dom, your first cousin, a parish priest in Rio Grande', { first: 'Domenic', nickname: 'Father Dom', gender: 'M', ethnicity: 'Italian', age: [38, 48], traits: ['Pious', 'Patient'], office: 'parish priest' }),
      cop: kin('cousin', 'Richie, your first cousin, a Wildwood patrolman', { first: 'Richard', nickname: 'Richie', gender: 'M', ethnicity: 'Italian', age: [28, 36], traits: ['Honest', 'Loyal-to-a-fault'], office: 'patrolman' }),
    },
    title: 'Not a Confession',
    body: `{priest.call} asks you to come to the rectory at St. Raymond's in Rio Grande, and he makes a point of meeting you in the kitchen, not the confessional. "What I'm going to tell you isn't under the seal," he says. "Richie came to me as family. He asked me to tell you, because he can't be seen telling you himself."

Your cousin {cop.call} is a patrolman, eight years on the Wildwood force, married, a baby coming in March. Two investigators from the State Police met him in the parking lot of the Acme. They know whose cousin he is. They want him to write down who comes to family dinners, christenings and wakes, and who talks to whom in the yard.

"He said no," {priest.first} says. "They said they'd ask again. Richie's not built for this, and neither am I." He pours you coffee. "What are you going to do to protect him? And I mean protect him. Not use him."`,
    options: [
      {
        text: `"Nothing. He stays clean. I stay away from him."`,
        effects: [op('cop', 10), op('priest', 15), famOp(-2), flag('p2_cz_distance'), then('p2_cz_2', 4, 8, 1)],
        preview: `You stop going to dinners Richie goes to. It protects him and costs you the family's Sunday.`,
      },
      {
        text: `"Tell him to say yes, and to write down exactly what I tell him to."`,
        effects: [op('priest', -20), op('cop', -10), evidence('player', -6), flag('p2_cz_feed'), then('p2_cz_2', 4, 8, 1)],
        preview: `A cousin feeding the State Police whatever you choose. Father Dom crosses himself and won't look at you.`,
      },
      {
        text: `Find out who the investigators are. Leave Richie out of it.`,
        effects: [money(-400), hook('cop', 'You learned which troopers want him'), heat('local', 2), then('p2_cz_2', 4, 8, 1)],
        preview: `Two names at the Woodbine barracks. Knowing them won't make them go away.`,
      },
    ],
  },
  {
    id: 'p2_cz_2',
    category: 'law',
    chain: { id: 'p2_cousins', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      priest: carried('Father Dom'),
      cop: carried('Cousin Richie'),
      lt: world('cop_frank_scarpelli', 'Lt. Frank Scarpelli of the vice squad, who aims raids for money', { first: 'Frank', last: 'Scarpelli', nickname: 'Scarpy', ethnicity: 'Italian', age: [42, 55], traits: ['Greedy'] }, 'vice lieutenant'),
    },
    title: 'Transferred to Vice',
    body: `{cop.call} has been transferred to the vice squad under {lt.call}, who aims raids the way other men aim fishing rods. The State Police arranged it, Richie thinks. The idea is to put him where he'll have to choose.

Scarpelli's first assignment for him is a card game. Your card game: the one over the shoe repair on Schellenger Avenue. "Show the boys downtown you're not your cousin's cousin," Scarpelli tells him, smiling. Scarpelli is also on your pad, which means he's playing both sides of your cousin at once.

Richie calls you from a pay phone. Then he hangs up before you answer, because he remembered.`,
    options: [
      {
        text: `Let the raid happen. Real arrests. Richie makes his name.`,
        effects: [money(-800), crewOp(-4), op('cop', 15), heat('local', -6), flag('p2_cz_raid'), then('p2_cz_3', 8, 14, 1)],
        preview: `Three of your men pay fines. Richie's picture is in the Leader. The State Police leave him alone for now.`,
      },
      {
        text: `Move the game the night before. Let Richie raid an empty room.`,
        effects: [op('cop', -10), heat('local', 3), then('p2_cz_3', 8, 14, 1)],
        preview: `Scarpelli knows how that happened. So do the troopers. Richie looks exactly like what they think he is.`,
      },
      {
        text: `Pay Scarpelli double to pull Richie off the assignment.`,
        gate: { money: 1200 },
        effects: [money(-1200), hook('lt', 'He took money from both sides over your cousin'), op('cop', 5), then('p2_cz_3', 8, 14, 1)],
        preview: `Scarpelli smiles and reassigns him to parking. You now pay a lieutenant to keep your cousin bored.`,
      },
    ],
  },
  {
    id: 'p2_cz_3',
    category: 'family',
    chain: { id: 'p2_cousins', part: 3 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { priest: carried('Father Dom'), cop: carried('Cousin Richie') },
    title: 'The Christening',
    body: `Richie's son is baptized at St. Raymond's on a cold Sunday in March, by his cousin, Father Dom, with you as godfather because Richie's wife insisted and Richie couldn't think of a way to say no.

There's a State Police car parked across Route 47 with two men in it drinking coffee. Everybody sees it. Nobody mentions it.

At the font, Father Dom asks you, "Do you reject Satan, and all his works, and all his empty promises?" and there's a pause that lasts about one second longer than it should. Afterward, in the church hall, over pizzelles and anisette, Richie takes you out back by the trash cans. "I can't do this anymore," he says. "Tell me what you want. Whatever it is, I'll do it. Just tell me so I can stop guessing."`,
    options: [
      {
        text: `"Quit the force. I'll set you up with something clean: the hardware store on Rio Grande."`,
        gate: { money: 2000 },
        effects: [money(-2000), biz('add', 'stand', 'causeway'), op('cop', 15), op('priest', 10), famOp(6), then('p2_cz_4', 30, 60, 1)],
        preview: `Richie sells paint and screen doors. He's the happiest man in the family, and the State Police lose their best way in.`,
      },
      {
        text: `"Stay a cop. A good one. And never tell me anything."`,
        effects: [op('cop', 20), op('priest', 15), respect(2), flag('p2_cz_honest'), then('p2_cz_4', 30, 60, 1)],
        preview: `An honest cousin on the force who owes you the freedom to stay honest. Some debts are worth more unpaid.`,
      },
      {
        text: `"Stay a cop. Be mine."`,
        effects: [op('cop', -5), op('priest', -25), hook('cop', 'He agreed to be your man on the force', true), heat('local', -5), flag('p2_cz_owned'), then('p2_cz_4', 30, 60, 1)],
        preview: `You own a patrolman. You lose a priest. Father Dom stops coming to Sunday dinner.`,
      },
    ],
  },
  {
    id: 'p2_cz_4',
    category: 'church',
    chain: { id: 'p2_cousins', part: 4 },
    trigger: { chainOnly: true },
    roles: { priest: carried('Father Dom'), cop: carried('Cousin Richie') },
    title: 'Letters From Two Cousins',
    body: `Two letters in the same week.

The first is from the chancery office in Camden. Father Domenic has been reassigned, at his own request, to a mission parish in the Diocese of Gallup, New Mexico, where he'll say Mass in Spanish in an adobe church and teach the children of copper miners. He asks for nothing. He asks that you light a candle for him.

The second is from Richie, typed on a police department typewriter, then crossed out, then handwritten underneath. "The troopers came back. They've got a new man. He asked about you by name, and about the Marlin, and about Thursdays. I told him what I tell everybody. You should know they're asking."`,
    options: [
      {
        text: `Write Father Dom back. Send money for the mission school.`,
        effects: [money(-500), op('priest', 20), famOp(4), stress(-4)],
        preview: `He writes once a year at Christmas. He never asks you how you are. He always asks about your soul.`,
      },
      {
        text: `Move Thursdays. Thank Richie with a ham at Easter.`,
        effects: [money(-400), evidence('player', -6), op('cop', 8)],
        preview: `The troopers' new man finds an empty kitchen. Richie gets a ham and an excuse to keep his distance.`,
      },
      {
        text: `Ask Richie for the trooper's name.`,
        gate: { flag: 'p2_cz_owned' },
        effects: [hook('cop', 'He gave you a State Police investigator\'s name'), evidence('player', -10), op('cop', -15)],
        preview: `He gives it to you. He's yours. That's what owning a man feels like, and it's never as good as you thought.`,
      },
    ],
  },

  /* ================================================================ */
  /* 15. THE MAN FROM CALABRIA                                         */
  /* ================================================================ */
  {
    id: 'p2_old_1',
    category: 'family',
    chain: { id: 'p2_nonno', part: 1 },
    trigger: { minWeek: 30, months: [4, 5, 6], once: true, weight: 12 },
    roles: {
      nonno: kin('grandfather', 'Nonno, your grandfather from Calabria, arriving at eighty-four', { first: 'Raffaele', nickname: 'Nonno', gender: 'M', ethnicity: 'Italian', age: [82, 88], traits: ['Vengeful', 'Pious'], rank: 'civilian' }),
      mother: famRole('your mother', 'mother'),
    },
    title: 'Off the Cristoforo Colombo',
    body: `He comes off the liner at the Hudson River piers with a cardboard suitcase tied with twine, a black suit he was married in, and a cane carved from olive wood. {nonno.call}. Your grandfather, eighty-four years old, who stayed behind in the hills above Reggio when his sons came over in 1913, and who has finally, after his wife's death, agreed to come.

He doesn't speak English. He's never seen a television or an escalator. In the Cadillac on the Turnpike he sits very straight and looks at New Jersey like it owes him money.

At your mother's house he inspects the gravy, the saints on the dresser and you, in that order. Then he says something in dialect your mother won't translate. Your daughter asks. Your mother says, "He said you look like your father. He didn't mean it as a compliment."`,
    options: [
      {
        text: `He lives with you. The best room, the big bed.`,
        effects: [op('nonno', 15), op('mother', -5), famOp(3), stress(4), then('p2_old_2', 4, 8, 1)],
        preview: `An eighty-four-year-old patriarch in your house, awake at five every morning, watching everything you do.`,
      },
      {
        text: `He lives with your mother. It's her father-in-law, her house, her cooking.`,
        effects: [op('nonno', 5), op('mother', 10), then('p2_old_2', 4, 8, 1)],
        preview: `Two old people who remember a different country, sharing a kitchen. They fight in dialect at the top of their lungs every day.`,
      },
      {
        text: `A bungalow of his own on Glenwood Avenue, with a fig tree.`,
        gate: { money: 2500 },
        effects: [money(-2500), op('nonno', 20), famOp(5), then('p2_old_2', 4, 8, 1)],
        preview: `He plants tomatoes along the fence the first week. The neighbors start bringing him their wine to judge.`,
      },
    ],
  },
  {
    id: 'p2_old_2',
    category: 'rivals',
    chain: { id: 'p2_nonno', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      nonno: carried('Nonno'),
      mother: carried('your mother'),
      baker: world('game:rocco_albanese', 'Rocco Albanese, the baker who holds the pier concessions', { first: 'Rocco', last: 'Albanese', ethnicity: 'Italian', age: [50, 65] }),
    },
    title: 'A Debt From 1921',
    body: `It takes {nonno.call} three weeks to find out that {baker.name} owns the bakery on New Jersey Avenue and the pastry concessions on two piers. It takes him one more day to walk there with his cane.

In 1921, he tells you, through your mother, Rocco Albanese's father sold him a vineyard outside Gerace that already belonged to the Church. He took the money and sailed for America. Nonno spent eleven years paying it back to the bishop. "Now I'm here," he says. "And his son has three ovens and a Buick. Settle it."

Albanese is a respectable man, a Rotarian, with a house in the Crest. He has no idea any of this happened. He was four years old in 1921.`,
    options: [
      {
        text: `"Nonno, that was forty years ago and another man." Refuse.`,
        effects: [op('nonno', -25), famOp(-3), respect(-1), then('p2_old_3', 6, 10, 1)],
        preview: `He looks at you the way men in his village looked at a coward. He goes to Mass every morning and prays loudly for justice.`,
      },
      {
        text: `Visit Albanese. Explain. Ask for a gesture, man to man.`,
        effects: [op('baker', 5), op('nonno', 10), money(-200), respect(2), then('p2_old_3', 6, 10, 1)],
        preview: `Albanese, embarrassed, sends a tray of sfogliatelle and a check for the parish of Gerace. Nonno sends the tray back and keeps the check.`,
      },
      {
        text: `Take one of Albanese's pier concessions. Make it right the old way.`,
        effects: [biz('add', 'stand', 'piers'), op('baker', -30), op('nonno', 25), heat('local', 4), infl('piers', 3), then('p2_old_3', 6, 10, 1)],
        preview: `Albanese's lease mysteriously reverts to a new tenant. A respectable family on the island now has a reason to hate yours.`,
      },
    ],
  },
  {
    id: 'p2_old_3',
    category: 'family',
    chain: { id: 'p2_nonno', part: 3 },
    trigger: { chainOnly: true },
    roles: { nonno: carried('Nonno'), daughter: famRole('your daughter, in school', 'daughter', { age: [14, 22] }) },
    title: 'A School Project About 1933',
    body: `{daughter.first} has a family-history project for Sister Mary Agnes: "Where We Came From," with a map and an interview. She's been interviewing {nonno.call} every afternoon for two weeks with an Italian dictionary and a tape recorder she borrowed from the school.

Tonight she comes into your study and closes the door and plays you twenty seconds of tape. You understand enough dialect to follow it. Nonno is telling her about 1933, the year Prohibition ended, and the year your father took over the bootleg routes from Cape May to Camden.

"Your grandfather didn't inherit them," the old man says on the tape. "His brother was going to have them. Tano. Your grandfather made a phone call to the Treasury men, and Tano went to Lewisburg for two years, and when Tano came out, there was nothing left for him but a bread truck." A long pause on the tape. "That is where your house comes from, little one. I'm telling you so somebody knows."

{daughter.first} stops the tape. "Is it true?"`,
    options: [
      {
        text: `"Yes. It's true."`,
        effects: [op('daughter', 15), flag('p2_secret_known'), stress(8), then('p2_old_4', 8, 16, 1)],
        preview: `Your daughter carries a family secret now. She's the first person in thirty years you've told the truth about it.`,
      },
      {
        text: `"He's old. He's confused. Erase the tape."`,
        effects: [op('daughter', -15), flag('p2_secret_buried'), then('p2_old_4', 8, 16, 1)],
        preview: `She erases it in front of you. She remembers every word.`,
      },
      {
        text: `"Take the tape to Zio Tano. He deserves to hear it from family."`,
        effects: [op('daughter', 10), flag('p2_secret_known'), flag('p2_secret_tano'), famOp(-6), stress(10), then('p2_old_4', 8, 16, 1)],
        preview: `Your uncle learns, at seventy, why his life went the way it did. What he does with that is up to him.`,
      },
    ],
  },
  {
    id: 'p2_old_4',
    category: 'family',
    chain: { id: 'p2_nonno', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { nonno: carried('Nonno'), daughter: carried('your daughter'), tano: kin('uncle', 'Zio Tano, your father\'s older brother', { first: 'Gaetano', nickname: 'Zio Tano', gender: 'M', ethnicity: 'Italian', age: [64, 76] }) },
    title: 'The Olive-Wood Cane',
    body: `{nonno.call} dies in his sleep in October, in a bed in America, which he said he never expected. The wake is at Doolan's on Pacific; half of the old neighborhood comes, and some of them are crying in dialect.

He left a will in pencil on a sheet of lined paper: his black suit to be buried in, his olive-wood cane, and a letter in a sealed envelope addressed to {tano.call}. Your mother wants to steam it open. Your consigliere wants to burn it.

{tano.first} stands at the casket for a long time. Then he comes over and stands next to you and says, without looking at you, "I always knew, you know. I just never knew anybody else knew."`,
    immediate: [leave('nonno', 'dies')],
    options: [
      {
        text: `Give Tano the letter and the cane. Let the old men settle their own accounts.`,
        effects: [op('tano', 20), famOp(4), stress(-4), respect(2)],
        preview: `He reads the letter at the cemetery and puts it in his breast pocket. Whatever it says, he walks with the olive-wood cane for the rest of his life.`,
      },
      {
        text: `Ask Tano's forgiveness, for your father. In front of the family.`,
        gate: { flag: 'p2_secret_known' },
        effects: [op('tano', 30), famOp(8), respect(-3), op('daughter', 15), stress(-10)],
        preview: `Your uncle takes your face in both hands, like you were a boy, and says it was never yours to be sorry for. Your daughter sees it.`,
      },
      {
        text: `Burn the letter.`,
        effects: [op('tano', -20), op('daughter', -10), famOp(-4), stress(5)],
        preview: `Some things belong to the dead. Tano will never know what his father wrote him, and he'll know who decided.`,
      },
    ],
  },

  /* ================================================================ */
  /* 16. ZIA ROSARIA'S WILL                                            */
  /* ================================================================ */
  {
    id: 'p2_will_1',
    category: 'family',
    chain: { id: 'p2_will', part: 1 },
    trigger: { minWeek: 12, once: true, weight: 11 },
    roles: {
      hazel: townie('Hazel Brandt, Zia Rosaria\'s friend and housemate of thirty years', { first: 'Hazel', last: 'Brandt', gender: 'F', age: [58, 68], traits: ['Patient', 'Honest'], faction: 'none' }),
      cousin: kin('cousin', 'Cousin Benny, Zia Rosaria\'s nephew, who expected to inherit', { first: 'Benedetto', nickname: 'Benny', gender: 'M', ethnicity: 'Italian', age: [35, 48], traits: ['Greedy'] }),
    },
    title: 'Two Wills on Wildwood Avenue',
    body: `Zia Rosaria, your father's youngest sister, died in March at sixty-six. She ran a lemonade stand on the Boardwalk for forty summers and lived in a green bungalow on Wildwood Avenue with {hazel.name}, a retired schoolteacher from Allentown, who everyone in the family has called "Rosaria's friend" since 1931 in a tone that ranges from warm to otherwise.

There are two wills. The first, from 1946, leaves the bungalow and the stand to the family, which means to {cousin.call}, who has already measured the bungalow's kitchen for new cabinets. The second, typed by a lawyer in Cape May in 1959, leaves everything to Hazel.

Hazel calls you, because Rosaria told her to. "She said you'd be the one who'd be fair," she says. "She said you owed her for 1952, and you'd know what that meant."`,
    options: [
      {
        text: `"The 1959 will is the will. Hazel keeps her home."`,
        effects: [op('hazel', 25), op('cousin', -20), famOp(-2), flag('p2_will_hazel'), then('p2_will_2', 3, 5, 1)],
        preview: `You honor your aunt's last word. Cousin Benny starts calling the family.`,
      },
      {
        text: `"Let the Surrogate decide. That's what she's for."`,
        effects: [op('hazel', 5), op('cousin', 5), then('p2_will_2', 3, 5, 1)],
        preview: `A neutral answer. In this family, neutral sounds like taking Benny's side.`,
      },
      {
        text: `Split it: the bungalow to Hazel for her lifetime, the stand to Benny.`,
        gate: { trait: 'Charming' },
        effects: [op('hazel', 12), op('cousin', 8), famOp(3), flag('p2_will_split'), then('p2_will_2', 3, 5, 1)],
        preview: `A compromise nobody asked for. It might be the one that holds.`,
      },
    ],
  },
  {
    id: 'p2_will_2',
    category: 'family',
    chain: { id: 'p2_will', part: 2 },
    trigger: { chainOnly: true },
    roles: {
      hazel: carried('Hazel Brandt'),
      cousin: carried('Cousin Benny'),
      surrogate: world('pol_margaret_stockton', 'Margaret Stockton, Cape May County Surrogate: wills, estates, guardianships', { first: 'Margaret', last: 'Stockton', gender: 'F', age: [50, 62], traits: ['Honest'] }, 'County Surrogate'),
    },
    title: 'What People Will Say',
    body: `{cousin.call} has filed to contest the 1959 will in front of {surrogate.name}. Undue influence, his lawyer says: an old woman alone with a schoolteacher who typed her letters.

Then Benny comes to the restaurant and says the other thing, low, so the waiters won't hear. "Everybody knows what those two were. Thirty years. You say that word in front of the Surrogate, in front of a newspaper, Hazel folds in a day. She'll sign anything to keep it quiet."

He's grinning. He thinks he's handing you a weapon. You remember 1952: Zia Rosaria, standing on your mother's porch in the snow, the night your father was arrested, with four thousand dollars of her own money in a coffee can for the bail.`,
    options: [
      {
        text: `"You will never say that word to anybody. Not to the Surrogate, not to a newspaper, not to your wife."`,
        effects: [op('cousin', -25), op('hazel', 15), respect(4), famOp(2), flag('p2_will_shielded'), then('p2_will_3', 3, 6, 1)],
        preview: `Benny learns there are things this family doesn't do. Hazel never hears what he offered. Rosaria would have known.`,
      },
      {
        text: `Testify before the Surrogate: you were there in 1952. Rosaria knew exactly what she wanted.`,
        effects: [op('hazel', 20), op('surrogate', 5), op('cousin', -15), heat('local', 2), then('p2_will_3', 3, 6, 1)],
        preview: `A man like you, sworn, in a probate court. It's the most honest testimony you'll ever give.`,
      },
      {
        text: `Pay Benny to drop it. Two thousand and the lemonade stand.`,
        gate: { money: 2000 },
        effects: [money(-2000), op('cousin', 10), op('hazel', 10), flag('p2_will_paid'), then('p2_will_3', 3, 6, 1)],
        preview: `Benny takes the money and keeps his mouth shut, which is the only thing you've ever paid him to do.`,
      },
    ],
  },
  {
    id: 'p2_will_3',
    category: 'town',
    chain: { id: 'p2_will', part: 3 },
    trigger: { chainOnly: true },
    roles: { hazel: carried('Hazel Brandt'), cousin: carried('Cousin Benny') },
    title: 'Lemonade, Ten Cents',
    body: `Hazel Brandt keeps the green bungalow. On Memorial Day weekend she's at Zia Rosaria's lemonade stand on the Boardwalk at seven in the morning, in Rosaria's apron, squeezing lemons into the same glass barrel, with a hand-lettered sign: LEMONADE 10¢. ROSARIA'S, SINCE 1921.

She sends a pitcher to your table at the Ivanhoe, and a note in a schoolteacher's handwriting. "She always said you were the soft one. I never believed her. Thank you."

Benny sulks. Benny's wife, it turns out, is on the parish council, and the parish council has opinions about everything.`,
    options: [
      {
        text: `Make sure nobody on the Boardwalk ever bothers Hazel's stand.`,
        effects: [op('hazel', 15), infl('boardwalk', 2), respect(2), famOp(2)],
        preview: `The stand's protection is the one envelope on the Boardwalk nobody ever collects.`,
      },
      {
        text: `Make it up to Benny with a job on a vending route.`,
        effects: [recruit('cousin', 'associate'), op('cousin', 15), money(-200)],
        preview: `Benny stocks cigarette machines and tells people you're his favorite cousin, which is the first nice thing he's said in years.`,
      },
      {
        text: `Drink the lemonade. Send back the empty pitcher.`,
        effects: [op('hazel', 5), stress(-3)],
        preview: `It's the best lemonade on the island. It always was.`,
      },
    ],
  },

  /* ================================================================ */
  /* 17. THE WEDDING OF THE YEAR                                       */
  /* ================================================================ */
  {
    id: 'p2_wed_1',
    category: 'family',
    chain: { id: 'p2_wedding', part: 1 },
    trigger: { minWeek: 20, rivalAlive: 'philly', once: true, weight: 12 },
    roles: {
      bride: kin('niece', 'Annamaria, your sister\'s daughter, the bride', { first: 'Annamaria', gender: 'F', ethnicity: 'Italian', age: [20, 24], traits: ['Honest', 'Hot-headed'] }),
      sister: famRole('your sister, the bride\'s mother', 'sister'),
      carbone: { desc: 'Leo Carbone, the Camden capo at the Table, the groom\'s father', pool: 'rival', faction: 'philly', spawn: { first: 'Leo', last: 'Carbone', ethnicity: 'Italian', age: [50, 62] } },
    },
    title: 'Six Hundred Guests',
    body: `Your niece {bride.first} is marrying {carbone.name}'s boy, Paulie, who she met at a dance at Villanova and who turns out to be a perfectly decent accounting student with a father who runs Camden for the Table.

{carbone.first} wants six hundred guests at the Admiral ballroom and a Philadelphia band. Your sister wants six hundred guests, the Admiral, and a Wildwood band. {bride.first} wants eighty people, a lunch at the Marlin, and to be on a plane to Bermuda by four o'clock.

She comes to your restaurant alone and sits down across from you. "Uncle. It's my wedding. Paulie doesn't care. My mother and his father are planning a summit conference with a cake. I'm asking you, because you're the only one they'll both listen to. Make it mine."`,
    options: [
      {
        text: `"It's yours. Eighty people. I'll tell them both."`,
        effects: [op('bride', 25), op('sister', -15), rivOp('philly', -5), flag('p2_wed_small'), then('p2_wed_2', 4, 8, 1)],
        preview: `A wedding the bride wants. A Table capo denied his show, and your sister furious at you for a decade.`,
      },
      {
        text: `"Six hundred. It's not just your wedding, sweetheart. It's an alliance."`,
        effects: [op('bride', -20), op('sister', 10), rivOp('philly', 8), alliance('philly', 'carbone'), then('p2_wed_2', 4, 8, 1)],
        preview: `Your house and Carbone's, joined in front of all of South Jersey. The bride will smile in every photograph.`,
      },
      {
        text: `"Two hundred, the Admiral, her band, her dress, and she leaves for Bermuda after the first dance."`,
        gate: { trait: 'Charming' },
        effects: [op('bride', 15), op('sister', 5), rivOp('philly', 4), alliance('philly', 'carbone'), then('p2_wed_2', 4, 8, 1)],
        preview: `Everybody loses a little. Everybody wins a little. That's a wedding.`,
      },
    ],
  },
  {
    id: 'p2_wed_2',
    category: 'table',
    chain: { id: 'p2_wedding', part: 2 },
    trigger: { chainOnly: true },
    roles: { bride: carried('the bride'), sister: carried('your sister'), carbone: carried('Leo Carbone'), manno: rivalBoss('manno', 'Carmine Manno') },
    title: 'The Seating Chart',
    body: `The seating chart is on your dining room table, on a sheet of shirt cardboard, with forty little paper squares. It is the most dangerous document in South Jersey.

{manno.name} has to be invited, or it's an insult; if he's invited, he can't sit near Danny Kessler, who also has to be invited. Leo Carbone's underboss and your consigliere haven't spoken since 1955. The Monsignor wants to be next to the mayor; the mayor can't be photographed within three tables of anybody in a mohair suit.

{bride.first} comes in with her own list, ten names in pen: her college roommate, a Black girl from Germantown; her music teacher; Paulie's Jewish fraternity brother from Penn; a girl who works at Woolworth's. "These ten go at a good table," she says. "Not near the kitchen. Not behind a pillar. I mean it."`,
    options: [
      {
        text: `Her ten at table two, right by the head table. The bosses can fend for themselves.`,
        effects: [op('bride', 20), rivOp('manno', -4), stress(4), flag('p2_wed_hers'), then('p2_wed_3', 2, 4, 1)],
        preview: `Some of the old men grumble. Your niece will never forget who put her friends in the front.`,
      },
      {
        text: `Manno at Carbone's table. Make them talk.`,
        gate: { trait: 'Patient' },
        effects: [rivOp('manno', 6), rivOp('philly', 4), op('carbone', 5), stress(6), then('p2_wed_3', 2, 4, 1)],
        preview: `A wedding as a peace conference. If the cannoli don't start a war, you might end one.`,
      },
      {
        text: `Don't invite Manno. Let him take it how he takes it.`,
        effects: [rivOp('manno', -12), op('carbone', 4), then('p2_wed_3', 2, 4, 1)],
        preview: `An empty chair Atlantic City will read as a declaration.`,
      },
    ],
  },
  {
    id: 'p2_wed_3',
    category: 'boardwalk',
    chain: { id: 'p2_wedding', part: 3 },
    trigger: { chainOnly: true },
    roles: {
      bride: carried('the bride'),
      carbone: carried('Leo Carbone'),
      crooner: world('ent_vic_marlowe', 'Vic Marlowe, the national crooner', { first: 'Vic', last: 'Marlowe', age: [38, 46], traits: ['Charming', 'Gambler'] }),
      candy: world('ent_candy_sheridan', 'Candy Sheridan, the Wildwood girl with a regional hit', { first: 'Constance', last: 'Sheridan', nickname: 'Candy', gender: 'F', age: [19, 23], traits: ['Ambitious'] }),
      feld: rivalBoss('feldstein', 'Ira Feldstein'),
    },
    title: 'A Gift From New York',
    body: `A telegram from {feld.name}: congratulations to the happy couple, and as a wedding present, {crooner.name} will sing at the reception. Two songs and the first dance. All arranged.

Vic Marlowe on the Admiral's bandstand would be the story of the summer from Cape May to Camden. It would also be the story of the summer at the FBI office in Newark, which keeps a file on everybody who shakes Vic Marlowe's hand. And you'd owe Feldstein a wedding.

{bride.first} has a different idea. "Candy Sheridan went to Wildwood High with me," she says. "She's got a record on the radio. She'd sing the first dance for free, for me. I don't want a man from Las Vegas I've never met singing to my husband."`,
    options: [
      {
        text: `Vic Marlowe. Feldstein's gift.`,
        effects: [respect(8), rivOp('feldstein', 10), heat('federal', 6), op('bride', -10), op('carbone', 10), flag('p2_wed_vic'), then('p2_wed_4', 2, 4, 1)],
        preview: `The biggest wedding in South Jersey history, and the most photographed.`,
      },
      {
        text: `{candy.first}, for the bride. Send Feldstein a gracious telegram back.`,
        effects: [op('bride', 20), op('candy', 15), rivOp('feldstein', -6), flag('p2_wed_candy'), then('p2_wed_4', 2, 4, 1)],
        preview: `A hometown girl sings to a hometown bride. Feldstein's secretary files your telegram under "declined."`,
      },
      {
        text: `Both: {candy.first} for the first dance, Vic for the cake.`,
        effects: [op('bride', 8), op('candy', 10), rivOp('feldstein', 4), heat('federal', 4), respect(5), then('p2_wed_4', 2, 4, 1)],
        preview: `Vic Marlowe sees a Wildwood girl bring the room to tears. Someone in his entourage writes down her name.`,
      },
    ],
  },
  {
    id: 'p2_wed_4',
    category: 'family',
    chain: { id: 'p2_wedding', part: 4 },
    trigger: { chainOnly: true, mandatory: true },
    roles: { bride: carried('the bride'), sister: carried('your sister'), carbone: carried('Leo Carbone') },
    title: 'The Busta',
    body: `The wedding is everything. The bride is beautiful and furious and beautiful. The groom cries at the vows. The sweet table has nine kinds of cookies and a fountain of something pink.

At ten o'clock two of your cousins and one of Carbone's nephews end up in the parking lot over an old insult involving a 1951 Oldsmobile. Across Ocean Avenue, two men in a Ford write down license plates by flashlight.

At midnight {bride.first} sits at the head table with the busta in her lap: the white satin bag every guest has stuffed an envelope into. Eleven thousand dollars. She looks at it and then at you. "Carbone's people say the busta goes to his son's 'business start.' My mother says it's family money. Paulie says it's ours." She snaps it shut. "I'm keeping it. All of it. Tell me I'm wrong."`,
    options: [
      {
        text: `"You're not wrong." And stand next to her when Carbone comes over.`,
        effects: [op('bride', 25), op('carbone', -8), op('sister', 5), famOp(5), respect(3)],
        preview: `A bride with eleven thousand dollars and her uncle standing behind her. Camden takes note of whose niece she is.`,
      },
      {
        text: `"Give it to Leo. It's how it's done."`,
        effects: [op('bride', -25), op('carbone', 10), rivOp('philly', 5), famOp(-4)],
        preview: `She gives it to him with both hands and a smile that could freeze the Delaware. She will tell her daughter about this.`,
      },
      {
        text: `Go break up the fight in the parking lot before the Ford gets a photograph.`,
        effects: [heat('federal', -3), crewOp(2), op('bride', 5), stress(3)],
        preview: `You save three men from a picture in the FBI's wedding album. The bride decides the busta question without you.`,
      },
      {
        text: `Toast her, loud, in front of everybody: the girl who seated her own friends at table two.`,
        gate: { flag: 'p2_wed_hers' },
        effects: [op('bride', 20), respect(4), famOp(6), op('carbone', 5)],
        preview: `The room stands up for the bride. Even Leo Carbone. She keeps the busta, and nobody says another word about it.`,
      },
    ],
  },

  /* ================================================================ */
  /* 18. THE GODSON                                                    */
  /* ================================================================ */
  {
    id: 'p2_gs_1',
    category: 'family',
    chain: { id: 'p2_godson', part: 1 },
    trigger: { minWeek: 8, once: true, weight: 11 },
    roles: {
      lena: townie('Lena Tursi, widow of a soldier who died in 1956, mother of your godson', { first: 'Lena', last: 'Tursi', gender: 'F', ethnicity: 'Italian', age: [38, 46], traits: ['Pious', 'Hot-headed'], faction: 'none' }),
      boy: kin('godchild', 'Vinnie Tursi, your godson, eighteen', { first: 'Vincent', last: 'Tursi', nickname: 'Vinnie', gender: 'M', ethnicity: 'Italian', age: [17, 19], traits: ['Ambitious', 'Hot-headed'] }),
    },
    title: 'Godfathers Are Supposed to Save Souls',
    body: `{lena.name} wears black on Sundays, still, four years after her husband Carmine died of a heart attack in the back of a Causeway bar with his collection book in his pocket. She works at the Acme bakery counter and puts every dime toward her son.

Her son {boy.call} is eighteen, smart, angry, handsome as his father. He's been running numbers slips for one of Kessler's men in North Wildwood, to prove something to somebody. "To you," she says. "He thinks you'll notice."

"You stood up for him in church. You held him over the font. Godfathers are supposed to save souls, not collect them. I want him out of this. I want him at Glassboro, or in the Coast Guard, or anywhere that isn't a gin mill on New Jersey Avenue."`,
    options: [
      {
        text: `Pay for Glassboro. Tell {boy.first} it's that or nothing from you, ever.`,
        gate: { money: 1500 },
        effects: [money(-1500), op('lena', 25), op('boy', -10), flag('p2_gs_school'), then('p2_gs_2', 6, 10, 1)],
        preview: `His mother gets her wish. The boy gets an ultimatum from the one man whose approval he wanted.`,
      },
      {
        text: `Bring him in where you can watch him. Errands, clean ones.`,
        effects: [recruit('boy', 'associate'), op('boy', 20), op('lena', -25), rivOp('kessler', -3), then('p2_gs_2', 6, 10, 1)],
        preview: `Better yours than Kessler's, you tell yourself. His mother stops speaking to you at Mass.`,
      },
      {
        text: `Call the Coast Guard recruiter in Cape May. Lena signs.`,
        effects: [op('lena', 15), op('boy', -5), favor(-1), flag('p2_gs_coastguard'), then('p2_gs_2', 6, 10, 1)],
        preview: `Boot camp at Cape May. Discipline, a uniform and a long way from Kessler's gin mill.`,
      },
    ],
  },
  {
    id: 'p2_gs_2',
    category: 'crew',
    chain: { id: 'p2_godson', part: 2 },
    trigger: { chainOnly: true },
    roles: { lena: carried('Lena Tursi'), boy: carried('your godson') },
    title: 'What the Boy Did',
    body: `{boy.call} did what angry eighteen-year-olds do to get noticed. He and two friends took a Kessler collector's Buick from behind the Shamrock, collection bag and all, and drove it into Otten's Harbor at low tide. Then he came to your restaurant, still wet to the knees, and put the bag on your table. Four hundred dollars of Kessler's money.

"For you," he says. "So you know I can."

Danny Kessler's people want the boy who did it. {lena.first} is outside in her car with the engine running, praying the rosary.`,
    options: [
      {
        text: `Send Kessler his money back with an apology and a check for the Buick. The boy is family.`,
        effects: [money(-1200), rivOp('kessler', 5), op('boy', -15), op('lena', 15), then('p2_gs_3', 8, 14, 1)],
        preview: `You protect him by humiliating him. He hates you for it. His mother lights a candle for you.`,
      },
      {
        text: `Keep the money. Tell Kessler the boy is yours now, and to come see you about it.`,
        effects: [money(400), respect(4), rivOp('kessler', -12), op('boy', 25), op('lena', -30), then('p2_gs_3', 8, 14, 1)],
        preview: `You just made a soldier out of a teenager and a war out of a car. His mother will never forgive you.`,
      },
      {
        text: `Drive him to the Coast Guard station yourself tonight.`,
        gate: { flag: 'p2_gs_coastguard' },
        effects: [op('lena', 20), op('boy', 5), rivOp('kessler', 2), money(-400)],
        preview: `He's in uniform by Tuesday, out of Kessler's reach. Twenty years later he sends you a photograph from a cutter in Alaska.`,
      },
    ],
  },
  {
    id: 'p2_gs_3',
    category: 'family',
    chain: { id: 'p2_godson', part: 3 },
    trigger: { chainOnly: true },
    roles: { lena: carried('Lena Tursi'), boy: carried('your godson') },
    title: 'Lena\'s Verdict',
    body: `Two seasons later. {lena.first} Tursi asks you to walk with her on the Boardwalk on a cold March afternoon. The gulls are out, and the men painting the Hunt's Pier rides.

"I prayed for you every day," she says. "Not because I like you. Because you're the one with his life in your hands, and I wanted God to know where to look."

Her son is where you put him. She tells you, plainly, what she thinks of it, and then she asks you one last thing: to promise her that if he ever has to choose between you and himself, you'll let him choose himself.`,
    options: [
      {
        text: `"I promise."`,
        effects: [op('lena', 20), op('boy', 10), stress(-4), flag('p2_gs_promise')],
        preview: `A promise to a widow on the Boardwalk. Promises like that come due at the worst possible time.`,
      },
      {
        text: `"I can't promise that. Nobody in this life gets to promise that."`,
        effects: [op('lena', -5), respect(2)],
        preview: `She nods. "At least you didn't lie," she says. It's more than she expected.`,
      },
      {
        text: `Give her an envelope for the boy's future, whatever it turns out to be.`,
        gate: { money: 1000 },
        effects: [money(-1000), op('lena', 10), op('boy', 5)],
        preview: `She takes it for him, not for herself. She makes sure you see her put it in the poor box first, and take it out again.`,
      },
    ],
  },
];

