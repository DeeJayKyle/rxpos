// Medicines sorted and grouped by name, pharmacological class, therapeutic area, dosage form or shelf (step 26, copied
// from the Flutter app's core/presentation/medicine_groups.dart): the choice is remembered on this device, the group
// headings fold away. Used by Inventory, Stock Count and Shelves.
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MEDICINE_ORDERS, groupMedicines } from './drugclass.js';
import { deviceSettings, setDevice, onDevice } from './device.js';

/** The order chosen on this device ('name' until one is chosen), and a setter */
export function useMedicineOrder() {
  const [order, setOrder] = useState(() => deviceSettings().medicineOrder || 'name');
  useEffect(() => onDevice((d) => setOrder(d.medicineOrder || 'name')), []);
  return [order, (o) => setDevice({ medicineOrder: o })];
}

/** "Sort by: …" */
export function MedicineOrderPicker({ value, onChange, exclude = [] }) {
  return (
    <label className="field inline"><span>Sort by</span>
      <select aria-label="Sort and group the medicines" value={value} onChange={(e) => onChange(e.target.value)}>
        {MEDICINE_ORDERS.filter(([k]) => !exclude.includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

/**
 * The rows to show: [{ heading, count, folded, members }] and [{ p }]; no headings for 'name'; a folded group's
 * medicines are left out.
 */
export function groupedRows(list, order, folded) {
  if (order === 'name') return list.map((p) => ({ p }));
  return groupMedicines(list, order).flatMap(([g, ps]) => [{ heading: g, count: ps.length, folded: folded.has(g), members: ps }, ...(folded.has(g) ? [] : ps.map((p) => ({ p })))]);
}

/** The folded groups of one list, and a toggle */
export function useFolded() {
  const [folded, setFolded] = useState(() => new Set());
  return [folded, (g) => setFolded((f) => { const n = new Set(f); n.has(g) ? n.delete(g) : n.add(g); return n; })];
}

/** A group heading row in a table: tap to fold */
export function GroupHeadingRow({ row, colSpan, onToggle, children }) {
  return (
    <tr className="group-head">
      <td colSpan={colSpan}>
        <div className="row between gap">
          <button type="button" className="link-btn group-toggle" aria-expanded={!row.folded} onClick={onToggle}>
            <ChevronDown size={14} style={{ transform: row.folded ? 'rotate(-90deg)' : '', transition: 'transform .15s' }} /><strong>{row.heading}</strong> <span className="muted">({row.count})</span>
          </button>
          {children}
        </div>
      </td>
    </tr>
  );
}
