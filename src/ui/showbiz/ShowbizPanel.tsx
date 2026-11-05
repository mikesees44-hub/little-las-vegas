import { useState, type ReactNode } from 'react';
import { ageOn } from '../../engine/calendar';
import { fmtMoney } from '../../engine/effects';
import { askers } from '../../engine/payroll';
import {
  actName, ambRung, billOf, bookBlock, buyoutPrice, expectedAdvance, LENGTHS, managerLabel, mine, PCTS, pullOf, SEASON, talent,
} from '../../engine/showbiz';
import { KIND_LABEL, RECORDS, ROOMS, RUNGS, type Act, type RoomId } from '../../engine/showbizState';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionRow } from '../components/ActionRow';
import { Empty, PlaceBanner, PlayCard, Section, StatChip, SubTabs } from '../components/Layout';
import { CharLink, Face } from '../components/People';
import { publicityUrl } from './publicity';

/**
 * SHOWBIZ (engine/showbiz.ts), inside Nightlife: the acts you manage, the talent on the shore, the ladder of
 * rooms from Pacific Avenue to Hollywood, and the record label back home. Every act decides for itself.
 */

type Tab = 'acts' | 'talent' | 'gigs' | 'label';
const SB = (op: Extract<PlayerAction, { kind: 'showbiz' }>['op']): PlayerAction => ({ kind: 'showbiz', op });

function Meter({ label, v, bad }: { label: string; v: number; bad?: boolean }) {
  const good = bad ? v < 35 : v >= 60;
  const tone = good ? 'bg-emerald-500' : (bad ? v < 60 : v >= 35) ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="w-16 shrink-0 text-stone-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-noir-700" role="meter" aria-label={label} aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}><div className={`h-full ${tone}`} style={{ width: `${v}%` }} /></div>
      <span className="w-6 text-right tabular-nums text-stone-300">{v}</span>
    </div>
  );
}

/** The 8x10 glossy when it is uploaded; the painted portrait until then (or if it fails to load). */
function Glossy({ s, a, size = 64 }: { s: GameState; a: Act; size?: number }) {
  const url = publicityUrl(a.ph);
  const [bad, setBad] = useState(false);
  const c = s.characters[a.id];
  if (url && !bad) return <img src={url} alt={`${billOf(s, a)}, publicity photo`} width={size} height={Math.round(size * 1.25)} className="rounded-sm object-cover shadow" style={{ width: size, height: Math.round(size * 1.25) }} onError={() => setBad(true)} data-testid="showbiz-glossy" />;
  return c ? <Face s={s} c={c} size={size} /> : null;
}

function moodWord(con: number): string {
  return con >= 75 ? 'Happy with you' : con >= 55 ? 'Content' : con >= 35 ? 'Restless' : con >= 20 ? 'Sour' : 'Wants out';
}

function Fold({ label, children, testid }: { label: string; children: ReactNode; testid?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button type="button" className="text-[11px] text-gold-400 hover:text-gold-300" aria-expanded={open} onClick={() => setOpen(!open)} data-testid={testid}>{open ? 'Close ▴' : `${label} ▾`}</button>
      {open && <div className="mt-1 space-y-1">{children}</div>}
    </div>
  );
}

/** Terms: percentage, length, advance (the card under it shows the odds). */
function Terms({ s, a, kind }: { s: GameState; a: Act; kind: 'sign' | 'buyout' }) {
  const exp = expectedAdvance(a);
  const advs = [0, Math.round(exp / 100) * 50, exp, Math.round((exp * 1.5) / 50) * 50];
  const [pct, setPct] = useState(20);
  const [weeks, setWeeks] = useState(52);
  const [adv, setAdv] = useState(exp);
  const [via, setVia] = useState<string | undefined>(undefined);
  const who = askers(s);
  const pick = <T,>(label: string, opts: T[], v: T, set: (x: T) => void, fmt: (x: T) => string) => (
    <div className="flex flex-wrap items-center gap-1 text-[11px]">
      <span className="w-14 text-stone-400">{label}</span>
      {opts.map((o) => <button key={String(o)} type="button" aria-pressed={o === v} className="llv-pick llv-pick-sm" onClick={() => set(o)}>{fmt(o)}</button>)}
    </div>
  );
  const action = kind === 'sign' ? SB({ op: 'sign', id: a.id, pct, weeks, adv, ...(via ? { via } : {}) }) : SB({ op: 'buyout', id: a.id, pct, weeks, adv });
  return (
    <div className="space-y-1 rounded border border-noir-700 p-1.5" data-testid={`showbiz-terms-${kind}`}>
      {pick('Your cut', PCTS, pct, setPct, (x) => `${x}%`)}
      {pick('Length', LENGTHS, weeks, setWeeks, (x) => (x < 52 ? `${x} wks` : `${x / 52} yr${x > 52 ? 's' : ''}`))}
      {pick('Advance', advs, adv, setAdv, (x) => (x ? fmtMoney(x) : 'None'))}
      {kind === 'sign' && who.length > 1 && pick('Who asks', who.map((x) => x.id ?? ''), via ?? '', (x) => setVia(x || undefined), (x) => (x ? who.find((w) => w.id === x)!.label.split(',')[0] : 'You'))}
      <ActionRow s={s} action={action} label={kind === 'sign' ? 'Sign' : `Buy out (${fmtMoney(buyoutPrice(a))} to the office)`} open />
    </div>
  );
}

