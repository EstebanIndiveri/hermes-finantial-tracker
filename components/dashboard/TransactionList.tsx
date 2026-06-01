"use client";

import { useState, useMemo, useCallback, useEffect } from "react";

const PAGE_SIZE = 10;

interface Category {
  id: string;
  name: string;
  emoji: string;
  slug: string;
}

interface Transaction {
  id: string;
  amount_ars: number;
  merchant: string | null;
  date: string;
  created_at: number;
  is_exception: number;
  source: string;
  category?: Category;
}

interface Props {
  transactions: Transaction[];
  month: string;
}

interface FiltersState {
  search: string;
  categoryId: string;
  date: string;
}

const EMPTY_FILTERS: FiltersState = { search: "", categoryId: "", date: "" };

function useFilters(allTx: Transaction[]) {
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);

  const categories = useMemo(() => {
    const map = new Map<string, Category>();
    for (const tx of allTx) {
      if (tx.category && !map.has(tx.category.id)) map.set(tx.category.id, tx.category);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allTx]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allTx.filter(tx => {
      if (q) {
        const hay = [tx.merchant ?? "", tx.category?.name ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.categoryId && tx.category?.id !== filters.categoryId) return false;
      if (filters.date && tx.date !== filters.date) return false;
      return true;
    });
  }, [allTx, filters]);

  const hasFilters = !!(filters.search || filters.categoryId || filters.date);
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  return { filters, setFilters, categories, filtered, hasFilters, clearFilters };
}

