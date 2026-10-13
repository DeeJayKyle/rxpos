import { useState } from 'react';
import { FileSpreadsheet, Library, Upload, CheckCircle2, Download } from 'lucide-react';
import { useStore, put, move, addBatch, audit, uid, downloadFile, toCSV } from '../store.jsx';
import { Tabs, Empty } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { newInternalBarcode } from '../barcode.jsx';

// Columns PharmaPOS understands, with the header names people commonly use for them
const TARGETS = [
  ['name', 'Medicine / trade name', /^(name|item|product|medicine|drug|trade ?name|brand|description|item ?name)/i, true],
  ['generic', 'Generic name', /generic|inn|active/i],
  ['form', 'Formulation', /form|dosage|type/i],
  ['category', 'Category', /categ|class|group/i],
  ['strength', 'Strength', /strength|dose|mg/i],
  ['barcode', 'Barcode / code', /bar ?code|sku|code|ean/i],
  ['unit', 'Unit', /^unit|uom|pack/i],
  ['cost', 'Cost price', /cost|buying|purchase ?price|bp/i],
  ['price', 'Retail price', /retail|selling|sale ?price|^price|sp\b|mrp/i],
  ['wholesale', 'Wholesale price', /wholesale|trade ?price|ws/i],
  ['reorder', 'Reorder level', /reorder|min/i],
  ['stock', 'Opening stock (qty)', /stock|qty|quantity|balance|on ?hand/i],
  ['batch', 'Batch number', /batch|lot/i],
  ['expiry', 'Expiry date', /exp/i],
];

/** Tiny CSV parser that handles quotes, commas and new lines inside quotes. */
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const sep = (text.split('\n')[0].match(/;/g)?.length || 0) > (text.split('\n')[0].match(/,/g)?.length || 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}

const toNumber = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
function toDate(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // dd/mm/yyyy
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{2,4})$/); // mm/yyyy → last day of month
  if (m) { const y = m[2].length === 2 ? '20' + m[2] : m[2]; return new Date(Date.UTC(+y, +m[1], 0)).toISOString().slice(0, 10); }
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

