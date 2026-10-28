import { previewAction } from '../../engine/actions';
import { displayName } from '../../engine/characters';
import { DAY_NAMES, DAY_SHORT, daysOf, weekPlan } from '../../engine/days';
import { deskLoans } from '../../engine/familyBank';
import { heatBand } from '../../engine/heat';
import { inbox, type InboxItem } from '../../engine/inbox';
import { actLocked, callOf, chosenOpt, docketOf, levelOf, lc, modeOf, type LtCall } from '../../engine/lieutenants';
import { stageLabel } from '../../engine/longgame';
import { BUILD_STAGES, STAGE_LABEL, lotName, underConstruction } from '../../engine/property';
import { roundOptions } from '../../engine/rounds';
import { CITIES, HEISTS, SCHEME_INFO, schemeOdds } from '../../engine/schemes';
import { urgentMeetings, RESPONSES } from '../../engine/threats';
import { hoursShort, timeBlock, timeCost } from '../../engine/timeCost';
import { travellers } from '../../engine/travel';
import { nowDay } from '../../engine/travelState';
import { destOf } from '../../engine/trips';
import { absLabel, visitPhase } from '../../engine/visit';
import { shortName } from '../../engine/visitData';
import { HEAT_BARS, type GameState, type PlayerAction } from '../../engine/types';
import { fmt$ } from '../format';
import type { MapFocus } from '../shell/context';
import { inMotion } from '../shell/inMotion';
import type { Route } from '../shell/routes';
import { orderMark } from './orderMarks';

/**
 * PLANS IN MOTION: everything the boss has going, and everything going on
 * against him, in one panel. Each row says what it is, who is on it, when it
 * lands, how far along it is, and offers the quick actions that make sense
 * (cancel, speed up, check on it, go to it). Pure: a selector over the state
 * and this week's orders; the actions are descriptions the panel carries out.
 *
 * The first group is the inbox (engine/inbox.ts): what wants the boss's word.
 * It is the same list, with the same count, as Waiting on you, the desk and
 * the door. The rest is what is under way.
 */
export type PlanGroupId = 'inbox' | 'lieutenants' | 'orders' | 'schemes' | 'trips' | 'evenings' | 'property' | 'loans' | 'threats' | 'rivals' | 'law' | 'other';
export type PlanTone = 'good' | 'warn' | 'bad' | 'neutral';

export type PlanDo =
  | { to: 'cancelOrder'; index: number }
  /** A "Do it tomorrow" order: do it today instead (the hours come off today). */
  | { to: 'today'; index: number }
  | { to: 'queue'; action: PlayerAction }
  | { to: 'route'; route: Route }
  | { to: 'sheet'; id: string }
  | { to: 'urgent'; id: string }
  | { to: 'event'; iid: string }
  | { to: 'day'; day: number }
  | { to: 'sitdown' }
  | { to: 'envelope' }
  | { to: 'city' }
  | { to: 'comeHome' }
  | { to: 'focus'; focus: Omit<MapFocus, 'nonce'> }
  | { to: 'orders' }
  /** The boss's word on a lieutenant's job (engine/lieutenants.ts). */
  | { to: 'lt'; id: string; verdict: LtCall['verdict'] | undefined; option?: string }
  | { to: 'ltSettings' };

export type PlanActId = 'cancel' | 'speed' | 'check' | 'go' | 'open' | 'approve' | 'veto' | 'change';
export interface PlanAct { id: PlanActId; label: string; do: PlanDo; disabled?: string }

export interface PlanRow {
  key: string;
  group: PlanGroupId;
  glyph: string;
  what: string;
  who?: string;
  whoId?: string;
  /** When it lands, in words ("Thursday", "in ~3 wk", "when the week turns"). */
  when: string;
  /** Days until it lands (sorting); undefined = open-ended. */
  eta?: number;
  /** 0-100 when there is a meter. */
  progress?: number;
  status: string;
  tone: PlanTone;
  acts: PlanAct[];
}

export interface PlanGroup { id: PlanGroupId; title: string; blurb: string; rows: PlanRow[] }

