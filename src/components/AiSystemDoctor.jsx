// AI System Doctor (This device, and the owner's Device errors): reads this device's sync and storage health, asks
// the AI copilot (POST /api/ai/copilot mode "diagnose") what is wrong in plain English, and offers one-tap repairs.
// Telemetry carries counts, states and code locations only (no sales, patients, names or keys; the cloud scrubs it
// again). Every repair asks first, and none deletes anything that hasn't reached the cloud:
//   compact-snapshots  keep the 2 newest daily on-device undo copies (store.jsx keeps 7), free space
//   reset-sync-cursor  send what is waiting, then download everything again (store pullAll: adds, never deletes)
//   test-connection    reach the cloud or the pharmacy's hub (/api/health)
//   reload-app         restart the app (open sales and drafts survive, as with an update)
import { useState } from 'react';
import { Stethoscope, Loader2, HardDrive, RefreshCcw, Wifi, RotateCw, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useStore } from '../store.jsx';
import { aiCopilot } from '../cloud.js';
import { idbKeys, idbDel } from '../idb.js';
import { keepsData } from '../webpolicy.js';
import { platformName } from '../platform.js';
import { LABEL } from '../update.js';
import { scrub } from '../crash.js';
import { ask, toast } from '../feedback.jsx';

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

/** This device's health, for the AI (no personal data) */
export async function deviceTelemetry({ pending, syncStatus, syncCfg, products } = {}) {
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const keys = keepsData() ? await idbKeys().catch(() => []) : [];
  const crashes = read('rxpos-crash-queue', []);
  return {
    app: LABEL, platform: platformName, online: navigator.onLine, keepsDataOnDevice: keepsData(),
    linkedToCloud: !!syncCfg?.url, cloudIsHub: !!syncCfg?.url && !/rxposug\.com/.test(syncCfg.url),
    changesWaiting: pending ?? null, syncState: syncStatus?.state ?? null, syncError: scrub(syncStatus?.error, 200) || null,
    minutesSinceLastSync: syncStatus?.lastSync ? Math.round((Date.now() - new Date(syncStatus.lastSync).getTime()) / 6e4) : null,
    medicinesOnDevice: products?.length ?? null,
    storageUsedMB: est?.usage != null ? Math.round(est.usage / 1e6) : null, storageQuotaMB: est?.quota != null ? Math.round(est.quota / 1e6) : null,
    dailySnapshots: keys.filter((k) => String(k).startsWith('snap:')).length,
    recentErrors: (Array.isArray(crashes) ? crashes : []).slice(-6).map((c) => ({ message: scrub(c.message, 200), where: scrub(String(c.stack || '').split('\n').slice(0, 2).join(' | '), 200), page: scrub(c.page || '', 60) })),
  };
}

const REPAIRS = {
  'compact-snapshots': { label: 'Compact local snapshots', Icon: HardDrive },
  'reset-sync-cursor': { label: 'Reset stuck sync', Icon: RefreshCcw },
  'test-connection': { label: 'Test cloud / hub connection', Icon: Wifi },
  'reload-app': { label: 'Restart the app', Icon: RotateCw },
};

/** remote: the owner's Device errors tab (diagnose → the cloud's summary of a pharmacy's reported errors); the repairs
 *  then run on the affected device, so they are listed as steps instead of buttons */
