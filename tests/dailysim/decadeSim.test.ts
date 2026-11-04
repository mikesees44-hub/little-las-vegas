/**
 * DECADE SIMULATOR (headless): the daily sim (dailySim.test.ts) stretched to 10 years, with the
 * dynasty, the feds, the capos and the integrity of the save measured every week.
 *
 * Gated: only runs with DECADESIM=1 (never part of the suite).
 *   DECADESIM=1 SIM_START=olddon SIM_SEED=a SIM_YEARS=10 SIM_POLICY=reasonable SIM_OUT=/path/olddon_a_reasonable \
 *     NODE_OPTIONS=--max-old-space-size=3000 nice npx vitest run tests/dailysim/decadeSim.test.ts --maxWorkers=1
 *
 * Writes as it goes (a killed run is not lost):
 *   <OUT>.weeks.jsonl  one line per week (appended)
 *   <OUT>.json         the run summary (rewritten every 13 weeks and at the end)
 *
 * Policies:
 *   reasonable  the daily sim's player: the default or "Safest" a third of the time, capo mornings answered,
 *               urgent meetings taken through the underboss, strikes answered with the best odds 60% of the
 *               time, the Sit-Down's top recommendation on a third of the weeks.
 *   passive     always the defaults: no answers given, no meetings taken, no orders, the strike's default.
 */
import '../../src/engine/engine';
import { describe, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { advanceWeek } from '../../src/engine/engine';
import { newGameWith, type StartId } from '../../src/engine/starts';
import { daysOf, weekChoices, answerCheckIn } from '../../src/engine/days';
import { dayCheckIns } from '../../src/engine/checkins';
import { compareChoices } from '../../src/engine/advice';
import { recommendedActions } from '../../src/engine/briefing';
import { instant, actNow } from '../../src/engine/actNow';
import { previewAction } from '../../src/engine/actions';
import { templateOf } from '../../src/engine/storyDirector';
import { meetTip, respondTip, responsesFor, unseenUrgent, markTipsSeen } from '../../src/engine/threats';
import { advanceDay, answerMoment, closeWeek, eventsOut, momentView } from '../../src/engine/daily';
import { extraToday, markExtraShown } from '../../src/engine/paper';
import { familyCash, pocketCash } from '../../src/engine/tributeState';
import { chooseHeir } from '../../src/engine/dynasty';
import { ageOn } from '../../src/engine/calendar';
import { opinion } from '../../src/engine/relations';
import { stationOf, inTheRanks } from '../../src/engine/rankView';
import { above, vouchCandidates } from '../../src/engine/valente';
import type { GameState, PlayerAction, PlayerChoices } from '../../src/engine/types';

const ON = process.env.DECADESIM === '1';
const START = (process.env.SIM_START ?? 'olddon') as StartId;
const SEED = process.env.SIM_SEED ?? 'a';
const YEARS = Number(process.env.SIM_YEARS ?? '10');
const POLICY = (process.env.SIM_POLICY ?? 'reasonable') as 'reasonable' | 'passive' | 'climber';
const CLIMBER = POLICY === 'climber';
const OUT = process.env.SIM_OUT ?? '';
const ACT_RATE = Number(process.env.SIM_ACT ?? '0.33');
const PASSIVE = POLICY === 'passive';

function h32(str: string) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
const crewOf = (s: GameState) => Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId);
const iso = (s: GameState) => `${s.date.y}-${String(s.date.m).padStart(2, '0')}-${String(s.date.d).padStart(2, '0')}`;
const nm = (s: GameState, id?: string) => { const c = id ? s.characters[id] : undefined; return c ? `${c.firstName} ${c.lastName}` : `?${id}`; };
const NATURAL = /(old age|heart|stroke|cancer|illness|sick|natural|pneumonia|in his sleep|in her sleep|failure|disease|tuberculosis|liver|consumption|fever|aneurysm|died peacefully|age)/i;

function pickChoice(s: GameState, ev: GameState['pendingEvents'][number]): string | undefined {
  const legal = ev.choices.filter((c) => !c.disabledReason);
  if (!legal.length) return undefined;
  const def = legal.find((c) => c.id === ev.defaultChoiceId) ?? legal[0];
  if (PASSIVE) return def.id;
  if (h32(`${ev.iid}:pick`) < 0.33) {
    try {
      const adv = compareChoices(s, ev.choices);
      const safe = adv.find((a) => a.tags.includes('Safest'));
      if (safe && legal.some((c) => c.id === safe.id)) return safe.id;
    } catch { /* advice failed: default */ }
  }
  return def.id;
}

