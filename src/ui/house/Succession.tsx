import { useMemo, useState } from 'react';
import { ageOn } from '../../engine/calendar';
import { displayName, player } from '../../engine/characters';
import { cloneState } from '../../engine/engine';
import { bloodLine, chooseHeir, SUCCESSION_LAWS } from '../../engine/dynasty';
import { ambitionOf, capability, challengePressure, DESIGNATION_INFO, DESIGNATION_MODES, GROOM_PATHS, successionCandidates, WANT_TEXT, type Score } from '../../engine/heir';
import { POSTS } from '../../engine/attrs';
import { pwView } from '../../engine/powerState';
import type { GameState, SuccessionLaw } from '../../engine/types';
import type { DesignationMode } from '../../engine/powerState';
import { formatDate } from '../../engine/calendar';
import { ActionCard } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { PowerPart } from '../power/PowerTab';
import { treeMarks } from '../family/DynastyTree';
import { MoreButton } from '../sheet/MoreButton';
import { Num } from '../shell/Num';
import { sectionVisible } from '../shell/unlocks';
import { CardHead } from '../components/Layout';
import { domCard } from '../domain';

function Bar({ sc, tone, label }: { sc: Score; tone: string; label: string }) {
  return (
    <Num v={sc.score} reasons={sc.reasons} title={label} format={(x) => `${Math.round(x)}`}>
      <span className="flex w-24 items-center gap-1.5 cursor-help">
        <span className="tabular-nums text-stone-100 w-6 text-right">{Math.round(sc.score)}</span>
        <span className="h-1.5 flex-1 rounded bg-noir-700 overflow-hidden"><span className={`block h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, sc.score))}%` }} /></span>
      </span>
    </Num>
  );
}

/**
 * The House › Succession: the one place to name an heir. The law, how the
 * heir is named, who would take the chair today and who would be passed
 * over, and every candidate on one line each (danger first). The verbs
 * (find out what he wants, groom him, place him) are on his menu: "⋯".
 */
