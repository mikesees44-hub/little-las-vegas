import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { makeCharacter } from '../src/engine/characters';
import { opinion } from '../src/engine/relations';
import { ensureDating, setDatingSettings } from '../src/engine/datingState';
import { startRomance } from '../src/engine/romance';
import {
  canDateTalk, conversationMod, DATE_MOD_CAP, dateAcceptance, dateBrief, datePrompt, fadeAllowed, readWords, settleDateTalk, startDateTalk, stepDate, strayNames,
  validateDate, type DateTalk,
} from '../src/engine/dateTalk';
import { previewAction } from '../src/engine/actions';
import type { Character, GameState } from '../src/engine/types';

function fresh(seed = 'aidate-a'): GameState {
  let s = newGame(seed);
  s = advanceWeek(s, {}).state;
  const boss = s.characters[s.playerId];
  boss.orientation = 'straight';
  if (boss.spouseId) { s.characters[boss.spouseId].alive = false; boss.spouseId = undefined; }
  s.tribute!.acct.personal = 5000;
  return s;
}

function woman(s: GameState, age = 28, extra: Partial<Character> = {}): Character {
  const c = makeCharacter(s, { gender: 'F', age, rank: 'civilian', faction: 'none', nickname: false, traits: [] });
  c.orientation = 'straight';
  Object.assign(c, extra);
  ensureDating(s).met[c.id] = s.week;
  ensureDating(s).bonds[c.id] = { id: c.id, aff: 45, rung: 'friends', dates: 1, since: 0, gifts: [], via: 'test' };
  return c;
}

describe('her brief is true to the game', () => {
  it('names her, her age, traits and job, his marriage, their history and her memory of the last talk', () => {
    const s = fresh();
    const c = woman(s, 31, { traits: ['Ambitious'] });
    const dt = startDateTalk(s, c.id, 'invite', 'dinner');
    const b = dateBrief(s, dt);
    expect(b).toContain(`${c.firstName}`);
    expect(b).toContain(', 31,');
    expect(b).toContain('Ambitious');
    expect(b).toContain('friends');
    expect(b).not.toMatch(/He is married/);
    expect(b).toContain('Admiral');
    // His marriage, when there is one, and she knows it.
    const w = makeCharacter(s, { gender: 'F', age: 35, rank: 'civilian', faction: 'none' });
    s.characters[s.playerId].spouseId = w.id; w.spouseId = s.playerId;
    expect(dateBrief(s, dt)).toContain(`He is married to ${w.firstName}`);
    // Memory: the last note goes into the brief and her opening line.
    ensureDating(s).bonds[c.id].notes = [{ w: 1, t: 'Dinner, week 1: she laughed at your jokes.', open: 'mother' }];
    const dt2 = startDateTalk(s, c.id, 'invite', 'dinner');
    expect(dateBrief(s, dt2)).toContain('she laughed at your jokes');
    expect(dt2.log.find((l) => l.who === 'her')!.text).toBe('You never did tell me about your mother.');
    expect(datePrompt(s, dt2, 'Hello', 'charm')[0].content).toContain('ONLY one JSON object');
  });
});

describe('the validator: Claude\'s line is data', () => {
  it('clamps the delta, whitelists the mood, trims long replies, rejects names not in the brief', () => {
    const s = fresh();
    const c = woman(s);
    const dt = startDateTalk(s, c.id, 'invite', 'dinner');
    const v = validateDate({ reply: 'Well, aren\'t you sweet.', mood: 'warmer', interest_delta: 99, topics: ['music', 42, 'the war'] }, s, dt);
    expect(v.ok).toBe(true);
    if (v.ok) { expect(v.out.delta).toBe(8); expect(v.out.mood).toBe('warmer'); expect(v.out.topics).toEqual(['music', 'the war']); }
    const odd = validateDate({ reply: 'Fine.', mood: 'ecstatic', interest_delta: -50 }, s, dt);
    expect(odd.ok && odd.out.mood).toBe('same');
    expect(odd.ok && odd.out.delta).toBe(-3);
    const cool = validateDate({ reply: 'Hm.', mood: 'cooler', interest_delta: 5 }, s, dt);
    expect(cool.ok && cool.out.delta).toBe(0);
    expect(validateDate({ reply: 'I saw Frankie Valentino at the club last night.', mood: 'same', interest_delta: 0 }, s, dt).ok).toBe(false);
    const other = Object.values(s.characters).find((x) => x.id !== c.id && x.id !== s.playerId && x.firstName.length > 3 && !dateBrief(s, dt).includes(x.firstName))!;
    expect(validateDate({ reply: `${other.firstName} told me about you.`, mood: 'same', interest_delta: 0 }, s, dt).ok).toBe(false);
    const boss = s.characters[s.playerId];
    expect(validateDate({ reply: `Oh, ${boss.firstName}, you are a caution. Cape May is lovely in June.`, mood: 'warmer', interest_delta: 3 }, s, dt).ok).toBe(true);
    expect(strayNames(s, c.id, `${c.firstName} likes the boardwalk.`, dateBrief(s, dt))).toEqual([]);
    const long = validateDate({ reply: Array.from({ length: 90 }, () => 'word').join(' '), mood: 'same', interest_delta: 0 }, s, dt);
    expect(long.ok && long.out.reply.split(' ').length).toBeLessThanOrEqual(61);
    expect(validateDate('nope', s, dt).ok).toBe(false);
    expect(validateDate({ mood: 'warmer' }, s, dt).ok).toBe(false);
  });
});

