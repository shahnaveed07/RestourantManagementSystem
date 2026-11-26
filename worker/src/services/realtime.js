import { buildOrderCreatedSocketPayload } from './orderCalculator.js';

export function createRealtimeEmitter(env) {
  async function broadcast(event, data, rooms) {
    if (!env?.HUB) return;
    try {
      const id = env.HUB.idFromName('global-hub');
      const stub = env.HUB.get(id);
      await stub.fetch('https://hub.internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data, rooms }),
      });
    } catch (err) {
      console.error(`[Realtime] Failed to broadcast ${event}:`, err);
    }
  }

  function orderRooms(order) {
    const rooms = ['staff', 'kitchen'];
    if (order?.tableId) rooms.push(`table:${order.tableId}`);
    if (order?.customerId) rooms.push(`customer:${order.customerId}`);
    return rooms;
  }

  return {
    broadcast,
    orderCreated(order) {
      return broadcast('order:created', buildOrderCreatedSocketPayload(order), orderRooms(order));
    },
    orderUpdated(order) {
      return broadcast('order:updated', order, orderRooms(order));
    },
    orderCancelled(order) {
      return broadcast('order:cancelled', order, orderRooms(order));
    },
    callCreated(call) {
      const rooms = ['staff'];
      if (call?.tableId) rooms.push(`table:${call.tableId}`);
      return broadcast('call:created', call, rooms);
    },
    callAcknowledged(call) {
      const rooms = ['staff'];
      if (call?.tableId) rooms.push(`table:${call.tableId}`);
      return broadcast('call:acknowledged', call, rooms);
    },
    callResolved(call) {
      const rooms = ['staff'];
      if (call?.tableId) rooms.push(`table:${call.tableId}`);
      return broadcast('call:resolved', call, rooms);
    },
    tableStatusChanged(table) {
      const rooms = ['staff'];
      if (table?.id) rooms.push(`table:${table.id}`);
      return broadcast('table:statusChanged', table, rooms);
    },
    menuItemAvailabilityChanged(item) {
      return broadcast('menu:itemAvailabilityChanged', item, ['all']);
    },
    menuUpdated(payload = {}) {
      return broadcast('menu:updated', payload, ['all']);
    },
  };
}
