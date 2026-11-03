import { LoggedCard } from '../book/TheBook';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ANSWER_INFO, APPROACH_LABEL, approachText, BEAT_INFO, COVER_INFO, DEST_INFO, KIND_INFO,
  askingPrice, asksQuestion, beatFor, eveningCost, eveningKindOf, stayOdds,
  type Answer, type Approach, type Cover, type Dest, type EveningKind, type EveningPlan,
} from '../../engine/evening';
import {
  AFTER_INFO, BOLD_AMOUNTS, askAgainOdds, boldAfters, boldReply, boldScene, bouncerLine, pocketOf, yourClub,
  type BoldAfter,
} from '../../engine/quickies';
import { adultOn } from '../../engine/datingState';
import type { GameState, PlayerAction } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { Modal } from '../components/Modal';
import { fmt$ } from '../format';
import { logDialogue, startDialogue, type Dialogue, type Tone } from '../../engine/minds/dialogue';
import { useShell } from '../shell/context';
import { boldTurn, nightOrder, startBold, startHaggle, haggleTurn } from '../../engine/minds/nightDialogue';
import { DialogueWindow, type BeatOption } from '../minds/DialogueWindow';

/**
 * THE EVENING, as a short choice flow (engine/evening.ts, quickies.ts):
 * each step is a card with its options and what they do; the last step is
 * the ordinary order card (cost, who pays, her odds and why, the risks).
 * Nothing happens until the order is given, and she still decides.
 */

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-noir-700 bg-noir-900/60 p-2.5" data-testid={`flow-step-${n}`}>
      <div className="text-[10px] uppercase tracking-[0.3em] text-gold-500/80">Step {n} · {title}</div>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </section>
  );
}

function Choice({ on, title, text, onPick, testid, disabled }: { on: boolean; title: string; text?: string; onPick: () => void; testid?: string; disabled?: string }) {
  return (
    <button type="button" onClick={onPick} disabled={!!disabled} data-testid={testid} aria-pressed={on}
      className={`w-full rounded-md border px-2.5 py-1.5 text-left ${on ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/60 hover:border-gold-500'} ${disabled ? 'opacity-50' : ''}`}>
      <div className={`text-[13px] font-semibold ${on ? 'text-gold-200' : 'text-stone-100'}`}>{title}</div>
      {(text || disabled) && <div className="text-[11px] text-stone-400">{disabled ?? text}</div>}
    </button>
  );
}

/** Her price and the haggle (professionals), in the two-way window (minds/nightDialogue.ts over evening.ts `haggle`). */
function Haggle({ s, id, kind, onDeal }: { s: GameState; id: string; kind: EveningKind | 'car'; onDeal: (price: number | undefined, tip?: number) => void }) {
  const first = s.characters[id]?.firstName ?? 'She';
  const { update } = useShell();
  const ask0 = askingPrice(s, id, kind);
  const [d, setD] = useState<Dialogue>(() => startHaggle(s, id, kind));
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState<number | undefined>();
  const onTone = (tone: Tone, offer?: number) => {
    const r = haggleTurn(s, d, kind, tone, offer);
    const t = r.tip ?? tip;
    if (r.tip) setTip(r.tip);
    setD(r.d);
    if (r.d.end) update?.((x) => logDialogue(x, r.d, `${first}'s price`));
    if (r.d.end === 'deal') onDeal(r.d.deal, t);
    else if (r.d.end) onDeal(undefined);
  };
  return (
    <div data-testid="haggle">
      <div className="text-[13px] text-stone-100">{first} names her price: <b className="text-amber-300" data-testid="haggle-price">{fmt$(d.stake?.pos ?? ask0.price)}</b> <span className="text-[11px] text-stone-500">({ask0.why.join(', ') || 'her usual'})</span></div>
      {!d.end && <button type="button" className="btn-gold mt-1.5 text-xs py-1" onClick={() => setOpen(true)} data-testid="haggle-open">Talk price with her, face to face</button>}
      {d.end === 'deal' && <div className="mt-1 text-[12px] text-emerald-300" data-testid="haggle-deal">Agreed: {fmt$(d.deal ?? 0)}{tip ? ` and a ${fmt$(tip)} tip` : ''}.</div>}
      {d.end && d.end !== 'deal' && <div className="mt-1 text-[12px] text-red-300">No deal. Nothing paid.</div>}
      {open && <DialogueWindow s={s} d={d} title={`${first}'s price`} onTone={onTone} offerLabel="Your counter" onClose={() => setOpen(false)}
        result={d.end === 'deal' ? `Done: ${fmt$(d.deal ?? 0)}. Close the window and give the order.` : d.end ? 'She won\'t deal tonight.' : undefined} />}
    </div>
  );
}