function FiltersBar({
  filters,
  setFilters,
  categories,
  hasFilters,
  clearFilters,
  month,
  resultCount,
  totalCount,
}: {
  filters: FiltersState;
  setFilters: (f: FiltersState) => void;
  categories: Category[];
  hasFilters: boolean;
  clearFilters: () => void;
  month: string;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <>
      <div className="h-tx-filters">
        <div className="h-tx-filter-search">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-tx-search-icon">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            className="h-form-control h-tx-search-input"
            placeholder="Buscar por nombre o categoría…"
            value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <select
          className="h-form-control h-tx-filter-select"
          value={filters.categoryId}
          onChange={e => setFilters({ ...filters, categoryId: e.target.value })}
        >
          <option value="">Todas las categorías</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>
        <input
          type="date"
          className="h-form-control h-tx-filter-date"
          value={filters.date}
          onChange={e => setFilters({ ...filters, date: e.target.value })}
          max={`${month}-31`}
          min={`${month}-01`}
        />
        {hasFilters && (
          <button className="h-tx-clear-btn" onClick={clearFilters} title="Limpiar filtros">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>
      {hasFilters && (
        <div className="h-tx-filter-count">
          {resultCount === 0 ? "Sin resultados" : `${resultCount} de ${totalCount} movimiento${totalCount !== 1 ? "s" : ""}`}
        </div>
      )}
    </>
  );
}

function TxRow({
  tx,
  onDelete,
}: {
  tx: Transaction;
  onDelete: (tx: Transaction) => void;
}) {
  const name = tx.category?.name?.toLowerCase() ?? "";
  const iconBg = name.includes("super") ? "var(--haccent-soft)" : name.includes("verdu") ? "var(--hgreen-soft)" : "var(--hsurface2)";
  return (
    <div className="h-tx-item h-tx-item-deletable">
      <div className="h-tx-icon" style={{ background: iconBg }}>
        {tx.category?.emoji ?? "💸"}
      </div>
      <div className="h-tx-info">
        <div className="h-tx-name">{tx.merchant || tx.category?.name}</div>
        <div className="h-tx-meta">
          {tx.category?.name} · {new Date(tx.date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
          {tx.is_exception ? " · excepción" : ""}
          {tx.source === "telegram" ? " · 📱" : ""}
        </div>
      </div>
      <div className="h-tx-right">
        <div className="h-tx-amount">${tx.amount_ars.toLocaleString("es-AR")}</div>
        <button
          className="h-tx-delete-btn"
          onClick={() => onDelete(tx)}
          title="Eliminar movimiento"
          aria-label="Eliminar movimiento"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function DeleteModal({
  target,
  deleting,
  onConfirm,
  onCancel,
}: {
  target: Transaction;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="h-modal-overlay" onClick={() => !deleting && onCancel()}>
      <div className="h-modal" onClick={e => e.stopPropagation()}>
        <div className="h-modal-icon">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
          </svg>
        </div>
        <h3 className="h-modal-title">Eliminar movimiento</h3>
        <div className="h-modal-body">
          <div className="h-modal-tx-preview">
            <span className="h-modal-tx-emoji">{target.category?.emoji ?? "💸"}</span>
            <div>
              <div className="h-modal-tx-name">{target.merchant || target.category?.name}</div>
              <div className="h-modal-tx-amount">${target.amount_ars.toLocaleString("es-AR")}</div>
            </div>
          </div>
          <p className="h-modal-message">¿Confirmás que querés eliminar este movimiento? Esta acción no se puede deshacer.</p>
        </div>
        <div className="h-modal-actions">
          <button className="h-modal-btn-cancel" onClick={onCancel} disabled={deleting}>Cancelar</button>
          <button className="h-modal-btn-delete" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TransactionList({ transactions: initialTx, month }: Props) {
  const [txList, setTxList] = useState<Transaction[]>(initialTx);
  const [page, setPage] = useState(0);
  const [showAllModal, setShowAllModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { filters, setFilters, categories, filtered, hasFilters, clearFilters } = useFilters(txList);

  // Reset to page 0 whenever filters change
  useEffect(() => { setPage(0); }, [filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/transactions/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setTxList(prev => prev.filter(t => t.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err?.error ?? "No se pudo eliminar el movimiento.");
      }
    } catch {
      alert("Error de red al eliminar.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  // Close modal on Escape
  useEffect(() => {
    if (!showAllModal) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setShowAllModal(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAllModal]);

  return (
    <>
      <FiltersBar
        filters={filters}
        setFilters={setFilters}
        categories={categories}
        hasFilters={hasFilters}
        clearFilters={clearFilters}
        month={month}
        resultCount={filtered.length}
        totalCount={txList.length}
      />

      {/* Paginated list */}
      <div className="h-tx-list">
        {filtered.length === 0 ? (
          <div className="h-empty">
            {hasFilters ? "No hay movimientos con esos filtros." : "Sin movimientos este mes."}
          </div>
        ) : (
          paginated.map(tx => (
            <TxRow key={tx.id} tx={tx} onDelete={setDeleteTarget} />
          ))
        )}
      </div>

      {/* Pagination + Ver todos */}
      {filtered.length > 0 && (
        <div className="h-tx-pagination">
          <div className="h-tx-page-controls">
            <button
              className="h-tx-page-btn"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Página anterior"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
            </button>
            <span className="h-tx-page-info">
              {page + 1} / {totalPages}
              <span className="h-tx-page-total"> · {filtered.length} movimiento{filtered.length !== 1 ? "s" : ""}</span>
            </span>
            <button
              className="h-tx-page-btn"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Página siguiente"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
          </div>
          <button className="h-tx-ver-todos" onClick={() => setShowAllModal(true)}>
            Ver todos
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        </div>
      )}

      {/* Ver todos modal */}
      {showAllModal && (
        <AllTransactionsModal
          txList={txList}
          month={month}
          onDelete={(tx) => setDeleteTarget(tx)}
          onClose={() => setShowAllModal(false)}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteModal
          target={deleteTarget}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function AllTransactionsModal({
  txList,
  month,
  onDelete,
  onClose,
}: {
  txList: Transaction[];
  month: string;
  onDelete: (tx: Transaction) => void;
  onClose: () => void;
}) {
  const { filters, setFilters, categories, filtered, hasFilters, clearFilters } = useFilters(txList);
  const monthLabel = new Date(month + "-15").toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  return (
    <div className="h-modal-overlay h-modal-overlay-full" onClick={onClose}>
      <div className="h-modal h-modal-full" onClick={e => e.stopPropagation()}>
        <div className="h-modal-full-header">
          <div>
            <h3 className="h-modal-title" style={{ margin: 0 }}>Todos los movimientos</h3>
            <div style={{ fontSize: 12, color: "var(--htext3)", marginTop: 2 }}>{monthLabel}</div>
          </div>
          <button className="h-modal-close-btn" onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="h-modal-full-filters">
          <FiltersBar
            filters={filters}
            setFilters={setFilters}
            categories={categories}
            hasFilters={hasFilters}
            clearFilters={clearFilters}
            month={month}
            resultCount={filtered.length}
            totalCount={txList.length}
          />
        </div>

        <div className="h-modal-full-body">
          <div className="h-tx-list">
            {filtered.length === 0 ? (
              <div className="h-empty">
                {hasFilters ? "No hay movimientos con esos filtros." : "Sin movimientos este mes."}
              </div>
            ) : (
              filtered.map(tx => (
                <TxRow key={tx.id} tx={tx} onDelete={(t) => { onDelete(t); }} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
