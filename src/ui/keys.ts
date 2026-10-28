import { useEffect, useRef } from 'react';

/**
 * KEYBOARD RULES (B10), in one place.
 *
 *  - Typing wins. While focus is in a text field, a select, a slider or
 *    anything editable, no global shortcut fires.
 *  - A focused control keeps its own keys. Space (and Enter) on a button, a
 *    link, a tab or a checkbox activates that control; the clock's Space
 *    toggle only fires when focus is on the page itself.
 *  - The walk owns its movement keys. WalkView takes WASD and the arrows in the
 *    capture phase and stops them, so they never reach the home letters
 *    (W = This Week, …).
 *  - A held key is one press. Auto-repeat never toggles a home on and off.
 *  - Escape closes the nearest transient surface only: popover, then menu,
 *    then sheet, then drawer. Each surface registers with `useEscape`, and the
 *    last one opened is the one that closes. Escape never advances or discards
 *    a turn.
 */

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'number', 'password', 'tel', 'url', 'date', 'time', 'range']);
const TYPING_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'slider', 'spinbutton']);
const ACTIVATABLE_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'option']);

type El = { tagName?: string; type?: string; isContentEditable?: boolean; getAttribute?: (k: string) => string | null; hasAttribute?: (k: string) => boolean };

/** Is the key going into something the player is typing in (or sliding)? */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as El | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return TEXT_INPUTS.has(String(el.type || 'text').toLowerCase());
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.('role');
  return !!role && TYPING_ROLES.has(role);
}

/** Is focus on a control that Space or Enter activates (so the page must not take those keys)? */
export function isActivatableTarget(t: EventTarget | null): boolean {
  const el = t as El | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'BUTTON' || tag === 'SUMMARY') return true;
  if (tag === 'A' && el.hasAttribute?.('href')) return true;
  if (tag === 'INPUT') return !TEXT_INPUTS.has(String(el.type || 'text').toLowerCase());
  const role = el.getAttribute?.('role');
  return !!role && ACTIVATABLE_ROLES.has(role);
}

/** A global letter shortcut (the homes, ?) should not fire for this key event. */
export function shortcutBlocked(e: Pick<KeyboardEvent, 'target' | 'metaKey' | 'ctrlKey' | 'altKey' | 'repeat' | 'defaultPrevented'>): boolean {
  return e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !!e.repeat || isTypingTarget(e.target);
}

/** Space toggles the clock only from the page itself, never from a field or a focused control. */
export function clockSpaceAllowed(e: Pick<KeyboardEvent, 'target' | 'metaKey' | 'ctrlKey' | 'altKey' | 'repeat' | 'defaultPrevented'>): boolean {
  return !shortcutBlocked(e) && !isActivatableTarget(e.target);
}

/* ---- Escape: the nearest surface ---- */

const stack: { fn: () => void }[] = [];
let installed = false;

function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (runEscape()) e.preventDefault();
  });
}

/** Close the nearest registered surface. Returns false when none is open. */
export function runEscape(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.fn();
  return true;
}

/** Register a surface that Escape closes; returns the unregister. The last one registered closes first. */
export function onEscape(fn: () => void): () => void {
  install();
  const entry = { fn };
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** How many surfaces are listening (tests). */
export function escapeDepth(): number {
  return stack.length;
}

/** Hook: while `active`, Escape calls `fn` if this is the nearest open surface. The surface keeps its place in the stack across re-renders. */
export function useEscape(active: boolean, fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => (active ? onEscape(() => ref.current()) : undefined), [active]);
}

/* ---- Number keys on choice cards ---- */

/**
 * Hook: while `active`, the number keys 1…9 pick the n-th choice (`pick(i)`, 0-based) when
 * there is one. Typing wins (no digits taken from a field), a held key is one press.
 * Only the surface on top should be active (a modal's choices).
 */
export function useNumberKeys(active: boolean, count: number, pick: (i: number) => void): void {
  const ref = useRef(pick);
  ref.current = pick;
  useEffect(() => {
    if (!active || count <= 0 || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (shortcutBlocked(e)) return;
      const n = numberKey(e.key);
      if (n === undefined || n >= count) return;
      e.preventDefault();
      ref.current(n);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, count]);
}

/** "1" … "9" → 0 … 8 (anything else: undefined). */
export function numberKey(key: string): number | undefined {
  return /^[1-9]$/.test(key) ? Number(key) - 1 : undefined;
}
