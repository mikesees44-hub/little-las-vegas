import { displayName } from '../../engine/characters';
import { aStation } from '../../engine/rankView';
import { CITIES, HEISTS, SCHEME_INFO } from '../../engine/schemes';
import { BUILD_STAGES, STAGE_LABEL, lotName, underConstruction } from '../../engine/property';
import { travellers } from '../../engine/travel';
import { destOf } from '../../engine/trips';
import { pwView } from '../../engine/powerState';
import { OFFICE_BY_ID } from '../../engine/polData';
import { GROOM_PATHS } from '../../engine/heir';
import { stageLabel } from '../../engine/longgame';
import type { GameState } from '../../engine/types';
import { tickingClocks } from '../../engine/threats';
import { stormClock } from '../../engine/setPieces';
import { MISSION_DEFS } from '../../engine/missions';
import type { Route } from './routes';
import type { MapFocus } from './context';

/**
 * In Motion: every process under way, one chip each, soonest first. A pure
 * UI selector over existing state; it never mutates.
 */
export interface MotionChip {
  key: string;
  glyph: string;
  text: string;
  /** Weeks until it resolves (undefined = open-ended). */
  eta?: number;
  /** 0-100 when there is a meter. */
  progress?: number;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  route?: Route;
  charId?: string;
  focus?: Omit<MapFocus, 'nonce'>;
  /** Opens the orders popover. */
  orders?: boolean;
  /** The text already says when. */
  noEta?: boolean;
}

