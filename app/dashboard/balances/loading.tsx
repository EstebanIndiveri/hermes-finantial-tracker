import { Skel } from "@/components/ui/Skeleton";

export default function BalancesLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <Skel w={200} h={24} mb={8} />
          <Skel w={320} h={14} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Skel w={100} h={36} r={8} />
          <Skel w={110} h={36} r={8} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w={140} h={32} mb={8} />
          <Skel w={100} h={14} />
        </div>
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w={80} h={32} mb={8} />
          <Skel w={100} h={14} />
        </div>
      </div>

      {/* Two columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {/* Te deben column */}
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w={100} h={20} mb={16} />
          
          {/* Partner card skeleton */}
          <div style={{ padding: 16, background: "var(--hbg)", borderRadius: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Skel w={120} h={18} />
              <Skel w={80} h={18} />
            </div>
            <Skel w={140} h={14} mb={12} />
            <Skel w={90} h={14} />
          </div>
          
          {/* Second partner skeleton */}
          <div style={{ padding: 16, background: "var(--hbg)", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Skel w={100} h={18} />
              <Skel w={70} h={18} />
            </div>
            <Skel w={120} h={14} mb={12} />
            <Skel w={90} h={14} />
          </div>
        </div>

        {/* Debés column */}
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w={80} h={20} mb={16} />
          
          {/* Empty state skeleton */}
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <Skel w={140} h={18} mb={8} />
            <Skel w={200} h={14} />
          </div>
        </div>
      </div>
    </div>
  );
}
