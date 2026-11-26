// The receipt printer on this till (This device → Receipt printer): print straight to a thermal printer in ESC/POS and
// open the cash drawer, or use the print dialog as before. Which printer is a setting of this device only.
//   Windows app: any printer Windows knows (USB, or Bluetooth paired as a COM port), sent raw; or a network printer (IP).
//   Android app: a Bluetooth printer paired in Android settings, a USB printer (OTG), or a network printer (IP).
//   Browser: the print dialog (a browser can't reach a printer directly).
// If a direct print fails, the print dialog opens instead, so a receipt is never lost.
import { deviceSettings, setDevice } from './device.js';
import { isAndroid, isElectron } from './platform.js';
import { receiptBytes, testPageBytes, drawerKick, toBase64 } from './escpos.js';

export const PRINTER_DEFAULTS = { mode: 'dialog', name: '', host: '', port: 9100, address: '', usb: '', paper: 0, kick: true, kickPin: 2, cut: true };

/** The ways this device can reach a printer, in the order shown */
export function printerModes() {
  const m = [['dialog', 'Print dialog']];
  if (isElectron) m.push(['windows', 'Windows printer (USB or Bluetooth)']);
  if (isAndroid) m.push(['bluetooth', 'Bluetooth printer'], ['usb', 'USB printer']);
  if (isElectron || isAndroid) m.push(['network', 'Network printer (IP address)']);
  return m;
}

export function printerSettings() {
  const p = { ...PRINTER_DEFAULTS, ...(deviceSettings().printer || {}) };
  if (!printerModes().some(([v]) => v === p.mode)) p.mode = 'dialog'; // e.g. settings copied from another kind of device
  return p;
}
export const setPrinter = (patch) => setDevice({ printer: { ...printerSettings(), ...patch } });
export const isDirect = () => printerSettings().mode !== 'dialog';

let androidPlugin = null;
async function android() {
  if (!androidPlugin) {
    const { registerPlugin } = await import('@capacitor/core');
    androidPlugin = registerPlugin('RxposPrinter');
  }
  return androidPlugin;
}

/** Printers this device can see for the chosen way: [{ id, name }] */
export async function listPrinters(mode) {
  if (mode === 'windows' && isElectron) return (await window.rxposShell?.printers?.()) || [];
  if ((mode === 'bluetooth' || mode === 'usb') && isAndroid) {
    const r = await (await android()).list({ kind: mode });
    return r?.printers || [];
  }
  return [];
}

/** Send ESC/POS bytes to this device's printer. Throws with a message a cashier can act on. */
export async function sendBytes(bytes, p = printerSettings()) {
  const data = toBase64(bytes);
  if (p.mode === 'network') {
    if (!p.host) throw new Error('Set the printer\'s IP address in This device → Receipt printer');
  } else if (p.mode === 'windows' && !p.name) throw new Error('Choose the printer in This device → Receipt printer');
  else if (p.mode === 'bluetooth' && !p.address) throw new Error('Choose the Bluetooth printer in This device → Receipt printer');
  const job = { mode: p.mode, name: p.name, host: p.host, port: Number(p.port) || 9100, address: p.address, usb: p.usb, data };
  if (isElectron) {
    if (!window.rxposShell?.printRaw) throw new Error('This version of the Windows app can\'t print directly yet: update it from This device');
    const r = await window.rxposShell.printRaw(job);
    if (!r?.ok) throw new Error(r?.error || 'The printer did not answer');
    return;
  }
  if (isAndroid) {
    await (await android()).print(job);
    return;
  }
  throw new Error('A browser can\'t print directly: use the print dialog');
}

const paperOf = (p, settings) => Number(p.paper) || Number(settings?.paperWidth) || 80;
const kickOf = (p, cash) => (cash && p.kick ? Number(p.kickPin) || 2 : false);

/**
 * Print a receipt. opts: settings, branchName, address, fmt, when, cash (a cash sale: open the drawer).
 * Returns 'direct' when it went straight to the printer, 'dialog' when the print dialog opened.
 */
export async function printReceipt(sale, opts = {}, { onFallback, dialog } = {}) {
  const p = printerSettings();
  const showDialog = dialog || (() => window.print());
  // an A4 page (paper 210) is a page for the dialog, not a till slip
  if (p.mode === 'dialog' || paperOf(p, opts.settings) === 210) {
    showDialog();
    if (opts.cash) await openDrawer().catch(() => {});
    return 'dialog';
  }
  try {
    await sendBytes(receiptBytes(sale, { ...opts, paper: paperOf(p, opts.settings), kick: kickOf(p, opts.cash), cut: p.cut !== false }), p);
    return 'direct';
  } catch (e) {
    onFallback?.(e);
    showDialog();
    return 'dialog';
  }
}

/** Open the cash drawer only (after a cash sale whose receipt isn't printed): when the setting is on, or always for the
 * button on This device. Quietly does nothing with the print dialog, which can't reach a drawer. */
export async function openDrawer({ always = false } = {}) {
  const p = printerSettings();
  if (p.mode === 'dialog' || (!always && !p.kick)) return false;
  await sendBytes(drawerKick(p.kickPin), p);
  return true;
}

/** The test print, from This device: proves the connection, the paper width and (if asked) the drawer */
export async function testPrint({ withDrawer = false, settings } = {}) {
  const p = printerSettings();
  const label = { windows: p.name, network: `${p.host}:${p.port || 9100}`, bluetooth: p.address, usb: p.usb || 'USB' }[p.mode] || '';
  await sendBytes(testPageBytes({ paper: paperOf(p, settings), detail: `${label} - ${new Date().toLocaleString()}`, kick: withDrawer ? Number(p.kickPin) || 2 : false }), p);
}