/** Integrity: NaN, impossible negatives, dangling references, orphaned states. */
function integrity(s: GameState): string[] {
  const out: string[] = [];
  const chk: [string, number][] = [['money', s.money], ['respect', s.respect], ['local', s.heat.local], ['family', s.heat.family], ['federal', s.heat.federal]];
  for (const [k, v] of chk) if (!Number.isFinite(v)) out.push(`NaN ${k}=${v}`);
  if (s.respect < 0 || s.respect > 100) out.push(`respect out of range ${s.respect}`);
  for (const k of ['local', 'family', 'federal'] as const) if (s.heat[k] < 0 || s.heat[k] > 100) out.push(`heat.${k} out of range ${s.heat[k]}`);
  const pk = pocketCash(s);
  if (!Number.isFinite(pk)) out.push(`NaN pocket=${pk}`);
  const boss = s.characters[s.playerId];
  if (!s.gameOver) {
    if (!boss) out.push(`player ${s.playerId} missing`);
    else {
      if (!boss.alive) out.push(`player ${s.playerId} dead without game over`);
      if (boss.faction !== 'player') out.push(`player faction=${boss.faction}`);
      if (!boss.dynasty) out.push('player not in the dynasty');
      if (stationOf(s) === 'boss' && boss.rank !== 'boss') out.push(`station boss but rank=${boss.rank}`);
      if (stationOf(s) !== 'boss' && boss.rank === 'boss') out.push(`station ${stationOf(s)} but rank=boss`);
    }
  }
  let dangling = 0; let deadCapoRef = 0; let nanChar = 0; let negWealth = 0;
  const ex = (id?: string) => !id || !!s.characters[id];
  for (const c of Object.values(s.characters)) {
    if (!ex(c.spouseId) || !ex(c.fatherId) || !ex(c.motherId) || c.childrenIds.some((x) => !s.characters[x])) dangling++;
    if (c.alive && c.capoId && !s.characters[c.capoId]?.alive) deadCapoRef++;
    if (c.alive) {
      for (const v of Object.values(c.attributes)) if (!Number.isFinite(v as number)) { nanChar++; break; }
      if (!Number.isFinite(c.health)) nanChar++;
      if (!Number.isFinite(c.wealth)) nanChar++;
      if (c.wealth < 0) negWealth++;
    }
  }
  // The same person twice: a living character with the name and birthday of a dead one (a lineage copy brought back).
  const deadKey = new Map<string, string>();
  for (const c of Object.values(s.characters)) if (!c.alive) deadKey.set(`${c.firstName}|${c.lastName}|${c.birth.y}-${c.birth.m}-${c.birth.d}`, c.id);
  for (const c of Object.values(s.characters)) { if (!c.alive) continue; const k = `${c.firstName}|${c.lastName}|${c.birth.y}-${c.birth.m}-${c.birth.d}`; const dd = deadKey.get(k); if (dd) out.push(`alive twin of the dead: ${c.id} = dead ${dd} (${c.firstName} ${c.lastName} b.${c.birth.y}, spouse ${c.spouseId ?? '-'})`); }
  // A wife whose husband is dead but who is still married to him.
  for (const c of Object.values(s.characters)) if (c.alive && c.spouseId && s.characters[c.spouseId] && !s.characters[c.spouseId].alive) { out.push(`married to the dead: ${c.id}→${c.spouseId}`); break; }
  if (dangling) out.push(`dangling family refs: ${dangling}`);
  if (deadCapoRef) out.push(`living men under a dead capo: ${deadCapoRef}`);
  if (nanChar) out.push(`NaN character fields: ${nanChar}`);
  if (negWealth) out.push(`negative character wealth: ${negWealth}`);
  for (const d of s.districts) {
    if (d.capoId && !s.characters[d.capoId]?.alive) out.push(`district ${d.id} capo dead/missing`);
    const sum = Object.values(d.influence).reduce((a, b) => a + (b ?? 0), 0);
    if (!Number.isFinite(sum) || sum > 100.5) out.push(`district ${d.id} influence sum ${sum}`);
  }
  if (s.designatedHeirId && !s.characters[s.designatedHeirId]?.alive) out.push('designated heir dead/missing');
  for (const f of s.factions ?? []) if (!s.characters[f.leaderId]?.alive) out.push(`faction ${f.id} led by dead/missing ${f.leaderId}`);
  for (const ev of s.pendingEvents) { const cid = (ev.meta as { charId?: string } | undefined)?.charId; if (cid && !s.characters[cid]) out.push(`event ${ev.defId} refs missing ${cid}`); }
  return out;
}

