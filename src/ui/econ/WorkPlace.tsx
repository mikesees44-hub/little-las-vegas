import { useMemo, useState } from 'react';
import {
  defaultWho, holdsAt, hoodHeat, ownerOf, pitchView, placeBlock, placeById, placeTrade, pressOpen, pressView, protectorLabel, REACTION_LABEL,
  schemesFor, schemeView, STANCE_LABEL, STEPS, workCrew, type Protector, type Reaction, type WorkPlace,
} from '../../engine/bizRacket';
import { ASK_LABEL, GROUP_LABEL, TRAIT_NOTE, type AskLevel, type WorkGroup } from '../../engine/bizRacketData';
import { SIDE_STYLE, type Side } from '../../engine/sides';
import { hoursShort, timeCost } from '../../engine/timeCost';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { Modal } from '../components/Modal';
import { Face } from '../components/People';
import { SideChip } from '../components/Side';
import { fmt$ } from '../format';

/**
 * WORK THIS PLACE (engine/bizRacket.ts): "Start a racket here" on one
 * particular business. The sheet for THAT place — the owner, what it takes in
 * as far as you know, who protects it, the street's heat — then the rackets
 * its trade fits, each with the setup, the weekly take, the hours, the heat,
 * the odds he goes along, your man and what the owner thinks. When he says
 * no, "Put him out of business" lists the steps, worst last.
 */

type Tab = 'protect' | WorkGroup | 'press';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function sideFor(pr: Protector): Side {
  const st = pr.kind === 'rival' ? SIDE_STYLE[pr.rival] : pr.kind === 'police' ? SIDE_STYLE.law : pr.kind === 'player' ? SIDE_STYLE.player : SIDE_STYLE.none;
  const label = pr.kind === 'none' ? 'Nobody' : pr.kind === 'police' ? 'The cops' : st.label;
  const short = pr.kind === 'none' ? 'NOBODY' : pr.kind === 'police' ? 'COPS' : st.short;
  const kind: Side['kind'] = pr.kind === 'rival' ? 'rival' : pr.kind === 'police' ? 'law' : pr.kind === 'player' ? 'yours' : 'civilian';
  return { kind, factionId: pr.kind === 'rival' ? pr.rival : pr.kind === 'player' ? 'player' : pr.kind === 'police' ? 'law' : 'none', label, short, color: st.color, emblem: st.emblem, initial: st.initial, full: label };
}

function Meter({ v, tone }: { v: number; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-20 overflow-hidden rounded bg-noir-700"><span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: tone }} /></span>
      <span className="tabular-nums text-stone-400">{v}</span>
    </span>
  );
}

function Stat({ k, v, cls }: { k: string; v: React.ReactNode; cls?: string }) {
  return <><dt className="text-stone-500">{k}</dt><dd className={cls ?? 'text-stone-200'}>{v}</dd></>;
}

function Hours({ s, a }: { s: GameState; a: PlayerAction }) {
  return <>{hoursShort(timeCost(a, s))}</>;
}

