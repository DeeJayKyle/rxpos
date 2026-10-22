import { useEffect, useMemo, useRef, useState } from 'react';
import { Hash, MessageCircle, MessageSquareText, Send, User as UserIcon, Users as UsersIcon, Search, NotebookPen, Paperclip, Mic, Reply, Copy, Forward, Pin, PinOff, Star, Pencil, Trash2, Info, X, ChevronDown, ChevronLeft, Check, CheckCheck, Phone, PhoneMissed, PhoneOutgoing, SmilePlus, MoreVertical } from 'lucide-react';
import { useStore, uid, now, put, del, normalizePhone } from '../store.jsx';
import { Tabs, Empty, Modal } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { sendSms, whatsappLink, cloudConfig } from '../cloud.js';
import { CallMenu, startCall } from '../calls.jsx';
import { liveUp } from '../live.js';
import { uploadAttachment, Attachment, VoiceRecorder, ATTACH_ACCEPT } from '../attach.jsx';

const READ_KEY = 'rxpos-chat-read';
const HIDDEN_KEY = 'rxpos-chat-hidden'; // "Delete for me": only this device stops showing it
const getRead = () => { try { return JSON.parse(localStorage.getItem(READ_KEY)) || {}; } catch { return {}; } };
const getHidden = () => { try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY)) || []); } catch { return new Set(); } };
export const dmId = (a, b) => 'dm:' + [a, b].sort().join(':');
const REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅'];
const EDIT_HOURS = 24, UNSEND_HOURS = 48;
const age = (m) => (Date.now() - new Date(m.date).getTime()) / 3600e3;
const callText = (c) => (c.status === 'done' ? `Voice call · ${Math.floor(c.secs / 60)}:${String(c.secs % 60).padStart(2, '0')}` : c.status === 'declined' || c.status === 'busy' ? 'Call not answered' : 'Missed voice call');

