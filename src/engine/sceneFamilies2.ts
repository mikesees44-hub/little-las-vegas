import { capos, crew, displayName, isFree, livingDynasty } from './characters';
import { capoOf } from './hierarchy';
import { opinion } from './relations';
import { $, age, pickWith, registerFamily, relabel, type Scene, type SceneCtx } from './sceneVariants';
import type { Character, Choice, Effect, GameState, RivalId } from './types';

/**
 * Scene families, part 2: the people around the boss. A rival courting one
 * of your men, a man drifting, a favor asked, a capo's light envelope,
 * Sunday dinner, the crew's scores, funerals, the opening of a reign, and a
 * setting for every other crew decision.
 */

const nm = (c?: Character) => (c ? displayName(c) : 'somebody');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const rivalShort = (s: GameState, id?: RivalId) => s.rivals.find((r) => r.id === id)?.shortName ?? 'Atlantic City';
const rivalBoss = (s: GameState, id?: RivalId) => { const r = s.rivals.find((x) => x.id === id); return r ? s.characters[r.leaderId] : undefined; };

/** Someone else from the crew to carry word (not the man himself). */
function messenger(c: SceneCtx, not: Character | undefined): Character | undefined {
  const k = not ? capoOf(c.s, not) : undefined;
  if (k && k.id !== not?.id && isFree(c.s, k)) return k;
  const xs = crew(c.s).filter((x) => x.id !== not?.id && isFree(c.s, x) && (x.rank === 'capo' || x.rank === 'soldier'));
  return xs.length ? pickWith(c.h, xs.slice(0, 8)) : undefined;
}

/* ------------------------------------------------------------------ */
/* A rival is courting one of your men                                 */
/* ------------------------------------------------------------------ */

function court(c: SceneCtx) {
  const m = c.who!;
  const rid = m.courtedBy?.rival ?? (c.s.rivals.find((r) => c.ev.title.startsWith(r.shortName))?.id);
  const r = rid ?? 'manno';
  const why = m.goal === 'become_capo' ? 'They are promising him a crew of his own' : m.goal === 'get_rich' || m.policy === 'squeeze' ? 'They say he would keep more of what he earns' : m.debtTo ? 'They say they will forget his debt' : 'They buy every round';
  return { m, n: displayName(m), f: m.firstName, rs: rivalShort(c.s, r), L: rivalBoss(c.s, r), why, msg: messenger(c, m) };
}

