// G1 (1.13): the supplier's invoice beside the Add Stock form on a wide screen (≥ 1280 px): its pages on the left,
// one at a time, so each line is checked against the paper. When a line read from the invoice carries where it was
// on the page (`box`: page and x, y, w, h as fractions), the line being edited is outlined on the picture.
import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

export default function InvoiceView({ pages, active }) {
  const [page, setPage] = useState(0);
  const n = pages.length;
  const box = active?.box;
  const shown = box && Number.isInteger(box.page) && box.page >= 0 && box.page < n ? box.page : Math.min(page, n - 1);
  return (
    <aside className="invoice-view card" aria-label="The supplier's invoice">
      <div className="row between gap">
        <strong>Invoice{n > 1 ? ` · page ${shown + 1} of ${n}` : ''}</strong>
        <span className="row gap">
          {n > 1 && <button type="button" className="icon-btn sm" aria-label="Previous page" disabled={shown === 0} onClick={() => setPage(shown - 1)}><ChevronLeft size={16} /></button>}
          {n > 1 && <button type="button" className="icon-btn sm" aria-label="Next page" disabled={shown === n - 1} onClick={() => setPage(shown + 1)}><ChevronRight size={16} /></button>}
          <a className="icon-btn sm" href={pages[shown]} target="_blank" rel="noreferrer" aria-label="Open the page full size" title="Open full size"><ExternalLink size={15} /></a>
        </span>
      </div>
      <div className="invoice-page">
        <img src={pages[shown]} alt={`Invoice page ${shown + 1}`} />
        {box && box.page === shown && [box.x, box.y, box.w, box.h].every((v) => typeof v === 'number' && v >= 0 && v <= 1) && (
          <i className="invoice-mark" aria-hidden="true" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />
        )}
      </div>
    </aside>
  );
}
