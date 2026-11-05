import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { playWeeks } from './helpers';
import { previewAction } from '../src/engine/actions';
import {
  ASK_EXAMPLES, ASK_TOPICS, askTopics, counselBrief, counselMenu, counselor, counselPrompt, scriptedCounsel, validateCounsel, type MenuItem,
} from '../src/engine/ai/counsel';
import { crewBoard } from '../src/engine/crewBoard';
import { fmtMoney } from '../src/engine/effects';
import { pocketCash } from '../src/engine/tributeState';
import { resetSample } from '../src/ui/minds/sampleClient';
import { AskPanel, answerQuestion, clearAskHistory, rememberTurn } from '../src/ui/ai/AskCounsel';
import { FindPalette } from '../src/ui/shell/Find';

const s = playWeeks('ai-counsel', 8);

describe('Ask the consigliere: the brief and the menu', () => {
  it('the brief tells the truth about the state', () => {
    const b = counselBrief(s);
    expect(b.text).toContain(fmtMoney(s.money));
    expect(b.text).toContain(fmtMoney(pocketCash(s)));
    expect(b.text).toContain(`local ${s.heat.local}/100, federal ${s.heat.federal}/100`);
    const cb = crewBoard(s);
    expect(b.lines.men[0]).toContain(`${cb.rows.length} men: ${cb.count.earning} earning`);
    expect(b.lines.men[0]).toContain(fmtMoney(cb.upWeek));
    for (const r of s.rivals.filter((x) => x.kind === 'mob')) expect(b.text).toContain(`${r.name}: muscle ${r.muscle}/100`);
    expect(b.lines.war.some((l) => (s.wars.length ? l.startsWith('At war') : l === 'No war on right now.'))).toBe(true);
    const c = counselor(s);
    if (c) expect(b.speakerId).toBe(c.id);
    // Pure: the same object, the same brief.
    expect(counselBrief(s)).toBe(b);
  });

  it('the menu is real orders with the engine\'s own preview', () => {
    const menu = counselMenu(s);
    expect(menu.length).toBeGreaterThan(0);
    menu.forEach((m, i) => {
      expect(m.i).toBe(i);
      const p = previewAction(s, m.action);
      expect(m.cost).toBe(p.cost);
      expect(m.disabled).toBe(p.disabledReason);
      const o = p.acceptance ?? p.odds;
      expect(m.odds).toBe(o ? o.chance : undefined);
    });
    const msgs = counselPrompt(s, 'What should I do?');
    expect(msgs[0].content).toContain('BRIEF:');
    expect(msgs[0].content).toContain('MENU:');
    expect(msgs[msgs.length - 1].content).toContain('What should I do?');
  });
});

describe('Ask the consigliere: the validator', () => {
  const menu = counselMenu(s);
  const ok = menu.findIndex((m) => !m.disabled);
  const fine = { answer: 'Boss, the money is fine. I\'d keep an eye on the men.', picks: ok >= 0 ? [ok] : [] };

  it('accepts an answer that keeps to the brief', () => {
    const v = validateCounsel(s, fine, menu);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.out.picks).toEqual(fine.picks);
    // A figure from the brief is fine.
    expect(validateCounsel(s, { answer: `We have ${fmtMoney(s.money)} in the Family.`, picks: [] }, menu).ok).toBe(true);
  });

  it('rejects picks off the menu, unavailable picks and too many', () => {
    expect(validateCounsel(s, { ...fine, picks: [menu.length] }, menu).ok).toBe(false);
    expect(validateCounsel(s, { ...fine, picks: [-1] }, menu).ok).toBe(false);
    expect(validateCounsel(s, { ...fine, picks: ['go'] }, menu).ok).toBe(false);
    const dis: MenuItem[] = [...menu, { ...menu[0], i: menu.length, disabled: 'Not possible right now' }];
    expect(validateCounsel(s, { ...fine, picks: [menu.length] }, dis).ok).toBe(false);
    const many = [0, 1, 2, 3].filter((i) => menu[i] && !menu[i].disabled);
    if (many.length === 4) expect(validateCounsel(s, { ...fine, picks: many }, menu).ok).toBe(false);
  });

  it('rejects invented names, figures, film lines and long answers', () => {
    expect(validateCounsel(s, { answer: 'Talk to Vincenzo Scarabelli, he knows the judge.', picks: [] }, menu).ok).toBe(false);
    expect(validateCounsel(s, { answer: 'We cleared $987,654 last week.', picks: [] }, menu).ok).toBe(false);
    expect(validateCounsel(s, { answer: 'Make him an offer he can\'t refuse.', picks: [] }, menu).ok).toBe(false);
    expect(validateCounsel(s, { answer: 'Boss, '.concat('the men are fine. '.repeat(40)), picks: [] }, menu).ok).toBe(false);
    expect(validateCounsel(s, { answer: 'Angelo Bruno would know.', picks: [] }, menu).ok).toBe(false);
    // A man of the game who is not in the brief (any case).
    const brief = counselBrief(s);
    const out = Object.values(s.characters).find((c) => c.alive && c.lastName.length >= 5 && !brief.text.toLowerCase().includes(c.lastName.toLowerCase()) && !brief.people.includes(c.id));
    if (out) expect(validateCounsel(s, { answer: `watch out for ${out.lastName.toLowerCase()} this week.`, picks: [] }, menu).ok).toBe(false);
    expect(validateCounsel(s, 'nope', menu).ok).toBe(false);
    expect(validateCounsel(s, { picks: [] }, menu).ok).toBe(false);
  });
});

