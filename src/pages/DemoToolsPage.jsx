import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Play,
  Square,
  ShoppingBag,
  BellRing,
  Clock,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { formatCurrency } from '../utils/format';

export function DemoToolsPage() {
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState('');
  const [callType, setCallType] = useState('waiter');
  const [autoPlayRunning, setAutoPlayRunning] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(8);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [tbls, menu, status] = await Promise.all([
        api.listTables(),
        api.getMenu(),
        api.getDemoStatus(),
      ]);
      setTables(tbls);
      setMenuItems(menu.items);
      setAutoPlayRunning(status.autoPlayRunning);
      setIntervalSeconds(status.intervalSeconds);
    } catch (err) {
      toast.error(err.message);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSimulateOrder = async () => {
    setBusy(true);
    try {
      const order = await api.simulateOrder(selectedTableId || undefined);
      toast.success(`Simulated QR order ${order.orderNumber} on Table ${order.tableNumber}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSimulateCall = async () => {
    setBusy(true);
    try {
      const call = await api.simulateCall(selectedTableId || undefined, callType);
      toast.success(`Simulated ${call.type} call on Table ${call.tableNumber}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAutoPlay = async () => {
    setBusy(true);
    try {
      const res = await api.setAutoPlay(!autoPlayRunning, intervalSeconds);
      setAutoPlayRunning(res.autoPlayRunning);
      toast.success(
        res.autoPlayRunning
          ? `Auto-Play started (every ${res.intervalSeconds}s)`
          : 'Auto-Play stopped'
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleTimeTravel = async (minutesBack) => {
    setBusy(true);
    try {
      const res = await api.timeTravel(minutesBack);
      toast.success(
        `Shifted ${res.ordersShifted} orders and ${res.callsShifted} calls back by ${minutesBack}m`
      );
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleDish = async (item) => {
    try {
      const updated = await api.toggleMenuItemAvailability(item.id, !item.isAvailable);
      setMenuItems((prev) => prev.map((m) => (m.id === item.id ? updated : m)));
      toast.success(
        `"${updated.name}" -> ${updated.isAvailable ? 'Available' : 'Sold Out'} (live broadcast)`
      );
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await api.resetDemoData();
      setAutoPlayRunning(false);
      toast.success('Demo database wiped and reseeded cleanly');
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout
      title="Demo Control Center"
      subtitle="Admin-only simulation suite for testing live Socket.IO orders, calls, kitchen alerts, and menu availability"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Simulation Controls */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Traffic & Guest Simulators</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Events broadcast immediately over Socket.IO to all open dashboards, kitchen, waiter, and guest menus.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="sim-table" className="block text-xs font-medium text-slate-700 mb-1">
                  Target Table
                </label>
                <select
                  id="sim-table"
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="">Random Table</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      Table {t.number} — {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sim-call-type" className="block text-xs font-medium text-slate-700 mb-1">
                  Simulated Call Type
                </label>
                <select
                  id="sim-call-type"
                  value={callType}
                  onChange={(e) => setCallType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="waiter">Waiter Assistance</option>
                  <option value="water">Water Refill</option>
                  <option value="napkins">Fresh Napkins</option>
                  <option value="bill">Request Bill</option>
                  <option value="other">Other Question</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={handleSimulateOrder}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                Simulate Guest QR Order
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSimulateCall}
                className="min-h-[44px] px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center justify-center gap-2"
              >
                <BellRing className="w-4 h-4" />
                Simulate Service Call
              </button>
            </div>
          </section>

          {/* Auto-Play Mode */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">Auto-Play Live Traffic</h2>
                <p className="text-xs text-slate-500">
                  Continuously generates realistic guest orders and service calls on a timer
                </p>
              </div>
              <span
                className={`text-xs font-semibold ${
                  autoPlayRunning ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                {autoPlayRunning ? `Running every ${intervalSeconds}s` : 'Stopped'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="autoplay-sec" className="text-xs font-medium text-slate-700">
                Interval (seconds):
              </label>
              <select
                id="autoplay-sec"
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                disabled={autoPlayRunning}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono bg-white"
              >
                <option value={5}>5s</option>
                <option value={8}>8s</option>
                <option value={12}>12s</option>
                <option value={20}>20s</option>
              </select>

              <button
                type="button"
                disabled={busy}
                onClick={handleToggleAutoPlay}
                className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 ${
                  autoPlayRunning
                    ? 'bg-red-700 text-white hover:bg-red-800'
                    : 'bg-teal-700 text-white hover:bg-teal-800'
                }`}
              >
                {autoPlayRunning ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    Stop Auto-Play
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Start Auto-Play
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Time Travel & Reset */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Time Travel & Database Reset</h2>
              <p className="text-xs text-slate-500">
                Backdate active orders and open calls to trigger &gt;3m call alerts and overdue KDS timers
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {[5, 10, 20].map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={busy}
                  onClick={() => handleTimeTravel(m)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  Backdate -{m} min
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-500">
                Wipes orders, calls, and payments and restores all 12 tables and 30 menu dishes.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={handleReset}
                className="px-4 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Demo Data
              </button>
            </div>
          </section>
        </div>

        {/* Right Column: Live Dish Toggle + Demo QR Quick Links */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">Quick Dish Availability Switch</h2>
              <p className="text-xs text-slate-500">
                Toggle any dish to see active Guest QR menus update live
              </p>
            </div>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {menuItems.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                    <p className="font-mono text-slate-500">{formatCurrency(item.price)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleDish(item)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                      item.isAvailable
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {item.isAvailable ? 'Available' : 'Sold Out'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">Demo Table QR Links</h2>
            <p className="text-xs text-slate-500">
              Jump straight into any guest table menu without scanning a physical QR code
            </p>
            <div className="grid grid-cols-2 gap-2">
              {tables.map((t) => (
                <Link
                  key={t.id}
                  to={`/t/${t.qrToken}`}
                  className="px-3 py-2 rounded-lg border border-slate-200 hover:border-teal-600 text-xs font-medium text-slate-700 hover:text-teal-800 flex items-center justify-between"
                >
                  <span>Table {t.number}</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
