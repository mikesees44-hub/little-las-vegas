import { displayName } from './characters';
import type { GameState } from './types';

/**
 * HUMAN NAMES FOR AGREEMENTS (A06). The take keeps every agreement under a
 * stable internal id (`agr:capo:c214`, `agr:ent:b44`, …) for its history.
 * Players see a title and a counterparty instead; the id itself appears only
 * in the developer inspector (Settings → Show internal ids).
 */
export interface AgreementName {
  /** "Donato Sees's district contract". */
  title: string;
  /** Who the agreement is with ("Donato Sees, capo of the Boardwalk"). */
  party: string;
  kind: 'capo' | 'member' | 'enterprise' | 'investment' | 'other';
}

export function agreementName(s: GameState, id: string): AgreementName {
  const [, kind, ref = ''] = id.split(':');
  const who = s.characters[ref];
  const nm = who ? displayName(who) : 'Someone gone';
  if (kind === 'capo') {
    const d = s.districts.find((x) => x.capoId === ref);
    return { kind: 'capo', title: `${nm}'s district contract`, party: `${nm}, capo${d ? ` of ${d.name}` : ''}` };
  }
  if (kind === 'member') {
    const k = who?.capoId ? s.characters[who.capoId] : undefined;
    return { kind: 'member', title: `${nm}'s terms`, party: `${nm}${k ? `, in ${k.firstName}'s crew` : ''}` };
  }
  if (kind === 'ent') {
    const b = s.businesses.find((x) => x.id === ref);
    return { kind: 'enterprise', title: `${b?.name ?? 'A family business'}: profit to the Family`, party: b?.name ?? 'A family business' };
  }
  if (kind === 'inv') {
    const inv = s.tribute?.investments.find((x) => x.id === ref);
    return { kind: 'investment', title: `Investment: ${inv?.what ?? 'a capo\'s pitch'}`, party: inv?.what ?? 'an investment' };
  }
  return { kind: 'other', title: 'An agreement', party: '' };
}

/** A history line ("wk 3 · agr:capo:c24: …") without the internal id. */
export function agreementHistoryLine(s: GameState, h: { week: number; id: string; text: string }): string {
  return `wk ${h.week} · ${agreementName(s, h.id).title}: ${h.text}`;
}
