import { postNow } from '../deeds/NowResult';

/**
 * "Done": a decision settled in the two-way window. It shows as the one
 * result card (ui/decide/ResultCard.tsx), like every settled order; the
 * old 9-second toast is gone.
 */
export function postSettled(title: string, text: string): void {
  postNow({ ok: true, title, tier: 'success', headline: 'Settled', line: text, changes: [], leadsTo: [] });
}

/** Kept for callers; the result card host shows settled decisions now. */
export function SettledToast() {
  return null;
}
