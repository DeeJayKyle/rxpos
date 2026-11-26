// Incoming calls on Android phones whose RxPOS app is closed or asleep (worker/callpush.js sends the push).
// The phone registers with Firebase and gives the cloud its token; a ring then shows "Incoming call" from Android
// itself, and tapping it opens RxPOS, which fetches the waiting call at once (CallManager's onWake).
// Only on an Android app built with Firebase (GitHub secret GOOGLE_SERVICES_JSON): the build's small RxPOSNative
// plugin says so. Asking Firebase for a token in an app built without it would crash the app, so that check comes first.
import { registerPlugin } from '@capacitor/core';
import { isAndroid } from './platform.js';

const Native = isAndroid ? registerPlugin('RxPOSNative') : null;
let listening = false, lastToken = '', wakeFn = () => {}, curCfg = null;

/** Has this installed app been built with Firebase? (false on older builds without the RxPOSNative plugin) */
export async function nativePushReady() {
  if (!Native) return false;
  try { return !!(await Native.firebase()).firebase; } catch { return false; }
}

/**
 * Register this phone for incoming-call pushes. cfg: the sync config ({ url, key }); onWake: fetch waiting calls now.
 * → 'on' | 'not-android' | 'no-firebase' (an older app or a build without Firebase) | 'denied' | 'error'
 */
export async function setupCallPush(cfg, onWake) {
  wakeFn = onWake || wakeFn; curCfg = cfg;
  if (!isAndroid) return 'not-android';
  if (!(await nativePushReady())) return 'no-firebase';
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    // a loud channel of its own, so a call rings like a call and not like a stock notice
    await PushNotifications.createChannel({ id: 'calls', name: 'Incoming calls', description: 'Colleagues calling you on RxPOS', importance: 5, visibility: 1, vibration: true, lights: true }).catch(() => {});
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return 'denied';
    if (!listening) {
      listening = true;
      await PushNotifications.addListener('registration', ({ value }) => {
        if (!value || value === lastToken || !curCfg?.key) return;
        lastToken = value;
        const cfg = curCfg;
        fetch(cfg.url + '/api/rtc/push', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify({ token: value, platform: 'android' }) })
          .catch(() => { lastToken = ''; });
      });
      // a push while the app is open, or the person tapped the notification: look for the call straight away
      await PushNotifications.addListener('pushNotificationReceived', () => wakeFn());
      await PushNotifications.addListener('pushNotificationActionPerformed', () => wakeFn());
    }
    lastToken = ''; // a new sign-in (maybe another person) sends the token again
    await PushNotifications.register();
    return 'on';
  } catch { return 'error'; }
}
