/**
 * DAILY-LOGIC SIMULATOR (headless): plays the game the way the running clock does in the App,
 * one DAY at a time (daily.ts advanceDay: held decisions come out, threats strike on their day and hour),
 * turning the week through advanceWeek on Sunday night,
 * and records what the player would see each day: decisions, urgent meetings, morning problems,
 * evenings, cutscenes, headlines, the clock's auto-pauses (clockPolicy.ts + App.tsx stepDay/run).
 *
 * Gated: only runs with DAILYSIM=1 (never part of the suite).
 *   DAILYSIM=1 SIM_START=classic SIM_SEED=a SIM_YEARS=3 SIM_OUT=/path/out.json \
 *     NODE_OPTIONS=--max-old-space-size=2500 nice npx vitest run tests/dailysim/dailySim.test.ts --maxWorkers=1
 *
 * The "reasonable player": answers every decision with the default (or, a third of the time, the
 * choice the advice tags "Safest"), answers capo morning problems, takes urgent meetings through
 * the underboss and picks the first fitting answer, lives the usual week of evenings, and on a
 * third of the weeks takes the Sit-Down's top recommendation (settled at once when it can be).
 */
import '../../src/engine/engine';
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { advanceWeek } from '../../src/engine/engine';
import { newGameWith, type StartId } from '../../src/engine/starts';
import { daysOf, weekChoices, weekPlan, answerCheckIn } from '../../src/engine/days';
import { dayCheckIns } from '../../src/engine/checkins';
import { compareChoices } from '../../src/engine/advice';
import { recommendedActions } from '../../src/engine/briefing';
import { instant, actNow } from '../../src/engine/actNow';
import { previewAction } from '../../src/engine/actions';
import { cutscenesBetween } from '../../src/engine/cutscenes';
import { themeOf, templateOf } from '../../src/engine/storyDirector';
import { meetTip, respondTip, responsesFor, unseenUrgent, markTipsSeen } from '../../src/engine/threats';
import { autoPauses, budgetPause, IMMEDIATE, redKeys, type PauseLedger } from '../../src/ui/clockPolicy';
import { advanceDay, answerMoment, closeWeek, eventsOut, momentView } from '../../src/engine/daily';
import { scheduled } from '../../src/engine/schedule';
import { extraToday, markExtraShown } from '../../src/engine/paper';
import { morningStop, newWarnings, weekHeadlines } from '../../src/ui/clock';
import { familyCash } from '../../src/engine/tributeState';
import type { GameState, PlayerAction, PlayerChoices } from '../../src/engine/types';

const ON = process.env.DAILYSIM === '1';
const START = (process.env.SIM_START ?? 'classic') as StartId;
const SEED = process.env.SIM_SEED ?? 'a';
const YEARS = Number(process.env.SIM_YEARS ?? '2');
const OUT = process.env.SIM_OUT ?? '';
const ACT_RATE = Number(process.env.SIM_ACT ?? '0.33');

/** One game-day as the player lives it. */
interface DayRec {
  w: number; d: number; date: string;
  /** New decisions that landed today (popups). */
  dec: number; mand: number;
  /** Capo morning problems today (urgent ones stop the clock). */
  am: number; amUrgent: number;
  /** New urgent meetings (threat tips). */
  tips: number;
  /** An evening scene tonight (a round). */
  eve: string | null;
  cuts: string[]; heads: string[]; warns: string[];
  /** Results of orders settled at once today. */
  now: number;
  /** Auto-pauses (reasons) under the default settings. */
  pauses: string[];
  /** Threats that struck today with a moment to answer; quiet ones that landed on their own; an EXTRA card. */
  strikes?: number; quiet?: number; extra?: number; calls?: number;
}
interface WeekRec {
  w: number; date: string; ms: number; start: string;
  money: number; fam: number; respect: number; heat: Record<string, number>; crew: number; made: number; jailed: number;
  popups: { id: string; tpl: string; theme: string; mand: boolean; title: string; nChoices: number }[];
  log: string[]; news: string[]; chron: string[]; motion: number;
  wars: number; newWars: number; battles: number; deaths: { who: string; cause: string; violent: boolean; mine: boolean }[];
  arrests: number; successions: number; rivalBosses: number; plotsUncovered: number; schemesDone: number;
  actions: string[]; bad: string[];
  /** Lines from strikes that landed mid-week (also appended to `log`). */
  strikeLines?: string[];
}

function crewOf(s: GameState) { return Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId); }
function iso(s: GameState, d = daysOf(s).day) { const x = s.date; return `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}+${d}`; }
function h32(str: string) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

