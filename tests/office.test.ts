import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { advanceWeek } from '../src/engine/engine';
import { todaysHeadline } from '../src/engine/paper';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { PETITION_IDS, buildPetition } from '../src/engine/office';

describe("the boss's office", () => {
  it('office hours bring a petitioner the next week', () => {
    let s = newGame('off1');
    expect(previewAction(s, { kind: 'officeHours' }).disabledReason).toBeUndefined();
    s = advanceWeek(s, { actions: [{ kind: 'officeHours' }] }).state;
    expect(s.pendingEvents.some((e) => e.defId.startsWith('office_')) || s.eventQueue.some((e) => e.defId.startsWith('office_'))).toBe(true);
  });

  it('every petition has dialogue answers with named effects, and answering balances the books', () => {
    for (const id of PETITION_IDS) {
      const s = newGame(`off-${id}`);
      if (id === 'harbor') s.underbelly = { stage: 'active', strength: 30, exposure: 0, districts: ['docks'], since: 0, arrives: 0 };
      s.favors = 2;
      const ev = buildPetition(s, id)!;
      expect(ev, id).toBeTruthy();
      expect(ev.choices.length).toBeGreaterThanOrEqual(2);
      for (const c of ev.choices) {
        expect(c.label.startsWith('"'), `${id}/${c.id} is a line of dialogue`).toBe(true);
        for (const e of c.effects) expect(e.label, `${id}/${c.id}`).toMatch(/^The office: /);
      }
      s.pendingEvents = [ev];
      const r = advanceWeek(s, { choices: { [ev.iid]: ev.choices[0].id } });
      expect(reconcile(r.report)).toEqual([]);
    }
  });

  it('the Harbor Crew petition only comes while it is on the island, and helps expose it', () => {
    const s = newGame('off3');
    expect(buildPetition(s, 'harbor')).toBeUndefined();
    s.underbelly = { stage: 'active', strength: 30, exposure: 0, districts: ['docks'], since: 0, arrives: 0 };
    const ev = buildPetition(s, 'harbor')!;
    s.pendingEvents = [ev];
    const r = advanceWeek(s, { choices: { [ev.iid]: 'find' } });
    expect(r.state.underbelly!.exposure).toBeGreaterThanOrEqual(18);
  });
});

// ---- The Boss's Office (the room upstairs at the club: ui/office, engine/bossOffice.ts) ----
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { officeBriefing, officePhone, officeRoom, officeSeat, officeVisitors } from '../src/engine/bossOffice';
import { counsel } from '../src/engine/counsel';
import { weekCheckIns } from '../src/engine/checkins';
import { briefing } from '../src/engine/briefing';
import { newGameWith } from '../src/engine/starts';
import type { GameState } from '../src/engine/types';
import { OfficeContext, type OfficeApi } from '../src/ui/desk/officeApi';
import { BossOffice } from '../src/ui/office/BossOffice';
import { SocialClub } from '../src/ui/office/SocialClub';
import { HOTSPOTS, openHotspot } from '../src/ui/office/hotspots';
import { getSettings, OFFICE_HOME_FLAG, reloadSettings, setSettings, weekStart } from '../src/ui/settings';
import { loadSlot, saveSlot, type KV } from '../src/ui/save';
import { deskCount } from '../src/engine/attention';

function spyApi(): { api: OfficeApi; calls: string[] } {
  const calls: string[] = [];
  const names: (keyof OfficeApi)[] = ['openDesk', 'openEnvelope', 'openVisitors', 'openLedger', 'openCalendar', 'openDecisions', 'openMap', 'openFamily', 'openNews', 'openAdvance'];
  const api = Object.fromEntries(names.map((n) => [n, () => { calls.push(n); }])) as unknown as OfficeApi;
  return { api, calls };
}

function memKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

const officeHtml = (s: GameState, monday = true, api = spyApi().api) => renderToString(createElement(OfficeContext.Provider, { value: api },
  createElement(BossOffice, { s, ui: {}, monday, onMondayDone: () => {}, onInvite: () => {}, onDelegate: () => {}, onLater: () => {}, onClub: () => {} })));

function weekTwo(seed = 'ofc2'): GameState {
  return advanceWeek(newGameWith(seed), {}).state;
}

