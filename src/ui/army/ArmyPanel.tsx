import { useState } from 'react';
import {
  allyIds, allyMenOffer, allyName, armyMeter, BANDS, BAND_IDS, campaignPressure, levyView, morale, PACT_WEEKS, RAISE_UPKEEP, rivalLabel, weeklyBill,
} from '../../engine/army';
import type { AllyId, AllyOffer } from '../../engine/armyState';
import { crewStrength } from '../../engine/strength';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { fmt$ } from '../format';

/**
 * THE ARMY: CK levies for the family. Every crew's men, how many come when
 * called (a capo who doesn't love you sends fewer, or stalls), the hired
 * muscle, the mattresses, the equipment, the allies who answered a call to
 * arms and the pacts made in peace, and the weekly bill.
 */

const sel = 'rounded bg-noir-900 border border-noir-600 p-1 text-xs';
const OFFER_LABEL: Record<AllyOffer, string> = { money: 'Money', cut: 'A cut of Wildwood', favor: 'A favor owed' };

export function ArmyMeterLine({ s }: { s: GameState }) {
  const m = armyMeter(s);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 text-xs" data-testid="army-meter-line">
      <div>Raised <span className="tabular-nums text-stone-100">{m.raised}</span></div>
      <div>Available <span className="tabular-nums text-stone-300">{m.available}</span></div>
      <div>Hired <span className="tabular-nums text-stone-300">{m.hired}</span></div>
      <div>Allies <span className="tabular-nums text-sky-300">{m.allies}</span></div>
      <div>Enemy {m.enemy ? <span className="tabular-nums text-red-300">{m.enemy.lo === m.enemy.hi ? m.enemy.lo : `${m.enemy.lo}–${m.enemy.hi}`}{m.enemy.fogged ? '?' : ''}</span> : <span className="text-stone-500">none</span>}</div>
    </div>
  );
}

