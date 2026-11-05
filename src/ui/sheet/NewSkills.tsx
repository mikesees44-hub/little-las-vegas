import { nextPerk, SKILL_PERKS } from '../../engine/bossSkills';
import { manInvested, manPracticeOf, pointsOpen, spendPoint, tracked } from '../../engine/crewXp';
import { NEW_SKILL_HELP, NEW_SKILL_NAME, NEW_SKILLS, skillValue, type NewSkill } from '../../engine/newSkillsCore';
import type { Character, GameState } from '../../engine/types';
import { useShell } from '../shell/context';

/**
 * A MAN'S FIVE OTHER SKILLS (newSkillsCore.ts): Charm, Streetwise, Politics,
 * Showbiz, Gambling, on his sheet's Skills tab. What his deeds teach him
 * (practice: every 30 is +1 on its own), the points the boss puts in (+2 from
 * his level points) and the 3/6/10 tree those points open, the same trees as
 * the boss's (bossSkills.ts SKILL_PERKS). The boss's own are on BossSkills.
 */
export function ManNewSkills({ s, c }: { s: GameState; c: Character }) {
  if (c.id === s.playerId) return null;
  const mine = tracked(s, c) && c.faction === 'player';
  const pts = mine ? pointsOpen(s, c) : 0;
  return (
    <section className="mt-2 rounded-md border border-noir-700 bg-noir-800/50 p-2.5 text-xs" data-testid="ns-man">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">The life's other skills</div>
        {mine && <span className={`font-semibold ${pts ? 'text-emerald-300' : 'text-stone-500'}`} data-testid="ns-points">{pts} point{pts === 1 ? '' : 's'} to put in (+2 each)</span>}
      </div>
      {mine && <div className="text-[10.5px] text-stone-500">His deeds teach them (every 30 practice is +1). The trees read as the boss's; for one of his men each perk is +3 on a job that wants the skill, on top of the skill itself.</div>}
      <ul className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {NEW_SKILLS.map((k) => <ManSkillCard key={k} s={s} c={c} k={k} mine={mine} pts={pts} />)}
      </ul>
    </section>
  );
}

function ManSkillCard({ s, c, k, mine, pts }: { s: GameState; c: Character; k: NewSkill; mine: boolean; pts: number }) {
  const { update } = useShell();
  const v = skillValue(c, k);
  const inv = manInvested(s, c.id, k);
  const pr = manPracticeOf(s, c.id, k);
  const nx = nextPerk(k, inv);
  return (
    <li className="rounded-md border border-noir-700 bg-noir-900/60 p-2" data-testid="ns-skill" data-skill={k}>
      <div className="flex items-baseline justify-between gap-2" title={NEW_SKILL_HELP[k]}>
        <span className="font-semibold text-stone-100">{NEW_SKILL_NAME[k]}</span>
        <span className="font-display text-lg tabular-nums text-stone-100">{v}</span>
      </div>
      {mine && (
        <>
          <div className="mt-0.5 flex items-center gap-1.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-noir-700" role="meter" aria-label={`${NEW_SKILL_NAME[k]} practice toward the next +1`} aria-valuemin={0} aria-valuemax={pr.of} aria-valuenow={pr.x}>
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${(pr.x / pr.of) * 100}%` }} />
            </div>
            <span className="whitespace-nowrap tabular-nums text-[10.5px] text-stone-500">{pr.x}/{pr.of}</span>
          </div>
          <div className="text-[10.5px] text-stone-500">{pr.total} practice · {inv} point{inv === 1 ? '' : 's'} put in{nx ? ` · ${nx.at - inv} more for ${nx.name}` : ' · tree complete'}</div>
          <ol className="mt-1 space-y-0.5" aria-label={`${NEW_SKILL_NAME[k]} perks`}>
            {SKILL_PERKS[k].map((p) => {
              const has = inv >= p.at;
              return (
                <li key={p.id} className={`rounded border px-1.5 py-0.5 text-[10.5px] ${has ? 'border-gold-500/70 bg-gold-500/10 text-gold-200' : 'border-noir-700 text-stone-400'}`} data-testid="ns-perk" data-has={has ? 1 : 0}>
                  <span className="tabular-nums text-stone-500">{p.at}</span> <b className={has ? 'text-gold-300' : 'text-stone-300'}>{p.name}</b>{has ? ' ✓' : ''} · {p.text}
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn-ghost mt-1.5 px-2 py-0.5 text-[11px]" disabled={!pts || v >= 100 || !update}
            onClick={() => update?.((cur) => spendPoint(cur, c.id, k))} data-testid={`ns-put-${k}`}>Put a point in (+2)</button>
        </>
      )}
    </li>
  );
}
