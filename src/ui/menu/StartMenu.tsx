import { useMemo, useState } from 'react';
import { newGameWith, recommendedStart, STARTS, type StartId } from '../../engine/starts';
import type { GameState } from '../../engine/types';
import { musicPlaying, savePref, startMusic, stopMusic } from '../audio';
import { NoirStill } from '../cutscene/NoirStill';
import { AssetImg } from '../hood/AssetImg';
import { CUTSCENE_ART, NOIR_GRADE } from '../hood/art/sceneArt';
import { deleteSlot, freeSlot, listSlots, type SlotMeta } from '../save';
import { HELP_LEVELS, type AutoBriefings, AUTO_PAUSE, getSettings, setSettings, type Settings, type TextSpeed, type TimeMode, type WeekStart } from '../settings';
import { CharacterCreator } from './CharacterCreator';

/**
 * The title screen and the new-game flow: Title → Start → Create your
 * character → (the opening scene, played by App). Also Continue, Load /
 * Delete over three slots, and Settings.
 */

export type MenuScreen = 'title' | 'start' | 'create' | 'load' | 'settings';

export interface StartCard {
  id: StartId;
  name: string;
  difficulty: 'Easy' | 'Normal' | 'Hard' | 'Very hard';
  text: string;
  different: string[];
  /** The start a first game should pick. */
  recommended?: boolean;
}

export const START_CARDS: StartCard[] = [
  { id: 'olddon', name: 'The Old Don', difficulty: 'Normal', recommended: true, text: 'Summer 1960. Don Vincenzo "the Old Man" Sees, sixty-six, ten years in the chair: rich, loved, a goomar and a cellar of Barolo. And everybody is posting up for what comes after him.', different: ['The succession is the game: claimants, backers, Philadelphia\'s favor', 'Hidden plots from week one: some real, some bluff', 'Survive the year and name your successor on your own terms', 'When the old man goes, you play on as his heir'] },
  { id: 'classic', name: 'The House', difficulty: 'Normal', text: 'Summer 1960. You already run Wildwood for Philadelphia: a full crew, five rackets, and one problem from the past.', different: ['$25,000 and a full crew of capos', 'A random starting problem: a debt, a rat, a skimmer, a grudge…', 'The classic game'] },
  { id: 'sees', name: 'The House of Sees', difficulty: 'Normal', text: 'Don Salvatore "The Shark" Sees, sixty years old, near the end of his reign. Three heirs want the chair: Vito, Donato and Francesca.', different: ['An old boss and a succession fight from week one', 'Three grown heirs with their own ambitions', '+$15,000, respect 55'] },
  { id: 'rise', name: 'Rise to Power', difficulty: 'Hard', text: 'A young man with a numbers bank, an arcade, a few guys and $6,000. Nobody in Philadelphia knows your name yet.', different: ['$6,000, two rackets, a skeleton crew', 'Respect 15: earn it', 'Win a seat at the Table'] },
  { id: 'associate', name: 'Start as an associate', difficulty: 'Very hard', text: 'Not even made. Two guys, a corner, and Don Cosimo Valente above you taking 30%.', different: ['You kick up 30% to a boss above you', 'Climb the ladder: get made, get a crew, take the chair', '$2,500'] },
  { id: 'soldier', name: 'Start as a soldier', difficulty: 'Hard', text: 'A made man with a few guys of his own, kicking up a quarter to Don Cosimo Valente.', different: ['Kick up 25%', 'One soldier, three associates', '$3,500'] },
  { id: 'capo', name: 'Start as a capo', difficulty: 'Normal', text: 'Your own crew in the Valente family. Fifteen percent up the ladder, and the chair one step further.', different: ['Kick up 15%', 'Your own regime', '$6,000'] },
];

const DIFF_CLS: Record<StartCard['difficulty'], string> = {
  Easy: 'text-emerald-300 border-emerald-700', Normal: 'text-gold-300 border-gold-600', Hard: 'text-orange-300 border-orange-700', 'Very hard': 'text-blood-400 border-blood-500',
};

function freshSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface StartMenuProps {
  /** Open on this screen (the footer's New Game opens on 'start'). */
  initial?: MenuScreen;
  /** A game is running behind the menu (opened from the footer). */
  inGame: boolean;
  seedHint?: string;
  onContinue: (slot: number) => void;
  onBack?: () => void;
  onStart: (s: GameState, slot: number) => void;
}

