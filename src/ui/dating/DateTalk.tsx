import { useEffect, useRef, useState } from 'react';
import { displayName, player } from '../../engine/characters';
import { affectionWord, bondOf, DATE_INFO, stageOf, type DateKind } from '../../engine/dating';
import { STAGE_LABEL } from '../../engine/datingState';
import {
  canDateTalk, clean, dateAcceptance, datePrompt, dateToneOptions, goalsOf, jobOf, MAX_SAY, nextRung, settleDateTalk, settleNextRung, startDateTalk, stepDate, validateDate,
  type DateAi, type DateStep, type DateTalk, type DateTone,
} from '../../engine/dateTalk';
import type { NowResult } from '../../engine/deeds/now';
import type { GameState } from '../../engine/types';
import { ageOn } from '../../engine/calendar';
import { Overlay } from '../components/Modal';
import { Face } from '../components/People';
import { useEscape, useNumberKeys } from '../keys';
import { askJson, sampleOff, sampleWithin } from '../minds/sampleClient';
import { useShell } from '../shell/context';

/**
 * ON THE DATE (engine/dateTalk.ts): the evening as a conversation in a compact
 * two-way card. Her meters (chemistry, annoyance), the setting, who she is, the
 * transcript; his tones with a hint each (number keys 1-8) or his own words.
 * Claude voices her when the page can ask; her scripted lines otherwise. At the
 * end the engine settles the evening's order with her odds plus the
 * conversation's reason, and shows it; a good night may offer the next rung.
 */

const STEP_TITLE: Record<DateStep, string> = { talk: 'Talk with', invite: 'On the date with', askOut: 'Off the clock with', paid: 'An evening with', after: 'Later that night with' };