export function Succession({ s: live, pendingLaw, pendingHeir, onLaw, onHeir }: { s: GameState; pendingLaw?: SuccessionLaw; pendingHeir?: string; onLaw: (l: SuccessionLaw) => void; onHeir: (id: string) => void }) {
  const s = useMemo(() => cloneState(live), [live]);
  const boss = player(s);
  const law = pendingLaw ?? s.successionLaw;
  const preview = chooseHeir({ ...s, successionLaw: law, designatedHeirId: pendingHeir ?? s.designatedHeirId }, boss);
  const p = pwView(s);
  const d = p.designation;
  const cands = successionCandidates(s);
  const rows = cands.map((c) => ({ c, cap: capability(s, c), pr: challengePressure(s, c), a: ambitionOf(s, c) }))
    .sort((x, y) => y.cap.score * y.pr.score - x.cap.score * x.pr.score);
  const heirId = d.secretId ?? d.publicId ?? preview.heir?.id;
  const heir = heirId ? rows.find((r) => r.c.id === heirId) : undefined;
  const house = cands.filter((c) => c.dynasty);
  const [mode, setMode] = useState<DesignationMode>(d.mode);
  const [pick, setPick] = useState<string>(heirId && house.some((c) => c.id === heirId) ? heirId : house[0]?.id ?? '');
  const passed = rows.filter((r) => r.c.id !== preview.heir?.id && r.pr.score >= 25).slice(0, 3);
  const claimants = [...treeMarks(s).claimants].map((id) => s.characters[id]).filter(Boolean);
  const blood = bloodLine(s, boss).filter((c) => ageOn(c.birth, s.date) >= 16);
  const detail = sectionVisible(live, 'house.succession');
  const placed = Object.entries(p.placements);
  return (
    <div className="space-y-3" data-testid="succession">
      <PowerPart s={live} part="crisis" />
      <section className={`llv-card-box llv-card-plain ${domCard('family')}`} data-testid="succession-law" data-domain="family">
        <CardHead d="family" glyph="§" title="The law of the house" sub="Who follows you, and how the heir is named." />
        <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="llv-kicker">Law</span>
          <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1.5 text-sm" value={law} onChange={(e) => onLaw(e.target.value as SuccessionLaw)} data-testid="law-pick" title={SUCCESSION_LAWS[law].text}>
            {(Object.keys(SUCCESSION_LAWS) as SuccessionLaw[]).map((l) => <option key={l} value={l}>{SUCCESSION_LAWS[l].name}</option>)}
          </select>
          <span className="mt-0.5 block text-[11px] text-stone-400">{SUCCESSION_LAWS[law].text}</span>
        </label>
        <label className="block text-xs">
          <span className="llv-kicker">How the heir is named</span>
          <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1.5 text-sm" value={mode} onChange={(e) => setMode(e.target.value as DesignationMode)} data-testid="designation-pick">
            {DESIGNATION_MODES.map((m) => <option key={m} value={m}>{DESIGNATION_INFO[m].name}{m === d.mode ? ' (now)' : ''}</option>)}
          </select>
          <span className="mt-0.5 block text-[11px] text-stone-400">{DESIGNATION_INFO[mode].text}</span>
        </label>
        </div>
      </section>
      {law === 'appointed' && (
        <label className="block text-xs">
          <span className="text-stone-400">Appointed heir: </span>
          <select className="rounded bg-noir-900 border border-noir-600 p-1 text-sm" value={pendingHeir ?? s.designatedHeirId ?? ''} onChange={(e) => onHeir(e.target.value)}>
            <option value="">— name an heir —</option>
            {blood.map((c) => <option key={c.id} value={c.id}>{displayName(c)} ({ageOn(c.birth, s.date)})</option>)}
          </select>
        </label>
      )}
      {(mode !== d.mode || DESIGNATION_INFO[mode].needsHeir) && (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          {DESIGNATION_INFO[mode].needsHeir && (
            <label className="text-xs text-stone-400">Of the house:{' '}
              <select className="rounded bg-noir-900 border border-noir-600 p-1 text-sm" value={pick} onChange={(e) => setPick(e.target.value)} data-testid="heir-pick">
                {house.map((c) => <option key={c.id} value={c.id}>{displayName(c)} ({ageOn(c.birth, s.date)})</option>)}
              </select>
            </label>
          )}
          <ActionCard s={live} action={{ kind: 'power', op: { op: 'designate', mode, charId: DESIGNATION_INFO[mode].needsHeir ? pick || undefined : undefined } }} compact />
        </div>
      )}
      {(pendingLaw || pendingHeir !== undefined) && <p className="text-xs text-amber-400">The new law takes effect when you advance.</p>}

      <section className="grid gap-2 sm:grid-cols-2">
        <div className={`llv-card-box llv-card-plain p-2.5 ${domCard('family')}`} data-testid="heir-card" data-domain="family">
          <div className="llv-kicker"><span aria-hidden>♔ </span>Heir</div>
          {heir ? (
            <div className="mt-1 flex gap-2">
              <Face s={live} c={heir.c} size={48} />
              <div className="min-w-0 text-xs space-y-0.5">
                <div className="text-sm font-semibold"><CharLink s={live} id={heir.c.id} />, {ageOn(heir.c.birth, s.date)}</div>
                <div className="flex gap-2 items-center"><span className="w-14 text-stone-500">capability</span><Bar sc={heir.cap} tone="bg-emerald-600" label="Leadership capability" /></div>
                <div className="flex gap-2 items-center"><span className="w-14 text-stone-500">pressure</span><Bar sc={heir.pr} tone="bg-blood-400" label="Challenge pressure" /></div>
                {d.mode === 'private' && d.secretId && <div className="text-stone-400">secret · {d.exposed ? <span className="text-red-300">the secret is out</span> : <>exposure {Math.round(d.exposure)}/100</>}</div>}
                {d.grooming && <div className="text-stone-400">grooming: {GROOM_PATHS[d.grooming.path].name.toLowerCase()} since wk {d.grooming.since}</div>}
                {d.grooming && <div className="pt-1"><ActionCard s={live} action={{ kind: 'power', op: { op: 'stopGrooming' } }} compact /></div>}
              </div>
            </div>
          ) : preview.heir ? <div className="mt-1 text-sm"><CharLink s={live} id={preview.heir.id} /> <span className="text-xs text-stone-500">({preview.method})</span></div> : <div className="mt-1 text-sm text-red-400">No heir: the house would fall.</div>}
        </div>
        <div className={`llv-card-box ${preview.heir ? 'llv-card-plain' : 'llv-card-danger'} p-2.5 text-xs ${domCard(passed.length ? 'rivals' : 'family')}`} data-testid="if-you-died" data-domain={passed.length ? 'rivals' : 'family'}>
          <div className="llv-kicker"><span aria-hidden>✝ </span>If you died today</div>
          <p className="mt-1 text-sm">{preview.heir ? <><span className="text-gold-300">{displayName(preview.heir)}</span> takes the chair <span className="text-stone-500">({preview.method})</span>.</> : <span className="text-red-400">Nobody takes the chair. The house dies with you.</span>}</p>
          {passed.length > 0 && <p className="mt-1 text-amber-200">Passed over: {passed.map((r, i) => <span key={r.c.id}>{i ? ', ' : ''}<CharLink s={live} id={r.c.id} /> ({Math.round(r.cap.score)}/{Math.round(r.pr.score)})</span>)} → grievance.</p>}
          <p className="mt-1 text-stone-400">Claimants: {claimants.length ? claimants.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<CharLink s={live} id={c.id} /></span>) : 'none'}</p>
        </div>
      </section>

      <section className={`llv-card-box llv-card-plain ${domCard('family')}`} data-domain="family" data-testid="succession-candidates">
        <CardHead d="family" glyph="♕" title="Candidates" sub="Danger first (capability × pressure)." aside={<span className="hidden sm:inline">hover a bar for the reasons · ⋯ for what you can do</span>} className="!mb-1" />
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-xs" data-testid="candidates-table">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-stone-400"><th className="py-1 pr-2" colSpan={2}>Name</th><th className="pr-2">Capability</th><th className="pr-2">Pressure</th><th className="pr-2">Wants</th><th /></tr></thead>
            <tbody>
              {rows.map(({ c, cap, pr, a }) => (
                <tr key={c.id} className={`border-t border-noir-800 ${c.id === heirId ? 'bg-gold-500/5' : ''}`} data-testid="candidate">
                  <td className="py-1 pr-1 w-8"><Face s={live} c={c} size={28} /></td>
                  <td className="pr-2 min-w-[8rem]"><CharLink s={live} id={c.id} />{c.id === heirId && <span className="ml-1 text-[9px] uppercase text-gold-300">heir</span>}<div className="text-[10px] text-stone-500">{c.dynasty ? 'of the house' : c.rank} · {ageOn(c.birth, s.date)}</div></td>
                  <td className="pr-2"><Bar sc={cap} tone="bg-emerald-600" label="Leadership capability" /></td>
                  <td className="pr-2"><Bar sc={pr} tone="bg-blood-400" label="Challenge pressure" /></td>
                  <td className="pr-2">{a.revealed ? <span className={a.want === 'chair' ? 'text-amber-300' : 'text-stone-300'}>{WANT_TEXT[a.want].replace(/^wants /, '')} ({a.intensity}){a.want === 'chair' ? ' ⚠' : ''}</span> : <span className="text-stone-600">? hidden</span>}</td>
                  <td className="text-right"><MoreButton id={c.id} category="heirs" /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="py-2 text-stone-500">Nobody old enough to follow you.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <section className={`llv-card-box llv-card-plain text-xs ${domCard('crew')}`} data-domain="crew" data-testid="succession-proteges">
          <CardHead d="crew" glyph="☞" title="Protégés" sub="Young men placed where they learn." className="!mb-1" />
          {placed.length === 0 ? <p className="text-stone-500 mt-0.5">None placed. Put a young man where he learns: ⋯ on his row › Heirs & Grooming.</p> : (
            <ul className="mt-0.5 space-y-0.5">{placed.map(([id, pl]) => <li key={id} className="flex items-center gap-2"><CharLink s={live} id={id} /> → {POSTS[pl.post]?.name.toLowerCase()} (wk {s.week - pl.since}){pl.mentorId ? <> under <CharLink s={live} id={pl.mentorId} /></> : null}<MoreButton id={id} category="heirs" label="change" /></li>)}</ul>
          )}
        </section>
      )}

      {s.dynastyHistory.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.25em] text-stone-500">History of the house ({s.dynastyHistory.length})</summary>
          <ul className="mt-1 space-y-0.5 text-stone-400">{[...s.dynastyHistory].reverse().map((e, i) => <li key={i}>{formatDate(e.date)} · {e.text}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

