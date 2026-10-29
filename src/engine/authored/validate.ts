import { DEEDS } from '../deeds/catalog';
import { EFFECT_KEYS, MATURE_POOLS, ROLE_POOLS, SCENE_THEMES, type Scene } from './format';

/**
 * THE VALIDATOR. Every scene file is checked field by field before the game
 * uses it, and every mistake is said in plain words with where it is:
 *   scenes/crew.json › capo_bad_night › choices[1] › effects[0]: unknown effect "moneys" (did you mean "money"?)
 * A scene with a mistake is left out (the rest still load); the errors are
 * listed for the writer (docs/SCENES.md, and the tests).
 */

export const TRAITS = ['Greedy', 'Hot-headed', 'Patient', 'Ambitious', 'Loyal-to-a-fault', 'Paranoid', 'Pious', 'Womanizer', 'Gambler', 'Honest', 'Cruel', 'Cowardly', 'Charming', 'Vengeful', 'Drinker'];
export const RANKS = ['boss', 'underboss', 'consigliere', 'capo', 'soldier', 'associate', 'civilian'];
export const MOODS = ['content', 'proud', 'restless', 'angry', 'afraid', 'greedy', 'grieving', 'scheming', 'loyal'];
export const TIE_KINDS = ['friend', 'ally', 'rival', 'feud', 'lovers'];
export const DISTRICTS = ['boardwalk', 'pacific', 'piers', 'downtown', 'docks', 'crest', 'north', 'causeway'];
export const FIELDS = ['name', 'first', 'last', 'nick', 'call', 'he', 'his', 'him', 'He', 'His'];

const SCENE_KEYS = ['id', 'title', 'theme', 'followup', 'about', 'when', 'who', 'text', 'choices'];
const WHEN_KEYS = ['years', 'season', 'months', 'week', 'flags', 'notFlags', 'money', 'respect', 'heat', 'boss', 'location', 'chance', 'weight', 'cooldown', 'once', 'mature'];
const ROLE_KEYS = ['pool', 'rank', 'traits', 'notTraits', 'gender', 'age', 'mood', 'opinionOfBoss', 'opinionOf', 'tie', 'sameSideAs', 'partnerOf'];
const CHOICE_KEYS = ['label', 'hint', 'requires', 'odds', 'effects', 'success', 'failure', 'result', 'failText', 'next'];
const REQ_KEYS = ['money', 'respect', 'favors', 'flag', 'trait', 'notTrait'];
const ODDS_KEYS = ['base', 'deed', 'actor', 'target', 'plus'];
const NEXT_KEYS = ['scene', 'after', 'on'];

/** Edit distance, for "did you mean". */
function lev(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1));
  return d[a.length][b.length];
}

export function didYouMean(x: string, opts: readonly string[]): string {
  let best = '';
  let bd = Infinity;
  for (const o of opts) {
    const v = lev(x, o);
    if (v < bd) { bd = v; best = o; }
  }
  return best && bd <= Math.max(2, Math.floor(best.length / 3)) ? ` (did you mean "${best}"?)` : ` (one of: ${opts.slice(0, 12).join(', ')}${opts.length > 12 ? ', …' : ''})`;
}

export const COMPARE_RE = /^\s*(<=|>=|!=|<|>|=)?\s*(-?\d+(?:\.\d+)?)\s*$/;

