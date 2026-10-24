import { capos, displayName } from './characters';
import type { Ctx } from './ledger';
import { chance, pick } from './rng';
import type { Character, GameState, Secret, SecretKind } from './types';

/**
 * Secrets: affairs, debts, skimming, informants, an unsanctioned drug deal,
 * an old killing, a hidden child. Known secrets can be turned into strong
 * hooks (blackmail) or exposed. The consigliere digs them up.
 */

const TEXT: Record<SecretKind, (c: Character) => string> = {
  affair: (c) => `${c.firstName} ${c.lastName} keeps a woman in an apartment in Ocean City`,
  debt: (c) => `${c.firstName} ${c.lastName} owes a Camden shylock more than he can pay`,
  drugs: (c) => `${c.firstName} ${c.lastName} is moving narcotics behind his own boss's back`,
  murder: (c) => `${c.firstName} ${c.lastName} killed a man in 1955 and the body was never found`,
  skimming: (c) => `${c.firstName} ${c.lastName} skims from his envelopes`,
  informant: (c) => `${c.firstName} ${c.lastName} talks to the FBI`,
  bastard: (c) => `${c.firstName} ${c.lastName} has a child nobody is supposed to know about`,
  plot: (c) => `${c.firstName} ${c.lastName} plotted against you`,
};

export function addSecret(s: GameState, c: Character, kind: SecretKind, knownBy: Secret['knownBy'] = []): Secret {
  const ex = s.secrets.find((x) => x.ownerId === c.id && x.kind === kind);
  if (ex) return ex;
  const sec: Secret = { id: `x${s.nextId++}`, ownerId: c.id, kind, text: TEXT[kind](c), knownBy, week: s.week };
  s.secrets.push(sec);
  return sec;
}

/** Seeds secrets among rivals, officials and the crew. */
export function seedSecrets(s: GameState): void {
  for (const c of Object.values(s.characters)) {
    if (!c.alive || c.id === s.playerId) continue;
    const rival = s.rivals.some((r) => r.id === c.faction);
    if ((rival || c.office) && c.rank !== 'associate' && chance(s, 0.4)) addSecret(s, c, pick(s, c.office ? ['affair', 'debt', 'affair'] : ['affair', 'debt', 'drugs', 'murder'] as SecretKind[]));
  }
}

/** Monthly: secrets that follow from what people do. */
export function secretsMonth(s: GameState): void {
  for (const c of capos(s)) if ((c.skimmed ?? 0) >= 600) addSecret(s, c, 'skimming');
  const rat = s.flags.informant ? s.characters[`c${s.flags.informant}`] : undefined;
  if (rat?.alive) addSecret(s, rat, 'informant');
  s.secrets = s.secrets.filter((x) => s.characters[x.ownerId]?.alive);
}

/** The consigliere turns intel into a known secret. Returns true if one was found. */
export function discoverSecret(ctx: Ctx): boolean {
  const s = ctx.s;
  const hidden = s.secrets.filter((x) => !x.knownBy.includes('player') && x.kind !== 'plot' && s.characters[x.ownerId]?.alive);
  if (!hidden.length) return false;
  const sec = pick(s, hidden);
  sec.knownBy.push('player');
  const c = s.characters[sec.ownerId];
  ctx.log.push(`Your consigliere learned something: ${sec.text}.`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `You learned a secret about ${displayName(c)}.`, kind: 'misc' });
  return true;
}

export function knownSecrets(s: GameState, charId: string): Secret[] {
  return s.secrets.filter((x) => x.ownerId === charId && x.knownBy.includes('player'));
}
