import { useMemo, useState } from 'react';
import { circleView, COURT_STANDING } from '../../engine/matchmakers';
import { previewAction } from '../../engine/actions';
import { ageOn, dateOfWeek, formatDate } from '../../engine/calendar';
import { displayName, player } from '../../engine/characters';
import { cloneState } from '../../engine/engine';
import { knownEars } from '../../engine/ears';
import {
  AUTH_TEXT, audienceView, declaredHeir, involvement, knownPromises, knownSessions, members, nameOf, pressure, support, theCons, theUb, ubAuthority,
} from '../../engine/shadow';
import { shadowView, type KnowLvl, type PlanGoal, type ShadowAction } from '../../engine/shadowState';
import { storyName } from '../../engine/shadowStories';
import { claimStrengths } from '../../engine/oldDon';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionCard, useOrders } from '../components/Orders';
import { ActionMenu, CardHead } from '../components/Layout';
import { domCard, type Domain } from '../domain';
import { CharLink, Face } from '../components/People';
import { Num } from '../shell/Num';

/**
 * The Family › Succession: the heir question, who backs whom AS THE DON
 * KNOWS IT, the underboss's court as far as it has reached him, the promises
 * he has heard of, the other families' reading, and the verbs. Nothing here
 * shows a fact the Don has not learned through a real channel: every line
 * carries how he knows it (rumor or confirmed) and from whom.
 */

const act = (a: ShadowAction): PlayerAction => ({ kind: 'power', op: { op: 'shadow', a } });
const when = (w: number) => formatDate(dateOfWeek(w));

const GOAL_TEXT: Record<PlanGoal, string> = {
  support_heir: 'backs the heir', support_underboss: 'backs the underboss', seek_promotion: 'wants to move up', build_influence: 'building his own people', remain_neutral: 'waiting to see',
  leave_organization: 'thinking of leaving', seek_leadership: 'wants the chair himself', repair_grievance: 'wants a grievance settled', build_business: 'building a business of his own',
};

function Know({ lvl, via }: { lvl: KnowLvl | 'unknown'; via?: string }) {
  const cls = lvl === 'confirmed' ? 'border-emerald-600/60 text-emerald-300' : lvl === 'rumor' ? 'border-amber-500/60 text-amber-300' : 'border-noir-600 text-stone-500';
  return <span className={`inline-block rounded border px-1 text-[9px] uppercase tracking-wider ${cls}`} title={via ? `Via ${via}` : 'You do not know'} data-testid={`know-${lvl}`}>{lvl === 'unknown' ? '?' : lvl}</span>;
}

/** A small button that queues an order (or says why it can't). */
/** Is this order already on the week's list? */
function useQueued(): (a: ShadowAction) => boolean {
  const { orders } = useOrders();
  const keys = new Set(orders.map((o) => JSON.stringify(o)));
  return (a) => keys.has(JSON.stringify(act(a)));
}

function OrderBtn({ s, a, label, strong }: { s: GameState; a: ShadowAction; label: string; /** The row's main move: a bigger outline button. */ strong?: boolean }) {
  const { orders, queue } = useOrders();
  const action = act(a);
  const p = previewAction(s, action);
  const key = JSON.stringify(action);
  const queued = orders.some((o) => JSON.stringify(o) === key);
  const why = p.disabledReason;
  const odds = p.acceptance ? ` (${Math.round(p.acceptance.chance * 100)}%)` : '';
  return (
    <button type="button" className={`rounded border ${strong ? 'h-7 px-2.5 text-[11.5px] font-semibold' : 'px-1.5 py-0.5 text-[11px]'} ${queued ? 'border-emerald-700/70 bg-emerald-900/30 text-emerald-300' : why ? 'border-noir-700 text-stone-600 cursor-not-allowed' : strong ? 'border-gold-600 text-gold-300 hover:bg-gold-500/10' : 'border-noir-600 text-stone-300 hover:border-gold-500 hover:text-gold-200'}`}
      disabled={!!why || queued} title={why ?? `${p.title}${odds}${p.detail ? ` — ${p.detail}` : ''}`} onClick={() => queue(action)} data-done={queued ? 'true' : undefined}>
      {queued ? `✓ ${label}` : label}
    </button>
  );
}