/** Does `v` satisfy a comparison written as text ("<0", ">=40", "3")? */
export function compare(v: number, c: string | number): boolean {
  if (typeof c === 'number') return v >= c;
  const m = COMPARE_RE.exec(c);
  if (!m) return false;
  const n = Number(m[2]);
  switch (m[1] ?? '>=') {
    case '<': return v < n;
    case '<=': return v <= n;
    case '>': return v > n;
    case '>=': return v >= n;
    case '=': return v === n;
    case '!=': return v !== n;
  }
  return false;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const comment = (k: string) => k.startsWith('_') || k === 'note' || k === 'notes' || k === '$comment';

export interface Checked { scenes: Scene[]; errors: string[] }

/** Check every file (name -> parsed JSON). Scenes with errors are left out. */
export function validateScenes(files: Record<string, unknown>): Checked {
  const errors: string[] = [];
  const raw: { file: string; sc: Record<string, unknown> }[] = [];
  for (const [file, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.scenes) ? data.scenes : isObj(data) ? [data] : undefined;
    if (!list) { errors.push(`${file}: a scene file holds a scene, a list of scenes, or { "scenes": [...] }`); continue; }
    list.forEach((sc, i) => {
      if (!isObj(sc)) errors.push(`${file} › scene #${i + 1}: should be an object { "id": ..., "title": ..., ... }`);
      else raw.push({ file, sc });
    });
  }
  const ids = new Set<string>();
  const dup = new Set<string>();
  for (const { sc } of raw) {
    if (typeof sc.id === 'string') { if (ids.has(sc.id)) dup.add(sc.id); ids.add(sc.id); }
  }
  const ok: Scene[] = [];
  for (const { file, sc } of raw) {
    const before = errors.length;
    checkScene(file, sc, ids, errors);
    if (typeof sc.id === 'string' && dup.has(sc.id)) errors.push(`${file} › ${sc.id}: the id "${sc.id}" is used by more than one scene`);
    if (errors.length === before) ok.push(sc as unknown as Scene);
  }
  return { scenes: ok, errors };
}

function checkScene(file: string, sc: Record<string, unknown>, allIds: Set<string>, errors: string[]): void {
  const id = typeof sc.id === 'string' ? sc.id : '?';
  const at = (p: string) => `${file} › ${id}${p ? ` › ${p}` : ''}`;
  const err = (p: string, m: string) => errors.push(`${at(p)}: ${m}`);
  for (const k of Object.keys(sc)) if (!SCENE_KEYS.includes(k) && !comment(k)) err('', `unknown field "${k}"${didYouMean(k, SCENE_KEYS)}`);
  if (!isStr(sc.id) || !/^[a-z][a-z0-9_]*$/.test(sc.id)) err('id', 'needs an "id" of lowercase letters, digits and _ (e.g. "capo_bad_night")');
  if (!isStr(sc.title)) err('title', 'needs a "title"');
  if (!isStr(sc.text)) err('text', 'needs a "text" (what the boss reads)');
  if (sc.theme !== undefined && !SCENE_THEMES.includes(sc.theme as never)) err('theme', `"${String(sc.theme)}" is not a theme${didYouMean(String(sc.theme), SCENE_THEMES)}`);
  if (sc.followup !== undefined && typeof sc.followup !== 'boolean') err('followup', 'should be true or false');
  if (sc.about !== undefined && sc.about !== 'boss') err('about', 'should be "boss"');
  // Roles.
  const roles = new Set<string>(['boss']);
  if (sc.who !== undefined) {
    if (!isObj(sc.who)) err('who', 'should be an object of roles: { "capo": { "pool": "capo" } }');
    else {
      for (const r of Object.keys(sc.who)) {
        if (!/^[a-z][a-zA-Z0-9]*$/.test(r)) err(`who.${r}`, 'a role name is one word, starting lowercase (e.g. "capo", "wife", "rivalMan")');
        if (r === 'boss' || r === 'district' || r === 'house') err(`who.${r}`, `"${r}" is built in; pick another name`);
        roles.add(r);
      }
      for (const [r, spec] of Object.entries(sc.who)) checkRole(`who.${r}`, spec, roles, err);
    }
  }
  if (sc.when !== undefined) checkWhen(sc.when, err);
  // Text placeholders.
  const texts: [string, unknown][] = [['title', sc.title], ['text', sc.text]];
  // Choices.
  if (!Array.isArray(sc.choices) || sc.choices.length < 2 || sc.choices.length > 4) err('choices', 'needs 2 to 4 choices');
  else sc.choices.forEach((ch, i) => {
    const p = `choices[${i}]`;
    if (!isObj(ch)) { err(p, 'should be an object { "label": ..., "effects": [...] }'); return; }
    for (const k of Object.keys(ch)) if (!CHOICE_KEYS.includes(k) && !comment(k)) err(p, `unknown field "${k}"${didYouMean(k, CHOICE_KEYS)}`);
    if (!isStr(ch.label)) err(p, 'needs a "label" (the button)');
    texts.push([`${p}.label`, ch.label], [`${p}.hint`, ch.hint], [`${p}.result`, ch.result], [`${p}.failText`, ch.failText]);
    if (ch.requires !== undefined) {
      if (!isObj(ch.requires)) err(`${p}.requires`, 'should be an object');
      else for (const [k, v] of Object.entries(ch.requires)) {
        if (!REQ_KEYS.includes(k)) err(`${p}.requires`, `unknown requirement "${k}"${didYouMean(k, REQ_KEYS)}`);
        else if ((k === 'trait' || k === 'notTrait') && !TRAITS.includes(String(v))) err(`${p}.requires.${k}`, `"${String(v)}" is not a trait${didYouMean(String(v), TRAITS)}`);
        else if ((k === 'money' || k === 'respect' || k === 'favors') && !isNum(v)) err(`${p}.requires.${k}`, 'should be a number');
        else if (k === 'flag' && !isStr(v)) err(`${p}.requires.flag`, 'should be a flag name');
      }
    }
    const hasOdds = ch.odds !== undefined;
    if (hasOdds) {
      if (!isObj(ch.odds)) err(`${p}.odds`, 'should be an object { "base": 50 }');
      else {
        const o = ch.odds;
        for (const k of Object.keys(o)) if (!ODDS_KEYS.includes(k)) err(`${p}.odds`, `unknown field "${k}"${didYouMean(k, ODDS_KEYS)}`);
        if (o.deed !== undefined) {
          if (!(String(o.deed) in DEEDS)) err(`${p}.odds.deed`, `"${String(o.deed)}" is not a deed${didYouMean(String(o.deed), Object.keys(DEEDS))}`);
          for (const k of ['actor', 'target'] as const) if (!roles.has(String(o[k] ?? ''))) err(`${p}.odds.${k}`, `with a deed, "${k}" must name a role (${[...roles].join(', ')})`);
        } else if (!isNum(o.base) || o.base < 0 || o.base > 100) err(`${p}.odds.base`, 'needs a "base" from 0 to 100 (or a "deed")');
        if (o.plus !== undefined) {
          if (!Array.isArray(o.plus)) err(`${p}.odds.plus`, 'should be a list of { "if": {...}, "add": 10, "why": "..." }');
          else o.plus.forEach((x, j) => {
            const q = `${p}.odds.plus[${j}]`;
            if (!isObj(x) || !isObj(x.if) || !isNum(x.add) || !isStr(x.why)) { err(q, 'should be { "if": {...}, "add": 10, "why": "..." }'); return; }
            const c = x.if;
            for (const k of Object.keys(c)) if (!['role', 'trait', 'bossTrait', 'flag', 'opinionOfBoss'].includes(k)) err(q, `unknown condition "${k}"`);
            if (c.role !== undefined && !roles.has(String(c.role))) err(q, `no role "${String(c.role)}"${didYouMean(String(c.role), [...roles])}`);
            for (const k of ['trait', 'bossTrait'] as const) if (c[k] !== undefined && !TRAITS.includes(String(c[k]))) err(q, `"${String(c[k])}" is not a trait${didYouMean(String(c[k]), TRAITS)}`);
            if (c.opinionOfBoss !== undefined && !COMPARE_RE.test(String(c.opinionOfBoss))) err(q, 'opinionOfBoss should look like "<0" or ">=40"');
          });
        }
      }
    }
    for (const part of ['effects', 'success', 'failure'] as const) {
      const list = ch[part];
      if (list === undefined) continue;
      if ((part === 'success' || part === 'failure') && !hasOdds) err(`${p}.${part}`, `"${part}" needs "odds" on the choice (else use "effects")`);
      if (!Array.isArray(list)) { err(`${p}.${part}`, 'should be a list of effects'); continue; }
      list.forEach((fx, j) => checkEffect(`${p}.${part}[${j}]`, fx, roles, err));
    }
    if (!hasOdds && ch.effects === undefined && ch.next === undefined) err(p, 'does nothing: give it "effects", "odds" or "next"');
    if (ch.next !== undefined) {
      const list = Array.isArray(ch.next) ? ch.next : [ch.next];
      list.forEach((n, j) => {
        const q = `${p}.next${Array.isArray(ch.next) ? `[${j}]` : ''}`;
        if (!isObj(n) || !isStr(n.scene)) { err(q, 'should be { "scene": "next_id", "after": [1, 3] }'); return; }
        for (const k of Object.keys(n)) if (!NEXT_KEYS.includes(k)) err(q, `unknown field "${k}"${didYouMean(k, NEXT_KEYS)}`);
        if (!allIds.has(n.scene)) err(q, `no scene "${n.scene}"${didYouMean(n.scene, [...allIds])}`);
        if (n.after !== undefined && !(isNum(n.after) && n.after >= 0) && !(Array.isArray(n.after) && n.after.length === 2 && n.after.every((x) => isNum(x) && x >= 0) && n.after[0] <= n.after[1])) err(q, '"after" is weeks: 2, or a range [1, 3]');
        if (n.on !== undefined && !['always', 'success', 'failure'].includes(String(n.on))) err(q, `"on" is always, success or failure`);
        if ((n.on === 'success' || n.on === 'failure') && !hasOdds) err(q, `"on": "${String(n.on)}" needs "odds" on the choice`);
      });
    }
  });
  for (const [p, t] of texts) {
    if (t === undefined) continue;
    if (typeof t !== 'string') { err(p, 'should be text'); continue; }
    for (const m of t.matchAll(/\{([^}]*)\}/g)) {
      const [r, f] = m[1].split('.');
      if (!f) { if (r !== 'district' && r !== 'house') err(p, `unknown placeholder {${m[1]}} (use {role.first}, {role.name}, {district}, {house})`); continue; }
      if (!roles.has(r)) err(p, `{${m[1]}}: no role "${r}"${didYouMean(r, [...roles])}`);
      else if (!FIELDS.includes(f)) err(p, `{${m[1]}}: unknown field "${f}"${didYouMean(f, FIELDS)}`);
    }
  }
}

