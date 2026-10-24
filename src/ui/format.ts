import type { Effect, GameState, Stat } from '../engine/types';

export function fmt$(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

export const STAT_LABEL: Record<Stat, string> = {
  money: 'Treasury',
  respect: 'Respect',
  'heat.local': 'Local heat',
  'heat.family': 'Family heat',
  'heat.federal': 'Federal heat',
};

/** Is this effect good for the player? (for chip colour) */
export function effectTone(_s: GameState, e: Effect): 'good' | 'bad' | 'neutral' {
  switch (e.type) {
    case 'money':
    case 'respect':
      return e.amount > 0 ? 'good' : e.amount < 0 ? 'bad' : 'neutral';
    case 'heat':
      return e.amount < 0 ? 'good' : e.amount > 0 ? 'bad' : 'neutral';
    case 'opinion':
    case 'crewOpinion':
    case 'familyOpinion':
    case 'rivalOpinion':
    case 'influence':
    case 'health':
      return e.amount > 0 ? 'good' : e.amount < 0 ? 'bad' : 'neutral';
    case 'kill':
      return 'bad';
    case 'recruit':
    case 'addBusiness':
      return 'good';
    default:
      return 'neutral';
  }
}
