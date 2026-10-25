import { ageOn } from './calendar';
import { dressScene } from './sceneVariants';
import { hasBones } from './bones';
import { capos, crew, displayName, isFree, player } from './characters';
import { regimeSizes } from './hierarchy';
import { beat, hit, mgEffect, mgOf, registerAttacher, registerMinigame, type MgOption, type MgSession, type MinigameDef } from './minigame';
import type { Character, Effect, EventInstance, GameState } from './types';

/**
 * SCRIPTED SPECIAL MOMENTS, played in the mini-game framework as short
 * multi-beat cinematic scenes: a full-screen noir card per beat, the real
 * characters' portraits, typewriter text, one to three choices with real
 * effects, and the same "let it play out".
 *
 *  - MADE THE BOSS: the opening of every new game (and again when a new boss
 *    takes the chair by succession).
 *  - THE MADE-MAN CEREMONY: replaces the old single-card making.
 *
 * The text follows Michael's special-moments script.
 */

export interface SceneCard {
  scene: string;
  kicker: string;
  text: string;
  actors: string[];
}

interface Beat {
  card: SceneCard;
  options: MgOption[];
}

export interface SceneData {
  kind: 'madeboss' | 'ceremony';
  beats: Beat[];
  i: number;
  card: SceneCard;
  /** Effects gathered from the choices. */
  fx: Effect[];
  picks: string[];
  title: string;
  /** Ceremony: the candidate and the people around him. */
  candidateId?: string;
  sponsorId?: string;
  capoId?: string;
  crewCapoId?: string;
  speech?: string;
  fbi?: boolean;
  passedOver?: string[];
  variant?: string;
}

type SS = MgSession<SceneData>;

const next = (label = 'Continue'): MgOption[] => [{ id: 'next', label }];
const name = (c: Character | undefined, fallback = 'somebody') => (c ? displayName(c) : fallback);

/* ---------------------------------------------------------------- */
/* Made the Boss                                                     */
/* ---------------------------------------------------------------- */

function capoRing(s: GameState): Character[] {
  const ks = capos(s).filter((k) => k.alive && k.id !== s.playerId);
  const ub = crew(s).find((c) => c.rank === 'underboss' && c.alive);
  const all = [...(ub ? [ub] : []), ...ks];
  // Capo1 is the one who would sit in the old man's chair: the most ambitious, then the oldest.
  return all.sort((a, b) => Number(b.traits.includes('Ambitious')) - Number(a.traits.includes('Ambitious')) || a.birth.y - b.birth.y);
}

