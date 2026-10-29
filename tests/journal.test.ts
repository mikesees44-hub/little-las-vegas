import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { nightRoster } from '../src/engine/nightlife';
import { boldReply } from '../src/engine/quickies';
import { upgradeSave } from '../src/engine/upgradeSave';
import { BOOK_PER_WEEK, BOOK_WEEKS, bookAbout, bookEntries, bookSearch, journal, registerBookSource } from '../src/engine/journal';
import { packSave, unpackSave } from '../src/ui/save';
import type { GameState, PlayerAction } from '../src/engine/types';

const pro = (s: GameState) => nightRoster(s, 'callgirl').concat(nightRoster(s, 'young')).map((r) => r.id).find((id) => !s.nightlife!.people[id].bounds.includes('no_married'))!;
const bold = (id: string, amount: number): PlayerAction => ({ kind: 'nightlife', op: { op: 'bold', id, amount, raises: 0, after: 'none' } });

function boldWeek(seed: string) {
  const s = newGame(seed);
  s.tribute!.acct.personal = 5000;
  const id = pro(s);
  const amount = [250, 500, 1000, 1500].find((a) => boldReply(s, id, a, 0).result === 'yes') ?? 250;
  const r = advanceWeek(s, { actions: [bold(id, amount)] });
  return { s0: s, s: r.state, id, amount, report: r.report };
}

describe('The Book', () => {
  it('a bold offer is one entry: what you ordered, her answer, the money, linked to her and the club', () => {
    const { s0, s, id, amount } = boldWeek('book-bold');
    const venue = s0.nightlife!.people[id].venue;
    const e = s.journal!.e.find((x) => x.src === 'order' && x.p?.includes(id))!;
    expect(e).toBeDefined();
    expect(e.t).toMatch(/A bold offer to/);
    expect(e.mine).toBe(1);
    expect(e.o).toMatch(/^o\d+\.1$/);
    expect(e.c).toBe('romance');
    expect(e.pl).toContain(`v:${venue}`);
    expect(e.r!.join(' ')).toContain(s.characters[id].firstName);
    if (boldReply(s0, id, amount, 0).result === 'yes') expect(e.m).toBe(-amount);
    // The same line in the nightlife log and the report is not written twice.
    const line = e.r![0];
    expect(s.journal!.e.filter((x) => [x.t, x.x, ...(x.r ?? [])].includes(line)).length).toBe(1);
    // Per person and per place.
    const her = bookAbout(s, { person: id });
    expect(her.entries.map((x) => x.id)).toContain(e.id);
    expect(her.orders).toBeGreaterThanOrEqual(1);
    expect(bookAbout(s, { place: `v:${venue}` }).entries.map((x) => x.id)).toContain(e.id);
  });

  it('an order\'s result lines attach to the order (not left loose in the week)', () => {
    const { s, report } = boldWeek('book-attach');
    const order = s.journal!.e.find((x) => x.src === 'order')!;
    for (const l of order.r ?? []) expect(report.log).toContain(l);
    const loose = s.journal!.e.filter((x) => x.src === 'report');
    for (const l of order.r ?? []) expect(loose.some((x) => x.t === l)).toBe(false);
    // A blocked order says so, on the order.
    const s2 = newGame('book-blocked');
    s2.tribute!.acct.personal = 0;
    const id = pro(s2);
    const r2 = advanceWeek(s2, { actions: [bold(id, 900)] }).state;
    const b = r2.journal!.e.find((x) => x.src === 'order')!;
    expect(b.r![0]).toMatch(/^Not carried out/);
  });

  it('filters and search: category, person, my orders, money, dates, words, a thread', () => {
    const { s, id } = boldWeek('book-filter');
    const all = bookSearch(s);
    expect(all.length).toBeGreaterThan(3);
    expect(bookSearch(s, { cats: ['romance'] }).every((e) => e.c === 'romance')).toBe(true);
    expect(bookSearch(s, { mine: true }).every((e) => e.mine)).toBe(true);
    expect(bookSearch(s, { money: true }).every((e) => !!e.m)).toBe(true);
    expect(bookSearch(s, { person: id }).every((e) => e.p?.includes(id))).toBe(true);
    expect(bookSearch(s, { from: s.week + 5 })).toEqual([]);
    const first = s.characters[id].firstName;
    expect(bookSearch(s, { q: `bold ${first.toLowerCase()}` }).some((e) => e.src === 'order')).toBe(true);
    expect(bookSearch(s, { q: 'zzzz-nothing' })).toEqual([]);
    const order = bookSearch(s, { mine: true, person: id })[0];
    expect(bookSearch(s, { thread: order.id }).map((e) => e.id)).toContain(order.id);
  });

  it('any system can write with one call; the same fact twice is one entry; fallout links back', () => {
    const { s, id } = boldWeek('book-api');
    const t = cloneState(s);
    const name = `${t.characters[id].firstName} ${t.characters[id].lastName}`;
    const a = journal(t, { t: `${name} told the whole bar about the boss.`, src: 'test', p: [id] });
    const b = journal(t, { t: `${name} told the whole bar about the boss.`, src: 'other', pl: ['v:Somewhere'] });
    expect(a).toBe(b);
    const e = t.journal!.e.find((x) => x.id === a)!;
    expect(e.pl).toContain('v:Somewhere');
    expect(e.re).toBe(t.journal!.e.find((x) => x.src === 'order' && x.p?.includes(id))!.id);
    // A system with a log of its own is read in without editing the Book.
    registerBookSource({ id: 'test-src', read: (st, since) => (st.week > s.week ? [{ k: 'x', w: Math.max(since, st.week), t: 'A new system did a thing.', src: 'test-src' }] : []) });
    const u = cloneState(s);
    const next = advanceWeek(u, {}).state;
    expect(next.journal!.e.some((x) => x.src === 'test-src')).toBe(true);
    registerBookSource({ id: 'test-src', read: () => [] });
  });

  it('bounded: a year keeps the last weeks in full and folds the rest; deterministic; round-trips a save', () => {
    let s = newGame('book-year');
    let s2 = newGame('book-year');
    for (let w = 0; w < 30; w++) { s = advanceWeek(s, {}).state; s2 = advanceWeek(s2, {}).state; }
    const J = s.journal!;
    expect(JSON.stringify(J)).toBe(JSON.stringify(s2.journal));
    expect(Math.min(...J.e.map((e) => e.w))).toBeGreaterThanOrEqual(s.week - BOOK_WEEKS);
    const per = new Map<number, number>();
    for (const e of J.e) per.set(e.w, (per.get(e.w) ?? 0) + 1);
    for (const n of per.values()) expect(n).toBeLessThanOrEqual(BOOK_PER_WEEK);
    expect(J.old.length).toBeGreaterThan(10);
    expect(JSON.stringify(J).length).toBeLessThan(120_000);
    const json = JSON.stringify(s);
    const back = JSON.parse(unpackSave(packSave(json))) as GameState;
    expect(back.journal).toEqual(J);
    // An old save without the Book: unchanged by the upgrade; the screen backfills from the chronicle.
    const old = cloneState(s);
    delete old.journal;
    expect(upgradeSave(old).journal).toBeUndefined();
    expect(bookEntries(old).length).toBeGreaterThan(0);
    console.log('book size', JSON.stringify(J).length, 'entries', J.e.length, 'old', J.old.length);
  });
});

