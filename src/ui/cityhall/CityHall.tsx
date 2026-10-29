import { SideBadge } from '../components/Side';
import { Overlay } from '../components/Modal';
import { sideOfPol } from '../../engine/sides';
import { useMemo, useState } from 'react';
import { PEOPLE_BY_ID } from '../../worldpack';
import { controlBand, controlBreakdown, controlIndex } from '../../engine/polIntegrity';
import { FAVORS, JURIS_NAME, LAW_BY_ID, LAW_DEFS, LEGISLATURE, OFFICE_DEFS, type OfficeDef } from '../../engine/polData';
import { holder, nameOf, officeActive, officesOf, peekCtl } from '../../engine/polGov';
import { DIRTY_INFO, calendar, candidateScore, economy, polls } from '../../engine/polElections';
import { STAGE_LABEL, isDone, lawEffectText } from '../../engine/polLaws';
import { GROUP_NAME, groupOf, population, toughCost, type PolGroup } from '../../engine/polPeople';
import { favorsFor, kidBlock, kidOffices, myOfficials, shortTitle } from '../../engine/polPuppets';
import { mName, unpackRow, type PolPerson } from '../../engine/polState';
import type { Character, GameState, PlayerAction } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { Portrait } from '../portrait/Portrait';
import { FACTION_TINT, useSheet } from '../components/People';
import { OfficialPicker } from '../clarity/Pickers';

/** A world person as a portrait sitter (engine characters use their own record). */
export function sitter(s: GameState, p: PolPerson): Character {
  const c = p.charId ? s.characters[p.charId] : undefined;
  if (c) return c;
  return {
    id: p.id, firstName: p.first, lastName: p.last, gender: p.sex, ethnicity: p.eth, birth: { y: p.born, m: 6, d: 1 }, health: 80, conditions: [],
    attributes: { leadership: 8, business: 8, diplomacy: 8, intrigue: 8, force: 8, discipline: 8 }, traits: p.traits, ambition: '', rank: 'civilian',
    faction: p.street?.with && p.street.with !== 'player' ? p.street.with : groupOf(p.inst) === 'police' || groupOf(p.inst) === 'federal' ? 'law' : 'none',
    wealth: 0, dynasty: false, childrenIds: [], alive: p.alive, office: p.title,
    ...(p.died ? { death: { week: 0, date: { y: p.died.year, m: 6, d: 1 }, cause: p.died.cause } } : {}),
  };
}

function Face({ s, p, size = 40, onOpen }: { s: GameState; p?: PolPerson; size?: number; onOpen?: (id: string) => void }) {
  if (!p) return <div className="shrink-0 rounded-md border border-dashed border-noir-600 bg-noir-800/50" style={{ width: size, height: size * 1.25 }} />;
  const c = sitter(s, p);
  const side = sideOfPol(s, p.id);
  return (
    <button type="button" className="relative shrink-0 rounded-md hover:ring-2 hover:ring-gold-400" title={`${nameOf(s, p)} (${side.full})`} onClick={() => onOpen?.(p.id)} style={{ outline: `2px solid ${side.color}`, outlineOffset: '-1px' }}>
      <Portrait c={c} seed={s.seed} date={s.date} size={size} tint={FACTION_TINT[c.faction]} />
      {size >= 28 && <SideBadge side={side} size={size} />}
    </button>
  );
}

function CtlBadge({ v }: { v: number }) {
  const b = controlBand(v);
  return <span className={`chip ${b.tone === 'good' ? 'chip-good' : b.tone === 'bad' ? 'chip-bad' : 'chip-neutral'}`} title={b.label}>Control {v}</span>;
}

type Sub = 'offices' | 'elections' | 'laws' | 'officials' | 'family' | 'people';
const SUBS: { id: Sub; label: string }[] = [
  { id: 'offices', label: 'Offices' }, { id: 'elections', label: 'Elections' }, { id: 'laws', label: 'Bills & laws' },
  { id: 'officials', label: 'Your officials' }, { id: 'family', label: 'The family in politics' }, { id: 'people', label: 'People' },
];