export function DateTalkWindow({ s, id, step, date, onClose }: { s: GameState; id: string; step: DateStep; date?: DateKind; onClose: () => void }) {
  const shell = useShell();
  const update = shell.update;
  const c = s.characters[id];
  const [dt, setDt] = useState<DateTalk>(() => startDateTalk(s, id, step, date));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | undefined>();
  const [say, setSay] = useState('');
  const [result, setResult] = useState<NowResult | undefined>();
  const [next, setNext] = useState<NowResult | undefined>();
  const live = useRef(s);
  live.current = s;
  const settled = useRef(false);
  const ctl = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => ctl.current?.abort(), []);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [dt.log.length]);
  const tones = dateToneOptions(s, dt);
  useNumberKeys(!busy && !dt.end, tones.length, (i) => { const t = tones[i]; if (t) void exchange(t.tone, ''); });
  // Esc is "End the night" / Close, like the button (fast7 dialog keys).
  const closeRef = useRef<() => void>();
  useEscape(!busy, () => closeRef.current?.());
  const can = canDateTalk(s, id, step, date);

  const finish = (d: DateTalk) => {
    if (settled.current) return;
    settled.current = true;
    const r = settleDateTalk(live.current, d);
    if (r.result.ok && update) update(() => r.state);
    setResult(r.result);
  };

  async function exchange(tone: DateTone | undefined, text0: string) {
    if (busy || dt.end || (!can.ok && dt.round === 0)) return;
    const text = clean(text0, MAX_SAY);
    setBusy(true);
    setNote(undefined);
    let ai: DateAi | undefined;
    if (tone !== 'home') {
      const sample = await sampleWithin(text ? 1500 : 800);
      if (sample && !sampleOff()) {
        ctl.current = new AbortController();
        const r = await askJson(sample, datePrompt(live.current, dt, text, tone ?? 'charm'), ctl.current.signal);
        if (r.kind === 'ok') { const v = validateDate(r.data, live.current, dt); if (v.ok) ai = v.out; else setNote(`${c?.firstName ?? 'She'} pauses, then says it plainer.`); }
        else if (r.kind === 'busy') setNote(`${c?.firstName ?? 'She'} takes a sip and thinks.`);
      }
    }
    const r = stepDate(live.current, dt, { ...(tone ? { tone } : {}), ...(text ? { say: text } : {}), ...(ai ? { ai } : {}) });
    setDt(r.dt);
    setBusy(false);
    if (r.dt.end) finish(r.dt);
  }

  const close = () => {
    if (!settled.current && dt.round > 0 && !dt.end) {
      const r = stepDate(live.current, dt, { tone: 'home' });
      finish(r.dt);
    }
    onClose();
  };
  closeRef.current = close;

  if (!c) return null;
  const boss = player(s);
  const b = bondOf(s, id);
  const acc = !result ? dateAcceptance(s, dt) : undefined;
  const conv = acc?.reasons.find((x) => x.label.startsWith('The conversation'));
  const rung = result?.ok && !next && dt.end !== 'walkout' ? nextRung(s, dt) : undefined;
  const where = step === 'invite' ? DATE_INFO[date ?? 'dinner'].label : step === 'talk' ? 'A talk' : step === 'askOut' ? 'Dinner, off the clock' : step === 'paid' ? 'Her company' : 'The boardwalk';
  const goals = goalsOf(s, c);
  return (
    <Overlay z={1180} className="flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${STEP_TITLE[step]} ${c.firstName}`} onClick={close}>
      <div className="panel w-full max-h-[94vh] overflow-y-auto rounded-b-none border-rose-700/50 sm:max-w-lg sm:rounded-lg" onClick={(e) => e.stopPropagation()} data-testid="date-window" data-step={step}>
        <div className="flex items-center justify-between gap-2 border-b border-noir-700 px-3 py-2">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg text-rose-200">{STEP_TITLE[step]} {displayName(c)}</h3>
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{where}</div>
          </div>
          <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={close} data-testid="date-close">{dt.end || dt.round === 0 ? 'Close' : 'End the night'}</button>
        </div>
        <div className="px-3 pt-2 text-[11px] text-stone-400" data-testid="date-persona">
          {ageOn(c.birth, s.date)} · {jobOf(s, c)} · {STAGE_LABEL[stageOf(s, id)]} · her feelings: {affectionWord(b?.aff ?? 10)}
          {goals.length > 0 && <> · <span className="text-stone-300">{goals.join('; ')}</span></>}
          {b?.notes?.length ? <div className="mt-0.5 italic text-stone-500" data-testid="date-memory">Last time: {b.notes[b.notes.length - 1].t}</div> : null}
        </div>
        <div className="flex items-start justify-between gap-2 px-3 pt-2">
          <div className="flex flex-col items-center text-[11px] text-stone-400"><Face s={s} c={boss} size={52} /><span className="mt-0.5">You</span></div>
          <div className="min-w-0 flex-1 space-y-1 pt-1" data-testid="date-meters">
            <Meter label="Chemistry" v={dt.chem} tone="bg-rose-400/80" />
            <Meter label="Annoyed" v={dt.annoy} tone="bg-red-500/80" />
            <div className="text-center text-[10px] text-stone-500">Exchange {Math.min(dt.round, dt.max)}/{dt.max}</div>
          </div>
          <div className="flex flex-col items-center text-[11px] text-stone-400"><span style={{ transform: 'scaleX(-1)' }}><Face s={s} c={c} size={52} /></span><span className="mt-0.5 max-w-[6rem] truncate">{c.firstName}</span></div>
        </div>
        <div className="mt-2 max-h-[32vh] space-y-1.5 overflow-y-auto px-3 text-[13px]" aria-live="polite" data-testid="date-log">
          {dt.log.map((l, i) => l.who === 'narrator'
            ? <div key={i} className="text-center text-[11px] italic text-stone-500">{l.text}</div>
            : (
              <div key={i} className={l.who === 'boss' ? 'text-left' : 'text-right'}>
                <span className={`inline-block max-w-[85%] rounded-lg px-2.5 py-1 ${l.who === 'boss' ? 'rounded-bl-none bg-noir-700 text-stone-200' : 'rounded-br-none border border-rose-900/60 bg-noir-800 text-stone-100'}`}>{l.text}</span>
              </div>
            ))}
          {busy && <div className="text-right text-[11px] italic text-stone-500">{c.firstName} thinks about it...</div>}
          <div ref={end} />
        </div>
        {note && <div className="px-3 pt-1 text-[11px] text-amber-300">{note}</div>}
        {!can.ok && dt.round === 0 && !result && <div className="px-3 pt-1 text-[11px] text-red-400" data-testid="date-blocked">Unavailable: {can.why}</div>}
        {acc && can.ok && (
          <div className="px-3 pt-1 text-[11px] text-stone-400" data-testid="date-odds">
            {step === 'after' ? 'How the night is going: ' : 'Her answer if the night ended now: '}
            {step !== 'after' && <b className={acc.chance >= 0.6 ? 'text-emerald-300' : acc.chance >= 0.35 ? 'text-amber-300' : 'text-red-300'}>{Math.round(acc.chance * 100)}%</b>}
            {conv && <span className={conv.value >= 0 ? 'text-emerald-400' : 'text-red-400'}> · {conv.value >= 0 ? '+' : '−'}{Math.abs(conv.value)} {conv.label}</span>}
            <span className="text-stone-500"> · She decides.</span>
          </div>
        )}
        {result && <DateResult r={result} testid="date-result" />}
        {next && <DateResult r={next} testid="date-next-result" />}
        {rung && update && (
          <div className="px-3 pt-2">
            <button type="button" className="btn-gold w-full px-2 py-1 text-xs" data-testid="date-next"
              onClick={() => { const r = settleNextRung(live.current, dt); if (r) { update(() => r.state); setNext(r.result); } }}>
              {rung.title} ({Math.round(rung.acceptance.chance * 100)}%, with the evening in her odds)
            </button>
          </div>
        )}
        {!dt.end && !result && (
          <div className="px-3 pt-2">
            <div className="grid grid-cols-2 gap-1.5" data-testid="date-tones">
              {tones.map((t, i) => (
                <button key={t.tone} type="button" disabled={busy || (!can.ok && dt.round === 0)} onClick={() => void exchange(t.tone, '')} title={t.hint} data-testid={`date-tone-${t.tone}`}
                  className={`rounded-md border px-2 py-1 text-left ${t.tone === 'home' ? 'border-gold-600/50' : 'border-noir-600'} bg-noir-800/70 hover:border-rose-400 disabled:opacity-50`}>
                  <div className="text-[12px] font-semibold text-stone-100"><kbd className="mr-1 rounded border border-noir-500 px-1 text-[10px] font-normal text-stone-400">{i + 1}</kbd>{t.label}</div>
                  <div className="text-[10px] text-stone-500">{t.hint}</div>
                </button>
              ))}
            </div>
            <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); const t = say.trim(); if (t) { void exchange(undefined, t); setSay(''); } }}>
              <input className="min-w-0 flex-1 rounded border border-noir-600 bg-noir-900 px-2 py-1 text-[13px] text-stone-100" value={say} maxLength={MAX_SAY} disabled={busy || (!can.ok && dt.round === 0)}
                onChange={(e) => setSay(e.target.value)} placeholder="Or say it in your own words..." aria-label="Your own words" data-testid="date-say" />
              <button type="submit" className="btn-gold px-2 py-1 text-xs" disabled={busy || !say.trim()}>Say it</button>
            </form>
            <p className="mt-1 text-[10px] text-stone-500">She is her own woman: pushing, pressure or a debt held over her ends the evening. Nothing explicit; she decides.</p>
          </div>
        )}
        <div className="px-3 pb-3 pt-2" />
      </div>
    </Overlay>
  );
}

