import { useEffect, useMemo, useRef, useState } from 'react';
import { displayName } from '../../engine/characters';
import {
  allowedKinds, beginSitDown, buildDiploPrompt, canShake, canSitDown, closeSitDown, describeDeal, describeTerm, dialogueOf, districtsFor, HAS_DIR, KIND_LABEL,
  openSitDown, readDeal, shakeOn, SIT_HOURS, sitHeader, sitStep, stanceOf, termBounds, validateDiplo, validateTerm,
  type BossMove, type DealKind, type DiploAi, type Dir, type SitDown, type Term,
} from '../../engine/minds/diplomacy';
import type { Tone } from '../../engine/minds/dialogue';
import type { GameState } from '../../engine/types';
import { FACTION_NAMES } from '../../engine/world';
import { postNow } from '../deeds/NowResult';
import { DialogueWindow } from './DialogueWindow';
import { askJson, sampleOff, sampleWithin } from './sampleClient';

/**
 * THE SIT-DOWN WITH A FAMILY, in the two-way window: the other boss across
 * the table (Claude's lines when the page can ask, the stance's scripted
 * lines otherwise), his warmth and anger, what he wants on the table, a deal
 * builder to put an offer of the boss's own, and the deal on the table as a
 * card: Shake on it (settled now) / Keep talking / Walk out. Everything that
 * changes the game goes through the engine (minds/diplomacy.ts): the model's
 * answer is validated, and the engine decides whether they would shake.
 */
