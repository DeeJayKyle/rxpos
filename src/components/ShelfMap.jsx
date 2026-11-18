// The shelf map (UI batch 3, F2): the pharmacy's shelves as a simple grid worked out from their codes (A3 is row A,
// column 3; "B-12", "c 4" too); codes that are not letter + number (Fridge, Counter) sit in a row of their own. Tap a
// shelf for its medicines. The Flutter app has the same in shelves_screen.dart (shelfGrid).

/** codes → { rows: [[letter, [{ code, col } | null …]]], other: [code], cols } */
export function shelfGrid(codes) {
  const at = new Map(), other = [];
  let cols = 0;
  for (const code of codes) {
    const m = /^\s*([A-Za-z]{1,2})\s*[-\s.]?\s*(\d{1,2})\s*$/.exec(code);
    if (!m) { other.push(code); continue; }
    const r = m[1].toUpperCase(), c = Number(m[2]);
    if (!at.has(r)) at.set(r, new Map());
    at.get(r).set(c, code);
    cols = Math.max(cols, c);
  }
  const rows = [...at.keys()].sort().map((r) => [r, Array.from({ length: cols }, (_, i) => (at.get(r).has(i + 1) ? { code: at.get(r).get(i + 1), col: i + 1 } : null))]);
  return { rows, other: other.sort((a, b) => a.localeCompare(b)), cols };
}

export default function ShelfMap({ counts, value, onPick }) {
  const { rows, other } = shelfGrid([...counts.keys()]);
  if (!rows.length && !other.length) return <p className="muted small">No shelves yet. Put medicines on shelves (A1, A2, B1…) and the map draws itself.</p>;
  const cell = (code) => (
    <button key={code} type="button" className={'shelf-cell' + (value === code ? ' on' : '')} aria-pressed={value === code} onClick={() => onPick(value === code ? '' : code)} title={`Shelf ${code}: ${counts.get(code)} medicine${counts.get(code) === 1 ? '' : 's'}`}>
      <strong>{code}</strong><small>{counts.get(code)}</small>
    </button>
  );
  return (
    <div className="card shelf-map" aria-label="Shelf map">
      {rows.map(([r, cells]) => (
        <div key={r} className="shelf-row" style={{ '--cols': cells.length }}>
          <span className="shelf-row-name" aria-hidden="true">{r}</span>
          {cells.map((c, i) => (c ? cell(c.code) : <span key={i} className="shelf-cell gap" aria-hidden="true" />))}
        </div>
      ))}
      {other.length > 0 && <div className="shelf-row other"><span className="shelf-row-name" aria-hidden="true">·</span>{other.map(cell)}</div>}
    </div>
  );
}
