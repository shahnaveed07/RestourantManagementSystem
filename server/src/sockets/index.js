import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { repo } from '../db/repository.js';

let ioInstance = null;

function parseCookieHeader(cookieHeader) {
  const result = {};
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

const STAFF_ROLES = new Set(['admin', 'manager', 'waiter', 'kitchen']);

async function authenticateStaffSocket(socket, token) {
  if (!token || typeof token !== 'string') return false;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await repo.findUserById(decoded.userId);
    if (!user || !user.isActive || !STAFF_ROLES.has(user.role)) {
      return false;
    }
    socket.join('restaurant:main');
    socket.join(`role:${user.role}`);
    if (user.role === 'admin') {
      socket.join('role:manager');
      socket.join('role:waiter');
      socket.join('role:kitchen');
    } else if (user.role === 'manager') {
      socket.join('role:waiter');
      socket.join('role:kitchen');
    }
    socket.emit('socket:ready', { scope: 'staff', role: user.role });
    return true;
  } catch {
    return false;
  }
}

export function initSocketServer(httpServer) {
  ioInstance = new SocketIOServer(httpServer, {
    cors: {
      origin: env.corsOrigin ? env.corsOrigin.split(',').map((s) => s.trim()) : true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  ioInstance.on('connection', async (socket) => {
    const auth = socket.handshake.auth || {};

    // Public storefront or QR guest menu room
    if (auth.mode === 'guest' || auth.qrToken) {
      socket.join('guests:menu');
    }

    // Guest room join (validated strictly against table qrToken)
    if (auth.qrToken) {
      const table = await repo.findTableByQrToken(auth.qrToken);
      if (table) {
        socket.join(`table:${table.id}`);
        socket.join('guests:menu');
        socket.emit('socket:ready', { scope: 'guest', tableId: table.id });
      }
    }

    // Staff room join (validated via JWT + active staff DB check)
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const jwtToken = auth.token || cookies.passline_access;
    if (jwtToken) {
      await authenticateStaffSocket(socket, jwtToken);
    }

    // Allow dynamic room joining if a staff user logs in after socket connects
    socket.on('staff:authenticate', async (token) => {
      await authenticateStaffSocket(socket, token);
    });

    socket.on('guest:joinTable', async (qrToken) => {
      if (!qrToken) return;
      const table = await repo.findTableByQrToken(qrToken);
      if (table) {
        for (const room of socket.rooms) {
          if (room.startsWith('table:') && room !== `table:${table.id}`) {
            socket.leave(room);
          }
        }
        socket.join(`table:${table.id}`);
        socket.join('guests:menu');
        socket.emit('socket:ready', { scope: 'guest', tableId: table.id });
      }
    });
  });

  return ioInstance;
}

export const socketEmitter = {
  orderCreated(order) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('order:created', order);
    ioInstance.to(`table:${order.tableId}`).emit('order:created', order);
  },

  orderUpdated(order) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('order:updated', order);
    ioInstance.to(`table:${order.tableId}`).emit('order:updated', order);
  },

  orderCancelled(order) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('order:cancelled', order);
    ioInstance.to(`table:${order.tableId}`).emit('order:cancelled', order);
  },

  callCreated(call) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('call:created', call);
    ioInstance.to(`table:${call.tableId}`).emit('call:created', call);
  },

  callAcknowledged(call) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('call:acknowledged', call);
    ioInstance.to(`table:${call.tableId}`).emit('call:acknowledged', call);
  },

  callResolved(call) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('call:resolved', call);
    ioInstance.to(`table:${call.tableId}`).emit('call:resolved', call);
  },

  tableStatusChanged(table) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('table:statusChanged', table);
    ioInstance.to(`table:${table.id}`).emit('table:statusChanged', table);
  },

  menuItemAvailabilityChanged(item) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('menu:itemAvailabilityChanged', item);
    ioInstance.to('guests:menu').emit('menu:itemAvailabilityChanged', item);
  },

  menuUpdated(payload) {
    if (!ioInstance) return;
    ioInstance.to('restaurant:main').emit('menu:updated', payload);
    ioInstance.to('guests:menu').emit('menu:updated', payload);
  },
};