export function FamilyTalk({ s, rival, update, onClose }: { s: GameState; rival: string; update: (f: (s: GameState) => GameState) => void; onClose: () => void }) {
  const [sd, setSd] = useState<SitDown | undefined>(() => openSitDown(s, rival));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | undefined>();
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState<string | undefined>();
  const [hideTable, setHideTable] = useState(false);
  const closed = useRef(false);
  const live = useRef(s);
  live.current = s;
  const ctl = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => ctl.current?.abort(), []);
  if (!sd) return null;
  const st = stanceOf(s, rival);
  const c = s.characters[sd.boss];
  const can = canSitDown(s, rival);
  const live$ = started || can.ok;

  const begin = (): boolean => {
    if (started) return true;
    if (!can.ok) { setNote(can.why); return false; }
    update((x) => beginSitDown(x, rival));
    setStarted(true);
    return true;
  };
  /** A sit-down that ends without a handshake: it lands in Your File once. */
  const finish = (x: SitDown) => {
    if (closed.current || x.round === 0) return;
    closed.current = true;
    if (x.end !== 'deal') {
      update((g) => closeSitDown(g, x));
      setResult(x.end === 'walkout' ? `${c?.firstName ?? 'He'} walked out. No deal.` : x.end === 'left' ? 'You walked out. No deal.' : 'No deal today.');
    }
  };

  async function exchange(move: BossMove) {
    if (!sd || busy || (sd.end && sd.end !== 'done') || !begin()) return;
    if (sd.end === 'done') return;
    setBusy(true);
    setNote(undefined);
    let ai: DiploAi | undefined;
    if (move.tone !== 'walk') {
      const sample = await sampleWithin(1500);
      if (sample && !sampleOff()) {
        ctl.current = new AbortController();
        const r = await askJson(sample, buildDiploPrompt(live.current, sd, move).messages, ctl.current.signal);
        if (r.kind === 'ok') { ai = validateDiplo(live.current, rival, r.data); if (!ai) setNote('He mutters something, then says it plainer.'); }
        else if (r.kind === 'busy') setNote('He takes his time answering.');
        else if (r.kind === 'fail' && r.code !== 'cancelled') setNote('He loses the thread for a moment.');
      }
    }
    const r = sitStep(live.current, sd, move, ai);
    if (r.overridden) setNote(`${c?.firstName ?? 'He'} says one thing, but the numbers say another: the engine has the last word.`);
    setSd(r.sd);
    setHideTable(false);
    setBusy(false);
    if (r.sd.end && r.sd.end !== 'done') finish(r.sd);
  }

  function shake() {
    if (!sd) return;
    const chk = canShake(live.current, sd);
    if (!chk.ok) { setNote(chk.why); return; }
    if (!begin()) return;
    const res = shakeOn(live.current, sd);
    if (!res.ok) { setNote(res.why); return; }
    update((x) => { const r2 = shakeOn(x, sd); return r2.ok ? r2.state : x; });
    closed.current = true;
    const next: SitDown = { ...sd, end: 'deal', deal: sd.table!.terms, log: [...sd.log, { who: 'narrator', text: 'You shake on it.' }] };
    setSd(next);
    setResult(`Shook on it: ${describeDeal(s, rival, sd.table!.terms)}.`);
    postNow({ ok: true, title: `Sit-down with ${FACTION_NAMES[sd.rival]}`, ...(c ? { who: displayName(c) } : {}), tier: 'success', headline: 'Shook on it', line: res.text, changes: res.changes, leadsTo: ['In Your File and under Pacts & Families.'] });
  }

  const d = dialogueOf(sd);
  const table = sd.table;
  const shakeable = table ? canShake(s, sd) : undefined;
  const over = !!sd.end && sd.end !== 'done';
  return (
    <DialogueWindow s={s} d={d} title={`Sit down with ${c ? displayName(c) : FACTION_NAMES[sd.rival]}`} busy={busy}
      note={note ?? (!started && !can.ok ? can.why : sitHeader(s, sd))}
      onTone={live$ && !over ? (t: Tone) => void exchange({ tone: t }) : undefined}
      onSay={live$ && !over ? (t: string) => void exchange({ say: t }) : undefined}
      result={result}
      onClose={() => { if (started && sd.end !== 'deal') finish(sd.end ? sd : { ...sd, end: 'left' }); onClose(); }}
      footer={(
        <div className="space-y-2" data-testid="family-talk">
          {sd.agenda && <div className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100" data-testid="sit-agenda">He asked for this sit-down: <i>"{sd.agenda.text}"</i></div>}
          {table && !hideTable && sd.end !== 'deal' && (
            <div className={`rounded-md border p-2 text-[12px] ${table.ok ? 'border-gold-500/60 bg-gold-500/10' : 'border-noir-600 bg-noir-800/60'}`} data-testid="deal-card">
              <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">On the table · {table.by === 'them' ? 'their offer' : 'your offer'}</div>
              <ul className="mt-0.5 list-disc pl-4 text-stone-100">{table.terms.map((t, i) => <li key={i}>{describeTerm(s, rival, t)}</li>)}</ul>
              <div className="mt-0.5 text-[11px] text-stone-400">{table.ok ? `${c?.firstName ?? 'He'} will shake on this.` : `${c?.firstName ?? 'He'} won't take it as it stands.`}</div>
              {!over && (
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <button type="button" className="btn-gold py-1 text-xs" disabled={busy || !shakeable?.ok} title={shakeable?.ok ? 'Applied now: pacts, money, ground, favors.' : shakeable?.why} onClick={shake} data-testid="deal-shake">Shake on it (settled now)</button>
                  <button type="button" className="btn-ghost py-1 text-xs" disabled={busy || sd.end === 'done'} onClick={() => setHideTable(true)} data-testid="deal-keep">Keep talking</button>
                  <button type="button" className="btn-ghost border-red-400/40 py-1 text-xs" disabled={busy} onClick={() => void exchange({ tone: 'walk' })} data-testid="deal-walk">Walk out</button>
                </div>
              )}
              {shakeable && !shakeable.ok && table.ok && <div className="mt-1 text-[11px] text-amber-300">{shakeable.why}</div>}
            </div>
          )}
          {!over && live$ && sd.end !== 'done' && <DealBuilder s={s} sd={sd} busy={busy} onPropose={(terms) => void exchange({ propose: terms })} />}
          {st && (
            <details className="text-[11px] text-stone-400" data-testid="sit-stance">
              <summary className="cursor-pointer">What moves {c?.firstName ?? 'him'} ({st.bend === 'readily' ? 'bends readily' : st.bend === 'hardly' ? 'hardly bends' : 'bends some'})</summary>
              <div className="mt-1">He came wanting: <span className="text-stone-200">{st.wantText}</span></div>
              <ul className="mt-1 space-y-0.5">{st.reasons.map((x) => <li key={x.label} className="flex justify-between gap-2"><span>{x.label}</span><span className={`tabular-nums ${x.value > 0 ? 'text-red-300' : 'text-emerald-300'}`}>{x.value > 0 ? 'wants more' : 'gives more'}</span></li>)}</ul>
              <div className="mt-1 text-stone-500">About {SIT_HOURS} hours of your day; one sit-down with a family a week. Insults use up his patience fast. Nothing here touches your men.</div>
            </details>
          )}
          {!started && !can.ok && <button type="button" className="btn-ghost w-full py-1 text-xs" onClick={onClose}>Another time</button>}
        </div>
      )} />
  );
}

