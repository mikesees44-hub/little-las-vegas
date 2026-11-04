import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { buildPetition } from '../src/engine/office';
import { PETITION_TEMPLATES } from '../src/engine/petitionData';
import { buildTownPetition, openTemplates, petitionEvent, petitionVars, PETITION_PER_SEASON, PETITION_REPEAT_WEEKS, PETITION_SEASON_WEEKS, spawnPetitioner, templateWeight, townMood } from '../src/engine/petitions';
import { setDatingSettings } from '../src/engine/datingState';
import { upgradeSave } from '../src/engine/upgradeSave';
import { eventAllowed } from '../src/engine/rankView';
import type { Effect, GameState } from '../src/engine/types';

/** A game with an underboss's whole world in it, and the boss's favors to spend. */
function game(seed: string): GameState {
  const s = newGame(seed);
  s.favors = 3;
  return s;
}

const OK_TYPES = new Set(['money', 'respect', 'heat', 'opinion', 'favor', 'deed', 'rivalOpinion', 'influence', 'schedule', 'crewOpinion']);

function checkEffect(s: GameState, e: Effect, where: string): void {
  expect(OK_TYPES.has(e.type), `${where}: ${e.type}`).toBe(true);
  switch (e.type) {
    case 'money': case 'respect': case 'favor':
      expect(Number.isFinite(e.amount), where).toBe(true);
      break;
    case 'heat':
      expect(['local', 'family', 'federal']).toContain(e.bar);
      expect(Number.isFinite(e.amount), where).toBe(true);
      break;
    case 'opinion':
      expect(s.characters[e.from], `${where}: opinion from`).toBeTruthy();
      expect(e.to).toBe(s.playerId);
      expect(e.reason.length, where).toBeGreaterThan(0);
      break;
    case 'deed':
      expect(e.op.op, where).toBe('owe');
      break;
    case 'rivalOpinion':
      expect(s.rivals.some((r) => r.id === e.rival), where).toBe(true);
      break;
    case 'influence':
      expect(s.districts.some((d) => d.id === e.district), `${where}: district ${e.district}`).toBe(true);
      break;
    case 'schedule':
      expect(e.key).toBe('petition_later');
      expect(e.minWeeks).toBeGreaterThanOrEqual(1);
      expect(e.maxWeeks).toBeGreaterThanOrEqual(e.minWeeks);
      break;
    default:
      break;
  }
}

