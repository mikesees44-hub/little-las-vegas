import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatDate } from '../../engine/calendar';
import { DAY_NAMES } from '../../engine/days';
import {
  adPlaces, DAILY, editionsOut, isOut, proofs, unreadCount, markPaperRead, WEEKLY, type Edition, type PItem, type Sec,
} from '../../engine/paper';
import { DAILY_MOTTO, WEEKLY_MOTTO, BYLINES } from '../../engine/paperData';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionCard, useOrders } from '../components/Orders';
import { Newspapers } from '../components/Newspaper';
import { useShell } from '../shell/context';
import { PaperVoice } from './PaperVoice';

/**
 * The town papers on the boss's desk: the Wildwood Daily Tide every morning
 * and the Five Mile Beach Weekly Leader on Thursdays, set as a 1960
 * broadsheet (masthead, rules, columns, a halftone made of CSS dots — no
 * images). Back issues, the editor's proofs (spike a story before it runs),
 * plants, ads, buying the paper and the libel suit live under the sheet.
 * Everything printed comes from the engine (engine/paper.ts).
 */

const INK = '#1a1714';
const PAPER_BG = '#ece4cf';

const SERIF = 'Georgia, "Times New Roman", serif';
const BLACK = '"Old English Text MT", "UnifrakturMaguntia", "Engravers Old English", Georgia, serif';

/** Items the boss has an order queued to spike (they will never run). */
function useSpiking(): Set<string> {
  const { orders } = useOrders();
  return useMemo(() => new Set(orders.flatMap((a) => (a.kind === 'paper' && a.op.op === 'kill' ? [a.op.item] : []))), [orders]);
}

