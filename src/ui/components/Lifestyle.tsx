import { previewAction } from '../../engine/actions';
import { LIFESTYLE_IDS, LIFESTYLES, XP_PER_POINT, findPerk, perkBlocked, perkMod, type PerkKey } from '../../engine/lifestyle';
import type { GameState, PlayerAction } from '../../engine/types';
import { player } from '../../engine/characters';
import { useOrders } from './Orders';

const ICON = { muscle: '⚔', money: '$', politics: '⚖', family: '⌂', shadows: '◐' } as const;

const MOD_LABEL: Record<PerkKey, (v: number) => string> = {
  hitPower: (v) => `+${v} to hits`,
  heistPower: (v) => `+${v} to heists`,
  secrecy: (v) => `+${v} scheme secrecy`,
  raid: (v) => `+${v}% raid odds`,
  guard: (v) => `+${v} resistance to murder`,
  strikeDamage: (v) => `rival strikes cost ${v}% less`,
  income: (v) => `+${v}% business income`,
  street: (v) => `+${v}% street take`,
  launder: (v) => `+${v}% wash capacity`,
  upkeep: (v) => `−${v}% upkeep`,
  vig: (v) => `+${v}% vig on new loans`,
  tribute: (v) => `−${v}% tribute to Philadelphia`,
  accept: (v) => `+${v} acceptance`,
  vote: (v) => `+${v} on Table votes`,
  bribe: (v) => `bribes ${v}% cheaper`,
  favor: (v) => `favors ${v}% more often`,
  localHeat: (v) => `local heat −${v} every other week`,
  fedHeat: (v) => `federal heat −${v} every third week`,
  familyOpinion: (v) => `family opinion +${v} a month`,
  crewOpinion: (v) => `crew opinion +${v} a month`,
  defection: (v) => `ignored men drift slower (${v})`,
  heirGrowth: (v) => `children +${v}% skill growth`,
  intel: (v) => `+${v}% digging`,
  envoy: (v) => `+${v} envoy odds`,
  sitdown: (v) => `sit-downs settle ${v} closer to you`,
  quietEnv: (v) => `quiet envelopes ${v}% less likely to be told`,
  cleanHit: (v) => `+${v} secrecy on hits`,
  skim: (v) => `men short ${v}% less often`,
  capoLoyal: (v) => `capos +${v} opinion a month`,
};

/** The boss's lifestyle: focus, experience and the three perk trees. */
export function LifestylePanel({ s }: { s: GameState }) {
  const { orders, queue } = useOrders();
  const b = player(s);
  const ls = b.lifestyle;
  const queued = (a: PlayerAction) => orders.some((o) => JSON.stringify(o) === JSON.stringify(a));
  const active = (Object.keys(MOD_LABEL) as PerkKey[]).map((k) => [k, perkMod(s, k)] as const).filter(([, v]) => v);

  return (
    <div className="space-y-4" data-testid="lifestyle">
      <div>
        <h2 className="font-display text-2xl text-gold-400">Lifestyle</h2>
        <p className="text-sm text-stone-400">
          How {b.firstName} rules. Experience builds every week — faster with the matching skill. Every {XP_PER_POINT} XP is a perk point. Perks are learned in order down each tree, only while living that life. They belong to the man: an heir starts his own.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {LIFESTYLE_IDS.map((id) => {
          const L = LIFESTYLES[id];
          const a: PlayerAction = { kind: 'lifestyle', focus: id };
          const p = previewAction(s, a);
          const mine = ls?.focus === id;
          const owned = ls ? L.trees.flatMap((t) => t.perks).filter((x) => ls.perks.includes(x.id)).length : 0;
          return (
            <div key={id} className={`rounded-md border p-2 ${mine ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/70'}`}>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-noir-900 border border-noir-600 grid place-items-center text-gold-300">{ICON[id]}</span>
                <span className="font-semibold text-stone-100">{L.name}</span>
              </div>
              <p className="text-[11px] text-stone-400 mt-1">{L.text}</p>
              <p className="text-[11px] text-stone-500 mt-1">Skill: {L.skill} {b.attributes[L.skill]} · perks {owned}/12</p>
              {mine ? (
                <div className="mt-1 text-[11px] text-gold-300 font-semibold">Your life</div>
              ) : (
                <button className="btn-ghost w-full text-xs py-1 mt-1" disabled={!!p.disabledReason || queued(a)} onClick={() => queue(a)} title={p.detail}>
                  {queued(a) ? 'Switching ✓' : ls ? 'Switch to this' : 'Live this life'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {ls ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-stone-300">The {LIFESTYLES[ls.focus].name} life</div>
            <div className="w-48 h-2 rounded bg-noir-700 overflow-hidden" title={`${ls.xp}/${XP_PER_POINT} XP`}>
              <div className="h-full bg-gold-500" style={{ width: `${(ls.xp / XP_PER_POINT) * 100}%` }} />
            </div>
            <div className="text-xs text-stone-400">{ls.xp}/{XP_PER_POINT} XP</div>
            <div className={`text-xs font-semibold ${ls.points ? 'text-emerald-300' : 'text-stone-500'}`}>{ls.points} perk point{ls.points === 1 ? '' : 's'} to spend</div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {LIFESTYLES[ls.focus].trees.map((t) => (
              <div key={t.name} className="rounded-md border border-noir-700 bg-noir-900/60 p-2">
                <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500 mb-1">{t.name}</div>
                <ol className="space-y-1.5">
                  {t.perks.map((p) => {
                    const has = ls.perks.includes(p.id);
                    const a: PlayerAction = { kind: 'perk', perk: p.id };
                    const why = perkBlocked(b, p.id);
                    return (
                      <li key={p.id} data-perk={p.id} className={`rounded border px-2 py-1.5 ${has ? 'border-gold-400 bg-gold-500/15' : why ? 'border-noir-700 opacity-70' : 'border-emerald-600 bg-emerald-900/20'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-semibold ${has ? 'text-gold-300' : 'text-stone-200'}`}>{p.name}</span>
                          {has ? <span className="text-[10px] text-gold-300">Learned</span> : (
                            <button className="btn-gold text-[11px] py-0.5 px-2" disabled={!!why || queued(a)} onClick={() => queue(a)}>{queued(a) ? 'Learning ✓' : 'Learn'}</button>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-400">{p.text}</div>
                        {!has && why && <div className="text-[10px] text-stone-500">{why}</div>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-amber-300">{b.firstName} has not chosen how to rule. Pick a lifestyle to start earning perks.</p>
      )}

      {ls && ls.perks.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">In effect</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {active.map(([k, v]) => <span key={k} className="chip-good">{MOD_LABEL[k](v)}</span>)}
          </div>
          <div className="text-[11px] text-stone-500 mt-1">From: {ls.perks.map((id) => findPerk(id)?.name).join(', ')}</div>
        </div>
      )}
    </div>
  );
}
