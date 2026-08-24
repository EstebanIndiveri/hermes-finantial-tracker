import { Skel } from "@/components/ui/Skeleton";

/** Shown by Next.js while the dashboard server component fetches data */
export default function DashboardLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      {/* Month selector */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <Skel w={180} h={36} r={20} />
      </div>

      {/* Status card */}
      <div className="h-card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <Skel w={72} h={72} r={36} />
          <div style={{ flex: 1, minWidth: 120, display: "flex", flexDirection: "column", gap: 8 }}>
            <Skel w="40%" h={28} />
            <Skel w="60%" h={16} />
          </div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Skel w={60} h={12} />
                <Skel w={80} h={20} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="h-grid-2" style={{ marginBottom: 20 }}>
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w="50%" h={14} mb={16} />
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Skel w={160} h={160} r={80} />
          </div>
        </div>
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w="50%" h={14} mb={16} />
          <Skel w="100%" h={160} r={8} />
        </div>
      </div>

      {/* Budgets + expense form row */}
      <div className="h-grid-2" style={{ marginBottom: 20 }}>
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w="40%" h={14} mb={16} />
          {[0, 1, 2].map(i => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <Skel w="40%" h={13} />
                <Skel w={60} h={13} />
              </div>
              <Skel w="100%" h={8} r={4} />
            </div>
          ))}
        </div>
        <div className="h-card" style={{ padding: 20 }}>
          <Skel w="40%" h={14} mb={16} />
          <Skel w="100%" h={42} mb={12} r={8} />
          <Skel w="100%" h={42} mb={12} r={8} />
          <Skel w="100%" h={42} mb={16} r={8} />
          <Skel w="100%" h={44} r={8} />
        </div>
      </div>

      {/* Transactions */}
      <div className="h-card" style={{ padding: 20 }}>
        <Skel w="30%" h={14} mb={16} />
        <Skel w="100%" h={38} r={8} mb={16} />
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <Skel w={36} h={36} r={18} />
            <div style={{ flex: 1 }}>
              <Skel w="50%" h={13} mb={6} />
              <Skel w="30%" h={11} />
            </div>
            <Skel w={70} h={16} />
          </div>
        ))}
      </div>
    </div>
  );
}
