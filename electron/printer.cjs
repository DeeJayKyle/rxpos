// Direct receipt printing for the Windows app (src/printer.js): ESC/POS bytes sent raw to a printer, no print dialog.
//   windows: a printer Windows knows (USB, or Bluetooth paired as a COM port), through the spooler in RAW mode
//   network: a network thermal printer on its raw port (9100), over TCP
// The page only hands over bytes and the printer's name or address; nothing it sends is run as a command.
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const MAX = 512 * 1024; // a receipt is a few KB

// RAW printing through winspool.drv. The printer's name and the file come in environment variables, never in the script.
const RAW_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class RxposRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int written);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Printer not found: " + printer);
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "RxPOS receipt"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) throw new Exception("The printer would not start the receipt");
      StartPagePrinter(h);
      int written;
      bool ok = WritePrinter(h, data, data.Length, out written);
      EndPagePrinter(h); EndDocPrinter(h);
      if (!ok || written != data.Length) throw new Exception("The printer did not take the whole receipt");
    } finally { ClosePrinter(h); }
  }
}
"@
[RxposRaw]::Send($env:RXPOS_PRINTER, [IO.File]::ReadAllBytes($env:RXPOS_FILE))
`;

function sendWindows(name, bytes) {
  return new Promise((resolve, reject) => {
    const file = path.join(os.tmpdir(), `rxpos-receipt-${process.pid}-${Date.now()}.bin`);
    fs.writeFileSync(file, bytes);
    const done = (err) => { fs.rm(file, { force: true }, () => {}); err ? reject(err) : resolve(); };
    const env = { ...process.env, RXPOS_PRINTER: name, RXPOS_FILE: file };
    if (process.platform === 'win32') {
      const encoded = Buffer.from(RAW_PS, 'utf16le').toString('base64');
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { env, windowsHide: true, timeout: 20000 }, (e, _out, errText) => {
        done(e ? new Error((String(errText).match(/Exception[^:]*: "?([^"\r\n]+)/) || [])[1] || 'The printer did not answer') : null);
      });
    } else {
      // macOS / Linux (development): CUPS in raw mode
      execFile('lp', ['-d', name, '-o', 'raw', file], { env, timeout: 20000 }, (e) => done(e ? new Error('The printer did not answer') : null));
    }
  });
}

function sendNetwork(host, port, bytes) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port: Number(port) || 9100 });
    let settled = false;
    const end = (err) => { if (settled) return; settled = true; sock.destroy(); err ? reject(err) : resolve(); };
    sock.setTimeout(6000, () => end(new Error(`No answer from the printer at ${host}`)));
    sock.on('error', (e) => end(new Error(e.code === 'ECONNREFUSED' ? `The printer at ${host} refused the connection: check the port` : `Can't reach the printer at ${host}`)));
    sock.on('connect', () => sock.end(bytes, () => setTimeout(() => end(), 200)));
  });
}

const validHost = (h) => typeof h === 'string' && /^[A-Za-z0-9.-]{1,253}$/.test(h);

/** The ipcMain handlers: rxpos:printers lists Windows printers, rxpos:print-raw prints */
function register(ipcMain, getWin) {
  ipcMain.handle('rxpos:printers', async () => {
    const list = (await getWin()?.webContents.getPrintersAsync().catch(() => [])) || [];
    return list.map((p) => ({ id: p.name, name: p.displayName || p.name, isDefault: !!p.isDefault }));
  });
  ipcMain.handle('rxpos:print-raw', async (_e, job) => {
    try {
      const bytes = Buffer.from(String(job?.data || ''), 'base64');
      if (!bytes.length || bytes.length > MAX) throw new Error('Nothing to print');
      if (job.mode === 'network') {
        if (!validHost(job.host)) throw new Error('The printer\'s address is not valid');
        await sendNetwork(job.host, job.port, bytes);
      } else if (job.mode === 'windows') {
        if (typeof job.name !== 'string' || !job.name || job.name.length > 256) throw new Error('Choose a printer');
        await sendWindows(job.name, bytes);
      } else throw new Error('This app prints to a Windows or network printer');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { register, sendNetwork };
