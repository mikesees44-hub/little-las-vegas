import { useEffect, useMemo, useState } from 'react';
import { audienceRequests, gatekeeper, grantAudience, turnAway, type AudienceReq, type Slot } from '../../engine/planner/audience';
import { briefDue, dailyBrief, oldManPick, type Rec } from '../../engine/planner/brief';
import { cancelEntry, moveEntry, planEvening, planWith, type BookEntry } from '../../engine/planner/datebook';
import type { Go } from '../../engine/planner/intel';
import { markBrief, setNote } from '../../engine/planner/state';
import { askAnother, decideGate, gateView, readFullList, setGateRole } from '../../engine/planner/gate';
import { dial, type DialSpec } from '../../engine/phoneMeet';
import { inTheRanks } from '../../engine/rankView';
import { absDay } from '../../engine/timeCost';
import type { NowResult } from '../../engine/deeds/now';
import type { GameState, PlayerAction } from '../../engine/types';
import { Overlay } from '../components/Modal';
import { useOrders } from '../components/Orders';
import { useSheet } from '../components/People';
import { postNow } from '../deeds/NowResult';
import { useEscape } from '../keys';
import { PhoneWindow } from '../phone/PhoneWindow';
import { useShell } from '../shell/context';
import { AudienceList } from './AudienceList';
import { BlackBook } from './BlackBook';
import { BriefFolder } from './BriefFolder';
import { Datebook } from './Datebook';
import type { PlannerTab } from './ink';
import { StandingOrders } from './StandingOrders';

/** What the App opens for the planner (the windows only it holds). */
export interface PlannerAppApi {
  onEvent: (iid: string) => void;
  onUrgent: (tip: string) => void;
  onDay: (day: number) => void;
  onSitDown: (brief?: string) => void;
  onEnvelope: () => void;
}

/**
 * THE DON'S BOOK: one window, five pages (the brief, the audience list, the datebook, the black book, the
 * standing orders), opened from the top bar, the Desk or the Office (`openPlanner`, a window event), and by
 * itself with the brief at the morning's first stop: only when the clock has already stopped (the day's
 * pause budget decides that, never this), once a day, and never over a card.
 */
