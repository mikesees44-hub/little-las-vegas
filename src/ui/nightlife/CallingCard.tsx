import { BookAbout } from '../book/TheBook';
import { useState, type ReactNode } from 'react';
import { callingCard, type CardLine } from '../../engine/callingCard';
import { nightActionsFor } from '../../engine/nightlife';
import type { GameState } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { FACTION_TINT } from '../components/People';
import { Portrait } from '../portrait/Portrait';
import { RelationChip, SideBadge, SideChip } from '../components/Side';
import { sideOf } from '../../engine/sides';
import { eveningKindOf } from '../../engine/evening';
import { adultOn } from '../../engine/datingState';
import { boldEligible } from '../../engine/quickies';
import { BoldFlow, CarFlow, EveningFlow } from './EveningFlow';

/**
 * THE CALLING CARD (engine/callingCard.ts): a person at a glance. The
 * summary first (who, what, family, what they want, where you stand, the
 * price when there is one), the details behind "More…". The orders on her
 * (payroll, a promise, the goomar) are ordinary order rows: cost, who pays,
 * her odds and why. Adults only: a minor has no card.
 */

function Tone({ l }: { l: CardLine }) {
  const tone = l.tone === 'good' ? 'text-emerald-300' : l.tone === 'bad' ? 'text-red-300' : l.tone === 'warn' ? 'text-amber-200' : 'text-stone-100';
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-0.5 text-[12px] leading-snug">
      <dt className="text-stone-500">{l.label}</dt>
      <dd className={tone}>{l.text}</dd>
    </div>
  );
}

function Sec({ title, children, testid }: { title: string; children: ReactNode; testid?: string }) {
  return (
    <section className="rounded-md border border-noir-700 bg-noir-900/50 p-2.5" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-gold-500/80 mb-1">{title}</div>
      {children}
    </section>
  );
}