/** The evening's moment (the beat, "do you want me or just my body?") played face to face. */
function MomentWindow({ s, id, plan, onPick, onAnswer, onClose }: { s: GameState; id: string; plan: EveningPlan; onPick: (p: string) => void; onAnswer: (a: Answer) => void; onClose: () => void }) {
  const beat = plan.beat;
  const [d, setD] = useState<Dialogue>(() => {
    const d0 = startDialogue(s, id, 'romance', undefined, 3);
    if (beat) d0.log.push({ who: 'narrator', text: `${BEAT_INFO[beat].title}. ${BEAT_INFO[beat].text}` });
    else if (plan.answer) d0.log.push({ who: 'them', text: 'But do you want me, or just my body?' });
    return d0;
  });
  const say = (who: 'boss' | 'them' | 'narrator', text: string, tone?: Tone) => setD((x) => ({ ...x, round: x.round + (who === 'boss' ? 1 : 0), log: [...x.log, { who, text, ...(tone ? { tone } : {}) }] }));
  const [stage, setStage] = useState<'beat' | 'question' | 'done'>(beat ? 'beat' : plan.answer ? 'question' : 'done');
  const options: BeatOption[] = stage === 'beat' && beat
    ? BEAT_INFO[beat].picks.map((pk) => ({ key: pk.id, label: pk.label, hint: pk.text, onPick: () => { onPick(pk.id); say('boss', pk.label); setStage(plan.answer ? 'question' : 'done'); if (plan.answer) say('them', 'But do you want me, or just my body?'); } }))
    : stage === 'question'
      ? (Object.keys(ANSWER_INFO) as Answer[]).map((a) => ({ key: a, label: ANSWER_INFO[a].label, hint: ANSWER_INFO[a].text, onPick: () => { onAnswer(a); say('boss', ANSWER_INFO[a].label); setStage('done'); } }))
      : [];
  return <DialogueWindow s={s} d={stage === 'done' ? { ...d, end: 'done' } : d} title="Tonight" options={options} onClose={onClose}
    result={stage === 'done' ? 'Your answers are set. She still decides when you give the order.' : undefined} />;
}