function ActCard({ s, a }: { s: GameState; a: Act }) {
  const c = s.characters[a.id];
  if (!c) return null;
  const age = ageOn(c.birth, s.date);
  const yours = a.by === 'p';
  const next = Math.min(5, a.top + 1);
  const L = s.showbiz?.label;
  const lines = [
    `${KIND_LABEL[a.k]}${a.n && a.k === 'group' ? `, lead ${c.firstName} ${c.lastName}` : ''} · ${age}${a.loc ? ' · a local kid' : ''}`,
    yours && a.deal ? `${a.deal.pct}% to you, to week ${a.deal.until}${a.gig ? ` · now: ${a.gig.room} to week ${a.gig.until}` : ' · no gig booked'}` : managerLabel(a),
  ];
  return (
    <PlayCard as="li" d="romance" testid={yours ? 'showbiz-act' : 'showbiz-talent'} dataAttrs={{ 'data-kind': a.k, 'data-id': a.id }}
      art={<Glossy s={s} a={a} size={56} />} artClassName="!min-h-[72px]"
      corner={a.friend !== undefined ? <span className="rounded bg-gold-500 px-1 text-[10px] font-semibold text-noir-950">Friend</span> : a.hit !== undefined && s.week - a.hit < 26 ? <span className="rounded bg-emerald-600 px-1 text-[10px] text-white">Hit record</span> : a.grudge !== undefined ? <span className="rounded bg-red-600 px-1 text-[10px] text-white">Grudge</span> : undefined}
      title={<CharLink s={s} id={a.id}>{actName(s, a)}</CharLink>} lines={lines}>
      <div className="mt-1 space-y-0.5">
        <Meter label="Talent" v={a.tal} />
        <Meter label="Draw" v={a.draw} />
        <Meter label="Fame" v={a.fame} />
        <Meter label={yours ? 'Content' : 'Mood'} v={a.con} />
        <p className="text-[11px] text-stone-400">{moodWord(a.con)} · wants {RUNGS[ambRung(a)].name.toLowerCase()} · has played {RUNGS[a.top].name.toLowerCase()}{yours ? ` · made you ${fmtMoney(a.earn)}` : ''}</p>
        {a.h.length > 0 && <p className="text-[10.5px] italic text-stone-500">{a.h[a.h.length - 1][1]}</p>}
      </div>
      {yours ? (
        <Fold label="Book · record · terms" testid="showbiz-act-actions">
          {!a.gig && [next, next - 1].filter((r, i, x) => r >= 0 && x.indexOf(r) === i).map((r) => <ActionRow key={r} s={s} action={SB({ op: 'book', id: a.id, rung: r })} label={`Book: ${RUNGS[r].name}`} />)}
          {L && RECORDS.includes(a.k) && ([0, 1, 2] as const).map((radio) => <ActionRow key={radio} s={s} action={SB({ op: 'press', id: a.id, radio })} label={radio === 0 ? 'Press a record' : radio === 1 ? 'Press it, with a little for the disc jockeys' : 'Press it, with the full treatment'} hostile={radio > 0} />)}
          <ActionRow s={s} action={SB({ op: 'bonus', id: a.id, amount: 250 })} label="A present ($250)" />
          <ActionRow s={s} action={SB({ op: 'renew', id: a.id, pct: a.deal?.pct ?? 20, weeks: 52 })} label="Another year, same terms" />
          {(a.deal?.pct ?? 0) > 15 && <ActionRow s={s} action={SB({ op: 'renew', id: a.id, pct: Math.max(10, (a.deal?.pct ?? 20) - 5), weeks: 52 })} label="Another year, a smaller cut" />}
          <ActionRow s={s} action={SB({ op: 'release', id: a.id })} label="Let them go" hostile />
        </Fold>
      ) : (
        <Fold label={a.by && a.by !== 'ind' ? 'Buy out · lean on the office' : 'Sign'} testid="showbiz-talent-actions">
          {(!a.by || a.by === 'ind') && <Terms s={s} a={a} kind="sign" />}
          {a.by && <Terms s={s} a={a} kind="buyout" />}
          {a.by && a.by !== 'ind' && <ActionRow s={s} action={SB({ op: 'lean', id: a.id })} label="Lean on the office (your choice: it has consequences)" hostile />}
        </Fold>
      )}
    </PlayCard>
  );
}

