import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { repo, type OrderDoc, type ServiceCallDoc, type TableDoc, type MenuItemDoc } from '../db/repository';
import type { AuthPayload } from '../middleware/auth';

let ioInstance: SocketIOServer | null = null;

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  ioInstance = new SocketIOServer(httpServer, {
    cors: {
      origin: env.corsOrigin ? env.corsOrigin.split(',').map((s) => s.trim()) : true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  ioInstance.on('connection', async (socket: Socket) => {
    const auth = (socket.handshake.auth || {}) as {
      token?: string;
      qrToken?: string;
      mode?: 'staff' | 'guest';
    };

    // Guest room join (validated strictly against table qrToken)
    if (auth.qrToken) {
      const table = await repo.findTableByQrToken(auth.qrToken);
      if (table) {
        socket.join(`table:${table.id}`);
        socket.join('guests:menu');
        socket.emit('socket:ready', { scope: 'guest', tableId: table.id });
      }
    }

    // Staff room join (validated via JWT from auth handshake or httpOnly cookie)
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const jwtToken = auth.token || cookies.passline_access;
    if (jwtToken) {
      try {
        const decoded = jwt.verify(jwtToken, env.jwtSecret) as AuthPayload;
        socket.join('restaurant:main');
        socket.join(`role:${decoded.role}`);
        if (decoded.role === 'admin') {
          socket.join('role:manager');
          socket.join('role:waiter');
          socket.join('role:kitchen');
        } else if (decoded.role === 'manager') {
          socket.join('role:waiter');
          socket.join('role:kitchen');
        }
        socket.emit('socket:ready', { scope: 'staff', role: decoded.role });
      } catch {
        // Invalid or expired staff token; stays unauthenticated
      }
    }

    // Allow dynamic room joining if a user logs in after socket connects
    socket.on('staff:authenticate', (token: string) => {
      try {
        const decoded = jwt.verify(token, env.jwtSecret) as AuthPayload;
        socket.join('restaurant:main');
        socket.join(`role:${decoded.role}`);
        if (decoded.role === 'admin' || decoded.role === 'manager') {
          socket.join('role:manager');
          socket.join('role:waiter');
          socket.join('role:kitchen');
        }
        socket.emit('socket:ready', { scope: 'staff', role: decoded.role });
      } catch {
        // ignore invalid token
      }
    });

    socket.on('guest:joinTable', async (qrToken: string) => {
      if (!qrToken) return;
      const table = await repo.findTableByQrToken(qrToken);
      if (table) {
        socket.join(`table:${table.id}`);
        socket.join('guests:menu');
        socket.emit('socket:ready', { scope: 'guest', tableId: table.id });
      }
    });
  });

  return ioInstance;
}

export const socketEmitter = {
  orderCreated(order: OrderDoc) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('order:created', order);
    ioInstance.to(`table:${order.tableId}`).emit('order:created', order);
  },

  orderUpdated(order: OrderDoc) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('order:updated', order);
    ioInstance.to(`table:${order.tableId}`).emit('order:updated', order);
  },

  orderCancelled(order: OrderDoc) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('order:cancelled', order);
    ioInstance.to(`table:${order.tableId}`).emit('order:cancelled', order);
  },

  callCreated(call: ServiceCallDoc) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('call:created', call);
    ioInstance.to(`table:${call.tableId}`).emit('call:created', call);
  },

  callAcknowledged(call: ServiceCallDoc) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('call:acknowledged', call);
    ioInstance.to(`table:${call.tableId}`).emit('call:acknowledged', call);
  },

  callResolved(call: ServiceCallDoc) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('call:resolved', call);
    ioInstance.to(`table:${call.tableId}`).emit('call:resolved', call);
  },

  tableStatusChanged(table: TableDoc) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('table:statusChanged', table);
    ioInstance.to(`table:${table.id}`).emit('table:statusChanged', table);
  },

  menuItemAvailabilityChanged(item: MenuItemDoc) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('menu:itemAvailabilityChanged', item);
    ioInstance.to('guests:menu').emit('menu:itemAvailabilityChanged', item);
  },

  menuUpdated(payload: { reason: string }) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('menu:updated', payload);
    ioInstance.to('guests:menu').emit('menu:updated', payload);
  },
};
