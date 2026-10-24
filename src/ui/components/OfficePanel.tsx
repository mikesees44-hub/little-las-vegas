import type { GameState } from '../../engine/types';
import { ActionCard } from './Orders';

/** The Boss's Office: Sunday office hours and the petitions answered. */
export function OfficePanel({ s }: { s: GameState }) {
  const answered = s.chronicle.filter((c) => c.kind === 'decision' && /office|roof|lockup|landlord|grocery|beach|debt|nephew|cousin/i.test(c.text)).slice(-6).reverse();
  return (
    <div className="space-y-3" data-testid="office">
      <div>
        <h2 className="font-display text-2xl text-gold-400">The Boss's Office</h2>
        <p className="text-sm text-stone-400">The back room of the social club on a Sunday afternoon. People come with what they can't take to City Hall — rent, a son in lockup, a church roof. What you say is remembered.</p>
      </div>
      <ActionCard s={s} action={{ kind: 'officeHours' }} />
      {answered.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Lately</div>
          <ul className="mt-1 space-y-0.5 text-sm text-stone-300">
            {answered.map((c, i) => <li key={i}>{c.text}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