export default function Import() {
  const { db, update, user, branchId, fmt } = useStore();
  const [tab, setTab] = useState('catalog');
  const [sheet, setSheet] = useState(null); // { headers, rows, fileName }
  const [map, setMap] = useState({});
  const [mode, setMode] = useState('update');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  // ---------- standard catalog ----------
  const importCatalog = async () => {
    setBusy(true);
    try {
      const { default: cat } = await import('../data/catalog.json');
      const have = new Set(db.products.map((p) => p.name.trim().toLowerCase()));
      const fresh = cat.rows.filter((r) => !have.has(r[0].toLowerCase()));
      if (!(await ask({ title: `Add ${fresh.length.toLocaleString()} medicines?`, message: `${(cat.rows.length - fresh.length).toLocaleString()} are already in your list and will be skipped. Prices come from a typical Ugandan price list. Review them in Quick Edit. No stock is added.`, confirmText: 'Add medicines' }))) return;
      const forms = new Set(db.formulations.map((f) => f.name));
      const used = new Set(db.products.map((p) => p.barcode).filter(Boolean));
      update((d) => {
        for (const f of cat.forms) if (!forms.has(f)) put(d, 'formulations', { id: 'form-' + f.toLowerCase().replace(/\W+/g, '-'), name: f });
        for (const [name, generic, form, price, wholesale, cost, barcode, unit] of fresh) {
          const code = barcode && !used.has(barcode) ? barcode : newInternalBarcode(used);
          used.add(code);
          d.products.push({ id: uid(), name, generic, form, price, wholesale: wholesale || price, cost: cost || Math.round((wholesale || price) * 0.8), barcode: code, unit, reorder: 0, updatedAt: new Date().toISOString(), fromCatalog: true });
        }
        audit(d, user, 'Catalog imported', `${fresh.length} medicines added from the standard catalog`, branchId);
      });
      setResult({ added: fresh.length, updated: 0, skipped: cat.rows.length - fresh.length });
      toast(`${fresh.length.toLocaleString()} medicines added`);
    } finally {
      setBusy(false);
    }
  };

  // ---------- Excel / CSV ----------
  const onFile = async (file) => {
    setResult(null);
    let rows;
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        const res = await readXlsxFile(file);
        rows = Array.isArray(res?.[0]?.data) ? res[0].data : res;
      } else if (/\.(csv|txt)$/i.test(file.name)) rows = parseCSV(await file.text());
      else return toast('Use an Excel (.xlsx) or CSV file. Old .xls files: open in Excel and “Save As” .xlsx first.', 'warn');
    } catch (e) {
      return toast('Could not read that file: ' + e.message, 'error');
    }
    // the header row is the first row with at least 2 text cells
    const h = rows.findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim()).length >= 2);
    const headers = rows[h].map((c, i) => String(c ?? `Column ${i + 1}`).trim());
    const data = rows.slice(h + 1).filter((r) => r.some((c) => c !== null && String(c).trim()));
    const auto = {};
    for (const [key, , re] of TARGETS) {
      const i = headers.findIndex((hd, idx) => re.test(hd) && !Object.values(auto).includes(idx));
      if (i >= 0) auto[key] = i;
    }
    setMap(auto);
    setSheet({ headers, rows: data, fileName: file.name });
  };

  const record = (r) => Object.fromEntries(TARGETS.map(([k]) => [k, map[k] != null ? r[map[k]] : undefined]));

  const runImport = async () => {
    if (map.name == null) return toast('Choose which column holds the medicine name', 'warn');
    const recs = sheet.rows.map(record).filter((r) => String(r.name ?? '').trim());
    if (!(await ask({ title: `Import ${recs.length.toLocaleString()} rows?`, message: mode === 'update' ? 'Existing medicines (same barcode or name) will be updated; new ones added.' : 'Existing medicines are skipped; only new ones are added.', confirmText: 'Import' }))) return;
    const s = db.settings;
    let added = 0, updated = 0, skipped = 0, stocked = 0;
    update((d) => {
      const byCode = new Map(d.products.filter((p) => p.barcode).map((p) => [String(p.barcode), p]));
      const byName = new Map(d.products.map((p) => [p.name.trim().toLowerCase(), p]));
      const used = new Set(byCode.keys());
      const forms = new Set(d.formulations.map((f) => f.name.toLowerCase()));
      for (const r of recs) {
        const name = String(r.name).trim();
        const code = r.barcode != null && String(r.barcode).trim() ? String(r.barcode).trim() : '';
        const existing = (code && byCode.get(code)) || byName.get(name.toLowerCase());
        if (existing && mode === 'skip') { skipped++; continue; }
        const cost = r.cost != null ? toNumber(r.cost) : existing?.cost || 0;
        const price = r.price != null && toNumber(r.price) ? toNumber(r.price) : existing?.price || Math.round(cost * (1 + s.retailMarkup / 100));
        const form = r.form ? String(r.form).trim() : existing?.form || 'Others';
        if (form && !forms.has(form.toLowerCase())) { put(d, 'formulations', { id: 'form-' + form.toLowerCase().replace(/\W+/g, '-'), name: form }); forms.add(form.toLowerCase()); }
        const p = put(d, 'products', {
          ...(existing || { id: uid(), reorder: 0 }), name, form, cost, price,
          generic: r.generic != null ? String(r.generic).trim() : existing?.generic || '',
          category: r.category != null ? String(r.category).trim() : existing?.category || '',
          strength: r.strength != null ? String(r.strength).trim() : existing?.strength || '',
          unit: r.unit != null ? String(r.unit).trim() : existing?.unit || 'Piece',
          wholesale: r.wholesale != null && toNumber(r.wholesale) ? toNumber(r.wholesale) : existing?.wholesale || Math.round(cost * (1 + s.wholesaleMarkup / 100)),
          reorder: r.reorder != null ? toNumber(r.reorder) : existing?.reorder || 0,
          barcode: code || existing?.barcode || newInternalBarcode(used),
        });
        used.add(p.barcode); byCode.set(p.barcode, p); byName.set(name.toLowerCase(), p);
        existing ? updated++ : added++;
        const qty = toNumber(r.stock);
        if (qty > 0) {
          const b = addBatch(d, { productId: p.id, batch: r.batch ? String(r.batch).trim() : 'IMPORT', expiry: toDate(r.expiry), cost });
          move(d, { productId: p.id, qty, type: 'Opening stock (import)', ref: sheet.fileName, user: user.name, batchId: b.id, branchId });
          stocked++;
        }
      }
      audit(d, user, 'Medicines imported', `${sheet.fileName}: ${added} added, ${updated} updated, ${skipped} skipped, ${stocked} with stock`, branchId);
    });
    setResult({ added, updated, skipped, stocked });
    setSheet(null);
    toast('Import finished');
  };

  const template = () => downloadFile('pharmapos-import-template.csv', toCSV([{ Name: 'Paracetamol 500mg', Generic: 'Paracetamol', Formulation: 'Tablets', Category: 'Analgesic', Barcode: '', Unit: 'Tablet', Cost: 30, 'Retail price': 100, 'Wholesale price': 50, 'Reorder level': 200, Stock: 1000, Batch: 'PCM2401', Expiry: '2027-06-30' }]), 'text/csv');

  return (
    <div className="page">
      <div className="page-head"><div><h1>Import medicines</h1><div className="sub">Fill your medicine list in minutes</div></div></div>
      <Tabs tabs={[['catalog', 'Standard catalog'], ['file', 'Excel / CSV file']]} value={tab} onChange={(t) => { setTab(t); setResult(null); }} />
      {result && <div className="notice"><CheckCircle2 size={16} /> {result.added.toLocaleString()} added · {result.updated.toLocaleString()} updated · {result.skipped.toLocaleString()} skipped{result.stocked ? ` · ${result.stocked} with opening stock` : ''}</div>}

      {tab === 'catalog' && (
        <div className="card hero-card">
          <Library size={40} />
          <div className="grow">
            <h3>9,710 medicines & sundries, ready to sell</h3>
            <p className="muted">Trade and generic names, formulations, retail and wholesale prices from a typical Ugandan pharmacy price list. Medicines already in your list are skipped. Stock is added later with Add Stock or the Excel import.</p>
          </div>
          <button className="btn primary big" disabled={busy} onClick={importCatalog}>{busy ? 'Loading…' : 'Add standard catalog'}</button>
        </div>
      )}

      {tab === 'file' && !sheet && (
        <label className="card dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && onFile(e.dataTransfer.files[0]); }}>
          <FileSpreadsheet size={44} />
          <strong>Drop your Excel (.xlsx) or CSV file here, or click to choose</strong>
          <span className="muted">Any column order works. You’ll match the columns next.</span>
          <input type="file" hidden accept=".xlsx,.csv,.txt" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
          <button type="button" className="btn sm ghost" onClick={(e) => { e.preventDefault(); template(); }}><Download size={14} />Download a template</button>
        </label>
      )}

      {tab === 'file' && sheet && (
        <>
          <div className="card">
            <div className="row between"><h3><FileSpreadsheet size={18} />{sheet.fileName} · {sheet.rows.length.toLocaleString()} rows</h3><button className="btn sm ghost" onClick={() => setSheet(null)}>Choose another file</button></div>
            <div className="form-grid">
              {TARGETS.map(([key, label, , required]) => (
                <label key={key} className="field"><span>{label}{required && <b className="text-danger"> *</b>}</span>
                  <select value={map[key] ?? ''} onChange={(e) => setMap({ ...map, [key]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">— not in file —</option>
                    {sheet.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select></label>
              ))}
            </div>
            <div className="row gap">
              <label className="field check"><input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} /><span>Update medicines that already exist</span></label>
              <label className="field check"><input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} /><span>Skip existing, only add new</span></label>
            </div>
          </div>
          <div className="card table-wrap">
            <h3 className="pad">Preview (first 8 rows)</h3>
            <table>
              <thead><tr>{TARGETS.filter(([k]) => map[k] != null).map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
              <tbody>
                {sheet.rows.slice(0, 8).map((r, i) => {
                  const rec = record(r);
                  return <tr key={i}>{TARGETS.filter(([k]) => map[k] != null).map(([k]) => <td key={k}>{k === 'expiry' ? toDate(rec[k]) : ['cost', 'price', 'wholesale'].includes(k) ? fmt(toNumber(rec[k])) : String(rec[k] ?? '')}</td>)}</tr>;
                })}
                {!sheet.rows.length && <Empty colSpan={5}>The file has no data rows</Empty>}
              </tbody>
            </table>
          </div>
          <div className="form-actions"><button className="btn primary big" onClick={runImport}><Upload size={18} />Import {sheet.rows.length.toLocaleString()} rows</button></div>
        </>
      )}
    </div>
  );
}
