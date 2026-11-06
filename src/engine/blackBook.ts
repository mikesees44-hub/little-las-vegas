import { bestChances } from './datingPicks';
import { ageOfChar, datingView, isAdult, pregnancyKnown, providerRows, stageOf, type PersonRow } from './dating';
import { adultOn, PROVIDER_LABEL, STAGE_LABEL, type Stage } from './datingState';
import { displayName, player } from './characters';
import { attraction, kin, romanceBetween } from './romance';
import { opinion } from './relations';
import { earOf, madamOf } from './ears';
import { WORK_LABEL } from './earsState';
import { isGoomar } from './goomar';
import { personOf, nightActionsFor, roleText } from './nightlife';
import { ADULT_ROLES, ROLE_LABEL } from './nightlifeState';
import { earnerOf, herBestFirst, titleOf } from './herway';
import { JOBS } from './payrollState';
import { payrollActionsFor } from './payroll';
import { honeyActionsFor } from './honey';
import { openApproachOf, openFixOf } from './single';
import { peekTie } from './bonds';
import { isPinned, pinnedIds } from './pins';
import { jobOf } from './dateTalk';
import { liveIn } from './apptsState';
import { DAY_SHORT } from './days';
import type { Character, GameState, PlayerAction } from './types';

/**
 * THE LITTLE BLACK BOOK: every woman in the boss's life on one page, sorted
 * into sections (a woman can be in more than one), each with her best next
 * step as an ordinary order. Entirely DERIVED from the layers that already
 * keep these lives (dating, romance, bonds, single, nightlife/goomars, the
 * Ears, payroll and hush jobs, her way, women's affairs, honey traps,
 * standing dates, ★ close people): nothing here is saved.
 *
 * Rules (the same as everywhere else): adults only (isAdult on the day; a
 * minor is never listed), no blood family, nothing explicit, she decides
 * (every action is the normal order with her odds), and with mature content
 * Off the One night and Releases sections, the adult badges and every row
 * that only those sections held are gone entirely. Pure.
 */

export type BookSection = 'interested' | 'dating' | 'onenight' | 'want' | 'releases' | 'business' | 'secrets' | 'loyal' | 'trouble';

export const BOOK_SECTIONS: { id: BookSection; label: string; blurb: string; adult?: boolean }[] = [
  { id: 'dating', label: 'Dating', blurb: 'Who you are seeing: girlfriends, your goomar, your wife, an affair.' },
  { id: 'interested', label: 'Interested', blurb: 'Women you are drawn to and have not taken out properly yet.' },
  { id: 'want', label: 'Women who want you', blurb: 'She likes you: her feelings are up, she came on to you, or Ma has a girl for you.' },
  { id: 'onenight', label: 'One night', blurb: 'A night or two and no more: nobody is anybody\'s.', adult: true },
  { id: 'releases', label: 'Releases', blurb: 'Working women you see: her price, how often, the last time. Each evening is its own agreement.', adult: true },
  { id: 'business', label: 'Business partners', blurb: 'Women who earn with you: on the payroll, in a partnership, madams, her own book.' },
  { id: 'secrets', label: 'Secrets', blurb: 'Ears on the street, wives on a quiet envelope, women who know things about you, and the ones who might be working you.' },
  { id: 'loyal', label: 'Loyal', blurb: 'She trusts you and you trust her; the ones you keep close (★).' },
  { id: 'trouble', label: 'Trouble', blurb: 'Jealous, angry, expecting, talked about, or your wife is asking questions.' },
];

export const BOOK_LABEL = Object.fromEntries(BOOK_SECTIONS.map((x) => [x.id, x.label])) as Record<BookSection, string>;

export type BadgeTone = 'rose' | 'gold' | 'amber' | 'red' | 'stone' | 'emerald' | 'sky';
export interface BookBadge { k: string; text: string; tone: BadgeTone }

export interface BookRow {
  id: string;
  name: string;
  age: number;
  /** Her role in life ("dancer at the Rhumba Terrace", "a bookkeeper on your payroll"). */
  role: string;
  /** One line: where things stand ("Dating 6 wks · fond of you"). */
  status: string;
  sections: BookSection[];
  /** The line each section shows for her (what she knows, her price, why she is trouble). */
  lines: Partial<Record<BookSection, string>>;
  /** Her opinion of him (-100..100), her attraction to him (0-100), her trust (0-100). */
  opinion: number;
  attraction: number;
  trust: number;
  badges: BookBadge[];
  /** Week she was last seen (undefined: not yet). */
  last?: number;
  lastText: string;
  close: boolean;
  /** Her best next step first (the normal orders). */
  actions: PlayerAction[];
  /** An ear: meet her. */
  ear: boolean;
  /** Sort keys. */
  into: number;
  useful: number;
}

