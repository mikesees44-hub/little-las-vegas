import { whatShouldIDo, type Opportunity } from '../../engine/opportunities';
import type { ChronicleEntry, GameState, ReportLine } from '../../engine/types';

/** The "This Week" card's numbers: last week's report, condensed. Pure. */
export interface ThisWeek {
  from?: number;
  to: number;
  money?: { delta: number; inflow: number; outflow: number; topIn: ReportLine[]; topOut: ReportLine[] };
  respect?: number;
  heat?: { local: number; family: number; federal: number };
  threats: Opportunity[];
  opportunities: Opportunity[];
  changed: ChronicleEntry[];
}

export function thisWeek(s: GameState): ThisWeek {
  const r = s.lastReport;
  const top = whatShouldIDo(s, 8);
  const out: ThisWeek = {
    to: s.week,
    threats: top.filter((o) => o.kind === 'threat').slice(0, 2),
    opportunities: top.filter((o) => o.kind === 'opportunity').slice(0, 2),
    changed: s.chronicle.filter((e) => e.week >= s.week - 1 && ['succession', 'death', 'family', 'rival', 'consequence'].includes(e.kind)).slice(-3).reverse(),
  };
  if (r) {
    const m = r.lines.filter((l) => l.stat === 'money');
    const inflow = m.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
    const outflow = -m.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
    out.from = r.week;
    out.money = {
      delta: Math.round(r.end.money - r.start.money), inflow: Math.round(inflow), outflow: Math.round(outflow),
      topIn: m.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3),
      topOut: m.filter((l) => l.amount < 0).sort((a, b) => a.amount - b.amount).slice(0, 3),
    };
    out.respect = r.end.respect - r.start.respect;
    out.heat = { local: r.end.heat.local - r.start.heat.local, family: r.end.heat.family - r.start.heat.family, federal: r.end.heat.federal - r.start.heat.federal };
  }
  return out;
}
