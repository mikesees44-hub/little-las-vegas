import { ageOn } from './calendar';
import { hashSeed } from './rng';
import type { Character, GameState } from './types';

/**
 * THE BODY PROFILE: how an adult looks, head to toe, in words (women and
 * men alike): height (a word and feet-and-inches), build, figure shape,
 * bust, waist, hips, legs, skin, face (shape, eyes, lips, nose, smile, a
 * mark), hair (color, length, a period style), how she or he carries
 * themselves, voice, scent, wardrobe, and one plain-spoken flavor line ("a
 * bit plump, and some men love that", "the figure of a goddess").
 *
 * Words only and never explicit: no cup letters, no bust/waist/hip numbers,
 * no nudity. Derived from the seed, the id and looks.ts's build (stored
 * choices win, women.looks); adults only, a minor has no body profile.
 * `figureTaste` feeds attraction per observer (looks.ts `appeal`): some like
 * a slender figure, some a full one, some do not care; nobody's looks decide
 * anyone's worth or willingness.
 */

export type Build = 'slender' | 'willowy' | 'athletic' | 'petite' | 'curvy' | 'fullfigured' | 'voluptuous' | 'stocky' | 'heavyset' | 'lean' | 'broad';
export const BUILD_LABEL: Record<Build, string> = {
  slender: 'Slender', willowy: 'Willowy', athletic: 'Athletic', petite: 'Petite', curvy: 'Curvy', fullfigured: 'Full-figured', voluptuous: 'Voluptuous',
  stocky: 'Stocky', heavyset: 'Heavyset', lean: 'Lean', broad: 'Broad-shouldered',
};
export type Figure = 'hourglass' | 'bombshell' | 'pear' | 'apple' | 'straight' | 'triangle';
export const FIGURE_LABEL: Record<Figure, string> = {
  hourglass: 'Hourglass', bombshell: 'A bombshell hourglass', pear: 'Pear-shaped', apple: 'Apple-shaped', straight: 'Straight (no curves to speak of)', triangle: 'Broad shoulders, narrow hips',
};

/** Taste groups an observer can have (or none: looks hardly matter to them). */
export type Taste = 'slim' | 'full' | 'curves' | 'strong' | 'none';
const TASTE_TEXT: Record<Taste, string> = { slim: 'likes a slender figure', full: 'likes a fuller figure', curves: 'likes curves', strong: 'likes a strong build', none: 'doesn\'t much care about build' };

export interface BodyProfile {
  height: string;
  build: Build;
  buildLabel: string;
  figure: string;
  bust?: string;
  waist: string;
  hips: string;
  legs: string;
  skin: string;
  face: { shape: string; eyes: string; lips: string; nose: string; smile: string; mark?: string };
  hair: string;
  posture: string;
  voice: string;
  scent: string;
  wardrobe: string;
  /** One plain-spoken line. */
  flavor: string;
  /** Which taste group this body suits. */
  suits: Taste[];
}

const pk = <T,>(arr: readonly T[], k: string): T => arr[hashSeed(k) % arr.length];
const u = (k: string) => (hashSeed(k) % 100003) / 100003;

const PHYS_TO_BUILD: Record<string, Build> = {
  slender: 'slender', petite: 'petite', curvy: 'curvy', fullfigured: 'fullfigured', athletic: 'athletic', statuesque: 'willowy',
  lean: 'lean', wiry: 'lean', broad: 'broad', stocky: 'stocky', heavyset: 'heavyset',
};

