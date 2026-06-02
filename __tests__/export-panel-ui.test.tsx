import fs from "node:fs";
import path from "node:path";
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

describe("export panel styles", () => {
  it("includes the export panel selectors and spinner animation", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "app/hermes.css"), "utf8");

    expect(css).toContain(".h-export-panel");
    expect(css).toContain(".h-export-month-input");
    expect(css).toContain(".h-export-btn-xl");
    expect(css).toContain("@keyframes h-spin");
  });
});

describe("dashboard export integration", () => {
  it("renders the export card from the dashboard page", () => {
    const pageSource = fs.readFileSync(path.join(process.cwd(), "app/dashboard/page.tsx"), "utf8");

    expect(pageSource).toContain('import { ExportPanel } from "@/components/dashboard/ExportPanel";');
    expect(pageSource).toContain("<h2 className=\"h-card-title\">Exportar movimientos</h2>");
    expect(pageSource).toContain("<ExportPanel month={month} />");
  });
});
