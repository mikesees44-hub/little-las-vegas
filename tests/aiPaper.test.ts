import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { playWeeks } from './helpers';
import { enginePage, pageKey, paperBrief, paperPrompt, paperWeeks, validatePage, type FrontPage, type PaperBrief } from '../src/engine/ai/paper';
import { resetSample } from '../src/ui/minds/sampleClient';
import { FrontPageView, PaperVoice, setPage } from '../src/ui/paper/PaperVoice';
import { PaperReader } from '../src/ui/paper/PaperReader';

const s = playWeeks('ai-paper', 10);
const week = paperWeeks(s)[0];
const b = paperBrief(s, week) as PaperBrief;

/** A page that keeps to the facts (built from the printed facts themselves). */
function goodPage(): Record<string, unknown> {
  const printed = b.facts.filter((f) => f.src === 'paper');
  return {
    headline: 'BUSY WEEK ON THE ISLAND',
    stories: printed.slice(0, 3).map((f) => ({ h: 'The News', b: f.b, facts: [f.id] })),
    gossip: { h: 'Heard on the Boardwalk', b: 'The switchboard rang all week, and the Tide does not vouch for any of it.' },
    sports: { h: 'Sports', b: 'The sports desk had a quiet week.' },
  };
}

describe('the living newspaper: the facts', () => {
  it('the brief is what the papers printed that week, never a spiked story', () => {
    expect(b).toBeDefined();
    const items = s.paper!.eds.filter((e) => e.week === week).flatMap((e) => e.items);
    for (const f of b.facts.filter((x) => x.src === 'paper')) {
      const it = items.find((x) => x.b.replace(/\s+/g, ' ').trim().startsWith(f.b.slice(0, 40)));
      expect(it, f.b).toBeDefined();
      expect(it!.sp).toBeUndefined();
    }
    for (const f of b.facts.filter((x) => x.src === 'talk')) expect(f.b).not.toMatch(/\b(you|your)\b/i);
    expect(new Set(b.facts.map((f) => f.id)).size).toBe(b.facts.length);
    expect(paperPrompt(s, b)[0].content).toContain(b.facts[0].id);
    expect(paperBrief(s, -5)).toBeUndefined();
  });

  it('the engine page is made of the paper\'s own words and passes the checks', () => {
    const p = enginePage(b);
    expect(p.by).toBe('paper');
    expect(p.stories.length).toBeGreaterThanOrEqual(3);
    const v = validatePage(s, p, b);
    expect(v.ok, v.ok ? '' : v.why).toBe(true);
  });
});

describe('the living newspaper: the validator', () => {
  it('accepts a page that keeps to the facts', () => {
    const v = validatePage(s, goodPage(), b);
    expect(v.ok, v.ok ? '' : v.why).toBe(true);
    if (v.ok) expect(v.page.by).toBe('claude');
  });

  it('rejects invented names, unknown facts, figures, length and shape', () => {
    const p = goodPage();
    const st = p.stories as { h: string; b: string; facts: string[] }[];
    const bad = (patch: (x: Record<string, unknown>) => void) => { const x = JSON.parse(JSON.stringify(p)); patch(x); return validatePage(s, x, b).ok; };
    expect(bad((x) => { (x.stories as typeof st)[0].b = 'Police questioned Vincenzo Scarabelli about the matter.'; })).toBe(false);
    expect(bad((x) => { (x.stories as typeof st)[0].facts = ['f999']; })).toBe(false);
    expect(bad((x) => { (x.stories as typeof st)[0].facts = []; })).toBe(false);
    expect(bad((x) => { (x.stories as typeof st)[0].b = 'Merchants say they lost $987,654 this week.'; })).toBe(false);
    expect(bad((x) => { x.headline = 'X'.repeat(200); })).toBe(false);
    expect(bad((x) => { x.stories = (x.stories as typeof st).slice(0, 2); })).toBe(false);
    expect(bad((x) => { (x.gossip as { b: string }).b = 'Somebody made him an offer he can\'t refuse.'; })).toBe(false);
    expect(bad((x) => { (x.sports as { b: string }).b = 'Sinatra sang on the pier.'; })).toBe(false);
    expect(bad((x) => { delete x.sports; })).toBe(false);
    // A person of the game who was never printed, in any case (headlines are capitals).
    const never = Object.values(s.characters).find((c) => c.lastName.length >= 5 && !b.text.toLowerCase().includes(c.lastName.toLowerCase()));
    if (never) expect(bad((x) => { x.headline = `${never.lastName.toUpperCase()} IN TROUBLE`; })).toBe(false);
    // A story that stands only on unconfirmed talk is gossip, not news.
    const talk = b.facts.find((f) => f.src === 'talk');
    if (talk) expect(bad((x) => { (x.stories as typeof st)[0].facts = [talk.id]; })).toBe(false);
    expect(validatePage(s, 'no', b).ok).toBe(false);
  });
});

describe('the living newspaper: the page', () => {
  it('without Claude the paper\'s own page is set; the components render', async () => {
    resetSample();
    const p = await setPage(s, b);
    expect(p.by).toBe('paper');
    const html = renderToString(createElement(FrontPageView, { page: p, date: b.date, week: b.week }));
    expect(html).toContain('voice-page');
    expect(html).toContain('voice-gossip');
    expect(html).toContain('voice-sports');
    expect(renderToString(createElement(PaperVoice, { s, week }))).toContain('paper-voice');
    expect(renderToString(createElement(PaperReader, { s }))).toContain('paper-voice');
  });

  it('Claude\'s page is used only when it passes, and is kept per week in the browser', async () => {
    const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
    const had = { w: g.window, l: g.localStorage };
    const store = new Map<string, string>();
    try {
      g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
      let reply: unknown = { ...goodPage(), headline: 'NOT A GOOD NAME: Scarabelli', stories: [{ h: 'Vincenzo Scarabelli', b: 'Vincenzo Scarabelli did it.', facts: ['f1'] }] };
      const fn = Object.assign(async () => ({ text: '' }), { json: async () => reply });
      g.window = { claude: { use: async () => fn } };
      resetSample();
      expect((await setPage(s, b)).by).toBe('paper');
      expect(store.size).toBe(0);
      reply = goodPage();
      const p: FrontPage = await setPage(s, b);
      expect(p.by).toBe('claude');
      expect(store.has(pageKey(s, week))).toBe(true);
      // From the cache now (even with Claude gone).
      g.window = undefined;
      resetSample();
      expect((await setPage(s, b)).headline).toBe(p.headline);
      // Storage that throws: the page still comes.
      g.localStorage = { getItem: () => { throw new Error('off'); }, setItem: () => { throw new Error('off'); } };
      expect((await setPage(s, b)).by).toBe('paper');
    } finally {
      g.window = had.w;
      g.localStorage = had.l;
      resetSample();
    }
  });
});