export function PaperReader({ s }: { s: GameState }) {
  const [kind, setKind] = useState<'daily' | 'weekly' | 'bulletin'>('daily');
  const out = editionsOut(s, kind === 'bulletin' ? undefined : kind);
  const [pickedId, setPicked] = useState<string | undefined>();
  const ed = kind === 'bulletin' ? undefined : out.find((e) => e.id === pickedId) ?? out[0];
  const shell = useShell();
  const unread = unreadCount(s);
  // Reading the paper marks it read (the desk's dot goes out).
  useEffect(() => {
    if (ed && ed.n > (s.paper?.read ?? 0)) shell.update?.((cur) => markPaperRead(cur, Math.max(ed.n, cur.paper?.read ?? 0)));
  }, [ed?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3" data-testid="paper-reader">
      <div className="flex flex-wrap items-center gap-1">
        <button className={`tab ${kind === 'daily' ? 'tab-active' : ''}`} onClick={() => { setKind('daily'); setPicked(undefined); }} data-testid="paper-daily">The Daily Tide</button>
        <button className={`tab ${kind === 'weekly' ? 'tab-active' : ''}`} onClick={() => { setKind('weekly'); setPicked(undefined); }} data-testid="paper-weekly">The Weekly Leader</button>
        <button className={`tab ${kind === 'bulletin' ? 'tab-active' : ''}`} onClick={() => setKind('bulletin')}>Philadelphia papers</button>
        {unread > 0 && <span className="ml-1 rounded-full bg-blood-500 px-1.5 text-[11px] font-bold text-white" data-testid="paper-unread">{unread} new</span>}
        {kind !== 'bulletin' && out.length > 1 && (
          <select className="inp ml-auto w-auto text-xs" value={ed?.id} onChange={(e) => setPicked(e.target.value)} data-testid="paper-archive" aria-label="Back issues">
            {out.map((e) => <option key={e.id} value={e.id}>{e.kind === 'daily' ? `${DAY_NAMES[e.day]}, ` : 'Thursday, '}{formatDate(e.date)}{e.n > (s.paper?.read ?? 0) ? ' • new' : ''}</option>)}
          </select>
        )}
      </div>
      {kind !== 'bulletin' && ed && <PaperVoice s={s} week={ed.week} />}
      {kind === 'bulletin' ? <Newspapers s={s} /> : ed ? <Broadsheet s={s} ed={ed} /> : (
        <div className="mx-auto max-w-3xl rounded-sm p-6 text-center italic shadow-lg shadow-black/50" style={{ background: PAPER_BG, color: INK, fontFamily: SERIF }}>
          The presses run Sunday night. The first {kind === 'daily' ? 'Daily Tide lands on your desk Monday morning' : 'Weekly Leader comes out Thursday'}, once a week has been played.
        </div>
      )}
      {kind !== 'bulletin' && <EditorDesk s={s} />}
    </div>
  );
}

const SEC_TITLE: Partial<Record<Sec, string>> = {
  blotter: 'Police Blotter', deeds: 'Deeds Recorded', business: 'Business', society: 'Society', sports: 'Sports', weather: 'Weather & Tides',
  classified: 'Classified', wire: 'From the Wire Services', review: 'The Week in Review', editorial: 'Editorial',
};

const ORDER: Sec[] = ['wire', 'blotter', 'deeds', 'business', 'society', 'sports', 'weather', 'editorial'];

function Halftone({ caption }: { caption: string }) {
  return (
    <figure className="my-2 break-inside-avoid">
      <div aria-hidden className="h-28 sm:h-36 w-full border" style={{ borderColor: INK, backgroundColor: '#d8cfb8', backgroundImage: `radial-gradient(${INK} 0.9px, transparent 1.25px), radial-gradient(${INK}aa 0.7px, transparent 1.1px), linear-gradient(160deg, transparent 30%, ${INK}55 55%, transparent 75%)`, backgroundSize: '4px 4px, 6px 6px, 100% 100%', backgroundPosition: '0 0, 2px 2px, 0 0', filter: 'contrast(1.1)' }} />
      <figcaption className="mt-0.5 text-[10px] italic leading-tight">{caption}</figcaption>
    </figure>
  );
}

function Rule({ double }: { double?: boolean }) {
  return <div className={double ? 'border-t-4 border-double' : 'border-t'} style={{ borderColor: INK }} />;
}

function SecHead({ children }: { children: ReactNode }) {
  return <h4 className="mt-3 mb-1 border-y py-0.5 text-center text-[11px] font-bold uppercase tracking-[0.25em] break-after-avoid" style={{ borderColor: INK }}>{children}</h4>;
}

function Broadsheet({ s, ed }: { s: GameState; ed: Edition }) {
  const spiking = useSpiking();
  const items = ed.items.filter((x) => !x.sp && !spiking.has(x.id) && !(x.src && spiking.has(x.src)));
  const daily = ed.kind === 'daily';
  const front = items.filter((x) => x.s === 'front' || x.s === 'feature').sort((a, b) => (b.p ?? 0) - (a.p ?? 0));
  const [lead, ...more] = front;
  const by = (sec: Sec) => items.filter((x) => x.s === sec);
  const name = daily ? DAILY : WEEKLY;
  const vol = daily ? 'LXIV' : 'LIV';
  return (
    <article className="mx-auto max-w-5xl rounded-sm p-3 sm:p-6 shadow-lg shadow-black/50" style={{ background: PAPER_BG, color: INK, fontFamily: SERIF, backgroundImage: 'radial-gradient(#0000000a 1px, transparent 1px)', backgroundSize: '3px 3px' }} data-testid={`edition-${ed.kind}`}>
      <header className="text-center">
        <div className="flex justify-between text-[9px] sm:text-[10px] uppercase tracking-widest">
          <span>Vol. {vol} · No. {ed.n}</span>
          <span className="hidden sm:inline">{daily ? 'Morning Edition' : 'Thursday Edition'}</span>
          <span>{daily ? 'Five Cents' : 'Ten Cents'}</span>
        </div>
        <Rule />
        <h2 className="my-1 text-[2rem] leading-none sm:text-6xl" style={{ fontFamily: BLACK }} data-testid="masthead">{name}</h2>
        <div className="text-[10px] sm:text-xs italic">{daily ? DAILY_MOTTO : WEEKLY_MOTTO}</div>
        <div className="mt-1"><Rule double /></div>
        <div className="flex justify-between py-0.5 text-[10px] sm:text-[11px] uppercase tracking-wide">
          <span>Wildwood, N.J.</span>
          <span>{daily ? DAY_NAMES[ed.day] : 'Thursday'}, {formatDate(ed.date)}</span>
          <span className="hidden sm:inline">{s.paper?.owned !== undefined ? 'An Independent Newspaper (new owners)' : 'An Independent Newspaper'}</span>
        </div>
        <Rule />
      </header>

      {lead && (
        <section className="mt-2 sm:grid sm:grid-cols-3 sm:gap-4">
          <div className="sm:col-span-2">
            <h3 className="text-2xl sm:text-4xl font-black uppercase leading-[1.05] text-center" data-testid="lead-headline">{lead.h}</h3>
            {lead.x && <div className="mt-1 text-center text-[10px] uppercase tracking-widest">{lead.x}</div>}
            <Halftone caption={caption(lead)} />
            <p className="text-sm sm:text-[15px] leading-relaxed text-justify first-letter:float-left first-letter:mr-1 first-letter:text-4xl first-letter:font-bold first-letter:leading-none">{lead.b}<Marks it={lead} s={s} /></p>
          </div>
          <div className="mt-3 sm:mt-0 sm:border-l sm:pl-4" style={{ borderColor: INK }}>
            {more.slice(0, 3).map((x) => <Story key={x.id} it={x} s={s} big />)}
            <Spout s={s} items={by('spout')} weekly={!daily} />
          </div>
        </section>
      )}
      {!lead && <Spout s={s} items={by('spout')} weekly={!daily} />}

      <div className="mt-3"><Rule double /></div>
      <div className="mt-2 columns-1 sm:columns-2 lg:columns-3 gap-5 [column-rule:1px_solid_#1a171455]">
        {more.slice(3).map((x) => <Story key={x.id} it={x} s={s} />)}
        {ORDER.map((sec) => {
          const list = by(sec).filter((x) => !(sec === 'business' && x.ad));
          if (!list.length) return null;
          return (
            <section key={sec} className="break-inside-avoid-column" data-testid={`sec-${sec}`}>
              <SecHead>{SEC_TITLE[sec]}</SecHead>
              {BYLINES[sec] && <div className="text-[9px] italic text-center mb-1">{BYLINES[sec][0]}</div>}
              {list.map((x) => <Story key={x.id} it={x} s={s} compact={sec !== 'editorial' && sec !== 'review'} />)}
            </section>
          );
        })}
        {by('review').map((x) => <section key={x.id} className="break-inside-avoid-column"><SecHead>The Week in Review</SecHead><p className="text-xs leading-snug">{x.b}</p></section>)}
        <Entertainment items={by('ent')} weekly={!daily} />
        <Ads items={by('business').filter((x) => x.ad)} />
        <Classifieds s={s} items={by('classified')} />
      </div>
    </article>
  );
}

function caption(it: PItem): string {
  const h = it.h ?? '';
  if (/ARREST|POLICE|RAID/.test(h)) return 'Detectives outside headquarters on Pacific Avenue. (Tide photo)';
  if (/DEAD|BODY|KILL/.test(h)) return 'The block where it happened, as it looked Tuesday morning. (Tide photo)';
  if (/SEASON|BOARDWALK|CROWD|PIER|FIREWORK/.test(h)) return 'The Boardwalk at Schellenger Avenue on a busy evening. (Tide photo)';
  if (/ELECT|VOTE|COMMISSION|MAYOR/.test(h)) return 'Election night at City Hall. (Tide photo)';
  return 'Wildwood, as our photographer found it this week. (Tide photo)';
}

function Marks({ it, s }: { it: PItem; s: GameState }) {
  return (
    <>
      {it.pl && <span className="ml-1 rounded-sm bg-[#1a171415] px-1 text-[9px] uppercase tracking-wide" title="You put this story in the paper">your plant</span>}
      <SueLink it={it} s={s} />
    </>
  );
}

function Story({ it, s, big, compact }: { it: PItem; s: GameState; big?: boolean; compact?: boolean }) {
  return (
    <div className={`break-inside-avoid ${compact ? 'mb-1.5' : 'mb-3 border-b pb-2'}`} style={{ borderColor: `${INK}44` }} data-testid={`story-${it.s}`}>
      {it.h && <h5 className={`${big ? 'text-base sm:text-lg uppercase' : compact ? 'text-xs font-bold' : 'text-sm uppercase'} font-black leading-tight`}>{it.h}</h5>}
      <p className={`${compact ? 'text-[11px]' : 'text-xs sm:text-[13px]'} leading-snug text-justify`}>{it.b}<Marks it={it} s={s} /></p>
    </div>
  );
}

function Spout({ s, items, weekly }: { s: GameState; items: PItem[]; weekly: boolean }) {
  if (!items.length) return null;
  return (
    <section className="mt-2 border-2 p-2 break-inside-avoid" style={{ borderColor: INK }} data-testid="spout-off">
      <h4 className="text-center text-xl font-black italic tracking-tight">SPOUT OFF!</h4>
      <div className="text-center text-[9px] uppercase tracking-widest">Call KEystone 2-1960 · Anonymous · {weekly ? 'The best of the week' : 'Today\'s calls'}</div>
      <div className="text-center text-[8px] italic">Opinions are the callers' own. The Tide does not vouch for them.</div>
      <ul className="mt-1 space-y-1">
        {items.map((x) => <li key={x.id} className="text-[12px] leading-snug italic">"{x.b}"<SueLink it={x} s={s} /></li>)}
      </ul>
    </section>
  );
}

function Entertainment({ items, weekly }: { items: PItem[]; weekly: boolean }) {
  if (!items.length) return null;
  return (
    <section className="mt-2 border p-2 break-inside-avoid-column" style={{ borderColor: INK }} data-testid="whos-playing">
      <h4 className="text-center font-black uppercase leading-tight">{weekly ? 'Who\'s Playing in Wildwood This Week' : 'Tonight on the Island'}</h4>
      <div className="text-center text-[9px] italic mb-1">{BYLINES.ent[0]}</div>
      {items.map((x) => (
        <div key={x.id} className={`mb-1.5 ${x.ad ? 'border-2 p-1' : ''}`} style={{ borderColor: INK }} data-testid={x.own ? 'ent-own' : 'ent-room'}>
          <div className="text-[11px] font-bold uppercase leading-tight">{x.h}{x.own ? <span className="ml-1 text-[9px] font-normal normal-case italic" title="One of your places">(yours)</span> : null}</div>
          <div className="text-[12px] leading-tight">{x.b}{x.ho ? <span className="ml-1 text-[9px] font-bold uppercase">· Held over by popular demand!</span> : null}</div>
          {x.x && <div className="text-[10px] italic leading-tight">{x.x}</div>}
          {weekly && x.r && <div className="text-[10px] leading-tight">"{x.r}"</div>}
        </div>
      ))}
    </section>
  );
}

function Ads({ items }: { items: PItem[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-2 space-y-1.5 break-inside-avoid-column" data-testid="paper-ads">
      {items.map((x) => (
        <div key={x.id} className="border-4 border-double p-2 text-center" style={{ borderColor: INK }}>
          <div className="text-[9px] uppercase tracking-widest">Advertisement</div>
          <div className="text-lg font-black leading-tight">{x.h}</div>
          <div className="text-[11px] italic">{x.b}</div>
        </div>
      ))}
    </section>
  );
}

function Classifieds({ s, items }: { s: GameState; items: PItem[] }) {
  const [open, setOpen] = useState<string | undefined>();
  if (!items.length) return null;
  return (
    <section className="break-inside-avoid-column" data-testid="classifieds">
      <SecHead>Classified</SecHead>
      {items.map((x) => {
        const lot = x.lot ? s.econ?.lots.find((l) => l.id === x.lot) : undefined;
        const live = !!lot && lot.status === 'sale';
        return (
          <div key={x.id} className="mb-1 text-[11px] leading-snug">
            <span className="font-bold">{x.h}. </span>
            {x.lot ? (
              <button type="button" className={`text-left ${live ? 'underline decoration-dotted' : 'line-through opacity-60'}`} onClick={() => live && setOpen(open === x.id ? undefined : x.id)} disabled={!live} data-testid="classified-lot" title={live ? 'Look at it: the offer, the price' : 'Sold'}>{x.b}</button>
            ) : x.b}
            {open === x.id && live && (
              <div className="mt-1 rounded bg-noir-900 p-1 text-stone-200" style={{ fontFamily: 'inherit' }}>
                <ActionCard s={s} action={{ kind: 'econ', op: { type: 'buyLot', lotId: x.lot! } }} compact />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** The libel suit, offered on a story about the boss or his people that has run. */
function SueLink({ it, s }: { it: PItem; s: GameState }) {
  const [open, setOpen] = useState(false);
  if (!(it.a === 'boss' || it.a === 'family') || it.pl || s.paper?.owned !== undefined || s.paper?.sued.includes(it.src ?? it.id)) return null;
  const action: PlayerAction = { kind: 'paper', op: { op: 'sue', item: it.src ?? it.id } };
  return (
    <span className="not-italic">
      <button type="button" className="ml-1 text-[9px] uppercase tracking-wide underline opacity-70 hover:opacity-100" onClick={() => setOpen((o) => !o)} data-testid="sue-link" title="Sue the paper for libel">⚖ sue</button>
      {open && <span className="mt-1 block rounded bg-noir-900 p-1 text-stone-200 not-italic" style={{ fontFamily: 'inherit' }}><ActionCard s={s} action={action} compact /></span>}
    </span>
  );
}

/** Under the sheet: the editor's proofs and what the boss can do with the paper. */
function EditorDesk({ s }: { s: GameState }) {
  const spiking = useSpiking();
  const galleys = proofs(s).filter((p) => !spiking.has(p.it.id));
  const owned = s.paper?.owned !== undefined;
  const mobs = s.rivals.filter((r) => r.kind === 'mob');
  const [rival, setRival] = useState<string>(mobs[0]?.id ?? '');
  const places = adPlaces(s);
  return (
    <div className="mx-auto max-w-5xl space-y-3 rounded border border-noir-700 bg-noir-900/60 p-3" data-testid="editor-desk">
      <div>
        <h3 className="font-display text-gold-300">The night editor's proofs {galleys.length ? <span className="text-xs text-amber-300">({galleys.length} about your people)</span> : null}</h3>
        <p className="text-xs text-stone-500">Stories set for later this week that name you or yours. {owned ? 'It is your paper: anything you spike never runs.' : 'An envelope and they never run — and what they would have done (the FBI reads the blotter, your wife reads Spout Off) never happens.'}</p>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          {galleys.length === 0 && <p className="text-sm text-stone-500">Nothing about you in this week's proofs.</p>}
          {galleys.map(({ ed, it }) => (
            <div key={it.id} className="rounded border border-noir-700 p-1.5" data-testid="proof">
              <div className="text-[10px] uppercase tracking-widest text-stone-500">Runs {DAY_NAMES[ed.day]}{isOut(s, ed) ? '' : ''} · {it.s === 'spout' ? 'Spout Off' : SEC_TITLE[it.s] ?? 'Front page'}</div>
              <div className="text-sm text-stone-300">{it.h ? <b>{it.h}. </b> : null}{it.b}</div>
              <ActionCard s={s} action={{ kind: 'paper', op: { op: 'kill', item: it.id } }} compact />
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-display text-gold-300">A word with the editor</h3>
        <div className="grid gap-1.5 sm:grid-cols-3">
          <ActionCard s={s} action={{ kind: 'paper', op: { op: 'plant', story: 'puff' } }} compact />
          <ActionCard s={s} action={{ kind: 'paper', op: { op: 'plant', story: 'notice' } }} compact />
          <div>
            {mobs.length > 1 && (
              <select className="inp mb-1 text-xs" value={rival} onChange={(e) => setRival(e.target.value)} aria-label="Which family">
                {mobs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
            <ActionCard s={s} action={{ kind: 'paper', op: { op: 'plant', story: 'smear', target: rival } }} compact />
          </div>
        </div>
      </div>
      <div>
        <h3 className="font-display text-gold-300">Advertise your places</h3>
        {places.length === 0 ? <p className="text-sm text-stone-500">You have no place the public walks into yet.</p> : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {places.map((p) => <ActionCard key={p.key} s={s} action={{ kind: 'paper', op: { op: 'ad', place: p.key } }} compact />)}
          </div>
        )}
      </div>
      <div>
        <h3 className="font-display text-gold-300">Own the paper</h3>
        <ActionCard s={s} action={{ kind: 'paper', op: { op: 'buy' } }} compact />
      </div>
    </div>
  );
}
