"use client";

import { useEffect, useState, useRef } from "react";
import CategoriesLoading from "./loading";
import { toast } from "sonner";

interface Category {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  is_active: number;
  sort_order: number;
  default_hard_limit: number;
}

interface EditState {
  name: string;
  emoji: string;
  sort_order: number;
  default_hard_limit: boolean;
  is_active: boolean;
}

const NEW_ROW_ID = "__new__";

function categoryToEdit(cat: Category): EditState {
  return {
    name: cat.name,
    emoji: cat.emoji,
    sort_order: cat.sort_order,
    default_hard_limit: cat.default_hard_limit === 1,
    is_active: cat.is_active === 1,
  };
}

export function CategoriesPageClient() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [noGroup, setNoGroup] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/categories?all=true")
      .then(r => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) { setNoGroup(true); setLoading(false); return; }
        setCats(data as Category[]);
        setLoading(false);
      })
      .catch(() => toast.error("Error al cargar categorías"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editingId) setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [editingId]);

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditState(categoryToEdit(cat));
    setConfirmDeleteId(null);
  }

  function startNew() {
    setEditingId(NEW_ROW_ID);
    setEditState({ name: "", emoji: "", sort_order: cats.length + 1, default_hard_limit: true, is_active: true });
    setConfirmDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState(null);
  }

  async function saveEdit() {
    if (!editState) return;
    const { name, emoji, sort_order, default_hard_limit, is_active } = editState;

    if (!name.trim()) { toast.error("El nombre es requerido."); return; }
    if (!emoji.trim()) { toast.error("El emoji es requerido."); return; }
    if (sort_order < 1 || sort_order > 99) { toast.error("El orden debe ser entre 1 y 99."); return; }

    setSaving(true);
    try {
      if (editingId === NEW_ROW_ID) {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), emoji: emoji.trim(), sort_order, default_hard_limit }),
        });
        if (res.status === 409) { toast.error("Ya existe una categoría con ese nombre."); return; }
        if (!res.ok) { toast.error("Error al crear categoría."); return; }
        const created: Category = await res.json();
        setCats(prev => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
        toast.success(`Categoría "${created.name}" creada ✅`);
      } else {
        const res = await fetch(`/api/categories/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), emoji: emoji.trim(), sort_order, default_hard_limit, is_active }),
        });
        if (!res.ok) { toast.error("Error al guardar."); return; }
        const updated: Category = await res.json();
        setCats(prev => prev.map(c => c.id === editingId ? updated : c).sort((a, b) => a.sort_order - b.sort_order));
        toast.success("Categoría guardada ✅");
      }
      cancelEdit();
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (res.status === 409) {
        const data = await res.json();
        toast.error(data.error ?? "No se puede eliminar.");
        setConfirmDeleteId(null);
        return;
      }
      if (!res.ok) { toast.error("Error al eliminar."); return; }
      setCats(prev => prev.filter(c => c.id !== id));
      toast.success("Categoría eliminada.");
      setConfirmDeleteId(null);
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <CategoriesLoading />;
  }

  if (noGroup) return (
    <div style={{ padding: "40px 20px", color: "var(--htext3)", fontFamily: "DM Sans, sans-serif", textAlign: "center" }}>
      <div style={{ fontSize: "2rem", marginBottom: 12 }}>🏠</div>
      <p>No estás en ningún grupo activo.</p>
      <p style={{ fontSize: "0.85rem", marginTop: 8 }}>Pedile al owner una invitación para unirte a un grupo.</p>
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 400, color: "var(--htext1)", margin: 0 }}>
          Categorías
        </h1>
        <button className="h-cat-edit-add-btn" onClick={startNew} disabled={editingId !== null}>
          + Nueva categoría
        </button>
      </div>

      <div className="h-card">
        <div className="h-card-body">
          <div className="h-cat-edit-list">
            {/* Header */}
            <div className="h-cat-edit-header">
              <span>Categoría</span>
              <span>Orden</span>
              <span>Límite default</span>
              <span>Estado</span>
              <span></span>
            </div>

            {/* Rows */}
            {cats.map(cat => (
              <div key={cat.id} className={`h-cat-edit-row${editingId === cat.id ? " editing" : ""}${cat.is_active === 0 ? " inactive" : ""}`}>
                {editingId === cat.id && editState ? (
                  <>
                    <div className="h-cat-edit-inputs">
                      <input
                        ref={nameInputRef}
                        className="h-cat-edit-input h-cat-edit-emoji"
                        value={editState.emoji}
                        onChange={e => setEditState(s => s ? { ...s, emoji: e.target.value } : s)}
                        maxLength={2}
                        placeholder="🏷️"
                        aria-label="Emoji"
                      />
                      <input
                        className="h-cat-edit-input h-cat-edit-name"
                        value={editState.name}
                        onChange={e => setEditState(s => s ? { ...s, name: e.target.value } : s)}
                        maxLength={40}
                        placeholder="Nombre"
                        aria-label="Nombre"
                      />
                    </div>
                    <input
                      className="h-cat-edit-input h-cat-edit-order"
                      type="number"
                      min={1}
                      max={99}
                      value={editState.sort_order}
                      onChange={e => setEditState(s => s ? { ...s, sort_order: Number(e.target.value) } : s)}
                      aria-label="Orden"
                    />
                    <label className="h-cat-edit-toggle">
                      <input
                        type="checkbox"
                        checked={editState.default_hard_limit}
                        onChange={e => setEditState(s => s ? { ...s, default_hard_limit: e.target.checked } : s)}
                        aria-label="Límite por defecto"
                      />
                      <span className="h-toggle-track"><span className="h-toggle-thumb" /></span>
                    </label>
                    <label className="h-cat-edit-toggle">
                      <input
                        type="checkbox"
                        checked={editState.is_active}
                        onChange={e => setEditState(s => s ? { ...s, is_active: e.target.checked } : s)}
                        aria-label="Activa"
                      />
                      <span className="h-toggle-track"><span className="h-toggle-thumb" /></span>
                    </label>
                    <div className="h-cat-edit-actions">
                      <button className="h-cat-edit-save" onClick={saveEdit} disabled={saving}>
                        {saving ? "..." : "Guardar"}
                      </button>
                      <button className="h-cat-edit-cancel" onClick={cancelEdit} disabled={saving}>
                        Cancelar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-cat-edit-name-cell">
                      <span className="h-cat-edit-emoji-cell">{cat.emoji}</span>
                      <span>{cat.name}</span>
                      {cat.is_active === 0 && <span className="h-cat-edit-inactive-badge">Inactiva</span>}
                    </div>
                    <span className="h-cat-edit-order-cell">{cat.sort_order}</span>
                    <span className={`h-cat-edit-limit-cell ${cat.default_hard_limit === 1 ? "on" : "off"}`}>
                      {cat.default_hard_limit === 1 ? "Sí" : "No"}
                    </span>
                    <span className={`h-cat-edit-status-cell ${cat.is_active === 1 ? "active" : "inactive"}`}>
                      {cat.is_active === 1 ? "Activa" : "Inactiva"}
                    </span>
                    <div className="h-cat-edit-row-actions">
                      {confirmDeleteId === cat.id ? (
                        <>
                          <span className="h-cat-edit-confirm-text">¿Eliminar?</span>
                          <button className="h-cat-edit-confirm-yes" onClick={() => confirmDelete(cat.id)} disabled={saving}>Sí</button>
                          <button className="h-cat-edit-confirm-no" onClick={() => setConfirmDeleteId(null)} disabled={saving}>No</button>
                        </>
                      ) : (
                        <>
                          <button
                            className="h-cat-edit-icon-btn"
                            onClick={() => startEdit(cat)}
                            disabled={editingId !== null}
                            aria-label={`Editar ${cat.name}`}
                          >
                            ✏️
                          </button>
                          <button
                            className="h-cat-edit-icon-btn delete"
                            onClick={() => setConfirmDeleteId(cat.id)}
                            disabled={editingId !== null}
                            aria-label={`Eliminar ${cat.name}`}
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* New row */}
            {editingId === NEW_ROW_ID && editState && (
              <div className="h-cat-edit-row editing new-row">
                <div className="h-cat-edit-inputs">
                  <input
                    ref={nameInputRef}
                    className="h-cat-edit-input h-cat-edit-emoji"
                    value={editState.emoji}
                    onChange={e => setEditState(s => s ? { ...s, emoji: e.target.value } : s)}
                    maxLength={2}
                    placeholder="🏷️"
                    aria-label="Emoji"
                  />
                  <input
                    className="h-cat-edit-input h-cat-edit-name"
                    value={editState.name}
                    onChange={e => setEditState(s => s ? { ...s, name: e.target.value } : s)}
                    maxLength={40}
                    placeholder="Nombre de la categoría"
                    aria-label="Nombre"
                  />
                </div>
                <input
                  className="h-cat-edit-input h-cat-edit-order"
                  type="number"
                  min={1}
                  max={99}
                  value={editState.sort_order}
                  onChange={e => setEditState(s => s ? { ...s, sort_order: Number(e.target.value) } : s)}
                  aria-label="Orden"
                />
                <label className="h-cat-edit-toggle">
                  <input
                    type="checkbox"
                    checked={editState.default_hard_limit}
                    onChange={e => setEditState(s => s ? { ...s, default_hard_limit: e.target.checked } : s)}
                    aria-label="Límite por defecto"
                  />
                  <span className="h-toggle-track"><span className="h-toggle-thumb" /></span>
                </label>
                <span />
                <div className="h-cat-edit-actions">
                  <button className="h-cat-edit-save" onClick={saveEdit} disabled={saving}>
                    {saving ? "..." : "Guardar"}
                  </button>
                  <button className="h-cat-edit-cancel" onClick={cancelEdit} disabled={saving}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {cats.length === 0 && editingId !== NEW_ROW_ID && (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--htext3)", fontSize: 14 }}>
                No hay categorías. Creá la primera.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
