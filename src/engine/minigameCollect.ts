import { player } from './characters';
import { beat, clamp, hashOf, hit, mgEffect, registerAttacher, registerMinigame, usd, type MgOption, type MgSession, type MinigameDef } from './minigame';
import type { Effect, GameState, Loan } from './types';

/**
 * THE COLLECTION ROUND: the shylock book's late payers, one at a time. Each
 * debtor has a temperament you read (more or less well); you choose how to
 * handle him: talk, lean on him (non-graphic), take the collateral, or
 * forgive. What comes back, and what it costs, depends on the man.
 */

type Temper = 'broke' | 'proud' | 'scared' | 'slippery' | 'connected';
type Way = 'talk' | 'lean' | 'collateral' | 'forgive';

const TEMPERS: Temper[] = ['broke', 'proud', 'scared', 'slippery', 'connected'];
const LINE: Record<Temper, string> = {
  broke: 'Behind on everything: the rent, the milkman, you.',
  proud: 'Won\'t be pushed. Would rather lose the money than his face.',
  scared: 'Sweats when you walk in. Pays when he has to.',
  slippery: 'Has a story for everything, and money he isn\'t mentioning.',
  connected: 'Drinks with somebody who matters. Lean too hard and it comes back.',
};
/** Share of the principal that comes back, by temperament and approach. */
const BACK: Record<Temper, Record<Exclude<Way, 'collateral' | 'forgive'>, number>> = {
  broke: { talk: 0.5, lean: 0.4 },
  proud: { talk: 0.7, lean: 0.2 },
  scared: { talk: 0.6, lean: 0.95 },
  slippery: { talk: 0.3, lean: 0.85 },
  connected: { talk: 0.65, lean: 0.3 },
};

interface Debtor {
  loanId: string;
  name: string;
  job: string;
  owed: number;
  temper: Temper;
  /** What you read him as, and how sure. */
  read: Temper;
  sure: number;
  collateral?: string;
  done?: Way;
  got?: number;
}

export interface CollectData {
  debtors: Debtor[];
  cur: number;
  fx: Effect[];
}

type CS = MgSession<CollectData>;

function chanceOf(t: Temper, w: Way): number {
  if (w === 'forgive' || w === 'collateral') return 1;
  return BACK[t][w];
}

function opts(_s: GameState, ses: CS): MgOption[] {
  const d = ses.d.debtors[ses.d.cur];
  const exp = (w: Exclude<Way, 'collateral' | 'forgive'>) => Math.round(BACK[d.read][w] * d.owed);
  return [
    { id: 'talk', label: 'Talk to him', detail: `If he is ${d.read}, expect about ${usd(exp('talk'))} back.` },
    { id: 'lean', label: 'Lean on him', detail: `If he is ${d.read}, expect about ${usd(exp('lean'))}. Some men go to the cops; some have friends.`, tone: 'risky' },
    ...(d.collateral ? [{ id: 'collateral', label: `Take ${d.collateral}`, detail: 'He signed it over when he took the money.' }] : []),
    { id: 'forgive', label: 'Forgive it', detail: `−${usd(d.owed)} on the book, −1 respect, and the whole street hears you have a heart.` },
  ];
}

