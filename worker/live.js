// Live connection per pharmacy (Cloudflare Durable Object, WebSocket hibernation; free plan).
// Every signed-in device keeps one WebSocket open. The cloud pushes:
//   { type: 'changed' }          → another device saved something: pull now (instead of waiting for the next sync)
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
