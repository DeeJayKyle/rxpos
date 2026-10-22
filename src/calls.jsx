// In-app voice calls between staff (WebRTC, audio goes directly between the two devices; the RxPOS cloud only passes
// the short call set-up messages). Calls to clients use the phone's own dialler (tel: links).
import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, MessageCircle, Wifi } from 'lucide-react';
import { useStore, uid, normalizePhone, put } from './store.jsx';
import { liveSend, liveUp, onLive } from './live.js';
import { whatsappLink } from './cloud.js';
import { playSound } from './notify.jsx';
import { notifyOS } from './badges.js';
import { toast } from './feedback.jsx';

/** Start a call to a colleague from anywhere: startCall({ id, name }) */
export const startCall = (peer) => window.dispatchEvent(new CustomEvent('rxpos-call', { detail: peer }));
/** Phone link for a client */
export const telLink = (phone) => 'tel:' + String(phone || '').replace(/[^\d+]/g, '');

/** "Call" button with a choice: in-app call (colleagues, over the internet), WhatsApp, or a normal phone call */
export function CallMenu({ person, label = 'Call', compact }) {
  const { syncCfg } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [open]);
  const phone = person.phone || person.whatsapp || '';
  const wa = normalizePhone(person.whatsapp || person.phone || '');
  const inApp = !!(person.id && person.staff && syncCfg?.key?.startsWith('u.'));
  if (!inApp && !phone) return null;
  const stop = (e) => e.stopPropagation();
  return (
    <span className="call-menu" ref={ref} onClick={stop}>
      <button type="button" className={compact ? 'icon-btn sm' : 'btn sm ghost'} title={`Call ${person.name}`} onClick={() => setOpen((o) => !o)}><Phone size={14} />{!compact && label}</button>
      {open && (
        <span className="call-pop">
          {inApp && <button type="button" onClick={() => { setOpen(false); startCall({ id: person.id, name: person.name }); }}><Wifi size={15} /><span><b>In-app call</b><small>Free, over the internet</small></span></button>}
          {wa.length >= 12 && <a href={whatsappLink(wa, '')} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}><MessageCircle size={15} /><span><b>WhatsApp</b><small>Opens the chat; tap the call button</small></span></a>}
          {phone && <a href={telLink(phone)} onClick={() => setOpen(false)}><Phone size={15} /><span><b>Phone call</b><small>{phone}</small></span></a>}
        </span>
      )}
    </span>
  );
}

async function signal(cfg, body) {
  if (body && liveSend({ type: 'rtc', kind: body.type, to: body.to, callId: body.callId, data: body.data })) {
    lastSent.set(body.callId + ':' + body.type, body);
    return { ok: true, live: true };
  }
  return httpSignal(cfg, body);
}
const lastSent = new Map(); // in case the other device isn't on the live line: resend over HTTP
async function httpSignal(cfg, body) {
  const r = await fetch(cfg.url + '/api/rtc', { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Call service unavailable');
  return j;
}
const gathered = (pc) => new Promise((resolve) => {
  if (pc.iceGatheringState === 'complete') return resolve();
  const done = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); resolve(); } };
  pc.addEventListener('icegatheringstatechange', done);
  setTimeout(resolve, 700); // the first candidates go inside the offer; later ones (relay, mobile data) follow as 'ice' messages
});
const fmtSecs = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

