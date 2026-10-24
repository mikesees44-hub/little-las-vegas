import { clean, deathPhrase, firstNameOf, houseOfBirth, kinWord, linMut, nameOf, plural, PLAYER_HOUSE, updPerson, type Grudge, type LineageState } from './houses';
import type { Ctx } from './ledger';
import { changeMeter, relKey, setModifier } from './relations';
import type { FactionId, GameState } from './types';

/**
 * What a death means to the houses: the dead stay in the tree with the date
 * and the cause, and a killing is remembered by the victim's whole house
 * ("You killed my uncle Sal in 1962"), in both houses' histories, for
 * generations. Called from THE death function (dynasty.ts killCharacter),
 * which also hands it the deaths of off-screen lineage people.
 */

/** The house that answers for a faction's killings. */
export function houseOfFaction(L: LineageState, f: FactionId | undefined): string | undefined {
  if (!f || f === 'none') return undefined;
  if (f === 'player') return PLAYER_HOUSE;
  for (const id of L.order) {
    const h = L.houses[id];
    if (h.faction === f && !h.crewOf && (h.dynId || f === 'law')) return id;
  }
  return undefined;
}

/** Record a death in the lineage (both kinds of people). */
export function lineageDeath(ctx: Ctx, id: string, cause: string, killer?: FactionId): void {
  const s = ctx.s;
  if (!s.lineage) return;
  const c = s.characters[id];
  if (!c) {
    const p = s.lineage.people[id];
    if (!p || p.dy !== undefined) return;
    const L = linMut(s);
    updPerson(L, id, { dy: s.date.y, dm: s.date.m, cause, killer: killer && killer !== 'none' ? houseOfFaction(L, killer) : undefined });
    const h = p.house ? L.houses[p.house] : undefined;
    if (h && h.headId === id && !h.extinct) {
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${p.first} ${p.last}, head of ${h.title}, died aged ${s.date.y - p.by} (${cause}).`, kind: 'death' });
    }
    return;
  }
  const house = houseOfBirth(s, id);
  if (!house) return;
  const kh = houseOfFaction(s.lineage, killer);
  if (!kh || kh === house) return;
  const L = linMut(s);
  const y = s.date.y;
  const t = `${nameOf(s, id)} ${deathPhrase(cause)} (${y}); ${kh === PLAYER_HOUSE ? `your house, ${L.houses[kh].title},` : `the ${plural(L.houses[kh].name)}`} ${kh === PLAYER_HOUSE ? 'is' : 'were'} blamed.`;
  const g: Grudge = { h: house, vs: kh, victim: id, y, t };
  L.grudges.push(g);
  L.events.push(clean({ y, m: s.date.m, h: house, o: kh, k: 'feud', t, p: id }));
  if (kh === PLAYER_HOUSE) rememberGrudges(s);
}

/** The opinion line a member of an aggrieved house holds against the boss for one killing. */
export function grudgeLine(s: GameState, member: string, g: Grudge): { reason: string; value: number } {
  const kin = kinWord(s, member, g.victim);
  const first = firstNameOf(s, g.victim);
  if (!kin) return { reason: `You killed ${nameOf(s, g.victim)} of my house in ${g.y}`, value: -12 };
  const close = ['father', 'mother', 'son', 'daughter', 'brother', 'sister', 'husband', 'wife'].includes(kin);
  return { reason: `You killed my ${kin} ${first} in ${g.y}`, value: close ? -40 : kin === 'cousin' || kin.startsWith('great') ? -18 : -28 };
}

/**
 * Every living Character of a house that holds a grudge against yours
 * remembers it, against whoever heads your house now. The leader of a crew
 * whose house you bled gets the grievance that turns rivals to revenge.
 */
export function rememberGrudges(s: GameState, charHouse?: Map<string, string>): void {
  const L = s.lineage;
  if (!L) return;
  const against = L.grudges.filter((g) => g.vs === PLAYER_HOUSE);
  if (!against.length) return;
  const byHouse = new Map<string, Grudge[]>();
  for (const g of against) (byHouse.get(g.h) ?? byHouse.set(g.h, []).get(g.h)!).push(g);
  const boss = s.playerId;
  for (const c of Object.values(s.characters)) {
    if (!c.alive || c.id === boss) continue;
    const h = charHouse ? charHouse.get(c.id) : houseOfBirth(s, c.id);
    const gs = h ? byHouse.get(h) : undefined;
    if (!gs) continue;
    for (const g of gs) {
      const line = grudgeLine(s, c.id, g);
      // Old blood (before your time) counts for half.
      const value = g.y < 1960 ? Math.round(line.value / 2) : line.value;
      const have = s.relations[relKey(c.id, boss)]?.modifiers.find((m) => m.reason === line.reason);
      if (have?.value !== value) setModifier(s, c.id, boss, line.reason, value);
    }
    const rival = s.rivals.find((r) => r.leaderId === c.id);
    if (rival) {
      const fresh = gs.filter((g) => g.y >= 1960 && !(g.felt ?? []).includes(c.id));
      if (fresh.length) {
        changeMeter(s, c.id, boss, 'grievance', Math.min(60, 25 * fresh.length));
        const Lm = linMut(s);
        Lm.grudges = Lm.grudges.map((g) => (fresh.includes(g) ? { ...g, felt: [...(g.felt ?? []), c.id] } : g));
      }
    }
  }
}
