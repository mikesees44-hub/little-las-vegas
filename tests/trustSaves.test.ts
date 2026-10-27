import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { acceptSettlement, mayCommit } from '../src/engine/settle';
import { newGameWith } from '../src/engine/starts';
import { xfer } from '../src/engine/tribute';
import { pocketCash } from '../src/engine/tributeState';
import { SCHEMA } from '../src/engine/trustMigrations';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { GameState, PlayerChoices } from '../src/engine/types';
import { loadSlot, readBackup, saveSlot, type KV } from '../src/ui/save';
import { randomChoices } from './helpers';

/** An in-memory localStorage, optionally with a size limit (characters). */
function memKV(limit = Infinity): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      const size = [...data.entries()].reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0) + v.length;
      if (size > limit) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => { data.delete(k); },
  };
}

const json = (s: GameState) => JSON.stringify(s);

/** A few weeks of the same play: random-but-legal answers and one order. */
function play(s: GameState, weeks: number, salt = 0): GameState {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    const ch: PlayerChoices = { ...randomChoices(s, salt + i), actions: i === 1 ? [{ kind: 'legal', op: 'retainer' }] : [] };
    s = advanceWeek(s, ch).state;
  }
  return s;
}

describe('B04: a week settles exactly once', () => {
  it('advanceWeek never changes its input, and the same week from the same state gives the same result', () => {
    const s = play(newGameWith('trust-b04', 'sees'), 2);
    const before = json(s);
    const ch = randomChoices(s, 7);
    const a = advanceWeek(s, ch);
    const b = advanceWeek(s, ch);
    expect(json(s)).toBe(before);
    expect(json(a.state)).toBe(json(b.state));
    expect(a.report).toEqual(b.report);
  });
  it('the commit gate accepts a week once, only onto the state it came from', () => {
    const s = newGameWith('trust-b04b', 'classic');
    const r = advanceWeek(s, {}).state;
    expect(mayCommit(undefined, s)).toBe(true);
    const mark = { seed: s.seed, week: s.week };
    expect(mayCommit(mark, s)).toBe(false); // the clock's Sunday and the button, or a double click
    expect(mayCommit(mark, r)).toBe(true); // next week is fine
    expect(acceptSettlement(s, s, r)).toBe(r);
    // A second result computed from the old state lands on the already-advanced state: dropped.
    const dup = advanceWeek(s, {}).state;
    expect(acceptSettlement(r, s, dup)).toBe(r);
    // A different game in the meantime (load, new game): dropped.
    const other = newGameWith('trust-b04c', 'classic');
    expect(acceptSettlement(other, s, r)).toBe(other);
  });
  it('a transfer is applied once per key within the week (a repeated posting moves nothing)', () => {
    const s = newGameWith('trust-b04d', 'classic');
    const ctx = newCtx(s);
    const p0 = pocketCash(s);
    expect(xfer(ctx, 'treasury', 'personal', 500, 'transfer', 'test:once')).toBe(500);
    xfer(ctx, 'treasury', 'personal', 500, 'transfer', 'test:once');
    expect(pocketCash(s)).toBe(p0 + 500);
  });
});

describe('B31: versioned saves and deterministic replay', () => {
  it('the same seed and the same choices replay to the same game', () => {
    const a = play(newGameWith('trust-b31', 'sees'), 4);
    const b = play(newGameWith('trust-b31', 'sees'), 4);
    expect(json(a)).toBe(json(b));
  });
  it('save, load, and play on is the same game as playing on without saving', () => {
    const kv = memKV();
    const mid = play(newGameWith('trust-b31b', 'sees'), 3);
    expect(saveSlot(1, mid, kv)).toBe(true);
    const loaded = loadSlot(1, kv)!;
    expect(loaded).toBeDefined();
    expect(json(loaded)).toBe(json(upgradeSave(JSON.parse(json(mid)))));
    const going = play(JSON.parse(json(mid)) as GameState, 3, 100);
    const resumed = play(loaded, 3, 100);
    expect(json(resumed)).toBe(json(going));
    expect(readBackup(kv)).toBeUndefined(); // a current save needs no migration backup
  });
  it('an older save is migrated, and the stored copy is kept as a backup first', () => {
    const kv = memKV();
    const s = newGameWith('trust-b31c', 'classic');
    delete s.schema;
    s.characters[s.playerId].appearance = { genes: { heavy: 0.8 } };
    kv.setItem('little-las-vegas:slot:2', JSON.stringify(s));
    const up = loadSlot(2, kv)!;
    expect(up.schema).toBe(SCHEMA);
    expect(up.characters[up.playerId].appearance!.genes!.beard).toBe(0.8);
    const b = readBackup(kv)!;
    expect(b.why).toBe('migration');
    expect(b.slot).toBe(2);
    expect(JSON.parse(b.raw).schema).toBeUndefined();
  });
  it('a corrupt save is not loaded, and its bytes are kept', () => {
    const kv = memKV();
    kv.setItem('little-las-vegas:slot:3', '{"version":2,"seed":"x", broken');
    expect(loadSlot(3, kv)).toBeUndefined();
    expect(readBackup(kv)).toMatchObject({ slot: 3, why: 'corrupt' });
  });
  it('when storage is full the backup is dropped, never the game', () => {
    const s = newGameWith('trust-b31d', 'classic');
    const size = json(s).length;
    const kv = memKV(Math.round(size * 1.6));
    kv.data.set('little-las-vegas:backup', 'x'.repeat(Math.round(size * 0.8)));
    expect(saveSlot(1, s, kv)).toBe(true);
    expect(kv.getItem('little-las-vegas:backup')).toBeNull();
    expect(loadSlot(1, kv)?.seed).toBe(s.seed);
  });
});
