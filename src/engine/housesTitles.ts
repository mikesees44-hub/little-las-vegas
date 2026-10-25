import { clean, houseOfBirth, linMut, updLink, updPerson, type LineageState } from './houses';
import { getPerson } from './polPeople';
import type { GameState, Rank } from './types';

/**
 * Titles over time: what each member of a house held, and when. A made man's
 * rise (made, capo, underboss, boss), an office taken, a world figure's new
 * post (a councilman who became mayor, a singer who became a headliner) go
 * into his titles with the year and into the house's history, so the tree
 * remembers them after he is gone.
 */

const RANK_TITLE: Record<Exclude<Rank, 'civilian'>, string> = {
  associate: 'Associate', soldier: 'Made man', capo: 'Capo', consigliere: 'Consigliere', underboss: 'Underboss', boss: 'Boss',
};

function outfit(s: GameState, faction: string): string {
  if (faction === 'player') return `the ${s.houseName} family`;
  const r = s.rivals.find((x) => x.id === faction);
  return r ? r.name : '';
}

function addTitle(s: GameState, L: LineageState, id: string, title: string, event: boolean): void {
  const c = s.characters[id];
  const cur = c ? L.links[id]?.titles ?? [] : L.people[id]?.titles ?? [];
  if (cur.includes(title)) return;
  if (c) updLink(L, id, { titles: [...cur, title] });
  else updPerson(L, id, { titles: [...cur, title] });
  if (!event) return;
  const h = c ? houseOfBirth(s, id) : L.people[id]?.house;
  if (!h || !L.houses[h]) return;
  const name = c ? `${c.firstName} ${c.lastName}` : `${L.people[id].first} ${L.people[id].last}`;
  L.events.push(clean({ y: s.date.y, m: s.date.m, h, k: 'title' as const, t: `${name}: ${title}.`, p: id }));
}

/** Monthly: rank and office changes of the engine's people with a house; yearly: the world's people in the trees. */
export function housesTitles(s: GameState): void {
  const L0 = s.lineage;
  if (!L0) return;
  let L: LineageState | undefined;
  const mut = () => (L ??= linMut(s));
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.alive) continue;
    const link = L0.links[id];
    const rank = c.rank === 'civilian' ? '' : c.rank;
    const office = c.office ?? '';
    const key = `${rank}|${office}|${rank ? c.faction : ''}`;
    if ((link?.rk ?? '||') === key) continue;
    // First sight (an old save, a newcomer): remember quietly.
    if (link?.rk === undefined) {
      updLink(mut(), id, { rk: key });
      continue;
    }
    const [pr, po] = link.rk.split('|');
    const Lm = mut();
    if (rank && rank !== pr) {
      const of = outfit(s, c.faction);
      addTitle(s, Lm, id, `${RANK_TITLE[rank as Exclude<Rank, 'civilian'>]}${of ? ` of ${of}` : ''}, ${s.date.y}`, rank !== 'associate');
    }
    if (office && office !== po) addTitle(s, Lm, id, `${office}, ${s.date.y}`, true);
    updLink(Lm, id, { rk: key });
  }
  // The world's people (politicians, judges, entertainers) who are in the trees: once a year.
  if (s.date.m === 1 && s.pol && L0.wy !== s.date.y) {
    const Lm = mut();
    Lm.wy = s.date.y;
    for (const id in Lm.people) {
      if (id.charCodeAt(0) === 76 /* 'L' */) continue;
      const p = Lm.people[id];
      if (p.dy !== undefined) continue;
      const w = getPerson(s, id);
      if (!w?.alive || !w.title) continue;
      const titles = p.titles ?? [];
      if (titles.some((t) => t === w.title || t.startsWith(`${w.title},`))) continue;
      addTitle(s, Lm, id, `${w.title}, ${s.date.y}`, true);
    }
  }
}
