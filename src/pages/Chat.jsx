import { useEffect, useMemo, useRef, useState } from 'react';
import { Hash, MessageCircle, MessageSquareText, Send, User as UserIcon, Users as UsersIcon, Search, NotebookPen } from 'lucide-react';
import { useStore, uid, now, put, normalizePhone } from '../store.jsx';
import { Tabs, Empty } from '../ui.jsx';
import { toast } from '../feedback.jsx';
import { sendSms, whatsappLink, cloudConfig } from '../cloud.js';

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
                <button key={u.id} className={'chat-conv' + (conv === c ? ' active' : '')} onClick={() => setConv(c)}><UserIcon size={16} /><span className="grow">{u.name}</span>{unread(c) > 0 && <span className="count">{unread(c)}</span>}</button>
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
          <div className="chat-head"><strong>{title}</strong>{client && <span className="muted small">{client.phone || client.whatsapp || 'No phone number saved'}</span>}</div>
          <div className="chat-messages">
            {messages.map((m) => {
              const mine = m.fromId === user.id;
              return (
                <div key={m.id} className={'bubble ' + (mine ? 'mine' : 'theirs') + (m.channel && m.channel !== 'team' ? ' ' + m.channel : '')}>
                  {!mine && <div className="bubble-from">{m.fromName}</div>}
                  <div>{m.text}</div>
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
            <form className="chat-compose row gap" onSubmit={sendTeam}>
              <input className="grow" placeholder="Type a message to the team…" value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn primary" disabled={!text.trim()}><Send size={16} />Send</button>
            </form>
          )}
          {!syncCfg.url && <small className="muted">This device isn't connected to the cloud, so team messages stay on this device.</small>}
        </section>
      </div>
    </div>
  );
}
