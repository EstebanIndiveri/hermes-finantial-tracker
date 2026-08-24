import { Skel } from "@/components/ui/Skeleton";

export default function HistorialLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Skel w={200} h={24} mb={8} />
        <Skel w={220} h={14} />
      </div>

      {/* Filters card */}
      <div className="h-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Skel w={16} h={16} r={4} />
          <Skel w={50} h={14} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <Skel w={50} h={12} mb={6} />
            <Skel w="100%" h={36} r={8} />
          </div>
          <div>
            <Skel w={40} h={12} mb={6} />
            <Skel w="100%" h={36} r={8} />
          </div>
          <div>
            <Skel w={60} h={12} mb={6} />
            <Skel w="100%" h={36} r={8} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Skel w={110} h={36} r={8} />
          <Skel w={80} h={36} r={8} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w={100} h={28} mb={6} />
          <Skel w={70} h={14} />
        </div>
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w={80} h={28} mb={6} />
          <Skel w={70} h={14} />
        </div>
      </div>

      {/* Payment list */}
      <div className="h-card" style={{ overflow: "hidden" }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "16px 20px",
              borderBottom: i < 4 ? "1px solid var(--hborder)" : "none",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 100 }}>
              <Skel w={100} h={14} mb={4} />
              <Skel w={60} h={12} />
            </div>
            <Skel w={80} h={16} />
            <Skel w={60} h={14} />
            <Skel w={50} h={14} />
            <Skel w={120} h={14} />
          </div>
        ))}
        
        {/* Pagination skeleton */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderTop: "1px solid var(--hborder)" }}>
          <Skel w={100} h={14} />
          <div style={{ display: "flex", gap: 8 }}>
            <Skel w={80} h={32} r={6} />
            <Skel w={80} h={32} r={6} />
          </div>
        </div>
      </div>
    </div>
  );
}
