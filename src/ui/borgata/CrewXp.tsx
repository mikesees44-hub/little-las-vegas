import { useState } from 'react';
import {
  AUTO_WEEKS, board, honored, letHimChoose, perkBlock, PERKS, perksOpen, pickPerk, pointsOpen, progress, recognizeBlock, recognizeMan, setAutoPick, slighted,
  spendPoint, suggestPerks, titleOf, tracked, XP_HOWTO, XP_SKILLS, xpOf, xpWants, PERK_LEVELS, type BoardSort, type XpPerk,
} from '../../engine/crewXp';
import { displayName } from '../../engine/characters';
import type { Character, GameState } from '../../engine/types';
import { fmt$, signed } from '../format';
import { CharLink, Face } from '../components/People';
import { useShell } from '../shell/context';

/**
 * YOUR MEN COME UP (engine/crewXp.ts): the level badge on rows and portraits,
 * the progression section of a man's sheet (XP bar, points, specialties, the
 * boss's word) and the "Coming up" board of the whole family. Every button is
 * a pure state edit; nothing here costs a week.
 */

const HOWTO = `How he earns XP:\n• ${XP_HOWTO.join('\n• ')}`;
const SKILL_LABEL: Record<string, string> = { leadership: 'Leadership', business: 'Business', diplomacy: 'Diplomacy', intrigue: 'Intrigue', force: 'Muscle', discipline: 'Discipline' };

function Bar({ frac, className }: { frac: number; className?: string }) {
  return (
    <span className={`inline-block h-1.5 overflow-hidden rounded bg-noir-700 align-middle ${className ?? 'w-16'}`}>
      <span className="block h-full bg-gold-500" style={{ width: `${Math.round(frac * 100)}%` }} />
    </span>
  );
}

/** "Lv 4 · Made man" with a thin bar; the tooltip says how he earns XP. */
export function XpBadge({ s, c, compact }: { s: GameState; c: Character; compact?: boolean }) {
  if (!tracked(s, c)) return null;
  const p = progress(s, c);
  const t = titleOf(s, c, p.lvl);
  const open = c.id === s.playerId || c.faction === 'player' ? perksOpen(s, c) + pointsOpen(s, c) : 0;
  const tip = `Level ${p.lvl}: ${t} · ${p.xp} XP${p.to ? ` (next level at ${p.to})` : p.held ? ' (held until he is made)' : ''}\n\n${HOWTO}`;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px]" title={tip} data-testid="xp-badge">
      <span className={`rounded border px-1 font-semibold tabular-nums ${p.lvl >= 7 ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-300'}`}>Lv {p.lvl}</span>
      {!compact && <span className="text-stone-400">{t}</span>}
      <Bar frac={p.frac} className={compact ? 'w-8' : 'w-12'} />
      {open > 0 && <span className="text-amber-300" title="A point or a specialty to pick">★</span>}
    </span>
  );
}

/** A small level mark on a portrait (the crew chart). */
export function LevelPip({ s, c, size }: { s: GameState; c: Character; size: number }) {
  if (!tracked(s, c) || size < 28) return null;
  const p = progress(s, c);
  return (
    <span className={`absolute -top-1 -right-1 rounded-full border px-1 text-[8px] font-bold leading-tight tabular-nums ${p.lvl >= 7 ? 'border-gold-400 bg-noir-950 text-gold-300' : 'border-noir-600 bg-noir-950/90 text-stone-300'}`}
      title={`Level ${p.lvl}: ${titleOf(s, c, p.lvl)}`} data-testid="xp-pip">{p.lvl}</span>
  );
}

