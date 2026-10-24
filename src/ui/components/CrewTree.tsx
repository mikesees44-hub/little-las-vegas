import { useState } from 'react';
import { ORDER_TITLES, previewAction, VIA_INFO } from '../../engine/actions';
import { ageOn } from '../../engine/calendar';
import { capos, crew, displayName, hasTrait, isFree, player } from '../../engine/characters';
import { factionAgendaText, factionPower, factionStageText } from '../../engine/crewlife';
import { callName } from '../../engine/crewEvents';
import { ORDERS } from '../../engine/events';
import { capoLoyalty, CRAFT_INFO, OUTSIDE_INFO, outsideGuys, regime, unassigned } from '../../engine/hierarchy';
import { opinion } from '../../engine/relations';
import type { Character, GameState, OrderVia } from '../../engine/types';
import { FACTION_NAMES } from '../../engine/world';
import { fmt$ } from '../format';
import { Portrait } from '../portrait/Portrait';
import { ActionCard, useOrders } from './Orders';
import { FACTION_TINT, useSheet } from './People';

/* ------------------------------------------------------------------ */
/* Warnings and badges                                                 */
/* ------------------------------------------------------------------ */

export interface Warning {
  g: string;
  label: string;
  tone: 'bad' | 'warn' | 'info';
}

export function warningsFor(s: GameState, c: Character): Warning[] {
  const w: Warning[] = [];
  if (c.faction !== 'player') {
    if (c.courtedBy) w.push({ g: '⚑', label: `Being courted by ${FACTION_NAMES[c.courtedBy.rival]}`, tone: 'bad' });
    return w;
  }
  const op = opinion(s, c.id, s.playerId);
  if (op <= -20) w.push({ g: '☹', label: `Unhappy with you (${op})`, tone: op <= -40 ? 'bad' : 'warn' });
  if (hasTrait(c, 'Ambitious') || c.goal === 'take_chair' || (c.goal === 'become_capo' && c.rank === 'soldier')) w.push({ g: '▲', label: c.goal === 'take_chair' ? 'Ambitious: wants the chair' : c.goal === 'become_capo' ? 'Ambitious: wants his own crew' : 'Ambitious', tone: 'warn' });
  if ((c.evidence ?? 0) >= 45) w.push({ g: '⚖', label: `The law has a thick file on him (${Math.round(c.evidence ?? 0)}/100)`, tone: (c.evidence ?? 0) >= 65 ? 'bad' : 'warn' });
  if (c.debtTo) w.push({ g: '$', label: `Owes ${fmt$(c.debtTo.amount)} to a ${FACTION_NAMES[c.debtTo.rival]} shylock`, tone: 'warn' });
  if (c.courtedBy) w.push({ g: '⚑', label: `Being courted by ${FACTION_NAMES[c.courtedBy.rival]} since week ${c.courtedBy.week}`, tone: 'bad' });
  if ((c.defectStage ?? 0) >= 1) w.push({ g: '⇄', label: 'Drifting: seen with a rival crew', tone: 'bad' });
  if (!isFree(s, c)) w.push({ g: '⛓', label: `In jail until week ${c.imprisonedUntil}`, tone: 'info' });
  if (c.proposedWeek !== undefined) w.push({ g: '✦', label: `Proposed for membership (week ${c.proposedWeek}); waiting for the books`, tone: 'info' });
  const cl = capoLoyalty(s, c);
  if (cl !== undefined && cl > op + 10) w.push({ g: '⇡', label: `More loyal to his capo (${cl}) than to you (${op})`, tone: 'info' });
  if (s.factions.some((f) => f.memberIds.includes(c.id))) w.push({ g: '☍', label: 'In a faction against you', tone: 'bad' });
  return w;
}

const TONE: Record<Warning['tone'], string> = {
  bad: 'bg-blood-500/70 text-white border-red-300/70',
  warn: 'bg-amber-700/70 text-amber-50 border-amber-300/60',
  info: 'bg-noir-700 text-stone-200 border-noir-600',
};

