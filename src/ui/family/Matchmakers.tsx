import { useState } from 'react';
import { ageOn } from '../../engine/calendar';
import { houseById } from '../../engine/familyState';
import { HOUSE_KIND_LABEL } from '../../engine/familyHouses';
import {
  arrangeable, circleView, COURT_STANDING, FAVOR_TEXT, herPicks, matronOf, matronRole, motherName, proposalView, WEIGH_TEXT, weighOf,
  type FavorKind,
} from '../../engine/matchmakers';
import type { Character, GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink, Face } from '../components/People';
import { CardHead, PlayCard, Section } from '../components/Layout';
import { domCard } from '../domain';
import { fmt$ } from '../format';

/**
 * THE MATCHMAKERS (engine/matchmakers.ts) on the Marriages screen: her match
 * waiting on his answer (a card with her reasons, every answer with its odds
 * and effects, settled in the moment), and her circle (standing, favors owed,
 * what she can call in). The family's wine throughout.
 */
export function Matchmakers({ s }: { s: GameState }) {
  const matron = matronOf(s);
  if (!matron) return null;
  return (
    <Section domain="family" title="The women arrange the matches" testid="matchmakers"
      aside={<span>{matron.firstName}, {matronRole(s, matron)}</span>}
      sub={`${matron.firstName} works out the children's matches over coffee with the other mothers. You can bless it, grumble, put your foot down, or name your own (it goes through her). The young person always decides too.`}>
      <div className="grid gap-3 lg:grid-cols-2">
        <HerMatch s={s} matron={matron} />
        <HerCircle s={s} id={matron.id} />
      </div>
    </Section>
  );
}

function HerMatch({ s, matron }: { s: GameState; matron: Character }) {
  const pv = proposalView(s);
  if (!pv) {
    const n = arrangeable(s).length;
    return (
      <PlayCard d="family" testid="her-match-none" art={<Face s={s} c={matron} size={60} />} artClassName="!min-h-[74px]"
        title={`${matron.firstName} is not pushing a match right now`}
        lines={[n ? `${n} of the house ${n === 1 ? 'is' : 'are'} of age and free; she is asking around.` : 'Nobody in the house is of age and free.', 'When she has one, it comes to you here and on the Desk.']} />
    );
  }
  const { p, by, member, spouse, house, odds, dowry } = pv;
  const w = WEIGH_TEXT[p.weigh];
  const age = (c: Character) => ageOn(c.birth, s.date);
  return (
    <PlayCard d="family" testid="her-match" tone="next"
      art={<><Face s={s} c={by} size={60} /><span className="mb-6 text-lg text-stone-400" aria-hidden>→</span><Face s={s} c={member} size={52} /><span className="mb-6 text-lg text-[rgb(var(--d-ink))]" aria-hidden>♥</span><Face s={s} c={spouse} size={52} /></>}
      corner={<span className="llv-pc-tag llv-pc-tag-red">Her match</span>}
      title={<>{by.firstName} has a match for {member.firstName}</>}
      lines={[<><CharLink s={s} id={spouse.id} />, {age(spouse)}, of {house.name} ({HOUSE_KIND_LABEL[house.kind]}). {member.firstName} is {age(member)}.</>, <>She weighs <b className="text-stone-200">{w.label.toLowerCase()}</b>: {w.line}.</>]}>
      <ul className="mt-1 space-y-0.5 text-[11.5px] text-stone-300" data-testid="her-reasons">
        {p.why.map((x, i) => <li key={i}>“{x.charAt(0).toUpperCase()}{x.slice(1)}.”</li>)}
      </ul>
      <div className="mt-1 text-[11px] text-stone-400" data-testid="her-coffee">
        Coffee with {motherName(s, p.mother)}: {dowry > 0 ? `they pay ${fmt$(dowry)}` : dowry < 0 ? `we pay ${fmt$(-dowry)}` : 'no dowry'}. Chance they all say yes if you bless it: <b className="text-stone-200">{Math.round(odds.chance * 100)}%</b>. If you say nothing for six weeks, she goes ahead.
      </div>
      {!s.gameOver && (
        <div className="mt-2 grid gap-1.5" data-testid="her-match-answers">
          <ActionCard s={s} action={{ kind: 'bond', op: { op: 'match', id: by.id, answer: 'bless' } }} compact />
          <ActionCard s={s} action={{ kind: 'bond', op: { op: 'match', id: by.id, answer: 'grumble' } }} compact />
          <ActionCard s={s} action={{ kind: 'bond', op: { op: 'match', id: by.id, answer: 'veto' } }} compact />
          <OwnPick s={s} matron={by} member={member} skip={spouse.id} />
        </div>
      )}
    </PlayCard>
  );
}

