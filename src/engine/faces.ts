import { ageOn, dateOfWeek } from './calendar';
import type { Character, GameState } from './types';

/**
 * PAINTED FACES (the owner's 1960 portrait set, src/ui/portrait/faceUrls.ts).
 *
 * There are far fewer paintings than people, so a painting goes only to the cast that matters
 * (the boss, his wife, his top men, the rival bosses, the town's cop, priest and politician,
 * then the men and women closest to him), at most one living person per painting, and once a
 * person has a face it stays his for life. Everyone else keeps the procedural portrait.
 */

type Tag = 'boss' | 'capo' | 'old' | 'soldier' | 'assoc' | 'wife' | 'glam' | 'cop' | 'priest' | 'pol' | 'biz' | 'books' | 'pro' | 'star';

/** `eth`: preferred for a sitter of that background (and kept back from the others while any is free); a 'Black' face goes to a Black sitter only, and a Black sitter takes only those. `reserved`: waits for a sitter the game does not have yet (never handed out). */
export const FACES: { k: string; m: boolean; age: [number, number]; tags: Tag[]; eth?: 'Irish' | 'Jewish' | 'Black'; reserved?: boolean }[] = [
  { k: 'f01', m: true, age: [40, 72], tags: ['boss', 'capo'] },
  { k: 'f22', m: true, age: [55, 90], tags: ['boss', 'old'] },
  { k: 'f03', m: true, age: [50, 85], tags: ['boss', 'capo', 'old'] },
  { k: 'f14', m: true, age: [40, 72], tags: ['boss', 'capo'] },
  { k: 'f07', m: true, age: [50, 85], tags: ['old', 'capo', 'books'] },
  { k: 'f02', m: true, age: [28, 58], tags: ['capo', 'soldier'] },
  { k: 'f16', m: true, age: [25, 52], tags: ['soldier', 'capo'] },
  { k: 'f21', m: true, age: [30, 62], tags: ['cop', 'capo', 'biz'] },
  { k: 'f04', m: true, age: [18, 36], tags: ['soldier', 'assoc'] },
  { k: 'f08', m: true, age: [18, 34], tags: ['soldier', 'assoc'] },
  { k: 'f24', m: true, age: [18, 36], tags: ['assoc', 'soldier'] },
  { k: 'f09', m: true, age: [30, 62], tags: ['assoc', 'biz', 'soldier'] },
  { k: 'f20', m: true, age: [18, 32], tags: ['assoc'] },
  { k: 'f11', m: true, age: [26, 62], tags: ['cop'] },
  { k: 'f12', m: true, age: [32, 75], tags: ['priest'] },
  { k: 'f13', m: true, age: [38, 75], tags: ['pol'] },
  { k: 'f17', m: true, age: [40, 78], tags: ['biz'] },
  { k: 'f18', m: true, age: [26, 58], tags: ['books', 'biz'] },
  { k: 'f10', m: false, age: [36, 75], tags: ['wife'] },
  { k: 'f23', m: false, age: [21, 44], tags: ['glam', 'wife'] },
  { k: 'f05', m: false, age: [20, 40], tags: ['glam'] },
  { k: 'f19', eth: 'Irish', m: false, age: [21, 44], tags: ['glam'] },
  { k: 'f15', m: false, age: [18, 30], tags: ['glam'] },
  // The second set: twenty women (three left out for looking like a real film star).
  // The fourth set: thirty men, young to old.
  { k: 'm01', m: true, age: [55, 85], tags: ['boss', 'old'] },
  { k: 'm04', m: true, age: [55, 85], tags: ['old', 'boss'] },
  { k: 'm27', m: true, age: [58, 88], tags: ['boss', 'old'] },
  { k: 'm30', m: true, age: [55, 85], tags: ['old', 'boss'] },
  { k: 'm24', m: true, age: [60, 88], tags: ['old', 'pol', 'boss'] },
  { k: 'm13', m: true, age: [55, 82], tags: ['old', 'capo'] },
  { k: 'm06', m: true, age: [55, 85], tags: ['old', 'books', 'boss'], eth: 'Jewish' },
  { k: 'm21', m: true, age: [55, 85], tags: ['books', 'old', 'pol'], eth: 'Jewish' },
  { k: 'm18', m: true, age: [55, 82], tags: ['old', 'biz'], eth: 'Jewish' },
  { k: 'm25', m: true, age: [60, 88], tags: ['old', 'assoc'], eth: 'Irish' },
  { k: 'm10', m: true, age: [52, 78], tags: ['cop', 'old'], eth: 'Irish' },
  { k: 'm03', m: true, age: [40, 66], tags: ['capo', 'boss'] },
  { k: 'm11', m: true, age: [45, 70], tags: ['boss', 'capo'] },
  { k: 'm23', m: true, age: [45, 70], tags: ['boss', 'capo'] },
  { k: 'm08', m: true, age: [40, 66], tags: ['capo', 'biz'] },
  { k: 'm15', m: true, age: [45, 70], tags: ['capo', 'biz'] },
  { k: 'm29', m: true, age: [40, 66], tags: ['capo', 'biz'] },
  { k: 'm17', m: true, age: [35, 60], tags: ['capo', 'soldier'] },
  { k: 'm20', m: true, age: [35, 60], tags: ['capo', 'soldier'] },
  { k: 'm16', m: true, age: [45, 72], tags: ['biz', 'assoc'] },
  { k: 'm09', m: true, age: [30, 55], tags: ['capo', 'soldier'] },
  { k: 'm22', m: true, age: [28, 52], tags: ['soldier', 'capo'] },
  { k: 'm26', m: true, age: [28, 52], tags: ['soldier', 'capo'] },
  { k: 'm28', m: true, age: [30, 52], tags: ['soldier'] },
  { k: 'm19', m: true, age: [30, 56], tags: ['assoc', 'biz', 'soldier'], eth: 'Irish' },
  { k: 'm07', m: true, age: [20, 36], tags: ['soldier', 'assoc'] },
  { k: 'm12', m: true, age: [20, 36], tags: ['assoc', 'soldier'] },
  { k: 'm02', m: true, age: [18, 32], tags: ['assoc', 'soldier'] },
  { k: 'm05', m: true, age: [18, 32], tags: ['assoc'] },
  { k: 'm14', m: true, age: [18, 32], tags: ['assoc'] },
  { k: 'w08', m: false, age: [50, 85], tags: ['wife'] },
  { k: 'w20', m: false, age: [45, 80], tags: ['wife'] },
  { k: 'w05', m: false, age: [38, 68], tags: ['wife'] },
  { k: 'w15', m: false, age: [40, 72], tags: ['wife'] },
  { k: 'w02', m: false, age: [24, 46], tags: ['wife', 'glam'] },
  { k: 'w07', m: false, age: [24, 46], tags: ['wife', 'glam'] },
  { k: 'w10', m: false, age: [28, 56], tags: ['glam', 'wife'] },
  { k: 'w12', m: false, age: [24, 52], tags: ['pro', 'wife'] },
  { k: 'w03', eth: 'Irish', m: false, age: [21, 42], tags: ['glam'] },
  { k: 'w04', m: false, age: [21, 42], tags: ['glam'] },
  { k: 'w06', m: false, age: [21, 40], tags: ['glam'] },
  { k: 'w13', m: false, age: [21, 42], tags: ['glam'] },
  { k: 'w14', eth: 'Irish', m: false, age: [24, 46], tags: ['glam'] },
  { k: 'w19', m: false, age: [21, 40], tags: ['glam'] },
  { k: 'w16', m: false, age: [22, 46], tags: ['glam', 'pro'] },
  { k: 'w11', m: false, age: [18, 34], tags: ['glam'] },
  { k: 'w18', m: false, age: [18, 30], tags: ['glam'] },
  // The third set (two left out for looking like a real film star).
  { k: 'v01', m: false, age: [21, 40], tags: ['glam'] },
  { k: 'v02', m: false, age: [20, 38], tags: ['glam', 'wife'], eth: 'Irish' },
  { k: 'v04', m: false, age: [20, 40], tags: ['pro', 'glam'] },
  { k: 'v05', m: false, age: [22, 46], tags: ['pro'] },
  { k: 'v06', m: false, age: [22, 42], tags: ['glam'] },
  { k: 'v09', m: false, age: [18, 34], tags: ['glam', 'pro'] },
  { k: 'v10', m: false, age: [18, 34], tags: ['wife', 'glam'] },
  { k: 'v11', m: false, age: [28, 52], tags: ['wife', 'glam'] },
  { k: 'v12', m: false, age: [18, 28], tags: ['glam'] },
  { k: 'v13', m: false, age: [20, 38], tags: ['glam'] },
  { k: 'v15', m: false, age: [24, 46], tags: ['glam'] },
  { k: 'v16', m: false, age: [25, 46], tags: ['wife'] },
  { k: 'v17', m: false, age: [26, 50], tags: ['wife'] },
  { k: 'v18', m: false, age: [18, 28], tags: ['glam'] },
  { k: 'v19', m: false, age: [22, 42], tags: ['glam'] },
  { k: 'v20', m: false, age: [20, 40], tags: ['glam', 'wife'], eth: 'Irish' },
  // The fifth set: the men on the stage (two left out for looking like a real star).
  { k: 's01', m: true, age: [26, 48], tags: ['star'] },
  { k: 's03', m: true, age: [20, 36], tags: ['star'] },
  { k: 's04', m: true, age: [26, 50], tags: ['star'] },
  { k: 's06', m: true, age: [28, 50], tags: ['star'] },
  { k: 's07', m: true, age: [22, 40], tags: ['star'] },
  { k: 's09', m: true, age: [20, 36], tags: ['star'] },
  { k: 's10', m: true, age: [28, 50], tags: ['star'] },
  { k: 's11', m: true, age: [22, 42], tags: ['star'] },
  // The two Black singers of the set: for the Black performers of the showbiz bench (showbiz.ts), and nobody else.
  { k: 's05', m: true, age: [20, 40], tags: ['star'], eth: 'Black' },
  { k: 's08', m: true, age: [24, 48], tags: ['star'], eth: 'Black' },
  // The sixth set: the women of the town, girl to grandmother.
  { k: 'x01', m: false, age: [18, 30], tags: ['glam'] },
  { k: 'x02', m: false, age: [18, 34], tags: ['pro', 'glam'] },
  { k: 'x03', m: false, age: [22, 42], tags: ['star', 'glam'] },
  { k: 'x04', m: false, age: [24, 46], tags: ['glam'], eth: 'Irish' },
  { k: 'x05', m: false, age: [28, 50], tags: ['wife'] },
  { k: 'x06', m: false, age: [22, 46], tags: ['pro'] },
  { k: 'x07', m: false, age: [55, 85], tags: ['wife'] },
  { k: 'x08', m: false, age: [28, 50], tags: ['glam', 'wife'] },
  { k: 'x09', m: false, age: [45, 72], tags: ['wife'] },
  { k: 'x10', m: false, age: [24, 46], tags: ['pro', 'wife'] },
  { k: 'x11', m: false, age: [18, 24], tags: ['glam'] },
  { k: 'x12', m: false, age: [65, 95], tags: ['wife'] },
  // The seventh set: the neighborhood, in the house style.
  { k: 'y01', m: false, age: [24, 44], tags: ['glam'] },
  { k: 'y02', m: true, age: [28, 50], tags: ['soldier', 'capo'] },
  { k: 'y03', m: false, age: [20, 36], tags: ['glam'] },
  { k: 'y04', m: true, age: [45, 72], tags: ['boss', 'capo', 'old'] },
  { k: 'y05', m: true, age: [55, 82], tags: ['old', 'capo'] },
  { k: 'y06', m: false, age: [20, 36], tags: ['glam'] },
  { k: 'y07', m: true, age: [30, 52], tags: ['capo', 'soldier'] },
  { k: 'y08', m: false, age: [24, 44], tags: ['glam'], eth: 'Irish' },
  { k: 'y09', m: false, age: [45, 72], tags: ['wife'] },
  { k: 'y10', m: true, age: [20, 34], tags: ['assoc', 'soldier'] },
  { k: 'y11', m: false, age: [26, 48], tags: ['pro', 'wife'] },
  { k: 'y12', m: true, age: [50, 80], tags: ['priest'] },
  // The eighth set: Irish men of the shore.
  { k: 'i01', m: true, age: [20, 36], tags: ['assoc', 'soldier'], eth: 'Irish' },
  { k: 'i02', m: true, age: [32, 60], tags: ['cop'], eth: 'Irish' },
  { k: 'i03', m: true, age: [40, 66], tags: ['assoc', 'biz'], eth: 'Irish' },
  { k: 'i04', m: true, age: [50, 82], tags: ['priest'], eth: 'Irish' },
  { k: 'i05', m: true, age: [35, 60], tags: ['capo', 'pol'], eth: 'Irish' },
  { k: 'i06', m: true, age: [22, 40], tags: ['biz', 'assoc'], eth: 'Irish' },
  { k: 'i07', m: true, age: [58, 88], tags: ['old', 'assoc'], eth: 'Irish' },
  { k: 'i08', m: true, age: [40, 66], tags: ['biz', 'assoc'], eth: 'Irish' },
  { k: 'i09', m: true, age: [18, 34], tags: ['assoc'], eth: 'Irish' },
  { k: 'i10', m: true, age: [35, 60], tags: ['assoc', 'soldier'], eth: 'Irish' },
  { k: 'i11', m: true, age: [58, 88], tags: ['old', 'biz'], eth: 'Irish' },
  { k: 'i12', m: true, age: [50, 76], tags: ['pol', 'cop', 'old'], eth: 'Irish' },
  // The ninth set: the night's women, dancers to the coat-check (two left out).
  { k: 'n01', m: false, age: [21, 38], tags: ['star', 'glam'] },
  { k: 'n02', m: false, age: [21, 38], tags: ['star', 'glam'], eth: 'Irish' },
  { k: 'n03', m: false, age: [22, 42], tags: ['star', 'glam'] },
  { k: 'n05', m: false, age: [21, 36], tags: ['star', 'glam'] },
  { k: 'n06', m: false, age: [19, 32], tags: ['glam', 'pro'] },
  { k: 'n07', m: false, age: [24, 46], tags: ['pro', 'glam'] },
  { k: 'n08', m: false, age: [22, 40], tags: ['star', 'glam'] },
  { k: 'n09', m: false, age: [20, 40], tags: ['pro'] },
  { k: 'n11', m: false, age: [21, 38], tags: ['star', 'glam'] },
  { k: 'n12', m: false, age: [22, 40], tags: ['star', 'glam'], eth: 'Irish' },
  // The tenth set: more of the night (one left out, one kept for later).
  { k: 'z01', m: false, age: [22, 40], tags: ['star', 'glam'] },
  { k: 'z02', m: false, age: [21, 38], tags: ['star', 'glam'] },
  { k: 'z03', m: false, age: [24, 44], tags: ['star', 'glam'] },
  { k: 'z04', m: false, age: [21, 36], tags: ['star', 'glam'] },
  { k: 'z05', m: false, age: [19, 32], tags: ['glam', 'pro'] },
  { k: 'z07', m: false, age: [26, 46], tags: ['pro', 'glam'], eth: 'Irish' },
  { k: 'z08', m: false, age: [21, 36], tags: ['star', 'glam'] },
  { k: 'z09', m: false, age: [24, 46], tags: ['pro'] },
  { k: 'z10', m: false, age: [22, 40], tags: ['star', 'glam'] },
  { k: 'z12', m: false, age: [24, 44], tags: ['star', 'glam'], eth: 'Irish' },
  { k: 'z11', m: false, age: [21, 38], tags: [], reserved: true },
  // The eleventh set: the house and the stage (one left out, two kept for later).
  { k: 'q01', m: false, age: [24, 44], tags: ['star', 'glam'] },
  { k: 'q02', m: false, age: [24, 44], tags: ['star', 'glam'] },
  { k: 'q03', m: false, age: [22, 40], tags: ['glam'], eth: 'Irish' },
  { k: 'q05', m: false, age: [36, 58], tags: ['pro', 'wife'] },
  { k: 'q06', m: false, age: [20, 36], tags: ['glam'] },
  { k: 'q09', m: false, age: [38, 60], tags: ['pro', 'star'], eth: 'Irish' },
  { k: 'q10', m: false, age: [21, 34], tags: ['star', 'glam'] },
  { k: 'q11', m: false, age: [21, 38], tags: ['star', 'glam'] },
  { k: 'q12', m: false, age: [22, 46], tags: ['pro'], eth: 'Irish' },
  // The Black woman singer in white feathers: the showbiz bench's Black women only.
  { k: 'q04', m: false, age: [22, 42], tags: ['star', 'glam'], eth: 'Black' },
  { k: 'q08', m: false, age: [21, 38], tags: [], reserved: true },
  // The twelfth set: the dancers and the girls of the night (four left out, two kept for later).
  { k: 'g01', m: false, age: [22, 40], tags: ['star', 'glam'], eth: 'Irish' },
  { k: 'g02', m: false, age: [22, 40], tags: ['star', 'glam'] },
  { k: 'g03', m: false, age: [21, 36], tags: ['star', 'glam'] },
  { k: 'g04', m: false, age: [34, 56], tags: ['pro', 'star'] },
  { k: 'g05', m: false, age: [21, 36], tags: ['star', 'glam'] },
  { k: 'g07', m: false, age: [19, 32], tags: ['pro', 'glam'] },
  { k: 'g08', m: false, age: [22, 40], tags: ['glam', 'star'] },
  { k: 'g09', m: false, age: [21, 38], tags: ['glam', 'star'] },
  { k: 'g12', m: false, age: [22, 40], tags: ['glam', 'star'] },
  { k: 'g13', m: false, age: [21, 38], tags: ['glam'] },
  { k: 'g15', m: false, age: [21, 36], tags: ['star', 'glam'] },
  { k: 'g16', m: false, age: [22, 40], tags: ['star', 'glam'], eth: 'Irish' },
  { k: 'g18', m: false, age: [24, 44], tags: ['star', 'glam'] },
  { k: 'g19', m: false, age: [26, 48], tags: ['pro'] },
  { k: 'g20', m: false, age: [28, 50], tags: ['glam', 'pro', 'wife'] },
  { k: 'g22', m: false, age: [22, 44], tags: ['pro'], eth: 'Irish' },
  { k: 'g23', m: false, age: [22, 42], tags: ['glam', 'star'] },
  { k: 'g24', m: false, age: [21, 36], tags: ['star', 'glam'] },
  { k: 'g11', m: false, age: [21, 38], tags: [], reserved: true },
  { k: 'g17', m: false, age: [21, 38], tags: [], reserved: true },
  // The thirteenth set: the Jewish families of the shore and the city.
  { k: 'j01', m: true, age: [40, 66], tags: ['boss', 'capo', 'biz'], eth: 'Jewish' },
  { k: 'j02', m: false, age: [22, 40], tags: ['glam'], eth: 'Jewish' },
  { k: 'j03', m: true, age: [30, 56], tags: ['books', 'biz'], eth: 'Jewish' },
  { k: 'j04', m: false, age: [22, 38], tags: ['glam', 'star'], eth: 'Jewish' },
  { k: 'j05', m: true, age: [55, 84], tags: ['old', 'books', 'biz'], eth: 'Jewish' },
  { k: 'j06', m: false, age: [24, 42], tags: ['glam', 'wife'], eth: 'Jewish' },
  { k: 'j07', m: true, age: [35, 58], tags: ['capo', 'soldier'], eth: 'Jewish' },
  { k: 'j08', m: false, age: [24, 44], tags: ['glam', 'wife'], eth: 'Jewish' },
  { k: 'j09', m: true, age: [40, 66], tags: ['biz'], eth: 'Jewish' },
  { k: 'j10', m: false, age: [22, 40], tags: ['glam', 'star'], eth: 'Jewish' },
  { k: 'j11', m: true, age: [35, 58], tags: ['capo', 'biz'], eth: 'Jewish' },
  { k: 'j12', m: false, age: [26, 48], tags: ['pro', 'wife'], eth: 'Jewish' },
  { k: 'j13', m: false, age: [45, 72], tags: ['wife'], eth: 'Jewish' },
  { k: 'j14', m: true, age: [30, 56], tags: ['books', 'biz', 'pol'], eth: 'Jewish' },
  { k: 'j15', m: false, age: [24, 44], tags: ['wife', 'glam'], eth: 'Jewish' },
  { k: 'j16', m: true, age: [60, 90], tags: ['old', 'biz'], eth: 'Jewish' },
  { k: 'j17', m: false, age: [24, 44], tags: ['glam'], eth: 'Jewish' },
  { k: 'j18', m: true, age: [20, 38], tags: ['assoc', 'biz'], eth: 'Jewish' },
  // A club singer and a woman whose families the game does not have yet: kept for when it does.
  { k: 'v03', m: false, age: [21, 40], tags: ['star'], eth: 'Black' },
  { k: 'v07', m: false, age: [20, 40], tags: [], reserved: true },
];

