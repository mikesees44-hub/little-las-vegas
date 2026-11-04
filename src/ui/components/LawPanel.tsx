import { MODE_INFO, raidExposure } from '../../engine/ledgerbook';
import { player } from '../../engine/characters';
import { GRAND_JURY, OPEN_FILE, caseEvidence, convictionOdds, evidenceGain, indictOdds, legalOf, ricoActive, stageLabel } from '../../engine/longgame';
import { cloneState } from '../../engine/engine';
import type { GameState, LegalStage } from '../../engine/types';
import { ActionCard } from './Orders';
import { FugitivePanel } from '../travel/Panels';
import { HQLawLine } from '../econ/DistrictProperty';
import { Section } from './Layout';

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
        <h3 className="llv-pagehead-title">The Long Game</h3>
        <p className="llv-prose mt-0.5">
          The case the government is building against {b.firstName} himself. Federal heat turns into evidence; at {OPEN_FILE} the FBI opens a file, at {GRAND_JURY} a grand jury sits. Lawyers, favors and lying low are your defense.
          {ricoActive(s) ? ' The racketeering law (RICO) is on the books: evidence builds half again as fast and sentences run longer.' : ' In October 1970 Congress will pass a racketeering law that changes everything.'}
        </p>
      </div>

      <HQLawLine s={s} />

      {/* Where the case stands: a stepper, done steps checked, the current one lit red. */}
      <ol className="flex flex-wrap items-center gap-y-1 text-[11.5px]" data-testid="law-steps" aria-label="The case, step by step">
        <li className={`rounded-full border px-2.5 py-0.5 ${l.stage === 'quiet' ? 'border-emerald-500 bg-emerald-900/20 text-emerald-300 font-semibold' : 'border-noir-600 text-stone-400'}`} aria-current={l.stage === 'quiet' ? 'step' : undefined}>{l.stage === 'quiet' ? '● ' : ''}No case</li>
        {STEPS.map((st, i) => (
          <li key={st.id} className="flex items-center">
            <span aria-hidden className={`mx-1 h-px w-3 sm:w-5 ${i <= idx ? 'bg-red-500/70' : 'bg-noir-600'}`} />
            <span className={`rounded-full border px-2.5 py-0.5 ${l.stage === st.id ? 'border-red-400 bg-blood-500/25 text-red-200 font-semibold' : i < idx ? 'border-red-900/70 text-red-300/80' : 'border-noir-700 text-stone-500'}`} aria-current={l.stage === st.id ? 'step' : undefined}>
              {i < idx ? '✓ ' : l.stage === st.id ? '● ' : ''}{st.t}
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-3">
        <Meter label="Evidence" value={caseEvidence(s, l)} tone="bg-blood-400" />
        <Meter label="Defense" value={l.defense} tone="bg-emerald-500" />
        <div className="llv-stat">
          <div className="llv-stat-label">Status</div>
          <div className="font-display text-lg leading-tight text-stone-100">{stageLabel(l)}</div>
          {l.stage === 'grandjury' && <div className="text-xs text-stone-400">Indictment odds now: {Math.round(indictOdds(s, l) * 100)}%{left !== undefined && ` · votes in ${Math.max(0, left)} wk`}</div>}
          {l.stage === 'trial' && <div className="text-xs text-stone-400">Conviction odds now: {Math.round(convictionOdds(s, l) * 100)}%{left !== undefined && ` · trial in ${Math.max(0, left)} wk`}{l.bail ? ' · out on bail' : ''}</div>}
          {l.stage === 'prison' && <div className="text-xs text-stone-400">Served {l.served ?? 0} of {l.sentence ?? 0} weeks{left !== undefined && ` · parole hearing in ${Math.max(0, left)} wk`}. He runs things through his lawyer.</div>}
          {l.stage === 'parole' && <div className="text-xs text-stone-400">{left !== undefined && `${Math.max(0, left)} weeks left. `}If federal heat reaches 70 he may be sent back.</div>}
        </div>
      </div>

      <Section domain="law" title="Evidence this week" aside={g.reasons.length ? undefined : 'nothing new'}>
        <div className="flex flex-wrap gap-1 text-xs">
          {g.reasons.length === 0 && <span className="text-stone-500">Nothing new.</span>}
          {g.reasons.map((r, i) => <span key={i} className={r.value > 0 ? 'chip-bad' : 'chip-good'}>{r.value > 0 ? '+' : '−'}{Math.abs(r.value).toFixed(1)} {r.label}</span>)}
        </div>
        {s.ledgerBook && <div className="mt-1 text-[11px] text-stone-500" data-testid="law-books">Your books: {MODE_INFO[s.ledgerBook.mode].name.toLowerCase()}. If a raid seized them today: +{raidExposure(s)} on your file{s.ledgerBook.seizures.length ? `; seized ${s.ledgerBook.seizures.length} time${s.ledgerBook.seizures.length > 1 ? 's' : ''} already` : ''}.</div>}
      </Section>

      <FugitivePanel s={s} />

      <Section domain="law" title="Your defense" sub="A lawyer on retainer and a quiet season are what keep the file thin.">
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionCard s={s} action={{ kind: 'legal', op: 'retainer' }} />
          <ActionCard s={s} action={{ kind: 'legal', op: 'lielow' }} />
        </div>
      </Section>
    </div>
  );
}

function Meter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="llv-stat">
      <div className="llv-stat-label">{label}</div>
      <div className="llv-stat-value text-stone-100">{Math.round(value)}<span className="text-[11px] text-stone-500"> / 100</span></div>
      <div className="mt-1 h-1.5 rounded bg-noir-700 overflow-hidden" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><div className={`h-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} /></div>
    </div>
  );
}
