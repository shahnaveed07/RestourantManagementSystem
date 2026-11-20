import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { BellRing, Check, CheckCheck, AlertTriangle, Clock } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';
import {
  CALL_TYPE_LABEL,
  formatElapsed,
  formatTimeShort,
  getElapsedMinutes,
} from '../utils/format';

export function LiveCallsPage() {
  const { socket, syncVersion, callFlashActive } = useSocket();
  const [calls, setCalls] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const fetchCalls = useCallback(async () => {
    try {
      const list = await api.listCalls();
      setCalls(list);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls, syncVersion]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onCreated = (call) => {
      setCalls((prev) => (prev.some((c) => c.id === call.id) ? prev : [call, ...prev]));
    };
    const onUpdate = (call) => {
      setCalls((prev) => prev.map((c) => (c.id === call.id ? call : c)));
    };
    socket.on('call:created', onCreated);
    socket.on('call:acknowledged', onUpdate);
    socket.on('call:resolved', onUpdate);
    return () => {
      socket.off('call:created', onCreated);
      socket.off('call:acknowledged', onUpdate);
      socket.off('call:resolved', onUpdate);
    };
  }, [socket]);

  const handleAcknowledge = async (id) => {
    setBusyId(id);
    try {
      const updated = await api.acknowledgeCall(id);
      setCalls((prev) => prev.map((c) => (c.id === id ? updated : c)));
      toast.success(`Acknowledged Table ${updated.tableNumber}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleResolve = async (id) => {
    setBusyId(id);
    try {
      const updated = await api.resolveCall(id);
      setCalls((prev) => prev.map((c) => (c.id === id ? updated : c)));
      toast.success(`Resolved Table ${updated.tableNumber} request`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const activeCalls = calls
    .filter((c) => c.status !== 'resolved')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const resolvedCalls = calls.filter((c) => c.status === 'resolved');
  const shown = filter === 'active' ? activeCalls : resolvedCalls;

  return (
    <Layout
      title="Live Service Calls"
      subtitle="Calls open longer than 3 minutes are automatically flagged for immediate attention"
      actions={
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              filter === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Open ({activeCalls.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('resolved')}
            className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              filter === 'resolved' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Resolved ({resolvedCalls.length})
          </button>
        </div>
      }
    >
      {callFlashActive && (
        <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-300 text-sm text-red-900 font-medium flex items-center gap-2.5 animate-call-flash">
          <BellRing className="w-4 h-4 text-red-700 shrink-0" />
          New guest service call received — check the top of the queue below.
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-sm font-semibold text-slate-900">
            {filter === 'active' ? 'No open service calls' : 'No resolved calls yet'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Guest requests from table QR menus appear here instantly without refreshing.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((call) => {
            const elapsedMins = getElapsedMinutes(call.createdAt, nowMs);
            const overdue = call.status !== 'resolved' && elapsedMins >= 3;

            return (
              <article
                key={call.id}
                className={`bg-white border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  overdue ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 font-mono">
                      Table {call.tableNumber}
                    </h2>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-sm font-semibold text-teal-800">
                      {CALL_TYPE_LABEL[call.type]}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-xs text-slate-500">{call.tableName}</span>
                    {overdue && (
                      <>
                        <span className="text-slate-300" aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Overdue (&gt;3m)
                        </span>
                      </>
                    )}
                  </div>

                  <p className="text-sm text-slate-700">{call.message}</p>

                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 pt-1">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3.5 h-3.5" />
                      {call.status === 'resolved'
                        ? `Created ${formatTimeShort(call.createdAt)}`
                        : `Open ${formatElapsed(call.createdAt, nowMs)}`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize font-medium text-slate-700">{call.status}</span>
                    {call.acknowledgedByName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Handled by {call.acknowledgedByName}</span>
                      </>
                    )}
                  </div>
                </div>

                {call.status !== 'resolved' && (
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {call.status === 'open' && (
                      <button
                        type="button"
                        disabled={busyId === call.id}
                        onClick={() => handleAcknowledge(call.id)}
                        className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 sm:flex-initial"
                      >
                        <Check className="w-4 h-4" />
                        Acknowledge
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === call.id}
                      onClick={() => handleResolve(call.id)}
                      className="min-h-[44px] px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center justify-center gap-1.5 whitespace-nowrap flex-1 sm:flex-initial"
                    >
                      <CheckCheck className="w-4 h-4" />
                      Resolve
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