function DateResult({ r, testid }: { r: NowResult; testid: string }) {
  return (
    <div className={`mx-3 mt-2 rounded border px-2 py-1.5 text-[12px] ${r.ok ? 'border-rose-600/50 bg-rose-500/10 text-stone-100' : 'border-red-700/50 text-red-300'}`} data-testid={testid}>
      <div className="font-semibold text-rose-200">{r.ok ? r.headline : r.error}</div>
      {r.line && <div className="mt-0.5">{r.line}</div>}
      {r.changes.length > 0 && <div className="mt-0.5 text-[11px] text-stone-400">{r.changes.join(' · ')}</div>}
      {r.leadsTo.length > 0 && <div className="mt-0.5 text-[11px] text-amber-200/90">{r.leadsTo.join(' ')}</div>}
      {r.remember && <div className="mt-0.5 text-[11px] italic text-stone-500">She will remember: {r.remember}</div>}
    </div>
  );
}

function Meter({ label, v, tone }: { label: string; v: number; tone: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-stone-400" title={`${label} ${v}/100`}>
      <span className="w-14 shrink-0 text-right">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded bg-noir-700"><span className={`block h-full ${tone}`} style={{ width: `${v}%` }} /></span>
      <span className="w-6 tabular-nums">{v}</span>
    </div>
  );
}

