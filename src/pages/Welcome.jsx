// The public front page of rxposug.com (27 Nov 2026, the owner's pick from the SmarterPOS review): what RxPOS does for
// a pharmacy, how a pharmacy starts, common questions, and a "Talk to us" form that emails the owner
// (worker/index.js contactRequest). Shown on the web only, at the site's home address, to someone not signed in;
// "Sign in" opens the usual sign-in (#/sign-in). A pharmacy's own address (rxposug.com/<pharmacy>) and the apps go
// straight to sign-in as before. The words are RxPOS's own; nothing here holds or sends pharmacy data.
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, ShieldCheck, Smartphone, WifiOff, ClipboardCheck, ShoppingBag, Building2, BarChart3, Sparkles, Send, CheckCircle2, LogIn, MessageCircle } from 'lucide-react';
import { Logo } from '../logo.jsx';
import AppDownloads from '../components/AppDownloads.jsx';
import Learn, { LEARN_PAGES } from './Learn.jsx';
import { cloudUrl } from '../cloud.js';
import { isWeb, pharmacySlugFromUrl } from '../platform.js';

/** The front page shows on the live site's home address only (tests and other hosts keep opening on sign-in, unless
 *  a test sets this tab's flag) */
export function showsWelcome(loc = typeof location === 'undefined' ? null : location, flag = () => { try { return sessionStorage.getItem('rxpos-test-welcome') === '1'; } catch { return false; } }) {
  if (!isWeb || !loc) return false;
  if (pharmacySlugFromUrl()) return false;
  const home = /^(www\.)?rxposug\.com$/.test(loc.hostname) || flag();
  return home && (loc.hash === '' || loc.hash === '#' || loc.hash === '#/' || loc.hash.startsWith('#/learn'));
}

export const FEATURES = [
  [CalendarClock, 'First to expire, first to sell', 'Every delivery is a batch with its own expiry. The till sells the oldest batch first, blocks expired stock unless the pharmacist confirms why, and the dashboard lists what to sell first.'],
  [ShieldCheck, 'Controlled drugs, recorded at the counter', 'Patient, prescriber and prescription are written in the register as part of the sale, with running balances, ready for an inspection.'],
  [Smartphone, 'MTN MoMo and Airtel Money', 'Send the payment request to the customer\'s phone from the till. Cash, card, bank, insurance, credit and split payments too.'],
  [WifiOff, 'Keeps selling when the internet drops', 'The Windows and Android apps keep the whole pharmacy on the device. Changes go up within seconds once the connection is back, and the top bar always shows where things stand.'],
  [ClipboardCheck, 'Stock that matches the shelf', 'Full or blind stock counts, by shelf or by scan, several people at once. Losses need a reason and, above your limit, a manager\'s approval.'],
  [ShoppingBag, 'Reorder from real demand', 'Suggestions from what really sold, plus what customers asked for while it was out of stock. Purchase orders go to the cheapest supplier, by print or WhatsApp.'],
  [Building2, 'Every branch in one place', 'Stock per branch, transfers that are received and checked, and an owner\'s view of all branches with a summary email every evening.'],
  [Sparkles, 'Suggestions, never surprises', 'RxPOS can suggest medicine names, invoice matches and reorder levels, but a person approves every change before it is saved.'],
];

const STEPS = [
  ['Tell us about your pharmacy', 'How many branches and counters you have, and what you use today: books, Excel or another system.'],
  ['Your medicines, loaded for you', 'Start from the 9,700-item Ugandan catalog or import your own Excel list, with prices, batches and expiry dates.'],
  ['Start selling the same day', 'Install the app on the counter PCs or Android phones, add your staff with their roles, and sell. Your team is shown how.'],
];

