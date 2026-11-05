import { useEffect, useState } from 'react';
import { formatDate } from '../../engine/calendar';
import { enginePage, pageKey, paperBrief, paperPrompt, validatePage, type FrontPage, type PaperBrief } from '../../engine/ai/paper';
import { DAILY_MOTTO } from '../../engine/paperData';
import { DAILY } from '../../engine/paper';
import type { GameState } from '../../engine/types';
import { askJson, sampleOff, sampleWithin } from '../minds/sampleClient';

/**
 * "Read it in the paper's voice": the week's real events set as one front
 * page. Claude (the `sample` capability) may write it, strictly from the facts
 * the engine gathered (engine/ai/paper.ts checks every word); without Claude,
 * or when his page fails the checks, the paper's own columns are set in the
 * same page. A written page is kept per week in this browser (never the save).
 */

const INK = '#1a1714';
const PAPER_BG = '#ece4cf';
const SERIF = 'Georgia, "Times New Roman", serif';
const BLACK = '"Old English Text MT", "UnifrakturMaguntia", "Engravers Old English", Georgia, serif';

function cached(s: GameState, b: PaperBrief): FrontPage | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(pageKey(s, b.week));
    if (!raw) return undefined;
    const v = validatePage(s, JSON.parse(raw), b);
    return v.ok ? v.page : undefined;
  } catch { return undefined; }
}

function keep(s: GameState, week: number, p: FrontPage): void {
  try { globalThis.localStorage?.setItem(pageKey(s, week), JSON.stringify(p)); } catch { /* storage may be off: the page still shows */ }
}

/** The page for a week: the cached one, Claude's (checked), or the paper's own. Never throws. */
export async function setPage(s: GameState, b: PaperBrief): Promise<FrontPage> {
  const hit = cached(s, b);
  if (hit) return hit;
  try {
    const sample = await sampleWithin(800);
    if (sample && !sampleOff()) {
      const res = await askJson(sample, paperPrompt(s, b));
      if (res.kind === 'ok') {
        const v = validatePage(s, res.data, b);
        if (v.ok) { keep(s, b.week, v.page); return v.page; }
      }
    }
  } catch { /* fall through to the paper's own words */ }
  return enginePage(b);
}

/** The button and the page, for the week of the edition being read. */
export function PaperVoice({ s, week }: { s: GameState; week: number }) {
  const [open, setOpen] = useState(false);
  const [page, setPageState] = useState<FrontPage | undefined>();
  const [busy, setBusy] = useState(false);
  const b = paperBrief(s, week);
  useEffect(() => { setPageState(undefined); setOpen(false); }, [week]);
  if (!b || !b.facts.length) return null;
  const go = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (page) return;
    setBusy(true);
    setPageState(await setPage(s, b));
    setBusy(false);
  };
  return (
    <div className="mx-auto max-w-5xl" data-testid="paper-voice-wrap">
      <button type="button" className="btn-secondary text-xs" onClick={() => void go()} data-testid="paper-voice">{open ? 'Back to the edition' : 'Read it in the paper\'s voice ▸'}</button>
      {open && (busy || !page
        ? <div className="mt-2 rounded-sm p-6 text-center italic shadow-lg shadow-black/50" style={{ background: PAPER_BG, color: INK, fontFamily: SERIF }} data-testid="voice-busy">The presses are rolling…</div>
        : <div className="mt-2"><FrontPageView page={page} date={b.date} week={b.week} /></div>)}
    </div>
  );
}