export function CallManager() {
  const { syncCfg, user, db, update, branchId } = useStore();
  const [call, setCall] = useState(null); // { id, peer, dir, status, muted, startedAt, offer }
  const [, tick] = useState(0);
  const pcRef = useRef(null), streamRef = useRef(null), audioRef = useRef(null), sinceRef = useRef(0), callRef = useRef(null), ringRef = useRef(null), iceRef = useRef(null), acceptRef = useRef(false);
  const pendingIce = useRef([]), dropRef = useRef(null), wakeRef = useRef(null), noAnswerRef = useRef(null);
  callRef.current = call;
  const can = !!(syncCfg?.url && syncCfg?.key?.startsWith('u.'));

  /** WhatsApp-style call line in the private chat ("Missed voice call", "Voice call · 2:31"); written once, by the caller */
  const logCall = (c, status) => {
    if (c.dir !== 'out' || !c.peer?.id || !['calling', 'connecting', 'live'].includes(c.status)) return;
    const secs = c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0;
    const conv = 'dm:' + [user.id, c.peer.id].sort().join(':');
    update((d) => { put(d, 'messages', { id: 'call-' + c.id, date: new Date().toISOString(), fromId: user.id, fromName: user.name, conv, branchId, channel: 'team', call: { status: secs ? 'done' : status, secs } }); });
  };
  const cleanup = (status = 'ended') => {
    clearInterval(ringRef.current); ringRef.current = null;
    clearTimeout(dropRef.current); clearTimeout(noAnswerRef.current);
    pcRef.current?.close(); pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    pendingIce.current = []; acceptRef.current = false;
    wakeRef.current?.release().catch(() => {}); wakeRef.current = null;
    if (callRef.current) logCall(callRef.current, status);
    setCall((c) => (c ? { ...c, status } : c));
    setTimeout(() => setCall((c) => (c && c.status === status ? null : c)), 1800);
  };
  const ice = async () => {
    if (iceRef.current && iceRef.current.at > Date.now() - 6 * 3600e3) return iceRef.current.servers;
    const j = await fetch(syncCfg.url + '/api/rtc/config', { headers: { Authorization: 'Bearer ' + syncCfg.key } }).then((r) => r.json());
    iceRef.current = { servers: j.iceServers, at: Date.now() };
    return j.iceServers;
  };
  useEffect(() => { if (can) ice().catch(() => { iceRef.current = null; }); }, [can]); // eslint-disable-line react-hooks/exhaustive-deps
  const addIce = async (cand) => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) { pendingIce.current.push(cand); return; }
    await pc.addIceCandidate(cand).catch(() => {});
  };
  const drainIce = async () => { const list = pendingIce.current; pendingIce.current = []; for (const c of list) await addIce(c); };
  const newPc = async (c) => {
    const pc = new RTCPeerConnection({ iceServers: await ice(), bundlePolicy: 'max-bundle' });
    streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    streamRef.current.getTracks().forEach((t) => pc.addTrack(t, streamRef.current));
    pc.ontrack = (e) => { if (audioRef.current) { audioRef.current.srcObject = e.streams[0]; audioRef.current.play().catch(() => {}); } };
    pc.onicecandidate = (e) => { if (e.candidate && callRef.current?.id === c.id) signal(syncCfg, { type: 'ice', to: c.peer.id, callId: c.id, data: e.candidate.toJSON() }).catch(() => {}); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (pcRef.current !== pc) return;
      if (st === 'connected') {
        clearTimeout(dropRef.current);
        setCall((x) => (x ? { ...x, status: 'live', startedAt: x.startedAt || Date.now(), weak: false } : x));
        navigator.wakeLock?.request('screen').then((w) => { wakeRef.current = w; }).catch(() => {}); // keep the screen on during the call
      }
      // a moment of bad signal is normal on phones: wait, try a fresh route, and only give up after ~15 s
      if (st === 'disconnected' && callRef.current?.id === c.id) {
        setCall((x) => (x ? { ...x, weak: true } : x));
        clearTimeout(dropRef.current);
        dropRef.current = setTimeout(() => restart(c), 3000);
      }
      if (st === 'failed' && callRef.current?.id === c.id) {
        if (!c.restarted) return restart(c);
        toast(callRef.current.startedAt ? 'The call dropped: the network went away.' : 'The call could not connect on this network. Try WhatsApp or a normal phone call.', 'warn');
        signal(syncCfg, { type: 'hangup', to: c.peer.id, callId: c.id }).catch(() => {}); cleanup();
      }
    };
    pcRef.current = pc;
    return pc;
  };
  /** New network path without hanging up (the caller makes a fresh offer) */
  const restart = async (c) => {
    const pc = pcRef.current;
    if (!pc || callRef.current?.id !== c.id || pc.connectionState === 'connected') return;
    c.restarted = true;
    dropRef.current = setTimeout(() => { if (pcRef.current === pc && pc.connectionState !== 'connected') { toast('The call dropped: the network went away.', 'warn'); signal(syncCfg, { type: 'hangup', to: c.peer.id, callId: c.id }).catch(() => {}); cleanup(); } }, 12000);
    if (c.dir !== 'out') return;
    try {
      await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      await signal(syncCfg, { type: 'reoffer', to: c.peer.id, callId: c.id, data: pc.localDescription });
    } catch { /* the timer above ends it */ }
  };

  // outgoing
  useEffect(() => {
    const onStart = async (e) => {
      const peer = e.detail;
      if (!can) return toast('Calls need the internet and your own sign-in.', 'warn');
      if (callRef.current) return toast('You are already on a call', 'warn');
      if (!navigator.mediaDevices?.getUserMedia) return toast('This device cannot make in-app calls', 'error');
      const c = { id: uid(), peer, dir: 'out', status: 'calling', muted: false };
      callRef.current = c; setCall(c);
      signal(syncCfg, { type: 'ring', to: peer.id, callId: c.id }).catch(() => {}); // rings straight away
      try {
        const pc = await newPc(c);
        await pc.setLocalDescription(await pc.createOffer());
        await gathered(pc);
        if (callRef.current?.id !== c.id) return;
        await signal(syncCfg, { type: 'offer', to: peer.id, callId: c.id, data: pc.localDescription });
        playSound('ringback');
        ringRef.current = setInterval(() => playSound('ringback'), 3000);
        noAnswerRef.current = setTimeout(() => { if (callRef.current?.id === c.id && callRef.current.status === 'calling') { signal(syncCfg, { type: 'hangup', to: peer.id, callId: c.id }).catch(() => {}); toast(`${peer.name} didn't pick up`, 'info'); cleanup('no answer'); } }, 45000);
      } catch (err) { toast(err.name === 'NotAllowedError' ? 'Allow the microphone to make calls' : err.message, 'error'); cleanup('failed'); }
    };
    window.addEventListener('rxpos-call', onStart);
    return () => window.removeEventListener('rxpos-call', onStart);
  }, [can, syncCfg]); // eslint-disable-line react-hooks/exhaustive-deps

  // incoming call messages: instantly over the live line …
  useEffect(() => {
    if (!can) return;
    return onLive((m) => {
      if (m.type === 'rtc') onMessage({ type: m.kind, call_id: m.call_id, from_uid: m.from_uid, from_name: m.from_name, data: m.data, at: m.at });
      if (m.type === 'rtc-offline') { // that colleague isn't on the live line (older app or poor network): send by HTTP instead
        for (const [k, body] of lastSent) if (k.startsWith(m.call_id + ':')) { httpSignal(syncCfg, body).catch(() => {}); lastSent.delete(k); }
      }
    });
  }, [can, syncCfg?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // … and by polling only while the live line is down
  useEffect(() => {
    if (!can) return;
    let stop = false, t;
    const poll = async () => {
      if (liveUp()) { if (!stop) t = setTimeout(poll, 4000); return; }
      try {
        const r = await fetch(`${syncCfg.url}/api/rtc?since=${sinceRef.current}`, { headers: { Authorization: 'Bearer ' + syncCfg.key } });
        const j = await r.json();
        if (r.ok) { for (const m of j.messages) await onMessage(m); sinceRef.current = j.last || sinceRef.current; }
      } catch {}
      if (!stop && document.visibilityState !== 'hidden') t = setTimeout(poll, callRef.current ? 600 : 1500);
      else if (!stop) t = setTimeout(poll, 8000);
    };
    poll();
    return () => { stop = true; clearTimeout(t); };
  }, [can, syncCfg?.url, syncCfg?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMessage = async (m) => {
    const c = callRef.current;
    if (m.type === 'ice') { if (c && c.id === m.call_id) await addIce(m.data); return; }
    if (m.type === 'offer' && c && c.id === m.call_id && c.dir === 'in') {
      // the connection details follow the ring a moment later
      const next = { ...c, offer: m.data };
      callRef.current = next; setCall(next);
      if (acceptRef.current) { acceptRef.current = false; answer(next); }
      return;
    }
    if (m.type === 'ring' || m.type === 'offer') {
      if (c) return c.id === m.call_id ? undefined : signal(syncCfg, { type: 'busy', to: m.from_uid, callId: m.call_id }).catch(() => {});
      if (Date.now() - m.at > 40000) return;
      const name = m.from_name || db.users.find((u) => u.id === m.from_uid)?.name || 'Colleague';
      const next = { id: m.call_id, peer: { id: m.from_uid, name }, dir: 'in', status: 'ringing', offer: m.type === 'offer' ? m.data : null, muted: false };
      callRef.current = next; setCall(next);
      playSound('ring');
      clearInterval(ringRef.current);
      ringRef.current = setInterval(() => playSound('ring'), 3000);
      notifyOS('Incoming call', `${name} is calling you on RxPOS`, { tag: 'call' });
      noAnswerRef.current = setTimeout(() => { if (callRef.current?.id === m.call_id && callRef.current.status === 'ringing') cleanup('missed'); }, 46000);
      return;
    }
    if (!c || c.id !== m.call_id) return;
    if (m.type === 'answer') { clearInterval(ringRef.current); setCall((x) => ({ ...x, status: 'connecting' })); await pcRef.current?.setRemoteDescription(m.data).catch(() => {}); await drainIce(); }
    if (m.type === 'reoffer' && pcRef.current) { // the caller found a new route after a network change
      const pc = pcRef.current;
      await pc.setRemoteDescription(m.data).catch(() => {});
      await pc.setLocalDescription(await pc.createAnswer());
      signal(syncCfg, { type: 'reanswer', to: c.peer.id, callId: c.id, data: pc.localDescription }).catch(() => {});
    }
    if (m.type === 'reanswer') await pcRef.current?.setRemoteDescription(m.data).catch(() => {});
    if (m.type === 'decline' || m.type === 'busy') { toast(m.type === 'busy' ? `${c.peer.name} is on another call` : `${c.peer.name} can't talk right now`, 'info'); cleanup(m.type === 'busy' ? 'busy' : 'declined'); }
    if (m.type === 'hangup') cleanup(c.status === 'ringing' ? 'missed' : 'ended');
  };

  const accept = () => {
    const c = callRef.current;
    clearInterval(ringRef.current); clearTimeout(noAnswerRef.current);
    const next = { ...c, status: 'connecting' };
    callRef.current = next; setCall(next);
    if (!c.offer) { acceptRef.current = true; return; } // answered before the details arrived: connect as soon as they do
    answer(next);
  };
  const answer = async (c) => {
    try {
      const pc = await newPc(c);
      await pc.setRemoteDescription(c.offer);
      await drainIce();
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      await signal(syncCfg, { type: 'answer', to: c.peer.id, callId: c.id, data: pc.localDescription });
    } catch (err) { toast(err.name === 'NotAllowedError' ? 'Allow the microphone to answer calls' : err.message, 'error'); hangup(); }
  };
  const decline = () => { const c = callRef.current; signal(syncCfg, { type: 'decline', to: c.peer.id, callId: c.id }).catch(() => {}); cleanup('declined'); };
  const hangup = () => { const c = callRef.current; if (c) signal(syncCfg, { type: 'hangup', to: c.peer.id, callId: c.id }).catch(() => {}); cleanup(); };
  const mute = () => { const on = !call.muted; streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !on; }); setCall({ ...call, muted: on }); };
  useEffect(() => { if (call?.status !== 'live') return; const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [call?.status]);

  const secs = call?.startedAt ? Math.floor((Date.now() - call.startedAt) / 1000) : 0;
  const label = call && ({ calling: 'Ringing…', ringing: 'Incoming voice call', connecting: 'Connecting…', live: call.weak ? 'Reconnecting…' : fmtSecs(secs), ended: secs ? `Call ended · ${fmtSecs(secs)}` : 'Call ended', declined: 'Busy right now', busy: 'On another call', 'no answer': 'No answer', missed: 'Missed call', failed: 'Call failed' }[call.status] || call.status);
  const initials = call?.peer.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  // one <audio> element for the whole life of the app, so the voice never cuts when the screen changes
  return (
    <>
      <audio ref={audioRef} autoPlay playsInline />
      {call && (
        <div className={'call-screen ' + call.status}>
          <div className="call-card">
            <span className={'call-avatar' + (['ringing', 'calling'].includes(call.status) ? ' pulse' : '')}>{initials}</span>
            <strong>{call.peer.name}</strong>
            <span className="muted call-status">{call.dir === 'in' && call.status === 'ringing' ? <><PhoneIncoming size={14} /> {label}</> : label}</span>
            {call.status === 'live' && <span className="call-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
            <div className="row gap call-actions">
              {call.status === 'ringing' && call.dir === 'in' ? (
                <><button className="call-btn end" onClick={decline} aria-label="Decline"><PhoneOff size={22} /></button><button className="call-btn accept" onClick={accept} aria-label="Answer"><Phone size={22} /></button></>
              ) : ['calling', 'connecting', 'live'].includes(call.status) ? (
                <><button className={'call-btn' + (call.muted ? ' on' : '')} onClick={mute} aria-label={call.muted ? 'Unmute' : 'Mute'}>{call.muted ? <MicOff size={20} /> : <Mic size={20} />}</button><button className="call-btn end" onClick={hangup} aria-label="Hang up"><PhoneOff size={22} /></button></>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
