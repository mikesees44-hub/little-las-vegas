import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { CUTSCENE_KEYS, MAX_CUTSCENES, cutscenesBetween } from '../src/engine/cutscenes';
import { cloneState } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { NoirStill } from '../src/ui/cutscene/NoirStill';
import { CutscenePlayer } from '../src/ui/cutscene/Cutscene';

describe('cutscenes', () => {
  it('a quiet week has none', () => {
    const s = newGame('cut1');
    const n = cloneState(s);
    n.week += 1;
    expect(cutscenesBetween(s, n)).toEqual([]);
  });

  it('a death in the family is a funeral; an associate made is a made man', () => {
    const s = newGame('cut2');
    const n = cloneState(s);
    const kin = Object.values(n.characters).find((c) => c.alive && c.dynasty && c.id !== n.playerId)!;
    kin.alive = false;
    const assoc = Object.values(n.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'associate');
    if (assoc) assoc.rank = 'soldier';
    const keys = cutscenesBetween(s, n).map((c) => c.key);
    expect(keys).toContain('funeral');
    if (assoc) expect(keys).toContain('made_man');
  });

  it('the boss dying and his son taking over plays the death then the heir', () => {
    const s = newGame('cut3');
    const n = cloneState(s);
    const boss = n.characters[n.playerId];
    const son = boss.childrenIds.map((id) => n.characters[id]).find((c) => c?.alive);
    if (!son) return;
    boss.alive = false;
    n.playerId = son.id;
    const keys = cutscenesBetween(s, n).map((c) => c.key);
    expect(keys.slice(0, 2)).toEqual(['boss_death', 'heir_rises']);
  });

  it('engine cues come first, and there are never more than the cap', () => {
    const s = newGame('cut4');
    const n = cloneState(s);
    n.cutscenes = [{ key: 'hit_success', title: 'x', text: 'y', week: 1 }];
    for (const c of Object.values(n.characters)) if (c.dynasty && c.id !== n.playerId) c.alive = false;
    const out = cutscenesBetween(s, n);
    expect(out[0].key).toBe('hit_success');
    expect(out.length).toBeLessThanOrEqual(MAX_CUTSCENES);
  });

  it('every key draws a still, and the player renders with its caption slot', () => {
    for (const k of CUTSCENE_KEYS) {
      const html = renderToString(createElement(NoirStill, { cue: k, seed: 3 }));
      expect(html).toContain('<svg');
      expect(html.length).toBeGreaterThan(800);
    }
    const html = renderToString(createElement(CutscenePlayer, { cues: [{ key: 'wedding', title: 'The wedding', text: 'Rice on the steps.', week: 3 }], onDone: () => {} }));
    expect(html).toContain('data-testid="cutscene"');
    expect(html).toContain('The wedding');
  });
});