/** One line about a message, for pop-ups, replies and the pinned bar */
export function messagePreview(m) {
  if (!m) return '';
  if (m.deleted) return 'This message was deleted';
  if (m.call) return '📞 ' + callText(m.call);
  if (m.attachment) return (m.attachment.voice ? '🎤 Voice note' : /^image\//.test(m.attachment.type) ? '📷 Photo' : '📎 ' + m.attachment.name) + (m.text && m.text !== 'Voice note' ? ': ' + m.text : '');
  return String(m.text || '');
}

/** Unread team messages for the menu badge */
export function unreadCount(db, user) {
  if (!user) return 0;
  const read = getRead();
  return db.messages.filter((m) => m.fromId !== user.id && !m.deleted && (m.conv === 'team' || (m.conv.startsWith('dm:') && m.conv.includes(user.id))) && m.date > (read[m.conv] || '')).length;
}

const dayLabel = (iso) => {
  const d = new Date(iso), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
};

export default function Chat() {
  const { db, update, user, branchId, syncNow, syncCfg, can } = useStore();
  const [tab, setTab] = useState('team');
  const [conv, setConv] = useState('team');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [smsReady, setSmsReady] = useState(false);
  const [read, setRead] = useState(getRead);
  const [hidden, setHidden] = useState(getHidden);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null); // { m, x, y }
  const [forwarding, setForwarding] = useState(null);
  const [infoFor, setInfoFor] = useState(null);
  const [find, setFind] = useState(null); // null = closed, '' = open
  const [starredOnly, setStarredOnly] = useState(false);
  const [flash, setFlash] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const [opened, setOpened] = useState(false); // phones: the list, or one conversation full screen (like WhatsApp)
  const openConv = (c) => { setConv(c); setOpened(true); };
  const listRef = useRef(), inputRef = useRef();

  // without the live line, check for new messages every 8 s while the chat is open (with it they arrive instantly)
  useEffect(() => { const t = setInterval(() => !liveUp() && syncNow(), 8000); return () => clearInterval(t); }, [syncNow]);
  useEffect(() => { if (syncCfg.url) cloudConfig(syncCfg).then((c) => setSmsReady(!!c.sms)).catch(() => {}); }, [syncCfg]);
  useEffect(() => { setReplyTo(null); setEditing(null); setFind(null); setStarredOnly(false); }, [conv]);

  const marks = useMemo(() => {
    const by = new Map();
    for (const k of db.chatMarks || []) { if (!by.has(k.msgId)) by.set(k.msgId, []); by.get(k.msgId).push(k); }
    return by;
  }, [db.chatMarks]);
  const myMark = (m) => (marks.get(m.id) || []).find((k) => k.userId === user.id);
  const pins = useMemo(() => (db.chatPins || []).filter((p) => p.conv === conv).sort((a, b) => String(b.at).localeCompare(String(a.at))), [db.chatPins, conv]);
  const all = useMemo(() => db.messages.filter((m) => m.conv === conv && !hidden.has(m.id)).sort((a, b) => a.date.localeCompare(b.date)), [db.messages, conv, hidden]);
  const messages = useMemo(() => {
    let list = all;
    if (starredOnly) list = list.filter((m) => myMark(m)?.star);
    if (find) { const f = find.toLowerCase(); list = list.filter((m) => messagePreview(m).toLowerCase().includes(f) || String(m.fromName).toLowerCase().includes(f)); }
    return list;
  }, [all, starredOnly, find, marks]); // eslint-disable-line react-hooks/exhaustive-deps

  // read receipts: my own "read up to" mark per conversation, shared so colleagues see the blue ticks
  useEffect(() => {
    const last = all[all.length - 1]?.date;
    if (atBottom) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    if (last && (read[conv] || '') < last) {
      const r = { ...getRead(), [conv]: last };
      try { localStorage.setItem(READ_KEY, JSON.stringify(r)); } catch {}
      setRead(r);
      if (!conv.startsWith('client:')) update((d) => { put(d, 'chatReads', { id: conv + ':' + user.id, conv, userId: user.id, at: last }); });
    }
  }, [all, conv]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); setAtBottom(true); }, [conv]);

  const unread = (c) => db.messages.filter((m) => m.conv === c && m.fromId !== user.id && !m.deleted && m.date > (read[c] || '')).length;
  const staff = db.users.filter((u) => u.id !== user.id && !u.disabled);
  const customers = db.customers.filter((c) => c.id !== 'walk-in' && (!q || `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 100);
  const client = conv.startsWith('client:') ? db.customers.find((c) => c.id === conv.slice(7)) : null;
  const phone = normalizePhone(client?.whatsapp || client?.phone || '');
  const peer = conv.startsWith('dm:') ? db.users.find((u) => conv.includes(u.id) && u.id !== user.id) : null;
  const readers = (db.chatReads || []).filter((r) => r.conv === conv && r.userId !== user.id);
  const seenBy = (m) => readers.filter((r) => r.at >= m.date);
  const lastOf = (c) => db.messages.filter((m) => m.conv === c).reduce((a, m) => (!a || m.date > a.date ? m : a), null);

  const log = (msg, c = conv) => { const r = { id: uid(), date: now(), fromId: user.id, fromName: user.name, conv: c, branchId, ...msg }; update((d) => { put(d, 'messages', r); }); setTimeout(syncNow, 300); return r; };
  const quote = (m) => (m ? { id: m.id, fromName: m.fromId === user.id ? 'You' : m.fromName, text: messagePreview(m).slice(0, 140) } : undefined);
  const sendTeam = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (editing) {
      update((d) => { const m = d.messages.find((x) => x.id === editing.id); if (m) put(d, 'messages', { ...m, text: t, editedAt: now() }); });
      setEditing(null); setText(''); setTimeout(syncNow, 300); return;
    }
    log({ text: t, channel: 'team', ...(replyTo ? { replyTo: quote(replyTo) } : {}) });
    setText(''); setReplyTo(null); setAtBottom(true);
  };
  // Photos, PDFs, videos, audio, spreadsheets and voice notes (team & direct messages)
  const [uploading, setUploading] = useState(null);
  const [recording, setRecording] = useState(false);
  const sendFiles = async (files, extra = {}) => {
    for (const f of files) {
      try {
        setUploading({ name: extra.name || f.name, p: 0 });
        const a = await uploadAttachment(syncCfg, f, extra.name || f.name, (p) => setUploading({ name: extra.name || f.name, p }));
        log({ text: text.trim() || (extra.voice ? 'Voice note' : ''), channel: 'team', attachment: { ...a, ...extra }, ...(replyTo ? { replyTo: quote(replyTo) } : {}) });
        setText(''); setReplyTo(null);
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

  // ---- message actions ----
  const mark = (m, patch) => update((d) => {
    const id = m.id + ':' + user.id;
    const old = (d.chatMarks || []).find((k) => k.id === id) || { id, msgId: m.id, userId: user.id, userName: user.name, conv: m.conv };
    const next = { ...old, ...patch };
    if (!next.emoji && !next.star) { if (d.chatMarks.some((k) => k.id === id)) del(d, 'chatMarks', id); } else put(d, 'chatMarks', next);
  });
  const react = (m, emoji) => { mark(m, { emoji: myMark(m)?.emoji === emoji ? '' : emoji }); setMenu(null); };
  const star = (m) => { const on = !myMark(m)?.star; mark(m, { star: on }); toast(on ? 'Starred. Find it under ☆ at the top' : 'Star removed', 'info'); };
  const pinned = (m) => pins.some((p) => p.msgId === m.id);
  const pin = (m) => update((d) => {
    const id = m.conv + ':' + m.id;
    if (d.chatPins.some((p) => p.id === id)) del(d, 'chatPins', id);
    else put(d, 'chatPins', { id, conv: m.conv, msgId: m.id, by: user.name, at: now() });
  });
  const copy = async (m) => { try { await navigator.clipboard.writeText(m.text || messagePreview(m)); toast('Copied', 'info'); } catch { toast('Copying is blocked on this device', 'warn'); } };
  const removeForMe = (m) => { const h = new Set(getHidden()); h.add(m.id); try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...h])); } catch {} setHidden(h); };
  const remove = async (m) => {
    const mine = m.fromId === user.id && !m.call;
    if (mine && age(m) < UNSEND_HOURS && !m.deleted) {
      const forAll = await ask({ title: 'Delete message?', message: 'Delete it for everyone, or only hide it on this device?', confirmText: 'Delete for everyone', danger: true });
      if (forAll) { update((d) => { const x = d.messages.find((y) => y.id === m.id); if (x) { const { attachment, replyTo: _r, ...rest } = x; put(d, 'messages', { ...rest, text: '', deleted: true, deletedAt: now() }); } }); setTimeout(syncNow, 300); return; } // eslint-disable-line no-unused-vars
      if (forAll === false && await ask({ title: 'Delete just for you?', message: 'Others will still see it.', confirmText: 'Delete for me' })) removeForMe(m);
      return;
    }
    if (await ask({ title: 'Delete for you?', message: 'It disappears from this device only. Others will still see it.', confirmText: 'Delete for me', danger: true })) removeForMe(m);
  };
  const startEdit = (m) => { setEditing(m); setReplyTo(null); setText(m.text || ''); setTimeout(() => inputRef.current?.focus(), 30); };
  const startReply = (m) => { setReplyTo(m); setEditing(null); setTimeout(() => inputRef.current?.focus(), 30); };
  const jumpTo = (id) => {
    setFind(null); setStarredOnly(false);
    setTimeout(() => { document.getElementById('msg-' + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); setFlash(id); setTimeout(() => setFlash(''), 1600); }, 60);
  };
  const forward = (targets) => {
    const m = forwarding;
    for (const c of targets) log({ text: m.text, channel: 'team', forwarded: true, ...(m.attachment ? { attachment: m.attachment } : {}) }, c);
    setForwarding(null);
    toast(`Forwarded to ${targets.length} chat${targets.length > 1 ? 's' : ''}`, 'success');
  };
  const openMenu = (m, e) => {
    const r = (e.currentTarget.closest('.bubble') || e.currentTarget).getBoundingClientRect();
    setMenu({ m, x: Math.min(window.innerWidth - 230, Math.max(8, m.fromId === user.id ? r.right - 220 : r.left)), y: Math.min(window.innerHeight - 380, r.bottom + 4) });
  };

  const title = conv === 'team' ? 'General' : peer ? peer.name : client?.name || 'Direct message';
  const subtitle = conv === 'team' ? staff.length ? `${staff.length + 1} people · the whole team sees this` : 'Just you so far · add colleagues under Users & Roles' : peer ? (peer.role || 'Colleague') : client ? (client.phone || client.whatsapp || 'No phone number saved') : '';
  const avatar = (name, small) => <span className={'chat-avatar' + (small ? ' sm' : '')}>{String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>;
  const convRow = ({ id, name, icon, extra }) => {
    const last = lastOf(id), n = unread(id);
    return (
      <div key={id} role="button" tabIndex={0} className={'chat-conv' + (conv === id ? ' active' : '')} onClick={() => openConv(id)} onKeyDown={(e) => e.key === 'Enter' && openConv(id)}>
        {icon || avatar(name)}
        <span className="grow conv-text"><b>{name}</b><small className="muted">{last ? (last.fromId === user.id ? 'You: ' : '') + messagePreview(last).slice(0, 48) : 'No messages yet'}</small></span>
        <span className="conv-side">{last && <small className="muted">{new Date(last.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>}{n > 0 && <span className="count">{n}</span>}</span>
        {extra}
      </div>
    );
  };

  let lastDay = '';
  return (
    <div className="page chat-page">
      <div className="page-head"><div><h1>Chat</h1><div className="sub">Team messages sync to every device. Messages to clients go out on WhatsApp or SMS.</div></div></div>
      <div className={'chat' + (opened ? ' opened' : '')}>
        <aside className="chat-list card">
          <Tabs tabs={[['team', 'Team'], ...(can('customers') ? [['clients', 'Clients']] : [])]} value={tab} onChange={(t) => { setTab(t); setConv(t === 'team' ? 'team' : conv); }} />
          {tab === 'team' ? (
            <div className="chat-convs">
              {convRow({ id: 'team', name: 'General', icon: <span className="chat-avatar group"><Hash size={16} /></span> })}
              {staff.length > 0 && <div className="nav-title">Private chats</div>}
              {staff.map((u) => convRow({ id: dmId(user.id, u.id), name: u.name, extra: <CallMenu compact person={{ ...u, staff: true }} /> }))}
              {!staff.length && <p className="muted small">Add your colleagues under Users &amp; Roles and you can message them here.</p>}
            </div>
          ) : (
            <div className="chat-convs">
              <div className="search-wrap"><Search size={16} /><input className="search" placeholder="Find a client…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              {customers.map((c) => (
                <button key={c.id} className={'chat-conv' + (conv === 'client:' + c.id ? ' active' : '')} onClick={() => openConv('client:' + c.id)}><UsersIcon size={16} /><span className="grow">{c.name}<br /><small className="muted">{c.phone || 'no phone'}</small></span></button>
              ))}
              {!customers.length && <p className="muted small">No clients yet. They show up here once you add them in Customers or at the till.</p>}
            </div>
          )}
        </aside>
        <section className="chat-main card">
          <div className="chat-head">
            <button className="icon-btn chat-back" aria-label="Back to chats" onClick={() => setOpened(false)}><ChevronLeft size={20} /></button>
            {client ? <UsersIcon size={18} /> : conv === 'team' ? <span className="chat-avatar group sm"><Hash size={14} /></span> : avatar(title, true)}
            <div className="grow chat-title"><strong>{title}</strong><small className="muted">{subtitle}</small></div>
            {!client && <button className={'icon-btn' + (find !== null ? ' on' : '')} title="Search this chat" onClick={() => setFind(find === null ? '' : null)}><Search size={17} /></button>}
            <button className={'icon-btn' + (starredOnly ? ' on' : '')} title="Starred messages" onClick={() => setStarredOnly((v) => !v)}><Star size={17} /></button>
            {client && <CallMenu person={client} />}
            {peer && <CallMenu person={{ ...peer, staff: true }} />}
          </div>
          {find !== null && <div className="chat-find"><Search size={15} /><input autoFocus placeholder="Search messages…" value={find} onChange={(e) => setFind(e.target.value)} /><span className="muted small">{find ? `${messages.length} found` : ''}</span><button className="icon-btn sm" onClick={() => setFind(null)} aria-label="Close search"><X size={15} /></button></div>}
          {pins.length > 0 && !find && (() => { const pm = db.messages.find((m) => m.id === pins[0].msgId); return pm ? (
            <button className="chat-pinned" onClick={() => jumpTo(pm.id)}><Pin size={14} /><span className="grow"><b>{pins.length > 1 ? `${pins.length} pinned` : 'Pinned'}</b> · {messagePreview(pm).slice(0, 90)}</span><small className="muted">by {pins[0].by}</small></button>
          ) : null; })()}
          <div className="chat-messages" ref={listRef} onScroll={(e) => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }}>
            {messages.map((m) => {
              const mine = m.fromId === user.id;
              const day = dayLabel(m.date);
              const sep = day !== lastDay ? (lastDay = day, <div key={'d' + m.id} className="chat-day"><span>{day}</span></div>) : null;
              if (m.call) {
                const missed = m.call.status !== 'done';
                return [sep, (
                  <div key={m.id} id={'msg-' + m.id} className={'chat-call' + (missed && !mine ? ' missed' : '')}>
                    {missed && !mine ? <PhoneMissed size={15} /> : mine ? <PhoneOutgoing size={15} /> : <Phone size={15} />}
                    <span>{mine ? (missed ? 'You called · no answer' : callText(m.call)) : callText(m.call)}</span>
                    <small className="muted">{new Date(m.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                    {peer && <button className="link-btn small" onClick={() => startCall({ id: peer.id, name: peer.name })}>Call back</button>}
                  </div>
                )];
              }
              const ms = marks.get(m.id) || [];
              const reacts = ms.filter((k) => k.emoji);
              const groups = [...new Set(reacts.map((k) => k.emoji))];
              const seen = mine && !client ? seenBy(m) : [];
              const allSeen = conv === 'team' ? seen.length && seen.length >= staff.length : seen.length > 0;
              return [sep, (
                <Bubble key={m.id} m={m} mine={mine} flash={flash === m.id} onMenu={(e) => openMenu(m, e)} onSwipeReply={() => !m.deleted && startReply(m)}
                  className={(m.channel && m.channel !== 'team' ? ' ' + m.channel : '') + (m.deleted ? ' deleted' : '') + (reacts.length ? ' has-react' : '')}>
                  {!mine && !peer && <div className="bubble-from">{m.fromName}</div>}
                  {m.forwarded && !m.deleted && <div className="bubble-fwd"><Forward size={12} />Forwarded</div>}
                  {m.replyTo && !m.deleted && <button className="bubble-quote" onClick={() => jumpTo(m.replyTo.id)}><b>{m.replyTo.fromName}</b><span>{m.replyTo.text}</span></button>}
                  {m.deleted ? <div className="muted"><Trash2 size={13} /> {mine ? 'You deleted this message' : 'This message was deleted'}</div> : <>
                    {m.attachment && <Attachment a={m.attachment} base={syncCfg.url} />}
                    {m.text && !(m.attachment?.voice && m.text === 'Voice note') && <div className="bubble-text">{find ? highlight(m.text, find) : m.text}</div>}
                  </>}
                  <div className="bubble-meta">
                    {myMark(m)?.star && <Star size={11} className="star-on" />}
                    {pinned(m) && <Pin size={11} />}
                    {m.channel === 'whatsapp' ? 'WhatsApp · ' : m.channel === 'sms' ? 'SMS · ' : m.channel === 'reply' ? 'client reply · ' : ''}{mine && client ? `by ${m.fromName} · ` : ''}
                    {m.editedAt && !m.deleted && 'edited · '}{new Date(m.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {mine && !client && !m.deleted && (allSeen ? <CheckCheck size={14} className="tick read" aria-label="Read" /> : seen.length ? <CheckCheck size={14} className="tick" aria-label="Read by some" /> : <Check size={14} className="tick" aria-label="Sent" />)}
                  </div>
                  {groups.length > 0 && <button className="bubble-reacts" onClick={(e) => { e.stopPropagation(); setInfoFor(m); }} title={reacts.map((k) => `${k.userName || 'Someone'} ${k.emoji}`).join(', ')}>{groups.join('')}{reacts.length > 1 && <small>{reacts.length}</small>}</button>}
                </Bubble>
              )];
            })}
            {!messages.length && (find || starredOnly ? <Empty icon={find ? Search : Star}>{find ? 'Nothing matches that search' : 'No starred messages here yet. Open a message’s menu and tap Star to keep it handy.'}</Empty> : <Empty icon={MessageCircle}>{client ? 'No messages with this client yet' : peer ? `Say hi to ${peer.name.split(' ')[0]}` : 'Nothing here yet. Start the conversation.'}</Empty>)}
          </div>
          {!atBottom && <button className="chat-down" onClick={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })} aria-label="Go to the newest message"><ChevronDown size={18} /></button>}
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
              {(replyTo || editing) && (
                <div className={'compose-ctx' + (editing ? ' edit' : '')}>
                  {editing ? <Pencil size={15} /> : <Reply size={15} />}
                  <span className="grow"><b>{editing ? 'Editing' : `Replying to ${replyTo.fromId === user.id ? 'yourself' : replyTo.fromName}`}</b><small>{messagePreview(editing || replyTo).slice(0, 120)}</small></span>
                  <button className="icon-btn sm" aria-label="Cancel" onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(''); } }}><X size={15} /></button>
                </div>
              )}
              {recording ? (
                <VoiceRecorder onCancel={(msg) => { setRecording(false); if (msg) toast(msg, 'warn'); }}
                  onSend={(blob, secs) => { setRecording(false); const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'; sendFiles([blob], { name: `voice-note-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.${ext}`, voice: true, duration: secs }); }} />
              ) : (
                <form className="chat-compose row gap" onSubmit={sendTeam}>
                  {!editing && <label className="icon-btn" title="Attach a photo, PDF, video, audio or spreadsheet (up to 15 MB)"><Paperclip size={18} />
                    <input type="file" hidden multiple accept={ATTACH_ACCEPT} onChange={(e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) sendFiles(fs); }} /></label>}
                  <textarea ref={inputRef} rows={1} className="grow chat-input" placeholder={editing ? 'Edit your message' : peer ? `Message ${peer.name.split(' ')[0]}` : 'Message the team'} value={text}
                    onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTeam(e); } if (e.key === 'Escape') { setReplyTo(null); if (editing) { setEditing(null); setText(''); } } }}
                    onPaste={(e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length && !editing) { e.preventDefault(); sendFiles(fs); } }} />
                  {text.trim() || editing ? <button className="btn primary send-btn" aria-label={editing ? 'Save' : 'Send'}>{editing ? <Check size={17} /> : <Send size={17} />}</button>
                    : <button type="button" className="btn primary send-btn" title="Hold a voice note" aria-label="Record a voice note" disabled={!!uploading || !navigator.mediaDevices?.getUserMedia} onClick={() => setRecording(true)}><Mic size={17} /></button>}
                </form>
              )}
            </>
          )}
          {!syncCfg.url && <small className="muted">This device isn't connected to the cloud yet, so team messages stay on this device.</small>}
        </section>
      </div>
      {menu && (() => {
        const m = menu.m, mine = m.fromId === user.id, isClient = conv.startsWith('client:');
        const act = (fn) => () => { setMenu(null); fn(); };
        return (
          <div className="msg-menu-bg" onPointerDown={(e) => e.target === e.currentTarget && setMenu(null)}>
            <div className="msg-menu" style={{ left: menu.x, top: Math.max(8, menu.y) }} role="menu">
              {!m.deleted && !isClient && <div className="msg-reacts">{REACTIONS.map((r) => <button key={r} className={myMark(m)?.emoji === r ? 'on' : ''} onClick={() => react(m, r)} aria-label={'React ' + r}>{r}</button>)}<SmilePlus size={16} className="muted" /></div>}
              {!m.deleted && !isClient && <button onClick={act(() => startReply(m))}><Reply size={16} />Reply</button>}
              {!m.deleted && m.text && <button onClick={act(() => copy(m))}><Copy size={16} />Copy</button>}
              {!m.deleted && !isClient && <button onClick={act(() => setForwarding(m))}><Forward size={16} />Forward</button>}
              {!m.deleted && <button onClick={act(() => pin(m))}>{pinned(m) ? <><PinOff size={16} />Unpin</> : <><Pin size={16} />Pin</>}</button>}
              {!m.deleted && <button onClick={act(() => star(m))}><Star size={16} />{myMark(m)?.star ? 'Unstar' : 'Star'}</button>}
              {mine && !m.deleted && m.text && !m.attachment && !isClient && age(m) < EDIT_HOURS && <button onClick={act(() => startEdit(m))}><Pencil size={16} />Edit</button>}
              {!isClient && <button onClick={act(() => setInfoFor(m))}><Info size={16} />Info</button>}
              <button className="danger" onClick={act(() => remove(m))}><Trash2 size={16} />Delete</button>
            </div>
          </div>
        );
      })()}
      {forwarding && <ForwardModal m={forwarding} staff={staff} me={user} onClose={() => setForwarding(null)} onSend={forward} />}
      {infoFor && (
        <Modal title="Message info" onClose={() => setInfoFor(null)}>
          <p className="muted small">{messagePreview(infoFor).slice(0, 200)}</p>
          <p className="small">Sent {new Date(infoFor.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} by {infoFor.fromName}{infoFor.editedAt ? ` · edited ${new Date(infoFor.editedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : ''}</p>
          {infoFor.fromId === user.id && <><h4><CheckCheck size={15} className="tick read" /> Read by</h4><ul className="info-list">{seenBy(infoFor).map((r) => <li key={r.id}>{db.users.find((u) => u.id === r.userId)?.name || 'Colleague'}</li>)}{!seenBy(infoFor).length && <li className="muted">Nobody yet</li>}</ul></>}
          {(marks.get(infoFor.id) || []).some((k) => k.emoji) && <><h4>Reactions</h4><ul className="info-list">{(marks.get(infoFor.id) || []).filter((k) => k.emoji).map((k) => <li key={k.id}>{k.emoji} {k.userId === user.id ? 'You' : k.userName}</li>)}</ul></>}
        </Modal>
      )}
    </div>
  );
}