export interface BlackBook {
  rows: BookRow[];
  counts: Record<BookSection, number>;
  /** The sections shown (the adult ones only when mature content is on). */
  sections: BookSection[];
  adult: boolean;
}

export type BookSort = 'recent' | 'into' | 'useful';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const wk = (n: number) => `${n} wk${n === 1 ? '' : 's'}`;

export function agoText(s: GameState, w: number | undefined): string {
  if (w === undefined) return 'Not yet';
  const d = s.week - w;
  return d <= 0 ? 'This week' : d === 1 ? 'Last week' : `${d} weeks ago`;
}

/** Everyone the book could hold (ids), from every layer; filtered for adults, women, not blood family. */
function candidates(s: GameState, adult: boolean): string[] {
  const ids = new Set<string>();
  const add = (id: string | undefined) => { if (id) ids.add(id); };
  const boss = player(s);
  add(boss?.spouseId);
  const D = s.dating;
  if (D) {
    for (const id of Object.keys(D.bonds)) add(id);
    for (const id of Object.keys(D.met)) add(id);
    if (adult) for (const p of Object.values(D.providers)) if (p.visits.length) add(p.id);
    for (const k of D.preg) add(k.motherId);
  }
  for (const r of s.romance?.rels ?? []) if (r.ended === undefined && (r.a === s.playerId || r.b === s.playerId)) add(r.a === s.playerId ? r.b : r.a);
  const N = s.nightlife;
  if (N) {
    for (const g of Object.values(N.goomars)) if (!g.ended) add(g.id);
    for (const p of Object.values(N.people)) if (p.status === 'active' && (p.met || p.payroll || p.role === 'madam' && N.houses[p.id]?.with === 'player')) {
      if (!adult && ADULT_ROLES.includes(p.role) && !p.payroll) continue;
      add(p.id);
    }
  }
  for (const e of Object.values(s.ears?.ears ?? {})) if (e.known && e.status !== 'gone') add(e.id);
  const m = s.ears && madamOf(s);
  if (m && adult) add(m.id);
  for (const h of Object.values(s.payroll?.hires ?? {})) add(h.id);
  for (const e of Object.values(s.herway?.e ?? {})) if (e.status === 'active' && (e.deal !== 'none' || e.own || e.enemy !== undefined)) add(e.id);
  if (adult) {
    for (const a of Object.values(s.women?.affairs ?? {})) if (a.with === s.playerId) add(a.id);
    const H = s.honey;
    if (H) {
      for (const x of Object.values(H.mistresses)) add(x.id);
      for (const x of Object.values(H.watch)) if (x.susp > 0 || x.known !== undefined) add(x.id);
      for (const x of Object.values(H.scorn)) if (x.kind === 'woman') add(x.id);
      for (const d of H.dares) if (d.out === 'yes') add(d.id);
    }
  }
  add(openApproachOf(s)?.id);
  add(openFixOf(s)?.id);
  for (const id of pinnedIds(s)) add(id);
  return [...ids].filter((id) => {
    const c = s.characters[id];
    if (!c || !c.alive || c.gender !== 'F' || id === s.playerId || !isAdult(s, c)) return false;
    if (boss && kin(boss, c)) return false;
    return true;
  });
}

/** The section rail's order of a row's sections (for the "All" view). */
const ORDER: BookSection[] = BOOK_SECTIONS.map((x) => x.id);

