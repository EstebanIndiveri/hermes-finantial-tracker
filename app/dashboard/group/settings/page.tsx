"use client";
import { useState, useEffect } from "react";
import { InviteModal } from "@/components/dashboard/InviteModal";
import GroupSettingsLoading from "./loading";

interface Member {
  group_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  user: { id: string; name: string };
}

interface Group {
  id: string;
  name: string;
  owner_id: string;
  partner_id: string | null;
  role: "owner" | "admin" | "member";
}

export default function GroupSettingsPage() {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [savingPartner, setSavingPartner] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const groupsRes = await fetch("/api/groups");
        const groups: Array<{ group_id: string; role: "owner" | "admin" | "member"; group: { id: string; name: string; owner_id: string; partner_id: string | null } }> = await groupsRes.json();
        if (groups.length === 0) return;
        const activeGroupData = groups[0];
        const activeGroup: Group = {
          id: activeGroupData.group_id,
          name: activeGroupData.group.name,
          owner_id: activeGroupData.group.owner_id,
          partner_id: activeGroupData.group.partner_id,
          role: activeGroupData.role,
        };
        setGroup(activeGroup);
        setEditName(activeGroup.name);
        setPartnerId(activeGroup.partner_id);

        const membersRes = await fetch(`/api/groups/${activeGroup.id}/members`);
        const membersData: Member[] = await membersRes.json();
        setMembers(membersData);
      } catch { setError("Error al cargar el grupo"); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function handleRename() {
    if (!group || !editName.trim()) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) { setGroup(g => g ? { ...g, name: editName.trim() } : g); setSuccess("Nombre actualizado"); }
      else { const d = await res.json(); setError(d.error ?? "Error"); }
    } catch { setError("Error de red"); }
    finally { setSavingName(false); }
  }

  async function handleChangeRole(userId: string, newRole: "admin" | "member") {
    if (!group) return;
    try {
      const res = await fetch(`/api/groups/${group.id}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) setMembers(ms => ms.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
      else { const d = await res.json(); setError(d.error ?? "Error"); }
    } catch { setError("Error de red"); }
  }

  async function handleRemoveMember(userId: string) {
    if (!group || !confirm("¿Remover este miembro del grupo?")) return;
    try {
      const res = await fetch(`/api/groups/${group.id}/members/${userId}`, { method: "DELETE" });
      if (res.ok) setMembers(ms => ms.filter(m => m.user_id !== userId));
      else { const d = await res.json(); setError(d.error ?? "Error"); }
    } catch { setError("Error de red"); }
  }

  async function handleSavePartner() {
    if (!group) return;
    setSavingPartner(true);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId }),
      });
      if (res.ok) {
        setGroup(g => g ? { ...g, partner_id: partnerId } : g);
        setSuccess("Partner actualizado");
      } else {
        const d = await res.json();
        setError(d.error ?? "Error");
      }
    } catch { setError("Error de red"); }
    finally { setSavingPartner(false); }
  }

  async function handleDeleteGroup() {
    if (!group || !confirm(`¿Eliminar el grupo "${group.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
      if (res.ok) window.location.href = "/dashboard";
      else { const d = await res.json(); setError(d.error ?? "Error"); }
    } catch { setError("Error de red"); }
  }

  if (loading) return <GroupSettingsLoading />;
  if (!group) return <div style={{ padding: 32, color: "var(--htext2)" }}>No tenés ningún grupo activo.</div>;

  const isOwner = group.role === "owner";
  const canManage = group.role === "owner" || group.role === "admin";

  return (
    <div style={{ maxWidth: 600, padding: "24px 20px" }}>
      <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 4 }}>Configuración del grupo</h1>
      <p style={{ color: "var(--htext3)", fontSize: "0.85rem", marginBottom: 28 }}>Grupo actual: {group.name}</p>

      {error && <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: "0.82rem" }}>{error}<button onClick={() => setError("")} style={{ marginLeft: 8, background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}>×</button></div>}
      {success && <div style={{ background: "#14532d", color: "#86efac", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: "0.82rem" }}>{success}<button onClick={() => setSuccess("")} style={{ marginLeft: 8, background: "none", border: "none", color: "#86efac", cursor: "pointer" }}>×</button></div>}

      {isOwner && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--htext3)", marginBottom: 10 }}>Nombre del grupo</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRename()}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--hborder)", background: "var(--hbg)", color: "var(--htext1)", fontSize: "0.85rem" }}
            />
            <button onClick={handleRename} disabled={savingName || !editName.trim()} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.8rem" }}>
              {savingName ? "..." : "Guardar"}
            </button>
          </div>
        </section>
      )}

      {canManage && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--htext3)", marginBottom: 10 }}>
            💰 Partner de reintegros
          </h2>
          <p style={{ fontSize: "0.78rem", color: "var(--htext2)", marginBottom: 12 }}>
            El partner es quien paga los reintegros cuando un miembro solicita uno. Si no hay partner, los reintegros quedan abiertos para que cualquier miembro los pague.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={partnerId ?? ""}
              onChange={e => setPartnerId(e.target.value || null)}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--hborder)", background: "var(--hbg)", color: "var(--htext1)", fontSize: "0.85rem" }}
            >
              <option value="">Sin partner (abierto)</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user?.name ?? m.user_id} {m.role === "owner" ? "(Owner)" : m.role === "admin" ? "(Admin)" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={handleSavePartner}
              disabled={savingPartner || partnerId === group.partner_id}
              style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--haccent)", color: "white", cursor: "pointer", fontSize: "0.8rem", opacity: partnerId === group.partner_id ? 0.5 : 1 }}
            >
              {savingPartner ? "..." : "Guardar"}
            </button>
          </div>
        </section>
      )}

      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--htext3)", margin: 0 }}>
            Miembros ({members.length})
          </h2>
          {canManage && (
            <button onClick={() => setShowInviteModal(true)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext1)", cursor: "pointer", fontSize: "0.78rem" }}>
              + Invitar
            </button>
          )}
        </div>
        {members.map(m => (
          <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--hborder)" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--haccent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white", fontSize: "0.85rem", flexShrink: 0 }}>
              {m.user?.name?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--htext1)" }}>{m.user?.name ?? m.user_id}</div>
            </div>
            <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: 4, fontWeight: 600, background: m.role === "owner" ? "#312e81" : m.role === "admin" ? "#14532d" : "var(--hborder)", color: m.role === "owner" ? "#c7d2fe" : m.role === "admin" ? "#86efac" : "var(--htext2)" }}>
              {m.role}
            </span>
            {isOwner && m.role !== "owner" && (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => handleChangeRole(m.user_id, m.role === "admin" ? "member" : "admin")} style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid var(--hborder)", background: "transparent", color: "var(--htext2)", cursor: "pointer", fontSize: "0.7rem" }}>
                  {m.role === "admin" ? "→ Member" : "→ Admin"}
                </button>
                <button onClick={() => handleRemoveMember(m.user_id)} style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid #7f1d1d", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: "0.7rem" }}>
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      {isOwner && (
        <section>
          <h2 style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#f87171", marginBottom: 10 }}>Zona de peligro</h2>
          <button onClick={handleDeleteGroup} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #7f1d1d", background: "transparent", color: "#f87171", cursor: "pointer", fontSize: "0.82rem" }}>
            Eliminar grupo &ldquo;{group.name}&rdquo;
          </button>
          <p style={{ fontSize: "0.72rem", color: "var(--htext3)", marginTop: 6 }}>Esta acción eliminará todos los datos del grupo y no se puede deshacer.</p>
        </section>
      )}

      {showInviteModal && <InviteModal groupId={group.id} onClose={() => setShowInviteModal(false)} />}
    </div>
  );
}
