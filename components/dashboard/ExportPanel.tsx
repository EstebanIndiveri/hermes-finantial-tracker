// components/dashboard/ExportPanel.tsx
"use client";

import { useState } from "react";

interface ExportPanelProps {
  month: string; // "YYYY-MM"
}

export function ExportPanel({ month }: ExportPanelProps) {
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [downloading, setDownloading] = useState<"csv" | "xlsx" | null>(null);

  function handleDownload(format: "csv" | "xlsx") {
    setDownloading(format);
    const url = `/api/export?month=${selectedMonth}&format=${format}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `hermes-${selectedMonth}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloading(null), 1500);
  }

  return (
    <div className="h-export-panel">
      <div className="h-export-row">
        <label className="h-export-label" htmlFor="export-month">
          Exportar mes
        </label>
        <input
          id="export-month"
          type="month"
          className="h-export-month-input"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          max={month}
        />
      </div>
      <div className="h-export-btns">
        <button
          className="h-export-btn"
          onClick={() => handleDownload("csv")}
          disabled={downloading !== null}
          aria-label="Descargar CSV"
        >
          {downloading === "csv" ? (
            <span className="h-export-spinner" aria-hidden="true" />
          ) : (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          )}
          CSV
        </button>
        <button
          className="h-export-btn h-export-btn-xl"
          onClick={() => handleDownload("xlsx")}
          disabled={downloading !== null}
          aria-label="Descargar Excel"
        >
          {downloading === "xlsx" ? (
            <span className="h-export-spinner" aria-hidden="true" />
          ) : (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          )}
          Excel
        </button>
      </div>
    </div>
  );
}
