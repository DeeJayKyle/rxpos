// Dashboard charts (1.7). Plain SVG, no chart library. Daily sales since 1.15.0: bars of money with the number of
// sales as a line over them (the owner's reference). One colour per meaning (src/vivid.js): money in teal, purchases
// orange, expenses red, gross profit violet. The value axis always starts at 0, days carry real dates, and today is
// drawn as "so far" (a dashed end), so an unfinished day never looks like a collapse.
import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { localDate, downloadFile, toCSV } from './store.jsx';
import { compact } from './ui.jsx';
import { dateLocale } from './showdate.js';

const dayKey = (offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return localDate(d); };
/** A round axis maximum (0, 1, 2, 2.5, 5 × 10ⁿ above the largest value) */
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
};
const dateLabel = (k, opt = { day: 'numeric', month: 'short' }) => new Date(k + 'T12:00').toLocaleDateString(dateLocale(), opt);

/**
 * Daily sales for the last 7, 30 or 90 days. byDay: { 'YYYY-MM-DD': { total } }. onDay(key) opens that day's sales.
 */
export function DailyTrend({ byDay, fmt, onDay, extra, days }) {
  // [days] set by the dashboard's period (1.16.0): no picker of its own then
  const [own, setRange] = useState(30);
  const range = days || own;
  const svg = useRef(null);
  const [hover, setHover] = useState(null);
  const keys = Array.from({ length: range }, (_, i) => dayKey(range - 1 - i));
  const vals = keys.map((k) => byDay[k]?.total || 0);
  // the number of sales each day: a line over the bars, on its own axis at the right (the owner's reference, 1.15.0)
  const counts = keys.map((k) => byDay[k]?.n || 0);
  const done = vals.slice(0, -1); // every day but today
  const total = vals.reduce((a, v) => a + v, 0);
  const avg = done.length ? done.reduce((a, v) => a + v, 0) / done.length : 0;
  const best = done.reduce((b, v, i) => (v > done[b] ? i : b), 0);
  const W = 640, H = 240, L = 46, R = 34, T = 22, B = 28;
  const max = niceMax(Math.max(...vals)), maxN = niceMax(Math.max(...counts));
  const slot = (W - L - R) / range;
  const x = (i) => L + (i + 0.5) * slot;
  const y = (v) => H - B - (v / max) * (H - T - B);
  const yn = (v) => H - B - (v / maxN) * (H - T - B);
  const bw = Math.max(2, slot * (range <= 7 ? 0.5 : 0.62));
  const n = range - 1;
  const every = range <= 7 ? 1 : range <= 30 ? 5 : range <= 90 ? 15 : Math.ceil(range / 7);
  const line = counts.slice(0, -1).map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yn(v).toFixed(1)}`).join(' ');
  // a count's badge on the line: each day with sales over a week or a month, none over 90 days
  const badge = (i) => range <= 30 && counts[i] > 0;
  const h = hover ?? null;
  return (
    <div className="trend">
      <div className="card-head">
        <h3>Daily sales · last {range} days</h3>
        <div className="chart-tools">
          {extra}
          {!days && <div className="seg" role="radiogroup" aria-label="Chart period">
            {[7, 30, 90].map((d) => <button key={d} role="radio" aria-checked={range === d} className={range === d ? 'on' : ''} onClick={() => { setRange(d); setHover(null); }}>{d} days</button>)}
          </div>}
          <ChartExport svg={svg} name={`daily-sales-${range}-days`} rows={() => keys.map((k, i) => ({ date: k, sales: vals[i], receipts: counts[i] }))} />
        </div>
      </div>
      <div className="trend-facts">
        <span>Total <b>{fmt(total)}</b></span>
        <span>Daily average <b>{fmt(Math.round(avg))}</b></span>
        {done[best] > 0 && <span>Best day <b>{dateLabel(keys[best], { weekday: 'short', day: 'numeric', month: 'short' })} · {fmt(done[best])}</b></span>}
      </div>
      <div className="trend-legend"><span><i className="trend-key bar" />Sales (left)</span><span><i className="trend-key count" />Number of sales (right)</span></div>
      <div className="chart-wrap">
      <svg ref={svg} key={range} className="trend-svg combo" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily sales and number of sales, last ${range} days, total ${fmt(total)}`} onMouseLeave={() => setHover(null)}>
        {keys.map((k, i) => new Date(k + 'T12:00').getDay() === 0 && <rect key={k} className="trend-sun" x={x(i) - slot / 2} y={T} width={slot} height={H - T - B} />)}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line className="trend-grid" x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} /><text className="trend-axis" x={L - 6} y={y(max * f) + 3} textAnchor="end">{compact(max * f)}</text>{Number.isInteger(maxN * f) && <text className="trend-axis count" x={W - R + 6} y={y(max * f) + 3} textAnchor="start">{maxN * f}</text>}</g>)}
        {keys.map((k, i) => (i % every === 0 || i === n) && <text key={k} className="trend-axis" x={x(i)} y={H - 8} textAnchor={i === n ? 'end' : i === 0 ? 'start' : 'middle'}>{i === n ? 'Today' : dateLabel(k)}</text>)}
        {vals.map((v, i) => v > 0 && <rect key={keys[i]} className={'trend-bar' + (i === n ? ' today' : '') + (i === best && done[best] > 0 ? ' best' : '') + (i === h ? ' on' : '')} x={x(i) - bw / 2} y={y(v)} width={bw} height={y(0) - y(v)} rx={Math.min(4, bw / 2)} />)}
        {avg > 0 && <><line className="trend-avg" x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} /><text className="trend-avg-label" x={L + 4} y={y(avg) - 5} textAnchor="start">average</text></>}
        {n > 0 && <path className="trend-count" d={line} pathLength="1" />}
        {n > 0 && <line className="trend-count today" x1={x(n - 1)} y1={yn(counts[n - 1])} x2={x(n)} y2={yn(counts[n])} />}
        {counts.map((v, i) => <circle key={keys[i]} className="trend-count-dot" cx={x(i)} cy={yn(v)} r={range <= 30 ? 3.2 : 2} />)}
        {counts.map((v, i) => badge(i) && <g key={keys[i]} className="trend-badge" transform={`translate(${x(i)},${yn(v) - 12})`}><rect x={-11} y={-8} width={22} height={15} rx={4} /><text y={3} textAnchor="middle">{v}</text></g>)}
        {h != null && <line className="trend-cross" x1={x(h)} x2={x(h)} y1={T} y2={H - B} />}
        {keys.map((k, i) => (
          <rect key={k} className="trend-hit" x={x(i) - slot / 2} y={T} width={slot} height={H - T - B}
            onMouseEnter={() => setHover(i)} onClick={() => onDay?.(k)}>
            <title>{`${dateLabel(k, { weekday: 'short', day: 'numeric', month: 'short' })}${i === n ? ' (so far)' : ''}: ${fmt(vals[i])} · ${counts[i]} sale${counts[i] === 1 ? '' : 's'}`}</title>
          </rect>
        ))}
      </svg>
      {h != null && <ChartTip x={x(h) / W} y={y(vals[h]) / H} title={dateLabel(keys[h], { weekday: 'short', day: 'numeric', month: 'short' }) + (h === n ? ' (so far)' : '')} rows={[['Sales', fmt(vals[h]), 'in'], ['Number of sales', String(counts[h]), 'count'], ...(avg > 0 ? [['vs average', `${vals[h] >= avg ? '+' : '−'}${Math.abs(Math.round(((vals[h] - avg) / avg) * 100))}%`]] : [])]} />}
      </div>
      <div className="trend-tip muted small" aria-live="polite">
        {h != null ? <><b>{dateLabel(keys[h], { weekday: 'long', day: 'numeric', month: 'long' })}{h === n ? ' (so far)' : ''}</b> · {fmt(vals[h])} · {counts[h]} sale{counts[h] === 1 ? '' : 's'} · click to open that day&apos;s sales</> : 'Point at a day to see it; click to open its sales. Shaded columns are Sundays.'}
      </div>
    </div>
  );
}

