import { useEffect, useMemo, useState } from 'react';
import { Thermometer, Droplets, Wind, RefreshCw, Plus, MapPin, Snowflake, Warehouse, Sun as SunIcon, AlertTriangle, Trash2 } from 'lucide-react';
import { useStore, uid, put, del, audit, now, today } from '../store.jsx';
import { Modal, Empty, Stat } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { useWeather, describe, storageLimits, storageAdvice } from '../weather.js';

const PLACES = [['Room', Warehouse], ['Fridge', Snowflake], ['Store', Warehouse], ['Outside', SunIcon]];

/** Weather card used on the dashboard and on this page */
export function WeatherCard({ compact }) {
  const { db } = useStore();
  const [{ place, data: w, error: err }, refresh] = useWeather(db.settings);
  const load = () => refresh();
  const limits = storageLimits(db.settings);
  const cur = w?.current;
  const [label, Icon] = cur ? describe(cur.weather_code) : ['—', SunIcon];
  const advice = storageAdvice(cur, limits);
  return (
    <div className={'card weather' + (compact ? ' compact' : '')}>
      <div className="row between">
        <h3><MapPin size={16} />{place?.name || 'Finding your location…'}{place?.source === 'gps' && <small className="muted"> · GPS</small>}</h3>
        {!compact && <button className="icon-btn" title="Refresh" onClick={load}><RefreshCw size={16} /></button>}
      </div>
      {cur ? (
        <>
          <div className="weather-now">
            <Icon size={compact ? 40 : 54} strokeWidth={1.5} />
            <div><div className="weather-temp">{Math.round(cur.temperature_2m)}°C</div><div className="muted small">{label} · feels {Math.round(cur.apparent_temperature)}°C</div></div>
          </div>
          <div className="weather-meta">
            <span><Droplets size={14} />{cur.relative_humidity_2m}% humidity</span>
            <span><Wind size={14} />{Math.round(cur.wind_speed_10m)} km/h</span>
            {w.daily && <span><Thermometer size={14} />{Math.round(w.daily.temperature_2m_min[0])}° / {Math.round(w.daily.temperature_2m_max[0])}°</span>}
            {w.daily?.precipitation_probability_max && <span>☔ {w.daily.precipitation_probability_max[0]}% rain</span>}
          </div>
          {advice.map(([tone, text], i) => <div key={i} className={'advice ' + tone}><AlertTriangle size={14} />{text}</div>)}
        </>
      ) : <p className="muted small">{err || 'Loading weather…'}</p>}
      {err && cur && <p className="muted small">{err}</p>}
    </div>
  );
}

function Sparkline({ points, min, max, lo, hi }) {
  if (points.length < 2) return <div className="muted small">Record at least two readings to see the trend.</div>;
  const W = 600, H = 120, pad = 6;
  const span = Math.max(max - min, 1);
  const x = (i) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / span) * (H - pad * 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.temp).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Temperature trend">
      {lo != null && hi != null && <rect x="0" width={W} y={y(hi)} height={Math.max(y(lo) - y(hi), 0)} className="spark-band" />}
      <path d={path} className="spark-line" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.temp)} r="3.5" className={p.bad ? 'spark-bad' : 'spark-dot'}><title>{`${new Date(p.at).toLocaleString()} · ${p.temp}°C`}</title></circle>)}
    </svg>
  );
}

