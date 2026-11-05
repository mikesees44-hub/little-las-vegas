import { displayName, isFree, player } from '../characters';
import { holder } from '../council';
import { datingPhone } from '../dating';
import { owedBy } from '../deeds/state';
import { activeGoomars } from '../goomar';
import { phoneBook, type BookEntry } from '../phoneMeet';
import { opinion } from '../relations';
import { aboveIds, aboveLabel, chiefOf } from '../valente';
import { wifeOf } from '../bonds';
import { bestJob, hireAction, JOBS, onAnyPayroll, payrollRoster } from '../payroll';
import type { Character, GameState, PlayerAction } from '../types';

/**
 * THE BLACK BOOK (the Rolodex): everyone the boss knows, with his face, what he is to him, his mood
 * toward him, the favors owed both ways (and how old they are), the last time they had to do with each
 * other (Your File), and the quick actions: call, meet (the phone), a gift. It is the phone book grown
 * up: the people the phone can ring are read from phoneMeet.ts phoneBook (one list, never two), and the
 * book adds everyone else he knows.
 */

export type BookGroup = 'men' | 'family' | 'law' | 'rivals' | 'women' | 'business';
export const GROUP_LABEL: Record<BookGroup, string> = { men: 'My men', family: 'Family', law: 'Cops & politicians', rivals: 'Rivals', women: 'Women', business: 'Business' };
export const GROUPS: BookGroup[] = ['men', 'family', 'law', 'rivals', 'women', 'business'];

export interface Favor { by: string; to: string; w: number; y: string }

export interface Contact {
  id: string;
  charId?: string;
  name: string;
  role: string;
  group: BookGroup;
  /** His opinion of the boss (undefined: not a person the game keeps opinions for). */
  mood?: number;
  moodWord: string;
  /** Favors he owes the boss, and the boss owes him (oldest first). */
  owesMe: Favor[];
  iOwe: Favor[];
  /** Money lent either way. */
  loan?: { amt: number; due: number; mine: boolean };
  last?: { w: number; d?: number; t: string };
  /** On the phone (phoneMeet.ts phoneBook), and what it can do. */
  phone?: Pick<BookEntry, 'purposes'>;
  canGift: boolean;
  away?: string;
  /** The payroll (payroll.ts): what they are on it, or the job you could offer them now. */
  pay?: { on?: string; offer?: PlayerAction; label: string };
}

export function moodWord(v: number | undefined): string {
  if (v === undefined) return 'Business';
  return v >= 60 ? 'Devoted' : v >= 30 ? 'Warm' : v >= 10 ? 'Friendly' : v > -10 ? 'Cool' : v > -30 ? 'Sore' : v > -60 ? 'Hostile' : 'Hates you';
}

function lastContact(s: GameState, id: string): Contact['last'] {
  const es = s.journal?.e ?? [];
  for (let i = es.length - 1; i >= 0; i--) {
    const e = es[i];
    if (e.mine && e.p?.includes(id)) return { w: e.w, d: e.d, t: e.t };
  }
  return undefined;
}

