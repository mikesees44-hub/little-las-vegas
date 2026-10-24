import type { ReactNode } from 'react';
import { ageOn } from '../../engine/calendar';
import { fam } from '../../engine/familyState';
import { CONGENITAL_INFO, educationLabel, GOAL_INFO, PATH_INFO } from '../../engine/familyTraits';
import { COPING_INFO, STRESS_SOURCE_NAME, STRESS_THRESHOLDS, stressLevel } from '../../engine/familyStress';
import { houseLabel } from '../../engine/familyHouses';
import type { StressSource } from '../../engine/familyState';
import type { Character, GameState } from '../../engine/types';

/** Small uppercase section label. */
export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{children}</div>;
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'gold' | 'good' | 'bad' | 'neutral' | 'warn'; title?: string }) {
  const cls = {
    gold: 'bg-gold-500/20 text-gold-300 border-gold-600/60',
    good: 'bg-emerald-900/50 text-emerald-300 border-emerald-800/60',
    bad: 'bg-blood-500/20 text-red-300 border-blood-500/50',
    warn: 'bg-amber-900/40 text-amber-200 border-amber-700/60',
    neutral: 'bg-noir-700 text-stone-300 border-noir-600',
  }[tone];
  return <span title={title} className={`inline-flex items-center rounded border px-1 py-px text-[10px] font-semibold leading-tight whitespace-nowrap ${cls}`}>{children}</span>;
}

const LEVEL_COLOR = ['bg-emerald-600', 'bg-amber-500', 'bg-orange-600', 'bg-blood-400'];
const LEVEL_NAME = ['Calm', 'Strained', 'Cracking', 'At the edge'];

/** CK3-style stress bar with the three breaking points marked; hover shows where it comes from. */
export function StressBar({ s, c, wide }: { s: GameState; c: Character; wide?: boolean }) {
  const p = fam(s, c.id);
  const lvl = stressLevel(p.stress);
  const src = (Object.keys(p.stressSrc) as StressSource[]).filter((k) => p.stressSrc[k] > 0).sort((a, b) => p.stressSrc[b] - p.stressSrc[a]);
  const title = `Stress ${p.stress}/100 — ${LEVEL_NAME[lvl]}${src.length ? ` · from ${src.map((k) => `${STRESS_SOURCE_NAME[k].toLowerCase()} ${p.stressSrc[k]}`).join(', ')}` : ''}${p.coping.length ? ` · copes: ${p.coping.map((k) => COPING_INFO[k].name.toLowerCase()).join(', ')}` : ''}`;
  return (
    <div className={`flex items-center gap-1.5 ${wide ? 'w-full' : ''}`} title={title} data-testid="stress-bar">
      <span className="text-[9px] uppercase tracking-widest text-stone-500">Stress</span>
      <div className={`relative h-1.5 rounded bg-noir-700 overflow-hidden ${wide ? 'flex-1' : 'w-20'}`}>
        <div className={`h-full ${LEVEL_COLOR[lvl]}`} style={{ width: `${p.stress}%` }} />
        {STRESS_THRESHOLDS.slice(0, 2).map((t) => <div key={t} className="absolute top-0 h-full w-px bg-noir-950/80" style={{ left: `${t}%` }} />)}
      </div>
      <span className={`text-[10px] tabular-nums ${lvl >= 2 ? 'text-red-300' : lvl === 1 ? 'text-amber-300' : 'text-stone-400'}`}>{p.stress}</span>
    </div>
  );
}

/** Congenital traits as small chips. */
export function BloodChips({ s, c }: { s: GameState; c: Character }) {
  const p = fam(s, c.id);
  if (!p.congenital.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-0.5">
      {p.congenital.map((t) => <Badge key={t} tone={CONGENITAL_INFO[t].good ? 'good' : 'bad'} title={CONGENITAL_INFO[t].text}>{t}</Badge>)}
    </span>
  );
}

/** The dynasty block on a character sheet: blood, education, path, goal, stress. */
export function DynastyFacts({ s, c }: { s: GameState; c: Character }) {
  const p = fam(s, c.id);
  const house = houseLabel(s, c);
  const edu = educationLabel(p.education);
  const showStress = c.alive && (c.dynasty || p.stress > 0);
  if (!p.congenital.length && !edu && !p.path && !p.goal && !house && !showStress && !p.bastardOf) return null;
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="dynasty-facts">
      <Label>Blood & upbringing</Label>
      <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-stone-300 sm:grid-cols-2">
        {house && <div>House: <span className="text-stone-100">{house}</span></div>}
        {p.congenital.length > 0 && <div className="flex gap-1 items-center">Blood: <BloodChips s={s} c={c} /></div>}
        {edu && <div>Education: <span className="text-stone-100">{edu}</span></div>}
        {!edu && p.guardian && ageOn(c.birth, s.date) < 16 && <div>Being raised: <span className="text-stone-100">{p.guardian.kind === 'capo' && p.guardian.guardianId ? `with ${s.characters[p.guardian.guardianId]?.firstName ?? 'a capo'}` : p.guardian.kind}</span></div>}
        {p.path && <div>Path: <span className="text-stone-100">{PATH_INFO[p.path].name}</span></div>}
        {p.goal && <div>Goal: <span className="text-stone-100">{GOAL_INFO[p.goal]}</span></div>}
        {p.bastardOf && <div className="text-amber-200">{p.legitimized ? 'Recognized' : 'Unrecognized'} son of {s.characters[p.bastardOf]?.firstName ?? '?'}{p.claimant ? ' — presses a claim' : ''}</div>}
        {p.retired !== undefined && <div>Retired to Florida</div>}
      </div>
      {showStress && <div className="mt-1.5 max-w-xs"><StressBar s={s} c={c} wide /></div>}
    </section>
  );
}

export function ProgressBar({ value, tone = 'bg-gold-500' }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 rounded bg-noir-700 overflow-hidden">
      <div className={`h-full ${tone}`} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}
