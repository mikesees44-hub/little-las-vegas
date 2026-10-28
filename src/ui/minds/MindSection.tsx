import { useState } from 'react';
import { canTalk } from '../../engine/minds/talk';
import { mindView } from '../../engine/minds/view';
import type { Character, GameState } from '../../engine/types';
import { useShell } from '../shell/context';
import { TalkPanel } from './TalkPanel';

const MOOD_TONE: Record<string, string> = {
  content: 'text-stone-200', proud: 'text-emerald-300', loyal: 'text-emerald-300', restless: 'text-amber-300', greedy: 'text-amber-300',
  scheming: 'text-amber-300', afraid: 'text-sky-300', grieving: 'text-stone-400', angry: 'text-red-300',
};

/**
 * "What's on his mind" (character sheet): mood, what drives him, what he
 * wants, what he believes about you, what he remembers, what he is up to,
 * and "Why did he do that?" (each act's motive chain, also on hover). Plus
 * "Sit and talk" for the people who matter.
 */
export function MindSection({ s, c }: { s: GameState; c: Character }) {
  const shell = useShell();
  const [talk, setTalk] = useState(false);
  const [more, setMore] = useState(false);
  if (!c.alive || c.id === s.playerId) return null;
  const v = mindView(s, c.id);
  if (!v) return null;
  const can = canTalk(s, c.id);
  const top = v.drives.slice(0, 3);
  const told = (s.minds?.heard ?? []).filter((h) => h.from === c.id).slice(-4).reverse();
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5 text-xs" data-testid="sheet-mind">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">What's on {c.firstName}'s mind{v.full ? '' : ' (at a glance)'}</div>
        {v.full && shell.update && (
          <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" disabled={!can.ok} title={can.ok ? 'About an hour of your day. Say what you like; he answers as himself.' : can.why}
            onClick={() => setTalk(true)} data-testid="mind-talk">Sit and talk</button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className={`font-semibold ${MOOD_TONE[v.mood] ?? 'text-stone-200'}`} title={v.why[0] ? `Why? ${v.why[0].text}` : undefined}>{v.moodText}</span>
        <span className="text-stone-400">Driven by {top.map((d) => d.label.toLowerCase()).join(', ')}</span>
        <span className="text-stone-500">Takes risks: {v.risk >= 0.65 ? 'readily' : v.risk <= 0.35 ? 'hardly' : 'sometimes'}</span>
      </div>
      {v.ambition && <div className="mt-1 text-stone-300">Wants to: <span className="text-stone-100">{v.ambition.text}{v.ambition.target ? ` (${v.ambition.target})` : ''}</span>{v.ambition.progress > 0 && <span className="text-stone-500"> · {v.ambition.progress}% of the way</span>}</div>}
      {v.goals.length > 0 && <div className="text-stone-400">For now: {v.goals.join('; ')}</div>}
      {v.plan && <div className="text-stone-400">Up to: <span className="text-stone-200">{v.plan}</span></div>}
      {v.aboutBoss && <div className="mt-1 text-stone-300">{v.aboutBoss}</div>}

      {v.why.length > 0 && (
        <div className="mt-2" data-testid="mind-why">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Why did he do that?</div>
          <ul className="mt-0.5 space-y-0.5">
            {v.why.slice(0, more ? 5 : 2).map((w, i) => (
              <li key={i} className="text-stone-300" title={w.text}><span className="text-stone-500">wk {w.week}:</span> {w.text}</li>
            ))}
          </ul>
          {v.hiddenWhy > 0 && <div className="text-stone-600">And {v.hiddenWhy === 1 ? 'one thing' : `${v.hiddenWhy} things`} he keeps to himself.</div>}
        </div>
      )}

      <button type="button" className="mt-1.5 text-[11px] text-stone-500 hover:text-gold-400" onClick={() => setMore((x) => !x)} data-testid="mind-more">{more ? 'Less' : 'More: needs, memories, what he has heard'}</button>
      {more && (
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Needs</div>
            <ul>
              {v.drives.map((d) => (
                <li key={d.need} className="flex items-center gap-2" title={`Cares ${Math.round(d.weight * 100)}% · has ${d.sat}% of it · urgency ${Math.round(d.urgency * 100)}%`}>
                  <span className="w-16 text-stone-400">{d.label}</span>
                  <span className="h-1.5 w-24 overflow-hidden rounded bg-noir-700"><span className="block h-full bg-gold-500/70" style={{ width: `${Math.round(d.urgency * 100)}%` }} /></span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-stone-500">He remembers</div>
            {v.memories.length === 0 ? <div className="text-stone-500">Nothing that weighs on him.</div> : (
              <ul>{v.memories.map((m, i) => <li key={i} className={m.v >= 0 ? 'text-emerald-300/90' : 'text-red-300/90'}>{m.text}{m.who ? ` (${m.who})` : ''}</li>)}</ul>
            )}
            {v.grudges.length > 0 && <div className="mt-1 text-stone-400">Holds it against: {v.grudges.map((g) => g.name).join(', ')}</div>}
            {v.debts.length > 0 && <div className="text-stone-400">Owes a debt of gratitude to: {v.debts.map((g) => g.name).join(', ')}</div>}
          </div>
          {told.length > 0 && (
            <div className="sm:col-span-2">
              <div className="text-[10px] uppercase tracking-wider text-stone-500">What he told you</div>
              <ul>{told.map((h, i) => <li key={i} className="text-stone-300"><span className="text-stone-500">wk {h.w}:</span> {h.text}</li>)}</ul>
            </div>
          )}
          <div className="sm:col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">What he has heard</div>
            {v.heard.length ? <ul>{v.heard.map((h, i) => <li key={i} className="text-stone-300">{h}</li>)}</ul>
              : <div className="text-stone-500">{v.heardHidden ? 'He knows something. He would tell a boss he trusts more, or over a long talk.' : 'Nothing he has passed on.'}</div>}
          </div>
        </div>
      )}
      {talk && shell.update && <TalkPanel s={s} id={c.id} update={shell.update} onClose={() => setTalk(false)} />}
    </section>
  );
}
