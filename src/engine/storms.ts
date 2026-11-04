import { capos, crew, displayName } from './characters';
import { oddsWord } from './decide';
import { flipOdds, hollowFactors, HOLLOW_CHANCE } from './feds';
import { HEAT_FULL, HEAT_THRESHOLD, heatRamp } from './heat';
import { caseEvidence, evidenceGain, GRAND_JURY, indictOdds } from './longgame';
import { BAIL_WEEKS, summonsChance } from './pressure';
import { heardWarnings, tipCover } from './threats';
import type { GameState } from './types';
import { UNWASHED_SAFE } from './economy';

/**
 * STORM WARNINGS (EASIER_NOT_SHALLOWER #2): nothing big lands unannounced. A raid, a federal arrest, an
 * indictment, a hit on the boss or his people, the Family running dry, a man of his flipping, the capos
 * running the family without him, Philadelphia's summons: each shows up 1 to 2 weeks ahead, on the Desk and
 * in the morning brief, with the odds, the biggest reason and what would help (each a link to the screen
 * where he does it).
 *
 * Only what the boss knows or could plausibly know: his own heat bars, his own file and what the lawyer
 * tells him, the warnings he has heard out (and his own answers to them, never whether a tip was true or
 * planted), the men picked up (the government's offer is on their card), the signs against him that every
 * capo can see, his books. Never an informant, a hidden plot or a planted tip's truth.
 *
 * Pure; no dice. The odds are the game's own weekly chances over the next two weeks.
 */

export type StormKind = 'raid' | 'arrest' | 'indictment' | 'hit' | 'strike' | 'broke' | 'flip' | 'hollow' | 'philly';

/** A plain route the UI opens (ui/shell/routes.ts). */
export interface StormGo { panel: string; section?: string }

export interface StormHelp { label: string; go?: StormGo }

export interface Storm {
  id: string;
  kind: StormKind;
  title: string;
  /** 0..1 over the window. */
  odds: number;
  /** "within 2 weeks", "Friday night". */
  when: string;
  /** The single biggest reason. */
  why: string;
  helps: StormHelp[];
  tone: 'red' | 'amber';
  domain: 'law' | 'rivals' | 'money' | 'crew' | 'politics';
}

const over2 = (p: number) => 1 - (1 - Math.max(0, Math.min(1, p))) ** 2;
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
/** A storm is worth a chip from this chance over the window. */
export const STORM_MIN = 0.08;

function lastDelta(s: GameState, k: 'local' | 'federal' | 'family'): number {
  const r = s.lastReport;
  return r ? r.end.heat[k] - r.start.heat[k] : 0;
}

