import { useEffect, useState } from 'react';
import { OceanCityPanel } from '../econ/OceanCity';
import { standing } from '../../engine/cities';
import { displayName } from '../../engine/characters';
import { DAY_NAMES } from '../../engine/days';
import { actingBoss } from '../../engine/travel';
import { currentVisit, nowDay, type CityVerb, type Visit } from '../../engine/travelState';
import {
  absLabel, bookableDays, bookBlock, bookedCost, bookVisit, comeHome, comeHomePlan, contactOf, nextSlot, stayOn, unbookVisit, verbPreview, visitPhase, visitRisks,
} from '../../engine/visit';
import { KIND_LABEL, sceneOf, type CityPlace } from '../../engine/visitData';
import { whereAway } from '../../engine/visitAway';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { Modal } from '../components/Modal';
import { CharLink } from '../components/People';
import { NycMapView } from '../nyc/NycPanel';
import { Card, CardHead, PlaceBanner, Section, StatChip, SubTabs } from '../components/Layout';
import { tripArt } from '../hood/art/sceneArt';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const VERB_LABEL: Record<CityVerb, string> = {
  sitdown: 'Sit down', deal: 'Deal', launder: 'Wash money', shop: 'Shop', recruit: 'Recruit', hideout: 'Lie low', night: 'Night on the town',
};

function slotLabel(s: GameState, day: number, slot: 'day' | 'night'): string {
  return `${absLabel(s, day)} ${slot === 'day' ? 'afternoon' : 'night'}`;
}

