import type { MgSession } from '../../engine/minigame';
import type { TrialData } from '../../engine/trial';
import { caseStrength, LAWYER_BY_ID, type Juror } from '../../engine/trialCase';
import type { Character, GameState } from '../../engine/types';
import { Face, FACTION_TINT } from '../components/People';
import { Portrait } from '../portrait/Portrait';

/** A juror (or a lawyer) is not a character in the game; give the portrait painter a stand-in. */
export function standIn(s: GameState, id: string, name: string, gender: 'M' | 'F', ethnicity: Character['ethnicity'], age: number, office: string, traits: Character['traits'] = []): Character {
  const [firstName, ...rest] = name.replace(/"[^"]*"\s*/, '').split(' ');
  return {
    id: `mg-${id}-${name}`, firstName, lastName: rest.join(' ') || firstName, gender, ethnicity, birth: { y: s.date.y - age, m: 3, d: 9 }, health: 80, conditions: [],
    attributes: { leadership: 50, business: 50, diplomacy: 50, intrigue: 50, force: 50, discipline: 50 }, traits, ambition: '', rank: 'civilian', faction: 'none',
    wealth: 0, dynasty: false, childrenIds: [], alive: true, office,
  };
}

function JurorCard({ s, j, onStrike, canStrike }: { s: GameState; j: Juror; onStrike?: () => void; canStrike: boolean }) {
  const c = standIn(s, j.id, j.name, j.gender, j.ethnicity, j.age, 'Juror', j.traits);
  const lean = j.read;
  return (
    <div className={`rounded border p-1 text-[10px] leading-tight flex gap-1 ${j.struck ? 'opacity-35 border-noir-700' : j.seated ? 'border-gold-600/60 bg-noir-800' : 'border-noir-600 bg-noir-900'}`} data-testid="juror">
      <Portrait c={c} seed={s.seed} date={s.date} size={34} tint={FACTION_TINT.none} />
      <div className="min-w-0 flex-1">
        <div className="text-stone-100 font-semibold truncate">{j.name}{j.reached ? ' ✉' : ''}</div>
        <div className="text-stone-400 truncate" title={j.bio}>{j.job}, {j.town}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <div className="h-1.5 flex-1 bg-noir-700 rounded relative overflow-hidden">
            <div className={`absolute top-0 h-full ${lean > 0 ? 'bg-blood-400 left-1/2' : 'bg-emerald-500 right-1/2'}`} style={{ width: `${Math.abs(lean) * 5}%` }} />
          </div>
          <span className={lean > 0 ? 'text-red-300' : lean < 0 ? 'text-emerald-300' : 'text-stone-400'}>{lean > 0 ? '+' : ''}{lean}</span>
        </div>
        {j.struck && <div className="text-stone-500">struck ({j.struck})</div>}
        {canStrike && !j.struck && onStrike && <button className="text-[10px] underline text-gold-300" onClick={onStrike}>strike</button>}
      </div>
    </div>
  );
}

export function TrialPanel({ s, ses, onMove, busy }: { s: GameState; ses: MgSession<TrialData>; onMove: (id: string) => void; busy?: boolean }) {
  const d = ses.d;
  const def = s.characters[d.defendantId];
  const L = d.lawyerId ? LAWYER_BY_ID[d.lawyerId] : undefined;
  const ev = caseStrength(d.items);
  const total = d.items.reduce((a, x) => a + x.base, 0) || 1;
  const showPool = d.pool.length > 0;
  const strikePhase = ses.phase === 'jury' && d.strikes > 0 && !busy;
  return (
    <div className="space-y-3" data-testid="trial-panel">
      <div className="flex gap-3 items-start">
        {def && <Face s={s} c={def} size={64} />}
        <div className="min-w-0 text-xs text-stone-300">
          <div className="font-display text-lg text-gold-300 leading-tight">{d.defName}</div>
          <div className="text-stone-400">{d.court}</div>
          <div>Before {d.judge.name}: <span className="italic text-stone-400">{d.judge.blurb}</span></div>
          <div>For the government: {d.prosecutor}</div>
          {L && <div>For the defense: <span className="text-stone-100">{L.name}</span> (skill {L.skill})</div>}
          <div className="text-stone-500 mt-0.5">{d.counts.length} counts: {d.counts.join('; ')}</div>
        </div>
      </div>

      {d.items.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">The government's case · {Math.round(ev)} standing</div>
          <div className="mt-1 space-y-1">
            {d.items.map((it, i) => (
              <div key={it.id} className={`rounded border px-2 py-1 text-xs ${i === d.cur && (ses.phase === 'case' || ses.phase === 'cross') ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-900/60'}`} data-testid="evidence-item">
                <div className="flex justify-between gap-2">
                  <span className={`truncate ${it.status === 'out' ? 'line-through text-stone-500' : 'text-stone-100'}`}>{it.title}</span>
                  <span className="tabular-nums text-stone-300 shrink-0">{it.status === 'out' ? 'excluded' : Math.round(it.strength)}{it.status === 'shaken' ? ' ↓' : it.status === 'firm' ? ' ↑' : ''}</span>
                </div>
                <div className="h-1 bg-noir-700 rounded mt-0.5 overflow-hidden">
                  <div className={`h-full ${it.status === 'out' ? 'bg-noir-600' : it.status === 'shaken' ? 'bg-emerald-600' : 'bg-blood-400'}`} style={{ width: `${Math.min(100, ((it.status === 'out' ? 0 : it.strength) / total) * 100 * 2)}%` }} />
                </div>
                {it.witness && <div className="text-[10px] text-stone-500">{it.witness.name}, {it.witness.job} · credibility {it.witness.credibility} · nerve {it.witness.nerve}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {showPool && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">{d.pool.some((j) => j.seated) ? 'The jury' : `The pool · ${d.strikes} strike${d.strikes === 1 ? '' : 's'} left`} · lean is your lawyer's read (+ convict, − acquit)</div>
          <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-1">
            {d.pool.filter((j) => !d.pool.some((x) => x.seated) || j.seated || j.struck).map((j) => (
              <JurorCard key={j.id} s={s} j={j} canStrike={strikePhase} onStrike={() => onMove(`strike_${j.id}`)} />
            ))}
          </div>
        </div>
      )}

      {d.defenseLog.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[11px]">
          {d.defenseLog.map((x, i) => <span key={i} className={x.value >= 0 ? 'chip-good' : 'chip-bad'}>{x.value >= 0 ? '+' : '−'}{Math.abs(x.value)} {x.label}</span>)}
          {d.closing && <span className="chip-good">+{d.closingBonus} closing</span>}
        </div>
      )}
      {d.ballots && d.ballots.length > 0 && (
        <div className="text-xs text-stone-300" data-testid="ballots">
          <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Deliberations</div>
          <div className="flex gap-2 mt-1">
            {d.ballots.map((g, i) => (
              <div key={i} className="flex-1">
                <div className="h-2 rounded bg-emerald-700 overflow-hidden"><div className="h-full bg-blood-400" style={{ width: `${(g / 12) * 100}%` }} /></div>
                <div className="text-[10px] text-stone-400 mt-0.5">Ballot {i + 1}: {g}–{12 - g} guilty</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