/** The little black book, derived from the game as it stands (adults only; adult sections only with mature content on). */
export function littleBlackBook(s: GameState): BlackBook {
  const adult = adultOn(s);
  const boss = player(s);
  const D = s.dating;
  const dv = datingView(s);
  const dRows = new Map<string, PersonRow>([...dv.relationships, ...dv.people].map((r) => [r.id, r]));
  const best = new Map(bestChances(s, 12).map((b) => [b.row.id, b.action]));
  const appr = openApproachOf(s);
  const fix = openFixOf(s);
  const provs = new Map(adult ? providerRows(s).map((p) => [p.id, p]) : []);
  const pinned = new Set(pinnedIds(s));
  const rows: BookRow[] = [];

  for (const id of candidates(s, adult)) {
    const c = s.characters[id] as Character;
    const sec = new Set<BookSection>();
    const lines: Partial<Record<BookSection, string>> = {};
    const badges: BookBadge[] = [];
    const acts: PlayerAction[] = [];
    const lasts: number[] = [];
    const put = (k: BookSection, line: string) => { sec.add(k); if (!lines[k]) lines[k] = line; };

    const st: Stage = stageOf(s, id);
    const bond = D?.bonds[id];
    const rom = boss ? romanceBetween(s, boss.id, id) : undefined;
    const tie = peekTie(s, id);
    const op = opinion(s, id, s.playerId);
    const isWife = boss?.spouseId === id;
    const goomar = s.nightlife?.goomars[id];
    const gOn = !!goomar && !goomar.ended && isGoomar(s, id);
    const np = personOf(s, id);
    const ear = earOf(s, id);
    const earKnown = !!ear && ear.known && ear.status !== 'gone';
    const hire = s.payroll?.hires[id];
    const earner = earnerOf(s, id);
    const aff = adult ? s.women?.affairs[id] : undefined;
    const affMine = aff && aff.with === s.playerId ? aff : undefined;
    const H = adult ? s.honey : undefined;
    const prov = adult ? D?.providers[id] : undefined;
    const dRow = dRows.get(id);
    if (bond?.last !== undefined) lasts.push(bond.last);
    if (D?.met[id] !== undefined) lasts.push(D.met[id]);
    if (tie?.last !== undefined) lasts.push(tie.last);
    if (affMine?.last !== undefined) lasts.push(affMine.last);
    if (ear?.meetW !== undefined) lasts.push(ear.meetW);
    if (prov?.visits.length) lasts.push(Math.max(...prov.visits));

    // Her side: attraction and trust (the bonds layer where she has a tie; the layer that knows her otherwise).
    const attr = clamp(tie?.ax.attr ?? bond?.aff ?? affMine?.aff ?? (np ? np.attach : boss ? attraction(s, c, boss).value : 0));
    const trust = clamp(tie?.ax.trust ?? (ear ? ear.loyalty : hire ? hire.loyalty : np ? np.loyalty : 50 + op / 2));

    /* Dating: girlfriends, committed, the wife, the goomar, an affair. */
    const together = st === 'dating' || st === 'committed' || st === 'married' || st === 'separated';
    if (together) {
      const since = rom ? s.week - rom.since : bond ? s.week - bond.since : 0;
      put('dating', st === 'married' ? 'Your wife' : st === 'separated' ? 'Your wife: separated' : `${STAGE_LABEL[st]} ${wk(Math.max(1, since))}`);
    }
    if (gOn && goomar) put('dating', `Your goomar since week ${goomar.since} · ${goomar.where} · ${$(goomar.rent + goomar.allowance)}/wk`);
    if (affMine && !affMine.ended && (affMine.stage === 'dating' || affMine.stage === 'affair')) put('dating', affMine.stage === 'affair' ? `An affair, ${wk(Math.max(1, s.week - affMine.since))}` : 'Seeing each other: dinners');
    const inDating = sec.has('dating');

    /* Interested: he is drawn to her and it is not a relationship yet. */
    if (!inDating && boss && st !== 'ended') {
      const his = attraction(s, boss, c).value;
      const courting = !!bond && (bond.dates > 0 || bond.rung !== 'acquaintance');
      if (courting || (dRow && his >= 20) || affMine?.stage === 'interest') {
        put('interested', courting ? `${STAGE_LABEL[st]} · ${bond!.dates} date${bond!.dates === 1 ? '' : 's'}` : his >= 35 ? 'She catches your eye' : 'You like what you see');
      }
    }

    /* Women who want you. */
    if (!inDating) {
      if (appr?.id === id) put('want', 'She came on to you: answer her');
      if (fix?.id === id) put('want', 'Ma has her picked out for you');
      if (bond && !bond.ended && (bond.aff >= 40 || bond.rung === 'attracted')) put('want', `She is ${bond.aff >= 60 ? 'very fond of you' : 'sweet on you'}`);
      else if (tie && (tie.ax.attr ?? 0) >= 60) put('want', 'She is drawn to you');
      if (np && np.attach >= 60 && !gOn) put('want', np.expects !== undefined && np.expects >= s.week ? 'Her hopes are up: she wants it to be something' : 'She is attached to you');
      if (affMine?.initiated && !affMine.ended && !inDating) put('want', 'She came to you first');
    }

    /* One night (adults; mature content on). */
    if (adult && !inDating) {
      if (affMine && affMine.n > 0) put('onenight', `${affMine.n} night${affMine.n === 1 ? '' : 's'}${affMine.ended ? ' · over' : ''}`);
      const dare = (H?.dares ?? []).filter((d) => d.id === id && d.out === 'yes');
      if (dare.length) { put('onenight', `A bold night (week ${dare[dare.length - 1].w})`); lasts.push(dare[dare.length - 1].w); }
    }

    /* Releases (adults; mature content on): the women whose company he pays for. */
    if (adult && prov && prov.status === 'working') {
      const n = prov.visits.length;
      const pr = provs.get(id);
      if (n > 0 || (np && np.met && ADULT_ROLES.includes(np.role))) {
        put('releases', `${n >= 3 ? 'A regular' : n ? `${n} evening${n === 1 ? '' : 's'}` : 'You know her'} · ${$(prov.price)} · ${pr?.reach ?? prov.venue}${n ? ` · last ${agoText(s, Math.max(...prov.visits)).toLowerCase()}` : ''}`);
      }
    } else if (adult && np && np.met && np.status === 'active' && ADULT_ROLES.includes(np.role) && np.price > 0) {
      put('releases', `${ROLE_LABEL[np.role]} · ${$(np.price)} · ${np.venue}`);
    }

    /* Business partners. */
    if (hire && hire.job !== 'hush') put('business', `On your payroll: ${JOBS[hire.job].label.toLowerCase()} · ${$(hire.wage)}/wk`);
    if (np?.payroll && (adult || !ADULT_ROLES.includes(np.role))) put('business', `Kicks back from ${np.venue}`);
    if (np?.role === 'madam' && adult) { const h = s.nightlife?.houses[id]; if (h?.with === 'player') put('business', `Her house, ${h.name}: ${h.deal === 'partner' ? 'partners with you' : 'pays for protection'}`); }
    if (earner && earner.status === 'active' && earner.deal !== 'none' && earner.side === 'player') put('business', `${titleOf(earner)} · ${earner.deal === 'partner' ? 'your partner' : earner.deal === 'protect' ? 'under your protection' : earner.deal === 'hired' ? 'works for you' : 'your ears'}`);
    if (s.women?.talent[id] && s.women.talent[id].left === undefined) put('business', `Signed with you (${s.women.talent[id].kind})`);
    if (adult && s.ears?.madam.id === id) put('business', 'The Madam: her girls, her house, her cut');

    /* Secrets: what she hears, what she knows, what she sells. */
    if (earKnown && ear) put('secrets', `An ear at ${ear.venue}: she hears it there${ear.sellsTo ? ' (and sells some of it elsewhere)' : ''}`);
    if (hire?.hush) {
      const on = s.characters[hire.hush.on];
      put('secrets', `Reports on her ${hire.hush.rel}${on ? `, ${displayName(on)}` : ''} · access ${hire.hush.access}`);
    }
    if (hire && hire.job !== 'hush' && hire.knows >= 40) put('secrets', `Knows the Family's business (${hire.knows})`);
    if (earner?.knows !== undefined && earner.knows >= 40) put('secrets', `Knows the Family's money (${earner.knows})`);
    const w = H?.watch[id];
    if (w && (w.susp > 0 || w.known !== undefined)) put('secrets', w.known !== undefined ? 'You know she was working you' : `You wonder about her (suspicion ${Math.round(w.susp)})`);
    const mis = H?.mistresses[id];
    if (mis && mis.stage >= 1 && !mis.settled) put('secrets', `She knows enough to hurt you; ${mis.mouth >= 70 ? 'a loud mouth' : mis.mouth >= 40 ? 'talks when she drinks' : 'discreet'}`);

    /* Loyal. */
    const close = pinned.has(id) || isPinned(s, id);
    if ((trust >= 70 && op >= 30) || (ear && ear.loyalty >= 70) || close) put('loyal', close ? '★ You keep her close' : `Trust ${trust}: she covers for you`);

    /* Trouble. */
    const preg = pregnancyKnown(s, id);
    const mine = preg && (preg.father === 'you' || inDating);
    if (preg) {
      const left = Math.max(0, preg.dueWeek - s.week);
      badges.push({ k: 'preg', text: `Pregnant · due in ${wk(left)}`, tone: 'rose' });
      if (mine) put('trouble', `Expecting${preg.father === 'you' ? ' your child' : ''}: due in ${wk(left)}`);
    }
    if (tie) {
      const jealous = tie.mem.some((m) => m.k === 'jealous' && s.week - m.w < 12);
      if (jealous) put('trouble', 'Jealous: she found out about another woman');
      if (tie.ax.resent >= 60) put('trouble', 'Angry with you');
      if (tie.stage === 'ultimatum') put('trouble', 'An ultimatum: her or the others');
      if (isWife && (tie.sus ?? 0) >= 35) put('trouble', `Your wife suspects (${Math.round(tie.sus ?? 0)})`);
    }
    if (gOn && goomar?.wifeKnows) put('trouble', 'Your wife knows about her');
    if (gOn && goomar?.public) put('trouble', 'It has become talk');
    if (mis && mis.stage >= 3 && !mis.settled) put('trouble', mis.stage >= 4 ? 'She is threatening to talk' : 'She is making demands');
    const sc = H?.scorn[id];
    if (sc && sc.kind === 'woman' && sc.heat >= 30) put('trouble', `A woman scorned: ${sc.why}`);
    if (ear?.sellsTo && earKnown) put('trouble', 'She sells what she hears to another family');
    if (earner?.enemy !== undefined && !earner.paidBack) put('trouble', 'You squeezed her; she has not forgotten');
    if (np && np.grudge !== undefined) put('trouble', 'Holds a grudge against you');
    if (affMine && !affMine.ended && affMine.husbandKnew !== undefined) put('trouble', 'Her husband found out');
    const rumor = (D?.rumors ?? []).filter((r) => r.about === id && s.week - r.week <= 12);
    if (rumor.length) put('trouble', `Talk going around (${rumor.length})`);
    if (rom?.secret && rom.exposure >= 50 && !rom.discovered) put('trouble', `People are starting to talk (exposure ${rom.exposure})`);
    if (op <= -30 && (inDating || sec.has('business') || sec.has('secrets'))) put('trouble', `She thinks little of you (${op})`);

    // With mature content Off a row that only the adult sections held is not shown at all.
    const shown = [...sec].filter((k) => adult || !BOOK_SECTIONS.find((x) => x.id === k)?.adult);
    if (!shown.length) continue;

    // Badges.
    if (isWife) badges.push({ k: 'wife', text: st === 'separated' ? 'Your wife (separated)' : 'Your wife', tone: 'gold' });
    const husband = c.spouseId && c.spouseId !== s.playerId ? s.characters[c.spouseId] : undefined;
    if (husband?.alive) badges.push({ k: 'married', text: `Married to ${husband.firstName}`, tone: 'stone' });
    if (gOn) badges.push({ k: 'goomar', text: 'Goomar', tone: 'rose' });
    const appts = (s.appts?.list ?? []).filter((a) => a.who === id && liveIn(s, a, s.week));
    if (appts.length) badges.push({ k: 'standing', text: `Standing date ${appts[0].cadence === 'daily' ? 'daily' : DAY_SHORT[appts[0].day]}`, tone: 'emerald' });
    if (close) badges.push({ k: 'close', text: '★', tone: 'gold' });
    if (earKnown) badges.push({ k: 'ear', text: 'Ear', tone: 'sky' });
    if (adult && prov && prov.status === 'working') badges.push({ k: 'pro', text: PROVIDER_LABEL[prov.kind], tone: 'amber' });

    // Actions: her best next step first.
    const push = (a: PlayerAction | undefined) => { if (a && !acts.some((x) => JSON.stringify(x) === JSON.stringify(a))) acts.push(a); };
    if (appr?.id === id) push({ kind: 'dating', op: { op: 'come', id, a: 'out' } });
    if (fix?.id === id) push({ kind: 'dating', op: { op: 'ma', id, a: 'meet' } });
    // A woman he courts gets the dating step first; an ear, a partner or an earner gets her own business first.
    const romantic = inDating || sec.has('interested') || sec.has('want');
    const datingSteps = () => { push(best.get(id)); if (dRow) for (const a of dRow.actions.slice(0, 2)) push(a); };
    const businessSteps = () => {
      if (earKnown && ear?.status === 'listening') push({ kind: 'ears', op: { op: 'meet', earId: id } });
      if (earner && earner.status === 'active') for (const a of herBestFirst(s, id).slice(0, 1)) push(a);
      if (np?.role === 'madam' && adult) for (const a of nightActionsFor(s, id).slice(0, 1)) push(a);
      if (hire) for (const a of payrollActionsFor(s, id).slice(0, 1)) push(a);
    };
    if (romantic) { datingSteps(); businessSteps(); } else { businessSteps(); datingSteps(); }
    if (H) for (const a of honeyActionsFor(s, id).slice(0, 1)) push(a);
    if (np && np.role !== 'madam' && (gOn || sec.has('releases') || sec.has('want'))) for (const a of nightActionsFor(s, id).slice(0, 1)) push(a);
    if (adult && provs.get(id) && !provs.get(id)!.blocked) push({ kind: 'dating', op: { op: 'paid', id } });
    // Never an adult order with mature content Off.
    const okActs = acts.filter((a) => adult || !(a.kind === 'dating' && (a.op.op === 'paid' || a.op.op === 'pro')) && !(a.kind === 'nightlife' && (a.op.op === 'car' || a.op.op === 'bold'))).slice(0, 4);

    const last = lasts.length ? Math.max(...lasts) : undefined;
    const sorted = ORDER.filter((k) => shown.includes(k));
    const head = sorted[0];
    const feel = bond ? (bond.aff >= 80 ? 'in love with you' : bond.aff >= 60 ? 'very fond of you' : bond.aff >= 40 ? 'fond of you' : bond.aff >= 25 ? 'warm' : 'polite') : op >= 40 ? 'likes you' : op <= -20 ? 'cool to you' : '';
    const role = adult && s.ears?.madam.id === id ? 'The Madam' : earKnown && ear ? `${WORK_LABEL[ear.work].toLowerCase()} at ${ear.venue}` : np ? `${roleText(s, np).toLowerCase()} · ${np.venue}` : earner ? titleOf(earner).toLowerCase() : hire ? JOBS[hire.job].label.toLowerCase() : jobOf(s, c);
    const useful = (sec.has('business') ? 30 : 0) + (sec.has('secrets') ? 25 : 0) + (ear ? ear.loyalty / 4 : 0) + (hire ? Math.min(30, hire.made / 500) : 0) + (earner ? Math.min(30, earner.income / 100) : 0) + (np?.payroll ? 15 : 0);
    rows.push({
      id, name: displayName(c), age: ageOfChar(s, c), role: role.replace(/^./, (x) => x.toUpperCase()),
      status: [lines[head], feel].filter(Boolean).join(' · '),
      sections: sorted, lines, opinion: Math.round(op), attraction: attr, trust, badges, last, lastText: agoText(s, last), close,
      actions: okActs, ear: earKnown, into: attr + op / 2 + (inDating ? 20 : 0), useful: Math.round(useful),
    });
  }
  const counts = Object.fromEntries(BOOK_SECTIONS.map((x) => [x.id, 0])) as Record<BookSection, number>;
  for (const r of rows) for (const k of r.sections) counts[k]++;
  return { rows, counts, sections: BOOK_SECTIONS.filter((x) => adult || !x.adult).map((x) => x.id), adult };
}

/** Filter and sort the book (search by name or role; one section or all). */
export function bookRows(b: BlackBook, f: { section?: BookSection | 'all'; q?: string; sort?: BookSort } = {}): BookRow[] {
  const q = (f.q ?? '').trim().toLowerCase();
  const out = b.rows.filter((r) => (!f.section || f.section === 'all' || r.sections.includes(f.section)) && (!q || r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q)));
  const sort = f.sort ?? 'recent';
  const key = (r: BookRow) => (sort === 'into' ? r.into : sort === 'useful' ? r.useful : r.last ?? -1);
  return out.slice().sort((a, b2) => key(b2) - key(a) || a.name.localeCompare(b2.name));
}
