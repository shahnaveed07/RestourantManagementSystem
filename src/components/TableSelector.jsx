import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, RefreshCw, AlertCircle, Check, Users } from 'lucide-react';
import { api } from '../api/client';
import { filterPublicTables } from '../utils/cart';

export function TableSelector({
  selectedTable,
  onSelect,
  refreshKey = 0,
  onInvalidSelected,
}) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');

  // Option B fallback state (numeric lookup)
  const [manualNumber, setManualNumber] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState(null);

  const loadTables = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await api.getPublicTables();
      const sorted = [...(list || [])].sort((a, b) => a.number - b.number);
      setTables(sorted);
      if (selectedTable?.id) {
        const fresh = sorted.find((t) => t.id === selectedTable.id);
        if (!fresh || fresh.status === 'reserved' || fresh.status === 'cleaning') {
          onInvalidSelected?.(
            fresh
              ? 'This table is not accepting orders right now.'
              : 'Selected table is no longer available.'
          );
        } else if (fresh.status !== selectedTable.status) {
          onSelect(fresh);
        }
      }
    } catch (err) {
      setLoadError(err.message || 'Unable to load dining tables right now.');
    } finally {
      setLoading(false);
    }
  }, [selectedTable?.id, selectedTable?.status, onInvalidSelected, onSelect]);

  useEffect(() => {
    loadTables();
  }, [loadTables, refreshKey]);

  const sections = useMemo(
    () => Array.from(new Set(tables.map((t) => t.section).filter(Boolean))),
    [tables]
  );

  const filteredTables = useMemo(
    () => filterPublicTables(tables, { search, section: sectionFilter }),
    [tables, search, sectionFilter]
  );

  const handleManualLookup = async (e) => {
    e.preventDefault();
    setLookupError(null);
    const num = Number(manualNumber);
    if (!Number.isInteger(num) || num < 1) {
      setLookupError('Enter a valid table number.');
      return;
    }
    setLookupBusy(true);
    try {
      const found = await api.lookupPublicTable(num);
      if (found.status === 'reserved' || found.status === 'cleaning') {
        setLookupError('Not available right now');
        return;
      }
      onSelect(found);
    } catch (err) {
      if (err.status === 404) {
        setLookupError('Table not found');
      } else {
        setLookupError(err.message || 'Unable to verify table.');
      }
    } finally {
      setLookupBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5" aria-label="Loading tables">
        {Array.from({ length: 12 }).map((_, idx) => (
          <div
            key={idx}
            className="h-24 rounded-xl bg-slate-100 border border-slate-200 animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Option B Fallback when table grid API fails
  if (loadError) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>Could not load table list ({loadError}). Enter your table number directly:</span>
          </div>
          <button
            type="button"
            onClick={loadTables}
            className="min-h-[36px] px-2.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-900 hover:bg-amber-100 inline-flex items-center gap-1 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>

        <form onSubmit={handleManualLookup} className="space-y-3">
          <label htmlFor="manual-table-number" className="block text-xs font-semibold text-slate-700">
            Table Number
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="manual-table-number"
              type="number"
              min={1}
              inputMode="numeric"
              value={manualNumber}
              onChange={(e) => {
                setManualNumber(e.target.value);
                setLookupError(null);
              }}
              placeholder="e.g. 4"
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 text-base sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <button
              type="submit"
              disabled={lookupBusy}
              className="min-h-[44px] px-5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              {lookupBusy ? 'Checking...' : 'Select Table'}
            </button>
          </div>
          {lookupError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {lookupError}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tables.length > 12 && (
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table number or section..."
              aria-label="Search tables"
              className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          {sections.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => setSectionFilter('all')}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  sectionFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All ({tables.length})
              </button>
              {sections.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setSectionFilter(sec)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap ${
                    sectionFilter === sec
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filteredTables.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
          No tables match your filter.
        </div>
      ) : (
        <div
          className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5"
          role="radiogroup"
          aria-label="Select dining table"
        >
          {filteredTables.map((t) => {
            const unavailable = t.status === 'reserved' || t.status === 'cleaning';
            const occupied = t.status === 'occupied';
            const isSelected = selectedTable?.id === t.id;

            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={unavailable}
                onClick={() => onSelect(t)}
                className={`relative min-h-[88px] p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                  unavailable
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                    : isSelected
                      ? 'bg-teal-50 border-teal-700 ring-2 ring-teal-600 text-slate-900 shadow-xs'
                      : occupied
                        ? 'bg-amber-50/40 border-amber-300 hover:border-teal-600 text-slate-900'
                        : 'bg-white border-slate-200 hover:border-teal-600 text-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-1 w-full">
                  <span className="text-sm font-bold font-mono leading-none">
                    Table {t.number}
                  </span>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-teal-700 text-white flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                <div className="mt-1.5 space-y-0.5">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Users className="w-3 h-3 shrink-0" />
                    <span>{t.capacity}</span>
                  </div>
                  <p
                    className={`text-[10px] font-semibold leading-tight ${
                      unavailable
                        ? 'text-slate-500'
                        : occupied
                          ? 'text-amber-800'
                          : 'text-emerald-700'
                    }`}
                  >
                    {unavailable
                      ? 'Not available right now'
                      : occupied
                        ? 'Occupied'
                        : 'Free'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedTable?.status === 'occupied' && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs font-medium text-amber-900">
          This table has an open order. Your order will be added to it.
        </div>
      )}
    </div>
  );
}
