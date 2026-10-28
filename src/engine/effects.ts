import { applyMenOp, describeMenOp } from './myMen';
import { applyLivingOp, describeLivingOp } from './livingAsk';
import { earnPocket, spendPocket } from './pocket';
import { applyPowerOp, describePowerOp } from './power';
import { applyEconOp, describeEconOp } from './econ';
import { applyTravelOp, describeTravelOp } from './travel';
import { applyNycOp, describeNycOp } from './nyc';
import { applyUnderbelly } from './underbelly';
import { TRIAL_WEEKS, applyLegal } from './longgame';
import { LIFESTYLES, findPerk, perkBlocked } from './lifestyle';
import { crew, displayName, hasTrait, livingDynasty, pickNickname, player } from './characters';
import { killCharacter } from './dynasty';
import { applyDynOp, describeDynOp } from './family';
import { applyPolOp, describePolOp } from './politics';
import { hireFrontMan } from './goals';
import { bookLoan } from './loans';
import { heat, money, respect, type Ctx } from './ledger';
import { addOpinion, changeMeter, opinion, setModifier } from './relations';
import { SEAT_INFO, TASKS } from './council';
import { EDICTS, hireFromPool, POLICY_LABEL } from './crewlife';
import { CAPO_CUT } from './economy';
import { holdVote, openDispute } from './table';
import { CITIES_BY_ID } from './cities';
import { changeScore, endWar, startWar } from './war';
import { chance, randInt } from './rng';
import { FACTION_NAMES } from './world';
import type { Effect, FactionId, GameState, HeatBar, LedgerCategory, ScheduledConsequence } from './types';
import { addEvidence, addStory, assignTo, bumpStat, capoOf, giveBio, GOAL_INFO, tidyRegimes, validCapo } from './hierarchy';
import { voucherBlame } from './regimes';
import { maybePlant } from './rivalcrew';
import { applyStoryOp, describeStoryOp } from './storyOps';
import { applyBonesOp, bonesBlock, describeBonesOp, mayPropose } from './bones';
import { applyLedgerOp, describeLedgerOp } from './ledgerbook';
import { applyTributeOp, describeTributeOp } from './tributeOps';
import { applyEarsOp, describeEarsOp } from './ears';
import { applyDatingOp, describeDatingOp } from './dating';
import { applyNightOp, describeNightOp } from './nightlife';
import { applyBondOp, describeBondOp } from './bonds';
import { applyMinigameEffect, describeMinigame } from './minigame';
import { onArrest } from './trial';

const HEAT_NAMES: Record<HeatBar, string> = { local: 'Local heat', family: 'Family heat', federal: 'Federal heat' };

