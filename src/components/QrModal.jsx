import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { Download, Printer, RefreshCw, X, Copy, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { getGuestQrUrl } from '../utils/format';
import { BrandLogo } from './BrandLogo';
import { useModalA11y } from '../utils/useModalA11y';

export function QrModal({ table, restaurantName, canRotate, onRotate, onClose }) {
  const qrWrapperRef = useRef(null);
  const modalRef = useRef(null);
  useModalA11y(true, onClose, modalRef);
  const guestUrl = getGuestQrUrl(table.qrToken);

  const handleDownloadPng = () => {
    const canvas = qrWrapperRef.current?.querySelector('canvas');
    if (!canvas) {
      toast.error('QR code is not ready yet.');
      return;
    }
    const pngUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `table-${table.number}-qr.png`;
    link.click();
    toast.success(`Downloaded PNG for Table ${table.number}`);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      toast.success('Guest menu link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white border border-slate-200 sm:rounded-xl w-full h-dvh sm:h-auto sm:max-h-[92dvh] sm:max-w-md shadow-xl overflow-y-auto flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 no-print">
          <div className="min-w-0">
            <h2 id="qr-modal-title" className="text-base font-semibold text-slate-900">
              Table {table.number} QR Code
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {table.name} · {table.section} · {table.capacity} seats
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR modal"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center">
          <BrandLogo size="lg" className="mb-2" />
          <p className="text-sm font-semibold text-slate-900 mb-1">{restaurantName}</p>
          <p className="text-xs text-slate-500 mb-5">
            Scan to view menu, order directly, or call your server
          </p>

          <div
            ref={qrWrapperRef}
            className="p-4 bg-white border border-slate-200 rounded-xl inline-flex items-center justify-center"
          >
            <QRCodeCanvas value={guestUrl} size={220} level="M" includeMargin />
          </div>

          <div className="mt-4 w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-slate-600 truncate">{guestUrl}</span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy guest menu URL"
              className="min-h-[44px] px-2 text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full no-print">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="min-h-[44px] px-4 py-2.5 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              Print Card
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between w-full pt-3 border-t border-slate-100 no-print">
            <Link
              to={`/t/${table.qrToken}`}
              className="min-h-[44px] text-xs font-medium text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Guest Menu
            </Link>
            {canRotate && (
              <button
                type="button"
                onClick={() => onRotate(table.id)}
                className="min-h-[44px] text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rotate Token
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function QrSheetModal({ tables, restaurantName, onClose }) {
  const sheetRef = useRef(null);
  useModalA11y(true, onClose, sheetRef);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs overflow-y-auto p-0 sm:p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-sheet-title"
    >
      <div
        ref={sheetRef}
        className="bg-white border border-slate-200 sm:rounded-xl max-w-5xl mx-auto min-h-dvh sm:min-h-0 shadow-xl overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-slate-200 no-print">
          <div className="min-w-0">
            <h2 id="qr-sheet-title" className="text-base sm:text-lg font-semibold text-slate-900">
              Printable Table QR Sheet
            </h2>
            <p className="text-xs text-slate-500">
              All {tables.length} dining tables ready for A4 print
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-teal-700 text-white text-xs sm:text-sm font-medium hover:bg-teal-800 inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              Print Sheet
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close QR sheet"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6 grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 qr-print-grid">
          {tables.map((t) => {
            const url = getGuestQrUrl(t.qrToken);
            return (
              <div
                key={t.id}
                className="border border-slate-200 rounded-xl p-5 flex flex-col items-center text-center break-inside-avoid"
              >
                <BrandLogo size="md" className="mb-1.5" />
                <span className="text-xs font-medium text-slate-500">{restaurantName}</span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">Table {t.number}</h3>
                <span className="text-xs text-slate-500 mb-3">
                  {t.section} · {t.capacity} seats
                </span>
                <QRCodeCanvas value={url} size={148} level="M" includeMargin />
                <span className="mt-2 text-[11px] font-mono text-slate-500">/t/{t.qrToken}</span>
                <Link
                  to={`/t/${t.qrToken}`}
                  className="mt-2 text-xs font-medium text-teal-700 hover:underline no-print"
                >
                  Open Menu
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
