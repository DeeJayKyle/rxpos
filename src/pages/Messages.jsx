import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, MessageSquareText, Plus, Trash2, Save, ChevronRight, Users, HeartPulse, Phone } from 'lucide-react';
import { useStore, fillTemplate, normalizePhone, put, uid, now, audit, customerBalance, today } from '../store.jsx';
import { Empty, Tabs } from '../ui.jsx';
import { toast, ask } from '../feedback.jsx';
import { cloudConfig, sendSms, whatsappLink } from '../cloud.js';
import { greetingMessage } from '../engage.jsx';

const STARTERS = [
  { id: 'tpl-welcome', name: 'Welcome', text: 'Hello {name}, thank you for choosing {pharmacy}. Save this number for medicine questions and refills. Get well soon!' },
  { id: 'tpl-offer', name: 'Special offer', text: 'Hello {name}! This week at {pharmacy}: ask about our offers on vitamins and family care. Visit us or reply on WhatsApp.' },
  { id: 'tpl-holiday', name: 'Opening hours', text: 'Dear {name}, {pharmacy} is open from 8am to 10pm every day, including public holidays. We are here for you.' },
];

/** Admin: own message templates, sent to chosen clients by WhatsApp (one tap each, free) or SMS. */
export default function Messages() {
  const { db, fmt, update, saveSettings, user, branchId, syncCfg, can } = useStore();
  const s = db.settings;
  const templates = s.messageTemplates?.length ? s.messageTemplates : STARTERS;
  const [tab, setTab] = useState('send');
  const [tplId, setTplId] = useState(templates[0]?.id || '');
  const [text, setText] = useState(templates[0]?.text || '');
  const [audience, setAudience] = useState('all');
  const [picked, setPicked] = useState({});
  const [queue, setQueue] = useState(null); // WhatsApp one-by-one
  const [smsReady, setSmsReady] = useState(false);
  const [edit, setEdit] = useState(null);
  useEffect(() => { if (syncCfg.url) cloudConfig(syncCfg).then((c) => setSmsReady(!!c.sms)).catch(() => {}); }, [syncCfg]);

  const chronicIds = useMemo(() => new Set(db.products.filter((p) => p.chronic).map((p) => p.id)), [db.products]);
  const chronicBuyers = useMemo(() => new Set(db.sales.filter((x) => x.items.some((i) => chronicIds.has(i.id))).map((x) => x.customerId)), [db.sales, chronicIds]);
  const withPhone = db.customers.filter((c) => c.id !== 'walk-in' && normalizePhone(c.whatsapp || c.phone || '').length >= 12);
  const groups = {
    all: ['All clients with a phone', withPhone],
    chronic: ['Chronic-medicine patients', withPhone.filter((c) => chronicBuyers.has(c.id) || c.chronic)],
    debtors: ['Clients who owe money', withPhone.filter((c) => customerBalance(db, c.id) > 0)],
    pick: ['Choose clients…', withPhone.filter((c) => picked[c.id])],
  };
  const list = groups[audience][1];
  const vars = (c) => ({ name: c.name.split(' ')[0], pharmacy: s.name, amount: fmt(customerBalance(db, c.id)), date: today(), medicine: '' });
  const log = (c, channel, body) => update((d) => { put(d, 'messages', { id: uid(), date: now(), fromId: user.id, fromName: user.name, conv: 'client:' + c.id, channel, to: c.name, text: body, branchId }); });

  const startWhatsApp = () => { if (!text.trim() || !list.length) return toast('Write a message and choose who gets it', 'warn'); setQueue({ i: 0 }); };
  const sendNext = () => {
    const c = list[queue.i];
    const body = fillTemplate(text, vars(c));
    window.open(whatsappLink(normalizePhone(c.whatsapp || c.phone), body), '_blank');
    log(c, 'whatsapp', body);
    if (queue.i + 1 >= list.length) { setQueue(null); toast(`Done: ${list.length} WhatsApp message${list.length > 1 ? 's' : ''} prepared`); update((d) => audit(d, user, 'Client messages sent (WhatsApp)', `${list.length} clients`, branchId)); }
    else setQueue({ i: queue.i + 1 });
  };
  const sendAllSms = async () => {
    if (!text.trim() || !list.length) return toast('Write a message and choose who gets it', 'warn');
    if (!(await ask({ title: `Send ${list.length} SMS?`, message: 'SMS are charged by your SMS provider (Africa’s Talking).', confirmText: 'Send SMS' }))) return;
    let ok = 0;
    for (const c of list) {
      const body = fillTemplate(text, vars(c));
      try { await sendSms(syncCfg, [normalizePhone(c.phone || c.whatsapp)], body); log(c, 'sms', body); ok++; } catch (e) { toast(`${c.name}: ${e.message}`, 'error'); }
    }
    update((d) => audit(d, user, 'Client messages sent (SMS)', `${ok} of ${list.length}`, branchId));
    toast(`${ok} SMS sent`);
  };
  const saveTemplates = (next) => saveSettings({ ...s, messageTemplates: next });
  const todaysTip = greetingMessage(s, new Date().getHours() < 12 ? 8 : 14).text;

  return (
    <div className="page">
      <div className="page-head"><div><h1>Messages & SMS</h1><div className="sub">Send your clients a note on WhatsApp (free, one tap each) or by SMS</div></div></div>
      <Tabs tabs={[['send', 'Send a message'], ['templates', `Templates (${templates.length})`]]} value={tab} onChange={setTab} />
      {tab === 'send' && (
        <div className="grid2">
          <div className="card stack">
            <h3><MessageCircle size={17} />Message</h3>
            <div className="row gap wrap">
              {templates.map((t) => <button key={t.id} className={'chip' + (tplId === t.id ? ' active' : '')} onClick={() => { setTplId(t.id); setText(t.text); }}>{t.name}</button>)}
              <button className={'chip' + (tplId === 'tip' ? ' active' : '')} onClick={() => { setTplId('tip'); setText(todaysTip); }}><HeartPulse size={13} /> Today's health tip</button>
            </div>
            <textarea rows={6} value={text} onChange={(e) => { setText(e.target.value); setTplId(''); }} placeholder="Write your message. Placeholders: {name} {pharmacy} {amount} {date}" />
            <small className="muted">{text.length} characters · {Math.max(1, Math.ceil(text.length / 160))} SMS each · placeholders: {'{name} {pharmacy} {amount} {date}'}</small>
            {list[0] && <div className="notice small"><b>Preview for {list[0].name}:</b> {fillTemplate(text, vars(list[0]))}</div>}
          </div>
          <div className="card stack">
            <h3><Users size={17} />Who gets it</h3>
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>{Object.entries(groups).map(([k, [label, l]]) => <option key={k} value={k}>{label}{k !== 'pick' ? ` (${l.length})` : ''}</option>)}</select>
            {audience === 'pick' && (
              <div className="pick-list">
                {withPhone.map((c) => <label key={c.id} className="field check"><input type="checkbox" checked={!!picked[c.id]} onChange={(e) => setPicked({ ...picked, [c.id]: e.target.checked })} /><span>{c.name} <small className="muted">{c.phone}</small></span></label>)}
                {!withPhone.length && <Empty>No clients with a phone number yet</Empty>}
              </div>
            )}
            <p className="muted small">{list.length} client{list.length === 1 ? '' : 's'} selected. Only clients with a phone number are listed.</p>
            {queue ? (
              <div className="notice">
                <p>WhatsApp {queue.i + 1} of {list.length}: <b>{list[queue.i].name}</b></p>
                <div className="row gap"><button className="btn primary" onClick={sendNext}><MessageCircle size={16} />Open WhatsApp<ChevronRight size={14} /></button><button className="btn ghost" onClick={() => setQueue(null)}>Stop</button></div>
              </div>
            ) : (
              <div className="row gap wrap">
                <button className="btn primary" onClick={startWhatsApp}><MessageCircle size={16} />Send by WhatsApp</button>
                <button className="btn ghost" disabled={!smsReady} title={smsReady ? '' : 'SMS is not set up for this pharmacy'} onClick={sendAllSms}><MessageSquareText size={16} />Send by SMS</button>
                <a className="btn ghost" href={whatsappLink('', fillTemplate(text, { name: 'there', pharmacy: s.name, amount: '', date: today() }))} target="_blank" rel="noreferrer">Share to a WhatsApp group / status</a>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === 'templates' && (
        <div className="stack">
          {can('settings.manage') && <div className="row gap"><button className="btn primary" onClick={() => setEdit({ id: 'tpl-' + uid(), name: '', text: '', _new: true })}><Plus size={16} />New template</button></div>}
          <div className="branch-grid">
            {templates.map((t) => (
              <div key={t.id} className="card branch-card">
                <h3>{t.name}</h3><p className="muted small">{t.text}</p>
                <div className="row gap">
                  <button className="btn sm ghost" onClick={() => { setTab('send'); setTplId(t.id); setText(t.text); }}>Use</button>
                  {can('settings.manage') && <><button className="btn sm ghost" onClick={() => setEdit(t)}>Edit</button>
                    <button className="btn sm danger" onClick={async () => (await ask({ title: `Delete "${t.name}"?`, danger: true, confirmText: 'Delete' })) && saveTemplates(templates.filter((x) => x.id !== t.id))}><Trash2 size={14} /></button></>}
                </div>
              </div>
            ))}
          </div>
          {edit && (
            <div className="card stack">
              <h3>{edit._new ? 'New template' : 'Edit template'}</h3>
              <label className="field"><span>Name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="field"><span>Message ({'{name} {pharmacy} {amount} {date}'})</span><textarea rows={4} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} /></label>
              <div className="row gap"><button className="btn primary" disabled={!edit.name.trim() || !edit.text.trim()} onClick={() => { const { _new, ...t } = edit; saveTemplates(_new ? [...templates, t] : templates.map((x) => (x.id === t.id ? t : x))); setEdit(null); toast('Template saved'); }}><Save size={16} />Save</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
            </div>
          )}
        </div>
      )}
      <p className="muted small"><Phone size={12} /> To call a client, use the phone button next to them in Customers or Chat.</p>
    </div>
  );
}