/** His own candidate, through her. */
export function OwnPick({ s, matron, member, skip }: { s: GameState; matron: Character; member: Character; skip?: string }) {
  const picks = herPicks(s, matron, member).filter((x) => x.c.id !== skip);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(picks[0]?.c.id);
  if (!picks.length) return null;
  return (
    <div>
      <button type="button" className="btn-quiet text-[11px]" onClick={() => setOpen(!open)} data-testid="own-pick-toggle">{open ? 'Hide' : `Name your own match for ${member.firstName} (it goes through ${matron.firstName}) ▸`}</button>
      {open && (
        <div className="mt-1 space-y-1">
          <select className="block w-full min-w-0 max-w-full truncate rounded border border-noir-600 bg-noir-900 p-1.5 text-xs" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Your pick for ${member.firstName}`}>
            {picks.map((x) => <option key={x.c.id} value={x.c.id}>{x.c.firstName} {x.c.lastName}, {ageOn(x.c.birth, s.date)} — {x.house.name}</option>)}
          </select>
          {pick && <ActionCard s={s} action={{ kind: 'bond', op: { op: 'match', id: matron.id, answer: 'own', memberId: member.id, spouseId: pick } }} compact />}
        </div>
      )}
    </div>
  );
}

/** Her standing: the number, what it buys, the favors she is owed. Also on her character sheet. */
export function HerCircle({ s, id, sheet }: { s: GameState; id: string; sheet?: boolean }) {
  const v = circleView(s, id);
  const c = s.characters[id];
  const [kind, setKind] = useState<FavorKind>('peace');
  if (!c) return null;
  if (!v) {
    if (sheet) return null;
    return (
      <section className={`llv-card-box llv-card-plain p-2.5 ${domCard('family')}`} data-domain="family" data-testid="her-circle">
        <CardHead d="family" title={`${c.firstName}'s circle`} className="!mb-1" />
        <p className="text-xs text-stone-400">Every match she makes raises her standing among the women of the shore: favors owed by the other mothers, and in time a word in who sits in your chair.</p>
      </section>
    );
  }
  const st = v.circle.standing;
  return (
    <section className={`llv-card-box llv-card-plain p-2.5 ${sheet ? 'mt-3' : ''} ${domCard('family')}`} data-domain="family" data-testid="her-circle">
      <CardHead d="family" title={`${c.firstName}'s circle`} sub={v.title} className="!mb-1"
        aside={<span className="font-display text-lg text-stone-100 tabular-nums" data-testid="her-standing" title="Her standing among the women of the shore, 0-100">{st}</span>} />
      <div className="h-1.5 w-full overflow-hidden rounded bg-noir-700" aria-hidden><div className="h-full bg-[rgb(var(--d))]" style={{ width: `${st}%` }} /></div>
      <div className="mt-1 text-[11px] text-stone-400">
        {v.circle.made} match{v.circle.made === 1 ? '' : 'es'} made · {v.circle.vetoed} vetoed · {v.circle.called} favor{v.circle.called === 1 ? '' : 's'} called in · {v.court ? <span className="text-[rgb(var(--d-ink))]">a voice in the succession for her own children</span> : `a voice in the succession at ${COURT_STANDING}`}
      </div>
      {v.circle.favors.length > 0 ? (
        <div className="mt-1.5">
          <div className="llv-kicker">Owed to her</div>
          <ul className="mt-0.5 space-y-1 text-xs">
            {v.circle.favors.map((f) => {
              const h = houseById(s, f.houseId);
              return (
                <li key={f.houseId} className="rounded border border-noir-700 bg-noir-900/60 p-1.5" data-testid="her-favor">
                  <div className="text-stone-200">{f.from} <span className="text-stone-500">({h?.name ?? 'a house'}, since week {f.week})</span></div>
                  {!s.gameOver && !sheet && (
                    <>
                      <div className="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label="What she asks for">
                        {(Object.keys(FAVOR_TEXT) as FavorKind[]).map((k) => (
                          <button key={k} type="button" role="radio" aria-checked={kind === k} className="llv-choice" onClick={() => setKind(k)}>{FAVOR_TEXT[k].label}</button>
                        ))}
                      </div>
                      <div className="mt-1"><ActionCard s={s} action={{ kind: 'bond', op: { op: 'herFavor', id, kind, houseId: f.houseId } }} compact /></div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : <div className="mt-1 text-[11px] text-stone-500">Nobody owes her yet. A match she makes leaves the other mother in her debt.</div>}
      {v.recent.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] text-stone-400" data-testid="her-log">
          {v.recent.slice(0, sheet ? 3 : 4).map(([w, t], i) => <li key={i}><span className="text-stone-600">wk {w}</span> {t}</li>)}
        </ul>
      )}
    </section>
  );
}

/** Which of her picks she would put first for this member (for the Marriages cards). */
export function herFirst(s: GameState, member: Character): { name: string; weigh: string } | undefined {
  const m = matronOf(s);
  if (!m) return undefined;
  const top = herPicks(s, m, member)[0];
  return top ? { name: `${top.c.firstName} ${top.c.lastName}`, weigh: WEIGH_TEXT[weighOf(s, m, member)].label.toLowerCase() } : undefined;
}

export { CharLink };