/**
 * Month by month: several series as lines over the last 6 or 12 months. series: [{ name, cls, values: {YYYY-MM: n} }]
 */
export function MonthLines({ series, fmt, extra, months: fixed }) {
  const [own, setMonths] = useState(6);
  const months = fixed || own;
  const [hover, setHover] = useState(null);
  const svg = useRef(null);
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
        <div className="chart-tools">
          {extra}
          {!fixed && <div className="seg" role="radiogroup" aria-label="Chart period">
            {[6, 12].map((m) => <button key={m} role="radio" aria-checked={months === m} className={months === m ? 'on' : ''} onClick={() => { setMonths(m); setHover(null); }}>{m} months</button>)}
          </div>}
          <ChartExport svg={svg} name={`money-in-out-${months}-months`} rows={() => keys.map((k) => ({ month: k, ...Object.fromEntries(series.map((s) => [s.name, s.values[k] || 0])) }))} />
        </div>
      </div>
      <div className="trend-legend">{series.map((s) => <span key={s.name}><i className={'trend-key ' + s.cls} />{s.name}</span>)}</div>
      <div className="chart-wrap">
      <svg ref={svg} key={months} className="trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={'Month by month: ' + series.map((s) => s.name).join(', ')} onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = lo + (max - lo) * f; return <g key={f}><line className="trend-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="trend-axis" x={L - 6} y={y(v) + 3} textAnchor="end">{compact(v)}</text></g>; })}
        {keys.map((k, i) => <text key={k} className="trend-axis" x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === months - 1 ? 'end' : 'middle'}>{dateLabel(k + '-01', { month: 'short' })}{months > 6 && i % 3 ? '' : ' ' + k.slice(2, 4)}</text>)}
        {series.map((s) => (
          <g key={s.name} className={'trend-series ' + s.cls}>
            <path d={keys.map((k, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.values[k] || 0).toFixed(1)}`).join(' ')} pathLength="1" />
            {keys.map((k, i) => <circle key={k} cx={x(i)} cy={y(s.values[k] || 0)} r="3.2"><title>{`${s.name}, ${dateLabel(k + '-01', { month: 'long', year: 'numeric' })}: ${fmt(s.values[k] || 0)}`}</title></circle>)}
          </g>
        ))}
        {hover != null && <line className="trend-cross" x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} />}
        {keys.map((k, i) => <rect key={k} className="trend-hit" x={x(i) - (W - L - R) / Math.max(1, months - 1) / 2} y={T} width={(W - L - R) / Math.max(1, months - 1)} height={H - T - B} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
      </svg>
      {hover != null && <ChartTip x={x(hover) / W} y={Math.min(...series.map((s) => y(s.values[keys[hover]] || 0))) / H} title={dateLabel(keys[hover] + '-01', { month: 'long', year: 'numeric' })}
        rows={series.map((s) => [s.name, fmt(s.values[keys[hover]] || 0), s.cls])} />}
      </div>
    </div>
  );
}

/** A tooltip over a chart, at a point given as fractions of the chart's width and height (it pops in) */
export function ChartTip({ x, y, title, rows }) {
  const left = x > 0.62;
  return (
    <div className={'chart-tip' + (left ? ' left' : '')} style={{ left: `${x * 100}%`, top: `${Math.max(4, y * 100)}%` }} role="status">
      <b>{title}</b>
      {rows.map(([k, v, cls]) => <span key={k}>{cls && <i className={'trend-key ' + cls} />}{k}<b className="num">{v}</b></span>)}
    </div>
  );
}

/** Export a chart: its figures as CSV, or the picture as PNG (the SVG drawn with the colours on screen) */
export function ChartExport({ svg, name, rows }) {
  const [open, setOpen] = useState(false);
  const csv = () => { downloadFile(name + '.csv', toCSV(rows()), 'text/csv'); setOpen(false); };
  const png = () => {
    setOpen(false);
    const src = svg.current;
    if (!src) return;
    const box = src.viewBox.baseVal, scale = 2;
    const copy = src.cloneNode(true);
    const all = [src, ...src.querySelectorAll('*')], out = [copy, ...copy.querySelectorAll('*')];
    all.forEach((el, i) => {
      const cs = getComputedStyle(el);
      for (const k of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-family', 'font-weight']) out[i].style.setProperty(k, cs.getPropertyValue(k));
      out[i].style.setProperty('animation', 'none');
      if (el.tagName === 'path') out[i].style.setProperty('stroke-dashoffset', '0');
    });
    copy.setAttribute('width', box.width); copy.setAttribute('height', box.height);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = box.width * scale; c.height = box.height * scale;
      const g = c.getContext('2d');
      g.fillStyle = getComputedStyle(src.closest('.card') || document.body).backgroundColor || '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => b && downloadFile(name + '.png', b));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
  };
  return (
    <div className="chart-export">
      <button type="button" className="icon-btn sm" aria-haspopup="menu" aria-expanded={open} title="Export the chart" onClick={() => setOpen((o) => !o)}><Download size={15} /><span className="sr-only">Export</span></button>
      {open && (
        <div className="chart-export-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          <button type="button" role="menuitem" onClick={csv}>Figures (CSV)</button>
          <button type="button" role="menuitem" onClick={png}>Picture (PNG)</button>
        </div>
      )}
    </div>
  );
}
