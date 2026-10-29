import { describe, expect, it, vi } from 'vitest';
import * as HD from '../src/engine/hoodData';
import { PLACES } from '../src/engine/placesGeo';
import { STRETCHES } from '../src/engine/walkStretches';
import { exportCityPackage, importCityPackage, loadCityPackage, occupantIn, validateCityPackage, yearsCover, type CityPackage } from '../src/engine/cityPackage';
import { addBusiness, addDistrict, addLandmark, addParcel, moveRecord, newTown, removeRecord, setArt, setYears, updateRecord } from '../src/engine/cityEdit';
import { CITY_PACKAGES, WILDWOOD_PACKAGE } from '../src/worldpack/cities';
import { materializeTown, migrateTown, reconcileHomeLots, townAggregate, townsWeek } from '../src/engine/towns';
import { DESTS } from '../src/engine/travelDests';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { upgradeSave } from '../src/engine/upgradeSave';
import { CITY_LIST } from '../src/engine/cities';
import type { GameState } from '../src/engine/types';
import { ensureTravel } from '../src/engine/travelState';
import { playWeeks } from './helpers';

const fnv = (str: string) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
/** JSON with every object's keys sorted (key order is not data). */
const canon = (x: unknown): string => JSON.stringify(x, (_k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const CAPE = CITY_PACKAGES.capemay;
const towns = CITY_LIST.map((c) => c.id);
const msgs = (p: unknown, mode?: 'draft' | 'production') => validateCityPackage(p, { mode }).errors.map((e) => e.message).join('\n');

describe('town package schema', () => {
  it('the shipped packages validate for production, Wildwood with no warnings', () => {
    for (const p of Object.values(CITY_PACKAGES)) {
      const v = validateCityPackage(p, { mode: 'production', knownTowns: [...towns, 'mainland', 'lewes'] });
      expect(v.errors, p.id).toEqual([]);
    }
    expect(validateCityPackage(WILDWOOD_PACKAGE, { mode: 'production' }).warnings).toEqual([]);
  });

  it('rejects incomplete geography with a readable message', () => {
    const p = clone(CAPE);
    delete p.parcels[0].pos;
    expect(msgs(p)).toMatch(/Parcel cm-w01 \(Washington St at Perry St\): incomplete geography/);
    const q = clone(CAPE);
    q.landmarks[1].pos = undefined;
    expect(msgs(q)).toMatch(/Landmark The concrete ship: incomplete geography/);
    const r = clone(CAPE);
    r.geography.frame = null;
    expect(msgs(r, 'production')).toMatch(/Production packages need a frame/);
    expect(msgs(r, 'draft')).toBe('');
    const d = clone(CAPE);
    d.districts[0].polygon = [];
    expect(msgs(d, 'production')).toMatch(/District Washington Street: no outline/);
    expect(validateCityPackage(d, { mode: 'draft' }).ok).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const p = clone(CAPE);
    p.parcels[1].id = p.parcels[0].id;
    expect(msgs(p)).toMatch(/Duplicate id "cm-w01"/);
    const q = clone(CAPE);
    q.landmarks.push({ ...q.landmarks[0] });
    expect(msgs(q)).toMatch(/Duplicate id "lm:cm-lighthouse"/);
  });

  it('rejects bad years', () => {
    const p = clone(CAPE);
    p.businesses[0].years = { from: 1960, to: 1950 };
    expect(msgs(p)).toMatch(/Hollis Dry Goods: opens 1960 after it closes 1950/);
    const q = clone(CAPE);
    q.businesses[0].years = { from: 19.5 };
    expect(msgs(q)).toMatch(/from year 19.5 is not a year/);
    const r = clone(CAPE);
    r.landmarks[0].years = { from: 3001 };
    expect(msgs(r)).toMatch(/Cape May Lighthouse: from year 3001/);
  });

  it('rejects landmark/ownable conflicts and naming-rule breaks', () => {
    const p = clone(CAPE);
    (p.landmarks[0] as { ownable: boolean }).ownable = true;
    expect(msgs(p)).toMatch(/Landmark Cape May Lighthouse: landmarks are never ownable/);
    const q = clone(CAPE);
    q.parcels.find((x) => x.id === 'cm-w13')!.market = { status: 'sale', owner: 'private' };
    expect(msgs(q)).toMatch(/Cape May City Hall: landmark\/ownable conflict — its parcel cm-w13 is listed as "sale"/);
    const r = clone(CAPE);
    r.businesses.push({ id: 'b:x', parcelId: 'cm-w13', name: 'Bar in City Hall', use: 'diner', years: {}, namePolicy: 'fictional', evidence: { confidence: 'invented', source: 'test' } });
    expect(msgs(r)).toMatch(/a business stands on its parcel cm-w13/);
    const s = clone(CAPE);
    s.businesses.find((b) => b.id === 'b:cm-b01')!.namePolicy = 'historical';
    expect(msgs(s)).toMatch(/Capitol Hall Hotel: a real name is only for a business that has closed/);
  });

  it('enforces era rules (casinos only from 1978)', () => {
    const p = clone(CAPE);
    p.businesses.push({ id: 'b:casino', parcelId: 'cm-b08', name: 'The Beach Casino', use: 'casino', years: { from: 1965 }, namePolicy: 'fictional', evidence: { confidence: 'invented', source: 'test' } });
    expect(msgs(p)).toMatch(/The Beach Casino: era rule "era:casino" — New Jersey casinos are legal only from 1978/);
    p.businesses[p.businesses.length - 1].years = { from: 1979 };
    expect(msgs(p)).toBe('');
  });

  it('import reports every error before anything is used', () => {
    expect(importCityPackage('{ not json').validation.errors[0].message).toMatch(/^Not JSON/);
    const bad = clone(CAPE);
    bad.parcels[0].districtId = 'd:nowhere';
    const r = importCityPackage(JSON.stringify(bad));
    expect(r.pkg).toBeUndefined();
    expect(r.validation.errors[0].message).toMatch(/district "d:nowhere" does not exist/);
    // The editor may keep working on a broken draft when it asks to.
    expect(importCityPackage(JSON.stringify(bad), { allowErrors: true }).pkg).toBeDefined();
    expect(() => loadCityPackage(bad)).toThrow(/Town package invalid/);
  });
});

describe('Wildwood through the package', () => {
  // Captured from the pre-package modules (master 5b2fd0a) before the data moved:
  // what hoodData, placesGeo and walkStretches export, hashed key-order-free.
  // If the Wildwood data is changed on purpose, re-capture these.
  // Re-captured 2026-10-29: the street grid, the avenues, the outline and the places were re-derived
  // from OpenStreetMap (scripts/cityimport `grid`); was { data: '42edaf0f', places: 'c725a01e' }.
  // Re-captured again the same day: Schellenger and Cedar read where they are a block apart (data was 'df05ffe3', places '50108518').
  const GOLDEN = { data: 'a2423e35', places: '2fab54a8', stretches: '64c18575' };

  it('the adapters export exactly the old hand data', () => {
    const samples = Array.from({ length: 80 }, (_, i) => i * 100);
    const data = { CROSS: HD.CROSS, AVENUES: HD.AVENUES, PIERS: HD.PIERS, LANDMARKS: HD.LANDMARKS, HOODS: HD.HOODS, ZONE_RUNS: HD.ZONE_RUNS, SEED: HD.SEED, FILL: HD.FILL, NEXT: HD.NEXT_ON_LOT, FLAG: HD.FLAGSHIP, SUR: HD.SURNAMES, FIRST: HD.FIRSTNAMES, ADJ: HD.ADJ, NOUN: HD.NOUN, MOTEL: HD.MOTEL_NAMES, BW: HD.BOARDWALK, CW: HD.CAUSEWAY, WW: HD.WEST_WILDWOOD, US: HD.U_SOUTH, UN: HD.U_NORTH, beach: samples.map(HD.beachWidth), bay: samples.map(HD.bayEdge), town: samples.map(HD.townAt) };
    expect(fnv(canon(data))).toBe(GOLDEN.data);
    // `invented` is new (B24): the rest of every feature is as it was.
    expect(fnv(canon(PLACES.map((f) => ({ ...f, properties: { ...f.properties, invented: undefined } }))))).toBe(GOLDEN.places);
    expect(fnv(canon(STRETCHES))).toBe(GOLDEN.stretches);
    expect(HD.SEED).toHaveLength(71);
    expect(PLACES).toHaveLength(86);
  });

  it('a new game seeds its lots from the package parcels', () => {
    const s = newGame('pkg-lots');
    const r = reconcileHomeLots(s.econ!.lots);
    expect(r.missingSeeds).toEqual([]);
    // Every package parcel seeds a lot: the 1960 records and the town's house lots.
    expect(r.matched).toBe(HD.SEED.length + HD.RES_SEED.length);
    expect(r.generated).toBeGreaterThan(20);
  });

  it('same seed, same game — and moving buildings or changing art in the package changes nothing in play', async () => {
    const run = async (pkg?: CityPackage) => {
      vi.resetModules();
      if (pkg) vi.doMock('../src/worldpack/cities/index', async (orig) => {
        const m = await orig<typeof import('../src/worldpack/cities/index')>();
        return { ...m, WILDWOOD_PACKAGE: pkg, CITY_PACKAGES: { ...m.CITY_PACKAGES, wildwood: pkg } };
      });
      const h = await import('./helpers');
      const out = fnv(JSON.stringify(h.playWeeks('pkg-eq-play', 6)));
      vi.doUnmock('../src/worldpack/cities/index');
      return out;
    };
    const a = await run();
    expect(await run()).toBe(a);
    // The editor's corrections: a placement moved and turned, new art, a parcel's art, the package round-tripped through export/import.
    let p = clone(WILDWOOD_PACKAGE);
    const f = p.placements.find((x) => x.id === 'bw08')!;
    f.geo = [f.geo[0] + 0.0002, f.geo[1] - 0.0001];
    f.rotation = 15;
    f.art = { exterior: ['scene_boardwalk_tram'] };
    p = setArt(p, 'bw09', ['storefront_starburst']);
    const back = importCityPackage(exportCityPackage(p));
    expect(back.validation.errors).toEqual([]);
    expect(await run(back.pkg!)).toBe(a);
    // And the swap is real: a change that matters in play (a lot's condition) does change the game.
    const q = clone(WILDWOOD_PACKAGE);
    q.parcels[0].structure!.condition = 12;
    expect(await run(q)).not.toBe(a);
  }, 120000);
});

describe('Cape May', () => {
  it('imports as a package, with no gameplay code of its own', () => {
    expect(CAPE.displayName).toBe('Cape May');
    expect(CAPE.detail).toBe('aggregate');
    expect(CAPE.districts.map((d) => d.name)).toEqual(['Washington Street', 'Beach Avenue', 'The Victorian streets', 'The Harbor', 'Cape May Point']);
    expect(CAPE.parcels.length).toBeGreaterThanOrEqual(30);
    expect(CAPE.institutions.some((i) => i.kind === 'city-hall') && CAPE.institutions.some((i) => i.kind === 'police')).toBe(true);
    // Real public landmarks by name; businesses still operating under near-miss names; real names only for closed ones.
    expect(CAPE.landmarks.find((l) => l.id === 'lm:cm-lighthouse')!.evidence.confidence).toBe('verified');
    for (const b of CAPE.businesses) if (b.namePolicy === 'historical') expect(b.years.to, b.name).toBeDefined();
    expect(CAPE.businesses.filter((b) => b.namePolicy === 'near-miss').map((b) => b.name)).toContain('Capitol Hall Hotel');
    // The trip planner reads it: hotels and things to do come from the package.
    expect(DESTS.capemay.hotels[1]).toBe('a room at the Chalfont Arms');
    expect(DESTS.capemay.activities.map((a) => a.id)).toContain('cm-cards');
    expect(DESTS.capemay.resort).toBe(true);
  });

  it('a third town drops in through the same import path', () => {
    let p = newTown('Ocean City', 39.2776, -74.5746);
    p = addDistrict(p, 'Asbury Avenue', [[-200, 100], [200, 100], [200, 300], [-200, 300]]).pkg;
    const r = addParcel(p, { u: 0, v: 200 }, { address: '800 Asbury Ave' });
    p = addBusiness(r.pkg, r.id, 'Somers Point Shoes', 'storefront', { from: 1948 }).pkg;
    p.visit = { hotels: ['a rooming house', 'the Flanders', 'a suite'], peak: [7, 8], activities: [{ id: 'oc-walk', name: 'The boards', text: 'A dry town.', tags: ['family'], cost: 2 }] };
    const back = importCityPackage(exportCityPackage(p));
    expect(back.validation.errors).toEqual([]);
    const s = newGame('oc');
    const t = materializeTown(s, { ...back.pkg!, detail: 'aggregate' });
    expect(Object.keys(t.lots)).toEqual([r.id]);
  });

  it('runs as an aggregate with no state and no dice', () => {
    const a = townAggregate(CAPE, 'x', 10, 7);
    expect(townAggregate(CAPE, 'x', 10, 7)).toEqual(a);
    expect(a.weekly).toBeGreaterThan(townAggregate(CAPE, 'x', 30, 1).weekly);
    const s = newGame('agg');
    const before = JSON.stringify(s);
    townsWeek(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('a trip there materializes its lots, the same whichever week, without touching the dice', () => {
    const s = newGame('visit');
    const rng = s.rng;
    const t1 = materializeTown(s, CAPE);
    expect(s.rng).toBe(rng);
    expect(Object.keys(t1.lots)).toHaveLength(CAPE.parcels.length);
    expect(t1.lots['cm-w13'].status).toBe('public');
    expect(t1.lots['cm-w10'].status).toBe('sale');
    // Again: no reroll.
    expect(materializeTown(s, CAPE)).toBe(t1);
    // A later week, a fresh game with the same seed: the same lots.
    let s2 = newGame('visit');
    for (let i = 0; i < 3; i++) s2 = advanceWeek(s2, {}).state;
    const t2 = materializeTown(s2, CAPE);
    for (const id of Object.keys(t1.lots)) expect({ ...t2.lots[id], history: undefined }).toEqual({ ...t1.lots[id], history: undefined });
  });

  it('a planned trip in the week brings it into focus through the weekly update', () => {
    let s = newGame('trip');
    s = advanceWeek(s, {}).state;
    expect(s.towns).toBeUndefined();
    const d = s.week * 7;
    ensureTravel(s).trips.push({ id: 'trip:t1', purpose: 'vacation', leaderId: s.playerId, party: [], guests: [], driverIds: [], destId: 'capemay', mode: 'cars', tier: 'modest', cars: 1, days: ['cm-porch'], departDay: d + 1, arriveDay: d + 1, leaveDay: d + 2, homeDay: d + 2, cost: 0, journal: [], done: 0, legs: [] });
    s = advanceWeek(s, {}).state;
    expect(s.towns?.capemay?.visits).toBe(1);
    expect(s.towns!.capemay.log[0].text).toMatch(/get to know Cape May/);
  });

  it('follows the year: closed places close, later occupants open', () => {
    expect(occupantIn(CAPE, 'cm-b05', 1960)!.name).toBe('The Marlborough Hotel');
    expect(occupantIn(CAPE, 'cm-b05', 1971)).toBeUndefined();
    expect(occupantIn(CAPE, 'cm-b05', 1975)!.name).toBe('Marlborough Towers');
    expect(yearsCover(CAPE.streets.find((x) => x.id === 'path:washington-mall')!.years, 1960)).toBe(false);
    expect(yearsCover(CAPE.streets.find((x) => x.id === 'path:washington-mall')!.years, 1972)).toBe(true);
  });
});

describe('the editor', () => {
  it('round-trips: build a town, export, import — the same package, the same text', () => {
    let p = newTown('Sea Isle City', 39.1534, -74.6929);
    let r = addDistrict(p, 'Landis Avenue', [[-300, 0], [300, 0], [300, 200], [-300, 200]], 500);
    p = r.pkg;
    const dist = r.id;
    r = addParcel(p, { u: 10, v: 50 }, { address: '4000 Landis Ave' });
    p = r.pkg;
    const lot = r.id;
    expect(p.parcels[0].districtId).toBe(dist);
    p = addBusiness(p, lot, 'The Sea Isle Pharmacy', 'pharmacy', { from: 1947 }).pkg;
    p = addLandmark(p, 'The Promenade', 'promenade', { u: 0, v: -20 }).pkg;
    p = moveRecord(p, lot, { u: 40, v: 60 });
    p = setYears(p, `b:${lot}`, { from: 1947, to: 1981 });
    p = setArt(p, lot, ['storefront_starburst']);
    p = updateRecord(p, lot, { address: '4010 Landis Ave', ownable: undefined });
    const text = exportCityPackage(p);
    const back = importCityPackage(text);
    expect(back.validation.errors).toEqual([]);
    expect(back.pkg).toEqual(JSON.parse(JSON.stringify(p)));
    expect(exportCityPackage(back.pkg!)).toBe(text);
    // The shipped packages too.
    for (const q of Object.values(CITY_PACKAGES)) expect(exportCityPackage(importCityPackage(exportCityPackage(q)).pkg!)).toBe(exportCityPackage(q));
    // Removing a parcel takes its businesses along.
    expect(removeRecord(p, lot).businesses).toEqual([]);
  });

  it('never mutates the package it is given', () => {
    const before = exportCityPackage(CAPE);
    moveRecord(CAPE, 'cm-w01', { u: 0, v: 0 });
    setArt(CAPE, 'cm-w01', ['x']);
    removeRecord(CAPE, 'cm-w01');
    expect(exportCityPackage(CAPE)).toBe(before);
  });
});

describe('save migration by stable ids', () => {
  it('a corrected package keeps ownership, debts and history; removed lots are kept, new ones added', () => {
    const s = newGame('mig');
    const t = materializeTown(s, CAPE);
    const lot = t.lots['cm-b05'];
    lot.owner = 'player';
    lot.status = 'private';
    lot.debt = 12500;
    lot.history.push({ year: 1960, week: s.week, owner: 'player', how: 'bought', price: 41000 });
    const snapshot = clone(lot);
    // The corrections: the hotel moved and turned, new art, renamed, a lot dropped, a lot added, a new version.
    let p = moveRecord(CAPE, 'cm-b05', { u: 455, v: 60 });
    p = updateRecord(p, 'cm-b05', { rotation: 10, footprint: { w: 60, d: 46 } });
    p = setArt(p, 'cm-b05', ['scene_capemay_harbor']);
    p = updateRecord(p, 'b:cm-b05', { name: 'The Marlboro' });
    p = removeRecord(p, 'cm-w10');
    p = addParcel(p, { u: 700, v: 40 }, { address: 'Beach Ave at Madison Ave' }).pkg;
    p = { ...p, contentVersion: 'test-2' };
    expect(validateCityPackage(p).errors).toEqual([]);
    const rep = migrateTown(t, p, s.seed, s.date.y);
    expect(t.lots['cm-b05']).toEqual(snapshot);
    expect(rep.orphaned).toEqual(['cm-w10']);
    expect(t.lots['cm-w10'].orphan).toBe(true);
    expect(rep.added).toHaveLength(1);
    expect(t.contentVersion).toBe('test-2');
    // Through a save and a load.
    const loaded = upgradeSave(JSON.parse(JSON.stringify(s)) as GameState);
    expect(loaded.towns!.capemay.lots['cm-b05']).toEqual(snapshot);
  });

  it('old saves load (no towns), and the home town ignores corrections to geometry and art', () => {
    const s = playWeeks('mig-home', 3);
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete old.towns;
    const loaded = upgradeSave(old);
    expect(loaded.towns).toBeUndefined();
    const lots = JSON.stringify(loaded.econ!.lots);
    let p = clone(WILDWOOD_PACKAGE);
    p = updateRecord(p, 'bw08', { art: ['storefront_starburst'] });
    p = updateRecord(p, 'pa05', { address: 'Pacific Ave at Taylor Ave (corrected)' });
    const r = reconcileHomeLots(loaded.econ!.lots, p);
    expect(r.missingSeeds).toEqual([]);
    expect(JSON.stringify(loaded.econ!.lots)).toBe(lots);
  });
});
