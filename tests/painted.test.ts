import { describe, expect, it } from 'vitest';
import { placeAll } from '../src/engine/hoodGeo';
import { hoodOfZone } from '../src/engine/hoodData';
import { newGame } from '../src/engine/newGame';
import { itemsOf } from '../src/ui/hood/Buildings';
import { ISO } from '../src/ui/hood/iso';
import { bindSpots, SCENE_HOODS, SPOTS, type Scene } from '../src/ui/hood/PaintedView';
import { advanceWeek } from '../src/engine/engine';
import { FLAGSHIP } from '../src/engine/hoodData';
import { randomChoices } from './helpers';

describe('street level: the painted block and Pacific Avenue', () => {
  const s = newGame('painted');
  const items = itemsOf(s, placeAll(s), ISO);
  for (const scene of Object.keys(SPOTS) as Scene[]) {
    it(`binds every ${scene} hotspot to its own real record in the right neighborhood, the same way every time`, () => {
      const a = bindSpots(items, SPOTS[scene], SCENE_HOODS[scene]);
      const b = bindSpots(itemsOf(s, placeAll(s), ISO), SPOTS[scene], SCENE_HOODS[scene]);
      expect(a.size).toBe(SPOTS[scene].length);
      const keys = [...a.values()].map((it) => it.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const it of a.values()) {
        expect(it.lot, it.key).toBeDefined();
        expect(s.econ!.lots.some((l) => l.id === it.lot!.id)).toBe(true);
        expect(SCENE_HOODS[scene]).toContain(hoodOfZone(it.lot!.zone as never));
      }
      // The scene's own neighborhood first: most of what you see is there.
      expect([...a.values()].filter((it) => hoodOfZone(it.lot!.zone as never) === SCENE_HOODS[scene][0]).length).toBeGreaterThanOrEqual(Math.ceil(a.size / 2));
      // Landmarks are bound to their own lots.
      for (const sp of SPOTS[scene]) if (sp.lot) expect(a.get(sp.id)?.lot?.id).toBe(sp.lot);
      expect([...b.entries()].map(([k, v]) => `${k}:${v.key}`)).toEqual([...a.entries()].map(([k, v]) => `${k}:${v.key}`));
    });
  }
  it('the old Seven Seas becomes The 7 Sees the week it is yours', () => {
    let g = newGame('sees');
    g.money = 400000;
    const l0 = g.econ!.lots.find((l) => l.id === FLAGSHIP.lotId)!;
    expect(l0.status).toBe('sale');
    expect(l0.name).toBe(FLAGSHIP.oldName);
    g = advanceWeek(g, { ...randomChoices(g, 1), actions: [{ kind: 'econ', op: { type: 'buyLot', lotId: FLAGSHIP.lotId, going: true } }] }).state;
    g = advanceWeek(g, randomChoices(g, 2)).state;
    const l = g.econ!.lots.find((x) => x.id === FLAGSHIP.lotId)!;
    expect(l.status).toBe('owned');
    expect(l.name).toBe(FLAGSHIP.name);
    expect(g.hood!.log.some((e) => e.text.includes(FLAGSHIP.name))).toBe(true);
  });
  it('motel hotspots show motels', () => {
    const a = bindSpots(items, SPOTS.block);
    expect(['motel', 'hotel']).toContain(a.get('caribbean')!.icon);
  });
});
