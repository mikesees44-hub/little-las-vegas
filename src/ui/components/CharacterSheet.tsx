import { canHold } from '../../engine/earners';
import { EarnerRow } from '../econ/SteadyEarners';
import { ageOn, dateOfWeek, formatDate } from '../../engine/calendar';
import { capoLoyalty, capoOf, CRAFT_INFO, GOAL_INFO, OUTSIDE_INFO, outsideGuys, regime, VICE_INFO } from '../../engine/hierarchy';
import { warningsFor } from './CrewTree';
import { opinion } from '../../engine/relations';
import { capos, displayName, player, relationLabel, TRAIT_INFO } from '../../engine/characters';
import { relationshipTo } from '../../engine/interactions';
import { knownSecrets } from '../../engine/secrets';
import { getRelation, opinionBreakdown } from '../../engine/relations';
import { FACTION_NAMES } from '../../engine/world';
import type { Character, GameState } from '../../engine/types';
import { fmt$, signed } from '../format';
import { Portrait } from '../portrait/Portrait';
import { SheetFrame } from '../shell/SheetFrame';
import { InteractionMenu } from '../sheet/InteractionMenu';
import { PoliticsSection } from '../sheet/PoliticsSection';
import { ConnectionsSection } from '../ears/Connections';
import { TravelButton } from '../travel/context';
import { ActionCard } from './Orders';
import { CharLink, Face, FACTION_TINT, TraitIcons } from './People';
import { DynastyFacts } from '../family/bits';
import { FamilySection } from '../houses/FamilySection';
import { HouseLine } from '../houses/HouseLine';
import { LineageSheet } from '../houses/LineageSheet';
import { Tip } from '../clarity/Tip';
import { PowerFacts } from '../power/PowerFacts';
import { fam } from '../../engine/familyState';
import { GRAND_JURY, OPEN_FILE, stageLabel } from '../../engine/longgame';
import { Relationships } from './Relationships';
import { DatingSection } from '../dating/DatingPanel';
import { BonesFacts } from '../books/BonesFacts';
import { PurseSection } from '../tribute/PurseSection';
import { DirtyOnPerson } from '../econ/DirtyWork';
import { useShell } from '../shell/context';
import { wealthOf } from '../../engine/wealth';
import { useState } from 'react';
import { QuickActions } from '../sheet/QuickActions';
import { AgingSection } from '../sheet/AgingSection';
import { knownOld } from '../../engine/aging';

/** The sheet's tabs. Each wraps existing sections, so a section added to one of them stays in its tab. */
export type SheetTab = 'overview' | 'relationships' | 'work' | 'skills' | 'actions' | 'history';
const SHEET_TABS: [SheetTab, string][] = [['overview', 'Overview'], ['relationships', 'Relationships'], ['work', 'Work & Money'], ['skills', 'Skills'], ['actions', 'Actions'], ['history', 'History']];
import { getSettings } from '../settings';
import { seenWealth } from '../../engine/crewFinance';
import { FinancialLife } from '../sheet/FinancialLife';

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

