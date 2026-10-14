// Weather for the pharmacy's town from Open-Meteo (free, no key, open data). Cached for 15 minutes.
import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';

export const DEFAULT_PLACE = { name: 'Kampala, Uganda', lat: 0.3476, lon: 32.5825 };
const CACHE = 'rxpos-weather';

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

export async function fetchWeather(place = DEFAULT_PLACE, { force = false } = {}) {
  const key = `${place.lat},${place.lon}`;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (!force && c?.key === key && Date.now() - c.at < 15 * 60000) return c.data;
  } catch {}
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: place.lat, longitude: place.lon, timezone: 'auto', forecast_days: '2',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,relative_humidity_2m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
  }).toString();
  const r = await fetch(u);
  if (!r.ok) throw new Error('Weather service unavailable');
  const data = await r.json();
  try { localStorage.setItem(CACHE, JSON.stringify({ key, at: Date.now(), data })); } catch {}
  return data;
}

/** Last weather we fetched (for offline display) */
export function cachedWeather() {
  try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; }
}

export async function searchPlaces(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`);
  const j = await r.json();
  return (j.results || []).map((x) => ({ name: [x.name, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude }));
}

/** Storage limits used for warnings (can be changed in Settings → Alerts & storage) */
export const storageLimits = (s = {}) => ({
  roomMax: Number(s.roomMax) || 25, roomMin: Number(s.roomMin) || 15,
  fridgeMin: Number(s.fridgeMin) || 2, fridgeMax: Number(s.fridgeMax) || 8,
  humidityMax: Number(s.humidityMax) || 65,
});

/** Advice for medicine storage from the outside weather */
export function storageAdvice(cur, limits) {
  if (!cur) return [];
  const out = [];
  if (cur.temperature_2m >= limits.roomMax + 3) out.push(['danger', `Very hot outside (${Math.round(cur.temperature_2m)}°C): keep the shop cool, close blinds, check the room thermometer.`]);
  else if (cur.temperature_2m >= limits.roomMax) out.push(['warn', `Warm outside (${Math.round(cur.temperature_2m)}°C): keep heat-sensitive medicines below ${limits.roomMax}°C.`]);
  if (cur.relative_humidity_2m >= limits.humidityMax) out.push(['warn', `Humid (${cur.relative_humidity_2m}%): keep containers closed; protect tablets, powders and test strips from moisture.`]);
  return out;
}
