import { describe, expect, it } from 'vitest';
import { killCharacter } from '../src/engine/dynasty';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { houseOfBirth, kinWord, PLAYER_HOUSE } from '../src/engine/houses';
import { grudgeLine } from '../src/engine/housesDeath';
import { PACK_DYNASTIES } from '../src/engine/housesPackData';
import { familyView, houseIndex, houseSummaries, houseTimeline, houseTree, validateHouses, type PNode } from '../src/engine/housesView';
import { newCtx } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { opinionBreakdown } from '../src/engine/relations';
import type { GameState } from '../src/engine/types';
import { randomChoices } from './helpers';

function nodes(s: GameState): PNode[] {
  return [...houseIndex(s).nodes.values()];
}

/** Every invariant the trees must keep, as a list of problems (housesView.validateHouses). */
const treeProblems = validateHouses;

function play(s: GameState, weeks: number, salt = 0): GameState {
  for (let i = 0; i < weeks && !s.gameOver; i++) s = advanceWeek(s, randomChoices(s, i + salt)).state;
  return s;
}

describe('the houses at the start', () => {
  const s = newGame('houses-a');

  it('every kind of house is a dynasty with a tree: 40+ houses and 1,500+ people', () => {
    const L = s.lineage!;
    expect(L.order.length).toBeGreaterThanOrEqual(40);
    expect(nodes(s).length).toBeGreaterThanOrEqual(1500);
    const ids = new Set(L.order);
    for (const id of [PLAYER_HOUSE, 'h_manno', 'h_feldstein', 'h_kessler', 'h_moretti', 'h_carbone', 'h_nardella', 'h_dougherty', 'h_pruitt', 'h_albanese', 'h_keane', 'h_weiss', 'h_donnelly']) expect(ids.has(id), id).toBe(true);
    // The political and police dynasties: the world pack's, under the names the design asks for.
    const names = new Set(L.order.map((id) => L.houses[id].name));
    for (const n of ['Callahan', 'DeLuca', 'Whitcomb', 'Mercer', 'Greco', 'Ferraro', 'Rosenfeld', "O'Hara", 'Pembroke', 'Halbrook', 'Bell', 'Vassallo', 'Katz', 'Sterling', 'Whitaker', 'Russo', 'Hensley', 'Doyle']) expect(names.has(n), n).toBe(true);
    // Crew houses: the made men's families, theirs and the rivals'.
    const crew = L.order.map((id) => L.houses[id]).filter((h) => h.crewOf);
    expect(crew.some((h) => h.faction === 'player')).toBe(true);
    expect(crew.some((h) => h.faction !== 'player')).toBe(true);
    for (const t of ['crime', 'political', 'police', 'legit', 'showbiz'] as const) expect(L.order.some((id) => L.houses[id].type === t), t).toBe(true);
  });

  it('history goes back to the 1870s-1890s founders, with the dead in the tree', () => {
    const L = s.lineage!;
    const founded = L.order.map((id) => L.houses[id].founded);
    expect(Math.min(...founded)).toBeLessThan(1880);
    expect(founded.filter((y) => y <= 1900).length).toBeGreaterThan(L.order.length / 2);
    for (const id of L.order) {
      const h = L.houses[id];
      expect(h.founderId, h.title).toBeTruthy();
      const t = houseTree(s, id);
      expect(t.root, h.title).toBeTruthy();
      expect(t.gens.length, `${h.title} generations`).toBeGreaterThanOrEqual(2);
    }
    const dead = nodes(s).filter((n) => !n.alive);
    expect(dead.length).toBeGreaterThan(300);
    const causes = dead.map((n) => n.cause ?? '');
    for (const c of ['1918 influenza', 'old age']) expect(causes.some((x) => x === c), c).toBe(true);
    expect(causes.some((x) => /Argonne|Belleau|France|Tuscania|Château/.test(x)), 'WWI').toBe(true);
    expect(causes.some((x) => /Normandy|Anzio|Guadalcanal|Okinawa|Iwo Jima|Ardennes|Germany|Juneau|Kasserine|Cassino/.test(x)), 'WWII').toBe(true);
    expect(causes.some((x) => /Castellammarese/.test(x)), 'Castellammarese troubles 1931').toBe(true);
    // Gentle infant mortality: some, not many.
    const infants = dead.filter((n) => (n.dy ?? 0) - n.by <= 1).length;
    expect(infants).toBeGreaterThan(5);
    expect(infants / nodes(s).length).toBeLessThan(0.08);
  });

  it('no cycles; parents 15+ years older; the dead have a year and a cause; marriages symmetric', () => {
    expect(treeProblems(s)).toEqual([]);
  });

  it('trees interlock: marriages across houses, recorded in both histories', () => {
    const idx = houseIndex(s);
    let across = 0;
    for (const n of idx.nodes.values()) for (const sp of n.sp) if (n.house && idx.nodes.get(sp)?.house && idx.nodes.get(sp)!.house !== n.house) across++;
    expect(across / 2).toBeGreaterThan(25);
    const L = s.lineage!;
    const m = L.events.find((e) => e.k === 'marriage' && e.o && e.o !== e.h)!;
    expect(houseTimeline(s, m.h).some((e) => e.text === m.t)).toBe(true);
    expect(houseTimeline(s, m.o!).some((e) => e.text === m.t)).toBe(true);
  });

  it('history is attached above and around the living characters, never replacing them', () => {
    const plain = newGame('houses-a', { skipHouses: true });
    // The dating roster is made after the houses' history (its own dice), so its women get other ids: same count, both ways.
    const roster = new Set(Object.keys(plain.dating?.providers ?? {}));
    expect(Object.keys(s.dating?.providers ?? {}).length).toBe(roster.size);
    for (const c of Object.values(plain.characters).filter((x) => !roster.has(x.id))) {
      const now = s.characters[c.id];
      expect(now, c.firstName).toBeTruthy();
      expect(`${now.firstName} ${now.lastName} ${now.birth.y}`).toBe(`${c.firstName} ${c.lastName} ${c.birth.y}`);
      if (c.fatherId) expect(now.fatherId).toBe(c.fatherId);
      if (c.spouseId) expect(now.spouseId).toBe(c.spouseId);
    }
    // The rivals' bosses have generated parents and a founder above them.
    for (const r of s.rivals) {
      const f = familyView(s, r.leaderId);
      expect(f.parents.length, r.name).toBeGreaterThan(0);
    }
    // Pack people keep their own records.
    const paddy = houseIndex(s).nodes.get('pol_paddy_callahan')!;
    expect(paddy.dy).toBe(1949);
    expect(paddy.house).toBe('h_callahan');
  });

  it('titles held: past heads carry the offices and rackets of their day', () => {
    const L = s.lineage!;
    let titled = 0;
    for (const id of L.order) for (const hd of L.houses[id].heads.slice(0, -1)) if ((houseIndex(s).nodes.get(hd.id)?.titles.length ?? 0) > 0) titled++;
    expect(titled).toBeGreaterThan(20);
  });

  it('crew men\'s households (wives and kids) are in their houses\' trees', () => {
    const L = s.lineage!;
    let checked = 0;
    for (const h of L.order.map((id) => L.houses[id]).filter((x) => x.crewOf)) {
      const c = s.characters[h.crewOf!];
      if (!c?.household?.kids.length) continue;
      const kids = familyView(s, c.id).children.map((k) => k.first);
      for (const k of c.household.kids) expect(kids, `${c.firstName} ${c.lastName}`).toContain(k.name);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is deterministic per seed, and other starts build houses too', () => {
    const a = newGame('houses-det');
    const b = newGame('houses-det');
    expect(JSON.stringify(a.lineage)).toBe(JSON.stringify(b.lineage));
    expect(JSON.stringify(newGame('houses-det2').lineage)).not.toBe(JSON.stringify(a.lineage));
    const sees = newGameWith('houses-sees', 'sees');
    expect(sees.lineage!.houses[PLAYER_HOUSE].name).toBe('Sees');
    expect(treeProblems(sees)).toEqual([]);
  });

  it('the world pack plugged in: every pack dynasty is a house', () => {
    const L = s.lineage!;
    for (const d of PACK_DYNASTIES) expect(L.order.some((id) => id === `h_${d.id}`), d.id).toBe(true);
  });
});

describe('the houses keep living', () => {
  const start = newGame('houses-life');
  const s = play(cloneState(start), 52 * 4);

  it('non-player houses have births, marriages, deaths and successions off-screen', () => {
    const L0 = start.lineage!;
    const L = s.lineage!;
    const since = (k: string) => L.events.filter((e) => e.k === k && e.y >= 1960 && !L0.events.includes(e) && e.h !== PLAYER_HOUSE);
    const idx = houseIndex(s);
    const born = [...idx.nodes.values()].filter((n) => n.by >= 1961 && n.house && n.house !== PLAYER_HOUSE);
    expect(born.length).toBeGreaterThan(10);
    expect(since('marriage').length).toBeGreaterThan(5);
    const died = [...idx.nodes.values()].filter((n) => !n.alive && (n.dy ?? 0) >= 1960 && n.house && n.house !== PLAYER_HOUSE);
    expect(died.length).toBeGreaterThan(5);
    for (const n of died) expect(n.cause, `${n.first} ${n.last}`).toBeTruthy();
    expect(since('succession').length).toBeGreaterThan(0);
    // Every house still standing has a living head.
    for (const id of L.order) {
      const h = L.houses[id];
      if (h.extinct !== undefined || h.player) continue;
      const head = idx.nodes.get(h.headId ?? '');
      expect(head?.alive, `${h.title} head`).toBe(true);
    }
    expect(treeProblems(s)).toEqual([]);
  });

  it('the dead stay in the tree', () => {
    const before = new Set([...houseIndex(start).nodes.values()].filter((n) => !n.alive).map((n) => n.id));
    const idx = houseIndex(s);
    for (const id of before) expect(idx.nodes.get(id)?.alive, id).toBe(false);
    expect(houseSummaries(s).reduce((a, x) => a + x.dead, 0)).toBeGreaterThan(houseSummaries(start).reduce((a, x) => a + x.dead, 0));
  });
});

describe('feuds carry through families', () => {
  it('a killing by your house is remembered by the victim\'s kin, with a reason, in both house histories', () => {
    const s = cloneState(newGame('houses-feud'));
    const L = s.lineage!;
    // A Manno man with living kin: a brother of the boss, or one of his sons.
    const manno = s.rivals.find((r) => r.id === 'manno')!;
    const boss = s.characters[manno.leaderId];
    const victim = Object.values(s.characters).find((c) => c.alive && c.id !== boss.id && houseOfBirth(s, c.id) === 'h_manno' && kinWord(s, boss.id, c.id))
      ?? Object.values(s.characters).find((c) => c.alive && c.faction === 'manno' && c.id !== boss.id)!;
    const ctx = newCtx(s);
    killCharacter(ctx, victim.id, 'shot on the Wildwood boardwalk', 'player');
    const g = s.lineage!.grudges.find((x) => x.victim === victim.id);
    expect(g).toBeTruthy();
    expect(g!.vs).toBe(PLAYER_HOUSE);
    const vh = g!.h;
    expect(houseTimeline(s, vh).some((e) => e.kind === 'feud' && e.who === victim.id)).toBe(true);
    expect(houseTimeline(s, PLAYER_HOUSE).some((e) => e.kind === 'feud' && e.who === victim.id)).toBe(true);
    // Kin hold it against you with a named reason.
    const kin = Object.values(s.characters).filter((c) => c.alive && c.id !== s.playerId && houseOfBirth(s, c.id) === vh);
    expect(kin.length).toBeGreaterThan(0);
    const reasons = kin.flatMap((c) => opinionBreakdown(s, c.id, s.playerId).mods.map((m) => m.reason)).filter((r) => r.startsWith('You killed'));
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.some((r) => new RegExp(`You killed my \\w[\\w-]* ${victim.firstName} in ${s.date.y}`).test(r) || r.includes(victim.firstName))).toBe(true);
    void L;
  });

  it('revenge can come generations later: the victim\'s grandchildren still remember', () => {
    let s = cloneState(newGame('houses-feud2'));
    const victim = Object.values(s.characters).find((c) => c.alive && c.faction === 'manno' && c.rank !== 'boss' && houseOfBirth(s, c.id))!;
    killCharacter(newCtx(s), victim.id, 'shot behind the Starlight Ballroom', 'player');
    const g = s.lineage!.grudges.find((x) => x.victim === victim.id)!;
    // A child born into that house years later.
    s = play(s, 52 * 3, 7);
    const idx = houseIndex(s);
    const young = [...idx.nodes.values()].filter((n) => n.house === g.h && n.by > 1960 && n.alive);
    const anyKin = [...idx.nodes.values()].filter((n) => n.house === g.h && n.alive && n.id !== victim.id);
    expect(anyKin.length).toBeGreaterThan(0);
    for (const n of [...young, ...anyKin].slice(0, 20)) {
      const line = grudgeLine(s, n.id, g);
      expect(line.reason.startsWith('You killed')).toBe(true);
      expect(line.value).toBeLessThan(0);
    }
    // The grudge is still on the books.
    expect(s.lineage!.grudges.some((x) => x.victim === victim.id)).toBe(true);
  });
});