export function CallingCard({ s, id, actions = true, startOpen = false }: { s: GameState; id: string; actions?: boolean; startOpen?: boolean }) {
  const [more, setMore] = useState(startOpen);
  const [flow, setFlow] = useState<'evening' | 'car' | 'bold' | undefined>();
  const v = callingCard(s, id);
  const c = s.characters[id];
  if (!v || !c) return <p className="text-xs text-stone-500" data-testid="calling-card-none">No calling card: adults only.</p>;
  const acts = actions ? nightActionsFor(s, id) : [];
  const side = sideOf(s, id);
  return (
    <article className="space-y-2.5" data-testid="calling-card" data-id={id}>
      {/* The card itself: an engraved little rectangle, gold rule, the face. */}
      <div className="relative rounded-lg border border-gold-600/50 bg-gradient-to-br from-noir-800 via-noir-900 to-noir-950 p-3 shadow-[inset_0_0_0_3px_rgba(0,0,0,0.35)]">
        <div className="pointer-events-none absolute inset-1.5 rounded-md border border-gold-500/20" />
        <div className="relative flex gap-3">
          <div className="relative shrink-0 self-start rounded-md" style={{ outline: `2px solid ${side.color}`, outlineOffset: '-1px' }}>
            <Portrait c={c} seed={s.seed} date={s.date} size={96} tint={FACTION_TINT[c.faction]} />
            <SideBadge side={side} size={96} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl leading-tight text-gold-300 break-words" data-testid="calling-card-name">{v.name}</h3>
            <div className="text-[12px] text-stone-300">{v.age} · {v.role}</div>
            {c.id !== s.playerId && <div className="mt-0.5 flex flex-wrap items-center gap-1" data-testid="calling-card-side"><SideChip side={side} full /><RelationChip relation={side.relation} /></div>}
            {v.place && <div className="text-[11px] text-stone-500 truncate">{v.place}</div>}
            <div className="mt-1.5 flex flex-wrap gap-1" data-testid="calling-card-looks">
              {v.looks.chips.map((ch) => (
                <span key={ch.text} className={`rounded-full border px-1.5 py-0.5 text-[10px] ${ch.good === true ? 'border-gold-500/60 text-gold-200' : ch.good === false ? 'border-red-400/40 text-red-200/90' : 'border-noir-600 text-stone-300'}`}>{ch.text}</span>
              ))}
              {v.traits.map((t) => <span key={t.name} title={t.text} className="rounded-full border border-noir-600 bg-noir-800 px-1.5 py-0.5 text-[10px] text-stone-200">{t.name}</span>)}
            </div>
          </div>
        </div>
        <dl className="relative mt-2.5 border-t border-gold-600/20 pt-2" data-testid="calling-card-summary">
          {v.summary.map((l) => <Tone key={l.label} l={l} />)}
        </dl>
      </div>

      {actions && (eveningKindOf(s, id) || boldEligible(s, id)) && (
        <div className="flex flex-wrap gap-1.5" data-testid="calling-card-flows">
          {eveningKindOf(s, id) && <button type="button" className="btn-gold text-xs py-1" onClick={() => setFlow('evening')} data-testid="open-evening">Plan an evening with {c.firstName}…</button>}
          {adultOn(s) && eveningKindOf(s, id) && <button type="button" className="btn-ghost text-xs py-1" onClick={() => setFlow('car')} data-testid="open-car">"Step outside to my car"…</button>}
          {boldEligible(s, id) && <button type="button" className="btn-ghost text-xs py-1" onClick={() => setFlow('bold')} data-testid="open-bold">A bold offer…</button>}
        </div>
      )}
      {flow === 'evening' && <EveningFlow s={s} id={id} onClose={() => setFlow(undefined)} />}
      {flow === 'car' && <CarFlow s={s} id={id} onClose={() => setFlow(undefined)} />}
      {flow === 'bold' && <BoldFlow s={s} id={id} onClose={() => setFlow(undefined)} />}

      {acts.length > 0 && (
        <div className="space-y-1.5" data-testid="calling-card-actions">
          {acts.slice(0, more ? acts.length : 2).map((a, i) => <ActionRow key={i} s={s} action={a} />)}
        </div>
      )}

      {c.id !== s.playerId && <BookAbout s={s} person={id} compact />}

      <button type="button" className="text-[12px] font-semibold text-gold-400 hover:text-gold-300" onClick={() => setMore((x) => !x)} aria-expanded={more} data-testid="calling-card-more">
        {more ? 'Less ▴' : `More… (appearance, skills, family, money, you, rumors${acts.length > 2 ? `, ${acts.length - 2} more orders` : ''})`}
      </button>

      {more && (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="calling-card-details">
          <Sec title="Appearance">
            <ul className="text-[12px] text-stone-200 space-y-0.5">
              {v.looks.tierLabel && <li>{v.looks.tierLabel}{v.looks.score !== undefined ? <span className="text-stone-500"> ({v.looks.score} of 100, as people see {v.gender === 'F' ? 'her' : 'him'} today)</span> : null}</li>}
              <li>Build: {v.looks.physiqueLabel}</li>
              <li>People remember: {v.looks.feature.toLowerCase()}</li>
              <li>Dresses: {v.looks.style.toLowerCase()}</li>
              {v.agingLooks && <li className="text-stone-400">{v.agingLooks}</li>}
              {v.impression && <li className="text-stone-400">To your eye: {v.impression}</li>}
            </ul>
          </Sec>
          <Sec title="Personality">
            {v.traits.length === 0 ? <p className="text-[12px] text-stone-500">Nothing that stands out yet.</p> : (
              <ul className="text-[12px] space-y-0.5">{v.traits.map((t) => <li key={t.name}><span className="text-stone-100">{t.name}:</span> <span className="text-stone-400">{t.text}</span></li>)}</ul>
            )}
          </Sec>
          <Sec title="Skills" testid="calling-card-skills">
            <ul className="space-y-1">
              {v.skills.map((k) => (
                <li key={k.label} className="flex items-center gap-2 text-[11px]" title={k.why.join('; ')}>
                  <span className="w-20 text-stone-400">{k.label}</span>
                  <span className="h-1.5 flex-1 rounded bg-noir-700 overflow-hidden"><span className="block h-full bg-gold-500/80" style={{ width: `${Math.min(100, k.effective)}%` }} /></span>
                  <span className="w-12 text-right tabular-nums text-stone-200">{k.effective}{k.learned !== k.effective ? <span className="text-red-300/80">/{k.learned}</span> : null}</span>
                </li>
              ))}
            </ul>
          </Sec>
          <Sec title="Health & age">
            <ul className="text-[12px] text-stone-200 space-y-0.5">
              <li>{v.age} years old, born {v.born}. Health {v.health}.</li>
              {v.aging.length === 0 ? <li className="text-stone-500">No conditions of age that you know of.</li> : v.aging.map((a) => <li key={a.label}>{a.label}{a.sure ? '' : ' (you have heard; not confirmed)'}: <span className="text-stone-400">{a.text}</span></li>)}
            </ul>
          </Sec>
          <Sec title="Family & household">
            <ul className="text-[12px] text-stone-200 space-y-0.5">{v.family.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </Sec>
          <Sec title="Work & money (as far as you know)">
            <ul className="text-[12px] text-stone-200 space-y-0.5">{v.money.map((f, i) => <li key={i}>{f}</li>)}</ul>
            <div className="mt-1 text-[11px] text-stone-500">Side: {v.side}</div>
          </Sec>
          {v.you.length > 0 && (
            <Sec title="You and them">
              <dl>{v.you.map((l, i) => <Tone key={i} l={l} />)}</dl>
            </Sec>
          )}
          <Sec title="What they want">
            <ul className="text-[12px] text-stone-200 space-y-0.5">{v.wants.map((w) => <li key={w}>{w}</li>)}</ul>
            {v.lines.length > 0 && <><div className="mt-1.5 text-[10px] uppercase tracking-wider text-stone-500">Her lines</div><ul className="text-[11px] text-stone-300">{v.lines.map((l) => <li key={l}>{l}</li>)}</ul></>}
          </Sec>
          <Sec title="Talk & rumors">
            {v.rumors.length === 0 ? <p className="text-[12px] text-stone-500">Nothing has reached you.</p> : (
              <ul className="text-[12px] space-y-0.5">{v.rumors.map((r, i) => (
                <li key={i} className="text-stone-200"><span className={`mr-1 rounded px-1 text-[9px] uppercase tracking-wider ${r.label === 'Rumor' ? 'bg-amber-900/60 text-amber-200' : 'bg-emerald-900/50 text-emerald-200'}`}>{r.label === 'Rumor' ? 'Rumor (unconfirmed)' : 'Known'}</span>{r.text}</li>
              ))}</ul>
            )}
          </Sec>
          {v.story.length > 0 && (
            <Sec title="Lately">
              <ul className="text-[11px] text-stone-400 space-y-0.5">{v.story.map((x, i) => <li key={i}>Week {x.week}: {x.text}</li>)}</ul>
            </Sec>
          )}
        </div>
      )}
    </article>
  );
}