function ActsTab({ s }: { s: GameState }) {
  const acts = mine(s);
  if (!acts.length) return <Empty title="You manage nobody yet.">Sign an act from The talent: a percentage, a length, an advance. They decide.</Empty>;
  return <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="showbiz-acts">{acts.map((a) => <ActCard key={a.id} s={s} a={a} />)}</ul>;
}

function TalentTab({ s }: { s: GameState }) {
  const [kind, setKind] = useState<string>('all');
  const all = talent(s);
  const list = kind === 'all' ? all : kind === 'local' ? all.filter((a) => a.loc) : all.filter((a) => a.k === kind);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Kind of act">
        {['all', 'singer', 'group', 'comic', 'band', 'dancer', 'actor', 'local'].map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} className="llv-pick llv-pick-sm" onClick={() => setKind(k)}>{k === 'all' ? 'Everyone' : k === 'local' ? 'Local kids' : KIND_LABEL[k as Act['k']]}</button>
        ))}
      </div>
      {list.length ? <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="showbiz-talent">{list.map((a) => <ActCard key={a.id} s={s} a={a} />)}</ul> : <Empty title="Nobody like that on the circuit right now." />}
    </div>
  );
}

function GigsTab({ s }: { s: GameState }) {
  const S = s.showbiz;
  const acts = mine(s);
  const playing = acts.filter((a) => a.gig);
  const group = playing.find((a) => a.k === 'group' && a.gig!.r >= 1 && s.characters[a.id]?.ethnicity !== 'Black');
  const vg = publicityUrl('vg_stage');
  const diva = playing.find((a) => a.k === 'singer' && a.gig!.r >= 1 && s.characters[a.id]?.gender === 'F' && s.characters[a.id]?.ethnicity === 'Black');
  const bs = publicityUrl('bs_stage');
  return (
    <div className="space-y-3">
      {group && vg && <img src={vg} alt={`${billOf(s, group)} at ${group.gig!.room}`} className="max-h-48 w-full rounded object-cover" data-testid="showbiz-group-banner" />}
      {diva && bs && <img src={bs} alt={`${billOf(s, diva)} at ${diva.gig!.room}`} className="max-h-48 w-full rounded object-cover" data-testid="showbiz-singer-banner" />}
      <Section title="Playing now" testid="showbiz-playing">
        {playing.length ? (
          <ul className="space-y-1 text-[12px]">{playing.map((a) => <li key={a.id}><b className="text-stone-100">{billOf(s, a)}</b> at {a.gig!.room} ({RUNGS[a.gig!.r].name}), to week {a.gig!.until}{a.wk ? ` · grossing ${fmtMoney(a.wk)} a week` : ''}</li>)}</ul>
        ) : <p className="text-[12px] text-stone-400">None of your acts is booked. Book them from Your acts.</p>}
      </Section>
      <Section title="The ladder" sub="Each rung wants the act's draw, your pull and a fee. One step at a time." testid="showbiz-ladder">
        <ol className="space-y-1.5">
          {RUNGS.map((R, i) => {
            const p = pullOf(s, i);
            const ready = acts.filter((a) => !bookBlock(s, a, i)).map((a) => billOf(s, a));
            return (
              <li key={R.id} className="rounded border border-noir-700 p-1.5 text-[12px]" data-testid="showbiz-rung">
                <div className="flex flex-wrap items-baseline gap-x-2"><b className="text-stone-100">{i + 1}. {R.name}</b><span className="text-stone-400">{R.room}</span></div>
                <div className="text-stone-300">Draw {R.draw}+ · pull {R.pull}+ · fee {R.fee ? fmtMoney(R.fee) : 'none'} · {R.weeks} week{R.weeks > 1 ? 's' : ''} · about {fmtMoney(R.pay)} a week at full draw</div>
                <div className={p.total >= R.pull ? 'text-emerald-400' : 'text-stone-400'}>Your pull: {p.total}{p.reasons.length ? ` (${p.reasons.map((r) => `${r.label} ${r.value > 0 ? '+' : ''}${r.value}`).join('; ')})` : ''}</div>
                {ready.length > 0 && <div className="text-stone-400">Ready to book: {ready.join(', ')}</div>}
              </li>
            );
          })}
        </ol>
      </Section>
      <Section title="A piece of the room" sub="The outfits own the big rooms. A point pays a little every week, and your acts get a hearing." testid="showbiz-points">
        <div className="space-y-1">
          {(Object.keys(ROOMS) as RoomId[]).map((r) => S?.pts[r] !== undefined
            ? <p key={r} className="text-[12px] text-emerald-400">You own a point in {ROOMS[r].room} (since week {S.pts[r]}): {fmtMoney(ROOMS[r].div)} a week.</p>
            : <ActionRow key={r} s={s} action={SB({ op: 'point', room: r })} label={`A point in ${ROOMS[r].room}, through ${ROOMS[r].through}`} />)}
        </div>
      </Section>
    </div>
  );
}

