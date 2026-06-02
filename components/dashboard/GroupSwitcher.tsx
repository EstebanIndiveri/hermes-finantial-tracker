"use client";
import { useState, useEffect, useRef } from "react";

interface Group {
  group_id: string;
  role: "owner" | "admin" | "member";
  group: { id: string; name: string; owner_id: string };
}

interface GroupSwitcherProps {
  onGroupChange?: (groupId: string) => void;
}

async function switchActiveGroup(groupId: string) {
  await fetch("/api/groups/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: groupId }) });
  window.location.reload();
}

export function GroupSwitcher({ onGroupChange }: GroupSwitcherProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/groups").then(r => r.json()),
      fetch("/api/groups/active").then(r => r.json()),
    ])
      .then(([data, active]: [Group[], { group_id: string | null }]) => {
        setGroups(data);
        if (active?.group_id) {
          setActiveGroupId(active.group_id);
        } else if (data.length > 0) {
          setActiveGroupId(data[0].group_id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const activeGroup = groups.find(g => g.group_id === activeGroupId);
  const MAX_OWNED = 2;
  const ownedCount = groups.filter(g => g.role === "owner").length;

  if (groups.length === 0) return null;

  return (
    <div ref={ref} style={{ position: "relative", padding: "10px 12px", borderBottom: "1px solid var(--hborder)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "var(--haccent-bg)", border: "1px solid var(--hborder)",
          borderRadius: 8, padding: "8px 10px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, color: "var(--htext1)",
        }}
      >
        <span style={{ fontSize: "1.1rem" }}>🏠</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: "0.82rem", fontWeight: 600 }}>
          {activeGroup?.group.name ?? "Grupo"}
        </span>
        <span style={{ fontSize: "0.7rem", color: "var(--htext3)" }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% - 4px)", left: 8, right: 8, zIndex: 50,
          background: "var(--hsurface)", border: "1px solid var(--hborder)",
          borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 12px 4px", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--htext3)" }}>
            Mis grupos
          </div>
          {groups.map(g => (
            <button
              key={g.group_id}
              onClick={() => { setActiveGroupId(g.group_id); setOpen(false); switchActiveGroup(g.group_id); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", background: g.group_id === activeGroupId ? "var(--haccent-bg)" : "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{ fontSize: "0.85rem" }}>🏠</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--htext1)" }}>{g.group.name}</span>
                <span style={{ display: "block", fontSize: "0.7rem", color: "var(--htext3)" }}>{g.role} · miembros</span>
              </span>
              {g.group_id === activeGroupId && <span style={{ color: "var(--haccent)", fontSize: "0.75rem" }}>✓</span>}
            </button>
          ))}
          <div style={{ height: 1, background: "var(--hborder)", margin: "4px 0" }} />
          {ownedCount < MAX_OWNED ? (
            <button
              onClick={() => { setOpen(false); setShowCreateModal(true); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", background: "transparent", border: "none",
                cursor: "pointer", color: "var(--haccent)", fontSize: "0.82rem", fontWeight: 600,
              }}
            >
              ＋ Nuevo grupo ({ownedCount}/{MAX_OWNED})
            </button>
          ) : (
            <div style={{ padding: "9px 12px", fontSize: "0.75rem", color: "var(--htext3)" }}>
              Límite de {MAX_OWNED} grupos creados alcanzado
            </div>
          )}
        </div>
      )}

      {showCreateModal && <CreateGroupInline onClose={() => setShowCreateModal(false)} onCreated={(id) => { setActiveGroupId(id); switchActiveGroup(id); }} />}
    </div>
  );
}

function CreateGroupInline({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error al crear grupo"); return; }
      onCreated(data.id);
      onClose();
    } catch { setError("Error de red"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--hsurface)", border: "1px solid var(--hborder)", borderRadius: 12, padding: 24, width: 320 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Nuevo grupo</h3>
        <input
          autoFocus
          type="text"
          placeholder="Nombre del grupo (ej: Trabajo)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--hborder)", background: "var(--hbg)", color: "var(--htext1)", fontSize: "0.85rem", marginBottom: 8 }}
        />
        {error && <p style={{ color: "#f87171", fontSize: "0.78rem", margin: "0 0 8px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid var(--hborder)", background: "transparent", cursor: "pointer", color: "var(--htext2)", fontSize: "0.8rem" }}>Cancelar</button>
          <button onClick={handleCreate} disabled={loading || !name.trim()} style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.8rem" }}>
            {loading ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
