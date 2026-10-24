import { ageOn } from '../../engine/calendar';
import { player } from '../../engine/characters';
import { chooseHeir } from '../../engine/dynasty';
import { alliedHouse, houseLabel } from '../../engine/familyHouses';
import { fam, houseOf } from '../../engine/familyState';
import type { Character, GameState } from '../../engine/types';
import { CharLink, Face } from '../components/People';
import { Badge, BloodChips } from './bits';

/**
 * The multi-generation dynasty tree (CK): rooted at the oldest known
 * ancestor of the head of the house, each couple with their children
 * below. Living and dead, spouses with the house they came from, the head,
 * the heir by succession law and anyone pressing a claim. Click anyone to
 * open the character sheet.
 */

const MAX_DEPTH = 6;

export interface TreeMarks {
  headId: string;
  heirId?: string;
  claimants: Set<string>;
}

export function treeMarks(s: GameState): TreeMarks {
  const boss = player(s);
  const heir = chooseHeir(s, boss).heir;
  const claimants = new Set(Object.values(s.characters).filter((c) => c.alive && c.id !== boss.id && (fam(s, c.id).claimant || (c.dynasty && fam(s, c.id).goal === 'the_chair' && ageOn(c.birth, s.date) >= 18 && c.id !== heir?.id))).map((c) => c.id));
  return { headId: boss.id, heirId: heir?.id, claimants };
}

/** Topmost ancestor of the head, through the line of the house. */
export function treeRoot(s: GameState): Character {
  let c = player(s);
  for (let i = 0; i < 4; i++) {
    const f = c.fatherId ? s.characters[c.fatherId] : undefined;
    const m = c.motherId ? s.characters[c.motherId] : undefined;
    const up = f?.dynasty ? f : m?.dynasty ? m : undefined;
    if (!up) break;
    c = up;
  }
  return c;
}

function PersonCard({ s, c, marks, spouse }: { s: GameState; c: Character; marks: TreeMarks; spouse?: boolean }) {
  const p = fam(s, c.id);
  const age = ageOn(c.birth, c.death ? c.death.date : s.date);
  const house = spouse ? houseLabel(s, c) : undefined;
  const allied = spouse && houseOf(s, c.id) ? alliedHouse(s, houseOf(s, c.id)!.id) : false;
  return (
    <div
      className={`w-[118px] shrink-0 rounded-md border px-1.5 py-1.5 text-center ${c.id === marks.headId ? 'border-gold-400 bg-gold-500/10' : c.alive ? 'border-noir-600 bg-noir-800/80' : 'border-noir-800 bg-noir-900/60 opacity-75'}`}
      data-testid="tree-person"
    >
      <div className="flex justify-center"><Face s={s} c={c} size={spouse ? 38 : 46} /></div>
      <div className="mt-0.5 text-[12px] font-semibold leading-tight text-stone-100 truncate"><CharLink s={s} id={c.id}>{c.firstName}{c.nickname ? ` "${c.nickname}"` : ''}</CharLink></div>
      <div className="text-[10px] text-stone-400 leading-tight truncate">{c.lastName}{c.maidenName && c.maidenName !== c.lastName ? ` (née ${c.maidenName})` : ''}</div>
      <div className="text-[10px] text-stone-500">{c.alive ? `${age} yrs` : `† ${c.death?.date.y ?? ''}, ${age}`}</div>
      <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
        {c.id === marks.headId && <Badge tone="gold">♔ Head</Badge>}
        {c.id === marks.heirId && <Badge tone="gold">Heir</Badge>}
        {marks.claimants.has(c.id) && <Badge tone="warn" title="Wants the chair">Claimant</Badge>}
        {p.bastardOf && <Badge tone="warn">{p.legitimized ? 'Legitimized' : 'Bastard'}</Badge>}
        {p.retired !== undefined && c.alive && <Badge>Florida</Badge>}
        {p.path === 'priest' && <Badge>Priest</Badge>}
        {c.alive && c.rank !== 'civilian' && c.id !== marks.headId && <Badge>{c.rank}</Badge>}
        {house && <Badge tone={allied ? 'good' : 'neutral'} title={allied ? 'Allied by this marriage' : undefined}>{house}</Badge>}
      </div>
      <div className="mt-0.5 flex justify-center"><BloodChips s={s} c={c} /></div>
    </div>
  );
}

function childrenOf(s: GameState, c: Character): Character[] {
  const ids = new Set(c.childrenIds);
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  if (sp) for (const k of sp.childrenIds) ids.add(k);
  return [...ids].map((id) => s.characters[id]).filter((k): k is Character => !!k).sort((a, b) => a.birth.y * 400 + a.birth.m * 32 + a.birth.d - (b.birth.y * 400 + b.birth.m * 32 + b.birth.d));
}

function Unit({ s, c, marks, depth }: { s: GameState; c: Character; marks: TreeMarks; depth: number }) {
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  const kids = depth < MAX_DEPTH ? childrenOf(s, c) : [];
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-start gap-1">
        <PersonCard s={s} c={c} marks={marks} />
        {sp && (
          <>
            <div className="self-center text-gold-500 text-sm" title="Married">⚭</div>
            <PersonCard s={s} c={sp} marks={marks} spouse />
          </>
        )}
      </div>
      {kids.length > 0 && (
        <>
          <div className="h-3 w-px bg-gold-600/50" />
          <div className="flex items-start">
            {kids.map((k, i) => (
              <div key={k.id} className="relative flex flex-col items-center px-1.5 pt-3">
                {i > 0 && <div className="absolute top-0 left-0 w-1/2 h-px bg-gold-600/50" />}
                {i < kids.length - 1 && <div className="absolute top-0 right-0 w-1/2 h-px bg-gold-600/50" />}
                <div className="absolute top-0 left-1/2 h-3 w-px bg-gold-600/50" />
                <Unit s={s} c={k} marks={marks} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function DynastyTree({ s }: { s: GameState }) {
  const marks = treeMarks(s);
  const root = treeRoot(s);
  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-md border border-noir-700 bg-noir-950/40 p-3" data-testid="dynasty-tree">
      <div className="mx-auto w-max">
        <Unit s={s} c={root} marks={marks} depth={0} />
      </div>
    </div>
  );
}
