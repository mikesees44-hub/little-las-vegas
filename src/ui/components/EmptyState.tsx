import type { ReactNode } from 'react';

/**
 * WHY A PAGE IS EMPTY (A10). Four different situations that used to look the
 * same (a blank box):
 *  - pending: nothing yet because the week that produces it hasn't settled
 *    (the first envelope comes after week 1);
 *  - none: it has settled, and there is simply nothing to list;
 *  - unavailable: this game doesn't have the system at all (an old save, a
 *    start without it);
 *  - failed: the page couldn't be read (the Guard boundary shows this one).
 */
export type EmptyKind = 'pending' | 'none' | 'unavailable' | 'failed';

const TONE: Record<EmptyKind, string> = {
  pending: 'border-gold-600/40 bg-gold-500/5 text-stone-300',
  none: 'border-noir-700 bg-noir-800/40 text-stone-400',
  unavailable: 'border-noir-700 bg-noir-800/40 text-stone-500',
  failed: 'border-blood-500/60 bg-blood-500/10 text-red-200',
};
const KICKER: Record<EmptyKind, string> = { pending: 'Not settled yet', none: 'Nothing here', unavailable: 'Not in this game', failed: 'Could not be read' };

export function EmptyState({ kind, title, children, action }: { kind: EmptyKind; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-[12px] ${TONE[kind]}`} data-testid={`empty-${kind}`} role={kind === 'failed' ? 'alert' : 'status'}>
      <div className="text-[10px] uppercase tracking-widest opacity-70">{KICKER[kind]}</div>
      <div className="font-semibold text-stone-200">{title}</div>
      {children && <div className="mt-0.5">{children}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

/** Before the first weekly settlement: what will appear here, and when. */
export function FirstSettlement({ what, week }: { what: string; week: number }) {
  return (
    <EmptyState kind="pending" title={`${what} appears after your first week settles.`}>
      Every Monday the underboss brings the week's count. You are in week {week}: advance the week (or let the clock run to Sunday) and this page fills in, with every dollar named.
    </EmptyState>
  );
}
