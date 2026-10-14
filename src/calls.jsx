// In-app voice calls between staff (WebRTC, audio goes directly between the two devices; the RxPOS cloud only passes
// the short call set-up messages). Calls to clients use the phone's own dialler (tel: links).
import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff } from 'lucide-react';
import { useStore, uid } from './store.jsx';
import { playSound } from './notify.jsx';
import { toast } from './feedback.jsx';

/** Start a call to a colleague from anywhere: startCall({ id, name }) */
export const startCall = (peer) => window.dispatchEvent(new CustomEvent('rxpos-call', { detail: peer }));
/** Phone link for a client */
export const telLink = (phone) => 'tel:' + String(phone || '').replace(/[^\d+]/g, '');

async function signal(cfg, body) {
  const r = await fetch(cfg.url + '/api/rtc', { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Call service unavailable');
  return j;
}
const gathered = (pc) => new Promise((resolve) => {
  if (pc.iceGatheringState === 'complete') return resolve();
  const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
  pc.addEventListener('icegatheringstatechange', done);
  setTimeout(resolve, 3000); // enough candidates by now
});

export function CallManager() {
  const { syncCfg, user, db } = useStore();
  const [call, setCall] = useState(null); // { id, peer, dir, status, muted, startedAt, offer }
  const [, tick] = useState(0);
  const pcRef = useRef(null), streamRef = useRef(null), audioRef = useRef(null), sinceRef = useRef(0), callRef = useRef(null), ringRef = useRef(null), iceRef = useRef(null);
  callRef.current = call;
  const can = !!(syncCfg?.url && syncCfg?.key?.startsWith('u.'));

  const cleanup = (status = 'ended') => {
    clearInterval(ringRef.current); ringRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    setCall((c) => (c ? { ...c, status } : c));
    setTimeout(() => setCall((c) => (c && c.status === status ? null : c)), 1800);
  };
  const ice = async () => iceRef.current || (iceRef.current = (await fetch(syncCfg.url + '/api/rtc/config', { headers: { Authorization: 'Bearer ' + syncCfg.key } }).then((r) => r.json())).iceServers);
  const newPc = async (c) => {
    const pc = new RTCPeerConnection({ iceServers: await ice() });
    streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current));
    pc.ontrack = (e) => { if (audioRef.current) { audioRef.current.srcObject = e.streams[0]; audioRef.current.play().catch(() => {}); } };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCall((x) => (x ? { ...x, status: 'live', startedAt: Date.now() } : x));
      if (['failed', 'disconnected'].includes(pc.connectionState) && callRef.current?.id === c.id) {
        toast(pc.connectionState === 'failed' ? 'The call could not connect (network blocks direct calls). Try a normal phone call.' : 'Call dropped', 'warn');
        signal(syncCfg, { type: 'hangup', to: c.peer.id, callId: c.id }).catch(() => {}); cleanup();
      }
    };
    pcRef.current = pc;
    return pc;
  };

  // outgoing
  useEffect(() => {
    const onStart = async (e) => {
      const peer = e.detail;
      if (!can) return toast('Calls need an internet connection and your own sign-in.', 'warn');
      if (callRef.current) return toast('You are already on a call', 'warn');
      if (!navigator.mediaDevices?.getUserMedia) return toast('This device cannot make in-app calls', 'error');
      const c = { id: uid(), peer, dir: 'out', status: 'calling', muted: false };
      setCall(c);
      try {
        const pc = await newPc(c);
        await pc.setLocalDescription(await pc.createOffer());
        await gathered(pc);
        await signal(syncCfg, { type: 'offer', to: peer.id, callId: c.id, data: pc.localDescription });
        ringRef.current = setInterval(() => playSound('message'), 2500);
        setTimeout(() => { if (callRef.current?.id === c.id && callRef.current.status === 'calling') { signal(syncCfg, { type: 'hangup', to: peer.id, callId: c.id }).catch(() => {}); toast(`${peer.name} did not answer`, 'info'); cleanup('no answer'); } }, 45000);
      } catch (err) { toast(err.name === 'NotAllowedError' ? 'Allow the microphone to make calls' : err.message, 'error'); cleanup(); }
    };
    window.addEventListener('rxpos-call', onStart);
    return () => window.removeEventListener('rxpos-call', onStart);
  }, [can, syncCfg]); // eslint-disable-line react-hooks/exhaustive-deps

  // incoming messages (poll: every 3 s, every second during a call)
  useEffect(() => {
    if (!can) return;
    let stop = false, t;
    const poll = async () => {
      try {
        const r = await fetch(`${syncCfg.url}/api/rtc?since=${sinceRef.current}`, { headers: { Authorization: 'Bearer ' + syncCfg.key } });
        const j = await r.json();
        if (r.ok) { for (const m of j.messages) await onMessage(m); sinceRef.current = j.last || sinceRef.current; }
      } catch {}
      if (!stop && document.visibilityState !== 'hidden') t = setTimeout(poll, callRef.current ? 1000 : 3000);
      else if (!stop) t = setTimeout(poll, 8000);
    };
    poll();
    return () => { stop = true; clearTimeout(t); };
  }, [can, syncCfg?.url, syncCfg?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMessage = async (m) => {
    const c = callRef.current;
    if (m.type === 'offer') {
      if (c) return signal(syncCfg, { type: 'busy', to: m.from_uid, callId: m.call_id }).catch(() => {});
      if (Date.now() - m.at > 40000) return;
      setCall({ id: m.call_id, peer: { id: m.from_uid, name: m.from_name || db.users.find((u) => u.id === m.from_uid)?.name || 'Colleague' }, dir: 'in', status: 'ringing', offer: m.data, muted: false });
      playSound('ring');
      clearInterval(ringRef.current);
      ringRef.current = setInterval(() => playSound('ring'), 3000);
      if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Incoming RxPOS call', { body: m.from_name || 'Colleague', tag: 'rxpos-call' }); } catch {} }
      return;
    }
    if (!c || c.id !== m.call_id) return;
    if (m.type === 'answer') { clearInterval(ringRef.current); setCall((x) => ({ ...x, status: 'connecting' })); await pcRef.current?.setRemoteDescription(m.data).catch(() => {}); }
    if (m.type === 'decline' || m.type === 'busy') { toast(m.type === 'busy' ? `${c.peer.name} is on another call` : `${c.peer.name} declined the call`, 'info'); cleanup(m.type === 'busy' ? 'busy' : 'declined'); }
    if (m.type === 'hangup') cleanup();
  };

  const accept = async () => {
    const c = callRef.current;
    clearInterval(ringRef.current);
    setCall({ ...c, status: 'connecting' });
    try {
      const pc = await newPc(c);
      await pc.setRemoteDescription(c.offer);
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      await signal(syncCfg, { type: 'answer', to: c.peer.id, callId: c.id, data: pc.localDescription });
    } catch (err) { toast(err.name === 'NotAllowedError' ? 'Allow the microphone to answer calls' : err.message, 'error'); hangup(); }
  };
  const decline = () => { const c = callRef.current; signal(syncCfg, { type: 'decline', to: c.peer.id, callId: c.id }).catch(() => {}); cleanup('declined'); };
  const hangup = () => { const c = callRef.current; if (c) signal(syncCfg, { type: 'hangup', to: c.peer.id, callId: c.id }).catch(() => {}); cleanup(); };
  const mute = () => { const on = !call.muted; streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !on; }); setCall({ ...call, muted: on }); };
  useEffect(() => { if (call?.status !== 'live') return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [call?.status]);

  if (!call) return <audio ref={audioRef} autoPlay />;
  const secs = call.startedAt ? Math.floor((Date.now() - call.startedAt) / 1000) : 0;
  const label = { calling: 'Calling…', ringing: 'Incoming call', connecting: 'Connecting…', live: `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, ended: 'Call ended', declined: 'Declined', busy: 'Busy', 'no answer': 'No answer' }[call.status] || call.status;
  const initials = call.peer.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={'call-screen ' + call.status}>
      <audio ref={audioRef} autoPlay />
      <div className="call-card">
        <span className={'call-avatar' + (['ringing', 'calling'].includes(call.status) ? ' pulse' : '')}>{initials}</span>
        <strong>{call.peer.name}</strong>
        <span className="muted">{call.dir === 'in' && call.status === 'ringing' ? <><PhoneIncoming size={14} /> {label}</> : label}</span>
        <div className="row gap call-actions">
          {call.status === 'ringing' && call.dir === 'in' ? (
            <><button className="call-btn accept" onClick={accept} aria-label="Answer"><Phone size={22} /></button><button className="call-btn end" onClick={decline} aria-label="Decline"><PhoneOff size={22} /></button></>
          ) : ['calling', 'connecting', 'live'].includes(call.status) ? (
            <><button className={'call-btn' + (call.muted ? ' on' : '')} onClick={mute} aria-label="Mute">{call.muted ? <MicOff size={20} /> : <Mic size={20} />}</button><button className="call-btn end" onClick={hangup} aria-label="Hang up"><PhoneOff size={22} /></button></>
          ) : null}
        </div>
      </div>
    </div>
  );
}