describe('the outcome: the existing odds plus the conversation, bounded and named', () => {
  it('never moves her answer by more than 15, and shows it as "The conversation: ..."', () => {
    const s = fresh();
    const c = woman(s);
    const base = previewAction(s, { kind: 'dating', op: { op: 'invite', id: c.id, date: 'dinner' } }).acceptance!.chance;
    let dt = startDateTalk(s, c.id, 'invite', 'dinner');
    for (let i = 0; i < 3; i++) dt = stepDate(s, dt, { tone: 'joke' }).dt;
    const m = conversationMod(dt);
    expect(m.label.startsWith('The conversation: ')).toBe(true);
    expect(Math.abs(m.value)).toBeLessThanOrEqual(DATE_MOD_CAP);
    const great: DateTalk = { ...dt, chem: 100, c0: 0, annoy: 0, net: { joke: 30 } };
    expect(conversationMod(great).value).toBe(15);
    expect(conversationMod(great).label).toBe('The conversation: she laughed at your jokes');
    const awful: DateTalk = { ...dt, chem: 0, c0: 100, annoy: 60 };
    expect(conversationMod(awful).value).toBe(-15);
    const acc = dateAcceptance(s, great)!;
    expect(acc.reasons.some((r) => r.label === 'The conversation: she laughed at your jokes' && r.value === 15)).toBe(true);
    expect(acc.chance).toBeLessThanOrEqual(Math.max(base, 0.95) + 1e-9);
    expect(acc.chance - base).toBeLessThanOrEqual(0.15 + 1e-9);
    expect(base - dateAcceptance(s, awful)!.chance).toBeLessThanOrEqual(0.15 + 1e-9);
  });

  it('settles the date order once, through the existing engine, and remembers the evening', () => {
    const s = fresh();
    const c = woman(s);
    let dt = startDateTalk(s, c.id, 'invite', 'dinner');
    for (const t of ['listen', 'joke', 'compliment', 'honest'] as const) dt = stepDate(s, dt, { tone: t }).dt;
    dt = stepDate(s, dt, { tone: 'home' }).dt;
    expect(dt.end).toBe('home');
    const r = settleDateTalk(s, dt);
    expect(r.result.ok).toBe(true);
    expect(r.result.headline).toMatch(/^\d+% — she said (yes|no)/);
    expect(r.result.changes[0]).toMatch(/The conversation: /);
    const b = r.state.dating!.bonds[c.id];
    expect(b.notes!.length).toBe(1);
    expect(b.talkW).toBe(r.state.week);
    if (r.accepted) expect(b.dates).toBe(2);
    // The same evening can't be had twice this week.
    expect(canDateTalk(r.state, c.id, 'invite', 'dinner').ok).toBe(false);
    expect(settleDateTalk(r.state, dt).result.ok).toBe(false);
  });
});