const STAGE = /singer|crooner|comic|comedian|headliner|bandleader|band|actor|performer|revue|entertainer|dancer|piano|trumpet|emcee/i;
const STAGE_ROLES = new Set(['singer', 'dancer', 'recording', 'actress']);
const nightRole = (s: GameState, c: Character) => s.nightlife?.people[c.id]?.role as string | undefined;
const isStage = (s: GameState, c: Character) => STAGE.test(c.office ?? '') || STAGE_ROLES.has(nightRole(s, c) ?? '') || !!s.showbiz?.acts[c.id];

function wants(c: Character, s: GameState, age: number): Tag[] {
  if (isStage(s, c)) return c.gender === 'M' ? ['star'] : ['star', 'glam'];
  if (nightRole(s, c) === 'madam' || nightRole(s, c) === 'owner') return ['pro', 'glam', 'wife'];
  const off = (c.office ?? '').toLowerCase();
  if (/pastor|priest|church|monsignor/.test(off)) return ['priest'];
  if (/chief|patrol|police|detective|sergeant|captain|sheriff|trooper/.test(off)) return ['cop'];
  if (/commission|assembly|mayor|judge|senat|council|freeholder|clerk/.test(off)) return ['pol'];
  if (c.gender !== 'M') {
    if (c.office || c.specialty) return ['pro', 'glam', 'wife'];
    const married = !!c.spouseId && !!s.characters[c.spouseId];
    return married && age >= 30 ? ['wife', 'glam'] : ['glam', 'wife'];
  }
  if (c.specialty === 'accountant' || c.specialty === 'lawyer') return ['books', 'biz'];
  switch (c.rank) {
    case 'boss': return age >= 55 ? ['old', 'boss'] : ['boss'];
    case 'consigliere': return ['old', 'capo', 'books'];
    case 'underboss': case 'capo': return ['capo'];
    case 'soldier': return ['soldier'];
    case 'associate': return ['assoc'];
    default: return ['biz', 'assoc'];
  }
}