/** One front page, set like a 1960 broadsheet. */
export function FrontPageView({ page, date, week }: { page: FrontPage; date: GameState['date']; week: number }) {
  const [lead, ...rest] = page.stories;
  return (
    <article className="mx-auto max-w-5xl rounded-sm p-3 shadow-lg shadow-black/50 sm:p-6" style={{ background: PAPER_BG, color: INK, fontFamily: SERIF, backgroundImage: 'radial-gradient(#0000000a 1px, transparent 1px)', backgroundSize: '3px 3px' }} data-testid="voice-page" data-by={page.by}>
      <header className="text-center">
        <div className="flex justify-between text-[9px] uppercase tracking-widest sm:text-[10px]">
          <span>Week {week}</span>
          <span className="hidden sm:inline">{page.by === 'claude' ? 'The Week in Our Words' : 'From Our Own Columns'}</span>
          <span>Five Cents</span>
        </div>
        <div className="border-t" style={{ borderColor: INK }} />
        <h2 className="my-1 text-[2rem] leading-none sm:text-6xl" style={{ fontFamily: BLACK }}>{DAILY}</h2>
        <div className="text-[10px] italic sm:text-xs">{DAILY_MOTTO}</div>
        <div className="mt-1 border-t-4 border-double" style={{ borderColor: INK }} />
        <div className="flex justify-between py-0.5 text-[10px] uppercase tracking-wide sm:text-[11px]"><span>Wildwood, N.J.</span><span>{formatDate(date)}</span></div>
        <div className="border-t" style={{ borderColor: INK }} />
      </header>
      <h3 className="mt-3 text-center text-2xl font-black uppercase leading-[1.05] sm:text-5xl" data-testid="voice-headline">{page.headline}</h3>
      {page.deck && <p className="mx-auto mt-1 max-w-3xl text-center text-sm italic sm:text-base">{page.deck}</p>}
      <div className="mt-3 border-t-4 border-double" style={{ borderColor: INK }} />
      <div className="mt-2 gap-5 sm:grid sm:grid-cols-3">
        <div className="sm:col-span-2">
          {lead && (
            <div className="mb-3 border-b pb-2" style={{ borderColor: `${INK}55` }} data-testid="voice-story">
              <h4 className="text-lg font-black uppercase leading-tight sm:text-2xl">{lead.h}</h4>
              <p className="mt-1 text-justify text-sm leading-relaxed first-letter:float-left first-letter:mr-1 first-letter:text-4xl first-letter:font-bold first-letter:leading-none sm:text-[15px]">{lead.b}</p>
            </div>
          )}
          <div className="columns-1 gap-5 sm:columns-2 [column-rule:1px_solid_#1a171455]">
            {rest.map((x, i) => (
              <div key={i} className="mb-3 break-inside-avoid border-b pb-2" style={{ borderColor: `${INK}44` }} data-testid="voice-story">
                <h5 className="text-sm font-black uppercase leading-tight">{x.h}</h5>
                <p className="text-justify text-xs leading-snug sm:text-[13px]">{x.b}</p>
              </div>
            ))}
          </div>
        </div>
        <aside className="mt-3 space-y-3 sm:mt-0 sm:border-l sm:pl-4" style={{ borderColor: INK }}>
          <section className="border-2 p-2" style={{ borderColor: INK }} data-testid="voice-gossip">
            <h4 className="text-center text-lg font-black italic tracking-tight">{page.gossip.h ?? 'Heard on the Boardwalk'}</h4>
            <div className="text-center text-[9px] uppercase tracking-widest">By Our Lady About Town</div>
            <p className="mt-1 text-[12px] italic leading-snug">{page.gossip.b}</p>
          </section>
          <section data-testid="voice-sports">
            <h4 className="border-y py-0.5 text-center text-[11px] font-bold uppercase tracking-[0.25em]" style={{ borderColor: INK }}>Sports & the Boardwalk</h4>
            <h5 className="mt-1 text-xs font-bold">{page.sports.h}</h5>
            <p className="text-[12px] leading-snug">{page.sports.b}</p>
          </section>
          {page.letter && (
            <section data-testid="voice-letter">
              <h4 className="border-y py-0.5 text-center text-[11px] font-bold uppercase tracking-[0.25em]" style={{ borderColor: INK }}>Letters to the Editor</h4>
              <p className="mt-1 text-[12px] leading-snug">{page.letter.b}</p>
              <p className="text-right text-[11px] italic">— {page.letter.from}</p>
            </section>
          )}
        </aside>
      </div>
      <p className="mt-2 text-center text-[9px] italic opacity-70">{page.by === 'claude' ? 'Set by the night editor from this week\'s stories.' : 'From the stories the Tide printed this week.'}</p>
    </article>
  );
}