/** City Hall: the government, the calendar, the bills, your officials and the people of the world. */
export function CityHall({ s }: { s: GameState }) {
  const [sub, setSub] = useState<Sub>('offices');
  const { open: setOpen } = useSheet();
  if (!s.pol) return <p className="text-sm text-stone-500" data-testid="cityhall">City Hall opens next week.</p>;
  const pol = s.pol;
  const crack = pol.crackdown && s.week < pol.crackdown.until;
  return (
    <div className="space-y-4" data-testid="cityhall">
      <div>
        <h2 className="font-display text-2xl text-gold-400">City Hall</h2>
        <p className="text-sm text-stone-400">Who holds every seat that matters, from the Wildwood commission to Trenton and Washington. Influence is not control: an official you put in office can still refuse you, resign, report you or turn. Your reach stops at the Governor and the congressmen.</p>
        <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
          <span className="chip-neutral">Shore economy {economy(s)}</span>
          <span className="chip-neutral">{population(s).total} people in the world ({population(s).full} fully simulated)</span>
          {crack && <span className="chip-bad">War on organized crime: {pol.crackdown!.reason}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1" data-testid="cityhall-subs">
        {SUBS.map((x) => (
          <button key={x.id} data-sub={x.id} className={`text-xs px-2 py-1 rounded border ${sub === x.id ? 'border-gold-500 text-gold-300 bg-noir-800' : 'border-noir-700 text-stone-400 hover:text-stone-200'}`} onClick={() => setSub(x.id)}>{x.label}</button>
        ))}
      </div>
      {sub === 'offices' && <Offices s={s} onOpen={setOpen} />}
      {sub === 'elections' && <Elections s={s} onOpen={setOpen} />}
      {sub === 'laws' && <Laws s={s} />}
      {sub === 'officials' && <Officials s={s} onOpen={setOpen} />}
      {sub === 'family' && <Family s={s} />}
      {sub === 'people' && <People s={s} onOpen={setOpen} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const LEVELS: { id: OfficeDef['level']; label: string }[] = [
  { id: 'city', label: 'The cities' }, { id: 'county', label: 'Cape May County' }, { id: 'state', label: 'New Jersey' }, { id: 'federal', label: 'Federal' },
];

function Offices({ s, onOpen }: { s: GameState; onOpen: (id: string) => void }) {
  const pol = s.pol!;
  return (
    <div className="space-y-4" data-testid="offices">
      {LEVELS.map((lv) => (
        <section key={lv.id}>
          <div className="panel-title text-base">{lv.label}</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {OFFICE_DEFS.filter((d) => d.level === lv.id).map((d) => {
              const o = pol.offices[d.id];
              const active = officeActive(s, d);
              const next = o.next.filter((x) => x > 0).sort((a, b) => a - b)[0];
              return (
                <div key={d.id} className={`rounded-md border border-noir-700 bg-noir-800/60 p-2 ${active ? '' : 'opacity-50'}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-semibold text-stone-100">{d.title}</div>
                    <div className="text-[10px] text-stone-500 whitespace-nowrap">{JURIS_NAME[d.juris]}</div>
                  </div>
                  <div className="text-[11px] text-stone-500">{d.selection === 'elected' ? `Elected, ${d.termYears} yrs${d.partisan ? '' : ', nonpartisan'}` : d.selection === 'chosen' ? 'Chosen by the commission' : d.termYears ? `Appointed for ${d.termYears} yrs` : 'Serves at pleasure'}{next ? ` · next ${mName(next)}` : ''}{!d.reach ? ' · beyond your reach' : ''}</div>
                  {!active && <div className="text-[11px] text-stone-500">Created by the {LAW_BY_ID[d.needsLaw!]?.name}.</div>}
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {o.holders.map((id, i) => {
                      const p = id ? pol.people[id] : undefined;
                      const c = p ? peekCtl(s, p.id) : undefined;
                      return (
                        <div key={i} className="flex items-center gap-1.5 min-w-0">
                          <Face s={s} p={p} size={34} onOpen={onOpen} />
                          <div className="min-w-0 text-xs">
                            <button className="text-stone-200 hover:text-gold-300 text-left truncate max-w-[9rem] block" onClick={() => p && onOpen(p.id)}>{p ? nameOf(s, p) : 'Vacant'}</button>
                            {p && <div className="text-[10px] text-stone-500">{p.party ? `${p.party} · ` : ''}{c && controlIndex(c) >= 40 ? <span className="text-gold-300">yours {controlIndex(c)}</span> : `integrity ${p.integrity}`}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1 text-[11px] text-stone-400 italic">{d.leverage}</div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Elections({ s, onOpen }: { s: GameState; onOpen: (id: string) => void }) {
  const pol = s.pol!;
  const cal = calendar(s, 4);
  const races = pol.elections.filter((e) => e.candidates.length);
  return (
    <div className="space-y-5" data-testid="elections">
      <section>
        <div className="panel-title text-base">Races open now</div>
        {!races.length && <p className="text-xs text-stone-500">No race is open. Campaigns open three months before election day.</p>}
        {races.map((e) => {
          const def = OFFICE_DEFS.find((d) => d.id === e.office)!;
          const pl = polls(s, e);
          return (
            <div key={e.id} className="mb-3 rounded-md border border-noir-700 bg-noir-800/50 p-2" data-testid="race">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-semibold text-stone-100">{def.title}{e.seats.length > 1 ? ` (${e.seats.length} seats)` : ''}{e.special ? ' — special election' : ''}</div>
                <div className="text-xs text-stone-400">Election day: {mName(e.when)}</div>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {e.candidates.map((c) => {
                  const p = pol.people[c.id];
                  if (!p) return null;
                  const lines = candidateScore(s, e, c);
                  return (
                    <div key={c.id} className="rounded border border-noir-700 bg-noir-900/60 p-2">
                      <div className="flex items-center gap-2">
                        <Face s={s} p={p} size={38} onOpen={onOpen} />
                        <div className="min-w-0">
                          <button className="text-sm text-stone-100 hover:text-gold-300 text-left" onClick={() => onOpen(p.id)}>{nameOf(s, p)}</button>
                          <div className="text-[11px] text-stone-400">{c.party ? `${c.party} · ` : ''}{c.incumbent ? 'Incumbent · ' : ''}{c.puppet ? 'your puppet · ' : ''}{p.charId && pol.kids[p.charId] ? 'your blood · ' : ''}polling {pl[c.id]?.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                        {lines.map((l, i) => <span key={i} className={l.value >= 0 ? 'text-emerald-400' : 'text-red-400'}>{l.value >= 0 ? '+' : '−'}{Math.abs(l.value)} {l.label}</span>)}
                      </div>
                      {def.reach && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-gold-400">Back this candidate…</summary>
                          <div className="mt-1 grid gap-1.5">
                            <ActionCard s={s} compact action={pa({ op: 'fund', election: e.id, cand: c.id, amount: 2000 })} />
                            <ActionCard s={s} compact action={pa({ op: 'fund', election: e.id, cand: c.id, amount: 8000 })} />
                            <ActionCard s={s} compact action={pa({ op: 'endorse', election: e.id, cand: c.id })} />
                            <ActionCard s={s} compact action={pa({ op: 'patronage', election: e.id, cand: c.id })} />
                            {(Object.keys(DIRTY_INFO) as (keyof typeof DIRTY_INFO)[]).map((d) => <ActionCard key={d} s={s} action={pa({ op: 'dirty', election: e.id, cand: c.id, dirty: d })} />)}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
              {def.reach && <div className="mt-2"><ActionCard s={s} action={pa({ op: 'puppet', election: e.id })} /></div>}
            </div>
          );
        })}
      </section>
      <section>
        <div className="panel-title text-base">Election calendar</div>
        <table className="w-full text-xs" data-testid="calendar">
          <tbody>
            {cal.slice(0, 24).map((c, i) => (
              <tr key={i} className="border-b border-noir-800">
                <td className="py-1 pr-2 text-stone-400 whitespace-nowrap">{mName(c.when)}</td>
                <td className="py-1 pr-2 text-stone-200">{c.office.title}{c.seats.length > 1 ? ` (${c.seats.length})` : ''}</td>
                <td className="py-1 text-right text-stone-500">{c.open ? 'campaign open' : JURIS_NAME[c.office.juris]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <div className="panel-title text-base">Past results</div>
        {!pol.results.length && <p className="text-xs text-stone-500">No votes counted yet.</p>}
        <ul className="space-y-1 text-xs">
          {pol.results.slice(-12).reverse().map((r) => (
            <li key={r.id + r.week} className="rounded border border-noir-800 px-2 py-1">
              <span className="text-stone-500">{mName(r.when)} · </span><span className="text-stone-200 font-semibold">{r.headline}</span>
              <div className="text-stone-500">{Object.entries(r.shares).sort((a, b) => b[1] - a[1]).map(([id, v]) => `${r.names[id]} ${v.toFixed(1)}%`).join(' · ')}{r.fallout.length ? ` · Fallout: ${r.fallout.join(', ')}` : ''}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function pa(op: Extract<PlayerAction, { kind: 'pol' }>['op']): PlayerAction {
  return { kind: 'pol', op };
}

/* ------------------------------------------------------------------ */

function Laws({ s }: { s: GameState }) {
  const pol = s.pol!;
  const open = pol.bills.filter((b) => !isDone(b));
  const done = pol.bills.filter(isDone).slice(-8).reverse();
  const inForce = LAW_DEFS.filter((l) => pol.laws[l.id] !== undefined);
  const proposable = LAW_DEFS.filter((l) => l.friendly && !l.anchor && pol.laws[l.id] === undefined && !open.some((b) => b.law === l.id));
  return (
    <div className="space-y-5" data-testid="laws">
      <section>
        <div className="panel-title text-base">Bills before the bodies</div>
        <p className="text-xs text-stone-500">Problem → bill → debate → vote → signature or veto → implementation → court challenge → consequences. A city cannot override the state.</p>
        {!open.length && <p className="text-xs text-stone-500 mt-1">Nothing on the docket.</p>}
        {open.map((b) => {
          const l = LAW_BY_ID[b.law];
          return (
            <div key={b.id} className="mt-2 rounded-md border border-noir-700 bg-noir-800/50 p-2" data-testid="bill">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="font-semibold text-stone-100">{l.name} <span className="text-[11px] text-stone-500">({LEGISLATURE[l.juris].name})</span></div>
                <div className="text-xs text-amber-300">{STAGE_LABEL[b.stage]} · support {Math.round(b.support)}%{b.push ? ` (your push ${b.push > 0 ? '+' : ''}${b.push})` : ''}</div>
              </div>
              <div className="text-xs text-stone-400">{b.note ?? l.problem} {l.text}</div>
              <div className="mt-1 flex flex-wrap gap-1">{lawEffectText(l).map((t, i) => <span key={i} className={l.friendly ? 'chip-good' : 'chip-bad'}>{t}</span>)}</div>
              {l.anchor ? <div className="mt-1 text-[11px] text-stone-500">History: this one lands on {mName(l.anchor.y * 12 + l.anchor.m - 1)}{l.anchorFails ? ' (and fails)' : ''} whatever you do.</div> : (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-gold-400">Lobby…</summary>
                  <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {([1, -1] as const).flatMap((dir) => (['money', 'favor', 'bribe'] as const).map((mode) => <ActionCard key={`${dir}${mode}`} s={s} compact action={pa({ op: 'lobby', bill: b.id, dir, mode })} />))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </section>
      <section>
        <div className="panel-title text-base">Laws in force</div>
        {!inForce.length && <p className="text-xs text-stone-500">Only the old laws.</p>}
        <ul className="space-y-1">
          {inForce.map((l) => (
            <li key={l.id} className="rounded border border-noir-800 px-2 py-1 text-xs">
              <span className="text-stone-200 font-semibold">{l.name}</span> <span className="text-stone-500">({JURIS_NAME[l.juris]})</span>
              <div className="flex flex-wrap gap-1 mt-0.5">{lawEffectText(l).map((t, i) => <span key={i} className={l.friendly ? 'chip-good' : 'chip-bad'}>{t}</span>)}</div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <div className="panel-title text-base">Have a friend introduce a bill</div>
        <div className="grid gap-1.5 sm:grid-cols-2">{proposable.map((l) => <ActionCard key={l.id} s={s} action={pa({ op: 'propose', law: l.id })} />)}</div>
      </section>
      {done.length > 0 && (
        <section>
          <div className="panel-title text-base">Recently decided</div>
          <ul className="text-xs space-y-0.5">{done.map((b) => <li key={b.id} className="text-stone-400"><span className="text-stone-200">{LAW_BY_ID[b.law]?.name}</span>: {STAGE_LABEL[b.stage]}{b.note && b.stage === 'struck' ? ` — ${b.note}` : ''}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Officials({ s, onOpen }: { s: GameState; onOpen: (id: string) => void }) {
  const mine = myOfficials(s);
  return (
    <div className="space-y-2" data-testid="officials">
      <p className="text-xs text-stone-500">Control index = influence·0.55 + (100 − independence)·0.30 + (100 − resentment)·0.15 − scrutiny·0.25. 70+: strong, but betrayal is still possible. 40–69: unstable, resists big requests. Under 40: his own man, or hostile.</p>
      {!mine.length && <p className="text-xs text-stone-500">You own nobody yet. Open an official from the Offices list: dinners, gifts, the payroll, or something you dug up.</p>}
      <OfficialPicker s={s} defaultOpen={!mine.length} />
      {mine.map(({ p, c, idx }) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-noir-700 bg-noir-800/50 p-2">
          <Face s={s} p={p} size={40} onOpen={onOpen} />
          <div className="min-w-0 flex-1">
            <button className="text-sm text-stone-100 hover:text-gold-300" onClick={() => onOpen(p.id)}>{nameOf(s, p)}</button>
            <div className="text-[11px] text-stone-400">{shortTitle(s, p)} · integrity {p.integrity}{c.payroll ? ` · payroll $${c.payroll}/wk` : ''}{c.puppet ? ' · puppet' : ''}{c.owner ? ` · also ${c.owner}'s` : ''}{c.flipped ? ' · TALKING' : ''}</div>
          </div>
          <CtlBadge v={idx} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Family({ s }: { s: GameState }) {
  const pol = s.pol!;
  const house = Object.values(s.characters).filter((c) => c.dynasty && c.alive && c.id !== s.playerId && s.date.y - c.birth.y >= 18);
  return (
    <div className="space-y-3" data-testid="family-politics">
      <p className="text-xs text-stone-500">Your children can climb from the commission to the Assembly to Congress, and to the Governor's mansion if they are strong enough. Every favor you ask of your own blood draws double scrutiny, and the votes on the family's business are a conflict of interest.</p>
      {!house.length && <p className="text-xs text-stone-500">No grown member of the house yet.</p>}
      {house.map((c) => {
        const k = pol.kids[c.id];
        const p = k ? Object.values(pol.people).find((x) => x.charId === c.id && x.alive) : undefined;
        return (
          <div key={c.id} className="rounded-md border border-noir-700 bg-noir-800/50 p-2">
            <div className="flex items-center gap-2">
              <Portrait c={c} seed={s.seed} date={s.date} size={40} />
              <div>
                <div className="text-sm text-stone-100">{c.firstName} {c.lastName} <span className="text-[11px] text-stone-500">{s.date.y - c.birth.y}</span></div>
                <div className="text-[11px] text-stone-400">{p ? `${p.title} · strength ${p.strength}${k.office ? ` · running for ${OFFICE_DEFS.find((d) => d.id === k.office)?.short}` : ''}` : kidBlock(s, c) ?? 'Could go into politics'}</div>
              </div>
            </div>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {!k && <ActionCard s={s} action={pa({ op: 'enter', charId: c.id })} />}
              {k && <ActionCard s={s} action={pa({ op: 'groom', charId: c.id })} />}
              {k && kidOffices(s, c).filter((x) => !x.why).slice(0, 4).map((x) => <ActionCard key={x.office.id} s={s} compact action={pa({ op: 'declare', charId: c.id, office: x.office.id })} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const GROUPS: (PolGroup | 'all')[] = ['all', 'politics', 'police', 'federal', 'legal', 'fire', 'street', 'showbiz', 'civilian'];

function People({ s, onOpen }: { s: GameState; onOpen: (id: string) => void }) {
  const pol = s.pol!;
  const [q, setQ] = useState('');
  const [g, setG] = useState<PolGroup | 'all'>('all');
  const [deep, setDeep] = useState(false);
  const rows = useMemo(() => {
    const full = Object.values(pol.people).filter((p) => p.alive && !p.retired);
    const all = deep ? [...full, ...pol.reserve.map(unpackRow)] : full;
    const needle = q.trim().toLowerCase();
    return all
      .filter((p) => (g === 'all' || groupOf(p.inst) === g) && (!needle || `${p.first} ${p.last} ${p.nick ?? ''} ${p.title}`.toLowerCase().includes(needle)))
      .sort((a, b) => (b.seat ? 1 : 0) - (a.seat ? 1 : 0) || b.rung - a.rung || (a.last < b.last ? -1 : 1));
  }, [pol, q, g, deep]);
  return (
    <div className="space-y-2" data-testid="people">
      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names and titles" className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-sm text-stone-200 w-48" data-testid="people-search" />
        <select value={g} onChange={(e) => setG(e.target.value as PolGroup | 'all')} className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-sm text-stone-200" data-testid="people-filter">
          {GROUPS.map((x) => <option key={x} value={x}>{x === 'all' ? 'Every institution' : GROUP_NAME[x]}</option>)}
        </select>
        <label className="text-xs text-stone-400 flex items-center gap-1"><input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> everybody ({pol.reserve.length} more)</label>
        <span className="text-xs text-stone-500">{rows.length} shown</span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {rows.slice(0, 120).map((p) => (
          <button key={p.id} onClick={() => pol.people[p.id] && onOpen(p.id)} className="flex items-center gap-2 rounded border border-noir-800 bg-noir-800/40 px-2 py-1 text-left hover:border-gold-500 min-w-0">
            <div className="min-w-0">
              <div className="text-sm text-stone-200 truncate">{nameOf(s, p)}{p.street && p.street.with === 'none' ? <span className="ml-1 text-[10px] text-emerald-400">recruitable</span> : null}</div>
              <div className="text-[11px] text-stone-500 truncate">{p.title} · {s.date.y - p.born}{groupOf(p.inst) !== 'street' && groupOf(p.inst) !== 'showbiz' && groupOf(p.inst) !== 'civilian' ? ` · integrity ${p.integrity}` : ''}{p.fame !== undefined ? ` · fame ${p.fame}` : ''}</div>
            </div>
          </button>
        ))}
      </div>
      {rows.length > 120 && <p className="text-xs text-stone-500">Narrow the search to see more.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PolSheet({ s, id, onClose, onOpen, embedded }: { s: GameState; id: string; onClose: () => void; onOpen: (id: string) => void; embedded?: boolean }) {
  const p = s.pol?.people[id];
  if (!p) return null;
  const w = PEOPLE_BY_ID[p.id];
  const c = peekCtl(s, p.id);
  const idx = c ? controlIndex(c) : 0;
  const offices = officesOf(s, p.id);
  const favs = favorsFor(s, p);
  const official = groupOf(p.inst) !== 'street' && groupOf(p.inst) !== 'showbiz' && groupOf(p.inst) !== 'civilian';
  const kin = w?.relationships.filter((r) => ['spouse', 'parent', 'child', 'sibling'].includes(r.kind) && s.pol!.people[r.id]).slice(0, 4) ?? [];
  const Outer = embedded ? EmbeddedFrame : OverlayFrame;
  return (
    <Outer onClose={onClose}>
        <div className="flex items-start gap-3">
          <Face s={s} p={p} size={72} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl text-gold-400">{nameOf(s, p)}</div>
            <div className="text-xs text-stone-400">{p.title}{p.party ? ` · ${p.party === 'D' ? 'Democrat' : p.party === 'R' ? 'Republican' : 'Independent'}` : ''} · born {p.born}{p.alive ? '' : ` · died ${p.died?.year} (${p.died?.cause})`}</div>
            {offices.length > 0 && <div className="text-xs text-stone-300">{offices.map((o) => o.office.title).join(' · ')}</div>}
            <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
              {official && <span className="chip-neutral">Integrity {p.integrity}</span>}
              <span className="chip-neutral">Strength {p.strength}</span>
              {p.scandal > 0 && <span className="chip-bad">Scandal {p.scandal}</span>}
              {p.traits.map((t) => <span key={t} className="chip-neutral">{t}</span>)}
              {official && <CtlBadge v={idx} />}
            </div>
          </div>
          {!embedded && <button className="btn-ghost text-xs py-1" onClick={onClose}>Close ✕</button>}
        </div>
        {w && (
          <div className="mt-2 space-y-1 text-xs text-stone-300">
            <p><span className="text-stone-500">Known for:</span> {w.publicReputation}</p>
            <p><span className="text-stone-500">Hook:</span> {w.hook}</p>
          </div>
        )}
        {kin.length > 0 && <div className="mt-1 text-xs text-stone-400">Family: {kin.map((r) => <button key={r.id} className="mr-2 underline decoration-dotted" onClick={() => onOpen(r.id)}>{nameOf(s, s.pol!.people[r.id])} ({r.kind})</button>)}</div>}
        {official && c && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Your hold on him</div>
            <div className="mt-1 grid grid-cols-3 sm:grid-cols-6 gap-1 text-[11px]">
              {(['personal', 'financial', 'independence', 'legitimacy', 'exposure', 'resentment'] as const).map((f) => (
                <div key={f} className="rounded border border-noir-700 px-1.5 py-1"><div className="text-stone-500">{f === 'exposure' ? 'scrutiny' : f}</div><div className="text-stone-100 tabular-nums">{Math.round(c[f])}</div></div>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px]">{controlBreakdown(c).map((r, i) => <span key={i} className={r.value >= 0 ? 'text-emerald-400' : 'text-red-400'}>{r.value >= 0 ? '+' : '−'}{Math.abs(r.value)} {r.label}</span>)}</div>
            {c.dirt && <div className="mt-1 text-[11px] text-amber-300">You have something on him: {c.dirt}</div>}
            {c.flipped && <div className="mt-1 text-[11px] text-red-400">He is talking to investigators.</div>}
          </div>
        )}
        {p.alive && official && (
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            <ActionCard s={s} action={pa({ op: 'cultivate', id: p.id, how: 'dinner' })} />
            <ActionCard s={s} action={pa({ op: 'cultivate', id: p.id, how: 'gift' })} />
            <ActionCard s={s} action={pa({ op: 'payroll', id: p.id, on: !c?.payroll })} />
            {c?.dirt ? <ActionCard s={s} action={pa({ op: 'coerce', id: p.id })} /> : <ActionCard s={s} action={pa({ op: 'dig', id: p.id })} />}
            {favs.map((f) => <ActionCard key={f.kind} s={s} action={pa({ op: 'favor', id: p.id, kind: f.kind })} label={`Ask: ${FAVORS[f.kind].name.toLowerCase()}`} />)}
          </div>
        )}
        {p.alive && p.street && (
          <div className="mt-3">
            <div className="text-xs text-stone-400">{w?.street?.arc ?? 'A man on the street.'} Asking price {`$${toughCost(p).toLocaleString('en-US')}`}.</div>
            <div className="mt-1"><ActionCard s={s} action={pa({ op: 'recruit', id: p.id })} /></div>
          </div>
        )}
        {p.log && p.log.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Career</div>
            <ul className="text-xs text-stone-400">{p.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        )}
    </Outer>
  );
}

function OverlayFrame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <Overlay z={1200} className="flex items-start justify-center overflow-y-auto bg-black/70 p-2 sm:p-6" onClick={onClose} data-testid="pol-sheet">
      <div className="panel w-full max-w-2xl p-3 sm:p-4" onClick={(e) => e.stopPropagation()}>{children}</div>
    </Overlay>
  );
}
function EmbeddedFrame({ children }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="p-3 sm:p-4" data-testid="pol-sheet">{children}</div>;
}

/** The holder of an office (for other screens). */
export function officeHolderName(s: GameState, office: string): string {
  return nameOf(s, holder(s, office));
}
