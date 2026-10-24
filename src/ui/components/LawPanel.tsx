import { player } from '../../engine/characters';
import { GRAND_JURY, OPEN_FILE, caseEvidence, convictionOdds, evidenceGain, indictOdds, legalOf, ricoActive, stageLabel } from '../../engine/longgame';
import { cloneState } from '../../engine/engine';
import type { GameState, LegalStage } from '../../engine/types';
import { ActionCard } from './Orders';

const STEPS: { id: LegalStage; t: string }[] = [
  { id: 'investigation', t: 'A file' },
  { id: 'grandjury', t: 'Grand jury' },
  { id: 'indicted', t: 'Indictment' },
  { id: 'trial', t: 'Trial' },
  { id: 'prison', t: 'Prison' },
  { id: 'parole', t: 'Parole' },
];

/** The Long Game: the case against the boss, step by step. */
export function LawPanel({ s }: { s: GameState }) {
  // legalOf may initialise; never mutate the live state from a render.
  const l = legalOf(cloneState(s));
  const b = player(s);
  const g = evidenceGain(s);
  const idx = STEPS.findIndex((x) => x.id === l.stage);
  const left = l.next !== undefined ? l.next - s.week : undefined;
  return (
    <div className="space-y-4" data-testid="law">
      <div>
        <h2 className="font-display text-2xl text-gold-400">The Long Game</h2>
        <p className="text-sm text-stone-400">
          The case the government is building against {b.firstName} himself. Federal heat turns into evidence; at {OPEN_FILE} the FBI opens a file, at {GRAND_JURY} a grand jury sits. Lawyers, favors and lying low are your defense.
          {ricoActive(s) ? ' The racketeering law (RICO) is on the books: evidence builds half again as fast and sentences run longer.' : ' In October 1970 Congress will pass a racketeering law that changes everything.'}
        </p>
      </div>

      <ol className="flex flex-wrap gap-1 text-xs">
        <li className={`rounded px-2 py-1 border ${l.stage === 'quiet' ? 'border-emerald-500 text-emerald-300' : 'border-noir-700 text-stone-500'}`}>No case</li>
        {STEPS.map((st, i) => (
          <li key={st.id} className={`rounded px-2 py-1 border ${l.stage === st.id ? 'border-red-400 text-red-300 bg-blood-500/20' : i < idx ? 'border-noir-600 text-stone-400' : 'border-noir-700 text-stone-600'}`}>{st.t}</li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-3">
        <Meter label="Evidence" value={caseEvidence(s, l)} tone="bg-blood-400" />
        <Meter label="Defense" value={l.defense} tone="bg-emerald-500" />
        <div className="rounded border border-noir-700 bg-noir-800/70 p-2 text-sm">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Status</div>
          <div className="text-stone-100 font-semibold">{stageLabel(l)}</div>
          {l.stage === 'grandjury' && <div className="text-xs text-stone-400">Indictment odds now: {Math.round(indictOdds(s, l) * 100)}%{left !== undefined && ` · votes in ${Math.max(0, left)} wk`}</div>}
          {l.stage === 'trial' && <div className="text-xs text-stone-400">Conviction odds now: {Math.round(convictionOdds(s, l) * 100)}%{left !== undefined && ` · trial in ${Math.max(0, left)} wk`}{l.bail ? ' · out on bail' : ''}</div>}
          {l.stage === 'prison' && <div className="text-xs text-stone-400">Served {l.served ?? 0} of {l.sentence ?? 0} weeks{left !== undefined && ` · parole hearing in ${Math.max(0, left)} wk`}. He runs things through his lawyer.</div>}
          {l.stage === 'parole' && <div className="text-xs text-stone-400">{left !== undefined && `${Math.max(0, left)} weeks left. `}If federal heat reaches 70 he may be sent back.</div>}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Evidence this week</div>
        <div className="mt-1 flex flex-wrap gap-1 text-xs">
          {g.reasons.length === 0 && <span className="text-stone-500">Nothing new.</span>}
          {g.reasons.map((r, i) => <span key={i} className={r.value > 0 ? 'chip-bad' : 'chip-good'}>{r.value > 0 ? '+' : '−'}{Math.abs(r.value).toFixed(1)} {r.label}</span>)}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ActionCard s={s} action={{ kind: 'legal', op: 'retainer' }} />
        <ActionCard s={s} action={{ kind: 'legal', op: 'lielow' }} />
      </div>
    </div>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded border border-noir-700 bg-noir-800/70 p-2">
      <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{label}</div>
      <div className="text-xl font-semibold text-stone-100 tabular-nums">{Math.round(value)}</div>
      <div className="h-1.5 rounded bg-noir-700 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} /></div>
    </div>
  );
}
