import { displayName } from '../../engine/characters';
import { audienceChance } from '../../engine/audience';
import { pwView } from '../../engine/powerState';
import type { GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { CharLink } from '../components/People';

const STATUS: Record<string, string> = { open: 'waiting', ruled: 'ruled', investigating: 'being looked into', caught: 'caught lying', confirmed: 'told the truth', unclear: 'nobody can say' };

/** The audience chamber: petitions from the crew and the town, built on real trouble. Some petitioners lie. */
export function AudiencePanel({ s }: { s: GameState }) {
  const p = pwView(s);
  const recent = p.petitions.slice(-8).reverse();
  return (
    <div className="space-y-3" data-testid="audience">
      <div>
        <h2 className="font-display text-2xl text-gold-400">The Audience Chamber</h2>
        <p className="text-sm text-stone-400">Your own people come too: a corner two capos both claim, an envelope that came in light, a man passed over, a debt to the wrong shylock, a rival who wants a sit-down. Not everyone tells the truth. Have it looked into before you rule. ({Math.round(audienceChance(s) * 100)}% a week at your standing{p.front ? '; they come to you, not the front boss' : ''}.)</p>
      </div>
      <ActionCard s={s} action={{ kind: 'power', op: { op: 'audience' } }} />
      {recent.length > 0 && (
        <ul className="text-sm text-stone-300 space-y-0.5">
          {recent.map((r) => {
            const c = s.characters[r.petitionerId];
            return <li key={r.id}>Week {r.week}: {c ? <CharLink s={s} id={c.id}>{displayName(c)}</CharLink> : 'someone'} — {r.claim} · <span className={r.status === 'caught' ? 'text-red-300' : r.status === 'confirmed' ? 'text-emerald-300' : 'text-stone-400'}>{STATUS[r.status]}</span>{r.ruling ? ` (${r.ruling})` : ''}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
