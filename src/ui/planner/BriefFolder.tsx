import type { BriefLine, DailyBrief, OldMan, Rec } from '../../engine/planner/brief';
import { oddsWord } from '../../engine/planner/brief';
import type { Go } from '../../engine/planner/intel';
import type { GameState } from '../../engine/types';
import { ConfStamp, Face, InkDot } from './ink';

/**
 * THE DAILY BRIEF: a typed, stamped manila folder, one page, read in ten seconds. Every line is a button
 * that goes where the line is about (the warning, the man, the money, the book). RECOMMENDED carries the
 * consigliere's reasons and the odds in words; "What would the old man do?" is his one pick, one tap.
 */
export function BriefFolder({ s, b, old, onGo, onOld }: { s: GameState; b: DailyBrief; old: OldMan; onGo: (g: Go) => void; onOld: (r: Rec) => void }) {
  const line = (l: BriefLine) => (
    <li key={l.id}>
      <button type="button" className="llv-brief-line" onClick={() => l.go && onGo(l.go)} disabled={!l.go} data-testid={`brief-line-${l.id}`} data-conf={l.conf}>
        <InkDot dom={l.dom} />
        <span className="min-w-0 flex-1">
          <span className={l.tone === 'bad' ? 'text-[#7d1d14]' : l.tone === 'good' ? 'text-[#1d5b33]' : ''}>{l.text}</span>
          {(l.sub || l.src) && <span className="block text-[11px] text-[#6b5a44]">{l.sub}{l.src ? <>{l.sub ? ' ' : ''}<span className="whitespace-nowrap">Source {l.src}.</span></> : null}</span>}
        </span>
        <ConfStamp conf={l.conf} />
      </button>
    </li>
  );
  const sec = (title: string, ls: BriefLine[], id: string) => (
    <section data-testid={`brief-${id}`}>
      <h4 className="llv-brief-h llv-type">{title}</h4>
      <ul className="mt-0.5">{ls.map(line)}</ul>
    </section>
  );
  return (
    <div className="mx-auto w-full max-w-[720px] pt-3" data-testid="daily-brief">
      <div className="llv-folder-tab llv-type">{b.low ? 'Word from the capo' : 'The daily brief'}</div>
      <div className="llv-folder llv-type relative px-3 pb-4 pt-3 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#6b5a44]">{b.date}</div>
            <div className="text-[13px]">{b.from}</div>
            <div className="text-[11px] text-[#6b5a44]" data-testid="brief-hours">{b.hours}</div>
          </div>
          <span className="llv-stamp text-[12px] sm:text-[14px]" data-testid="brief-stamp">{b.stamp}</span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <div>
            {sec('Situation', b.situation, 'situation')}
            {sec('Threats', b.threats, 'threats')}
          </div>
          <div>
            {sec('Money', b.money, 'money')}
            {sec('People', b.people, 'people')}
            {!b.low && (
              <section data-testid="brief-audience">
                <h4 className="llv-brief-h">Requests for an audience</h4>
                {b.audience.total === 0 ? <p className="px-1 py-1 text-[13px] text-[#6b5a44]">Nobody waiting at the door.</p> : (
                  <ul className="mt-0.5">
                    {b.audience.top.map((r, i) => (
                      <li key={r.key}>
                        <button type="button" className="llv-brief-line items-center" onClick={() => onGo({ audience: true })} data-testid={`brief-aud-${i}`}>
                          <span className="w-3 text-[11px] text-[#6b5a44]">{i + 1}.</span>
                          <Face s={s} id={r.charId} name={r.name} size={22} />
                          <span className="min-w-0 flex-1 truncate">{r.name} <span className="text-[11px] text-[#6b5a44]">· {r.desp.why[0] ?? r.close.why[0] ?? r.role}</span></span>
                          <span className="tabular-nums text-[11px] text-[#6b5a44]">{r.score}</span>
                        </button>
                      </li>
                    ))}
                    {b.audience.total > 3 && <li><button type="button" className="llv-brief-line text-[12px] text-[#6b5a44]" onClick={() => onGo({ audience: true })}>…and {b.audience.total - 3} more. The list ▸</button></li>}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>
        <section data-testid="brief-recommended" className="mt-1">
          <h4 className="llv-brief-h">Recommended</h4>
          {!b.recommended.length && <p className="px-1 py-1 text-[13px] text-[#6b5a44]">Sit tight. Nothing on the desk is worth a move today.</p>}
          <ol className="mt-1 space-y-1">
            {b.recommended.map((r, i) => (
              <li key={r.id} className="flex items-start gap-2 px-1" data-testid={`brief-rec-${i}`}>
                <span className="mt-0.5 text-[13px] font-bold">{i + 1}.</span>
                <span className="min-w-0 flex-1 text-[13px]">
                  <b>{r.title}</b>
                  <span className="block text-[12px] text-[#4a3b28]">{r.why}{r.odds !== undefined ? ` ${Math.round(r.odds * 100)}%: ${oddsWord(r.odds)}.` : ''}</span>
                </span>
                <button type="button" className="llv-ink-btn shrink-0" onClick={() => onOld(r)} data-testid={`brief-rec-go-${i}`}>{r.cta} ▸</button>
              </li>
            ))}
          </ol>
        </section>
        <OldManBox s={s} old={old} onOld={onOld} />
      </div>
    </div>
  );
}

/** "What would the old man do?": the consigliere's single pick, with the reason, one tap. */
export function OldManBox({ s, old, onOld }: { s: GameState; old: OldMan; onOld: (r: Rec) => void }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded border border-dashed border-[#2a2118]/50 bg-[#fffaf0]/50 p-2" data-testid="old-man">
      <Face s={s} id={old.byId} name={old.by} size={32} />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#6b5a44]">What would the old man do? · {old.by}</div>
        <p className="text-[13px] italic">"{old.voice}"</p>
      </div>
      {old.rec && <button type="button" className="llv-ink-btn llv-ink-btn-primary shrink-0" onClick={() => onOld(old.rec!)} data-testid="old-man-do">Do it</button>}
    </div>
  );
}