export const FAQ = [
  ['Does it work without the internet?', 'Yes, in the Windows and Android apps. They keep the pharmacy on the device and keep selling, receiving stock and counting offline; changes go up automatically when the connection returns. The web version is online only and keeps nothing on the computer, which suits a shared or office computer.'],
  ['Is RxPOS only for pharmacies?', 'Yes. Batches and expiry, the controlled drugs register, prescriptions, refill reminders, insurance and drug information are built in rather than added on.'],
  ['Does RxPOS make us NDA compliant?', 'It keeps the records an inspection looks at (purchases with batch and expiry, sales and dispensing, the controlled drugs register, write-offs and transfers) as part of normal work. Meeting the rules is still the licence holder\'s job.'],
  ['What happens if two counters sell the last pack while offline?', 'Both sales are kept. When the devices sync, the batch shows below zero and the dashboard asks a manager to count it, so the shortfall is never hidden.'],
  ['Can we move from Excel or another system?', 'Yes. Import your medicine list from Excel or CSV with column matching, or start from the built-in catalog, and bring your customers and suppliers across.'],
  ['What do we need?', 'A Windows PC or an Android phone or tablet. A barcode scanner and a receipt printer help but are not required; scanning with the phone camera works too.'],
  ['Who can see our data?', 'Your staff, with what their role allows. You can export your sales, stock and reports to Excel or CSV at any time.'],
  ['How do we get help?', 'Use the form below or the button on this page. Each device can also send a private error report to us, without personal data.'],
];