export function StartMenu({ initial = 'title', inGame, seedHint, onContinue, onBack, onStart }: StartMenuProps) {
  const [screen, setScreen] = useState<MenuScreen>(initial);
  const [start, setStart] = useState<StartId>(() => recommendedStart());
  const [seed, setSeed] = useState(() => seedHint || freshSeed());
  const [slots, setSlots] = useState<(SlotMeta | undefined)[]>(() => listSlots());
  const latest = useMemo(() => slots.filter((m): m is SlotMeta => !!m).sort((a, b) => b.savedAt - a.savedAt)[0], [slots]);

  return (
    <div className="min-h-screen bg-noir-950" data-testid="start-menu" role="dialog" aria-modal="true" aria-label="Little Las Vegas">
      {screen === 'title' && (
        <div className="relative min-h-screen flex flex-col overflow-hidden">
          <div className="absolute inset-0 opacity-90" aria-hidden><AssetImg k={CUTSCENE_ART.title} alt="" className="h-full w-full object-cover" style={{ filter: NOIR_GRADE }} fallback={<NoirStill cue="title" seed={7} />} /></div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/85" />
          <div className="relative flex-1 flex flex-col items-center justify-end sm:justify-center px-4 pb-10 pt-24 text-center">
            <div className="text-[10px] sm:text-xs uppercase tracking-[0.5em] text-stone-400">Wildwood, New Jersey · 1960</div>
            <h1 className="font-display text-5xl sm:text-7xl text-gold-300 mt-2 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]" data-testid="title">Little Las Vegas</h1>
            <p className="mt-2 text-stone-300 italic max-w-md text-sm">Nine days until the boardwalk opens. Somebody has to be running things.</p>
            <nav className="mt-8 flex flex-col gap-2 w-full max-w-xs">
              {inGame && onBack && <button className="btn-ghost" onClick={onBack}>Back to the game</button>}
              {latest && (
                <button className="btn-gold flex-col !items-start text-left" data-testid="menu-continue" onClick={() => onContinue(latest.slot)}>
                  <div className="font-semibold">Continue</div>
                  <div className="text-[11px] opacity-80">House of {latest.house} · {latest.boss} · {latest.date}</div>
                </button>
              )}
              <button className={latest ? 'btn-ghost' : 'btn-gold'} data-testid="menu-new" onClick={() => setScreen('start')}>New Game</button>
              <button className="btn-ghost" data-testid="menu-load" onClick={() => { setSlots(listSlots()); setScreen('load'); }}>Load / Delete</button>
              <button className="btn-ghost" data-testid="menu-settings" onClick={() => setScreen('settings')}>Settings</button>
            </nav>
          </div>
        </div>
      )}

      {screen === 'start' && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Head title="Choose a start" sub="How the story begins. You'll create your character next." onBack={() => setScreen('title')} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="start-cards">
            {START_CARDS.map((c) => (
              <button key={c.id} data-start={c.id} onClick={() => setStart(c.id)} className={`panel p-4 text-left transition border ${start === c.id ? 'border-gold-400 ring-1 ring-gold-400' : 'border-noir-700 hover:border-gold-600'}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-xl text-gold-300">{c.name}{STARTS[c.id as StartId]?.recommended && <span className="ml-2 align-middle rounded bg-gold-500 px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-noir-950" data-testid="start-here">Start here</span>}</h3>
                  <span className={`text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 whitespace-nowrap ${DIFF_CLS[c.difficulty]}`}>{c.difficulty}</span>
                </div>
                <p className="mt-1 text-sm text-stone-300">{c.text}</p>
                <ul className="mt-2 text-xs text-stone-400 list-disc pl-4 space-y-0.5">{c.different.map((d) => <li key={d}>{d}</li>)}</ul>
              </button>
            ))}
            <div className="panel p-4 text-left border border-dashed border-noir-600 opacity-60" aria-disabled="true" data-start="sj1975">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-xl text-stone-400">South Jersey, 1975</h3>
                <span className="text-[10px] uppercase tracking-wider border rounded px-1.5 py-0.5 text-stone-500 border-noir-600">Coming soon</span>
              </div>
              <p className="mt-1 text-sm text-stone-500">The casinos are coming to Atlantic City. Everybody wants a piece.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="text-xs text-stone-500">Seed <input value={seed} onChange={(e) => setSeed(e.target.value)} className="ml-1 rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200 w-32" /></label>
            <button className="btn-ghost text-xs py-1" onClick={() => setSeed(freshSeed())}>Reroll</button>
            <button className="btn-ghost ml-auto" data-testid="start-as-written" title="Start with the character the story was written for: no choices, straight to Memorial Day" onClick={() => onStart(newGameWith(seed || 'llv', start), freeSlot())}>Play as written ▸</button>
            <button className="btn-gold" data-testid="start-next" onClick={() => setScreen('create')}>Create your character →</button>
          </div>
        </div>
      )}

      {screen === 'create' && (
        <CharacterCreator
          key={`${seed}:${start}`}
          seed={seed || 'llv'}
          start={start}
          startName={START_CARDS.find((c) => c.id === start)!.name}
          slot={freeSlot()}
          slots={slots}
          onBack={() => setScreen('start')}
          onConfirm={(opts, slot) => onStart(newGameWith(seed || 'llv', start, opts), slot)}
        />
      )}

      {screen === 'load' && (
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Head title="Load / Delete" sub="Three slots, saved in this browser." onBack={() => setScreen('title')} />
          <SlotList slots={slots} onLoad={onContinue} onDelete={(n) => { deleteSlot(n); setSlots(listSlots()); }} />
        </div>
      )}

      {screen === 'settings' && (
        <div className="max-w-xl mx-auto px-4 py-6">
          <Head title="Settings" sub="Kept in this browser." onBack={() => setScreen('title')} />
          <SettingsPanel />
        </div>
      )}
    </div>
  );
}

function Head({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-end gap-3">
      <button className="btn-ghost text-xs py-1" onClick={onBack}>← Back</button>
      <div>
        <h2 className="font-display text-3xl text-gold-300">{title}</h2>
        {sub && <p className="text-xs text-stone-500">{sub}</p>}
      </div>
    </div>
  );
}

export function SlotList({ slots, onLoad, onDelete }: { slots: (SlotMeta | undefined)[]; onLoad: (n: number) => void; onDelete: (n: number) => void }) {
  const [confirm, setConfirm] = useState<number | undefined>();
  return (
    <div className="space-y-2" data-testid="slots">
      {slots.map((m, i) => (
        <div key={i} className="panel p-3 flex flex-wrap items-center gap-3">
          <div className="font-display text-2xl text-stone-500 w-6">{i + 1}</div>
          {m ? (
            <>
              <div className="flex-1 min-w-[10rem]">
                <div className="text-stone-200">House of {m.house}{m.ironman && <span className="ml-2 text-[10px] uppercase text-blood-400 border border-blood-500 rounded px-1">Ironman</span>}</div>
                <div className="text-xs text-stone-400">{m.boss} · {m.date} · week {m.week}</div>
              </div>
              <button className="btn-gold text-xs py-1" onClick={() => onLoad(m.slot)}>Load</button>
              {confirm === m.slot ? (
                <span className="text-xs text-stone-300">Delete for good? <button className="underline text-blood-400" onClick={() => { onDelete(m.slot); setConfirm(undefined); }}>Yes</button> · <button className="underline" onClick={() => setConfirm(undefined)}>No</button></span>
              ) : (
                <button className="btn-ghost text-xs py-1" onClick={() => setConfirm(m.slot)}>Delete</button>
              )}
            </>
          ) : (
            <div className="flex-1 text-sm text-stone-600 italic">Empty</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function SettingsPanel() {
  const [st, setSt] = useState<Settings>(() => getSettings());
  const [music, setMusic] = useState(() => musicPlaying());
  const upd = (p: Partial<Settings>) => setSt(setSettings(p));
  const toggleMusic = async () => {
    if (music) { stopMusic(); savePref(false); setMusic(false); return; }
    try { await startMusic(); savePref(true); setMusic(true); } catch { setMusic(false); }
  };
  const row = 'panel p-3 flex items-center justify-between gap-3';
  return (
    <div className="space-y-2 text-sm" data-testid="settings">
      <div className={row}><span>Music (doo-wop, 1960)</span><button className={music ? 'btn-gold text-xs py-1' : 'btn-ghost text-xs py-1'} onClick={toggleMusic}>{music ? 'On' : 'Off'}</button></div>
      <div className="panel p-3 space-y-1.5" data-testid="setting-help-level">
        <div className="text-stone-300">Help</div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Help level">
          {HELP_LEVELS.map((h) => (
            <button key={h.id} type="button" role="radio" aria-checked={(st.helpLevel ?? 'guided') === h.id} onClick={() => upd({ helpLevel: h.id })} data-testid={`help-${h.id}`}
              className={`rounded border px-2 py-1 text-xs ${(st.helpLevel ?? 'guided') === h.id ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300'}`}>{h.label}</button>
          ))}
        </div>
        <p className="text-xs text-stone-500">{HELP_LEVELS.find((h) => h.id === (st.helpLevel ?? 'guided'))!.blurb}</p>
        <label className="flex items-center justify-between gap-2"><span className="text-stone-400">Adviser briefings that speak up by themselves</span>
          <select value={st.autoBriefings ?? ''} onChange={(e) => upd({ autoBriefings: (e.target.value || undefined) as AutoBriefings | undefined })} className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200 text-xs" data-testid="setting-auto-briefings">
            <option value="">As the help level says</option><option value="major">On big moves</option><option value="all">On every order</option><option value="off">Only when I ask</option>
          </select>
        </label>
      </div>
      <label className={row}><span>Start each week in <span className="block text-xs text-stone-500">Where Monday finds you: upstairs in your office, at the desk's list, or on the map.</span></span>
        <select value={st.weekStart ?? ''} onChange={(e) => upd({ weekStart: (e.target.value || undefined) as WeekStart | undefined })} className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200" data-testid="setting-week-start">
          <option value="">Default (Office for new games, Desk for older saves)</option><option value="office">The Office</option><option value="desk">The Desk</option><option value="map">The map</option>
        </select>
      </label>
      <label className={row}><span>Reduced motion <span className="block text-xs text-stone-500">No pans, rain or flicker; cutscene text appears at once.</span></span><input type="checkbox" checked={st.reducedMotion} onChange={(e) => upd({ reducedMotion: e.target.checked })} /></label>
      <label className={row}><span>Text speed</span>
        <select value={st.textSpeed} onChange={(e) => upd({ textSpeed: e.target.value as TextSpeed })} className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200">
          <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option>
        </select>
      </label>
      <label className={row}><span>Time <span className="block text-xs text-stone-500">Running clock: the days tick by, Monday to Sunday; Space pauses. Turn-based: one Advance Week at a time.</span></span>
        <select value={st.timeMode ?? 'clock'} onChange={(e) => upd({ timeMode: e.target.value as TimeMode })} className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200" data-testid="setting-time-mode">
          <option value="clock">Running clock</option><option value="turns">Turn-based</option>
        </select>
      </label>
      <div className="panel p-3 space-y-2" data-testid="setting-autopause">
        <div className="text-stone-300">Autopause (when the clock is running)</div>
        {AUTO_PAUSE.map((a) => (
          <label key={a.key} className="flex items-center justify-between"><span className="text-stone-400">{a.label}</span><input type="checkbox" checked={st[a.key] === undefined ? a.key !== 'pauseOnEvening' : !!st[a.key]} onChange={(e) => upd({ [a.key]: e.target.checked })} /></label>
        ))}
        <p className="text-[11px] text-stone-500">With decisions unpaused, unanswered cards take their default answer when the week turns. The clock also stops when you switch tabs.</p>
      </div>
      <label className={row}><span>Confirm orders <span className="block text-xs text-stone-500">Ask "Are you sure?" before an order is given; your man answers "Yes, boss."</span></span><input type="checkbox" checked={st.confirmOrders !== false} onChange={(e) => upd({ confirmOrders: e.target.checked })} data-testid="setting-confirm-orders" /></label>
      <label className={row}><span>Show internal ids <span className="block text-xs text-stone-500">Developer inspector: the engine's ids next to agreements. Off for normal play.</span></span><input type="checkbox" checked={!!st.devIds} onChange={(e) => upd({ devIds: e.target.checked })} data-testid="setting-dev-ids" /></label>
    </div>
  );
}
