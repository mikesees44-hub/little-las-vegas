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

type Tag = 'boss' | 'capo' | 'old' | 'soldier' | 'assoc' | 'wife' | 'glam' | 'cop' | 'priest' | 'pol' | 'biz' | 'books';

export const FACES: { k: string; m: boolean; age: [number, number]; tags: Tag[] }[] = [
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
  { k: 'f19', m: false, age: [21, 44], tags: ['glam'] },
  { k: 'f15', m: false, age: [18, 30], tags: ['glam'] },
];

function wants(c: Character, s: GameState, age: number): Tag[] {
  const off = (c.office ?? '').toLowerCase();
  if (/pastor|priest|church|monsignor/.test(off)) return ['priest'];
  if (/chief|patrol|police|detective|sergeant|captain|sheriff|trooper/.test(off)) return ['cop'];
  if (/commission|assembly|mayor|judge|senat|council|freeholder|clerk/.test(off)) return ['pol'];
  if (c.gender !== 'M') {
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
  if (mine && c.rank === 'soldier') return 7;
  if (c.rank === 'underboss' || c.rank === 'consigliere') return 8;
  if (mine && c.rank === 'associate') return 9;
  if (c.gender !== 'M' && c.spouseId && s.characters[c.spouseId]?.faction === me?.faction && s.characters[c.spouseId]?.rank !== 'civilian') return 10;
  return undefined;
}

/** Hand out the free paintings to the cast that has none. Mutates; safe to run every week. */
export function assignFaces(s: GameState): void {
  if (!s.characters || !s.playerId) return;
  const date = dateOfWeek(s.week ?? 0);
  const taken = new Set<string>();
  for (const c of Object.values(s.characters)) if (c.alive && c.appearance?.face) taken.add(c.appearance.face);
  if (taken.size >= FACES.length) return;
  const cast = Object.values(s.characters)
    .filter((c) => c.alive && !c.appearance?.face)
    .map((c) => ({ c, p: priority(c, s) }))
    .filter((x): x is { c: Character; p: number } => x.p !== undefined)
    .sort((a, b) => a.p - b.p || (a.c.id < b.c.id ? -1 : 1));
  for (const { c, p } of cast) {
    const age = ageOn(c.birth, date);
    if (age < 18) continue;
    const male = c.gender === 'M';
    const fits = FACES.filter((f) => !taken.has(f.k) && f.m === male && age >= f.age[0] - 3 && age <= f.age[1] + 5);
    const tags = wants(c, s, age);
    let pick: (typeof FACES)[number] | undefined;
    for (const t of tags) { pick = fits.find((f) => f.tags.includes(t)); if (pick) break; }
    // The top of the cast gets a face that fits his age and sex even if not his station.
    if (!pick && p <= 4) pick = fits.find((f) => !f.tags.some((t) => t === 'cop' || t === 'priest' || t === 'pol'));
    if (!pick) continue;
    c.appearance = { ...(c.appearance ?? {}), face: pick.k };
    taken.add(pick.k);
    if (taken.size >= FACES.length) return;
  }
}
