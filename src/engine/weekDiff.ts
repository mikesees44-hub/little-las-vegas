import { displayName } from './characters';
import { stormWarnings } from './storms';
import { obligations } from './tribute';
import { HEAT_BARS, type GameState, type HeatBar } from './types';

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
