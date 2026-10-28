import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { crew } from '../src/engine/characters';
import { newGame } from '../src/engine/newGame';
import { groupBySide, plotTargets, plotWarnings, sideMatches, sideOf, SIDE_STYLE } from '../src/engine/sides';
import { ensureTalks } from '../src/engine/talks';
import type { Character, GameState } from '../src/engine/types';
import { PlotWarnings, TargetPicker } from '../src/ui/components/Schemes';
import { SideChip } from '../src/ui/components/Side';

function man(s: GameState, f: Character['faction']): Character {
  const r = s.rivals.find((x) => x.id === f)!;
  return Object.values(s.characters).find((c) => c.alive && c.faction === f && c.id !== r.leaderId)!;
}

function know(s: GameState, c: Character, by: 'player' | 'manno' = 'player') {
  s.secrets.push({ id: `x${s.nextId++}`, ownerId: c.id, kind: 'informant', text: 'informs', knownBy: [by], week: s.week });
}

describe('sideOf', () => {
  it('gives every kind of person a side with a label, colour and emblem', () => {
    const s = newGame('sides-kinds');
    const mine = crew(s)[0];
    expect(sideOf(s, mine.id)).toMatchObject({ kind: 'yours', factionId: 'player', label: 'Your family', short: 'YOURS', emblem: '★' });
    expect(sideOf(s, s.playerId).kind).toBe('yours');
    const m = man(s, 'manno');
    expect(sideOf(s, m.id)).toMatchObject({ kind: 'rival', factionId: 'manno', label: 'The Manno family', relation: 'peace' });
    expect(sideOf(s, man(s, 'kessler').id).label).toBe('The Kessler family');
    expect(sideOf(s, man(s, 'philly').id)).toMatchObject({ kind: 'philly', label: 'Philadelphia' });
    const cop = Object.values(s.characters).find((c) => c.office === 'Police sergeant')!;
    expect(sideOf(s, cop.id)).toMatchObject({ kind: 'law', label: 'Police' });
    const irs = Object.values(s.characters).find((c) => c.office === 'IRS agent')!;
    expect(sideOf(s, irs.id).kind).toBe('law');
    const pol = Object.values(s.characters).find((c) => c.office === 'City councilman')!;
    expect(sideOf(s, pol.id)).toMatchObject({ kind: 'official', label: 'City Hall' });
    const civ = Object.values(s.characters).find((c) => c.faction === 'none' && !c.office && !c.outside && !s.nightlife?.people[c.id])!;
    expect(sideOf(s, civ.id)).toMatchObject({ kind: 'civilian', label: 'Civilian' });
    const night = Object.keys(s.nightlife?.people ?? {}).find((id) => s.characters[id]);
    if (night) expect(sideOf(s, night).kind).toBe('nightlife');
    expect(sideOf(s, 'nobody').kind).toBe('civilian');
  });

  it('each family has a distinct colour and a distinct emblem shape', () => {
    const styles = Object.values(SIDE_STYLE);
    expect(new Set(styles.map((x) => x.color)).size).toBe(styles.length);
    expect(new Set(styles.map((x) => x.emblem)).size).toBe(styles.length);
    expect(SIDE_STYLE.player.color).toBe('#d4a62a');
  });

  it('shows the family relation: war, feud, truce', () => {
    const s = newGame('sides-rel');
    const m = man(s, 'manno');
    s.rivals.find((r) => r.id === 'manno')!.war = true;
    expect(sideOf(s, m.id).relation).toBe('war');
    const k = man(s, 'kessler');
    ensureTalks(s).pacts.push({ id: 'p1', a: 'player', b: 'kessler', kind: 'truce', since: s.week, until: s.week + 26, terms: 'x' });
    expect(sideOf(s, k.id).relation).toBe('truce');
    s.rivals.find((r) => r.id === 'feldstein')!.feud = true;
    expect(sideOf(s, man(s, 'feldstein').id).relation).toBe('feud');
  });

  it('the payroll nuance stays hidden until the boss knows it', () => {
    const s = newGame('sides-double');
    const m = man(s, 'manno');
    m.informantFor = 'player';
    expect(sideOf(s, m.id).double).toBeUndefined();
    expect(sideOf(s, m.id).full).toBe('The Manno family');
    know(s, m);
    expect(sideOf(s, m.id).double?.text).toBe('on your payroll');
    expect(sideOf(s, m.id).full).toBe('Manno man — on your payroll');
    expect(sideOf(s, m.id).kind).toBe('rival');

    // Your own man who talks to the Kesslers: hidden until a secret your house holds says so.
    const rat = crew(s)[1];
    rat.informantFor = 'kessler';
    expect(sideOf(s, rat.id).double).toBeUndefined();
    know(s, rat, 'manno');
    expect(sideOf(s, rat.id).double).toBeUndefined();
    know(s, rat);
    expect(sideOf(s, rat.id)).toMatchObject({ kind: 'yours', full: 'Your man — talks to the Kessler family' });
  });

  it('filters Mine / Theirs / Everyone', () => {
    const s = newGame('sides-filter');
    const mine = sideOf(s, crew(s)[0].id);
    const theirs = sideOf(s, man(s, 'manno').id);
    expect(sideMatches(mine, 'mine')).toBe(true);
    expect(sideMatches(theirs, 'mine')).toBe(false);
    expect(sideMatches(theirs, 'theirs')).toBe(true);
    expect(sideMatches(mine, 'theirs')).toBe(false);
    expect(sideMatches(mine, 'all') && sideMatches(theirs, 'all')).toBe(true);
  });
});