function madeBossBeats(s: GameState, ses: SS): Beat[] {
  const p = player(s);
  const variant = String(ses.params.variant ?? (s.flags.start_rise ? 'rise' : s.flags.start_sees ? 'sees' : 'classic'));
  const ring = capoRing(s);
  const [k1, k2, k3] = ring;
  const philly = s.rivals.find((r) => r.id === 'philly');
  const phillyBoss = philly ? s.characters[philly.leaderId] : undefined;
  const wife = p.spouseId ? s.characters[p.spouseId] : undefined;
  const oldId = String(ses.params.old ?? p.fatherId ?? '');
  const old = oldId ? s.characters[oldId] : undefined;
  const cause = String(ses.params.cause ?? old?.death?.cause ?? '');
  const kName = (k: Character | undefined, f: string) => (k ? displayName(k) : f);
  const date = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][s.date.m - 1]} ${s.date.d}, ${s.date.y}`;
  const fx = {
    sit: [{ type: 'respect', amount: 3 }, ...(k1 ? [{ type: 'opinion', from: k1.id, to: p.id, amount: -10, reason: 'Took the chair without a word', decay: 0 }] : [])] as Effect[],
    stay: [{ type: 'respect', amount: -2 }, ...(k1 ? [{ type: 'opinion', from: k1.id, to: p.id, amount: 15, reason: 'Let me keep the old man\'s chair', decay: 1 }] : [])] as Effect[],
    round: [...ring.map((k) => ({ type: 'opinion', from: k.id, to: p.id, amount: 5, reason: 'A round table', decay: 1 }) as Effect), ...(ring.length ? [{ type: 'opinion', from: [...ring].sort((a, b) => a.birth.y - b.birth.y)[0].id, to: p.id, amount: -4, reason: 'The old guard grumbles', decay: 1 } as Effect] : [])],
  };
  const chairChoices = (who: Character | undefined): MgOption[] => who ? [
    { id: 'sit', label: 'Sit in it. Say nothing.', detail: `Fear: +3 respect; ${who.firstName} −10, and he remembers.` },
    { id: 'stay', label: `Ask him to stay seated. "${variant === 'sees' ? 'You earned' : 'My father would want you'} comfortable."`, detail: `Respect: ${who.firstName} +15; the others read it as softness (−2 respect).` },
    { id: 'round', label: 'Take a different chair. "We\'ll get a round table."', detail: 'Generosity: every capo +5; the old guard grumbles.' },
  ] : next();
  const beats: Beat[] = [];
  if (variant === 'rise') {
    const k = k1;
    beats.push({ card: { scene: 'street', kicker: 'First day with the crew', text: `The corner of Pacific and Schellenger, outside the numbers bank, a Tuesday morning in late May, ${s.date.y}. Runners go in with paper bags and come out with nothing. Nobody in Philadelphia knows your name. Today, a few men on this island will learn it.`, actors: [p.id] }, options: next() });
    beats.push({ card: { scene: 'sitdown', kicker: 'The back room of the Shamrock', text: `The table is short and the coffee is bad. ${kName(k, 'Your capo')} is already sitting at the head of it. He stands when you walk in. Slowly. The two soldiers behind him watch to see what you do.`, actors: k ? [p.id, k.id] : [p.id] }, options: chairChoices(k) });
    beats.push({ card: { scene: 'street', kicker: 'The boardwalk at dusk', text: `You walk the length of it alone. The Ferris wheel on Hunt's Pier is still. A kid painting a ring-toss stand stops to watch you pass. Nobody has ever watched you pass before.${wife ? ` At the end of the boards ${wife.firstName} is waiting with your coat.` : ''}`, actors: wife ? [p.id, wife.id] : [p.id] }, options: next() });
    beats.push({ card: { scene: 'sitdown', kicker: 'What you tell him you want', text: `${k ? k.firstName : 'Your capo'} pours two glasses and waits. "So. What do you want out of this?"`, actors: k ? [p.id, k.id] : [p.id] }, options: firstWords(true) });
  } else {
    const funeral = variant === 'succession' || (variant === 'classic' && old && !old.alive);
    const b1 = variant === 'sees'
      ? `The back room of the Bolero Supper Club, a retirement dinner nobody calls a retirement dinner. Don Salvatore "The Shark" Sees, sixty years old, tells the room he will choose an heir before the summer is out. Vito, Donato and Francesca sit at three different tables. In nine days the boardwalk opens. By then everyone will know who is running things.`
      : funeral
        ? `The church smells of lilies and floor wax. ${name(old, 'The old man')} lies in a bronze casket that cost more than most of the mourners make in a year${cause && variant === 'succession' ? ` (${cause})` : ''}. ${variant === 'succession' ? 'Outside, the island is waiting.' : 'Outside, the boardwalk is still boarded up for the season. In nine days it opens. By then somebody has to be running things.'}\n\nYou stand in the front pew. Behind you, you can feel the capos counting.`
        : `A retirement dinner at the Bolero. ${name(old, 'The old man')} hands you the keys to the back room and a list of names in his own handwriting. Outside, the boardwalk is still boarded up for the season. In nine days it opens. By then you have to be running things.\n\nBehind you, you can feel the capos counting.`;
    beats.push({ card: { scene: funeral ? 'church' : 'sitdown', kicker: variant === 'sees' || !funeral ? `The Bolero Supper Club. ${date}.` : variant === 'succession' ? `St. Ann's, Wildwood. ${date}.` : `St. Ann's, Wildwood. A Tuesday morning in late May, ${s.date.y}.`, text: b1, actors: [p.id, ...(old ? [old.id] : [])] }, options: next() });
    beats.push({ card: { scene: 'sitdown', kicker: funeral ? 'The back room of the Shamrock, after the burial' : 'The back room of the Shamrock, after the dinner', text: `The table is long and the coffee is bad. ${kName(k1, 'The underboss')} is already sitting in the old man's chair. He stands when you walk in. Slowly.\n\nOne by one they come to you. ${kName(k2, 'One capo')} kisses your cheek. ${kName(k3, 'Another')} shakes your hand and holds it a second too long. ${k1 ? k1.firstName : 'He'} does neither.`, actors: [p.id, ...[k1, k2, k3].filter((x): x is Character => !!x).map((x) => x.id)] }, options: chairChoices(k1) });
    if (variant !== 'sees') {
      beats.push({ card: { scene: 'street', kicker: 'The Buick outside', text: `A man you have never met is waiting in a gray Buick with Pennsylvania plates. ${name(phillyBoss, 'Philadelphia')} sent him. He doesn't get out.\n\n"The old man paid nine points of everything, on the first of the month, in an envelope that was never light. Philadelphia would like to know if anything has changed."`, actors: phillyBoss ? [phillyBoss.id] : [] }, options: [
        { id: 'philly_same', label: '"Nothing has changed."', detail: 'Philadelphia opinion +10.' },
        { id: 'philly_summer', label: '"Give me the summer. Then we\'ll talk about points."', detail: 'Philadelphia opinion −5; they will want to talk in the fall.' },
        { id: 'philly_envelope', label: 'Hand him an envelope you prepared last night.', detail: '−$2,000, Philadelphia opinion +20; the bagman remembers you.', disabled: s.money < 2000 ? 'Needs $2,000' : undefined },
      ] });
    }
    beats.push({ card: { scene: 'street', kicker: 'The boardwalk at dusk', text: `You walk the length of it alone. The Ferris wheel on Hunt's Pier is still. A kid painting a ring-toss stand stops to watch you pass, the way people watched ${variant === 'sees' ? 'you thirty years ago' : 'your father'}.${wife ? `\n\nAt the end of the boards ${wife.firstName} is waiting with your coat.` : ''}`, actors: wife ? [p.id, wife.id] : [p.id] }, options: next() });
    const heirs = variant === 'sees' ? p.childrenIds.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive) : [];
    beats.push({ card: { scene: 'sitdown', kicker: 'Your first words to the family', text: `The capos are gathered again. Everyone waits.${heirs.length ? ` ${heirs.map((h) => h.firstName).join(', ').replace(/, ([^,]*)$/, ' and $1')} watch from the end of the table.` : ''}`, actors: [p.id, ...(heirs.length ? heirs : ring.slice(0, 3)).map((x) => x.id)] }, options: firstWords(false) });
  }
  ses.d.fx = [];
  (ses.d as SceneData & { chairFx?: typeof fx }).chairFx = fx;
  return beats;
}

