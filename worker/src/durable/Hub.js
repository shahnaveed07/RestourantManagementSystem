import { DurableObject } from 'cloudflare:workers';
import { getConfig } from '../config/env.js';
import { createRepository } from '../db/repository.js';
import { createRealtimeEmitter } from '../services/realtime.js';
import { createSimulatedGuestOrder, createSimulatedCall } from '../services/orderPlacement.js';

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          reset_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ip_failures (
          ip TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS autoplay_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL DEFAULT 0,
          interval_seconds INTEGER NOT NULL DEFAULT 10
        );
        INSERT OR IGNORE INTO autoplay_state (id, enabled, interval_seconds) VALUES (1, 0, 10);
      `);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      return this.handleWebSocketConnect(request);
    }
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request);
    }
    if (url.pathname === '/ratelimit' && request.method === 'POST') {
      return this.handleRateLimit(request);
    }
    if (url.pathname === '/ip-failure' && request.method === 'POST') {
      return this.handleIpFailure(request);
    }
    if (url.pathname === '/autoplay') {
      return this.handleAutoPlay(request);
    }

    return new Response('Not found', { status: 404 });
  }

  handleWebSocketConnect(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    let rooms = ['all', 'public'];
    try {
      const parsedRooms = JSON.parse(request.headers.get('x-hub-rooms') || '[]');
      if (Array.isArray(parsedRooms) && parsedRooms.length > 0) {
        rooms = Array.from(new Set(['all', ...parsedRooms.map(String)]));
      }
    } catch {
      rooms = ['all', 'public'];
    }

    const attachment = {
      rooms,
      role: request.headers.get('x-hub-role') || 'guest',
      userId: request.headers.get('x-hub-user-id') || null,
      tableId: request.headers.get('x-hub-table-id') || null,
      connectedAt: new Date().toISOString(),
    };

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // WebSocket Hibernation API: attach tags and serializable state
    this.ctx.acceptWebSocket(server, rooms);
    server.serializeAttachment(attachment);

    try {
      server.send(
        JSON.stringify({
          event: 'socket:ready',
          data: { connected: true, role: attachment.role, rooms },
        })
      );
    } catch {
      // ignore if socket already closed
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcastToRooms(event, data, rooms = ['all']) {
    const targetRooms = Array.isArray(rooms) && rooms.length > 0 ? rooms : ['all'];
    const payload = JSON.stringify({ event, data });
    const recipients = new Set();

    for (const room of targetRooms) {
      const sockets = this.ctx.getWebSockets(String(room));
      for (const ws of sockets) {
        recipients.add(ws);
      }
    }

    // Also inspect sockets that dynamically watched a tableId after connect
    const tableTargets = targetRooms.filter((r) => String(r).startsWith('table:'));
    if (tableTargets.length > 0) {
      const allSockets = this.ctx.getWebSockets('all');
      for (const ws of allSockets) {
        if (recipients.has(ws)) continue;
        try {
          const att = ws.deserializeAttachment();
          if (att?.watchedTableId && tableTargets.includes(`table:${att.watchedTableId}`)) {
            recipients.add(ws);
          }
        } catch {
          // ignore unreadable attachment
        }
      }
    }

    let delivered = 0;
    for (const ws of recipients) {
      try {
        ws.send(payload);
        delivered += 1;
      } catch {
        try {
          ws.close(1011, 'Send failed');
        } catch {
          // ignore close errors
        }
      }
    }
    return delivered;
  }

  async handleBroadcast(request) {
    const body = await request.json();
    const delivered = this.broadcastToRooms(body.event, body.data, body.rooms);
    return Response.json({ ok: true, delivered });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') return;
    if (message === 'ping') {
      try {
        ws.send(JSON.stringify({ event: 'pong', data: { ts: Date.now() } }));
      } catch {
        // ignore
      }
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    if (parsed?.event === 'ping' || parsed?.type === 'ping') {
      try {
        ws.send(JSON.stringify({ event: 'pong', data: { ts: Date.now() } }));
      } catch {
        // ignore
      }
      return;
    }

    // Allow client to watch a public tableId without elevating to staff/kitchen rooms
    if (parsed?.event === 'guest:watchTable' && typeof parsed.data === 'string' && parsed.data.trim()) {
      try {
        const current = ws.deserializeAttachment() || { rooms: ['all'] };
        ws.serializeAttachment({
          ...current,
          watchedTableId: parsed.data.trim(),
        });
      } catch {
        // ignore attachment update failures
      }
    }
  }

  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code || 1000, reason || 'Normal closure');
    } catch {
      // already closed
    }
  }

  async webSocketError(ws) {
    try {
      ws.close(1011, 'WebSocket error');
    } catch {
      // already closed
    }
  }

  async handleRateLimit(request) {
    const { key, max, windowMs } = await request.json();
    const now = Date.now();
    const safeKey = String(key || 'default');
    const safeMax = Math.max(1, Number(max) || 10);
    const safeWindowMs = Math.max(1000, Number(windowMs) || 60000);

    // Opportunistic prune of expired rate-limit entries
    this.ctx.storage.sql.exec('DELETE FROM rate_limits WHERE reset_at <= ?', now);

    const rows = this.ctx.storage.sql
      .exec('SELECT count, reset_at FROM rate_limits WHERE key = ?', safeKey)
      .toArray();

    if (rows.length === 0) {
      const resetAt = now + safeWindowMs;
      this.ctx.storage.sql.exec(
        'INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)',
        safeKey,
        resetAt
      );
      return Response.json({
        allowed: true,
        count: 1,
        remaining: Math.max(0, safeMax - 1),
        retryAfterSeconds: 0,
      });
    }

    const currentCount = Number(rows[0].count || 0);
    const resetAt = Number(rows[0].reset_at || now + safeWindowMs);
    if (currentCount >= safeMax) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      return Response.json({
        allowed: false,
        count: currentCount,
        remaining: 0,
        retryAfterSeconds,
      });
    }

    const nextCount = currentCount + 1;
    this.ctx.storage.sql.exec('UPDATE rate_limits SET count = ? WHERE key = ?', nextCount, safeKey);
    return Response.json({
      allowed: true,
      count: nextCount,
      remaining: Math.max(0, safeMax - nextCount),
      retryAfterSeconds: 0,
    });
  }

  async handleIpFailure(request) {
    const { action, ip } = await request.json();
    const safeIp = String(ip || '127.0.0.1');
    const now = Date.now();
    const expiryCutoff = now - 60 * 60 * 1000;

    this.ctx.storage.sql.exec('DELETE FROM ip_failures WHERE updated_at < ?', expiryCutoff);

    if (action === 'clear') {
      this.ctx.storage.sql.exec('DELETE FROM ip_failures WHERE ip = ?', safeIp);
      return Response.json({ count: 0 });
    }

    const rows = this.ctx.storage.sql
      .exec('SELECT count FROM ip_failures WHERE ip = ?', safeIp)
      .toArray();
    const current = rows.length > 0 ? Number(rows[0].count || 0) : 0;

    if (action === 'get') {
      return Response.json({ count: current });
    }

    const next = current + 1;
    this.ctx.storage.sql.exec(
      `INSERT INTO ip_failures (ip, count, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at`,
      safeIp,
      next,
      now
    );
    return Response.json({ count: next });
  }

  getAutoPlayState() {
    const rows = this.ctx.storage.sql
      .exec('SELECT enabled, interval_seconds FROM autoplay_state WHERE id = 1')
      .toArray();
    if (rows.length === 0) return { autoPlayRunning: false, intervalSeconds: 10 };
    return {
      autoPlayRunning: Boolean(rows[0].enabled),
      intervalSeconds: Number(rows[0].interval_seconds || 10),
    };
  }

  async handleAutoPlay(request) {
    if (request.method === 'GET') {
      return Response.json(this.getAutoPlayState());
    }
    const { enabled, intervalSeconds = 10 } = await request.json();
    const safeInterval = Math.max(3, Math.min(60, Number(intervalSeconds) || 10));
    this.ctx.storage.sql.exec(
      'UPDATE autoplay_state SET enabled = ?, interval_seconds = ? WHERE id = 1',
      enabled ? 1 : 0,
      safeInterval
    );

    if (enabled) {
      await this.ctx.storage.setAlarm(Date.now() + safeInterval * 1000);
    } else {
      await this.ctx.storage.deleteAlarm();
    }

    return Response.json(this.getAutoPlayState());
  }

  async alarm() {
    const state = this.getAutoPlayState();
    if (!state.autoPlayRunning) return;

    try {
      const cfg = getConfig(this.env);
      if (!cfg.demoMode) {
        this.ctx.storage.sql.exec('UPDATE autoplay_state SET enabled = 0 WHERE id = 1');
        return;
      }
      const repo = createRepository(this.env.DB);
      const realtime = createRealtimeEmitter(this.env);
      if (Math.random() < 0.65) {
        await createSimulatedGuestOrder({ repo, cfg, realtime });
      } else {
        await createSimulatedCall({ repo, realtime });
      }
    } catch {
      // ignore transient errors during demo autoplay
    }

    // Re-check enabled state before scheduling next tick
    const latest = this.getAutoPlayState();
    if (latest.autoPlayRunning) {
      await this.ctx.storage.setAlarm(Date.now() + latest.intervalSeconds * 1000);
    }
  }
}