export function fmtMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/** Human-readable chip for an effect, shown on choice buttons before the player commits. */
export function describeEffect(s: GameState, e: Effect): string | undefined {
  switch (e.type) {
    case 'money':
      return e.pot === 'pocket' ? (e.amount >= 0 ? `+${fmtMoney(e.amount)} to your pocket` : `${fmtMoney(e.amount)} from your pocket`) : e.amount >= 0 ? `+${fmtMoney(e.amount)}` : `${fmtMoney(e.amount)} from the Family`;
    case 'respect':
      return `${signed(e.amount)} Respect`;
    case 'heat':
      return `${signed(e.amount)} ${HEAT_NAMES[e.bar]}`;
    case 'opinion': {
      const c = s.characters[e.from];
      return `${c ? c.firstName + ' ' + c.lastName : '?'} opinion ${signed(e.amount)}`;
    }
    case 'meter': {
      const c = s.characters[e.from];
      return `${c ? c.firstName : '?'} ${e.meter} ${signed(e.amount)}`;
    }
    case 'crewOpinion':
      return `Crew opinion ${signed(e.amount)}${e.traitMods ? '*' : ''}`;
    case 'familyOpinion':
      return `Family opinion ${signed(e.amount)}`;
    case 'rivalOpinion':
      return `${FACTION_NAMES[e.rival]} opinion ${signed(e.amount)}`;
    case 'influence': {
      const d = s.districts.find((x) => x.id === e.district);
      return `${signed(e.amount)} influence in ${d?.name ?? e.district}`;
    }
    case 'schedule':
      return `${Math.round(e.chance * 100)}% chance in ${e.minWeeks}–${e.maxWeeks} wks: ${e.hint}`;
    case 'kill': {
      const c = s.characters[e.charId];
      return `${c ? displayName(c) : '?'} dies`;
    }
    case 'imprison': {
      const c = s.characters[e.charId];
      return `${c ? c.firstName + ' ' + c.lastName : '?'} jailed ${e.weeks} wks`;
    }
    case 'recruit': {
      const c = s.characters[e.charId];
      return `${c ? c.firstName + ' ' + c.lastName : '?'} joins the crew`;
    }
    case 'rank': {
      const c = s.characters[e.charId];
      return `${c ? c.firstName : '?'} becomes ${e.rank}`;
    }
    case 'health':
      return `Health ${signed(e.amount)}`;
    case 'debt':
      return `Loan ${fmtMoney(e.principal)}, repay ${fmtMoney(e.weeklyPayment)}/wk × ${e.weeks}`;
    case 'skimReset':
      return 'Skimming stops';
    case 'addBusiness':
      return `New: ${e.business.name}`;
    case 'closeBusiness':
      return `Business closed ${e.weeks} wks`;
    case 'flag':
      return undefined;
    case 'removeBusiness': {
      const b = s.businesses.find((x) => x.id === e.businessId);
      return `Close ${b?.name ?? 'business'}`;
    }
    case 'loan':
      return `New borrower: ~${fmtMoney(Math.round(e.amount * 0.05))}/wk vig`;
    case 'frontMan':
      return 'A clean front man joins';
    case 'favor':
      return `${signed(e.amount)} Political favor${Math.abs(e.amount) === 1 ? '' : 's'}`;
    case 'goal':
      return e.key === 'bank' ? 'Bank chartered' : e.key === 'land' ? 'Land optioned in Atlantic City' : e.key === 'sellLand' ? 'Land sold' : 'License application filed';
    case 'exile': {
      const c = s.characters[e.charId];
      return `${c ? c.firstName + ' ' + c.lastName : '?'} leaves Wildwood`;
    }
    case 'seat': {
      const c = e.charId ? s.characters[e.charId] : undefined;
      return e.charId !== undefined ? `${c ? c.firstName + ' ' + c.lastName : 'Nobody'} → ${SEAT_INFO[e.seat].name}` : `${SEAT_INFO[e.seat].name}: ${e.task ? TASKS[e.task].name : ''}`;
    }
    case 'underbelly':
      return e.op === 'exposure' ? `+${e.amount ?? 0} proof against the Harbor Crew` : e.op === 'strength' ? `${(e.amount ?? 0) <= 0 ? '−' : '+'}${Math.abs(e.amount ?? 0)} Harbor Crew strength` : e.op === 'ally' ? 'Allies against the Harbor Crew' : e.op === 'expose' ? 'The Harbor Crew exposed (−60 strength)' : `Harbor Crew run off (−${e.amount ?? 0} strength)`;
    case 'legal':
      return e.op === 'defense' ? `${(e.amount ?? 0) >= 0 ? '+' : '−'}${Math.abs(e.amount ?? 0)} defense` : e.op === 'evidence' ? `${(e.amount ?? 0) <= 0 ? '−' : '+'}${Math.abs(e.amount ?? 0)} evidence against you` : e.op === 'bail' ? 'Out on bail' : e.op === 'jail' ? 'Waits for trial in a cell' : e.op === 'plea' ? 'Prison (a shorter stretch)' : e.op === 'fight' ? `Trial in ${TRIAL_WEEKS} weeks` : e.op === 'verdict' ? 'The jury decides' : `Parole odds ${(e.amount ?? 0) >= 0 ? '+' : '−'}${Math.abs(e.amount ?? 0)}`;
    case 'lifestyle':
      return `Lifestyle: ${LIFESTYLES[e.focus].name}`;
    case 'perk':
      return `Learn ${findPerk(e.perk)?.name ?? '?'} — ${findPerk(e.perk)?.text ?? ''}`;
    case 'policy': {
      const c = s.characters[e.charId];
      return `${c?.firstName ?? '?'}: ${POLICY_LABEL[e.policy]}`;
    }
    case 'contract': {
      const c = s.characters[e.charId];
      return `${c?.firstName ?? '?'} keeps ${Math.round(e.keep * 100)}% of his district`;
    }
    case 'edict':
      return `${e.on ? 'Proclaim' : 'Revoke'}: ${EDICTS[e.edict].name}`;
    case 'hire': {
      const h = s.hirePool.find((x) => x.id === e.specId);
      return h ? `${h.firstName} ${h.lastName} joins${h.kind !== 'recruit' ? ` (${h.kind}, ${fmtMoney(h.fee)}/wk)` : ''}` : 'Hire';
    }
    case 'attention':
      return undefined;
    case 'hook': {
      const c = s.characters[e.targetId];
      return e.spend ? `Spend your hook on ${c?.firstName ?? '?'}` : `${e.strong ? 'Strong' : 'Weak'} hook on ${c ? c.firstName + ' ' + c.lastName : '?'}`;
    }
    case 'secretKnown':
      return 'You learn a secret';
    case 'startScheme':
      return `Scheme begins: ${e.scheme.kind}`;
    case 'endScheme':
      return 'The scheme ends';
    case 'claim': {
      const d = s.districts.find((x) => x.id === e.district);
      return `Claim on ${d?.name ?? e.district}`;
    }
    case 'feud':
      return `Blood feud with ${FACTION_NAMES[e.rival]}`;
    case 'permit':
      return `Philadelphia's blessing for ${CITIES_BY_ID[e.city]?.name ?? e.city}`;
    case 'standing':
      return `${signed(e.amount)} standing in ${CITIES_BY_ID[e.city]?.name ?? e.city}`;
    case 'warStart': {
      const d = s.districts.find((x) => x.id === e.district);
      return `War with ${FACTION_NAMES[e.rival]} over ${d?.name ?? e.district}${e.sanctioned ? '' : ' (unsanctioned)'}`;
    }
    case 'warScore':
      return `${signed(e.amount)} war score`;
    case 'warEnd':
      return e.outcome === 'won' ? 'They give in' : e.outcome === 'lost' ? 'You give in' : 'White peace';
    case 'dispute':
      return `Dispute at the Table: ${e.dispute.kind}`;
    case 'lobby': {
      const c = s.characters[e.memberId];
      return `+${e.amount} ${c?.firstName ?? '?'}'s vote`;
    }
    case 'plea':
      return undefined;
    case 'sanction': {
      const c = s.characters[e.targetId];
      return `Table sanctions a hit on ${c ? c.firstName + ' ' + c.lastName : '?'}`;
    }
    case 'ruling':
      return e.comply ? undefined : 'Defy the Table';
    case 'faction':
      return 'The faction breaks up';
    case 'wealth': {
      const c = s.characters[e.charId];
      return `${c ? c.firstName : '?'}'s own money ${e.amount >= 0 ? '+' : '−'}${fmtMoney(Math.abs(e.amount))}`;
    }
    case 'loanResolve': {
      const l = s.loans.find((x) => x.id === e.loanId);
      const amt = l ? fmtMoney(l.principal) : '';
      return e.mode === 'collect' ? `60%: recover ${amt}` : e.mode === 'grace' ? 'Payments resume later' : `Lose ${amt}`;
    }
    case 'unwashed':
      return `${e.amount < 0 ? 'Washes' : 'Adds'} ${fmtMoney(Math.abs(e.amount))} ${e.amount < 0 ? 'of' : ''} dirty cash`.replace('  ', ' ');
    case 'dyn':
      return describeDynOp(s, e.op);
    case 'power':
      return describePowerOp(s, e.op);
    case 'storyOp':
      return describeStoryOp(s, e.op);
    case 'pol':
      return describePolOp(s, e.op);
    case 'econ':
      return describeEconOp(s, e.op);
    case 'living':
      return describeLivingOp(s, e.op);
    case 'travel':
      return describeTravelOp(s, e.op);
    case 'nyc':
      return describeNycOp(e.op);
    case 'bones':
      return describeBonesOp(s, e.op);
    case 'ledger':
      return describeLedgerOp(s, e.op);
    case 'tribute':
      return describeTributeOp(s, e.op);
    case 'ears':
      return describeEarsOp(s, e.op);
    case 'dating':
      return describeDatingOp(s, e.op);
    case 'nightlife':
      return describeNightOp(s, e.op);
    case 'bond':
      return describeBondOp(s, e.op);
    case 'mymen':
      return describeMenOp(s, e.op);
    case 'evidence': {
      const c = s.characters[e.charId];
      if (!c) return undefined;
      return `${c.id === s.playerId ? 'Your' : `${c.firstName}'s`} evidence file ${signed(e.amount)}`;
    }
    case 'assign': {
      const c = s.characters[e.charId];
      const k = e.capoId ? s.characters[e.capoId] : undefined;
      return `${c?.firstName ?? '?'} → ${k ? `${k.firstName}'s crew` : 'reports to you'}`;
    }
    case 'story':
      return undefined;
    case 'propose': {
      const c = s.characters[e.charId];
      return `${c?.firstName ?? '?'}'s name goes to Philadelphia`;
    }
    case 'making': {
      const c = s.characters[e.charId];
      return `${c?.firstName ?? '?'} becomes a made man`;
    }
    case 'courted':
      return e.rival ? `${FACTION_NAMES[e.rival]} keeps courting him` : undefined;
    case 'debtTo':
      return 'Debt cleared';
    case 'household':
      return e.wife ? undefined : e.kid ? `A new ${e.kid.male ? 'son' : 'daughter'}` : undefined;
    case 'goalSet':
      return e.goal ? `Now wants: ${GOAL_INFO[e.goal].toLowerCase()}` : undefined;
    case 'flip': {
      const c = s.characters[e.charId];
      return `${c?.firstName ?? '?'} turns state's witness`;
    }
    case 'retire': {
      const c = s.characters[e.charId];
      return `${c?.firstName ?? '?'} retires`;
    }
    case 'faction2':
      return e.op === 'remove' ? 'One fewer in the faction' : undefined;
    case 'checkBackground':
      return 'Results in 2 weeks';
    case 'minigame':
      return describeMinigame(e);
    case 'rivalResource': {
      const parts: string[] = [];
      if (e.muscle) parts.push(`muscle ${signed(e.muscle)}`);
      if (e.money) parts.push(`money ${fmtMoney(e.money)}`);
      if (e.exposure) parts.push(`exposure ${signed(e.exposure)}`);
      return `${FACTION_NAMES[e.rival]} ${parts.join(', ')}`;
    }
  }
}

