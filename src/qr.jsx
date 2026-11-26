// QR code as an inline SVG (qrcode-generator, MIT): two-step sign-in, URA EFRIS fiscal receipts
import qrcode from 'qrcode-generator';

export function Qr({ text, label = 'QR code', level = 'M', className = 'qr' }) {
  const q = qrcode(0, level);
  q.addData(String(text || '')); q.make();
  const n = q.getModuleCount(), cells = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) cells.push(`M${c + 4},${r + 4}h1v1h-1z`);
  return <svg className={className} viewBox={`0 0 ${n + 8} ${n + 8}`} role="img" aria-label={label}><rect width="100%" height="100%" fill="#fff" /><path d={cells.join('')} fill="#000" /></svg>;
}
