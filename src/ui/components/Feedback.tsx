import { createContext, useContext, useEffect } from 'react';
import { useOpenBook } from '../book/TheBook';

/**
 * Click feedback, for every button that does something (App.tsx is the one
 * place it is raised: the order queue, a decision answered, a change that
 * takes effect at once, the week settling). Each says what was done, or when
 * it will happen, and points at Your File.
 */
export interface Feedback {
  kind: 'done' | 'ordered' | 'decided' | 'settled';
  title: string;
  detail?: string;
  /** When it happens ("when the week turns", "Tuesday"). */
  when?: string;
  person?: string;
  at: number;
}

export const FEEDBACK_HEAD: Record<Feedback['kind'], string> = {
  done: '✓ Done',
  ordered: '✓ Ordered',
  decided: '✓ Decided',
  settled: '✓ The week is settled',
};

export function feedbackLine(f: Pick<Feedback, 'kind' | 'title' | 'when'>): string {
  if (f.kind === 'done') return `${FEEDBACK_HEAD.done} — ${f.title}`;
  if (f.kind === 'settled') return `${FEEDBACK_HEAD.settled} — ${f.title}`;
  return `${FEEDBACK_HEAD[f.kind]} — ${f.title} · happens ${f.when ?? 'when the week turns'}`;
}

export const FeedbackContext = createContext<{ notify: (f: Omit<Feedback, 'at'>) => void }>({ notify: () => {} });
export function useFeedback() {
  return useContext(FeedbackContext);
}

export function FeedbackToast({ item, onClose }: { item: Feedback; onClose: () => void }) {
  const open = useOpenBook();
  useEffect(() => {
    const t = window.setTimeout(onClose, item.kind === 'settled' ? 9000 : 6000);
    return () => window.clearTimeout(t);
  }, [item.at, item.kind, onClose]);
  return (
    <div className="fixed z-[1160] bottom-[64px] md:bottom-4 left-1/2 -translate-x-1/2 md:left-[84px] md:translate-x-0 w-[min(92vw,460px)] rounded-lg border border-gold-500 bg-noir-900/95 px-4 py-3 shadow-2xl" role="status" data-testid="feedback-toast" data-kind={item.kind}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-gold-400">{FEEDBACK_HEAD[item.kind]}{item.kind === 'ordered' || item.kind === 'decided' ? ` · happens ${item.when ?? 'when the week turns'}` : ''}</div>
          <div className="text-sm font-semibold text-stone-100" data-testid="feedback-title">{item.title}</div>
          {item.detail && <div className="mt-0.5 text-xs text-stone-400">{item.detail}</div>}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" className="btn-gold px-2 py-0.5 text-[11px]" onClick={() => { onClose(); open(item.person ? { person: item.person } : undefined); }} data-testid="feedback-file">See it in Your File →</button>
          <button type="button" className="text-[11px] text-stone-500" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>
    </div>
  );
}