function pickChoice(s: GameState, ev: GameState['pendingEvents'][number]): string | undefined {
  const legal = ev.choices.filter((c) => !c.disabledReason);
  if (!legal.length) return undefined;
  const def = legal.find((c) => c.id === ev.defaultChoiceId) ?? legal[0];
  if (h32(`${ev.iid}:pick`) < 0.33) {
    try {
      const adv = compareChoices(s, ev.choices);
      const safe = adv.find((a) => a.tags.includes('Safest'));
      if (safe && legal.some((c) => c.id === safe.id)) return safe.id;
    } catch { /* advice failed: default */ }
  }
  return def.id;
}

function nums(s: GameState): string[] {
  const out: string[] = [];
  const chk: [string, number][] = [['money', s.money], ['respect', s.respect], ['local', s.heat.local], ['family', s.heat.family], ['federal', s.heat.federal]];
  for (const [k, v] of chk) if (!Number.isFinite(v)) out.push(`${k}=${v}`);
  for (const c of Object.values(s.characters)) {
    if (!c.alive) continue;
    for (const [k, v] of Object.entries(c.attributes)) if (!Number.isFinite(v as number)) { out.push(`char ${c.id}.${k}=${v}`); break; }
    if (!Number.isFinite(c.health)) out.push(`char ${c.id}.health=${c.health}`);
  }
  return out.slice(0, 5);
}

