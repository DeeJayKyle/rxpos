// The customer display (UI batch 3, 2026-11-18): a second window or screen facing the client, opened from the till
// ("Customer display"). It shows the sale as the cashier builds it: the items, the total, what was paid and the
// change, in large text with the pharmacy's name and logo. It only listens: it needs no sign-in, holds no data and
// can change nothing. The till sends it the sale over a BroadcastChannel (same browser or app, same computer).
import { useEffect, useState } from 'react';

export const DISPLAY_CHANNEL = 'rxpos-display';

/** The till's side: send the sale as it is now (null: nothing on the till) */
export function displaySender() {
  let ch = null;
  try { ch = new BroadcastChannel(DISPLAY_CHANNEL); } catch { return { send() {}, close() {} }; }
  return { send: (msg) => { try { ch.postMessage(msg); } catch { /* the window was closed */ } }, close: () => ch.close() };
}

export default function CustomerDisplay() {
  const [s, setS] = useState(null);
  useEffect(() => {
    document.title = 'RxPOS · customer display';
    document.getElementById('splash')?.remove();
    let ch;
    try { ch = new BroadcastChannel(DISPLAY_CHANNEL); } catch { return undefined; }
    ch.onmessage = (e) => setS(e.data || null);
    ch.postMessage({ hello: true }); // ask the till for the sale as it is now
    return () => ch.close();
  }, []);
  const lines = s?.lines || [];
  return (
    <main className="cust-display" aria-live="polite">
      <header>
        {s?.logo && <img src={s.logo} alt="" />}
        <strong>{s?.pharmacy || 'Welcome'}</strong>
      </header>
      {s?.done ? (
        <section className="cd-done">
          <div className="cd-thanks">Thank you!</div>
          <div className="cd-row"><span>Total</span><b className="num">{s.total}</b></div>
          {s.paid && <div className="cd-row"><span>Paid</span><b className="num">{s.paid}</b></div>}
          {s.change && <div className="cd-row cd-change"><span>Change</span><b className="num">{s.change}</b></div>}
        </section>
      ) : lines.length ? (
        <>
          <ol className="cd-lines">
            {lines.map((l, i) => <li key={i}><span>{l.name}</span><span className="num">{l.qty}</span><b className="num">{l.amount}</b></li>)}
          </ol>
          <footer>
            {s.discount && <div className="cd-row"><span>Discount</span><b className="num">− {s.discount}</b></div>}
            <div className="cd-row cd-total"><span>Total</span><b className="num">{s.total}</b></div>
            {s.paid && <div className="cd-row"><span>Paid</span><b className="num">{s.paid}</b></div>}
            {s.change && <div className="cd-row cd-change"><span>Change</span><b className="num">{s.change}</b></div>}
          </footer>
        </>
      ) : (
        <section className="cd-idle"><p>Welcome. Your items will show here.</p></section>
      )}
    </main>
  );
}