describe('the petitioners', () => {
  it('a deep bed: at least 60 templates, at least 30 of them women, each with three or four answers', () => {
    expect(PETITION_TEMPLATES.length).toBeGreaterThanOrEqual(60);
    expect(PETITION_TEMPLATES.filter((t) => t.gender === 'F').length).toBeGreaterThanOrEqual(30);
    expect(new Set(PETITION_TEMPLATES.map((t) => t.id)).size).toBe(PETITION_TEMPLATES.length);
    for (const t of PETITION_TEMPLATES) {
      expect(t.age[0], t.id).toBeGreaterThanOrEqual(18);
      expect(t.bg.length, t.id).toBeGreaterThan(0);
    }
    // The young man who wants into the life is an adult.
    expect(PETITION_TEMPLATES.find((t) => t.id === 'm_kid_life')!.age[0]).toBeGreaterThanOrEqual(18);
  });

  it('every answer of every template is a line of dialogue with valid effects, odds and a later that resolves', () => {
    const s = game('pet-valid');
    // A man of the crew inside, so the wife's petition can come.
    const man = Object.values(s.characters).find((c) => c.faction === 'player' && c.id !== s.playerId && c.gender === 'M')!;
    man.imprisonedUntil = s.week + 20;
    for (const t of PETITION_TEMPLATES) {
      const who = spawnPetitioner(s, t);
      expect(who.gender).toBe(t.gender);
      const ev = petitionEvent(s, t, who);
      expect(ev.defId).toBe(`office_${t.id}`);
      expect(ev.choices.length, t.id).toBeGreaterThanOrEqual(3);
      expect(ev.choices.length, t.id).toBeLessThanOrEqual(4);
      expect(ev.choices.some((c) => c.id === ev.defaultChoiceId)).toBe(true);
      expect(ev.meta?.charId).toBe(who.id);
      expect(ev.actors?.[0]).toBe(who.id);
      expect(ev.text.length).toBeGreaterThan(60);
      for (const c of ev.choices) {
        expect(c.label.startsWith('"'), `${t.id}/${c.id} is dialogue`).toBe(true);
        expect(c.because.length).toBeGreaterThan(0);
        for (const e of c.effects) {
          checkEffect(s, e, `${t.id}/${c.id}`);
          expect(e.label, `${t.id}/${c.id}`).toMatch(/^The office: /);
        }
      }
      // Each later's odds are real, and both its branches read.
      for (const a of t.answers(petitionVars(s, t, who, { m: ev.actors?.[1] }, false))) {
        if (!a.later) continue;
        expect(a.later.p, `${t.id}/${a.id}`).toBeGreaterThan(0);
        expect(a.later.p, `${t.id}/${a.id}`).toBeLessThanOrEqual(1);
        const lv = petitionVars(s, t, who, { m: ev.actors?.[1] }, false);
        expect(a.later.yes(lv).length).toBeGreaterThan(10);
        if (a.later.no) expect(a.later.no(lv).length).toBeGreaterThan(5);
        for (const e of [...(a.later.yesFx?.(lv) ?? []), ...(a.later.noFx?.(lv) ?? [])]) {
          checkEffect(s, e, `${t.id}/${a.id} later`);
          expect(e.label, `${t.id}/${a.id} later effects carry the consequence's own label`).toBeUndefined();
        }
      }
    }
  });

  it('no template repeats within ten weeks, and nobody comes more than twice a season, over a 52-week run', () => {
    const s = game('pet-sim');
    const seen: { t: string; w: number; who: string }[] = [];
    for (let w = 0; w < 52; w++) {
      // Two slots a week (the office and the audience), every week: far more than the game ever gives.
      for (const salt of ['office', 'audience']) {
        const ev = buildTownPetition(s, undefined, salt);
        if (ev) seen.push({ t: String(ev.meta!.pt), w: s.week, who: String(ev.meta!.charId) });
      }
      s.week++;
    }
    expect(seen.length).toBeGreaterThan(80);
    const last = new Map<string, number>();
    for (const x of seen) {
      const prev = last.get(x.t);
      if (prev !== undefined) expect(x.w - prev, x.t).toBeGreaterThanOrEqual(PETITION_REPEAT_WEEKS);
      last.set(x.t, x.w);
    }
    const per = new Map<string, number>();
    for (const x of seen) {
      const k = `${x.who}|${Math.floor(x.w / PETITION_SEASON_WEEKS)}`;
      per.set(k, (per.get(k) ?? 0) + 1);
    }
    expect(Math.max(...per.values())).toBeLessThanOrEqual(PETITION_PER_SEASON);
    // Variety: most of the bed shows up in a year.
    expect(new Set(seen.map((x) => x.t)).size).toBeGreaterThan(40);
  });

  it('the madam\'s petitions are hidden when mature content is Off', () => {
    let s = game('pet-mature');
    const mature = PETITION_TEMPLATES.filter((t) => t.mature).map((t) => t.id);
    expect(mature.length).toBeGreaterThanOrEqual(2);
    expect(openTemplates(s).some((t) => mature.includes(t.id))).toBe(true);
    s = setDatingSettings(s, { mature: 'off' });
    expect(openTemplates(s).some((t) => mature.includes(t.id))).toBe(false);
    for (const id of mature) expect(buildTownPetition(s, id)).toBeUndefined();
  });

  it('the season and the boss\'s name weigh the pool; a soldier gets only the small ones', () => {
    const s = game('pet-weights');
    s.date = { y: 1960, m: 7, d: 10 };
    const summer = PETITION_TEMPLATES.find((t) => t.season === 'summer')!;
    const winter = PETITION_TEMPLATES.find((t) => t.season === 'winter')!;
    expect(templateWeight(s, summer, 'plain')).toBeGreaterThan(templateWeight(s, winter, 'plain'));
    s.date = { y: 1961, m: 1, d: 10 };
    expect(templateWeight(s, winter, 'plain')).toBeGreaterThan(templateWeight(s, summer, 'plain'));
    const small = PETITION_TEMPLATES.find((t) => t.size === 'small' && !t.season)!;
    const desperate = PETITION_TEMPLATES.find((t) => t.size === 'desperate' && !t.season)!;
    expect(templateWeight(s, small, 'feared')).toBeLessThan(templateWeight(s, small, 'plain'));
    expect(templateWeight(s, desperate, 'feared')).toBeGreaterThan(templateWeight(s, desperate, 'plain'));
    expect(templateWeight(s, small, 'beloved')).toBeGreaterThan(templateWeight(s, small, 'plain'));
    expect(templateWeight(s, desperate, 'beloved')).toBeGreaterThan(templateWeight(s, desperate, 'plain'));
    expect(['feared', 'beloved', 'plain']).toContain(townMood(s).mood);
    // In the ranks: the neighborhood's troubles only, and they reach him.
    s.power = { ...(s.power ?? ({} as never)), station: 'soldier' } as never;
    const open = openTemplates(s);
    expect(open.length).toBeGreaterThan(10);
    expect(open.every((t) => t.low ?? t.size === 'small')).toBe(true);
    const ev = buildTownPetition(s)!;
    expect(ev.meta?.low).toBe(1);
    expect(eventAllowed(s, ev)).toBe(true);
  });

  it('answering a petition with a later consequence plays through the week and the consequence lands', () => {
    const s = game('pet-play');
    const ev = buildPetition(s, 'w_widow_headstone')!;
    expect(ev).toBeTruthy();
    s.pendingEvents = [ev];
    let r = advanceWeek(s, { choices: { [ev.iid]: 'stone' } });
    expect(r.state.chronicle.some((c) => c.text.includes('paid for a stone'))).toBe(true);
    // A later: the parish (always has a later).
    const s2 = game('pet-play2');
    const ev2 = buildPetition(s2, 'w_drink_rent')!;
    s2.pendingEvents = [ev2];
    r = advanceWeek(s2, { choices: { [ev2.iid]: 'bar' } });
    expect(r.state.scheduled.some((x) => x.key === 'petition_later')).toBe(true);
    let st = r.state;
    for (let i = 0; i < 7 && st.scheduled.some((x) => x.key === 'petition_later'); i++) st = advanceWeek(st, {}).state;
    expect(st.scheduled.some((x) => x.key === 'petition_later')).toBe(false);
    expect(st.chronicle.some((c) => c.kind === 'consequence' && c.because?.includes('cut off'))).toBe(true);
  });

  it('a fresh game has no petitions layer, and loading leaves it alone', () => {
    const s = newGame('pet-fresh');
    expect(s.petitions).toBeUndefined();
    const raw = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw)))).toBe(raw);
    // A week with a petitioner at the door (office hours guarantee one): the save is stable through load.
    let st = s;
    for (let i = 0; i < 6 && !st.petitions; i++) st = advanceWeek(st, { actions: [{ kind: 'officeHours' }] }).state;
    expect(st.petitions?.log.length).toBeGreaterThan(0);
    const raw2 = JSON.stringify(st);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw2)))).toBe(raw2);
  });
});
