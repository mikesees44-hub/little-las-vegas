import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ASSET_URLS, ASSET_SIZE, SPRITE_OF, TURNAROUND_SPLIT, type AssetKey } from '../src/ui/hood/art/assetUrls';
import { storefrontArt } from '../src/ui/hood/storefrontArt';
import { quarterRect } from '../src/ui/hood/Turnaround';
import { DISTRICTS, DISTRICT_CARD } from '../src/ui/hood/districts';
import { SCENE_ORDER, SPOTS, bindSpots, SCENE_HOODS, sceneForHood } from '../src/ui/hood/PaintedView';
import { CROSS, HOODS, SEED } from '../src/engine/hoodData';
import { newGame } from '../src/engine/newGame';
import { placeAll, seedBlocked } from '../src/engine/hoodGeo';
import { itemsOf } from '../src/ui/hood/Buildings';
import { ISO } from '../src/ui/hood/iso';
import { upgradeSave } from '../src/engine/upgradeSave';

describe('street art: the asset manifest, storefront paintings, turnarounds and districts', () => {
  it('names every asset-store image once, by URL, in one manifest; the user\'s own art is all uploaded', () => {
    // All 148 keys are uploaded now (31 originals + 114 of the user's own art + the 3 Boss's Office pictures).
    const keys = Object.keys(ASSET_URLS);
    const urls = Object.values(ASSET_URLS).filter((u): u is string => !!u);
    expect(keys.length).toBe(148);
    expect(urls.length).toBe(keys.length);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(u).toMatch(/^\/_blob\/[0-9a-f]{32}$/);
    // Nothing else in the UI names a /_blob/ image URL for the street art.
    for (const f of ['src/ui/hood/PaintedView.tsx', 'src/ui/hood/StreetCard.tsx', 'src/ui/hood/DistrictCards.tsx', 'src/ui/hood/HoodDashboard.tsx', 'src/ui/hood/Turnaround.tsx']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/_blob\//);
    }
    // Nothing is left waiting for its upload.
    const pending = Object.entries(ASSET_URLS).filter(([, u]) => u === undefined).map(([k]) => k);
    expect(pending).toEqual([]);
  });

  it('every four-angle sheet has its size and its measured split, and the quarters stay inside the image', () => {
    for (const k of Object.keys(TURNAROUND_SPLIT) as AssetKey[]) {
      expect(ASSET_SIZE[k], k).toBeDefined();
      for (let q = 0; q < 4; q++) {
        const r = quarterRect(k, q);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(r.W);
        expect(r.y + r.h).toBeLessThanOrEqual(r.H);
        expect(r.w / r.h).toBeGreaterThan(1.2);
      }
    }
  });

  it('a storefront gets the painting of its own name first, then of its kind; empty lots and sites keep the drawing', () => {
    expect(storefrontArt({ key: 'a', name: 'The Shamrock', useId: 'hoodclub' })).toMatchObject({ key: 'shamrock_turnaround', turn: true, inside: 'shamrock_twilight' });
    expect(storefrontArt({ key: 'a', name: 'Moon Slice Pizza', useId: 'pizza' })?.key).toBe('neon_moon_pizza');
    expect(storefrontArt({ key: 'a', name: 'Neptune\'s Fish House', useId: 'trattoria' })?.key).toBe('lobster_seafood_house');
    expect(storefrontArt({ key: 'a', name: 'Gus\'s Ristorante', useId: 'trattoria' })).toMatchObject({ key: 'bellavita_restaurant_turnaround', turn: true });
    expect(storefrontArt({ key: 'a', name: 'Sandy\'s Flowers', useId: 'florist' })).toBeUndefined();
    expect(storefrontArt({ key: 'a', name: 'Pete\'s Boardwalk Pizza', useId: 'pizza', vacant: true })).toBeUndefined();
    // Stable per record.
    const m = { key: 'hf.crest.oc-.3.a', name: 'The Sea Gull Motel', useId: 'motel' };
    expect(storefrontArt(m)).toEqual(storefrontArt(m));
  });

  it('the six districts each have a card, a painting and a street-level view; every neighborhood with a street view lands on one', () => {
    expect(DISTRICTS.length).toBe(6);
    for (const d of DISTRICTS) {
      expect(DISTRICT_CARD[d.id]?.title).toBeTruthy();
      expect(SCENE_ORDER).toContain(d.scene);
      expect(d.asset in ASSET_URLS).toBe(true);
    }
    for (const h of HOODS) expect(SCENE_ORDER).toContain(sceneForHood(h.id));
  });

  it('the painted places stand as 1960 records, bound to their own hotspots', () => {
    const s = newGame('streetart');
    for (const id of ['sa01', 'sa02', 'sa03', 'sa04', 'sa05', 'sa06', 'sa18', 'sa19']) expect(s.econ!.lots.some((l) => l.id === id), id).toBe(true);
    const items = itemsOf(s, placeAll(s), ISO);
    const tw = bindSpots(items, SPOTS.twilight, SCENE_HOODS.twilight);
    expect(tw.get('laundry')?.name).toBe('Spin City Laundry');
    expect(tw.get('club')?.name).toBe('The Bella Napoli Social Club');
    const bw = bindSpots(items, SPOTS.bwBlue, SCENE_HOODS.bwBlue);
    expect(bw.get('motel')?.name).toBe('The Tropicana Motel');
    expect(bw.get('wheel')?.name).toBe('The Giant Wheel');
  });

  it('an old save gets the new records where their ground is free, and never two on the same ground', () => {
    const s = newGame('old-save');
    const ids = new Set(s.econ!.lots.map((l) => l.id));
    // Fresh game: no record is blocked by its own fill.
    for (const r of SEED) expect(seedBlocked(r[0], ids), r[0]).toBe(false);
    // Strip the new records, as a save from before them; put a generated shop on one's ground.
    s.econ!.lots = s.econ!.lots.filter((l) => !l.id.startsWith('sa'));
    const fake = { ...s.econ!.lots.find((l) => l.id.startsWith('hf.downtown'))!, id: `hf.downtown.nj+.${CROSS.findIndex((c) => c.n === 'Cedar Ave')}.a` };
    s.econ!.lots.push(fake);
    const up = upgradeSave(JSON.parse(JSON.stringify(s)));
    const got = new Set(up.econ!.lots.map((l) => l.id));
    expect(got.has('sa02')).toBe(true);
    expect(got.has('sa01')).toBe(false); // Cedar Ave 'a' on New Jersey is taken by the generated shop
    expect(got.has('sa18')).toBe(true);
  });

  it('keeps operating businesses and real entertainers\' clubs out of the name pools', () => {
    for (const f of ['src/engine/names.ts', 'src/engine/catalog.ts', 'src/engine/hoodData.ts', 'src/engine/hood.ts', 'src/engine/property.ts', 'src/engine/construction.ts']) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/Club Avalon|Morey|Blue Marlin|Jolly Roger|Lobster House/);
    }
  });

  it('batch 3 and the near-miss batch 2 names find their paintings; ready-cut sprites map to paintings', () => {
    expect(storefrontArt({ key: 'a', name: 'Old Mack\'s Pizza', useId: 'pizza' })?.key).toEqual(['storefront_old_macks_pizza', 'neon_moon_pizza']);
    expect(storefrontArt({ key: 'a', name: 'The Shore Comedy Club', useId: 'club' })).toMatchObject({ key: 'shore_comedy_turnaround', turn: true, inside: 'shore_comedy_interior' });
    expect(storefrontArt({ key: 'a', name: 'The Lollypop Motel', useId: 'motel' })?.key).toEqual(['cutout_lollypop_motel', 'motel_lollypop']);
    expect(storefrontArt({ key: 'a', name: 'Klug\'s', useId: 'diner' })?.key).toEqual(['cutout_klugs', 'storefront_klugs']);
    for (const k of ['storefront_peanut_gallery', 'storefront_marios_pizza', 'storefront_eddies_fun_palace', 'storefront_royal_casino_arcade']) expect(k in ASSET_URLS, k).toBe(false);
    for (const [from, to] of Object.entries(SPRITE_OF)) { expect(from in ASSET_URLS, from).toBe(true); expect(to! in ASSET_URLS, to).toBe(true); expect(to).toMatch(/^cutout_/); }
    expect('storefront_pompeis' in ASSET_URLS).toBe(false);
  });
});
