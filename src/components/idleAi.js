// AI for the idle screen ("shop window", src/engage.jsx Spotlight): which medicines to feature and their wording
// (POST /api/ai/idle-cards, once a day), and an illustration per health topic (POST /api/ai/idle-image, kept on
// the device). Everything is optional: offline, unlinked, AI switched off or a hub without AI, the screen shows its
// own picks, the WHO health tips and the drawn pictures as before.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { idbGet, idbSet } from '../idb.js';
import { keepsData } from '../webpolicy.js';
import { drugClassOf } from '../drugclass.js';
import { aiIdleCards, aiIdleImage } from '../cloud.js';

const CARDS_KEY = 'rxpos-idle-ai';
const today = () => new Date().toISOString().slice(0, 10);
const read = () => { try { return JSON.parse(localStorage.getItem(CARDS_KEY)) || null; } catch { return null; } };
const write = (v) => { try { localStorage.setItem(CARDS_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };
const memoryImages = new Map(); // the web version keeps nothing on the computer: pictures only for this visit

/** The picture subject of a health tip (worker/ai-routes.js IDLE_SUBJECTS 'tip:…') */
export function tipTopic(text) {
  const t = String(text).toLowerCase();
  for (const [re, topic] of [[/mosquito|malaria|net\b/, 'net'], [/wash|hands|soap|hygiene|toilet/, 'hands'], [/water|ors|diarrh|drink|hydrat/, 'water'],
    [/blood pressure|heart|salt|stroke|smok|alcohol/, 'heart'], [/fruit|vegetable|eat|food|sugar|diet/, 'food'], [/active|walk|exercise|minutes|weight/, 'walk'],
    [/sleep|rest|mental|stress/, 'sleep'], [/vaccin|immunis|hiv|test|condom|screen/, 'shield'], [/child|baby|breast|pregnan|mother/, 'baby']]) if (re.test(t)) return topic;
  return 'medicine';
}
/** The picture subject of a medicine: its therapeutic area */
export const productSubject = (p) => drugClassOf(p).area || 'Other';

/**
 * The AI cards for today: { cards: Map(id → { headline, line, why }), order: [ids], tips: [{ text, topic }], picture(subject, tone) }.
 * candidates: the medicines the screen may show (customer-safe only), with their kind and note.
 */
export function useIdleAi(candidates, { active }) {
  const { syncCfg, features } = useStore();
  const on = features.ai !== false && !!syncCfg?.url && !!syncCfg?.key;
  const [day, setDay] = useState(() => read());
  const [pics, setPics] = useState({});
  const asked = useRef(new Set());

  // the day's cards: asked once a day, a little after the app opens (never while someone is working on a sale)
  useEffect(() => {
    if (!on || !candidates.length || day?.day === today()) return;
    const t = setTimeout(async () => {
      if (!navigator.onLine) return;
      try {
        const r = await aiIdleCards(syncCfg, { month: new Date().getMonth() + 1, candidates: candidates.slice(0, 40).map((c) => ({ id: c.p.id, name: c.p.name, generic: c.p.generic || '', form: c.p.form || '', area: productSubject(c.p), kind: c.kind, note: c.note })) });
        const v = { day: today(), cards: r.cards || [], tips: r.tips || [] };
        write(v); setDay(v);
      } catch { const v = { day: today(), cards: [], tips: [] }; write(v); setDay(v); } // not again today
    }, 15000);
    return () => clearTimeout(t);
  }, [on, candidates, day, syncCfg]);

  // a picture is fetched the first time a card needs it, one at a time, then kept on this device
  const picture = (subject, tone) => {
    const key = `idle-img:${subject}:${tone}`;
    if (pics[key] !== undefined) return pics[key];
    if (memoryImages.has(key)) return memoryImages.get(key);
    if (!asked.current.has(key) && active) {
      asked.current.add(key);
      (async () => {
        let img = keepsData() ? await idbGet(key).catch(() => null) : null;
        if (!img && on && navigator.onLine) img = (await aiIdleImage(syncCfg, subject, tone).catch(() => null))?.image || null;
        if (img) { memoryImages.set(key, img); if (keepsData()) idbSet(key, img).catch(() => {}); }
        setPics((x) => ({ ...x, [key]: img || '' }));
      })();
    }
    return '';
  };

  return useMemo(() => ({
    cards: new Map((day?.cards || []).map((c) => [c.id, c])),
    order: (day?.cards || []).map((c) => c.id),
    tips: day?.tips || [],
    picture,
  // picture reads the latest pictures through pics
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [day, pics, on, active]);
}
