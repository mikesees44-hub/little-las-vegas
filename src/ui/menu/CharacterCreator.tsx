import { useMemo, useState, type ReactNode } from 'react';
import { ATTR_GROUPS, groupScore } from '../../engine/attrs';
import {
  BACKGROUNDS, BIRTHPLACES, BUY_GROUPS, GROUP_COST, GROUP_STEP, MAX_TRAITS, SKILLS, SKILL_STEP, TRAIT_COST, VICES, VICE_REFUND,
  creatorBase, maxKids, opposites, pointsSpent, suggestSpouseName, traitConflicts, validateCharOptions, type CharOptions,
} from '../../engine/charCreate';
import { ALL_TRAITS, TRAIT_INFO } from '../../engine/characters';
import { LIFESTYLES, LIFESTYLE_IDS } from '../../engine/lifestyle';
import { nicknameOrigin, suggestNickname } from '../../engine/nicknames';
import { newGameWith, type StartId } from '../../engine/starts';
import { ageOn } from '../../engine/calendar';
import type { Character, GameState, Trait } from '../../engine/types';
import { fmt$ } from '../format';
import { Portrait } from '../portrait/Portrait';
import { genesOf, LOCI, rng, hash } from '../portrait/genes';
import { FEMALE_STYLES, MALE_STYLES, STACHES } from '../portrait/paint';
import type { SlotMeta } from '../save';

/**
 * Create your character (CK3-style ruler designer), on top of the chosen
 * start: identity, appearance with a live portrait, a point-buy over the six
 * skills and the expanded attribute groups, up to three traits (good ones
 * cost, flaws refund, opposites refused), a lifestyle, a background, a vice,
 * the family, the difficulty, and a summary of what all of it changes.
 */

type Section = 'identity' | 'look' | 'skills' | 'traits' | 'life' | 'family' | 'summary';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'identity', label: 'Identity' }, { id: 'look', label: 'Appearance' }, { id: 'skills', label: 'Attributes' },
  { id: 'traits', label: 'Traits' }, { id: 'life', label: 'Life' }, { id: 'family', label: 'Family' }, { id: 'summary', label: 'Summary' },
];
const SKILL_LABEL: Record<string, string> = { leadership: 'Leadership', business: 'Business', diplomacy: 'Diplomacy', intrigue: 'Intrigue', force: 'Force', discipline: 'Discipline' };
const NOSES = ['Straight', 'Roman', 'Snub', 'Broad', 'Hooked'];
const EYES = ['Almond', 'Round', 'Hooded', 'Deep-set'];
const HAIR_LABEL: Record<string, string> = { slick: 'Slicked back', side: 'Side part', pomp: 'Pompadour', crew: 'Crew cut', wavy: 'Wavy', thin: 'Thinning', bald: 'Bald', bouffant: 'Bouffant', flip: 'The flip', curls: 'Set curls', chignon: 'Chignon' };
const STACHE_LABEL: Record<string, string> = { none: 'Clean-shaven', pencil: 'Pencil moustache', chevron: 'Full moustache' };

export interface CreatorProps {
  seed: string;
  start: StartId;
  startName: string;
  slot: number;
  slots: (SlotMeta | undefined)[];
  onBack: () => void;
  onConfirm: (o: CharOptions, slot: number) => void;
}