export function CharacterSheet({ s, id, onClose, embedded, initialTab }: { s: GameState; id: string; onClose: () => void; embedded?: boolean; initialTab?: SheetTab }) {
  const [tab, setTab] = useState<SheetTab>(initialTab ?? 'overview');
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
  const secrets = knownSecrets(s, c.id);
  const hooks = s.hooks.filter((h) => h.holder === 'player' && h.targetId === c.id);
  const showsLife = (c.faction === 'player' || !!c.outside) && !isBoss;
  const shell = useShell();

  return (
    <SheetFrame onClose={onClose} embedded={embedded}>
      <div className="p-4 sm:p-5" data-testid="character-sheet">
        <div className="flex justify-between items-start gap-3">
          <div className="flex gap-3 min-w-0">
            <Portrait c={c} seed={s.seed} date={s.date} size={104} tint={FACTION_TINT[c.faction]} opinion={c.alive && c.faction === 'player' && !isBoss ? total : undefined} />
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
                  {(c.conditions.length > 0 || knownOld(s, c).length > 0) && <span className="text-red-300">{[...c.conditions, ...knownOld(s, c).map((k) => (k.sure ? k.label : `${k.label}?`))].join(', ')}</span>}
                </div>
              )}
              <div className="mt-1.5"><TraitIcons c={c} labels /></div>
            </div>
          </div>
          {!embedded && <button className="btn-ghost text-xs" onClick={onClose}>Close</button>}
        </div>

        {c.alive && !s.gameOver && <QuickActions s={s} c={c} onAll={() => setTab('actions')} />}

        <nav className="mt-3 flex flex-wrap gap-1 border-b border-noir-700 pb-1.5" role="tablist" aria-label={`${c.firstName}'s sheet`} data-testid="sheet-tabs">
          {SHEET_TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`sheet-tab-${k}`}
              className={`rounded px-2 py-1 text-xs font-semibold ${tab === k ? 'bg-gold-500 text-noir-950' : 'border border-noir-600 text-stone-300 hover:border-gold-500'}`}>{label}</button>
          ))}
        </nav>

        {tab === 'skills' && (
          <section className="mt-3 space-y-1.5" data-testid="sheet-skills">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-xs">
              {SKILLS.map((k) => (
                <div key={k} className="rounded bg-noir-800 border border-noir-700 px-2 py-1" title={SKILL_HELP[k]}>
                  <div className="text-stone-500">{SKILL_LABEL[k]}</div>
                  <div className="tabular-nums text-stone-100 text-base font-semibold">{c.attributes[k]}</div>
                </div>
              ))}
            </div>
            <ul className="text-[11px] text-stone-400 space-y-0.5">{SKILLS.map((k) => <li key={k}><span className="text-stone-200">{SKILL_LABEL[k]} {c.attributes[k]}:</span> {SKILL_HELP[k]}</li>)}</ul>
            <div className="mt-1.5"><TraitIcons c={c} labels /></div>
            <ul className="text-[11px] text-stone-500">{c.traits.map((t) => <li key={t}><span className="text-stone-300">{t}:</span> {TRAIT_INFO[t]}</li>)}</ul>
            <AgingSection s={s} c={c} />
          </section>
        )}

        {tab === 'overview' && (
        <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-xs" data-testid="sheet-skill-strip">
          {SKILLS.map((k) => (
            <div key={k} className="rounded bg-noir-800/60 border border-noir-700 px-2 py-0.5" title={SKILL_HELP[k]}>
              <span className="text-stone-500">{SKILL_LABEL[k]}</span> <span className="tabular-nums text-stone-100 font-semibold">{c.attributes[k]}</span>
            </div>
          ))}
        </div>
        )}

        {tab === 'overview' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <section className="rounded-md border border-noir-700 bg-noir-800/50 p-2.5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Particulars</div>
            <div className="text-xs text-stone-300 mt-1 space-y-0.5">
              {!c.goal && <div>Ambition: <span className="text-stone-100">{c.ambition}</span></div>}
              <OwnMoneyLines s={s} c={c} />
              {canHold(s, c) && <div className="pt-1"><div className="text-[10px] uppercase tracking-wider text-stone-500">Steady earner</div><ul className="mt-0.5"><EarnerRow s={s} c={c} /></ul></div>}
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
              <div className="text-xs text-stone-300 mt-1">Respect {s.respect} · Family money {fmt$(s.money)} (the Family's, not yours) · {Object.values(s.characters).filter((x) => x.alive && x.dynasty).length} living members of the house</div>
            </section>
          )}
        </div>
        )}

        {tab === 'overview' && <>
        <DynastyFacts s={s} c={c} />
        <PowerFacts s={s} c={c} />
        {showsLife && <HisLife s={s} c={c} part="life" />}
        </>}

        {tab === 'work' && <>
        <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5 text-xs text-stone-300 space-y-0.5" data-testid="sheet-money">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Money</div>
          <OwnMoneyLines s={s} c={c} />
          {canHold(s, c) && <div className="pt-1"><div className="text-[10px] uppercase tracking-wider text-stone-500">Steady earner</div><ul className="mt-0.5"><EarnerRow s={s} c={c} /></ul></div>}
        </section>
        <BonesFacts s={s} c={c} />
        <PurseSection s={s} c={c} />
        {showsLife && <HisLife s={s} c={c} part="work" />}
        {showsLife && c.faction === 'player' && c.id !== s.playerId && <div className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5"><FinancialLife s={s} c={c} /></div>}
        <PoliticsSection s={s} c={c} />
        </>}

        {tab === 'relationships' && <>
        <FamilySection s={s} id={c.id} />

        <Relationships s={s} c={c} />
        <DatingSection s={s} id={c.id} />

        <section className="mt-3">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Secrets & hooks</div>
          {secrets.length === 0 && hooks.length === 0 && <div className="text-xs text-stone-500 mt-1">Nothing known. Set your consigliere to dig for secrets.</div>}
          <ul className="text-xs mt-1 space-y-0.5">
            {secrets.map((x) => <li key={x.id} className="text-amber-200">Secret: {x.text}.</li>)}
            {hooks.map((h) => <li key={h.id} className={h.strong ? 'text-gold-300' : 'text-stone-300'}>You hold a {h.strong ? 'strong' : 'weak'} hook: {h.reason}{h.strong ? '' : ' (spent when used)'}.</li>)}
          </ul>
        </section>

        <ConnectionsSection s={s} id={c.id} />
        </>}

        {tab === 'history' && <HisHistory s={s} c={c} />}

        {tab === 'actions' && <>
        {c.alive && !s.gameOver && <div className="mt-3 flex flex-wrap gap-2"><TravelButton s={s} charId={c.id} /></div>}
        {c.alive && !s.gameOver && !isBoss && <div className="mt-1.5"><DirtyOnPerson s={s} charId={c.id} onGo={() => { onClose(); shell.go('holdings.dirty'); }} /></div>}
        <InteractionMenu s={s} c={c} />
        </>}
      </div>
    </SheetFrame>
  );
}

