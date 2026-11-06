/** A subtle key hint on a dialog's choice ("1", "Enter", "Esc"): hidden on phones, where there is no keyboard. */
export function KeyHint({ k, className }: { k: string; className?: string }) {
  return <kbd className={`hidden sm:inline-block rounded border border-noir-600 bg-noir-950/60 px-1 font-mono text-[9px] leading-[14px] text-stone-500 ${className ?? ''}`} aria-hidden data-testid="key-hint">{k}</kbd>;
}