describe('the living extended family', () => {
  it('your house has a matriarch, uncles and aunts, cousins (a priest, a cop, one who wants in), an in-law, godchildren, as real characters', async () => {
    const { kinByRole } = await import('../src/engine/housesKin');
    const { interactionsFor } = await import('../src/engine/interactions');
    for (const seed of ['kin-1', 'kin-2', 'kin-3']) {
      const s = newGame(seed);
      const mine = (r: Parameters<typeof kinByRole>[1]) => kinByRole(s, r, 'player');
      expect(mine('matriarch').length, `${seed} matriarch`).toBe(1);
      expect(mine('matriarch')[0].gender).toBe('F');
      expect(mine('uncle').length + mine('aunt').length, `${seed} uncles/aunts`).toBeGreaterThanOrEqual(1);
      for (const r of ['priest', 'cop'] as const) expect(kinByRole(s, r).length, `${seed} ${r}`).toBeGreaterThanOrEqual(1);
      expect(kinByRole(s, 'wantsIn').length, `${seed} wants in`).toBeGreaterThanOrEqual(1);
      expect(kinByRole(s, 'inlaw').length, `${seed} in-law`).toBe(1);
      expect(kinByRole(s, 'godchild').length, `${seed} godchild`).toBeGreaterThanOrEqual(1);
      // The women have roles of their own.
      const women = Object.values(s.characters).filter((c) => c.alive && c.gender === 'F' && c.kinRoles?.some((r) => ['front', 'church', 'numbers', 'advisor', 'match', 'power'].includes(r)));
      expect(women.length, `${seed} women with roles`).toBeGreaterThanOrEqual(3);
      // Everyone cast is a Character you can deal with, in the tree, and the trees still hold.
      for (const c of Object.values(s.characters).filter((x) => x.kinRoles?.length)) {
        expect(c.alive).toBe(true);
        expect(houseIndex(s).nodes.get(c.id)?.char).toBe(true);
        expect(interactionsFor(s, c.id).length, `${c.firstName} ${c.lastName}`).toBeGreaterThan(0);
      }
      expect(validateHouses(s)).toEqual([]);
      // The rival bosses have a matriarch too.
      expect(kinByRole(s, 'matriarch').length).toBeGreaterThanOrEqual(3);
    }
  });
});
