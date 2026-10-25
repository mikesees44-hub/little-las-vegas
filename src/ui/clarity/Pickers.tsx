import { useState } from 'react';
import { needsBones } from '../../engine/bones';
import { crew } from '../../engine/characters';
import type { GameState, PlayerAction } from '../../engine/types';
import { CandidatePicker } from './CandidatePicker';
import { WhyPanel } from './WhyPanel';

/**
 * Ready-made "who should it be?" sections for the newer screens. Each is a
 * thin wrapper over <CandidatePicker> with the right role, so a screen adds
 * one line. All of them queue the winner's order unless `onPick` is given.
 *
 *   <HeirCompare s pickId onPick />   Power › Heirs: which of the house (heir paradox)
 *   <OfficialPicker s />              City Hall › Your officials: whom to work on next
 *   <KeeperPicker s />                The Books › Bookkeeper
 *   <BonesPicker s />                 Membership: who makes his bones, on which job
 *   <TripWhy s action />              Trip planner: why go, what it costs, what can go wrong
 */

function Toggle({ label, open, onClick, testId }: { label: string; open: boolean; onClick: () => void; testId?: string }) {
  return (
    <button type="button" className="text-xs text-gold-300 underline" onClick={onClick} aria-expanded={open} data-testid={testId}>
      {open ? 'Hide the comparison' : label}
    </button>
  );
}

/** Compare the members of the house as heirs (capability vs pressure) and choose one for the designation cards. */
export function HeirCompare({ s, pool, pickId, onPick }: { s: GameState; pool: string[]; pickId?: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!pool.length) return null;
  return (
    <div data-testid="heir-compare">
      <Toggle label="Compare them side by side: who should it be?" open={open} onClick={() => setOpen(!open)} testId="heir-compare-toggle" />
      {open && (
        <div className="mt-2">
          <CandidatePicker s={s} role={{ kind: 'heir', wide: true }} pool={pool} selected={pickId ? [pickId] : []} onPick={(c) => c.charId && onPick(c.charId)} limit={4} />
        </div>
      )}
    </div>
  );
}

/** City Hall: which official is worth owning, and the first order to get there (payroll or a dinner). */
export function OfficialPicker({ s, defaultOpen = false }: { s: GameState; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!s.pol) return null;
  return (
    <div className="rounded-md border border-noir-700 bg-noir-800/40 p-2" data-testid="official-picker">
      <Toggle label="Whom should you work on next? Compare the officials" open={open} onClick={() => setOpen(!open)} />
      {open && <div className="mt-2"><CandidatePicker s={s} role={{ kind: 'official' }} limit={6} /></div>}
    </div>
  );
}

/** The Books: who should keep them. */
export function KeeperPicker({ s }: { s: GameState }) {
  return <CandidatePicker s={s} role={{ kind: 'keeper' }} limit={4} />;
}

type BonesJob = 'heist' | 'collection' | 'hit';

/** Membership: prospects who still need their bones, ranked for one kind of job. */
export function BonesPicker({ s }: { s: GameState }) {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<BonesJob>('collection');
  const prospects = crew(s).filter((c) => c.rank === 'associate' && !c.specialty && needsBones(s, c));
  if (!prospects.length) return null;
  const hit = s.schemes.some((x) => x.owner === 'player' && x.kind === 'murder');
  const jobs: BonesJob[] = hit ? ['collection', 'heist', 'hit'] : ['collection', 'heist'];
  return (
    <div className="mt-2" data-testid="bones-picker">
      <Toggle label={`Who should make his bones? (${prospects.length} without)`} open={open} onClick={() => setOpen(!open)} />
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Kind of job">
            {jobs.map((j) => (
              <button key={j} type="button" role="radio" aria-checked={job === j} onClick={() => setJob(j)} className={`rounded border px-2 py-0.5 text-[11px] ${job === j ? 'border-gold-400 bg-gold-500 text-noir-950' : 'border-noir-600 text-stone-300 hover:border-gold-500'}`}>
                {j === 'collection' ? 'A collection' : j === 'heist' ? 'A score' : 'A piece of work'}
              </button>
            ))}
          </div>
          <CandidatePicker s={s} role={{ kind: 'bones', job }} limit={4} />
        </div>
      )}
    </div>
  );
}

/** Under the trip quote: the verdict and the why for the order the planner will queue. */
export function TripWhy({ s, action }: { s: GameState; action: PlayerAction }) {
  return <WhyPanel s={s} action={action} />;
}