function firstWords(rise: boolean): MgOption[] {
  return rise
    ? [
      { id: 'w_fear', label: '"Everything. Starting with the corner."', detail: 'Fear: +5 respect, crew opinion −3.' },
      { id: 'w_respect', label: '"A seat at the Table. We get there together."', detail: 'Respect: crew opinion +5, family heat −3.' },
      { id: 'w_generous', label: '"Everybody eats this summer. Everybody."', detail: 'Generosity: crew opinion +8, −$1,500 in envelopes.' },
    ]
    : [
      { id: 'w_fear', label: '"Nothing moves on this island without my say. Nothing."', detail: 'Fear: +5 respect, crew opinion −3, rivals cautious.' },
      { id: 'w_respect', label: '"My father built this. We keep it. We keep each other."', detail: 'Respect: crew opinion +5, family heat −3.' },
      { id: 'w_generous', label: '"Everybody eats this summer. Everybody."', detail: 'Generosity: crew opinion +8, −$1,500 in envelopes.' },
    ];
}

function madeBossStep(s: GameState, ses: SS, move: string): void {
  const d = ses.d;
  const p = player(s);
  const fx = (d as SceneData & { chairFx: Record<string, Effect[]> }).chairFx;
  const label = 'Made the boss';
  const add = (xs: Effect[]) => d.fx.push(...xs.map((e) => ({ ...e, label })));
  if (move !== 'next') d.picks.push(move);
  switch (move) {
    case 'sit':
    case 'stay':
    case 'round':
      add(fx[move]);
      break;
    case 'philly_same':
      add([{ type: 'rivalOpinion', rival: 'philly', amount: 10, reason: 'Nothing has changed' }]);
      break;
    case 'philly_summer':
      add([{ type: 'rivalOpinion', rival: 'philly', amount: -5, reason: 'Asked for the summer' }, { type: 'flag', key: 'phillyPoints', value: s.week + 14 }]);
      break;
    case 'philly_envelope':
      add([{ type: 'money', amount: -2000 }, { type: 'rivalOpinion', rival: 'philly', amount: 20, reason: 'An envelope on day one' }, { type: 'heat', bar: 'family', amount: -3 }]);
      break;
    case 'w_fear':
      add([{ type: 'respect', amount: 5 }, { type: 'crewOpinion', amount: -3, reason: 'Nothing moves without his say' }, ...s.rivals.filter((r) => r.kind === 'mob').map((r) => ({ type: 'rivalOpinion', rival: r.id, amount: -3, reason: 'A hard man in the chair' }) as Effect)]);
      break;
    case 'w_respect':
      add([{ type: 'crewOpinion', amount: 5, reason: 'We keep each other' }, { type: 'heat', bar: 'family', amount: -3 }]);
      break;
    case 'w_generous':
      add([{ type: 'crewOpinion', amount: 8, reason: 'Everybody eats this summer' }, { type: 'money', amount: -1500 }]);
      break;
  }
  if (move.startsWith('w_') || d.i + 1 >= d.beats.length) {
    const tone = move === 'w_fear' ? 'fear' : move === 'w_generous' ? 'generosity' : 'respect';
    beat(ses, `${displayName(p)}. Head of the House of ${s.houseName}. Wildwood, New Jersey. ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][s.date.m - 1]} ${s.date.d}, ${s.date.y}.`, 'quote');
    ses.done = true;
    ses.phase = 'end';
    ses.outcome = { title: 'Made the boss', text: `${displayName(p)} sits in the chair. The tone of the reign: ${tone}.`, tone: 'good', effects: d.fx };
    return;
  }
  advance(ses);
}