export const GROUP_INFO: Record<PlanGroupId, { title: string; blurb: string; glyph: string }> = {
  inbox: { title: 'Waiting on you', blurb: 'Wants your word. The same list as the door and the desk.', glyph: '▤' },
  lieutenants: { title: 'Your lieutenants this week', blurb: 'What the underboss and the consigliere will do. Stop any of it before his day.', glyph: '♞' },
  orders: { title: 'Your orders this week', blurb: 'Given; carried out when the week turns.', glyph: '☰' },
  schemes: { title: 'Schemes you are running', blurb: 'Your plots and jobs, how far along, the odds.', glyph: '◐' },
  trips: { title: 'Trips and visits', blurb: 'Who is on the road, and when they are back.', glyph: '✈' },
  evenings: { title: 'Evenings booked', blurb: 'Your nights this week.', glyph: '☾' },
  property: { title: 'Building and property', blurb: 'Construction under way, your builders.', glyph: '🏗' },
  loans: { title: 'Money on the street', blurb: 'Who owes you, and what you owe.', glyph: '$' },
  threats: { title: 'Threats against you', blurb: 'What your people heard, and the plots you uncovered.', glyph: '⚠' },
  rivals: { title: 'The other families', blurb: 'Their latest moves, wars, the Table.', glyph: '⚔' },
  law: { title: 'The law and the heat', blurb: 'Investigations, cases, how hot it is.', glyph: '⚖' },
  other: { title: 'Everything else under way', blurb: 'The rest of what is in motion.', glyph: '◈' },
};

export interface PlansUi {
  orders: readonly PlayerAction[];
  answers?: Record<string, string>;
  briefSkip?: readonly string[];
}

const TONE_OF = { red: 'bad', amber: 'warn', gold: 'neutral' } as const;

function inboxRow(it: InboxItem): PlanRow {
  if (it.ref.lt) {
    const id = it.ref.lt;
    const acts: PlanAct[] = [
      { id: 'approve', label: 'Approve', do: { to: 'lt', id, verdict: 'approve' } },
      { id: 'change', label: 'Change', do: { to: 'route', route: { home: 'week' } } },
      { id: 'veto', label: 'Veto', do: { to: 'lt', id, verdict: 'veto' } },
    ];
    return { key: `in:${it.key}`, group: 'inbox', glyph: '♞', what: it.title, who: undefined, whoId: it.charId, when: it.tone === 'red' ? 'Today' : 'This week', status: it.why, tone: TONE_OF[it.tone], acts };
  }
  const open: PlanDo = it.ref.tip ? { to: 'urgent', id: it.ref.tip }
    : it.ref.event ? { to: 'event', iid: it.ref.event }
    : it.ref.day !== undefined ? { to: 'day', day: it.ref.day }
    : it.ref.brief ? { to: 'sitdown' }
    : it.kind === 'envelope' ? { to: 'envelope' }
    : { to: 'route', route: { panel: 'town', section: 'case' } };
  const acts: PlanAct[] = [{ id: 'open', label: it.kind === 'urgent' ? 'See him' : 'Answer', do: open }];
  if (it.charId) acts.push({ id: 'go', label: 'Who is he?', do: { to: 'sheet', id: it.charId } });
  return { key: `in:${it.key}`, group: 'inbox', glyph: it.tone === 'red' ? '⚠' : it.tone === 'amber' ? '✉' : '•', what: it.title, when: it.tone === 'red' ? 'Soon' : 'This week', status: it.why, tone: TONE_OF[it.tone], acts };
}

const name = (s: GameState, id?: string) => (id && s.characters[id] ? displayName(s.characters[id]) : '');
const safe = (f: () => void) => { try { f(); } catch { /* a pillar not initialised yet */ } };
const weeksWord = (w: number) => (w <= 0 ? 'this week' : w === 1 ? 'next week' : `in ~${w} wk`);