export default function Welcome({ onSignIn, page = '' }) {
  const [form, setForm] = useState({ name: '', pharmacy: '', phone: '', email: '', town: '', branches: '', message: '', website: '' });
  const [state, setState] = useState({ busy: false, sent: false, error: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const send = async (e) => {
    e.preventDefault();
    setState({ busy: true, sent: false, error: '' });
    try {
      const r = await fetch(String(cloudUrl()).replace(/\/+$/, '') + '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Your message could not be sent just now. Please try again.');
      setState({ busy: false, sent: true, error: '' });
    } catch (err) {
      setState({ busy: false, sent: false, error: err.message === 'Failed to fetch' ? 'No internet connection. Please try again when you are online.' : err.message });
    }
  };
  // on a #/learn page, the front page's links go back to the front page first
  const go = (id) => (e) => { e.preventDefault(); if (page) { location.hash = ''; setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 60); } else document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  useEffect(() => { if (page && !/^guide\/\d/.test(page)) window.scrollTo(0, 0); }, [page]);
  return (
    <div className="front-page">
      <header className="wl-top">
        <a className="brand" href="#/" onClick={go('wl-hero')}><Logo size={30} /> <span className="wordmark">Rx<span className="brand-accent">POS</span></span></a>
        <nav aria-label="Front page">
          <a href="#wl-features" onClick={go('wl-features')}>Features</a>
          <a href="#wl-start" onClick={go('wl-start')}>Getting started</a>
          <a href="#wl-faq" onClick={go('wl-faq')}>Questions</a>
          <a href="#/learn/guide">Help guide</a>
          <a href="#/learn/articles">Articles</a>
          <a href="#wl-contact" onClick={go('wl-contact')}>Talk to us</a>
        </nav>
        <button type="button" className="btn primary sm" onClick={onSignIn}><LogIn size={16} />Sign in</button>
      </header>

      {page ? <main><Learn page={page} key={page} /></main> : <main>
        <section className="wl-hero" id="wl-hero">
          <p className="wl-kicker">Pharmacy point of sale for Uganda</p>
          <h1>Safe dispensing, honest stock, clear money. <em>In every branch.</em></h1>
          <p className="wl-lead">RxPOS runs the counter, the shelves and the books of a pharmacy: batches and expiry, the controlled drugs register, MTN MoMo and Airtel Money, and every branch in one view. It keeps selling when the internet drops.</p>
          <div className="wl-cta">
            <a className="btn primary" href="#wl-contact" onClick={go('wl-contact')}><MessageCircle size={17} />Talk to us</a>
            <button type="button" className="btn ghost" onClick={onSignIn}>Sign in to your pharmacy <ArrowRight size={16} /></button>
          </div>
          <ul className="wl-proof" aria-label="At a glance">
            <li><strong>9,700</strong> medicines ready to load</li>
            <li><strong>Seconds</strong> to sync after a change</li>
            <li><strong>Windows, Android</strong> and the web</li>
          </ul>
        </section>

        <section className="wl-section" id="wl-features" aria-labelledby="wl-f-title">
          <h2 id="wl-f-title">Built for the way a pharmacy works</h2>
          <div className="wl-grid">
            {FEATURES.map(([Icon, title, text]) => (
              <article key={title} className="wl-card"><Icon size={22} aria-hidden="true" /><h3>{title}</h3><p>{text}</p></article>
            ))}
          </div>
          <p className="wl-more"><BarChart3 size={16} aria-hidden="true" /> <span><a href="#/learn/features">See everything RxPOS does</a>. Also: proformas and wholesale, refunds back into the same batches, customers with allergies and insurance, refill and debt reminders by WhatsApp or SMS, expenses and banks, payroll, a fridge temperature log, team chat, and reports that export to Excel.</span></p>
        </section>

        <section className="wl-section" id="wl-start" aria-labelledby="wl-s-title">
          <h2 id="wl-s-title">Getting started</h2>
          <p className="muted">Moving from books, Excel or another system? <a href="#/learn/moving">Here is how it works</a>.</p>
          <ol className="wl-steps">
            {STEPS.map(([title, text]) => <li key={title}><h3>{title}</h3><p>{text}</p></li>)}
          </ol>
        </section>

        <section className="wl-section wl-apps" aria-label="Download the apps">
          <AppDownloads />
        </section>

        <section className="wl-section" id="wl-faq" aria-labelledby="wl-q-title">
          <h2 id="wl-q-title">Questions pharmacies ask</h2>
          <div className="wl-faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </section>

        <section className="wl-section" id="wl-contact" aria-labelledby="wl-c-title">
          <h2 id="wl-c-title">Talk to us</h2>
          <p className="muted">Tell us about your pharmacy and we will call or WhatsApp you to show RxPOS and answer your questions.</p>
          {state.sent ? (
            <div className="notice wl-sent" role="status"><CheckCircle2 size={18} /> Thank you. Your message is with us and we will be in touch soon.</div>
          ) : (
            <form className="wl-form" onSubmit={send}>
              <label className="field"><span>Your name</span><input value={form.name} onChange={set('name')} required minLength={2} maxLength={80} autoComplete="name" /></label>
              <label className="field"><span>Pharmacy</span><input value={form.pharmacy} onChange={set('pharmacy')} required minLength={2} maxLength={120} autoComplete="organization" /></label>
              <label className="field"><span>Phone or WhatsApp</span><input type="tel" value={form.phone} onChange={set('phone')} required pattern="\+?[\d\s\-]{9,16}" placeholder="07XX XXX XXX" autoComplete="tel" /></label>
              <label className="field"><span>Email (optional)</span><input type="email" value={form.email} onChange={set('email')} maxLength={120} autoComplete="email" /></label>
              <label className="field"><span>Town</span><input value={form.town} onChange={set('town')} maxLength={60} autoComplete="address-level2" /></label>
              <label className="field"><span>Branches</span><select value={form.branches} onChange={set('branches')}><option value="">Choose</option><option>1</option><option>2–3</option><option>4–10</option><option>More than 10</option></select></label>
              <label className="field wl-wide"><span>Anything we should know? (optional)</span><textarea rows={3} value={form.message} onChange={set('message')} maxLength={1500} /></label>
              <label className="wl-trap" aria-hidden="true">Leave this empty<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
              {state.error && <div className="error wl-wide" role="alert">{state.error}</div>}
              <div className="wl-wide"><button className="btn primary" disabled={state.busy}><Send size={16} />{state.busy ? 'Sending…' : 'Send'}</button>
                <small className="muted"> We use these details only to contact you about RxPOS.</small></div>
            </form>
          )}
        </section>
      </main>}

      <footer className="wl-foot">
        <nav aria-label="More about RxPOS" className="wl-foot-links">{LEARN_PAGES.map(([k, label]) => <a key={k} href={`#/learn/${k}`}>{label}</a>)}</nav>
        <span>© {new Date().getFullYear()} RxPOS · Pharmacy point of sale, made in Uganda</span>
        <button type="button" className="link-btn" onClick={onSignIn}>Sign in</button>
      </footer>
    </div>
  );
}
