import type { ReactNode } from 'react';
import type { Conf } from '../../engine/planner/intel';
import { CONF_LABEL } from '../../engine/planner/intel';
import { Portrait } from '../portrait/Portrait';
import { FACTION_TINT } from '../components/People';
import { domainOf, domClass, DOMAINS } from '../domain';
import type { GameState } from '../../engine/types';

/** Small pieces of ink shared by the planner's pages (ui/planner). */

/** A domain dot on paper (the colour is the only paper-safe use: a dot or a rule, never ink). */
export function InkDot({ dom }: { dom?: string }) {
  const d = domainOf(dom);
  if (!d) return <span className="inline-block h-2 w-2 shrink-0" aria-hidden />;
  return <span className={`${domClass(d)} llv-dom-dot shrink-0`} role="img" aria-label={DOMAINS[d].label} title={DOMAINS[d].label} />;
}

/** "CONFIRMED" / "LIKELY" / "RUMOR": a typed stamp. */
export function ConfStamp({ conf }: { conf?: Conf }) {
  if (!conf) return null;
  return <span className={`llv-conf llv-conf-${conf} llv-type`} data-conf={conf}>{CONF_LABEL[conf]}</span>;
}

/** A labelled 0-100 bar in ink. */
export function InkBar({ v, label, color, testid }: { v: number; label?: ReactNode; color: string; testid?: string }) {
  return (
    <div className="min-w-0" data-testid={testid}>
      {label && <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#6b5a44]"><span>{label}</span><span className="tabular-nums">{v}</span></div>}
      <div className="llv-ink-bar" role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={typeof label === 'string' ? label : undefined}><span style={{ width: `${Math.max(2, v)}%`, background: color }} /></div>
    </div>
  );
}

/** A face, or a monogram for somebody the game has no portrait for. */
export function Face({ s, id, name, size = 36 }: { s: GameState; id?: string; name: string; size?: number }) {
  const c = id ? s.characters[id] : undefined;
  if (c) return <span className="shrink-0 overflow-hidden rounded-full ring-1 ring-[#2a2118]/40" style={{ width: size, height: size }}><Portrait c={c} seed={s.seed} date={s.date} size={size} tint={FACTION_TINT[c.faction]} /></span>;
  const ini = name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('');
  return <span className="flex shrink-0 items-center justify-center rounded-full bg-[#2a2118] font-display text-[#f4ecd8]" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>{ini || '?'}</span>;
}

/** Open the Don's book on a page from anywhere (the top bar, the Desk, the Office). */
export type PlannerTab = 'brief' | 'audience' | 'datebook' | 'book' | 'orders';
export function openPlanner(tab: PlannerTab = 'brief'): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('llv-open-planner', { detail: { tab } }));
}
