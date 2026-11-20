// Options on every page (the owner's request, 2026-11-20): a right-click (or a long press on a phone or tablet)
// anywhere on a page opens a menu of what can be done there. The shell (App.jsx) adds what every page has (back,
// search, sync, pin, print); a page adds its own with usePageMenu([...]) while it is open.
// A long press on a touch screen is turned into the same right-click, so every menu that answers a right-click
// (list rows, dashboard cards, the page) also answers a long press.
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const pages = new Map(); // path → () => items

/** This page's own options: [{ label, Icon, run, danger, disabled }, '-' for a line] */
export function usePageMenu(items) {
  const { pathname } = useLocation();
  const ref = useRef(items);
  ref.current = items;
  useEffect(() => {
    const get = () => ref.current;
    pages.set(pathname, get);
    return () => { if (pages.get(pathname) === get) pages.delete(pathname); };
  }, [pathname]);
}

/** The open page's own options */
export const pageMenuFor = (path) => (pages.get(path)?.() || []).filter(Boolean);

/** Where the browser's own menu is kept: typing, links opened elsewhere, text being selected */
export const keepsNativeMenu = (target) => !!target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]') || !!window.getSelection?.()?.toString();

/**
 * A long press on a touch screen (550 ms without moving) becomes a right-click at that spot. Phones whose browser
 * already sends one on a long press are left to do so (no second menu). Returns the function that removes it.
 */
export function longPressToContextMenu(root = document, ms = 550) {
  let timer = 0, start = null, fired = false;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  const down = (e) => {
    if (e.pointerType !== 'touch' || keepsNativeMenu(e.target)) return;
    start = { x: e.clientX, y: e.clientY, target: e.target };
    fired = false;
    cancel();
    timer = setTimeout(() => {
      timer = 0; fired = true;
      start.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y }));
      navigator.vibrate?.(15);
    }, ms);
  };
  const move = (e) => { if (timer && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); };
  const native = (e) => { if (timer && e.isTrusted) cancel(); }; // the browser opened its own long-press menu event
  // the lift after a long press is not a tap on what was pressed (a click elsewhere goes through)
  const click = (e) => { if (fired && start?.target && (start.target === e.target || start.target.contains?.(e.target) || e.target.contains?.(start.target))) { e.preventDefault(); e.stopPropagation(); } fired = false; };
  root.addEventListener('pointerdown', down, true); root.addEventListener('pointermove', move, true);
  // the click that follows the lift is swallowed; a later click (a while after) is never touched
  const up = () => { cancel(); if (fired) setTimeout(() => { fired = false; }, 400); };
  root.addEventListener('pointerup', up, true); root.addEventListener('pointercancel', up, true);
  root.addEventListener('contextmenu', native, true); root.addEventListener('click', click, true);
  return () => {
    cancel();
    root.removeEventListener('pointerdown', down, true); root.removeEventListener('pointermove', move, true);
    root.removeEventListener('pointerup', up, true); root.removeEventListener('pointercancel', up, true);
    root.removeEventListener('contextmenu', native, true); root.removeEventListener('click', click, true);
  };
}
