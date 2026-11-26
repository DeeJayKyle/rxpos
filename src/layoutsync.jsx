// Each person's table and tab layouts on every device they sign in on (the owner's choice, 2026-11-26). A device keeps
// its layout in localStorage (src/device.js: columns, sorts, tabs); this copies it to the person's own synced record
// prefs "u:<user id>" and takes theirs from it. The newest layout wins (layoutAt). The cloud lets a staff device write
// only its own person's record and sends that record to that person only (worker/policy.js prefsRefused, dmHidden).
import { useEffect, useRef } from 'react';
import { deviceSettings, onDevice, setDevice } from './device.js';
import { useStore, put } from './store.jsx';

const PARTS = ['columns', 'sorts', 'tabs'];
const pick = (o) => Object.fromEntries(PARTS.map((k) => [k, o?.[k] || {}]));
const same = (a, b) => JSON.stringify(pick(a)) === JSON.stringify(pick(b));
const empty = (o) => PARTS.every((k) => !Object.keys(o?.[k] || {}).length);

export function LayoutSync() {
  const { db, user, update } = useStore();
  const uidv = user?.id;
  const rec = uidv ? (db.prefs || []).find((r) => r.id === 'u:' + uidv) : null;
  const applying = useRef(false);
  const timer = useRef(null);

  // a layout from another device (newer than this one's): show it here
  useEffect(() => {
    if (!uidv || !rec) return;
    const here = deviceSettings();
    if (same(here, rec)) return;
    if ((Number(here.layoutAt) || 0) > (Number(rec.layoutAt) || 0)) { update((d) => { put(d, 'prefs', { id: 'u:' + uidv, userId: uidv, ...pick(here), layoutAt: Number(here.layoutAt) }); }); return; }
    applying.current = true;
    setDevice({ ...pick(rec), layoutAt: Number(rec.layoutAt) || Date.now() });
    applying.current = false;
    window.dispatchEvent(new Event('rxpos-layout'));
  }, [uidv, rec, update]);

  // a change on this device: keep it with the person (a moment after the last change, so a drag is one write)
  const recRef = useRef(rec); recRef.current = rec;
  useEffect(() => {
    if (!uidv) return undefined;
    const push = () => {
      const here = deviceSettings();
      const cur = recRef.current;
      if (cur && same(here, cur)) return;
      if (!cur && empty(here)) return;
      update((d) => { put(d, 'prefs', { id: 'u:' + uidv, userId: uidv, ...pick(here), layoutAt: Number(here.layoutAt) || Date.now() }); });
    };
    let last = JSON.stringify(pick(deviceSettings()));
    const off = onDevice((s) => {
      if (applying.current) { last = JSON.stringify(pick(s)); return; }
      const now = JSON.stringify(pick(s));
      if (now === last) return;
      last = now;
      setDevice({ layoutAt: Date.now() });
      clearTimeout(timer.current);
      timer.current = setTimeout(push, 1500);
    });
    // first sign-in here with a layout already made on this device and none kept yet
    if (!recRef.current && !empty(deviceSettings())) timer.current = setTimeout(push, 3000);
    return () => { off(); clearTimeout(timer.current); };
  }, [uidv, update]);
  return null;
}