registerFamily({
  id: 'courted',
  match: (ev) => ev.defId === 'crew_courted',
  scenes: [
    { title: (c) => `${court(c).rs} is courting ${c.who!.firstName}`, text: (c) => { const k = court(c); return `${k.n} has been seen at ${k.rs}'s tables three nights running. ${k.why}. He has not said no.`; } },
    { title: (c) => `${c.who!.firstName} and the Lincoln`, text: (c) => { const k = court(c); return `${k.msg ? `${nm(k.msg)} saw it` : 'Your driver saw it'}: ${k.n} getting out of a black Lincoln on Pacific Avenue at two in the morning, laughing, and the Lincoln belongs to ${nm(k.L)}. ${k.why}.`; } },
    { title: () => `A table at the 500 Club`, text: (c) => { const k = court(c); return `${k.n} took his wife to the 500 Club in Atlantic City on Saturday, front table, and nobody brought a check. ${k.rs} picked it up. ${k.why}. ${k.f} has not mentioned it to anybody.`; } },
    { title: (c) => `${c.who!.firstName}'s new suit`, text: (c) => { const k = court(c); return `${k.n} came to the Shamrock in a new sharkskin suit he could not have paid for. ${k.msg ? `${k.msg.firstName}` : 'The bartender'} says the tailor is ${k.rs}'s tailor. ${k.why}.`; } },
    { title: (c) => `${c.who!.firstName} at the racetrack`, when: (c) => c.month >= 4 && c.month <= 10, text: (c) => { const k = court(c); return `At Atlantic City Race Course, ${k.n} was in ${nm(k.L)}'s box for four races. ${k.msg ? `${k.msg.firstName}` : 'Somebody'} was two boxes over and watched them laugh. ${k.why}.`; } },
    { title: (c) => `${c.who!.firstName}'s wife is worried`, text: (c) => { const k = court(c); const w = k.m.household?.wife; return `${w ? `${w} ${k.m.lastName}` : `${k.f}'s mother`} catches you after Mass. Men from ${k.rs} have been coming by the house, "very polite, very nice cars." She wants to know if ${k.f} is in trouble. ${k.why}, and ${k.f} has been listening.`; } },
    { title: (c) => `${c.who!.firstName} is asking about money`, text: (c) => { const k = court(c); return `${k.n} has been asking the other men what they take home, which a man asks when somebody has quoted him a better number. The number came from ${k.rs}. ${k.why}.${c.war ? ` With the ${c.war} trouble on, the timing is not an accident.` : ''}`; } },
    { title: (c) => `${court(c).rs} sent ${c.who!.firstName} a case`, text: (c) => { const k = court(c); return `A case of Canadian Club arrived at ${k.n}'s house with a card from ${nm(k.L)}: "For a man who should be appreciated." ${k.f} kept the whiskey. Nobody knows what he did with the card. ${k.why}.`; } },
    { title: (c) => `${c.who!.firstName} on the ferry`, when: (c) => !c.summer, text: (c) => { const k = court(c); return `${c.weather[0].toUpperCase()}${c.weather.slice(1)}, and ${k.n} was seen on the Cape May ferry dock talking to two of ${k.rs}'s men for an hour in a parked car with the engine running. In the off-season, a man thinks about where next year's money comes from. ${k.why}.`; } },
    { title: (c) => `${c.who!.firstName} at the christening`, text: (c) => { const k = court(c); return `${k.n} turned up at a christening in Ventnor, a ${k.rs} family's christening, and stood in the second row. ${k.msg ? `${nm(k.msg)}` : 'Your man in Atlantic City'} says ${k.f} was introduced around as "a friend from Wildwood." ${k.why}.`; } },
  ],
});

/* ------------------------------------------------------------------ */
/* A man is drifting                                                   */
/* ------------------------------------------------------------------ */

function drift(c: SceneCtx) {
  const m = c.who!;
  const rid = m.courtedBy?.rival ?? pickWith(c.h, c.s.rivals.filter((r) => r.kind === 'mob').map((r) => r.id));
  return { m, n: displayName(m), f: m.firstName, rs: rivalShort(c.s, rid), msg: messenger(c, m) };
}

registerFamily({
  id: 'drifting',
  match: (ev) => ev.defId === 'drifting',
  scenes: [
    { title: (c) => `${c.who!.firstName} is drifting`, text: (c) => { const k = drift(c); return `${k.n} hasn't come by the club in a month. Somebody saw him getting into a car with Atlantic City plates. Nobody from the family has talked to him since summer.`; } },
    { title: (c) => `${c.who!.firstName} stopped coming around`, text: (c) => { const k = drift(c); return `${k.msg ? nm(k.msg) : 'Your driver'} mentions it the way men mention things they have been sitting on: ${k.n} skipped the last two collections, sent a kid instead, and was at Mass at a different parish. "Something's eating him."`; } },
    { title: (c) => `${c.who!.firstName} at the wrong bar`, text: (c) => { const k = drift(c); return `${k.n} has been drinking at a bar in North Wildwood where your people do not drink, three nights a week, alone, at the end of the bar. The bartender there talks to ${k.rs}. Whatever ${k.f} is thinking, he is thinking it where they can hear.`; } },
    { title: (c) => `${c.who!.firstName}'s empty chair`, text: (c) => { const k = drift(c); return `Friday at the Shamrock, every chair at the long table filled but one. ${k.n} sent word he was sick. He was not sick: ${k.msg ? k.msg.firstName : 'somebody'} saw him at the Steel Pier with his kids, which is fine, and with one of ${k.rs}'s men, which is not.`; } },
    { title: (c) => `${c.who!.firstName} wants to be left alone`, text: (c) => { const k = drift(c); return `${k.n} has been fishing off the jetty at the Inlet every morning, alone, and does not want company. ${k.msg ? k.msg.firstName : 'His capo'} tried. "He says he's thinking. I don't like it when guys think."${c.dead ? ` He was close to ${c.dead.first}.` : ''}`; } },
    { title: (c) => `${c.who!.firstName}'s phone`, text: (c) => { const k = drift(c); return `Your man at the phone company says ${k.n}'s line has been calling an Atlantic City number at night: short calls, the same number, which belongs to a laundry ${k.rs} owns. ${k.f} has not been by the club in weeks.`; } },
    { title: (c) => `${c.who!.firstName} moved his money`, text: (c) => { const k = drift(c); return `${k.n} closed his account at the Marine National Bank and took it all in cash, which a man does when he is going somewhere or buying something. Either way he did not mention it, and he has not been by the club.`; } },
    { title: (c) => `${c.who!.firstName}'s mother is asking`, text: (c) => { const k = drift(c); return `${k.n}'s mother stops you outside the Acme on New Jersey Avenue. She wants to know why her son is so unhappy, why he does not come to Sunday dinner, why he talks about "starting over somewhere." She thinks you might know. You might.`; } },
    { title: (c) => `${c.who!.firstName} in Philadelphia`, text: (c) => { const k = drift(c); return `${k.n} has been driving up to Philadelphia on his days off, and not to see his cousins. ${k.msg ? k.msg.firstName : 'Somebody'} says he has been talking to people who know people. A man looking for a door is a man who thinks he is in the wrong room.`; } },
    { title: (c) => `${c.who!.firstName} in the off-season`, when: (c) => !c.summer, text: (c) => { const k = drift(c); return `${cap(c.weather)}. The island is half-empty and so is ${k.n}'s envelope: he has stopped working his spots and spends his afternoons at the movies at the Blaker. A man with nothing to do starts listening to people who give him something.`; } },
  ],
});

/* ------------------------------------------------------------------ */
/* A favor is asked                                                    */
/* ------------------------------------------------------------------ */

interface Asker { name: string; id?: string }

function official(c: SceneCtx, office: string): Asker | undefined {
  const x = Object.values(c.s.characters).find((o) => o.alive && o.office === office);
  return x ? { name: `${office === 'Police sergeant' ? 'Sgt.' : office === 'City councilman' ? 'Councilman' : office === 'Chief of Police' ? 'Chief' : office === 'County judge' ? 'Judge' : office === 'State assemblyman' ? 'Assemblyman' : ''} ${x.lastName}`.trim(), id: x.id } : undefined;
}

function widow(c: SceneCtx): Asker | undefined {
  const w = Object.values(c.s.characters).find((o) => !o.alive && o.faction === 'player' && o.household?.wife && o.death && c.s.week - o.death.week < 80);
  return w ? { name: `${w.household!.wife} ${w.lastName}, ${w.firstName}'s widow` } : undefined;
}

function polFigure(c: SceneCtx): Asker | undefined {
  const ps = Object.values(c.s.pol?.people ?? {}).filter((p) => p.alive && p.seat && /Wildwood|Cape May|County/.test(p.title));
  if (!ps.length) return undefined;
  const p = pickWith(c.h, ps.slice(0, 20));
  return { name: `${p.first} ${p.last}, ${p.title}` };
}

const FAVORS: { who: (c: SceneCtx) => Asker | undefined; ask: string; cost: number; title?: string; when?: (c: SceneCtx) => boolean; alt?: { label: string; detail: string; fx: (label: string, cost: number) => Effect[] } }[] = [
  { who: (c) => official(c, 'City councilman'), ask: 'wants his nephew hired on at the pier, no questions asked', cost: 400 },
  { who: () => ({ name: 'Mrs. Abate from the bakery' }), ask: 'needs the punks who broke her window found and spoken to, firmly, by somebody their fathers respect', cost: 200 },
  { who: () => ({ name: 'Father Callahan' }), ask: 'needs the parish festival on the boardwalk to go off without trouble', cost: 600, alt: { label: 'Pay for the whole festival ($1,200)', detail: 'Your name on the banner.', fx: (l) => [{ type: 'money', amount: -1200, label: l }, { type: 'respect', amount: 3, label: l }, { type: 'heat', bar: 'local', amount: -2, label: l }] } },
  { who: (c) => official(c, 'Police sergeant'), ask: 'wants his gambling marker at the Starlight torn up', cost: 900, alt: { label: 'Tear it up, and keep a copy', detail: 'He will know you kept one.', fx: (l, k) => [{ type: 'money', amount: -k, label: l }, { type: 'favor', amount: 1, label: l }, { type: 'heat', bar: 'local', amount: 2, label: l }] } },
  { who: (c) => widow(c), ask: 'cannot make the mortgage on the house on Spencer Avenue and is too proud to say so; her brother says it for her', cost: 700, title: 'A widow is behind' },
  { who: (c) => official(c, 'Chief of Police'), ask: 'needs a dozen men in plain clothes to keep the peace at the Fourth of July fireworks, unofficially', cost: 500, when: (c) => c.month === 6 || c.month === 7 },
  { who: (c) => official(c, 'County judge'), ask: 'would like his son\'s fraternity brothers, who wrecked a rental cottage in the Crest, to stay out of the papers', cost: 800, title: 'The judge\'s son', when: (c) => c.summer },
  { who: () => ({ name: 'Sid Kaplan of Kaplan\'s Hardware' }), ask: 'is being squeezed by a supplier in Vineland who doubled his prices overnight and wants somebody to have a word, a civil one', cost: 300 },
  { who: (c) => official(c, 'State assemblyman'), ask: 'needs a hall, a band and a crowd for a fundraiser at the Hotel Dorset on short notice', cost: 1000, title: 'The assemblyman needs a crowd', alt: { label: 'Fill the hall and sit at his table ($1,500)', detail: 'Photographs will be taken.', fx: (l) => [{ type: 'money', amount: -1500, label: l }, { type: 'favor', amount: 1, label: l }, { type: 'heat', bar: 'federal', amount: 2, label: l }] } },
  { who: () => ({ name: 'The Greek who runs the Olympia luncheonette' }), ask: 'wants his daughter\'s fiancé, a sailor at the Cape May base, transferred somewhere closer than Norfolk', cost: 350 },
  { who: () => ({ name: 'Old Pop Ferretti at the bait shop' }), ask: 'wants his grandson\'s draft board hearing to go fairly, and believes you know what fairly costs', cost: 450, when: (c) => c.year >= 1962 },
  { who: (c) => polFigure(c), ask: 'needs the Boardwalk merchants to stop complaining about the new parking meters until after the vote', cost: 600, title: 'A word with the merchants' },
  { who: () => ({ name: 'Sister Mary Agnes from St. Ann\'s school' }), ask: 'needs a new furnace before the first frost, and has heard you know a man who installs them at cost', cost: 650, when: (c) => c.month >= 9 || c.month <= 2 },
  { who: () => ({ name: 'The lifeguard captain at the Crest' }), ask: 'needs a boat for the beach patrol after the old one sank at its mooring, and the town will not pay', cost: 750, when: (c) => c.summer },
  { who: () => ({ name: 'Dr. Feeney from Burdette Tomlin' }), ask: 'has a patient from Philadelphia nobody will pay for, a dockworker with a bad heart, and asks if anybody on the island would', cost: 500 },
];

registerFamily({
  id: 'favor',
  match: (ev) => ev.defId === 'favor',
  scenes: FAVORS.map((v): Scene => ({
    when: (c) => (!v.when || v.when(c)) && !!v.who(c),
    title: () => v.title ?? 'A favor is asked',
    text: (c) => `${v.who(c)!.name}${v.who(c)!.name.includes(',') ? ',' : ''} ${v.ask}.${c.dead && c.dead.weeks <= 3 ? ' He knows it is a bad time, and asks anyway.' : ''}`,
    choices: (c) => {
      const who = v.who(c)!.name;
      const label = `A favor for ${who.split(',')[0]}`;
      const out: Choice[] = [
        { id: 'grant', label: `Do it (${$(v.cost)})`, because: `did a favor for ${who.split(',')[0]}`, effects: [{ type: 'money', amount: -v.cost, label }, { type: 'respect', amount: 1, label }, { type: 'schedule', key: 'favor_returned', minWeeks: 2, maxWeeks: 8, chance: 0.6, hint: 'they will owe you', params: { who: who.split(',')[0] }, label }] },
      ];
      if (v.alt) out.push({ id: 'alt', label: v.alt.label, detail: v.alt.detail, because: `did ${who.split(',')[0]} a favor, your way`, effects: v.alt.fx(label, v.cost) });
      out.push({ id: 'refuse', label: 'Not this time', because: `refused ${who.split(',')[0]}`, effects: [{ type: 'respect', amount: -1, label }] });
      return out;
    },
  })),
});

/* ------------------------------------------------------------------ */
/* A capo's envelope is light (the audience chamber)                   */
/* ------------------------------------------------------------------ */

const EXCUSES = [
  'the cops closed two of my spots',
  'it rained every weekend and the boardwalk was a ghost town',
  'my best earner was in Burdette Tomlin hospital for three weeks',
  'the state police set up on the Causeway and scared off the out-of-towners',
  'a fire in the kitchen at the Anchor closed the back room for a month',
  'the Navy shipped half the Cape May base out to sea, and sailors were half my action',
  'the bridge was closed for repairs and nobody came over from the mainland',
  'a new priest at Notre Dame de la Mer gave a sermon about gambling and my numbers went to nothing',
];

function kick(c: SceneCtx) {
  const k = c.who!;
  const other = crew(c.s).filter((x) => x.id !== k.id && isFree(c.s, x) && (x.rank === 'capo' || x.rank === 'soldier'));
  return { k, n: displayName(k), f: k.firstName, ex: pickWith(c.h, EXCUSES), o: other.length ? pickWith(c.h, other.slice(0, 8)) : undefined };
}

const kickScenes: Scene[] = ([
  (c) => { const x = kick(c); return `${x.n} comes in before you can send for him. "The envelope's light, I know. A bad stretch: ${x.ex}. I'll make it up by the Fourth."${x.o ? ` ${x.o.firstName} says his spots were open every night.` : ''}`; },
  (c) => { const x = kick(c); return `${x.n} brings his light envelope to your kitchen door on a Sunday morning, with a cake from his wife, which is how you know he is worried. "I swear on my kids: ${x.ex}."${x.o ? ` ${x.o.firstName} heard different.` : ''}`; },
  (c) => { const x = kick(c); return `In the back booth of the Admiral diner, ${x.n} slides his envelope across and does not let go of it right away. "It's short. I know. ${cap(x.ex)}." He finally lets go. He has not finished his coffee.`; },
  (c) => { const x = kick(c); return `${x.n} asks to see you at Otten's Harbor, out on the dock where nobody can listen. His envelope is light, he says, because ${x.ex}. ${x.o ? `${x.o.firstName}, who was on the dock first, says nothing at all, which says plenty.` : 'He keeps looking at the water.'}`; },
  (c) => { const x = kick(c); return `Your consigliere puts ${x.f}'s envelope on the desk and does not have to say anything. ${x.n} is outside, hat in hand. His story: ${x.ex}. "He's either telling the truth or he's very good," says the consigliere.`; },
  (c) => { const x = kick(c); return `At the wake for somebody's uncle, of all places, ${x.n} takes you aside by the holy water. The envelope is light. ${cap(x.ex)}. He picked a funeral home to tell you because nobody raises his voice in a funeral home.`; },
  (c) => { const x = kick(c); return `${x.n} has the numbers written on the back of a Phillies scorecard, his own bookkeeping: down a third. "${cap(x.ex)}. Look, it's all here." It is all there. Whether it is all true is another question.${x.o ? ` ${x.o.firstName} has his own scorecard.` : ''}`; },
  (c) => { const x = kick(c); return `${cap(c.weather)}, and ${x.n} drives you along Ocean Avenue in his Oldsmobile with the heater roaring. The envelope on the dashboard is light. ${cap(x.ex)}, he says, and keeps his eyes on the road.`; },
  (c) => { const x = kick(c); return `${x.n}'s wife has been wearing a new fur to the eleven o'clock Mass. ${x.f} says it was her mother's. His envelope is light, and the reason, he says, is that ${x.ex}. You remember her mother. Her mother never owned a fur.`; },
] as ((c: SceneCtx) => string)[]).map((text) => ({ title: (c: SceneCtx) => `The audience chamber: ${c.who!.firstName}'s envelope is light`, text }));

registerFamily({ id: 'kickup', match: (ev) => ev.defId === 'aud_kickup', scenes: kickScenes });

/* ------------------------------------------------------------------ */
/* Sunday dinner                                                       */
/* ------------------------------------------------------------------ */

function fam(c: SceneCtx) {
  const boss = c.boss;
  const all = livingDynasty(c.s).filter((x) => x.id !== boss.id);
  const wife = boss.spouseId ? c.s.characters[boss.spouseId] : undefined;
  const kids = all.filter((x) => x.fatherId === boss.id || x.motherId === boss.id).sort((a, b) => a.birth.y - b.birth.y);
  const small = kids.filter((k) => age(c.s, k) >= 5 && age(c.s, k) <= 17);
  const sour = all.find((x) => age(c.s, x) >= 14 && opinion(c.s, x.id, boss.id) < 0);
  return { boss, all, wife, kids, small, sour };
}

const kidLine = (c: SceneCtx, k: Character) => {
  const a = age(c.s, k);
  return a <= 5 ? `${k.firstName}, ${a}, in kindergarten at St. Ann's` : a <= 13 ? `${k.firstName}, ${a}, in the ${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][a - 6]} grade at St. Ann's school` : a <= 17 ? `${k.firstName}, ${a}, a junior at Wildwood Catholic${a === 17 ? ' and already looking at colleges' : ''}` : `${k.firstName}, ${a}`;
};

registerFamily({
  id: 'sunday',
  match: (ev) => ev.defId === 'sunday',
  scenes: [
    { title: () => 'Sunday dinner', text: (c) => { const f = fam(c); return f.sour ? `Sunday dinner at the house on Glenwood Avenue. ${f.sour.firstName} has barely said a word to you in weeks.` : 'Sunday dinner at the house on Glenwood Avenue. The whole family is coming.'; } },
    { title: () => 'Gravy since seven', text: (c) => { const f = fam(c); return `${f.wife ? f.wife.firstName : 'Your mother'} has had the gravy on since seven, meatballs, braciole, the good tablecloth. ${f.small.length ? `${kidLine(c, f.small[0])}, wants to show you a report card.` : 'The house smells like every Sunday of your life.'}${f.sour ? ` ${f.sour.firstName} says he might not come.` : ''}`; } },
    { title: () => 'Sunday at the shore house', when: (c) => c.summer, text: (c) => { const f = fam(c); return `Sunday dinner moves to the porch in summer: the table on the screened porch, the ocean two blocks away, ${c.weather}. ${f.all.length} of the family coming, plus whoever ${f.wife ? f.wife.firstName : 'the house'} invited at Mass. Somebody will want to talk business. Somebody always does.`; } },
    { title: () => 'Sunday in the snow', when: (c) => c.season === 'winter', text: (c) => { const f = fam(c); return `${cap(c.weather)}. The roads are bad and half the family calls to say they are not coming; the other half is already in the living room watching Ed Sullivan reruns on Channel 6. ${f.small.length ? `${f.small[0].firstName} wants you to see the snow fort.` : 'The radiators knock.'}`; } },
    { title: () => 'An empty chair at Sunday dinner', when: (c) => !!c.dead, text: (c) => { const f = fam(c); return `The first Sunday dinner since ${c.dead!.first}'s funeral. ${f.wife ? f.wife.firstName : 'Your sister'} set a place anyway, out of habit, and nobody has the heart to clear it. Everybody is looking at you to say grace.`; } },
    { title: () => 'Sunday dinner, and a report card', when: (c) => fam(c).small.length > 0 && (c.month >= 10 || c.month <= 6), text: (c) => { const f = fam(c); const k = f.small[f.small.length - 1]; return `Sunday dinner, and ${kidLine(c, k)}, has brought home a report card the nuns want you to sign personally. ${k.firstName} watches you read it the way your capos watch you count an envelope.`; } },
    { title: () => 'Sunday dinner with the in-laws', text: (c) => { const f = fam(c); return `${f.wife ? `${f.wife.firstName}'s` : 'The'} people are coming down from Philadelphia for Sunday dinner, which means the good silver, the long table, and her brother, who asks too many questions about where the money comes from. ${f.sour ? `${f.sour.firstName} has been sour all week.` : ''}`.trim(); } },
    { title: () => 'Easter Sunday', when: (c) => c.month === 3 || c.month === 4, text: (c) => { const f = fam(c); return `Easter Sunday: lamb, the pizza rustica your mother makes once a year, the kids in new clothes from Lit Brothers. ${f.all.length} people at the table and one priest, Father Callahan, who stays for coffee and looks at your new car.`; } },
    { title: () => 'Thanksgiving at Glenwood Avenue', when: (c) => c.month === 11, text: (c) => { const f = fam(c); return `Thanksgiving, which in this house means a turkey AND lasagna. The Eagles game on in the den, the men drifting in and out. ${f.sour ? `${f.sour.firstName} has been waiting all day to say something to you.` : 'It could be a good day.'}`; } },
    { title: () => 'Christmas Eve, the seven fishes', when: (c) => c.month === 12, text: (c) => { const f = fam(c); return `Christmas Eve, the feast of the seven fishes: baccalà, smelts, the clams, the calamari, everyone talking at once. ${f.small.length ? `${f.small[0].firstName} is trying to stay up for Midnight Mass.` : 'Midnight Mass at St. Ann\'s after.'} Your capos have each sent a basket. One of them wants to come by.`; } },
    { title: () => 'Sunday dinner, the heat outside', when: (c) => c.heat !== 'quiet', text: (c) => { const f = fam(c); return `Sunday dinner, and a car has been parked across Glenwood Avenue since the morning with two men in it who are not from the neighborhood. ${f.wife ? f.wife.firstName : 'Your mother'} sends one of the kids out with a plate of cannoli for them. Nobody at the table mentions it twice.`; } },
  ],
});

/* ------------------------------------------------------------------ */
/* The crew's scores: a different delivery every time                 */
/* ------------------------------------------------------------------ */

const SCORE_IDS = new Set(['crew_score', 'score_number', 'score_salvage', 'score_fight', 'score_lot', 'score_tourist']);

function score(c: SceneCtx) {
  const m = c.who!;
  const k = capoOf(c.s, m);
  return { n: displayName(m), f: m.firstName, what: String(c.ev.meta?.what ?? 'made a score'), total: $(Number(c.ev.meta?.total ?? 0)), k };
}

const scoreDeliveries: ((c: SceneCtx) => string)[] = [
  (c) => { const x = score(c); return `${x.n} ${x.what}: ${x.total}. He comes by the Shamrock with your end in an envelope${x.k ? `, ${x.k.firstName} already took his` : ''}. Some bosses take it all.`; },
  (c) => { const x = score(c); return `${x.n} ${x.what}. ${x.total}, and he cannot stop grinning. He hands you your end in a paper bag from the Boardwalk Fudge shop, under a half-pound of vanilla. Some bosses would take the whole bag.`; },
  (c) => { const x = score(c); return `On the steps of St. Ann's after the nine o'clock, ${x.n} tells you, quietly, that he ${x.what}: ${x.total}. Your end will be in your mailbox tonight, if you want your end. Some bosses want more.`; },
  (c) => { const x = score(c); return `${x.n} ${x.what}, ${x.total} all told, and he has brought it to you before he has told his wife. ${x.k ? `${x.k.firstName} took the capo's end on the way.` : ''} What you take is up to you.`.trim(); },
  (c) => { const x = score(c); return `In the steam room at the Hotel Dorset, towels and no witnesses, ${x.n} tells you he ${x.what}. ${x.total}. "Your end's in the locker." A greedier boss would want the locker key.`; },
  (c) => { const x = score(c); return `${cap(c.weather)}. ${x.n} catches you coming out of the Blaker theater: he ${x.what}, ${x.total}. He walks you to your car and leaves an envelope on the seat. How thick it should be is your call.`; },
  (c) => { const x = score(c); return `${x.n} ${x.what}. The word is all over the boardwalk by noon, which he is not happy about: ${x.total}, and half the island knows it. He brings your end to the Admiral diner, in a menu.`; },
  (c) => { const x = score(c); return `At Otten's Harbor, gutting fluke on the dock, ${x.n} mentions he ${x.what}: ${x.total}. Your end is in the tackle box. ${x.k ? `${x.k.firstName} already had his. ` : ''}The gulls are watching. So is the crew.`; },
  (c) => { const x = score(c); return `${x.n}'s wife answers your door with a casserole dish and a note: ${x.f} ${x.what}, ${x.total}, and "this is for Mr. ${c.boss.lastName}." The money is under the foil. The rest is at his house, if you want it.`; },
  (c) => { const x = score(c); return `At the Wildwood Elks, ${x.n} buys the whole bar a round and then buys you a private one: he ${x.what}, ${x.total}. Your end comes across the bar folded in a cocktail napkin.${c.war ? ` With the ${c.war} business on, money is welcome.` : ''}`; },
  (c) => { const x = score(c); return `${x.n} ${x.what}. He tells you in the barber's chair at Nardi's, the radio on the Phillies losing again: ${x.total}. The barber pretends to be deaf. Your end is in the newspaper on the bench.`; },
  (c) => { const x = score(c); return `Ringside at the Convention Hall Friday fights, ${x.n} leans over between rounds: he ${x.what}, ${x.total}. "Your end's in your coat pocket." It is. You did not feel him put it there.`; },
];

registerFamily({
  id: 'score',
  match: (ev) => SCORE_IDS.has(ev.defId) && ev.meta?.what !== undefined,
  scenes: scoreDeliveries.map((text) => ({ title: (c: SceneCtx) => c.ev.title, text })),
});

/* ------------------------------------------------------------------ */
/* Funerals: a mandatory beat, still never told the same way           */
/* ------------------------------------------------------------------ */

function dead(c: SceneCtx) {
  const d = c.who;
  const cause = d?.death?.cause ?? (c.ev.text.match(/\(([^)]*)\)/)?.[1] ?? 'his time came');
  return { n: d ? displayName(d) : c.ev.title.replace('Funeral: ', ''), f: d?.firstName ?? 'he', cause, wife: d?.household?.wife };
}

registerFamily({
  id: 'funeral',
  match: (ev) => ev.defId === 'funeral',
  scenes: [
    { title: (c) => `Funeral: ${dead(c).n}`, text: (c) => { const x = dead(c); return `${x.n} is laid to rest (${x.cause}). The whole island is watching how the family honors its dead.`; } },
    { title: (c) => `Funeral: ${dead(c).n}`, text: (c) => { const x = dead(c); return `Rain at Cold Spring cemetery, umbrellas from the gate to the grave. ${x.n} (${x.cause}). ${x.wife ? `${x.wife} has not let go of the priest's arm all morning.` : 'Nobody who matters is missing.'} Everybody is counting the flowers, and who sent them.`; } },
    { title: (c) => `Funeral: ${dead(c).n}`, text: (c) => { const x = dead(c); return `The wake runs two nights at the funeral home on New Jersey Avenue, the line out the door and down the block. ${x.n} (${x.cause}). The men stand outside smoking; the women sit with the family. How the family buries him will be talked about all winter.`; } },
    { title: (c) => `Funeral: ${dead(c).n}`, text: (c) => { const x = dead(c); return `Requiem Mass at St. Ann's for ${x.n} (${x.cause}). The monsignor is waiting to hear from you about the size of it: the choir, the cars, the procession down Pacific Avenue past the places ${x.f} used to stand.`; } },
    { title: (c) => `Funeral: ${dead(c).n}`, text: (c) => { const x = dead(c); return `${x.n} is gone (${x.cause}), and the flowers have started coming before anybody has decided anything: a horseshoe of carnations from Philadelphia, a wreath from somebody nobody can place. ${x.wife ? `${x.wife} wants to know what you are going to do.` : 'The island wants to know what you are going to do.'}`; } },
    { title: (c) => `Funeral: ${dead(c).n}`, when: (c) => !c.summer, text: (c) => { const x = dead(c); return `${cap(c.weather)}, and the ground at the cemetery is hard. ${x.n} (${x.cause}). In the off-season every man on the island will come, because there is nothing else to do, and every one of them will remember how it was done.`; } },
    { title: (c) => `Funeral: ${dead(c).n}`, when: (c) => c.summer, text: (c) => { const x = dead(c); return `A summer funeral: the procession has to wait at Rio Grande Avenue for the tourists' cars to clear, dark suits in ninety degrees. ${x.n} (${x.cause}). The tourists stare. The island does not; it is busy deciding what the family's send-off says.`; } },
    { title: (c) => `Funeral: ${dead(c).n}`, text: (c) => { const x = dead(c); return `${x.n} (${x.cause}). His mother wants him laid out in the front room the old way, with the rosary and the candles; the funeral director wants him at the home. Everyone is waiting for you to decide how big this is going to be.`; } },
    { title: (c) => `Funeral: ${dead(c).n}`, when: (c) => !!c.war, text: (c) => { const x = dead(c); return `With the ${c.war} business still going, half the men want a quiet burial and half want the biggest funeral the island has seen, as a message. ${x.n} (${x.cause}). Either way, there will be men watching the cemetery gate.`; } },
    { title: (c) => `Funeral: ${dead(c).n}`, text: (c) => { const x = dead(c); return `The Leader runs ${x.n}'s obituary on page three: "a well-known local businessman" (${x.cause}). The paper will cover the funeral too. So will the County detectives, from a car across the street. How it goes is up to you.`; } },
  ],
});

/* ------------------------------------------------------------------ */
/* The Table sits: a ruling panel, never in the same room twice        */
/* ------------------------------------------------------------------ */

const TABLE_ROOMS = [
  'A private room above a Ninth Street restaurant.',
  'The back room of a social club on Passyunk Avenue, the shades down, a television on with the sound off.',
  'A farmhouse in Chester County with the cows looking in, because the old men no longer trust the city.',
  'The banquet room of a closed catering hall in South Philadelphia, chairs stacked against the wall.',
  'A hunting cabin in the Poconos, a fire going, three cars parked facing the road.',
  'The upstairs of a bakery in the Italian Market, the smell of bread and the ovens going below.',
  'A suite at a motor lodge on Route 1, the television turned up for the ball game.',
  'A boat anchored in the Delaware off Essington, the men in windbreakers, nobody seasick yet.',
  'The rectory dining room of a parish whose pastor is somebody\'s cousin, the crucifix watching.',
  'A restaurant in Atlantic City closed for a "private party," every table but one empty.',
  'The back office of a vending company in Camden, the jukeboxes waiting for repair along the wall.',
  'A summer house on Longport\'s bay side, the boat lifts creaking, the screens full of moths.',
];

registerFamily({
  id: 'hearing',
  match: (ev) => ev.defId === 'hearing' && ev.text.startsWith('A private room above a Ninth Street restaurant.'),
  scenes: TABLE_ROOMS.map((room): Scene => ({
    title: () => 'The Table sits',
    text: (c) => c.ev.text.replace('A private room above a Ninth Street restaurant.', `${room}${c.war ? ` With the ${c.war} business on, every man was searched at the door.` : ''}`),
  })),
});

/* ------------------------------------------------------------------ */
/* A dispute is brought to the Table: how the word arrives             */
/* ------------------------------------------------------------------ */

const DISPUTE_WORD: [string, string][] = [
  ['', 'Sal Moretti will hear it in two weeks. Until then, the members can be talked to.'],
  ['A lawyer from Philadelphia who represents nobody in particular calls the Shamrock to read it to you, slowly.', 'The hearing is in two weeks. Every member of the Table can be visited between now and then, he adds, and hangs up.'],
  ['Sal Moretti\'s driver brings it on a folded sheet of hotel stationery.', 'Two weeks, the note ends. "Talk to whoever you need to talk to."'],
  ['You hear it first at a wake in South Philadelphia, from a man who should not have told you.', 'By the time the official word comes, you have two weeks and a list of the men who vote.'],
  ['The word comes the old way: an old man at the Elks leans over the pinochle table and says it without looking up.', 'The Table sits in two weeks. In two weeks a lot of dinners can be eaten.'],
  ['A priest who hears confessions for half of Philadelphia carries the message, which is how you know it is serious.', 'Two weeks to the hearing. The members have been told to keep their doors open.'],
  ['The bagman delivers it with the envelope receipt, as if it were part of the bill.', 'Two weeks, he says. "Bring your friends. Bring your arguments. Bring cash, it never hurts."'],
  ['It is in the back of a racing form left on your car seat at the track, circled in red.', 'The Table will hear it in two weeks. Until then, everybody who votes can be reached.'],
  ['Your consigliere comes back from Philadelphia gray in the face with the news.', 'The hearing is in two weeks, he says. "We have that long to change some minds."'],
  ['A telegram, of all things, to the Shamrock: NEED TO SEE YOU STOP TABLE STOP. Then a phone call that explains it.', 'Two weeks. The members are expecting visits.'],
];

registerFamily({
  id: 'dispute_raised',
  match: (ev) => ev.defId === 'dispute_raised' && ev.text.includes(' Sal Moretti will hear it'),
  scenes: DISPUTE_WORD.map(([open, tail]): Scene => ({
    title: () => 'A dispute is brought to the Table',
    text: (c) => `${open ? `${open} ` : ''}${c.ev.text.slice(0, c.ev.text.indexOf(' Sal Moretti will hear it'))} ${tail}`,
  })),
});

/* ------------------------------------------------------------------ */
/* The opening of a reign                                              */
/* ------------------------------------------------------------------ */

const CLASSIC_OPENINGS: ((c: SceneCtx) => string)[] = [
  () => 'The old man is gone, and the island looks at you.',
  () => 'The old man\'s funeral is over. On the steps of St. Ann\'s, a line forms to shake your hand: capos, councilmen, a bartender, a priest. Each of them wants to see what kind of man the island has now.',
  () => 'Memorial Day, 1960. The boardwalk opens for the season this morning, and so do you: the old man\'s chair at the Shamrock is yours. Everybody who comes in today takes a good look.',
  () => 'The old man died in his sleep at Burdette Tomlin with your hand on his. By the time you come down to the lobby, three men are waiting to tell you how things should go now.',
  () => 'The old man\'s lawyer reads the will in an office on Pacific Avenue: the house to his widow, the boat to his brother, and the island, which is not in the will, to you. Everyone in the room already knows.',
  () => 'Dawn on the boardwalk, the planks still wet. The old man used to walk it every morning to count the stands. This morning you walk it alone, and the men opening the shutters nod at you the way they nodded at him.',
  () => 'The wake on Glenwood Avenue runs until two. At the end of it, the old man\'s capos sit at the kitchen table and wait for you to sit down first. You do.',
  () => 'Philadelphia\'s bagman comes to the old man\'s funeral, signs the book, and on his way out tells you Sal Moretti expects things to go on as before. He does not say "or else." He does not have to.',
];

const SUCCESSIONS: ((c: SceneCtx) => string)[] = [
  (c) => `${c.ev.text}`,
  (c) => `${c.ev.text.replace(/ takes the chair\.$/, '')}. At the Shamrock, the chair at the head of the long table is empty, and nobody will sit in it until ${c.boss.firstName} does.`,
  (c) => `${c.ev.text.replace(/ takes the chair\.$/, '')}. The capos come one at a time to ${c.boss.firstName}'s kitchen to kiss the new boss's cheek, and each of them stays exactly as long as he thinks is safe.`,
  (c) => `${c.ev.text.replace(/ takes the chair\.$/, '')}. Philadelphia sends a wreath and a message: the island goes on paying. ${c.boss.firstName} is the one who pays it now.`,
  (c) => `${c.ev.text.replace(/ takes the chair\.$/, '')}. ${cap(c.weather)}. ${c.boss.firstName} sits in the old office alone for an hour before anybody is let in.`,
];

registerFamily({
  id: 'made_boss',
  match: (ev) => ev.defId === 'made_boss',
  scenes: [
    ...CLASSIC_OPENINGS.map((text): Scene => ({ when: (c) => c.ev.title === 'Made the boss' && !/is gone\. /.test(c.ev.text) && c.s.week <= 2, title: () => 'Made the boss', text })),
    ...SUCCESSIONS.map((text): Scene => ({ when: (c) => / takes the chair\.$/.test(c.ev.text), title: (c) => c.ev.title, text })),
    { when: (c) => c.ev.title === 'First day with the crew', title: () => 'First day with the crew', text: (c) => c.ev.text },
  ],
});

/* ------------------------------------------------------------------ */
/* Every other crew decision: a setting, never the same twice in a row */
/* ------------------------------------------------------------------ */

const SETTINGS: { t: string; when?: (c: SceneCtx) => boolean }[] = [
  { t: 'Saturday morning at Nardi\'s barbershop on Rio Grande Avenue, a hot towel on your face.' },
  { t: 'The back booth at the Shamrock, before the band sets up.' },
  { t: 'On the boardwalk by the tram car, the air full of fudge and creosote.', when: (c) => c.summer },
  { t: 'Steam on the windows of the Admiral diner, the island empty for the season.', when: (c) => !c.summer },
  { t: 'On the steps of St. Ann\'s after the eight o\'clock Mass.' },
  { t: 'Parked on the bay side in West Wildwood, the engine ticking as it cools.' },
  { t: 'Ringside at the Convention Hall fights, between the third and fourth rounds.' },
  { t: 'In the clubhouse at Atlantic City Race Course, between races.', when: (c) => c.month >= 4 && c.month <= 10 },
  { t: 'At a wake on New Jersey Avenue, out by the coat rack where the men stand.' },
  { t: 'Under the Hunt\'s Pier, out of the wind.' },
  { t: 'On a charter boat out of Otten\'s Harbor, the bluefish running.', when: (c) => c.month >= 5 && c.month <= 10 },
  { t: 'In your kitchen on Glenwood Avenue, late, the coffee gone cold.' },
  { t: 'The Wildwood Elks on a Tuesday, a bowling league crashing in the basement.' },
  { t: 'In the steam room at the Hotel Dorset.' },
  { t: 'At the Acme on New Jersey Avenue, of all places, by the canned tomatoes.' },
  { t: 'Leaning on the rail of the Rio Grande bridge, watching the boats come in.' },
  { t: 'In the front seat of your Cadillac outside the Ivanhoe, the radio on low.' },
  { t: 'At the Wildwood Crest beach in the evening, the lifeguard stands empty.', when: (c) => c.summer },
  { t: 'At a christening party in somebody\'s backyard in Rio Grande, paper plates and a keg.', when: (c) => c.month >= 5 && c.month <= 9 },
  { t: 'Christmas lights on the shuttered stands, and a man waiting by your car.', when: (c) => c.month === 12 },
  { t: 'In the back of Kaplan\'s Hardware, among the paint cans.' },
  { t: 'At the bar of the Riptide on a slow Monday night.' },
  { t: 'Over pinochle in the back room of the Olympia luncheonette.' },
  { t: 'During the seventh-inning stretch on the radio, the Phillies down by six.', when: (c) => c.month >= 4 && c.month <= 9 },
  { t: 'At the Inlet jetty at dawn, fishing lines out.' },
  { t: 'In the hallway outside the Wildwood courthouse, everybody pretending not to look.' },
  { t: 'At the Fourth of July fireworks, faces lit up green and red.', when: (c) => c.month === 7 },
  { t: 'At the Feast of the Assumption, the procession going by with the money pinned to the Madonna.', when: (c) => c.month === 8 },
  { t: 'At the high school football game under the lights, the band playing the fight song.', when: (c) => c.month >= 9 && c.month <= 11 },
  { t: 'In the cold at the Cape May ferry lot, the heater running.', when: (c) => !c.summer },
  { t: 'At the bakery on Pacific Avenue, a box of sfogliatelle on the counter.' },
  { t: 'On the porch of the shore house, the ocean two blocks away.', when: (c) => c.summer },
  { t: 'Walking the empty boardwalk in a coat, the stands boarded up.', when: (c) => !c.summer },
  { t: 'At the car wash on Rio Grande Avenue, both of you standing out of the spray.' },
  { t: 'At the counter of the Woolworth\'s, over grilled cheese.' },
  { t: 'On the phone, late, the line crackling from Philadelphia.' },
];

registerFamily({
  id: 'crew',
  fallback: true,
  match: (ev) => !!ev.meta?.crew && !ev.mandatory,
  scenes: SETTINGS.map((st) => ({
    when: st.when,
    title: (c: SceneCtx) => c.ev.title,
    text: (c: SceneCtx) => `${st.t} ${c.ev.text}`,
  })),
});

/** Who holds the capos' seats now (tests). */
export function caposNow(s: GameState): string[] {
  return capos(s).map((c) => c.id);
}

/** A choice relabeled for a scene keeps its effects (tests). */
export function sameEffects(a: Choice, b: Choice): boolean {
  return JSON.stringify(a.effects) === JSON.stringify(b.effects);
}

export { relabel };