export function WorkPlaceSheet({ s, place, onClose, onHub }: { s: GameState; place: string; onClose: () => void; onHub?: () => void }) {
  const p = placeById(s, place);
  const [who, setWho] = useState<string | undefined>(() => defaultWho(s));
  const [ask, setAsk] = useState<AskLevel>('fair');
  const [tab, setTab] = useState<Tab>(() => {
    if (!p) return 'protect';
    if (p.mine) return 'extra';
    return pressOpen(s, p) ? 'press' : 'protect';
  });
  const men = useMemo(() => workCrew(s), [s]);
  if (!p) return null;
  const man = who ?? s.playerId;
  const o = ownerOf(s, p);
  const t = placeTrade(s, p);
  const hh = hoodHeat(s, p);
  const holds = holdsAt(s, p.id);
  const block = placeBlock(s, p);
  const schemes = schemesFor(p);
  const groups = (['skim', 'backdoor', 'exploit', 'extra'] as WorkGroup[]).filter((g) => schemes.some((d) => d.group === g));
  const tabs: { id: Tab; label: string }[] = [
    ...(p.mine ? [] : [{ id: 'protect' as Tab, label: 'Offer protection' }]),
    ...groups.map((g) => ({ id: g as Tab, label: GROUP_LABEL[g].title })),
    ...(p.mine ? [] : [{ id: 'press' as Tab, label: 'Put him out of business' }]),
  ];
  const owner = o.charId ? s.characters[o.charId] : undefined;
  const heatTone = hh.band === 'boiling' ? 'text-red-300' : hh.band === 'hot' ? 'text-amber-300' : 'text-stone-200';

  return (
    <Modal onClose={onClose} wide>
      <div className="space-y-3 p-3 sm:p-4" data-testid="work-place" data-place={p.id}>
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Work this place · {p.what}</div>
            <div className="font-display text-xl leading-tight text-[#ffd1e6]">{p.name}</div>
            <div className="text-xs text-stone-400">{p.address}</div>
          </div>
          <button type="button" className="shrink-0 text-xs text-stone-400 hover:text-gold-300" onClick={onClose} aria-label="Close" data-testid="work-close">close ×</button>
        </header>

        {/* The sheet: the owner, the money, who protects him, the street. */}
        <section className="rounded-md border border-noir-700 bg-noir-900/60 p-2.5" data-testid="work-sheet">
          <div className="flex items-start gap-2">
            {owner && <Face s={s} c={owner} size={44} />}
            <dl className="grid flex-1 grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-xs">
              <Stat k={p.mine ? 'Owner' : 'The owner'} v={<span data-testid="work-owner">{p.mine ? `You (${o.name})` : o.name}{o.answers ? <span className="text-stone-500"> · answers to {o.answers}</span> : null}</span>} />
              {!p.mine && o.traits.length > 0 && (
                <Stat k="His nature" v={<span className="flex flex-wrap gap-1">{o.traits.map((tr) => <span key={tr} title={TRAIT_NOTE[tr]} className="rounded border border-noir-600 bg-noir-800 px-1 py-px text-[10px] text-stone-300">{tr}</span>)}</span>} />
              )}
              {!p.mine && <Stat k="Fear" v={<Meter v={o.fear} tone="#e0b84a" />} />}
              {!p.mine && <Stat k="Pride" v={<Meter v={o.pride} tone="#5b8bc4" />} />}
              {o.stance && <Stat k="Where it stands" v={STANCE_LABEL[o.stance]} cls={o.stance === 'pays' || o.stance === 'sold' ? 'text-emerald-300' : o.stance === 'informant' ? 'text-red-300' : 'text-amber-300'} />}
              <Stat k="Takes in" v={<span data-testid="work-cash">{t.exact ? `${fmt$(t.gross)} a week` : `${fmt$(t.lo)}–${fmt$(t.hi)} a week`} <span className="text-stone-500">{t.exact ? '(you see the books)' : '(a guess: nobody inside yet)'}</span></span>} />
              <Stat k="Protected by" v={<span className="inline-flex items-center gap-1.5" data-testid="work-protector"><SideChip side={sideFor(o.protector)} /> <span className="text-stone-400">{protectorLabel(o.protector)}</span></span>} />
              <Stat k="The street" v={<span><span className={heatTone}>Local heat {hh.local} ({hh.band})</span><span className="text-stone-500"> · yours {hh.yours}%{hh.top ? ` · ${SIDE_STYLE[hh.top.rival]?.label ?? hh.top.rival} ${hh.top.share}%` : ''}</span></span>} />
            </dl>
          </div>
          {holds.length > 0 && (
            <div className="mt-2 border-t border-noir-700 pt-1.5 text-[11px]" data-testid="work-holds">
              <span className="text-stone-500">You run here: </span>
              {holds.map((h, i) => <span key={i} className="mr-2 text-emerald-200">{h.title}{h.take ? ` (~${fmt$(h.take)}/wk)` : ''}</span>)}
            </div>
          )}
          {block && <div className="mt-1.5 text-[11px] text-red-300">✗ {block}</div>}
        </section>

        {/* Your man on it. */}
        <label className="block text-[11px] text-stone-400">Who goes (your man on this)
          <select className="mt-0.5 block w-full rounded border border-noir-600 bg-noir-900 px-2 py-1 text-xs text-stone-200" value={man} onChange={(e) => setWho(e.target.value)} data-testid="work-who">
            {men.map((c) => <option key={c.id} value={c.id}>{c.id === s.playerId ? 'You, yourself' : `${c.firstName} ${c.lastName} (${c.rank}) · force ${c.attributes.force} · wits ${c.attributes.intrigue}`}</option>)}
          </select>
        </label>

        <nav className="flex flex-wrap gap-1" aria-label="Rackets here">
          {tabs.map((x) => (
            <button key={x.id} type="button" onClick={() => setTab(x.id)} data-testid={`work-tab-${x.id}`}
              className={`rounded border px-2 py-1 text-[11px] ${tab === x.id ? 'border-gold-400 bg-gold-500/10 text-gold-200' : x.id === 'press' ? 'border-blood-500/50 text-red-200' : 'border-noir-600 text-stone-300'}`}>{x.label}</button>
          ))}
        </nav>

        {tab === 'protect' && !p.mine && <Protect s={s} p={p} who={man} ask={ask} setAsk={setAsk} />}
        {groups.includes(tab as WorkGroup) && <Schemes s={s} p={p} who={man} group={tab as WorkGroup} />}
        {tab === 'press' && !p.mine && <Press s={s} p={p} who={man} />}

        {onHub && (
          <div className="border-t border-noir-700 pt-2 text-[11px] text-stone-500">
            Want something that is not tied to this place (the numbers, the book, a shylock route)? <button type="button" className="text-gold-300 underline" onClick={() => { onClose(); onHub(); }} data-testid="work-hub">The full racket menu ▸</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Protect({ s, p, who, ask, setAsk }: { s: GameState; p: WorkPlace; who: string; ask: AskLevel; setAsk: (a: AskLevel) => void }) {
  const v = pitchView(s, p, who, ask);
  const action: PlayerAction = { kind: 'work', op: { op: 'pitch', place: p.id, who, ask } };
  return (
    <section className="space-y-2" data-testid="work-protect">
      <p className="text-xs text-stone-400">A weekly envelope, and nothing bad happens to the place. He can say yes, haggle, or say no.</p>
      <div className="flex flex-wrap gap-1">
        {(['light', 'fair', 'heavy'] as AskLevel[]).map((k) => {
          const r = pitchView(s, p, who, k).rate;
          return <button key={k} type="button" onClick={() => setAsk(k)} data-testid={`work-ask-${k}`} className={`rounded border px-2 py-1 text-[11px] ${ask === k ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'border-noir-600 text-stone-300'}`}>{ASK_LABEL[k]} · {fmt$(r)}/wk</button>;
        })}
      </div>
      <div className="flex h-2 overflow-hidden rounded" aria-label="What he says" data-testid="work-pitch-odds">
        <span style={{ width: pct(v.accept), background: '#5fae7f' }} />
        <span style={{ width: pct(v.haggle), background: '#e0b84a' }} />
        <span style={{ width: pct(v.decline), background: '#e2563d' }} />
      </div>
      <div className="text-[11px] text-stone-400">Yes {pct(v.accept)} · haggles to {fmt$(v.haggled)} {pct(v.haggle)} · no {pct(v.decline)} · <Hours s={s} a={action} /></div>
      <div className="rounded border border-noir-700 bg-noir-900/50 px-2 py-1 text-[11px] italic text-stone-300" data-testid="work-thinks">What he thinks: {v.thinks}</div>
      <ActionCard s={s} action={action} compact label={`Offer protection: ${fmt$(v.rate)} a week`} />
    </section>
  );
}

function Schemes({ s, p, who, group }: { s: GameState; p: WorkPlace; who: string; group: WorkGroup }) {
  const list = schemesFor(p).filter((d) => d.group === group);
  return (
    <section className="space-y-2" data-testid={`work-group-${group}`}>
      <p className="text-xs text-stone-400">{GROUP_LABEL[group].blurb}</p>
      {list.map((d) => {
        const v = schemeView(s, p, d.id, who);
        const action: PlayerAction = { kind: 'work', op: { op: 'scheme', place: p.id, scheme: d.id, who } };
        const runner = s.characters[who];
        return (
          <article key={d.id} className="rounded-md border border-noir-700 bg-noir-900/40 p-2" data-testid={`work-option-${d.id}`}>
            <div className="text-sm font-semibold text-stone-100">{d.icon} {d.title}</div>
            <p className="mt-0.5 text-[11px] text-stone-400">{v.line}</p>
            <dl className="mt-1.5 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-0.5 text-[11px]">
              <Stat k="Setup" v={fmt$(v.cost)} />
              <Stat k={d.kind === 'loan' ? 'The vig' : 'Weekly take'} v={`~${fmt$(v.take)} a week`} cls="text-emerald-300" />
              <Stat k="Hours" v={<Hours s={s} a={action} />} />
              <Stat k="Heat" v={v.heat} />
              {!p.mine && <Stat k="He goes along" v={pct(v.odds)} cls={v.odds >= 0.6 ? 'text-emerald-300' : v.odds >= 0.35 ? 'text-amber-300' : 'text-red-300'} />}
              <Stat k="Runs it" v={runner ? (runner.id === s.playerId ? 'You (a free man takes the street)' : `${runner.firstName} ${runner.lastName}`) : '—'} />
            </dl>
            <div className="mt-1 text-[11px] italic text-stone-300">What he thinks: {v.thinks}</div>
            <div className="mt-1.5"><ActionCard s={s} action={action} compact label={`${d.title}: set it up`} /></div>
          </article>
        );
      })}
    </section>
  );
}

const REACT_TONE: Record<Reaction, string> = { pays: '#5fae7f', sells: '#5b8bc4', folds: '#9b6bc9', informant: '#e2563d', fights: '#e0703a', holds: '#6b6560' };

function Press({ s, p, who }: { s: GameState; p: WorkPlace; who: string }) {
  if (!pressOpen(s, p)) {
    return (
      <section className="rounded-md border border-noir-700 bg-noir-900/40 p-2 text-xs text-stone-400" data-testid="work-press-closed">
        Ask him first. Offer protection or a racket; if he says no or shows your man the door, the ways to put him out of business open here.
      </section>
    );
  }
  const drop: PlayerAction = { kind: 'work', op: { op: 'drop', place: p.id } };
  return (
    <section className="space-y-2" data-testid="work-press">
      <p className="text-xs text-stone-400">{p.rival ? 'A family\'s own place: every step is a move against them.' : 'He said no. One step at a time, worst last. After each one he may give in, sell, fold, fight back, or go to the police.'} Nothing on the page is shown; the town hears what it hears.</p>
      {STEPS.map((st) => {
        const v = pressView(s, p, st, who);
        const action: PlayerAction = { kind: 'work', op: { op: 'press', place: p.id, step: st, who } };
        const r = v.react;
        return (
          <article key={st} className={`rounded-md border p-2 ${st === 'fire' ? 'border-blood-500/60 bg-blood-500/5' : 'border-noir-700 bg-noir-900/40'}`} data-testid={`work-step-${st}`}>
            <div className="text-sm font-semibold text-stone-100">{v.def.icon} {v.def.title}</div>
            <p className="mt-0.5 text-[11px] text-stone-400">{v.def.line}</p>
            <dl className="mt-1.5 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-0.5 text-[11px]">
              <Stat k={st === 'buyout' ? 'His price' : 'Cost'} v={fmt$(v.cost)} />
              {st !== 'buyout' && <Stat k="Goes off clean" v={`${v.odds}%`} />}
              <Stat k="Heat" v={[v.def.heat.local ? `+${v.def.heat.local} local` : '', v.def.heat.federal ? `+${v.def.heat.federal} federal` : ''].filter(Boolean).join(' · ') || 'none'} />
              <Stat k="Hours" v={<Hours s={s} a={action} />} />
              <Stat k="The paper" v={v.paperNote} />
              <Stat k="The town" v={v.def.town} />
              {v.innocents > 0 && <Stat k="Innocents" v={`${pct(v.innocents)} somebody is hurt: the town and the parish turn on you`} cls="text-red-300" />}
            </dl>
            {st !== 'buyout' && (
              <div className="mt-1.5">
                <div className="flex h-1.5 overflow-hidden rounded" aria-label="What he does after">
                  {(Object.keys(r) as Reaction[]).map((k) => <span key={k} style={{ width: pct(r[k]), background: REACT_TONE[k] }} title={`${REACTION_LABEL[k]} ${pct(r[k])}`} />)}
                </div>
                <div className="mt-0.5 text-[10px] text-stone-500">{(Object.keys(r) as Reaction[]).filter((k) => r[k] >= 0.01).map((k) => `${REACTION_LABEL[k]} ${pct(r[k])}`).join(' · ')}</div>
              </div>
            )}
            <div className="mt-1.5"><ActionCard s={s} action={action} compact label={`${v.def.title}${st === 'buyout' ? ` for ${fmt$(v.cost)}` : ''}`} /></div>
          </article>
        );
      })}
      {!p.rival && <ActionCard s={s} action={drop} compact label="Let it go" />}
    </section>
  );
}