/** A row's main move, and the rest folded into More (the More button says when one of them is ordered). */
function RowActions({ s, main, rest }: { s: GameState; main: [ShadowAction, string]; rest: [ShadowAction, string][] }) {
  const isQ = useQueued();
  const any = rest.some(([a]) => isQ(a));
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <OrderBtn s={s} a={main[0]} label={main[1]} strong />
      {rest.length > 0 && (
        <ActionMenu label={any ? <span className="text-emerald-300">More ✓</span> : 'More'} className="[&_.llv-menu-btn]:h-7 [&_.llv-menu-btn]:px-2 [&_.llv-menu-btn]:text-[11px]">
          {rest.map(([a, l]) => <OrderBtn key={l} s={s} a={a} label={l} />)}
        </ActionMenu>
      )}
    </div>
  );
}

function Meter({ v, tone }: { v: number; tone: string }) {
  return <span className="h-1.5 flex-1 rounded bg-noir-700 overflow-hidden"><span className={`block h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>;
}

/** A block's header: the domain chip and the title in its ink (the house wine, the crews brass, the other families red). */
function H({ children, sub, d = 'family', glyph }: { children: string; sub?: string; d?: Domain; glyph?: string }) {
  return <CardHead d={d} glyph={glyph} title={children} aside={sub ? <span className="text-right">{sub}</span> : undefined} className="!mb-1 flex-wrap" />;
}
/** A block of the court: a card wearing its part of the Don's life. */
const box = (d: Domain) => `llv-card-box llv-card-plain ${domCard(d)}`;

export function ShadowCourt({ s: live }: { s: GameState }) {
  const s = useMemo(() => cloneState(live), [live]);
  const sh = shadowView(s);
  const boss = player(s);
  const heir = declaredHeir(s);
  const ub = theUb(s);
  const cons = theCons(s);
  const pr = pressure(s);
  const inv = involvement(s);
  const known = support(s, true);
  const aud = audienceView(s, 8);
  const sessions = knownSessions(s);
  const promises = knownPromises(s);
  const ms = members(s).sort((a, b) => ['underboss', 'consigliere', 'capo', 'soldier', 'associate', 'civilian'].indexOf(a.rank) - ['underboss', 'consigliere', 'capo', 'soldier', 'associate', 'civilian'].indexOf(b.rank) || a.id.localeCompare(b.id));
  const [allMen, setAllMen] = useState(false);
  const shown = allMen ? ms : ms.filter((m) => m.rank !== 'associate' && m.rank !== 'soldier' || sh.views[m.id]);
  const auth = ubAuthority(s);
  const stories = sh.stories.filter((x) => x.known).sort((a, b) => (b.ended ?? 1e9) - (a.ended ?? 1e9) || b.since - a.since).slice(0, 8);
  const rivals = Object.entries(sh.rivals).filter(([, r]) => r.known).map(([id, r]) => ({ r, rv: s.rivals.find((x) => x.id === id) })).filter((x) => x.rv);
  const ears = knownEars(s);
  const [plant, setPlant] = useState('');
  const plantMen = ms.filter((m) => m.rank === 'soldier' || m.rank === 'associate');
  const plantPick = plant || (ears[0] ? `ear:${ears[0].id}` : plantMen[0] ? `man:${plantMen[0].id}` : '');
  const heirKnown = heir ? known.shares[heir.id] ?? 0 : 0;
  const ubKnown = ub ? known.shares[ub.id] ?? 0 : 0;
  const claims = claimStrengths(s);
  const women = circleView(s);
  const pl = sh.plant && !sh.plant.blown && sh.plant.until >= s.week ? sh.plant : undefined;
  return (
    <div className="space-y-3" data-testid="shadow-court">
      {/* The heir question */}
      <section className={`${box('family')} space-y-2`} data-testid="succession-outlook" data-domain="family">
        <H glyph="♔">The chair, and who is thinking past you</H>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-[12rem] flex-1 items-center gap-2">
            <span className="llv-kicker w-20 shrink-0">Pressure</span>
            <Num v={pr.score} reasons={pr.reasons} title="Succession pressure: how much the men are thinking past you (not a countdown)" format={(x) => `${Math.round(x)}`}>
              <span className="tabular-nums text-lg text-stone-100 cursor-help w-8 text-right" data-testid="pressure">{pr.score}</span>
            </Num>
            <Meter v={pr.score} tone={pr.score >= 60 ? 'bg-blood-400' : pr.score >= 40 ? 'bg-amber-500' : 'bg-emerald-600'} />
          </div>
          <div className="flex min-w-[12rem] flex-1 items-center gap-2">
            <span className="llv-kicker w-20 shrink-0">You're there</span>
            <Num v={inv.score} reasons={inv.reasons} title="How present you are in your own family" format={(x) => `${Math.round(x)}`}>
              <span className="tabular-nums text-lg text-stone-100 cursor-help w-8 text-right">{inv.score}</span>
            </Num>
            <Meter v={inv.score} tone="bg-gold-500" />
          </div>
        </div>
        <p className="text-xs text-stone-400">
          {displayName(boss)}, {ageOn(boss.birth, s.date)}, health {boss.health}. {pr.score >= 60 ? 'The men are thinking about the day after you, out loud.' : pr.score >= 40 ? 'Some of the men are quietly thinking about who comes next.' : 'Nobody is counting the days.'}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-md border border-noir-700 bg-noir-900/50 p-2" data-testid="heir-backing">
            {heir ? <Face s={live} c={heir} size={40} /> : null}
            <div className="min-w-0 text-xs">
              <div className="llv-kicker">The heir</div>
              {heir ? <div className="text-sm"><CharLink s={live} id={heir.id} /> <span className="text-stone-500">{ageOn(heir.birth, s.date)}</span></div> : <div className="text-sm text-red-300">Nobody anyone can name</div>}
              {heir && <div className="text-stone-400">Known backing: <span className="text-stone-100 tabular-nums">{heirKnown}%</span> of the family</div>}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-noir-700 bg-noir-900/50 p-2">
            {ub ? <Face s={live} c={ub} size={40} /> : null}
            <div className="min-w-0 text-xs">
              <div className="llv-kicker">The underboss</div>
              {ub ? <div className="text-sm"><CharLink s={live} id={ub.id} /> <span className="text-stone-500">{ageOn(ub.birth, s.date)}</span></div> : <div className="text-sm text-stone-500">Nobody</div>}
              {ub && <div className="text-stone-400">{ub.id === heir?.id ? 'He is also the heir.' : <>Known backing: <span className="text-stone-100 tabular-nums">{ubKnown}%</span></>} · authority: <span className="text-stone-200" title={AUTH_TEXT[auth]}>{auth}</span></div>}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-stone-500">Where {known.unknown}% of the family stands, you don't know. Name or change the heir and groom him under <span className="text-stone-300">The heir & the law</span>.</p>
      </section>

      {/* The women's side of the court (engine/matchmakers.ts): the matchmaker's standing */}
      {women && (
        <section className={`${box('family')} space-y-1`} data-testid="women-side" data-domain="family">
          <H glyph="♕" sub="The matches she made, the favors the other mothers owe her.">The women's side</H>
          <div className="text-xs text-stone-300"><CharLink s={live} id={women.matron.id} />, {women.role}: standing <span className="tabular-nums text-stone-100">{women.circle.standing}</span> · {women.title} · {women.circle.favors.length} favor{women.circle.favors.length === 1 ? '' : 's'} owed.</div>
          <p className="text-[11px] text-stone-500">{women.court ? 'Her word counts: her own children\'s claims carry her circle (see the claimants).' : `At ${COURT_STANDING} her word counts for her own children's claims.`}</p>
        </section>
      )}

      {/* The claimants: who could sit in the chair, and how strong each claim is */}
      {claims.length > 0 && (
        <section className={`${box('family')} space-y-1`} data-testid="claimants" data-domain="family">
          <H glyph="♕" sub="blood · the capos · Philadelphia · money · respect">The claimants</H>
          <ul className="divide-y divide-noir-800">
            {claims.map((c) => {
              const ch = s.characters[c.id];
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs" data-testid="claimant">
                  <Face s={live} c={ch} size={28} />
                  <div className="min-w-[8rem] flex-1">
                    <CharLink s={live} id={c.id} />
                    <div className="text-[10px] text-stone-500">{ch.rank === 'civilian' ? (boss.childrenIds.includes(ch.id) ? 'your blood' : 'family') : ch.rank} · {ageOn(ch.birth, s.date)}{c.sidelined ? ' · put out to pasture' : ''}</div>
                  </div>
                  <div className="flex min-w-[9rem] flex-1 items-center gap-2" title={c.parts.map((p) => `${p.label}: ${p.value > 0 ? '+' : ''}${p.value}`).join('\n')}>
                    <Meter v={c.total} tone={c.id === heir?.id ? 'bg-gold-500' : 'bg-stone-500'} />
                    <span className="w-7 text-right tabular-nums text-stone-100">{c.total}</span>
                  </div>
                  <RowActions s={live} main={[{ op: 'reward', charId: c.id }, 'Buy support']}
                    rest={[[{ op: 'sideline', charId: c.id }, 'Sideline'], ...(!ch.dynasty ? [[{ op: 'remove', charId: c.id }, 'Remove…'] as [ShadowAction, string]] : [])]} />
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-stone-500">Name and groom your heir under <span className="text-stone-300">The heir & the law</span>; declare him at a family council. If you die or step down, you play on as the heir — and the men who lost will decide what they do about it.</p>
        </section>
      )}

      {/* Who backs whom */}
      <section className={`${box('crew')} space-y-1`} data-testid="crew-support" data-domain="crew">
        <H d="crew" sub="only what has reached you">Who backs whom</H>
        <ul className="divide-y divide-noir-800">
          {shown.map((m) => {
            const v = sh.views[m.id];
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-xs" data-testid="backer">
                <Face s={live} c={m} size={28} />
                <div className="min-w-[7rem] flex-1">
                  <CharLink s={live} id={m.id} />
                  <div className="text-[10px] text-stone-500">{m.rank === 'civilian' ? 'the old Don' : m.rank} · {ageOn(m.birth, s.date)}</div>
                </div>
                <div className="min-w-[8rem] flex-1">
                  {v ? <span className="text-stone-200">{v.prefer ? (v.prefer === m.id ? 'himself' : nameOf(s, v.prefer)) : 'nobody yet'}{v.goal ? <span className="text-stone-500"> · {GOAL_TEXT[v.goal]}</span> : null}</span> : <span className="text-stone-600">don't know</span>}
                  {' '}<Know lvl={v?.lvl ?? 'unknown'} via={v?.via} />
                </div>
                <RowActions s={live} main={[{ op: 'meet', charId: m.id }, 'Meet']}
                  rest={[[{ op: 'test', charId: m.id }, 'Test'], [{ op: 'reward', charId: m.id }, 'Reward']]} />
              </li>
            );
          })}
        </ul>
        {!allMen && ms.length > shown.length && <button type="button" className="text-[11px] text-gold-300 hover:underline" onClick={() => setAllMen(true)}>Show all {ms.length} men</button>}
      </section>

      {/* Who do people go to */}
      <section className={`${box('crew')} space-y-1`} data-testid="audience" data-domain="crew">
        <H d="crew" glyph="☞" sub="last 8 weeks">Who do the men go to?</H>
        {([['You', aud.don, 'exact'], [ub ? `${nameOf(s, ub.id)} (underboss)` : 'The underboss', aud.ubKnown, aud.ubKnown ? `at least · ${aud.ubSessions} meeting${aud.ubSessions === 1 ? '' : 's'} you know of` : 'you have not heard'], [cons ? `${nameOf(s, cons.id)} (consigliere)` : 'The consigliere', aud.cons, 'he tells you'], ['The capos', aud.capos, 'they tell you']] as [string, number, string][]).map(([label, n, note]) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-32 shrink-0 truncate text-stone-300">{label}</span>
            <Meter v={Math.min(100, n * 5)} tone="bg-gold-600" />
            <span className="w-6 text-right tabular-nums text-stone-100">{n}</span>
            <span className="hidden sm:inline w-40 text-[10px] text-stone-500">{note}</span>
          </div>
        ))}
      </section>

      {/* The underboss's court */}
      <section className={`${box('crew')} space-y-2`} data-testid="ub-decisions" data-domain="crew">
        <H d="crew" glyph="♜" sub={pl ? `${nameOf(s, pl.id)} is listening for you · ${pl.reports} report${pl.reports === 1 ? '' : 's'}` : undefined}>The underboss's known decisions</H>
        {ub && (
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-stone-400">
            <span className="mr-1">His authority:</span>
            {(['routine', 'operational', 'executive', 'acting'] as const).map((l) => <OrderBtn key={l} s={live} a={{ op: 'authority', level: l }} label={l === auth ? `${l} (now)` : l} />)}
          </div>
        )}
        {sessions.length === 0 ? <p className="text-xs text-stone-500">You have not heard of any meeting he held without you. That does not mean there were none.</p> : (
          <ul className="space-y-1.5">
            {sessions.slice(0, 5).map(({ ses, b }) => (
              <li key={ses.id} className="rounded border border-noir-700 bg-noir-900/50 p-2 text-xs" data-testid="known-session">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-stone-300">{when(ses.week)}</span>
                  <Know lvl={b.lvl} via={b.via} />
                  <span className="text-[10px] text-stone-500">via {b.via}{b.w - ses.week >= 8 ? ` · ${Math.round((b.w - ses.week) / 4.3)} months later` : ''}</span>
                </div>
                {b.lvl === 'confirmed' ? (
                  <>
                    <div className="text-stone-400">{nameOf(s, ses.presiding)} met {ses.participants.map((id) => nameOf(s, id)).join(', ')} in {ses.where}.{ses.auth === 'unauthorized' ? <span className="text-amber-300"> Some of it was not his to decide.</span> : null}</div>
                    <ul className="ml-3 list-disc text-stone-300">{ses.petitions.map((p) => <li key={p.id}>{p.decision ?? p.text}</li>)}</ul>
                  </>
                ) : <div className="text-stone-400">{b.txt ?? `${nameOf(s, ses.presiding)} had men at his table. What was decided, you don't know.`}</div>}
              </li>
            ))}
          </ul>
        )}
        {sessions.length > 5 && <p className="text-[11px] text-stone-500">…and {sessions.length - 5} earlier meeting{sessions.length - 5 === 1 ? '' : 's'} you know of.</p>}
      </section>

      {/* Promises */}
      <section className={`${box('family')} space-y-1`} data-testid="known-promises" data-domain="family">
        <H glyph="✍">Promises you've heard of</H>
        {promises.length === 0 ? <p className="text-xs text-stone-500">None that reached you.</p> : (
          <ul className="space-y-1">
            {promises.slice(0, 10).map(({ p, b }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="known-promise">
                <span className="min-w-[12rem] flex-1 text-stone-300">{p.maker === s.playerId ? 'You' : nameOf(s, p.maker)} → {nameOf(s, p.to)}: {b.wrong && b.txt ? <span className="italic">"{b.txt}"</span> : <>{p.role} <span className="text-stone-500">({p.condition})</span></>}</span>
                <Know lvl={b.lvl} via={b.via} />
                <span className={`text-[10px] uppercase ${p.status === 'broken' ? 'text-red-300' : p.status === 'fulfilled' ? 'text-emerald-300' : 'text-stone-400'}`}>{p.status}</span>
                {(p.status === 'outstanding' || p.status === 'disputed') && p.maker !== s.playerId && <><OrderBtn s={live} a={{ op: 'honor', promiseId: p.id }} label="Honor" /><OrderBtn s={live} a={{ op: 'disown', promiseId: p.id }} label="Disown" /></>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* What you can do */}
      <section className={`${box('family')} space-y-2`} data-testid="succession-actions" data-domain="family">
        <H glyph="▶">Moves</H>
        <div className="grid gap-2 sm:grid-cols-2">
          {ub && <ActionCard s={live} action={act({ op: 'report' })} compact />}
          {ub && <ActionCard s={live} action={act({ op: 'confront' })} compact />}
          <ActionCard s={live} action={act({ op: 'council' })} compact />
          {!ub && <p className="text-xs text-stone-500 self-center">Nobody holds the underboss seat, so nobody holds a court of his own. Fill it from The council.</p>}
          {ub && <div className="space-y-1">
            <label className="block text-[11px] text-stone-400">Plant someone in the underboss's court:{' '}
              <select className="mt-0.5 w-full rounded bg-noir-900 border border-noir-600 p-1 text-xs" value={plantPick} onChange={(e) => setPlant(e.target.value)} data-testid="plant-pick">
                {ears.map((e) => <option key={e.id} value={`ear:${e.id}`}>{displayName(s.characters[e.id])} (an Ear)</option>)}
                {plantMen.map((m) => <option key={m.id} value={`man:${m.id}`}>{displayName(m)} ({m.rank})</option>)}
              </select>
            </label>
            {plantPick && <ActionCard s={live} action={act({ op: 'plant', kind: plantPick.startsWith('ear:') ? 'ear' : 'man', id: plantPick.slice(4) })} compact />}
          </div>}
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-[11px] text-stone-400">Step down…</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <ActionCard s={live} action={act({ op: 'retire', mode: 'emeritus' })} compact />
            <ActionCard s={live} action={act({ op: 'retire', mode: 'consigliere' })} compact />
            <ActionCard s={live} action={act({ op: 'retire', mode: 'florida' })} compact />
          </div>
        </details>
        {sh.splinters.filter((x) => !x.back && s.characters[x.leaderId]?.alive).map((x) => <ActionCard key={x.id} s={live} action={act({ op: 'reunite', splinterId: x.id })} compact />)}
      </section>

      {/* Rivals */}
      {rivals.length > 0 && (
        <section className={`${box('rivals')} space-y-1`} data-testid="rival-reads" data-domain="rivals">
          <H d="rivals">The other families</H>
          <ul className="space-y-0.5 text-xs">
            {rivals.map(({ r, rv }) => (
              <li key={rv!.id} className="text-stone-300">{rv!.name}: {({ steady: 'content with things as they are', probe: 'asking questions about your health', renegotiate: 'revisiting old agreements', court: 'courting a successor', recruit: 'making offers to your men', warn: 'warned you about your own people' } as const)[r.stance]}{r.favor ? <> · their favorite: <CharLink s={live} id={r.favor} /></> : null} <Know lvl={r.known!} /></li>
            ))}
          </ul>
        </section>
      )}

      {/* Stories and history */}
      {stories.length > 0 && (
        <section className={`${box('family')} space-y-1`} data-testid="succession-stories" data-domain="family">
          <H glyph="✎">Stories in the family</H>
          <ul className="space-y-1 text-xs">
            {stories.map((st) => <li key={st.id}><span className="text-gold-200">{storyName(st.tpl)}</span> <span className="text-stone-500">{when(st.since)}</span>{st.outcome ? <span className="text-stone-400"> — {st.log[st.log.length - 1]?.text}</span> : <span className="text-amber-300"> — still playing out</span>}</li>)}
          </ul>
        </section>
      )}
      {sh.successions.length > 0 && (
        <section className={`${box('family')} space-y-1`} data-domain="family">
          <H glyph="♔">Successions</H>
          <ul className="space-y-0.5 text-xs text-stone-400">{[...sh.successions].reverse().map((x, i) => <li key={i}>{when(x.week)} · {x.text}</li>)}</ul>
        </section>
      )}
      {(sh.mem[s.playerId]?.length ?? 0) > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.25em] text-stone-500">What you remember</summary>
          <ul className="mt-1 space-y-0.5 text-stone-400">{[...sh.mem[s.playerId]].reverse().map((m, i) => <li key={i}>{when(m.week)} · {m.text}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
