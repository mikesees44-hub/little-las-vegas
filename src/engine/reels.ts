import { isInSeason } from './calendar';
import { displayName } from './characters';
import { heat, type Ctx } from './ledger';
import { mgOf } from './minigame';
import { BULLETIN, LEADER } from './newspaper';
import type { Character, GameDate, GameState } from './types';

/**
 * THE NEWSPAPER REEL: after a hit (clean, public, botched, witnessed, a body
 * that disappears), a major arrest or the boss slain, a front page spins
 * out of the dark and lands on a headline built from what actually
 * happened, with one line underneath saying what it cost. The engine finds
 * the week's stories and writes them down; the UI spins them.
 */

export const STAR_LEDGER = 'Newark Star-Ledger';

export type ReelPhoto = 'car' | 'boardwalk' | 'diner' | 'window' | 'dock' | 'arrest' | 'restaurant' | 'courthouse';

export interface Reel {
  week: number;
  paper: string;
  headline: string;
  subhead: string;
  date: GameDate;
  photo: ReelPhoto;
  consequence: string;
  note?: string;
}

const up = (c: Character) => `${c.firstName} ${c.lastName}`.toUpperCase();

function heatFor(ctx: Ctx, c: Character, bar: 'local' | 'family' | 'federal' = 'local'): number {
  const tail = `${c.firstName} ${c.lastName}`;
  return ctx.lines.filter((l) => l.stat === `heat.${bar}` && l.amount > 0 && l.label.endsWith(tail)).reduce((a, l) => a + l.amount, 0);
}