const rankEth = (f: string | undefined, e: string | undefined) => (f === undefined ? 1 : f === e ? 0 : 2);

/** Who gets a painting first (lower is sooner); undefined: not cast. */
function priority(c: Character, s: GameState): number | undefined {
  const me = s.characters[s.playerId];
  if (c.id === s.playerId) return 0;
  if (me?.spouseId === c.id) return 1;
  const mine = c.faction === me?.faction;
  if (mine && (c.rank === 'underboss' || c.rank === 'consigliere')) return 2;
  if (c.rank === 'boss') return 3;
  if (mine && c.rank === 'capo') return 4;
  if (c.office && /pastor|priest|chief|police|detective|commission|mayor|assembly|judge/i.test(c.office)) return 5;
  if (c.gender !== 'M' && (c.fatherId === s.playerId || c.motherId === s.playerId)) return 6;
  if (c.gender !== 'M' && (s.romance?.rels ?? []).some((r) => (r.a === s.playerId && r.b === c.id) || (r.b === s.playerId && r.a === c.id))) return 6;
  if (c.gender !== 'M' && s.nightlife?.goomars && Object.values(s.nightlife.goomars).some((g) => g.id === c.id)) return 6;
  if (mine && c.rank === 'soldier') return 7;
  if (c.rank === 'underboss' || c.rank === 'consigliere') return 8;
  if (mine && c.rank === 'associate') return 9;
  if (c.gender !== 'M' && c.spouseId && s.characters[c.spouseId]?.faction === me?.faction && s.characters[c.spouseId]?.rank !== 'civilian') return 10;
  if (c.gender !== 'M' && c.spouseId && s.characters[c.spouseId]?.rank === 'boss') return 11;
  if (c.gender !== 'M' && (s.romance?.rels ?? []).some((r) => r.a === c.id || r.b === c.id)) return 12;
  if (isStage(s, c)) return 9;
  // The women of the night the boss deals with: dancers, girls, madams.
  if (c.gender !== 'M' && nightRole(s, c) && nightRole(s, c) !== 'retired') return 11;
  if (c.rank === 'capo') return 13;
  if (c.rank === 'soldier') return 14;
  if (c.office) return 15;
  return undefined;
}