describe.skipIf(!ON)('daily sim', () => {
  it(`plays ${START}/${SEED} for ${YEARS} years day by day`, { timeout: 3_600_000 }, () => {
    let s = newGameWith(SEED, START);
    const days: DayRec[] = [];
    const weeks: WeekRec[] = [];
    const errors: string[] = [];
    let acked = new Set<string>();
    let ledger: PauseLedger | undefined;
    const startWeek = s.week;
    let lastActNowFail = 0;
    for (let wi = 0; wi < YEARS * 52 && !s.gameOver; wi++) {
      const wk = s.week;
      const ui = { answers: {} as Record<string, string> };
      // --- The week, day by day: decisions come out on their days (daily.ts), threats strike on theirs.
      const answers: Record<string, string> = {};
      const answerOut = () => { for (const ev of eventsOut(s)) if (!answers[ev.iid]) { const c = pickChoice(s, ev); if (c) answers[ev.iid] = c; } };
      const actions: PlayerAction[] = [];
      const actLog: string[] = [];
      const strikeLines: string[] = [];
      // Sometimes act: the Sit-Down's top recommendation (settled at once if it can be, on a random day).
      const actDay = h32(`${SEED}:${wk}:actday`) < ACT_RATE ? Math.floor(h32(`${SEED}:${wk}:dd`) * 7) : -1;
      const pause = (rec: DayRec, cat: string, at: GameState) => { const b = budgetPause(ledger, `${at.week}:${daysOf(at).day}`, cat); if (b.ok) { ledger = b.ledger; rec.pauses.push(cat); } };
      for (let d = 0; d < 7; d++) {
        if (s.gameOver) break;
        const rec = days.find((x) => x.w === wk && x.d === d) ?? { w: wk, d, date: iso(s, d), dec: 0, mand: 0, am: 0, amUrgent: 0, tips: 0, eve: null, cuts: [], heads: [], warns: [], now: 0, pauses: [] };
        if (!days.includes(rec)) days.push(rec);
        answerOut();
        // Morning: the capos' check-ins.
        for (const c of dayCheckIns(s, d)) {
          if (!c.problem) continue;
          rec.am++;
          if (c.problem.urgent) rec.amUrgent++;
          const ans = c.problem.answers[0];
          if (ans) s = answerCheckIn(s, c.key, ans.id);
        }
        // Urgent meetings waiting: take them through the underboss, answer with the first that fits.
        const fresh = unseenUrgent(s);
        if (fresh.length) {
          s = markTipsSeen(s, fresh);
          for (const id of fresh) {
            let t2 = meetTip(s, id, 'underboss');
            if (t2 === s) t2 = meetTip(s, id, 'boss');
            s = t2;
            const tip = s.threats?.tips.find((t) => t.id === id);
            if (tip) { const r = responsesFor(s, tip); if (r[0]) s = respondTip(s, id, r[0]); }
          }
        }
        // Act.
        if (d === actDay) {
          try {
            const rec2 = recommendedActions(s, undefined, actions);
            const a = rec2[0]?.action;
            if (a && !previewAction(s, a).disabledReason) {
              if (instant(s, a)) {
                const r = actNow(s, a);
                s = r.state; rec.now++;
                actLog.push(`now:${a.kind}`);
              } else { actions.push(a); actLog.push(`queued:${a.kind}`); }
            }
          } catch (e) { if (lastActNowFail++ < 5) errors.push(`wk${wk} act: ${(e as Error).message.slice(0, 200)}`); }
        }
        // Evening.
        const eve = weekPlan(s)[d];
        if (eve) rec.eve = eve;
        if (d < 6) {
          const prev = s;
          const day = advanceDay(s);
          s = day.state;
          const phoneKinds = day.strikes.map((m) => scheduled(s).find((x) => `sched:${x.id}` === m)?.payload.k as string | undefined);
          const nextRec: DayRec = { w: wk, d: d + 1, date: iso(s, d + 1), dec: 0, mand: 0, am: 0, amUrgent: 0, tips: 0, eve: null, cuts: [], heads: [], warns: [], now: 0, pauses: [], strikes: 0, quiet: 0, extra: 0 };
          nextRec.dec = day.released.length;
          nextRec.mand = s.pendingEvents.filter((e) => day.released.includes(e.iid) && e.mandatory).length;
          for (const l of day.landed) { nextRec.quiet!++; strikeLines.push(l.line); }
          // A strike: the clock stops; the reasonable player takes the best odds most of the time.
          for (const id of day.strikes) {
            const v = momentView(s, id);
            if (!v) continue;
            const open = v.options.filter((o) => !o.blocked);
            const best = [...open].sort((a, b) => b.odds - a.odds)[0];
            const opt = h32(`${SEED}:${id}:strike`) < 0.6 && best ? best.id : v.def;
            const r = answerMoment(s, id, opt);
            if (r.result.ok) { s = r.state; nextRec.strikes!++; strikeLines.push(r.result.line); }
          }
          // A call the boss picked up about an urgent meeting: the meeting card opens for his answer (App.tsx), the first that fits.
          for (const tip of s.threats?.tips ?? []) {
            if ((tip.status === 'met' || tip.status === 'sent') && !tip.response && tip.week >= s.week - 1) { const r = responsesFor(s, tip); if (r[0]) s = respondTip(s, tip.id, r[0]); }
          }
          // The App's one stop a morning (App.tsx pauseOnce): the most pressing reason, within the day's budget.
          // A phone call that stopped the clock is its own category ('call': the card holds the clock, like a strike).
          const phoneOnly = day.strikes.length > 0 && day.strikes.every((m) => m.startsWith('sched:'));
          const cats: string[] = day.strikes.length ? [phoneOnly ? 'call' : 'strike'] : [];
          const ps = autoPauses(prev, s, acked, ui).map((p) => p.cat);
          if (ps.length) cats.push(ps[0]);
          if (morningStop(s)) cats.push('capo');
          const ex = extraToday(s);
          if (ex) { s = markExtraShown(s, ex.id); nextRec.extra!++; nextRec.heads.push(`extra:${ex.h}`); cats.push('extra'); }
          nextRec.tips = unseenUrgent(s).length;
          if (cats.length) pause(nextRec, cats[0] === 'call' ? 'strike' : cats.find((c) => IMMEDIATE.has(c)) ?? cats[0], s);
          // A day the phone alone stopped the clock for (a call nothing else that morning would have stopped for).
          if (cats[0] === 'call' && nextRec.pauses.length) nextRec.pauses[nextRec.pauses.length - 1] = cats.length === 1 && !phoneKinds.some((k) => k === 'tip' || k === 'capo') ? 'call' : 'call+';
          nextRec.calls = s.phone?.log.filter((l) => l.w === s.week && l.d === d + 1).length ?? 0;
          days.push(nextRec);
          acked = new Set([...acked, ...redKeys(s, ui)]);
        }
      }
      if (s.gameOver) break;
      // --- Sunday midnight: the week turns (anything still held comes out and is answered).
      s = closeWeek(s);
      answerOut();
      const base: PlayerChoices = { choices: answers, actions };
      const t = s.tribute;
      const pend = t?.reports.find((r) => r.status === 'presented');
      if (t && s.week <= startWeek) base.envelope = { split: { personal: 2500, treasury: 7500, reserve: 0 }, standing: true };
      else if (pend) base.envelope = { report: pend.id, split: { personal: 2500, treasury: 7500, reserve: 0 }, grant: pend.petitions.filter((x) => x.amount < s.money / 10).map((x) => x.id) };
      const choices = weekChoices(s, base);
      const prev = s;
      const t0 = performance.now();
      let res;
      try { res = advanceWeek(s, choices); } catch (e) { errors.push(`CRASH wk${wk}: ${(e as Error).message.slice(0, 400)}`); break; }
      const ms = performance.now() - t0;
      s = res.state;
      // Day 0 of the new week: Monday's decisions and the turn's results land now.
      const mon = eventsOut(s);
      const d0: DayRec = { w: s.week, d: 0, date: iso(s, 0), dec: mon.length, mand: mon.filter((e) => e.mandatory).length, am: 0, amUrgent: 0, tips: unseenUrgent(s).length, eve: null, cuts: [], heads: [], warns: [], now: 0, pauses: [] };
      d0.cuts = cutscenesBetween(prev, s).map((c) => c.key);
      d0.heads = weekHeadlines(prev, s).map((h) => `${h.kind}:${h.text}`);
      d0.warns = newWarnings(prev, s);
      // The App's quiet week-turn pause (run('week', …, true)): everything folded into the one Sit-Down pause.
      const ui0 = { answers: {} };
      const ap = autoPauses(prev, s, acked, ui0).map((p) => p.cat);
      acked = new Set([...acked, ...redKeys(s, ui0)]);
      const turnWhy = ap[0] ?? (d0.heads.length ? 'headline' : d0.warns.length || d0.cuts.length ? 'warning/cutscene' : morningStop(s) ? 'capo' : undefined);
      if (turnWhy) pause(d0, turnWhy, s);
      days.push(d0);
      // The week's record.
      const crew = crewOf(s);
      const deaths: WeekRec['deaths'] = [];
      let arrests = 0;
      for (const c of Object.values(s.characters)) {
        const was = prev.characters[c.id];
        if (was?.alive && !c.alive) {
          const cause = c.death?.cause ?? '?';
          deaths.push({ who: `${c.faction}:${c.rank}`, cause: cause.slice(0, 60), violent: c.death?.killer !== undefined || /shot|killed|murder|hit|whack|stab|bomb|beaten|strangl|garrot|executed|found in|dumped|ambush|gun/i.test(cause), mine: c.faction === 'player' || !!c.dynasty || c.id === prev.playerId });
        }
        if (was && c.alive && c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week && !(was.imprisonedUntil !== undefined && was.imprisonedUntil > prev.week)) arrests++;
      }
      const newNews = s.news.filter((n) => n.week >= prev.week).map((n) => `${n.kind}|${n.headline}`);
      const newChron = s.chronicle.filter((c) => c.week >= prev.week && !prev.chronicle.includes(c)).map((c) => `${c.kind}|${c.text}`.slice(0, 160));
      const rivalBossChange = s.rivals.filter((r) => { const p = prev.rivals.find((x) => x.id === r.id); return p && (p as { bossId?: string }).bossId !== (r as { bossId?: string }).bossId; }).length;
      const bad = nums(s);
      if (s.money < -100000) bad.push(`money ${s.money}`);
      weeks.push({
        w: prev.week, date: iso(prev, 0), ms: Math.round(ms), start: START,
        money: Math.round(s.money), fam: Math.round(familyCash(s)), respect: s.respect, heat: { ...s.heat }, crew: crew.length, made: crew.filter((c) => c.rank !== 'associate').length,
        jailed: crew.filter((c) => c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week).length,
        popups: s.pendingEvents.map((e) => ({ id: e.defId, tpl: templateOf(e), theme: themeOf(e), mand: e.mandatory, title: e.title.slice(0, 70), nChoices: e.choices.filter((c) => !c.disabledReason).length })),
        log: [...res.log, ...strikeLines].map((l) => l.slice(0, 180)), news: newNews, strikeLines, chron: newChron, motion: res.report.motion?.length ?? 0,
        wars: s.wars.length, newWars: s.wars.filter((w) => !prev.wars.some((v) => v.id === w.id)).length,
        battles: (s.army?.history?.length ?? 0) - (prev.army?.history?.length ?? 0),
        deaths, arrests, successions: s.playerId !== prev.playerId ? 1 : 0, rivalBosses: rivalBossChange,
        plotsUncovered: (s.schemes ?? []).filter((x) => x.owner !== 'player' && x.discovered && !(prev.schemes ?? []).some((y) => y.id === x.id && y.discovered)).length,
        schemesDone: (prev.schemes ?? []).filter((x) => !(s.schemes ?? []).some((y) => y.id === x.id)).length,
        actions: actLog, bad,
      });
    }
    const out = { start: START, seed: SEED, years: YEARS, gameOver: s.gameOver ?? null, finalWeek: s.week, errors, days, weeks, feds: s.feds?.stats ?? null };
    // eslint-disable-next-line no-console
    console.log(`[dailysim] feds ${JSON.stringify(s.feds?.stats ?? null)}`);
    if (OUT) writeFileSync(OUT, JSON.stringify(out));
    // eslint-disable-next-line no-console
    console.log(`[dailysim] ${START}/${SEED}: ${weeks.length} weeks, ${days.length} days, errors ${errors.length}${s.gameOver ? `, game over ${JSON.stringify(s.gameOver).slice(0, 120)}` : ''}`);
  });
});
