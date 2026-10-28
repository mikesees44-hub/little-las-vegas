import { askingPrice, floorPrice, haggle, type EveningKind, type HaggleMove } from '../evening';
import { BOLD_AMOUNTS, boldReply, boldScene, SCENE_LINE, type BoldResult } from '../quickies';
import type { GameState, PlayerAction } from '../types';
import { startDialogue, stepDialogue, type Dialogue, type Tone } from './dialogue';

/**
 * The nightlife moments in the two-way window. The money and her answer stay
 * the existing engine's (evening.ts `haggle`, quickies.ts `boldReply`): the
 * window adds her meters and her lines, and a walk-out when she has had
 * enough. Its end is the same order the old cards gave (`nightlife` invite /
 * car / bold), which the order card then carries out: she still decides.
 */

const MOVE: Partial<Record<Tone, HaggleMove>> = { accept: 'accept', negotiate: 'counter', raise: 'sweeten', flirt: 'line', compliment: 'line', joke: 'line' };

/** Her price, on the table (her floor is the reservation, hidden). */
export function startHaggle(s: GameState, id: string, kind: EveningKind | 'car'): Dialogue {
  const ask = askingPrice(s, id, kind).price;
  const floor = floorPrice(s, id, kind);
  return startDialogue(s, id, 'haggle', { label: 'Her price', unit: '$', dir: 1, ask, res: floor, lo: Math.round(ask * 0.4), hi: ask * 2 });
}

/**
 * One round of the haggle. The meters move with the tone (stepDialogue); the
 * price, the deal and the walk come from evening.ts `haggle` (for the moves it
 * knows), so the economics are the old ones. `tip` for Raise the offer.
 */
export function haggleTurn(s: GameState, d: Dialogue, kind: EveningKind | 'car', tone: Tone, offer?: number, tip?: number): { d: Dialogue; tip?: number } {
  const move = MOVE[tone];
  const st = d.stake!;
  const r = stepDialogue(s, d, tone, { offer });
  const nd = r.d;
  if (!move || tone === 'walk') return { d: nd };
  const ask = st.pos;
  const h = haggle(s, d.id, kind, move, move === 'counter' ? (offer ?? Math.round((ask * 0.85) / 10) * 10) : ask, d.round, ask);
  // Her answer is the engine's: replace the generic line and the stake's result with it.
  const last = nd.log[nd.log.length - 1]?.who === 'narrator' ? nd.log.length - 2 : nd.log.length - 1;
  if (last >= 0) nd.log[last] = { who: 'them', text: h.line.replace(/^"|"$/g, '') };
  nd.stake = { ...nd.stake!, pos: h.price };
  if (h.result === 'deal') { nd.end = 'deal'; nd.deal = h.price; nd.log = nd.log.filter((l) => l.who !== 'narrator'); }
  else if (h.result === 'walk') { nd.end = 'walkout'; }
  else if (nd.end === 'deal') { nd.end = undefined; nd.deal = undefined; }
  return { d: nd, ...(move === 'sweeten' ? { tip: tip ?? Math.max(20, Math.round(ask / 50) * 10) } : {}) };
}

/** The bold offer: each Raise puts a bigger figure down; her answer is quickies.ts `boldReply`. */
export function startBold(s: GameState, id: string): Dialogue {
  return startDialogue(s, id, 'romance', { label: 'Your offer', unit: '$', dir: -1, ask: 0, res: 0, lo: 0, hi: BOLD_AMOUNTS[BOLD_AMOUNTS.length - 1] * 4 }, 5);
}

export function boldTurn(s: GameState, d: Dialogue, amount: number): { d: Dialogue; result: BoldResult; raises: number } {
  const raises = d.log.filter((l) => l.tone === 'raise').length;
  const r = stepDialogue(s, d, 'raise', { say: `${raises ? 'Make it' : 'Lean over:'} $${amount.toLocaleString('en-US')}, right here. Nobody'll see.` });
  const nd = r.d;
  const rep = boldReply(s, d.id, amount, raises);
  const last = nd.log.map((l) => l.who).lastIndexOf('them');
  if (last >= 0) nd.log[last] = { who: 'them', text: rep.line };
  nd.log = nd.log.filter((l) => l.who !== 'narrator');
  nd.stake = { ...nd.stake!, off: amount, pos: amount };
  nd.end = undefined;
  if (rep.result === 'yes') { nd.end = 'deal'; nd.deal = amount; }
  else if (rep.result === 'out' || rep.result === 'line') nd.end = 'walkout';
  else if (rep.result === 'no') nd.anger = Math.min(100, nd.anger + 10);
  const scene = boldScene(s, d.id, amount, raises);
  if (scene !== 'none') nd.log.push({ who: 'narrator', text: SCENE_LINE[scene] });
  if (!nd.end && nd.anger >= 75) nd.end = 'walkout';
  return { d: nd, result: rep.result, raises };
}

/** The order the window ends in (the same ops the old cards gave). */
export function nightOrder(kind: 'car', id: string, d: Dialogue): PlayerAction | undefined;
export function nightOrder(kind: 'bold', id: string, d: Dialogue, after?: import('../quickies').BoldAfter): PlayerAction | undefined;
export function nightOrder(kind: 'car' | 'bold', id: string, d: Dialogue, after?: import('../quickies').BoldAfter): PlayerAction | undefined {
  if (kind === 'car') return d.end === 'deal' && d.deal !== undefined ? { kind: 'nightlife', op: { op: 'car', id, price: d.deal } } : undefined;
  const offers = d.log.filter((l) => l.tone === 'raise').length;
  const amount = d.stake?.off;
  if (!amount) return undefined;
  return { kind: 'nightlife', op: { op: 'bold', id, amount, raises: Math.max(0, offers - 1), ...(after ? { after } : {}) } };
}
