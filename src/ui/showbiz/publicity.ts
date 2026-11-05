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
 * bs_stage: the sepia still of a Black woman singer at a club mike, the banner for a Black woman singer's big-room gig.
 */
export const PUBLICITY_URLS: Record<string, string | undefined> = {
  pb01: '/_blob/ed04c941c75ea59e093f814d4af577ba', pb02: '/_blob/189d82749b422f49eefddb153923051c', pb03: '/_blob/051857fab0840fe8dcdfb89beb74cbd6', pb04: '/_blob/323255eb4e4cfc935780dea5215ae865', pb05: '/_blob/7cb9992cb5cfe28030e37d81191adc3c', pb06: '/_blob/ee079849ba9edad11deb68c7df84c7d0',
  pb07: '/_blob/e5e729b8788b16e7d9db302e11f3c8b2', pb08: '/_blob/3746e6f821b6551b3a8b2930ec35b6c1', pb09: '/_blob/8882f145bb5ce4ecfdbe8f689954de30', pb10: '/_blob/3917e3f6b61cb6e3572bd00b8b3ca261', pb11: '/_blob/c19f00c4112058fe5564284e8b130ce0', pb12: '/_blob/0181ea0205af804d2c1db2c0be3315ee',
  pg01: '/_blob/dcd058f9ec7d53bdeef02dd5974c56d0', pg03: '/_blob/470979a0e7e64a52ff035971ff7e8193', pg04: '/_blob/d045c32eac04138f443fb81ec5b24f00', pg05: '/_blob/38bbf43a13e56619d33e1af2ca49a55a', pg06: '/_blob/b4a0c23611ce7393709fa8b5263cce8f', pg07: '/_blob/1f62aa521356551f81c67c5d848905e3',
  pg08: '/_blob/3f1adf4eadcbf048e3c75d18b12ebc31', pg09: '/_blob/79014a18c7d321cd0f1430309fa46271', pg10: '/_blob/b66f0b6364304a611bda3e09b99c7aa4',
  pw01: '/_blob/5c0e93402dd2cdda1c535a3075d8d70f', pw03: '/_blob/2c47592e147e1692b685327a0fbe9b8e', pw04: '/_blob/261e70de6a09b42a3c0810d9f2932e8d', pw05: '/_blob/ae218e333a4b45fc4d7f696346ebed0d', pw06: '/_blob/677155ea5f0e6a13f525c2f582886455', pw07: '/_blob/31520f9797382fef2b9ed3b065bb124a',
  pw08: '/_blob/1209981cd27ec92fadaf79c507a96216', pw09: '/_blob/472e25eafcf496960ff0b0c9778a843d', pw10: '/_blob/3e458e742a9628ecafe2363ebf0ad599', pw11: '/_blob/e982aea869c1a972fb1ac57ebf8826f7', pw12: '/_blob/67b89dd74af963e9ab14cd0033ab43e4', pw13: '/_blob/01125bf99baaeb0dea4821e8fdcff7f8',
  pw14: '/_blob/6eb77f4201d0162922633ca399cfd581', pw15: '/_blob/c6e4cfc7ebdb838b5f86cfcecfcc4530', pw16: '/_blob/e7f1260c5b45a55e7febca104adcdd4e', pw17: '/_blob/44a8e7be573c85c8dc9f53df430d527d', pw18: '/_blob/53ea841adad885f1246f46230c8026cf', pw19: '/_blob/bd4be86da6f298a8780b9dee8fc88d37',
  pw20: '/_blob/673d78482607a0246ae7f5df3beae8b1', pw21: '/_blob/b6f2f489c3d4c0607e079f564cdc9486', pw22: '/_blob/1c8b3bec8174019a523cb12be5d26251', pw23: '/_blob/115c7a000f1e1d7a55a4e1c3ce1a4dc0', pw24: '/_blob/a0eab4434def5b55e55eba830495b1e2',
  vg_stage: '/_blob/31fb5d3b8a931c3978c01bc02365c3f9', bs_stage: '/_blob/04c21dfa1cdf06dc6c64eab2ffb7deb7',
};

export function publicityUrl(k: string | undefined): string | undefined {
  return k ? PUBLICITY_URLS[k] : undefined;
}
