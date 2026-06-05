import { Skel } from "@/components/ui/Skeleton";

export default function CategoriesLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <Skel w={160} h={26} mb={8} />
          <Skel w={220} h={13} />
        </div>
        <Skel w={140} h={38} r={8} />
      </div>

      <div className="h-card" style={{ overflow: "hidden" }}>
        {/* Header — hidden on mobile via .h-skel-cat-header */}
        <div className="h-skel-cat-header">
          {["CATEGORÍA", "ORDEN", "LÍMITE DEFAULT", "ESTADO", ""].map(col => (
            <span key={col} style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--htext3)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              {col}
            </span>
          ))}
        </div>
        {/* Rows — on mobile collapse to 1fr auto, hiding middle cols */}
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-skel-cat-row">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Skel w={28} h={28} r={14} />
              <Skel w={120} h={14} />
            </div>
            <div className="h-skel-cat-col-hide"><Skel w={30} h={14} /></div>
            <div className="h-skel-cat-col-hide"><Skel w={60} h={26} r={6} /></div>
            <div className="h-skel-cat-col-hide"><Skel w={60} h={26} r={6} /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <Skel w={28} h={28} r={6} />
              <Skel w={28} h={28} r={6} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
