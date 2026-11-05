import { createContext, useContext, useState } from 'react';
import { ageOn } from '../../engine/calendar';
import { crew, displayName, isFree } from '../../engine/characters';
import { CITIES, DEPTH, EQUIPMENT, HEISTS, LOCATIONS, SCHEME_INFO, schemeOdds, topRival } from '../../engine/schemes';
import { knownSecrets } from '../../engine/secrets';
import { FACTION_NAMES } from '../../engine/world';
import type { GameState, HeistKind, HitLocation, RivalId, SchemeDepth, SchemeKind, SchemeOptions } from '../../engine/types';
import { fmt$ } from '../format';
import { Modal } from './Modal';
import { ActionCard } from './Orders';
import { CharLink, Face } from './People';
import { CandidatePicker } from '../clarity/CandidatePicker';
import { plotTargetsByFamily, plotWarnings, sideOf, TARGETED_SCHEMES, type SideFilter, type TargetedScheme } from '../../engine/sides';
import { hitLine, ownHitConsequences } from '../../engine/peopleRead';
import { RelationChip, SideChip, SideFilterBar } from './Side';
import { HoneyTrapRow } from '../people/HoneyTrapRow';

/** Opening the scheme planner from anywhere. */
export const PlannerContext = createContext<{ plan: (kind: SchemeKind, targetId?: string, opts?: Partial<SchemeOptions>) => void }>({ plan: () => {} });
export function usePlanner() {
  return useContext(PlannerContext);
}