/** The progression part of a man's sheet. */
export function XpSection({ s, c }: { s: GameState; c: Character }) {
  const { update } = useShell();
  if (!tracked(s, c)) return null;
  const isBoss = c.id === s.playerId;
  const p = progress(s, c);
  const m = xpOf(s, c.id);
  const pts = pointsOpen(s, c);
  const open = perksOpen(s, c);
  const sug = suggestPerks(s, c);
  const wants = xpWants(s, c);
  const rb = recognizeBlock(s, c);
  const he = isBoss ? 'you' : 'he';
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5 text-xs" data-testid="sheet-xp">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500" title={HOWTO}>Coming up in the life ⓘ</div>
        <div className="text-stone-300"><span className="font-semibold text-gold-300">Level {p.lvl}</span> · {titleOf(s, c, p.lvl)} · {p.xp} XP</div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Bar frac={p.frac} className="w-full" />
        <span className="whitespace-nowrap tabular-nums text-stone-400">{p.to ? `${p.xp - p.from}/${p.to - p.from}` : p.held ? 'held until made' : 'top'}</span>
      </div>
      {p.held && <div className="mt-1 text-amber-300">He has come as far as an associate can: he is ready to be made.</div>}
      {!isBoss && (honored(s, c) || slighted(s, c)) && (
        <div className={`mt-1 ${honored(s, c) ? 'text-emerald-300' : 'text-red-300'}`}>{honored(s, c) ? 'You honored him lately: he remembers it.' : 'He feels slighted: years of work and not a word from you. Rivals notice men like this.'}</div>
      )}

      {pts > 0 && (
        <div className="mt-2" data-testid="xp-points">
          <div className="text-stone-300">{pts} skill point{pts > 1 ? 's' : ''} to put in (+2 each){m?.pend !== undefined && !isBoss ? ` — after ${AUTO_WEEKS} weeks ${he} picks for himself` : ''}:</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {XP_SKILLS.map((k) => (
              <button key={k} type="button" className="rounded border border-noir-600 px-1.5 py-0.5 hover:border-gold-500 disabled:opacity-40" disabled={c.attributes[k] >= 100 || !update}
                onClick={() => update?.((cur) => spendPoint(cur, c.id, k))} data-testid={`xp-point-${k}`}>+2 {SKILL_LABEL[k]} ({c.attributes[k]})</button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2">
        <div className="text-stone-400">Specialties {isBoss ? '' : '(made men: at levels '}{isBoss ? `(at levels ${PERK_LEVELS.join(', ')})` : `${PERK_LEVELS.join(', ')})`}:</div>
        {(m?.perks ?? []).length ? (
          <ul className="mt-0.5 space-y-0.5">{m!.perks!.map((k) => <li key={k}><span className="text-gold-300">{PERKS[k].icon} {PERKS[k].name}</span> — <span className="text-stone-400">{PERKS[k].text}</span></li>)}</ul>
        ) : <div className="text-stone-500">None yet.</div>}
        {open > 0 && (
          <div className="mt-1.5" data-testid="xp-perks">
            <div className="text-amber-300">Pick {isBoss ? 'your' : 'his'} specialty (best fit first):</div>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {sug.map((k: XpPerk, i) => {
                const why = perkBlock(s, c, k);
                return (
                  <button key={k} type="button" disabled={!!why || !update} title={why ?? PERKS[k].text}
                    className={`rounded border px-1.5 py-1 text-left hover:border-gold-500 disabled:opacity-40 ${i === 0 ? 'border-gold-600' : 'border-noir-600'}`}
                    onClick={() => update?.((cur) => pickPerk(cur, c.id, k))} data-testid={`xp-perk-${k}`}>
                    <span className="font-semibold text-stone-100">{PERKS[k].icon} {PERKS[k].name}</span>
                    <span className="block text-[11px] text-stone-400">{PERKS[k].text}</span>
                  </button>
                );
              })}
            </div>
            {!isBoss && <button type="button" className="btn-ghost mt-1 text-xs" disabled={!update} onClick={() => update?.((cur) => letHimChoose(cur, c.id))} data-testid="xp-auto">Let him find his own way</button>}
          </div>
        )}
      </div>

      {!isBoss && c.faction === 'player' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost text-xs" disabled={!!rb || !update} title={rb ?? 'A word from you in front of the others: he thinks better of you, and the others notice who you notice.'}
            onClick={() => update?.((cur) => recognizeMan(cur, c.id))} data-testid="xp-recognize">Recognize him in front of the others</button>
          {rb && <span className="text-stone-500">{rb}</span>}
        </div>
      )}
      {wants.length > 0 && (
        <ul className="mt-2 space-y-0.5" data-testid="xp-wants">
          {wants.map((w) => <li key={w.key} className={w.met ? 'text-emerald-300' : 'text-amber-200'}>{w.met ? '✓' : '•'} {w.text}</li>)}
        </ul>
      )}
      {(m?.log ?? []).length > 0 && (
        <div className="mt-2">
          <div className="text-stone-500">Lately:</div>
          <ul className="text-[11px] text-stone-400">{[...m!.log!].reverse().map((l, i) => <li key={i}>wk {l.w}: +{l.n} XP — {l.why}</li>)}</ul>
        </div>
      )}
      <details className="mt-2 text-[11px] text-stone-500"><summary className="cursor-pointer">How {he} earns XP</summary><ul className="mt-1 list-disc pl-4">{XP_HOWTO.map((h) => <li key={h}>{h}</li>)}</ul></details>
    </section>
  );
}

/** "Coming up": every man in the family by level, earning or loyalty, who is ready, who is waiting on you. */
export function ProgressBoard({ s }: { s: GameState }) {
  const { update } = useShell();
  const [sort, setSort] = useState<BoardSort>('level');
  const rows = board(s, sort);
  const x = s.xp;
  const ready = rows.filter((r) => r.ready);
  const waiting = rows.filter((r) => r.open.perks > 0 || r.open.points > 0);
  return (
    <section data-testid="xp-board">
      <div className="panel-title">Your men coming up</div>
      <p className="text-xs text-stone-500" title={HOWTO}>Every man earns experience from what he does: the envelope, the places he runs, jobs, wars, keeping quiet, recruits. Levels bring a skill point; made men pick a specialty at levels {PERK_LEVELS.join(', ')}. Veterans want to be recognized — rewarded, they are loyal; slighted, rivals court them. ⓘ</p>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
        <span className="text-stone-500">Sort by</span>
        {(['level', 'earning', 'loyalty'] as BoardSort[]).map((k) => (
          <button key={k} type="button" onClick={() => setSort(k)} className={`rounded px-2 py-0.5 ${sort === k ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300'}`} data-testid={`xp-sort-${k}`}>{k === 'level' ? 'Level' : k === 'earning' ? 'Earning' : 'Loyalty'}</button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-stone-400" title="Every man picks his own points and specialty as soon as he comes up (no popups).">
          <input type="checkbox" checked={!!x?.auto} disabled={!update} onChange={(e) => update?.((cur) => setAutoPick(cur, e.target.checked))} data-testid="xp-autopick" />
          Let the men pick for themselves
        </label>
      </div>
      {(ready.length > 0 || waiting.length > 0) && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
          {ready.length > 0 && (
            <div className="rounded border border-emerald-800/60 bg-emerald-900/10 p-2" data-testid="xp-ready">
              <div className="text-emerald-300">Ready for more</div>
              <ul>{ready.map((r) => <li key={r.c.id}><CharLink s={s} id={r.c.id}>{displayName(r.c)}</CharLink> — {r.ready === 'made' ? 'ready to be made' : 'could run a crew'}</li>)}</ul>
            </div>
          )}
          {waiting.length > 0 && (
            <div className="rounded border border-amber-800/60 bg-amber-900/10 p-2" data-testid="xp-waiting">
              <div className="text-amber-300">Waiting on your word</div>
              <ul>{waiting.map((r) => <li key={r.c.id}><CharLink s={s} id={r.c.id}>{r.c.id === s.playerId ? 'You' : displayName(r.c)}</CharLink> — {r.open.perks ? 'a specialty' : ''}{r.open.perks && r.open.points ? ' and ' : ''}{r.open.points ? `${r.open.points} point${r.open.points > 1 ? 's' : ''}` : ''}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      <ul className="mt-2 divide-y divide-noir-800">
        {rows.map((r) => (
          <li key={r.c.id} className="flex items-center gap-2 py-1.5" data-testid="xp-row">
            <Face s={s} c={r.c} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm"><CharLink s={s} id={r.c.id}>{r.c.id === s.playerId ? `${displayName(r.c)} (you)` : displayName(r.c)}</CharLink></div>
              <div className="truncate text-[11px] text-stone-400">
                <span className="capitalize">{r.c.rank}</span> · {r.title}
                {r.perks.length > 0 && <> · <span className="text-gold-300">{r.perks.map((k) => PERKS[k].name).join(', ')}</span></>}
                {r.honored && r.c.id !== s.playerId && <span className="text-emerald-400"> · honored</span>}
                {r.slighted && <span className="text-red-400"> · slighted</span>}
                {r.last && <> · <span className="text-stone-500">wk {r.last.w}: {r.last.why}</span></>}
              </div>
            </div>
            <XpBadge s={s} c={r.c} compact />
            <span className="w-14 text-right text-[11px] tabular-nums text-stone-300" title="Brought in last week">{r.earn ? fmt$(r.earn) : '—'}</span>
            <span className={`w-8 text-right text-[11px] tabular-nums ${r.loyalty >= 25 ? 'text-emerald-400' : r.loyalty <= -25 ? 'text-red-400' : 'text-stone-300'}`} title="What he thinks of you">{r.c.id === s.playerId ? '' : signed(r.loyalty)}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-xs text-stone-500">No men yet.</li>}
      </ul>
      {(x?.feed ?? []).length > 0 && (
        <div className="mt-3 text-xs">
          <div className="text-stone-500">Lately</div>
          <ul className="text-[11px] text-stone-400">{[...x!.feed].reverse().slice(0, 10).map((f, i) => <li key={i}>wk {f.w}: {f.text}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
