// This device → Receipt printer: print receipts straight to a thermal printer (ESC/POS) and open the cash drawer,
// or keep the print dialog. A setting of this till only (src/printer.js).
import { useEffect, useState } from 'react';
import { Printer, RefreshCw, Archive } from 'lucide-react';
import { useStore, audit } from '../store.jsx';
import { toast } from '../feedback.jsx';
import { onDevice } from '../device.js';
import { printerModes, printerSettings, setPrinter, listPrinters, testPrint, openDrawer } from '../printer.js';
import { isAndroid, isElectron } from '../platform.js';

const HELP = {
  dialog: isElectron || isAndroid
    ? 'Receipts open the print dialog, as before. Choose a direct printer to skip the dialog and open the cash drawer.'
    : 'A browser can only print through the print dialog. The Windows and Android apps print straight to the receipt printer and open the cash drawer.',
  windows: 'Any printer Windows knows: a USB receipt printer, or a Bluetooth one paired in Windows settings (it shows up as a printer once its driver is set, or "Generic / Text Only" on its COM port).',
  network: 'A receipt printer on the network or Wi-Fi. Print its self-test page (hold FEED while switching it on) to see its IP address. The port is almost always 9100.',
  bluetooth: 'Pair the printer first in Android settings → Bluetooth (the PIN is often 0000 or 1234), then pick it here.',
  usb: 'Plug the printer into the phone or tablet with an OTG cable. Android asks once to let RxPOS use it.',
};

export default function PrinterCard() {
  const { db, update, user, branchId } = useStore();
  const [p, setP] = useState(printerSettings);
  useEffect(() => onDevice(() => setP(printerSettings())), []);
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState('');
  const modes = printerModes();
  const pick = p.mode === 'windows' || p.mode === 'bluetooth' || p.mode === 'usb';
  const find = async (mode = p.mode) => {
    setBusy('find');
    try { setFound(await listPrinters(mode)); } catch (e) { setFound([]); toast(e.message || 'Could not list the printers', 'error'); }
    setBusy('');
  };
  useEffect(() => { setFound(null); if (p.mode === 'windows' || p.mode === 'bluetooth' || p.mode === 'usb') find(p.mode); }, [p.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (what, fn, done) => {
    setBusy(what);
    try { await fn(); toast(done, 'success'); } catch (e) { toast(`${e.message || 'The printer did not answer'}`, 'error'); }
    setBusy('');
  };
  const field = { windows: 'name', bluetooth: 'address', usb: 'usb' }[p.mode];
  const current = field ? p[field] : '';
  const list = found || [];
  return (
    <section className="card printer-card">
      <h3><Printer size={18} />Receipt printer</h3>
      <p className="muted small">{HELP[p.mode]}</p>
      <label className="field"><span>How this {isAndroid ? 'phone or tablet' : 'computer'} prints receipts</span>
        <select value={p.mode} onChange={(e) => setPrinter({ mode: e.target.value })}>
          {modes.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select></label>
      {pick && (
        <div className="row gap wrap printer-pick">
          <label className="field grow"><span>Printer</span>
            <select value={current} onChange={(e) => setPrinter({ [field]: e.target.value })}>
              <option value="">{found === null ? 'Looking…' : list.length ? 'Choose the printer' : p.mode === 'bluetooth' ? 'No paired Bluetooth devices' : 'No printers found'}</option>
              {current && !list.some((x) => x.id === current) && <option value={current}>{current}</option>}
              {[...list].sort((a, b) => (b.likely ? 1 : 0) - (a.likely ? 1 : 0)).map((x) => <option key={x.id} value={x.id}>{x.name}{x.isDefault ? ' (default)' : ''}</option>)}
            </select></label>
          <button type="button" className="btn ghost" disabled={busy === 'find'} onClick={() => find()}><RefreshCw size={16} />Look again</button>
        </div>
      )}
      {p.mode === 'network' && (
        <div className="row gap wrap">
          <label className="field grow"><span>IP address</span><input inputMode="decimal" placeholder="192.168.1.100" value={p.host} onChange={(e) => setPrinter({ host: e.target.value.trim() })} /></label>
          <label className="field" style={{ maxWidth: 110 }}><span>Port</span><input inputMode="numeric" value={p.port} onChange={(e) => setPrinter({ port: Number(e.target.value.replace(/\D/g, '')) || '' })} /></label>
        </div>
      )}
      {p.mode !== 'dialog' && <>
        <label className="field"><span>Paper</span>
          <select value={p.paper || 0} onChange={(e) => setPrinter({ paper: Number(e.target.value) })}>
            <option value={0}>As in Settings ({Number(db.settings.paperWidth) === 210 ? 'A4: uses the print dialog' : `${db.settings.paperWidth || 80} mm`})</option>
            <option value={80}>80 mm (48 characters a line)</option>
            <option value={58}>58 mm (32 characters a line)</option>
          </select></label>
        <label className="field check"><input type="checkbox" checked={!!p.kick} onChange={(e) => setPrinter({ kick: e.target.checked })} /><span>Open the cash drawer on a cash sale (the drawer plugs into the printer)</span></label>
        {p.kick && <label className="field"><span>Drawer connector</span>
          <select value={p.kickPin} onChange={(e) => setPrinter({ kickPin: Number(e.target.value) })}>
            <option value={2}>Pin 2 (most drawers)</option>
            <option value={5}>Pin 5 (try this if the drawer stays shut)</option>
          </select></label>}
        <label className="field check"><input type="checkbox" checked={p.cut !== false} onChange={(e) => setPrinter({ cut: e.target.checked })} /><span>Cut the paper after each receipt</span></label>
        <div className="row gap wrap mt-3">
          <button type="button" className="btn primary" disabled={!!busy} onClick={() => run('test', () => testPrint({ settings: db.settings }), 'Test page sent to the printer')}><Printer size={16} />{busy === 'test' ? 'Printing…' : 'Test print'}</button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => run('drawer', async () => { await openDrawer({ always: true }); await update((d) => audit(d, user, 'Cash drawer opened', 'From This device (no sale)', branchId)); }, 'Cash drawer opened')}><Archive size={16} />Open the drawer</button>
        </div>
        <p className="muted small mt-3">If a receipt can&apos;t reach the printer, the print dialog opens instead, so no receipt is lost.</p>
      </>}
    </section>
  );
}