/** Change a faction's influence in a district; gains come out of 'none' first, then other factions proportionally. */
export function shiftInfluence(s: GameState, districtId: string, faction: FactionId, amount: number): number {
  const d = s.districts.find((x) => x.id === districtId);
  if (!d) return 0;
  const cur = d.influence[faction] ?? 0;
  if (amount < 0) {
    const loss = Math.min(cur, -amount);
    d.influence[faction] = cur - loss;
    d.influence.none = (d.influence.none ?? 0) + loss;
    return -loss;
  }
  let need = Math.min(amount, 100 - cur);
  let gained = 0;
  const neutral = d.influence.none ?? 0;
  const fromNeutral = Math.min(neutral, need);
  d.influence.none = neutral - fromNeutral;
  gained += fromNeutral;
  need -= fromNeutral;
  if (need > 0) {
    const others = (Object.keys(d.influence) as FactionId[]).filter((f) => f !== faction && f !== 'none' && (d.influence[f] ?? 0) > 0);
    const total = others.reduce((a, f) => a + (d.influence[f] ?? 0), 0);
    if (total > 0) {
      let taken = 0;
      for (const f of others) {
        const share = Math.min(d.influence[f] ?? 0, Math.round((need * (d.influence[f] ?? 0)) / total));
        d.influence[f] = (d.influence[f] ?? 0) - share;
        taken += share;
      }
      gained += taken;
    }
  }
  d.influence[faction] = cur + gained;
  return gained;
}

