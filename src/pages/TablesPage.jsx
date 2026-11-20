import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { QrCode, Plus, Printer, X, ExternalLink, Receipt } from 'lucide-react';
import { Layout } from '../components/Layout';
import { QrModal, QrSheetModal } from '../components/QrModal';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useModalA11y } from '../utils/useModalA11y';
import {
  formatCurrency,
  formatDateTime,
  getOrderSourceMeta,
  ORDER_STATUS_LABEL,
  TABLE_STATUS_LABEL,
} from '../utils/format';

const STATUS_STYLE = {
  free: { card: 'border-emerald-200 bg-white hover:border-emerald-400', label: 'text-emerald-700' },
  occupied: { card: 'border-teal-500 bg-teal-50/40 hover:border-teal-600', label: 'text-teal-800' },
  reserved: { card: 'border-amber-300 bg-amber-50/40 hover:border-amber-400', label: 'text-amber-800' },
  cleaning: { card: 'border-slate-300 bg-slate-100/70 hover:border-slate-400', label: 'text-slate-600' },
};

export function TablesPage() {
  const { user, config } = useAuth();
  const { socket, syncVersion } = useSocket();
  const canManage = user?.role === 'admin' || user?.role === 'manager';
  const isAdmin = user?.role === 'admin';

  const [tables, setTables] = useState([]);
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [selectedTable, setSelectedTable] = useState(null);
  const [tableHistory, setTableHistory] = useState(null);
  const [qrTable, setQrTable] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [newCapacity, setNewCapacity] = useState('4');
  const [newSection, setNewSection] = useState('Main Dining');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const drawerRef = useModalA11y(Boolean(selectedTable), () => setSelectedTable(null));
  const createModalRef = useModalA11y(createOpen, () => setCreateOpen(false));

  const fetchTables = useCallback(async () => {
    try {
      const data = await api.listTables();
      setTables(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables, syncVersion]);

  useEffect(() => {
    if (!socket) return;
    const onRefresh = () => fetchTables();
    socket.on('table:statusChanged', onRefresh);
    socket.on('order:created', onRefresh);
    socket.on('order:updated', onRefresh);
    socket.on('call:created', onRefresh);
    socket.on('call:resolved', onRefresh);
    return () => {
      socket.off('table:statusChanged', onRefresh);
      socket.off('order:created', onRefresh);
      socket.off('order:updated', onRefresh);
      socket.off('call:created', onRefresh);
      socket.off('call:resolved', onRefresh);
    };
  }, [socket, fetchTables]);

  const openTableDrawer = async (t) => {
    setSelectedTable(t);
    setTableHistory(null);
    try {
      const hist = await api.getTableHistory(t.id);
      setTableHistory({ orders: hist.orders, calls: hist.calls });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleStatusChange = async (tableId, status) => {
    try {
      const updated = await api.updateTableStatus(tableId, status);
      setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, ...updated } : t)));
      if (selectedTable?.id === tableId) {
        setSelectedTable((prev) => (prev ? { ...prev, ...updated } : null));
      }
      toast.success(`Table ${updated.number} marked ${TABLE_STATUS_LABEL[status]}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRotateQr = async (tableId) => {
    try {
      const updated = await api.rotateTableQr(tableId);
      setTables((prev) => prev.map((t) => (t.id === tableId ? { ...t, ...updated } : t)));
      setQrTable(updated);
      toast.success(`Generated fresh QR token for Table ${updated.number}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateTable = async (e) => {
    e.preventDefault();
    setCreateError(null);
    const num = Number(newNumber);
    const cap = Number(newCapacity);
    if (!Number.isInteger(num) || num < 1 || !newName.trim()) {
      setCreateError('Enter a valid table number and name.');
      return;
    }
    setCreating(true);
    try {
      const created = await api.createTable({
        number: num,
        name: newName.trim(),
        capacity: cap || 4,
        section: newSection.trim() || 'Main Dining',
      });
      setTables((prev) => [...prev, created].sort((a, b) => a.number - b.number));
      setCreateOpen(false);
      setNewNumber('');
      setNewName('');
      toast.success(`Created Table ${created.number}`);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const sections = Array.from(new Set(tables.map((t) => t.section)));
  const visibleTables = tables.filter((t) => {
    if (sectionFilter !== 'all' && t.section !== sectionFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    return true;
  });

  return (
    <Layout
      title="Tables Floor & QR Codes"
      subtitle="Manage dining room status, inspect active table tabs, and generate printable QR codes"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              All QR Sheet
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Table
            </button>
          )}
        </div>
      }
    >
      {/* Filter Toolbar */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setSectionFilter('all')}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              sectionFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            All Sections ({tables.length})
          </button>
          {sections.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSectionFilter(sec)}
              className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                sectionFilter === sec
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 overflow-x-auto no-scrollbar">
          {['all', 'free', 'occupied', 'reserved', 'cleaning'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap transition-colors ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Floor Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-44 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {visibleTables.map((t) => {
            const st = STATUS_STYLE[t.status];
            return (
              <article
                key={t.id}
                className={`border rounded-xl p-3.5 sm:p-4 flex flex-col justify-between gap-3 transition-colors ${st.card}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => openTableDrawer(t)}
                      className="text-left group min-w-0"
                    >
                      <h2 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-teal-800">
                        Table {t.number}
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5 truncate">{t.name}</p>
                    </button>
                    <span className={`text-[11px] font-bold shrink-0 ${st.label}`}>
                      {TABLE_STATUS_LABEL[t.status]}
                    </span>
                  </div>

                  <div className="mt-2.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-1.5">
                    <span className="truncate">{t.section}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t.capacity} seats</span>
                  </div>

                  {(t.openOrderCount || 0) > 0 || (t.openCallCount || 0) > 0 ? (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200/80 flex items-center justify-between gap-1 text-xs">
                      <span className="text-slate-700 font-medium tabular-nums truncate">
                        {t.openOrderCount || 0} ord
                        {(t.openCallCount || 0) > 0 && (
                          <span className="text-red-700 font-bold"> · {t.openCallCount} call</span>
                        )}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                        {formatCurrency(t.openTotal || 0)}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2.5 border-t border-slate-200/70">
                  {t.status === 'cleaning' ? (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(t.id, 'free')}
                      className="min-h-[44px] px-2.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 inline-flex items-center"
                    >
                      Mark Free
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openTableDrawer(t)}
                      className="min-h-[44px] px-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 inline-flex items-center"
                    >
                      Details
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setQrTable(t)}
                    aria-label={`Generate QR for Table ${t.number}`}
                    className="min-h-[44px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-teal-800 hover:border-teal-600 inline-flex items-center gap-1"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    QR
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Table Detail Drawer */}
      {selectedTable && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-labelledby="table-drawer-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedTable(null);
          }}
        >
          <div
            ref={drawerRef}
            className="w-full sm:max-w-lg bg-white h-dvh overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-6"
          >
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200">
              <div className="min-w-0">
                <h2 id="table-drawer-title" className="text-lg font-bold text-slate-900">
                  Table {selectedTable.number} — {selectedTable.name}
                </h2>
                <p className="text-xs text-slate-500 break-words">
                  {selectedTable.section} · {selectedTable.capacity} seats · Token:{' '}
                  <span className="font-mono">{selectedTable.qrToken}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTable(null)}
                aria-label="Close table details"
                className="min-w-[44px] min-h-[44px] p-2 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Update Table Status</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['free', 'occupied', 'reserved', 'cleaning'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => handleStatusChange(selectedTable.id, status)}
                    className={`min-h-[44px] py-2 px-2 rounded-lg border text-xs font-semibold capitalize transition-colors ${
                      selectedTable.status === status
                        ? 'bg-teal-700 border-teal-700 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setQrTable(selectedTable)}
                className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                View / Download QR
              </button>
              <Link
                to={`/t/${selectedTable.qrToken}`}
                className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-teal-800 hover:bg-teal-50 inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Guest Menu
              </Link>
              <Link
                to={`/billing?tableId=${selectedTable.id}`}
                className="min-h-[44px] px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5" />
                Open Billing
              </Link>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Recent & Current Orders</h3>
              {!tableHistory ? (
                <p className="text-xs text-slate-500">Loading history...</p>
              ) : tableHistory.orders.length === 0 ? (
                <p className="text-xs text-slate-500">No orders recorded for this table yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {tableHistory.orders.slice(0, 10).map((ord) => (
                    <div key={ord.id} className="border border-slate-200 rounded-lg p-3.5 text-xs">
                      <div className="flex items-center justify-between font-semibold text-slate-900">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono">{ord.orderNumber}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                              getOrderSourceMeta(ord.source).className
                            }`}
                          >
                            {getOrderSourceMeta(ord.source).label}
                          </span>
                        </span>
                        <span>
                          {ORDER_STATUS_LABEL[ord.status]} ·{' '}
                          <span className="font-mono">{formatCurrency(ord.total)}</span>
                        </span>
                      </div>
                      <p className="text-slate-500 mt-0.5">{formatDateTime(ord.createdAt)}</p>
                      <p className="text-slate-700 mt-1.5">
                        {ord.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Table Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-table-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          <form
            ref={createModalRef}
            onSubmit={handleCreateTable}
            className="bg-white sm:border border-slate-200 sm:rounded-xl w-full h-dvh sm:h-auto sm:max-w-md p-6 space-y-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close modal"
                className="sm:order-last min-w-[44px] min-h-[44px] p-2 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 id="create-table-title" className="text-base font-bold text-slate-900">
                Add Dining Table
              </h2>
            </div>

            {createError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
              >
                {createError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="tbl-num" className="block text-xs font-medium text-slate-700 mb-1">
                  Table Number
                </label>
                <input
                  id="tbl-num"
                  type="number"
                  min={1}
                  required
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  placeholder="13"
                  className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="tbl-cap" className="block text-xs font-medium text-slate-700 mb-1">
                  Capacity
                </label>
                <input
                  id="tbl-cap"
                  type="number"
                  min={1}
                  max={24}
                  required
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="tbl-name" className="block text-xs font-medium text-slate-700 mb-1">
                Table Name
              </label>
              <input
                id="tbl-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Table 13 — Fireside Booth"
                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="tbl-section" className="block text-xs font-medium text-slate-700 mb-1">
                Section
              </label>
              <input
                id="tbl-section"
                type="text"
                required
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create Table & QR'}
              </button>
            </div>
          </form>
        </div>
      )}

      {qrTable && (
        <QrModal
          table={qrTable}
          restaurantName={config.restaurantName}
          canRotate={isAdmin}
          onRotate={handleRotateQr}
          onClose={() => setQrTable(null)}
        />
      )}

      {sheetOpen && (
        <QrSheetModal
          tables={tables}
          restaurantName={config.restaurantName}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </Layout>
  );
}
