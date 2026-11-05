import { displayName } from './characters';
import { stormWarnings } from './storms';
import { obligations } from './tribute';
import { HEAT_BARS, type GameState, type HeatBar, type WeeklyReport } from './types';

/**
 * WHAT CHANGED? (EASIER_NOT_SHALLOWER #15): after every week's turn, three to five lines: the money up or
 * down and mostly why, who is angrier with him, what is new, what is due. Read from the week's report
 * (s.lastReport), the opinions his people formed that week, the new decisions and the bills. Pure.
 */

export interface DiffLine {
  id: 'money' | 'standing' | 'angry' | 'new' | 'due' | 'storm';
  text: string;
  tone: 'good' | 'bad' | 'neutral';
}

const usd = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const HEAT_NAME: Record<HeatBar, string> = { local: 'local', family: 'family', federal: 'federal' };

/** Whose opinion of the boss soured in the week just played (the people who matter), worst first. */
export function angrierThisWeek(s: GameState, week = s.lastReport?.week ?? s.week - 1): { id: string; name: string; by: number; why: string }[] {
  const out: { id: string; name: string; by: number; why: string }[] = [];
  for (const r of Object.values(s.relations ?? {})) {
    if (r.to !== s.playerId) continue;
    const c = s.characters[r.from];
    if (!c?.alive) continue;
    const matters = c.faction === 'player' ? c.rank !== 'civilian' || !!c.dynasty : c.rank === 'boss';
    if (!matters && !c.dynasty) continue;
    const mods = r.modifiers.filter((m) => m.week === week && m.value < 0);
    const by = mods.reduce((a, m) => a + m.value, 0);
    if (by > -5) continue;
    const worst = [...mods].sort((a, b) => a.value - b.value)[0];
    out.push({ id: c.id, name: displayName(c), by: Math.round(by), why: worst?.reason ?? '' });
  }
  return out.sort((a, b) => a.by - b.by || a.id.localeCompare(b.id));
}

export function whatChanged(s: GameState): DiffLine[] {
  const r = s.lastReport;
  if (!r || s.gameOver) return [];
  const out: DiffLine[] = [];
  // The money, and the line that moved it most.
  const dm = r.end.money - r.start.money;
  const big = r.lines.filter((l) => l.stat === 'money' && Math.sign(l.amount) === Math.sign(dm || 1)).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
  out.push({ id: 'money', tone: dm > 0 ? 'good' : dm < 0 ? 'bad' : 'neutral', text: `Family money ${dm >= 0 ? 'up' : 'down'} ${usd(dm)} to ${s.money < 0 ? '−' : ''}${usd(s.money)}${big ? `. Mostly: ${big.label.replace(/\.$/, '')} (${big.amount > 0 ? '+' : '−'}${usd(big.amount)})` : ''}.` });
  // Respect and the heat that moved.
  const dr = r.end.respect - r.start.respect;
  const heats = HEAT_BARS.map((b) => ({ b, d: r.end.heat[b] - r.start.heat[b] })).filter((x) => Math.abs(x.d) >= 3);
  if (dr || heats.length) {
    const parts = [dr ? `respect ${sign(dr)} (${r.end.respect})` : '', ...heats.map((x) => `${HEAT_NAME[x.b]} heat ${sign(x.d)} (${r.end.heat[x.b]})`)].filter(Boolean);
    const bad = dr < 0 || heats.some((x) => x.d > 0);
    out.push({ id: 'standing', tone: bad && dr <= 0 ? 'bad' : dr > 0 && !heats.some((x) => x.d > 0) ? 'good' : 'neutral', text: `${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}.` });
  }
  // Who is angrier.
  const angry = angrierThisWeek(s, r.week).slice(0, 2);
  if (angry.length) out.push({ id: 'angry', tone: 'bad', text: `Angrier with you: ${angry.map((a) => `${a.name} (${a.by}${a.why ? `, "${a.why}"` : ''})`).join('; ')}.` });
  // What is new: the decisions that came in, and the storms on the horizon.
  const fresh = s.pendingEvents.filter((e) => e.week >= s.week);
  const storms = stormWarnings(s).filter((x) => x.tone === 'red');
  if (fresh.length || storms.length) {
    const bits = [fresh.length ? `${fresh.length} decision${fresh.length === 1 ? '' : 's'} (${fresh[0].title}${fresh.length > 1 ? ', …' : ''})` : '', storms.length ? `a storm warning: ${storms[0].title.toLowerCase()}` : ''].filter(Boolean);
    out.push({ id: 'new', tone: storms.length ? 'bad' : 'neutral', text: `New: ${bits.join('; ')}.` });
  }
  // What is due.
  const ob = obligations(s).filter((o) => o.kind !== 'receivable');
  const soon = ob.filter((o) => o.due !== undefined && o.due <= 1).sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
  const weekly = ob.filter((o) => o.weekly).reduce((a, o) => a + o.amount, 0);
  const due = [...soon.slice(0, 2).map((o) => `${o.what} ${usd(o.amount)} ${o.due === 0 ? 'this week' : 'next week'}`), weekly ? `the bills, ${usd(weekly)} a week` : ''].filter(Boolean);
  if (due.length) out.push({ id: 'due', tone: 'neutral', text: `Due: ${due.join('; ')}.` });
  return out.slice(0, 5);
}

