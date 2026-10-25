import type { GameState } from '../../engine/types';
import { Chronicle } from '../components/Chronicle';
import { Newspapers } from '../components/Newspaper';
import { Storylines } from '../components/Storylines';

export type FeedFilter = 'all' | 'mine' | 'street' | 'family' | 'papers' | 'stories' | 'reports';
export function Feed({ s, filter }: { s: GameState; filter: FeedFilter }) {
  if (filter === 'papers') return <Newspapers s={s} />;
  if (filter === 'stories') return <Storylines s={s} />;
  return <Chronicle s={s} />;
}
