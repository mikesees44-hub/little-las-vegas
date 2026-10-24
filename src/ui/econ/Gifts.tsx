import { useState } from 'react';
import { displayName } from '../../engine/characters';
import type { LeverageMode, ZoneId } from '../../engine/econState';
import {
  GIFTS, GIFT_CAT_LABEL, LEVERAGE, PROJECTS, PROJECTS_BY_KIND, TEAMS, giftAvailable, giftPrice, houseTickets, tastes, teamPlaying, zoneRep, type GiftCat,
} from '../../engine/gifts';
import { ZONES, ZONES_BY_ID } from '../../engine/property';
import { getRelation } from '../../engine/relations';
import { FACTION_NAMES } from '../../engine/world';
import type { Character, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';
import { Stat } from './Holdings';

/** Who can receive gifts: the house, the crew, officials, and the other families' people. */
function recipients(s: GameState): Character[] {
  return Object.values(s.characters)
    .filter((c) => c.alive && c.id !== s.playerId && (c.dynasty || c.faction === 'player' || !!c.office || s.rivals.some((r) => r.leaderId === c.id)) && c.rank !== undefined)
    .filter((c) => !(c.faction === 'player' && c.rank === 'civilian' && !c.dynasty && !c.office))
    .sort((a, b) => Number(b.dynasty) - Number(a.dynasty) || Number(!!b.office) - Number(!!a.office) || a.lastName.localeCompare(b.lastName));
}

function group(c: Character): string {
  if (c.dynasty) return 'The house';
  if (c.office) return 'Officials';
  if (c.faction === 'player') return 'The crew';
  return 'Other families';
}

/** Gifts & Giving: luxury gifts, season tickets, community projects, and gifts with strings. */
export function GiftsPanel({ s }: { s: GameState }) {
  const people = recipients(s);
  const [to, setTo] = useState<string>(people[0]?.id ?? '');
  const [cat, setCat] = useState<GiftCat>('car');
  const [zone, setZone] = useState<ZoneId>('pacific');
  const [lev, setLev] = useState<string>(people.find((c) => c.office)?.id ?? people[0]?.id ?? '');
  const [withId, setWithId] = useState<string>('');
  const c = s.characters[to];
  const known = c && (c.dynasty || c.faction === 'player' || (getRelation(s, c.id, s.playerId)?.trust ?? 0) >= 20);
  const t = c ? tastes(c) : undefined;
  const year = s.date.y;
  const list = GIFTS.filter((g) => g.cat === cat && giftAvailable(g, year));
  const e = s.econ;
  const active = (e?.projects ?? []).filter((p) => !p.done);
  const tickets = houseTickets(s);
  const levTarget = s.characters[lev];
  const groups = ['The house', 'The crew', 'Officials', 'Other families'];
  const select = (value: string, onChange: (v: string) => void, label: string, extra?: (c: Character) => boolean) => (
    <select className="rounded bg-noir-900 border border-noir-600 p-1.5 text-sm w-full sm:w-auto" value={value} onChange={(ev) => onChange(ev.target.value)} aria-label={label}>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {people.filter((p) => group(p) === g && (!extra || extra(p))).map((p) => <option key={p.id} value={p.id}>{displayName(p)}{p.office ? ` — ${p.office}` : p.faction !== 'player' && !p.dynasty ? ` — ${FACTION_NAMES[p.faction]}` : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
  return (
    <div className="space-y-6" data-testid="gifts-panel">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Gifts given" value={`${e?.stats.gifts ?? 0}`} sub="all time" />
        <Stat label="Season tickets" value={`${tickets.length}`} sub={tickets.map((x) => TEAMS[x.team].name).join(', ') || 'none in the house'} />
        <Stat label="Projects under way" value={`${active.length}`} sub={`${e?.stats.projects ?? 0} finished`} />
        <Stat label="No-show jobs" value={`${Object.keys(e?.jobs ?? {}).length}`} sub={`${fmt$(Object.values(e?.jobs ?? {}).reduce((a, b) => a + b, 0))}/wk`} />
      </section>

      <section>
        <div className="panel-title">A gift</div>
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          {select(to, setTo, 'Recipient')}
          {c && <span className="text-xs text-stone-400">{known && t ? <>Likes <span className="text-emerald-300">{t.likes.map((x) => GIFT_CAT_LABEL[x].toLowerCase()).join(', ')}</span>; doesn't care for <span className="text-red-300">{t.dislikes.map((x) => GIFT_CAT_LABEL[x].toLowerCase()).join(', ')}</span></> : 'You don\'t know his tastes well enough yet (trust 20+).'}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {(Object.keys(GIFT_CAT_LABEL) as GiftCat[]).map((k) => (
            <button key={k} className={`text-xs px-2 py-0.5 rounded ${cat === k ? 'bg-noir-700 text-gold-400' : 'text-stone-400 hover:text-stone-200'}`} onClick={() => setCat(k)}>
              {GIFT_CAT_LABEL[k]}{known && t?.likes.includes(k) ? ' ♥' : ''}
            </button>
          ))}
        </div>
        {c && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((g) => <ActionCard key={g.id} s={s} action={{ kind: 'econ', op: { type: 'gift', giftId: g.id, to: c.id } }} label={`${g.name} — ${fmt$(giftPrice(s, g))}`} />)}
          </div>
        )}
        <p className="text-[11px] text-stone-500 mt-1">A gift he likes counts for half again; the wrong kind makes him uncomfortable; too lavish for who he is makes him wonder what you want. Season tickets pass to the holder's eldest child.</p>
      </section>

      {tickets.length > 0 && (
        <section>
          <div className="panel-title">Take someone to the game</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {tickets.map((tk) => (
              <div key={`${tk.team}-${tk.holderId}`} className="text-xs">
                <div className="text-stone-400 mb-1">{TEAMS[tk.team].name} {tk.box ? 'box' : 'seats'} — held by <CharLink s={s} id={tk.holderId} />{teamPlaying(tk.team, s) ? '' : ' (off-season)'}</div>
                {c && <ActionCard s={s} action={{ kind: 'econ', op: { type: 'invite', team: tk.team, to: c.id } }} compact />}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="panel-title">Gifts with strings</div>
        <p className="text-xs text-stone-400">Cash, a car, a cottage, a job, an invitation or an introduction — each with odds, because the other adult decides. Accepted gifts become hooks. An honest official may report the offer.</p>
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          {select(lev, setLev, 'Leverage target')}
          <span className="text-xs text-stone-500">introduce to</span>
          {select(withId || '', setWithId, 'Introduce to', (p) => p.id !== lev)}
        </div>
        {levTarget && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(LEVERAGE) as LeverageMode[]).map((m) => <ActionCard key={m} s={s} action={{ kind: 'econ', op: { type: 'leverage', mode: m, to: levTarget.id, withId: m === 'introduce' ? (withId || people.find((p) => p.id !== lev)?.id) : undefined } }} />)}
          </div>
        )}
      </section>

      <section>
        <div className="panel-title">The community</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {ZONES.map((z) => {
            const r = zoneRep(s, z.id);
            return (
              <button key={z.id} className={`text-xs px-2 py-1 rounded border ${zone === z.id ? 'border-gold-400 text-gold-300' : 'border-noir-700 text-stone-400'}`} onClick={() => setZone(z.id)}>
                {z.name} <span className="text-stone-500">♥{r.rep} · trust {r.trust}</span>
              </button>
            );
          })}
        </div>
        {active.length > 0 && (
          <ul className="mt-2 text-xs space-y-1">
            {active.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="text-stone-300 w-64 truncate">{PROJECTS_BY_KIND[p.kind].name} — {ZONES_BY_ID[p.zone].name}</span>
                <div className="flex-1 h-1.5 bg-noir-700 rounded"><div className="h-1.5 bg-gold-400 rounded" style={{ width: `${(100 * p.progress) / p.weeks}%` }} /></div>
                <span className="text-stone-500 tabular-nums">{p.progress}/{p.weeks} wk</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROJECTS.map((p) => <ActionCard key={p.kind} s={s} action={{ kind: 'econ', op: { type: 'project', kind: p.kind, zone } }} compact />)}
        </div>
        <p className="text-[11px] text-stone-500 mt-1">Residents can appreciate the playground and still not trust the man who paid for it: trust grows a third as fast and heat wears it down. Where they trust you, they look the other way.</p>
      </section>
    </div>
  );
}