/** Called at the end of the week with the state the week started from. */
export function reelsWeek(ctx: Ctx, prev: GameState): void {
  const s = ctx.s;
  if (s.mg?.reels) delete s.mg.reels;
  const out: Omit<Reel, 'week' | 'date'>[] = [];
  const quiet = !isInSeason(s.date);
  const sub = (x: string) => (quiet ? `${x}, in quiet resort town` : x);
  const cue = (k: string) => s.cutscenes.some((c) => c.key === k);

  // Hits the house ordered that came due this week.
  for (const sc of prev.schemes) {
    if (sc.kind !== 'murder' || sc.owner !== 'player' || !sc.targetId || s.schemes.some((x) => x.id === sc.id)) continue;
    const t = s.characters[sc.targetId];
    if (!t) continue;
    const shooter = sc.agents.map((id) => s.characters[id]).find((x) => !!x);
    const rival = s.rivals.find((r) => r.id === t.faction);
    const paper = t.faction === 'philly' || t.faction === 'feldstein' ? BULLETIN : LEADER;
    if (!t.alive && t.death?.week === prev.week) {
      const h = heatFor(ctx, t);
      if (/disappeared/.test(t.death.cause)) {
        out.push({ paper, headline: `${up(t)} MISSING SINCE SATURDAY`, subhead: sub('Wife pleads for information; car found at Otten\'s Harbor'), photo: 'dock', consequence: `Heat +${h || 2}. The family waits. People wonder.` });
      } else if (cue('hit_witness')) {
        out.push({ paper, headline: 'WITNESS SAW GUNMAN, POLICE SAY', subhead: sub('Prosecutor promises protection for "brave citizen"'), photo: 'window', consequence: `Evidence on ${shooter ? shooter.firstName + ' ' + shooter.lastName : 'the shooter'} +25. Local heat +${h}.` });
      } else if (sc.opts.location === 'boardwalk') {
        out.push({ paper, headline: 'GUNFIRE ON THE BOARDWALK', subhead: sub('Summer crowd scatters near Hunt\'s Pier; one man dead'), photo: 'boardwalk', consequence: `Local heat +${h}. Tourists stay away from the boards for a while.` });
      } else {
        out.push({ paper, headline: `${up(t)} FOUND DEAD IN PARKED CAR`, subhead: sub('Police call it a "gangland-style killing"; no witnesses'), photo: 'car', consequence: `Local heat +${h}. The Prosecutor calls a press conference.` });
      }
    } else if (t.alive && cue('hit_botched')) {
      out.push({ paper, headline: `${up(t)} SURVIVES AMBUSH OUTSIDE DINER`, subhead: sub('Wounded man refuses to name attackers'), photo: 'diner', consequence: `${t.firstName} knows. ${rival ? `${rival.shortName} is coming.` : 'Somebody is coming.'} Local heat +${heatFor(ctx, t)}.` });
    }
  }

  // A major arrest: the boss indicted, or a capo picked up.
  const pl = prev.legal;
  if (s.legal && s.legal.stage === 'indicted' && pl?.stage !== 'indicted' && s.legal.personId === s.playerId) {
    const b = s.characters[s.playerId];
    out.push({ paper: STAR_LEDGER, headline: `FEDS ARREST ${up(b)} IN DAWN RAID`, subhead: 'Grand jury indictment unsealed in Newark', photo: 'arrest', consequence: 'Opens the trial.' });
  }
  for (const c of Object.values(s.characters)) {
    const was = prev.characters[c.id];
    if (!was || c.faction !== 'player' || (c.rank !== 'capo' && c.rank !== 'underboss')) continue;
    if ((c.imprisonedUntil ?? 0) >= s.week + 12 && (was.imprisonedUntil ?? 0) <= prev.week) {
      out.push({ paper: STAR_LEDGER, headline: `FEDS ARREST ${up(c)} IN DAWN RAID`, subhead: 'Grand jury indictment unsealed in Newark', photo: 'arrest', consequence: mgOf(s).open.includes(c.id) ? 'Opens the trial.' : `${c.firstName} goes to the county jail.` });
      break;
    }
  }

  // The boss slain.
  if (prev.playerId !== s.playerId) {
    const old = s.characters[prev.playerId];
    if (old && !old.alive && old.death?.killer && old.death.killer !== 'none') {
      out.push({ paper: BULLETIN, headline: `${up(old)} SLAIN; "WAR" FEARED`, subhead: 'Police brace for reprisals across South Jersey', photo: 'restaurant', consequence: `Opens the succession crisis. ${displayName(s.characters[s.playerId])} takes the chair.` });
    }
  }

  if (!out.length) return;
  const mg = mgOf(s);
  const reels: Reel[] = out.slice(0, 2).map((r) => ({ ...r, week: prev.week, date: { ...prev.date } }));
  // Tone variants: a hot island makes the Bulletin's editorial page; a Fixer with the editor buries it.
  const fixer = s.council?.fixer?.holderId ? s.characters[s.council.fixer.holderId] : undefined;
  const lead = reels[0];
  if (fixer?.alive && lead.paper === LEADER && lead.photo !== 'arrest') {
    lead.note = `${fixer.firstName} has the editor: the story runs on page 14, under the tide tables.`;
    const h = Number(/heat \+(\d+)/i.exec(lead.consequence)?.[1] ?? 0);
    if (h >= 2) heat(ctx, 'local', -Math.floor(h / 2), `${fixer.firstName} had the Leader bury the story`, 'heat');
    lead.consequence += ' (halved: page 14)';
  } else if (s.heat.local >= 60 && s.week - (s.flags.littleChicago ?? -999) >= 26 && lead.photo !== 'arrest') {
    s.flags.littleChicago = s.week;
    reels.push({ week: prev.week, date: { ...prev.date }, paper: BULLETIN, headline: 'WILDWOOD: NEW JERSEY\'S LITTLE CHICAGO?', subhead: 'An editorial', photo: lead.photo, consequence: 'Federal heat +5. Washington reads the Bulletin too.' });
    heat(ctx, 'federal', 5, 'Editorial: "Wildwood: New Jersey\'s Little Chicago?"', 'heat');
  }
  mg.reels = reels;
  for (const r of reels) s.news.push({ week: s.week, date: { ...s.date }, paper: r.paper === STAR_LEDGER ? BULLETIN : r.paper, headline: r.headline, body: r.subhead, kind: 'reel' });
}
