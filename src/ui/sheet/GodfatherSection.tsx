import { godchildrenOf, openOffer } from '../../engine/godfather';
import { answerOffer } from '../../engine/godfatherAct';
import type { Character, Choice, GameState } from '../../engine/types';
import { CardHead } from '../components/Layout';
import { domCard } from '../domain';
import { useShell } from '../shell/context';

/** What a choice costs out of the Family's money (0 for none). */
const costOf = (ch: Choice) => ch.effects.reduce((a, e) => a + (e.type === 'money' && e.amount < 0 ? -e.amount : 0), 0);

/**
 * PAY FOR THE WEDDING, STAND GODFATHER (GODFATHER_LOYALTY_SKILLS.md §A) on a
 * person's sheet: this week's wedding or christening in his family, answered
 * right here (the same choices as the event card, odds on the button), and
 * the godchildren the boss has through him. On the boss's own sheet: every
 * godchild he has.
 */
export function GodfatherSection({ s, c }: { s: GameState; c: Character }) {
  const { update } = useShell();
  const isBoss = c.id === s.playerId;
  const ev = isBoss ? undefined : openOffer(s, c.id);
  const kids = isBoss ? s.gf?.g ?? [] : godchildrenOf(s, c.id);
  if (!ev && !kids.length) return null;
  return (
    <section className={`llv-card-box llv-card-plain mt-3 p-2.5 text-xs ${domCard('church')}`} data-domain="church" data-testid="sheet-godfather">
      <CardHead d="church" glyph="✝" title={ev ? ev.title : isBoss ? 'Your godchildren' : `Your godchildren through ${c.firstName}`} className="!mb-1" />
      {ev && (
        <div data-testid="gf-offer">
          <p className="text-[11.5px] leading-snug text-stone-300">{ev.text}</p>
          <div className="mt-1.5 grid gap-1 sm:grid-cols-2" role="group" aria-label={ev.title}>
            {ev.choices.map((ch) => {
              const cost = costOf(ch);
              const why = ch.disabledReason ?? (cost > s.money ? 'The Family does not have the money' : undefined);
              return (
                <button key={ch.id} type="button" disabled={!!why || !update} title={why}
                  className="rounded border border-noir-600 px-2 py-1 text-left text-[12px] text-stone-200 hover:border-gold-500 disabled:opacity-50"
                  onClick={() => update?.((cur) => answerOffer(cur, ev.iid, ch.id))} data-testid={`gf-choice-${ch.id}`}>
                  <b>{ch.label}</b>
                  {ch.detail && <span className="block text-[11px] text-stone-400">{ch.detail}</span>}
                  {why && <span className="block text-[10.5px] text-amber-300">{why}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-1 text-[10.5px] text-stone-500">Answer here or on the week's card. What happens goes in Your File.</div>
        </div>
      )}
      {kids.length > 0 && (
        <ul className={`${ev ? 'mt-2' : ''} space-y-0.5 text-[11.5px] text-stone-300`} data-testid="gf-godchildren">
          {kids.map((g) => {
            const f = s.characters[g[0]];
            return <li key={`${g[0]}|${g[1]}`}>✝ {g[1]} <span className="text-stone-500">({g[3] ? 'godson' : 'goddaughter'}{isBoss && f ? `, ${f.firstName} ${f.lastName}'s` : ''} · since week {g[2]})</span></li>;
          })}
        </ul>
      )}
    </section>
  );
}
