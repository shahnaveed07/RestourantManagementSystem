import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Download, Filter } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api, getStoredToken } from '../api/client';
import { formatCurrency, formatDateTime } from '../utils/format';

export function ReportsPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getReportsSummary({
        from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
      });
      setSummary(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', new Date(`${fromDate}T00:00:00`).toISOString());
      if (toDate) params.set('to', new Date(`${toDate}T23:59:59`).toISOString());
      const token = getStoredToken();
      const res = await fetch(`/api/reports/export?${params.toString()}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to export CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `passline-sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV report downloaded');
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Layout
      title="Sales Reports & Exports"
      subtitle="Revenue breakdown by category, waiter, table, and settled payment method"
      actions={
        <button
          type="button"
          onClick={handleExportCsv}
          className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      }
    >
      {/* Date Range Filter Bar */}
      <div className="mb-6 bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="rep-from" className="block text-xs font-medium text-slate-600 mb-1">
            From Date
          </label>
          <input
            id="rep-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
          />
        </div>
        <div>
          <label htmlFor="rep-to" className="block text-xs font-medium text-slate-600 mb-1">
            To Date
          </label>
          <input
            id="rep-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
          />
        </div>
        <button
          type="button"
          onClick={loadReports}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5"
        >
          <Filter className="w-3.5 h-3.5" />
          Apply Range
        </button>
        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>

      {loading || !summary ? (
        <div className="h-72 rounded-xl bg-white border border-slate-200 animate-pulse" />
      ) : (
        <div className="space-y-6">
          {/* Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500 font-medium">Settled Revenue</p>
              <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {formatCurrency(summary.kpis.todaySales)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500 font-medium">Total Orders</p>
              <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {summary.kpis.totalOrders}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500 font-medium">Average Check</p>
              <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {formatCurrency(summary.kpis.avgCheckSize)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs text-slate-500 font-medium">Average Prep Time</p>
              <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {summary.kpis.avgPrepMinutes}m
              </p>
            </div>
          </div>

          {/* Sales by Category Chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-bold text-slate-900 mb-4">Sales by Menu Category</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.salesByCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    formatter={(val) => [formatCurrency(Number(val)), 'Revenue']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="revenue" fill="#0f766e" radius={[6, 6, 0, 0]} barSize={42} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">Sales by Server / Channel</h2>
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                    <th className="py-2.5 px-4">Server / Source</th>
                    <th className="py-2.5 px-4 text-right">Orders</th>
                    <th className="py-2.5 px-4 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.salesByWaiter.map((w) => (
                    <tr key={w.waiter}>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{w.waiter}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {w.orders}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatCurrency(w.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">Sales by Table</h2>
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                    <th className="py-2.5 px-4">Table</th>
                    <th className="py-2.5 px-4 text-right">Orders</th>
                    <th className="py-2.5 px-4 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.salesByTable.map((t) => (
                    <tr key={t.tableNumber}>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        Table {t.tableNumber}{' '}
                        <span className="text-xs text-slate-500 font-normal">· {t.tableName}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {t.orders}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatCurrency(t.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Settled Payments */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">Recent Settled Payments</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                    <th className="py-2.5 px-4">Time</th>
                    <th className="py-2.5 px-4">Table</th>
                    <th className="py-2.5 px-4">Method</th>
                    <th className="py-2.5 px-4">Processed By</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-4 text-xs text-slate-600 font-mono">
                        {formatDateTime(p.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                        Table {p.tableNumber}
                      </td>
                      <td className="py-2.5 px-4 uppercase text-xs font-semibold text-slate-700">
                        {p.method}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">
                        {p.processedByName || 'Staff'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatCurrency(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
