import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import {
  buildContext, feedbackChannel, FEEDBACK_COLLECTION, reportDoc, reportText, resetFeedbackChannel, sendReport, startOf, type FeedbackDb,
} from '../src/ui/feedback/reportClient';

/** The playtesters' report (ui/feedback): the context it attaches, the document it writes, and the copy fallback. */
describe('report a bug or idea', () => {
  afterEach(() => {
    resetFeedbackChannel();
    delete (globalThis as { window?: unknown }).window;
  });

  it('attaches the game context and nothing else', () => {
    const s = newGame('report-ctx');
    const ctx = buildContext(s, 'home:money holdings.money');
    expect(ctx.week).toBe(s.week);
    expect(ctx.seed).toBe(String(s.seed));
    expect(ctx.start).toBe(startOf(s));
    expect(ctx.screen).toBe('home:money holdings.money');
    expect(ctx.file.length).toBeLessThanOrEqual(3);
    const doc = reportDoc('bug', '  The map froze  ', '', ctx, '2026-11-03T00:00:00.000Z');
    expect(doc).toEqual({ type: 'bug', text: 'The map froze', at: '2026-11-03T00:00:00.000Z', ctx: { ...ctx } });
    expect(Object.keys(doc)).not.toContain('name');
    expect(reportDoc('idea', 'x', ' Sal ', ctx).name).toBe('Sal');
    const txt = reportText('story', 'The wake scene', 'Sal', ctx);
    expect(txt).toContain('Story moment from Sal');
    expect(txt).toContain(`week ${s.week}`);
  });

  it('outside claude.ai there is no store: the form copies instead', async () => {
    expect((await feedbackChannel()).mode).toBe('copy');
  });

  it('with db it sends one document to the feedback collection; a refused write falls back to the copy', async () => {
    const written: [string, Record<string, unknown>][] = [];
    let refuse = false;
    const db = {
      collection: (p: string) => ({
        add: async (d: Record<string, unknown>) => { if (refuse) throw { code: 'invalid_argument', message: 'no' }; written.push([p, d]); return {}; },
      }),
    } as unknown as FeedbackDb;
    (globalThis as { window?: unknown }).window = { claude: { use: async (n: string) => (n === 'db' ? db : n === 'user' ? { can: async () => null, canEdit: async () => true } : null) } };
    const ch = await feedbackChannel();
    expect(ch.mode).toBe('db');
    expect(ch.reader).toBe(true);
    expect(await sendReport(db, { type: 'bug', text: 'x' })).toEqual({ ok: true });
    expect(written).toEqual([[FEEDBACK_COLLECTION, { type: 'bug', text: 'x' }]]);
    refuse = true;
    expect(await sendReport(db, { type: 'bug', text: 'y' })).toEqual({ ok: false, code: 'invalid_argument', fallback: true });
  });

  it('a viewer who may not write shared data gets the copy, up front', async () => {
    (globalThis as { window?: unknown }).window = { claude: { use: async (n: string) => (n === 'db' ? { collection: () => ({}) } : { can: async () => false, canEdit: async () => false }) } };
    expect((await feedbackChannel()).mode).toBe('copy');
  });

  it('the form renders, and the menu offers it', async () => {
    const { ReportBug } = await import('../src/ui/feedback/ReportBug');
    const s = newGame('report-ui');
    const html = renderToString(createElement(ReportBug, { s, onClose: () => {}, initialScreen: 'map' }));
    for (const id of ['feedback-form', 'feedback-type-bug', 'feedback-type-idea', 'feedback-type-story', 'feedback-text', 'feedback-name', 'feedback-send', 'feedback-context']) expect(html).toContain(`data-testid="${id}"`);
  });
});