/** Hand out the free paintings to the cast that has none. Mutates; safe to run every week. */
export function assignFaces(s: GameState): void {
  if (!s.characters || !s.playerId) return;
  const date = dateOfWeek(s.week ?? 0);
  const taken = new Set<string>();
  for (const c of Object.values(s.characters)) if (c.alive && c.appearance?.face) taken.add(c.appearance.face);
  if (taken.size >= FACES.filter((f) => !f.reserved).length) return;
  const cast = Object.values(s.characters)
    .filter((c) => c.alive && !c.appearance?.face)
    .map((c) => ({ c, p: priority(c, s) }))
    .filter((x): x is { c: Character; p: number } => x.p !== undefined)
    .sort((a, b) => a.p - b.p || (a.c.id < b.c.id ? -1 : 1));
  for (const { c, p } of cast) {
    const age = ageOn(c.birth, date);
    if (age < 18) continue;
    const male = c.gender === 'M';
    const black = c.ethnicity === 'Black';
    const fits = FACES.filter((f) => !f.reserved && !taken.has(f.k) && f.m === male && (f.eth === 'Black') === black && age >= f.age[0] - 3 && age <= f.age[1] + 5)
      .sort((a, b) => rankEth(a.eth, c.ethnicity) - rankEth(b.eth, c.ethnicity));
    const tags = wants(c, s, age);
    let pick: (typeof FACES)[number] | undefined;
    for (const t of tags) { pick = fits.find((f) => f.tags.includes(t)); if (pick) break; }
    // The top of the cast gets a face that fits his age and sex even if not his station.
    if (!pick && p <= 4) pick = fits.find((f) => !f.tags.some((t) => t === 'cop' || t === 'priest' || t === 'pol' || t === 'star'));
    if (!pick) continue;
    c.appearance = { ...(c.appearance ?? {}), face: pick.k };
    taken.add(pick.k);
    if (taken.size >= FACES.length) return;
  }
}
