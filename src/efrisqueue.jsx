// URA EFRIS: the queue that gets every sale its fiscal receipt and every refunded, fiscalised sale its credit note.
//
// A sale is fiscalised by the cloud from its own copy (worker/efris.js), so a sale made offline waits here until its
// till has synced, then gets its FDN; the cloud saves the fiscal record and every device downloads it. Any device used
// by someone who sells runs the queue; the cloud answers a sale it has already fiscalised with the same receipt, and
// URA refuses the same receipt number twice, so two tills working the same queue never make two fiscal receipts.
import { useEffect, useRef } from 'react';
import { useStore } from './store.jsx';
import { efrisSale, efrisRefund, efrisCredit } from './cloud.js';
import { efrisOn, runEfrisQueue } from './efris.js';

export const EFRIS_KICK = 'rxpos-efris-kick';
/** Ask the queue to run now (after a sale or a refund) */
export const kickEfris = () => { try { dispatchEvent(new Event(EFRIS_KICK)); } catch { /* not in a browser */ } };

const EVERY = 60e3;

export function EfrisQueue() {
  const { db, syncCfg, can, syncNow } = useStore();
  const latest = useRef({});
  latest.current = { db, syncCfg, can, syncNow };
  const on = efrisOn(db.settings) && !!syncCfg?.url;
  useEffect(() => {
    if (!on) return;
    let busy = false, gone = false;
    const pass = async () => {
      if (busy || gone || !navigator.onLine) return;
      busy = true;
      try {
        await latest.current.syncNow?.(); // the new sales reach the cloud first
        const n = await runEfrisQueue({ ...latest.current, api: { efrisSale, efrisRefund, efrisCredit } });
        if (n && !gone) await latest.current.syncNow?.(); // and their fiscal receipts come back
      } catch { /* the next pass */ } finally { busy = false; }
    };
    const first = setTimeout(pass, 5000);
    const timer = setInterval(pass, EVERY);
    addEventListener(EFRIS_KICK, pass);
    addEventListener('online', pass);
    return () => { gone = true; clearTimeout(first); clearInterval(timer); removeEventListener(EFRIS_KICK, pass); removeEventListener('online', pass); };
  }, [on]);
  return null;
}
