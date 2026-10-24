import { ageOn, formatDate } from '../../engine/calendar';
import { displayName, player, relationLabel, TRAIT_INFO } from '../../engine/characters';
import { relationshipTo } from '../../engine/interactions';
import { interactionsFor, playerHook } from '../../engine/interactions';
import { SCHEME_INFO } from '../../engine/schemes';
import { knownSecrets } from '../../engine/secrets';
import type { SchemeKind } from '../../engine/types';
import { usePlanner } from './Schemes';
import { getRelation, opinionBreakdown } from '../../engine/relations';
import { FACTION_NAMES } from '../../engine/world';
import type { Character, GameState } from '../../engine/types';
import { fmt$, signed } from '../format';
import { Portrait } from '../portrait/Portrait';
import { Modal } from './Modal';
import { ActionCard } from './Orders';
import { FACTION_TINT, TraitIcons } from './People';
import { DynastyFacts } from '../family/bits';
import { FamilySection } from '../houses/FamilySection';
import { HouseLine } from '../houses/HouseLine';
import { LineageSheet } from '../houses/LineageSheet';

const SKILLS: (keyof Character['attributes'])[] = ['leadership', 'business', 'diplomacy', 'intrigue', 'force', 'discipline'];
const SKILL_LABEL: Record<string, string> = { leadership: 'Leadership', business: 'Business', diplomacy: 'Diplomacy', intrigue: 'Intrigue', force: 'Muscle', discipline: 'Discipline' };