describe("the Boss's Office room", () => {
  it('every object is a measured rectangle inside the picture and opens one existing entry point or an office panel', () => {
    const ids = new Set<string>();
    for (const h of HOTSPOTS) {
      expect(ids.has(h.id), h.id).toBe(false);
      ids.add(h.id);
      expect(h.rect.x).toBeGreaterThanOrEqual(0);
      expect(h.rect.y).toBeGreaterThanOrEqual(0);
      expect(h.rect.x + h.rect.w).toBeLessThanOrEqual(100);
      expect(h.rect.y + h.rect.h).toBeLessThanOrEqual(100);
      for (const hasReport of [true, false]) {
        const { api, calls } = spyApi();
        const panels: string[] = [];
        openHotspot(h, api, { hasReport, panel: (p) => panels.push(p) });
        expect(calls.length + panels.length, h.id).toBe(1);
        if ('api' in h.entry) expect(calls[0]).toBe(h.id === 'envelope' && !hasReport ? 'openLedger' : h.entry.api);
        else expect(['door', 'phone', 'brief']).toContain(panels[0]);
      }
    }
    for (const want of ['envelope', 'ledger', 'phone', 'calendar', 'newspaper', 'photos', 'map', 'door', 'chair']) expect(ids.has(want), want).toBe(true);
  });

  it('renders the picture with focusable hotspots, the labeled list, and Monday\'s briefing', () => {
    const s = weekTwo();
    const html = officeHtml(s);
    for (const h of HOTSPOTS) {
      expect(html).toContain(`data-testid="office-spot-${h.id}"`);
      expect(html).toContain(`data-testid="office-item-${h.id}"`);
      expect(html).toContain(`aria-label="${h.label}:`);
    }
    expect(html).toContain('data-testid="office-monday"');
    expect(html).toContain('Hear the count');
    expect(html).toContain('See who&#x27;s waiting');
    expect(html).toContain('Review the desk');
    expect(html).toContain('Start with something else');
    expect(officeHtml(s, false)).not.toContain('data-testid="office-monday"');
    expect(renderToString(createElement(SocialClub, { s, onUpstairs: () => {}, onHq: () => {}, onMap: () => {} }))).toContain('data-testid="club-upstairs"');
  });

  it('the briefing reads the real count and what is waiting, and looking at the office changes nothing', () => {
    const s = weekTwo();
    const before = JSON.stringify(s);
    const b = officeBriefing(s);
    const rep = s.tribute!.reports[s.tribute!.reports.length - 1];
    expect(b.seat.charId).toBeTruthy();
    expect(b.count).toBe(rep.reported);
    expect(b.lines.length).toBeGreaterThanOrEqual(1);
    expect(b.lines.length).toBeLessThanOrEqual(2);
    expect(b.lines.join(' ')).toMatch(/brought in \$/);
    // The Desk's count (attention.ts): what needs the boss, capped; the rest is handled for him.
    expect(b.needs).toBe(deskCount(s));
    officeVisitors(s); officeRoom(s); officePhone(s);
    officeHtml(s, true); officeHtml(s, false);
    expect(JSON.stringify(s)).toBe(before);
    // Week one: no count yet, and the line says so.
    expect(officeBriefing(newGameWith('ofc1')).lines[0]).toMatch(/No count yet/);
  });

  it('visitors come only from real items, and go when answered, delegated or put off', () => {
    let s = newGameWith('ofc3');
    for (let w = 0; w < 4; w++) {
      const vs = officeVisitors(s);
      const b = briefing(s);
      const checks = weekCheckIns(s);
      for (const v of vs) {
        if (v.ref.event) {
          const ev = s.pendingEvents.find((e) => e.iid === v.ref.event);
          expect(ev, v.key).toBeTruthy();
          expect(ev!.defId).not.toBe('tribute_audience');
          expect(ev!.defId.startsWith('office_') || ev!.actors?.some((a) => a !== s.playerId && s.characters[a]?.alive)).toBe(true);
        } else if (v.ref.day !== undefined) {
          expect(checks.some((c) => `am:${c.key}` === v.key && c.problem)).toBe(true);
        } else if (v.ref.brief) {
          expect(b.items.some((i) => i.id === v.ref.brief)).toBe(true);
        } else expect(v.kind).toBe('lawyer');
        if (v.delegate?.op.kind === 'answer') {
          // "Ask X to handle it" carries X's own pick at the table (the playthrough: the button and his quote disagreed),
          // else the default when he gives none.
          const ev = s.pendingEvents.find((e) => e.iid === v.ref.event)!;
          const seat = officeSeat(s);
          const backs = counsel(s, { kind: 'event', iid: ev.iid })?.voices.find((x) => x.adviser.charId === seat.charId)?.backs;
          const open = backs && ev.choices.some((c) => c.id === backs && !c.disabledReason);
          expect(v.delegate.op.choiceId).toBe(open ? backs : ev.defaultChoiceId);
          expect(v.delegate.does).toBe(ev.choices.find((c) => c.id === v.delegate!.op.choiceId)!.label);
        }
      }
      const first = vs.find((v) => v.ref.event);
      if (first) expect(officeVisitors(s, { answers: { [first.ref.event!]: 'x' } }).some((v) => v.key === first.key)).toBe(false);
      if (vs[0]) expect(officeVisitors(s, { later: [vs[0].key] }).some((v) => v.key === vs[0].key)).toBe(false);
      const sd = vs.find((v) => v.ref.brief);
      if (sd) expect(officeVisitors(s, { briefSkip: [sd.ref.brief!] }).some((v) => v.key === sd.key)).toBe(false);
      s = advanceWeek(s, {}).state;
    }
    // Nothing pending, nothing at the briefing: nobody at the door but (maybe) the lawyer.
    const empty = { ...s, pendingEvents: [], days: { week: s.week, day: 6, answers: {}, skipped: [] } } as GameState;
    expect(officeVisitors(empty).filter((v) => v.kind === 'decision' || v.kind === 'morning' || v.kind === 'petition')).toEqual([]);
  });

  it('the room shows the family, a memorial after a death, the boss\'s health and the paper', () => {
    const s = weekTwo('ofc4');
    const r = officeRoom(s);
    const living = Object.values(s.characters).filter((c) => c.dynasty && c.alive && c.id !== s.playerId).length;
    expect(r.photos).toBe(Math.min(8, living));
    // The morning's Daily Tide is on the desk (engine/paper.ts); before the first edition, the last front page.
    expect(r.headline?.text).toBe(todaysHeadline(s)?.text ?? s.news[s.news.length - 1]?.headline);
    const kin = Object.values(s.characters).find((c) => c.dynasty && c.alive && c.id !== s.playerId)!;
    const t = structuredClone(s);
    t.characters[kin.id].alive = false;
    t.characters[kin.id].death = { week: t.week, date: t.date, cause: 'illness' };
    t.characters[t.playerId].health = 30;
    const r2 = officeRoom(t);
    expect(r2.memorial?.id).toBe(kin.id);
    expect(r2.cane).toBe(true);
    expect(r2.photos).toBe(Math.min(8, living - 1));
  });

  it('in prison the acting boss has the chair and the phone is the lawyer only', () => {
    const s = weekTwo('ofc5');
    s.characters[s.playerId].imprisonedUntil = s.week + 40;
    const r = officeRoom(s);
    expect(r.absence?.kind).toBe('prison');
    const b = officeBriefing(s);
    expect(b.seat.role === 'actingBoss' || b.seat.role === 'none').toBe(true);
    expect(officePhone(s).map((p) => p.kind)).toEqual(['lawyer']);
    expect(officeHtml(s)).toContain('data-testid="office-absence"');
  });

  it('the phone lists the lawyer, the family\'s own people and the other bosses', () => {
    const s = weekTwo('ofc6');
    const book = officePhone(s);
    expect(book[0].kind).toBe('lawyer');
    expect(book.some((p) => p.kind === 'crew')).toBe(true);
    expect(book.some((p) => p.kind === 'rival')).toBe(true);
    for (const p of book.filter((x) => x.charId)) expect(s.characters[p.charId!]).toBeTruthy();
  });

  it('the week-start setting persists; new games default to the Office, older saves to the Desk; the flag survives save and load', () => {
    const g = globalThis as { localStorage?: KV };
    const had = g.localStorage;
    g.localStorage = memKV();
    try {
      reloadSettings();
      const fresh = newGameWith('ofc7');
      expect(weekStart(fresh)).toBe('desk');
      fresh.flags[OFFICE_HOME_FLAG] = 1;
      expect(weekStart(fresh)).toBe('office');
      setSettings({ weekStart: 'map' });
      reloadSettings();
      expect(getSettings().weekStart).toBe('map');
      expect(weekStart(fresh)).toBe('map');
      setSettings({ weekStart: undefined });
      reloadSettings();
      expect(weekStart(fresh)).toBe('office');
      const kv = memKV();
      expect(saveSlot(2, fresh, kv)).toBe(true);
      const back = loadSlot(2, kv)!;
      expect(back.flags[OFFICE_HOME_FLAG]).toBe(1);
      expect(weekStart(back)).toBe('office');
      // And the week turns with the flag kept.
      expect(advanceWeek(back, {}).state.flags[OFFICE_HOME_FLAG]).toBe(1);
    } finally {
      g.localStorage = had;
      reloadSettings();
    }
  });
});
