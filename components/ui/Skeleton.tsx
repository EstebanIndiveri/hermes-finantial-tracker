/** Thin shimmer block. Uses .h-skel CSS class from hermes.css */
export function Skel({ w, h, r, mb }: { w?: string | number; h?: string | number; r?: number; mb?: number }) {
  return (
    <span
      className="h-skel"
      style={{
        width: w ?? "100%",
        height: h ?? 16,
        borderRadius: r ?? 6,
        marginBottom: mb,
        display: "block",
      }}
    />
  );
}
