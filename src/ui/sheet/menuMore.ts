import { holder, SEATS, TASKS } from '../../engine/council';
import { gesturesFor } from '../../engine/bonds';
import { menActionsFor, openWrongs } from '../../engine/myMen';
import { LIFESTYLES } from '../../engine/lifestyle';
import { pwView } from '../../engine/powerState';
import { MOB_RIVALS } from '../../engine/intrigueState';
import type { Character, CouncilTask, GameState, LifestyleId, PlayerAction, RivalId } from '../../engine/types';
import type { MenuGroupId, MenuItem } from './menuCatalog';

/**
 * PEOPLE FIRST (STREAMLINE S9): the orders that used to live only on a screen
 * but are aimed at one man — his envelope and his terms, the books, making his
 * bones, his council seat's job, taking care of him or disciplining him, the
 * grievance he holds, turning one of theirs, a plan aimed at him, his answer
 * to a talk, his campaign — now also sit in his menu. The screens keep them
 * too: nothing moved away, the man is one more door.
 */
type Add = (id: MenuGroupId, item: MenuItem) => void;

export function addMore(s: GameState, c: Character, add: Add): void {
  const B = s.playerId;
  const boss = s.characters[B];
  const isBoss = c.id === B;
  const mine = c.faction === 'player' && c.rank !== 'civilian' && !isBoss;
  const A = (a: PlayerAction): PlayerAction => a;

  if (isBoss) {
    // The law (LawPanel): a lawyer on retainer, lie low.
    add('self', { key: 'legal:retainer', action: A({ kind: 'legal', op: 'retainer' }) });
    add('self', { key: 'legal:lielow', action: A({ kind: 'legal', op: 'lielow' }) });
    // Hear the people who come to see you; your own guard.
    add('self', { key: 'audience', action: A({ kind: 'power', op: { op: 'audience' } }) });
    add('self', { key: 'bodyguards', action: A({ kind: 'power', op: { op: 'bodyguards', on: !pwView(s).bodyguards } }) });
    // How you rule (Lifestyle): the focus, one tap.
    for (const id of Object.keys(LIFESTYLES) as LifestyleId[]) if (id !== s.characters[B]?.lifestyle?.focus) add('self', { key: `life:${id}`, action: A({ kind: 'lifestyle', focus: id }) });
    return;
  }

  // Your people (bonds.ts): your wife, your kids, a goomar, a friend: the gestures that fit him or her now.
  for (const a of gesturesFor(s, c.id)) add('bonds', { key: `bond:${JSON.stringify(a)}`, action: a });

  if (mine) {
    // Take care of him, back him, discipline him (My Men).
    for (const m of menActionsFor(s, c.id)) {
      const op = (m.action as Extract<PlayerAction, { kind: 'mymen' }>).op.op;
      add(m.group === 'discipline' ? 'discipline' : 'care', { key: `men:${op}`, action: m.action, hostile: op === 'kill' || op === 'demote' });
    }
    // His envelope (the weekly take): an audit of his crew, his terms.
    if (c.rank === 'capo') add('envelope', { key: 'trib:audit', action: A({ kind: 'tribute', op: { op: 'audit', capoId: c.id } }), label: `Audit ${c.firstName}'s crew` });
    add('envelope', { key: 'trib:ext', action: A({ kind: 'tribute', op: { op: 'terms', charId: c.id, kind: 'extension', weeks: 4 } }), label: `Give ${c.firstName} four weeks' grace on his envelope` });
    add('envelope', { key: 'trib:forgive', action: A({ kind: 'tribute', op: { op: 'forgive', charId: c.id } }) });
    if (holder(s, 'underboss')?.id === c.id) add('envelope', { key: 'trib:auditUb', action: A({ kind: 'tribute', op: { op: 'auditUb' } }), label: `Audit ${c.firstName}'s share` });
    // The books: make him the bookkeeper.
    if (c.rank !== 'capo' && s.ledgerBook?.keeperId !== c.id) add('envelope', { key: 'ledger:keeper', action: A({ kind: 'ledger', op: { op: 'keeper', charId: c.id } }), label: `Make ${c.firstName} the bookkeeper` });
    // Make your bones (an associate's chance).
    if (c.rank === 'associate') {
      for (const k of ['collection', 'heist', 'hit'] as const) add('crew', { key: `bones:${k}`, action: A({ kind: 'bones', op: { op: 'assign', charId: c.id, kind: k } }), hostile: k === 'hit' });
      add('crew', { key: 'bones:favor', action: A({ kind: 'bones', op: { op: 'favor', charId: c.id } }) });
    }
    // His council seat's job this week.
    for (const st of SEATS) {
      if (holder(s, st)?.id !== c.id) continue;
      const cur = s.council?.[st]?.task;
      for (const [id, t] of Object.entries(TASKS)) {
        if (t.seat !== st || id === cur) continue;
        const target = t.targeted ? (s.council?.[st]?.target ?? s.rivals.find((r) => r.kind === 'mob')?.id) : undefined;
        add('council', { key: `task:${id}`, action: A({ kind: 'councilTask', seat: st, task: id as CouncilTask, ...(target ? { target } : {}) }), label: `His job: ${t.name.toLowerCase()}` });
      }
    }
    // Call up his crew for a war, or send them home.
    if (c.rank === 'capo' && s.wars.length) {
      const up = !!s.army?.levies?.[c.id];
      add('crew', { key: up ? 'army:disband' : 'army:raise', action: A({ kind: 'army', op: up ? { op: 'disband', holder: c.id } : { op: 'raise', holder: c.id } }) });
    }
    // Spies: plant him inside a family; question him if you suspect him.
    if (c.rank === 'soldier' || c.rank === 'associate') {
      for (const r of MOB_RIVALS.filter((x) => s.rivals.some((y) => y.id === x)).slice(0, 3)) add('spies', { key: `plant:${r}`, action: A({ kind: 'intrigue', op: { op: 'plant', charId: c.id, rival: r as RivalId } }) });
    }
    if ((s.intrigue?.suspect[c.id] ?? 0) > 0) {
      add('spies', { key: 'q:talk', action: A({ kind: 'intrigue', op: { op: 'question', charId: c.id, how: 'talk' } }) });
      add('spies', { key: 'q:hard', action: A({ kind: 'intrigue', op: { op: 'question', charId: c.id, how: 'hard' } }), hostile: true });
    }
    const mole = s.intrigue?.spies.find((x) => x.charId === c.id && !x.ended && x.inside === 'player' && x.master !== 'player');
    if (mole) for (const fate of ['feed', 'forgive', 'exile', 'bury'] as const) add('spies', { key: `mole:${fate}`, action: A({ kind: 'intrigue', op: { op: 'moleFate', charId: c.id, fate } }), hostile: fate === 'bury' || fate === 'exile' });
    const mySpy = s.intrigue?.spies.find((x) => x.charId === c.id && !x.ended && x.master === 'player');
    if (mySpy) add('spies', { key: 'recall', action: A({ kind: 'intrigue', op: { op: 'recall', spyId: mySpy.id } }) });
    // Someone wronged him: have his back (a sit-down, payback, war, or let it go).
    for (const w of openWrongs(s).filter((x) => x.charId === c.id).slice(0, 1)) {
      for (const how of ['sitdown', 'payback', 'war', 'drop'] as const) add('care', { key: `wrong:${w.id}:${how}`, action: A({ kind: 'mymen', op: { op: 'answer', wrong: w.id, how } }), hostile: how === 'war' });
    }
    // The underboss's court: his report, have it out with him.
    if (holder(s, 'underboss')?.id === c.id && s.shadow) {
      add('heirs', { key: 'sh:report', action: A({ kind: 'power', op: { op: 'shadow', a: { op: 'report' } } }) });
      add('heirs', { key: 'sh:confront', action: A({ kind: 'power', op: { op: 'shadow', a: { op: 'confront' } } }), hostile: true });
    }
    // How hard his crew takes up the Family's technology.
    if (c.rank === 'capo') for (const level of [0, 1, 2] as const) add('crew', { key: `mandate:${level}`, action: A({ kind: 'dev', op: { t: 'mandate', capo: c.id, level } }), label: `${c.firstName}'s crew and the new ways: ${['his call', 'encouraged', 'ordered'][level]}` });
    // A front boss: put him in your chair in name.
    if (c.rank === 'capo' && !pwView(s).front) add('heirs', { key: 'front', action: A({ kind: 'power', op: { op: 'front', charId: c.id, type: 'willing' } }), label: `Put ${c.firstName} up as the front boss` });
  }

  // A grievance he holds against you: make amends.
  for (const g of (pwView(s).grievances ?? []).filter((x) => x.charId === c.id && x.byId === B).slice(0, 1)) {
    for (const kind of ['apology', 'money', 'share'] as const) add('talk', { key: `amends:${g.id}:${kind}`, action: A({ kind: 'power', op: { op: 'amends', grievanceId: g.id, kind } }) });
  }

  // One of theirs: turn him (a rival family's man, not its boss).
  const rival = s.rivals.find((r) => r.id === c.faction && r.kind === 'mob');
  if (rival && rival.leaderId !== c.id && c.rank !== 'civilian' && !s.intrigue?.spies.some((x) => x.charId === c.id && !x.ended)) {
    for (const how of ['bribe', 'debt', 'blackmail'] as const) add('spies', { key: `turn:${how}`, action: A({ kind: 'intrigue', op: { op: 'turn', targetId: c.id, how } }), hostile: true });
  }
  // Their boss: the cold war against his family.
  if (rival && rival.leaderId === c.id) {
    add('table', { key: 'int:sitdown', action: A({ kind: 'intrigue', op: { op: 'sitdown', rival: rival.id as RivalId } }) });
    add('hostile', { key: 'blitz', action: A({ kind: 'power', op: { op: 'blitz', rival: rival.id as RivalId } }), hostile: true });
    add('hostile', { key: 'int:sabotage', action: A({ kind: 'intrigue', op: { op: 'sabotage', rival: rival.id as RivalId } }), hostile: true });
  }

  // A plan you have running at him: call it off.
  for (const sc of s.schemes.filter((x) => x.owner === 'player' && x.targetId === c.id).slice(0, 3)) add('intrigue', { key: `cancel:${sc.id}`, action: A({ kind: 'cancelScheme', schemeId: sc.id }) });

  // His answer to a talk you opened: take his counteroffer, or not.
  for (const t of (s.talks?.pending ?? []).filter((x) => x.target === c.id && x.kind === 'counter')) {
    add('talk', { key: `ans:${t.id}:y`, action: A({ kind: 'talk', op: { t: 'answer', id: t.id, yes: true } }) });
    add('talk', { key: `ans:${t.id}:n`, action: A({ kind: 'talk', op: { t: 'answer', id: t.id, yes: false } }) });
  }

  // His wife: her allowance.
  if (boss?.spouseId === c.id) add('bonds', { key: 'allowance', action: A({ kind: 'tribute', op: { op: 'allowance', charId: c.id, weekly: 150 } }), label: `Give ${c.firstName} an allowance ($150 a week)` });

  // A man who runs one of your places: audit his books.
  for (const [key] of Object.entries(s.econ?.managers ?? {}).filter(([, m]) => m.charId === c.id).slice(0, 2)) add('envelope', { key: `audit:${key}`, action: A({ kind: 'econ', op: { type: 'audit', key } }) });

  // A candidate in an election: fund him, endorse him.
  const pp = Object.values(s.pol?.people ?? {}).find((x) => x.charId === c.id);
  if (pp) {
    for (const e of (s.pol?.elections ?? []).filter((x) => x.candidates.some((k) => k.id === pp.id)).slice(0, 1)) {
      add('campaign', { key: `fund:${e.id}`, action: A({ kind: 'pol', op: { op: 'fund', election: e.id, cand: pp.id, amount: 1000 } }) });
      add('campaign', { key: `endorse:${e.id}`, action: A({ kind: 'pol', op: { op: 'endorse', election: e.id, cand: pp.id } }) });
    }
  }
}
