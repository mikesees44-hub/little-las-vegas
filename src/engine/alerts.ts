import { owned, staffFactor } from './business';
import { capos, crew, displayName, isFree, player } from './characters';
import { chooseHeir } from './dynasty';
import { UNWASHED_SAFE } from './economy';
import { opinion } from './relations';
import { getRelation } from './relations';
import type { GameState } from './types';

/**
 * The alert rail (CK's right-hand icons): things that need the boss's
 * attention. Pure, derived from the state each render.
 */
export type AlertKind = 'unhappy' | 'defector' | 'heat' | 'money' | 'heir' | 'loan' | 'staff' | 'decision' | 'scheme' | 'dispute' | 'war' | 'family';

export interface Alert {
  kind: AlertKind;
  severity: 'info' | 'warn' | 'danger';
  title: string;
  text: string;
  /** Character to open, if any. */
  charId?: string;
  /** UI tab to open, if any. */
  tab?: string;
}

export function alerts(s: GameState): Alert[] {
  const out: Alert[] = [];
  if (s.gameOver) return out;
  const boss = player(s);
  if (s.pendingEvents.length) out.push({ kind: 'decision', severity: 'info', title: `${s.pendingEvents.length} decision${s.pendingEvents.length > 1 ? 's' : ''} waiting`, text: s.pendingEvents.map((e) => e.title).join(' · ') });
  for (const c of capos(s)) {
    const op = opinion(s, c.id, boss.id);
    if (op <= -20 && isFree(s, c)) out.push({ kind: 'unhappy', severity: op <= -40 ? 'danger' : 'warn', title: `${c.firstName} is unhappy`, text: `${displayName(c)} (capo) thinks ${op} of you.`, charId: c.id });
  }
  for (const c of crew(s)) {
    if ((c.defectStage ?? 0) >= 1) out.push({ kind: 'defector', severity: c.defectStage! >= 2 ? 'danger' : 'warn', title: `${c.firstName} may defect`, text: `${displayName(c)} has been seen with a rival crew.`, charId: c.id });
    const g = getRelation(s, c.id, boss.id)?.grievance ?? 0;
    if (g >= 60 && c.rank !== 'capo') out.push({ kind: 'unhappy', severity: 'warn', title: `${c.firstName} holds a grudge`, text: `Grievance ${g}.`, charId: c.id });
  }
  if (s.heat.federal >= 70) out.push({ kind: 'heat', severity: 'danger', title: 'The feds are close', text: `Federal heat ${s.heat.federal}. At 80 they start making arrests.` });
  if (s.heat.local >= 70) out.push({ kind: 'heat', severity: 'warn', title: 'The cops are restless', text: `Local heat ${s.heat.local}. At 80 they raid.` });
  if (s.heat.family >= 70) out.push({ kind: 'heat', severity: 'danger', title: 'Philadelphia is angry', text: `Family heat ${s.heat.family}. At 80 they summon you.` });
  if (s.money < 0) out.push({ kind: 'money', severity: 'danger', title: 'Can\'t make payroll', text: 'The treasury is in the red. Respect and loyalty are bleeding.', tab: 'business' });
  if (s.unwashed > UNWASHED_SAFE) out.push({ kind: 'money', severity: 'warn', title: 'Dirty money piling up', text: `$${Math.round(s.unwashed).toLocaleString('en-US')} unwashed. Buy fronts that launder.`, tab: 'business' });
  const late = s.loans.filter((l) => l.weeksLate >= 1).length;
  if (late) out.push({ kind: 'loan', severity: 'info', title: `${late} borrower${late > 1 ? 's' : ''} behind`, text: 'The shylock book has late payers.', tab: 'business' });
  const thin = owned(s).filter((b) => staffFactor(s, b) < 1);
  if (thin.length) out.push({ kind: 'staff', severity: 'info', title: 'Rackets short-handed', text: `${thin.map((b) => b.name).join(', ')} need men. Recruit or make room.`, tab: 'business' });
  for (const sc of s.schemes.filter((x) => x.owner !== 'player' && x.discovered)) {
    const r = s.rivals.find((x) => x.id === sc.owner);
    const t = sc.targetId ? s.characters[sc.targetId] : undefined;
    out.push({ kind: 'scheme', severity: sc.kind === 'murder' ? 'danger' : 'warn', title: `${r?.shortName ?? 'A rival'} is plotting`, text: `${sc.kind === 'murder' ? 'A hit' : sc.kind}${t ? ` on ${t.id === boss.id ? 'you' : displayName(t)}` : ''}, ${sc.progress}% ready.`, tab: 'schemes' });
  }
  const blown = s.schemes.filter((x) => x.owner === 'player' && x.discovered).length;
  if (blown) out.push({ kind: 'scheme', severity: 'warn', title: `${blown} of your schemes discovered`, text: 'They know what you are planning.', tab: 'schemes' });
  for (const r of s.rivals.filter((x) => x.feud)) out.push({ kind: 'war', severity: 'danger', title: `Blood feud: ${r.shortName}`, text: `${r.name} wants blood for an unsanctioned killing.`, charId: r.leaderId });
  for (const d of s.disputes.filter((x) => !x.ruling)) out.push({ kind: 'dispute', severity: d.defendant === 'player' ? 'warn' : 'info', title: `Dispute at the Table (week ${d.hearingWeek})`, text: d.claim, tab: 'table' });
  for (const w of s.wars) out.push({ kind: 'war', severity: w.score < -30 ? 'danger' : 'warn', title: `At war: ${s.rivals.find((r) => r.id === w.rival)?.shortName}`, text: `War score ${w.score}.`, tab: 'table' });
  if (!chooseHeir(s, boss).heir) out.push({ kind: 'heir', severity: 'danger', title: 'No heir', text: 'If you die now, the house dies with you.', tab: 'family' });
  return out;
}