export default function AiSystemDoctor({ remote }) {
  const store = useStore();
  const { syncCfg, pullAll } = store;
  const [busy, setBusy] = useState('');
  const [dx, setDx] = useState(null);
  const [error, setError] = useState('');
  const canAsk = !!remote || (!!syncCfg?.url && !!syncCfg?.key);

  const diagnose = async () => {
    setBusy('diagnose'); setError('');
    try {
      setDx(remote ? await remote() : await aiCopilot(syncCfg, { mode: 'diagnose', telemetry: await deviceTelemetry(store) }));
    } catch (e) { setError(e.message || String(e)); }
    setBusy('');
  };
  const repair = async (id) => {
    setBusy(id);
    try {
      if (id === 'compact-snapshots') {
        const snaps = (await idbKeys()).filter((k) => String(k).startsWith('snap:')).sort();
        if (snaps.length <= 2) toast('Nothing to compact: two or fewer daily snapshots on this device', 'success');
        else if (await ask({ title: 'Compact local snapshots?', message: `Keeps the 2 newest daily undo copies and removes ${snaps.length - 2} older one${snaps.length - 2 === 1 ? '' : 's'} from this device. Your pharmacy's records and the cloud are not touched.`, confirmText: 'Compact' })) {
          for (const k of snaps.slice(0, -2)) await idbDel(k);
          toast(`Removed ${snaps.length - 2} old snapshot${snaps.length - 2 === 1 ? '' : 's'}`, 'success');
        }
      } else if (id === 'reset-sync-cursor') {
        if (await ask({ title: 'Reset the sync?', message: 'Sends anything waiting first, then downloads the whole pharmacy again and adds what is missing. Nothing is deleted. It can take a few minutes on mobile data.', confirmText: 'Reset sync' })) {
          await pullAll();
          toast('Sync reset: everything downloaded again', 'success');
        }
      } else if (id === 'test-connection') {
        if (!syncCfg?.url) throw new Error('This device is not linked to a cloud or hub.');
        const t0 = Date.now();
        const r = await fetch(syncCfg.url.replace(/\/+$/, '') + '/api/health', { cache: 'no-store' }).then((x) => x.json());
        toast(r?.ok ? `Reached the ${/rxposug\.com/.test(syncCfg.url) ? 'cloud' : 'hub'} in ${Date.now() - t0} ms` : 'Reached it, but it reports a problem: ask your RxPOS provider', r?.ok ? 'success' : 'warn');
      } else if (id === 'reload-app') {
        if (await ask({ title: 'Restart the app?', message: 'Your open sale, held sales and drafts stay put.', confirmText: 'Restart' })) location.reload();
      }
    } catch (e) { toast(e.message || 'That did not work. Check the connection and try again.', 'error'); }
    setBusy('');
  };

  return (
    <section className="card bento-card ai-doctor">
      <h3><Stethoscope size={18} />AI System Doctor</h3>
      <p className="muted small">{remote ? 'Summarises the errors this pharmacy\'s devices reported and what to do about them.' : 'Checks this device\'s sync, storage and recent errors and explains what to do. Only counts and error locations are sent, never sales or patient details.'}</p>
      <button className="btn primary" disabled={!!busy || !canAsk} onClick={diagnose}>
        {busy === 'diagnose' ? <><Loader2 size={16} className="spin" />Checking…</> : <><Sparkles size={16} />{remote ? 'Summarise with AI' : 'Diagnose this device'}</>}
      </button>
      {!canAsk && <p className="muted small">Link this device to the cloud to use the AI. The repairs below work without it.</p>}
      {error && <div className="error"><AlertTriangle size={14} /> {error}</div>}
      {dx && (
        <div className="ai-answer" role="status" aria-live="polite">
          <p className="ai-text"><CheckCircle2 size={14} className="text-ok" /> {dx.summary}</p>
          {dx.causes?.length > 0 && <ul className="small">{dx.causes.map((c) => <li key={c}>{c}</li>)}</ul>}
        </div>
      )}
      {remote ? (dx?.actions?.length > 0 && <>
        <span className="micro">On the affected device: This device → AI System Doctor</span>
        <ol className="small">{dx.actions.map((id) => <li key={id}>{REPAIRS[id].label}</li>)}</ol>
      </>) : <>
      <span className="micro">One-tap repairs{dx?.actions?.length ? ' · suggested first' : ''}</span>
      <div className="doctor-actions">
        {[...(dx?.actions || []), ...Object.keys(REPAIRS).filter((k) => !dx?.actions?.includes(k))].map((id) => {
          const { label, Icon } = REPAIRS[id];
          return (
            <button key={id} className={'btn ' + (dx?.actions?.includes(id) ? 'primary' : 'ghost')} disabled={!!busy || (id === 'compact-snapshots' && !keepsData())} onClick={() => repair(id)}>
              {busy === id ? <Loader2 size={16} className="spin" /> : <Icon size={16} />}{label}
            </button>
          );
        })}
      </div>
      </>}
    </section>
  );
}