function checkRole(p: string, spec: unknown, roles: Set<string>, err: (p: string, m: string) => void): void {
  if (!isObj(spec)) { err(p, 'should be an object { "pool": "crew", ... }'); return; }
  for (const k of Object.keys(spec)) if (!ROLE_KEYS.includes(k) && !comment(k)) err(p, `unknown field "${k}"${didYouMean(k, ROLE_KEYS)}`);
  if (!ROLE_POOLS.includes(spec.pool as never)) err(`${p}.pool`, `"${String(spec.pool)}" is not a pool${didYouMean(String(spec.pool), ROLE_POOLS)}`);
  const ranks = spec.rank === undefined ? [] : Array.isArray(spec.rank) ? spec.rank : [spec.rank];
  for (const r of ranks) if (!RANKS.includes(String(r))) err(`${p}.rank`, `"${String(r)}" is not a rank${didYouMean(String(r), RANKS)}`);
  for (const k of ['traits', 'notTraits'] as const) {
    if (spec[k] === undefined) continue;
    if (!Array.isArray(spec[k])) { err(`${p}.${k}`, 'should be a list of traits'); continue; }
    for (const t of spec[k] as unknown[]) if (!TRAITS.includes(String(t))) err(`${p}.${k}`, `"${String(t)}" is not a trait${didYouMean(String(t), TRAITS)}`);
  }
  if (spec.gender !== undefined && spec.gender !== 'M' && spec.gender !== 'F') err(`${p}.gender`, 'is "M" or "F"');
  if (spec.age !== undefined && !(Array.isArray(spec.age) && spec.age.length === 2 && spec.age.every(isNum))) err(`${p}.age`, 'is a range [min, max]');
  const moods = spec.mood === undefined ? [] : Array.isArray(spec.mood) ? spec.mood : [spec.mood];
  for (const m of moods) if (!MOODS.includes(String(m))) err(`${p}.mood`, `"${String(m)}" is not a mood${didYouMean(String(m), MOODS)}`);
  if (spec.opinionOfBoss !== undefined && !COMPARE_RE.test(String(spec.opinionOfBoss))) err(`${p}.opinionOfBoss`, 'should look like "<0" or ">=40"');
  if (spec.opinionOf !== undefined) {
    if (!isObj(spec.opinionOf)) err(`${p}.opinionOf`, 'should be { "otherRole": "<-20" }');
    else for (const [r, c] of Object.entries(spec.opinionOf)) {
      if (!roles.has(r)) err(`${p}.opinionOf`, `no role "${r}"${didYouMean(r, [...roles])}`);
      if (!COMPARE_RE.test(String(c))) err(`${p}.opinionOf.${r}`, 'should look like "<-20" or ">=40"');
    }
  }
  if (spec.sameSideAs !== undefined && !roles.has(String(spec.sameSideAs))) err(`${p}.sameSideAs`, `no role "${String(spec.sameSideAs)}"${didYouMean(String(spec.sameSideAs), [...roles])}`);
  if (spec.partnerOf !== undefined && (!roles.has(String(spec.partnerOf)) || spec.partnerOf === 'boss')) err(`${p}.partnerOf`, `no role "${String(spec.partnerOf)}"${didYouMean(String(spec.partnerOf), [...roles])}`);
  if (spec.age !== undefined && MATURE_POOLS.includes(spec.pool as never) && Array.isArray(spec.age) && Number(spec.age[0]) < 18) err(`${p}.age`, 'adults only: this pool starts at 18');
  if (spec.tie !== undefined) {
    if (!isObj(spec.tie)) err(`${p}.tie`, 'should be { "otherRole": "feud" }');
    else for (const [r, k] of Object.entries(spec.tie)) {
      if (!roles.has(r)) err(`${p}.tie`, `no role "${r}"${didYouMean(r, [...roles])}`);
      if (!TIE_KINDS.includes(String(k))) err(`${p}.tie.${r}`, `"${String(k)}" is not a tie${didYouMean(String(k), TIE_KINDS)}`);
    }
  }
}

