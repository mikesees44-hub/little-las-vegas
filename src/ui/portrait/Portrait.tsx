import { memo, useState, type ReactElement } from 'react';
import { FACE_URLS } from './faceUrls';
import { ageOn, compareDates, dateOfWeek } from '../../engine/calendar';
import type { Character, GameDate } from '../../engine/types';
import { expressionOf, genesOf, hash, rng, type Expression } from './genes';
import { paintPortrait, type Look } from './paint';

/**
 * Procedurally painted period portrait, in the manner of an oil-on-board
 * studio portrait from 1960: head and shoulders out of a dark ground, warm
 * light from the upper left, a gilt frame and a varnish vignette.
 *
 * Deterministic from the game seed and the character id. Children inherit
 * face, nose, eyes and hair from both parents (see genes.ts). Age greys and
 * thins the hair, adds lines and jowls; role dresses the sitter (the boss in
 * a fedora and pocket square, capos in sharkskin, soldiers in leather, cops in
 * a uniform cap); traits set the expression. The dead are drawn in greyscale
 * under a black mourning ribbon; a man inside is drawn against the bars.
 *
 * Rendering is memoised by everything that changes the picture, so an org
 * chart of sixty faces re-renders for free week to week.
 */

export interface PortraitProps {
  c: Character;
  seed: string;
  date: GameDate;
  size?: number;
  /** Faction tint for the background. */
  tint?: string;
  className?: string;
  /** What he thinks of the boss (-100..100): strong feelings show on the face. */
  opinion?: number;
}

/** Strong feelings about the boss override the trait expression; mild ones don't. */
export function moodFor(c: Pick<Character, 'traits'>, age: number, opinion?: number): Expression {
  if (opinion !== undefined && age >= 12) {
    if (opinion <= -40) return 'scowl';
    if (opinion <= -15) return 'wary';
    if (opinion >= 50) return 'warm';
  }
  return expressionOf(c, age);
}

const cache = new Map<string, ReactElement>();
const CACHE_MAX = 600;

function lookOf(c: Character, seed: string, date: GameDate, tint: string | undefined, opinion?: number): Look {
  const age = Math.max(0, ageOn(c.birth, c.death ? c.death.date : date));
  const jailed = c.alive && c.imprisonedUntil !== undefined && compareDates(dateOfWeek(c.imprisonedUntil), date) > 0;
  return {
    id: `p${hash(`${seed}:${c.id}`).toString(36)}`,
    name: `${c.firstName} ${c.lastName}`,
    male: c.gender === 'M',
    age,
    ethnicity: c.ethnicity,
    rank: c.rank,
    office: c.office,
    specialty: c.specialty,
    frontMan: !!c.frontMan,
    dead: !c.alive,
    jailed,
    tint,
    genes: genesOf(seed, c),
    hairStyle: c.appearance?.hair,
    stache: c.appearance?.stache,
    hat: c.appearance?.hat,
    mood: moodFor(c, age, opinion),
    r: rng(hash(`${seed}:look:${c.id}`)),
    serial: hash(`${seed}:serial:${c.id}`) % 90000 + 10000,
  };
}

/** The owner's painting for this person, in the same 100x120 frame; the procedural portrait if it won't load. */
function PaintedFace({ url, c, size, className, jailed, fallback }: { url: string; c: Character; size: number; className?: string; jailed: boolean; fallback: ReactElement }) {
  const [bad, setBad] = useState(false);
  if (bad) return fallback;
  const h = (size * 120) / 100;
  return (
    <span className={`relative inline-block overflow-hidden align-middle ${className ?? ''}`} style={{ width: size, height: h, borderRadius: Math.max(2, size / 16), boxShadow: 'inset 0 0 0 1px rgba(201,162,74,0.55), 0 1px 3px rgba(0,0,0,0.6)' }} role="img" aria-label={`Portrait of ${c.firstName} ${c.lastName}${c.alive ? '' : ' (deceased)'}`} data-face={c.appearance?.face}>
      <img src={url} alt="" draggable={false} onError={() => setBad(true)} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '50% 30%', filter: c.alive ? undefined : 'grayscale(1) brightness(0.8)' }} />
      {jailed && <span className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg, rgba(20,20,20,0.85) 0 3px, transparent 3px 14%)' }} />}
      {!c.alive && <span className="absolute right-0 top-0 h-[22%] w-[22%]" style={{ background: 'linear-gradient(135deg, transparent 50%, #000 50%)' }} />}
    </span>
  );
}

function PortraitImpl(props: PortraitProps) {
  const { c, seed, date, size = 64, className } = props;
  const face = c.appearance?.face;
  const url = face ? FACE_URLS[face] : undefined;
  const canLoad = typeof window !== 'undefined' && /^https?:/.test(window.location?.protocol ?? '');
  if (url && canLoad) {
    const jailed = c.alive && c.imprisonedUntil !== undefined && compareDates(dateOfWeek(c.imprisonedUntil), date) > 0;
    return <PaintedFace url={url} c={c} size={size} className={className} jailed={jailed} fallback={<ProcPortrait {...props} />} />;
  }
  void seed;
  return <ProcPortrait {...props} />;
}

function ProcPortrait({ c, seed, date, size = 64, tint, className, opinion }: PortraitProps) {
  const age = Math.max(0, ageOn(c.birth, c.death ? c.death.date : date));
  const jailed = c.alive && c.imprisonedUntil !== undefined && compareDates(dateOfWeek(c.imprisonedUntil), date) > 0;
  const key = [seed, c.id, c.fatherId ?? '', c.bioFatherId ?? '', c.motherId ?? '', c.gender, c.ethnicity, age, c.rank, c.office ?? '', c.specialty ?? '', c.alive ? 1 : 0, jailed ? 1 : 0, tint ?? '', (c.traits ?? []).join(','), c.firstName, c.lastName, moodFor(c, age, opinion), c.appearance ? JSON.stringify(c.appearance) : ''].join('|');
  let art = cache.get(key);
  if (!art) {
    art = paintPortrait(lookOf(c, seed, date, tint, opinion));
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, art);
  }
  return (
    <svg viewBox="0 0 100 120" width={size} height={(size * 120) / 100} className={className} role="img" aria-label={`Portrait of ${c.firstName} ${c.lastName}${c.alive ? '' : ' (deceased)'}`}>
      {art}
    </svg>
  );
}

export const Portrait = memo(PortraitImpl);