describe('she decides: no coercion', () => {
  it('pressure ends the evening on the spot; the answer is no and she remembers it', () => {
    const s = fresh();
    const c = woman(s);
    expect(readWords('You owe me, after what I paid for dinner.').coercive).toBe(true);
    expect(readWords('Tell me about your family?').tone).toBe('listen');
    let dt = startDateTalk(s, c.id, 'invite', 'dinner');
    dt = stepDate(s, dt, { tone: 'charm' }).dt;
    dt = stepDate(s, dt, { say: 'You owe me, after what I paid for dinner.' }).dt;
    expect(dt.end).toBe('walkout');
    expect(dt.coerced).toBe(true);
    // Even if Claude's line were warm, the engine ends it.
    let dt2 = startDateTalk(s, c.id, 'invite', 'dinner');
    dt2 = stepDate(s, dt2, { say: 'Don\'t say no to me.', ai: { reply: 'Oh, all right.', mood: 'warmer', delta: 8, topics: [], leaves: false } }).dt;
    expect(dt2.end).toBe('walkout');
    expect(dateAcceptance(s, dt)!.chance).toBe(0);
    const op0 = opinion(s, c.id, s.playerId);
    const r = settleDateTalk(s, dt);
    expect(r.accepted).toBe(false);
    expect(r.result.headline).toMatch(/she ended it/);
    expect(opinion(r.state, c.id, s.playerId)).toBeLessThan(op0);
    expect(r.state.dating!.bonds[c.id].notes!.slice(-1)[0].t).toMatch(/pushed and she left/);
    // A second forward remark is pressure too.
    let dt3 = startDateTalk(s, c.id, 'invite', 'dinner');
    dt3 = stepDate(s, dt3, { say: 'Come up to my room.' }).dt;
    expect(dt3.end).toBeUndefined();
    dt3 = stepDate(s, dt3, { say: 'Come on, spend the night.' }).dt;
    expect(dt3.end).toBe('walkout');
  });
});

describe('adults only; mature content Off hides adult outcomes', () => {
  it('a minor is never eligible, anywhere', () => {
    const s = fresh();
    const kid = woman(s, 17);
    for (const st of ['talk', 'invite', 'askOut', 'paid', 'after'] as const) expect(canDateTalk(s, kid.id, st, 'dinner').ok).toBe(false);
    expect(canDateTalk(s, kid.id, 'invite', 'dinner').why).toBe('Adults only');
    expect(settleDateTalk(s, startDateTalk(s, kid.id, 'invite', 'dinner')).result.ok).toBe(false);
  });

  it('no paid evening and no fade to black with mature content Off', () => {
    let s = fresh('aidate-m');
    const c = woman(s, 30);
    startRomance(s, s.playerId, c.id);
    ensureDating(s).bonds[c.id].aff = 80;
    const dt0 = startDateTalk(s, c.id, 'invite', 'night');
    let found: GameState | undefined;
    for (let w = 0; w < 40 && !found; w++) {
      const t = { ...s, week: s.week + w };
      if (fadeAllowed(t, { ...dt0, chem: 95, annoy: 0 }, true)) found = t;
    }
    expect(found).toBeTruthy();
    const off = setDatingSettings(found!, { mature: 'off' });
    expect(fadeAllowed(off, { ...dt0, chem: 95, annoy: 0 }, true)).toBe(false);
    expect(fadeAllowed(found!, { ...dt0, chem: 95, annoy: 0 }, false)).toBe(false);
    s = setDatingSettings(s, { mature: 'off' });
    const p = Object.values(s.dating!.providers)[0];
    if (p) expect(canDateTalk(s, p.id, 'paid').ok).toBe(false);
    expect(datePrompt(s, dt0, '', 'charm')[0].content).toContain('mature content is OFF');
  });
});

describe('the fallback and the window', () => {
  it('without Claude she answers from her scripted lines, by tone and his words', () => {
    const s = fresh('aidate-f');
    const c = woman(s, 26, { traits: ['Honest'] });
    let dt = startDateTalk(s, c.id, 'invite', 'coffee');
    const said = ['Tell me about you. What do you want, someday?', 'Ha, you hear the one about the lobster?', 'That dress is lovely on you.', 'I run half the Boulevard, you know.'];
    for (const t of said) dt = stepDate(s, dt, { say: t }).dt;
    const her = dt.log.filter((l) => l.who === 'her').map((l) => l.text);
    expect(her.length).toBe(5);
    for (const l of her) expect(l.length).toBeGreaterThan(2);
    expect(dt.used.brag).toBe(1);
    while (!dt.end) dt = stepDate(s, dt, { tone: 'listen' }).dt;
    expect(dt.round).toBeLessThanOrEqual(dt.max);
  });

  it('the window renders without the sample capability', async () => {
    const { renderToString } = await import('react-dom/server');
    const { DateTalkWindow } = await import('../src/ui/dating/DateTalk');
    const s = fresh('aidate-w');
    const c = woman(s);
    const html = renderToString(createElement(DateTalkWindow, { s, id: c.id, step: 'invite', date: 'dinner', onClose: () => {} }));
    expect(html).toContain('date-window');
    expect(html).toContain('date-meters');
    expect(html).toContain('date-tone-listen');
    expect(html).toContain('Chemistry');
  });
});