const highlight = (text, f) => {
  const i = text.toLowerCase().indexOf(f.toLowerCase());
  if (!f || i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + f.length)}</mark>{text.slice(i + f.length)}</>;
};

/** A message bubble: menu button on hover (mouse), long-press for the menu and swipe right to reply (touch) */
function Bubble({ m, mine, flash, className, onMenu, onSwipeReply, children }) {
  const [dx, setDx] = useState(0);
  const t = useRef(null);
  const down = (e) => {
    if (e.pointerType !== 'touch') return;
    const start = { x: e.clientX, y: e.clientY, target: e.currentTarget };
    t.current = { ...start, timer: setTimeout(() => { navigator.vibrate?.(15); onMenu({ currentTarget: start.target }); t.current = null; }, 480) };
  };
  const move = (e) => {
    const s = t.current; if (!s) return;
    const x = e.clientX - s.x, y = e.clientY - s.y;
    if (Math.abs(x) > 8 || Math.abs(y) > 8) clearTimeout(s.timer);
    if (Math.abs(y) > 24) { t.current = null; setDx(0); return; }
    if (x > 0) setDx(Math.min(80, x));
  };
  const up = () => { const s = t.current; if (s) clearTimeout(s.timer); if (dx > 56) { navigator.vibrate?.(10); onSwipeReply(); } setDx(0); t.current = null; };
  return (
    <div id={'msg-' + m.id} className={'bubble ' + (mine ? 'mine' : 'theirs') + className + (flash ? ' flash' : '')} style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => { e.preventDefault(); onMenu(e); }}>
      {dx > 20 && <span className="swipe-reply" style={{ opacity: dx / 70 }}><Reply size={16} /></span>}
      <button className="bubble-more" aria-label="Message options" onClick={(e) => { e.stopPropagation(); onMenu(e); }}><MoreVertical size={15} /></button>
      {children}
    </div>
  );
}

function ForwardModal({ m, staff, me, onClose, onSend }) {
  const [pick, setPick] = useState([]);
  const opts = [['team', 'General (whole team)'], ...staff.map((u) => [dmId(me.id, u.id), u.name])];
  const toggle = (id) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Modal title="Forward to…" onClose={onClose}>
      <p className="muted small fwd-preview">{messagePreview(m).slice(0, 160)}</p>
      <div className="fwd-list">{opts.map(([id, name]) => <label key={id} className={'fwd-row' + (pick.includes(id) ? ' on' : '')}><input type="checkbox" checked={pick.includes(id)} onChange={() => toggle(id)} />{id === 'team' ? <Hash size={16} /> : <UserIcon size={16} />}<span>{name}</span></label>)}</div>
      <div className="form-actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!pick.length} onClick={() => onSend(pick)}><Forward size={16} />Forward{pick.length > 1 ? ` to ${pick.length}` : ''}</button></div>
    </Modal>
  );
}
