import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { advanceWeek } from '../src/engine/engine';
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
