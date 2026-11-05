import { allocBlock, allocatePoint, bossSkillValue, bskOf, BSK_WEEK_CAP, focusSkill, nextPerk, PT_XP, setSkillFocus, SKILL_NAME, SKILL_PERKS, SKILLS, type AnySkill } from '../../engine/bossSkills';
import { NEW_SKILL_HELP, NEW_SKILLS } from '../../engine/newSkillsCore';
import type { GameState } from '../../engine/types';
import { CardHead } from '../components/Layout';
import { domCard } from '../domain';
import { useShell } from '../shell/context';

/**
 * THE BOSS'S SKILLS (GODFATHER_LOYALTY_SKILLS.md §D), on his sheet's Skills
 * tab: practice from what he does turns into points; he puts each point
 * where he wants (+1), and points in one skill open its small perk tree at
 * 3, 6 and 10. One focus doubles the practice in its area. Every change is
 * written to Your File by the engine (bossSkills.ts).
 */
export function BossSkills({ s }: { s: GameState }) {
  const { update } = useShell();
  const b = bskOf(s);
  const boss = s.characters[s.playerId];
  if (!boss) return null;
  const foc = focusSkill(s);
  const own = b?.foc;
  const x = b?.x ?? 0;
  const pts = b?.p ?? 0;
  const thisWeek = b && b.wk === s.week ? b.wx ?? 0 : 0;
  return (
    <section className={`llv-card-box llv-card-plain mt-3 p-2.5 text-xs ${domCard('family')}`} data-domain="family" data-testid="boss-skills">
      <CardHead d="family" glyph="✦" title="Your skills grow" className="!mb-1"
        sub="Every order, every answer and every week teaches you something. Practice becomes points; put each point where you want it."
        aside={<span className={`font-semibold ${pts ? 'text-emerald-300' : 'text-stone-400'}`} data-testid="bsk-points">{pts} point{pts === 1 ? '' : 's'} to put in</span>} />
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <div className="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-noir-700" role="meter" aria-label="Practice toward the next point" aria-valuemin={0} aria-valuemax={PT_XP} aria-valuenow={x}>
          <div className="h-full rounded-full bg-gold-500 transition-[width] duration-700" style={{ width: `${(x / PT_XP) * 100}%` }} />
        </div>
        <span className="whitespace-nowrap tabular-nums text-stone-400">{x}/{PT_XP} to the next point · {thisWeek}/{BSK_WEEK_CAP} this week</span>
      </div>
      <div className="mt-1 text-[11px] text-stone-400">
        Focus: {foc ? <span className="text-gold-300">{SKILL_NAME[foc]}, practice counts double</span> : <span>none</span>}
        {foc && !own && <span className="text-stone-500"> (from your lifestyle)</span>}
        {own && update && <button type="button" className="ml-2 text-stone-400 underline hover:text-gold-300" onClick={() => update((cur) => setSkillFocus(cur, undefined))} data-testid="bsk-focus-clear">Clear focus</button>}
      </div>

      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" aria-label="The six skills">
        {SKILLS.map((k) => <SkillCard key={k} s={s} k={k} focus={foc === k} />)}
      </ul>
      <div className="mt-2 text-[10px] uppercase tracking-[0.25em] text-stone-500">The life's other skills</div>
      <ul className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" aria-label="The five other skills" data-testid="bsk-new">
        {NEW_SKILLS.map((k) => <SkillCard key={k} s={s} k={k} focus={foc === k} help={NEW_SKILL_HELP[k]} />)}
      </ul>

      {b && b.lg.length > 0 && (
        <div className="mt-2" data-testid="bsk-log">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">What taught you lately</div>
          <ul className="mt-0.5 space-y-0.5 text-[11px] text-stone-400">
            {b.lg.slice().reverse().map((l, i) => <li key={i}><span className="text-emerald-300">+{l[2]}</span> {SKILL_NAME[l[1]]} · {l[3]} <span className="text-stone-600">· wk {l[0]}</span></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function SkillCard({ s, k, focus, help }: { s: GameState; k: AnySkill; focus: boolean; help?: string }) {
  const { update } = useShell();
  const b = bskOf(s);
  const v = bossSkillValue(s, k);
  const inv = b?.inv[k] ?? 0;
  const px = b?.px[k] ?? 0;
  const block = allocBlock(s, k);
  const nx = nextPerk(k, inv);
  return (
    <li className={`rounded-md border p-2 ${focus ? 'border-gold-500/70 bg-gold-500/5' : 'border-noir-700 bg-noir-900/60'}`} data-testid="bsk-skill" data-skill={k}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-stone-100">{SKILL_NAME[k]}{focus && <span className="ml-1 text-[10px] text-gold-300">FOCUS</span>}</span>
        <span className="font-display text-lg tabular-nums text-stone-100">{v}</span>
      </div>
      {help && <div className="text-[10.5px] text-stone-400">{help}</div>}
      <div className="text-[10.5px] text-stone-500">{px} practice · {inv} point{inv === 1 ? '' : 's'} put in{nx ? ` · ${nx.at - inv} more for ${nx.name}` : ' · tree complete'}</div>
      <ol className="mt-1 space-y-0.5" aria-label={`${SKILL_NAME[k]} perks`}>
        {SKILL_PERKS[k].map((p) => {
          const has = inv >= p.at;
          return (
            <li key={p.id} className={`rounded border px-1.5 py-0.5 text-[10.5px] ${has ? 'border-gold-500/70 bg-gold-500/10 text-gold-200' : 'border-noir-700 text-stone-400'}`} data-testid="bsk-perk" data-has={has ? 1 : 0}>
              <span className="tabular-nums text-stone-500">{p.at}</span> <b className={has ? 'text-gold-300' : 'text-stone-300'}>{p.name}</b>{has ? ' ✓' : ''} · {p.text}
            </li>
          );
        })}
      </ol>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <button type="button" className="btn-gold px-2 py-0.5 text-[11px]" disabled={!!block || !update} title={block} onClick={() => update?.((cur) => allocatePoint(cur, k))} data-testid={`bsk-put-${k}`}>
          Put a point in (+1)
        </button>
        {!focus && update && (
          <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => update((cur) => setSkillFocus(cur, k))} data-testid={`bsk-focus-${k}`}>Focus here</button>
        )}
      </div>
    </li>
  );
}