function LabelTab({ s }: { s: GameState }) {
  const L = s.showbiz?.label;
  if (!L) {
    return (
      <div className="space-y-2">
        <Empty title="No label of your own.">Start one back home: press records for your acts each season, put them in the jukeboxes, and get them on the radio (payola is a crime, and the government is asking).</Empty>
        <ActionRow s={s} action={SB({ op: 'label', home: 'Wildwood' })} label="A label in Wildwood ($4,000)" />
        <ActionRow s={s} action={SB({ op: 'label', home: 'Philadelphia' })} label="A label in Philadelphia ($7,000)" />
      </div>
    );
  }
  const S = s.showbiz!;
  const recs = [...L.recs].reverse();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <StatChip label="Label" value={L.name} sub={`${L.home}, since week ${L.since}`} domain="money" />
        <StatChip label="Hits" value={L.hits} domain="money" />
        <StatChip label="Payola heat" value={L.heat} tone={L.heat >= 45 ? 'bad' : L.heat >= 20 ? 'warn' : 'good'} domain="law" testid="showbiz-payola-heat" />
      </div>
      <p className="text-[11.5px] text-stone-400">One record a season per act ({SEASON} weeks); a record runs ten weeks. Your jukebox routes put it in the machines; the radio costs payola. A national hit makes an act famous and opens rooms.</p>
      {recs.length ? (
        <ul className="space-y-1.5" data-testid="showbiz-records">
          {recs.map((r) => {
            const a = S.acts[r.act];
            return (
              <li key={r.id} className="rounded border border-noir-700 p-1.5 text-[12px]">
                <div><b className="text-stone-100">"{r.title}"</b> · {a ? billOf(s, a) : 'gone'} · pressed week {r.wk}{r.done ? ' · off the charts' : ''}</div>
                <div className="text-stone-400">{r.sold.toLocaleString()} copies · {fmtMoney(r.roy)} to the label · {r.reach === 2 ? 'a national hit' : r.reach === 1 ? 'a regional hit' : 'local'} · jukeboxes {r.jb} · radio {r.radio === 2 ? 'the full treatment' : r.radio === 1 ? 'a little something' : 'none'}</div>
                {!r.done && <Fold label="The radio">{([0, 1, 2] as const).filter((x) => x !== r.radio).map((x) => <ActionRow key={x} s={s} action={SB({ op: 'payola', rec: r.id, radio: x })} label={x === 0 ? 'Stop the payola' : x === 1 ? 'A little something for the disc jockeys' : 'The full treatment'} hostile={x > 0} />)}</Fold>}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-[12px] text-stone-400">Nothing pressed yet: press a record from an act's card.</p>}
    </div>
  );
}

export function ShowbizPanel({ s }: { s: GameState }) {
  const [tab, setTab] = useState<Tab>('acts');
  const S = s.showbiz;
  const acts = mine(s);
  const earn = acts.reduce((x, a) => x + a.earn, 0);
  return (
    <div className="space-y-3" data-testid="showbiz-panel">
      <PlaceBanner art="club_stage_1960" d="romance" title="Showbiz" sub="Sign the acts, book them from Pacific Avenue to Hollywood, make their records back home. Every act decides for itself."
        aside={<><StatChip label="Your acts" value={acts.length} /><StatChip label="Made you" value={fmtMoney(earn)} /></>} testid="showbiz-banner" />
      <SubTabs label="Showbiz" value={tab} onChange={setTab} testid="showbiz-tabs" tabs={[
        { id: 'acts', label: 'Your acts', testid: 'showbiz-tab-acts' },
        { id: 'talent', label: 'The talent', testid: 'showbiz-tab-talent' },
        { id: 'gigs', label: 'Gigs', testid: 'showbiz-tab-gigs' },
        { id: 'label', label: 'The label', testid: 'showbiz-tab-label' },
      ]} />
      {!S ? <Empty title="The season has not started.">The acts come down with the first week.</Empty>
        : tab === 'acts' ? <ActsTab s={s} /> : tab === 'talent' ? <TalentTab s={s} /> : tab === 'gigs' ? <GigsTab s={s} /> : <LabelTab s={s} />}
      {S && S.log.length > 0 && (
        <Section title="Lately" testid="showbiz-log">
          <ul className="space-y-0.5 text-[11.5px] text-stone-400">{[...S.log].reverse().slice(0, 6).map(([w, t], i) => <li key={i}>Week {w}: {t}</li>)}</ul>
        </Section>
      )}
    </div>
  );
}
