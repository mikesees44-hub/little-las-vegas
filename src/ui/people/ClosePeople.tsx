import { useMemo } from 'react';
import { closePeople, isPinned, pinnedIds, PIN_SOFT_CAP, togglePin } from '../../engine/pins';
import type { GameState } from '../../engine/types';
import { Face } from '../components/People';
import { useShell } from '../shell/context';

/**
 * CLOSE PEOPLE (engine/pins.ts): the ★ on a person, and the strip of the people the boss keeps close,
 * grouped by what they are to him (wife, kids, goomar, a politician, a cop, a celebrity…). One click on a
 * face opens the sheet; a badge says when one of them is in trouble, wants to see him, or has died.
 */

/** The ★ toggle. */
export function PinStar({ s, id, className = '', label }: { s: GameState; id: string; className?: string; label?: boolean }) {
  const shell = useShell();
  const c = s.characters[id];
  if (!c || id === s.playerId) return null;
  const on = isPinned(s, id);
  const n = pinnedIds(s).length;
  const title = on ? `${c.firstName} is one of your close people. Click to take ${c.gender === 'F' ? 'her' : 'him'} off.` : `Keep ${c.firstName} close: a quick link in the Black book${n >= PIN_SOFT_CAP ? ` (you already keep ${n} close; the strip scrolls)` : ''}.`;
  const flip = () => {
    const f = (x: GameState) => togglePin(x, id, !on);
    const what = on ? `${c.firstName} ${c.lastName} is off your close people` : `${c.firstName} ${c.lastName} is one of your close people`;
    if (shell.act) shell.act(f, what);
    else shell.update?.(f);
  };
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); flip(); }} aria-pressed={on} aria-label={on ? `Unpin ${c.firstName}` : `Pin ${c.firstName} as a close person`} title={title} data-testid="pin-star" data-on={on ? 1 : 0}
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1 leading-none ${on ? 'text-gold-300' : 'text-stone-500 hover:text-gold-300'} ${className}`}>
      <span aria-hidden className="text-[15px]">{on ? '★' : '☆'}</span>{label && <span className="text-[11px]">{on ? 'Close' : 'Keep close'}</span>}
    </button>
  );
}

const NEWS_STYLE = { dead: 'bg-stone-600 text-stone-100', trouble: 'bg-blood-500 text-white', see: 'bg-gold-500 text-noir-950' } as const;
const NEWS_GLYPH = { dead: '✝', trouble: '!', see: '☏' } as const;

/** The strip: close people by tag, scrolling sideways past the soft cap. */
export function CloseStrip({ s, tone = 'noir' }: { s: GameState; tone?: 'noir' | 'paper' }) {
  const groups = useMemo(() => closePeople(s), [s]);
  const n = groups.reduce((a, g) => a + g.people.length, 0);
  const ink = tone === 'paper' ? 'text-[#4a3b28]' : 'text-stone-400';
  return (
    <div className={`rounded border ${tone === 'paper' ? 'border-[#2a2118]/25 bg-[#fffaf0]/60' : 'border-noir-700 bg-noir-900/70'} px-2 py-1.5`} data-testid="close-strip">
      <div className={`flex items-baseline justify-between text-[10px] uppercase tracking-[0.2em] ${ink}`}>
        <span>★ Close people <span className="normal-case tracking-normal opacity-70">{n}{n > PIN_SOFT_CAP ? ` (more than ${PIN_SOFT_CAP}: scroll)` : ''}</span></span>
      </div>
      {!n ? <p className={`mt-0.5 text-[12px] ${ink}`}>Nobody yet. The ☆ on a face or a sheet keeps someone here.</p> : (
        <div className="mt-1 flex gap-3 overflow-x-auto pb-1" role="list">
          {groups.map((g) => (
            <div key={g.tag} className="shrink-0" data-testid="close-group" data-tag={g.tag}>
              <div className={`mb-0.5 text-[10px] font-semibold ${ink}`}>{g.tag}{g.people.length > 1 ? ` · ${g.people.length}` : ''}</div>
              <div className="flex gap-1.5">
                {g.people.map((p) => {
                  const c = s.characters[p.id];
                  return (
                    <div key={p.id} role="listitem" className={`relative w-[52px] text-center ${c.alive ? '' : 'opacity-60 grayscale'}`} title={`${p.name} · ${p.tag}${p.news ? ` · ${p.news.text}` : ''}`} data-testid="close-face" data-news={p.news?.kind}>
                      <Face s={s} c={c} size={44} noSide />
                      {p.news && <span className={`absolute -right-0.5 -top-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${NEWS_STYLE[p.news.kind]}`} aria-label={p.news.text}>{NEWS_GLYPH[p.news.kind]}</span>}
                      <div className={`truncate text-[10px] leading-tight ${tone === 'paper' ? 'text-[#2a2118]' : 'text-stone-300'}`}>{c.firstName}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
