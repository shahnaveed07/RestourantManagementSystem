export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatElapsed(isoDate, nowMs = Date.now()) {
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

export function getElapsedMinutes(isoDate, nowMs = Date.now()) {
  return Math.max(0, (nowMs - new Date(isoDate).getTime()) / 60000);
}

export function formatTimeShort(isoDate) {
  return new Date(isoDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(isoDate) {
  return new Date(isoDate).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  waiter: 'Waiter',
  kitchen: 'Kitchen',
  customer: 'Customer',
};

export const ROLE_HOME_ROUTE = {
  admin: '/dashboard',
  manager: '/dashboard',
  waiter: '/waiter',
  kitchen: '/kitchen',
  customer: '/',
};

export function formatOrderLocation(order) {
  if (!order) return '';
  if (order.tableNumber && order.tableNumber > 0) {
    return `Table ${order.tableNumber}`;
  }
  return order.tableName || 'Counter Pickup';
}

export const ORDER_STATUS_LABEL = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const TABLE_STATUS_LABEL = {
  free: 'Free',
  occupied: 'Occupied',
  reserved: 'Reserved',
  cleaning: 'Cleaning',
};

export const CALL_TYPE_LABEL = {
  waiter: 'Waiter Assistance',
  bill: 'Request Bill',
  water: 'Water Refill',
  napkins: 'Fresh Napkins',
  other: 'Other Request',
};

/**
 * Plays a crisp, unobtrusive hospitality service bell chime using Web Audio API.
 */
export function playAlertChime(kind = 'call') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const now = ctx.currentTime;

    if (kind === 'call') {
      osc.frequency.setValueAtTime(784, now);
      osc.frequency.setValueAtTime(1046.5, now + 0.12);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } else {
      osc.frequency.setValueAtTime(587.3, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    }
  } catch {
    // Ignore autoplay restriction before user interaction
  }
}

export function getGuestQrUrl(qrToken) {
  return `${window.location.origin}/t/${qrToken}`;
}