export function CharacterSheet({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  const c = s.characters[id];
  // Off-screen people of the house trees have their own sheet.
  if (!c) return <LineageSheet s={s} id={id} onClose={onClose} />;
  const boss = player(s);
  const isBoss = c.id === boss.id;
  const age = ageOn(c.birth, c.death ? c.death.date : s.date);
  const rel = getRelation(s, c.id, boss.id);
  const { total, mods } = opinionBreakdown(s, c.id, boss.id);
  const yourView = opinionBreakdown(s, boss.id, c.id);
  const district = s.districts.find((d) => d.capoId === c.id);
  const relationship = relationshipTo(s, c);
  const inters = c.alive && !isBoss && !s.gameOver ? interactionsFor(s, c.id) : [];
  const secrets = knownSecrets(s, c.id);
  const hooks = s.hooks.filter((h) => h.holder === 'player' && h.targetId === c.id);
  const hookUsable = !!playerHook(s, c.id);
  const { plan } = usePlanner();
  const schemeKinds: SchemeKind[] = !c.alive || isBoss || s.gameOver ? [] : [
    ...(c.office || c.faction === 'law' ? [] : ['murder' as const]),
    ...(secrets.length && c.faction !== 'player' ? ['blackmail' as const] : []),
    ...(s.rivals.some((r) => r.id === c.faction && r.leaderId !== c.id) && c.rank !== 'civilian' ? ['informant' as const] : []),
    'sway' as const, 'befriend' as const,
  ];

  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5" data-testid="character-sheet">
        <div className="flex justify-between items-start gap-3">
          <div className="flex gap-3 min-w-0">
            <Portrait c={c} seed={s.seed} date={s.date} size={104} tint={FACTION_TINT[c.faction]} />
            <div className="min-w-0">
              <h2 className="font-display text-2xl text-gold-400 leading-tight">{displayName(c)}</h2>
              {c.maidenName && <div className="text-xs text-stone-500">née {c.maidenName}</div>}
              <HouseLine s={s} id={c.id} />
              <div className="text-sm text-stone-300">
                {isBoss ? `Head of the house of ${s.houseName}` : c.rank !== 'civilian' ? c.rank[0].toUpperCase() + c.rank.slice(1) : c.frontMan ? 'Front man' : 'Civilian'}
                {' · '}{FACTION_NAMES[c.faction] === 'Your crew' ? (c.dynasty ? `House of ${s.houseName}` : 'Your crew') : FACTION_NAMES[c.faction]}
                {district && ` · capo of ${district.name}`}
                {c.specialty && ` · ${c.specialty}`}
              </div>
              <div className="text-xs text-stone-400 mt-0.5">
                {c.alive ? `${age} years old` : `Died ${c.death ? formatDate(c.death.date) : ''}, aged ${age} — ${c.death?.cause ?? ''}`}
                {!isBoss && c.alive && ` · your ${relationLabel(s, boss, c) === 'kin' ? relationship : relationLabel(s, boss, c)}`}
              </div>
              {c.alive && (
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-stone-500">Health</span>
                  <div className="h-1.5 w-24 rounded bg-noir-700 overflow-hidden"><div className={`h-full ${c.health >= 60 ? 'bg-emerald-600' : c.health >= 35 ? 'bg-amber-600' : 'bg-blood-400'}`} style={{ width: `${c.health}%` }} /></div>
                  <span className="tabular-nums text-stone-300">{c.health}</span>
                  {c.conditions.length > 0 && <span className="text-red-300">{c.conditions.join(', ')}</span>}
                </div>
              )}
              <div className="mt-1.5"><TraitIcons c={c} labels /></div>
            </div>
          </div>
          <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>

        <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-xs">
          {SKILLS.map((k) => (
            <div key={k} className="rounded bg-noir-800 border border-noir-700 px-2 py-1">
              <div className="text-stone-500">{SKILL_LABEL[k]}</div>
              <div className="tabular-nums text-stone-100 text-base font-semibold">{c.attributes[k]}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Particulars</div>
            <div className="text-xs text-stone-300 mt-1 space-y-0.5">
              <div>Ambition: <span className="text-stone-100">{c.ambition}</span></div>
              <div>Own money: <span className="text-stone-100">{fmt$(c.wealth)}</span></div>
              {c.imprisonedUntil && c.imprisonedUntil > s.week && <div className="text-red-300">In jail until week {c.imprisonedUntil}</div>}
              {(c.record ?? 0) > 0 && <div>Record: {c.record} arrest{c.record! > 1 ? 's' : ''}</div>}
              {(c.evidence ?? 0) > 0 && <div>Law's file on him: {c.evidence}/100</div>}
              {!isBoss && rel && <div>Fear {rel.fear} · Trust {rel.trust} · Grievance {rel.grievance}</div>}
              {c.traits.map((t) => <div key={t} className="text-stone-500"><span className="text-stone-300">{t}:</span> {TRAIT_INFO[t]}</div>)}
            </div>
          </section>
          {!isBoss ? (
            <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5">
              <div className="flex justify-between text-[10px] uppercase tracking-[0.25em] text-stone-500">
                <span>What {c.firstName} thinks of you</span>
                <span className={`text-sm font-semibold ${total >= 25 ? 'text-emerald-400' : total <= -25 ? 'text-red-400' : 'text-stone-200'}`}>{signed(total)}</span>
              </div>
              {mods.length === 0 && <div className="text-xs text-stone-500 mt-1">No strong feelings either way.</div>}
              <ul className="mt-1">
                {mods.map((m) => (
                  <li key={m.id} className="flex justify-between text-xs py-0.5 gap-2">
                    <span className="text-stone-300">{m.reason}<span className="text-stone-600">{m.decay === 0 ? ' (permanent)' : ` (fades ${m.decay}/mo)`}</span></span>
                    <span className={`tabular-nums ${m.value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{signed(m.value)}</span>
                  </li>
                ))}
              </ul>
              {yourView.mods.length > 0 && (
                <div className="mt-2 text-[11px] text-stone-500">You think {signed(yourView.total)} of him: {yourView.mods.slice(0, 3).map((m) => `${m.reason} (${signed(m.value)})`).join(', ')}</div>
              )}
            </section>
          ) : (
            <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">The house</div>
              <div className="text-xs text-stone-300 mt-1">Respect {s.respect} · Treasury {fmt$(s.money)} · {Object.values(s.characters).filter((x) => x.alive && x.dynasty).length} living members of the house</div>
            </section>
          )}
        </div>

        <DynastyFacts s={s} c={c} />

        <FamilySection s={s} id={c.id} />

        <section className="mt-3">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Secrets & hooks</div>
          {secrets.length === 0 && hooks.length === 0 && <div className="text-xs text-stone-500 mt-1">Nothing known. Set your consigliere to dig for secrets.</div>}
          <ul className="text-xs mt-1 space-y-0.5">
            {secrets.map((x) => <li key={x.id} className="text-amber-200">Secret: {x.text}.</li>)}
            {hooks.map((h) => <li key={h.id} className={h.strong ? 'text-gold-300' : 'text-stone-300'}>You hold a {h.strong ? 'strong' : 'weak'} hook: {h.reason}{h.strong ? '' : ' (spent when used)'}.</li>)}
          </ul>
        </section>

        {schemeKinds.length > 0 && (
          <section className="mt-3">
            <div className="panel-title text-base">Schemes</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {schemeKinds.map((k) => (
                <button key={k} className={`btn text-xs ${k === 'murder' ? 'border border-blood-500 text-red-300 hover:bg-blood-500/20' : 'btn-ghost'}`} onClick={() => plan(k, c.id)}>
                  {SCHEME_INFO[k].name}
                </button>
              ))}
            </div>
          </section>
        )}

        {inters.length > 0 && (
          <section className="mt-4">
            <div className="panel-title text-base">Interactions</div>
            <p className="text-[11px] text-stone-500">Ordered now, carried out when you advance the week.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {inters.map((p) => <ActionCard key={p.id} s={s} action={{ kind: 'interact', id: p.id, target: c.id }} />)}
              {hookUsable && inters.filter((p) => p.acceptance).map((p) => <ActionCard key={`h${p.id}`} s={s} action={{ kind: 'interact', id: p.id, target: c.id, useHook: true }} />)}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
