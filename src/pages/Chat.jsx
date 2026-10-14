import { useEffect, useMemo, useRef, useState } from 'react';
import { Hash, MessageCircle, MessageSquareText, Send, User as UserIcon, Users as UsersIcon, Search, NotebookPen, Phone, Paperclip, Mic } from 'lucide-react';
import { useStore, uid, now, put, normalizePhone } from '../store.jsx';
import { Tabs, Empty } from '../ui.jsx';
import { toast } from '../feedback.jsx';
import { sendSms, whatsappLink, cloudConfig } from '../cloud.js';
import { startCall, telLink } from '../calls.jsx';
import { uploadAttachment, Attachment, VoiceRecorder, ATTACH_ACCEPT, fileSize } from '../attach.jsx';

const READ_KEY = 'rxpos-chat-read';
const getRead = () => { try { return JSON.parse(localStorage.getItem(READ_KEY)) || {}; } catch { return {}; } };
export const dmId = (a, b) => 'dm:' + [a, b].sort().join(':');

/** Unread team messages for the menu badge */
export function unreadCount(db, user) {
  if (!user) return 0;
  const read = getRead();
  return db.messages.filter((m) => m.fromId !== user.id && (m.conv === 'team' || (m.conv.startsWith('dm:') && m.conv.includes(user.id))) && m.date > (read[m.conv] || '')).length;
}

