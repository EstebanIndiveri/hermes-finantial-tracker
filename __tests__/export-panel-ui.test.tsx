import { renderToStaticMarkup } from "react-dom/server";
import { ExportPanel } from "@/components/dashboard/ExportPanel";

describe("ExportPanel", () => {
  it("renders the selected month and export buttons", () => {
    const markup = renderToStaticMarkup(<ExportPanel month="2026-05" />);

    expect(markup).toContain("Exportar mes");
    expect(markup).toContain('type="month"');
    expect(markup).toContain('value="2026-05"');
    expect(markup).toContain('max="2026-05"');
    expect(markup).toContain("CSV");
    expect(markup).toContain("Excel");
    expect(markup).toContain("Descargar CSV");
    expect(markup).toContain("Descargar Excel");
  });
});
