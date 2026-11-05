import { useState, type ReactNode } from 'react';
import { datingView, personRow, PREGNANCY_RULES, type FamilyLine, type PersonRow, type ProviderRow } from '../../engine/dating';
import {
  MATURE_BLURB, MATURE_LABEL, PREGNANCY_LABEL, setDatingSettings,
  type MatureSetting, type PregnancySetting,
} from '../../engine/datingState';
import { isAdult } from '../../engine/dating';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { PlayCard } from '../components/Layout';
import { useShell } from '../shell/context';
import { fmt$ } from '../format';
import { SingleCards } from './SingleCards';
import { bestChances } from '../../engine/datingPicks';

/** Your best chances (engine/datingPicks.ts): the women most likely to say yes to the next step, each one tap. */
function BestChances({ s }: { s: GameState }) {
  const picks = bestChances(s);
  if (!picks.length) return null;
  return (
    <div className="rounded-md border border-rose-700/40 bg-noir-900/60 p-2.5" data-testid="dating-best">
      <div className="text-[10px] uppercase tracking-[0.2em] text-rose-300">Your best chances</div>
      <p className="mb-1 text-[11px] text-stone-500">Who is most likely to say yes to the next step. She still decides.</p>
      <ul className="space-y-1">
        {picks.map((p) => (
          <li key={p.row.id} className="text-xs" data-testid="dating-best-row">
            <div className="flex flex-wrap items-baseline gap-x-2"><CharLink s={s} id={p.row.id} /><span className="text-stone-500">{p.row.age} · {p.row.stageLabel}</span><span className="tabular-nums text-emerald-300">{Math.round(p.chance * 100)}%</span></div>
            <ActionCard s={s} action={p.action} compact />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * RELATIONSHIPS & DATING: one screen for the boss's love life and the paid
 * company of the island's nights (engine/dating.ts). Summary first; four
 * plain sections; every person shows the next sensible step first and the
 * rest under "More…"; every button is an ordinary order card (cost, which
 * account pays, her odds and why, what happens if she says no, Ask for
 * advice). Nothing is removed: steps that can't be taken show why.
 */

export type DatingTab = 'together' | 'people' | 'adult' | 'family';

/** Where the next opening of the screen should land (a venue, the phone): read once by the panel. */
let pending: { tab?: DatingTab; venue?: string } | undefined;

/** Open Relationships & Dating from anywhere, at a section (and, for a club, its people only). */
export function useOpenDating(): (o?: { tab?: DatingTab; venue?: string }) => void {
  const shell = useShell();
  return (o) => { pending = o; shell.go('you.dating'); };
}

/** A small way in from another screen (the night, the family, a venue). */
export function DatingLink({ s, tab, venue, text }: { s: GameState; tab?: DatingTab; venue?: string; text?: string }) {
  const open = useOpenDating();
  const off = datingView(s).settings.mature === 'off';
  const t = tab === 'adult' && off ? undefined : tab;
  return (
    <button type="button" className="btn-ghost w-full px-2 py-1 text-left text-[11px]" onClick={() => open({ tab: t, venue: t === 'adult' ? venue : undefined })} data-testid="dating-link">
      ♥ Relationships & Dating ▸ <span className="text-stone-500">{text ?? (t === 'adult' ? 'company: who, her price, which account pays' : 'people you know, dates, family')}</span>
    </button>
  );
}
const TABS: [DatingTab, string][] = [['together', 'Dates & relationships'], ['people', 'People you know'], ['adult', 'Adult services'], ['family', 'Family & consequences']];

function Seg<T extends string>({ value, options, labels, onPick, testid }: { value: T; options: T[]; labels: Record<T, string>; onPick: (v: T) => void; testid: string }) {
  return (
    <div className="inline-flex rounded border border-noir-600 overflow-hidden" role="radiogroup" data-testid={testid}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onPick(o)} data-testid={`${testid}-${o}`}
          className={`px-2 py-1 text-[11px] font-semibold ${value === o ? 'bg-gold-500 text-noir-950' : 'text-stone-300 hover:bg-noir-800'}`}>{labels[o]}</button>
      ))}
    </div>
  );
}

/** The two content settings, changeable here at any time (they take effect at once, everywhere). */
export function DatingSettings({ s }: { s: GameState }) {
  const shell = useShell();
  const v = datingView(s).settings;
  const set = (patch: { mature?: MatureSetting; pregnancy?: PregnancySetting }) => (shell.act ?? shell.update)?.((x) => setDatingSettings(x, patch), 'Changed the content settings');
  return (
    <div className="rounded-md border border-noir-700 bg-noir-900/60 p-2.5 space-y-2" data-testid="dating-settings">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Content settings</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-300 w-36">Mature content</span>
        <Seg value={v.mature} options={['off', 'fade', 'standard']} labels={MATURE_LABEL} onPick={(m) => set({ mature: m })} testid="mature" />
      </div>
      <p className="text-[11px] text-stone-400">{MATURE_BLURB[v.mature]}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-stone-300 w-36">Pregnancy</span>
        <Seg value={v.pregnancy} options={['off', 'rare', 'normal']} labels={PREGNANCY_LABEL} onPick={(p) => set({ pregnancy: p })} testid="pregnancy" />
      </div>
      <p className="text-[11px] text-stone-400">Only from a relationship you are both in, on an evening together: Off never, Rare 1%, Normal 4% per evening. Never from paid company.</p>
      <p className="text-[10px] text-stone-500">Everyone in these screens is an adult, every time. Nothing is ever shown; the report fades to morning.</p>
    </div>
  );
}

function Stage({ r }: { r: PersonRow }) {
  const tone = r.stage === 'married' || r.stage === 'committed' ? 'border-gold-400 text-gold-300' : r.stage === 'dating' ? 'border-rose-400 text-rose-300' : r.stage === 'separated' || r.stage === 'ended' ? 'border-noir-500 text-stone-400' : 'border-noir-600 text-stone-300';
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${tone}`} data-testid="dating-stage">{r.stageLabel}</span>;
}

/** One person: who she is, where things stand, her feelings, and what you can do (the next step first). */
export function PersonCard({ s, r, compact }: { s: GameState; r: PersonRow; compact?: boolean }) {
  const [more, setMore] = useState(false);
  const c = s.characters[r.id];
  if (!c) return null;
  const [first, ...rest] = r.actions;
  return (
    <PlayCard as="li" d="romance" testid="dating-person" dataAttrs={{ 'data-id': r.id }}
      art={<Face s={s} c={c} size={compact ? 58 : 70} />}
      corner={<Stage r={r} />}
      title={<CharLink s={s} id={r.id} />}
      lines={[<>{r.age} · {r.via}{r.notes.length ? ` · ${r.notes.join(' · ')}` : ''}</>, <span className="flex items-center gap-2"><span className="h-1.5 w-16 shrink-0 overflow-hidden rounded bg-noir-700"><span className="block h-full bg-rose-400" style={{ width: `${r.aff}%` }} /></span>Her feelings: {r.feelings}</span>]}>
      {first && <div className="mt-2"><ActionCard s={s} action={first} compact={compact} /></div>}
      {rest.length > 0 && (
        <div className="mt-1">
          <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" onClick={() => setMore((x) => !x)} aria-expanded={more} data-testid="dating-more">{more ? 'Less' : `More… (${rest.length})`}</button>
          {more && <div className="mt-1 space-y-1.5">{rest.map((a, i) => <ActionCard key={i} s={s} action={a} compact />)}</div>}
        </div>
      )}
    </PlayCard>
  );
}

function ProviderCard({ s, p }: { s: GameState; p: ProviderRow }) {
  const [more, setMore] = useState(false);
  const c = s.characters[p.id];
  if (!c) return null;
  const paid: PlayerAction = { kind: 'dating', op: { op: 'paid', id: p.id } };
  const ask: PlayerAction = { kind: 'dating', op: { op: 'askOut', id: p.id } };
  return (
    <li className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="dating-provider" data-kind={p.kind}>
      <div className="flex gap-2.5">
        <Face s={s} c={c} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-stone-100 text-sm"><CharLink s={s} id={p.id} /></span>
            <span className="text-[11px] text-stone-500">{p.age}</span>
            <span className="rounded border border-noir-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-stone-300">{p.kindLabel}</span>
          </div>
          <div className="text-[11px] text-stone-400">{p.reach}</div>
          <div className="text-[12px] text-amber-300 tabular-nums">Her price: {fmt$(p.price)} an evening · from your pocket</div>
          <div className="text-[11px] text-stone-500">{p.note}</div>
        </div>
      </div>
      <div className="mt-2"><ActionCard s={s} action={paid} compact /></div>
      <button type="button" className="mt-1 text-[11px] text-gold-400 hover:text-gold-300" onClick={() => setMore((x) => !x)} aria-expanded={more}>{more ? 'Less' : 'More… (ask her out as yourself)'}</button>
      {more && <div className="mt-1"><ActionCard s={s} action={ask} compact /></div>}
    </li>
  );
}

function Lines({ title, lines, empty }: { title: string; lines: FamilyLine[]; empty: string }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{title}</div>
      {lines.length === 0 ? <div className="text-xs text-stone-500 mt-1">{empty}</div> : (
        <ul className="mt-1 space-y-1 text-xs">
          {lines.map((l, i) => (
            <li key={i} className="text-stone-200">
              {l.label && <span className={`mr-1.5 rounded px-1 py-0.5 text-[9px] uppercase tracking-wider ${l.label === 'Rumor' ? 'bg-amber-900/60 text-amber-200' : l.label === 'Private' ? 'bg-noir-700 text-stone-300' : 'bg-emerald-900/50 text-emerald-200'}`}>{l.label === 'Rumor' ? 'Rumor (unconfirmed)' : l.label}</span>}
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The screen. `venue` narrows the adult-services list to one club (opened from a venue). */
export function DatingPanel({ s, initialTab, venue: venue0 }: { s: GameState; initialTab?: DatingTab; venue?: string }) {
  const [start] = useState(() => { const p = pending; pending = undefined; return p; });
  const [venue, setVenue] = useState<string | undefined>(venue0 ?? start?.venue);
  const v = datingView(s, { venue });
  const shell = useShell();
  const [tab, setTab] = useState<DatingTab>(initialTab ?? start?.tab ?? (v.relationships.length ? 'together' : 'people'));
  const [rules, setRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const left = Math.max(0, v.evenings.slots);
  return (
    <div className="space-y-3" data-testid="dating-panel">
      <div className="rounded-md border border-noir-700 bg-noir-900/60 p-2.5" data-testid="dating-summary">
        <div className="text-sm text-stone-200">
          {(() => {
            const seeing = v.relationships.filter((r) => r.stage === 'dating' || r.stage === 'committed');
            const wife = v.relationships.find((r) => r.stage === 'married' || r.stage === 'separated');
            const w = wife ? `You are ${wife.stage === 'separated' ? 'separated from' : 'married to'} ${wife.name.split(' ')[0]}` : '';
            if (!seeing.length) return <>{w ? `${w}. ` : 'Nobody serious right now. '}</>;
            return <>{w ? `${w}, and you are seeing ` : 'You are seeing '}<b>{seeing.map((r) => r.name.split(' ')[0]).join(', ')}</b>. </>;
          })()}
          You know <b>{v.people.length}</b> {v.people.length === 1 ? 'person' : 'people'} who could be more. <b>{left}</b> evening{left === 1 ? '' : 's'} left this week{v.evenings.used ? ` (${v.evenings.used} taken by dates)` : ''}.
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
          <span>Mature content: <b className="text-stone-200" data-testid="dating-mature">{MATURE_LABEL[v.settings.mature]}</b></span>
          <span>· Pregnancy: <b className="text-stone-200">{PREGNANCY_LABEL[v.settings.pregnancy]}</b></span>
          <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setShowSettings((x) => !x)} data-testid="dating-settings-toggle">{showSettings ? 'Hide settings' : 'Change settings'}</button>
        </div>
        <p className="mt-1 text-[11px] text-stone-500">She decides, every time. Money and gifts never guarantee anything. Dates and paid evenings are paid from your pocket; Family money only if you approve it on the button.</p>
      </div>
      {showSettings && <DatingSettings s={s} />}
      <SingleCards s={s} />
      <BestChances s={s} />

      <nav className="flex flex-wrap gap-1 border-b border-noir-700 pb-1.5" role="tablist" aria-label="Relationships & Dating" data-testid="dating-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`dating-tab-${k}`}
            className={`rounded px-2 py-1 text-xs font-semibold ${tab === k ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`}>
            {label}{k === 'together' && v.relationships.length ? ` (${v.relationships.length})` : k === 'people' && v.people.length ? ` (${v.people.length})` : k === 'adult' && v.adult.length ? ` (${v.adult.length})` : ''}
          </button>
        ))}
      </nav>

      {tab === 'together' && (
        <section data-testid="dating-together">
          {v.relationships.length === 0 && <p className="text-xs text-stone-400">No one yet. Start with <button type="button" className="text-gold-400 underline" onClick={() => setTab('people')}>people you know</button>: talk first, then ask her out. Each step is hers to take.</p>}
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{v.relationships.map((r) => <PersonCard key={r.id} s={s} r={r} />)}</ul>
        </section>
      )}

      {tab === 'people' && (
        <section className="space-y-3" data-testid="dating-people">
          <p className="text-[11px] text-stone-400">Women you have met or can reasonably meet, all adults. The ladder: acquaintance → friends → attraction → dating → committed → marriage. She climbs it herself, or not.</p>
          {v.people.length === 0 && <p className="text-xs text-stone-500">Nobody yet. Get introduced to someone from the neighborhood below, or walk the boardwalk.</p>}
          <ul className="grid gap-2.5 grid-cols-2 lg:grid-cols-3">{v.people.slice(0, 12).map((r) => <PersonCard key={r.id} s={s} r={r} compact />)}</ul>
          {v.people.length > 12 && <p className="text-[11px] text-stone-500">And {v.people.length - 12} more; open anyone's sheet from the map or the walk.</p>}
          {v.intros.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Introductions this month</div>
              <ul className="mt-1 space-y-1.5">
                {v.intros.map((x) => (
                  <li key={x.tp} className="text-xs text-stone-300">
                    <ActionCard s={s} action={{ kind: 'dating', op: { op: 'meet', tp: x.tp } }} compact label={`Get introduced to ${x.name}, ${x.age}`} />
                    <div className="text-[11px] text-stone-500 mt-0.5">{x.line}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === 'adult' && (
        <section className="space-y-2" data-testid="dating-adult">
          {v.settings.mature === 'off' ? (
            <div className="rounded border border-noir-700 bg-noir-900/60 p-2.5 text-xs text-stone-300" data-testid="dating-adult-off">
              Adult services are turned off. Nothing of the kind appears anywhere in the game (this screen, the phone, your evenings, the clubs).
              <div className="mt-1.5"><button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setShowSettings(true)}>Change settings</button></div>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-stone-400">Each is an agreed transaction between adults: her price, paid from your pocket, at her say. She can decline, and then nothing is paid. It makes no feelings and no relationship, and buys nothing past the one evening. What can go wrong is listed before you confirm. Not every dancer offers company; only those who do are here.{venue ? ` Showing ${venue} only.` : ''}</p>
              {v.adult.length === 0 && <p className="text-xs text-stone-500">Nobody is working{venue ? ' here' : ''} this week.</p>}
              <ul className="space-y-2">{v.adult.map((p) => <ProviderCard key={p.id} s={s} p={p} />)}</ul>
              {venue && <button type="button" className="text-[11px] text-gold-400" onClick={() => setVenue(undefined)}>Everyone ▸</button>}
            </>
          )}
        </section>
      )}

      {tab === 'family' && (
        <section className="space-y-3" data-testid="dating-family">
          <Lines title="Pregnancies you know of" lines={v.family.pregnancies} empty="None that you know of." />
          <Lines title="Your children" lines={v.family.children} empty="No children." />
          <Lines title="What people are saying" lines={v.family.rumors} empty="No talk that has reached you." />
          <Lines title="Consequences" lines={v.family.consequences} empty="Nothing hanging over you." />
          <div>
            <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" onClick={() => setRules((x) => !x)} aria-expanded={rules} data-testid="dating-rules">{rules ? 'Hide' : 'How pregnancy works…'}</button>
            {rules && <ul className="mt-1 list-disc pl-4 text-[11px] text-stone-400 space-y-0.5">{PREGNANCY_RULES.map((r) => <li key={r}>{r}</li>)}</ul>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => shell.go('house.tree')}>Family tree ▸</button>
            <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => shell.go('house.marriages')}>Marriages & children ▸</button>
          </div>
        </section>
      )}

      {v.recent.length > 0 && (
        <section>
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Lately</div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-stone-400" data-testid="dating-recent">
            {v.recent.slice(0, 5).map((l, i) => <li key={i}>Week {l.week}: {l.text}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

/** On someone's sheet (Relationships tab): where things stand with her and the next step; a link to the whole screen. */
export function DatingSection({ s, id, fallback = null }: { s: GameState; id: string; /** Shown instead of nothing (the Deal with menu). */ fallback?: ReactNode }) {
  const shell = useShell();
  const c = s.characters[id];
  if (!c) return null;
  if (id === s.playerId) {
    const v = datingView(s);
    return (
      <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/40 p-2.5" data-testid="dating-sheet-boss">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Relationships & dating</div>
        <div className="text-xs text-stone-300 mt-1">{v.relationships.length ? v.relationships.map((r) => `${r.name} (${r.stageLabel.toLowerCase()})`).join(' · ') : 'Nobody serious right now.'}</div>
        <button type="button" className="btn-ghost mt-1.5 px-2 py-0.5 text-[11px]" onClick={() => shell.go('you.dating')} data-testid="dating-open">Relationships & Dating ▸</button>
      </section>
    );
  }
  // Adults only: nothing of this kind is shown on a minor's sheet.
  if (!c.alive || !isAdult(s, c) || c.dynasty && s.characters[s.playerId]?.spouseId !== id) return <>{fallback}</>;
  const v = datingView(s);
  const r = [...v.relationships, ...v.people].find((x) => x.id === id) ?? (s.dating?.providers[id] && v.settings.mature !== 'off' ? personRow(s, c) : undefined);
  if (!r) return <>{fallback}</>;
  return (
    <section className="mt-3" data-testid="dating-sheet">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 mb-1">You and {c.firstName}</div>
      <ul><PersonCard s={s} r={r} compact /></ul>
      <button type="button" className="mt-1 text-[11px] text-gold-400 hover:text-gold-300" onClick={() => shell.go('you.dating')}>Relationships & Dating ▸</button>
    </section>
  );
}

/** On a walk or at a venue: if she is someone the boss could ask out, the next step with her (adults only). */
export function DatingHere({ s, id }: { s: GameState; id: string }) {
  const c = s.characters[id];
  if (!c || !isAdult(s, c) || id === s.playerId) return null;
  const v = datingView(s);
  const r = [...v.relationships, ...v.people].find((x) => x.id === id);
  if (!r || !r.actions[0]) return null;
  return (
    <div data-testid="dating-here">
      <ActionCard s={s} action={r.actions[0]} compact />
      <DatingLink s={s} tab="people" />
    </div>
  );
}