/** Everyone he knows, in one list (filters are the UI's). */
export function blackBook(s: GameState): Contact[] {
  const B = s.playerId;
  const boss = player(s);
  const out: Contact[] = [];
  const seen = new Set<string>();
  const phone = new Map(phoneBook(s).map((e) => [e.id, e] as const));
  const D = s.deeds;
  const favors = (by: string, to: string): Favor[] => (D?.owed ?? []).filter((o) => o.by === by && o.to === to).sort((a, b) => a.w - b.w);
  const add = (c: Character | undefined, group: BookGroup, role: string) => {
    if (!c || !c.alive || c.id === B || seen.has(c.id)) return;
    seen.add(c.id);
    const ln = (D?.ln ?? []).find((l) => (l.by === B && l.to === c.id) || (l.to === B && l.by === c.id));
    const mood = opinion(s, c.id, B);
    const pb = phone.get(c.id);
    out.push({
      id: c.id, charId: c.id, name: displayName(c), role, group, mood, moodWord: moodWord(mood),
      owesMe: favors(c.id, B), iOwe: favors(B, c.id),
      ...(ln ? { loan: { amt: ln.amt, due: ln.due, mine: ln.by === B } } : {}),
      last: lastContact(s, c.id), ...(pb ? { phone: { purposes: pb.purposes } } : {}),
      canGift: isFree(s, c), ...(!isFree(s, c) ? { away: c.imprisonedUntil ? 'Inside' : 'Away' } : {}),
    });
  };
  // Family: his wife, his blood.
  add(wifeOf(s), 'family', 'Your wife');
  for (const c of Object.values(s.characters).filter((x) => x.dynasty && x.alive)) add(c, 'family', c.fatherId === B || c.motherId === B ? (c.gender === 'F' ? 'Your daughter' : 'Your son') : boss?.fatherId === c.id ? 'Your father' : boss?.motherId === c.id ? 'Your mother' : 'The house');
  // The women.
  for (const g of activeGoomars(s)) add(s.characters[g.id], 'women', 'Your goomar');
  for (const d of datingPhone(s)) if (d.charId && !d.adult) add(s.characters[d.charId], 'women', d.role.split(' · ')[0]);
  // His men (and below the chair, the family he is in).
  const ub = holder(s, 'underboss');
  const cons = holder(s, 'consigliere');
  add(ub, 'men', 'Your underboss');
  add(cons, 'men', 'Your consigliere');
  const chief = chiefOf(s);
  if (chief) add(chief, 'men', 'Your capo');
  for (const c of Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && !x.dynasty).sort((a, b) => rankOrd(a) - rankOrd(b) || a.lastName.localeCompare(b.lastName))) {
    if (c.outside === 'cop' || c.outside === 'politician') add(c, 'law', c.outside === 'cop' ? 'A cop on the pad' : 'A politician on the pad');
    else if (c.outside || c.frontMan) add(c, 'business', c.frontMan ? 'Front man' : c.outside === 'bookie' ? 'Bookmaker' : c.outside === 'fence' ? 'Fence' : 'Numbers runner');
    else add(c, 'men', c.rank === 'capo' ? `Capo${s.districts.find((d) => d.capoId === c.id) ? ` · ${s.districts.find((d) => d.capoId === c.id)!.name}` : ''}` : c.rank[0].toUpperCase() + c.rank.slice(1));
  }
  for (const id of aboveIds(s)) add(s.characters[id], 'men', aboveLabel(s, id) ?? 'The family');
  // The other families.
  for (const r of s.rivals) {
    if (r.kind === 'law') continue;
    add(s.characters[r.leaderId], 'rivals', r.kind === 'philly' ? 'Philadelphia' : `Boss of ${r.name}`);
  }
  // City Hall and the precinct (the people on the pad who are not characters).
  for (const [id, ctl] of Object.entries(s.pol?.ctl ?? {})) {
    const p = s.pol?.people[id];
    if (!p || !p.alive || p.retired || !(ctl.payroll || ctl.personal >= 30)) continue;
    const k = `pol:${id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const mood = Math.round((ctl.financial + ctl.personal) / 2 - ctl.resentment);
    out.push({ id: k, name: `${p.first} ${p.last}`, role: p.title, group: 'law', mood, moodWord: ctl.payroll ? `On the pad · ${moodWord(mood)}` : moodWord(mood), owesMe: [], iOwe: [], canGift: false });
  }
  // The civilian payroll (payroll.ts): everyone on it, read where it lives.
  for (const r of payrollRoster(s)) if (r.charId) add(s.characters[r.charId], r.job === 'cop' || r.job === 'politician' ? 'law' : r.job === 'girl' || r.job === 'madam' || r.job === 'hush' ? 'women' : 'business', `${r.title} · on your payroll`);
  // Anyone else he has dealt with lately (a business owner, a man in town): from his own doings in Your File.
  for (const e of (s.journal?.e ?? []).slice(-200)) {
    if (!e.mine) continue;
    for (const id of e.p ?? []) {
      const c = s.characters[id];
      if (!c || seen.has(c.id) || !c.alive) continue;
      add(c, c.gender === 'F' ? 'women' : 'business', c.faction === 'player' ? 'One of yours' : 'Somebody you know');
    }
  }
  // The payroll line on every card: on it, or the job you could offer (the odds on the card when it opens).
  for (const c of out) {
    if (!c.charId) continue;
    const on = onAnyPayroll(s, c.charId);
    if (on) { c.pay = { on, label: on }; continue; }
    const ch = s.characters[c.charId];
    const j = ch ? bestJob(s, ch) : undefined;
    if (ch && j) c.pay = { offer: hireAction(s, c.charId, j), label: j === 'hush' ? 'A quiet envelope' : `Offer a job: ${JOBS[j].label.toLowerCase()}` };
  }
  return out;
}

function rankOrd(c: Character): number {
  return ({ underboss: 0, consigliere: 1, capo: 2, soldier: 3, associate: 4 } as Record<string, number>)[c.rank] ?? 5;
}

/** The favors ledger, both ways: who owes the Don, whom he owes, with their age. */
export function favorsLedger(s: GameState): { owed: { c: Contact; f: Favor }[]; owing: { c: Contact; f: Favor }[] } {
  const book = blackBook(s);
  const byId = new Map(book.map((c) => [c.id, c] as const));
  const owed: { c: Contact; f: Favor }[] = [];
  const owing: { c: Contact; f: Favor }[] = [];
  for (const o of s.deeds?.owed ?? []) {
    if (o.to === s.playerId && byId.get(o.by)) owed.push({ c: byId.get(o.by)!, f: o });
    if (o.by === s.playerId && byId.get(o.to)) owing.push({ c: byId.get(o.to)!, f: o });
  }
  return { owed: owed.sort((a, b) => a.f.w - b.f.w), owing: owing.sort((a, b) => a.f.w - b.f.w) };
}

export { owedBy };