export default function Chat() {
  const { db, update, user, branchId, syncNow, syncCfg, can } = useStore();
  const [tab, setTab] = useState('team');
  const [conv, setConv] = useState('team');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [smsReady, setSmsReady] = useState(false);
  const [read, setRead] = useState(getRead);
  const endRef = useRef();

  // Near real-time while the chat is open: sync every 8 seconds
  useEffect(() => { const t = setInterval(() => syncNow(), 8000); return () => clearInterval(t); }, [syncNow]);
  useEffect(() => { if (syncCfg.url) cloudConfig(syncCfg).then((c) => setSmsReady(!!c.sms)).catch(() => {}); }, [syncCfg]);

  const messages = useMemo(() => db.messages.filter((m) => m.conv === conv).sort((a, b) => a.date.localeCompare(b.date)), [db.messages, conv]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
    const last = messages[messages.length - 1]?.date;
    if (last && (read[conv] || '') < last) { const r = { ...getRead(), [conv]: last }; try { localStorage.setItem(READ_KEY, JSON.stringify(r)); } catch {} setRead(r); }
  }, [messages, conv]); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = (c) => db.messages.filter((m) => m.conv === c && m.fromId !== user.id && m.date > (read[c] || '')).length;
  const staff = db.users.filter((u) => u.id !== user.id && !u.disabled);
  const customers = db.customers.filter((c) => c.id !== 'walk-in' && (!q || `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 100);
  const client = conv.startsWith('client:') ? db.customers.find((c) => c.id === conv.slice(7)) : null;
  const phone = normalizePhone(client?.whatsapp || client?.phone || '');

  const log = (msg) => { update((d) => { put(d, 'messages', { id: uid(), date: now(), fromId: user.id, fromName: user.name, conv, branchId, ...msg }); }); setTimeout(syncNow, 300); };
  const sendTeam = (e) => { e.preventDefault(); if (!text.trim()) return; log({ text: text.trim(), channel: 'team' }); setText(''); };
  // Photos, PDFs, videos, audio, spreadsheets and voice notes (team & direct messages)
  const [uploading, setUploading] = useState(null);
  const [recording, setRecording] = useState(false);
  const sendFiles = async (files, extra = {}) => {
    for (const f of files) {
      try {
        setUploading({ name: extra.name || f.name, p: 0 });
        const a = await uploadAttachment(syncCfg, f, extra.name || f.name, (p) => setUploading({ name: extra.name || f.name, p }));
        log({ text: text.trim() || (extra.voice ? 'Voice note' : ''), channel: 'team', attachment: { ...a, ...extra } });
        setText('');
      } catch (err) { toast(err.message, 'error'); }
    }
    setUploading(null);
  };
  const sendWhatsApp = () => { if (!text.trim()) return; window.open(whatsappLink(phone, text.trim()), '_blank'); log({ text: text.trim(), channel: 'whatsapp', to: client.name }); setText(''); };
  const sendViaSms = async () => {
    if (!text.trim()) return;
    try { await sendSms(syncCfg, [phone], text.trim()); log({ text: text.trim(), channel: 'sms', to: client.name }); setText(''); toast('SMS sent'); } catch (e) { toast(e.message, 'error'); }
  };
  const recordReply = () => { if (!text.trim()) return; log({ text: text.trim(), channel: 'reply', fromName: client.name, fromId: 'client:' + client.id }); setText(''); };

  const title = conv === 'team' ? 'General (whole team)' : conv.startsWith('dm:') ? db.users.find((u) => conv.includes(u.id) && u.id !== user.id)?.name || 'Direct message' : client?.name;

  return (
    <div className="page chat-page">
      <div className="page-head"><div><h1>Chat & Messages</h1><div className="sub">Team chat syncs to every device · client messages go out by WhatsApp or SMS</div></div></div>
      <div className="chat">
        <aside className="chat-list card">
          <Tabs tabs={[['team', 'Team'], ...(can('customers') ? [['clients', 'Clients']] : [])]} value={tab} onChange={(t) => { setTab(t); setConv(t === 'team' ? 'team' : conv); }} />
          {tab === 'team' ? (
            <div className="chat-convs">
              <button className={'chat-conv' + (conv === 'team' ? ' active' : '')} onClick={() => setConv('team')}><Hash size={16} /><span className="grow">General</span>{unread('team') > 0 && <span className="count">{unread('team')}</span>}</button>
              <div className="nav-title">Direct messages</div>
              {staff.map((u) => { const c = dmId(user.id, u.id); return (
                <button key={u.id} className={'chat-conv' + (conv === c ? ' active' : '')} onClick={() => setConv(c)}><UserIcon size={16} /><span className="grow">{u.name}</span>{unread(c) > 0 && <span className="count">{unread(c)}</span>}<span className="icon-btn sm" role="button" title={`Call ${u.name}`} onClick={(e) => { e.stopPropagation(); startCall({ id: u.id, name: u.name }); }}><Phone size={14} /></span></button>
              ); })}
              {!staff.length && <p className="muted small">Add staff in Users & Roles to message them.</p>}
            </div>
          ) : (
            <div className="chat-convs">
              <div className="search-wrap"><Search size={16} /><input className="search" placeholder="Find client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              {customers.map((c) => (
                <button key={c.id} className={'chat-conv' + (conv === 'client:' + c.id ? ' active' : '')} onClick={() => setConv('client:' + c.id)}><UsersIcon size={16} /><span className="grow">{c.name}<br /><small className="muted">{c.phone || 'no phone'}</small></span></button>
              ))}
              {!customers.length && <p className="muted small">No clients yet. Add them in Customers or at the POS.</p>}
            </div>
          )}
        </aside>
        <section className="chat-main card">
          <div className="chat-head"><strong className="grow">{title}</strong>{client && <span className="muted small">{client.phone || client.whatsapp || 'No phone number saved'}</span>}
            {client && (client.phone || client.whatsapp) && <a className="btn sm ghost" href={telLink(client.phone || client.whatsapp)}><Phone size={14} />Call</a>}
            {conv.startsWith('dm:') && (() => { const u = db.users.find((x) => conv.includes(x.id) && x.id !== user.id); return u ? <button className="btn sm ghost" onClick={() => startCall({ id: u.id, name: u.name })}><Phone size={14} />Call</button> : null; })()}</div>
          <div className="chat-messages">
            {messages.map((m) => {
              const mine = m.fromId === user.id;
              return (
                <div key={m.id} className={'bubble ' + (mine ? 'mine' : 'theirs') + (m.channel && m.channel !== 'team' ? ' ' + m.channel : '')}>
                  {!mine && <div className="bubble-from">{m.fromName}</div>}
                  {m.attachment && <Attachment a={m.attachment} base={syncCfg.url} />}
                  {m.text && !(m.attachment?.voice && m.text === 'Voice note') && <div>{m.text}</div>}
                  <div className="bubble-meta">{m.channel === 'whatsapp' ? 'WhatsApp · ' : m.channel === 'sms' ? 'SMS · ' : m.channel === 'reply' ? 'client reply · ' : ''}{mine && client ? `by ${m.fromName} · ` : ''}{new Date(m.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</div>
                </div>
              );
            })}
            {!messages.length && <Empty>{client ? 'No messages with this client yet' : 'Say hello to the team 👋'}</Empty>}
            <div ref={endRef} />
          </div>
          {conv.startsWith('client:') ? (
            <div className="chat-compose">
              <textarea rows={2} placeholder={`Message to ${client?.name || 'client'}…`} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row gap">
                <button className="btn primary" disabled={phone.length < 12 || !text.trim()} onClick={sendWhatsApp}><MessageCircle size={16} />WhatsApp</button>
                <button className="btn ghost" disabled={!smsReady || phone.length < 12 || !text.trim()} title={smsReady ? '' : 'SMS is not set up yet'} onClick={sendViaSms}><MessageSquareText size={16} />SMS</button>
                <button className="btn ghost" disabled={!text.trim()} title="Paste the client's WhatsApp/SMS reply to keep the history together" onClick={recordReply}><NotebookPen size={16} />Record their reply</button>
              </div>
            </div>
          ) : (
            <>
              {uploading && <div className="upload-bar"><span>Sending {uploading.name}… {Math.round(uploading.p * 100)}%</span><i style={{ width: `${uploading.p * 100}%` }} /></div>}
              {recording ? (
                <VoiceRecorder onCancel={(msg) => { setRecording(false); if (msg) toast(msg, 'warn'); }}
                  onSend={(blob, secs) => { setRecording(false); const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'; sendFiles([blob], { name: `voice-note-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.${ext}`, voice: true, duration: secs }); }} />
              ) : (
                <form className="chat-compose row gap" onSubmit={sendTeam}>
                  <label className="icon-btn" title="Attach photo, PDF, video, audio or spreadsheet (up to 15 MB)"><Paperclip size={18} />
                    <input type="file" hidden multiple accept={ATTACH_ACCEPT} onChange={(e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) sendFiles(fs); }} /></label>
                  <input className="grow" placeholder="Type a message to the team…" value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); sendFiles(fs); } }} />
                  {text.trim() ? <button className="btn primary"><Send size={16} />Send</button>
                    : <button type="button" className="btn primary" title="Record a voice note" disabled={!!uploading || !navigator.mediaDevices?.getUserMedia} onClick={() => setRecording(true)}><Mic size={16} />Voice</button>}
                </form>
              )}
            </>
          )}
          {!syncCfg.url && <small className="muted">This device isn't connected to the cloud, so team messages stay on this device.</small>}
        </section>
      </div>
    </div>
  );
}
