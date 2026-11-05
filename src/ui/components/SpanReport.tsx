import type { DiffLine } from '../../engine/weekDiff';
import type { TurnStop } from '../../engine/turnCrisis';
import { Modal } from './Modal';

const TONE: Record<DiffLine['tone'], string> = { good: 'text-emerald-300', bad: 'text-red-300', neutral: 'text-stone-300' };

/**
 * "While you were busy: weeks 12–14" (STREAMLINE_2 §5.2): after a turn of more than one week, or one
 * that stopped for a crisis. Why it stopped (if it did), what changed over the whole span
 * (weekDiff.ts spanDiff), and the way to each week's report and to Your File.
 */
export function SpanReport({ from, to, line, lines, stop, onReports, onFile, onClose }: {
  from: number; to: number; line: string; lines: DiffLine[]; stop?: TurnStop;
  onReports: () => void; onFile: () => void; onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="p-4 space-y-3" data-testid="span-report">
        <div className="font-display text-xl text-gold-400">While you were busy: {from === to ? `week ${from}` : `weeks ${from}–${to}`}</div>
        <p className={`text-sm ${stop ? 'text-amber-200' : 'text-stone-300'}`} data-testid="span-report-why">{line}</p>
        {lines.length > 0 && (
          <ul className="space-y-1" data-testid="span-report-lines">
            {lines.map((l) => <li key={l.id} className={`text-[13px] leading-snug ${TONE[l.tone]}`}>{l.text}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-secondary btn-sm" onClick={onReports} data-testid="span-report-weeks">Each week's report ▸</button>
          <button type="button" className="btn-secondary btn-sm" onClick={onFile} data-testid="span-report-file">Your File ▸</button>
          <button type="button" className="btn-primary btn-sm ml-auto" onClick={onClose} data-testid="span-report-close">{stop ? 'See to it' : 'Back to work'}</button>
        </div>
      </div>
    </Modal>
  );
}
