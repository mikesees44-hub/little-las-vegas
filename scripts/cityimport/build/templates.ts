/**
 * Period architectural templates (citydata/templates/period-1960.json) and the
 * generated attributes they supply: height (from real height, else stories ×
 * story height), roof and look. Anything not read from a source is marked
 * generated, with how it was made.
 */

export interface TemplateRule {
  id: string;
  label: string;
  match: { osm?: Record<string, string[]>; classes?: string[]; materials?: string[]; yearFrom?: number; yearTo?: number; maxArea?: number; minLevels?: number; maxLevels?: number };
  roof: string;
  defaultLevels: number;
  palette: string[];
}
export interface TemplateSet { schemaVersion: 1; era: string; note: string; storyHeight: number; groundExtra: number; templates: TemplateRule[] }

export interface TemplateInput { osm: Record<string, string>; propClass: string | null; material: string | null; yr: number | null; area: number; levels: number | null }

export function pickTemplate(set: TemplateSet, x: TemplateInput): TemplateRule {
  for (const t of set.templates) {
    const m = t.match;
    const checks: boolean[] = [];
    // osm and classes are alternatives: either one matching is enough when both are given.
    if (m.osm || m.classes) {
      const osmOk = !!m.osm && Object.entries(m.osm).some(([k, vs]) => x.osm[k] !== undefined && vs.includes(x.osm[k]));
      const clsOk = !!m.classes && x.propClass !== null && m.classes.includes(x.propClass);
      checks.push(osmOk || clsOk);
    }
    if (m.materials) checks.push(x.material !== null && m.materials.includes(x.material));
    if (m.yearFrom !== undefined) checks.push(x.yr !== null && x.yr >= m.yearFrom);
    if (m.yearTo !== undefined) checks.push(x.yr !== null && x.yr <= m.yearTo);
    if (m.maxArea !== undefined) checks.push(x.area <= m.maxArea);
    if (m.minLevels !== undefined) checks.push(x.levels !== null && x.levels >= m.minLevels);
    if (m.maxLevels !== undefined) checks.push(x.levels !== null && x.levels <= m.maxLevels);
    if (checks.every(Boolean)) return t;
  }
  return set.templates[set.templates.length - 1];
}

export interface Generated<T> { value: T; generated: boolean; method: string }

/** Height: an OSM `height` is real; anything else is generated (stories × story height + ground). */
export function heightOf(set: TemplateSet, osm: Record<string, string>, assessorStories: number | null, t: TemplateRule): { height: Generated<number>; levels: Generated<number> } {
  const h = parseFloat(osm.height ?? '');
  const lv = parseFloat(osm['building:levels'] ?? '');
  const levels: Generated<number> = Number.isFinite(lv) ? { value: lv, generated: false, method: 'OSM building:levels' }
    : assessorStories !== null ? { value: assessorStories, generated: false, method: 'assessor BLDG_DESC stories (MOD-IV)' }
      : { value: t.defaultLevels, generated: true, method: `template ${t.id} default` };
  if (Number.isFinite(h)) return { height: { value: h, generated: false, method: 'OSM height' }, levels };
  return { height: { value: Math.round((levels.value * set.storyHeight + set.groundExtra) * 10) / 10, generated: true, method: `${levels.value} storeys × ${set.storyHeight} m + ${set.groundExtra} m (${levels.method})` }, levels };
}

/** Roof: an OSM `roof:shape` is real; otherwise the template's. */
export function roofOf(osm: Record<string, string>, t: TemplateRule): Generated<string> {
  return osm['roof:shape'] ? { value: osm['roof:shape'], generated: false, method: 'OSM roof:shape' } : { value: t.roof, generated: true, method: `template ${t.id}` };
}