const LOGRX: Record<string, RegExp> = {
  raid: /(^RAID:|detectives raid|vice squad raided|padlock\S* .* for \d+ weeks|"found" a gun)/i,
  fedArrest: /^ARREST:/,
  philly: /Philadelphia summoned you/,
  bailout: /(loan shark|hat in hand|bail-out|bailout)/i,
  coup: /(made his play for the|coup)/i,
  betrayal: /(walked out and went over|went over to \w+|ratted|wearing a wire|defected)/i,
  killing: /(shot dead|gunned down|was murdered|whacked|garrot|stabbed to death|body was found|found in the trunk|blown up)/i,
  warLine: /(declared war|went to the mattresses|truce broke)/i,
  upkeep: /^The upkeep of a big operation/,
  wedding: /(married|wedding)/i,
  birth: /(was born|a son is born|a daughter is born|gave birth)/i,
  comingOfAge: /(came of age|comes of age)/i,
};

describe.skipIf(!ON)('decade sim', () => {
  it(`plays ${START}/${SEED}/${POLICY} for ${YEARS} years`, { timeout: 7_200_000 }, () => {
    let s = newGameWith(SEED, START);
    const startWeek = s.week;
    const errors: string[] = [];
    const successions: Record<string, unknown>[] = [];
    const rungs: { w: number; date: string; from: string; to: string }[] = [];
    const snaps: Record<string, unknown>[] = [];
    const bossJail: { w: number; until: number }[] = [];
    const integ: Record<string, { first: number; n: number; sample: string }> = {};
    const seenFactions = new Set<string>(); const factionLog: Record<string, unknown>[] = [];
    const seenWars = new Set<string>(s.wars.map((w) => w.id));
    let bossId = s.playerId; let station = stationOf(s);
    if (OUT) writeFileSync(`${OUT}.weeks.jsonl`, '');
    let lastActFail = 0;

    const heirInfo = (st: GameState) => {
      const b = st.characters[st.playerId];
      if (!b) return null;
      try {
        const r = chooseHeir(st, b);
        if (!r.heir) return null;
        const h = r.heir;
        return { id: h.id, name: nm(st, h.id), age: ageOn(h.birth, st.date), adult: ageOn(h.birth, st.date) >= 16, lead: h.attributes.leadership, son: b.childrenIds.includes(h.id), method: r.method };
      } catch (e) { errors.push(`wk${st.week} chooseHeir: ${(e as Error).message.slice(0, 160)}`); return null; }
    };

    /** A change of boss (any path), classified from what happened to the old man. */
    const checkBoss = (prev: GameState, cur: GameState, where: string) => {
      if (cur.playerId === bossId) return;
      const old = cur.characters[bossId];
      const oldPrev = prev.characters[bossId];
      const neu = cur.characters[cur.playerId];
      const famOld = (cur as { dyn?: { people: Record<string, { retired?: number }> } }).dyn?.people[bossId];
      let how = 'other';
      if (old && !old.alive) {
        const cause = old.death?.cause ?? '?';
        how = old.death?.killer && old.death.killer !== 'none' ? `killed (${old.death.killer})` : NATURAL.test(cause) ? 'natural death' : `death: ${cause.slice(0, 50)}`;
      } else if (old && old.faction === 'law') how = 'flip (turned witness)';
      else if (famOld?.retired !== undefined) how = prev.feds?.hollow ? 'abdication (hollow crown)' : 'abdication';
      else if (old && old.imprisonedUntil !== undefined && old.imprisonedUntil > cur.week) how = 'prison';
      const newHist = cur.dynastyHistory.slice(prev.dynastyHistory.length).map((h) => h.text);
      const claimants = Object.entries((cur as { dyn?: { people: Record<string, { claimant?: boolean }> } }).dyn?.people ?? {}).filter(([id, p]) => p.claimant && cur.characters[id]?.alive).length;
      successions.push({
        w: cur.week, wk: cur.week - startWeek, date: iso(cur), where, how,
        old: { id: bossId, name: nm(cur, bossId), age: old ? ageOn(old.birth, cur.date) : null, cause: old?.death?.cause, ruledWeeks: null, wasJailed: (oldPrev?.imprisonedUntil ?? 0) > prev.week },
        neu: neu ? { id: neu.id, name: nm(cur, neu.id), age: ageOn(neu.birth, cur.date), lead: neu.attributes.leadership, attrs: neu.attributes, son: !!old?.childrenIds.includes(neu.id), wasRank: prev.characters[neu.id]?.rank } : null,
        hollowBefore: !!prev.feds?.hollow, dmwBefore: !!prev.feds?.hollow?.dmw, factionsBefore: (prev.factions ?? []).map((f) => f.agenda ?? f.demand),
        claimants, hist: newHist.slice(0, 6), respectAfter: cur.respect,
      });
      bossId = cur.playerId;
    };

    const persist = (final = false, weeksDone = 0) => {
      if (!OUT) return;
      const sum = {
        start: START, seed: SEED, policy: POLICY, years: YEARS, weeksDone, final, startWeek, finalWeek: s.week, date: iso(s),
        gameOver: s.gameOver ?? null, errors: errors.slice(0, 80), nErrors: errors.length, successions, rungs, snaps, bossJail,
        integ, factionLog, feds: s.feds?.stats ?? null, capos: s.capos?.stats ?? null,
        dyn: (s as { dyn?: { stats: unknown } }).dyn?.stats ?? null,
        dynastyHistory: s.dynastyHistory.map((h) => `${h.date.y}-${h.date.m}: ${h.text}`).slice(-120),
        boss: { id: s.playerId, name: nm(s, s.playerId), station: stationOf(s) },
      };
      writeFileSync(`${OUT}.json`, JSON.stringify(sum));
    };

    const snapshot = (label: string) => {
      const t0 = performance.now();
      const json = JSON.stringify(s);
      const ser = performance.now() - t0;
      const chars = Object.values(s.characters);
      // Biggest top-level keys of the save.
      const keys = Object.entries(s as unknown as Record<string, unknown>).map(([k, v]) => [k, JSON.stringify(v ?? null).length] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 12);
      // One level down in the biggest growers (which list is the one that grows).
      const sub: Record<string, [string, number][]> = {};
      for (const [k] of keys.slice(0, 8)) {
        const v = (s as unknown as Record<string, unknown>)[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'characters' && k !== 'relations') sub[k] = Object.entries(v as Record<string, unknown>).map(([a, b]) => [a, JSON.stringify(b ?? null).length] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 5);
      }
      snaps.push({ label, sub, w: s.week - startWeek, bytes: json.length, serMs: Math.round(ser), heapMB: Math.round(process.memoryUsage().heapUsed / 1e6), rssMB: Math.round(process.memoryUsage().rss / 1e6), chars: chars.length, alive: chars.filter((c) => c.alive).length, relations: Object.keys(s.relations).length, chronicle: s.chronicle.length, news: s.news.length, keys });
    };
    snapshot('start');

    for (let wi = 0; wi < YEARS * 52 && !s.gameOver; wi++) {
      const wk = s.week;
      const weekStart = s;
      const answers: Record<string, string> = {};
      const answerOut = () => { for (const ev of eventsOut(s)) if (!answers[ev.iid]) { const c = pickChoice(s, ev); if (c) answers[ev.iid] = c; } };
      const actions: PlayerAction[] = [];
      const cnt = { am: 0, tips: 0, strikes: 0, quiet: 0, extra: 0, now: 0, queued: 0 };
      const strikeLines: string[] = [];
      const actDay = !PASSIVE && h32(`${SEED}:${wk}:actday`) < ACT_RATE ? Math.floor(h32(`${SEED}:${wk}:dd`) * 7) : -1;
      let dayMs = 0;
      let dayCrash = false;
      for (let d = 0; d < 7; d++) {
        try {
          if (s.gameOver) break;
          answerOut();
          const dPrev = s;
          for (const c of dayCheckIns(s, d)) {
            if (!c.problem) continue;
            cnt.am++;
            if (!PASSIVE) { const ans = c.problem.answers[0]; if (ans) s = answerCheckIn(s, c.key, ans.id); }
          }
          if (!PASSIVE) {
            const fresh = unseenUrgent(s);
            if (fresh.length) {
              s = markTipsSeen(s, fresh);
              for (const id of fresh) {
                cnt.tips++;
                let t2 = meetTip(s, id, 'underboss');
                if (t2 === s) t2 = meetTip(s, id, 'boss');
                s = t2;
                const tip = s.threats?.tips.find((t) => t.id === id);
                if (tip) { const r = responsesFor(s, tip); if (r[0]) s = respondTip(s, id, r[0]); }
              }
            }
          } else cnt.tips += unseenUrgent(s).length;
          // The climber: works the ladder every week on day 1 (a sponsor, coffee with his chief, the call-in when it opens).
          if (CLIMBER && d === 1 && inTheRanks(s)) {
            const a = above(s);
            const tries: PlayerAction[] = [{ kind: 'power', op: { op: 'climb' } } as PlayerAction];
            if (a && stationOf(s) === 'associate' && !a.sponsors.some((id) => s.characters[id]?.alive)) { const v = vouchCandidates(s)[0]; if (v) tries.push({ kind: 'power', op: { op: 'low', a: { op: 'askVouch', id: v.id } } } as PlayerAction); }
            const chief = a?.myCapoId ?? a?.capoIds[0];
            if (chief) tries.push({ kind: 'power', op: { op: 'low', a: { op: 'coffee', id: chief } } } as PlayerAction);
            for (const x of tries) {
              try {
                if (previewAction(s, x).disabledReason) continue;
                if (instant(s, x)) { s = actNow(s, x).state; cnt.now++; } else { actions.push(x); cnt.queued++; }
                break;
              } catch (e) { if (lastActFail++ < 5) errors.push(`wk${wk} climb: ${(e as Error).message.slice(0, 200)}`); }
            }
          }
          if (d === actDay) {
            try {
              const a = recommendedActions(s, undefined, actions)[0]?.action;
              if (a && !previewAction(s, a).disabledReason) {
                if (instant(s, a)) { s = actNow(s, a).state; cnt.now++; } else { actions.push(a); cnt.queued++; }
              }
            } catch (e) { if (lastActFail++ < 5) errors.push(`wk${wk} act: ${(e as Error).message.slice(0, 200)}`); }
          }
          checkBoss(dPrev, s, `day${d}-orders`);
          if (d < 6) {
            const prevDay = s;
            const t0 = performance.now();
            const day = advanceDay(s);
            dayMs += performance.now() - t0;
            s = day.state;
            for (const l of day.landed) { cnt.quiet++; strikeLines.push(l.line); }
            for (const id of day.strikes) {
              const v = momentView(s, id);
              if (!v) continue;
              const open = v.options.filter((o) => !o.blocked);
              const best = [...open].sort((a, b) => b.odds - a.odds)[0];
              const opt = !PASSIVE && h32(`${SEED}:${id}:strike`) < 0.6 && best ? best.id : v.def;
              const r = answerMoment(s, id, opt);
              if (r.result.ok) { s = r.state; cnt.strikes++; strikeLines.push(r.result.line); }
            }
            if (!PASSIVE) for (const tip of s.threats?.tips ?? []) {
              if ((tip.status === 'met' || tip.status === 'sent') && !tip.response && tip.week >= s.week - 1) { const r = responsesFor(s, tip); if (r[0]) s = respondTip(s, tip.id, r[0]); }
            }
            const ex = extraToday(s);
            if (ex) { s = markExtraShown(s, ex.id); cnt.extra++; }
            checkBoss(prevDay, s, `day${d + 1}`);
          }
        } catch (e) {
          // Record it, then drop the day's due and live scheduled items (the usual culprit) and go on, so the decade still runs.
          errors.push(`CRASH-DAY wk${wk} (+${wk - startWeek}) d${d}: ${(e as Error).message.slice(0, 300)} @ ${(e as Error).stack?.split('\n').slice(1, 4).join(' | ')}`);
          dayCrash = true;
          const A = s.action;
          if (A?.sched) s = { ...s, action: { ...A, sched: A.sched.filter((x) => x.w > s.week || (x.w === s.week && x.d > daysOf(s).day)) } };
          if (errors.filter((x) => x.startsWith('CRASH')).length > 20) break;
        }
      }
      if (errors.filter((x) => x.startsWith('CRASH')).length > 20) break;
      if (s.gameOver) { persist(false, wi); break; }
      s = closeWeek(s);
      answerOut();
      const base: PlayerChoices = { choices: answers, actions };
      if (!PASSIVE) {
        const t = s.tribute;
        const pend = t?.reports.find((r) => r.status === 'presented');
        if (t && s.week <= startWeek) base.envelope = { split: { personal: 2500, treasury: 7500, reserve: 0 }, standing: true };
        else if (pend) base.envelope = { report: pend.id, split: { personal: 2500, treasury: 7500, reserve: 0 }, grant: pend.petitions.filter((x) => x.amount < s.money / 10).map((x) => x.id) };
      }
      const choices = weekChoices(s, base);
      const prev = s;
      const t0 = performance.now();
      let res;
      try { res = advanceWeek(s, choices); } catch (e) { errors.push(`CRASH wk${wk} (+${wk - startWeek}): ${(e as Error).message.slice(0, 300)} @ ${(e as Error).stack?.split('\n').slice(1, 4).join(' | ')}`); break; }
      const ms = performance.now() - t0;
      s = res.state;
      checkBoss(prev, s, 'turn');
      // Rungs (low starts).
      const st = stationOf(s);
      if (st !== station) { rungs.push({ w: s.week - startWeek, date: iso(s), from: station, to: st }); station = st; }
      const boss = s.characters[s.playerId];
      if (boss && (boss.imprisonedUntil ?? 0) > s.week && !((prev.characters[prev.playerId]?.imprisonedUntil ?? 0) > prev.week)) bossJail.push({ w: s.week - startWeek, until: boss.imprisonedUntil! - startWeek });
      // Deaths and arrests this week (the whole week, from its first day).
      let myDeaths = 0, myViolent = 0, dynDeaths = 0, arrests = 0, births = 0;
      for (const c of Object.values(s.characters)) {
        const was = weekStart.characters[c.id];
        if (!was && c.dynasty && ageOn(c.birth, s.date) < 1) births++;
        // A child born more than 10 months after his father died (or his mother).
        if (!was && ageOn(c.birth, s.date) < 1) for (const pid of [c.fatherId, c.motherId]) {
          const p = pid ? s.characters[pid] : undefined;
          if (p && !p.alive && p.death && s.week - p.death.week > 43) { const key = `posthumous birth (${pid === c.fatherId ? 'father' : 'mother'} dead > 43 wks)`; const e = integ[key]; if (e) e.n++; else integ[key] = { first: s.week - startWeek, n: 1, sample: `wk${s.week - startWeek} ${c.id} ${nm(s, c.id)} born; ${nm(s, pid)} died wk${p.death.week - startWeek}` }; }
        }
        if (was?.alive && !c.alive && (c.faction === 'player' || c.dynasty)) { myDeaths++; if (c.death?.killer && c.death.killer !== 'none') myViolent++; if (c.dynasty) dynDeaths++; }
        if (was && c.alive && c.faction === 'player' && (c.imprisonedUntil ?? 0) > s.week && !((was.imprisonedUntil ?? 0) > weekStart.week)) arrests++;
      }
      // Factions (plots against the boss) and wars.
      for (const f of s.factions ?? []) if (!seenFactions.has(f.id)) { seenFactions.add(f.id); factionLog.push({ w: s.week - startWeek, agenda: f.agenda ?? f.demand, size: f.memberIds.length }); }
      let newWars = 0; for (const w of s.wars) if (!seenWars.has(w.id)) { seenWars.add(w.id); newWars++; }
      // Capos.
      const cap = crewOf(s).filter((c) => c.rank === 'capo' || c.rank === 'underboss');
      const loy = cap.map((k) => opinion(s, k.id, s.playerId));
      const stances: Record<string, number> = {};
      for (const k of cap) { const b = s.capos?.books[k.id]; if (b) stances[b.st] = (stances[b.st] ?? 0) + 1; }
      // Territory.
      const terr = s.districts.filter((d) => { const me = d.influence.player ?? 0; return me > 0 && Object.entries(d.influence).every(([f, v]) => f === 'player' || (v ?? 0) < me); }).length;
      const infl = Math.round(s.districts.reduce((a, d) => a + (d.influence.player ?? 0), 0));
      // Money lines.
      let upkeep = 0, income = 0, spend = 0;
      for (const l of res.report.lines) if (l.stat === 'money') { if (/^The upkeep of a big operation/.test(l.label)) upkeep += -l.amount; if (l.amount > 0) income += l.amount; else spend += -l.amount; }
      const logs = [...res.log, ...strikeLines];
      const hits: Record<string, number> = {};
      for (const l of logs) for (const [k, rx] of Object.entries(LOGRX)) if (rx.test(l)) hits[k] = (hits[k] ?? 0) + 1;
      const dyn = Object.values(s.characters).filter((c) => c.alive && c.dynasty);
      const ib = integrity(s);
      for (const b of ib) { const key = b.replace(/[-\d.]+/g, '#'); const e = integ[key]; if (e) e.n++; else integ[key] = { first: s.week - startWeek, n: 1, sample: `wk${s.week - startWeek} ${b}` }; }
      const H = s.feds?.hollow;
      const rec = {
        w: s.week - startWeek, date: iso(s), ms: Math.round(ms), dayMs: Math.round(dayMs),
        boss: s.playerId, bossAge: boss ? ageOn(boss.birth, s.date) : null, bossHealth: boss?.health, bossJailed: boss ? (boss.imprisonedUntil ?? 0) > s.week : null, station: st, rank: boss?.rank, standing: s.power?.above?.standing,
        money: Math.round(s.money), fam: familyCash(s), pocket: Math.round(pocketCash(s)), bossWealth: Math.round(boss?.wealth ?? 0), gross: Math.round(res.report.grossIncome), income: Math.round(income), spend: Math.round(spend), upkeep,
        respect: s.respect, heat: { l: s.heat.local, f: s.heat.family, x: s.heat.federal },
        crew: crewOf(s).length, made: crewOf(s).filter((c) => c.rank !== 'associate').length, capos: cap.length, jailed: crewOf(s).filter((c) => (c.imprisonedUntil ?? 0) > s.week).length,
        terr, infl, loy: loy.length ? Math.round(loy.reduce((a, b) => a + b, 0) / loy.length) : null, loyMin: loy.length ? Math.min(...loy) : null, stances,
        heir: heirInfo(s), dyn: dyn.length, dynAdult: dyn.filter((c) => ageOn(c.birth, s.date) >= 16).length, dynMinor: dyn.filter((c) => ageOn(c.birth, s.date) < 16).length,
        births, myDeaths, myViolent, dynDeaths, arrests, newWars, wars: s.wars.length, factions: (s.factions ?? []).length,
        hollow: H ? (H.dmw ? 'dmw' : 'hollow') : null, legal: s.legal?.stage ?? null,
        tpl: s.pendingEvents.map((e) => templateOf(e)), cnt, hits, dayCrash,
        chars: Object.keys(s.characters).length, bad: ib.slice(0, 4),
      };
      if (OUT) appendFileSync(`${OUT}.weeks.jsonl`, `${JSON.stringify(rec)}\n`);
      const wdone = wi + 1;
      if (wdone === 52 || wdone === 260 || wdone === 520 || wdone % 104 === 0) snapshot(`y${(wdone / 52).toFixed(0)}`);
      if (wdone % 13 === 0) persist(false, wdone);
    }
    if (s.gameOver) snapshot('gameover');
    persist(true, s.week - startWeek);
    // eslint-disable-next-line no-console
    console.log(`[decadesim] ${START}/${SEED}/${POLICY}: ${s.week - startWeek} weeks, successions ${successions.length}, errors ${errors.length}${s.gameOver ? `, GAME OVER ${JSON.stringify(s.gameOver).slice(0, 160)}` : ''}`);
  });
});
