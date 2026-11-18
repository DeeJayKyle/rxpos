// Live connection per pharmacy (Cloudflare Durable Object, WebSocket hibernation; free plan).
// Every signed-in device keeps one WebSocket open. The cloud pushes:
//   { type: 'changed' }          → another device saved something: pull now (instead of waiting for the next sync)
//   { type: 'typing', conv }     → someone is typing in a chat (UI batch 3, F7): to the other person of a direct chat, or to
//                                  everyone else in the team chat; nothing is stored
//   { type: 'rtc', ... }         → call set-up messages between colleagues (ring, offer, answer, hangup…), delivered instantly
// Idle sockets cost nothing (hibernation), so devices no longer need to keep asking the cloud.
import { DurableObject } from 'cloudflare:workers';

export class TenantHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // keep-alive pings are answered without waking the object (free)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/notify') { // a device pushed changes
      const { from } = await req.json();
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() || {};
        if (a.device !== from) try { ws.send('{"type":"changed"}'); } catch {}
      }
      return new Response('ok');
    }
    // 2026-11-17 audit: a person signed out everywhere, disabled or removed: their open connections end now (a hibernating
    // socket used to keep receiving changes and call offers, and could ring colleagues, until it dropped by itself)
    if (url.pathname === '/close') {
      const { uids } = await req.json();
      for (const uid of Array.isArray(uids) ? uids : []) for (const ws of this.ctx.getWebSockets('u:' + uid)) try { ws.close(4001, 'signed out'); } catch {}
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const uid = url.searchParams.get('uid') || '', device = url.searchParams.get('device') || '', name = url.searchParams.get('name') || '';
    this.ctx.acceptWebSocket(pair[1], ['u:' + uid]);
    pair[1].serializeAttachment({ uid, device, name });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'ping') return ws.send('{"type":"pong"}');
    if (m.type === 'typing' && typeof m.conv === 'string' && m.conv.length <= 120) {
      const me = ws.deserializeAttachment() || {};
      // a direct chat (dm:<uid>:<uid>) reaches its other person only, and only if the sender is one of the two
      const dm = /^dm:([^:]+):([^:]+)$/.exec(m.conv);
      if (dm && me.uid !== dm[1] && me.uid !== dm[2]) return;
      if (m.conv.startsWith('client:')) return;
      const msg = JSON.stringify({ type: 'typing', conv: m.conv, from_uid: me.uid, from_name: me.name, at: Date.now() });
      const targets = dm ? this.ctx.getWebSockets('u:' + (dm[1] === me.uid ? dm[2] : dm[1])) : this.ctx.getWebSockets();
      for (const t of targets) if (t !== ws && (t.deserializeAttachment() || {}).uid !== me.uid) try { t.send(msg); } catch {}
      return;
    }
    if (m.type === 'rtc' && m.to) {
      const me = ws.deserializeAttachment() || {};
      const msg = JSON.stringify({ type: 'rtc', kind: String(m.kind || ''), call_id: String(m.callId || ''), from_uid: me.uid, from_name: me.name, data: m.data ?? null, at: Date.now() });
      const targets = this.ctx.getWebSockets('u:' + m.to);
      for (const t of targets) try { t.send(msg); } catch {}
      if (!targets.length) ws.send(JSON.stringify({ type: 'rtc-offline', to: m.to, call_id: m.callId }));
    }
  }

  async webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch {} }
}
