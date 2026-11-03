import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('the button hierarchy (S13a)', () => {
  it('index.css defines primary, secondary, quiet and danger, with the old names as aliases', () => {
    const css = readFileSync('src/index.css', 'utf8');
    for (const c of ['btn-primary', 'btn-secondary', 'btn-quiet', 'btn-danger', 'btn-gold', 'btn-ghost']) expect(css, c).toContain(`.${c} {`);
  });
  it('the migrated screens use the new names', () => {
    for (const f of ['src/ui/shell/TopBar.tsx', 'src/ui/desk/BossDesk.tsx', 'src/ui/office/BossOffice.tsx', 'src/ui/lieutenants/Lieutenants.tsx', 'src/ui/sitdown/SitDown.tsx', 'src/ui/shell/RightRail.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\bbtn-(gold|ghost)\b/);
    }
  });
});

describe('S13b: one overlay primitive, consistent rows and sheets', () => {
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : d.name.endsWith('.tsx') ? [`${dir}/${d.name}`] : []));
  const files = walk('src/ui');
  it('"fixed inset-0" lives only in Modal.tsx (Overlay), the cutscene and the minigame screen', () => {
    const allowed = ['src/ui/components/Modal.tsx', 'src/ui/cutscene/Cutscene.tsx', 'src/ui/minigames/MinigameScreen.tsx'];
    for (const f of files) if (!allowed.includes(f)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/fixed inset-0/);
  });
  it('the order row, the order card, the person menu and the sheet use the new button names', () => {
    for (const f of ['src/ui/components/ActionRow.tsx', 'src/ui/components/Orders.tsx', 'src/ui/sheet/InteractionMenu.tsx', 'src/ui/components/CharacterSheet.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bbtn-(gold|ghost)\b/);
    }
  });
  it('hand-rolled bordered buttons do not grow (a ratchet; the plan\'s target is under 60)', () => {
    let n = 0;
    for (const f of files) {
      if (f.includes('/editor/') || f.includes('/hood/')) continue;
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/<button\b/g)) {
        const c = /className=(\{`[^`]*`\}|"[^"]*")/.exec(s.slice(m.index!, m.index! + 700))?.[1];
        if (c && !c.includes('btn-') && /\brounded/.test(c) && /\bborder\b/.test(c)) n++;
      }
    }
    expect(n).toBeLessThanOrEqual(188);
  });
  it('the decision card has one primary; the modal is a bottom sheet on phones', () => {
    const card = readFileSync('src/ui/decide/DecisionCard.tsx', 'utf8');
    expect(card.match(/btn-primary/g)?.length).toBe(1);
    const modal = readFileSync('src/ui/components/Modal.tsx', 'utf8');
    expect(modal).toMatch(/items-end sm:items-center/);
    expect(modal).toMatch(/max-h-\[90vh\]/);
    expect(modal).toMatch(/useOverlayStack/);
  });
});