function advance(ses: SS): void {
  const d = ses.d;
  d.i += 1;
  d.card = d.beats[d.i].card;
  ses.phase = `beat${d.i + 1}`;
}

function sceneOptions(_s: GameState, ses: SS): MgOption[] {
  return ses.d.beats[ses.d.i]?.options ?? next();
}

function sceneAuto(_s: GameState, ses: SS): string {
  const o = sceneOptions(_s, ses).filter((x) => !x.disabled);
  // The default play: the respectful middle road.
  const pref = ['next', 'round', 'philly_same', 'w_respect', 'sp_sponsor', 'say_warm', 'crew_own'];
  return o.find((x) => pref.includes(x.id))?.id ?? o.find((x) => x.id.startsWith('crew_'))?.id ?? o[0]?.id ?? 'next';
}

export const MADE_BOSS: MinigameDef<SceneData> = {
  id: 'madeboss',
  init: (s, ses) => {
    const d: SceneData = { kind: 'madeboss', beats: [], i: 0, card: { scene: 'church', kicker: '', text: '', actors: [] }, fx: [], picks: [], title: 'Made the boss', variant: String(ses.params.variant ?? '') };
    ses.d = d;
    d.beats = madeBossBeats(s, ses);
    d.card = d.beats[0].card;
    const p = player(s);
    return { d, phase: 'beat1', intro: { title: ses.params.variant === 'rise' ? 'First day with the crew' : 'Made the boss', kicker: `The House of ${s.houseName}`, text: ses.params.variant === 'succession' ? `The old man is gone, and the island looks at ${p.firstName}.` : 'The first five minutes: the old man is gone, and the island looks at you. Your answers set the tone of your reign.', scene: d.card.scene } };
  },
  options: sceneOptions,
  step: (s, ses, m) => {
    if (m === 'next') beat(ses, ses.d.card.text.split('\n\n')[0], 'info');
    madeBossStep(s, ses, m);
  },
  auto: sceneAuto,
};

