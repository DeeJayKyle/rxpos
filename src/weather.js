// Weather for where the device is, from Open-Meteo (free, no key, open data). Location: the device's GPS when
// allowed, else the internet connection's approximate location (RxPOS cloud), else the town set in Settings.
import { useEffect, useState } from 'react';
import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';
import { DEFAULT_CLOUD } from './cloud.js';
import { isNative } from './platform.js';

export const DEFAULT_PLACE = { name: 'Kampala, Uganda', lat: 0.3476, lon: 32.5825 };
const CACHE = 'rxpos-weather';
const PLACE = 'rxpos-place';

/** WMO weather code → label and icon */
export function describe(code) {
  if (code === 0) return ['Clear sky', Sun];
  if (code <= 2) return ['Partly cloudy', CloudSun];
  if (code === 3) return ['Overcast', Cloud];
  if (code <= 48) return ['Fog', CloudFog];
  if (code <= 57) return ['Drizzle', CloudDrizzle];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['Rain', CloudRain];
  if (code <= 77 || code === 85 || code === 86) return ['Snow', CloudSnow];
  return ['Thunderstorm', CloudLightning];
}

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/** Where is this device? GPS (if allowed) → connection location → fallback. Cached for 30 minutes. */
export async function devicePlace(fallback = DEFAULT_PLACE) {
  const c = read(PLACE);
  if (c && Date.now() - c.at < 30 * 60000) return c.place;
  const gps = await new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) }), () => resolve(null), { timeout: 8000, maximumAge: 30 * 60000, enableHighAccuracy: false });
  });
  let net = null;
  try {
    const base = isNative || !/^https?:$/.test(location.protocol) || import.meta.env.DEV ? DEFAULT_CLOUD : location.origin;
    const r = await fetch(base + '/api/geo', { signal: AbortSignal.timeout(6000) });
    if (r.ok) net = await r.json();
  } catch {}
  const place = gps
    ? { lat: gps.lat, lon: gps.lon, name: net?.city ? `Near ${net.city}` : 'Your location', source: 'gps' }
    : net?.lat ? { lat: +net.lat.toFixed(3), lon: +net.lon.toFixed(3), name: [net.city, net.country].filter(Boolean).join(', ') || 'Your area', source: 'network' }
      : { ...fallback, source: 'settings' };
  write(PLACE, { at: Date.now(), place });
  return place;
}

export async function fetchWeather(place, { force = false } = {}) {
  const key = `${place.lat},${place.lon}`;
  const c = read(CACHE);
  if (!force && c?.key === key && Date.now() - c.at < 15 * 60000) return c.data;
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: place.lat, longitude: place.lon, timezone: 'auto', forecast_days: '2', past_days: '1',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation',
    hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,weather_code',
  }).toString();
  const r = await fetch(u);
  if (!r.ok) throw new Error('Weather service unavailable');
  const data = await r.json();
  write(CACHE, { key, at: Date.now(), data, place });
  return data;
}
/** Last weather fetched (offline display) */
export const cachedWeather = () => read(CACHE);

export async function searchPlaces(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`);
  const j = await r.json();
  return (j.results || []).map((x) => ({ name: [x.name, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude }));
}

// One shared weather feed for the whole app (dashboard card, storage page, alerts, the 6-hourly log)
let state = { place: cachedWeather()?.place || null, data: cachedWeather()?.data || null, error: '' };
const subs = new Set();
let timer = null, running = null;
const emit = () => subs.forEach((f) => f(state));
export async function refreshWeather(settings = {}, force = false) {
  if (running) return running;
  running = (async () => {
    try {
      const place = settings.weatherMode === 'fixed' && settings.weatherPlace ? { ...settings.weatherPlace, source: 'settings' } : await devicePlace(settings.weatherPlace || DEFAULT_PLACE);
      const data = await fetchWeather(place, { force });
      state = { place, data, error: '' };
    } catch (e) { state = { ...state, error: navigator.onLine ? e.message : 'Offline: showing the last reading' }; }
    emit();
    running = null;
  })();
  return running;
}
export function useWeather(settings) {
  const [s, set] = useState(state);
  useEffect(() => {
    subs.add(set);
    if (!timer) { refreshWeather(settings); timer = setInterval(() => refreshWeather(settings), 15 * 60000); }
    return () => { subs.delete(set); if (!subs.size) { clearInterval(timer); timer = null; } };
  }, [settings?.weatherMode, settings?.weatherPlace?.lat]); // eslint-disable-line react-hooks/exhaustive-deps
  return [s, () => refreshWeather(settings, true)];
}

/** Outside temperature & humidity at 00:00, 06:00, 12:00 and 18:00 (yesterday and today, up to now) */
export function sixHourReadings(data) {
  const h = data?.hourly;
  if (!h?.time) return [];
  const nowLocal = data.current?.time || '';
  const out = [];
  h.time.forEach((t, i) => {
    const hh = Number(t.slice(11, 13));
    if (t.slice(14, 16) === '00' && hh % 6 === 0 && t <= nowLocal && h.temperature_2m[i] != null) out.push({ time: t, temp: h.temperature_2m[i], humidity: h.relative_humidity_2m[i] });
  });
  return out;
}

/** Storage limits used for warnings (Settings → Alerts & storage) */
export const storageLimits = (s = {}) => ({
  roomMax: Number(s.roomMax) || 25, roomMin: Number(s.roomMin) || 15,
  fridgeMin: Number(s.fridgeMin) || 2, fridgeMax: Number(s.fridgeMax) || 8,
  humidityMax: Number(s.humidityMax) || 65, hotAlert: Number(s.hotAlert) || 30,
});

/** Advice for medicine storage from the outside weather */
export function storageAdvice(cur, limits) {
  if (!cur) return [];
  const out = [];
  if (cur.temperature_2m >= limits.hotAlert) out.push(['danger', `Hot (${Math.round(cur.temperature_2m)}°C): keep the shop cool, close blinds, check the room thermometer.`]);
  else if (cur.temperature_2m >= limits.roomMax) out.push(['warn', `Warm outside (${Math.round(cur.temperature_2m)}°C): keep heat-sensitive medicines below ${limits.roomMax}°C.`]);
  if (cur.relative_humidity_2m >= limits.humidityMax) out.push(['warn', `Humid (${cur.relative_humidity_2m}%): keep containers closed; protect tablets, powders and test strips from moisture.`]);
  return out;
}