describe('Your File: every click says what it did, and every order lands in the File', () => {
  it('a sample of orders from several tabs: each gives "Ordered" feedback and comes back as an entry with its outcome', async () => {
    const { availableActions, previewAction } = await import('../src/engine/actions');
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { OrderToast } = await import('../src/ui/components/OrderToast');
    const s = newGame('file-sample');
    s.tribute!.acct.personal = 5000;
    const all = availableActions(s);
    const kinds = new Set<string>();
    const sample: PlayerAction[] = [];
    for (const a of all) if (!kinds.has(a.kind) && !previewAction(s, a).disabledReason) { kinds.add(a.kind); sample.push(a); }
    sample.push(bold(pro(s), 250));
    expect(sample.length).toBeGreaterThan(5);
    for (const [i, a] of sample.entries()) {
      const html = renderToString(createElement(OrderToast, { s, item: { action: a, index: i, at: 0 }, onUndo: () => {}, onClose: () => {} }));
      expect(html, a.kind).toContain('✓ Queued');
      expect(html, a.kind).toContain('See it in Your File');
    }
    const next = advanceWeek(s, { actions: sample }).state;
    const orders = next.journal!.e.filter((e) => e.src === 'order' && e.mine);
    expect(orders.length).toBe(sample.length);
    // In order, each under its own title (an earlier order can change the next one's wording, e.g. who it replaces).
    for (const [i, a] of sample.entries()) expect(orders[i].t.slice(0, 12), a.kind).toBe(previewAction(s, a).title.slice(0, 12));
  });

  it('a decision answered, and a change made at once, are in the File too; the feedback names them', async () => {
    const { journalNow } = await import('../src/engine/journal');
    const { feedbackLine } = await import('../src/ui/components/Feedback');
    let s = newGame('file-decide');
    for (let i = 0; i < 3 && !s.pendingEvents.length; i++) s = advanceWeek(s, {}).state;
    const ev = s.pendingEvents[0];
    expect(ev).toBeDefined();
    const ch = ev.choices.find((c) => !c.disabledReason)!;
    const next = advanceWeek(s, { choices: { [ev.iid]: ch.id } }).state;
    expect(next.journal!.e.some((e) => e.src === 'decision' && e.t === `${ev.title}: ${ch.label}`)).toBe(true);
    expect(feedbackLine({ kind: 'decided', title: `${ev.title}: ${ch.label}` })).toMatch(/^✓ Decided — .* · happens when the week turns/);
    const now = journalNow(next, { t: 'Tuesday evening: dinner at the club' });
    expect(next.journal!.e.some((e) => e.src === 'now')).toBe(false);
    expect(now.journal!.e.at(-1)).toMatchObject({ src: 'now', mine: 1, t: 'Tuesday evening: dinner at the club' });
    expect(feedbackLine({ kind: 'done', title: 'Tuesday evening: dinner at the club' })).toBe('✓ Done — Tuesday evening: dinner at the club');
  });

  it('Your File renders: open threads, filters, the entries; a person\'s tab; the route resolves', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { TheBook, BookAbout } = await import('../src/ui/book/TheBook');
    const { resolveRoute } = await import('../src/ui/shell/nav');
    const { s, id } = boldWeek('file-render');
    const html = renderToString(createElement(TheBook, { s }));
    expect(html).toContain('data-testid="book-filters"');
    expect(html).toContain('data-testid="book-entry"');
    expect(html).toContain('A bold offer to');
    const her = renderToString(createElement(BookAbout, { s, person: id }));
    expect(her).toContain('Between you and her');
    expect(her).toContain('A bold offer to');
    expect(resolveRoute('file').key).toBe('chronicle.book');
    expect(resolveRoute('book').key).toBe('chronicle.book');
  });
});
