// Barcode scanning with the device camera (phones, tablets, laptop webcams): no USB scanner needed.
// Uses the browser's own BarcodeDetector where it exists (Chrome on Android) and otherwise the open-source ZXing
// reader (barcode-detector, MIT), whose engine is bundled with the app so it also works offline.
import { useEffect, useRef, useState } from 'react';
import { Camera, X, Flashlight, Loader2 } from 'lucide-react';
import { Modal } from './ui.jsx';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'];
let detectorPromise = null;
async function makeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const have = await window.BarcodeDetector.getSupportedFormats();
      const formats = FORMATS.filter((f) => have.includes(f));
      if (formats.includes('ean_13') && formats.includes('code_128')) return new window.BarcodeDetector({ formats });
    } catch { /* fall back to ZXing */ }
  }
  const [{ BarcodeDetector, setZXingModuleOverrides }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'), import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  setZXingModuleOverrides({ locateFile: (p, prefix) => (p.endsWith('.wasm') ? wasmUrl : prefix + p) });
  return new BarcodeDetector({ formats: FORMATS });
}
const detector = () => (detectorPromise ??= makeDetector().catch((e) => { detectorPromise = null; throw e; }));

/** A short beep and a buzz, so the person knows the scan was taken without looking */
let audio = null;
export function scanBeep() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 1760; g.gain.setValueAtTime(0.12, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.13);
  } catch { /* no sound */ }
  navigator.vibrate?.(50);
}

/** Camera button that opens the scanner */
export function CameraButton({ onClick, label = 'Scan with camera', className = 'btn ghost' }) {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  return <button type="button" className={className} onClick={onClick} title={label} aria-label={label}><Camera size={17} /></button>;
}

/**
 * Camera scanner. onCode(code) is called for each barcode read; it returns a short text to show (e.g. the medicine
 * name) or false when nothing matched. `continuous` keeps the camera open for the next item; the same code is
 * only taken again after a short pause, so one pack held in front of the camera counts once.
 */
export function CameraScanner({ title = 'Scan a barcode', onCode, onClose, continuous = true, extra }) {
  const video = useRef(null);
  const [state, setState] = useState('starting'); // starting | scanning | error
  const [error, setError] = useState('');
  const [last, setLast] = useState(null); // { text, ok }
  const [torch, setTorch] = useState(null); // null = not available
  const stream = useRef(null);
  const seen = useRef({ code: '', at: 0 });
  const cb = useRef(onCode); cb.current = onCode;

  useEffect(() => {
    let stop = false, timer = 0;
    (async () => {
      try {
        const [det, s] = await Promise.all([detector(), navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })]);
        if (stop) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
        const track = s.getVideoTracks()[0];
        if (track?.getCapabilities?.().torch) setTorch(false);
        setState('scanning');
        const tick = async () => {
          if (stop) return;
          try {
            if (video.current?.readyState >= 2) {
              const found = await det.detect(video.current);
              const code = found[0]?.rawValue?.trim();
              const t = Date.now();
              if (code && (code !== seen.current.code || t - seen.current.at > 1500)) {
                seen.current = { code, at: t };
                const res = await cb.current(code);
                if (res !== false) scanBeep();
                setLast({ text: typeof res === 'string' ? res : res === false ? `No medicine has the barcode ${code}` : code, ok: res !== false });
                if (!continuous && res !== false) { onClose(); return; }
              } else if (code) seen.current.at = t;
            }
          } catch { /* a frame that couldn't be read */ }
          timer = setTimeout(tick, 120);
        };
        tick();
      } catch (e) {
        setState('error');
        setError(e?.name === 'NotAllowedError' ? 'Camera permission was refused. Allow the camera for RxPOS in the browser / phone settings and try again.'
          : e?.name === 'NotFoundError' ? 'No camera was found on this device.' : (e?.message || 'The camera could not be started'));
      }
    })();
    return () => { stop = true; clearTimeout(timer); stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    try { await track.applyConstraints({ advanced: [{ torch: !torch }] }); setTorch(!torch); } catch { setTorch(null); }
  };
  return (
    <Modal title={<><Camera size={18} /> {title}</>} onClose={onClose}>
      <div className="camscan">
        <video ref={video} playsInline muted />
        {state === 'scanning' && <div className="camscan-frame" aria-hidden="true"><i /></div>}
        {state === 'starting' && <div className="camscan-msg"><Loader2 size={26} className="spin" />Starting the camera…</div>}
        {state === 'error' && <div className="camscan-msg error-msg">{error}</div>}
        {torch !== null && <button type="button" className={'camscan-torch' + (torch ? ' on' : '')} onClick={toggleTorch} aria-label="Torch"><Flashlight size={18} /></button>}
      </div>
      {last && <div className={'camscan-last ' + (last.ok ? 'ok' : 'warn')}>{last.text}</div>}
      {extra}
      <div className="form-actions">
        <span className="grow muted small">{continuous ? 'Hold each barcode inside the frame. The camera stays on for the next one.' : 'Hold the barcode inside the frame.'}</span>
        <button type="button" className="btn primary" onClick={onClose}><X size={16} />Done</button>
      </div>
    </Modal>
  );
}
