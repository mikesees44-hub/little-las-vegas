import { memo, type ReactElement } from 'react';
import { ageOn, compareDates, dateOfWeek } from '../../engine/calendar';
import type { Character, GameDate } from '../../engine/types';
import { expressionOf, genesOf, hash, rng } from './genes';
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
}

const cache = new Map<string, ReactElement>();
const CACHE_MAX = 600;

function lookOf(c: Character, seed: string, date: GameDate, tint: string | undefined): Look {
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
    mood: expressionOf(c, age),
    r: rng(hash(`${seed}:look:${c.id}`)),
    serial: hash(`${seed}:serial:${c.id}`) % 90000 + 10000,
  };
}

function PortraitImpl({ c, seed, date, size = 64, tint, className }: PortraitProps) {
  const age = Math.max(0, ageOn(c.birth, c.death ? c.death.date : date));
  const jailed = c.alive && c.imprisonedUntil !== undefined && compareDates(dateOfWeek(c.imprisonedUntil), date) > 0;
  const key = [seed, c.id, c.fatherId ?? '', c.motherId ?? '', c.gender, c.ethnicity, age, c.rank, c.office ?? '', c.specialty ?? '', c.alive ? 1 : 0, jailed ? 1 : 0, tint ?? '', (c.traits ?? []).join(','), c.firstName, c.lastName].join('|');
  let art = cache.get(key);
  if (!art) {
    art = paintPortrait(lookOf(c, seed, date, tint));
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