describe('Ask the consigliere: without Claude', () => {
  it('each keyword route gets a scripted answer with valid picks', () => {
    const menu = counselMenu(s);
    const qs: Record<string, string> = { money: 'Where is my money going?', men: 'Which of my men need work?', war: 'Is there going to be a war with the rivals?', law: 'Are the feds on us?', women: 'How is my wife?', next: 'What should I do next?' };
    for (const k of ASK_TOPICS) {
      expect(askTopics(s, qs[k])[0]).toBe(k);
      expect(askTopics(s, ASK_EXAMPLES[k])).toContain(k);
      const a = scriptedCounsel(s, qs[k]);
      expect(a.topics[0]).toBe(k);
      expect(a.answer.length).toBeGreaterThan(20);
      expect(a.picks.length).toBeLessThanOrEqual(3);
      for (const i of a.picks) { expect(menu[i]).toBeDefined(); expect(menu[i].disabled).toBeUndefined(); }
      // The notes pass the same checks Claude's words do.
      const v = validateCounsel(s, a, menu);
      expect(v.ok, `${k}: ${v.ok ? '' : v.why}`).toBe(true);
      expect(scriptedCounsel(s, qs[k])).toEqual(a);
    }
    expect(askTopics(s, 'tell me a joke')).toEqual(['next']);
  });

  it('the box answers from his notes when sample is absent, and renders', async () => {
    resetSample();
    clearAskHistory();
    const t = await answerQuestion(s, 'What should I do next?', []);
    expect(t.by).toBe('notes');
    rememberTurn(s, t);
    const html = renderToString(createElement(AskPanel, { s }));
    expect(html).toContain('ask-panel');
    expect(html).toContain('ask-answer');
    expect(html).toContain('ask-input');
    if (t.picks.length) expect(html).toContain('action-card');
    clearAskHistory();
    expect(renderToString(createElement(AskPanel, { s }))).toContain('ask-example-money');
    expect(renderToString(createElement(FindPalette, { s, onPick: () => {}, onClose: () => {} }))).toContain('find-input');
  });

  it('Claude\'s answer is used only when it passes; else his notes', async () => {
    const menu = counselMenu(s);
    const ok = menu.findIndex((m) => !m.disabled);
    const g = globalThis as unknown as { window?: unknown };
    const had = g.window;
    try {
      let reply: unknown = { answer: 'Boss, I would start with what is in front of you.', picks: ok >= 0 ? [ok] : [] };
      const fn = Object.assign(async () => ({ text: '' }), { json: async () => reply });
      g.window = { claude: { use: async () => fn } };
      resetSample();
      const a = await answerQuestion(s, 'What now?', []);
      expect(a.by).toBe('claude');
      expect(a.picks.length).toBe(ok >= 0 ? 1 : 0);
      reply = { answer: 'Call Vincenzo Scarabelli.', picks: [99] };
      const b = await answerQuestion(s, 'What now?', []);
      expect(b.by).toBe('notes');
    } finally {
      g.window = had;
      resetSample();
    }
  });
});
