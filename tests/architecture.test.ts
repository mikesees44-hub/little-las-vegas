import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { App, type AppProps } from '../src/ui/App';

const ENGINE = join(__dirname, '..', 'src', 'engine');

describe('architecture', () => {
  it('the engine has no React (or UI) imports', () => {
    for (const f of readdirSync(ENGINE)) {
      const src = readFileSync(join(ENGINE, f), 'utf8');
      expect(src, f).not.toMatch(/from ['"]react/);
      expect(src, f).not.toMatch(/from ['"]\.\.\/ui/);
      expect(src, f).not.toMatch(/\b(window|document|localStorage)\.[a-zA-Z]/);
    }
  });
  it('the UI renders without throwing', () => {
    const title = renderToString(createElement(App));
    expect(title).toContain('data-testid="title"');
    expect(title).toContain('New Game');
    const html = renderToString(createElement(App, { startOn: 'game' } as AppProps));
    expect(html).toContain('Little Las Vegas');
    expect(html).toContain('Advance Week');
    expect(html).toContain('data-testid="island-map"');
    expect(html).toContain('data-testid="player-card"');
  });
});