const BUTTON_TEXT: Record<DateStep, string> = { talk: 'Talk with her', invite: 'Talk on the date', askOut: 'Spend the evening talking', paid: 'Talk through the evening', after: 'Spend the evening talking' };

/** "Talk on the date ▸": opens the evening as a conversation (hidden when it can't be had: adults only, mature content for a paid evening). */
export function DateTalkButton({ s, id, step, date, label }: { s: GameState; id: string; step: DateStep; date?: DateKind; label?: string }) {
  const [open, setOpen] = useState(false);
  const can = canDateTalk(s, id, step, date);
  const c = s.characters[id];
  if (!c || (!can.ok && !open)) return null;
  return (
    <>
      <button type="button" className="btn-ghost mt-1 w-full px-2 py-1 text-left text-[11px] text-rose-200" onClick={() => setOpen(true)} data-testid="date-talk-open" data-step={step}>
        ♥ {label ?? BUTTON_TEXT[step]} ▸ <span className="text-stone-500">{step === 'invite' ? DATE_INFO[date ?? 'dinner'].label.toLowerCase() : step === 'talk' ? 'a few minutes' : step === 'paid' ? 'talk only, her terms' : 'tonight'}; how it goes counts toward her answer</span>
      </button>
      {open && <DateTalkWindow s={s} id={id} step={step} date={date} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* A host, for the date order's result card (posted from anywhere)      */
/* ------------------------------------------------------------------ */

type Req = { id: string; step: DateStep; date?: DateKind };
let hosts = 0;
const subs = new Set<(r: Req | undefined) => void>();

/** Is a host mounted (the result card shows its button only then). */
export function dateHostReady(): boolean {
  return hosts > 0;
}

export function openDateTalk(r: Req): void {
  for (const f of subs) f(r);
}

export function DateTalkHost({ s }: { s: GameState }) {
  const [r, setR] = useState<Req | undefined>();
  useEffect(() => { hosts++; const f = (x: Req | undefined) => setR(x); subs.add(f); return () => { hosts--; subs.delete(f); }; }, []);
  if (!r) return null;
  return <DateTalkWindow s={s} id={r.id} step={r.step} date={r.date} onClose={() => setR(undefined)} />;
}

/** On the date order's result card: after a yes, the rest of the evening as a talk (the window says why not, if it can't be had). */
export function DateAfterButton({ id, onOpen }: { id: string; onOpen?: () => void }) {
  if (!dateHostReady()) return null;
  return (
    <button type="button" className="btn-ghost mt-2 w-full px-2 py-1 text-[12px] text-rose-200" data-testid="date-after-open" onClick={() => { onOpen?.(); openDateTalk({ id, step: 'after' }); }}>
      ♥ Spend the evening talking ▸
    </button>
  );
}
