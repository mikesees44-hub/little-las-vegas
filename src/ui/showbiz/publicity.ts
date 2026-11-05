/**
 * The acts' publicity photos (the 8x10 glossies): the owner's photo sheets, cropped one cell to a file in
 * imports/publicity/<key>.webp (crop.py there makes them). They live in the published artifact's asset store
 * once uploaded: fill the URL in here and the act card picks it up. Until then (`undefined`), the card shows
 * the act's painted portrait instead.
 *
 * pb01-pb12: the sepia publicity sheet of Black singers (for Black performers only, engine/showbizData.ts PHOTOS).
 * pg01-pg10: the color glamour shots (singers and dancers first; pg02 left out for looking like a real star).
 * pw01-pw24: the boardwalk snapshots (pw02 left out for the same reason; pw09 goes with the sepia set).
 * vg_stage: the painted vocal group at the mike, the banner for a vocal group's big-room gig.
 */
export const PUBLICITY_URLS: Record<string, string | undefined> = {
  pb01: undefined, pb02: undefined, pb03: undefined, pb04: undefined, pb05: undefined, pb06: undefined,
  pb07: undefined, pb08: undefined, pb09: undefined, pb10: undefined, pb11: undefined, pb12: undefined,
  pg01: undefined, pg03: undefined, pg04: undefined, pg05: undefined, pg06: undefined, pg07: undefined,
  pg08: undefined, pg09: undefined, pg10: undefined,
  pw01: undefined, pw03: undefined, pw04: undefined, pw05: undefined, pw06: undefined, pw07: undefined,
  pw08: undefined, pw09: undefined, pw10: undefined, pw11: undefined, pw12: undefined, pw13: undefined,
  pw14: undefined, pw15: undefined, pw16: undefined, pw17: undefined, pw18: undefined, pw19: undefined,
  pw20: undefined, pw21: undefined, pw22: undefined, pw23: undefined, pw24: undefined,
  vg_stage: undefined,
};

export function publicityUrl(k: string | undefined): string | undefined {
  return k ? PUBLICITY_URLS[k] : undefined;
}
