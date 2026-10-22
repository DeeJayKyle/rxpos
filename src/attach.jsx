// Attachments for team messages: upload (in pieces), show (photo, video, audio, PDF, spreadsheet…) and record voice notes.
import { useEffect, useRef, useState } from 'react';
import { FileText, FileSpreadsheet, FileVideo, FileAudio, File as FileIcon, Download, Mic, Square, Send, X, Trash2 } from 'lucide-react';
import { safeFileUrl } from './safeurl.js';

export const ATTACH_ACCEPT = 'image/*,video/*,audio/*,application/pdf,.csv,.xls,.xlsx,.ods,.doc,.docx,.ppt,.pptx';
export const MAX_FILE = 15 * 1024 * 1024;
const PIECE = 600 * 1024;
const TYPES = { csv: 'text/csv', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pdf: 'application/pdf' };
const typeOf = (f) => (f.type || TYPES[String(f.name || '').split('.').pop().toLowerCase()] || 'application/octet-stream').split(';')[0];
export const fileSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

/** Upload a File/Blob to the pharmacy's cloud → { path, name, type, size } */
export async function uploadAttachment(cfg, file, name = file.name, onProgress) {
  if (!cfg?.url || !cfg?.key) throw new Error('Sharing files needs the internet and your sign-in.');
  if (!navigator.onLine) throw new Error('You are offline. Files can be sent when the internet is back.');
  if (file.size > MAX_FILE) throw new Error(`${name} is ${fileSize(file.size)}. Files can be up to 15 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 24);
  const chunks = Math.max(1, Math.ceil(bytes.length / PIECE));
  const type = typeOf({ type: file.type, name });
  let path = '';
  for (let n = 0; n < chunks; n++) {
    const r = await fetch(cfg.url + '/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({ id, n, chunks, size: bytes.length, name, type, data: b64(bytes.subarray(n * PIECE, (n + 1) * PIECE)) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Upload failed');
    if (j.path) path = j.path;
    onProgress?.((n + 1) / chunks);
  }
  return { path, name, type, size: bytes.length };
}

const iconFor = (t) => (/sheet|excel|csv|spreadsheet/.test(t) ? FileSpreadsheet : /pdf|word|document|presentation/.test(t) ? FileText : /^video/.test(t) ? FileVideo : /^audio/.test(t) ? FileAudio : FileIcon);

/** Show an attachment inside a chat bubble */
export function Attachment({ a, base }) {
  const url = safeFileUrl(base, a.path);
  if (!url) return <span className="att-file muted"><FileIcon size={18} /> {a.name || 'Attachment'} (can’t be shown)</span>;
  if (/^image\//.test(a.type)) return <a href={url} target="_blank" rel="noreferrer" className="att-img"><img src={url} alt={a.name} loading="lazy" /></a>;
  if (/^video\//.test(a.type)) return <video className="att-video" src={url} controls preload="metadata" />;
  if (/^audio\//.test(a.type)) return <div className="att-audio">{a.voice && <Mic size={14} />}<audio src={url} controls preload="metadata" />{a.duration ? <small className="muted">{a.duration}s</small> : null}</div>;
  const Icon = iconFor(a.type);
  return <a className="att-file" href={url} target="_blank" rel="noreferrer" download={a.name}><Icon size={22} /><span className="grow"><b>{a.name}</b><small className="muted">{fileSize(a.size)}</small></span><Download size={16} /></a>;
}

/** Record a voice note (up to 3 minutes) → onDone(blob, seconds) */
export function VoiceRecorder({ onSend, onCancel }) {
  const [state, setState] = useState('starting'); // recording | ready
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState(null);
  const recRef = useRef(null), chunksRef = useRef([]), streamRef = useRef(null), startRef = useRef(0);
  useEffect(() => {
    let t;
    (async () => {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
        const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
        rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        rec.onstop = () => { setBlob(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })); setState('ready'); streamRef.current?.getTracks().forEach((x) => x.stop()); };
        rec.start(500); recRef.current = rec; startRef.current = Date.now(); setState('recording');
        t = setInterval(() => { const s = Math.round((Date.now() - startRef.current) / 1000); setSecs(s); if (s >= 180) rec.state === 'recording' && rec.stop(); }, 250);
      } catch { onCancel('Allow the microphone to record voice notes.'); }
    })();
    return () => { clearInterval(t); try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch {} streamRef.current?.getTracks().forEach((x) => x.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const url = blob ? URL.createObjectURL(blob) : '';
  return (
    <div className="voice-rec">
      {state !== 'ready' ? (
        <><span className="rec-dot" /><span className="grow">Recording… {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
          <button type="button" className="btn sm ghost" onClick={() => onCancel()}><X size={14} />Cancel</button>
          <button type="button" className="btn sm primary" onClick={() => recRef.current?.state === 'recording' && recRef.current.stop()}><Square size={14} />Stop</button></>
      ) : (
        <><audio src={url} controls className="grow" />
          <button type="button" className="btn sm ghost" onClick={() => onCancel()} title="Discard"><Trash2 size={14} /></button>
          <button type="button" className="btn sm primary" onClick={() => onSend(blob, secs)}><Send size={14} />Send</button></>
      )}
    </div>
  );
}