export function SchemePlanner({ s, kind, targetId: preset, initial, onClose }: { s: GameState; kind: SchemeKind; targetId?: string; initial?: Partial<SchemeOptions>; onClose: () => void }) {
  // The target: preselected by the door that opened the planner (a face, the hit list, Find), changeable here in the one hit picker.
  const [targetId, setTargetId] = useState<string | undefined>(preset);
  const [choosing, setChoosing] = useState(false);
  // Nobody of yours dies without the boss's word: a hit on one of your own asks first, whichever door it came through.
  const [ownOk, setOwnOk] = useState<string | undefined>();
  const targeted = (TARGETED_SCHEMES as readonly string[]).includes(kind);
  const t = targetId ? s.characters[targetId] : undefined;
  const busy = new Set(s.schemes.filter((x) => x.owner === 'player').flatMap((x) => x.agents));
  const family = kind === 'envoy' ? Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.faction === 'player' && c.rank === 'civilian' && ageOn(c.birth, s.date) >= 18 && !busy.has(c.id)) : [];
  const boss = kind === 'envoy' && !busy.has(s.playerId) ? [s.characters[s.playerId]] : [];
  const pool = [...boss, ...family, ...crew(s).filter((c) => isFree(s, c) && !busy.has(c.id)).sort((a, b) => (b.attributes.force + b.attributes.intrigue) - (a.attributes.force + a.attributes.intrigue))];
  const [agents, setAgents] = useState<string[]>(pool.filter((c) => kind !== 'envoy' || c.id !== s.playerId).slice(0, kind === 'murder' ? 2 : 1).map((c) => c.id));
  const [opts, setOpts] = useState<SchemeOptions>({
    depth: 'planned', location: 'barbershop', disposal: 'public', equipment: 'street', alibi: false,
    heist: 'jewelry', city: 'capemay',
    district: s.districts.find((d) => topRival(s, d.id))?.id,
    secretId: t ? knownSecrets(s, t.id)[0]?.id : undefined,
    ...initial,
  });
  const set = (o: Partial<SchemeOptions>) => setOpts((x) => ({ ...x, ...o }));
  const toggle = (id: string) => setAgents((a) => (a.includes(id) ? a.filter((x) => x !== id) : a.length >= 4 ? a : [...a, id]));
  const info = SCHEME_INFO[kind];
  const odds = schemeOdds(s, kind, targetId, agents, opts);
  if (kind === 'murder' && t && sideOf(s, t.id).kind === 'yours' && ownOk !== t.id) {
    return <OwnHitConfirm s={s} id={t.id} onYes={() => setOwnOk(t.id)} onNo={() => (t.id === preset ? onClose() : setTargetId(undefined))} />;
  }
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5 space-y-3" data-testid="scheme-planner">
        <div className="flex justify-between items-start gap-3">
          <div className="flex gap-3 items-center">
            {t && <Face s={s} c={t} size={64} />}
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Plan a scheme</div>
              <h2 className="font-display text-2xl text-gold-400">{info.name}{t ? `: ${displayName(t)}` : ''}</h2>
              {t && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1" data-testid="plot-target-side">
                  <SideChip s={s} id={t.id} full />
                  <RelationChip relation={sideOf(s, t.id).relation} />
                </div>
              )}
              <p className="text-xs text-stone-400">{info.text}</p>
            </div>
          </div>
          <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
        <PlotWarnings s={s} hostile={info.hostile} targetId={targetId} agents={agents} />

        {targeted && (
          <Section title={kind === 'murder' ? 'The target' : 'Aimed at'}>
            {t && !choosing ? (
              <div className="flex items-center gap-2 text-xs" data-testid="planner-target">
                <span className="text-stone-200">{displayName(t)}</span>
                <SideChip s={s} id={t.id} />
                <button type="button" className="btn-ghost px-2 py-0.5 text-[11px]" onClick={() => setChoosing(true)} data-testid="planner-target-change">Change…</button>
              </div>
            ) : (
              <HitPicker s={s} kind={kind as TargetedScheme} lockKind preselect={targetId} onPick={(_, id) => { setTargetId(id); setChoosing(false); set({ secretId: knownSecrets(s, id)[0]?.id }); }} />
            )}
          </Section>
        )}

        <Section title={`${kind === 'envoy' ? 'The envoy' : kind === 'murder' ? 'The hit team' : 'Agents'} (${agents.length}/4)`}>
          {agents.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {agents.map((id) => s.characters[id]).filter(Boolean).map((c) => (
                <button key={c.id} onClick={() => toggle(c.id)} className="flex items-center gap-1 rounded border border-gold-400 bg-gold-500/15 px-1.5 py-0.5 text-xs text-gold-200" title="Remove from the team">
                  {c.id === s.playerId ? 'You' : `${c.firstName} ${c.lastName}`} {c.id !== s.playerId && <SideChip s={s} id={c.id} />} ✕
                </button>
              ))}
            </div>
          )}
          {pool.length === 0 ? <span className="text-xs text-stone-500">Everyone is busy.</span> : (
            <CandidatePicker s={s} role={{ kind: 'agent', scheme: kind, targetId, opts, with: agents }} pool={pool.map((c) => c.id)} selected={agents} onToggle={toggle} limit={6} />
          )}
        </Section>

        <Section title="Planning">
          <Radio value={opts.depth} options={Object.keys(DEPTH) as SchemeDepth[]} label={(d) => `${DEPTH[d].name} (${d === 'rushed' ? 'fast, worse odds' : d === 'meticulous' ? 'slow, better odds' : 'normal'}, ${fmt$(DEPTH[d].cost)})`} onChange={(depth) => set({ depth })} />
        </Section>

        {kind === 'murder' && (
          <>
            <Section title="Where">
              <Radio value={opts.location!} options={Object.keys(LOCATIONS) as HitLocation[]} label={(l) => `${LOCATIONS[l].name} — ${LOCATIONS[l].text}`} onChange={(location) => set({ location })} />
            </Section>
            <Section title="The body">
              <Radio value={opts.disposal!} options={['public', 'disappear'] as const} label={(d) => (d === 'public' ? 'Leave him where he falls (a message: respect, heat)' : 'Make him disappear (harder, quieter)')} onChange={(disposal) => set({ disposal })} />
            </Section>
            <Section title="Guns">
              <Radio value={opts.equipment!} options={Object.keys(EQUIPMENT) as (keyof typeof EQUIPMENT)[]} label={(e) => `${EQUIPMENT[e].name}${EQUIPMENT[e].cost ? ` (${fmt$(EQUIPMENT[e].cost)})` : ''}`} onChange={(equipment) => set({ equipment })} />
              <label className="mt-1 flex items-center gap-2 text-xs text-stone-300"><input type="checkbox" checked={!!opts.alibi} onChange={(e) => set({ alibi: e.target.checked })} /> Buy alibis for the team ($800): more secrecy, fewer witnesses</label>
            </Section>
            <HoneyTrapRow s={s} targetId={targetId} opts={opts} set={set} />
            <Section title="Frame someone">
              <select className="rounded bg-noir-900 border border-noir-600 p-1 text-xs" value={opts.frame ?? ''} onChange={(e) => set({ frame: (e.target.value || undefined) as RivalId | undefined })}>
                <option value="">Nobody — let them know it was us</option>
                {s.rivals.filter((r) => r.kind === 'mob' && r.id !== t?.faction).map((r) => <option key={r.id} value={r.id}>{r.name} (70% they believe it)</option>)}
              </select>
            </Section>
          </>
        )}
        {kind === 'heist' && (
          <Section title="The score">
            <Radio value={opts.heist!} options={Object.keys(HEISTS) as HeistKind[]} label={(h) => `${HEISTS[h].name}: ${fmt$(HEISTS[h].payout[0])}–${fmt$(HEISTS[h].payout[1])}. ${HEISTS[h].text}`} onChange={(heist) => set({ heist })} />
          </Section>
        )}
        {kind === 'envoy' && (
          <Section title="The city">
            <Radio value={opts.city!} options={Object.keys(CITIES)} label={(c) => `${CITIES[c].name}: ~${fmt$(CITIES[c].income)}/wk. ${CITIES[c].text}`} onChange={(city) => set({ city })} />
          </Section>
        )}
        {kind === 'claim' && (
          <Section title="The district">
            <Radio value={opts.district ?? ''} options={s.districts.filter((d) => topRival(s, d.id)).map((d) => d.id)} label={(id) => { const d = s.districts.find((x) => x.id === id)!; return `${d.name} (held mostly by ${FACTION_NAMES[topRival(s, id)!]})`; }} onChange={(district) => set({ district })} />
          </Section>
        )}
        {kind === 'blackmail' && t && (
          <Section title="The secret">
            {knownSecrets(s, t.id).length ? (
              <Radio value={opts.secretId ?? ''} options={knownSecrets(s, t.id).map((x) => x.id)} label={(id) => s.secrets.find((x) => x.id === id)!.text} onChange={(secretId) => set({ secretId })} />
            ) : <p className="text-xs text-red-300">You know no secret about him. Set your consigliere to dig for secrets.</p>}
          </Section>
        )}

        <div className="sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-2 pb-1 bg-noir-900/95 border-t border-gold-600/40">
          <div className="text-xs text-stone-400 mb-1">About {odds.weeks} week{odds.weeks > 1 ? 's' : ''} · secrecy {odds.secrecy} (each week there is a chance they find out)</div>
          <ActionCard s={s} action={{ kind: 'scheme', scheme: kind, targetId, agents, opts }} />
        </div>
      </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500 mb-1">{title}</div>
      {children}
    </div>
  );
}

