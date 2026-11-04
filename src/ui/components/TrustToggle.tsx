/**
 * "Does he handle his own small stuff, or ask you first?" as a plain two-way choice instead of a
 * bare checkbox. Small stuff = his cheap, peaceful routine items (no money over a few hundred,
 * no violence). What he decided shows in This Week; a long free hand builds his own following.
 */
export function TrustToggle({ name, on, onChange, free, compact, testId, paper }: {
  name: string; on: boolean; onChange: (on: boolean) => void; free?: number; compact?: boolean; testId?: string;
  /** On the Don's book (cream paper): ink colors. */
  paper?: boolean;
}) {
  const opt = (v: boolean, label: string, sub: string) => (
    <button type="button" role="radio" aria-checked={on === v} onClick={() => { if (on !== v) onChange(v); }}
      data-testid={testId ? `${testId}-${v ? 'on' : 'off'}` : undefined}
      className={`flex-1 rounded-md border px-2 py-1 text-left leading-tight transition-colors ${paper
        ? (on === v ? 'border-[#7a2e1f] bg-[#7a2e1f] text-[#f6ecd6]' : 'border-[#b9a682] bg-transparent text-[#5a4a35] hover:bg-[#e9dcc0]')
        : on === v
          ? (v ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-stone-400 bg-stone-500/20 text-stone-100')
          : 'border-noir-600 bg-noir-900/60 text-stone-400 hover:text-stone-200'}`}>
      <span className="block text-[12px] font-semibold">{on === v ? '● ' : '○ '}{label}</span>
      {!compact && <span className="block text-[10px] opacity-80">{sub}</span>}
    </button>
  );
  return (
    <div className="w-full" data-testid={testId}>
      <div className="flex gap-1.5" role="radiogroup" aria-label={`${name}'s small stuff`}>
        {opt(false, 'Asks you first', 'Every item comes to you')}
        {opt(true, 'Handles it himself', 'Cheap, peaceful items only')}
      </div>
      <div className={`mt-1 text-[10px] ${paper ? 'text-[#6b5a44]' : 'text-stone-500'}`}>
        {on
          ? <>You see what he decided in This Week. Anything costly or violent still comes to you.{free && free >= 4 ? <span className={paper ? 'text-[#7a2e1f]' : 'text-amber-300'}> Free hand {free} weeks: he is building his own following.</span> : ' A long free hand builds his own following.'}</>
          : 'Fewer things on your Desk if you let him: he takes the small, peaceful ones.'}
      </div>
    </div>
  );
}