describe('plotting by side', () => {
  it('scheme targets are grouped: your family first, then each family, the law, civilians', () => {
    const s = newGame('sides-groups');
    const groups = plotTargets(s, 'murder');
    expect(groups[0].side.kind).toBe('yours');
    const keys = groups.map((g) => g.key);
    for (const k of ['rival:manno', 'rival:kessler', 'rival:feldstein', 'philly:philly']) expect(keys).toContain(k);
    for (const g of groups) for (const id of g.ids) expect([sideOf(s, id).kind, sideOf(s, id).factionId]).toEqual([g.side.kind, g.side.factionId]);
    expect(groups.flatMap((g) => g.ids)).not.toContain(s.playerId);
    // Turning an informant: only other families.
    expect(plotTargets(s, 'informant').every((g) => g.side.kind === 'rival' || g.side.kind === 'philly')).toBe(true);
    expect(plotTargets(s, 'murder', 'mine').every((g) => g.side.kind === 'yours')).toBe(true);
    expect(plotTargets(s, 'murder', 'theirs').some((g) => g.side.kind === 'yours')).toBe(false);
    expect(groupBySide(s, []).length).toBe(0);
  });

  it('warns when the target is your own man, and when an agent belongs to another family', () => {
    const s = newGame('sides-warn');
    const [a, b] = crew(s);
    const own = plotWarnings(s, true, a.id, [b.id]);
    expect(own.some((w) => w.tone === 'bad' && /your own man/i.test(w.text) && /betrayal/.test(w.text))).toBe(true);
    // Befriending your own is not a betrayal.
    expect(plotWarnings(s, false, a.id, [b.id])).toEqual([]);
    // A rival target with your men: no warning.
    expect(plotWarnings(s, true, man(s, 'manno').id, [b.id])).toEqual([]);
    // Another family's man on the team.
    const k = man(s, 'kessler');
    expect(plotWarnings(s, true, man(s, 'manno').id, [k.id]).some((w) => /Kessler man — he may sell you out/.test(w.text))).toBe(true);
    // Your man who (you know) talks to the Mannos.
    b.informantFor = 'manno';
    know(s, b);
    expect(plotWarnings(s, true, man(s, 'kessler').id, [b.id]).some((w) => /talks to the Manno family/.test(w.text))).toBe(true);
  });

  it('renders grouped headers in the target picker and the warning banner', () => {
    const s = newGame('sides-ui');
    const html = renderToString(createElement(TargetPicker, { s }));
    expect(html).toContain('data-testid="target-picker"');
    expect(html).toContain('data-testid="target-group-header"');
    expect(html).toContain('The Manno family');
    expect(html).toContain('data-testid="side-filter"');
    const [a, b] = crew(s);
    const warn = renderToString(createElement(PlotWarnings, { s, hostile: true, targetId: a.id, agents: [b.id] }));
    expect(warn).toContain('data-testid="plot-warning"');
    expect(warn).toContain('betrayal');
    const chip = renderToString(createElement(SideChip, { s, id: a.id }));
    expect(chip).toContain('YOURS');
    expect(chip).toContain('★');
  });
});
