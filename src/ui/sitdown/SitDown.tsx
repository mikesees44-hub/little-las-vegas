import { useMemo, useState } from 'react';
import { Backdrop } from '../hood/art/sceneArt';
import { briefing, recommendedActions, shortName, type BriefItem, type BriefLink, type BriefOption, type Briefing, type Speaker } from '../../engine/briefing';
import { ALL_LANES, LANE_NAME, leeway, neglect, roundOptions, roundSlots, usualWeek, type Lane, type Round } from '../../engine/rounds';
import type { GameState, PlayerAction } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { Chips } from '../components/Chips';
import { Face } from '../components/People';
import { fmt$ } from '../format';
import { TableButton } from '../advice/CounselTable';
import { previewAction } from '../../engine/actions';
import { oddsOfPreview, worstOfPreview, type OddsView } from '../../engine/decide';
import { DecisionCard, type DecisionOption } from '../decide/DecisionCard';

/**
 * The week, as the boss lives it: the Sit-Down (his people come in, one card
 * each, with ready-made options and their advice) and Your Rounds (his own
 * evenings: his people, his own time, his family; plus who he trusts to
 * handle their own business). A council-table row on a wide screen, a stack
 * of swipeable cards on a phone.
 */

export interface SitDownLesson {
  title: string;
  hint: string;
  onShow?: () => void;
}

export interface SitDownProps {
  s: GameState;
  /** The rounds picked this week (undefined: the usual week). */
  rounds: string[] | undefined;
  setRounds: (ids: string[] | undefined) => void;
  skip: string[];
  setSkip: (ids: string[]) => void;
  onTrust: (key: string, on: boolean) => void;
  /** Go somewhere (a drawer, a sheet, a trip, the office, a waiting decision): the sit-down closes. */
  onLink: (l: BriefLink) => void;
  onDecisions: () => void;
  onClose: () => void;
  lesson?: SitDownLesson;
  initialTab?: 'council' | 'rounds';
}

const same = (a: PlayerAction, b: PlayerAction) => JSON.stringify(a) === JSON.stringify(b);

/** New players hear the two most important things; everyone else up to six. */
export function visibleItems(s: GameState, b: Briefing): Set<string> {
  const cap = s.week <= 3 ? 2 : 6;
  return new Set([...b.items].sort((x, y) => y.priority - x.priority).slice(0, cap).map((i) => i.id));
}