export interface EffectSource {
  /** Label prefix used for ledger lines, e.g. "Sit-down: Pay off the beat cops". */
  label: string;
  /** "because you ..." phrase for scheduled consequences. */
  because: string;
  category?: LedgerCategory;
}

export function scheduleConsequence(
  s: GameState,
  key: string,
  minWeeks: number,
  maxWeeks: number,
  because: string,
  params: Record<string, string | number> = {},
): ScheduledConsequence {
  const sc: ScheduledConsequence = {
    id: `sc${s.nextId++}`,
    key,
    dueWeek: s.week + randInt(s, Math.max(1, minWeeks), Math.max(minWeeks, maxWeeks)),
    because,
    sourceWeek: s.week,
    params,
  };
  s.scheduled.push(sc);
  return sc;
}

export function applyEffects(ctx: Ctx, effects: readonly Effect[], src: EffectSource): void {
  for (const e of effects) applyEffect(ctx, e, src);
}

export function applyEffect(ctx: Ctx, e: Effect, src: EffectSource): void {
  const s = ctx.s;
  const cat = src.category ?? 'event';
  const label = e.label ?? src.label;
  const boss = player(s);
  switch (e.type) {
    case 'money':
      if (e.pot === 'pocket') {
        if (e.amount < 0) spendPocket(ctx, -e.amount, label, 'fx');
        else earnPocket(ctx, e.amount, label, 'fx');
      } else money(ctx, e.amount, label, e.category ?? cat);
      break;
    case 'respect':
      respect(ctx, e.amount, label, cat);
      break;
    case 'heat':
      heat(ctx, e.bar, e.amount, label, cat);
      break;
    case 'opinion':
      if (s.characters[e.from]?.alive && s.characters[e.to]?.alive) addOpinion(s, e.from, e.to, e.reason, e.amount, e.decay);
      break;
    case 'meter':
      changeMeter(s, e.from, e.to, e.meter, e.amount);
      break;
    case 'crewOpinion':
      for (const m of crew(s)) {
        let v = e.amount;
        if (e.traitMods) for (const [t, bonus] of Object.entries(e.traitMods)) if (hasTrait(m, t as never)) v += bonus ?? 0;
        addOpinion(s, m.id, boss.id, e.reason, v);
      }
      break;
    case 'familyOpinion':
      for (const m of livingDynasty(s)) if (m.id !== boss.id) addOpinion(s, m.id, boss.id, e.reason, e.amount);
      break;
    case 'rivalOpinion': {
      const r = s.rivals.find((x) => x.id === e.rival);
      if (r && s.characters[r.leaderId]?.alive) {
        addOpinion(s, r.leaderId, boss.id, e.reason, e.amount, e.amount < 0 ? 1 : 2);
        if (e.amount < 0) changeMeter(s, r.leaderId, boss.id, 'grievance', Math.round(-e.amount / 2));
      }
      break;
    }
    case 'influence':
      shiftInfluence(s, e.district, e.faction, e.amount);
      break;
    case 'schedule':
      if (chance(s, e.chance)) scheduleConsequence(s, e.key, e.minWeeks, e.maxWeeks, src.because, e.params ?? {});
      break;
    case 'kill':
      killCharacter(ctx, e.charId, e.cause, e.killer);
      break;
    case 'imprison': {
      const c = s.characters[e.charId];
      if (c?.alive && c.id !== s.playerId) {
        c.imprisonedUntil = s.week + e.weeks;
        for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
        ctx.log.push(`${displayName(c)} is in county lockup for ${e.weeks} weeks.`);
        onArrest(s, c, e.weeks);
      }
      break;
    }
    case 'recruit': {
      const c = s.characters[e.charId];
      // Stale events (raised before a succession) must never demote the new boss.
      if (c?.alive && c.id !== s.playerId) {
        c.faction = 'player';
        if (c.rank === 'civilian') c.rank = 'associate';
        // Someone coming back may find his old nickname taken by a newer man.
        if (c.nickname && Object.values(s.characters).some((o) => o.id !== c.id && o.alive && o.faction === 'player' && o.nickname === c.nickname)) c.nickname = pickNickname(s, 'player');
        if (!c.dynasty) {
          giveBio(s, c);
          maybePlant(s, c);
        }
        if (!c.story?.length) addStory(s, c, 'Came into the family as an associate.');
        tidyRegimes(s);
        ctx.log.push(`${displayName(c)} is with us now.`);
      }
      break;
    }
    case 'evidence': {
      const c = s.characters[e.charId];
      if (c?.alive) addEvidence(s, c, e.amount);
      break;
    }
    case 'assign': {
      const c = s.characters[e.charId];
      if (c?.alive && c.faction === 'player' && c.id !== s.playerId && (c.rank === 'soldier' || c.rank === 'associate')) {
        const k = validCapo(s, e.capoId);
        const prev = capoOf(s, c);
        assignTo(s, c, k?.id, k ? `Moved to ${displayName(k)}'s crew.` : 'Reports straight to the boss now.');
        if (prev && prev.id !== k?.id) addOpinion(s, prev.id, boss.id, `Took ${c.firstName} out of my crew`, -6, 1);
        if (k && prev?.id !== k.id) addOpinion(s, k.id, boss.id, 'Gave me another man', 4, 1);
        if (prev && k && prev.id !== k.id) addOpinion(s, c.id, boss.id, opinion(s, c.id, prev.id) > opinion(s, c.id, k.id) ? 'Moved me away from my capo' : 'Moved me to a better crew', opinion(s, c.id, prev.id) > opinion(s, c.id, k.id) ? -6 : 4, 1);
      }
      break;
    }
    case 'story': {
      const c = s.characters[e.charId];
      if (c) addStory(s, c, e.text);
      break;
    }
    case 'propose': {
      const c = s.characters[e.charId];
      const v = s.characters[e.voucherId];
      if (c?.alive && c.rank === 'associate' && c.faction === 'player' && c.proposedWeek === undefined && !mayPropose(s, c)) {
        ctx.log.push(`Philadelphia wants to know what he ever did for this thing of ours: ${bonesBlock(s, c)}.`);
      } else if (c?.alive && c.rank === 'associate' && c.faction === 'player' && c.proposedWeek === undefined) {
        c.proposedWeek = s.week;
        c.vouchedBy = v?.alive ? v.id : undefined;
        addStory(s, c, `${v ? displayName(v) : 'The boss'} put his name up for membership.`);
        if (v) addStory(s, v, `Vouched for ${displayName(c)}.`);
        ctx.log.push(`${displayName(c)}'s name goes to Philadelphia${s.books?.open ? '' : ' (the books are closed — he waits)'}.`);
      }
      break;
    }
    case 'making': {
      const c = s.characters[e.charId];
      if (c?.alive && c.faction === 'player' && c.rank === 'associate') {
        c.rank = 'soldier';
        c.madeWeek = s.week;
        c.proposedWeek = undefined;
        c.goal = c.goal === 'get_made' ? (c.attributes.leadership >= 55 ? 'become_capo' : 'get_rich') : c.goal;
        addOpinion(s, c.id, boss.id, 'Made me', 25, 0);
        changeMeter(s, c.id, boss.id, 'trust', 15);
        const v = c.vouchedBy ? s.characters[c.vouchedBy] : undefined;
        if (v?.alive) addOpinion(s, c.id, v.id, 'Stood for me at my making', 15, 0);
        for (const m of crew(s)) if (m.id !== c.id) addOpinion(s, m.id, boss.id, 'Rewards loyalty', 1, 1);
        respect(ctx, 1, label, cat);
        if (s.books) s.books.slots = Math.max(0, s.books.slots - 1);
        bumpStat(s, 'makings');
        addStory(s, c, 'Took the oath and became a made man.');
        if (s.cutscenes.length < 2) s.cutscenes.push({ key: 'made_man', title: 'The ceremony', text: `A pricked finger, a burning saint, the back room of the Bolero. ${displayName(c)} is a made man.`, week: s.week });
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} was made in the back room of the Bolero.`, kind: 'family' });
      }
      break;
    }
    case 'courted': {
      const c = s.characters[e.charId];
      if (c) c.courtedBy = e.rival ? { rival: e.rival, week: c.courtedBy?.week ?? s.week } : undefined;
      break;
    }
    case 'debtTo': {
      const c = s.characters[e.charId];
      if (c) c.debtTo = undefined;
      break;
    }
    case 'household': {
      const c = s.characters[e.charId];
      if (!c) break;
      const h = c.household ?? (c.household = { kids: [] });
      if (e.wife) h.wife = e.wife;
      if (e.kid) h.kids.push({ name: e.kid.name, male: e.kid.male, born: s.date.y });
      break;
    }
    case 'goalSet': {
      const c = s.characters[e.charId];
      if (c) c.goal = e.goal;
      break;
    }
    case 'flip': {
      const c = s.characters[e.charId];
      if (!c?.alive || c.faction !== 'player' || c.id === s.playerId) break;
      const k = capoOf(s, c);
      c.faction = 'law';
      c.rank = 'civilian';
      c.capoId = undefined;
      c.imprisonedUntil = undefined;
      c.courtedBy = undefined;
      for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
      for (const b of s.businesses) if (b.staffIds) b.staffIds = b.staffIds.filter((id) => id !== c.id);
      addEvidence(s, boss, 18);
      if (k) addEvidence(s, k, 15);
      heat(ctx, 'federal', 8, `${displayName(c)} is talking to the Prosecutor`, cat);
      addOpinion(s, boss.id, c.id, 'Rat', -60, 0);
      for (const m of crew(s)) addOpinion(s, m.id, c.id, 'Rat', -40, 0);
      addStory(s, c, 'Turned state\'s witness. The FBI moved his family off the island.');
      bumpStat(s, 'flips');
      voucherBlame(ctx, c, 'turned rat');
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} became a government witness.`, kind: 'heat' });
      tidyRegimes(s);
      break;
    }
    case 'retire': {
      const c = s.characters[e.charId];
      if (!c?.alive || c.faction !== 'player' || c.id === s.playerId) break;
      c.faction = 'none';
      c.rank = 'civilian';
      c.capoId = undefined;
      c.goal = undefined;
      for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
      for (const b of s.businesses) if (b.staffIds) b.staffIds = b.staffIds.filter((id) => id !== c.id);
      addOpinion(s, c.id, boss.id, 'Let me go in peace', 20, 0);
      addStory(s, c, 'Retired from the life.');
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} retired from the family.`, kind: 'misc' });
      tidyRegimes(s);
      break;
    }
    case 'faction2': {
      const f = s.factions.find((x) => x.id === e.factionId);
      if (!f) break;
      if (e.op === 'remove' && e.memberId) {
        f.memberIds = f.memberIds.filter((id) => id !== e.memberId);
        if (f.memberIds.length < 2 || !f.memberIds.includes(f.leaderId)) s.factions = s.factions.filter((x) => x !== f);
      } else if (e.op === 'stage') {
        f.stage = (f.stage ?? 0) + 1;
        f.stageWeek = s.week;
      }
      break;
    }
    case 'checkBackground': {
      const c = s.characters[e.charId];
      if (c?.alive) scheduleConsequence(s, 'background_result', 2, 2, src.because, { charId: c.id });
      break;
    }
    case 'rank': {
      const c = s.characters[e.charId];
      if (c?.alive && c.id !== s.playerId) {
        const was = c.rank;
        c.rank = e.rank;
        if (e.district) {
          const d = s.districts.find((x) => x.id === e.district);
          if (d) d.capoId = c.id;
        }
        if (was !== e.rank) addStory(s, c, `Became ${e.rank === 'associate' ? 'an associate' : `${e.rank === 'underboss' ? 'the underboss' : `a ${e.rank}`}`}${was !== 'civilian' ? ` (was ${was})` : ''}.`);
        tidyRegimes(s);
      }
      break;
    }
    case 'health': {
      const c = s.characters[e.charId];
      if (c?.alive) c.health = Math.max(0, Math.min(100, c.health + e.amount));
      break;
    }
    case 'debt':
      money(ctx, e.principal, e.label ?? `Loan from ${e.lender}`, 'debt');
      s.debts.push({ id: `d${s.nextId++}`, lender: e.lender, principal: e.principal, weeklyPayment: e.weeklyPayment, weeksLeft: e.weeks });
      break;
    case 'skimReset': {
      const c = s.characters[e.charId];
      if (c) {
        c.wealth = Math.max(0, c.wealth - Math.round((c.skimmed ?? 0) / 2));
        c.skimmed = 0;
      }
      break;
    }
    case 'addBusiness': {
      const b = { ...e.business, staffIds: [...(e.business.staffIds ?? [])] };
      if (!b.id) b.id = `b${s.nextId++}`;
      if (b.boughtWeek === undefined) b.boughtWeek = s.week;
      s.businesses.push(b);
      ctx.log.push(`${b.name} is ours now.`);
      break;
    }
    case 'removeBusiness':
      s.businesses = s.businesses.filter((b) => b.id !== e.businessId);
      break;
    case 'loan':
      bookLoan(s, e.amount);
      break;
    case 'frontMan':
      hireFrontMan(ctx);
      break;
    case 'favor':
      s.favors = Math.max(0, s.favors + e.amount);
      break;
    case 'goal':
      if (e.key === 'bank') s.goals.bankWeek = s.week;
      else if (e.key === 'land') s.goals.casinoStage = 1;
      else if (e.key === 'sellLand') {
        s.goals.casinoStage = 0;
        s.goals.landSold = true;
      } else {
        s.goals.casinoStage = 2;
        s.goals.casinoSince = s.week;
      }
      break;
    case 'seat': {
      const seat = s.council[e.seat];
      if (e.task) {
        seat.task = e.task;
        seat.target = e.target;
      }
      if (e.charId !== undefined) {
        const prev = seat.holderId ? s.characters[seat.holderId] : undefined;
        const c = e.charId ? s.characters[e.charId] : undefined;
        if (prev && prev.alive && prev.id !== e.charId) {
          addOpinion(s, prev.id, boss.id, 'Took my seat away', -15, 1);
          if (prev.rank === 'underboss' || prev.rank === 'consigliere') prev.rank = 'soldier';
        }
        // A man holds one seat at a time.
        for (const st of Object.keys(s.council) as (keyof typeof s.council)[]) if (s.council[st].holderId === e.charId) s.council[st].holderId = undefined;
        seat.holderId = c?.alive ? c.id : undefined;
        if (c?.alive) {
          if (e.seat === 'underboss' || e.seat === 'consigliere') {
            for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
            c.rank = e.seat;
          }
          addOpinion(s, c.id, boss.id, 'Gave me a seat at the table', 15, 1);
          c.neglect = 0;
          c.defectStage = 0;
        }
      }
      break;
    }
    case 'legal':
      applyLegal(ctx, e.op, e.amount);
      break;
    case 'underbelly':
      applyUnderbelly(ctx, e.op, e.amount, e.rival);
      break;
    case 'lifestyle': {
      const b = s.characters[s.playerId];
      if (!b) break;
      b.lifestyle = { focus: e.focus, xp: 0, points: b.lifestyle?.points ?? 0, perks: b.lifestyle?.perks ?? [] };
      break;
    }
    case 'perk': {
      const b = s.characters[s.playerId];
      if (!b?.lifestyle || perkBlocked(b, e.perk)) break;
      b.lifestyle.points -= 1;
      b.lifestyle.perks.push(e.perk);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${b.firstName} ${b.lastName} learned ${findPerk(e.perk)?.name}.`, kind: 'misc' });
      break;
    }
    case 'policy': {
      const c = s.characters[e.charId];
      if (c) c.policy = e.policy;
      break;
    }
    case 'contract': {
      const c = s.characters[e.charId];
      if (!c) break;
      c.keep = e.keep;
      setModifier(s, c.id, boss.id, 'My contract', Math.round((e.keep - CAPO_CUT) * 200));
      break;
    }
    case 'edict':
      s.edicts[e.edict] = e.on;
      if (e.edict === 'nojunk') {
        const r = s.rivals.find((x) => x.id === 'philly');
        if (r) setModifier(s, r.leaderId, boss.id, 'Keeps junk out of Wildwood', e.on ? 10 : 0);
      }
      break;
    case 'hire':
      hireFromPool(ctx, e.specId);
      break;
    case 'attention': {
      const c = s.characters[e.charId];
      if (c) {
        c.neglect = 0;
        c.defectStage = 0;
      }
      break;
    }
    case 'faction':
      s.factions = s.factions.filter((f) => f.id !== e.factionId);
      break;
    case 'hook':
      if (e.spend) {
        const h = s.hooks.find((x) => x.holder === 'player' && x.targetId === e.targetId && !x.strong) ?? s.hooks.find((x) => x.holder === 'player' && x.targetId === e.targetId);
        if (h && !h.strong) s.hooks = s.hooks.filter((x) => x !== h);
        else if (h) h.usedWeek = s.week;
      } else if (!s.hooks.some((x) => x.holder === 'player' && x.targetId === e.targetId && x.strong === e.strong)) {
        s.hooks.push({ id: `k${s.nextId++}`, holder: 'player', targetId: e.targetId, strong: e.strong, reason: e.reason, week: s.week });
      }
      break;
    case 'secretKnown': {
      const sec = s.secrets.find((x) => x.id === e.secretId);
      if (sec && !sec.knownBy.includes('player')) sec.knownBy.push('player');
      break;
    }
    case 'startScheme':
      s.schemes.push({ ...e.scheme, id: `sc${s.nextId++}`, progress: 0, startWeek: s.week, discovered: false });
      break;
    case 'endScheme':
      s.schemes = s.schemes.filter((x) => x.id !== e.schemeId);
      break;
    case 'claim':
      if (!s.claims.some((c) => c.district === e.district && c.against === e.against)) s.claims.push({ district: e.district, against: e.against, week: s.week, reason: e.reason });
      break;
    case 'permit':
      s.permits[e.city] = s.week + e.weeks;
      break;
    case 'standing':
      s.cityStanding[e.city] = Math.max(-100, Math.min(100, (s.cityStanding[e.city] ?? 0) + e.amount));
      break;
    case 'warStart':
      startWar(ctx, e.rival, e.district, e.cb, e.sanctioned);
      break;
    case 'warScore':
      changeScore(s, e.warId, e.amount);
      break;
    case 'warEnd': {
      const w = s.wars.find((x) => x.id === e.warId);
      if (w) endWar(ctx, w, e.outcome, e.terms);
      break;
    }
    case 'dispute': {
      const d = openDispute(s, e.dispute);
      ctx.log.push(`A dispute goes before the Table in ${d.hearingWeek - s.week} weeks: ${d.claim}`);
      break;
    }
    case 'lobby': {
      const d = s.disputes.find((x) => x.id === e.disputeId);
      if (d) d.lobby[e.memberId] = (d.lobby[e.memberId] ?? 0) + e.amount;
      break;
    }
    case 'plea': {
      const d = s.disputes.find((x) => x.id === e.disputeId);
      if (d && !d.ruling) {
        d.plea = e.amount;
        holdVote(ctx, d);
      }
      break;
    }
    case 'sanction':
      s.sanctions[e.targetId] = s.week + e.weeks;
      break;
    case 'ruling': {
      const d = s.disputes.find((x) => x.id === e.disputeId);
      if (d) {
        if (!d.ruling) d.ruling = { forPlayer: false, votes: {}, week: s.week };
        if (!e.comply) {
          const r = s.rivals.find((x) => x.id === d.plaintiff);
          if (r && r.kind === 'mob' && !r.feud) applyEffect(ctx, { type: 'feud', rival: r.id }, src);
        }
      }
      break;
    }
    case 'feud': {
      const r = s.rivals.find((x) => x.id === e.rival);
      if (r && !r.feud) {
        r.feud = true;
        addOpinion(s, r.leaderId, boss.id, 'Blood feud', -40, 0);
        ctx.log.push(`${r.name} has sworn a blood feud against your house.`);
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${r.name} swore a blood feud against the house.`, kind: 'rival' });
      }
      break;
    }
    case 'exile': {
      const c = s.characters[e.charId];
      if (!c?.alive || c.id === s.playerId) break;
      c.faction = 'none';
      c.rank = 'civilian';
      for (const d of s.districts) if (d.capoId === c.id) d.capoId = undefined;
      for (const b of s.businesses) if (b.staffIds) b.staffIds = b.staffIds.filter((id) => id !== c.id);
      addOpinion(s, c.id, s.playerId, 'Exiled me from Wildwood', -40, 0);
      changeMeter(s, c.id, s.playerId, 'grievance', 40);
      ctx.log.push(`${displayName(c)} packed a suitcase and left the island.`);
      break;
    }
    case 'wealth': {
      const c = s.characters[e.charId];
      if (c) c.wealth = Math.max(0, c.wealth + e.amount);
      break;
    }
    case 'loanResolve': {
      const l = s.loans.find((x) => x.id === e.loanId);
      if (!l) break;
      const who = l.borrower.split(',')[0];
      if (e.mode === 'grace') {
        l.weeksLate = 0;
        l.dueWeek += 4;
        break;
      }
      s.loans = s.loans.filter((x) => x !== l);
      if (e.mode === 'collect') {
        if (chance(s, 0.6)) money(ctx, l.principal, `Collector: ${who} found the money after all`, 'event');
        else ctx.log.push(`The collector came back empty-handed from ${who}. The debt is written off.`);
      }
      break;
    }
    case 'unwashed':
      s.unwashed = Math.max(0, Math.min(Math.max(0, s.money), s.unwashed + e.amount));
      break;
    case 'closeBusiness': {
      const b = s.businesses.find((x) => x.id === e.businessId);
      if (b) b.closedUntil = s.week + e.weeks;
      break;
    }
    case 'flag':
      s.flags[e.key] = (s.flags[e.key] ?? 0) + e.value;
      break;
    case 'dyn':
      applyDynOp(ctx, e.op, label);
      break;
    case 'power':
      applyPowerOp(ctx, e.op, label);
      break;
    case 'storyOp':
      applyStoryOp(ctx, e.op);
      break;
    case 'pol':
      applyPolOp(ctx, e.op, label);
      break;
    case 'minigame':
      applyMinigameEffect(ctx, e);
      break;
    case 'econ':
      applyEconOp(ctx, e.op, label);
      break;
    case 'living':
      applyLivingOp(ctx, e.op);
      break;
    case 'travel':
      applyTravelOp(ctx, e.op, label);
      break;
    case 'nyc':
      applyNycOp(ctx, e.op);
      break;
    case 'bones':
      applyBonesOp(ctx, e.op, label);
      break;
    case 'ledger':
      applyLedgerOp(ctx, e.op, label);
      break;
    case 'tribute':
      applyTributeOp(ctx, e.op, label);
      break;
    case 'ears':
      applyEarsOp(ctx, e.op, label);
      break;
    case 'nightlife':
      applyNightOp(ctx, e.op);
      break;
    case 'dating':
      applyDatingOp(ctx, e.op);
      break;
    case 'bond':
      applyBondOp(ctx, e.op);
      break;
    case 'mymen':
      applyMenOp(ctx, e.op, label);
      break;
    case 'rivalResource': {
      const r = s.rivals.find((x) => x.id === e.rival);
      if (r) {
        if (e.money) r.money = Math.max(0, r.money + e.money);
        if (e.muscle) r.muscle = Math.max(0, Math.min(100, r.muscle + e.muscle));
        if (e.exposure) r.exposure = Math.max(0, Math.min(100, r.exposure + e.exposure));
      }
      break;
    }
  }
}
