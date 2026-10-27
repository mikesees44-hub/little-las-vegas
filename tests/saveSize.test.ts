import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { loadSlot, packSave, saveSlot, unpackSave, type KV } from '../src/ui/save';

const mem = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };

describe('compressed saves', () => {
  it('a year-long save packs to well under a fifth of its size and loads back exactly', () => {
    let s = newGame('save-size');
    for (let w = 0; w < 52; w++) s = advanceWeek(s, { actions: [] }).state;
    const json = JSON.stringify(s);
    const packed = packSave(json);
    expect(unpackSave(packed)).toBe(json);
    expect(packed.length).toBeLessThan(json.length / 5);
    const kv = mem();
    expect(saveSlot(1, s, kv)).toBe(true);
    const back = loadSlot(1, kv)!;
    expect(back.week).toBe(s.week);
    expect(Object.keys(back.characters).length).toBe(Object.keys(s.characters).length);
    console.log('save size chars', json.length, '→', packed.length);
  });
  it('an old uncompressed save still loads', () => {
    const s = newGame('save-old');
    const kv = mem();
    kv.setItem('little-las-vegas:slot:1', JSON.stringify(s));
    expect(loadSlot(1, kv)?.seed).toBe(s.seed);
  });
});