export function PlannerHost({ s, ui, speed, note, blocked, api }: {
  s: GameState;
  ui: { answers: Record<string, string>; briefSkip: string[]; orders: PlayerAction[] };
  speed: number;
  note?: string;
  /** A card, a scene or another window is up: the brief waits. */
  blocked: boolean;
  api: PlannerAppApi;
}) {
  const [tab, setTab] = useState<PlannerTab | undefined>();
  const [phone, setPhone] = useState<Partial<DialSpec> | undefined>();
  const shell = useShell();
  const sheet = useSheet();
  const orders = useOrders();
  const update = (f: (x: GameState) => GameState) => shell.update?.(f);

  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<{ tab?: PlannerTab }>).detail?.tab ?? 'brief';
      setTab(t);
      if (t === 'brief') update((x) => markBrief(x, absDay(x)));
    };
    window.addEventListener('llv-open-planner', on);
    return () => window.removeEventListener('llv-open-planner', on);
  });
  // The morning's first stop: the clock stopped by itself (a "Paused: …" note), nothing else is up, the brief not yet read today.
  useEffect(() => {
    if (tab || blocked || speed !== 0 || !note?.startsWith('Paused') || !briefDue(s)) return;
    setTab('brief');
    update((x) => markBrief(x, absDay(x)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, blocked, speed, note, s]);
  useEscape(!!tab && !phone, () => setTab(undefined));

  const officeUi = useMemo(() => ({ answers: ui.answers, briefSkip: ui.briefSkip, orders: ui.orders }), [ui.answers, ui.briefSkip, ui.orders]);
  const open = !!tab;
  const reqs = useMemo(() => (open ? audienceRequests(s, officeUi) : []), [open, s, officeUi]);
  const brief = useMemo(() => (tab === 'brief' ? dailyBrief(s, officeUi) : undefined), [tab, s, officeUi]);
  const old = useMemo(() => (tab === 'brief' ? oldManPick(s, officeUi) : undefined), [tab, s, officeUi]);
  const gate = useMemo(() => (tab === 'audience' && !inTheRanks(s) ? gateView(s) : undefined), [tab, s]);
  if (!tab && !phone) return null;

  const close = () => setTab(undefined);
  const land = (r: { state: GameState; result: NowResult }) => { if (r.result.ok) update(() => r.state); postNow(r.result); };
  const go = (g: Go) => {
    if (g.char) { sheet.open(g.char); return; }
    if (g.audience) { setTab('audience'); return; }
    if (g.datebook) { setTab('datebook'); return; }
    if (g.phone) { setPhone(g.phone.who ? { who: g.phone.who } : {}); return; }
    if (g.order) { orders.queue(g.order); return; }
    close();
    if (g.event) api.onEvent(g.event);
    else if (g.tip) api.onUrgent(g.tip);
    else if (g.day !== undefined) api.onDay(g.day);
    else if (g.brief) api.onSitDown(g.brief);
    else if (g.sitdown) api.onSitDown();
    else if (g.office) api.onEnvelope();
    else if (g.file) window.dispatchEvent(new Event('llv-open-file'));
    else if (g.tab) shell.go(g.tab);
  };
  const doRec = (r: Rec) => go(r.go);
  const grant = (r: AudienceReq, at: Slot | 'now') => {
    const out = grantAudience(s, r, at);
    land(out);
    if (out.result.ok && out.open) go(out.open.tip ? { tip: out.open.tip } : out.open.event ? { event: out.open.event } : out.open.day !== undefined ? { day: out.open.day } : out.open.brief ? { brief: out.open.brief } : {});
  };
  const act = (f: (x: GameState) => GameState, what: string) => (shell.act ? shell.act(f, what) : update(f));
  const tabs: { id: PlannerTab; label: string; short: string; n?: number }[] = [
    { id: 'brief', label: inTheRanks(s) ? 'The word' : 'The brief', short: inTheRanks(s) ? 'Word' : 'Brief' },
    ...(inTheRanks(s) ? [] : [{ id: 'audience' as const, label: 'Audience', short: 'Audience', n: reqs.filter((r) => !r.booked).length }]),
    { id: 'datebook', label: 'Datebook', short: 'Datebook' },
    { id: 'book', label: 'People', short: 'People' },
    { id: 'orders', label: 'Standing orders', short: 'Orders' },
  ];

  return (
    <>
      {tab && (
        <Overlay z={1165} className="llv-desk-set overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-label="The datebook" data-testid="planner">
          <div className="mx-auto w-full max-w-[1120px] px-2 pb-8 pt-2 sm:px-4 sm:pt-3">
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              <div className="llv-tabs-book" role="tablist" aria-label="The datebook">
                {tabs.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="llv-tab-book" onClick={() => setTab(t.id)} data-testid={`planner-tab-${t.id}`}>
                    <span className="sm:hidden">{t.short}</span><span className="hidden sm:inline">{t.label}</span>{t.n ? <span className="llv-tab-book-n" aria-label={`${t.n} waiting`}>{t.n}</span> : null}
                  </button>
                ))}
              </div>
              <button type="button" className="shrink-0 rounded border border-[#d6aa6e]/40 px-2.5 py-1 text-[13px] text-[#e9d6b0] hover:border-[#e9d6b0]" onClick={close} aria-label="Close the book" data-testid="planner-close">✕</button>
            </div>
            <div className="pt-0">
              {tab === 'brief' && brief && old && <BriefFolder s={s} b={brief} old={old} onGo={go} onOld={doRec} />}
              {tab === 'audience' && <AudienceList s={s} reqs={reqs} keeper={gatekeeper(s)} gate={gate} onGrant={grant} onTurn={(r) => land(turnAway(s, r))} onChar={(id) => sheet.open(id)}
                gateApi={{
                  onRole: (role, compare) => act((x) => setGateRole(x, role, !!compare), compare ? 'For a month, somebody else keeps your door' : 'Standing order: who keeps your door'),
                  onFull: () => land(readFullList(s)),
                  onAsk: (id) => land(askAnother(s, id)),
                  onDecide: (id, sure) => land(decideGate(s, id, sure)),
                  onChar: (id) => sheet.open(id),
                }} />}
              {tab === 'datebook' && (
                <Datebook s={s} reqs={reqs} api={{
                  onGo: go,
                  onPhone: (p) => setPhone(p),
                  onPlan: (kind, who, sl) => land(planWith(s, kind, who, sl)),
                  onEvening: (d, id) => act((x) => planEvening(x, d, id), 'An evening on the book'),
                  onGrant: (r, sl) => grant(r, sl),
                  onMove: (e: BookEntry, sl) => act((x) => moveEntry(x, e, sl), `Moved: ${e.title}`),
                  onCancel: (e: BookEntry) => act((x) => cancelEntry(x, e), `Called off: ${e.title}`),
                  onNote: (abs, text) => update((x) => setNote(x, abs, text)),
                }} />
              )}
              {tab === 'book' && <BlackBook s={s} onChar={(id) => sheet.open(id)} onPhone={(p) => setPhone(p)} onOrder={(a) => orders.queue(a)} />}
              {tab === 'orders' && <StandingOrders s={s} act={act} onOrder={(a) => orders.queue(a)} onPlace={(k) => { close(); shell.go(k); }} />}
            </div>
          </div>
        </Overlay>
      )}
      {phone && (
        <PhoneWindow s={s} prefill={phone} onClose={() => setPhone(undefined)} onCallBack={() => setPhone(undefined)}
          onDial={(spec) => { const r = dial(s, spec); land(r); setPhone(undefined); }} />
      )}
    </>
  );
}

/** The one entry on the top bar: the Don's book (the brief, the audience, the datebook, the black book, the standing orders). */
export function PlannerButton({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const due = briefDue(s);
  return (
    <button type="button" onClick={onOpen} data-testid="planner-button" title="The datebook (the Don's book): the morning brief, who wants an audience, your days, People (the black book), your standing orders"
      aria-label={`The book${due ? ': today\'s brief is waiting' : ''}`}
      className={`relative h-8 rounded border px-1.5 sm:px-2 text-xs font-semibold whitespace-nowrap hover:border-gold-500 ${due ? 'border-gold-600/70 text-gold-200' : 'border-noir-600 text-stone-300'}`}>
      ▥<span className="hidden sm:inline"> Book</span>
      {due && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blood-500 ring-2 ring-noir-900" data-testid="planner-dot" />}
    </button>
  );
}