function step(_s: GameState, ses: CS, move: string): void {
  const D = ses.d;
  const d = D.debtors[D.cur];
  const w = move as Way;
  d.done = w;
  const label = `Collection: ${d.name}`;
  const p = chanceOf(d.temper, w);
  if (w === 'forgive') {
    D.fx.push({ type: 'loanResolve', loanId: d.loanId, mode: 'writeoff', label }, { type: 'respect', amount: -1, label });
    beat(ses, `You tear up ${d.name}'s marker in front of him. He cries a little.`, 'info');
  } else if (w === 'collateral') {
    D.fx.push(...(ses.parts[`take_${d.loanId}`] ?? []));
    beat(ses, `${d.name} hands over the keys to ${d.collateral}.`, 'good');
  } else {
    const ok = hit(ses, 0.25 + p * 0.75);
    const got = ok ? Math.round((d.owed * p) / 50) * 50 : 0;
    d.got = got;
    if (got > 0) D.fx.push({ type: 'money', amount: got, label });
    D.fx.push({ type: 'loanResolve', loanId: d.loanId, mode: 'writeoff', label });
    if (w === 'lean') {
      D.fx.push({ type: 'heat', bar: 'local', amount: d.temper === 'proud' ? 4 : 2, label }, { type: 'respect', amount: 1, label });
      if (d.temper === 'connected') D.fx.push({ type: 'heat', bar: 'local', amount: 3, label: `${label}: he had friends` });
    }
    beat(ses, got > 0 ? `${d.name} ${w === 'lean' ? 'finds the money, fast' : 'finds what he can'}: ${usd(got)}. He was ${d.temper}.` : `${d.name} has nothing, or says so. He was ${d.temper}.`, got > 0 ? 'good' : 'bad');
  }
  D.cur += 1;
  if (D.cur >= D.debtors.length) {
    ses.done = true;
    ses.phase = 'end';
    const total = D.debtors.reduce((a, x) => a + (x.got ?? 0), 0);
    ses.outcome = { title: 'The collection round', text: `${D.debtors.length} debtor${D.debtors.length > 1 ? 's' : ''}; ${usd(total)} back on the book.`, tone: total > 0 ? 'good' : 'mixed', effects: D.fx };
  } else beat(ses, `Next: ${D.debtors[D.cur].name}, ${D.debtors[D.cur].job}.`, 'info');
}

function auto(_s: GameState, ses: CS): string {
  const d = ses.d.debtors[ses.d.cur];
  if (d.collateral && ses.parts[`take_${d.loanId}`]) return 'collateral';
  return BACK[d.read].lean > BACK[d.read].talk ? 'lean' : 'talk';
}

export const COLLECTION: MinigameDef<CollectData> = {
  id: 'collection',
  init: (s, ses) => {
    const first = String(ses.params.loan);
    const late = s.loans.filter((l) => l.id === first || l.weeksLate > 0).sort((a, b) => Number(b.id === first) - Number(a.id === first)).slice(0, 3);
    const enforcer = s.council?.enforcer?.holderId ? s.characters[s.council.enforcer.holderId] : undefined;
    const eye = (enforcer?.attributes.intrigue ?? player(s).attributes.intrigue) / 100;
    const debtors: Debtor[] = late.map((l: Loan) => {
      const temper = TEMPERS[hashOf(`${s.seed}:${l.id}`) % TEMPERS.length];
      const sure = clamp(0.45 + eye * 0.5, 0.4, 0.95);
      const read = hit(ses, sure) ? temper : TEMPERS[(TEMPERS.indexOf(temper) + 1 + Math.floor(ses.rng % 3)) % TEMPERS.length];
      const [name, job] = l.borrower.split(', ');
      return { loanId: l.id, name, job: job ?? '', owed: l.principal, temper, read, sure, collateral: l.collateral && ses.parts[`take_${l.id}`] ? l.collateralName : undefined };
    });
    beat(ses, debtors.length ? `First: ${debtors[0].name}, ${debtors[0].job}.` : 'Nobody on the book is late.', 'info');
    return { d: { debtors, cur: 0, fx: [] }, phase: 'round', intro: { title: 'The collection round', kicker: 'The book', text: `${debtors.length} name${debtors.length === 1 ? '' : 's'} in the book are late. You read each man before you decide how to ask. Nobody gets hurt in this game who doesn't have to.`, scene: 'street' } };
  },
  options: opts,
  step,
  auto,
};
registerMinigame(COLLECTION);

export const debtorLine = LINE;

registerAttacher((_s, ev) => {
  if (ev.defId !== 'borrower_default' || !ev.meta?.loan) return undefined;
  const loanId = String(ev.meta.loan);
  const take = ev.choices.find((c) => c.id === 'take');
  return { id: 'round', label: 'Make the rounds yourself', detail: 'Him and the other late names in the book: read each man, choose how to ask.', because: 'made the collection rounds', effects: [mgEffect('collection', ev.iid, { loan: loanId, play: 1 }, take ? { [`take_${loanId}`]: take.effects } : {})] };
});