export function EveningFlow({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  const c = s.characters[id];
  const who = eveningKindOf(s, id);
  const paid = who === 'paid';
  const [kind, setKind] = useState<EveningKind>(paid ? 'release' : 'town');
  const [at, setAt] = useState<'office' | 'hotel'>('hotel');
  const [dest, setDest] = useState<Dest>('capemay');
  const [cover, setCover] = useState<Cover>('business');
  const [approach, setApproach] = useState<Approach>(paid ? 'night' : 'something');
  const [price, setPrice] = useState<number | undefined>();
  const [tip, setTip] = useState<number | undefined>();
  const [walked, setWalked] = useState(false);
  const [pick, setPick] = useState<string | undefined>();
  const [answer, setAnswer] = useState<Answer | undefined>();
  const [stay, setStay] = useState(false);
  const [haggleKey, setHaggleKey] = useState(0);
  const [moment, setMoment] = useState(false);
  const plan: EveningPlan = useMemo(() => {
    const p: EveningPlan = { id, kind, approach, stay, price: paid ? price : undefined, tip };
    if (kind === 'release') p.at = at;
    if (kind === 'getaway') { p.dest = dest; p.cover = cover; }
    const beat = beatFor(s, p);
    if (beat) { p.beat = beat; p.pick = pick ?? BEAT_INFO[beat].picks[BEAT_INFO[beat].picks.length - 1].id; }
    if (asksQuestion(s, p)) p.answer = answer ?? 'dunno';
    return p;
  }, [id, kind, approach, stay, paid, price, tip, at, dest, cover, pick, answer, s]);
  if (!c || !who) return null;
  const beat = plan.beat;
  const stayP = stayOdds(s, c, plan);
  const cost = eveningCost(s, plan);
  const action: PlayerAction = { kind: 'nightlife', op: { op: 'invite', plan } };
  const resetPrice = () => { setPrice(undefined); setTip(undefined); setWalked(false); setHaggleKey((k) => k + 1); };
  return (
    <Modal onClose={onClose} wide>
      <div className="p-3 pb-24 sm:p-4 space-y-2.5" data-testid="evening-flow">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">An evening with</div>
            <h3 className="font-display text-xl text-gold-300">{c.firstName} {c.lastName}</h3>
          </div>
          <button type="button" className="btn-ghost text-xs px-2 py-0.5" onClick={onClose} data-testid="flow-close">Close</button>
        </div>
        <p className="text-[11px] text-stone-500">Adults only. She decides at every step; nothing is paid if she says no. Reports are one line, and they fade.</p>

        <Step n={1} title="What kind of evening">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(KIND_INFO) as EveningKind[]).map((k) => <Choice key={k} on={kind === k} title={KIND_INFO[k].label} text={KIND_INFO[k].text} onPick={() => { setKind(k); resetPrice(); }} testid={`flow-kind-${k}`} />)}
          </div>
          {kind === 'release' && <div className="flex flex-wrap gap-1.5">{(['hotel', 'office'] as const).map((x) => <button key={x} type="button" onClick={() => setAt(x)} aria-pressed={at === x} className={`rounded-full px-2 py-0.5 text-[11px] ${at === x ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300'}`}>{x === 'hotel' ? 'A room at the Royal Palm ($35)' : 'Your office, after hours'}</button>)}</div>}
          {kind === 'getaway' && (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1.5">{(Object.keys(DEST_INFO) as Dest[]).map((x) => <button key={x} type="button" onClick={() => setDest(x)} aria-pressed={dest === x} className={`rounded-full px-2 py-0.5 text-[11px] ${dest === x ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300'}`}>{DEST_INFO[x].label} ({fmt$(DEST_INFO[x].cost)})</button>)}</div>
              <div className="text-[11px] text-stone-400">What you tell your wife:</div>
              <div className="flex flex-wrap gap-1.5">{(Object.keys(COVER_INFO) as Cover[]).map((x) => <button key={x} type="button" onClick={() => setCover(x)} aria-pressed={cover === x} className={`rounded-full px-2 py-0.5 text-[11px] ${cover === x ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300'}`}>{COVER_INFO[x].label} ({Math.round(COVER_INFO[x].unravel * 100)}% it unravels)</button>)}</div>
            </div>
          )}
          <div className="text-[11px] text-stone-400 pt-1">How you play it:</div>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {(Object.keys(APPROACH_LABEL) as Approach[]).map((a) => <Choice key={a} on={approach === a} title={APPROACH_LABEL[a]} text={approachText(s, id, a)} onPick={() => setApproach(a)} testid={`flow-approach-${a}`} />)}
          </div>
        </Step>

        {paid && (
          <Step n={2} title="Her price">
            {walked ? <p className="text-[12px] text-stone-400">You walked away. <button type="button" className="text-gold-400 underline" onClick={resetPrice}>Start over</button></p>
              : <Haggle key={`${kind}:${haggleKey}`} s={s} id={id} kind={kind} onDeal={(p, t) => { if (p === undefined) setWalked(true); else { setPrice(p); setTip(t); } }} />}
          </Step>
        )}

        <Step n={paid ? 3 : 2} title="Tonight">
          {(beat || plan.answer) && <button type="button" className="btn-ghost text-xs py-1" onClick={() => setMoment(true)} data-testid="flow-moment">Play the moment face to face</button>}
          {moment && <MomentWindow s={s} id={id} plan={plan} onPick={setPick} onAnswer={setAnswer} onClose={() => setMoment(false)} />}
          {beat && (
            <div data-testid="flow-beat">
              <div className="text-[13px] font-semibold text-stone-100">{BEAT_INFO[beat].title}</div>
              <div className="text-[12px] text-stone-400">{BEAT_INFO[beat].text}</div>
              <div className="mt-1 grid gap-1.5 sm:grid-cols-3">{BEAT_INFO[beat].picks.map((pk) => <Choice key={pk.id} on={plan.pick === pk.id} title={pk.label} text={pk.text} onPick={() => setPick(pk.id)} testid={`flow-beat-${pk.id}`} />)}</div>
            </div>
          )}
          {plan.answer && (
            <div data-testid="flow-question">
              <div className="text-[13px] text-stone-100 italic">"But do you want me, or just my body?"</div>
              <div className="mt-1 grid gap-1.5 sm:grid-cols-2">{(Object.keys(ANSWER_INFO) as Answer[]).map((a) => <Choice key={a} on={plan.answer === a} title={ANSWER_INFO[a].label} text={ANSWER_INFO[a].text} onPick={() => setAnswer(a)} testid={`flow-answer-${a}`} />)}</div>
            </div>
          )}
          {adultOn(s) ? (
            <label className="flex items-center gap-2 text-[12px] text-stone-200" data-testid="flow-stay">
              <input type="checkbox" checked={stay} onChange={(e) => setStay(e.target.checked)} />
              Ask her to stay the night <span className="text-stone-500">(she decides: about {Math.round(stayP * 100)}%; the report fades to morning)</span>
            </label>
          ) : <p className="text-[11px] text-stone-500">Mature content is Off: the evening ends at her door.</p>}
        </Step>

        <Step n={paid ? 4 : 3} title="Your order">
          <div className="text-[11px] text-stone-400">{cost.lines.join(' · ') || 'No cost'} · total {fmt$(cost.total)} from your pocket</div>
          <ActionCard s={s} action={action} />
        </Step>
      </div>
    </Modal>
  );
}