/** Build an offer: a term at a time (kind, who gives, how much, where, how long), up to three. */
function DealBuilder({ s, sd, busy, onPropose }: { s: GameState; sd: SitDown; busy: boolean; onPropose: (t: Term[]) => void }) {
  const kinds = useMemo(() => allowedKinds(s, sd.rival), [s, sd.rival]);
  const [kind, setKind] = useState<DealKind>(kinds[0] ?? 'truce');
  const [dir, setDir] = useState<Dir>('them');
  const dists = districtsFor(s, sd.rival, kind, dir);
  const [district, setDistrict] = useState<string>('');
  const dd = dists.includes(district) ? district : dists[0];
  const b = termBounds(s, sd.rival, kind, dir, dd);
  const [amount, setAmount] = useState<number | undefined>();
  const [weeks, setWeeks] = useState<number | undefined>();
  const [draft, setDraft] = useState<Term[]>([]);
  useEffect(() => { setAmount(undefined); setWeeks(undefined); }, [kind, dir]);
  if (!kinds.length) return null;
  const term = validateTerm(s, sd.rival, { kind, dir, district: dd, amount: amount ?? b.amount?.def, weeks: weeks ?? b.weeks?.def });
  const read = draft.length ? readDeal(s, sd, draft) : undefined;
  const fam = FACTION_NAMES[sd.rival];
  const dirLabel = (x: Dir) => {
    if (kind === 'cash') return x === 'them' ? `${fam} pays you` : `You pay ${fam}`;
    if (kind === 'concession') return x === 'them' ? `${fam} gives up ground` : 'You give up ground';
    if (kind === 'favor') return x === 'them' ? `${fam} owes you` : `You owe ${fam}`;
    return x === 'them' ? `${fam} stays out` : 'You stay out';
  };
  const field = 'rounded border border-noir-600 bg-noir-900 px-1.5 py-0.5 text-[12px] text-stone-100';
  return (
    <details className="rounded-md border border-noir-700 p-2 text-[12px]" data-testid="deal-builder" open={!sd.table}>
      <summary className="cursor-pointer text-stone-300">Put an offer on the table</summary>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <select className={field} value={kind} onChange={(e) => setKind(e.target.value as DealKind)} aria-label="Kind of term" data-testid="deal-kind">
          {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        {HAS_DIR[kind] && (
          <select className={field} value={dir} onChange={(e) => setDir(e.target.value as Dir)} aria-label="Who gives" data-testid="deal-dir">
            {(['them', 'you'] as Dir[]).map((x) => <option key={x} value={x}>{dirLabel(x)}</option>)}
          </select>
        )}
        {(kind === 'concession' || kind === 'handsoff') && (
          <select className={field} value={dd ?? ''} onChange={(e) => setDistrict(e.target.value)} aria-label="District" data-testid="deal-district">
            {dists.map((x) => <option key={x} value={x}>{s.districts.find((y) => y.id === x)?.name ?? x}</option>)}
          </select>
        )}
        {b.amount && (
          <label className="flex items-center gap-1 text-[11px] text-stone-400">{kind === 'concession' ? 'points' : kind === 'cash' ? '$' : '$/wk'}
            <input type="number" inputMode="numeric" className={`${field} w-20`} min={b.amount.lo} max={b.amount.hi} value={amount ?? b.amount.def}
              onChange={(e) => setAmount(e.target.value === '' ? undefined : Number(e.target.value))} aria-label="Amount" data-testid="deal-amount" />
            <span className="text-stone-500">{b.amount.lo}–{b.amount.hi}</span>
          </label>
        )}
        {b.weeks && (
          <label className="flex items-center gap-1 text-[11px] text-stone-400">weeks
            <input type="number" inputMode="numeric" className={`${field} w-14`} min={b.weeks.lo} max={b.weeks.hi} value={weeks ?? b.weeks.def}
              onChange={(e) => setWeeks(e.target.value === '' ? undefined : Number(e.target.value))} aria-label="Weeks" data-testid="deal-weeks" />
          </label>
        )}
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" disabled={busy || !term || draft.length >= 3}
          onClick={() => { if (term) setDraft((x) => [...x.filter((y) => y.kind !== term.kind), term]); }} data-testid="deal-add">Add</button>
      </div>
      {sd.table && sd.table.by === 'them' && (
        <button type="button" className="mt-1 text-[11px] text-gold-300 underline" onClick={() => setDraft(sd.table!.terms.map((t) => ({ ...t })))} data-testid="deal-from-theirs">Start from their offer</button>
      )}
      {draft.length > 0 && (
        <div className="mt-1.5">
          <ul className="space-y-0.5">{draft.map((t, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-stone-200">
              <span>{describeTerm(s, sd.rival, t)}</span>
              <button type="button" className="text-[11px] text-stone-500 hover:text-red-300" onClick={() => setDraft((x) => x.filter((_, j) => j !== i))} aria-label="Remove term">✕</button>
            </li>
          ))}</ul>
          {read && <div className={`mt-1 text-[11px] ${read.verdict === 'yes' ? 'text-emerald-300' : read.verdict === 'close' ? 'text-amber-300' : 'text-red-300'}`} data-testid="deal-read">{read.text}</div>}
          <button type="button" className="btn-gold mt-1.5 w-full py-1 text-xs" disabled={busy} onClick={() => { onPropose(draft); setDraft([]); }} data-testid="deal-propose">Put it on the table</button>
        </div>
      )}
    </details>
  );
}
