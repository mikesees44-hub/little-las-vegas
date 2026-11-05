import { useState } from 'react';
import { approachRate, approachView, fixView, isSingle, MA_WEIGH, maStatus, type ComeAnswer, type MaAnswer } from '../../engine/single';
import type { Acceptance } from '../../engine/interactions';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { PlayCard, Section } from '../components/Layout';
import { fmt$ } from '../format';

/**
 * SINGLE (engine/single.ts) on Relationships & Dating: the woman who came to
 * him (who she is, why, the odds, four answers) in romance's rose, and Ma's
 * match for him (her pick, her reasons, the coffee terms, four answers) in
 * the family's wine. Every answer is an ordinary order card, settled in the
 * moment, and lands in Your File. Nothing here is a popup.
 */
export function SingleCards({ s }: { s: GameState }) {
  const ap = approachView(s);
  const fx = fixView(s);
  const single = isSingle(s);
  if (!single && !ap) return null;
  const rate = approachRate(s);
  return (
    <Section domain="romance" title={single ? 'Who comes to you' : 'A woman came to you'} testid="single"
      aside={single ? <span data-testid="single-rate">about {rate.perYear} a year</span> : undefined}
      sub={single ? 'You are single, and the island knows it. Women come to you; your mother brings you girls. She always decides, and so does her family.' : 'You are married. A few still try; anything more is an affair.'}>
      <div className="grid gap-3 lg:grid-cols-2">
        {ap ? <ApproachCard s={s} /> : (
          <PlayCard d="romance" testid="single-none" pip="☾" title="Nobody is waiting on you this week"
            lines={['When a woman comes to you, her card waits here and on the Desk for about three weeks.']}>
            <Pull s={s} />
          </PlayCard>
        )}
        {fx ? <MaCard s={s} /> : single && <PlayCard d="family" testid="ma-none" pip="♔" title="Your family's matchmaking" lines={[maStatus(s)]} />}
      </div>
    </Section>
  );
}

/** Why about N a year: his pull, as chips. */
function Pull({ s }: { s: GameState }) {
  const [open, setOpen] = useState(false);
  const r = approachRate(s);
  return (
    <div className="mt-1 text-[11px]">
      <button type="button" className="btn-quiet text-[11px]" onClick={() => setOpen(!open)} data-testid="single-pull-toggle">{open ? 'Hide' : `Why about ${r.perYear} a year ▸`}</button>
      {open && (
        <ul className="mt-1 flex flex-wrap gap-1" data-testid="single-pull">
          {r.reasons.map((x) => <li key={x.label} className={`rounded px-1.5 py-0.5 ${x.value >= 0 ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/30 text-red-200'}`}>{x.value > 0 ? '+' : ''}{x.value === -100 ? '' : x.value} {x.label}</li>)}
        </ul>
      )}
    </div>
  );
}

function OddsLine({ odds, label }: { odds: Acceptance; label: string }) {
  return (
    <div className="mt-1 text-[11px] text-stone-400">
      {label}: <b className="text-stone-200">{Math.round(odds.chance * 100)}%</b>
      <span className="text-stone-500"> · {odds.reasons.filter((r) => r.label !== 'Base').slice(0, 4).map((r) => `${r.value > 0 ? '+' : ''}${r.value} ${r.label.toLowerCase()}`).join(', ')}</span>
    </div>
  );
}

function ApproachCard({ s }: { s: GameState }) {
  const v = approachView(s)!;
  const { a, c, info, motive } = v;
  return (
    <PlayCard d="romance" testid="single-approach" tone="next"
      art={<Face s={s} c={c} size={64} />} artClassName="!min-h-[78px]"
      corner={<span className="llv-pc-tag">She came to you</span>}
      caption={info.label}
      title={<><CharLink s={s} id={c.id} />, {v.age}</>}
      lines={[<>{info.how}, {c.firstName} {info.scene}.</>, <>Why: <b className="text-stone-200">{motive.label}</b>: {motive.line}.</>]}>
      {v.read && <div className="mt-1 text-[11px] text-amber-200/90" data-testid="single-read">Your read: {v.read}</div>}
      {a.m && <div className="mt-1 text-[11px] text-amber-200/90">You are married, and she knows it.</div>}
      <OddsLine odds={v.odds} label="If you take her out, she wants a second evening" />
      <div className="mt-0.5 text-[11px] text-stone-500">She waits {v.left ? `about ${v.left} more week${v.left === 1 ? '' : 's'}` : 'until the week is out'}, then moves on.</div>
      {!s.gameOver && (
        <div className="mt-2 grid gap-1.5" data-testid="single-answers">
          {(['out', 'slow', 'kind', 'cold'] as ComeAnswer[]).map((x) => <ActionCard key={x} s={s} action={{ kind: 'dating', op: { op: 'come', id: c.id, a: x } }} compact />)}
        </div>
      )}
    </PlayCard>
  );
}

function MaCard({ s }: { s: GameState }) {
  const v = fixView(s)!;
  const { f, c, ma, call, house } = v;
  const w = MA_WEIGH[f.weigh];
  return (
    <PlayCard d="family" testid="ma-match" tone="next"
      art={<><Face s={s} c={ma} size={56} /><span className="mb-6 text-lg text-stone-400" aria-hidden>→</span><Face s={s} c={c} size={56} /></>} artClassName="!min-h-[74px]"
      corner={<span className="llv-pc-tag llv-pc-tag-red">{call}'s match</span>}
      title={<>{call} has a girl for you</>}
      lines={[<><CharLink s={s} id={c.id} />, {v.age}, {house ? <>of {house.name}</> : 'from the parish'}.</>, <>{ma.firstName} ({v.role}) weighs <b className="text-stone-200">{w.label.toLowerCase()}</b>: {w.line}.</>]}>
      <ul className="mt-1 space-y-0.5 text-[11.5px] text-stone-300" data-testid="ma-reasons">
        {f.why.map((x, i) => <li key={i}>“{x.charAt(0).toUpperCase()}{x.slice(1)}.”</li>)}
      </ul>
      <div className="mt-1 text-[11px] text-stone-400" data-testid="ma-coffee">
        Coffee with {s.characters[f.mother] ? `${s.characters[f.mother].firstName} ${s.characters[f.mother].lastName}` : f.mother}: Sunday dinner at theirs, both families{v.dowry > 0 ? `; a dowry of ${fmt$(v.dowry)} if it comes to a wedding` : ''}. {call}'s standing among the women: <b className="text-stone-200">{v.standing}</b>.
        {v.nag > 0 && <> You have put her off {v.nag} time{v.nag === 1 ? '' : 's'}; she is counting.</>}
      </div>
      <OddsLine odds={v.odds} label="She and her family say yes to dinner" />
      <div className="mt-0.5 text-[11px] text-stone-500">If you say nothing for {v.left} more week{v.left === 1 ? '' : 's'}, {call} takes it as "not now", and nags.</div>
      {!s.gameOver && (
        <div className="mt-2 grid gap-1.5" data-testid="ma-answers">
          {(['meet', 'decide', 'notNow', 'own'] as MaAnswer[]).map((x) => <ActionCard key={x} s={s} action={{ kind: 'dating', op: { op: 'ma', id: c.id, a: x } }} compact />)}
        </div>
      )}
    </PlayCard>
  );
}