/**
 * WHAT CHANGED over a turn of several weeks (STREAMLINE_2 §5.2, "While you were busy"): the same lines
 * as whatChanged, summed over the span: the money from the first week's start to the last week's end
 * and the line that moved it most (summed by label), respect and the heat over the span, everyone who
 * soured on him in any of its weeks, what is new and what is due now. Pure.
 */
export function spanDiff(start: GameState, end: GameState, reports: readonly WeeklyReport[]): DiffLine[] {
  if (!reports.length || end.gameOver) return [];
  if (reports.length === 1 && end.lastReport === reports[0]) return whatChanged(end);
  const first = reports[0];
  const last = reports[reports.length - 1];
  const out: DiffLine[] = [];
  const dm = last.end.money - first.start.money;
  const byLabel = new Map<string, number>();
  for (const r of reports) for (const l of r.lines) if (l.stat === 'money') byLabel.set(l.label, (byLabel.get(l.label) ?? 0) + l.amount);
  const big = [...byLabel.entries()].filter(([, v]) => Math.sign(v) === Math.sign(dm || 1)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))[0];
  const inn = reports.reduce((a, r) => a + r.lines.filter((l) => l.stat === 'money' && l.amount > 0).reduce((x, l) => x + l.amount, 0), 0);
  const outM = reports.reduce((a, r) => a + r.lines.filter((l) => l.stat === 'money' && l.amount < 0).reduce((x, l) => x - l.amount, 0), 0);
  out.push({ id: 'money', tone: dm > 0 ? 'good' : dm < 0 ? 'bad' : 'neutral', text: `Over ${reports.length} weeks Family money ${dm >= 0 ? 'up' : 'down'} ${usd(dm)} to ${end.money < 0 ? '−' : ''}${usd(end.money)} (in ${usd(inn)}, out ${usd(outM)})${big ? `. Mostly: ${big[0].replace(/\.$/, '')} (${big[1] > 0 ? '+' : '−'}${usd(big[1])})` : ''}.` });
  const dr = last.end.respect - first.start.respect;
  const heats = HEAT_BARS.map((b) => ({ b, d: last.end.heat[b] - first.start.heat[b] })).filter((x) => Math.abs(x.d) >= 3);
  if (dr || heats.length) {
    const parts = [dr ? `respect ${sign(dr)} (${last.end.respect})` : '', ...heats.map((x) => `${HEAT_NAME[x.b]} heat ${sign(x.d)} (${last.end.heat[x.b]})`)].filter(Boolean);
    const bad = dr < 0 || heats.some((x) => x.d > 0);
    out.push({ id: 'standing', tone: bad && dr <= 0 ? 'bad' : dr > 0 && !heats.some((x) => x.d > 0) ? 'good' : 'neutral', text: `${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}.` });
  }
  // Everyone who soured in any week of the span, by how much in all.
  const angry = new Map<string, { name: string; by: number; why: string }>();
  for (const r of reports) for (const a of angrierThisWeek(end, r.week)) {
    const cur = angry.get(a.id);
    angry.set(a.id, { name: a.name, by: (cur?.by ?? 0) + a.by, why: cur?.why || a.why });
  }
  const worst = [...angry.entries()].sort((a, b) => a[1].by - b[1].by || a[0].localeCompare(b[0])).slice(0, 3);
  if (worst.length) out.push({ id: 'angry', tone: 'bad', text: `Angrier with you: ${worst.map(([, a]) => `${a.name} (${a.by}${a.why ? `, "${a.why}"` : ''})`).join('; ')}.` });
  // What is new now, and what is due now: as whatChanged reads them from the end state.
  for (const l of whatChanged(end)) if (l.id === 'new' || l.id === 'due') out.push(l);
  void start;
  return out.slice(0, 6);
}
