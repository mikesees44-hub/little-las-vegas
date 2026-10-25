import { ageOn, dateOfWeek, formatDate } from '../../engine/calendar';
import { capoLoyalty, capoOf, CRAFT_INFO, GOAL_INFO, OUTSIDE_INFO, outsideGuys, regime, VICE_INFO } from '../../engine/hierarchy';
import { warningsFor } from './CrewTree';
import { opinion } from '../../engine/relations';
import { capos, displayName, player, relationLabel, TRAIT_INFO } from '../../engine/characters';
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
import { SheetFrame } from '../shell/SheetFrame';
import { TravelButton } from '../travel/context';
import { ActionCard } from './Orders';
import { CharLink, Face, FACTION_TINT, TraitIcons } from './People';
import { DynastyFacts } from '../family/bits';
import { Tip } from '../clarity/Tip';
import { PowerFacts } from '../power/PowerFacts';
import { fam } from '../../engine/familyState';
import { GRAND_JURY, OPEN_FILE, stageLabel } from '../../engine/longgame';
import { Relationships } from './Relationships';
import { BonesFacts } from '../books/BonesFacts';

const SKILLS: (keyof Character['attributes'])[] = ['leadership', 'business', 'diplomacy', 'intrigue', 'force', 'discipline'];
const SKILL_HELP: Record<string, string> = {
  leadership: 'Runs men: the underboss seat, capos\' kick-ups, an heir the capos follow.',
  business: 'Makes money: the bagman seat, capos\' take, managers.',
  diplomacy: 'Talks: the fixer seat, envoys, befriending and swaying.',
  intrigue: 'Plots: the consigliere seat, schemes, secrets.',
  force: 'Muscle: the enforcer seat, hits, heists.',
  discipline: 'Keeps his mouth shut and his hand out of the till.',
};
const SKILL_LABEL: Record<string, string> = { leadership: 'Leadership', business: 'Business', diplomacy: 'Diplomacy', intrigue: 'Intrigue', force: 'Muscle', discipline: 'Discipline' };