function checkWhen(w: unknown, err: (p: string, m: string) => void): void {
  if (!isObj(w)) { err('when', 'should be an object'); return; }
  for (const k of Object.keys(w)) if (!WHEN_KEYS.includes(k) && !comment(k)) err('when', `unknown condition "${k}"${didYouMean(k, WHEN_KEYS)}`);
  if (w.years !== undefined && !(Array.isArray(w.years) && w.years.length === 2 && w.years.every(isNum) && w.years[0] <= w.years[1])) err('when.years', 'is a range like [1960, 1964]');
  if (w.season !== undefined && w.season !== 'summer' && w.season !== 'offseason') err('when.season', 'is "summer" or "offseason"');
  if (w.months !== undefined && !(Array.isArray(w.months) && w.months.every((m) => isNum(m) && m >= 1 && m <= 12))) err('when.months', 'is a list of months 1-12');
  if (w.week !== undefined && !(isObj(w.week) && Object.keys(w.week).every((k) => (k === 'min' || k === 'max') && isNum(w.week && (w.week as Record<string, unknown>)[k])))) err('when.week', 'is { "min": 4, "max": 200 }');
  for (const k of ['flags', 'notFlags'] as const) if (w[k] !== undefined && !(Array.isArray(w[k]) && (w[k] as unknown[]).every(isStr))) err(`when.${k}`, 'is a list of flag names');
  for (const k of ['money', 'respect'] as const) if (w[k] !== undefined && !COMPARE_RE.test(String(w[k]))) err(`when.${k}`, 'should look like ">5000" or "<30"');
  if (w.heat !== undefined) {
    if (!isObj(w.heat)) err('when.heat', 'is { "local": ">40" }');
    else for (const [k, v] of Object.entries(w.heat)) {
      if (!['local', 'family', 'federal'].includes(k)) err('when.heat', `"${k}" is not a heat bar (local, family, federal)`);
      if (!COMPARE_RE.test(String(v))) err(`when.heat.${k}`, 'should look like ">40"');
    }
  }
  if (w.boss !== undefined) {
    if (!isObj(w.boss)) err('when.boss', 'is { "traits": [...], "notTraits": [...] }');
    else for (const k of ['traits', 'notTraits'] as const) for (const t of (Array.isArray(w.boss[k]) ? w.boss[k] : []) as unknown[]) if (!TRAITS.includes(String(t))) err(`when.boss.${k}`, `"${String(t)}" is not a trait${didYouMean(String(t), TRAITS)}`);
  }
  if (w.location !== undefined && !DISTRICTS.includes(String(w.location))) err('when.location', `"${String(w.location)}" is not a district${didYouMean(String(w.location), DISTRICTS)}`);
  if (w.chance !== undefined && !(isNum(w.chance) && w.chance > 0 && w.chance <= 1)) err('when.chance', 'is between 0 and 1 (e.g. 0.3)');
  for (const k of ['weight', 'cooldown'] as const) if (w[k] !== undefined && !(isNum(w[k]) && (w[k] as number) >= 0)) err(`when.${k}`, 'is a number of 0 or more');
  if (w.once !== undefined && typeof w.once !== 'boolean') err('when.once', 'is true or false');
  if (w.mature !== undefined && typeof w.mature !== 'boolean') err('when.mature', 'is true or false');
}

