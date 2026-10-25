/**
 * The single hook the Empire Designer (branch `empire`) plugs into. Clicking
 * a building on the island opens its street-view card (with the existing
 * LotPanel and the Deal window for buying); the card shows an "Open the
 * Empire Designer" button only once a designer has registered here:
 *
 *   import { registerDesigner } from '../hood/designerHook';
 *   registerDesigner((lotId) => openMyDesigner(lotId));
 *
 * `lotId` is the property record's id (`econ.lots[].id`); for one of your
 * places that has no lot, it is `biz:<businessId>`.
 */

type Opener = (lotId: string) => void;

let impl: Opener | undefined;
const listeners = new Set<() => void>();

export function registerDesigner(fn: Opener | undefined): void {
  impl = fn;
  for (const l of listeners) l();
}

export function hasDesigner(): boolean {
  return !!impl;
}

/** Open the designer on a property. Returns false if none is installed. */
export function openDesigner(lotId: string): boolean {
  if (!impl) return false;
  impl(lotId);
  return true;
}

/** For the UI: re-render when a designer registers. */
export function onDesignerChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
