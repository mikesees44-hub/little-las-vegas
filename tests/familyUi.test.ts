import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ActivitiesPanel } from '../src/ui/family/ActivitiesPanel';
import { DecisionsPanel } from '../src/ui/family/DecisionsPanel';
import { DynastyTree } from '../src/ui/family/DynastyTree';
import { FamilyTab } from '../src/ui/family/FamilyTab';
import { LegacyPanel } from '../src/ui/family/LegacyPanel';
import { MarriagePanel } from '../src/ui/family/MarriagePanel';
import { playWeeks } from './helpers';

describe('family UI', () => {
  const s = playWeeks('famui', 60);
  it('the Family tab renders the house header and the dynasty tree', () => {
    const html = renderToString(createElement(FamilyTab, { s, onLaw: () => {}, onHeir: () => {} }));
    expect(html).toContain('data-testid="house-header"');
    expect(html).toContain('data-testid="dynasty-tree"');
    expect(html).toContain('♔ Head');
  });
  it('every sub-panel renders', () => {
    expect(renderToString(createElement(DynastyTree, { s }))).toContain('tree-person');
    expect(renderToString(createElement(LegacyPanel, { s }))).toContain('legacy-blood');
    expect(renderToString(createElement(DecisionsPanel, { s }))).toContain('Become Boss of the Shore');
    expect(renderToString(createElement(ActivitiesPanel, { s }))).toContain('fishing trip');
    expect(renderToString(createElement(MarriagePanel, { s }))).toContain('Houses of the shore');
  });
});
