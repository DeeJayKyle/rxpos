// Dashboard charts (1.7). Plain SVG, no chart library. One colour per meaning (src/vivid.js): money in teal, purchases
// orange, expenses red, gross profit violet. The value axis always starts at 0, days carry real dates, and today is
// drawn as "so far" (a dashed end), so an unfinished day never looks like a collapse.
import { useState } from 'react';
import { localDate } from './store.jsx';
import { compact } from './ui.jsx';

const dayKey = (offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return localDate(d); };
/** A round axis maximum (0, 1, 2, 2.5, 5 × 10ⁿ above the largest value) */
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
};
const dateLabel = (k, opt = { day: 'numeric', month: 'short' }) => new Date(k + 'T12:00').toLocaleDateString(undefined, opt);

/**
 * Daily sales for the last 7, 30 or 90 days. byDay: { 'YYYY-MM-DD': { total } }. onDay(key) opens that day's sales.
 */
export function DailyTrend({ byDay, fmt, onDay }) {
  const [range, setRange] = useState(30);
  const [hover, setHover] = useState(null);
  const keys = Array.from({ length: range }, (_, i) => dayKey(range - 1 - i));
  const vals = keys.map((k) => byDay[k]?.total || 0);
  const done = vals.slice(0, -1); // every day but today
  const total = vals.reduce((a, v) => a + v, 0);
  const avg = done.length ? done.reduce((a, v) => a + v, 0) / done.length : 0;
  const best = done.reduce((b, v, i) => (v > done[b] ? i : b), 0);
  const W = 640, H = 230, L = 46, R = 14, T = 14, B = 28;
  const max = niceMax(Math.max(...vals));
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, range - 1);
  const y = (v) => H - B - (v / max) * (H - T - B);
  const line = done.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const n = range - 1;
  const every = range <= 7 ? 1 : range <= 30 ? 5 : 15;
  const h = hover ?? null;
  return (
    <div className="trend">
      <div className="card-head">
        <h3>Daily sales · last {range} days</h3>
        <div className="seg" role="radiogroup" aria-label="Chart period">
          {[7, 30, 90].map((d) => <button key={d} role="radio" aria-checked={range === d} className={range === d ? 'on' : ''} onClick={() => { setRange(d); setHover(null); }}>{d} days</button>)}
        </div>
      </div>
      <div className="trend-facts">
        <span>Total <b>{fmt(total)}</b></span>
        <span>Daily average <b>{fmt(Math.round(avg))}</b></span>
        {done[best] > 0 && <span>Best day <b>{dateLabel(keys[best], { weekday: 'short', day: 'numeric', month: 'short' })} · {fmt(done[best])}</b></span>}
      </div>
      <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily sales, last ${range} days, total ${fmt(total)}`} onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--m-in)" stopOpacity=".28" /><stop offset="1" stopColor="var(--m-in)" stopOpacity="0" /></linearGradient></defs>
        {keys.map((k, i) => new Date(k + 'T12:00').getDay() === 0 && <rect key={k} className="trend-sun" x={x(i) - (W - L - R) / n / 2} y={T} width={(W - L - R) / n} height={H - T - B} />)}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line className="trend-grid" x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} /><text className="trend-axis" x={L - 6} y={y(max * f) + 3} textAnchor="end">{compact(max * f)}</text></g>)}
        {keys.map((k, i) => (i % every === 0 || i === n) && <text key={k} className="trend-axis" x={x(i)} y={H - 8} textAnchor={i === n ? 'end' : i === 0 ? 'start' : 'middle'}>{i === n ? 'Today' : dateLabel(k)}</text>)}
        {done.length > 1 && <path d={`${line} L${x(done.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#trendFill)" />}
        {done.length > 1 && <path className="trend-line" d={line} />}
        <line className="trend-today" x1={x(n - 1)} y1={y(vals[n - 1])} x2={x(n)} y2={y(vals[n])} />
        <circle className="trend-today-dot" cx={x(n)} cy={y(vals[n])} r="4" />
        {avg > 0 && <><line className="trend-avg" x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} /><text className="trend-avg-label" x={W - R} y={y(avg) - 5} textAnchor="end">average</text></>}
        {done[best] > 0 && <circle className="trend-best" cx={x(best)} cy={y(done[best])} r="4.5" />}
        {h != null && <><line className="trend-cross" x1={x(h)} x2={x(h)} y1={T} y2={H - B} /><circle className="trend-hover" cx={x(h)} cy={y(vals[h])} r="4.5" /></>}
        {keys.map((k, i) => (
          <rect key={k} className="trend-hit" x={x(i) - (W - L - R) / n / 2} y={T} width={(W - L - R) / n} height={H - T - B}
            onMouseEnter={() => setHover(i)} onClick={() => onDay?.(k)}>
            <title>{`${dateLabel(k, { weekday: 'short', day: 'numeric', month: 'short' })}${i === n ? ' (so far)' : ''}: ${fmt(vals[i])}`}</title>
          </rect>
        ))}
      </svg>
      <div className="trend-tip muted small" aria-live="polite">
        {h != null ? <><b>{dateLabel(keys[h], { weekday: 'long', day: 'numeric', month: 'long' })}{h === n ? ' (so far)' : ''}</b> · {fmt(vals[h])} · click to open that day&apos;s sales</> : 'Point at a day to see it; click to open its sales. Shaded columns are Sundays.'}
      </div>
    </div>
  );
}

