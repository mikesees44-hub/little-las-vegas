import { ageOn } from '../../engine/calendar';
import { ageCurveWord } from '../../engine/aging';
import { focusOf, monthlyLxp, newestCrewPerk, nextBranch, nextCrewPerk, pinBranch, setFocus, tracked, xpOf } from '../../engine/crewXp';
import { CREW_PERK_LXP, FOCI, FOCUS_IDS, natureFocus } from '../../engine/lifestyle';
import type { Character, GameState } from '../../engine/types';
import { useShell } from '../shell/context';
import { rung } from '../shell/unlocks';

/**
 * HOW HE GROWS (engine/crewXp.ts passive growth, lifestyle.ts FOCI): the
 * glance on the org chart (focus icon, newest perk, ▲ when a skill ticked
 * lately) and the growth panel on his sheet (focus, the 3×4 tree with what he
 * earned lit, what comes next, the age curve) with the boss's optional word:
 * Set focus, Pin branch. Everything grows without him.
 */

/** Weeks a skill tick shows its ▲. */
const TICK_WEEKS = 5;

export function skillTicked(s: GameState, id: string): boolean {
  return (s.xp?.grew ?? []).some((g) => g.id === id && g.k === 'skill' && s.week - g.w < TICK_WEEKS);
}

/** "✊ Steady Hand ▲": the focus icon, his newest perk, a tick if a skill went up lately. */
export function GrowthGlance({ s, c, compact }: { s: GameState; c: Character; compact?: boolean }) {
  if (!tracked(s, c) || c.id === s.playerId) return null;
  const f = FOCI[focusOf(s, c)];
  const np = newestCrewPerk(s, c.id);
  const up = skillTicked(s, c.id);
  const m = xpOf(s, c.id);
  const frac = Math.max(0, Math.min(1, (m?.lp ?? 0) / CREW_PERK_LXP));
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[10px]" data-testid="growth-glance" title={`${f.name} focus${np ? ` · newest perk: ${np.name}` : ''}${up ? ' · a skill went up lately' : ''}`}>
      <span className="text-gold-300" data-testid="growth-focus" aria-label={`${f.name} focus`}>{f.icon}</span>
      {!compact && np && <span className="truncate text-stone-300" data-testid="growth-perk">{np.name}</span>}
      {up && <span className="text-emerald-400" aria-label="a skill went up">▲</span>}
      <span className="inline-block h-1 w-6 overflow-hidden rounded bg-noir-700" aria-hidden><span className="block h-full bg-emerald-600" style={{ width: `${Math.round(frac * 100)}%` }} /></span>
    </span>
  );
}

/** The growth panel: focus, branches, perks, what comes next; Set focus and Pin branch are optional. */
export function GrowthPanel({ s, c }: { s: GameState; c: Character }) {
  const { update } = useShell();
  if (!tracked(s, c) || c.id === s.playerId) return null;
  const m = xpOf(s, c.id);
  const fid = focusOf(s, c);
  const f = FOCI[fid];
  const nat = natureFocus(s, c);
  const have = new Set(m?.gp ?? []);
  const next = nextCrewPerk(s, c);
  const nb = nextBranch(s, c);
  const age = ageOn(c.birth, s.date);
  const per = monthlyLxp(s, c);
  // Steering opens with the second rung (two crews); before that it is all automatic.
  const steer = !!update && rung(s) >= 2;
  return (
    <section className="mt-2 rounded border border-noir-700 bg-noir-900/50 p-2 text-xs" data-testid="growth-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">How he grows</div>
        <div className="text-stone-400">{f.icon} {f.name}{m?.fs ? ' (your word)' : ' (his nature)'} · {ageCurveWord(age)} · ~{per} a month</div>
      </div>
      <div className="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label="His focus">
        {FOCUS_IDS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={id === fid} disabled={!steer || id === fid}
            className={`rounded border px-1.5 py-0.5 ${id === fid ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-noir-600 text-stone-300 hover:border-gold-500'} disabled:cursor-default`}
            title={id === nat ? 'What his nature takes him to: he likes it (+3)' : 'Against his nature: he takes it a little badly (−3)'}
            onClick={() => update?.((cur) => setFocus(cur, c.id, id))} data-testid={`growth-focus-${id}`}>
            {FOCI[id].icon} {FOCI[id].name}{id === nat ? ' ·' : ''}
          </button>
        ))}
      </div>
      {!steer && update && <div className="mt-0.5 text-[10px] text-stone-500">Setting his focus opens with your second crew. Until then he follows his nature.</div>}
      <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
        {f.branches.map((b, bi) => (
          <div key={b.name} className={`rounded border p-1.5 ${bi === nb ? 'border-gold-600/70' : 'border-noir-700'}`} data-testid="growth-branch">
            <div className="flex items-baseline justify-between gap-1">
              <span className="font-semibold text-stone-200">{b.name}</span>
              <button type="button" className="text-[10px] text-gold-400 hover:text-gold-300 disabled:text-stone-600" disabled={!steer}
                onClick={() => update?.((cur) => pinBranch(cur, c.id, m?.br === bi ? null : (bi as 0 | 1 | 2)))} data-testid={`growth-pin-${bi}`}>{m?.br === bi ? 'unpin' : 'pin'}</button>
            </div>
            <ol className="mt-0.5 space-y-0.5">
              {b.perks.map((p) => (
                <li key={p.id} className={have.has(p.id) ? 'text-emerald-300' : p.id === next?.id ? 'text-amber-200' : 'text-stone-500'} title={p.text}>
                  {have.has(p.id) ? '●' : p.id === next?.id ? '◐' : '○'} {p.name}<span className="block pl-3 text-[10px] text-stone-500">{p.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-stone-500">
        {next ? `Next: ${next.name} (${Math.round(m?.lp ?? 0)}/${CREW_PERK_LXP})` : 'He has every perk of this focus.'} · {f.skill} grows on its own, {f.second} a third as fast. Perks earned in another focus stay his.
      </div>
    </section>
  );
}
