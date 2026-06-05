import { Skel } from "@/components/ui/Skeleton";

export default function AccountLoading() {
  return (
    <div style={{ width: "100%", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <Skel w={140} h={26} mb={8} />
        <Skel w={220} h={13} />
      </div>

      {/* Mi cuenta card */}
      <div className="h-card" style={{ marginBottom: 16, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <Skel w={100} h={14} mb={8} />
            <Skel w={200} h={13} />
          </div>
          <Skel w={20} h={20} r={10} />
        </div>
      </div>

      {/* Conectar Telegram card */}
      <div className="h-card" style={{ padding: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <Skel w={160} h={14} mb={8} />
          <Skel w={240} h={13} />
        </div>
        <Skel w={200} h={38} r={8} />
      </div>
    </div>
  );
}