export function CarFlow({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  const c = s.characters[id];
  const paid = eveningKindOf(s, id) === 'paid';
  const [price, setPrice] = useState<number | undefined>();
  const [walked, setWalked] = useState(false);
  if (!c) return null;
  return (
    <Modal onClose={onClose}>
      <div className="p-3 pb-24 sm:p-4 space-y-2.5" data-testid="car-flow">
        <div className="flex items-center justify-between"><h3 className="font-display text-lg text-gold-300">"Step outside to my car"</h3><button type="button" className="btn-ghost text-xs px-2 py-0.5" onClick={onClose}>Close</button></div>
        {paid && (walked ? <p className="text-[12px] text-stone-400">No deal.</p> : <Haggle s={s} id={id} kind="car" onDeal={(p) => (p === undefined ? setWalked(true) : setPrice(p))} />)}
        {(!paid || price !== undefined) && <ActionCard s={s} action={{ kind: 'nightlife', op: { op: 'car', id, price } }} />}
      </div>
    </Modal>
  );
}

export function BoldFlow({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  const c = s.characters[id];
  const pocket = pocketOf(s);
  const [d, setD] = useState<Dialogue>(() => startBold(s, id));
  const [after, setAfter] = useState<BoldAfter | undefined>();
  const [custom, setCustom] = useState('');
  if (!c) return null;
  const last = d.stake?.off;
  const raises = Math.max(0, d.log.filter((l) => l.tone === 'raise').length - 1);
  const reply = last ? boldReply(s, id, last, raises) : undefined;
  const over = !!reply && (reply.result === 'yes' || reply.result === 'out' || reply.result === 'line');
  const afters = last ? boldAfters(s, id, last, raises) : [];
  const scene = last ? boldScene(s, id, last, raises) : 'none';
  const offer = (n: number) => { setD((x) => boldTurn(s, x, n).d); setAfter(undefined); };
  const next = BOLD_AMOUNTS.filter((n) => n > (last ?? 0) && n <= pocket);
  const options: BeatOption[] = !over && !d.end
    ? [...next.slice(0, 4).map((n) => ({ key: `o${n}`, label: last ? `Raise the offer: ${fmt$(n)}` : `Lean over: ${fmt$(n)}`, hint: 'money only ever offers; she decides', onPick: () => offer(n) })),
      ...(last ? [{ key: 'back', label: 'Back off', hint: 'leave it there', onPick: () => setD((x) => ({ ...x, end: 'left' as const, log: [...x.log, { who: 'boss' as const, text: 'Forget it.' }] })) }] : [])]
    : afters.map((a) => ({ key: a, label: AFTER_INFO[a].label, hint: a === 'askAgain' ? `${AFTER_INFO[a].text} (about ${Math.round(askAgainOdds(s, id, last!) * 100)}%)` : AFTER_INFO[a].text, onPick: () => setAfter(a) }));
  const ended = over || !!d.end;
  const order = last ? nightOrder('bold', id, d, after ?? afters[0]) : undefined;
  return (
    <DialogueWindow s={s} d={ended && !d.end ? { ...d, end: 'done' } : d} title={`A bold offer to ${c.firstName}`} onClose={onClose}
      options={options} note={`Money only ever offers. Your pocket (${fmt$(pocket)}) pays only if she takes it. Every no in public puts more eyes on you.`}
      result={after ? `Then: ${AFTER_INFO[after].label}` : undefined}
      footer={(
        <div className="space-y-1.5" data-testid="bold-flow">
          {!ended && (
            <div className="flex gap-1.5">
              <input value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Your figure" className="w-24 rounded border border-noir-600 bg-noir-800 px-2 py-1 text-xs text-stone-200" aria-label="Your figure" />
              <button type="button" className="btn-ghost py-1 text-xs" disabled={!custom || +custom <= (last ?? 99) || +custom > pocket} onClick={() => { offer(+custom); setCustom(''); }}>Offer it</button>
            </div>
          )}
          {ended && scene !== 'none' && scene !== 'bouncer' && yourClub(s, id) && <div className="text-[12px] text-stone-300">{bouncerLine(s, id)}</div>}
          {ended && afters.length > 0 && (
            <div className="grid gap-1">{afters.map((a) => <Choice key={a} on={(after ?? afters[0]) === a} title={AFTER_INFO[a].label} text={AFTER_INFO[a].text} onPick={() => setAfter(a)} testid={`bold-after-${a}`} />)}</div>
          )}
          {order && <ActionCard s={s} action={order} />}
          {order && last !== undefined && <LoggedCard s={s} person={id} action={order} title={`A bold offer to ${c.firstName}: ${fmt$(last)}${raises ? ` (raised ${raises}×)` : ''}`} lines={[after ? `Then: ${AFTER_INFO[after].label}` : ''].filter(Boolean)} />}
        </div>
      )} />
  );
}