function PlaceCard({ s, v, place, from, update, hl }: { s: GameState; v: Visit; place: CityPlace; from?: number; update: (f: (s: GameState) => GameState, what?: string) => void; hl?: boolean }) {
  const who = contactOf(s, place);
  return (
    <li id={`city-place-${place.id}`} className={`llv-card-box llv-dom-edge llv-dom-tint space-y-1 !p-2.5 ${hl ? 'llv-card-attention' : 'llv-card-plain'}`} data-testid={`city-place-${place.id}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-[14px] font-bold text-stone-100">{place.name}</span>
        <span className="llv-kicker llv-dom-ink">{KIND_LABEL[place.kind]}</span>
      </div>
      {who && <div className="text-[11px] text-stone-200">{who}{place.role ? <span className="text-stone-500"> · {place.role}</span> : null}</div>}
      <p className="text-[11px] text-stone-400">{place.text}</p>
      <div className="flex flex-wrap gap-1.5">
        {place.verbs.map((verb) => {
          const p = verbPreview(s, v, place, verb);
          const at = nextSlot(s, v, verb, from);
          const why = p.disabledReason ?? (at ? bookBlock(s, { placeId: place.id, verb, ...at }) : 'No time left this week');
          const bits = [at && !why ? slotLabel(s, at.day, at.slot) : '', p.cost ? fmt$(p.cost) : p.gain ? `+~${fmt$(p.gain)}` : '', p.odds !== undefined ? pct(p.odds) : ''].filter(Boolean);
          return (
            <button key={verb} type="button" data-testid={`city-verb-${place.id}-${verb}`} disabled={!!why || !at}
              title={why ?? `${p.detail}${p.warning ? ` — ${p.warning}` : ''}`}
              onClick={() => at && update((x) => bookVisit(x, { placeId: place.id, verb, ...at }))}
              className="llv-pick !py-1 text-[11px]">
              <span className="font-semibold">{verb === 'deal' ? p.title.split(':')[0] : VERB_LABEL[verb]}</span>
              {bits.length > 0 && <span className="ml-1 text-stone-400">{bits.join(' · ')}</span>}
              {why && <span className="block text-[10px] text-stone-500">{why}</span>}
            </button>
          );
        })}
      </div>
    </li>
  );
}

/**
 * Where the boss is: the city's places and people, the agenda he is
 * keeping, what happened, the risks, and the way home.
 */
export function CityScreen({ s, update, onClose }: { s: GameState; update: (f: (s: GameState) => GameState, what?: string) => void; onClose: () => void }) {
  const v = currentVisit(s);
  const [day, setDay] = useState<number | undefined>();
  // New York has a second tab: the real map of the city, its neighborhoods and families (ui/nyc).
  const [tab, setTab] = useState<'places' | 'map'>('places');
  const [hl, setHl] = useState<string | undefined>();
  useEffect(() => {
    if (tab === 'places' && hl && typeof document !== 'undefined') document.getElementById(`city-place-${hl}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [tab, hl]);
  if (!v) {
    return (
      <Modal onClose={onClose}>
        <div className="p-4 space-y-2" data-testid="city-screen">
          <p className="text-sm text-stone-300">You are home in Wildwood.</p>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </Modal>
    );
  }
  const sc = sceneOf(v.cityId)!;
  const phase = visitPhase(s, v);
  const days = bookableDays(s, v);
  const pickDay = day !== undefined && days.includes(day) ? day : undefined;
  const plan = comeHomePlan(s);
  const acting = actingBoss(s);
  const rk = visitRisks(s, v.cityId, v.mode, v.party.length, v.hid);
  const now = nowDay(s);
  const week = v.agenda.map((it, i) => ({ it, i })).filter(({ it }) => Math.floor(it.day / 7) === s.week || !it.done);
  const past = v.journal.slice(-12).reverse();
  return (
    <Modal onClose={onClose} xwide>
      <div className="llv-d-shore llv-dom-scope p-4 sm:p-5 space-y-4" data-testid="city-screen">
        <div className="relative">
        <PlaceBanner art={tripArt(undefined, s.date.y)} d="shore" title={sc.name}
          sub={<><span className="llv-kicker !text-[10px] llv-dom-ink">{whereAway(s, v)}</span><span className="block italic">{sc.blurb}</span></>} />
          <button type="button" className="llv-iconbtn absolute right-2 top-2 bg-noir-950/75" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <StatChip domain="shore" label="Standing" value={standing(s, v.cityId)} />
          <StatChip domain="shore" label="The hotel" value={<span className="text-[13px]">{fmt$(sc.nightly)}/night</span>} sub={sc.hotel} />
          <StatChip domain="shore" label="With you" value={<span className="text-[13px]">{v.party.length ? `${v.party.length} along` : 'alone'}</span>} sub={v.party.length > 0 ? v.party.map((id) => s.characters[id]).filter(Boolean).map((c) => displayName(c!)).join(', ') : undefined} />
          <StatChip domain="rivals" label="The risk" tone="warn" value={<span className="text-[13px]">Ambush {pct(rk.ambush)}/wk</span>} sub={`tail ${pct(rk.tail)} on the road${rk.stop ? ` · troopers ${pct(rk.stop)}` : ''}`} />
        </div>

        <Card domain="crew" className="!px-3 !py-2 text-xs text-amber-100">
          At home: {acting ? <><CharLink s={s} id={acting.id} /> is running things.</> : 'nobody is minding the store.'} Orders through the underboss or a capo still go; what needs you in Wildwood (buying, City Hall, seeing people) waits until you are back. The other outfits know the chair is empty.
        </Card>

        {phase === 'out' && <p className="text-sm text-stone-300">On the road. You arrive {absLabel(s, v.arriveDay)}.</p>}
        {phase === 'back' && <p className="text-sm text-stone-300">On the road home. Home {v.homeDay !== undefined ? absLabel(s, v.homeDay) : 'soon'}.</p>}

        {v.cityId === 'newyork' && (
          <SubTabs label="New York" value={tab} onChange={setTab} tabs={[{ id: 'places', label: 'Places & people', testid: 'city-tab-places' }, { id: 'map', label: 'Map', testid: 'city-tab-map' }]} />
        )}

        {v.cityId === 'newyork' && tab === 'map' && <NycMapView s={s} onPlace={(id) => { setHl(id); setTab('places'); }} />}
        {v.cityId === 'oceancity' && phase !== 'back' && <OceanCityPanel s={s} open />}

        {phase !== 'back' && tab === 'places' && (
          <Section domain="shore" title="Places & people" className="!mb-0" aside={<span>This week's agenda costs {fmt$(bookedCost(s, v))}</span>}>
            <div className="mb-2 flex flex-wrap items-center gap-1 text-[11px]">
              {days.length > 0 ? (<>
                  <span className="text-stone-500">Book from:</span>
                  <button type="button" aria-pressed={pickDay === undefined} className="llv-pick llv-pick-sm" onClick={() => setDay(undefined)}>the next free time</button>
                  {days.map((d) => <button key={d} type="button" aria-pressed={pickDay === d} className="llv-pick llv-pick-sm" onClick={() => setDay(d)}>{DAY_NAMES[d % 7].slice(0, 3)}</button>)}
              </>) : <span className="text-stone-500">No days left in town this week: the week has to turn.</span>}
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sc.places.map((p) => <PlaceCard key={p.id} s={s} v={v} place={p} from={pickDay} update={update} hl={hl === p.id} />)}
            </ul>
          </Section>
        )}

        {tab === 'places' && <section className="grid gap-3 sm:grid-cols-2">
          <Card domain="shore" className="!p-2.5">
            <CardHead d="shore" glyph="◷" title="The agenda" className="!mb-1" />
            {week.length === 0 && <p className="text-xs text-stone-500 mt-1">Nothing booked. Pick a place: a sit-down in the afternoon, a club at night. It all happens as the week goes by.</p>}
            <ul className="mt-1 space-y-1 text-xs">
              {week.map(({ it, i }) => {
                const place = sc.places.find((p) => p.id === it.placeId);
                return (
                  <li key={i} className="flex flex-wrap items-center gap-2" data-testid="city-agenda-item">
                    <span className="text-stone-500 w-28">{slotLabel(s, it.day, it.slot)}</span>
                    <span className="text-stone-200">{VERB_LABEL[it.verb]}: {place?.name ?? '?'}</span>
                    {it.done ? <span className={it.tone === 'good' ? 'text-emerald-300' : it.tone === 'bad' ? 'text-red-300' : 'text-stone-400'}>{it.outcome}</span>
                      : <button type="button" className="btn-quiet ml-auto text-[11px]" onClick={() => update((x) => unbookVisit(x, i))}>cancel</button>}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card domain="shore" className="!p-2.5">
            <CardHead d="shore" glyph="✎" title="What happened" className="!mb-1" />
            <ul className="mt-1 space-y-0.5 text-[11px] max-h-48 overflow-y-auto">
              {past.map((j, i) => <li key={i} className={j.tone === 'good' ? 'text-emerald-300' : j.tone === 'bad' ? 'text-red-300' : 'text-stone-400'}>{absLabel(s, Math.min(j.day, now))} · {j.text}</li>)}
              {past.length === 0 && <li className="text-stone-500">Nothing yet.</li>}
            </ul>
          </Card>
        </section>}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t llv-dom-border pt-3">
          {v.leaveDay === undefined && plan && <span className="text-xs text-stone-400">Leaving {absLabel(s, plan.leaveDay)}, home {absLabel(s, plan.homeDay)}.</span>}
          {v.leaveDay !== undefined && phase !== 'back' && <button type="button" className="btn-secondary" onClick={() => update(stayOn, 'You stayed on')}>Stay on</button>}
          {v.leaveDay === undefined && <button type="button" className="btn-primary" data-testid="city-come-home" onClick={() => update(comeHome, 'You came home')}>Come home ▸</button>}
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

/** The pill on the map while the boss is out of town. */
export function VisitPill({ s, onOpen }: { s: GameState; onOpen: () => void }) {
  const v = currentVisit(s);
  if (!v) return null;
  const n = v.agenda.filter((i) => !i.done).length;
  return (
    <button type="button" onClick={onOpen} data-testid="visit-pill"
      className="pointer-events-auto rounded-full border border-amber-600/80 bg-noir-900/95 px-3 py-1.5 text-[11px] text-amber-200 shadow-lg shadow-black/70">
      ✈ {whereAway(s, v)}{n ? ` · ${n} on the agenda` : ''} — open
    </button>
  );
}