/** Feet and inches for a height in inches (height is not a body measurement in the explicit sense; words come first). */
function ftIn(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function buildOf(s: GameState, c: Character): Build {
  const o = s.women?.looks?.[c.id]?.body as Build | undefined;
  if (o && o in BUILD_LABEL) return o;
  const ph = s.nightlife?.looks?.[c.id]?.ph ?? pk(c.gender === 'F' ? ['slender', 'petite', 'curvy', 'fullfigured', 'athletic', 'statuesque'] : ['lean', 'wiry', 'athletic', 'broad', 'stocky', 'heavyset'], `${s.seed}:ph:${c.id}`);
  let b = PHYS_TO_BUILD[ph] ?? 'slender';
  // A share of curvy and full-figured women read as voluptuous; some stocky ones as heavyset.
  if (c.gender === 'F' && (b === 'curvy' || b === 'fullfigured') && u(`${s.seed}:vol:${c.id}`) < 0.3) b = 'voluptuous';
  return b;
}

/** The profile, or undefined for a minor. */
export function bodyOf(s: GameState, c: Character): BodyProfile | undefined {
  if (ageOn(c.birth, c.death ? c.death.date : s.date) < 18) return undefined;
  const k = (x: string) => `${s.seed}:bd:${x}:${c.id}`;
  const F = c.gender === 'F';
  const b = buildOf(s, c);
  const o = s.women?.looks?.[c.id];
  const tall = b === 'willowy' || (b !== 'petite' && u(k('ht')) < 0.25);
  const short = b === 'petite' || (!tall && u(k('ht')) > 0.75);
  const inch = F ? (short ? 59 + (hashSeed(k('h')) % 3) : tall ? 67 + (hashSeed(k('h')) % 4) : 62 + (hashSeed(k('h')) % 4))
    : (short ? 64 + (hashSeed(k('h')) % 3) : tall ? 72 + (hashSeed(k('h')) % 4) : 68 + (hashSeed(k('h')) % 4));
  const hWord = F ? (short ? 'Petite' : tall ? (inch >= 69 ? 'Statuesque' : 'Tall') : 'Average height') : short ? 'Short' : tall ? 'Tall' : 'Average height';
  let figure: Figure;
  if (!F) figure = b === 'broad' || b === 'athletic' ? 'triangle' : b === 'heavyset' || b === 'stocky' ? 'apple' : 'straight';
  else if (b === 'voluptuous') figure = u(k('bomb')) < 0.6 ? 'bombshell' : 'hourglass';
  else if (b === 'curvy') figure = pk(['hourglass', 'hourglass', 'pear'] as Figure[], k('fg'));
  else if (b === 'fullfigured') figure = pk(['pear', 'apple', 'hourglass'] as Figure[], k('fg'));
  else if (b === 'slender' || b === 'willowy') figure = u(k('fg')) < 0.6 ? 'straight' : 'hourglass';
  else figure = pk(['straight', 'hourglass', 'pear'] as Figure[], k('fg'));
  if (o?.figure && o.figure in FIGURE_LABEL) figure = o.figure as Figure;
  const full = b === 'fullfigured' || b === 'voluptuous' || b === 'heavyset';
  const curvy = figure === 'hourglass' || figure === 'bombshell';
  const bust = F ? (o?.bust ?? (b === 'voluptuous' || figure === 'bombshell' ? 'Ample' : full || b === 'curvy' ? 'Full' : b === 'petite' || figure === 'straight' ? pk(['Small', 'Modest'], k('bs')) : 'Modest')) : undefined;
  const waist = curvy ? 'Narrow' : full || b === 'stocky' ? 'Thick' : 'Average';
  const hips = F ? (figure === 'pear' || figure === 'bombshell' || b === 'voluptuous' ? 'Wide' : curvy || b === 'curvy' ? 'Rounded' : 'Narrow') : figure === 'triangle' ? 'Narrow' : 'Average';
  const legs = tall ? 'Long' : b === 'athletic' ? 'Strong and shapely' : full ? 'Sturdy' : F ? pk(['Shapely', 'Slim', 'Long'], k('lg')) : pk(['Sturdy', 'Lean', 'Long'], k('lg'));
  const blk = c.ethnicity === 'Black';
  const skin = blk ? pk(F ? ['Warm brown, smooth', 'Deep brown', 'Light brown, freckled', 'Copper-toned'] : ['Dark, smooth', 'Deep brown', 'Light brown', 'Warm brown'], k('sk')) : pk(F ? ['Fair, rosy-cheeked', 'Olive, tans in a day', 'Freckled', 'Porcelain-pale', 'Sun-browned from the beach', 'Warm brown, smooth'] : ['Weathered by the sun', 'Olive', 'Fair, burns easily', 'Ruddy', 'Pale from the card rooms', 'Dark, smooth'], k('sk'));
  const face = {
    shape: pk(['Oval', 'Heart-shaped', 'Round', 'Square-jawed', 'Long', 'Angular, high cheekbones'], k('fs')),
    eyes: blk ? pk(['Dark brown, almond-shaped', 'Brown and laughing', 'Deep-set and watchful', 'Dark and bright'], k('ey')) : pk(['Dark brown, almond-shaped', 'Hazel', 'Green', 'Bright blue', 'Gray', 'Brown and laughing', 'Deep-set and watchful'], k('ey')),
    lips: pk(F ? ['Full lips', 'A bow-shaped mouth', 'Thin, precise lips', 'A wide mouth', 'Lipstick always perfect'] : ['Thin lips', 'A wide mouth', 'A hard mouth', 'Full lips'], k('lp')),
    nose: pk(['A small, straight nose', 'A Roman nose', 'A turned-up nose', 'A strong nose', 'A nose broken once'], k('ns')),
    smile: pk(['A slow smile', 'A big, easy smile', 'A crooked grin', 'A smile that never reaches the eyes', 'Dimples when she smiles'.replace('she', F ? 'she' : 'he')], k('sm')),
    mark: u(k('mk')) < 0.5 ? pk(['A beauty mark', 'Freckles across the nose', 'A small scar on the chin', 'A gap between the front teeth', 'Laugh lines'], k('mk2')) : undefined,
  };
  const hair = `${blk ? pk(F ? ['Black', 'Dark brown', 'Black, pressed and curled'] : ['Black', 'Graying at the temples', 'Salt and pepper'], k('hc')) : pk(F ? ['Raven black', 'Dark brown', 'Chestnut', 'Auburn', 'Red', 'Honey blonde', 'Platinum blonde', 'Strawberry blonde'] : ['Black', 'Dark brown', 'Sandy', 'Red', 'Graying at the temples', 'Salt and pepper'], k('hc'))}, ${blk ? pk(F ? ['in soft waves', 'in a bouffant', 'in a French twist', 'cropped short and curled'] : ['close-cropped', 'slicked back in a process', 'parted sharp'], k('hs')) : pk(F ? ['shoulder-length in a flip', 'long and loose', 'in a bouffant', 'in a French twist', 'cropped in a pixie', 'in a ponytail', 'in a beehive'] : ['slicked back', 'in a crew cut', 'combed in a pompadour', 'thinning and combed over', 'wavy and too long for his mother'], k('hs'))}`;
  const posture = pk(F ? ['Carries herself like a dancer', 'Stands straight as a model', 'Slouches when she thinks nobody is looking', 'Moves slowly, deliberately', 'Quick and restless'] : ['Stands like he owns the room', 'Hunched over his cigarette', 'Light on his feet', 'Heavy, deliberate steps', 'Never sits with his back to the door'], k('ps'));
  const voice = pk(F ? ['A low, husky voice', 'A bright, quick voice', 'A soft voice you lean in to hear', 'A South Jersey twang', 'A laugh you hear across the room'] : ['A gravel voice', 'Soft-spoken', 'A Philadelphia accent', 'Loud', 'Says little'], k('vc'));
  const scent = pk(F ? ['Wears Chanel No. 5', 'Smells of lilies of the valley', 'Shalimar, a little too much', 'Soap and suntan lotion', 'Tabu, and cigarettes'] : ['Old Spice', 'Cigars', 'Bay rum', 'Aqua Velva', 'Motor oil and coffee'], k('sc'));
  const wardrobe = pk(F ? ['Tailored suits and gloves', 'Sheath dresses and pearls', 'Capri pants and ballet flats', 'Evening gowns, always', 'Sweater sets and pleated skirts', 'Black turtlenecks, beatnik style'] : ['Sharkskin suits', 'Shirtsleeves and suspenders', 'A camel-hair coat', 'Golf shirts', 'A cardigan'], k('wd'));
  let flavor: string;
  if (F && figure === 'bombshell') flavor = 'The figure of a goddess; heads turn on the boardwalk.';
  else if (F && figure === 'straight' && (b === 'slender' || b === 'willowy')) flavor = 'Skinny, no curves to speak of: a clothes-hanger figure the fashion men like.';
  else if (F && (b === 'fullfigured' || b === 'voluptuous') && figure !== 'hourglass') flavor = 'A bit chunky, and some men love that.';
  else if (F && figure === 'hourglass') flavor = 'An hourglass figure that a good dress was made for.';
  else if (F && b === 'petite') flavor = 'Small and quick; people underestimate her.';
  else if (F && b === 'athletic') flavor = 'Strong, sun-browned, a swimmer\'s shoulders.';
  else if (!F && b === 'heavyset') flavor = 'A big man who fills a doorway.';
  else if (!F && (b === 'broad' || b === 'athletic')) flavor = 'Built like a longshoreman.';
  else if (!F && b === 'lean') flavor = 'Lean and hungry-looking.';
  else flavor = F ? 'Nothing anybody would call out, until she smiles.' : 'An ordinary-looking man; that can be useful.';
  const suits: Taste[] = [];
  if (b === 'slender' || b === 'willowy' || b === 'petite' || b === 'lean') suits.push('slim');
  if (full || b === 'stocky') suits.push('full');
  if (curvy || b === 'curvy') suits.push('curves');
  if (b === 'athletic' || b === 'broad') suits.push('strong');
  return { height: `${hWord} (${ftIn(inch)})`, build: b, buildLabel: BUILD_LABEL[b], figure: FIGURE_LABEL[figure], bust, waist, hips, legs, skin, face, hair, posture, voice, scent, wardrobe, flavor, suits };
}

/** What kind of figure this observer likes (fixed per person). */
export function tasteOf(s: GameState, o: Character): Taste {
  return pk(['slim', 'full', 'curves', 'strong', 'none'] as Taste[], `${s.seed}:taste:${o.id}`);
}

export function tasteText(t: Taste): string {
  return TASTE_TEXT[t];
}

/** A reason for `appeal` (looks.ts): the figure is, or isn't, this observer's taste. Adults only. */
export function figureTaste(s: GameState, observer: Character, target: Character): { label: string; value: number } | undefined {
  const b = bodyOf(s, target);
  if (!b || ageOn(observer.birth, s.date) < 18) return undefined;
  const t = tasteOf(s, observer);
  if (t === 'none') return undefined;
  if (b.suits.includes(t)) return { label: `${b.buildLabel}: ${observer.gender === 'F' ? 'she' : 'he'} ${TASTE_TEXT[t]}`, value: 6 };
  return undefined;
}

/** One line for a card: height, build, figure, the flavor. */
export function bodyLine(b: BodyProfile): string {
  return `${b.height}; ${b.buildLabel.toLowerCase()}, ${b.figure.toLowerCase()}. ${b.flavor}`;
}
