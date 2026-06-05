import { Skel } from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <Skel w={120} h={26} mb={8} />
        <Skel w={260} h={13} />
      </div>

      {/* Configuración mensual */}
      <div className="h-card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <Skel w={200} h={14} mb={6} />
          <Skel w={160} h={12} />
        </div>
        <div className="h-form-grid" style={{ marginBottom: 16 }}>
          <div>
            <Skel w={140} h={12} mb={8} />
            <Skel w="100%" h={42} r={8} />
          </div>
          <div>
            <Skel w={160} h={12} mb={8} />
            <Skel w="100%" h={42} r={8} />
          </div>
        </div>
        <Skel w={160} h={38} r={8} />
      </div>

      {/* Semáforo */}
      <div className="h-card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <Skel w={180} h={14} mb={6} />
          <Skel w={220} h={12} />
        </div>
        <div className="h-form-grid" style={{ marginBottom: 16 }}>
          <div>
            <Skel w={130} h={12} mb={8} />
            <Skel w="100%" h={42} r={8} />
          </div>
          <div>
            <Skel w={140} h={12} mb={8} />
            <Skel w="100%" h={42} r={8} />
          </div>
        </div>
        <Skel w={150} h={38} r={8} />
      </div>

      {/* Presupuestos */}
      <div className="h-card" style={{ padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <Skel w={160} h={14} mb={6} />
          <Skel w={200} h={12} />
        </div>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px", gap: 12, padding: "8px 0", marginBottom: 8, borderBottom: "1px solid var(--hborder)" }}>
          <Skel w={80} h={11} />
          <Skel w={80} h={11} />
          <Skel w={80} h={11} />
        </div>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--hborder)", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Skel w={22} h={22} r={11} />
              <Skel w={100} h={13} />
            </div>
            <Skel w="100%" h={36} r={8} />
            <Skel w={60} h={26} r={6} />
          </div>
        ))}
        <div style={{ marginTop: 16 }}>
          <Skel w={160} h={38} r={8} />
        </div>
      </div>
    </div>
  );
}