/**
 * Month by month: several series as lines over the last 6 or 12 months. series: [{ name, cls, values: {YYYY-MM: n} }]
 */
export function MonthLines({ series, fmt }) {
  const [months, setMonths] = useState(6);
  const keys = Array.from({ length: months }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (months - 1) + i); return localDate(d).slice(0, 7); });
  const W = 640, H = 230, L = 46, R = 14, T = 14, B = 28;
  const all = series.flatMap((s) => keys.map((k) => s.values[k] || 0));
  const lo = Math.min(0, ...all), max = niceMax(Math.max(...all));
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, months - 1);
  const y = (v) => H - B - ((v - lo) / (max - lo)) * (H - T - B);
  return (
    <div className="trend">
      <div className="card-head">
        <h3>Money in &amp; out, month by month</h3>
        <div className="seg" role="radiogroup" aria-label="Chart period">
          {[6, 12].map((m) => <button key={m} role="radio" aria-checked={months === m} className={months === m ? 'on' : ''} onClick={() => setMonths(m)}>{m} months</button>)}
        </div>
      </div>
      <div className="trend-legend">{series.map((s) => <span key={s.name}><i className={'trend-key ' + s.cls} />{s.name}</span>)}</div>
      <svg className="trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={'Month by month: ' + series.map((s) => s.name).join(', ')}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = lo + (max - lo) * f; return <g key={f}><line className="trend-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="trend-axis" x={L - 6} y={y(v) + 3} textAnchor="end">{compact(v)}</text></g>; })}
        {keys.map((k, i) => <text key={k} className="trend-axis" x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === months - 1 ? 'end' : 'middle'}>{dateLabel(k + '-01', { month: 'short' })}{months > 6 && i % 3 ? '' : ' ' + k.slice(2, 4)}</text>)}
        {series.map((s) => (
          <g key={s.name} className={'trend-series ' + s.cls}>
            <path d={keys.map((k, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.values[k] || 0).toFixed(1)}`).join(' ')} />
            {keys.map((k, i) => <circle key={k} cx={x(i)} cy={y(s.values[k] || 0)} r="3.2"><title>{`${s.name}, ${dateLabel(k + '-01', { month: 'long', year: 'numeric' })}: ${fmt(s.values[k] || 0)}`}</title></circle>)}
          </g>
        ))}
      </svg>
    </div>
  );
}
