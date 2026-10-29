import { readFileSync } from 'node:fs';
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
