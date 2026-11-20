import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';
import {
  formatCurrency,
  formatElapsed,
  getElapsedMinutes,
  CALL_TYPE_LABEL,
  ORDER_STATUS_LABEL,
} from '../utils/format';

export function DashboardPage() {
  const { socket, syncVersion } = useSocket();
  const [summary, setSummary] = useState(null);
  const [liveOrders, setLiveOrders] = useState([]);
  const [liveCalls, setLiveCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());

  const fetchAll = useCallback(async () => {
    try {
      const [rep, orders, calls] = await Promise.all([
        api.getReportsSummary(),
        api.listOrders({ status: 'pending,accepted,preparing,ready,served' }),
        api.listCalls({ status: 'open,acknowledged' }),
      ]);
      setSummary(rep);
      setLiveOrders(orders);
      setLiveCalls(calls);
    } catch {
      // keep previous state on transient failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, syncVersion]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onRefresh = () => fetchAll();
    socket.on('order:created', onRefresh);
    socket.on('order:updated', onRefresh);
    socket.on('order:cancelled', onRefresh);
    socket.on('call:created', onRefresh);
    socket.on('call:acknowledged', onRefresh);
    socket.on('call:resolved', onRefresh);
    socket.on('table:statusChanged', onRefresh);

    return () => {
      socket.off('order:created', onRefresh);
      socket.off('order:updated', onRefresh);
      socket.off('order:cancelled', onRefresh);
      socket.off('call:created', onRefresh);
      socket.off('call:acknowledged', onRefresh);
      socket.off('call:resolved', onRefresh);
      socket.off('table:statusChanged', onRefresh);
    };
  }, [socket, fetchAll]);

  return (
    <Layout
      title="Operations Overview"
      subtitle="Live shift revenue, floor throughput, kitchen prep speed, and guest requests"
      actions={
        <button
          type="button"
          onClick={fetchAll}
          className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      }
    >
      {loading || !summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 5-Column KPI Strip */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Today’s Settled Sales</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {formatCurrency(summary.kpis.todaySales)}
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                {summary.kpis.paidOrdersCount} paid checks · avg {formatCurrency(summary.kpis.avgCheckSize)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Open Orders</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {summary.kpis.openOrdersCount}
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                {liveOrders.filter((o) => o.status === 'pending').length} pending ·{' '}
                {liveOrders.filter((o) => o.status === 'preparing').length} preparing
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Active Tables</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {summary.kpis.activeTables}
                <span className="text-sm font-normal text-slate-400">
                  {' '}
                  / {summary.kpis.totalTables}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {Math.round((summary.kpis.activeTables / Math.max(1, summary.kpis.totalTables)) * 100)}% floor occupancy
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Open Service Calls</p>
              <p
                className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
                  summary.kpis.openCallsCount > 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {summary.kpis.openCallsCount}
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                {liveCalls.filter((c) => getElapsedMinutes(c.createdAt, nowMs) >= 3).length} overdue (&gt;3m)
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-medium text-slate-500">Average Prep Time</p>
              <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {summary.kpis.avgPrepMinutes}m
              </p>
              <p className="mt-1 text-xs text-slate-500">Order to pass ready</p>
            </div>
          </section>

          {/* Charts Row */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Sales by Hour</h2>
                  <p className="text-xs text-slate-500">Order revenue trajectory across today’s shift</p>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary.salesByHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      formatter={(val) => [formatCurrency(Number(val)), 'Sales']}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#0f766e"
                      strokeWidth={2}
                      fill="#ccfbf1"
                      fillOpacity={0.6}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-slate-900">Top Selling Dishes</h2>
                <p className="text-xs text-slate-500">Ranked by gross revenue today</p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.topItems.slice(0, 6)} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fontSize: 11, fill: '#334155' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(val) => [formatCurrency(Number(val)), 'Revenue']}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="revenue" fill="#0f766e" radius={[0, 6, 6, 0]} barSize={18} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Live Floor Pulse Row */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Active Orders</h2>
                <Link
                  to="/orders"
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                >
                  Open Live Board
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {liveOrders.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No open orders right now.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {liveOrders.slice(0, 6).map((order) => (
                    <div
                      key={order.id}
                      className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono font-bold text-slate-900">
                            Table {order.tableNumber}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-xs text-slate-500">{order.orderNumber}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-xs text-slate-500">
                            {order.source === 'guest_qr' ? 'QR Guest' : 'Staff'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 truncate mt-0.5">
                          {order.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-semibold text-teal-800 block">
                          {ORDER_STATUS_LABEL[order.status]}
                        </span>
                        <span className="text-xs font-mono text-slate-500 tabular-nums">
                          {formatElapsed(order.createdAt, nowMs)} · {formatCurrency(order.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Open Service Calls</h2>
                <Link
                  to="/calls"
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                >
                  Manage Calls
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {liveCalls.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  All guest service calls are resolved.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {liveCalls.slice(0, 6).map((call) => {
                    const overdue = getElapsedMinutes(call.createdAt, nowMs) >= 3;
                    return (
                      <div
                        key={call.id}
                        className={`px-6 py-3.5 flex items-center justify-between gap-3 ${
                          overdue ? 'bg-red-50/70' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-mono font-bold text-slate-900">
                              Table {call.tableNumber}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-xs font-semibold text-slate-700">
                              {CALL_TYPE_LABEL[call.type]}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 truncate mt-0.5">{call.message}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`text-xs font-mono font-semibold tabular-nums block ${
                              overdue ? 'text-red-700' : 'text-slate-700'
                            }`}
                          >
                            {formatElapsed(call.createdAt, nowMs)}
                            {overdue ? ' (Overdue)' : ''}
                          </span>
                          <span className="text-[11px] text-slate-500 capitalize">{call.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </Layout>
  );
}