export function plansInMotion(s: GameState, ui: PlansUi = { orders: [] }): PlanGroup[] {
  const rows: PlanRow[] = [];
  const today = daysOf(s).day;
  const daysLeft = 7 - today;

  // ---- The inbox ----
  safe(() => rows.push(...inbox(s, ui).map(inboxRow)));

  // ---- Your lieutenants this week (the jobs that run unless stopped) ----
  safe(() => {
    for (const a of docketOf(s)) {
      const call = callOf(s, a.id);
      if (actLocked(s, a) || call?.verdict === 'veto' || levelOf(s, a.domain) === 'self') continue;
      if (modeOf(s, a) === 'ask' && !call) continue; // in the inbox
      const o = chosenOpt(s, a);
      rows.push({
        key: `lt:${a.id}`, group: 'lieutenants', glyph: '♞', what: `${lc(o?.label ?? a.topic).replace(/^./, (x) => x.toUpperCase())} (${a.topic})`, who: name(s, a.byId) || undefined, whoId: a.byId,
        when: a.day === today ? 'Today' : DAY_NAMES[a.day], eta: a.day - today,
        status: `${a.seat === 'underboss' ? 'Underboss' : 'Consigliere'}${call ? (call.verdict === 'approve' ? ' · you approved' : ' · your way') : ' · on his own'}${o?.cost ? ` · ${fmt$(o.cost)} Family` : ''}`,
        tone: 'neutral',
        acts: [{ id: 'veto', label: 'Stop him', do: { to: 'lt', id: a.id, verdict: 'veto' } }, { id: 'check', label: 'Who handles what', do: { to: 'ltSettings' } }],
      });
    }
  });

  // ---- Your orders this week ----
  ui.orders.forEach((a, i) => {
    const p = previewAction(s, a);
    const m = orderMark(a);
    const hours = m?.hours ?? timeCost(a, s);
    const booked = m?.booked;
    const acts: PlanAct[] = [{ id: 'cancel', label: 'Cancel', do: { to: 'cancelOrder', index: i } }];
    if (booked !== undefined) {
      const block = timeBlock(s, a);
      acts.push({ id: 'speed', label: 'Do it today', do: { to: 'today', index: i }, disabled: block });
    }
    acts.push({ id: 'check', label: 'Orders', do: { to: 'orders' } });
    const odds = p.odds ?? p.acceptance;
    rows.push({
      key: `or:${i}`, group: 'orders', glyph: '☰', what: p.title,
      when: booked !== undefined ? `${DAY_NAMES[booked]} (booked) · lands when the week turns` : 'Today · lands when the week turns',
      eta: booked !== undefined ? Math.max(0, booked - today) : daysLeft,
      status: [hoursShort(hours), p.cost > 0 ? `${fmt$(p.cost)} ${p.pot === 'pocket' ? 'pocket' : 'Family'}` : '', odds ? `${Math.round(odds.chance * 100)}% ${p.odds ? 'odds' : 'yes'}` : ''].filter(Boolean).join(' · '),
      tone: p.disabledReason ? 'warn' : 'neutral', acts,
    });
  });

  // ---- Schemes you are running ----
  const cancelling = new Set(ui.orders.flatMap((a) => (a.kind === 'cancelScheme' ? [a.schemeId] : [])));
  for (const sc of s.schemes.filter((x) => x.owner === 'player')) {
    const t = sc.targetId ? s.characters[sc.targetId] : undefined;
    const what = t ? displayName(t) : sc.opts.heist ? HEISTS[sc.opts.heist]?.name : sc.opts.city ? CITIES[sc.opts.city]?.name : '';
    let chance: number | undefined;
    safe(() => { chance = schemeOdds(s, sc.kind, sc.targetId, sc.agents, sc.opts).chance; });
    const wks = Math.max(1, Math.ceil((100 - sc.progress) / 12));
    const agents = sc.agents.map((id) => s.characters[id]?.firstName).filter(Boolean);
    const acts: PlanAct[] = [
      { id: 'cancel', label: cancelling.has(sc.id) ? 'Calling off' : 'Call it off', do: { to: 'queue', action: { kind: 'cancelScheme', schemeId: sc.id } }, disabled: cancelling.has(sc.id) ? 'Already ordered' : undefined },
      { id: 'check', label: 'Check on it', do: { to: 'route', route: { panel: 'ops', section: 'progress' } } },
    ];
    if (t) acts.push({ id: 'go', label: 'The target', do: { to: 'sheet', id: t.id } });
    else if (sc.opts.city) acts.push({ id: 'go', label: 'Show me', do: { to: 'focus', focus: { city: sc.opts.city, level: 'usa' } } });
    rows.push({
      key: `sc:${sc.id}`, group: 'schemes', glyph: sc.kind === 'murder' ? '☠' : sc.kind === 'heist' ? '💰' : sc.kind === 'envoy' ? '🕊' : '◐',
      what: `${SCHEME_INFO[sc.kind].name}${what ? `: ${what}` : ''}`, who: agents.length ? agents.join(', ') : undefined, whoId: sc.agents[0],
      when: weeksWord(wks), eta: wks * 7, progress: sc.progress,
      status: `${sc.progress}% along${chance !== undefined ? ` · ${Math.round(chance * 100)}% odds` : ''}${sc.discovered ? ' · they know about it' : ''}`,
      tone: sc.discovered ? 'warn' : 'neutral', acts,
    });
  }

  // ---- Trips and visits ----
  const now = nowDay(s);
  safe(() => {
    for (const { trip: t, phase } of travellers(s)) {
      if (t.purpose === 'lam') continue;
      const span = Math.max(1, t.homeDay - t.departDay);
      const prog = phase === 'booked' ? 0 : Math.round(Math.max(0, Math.min(1, (now - t.departDay) / span)) * 100);
      rows.push({
        key: `trip:${t.id}`, group: 'trips', glyph: '✈', what: `${destOf(t).name}`, who: name(s, t.leaderId), whoId: t.leaderId,
        when: phase === 'booked' ? `Leaves ${absLabel(s, t.departDay)}` : `Home ${absLabel(s, t.homeDay)}`, eta: Math.max(0, (phase === 'booked' ? t.departDay : t.homeDay) - now), progress: prog,
        status: phase === 'booked' ? 'Booked' : phase === 'out' ? 'On the road there' : phase === 'there' ? 'There now' : 'On the way back', tone: 'neutral',
        acts: [{ id: 'check', label: 'Check on it', do: { to: 'route', route: { panel: 'ops', section: 'travel' } } }, { id: 'go', label: 'Show me', do: { to: 'focus', focus: { level: 'usa' } } }],
      });
    }
    for (const v of (s.travel?.visits ?? []).filter((x) => !x.over)) {
      const home = v.homeDay;
      const ph = visitPhase(s, v);
      const span = Math.max(1, (home ?? v.arriveDay + 3) - v.departDay);
      const acts: PlanAct[] = [{ id: 'open', label: 'Your agenda', do: { to: 'city' } }];
      if (v.leaveDay === undefined && now >= v.departDay) acts.push({ id: 'speed', label: 'Come home', do: { to: 'comeHome' } });
      acts.push({ id: 'go', label: 'Show me', do: { to: 'focus', focus: { level: 'usa' } } });
      rows.push({
        key: `visit:${v.id}`, group: 'trips', glyph: '🧳', what: `You: ${shortName(v.cityId)}`, who: v.party.length ? v.party.map((id) => s.characters[id]?.firstName).filter(Boolean).join(', ') : 'alone',
        when: now < v.departDay ? `Leaves ${absLabel(s, v.departDay)}` : home !== undefined ? `Home ${absLabel(s, home)}` : 'Staying on', eta: Math.max(0, (now < v.departDay ? v.departDay : home ?? now + 7) - now),
        progress: Math.round(Math.max(0, Math.min(1, (now - v.departDay) / span)) * 100),
        status: `${now < v.departDay ? 'Booked' : ph === 'out' ? 'On the road' : ph === 'there' ? 'There now' : 'Coming home'} · ${v.agenda.length} on the agenda · ${fmt$(v.spent)} spent`, tone: 'neutral', acts,
      });
    }
  });

  // ---- Evenings booked ----
  safe(() => {
    const opts = roundOptions(s);
    weekPlan(s).forEach((id, day) => {
      if (!id || day < today) return;
      const r = opts.find((x) => x.id === id);
      if (!r) return;
      rows.push({
        key: `eve:${day}`, group: 'evenings', glyph: '☾', what: r.label, who: r.who ? name(s, r.who) || undefined : undefined,
        when: day === today ? 'Tonight' : DAY_NAMES[day], eta: day - today,
        status: `${r.cost ? `${fmt$(r.cost)} pocket` : 'Costs nothing'}${r.risk ? ` · risk ${Math.round(r.risk.chance * 100)}%: ${r.risk.text}` : ''}`, tone: 'neutral',
        acts: [{ id: 'check', label: 'Change it', do: { to: 'day', day } }],
      });
    });
  });

  // ---- Building and property ----
  safe(() => {
    for (const l of (s.econ?.lots ?? []).filter((x) => x.owner === 'player' && underConstruction(x))) {
      const i = BUILD_STAGES.indexOf(l.stage as (typeof BUILD_STAGES)[number]);
      const wks = (BUILD_STAGES.length - i) * 3;
      rows.push({
        key: `lot:${l.id}`, group: 'property', glyph: '🏗', what: lotName(l), when: weeksWord(wks), eta: wks * 7,
        progress: Math.round(((i + 1) / BUILD_STAGES.length) * 100),
        status: `${STAGE_LABEL[l.stage as keyof typeof STAGE_LABEL] ?? l.stage} (${i + 1}/${BUILD_STAGES.length})${l.stalled ? ' · stalled' : ''}`, tone: l.stalled ? 'warn' : 'neutral',
        acts: [{ id: 'check', label: 'Check on it', do: { to: 'route', route: { panel: 'holdings', section: 'property' } } }, { id: 'go', label: 'Show me', do: { to: 'focus', focus: { level: 'wildwood' } } }],
      });
    }
    for (const b of Object.values(s.housing?.builds ?? {}).filter((x) => x.acct === 'family' || !!x.bizId)) {
      const l = s.econ?.lots.find((x) => x.id === b.lot);
      rows.push({
        key: `hb:${b.lot}`, group: 'property', glyph: '⌂', what: `Your builder: a ${b.use} on ${l ? l.address : 'a lot'}`, who: b.bname,
        when: 'Open-ended', progress: b.cost ? Math.round((b.paid / b.cost) * 100) : undefined,
        status: `${fmt$(b.paid)} of ${fmt$(b.cost)} paid${b.short ? ` · the family is ${b.short} wk short` : ''}`, tone: b.short ? 'warn' : 'neutral',
        acts: [{ id: 'check', label: 'Check on it', do: { to: 'route', route: { panel: 'holdings', section: 'property' } } }],
      });
    }
  });

  // ---- Money on the street ----
  const books: Route = { panel: 'holdings', section: 'books' };
  for (const l of s.loans.slice(0, 8)) {
    const due = l.dueWeek - s.week;
    rows.push({
      key: `loan:${l.id}`, group: 'loans', glyph: '$', what: `${l.borrower} owes you ${fmt$(l.principal)}`, when: due <= 0 ? 'Due now' : `Due ${weeksWord(due)}`, eta: Math.max(0, due) * 7,
      status: `${fmt$(l.vig)}/wk vig${l.weeksLate ? ` · ${l.weeksLate} wk late` : ''}${l.collateralName ? ` · against ${l.collateralName}` : ''}`, tone: l.weeksLate ? 'warn' : 'good',
      acts: [{ id: 'check', label: 'The book', do: { to: 'route', route: books } }],
    });
  }
  safe(() => {
    const desk = deskLoans(s);
    for (const x of desk.slice(0, 6)) {
      rows.push({ key: `fb:${x.d.id}`, group: 'loans', glyph: '$', what: `${x.who} owes the Family bank`, when: 'Weekly', status: `${fmt$(x.pay)}/wk${x.late ? ` · missed ${x.late}` : ''}`, tone: x.late ? 'warn' : 'good', acts: [{ id: 'check', label: 'Loan desk', do: { to: 'route', route: { panel: 'holdings', section: 'loandesk' } } }] });
    }
    if (desk.length > 6) rows.push({ key: 'fb:more', group: 'loans', glyph: '$', what: `${desk.length - 6} more Family-bank loans`, when: 'Weekly', status: 'On the loan desk', tone: 'neutral', acts: [{ id: 'check', label: 'Loan desk', do: { to: 'route', route: { panel: 'holdings', section: 'loandesk' } } }] });
  });
  for (const d of s.debts) {
    rows.push({ key: `debt:${d.id}`, group: 'loans', glyph: '−', what: `You owe ${d.lender} ${fmt$(d.principal)}`, when: `${d.weeksLeft} wk left`, eta: d.weeksLeft * 7, status: `${fmt$(d.weeklyPayment)}/wk`, tone: 'warn', acts: [{ id: 'check', label: 'The money', do: { to: 'route', route: { panel: 'holdings', section: 'money' } } }] });
  }
  for (const c of Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && x.debtTo)) {
    const r = s.rivals.find((x) => x.id === c.debtTo!.rival);
    rows.push({ key: `dt:${c.id}`, group: 'loans', glyph: '−', what: `${displayName(c)} owes ${r?.shortName ?? 'a rival'}'s shylock`, who: c.firstName, whoId: c.id, when: 'Open-ended', status: fmt$(c.debtTo!.amount), tone: 'warn', acts: [{ id: 'go', label: 'See him', do: { to: 'sheet', id: c.id } }] });
  }

  // ---- Threats against you ----
  safe(() => {
    for (const u of urgentMeetings(s)) {
      const left = u.deadline - s.week;
      rows.push({
        key: `tip:${u.id}`, group: 'threats', glyph: '⚠', what: u.status === 'waiting' ? `${u.who} heard something` : u.hint, who: u.who, whoId: u.charId,
        when: u.when, eta: Math.max(0, left) * 7,
        status: u.status === 'waiting' ? 'Wants a meeting' : u.response ? `Your answer: ${RESPONSES[u.response].label} (done when the week turns)` : `${u.via === 'boss' ? 'You met him' : 'Your man met him'}: no answer yet`,
        tone: u.status === 'waiting' || !u.response ? 'bad' : 'warn',
        acts: [{ id: 'open', label: u.status === 'waiting' ? 'See him' : 'The meeting', do: { to: 'urgent', id: u.id } }],
      });
    }
  });
  for (const sc of s.schemes.filter((x) => x.owner !== 'player' && x.discovered)) {
    const r = s.rivals.find((x) => x.id === sc.owner);
    const vs = sc.targetId === s.playerId ? 'you' : name(s, sc.targetId) || 'your family';
    const wks = Math.max(1, Math.ceil((100 - sc.progress) / 12));
    rows.push({
      key: `rs:${sc.id}`, group: 'threats', glyph: '☠', what: `${r?.shortName ?? 'A rival'}: ${SCHEME_INFO[sc.kind].name.toLowerCase()} against ${vs}`, when: weeksWord(wks), eta: wks * 7, progress: sc.progress,
      status: `${sc.progress}% ready`, tone: 'bad',
      acts: [{ id: 'check', label: 'Check on it', do: { to: 'route', route: { panel: 'ops', section: 'progress' } } }, ...(sc.targetId && sc.targetId !== s.playerId ? [{ id: 'go' as const, label: 'Warn him', do: { to: 'sheet' as const, id: sc.targetId } }] : [])],
    });
  }

  // ---- The other families ----
  for (const r of s.rivals.filter((x) => x.lastMove && s.week - x.lastMove.week <= 3).sort((a, b) => b.lastMove!.week - a.lastMove!.week)) {
    const m = r.lastMove!;
    const vsYou = m.target === 'player';
    rows.push({
      key: `rv:${r.id}`, group: 'rivals', glyph: vsYou ? '⚔' : '·', what: `${r.shortName}: ${m.text}`, when: s.week - m.week <= 0 ? 'This week' : `${s.week - m.week} wk ago`,
      status: vsYou ? 'Against you' : 'Elsewhere', tone: vsYou ? (m.move === 'strike' ? 'bad' : 'warn') : 'neutral',
      acts: [{ id: 'go', label: 'Show me', do: { to: 'focus', focus: { mode: 'rival', level: 'wildwood' } } }, ...(r.leaderId ? [{ id: 'check' as const, label: 'Their boss', do: { to: 'sheet' as const, id: r.leaderId } }] : [])],
    });
  }
  for (const w of s.wars) {
    rows.push({ key: `war:${w.rival}`, group: 'rivals', glyph: '⚔', what: `War: ${s.rivals.find((r) => r.id === w.rival)?.shortName ?? w.rival}`, when: 'Open-ended', status: `Score ${w.score}`, tone: w.score < 0 ? 'bad' : 'warn', acts: [{ id: 'check', label: 'The Table', do: { to: 'route', route: { panel: 'diplomacy', section: 'table' } } }, { id: 'go', label: 'Show me', do: { to: 'focus', focus: { mode: 'rival', level: 'wildwood' } } }] });
  }
  for (const d of s.disputes.filter((x) => !x.ruling)) {
    rows.push({ key: `dis:${d.id}`, group: 'rivals', glyph: '⚖', what: `At the Table: ${d.claim}`, when: `Week ${d.hearingWeek}`, eta: Math.max(0, d.hearingWeek - s.week) * 7, status: d.defendant === 'player' ? 'Against you' : 'Your claim', tone: d.defendant === 'player' ? 'warn' : 'neutral', acts: [{ id: 'check', label: 'The Table', do: { to: 'route', route: { panel: 'diplomacy', section: 'table' } } }] });
  }

  // ---- The law and the heat ----
  const caseRoute: Route = { panel: 'town', section: 'case' };
  const lg = s.legal && s.legal.personId === s.playerId ? s.legal : undefined;
  if (lg && lg.stage !== 'quiet') rows.push({ key: 'case', group: 'law', glyph: '⚖', what: stageLabel(lg), when: lg.next !== undefined ? weeksWord(lg.next - s.week) : 'Open-ended', eta: lg.next !== undefined ? Math.max(0, lg.next - s.week) * 7 : undefined, status: `Defense ${Math.round(lg.defense)}`, tone: lg.stage === 'investigation' || lg.stage === 'parole' ? 'warn' : 'bad', acts: [{ id: 'check', label: 'Your case', do: { to: 'route', route: caseRoute } }] });
  const f = s.travel?.fugitives.find((x) => !x.end && x.personId === s.playerId);
  if (f) rows.push({ key: 'lam', group: 'law', glyph: '⛓', what: 'You are on the lam', when: 'Open-ended', status: `Manhunt ${Math.round(f.manhunt)}`, tone: 'bad', acts: [{ id: 'check', label: 'Your case', do: { to: 'route', route: caseRoute } }] });
  for (const b of HEAT_BARS) {
    const v = s.heat[b];
    if (v < 40) continue;
    const band = heatBand(v);
    rows.push({ key: `heat:${b}`, group: 'law', glyph: '♨', what: `${b === 'local' ? 'The cops' : b === 'federal' ? 'The FBI' : 'Philadelphia'}: ${b} heat ${v}`, when: v >= 80 ? 'Now' : 'Rising', progress: v, status: v >= 80 ? (b === 'local' ? 'Raids at 80' : b === 'federal' ? 'Arrests at 80' : 'They summon you at 80') : `${band}`, tone: v >= 70 ? 'bad' : 'warn', acts: [{ id: 'check', label: 'What to do', do: { to: 'route', route: caseRoute } }, { id: 'go', label: 'Heat map', do: { to: 'focus', focus: { mode: 'heat', level: 'wildwood' } } }] });
  }
  for (const c of Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && (x.evidence ?? 0) >= 65)) {
    rows.push({ key: `ev:${c.id}`, group: 'law', glyph: '🗂', what: `The file on ${displayName(c)}`, who: c.firstName, whoId: c.id, when: 'Open-ended', progress: Math.round(c.evidence ?? 0), status: `${Math.round(c.evidence ?? 0)}/100: men under pressure talk`, tone: 'warn', acts: [{ id: 'go', label: 'See him', do: { to: 'sheet', id: c.id } }] });
  }

  // ---- Everything else in motion (the In Motion strip's other chips) ----
  const covered = /^(sc:|rs:|lot:|trip:|orders$|lam$|case$|war:|dis:)/;
  safe(() => {
    for (const c of inMotion(s, { orders: 0 }).filter((x) => !covered.test(x.key))) {
      const acts: PlanAct[] = [];
      if (c.route) acts.push({ id: 'check', label: 'Check on it', do: { to: 'route', route: c.route } });
      if (c.charId) acts.push({ id: 'go', label: 'See them', do: { to: 'sheet', id: c.charId } });
      if (c.focus) acts.push({ id: 'go', label: 'Show me', do: { to: 'focus', focus: c.focus } });
      rows.push({ key: `mo:${c.key}`, group: 'other', glyph: c.glyph, what: c.text, when: c.eta === undefined ? 'Open-ended' : c.noEta ? '' : weeksWord(c.eta), eta: c.eta !== undefined ? c.eta * 7 : undefined, progress: c.progress, status: '', tone: c.tone, acts });
    }
  });

  const order: PlanGroupId[] = ['inbox', 'lieutenants', 'threats', 'orders', 'schemes', 'trips', 'evenings', 'property', 'loans', 'rivals', 'law', 'other'];
  return order.map((id) => ({ id, title: GROUP_INFO[id].title, blurb: GROUP_INFO[id].blurb, rows: rows.filter((r) => r.group === id).sort((a, b) => (id === 'inbox' ? 0 : (a.eta ?? 999) - (b.eta ?? 999))) })).filter((g) => g.rows.length);
}

/** The badge: how many things are under way (the inbox counts on its own, as Waiting on you). */
export function plansCount(groups: readonly PlanGroup[]): { motion: number; inbox: number; danger: boolean } {
  const motion = groups.filter((g) => g.id !== 'inbox').reduce((a, g) => a + g.rows.length, 0);
  const inboxN = groups.find((g) => g.id === 'inbox')?.rows.length ?? 0;
  return { motion, inbox: inboxN, danger: groups.some((g) => g.rows.some((r) => r.tone === 'bad')) };
}

export { DAY_SHORT };