/* ---------------------------------------------------------------- */
/* The Made-Man Ceremony                                             */
/* ---------------------------------------------------------------- */

function ceremonyBeats(s: GameState, ses: SS): Beat[] {
  const d = ses.d;
  const c = s.characters[d.candidateId!];
  const p = player(s);
  const sponsor = d.sponsorId ? s.characters[d.sponsorId] : undefined;
  const sizes = regimeSizes(s);
  const ring = capos(s).filter((k) => k.alive && isFree(s, k));
  const other = ring.filter((k) => k.id !== sponsor?.id).sort((a, b) => (sizes.get(a.id) ?? 0) - (sizes.get(b.id) ?? 0))[0];
  d.capoId = other?.id;
  const ub = crew(s).find((x) => x.rank === 'underboss' && x.alive);
  const sponsorOpts: MgOption[] = [
    ...(sponsor ? [{ id: 'sp_sponsor', label: `${displayName(sponsor)}, who brought him in.`, detail: `Natural. ${sponsor.firstName} +10.` }] : []),
    { id: 'sp_you', label: 'You, personally.', detail: `He is yours now: his loyalty to you +20, to his capo −10. Other associates take note.` },
    ...(other ? [{ id: 'sp_capo', label: `${displayName(other)}, the capo you want him under.`, detail: `${other.firstName} +10${sponsor ? `; ${sponsor.firstName} feels passed over` : ''}.` }] : []),
  ];
  const crewOpts: MgOption[] = ring.slice(0, 4).map((k) => {
    const n = sizes.get(k.id) ?? 0;
    const minN = Math.min(...ring.map((x) => sizes.get(x.id) ?? 0));
    const maxN = Math.max(...ring.map((x) => sizes.get(x.id) ?? 0));
    return { id: `crew_${k.id}`, label: `${displayName(k)}'s crew (${n} men)`, detail: n === minN ? `A short crew: ${k.firstName} +5.` : n === maxN ? `The strongest crew: ${k.firstName}'s faction grows (+3).` : `${k.firstName} +3.` };
  });
  const sponsorOrYou = sponsor ? displayName(sponsor) : 'Your underboss';
  // What he did to be here (bones.ts): the ring knows, or knows he did nothing.
  const bones = c.bones?.[0];
  const record = bones ? ` Everyone in the ring knows why he is here: ${bones.year}, the ${bones.job} (${bones.role}).` : ` Nobody in the ring can say what he ever did for this thing of ours. Philadelphia did you a favor, and the old-timers look at the floor.`;
  return [
    { card: { scene: 'street', kicker: 'The drive', text: `${c.firstName} was told to wear a suit and wait on the corner of Pacific and Schellenger at nine. ${sponsorOrYou} picks him up. Nobody talks. Somewhere past the Rio Grande bridge, ${c.firstName} wonders, the way they all wonder, whether this is the ride you come back from.`, actors: [c.id, ...(sponsor ? [sponsor.id] : [])] }, options: next() },
    { card: { scene: 'ceremony', kicker: 'The room', text: `The back of a closed restaurant in the Crest; blinds down, one lamp. The capos stand in a ring. On the table: a revolver, a knife, a saint card, and a candle.${record}\n\nWho stands up for him?`, actors: [c.id, p.id, ...ring.slice(0, 3).map((k) => k.id)] }, options: sponsorOpts },
    { card: { scene: 'ceremony', kicker: 'The oath', text: `You speak. He repeats.\n\n"You came in here alive. You'll leave here a different man. This thing of ours comes before your blood, before your wife, before your children, before God himself on a Sunday. When you're called, you come. What you see, you never saw. You never touch another man's wife, and you never raise your hand to a friend of ours without the word."\n\nThe knife touches his trigger finger; one drop falls on the saint. You set the card alight in his cupped hands. It curls and blackens.\n\n"As this saint burns, so burns my soul if I betray this family."`, actors: [c.id, p.id] }, options: [
      { id: 'say_fear', label: '"Now you can\'t leave. Remember that."', detail: 'Fear: loyalty +10; his ambition cools.' },
      { id: 'say_warm', label: '"Now you eat with us. Bring your mother to Sunday dinner."', detail: 'Warmth: his opinion of you +15.' },
      { id: 'say_earn', label: '"Now you earn. Every week. Don\'t make me ask."', detail: 'Business: his earnings +10%, opinion −5.' },
    ] },
    { card: { scene: 'ceremony', kicker: 'The kiss', text: `Each capo kisses him on both cheeks. ${ub ? displayName(ub) : 'The underboss'} says it first: "He's a friend of ours."\n\nWhich crew does he join?`, actors: [c.id, ...(ub ? [ub.id] : []), ...ring.slice(0, 3).map((k) => k.id)] }, options: crewOpts.length ? crewOpts : next() },
    { card: { scene: 'street', kicker: 'Outside', text: `${c.firstName} lights a cigarette with hands that won't quite stop shaking. Across the street, a car he doesn't recognize has its lights off.`, actors: [c.id] }, options: next('The end of the night') },
  ];
}

