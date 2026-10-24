import { useState } from 'react';
import { formatDate } from '../../engine/calendar';
import { BULLETIN, LEADER, frontPage } from '../../engine/newspaper';
import type { GameState } from '../../engine/types';

/** The two front pages: the Wildwood Leader and the Philadelphia Bulletin. */
export function Newspapers({ s }: { s: GameState }) {
  const [paper, setPaper] = useState(LEADER);
  const items = frontPage(s, paper);
  const [lead, ...rest] = items;
  return (
    <div className="space-y-3" data-testid="newspaper">
      <div className="flex gap-1">
        {[LEADER, BULLETIN].map((p) => (
          <button key={p} onClick={() => setPaper(p)} className={`tab ${paper === p ? 'tab-active' : ''}`}>{p}</button>
        ))}
      </div>
      <article className="mx-auto max-w-3xl rounded-sm bg-[#e9e1cc] text-[#1a1714] p-4 sm:p-6 shadow-lg shadow-black/50" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
        <header className="text-center border-b-4 border-double border-[#1a1714] pb-2">
          <div className="text-[10px] uppercase tracking-[0.3em]">{paper === LEADER ? 'Serving the Five Mile Beach since 1906' : 'In Philadelphia nearly everybody reads'}</div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight" style={{ fontFamily: '"Old English Text MT", "UnifrakturMaguntia", Georgia, serif' }}>{paper === LEADER ? 'The Wildwood Leader' : 'The Evening Bulletin'}</h2>
          <div className="mt-1 flex justify-between text-[11px] border-t border-[#1a1714] pt-0.5">
            <span>{lead ? formatDate(lead.date) : formatDate(s.date)}</span>
            <span>{paper === LEADER ? 'Five Cents' : 'Seven Cents'}</span>
          </div>
        </header>
        {lead ? (
          <>
            <h3 className="mt-3 text-2xl sm:text-4xl font-black leading-tight text-center uppercase">{lead.headline}</h3>
            <p className="mt-2 text-sm sm:text-base leading-relaxed first-letter:text-3xl first-letter:font-bold first-letter:float-left first-letter:mr-1">{lead.body}</p>
            {rest.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 border-t border-[#1a1714] pt-3">
                {rest.map((n, i) => (
                  <div key={i} className="border-b border-[#1a1714]/30 pb-2">
                    <div className="text-[10px] uppercase tracking-widest text-[#5a5248]">{formatDate(n.date)}</div>
                    <h4 className="font-bold leading-snug uppercase text-sm">{n.headline}</h4>
                    <p className="text-xs leading-snug mt-0.5">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-center italic">The presses have not run yet. Check back after the first week.</p>
        )}
      </article>
      <p className="text-xs text-stone-500 text-center">Headlines about your business bring heat — every one shows up by name in the weekly report.</p>
    </div>
  );
}