/** Every storm on the horizon, worst first. */
export function stormWarnings(s: GameState): Storm[] {
  if (s.gameOver) return [];
  const out: Storm[] = [];
  const add = (x: Storm) => { if (x.odds >= STORM_MIN) out.push(x); };

  // A RAID: the county detectives work up a warrant when local heat is past the line.
  {
    const now = s.heat.local;
    const next = Math.max(0, now + Math.max(0, lastDelta(s, 'local')));
    const wk = (v: number) => 0.45 * heatRamp(v) + (v >= HEAT_FULL ? 0.2 : 0);
    const p = 1 - (1 - wk(now)) * (1 - wk(next));
    add({ id: 'raid', kind: 'raid', title: 'A raid on one of your places', odds: p, when: 'within 2 weeks', tone: p >= 0.4 ? 'red' : 'amber', domain: 'law',
      why: `local heat ${now}${next > now ? `, rising ${next - now} a week` : ''}: from ${HEAT_THRESHOLD} the county works up warrants`,
      helps: [{ label: 'A quiet week: no pushes, no scores', go: { panel: 'borgata', section: 'orders' } }, { label: 'A sergeant or a judge on the pad', go: { panel: 'town', section: 'cityhall' } }] });
  }
  // A FEDERAL ARREST: one of the men picked up when federal heat is past the line.
  {
    const p = over2(0.35 * heatRamp(s.heat.federal));
    const dirty = s.unwashed > UNWASHED_SAFE;
    add({ id: 'arrest', kind: 'arrest', title: 'The FBI picks up one of your men', odds: p, when: 'within 2 weeks', tone: p >= 0.4 ? 'red' : 'amber', domain: 'law',
      why: dirty ? `federal heat ${s.heat.federal}, and ${usd(s.unwashed)} of unwashed cash feeding it` : `federal heat ${s.heat.federal}: from ${HEAT_THRESHOLD} they make arrests`,
      helps: [...(dirty ? [{ label: 'Wash the cash through a front', go: { panel: 'holdings', section: 'books' } }] : []), { label: 'Put the lawyer on retainer', go: { panel: 'town', section: 'case' } }] });
  }
  // AN INDICTMENT: the grand jury sits on the boss himself (the lawyer tells him what is in the file).
  {
    const l = s.legal;
    if (l && l.personId === s.playerId) {
      if (l.stage === 'grandjury') {
        const left = Math.max(0, (l.next ?? s.week) - s.week);
        const p = indictOdds(s, l);
        if (left <= 2) add({ id: 'indict', kind: 'indictment', title: 'The grand jury votes on you', odds: p, when: left === 0 ? 'this week' : `in ${left} week${left === 1 ? '' : 's'}`, tone: 'red', domain: 'law',
          why: `the file on you is at ${Math.round(caseEvidence(s, l))}; your defense ${Math.round(l.defense)}`,
          helps: [{ label: 'Spend on the defense', go: { panel: 'town', section: 'case' } }, { label: 'Lie low: federal heat feeds the file', go: { panel: 'borgata', section: 'orders' } }] });
      } else if (l.stage === 'investigation') {
        // The weekly gain he can know of: his heat, his cash, his papers. Never an informant he hasn't found.
        const g = evidenceGain(s).reasons.filter((r) => !/informant/i.test(r.label)).reduce((a, r) => a + r.value, 0);
        const ev = caseEvidence(s, l);
        const weeks = g > 0 ? (GRAND_JURY - ev) / g : Infinity;
        if (weeks <= 2.5) add({ id: 'indict', kind: 'indictment', title: 'A grand jury is called on you', odds: weeks <= 1 ? 0.9 : 0.6, when: `in about ${Math.max(1, Math.ceil(weeks))} week${Math.ceil(weeks) <= 1 ? '' : 's'}`, tone: 'red', domain: 'law',
          why: `the file on you is at ${Math.round(ev)} of ${GRAND_JURY}, growing about ${g.toFixed(1)} a week`,
          helps: [{ label: 'Put the lawyer to work', go: { panel: 'town', section: 'case' } }, { label: 'Cool federal heat: no state lines, no big scores', go: { panel: 'borgata', section: 'orders' } }] });
      }
    }
  }
  // WHAT HE HAS HEARD: the warnings he met or sent someone to, with what his answer covers (if the tip is true).
  for (const h of heardWarnings(s)) {
    const t = h.tip;
    const k = t.kind;
    if (!['hit', 'raid', 'racket', 'setup', 'move'].includes(k)) continue;
    const cover = tipCover(s, t);
    const onBoss = k === 'hit' && t.targetId === s.playerId;
    const who = t.targetId && s.characters[t.targetId] ? displayName(s.characters[t.targetId]) : undefined;
    const title = onBoss ? `${h.who} is coming for you` : k === 'hit' ? `${h.who} is going after ${who ?? 'one of yours'}` : k === 'raid' ? 'A warrant for one of your places' : k === 'move' ? `${h.who} moves on your corners` : `${h.who} hits one of your places`;
    out.push({ id: `tip:${t.id}`, kind: k === 'hit' ? 'hit' : 'strike', title, odds: 1 - cover, when: h.daysLeft === 0 ? 'tonight' : h.daysLeft === 1 ? 'tomorrow' : `in ${h.daysLeft} days`, tone: onBoss || cover < 0.5 ? 'red' : 'amber', domain: k === 'raid' ? 'law' : 'rivals',
      why: t.response && t.response !== 'nothing' ? `if ${t.sourceName} heard it right, your answer covers ${Math.round(cover * 100)}% of it` : `${t.sourceName} warned you, and you have given no answer yet`,
      helps: [{ label: t.response && t.response !== 'nothing' ? 'Guards on the man it is aimed at' : 'Answer the warning', go: { panel: 'borgata', section: 'protect' } }] });
  }
  // THE FAMILY RUNS DRY: last week's net against the money left; past BAIL_WEEKS under water the men stop waiting.
  {
    const r = s.lastReport;
    const net = r ? r.end.money - r.start.money : 0;
    const under = s.action?.under ?? 0;
    if (s.money < 0) {
      const p = under >= BAIL_WEEKS - 2 ? 0.9 : 0.5;
      add({ id: 'broke', kind: 'broke', title: 'The Family is in the red', odds: p, when: under ? `${under} week${under === 1 ? '' : 's'} under water` : 'now', tone: 'red', domain: 'money',
        why: `${usd(s.money)} in the Family: the men are paid late, and respect and loyalty bleed every week`,
        helps: [{ label: 'Take a smaller cut of the envelope', go: { panel: 'holdings', section: 'take' } }, { label: 'Sell a place, or borrow', go: { panel: 'holdings', section: 'loandesk' } }] });
    } else if (net < 0 && s.money + 2 * net < 0) {
      const weeks = Math.max(1, Math.floor(s.money / -net));
      add({ id: 'broke', kind: 'broke', title: 'The Family runs dry', odds: weeks <= 1 ? 0.85 : 0.6, when: `in about ${weeks} week${weeks === 1 ? '' : 's'}`, tone: weeks <= 1 ? 'red' : 'amber', domain: 'money',
        why: `last week the Family lost ${usd(-net)}, and it holds ${usd(s.money)}`,
        helps: [{ label: 'Take a smaller cut of the envelope', go: { panel: 'holdings', section: 'take' } }, { label: 'Cut the payroll or sell a place', go: { panel: 'holdings', section: 'property' } }] });
    }
  }
  // A MAN OF HIS FLIPS: picked up, and the government's offer is coming (the odds are on his card).
  for (const p of s.feds?.pinches ?? []) {
    const c = s.characters[p.charId];
    if (p.stage !== 'held' || p.rival || !c?.alive || c.faction !== 'player') continue;
    const left = (p.decide ?? s.week) - s.week;
    if (left > 2) continue;
    const o = flipOdds(s, p);
    add({ id: `flip:${p.id}`, kind: 'flip', title: `${displayName(c)} may talk`, odds: o, when: left <= 0 ? 'this week' : `in ${left} week${left === 1 ? '' : 's'}`, tone: o >= 0.35 || ['capo', 'underboss', 'consigliere'].includes(c.rank) ? 'red' : 'amber', domain: 'law',
      why: `facing ${p.years} year${p.years === 1 ? '' : 's'}${p.care.length ? `; what you did for him counts` : '; nobody has done anything for him yet'}`,
      helps: [{ label: 'A lawyer, bail, his family looked after', go: { panel: 'town', section: 'case' } }] });
  }
  // THE HOLLOW CROWN: the signs every capo can see; three or more and the capos start running the family without him.
  if (!s.feds?.hollow && capos(s).length >= 2 && crew(s).length >= 12) {
    const fs = hollowFactors(s);
    const n = fs.filter((f) => f.on).length;
    if (fs[3].on && n >= 2) {
      const p = over2((HOLLOW_CHANCE[Math.min(5, n)] ?? 0) * (s.oldDon ? 1.5 : 1));
      add({ id: 'hollow', kind: 'hollow', title: 'The capos start running things without you', odds: p, when: 'within 2 weeks', tone: n >= 3 ? 'red' : 'amber', domain: 'crew',
        why: fs.filter((f) => f.on).map((f) => f.label.toLowerCase()).join('; '),
        helps: [{ label: 'Hear out the sore capos', go: { panel: 'borgata', section: 'grievances' } }, { label: 'Win a fight, keep your word: respect', go: { panel: 'borgata', section: 'capos' } }] });
    }
  } else if (s.feds?.hollow) {
    const H = s.feds.hollow;
    const p = H.meter < 30 ? 0.7 : H.meter < 50 ? 0.4 : 0.15;
    add({ id: 'hollow', kind: 'hollow', title: 'A move on the chair', odds: p, when: 'within 2 weeks', tone: 'red', domain: 'crew',
      why: `only ${H.meter}% of the family answers to you`,
      helps: [{ label: 'Win the capos back, one at a time', go: { panel: 'borgata', section: 'grievances' } }] });
  }
  // PHILADELPHIA: the summons across the bridge, and past HEAT_FULL a cut of the treasury.
  if (s.heat.family >= 40 && s.week >= 18) {
    const p = s.heat.family >= HEAT_FULL ? over2(0.4) : over2(summonsChance(s));
    add({ id: 'philly', kind: 'philly', title: s.heat.family >= HEAT_FULL ? 'Philadelphia takes a cut of your treasury' : 'Philadelphia summons you across the bridge', odds: p, when: 'within 2 weeks', tone: s.heat.family >= HEAT_FULL ? 'red' : 'amber', domain: 'politics',
      why: `family heat ${s.heat.family}: Philadelphia's patience with you`,
      helps: [{ label: 'Pay the bagman in full and on time', go: { panel: 'holdings', section: 'take' } }, { label: 'Send the consigliere to the Table', go: { panel: 'diplomacy', section: 'table' } }] });
  }
  return out.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'red' ? -1 : 1) || b.odds - a.odds || a.id.localeCompare(b.id));
}

/** One line for the brief and the chip's title ("A raid · risky (34%) within 2 weeks"). */
export function stormLine(x: Storm): string {
  return `${x.title} · ${oddsWord(x.odds)} (${Math.round(x.odds * 100)}%) ${x.when}`;
}
