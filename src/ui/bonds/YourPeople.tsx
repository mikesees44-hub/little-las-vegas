import { useState } from 'react';
import { StandingButton, StandingList } from '../appts/Standing';
import { bondGroups, bondsLog, MOOD_TEXT, type BondCard, type BondGroupId } from '../../engine/bonds';
import { ROLE_LABEL } from '../../engine/bondsState';
import type { GameState } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { CharLink, Face } from '../components/People';
import { SideChip } from '../components/Side';

/**
 * YOUR PEOPLE (engine/bonds.ts): the boss's wife, goomars and lovers, kids,
 * friends, crew and enemies, each on a card: where it stands (the stage),
 * how they feel (the axes as bars), what they want right now, what they
 * remember, what they say today, and the gestures that fit (ordinary order
 * rows: hours, cost, their odds of saying yes). They always decide.
 */

const TONE: Record<BondCard['tone'], string> = {
  good: 'border-emerald-700/60 bg-emerald-900/40 text-emerald-200',
  warn: 'border-amber-600/60 bg-amber-900/30 text-amber-200',
  bad: 'border-blood-500/60 bg-blood-500/20 text-red-200',
  neutral: 'border-noir-600 bg-noir-800 text-stone-300',
};

const BAR: Record<string, string> = {
  aff: 'bg-rose-400', trust: 'bg-sky-400', respect: 'bg-gold-400', fear: 'bg-violet-400', attr: 'bg-pink-400', resent: 'bg-red-500',
};

function Bars({ card }: { card: BondCard }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3" data-testid="bond-axes">
      {card.axes.map((a) => (
        <div key={a.key} className="min-w-0" title={`${a.label}: ${a.v} of 100`}>
          <div className="flex justify-between text-[10px] text-stone-400"><span>{a.label}</span><span>{a.v}</span></div>
          <div className="h-1.5 overflow-hidden rounded bg-noir-700" role="meter" aria-label={a.label} aria-valuenow={a.v} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full ${BAR[a.key] ?? 'bg-stone-400'}`} style={{ width: `${a.v}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ s, card, open, onToggle }: { s: GameState; card: BondCard; open: boolean; onToggle: () => void }) {
  const c = s.characters[card.id];
  const [all, setAll] = useState(false);
  if (!c) return null;
  const gestures = all ? card.gestures : card.gestures.slice(0, 3);
  return (
    <article className="rounded-lg border border-noir-700 bg-noir-900/70 p-2.5" data-testid="bond-card" data-role={card.role} data-stage={card.stage}>
      <div className="flex items-start gap-2.5">
        <Face s={s} c={c} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CharLink s={s} id={c.id} />
            <span className="text-[11px] text-stone-500">{card.age}</span>
            <SideChip s={s} id={c.id} />
            <span className={`rounded border px-1.5 py-px text-[10px] font-semibold ${TONE[card.tone]}`} data-testid="bond-stage">{card.stageText}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-stone-400">
            {ROLE_LABEL[card.role]} · <span className="text-stone-300">{MOOD_TEXT[card.mood]} today</span>
            {card.badges.map((b) => <span key={b} className="ml-1.5 rounded bg-noir-800 px-1 py-px text-[10px] text-amber-200" data-testid="bond-badge">{b}</span>)}
          </div>
          <p className="mt-1 text-[12px] italic text-stone-200" data-testid="bond-line">{card.line}</p>
          {card.now && <p className="mt-0.5 text-[11px] text-gold-300" data-testid="bond-want-now"><span className="text-stone-500">Wants right now:</span> {card.now}</p>}
        </div>
      </div>
      <div className="mt-2"><Bars card={card} /></div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {gestures.map((a, i) => <ActionRow key={i} s={s} action={a} />)}
      </div>
      <div className="mt-1 flex gap-3 text-[11px]">
        <StandingButton who={c.id} label="Make it standing…" className="text-gold-400 hover:text-gold-300" testid="bond-standing" />
        {card.gestures.length > 3 && <button type="button" className="text-gold-400 hover:text-gold-300" onClick={() => setAll((x) => !x)}>{all ? 'Fewer ▴' : `All ${card.gestures.length} gestures ▾`}</button>}
        <button type="button" className="text-stone-400 hover:text-stone-200" onClick={onToggle} aria-expanded={open} data-testid="bond-more">{open ? 'Less ▴' : 'What they want, what they remember ▾'}</button>
      </div>
      {open && (
        <div className="mt-1.5 grid gap-2 border-t border-noir-700 pt-1.5 sm:grid-cols-2">
          <div data-testid="bond-wants">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Wants</div>
            <ul className="mt-0.5 space-y-0.5 text-[11px]">
              {card.wants.map((w) => <li key={w.key} className={w.met ? 'text-stone-400' : 'text-amber-200'}>{w.met ? '✓' : '✗'} {w.text}</li>)}
            </ul>
          </div>
          <div data-testid="bond-memories">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Remembers</div>
            {!card.memories.length && <div className="text-[11px] text-stone-500">Nothing yet between you.</div>}
            <ul className="mt-0.5 space-y-0.5 text-[11px]">
              {card.memories.map((m, i) => <li key={i} className={m.v < 0 ? 'text-red-200' : m.v > 0 ? 'text-emerald-200' : 'text-stone-300'}><span className="text-stone-500">wk {m.w}:</span> {m.t}</li>)}
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}

export function YourPeople({ s }: { s: GameState }) {
  const groups = bondGroups(s);
  const [filter, setFilter] = useState<BondGroupId | 'all'>('all');
  const [open, setOpen] = useState<string | undefined>();
  const log = bondsLog(s, 6);
  const shown = groups.filter((g) => g.cards.length && (filter === 'all' || g.id === filter));
  return (
    <div className="space-y-3" data-testid="your-people">
      <p className="text-xs text-stone-400">Everyone close to you: how they feel, what they remember, what they want right now. They bring things up; they drift when you are never around. Every gesture takes hours of your day, and they always decide.</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Whose cards">
        {(['all', ...groups.filter((g) => g.cards.length).map((g) => g.id)] as (BondGroupId | 'all')[]).map((id) => {
          const g = groups.find((x) => x.id === id);
          return (
            <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} data-testid={`bond-filter-${id}`}
              className={`rounded border px-2 py-0.5 text-[11px] ${filter === id ? 'border-gold-500 bg-gold-500/20 text-gold-200' : 'border-noir-600 text-stone-400 hover:text-stone-200'}`}>
              {g ? `${g.label} ${g.cards.length}` : 'Everyone'}
            </button>
          );
        })}
      </div>
      {log.length > 0 && (
        <ul className="rounded border border-noir-700 bg-noir-900/50 p-2 text-[11px] text-stone-300" data-testid="bond-log">
          {log.map(([w, t], i) => <li key={i}><span className="text-stone-500">wk {w}:</span> {t}</li>)}
        </ul>
      )}
      <StandingList s={s} />
      {!shown.length && <div className="text-xs text-stone-500">Nobody close to you yet.</div>}
      {shown.map((g) => (
        <section key={g.id} data-testid={`bond-group-${g.id}`}>
          <h3 className="mb-1 text-[10px] uppercase tracking-[0.25em] text-stone-500">{g.label}</h3>
          <div className="space-y-2">
            {g.cards.map((card) => <Card key={card.id} s={s} card={card} open={open === card.id} onToggle={() => setOpen((x) => (x === card.id ? undefined : card.id))} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