export default function Storage() {
  const { db, update, user, branchId } = useStore();
  const limits = storageLimits(db.settings);
  const [place, setPlace] = useState('Fridge');
  const [adding, setAdding] = useState(null);
  const inRange = (r) => r.place === 'Outside' || ((r.place === 'Fridge' ? r.temp >= limits.fridgeMin && r.temp <= limits.fridgeMax : r.temp <= limits.roomMax && r.temp >= limits.roomMin - 5)
    && (r.humidity == null || r.humidity === '' || r.humidity <= limits.humidityMax));
  const logs = useMemo(() => db.tempLogs.filter((r) => (r.branchId || 'main') === branchId).sort((a, b) => String(a.at).localeCompare(String(b.at))), [db.tempLogs, branchId]);
  const series = logs.filter((r) => r.place === place).slice(-30).map((r) => ({ ...r, bad: !inRange(r) }));
  const todays = logs.filter((r) => String(r.at).slice(0, 10) === today());
  const last = (p) => [...logs].reverse().find((r) => r.place === p);
  const bad = logs.filter((r) => !inRange(r)).length;

  const save = (e) => {
    e.preventDefault();
    const rec = { id: uid(), at: now(), place: adding.place, temp: Number(adding.temp), humidity: adding.humidity === '' ? null : Number(adding.humidity), note: adding.note, by: user.name, branchId };
    update((d) => { put(d, 'tempLogs', rec); if (!inRange(rec)) audit(d, user, 'Storage temperature out of range', `${rec.place} ${rec.temp}°C`, branchId); });
    toast(inRange(rec) ? 'Reading saved' : `Out of range! ${rec.place} should be ${rec.place === 'Fridge' ? `${limits.fridgeMin}–${limits.fridgeMax}` : `below ${limits.roomMax}`}°C`, inRange(rec) ? 'success' : 'error');
    setAdding(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Weather & Storage</h1><div className="sub">Outside weather and your fridge / room temperature log (cold chain)</div></div>
        <button className="btn primary" onClick={() => setAdding({ place, temp: '', humidity: '', note: '' })}><Plus size={16} />Record reading</button>
      </div>
      <div className="grid2">
        <WeatherCard />
        <div className="stats tight">
          {PLACES.map(([p, Icon]) => { const r = last(p); return <Stat key={p} label={`${p} · last reading`} value={r ? `${r.temp}°C` : '—'} sub={r ? `${new Date(r.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}${r.humidity != null ? ` · ${r.humidity}% RH` : ''}` : 'no readings yet'} tone={r && !inRange(r) ? 'red' : 'teal'} icon={Icon} />; })}
          <Stat label="Readings today" value={todays.length} sub={bad ? `${bad} out of range in total` : 'all within range'} tone={bad ? 'amber' : 'violet'} icon={Thermometer} />
        </div>
      </div>
      <div className="card">
        <div className="row between"><h3>Trend</h3>
          <div className="tabs">{PLACES.map(([p]) => <button key={p} className={'tab' + (p === place ? ' active' : '')} onClick={() => setPlace(p)}>{p}</button>)}</div></div>
        <Sparkline points={series} min={Math.min(...series.map((r) => r.temp), place === 'Fridge' ? limits.fridgeMin - 2 : limits.roomMin - 3)} max={Math.max(...series.map((r) => r.temp), place === 'Fridge' ? limits.fridgeMax + 2 : limits.roomMax + 3)}
          lo={place === 'Fridge' ? limits.fridgeMin : limits.roomMin} hi={place === 'Fridge' ? limits.fridgeMax : limits.roomMax} />
        <p className="muted small">Safe range shaded: fridge {limits.fridgeMin}–{limits.fridgeMax}°C, room {limits.roomMin}–{limits.roomMax}°C, humidity up to {limits.humidityMax}%. Change these in Settings → Alerts & storage. Outside temperature and humidity are logged automatically every 6 hours (00:00, 06:00, 12:00, 18:00); RxPOS reminds you to record the room and fridge at 06:00, 12:00 and 18:00.</p>
      </div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>When</th><th>Where</th><th className="num">Temp</th><th className="num">Humidity</th><th>By</th><th>Note</th><th /></tr></thead>
          <tbody>
            {[...logs].reverse().slice(0, 200).map((r) => (
              <tr key={r.id} className={inRange(r) ? '' : 'row-bad'}>
                <td>{new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{r.place}</td>
                <td className="num">{r.temp}°C</td><td className="num">{r.humidity != null ? r.humidity + '%' : '—'}</td><td>{r.by}</td><td>{r.note}</td>
                <td className="actions"><button className="icon-btn" title="Delete" onClick={async () => (await ask({ title: 'Delete this reading?', danger: true, confirmText: 'Delete' })) && update((d) => del(d, 'tempLogs', r.id))}><Trash2 size={15} /></button></td>
              </tr>
            ))}
            {!logs.length && <Empty colSpan={7}>No readings yet. Record the fridge and room temperature twice a day.</Empty>}
          </tbody>
        </table>
      </div>
      {adding && (
        <Modal title="Record a temperature reading" onClose={() => setAdding(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <label className="field"><span>Where</span><select value={adding.place} onChange={(e) => setAdding({ ...adding, place: e.target.value })}>{PLACES.map(([p]) => <option key={p}>{p}</option>)}</select></label>
              <label className="field"><span>Temperature (°C)</span><input type="number" step="0.1" required autoFocus value={adding.temp} onChange={(e) => setAdding({ ...adding, temp: e.target.value })} /></label>
              <label className="field"><span>Humidity (%) – optional</span><input type="number" step="1" min="0" max="100" value={adding.humidity} onChange={(e) => setAdding({ ...adding, humidity: e.target.value })} /></label>
              <label className="field"><span>Note</span><input value={adding.note} onChange={(e) => setAdding({ ...adding, note: e.target.value })} placeholder="e.g. power cut 2 h" /></label>
            </div>
            <div className="form-actions"><button type="button" className="btn ghost" onClick={() => setAdding(null)}>Cancel</button><button className="btn primary">Save reading</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}
