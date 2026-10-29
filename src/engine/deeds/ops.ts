import { addStory } from '../hierarchy';
import type { Ctx } from '../ledger';
import { remember } from '../minds/memory';
import { ensureMinds, mindOf } from '../minds/state';
import { startRumor } from '../minds/beliefs';
import type { GameState } from '../types';
import { sceneNext, sceneRoll } from '../authored/run';
import { DEEDS } from './catalog';
import { doDeed } from './resolve';
import { cdKey, ensureDeeds, setTie } from './state';
import { LOG_CAP, OWED_CAP, TIE_LABEL, type DeedOp } from './types';

/**
 * The `deed` Effect: the deeds layer's own bookkeeping, applied through the
 * one ledger like every other effect (so a scene, a popup's answer and an
 * order all change the same state the same way).
 */
export function applyDeedOp(ctx: Ctx, o: DeedOp): void {
  const s = ctx.s;
  const D = ensureDeeds(s);
  switch (o.op) {
    case 'note': {
      D.log.push({ w: s.week, id: o.id, a: o.a, t: o.t, r: o.r, x: o.x.slice(0, 200), p: o.p });
      if (D.log.length > LOG_CAP) D.log.splice(0, D.log.length - LOG_CAP);
      if (o.cd > 0 && o.cd < 999) D.cd[cdKey(o.id, o.a, o.t)] = s.week + o.cd;
      else if (o.cd >= 999) D.cd[cdKey(o.id, o.a, o.t)] = s.week + 5200;
      D.stats.done++;
      if (o.a !== s.playerId) D.stats.npc++;
      ctx.log.push(o.x);
      if (o.r === 'crit' || o.r === 'critFail') {
        addStory(s, s.characters[o.t], o.x);
        if (o.t === s.playerId || o.a === s.playerId) s.chronicle.push({ week: s.week, date: { ...s.date }, text: o.x, kind: 'misc' });
      } else if (o.t === s.playerId) s.chronicle.push({ week: s.week, date: { ...s.date }, text: o.x, kind: 'misc' });
      break;
    }
    case 'owe':
      D.owed.push({ by: o.by, to: o.to, w: s.week, y: o.y.slice(0, 60) });
      if (D.owed.length > OWED_CAP) D.owed.splice(0, D.owed.length - OWED_CAP);
      break;
    case 'spendOwed': {
      const i = D.owed.findIndex((x) => x.by === o.by && x.to === o.to);
      if (i >= 0) D.owed.splice(i, 1);
      break;
    }
    case 'npcHook': {
      const ex = D.hooks.find((h) => h.h === o.h && h.t === o.t);
      if (ex) { ex.s = (ex.s || o.s) as 0 | 1; ex.w = s.week; }
      else D.hooks.push({ h: o.h, t: o.t, s: o.s, w: s.week, y: o.y.slice(0, 60) });
      break;
    }
    case 'mem': {
      const m = mindOf(s, o.who);
      if (m) remember(m, { w: s.week, k: o.v >= 0 ? 'favor' : 'slight', who: o.about, t: o.t, v: o.v });
      break;
    }
    case 'tie':
      setTie(s, o.a, o.b, o.k, o.y);
      if (o.k) {
        const a = s.characters[o.a];
        const b = s.characters[o.b];
        if (a && b && (o.k === 'feud' || o.k === 'rival')) { addStory(s, a, `${TIE_LABEL[o.k]} with ${b.firstName} ${b.lastName}`); addStory(s, b, `${TIE_LABEL[o.k]} with ${a.firstName} ${a.lastName}`); }
      }
      break;
    case 'edu':
      D.edu[o.child] = [o.tutor, o.focus, s.week];
      break;
    case 'answered':
      D.asks = D.asks.filter((x) => x.id !== o.ask);
      break;
    case 'rumor': {
      const M = ensureMinds(s);
      const t = s.characters[o.on];
      if (!t) break;
      // The teller: the man himself if he has a mind; else someone with a mind near the target (the boss plants through a friendly ear).
      const ids = Object.keys(M.minds).filter((id) => id !== o.on).sort();
      const teller = mindOf(s, o.by) ?? M.minds[ids.find((id) => s.characters[id]?.faction === t.faction) ?? ids[0]];
      if (!teller) break;
      const tr = o.k === 'skim' ? (t.skimmed ?? 0) > 0 : o.k === 'rat' ? !!t.informantFor : false;
      startRumor(s, M, teller, { k: o.k, by: o.on, tr }, !tr);
      break;
    }
    case 'sceneFired':
      D.sc[o.id] = s.week;
      D.stats.scenes++;
      break;
    case 'sceneRoll':
      sceneRoll(ctx, o.id, o.c, o.cast, o.p);
      break;
    case 'sceneNext':
      sceneNext(s, o.id, o.after, o.cast, o.from);
      break;
    case 'npcDeed':
      if (DEEDS[o.id]) doDeed(ctx, o.id, o.a, o.t);
      break;
    case 'partner':
      D.pt.push({ a: o.a, b: o.b, w: s.week, n: o.n });
      if (D.pt.length > 20) D.pt.splice(0, D.pt.length - 20);
      setTie(s, o.a, o.b, 'ally', 'Partners');
      break;
    case 'loan':
      D.ln.push({ by: o.by, to: o.to, amt: o.amt, due: o.due });
      if (D.ln.length > 20) D.ln.splice(0, D.ln.length - 20);
      break;
    case 'legit': {
      const c = s.characters[o.child];
      const f = s.characters[o.father];
      if (!c || !f) break;
      c.fatherId = f.id;
      c.bioFatherId = undefined;
      c.dynasty = true;
      c.lastName = f.lastName;
      if (!f.childrenIds.includes(c.id)) f.childrenIds.push(c.id);
      break;
    }
    case 'disown': {
      const c = s.characters[o.who];
      if (!c) break;
      c.dynasty = false;
      if (s.designatedHeirId === c.id) s.designatedHeirId = undefined;
      break;
    }
  }
}

export function describeDeedOp(s: GameState, o: DeedOp): string | undefined {
  const n = (id: string) => s.characters[id]?.firstName ?? '?';
  switch (o.op) {
    case 'owe': return `${n(o.by)} owes ${o.to === s.playerId ? 'you' : n(o.to)} a favor`;
    case 'spendOwed': return `Spends the favor ${n(o.by)} owes`;
    case 'npcHook': return `${n(o.h)} has something on ${n(o.t)}`;
    case 'tie': return o.k ? `${n(o.a)} & ${n(o.b)}: ${TIE_LABEL[o.k].toLowerCase()}` : `${n(o.a)} & ${n(o.b)}: no longer close`;
    case 'edu': return `${n(o.tutor)} teaches ${n(o.child)} (${o.focus})`;
    case 'rumor': return `A story about ${n(o.on)} goes around`;
    case 'partner': return `Partners: $${o.n}/month each for a year`;
    case 'loan': return `${n(o.to)} owes ${o.by === s.playerId ? 'you' : n(o.by)} $${o.amt.toLocaleString('en-US')} by week ${o.due}`;
    case 'legit': return `${n(o.child)} takes your name`;
    case 'disown': return `${n(o.who)} is out of the house`;
    case 'npcDeed': return `${n(o.a)} ${DEEDS[o.id]?.name({ s, a: s.characters[o.a], t: s.characters[o.t], boss: false, tBoss: false } as never).toLowerCase().split(' ')[0] ?? o.id}s ${n(o.t)}`;
    case 'sceneRoll': return `${o.p}% it goes your way`;
    case 'sceneNext': return 'The story goes on…';
    default: return undefined;
  }
}