export function inMotion(s: GameState, ui: { orders: number } = { orders: 0 }): MotionChip[] {
  const out: MotionChip[] = [];
  const name = (id?: string) => (id && s.characters[id] ? displayName(s.characters[id]) : '');
  const safe = (f: () => void) => { try { f(); } catch { /* a pillar not initialised yet */ } };

  // Ticking clocks first (threats.ts): what a source said is coming, on its night, counting down; a strike happening now.
  safe(() => {
    const st = stormClock(s);
    if (st) out.push({ key: 'storm', glyph: '⏱', text: st.text, tone: st.days <= 1 ? 'bad' : 'warn', noEta: true, route: { home: 'desk' } as Route });
    for (const t of tickingClocks(s)) out.push({ key: t.key, glyph: '⏱', text: t.text, tone: t.days <= 1 ? 'bad' : 'warn', noEta: true, ...(t.charId ? { charId: t.charId } : { route: { home: 'desk' } as Route }) });
  });

  for (const sc of s.schemes.filter((x) => x.owner === 'player')) {
    const t = sc.targetId ? s.characters[sc.targetId] : undefined;
    const what = t ? displayName(t) : sc.opts.heist ? HEISTS[sc.opts.heist]?.name : sc.opts.city ? CITIES[sc.opts.city]?.name : '';
    out.push({
      key: `sc:${sc.id}`, glyph: sc.kind === 'murder' ? '☠' : sc.kind === 'envoy' ? '🕊' : sc.kind === 'heist' ? '💰' : '◐',
      text: `${SCHEME_INFO[sc.kind].name}${what ? ` · ${what}` : ''} ${sc.progress}%`, progress: sc.progress,
      eta: Math.max(1, Math.ceil((100 - sc.progress) / 12)), tone: sc.discovered ? 'warn' : 'neutral',
      route: { panel: 'ops', section: 'progress' }, focus: sc.opts.city ? { city: sc.opts.city, level: 'usa' } : undefined,
    });
  }
  for (const sc of s.schemes.filter((x) => x.owner !== 'player' && x.discovered)) {
    const r = s.rivals.find((x) => x.id === sc.owner);
    out.push({ key: `rs:${sc.id}`, glyph: '⚠', text: `${r?.shortName ?? 'A rival'} plot vs ${sc.targetId === s.playerId ? 'you' : name(sc.targetId) || 'you'} ${sc.progress}%`, progress: sc.progress, eta: Math.max(1, Math.ceil((100 - sc.progress) / 12)), tone: 'bad', route: { panel: 'ops', section: 'progress' } });
  }
  safe(() => {
    // The Mission Board's open cases, and answers you are waiting on.
    for (const m of (s.missions?.runs ?? []).filter((x) => !x.ended)) out.push({ key: `ms:${m.id}`, glyph: '◈', text: `${MISSION_DEFS[m.def].title}: ${m.waiting ? 'waiting on an answer' : MISSION_DEFS[m.def].stages[m.stage]?.title ?? ''}`, tone: m.waiting ? 'neutral' : 'warn', eta: m.waiting ? Math.max(1, m.waiting.until - s.week) : undefined, route: { panel: 'ops', section: 'missions' } });
    for (const p of (s.talks?.pending ?? []).filter((x) => x.kind === 'counter')) out.push({ key: `tk:${p.id}`, glyph: '☏', text: `${name(p.target)} countered`, eta: Math.max(1, p.due - s.week), tone: 'warn', route: { panel: 'ops', section: 'missions' } });
  });
  safe(() => {
    for (const l of (s.econ?.lots ?? []).filter((x) => x.owner === 'player' && underConstruction(x))) {
      const i = BUILD_STAGES.indexOf(l.stage as (typeof BUILD_STAGES)[number]);
      out.push({ key: `lot:${l.id}`, glyph: '🏗', text: `${lotName(l)}: ${STAGE_LABEL[l.stage as keyof typeof STAGE_LABEL] ?? l.stage} ${i + 1}/${BUILD_STAGES.length}${l.stalled ? ' · stalled' : ''}`, eta: (BUILD_STAGES.length - i) * 3, tone: l.stalled ? 'warn' : 'neutral', route: { panel: 'holdings', section: 'rackets' }, focus: { level: 'wildwood' } });
    }
  });
  safe(() => {
    for (const { trip: t, phase } of travellers(s)) {
      if (t.purpose === 'lam') continue;
      const left = Math.max(0, Math.ceil((t.homeDay - s.week * 7) / 7));
      out.push({ key: `trip:${t.id}`, glyph: '✈', text: `${s.characters[t.leaderId]?.firstName ?? '?'} → ${destOf(t).name}${phase === 'booked' ? ' (booked)' : ''}`, eta: left, tone: 'neutral', route: { panel: 'ops', section: 'travel' }, focus: { level: 'usa' } });
    }
  });
  const f = s.travel?.fugitives.find((x) => !x.end && x.personId === s.playerId);
  if (f) out.push({ key: 'lam', glyph: '⛓', text: `On the lam · manhunt ${Math.round(f.manhunt)}`, tone: 'bad', route: { panel: 'town', section: 'case' } });
  const lg = s.legal && s.legal.personId === s.playerId ? s.legal : undefined;
  if (lg && lg.stage !== 'quiet') out.push({ key: 'case', glyph: '⚖', text: `${stageLabel(lg)}${lg.next !== undefined ? ` · in ${Math.max(0, lg.next - s.week)} wk` : ''}`, eta: lg.next !== undefined ? lg.next - s.week : undefined, tone: lg.stage === 'investigation' || lg.stage === 'parole' ? 'warn' : 'bad', route: { panel: 'town', section: 'case' } });
  for (const d of s.disputes.filter((x) => !x.ruling)) out.push({ key: `dis:${d.id}`, glyph: '⚖', text: `Table hearing wk ${d.hearingWeek}${d.defendant === 'player' ? ' (vs you)' : ''}`, eta: d.hearingWeek - s.week, tone: d.defendant === 'player' ? 'warn' : 'neutral', route: { panel: 'diplomacy', section: 'table' } });
  for (const w of s.wars) out.push({ key: `war:${w.rival}`, glyph: '⚔', text: `War: ${s.rivals.find((r) => r.id === w.rival)?.shortName ?? w.rival} · score ${w.score}`, tone: w.score < 0 ? 'bad' : 'warn', route: { panel: 'diplomacy', section: 'table' }, focus: { mode: 'rival', level: 'wildwood' } });
  safe(() => {
    const p = pwView(s);
    if (p.crisis) out.push({ key: 'crisis', glyph: '♛', text: `Succession crisis · beat ${p.crisis.beat + 1}/${p.crisis.beats}`, eta: p.crisis.beats - p.crisis.beat, tone: 'bad', route: { panel: 'house', section: 'succession' } });
    if (p.station !== 'boss') out.push({ key: 'station', glyph: '▲', text: `You are ${p.station === 'exile' ? 'in exile' : aStation(p.station)}: climb`, tone: 'warn', route: p.above ? { panel: 'borgata', section: 'place' } : { panel: 'you', section: 'character' } });
    const g = p.designation.grooming;
    if (g) out.push({ key: 'groom', glyph: '🎓', text: `${name(g.charId)}: ${GROOM_PATHS[g.path].name.toLowerCase()} · ${Math.round((s.week - g.since) / 4.3)} mo`, tone: 'good', route: { panel: 'house', section: 'succession' } });
    for (const [id, pl] of Object.entries(p.placements)) out.push({ key: `pl:${id}`, glyph: '🎓', text: `${s.characters[id]?.firstName ?? '?'} learning: ${pl.post} · wk ${s.week - pl.since}`, tone: 'good', route: { panel: 'house', section: 'succession' } });
  });
  if (s.books) out.push(s.books.open
    ? { key: 'books', glyph: '✎', text: `The books are open · ${s.books.slots} left`, eta: Math.max(0, s.books.nextChange - s.week), tone: 'good', route: { panel: 'borgata', section: 'membership' } }
    : { key: 'books', glyph: '✎', text: `Books open in ${Math.max(0, s.books.nextChange - s.week)} wk`, eta: Math.max(0, s.books.nextChange - s.week), tone: 'neutral', route: { panel: 'borgata', section: 'membership' } });
  safe(() => {
    const now = s.date.y * 12 + s.date.m - 1;
    const soon = (s.pol?.elections ?? []).filter((x) => x.when >= now && x.when - now <= 3).sort((a, b) => a.when - b.when);
    if (soon.length) {
      const e = soon[0];
      const nm = OFFICE_BY_ID[e.office]?.title ?? e.office;
      const mo = e.when - now;
      out.push({ key: 'elections', glyph: '🗳', text: `${soon.length > 1 ? `${soon.length} elections, first: ` : ''}${nm} · ${mo === 0 ? 'this month' : `in ${mo} mo`}`, eta: mo * 4, noEta: true, tone: 'neutral', route: { panel: 'town', section: 'cityhall' } });
    }
  });
  // The weekly take: the envelope on the desk, or how the last one was split.
  const tr = s.tribute?.reports[s.tribute.reports.length - 1];
  if (tr) {
    const ub = tr.ubId ? s.characters[tr.ubId] : undefined;
    if (tr.status === 'presented') out.push({ key: 'take', glyph: '$', text: `The envelope: $${tr.presented.toLocaleString('en-US')} on your desk`, eta: 0, tone: 'warn', route: { panel: 'holdings', section: 'money' } });
    else if (tr.alloc) out.push({ key: 'take', glyph: '$', text: `${ub?.firstName ?? 'The count'}'s envelope $${tr.presented.toLocaleString('en-US')}: +$${tr.alloc.personal.toLocaleString('en-US')} your pocket · +$${(tr.alloc.treasury + tr.alloc.reserve).toLocaleString('en-US')} the Family`, eta: 0, noEta: true, tone: 'good', route: { panel: 'holdings', section: 'money' } });
  }
  // The Ears: quiet jobs, and the Madam in a squeeze.
  for (const j of s.ears?.jobs ?? []) out.push({ key: `ear:${j.id}`, glyph: '👂', text: `${s.characters[j.earId]?.firstName ?? '?'} · ${j.mode === 'close' ? 'close to' : 'a dance for'} ${name(j.targetId)}`, eta: Math.max(0, j.due - s.week), tone: 'neutral', route: { panel: 'town', section: 'night' }, charId: j.targetId });
  const sq = s.ears?.madam.squeeze;
  if (sq) out.push({ key: 'madam-sq', glyph: '♛', text: `${s.characters[s.ears!.madam.id]?.firstName ?? 'The Madam'} is squeezed · needs a friend`, eta: sq.left, tone: 'warn', route: { panel: 'town', section: 'night' } });
  const act = s.dyn?.activity;
  if (act) out.push({ key: 'act', glyph: '🎉', text: `Hosting: ${act.kind.replace(/_/g, ' ')}`, eta: act.endWeek - s.week, tone: 'good', route: { panel: 'house', section: 'activities' } });
  if (ui.orders) out.push({ key: 'orders', glyph: '☰', text: `${ui.orders} order${ui.orders > 1 ? 's' : ''} for this week`, eta: 0, tone: 'neutral', orders: true });
  return out.sort((a, b) => (a.eta ?? 99) - (b.eta ?? 99));
}