function Radio<T extends string>({ value, options, label, onChange }: { value: T; options: readonly T[]; label: (t: T) => string; onChange: (t: T) => void }) {
  return (
    <div className="grid gap-1">
      {options.map((o) => (
        <label key={o} className={`flex items-start gap-2 rounded border px-2 py-1 text-xs cursor-pointer ${o === value ? 'border-gold-400 bg-gold-500/10 text-stone-100' : 'border-noir-700 text-stone-300 hover:border-gold-600'}`}>
          <input type="radio" className="mt-0.5" checked={o === value} onChange={() => onChange(o)} />
          <span>{label(o)}</span>
        </label>
      ))}
    </div>
  );
}

/** The Schemes tab: your plans, plots against you, hooks, claims, outposts. */
export function SchemesPanel({ s }: { s: GameState }) {
  const { plan } = usePlanner();
  const mine = s.schemes.filter((x) => x.owner === 'player');
  const theirs = s.schemes.filter((x) => x.owner !== 'player' && x.discovered);
  return (
    <div className="space-y-5">
      <section>
        <div className="panel-title">Your schemes</div>
        <p className="text-xs text-stone-500">Start a scheme against a person from his character sheet. Heists, envoys and claims start here.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn-ghost text-xs" onClick={() => plan('heist')}>Plan a heist</button>
          <button className="btn-ghost text-xs" onClick={() => plan('envoy')}>Send an envoy</button>
          <button className="btn-ghost text-xs" onClick={() => plan('claim')}>Fabricate a claim</button>
        </div>
        <TargetPicker s={s} />
        <div className="mt-3 space-y-2">
          {mine.length === 0 && <div className="text-xs text-stone-500">Nothing in motion.</div>}
          {mine.map((sc) => {
            const t = sc.targetId ? s.characters[sc.targetId] : undefined;
            const o = schemeOdds(s, sc.kind, sc.targetId, sc.agents, sc.opts);
            return (
              <div key={sc.id} className="rounded-md border border-noir-700 bg-noir-800/60 p-2.5 flex gap-2">
                {t && <Face s={s} c={t} size={44} />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-100">{SCHEME_INFO[sc.kind].name}{t ? <>: <CharLink s={s} id={t.id} /> <SideChip s={s} id={t.id} /></> : sc.opts.heist ? `: ${HEISTS[sc.opts.heist].name}` : sc.opts.city ? `: ${CITIES[sc.opts.city]?.name}` : ''}{sc.discovered && <span className="ml-1 text-red-400 text-xs">discovered</span>}</div>
                  <div className="mt-1 h-1.5 rounded bg-noir-700 overflow-hidden"><div className="h-full bg-gold-500" style={{ width: `${sc.progress}%` }} /></div>
                  <div className="text-[11px] text-stone-400 mt-0.5">{sc.progress}% · success {Math.round(o.chance * 100)}% · secrecy {o.secrecy} · agents {sc.agents.map((id) => s.characters[id]?.firstName).filter(Boolean).join(', ')}</div>
                  <div className="mt-1 w-56"><ActionCard s={s} action={{ kind: 'cancelScheme', schemeId: sc.id }} compact /></div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <div className="panel-title">Plots against you</div>
        {theirs.length === 0 ? <p className="text-xs text-stone-500">None uncovered. That does not mean there are none — set your consigliere to dig.</p> : (
          <ul className="mt-1 space-y-1 text-sm">
            {theirs.map((sc) => {
              const r = s.rivals.find((x) => x.id === sc.owner);
              const t = sc.targetId ? s.characters[sc.targetId] : undefined;
              return <li key={sc.id} className="text-stone-300">{r?.name}: {SCHEME_INFO[sc.kind].name.toLowerCase()} {t ? <CharLink s={s} id={t.id} /> : null} — {sc.progress}% ready</li>;
            })}
          </ul>
        )}
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <div>
          <div className="panel-title text-base">Hooks</div>
          {s.hooks.filter((h) => h.holder === 'player').length === 0 && <p className="text-xs text-stone-500">None. Favors give weak hooks; secrets give strong ones.</p>}
          <ul className="text-xs space-y-0.5">{s.hooks.filter((h) => h.holder === 'player' && s.characters[h.targetId]?.alive).map((h) => <li key={h.id}><span className={h.strong ? 'text-gold-300' : 'text-stone-400'}>{h.strong ? 'Strong' : 'Weak'}</span> on <CharLink s={s} id={h.targetId} /> — {h.reason}</li>)}</ul>
        </div>
        <div>
          <div className="panel-title text-base">Claims</div>
          {s.claims.length === 0 && <p className="text-xs text-stone-500">No claims. Fabricate one to justify a war.</p>}
          <ul className="text-xs space-y-0.5">{s.claims.map((c, i) => <li key={i}>{s.districts.find((d) => d.id === c.district)?.name} against {FACTION_NAMES[c.against]}</li>)}</ul>
        </div>
        <div>
          <div className="panel-title text-base">Outposts</div>
          {s.outposts.length === 0 && <p className="text-xs text-stone-500">None. Send an envoy.</p>}
          <ul className="text-xs space-y-0.5">{s.outposts.map((o) => <li key={o.city}>{o.city}: {fmt$(o.income)}/wk</li>)}</ul>
        </div>
      </section>
    </div>
  );
}

/** The warning banner: plotting against your own, or trusting another family's man. */
export function PlotWarnings({ s, hostile, targetId, agents }: { s: GameState; hostile: boolean; targetId?: string; agents: readonly string[] }) {
  const ws = plotWarnings(s, hostile, targetId, agents);
  if (!ws.length) return null;
  return (
    <div className="space-y-1" data-testid="plot-warnings">
      {ws.map((w, i) => (
        <div key={i} role="alert" data-testid="plot-warning" data-tone={w.tone}
          className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${w.tone === 'bad' ? 'border-blood-500/70 bg-blood-500/20 text-red-100' : 'border-amber-600/70 bg-amber-900/30 text-amber-100'}`}>
          <span aria-hidden className="font-bold">{w.tone === 'bad' ? '⚠' : '!'}</span>
          <span>{w.text}</span>
        </div>
      ))}
    </div>
  );
}

const PER_GROUP = 8;

/**
 * THE HIT PICKER (STREAMLINE_2 §3.4, PEOPLE_LEDGER §1): pick whom to plot
 * against, grouped by family: Your Family, Manno, Feldstein, Kessler,
 * Philadelphia, the law, the town, others. Every door that plans a hit opens
 * it (in the planner, with the target already chosen). A hit shows its odds
 * and heat on each row; one of your own asks for your word first. Mine /
 * Theirs / Everyone stays as a chip.
 */
export function HitPicker({ s, kind: kind0 = 'murder', preselect, lockKind, onPick }: {
  s: GameState;
  kind?: TargetedScheme;
  preselect?: string;
  /** Opened inside the planner: the kind is already chosen. */
  lockKind?: boolean;
  /** Default: open the planner on him. */
  onPick?: (kind: TargetedScheme, id: string) => void;
}) {
  const { plan } = usePlanner();
  const [kind, setKind] = useState<TargetedScheme>(kind0);
  const [filter, setFilter] = useState<SideFilter>('all');
  const [q, setQ] = useState('');
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<string | undefined>();
  const query = q.trim().toLowerCase();
  const groups = plotTargetsByFamily(s, kind, filter)
    .map((g) => ({ ...g, ids: query ? g.ids.filter((id) => displayName(s.characters[id]).toLowerCase().includes(query)) : g.ids }))
    .filter((g) => g.ids.length);
  const hostile = SCHEME_INFO[kind].hostile;
  const go = (id: string) => (onPick ? onPick(kind, id) : plan(kind, id));
  // Inside the planner the planner itself asks before a hit on your own; on its own the picker asks.
  const pick = (id: string) => (hostile && !onPick && sideOf(s, id).kind === 'yours' ? setConfirm(id) : go(id));
  return (
    <div className="mt-3 rounded-md border border-noir-700 bg-noir-900/50 p-2.5" data-testid="target-picker">
      <div className="flex flex-wrap items-center gap-2" data-testid="hit-picker">
        <span className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{kind === 'murder' ? 'Plan a hit on…' : 'Plot against someone'}</span>
        {!lockKind && (
          <select className="rounded bg-noir-900 border border-noir-600 p-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value as TargetedScheme)} aria-label="Scheme">
            {TARGETED_SCHEMES.map((k) => <option key={k} value={k}>{SCHEME_INFO[k].name}</option>)}
          </select>
        )}
        <SideFilterBar value={filter} onChange={setFilter} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name…" aria-label="Filter by name" className="w-28 rounded border border-noir-600 bg-noir-900 px-1.5 py-0.5 text-xs text-stone-200" />
      </div>
      {!groups.length && <p className="mt-2 text-xs text-stone-500">{kind === 'blackmail' ? 'You know no secret about anyone here.' : 'Nobody here.'}</p>}
      <div className="mt-2 space-y-2">
        {groups.map((g) => {
          const pre = preselect && g.ids.includes(preselect) ? [preselect] : [];
          const rest = g.ids.filter((id) => id !== preselect);
          const shown = [...pre, ...(more[g.key] ? rest : rest.slice(0, PER_GROUP - pre.length))];
          return (
            <div key={g.key} data-testid="target-group" data-side={g.side.kind} data-group={g.key}>
              <div className="mb-1 flex items-center gap-1.5 border-b pb-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: g.side.color, borderColor: `${g.side.color}55` }} data-testid="target-group-header">
                <span aria-hidden>{g.side.emblem}</span>{g.label}<span className="font-normal text-stone-500">({g.ids.length})</span>
                <RelationChip relation={g.side.relation} className="normal-case tracking-normal" />
                {g.key === 'yours' && hostile && <span className="font-normal normal-case tracking-normal text-red-300/80">only on your word</span>}
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {shown.map((id) => <HitRow key={id} s={s} id={id} kind={kind} chosen={id === preselect} off={g.protectedIds.includes(id)} onPick={() => pick(id)} />)}
              </div>
              {g.ids.length > PER_GROUP && <button type="button" className="mt-0.5 text-[11px] text-stone-400 hover:text-gold-300" onClick={() => setMore((m) => ({ ...m, [g.key]: !m[g.key] }))}>{more[g.key] ? 'Fewer' : `All ${g.ids.length}`}</button>}
            </div>
          );
        })}
      </div>
      {confirm && <OwnHitConfirm s={s} id={confirm} onNo={() => setConfirm(undefined)} onYes={() => { const id = confirm; setConfirm(undefined); go(id); }} />}
    </div>
  );
}

/** The old name: the Schemes tab's picker is the hit picker. */
export const TargetPicker = HitPicker;

function HitRow({ s, id, kind, chosen, off, onPick }: { s: GameState; id: string; kind: TargetedScheme; chosen: boolean; off: boolean; onPick: () => void }) {
  const c = s.characters[id];
  const sd = sideOf(s, id);
  const h = kind === 'murder' && !off ? hitLine(s, id) : undefined;
  return (
    <div role="button" tabIndex={off ? -1 : 0} aria-disabled={off} onClick={() => !off && onPick()} onKeyDown={(e) => { if (!off && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(); } }} data-testid="target-row" data-side={sd.kind} data-chosen={chosen || undefined}
      title={off ? 'Off limits: Philadelphia\'s rule (no cops, no officials)' : undefined}
      className={`flex min-w-0 items-center gap-2 rounded border px-1.5 py-1 text-left ${off ? 'cursor-not-allowed border-noir-800 opacity-50' : chosen ? 'cursor-pointer border-gold-500 bg-gold-500/10' : 'cursor-pointer border-noir-700 bg-noir-800/60 hover:border-gold-600'}`}>
      <Face s={s} c={c} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-stone-100">{displayName(c)}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-1 text-[10px] text-stone-500"><span className="truncate">{c.office ?? (c.rank !== 'civilian' ? c.rank : c.outside ?? 'civilian')}</span><SideChip side={sd} /></span>
      </span>
      {h && <span className="shrink-0 text-right text-[10px] leading-tight text-stone-400" data-testid="target-odds">{h.blocked ? <span className="text-red-300">{h.blocked}</span> : <><span className="tabular-nums text-gold-300">{Math.round(h.chance * 100)}%</span><br />heat {h.heat}</>}</span>}
      {off && <span className="shrink-0 text-[10px] text-stone-500">off limits</span>}
    </div>
  );
}

/** The confirm before a hit on one of your own: what it costs, said plainly. Nobody of yours dies without your word. */
export function OwnHitConfirm({ s, id, onYes, onNo }: { s: GameState; id: string; onYes: () => void; onNo: () => void }) {
  const c = s.characters[id];
  const h = hitLine(s, id);
  return (
    <Modal onClose={onNo}>
      <div className="space-y-2 p-4" data-testid="own-hit-confirm">
        <div className="text-[10px] uppercase tracking-[0.3em] text-red-300">One of your own</div>
        <h2 className="font-display text-xl text-gold-300">Plan a hit on {c?.firstName} {c?.lastName}?</h2>
        <p className="text-[12.5px] text-stone-300">Nobody of yours dies unless you choose it. If you go on, the planner opens: you still pick the team and the place, and the order is not given until you give it there. Odds with your two best free men: {Math.round(h.chance * 100)}%; heat {h.heat}.</p>
        <ul className="list-disc space-y-0.5 pl-5 text-[12px] text-stone-300">
          {ownHitConsequences(s, id).map((x, i) => <li key={i}>{x}</li>)}
        </ul>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost text-xs" onClick={onNo} data-testid="own-hit-no">No</button>
          <button type="button" className="btn border border-blood-500 text-xs text-red-300 hover:bg-blood-500/20" onClick={onYes} data-testid="own-hit-yes">Yes, plan it</button>
        </div>
      </div>
    </Modal>
  );
}