export function CharacterSheet({ s, id, onClose, embedded }: { s: GameState; id: string; onClose: () => void; embedded?: boolean }) {
  const c = s.characters[id];
  if (!c) return null;
  const boss = player(s);
  const isBoss = c.id === boss.id;
  const age = ageOn(c.birth, c.death ? c.death.date : s.date);
  const rel = getRelation(s, c.id, boss.id);
  const { total, mods } = opinionBreakdown(s, c.id, boss.id);
  const yourView = opinionBreakdown(s, boss.id, c.id);
  const family = familyOf(s, c);
  const district = s.districts.find((d) => d.capoId === c.id);
  const relationship = relationshipTo(s, c);
  const inters = c.alive && !isBoss && !s.gameOver ? interactionsFor(s, c.id) : [];
  const secrets = knownSecrets(s, c.id);
  const hooks = s.hooks.filter((h) => h.holder === 'player' && h.targetId === c.id);
  const hookUsable = !!playerHook(s, c.id);
  const { plan } = usePlanner();
  const showsLife = (c.faction === 'player' || !!c.outside) && !isBoss;
  const schemeKinds: SchemeKind[] = !c.alive || isBoss || s.gameOver ? [] : [
    ...(c.office || c.faction === 'law' ? [] : ['murder' as const]),
    ...(secrets.length && c.faction !== 'player' ? ['blackmail' as const] : []),
    ...(s.rivals.some((r) => r.id === c.faction && r.leaderId !== c.id) && c.rank !== 'civilian' ? ['informant' as const] : []),
    'sway' as const, 'befriend' as const,
  ];

  return (
    <SheetFrame onClose={onClose} embedded={embedded}>
      <div className="p-4 sm:p-5" data-testid="character-sheet">
        <div className="flex justify-between items-start gap-3">
          <div className="flex gap-3 min-w-0">
            <Portrait c={c} seed={s.seed} date={s.date} size={104} tint={FACTION_TINT[c.faction]} opinion={c.alive && c.faction === 'player' && !isBoss ? total : undefined} />
            <div className="min-w-0">
              <h2 className="font-display text-2xl text-gold-400 leading-tight">{displayName(c)}</h2>
              {c.maidenName && <div className="text-xs text-stone-500">née {c.maidenName}</div>}
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
              {c.alive && !s.gameOver && <div className="mt-1.5"><TravelButton s={s} charId={c.id} /></div>}
            </div>
          </div>
          {!embedded && <button className="btn-ghost text-xs" onClick={onClose}>Close</button>}
        </div>

        <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-xs">
          {SKILLS.map((k) => (
            <div key={k} className="rounded bg-noir-800 border border-noir-700 px-2 py-1" title={SKILL_HELP[k]}>
              <div className="text-stone-500">{SKILL_LABEL[k]}</div>
              <div className="tabular-nums text-stone-100 text-base font-semibold">{c.attributes[k]}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Particulars</div>
            <div className="text-xs text-stone-300 mt-1 space-y-0.5">
              {!c.goal && <div>Ambition: <span className="text-stone-100">{c.ambition}</span></div>}
              <div>Own money: <span className="text-stone-100">{fmt$(c.wealth)}</span></div>
              {c.imprisonedUntil && c.imprisonedUntil > s.week && <div className="text-red-300">In jail until week {c.imprisonedUntil}</div>}
              {!showsLife && (c.record ?? 0) > 0 && <div>Record: {c.record} arrest{c.record! > 1 ? 's' : ''}</div>}
              {!showsLife && (isBoss || (c.evidence ?? 0) > 0) && <EvidenceLine s={s} c={c} />}
              {!isBoss && rel && <div><Tip term="fear"><span>Fear {rel.fear} · Trust {rel.trust} · Grievance {rel.grievance}</span></Tip></div>}
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
        <PowerFacts s={s} c={c} />
        <BonesFacts s={s} c={c} />
        {showsLife && <HisLife s={s} c={c} />}

        <section className="mt-3">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Family</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {family.length === 0 && <span className="text-stone-500">No family to speak of.</span>}
            {family.map(([label, f]) => (
              <span key={f.id} className={f.alive ? 'text-stone-300' : 'text-stone-600'}>
                <span className="text-stone-500">{label}:</span> <CharLink s={s} id={f.id} />{!f.alive && ' †'}
              </span>
            ))}
          </div>
        </section>

        <Relationships s={s} c={c} />

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
    </SheetFrame>
  );
}

/**
 * The law's file on a man. One value per character: the crew's crimes, the
 * family's lawyers and (for the boss) the federal case all share it.
 */
function EvidenceLine({ s, c }: { s: GameState; c: Character }) {
  const v = Math.round(c.evidence ?? 0);
  const l = s.legal && s.legal.personId === c.id ? s.legal : undefined;
  const tone = v >= 65 ? 'bg-blood-400' : v >= 40 ? 'bg-amber-500' : 'bg-stone-500';
  return (
    <div data-testid="evidence-line">
      <div className="flex items-center gap-2">
        <span>Evidence against {c.id === s.playerId ? 'him (the federal case)' : 'him'}</span>
        <div className="h-1.5 w-20 rounded bg-noir-700 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${v}%` }} /></div>
        <span className="tabular-nums text-stone-100">{v}/100</span>
      </div>
      {c.id === s.playerId && (
        <div className="text-[11px] text-stone-500">
          {l ? `${stageLabel(l)} · defense ${Math.round(l.defense)}` : 'No case'} · the FBI opens a file at {OPEN_FILE}, a grand jury sits at {GRAND_JURY}. Orders given yourself leave fingerprints.
        </div>
      )}
    </div>
  );
}

function LoyaltyBar({ label, v }: { label: string; v: number }) {
  const pct = Math.max(0, Math.min(100, (v + 100) / 2));
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-28 shrink-0 truncate text-stone-400">{label}</span>
      <div className="relative h-2 flex-1 rounded bg-noir-700" role="meter" aria-label={label} aria-valuenow={v} aria-valuemin={-100} aria-valuemax={100}>
        <div className="absolute inset-y-0 left-1/2 w-px bg-noir-500" />
        <div className={`absolute inset-y-0 ${v >= 0 ? 'left-1/2' : ''} rounded ${v >= 25 ? 'bg-emerald-500' : v <= -25 ? 'bg-red-500' : 'bg-amber-500'}`} style={v >= 0 ? { width: `${pct - 50}%` } : { left: `${pct}%`, width: `${50 - pct}%` }} />
      </div>
      <span className={`w-8 text-right tabular-nums ${v >= 25 ? 'text-emerald-300' : v <= -25 ? 'text-red-300' : 'text-stone-200'}`}>{signed(v)}</span>
    </div>
  );
}

/** Who the man is: his crew, his loyalties, his trade, his family, his weaknesses, his story. */
function HisLife({ s, c }: { s: GameState; c: Character }) {
  const k = capoOf(s, c);
  const capoLoy = capoLoyalty(s, c);
  const bossLoy = opinion(s, c.id, s.playerId);
  const men = c.rank === 'capo' ? regime(s, c.id) : [];
  const outside = c.rank === 'capo' ? outsideGuys(s, c.id) : [];
  const kids = c.household?.kids ?? [];
  const story = (c.story ?? []).slice().reverse();
  const warns = warningsFor(s, c);
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="his-life">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">His life</div>
      <div className="mt-1 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-xs text-stone-300">
          {c.rank === 'capo' ? (
            <div>Runs a crew of {men.length}{outside.length ? ` and ${outside.length} outside guy${outside.length > 1 ? 's' : ''}` : ''} · kicks up {Math.round((1 - (c.keep ?? 0.3)) * 100)}% · his treasury {fmt$(c.wealth)}</div>
          ) : c.outside ? (
            <div>{OUTSIDE_INFO[c.outside]}{k ? <> for <CharLink s={s} id={k.id} />'s crew</> : ''} · not a member</div>
          ) : (
            <div>{k ? <>In <CharLink s={s} id={k.id} />'s crew</> : 'Reports straight to you'}{c.craft ? ` · ${CRAFT_INFO[c.craft].name}` : ''}</div>
          )}
          {c.goal && !(c.dynasty && fam(s, c.id).goal) && <div>Wants to: <span className="text-stone-100">{GOAL_INFO[c.goal].toLowerCase()}</span></div>}
          {c.lastEarn !== undefined && <div>Brought in {fmt$(c.lastEarn)} last week · stash {fmt$(c.wealth)}</div>}
          <div>Record: {c.record ?? 0} arrest{(c.record ?? 0) === 1 ? '' : 's'}</div>
          <EvidenceLine s={s} c={c} />
          {c.household?.wife && <div>Wife: {c.household.wife}{kids.length ? ` · ${kids.map((x) => `${x.name} (${Math.max(0, s.date.y - x.born)})`).join(', ')}` : ''}</div>}
          {!c.household?.wife && kids.length > 0 && <div>Kids: {kids.map((x) => x.name).join(', ')}</div>}
          {(c.vices ?? []).length > 0 && <div className="text-amber-200">{(c.vices ?? []).map((v) => VICE_INFO[v]).join('. ')}.</div>}
          {(c.arrears ?? 0) > 0 && <div className="text-amber-200">Owes {fmt$(c.arrears ?? 0)} in kick-ups he held back over the winter. He says he'll make it up in the season.</div>}
          {c.debtTo && <div className="text-red-300">Owes {fmt$(c.debtTo.amount)} to a {FACTION_NAMES[c.debtTo.rival]} shylock.</div>}
          {c.courtedBy && <div className="text-red-300">{FACTION_NAMES[c.courtedBy.rival]} has been courting him since week {c.courtedBy.week}.</div>}
          {c.proposedWeek !== undefined && <div className="text-gold-300">Proposed for membership (week {c.proposedWeek}){c.vouchedBy ? <>, vouched for by <CharLink s={s} id={c.vouchedBy} /></> : ''}.</div>}
          {c.madeWeek !== undefined && <div className="text-gold-300">Made in week {c.madeWeek}{c.vouchedBy ? <>; <CharLink s={s} id={c.vouchedBy} /> stood for him</> : ''}.</div>}
        </div>
        <div className="space-y-1.5">
          {c.faction === 'player' && <LoyaltyBar label="Loyalty to you" v={bossLoy} />}
          {capoLoy !== undefined && k && <LoyaltyBar label={`Loyalty to ${k.firstName}`} v={capoLoy} />}
          {capoLoy !== undefined && capoLoy > bossLoy + 10 && <div className="text-[11px] text-amber-300">His capo's man first. If {k?.firstName} walks, he follows.</div>}
          {warns.length > 0 && <ul className="text-[11px] text-stone-400">{warns.map((w, i) => <li key={i}>{w.g} {w.label}</li>)}</ul>}
          {men.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">{men.map((m) => <Face key={m.id} s={s} c={m} size={28} />)}</div>
          )}
        </div>
      </div>
      {story.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">His chronicle</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {story.map((e, i) => <li key={i} className="text-stone-300"><span className="text-stone-500 tabular-nums">{formatDate(dateOfWeek(Math.max(1, e.week)))}</span> — {e.text}</li>)}
          </ul>
        </div>
      )}
      {c.alive && c.faction === 'player' && !s.gameOver && (c.rank === 'soldier' || c.rank === 'associate') && !c.specialty && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {capos(s).filter((x) => x.id !== c.capoId).slice(0, 4).map((x) => <ActionCard key={x.id} s={s} action={{ kind: 'reassign', charId: c.id, capoId: x.id }} compact />)}
          {c.rank === 'associate' && <ActionCard s={s} action={{ kind: 'background', charId: c.id }} compact />}
        </div>
      )}
    </section>
  );
}

function familyOf(s: GameState, c: Character): [string, Character][] {
  const out: [string, Character][] = [];
  const add = (label: string, id?: string) => {
    const x = id ? s.characters[id] : undefined;
    if (x && !out.some(([, y]) => y.id === x.id)) out.push([label, x]);
  };
  add('Father', c.fatherId);
  add('Mother', c.motherId);
  add(c.gender === 'M' ? 'Wife' : 'Husband', c.spouseId);
  for (const k of c.childrenIds) add(s.characters[k]?.gender === 'M' ? 'Son' : 'Daughter', k);
  if (c.fatherId) for (const o of Object.values(s.characters)) if (o.id !== c.id && o.fatherId === c.fatherId) add(o.gender === 'M' ? 'Brother' : 'Sister', o.id);
  return out;
}