export function ArmyPanel({ s }: { s: GameState }) {
  const A = s.army;
  const lev = levyView(s);
  const meter = armyMeter(s);
  const bill = weeklyBill(s);
  const mor = morale(s);
  const gear = crewStrength(s).crews;
  const press = s.wars.some((w) => w.rival === 'philly') || s.flags.brokeFromPhilly ? undefined : campaignPressure(s, 'philly');
  const wars = s.wars;
  const [warId, setWarId] = useState<string>(wars[0]?.id ?? '');
  const war = wars.find((w) => w.id === warId) ?? wars[0];
  const allies = war ? allyIds(s, war.rival) : allyIds(s);
  const [ally, setAlly] = useState<AllyId>(allies[0]);
  const [offer, setOffer] = useState<AllyOffer>('money');
  const pickAlly = allies.includes(ally) ? ally : allies[0];
  const commits = (A?.commits ?? []).filter((c) => c.until > s.week);
  const pacts = (A?.pacts ?? []).filter((p) => p.until > s.week);
  return (
    <div className="space-y-6" data-testid="army-panel">
      <section>
        <div className="panel-title">Men under arms</div>
        <ArmyMeterLine s={s} />
        <div className="mt-1 text-[11px] text-stone-400">
          Strength in the field {meter.power} · morale {mor.v} ({mor.reasons.filter((r) => r.label !== 'Base' && r.value).map((r) => `${r.label} ${r.value > 0 ? '+' : ''}${r.value}`).join(', ') || 'steady'}) · weariness {meter.weariness}
        </div>
        <div className="mt-1 text-[11px] text-stone-400" data-testid="army-bill">
          A week under arms: {fmt$(bill.total)} — upkeep {fmt$(bill.upkeep)}, the take the men aren't bringing in {fmt$(bill.incomeLoss)}, hired men {fmt$(bill.hired)}{bill.safehouses ? `, safehouses ${fmt$(bill.safehouses)}` : ''}{bill.heat ? ` · heat +${bill.heat} a week` : ''}
        </div>
        {press && press.value >= 25 && (
          <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-200" data-testid="philly-lean">
            Philadelphia's mood: {press.value}/100 toward coming down the causeway ({press.value >= 55 ? 'any month now' : press.value >= 40 ? 'counting your men' : 'watching'}).
            <span className="text-stone-400"> {press.reasons.filter((r) => r.label !== 'Base' && r.value).map((r) => `${r.label} ${r.value > 0 ? '+' : ''}${r.value}`).join(' · ')}</span>
          </div>
        )}
      </section>

      <section>
        <div className="panel-title">Raise the troops</div>
        <p className="text-[11px] text-stone-500">Call up each crew: the men leave their rackets (the take drops), cost {fmt$(RAISE_UPKEEP)} a man a week, and the island notices. A capo who doesn't love you sends fewer, or stalls. Men left on the street fight at 40%.</p>
        <table className="mt-1 w-full text-xs" data-testid="levy-table">
          <thead><tr className="text-stone-500"><th className="text-left">Crew</th><th>Free</th><th>Raised</th><th>Answer</th><th>Per man</th><th>Armed</th><th /></tr></thead>
          <tbody>
            {lev.map((c) => {
              const g = gear.find((x) => x.holder === c.holder);
              const short = g ? Math.max(0, g.men - g.gear.armed) : 0;
              return (
                <tr key={c.holder} className="align-top">
                  <td className="text-stone-200">{c.name}{c.stalled ? <span className="text-red-300"> (stalling)</span> : c.late ? <span className="text-amber-300"> (+{c.late} coming)</span> : null}</td>
                  <td className="text-center tabular-nums">{c.available}/{c.members}</td>
                  <td className="text-center tabular-nums text-stone-100">{c.raised}</td>
                  <td className={`text-center tabular-nums ${c.willing < 0.6 ? 'text-red-300' : c.willing < 0.9 ? 'text-amber-300' : 'text-emerald-300'}`} title={c.reasons.map((r) => `${r.label} ${r.value > 0 ? '+' : ''}${r.value}`).join('\n')}>{Math.round(c.willing * 100)}%</td>
                  <td className="text-center tabular-nums">{c.perMan}</td>
                  <td className="text-center tabular-nums">{g ? `${g.gear.armed}/${g.men}` : '—'}</td>
                  <td className="text-right space-y-1">
                    {c.raised < c.available && <ActionCard s={s} action={{ kind: 'army', op: { op: 'raise', holder: c.holder } }} compact />}
                    {c.raised > 0 && <ActionCard s={s} action={{ kind: 'army', op: { op: 'disband', holder: c.holder } }} compact />}
                    {short > 0 && <ActionCard s={s} action={{ kind: 'dev', op: { t: 'buy', cat: 'handguns', n: short, holder: c.holder } }} compact label={`Arm them: ${short} handguns`} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ActionCard s={s} action={{ kind: 'army', op: { op: 'raise', holder: 'all' } }} compact />
          <ActionCard s={s} action={{ kind: 'army', op: { op: 'disband', holder: 'all' } }} compact />
        </div>
        <p className="mt-1 text-[11px] text-stone-500">Better guns, cars and vests (the Development screen) make every man count for more.</p>
      </section>

      <section>
        <div className="panel-title">Outside muscle & the mattresses</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {BAND_IDS.map((b) => {
            const on = A?.hired.find((h) => h.band === b);
            return (
              <div key={b} className="rounded border border-noir-700 bg-noir-800/60 p-2 text-[11px]" data-testid="band">
                <div className="text-stone-200 text-xs">{BANDS[b].name}{on ? <span className="text-emerald-300"> · {on.men} on the payroll</span> : null}</div>
                <div className="text-stone-400">{BANDS[b].men} men · {fmt$(BANDS[b].weekly)}/wk · {BANDS[b].blurb}</div>
                <div className="mt-1"><ActionCard s={s} action={{ kind: 'army', op: on ? { op: 'dismiss', band: b } : { op: 'hire', band: b } }} compact /></div>
              </div>
            );
          })}
        </div>
        <div className="mt-2"><ActionCard s={s} action={{ kind: 'army', op: { op: 'safehouses', on: !A?.safehouses } }} compact /></div>
      </section>

      <section>
        <div className="panel-title">Allies</div>
        {war ? (
          <>
            {wars.length > 1 && (
              <label className="text-xs text-stone-400">War: <select className={sel} value={war.id} onChange={(e) => setWarId(e.target.value)}>{wars.map((w) => <option key={w.id} value={w.id}>{rivalLabel(s, w.rival)}</option>)}</select></label>
            )}
            <p className="text-[11px] text-stone-500">A call to arms against {rivalLabel(s, war.rival)}: they weigh what they think of you, marriages and pacts, the hooks you hold, what you offer, their own wars, and whether you look like winning. Their men fight beside yours and they want paying after.</p>
            <div className="mt-1 flex flex-wrap gap-2 items-center text-xs">
              <select className={sel} value={pickAlly} onChange={(e) => setAlly(e.target.value as AllyId)} data-testid="ally-pick">{allies.map((a) => <option key={a} value={a}>{allyName(s, a)} ({allyMenOffer(s, a)} men)</option>)}</select>
              <select className={sel} value={offer} onChange={(e) => setOffer(e.target.value as AllyOffer)}>{(Object.keys(OFFER_LABEL) as AllyOffer[]).map((o) => <option key={o} value={o}>{OFFER_LABEL[o]}</option>)}</select>
            </div>
            {pickAlly && <div className="mt-1"><ActionCard s={s} action={{ kind: 'army', op: { op: 'ask', ally: pickAlly, warId: war.id, offer } }} /></div>}
          </>
        ) : (
          <>
            <p className="text-[11px] text-stone-500">In peacetime, make pacts: for a year each comes when the other calls (their men answer far more readily), and Philadelphia thinks twice before it moves.</p>
            <div className="mt-1 flex flex-wrap gap-2 items-center text-xs">
              <select className={sel} value={pickAlly} onChange={(e) => setAlly(e.target.value as AllyId)} data-testid="ally-pick">{allies.map((a) => <option key={a} value={a}>{allyName(s, a)}</option>)}</select>
            </div>
            {pickAlly && <div className="mt-1"><ActionCard s={s} action={{ kind: 'army', op: { op: 'pact', ally: pickAlly } }} /></div>}
          </>
        )}
        {commits.length > 0 && (
          <ul className="mt-2 text-xs space-y-0.5" data-testid="ally-commits">
            {commits.map((c) => <li key={c.id}><span className="text-sky-300">{allyName(s, c.ally)}</span>: {c.men} of {c.sent} men in the field · paid by {OFFER_LABEL[c.offer].toLowerCase()} · until week {c.until}</li>)}
          </ul>
        )}
        {pacts.length > 0 && (
          <ul className="mt-2 text-xs space-y-0.5" data-testid="army-pacts">
            {pacts.map((p) => <li key={p.ally}>Pact with <span className="text-sky-300">{allyName(s, p.ally)}</span> until week {p.until} ({PACT_WEEKS} weeks)</li>)}
          </ul>
        )}
      </section>

      {(A?.log.length ?? 0) > 0 && (
        <section>
          <div className="panel-title">Lately</div>
          <ul className="text-[11px] text-stone-400 space-y-0.5">{A!.log.slice(-8).reverse().map(([wk, t], i) => <li key={i}>Wk {wk}: {t}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
