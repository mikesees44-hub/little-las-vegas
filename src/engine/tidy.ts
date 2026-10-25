/**
 * Keeps the state plain JSON: drops properties set to undefined and turns -0
 * into 0, in place. Saves are JSON, so a state that holds either would load
 * back different from how it was left. Runs once at the end of each week.
 */
export function tidyState(root: unknown): void {
  const stack: unknown[] = [root];
  while (stack.length) {
    const o = stack.pop();
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        const v = o[i];
        if (v === 0 && 1 / v < 0) o[i] = 0;
        else if (v && typeof v === 'object') stack.push(v);
      }
    } else if (o && typeof o === 'object') {
      const rec = o as Record<string, unknown>;
      for (const k in rec) {
        const v = rec[k];
        if (v === undefined) delete rec[k];
        else if (v === 0 && 1 / v < 0) rec[k] = 0;
        else if (v && typeof v === 'object') stack.push(v);
      }
    }
  }
}