export function CharacterCreator({ seed, start, startName, slot: slot0, slots, onBack, onConfirm }: CreatorProps) {
  const baseState = useMemo(() => newGameWith(seed, start), [seed, start]);
  const base = useMemo(() => creatorBase(baseState, start), [baseState, start]);
  const baseBoss = baseState.characters[baseState.playerId];
  const [o, setO] = useState<CharOptions>(() => ({
    firstName: base.firstName, nickname: base.nickname, sex: base.sex, age: base.age, birthplace: 'wildwood', houseName: base.house,
    appearance: { genes: { ...genesOf(seed, baseBoss) }, hat: 'none' }, skills: {}, groups: {}, traits: [...base.traits], lifestyle: 'money',
    background: 'numbers', vice: 'none', married: base.married, spouseName: base.spouseName || suggestSpouseName(seed, base.sex), kids: base.kids,
    motherAlive: base.motherAlive, hard: false,
  }));
  const [sec, setSec] = useState<Section>('identity');
  const [slot, setSlot] = useState(slot0);
  const [nickNote, setNickNote] = useState<string | undefined>(() => nicknameOrigin(base.nickname));
  const up = (p: Partial<CharOptions>) => setO((x) => ({ ...x, ...p }));
  const spent = pointsSpent(base, o);
  const left = base.budget - spent;
  const errors = validateCharOptions(base, o);
  const male = o.sex === 'M';
  const place = BIRTHPLACES.find((p) => p.id === o.birthplace)!;
  const bg = BACKGROUNDS.find((b) => b.id === o.background);

  // The live portrait: the start's man with your picks.
  const preview: Character = useMemo(() => ({
    ...baseBoss,
    firstName: o.firstName || baseBoss.firstName,
    lastName: o.houseName || baseBoss.lastName,
    nickname: o.nickname || undefined,
    gender: o.sex ?? 'M',
    ethnicity: place.ethnicity ?? baseBoss.ethnicity,
    birth: { y: baseState.date.y - (o.age ?? base.age), m: baseState.date.m, d: 1 },
    traits: o.traits ?? base.traits,
    appearance: o.appearance,
    attrs: undefined,
  }), [baseBoss, baseState.date, o, base, place]);

  const setGene = (k: string, v: number) => up({ appearance: { ...o.appearance, genes: { ...o.appearance?.genes, [k]: v } } });
  const gene = (k: string) => o.appearance?.genes?.[k] ?? 0.5;
  const randomize = () => {
    const r = rng(hash(`${seed}:${Date.now()}`));
    const genes: Record<string, number> = {};
    for (const l of LOCI) genes[l] = Math.min(0.999, r());
    const styles = male ? MALE_STYLES : FEMALE_STYLES;
    up({ appearance: { genes, hat: o.appearance?.hat, hair: styles[Math.floor(r() * styles.length)], stache: male ? STACHES[Math.floor(r() * STACHES.length)] : undefined } });
  };
  const suggest = () => {
    const n = suggestNickname(`${seed}:${Date.now()}`, !male);
    up({ nickname: n.nickname });
    setNickNote(n.origin);
  };
  const toggleTrait = (t: Trait) => {
    const cur = o.traits ?? [];
    up({ traits: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
  };
  const skillVal = (k: string) => base.skills[k as keyof typeof base.skills] + (o.skills?.[k as 'force'] ?? 0) + (place.skills[k as 'force'] ?? 0) + (bg?.skills[k as 'force'] ?? 0);
  const [ageLo, ageHi] = base.ageRange;
  const kMax = maxKids(o.age ?? base.age, start);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4" data-testid="creator">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <button className="btn-ghost text-xs py-1" onClick={onBack}>← Starts</button>
        <div className="min-w-0">
          <h2 className="font-display text-2xl sm:text-3xl text-gold-300">Create your character</h2>
          <p className="text-xs text-stone-500">{startName} · seed {seed}</p>
        </div>
        <div className={`ml-auto text-sm px-3 py-1 rounded border ${left < 0 ? 'border-blood-500 text-blood-400' : 'border-gold-600 text-gold-300'}`} data-testid="points">
          Points left: <b>{left}</b> / {base.budget}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <aside className="panel p-3 flex md:flex-col items-center gap-3 md:sticky md:top-3 self-start" data-testid="creator-portrait">
          <Portrait c={preview} seed={seed} date={baseState.date} size={150} />
          <div className="text-center min-w-0">
            <div className="font-display text-lg text-stone-100 break-words">{o.firstName}{o.nickname ? ` "${o.nickname}"` : ''} {o.houseName}</div>
            <div className="text-xs text-stone-400">{o.age} · born in {place.name}</div>
            <div className="text-xs text-stone-500 mt-1">{(o.traits ?? []).join(' · ') || 'No traits'}</div>
            <button className="btn-ghost text-xs py-1 mt-2" onClick={randomize} data-testid="randomize">Randomize look</button>
          </div>
        </aside>

        <section className="min-w-0">
          <nav className="flex overflow-x-auto gap-1 border-b border-noir-700 mb-3 tabbar" data-testid="creator-tabs">
            {SECTIONS.map((x) => (
              <button key={x.id} data-sec={x.id} onClick={() => setSec(x.id)} className={`tab whitespace-nowrap ${sec === x.id ? 'tab-active' : ''}`}>{x.label}</button>
            ))}
          </nav>

          {sec === 'identity' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name"><input className="inp" value={o.firstName} maxLength={24} onChange={(e) => up({ firstName: e.target.value })} /></Field>
              <Field label="House name" hint={`The start's house: ${base.house}`}><input className="inp" value={o.houseName} maxLength={24} onChange={(e) => up({ houseName: e.target.value })} /></Field>
              <Field label="Nickname" hint={nickNote}>
                <div className="flex gap-2">
                  <input className="inp flex-1" value={o.nickname} maxLength={24} placeholder="none" onChange={(e) => { up({ nickname: e.target.value }); setNickNote(nicknameOrigin(e.target.value)); }} />
                  <button className="btn-ghost text-xs" onClick={suggest} data-testid="suggest-nick">Suggest</button>
                </div>
              </Field>
              <Field label="Sex">
                <div className="flex gap-2">
                  {(['M', 'F'] as const).map((g) => <button key={g} className={o.sex === g ? 'btn-gold text-xs py-1' : 'btn-ghost text-xs py-1'} onClick={() => up({ sex: g, spouseName: suggestSpouseName(seed, g), appearance: { ...o.appearance, hair: undefined, stache: undefined } })}>{g === 'M' ? 'Man' : 'Woman'}</button>)}
                </div>
              </Field>
              <Field label={`Age (${ageLo}–${ageHi})`}>
                <div className="flex items-center gap-2"><input type="range" min={ageLo} max={ageHi} value={o.age} onChange={(e) => up({ age: Number(e.target.value), kids: Math.min(o.kids ?? 0, maxKids(Number(e.target.value), start)) })} className="flex-1" /><span className="w-8 text-right">{o.age}</span></div>
              </Field>
              <Field label="Birthplace" hint={`${place.text}${place.effect ? ` (${place.effect})` : ''}`}>
                <select className="inp" value={o.birthplace} onChange={(e) => up({ birthplace: e.target.value as CharOptions['birthplace'] })}>
                  {BIRTHPLACES.map((p) => <option key={p.id} value={p.id}>{p.name}{Object.entries(p.skills).map(([k, v]) => ` · ${SKILL_LABEL[k]} ${v! > 0 ? '+' : ''}${v}`).join('')}</option>)}
                </select>
              </Field>
            </div>
          )}

          {sec === 'look' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Slider label="Skin" v={gene('skin')} on={(v) => setGene('skin', v)} />
              <Slider label="Face length" v={gene('faceLen')} on={(v) => setGene('faceLen', v)} />
              <Slider label="Jaw" v={gene('jaw')} on={(v) => setGene('jaw', v)} />
              <Slider label="Cheekbones" v={gene('cheek')} on={(v) => setGene('cheek', v)} />
              <Field label="Nose">
                <Pills items={NOSES} sel={Math.floor(gene('nose') * 5)} on={(i) => setGene('nose', (i + 0.5) / 5)} />
              </Field>
              <Slider label="Nose size" v={gene('noseSize')} on={(v) => setGene('noseSize', v)} />
              <Field label="Eyes"><Pills items={EYES} sel={Math.floor(gene('eyes') * 4)} on={(i) => setGene('eyes', (i + 0.5) / 4)} /></Field>
              <Slider label="Eye colour" v={gene('eyeColor')} on={(v) => setGene('eyeColor', v)} />
              <Slider label="Hair colour" v={gene('hair')} on={(v) => setGene('hair', v)} />
              <Slider label="Going grey" v={gene('grey')} on={(v) => setGene('grey', 1 - v)} invert />
              <Field label={male ? 'Hair style' : 'Hair style (1960)'}>
                <select className="inp" value={o.appearance?.hair ?? ''} onChange={(e) => up({ appearance: { ...o.appearance, hair: e.target.value || undefined } })}>
                  <option value="">As nature intended</option>
                  {(male ? MALE_STYLES : FEMALE_STYLES).map((st) => <option key={st} value={st}>{HAIR_LABEL[st]}</option>)}
                </select>
              </Field>
              <Field label="Hat (for the portrait)">
                <Pills items={['As dressed', 'Fedora', 'Bareheaded']} sel={o.appearance?.hat === 'fedora' ? 1 : o.appearance?.hat === 'none' ? 2 : 0}
                  on={(i) => up({ appearance: { ...o.appearance, hat: [undefined, 'fedora', 'none'][i] } })} />
              </Field>
              {male ? (
                <>
                  <Field label="Moustache">
                    <select className="inp" value={o.appearance?.stache ?? ''} onChange={(e) => up({ appearance: { ...o.appearance, stache: e.target.value || undefined } })}>
                      <option value="">Whatever grows</option>
                      {STACHES.map((st) => <option key={st} value={st}>{STACHE_LABEL[st]}</option>)}
                    </select>
                  </Field>
                  <Slider label="Beard shadow" v={gene('beard')} on={(v) => setGene('beard', v)} />
                  <Slider label="Build (heavy)" v={gene('heavy')} on={(v) => setGene('heavy', v)} />
                  <Slider label="Hairline (receding)" v={gene('bald')} on={(v) => setGene('bald', v)} />
                </>
              ) : (
                <Slider label="Lips" v={gene('lips')} on={(v) => setGene('lips', v)} />
              )}
              <Slider label="Brows" v={gene('brow')} on={(v) => setGene('brow', v)} />
              <Slider label="Ears" v={gene('ears')} on={(v) => setGene('ears', v)} />
            </div>
          )}

          {sec === 'skills' && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500">Each skill moves up to ±{SKILL_STEP} from the start's value, at 1 point a step. Birthplace and background bonuses are free and already shown.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SKILLS.map((k) => (
                  <Stepper key={k} label={SKILL_LABEL[k]} value={skillVal(k)} delta={o.skills?.[k] ?? 0} max={SKILL_STEP}
                    on={(d) => up({ skills: { ...o.skills, [k]: d } })} />
                ))}
              </div>
              <h4 className="panel-title">Expanded attributes</h4>
              <p className="text-xs text-stone-500">Raise or lower a whole group (±{GROUP_STEP}) at {GROUP_COST} points a step. Skills follow their group month by month. Personality comes from your traits.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {BUY_GROUPS.map((g) => (
                  <Stepper key={g} label={ATTR_GROUPS[g].name} value={groupScore(baseState, baseBoss, g) + (o.groups?.[g] ?? 0)} delta={o.groups?.[g] ?? 0} max={GROUP_STEP}
                    note={ATTR_GROUPS[g].keys.length + ' values'} on={(d) => up({ groups: { ...o.groups, [g]: d } })} />
                ))}
              </div>
            </div>
          )}

          {sec === 'traits' && (
            <div>
              <p className="text-xs text-stone-500 mb-1">Pick up to {MAX_TRAITS}. Good traits cost points; flaws give them back. Opposites can't be held together.</p>
              <TraitCap traits={o.traits ?? []} />
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="traits">
                {ALL_TRAITS.map((t) => {
                  const on = (o.traits ?? []).includes(t);
                  const clash = !on && opposites(t).some((x) => (o.traits ?? []).includes(x));
                  const full = !on && (o.traits ?? []).length >= MAX_TRAITS;
                  const cost = TRAIT_COST[t];
                  return (
                    <button key={t} data-trait={t} disabled={clash || full} onClick={() => toggleTrait(t)} aria-pressed={on}
                      title={full ? `${MAX_TRAITS} of ${MAX_TRAITS} traits chosen: remove one to pick ${t}` : clash ? `Opposite of a trait you have` : undefined}
                      className={`panel p-2 text-left border ${on ? 'border-gold-400' : 'border-noir-700'} ${clash || full ? 'opacity-40 cursor-not-allowed' : 'hover:border-gold-600'}`}>
                      <div className="flex justify-between gap-2"><span className={on ? 'text-gold-300' : 'text-stone-200'}>{t}</span><span className={`text-xs ${cost > 0 ? 'text-orange-300' : 'text-emerald-300'}`}>{cost > 0 ? `−${cost}` : `+${-cost}`} pts</span></div>
                      <div className="text-[11px] text-stone-400">{TRAIT_INFO[t]}</div>
                      {opposites(t).length > 0 && <div className="text-[10px] text-stone-500 mt-0.5">Opposite: {opposites(t).join(', ')}{clash && ' (you have it)'}</div>}
                    </button>
                  );
                })}
              </div>
              {traitConflicts(o.traits ?? []).map(([a, b]) => <p key={a + b} className="text-blood-400 text-xs mt-2">{a} and {b} are opposites.</p>)}
            </div>
          )}

          {sec === 'life' && (
            <div className="space-y-4">
              <Group title="Lifestyle focus">
                {LIFESTYLE_IDS.map((id) => (
                  <Choice key={id} on={o.lifestyle === id} onClick={() => up({ lifestyle: id })} title={LIFESTYLES[id].name} text={LIFESTYLES[id].text} />
                ))}
              </Group>
              <Group title="Background">
                {BACKGROUNDS.map((b) => (
                  <Choice key={b.id} on={o.background === b.id} onClick={() => up({ background: b.id })} title={b.name}
                    text={`${b.text} ${Object.entries(b.skills).map(([k, v]) => `${SKILL_LABEL[k]} ${v! > 0 ? '+' : ''}${v}`).join(', ')}. ${b.gives}.`} />
                ))}
              </Group>
              <Group title={`Vice (a vice gives back ${VICE_REFUND} points)`}>
                {VICES.map((v) => <Choice key={v.id} on={o.vice === v.id} onClick={() => up({ vice: v.id })} title={v.name} text={v.text} />)}
              </Group>
              <Group title="Difficulty">
                <Choice on={!o.hard} onClick={() => up({ hard: false })} title="Normal" text="The start's money, no extra debts." />
                <Choice on={!!o.hard} onClick={() => up({ hard: true })} title="Hard economy (ironman)" text="40% less cash and a $6,000 shylock debt. One save, no second chances." />
              </Group>
            </div>
          )}

          {sec === 'family' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Married">
                <div className="flex gap-2">
                  <button className={o.married ? 'btn-gold text-xs py-1' : 'btn-ghost text-xs py-1'} onClick={() => up({ married: true })}>Married</button>
                  <button className={!o.married ? 'btn-gold text-xs py-1' : 'btn-ghost text-xs py-1'} onClick={() => up({ married: false })}>Single</button>
                </div>
              </Field>
              {o.married ? (
                <Field label={male ? 'Wife\'s name' : 'Husband\'s name'}>
                  <div className="flex gap-2">
                    <input className="inp flex-1" value={o.spouseName} maxLength={24} onChange={(e) => up({ spouseName: e.target.value })} />
                    <button className="btn-ghost text-xs" onClick={() => up({ spouseName: suggestSpouseName(`${seed}:${Date.now()}`, o.sex ?? 'M') })}>New</button>
                  </div>
                </Field>
              ) : <p className="text-xs text-stone-500 self-center">{(o.kids ?? 0) > 0 ? 'Widowed: the children\'s other parent died two years ago.' : 'Nobody waiting up for you.'}</p>}
              <Field label={`Children (${base.kidsRange[0]}–${kMax})`} hint={start === 'sees' ? 'Vito, Donato and Francesca always stay.' : undefined}>
                <div className="flex items-center gap-2"><input type="range" min={base.kidsRange[0]} max={kMax} value={o.kids} onChange={(e) => up({ kids: Number(e.target.value) })} className="flex-1" /><span className="w-6 text-right">{o.kids}</span></div>
              </Field>
              <Field label="Your mother (the matriarch)" hint={(o.age ?? 0) + 20 > 86 ? 'Too old for her to still be living.' : undefined}>
                <div className="flex gap-2">
                  <button className={o.motherAlive ? 'btn-gold text-xs py-1' : 'btn-ghost text-xs py-1'} onClick={() => up({ motherAlive: true })}>Living</button>
                  <button className={!o.motherAlive ? 'btn-gold text-xs py-1' : 'btn-ghost text-xs py-1'} onClick={() => up({ motherAlive: false })}>Passed</button>
                </div>
              </Field>
            </div>
          )}

          {sec === 'summary' && <Summary seed={seed} start={start} base={baseState} o={o} errors={errors} />}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-noir-700 pt-3">
            {errors.length > 0 && <div className="text-xs text-blood-400 w-full" data-testid="creator-errors">{errors.join(' ')}</div>}
            {sec !== 'summary' ? (
              <button className="btn-gold ml-auto" onClick={() => setSec(SECTIONS[SECTIONS.findIndex((x) => x.id === sec) + 1].id)} data-testid="creator-next">Next →</button>
            ) : (
              <>
                <label className="text-xs text-stone-400">Save in slot{' '}
                  <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} className="rounded bg-noir-800 border border-noir-600 px-2 py-1 text-stone-200">
                    {slots.map((m, i) => <option key={i} value={i + 1}>{i + 1}: {m ? `House of ${m.house} (overwrite)` : 'empty'}</option>)}
                  </select>
                </label>
                <button className="btn-gold ml-auto" disabled={errors.length > 0} onClick={() => onConfirm(o, slot)} data-testid="creator-begin">Begin · Memorial Day, 1960</button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Summary({ seed, start, base, o, errors }: { seed: string; start: StartId; base: GameState; o: CharOptions; errors: string[] }) {
  const after = useMemo(() => {
    if (errors.length) return undefined;
    try { return newGameWith(seed, start, o); } catch { return undefined; }
  }, [seed, start, o, errors.length]);
  if (!after) return <p className="text-blood-400 text-sm">Fix the problems below to see the summary.</p>;
  const b0 = base.characters[base.playerId];
  const b1 = after.characters[after.playerId];
  const kids = (s: GameState, c: Character) => c.childrenIds.filter((id) => s.characters[id]?.alive).length;
  const mom = (s: GameState, c: Character) => (c.motherId && s.characters[c.motherId]?.alive ? 'living' : 'passed');
  const spouse = (s: GameState, c: Character) => (c.spouseId && s.characters[c.spouseId]?.alive ? s.characters[c.spouseId].firstName : 'none');
  const rows: [string, string | number, string | number, boolean?][] = [
    ['Name', `${b0.firstName} ${b0.lastName}`, `${b1.firstName}${b1.nickname ? ` "${b1.nickname}"` : ''} ${b1.lastName}`],
    ['Age', ageOn(b0.birth, base.date), ageOn(b1.birth, after.date)],
    ['Family money', fmt$(base.money), fmt$(after.money), true],
    ['Debts', base.debts.length, after.debts.length, true],
    ['Respect', base.respect, after.respect, true],
    ['Local heat', base.heat.local, after.heat.local, true],
    ...SKILLS.map((k) => [SKILL_LABEL[k], b0.attributes[k], b1.attributes[k], true] as [string, number, number, boolean]),
    ['Traits', b0.traits.join(', ') || '—', b1.traits.join(', ') || '—'],
    ['Lifestyle', b0.lifestyle ? LIFESTYLES[b0.lifestyle.focus].name : '—', b1.lifestyle ? LIFESTYLES[b1.lifestyle.focus].name : '—'],
    ['Vice', (b0.vices ?? []).join(', ') || '—', (b1.vices ?? []).join(', ') || '—'],
    ['Spouse', spouse(base, b0), spouse(after, b1)],
    ['Children', kids(base, b0), kids(after, b1)],
    ['Mother', mom(base, b0), mom(after, b1)],
    ['Secrets you hold', base.secrets.filter((x) => x.knownBy.includes('player')).length, after.secrets.filter((x) => x.knownBy.includes('player')).length, true],
    ['Hooks', base.hooks.filter((h) => h.holder === 'player').length, after.hooks.filter((h) => h.holder === 'player').length, true],
  ];
  return (
    <div data-testid="summary">
      <p className="text-xs text-stone-500 mb-2">The start as written, and the start with your picks.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-stone-500"><th className="py-1">Start</th><th>As written</th><th>Yours</th></tr></thead>
          <tbody>
            {rows.map(([k, a, z]) => (
              <tr key={k} className="border-t border-noir-800">
                <td className="py-1 text-stone-400 pr-2">{k}</td>
                <td className="text-stone-400 pr-2">{a}</td>
                <td className={String(a) !== String(z) ? 'text-gold-300' : 'text-stone-300'}>{z}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(b1.story ?? []).length > 0 && (
        <ul className="mt-3 text-xs text-stone-400 space-y-1 list-disc pl-4">{(b1.story ?? []).slice(-4).map((e, i) => <li key={i}>{e.text}</li>)}</ul>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block panel p-2">
      <span className="block text-xs text-stone-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-stone-500 mt-1 italic">{hint}</span>}
    </label>
  );
}

function Slider({ label, v, on, invert }: { label: string; v: number; on: (v: number) => void; invert?: boolean }) {
  const shown = invert ? 1 - v : v;
  return (
    <Field label={label}>
      <input type="range" min={0} max={0.999} step={0.01} value={shown} onChange={(e) => on(Number(e.target.value))} className="w-full" />
    </Field>
  );
}

function Pills({ items, sel, on }: { items: string[]; sel: number; on: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((x, i) => <button key={x} type="button" onClick={() => on(i)} className={`text-xs px-2 py-0.5 rounded border ${sel === i ? 'border-gold-400 text-gold-300' : 'border-noir-600 text-stone-400'}`}>{x}</button>)}
    </div>
  );
}

function Stepper({ label, value, delta, max, note, on }: { label: string; value: number; delta: number; max: number; note?: string; on: (d: number) => void }) {
  return (
    <div className="panel p-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-stone-200">{label}{note && <span className="text-[10px] text-stone-500 ml-1">{note}</span>}</div>
        <div className="h-1.5 bg-noir-800 rounded mt-1"><div className="h-1.5 bg-gold-500 rounded" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
      </div>
      <button className="btn-ghost text-xs px-2 py-0.5" disabled={delta <= -max} onClick={() => on(delta - 1)} aria-label={`Lower ${label}`}>−</button>
      <span className="w-8 text-center text-stone-100">{value}</span>
      <button className="btn-ghost text-xs px-2 py-0.5" disabled={delta >= max} onClick={() => on(delta + 1)} aria-label={`Raise ${label}`}>+</button>
      <span className={`w-8 text-right text-xs ${delta > 0 ? 'text-orange-300' : delta < 0 ? 'text-emerald-300' : 'text-stone-600'}`}>{delta > 0 ? `+${delta}` : delta}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="panel-title mb-1">{title}</h4>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function Choice({ on, onClick, title, text }: { on: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button onClick={onClick} className={`panel p-2 text-left border ${on ? 'border-gold-400' : 'border-noir-700 hover:border-gold-600'}`}>
      <div className={on ? 'text-gold-300' : 'text-stone-200'}>{title}</div>
      <div className="text-[11px] text-stone-400">{text}</div>
    </button>
  );
}

/**
 * The trait cap, said plainly (A11): how many are chosen, what happens at the
 * cap, and the points the chosen traits cost or give back.
 */
export function TraitCap({ traits }: { traits: readonly Trait[] }) {
  const cost = traits.reduce((a, t) => a + Math.max(0, TRAIT_COST[t]), 0);
  const refund = traits.reduce((a, t) => a + Math.max(0, -TRAIT_COST[t]), 0);
  const full = traits.length >= MAX_TRAITS;
  return (
    <div className={`mb-2 rounded border px-2 py-1 text-xs ${full ? 'border-gold-600 text-gold-300' : 'border-noir-700 text-stone-400'}`} data-testid="trait-cap" role="status">
      <b>{`${traits.length} of ${MAX_TRAITS} selected.`}</b> {full ? 'Remove one to choose another.' : `You can pick ${MAX_TRAITS - traits.length} more.`}
      <span className="ml-2 text-stone-500">{`Good traits cost ${cost} pts · flaws give back ${refund} pts`}</span>
    </div>
  );
}