/**
 * A man's own money, from the one selector (engine/wealth.ts): the boss's
 * spendable money is his Pocket (the same figure as the top bar); his savings
 * from before the chair and what his things would fetch are shown apart, and
 * add up to his net worth. Family money is never in it.
 */
function OwnMoneyLines({ s, c }: { s: GameState; c: Character }) {
  const w = wealthOf(s, c);
  // A09: another man's money is his private business; the sheet shows what his books explain.
  if (!w.isPocket) return <div>Own money: <span className="text-stone-100" data-testid="sheet-own-money">{seenWealth(s, c, !!getSettings().devIds)}</span></div>;
  return (
    <>
      <div>Your pocket (spendable): <span className="text-stone-100" data-testid="sheet-own-money">{fmt$(w.own)}</span></div>
      {w.savings > 0 && <div className="text-stone-400">Savings put away: <span className="text-stone-200" data-testid="sheet-savings">{fmt$(w.savings)}</span> <span className="text-stone-500">(not in the pocket; passes to your heir)</span></div>}
      {w.possessions > 0 && <div className="text-stone-400">Homes, cars & things: <span className="text-stone-200">{fmt$(w.possessions)}</span> <span className="text-stone-500">(if sold)</span></div>}
      <div className="text-stone-400">Net worth: <span className="text-stone-200" data-testid="sheet-net-worth">{fmt$(w.net)}</span> <span className="text-stone-500">(Family money not included)</span></div>
    </>
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
function HisLife({ s, c, part }: { s: GameState; c: Character; part: 'life' | 'work' }) {
  const k = capoOf(s, c);
  const capoLoy = capoLoyalty(s, c);
  const bossLoy = opinion(s, c.id, s.playerId);
  const men = c.rank === 'capo' ? regime(s, c.id) : [];
  const outside = c.rank === 'capo' ? outsideGuys(s, c.id) : [];
  const kids = c.household?.kids ?? [];
  const warns = warningsFor(s, c);
  const life = part === 'life';
  const work = part === 'work';
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="his-life">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{life ? 'His life' : 'His work'}</div>
      <div className="mt-1 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-xs text-stone-300">
          {c.rank === 'capo' ? (
            <div>Runs a crew of {men.length}{outside.length ? ` and ${outside.length} outside guy${outside.length > 1 ? 's' : ''}` : ''} · kicks up {Math.round((1 - (c.keep ?? 0.3)) * 100)}% · his own money {seenWealth(s, c, !!getSettings().devIds)}</div>
          ) : c.outside ? (
            <div>{OUTSIDE_INFO[c.outside]}{k ? <> for <CharLink s={s} id={k.id} />'s crew</> : ''} · not a member</div>
          ) : (
            <div>{k ? <>In <CharLink s={s} id={k.id} />'s crew</> : 'Reports straight to you'}{c.craft ? ` · ${CRAFT_INFO[c.craft].name}` : ''}</div>
          )}
          {life && c.goal && !(c.dynasty && fam(s, c.id).goal) && <div>Wants to: <span className="text-stone-100">{GOAL_INFO[c.goal].toLowerCase()}</span></div>}
          {work && c.lastEarn !== undefined && <div>Brought in {fmt$(c.lastEarn)} last week · his money {seenWealth(s, c, !!getSettings().devIds)}</div>}
          {work && <div>Record: {c.record ?? 0} arrest{(c.record ?? 0) === 1 ? '' : 's'}</div>}
          {work && <EvidenceLine s={s} c={c} />}
          {life && c.household?.wife && <div>Wife: {c.household.wife}{kids.length ? ` · ${kids.map((x) => `${x.name} (${Math.max(0, s.date.y - x.born)})`).join(', ')}` : ''}</div>}
          {life && !c.household?.wife && kids.length > 0 && <div>Kids: {kids.map((x) => x.name).join(', ')}</div>}
          {life && (c.vices ?? []).length > 0 && <div className="text-amber-200">{(c.vices ?? []).map((v) => VICE_INFO[v]).join('. ')}.</div>}
          {work && (c.arrears ?? 0) > 0 && <div className="text-amber-200">Owes {fmt$(c.arrears ?? 0)} in kick-ups he held back over the winter. He says he'll make it up in the season.</div>}
          {work && c.debtTo && <div className="text-red-300">Owes {fmt$(c.debtTo.amount)} to a {FACTION_NAMES[c.debtTo.rival]} shylock.</div>}
          {life && c.courtedBy && <div className="text-red-300">{FACTION_NAMES[c.courtedBy.rival]} has been courting him since week {c.courtedBy.week}.</div>}
          {life && c.proposedWeek !== undefined && <div className="text-gold-300">Proposed for membership (week {c.proposedWeek}){c.vouchedBy ? <>, vouched for by <CharLink s={s} id={c.vouchedBy} /></> : ''}.</div>}
          {life && c.madeWeek !== undefined && <div className="text-gold-300">Made in week {c.madeWeek}{c.vouchedBy ? <>; <CharLink s={s} id={c.vouchedBy} /> stood for him</> : ''}.</div>}
        </div>
        {life && <div className="space-y-1.5">
          {c.faction === 'player' && <LoyaltyBar label="Loyalty to you" v={bossLoy} />}
          {capoLoy !== undefined && k && <LoyaltyBar label={`Loyalty to ${k.firstName}`} v={capoLoy} />}
          {capoLoy !== undefined && capoLoy > bossLoy + 10 && <div className="text-[11px] text-amber-300">His capo's man first. If {k?.firstName} walks, he follows.</div>}
          {warns.length > 0 && <ul className="text-[11px] text-stone-400">{warns.map((w, i) => <li key={i}>{w.g} {w.label}</li>)}</ul>}
          {men.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">{men.map((m) => <Face key={m.id} s={s} c={m} size={28} />)}</div>
          )}
        </div>}
      </div>
      {work && c.alive && c.faction === 'player' && !s.gameOver && (c.rank === 'soldier' || c.rank === 'associate') && !c.specialty && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {capos(s).filter((x) => x.id !== c.capoId).slice(0, 4).map((x) => <ActionCard key={x.id} s={s} action={{ kind: 'reassign', charId: c.id, capoId: x.id }} compact />)}
          {c.rank === 'associate' && <ActionCard s={s} action={{ kind: 'background', charId: c.id }} compact />}
        </div>
      )}
    </section>
  );
}

/** His story: what happened to him, week by week (the History tab). */
function HisHistory({ s, c }: { s: GameState; c: Character }) {
  const story = (c.story ?? []).slice().reverse();
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="sheet-history">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{c.id === s.playerId ? 'Your chronicle' : 'His chronicle'}</div>
      {c.madeWeek !== undefined && <div className="mt-1 text-xs text-gold-300">Made in week {c.madeWeek}.</div>}
      {!c.alive && c.death && <div className="mt-1 text-xs text-stone-300">Died {formatDate(c.death.date)}: {c.death.cause}.</div>}
      {story.length === 0 ? <p className="mt-1 text-xs text-stone-500">Nothing on record yet. What he does from here is written down here.</p> : (
        <ul className="mt-1 space-y-0.5 text-xs">
          {story.map((e, i) => <li key={i} className="text-stone-300"><span className="text-stone-500 tabular-nums">{formatDate(dateOfWeek(Math.max(1, e.week)))}</span> — {e.text}</li>)}
        </ul>
      )}
    </section>
  );
}