export function SitDown({ s, rounds, setRounds, skip, setSkip, onTrust, onLink, onDecisions, onClose, lesson, initialTab = 'council' }: SitDownProps) {
  const b = useMemo(() => briefing(s), [s]);
  const [tab, setTab] = useState<'council' | 'rounds'>(initialTab);
  const { orders, queue, remove } = useOrders();
  const shown = visibleItems(s, b);
  const speakers = b.speakers.map((sp) => ({ ...sp, items: sp.items.filter((i) => shown.has(i.id)) })).filter((sp) => sp.items.length || sp.empty || sp.role === 'underboss' || sp.role === 'consigliere');
  const recs = recommendedActions(s, { ...b, items: b.items.filter((i) => shown.has(i.id)) }, orders, skip);

  function choose(it: BriefItem, o: BriefOption) {
    // One answer per item: picking another option takes back the first.
    for (const other of it.options) {
      if (other.id === o.id || !other.action) continue;
      const i = orders.findIndex((x) => same(x, other.action!));
      if (i >= 0) remove(i);
    }
    if (skip.includes(it.id)) setSkip(skip.filter((x) => x !== it.id));
    if (o.id === 'wait') { setSkip([...skip.filter((x) => x !== it.id), it.id]); return; }
    if (o.action) { if (!orders.some((x) => same(x, o.action!))) queue(o.action); return; }
    if (o.link) onLink(o.link);
  }

  const recCost = recs.reduce((n, r) => n + (previewAction(s, r.action).cost || 0), 0);

  function acceptAll() {
    for (const r of recs) queue(r.action);
  }

  return (
    <div className="fixed inset-0 z-[1180] flex items-stretch sm:items-center justify-center bg-black/75 backdrop-blur-sm" data-testid="sitdown" onClick={onClose}>
      <div className="relative flex max-h-[100dvh] w-full flex-col overflow-hidden border-gold-600/40 bg-noir-950/95 sm:max-h-[94vh] sm:max-w-[1400px] sm:rounded-lg sm:border" onClick={(e) => e.stopPropagation()}>
        <header className="relative isolate overflow-hidden flex flex-wrap items-center gap-2 border-b border-noir-700 px-3 py-2">
          <Backdrop k={tab === 'council' ? 'scene_boss_office' : ['street_pacific_neon', 'scene_club_stage']} opacity={0.22} className="-z-10" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl text-gold-400 leading-tight">{tab === 'council' ? 'The Sit-Down' : 'Your Rounds'}</div>
            <div className="text-[11px] text-stone-500">Week {s.week} · {tab === 'council' ? (b.quiet ? 'A quiet week. Nobody has much to say.' : `${shown.size} thing${shown.size === 1 ? '' : 's'} on the table`) : 'How you spend your evenings'}</div>
          </div>
          <nav className="flex rounded border border-noir-600 text-xs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'council'} data-testid="sitdown-tab-council" onClick={() => setTab('council')} className={`px-3 py-1.5 ${tab === 'council' ? 'bg-gold-500 text-noir-950 font-semibold' : 'text-stone-300'}`}>Your people</button>
            <button type="button" role="tab" aria-selected={tab === 'rounds'} data-testid="sitdown-tab-rounds" onClick={() => setTab('rounds')} className={`px-3 py-1.5 ${tab === 'rounds' ? 'bg-gold-500 text-noir-950 font-semibold' : 'text-stone-300'}`}>Your rounds</button>
          </nav>
          <button type="button" className="text-xs text-stone-400 hover:text-gold-300" onClick={onClose} data-testid="sitdown-close">close ×</button>
        </header>

        {tab === 'council' ? (
          <>
            {b.decisions > 0 && (
              <button type="button" onClick={onDecisions} data-testid="sitdown-decisions" className="mx-3 mt-2 rounded border border-amber-600/60 bg-amber-900/10 px-2 py-1 text-left text-[12px] text-amber-200 hover:bg-amber-900/20">
                ✉ {b.decisions} decision{b.decisions > 1 ? 's' : ''} on your desk — read them ▸
              </button>
            )}
            <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-auto px-3 py-3 sm:snap-none" data-testid="council-row">
              {lesson && <LessonCard lesson={lesson} />}
              {speakers.map((sp) => (
                <AdvisorCard key={sp.key} s={s} sp={sp} skip={skip} orders={orders} onChoose={choose} onLink={onLink} onTrust={onTrust} />
              ))}
            </div>
            <div className="flex justify-center gap-1 pb-1 sm:hidden" aria-hidden>{[...(lesson ? [0] : []), ...speakers].map((_, i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-noir-600" />)}</div>
            <footer className="flex flex-wrap items-center gap-2 border-t border-noir-700 px-3 py-2">
              <button type="button" className="btn-secondary text-xs sm:text-sm" disabled={!recs.length} onClick={acceptAll} data-testid="sitdown-accept-all">
                Let them handle the routine{recs.length ? ` (${recs.length})` : ''}{recCost ? ` · ${fmt$(recCost)}` : ''}
              </button>
              <span className="text-[11px] text-stone-500 flex-1 min-w-[140px]">{recs.length ? `Each one gives his own pick as this week's order${recCost ? `; together they cost ${fmt$(recCost)}` : ''}. You can take any back.` : 'Nothing left to order.'}</span>
              <button type="button" className="btn-secondary text-xs" onClick={() => setTab('rounds')} data-testid="sitdown-to-rounds">Your rounds ▸</button>
            </footer>
          </>
        ) : (
          <RoundsPlanner s={s} b={b} rounds={rounds} setRounds={setRounds} onTrust={onTrust} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

function LessonCard({ lesson }: { lesson: SitDownLesson }) {
  return (
    <section className="w-[86vw] max-w-[300px] shrink-0 snap-center rounded-md border border-gold-500/70 bg-gold-500/5 p-3 text-[12px] sm:w-[280px]" data-testid="sitdown-lesson">
      <div className="text-[10px] uppercase tracking-[0.25em] text-gold-400">Your first season</div>
      <div className="mt-1 font-semibold text-stone-100 leading-snug">{lesson.title}</div>
      <p className="mt-1 text-stone-400 leading-snug">{lesson.hint}</p>
      <p className="mt-2 text-[11px] text-stone-500 leading-snug">Every week your people come in here. Each brings a thing or two, with options and what he would do. Pick an option and give the order; "Let them handle the routine" gives each his own pick.</p>
      {lesson.onShow && <button type="button" className="btn-secondary btn-sm mt-2" onClick={lesson.onShow} data-testid="sitdown-lesson-show">Show me</button>}
    </section>
  );
}

function AdvisorCard({ s, sp, skip, orders, onChoose, onLink, onTrust }: {
  s: GameState; sp: Speaker; skip: string[]; orders: PlayerAction[];
  onChoose: (it: BriefItem, o: BriefOption) => void; onLink: (l: BriefLink) => void; onTrust: (key: string, on: boolean) => void;
}) {
  const c = sp.charId ? s.characters[sp.charId] : undefined;
  const trusted = !!s.briefing?.trust[sp.key];
  const free = leeway(s, sp.key);
  return (
    <section className={`flex w-[86vw] max-w-[340px] shrink-0 snap-center flex-col rounded-md border bg-noir-900/90 p-3 text-[12px] sm:w-[300px] ${sp.empty ? 'border-dashed border-noir-600' : 'border-noir-700'}`} data-testid={`advisor-${sp.key}`}>
      <div className="flex items-center gap-2">
        {c ? <Face s={s} c={c} size={52} /> : <div className="flex h-[52px] w-[52px] items-center justify-center rounded-md border border-dashed border-noir-600 text-xl text-stone-600">?</div>}
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{sp.title}</div>
          <div className="truncate font-semibold text-stone-100">{sp.name}</div>
          {!sp.empty && sp.role !== 'wife' && <span className={`text-[10px] ${sp.quality >= 0.55 ? 'text-emerald-300' : sp.quality >= 0.35 ? 'text-amber-300' : 'text-red-300'}`} title="How good his advice is: his skill for the seat and what he thinks of you">{sp.qualityWord}</span>}
        </div>
      </div>
      {sp.summary && <p className="mt-2 rounded bg-noir-800/70 px-2 py-1 text-[11px] text-stone-300" data-testid="advisor-summary">{sp.summary}</p>}
      {sp.empty ? (
        <div className="mt-2 text-stone-400">
          <p>Nobody to tell you. {sp.nudge?.text}</p>
          {sp.nudge && <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => onLink(sp.nudge!.link)} data-testid="advisor-appoint">Appoint someone ▸</button>}
        </div>
      ) : !sp.items.length ? (
        <p className="mt-2 italic text-stone-500">"Nothing that needs you this week."</p>
      ) : (
        <div className="mt-2 space-y-3">
          {sp.items.map((it) => <ItemBlock key={it.id} s={s} it={it} skipped={skip.includes(it.id)} orders={orders} onChoose={onChoose} onLink={onLink} who={shortName(c)} />)}
        </div>
      )}
      {!sp.empty && (
        <label className="mt-auto flex items-start gap-2 border-t border-noir-800 pt-2 text-[11px] text-stone-400" title="He handles his own small things (cheap, peaceful ones) without asking. You see what he did in This Week. A long free hand builds his own following.">
          <input type="checkbox" className="mt-0.5 accent-amber-500" checked={trusted} onChange={(e) => onTrust(sp.key, e.target.checked)} data-testid={`trust-${sp.key}`} />
          <span>Let {shortName(c)} handle {sp.role === 'capo' ? 'his crew\'s' : sp.role === 'wife' ? 'the house\'s' : 'his'} small stuff{trusted && free >= 4 ? <span className="text-amber-300"> · free hand {free} wk</span> : null}</span>
        </label>
      )}
    </section>
  );
}

function ItemBlock({ s, it, skipped, orders, onChoose, onLink, who }: {
  s: GameState; it: BriefItem; skipped: boolean; orders: PlayerAction[]; who: string;
  onChoose: (it: BriefItem, o: BriefOption) => void; onLink: (l: BriefLink) => void;
}) {
  const picked = it.options.find((o) => o.action && orders.some((x) => same(x, o.action!)));
  const rec = it.options.find((o) => o.id === it.recommended);
  // One decision standard (ui/decide): each option with its odds ("certain" / "no roll"), its worst way, one primary.
  const opts: DecisionOption[] = it.options.map((o) => {
    const p = o.action ? previewAction(s, o.action) : undefined;
    const odds: OddsView = o.chance !== undefined ? { known: true, chance: o.chance, label: 'It goes through', reasons: p ? oddsOfPreview(p).reasons : [] } : p ? oddsOfPreview(p) : { known: false, label: o.id === 'wait' || !o.action ? 'no roll' : 'certain', reasons: [] };
    return {
      id: o.id, label: `${o.label}${o.link && !o.action ? ' ▸' : ''}`, chips: o.chips, odds, worst: p ? worstOfPreview(p) : undefined, cost: o.cost || undefined,
      pickedBy: o.id === it.recommended ? `${who}'s pick` : undefined, rowTestId: `opt-${it.id}-${o.id}`, recommended: o.id === it.recommended, done: picked?.id === o.id || (o.id === 'wait' && skipped),
    };
  });
  const wait = it.options.find((o) => o.id === 'wait');
  return (
    <div className={`rounded border px-2 py-1.5 ${picked ? 'border-emerald-700/60 bg-emerald-900/10' : skipped ? 'border-noir-800 opacity-60' : 'border-noir-700'}`} data-testid={`item-${it.id}`}>
      <div className="text-[10px] uppercase tracking-widest text-gold-400/80">{it.topic}</div>
      <p className="mt-0.5 leading-snug text-stone-200">"{it.line}"</p>
      {it.tell && <p className="mt-0.5 text-[11px] italic text-stone-500">{it.tell}</p>}
      <DecisionCard s={s} compact options={opts.filter((o) => o.id !== 'wait')} selected={picked?.id ?? it.recommended}
        voices={[{ who, says: it.reason.replace(/^\S+ says:?\s*/, ''), tone: 'do' }]}
        onDecide={(id) => { const o = it.options.find((x) => x.id === id); if (o) onChoose(it, o); }}
        primaryLabel={(o) => (o ? (it.options.find((x) => x.id === o.id)?.link && !it.options.find((x) => x.id === o.id)?.action ? 'Go ▸' : 'Give the order ▸') : 'Pick one')}
        onLater={wait ? () => onChoose(it, wait) : undefined} laterLabel={wait?.label ?? 'Not now'}
        onHandOff={rec?.action && rec.id !== 'wait' && !picked ? () => onChoose(it, rec) : undefined} handOffLabel={`Let ${who} handle it`}
        advice={it.options.some((o) => o.action) ? <TableButton s={s} subject={{ kind: 'brief', itemId: it.id }} onOption={(id) => { const o = it.options.find((x) => x.id === id); if (o) onChoose(it, o); }} label="Ask the table" testid={`table-${it.id}`} className="btn-quiet text-[10px]" /> : undefined}
        testid={`decide-${it.id}`}
      />
      {it.open && <button type="button" className="btn-quiet mt-0.5 text-[10px]" onClick={() => onLink(it.open!.link)}>{it.open.label} ▸</button>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Your Rounds                                                         */
/* ------------------------------------------------------------------ */

const LANE_GLYPH: Record<Lane, string> = { people: '☕', fun: '♠', family: '♥', self: '§' };

function RoundsPlanner({ s, b, rounds, setRounds, onTrust, onDone }: { s: GameState; b: Briefing; rounds: string[] | undefined; setRounds: (r: string[] | undefined) => void; onTrust: (k: string, on: boolean) => void; onDone: () => void }) {
  const opts = useMemo(() => roundOptions(s), [s]);
  const usual = useMemo(() => usualWeek(s), [s]);
  const picked = rounds ?? usual;
  const { slots, why } = roundSlots(s);
  const used = opts.filter((r) => picked.includes(r.id)).reduce((a, r) => a + r.slots, 0);
  const ng = neglect(s);
  const toggle = (r: Round) => {
    if (picked.includes(r.id)) setRounds(picked.filter((x) => x !== r.id));
    else if (used + r.slots <= slots) setRounds([...picked, r.id]);
  };
  const log = (s.lastReport?.rounds ?? []);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="rounds">
      <div className="flex flex-wrap items-center gap-2 border-b border-noir-800 px-3 py-2">
        <div className="flex items-center gap-1" title={why.map((w) => `${w.label} ${w.value > 0 ? '+' : ''}${w.value}`).join(' · ')} data-testid="rounds-slots">
          {Array.from({ length: slots }).map((_, i) => <span key={i} className={`h-3 w-3 rounded-full border ${i < used ? 'border-gold-400 bg-gold-500' : 'border-noir-500'}`} />)}
          <span className="ml-1 text-[12px] text-stone-300">{used} of {slots} evenings</span>
        </div>
        <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setRounds(undefined)} data-testid="rounds-usual">Usual week</button>
        <button type="button" className="text-[11px] text-stone-500 hover:text-gold-300" onClick={() => setRounds([])}>clear</button>
        <span className="flex-1" />
        {rounds === undefined && <span className="text-[11px] text-stone-500">Your usual week is set. Change anything.</span>}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 md:grid-cols-2 xl:grid-cols-4">
        <section className="rounded-md border border-noir-700 bg-noir-900/80 p-2 text-[12px]" data-testid="lane-delegate">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">⚖ Delegate</div>
          <p className="mt-1 text-[11px] text-stone-400 leading-snug">Trusted people handle their own small business: fewer things for you, an evening back once two of them do. A free hand too long and men start going to them first.</p>
          <ul className="mt-1.5 space-y-1">
            {b.seats.filter((sp) => !sp.empty).map((sp) => (
              <li key={sp.key} className="flex items-center gap-2">
                <input type="checkbox" className="accent-amber-500" checked={!!s.briefing?.trust[sp.key]} onChange={(e) => onTrust(sp.key, e.target.checked)} data-testid={`rounds-trust-${sp.key}`} />
                <span className="flex-1 truncate text-stone-200">{sp.name} <span className="text-stone-500">· {sp.title}</span></span>
                {leeway(s, sp.key) > 0 && <span className={`text-[10px] ${leeway(s, sp.key) >= 8 ? 'text-amber-300' : 'text-stone-500'}`}>{leeway(s, sp.key)} wk</span>}
              </li>
            ))}
          </ul>
        </section>
        {ALL_LANES.map((lane) => {
          const n = ng.find((x) => x.lane === lane);
          return (
            <section key={lane} className="rounded-md border border-noir-700 bg-noir-900/80 p-2 text-[12px]" data-testid={`lane-${lane}`}>
              <div className="flex items-baseline justify-between">
                <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{LANE_GLYPH[lane]} {LANE_NAME[lane]}</div>
              </div>
              {n && <p className={`mt-0.5 text-[11px] ${n.level >= 2 ? 'text-red-300' : n.level === 1 ? 'text-amber-300' : 'text-stone-500'}`} data-testid={`neglect-${lane}`}>{n.line}</p>}
              <div className="mt-1.5 flex flex-col gap-1">
                {opts.filter((r) => r.lane === lane).map((r) => {
                  const on = picked.includes(r.id);
                  const full = !on && used + r.slots > slots;
                  return (
                    <button key={r.id} type="button" disabled={full} onClick={() => toggle(r)} data-testid={`round-${r.id}`} title={r.text}
                      className={`rounded border px-2 py-1 text-left disabled:opacity-40 ${on ? 'border-gold-400 bg-gold-500/15' : 'border-noir-600 hover:border-gold-600'}`}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`font-semibold ${on ? 'text-gold-300' : 'text-stone-200'}`}>{on ? '● ' : '○ '}{r.label}</span>
                        <span className="shrink-0 text-[10px] text-stone-400">{r.cost ? fmt$(r.cost) : 'free'}</span>
                      </span>
                      {r.suggestedBy && <span className="block text-[10px] text-amber-300">{r.suggestedBy}</span>}
                      <span className="block text-[10px] text-stone-500 leading-snug">{r.text}</span>
                      {r.effects.length > 0 && <Chips s={s} effects={r.effects} named={false} />}
                      {r.risk && <span className="mt-0.5 block text-[10px] text-red-300/80">Risk {Math.round(r.risk.chance * 100)}%: {r.risk.text.toLowerCase()}</span>}
                    </button>
                  );
                })}
                {!opts.some((r) => r.lane === lane) && <p className="text-[11px] italic text-stone-500">Nothing you can do here this week.</p>}
              </div>
            </section>
          );
        })}
      </div>
      {log.length > 0 && (
        <div className="border-t border-noir-800 px-3 py-1.5 text-[11px] text-stone-400" data-testid="rounds-last">
          <span className="text-stone-500">Last week: </span>{log.slice(0, 4).join(' ')}
        </div>
      )}
      <footer className="flex items-center gap-2 border-t border-noir-700 px-3 py-2">
        <span className="flex-1 text-[11px] text-stone-500">Your evenings land on days of the week (This Week); they happen as the clock runs, or all at once when you advance.</span>
        <button type="button" className="btn-primary text-xs sm:text-sm" onClick={onDone} data-testid="rounds-done">Done — back to the map</button>
      </footer>
    </div>
  );
}
