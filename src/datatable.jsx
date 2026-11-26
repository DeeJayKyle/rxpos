// The shared table (the owner's request, 2026-11-26: every list and table works the way Add Stock's lines do). A page
// describes its columns; the table gives every one of them the same things:
//   · columns moved by dragging a heading (or its ← → arrows), resized by dragging its right edge, shown or hidden
//     from the Columns button, all kept on this device per table (tablekit.jsx: useColumns, ColTh)
//   · click a heading to sort by it (kept too)
//   · the first 100 rows, then more as the list scrolls, always with "Showing 100 of 2,340": no silent limits
//   · CSV of the rows and columns as they are shown
// <DataTable id="reorder" columns={[{ id, label, render(row), sortBy(row), csv(row), num, fixed, className }]} rows={…} />
import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { useColumns, ColTh, useLoadMore } from './tablekit.jsx';
import { useSort, Empty, moneyCell, PdfButton } from './ui.jsx';
import { useStore, downloadFile, toCSV } from './store.jsx';

const textOf = (v) => (v == null || typeof v === 'boolean' ? '' : typeof v === 'string' || typeof v === 'number' ? v : '');

/**
 * id: the table's name for its saved layout · columns: [{ id, label, render(row, i), sortBy(row) (or key), key,
 * csv(row), num, fixed, className, tdClass(row) }] (the first column is fixed unless another is) · rows · rowKey(row)
 * (default row.id) · sort: [column id, 1 | -1] to start with (null: as given) · empty: what an empty list says ·
 * rowProps(row, i): more props for a row · foot: a <tfoot> row (cols) => node · csv: file name, or false ·
 * pdf: { title, subtitle } adds a PDF of every row · column noExport: left out of the CSV and PDF ·
 * tools: false hides the Columns / CSV buttons, or a node shown beside them · step: rows per "more" · className
 */
export function DataTable({ pdf, id, columns, rows, rowKey = (r) => r.id, sort: initial = null, empty = 'Nothing here yet.', rowProps, foot, csv = id, tools, step = 100, className = '', wrapClass = 'card table-wrap', resetKey = '', caption }) {
  const { db } = useStore();
  const cur = db.settings?.currency || '';
  const defs = useMemo(() => { const anyFixed = columns.some((c) => c.fixed); return columns.map((c, i) => ({ id: c.id, label: c.label, fixed: anyFixed ? !!c.fixed : i === 0 })); }, [columns]);
  const colsK = useColumns('t:' + id, defs);
  const byId = useMemo(() => Object.fromEntries(columns.map((c) => [c.id, c])), [columns]);
  const keys = useMemo(() => Object.fromEntries(columns.map((c) => [c.id, c.sortBy || (c.key ? (r) => r[c.key] : null)]).filter(([, f]) => f)), [columns]);
  const sorted = useSort(rows, keys, initial?.[0] ?? null, initial?.[1] ?? 1, 't:' + id);
  const page = useLoadMore(sorted.rows, { step, resetKey: [resetKey, sorted.by, sorted.dir, rows.length].join('|') });
  const shown = colsK.shown.map((x) => byId[x]).filter(Boolean);
  // what a cell says in a CSV or PDF: its csv(row), else its key, else its sort value, else plain text it renders
  const plain = (c, r) => (c.csv ? c.csv(r) : c.key ? r[c.key] : c.sortBy ? textOf(c.sortBy(r)) : textOf(c.render?.(r)));
  const out = shown.filter((c) => !c.noExport);
  const exportCsv = () => downloadFile(`${csv}.csv`, toCSV(sorted.rows.map((r) => Object.fromEntries(out.map((c) => [c.label, plain(c, r)])))), 'text/csv');
  // the PDF has every row (not only those drawn yet), in the order and columns shown
  const pdfData = () => [{ head: out.map((c) => c.label), body: sorted.rows.map((r) => out.map((c) => String(plain(c, r) ?? ''))), numeric: out.map((c, i) => (c.num ? i : -1)).filter((i) => i >= 0) }];
  const cell = (c, r, i) => {
    const v = c.render ? c.render(r, i) : r[c.key];
    return <td key={c.id} data-label={c.label} className={[c.num ? 'num' : '', c.className || '', c.tdClass?.(r) || ''].filter(Boolean).join(' ') || undefined}>{c.num ? moneyCell(v, cur) : v}</td>;
  };
  return (
    <>
      {tools !== false && (
        <div className="dt-tools no-print" data-for={id}>
          {caption && <span className="dt-caption muted small">{caption}</span>}
          {tools}
          {colsK.button}
          {pdf && <PdfButton title={pdf.title} subtitle={pdf.subtitle} file={pdf.file} data={pdfData} />}
          {csv !== false && <button type="button" className="btn ghost" title="Export these rows as a CSV file" onClick={exportCsv}><Download size={16} />CSV</button>}
        </div>
      )}
      <div className={wrapClass || undefined} data-table={id}>
        <table className={className}>
          <thead><tr>{shown.map((c) => <ColTh key={c.id} cols={colsK} id={c.id} sort={sorted} k={keys[c.id] ? c.id : undefined} className={[c.num ? 'num' : '', c.className || ''].filter(Boolean).join(' ')}>{c.label}</ColTh>)}</tr></thead>
          <tbody>
            {page.rows.map((r, i) => { const k = rowKey(r, i); const extra = rowProps?.(r, i) || {}; return <tr key={k} {...extra}>{shown.map((c) => cell(c, r, i))}</tr>; })}
            {!rows.length && <Empty colSpan={Math.max(1, shown.length)}>{empty}</Empty>}
          </tbody>
          {foot && rows.length > 0 && <tfoot><tr className="total-row">{shown.map((c, i) => <td key={c.id} className={c.num ? 'num' : ''}>{foot(c.id, sorted.rows, i)}</td>)}</tr></tfoot>}
        </table>
        {page.footer}
      </div>
    </>
  );
}
