import { perkMod } from './lifestyle';
import { isInSeason } from './calendar';
import { capos, crew, displayName, isFree } from './characters';
import { heat, money, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { chance } from './rng';
import { fedEase, policeEase } from './polIntegrity';
import type { Attributes, Character, CouncilTask, GameState, Seat } from './types';

/**
 * The Administration (CK's council). Five seats, each with one task at a
 * time. Every task's weekly result scales with the holder's skill in the
 * seat's attribute (skill 60 = ×1.0). Results post to the ledger under the
 * seat holder's name.
 */

export const SEATS: Seat[] = ['underboss', 'consigliere', 'bagman', 'enforcer', 'fixer'];

export const SEAT_INFO: Record<Seat, { name: string; skill: keyof Attributes; blurb: string }> = {
  underboss: { name: 'Underboss', skill: 'leadership', blurb: 'Second in command. Keeps the crew in line and the streets earning.' },
  consigliere: { name: 'Consigliere', skill: 'intrigue', blurb: 'Counsel, diplomacy, and ears in every back room.' },
  bagman: { name: 'Bagman', skill: 'business', blurb: 'Counts the money, washes it, and watches the capos\' envelopes.' },
  enforcer: { name: 'Enforcer', skill: 'force', blurb: 'Collections, intimidation, and protection.' },
  fixer: { name: 'Fixer', skill: 'diplomacy', blurb: 'Politics: envelopes at City Hall, favors in Trenton, friends at the federal building.' },
};

export interface TaskDef {
  seat: Seat;
  name: string;
  text: string;
  /** Needs a rival target. */
  targeted?: boolean;
}

export const TASKS: Record<CouncilTask, TaskDef> = {
  ub_discipline: { seat: 'underboss', name: 'Keep the crew in line', text: 'Crew opinion rises slowly; neglected men are noticed sooner.' },
  ub_streets: { seat: 'underboss', name: 'Work the streets', text: 'Adds a share of the week\'s gross from the corners.' },
  ub_guard: { seat: 'underboss', name: 'Guard the boss', text: 'Makes attempts on your life much harder.' },
  cons_relations: { seat: 'consigliere', name: 'Improve relations', text: 'Slowly wins over a rival boss.', targeted: true },
  cons_secrets: { seat: 'consigliere', name: 'Dig for secrets', text: 'Uncovers plots, informants, skimmers and other people\'s secrets.' },
  cons_table: { seat: 'consigliere', name: 'Work the Table', text: 'Keeps Philadelphia sweet: family heat cools faster, Table votes lean your way.' },
  bag_launder: { seat: 'bagman', name: 'Launder', text: 'Raises how much dirty money the fronts can wash.' },
  bag_tax: { seat: 'bagman', name: 'Count the capos\' envelopes', text: 'Capos skim far less. They resent it.' },
  bag_book: { seat: 'bagman', name: 'Run the shylock book', text: 'Borrowers miss fewer payments.' },
  enf_collect: { seat: 'enforcer', name: 'Collect', text: 'Shakes extra money out of the island. Draws a little heat.' },
  enf_intimidate: { seat: 'enforcer', name: 'Intimidate witnesses', text: 'The law\'s files on your men grow thinner.' },
  enf_protect: { seat: 'enforcer', name: 'Protect the rackets', text: 'Rival strikes cost you less and kill fewer men.' },
  fix_cops: { seat: 'fixer', name: 'Grease the cops', text: 'Envelopes downtown ($100/wk): local heat cools faster.' },
  fix_favors: { seat: 'fixer', name: 'Collect favors', text: 'Lunches in Trenton ($200/wk): a chance each week to bank a political favor.' },
  fix_feds: { seat: 'fixer', name: 'Cool the feds', text: 'Friends at the federal building ($250/wk): federal heat cools faster.' },
};

export const DEFAULT_TASK: Record<Seat, CouncilTask> = {
  underboss: 'ub_streets', consigliere: 'cons_secrets', bagman: 'bag_launder', enforcer: 'enf_protect', fixer: 'fix_cops',
};

export function emptyCouncil(): GameState['council'] {
  return Object.fromEntries(SEATS.map((st) => [st, { task: DEFAULT_TASK[st] }])) as GameState['council'];
}

export function holder(s: GameState, seat: Seat): Character | undefined {
  const id = s.council?.[seat]?.holderId;
  const c = id ? s.characters[id] : undefined;
  return c && c.alive && c.faction === 'player' && isFree(s, c) && c.id !== s.playerId ? c : undefined;
}

/** Skill multiplier for a seat (0 if empty). 60 skill = 1.0. */
export function seatPower(s: GameState, seat: Seat): number {
  const c = holder(s, seat);
  return c ? Math.max(0.2, c.attributes[SEAT_INFO[seat].skill] / 60) : 0;
}

/** The task a seat is running, if the seat is filled. */
export function activeTask(s: GameState, task: CouncilTask): number {
  const seat = TASKS[task].seat;
  return s.council?.[seat]?.task === task ? seatPower(s, seat) : 0;
}

export function seatOf(s: GameState, charId: string): Seat | undefined {
  return SEATS.find((st) => s.council?.[st]?.holderId === charId);
}

/** Drop dead, jailed or departed seat holders. */
export function tidyCouncil(s: GameState): void {
  if (!s.council) return;
  for (const st of SEATS) {
    const id = s.council[st].holderId;
    const c = id ? s.characters[id] : undefined;
    if (id && (!c || !c.alive || c.faction !== 'player' || c.id === s.playerId)) s.council[st].holderId = undefined;
  }
}

/** Pick sensible holders for empty seats at the start of a game. */
export function fillCouncil(s: GameState): void {
  const used = new Set<string>();
  for (const st of SEATS) {
    const ex = crew(s).find((c) => c.rank === st);
    if (ex) {
      s.council[st].holderId = ex.id;
      used.add(ex.id);
    }
  }
  for (const st of ['bagman', 'enforcer', 'fixer'] as Seat[]) {
    if (s.council[st].holderId) continue;
    const skill = SEAT_INFO[st].skill;
    const pick = crew(s).filter((c) => !used.has(c.id) && c.rank === 'soldier').sort((a, b) => b.attributes[skill] - a.attributes[skill])[0];
    if (pick) {
      s.council[st].holderId = pick.id;
      used.add(pick.id);
    }
  }
}

/** The weekly council: every filled seat does its job. */
export function runCouncil(ctx: Ctx): void {
  const s = ctx.s;
  tidyCouncil(s);
  const boss = s.characters[s.playerId];
  for (const st of SEATS) {
    const c = holder(s, st);
    if (!c) continue;
    const k = seatPower(s, st);
    const task = s.council[st].task;
    const who = `${SEAT_INFO[st].name} ${c.firstName} ${c.lastName}`;
    switch (task) {
      case 'ub_discipline':
        if (s.week % 4 === 0) for (const m of crew(s)) if (m.id !== c.id) addOpinion(s, m.id, boss.id, 'The underboss keeps good order', Math.max(1, Math.round(2 * k)), 1);
        break;
      case 'ub_streets': {
        const amt = Math.round(ctx.gross * 0.05 * k);
        if (amt > 0) money(ctx, amt, `${who} works the streets`, 'street');
        break;
      }
      case 'cons_relations': {
        const r = s.rivals.find((x) => x.id === s.council[st].target);
        if (r && s.characters[r.leaderId]?.alive && opinion(s, r.leaderId, boss.id) < 40 && s.week % 2 === 0) {
          addOpinion(s, r.leaderId, boss.id, `Your consigliere's diplomacy`, Math.max(1, Math.round(2 * k)), 1);
        }
        break;
      }
      case 'cons_secrets':
        s.flags.intel = (s.flags.intel ?? 0) + 10 * k * (1 + perkMod(s, 'intel') / 100);
        break;
      case 'cons_table':
        s.flags.tableFrac = (s.flags.tableFrac ?? 0) + 0.6 * k;
        if (s.flags.tableFrac >= 1 && s.heat.family > 0) {
          const n = Math.floor(s.flags.tableFrac);
          s.flags.tableFrac -= n;
          heat(ctx, 'family', -n, `${who} keeps Philadelphia sweet`, 'heat');
        }
        break;
      case 'enf_collect': {
        const amt = Math.round((150 + (isInSeason(s.date) ? 350 : 80)) * k);
        money(ctx, amt, `${who} collects on the island`, 'street');
        if (s.week % 2 === 0) heat(ctx, 'local', 1, `${who}'s collections draw complaints`, 'heat');
        break;
      }
      case 'enf_intimidate':
        for (const m of crew(s, true)) if ((m.evidence ?? 0) > 0) m.evidence = Math.max(0, (m.evidence ?? 0) - Math.max(1, Math.round(k)));
        break;
      case 'fix_cops':
        money(ctx, -100, `${who}: envelopes downtown`, 'cost');
        if (s.heat.local > 0) heat(ctx, 'local', -Math.max(1, Math.round((1 + k) * policeEase(s))), `${who} greases the cops`, 'heat');
        break;
      case 'fix_favors':
        money(ctx, -200, `${who}: lunches in Trenton`, 'cost');
        if (chance(s, 0.06 * k * (1 + perkMod(s, 'favor') / 100))) {
          s.favors += 1;
          ctx.log.push(`${displayName(c)} banked a favor with a state assemblyman.`);
        }
        break;
      case 'fix_feds':
        money(ctx, -250, `${who}: friends at the federal building`, 'cost');
        if (s.heat.federal > 0) heat(ctx, 'federal', -Math.max(1, Math.round(k * fedEase(s))), `${who} cools the feds`, 'heat');
        break;
      default:
        break; // passive tasks (guard, launder, tax, book, protect) are read where they apply
    }
  }
  // The bagman counting the envelopes is resented, a little, every month.
  if (activeTask(s, 'bag_tax') && s.week % 4 === 0) for (const c of capos(s)) addOpinion(s, c.id, boss.id, 'The bagman counts every dollar', -2, 1);
  // Stipends for the three appointed seats (underboss/consigliere draw rank wages).
  const paid = (['bagman', 'enforcer', 'fixer'] as Seat[]).filter((st) => holder(s, st));
  if (paid.length) money(ctx, -40 * paid.length, `Council stipends: ${paid.map((st) => SEAT_INFO[st].name.toLowerCase()).join(', ')}`, 'cost');
}