function ceremonyStep(s: GameState, ses: SS, move: string): void {
  const d = ses.d;
  const c = s.characters[d.candidateId!];
  const p = player(s);
  const label = `The making of ${c.firstName} ${c.lastName}`;
  const add = (xs: Effect[]) => d.fx.push(...xs.map((e) => ({ ...e, label })));
  const sponsor = d.sponsorId ? s.characters[d.sponsorId] : undefined;
  const capo = d.capoId ? s.characters[d.capoId] : undefined;
  if (move !== 'next') d.picks.push(move);
  if (move === 'next' || d.i === 0) beat(ses, d.card.text.split('\n\n')[0], 'info');
  switch (move) {
    case 'sp_sponsor':
      if (sponsor) add([{ type: 'opinion', from: sponsor.id, to: p.id, amount: 10, reason: `Let me stand for ${c.firstName}`, decay: 1 }]);
      beat(ses, `${sponsor?.firstName ?? 'His sponsor'} puts a hand on his shoulder. "I stand for him."`, 'quote');
      break;
    case 'sp_you': {
      const k = c.capoId ? s.characters[c.capoId] : undefined;
      add([{ type: 'opinion', from: c.id, to: p.id, amount: 20, reason: 'The boss stood for me himself', decay: 0 }, ...(k ? [{ type: 'opinion', from: c.id, to: k.id, amount: -10, reason: 'The boss stood for me, not him', decay: 1 } as Effect] : [])]);
      for (const a of crew(s).filter((x) => x.rank === 'associate' && x.id !== c.id).slice(0, 4)) add([{ type: 'opinion', from: a.id, to: p.id, amount: -2, reason: 'The boss has favorites', decay: 1 }]);
      beat(ses, '"I stand for him." The room goes very quiet.', 'quote');
      break;
    }
    case 'sp_capo':
      if (capo) add([{ type: 'opinion', from: capo.id, to: p.id, amount: 10, reason: `Asked me to stand for ${c.firstName}`, decay: 1 }]);
      if (sponsor && sponsor.id !== capo?.id) add([{ type: 'opinion', from: sponsor.id, to: p.id, amount: -8, reason: `Passed over as ${c.firstName}'s sponsor`, decay: 1 }]);
      beat(ses, `${capo?.firstName ?? 'The capo'} stands for him. ${sponsor ? `${sponsor.firstName} studies the wallpaper.` : ''}`, 'quote');
      break;
    case 'say_fear':
      d.speech = 'fear';
      add([{ type: 'opinion', from: c.id, to: p.id, amount: 10, reason: 'Now I can\'t leave', decay: 0 }, { type: 'meter', from: c.id, to: p.id, meter: 'fear', amount: 10 }, ...(c.goal === 'take_chair' || c.goal === 'become_capo' ? [{ type: 'goalSet', charId: c.id, goal: 'get_rich' } as Effect] : [])]);
      break;
    case 'say_warm':
      d.speech = 'warm';
      add([{ type: 'opinion', from: c.id, to: p.id, amount: 15, reason: 'Bring your mother to Sunday dinner', decay: 1 }]);
      break;
    case 'say_earn':
      d.speech = 'earn';
      add([{ type: 'opinion', from: c.id, to: p.id, amount: -5, reason: 'Every week. Don\'t make me ask.', decay: 1 }, { type: 'story', charId: c.id, text: 'Told at his making: now you earn. He earns harder (+10%).' }]);
      break;
  }
  if (move.startsWith('crew_')) {
    const kid = move.slice(5);
    const k = s.characters[kid];
    const sizes = regimeSizes(s);
    const ring = capos(s).filter((x) => x.alive && isFree(s, x));
    const minN = Math.min(...ring.map((x) => sizes.get(x.id) ?? 0));
    d.crewCapoId = kid;
    add([{ type: 'assign', charId: c.id, capoId: kid }, { type: 'opinion', from: kid, to: p.id, amount: (sizes.get(kid) ?? 0) === minN ? 5 : 3, reason: `Gave me ${c.firstName}`, decay: 1 }]);
    beat(ses, `${c.firstName} goes to ${k ? k.firstName : 'his capo'}'s crew.`, 'info');
  }
  if (d.i + 1 >= d.beats.length) {
    d.fbi = hit(ses, 1 / 8);
    if (d.fbi) add([{ type: 'evidence', charId: c.id, amount: 5 }, { type: 'story', charId: c.id, text: 'The night he was made, a car with its lights off sat across the street. The FBI wrote down his plate.' }]);
    // The passed-over echo.
    const passed = crew(s).filter((x) => x.rank === 'associate' && x.id !== c.id && x.goal === 'get_made' && !x.proposedWeek && !hasBones(x)).slice(0, 2);
    d.passedOver = passed.map((x) => x.id);
    for (const a of passed) {
      add([{ type: 'opinion', from: a.id, to: p.id, amount: -6, reason: `Passed over when ${c.firstName} was made`, decay: 1 }, { type: 'meter', from: a.id, to: p.id, meter: 'grievance', amount: 8 }]);
      beat(ses, `${displayName(a)} heard about the ceremony from a bartender.`, 'bad');
    }
    if (d.fbi) beat(ses, 'Across the street, the car with its lights off writes down a license plate.', 'bad');
    ses.done = true;
    ses.phase = 'end';
    const make = ses.parts.make ?? [];
    ses.outcome = { title: `A friend of ours: ${c.firstName} ${c.lastName}`, text: `${displayName(c)} took the oath${d.crewCapoId ? ` and joined ${s.characters[d.crewCapoId]?.firstName ?? 'his capo'}'s crew` : ''}.`, tone: 'good', effects: [...make, ...d.fx] };
    return;
  }
  advance(ses);
}

export const CEREMONY: MinigameDef<SceneData> = {
  id: 'ceremony',
  init: (s, ses) => {
    const c = s.characters[String(ses.params.candidate)];
    const sponsor = c?.vouchedBy ? s.characters[c.vouchedBy] : undefined;
    const d: SceneData = { kind: 'ceremony', beats: [], i: 0, card: { scene: 'street', kicker: '', text: '', actors: [] }, fx: [], picks: [], title: 'The ceremony', candidateId: c?.id, sponsorId: sponsor?.alive ? sponsor.id : (c?.capoId ?? undefined) };
    ses.d = d;
    d.beats = ceremonyBeats(s, ses);
    d.card = d.beats[0].card;
    return { d, phase: 'beat1', intro: { title: `The making of ${c ? c.firstName : 'a friend'}`, kicker: 'The Made-Man Ceremony', text: 'The night an associate becomes a friend of ours. Your choices shape how loyal he is, who resents it, and which crew he joins.', scene: 'ceremony' } };
  },
  options: sceneOptions,
  step: ceremonyStep,
  auto: sceneAuto,
  apply: (ctx, ses) => {
    const c = ctx.s.characters[ses.d.candidateId ?? ''];
    if (c && ses.d.speech === 'earn') c.attributes.business = Math.min(100, c.attributes.business + 6);
  },
};

registerMinigame(MADE_BOSS);
registerMinigame(CEREMONY);

/* ---------------------------------------------------------------- */
/* Hooks                                                             */
/* ---------------------------------------------------------------- */

/** The "Made the boss" popup (opened automatically by the UI). */
export function buildMadeBoss(s: GameState, variant: string, old?: Character, cause?: string): EventInstance {
  const iid = `ev${s.nextId++}`;
  const params: Record<string, string | number> = { variant, ...(old ? { old: old.id } : {}), ...(cause ? { cause } : {}) };
  const p = player(s);
  return {
    iid, defId: 'made_boss', week: s.week, mandatory: true, priority: 99, meta: { scene: 1 }, actors: [p.id],
    title: variant === 'rise' ? 'First day with the crew' : 'Made the boss',
    text: variant === 'succession' ? `${old ? displayName(old) : 'The old boss'} is gone. ${p.firstName} takes the chair.` : 'The old man is gone, and the island looks at you.',
    defaultChoiceId: 'quiet',
    choices: [
      { id: 'play', label: 'Take the chair', detail: 'A short scene: three choices set the tone of your reign.', because: 'took the chair', effects: [mgEffect('madeboss', iid, { ...params, play: 1 })] },
      { id: 'quiet', label: 'Let it play out', because: 'took the chair quietly', effects: [mgEffect('madeboss', iid, { ...params, play: 0 })] },
    ],
  };
}

/** The opening of every new game: the scene takes the first seat in week one's popups. */
export function addOpeningScene(s: GameState, start: string): void {
  if (s.pendingEvents.some((e) => e.defId === 'made_boss')) return;
  if (s.pendingEvents.length >= 4) {
    const drop = [...s.pendingEvents].reverse().find((e) => !e.mandatory) ?? s.pendingEvents[s.pendingEvents.length - 1];
    s.pendingEvents = s.pendingEvents.filter((e) => e !== drop);
    if (drop.mandatory) s.eventQueue.push(drop);
  }
  const ev = buildMadeBoss(s, start);
  // The opening scene is told a different way each game (sceneFamilies2.ts).
  dressScene(s, ev);
  s.pendingEvents.unshift(ev);
  mgOf(s).known[`boss:${s.playerId}`] = s.week;
}

/** Weekly: a new boss in the chair gets his scene. */
export function scenesWeek(s: GameState): void {
  const mg = mgOf(s);
  const key = `boss:${s.playerId}`;
  if (mg.known[key] !== undefined) return;
  const first = !Object.keys(mg.known).some((k) => k.startsWith('boss:'));
  mg.known[key] = s.week;
  if (first) return; // an old save, or a game started without the opening scene
  const p = player(s);
  const prevIds = Object.keys(mg.known).filter((k) => k.startsWith('boss:') && k !== key).sort((a, b) => mg.known[b] - mg.known[a]);
  const old = prevIds.length ? s.characters[prevIds[0].slice(5)] : undefined;
  const cause = !old ? undefined : old.alive ? (old.faction === 'law' ? 'turned government witness' : 'stepped aside') : old.death?.cause;
  if (p) s.eventQueue.push(buildMadeBoss(s, 'succession', old, cause));
}

/** The making popup gets the ceremony as its first (and default) choice. */
registerAttacher((s, ev) => {
  if (ev.defId !== 'making') return undefined;
  const make = ev.choices.find((c) => c.id === 'make');
  const cid = String(ev.meta?.charId ?? '');
  const c = s.characters[cid];
  if (!make || !c) return undefined;
  ev.defaultChoiceId = 'ceremony_auto';
  ev.choices = [{ id: 'ceremony_auto', label: 'Let the ceremony play out', detail: make.detail, because: make.because, effects: [mgEffect('ceremony', ev.iid, { candidate: c.id, play: 0 }, { make: make.effects })] }, ...ev.choices.filter((x) => x.id !== 'make')];
  return { id: 'ceremony', label: 'Hold the ceremony', detail: `${make.detail ?? ''} A short scene: who stands up for him, what you tell him, which crew he joins.`, because: make.because, effects: [mgEffect('ceremony', ev.iid, { candidate: c.id, play: 1 }, { make: make.effects })] };
});

export function sceneAge(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}
