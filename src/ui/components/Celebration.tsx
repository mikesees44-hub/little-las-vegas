import { useEffect, useRef, useState } from 'react';
import type { GameState, Rank } from '../../engine/types';
import { fmt$ } from '../format';

/**
 * MILESTONES: a short banner that drops in over the top of the screen and goes (3.4 s): the end of the
 * week (what the Family made), a big score, getting made, a promotion, taking the chair. It only reads
 * the state it is given and changes nothing. Decorative and polite: role="status", and under reduced
 * motion it simply shows and goes.
 */

const RANK_LINE: Partial<Record<Rank, [string, string]>> = {
  soldier: ['You got made', 'A soldier of the family. Nobody touches you now.'],
  capo: ['Capo', 'A crew of your own, a district to run.'],
  consigliere: ['Consigliere', 'The boss\'s ear. Your word weighs.'],
  underboss: ['Underboss', 'One step from the chair.'],
  boss: ['The chair is yours', 'Head of the family.'],
};

interface Banner { key: number; kicker: string; title: string; line: string; tone: 'gold' | 'green' | 'wine' }

export function Celebration({ s }: { s: GameState }) {
  const me = s.characters[s.playerId];
  const prev = useRef<{ week: number; rank?: Rank; seed: string } | undefined>(undefined);
  const [b, setB] = useState<Banner | undefined>();
  useEffect(() => {
    const p = prev.current;
    prev.current = { week: s.week, rank: me?.rank, seed: s.seed };
    if (!p || p.seed !== s.seed) return;
    let next: Omit<Banner, 'key'> | undefined;
    if (me && p.rank && me.rank !== p.rank && RANK_LINE[me.rank]) {
      const [title, line] = RANK_LINE[me.rank]!;
      next = { kicker: me.rank === 'soldier' ? 'Getting made' : 'A promotion', title, line, tone: 'wine' };
    } else if (s.week > p.week && s.lastReport) {
      const d = Math.round(s.lastReport.end.money - s.lastReport.start.money);
      const big = d >= 20000;
      next = {
        kicker: big ? 'A big score' : `Week ${p.week} is done`,
        title: d >= 0 ? `+${fmt$(d)} to the Family` : `−${fmt$(-d)} for the Family`,
        line: big ? 'The kind of week they talk about on the boardwalk.' : d >= 0 ? 'The envelope came in. On to the next.' : 'A lean week. The men noticed.',
        tone: big || d >= 0 ? (big ? 'gold' : 'green') : 'wine',
      };
    }
    if (next) setB({ ...next, key: Date.now() });
  }, [s.week, s.seed, me?.rank, s.lastReport, me]);
  useEffect(() => {
    if (!b) return;
    const t = setTimeout(() => setB(undefined), 3500);
    return () => clearTimeout(t);
  }, [b]);
  if (!b) return null;
  return (
    <div key={b.key} className={`llv-celebrate llv-celebration llv-celebration-${b.tone} pointer-events-none fixed left-1/2 top-[8.5rem] z-[1180] w-[min(92vw,460px)] md:top-24`} role="status" data-testid="celebration">
      <div className="llv-kicker text-center">{b.kicker}</div>
      <div className="text-center font-display text-2xl font-extrabold leading-tight sm:text-3xl">{b.title}</div>
      <div className="text-center text-[12.5px] text-stone-200">{b.line}</div>
    </div>
  );
}