function Badges({ items }: { items: Warning[] }) {
  if (!items.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-0.5 align-middle">
      {items.map((x, i) => (
        <span key={i} title={x.label} aria-label={x.label} className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[10px] leading-none ${TONE[x.tone]}`}>
          {x.g}&#xFE0E;
        </span>
      ))}
    </span>
  );
}

const RANK_BADGE: Partial<Record<Character['rank'], string>> = {
  boss: 'Boss', underboss: 'Underboss', consigliere: 'Consigliere', capo: 'Capo', soldier: 'Soldier', associate: 'Associate',
};

function ringFor(s: GameState, c: Character): string {
  if (c.id === s.playerId) return 'ring-gold-400';
  if (c.faction !== 'player') return 'ring-stone-600';
  const op = opinion(s, c.id, s.playerId);
  return op >= 25 ? 'ring-emerald-500' : op <= -25 ? 'ring-red-500' : op < 0 ? 'ring-amber-500' : 'ring-stone-400';
}

/** One person in the chart: portrait with an opinion-coloured ring, rank badge, warnings. Click opens the sheet. */
export function TreeNode({ s, c, size = 44, sub, compact }: { s: GameState; c: Character; size?: number; sub?: string; compact?: boolean }) {
  const { open } = useSheet();
  const badge = c.outside ? OUTSIDE_INFO[c.outside] : c.specialty ? c.specialty : RANK_BADGE[c.rank];
  const op = c.faction === 'player' && c.id !== s.playerId ? opinion(s, c.id, s.playerId) : undefined;
  return (
    <button type="button" onClick={() => open(c.id)} className="group flex min-w-0 items-center gap-2 text-left" data-testid="tree-node" title={`${displayName(c)}${op !== undefined ? ` — thinks ${op} of you` : ''}`}>
      <span className={`relative shrink-0 rounded-md ring-2 ${ringFor(s, c)} ${c.alive ? '' : 'opacity-60'} group-hover:ring-gold-300`}>
        <Portrait c={c} seed={s.seed} date={s.date} size={size} tint={FACTION_TINT[c.faction]} />
        {badge && size >= 40 && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-noir-950/95 border border-noir-600 px-1 text-[9px] uppercase tracking-wider text-gold-300">{badge}</span>}
      </span>
      <span className="min-w-0">
        <span className={`block truncate ${compact ? 'text-xs' : 'text-sm'} font-semibold text-stone-100 group-hover:text-gold-300`}>{callName(c)} {c.lastName}</span>
        {(sub || (badge && size < 40)) && <span className="block truncate text-[11px] text-stone-400">{size < 40 && badge ? <span className="uppercase tracking-wider text-[9px] text-gold-300 mr-1">{badge}</span> : null}{sub}</span>}
        <Badges items={warningsFor(s, c)} />
      </span>
    </button>
  );
}

function MoveMenu({ s, c }: { s: GameState; c: Character }) {
  const { queue, orders } = useOrders();
  const others = capos(s).filter((k) => k.id !== c.capoId);
  const pending = orders.find((o) => o.kind === 'reassign' && o.charId === c.id);
  if (!others.length || c.specialty || !(c.rank === 'soldier' || c.rank === 'associate')) return null;
  return (
    <select
      aria-label={`Move ${c.firstName} to another crew`}
      title={`Move ${c.firstName} to another crew`}
      className="ml-auto h-6 w-7 shrink-0 appearance-none rounded border border-noir-600 bg-noir-900 text-center text-[12px] text-stone-300 hover:border-gold-500"
      value={pending && pending.kind === 'reassign' ? pending.capoId : ''}
      onChange={(e) => e.target.value && queue({ kind: 'reassign', charId: c.id, capoId: e.target.value })}
    >
      <option value="">{pending ? '…' : '⇄'}</option>
      {others.map((k) => <option key={k.id} value={k.id}>{k.firstName} {k.lastName}'s crew</option>)}
    </select>
  );
}

function MemberRow({ s, c }: { s: GameState; c: Character }) {
  const sub = c.outside ? `${OUTSIDE_INFO[c.outside]}${c.office && c.outside !== 'cop' ? ` · ${c.office}` : ''}` : `${c.craft ? CRAFT_INFO[c.craft].name : ''} · ${ageOn(c.birth, s.date)} · ${c.lastEarn ? `${fmt$(c.lastEarn)}/wk` : 'earning nothing'}`;
  return (
    <li className="relative flex items-center gap-1 pl-4 before:absolute before:left-0 before:top-1/2 before:h-px before:w-3 before:bg-noir-600 before:content-['']">
      <TreeNode s={s} c={c} size={32} sub={sub} compact />
      {!c.outside && <MoveMenu s={s} c={c} />}
    </li>
  );
}

function RegimeColumn({ s, k }: { s: GameState; k: Character }) {
  const men = regime(s, k.id);
  const made = men.filter((m) => m.rank === 'soldier');
  const assoc = men.filter((m) => m.rank === 'associate');
  const outside = outsideGuys(s, k.id);
  const d = s.districts.find((x) => x.capoId === k.id);
  const keep = k.keep ?? 0.3;
  const fac = s.factions.find((f) => f.memberIds.includes(k.id));
  return (
    <div className="relative min-w-0 rounded-md border border-noir-700 bg-noir-800/60 p-2.5 lg:before:absolute lg:before:-top-4 lg:before:left-1/2 lg:before:h-4 lg:before:w-px lg:before:bg-gold-600/50 lg:before:content-['']" data-testid="regime">
      <TreeNode s={s} c={k} size={50} sub={`${d ? d.name : 'no district'} · kicks up ${Math.round((1 - keep) * 100)}%`} />
      <div className="mt-2 text-[11px] text-stone-400">
        Treasury {fmt$(k.wealth)} · {men.length} m{men.length === 1 ? 'an' : 'en'}{fac ? <span className="text-red-300"> · {fac.name}</span> : null}
      </div>
      <ul className="mt-1.5 ml-3 space-y-2 border-l border-noir-600 py-1">
        {made.map((m) => <MemberRow key={m.id} s={s} c={m} />)}
        {assoc.length > 0 && made.length > 0 && <li className="pl-4 text-[10px] uppercase tracking-widest text-stone-600">Associates</li>}
        {assoc.map((m) => <MemberRow key={m.id} s={s} c={m} />)}
        {outside.length > 0 && <li className="pl-4 text-[10px] uppercase tracking-widest text-stone-600">Outside guys</li>}
        {outside.map((m) => <MemberRow key={m.id} s={s} c={m} />)}
        {men.length === 0 && outside.length === 0 && <li className="pl-4 text-[11px] text-stone-500">Nobody behind him.</li>}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Factions, the books, general orders                                 */
/* ------------------------------------------------------------------ */

export function FactionsPanel({ s }: { s: GameState }) {
  if (!s.factions.length) return null;
  return (
    <section className="rounded-md border border-blood-500/60 bg-blood-500/10 p-3" data-testid="factions">
      <div className="panel-title text-red-300">Factions inside the family</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {s.factions.map((f) => {
          const power = Math.round(factionPower(s, f) * 100);
          return (
            <div key={f.id} className="rounded border border-noir-700 bg-noir-900/70 p-2">
              <div className="text-sm font-semibold text-stone-100">{factionAgendaText(s, f).replace(/^the /, 'The ')}</div>
              <div className="text-[11px] text-amber-300">{factionStageText(f)}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
                Strength
                <div className="h-2 flex-1 overflow-hidden rounded bg-noir-700" role="meter" aria-valuenow={power} aria-valuemin={0} aria-valuemax={100} aria-label="Faction strength"><div className={`h-full ${power >= 35 ? 'bg-red-500' : power >= 20 ? 'bg-amber-500' : 'bg-stone-500'}`} style={{ width: `${Math.min(100, power)}%` }} /></div>
                <span className="tabular-nums text-stone-200">{power}%</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {f.memberIds.map((id) => s.characters[id]).filter(Boolean).map((c) => <TreeNode key={c.id} s={s} c={c} size={28} compact />)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-stone-400">Factions go from demands to an ultimatum, then to Philadelphia behind your back, then to a coup. Buy them off, split them up, promote their man, or remove the ringleader.</p>
    </section>
  );
}

export function BooksPanel({ s }: { s: GameState }) {
  const b = s.books;
  const waiting = crew(s).filter((c) => c.rank === 'associate' && c.proposedWeek !== undefined).sort((x, y) => (x.proposedWeek ?? 0) - (y.proposedWeek ?? 0));
  const ready = crew(s).filter((c) => c.rank === 'associate' && !c.specialty && c.proposedWeek === undefined && isFree(s, c));
  const [show, setShow] = useState(false);
  return (
    <section className="rounded-md border border-noir-700 bg-noir-800/60 p-3" data-testid="books">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="panel-title text-base">Philadelphia's books</div>
        <div className={`text-xs font-semibold ${b?.open ? 'text-emerald-300' : 'text-stone-400'}`}>
          {b?.open ? `Open — ${b.slots} place${b.slots === 1 ? '' : 's'} left (closes ~week ${b.nextChange})` : `Closed (may open ~week ${b?.nextChange ?? '?'})`}
        </div>
      </div>
      <p className="text-[11px] text-stone-500">An associate needs a made man to vouch for him; his name goes to Philadelphia; when the books open he is made in the ceremony. If he goes bad, it is on the man who vouched.</p>
      {waiting.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {waiting.map((c) => <li key={c.id}><TreeNode s={s} c={c} size={28} compact sub={`vouched by ${c.vouchedBy ? s.characters[c.vouchedBy]?.firstName ?? '?' : 'you'}`} /></li>)}
        </ul>
      )}
      {ready.length > 0 && (
        <button className="mt-2 text-xs underline text-gold-300" onClick={() => setShow(!show)}>{show ? 'Hide' : `Propose an associate (${ready.length} eligible)`}</button>
      )}
      {show && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ready.map((c) => <ActionCard key={c.id} s={s} action={{ kind: 'propose', charId: c.id }} compact />)}
        </div>
      )}
    </section>
  );
}

const VIAS: OrderVia[] = ['direct', 'underboss', 'capo'];

/** The old sit-down, on demand: general orders the boss can give, and through whom. */
export function GeneralOrders({ s }: { s: GameState }) {
  const [via, setVia] = useState<OrderVia>('underboss');
  const [open, setOpen] = useState(false);
  const avail = ORDERS.filter((o) => o.available(s));
  return (
    <section data-testid="general-orders">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="panel-title">General orders</div>
        <button className="text-xs underline text-gold-300" onClick={() => setOpen(!open)}>{open ? 'Hide' : `Show ${avail.length} orders`}</button>
      </div>
      <p className="text-xs text-stone-500">Orders you give yourself happen this week but leave your fingerprints (your evidence file grows). Orders passed down through the underboss or a capo take a week, keep you insulated — and may be changed or ignored, depending on what he thinks of you.</p>
      {open && (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Chain of command">
            {VIAS.map((v) => (
              <button key={v} role="radio" aria-checked={via === v} onClick={() => setVia(v)} className={`rounded px-2 py-1 text-xs border ${via === v ? 'bg-gold-500 text-noir-950 border-gold-400' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`} title={VIA_INFO[v].text}>
                {VIA_INFO[v].name}
              </button>
            ))}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {avail.map((o) => {
              const a = { kind: 'order' as const, key: o.key, via };
              return <ActionCard key={o.key} s={s} action={a} label={previewAction(s, a).title || ORDER_TITLES[o.key]} />;
            })}
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The chart                                                           */
/* ------------------------------------------------------------------ */

export function CrewTree({ s }: { s: GameState }) {
  const boss = player(s);
  const ub = crew(s).filter((c) => c.rank === 'underboss');
  const cons = crew(s).filter((c) => c.rank === 'consigliere');
  const caps = capos(s).sort((a, b) => {
    const da = s.districts.findIndex((d) => d.capoId === a.id);
    const db = s.districts.findIndex((d) => d.capoId === b.id);
    return (da < 0 ? 99 : da) - (db < 0 ? 99 : db);
  });
  const direct = unassigned(s);
  const be = boss.evidence ?? 0;
  return (
    <div className="space-y-5" data-testid="crew-tree">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="panel-title">The family</div>
          <p className="text-xs text-stone-500">Click anyone to open his sheet. Rings show what he thinks of you; icons flag trouble.</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-400">
          <span><span className="inline-block h-2.5 w-2.5 rounded-sm ring-2 ring-emerald-500 mr-1" />loyal</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded-sm ring-2 ring-amber-500 mr-1" />cool</span>
          <span><span className="inline-block h-2.5 w-2.5 rounded-sm ring-2 ring-red-500 mr-1" />hostile</span>
          <span>☹ unhappy · ▲ ambitious · ⚖ evidence · $ in debt · ⚑ courted · ⇡ his capo's man · ☍ faction</span>
        </div>
      </div>

      {/* Boss, then the administration */}
      <div className="flex flex-col items-center">
        <div className="rounded-lg border border-gold-600/60 bg-noir-800/80 px-3 py-2">
          <TreeNode s={s} c={boss} size={60} sub={`Your evidence file: ${be}/100${be >= 40 ? ' — the Prosecutor is reading it' : ''}`} />
        </div>
        <div className="h-4 w-px bg-gold-600/50" />
        <div className="flex flex-wrap justify-center gap-3">
          {[...ub, ...cons].map((c) => (
            <div key={c.id} className="rounded-md border border-noir-700 bg-noir-800/70 px-2.5 py-2"><TreeNode s={s} c={c} size={44} sub={c.rank === 'underboss' ? 'Second in command' : 'Counsel'} /></div>
          ))}
          {!ub.length && <div className="rounded-md border border-dashed border-noir-600 px-3 py-2 text-xs text-stone-500">No underboss</div>}
          {!cons.length && <div className="rounded-md border border-dashed border-noir-600 px-3 py-2 text-xs text-stone-500">No consigliere</div>}
        </div>
        <div className="h-4 w-px bg-gold-600/50" />
      </div>

      {/* The capos and their regimes */}
      <div className="grid gap-4 border-l border-gold-600/40 pl-3 sm:grid-cols-2 lg:grid-cols-4 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-4" data-testid="regimes">
        {caps.map((k) => <RegimeColumn key={k.id} s={s} k={k} />)}
        {caps.length === 0 && <div className="text-sm text-stone-500">No capos. Promote a soldier from his sheet.</div>}
      </div>

      {direct.length > 0 && (
        <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Report straight to you</div>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {direct.map((c) => <li key={c.id} className="flex items-center gap-1"><TreeNode s={s} c={c} size={32} compact sub={c.specialty ? `Specialist · ${fmt$(c.fee ?? 0)}/wk` : c.rank} /><MoveMenu s={s} c={c} /></li>)}
          </ul>
        </section>
      )}

      <FactionsPanel s={s} />
      <BooksPanel s={s} />
      <GeneralOrders s={s} />
    </div>
  );
}
