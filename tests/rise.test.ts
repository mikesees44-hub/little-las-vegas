import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { playWeeks } from './helpers';
import { newGame } from '../src/engine/newGame';
import { crew } from '../src/engine/characters';
import { ensureXp, promotionCandidates, readyToBeMade, ASSOC_CAP, XP_AT } from '../src/engine/crewXp';
import { currentRung, LADDER, riseBadges, riseChart, riseSummary } from '../src/engine/riseView';
import { HOME_IDS } from '../src/ui/shell/routes';
import { REGISTRY_KEYS } from '../src/ui/shell/nav';
import { TheRise, RiseColumn } from '../src/ui/borgata/TheRise';

describe('The Rise', () => {
  it('badges match readyToBeMade and the promotion candidates', () => {
    const s = playWeeks('rise-badges', 6);
    for (const c of crew(s)) {
      const b = riseBadges(s, c).map((x) => x.kind);
      expect(b.includes('made'), c.id).toBe(readyToBeMade(s, c));
      expect(b.includes('crew'), c.id).toBe(promotionCandidates(s).capo.some((x) => x.id === c.id));
    }
    // An associate at the cap shows "Ready to be made".
    const t = newGame('rise-made');
    const a = crew(t).find((c) => c.rank === 'associate' && !c.specialty && !c.outside);
    if (a) {
      ensureXp(t).men[a.id] = { xp: XP_AT[ASSOC_CAP - 1], lvl: ASSOC_CAP };
      expect(riseBadges(t, a).some((x) => x.kind === 'made')).toBe(true);
    }
  });
  it('the ladder: seven rungs in order, each unlock names a real home or section', () => {
    expect(LADDER.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const r of LADDER) for (const u of r.unlocks) expect(HOME_IDS.includes(u as never) || REGISTRY_KEYS.includes(u), `${r.id}: ${u}`).toBe(true);
    const s = newGame('rise-ladder');
    const at = currentRung(s).at.n;
    expect(at).toBeGreaterThanOrEqual(1);
    for (const r of LADDER.slice(0, at)) expect(r.done(s), r.id).toBe(true);
    expect(riseSummary(s).next?.n).toBe(at + 1);
  });
  it('capos are front and center with their territory and their men', () => {
    const s = playWeeks('rise-capos', 4);
    const ch = riseChart(s);
    for (const k of ch.capos) {
      expect(k.rank).toBe('capo');
      expect(typeof k.take).toBe('number');
      for (const m of k.men) expect(s.characters[m.id].capoId).toBe(k.id);
    }
    const html = renderToString(createElement(TheRise, { s }));
    expect(html).toContain('data-testid="rise-ladder"');
    if (ch.capos.length) expect(html).toContain('data-testid="rise-capo"');
    expect(renderToString(createElement(RiseColumn, { s }))).toContain('rung');
  });
});