function checkEffect(p: string, fx: unknown, roles: Set<string>, err: (p: string, m: string) => void): void {
  if (!isObj(fx) || Object.keys(fx).length !== 1) { err(p, 'an effect is an object with one key, e.g. { "money": -500 }'); return; }
  const [k, v] = Object.entries(fx)[0];
  const role = (q: string, r: unknown) => { if (!roles.has(String(r))) err(`${p}.${q}`, `no role "${String(r)}"${didYouMean(String(r), [...roles])}`); };
  const num = (q: string, x: unknown) => { if (!isNum(x)) err(`${p}.${q}`, 'should be a number'); };
  const obj = (keys: string[]) => {
    if (!isObj(v)) { err(p, `"${k}" takes an object with ${keys.join(', ')}`); return undefined; }
    for (const kk of Object.keys(v)) if (!keys.includes(kk)) err(`${p}.${k}`, `unknown field "${kk}"${didYouMean(kk, keys)}`);
    return v;
  };
  switch (k) {
    case 'money': case 'respect': num(k, v); break;
    case 'flag': case 'unflag': if (!isStr(v)) err(p, `"${k}" takes a flag name`); break;
    case 'heat': { const o = obj(['local', 'family', 'federal']); if (o) for (const [kk, x] of Object.entries(o)) num(`heat.${kk}`, x); break; }
    case 'opinion': { const o = obj(['of', 'toward', 'by', 'why']); if (o) { role('of', o.of); role('toward', o.toward); num('by', o.by); if (o.of === o.toward) err(p, '"of" and "toward" are the same person'); } break; }
    case 'fear': case 'trust': case 'grievance': { const o = obj(['of', 'toward', 'by']); if (o) { role('of', o.of); role('toward', o.toward); num('by', o.by); } break; }
    case 'crew': case 'family': { const o = obj(['by', 'why']); if (o) num('by', o.by); break; }
    case 'tie': { const o = obj(['a', 'b', 'kind', 'why']); if (o) { role('a', o.a); role('b', o.b); if (![...TIE_KINDS, 'none'].includes(String(o.kind))) err(`${p}.tie.kind`, `"${String(o.kind)}" is not a tie${didYouMean(String(o.kind), [...TIE_KINDS, 'none'])}`); } break; }
    case 'memory': { const o = obj(['who', 'about', 'text', 'weight']); if (o) { role('who', o.who); role('about', o.about); if (!isStr(o.text)) err(`${p}.memory.text`, 'needs the memory in his words'); num('weight', o.weight); } break; }
    case 'wealth': { const o = obj(['role', 'by']); if (o) { role('role', o.role); num('by', o.by); } break; }
    case 'hook': { const o = obj(['on', 'strong', 'why']); if (o) role('on', o.on); break; }
    case 'owes': { const o = obj(['who', 'to']); if (o) { role('who', o.who); role('to', o.to); } break; }
    case 'deed': { const o = obj(['id', 'actor', 'target']); if (o) { if (!(String(o.id) in DEEDS)) err(`${p}.deed.id`, `"${String(o.id)}" is not a deed${didYouMean(String(o.id), Object.keys(DEEDS))}`); role('actor', o.actor); role('target', o.target); } break; }
    case 'evidence': { const o = obj(['role', 'by']); if (o) { role('role', o.role); num('by', o.by); } break; }
    case 'jail': { const o = obj(['role', 'weeks']); if (o) { role('role', o.role); num('weeks', o.weeks); if (o.role === 'boss') err(p, 'the boss cannot be jailed from a scene'); } break; }
    case 'whack': { const o = obj(['role', 'why']); if (o) { role('role', o.role); if (o.role === 'boss') err(p, 'a scene cannot whack the boss'); } break; }
    case 'runs': { const o = obj(['role']); if (o) { role('role', o.role); if (o.role === 'boss') err(p, 'the boss does not run from a scene'); } break; }
    case 'scorn': { const o = obj(['who', 'by', 'why']); if (o) { role('who', o.who); num('by', o.by); if (o.who === 'boss') err(p, 'the boss does not scorn himself'); } break; }
    case 'hush': case 'leak': { const o = obj(['role']); if (o) { role('role', o.role); if (o.role === 'boss') err(p, `"${k}" is about her, not the boss`); } break; }
    case 'suspect': { const o = obj(['role', 'by']); if (o) { role('role', o.role); num('by', o.by); if (o.role === 'boss') err(p, 'the boss does not suspect himself'); } break; }
    default: err(p, `unknown effect "${k}"${didYouMean(k, EFFECT_KEYS)}`);
  }
}
