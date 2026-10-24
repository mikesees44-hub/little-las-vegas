import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { CUTSCENE_KEYS, MAX_CUTSCENES, cutscenesBetween } from '../src/engine/cutscenes';
import { cloneState } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { applyEffects } from '../src/engine/effects';
import { newCtx } from '../src/engine/ledger';
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

  it('crew life plays too: a rat or a capo gone over is a betrayal, a man pinched is an interrogation, a crew wedding is a wedding', () => {
    const s = newGame('cut5');
    const n = cloneState(s);
    const men = Object.values(n.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== n.playerId && (c.rank === 'soldier' || c.rank === 'associate'));
    men[0].faction = 'law';
    men[0].rank = 'civilian';
    const made = men.find((c, i) => i > 0 && c.rank === 'soldier')!;
    made.imprisonedUntil = n.week + 10;
    const groom = men.slice(1).find((c) => !c.household?.wife && c.id !== made.id) ?? men[2];
    if (groom.household) groom.household.wife = undefined;
    const s0 = cloneState(n);
    s.characters[groom.id] = cloneState(s0).characters[groom.id];
    groom.household = { kids: groom.household?.kids ?? [], wife: 'Rose' };
    groom.story = [...(groom.story ?? []), { week: n.week, text: 'Married Rose Ciccone of the Crest; the boss sat at the head table.' }];
    const n2 = cloneState(n);
    const keys = cutscenesBetween(s, n).map((c) => c.key);
    expect(keys).toContain('betrayal_confrontation');
    expect(keys).toContain('arrest_interrogation');
    expect(keys).toContain('wedding');
    // A capo who walks to a rival family is a betrayal as well.
    const capo = Object.values(n2.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'capo')!;
    const before = cloneState(n2);
    capo.faction = 'manno';
    expect(cutscenesBetween(before, n2).map((c) => c.key)).toContain('betrayal_confrontation');
  });

  it('the membership ceremony raises the made_man cue', () => {
    const s = newGame('cut6');
    const assoc = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'associate' && !c.specialty)!;
    const n = cloneState(s);
    n.cutscenes = [];
    applyEffects(newCtx(n), [{ type: 'making', charId: assoc.id }], { label: 'The ceremony', because: 'made him' });
    expect(n.cutscenes.map((c) => c.key)).toContain('made_man');
    expect(cutscenesBetween(s, n).filter((c) => c.key === 'made_man').length).toBe(1);
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
